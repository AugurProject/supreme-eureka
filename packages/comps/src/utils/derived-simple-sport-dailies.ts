import { BigNumber as BN } from "bignumber.js";
import { MarketInfo } from "types";
import { NO_CONTEST_OUTCOME_ID, SPORTS_MARKET_TYPE } from "./constants";
import { getFullTeamName, getSportCategories, getSportId } from "./team-helpers";

const NAMING_TEAM = {
  HOME_TEAM: "HOME_TEAM",
  AWAY_TEAM: "AWAY_TEAM",
  FAV_TEAM: "FAV_TEAM",
  UNDERDOG_TEAM: "UNDERDOG_TEAM",
};
const NAMING_LINE = {
  SPREAD_LINE: "SPREAD_LINE",
  OVER_UNDER_LINE: "OVER_UNDER_LINE",
};
const NO_CONTEST = "No Contest";
const NO_CONTEST_TIE = "Tie/No Contest";
const AWAY_TEAM_OUTCOME = 1;


export const deriveMarketInfo = (market: MarketInfo, marketData: any) => {
  const {
    awayTeamId: coAwayTeamId,
    eventId: coEventId,
    homeTeamId: coHomeTeamId,
    estimatedStartTime,
    value0,
    marketType,
  } = marketData;
  // translate market data
  const eventIdValue = new BN(String(coEventId)).toString(16); // could be used to group events
  const eventId = `0${eventIdValue}`.slice(-32); // just grab the last 32
  const homeTeamId = String(coHomeTeamId); // home team identifier
  const awayTeamId = String(coAwayTeamId); // visiting team identifier
  const startTimestamp = new BN(String(estimatedStartTime)).toNumber(); // estiamted event start time
  let categories = getSportCategories(homeTeamId);
  if (!categories) categories = ["Unknown", "Unknown", "Unknown"];
  const line = new BN(String(value0)).div(10).decimalPlaces(0, 1).toNumber();
  const sportsMarketType = new BN(String(marketType)).toNumber(); // spread, todo: use constant when new sports market factory is ready.
  const homeTeam = getFullTeamName(homeTeamId);
  const awayTeam = getFullTeamName(awayTeamId);
  const sportId = getSportId(homeTeamId) || "4"; // TODO: need to add team so we get correct sportsId

  const { shareTokens } = market;
  const outcomes = decodeOutcomes(market, shareTokens, sportId, homeTeam, awayTeam, sportsMarketType, line);
  const { title, description } = getMarketTitle(sportId, homeTeam, awayTeam, sportsMarketType, line);

  return {
    ...market,
    title,
    description,
    categories,
    outcomes,
    eventId,
    homeTeamId,
    awayTeamId,
    startTimestamp,
    sportId,
    sportsMarketType,
    spreadLine: line,
  };
}

const getOutcomeName = (
  outcomeId: number,
  sportId: string,
  homeTeam: string,
  awayTeam: string,
  sportsMarketType: number,
  line: number
) => {
  const marketOutcome = getMarketOutcome(sportId, sportsMarketType, outcomeId);
  // create outcome name using market type and line
  if (outcomeId === NO_CONTEST_OUTCOME_ID) return marketOutcome;

  if (sportsMarketType === SPORTS_MARKET_TYPE.MONEY_LINE) {
    return populateHomeAway(marketOutcome, homeTeam, awayTeam);
  }

  if (sportsMarketType === SPORTS_MARKET_TYPE.SPREAD) {
    // spread
    // line for home team outcome
    let displayLine = Number(line) > 0 ? `+${line}` : `${line}`;
    if (outcomeId === AWAY_TEAM_OUTCOME) {
      const invertedLine = Number(line) * -1;
      displayLine = Number(line) < 0 ? `+${invertedLine}` : `${invertedLine}`;
    }

    const outcome = populateHomeAway(marketOutcome, homeTeam, awayTeam).replace(NAMING_LINE.SPREAD_LINE, displayLine);
    return outcome;
  }

  if (sportsMarketType === SPORTS_MARKET_TYPE.OVER_UNDER) {
    // over/under
    return marketOutcome.replace(NAMING_LINE.OVER_UNDER_LINE, String(line));
  }

  return `Outcome ${outcomeId}`;
};

