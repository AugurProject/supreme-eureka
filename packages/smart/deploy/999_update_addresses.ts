import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getChainId } from "hardhat";
import path from "path";
import { updateAddressConfig } from "../src/addressesConfigUpdater";
import { Addresses, Collateral, ConstructorArg } from "../addresses";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log("Done deploying!");
  const { deployments } = hre;
  const chainId = parseInt(await getChainId());

  const collateral = await deployments.get("Collateral");
  const reputationToken = await deployments.get("Reputation");
  const balancerFactory = await deployments.get("BFactory");

  const sportsLinkMarketFactory = await deployments.get("SportsLinkMarketFactory");
  const trustedMarketFactory = await deployments.get("TrustedMarketFactory");

  const ammFactory = await deployments.get("AMMFactory");

  const theRundownChainlink = await deployments.getOrNull("TheRundownChainlink");

  const [name, symbol, decimals] = collateral.args as [string, string, number];
  const collateralDetails: Collateral = {
    address: collateral.address,
    name,
    symbol,
    decimals,
  };

  const addresses: Addresses = {
    reputationToken: reputationToken.address,
    balancerFactory: balancerFactory.address,
    ammFactory: ammFactory.address,
    marketFactories: {
      sportsball: {
        type: "SportsLink",
        address: sportsLinkMarketFactory.address,
        constructorArgs: sportsLinkMarketFactory.args as ConstructorArg[],
        collateral: collateralDetails,
      },
      trustme: {
        type: "Trusted",
        address: trustedMarketFactory.address,
        constructorArgs: trustedMarketFactory.args as ConstructorArg[],
        collateral: collateralDetails,
      },
    },
  };
  if (theRundownChainlink) {
    addresses.theRundownChainlink = theRundownChainlink.address;
  }

  console.log(JSON.stringify(addresses, null, 2));

  const addressFilePath = path.resolve(__dirname, "../addresses.ts");
  updateAddressConfig(addressFilePath, chainId, addresses);
};

func.runAtTheEnd = true;

export default func;
