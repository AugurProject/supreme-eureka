import { deployments, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";

import {
  AbstractMarketFactoryV2,
  AMMFactory,
  Cash,
  FeePot,
  TrustedMarketFactory,
  TrustedMarketFactory__factory,
} from "../typechain";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { calcShareFactor } from "../src";
import { buyWithValues, calculateSellCompleteSets, calculateSellCompleteSetsWithValues } from "../src/bmath";

describe("AMMFactory", () => {
  let BPool__factory: ContractFactory;

  let signer: SignerWithAddress;
  let secondSigner: SignerWithAddress;
  const outcomeNames = ["No Contest", "Hulk Hogan", "Undertaker"];

  const usdcBasis = BigNumber.from(10).pow(6);
  const stakerFee = 0;
  const settlementFee = BigNumber.from(10).pow(15).mul(5); // 0.5%
  const protocolFee = 0;

  const MAX_APPROVAL = BigNumber.from(2).pow(256).sub(1);
  const ZERO = BigNumber.from(0);
  const BONE = BigNumber.from(10).pow(18);

  let collateral: Cash;
  let shareFactor: BigNumber;
  let marketFactory: TrustedMarketFactory;
  const marketId = BigNumber.from(1);
  let ammFactory: AMMFactory;

  // These are specific to the one market we are dealing with in the tests below.
  let shareTokens: Contract[];
  let bPool: Contract;

  before(async () => {
    BPool__factory = await ethers.getContractFactory("BPool");
  });

  beforeEach(async () => {
    await deployments.fixture();

    [signer, secondSigner] = await ethers.getSigners();

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

    ammFactory = (await ethers.getContract("AMMFactory")) as AMMFactory;

    const description = "Who will win Wrestlemania III?";
    const odds = calcWeights([2, 49, 49]);
    await marketFactory.createMarket(signer.address, description, outcomeNames, odds);

    const initialLiquidity = usdcBasis.mul(1000); // 1000 of the collateral
    await collateral.faucet(initialLiquidity);
    await collateral.approve(ammFactory.address, initialLiquidity);
    await ammFactory.createPool(marketFactory.address, marketId, initialLiquidity, signer.address);

    const bPoolAddress = await ammFactory.getPool(marketFactory.address, marketId);
    bPool = BPool__factory.attach(bPoolAddress).connect(signer);
    await bPool.approve(ammFactory.address, MAX_APPROVAL);

    const { shareTokens: shareTokenAddresses } = await marketFactory.getMarket(marketId.toString());
    shareTokens = shareTokenAddresses.map((address: string) => collateral.attach(address).connect(secondSigner));
  });

  it("sell shares for collateral", async () => {
    const _outcome = 0;

    const collateralIn = usdcBasis.mul(100); // 100 of the collateral

    const secondSignerAMMFactory = ammFactory.connect(secondSigner);
    const secondMarketFactory = marketFactory.connect(secondSigner);

    const secondCollateral = collateral.connect(secondSigner);
    await secondCollateral.faucet(collateralIn);
    await secondCollateral.approve(secondMarketFactory.address, MAX_APPROVAL);

    const _setsInForCollateral = await secondMarketFactory.calcShares(collateralIn);
    await secondMarketFactory.mintShares(marketId.toString(), _setsInForCollateral, secondSigner.address);

    const [tokenAmountOut, _shareTokensIn] = await calculateSellCompleteSetsWithValues(
      secondSignerAMMFactory as AMMFactory,
      (marketFactory as unknown) as AbstractMarketFactoryV2,
      marketId.toString(),
      _outcome,
      _setsInForCollateral.toString()
    );

    await shareTokens[_outcome].approve(secondSignerAMMFactory.address, MAX_APPROVAL);
    const collateralBefore = await secondCollateral.balanceOf(secondSigner.address);
    const sharesBefore = await shareTokens[_outcome].balanceOf(secondSigner.address);

    expect(_setsInForCollateral.lte(sharesBefore)).to.be.true;

    await secondSignerAMMFactory.sellForCollateral(
      secondMarketFactory.address,
      marketId,
      _outcome,
      _shareTokensIn.map((m) => BigNumber.from(m)),
      BigNumber.from(tokenAmountOut)
    );

    const collateralAfter = await secondCollateral.balanceOf(secondSigner.address);
    expect(collateralAfter.gt(collateralBefore)).to.be.true;
  });

  it("should not fail when getting weights/ratios/balances on non-existent pools", async () => {
    const nonExistentMarketId = 10;
    const tokenRatios = await ammFactory.tokenRatios(marketFactory.address, nonExistentMarketId);
    expect(tokenRatios).to.be.empty;

    const poolBalances = await ammFactory.getPoolBalances(marketFactory.address, nonExistentMarketId);
    expect(poolBalances).to.be.empty;

    const poolWeights = await ammFactory.getPoolWeights(marketFactory.address, nonExistentMarketId);
    expect(poolWeights).to.be.empty;
  });

  it("should not be an infinite loop", async () => {
    calculateSellCompleteSets(
      BigNumber.from("1000000000000"),
      1,
      BONE.mul(3941),
      ["9437597515460458265822", "10012000000000000000000", "10012000000000000000000"].map((b) => BigNumber.from(b)),
      ["1000000000000000000", "20000000000000000000", "29000000000000000000"].map((b) => BigNumber.from(b)),
      BigNumber.from("15000000000000000")
    );
  });

  it("should not be an infinite loop part 2", async () => {
    const result = calculateSellCompleteSets(
      BigNumber.from("1000000000000"),
      1,
      BONE.mul(3941),
      ["6404637568042191796381", "682774709629804684772", "6404637201061839402829"].map((b) => BigNumber.from(b)),
      ["1000000000000000000", "25500000000000000000", "23500000000000000000"].map((b) => BigNumber.from(b)),
      BigNumber.from("15000000000000000")
    );

    console.log("result", result);
  });

  describe("buy", () => {
    it("should match the contract values", async () => {
      const collateralIn = usdcBasis.mul(100); // 100 of the collateral
      await collateral.faucet(collateralIn.mul(2));
      await collateral.approve(ammFactory.address, collateralIn.mul(2));

      await ammFactory.addLiquidity(marketFactory.address, marketId, collateralIn, ZERO, secondSigner.address);

      const contractResult = await ammFactory.callStatic.buy(
        marketFactory.address,
        marketId,
        BigNumber.from(1),
        collateralIn,
        BigNumber.from(0)
      );

      const result = await buyWithValues(
        ammFactory as AMMFactory,
        (marketFactory as unknown) as AbstractMarketFactoryV2,
        marketId.toNumber(),
        1,
        collateralIn.toString()
      );

      expect(contractResult.sub(result).toString()).to.be.equal("0");
    });
  });

  describe("addLiquidity", () => {
    const addLiquidity = async function (collateralAmount: number) {
      const collateralIn = usdcBasis.mul(collateralAmount);
      await collateral.faucet(collateralIn);
      await collateral.approve(ammFactory.address, collateralIn);

      await ammFactory.addLiquidity(marketFactory.address, marketId, collateralIn, ZERO, secondSigner.address);
    };
    const addTest = function (a: number, b: number, c: number) {
      // TODO unskip these when we figure out why they take so long to run
      it.skip(`addLiquidity check: ${a}, ${b}, ${c}`, async () => {
        await addLiquidity(a);
        await addLiquidity(b);
        await addLiquidity(c);
      });
    };

    const randomValues = [1500, 5000, 100000, 500000, 750000];
    const numberOfValues = randomValues.length;
    for (let i = 0; i < Math.pow(randomValues.length, 3); i++) {
      const s = i.toString(numberOfValues).padStart(3, "0");

      const a = parseInt(s[2], numberOfValues);
      const b = parseInt(s[1], numberOfValues);
      const c = parseInt(s[0], numberOfValues);

      addTest(randomValues[a], randomValues[b], randomValues[c]);
    }

    it("with balanced pool", async () => {
      // Use first signer to alter balances in the pool.
      const collateralIn = usdcBasis.mul(1000); // 100 of the collateral
      await collateral.faucet(collateralIn.mul(2));
      await collateral.approve(ammFactory.address, collateralIn.mul(2));

      await ammFactory.addLiquidity(marketFactory.address, marketId, collateralIn, ZERO, secondSigner.address);
      const sharesAfter = await Promise.all(
        shareTokens.map((shareToken: Contract) =>
          shareToken.balanceOf(signer.address).then((r: BigNumber) => r.toString())
        )
      );

      // The pool is even right now so we wouldn't expect any shares.
      expect(sharesAfter).to.deep.equal(["0", "0", "0"]);
    });

    it("huge amount with balanced pool", async () => {
      await addLiquidity(5000);
      await addLiquidity(100000);

      const sharesAfter = await Promise.all(
        shareTokens.map((shareToken: Contract) =>
          shareToken.balanceOf(signer.address).then((r: BigNumber) => r.toString())
        )
      );

      // The pool is even right now so we wouldn't expect any shares.
      expect(sharesAfter).to.deep.equal(["0", "0", "0"]);
    });

    it("with unbalanced pool", async () => {
      const secondBPool = bPool.connect(secondSigner);
      await secondBPool.approve(ammFactory.address, MAX_APPROVAL);

      // Use first signer to alter balances in the pool.
      const collateralIn = usdcBasis.mul(100); // 100 of the collateral
      await collateral.faucet(collateralIn.mul(2));
      await collateral.approve(ammFactory.address, collateralIn.mul(2));

      await ammFactory.buy(marketFactory.address, marketId, BigNumber.from(1), collateralIn, BigNumber.from(0));

      // Sending the LP tokens to second signer.
      await ammFactory.addLiquidity(marketFactory.address, marketId, collateralIn, ZERO, secondSigner.address);

      const sharesAfter = await Promise.all(
        shareTokens.map((shareToken: Contract) =>
          shareToken.balanceOf(signer.address).then((r: BigNumber) => r.toString())
        )
      );

      expect(sharesAfter).to.deep.equal(["0", "193151727304627160820", "0"]);
    });
  });

  describe("removeLiquidity", () => {
    it("should return shares if pool unbalanced", async () => {
      const secondAmmFactory = ammFactory.connect(secondSigner);

      const secondBPool = bPool.connect(secondSigner);
      await secondBPool.approve(ammFactory.address, MAX_APPROVAL);

      // Use first signer to alter balances in the pool.
      const collateralIn = usdcBasis.mul(100); // 100 of the collateral
      await collateral.faucet(collateralIn.mul(2));
      await collateral.approve(ammFactory.address, collateralIn.mul(2));

      // Sending the LP tokens to second signer.
      await ammFactory.addLiquidity(marketFactory.address, marketId, collateralIn, ZERO, secondSigner.address);

      const sharesBefore = await Promise.all(
        shareTokens.map((shareToken: Contract) =>
          shareToken.balanceOf(secondSigner.address).then((r: BigNumber) => r.toString())
        )
      );

      await ammFactory.buy(marketFactory.address, marketId, BigNumber.from(1), collateralIn, BigNumber.from(0));

      const collateralBefore = await collateral.balanceOf(secondSigner.address);

      const poolTokens = await secondAmmFactory.getPoolTokenBalance(
        marketFactory.address,
        marketId,
        secondSigner.address
      );

      expect(poolTokens.gt(0), "pool tokens greater than zero").to.be.true;

      const [collateralGained, sharesGained] = await secondAmmFactory.callStatic.removeLiquidity(
        marketFactory.address,
        marketId,
        poolTokens,
        BigNumber.from(0),
        secondSigner.address
      );

      await secondAmmFactory.removeLiquidity(
        marketFactory.address,
        marketId,
        poolTokens,
        BigNumber.from(0),
        secondSigner.address
      );

      const collateralAfter = await collateral.balanceOf(secondSigner.address);

      // Check that we gained collateral.
      expect(collateralAfter.gt(collateralBefore), "collateral gained").to.be.true;

      const sharesAfter = await Promise.all(
        shareTokens.map((shareToken: Contract) =>
          shareToken.balanceOf(secondSigner.address).then((r: BigNumber) => r.toString())
        )
      );

      expect(collateralGained).to.equal(collateralAfter.sub(collateralBefore));
      expect(sharesAfter).to.deep.equal(
        sharesGained.map((s: BigNumber, index: number) => s.add(sharesBefore[index]).toString())
      );
      expect(sharesAfter).to.deep.equal(["17630229090909091709", "484905048517", "17630229090909091709"]);
    });

    it("liquidity removal for collateral and burn sets", async () => {
      const sharesBefore = await Promise.all(
        shareTokens.map((shareToken: Contract) =>
          shareToken.balanceOf(signer.address).then((r: BigNumber) => r.toString())
        )
      );

      expect(sharesBefore).to.deep.equal(["0", "0", "0"]);

      const collateralBefore = await collateral.balanceOf(signer.address);

      const poolTokens = await ammFactory.getPoolTokenBalance(marketFactory.address, marketId, signer.address);
      await ammFactory.removeLiquidity(marketFactory.address, marketId, poolTokens, BigNumber.from(0), signer.address);

      const collateralAfter = await collateral.balanceOf(signer.address);

      // Check that we gained collateral.
      expect(collateralAfter.gt(collateralBefore)).to.be.true;

      const sharesAfter = await Promise.all(
        shareTokens.map((shareToken: Contract) =>
          shareToken.balanceOf(signer.address).then((r: BigNumber) => r.toString())
        )
      );

      expect(sharesAfter).to.deep.equal(["0", "0", "0"]);
    });
  });

  describe("add, remove and add again", () => {
    it("should not blowup.", async () => {
      const collateralIn = usdcBasis.mul(1000);
      await collateral.faucet(collateralIn);
      await collateral.approve(ammFactory.address, collateralIn);

      const lpTokenBal = await bPool.balanceOf(signer.address);
      await ammFactory.removeLiquidity(marketFactory.address, marketId, lpTokenBal, ZERO, signer.address);
      await ammFactory.addLiquidity(marketFactory.address, marketId, collateralIn, ZERO, signer.address);
    });
  });

  it("removing liquidity after market resolution works", async () => {
    const winningOutcome = 1;
    expect(await marketFactory.isMarketResolved(marketId)).to.be.false;
    await marketFactory.trustedResolveMarket(marketId, winningOutcome);
    expect(await marketFactory.isMarketResolved(marketId)).to.be.true;
    const lpTokens = await bPool.balanceOf(signer.address);
    await ammFactory.removeLiquidity(marketFactory.address, marketId, lpTokens, 0, signer.address);
  });
});

function calcWeights(ratios: number[]): BigNumber[] {
  const basis = BigNumber.from(10).pow(18);
  const max = basis.mul(50);

  const total = ratios.reduce((total, x) => total + x, 0);
  const factor = max.div(total); // TODO this doesn't work if total is too large
  return ratios.map((r) => factor.mul(r));
}
