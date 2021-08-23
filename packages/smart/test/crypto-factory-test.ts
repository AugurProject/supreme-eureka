import { deployments, ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";

import {
  AbstractMarketFactoryV2,
  AMMFactory,
  BPool__factory,
  Cash,
  CryptoMarketFactory,
  FeePot,
  CryptoFetcher,
  CryptoFetcher__factory,
  FakePriceFeed,
  OwnedERC20__factory,
} from "../typechain";
import {
  calcShareFactor,
  CryptoMarketType,
  fetchDynamicCrypto,
  fetchInitialCrypto,
  PRICE_FEEDS,
  NULL_ADDRESS,
  PRICE_FEEDS_BY_SYMBOL,
  priceFeed,
  RoundManagement,
  PriceFeed,
  repeat,
} from "../src";
import { calculateSellCompleteSetsWithValues } from "../src/bmath";
import { makePoolCheck, marketFactoryBundleCheck } from "./fetching";
import { randomPrice } from "../tasks";

const MAX_APPROVAL = BigNumber.from(2).pow(256).sub(1);

describe("CryptoFactory", function () {
  enum CoinIndex {
    None,
    BTC,
    ETH,
    // there are more but we aren't checking them
  }
  enum PriceUpDownOutcome {
    Above,
    NotAbove,
  }

  let signer: SignerWithAddress;

  const now = BigNumber.from(Date.now()).div(1000);
  const firstResolutionTime = now.add(60 * 60 * 24); // normally would be Friday 4pm PST but just do a day in the future
  const cadence = 60 * 60 * 24 * 7; // one week
  let nextResolutionTime = BigNumber.from(0);
  let currentRound: RoundManagement;

  const usdcBasis = BigNumber.from(10).pow(6);

  let collateral: Cash;
  let feePot: FeePot;
  let shareFactor: BigNumber;
  let marketFactory: CryptoMarketFactory;
  let ammFactory: AMMFactory;
  let ethPriceMarketId: BigNumber;
  let btcPriceMarketId: BigNumber;
  let ethPriceFeed: FakePriceFeed;
  let btcPriceFeed: FakePriceFeed;
  let ethPrice: number;
  let btcPrice: number;

  before("signer", async () => {
    [signer] = await ethers.getSigners();
  });

  before("deploy", async () => {
    await deployments.fixture();
  });

  before("price feeds", async () => {
    currentRound = new RoundManagement(2, 50);
    ethPriceFeed = (await ethers.getContract(PRICE_FEEDS_BY_SYMBOL["ETH"].deploymentName)) as FakePriceFeed;
    btcPriceFeed = (await ethers.getContract(PRICE_FEEDS_BY_SYMBOL["BTC"].deploymentName)) as FakePriceFeed;
  });

  before("other contracts", async () => {
    marketFactory = (await ethers.getContract("CryptoMarketFactory")) as CryptoMarketFactory;
    collateral = (await ethers.getContract("Collateral")) as Cash;
    feePot = (await ethers.getContract("FeePot")) as FeePot;
    shareFactor = calcShareFactor(await collateral.decimals());
    ammFactory = (await ethers.getContract("AMMFactory")) as AMMFactory;
  });

  it("is deployable", async () => {
    expect(await marketFactory.collateral()).to.equal(collateral.address);
    expect(await marketFactory.shareFactor()).to.equal(shareFactor);
    expect(await marketFactory.feePot()).to.equal(feePot.address);
    expect(await marketFactory.nextResolutionTime()).to.equal(nextResolutionTime);
  });

  it("Can add coins", async () => {
    const coins = await marketFactory.getCoins().then((coins) =>
      coins.map((coin) => ({
        name: coin.name,
        priceFeed: coin.priceFeed,
        price: coin.price,
        imprecision: coin.imprecision,
        currentMarkets: coin.currentMarkets,
      }))
    );

    // fake coin then each coin without markets or prices set
    expect(coins).to.deep.equal(
      await Promise.all([makePriceFeedCheck(priceFeed("", 0, 0))].concat(PRICE_FEEDS.map(makePriceFeedCheck)))
    );
  });

  it("no markets are created on setup", async () => {
    expect(await marketFactory.marketCount()).to.equal(1); // just the fake 0 index market
  });

  it("creates markets on first poke", async () => {
    nextResolutionTime = firstResolutionTime;
    ethPrice = 2400;
    btcPrice = 60000;
    await ethPriceFeed.addRound(currentRound.id, ethPrice * 1e8 - 1, 0, nextResolutionTime.sub(1), 0);
    await btcPriceFeed.addRound(currentRound.id, btcPrice * 1e8 - 1e7, 0, nextResolutionTime.sub(1), 0);
    // NOTE: this should take a gasLimit override because ganache mis-estimates but ganache also ignores the gasLimit override
    //       so instead hardhat.config.ts was edited to use a high limit
    const tx = await marketFactory.createAndResolveMarkets(
      [0 as BigNumberish].concat(repeat(currentRound.id, PRICE_FEEDS.length)),
      nextResolutionTime
    );
    console.log("MARINA", await tx.wait().then((r) => r.gasUsed));
  });

  it("CoinAdded logs are correct", async () => {
    // Adding coins creates markets so no need to make such calls here. Just verify that they worked.

    const filter = marketFactory.filters.CoinAdded(null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length, "number of logs").to.equal(PRICE_FEEDS.length);
    const [btcLog, ethLog] = logs.map((log) => log.args);

    // NOTE: these are actually coin indexes but the first markets have the same indexes as their coins
    [ethPriceMarketId] = ethLog;
    [btcPriceMarketId] = btcLog;
    expect(btcPriceMarketId, "btc market id").to.equal(1);
    expect(ethPriceMarketId, "eth market id").to.equal(2);

    const { id: coinIndex, name } = btcLog;
    expect(coinIndex, "coinIndex").to.equal(CoinIndex.BTC);
    expect(name, "name").to.equal("BTC");
  });

  it("can index CoinAdded by coin", async () => {
    const filter = marketFactory.filters.CoinAdded(CoinIndex.ETH, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length).to.equal(1);
    const [ethLog] = logs.map((log) => log.args);
    const [marketId] = ethLog;
    expect(marketId).to.equal(ethPriceMarketId);
  });

  it("BTC price market is correct", async () => {
    const market = await marketFactory.getMarket(btcPriceMarketId);
    const marketDetails = await marketFactory.getMarketDetails(btcPriceMarketId);
    const [above, notAbove] = market.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));

    expect(market.shareTokens.length).to.equal(2);
    expect(market.winner).to.equal(NULL_ADDRESS);
    expect(marketDetails.marketType).to.equal(CryptoMarketType.PriceUpTo);
    expect(marketDetails.coinIndex).to.equal(CoinIndex.BTC);
    expect(marketDetails.creationPrice).to.equal(btcPrice);
    expect(marketDetails.resolutionPrice).to.equal(0);

    expect(await above.symbol()).to.equal("Above");
    expect(await above.name()).to.equal("Above");
    expect(await notAbove.symbol()).to.equal("Not Above");
    expect(await notAbove.name()).to.equal("Not Above");
  });

  it("ETH price market is correct", async () => {
    const market = await marketFactory.getMarket(ethPriceMarketId);
    const marketDetails = await marketFactory.getMarketDetails(ethPriceMarketId);
    const [above, notAbove] = market.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));

    expect(market.shareTokens.length).to.equal(2);
    expect(market.winner).to.equal(NULL_ADDRESS);
    expect(marketDetails.marketType).to.equal(CryptoMarketType.PriceUpTo);
    expect(marketDetails.coinIndex).to.equal(CoinIndex.ETH);
    expect(marketDetails.creationPrice).to.equal(ethPrice);
    expect(marketDetails.resolutionPrice).to.equal(0);

    expect(await above.symbol()).to.equal("Above");
    expect(await above.name()).to.equal("Above");
    expect(await notAbove.symbol()).to.equal("Not Above");
    expect(await notAbove.name()).to.equal("Not Above");
  });

  it("can resolve and recreate markets", async () => {
    ethPrice = 2500;
    btcPrice = 55000;
    currentRound = currentRound.nextRound();
    await btcPriceFeed.addRound(currentRound.id, btcPrice * 1e8 - 2, 0, nextResolutionTime, 0);
    await ethPriceFeed.addRound(currentRound.id, ethPrice * 1e8 - 1e8 + 1, 0, nextResolutionTime, 0);
    await Promise.all(
      PRICE_FEEDS.slice(2).map(async (coin) => {
        const priceFeed = (await ethers.getContract(coin.deploymentName)) as FakePriceFeed;
        await priceFeed.addRound(currentRound.id, randomPrice(), 0, nextResolutionTime, 0);
      })
    );
    await network.provider.send("evm_setNextBlockTimestamp", [nextResolutionTime.toNumber()]);
    nextResolutionTime = nextResolutionTime.add(cadence);

    await marketFactory.createAndResolveMarkets(
      [0 as BigNumberish].concat(repeat(currentRound.id, PRICE_FEEDS.length)),
      nextResolutionTime
    );

    const ethPriceMarket = await marketFactory.getMarket(ethPriceMarketId);
    const ethPriceMarketDetails = await marketFactory.getMarketDetails(ethPriceMarketId);
    const btcPriceMarket = await marketFactory.getMarket(btcPriceMarketId);
    const btcPriceMarketDetails = await marketFactory.getMarketDetails(btcPriceMarketId);

    expect(ethPriceMarket.winner, "eth winner").to.equal(ethPriceMarket.shareTokens[PriceUpDownOutcome.Above]);
    expect(ethPriceMarketDetails.resolutionPrice, "eth resolution price").to.equal(249900000001);

    expect(btcPriceMarket.winner, "btc winner").to.equal(btcPriceMarket.shareTokens[PriceUpDownOutcome.NotAbove]);
    expect(btcPriceMarketDetails.resolutionPrice, "btc resolution price").to.equal(5499999999998);

    expect(nextResolutionTime, "resolution time").to.equal(await marketFactory.nextResolutionTime());
  });

  it("NewPrices log, by resolution time", async () => {
    const filter = marketFactory.filters.NewPrices(nextResolutionTime, null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length).to.equal(1);
    const [log] = logs;

    expect(log); // TODO
  });

  it("new ETH price market is correct", async () => {
    ethPriceMarketId = BigNumber.from(8); // 6 coins where ETH is the second; 2+6=8
    const market = await marketFactory.getMarket(ethPriceMarketId);
    const marketDetails = await marketFactory.getMarketDetails(ethPriceMarketId);
    const [above, notAbove] = market.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));

    const ethCoin = await marketFactory.getCoin(CoinIndex.ETH);
    expect(ethCoin.currentMarkets[0], "ethcoin market 0").to.equal(ethPriceMarketId);

    expect(market.winner, "winner").to.equal(NULL_ADDRESS);
    expect(marketDetails.marketType).to.equal(CryptoMarketType.PriceUpTo);
    expect(marketDetails.coinIndex).to.equal(CoinIndex.ETH);
    expect(marketDetails.creationPrice).to.equal(ethPrice);
    expect(marketDetails.resolutionPrice).to.equal(0);

    expect(await above.symbol()).to.equal("Above");
    expect(await above.name()).to.equal("Above");
    expect(await notAbove.symbol()).to.equal("Not Above");
    expect(await notAbove.name()).to.equal("Not Above");
  });

  it("can create pool", async () => {
    const initialLiquidity = usdcBasis.mul(1000); // 1000 of the collateral
    await collateral.faucet(initialLiquidity);
    await collateral.approve(ammFactory.address, initialLiquidity);

    await ammFactory.createPool(marketFactory.address, ethPriceMarketId, initialLiquidity, signer.address);
  });

  it("can buy shares", async () => {
    const collateralIn = usdcBasis.mul(10);
    await collateral.faucet(collateralIn);
    await collateral.approve(ammFactory.address, collateralIn);
    await ammFactory.buy(marketFactory.address, ethPriceMarketId, PriceUpDownOutcome.Above, collateralIn, 0);
  });

  it("can sell shares", async () => {
    const setsInForCollateral = await marketFactory.calcShares(usdcBasis.mul(5));
    const [tokenAmountOut, shareTokensIn] = await calculateSellCompleteSetsWithValues(
      ammFactory,
      (marketFactory as unknown) as AbstractMarketFactoryV2,
      ethPriceMarketId.toString(),
      PriceUpDownOutcome.Above,
      setsInForCollateral.toString()
    );

    await Promise.all(
      await marketFactory
        .getMarket(ethPriceMarketId)
        .then((market) => market.shareTokens)
        .then((addresses) => addresses.map((address) => OwnedERC20__factory.connect(address, signer)))
        .then((shareTokens) => shareTokens.map((shareToken) => shareToken.approve(ammFactory.address, MAX_APPROVAL)))
    );

    await ammFactory.sellForCollateral(
      marketFactory.address,
      ethPriceMarketId,
      PriceUpDownOutcome.Above,
      shareTokensIn,
      tokenAmountOut
    );
  });

  it("can add liquidity", async () => {
    const collateralIn = usdcBasis.mul(10);
    await collateral.faucet(collateralIn);
    await collateral.approve(ammFactory.address, collateralIn);
    await ammFactory.addLiquidity(marketFactory.address, ethPriceMarketId, collateralIn, 0, signer.address);
  });

  it("can remove liquidity", async () => {
    const collateralIn = usdcBasis.mul(10);
    await collateral.faucet(collateralIn);
    await collateral.approve(ammFactory.address, collateralIn);
    const lpTokensIn = await ammFactory.getPoolTokenBalance(marketFactory.address, ethPriceMarketId, signer.address);
    const pool = await ammFactory
      .getPool(marketFactory.address, ethPriceMarketId)
      .then((address) => BPool__factory.connect(address, signer));
    await pool.approve(ammFactory.address, lpTokensIn);
    await ammFactory.removeLiquidity(marketFactory.address, ethPriceMarketId, lpTokensIn, 0, signer.address);
  });

  it("won't resolve if the given round isn't the earliest after nextResolutionTime", async () => {
    ethPrice = 2500;
    btcPrice = 55000;

    // Current state:
    // * nextResolutionTime is a day ahead of the current blocktime
    // * the current markets resolve at nextResolutionTime
    // * currentRound is the round of the current markets

    currentRound = currentRound.nextRound();
    await btcPriceFeed.addRound(currentRound.id, btcPrice * 1e8, 0, nextResolutionTime, 0);
    await ethPriceFeed.addRound(currentRound.id, ethPrice * 1e8, 0, nextResolutionTime, 0);
    await Promise.all(
      PRICE_FEEDS.slice(2).map(async (coin) => {
        const priceFeed = (await ethers.getContract(coin.deploymentName)) as FakePriceFeed;
        await priceFeed.addRound(currentRound.id, randomPrice(), 0, nextResolutionTime, 0);
      })
    );

    // Current state:
    // * currentRound is 1 round ahead of the current markets

    currentRound = currentRound.nextRound();
    await btcPriceFeed.addRound(currentRound.id, btcPrice * 1e8, 0, nextResolutionTime.add(1), 0);
    await ethPriceFeed.addRound(currentRound.id, ethPrice * 1e8, 0, nextResolutionTime.add(1), 0);
    await Promise.all(
      PRICE_FEEDS.slice(2).map(async (coin) => {
        const priceFeed = (await ethers.getContract(coin.deploymentName)) as FakePriceFeed;
        await priceFeed.addRound(currentRound.id, randomPrice(), 0, nextResolutionTime.add(1), 0);
      })
    );

    // Current state:
    // * currentRound is 2 rounds ahead of the current markets

    await network.provider.send("evm_setNextBlockTimestamp", [nextResolutionTime.toNumber()]);

    // Current state:
    // * nextResolutionTime is at the current block time
    // * the current markets resolve at nextResolutionTime

    nextResolutionTime = nextResolutionTime.add(cadence);

    // Current state:
    // * nextResolutionTime is a day ahead of the current blocktime
    // * the current markets resolve a day before nextResolutionTime

    await expect(
      marketFactory.createAndResolveMarkets(
        [0 as BigNumberish].concat(repeat(currentRound.id, PRICE_FEEDS.length)),
        nextResolutionTime
      )
    ).to.eventually.be.rejectedWith(
      "VM Exception while processing transaction: revert Must use first round after resolution time"
    );
  });

  it("can resolve without creating", async () => {
    // Current state:
    // * nextResolutionTime is a day ahead of the current blocktime
    // * the current markets resolve a day before nextResolutionTime
    // * currentRound is 2 rounds ahead of the current markets

    expect(await marketFactory.marketCount(), "market count before final resolution").to.equal(13); // 1 + 6 + 6

    // it's the final resolution because the nextResolutionTime is set to zero
    await marketFactory.createAndResolveMarkets(
      [0 as BigNumberish].concat(repeat(currentRound.prevRound().id, PRICE_FEEDS.length)),
      0
    );

    expect(await marketFactory.marketCount(), "market count after final resolution").to.equal(13);
  });

  it("can start up again after stopping", async () => {
    ethPrice = 2500;
    btcPrice = 55000;
    currentRound = currentRound.nextRound();
    await btcPriceFeed.addRound(currentRound.id, btcPrice * 1e8, 0, nextResolutionTime, 0);
    await ethPriceFeed.addRound(currentRound.id, ethPrice * 1e8, 0, nextResolutionTime, 0);
    await Promise.all(
      PRICE_FEEDS.slice(2).map(async (coin) => {
        const priceFeed = (await ethers.getContract(coin.deploymentName)) as FakePriceFeed;
        await priceFeed.addRound(currentRound.id, randomPrice(), 0, nextResolutionTime, 0);
      })
    );
    await network.provider.send("evm_setNextBlockTimestamp", [nextResolutionTime.toNumber()]);

    await marketFactory.createAndResolveMarkets(
      [0 as BigNumberish].concat(repeat(currentRound.id, PRICE_FEEDS.length)),
      nextResolutionTime
    );

    expect(await marketFactory.marketCount(), "market count after resolution").to.equal(19); // 1 + 6 + 6 + 6
  });

  let fetcher: CryptoFetcher;

  it("fetcher deploys", async () => {
    fetcher = await new CryptoFetcher__factory(signer).deploy();

    expect(await fetcher.marketType()).to.equal("Crypto");
    expect(await fetcher.version()).to.be.a("string");
  });

  [
    { offset: 0, bundle: 50, ids: [18, 17, 16, 15, 14, 13, 8] }, // open markets + market with winning shares
    { offset: 1, bundle: 50, ids: [17, 16, 15, 14, 13, 8] },
    { offset: 0, bundle: 1, ids: [18, 17, 16, 15, 14, 13, 8] },
    { offset: PRICE_FEEDS.length, bundle: 50, ids: [8] }, // skip all open markets
  ].forEach(({ offset, bundle, ids }) => {
    it(`fetcher initial {offset=${offset},bundle=${bundle}}`, async () => {
      const { factoryBundle, markets } = await fetchInitialCrypto(fetcher, marketFactory, ammFactory, offset, bundle);
      expect(factoryBundle, "factory bundle").to.deep.equal(await marketFactoryBundleCheck(marketFactory));

      expect(markets, "market bundles").to.deep.equal(
        await Promise.all(ids.map((id) => marketStaticBundleCheck(marketFactory, ammFactory, id)))
      );
    });

    it(`fetcher dynamic {offset=${offset},bundle=${bundle}}`, async () => {
      const { markets } = await fetchDynamicCrypto(fetcher, marketFactory, ammFactory, offset, bundle);

      expect(markets, "market bundles").to.deep.equal(
        await Promise.all(ids.map((id) => marketDynamicBundleCheck(marketFactory, ammFactory, id)))
      );
    });
  });
});

