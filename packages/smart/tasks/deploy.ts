import { extendConfig, HardhatUserConfig, task } from "hardhat/config";
import { ethers } from "ethers";

import { EthersFastSubmitWallet } from "../src";
import "hardhat/types/config";
import {
  HardhatConfig,
  HardhatNetworkAccountConfig,
  HardhatNetworkAccountsConfig,
  HardhatNetworkConfig,
  HardhatRuntimeEnvironment,
  HttpNetworkConfig,
  HttpNetworkUserConfig,
  NetworkConfig,
  NetworkUserConfig,
} from "hardhat/types";

task("deploy", "Deploy Turbo").setAction(async (args, hre, runSuper) => {
  await runSuper(args);

  // Verify deploy
  if (["kovan", "mainnet"].includes(hre.network.name)) {
    console.log("Verifying deployment on etherscan");
    await hre.run("etherscan-verify", hre.config.etherscan);
  } else if (["maticMumbai", "maticMainnet"].includes(hre.network.name)) {
    console.log("Verifying deployment on tenderly");
    await hre.run("tenderly:verify:all");
  } else {
    console.log("Skipping verification of deployment");
  }
});

export interface DeployConfig {
  externalAddresses?: ExternalAddresses;

  // On deploy, these default to deployer. They can be changed later.
  linkNode?: string; // address of link node running cron-initiated jobs to create and resolve markets
  owner?: string; // address which will own (control fees etc) the market factory
  protocol?: string; // address that receives protocol fees
}

export interface ExternalAddresses {
  reputationToken?: string;
  usdcToken?: string; // address of USDC collateral. also the test collateral
  balancerFactory?: string;
  priceFeeds?: PriceFeedConfig[];
}

export interface PriceFeedConfig {
  symbol: string;
  priceFeedAddress: string;
  imprecision: number;
}

declare module "hardhat/types/config" {
  export interface HardhatNetworkUserConfig {
    confirmations?: number;
  }

  export interface HardhatNetworkConfig {
    confirmations: number; // block confirmations before treating a tx as complete. not used in deploy
  }

  export interface HttpNetworkUserConfig {
    confirmations?: number;
  }

  export interface HttpNetworkConfig {
    confirmations: number; // block confirmations before treating a tx as complete. not used in deploy
  }
}

extendConfig((config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
  if (!userConfig.networks) return;

  if (userConfig.networks) {
    for (const networkName of Object.keys(userConfig.networks)) {
      const networkConfig = userConfig.networks[networkName];
      if (isHttpNetworkUserConfig(networkConfig)) {
        (config.networks[networkName] as HttpNetworkConfig).confirmations = networkConfig.confirmations || 0;
      }
    }
  }
});

export function isHttpNetworkConfig(networkConfig?: NetworkConfig): networkConfig is HttpNetworkConfig {
  return (networkConfig as HttpNetworkConfig)?.url !== undefined;
}

export function isHttpNetworkUserConfig(networkConfig?: NetworkUserConfig): networkConfig is HttpNetworkUserConfig {
  return (networkConfig as HttpNetworkUserConfig)?.url !== undefined; // will always need a url anyway
}

export function isHardhatNetworkConfig(networkConfig: NetworkConfig): networkConfig is HardhatNetworkConfig {
  return (networkConfig as HttpNetworkConfig).url === undefined;
}

export function isHardhatNetworkAccountConfig(
  accountConfig: HardhatNetworkAccountsConfig
): accountConfig is HardhatNetworkAccountConfig[] {
  return Array.isArray(accountConfig);
}

export async function makeSigner(hre: HardhatRuntimeEnvironment): Promise<ethers.Signer> {
  const provider = hre.ethers.provider;

  // talk to a node
  if (isHttpNetworkConfig(hre.network.config) && Array.isArray(hre.network.config.accounts)) {
    const { accounts, gas, gasPrice } = hre.network.config;
    const [privateKey] = accounts;
    const wallet = await EthersFastSubmitWallet.create(privateKey, provider);
    wallet.gasLimit = gas;
    wallet.gasPrice = gasPrice;
    return wallet;
  } else if (isHardhatNetworkConfig(hre.network.config)) {
    if (isHardhatNetworkAccountConfig(hre.network.config.accounts)) {
      const { accounts } = hre.network.config;
      const [account] = accounts;
      const { privateKey } = account;
      return EthersFastSubmitWallet.create(privateKey, provider);
    }
  }

  const [signer] = await hre.ethers.getSigners();
  return signer;
}
