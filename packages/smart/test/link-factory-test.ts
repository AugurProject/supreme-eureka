import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";

import {
  AMMFactory,
  AMMFactory__factory,
  BFactory__factory,
  Cash,
  Cash__factory,
  FeePot,
  FeePot__factory,
  MasterChef__factory,
  MMAFetcher,
  MMAFetcher__factory,
  MMALinkMarketFactory,
  MMALinkMarketFactory__factory,
  NBAFetcher,
  NBAFetcher__factory,
  OwnedERC20__factory,
  SportsLinkMarketFactoryV2,
  SportsLinkMarketFactoryV2__factory,
} from "../typechain";
import { BigNumber, BigNumberish } from "ethers";
import {
  calcShareFactor,
  createMMADynamicMarketBundle,
  createMMAMarketFactoryBundle,
  createMMAStaticMarketBundle,
  createNBADynamicMarketBundle,
  createNBAMarketFactoryBundle,
  createNBAStaticMarketBundle,
  NULL_ADDRESS,
  SportsLinkEventStatus,
} from "../src";

const BONE = BigNumber.from(10).pow(18);
const INITIAL_TOTAL_SUPPLY_OF_BPOOL = BigNumber.from(10).pow(20);
const ZERO = BigNumber.from(0);

describe("LinkFactory", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const eventId = 9001;
  const homeTeamId = 42;
  const awayTeamId = 1881;
  const moneylines: [number, number] = [-130, +270]; // [home,away]
  const homeSpread = 40;
  const overUnderTotal = 60;
  const sportId = 4;
  const smallFee = BigNumber.from(10).pow(16);

  const now = BigNumber.from(Date.now()).div(1000);
  const estimatedStartTime = now.add(60 * 60 * 24); // one day

  let collateral: Cash;
  let feePot: FeePot;
  let marketFactory: SportsLinkMarketFactoryV2;
  let headToHeadMarketId: BigNumber;
  let spreadMarketId: BigNumber;
  let overUnderMarketId: BigNumber;

  let shareFactor: BigNumber;

  it("is deployable", async () => {
    collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);
    shareFactor = calcShareFactor(await collateral.decimals());

    marketFactory = await new SportsLinkMarketFactoryV2__factory(signer).deploy(
      signer.address,
      collateral.address,
      shareFactor,
      feePot.address,
      smallFee,
      smallFee,
      signer.address,
      smallFee,
      signer.address, // pretending the deployer is a link node for testing purposes
      sportId
    );

    expect(await marketFactory.getOwner()).to.equal(signer.address);
    expect(await marketFactory.feePot()).to.equal(feePot.address);
    expect(await marketFactory.collateral()).to.equal(collateral.address);
  });

  it("can create markets", async () => {
    await marketFactory.createMarket(
      eventId,
      homeTeamId,
      awayTeamId,
      estimatedStartTime,
      homeSpread,
      overUnderTotal,
      true,
      true,
      moneylines
    );

    const filter = marketFactory.filters.MarketCreated(null, null, null, null, eventId, null, null, null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length).to.equal(3);
    const [headToHeadLog, spreadLog, overUnderLog] = logs.map((log) => log.args);

    [headToHeadMarketId] = headToHeadLog;
    [spreadMarketId] = spreadLog;
    [overUnderMarketId] = overUnderLog;

    expect(headToHeadMarketId).to.equal(1);
    expect(spreadMarketId).to.equal(2);
    expect(overUnderMarketId).to.equal(3);
  });

  it("head to head market is correct", async () => {
    const headToHeadMarket = await marketFactory.getMarket(headToHeadMarketId);
    const [noContest, away, home] = headToHeadMarket.shareTokens.map((addr) =>
      OwnedERC20__factory.connect(addr, signer)
    );
    expect(await noContest.symbol()).to.equal("No Contest");
    expect(await noContest.name()).to.equal("No Contest");
    expect(await away.symbol()).to.equal("Away");
    expect(await away.name()).to.equal("Away");
    expect(await home.symbol()).to.equal("Home");
    expect(await home.name()).to.equal("Home");
  });

  it("spread market is correct", async () => {
    const spreadMarket = await marketFactory.getMarket(spreadMarketId);
    const [noContest, away, home] = spreadMarket.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));
    expect(await noContest.symbol()).to.equal("No Contest");
    expect(await noContest.name()).to.equal("No Contest");
    expect(await away.symbol()).to.equal("Away");
    expect(await away.name()).to.equal("Away");
    expect(await home.symbol()).to.equal("Home");
    expect(await home.name()).to.equal("Home");

    const details = await marketFactory.getMarketDetails(spreadMarketId);
    expect(details.value0).to.equal(homeSpread + 5); // add 5 to avoid a round number
  });

  it("over under market is correct", async () => {
    const overUnderMarket = await marketFactory.getMarket(overUnderMarketId);
    const [noContest, over, under] = overUnderMarket.shareTokens.map((addr) =>
      OwnedERC20__factory.connect(addr, signer)
    );
    expect(await noContest.symbol()).to.equal("No Contest");
    expect(await noContest.name()).to.equal("No Contest");
    expect(await under.symbol()).to.equal("Under");
    expect(await under.name()).to.equal("Under");
    expect(await over.symbol()).to.equal("Over");
    expect(await over.name()).to.equal("Over");

    const details = await marketFactory.getMarketDetails(overUnderMarketId);
    expect(details.value0).to.equal(overUnderTotal + 5);
  });

  it("lists resolvable events", async () => {
    const events = await marketFactory.listResolvableEvents();
    expect(events.length).to.equal(1);
    expect(Number(events[0])).to.equal(eventId);
  });

  it("can resolve markets", async () => {
    await marketFactory.trustedResolveMarkets(eventId, SportsLinkEventStatus.Final, 100, 20);

    const headToHeadMarket = await marketFactory.getMarket(headToHeadMarketId);
    expect(headToHeadMarket.winner).to.equal(headToHeadMarket.shareTokens[2]); // home team won

    const spreadMarket = await marketFactory.getMarket(spreadMarketId);
    expect(spreadMarket.winner).to.equal(spreadMarket.shareTokens[2]); // home spread greater

    const overUnderMarket = await marketFactory.getMarket(overUnderMarketId);
    expect(overUnderMarket.winner).to.equal(overUnderMarket.shareTokens[1]); // over
  });

  it("stops listing resolved events", async () => {
    const events = await marketFactory.listResolvableEvents();
    expect(events.length).to.equal(0);
  });
});

