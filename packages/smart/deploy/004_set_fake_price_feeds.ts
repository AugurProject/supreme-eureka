import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { FakePriceFeed__factory } from "../typechain";
import { PRICE_FEEDS } from "../src";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const signer = await hre.ethers.getSigner(deployer);

  for (const coin of PRICE_FEEDS) {
    const { address } = await deployments.get(coin.deploymentName);
    const priceFeed = FakePriceFeed__factory.connect(address, signer);
    const data = await priceFeed.latestRoundData();

    if (!data._answer.eq(0)) {
      if (hre.network.config.live)
        console.log(`Skipping setting price feed for ${coin.symbol} because it's already set`);
      continue;
    }

    if (hre.network.config.live) console.log(`Setting price feed for ${coin.symbol} to ${address}`);
    await priceFeed.addRound(1, coin.price, 2, 4, 1); // arbitrary values
  }
};

func.tags = ["SetPriceFeeds"];
func.dependencies = ["PriceFeeds"];

export default func;
