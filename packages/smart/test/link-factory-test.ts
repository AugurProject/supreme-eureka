import { deployments, ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";

import {
  AbstractMarketFactoryV3,
  AMMFactory,
  AMMFactory__factory,
  BFactory__factory,
  Cash,
  Cash__factory,
  FeePot,
  FeePot__factory,
  MasterChef,
  SportsFetcher,
  SportsFetcher__factory,
  NBAMarketFactoryV3,
  NBAMarketFactoryV3__factory,
  OwnedERC20__factory,
  Sport,
} from "../typechain";
import { BigNumber, BigNumberish } from "ethers";
import {
  calcShareFactor,
  DynamicSportsMarket,
  fetchDynamicSports,
  fetchInitialSports,
  flatten,
  InitialSportsMarket,
  SportsLinkEventStatus,
  TypeOfClassMethod,
  UnPromisify,
} from "../src";
import { makePoolCheck, marketFactoryBundleCheck } from "./fetching";
import { createPoolStatusInfo } from "../src/fetcher/common";
import { Provider } from "@ethersproject/providers";

const BONE = BigNumber.from(10).pow(18);
const INITIAL_TOTAL_SUPPLY_OF_BPOOL = BigNumber.from(10).pow(20);
const ZERO = BigNumber.from(0);

enum Market {
  HeadToHead = 0,
  Spread = 1,
  OverUnder = 2,
}
enum Outcome {
  NoContest = 0,
  AwayWon = 1,
  HomeWon = 2,

  SpreadLesser = 1,
  SpreadGreater = 2,

  TotalOver = 1,
  TotalUnder = 2,
}

describe("NBA", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const eventId = 9001;
  const homeTeamId = 42;
  const awayTeamId = 1881;
  const homeTeamName = "hom";
  const awayTeamName = "awa";
  const moneylines: [number, number] = [-130, +270]; // [home,away]
  const homeSpread = 20;
  const overUnderTotal = 60;
  const smallFee = BigNumber.from(10).pow(16);

  const now = BigNumber.from(Date.now()).div(1000);
  const estimatedStartTime = now.add(60 * 60 * 24); // one day

  let collateral: Cash;
  let feePot: FeePot;
  let marketFactory: NBAMarketFactoryV3;
  let headToHeadMarketId: BigNumber;
  let spreadMarketId: BigNumber;
  let overUnderMarketId: BigNumber;

  let shareFactor: BigNumber;

  it("is deployable", async () => {
    collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);
    shareFactor = calcShareFactor(await collateral.decimals());

    marketFactory = await new NBAMarketFactoryV3__factory(signer).deploy(
      signer.address,
      collateral.address,
      shareFactor,
      feePot.address,
      [smallFee, smallFee, smallFee],
      signer.address,
      signer.address // pretending the deployer is a link node for testing purposes
    );

    expect(await marketFactory.getOwner()).to.equal(signer.address);
    expect(await marketFactory.feePot()).to.equal(feePot.address);
    expect(await marketFactory.collateral()).to.equal(collateral.address);
    expect(await marketFactory.settlementFee()).to.equal(smallFee);
    expect(await marketFactory.stakerFee()).to.equal(smallFee);
    expect(await marketFactory.protocolFee()).to.equal(smallFee);
  });

  it("can create markets", async () => {
    await marketFactory.createEvent(
      eventId,
      homeTeamName,
      homeTeamId,
      awayTeamName,
      awayTeamId,
      estimatedStartTime,
      homeSpread,
      overUnderTotal,
      moneylines
    );

    const filter = marketFactory.filters.MarketCreated(null, null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length, "market created logs length").to.equal(3);
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
    expect(await away.symbol()).to.equal(awayTeamName);
    expect(await away.name()).to.equal(awayTeamName);
    expect(await home.symbol()).to.equal(homeTeamName);
    expect(await home.name()).to.equal(homeTeamName);
    expect(headToHeadMarket.resolutionTimestamp).to.equal(ZERO);
  });

  it("spread market is correct", async () => {
    const spreadMarket = await marketFactory.getMarket(spreadMarketId);
    const [noContest, away, home] = spreadMarket.shareTokens.map((addr) => OwnedERC20__factory.connect(addr, signer));
    expect(await noContest.symbol()).to.equal("No Contest");
    expect(await noContest.name()).to.equal("No Contest");
    expect(await away.symbol()).to.equal(awayTeamName);
    expect(await away.name()).to.equal(awayTeamName);
    expect(await home.symbol()).to.equal(homeTeamName);
    expect(await home.name()).to.equal(homeTeamName);
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
  });

  it("event is correct", async () => {
    const sportsEvent = await marketFactory.getSportsEvent(eventId);
    expect(sportsEvent.status, "status").to.equal(SportsLinkEventStatus.Scheduled);
    expect(sportsEvent.markets.length, "markets.length").to.equal(3);
    expect(sportsEvent.markets[Market.HeadToHead], "markets[0]").to.equal(headToHeadMarketId);
    expect(sportsEvent.markets[Market.Spread], "markets[1]").to.equal(spreadMarketId);
    expect(sportsEvent.markets[Market.OverUnder], "markets[2]").to.equal(overUnderMarketId);
    expect(sportsEvent.lines.length, "lines.length").to.equal(3);
    expect(sportsEvent.lines[Market.HeadToHead], "lines[0]").to.equal(0);
    expect(sportsEvent.lines[Market.Spread], "lines[1]").to.equal(homeSpread + 5);
    expect(sportsEvent.lines[Market.OverUnder], "lines[2]").to.equal(overUnderTotal + 5);
    expect(sportsEvent.estimatedStartTime, "estimatedStartTime").to.equal(estimatedStartTime);
    expect(sportsEvent.homeTeamId, "homeTeamId").to.equal(homeTeamId);
    expect(sportsEvent.awayTeamId, "awayTeamId").to.equal(awayTeamId);
    expect(sportsEvent.homeTeamName, "homeTeamName").to.equal(homeTeamName);
    expect(sportsEvent.awayTeamName, "awayTeamName").to.equal(awayTeamName);
    expect(sportsEvent.homeScore, "homeScore").to.equal(0);
    expect(sportsEvent.awayScore, "awayScore").to.equal(0);
  });

  let fetcher: SportsFetcher;
  beforeEach(async () => {
    fetcher = (await ethers.getContract("SportsFetcher")) as SportsFetcher;
  });

  it("lists resolvable events", async () => {
    const [events, index] = await fetcher.listResolvableEvents(marketFactory.address, 0, 100);
    expect(events.length).to.equal(1);
    expect(Number(events[0])).to.equal(eventId);
  });

  it("can resolve markets", async () => {
    const time = Math.floor(Date.now() / 1000) + 60 * 5;
    await network.provider.send("evm_setNextBlockTimestamp", [time]);

    await marketFactory.resolveEvent(eventId, SportsLinkEventStatus.Final, homeTeamId, awayTeamId, 60, 30);

    const headToHeadMarket = await marketFactory.getMarket(headToHeadMarketId);
    expect(headToHeadMarket.winner).to.equal(headToHeadMarket.shareTokens[Outcome.HomeWon]);
    expect(headToHeadMarket.resolutionTimestamp).to.equal(time);

    const spreadMarket = await marketFactory.getMarket(spreadMarketId);
    expect(spreadMarket.winner).to.equal(spreadMarket.shareTokens[Outcome.SpreadGreater]);

    const overUnderMarket = await marketFactory.getMarket(overUnderMarketId);
    expect(overUnderMarket.winner).to.equal(overUnderMarket.shareTokens[Outcome.TotalOver]);
  });

  it("stops listing resolved events", async () => {
    const [events, index] = await fetcher.listResolvableEvents(marketFactory.address, 0, 100);
    expect(events.length).to.equal(0);
  });
});

