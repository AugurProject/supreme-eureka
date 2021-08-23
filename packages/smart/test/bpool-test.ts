import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { deployments, ethers } from "hardhat";
import { BFactory, BPool, BPool__factory, Cash, Cash__factory } from "../typechain";
import { expect } from "chai";
import { calcInGivenOut } from "../src/bmath";

const BONE = ethers.BigNumber.from(10).pow(18);
const MAX_APPROVAL = ethers.BigNumber.from(2).pow(256).sub(1);
const WEIGHT_CASH1 = BONE.mul(5);
const WEIGHT_CASH2 = BONE.mul(20);
const WEIGHT_CASH3 = BONE.mul(20);
const faucetAmount = ethers.BigNumber.from(10).pow(18).mul(10);

describe("AMM contract", () => {
  let signer: SignerWithAddress;
  let bPool: BPool;
  let cash1: Cash;
  let cash2: Cash;
  let cash3: Cash;

  beforeEach(async () => {
    await deployments.fixture();

    [signer] = await ethers.getSigners();

    const bFactory = (await ethers.getContract("BFactory")) as BFactory;
    await bFactory.newBPool().then((i) => i.wait());
    const filter = bFactory.filters.LOG_NEW_POOL(signer.address, null);
    const [log] = await bFactory.queryFilter(filter);

    bPool = BPool__factory.connect(log.args.pool, signer);

    cash1 = await new Cash__factory(signer).deploy("cash1", "cash1", 18);
    await cash1.faucet(faucetAmount);
    await cash1.approve(bPool.address, MAX_APPROVAL);
    await bPool.bind(cash1.address, faucetAmount.div(10), WEIGHT_CASH1);

    cash2 = await new Cash__factory(signer).deploy("cash2", "cash2", 18);
    await cash2.faucet(faucetAmount);
    await cash2.approve(bPool.address, MAX_APPROVAL);
    await bPool.bind(cash2.address, faucetAmount.div(10), WEIGHT_CASH2);

    cash3 = await new Cash__factory(signer).deploy("cash3", "cash3", 18);
    await cash3.faucet(faucetAmount);
    await cash3.approve(bPool.address, MAX_APPROVAL);
    await bPool.bind(cash3.address, faucetAmount.div(10), WEIGHT_CASH3);

    // Lock the tokens/weights.
    await bPool.finalize();
  });

  describe("calcInGivenOut", () => {
    const tokenBalanceIn = ethers.BigNumber.from("1000000000000000000");
    const tokenWeightIn = ethers.BigNumber.from("444444444444444444");
    const tokenBalanceOut = ethers.BigNumber.from("1000000000000000000");
    const tokenWeightOut = ethers.BigNumber.from("111111111111111111");
    const tokenAmountOut = ethers.BigNumber.from("312500000000000000");
    const swapFee = ethers.BigNumber.from("1000000000000");

    it("should match the values return be the contract.", async () => {
      const contractValue = await bPool.calcInGivenOut(
        tokenBalanceIn,
        tokenWeightIn,
        tokenBalanceOut,
        tokenWeightOut,
        tokenAmountOut,
        swapFee
      );
      const jsValue = calcInGivenOut(
        tokenBalanceIn,
        tokenWeightIn,
        tokenBalanceOut,
        tokenWeightOut,
        tokenAmountOut,
        swapFee
      );

      expect(contractValue.eq(jsValue)).to.be.true;
    });
  });
});
