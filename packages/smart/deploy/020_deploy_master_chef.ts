import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { MasterChef__factory } from "../typechain";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const { address: wrappedMaticAddress } = await deployments.get("WrappedMatic");

  const args: Parameters<MasterChef__factory["deploy"]> = [wrappedMaticAddress];

  await deployments.deploy("MasterChef", {
    from: deployer,
    args,
    log: true,
  });
};

func.tags = ["MasterChef"];
func.dependencies = ["RewardsTokens"];

export default func;
