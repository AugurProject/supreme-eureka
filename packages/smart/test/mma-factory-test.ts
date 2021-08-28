import { deployments, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";

import { Cash, MMAMarketFactory, OwnedERC20__factory } from "../typechain";
import { BigNumber } from "ethers";
import { MMAWhoWon, SportsLinkEventStatus } from "../src";

describe("MMA Factory", () => {
  let signer: SignerWithAddress;

  const eventId = 9001;
  const homeTeamName = "Rascal McJupiter";
  const homeTeamId = 42;
  const awayTeamName = "Doja Cat";
  const awayTeamId = 1881;
  const moneylineHome = -600;
  const moneylineAway = 800;

  const now = BigNumber.from(Date.now()).div(1000);
  const estimatedStartTime = now.add(60 * 60 * 24); // one day

  let collateral: Cash;
  let marketFactory: MMAMarketFactory;
  let headToHeadMarketId: BigNumber;

  beforeEach(async () => {
    await deployments.fixture();

    [signer] = await ethers.getSigners();
    marketFactory = (await ethers.getContract("MMAMarketFactory")) as MMAMarketFactory;
    collateral = (await ethers.getContract("Collateral")) as Cash;

    await marketFactory.createEvent(eventId, homeTeamName, homeTeamId, awayTeamName, awayTeamId, estimatedStartTime, [
      moneylineHome,
      moneylineAway,
    ]);

    const filter = marketFactory.filters.MarketCreated(null, null, null);
    const logs = await marketFactory.queryFilter(filter);
    expect(logs.length).to.equal(1);
    const [headToHeadLog] = logs.map((log) => log.args);

    [headToHeadMarketId] = headToHeadLog;
  });

  it("is deployable", async () => {
    expect(await marketFactory.getOwner()).to.equal(signer.address);
    expect(await marketFactory.collateral()).to.equal(collateral.address);
  });

  it("can create markets", async () => {
    expect(headToHeadMarketId).to.equal(1);
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

  it("lists resolvable events", async () => {
    const events = await marketFactory.listResolvableEvents();
    expect(events.length).to.equal(1);
    expect(Number(events[0])).to.equal(eventId);
  });

  describe("resolved market", () => {
    beforeEach(async () => {
      await marketFactory.resolveEvent(eventId, SportsLinkEventStatus.Final, homeTeamId, awayTeamId, MMAWhoWon.Home);
    });

    it("can resolve markets", async () => {
      const headToHeadMarket = await marketFactory.getMarket(headToHeadMarketId);
      expect(headToHeadMarket.winner).to.equal(headToHeadMarket.shareTokens[2]); // home team won
    });

    it("stops listing resolved events", async () => {
      const events = await marketFactory.listResolvableEvents();
      expect(events.length).to.equal(0);
    });
  });

  it("the Away Team can win", async () => {
    const thisEventId = eventId + 1; // just has to be different
    await marketFactory.createEvent(
      thisEventId,
      homeTeamName,
      homeTeamId,
      awayTeamName,
      awayTeamId,
      estimatedStartTime,
      [moneylineHome, moneylineAway]
    );
    const [marketId] = (await marketFactory.getSportsEvent(thisEventId)).markets;
    await marketFactory.resolveEvent(thisEventId, SportsLinkEventStatus.Final, homeTeamId, awayTeamId, MMAWhoWon.Away);
    const headToHeadMarket = await marketFactory.getMarket(marketId);
    expect(headToHeadMarket.winner).to.equal(headToHeadMarket.shareTokens[1]); // away team won
  });

  it("draws can happen", async () => {
    const thisEventId = eventId + 2; // just has to be different
    await marketFactory.createEvent(
      thisEventId,
      homeTeamName,
      homeTeamId,
      awayTeamName,
      awayTeamId,
      estimatedStartTime,
      [moneylineHome, moneylineAway]
    );
    const [marketId] = (await marketFactory.getSportsEvent(thisEventId)).markets;
    await marketFactory.resolveEvent(thisEventId, SportsLinkEventStatus.Final, homeTeamId, awayTeamId, MMAWhoWon.Draw);
    const headToHeadMarket = await marketFactory.getMarket(marketId);
    expect(headToHeadMarket.winner).to.equal(headToHeadMarket.shareTokens[0]); // draw
  });

  it("getters", async () => {
    const { markets, homeTeamId, awayTeamId, estimatedStartTime, status } = await marketFactory.getSportsEvent(eventId);
    expect(markets.length, "markets length").to.equal(1);
    expect(homeTeamId, "away").to.equal(homeTeamId);
    expect(awayTeamId, "home").to.equal(awayTeamId);
    expect(estimatedStartTime, "time").to.equal(estimatedStartTime);
    expect(status, "status").to.equal(1); // Scheduled
  });

  describe("LinkFactory NoContest", () => {
    it("can resolve markets as No Contest", async () => {
      await marketFactory.resolveEvent(eventId, SportsLinkEventStatus.Postponed, 0, 0, MMAWhoWon.Away);

      const headToHeadMarketId = 1;

      const headToHeadMarket = await marketFactory.getMarket(headToHeadMarketId);
      expect(headToHeadMarket.winner, "head to head winner").to.equal(headToHeadMarket.shareTokens[0]); // No Contest
    });
  });
});
