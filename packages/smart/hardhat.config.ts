import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
import "hardhat-contract-sizer";
import "hardhat-abi-exporter";
import "hardhat-docgen";
import "@tenderly/hardhat-tenderly";
import "hardhat-gas-reporter";

import { HardhatUserConfig } from "hardhat/config";
import "./tasks";
import { mapOverObject } from "./src/";
import { NetworkUserConfig } from "hardhat/types";

const ETHERSCAN_API_KEY = process.env["ETHERSCAN_API_KEY"] || "CH7M2ATCZABP2GIHEF3FREWWQPDFQBSH8G";

export const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
export const NO_OWNER = "0x0000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.5.15",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {},
    kovan: {
      url: "https://kovan.infura.io/v3/595111ad66e2410784d484708624f7b1",
      gas: 9000000, // to fit createPool calls, which fails to estimate gas correctly
      deployConfig: {},
    },
    arbitrumKovan4: {
      url: "https://kovan4.arbitrum.io/rpc",
      chainId: 212984383488152,
      gas: 200000000, // arbitrum has as higher gas limit and cost for contract deploys from contracts
      gasPrice: 1,
      deployConfig: {},
    },
    maticMumbai: {
      url: "https://rpc-mumbai.maticvigil.com/v1/d955b11199dbfd5871c21bdc750c994edfa52abd",
      chainId: 80001,
      deployConfig: {
        linkNode: "0x8C9c733eCd48426b9c53c38ccB60F3b307329bE1", // deployer address, for now
      },
      confirmations: 5,
    },
    maticMainnet: {
      url: "https://rpc-mainnet.maticvigil.com/",
      chainId: 137,
      gas: 10000000, // to fit createPool calls, which fails to estimate gas correctly
      gasPrice: 20000000000,
      deployConfig: {
        linkNode: "0x6FBD37365bac1fC61EAb2b35ba4024B32b136be6",
        owner: NO_OWNER,
        protocol: NULL_ADDRESS,
        externalAddresses: {
          usdcToken: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
          // reputationToken: NULL_ADDRESS, // no staking fees yet
          priceFeeds: [
            { symbol: "BTC", imprecision: 0, priceFeedAddress: "0xc907E116054Ad103354f2D350FD2514433D57F6f" },
            { symbol: "ETH", imprecision: 0, priceFeedAddress: "0xc907E116054Ad103354f2D350FD2514433D57F6f" },
            { symbol: "MATIC", imprecision: 4, priceFeedAddress: "0xc907E116054Ad103354f2D350FD2514433D57F6f" },
            { symbol: "DOGE", imprecision: 4, priceFeedAddress: "0xc907E116054Ad103354f2D350FD2514433D57F6f" },
            { symbol: "REP", imprecision: 2, priceFeedAddress: "0xc907E116054Ad103354f2D350FD2514433D57F6f" },
            { symbol: "LINK", imprecision: 2, priceFeedAddress: "0xc907E116054Ad103354f2D350FD2514433D57F6f" },
          ],
        },
      },
    },
  },
  docgen: {
    path: "./docs",
    clear: true,
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

const PRIVATE_KEY = process.env["PRIVATE_KEY"];
if (PRIVATE_KEY && config.networks) {
  config.networks = mapOverObject(config.networks, (network: string, config?: NetworkUserConfig) => {
    if (network !== "hardhat" && config) config.accounts = [PRIVATE_KEY];
    return [network, config];
  });
}

export default config;
