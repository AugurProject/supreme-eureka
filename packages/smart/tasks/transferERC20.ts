import { task, types } from "hardhat/config";

import "hardhat/types/config";
import { makeSigner } from "./deploy";
import { BigNumber } from "ethers";
import { IERC20Full__factory } from "../typechain";
import { bignumber, calcWei, getERC20Name } from "../src/utils/tasks";

task("transferERC20", "transfers ERC20 tokens")
  .addParam("erc20", "address of ERC20 token", undefined, types.string)
  .addParam("large", "how many typical units to transfer. ex: for USDC these are 'dollars'", 0, bignumber)
  .addParam(
    "small",
    "how many of the smallest units to transfer. ex: for USDC these are 1/10000th of a cent",
    "0",
    bignumber
  )
  .addParam("recipient", "address to receive the ERC20 tokens", undefined, types.string)
  .setAction(
    async (
      { erc20, large, small, recipient }: { erc20: string; large: BigNumber; small: BigNumber; recipient: string },
      hre
    ) => {
      const signer = await makeSigner(hre);
      if (small.eq(0) && large.eq(0)) throw Error("Must specify --large or --small");

      const confirmations = hre.network.config.confirmations || 0;

      const contract = IERC20Full__factory.connect(erc20, signer);

      const name = (await getERC20Name(contract)) || "unknown";
      const { wei, weiDesc } = await calcWei(contract, small, large, false);

      console.log(`Transferring ${weiDesc} of ${name} token (${erc20}) to ${recipient}`);
      await contract.transfer(recipient, wei).then((tx) => tx.wait(confirmations));
      console.log("Done.");
    }
  );