describe("LinkFactory NoContest", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const eventId = 9001;

  let marketFactory: SportsLinkMarketFactoryV2;

  before(async () => {
    const collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    const feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);
    const smallFee = BigNumber.from(10).pow(16);
    const shareFactor = calcShareFactor(await collateral.decimals());

    const now = BigNumber.from(Date.now()).div(1000);
    const estimatedStartTime = now.add(60 * 60 * 24); // one day
    const homeTeamId = 42;
    const awayTeamId = 1881;
    const moneylines: [number, number] = [-130, +270]; // [home,away]
    const homeSpread = 40;
    const overUnderTotal = 60;
    const sportId = 4;

    marketFactory = await new SportsLinkMarketFactoryV2__factory(signer).deploy(
      signer.address,
      collateral.address,
      shareFactor,
      feePot.address,
      smallFee,
      smallFee,
      signer.address,
      smallFee,
      signer.address, // pretending the deployer is a link node for testing purposes
      sportId
    );

    await marketFactory.createMarket(
      eventId,
      homeTeamId,
      awayTeamId,
      estimatedStartTime,
      homeSpread,
      overUnderTotal,
      true,
      true,
      moneylines
    );
  });

  it("can resolve markets as No Contest", async () => {
    await marketFactory.trustedResolveMarkets(eventId, SportsLinkEventStatus.Postponed, 0, 0);

    const headToHeadMarketId = 1;
    const spreadMarketId = 2;
    const overUnderMarketId = 3;

    const headToHeadMarket = await marketFactory.getMarket(headToHeadMarketId);
    expect(headToHeadMarket.winner).to.equal(headToHeadMarket.shareTokens[0]); // No Contest

    const spreadMarket = await marketFactory.getMarket(spreadMarketId);
    expect(spreadMarket.winner).to.equal(spreadMarket.shareTokens[0]); // No Contest

    const overUnderMarket = await marketFactory.getMarket(overUnderMarketId);
    expect(overUnderMarket.winner).to.equal(overUnderMarket.shareTokens[0]); // No Contest
  });
});

