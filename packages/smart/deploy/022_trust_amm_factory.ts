import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { makeSigner } from "../tasks";
import { MasterChef__factory } from "../typechain";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments } = hre;
  const signer = await makeSigner(hre);

  const { address: masterChefAddress } = await deployments.get("MasterChef");
  const { address: ammFactoryAddress } = await deployments.get("AMMFactory");

  const masterChef = MasterChef__factory.connect(masterChefAddress, signer);
  await masterChef.trustAMMFactory(ammFactoryAddress);
};

func.tags = ["trustAMMFactory"];
func.dependencies = ["AMMFactory", "MasterChef"];

export default func;
