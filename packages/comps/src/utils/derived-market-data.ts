import { BigNumber as BN } from "bignumber.js";
import { Web3Provider } from "@ethersproject/providers";
import * as SimpleSportsDailies from "./derived-simple-sport-dailies";
import * as MmaDailies from "./derived-mma-dailies";
import * as CryptoMarkets from "./derived-crypto-markets";
import * as NflMarkets from "./derived-nfl-dailies";
import {
  DEFAULT_AMM_FEE_RAW,
  MARKET_FACTORY_TYPES,
  MARKET_STATUS,
  NULL_ADDRESS,
  NUM_TICKS_STANDARD,
  SPORTS_MARKET_TYPE,
  ZERO,
} from "./constants";
import { AmmExchange, MarketInfo } from "types";
import { calculatePrices } from "./calculations";
import { convertOnChainCashAmountToDisplayCashAmount, sharesOnChainToDisplay } from "./format-number";
import { MarketFactory } from "@augurproject/smart";
import * as SportFetcher from "./fetcher-sport";

export const getResolutionRules = (marketInfo: MarketInfo): string[] => {
  switch (marketInfo.marketFactoryType) {
    case MARKET_FACTORY_TYPES.SPORTSLINK: {
      return SimpleSportsDailies.getResolutionRules(marketInfo);
    }
    case MARKET_FACTORY_TYPES.CRYPTO: {
      return CryptoMarkets.getResolutionRules(marketInfo);
    }
    case MARKET_FACTORY_TYPES.MMALINK: {
      return MmaDailies.getResolutionRules(marketInfo);
    }
    case MARKET_FACTORY_TYPES.NFL: {
      return NflMarkets.getResolutionRules(marketInfo);
    }
    default:
      return [];
  }
};

const IgnoreMarkets = {
  "3": [SPORTS_MARKET_TYPE.SPREAD, SPORTS_MARKET_TYPE.OVER_UNDER],
};

const IgnoreOpenMarkets = {
  "4": [SPORTS_MARKET_TYPE.MONEY_LINE, SPORTS_MARKET_TYPE.SPREAD, SPORTS_MARKET_TYPE.OVER_UNDER],
};

export const isIgnoredMarket = (sportId: string, sportsMarketType: number): boolean => {
  // ignore MLB spread and over/under
  const sport = IgnoreMarkets[sportId];
  if (!sport) return false;
  return sport.includes(sportsMarketType);
};

export const isIgnoreOpendMarket = (sportId: string, sportsMarketType: number): boolean => {
  // ignore MLB spread and over/under
  const sport = IgnoreOpenMarkets[sportId];
  if (!sport) return false;
  return sport.includes(sportsMarketType);
};

export const deriveMarketInfo = (market: MarketInfo, marketData: any, marketFactoryType: string): MarketInfo => {
  switch (marketFactoryType) {
    case MARKET_FACTORY_TYPES.SPORTSLINK: {
      return SimpleSportsDailies.deriveMarketInfo(market, marketData);
    }
    case MARKET_FACTORY_TYPES.CRYPTO: {
      return CryptoMarkets.deriveMarketInfo(market, marketData);
    }
    case MARKET_FACTORY_TYPES.MMALINK: {
      return MmaDailies.deriveMarketInfo(market, marketData);
    }
    case MARKET_FACTORY_TYPES.NFL: {
      return NflMarkets.deriveMarketInfo(market, marketData);
    }
    default:
      return market;
  }
};

export const fetcherMarketsPerConfig = (config: MarketFactory, provider: Web3Provider, account: string) => {
  switch (config?.type) {
    case MARKET_FACTORY_TYPES.NFL:
    case MARKET_FACTORY_TYPES.MMA:
    case MARKET_FACTORY_TYPES.MLB:
    case MARKET_FACTORY_TYPES.NBA: {
      return SportFetcher.fetchContractData(config, provider, account);
    }
    case MARKET_FACTORY_TYPES.CRYPTO: {
      // TODO: need to support
      console.error('crypto fetcher not supported at this time');
      return null;
    }
    default: {
      console.log('Config type not found', config.type)
      return null;
    }
  }
}

export const decodeMarket = (marketData: any, marketFactoryType: string) => {
  const {
    shareTokens,
    endTime,
    winner,
    creator,
    settlementFee: onChainFee,
    creationTimestamp,
    initialOdds,
  } = marketData;
  const winningOutcomeId = shareTokens.indexOf(winner);
  const hasWinner = winner !== NULL_ADDRESS && winner !== null;
  const reportingState = !hasWinner ? MARKET_STATUS.TRADING : MARKET_STATUS.FINALIZED;

  const creatorFee = new BN(String(onChainFee))
    .div(new BN(10).pow(new BN(18)))
    .times(100)
    .toFixed();

  return {
    endTimestamp: new BN(String(endTime)).toNumber(),
    creationTimestamp: new BN(String(creationTimestamp)).toNumber(),
    numTicks: NUM_TICKS_STANDARD,
    winner: winningOutcomeId === -1 ? null : winningOutcomeId,
    hasWinner,
    reportingState,
    creatorFeeRaw: String(onChainFee),
    settlementFee: creatorFee,
    shareTokens,
    creator,
    marketFactoryType,
    initialOdds: initialOdds ? initialOdds.map((i) => String(i)) : undefined,
  };
};

