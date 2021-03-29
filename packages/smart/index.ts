import {
  AMMFactory,
  AMMFactory__factory,
  Cash,
  Cash__factory,
  HatcheryRegistry,
  HatcheryRegistry__factory,
  TrustedArbiter__factory,
  TurboHatchery,
  TurboHatchery__factory,
  TrustedArbiter,
} from "./typechain";
import { addresses, ChainId } from "./addresses";
import { Signer } from "ethers";
import { Provider } from "@ethersproject/providers";

export * from "./typechain";
export * from "./addresses";

export interface ContractInterfaces {
  AMMFactory: AMMFactory;
  Hatchery: TurboHatchery;
  HatcheryRegistry: HatcheryRegistry;
  ReputationToken: Cash;
  TrustedArbiter: TrustedArbiter;
}

export function buildContractInterfaces(signerOrProvider: Signer | Provider, chainId: ChainId): ContractInterfaces {
  const contractAddresses = addresses[chainId];
  if (typeof contractAddresses === "undefined") throw new Error(`Addresses for chain ${chainId} not found.`);

  return {
    AMMFactory: AMMFactory__factory.connect(contractAddresses.ammFactory, signerOrProvider),
    Hatchery: TurboHatchery__factory.connect(contractAddresses.hatchery, signerOrProvider),
    HatcheryRegistry: HatcheryRegistry__factory.connect(contractAddresses.hatcheryRegistry, signerOrProvider),
    ReputationToken: Cash__factory.connect(contractAddresses.reputationToken, signerOrProvider),
    TrustedArbiter: TrustedArbiter__factory.connect(contractAddresses.arbiter, signerOrProvider),
  };
}
