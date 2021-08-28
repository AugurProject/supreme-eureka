import { task, types } from "hardhat/config";

import "hardhat/types/config";
import { makeSigner } from "./deploy";
import { BigNumber, ethers, Signer } from "ethers";
import {
  AbstractMarketFactoryV2__factory,
  AMMFactory__factory,
  BPool,
  BPool__factory,
  Cash__factory,
} from "../typechain";
import { BigNumberish } from "ethers/lib/ethers";
import { bignumber } from "../src/utils/tasks";

task("createPool", "Create a balancer pool for an AMM")
  .addParam("ammFactory", undefined, undefined, types.string)
  .addParam("marketFactory", undefined, undefined, types.string)
  .addParam("marketId", undefined, undefined, types.int)
  .addParam("initialLiquidity", undefined, undefined, bignumber)
  .setAction(
    async (
      {
        ammFactory,
        marketFactory: marketFactoryAddress,
        marketId,
        initialLiquidity,
      }: { ammFactory: string; marketFactory: string; marketId: number; initialLiquidity: BigNumber },
      hre
    ) => {
      const signer = await makeSigner(hre);
      const confirmations = hre.network.config.confirmations || 0;

      initialLiquidity = ethers.BigNumber.from(10).pow(18).mul(initialLiquidity);
      const marketFactory = AbstractMarketFactoryV2__factory.connect(marketFactoryAddress, signer);

      console.log("Finding the collateral address");
      const collateralAddress = await marketFactory.collateral();
      console.log(`Collateral address: ${collateralAddress}`);
      const collateral = Cash__factory.connect(collateralAddress, signer);

      console.log("Fauceting collateral for AMM");
      await collateral.faucet(initialLiquidity as BigNumberish);

      console.log("Approving the AMM to spend some of the deployer's collateral");
      await collateral.approve(ammFactory, initialLiquidity);

      console.log("Creating pool");
      const pool = await createPool(
        signer,
        ammFactory,
        marketFactoryAddress,
        marketId,
        initialLiquidity as BigNumberish,
        confirmations
      );
      console.log(`Pool: ${pool.address}`);
    }
  );

export async function createPool(
  signer: Signer,
  ammFactoryAddress: string,
  marketFactoryAddress: string,
  marketId: BigNumberish,
  initialLiquidity: BigNumberish,
  confirmations: number
): Promise<BPool> {
  const ammFactory = AMMFactory__factory.connect(ammFactoryAddress, signer);
  const marketFactory = AbstractMarketFactoryV2__factory.connect(marketFactoryAddress, signer);
  const lpTokenRecipient = await signer.getAddress();

  await ammFactory
    .createPool(marketFactory.address, marketId, initialLiquidity, lpTokenRecipient, {})
    .then((tx) => tx.wait(confirmations));

  const pool = await ammFactory.callStatic.pools(marketFactoryAddress, marketId);
  return BPool__factory.connect(pool, signer);
}
