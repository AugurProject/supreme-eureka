import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getChainId } from "hardhat";
import path from "path";
import { updateAddressConfig } from "../src/addressesConfigUpdater";
import { Addresses, addresses as originalAddresses, ChainId, graphChainNames, MarketFactory } from "../addresses";
import { DeploymentsExtension } from "hardhat-deploy/dist/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (hre.network.config.live) console.log("Done deploying! Writing deploy information to addresses.ts");

  const { deployments } = hre;
  const chainId = parseInt(await getChainId());

  const { address: collateral } = await deployments.get("Collateral");
  const { address: reputationToken } = await deployments.get("Reputation");
  const { address: balancerFactory } = await deployments.get("BFactory");

  const sportsLinkMarketFactory = await deployments.get("SportsLinkMarketFactory").catch(() => undefined);
  const cryptoMarketFactory = await deployments.get("CryptoMarketFactory").catch(() => undefined);
  const mmaLinkMarketFactory = await deployments.get("MMALinkMarketFactory").catch(() => undefined);
  const nflMarketFactory = await deployments.get("NFLMarketFactory").catch(() => undefined);

  const nbaFetcher = await deployments.get("NBAFetcher").catch(() => undefined);
  const mmaFetcher = await deployments.get("MMAFetcher").catch(() => undefined);

  const ammFactory = await deployments.get("AMMFactory").catch(() => undefined);

  const uploadBlockNumber = await getUploadBlockNumber(chainId as ChainId, deployments);

  const version = "FILL THIS OUT"; // version of a particular market factory
  const subtype = "V2"; // tells the UI which API features are available V2 indicates initialOdds.

  // Add new market factories. Only new ones.
  const marketFactories: MarketFactory[] = originalAddresses[chainId as ChainId]?.marketFactories || [];

  if (sportsLinkMarketFactory && !hasFactory(marketFactories, sportsLinkMarketFactory.address)) {
    marketFactories.unshift({
      version,
      description: "mlb and nba",
      type: "SportsLink",
      subtype,
      address: sportsLinkMarketFactory.address,
      collateral,
      ammFactory: ammFactory?.address || "",
      fetcher: nbaFetcher?.address || "",
      hasRewards: true,
    });
  }
  if (cryptoMarketFactory && !hasFactory(marketFactories, cryptoMarketFactory.address)) {
    marketFactories.unshift({
      version,
      description: "crypto prices",
      type: "Crypto",
      subtype,
      address: cryptoMarketFactory.address,
      collateral,
      ammFactory: ammFactory?.address || "",
      fetcher: "", // TODO
      hasRewards: true,
    });
  }
  if (mmaLinkMarketFactory && !hasFactory(marketFactories, mmaLinkMarketFactory.address)) {
    marketFactories.unshift({
      version,
      description: "mma",
      type: "MMALink",
      subtype: "V2",
      address: mmaLinkMarketFactory.address,
      collateral,
      ammFactory: ammFactory?.address || "",
      fetcher: mmaFetcher?.address ?? "",
      hasRewards: true,
    });
  }
  if (nflMarketFactory && !hasFactory(marketFactories, nflMarketFactory.address)) {
    marketFactories.unshift({
      version,
      description: "nfl",
      type: "NFL",
      subtype: "V2",
      address: nflMarketFactory.address,
      collateral,
      ammFactory: ammFactory?.address || "",
      fetcher: nbaFetcher?.address || "", // uses nba because nfl is very similar to nba/mlb
      hasRewards: true,
    });
  }

  const addresses: Addresses = {
    reputationToken,
    balancerFactory,
    marketFactories,
    info: {
      graphName: graphChainNames[chainId],
      uploadBlockNumber,
    },
  };

  if (hre.network.config.live) console.log(JSON.stringify(addresses, null, 2));

  const addressFilePath = path.resolve(__dirname, "../addresses.ts");
  updateAddressConfig(addressFilePath, chainId, addresses);
};

function hasFactory(marketFactories: MarketFactory[], address: string): boolean {
  return marketFactories.filter((f) => f.address === address).length !== 0;
}

// Use the existing uploadBlockNumber, if there is one.
// Else, go through all deployments and find the smallest block number.
// If somehow that doesn't yield anything, default to zero.
async function getUploadBlockNumber(chainId: ChainId, deployments: DeploymentsExtension): Promise<number> {
  const previous = originalAddresses[chainId]?.info.uploadBlockNumber;
  if (previous) return previous;

  const deployed = Object.values(await deployments.all())
    .map((d) => d.receipt?.blockNumber)
    .filter((d): d is number => typeof d !== "undefined")
    .sort((a: number, b: number) => a - b);
  if (deployed.length > 0) return deployed[0];

  return 0;
}

func.runAtTheEnd = true;
func.tags = ["UpdateAddresses"];

export default func;