describe("LinkFactory NoContest", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const eventId = 9001;
  const homeTeamId = 42;
  const awayTeamId = 1881;

  let marketFactory: NBAMarketFactoryV3;

  before(async () => {
    const collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    const feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);
    const smallFee = BigNumber.from(10).pow(16);
    const shareFactor = calcShareFactor(await collateral.decimals());

    const now = BigNumber.from(Date.now()).div(1000);
    const estimatedStartTime = now.add(60 * 60 * 24); // one day
    const moneylines: [number, number] = [-130, +270]; // [home,away]
    const homeSpread = 40;
    const overUnderTotal = 60;

    marketFactory = await new NBAMarketFactoryV3__factory(signer).deploy(
      signer.address,
      collateral.address,
      shareFactor,
      feePot.address,
      [smallFee, smallFee, smallFee],
      signer.address,
      signer.address // pretending the deployer is a link node for testing purposes
    );

    await marketFactory.createEvent(
      eventId,
      "hi",
      homeTeamId,
      "buye",
      awayTeamId,
      estimatedStartTime,
      homeSpread,
      overUnderTotal,
      moneylines
    );
  });

  it("can resolve markets as No Contest", async () => {
    await marketFactory.resolveEvent(eventId, SportsLinkEventStatus.Postponed, homeTeamId, awayTeamId, 0, 0);

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

describe("Sports fetcher", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  let fetcher: SportsFetcher;
  let ammFactory: AMMFactory;
  let masterChef: MasterChef;
  let collateral: Cash;
  let feePot: FeePot;

  const smallFee = BigNumber.from(10).pow(16);

  let marketFactory: NBAMarketFactoryV3;
  let mostInterestingEvent: TestEvent<BigNumber>;
  let leastInterestingEvent: TestEvent<BigNumber>;

  before(async () => {
    await deployments.fixture();
    collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);

    const now = BigNumber.from(Date.now()).div(1000);
    const estimatedStartTime = now.add(60 * 60 * 24); // one day
    marketFactory = await new NBAMarketFactoryV3__factory(signer).deploy(
      signer.address,
      collateral.address,
      calcShareFactor(await collateral.decimals()),
      feePot.address,
      [smallFee, smallFee, smallFee],
      signer.address,
      signer.address // pretending the deployer is a link node for testing purposes
    );

    const bFactory = await new BFactory__factory(signer).deploy();
    const swapFee = smallFee;
    ammFactory = await new AMMFactory__factory(signer).deploy(bFactory.address, swapFee);
    masterChef = (await ethers.getContract("MasterChef")) as MasterChef;

    leastInterestingEvent = await makeTestEvent(marketFactory, {
      id: 7878,
      estimatedStartTime,
      home: { id: 6656, name: "dochi" },
      away: { id: 111, name: "daisy" },
      lines: { spread: 15, total: 55, moneylines: [+100, -300] },
    });

    mostInterestingEvent = await makeTestEvent(marketFactory, {
      id: 9001,
      estimatedStartTime,
      home: { id: 1881, name: "nom" },
      away: { id: 40, name: "who?" },
      lines: { spread: 65, total: 90, moneylines: [+100, -110] },
    });

    const initialLiquidity = dollars(10000);
    await collateral.approve(masterChef.address, initialLiquidity);
    await collateral.faucet(initialLiquidity);
    await masterChef.trustAMMFactory(ammFactory.address);
    await masterChef.createPool(
      ammFactory.address,
      marketFactory.address,
      mostInterestingEvent.markets.h2h.id,
      initialLiquidity,
      signer.address
    );
  });

  it("is deployable", async () => {
    fetcher = await new SportsFetcher__factory(signer).deploy();
    expect(await fetcher.marketType()).to.equal("Sports");
    expect(await fetcher.version()).to.be.a("string");
  });

  it("initial {offset=0,bundle=50)", async () => {
    const { factoryBundle, markets, timestamp } = await fetchInitialSports(
      fetcher,
      marketFactory,
      ammFactory,
      masterChef,
      0,
      50
    );

    expect(factoryBundle).to.deep.equal(await marketFactoryBundleCheck(marketFactory));
    expect(markets, "markets").to.deep.equal(
      flatten(
        await eventStaticBundleCheck(marketFactory, ammFactory, masterChef, mostInterestingEvent.id),
        await eventStaticBundleCheck(marketFactory, ammFactory, masterChef, leastInterestingEvent.id)
      )
    );
    expect(timestamp).to.deep.equal(BigNumber.from((await (signer.provider as Provider).getBlock("latest")).timestamp));
  });

  it("initial {offset=0,bundle=1)", async () => {
    const { factoryBundle, markets, timestamp } = await fetchInitialSports(
      fetcher,
      marketFactory,
      ammFactory,
      masterChef,
      0,
      1
    );

    expect(factoryBundle).to.deep.equal(await marketFactoryBundleCheck(marketFactory));
    expect(markets, "markets").to.deep.equal(
      flatten(
        await eventStaticBundleCheck(marketFactory, ammFactory, masterChef, mostInterestingEvent.id),
        await eventStaticBundleCheck(marketFactory, ammFactory, masterChef, leastInterestingEvent.id)
      )
    );
    expect(timestamp).to.deep.equal(BigNumber.from((await (signer.provider as Provider).getBlock("latest")).timestamp));
  });

  it("initial {offset=1,bundle=1)", async () => {
    const { factoryBundle, markets, timestamp } = await fetchInitialSports(
      fetcher,
      marketFactory,
      ammFactory,
      masterChef,
      1,
      1
    );

    expect(factoryBundle).to.deep.equal(await marketFactoryBundleCheck(marketFactory));
    expect(markets, "markets").to.deep.equal(
      await eventStaticBundleCheck(marketFactory, ammFactory, masterChef, leastInterestingEvent.id)
    );
    expect(timestamp).to.deep.equal(BigNumber.from((await (signer.provider as Provider).getBlock("latest")).timestamp));
  });

  it("dynamic {offset=0,bundle=50}", async () => {
    const { markets, timestamp } = await fetchDynamicSports(fetcher, marketFactory, ammFactory, 0, 50);

    expect(markets, "markets").to.deep.equal(
      flatten(
        await eventDynamicBundleCheck(marketFactory, ammFactory, mostInterestingEvent.id),
        await eventDynamicBundleCheck(marketFactory, ammFactory, leastInterestingEvent.id)
      )
    );
    expect(timestamp).to.deep.equal(BigNumber.from((await (signer.provider as Provider).getBlock("latest")).timestamp));
  });

  it("dynamic {offset=0,bundle=1}", async () => {
    const { markets, timestamp } = await fetchDynamicSports(fetcher, marketFactory, ammFactory, 0, 1);

    expect(markets, "markets").to.deep.equal(
      flatten(
        await eventDynamicBundleCheck(marketFactory, ammFactory, mostInterestingEvent.id),
        await eventDynamicBundleCheck(marketFactory, ammFactory, leastInterestingEvent.id)
      )
    );
    expect(timestamp).to.deep.equal(BigNumber.from((await (signer.provider as Provider).getBlock("latest")).timestamp));
  });

  it("dynamic {offset=1,bundle=1}", async () => {
    const { markets, timestamp } = await fetchDynamicSports(fetcher, marketFactory, ammFactory, 1, 1);

    expect(markets, "markets").to.deep.equal(
      await eventDynamicBundleCheck(marketFactory, ammFactory, leastInterestingEvent.id)
    );
    expect(timestamp).to.deep.equal(BigNumber.from((await (signer.provider as Provider).getBlock("latest")).timestamp));
  });

  it("timestamp changes", async () => {
    const originalTimestamp = (await (signer.provider as Provider).getBlock("latest")).timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [originalTimestamp + 1_000_000]);
    await network.provider.send("evm_mine", []);

    const { timestamp } = await fetchInitialSports(fetcher, marketFactory, ammFactory, masterChef, 1, 1);

    expect(timestamp).to.deep.equal(BigNumber.from(originalTimestamp + 1_000_000));
  });
});

