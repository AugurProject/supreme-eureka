import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import {
  AMMFactory,
  AMMFactory__factory,
  BFactory,
  BFactory__factory,
  BPool__factory,
  Cash,
  Cash__factory,
  FeePot__factory,
  MasterChef,
  MasterChef__factory,
  TrustedMarketFactory,
  TrustedMarketFactory__factory,
} from "../typechain";
import { BigNumber, Contract } from "ethers";
import { calcShareFactor } from "../src";

describe.skip("AMMFactory", () => {
  let AMMFactory__factory: AMMFactory__factory;
  let BFactory__factory: BFactory__factory;
  let BPool__factory: BPool__factory;
  let Cash__factory: Cash__factory;
  let FeePot__factory: FeePot__factory;
  let MasterChef__factory: MasterChef__factory;
  let TrustedMarketFactory__factory: TrustedMarketFactory__factory;

  let signer: SignerWithAddress;
  let secondSigner: SignerWithAddress;
  const outcomeSymbols = ["NO CONTEST", "HH", "UT"];
  const outcomeNames = ["No Contest", "Hulk Hogan", "Undertaker"];

  const usdcBasis = BigNumber.from(10).pow(6);
  const stakerFee = 0;
  const swapFee = BigNumber.from(10).pow(15).mul(15); // 1.5%
  const settlementFee = BigNumber.from(10).pow(15).mul(5); // 0.5%
  const protocolFee = 0;

  const MAX_APPROVAL = BigNumber.from(2).pow(256).sub(1);
  const ZERO = BigNumber.from(0);
  const BONE = BigNumber.from(10).pow(18);

  let collateral: Cash;
  let rewardsToken: Cash;
  let shareFactor: BigNumber;
  let marketFactory: TrustedMarketFactory;
  const marketId = BigNumber.from(1);
  let ammFactory: AMMFactory;
  let bFactory: BFactory;

  let masterChef: MasterChef;

  let bPool: Contract;

  before(async () => {
    AMMFactory__factory = (await ethers.getContractFactory("AMMFactory")) as AMMFactory__factory;
    BFactory__factory = (await ethers.getContractFactory("BFactory")) as BFactory__factory;
    BPool__factory = (await ethers.getContractFactory("BPool")) as BPool__factory;
    Cash__factory = (await ethers.getContractFactory("Cash")) as Cash__factory;
    FeePot__factory = (await ethers.getContractFactory("FeePot")) as FeePot__factory;
    MasterChef__factory = (await ethers.getContractFactory("MasterChef")) as MasterChef__factory;
    TrustedMarketFactory__factory = (await ethers.getContractFactory(
      "TrustedMarketFactory"
    )) as TrustedMarketFactory__factory;
  });

  beforeEach(async () => {
    [signer, secondSigner] = await ethers.getSigners();

    collateral = await Cash__factory.deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await Cash__factory.deploy("REPv2", "REPv2", 18);
    const feePot = await FeePot__factory.deploy(collateral.address, reputationToken.address);
    shareFactor = calcShareFactor(await collateral.decimals());

    bFactory = await BFactory__factory.deploy();

    rewardsToken = await Cash__factory.deploy("RWS", "RWS", 18);

    masterChef = await MasterChef__factory.deploy(rewardsToken.address);
    const initialRewards = BONE.mul(10000);
    await rewardsToken.faucet(initialRewards);
    await rewardsToken.transfer(masterChef.address, initialRewards);

    ammFactory = await AMMFactory__factory.deploy(bFactory.address, masterChef.address, swapFee);

    marketFactory = await TrustedMarketFactory__factory.deploy(
      signer.address,
      collateral.address,
      shareFactor,
      feePot.address,
      stakerFee,
      settlementFee,
      signer.address,
      protocolFee
    );

    // AMMFactory must be owner to call privileged methods.
    await masterChef.trustAMMFactory(ammFactory.address);

    const endTime = BigNumber.from(Date.now())
      .div(1000)
      .add(60 * 60 * 24); // one day
    const description = "Who will win Wrestlemania III?";
    const odds = calcWeights([2, 49, 49]);
    await marketFactory.createMarket(signer.address, endTime, description, outcomeNames, outcomeSymbols, odds);

    const basis = BigNumber.from(10).pow(18);
    const weights = [basis.mul(2).div(2), basis.mul(49).div(2), basis.mul(49).div(2)];

    const initialLiquidity = usdcBasis.mul(1000); // 1000 of the collateral
    await collateral.faucet(initialLiquidity);
    await collateral.approve(ammFactory.address, initialLiquidity);
    await ammFactory.createPool(marketFactory.address, marketId, initialLiquidity, signer.address);

    const bPoolAddress = await ammFactory.getPool(marketFactory.address, marketId);
    bPool = BPool__factory.attach(bPoolAddress).connect(signer);
    await bPool.approve(ammFactory.address, MAX_APPROVAL);
  });

  describe("addLiquidity", () => {
    const addLiquidity = async function (collateralAmount: number) {
      const collateralIn = usdcBasis.mul(collateralAmount);
      await collateral.faucet(collateralIn);
      await collateral.approve(ammFactory.address, collateralIn);

      await ammFactory.addLiquidity(marketFactory.address, marketId, collateralIn, ZERO, secondSigner.address);
    };
    const addTest = function (a: number, b: number, c: number) {
      it(`addLiquidity check: ${a}, ${b}, ${c}`, async () => {
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
  });
});

function calcWeights(ratios: number[]): BigNumber[] {
  const basis = BigNumber.from(10).pow(18);
  const max = basis.mul(50);

  const total = ratios.reduce((total, x) => total + x, 0);
  const factor = max.div(total); // this doesn't work if total is too large
  return ratios.map((r) => factor.mul(r));
}
