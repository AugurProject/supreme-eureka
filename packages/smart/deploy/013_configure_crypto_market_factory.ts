import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { PriceFeedConfig } from "../tasks";
import { CryptoMarketFactory, CryptoMarketFactory__factory } from "../typechain";
import { PRICE_FEEDS } from "../src";
import { DeploymentsExtension } from "hardhat-deploy/dist/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer, owner } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const marketFactory = CryptoMarketFactory__factory.connect(
    (await deployments.get("CryptoMarketFactory")).address,
    signer
  );

  if (await shouldAddCoins(marketFactory)) {
    for (const { symbol, priceFeedAddress, imprecision } of await getCoinList(deployments)) {
      console.log(`Adding coin "${symbol}" to crypto market factory, with feed "${priceFeedAddress}"`);
      await marketFactory.addCoin(symbol, priceFeedAddress, imprecision);
    }
  } else {
    console.log("Not configuring coins for crypto market factory because it already has coins");
  }

  // finished with setup so can now set owner
  if (owner !== deployer) {
    console.log(
      `Transferring ownership of crypto market factory ${marketFactory.address} from ${deployer} to ${owner}`
    );
    await marketFactory.transferOwnership(owner);
  }
};

async function shouldAddCoins(marketFactory: CryptoMarketFactory): Promise<boolean> {
  const coinCount = (await marketFactory.getCoins()).length;
  // 1 because index 0 is fake coin, so length of 1 means there are no added coins
  return coinCount == 1;
}

// If the price feeds are specified then use them. Else, use fake coins.
async function getCoinList(deployments: DeploymentsExtension): Promise<PriceFeedConfig[]> {
  return await Promise.all(
    PRICE_FEEDS.map(async (coin) => ({
      symbol: coin.symbol,
      priceFeedAddress: (await deployments.get(coin.deploymentName)).address,
      imprecision: coin.imprecision,
    }))
  );
}

func.tags = ["ConfigureCryptoMarketFactory"];
func.dependencies = ["CryptoMarketFactory"];

export default func;
