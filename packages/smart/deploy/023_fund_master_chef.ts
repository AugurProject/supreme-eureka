import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { makeSigner } from "../tasks";
import { Cash__factory } from "../typechain";
import { BigNumber } from "ethers";

// Send 2k fake rewards bucks.
const AMOUNT_TO_SEND_TO_MASTER_CHEF = BigNumber.from(10).pow(18).mul(2000);

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments } = hre;

  const signer = await makeSigner(hre);
  const masterChefDeploy = await deployments.get("MasterChef");
  const wrappedMaticDeploy = await deployments.get("WrappedMatic");

  const wrappedMatic = Cash__factory.connect(wrappedMaticDeploy.address, signer);

  try {
    await wrappedMatic.faucet(AMOUNT_TO_SEND_TO_MASTER_CHEF);
    await wrappedMatic.transfer(masterChefDeploy.address, AMOUNT_TO_SEND_TO_MASTER_CHEF);

    console.log("Successfully fauceted and transferred rewards to master chef.");
  } catch (e) {
    console.log("Unable to faucet and transfer rewards to master chef. This will only be successful on test networks.");
  }
};

func.tags = ["FundMasterChef"];
func.dependencies = ["MasterChef", "Tokens"];

export default func;
