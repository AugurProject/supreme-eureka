import { task, types } from "hardhat/config";

import { createPool } from "../src";
import "hardhat/types/config";
import { isHttpNetworkConfig, makeSigner } from "./deploy";
import { ethers } from "ethers";
import { Cash__factory, PriceMarketFactory__factory } from "../typechain";
import { BigNumberish } from "ethers/lib/ethers";

task("createPool", "Create a balancer pool for an AMM")
  .addParam("ammFactory", undefined, undefined, types.string)
  .addParam("marketFactory", undefined, undefined, types.string)
  .addParam("marketId", undefined, undefined, types.int)
  .addParam("initialLiquidity", undefined, undefined, types.int)
  .addParam("weights", undefined, undefined, types.json)
  .setAction(async ({ ammFactory, marketFactory: marketFactoryAddress, marketId, initialLiquidity, weights }, hre) => {
    // Type checking mostly as hints to the compiler
    if (typeof ammFactory !== "string") return;
    if (typeof marketFactoryAddress !== "string") return;
    if (typeof marketId !== "number") return;
    if (typeof initialLiquidity !== "number") return;
    if (!Array.isArray(weights))
      throw Error(`Weights must be an array of strings that represent numbers, not ${weights}`);

    const signer = await makeSigner(hre);
    const confirmations = isHttpNetworkConfig(hre.network.config) ? hre.network.config.confirmations : 0;

    initialLiquidity = ethers.BigNumber.from(10).pow(18).mul(initialLiquidity);
    const marketFactory = PriceMarketFactory__factory.connect(marketFactoryAddress, signer);

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
      weights,
      confirmations
    );
    console.log(`Pool: ${pool.address}`);
  });
