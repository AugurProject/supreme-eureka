import { deployments, ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { smockit } from "@eth-optimism/smock";
import { BigNumber, BigNumberish } from "ethers";

import {
  AbstractMarketFactoryV2,
  AggregatorV3Interface,
  AMMFactory,
  BPool__factory,
  Cash,
  CryptoMarketFactory,
  CryptoMarketFactory__factory,
  FeePot,
  OwnedERC20__factory,
} from "../typechain";
import feedABI from "../abi/@chainlink/contracts/src/v0.7/interfaces/AggregatorV3Interface.sol/AggregatorV3Interface.json";
import { calcShareFactor, CryptoMarketType, NULL_ADDRESS } from "../src";
import { calculateSellCompleteSetsWithValues } from "../src/bmath";

const MAX_APPROVAL = BigNumber.from(2).pow(256).sub(1);

describe("CryptoFactory", () => {
  enum CoinIndex {
    None,
    ETH,
    BTC,
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

  const smallFee = BigNumber.from(10).pow(16);
  const usdcBasis = BigNumber.from(10).pow(6);

  let collateral: Cash;
  let feePot: FeePot;
  let shareFactor: BigNumber;
  let marketFactory: CryptoMarketFactory;
  let ammFactory: AMMFactory;
  let ethPriceMarketId: BigNumber;
  let btcPriceMarketId: BigNumber;
  let ethPriceFeed: FeedManagement;
  let btcPriceFeed: FeedManagement;
  let ethPrice: number;
  let btcPrice: number;

  before("signer", async () => {
    [signer] = await ethers.getSigners();
  });

  before("price feeds", async () => {
    currentRound = new RoundManagement(2, 50);
    ethPriceFeed = new FeedManagement(await smockit(feedABI));
    btcPriceFeed = new FeedManagement(await smockit(feedABI));
  });

  before("other contracts", async () => {
    await deployments.fixture();

    collateral = (await ethers.getContract("Collateral")) as Cash;
    feePot = (await ethers.getContract("FeePot")) as FeePot;
    shareFactor = calcShareFactor(await collateral.decimals());
    ammFactory = (await ethers.getContract("AMMFactory")) as AMMFactory;
  });

  it("is deployable", async () => {
    const owner = signer.address;
    const protocol = signer.address;
    const linkNode = signer.address;
    const stakerFee = smallFee;
    const settlementFee = smallFee;
    const protocolFee = smallFee;
    marketFactory = await new CryptoMarketFactory__factory(signer).deploy(
      owner,
      collateral.address,
      shareFactor,
      feePot.address,
      stakerFee,
      settlementFee,
      protocol,
      protocolFee,
      linkNode
    );

    expect(await marketFactory.getOwner()).to.equal(owner);
    expect(await marketFactory.collateral()).to.equal(collateral.address);
    expect(await marketFactory.shareFactor()).to.equal(shareFactor);
    expect(await marketFactory.feePot()).to.equal(feePot.address);
    expect(await marketFactory.stakerFee()).to.equal(stakerFee);
    expect(await marketFactory.settlementFee()).to.equal(settlementFee);
    expect(await marketFactory.protocol()).to.equal(protocol);
    expect(await marketFactory.protocolFee()).to.equal(protocolFee);
    expect(await marketFactory.linkNode()).to.equal(linkNode);
    expect(await marketFactory.nextResolutionTime()).to.equal(nextResolutionTime);
  });

  it("Can add a coin", async () => {
    await marketFactory.addCoin("ETH", ethPriceFeed.address, 0);
  });

  it("Can add a second coin", async () => {
    await marketFactory.addCoin("BTC", btcPriceFeed.address, 0);
  });

  it("no markets are created when coins are added", async () => {
    expect(await marketFactory.marketCount()).to.equal(1); // just the fake 0 index market
  });

  it("creates markets on first poke", async () => {
    nextResolutionTime = firstResolutionTime;
    ethPrice = 2400;
    btcPrice = 60000;
    ethPriceFeed.setRoundData(currentRound.id, ethPrice * 1e8 - 1, nextResolutionTime.sub(1));
    btcPriceFeed.setRoundData(currentRound.id, btcPrice * 1e8 - 1e7, nextResolutionTime.sub(1));

    await marketFactory.createAndResolveMarkets([0, currentRound.id, currentRound.id], nextResolutionTime);
  });

  it("MarketCreated logs are correct", async () => {
    // Adding coins creates markets so no need to make such calls here. Just verify that they worked.

    const filter = marketFactory.filters.MarketCreated(null, null, null, null, null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length, "number of logs").to.equal(2);
    const [ethLog, btcLog] = logs.map((log) => log.args);

    [ethPriceMarketId] = ethLog;
    [btcPriceMarketId] = btcLog;

    expect(ethPriceMarketId, "eth market id").to.equal(1);
    expect(btcPriceMarketId, "btc market id").to.equal(2);

    const { creator, endTime, marketType, coinIndex, price } = ethLog;
    expect(creator, "creator").to.equal(signer.address);
    expect(endTime, "endTime").to.equal(nextResolutionTime);
    expect(marketType, "marketType").to.equal(CryptoMarketType.PriceUpTo);
    expect(coinIndex, "coinIndex").to.equal(CoinIndex.ETH);
    expect(price, "price").to.equal(ethPrice);
  });

  it("can index MarketCreated by coin", async () => {
    const filter = marketFactory.filters.MarketCreated(null, null, null, null, CoinIndex.ETH, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length).to.equal(1);
    const [ethLog] = logs.map((log) => log.args);
    const [marketId] = ethLog;
    expect(marketId).to.equal(ethPriceMarketId);
  });

  it("can index MarketCreated by resolution time", async () => {
    const filter = marketFactory.filters.MarketCreated(null, null, nextResolutionTime, null, null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length).to.equal(2);
  });

  it("Coins data structure is correct", async () => {
    const ethCoin = await marketFactory.getCoin(CoinIndex.ETH);
    const btcCoin = await marketFactory.getCoin(CoinIndex.BTC);
    const coins = await marketFactory.getCoins();

    expect(coins.length).to.equal(3);
    expect(JSON.stringify(coins[CoinIndex.ETH])).to.equal(JSON.stringify(ethCoin));
    expect(JSON.stringify(coins[CoinIndex.BTC])).to.equal(JSON.stringify(btcCoin));

    expect(ethCoin.name).to.equal("ETH");
    expect(ethCoin.price.toNumber()).to.equal(ethPrice);
    expect(ethCoin.priceFeed).to.equal(ethPriceFeed.address);
    expect(ethCoin.currentMarkets.length).to.equal(1);
    expect(ethCoin.currentMarkets[0].toNumber()).to.equal(ethPriceMarketId);

    expect(btcCoin.name).to.equal("BTC");
    expect(btcCoin.price.toNumber()).to.equal(btcPrice);
    expect(btcCoin.priceFeed).to.equal(btcPriceFeed.address);
    expect(btcCoin.currentMarkets.length).to.equal(1);
    expect(btcCoin.currentMarkets[0].toNumber()).to.equal(btcPriceMarketId);
  });

  it("ETH price market is correct", async () => {
    const market = await marketFactory.getMarket(ethPriceMarketId);
    const marketDetails = await marketFactory.getMarketDetails(ethPriceMarketId);
    const [above, notAbove] = market.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));

    expect(market.shareTokens.length).to.equal(2);
    expect(market.endTime).to.equal(nextResolutionTime);
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

  it("BTC price market is correct", async () => {
    const market = await marketFactory.getMarket(btcPriceMarketId);
    const marketDetails = await marketFactory.getMarketDetails(btcPriceMarketId);
    const [above, notAbove] = market.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));

    expect(market.shareTokens.length).to.equal(2);
    expect(market.endTime).to.equal(nextResolutionTime);
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

  it("can resolve and recreate markets", async () => {
    ethPrice = 2500;
    btcPrice = 55000;
    currentRound = currentRound.nextRound();
    ethPriceFeed.setRoundData(currentRound.id, ethPrice * 1e8 - 1e8 + 1, nextResolutionTime);
    btcPriceFeed.setRoundData(currentRound.id, btcPrice * 1e8 - 2, nextResolutionTime);
    await network.provider.send("evm_setNextBlockTimestamp", [nextResolutionTime.toNumber()]);
    nextResolutionTime = nextResolutionTime.add(cadence);

    await marketFactory.createAndResolveMarkets([0, currentRound.id, currentRound.id], nextResolutionTime);

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

  it("new ETH price market is correct", async () => {
    ethPriceMarketId = BigNumber.from(3);
    const market = await marketFactory.getMarket(ethPriceMarketId);
    const marketDetails = await marketFactory.getMarketDetails(ethPriceMarketId);
    const [above, notAbove] = market.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));

    const ethCoin = await marketFactory.getCoin(CoinIndex.ETH);
    expect(ethCoin.currentMarkets[0], "ethcoin market 0").to.equal(ethPriceMarketId);

    expect(market.endTime, "endTime").to.equal(nextResolutionTime);
    expect(market.winner, "winner").to.equal(NULL_ADDRESS);
    expect(marketDetails.marketType, "marketType").to.equal(CryptoMarketType.PriceUpTo);
    expect(marketDetails.coinIndex, "coinIndex").to.equal(CoinIndex.ETH);
    expect(marketDetails.creationPrice, "creationPrice").to.equal(ethPrice);
    expect(marketDetails.resolutionPrice, "resolutionPrice").to.equal(0);

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
    const lpTokensIn = await ammFactory.getTokenBalance(
      marketFactory.address,
      ethPriceMarketId.toString(),
      signer.address
    );
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
    ethPriceFeed.setRoundData(currentRound.id, ethPrice * 1e8, nextResolutionTime);
    btcPriceFeed.setRoundData(currentRound.id, btcPrice * 1e8, nextResolutionTime);

    // Current state:
    // * currentRound is 1 round ahead of the current markets

    currentRound = currentRound.nextRound();
    ethPriceFeed.setRoundData(currentRound.id, ethPrice * 1e8, nextResolutionTime.add(1));
    btcPriceFeed.setRoundData(currentRound.id, btcPrice * 1e8, nextResolutionTime.add(1));

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
      marketFactory.createAndResolveMarkets([0, currentRound.id, currentRound.id], nextResolutionTime)
    ).to.eventually.be.rejectedWith(
      "VM Exception while processing transaction: revert Must use first round after resolution time"
    );
  });

  it("can resolve without creating", async () => {
    // Current state:
    // * nextResolutionTime is a day ahead of the current blocktime
    // * the current markets resolve a day before nextResolutionTime
    // * currentRound is 2 rounds ahead of the current markets

    expect(await marketFactory.marketCount(), "market count before final resolution").to.equal(5);

    // it's the final resolution because the nextResolutionTime is set to zero
    await marketFactory.createAndResolveMarkets([0, currentRound.prevRound().id, currentRound.prevRound().id], 0);

    expect(await marketFactory.marketCount(), "market count after final resolution").to.equal(5);
  });

  it("can start up again after stopping", async () => {
    ethPrice = 2500;
    btcPrice = 55000;
    currentRound = currentRound.nextRound();
    ethPriceFeed.setRoundData(currentRound.id, ethPrice * 1e8, nextResolutionTime);
    btcPriceFeed.setRoundData(currentRound.id, btcPrice * 1e8, nextResolutionTime);
    await network.provider.send("evm_setNextBlockTimestamp", [nextResolutionTime.toNumber()]);

    await marketFactory.createAndResolveMarkets([0, currentRound.id, currentRound.id], nextResolutionTime);

    expect(await marketFactory.marketCount(), "market count after final resolution").to.equal(7);
  });
});

class FeedManagement {
  rounds: { [roundId: string]: { price: BigNumberish; updatedAt: BigNumberish } } = {};
  latestRoundId: BigNumber = BigNumber.from(0);

  constructor(public feed: AggregatorV3Interface) {
    feed.smocked.decimals.will.return.with(8);

    feed.smocked.getRoundData.will.return.with((roundId: BigNumberish) => {
      return this.mockRoundData(roundId);
    });

    feed.smocked.latestRoundData.will.return.with(() => {
      return this.mockRoundData(this.latestRoundId);
    });
  }

  private mockRoundData(roundId: BigNumberish) {
    roundId = BigNumber.from(roundId).toString();
    const round = this.rounds[roundId];

    if (!round) {
      const msg = `Mock doesn't have return data for round id ${roundId}`;
      console.error(msg);
      throw Error(msg);
    }

    const { price, updatedAt } = round;
    const startedAt = 0;
    return [roundId, price, startedAt, updatedAt, roundId];
  }

  public get address(): string {
    return this.feed.address;
  }

  setRoundData(roundId: BigNumberish, price: BigNumberish, updatedAt: BigNumberish) {
    roundId = BigNumber.from(roundId);

    if (this.latestRoundId.lt(roundId)) this.latestRoundId = roundId;

    roundId = roundId.toString();
    this.rounds[roundId] = { price, updatedAt };
  }
}

class RoundManagement {
  readonly phase: BigNumber;
  readonly justRound: BigNumber;

  constructor(phase: BigNumberish, justRound: BigNumberish) {
    this.phase = BigNumber.from(phase);
    this.justRound = BigNumber.from(justRound);
  }

  public get id(): BigNumber {
    return this.phase.shl(64).or(this.justRound);
  }

  public nextRound(): RoundManagement {
    return new RoundManagement(this.phase, this.justRound.add(1));
  }

  public prevRound(): RoundManagement {
    return new RoundManagement(this.phase, this.justRound.sub(1));
  }

  static decode(roundId: BigNumberish): RoundManagement {
    roundId = BigNumber.from(roundId);
    const phase = roundId.shr(64);
    const justRoundId = roundId.sub(phase.shl(64));
    return new RoundManagement(phase, justRoundId);
  }
}