describe("Sports fetcher no markets", () => {
  let signer: SignerWithAddress;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  let fetcher: SportsFetcher;
  let ammFactory: AMMFactory;
  let masterChef: MasterChef;
  let collateral: Cash;
  let feePot: FeePot;

  const smallFee = BigNumber.from(10).pow(16);

  let marketFactory: NBAMarketFactoryV3;

  before(async () => {
    collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);

    marketFactory = await new NBAMarketFactoryV3__factory(signer).deploy(
      signer.address,
      collateral.address,
      calcShareFactor(await collateral.decimals()),
      feePot.address,
      [smallFee, smallFee, smallFee],
      signer.address,
      signer.address // pretending the deployer is a link node for testing purposes
    );

    const bFactory = await new BFactory__factory(signer).deploy();
    const swapFee = smallFee;
    ammFactory = await new AMMFactory__factory(signer).deploy(bFactory.address, swapFee);
    masterChef = (await ethers.getContract("MasterChef")) as MasterChef;

    fetcher = await new SportsFetcher__factory(signer).deploy();
  });

  it("initial", async () => {
    const { factoryBundle, markets } = await fetchInitialSports(fetcher, marketFactory, ammFactory, masterChef, 0, 50);

    expect(factoryBundle).to.deep.equal(await marketFactoryBundleCheck(marketFactory));
    expect(markets, "markets").to.deep.equal([]);
  });

  it("dynamic", async () => {
    const { markets } = await fetchDynamicSports(fetcher, marketFactory, ammFactory, 0, 50);

    expect(markets, "markets").to.deep.equal([]);
  });
});

