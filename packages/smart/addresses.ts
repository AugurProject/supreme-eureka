// This file is updated by deployer.
export interface Addresses {
  reputationToken: string;
  balancerFactory: string;
  // Lower index is newer.
  marketFactories: MarketFactory[];
  info: {
    uploadBlockNumber: number;
    graphName?: string; // optional because the graph doesn't support every network
  };
}
export interface MarketFactory {
  type: MarketFactoryType; // matches market factories that share markets
  subtype: MarketFactorySubType; // for determining which ABI to use
  address: string;
  collateral: string;
  ammFactory: string;
  fetcher: string;
  description?: string; // for humans to read
  version?: string; // release version. for humans to read
}
export type MarketFactoryType = "SportsLink" | "MMALink" | "Trusted" | "Crypto" | "NFL";
export type MarketFactorySubType = "V1" | "V2";
export type MarketFactoryContractName =
  | "SportsLinkMarketFactoryV2"
  | "NFLMarketFactory"
  | "MMALinkMarketFactory"
  | "CryptoMarketFactory"
  | "TrustedMarketFactory";
export type FetcherContractName = "NBAFetcher" | "MMAFetcher" | "";
export const marketFactoryTypeToContractName: {
  [Property in MarketFactoryType]: MarketFactoryContractName;
} = {
  SportsLink: "SportsLinkMarketFactoryV2",
  NFL: "NFLMarketFactory",
  MMALink: "MMALinkMarketFactory",
  Crypto: "CryptoMarketFactory",
  Trusted: "TrustedMarketFactory",
};
export const marketFactoryTypeToFetcherName: {
  [Property in MarketFactoryType]: FetcherContractName;
} = {
  SportsLink: "NBAFetcher",
  MMALink: "MMAFetcher",
  NFL: "NBAFetcher",
  Crypto: "",
  Trusted: "",
};
export enum ChainId {
  Mainnet = 1,
  Ropsten = 3,
  Rinkeby = 4,
  Kovan = 42,
  HardHat = 31337,
  ArbitrumKovan4 = 212984383488152,
  MaticMumbai = 80001,
  MaticMainnet = 137,
}
export const graphChainNames: {
  [chainId: number]: string;
} = {
  1: "mainnet",
  3: "ropsten",
  4: "rinkeby",
  42: "kovan",
  80001: "mumbai",
  137: "matic",
};
type AddressMapping = {
  [id in ChainId]?: Addresses;
};
export const addresses: AddressMapping = {
  137: {
    reputationToken: "0x435C88888388D73BD97dab3B3EE1773B084E0cdd",
    balancerFactory: "0x3eC09e2A4699951179B61c03434636746aBE61AA",
    marketFactories: [
      {
        type: "SportsLink",
        subtype: "V2",
        address: "0xA76C803c1D3B4cc31b1B964f29357BbF23B6D6f7",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0xF515d928c9dC700969723a41038eDF34ecEf2240",
        fetcher: "0x1F26275cf999B33Eb39f304E622adbe0C5214Cbf",
        description: "mlb and nba",
        version: "v1.1.0",
      },
      {
        type: "MMALink",
        subtype: "V2",
        address: "0xe296e39b44911a7fd4C741daa4eFDd345bF5a076",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0xF515d928c9dC700969723a41038eDF34ecEf2240",
        fetcher: "0xAE9df5bf273bfF861174194ca190e99e95a15a26",
        description: "mma",
        version: "v1.1.0",
      },
      {
        type: "SportsLink",
        subtype: "V1",
        address: "0xEFA66e55707C43Db47D43fD65c2Ab4e861e989B6",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0x63BBEEa5085E94D1F57A5938f9a22dd485572Bb3",
        fetcher: "",
        description: "mlb and nba",
        version: "v1.0.0",
      },
      {
        type: "Crypto",
        subtype: "V2",
        address: "0x8105DFaDBE4a09f52EbF98eB68e31a33C898Fc74",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0xF515d928c9dC700969723a41038eDF34ecEf2240",
        fetcher: "",
        description: "crypto prices",
        version: "v1.1.0",
      },
    ],
    info: { uploadBlockNumber: 15336699, graphName: "matic" },
  },
  80001: {
    reputationToken: "0x1A921b8a13372Cc81A415d02627756b5418a71c9",
    balancerFactory: "0xE152327f9700F1733d12e7a507045FB4A4606C6F",
    marketFactories: [
      {
        type: "Crypto",
        subtype: "V2",
        address: "0xBFA328b8f1a8C862133377c4c9FB3d17e0779B8b",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "",
        description: "crypto prices",
        version: "FILL THIS OUT",
      },
      {
        type: "NFL",
        subtype: "V2",
        address: "0x8524e46E1B0823Ba23454e211e05A4C488020ABC",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "0xC5C415cb7eC3ca7dcC26ca7a3fC1126A07122Ec7",
        description: "nfl",
        version: "FILL THIS OUT",
      },
      {
        type: "MMALink",
        subtype: "V2",
        address: "0xA45b74B3544dC6dF01CdbA38558C1E914779Ac8A",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "0x2a507840577A7f896C1e190701390c1b08037c61",
        description: "mma",
        version: "FILL THIS OUT",
      },
      {
        type: "Crypto",
        subtype: "V2",
        address: "0x615b63ea5a6dAE1e996E3a69aC70042B1D8f8517",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "",
        description: "crypto prices",
        version: "FILL THIS OUT",
      },
      {
        type: "SportsLink",
        subtype: "V2",
        address: "0x27394CD54b4c7f545B0e55cBB89DC0A09b41543C",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "0xC5C415cb7eC3ca7dcC26ca7a3fC1126A07122Ec7",
        description: "mlb and nba",
        version: "FILL THIS OUT",
      },
      {
        type: "MMALink",
        subtype: "V2",
        address: "0x39Fb172fCBFBf8E594cA15a31B3bBd88E50C9B68",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xf098b85047CfB29840a3a43194AbCb31d5C53E16",
        fetcher: "0x9f1DB2B2C81eAF3F96D8d942e2D515dE17975A2A",
        description: "mma",
        version: "v1.1.0",
      },
    ],
    info: { uploadBlockNumber: 15336699, graphName: "mumbai" },
  },
};