describe("NBA fetcher", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  let fetcher: NBAFetcher;
  let ammFactory: AMMFactory;
  let collateral: Cash;
  let feePot: FeePot;

  const eventId = 9001;
  const smallFee = BigNumber.from(10).pow(16);

  let marketFactory: SportsLinkMarketFactoryV2;

  let h2hMarketId: BigNumberish;
  let h2hMarket: UnPromisify<ReturnType<typeof marketFactory.getMarket>>;
  let h2hMarketDetails: UnPromisify<ReturnType<typeof marketFactory.getMarketDetails>>;
  let spMarketId: BigNumberish;
  let spMarket: UnPromisify<ReturnType<typeof marketFactory.getMarket>>;
  let spMarketDetails: UnPromisify<ReturnType<typeof marketFactory.getMarketDetails>>;

  before(async () => {
    collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);

    const now = BigNumber.from(Date.now()).div(1000);
    marketFactory = await new SportsLinkMarketFactoryV2__factory(signer).deploy(
      signer.address,
      collateral.address,
      calcShareFactor(await collateral.decimals()),
      feePot.address,
      smallFee,
      smallFee,
      signer.address,
      smallFee,
      signer.address, // pretending the deployer is a link node for testing purposes
      4
    );

    const rewardsToken = await new Cash__factory(signer).deploy("RWS", "RWS", 18);
    const masterChef = await new MasterChef__factory(signer).deploy(rewardsToken.address);

    const initialRewards = BONE.mul(10000);
    await rewardsToken.faucet(initialRewards);
    await rewardsToken.transfer(masterChef.address, initialRewards);

    const bFactory = await new BFactory__factory(signer).deploy();
    const swapFee = smallFee;
    ammFactory = await new AMMFactory__factory(signer).deploy(bFactory.address, masterChef.address, swapFee);

    await masterChef.trustAMMFactory(ammFactory.address);

    await marketFactory.createMarket(
      eventId,
      42,
      1881,
      now.add(60 * 60 * 24), // one day
      40,
      60,
      true,
      false,
      [+100, -110]
    );
    h2hMarketId = BigNumber.from(1);
    h2hMarket = await marketFactory.getMarket(h2hMarketId);
    h2hMarketDetails = await marketFactory.getMarketDetails(h2hMarketId);

    spMarketId = BigNumber.from(2);
    spMarket = await marketFactory.getMarket(spMarketId);
    spMarketDetails = await marketFactory.getMarketDetails(spMarketId);

    const initialLiquidity = dollars(10000);
    await collateral.approve(ammFactory.address, initialLiquidity);
    await collateral.faucet(initialLiquidity);
    await ammFactory.createPool(marketFactory.address, h2hMarketId, initialLiquidity, signer.address);
  });

  it("is deployable", async () => {
    fetcher = await new NBAFetcher__factory(signer).deploy();
    expect(await fetcher.marketType()).to.equal("NBA");
    expect(await fetcher.version()).to.be.a("string");
  });

  it("fetchInitial [0,50]", async () => {
    const offset = 0;
    const total = 50;
    const [rawFactoryBundle, rawMarketBundles] = await fetcher.fetchInitial(
      marketFactory.address,
      ammFactory.address,
      offset,
      total
    );

    const marketFactoryBundle = createNBAMarketFactoryBundle(rawFactoryBundle);
    expect(marketFactoryBundle, "market factory bundle").to.deep.equal(
      await marketFactoryBundleCheck(marketFactory, collateral, feePot)
    );

    const marketBundles = rawMarketBundles.map(createNBAStaticMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(2); // h2h and spread
    expect(marketBundles[1], "market bundle @ index 1").to.deep.equal({
      factory: marketFactory.address,
      marketId: h2hMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, h2hMarketId),
      shareTokens: h2hMarket.shareTokens,
      creationTimestamp: h2hMarket.creationTimestamp,
      endTime: h2hMarket.endTime,
      winner: h2hMarket.winner,
      initialOdds: [
        BigNumber.from(10).pow(18),
        BigNumber.from("0x015be9b4a9bdbf11db"),
        BigNumber.from("0x014c1943b94c64ee24"),
      ],
      // NBA-specific
      eventId: h2hMarketDetails.eventId,
      homeTeamId: h2hMarketDetails.homeTeamId,
      awayTeamId: h2hMarketDetails.awayTeamId,
      estimatedStartTime: h2hMarketDetails.estimatedStartTime,
      marketType: h2hMarketDetails.marketType,
      value0: h2hMarketDetails.value0,
      // NBA-specific, also dynamic
      eventStatus: h2hMarketDetails.eventStatus,
    });
  });

  it("fetchInitial [0,1]", async () => {
    const offset = 0;
    const total = 1;
    const [rawFactoryBundle, rawMarketBundles] = await fetcher.fetchInitial(
      marketFactory.address,
      ammFactory.address,
      offset,
      total
    );

    const marketFactoryBundle = createNBAMarketFactoryBundle(rawFactoryBundle);
    expect(marketFactoryBundle, "market factory bundle").to.deep.equal(
      await marketFactoryBundleCheck(marketFactory, collateral, feePot)
    );

    const marketBundles = rawMarketBundles.map(createNBAStaticMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: spMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, spMarketId),
      shareTokens: spMarket.shareTokens,
      creationTimestamp: spMarket.creationTimestamp,
      endTime: spMarket.endTime,
      winner: spMarket.winner,
      initialOdds: [
        BigNumber.from(10).pow(18),
        BigNumber.from("0x0154017c3185120000"),
        BigNumber.from("0x0154017c3185120000"),
      ],
      // NBA-specific
      eventId: spMarketDetails.eventId,
      homeTeamId: spMarketDetails.homeTeamId,
      awayTeamId: spMarketDetails.awayTeamId,
      estimatedStartTime: spMarketDetails.estimatedStartTime,
      marketType: spMarketDetails.marketType,
      value0: spMarketDetails.value0,
      // NBA-specific, also dynamic
      eventStatus: spMarketDetails.eventStatus,
    });
  });

  it("fetchInitial [1,1]", async () => {
    const offset = 1;
    const total = 1;
    const [rawFactoryBundle, rawMarketBundles] = await fetcher.fetchInitial(
      marketFactory.address,
      ammFactory.address,
      offset,
      total
    );

    const marketFactoryBundle = createNBAMarketFactoryBundle(rawFactoryBundle);
    expect(marketFactoryBundle, "market factory bundle").to.deep.equal(
      await marketFactoryBundleCheck(marketFactory, collateral, feePot)
    );

    const marketBundles = rawMarketBundles.map(createNBAStaticMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: h2hMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, h2hMarketId),
      shareTokens: h2hMarket.shareTokens,
      creationTimestamp: h2hMarket.creationTimestamp,
      endTime: h2hMarket.endTime,
      winner: h2hMarket.winner,
      initialOdds: [
        BigNumber.from(10).pow(18),
        BigNumber.from("0x015be9b4a9bdbf11db"),
        BigNumber.from("0x014c1943b94c64ee24"),
      ],
      // NBA-h2hecific
      eventId: h2hMarketDetails.eventId,
      homeTeamId: h2hMarketDetails.homeTeamId,
      awayTeamId: h2hMarketDetails.awayTeamId,
      estimatedStartTime: h2hMarketDetails.estimatedStartTime,
      marketType: h2hMarketDetails.marketType,
      value0: h2hMarketDetails.value0,
      // NBA-h2hecific, also dynamic
      eventStatus: h2hMarketDetails.eventStatus,
    });
  });

  it("fetchDynamic [0,50]", async () => {
    const offset = 0;
    const total = 50;
    const rawMarketBundles = await fetcher.fetchDynamic(marketFactory.address, ammFactory.address, offset, total);

    const marketBundles = rawMarketBundles.map(createNBADynamicMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(2); // h2h and spread
    expect(marketBundles[1], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: h2hMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, h2hMarketId),
      winner: h2hMarket.winner,
      eventStatus: h2hMarketDetails.eventStatus,
    });
  });

  it("fetchDynamic [0,1]", async () => {
    const offset = 0;
    const total = 1;
    const rawMarketBundles = await fetcher.fetchDynamic(marketFactory.address, ammFactory.address, offset, total);

    const marketBundles = rawMarketBundles.map(createNBADynamicMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: spMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, spMarketId),
      winner: spMarket.winner,
      eventStatus: spMarketDetails.eventStatus,
    });
  });

  it("fetchDynamic [1,1]", async () => {
    const offset = 1;
    const total = 1;
    const rawMarketBundles = await fetcher.fetchDynamic(marketFactory.address, ammFactory.address, offset, total);

    const marketBundles = rawMarketBundles.map(createNBADynamicMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: h2hMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, h2hMarketId),
      winner: h2hMarket.winner,
      eventStatus: h2hMarketDetails.eventStatus,
    });
  });
});