function dollars(howManyDollars: number): BigNumber {
  const basis = BigNumber.from(10).pow(6);
  return basis.mul(howManyDollars);
}

interface TestEvent<BN> {
  id: BN;
  estimatedStartTime: BN;
  home: TestTeam<BN>;
  away: TestTeam<BN>;
  lines: {
    spread: BN;
    total: BN;
    moneylines: [BN, BN];
  };
  markets: TestMarkets<BN>;
}
interface TestMarkets<BN> {
  h2h: TestMarket<BN>;
  sp: TestMarket<BN>;
  ou: TestMarket<BN>;
}
interface TestMarket<BN> {
  id: BN;
  market: UnPromisify<ReturnType<TypeOfClassMethod<AbstractMarketFactoryV3, "getMarket">>>;
}
interface TestTeam<BN> {
  id: BN;
  name: string;
}

async function makeTestEvent(
  marketFactory: Sport,
  testEvent: Omit<TestEvent<BigNumberish>, "markets">
): Promise<TestEvent<BigNumber>> {
  const { id, estimatedStartTime, home, away, lines } = testEvent;

  await marketFactory.createEvent(
    id,
    home.name,
    home.id,
    away.name,
    away.id,
    estimatedStartTime,
    lines.spread,
    lines.total,
    lines.moneylines
  );

  const event = await marketFactory.getSportsEvent(id);
  const [h2h, sp, ou] = event.markets;

  const markets: TestMarkets<BigNumber> = {
    h2h: { id: h2h, market: await marketFactory.getMarket(h2h) },
    sp: { id: sp, market: await marketFactory.getMarket(sp) },
    ou: { id: ou, market: await marketFactory.getMarket(ou) },
  };

  return {
    id: BigNumber.from(id),
    estimatedStartTime: BigNumber.from(estimatedStartTime),
    home: { id: BigNumber.from(home.id), name: home.name },
    away: { id: BigNumber.from(away.id), name: away.name },
    lines: {
      spread: BigNumber.from(lines.spread),
      total: BigNumber.from(lines.total),
      moneylines: [BigNumber.from(lines.moneylines[0]), BigNumber.from(lines.moneylines[1])],
    },
    markets,
  };
}

