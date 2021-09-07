import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { MasterChef__factory } from "../typechain";
import { BigNumber } from "ethers";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const signer = await hre.ethers.getSigner(deployer);

  const masterChefDeploy = await deployments.get("MasterChef");
  const masterChef = MasterChef__factory.connect(masterChefDeploy.address, signer);

  const rewardsPerMarket = BigNumber.from(10).pow(18).mul(195);
  const rewardDaysPerMarket = BigNumber.from(5);
  const earlyDepositBonusRewards = BigNumber.from(0);

  await deployments
    .get("CryptoMarketFactory")
    .then(({ address }) =>
      masterChef.addRewards(address, rewardsPerMarket, rewardDaysPerMarket, earlyDepositBonusRewards)
    );
  await deployments
    .get("NBAMarketFactory")
    .then(({ address }) =>
      masterChef.addRewards(address, rewardsPerMarket, rewardDaysPerMarket, earlyDepositBonusRewards)
    );
  await deployments
    .get("MLBMarketFactory")
    .then(({ address }) =>
      masterChef.addRewards(address, rewardsPerMarket, rewardDaysPerMarket, earlyDepositBonusRewards)
    );
  await deployments
    .get("MMAMarketFactory")
    .then(({ address }) =>
      masterChef.addRewards(address, rewardsPerMarket, rewardDaysPerMarket, earlyDepositBonusRewards)
    );
  await deployments
    .get("NFLMarketFactory")
    .then(({ address }) =>
      masterChef.addRewards(address, rewardsPerMarket, rewardDaysPerMarket, earlyDepositBonusRewards)
    );
};

func.tags = ["ApproveMarketFactories"];
func.dependencies = [
  "MasterChef",
  "NBAMarketFactory",
  "MLBMarketFactory",
  "MMAMarketFactory",
  "NFLMarketFactory",
  "CryptoMarketFactory",
];

export default func;