describe("MMA fetcher", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  let fetcher: MMAFetcher;
  let ammFactory: AMMFactory;
  let collateral: Cash;
  let feePot: FeePot;

  const smallFee = BigNumber.from(10).pow(16);

  let marketFactory: MMALinkMarketFactory;

  let firstMarketId: BigNumberish;
  let firstMarket: UnPromisify<ReturnType<typeof marketFactory.getMarket>>;
  let firstMarketDetails: UnPromisify<ReturnType<typeof marketFactory.getMarketDetails>>;
  let secondMarketId: BigNumberish;
  let secondMarket: UnPromisify<ReturnType<typeof marketFactory.getMarket>>;
  let secondMarketDetails: UnPromisify<ReturnType<typeof marketFactory.getMarketDetails>>;

  before(async () => {
    collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);

    const now = BigNumber.from(Date.now()).div(1000);
    marketFactory = await new MMALinkMarketFactory__factory(signer).deploy(
      signer.address,
      collateral.address,
      calcShareFactor(await collateral.decimals()),
      feePot.address,
      smallFee,
      smallFee,
      signer.address,
      smallFee,
      signer.address, // pretending the deployer is a link node for testing purposes
      7
    );

    const rewardsToken = await new Cash__factory(signer).deploy("RWS", "RWS", 18);
    const masterChef = await new MasterChef__factory(signer).deploy(rewardsToken.address);

    const initialRewards = BONE.mul(10000);
    await rewardsToken.faucet(initialRewards);
    await rewardsToken.transfer(masterChef.address, initialRewards);

    const bFactory = await new BFactory__factory(signer).deploy();
    const swapFee = smallFee;
    ammFactory = await new AMMFactory__factory(signer).deploy(bFactory.address, masterChef.address, swapFee);

    await masterChef.trustAMMFactory(ammFactory.address);

    await marketFactory.createMarket(
      1880,
      "Troy",
      19,
      "Abed",
      1402,
      now.add(60 * 60 * 24), // one day
      [-10, +400]
    );
    await marketFactory.createMarket(
      7155,
      "Annie",
      19,
      "Britta",
      1402,
      now.add(60 * 60 * 24), // one day
      [+30, -20]
    );

    firstMarketId = BigNumber.from(1);
    firstMarket = await marketFactory.getMarket(firstMarketId);
    firstMarketDetails = await marketFactory.getMarketDetails(firstMarketId);

    secondMarketId = BigNumber.from(2);
    secondMarket = await marketFactory.getMarket(secondMarketId);
    secondMarketDetails = await marketFactory.getMarketDetails(secondMarketId);

    const initialLiquidity = dollars(10000);
    await collateral.approve(ammFactory.address, initialLiquidity);
    await collateral.faucet(initialLiquidity);
    await ammFactory.createPool(marketFactory.address, firstMarketId, initialLiquidity, signer.address);
  });

  it("is deployable", async () => {
    fetcher = await new MMAFetcher__factory(signer).deploy();
    expect(await fetcher.marketType()).to.equal("MMA");
    expect(await fetcher.version()).to.be.a("string");
  });

  it("fetchInitial [0,50]", async () => {
    const offset = 0;
    const total = 50;
    const [rawFactoryBundle, rawMarketBundles] = await fetcher.fetchInitial(
      marketFactory.address,
      ammFactory.address,
      offset,
      total
    );

    const marketFactoryBundle = createMMAMarketFactoryBundle(rawFactoryBundle);
    expect(marketFactoryBundle, "market factory bundle").to.deep.equal(
      await marketFactoryBundleCheck(marketFactory, collateral, feePot)
    );

    const marketBundles = rawMarketBundles.map(createMMAStaticMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(2); // h2h and spread
    expect(marketBundles[1], "market bundle @ index 1").to.deep.equal({
      factory: marketFactory.address,
      marketId: firstMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, firstMarketId),
      shareTokens: firstMarket.shareTokens,
      creationTimestamp: firstMarket.creationTimestamp,
      endTime: firstMarket.endTime,
      winner: firstMarket.winner,
      initialOdds: firstMarket.initialOdds,
      // MMA-specific
      eventId: firstMarketDetails.eventId,
      homeFighterName: firstMarketDetails.homeFighterName,
      homeFighterId: firstMarketDetails.homeFighterId,
      awayFighterName: firstMarketDetails.awayFighterName,
      awayFighterId: firstMarketDetails.awayFighterId,
      estimatedStartTime: firstMarketDetails.estimatedStartTime,
      marketType: firstMarketDetails.marketType,
      // MMA-specific, also dynamic
      eventStatus: firstMarketDetails.eventStatus,
    });
  });

  it("fetchInitial [0,1]", async () => {
    const offset = 0;
    const total = 1;
    const [rawFactoryBundle, rawMarketBundles] = await fetcher.fetchInitial(
      marketFactory.address,
      ammFactory.address,
      offset,
      total
    );

    const marketFactoryBundle = createMMAMarketFactoryBundle(rawFactoryBundle);
    expect(marketFactoryBundle, "market factory bundle").to.deep.equal(
      await marketFactoryBundleCheck(marketFactory, collateral, feePot)
    );

    const marketBundles = rawMarketBundles.map(createMMAStaticMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: secondMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, secondMarketId),
      shareTokens: secondMarket.shareTokens,
      creationTimestamp: secondMarket.creationTimestamp,
      endTime: secondMarket.endTime,
      winner: secondMarket.winner,
      initialOdds: secondMarket.initialOdds,
      // MMA-specific
      eventId: secondMarketDetails.eventId,
      homeFighterName: secondMarketDetails.homeFighterName,
      homeFighterId: secondMarketDetails.homeFighterId,
      awayFighterName: secondMarketDetails.awayFighterName,
      awayFighterId: secondMarketDetails.awayFighterId,
      estimatedStartTime: secondMarketDetails.estimatedStartTime,
      marketType: secondMarketDetails.marketType,
      // MMA-specific, also dynamic
      eventStatus: secondMarketDetails.eventStatus,
    });
  });

  it("fetchInitial [1,1]", async () => {
    const offset = 1;
    const total = 1;
    const [rawFactoryBundle, rawMarketBundles] = await fetcher.fetchInitial(
      marketFactory.address,
      ammFactory.address,
      offset,
      total
    );

    const marketFactoryBundle = createMMAMarketFactoryBundle(rawFactoryBundle);
    expect(marketFactoryBundle, "market factory bundle").to.deep.equal(
      await marketFactoryBundleCheck(marketFactory, collateral, feePot)
    );

    const marketBundles = rawMarketBundles.map(createMMAStaticMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: firstMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, firstMarketId),
      shareTokens: firstMarket.shareTokens,
      creationTimestamp: firstMarket.creationTimestamp,
      endTime: firstMarket.endTime,
      winner: firstMarket.winner,
      initialOdds: firstMarket.initialOdds,
      // MMA-h2hecific
      eventId: firstMarketDetails.eventId,
      homeFighterName: firstMarketDetails.homeFighterName,
      homeFighterId: firstMarketDetails.homeFighterId,
      awayFighterName: firstMarketDetails.awayFighterName,
      awayFighterId: firstMarketDetails.awayFighterId,
      estimatedStartTime: firstMarketDetails.estimatedStartTime,
      marketType: firstMarketDetails.marketType,
      // MMA-h2hecific, also dynamic
      eventStatus: firstMarketDetails.eventStatus,
    });
  });

  it("fetchDynamic [0,50]", async () => {
    const offset = 0;
    const total = 50;
    const rawMarketBundles = await fetcher.fetchDynamic(marketFactory.address, ammFactory.address, offset, total);

    const marketBundles = rawMarketBundles.map(createMMADynamicMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(2); // h2h and spread
    expect(marketBundles[1], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: firstMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, firstMarketId),
      winner: firstMarket.winner,
      eventStatus: firstMarketDetails.eventStatus,
    });
  });

  it("fetchDynamic [0,1]", async () => {
    const offset = 0;
    const total = 1;
    const rawMarketBundles = await fetcher.fetchDynamic(marketFactory.address, ammFactory.address, offset, total);

    const marketBundles = rawMarketBundles.map(createMMADynamicMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: secondMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, secondMarketId),
      winner: secondMarket.winner,
      eventStatus: secondMarketDetails.eventStatus,
    });
  });

  it("fetchDynamic [1,1]", async () => {
    const offset = 1;
    const total = 1;
    const rawMarketBundles = await fetcher.fetchDynamic(marketFactory.address, ammFactory.address, offset, total);

    const marketBundles = rawMarketBundles.map(createMMADynamicMarketBundle);
    expect(marketBundles.length, "market bundles length").to.equal(1);
    expect(marketBundles[0], "market bundle").to.deep.equal({
      factory: marketFactory.address,
      marketId: firstMarketId,
      pool: await makePoolCheck(ammFactory, marketFactory, firstMarketId),
      winner: firstMarket.winner,
      eventStatus: firstMarketDetails.eventStatus,
    });
  });
});

