import { BigNumber as BN } from "bignumber.js";
import { NO_CONTEST_OUTCOME_ID, MMA_MARKET_TYPE } from "./constants";

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

export const getOutcomeName = (
  outcomeId: number,
  sportId: string,
  homeTeam: string,
  awayTeam: string,
  sportsMarketType: number,
  line: string
) => {
  const marketOutcome = getMarketOutcome(sportId, sportsMarketType, outcomeId);
  // create outcome name using market type and line
  if (outcomeId === NO_CONTEST_OUTCOME_ID) return marketOutcome;

  if (sportsMarketType === MMA_MARKET_TYPE.MONEY_LINE) {
    return populateHomeAway(marketOutcome, homeTeam, awayTeam);
  }

  if (sportsMarketType === MMA_MARKET_TYPE.OVER_UNDER) {
    // over/under
    return marketOutcome.replace(NAMING_LINE.OVER_UNDER_LINE, line);
  }

  return `Outcome ${outcomeId}`;
};

// todo: move this to own file when new market factory is available
export const getMarketTitle = (
  sportId: string,
  homeTeam: string,
  awayTeam: string,
  sportsMarketType: number,
  line: string
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
    title = marketTitles.title.replace(NAMING_LINE.OVER_UNDER_LINE, line);
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

const sportsData = {
  "7": {
    name: "MMA",
    types: {
      [MMA_MARKET_TYPE.MONEY_LINE]: {
        title: `Which team will win?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}?`,
        outcomes: [NO_CONTEST_TIE, `${NAMING_TEAM.AWAY_TEAM}`, `${NAMING_TEAM.HOME_TEAM}`],
      },
      [MMA_MARKET_TYPE.OVER_UNDER]: {
        title: `Will there be over ${NAMING_LINE.OVER_UNDER_LINE}.5 total points scored?`,
        description: `${NAMING_TEAM.AWAY_TEAM} vs ${NAMING_TEAM.HOME_TEAM}`,
        outcomes: [NO_CONTEST, `Over ${NAMING_LINE.OVER_UNDER_LINE}.5`, `Under ${NAMING_LINE.OVER_UNDER_LINE}.5`],
      },
    },
  },
};

// TODO: update rules for MMA
const sportsResolutionRules = {
  "7": {
    types: {
      [MMA_MARKET_TYPE.MONEY_LINE]: [
        `At least 55 minutes of play must have elapsed for the game to be deemed official. If the game is not played or if less than 55 minutes of play have been completed, the game is not considered
an official game and the market should resolve as 'No Contest'.`,
        `Overtime counts towards settlement purposes.`,
        `If the game ends in a tie, the market should resolve as 'No Contest'`,
        `If the game is not played, the market should resolve as 'No Contest'.`,
        `Results are determined by their natural conclusion and do not recognize postponed games,
protests, or overturned decisions.`,
      ],
      [MMA_MARKET_TYPE.OVER_UNDER]: [
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
};
