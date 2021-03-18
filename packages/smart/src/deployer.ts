import {
  Cash__factory,
  FeePot__factory,
  TrustedArbiter__factory,
  TurboHatchery__factory,
  TurboShareTokenFactory__factory,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish, Contract } from "ethers";
import { mapOverObject } from "./util";
import { Configuration, isContractDeployProductionConfig, isContractDeployTestConfig } from "./configuration";

export class Deployer {
  constructor(readonly signer: SignerWithAddress, readonly config: Configuration) {}

  async deploy() {
    switch (this.config?.contractDeploy?.strategy) {
      case "test":
        return this.deployTest();
      case "production":
        return this.deployProduction();
      default:
        throw Error("To deploy, config must contain contractDeploy");
    }
  }

  // Deploys the test contracts (faucets etc)
  async deployTest() {
    const collateral = await this.deployCash("USDC", "USDC", 18);
    const reputationToken = await this.deployCash("REPv2", "REPv2", 18);

    const turboShareTokenFactory = await this.deployTurboShareTokenFactory();
    const feePot = await this.deployFeePot(collateral.address, reputationToken.address);
    const turboHatchery = await this.deployTurboHatchery(turboShareTokenFactory.address, feePot.address);

    console.log("Initializing turboShareTokenFactory");
    await turboShareTokenFactory.initialize(turboHatchery.address);

    const arbiter = await this.deployTrustedArbiter(this.signer.address, turboHatchery.address);

    return mapOverObject(
      {
        collateral,
        reputationToken,
        turboHatchery,
        turboShareTokenFactory,
        feePot,
        arbiter,
      },
      (name, contract) => [name, contract.address]
    );
  }

  async deployProduction() {
    if (!isContractDeployProductionConfig(this.config?.contractDeploy))
      throw Error(`Use test config for deploy not ${JSON.stringify(this.config.contractDeploy)}`);
    const { collateral, reputationToken } = this.config.contractDeploy.externalAddresses;

    const turboShareTokenFactory = await this.deployTurboShareTokenFactory();
    const feePot = await this.deployFeePot(collateral, reputationToken);
    const turboHatchery = await this.deployTurboHatchery(turboShareTokenFactory.address, feePot.address);

    console.log("Initializing turboShareTokenFactory");
    await turboShareTokenFactory.initialize(turboHatchery.address);
  }

  async deployCash(name: string, symbol: string, decimals: BigNumberish) {
    return this.logDeploy(name, () => new Cash__factory(this.signer).deploy(name, symbol, decimals));
  }

  async deployTurboShareTokenFactory() {
    return this.logDeploy("turboShareTokenFactory", () => new TurboShareTokenFactory__factory(this.signer).deploy());
  }

  async deployFeePot(collateral: string, reputationToken: string) {
    return this.logDeploy("feePot", () => new FeePot__factory(this.signer).deploy(collateral, reputationToken));
  }

  async deployTurboHatchery(turboShareTokenFactory: string, feePot: string) {
    return this.logDeploy("turboHatchery", () =>
      new TurboHatchery__factory(this.signer).deploy(turboShareTokenFactory, feePot)
    );
  }

  async deployTrustedArbiter(owner: string, hatchery: string) {
    return this.logDeploy("trustedArbiter", () => new TrustedArbiter__factory(this.signer).deploy(owner, hatchery));
  }

  async logDeploy<T extends Contract>(name: string, deployFn: (this: Deployer) => Promise<T>) {
    console.log(`Deploying ${name}`);
    const contract = await deployFn.bind(this)();
    console.log(`Deployed ${name}: ${contract.address}`);
    return contract;
  }
}
