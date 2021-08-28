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
export const MARKET_TYPES = [
  "Trusted",
  "Crypto",
  "SportsLink",
  "MMALink",
  "MMA",
  "NBA",
  "MLB",
  "NFL",
  "Futures",
] as const;
export type MarketFactoryType = typeof MARKET_TYPES[number];
// V1 was the first
// V2 includes initial odds
// V3 is after the major refactor
export type MarketFactorySubType = "V1" | "V2" | "V3";
export type MarketFactoryContractName =
  | "SportsLinkMarketFactoryV2"
  | "NFLMarketFactory"
  | "NBAMarketFactory"
  | "MLBMarketFactory"
  | "MMAMarketFactory"
  | "MMALinkMarketFactoryV2"
  | "CryptoMarketFactory"
  | "FuturesMarketFactory"
  | "TrustedMarketFactory";
export type FetcherContractName =
  | "NBAFetcher"
  | "MMAFetcher"
  | "NFLFetcher"
  | "MLBFetcher"
  | "CryptoFetcher"
  | "FuturesFetcher"
  | "";
export const MARKET_FACTORY_TYPE_TO_CONTRACT_NAME: {
  [Property in MarketFactoryType]: MarketFactoryContractName;
} = {
  SportsLink: "SportsLinkMarketFactoryV2",
  NFL: "NFLMarketFactory",
  MLB: "MLBMarketFactory",
  NBA: "NBAMarketFactory",
  MMA: "MMAMarketFactory",
  MMALink: "MMALinkMarketFactoryV2",
  Crypto: "CryptoMarketFactory",
  Futures: "FuturesMarketFactory",
  Trusted: "TrustedMarketFactory",
};
export const marketFactoryTypeToFetcherName: {
  [Property in MarketFactoryType]: FetcherContractName;
} = {
  SportsLink: "",
  MMALink: "",
  MMA: "MMAFetcher",
  NFL: "NFLFetcher",
  MLB: "MLBFetcher",
  NBA: "NBAFetcher",
  Crypto: "CryptoFetcher",
  Futures: "FuturesFetcher",
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
  80001: {
    reputationToken: "0x1A921b8a13372Cc81A415d02627756b5418a71c9",
    balancerFactory: "0xE152327f9700F1733d12e7a507045FB4A4606C6F",
    marketFactories: [
      {
        type: "Futures",
        subtype: "V3",
        address: "0xa70be315080511F8956B98cb04d59676ba4cb33C",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xEC83b3a1f0c8b61ed1E6c92509Cd5a672771D2Dd",
        fetcher: "0x26876235A7f0310d2668C01e3Bb4932BB0428e24",
        description: "futures",
        version: "refactor-2021.08.25",
      },
      {
        type: "Crypto",
        subtype: "V3",
        address: "0x19fBAE1A2437fd4851cAD2fF7c4001Dafad91D80",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xEC83b3a1f0c8b61ed1E6c92509Cd5a672771D2Dd",
        fetcher: "0xeF05f24952Dc308C7Ce128f3B24220Ae2E94aA41",
        description: "crypto prices",
        version: "refactor-2021.08.25",
      },
      {
        type: "MLB",
        subtype: "V3",
        address: "0x29F0614f39Af492FFC2624A5fa9eBb9cff4f7778",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xEC83b3a1f0c8b61ed1E6c92509Cd5a672771D2Dd",
        fetcher: "0xb7351Ef0FAd67e7D79F791158A819cb071a2bAC4",
        description: "mlb",
        version: "refactor-2021.08.19",
      },
      {
        type: "NBA",
        subtype: "V3",
        address: "0x181F843c1CBB73a99301827d8F076e6beF943625",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xEC83b3a1f0c8b61ed1E6c92509Cd5a672771D2Dd",
        fetcher: "0xb7351Ef0FAd67e7D79F791158A819cb071a2bAC4",
        description: "nba",
        version: "refactor-2021.08.19",
      },
      {
        type: "NFL",
        subtype: "V3",
        address: "0x48cb89F115A7c256a3520AAd4c9b5fA2841614C4",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xEC83b3a1f0c8b61ed1E6c92509Cd5a672771D2Dd",
        fetcher: "0xb7351Ef0FAd67e7D79F791158A819cb071a2bAC4",
        description: "nfl",
        version: "refactor-2021.08.19",
      },
      {
        type: "MMA",
        subtype: "V3",
        address: "0x0045FC078bb60510185CBA39f2eA352C92C0c179",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xEC83b3a1f0c8b61ed1E6c92509Cd5a672771D2Dd",
        fetcher: "0xb7351Ef0FAd67e7D79F791158A819cb071a2bAC4",
        description: "mma/ufc",
        version: "refactor-2021.08.19",
      },
      {
        type: "MMALink",
        subtype: "V2",
        address: "0xA45b74B3544dC6dF01CdbA38558C1E914779Ac8A",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "0x2a507840577A7f896C1e190701390c1b08037c61",
        description: "mma",
        version: "unknown",
      },
      {
        type: "Crypto",
        subtype: "V2",
        address: "0x615b63ea5a6dAE1e996E3a69aC70042B1D8f8517",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "",
        description: "crypto prices",
        version: "unknown",
      },
      {
        type: "SportsLink",
        subtype: "V2",
        address: "0x27394CD54b4c7f545B0e55cBB89DC0A09b41543C",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0x7e7FCb06cC1DcBD1E6AFfFC862Ed169A336fB7Ce",
        fetcher: "0xC5C415cb7eC3ca7dcC26ca7a3fC1126A07122Ec7",
        description: "mlb and nba",
        version: "unknown",
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
  31337: {
    reputationToken: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    balancerFactory: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    marketFactories: [
      {
        type: "Futures",
        subtype: "V3",
        address: "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E",
        description: "futures",
        version: "FILL THIS OUT",
      },
      {
        type: "NBA",
        subtype: "V3",
        address: "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
        description: "nba",
        version: "FILL THIS OUT",
      },
      {
        type: "MMA",
        subtype: "V3",
        address: "0x68B1D87F95878fE05B998F19b66F4baba5De1aed",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
        description: "mma/ufc",
        version: "FILL THIS OUT",
      },
      {
        type: "Crypto",
        subtype: "V3",
        address: "0x59b670e9fA9D0A427751Af201D676719a970857b",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1",
        description: "crypto prices",
        version: "FILL THIS OUT",
      },
      {
        type: "Futures",
        subtype: "V3",
        address: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        collateral: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        ammFactory: "0x9E545E3C0baAB3E08CdfD552C960A1050f373042",
        fetcher: "0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB",
        description: "futures",
        version: "FILL THIS OUT",
      },
      {
        type: "MMA",
        subtype: "V3",
        address: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
        collateral: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        ammFactory: "0x9E545E3C0baAB3E08CdfD552C960A1050f373042",
        fetcher: "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1",
        description: "mma/ufc",
        version: "FILL THIS OUT",
      },
      {
        type: "Crypto",
        subtype: "V3",
        address: "0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44",
        collateral: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        ammFactory: "0x9E545E3C0baAB3E08CdfD552C960A1050f373042",
        fetcher: "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f",
        description: "crypto prices",
        version: "FILL THIS OUT",
      },
      {
        type: "MLB",
        subtype: "V3",
        address: "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
        description: "mlb",
        version: "FILL THIS OUT",
      },
      {
        type: "NFL",
        subtype: "V3",
        address: "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
        description: "nfl",
        version: "FILL THIS OUT",
      },
    ],
    info: { uploadBlockNumber: 1, graphName: "" },
  },
  137: {
    reputationToken: "0x435C88888388D73BD97dab3B3EE1773B084E0cdd",
    balancerFactory: "0x3eC09e2A4699951179B61c03434636746aBE61AA",
    marketFactories: [
      {
        type: "Crypto",
        subtype: "V3",
        address: "0x300d2D67ecB24E63f1bC2fAC4Bc0F314607aDDE5",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0xF515d928c9dC700969723a41038eDF34ecEf2240",
        fetcher: "0x96a6e9E91BDb0114C41bB9A389eD20F7FEcDCA03",
        description: "crypto prices",
        version: "test-2021-08-27",
      },
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
};
