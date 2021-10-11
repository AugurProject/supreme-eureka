import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { CryptoMarketFactoryV3__factory } from "../../typechain";
import { getCollateral, getFees } from "../../src/utils/deploy";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer, linkNode, protocol } = await getNamedAccounts();

  const { collateralAddress, shareFactor } = await getCollateral(deployments);
  const { address: feePotAddress } = await deployments.get("FeePot");
  const fees = getFees();

  const args: Parameters<CryptoMarketFactoryV3__factory["deploy"]> = [
    deployer, // initial owner must be deployer for coins to be addable
    collateralAddress,
    shareFactor,
    feePotAddress,
    fees,
    protocol,
    linkNode,
  ];

  await deployments.deploy("CryptoMarketFactoryV3", {
    contract: "CryptoMarketFactoryV3",
    from: deployer,
    args,
    log: true,
  });
};

func.tags = ["CryptoMarketFactory", "Crypto"];
func.dependencies = ["Tokens", "FeePot", "BFactory"];

export default func;
