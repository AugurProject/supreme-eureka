import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  if (!(await deployments.getOrNull("WrappedMatic"))) {
    await deployments.deploy("WrappedMatic", {
      contract: "Cash",
      from: deployer,
      args: ["WMATIC", "WMATIC", 18],
      log: true,
    });
  }
};

func.tags = ["RewardsTokens"];

export default func;