export async function eventStaticBundleCheck(
  marketFactory: Sport,
  ammFactory: AMMFactory,
  masterChef: MasterChef,
  eventId: BigNumberish
): Promise<InitialSportsMarket[]> {
  const event = await marketFactory.getSportsEvent(eventId);

  return Promise.all(
    event.markets.map(
      async (marketId: BigNumberish, index): Promise<InitialSportsMarket> => {
        const market = await marketFactory.getMarket(marketId);
        const rewards = await masterChef.getPoolInfo(ammFactory.address, marketFactory.address, marketId);
        return {
          // specific to this market
          factory: marketFactory.address,
          marketId,
          pool: await makePoolCheck(ammFactory, marketFactory, marketId),
          shareTokens: market.shareTokens,
          creationTimestamp: market.creationTimestamp,
          winner: market.winner,
          initialOdds: market.initialOdds,

          // common to all markets in the event
          eventId,
          eventStatus: event.status,
          line: event.lines[index],
          marketType: index,
          estimatedStartTime: event.estimatedStartTime,
          home: {
            id: event.homeTeamId,
            name: event.homeTeamName,
            score: event.homeScore,
          },
          away: {
            id: event.awayTeamId,
            name: event.awayTeamName,
            score: event.awayScore,
          },
          rewards: createPoolStatusInfo(rewards),
        };
      }
    )
  );
}

export async function eventDynamicBundleCheck(
  marketFactory: Sport,
  ammFactory: AMMFactory,
  eventId: BigNumberish
): Promise<DynamicSportsMarket[]> {
  const event = await marketFactory.getSportsEvent(eventId);

  return Promise.all(
    event.markets.map(
      async (marketId: BigNumberish): Promise<DynamicSportsMarket> => {
        const market = await marketFactory.getMarket(marketId);
        return {
          // specific to this market
          factory: marketFactory.address,
          marketId,
          pool: await makePoolCheck(ammFactory, marketFactory, marketId),
          winner: market.winner,

          // common to all markets in the event
          eventId,
          eventStatus: event.status,
          home: {
            score: event.homeScore,
          },
          away: {
            score: event.awayScore,
          },
        };
      }
    )
  );
}
