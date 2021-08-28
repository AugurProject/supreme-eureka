import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";

import {
  Cash,
  Cash__factory,
  FeePot,
  FeePot__factory,
  NFLMarketFactory,
  NFLMarketFactory__factory,
  OwnedERC20__factory,
} from "../typechain";
import { BigNumber } from "ethers";
import { calcShareFactor, SportsLinkEventStatus } from "../src";

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

describe("NFL", () => {
  let signer: SignerWithAddress;

  before("signer", async () => {
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
  let marketFactory: NFLMarketFactory;
  let headToHeadMarketId: BigNumber;
  let spreadMarketId: BigNumber;
  let overUnderMarketId: BigNumber;

  let shareFactor: BigNumber;

  it("is deployable", async () => {
    collateral = await new Cash__factory(signer).deploy("USDC", "USDC", 6); // 6 decimals to mimic USDC
    const reputationToken = await new Cash__factory(signer).deploy("REPv2", "REPv2", 18);
    feePot = await new FeePot__factory(signer).deploy(collateral.address, reputationToken.address);
    shareFactor = calcShareFactor(await collateral.decimals());
    marketFactory = await new NFLMarketFactory__factory(signer).deploy(
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
    expect(await noContest.symbol()).to.equal("No Contest / Draw");
    expect(await noContest.name()).to.equal("No Contest / Draw");
    expect(await away.symbol()).to.equal(awayTeamName);
    expect(await away.name()).to.equal(awayTeamName);
    expect(await home.symbol()).to.equal(homeTeamName);
    expect(await home.name()).to.equal(homeTeamName);
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

  it("lists resolvable events", async () => {
    const events = await marketFactory.listResolvableEvents();
    expect(events.length).to.equal(1);
    expect(Number(events[0])).to.equal(eventId);
  });

  it("can resolve markets", async () => {
    await marketFactory.resolveEvent(eventId, SportsLinkEventStatus.Final, homeTeamId, awayTeamId, 60, 30);

    const headToHeadMarket = await marketFactory.getMarket(headToHeadMarketId);
    expect(headToHeadMarket.winner).to.equal(headToHeadMarket.shareTokens[Outcome.HomeWon]);

    const spreadMarket = await marketFactory.getMarket(spreadMarketId);
    expect(spreadMarket.winner).to.equal(spreadMarket.shareTokens[Outcome.SpreadGreater]);

    const overUnderMarket = await marketFactory.getMarket(overUnderMarketId);
    expect(overUnderMarket.winner).to.equal(overUnderMarket.shareTokens[Outcome.TotalOver]);
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
  const homeTeamId = 42;
  const awayTeamId = 1881;

  let marketFactory: NFLMarketFactory;

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

    marketFactory = await new NFLMarketFactory__factory(signer).deploy(
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