function dollars(howManyDollars: number): BigNumber {
  const basis = BigNumber.from(10).pow(6);
  return basis.mul(howManyDollars);
}

type UnPromisify<T> = T extends Promise<infer U> ? U : T;

type CheckableMarketFactory = SportsLinkMarketFactoryV2 | MMALinkMarketFactory;

async function marketFactoryBundleCheck(marketFactory: CheckableMarketFactory, collateral: Cash, feePot: FeePot) {
  return {
    sportId: await marketFactory.sportId(),
    shareFactor: await marketFactory.shareFactor(),
    feePot: feePot.address,
    protocolFee: await marketFactory.protocolFee(),
    settlementFee: await marketFactory.settlementFee(),
    stakerFee: await marketFactory.stakerFee(),
    collateral: {
      addr: collateral.address,
      symbol: await collateral.symbol(),
      decimals: await collateral.decimals(),
    },
    marketCount: await marketFactory.marketCount(),
  };
}

async function makePoolCheck(ammFactory: AMMFactory, marketFactory: CheckableMarketFactory, marketId: BigNumberish) {
  const addr = await ammFactory.getPool(marketFactory.address, marketId);
  if (addr === NULL_ADDRESS) {
    return {
      addr,
      tokenRatios: [],
      balances: [],
      weights: [],
      swapFee: ZERO,
      totalSupply: ZERO,
    };
  } else {
    return {
      addr,
      tokenRatios: await ammFactory.tokenRatios(marketFactory.address, marketId),
      balances: await ammFactory.getPoolBalances(marketFactory.address, marketId),
      weights: await ammFactory.getPoolWeights(marketFactory.address, marketId),
      swapFee: await ammFactory.getSwapFee(marketFactory.address, marketId),
      totalSupply: INITIAL_TOTAL_SUPPLY_OF_BPOOL,
    };
  }
}