export const decodeBaseMarketFetcher = (marketData: any) => {
  const { settlementFee: onChainFee, settlementFee, shareFactor, sportId } = marketData;

  const creatorFee = new BN(String(settlementFee))
    .div(new BN(10).pow(new BN(18)))
    .times(100)
    .toFixed();

  return {
    numTicks: NUM_TICKS_STANDARD,
    creatorFeeRaw: String(onChainFee),
    settlementFee: creatorFee,
    sportId: String(sportId),
    shareFactor: String(new BN(String(shareFactor))),
  };
};

export const decodeMarketDetailsFetcher = (marketData: any, factoryDetails: any, config: MarketFactory) => {
  const {
    shareTokens,
    endTime,
    winner,
    creator,
    creationTimestamp,
    initialOdds,
    eventStatus,
    factory,
    marketType,
    marketId: marketIndex,
    pool,
  } = marketData;
  const winningOutcomeId = shareTokens.indexOf(winner);
  const hasWinner = winner !== NULL_ADDRESS && winner !== null;
  const reportingState = !hasWinner ? MARKET_STATUS.TRADING : MARKET_STATUS.FINALIZED;

  const turboId = new BN(String(marketIndex)).toNumber();
  const market = {
    endTimestamp: new BN(String(endTime)).toNumber(),
    creationTimestamp: new BN(String(creationTimestamp)).toNumber(),
    numTicks: NUM_TICKS_STANDARD,
    winner: winningOutcomeId === -1 ? null : winningOutcomeId,
    hasWinner,
    reportingState,
    shareTokens,
    creator,
    marketFactoryAddress: factory,
    eventStatus,
    marketType,
    initialOdds: initialOdds ? initialOdds.map((i) => String(i)) : undefined,
    marketId: `${factory}-${turboId}`,
    turboId,
    marketIndex: turboId, // use this instead of turboId
    ...factoryDetails,
  };
  const marketInfo = deriveMarketInfo(market, marketData, config.type);
  marketInfo.amm = decodePool(marketInfo, pool, factoryDetails, config);
  return marketInfo;
};

const decodePool = (market: MarketInfo, pool: any, factoryDetails: any, config: MarketFactory): AmmExchange => {
  const outcomePrices = calculatePrices(market, pool.ratios, pool.weights);
  const fee = new BN(String(pool.swapFee || DEFAULT_AMM_FEE_RAW)).toFixed();
  const balancesRaw = pool.balances || [];
  const weights = pool.weights;
  const id = pool.addr;
  const created = pool.addr !== NULL_ADDRESS;
  const ammOutcomes = market.outcomes.map((o, i) => ({
    price: created ? String(outcomePrices[i]) : "",
    ratioRaw: created ? getArrayValue(pool.ratios, i) : "",
    ratio: created ? toDisplayRatio(getArrayValue(pool.ratios, i)) : "",
    balanceRaw: created ? getArrayValue(pool.balances, i) : "",
    balance: created ? String(sharesOnChainToDisplay(getArrayValue(pool.balances, i))) : "",
    ...o,
  }));
  const feeDecimal = fee ? new BN(String(fee)).div(new BN(10).pow(18)) : ZERO;
  return {
    id,
    ammOutcomes,
    market,
    feeDecimal: String(feeDecimal),
    feeInPercent: fee ? feeDecimal.times(100).toFixed() : "0",
    feeRaw: fee,
    balancesRaw: balancesRaw ? balancesRaw.map((b) => String(b)) : [],
    shareFactor: new BN(String(factoryDetails.shareFactor)).toFixed(),
    weights: weights ? weights.map((w) => String(w)) : [],
    liquidityUSD: getTotalLiquidity(outcomePrices, balancesRaw),
    turboId: market.turboId,
    marketId: market.marketId,
    cash: factoryDetails.cash,
    ammFactoryAddress: config.ammFactory,
    marketFactoryAddress: config.address,
    hasLiquidity: created,
  };
};

const getArrayValue = (ratios: string[] = [], outcomeId: number) => {
  if (ratios.length === 0) return "0";
  if (!ratios[outcomeId]) return "0";
  return String(ratios[outcomeId]);
};

const toDisplayRatio = (onChainRatio: string = "0"): string => {
  // todo: need to use cash to get decimals
  return convertOnChainCashAmountToDisplayCashAmount(onChainRatio, 18).toFixed();
};

const getTotalLiquidity = (prices: string[], balances: string[]): number => {
  if (prices.length === 0) return 0;
  const outcomeLiquidity = prices.map((p, i) =>
    new BN(p).times(new BN(toDisplayLiquidity(String(balances ? balances[i] : "0")))).toFixed()
  );
  return Number(outcomeLiquidity.reduce((p, r) => p.plus(new BN(r)), ZERO).toFixed(4));
};

const toDisplayLiquidity = (onChainBalance: string = "0"): string => {
  return convertOnChainCashAmountToDisplayCashAmount(onChainBalance).toFixed();
};