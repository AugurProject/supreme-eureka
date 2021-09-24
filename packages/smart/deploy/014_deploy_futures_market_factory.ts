import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { FuturesMarketFactoryV3__factory } from "../typechain";
import { getCollateral, getFees } from "../src/utils/deploy";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer, linkNode, protocol, owner } = await getNamedAccounts();

  const { collateralAddress, shareFactor } = await getCollateral(deployments);
  const { address: feePotAddress } = await deployments.get("FeePot");
  const fees = getFees();

  const args: Parameters<FuturesMarketFactoryV3__factory["deploy"]> = [
    owner,
    collateralAddress,
    shareFactor,
    feePotAddress,
    fees,
    protocol,
    linkNode,
  ];

  await deployments.deploy("FuturesMarketFactoryV3", {
    contract: "FuturesMarketFactoryV3",
    from: deployer,
    args,
    log: true,
  });

  await deployments.deploy("FuturesFetcher", {
    from: deployer,
    args: [],
    log: true,
  });
};

func.tags = ["FuturesMarketFactory"];
func.dependencies = ["Tokens", "FeePot", "BFactory"];

export default func;
