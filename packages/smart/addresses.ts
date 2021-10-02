// This file is updated by deployer.
import { AddressMapping } from "./constants";
export const addresses: AddressMapping = {
  31337: {
    reputationToken: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    balancerFactory: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    marketFactories: [
      {
        type: "Grouped",
        subtype: "V3",
        address: "0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0x9E545E3C0baAB3E08CdfD552C960A1050f373042",
        fetcher: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        hasRewards: false,
        description: "Grouped",
        version: "FILL THIS OUT",
      },
      {
        type: "Crypto",
        subtype: "V3",
        address: "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0x9E545E3C0baAB3E08CdfD552C960A1050f373042",
        fetcher: "0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44",
        hasRewards: false,
        description: "crypto prices",
        version: "FILL THIS OUT",
      },
      {
        type: "Grouped",
        subtype: "V3",
        address: "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E",
        hasRewards: false,
        description: "Grouped",
        version: "FILL THIS OUT",
      },
      {
        type: "NBA",
        subtype: "V3",
        address: "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
        collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        ammFactory: "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
        fetcher: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
        hasRewards: false,
        description: "nba",
        version: "FILL THIS OUT",
      },
    ],
    info: { uploadBlockNumber: 1, graphName: "" },
  },
  80001: {
    reputationToken: "0x1A921b8a13372Cc81A415d02627756b5418a71c9",
    balancerFactory: "0xE152327f9700F1733d12e7a507045FB4A4606C6F",
    marketFactories: [
      {
        type: "Grouped",
        subtype: "V3",
        address: "0x30Aee569069cdB9C4E71cE61151f32483A6b69DA",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xDcf4173FC3947bC2CbAB929559b7f38Cb25Bef34",
        fetcher: "0x0A76b0293dBaFd04A1a028879Bd5D3EBD55215D2",
        hasRewards: true,
        masterChef: "0xa976cb47C216Ee71089b10383bDEa4e230551458",
        description: "grouped",
        version: "FILL THIS OUT",
      },
      {
        type: "MLB",
        subtype: "V3",
        address: "0xcBc0E622254412063f90829e8CfAA930BcA066Bb",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xDcf4173FC3947bC2CbAB929559b7f38Cb25Bef34",
        fetcher: "0x7b78ebE62C39E2d3c5CE7c203aD1D1C7299b7463",
        hasRewards: true,
        masterChef: "0xa976cb47C216Ee71089b10383bDEa4e230551458",
        description: "mlb",
        version: "FILL THIS OUT",
      },
      {
        type: "NBA",
        subtype: "V3",
        address: "0x180b0c4F637dFcEad2F17964EEb302F936AaA02a",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xDcf4173FC3947bC2CbAB929559b7f38Cb25Bef34",
        fetcher: "0x7b78ebE62C39E2d3c5CE7c203aD1D1C7299b7463",
        hasRewards: true,
        masterChef: "0xa976cb47C216Ee71089b10383bDEa4e230551458",
        description: "nba",
        version: "FILL THIS OUT",
      },
      {
        type: "NFL",
        subtype: "V3",
        address: "0x36De5172185E819671b1D752A8EB0d1cFf6B95ee",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xDcf4173FC3947bC2CbAB929559b7f38Cb25Bef34",
        fetcher: "0x7b78ebE62C39E2d3c5CE7c203aD1D1C7299b7463",
        hasRewards: true,
        masterChef: "0xa976cb47C216Ee71089b10383bDEa4e230551458",
        description: "nfl",
        version: "FILL THIS OUT",
      },
      {
        type: "MMA",
        subtype: "V3",
        address: "0x62a790F5A710f46d618fB0243Cb440ed13f02655",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xDcf4173FC3947bC2CbAB929559b7f38Cb25Bef34",
        fetcher: "0x7b78ebE62C39E2d3c5CE7c203aD1D1C7299b7463",
        hasRewards: true,
        masterChef: "0xa976cb47C216Ee71089b10383bDEa4e230551458",
        description: "mma/ufc",
        version: "FILL THIS OUT",
      },
      {
        type: "Crypto",
        subtype: "V3",
        address: "0xDf73B0ed460242EB8203312871221F1eE0c82FF3",
        collateral: "0x5799bFe361BEea69f808328FF4884DF92f1f66f0",
        ammFactory: "0xDcf4173FC3947bC2CbAB929559b7f38Cb25Bef34",
        fetcher: "0xAE31727e99A8Fe75BFDE40F4bb5f76914b9C8Ce2",
        hasRewards: true,
        masterChef: "0xa976cb47C216Ee71089b10383bDEa4e230551458",
        description: "crypto prices",
        version: "FILL THIS OUT",
      },
    ],
    info: { uploadBlockNumber: 15336699, graphName: "mumbai" },
  },
  137: {
    reputationToken: "0x435C88888388D73BD97dab3B3EE1773B084E0cdd",
    balancerFactory: "0x3eC09e2A4699951179B61c03434636746aBE61AA",
    marketFactories: [
      {
        type: "MLB",
        subtype: "V3",
        address: "0x03810440953e2BCd2F17a63706a4C8325e0aBf94",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0x79C3CF0553B6852890E8BA58878a5bCa8b06d90C",
        fetcher: "0xcC1732aDb06fC433756bd17eb064d2Bb18f0Ca20",
        hasRewards: true,
        masterChef: "0x1486AE5344C0239d5Ec6198047a33454c25E1ffD",
        description: "mlb",
        version: "v1.4.0",
      },
      {
        type: "NBA",
        subtype: "V3",
        address: "0xe696B8fa35e487c3A02c2444777c7a2EF6cd0297",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0x79C3CF0553B6852890E8BA58878a5bCa8b06d90C",
        fetcher: "0xcC1732aDb06fC433756bd17eb064d2Bb18f0Ca20",
        hasRewards: true,
        masterChef: "0x1486AE5344C0239d5Ec6198047a33454c25E1ffD",
        description: "nba",
        version: "1.4.0",
      },
      {
        type: "NFL",
        subtype: "V3",
        address: "0x1f3eF7cA2b2ca07a397e7BC1bEb8c3cffc57E95a",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0x79C3CF0553B6852890E8BA58878a5bCa8b06d90C",
        fetcher: "0xcC1732aDb06fC433756bd17eb064d2Bb18f0Ca20",
        hasRewards: true,
        masterChef: "0x1486AE5344C0239d5Ec6198047a33454c25E1ffD",
        description: "nfl",
        version: "1.4.0",
      },
      {
        type: "MMA",
        subtype: "V3",
        address: "0x6D2e53d53aEc521dec3d53C533E6c6E60444c655",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0x79C3CF0553B6852890E8BA58878a5bCa8b06d90C",
        fetcher: "0xcC1732aDb06fC433756bd17eb064d2Bb18f0Ca20",
        hasRewards: true,
        masterChef: "0x1486AE5344C0239d5Ec6198047a33454c25E1ffD",
        description: "mma/ufc",
        version: "1.4.0",
      },
      {
        type: "Crypto",
        subtype: "V3",
        address: "0x48725baC1C27C2DaF5eD7Df22D6A9d781053Fec1",
        collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        ammFactory: "0x79C3CF0553B6852890E8BA58878a5bCa8b06d90C",
        fetcher: "0xc4805d6a809D578691fEC7B39231B2EF2D261Fa5",
        hasRewards: true,
        masterChef: "0x1486AE5344C0239d5Ec6198047a33454c25E1ffD",
        description: "crypto prices",
        version: "1.4.0",
      }
    ],
    info: { uploadBlockNumber: 15336699, graphName: "matic" },
  },
};
