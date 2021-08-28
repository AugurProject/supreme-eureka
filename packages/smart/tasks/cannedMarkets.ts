import { task } from "hardhat/config";
import {
  buildContractInterfaces,
  ContractInterfaces,
  CryptoMarketFactory,
  FakePriceFeed__factory,
  FuturesMarketFactory,
  getUpcomingFriday4pmET,
  MarketFactoryType,
  NBAMarketFactory,
} from "..";
import { ManagedByLink, MMAMarketFactory } from "../typechain";
import { BigNumber, BigNumberish, ContractReceipt, ContractTransaction, Signer } from "ethers";
import { makeSigner } from "./deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { RoundManagement } from "../src";

task("cannedMarkets", "creates canned markets").setAction(async (args, hre: HardhatRuntimeEnvironment) => {
  console.log("Creating canned markets");
  const { ethers } = hre;
  const signer = await makeSigner(hre);
  const confirmations = hre.network.config.confirmations || 0;
  const network = await ethers.provider.getNetwork();
  const contracts: ContractInterfaces = buildContractInterfaces(signer, network.chainId);

  await nba(signer, contracts, confirmations);
  await nfl(signer, contracts, confirmations);
  await mma(signer, contracts, confirmations);
  await futures(signer, contracts, confirmations);
  await crypto(signer, contracts, confirmations);
});

async function crypto(signer: Signer, contracts: ContractInterfaces, confirmations: number) {
  const marketFactory = contracts.MarketFactories[marketFactoryIndex(contracts, "Crypto")]
    .marketFactory as CryptoMarketFactory;

  const now = Math.floor(Date.now() / 1000);

  const currentResolutionTime = (await marketFactory.nextResolutionTime()).toNumber();
  if (currentResolutionTime > now) {
    console.log(
      `Skipping crypto markets because they exist. Next resolution is at ${currentResolutionTime} epoch seconds`
    );
    return;
  }

  const originalLinkNode = await handleLinkNode(marketFactory, signer);

  try {
    interface Coin {
      name: string;
      priceFeed: string;
      price: BigNumber;
      imprecision: number;
      currentMarkets: [BigNumber];
    }
    const coins: Coin[] = (await marketFactory.getCoins()).slice(1);
    const priceFeeds = coins.map((coin) => coin.priceFeed).map((addr) => FakePriceFeed__factory.connect(addr, signer));
    const roundIds: BigNumberish[] = ([0] as BigNumberish[]).concat(
      await Promise.all(
        priceFeeds.map(async (feed) => {
          const latest = await feed.latestRoundData();
          const round = RoundManagement.decode(latest._roundId).nextRound();
          const answer = randomPrice();
          await feed.addRound(round.id, answer, 0, now, 0);
          return round.id;
        })
      )
    );

    console.log(`Creating crypto price markets for: ${coins.map((c) => c.name).join(",")}`);

    const nextResolutionTime = getUpcomingFriday4pmET();
    const priorMarketCount: number = (await marketFactory.marketCount()).toNumber();

    const wait = makeWait(confirmations);

    await marketFactory.createAndResolveMarkets(roundIds, nextResolutionTime).then(wait);

    const subsequentMarketCount: number = (await marketFactory.marketCount()).toNumber();
    const marketIds = range(priorMarketCount, subsequentMarketCount);

    if (marketIds.length === 0)
      throw Error(`Crypto price markets should have been created but were not. For "${marketFactory.address}"`);
    console.log(`Created markets ${marketIds.join(",")} for crypto prices ${marketFactory.address}`);
  } finally {
    await resetLinkNode(marketFactory, originalLinkNode);
  }
}

function makeWait(confirmations: number) {
  return (tx: ContractTransaction): Promise<ContractReceipt> => {
    return tx.wait(confirmations);
  };
}

function range(inclusiveMin: number, exclusiveMax: number): number[] {
  return [...new Array(exclusiveMax - inclusiveMin).keys()].map((i) => i + inclusiveMin);
}

export function randomPrice(min = 1, max = 100000): BigNumber {
  const basis = BigNumber.from(10).pow(8);
  const r = Math.random();
  const price = r * (max - min) + min;
  return basis.mul(price.toFixed());
}

