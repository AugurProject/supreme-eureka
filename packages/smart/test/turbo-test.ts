import { deployments, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect, use as chaiUse } from "chai";

import chaiAsPromised from "chai-as-promised";
import {
  AMMFactory,
  BFactory,
  BFactory__factory,
  BPool,
  BPool__factory,
  BPoolForTesting__factory,
  Cash,
  Cash__factory,
  FeePot,
  OwnedERC20,
  OwnedERC20__factory,
  TrustedMarketFactory,
  TrustedMarketFactory__factory,
} from "../typechain";
import { BigNumber } from "ethers";
import { calcShareFactor, DEAD_ADDRESS } from "../src";

chaiUse(chaiAsPromised);

describe("Turbo", () => {
  let signer: SignerWithAddress;
  const BONE = BigNumber.from(10).pow(18);
  const INITIAL_LP_DUST_BURNT = BONE.div(1000);
  const FAKE_ADDRESS = "0xFA0E00000000000000000000000000000000FA0E";

  before(async () => {
    await deployments.fixture();
    [signer] = await ethers.getSigners();

    ammFactory = (await ethers.getContract("AMMFactory")) as AMMFactory;
    collateral = (await ethers.getContract("Collateral")) as Cash;
    const feePot = (await ethers.getContract("FeePot")) as FeePot;
    shareFactor = calcShareFactor(await collateral.decimals());
    marketFactory = await new TrustedMarketFactory__factory(signer).deploy(
      signer.address,
      collateral.address,
      shareFactor,
      feePot.address,
      [stakerFee, settlementFee, protocolFee],
      signer.address
    );
  });

  const outcomeNames = ["No Contest", "All", "Many", "Few", "None"];
  const basis = BigNumber.from(10).pow(18);
  const usdcBasis = BigNumber.from(10).pow(6);
  const stakerFee = 0;
  const settlementFee = BigNumber.from(10).pow(15).mul(5); // 0.5%
  const protocolFee = 0;

  let collateral: Cash;
  let shareFactor: BigNumber;
  let marketFactory: TrustedMarketFactory;
  let marketId: BigNumber;
  let noContest: OwnedERC20;
  let all: OwnedERC20;
  let many: OwnedERC20;
  let few: OwnedERC20;
  let none: OwnedERC20;
  let bFactory: BFactory;
  let ammFactory: AMMFactory;
  let pool: BPool;

  it("is deployable", async () => {
    expect(await marketFactory.getOwner()).to.equal(signer.address);
    expect(await marketFactory.collateral()).to.equal(collateral.address);
  });

  it("can create a market", async () => {
    const description = "test market";
    const odds = [
      // each weight must be in the range [1e18,50e18]. max total weight is 50e18
      basis.mul(2).div(2), // Invalid at 2%
      basis.mul(24).div(2), // All at 24%
      basis.mul(25).div(2), // Some at 25%
      basis.mul(25).div(2), // Few at 25%
      basis.mul(24).div(2), // None at 24%
    ];
    await marketFactory.createMarket(signer.address, description, outcomeNames, odds);

    const filter = marketFactory.filters.MarketCreated(null, null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length).to.equal(1);
    const [log] = logs;
    [marketId] = log.args;
    expect(marketId).to.equal(1);

    const market = await marketFactory.getMarket(marketId);
    [noContest, all, many, few, none] = market.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));
    expect(await noContest.symbol()).to.equal("No Contest");
    expect(await noContest.name()).to.equal("No Contest");
    expect(await all.symbol()).to.equal("All");
    expect(await all.name()).to.equal("All");
    expect(await many.symbol()).to.equal("Many");
    expect(await many.name()).to.equal("Many");
    expect(await few.symbol()).to.equal("Few");
    expect(await few.name()).to.equal("Few");
    expect(await none.symbol()).to.equal("None");
    expect(await none.name()).to.equal("None");
  });

  it("can mint sets", async () => {
    const setsToMint = shareFactor.mul(100);
    const costToMint = setsToMint.div(shareFactor);

    await collateral.faucet(costToMint);
    await collateral.approve(marketFactory.address, costToMint);
    await marketFactory.mintShares(marketId, setsToMint, signer.address);

    expect(await collateral.balanceOf(signer.address)).to.equal(0);
    expect(await noContest.balanceOf(signer.address)).to.equal(setsToMint);
    expect(await all.balanceOf(signer.address)).to.equal(setsToMint);
    expect(await many.balanceOf(signer.address)).to.equal(setsToMint);
    expect(await few.balanceOf(signer.address)).to.equal(setsToMint);
    expect(await none.balanceOf(signer.address)).to.equal(setsToMint);
  });

  it("can burn sets", async () => {
    const setsToBurn = shareFactor.mul(9);
    const setsLeft = shareFactor.mul(91);

    await marketFactory.burnShares(marketId, setsToBurn, signer.address);

    expect(await collateral.balanceOf(signer.address)).to.equal(9);
    expect(await noContest.balanceOf(signer.address)).to.equal(setsLeft);
    expect(await all.balanceOf(signer.address)).to.equal(setsLeft);
    expect(await many.balanceOf(signer.address)).to.equal(setsLeft);
    expect(await few.balanceOf(signer.address)).to.equal(setsLeft);
    expect(await none.balanceOf(signer.address)).to.equal(setsLeft);
  });

  it("can make an AMM", async () => {
    const initialLiquidity = usdcBasis.mul(1000); // 1000 of the collateral
    await collateral.faucet(initialLiquidity);
    await collateral.approve(ammFactory.address, initialLiquidity);
    await ammFactory.createPool(marketFactory.address, marketId, initialLiquidity, signer.address);
    pool = BPool__factory.connect(await ammFactory.pools(marketFactory.address, marketId), signer);
    // Don't know why user gets this many LP tokens but it shouldn't matter.
    expect(await pool.balanceOf(signer.address)).to.equal(
      initialLiquidity.mul(shareFactor).div(10).sub(INITIAL_LP_DUST_BURNT)
    );
  });

  it("can add more liquidity to the AMM", async () => {
    const additionalLiquidity = usdcBasis.mul(10); // 10 USDC. Not very much
    await collateral.faucet(additionalLiquidity);
    await collateral.approve(ammFactory.address, additionalLiquidity);

    const pool = BPool__factory.connect(await ammFactory.pools(marketFactory.address, marketId), signer);
    await ammFactory.addLiquidity(marketFactory.address, marketId, additionalLiquidity, 0, signer.address);
    expect(await pool.balanceOf(signer.address)).to.equal(BigNumber.from("0x0579a4876265ad7fcd")); // hardcoded from observation
  });

  it("can buy shares from the AMM", async () => {
    const outcome = 1; // outcome "All"
    const collateralIn = usdcBasis; // 1 USDC

    await collateral.faucet(collateralIn);
    await collateral.approve(ammFactory.address, collateralIn);
    expect(await all.balanceOf(signer.address)).to.equal(shareFactor.mul(91).add(1000)); // minted 100 sets, burned 9
    await ammFactory.buy(marketFactory.address, marketId, outcome, collateralIn, 0);
    expect(await all.balanceOf(signer.address)).to.equal("4112930879157689821"); // hardcoded from observation
  });

  it("can see the outcome ratios in the AMM", async () => {
    const ratios = await ammFactory.tokenRatios(marketFactory.address, marketId);

    const expectedRatios = [
      BigNumber.from(10).pow(18).toString(), // first is always 10^18
      "0xa9c295a09ba67ffb",
      "0xb01d32efab1c052f",
      "0xb01d32efab1c052f",
      "0xa911ca7fae814ca8",
    ].map(BigNumber.from);
    ratios.forEach((price, index) => {
      expect(price.toHexString()).to.equal(expectedRatios[index].toHexString());
    });
  });

  it("can read market from factory", async () => {
    const market = await marketFactory.callStatic.getMarket(marketId);
    expect(market.shareTokens.length).to.equal(5);
  });

  it("can read empty markets from factory", async () => {
    const marketCount = await marketFactory.marketCount();

    let market = await marketFactory.callStatic.getMarket(marketCount);
    expect(market.shareTokens.length).to.equal(0);

    market = await marketFactory.callStatic.getMarket(marketCount.add(1));
    expect(market.shareTokens.length).to.equal(0);
  });

  it("can read market balances", async () => {
    const balances = await ammFactory.getPoolBalances(marketFactory.address, marketId);
    expect(balances.length).to.equal(5);
  });

  it("can resolve markets", async () => {
    await marketFactory.trustedResolveMarket(marketId, 1);
  });

  it("can remove liquidity", async () => {
    const lpTokens = await ammFactory.getPoolTokenBalance(marketFactory.address, marketId, signer.address);
    await pool.approve(ammFactory.address, lpTokens);
    await ammFactory.removeLiquidity(marketFactory.address, marketId, lpTokens, 0, FAKE_ADDRESS);
    expect(await collateral.balanceOf(FAKE_ADDRESS)).to.equal(1001842805); // hardcoded from observation
  });

  it("can claim winnings", async () => {
    // can burn non-winning shares
    const setsLeft = await noContest.balanceOf(signer.address);
    await noContest.transfer(DEAD_ADDRESS, setsLeft);
    await many.transfer(DEAD_ADDRESS, setsLeft);
    await few.transfer(DEAD_ADDRESS, setsLeft);
    await none.transfer(DEAD_ADDRESS, setsLeft);

    expect(await collateral.balanceOf(signer.address)).to.equal(9); // previously burnt sets

    await marketFactory.claimWinnings(marketId, signer.address);

    const expectedWinnings = BigNumber.from("0x3e71d7"); // hardcoded from observation
    expect(await collateral.balanceOf(signer.address)).to.equal(expectedWinnings);
    expect(await noContest.balanceOf(signer.address)).to.equal(0);
    expect(await all.balanceOf(signer.address)).to.equal(0);
    expect(await many.balanceOf(signer.address)).to.equal(0);
    expect(await few.balanceOf(signer.address)).to.equal(0);
    expect(await none.balanceOf(signer.address)).to.equal(0);
  });

  it("cannot mint sets after market resolution", async () => {
    const setsToMint = shareFactor.mul(100);
    const costToMint = setsToMint.div(shareFactor);

    await collateral.faucet(costToMint);
    await collateral.approve(marketFactory.address, costToMint);
    await expect(marketFactory.mintShares(marketId, setsToMint, signer.address)).to.be.rejectedWith(
      "Transaction reverted without a reason"
    );
  });

  it("can create a test balancer pool", async () => {
    bFactory = await new BFactory__factory(signer).deploy();
    const poolContract = await new BPoolForTesting__factory(signer).deploy(bFactory.address);
    const usdc = await new Cash__factory(signer).deploy("USDC", "USDC", 6);
    const weth = await new Cash__factory(signer).deploy("wETH", "wETH", 18);

    const usdcAmount = basis.mul(132);
    const wethAmount = basis.mul(176);

    await usdc.faucet(usdcAmount);
    await usdc.approve(signer.address, usdcAmount);
    await usdc.transferFrom(signer.address, poolContract.address, usdcAmount);
    await usdc.approve(signer.address, usdcAmount);

    await weth.faucet(wethAmount);
    await weth.approve(signer.address, wethAmount);
    await weth.transferFrom(signer.address, poolContract.address, wethAmount);
    await weth.approve(signer.address, wethAmount);

    const tokens = [usdc.address, weth.address];

    const weights = [
      // each weight must be in the range [1e18,50e18]. max total weight is 50e18
      basis.mul(40).div(2),
      basis.mul(60).div(2),
    ];

    const initialLiquidity = [usdcAmount, wethAmount];

    await poolContract.createBPoolForTesting(tokens, initialLiquidity, weights);
    const bPool = await poolContract.getBPool();

    expect(await weth.balanceOf(bPool)).to.equal(wethAmount);
    expect(await usdc.balanceOf(bPool)).to.equal(usdcAmount);
  });
});
