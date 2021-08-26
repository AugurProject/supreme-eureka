import { deployments, ethers, network } from "hardhat";

import { Cash, MasterChef } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";

import { expect } from "chai";

function adjustTimestamp(beginTimestamp: BigNumber, poolEndTimestamp: BigNumber, percentage: number) {
  return poolEndTimestamp.sub(beginTimestamp).mul(percentage).div(100).add(beginTimestamp).add(1).toNumber();
}

describe("MasterChef", () => {
  let bill: SignerWithAddress;
  let tom: SignerWithAddress;

  let cash: Cash;
  let rewardsToken: Cash;
  let masterChef: MasterChef;

  let poolEndTimestamp: BigNumber;
  let beginTimestamp: BigNumber;

  const BONE = BigNumber.from(10).pow(18);
  const ZERO = BigNumber.from(0);

  // One day.
  const rewardPeriod = BigNumber.from(1);

  // At the completion of the reward period we should give out 10 rewards if available on contract.
  const rewardsPerPeriod = BONE.mul(20);

  const rewardsOnContract = rewardsPerPeriod.mul(10);

  const initialCashAmount = BONE.mul(100);

  beforeEach(async () => {
    await deployments.fixture();
    cash = (await ethers.getContract("Collateral")) as Cash;
    rewardsToken = (await ethers.getContract("WrappedMatic")) as Cash;
    masterChef = (await ethers.getContract("MasterChef")) as MasterChef;

    [bill, tom] = await ethers.getSigners();
    await masterChef.trustAMMFactory(bill.address);

    await masterChef.addRewards(bill.address, BigNumber.from(2), BONE.mul(95), ZERO);

    // Pull the rewards added during deployment on test nets.
    await masterChef.withdrawRewards(await rewardsToken.balanceOf(masterChef.address));

    await rewardsToken.faucet(rewardsOnContract);
    await rewardsToken.transfer(masterChef.address, rewardsOnContract);

    await cash.faucet(initialCashAmount);
    await cash.approve(masterChef.address, initialCashAmount);
  });

  describe("Early bonus", () => {
    beforeEach(async () => {
      // Zero standard rewards is the difference here.
      await masterChef.addRewards(bill.address, ZERO, rewardPeriod, rewardsPerPeriod);
      await masterChef.add(bill.address, cash.address);

      poolEndTimestamp = await masterChef.getPoolRewardEndTimestamp(0);

      const data = await masterChef.poolInfo(0);
      beginTimestamp = data.beginTimestamp;
    });

    it("should pay if deposited and left for duration of the reward pool's lifespan", async () => {
      await masterChef.trustedDeposit(tom.address, 0, initialCashAmount);

      await network.provider.send("evm_setNextBlockTimestamp", [poolEndTimestamp.toNumber()]);
      await network.provider.send("evm_mine", []);

      const pendingRewardsInfo = await masterChef.getPendingRewardInfo(0, tom.address);
      expect(pendingRewardsInfo.accruedStandardRewards).to.be.equal(0);
      expect(pendingRewardsInfo.accruedEarlyDepositBonusRewards).to.be.equal(rewardsPerPeriod);

      await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount);

      expect(await rewardsToken.balanceOf(tom.address)).to.be.equal(rewardsPerPeriod);
    });

    it("should not pay if a deposit is made after the bonus period has elapsed", async () => {
      const timestampAfterBonusRewards = adjustTimestamp(beginTimestamp, poolEndTimestamp, 15);

      await masterChef.trustedDeposit(tom.address, 0, initialCashAmount.div(2));

      await network.provider.send("evm_setNextBlockTimestamp", [timestampAfterBonusRewards]);
      await network.provider.send("evm_mine", []);

      await masterChef.trustedDeposit(tom.address, 0, initialCashAmount.div(2));

      await network.provider.send("evm_setNextBlockTimestamp", [poolEndTimestamp.toNumber()]);
      await network.provider.send("evm_mine", []);

      await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount);

      expect(await rewardsToken.balanceOf(tom.address)).to.be.equal(0);
    });

    describe("double withdrawal", () => {
      it("should return early bonus in proporation to the amount withdrawn", async () => {
        await masterChef.trustedDeposit(tom.address, 0, initialCashAmount);

        await network.provider.send("evm_setNextBlockTimestamp", [poolEndTimestamp.toNumber()]);
        await network.provider.send("evm_mine", []);

        await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount.div(2));
        expect(await rewardsToken.balanceOf(tom.address)).to.be.equal(rewardsPerPeriod.div(2));

        await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount.div(2));
        expect(await rewardsToken.balanceOf(tom.address)).to.be.equal(rewardsPerPeriod);
      });
    });
  });

  describe("No rewards", () => {
    beforeEach(async () => {
      await masterChef.addRewards(bill.address, ZERO, ZERO, ZERO);
      await masterChef.add(bill.address, cash.address);

      poolEndTimestamp = await masterChef.getPoolRewardEndTimestamp(0);

      const data = await masterChef.poolInfo(0);
      beginTimestamp = data.beginTimestamp;
    });

    it("should not distribute any rewards", async () => {
      await masterChef.trustedDeposit(tom.address, 0, initialCashAmount);

      const poolEndTimestamp = await masterChef.getPoolRewardEndTimestamp(0);

      await network.provider.send("evm_setNextBlockTimestamp", [poolEndTimestamp.add(100000).toNumber()]);
      await network.provider.send("evm_mine", []);

      const otherAmount = await masterChef.getPendingRewardInfo(0, tom.address);
      expect(otherAmount.accruedEarlyDepositBonusRewards).to.be.equal(0);
      expect(otherAmount.accruedStandardRewards).to.be.equal(0);

      // it distributes all the pending rewards.
      expect(await rewardsToken.balanceOf(tom.address)).to.be.equal(0);
    });
  });

  describe("Standard rewards", () => {
    beforeEach(async () => {
      await masterChef.addRewards(bill.address, rewardsPerPeriod, rewardPeriod, 0);
      await masterChef.add(bill.address, cash.address);

      poolEndTimestamp = await masterChef.getPoolRewardEndTimestamp(0);

      const data = await masterChef.poolInfo(0);
      beginTimestamp = data.beginTimestamp;
    });

    describe("active pool", () => {
      describe("entry at beginning of pool", () => {
        describe("partial removal", () => {
          it("should with draw all the rewards", async () => {
            const halfwayPoint = adjustTimestamp(beginTimestamp, poolEndTimestamp, 50);

            await masterChef.trustedDeposit(tom.address, 0, initialCashAmount);

            await network.provider.send("evm_setNextBlockTimestamp", [halfwayPoint]);

            await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount.div(2));

            // it distributes all the pending rewards.
            expect(await rewardsToken.balanceOf(tom.address)).to.be.equal(rewardsPerPeriod.div(2));

            await network.provider.send("evm_setNextBlockTimestamp", [poolEndTimestamp.toNumber()]);
            await network.provider.send("evm_mine", []);

            await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount.div(2));

            // it distributes all the pending rewards.
            expect(await rewardsToken.balanceOf(tom.address)).to.be.equal(rewardsPerPeriod);
          });
        });

        describe("stake twice", () => {
          it("should not overflow", async () => {
            // Depositing twice was causing this issue.
            await masterChef.trustedDeposit(tom.address, 0, initialCashAmount.div(2));
            await masterChef.trustedDeposit(tom.address, 0, initialCashAmount.div(2));

            await network.provider.send("evm_setNextBlockTimestamp", [
              adjustTimestamp(beginTimestamp, poolEndTimestamp, 25),
            ]);
            await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount.div(4));

            // it distributes all the pending rewards.
            const balance = await rewardsToken.balanceOf(tom.address);
            expect(rewardsPerPeriod.div(4).sub(balance).lte(100)).to.be.true;

            await network.provider.send("evm_setNextBlockTimestamp", [poolEndTimestamp.toNumber()]);
            await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount.div(2));
          });
        });
      });
    });

    describe("after end of pool rewards", () => {
      beforeEach(async () => {
        await masterChef.trustedDeposit(tom.address, 0, initialCashAmount);

        const poolEndTimestamp = await masterChef.getPoolRewardEndTimestamp(0);

        await network.provider.send("evm_setNextBlockTimestamp", [poolEndTimestamp.add(100000).toNumber()]);
        await network.provider.send("evm_mine", []);
      });

      it("should calculate pending payout rewards", async () => {
        const results = await masterChef.getPercentageOfRewardsForPeriod(0);
        expect(results).to.be.equal(BONE);

        const otherAmount = await masterChef.getPendingRewardInfo(0, tom.address);
        expect(otherAmount.accruedEarlyDepositBonusRewards).to.be.equal(0);
        expect(otherAmount.accruedStandardRewards).to.be.equal(rewardsPerPeriod);
      });

      it("should send rewards on withdrawal", async () => {
        await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount);

        const balance = await rewardsToken.balanceOf(tom.address);
        expect(balance).to.be.equal(rewardsPerPeriod);
      });

      it("should only payout what is available on contract", async () => {
        await masterChef.withdrawRewards(rewardsOnContract);

        await rewardsToken.transfer(masterChef.address, rewardsPerPeriod.div(2));

        await masterChef.trustedWithdraw(tom.address, 0, initialCashAmount);

        const balance = await rewardsToken.balanceOf(tom.address);
        expect(balance).to.be.equal(rewardsPerPeriod.div(2));
      });
    });

    describe("getPercentageOfRewardsForPeriod", () => {
      beforeEach(async () => {
        const data = await masterChef.poolInfo(0);
        poolEndTimestamp = await masterChef.getPoolRewardEndTimestamp(0);

        beginTimestamp = data.beginTimestamp;
        await masterChef.trustedDeposit(tom.address, 0, initialCashAmount);
      });

      const processIt = (percentage: number) => async () => {
        const newTimestamp = poolEndTimestamp
          .sub(beginTimestamp)
          .mul(percentage)
          .div(100)
          .add(beginTimestamp)
          .add(1)
          .toNumber();

        await network.provider.send("evm_setNextBlockTimestamp", [newTimestamp]);
        await network.provider.send("evm_mine", []);

        const percentOfRewardsToPay = await masterChef.getPercentageOfRewardsForPeriod(0);
        expect(percentOfRewardsToPay).to.be.equal(BONE.mul(percentage).div(100));
      };

      it("25%", processIt(25));

      it("50%", processIt(50));

      it("75%", processIt(75));

      it("100%", processIt(100));
    });
  });
});