async function futures(signer: Signer, contracts: ContractInterfaces, confirmations: number) {
  interface Group {
    id: BigNumberish;
    name: string;
    endTime: BigNumberish;
    invalidMarketName: string;
    category: string;
    markets: {
      name: string;
      odds: [number, number];
    }[];
  }

  const wait = makeWait(confirmations);

  const endTime = makeTime(60 * 60); // 1 hour from now

  const groups: Group[] = [
    {
      id: 1939,
      name: "Wizard of Oz",
      endTime,
      invalidMarketName: "It Was A Dream",
      category: "NFL",
      markets: [
        { name: "Lions", odds: [1, 5] },
        { name: "Tigers", odds: [1, 20] },
        { name: "Bears", odds: [1, 15] },
        { name: "Kansans", odds: [1, 15] },
        { name: "Tornados", odds: [1, 6] },
        { name: "Witches", odds: [1, 8] },
        { name: "Monkeybats", odds: [1, 5] },
        { name: "Water", odds: [1, 8] },
      ],
    },
  ];

  const marketFactory = contracts.MarketFactories[marketFactoryIndex(contracts, "Futures")]
    .marketFactory as FuturesMarketFactory;

  const originalLinkNode = await handleLinkNode(marketFactory, signer);

  try {
    for (const { id, name: groupName, endTime, invalidMarketName, category, markets } of groups) {
      let group = await marketFactory.getGroup(id);
      const finalized = [2, 3, 4].includes(group.status);
      if (finalized) {
        console.log(`Skipping group "${id}" for futures because it is already finalized`);
        continue;
      }

      if (group.status === 0) {
        console.log(`Initializing group ${id}`);
        await marketFactory.initializeGroup(id, groupName, invalidMarketName, endTime, category).then(wait);
      }

      for (const { name, odds } of markets) {
        if (group.marketNames.includes(name)) continue;
        console.log(`    Adding outcome "${name}" to group`);
        await marketFactory.addOutcomesToGroup(id, [name], [odds]).then(wait);
      }

      console.log(`Finalizing group`);
      await marketFactory.finalizeGroup(id).then(wait);

      group = await marketFactory.getGroup(id);
      console.log(`Created markets ${group.markets.join(",")} for futures ${marketFactory.address}`);
    }
  } finally {
    await resetLinkNode(marketFactory, originalLinkNode);
  }
}

async function nfl(signer: Signer, contracts: ContractInterfaces, confirmations: number) {
  const events: SportsSpecifierThreeLines[] = [
    {
      id: "0xbbb0001",
      home: { id: 0x1, name: "Bobs" },
      away: { id: 0x2, name: "Alices" },
      lines: { spread: -40, ou: 80, h2h: [-100, +500] },
    },
    {
      id: "0xbbb0002",
      home: { id: 0x11, name: "Barbarians" },
      away: { id: 0x12, name: "Sorcerers" },
      lines: { spread: 90, ou: 1000, h2h: [50, -200] },
    },
  ];

  return sport3(signer, contracts, confirmations, events, "NFL");
}

async function nba(signer: Signer, contracts: ContractInterfaces, confirmations: number) {
  const events: SportsSpecifierThreeLines[] = [
    {
      id: "0xbbb00a1",
      home: { id: 0x61, name: "Torpedos" },
      away: { id: 0x62, name: "Missiles" },
      lines: { spread: -40, ou: 80, h2h: [-100, +500] },
    },
    {
      id: "0xbbb00a2",
      home: { id: 0x611, name: "Swords" },
      away: { id: 0x612, name: "Lances" },
      lines: { spread: 90, ou: 1000, h2h: [50, -200] },
    },
  ];

  return sport3(signer, contracts, confirmations, events, "NBA");
}

async function mma(signer: Signer, contracts: ContractInterfaces, confirmations: number) {
  const events: SportsSpecifierOneLine[] = [
    {
      id: "0xbbb00a1",
      home: { id: 0x61, name: "Torpedos" },
      away: { id: 0x62, name: "Missiles" },
      lines: { h2h: [-100, +500] },
    },
    {
      id: "0xbbb00a2",
      home: { id: 0x611, name: "Swords" },
      away: { id: 0x612, name: "Lances" },
      lines: { h2h: [50, -200] },
    },
  ];

  return sport1(signer, contracts, confirmations, events, "MMA");
}

interface SportSpecifier {
  id: string;
  home: { id: number; name: string };
  away: { id: number; name: string };
}

interface SportsSpecifierOneLine extends SportSpecifier {
  lines: OneLine;
}
interface SportsSpecifierThreeLines extends SportSpecifier {
  lines: ThreeLines;
}

interface OneLine {
  h2h: [number, number];
}

interface ThreeLines extends OneLine {
  spread: number;
  ou: number;
}

