import {
  AMMFactory,
  AMMFactory__factory,
  Cash,
  Cash__factory,
  SportsLinkMarketFactoryV2,
  SportsLinkMarketFactoryV2__factory,
  TrustedMarketFactory,
  TrustedMarketFactory__factory,
  CryptoMarketFactory__factory,
  CryptoMarketFactory,
  MMAMarketFactory,
  MMAMarketFactory__factory,
  SportsLinkMarketFactoryV1__factory,
  SportsLinkMarketFactoryV1,
  NFLMarketFactory__factory,
  NFLMarketFactory,
  NBAMarketFactory__factory,
  MLBMarketFactory,
  NBAMarketFactory,
  MLBMarketFactory__factory,
  FuturesMarketFactory__factory,
  FuturesMarketFactory,
} from "./typechain";
import { addresses, ChainId, MarketFactorySubType, MarketFactoryType } from "./addresses";
import { Signer } from "ethers";
import { Provider } from "@ethersproject/providers";

export * from "./typechain";
export * from "./addresses";
export { calcSellCompleteSets, estimateBuy } from "./src/bmath";
export { mapOverObject } from "./src/utils/common-functions";

export interface ContractInterfaces {
  ReputationToken: Cash;
  MarketFactories: {
    marketFactory: MarketFactoryContract;
    ammFactory: AMMFactory;
    marketFactoryType: MarketFactoryType;
    marketFactorySubType: MarketFactorySubType;
  }[];
}
export type MarketFactoryContract =
  | SportsLinkMarketFactoryV1
  | SportsLinkMarketFactoryV2
  | TrustedMarketFactory
  | CryptoMarketFactory
  | FuturesMarketFactory
  | MMAMarketFactory
  | NBAMarketFactory
  | MLBMarketFactory
  | NFLMarketFactory;

export function buildContractInterfaces(signerOrProvider: Signer | Provider, chainId: ChainId): ContractInterfaces {
  const contractAddresses = addresses[chainId];
  if (typeof contractAddresses === "undefined") throw new Error(`Addresses for chain ${chainId} not found.`);

  const MarketFactories = contractAddresses.marketFactories.map(
    ({ type, subtype, address, ammFactory: ammFactoryAddress }) => {
      const marketFactory: MarketFactoryContract = instantiateMarketFactory(type, subtype, address, signerOrProvider);
      const ammFactory = AMMFactory__factory.connect(ammFactoryAddress, signerOrProvider);
      return { marketFactory, ammFactory, marketFactoryType: type, marketFactorySubType: subtype };
    }
  );

  return {
    ReputationToken: Cash__factory.connect(contractAddresses.reputationToken, signerOrProvider),
    MarketFactories,
  };
}

export function instantiateMarketFactory(
  type: MarketFactoryType,
  subtype: MarketFactorySubType,
  address: string,
  signerOrProvider: Signer | Provider
): MarketFactoryContract {
  if (type === "SportsLink") {
    if (subtype === "V1") return SportsLinkMarketFactoryV1__factory.connect(address, signerOrProvider);
    if (subtype === "V2") return SportsLinkMarketFactoryV2__factory.connect(address, signerOrProvider);
  }
  if (type === "Crypto") return CryptoMarketFactory__factory.connect(address, signerOrProvider);
  if (type === "Trusted") return TrustedMarketFactory__factory.connect(address, signerOrProvider);
  if (type === "MMA") return MMAMarketFactory__factory.connect(address, signerOrProvider);
  if (type === "NFL") return NFLMarketFactory__factory.connect(address, signerOrProvider);
  if (type === "NBA") return NBAMarketFactory__factory.connect(address, signerOrProvider);
  if (type === "MLB") return MLBMarketFactory__factory.connect(address, signerOrProvider);
  if (type === "Futures") return FuturesMarketFactory__factory.connect(address, signerOrProvider);

  throw Error(`No market factory matching type=${type} subtype=${subtype}`);
}