async function marketStaticBundleCheck(
  marketFactory: CryptoMarketFactory,
  ammFactory: AMMFactory,
  marketId: BigNumberish
) {
  const market = await marketFactory.getMarket(marketId);
  const marketDetails = await marketFactory.getMarketDetails(marketId);
  return {
    // for all market factories
    factory: marketFactory.address,
    marketId: BigNumber.from(marketId),
    pool: await makePoolCheck(ammFactory, marketFactory, marketId),
    shareTokens: market.shareTokens,
    creationTimestamp: market.creationTimestamp,
    winner: market.winner,
    initialOdds: market.initialOdds,

    // for the crypto market factory
    marketType: marketDetails.marketType,
    coinIndex: marketDetails.coinIndex,
    creationPrice: marketDetails.creationPrice,
    resolutionPrice: marketDetails.resolutionPrice,
    resolutionTime: marketDetails.resolutionTime,
  };
}

<<<<<<< HEAD
async function marketDynamicBundleCheck(
  marketFactory: CryptoMarketFactory,
  ammFactory: AMMFactory,
  marketId: BigNumberish
) {
  const market = await marketFactory.getMarket(marketId);
  const marketDetails = await marketFactory.getMarketDetails(marketId);
  return {
    // for all market factories
    factory: marketFactory.address,
    marketId: BigNumber.from(marketId),
    pool: await makePoolCheck(ammFactory, marketFactory, marketId),
    winner: market.winner,

    // for the crypto market factory
    resolutionPrice: marketDetails.resolutionPrice,
  };
}

async function makePriceFeedCheck(coin: PriceFeed) {
  const contract = await ethers.getContractOrNull(coin.deploymentName);
  const priceFeed = contract ? contract.address : NULL_ADDRESS;

  return {
    currentMarkets: [BigNumber.from(0)],
    price: BigNumber.from(0),
    name: coin.symbol,
    imprecision: coin.imprecision,
    priceFeed,
  };
}
=======
>>>>>>> Remove deployConfig more