// Handles any post-refactor sport with 3 markets (h2h, spread, O/U).
// So not SportsLink, MMA, or MLB. Works for NFL, NBA, MLB.
async function sport3(
  signer: Signer,
  contracts: ContractInterfaces,
  confirmations: number,
  events: SportsSpecifierThreeLines[],
  marketType: MarketFactoryType
) {
  const marketFactory = contracts.MarketFactories[marketFactoryIndex(contracts, marketType)]
    .marketFactory as NBAMarketFactory; // NBA market factory interface works for the other 3-sports too

  const originalLinkNode = await handleLinkNode(marketFactory, signer);

  try {
    for (const { id, home, away, lines } of events) {
      const exists = (await marketFactory.getSportsEvent(id)).status !== 0;
      if (exists) {
        console.log(`Skipping event "${id}" for ${marketType} because it already exists`);
        continue;
      }

      console.log(`Creating event for ${marketType}:`);
      console.log(`    Event ID: ${id}`);
      console.log(`    Home: ${home.name} (${home.id})`);
      console.log(`    Away: ${away.name} (${away.id})`);
      console.log(`    Lines h2h/sp/ou: ${lines.h2h[0]}:${lines.h2h[1]} / ${lines.spread} / ${lines.ou}`);

      const startTime = makeTime(60 * 5); // 5 minutes from now
      await marketFactory
        .createEvent(id, home.name, home.id, away.name, away.id, startTime, lines.spread, lines.ou, lines.h2h)
        .then((tx: ContractTransaction) => tx.wait(confirmations));

      const marketCount = await marketFactory.marketCount().then((bn: BigNumber) => bn.toNumber());
      const [m1, m2, m3] = [marketCount - 1, marketCount - 2, marketCount - 3];
      console.log(`Created markets ${m3}, ${m2}, ${m1} for ${marketType} ${marketFactory.address}`);
    }
  } finally {
    await resetLinkNode(marketFactory, originalLinkNode);
  }
}

// Handles any post-refactor sport with 1 market (h2h).
// Works with MMA and MLB.
async function sport1(
  signer: Signer,
  contracts: ContractInterfaces,
  confirmations: number,
  events: SportsSpecifierOneLine[],
  marketType: MarketFactoryType
) {
  const marketFactory = contracts.MarketFactories[marketFactoryIndex(contracts, marketType)]
    .marketFactory as MMAMarketFactory;

  const originalLinkNode = await handleLinkNode(marketFactory, signer);

  try {
    for (const { id, home, away, lines } of events) {
      const exists = (await marketFactory.getSportsEvent(id)).status !== 0;
      if (exists) {
        console.log(`Skipping event "${id}" for ${marketType} because it already exists`);
        continue;
      }

      console.log(`Creating event for ${marketType}:`);
      console.log(`    Event ID: ${id}`);
      console.log(`    Home: ${home.name} (${home.id})`);
      console.log(`    Away: ${away.name} (${away.id})`);
      console.log(`    Lines h2h: ${lines.h2h[0]}:${lines.h2h[1]}`);

      const startTime = makeTime(60 * 5); // 5 minutes from now
      await marketFactory
        .createEvent(id, home.name, home.id, away.name, away.id, startTime, lines.h2h)
        .then((tx: ContractTransaction) => tx.wait(confirmations));

      const marketCount = await marketFactory.marketCount().then((bn: BigNumber) => bn.toNumber());
      const m1 = marketCount - 1;
      console.log(`Created market ${m1} for ${marketType} ${marketFactory.address}`);
    }
  } finally {
    await resetLinkNode(marketFactory, originalLinkNode);
  }
}

// Finds the first instance of the market factory of the give type and returns its index.
// Since the first instance is the latest to be deployed, this returned the most recently-deployed market factory of the type.
function marketFactoryIndex(contracts: ContractInterfaces, ofType: MarketFactoryType): number {
  const { MarketFactories } = contracts;
  return MarketFactories.findIndex(({ marketFactoryType }) => marketFactoryType === ofType);
}

async function handleLinkNode(
  marketFactory: ManagedByLink | CryptoMarketFactory,
  signer: Signer
): Promise<string | null> {
  const originalLinkNode = await marketFactory.linkNode().then((a: string) => a.toLowerCase());
  const owner = await marketFactory.getOwner().then((a: string) => a.toLowerCase());
  const me = await signer.getAddress().then((a) => a.toLowerCase());
  const mustSetLinkNode = originalLinkNode !== me;

  if (mustSetLinkNode && owner !== me) {
    throw Error(
      `Cannot create canned markets because you aren't the owner nor the link node. you=${me}, owner=${owner}, linkNode=${originalLinkNode}`
    );
  }

  if (mustSetLinkNode) {
    console.log(`Temporarily changing link node from ${originalLinkNode} to ${me}`);
    await marketFactory.setLinkNode(me);
    return originalLinkNode;
  } else {
    return null;
  }
}

async function resetLinkNode(
  marketFactory: ManagedByLink | CryptoMarketFactory,
  originalLinkNode: string | null
): Promise<void> {
  if (originalLinkNode) {
    console.log(`Setting the link node back to ${originalLinkNode}`);
    await marketFactory.setLinkNode(originalLinkNode);
  }
}

function makeTime(futureSeconds: number): BigNumber {
  return BigNumber.from(Date.now()).div(1000).add(futureSeconds);
}
