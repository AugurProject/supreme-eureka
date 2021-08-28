import { task, types } from "hardhat/config";

import "hardhat/types/config";
import { makeSigner } from "./deploy";
import { BigNumber } from "ethers";
import { IERC20Full__factory } from "../typechain";
import { bignumber, calcWei, getERC20Name } from "../src/utils/tasks";

task("approveERC20", "approve someone to spend your ERC20 tokens")
  .addParam("erc20", "address of ERC20 token", undefined, types.string)
  .addParam(
    "large",
    "how many typical units to approve. ex: for USDC these are 'dollars'",
    BigNumber.from(0),
    bignumber
  )
  .addParam(
    "small",
    "how many of the smallest units to approve. colloquially 'wei'. ex: for USDC these are 1/10000th of a cent",
    BigNumber.from(0),
    bignumber
  )
  .addParam("all", "approve to spend all of your ERC20 tokens", false, types.boolean)
  .addParam("spender", "address approved to spend your ERC20 tokens", undefined, types.string)
  .setAction(
    async (
      {
        erc20,
        large,
        small,
        all,
        spender,
      }: { erc20: string; large: BigNumber; small: BigNumber; all: boolean; spender: string },
      hre
    ) => {
      if (!all && small.eq(0) && large.eq(0)) throw Error("Must specify --large, --small, or --all");

      const signer = await makeSigner(hre);
      const confirmations = hre.network.config.confirmations || 0;
      const contract = IERC20Full__factory.connect(erc20, signer);

      const name = (await getERC20Name(contract)) || "unknown";
      const { wei, weiDesc } = await calcWei(contract, small, large, all);

      console.log(`Approving ${spender} to spend ${weiDesc} of your ${name} token (${erc20})`);
      await contract.approve(spender, wei).then((tx) => tx.wait(confirmations));
      console.log("Done.");
    }
  );
