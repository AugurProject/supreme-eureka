import { Web3Provider } from "@ethersproject/providers";
import { InjectedConnector } from "@web3-react/injected-connector";
import { WalletConnectConnector } from "@web3-react/walletconnect-connector";
import { NetworkConnector } from "./NetworkConnector";
import { ChainId } from "@uniswap/sdk";
import { DEFAULT_NETWORK_ID } from "../../../stores/constants";

export const NETWORK_CHAIN_ID = DEFAULT_NETWORK_ID || ChainId.MUMBAI;

const NETWORK_URL =
  DEFAULT_NETWORK_ID === String(ChainId.MATIC)
    ? "https://matic-mainnet-full-rpc.bwarelabs.com"
    : "https://rpc-mumbai.maticvigil.com"

if (typeof NETWORK_URL === "undefined") {
  throw new Error(`NETWORK_CHAIN_ID must be a defined environment variable`);
}

export const network = new NetworkConnector({
  urls: { [DEFAULT_NETWORK_ID]: NETWORK_URL }
});

let networkLibrary: Web3Provider | undefined;
export function getNetworkLibrary(): Web3Provider {
  return (networkLibrary = networkLibrary ?? new Web3Provider(network.provider as any));
}

export const injected = new InjectedConnector({
  supportedChainIds: [1, 137, 80001]
});

export const walletconnect = new WalletConnectConnector({
  rpc: { [DEFAULT_NETWORK_ID]: NETWORK_URL },
  qrcode: true,
  pollingInterval: 15000
});