// todo: move this to own file when new market factory is available
const getMarketTitle = (
  sportId: string,
  homeTeam: string,
  awayTeam: string,
  sportsMarketType: number,
  line: number,
): { title: string; description: string } => {
  const marketTitles = getSportsTitles(sportId, sportsMarketType);
  if (!marketTitles) {
    console.error(`Could not find ${sportId} sport and/or ${sportsMarketType} market type`);
  }
  let title = "";
  let description = "";
  if (sportsMarketType === 0) {
    // head to head (money line)
    title = marketTitles.title;
    description = populateHomeAway(marketTitles.description, homeTeam, awayTeam);
  }

  if (sportsMarketType === 1) {
    // spread
    let fav = awayTeam;
    let underdog = homeTeam;
    if (Number(line) < 0) {
      underdog = awayTeam;
      fav = homeTeam;
    }
    let spread = new BN(line).abs().toNumber();
    if (!Number.isInteger(spread)) {
      spread = Math.trunc(spread);
    }
    title = marketTitles.title
      .replace(NAMING_TEAM.FAV_TEAM, fav)
      .replace(NAMING_TEAM.UNDERDOG_TEAM, underdog)
      .replace(NAMING_LINE.SPREAD_LINE, String(spread));
  }

  if (sportsMarketType === 2) {
    // over/under
    title = marketTitles.title.replace(NAMING_LINE.OVER_UNDER_LINE, String(line));
    description = populateHomeAway(marketTitles.description, homeTeam, awayTeam);
  }
  return { title, description };
};

const populateHomeAway = (marketTitle: string, homeTeam: string, awayTeam: string): string => {
  return marketTitle.replace(NAMING_TEAM.AWAY_TEAM, awayTeam).replace(NAMING_TEAM.HOME_TEAM, homeTeam);
};

const getSportsTitles = (sportId: string, sportsMarketType: number): { title: string; description: string } => {
  if (!sportsData[sportId]) return null;
  return sportsData[sportId]?.types[sportsMarketType];
};

export const getSportsResolutionRules = (sportId: string, sportsMarketType: number): string[] => {
  if (!sportsResolutionRules[sportId]) return null;
  return sportsResolutionRules[sportId]?.types[sportsMarketType];
};

const getMarketOutcome = (sportId: string, sportsMarketType: number, outcomeId: number): string => {
  if (!sportsData[sportId]) {
    console.error(`sport ${sportId} not found in collection`);
    return "";
  }
  const data = sportsData[sportId]?.types[sportsMarketType];
  if (!data?.outcomes) {
    console.error(`${sportsMarketType} not found in ${sportId} outcomes data`);
    return "";
  }
  return data.outcomes[outcomeId];
};

const decodeOutcomes = (
  market: MarketInfo,
  shareTokens: string[],
  sportId: string,
  homeTeam: string,
  awayTeam: string,
  sportsMarketType: number,
  line: number
) => {
  return shareTokens.map((shareToken, i) => {
    return {
      id: i,
      name: getOutcomeName(i, sportId, homeTeam, awayTeam, sportsMarketType, line), // todo: derive outcome name using market data
      symbol: shareToken,
      isInvalid: i === NO_CONTEST_OUTCOME_ID,
      isWinner: market.hasWinner && (i === market.winner) ? true : false,
      isFinalNumerator: false, // need to translate final numerator payout hash to outcome
      shareToken,
    };
  });
};

