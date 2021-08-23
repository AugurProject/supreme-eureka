import { bignumber, calcWei, getERC20Name } from "../src/utils/tasks";

import { task, types } from "hardhat/config";

import "hardhat/types/config";
import { makeSigner } from "./deploy";
import { BigNumber } from "ethers";
import { Cash__factory } from "../typechain";

task("faucetCash", "faucet fake collateral. assumes USDC")
  .addParam("address", "address of collateral token", undefined, types.string)
  .addParam("large", "how many typical units to faucet. ex: for USDC these are 'dollars'", BigNumber.from(0), bignumber)
  .addParam(
    "small",
    "how many of the smallest units to faucet. colloquially 'wei'. ex: for USDC these are 1/10000th of a cent",
    BigNumber.from(0),
    bignumber
  )
  .setAction(async ({ address, large, small }: { address: string; large: BigNumber; small: BigNumber }, hre) => {
    const signer = await makeSigner(hre);
    const confirmations = hre.network.config.confirmations || 0;
    const contract = Cash__factory.connect(address, signer);

    const { wei, weiDesc } = await calcWei(contract, small, large, false);

    const name = (await getERC20Name(contract)) || "collateral";

    console.log(`Fauceting ${weiDesc} for ${name} (${address})`);
    await contract.faucet(wei).then((tx) => tx.wait(confirmations));
    console.log("Done.");
  });
