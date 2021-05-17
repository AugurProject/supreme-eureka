import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
import "hardhat-contract-sizer";
import "hardhat-abi-exporter";
import "hardhat-docgen";
import "@tenderly/hardhat-tenderly";

import { HardhatUserConfig } from "hardhat/config";
import "./tasks";
import { mapOverObject } from "./src/";
import { NetworkUserConfig } from "hardhat/types";
import { SOLIDITY } from "./hardhatCommon";

const ETHERSCAN_API_KEY = process.env["ETHERSCAN_API_KEY"] || "CH7M2ATCZABP2GIHEF3FREWWQPDFQBSH8G";

const config: HardhatUserConfig = {
  solidity: SOLIDITY,
  networks: {
    hardhat: {},
    kovan: {
      url: "https://kovan.infura.io/v3/595111ad66e2410784d484708624f7b1",
      gas: 9000000, // to fit createPool calls, which fails to estimate gas correctly
      linkTokenAddress: "0xa36085F69e2889c224210F603D836748e7dC0088",
    },
    arbitrumKovan4: {
      url: "https://kovan4.arbitrum.io/rpc",
      chainId: 212984383488152,
      gas: 200000000, // arbitrum has as higher gas limit and cost for contract deploys from contracts
      gasPrice: 1,
      linkTokenAddress: "0x514910771af9ca656af840dff83e8264ecf986ca", // same as mainnet
    },
    maticMumbai: {
      url: "https://rpc-mumbai.maticvigil.com/v1/d955b11199dbfd5871c21bdc750c994edfa52abd",
      chainId: 80001,
      gas: 10000000, // to fit createPool calls, which fails to estimate gas correctly
      gasPrice: 20000000000,
      linkTokenAddress: "0x514910771af9ca656af840dff83e8264ecf986ca", // same as mainnet
      linkNode: "0x6FBD37365bac1fC61EAb2b35ba4024B32b136be6",
    },
  },
  contractDeploy: {
    strategy: "test",
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