const sportsData = {
  "2": {
    name: "NFL",
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: {
        title: `Which team will win?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}?`,
        outcomes: [NO_CONTEST_TIE, `${NAMING_TEAM.AWAY_TEAM}`, `${NAMING_TEAM.HOME_TEAM}`],
      },
      [SPORTS_MARKET_TYPE.SPREAD]: {
        title: `Will the ${NAMING_TEAM.FAV_TEAM} defeat the ${NAMING_TEAM.UNDERDOG_TEAM} by more than ${NAMING_LINE.SPREAD_LINE}.5 points?`,
        description: ``,
        outcomes: [
          NO_CONTEST,
          `${NAMING_TEAM.AWAY_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
          `${NAMING_TEAM.HOME_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
        ],
      },
      [SPORTS_MARKET_TYPE.OVER_UNDER]: {
        title: `Will there be over ${NAMING_LINE.OVER_UNDER_LINE}.5 total points scored?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}`,
        outcomes: [NO_CONTEST, `Over ${NAMING_LINE.OVER_UNDER_LINE}.5`, `Under ${NAMING_LINE.OVER_UNDER_LINE}.5`],
      },
    },
  },
  "3": {
    name: "MLB",
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: {
        title: `Which team will win?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}?`,
        outcomes: [NO_CONTEST, `${NAMING_TEAM.AWAY_TEAM}`, `${NAMING_TEAM.HOME_TEAM}`],
      },
      [SPORTS_MARKET_TYPE.SPREAD]: {
        title: `Will the ${NAMING_TEAM.FAV_TEAM} defeat the ${NAMING_TEAM.UNDERDOG_TEAM} by more than ${NAMING_LINE.SPREAD_LINE}.5 runs?`,
        description: ``,
        outcomes: [
          NO_CONTEST,
          `${NAMING_TEAM.AWAY_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
          `${NAMING_TEAM.HOME_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
        ],
      },
      [SPORTS_MARKET_TYPE.OVER_UNDER]: {
        title: `Will there be over ${NAMING_LINE.OVER_UNDER_LINE}.5 total runs scored?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}`,
        outcomes: [NO_CONTEST, `Over ${NAMING_LINE.OVER_UNDER_LINE}.5`, `Under ${NAMING_LINE.OVER_UNDER_LINE}.5`],
      },
    },
  },
  "4": {
    name: "NBA",
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: {
        title: `Which team will win?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}?`,
        outcomes: [NO_CONTEST, `${NAMING_TEAM.AWAY_TEAM}`, `${NAMING_TEAM.HOME_TEAM}`],
      },
      [SPORTS_MARKET_TYPE.SPREAD]: {
        title: `Will the ${NAMING_TEAM.FAV_TEAM} defeat the ${NAMING_TEAM.UNDERDOG_TEAM} by more than ${NAMING_LINE.SPREAD_LINE}.5 points?`,
        description: ``,
        outcomes: [
          NO_CONTEST,
          `${NAMING_TEAM.AWAY_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
          `${NAMING_TEAM.HOME_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
        ],
      },
      [SPORTS_MARKET_TYPE.OVER_UNDER]: {
        title: `Will there be over ${NAMING_LINE.OVER_UNDER_LINE}.5 total points scored?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}`,
        outcomes: [NO_CONTEST, `Over ${NAMING_LINE.OVER_UNDER_LINE}.5`, `Under ${NAMING_LINE.OVER_UNDER_LINE}.5`],
      },
    },
  },
  "6": {
    name: "NHL",
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: {
        title: `Which team will win?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}?`,
        outcomes: [NO_CONTEST, `${NAMING_TEAM.AWAY_TEAM}`, `${NAMING_TEAM.HOME_TEAM}`],
      },
      [SPORTS_MARKET_TYPE.SPREAD]: {
        title: `Will the ${NAMING_TEAM.FAV_TEAM} defeat the ${NAMING_TEAM.UNDERDOG_TEAM} by more than ${NAMING_LINE.SPREAD_LINE}.5 goals?`,
        description: ``,
        outcomes: [
          NO_CONTEST,
          `${NAMING_TEAM.AWAY_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
          `${NAMING_TEAM.HOME_TEAM} ${NAMING_LINE.SPREAD_LINE}.5`,
        ],
      },
      [SPORTS_MARKET_TYPE.OVER_UNDER]: {
        title: `Will there be over ${NAMING_LINE.OVER_UNDER_LINE}.5 total goals scored?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}`,
        outcomes: [NO_CONTEST, `Over ${NAMING_LINE.OVER_UNDER_LINE}.5`, `Under ${NAMING_LINE.OVER_UNDER_LINE}.5`],
      },
    },
  },
  "7": {
    name: "MMA",
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: {
        title: `Who will win?`,
        description: `${NAMING_TEAM.HOME_TEAM} vs ${NAMING_TEAM.AWAY_TEAM}?`,
        outcomes: [NO_CONTEST, `${NAMING_TEAM.HOME_TEAM}`, `${NAMING_TEAM.AWAY_TEAM}`],
      },
      [SPORTS_MARKET_TYPE.SPREAD]: {
        title: ``,
        description: ``,
      },
      [SPORTS_MARKET_TYPE.OVER_UNDER]: {
        title: `Will fight go the distance?`,
        description: ``,
        outcomes: [NO_CONTEST, `Yes`, `No`],
      },
    },
  },
};

const sportsResolutionRules = {
  "2": {
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: [
        `At least 55 minutes of play must have elapsed for the game to be deemed official. If the game is not played or if less than 55 minutes of play have been completed, the game is not considered
an official game and the market should resolve as 'No Contest'.`,
        `Overtime counts towards settlement purposes.`,
        `If the game ends in a tie, the market should resolve as 'No Contest'`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Results are determined by their natural conclusion and do not recognize postponed games,
protests, or overturned decisions.`,
      ],
      [SPORTS_MARKET_TYPE.SPREAD]: [
        `At least 55 minutes of play must have elapsed for the game to be deemed official. If the game is
not played or if less than 55 minutes of play have been completed, the game is not considered
an official game and the market should resolve as 'No Contest'.`,
        `Overtime counts towards settlement purposes.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Results are determined by their natural conclusion and do not recognize postponed games,
protests, or overturned decisions.`,
      ],
      [SPORTS_MARKET_TYPE.OVER_UNDER]: [
        `At least 55 minutes of play must have elapsed for the game to be deemed official. If the game is
not played or if less than 55 minutes of play have been completed, the game is not considered
an official game and the market should resolve as 'No Contest'.`,
        `Overtime count towards settlement purposes.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Results are determined by their natural conclusion and do not recognize postponed games,
protests, or overturned decisions.`,
      ],
    },
  },
  "3": {
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: [
        `The results of a game are official after (and, unless otherwise stated, bets shall be settled subject to the completion of) 5 innings of play, or 4.5 innings should the home team be leading at the commencement of the bottom of the 5th innings. Should a game be called, if the result is official in accordance with this rule, the winner will be determined by the score/stats after the last completed inning.`,
        `If the game does not reach the "official” time limit, or ends in a tie, the market should resolve as 'No Contest'.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Extra innings count towards settlement purposes.`,
        `Results are determined by the natural conclusion and do not recognize postponed games, protests, or overturned decisions.`,
      ],
      [SPORTS_MARKET_TYPE.SPREAD]: [
        `The results of a game are official after (and, unless otherwise stated, bets shall be settled subject to the completion of) 5 innings of play, or 4.5 innings should the home team be leading at the commencement of the bottom of the 5th innings. Should a game be called, if the result is official in accordance with this rule, the winner will be determined by the score/stats after the last completed inning.`,
        `If the game does not reach the "official” time limit, or ends in a tie, the market should resolve as 'No Contest'.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Extra innings count towards settlement purposes.`,
        `Results are determined by their natural conclusion and do not recognize postponed games, protests, or overturned decisions.`,
      ],
      [SPORTS_MARKET_TYPE.OVER_UNDER]: [
        `The results of a game are official after (and, unless otherwise stated, bets shall be settled subject to the completion of) 5 innings of play, or 4.5 innings should the home team be leading at the commencement of the bottom of the 5th innings. Should a game be called, if the result is official in accordance with this rule, the winner will be determined by the score/stats after the last completed inning.`,
        `If the game does not reach the "official” time limit, the market should resolve as 'No Contest'.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Extra innings count towards settlement purposes.`,
        `Results are determined by their natural conclusion and do not recognize postponed games, protests, or overturned decisions.`,
      ],
    },
  },
  "4": {
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: [
        `At least 43 minutes of play must have elapsed for the game to be deemed official. If the game is not played or if less than 43 minutes of play have been completed, the game is not considered an official game and the market should resolve as 'No Contest'.`,
        `Overtime count towards settlement purposes.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Results are determined by their natural conclusion and do not recognize postponed games, protests, or overturned decisions.`,
      ],
      [SPORTS_MARKET_TYPE.SPREAD]: [
        `At least 43 minutes of play must have elapsed for the game to be deemed official. If the game is not played or if less than 43 minutes of play have been completed, the game is not considered an official game and the market should resolve as 'No Contest'.`,
        `Overtime count towards settlement purposes.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Results are determined by their natural conclusion and do not recognize postponed games, protests, or overturned decisions.`,
      ],
      [SPORTS_MARKET_TYPE.OVER_UNDER]: [
        `At least 43 minutes of play must have elapsed for the game to be deemed official. If the game is not played or if less than 43 minutes of play have been completed, the game is not considered an official game and the market should resolve as 'No Contest'.`,
        `Overtime count towards settlement purposes.`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Results are determined by their natural conclusion and do not recognize postponed games, protests, or overturned decisions.`,
      ],
    },
  },
  "6": {
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: [],
      [SPORTS_MARKET_TYPE.SPREAD]: [],
      [SPORTS_MARKET_TYPE.OVER_UNDER]: [],
    },
  },
  "7": {
    types: {
      [SPORTS_MARKET_TYPE.MONEY_LINE]: [
        `A fight is considered official once the first round begins, regardless of the scheduled or actual duration.`,
        `Market resolves based on the official result immediately following the fight. Later announcements, enquirers, or changes to the official result will not affect market settlement.`,
        `If a fighter is substituted before the fight begins the market should resolve as "Draw/No Contest".`,
        `If a fighter is disqualified during the fight, the opposing fighter should be declared the winner. If both fighters are disqualified the market should resolve as "Draw/No Contest".`,
        `If the fight is cancelled before it starts for any reason, the market should resolve as 'No Contest'.`,
        `A draw can occur when the fight is either stopped before completion or after all rounds are completed and goes to the judges' scorecards for decision. If the match ends in a draw, only the “Draw/No Contest” result should be the winning outcome`,
      ],
      [SPORTS_MARKET_TYPE.SPREAD]: [],
      [SPORTS_MARKET_TYPE.OVER_UNDER]: [
        `A fight is considered official once the first round begins, regardless of the scheduled or actual duration.`,
        `Market resolves based on the official result immediately following the fight. Later announcements, enquirers, or changes to the official result will not affect market settlement.`,
        `If a fighter is substituted before the fight begins the market should resolve as "Draw/No Contest".`,
        `If the fight is cancelled before it starts for any reason, the market should resolve as 'No Contest'.`,
        `If the official time is exactly on (equal to) the over/under number the market should resolve as “Over”.`,
        `Markets referring to round/fight duration represents the actual time passed in the round/fight, as applicable, depending on the scheduled round/fight duration. For example Over 2.5 Total Rounds will be settled as “Over” once two and a half minutes or more in the 3rd Round has passed.`,
      ],
    },
  },
};
