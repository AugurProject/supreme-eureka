// @ts-nocheck
import BigNumber, { BigNumber as BN } from "bignumber.js";
import {
  AddRemoveLiquidity,
  AllMarketsTransactions,
  AmmExchange,
  AmmExchanges,
  AmmMarketShares,
  AmmOutcome,
  BuySellTransactions,
  Cash,
  Cashes,
  ClaimWinningsTransactions,
  CurrencyBalance,
  EstimateTradeResult,
  LiquidityBreakdown,
  LPTokens,
  MarketInfo,
  MarketInfos,
  MarketTransactions,
  PositionBalance,
  UserBalances,
  UserClaimTransactions,
} from "../types";
import { ethers } from "ethers";
import { Contract } from "@ethersproject/contracts";
import { ContractCallContext, ContractCallResults, Multicall } from "@augurproject/ethereum-multicall";
import { TransactionResponse, Web3Provider } from "@ethersproject/providers";
import {
  cashOnChainToDisplay,
  convertDisplayCashAmountToOnChainCashAmount,
  convertDisplayShareAmountToOnChainShareAmount,
  convertOnChainCashAmountToDisplayCashAmount,
  isSameAddress,
  lpTokenPercentageAmount,
  lpTokensOnChainToDisplay,
  sharesDisplayToOnChain,
  sharesOnChainToDisplay,
} from "./format-number";
import {
  DAYS_IN_YEAR,
  DEFAULT_AMM_FEE_RAW,
  DUST_LIQUIDITY_AMOUNT,
  DUST_POSITION_AMOUNT,
  DUST_POSITION_AMOUNT_ON_CHAIN,
  ETH,
  GRAPH_MARKETS,
  MARKET_FACTORY_TYPES,
  MARKET_LOAD_TYPE,
  MARKET_STATUS,
  NULL_ADDRESS,
  NUM_TICKS_STANDARD,
  SEC_IN_DAY,
  SPORTS_MARKET_TYPE,
  TradingDirection,
  USDC,
  ZERO,
} from "./constants";
import { getProviderOrSigner } from "../components/ConnectAccount/utils";
import { createBigNumber } from "./create-big-number";
import { PARA_CONFIG } from "../stores/constants";
import ERC20ABI from "./ERC20ABI.json";
import BPoolABI from "./BPoolABI.json";
import ParaShareTokenABI from "./ParaShareTokenABI.json";
import {
  AbstractMarketFactoryV2,
  AbstractMarketFactoryV2__factory,
  AMMFactory,
  AMMFactory__factory,
  BPool,
  BPool__factory,
  calcSellCompleteSets,
  Cash__factory,
  estimateBuy,
  instantiateMarketFactory,
  MarketFactory,
  MarketFactoryContract,
} from "@augurproject/smart";
import { deriveMarketInfo, isIgnoredMarket, isIgnoreOpendMarket } from "./derived-market-data";

const trimDecimalValue = (value: string | BigNumber) => createBigNumber(value).decimalPlaces(6, 1).toFixed();
interface LiquidityProperties {
  account: string;
  amm: AmmExchange;
  marketId: string;
  cash: Cash;
  fee: string;
  amount: string;
  priceNo: string;
  priceYes: string;
  symbols: string[];
}

export const checkConvertLiquidityProperties = (
  account: string,
  marketId: string,
  amount: string,
  fee: string,
  outcomes: AmmOutcome[],
  cash: Cash,
  amm: AmmExchange
): LiquidityProperties => {
  if (!account || !marketId || !amount || !outcomes || outcomes.length === 0 || !cash) return false;
  if (amount === "0" || amount === "0.00") return false;
  if (Number(fee) < 0) return false;

  return true;
};

export async function estimateAddLiquidityPool(
  account: string,
  provider: Web3Provider,
  amm: AmmExchange,
  cash: Cash,
  cashAmount: string,
  outcomes: AmmOutcome[]
): Promise<LiquidityBreakdown> {
  if (!provider) console.error("provider is null");
  const ammFactoryContract = getAmmFactoryContract(provider, amm.ammFactoryAddress, account);
  const { weights, amount, marketFactoryAddress, turboId } = shapeAddLiquidityPool(amm, cash, cashAmount, outcomes);
  const ammAddress = amm?.id;

  let results = null;
  let tokenAmount = "0";
  let minAmounts = [];
  let minAmountsRaw = [];
  let poolPct = "0";

  if (!ammAddress) {
    console.log("est add init", marketFactoryAddress, turboId, amount, weights, account);
    results = await ammFactoryContract.callStatic.createPool(marketFactoryAddress, turboId, amount, account);
    tokenAmount = trimDecimalValue(sharesOnChainToDisplay(String(results || "0")));
  } else {
    // todo: get what the min lp token out is
    console.log("est add additional", marketFactoryAddress, "marketId", turboId, "amount", amount, 0, account);

    results = await ammFactoryContract.callStatic.addLiquidity(marketFactoryAddress, turboId, amount, 0, account);
    if (results) {
      const { _balances, _poolAmountOut } = results;
      minAmounts = _balances
        ? _balances.map((v, i) => ({
            amount: lpTokensOnChainToDisplay(String(v)).toFixed(),
            outcomeId: i,
            hide: lpTokensOnChainToDisplay(String(v)).lt(DUST_POSITION_AMOUNT),
          }))
        : [];
      minAmountsRaw = _balances ? _balances.map((v) => new BN(String(v)).toFixed()) : [];
      // lp tokens are 18 decimal
      tokenAmount = trimDecimalValue(sharesOnChainToDisplay(String(_poolAmountOut)));

      const poolSupply = lpTokensOnChainToDisplay(amm?.totalSupply).plus(tokenAmount);
      poolPct = lpTokenPercentageAmount(tokenAmount, poolSupply);
    }
  }

  if (!results) return null;

  return {
    amount: tokenAmount,
    minAmounts,
    minAmountsRaw,
    poolPct,
  };
}

export async function addLiquidityPool(
  account: string,
  provider: Web3Provider,
  amm: AmmExchange,
  cash: Cash,
  cashAmount: string,
  minAmount: string,
  outcomes: AmmOutcome[]
): Promise<TransactionResponse> {
  if (!provider) console.error("provider is null");
  const ammFactoryContract = getAmmFactoryContract(provider, amm.ammFactoryAddress, account);
  const { weights, amount, marketFactoryAddress, turboId } = shapeAddLiquidityPool(amm, cash, cashAmount, outcomes);
  const ammAddress = amm?.id;
  const minLpTokenAllowed = "0"; //sharesDisplayToOnChain(minLptokenAmount).toFixed();
  let tx = null;
  console.log(
    !ammAddress ? "add init liquidity:" : "add additional liquidity",
    marketFactoryAddress,
    turboId,
    "amount",
    amount,
    "weights",
    weights,
    "min",
    minLpTokenAllowed
  );
  if (!ammAddress) {
    tx = ammFactoryContract.createPool(marketFactoryAddress, turboId, amount, account, {
      // gasLimit: "800000",
      // gasPrice: "10000000000",
    });
  } else {
    // todo: get what the min lp token out is
    tx = ammFactoryContract.addLiquidity(marketFactoryAddress, turboId, amount, minLpTokenAllowed, account, {
      // gasLimit: "800000",
      // gasPrice: "10000000000",
    });
  }

  return tx;
}

function shapeAddLiquidityPool(amm: AmmExchange, cash: Cash, cashAmount: string, outcomes: AmmOutcome[]): {} {
  const ammAddress = amm?.id;
  const { marketFactoryAddress, turboId } = amm;
  const amount = convertDisplayCashAmountToOnChainCashAmount(cashAmount, cash.decimals).toFixed();
  let weights = [];
  if (!ammAddress) {
    weights = calcWeights(outcomes.map((o) => o.price));
  }
  return {
    marketFactoryAddress,
    turboId,
    weights,
    amount,
  };
}

// TODO: when new ammFactory is done use standard weights.
// creating weights at mid range for outcomes and 2% for no contest outcome
// will see if this approach will help against trolling initial LPs
// const defaultPriceWeights = ["0.02", "0.49", "0.49"];
const calcWeights = (prices: string[]): string[] => {
  const totalWeight = new BN(50);
  const multiplier = new BN(10).pow(new BN(18));
  const results = prices.map((price) => new BN(price).times(totalWeight).times(multiplier).toFixed());
  return results;
};

export const calcPricesFromOdds = (initialOdds: string[], outcomes: AmmOutcome[]) => {
  // convert odds to prices and set prices on outcomes
  const outcomePrices = calculatePrices({ outcomes, winner: null }, initialOdds, []);
  const populatedOutcomes = outcomes.map((o, i) => ({ ...o, price: outcomePrices[i] }));
  return populatedOutcomes;
};

export async function getRemoveLiquidity(
  amm: AmmExchange,
  provider: Web3Provider,
  lpTokenBalance: string,
  account: string,
  cash: Cash,
  hasWinner: boolean = false
): Promise<LiquidityBreakdown | null> {
  if (!provider) {
    console.error("getRemoveLiquidity: no provider");
    return null;
  }
  const { market } = amm;
  const ammFactory = getAmmFactoryContract(provider, amm.ammFactoryAddress, account);

  // balancer lp tokens are 18 decimal places
  const lpBalance = convertDisplayCashAmountToOnChainCashAmount(lpTokenBalance, 18).toFixed();
  let results = null;
  let minAmounts = null;
  let minAmountsRaw = null;
  let collateralOut = "0";

  if (!hasWinner) {
    results = await ammFactory.callStatic
      .removeLiquidity(market.marketFactoryAddress, market.turboId, lpBalance, "0", account) // uint256[] calldata minAmountsOut values be?
      .catch((e) => console.log(e));
    const { _balances, _collateralOut } = results;
    collateralOut = _collateralOut;
    minAmounts = _balances.map((v, i) => ({
      amount: lpTokensOnChainToDisplay(String(v)).toFixed(),
      outcomeId: i,
      hide: lpTokensOnChainToDisplay(String(v)).lt(DUST_POSITION_AMOUNT),
    }));
    minAmountsRaw = _balances.map((v) => new BN(String(v)).toFixed());
  } else {
    results = await estimateLPTokenInShares(amm?.id, provider, lpTokenBalance, account, amm?.ammOutcomes).catch((e) =>
      console.log(e)
    );
    const minAmts = amm?.ammOutcomes.map((o, i) => ({
      amount: results.minAmounts[i],
      outcomeId: i,
      hide: new BN(results.minAmounts[i]).lt(DUST_POSITION_AMOUNT),
    }));
    const minAmtsRaw = amm?.ammOutcomes.map((o, i) => results.minAmountsRaw[i]);
    minAmounts = minAmts;
    minAmountsRaw = minAmtsRaw;
  }

  if (!results) return null;

  const amount = cashOnChainToDisplay(String(collateralOut), cash.decimals).toFixed();
  const poolPct = lpTokenPercentageAmount(lpTokenBalance, lpTokensOnChainToDisplay(amm?.totalSupply || "1"));

  return {
    minAmountsRaw,
    minAmounts,
    amount,
    poolPct,
  };
}

export async function estimateLPTokenInShares(
  balancerPoolId: string,
  provider: Web3Provider,
  lpTokenBalance: string,
  account: string,
  outcomes: AmmOutcome[] = []
): Promise<LiquidityBreakdown | null> {
  if (!provider || !balancerPoolId) {
    console.error("estimate lp tokens: no provider or no balancer pool id");
    return null;
  }
  const balancerPool = getBalancerPoolContract(provider, balancerPoolId, account);
  // balancer lp tokens are 18 decimal places
  const lpBalance = convertDisplayCashAmountToOnChainCashAmount(lpTokenBalance, 18).toFixed();

  const results = await balancerPool
    .calcExitPool(
      lpBalance,
      outcomes.map((o) => "0")
    ) // uint256[] calldata minAmountsOut values be?
    .catch((e) => console.log(e));

  if (!results) return null;
  const minAmounts: string[] = results.map((v) => lpTokensOnChainToDisplay(String(v)).toFixed());
  const minAmountsRaw: string[] = results.map((v) => new BN(String(v)).toFixed());

  return {
    minAmountsRaw,
    minAmounts,
  };
}

export function doRemoveLiquidity(
  amm: AmmExchange,
  provider: Web3Provider,
  lpTokenBalance: string,
  amountsRaw: string[],
  account: string,
  cash: Cash,
  hasWinner = false
): Promise<TransactionResponse | null> {
  if (!provider) {
    console.error("doRemoveLiquidity: no provider");
    return null;
  }
  const { market } = amm;
  const ammFactory = getAmmFactoryContract(provider, amm.ammFactoryAddress, account);
  const lpBalance = convertDisplayCashAmountToOnChainCashAmount(lpTokenBalance, 18).toFixed();
  const balancerPool = getBalancerPoolContract(provider, amm?.id, account);

  return hasWinner
    ? balancerPool.exitPool(lpBalance, amountsRaw)
    : ammFactory.removeLiquidity(market.marketFactoryAddress, market.turboId, lpBalance, "0", account);
}

export const estimateBuyTrade = (
  amm: AmmExchange,
  inputDisplayAmount: string,
  selectedOutcomeId: number,
  cash: Cash
): EstimateTradeResult | null => {
  const amount = convertDisplayCashAmountToOnChainCashAmount(inputDisplayAmount, cash.decimals).toFixed();
  let result = null;
  try {
    result = estimateBuy(amm.shareFactor, selectedOutcomeId, amount, amm.balancesRaw, amm.weights, amm.feeRaw);
  } catch (e) {
    if (String(e).indexOf("ERR_DIV_ZERO") > -1) {
      console.log("Insufficent Liquidity to estimate buy", inputDisplayAmount);
    } else {
      console.log("error in estimate buy", e);
    }
  }

  if (!result) return null;

  const estimatedShares = sharesOnChainToDisplay(String(result));
  const tradeFees = String(new BN(inputDisplayAmount).times(new BN(amm.feeDecimal)));
  const averagePrice = new BN(inputDisplayAmount).div(new BN(estimatedShares));
  const maxProfit = String(new BN(estimatedShares).minus(new BN(inputDisplayAmount)));
  const price = new BN(amm.ammOutcomes[selectedOutcomeId]?.price);
  const priceImpact = price.minus(averagePrice).times(100).toFixed(4);
  const ratePerCash = new BN(estimatedShares).div(new BN(inputDisplayAmount)).toFixed(6);

  return {
    outputValue: trimDecimalValue(estimatedShares),
    tradeFees,
    averagePrice: averagePrice.toFixed(4),
    maxProfit,
    ratePerCash,
    priceImpact,
  };
};

export const estimateSellTrade = (
  amm: AmmExchange,
  inputDisplayAmount: string,
  selectedOutcomeId: number,
  userBalances: string[]
): EstimateTradeResult | null => {
  const amount = sharesDisplayToOnChain(inputDisplayAmount).toFixed();

  const [setsOut, undesirableTokensInPerOutcome] = calcSellCompleteSets(
    amm.shareFactor,
    selectedOutcomeId,
    amount,
    amm.balancesRaw,
    amm.weights,
    amm.feeRaw
  );
  let maxSellAmount = "0";
  const completeSets = sharesOnChainToDisplay(setsOut); // todo: debugging div 1000 need to fix
  const tradeFees = String(new BN(inputDisplayAmount).times(new BN(amm.feeDecimal)));

  const displayAmount = new BN(inputDisplayAmount);
  const averagePrice = new BN(completeSets).div(displayAmount);
  const price = new BN(String(amm.ammOutcomes[selectedOutcomeId].price));
  const userShares = userBalances?.outcomeSharesRaw
    ? new BN(userBalances?.outcomeSharesRaw?.[selectedOutcomeId] || "0")
    : "0";
  const priceImpact = averagePrice.minus(price).times(100).toFixed(4);
  const ratePerCash = new BN(completeSets).div(displayAmount).toFixed(6);
  const displayShares = sharesOnChainToDisplay(userShares);
  const remainingShares = new BN(displayShares || "0").minus(displayAmount).abs();

  const sumUndesirable = (undesirableTokensInPerOutcome || []).reduce((p, u) => p.plus(new BN(u)), ZERO);

  const canSellAll = new BN(amount).minus(sumUndesirable).abs();

  if (canSellAll.gte(new BN(amm.shareFactor))) {
    maxSellAmount = sharesOnChainToDisplay(sumUndesirable).decimalPlaces(4, 1).toFixed();
  }

  return {
    outputValue: String(completeSets),
    tradeFees,
    averagePrice: averagePrice.toFixed(2),
    maxProfit: null,
    ratePerCash,
    remainingShares: remainingShares.toFixed(6),
    priceImpact,
    outcomeShareTokensIn: undesirableTokensInPerOutcome, // just a pass through to sell trade call
    maxSellAmount,
  };
};

export async function doTrade(
  tradeDirection: TradingDirection,
  provider: Web3Provider,
  amm: AmmExchange,
  minAmount: string,
  inputDisplayAmount: string,
  selectedOutcomeId: number,
  account: string,
  cash: Cash,
  slippage: string,
  outcomeShareTokensIn: string[] = []
) {
  if (!provider) return console.error("doTrade: no provider");
  const ammFactoryContract = getAmmFactoryContract(provider, amm.ammFactoryAddress, account);
  const { marketFactoryAddress, turboId } = amm;
  const amount = convertDisplayCashAmountToOnChainCashAmount(inputDisplayAmount, cash.decimals).toFixed();
  const minAmountWithSlippage = new BN(1).minus(new BN(slippage).div(100)).times(new BN(minAmount));
  console.log("minAmount", minAmount, "withSlippage", String(minAmountWithSlippage));
  let onChainMinShares = convertDisplayShareAmountToOnChainShareAmount(
    minAmountWithSlippage,
    cash.decimals
  ).decimalPlaces(0);

  if (tradeDirection === TradingDirection.ENTRY) {
    console.log(
      "address",
      marketFactoryAddress,
      "turboId",
      turboId,
      "outcome",
      selectedOutcomeId,
      "amount",
      amount,
      "min",
      String(onChainMinShares)
    );
    return ammFactoryContract.buy(marketFactoryAddress, turboId, selectedOutcomeId, amount, onChainMinShares.toFixed());
  }

  if (tradeDirection === TradingDirection.EXIT) {
    const { marketFactoryAddress, turboId } = amm;
    const amount = sharesDisplayToOnChain(inputDisplayAmount).toFixed();
    let min = new BN(minAmount);
    if (min.lt(0)) {
      min = "0.01"; // set to 1 cent until estimate gets worked out.
    }

    if (onChainMinShares.lt(0)) {
      onChainMinShares = ZERO;
    }

    console.log(
      "doExitPosition:",
      marketFactoryAddress,
      "marketId",
      String(turboId),
      "outcome",
      selectedOutcomeId,
      "amount",
      String(amount),
      "min amount",
      onChainMinShares.toFixed(),
      "share tokens in",
      outcomeShareTokensIn
    );

    return ammFactoryContract.sellForCollateral(
      marketFactoryAddress,
      turboId,
      selectedOutcomeId,
      outcomeShareTokensIn,
      onChainMinShares.toFixed()
      //,{ gasLimit: "800000", gasPrice: "10000000000"}
    );
  }

  return null;
}

export const claimWinnings = (
  account: string,
  provider: Web3Provider,
  marketIds: string[],
  factoryAddress: string
): Promise<TransactionResponse | null> => {
  if (!provider) return console.error("claimWinnings: no provider");
  const marketFactoryContract = getAbstractMarketFactoryContract(provider, factoryAddress, account);
  return marketFactoryContract.claimManyWinnings(marketIds, account);
};

export const claimFees = (
  account: string,
  provider: Web3Provider,
  factoryAddress: string
): Promise<TransactionResponse | null> => {
  if (!provider) return console.error("claimFees: no provider");
  const marketFactoryContract = getAbstractMarketFactoryContract(provider, factoryAddress, account);
  return marketFactoryContract.claimSettlementFees(account);
};

export const cashOutAllShares = (
  account: string,
  provider: Web3Provider,
  balancesRaw: string[],
  marketId: string,
  shareFactor: string,
  factoryAddress: string
): Promise<TransactionResponse | null> => {
  if (!provider) return console.error("cashOutAllShares: no provider");
  const marketFactoryContract = getAbstractMarketFactoryContract(provider, factoryAddress, account);
  const shareAmount = BigNumber.min(...balancesRaw);
  const normalizedAmount = shareAmount
    .div(new BN(shareFactor))
    .decimalPlaces(0, 1)
    .times(new BN(shareFactor))
    .decimalPlaces(0, 1);
  console.log("share to cash out", shareAmount.toFixed(), marketId, normalizedAmount.toFixed(), account);
  return marketFactoryContract.burnShares(
    marketId,
    normalizedAmount.toFixed(),
    account
    //, { gasLimit: "800000", gasPrice: "10000000000", }
  );
};

export const getCompleteSetsAmount = (outcomeShares: string[]): string => {
  const shares = (outcomeShares || []).map((s, i) => new BN(outcomeShares[i] || "0"));
  const amount = BigNumber.min(...shares);
  if (isNaN(amount.toFixed())) return "0";
  const isDust = amount.lte(DUST_POSITION_AMOUNT);
  return isDust ? "0" : amount.toFixed();
};

const MULTI_CALL_LIMIT = 600;
const chunkedMulticall = async (provider: Web3Provider, contractCalls): ContractCallResults => {
  if (!provider) {
    throw new Error("Provider not provided");
  }

  const multicall = new Multicall({ ethersProvider: provider });
  let results: ContractCallResults = { blocknumber: null, results: {} };

  if (!contractCalls || contractCalls.length === 0) return results;
  if (contractCalls.length < MULTI_CALL_LIMIT) {
    const res = await multicall.call(contractCalls).catch((e) => {
      console.error("multicall", contractCalls, e);
      throw e;
    });
    results = { results: res.results, blocknumber: res.blockNumber };
  } else {
    const combined: ContractCallResults = {
      blocknumber: null,
      results: {},
    };
    const chunks = sliceIntoChunks(contractCalls, MULTI_CALL_LIMIT);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const call = await multicall.call(chunk).catch((e) => {
        console.error(`multicall, chunking ${chunk.length} calls`, e);
        throw e;
      });
      combined.blocknumber = call.blockNumber;
      combined.results = { ...combined.results, ...call.results };
    }
    results = combined;
  }
  return results;
};

const sliceIntoChunks = (arr, chunkSize) => {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
};

export const getUserBalances = async (
  provider: Web3Provider,
  account: string,
  ammExchanges: AmmExchanges,
  cashes: Cashes,
  markets: MarketInfos,
  transactions: AllMarketsTransactions
): Promise<UserBalances> => {
  const userBalances = {
    ETH: {
      balance: "0",
      rawBalance: "0",
      usdValue: "0",
    },
    USDC: {
      balance: "0",
      rawBalance: "0",
      usdValue: "0",
    },
    totalPositionUsd: "0",
    total24hrPositionUsd: "0",
    change24hrPositionUsd: "0",
    totalAccountValue: "0",
    availableFundsUsd: "0",
    lpTokens: {},
    marketShares: {},
    claimableWinnings: {},
    pendingRewards: {},
    claimableFees: "0",
    approvals: {},
    totalRewards: "0",
  };

  if (!account || !provider) return userBalances;

  const userMarketTransactions = getUserTransactions(transactions, account);
  const userClaims = transactions as UserClaimTransactions;
  const BALANCE_OF = "balanceOf";
  const POOL_TOKEN_BALANCE = "getPoolTokenBalance";
  const POOL_PENDING_REWARDS = "getPoolPendingRewards";
  const LP_TOKEN_COLLECTION = "lpTokens";
  const PENDING_REWARDS_COLLECTION = "pendingRewards";
  const MARKET_SHARE_COLLECTION = "marketShares";
  const APPROVAL_COLLECTION = "approvals";
  const ALLOWANCE = "allowance";

  // finalized markets
  const finalizedMarkets = Object.values(markets).filter((m) => m.reportingState === MARKET_STATUS.FINALIZED);
  const finalizedMarketIds = finalizedMarkets.map((f) => f.marketId);
  const finalizedAmmExchanges = Object.values(ammExchanges).filter((a) => finalizedMarketIds.includes(a.marketId));
  const ammFactoryAddresses = Object.values(ammExchanges).reduce(
    (p, exchange) => (p.includes(exchange.ammFactoryAddress) ? p : [...p, exchange.ammFactoryAddress]),
    []
  );

  // balance of
  const exchanges = Object.values(ammExchanges).filter((e) => e.id && e.totalSupply !== "0");
  const allExchanges = Object.values(ammExchanges).filter((e) => e.id);
  userBalances.ETH = await getEthBalance(provider, cashes, account);
  const usdc = Object.values(cashes).find((c) => c.name === USDC);

  const supportRewards = rewardsSupported(ammFactoryAddresses);
  const rewardsUnsupportedExchanges = exchanges.filter((f) => !supportRewards.includes(f.ammFactoryAddress));
  const supportRewardsExchanges = exchanges.filter((f) => supportRewards.includes(f.ammFactoryAddress));
  const ammFactoryAbi =
    supportRewards.length > 0 ? extractABI(getAmmFactoryContract(provider, supportRewards[0], account)) : null;

  const contractLpBalanceRewardsCall: ContractCallContext[] = ammFactoryAbi
    ? supportRewardsExchanges.reduce(
        (p, exchange) => [
          ...p,
          {
            reference: `${exchange.id}-lp`,
            contractAddress: exchange.ammFactoryAddress,
            abi: ammFactoryAbi,
            calls: [
              {
                reference: `${exchange.id}-lp`,
                methodName: POOL_TOKEN_BALANCE,
                methodParameters: [exchange.id, account],
                context: {
                  dataKey: exchange.marketId,
                  collection: LP_TOKEN_COLLECTION,
                  decimals: 18,
                  marketId: exchange.marketId,
                  totalSupply: exchange?.totalSupply,
                },
              },
            ],
          },
          {
            reference: `${exchange.id}-reward`,
            contractAddress: exchange.ammFactoryAddress,
            abi: ammFactoryAbi,
            calls: [
              {
                reference: `${exchange.id}-reward`,
                methodName: POOL_PENDING_REWARDS,
                methodParameters: [exchange.id, account],
                context: {
                  dataKey: exchange.marketId,
                  collection: PENDING_REWARDS_COLLECTION,
                  decimals: 18,
                  marketId: exchange.marketId,
                },
              },
            ],
          },
        ],
        []
      )
    : [];

  const contractLpBalanceCall: ContractCallContext[] = rewardsUnsupportedExchanges.map((exchange) => ({
    reference: exchange.id,
    contractAddress: exchange.id,
    abi: ERC20ABI,
    calls: [
      {
        reference: exchange.id,
        methodName: BALANCE_OF,
        methodParameters: [account],
        context: {
          dataKey: exchange.marketId,
          collection: LP_TOKEN_COLLECTION,
          decimals: 18,
          marketId: exchange.marketId,
          totalSupply: exchange?.totalSupply,
        },
      },
    ],
  }));

  const contractAmmFactoryApprovals: ContractCallContext[] = ammFactoryAddresses.map((address) => ({
    reference: address,
    contractAddress: usdc.address,
    abi: ERC20ABI,
    calls: [
      {
        reference: address,
        methodName: ALLOWANCE,
        methodParameters: [account, address],
        context: {
          dataKey: address,
          collection: APPROVAL_COLLECTION,
        },
      },
    ],
  }));

  const contractMarketShareBalanceCall: ContractCallContext[] = allExchanges.reduce((p, exchange) => {
    const shareTokenOutcomeShareBalances = exchange.ammOutcomes.map((outcome) => ({
      reference: `${outcome.shareToken}`,
      contractAddress: outcome.shareToken,
      abi: ERC20ABI,
      calls: [
        {
          reference: `${outcome.shareToken}`,
          methodName: BALANCE_OF,
          methodParameters: [account],
          context: {
            dataKey: outcome.shareToken,
            collection: MARKET_SHARE_COLLECTION,
            decimals: exchange?.cash?.decimals,
            marketId: exchange.marketId,
            outcomeId: outcome.id,
          },
        },
      ],
    }));
    return [...p, ...shareTokenOutcomeShareBalances];
  }, []);

  let basicBalanceCalls: ContractCallContext[] = [];

  if (usdc) {
    basicBalanceCalls = [
      {
        reference: "usdc-balance",
        contractAddress: usdc.address,
        abi: ERC20ABI,
        calls: [
          {
            reference: "usdcBalance",
            methodName: BALANCE_OF,
            methodParameters: [account],
            context: {
              dataKey: USDC,
              collection: null,
              decimals: usdc?.decimals,
            },
          },
        ],
      },
    ];
  }
  // need different calls to get lp tokens and market share balances
  const balanceCalls = [
    ...basicBalanceCalls,
    ...contractMarketShareBalanceCall,
    ...contractLpBalanceCall,
    ...contractAmmFactoryApprovals,
    ...contractLpBalanceRewardsCall,
  ];

  const balanceResult: ContractCallResults = await chunkedMulticall(provider, balanceCalls);

  for (let i = 0; i < Object.keys(balanceResult.results).length; i++) {
    const key = Object.keys(balanceResult.results)[i];
    const method = String(balanceResult.results[key].originalContractCallContext.calls[0].methodName);
    const balanceValue = balanceResult.results[key].callsReturnContext[0].returnValues[0] as ethers.utils.Result;
    const context = balanceResult.results[key].originalContractCallContext.calls[0].context;
    const rawBalance = new BN(balanceValue._hex).toFixed();
    const { dataKey, collection, decimals, marketId, outcomeId, totalSupply } = context;
    const balance = convertOnChainCashAmountToDisplayCashAmount(new BN(rawBalance), new BN(decimals));

    if (method === POOL_TOKEN_BALANCE) {
      if (rawBalance !== "0") {
        const lpBalance = lpTokensOnChainToDisplay(rawBalance);
        const total = lpTokensOnChainToDisplay(totalSupply);
        const poolPct = lpTokenPercentageAmount(lpBalance, total);
        userBalances[collection][dataKey] = {
          balance: lpBalance.toFixed(),
          rawBalance,
          marketId,
          poolPct,
        };
      } else {
        delete userBalances[collection][dataKey];
      }
    } else if (method === POOL_PENDING_REWARDS) {
      if (rawBalance !== "0") {
        userBalances[collection][dataKey] = {
          balance: balance.toFixed(),
          rawBalance,
          marketId,
        };
      } else {
        delete userBalances[collection][dataKey];
      }
    } else if (method === BALANCE_OF) {
      if (!collection) {
        userBalances[dataKey] = {
          balance: balance.toFixed(),
          rawBalance: rawBalance,
          usdValue: balance.toFixed(),
        };
      } else if (collection === MARKET_SHARE_COLLECTION) {
        const fixedShareBalance = sharesOnChainToDisplay(new BN(rawBalance)).toFixed();
        // shape AmmMarketShares
        const existingMarketShares = userBalances[collection][marketId];
        const marketTransactions = userMarketTransactions[marketId];
        const exchange = ammExchanges[marketId];
        if (existingMarketShares) {
          const position = getPositionUsdValues(
            marketTransactions,
            rawBalance,
            fixedShareBalance,
            outcomeId,
            exchange,
            account,
            userClaims
          );
          if (position) userBalances[collection][marketId].positions.push(position);
          userBalances[collection][marketId].outcomeSharesRaw[outcomeId] = rawBalance;
          userBalances[collection][marketId].outcomeShares[outcomeId] = fixedShareBalance;
        } else if (fixedShareBalance !== "0") {
          userBalances[collection][marketId] = {
            ammExchange: exchange,
            positions: [],
            outcomeSharesRaw: [],
            outcomeShares: [],
          };
          // calc user position here **
          const position = getPositionUsdValues(
            marketTransactions,
            rawBalance,
            fixedShareBalance,
            outcomeId,
            exchange,
            account,
            userClaims
          );
          if (position) userBalances[collection][marketId].positions.push(position);
          userBalances[collection][marketId].outcomeSharesRaw[outcomeId] = rawBalance;
          userBalances[collection][marketId].outcomeShares[outcomeId] = fixedShareBalance;
        }
      }
    } else if (method === ALLOWANCE) {
      userBalances[collection][dataKey] = new BN(rawBalance).gt(ZERO);
    }
  }

  if (finalizedMarkets.length > 0) {
    const keyedFinalizedMarkets = finalizedMarkets.reduce((p, f) => ({ ...p, [f.marketId]: f }), {});
    populateClaimableWinnings(keyedFinalizedMarkets, finalizedAmmExchanges, userBalances.marketShares);
  }

  const totalRewards = Object.values(userBalances.pendingRewards)
    .reduce((p, r) => p.plus(new BN(r.balance)), ZERO)
    .toFixed();
  const userPositions = getTotalPositions(userBalances.marketShares);
  let openMarketShares = {};
  Object.keys(userBalances.marketShares).forEach((marketId) => {
    if (userBalances.marketShares[marketId]?.ammExchange?.market?.winner === null) {
      openMarketShares[marketId] = userBalances.marketShares[marketId];
    }
  });
  const availableFundsUsd = String(new BN(userBalances.USDC.usdValue));
  const totalAccountValue = String(new BN(availableFundsUsd).plus(new BN(userPositions.totalPositionUsd)));
  await populateInitLPValues(userBalances.lpTokens, provider, ammExchanges, account);

  const userOpenPositions = getTotalPositions(openMarketShares);
  const totalAccountValueOpenOnly = String(new BN(availableFundsUsd).plus(new BN(userOpenPositions.totalPositionUsd)));
  const userOpenPositionsOpenOnly = {
    change24hrPositionUsdOpenOnly: userOpenPositions.change24hrPositionUsd,
    total24hrPositionUsdOpenOnly: userOpenPositions.total24hrPositionUsd,
    totalPositionUsdOpenOnly: userOpenPositions.totalPositionUsd,
  };

  return {
    ...userBalances,
    ...userPositions,
    ...userOpenPositionsOpenOnly,
    totalAccountValueOpenOnly,
    totalAccountValue,
    availableFundsUsd,
    totalRewards,
  };
};

const populateClaimableWinnings = (
  finalizedMarkets: MarketInfos = {},
  finalizedAmmExchanges: AmmExchange[] = [],
  marketShares: AmmMarketShares = {}
): void => {
  finalizedAmmExchanges.reduce((p, amm) => {
    const market = finalizedMarkets[amm.marketId];
    const winningOutcome = market.winner ? market.outcomes[market.winner] : null;
    if (winningOutcome) {
      const outcomeBalances = marketShares[amm.marketId];
      const userShares = outcomeBalances?.positions.find((p) => p.outcomeId === winningOutcome.id);
      if (userShares && new BN(userShares?.rawBalance).gt(0)) {
        const claimableBalance = new BN(userShares.balance).minus(new BN(userShares.initCostUsd)).abs().toFixed(4);
        marketShares[amm.marketId].claimableWinnings = {
          claimableBalance,
          userBalances: outcomeBalances.outcomeSharesRaw,
        };
      }
    }
    return p;
  }, {});
};

const getTotalPositions = (
  ammMarketShares: AmmMarketShares
): { change24hrPositionUsd: string; totalPositionUsd: string; total24hrPositionUsd: string } => {
  const result = Object.keys(ammMarketShares).reduce(
    (p, ammId) => {
      const outcomes = ammMarketShares[ammId];
      outcomes.positions.forEach((position) => {
        p.total = p.total.plus(new BN(position.usdValue));
        if (position.past24hrUsdValue) {
          p.total24 = p.total24.plus(new BN(position.past24hrUsdValue));
        }
      });
      return p;
    },
    { total: new BN("0"), total24: new BN("0") }
  );

  const change24hrPositionUsd = String(result.total.minus(result.total24));
  return {
    change24hrPositionUsd,
    total24hrPositionUsd: String(result.total24),
    totalPositionUsd: String(result.total),
  };
};

const getPositionUsdValues = (
  marketTransactions: MarketTransactions,
  rawBalance: string,
  balance: string,
  outcome: string,
  amm: AmmExchange,
  account: string,
  userClaims: UserClaimTransactions
): PositionBalance => {
  let past24hrUsdValue = null;
  let change24hrPositionUsd = null;
  let avgPrice = "0";
  let initCostUsd = "0";
  let totalChangeUsd = "0";
  let timestamp = 0;
  let quantity = trimDecimalValue(balance);
  const outcomeId = Number(outcome);
  const price = amm.ammOutcomes[outcomeId].price;
  const outcomeName = amm.ammOutcomes[outcomeId].name;
  let visible = false;
  let positionFromAddLiquidity = false;
  let positionFromRemoveLiquidity = false;

  // need to get this from outcome
  const maxUsdValue = new BN(balance).times(new BN(amm.cash.usdPrice)).toFixed();

  let result = {
    avgPrice: "0",
    positionFromRemoveLiquidity: false,
    positionFromAddLiquidity: false,
  };

  const currUsdValue = new BN(balance).times(new BN(price)).times(new BN(amm.cash.usdPrice)).toFixed();
  const postitionResult = getInitPositionValues(marketTransactions, amm, outcome, account, userClaims);

  if (postitionResult) {
    result = postitionResult;
    avgPrice = trimDecimalValue(result.avgPrice);
    initCostUsd = new BN(result.avgPrice).times(new BN(quantity)).toFixed(4);
    timestamp = postitionResult.timestamp;
  }

  let usdChangedValue = new BN(currUsdValue).minus(new BN(initCostUsd));
  // ignore negative dust difference
  if (usdChangedValue.lt(new BN("0")) && usdChangedValue.gt(new BN("-0.001"))) {
    usdChangedValue = usdChangedValue.abs();
  }
  totalChangeUsd = trimDecimalValue(usdChangedValue);
  visible = true;
  positionFromAddLiquidity = !result.positionFromRemoveLiquidity && result.positionFromAddLiquidity;
  positionFromRemoveLiquidity = result.positionFromRemoveLiquidity;

  if (new BN(balance).lt(DUST_POSITION_AMOUNT)) return null;

  return {
    balance,
    quantity,
    rawBalance,
    usdValue: currUsdValue,
    past24hrUsdValue,
    change24hrPositionUsd,
    totalChangeUsd,
    avgPrice,
    initCostUsd,
    outcomeName,
    outcomeId,
    maxUsdValue,
    visible,
    positionFromAddLiquidity,
    positionFromRemoveLiquidity,
    timestamp,
  };
};

export const getLPCurrentValue = async (
  displayBalance: string,
  provider: Web3Provider,
  amm: AmmExchange,
  account: string
): Promise<string> => {
  const { ammOutcomes } = amm;
  if (!ammOutcomes || ammOutcomes.length === 0 || displayBalance === "0") return null;
  const estimate = await estimateLPTokenInShares(
    amm.id,
    provider,
    displayBalance,
    account,
    amm.ammOutcomes
  ).catch((error) => console.error("getLPCurrentValue estimation error", error));

  if (estimate && estimate.minAmountsRaw) {
    const totalValueRaw = ammOutcomes.reduce((p, v, i) => p.plus(new BN(estimate.minAmounts[i]).times(v.price)), ZERO);

    return totalValueRaw.times(amm?.cash?.usdPrice).toFixed();
  }
  return null;
};

const populateInitLPValues = async (
  lptokens: LPTokens,
  provider: Web3Provider,
  ammExchanges: AmmExchanges,
  account: string
): Promise<LPTokens> => {
  const marketIds = Object.keys(lptokens);
  for (let i = 0; i < marketIds.length; i++) {
    const marketId = marketIds[i];
    const lptoken = lptokens[marketId];
    const amm = ammExchanges[marketId];
    // sum up enters/exits transaction usd cash values
    const initialCashValueUsd = "0";
    lptoken.initCostUsd = initialCashValueUsd;
    lptoken.usdValue = lptoken?.balance ? await getLPCurrentValue(lptoken.balance, provider, amm, account) : "0";
  }

  return lptokens;
};

export const getUserLpTokenInitialAmount = (
  transactions: AllMarketsTransactions,
  account: string,
  cash: Cash
): { [marketId: string]: string } => {
  return Object.keys(transactions).reduce((p, marketId) => {
    const id = marketId.toLowerCase();
    const adds = (transactions[marketId]?.addLiquidity || [])
      .filter((t) => isSameAddress(t.sender?.id, account))
      .reduce((p, t) => p.plus(new BN(t.collateral || "0").abs()), new BN("0"));
    const removed = (transactions[marketId]?.removeLiquidity || [])
      .filter((t) => isSameAddress(t.sender?.id, account))
      .reduce((p, t) => p.plus(new BN(t.collateral || "0").abs()), new BN("0"));
    const initCostUsd = String(adds.minus(removed));
    return {
      ...p,
      [id]: convertOnChainCashAmountToDisplayCashAmount(initCostUsd, cash.decimals).toFixed(),
    };
  }, {});
};

const getUserTransactions = (transactions: AllMarketsTransactions, account: string): AllMarketsTransactions => {
  if (!transactions) return {};
  return Object.keys(transactions).reduce((p, marketId) => {
    const id = marketId.toLowerCase();
    const addLiquidity = (transactions[marketId]?.addLiquidity || []).filter((t) =>
      isSameAddress(t.sender?.id, account)
    );
    const removeLiquidity = (transactions[marketId]?.removeLiquidity || []).filter((t) =>
      isSameAddress(t.sender?.id, account)
    );
    const buys = (transactions[marketId]?.trades || []).filter(
      (t) => isSameAddress(t.user, account) && new BN(t.collateral).lt(0)
    );
    const sells = (transactions[marketId]?.trades || []).filter(
      (t) => isSameAddress(t.user, account) && new BN(t.collateral).gt(0)
    );

    return {
      ...p,
      [id]: {
        addLiquidity,
        removeLiquidity,
        buys,
        sells,
      },
    };
  }, {});
};

const getDefaultPrice = (outcome: string, weights: string[]) => {
  const total = weights.reduce((p, w) => p.plus(new BN(w)), ZERO);
  const weight = new BN(weights[Number(outcome)]);
  return weight.div(total);
};
const getInitPositionValues = (
  marketTransactions: MarketTransactions,
  amm: AmmExchange,
  outcome: string,
  account: string,
  userClaims: UserClaimTransactions
): { avgPrice: string; positionFromAddLiquidity: boolean; positionFromRemoveLiquidity: boolean; timestamp: number } => {
  const outcomeId = String(new BN(outcome));
  // sum up trades shares
  const claimTimestamp = lastClaimTimestamp(userClaims?.claimedProceeds, outcomeId, account);
  const sharesEntered = accumSharesPrice(marketTransactions?.buys, outcomeId, account, claimTimestamp);
  const enterAvgPriceBN = sharesEntered.avgPrice;
  const defaultAvgPrice = getDefaultPrice(outcome, amm.weights);

  // get shares from LP activity
  const sharesAddLiquidity = accumLpSharesPrice(
    marketTransactions?.addLiquidity,
    outcomeId,
    account,
    claimTimestamp,
    amm.shareFactor,
    defaultAvgPrice
  );
  const sharesRemoveLiquidity = accumLpSharesPrice(
    marketTransactions?.removeLiquidity,
    outcome,
    account,
    claimTimestamp,
    amm.shareFactor,
    defaultAvgPrice
  );

  const positionFromAddLiquidity = sharesAddLiquidity.shares.gt(ZERO);
  const positionFromRemoveLiquidity = sharesRemoveLiquidity.shares.gt(ZERO);

  const outcomeLiquidityShares = sharesRemoveLiquidity.shares.plus(sharesAddLiquidity.shares);

  const avgPriceLiquidity = outcomeLiquidityShares.gt(0)
    ? sharesAddLiquidity.avgPrice
        .times(sharesAddLiquidity.shares)
        .plus(sharesRemoveLiquidity.avgPrice.times(sharesRemoveLiquidity.shares))
        .div(sharesAddLiquidity.shares.plus(sharesRemoveLiquidity.shares))
    : ZERO;

  const totalShares = outcomeLiquidityShares.plus(sharesEntered.shares);
  const weightedAvgPrice = totalShares.gt(ZERO)
    ? avgPriceLiquidity
        .times(outcomeLiquidityShares)
        .div(totalShares)
        .plus(enterAvgPriceBN.times(sharesEntered.shares).div(totalShares))
    : 0;

  const timestamp = [
    ...(marketTransactions?.addLiquidity || []),
    ...(marketTransactions?.removeLiquidity || []),
    ...(marketTransactions?.buys || []),
    ...(marketTransactions?.sells || []),
  ].reduce((p, v) => (v.timestamp > p ? v.timestamp : p), 0);

  return {
    avgPrice: String(weightedAvgPrice),
    positionFromAddLiquidity,
    positionFromRemoveLiquidity,
    timestamp,
  };
};

const accumSharesPrice = (
  transactions: BuySellTransactions[],
  outcome: string,
  account: string,
  cutOffTimestamp: number
): { shares: BigNumber; cashAmount: BigNumber; avgPrice: BigNumber } => {
  if (!transactions || transactions.length === 0) return { shares: ZERO, cashAmount: ZERO, avgPrice: ZERO };
  const result = transactions
    .filter(
      (t) =>
        isSameAddress(t.user, account) && new BN(t.outcome).eq(new BN(outcome)) && Number(t.timestamp) > cutOffTimestamp
    )
    .reduce(
      (p, t) => {
        const shares = p.shares.plus(new BN(t.shares)).abs();
        const cashAmount = p.cashAmount.plus(new BN(t.collateral).abs());
        const accumAvgPrice = new BN(t.collateral).times(new BN(t.price)).abs().plus(p.accumAvgPrice);
        return {
          shares,
          cashAmount,
          accumAvgPrice,
        };
      },
      { shares: ZERO, cashAmount: ZERO, accumAvgPrice: ZERO }
    );
  const avgPrice = result.cashAmount.eq(ZERO) ? ZERO : result.accumAvgPrice.div(result.cashAmount);
  return { shares: result.shares, cashAmount: result.cashAmount, avgPrice };
};

const accumLpSharesPrice = (
  transactions: AddRemoveLiquidity[],
  outcome: string,
  account: string,
  cutOffTimestamp: number,
  shareFactor: string,
  outcomeDefaultAvgPrice: string
): { shares: BigNumber; cashAmount: BigNumber; avgPrice: BigNumber } => {
  if (!transactions || transactions.length === 0) return { shares: ZERO, cashAmount: ZERO, avgPrice: ZERO };
  const result = transactions
    .filter((t) => isSameAddress(t?.sender?.id, account) && Number(t.timestamp) > cutOffTimestamp)
    .reduce(
      (p, t) => {
        const outcomeShares = new BN(t.sharesReturned[Number(outcome)]);
        let shares = t.sharesReturned && t.sharesReturned.length > 0 ? outcomeShares : ZERO;
        if (shares.gt(ZERO) && shares.lte(DUST_POSITION_AMOUNT_ON_CHAIN)) {
          return p;
        }

        const cashValue = outcomeShares.eq(ZERO)
          ? ZERO
          : outcomeShares.div(new BN(shareFactor)).div(new BN(t.sharesReturned.length)).abs();
        return {
          shares: p.shares.plus(shares),
          cashAmount: p.cashAmount.plus(new BN(cashValue)),
        };
      },
      { shares: ZERO, cashAmount: ZERO }
    );

  return { shares: result.shares, cashAmount: result.cashAmount, avgPrice: new BN(outcomeDefaultAvgPrice) };
};

export const calculateAmmTotalVolApy = (
  amm: AmmExchange,
  transactions: MarketTransactions = {},
  hasWinner: boolean = false
): { apy: string; vol: string; vol24hr: string } => {
  const defaultValues = { apy: undefined, vol: null, vol24hr: null };
  if (!amm?.id || (transactions?.addLiquidity || []).length === 0) return defaultValues;

  const { feeDecimal, liquidityUSD, cash } = amm;

  const timestamp24hr = Math.floor(new Date().getTime() / 1000 - SEC_IN_DAY);
  // calc total volume
  const volumeTotalUSD = calcTotalVolumeUSD(transactions, cash).toNumber();
  const volumeTotalUSD24hr = calcTotalVolumeUSD(transactions, cash, timestamp24hr).toNumber();

  const sortedAddLiquidity = (transactions?.addLiquidity || []).sort((a, b) =>
    Number(a.timestamp) > Number(b.timestamp) ? 1 : -1
  );
  const startTimestamp = Number(sortedAddLiquidity[0].timestamp);

  if (volumeTotalUSD === 0 || startTimestamp === 0 || feeDecimal === "0") return defaultValues;

  const totalFeesInUsd = new BN(volumeTotalUSD).times(new BN(feeDecimal));
  const currTimestamp = Math.floor(new Date().getTime() / 1000); // current time in unix timestamp
  const secondsPast = currTimestamp - startTimestamp;
  const pastDays = Math.floor(new BN(secondsPast).div(SEC_IN_DAY).toNumber());

  const tradeFeeLiquidityPerDay = new BN(liquidityUSD).lte(DUST_LIQUIDITY_AMOUNT)
    ? null
    : totalFeesInUsd.div(new BN(liquidityUSD)).div(new BN(pastDays || 1));

  const tradeFeePerDayInYear =
    hasWinner || !tradeFeeLiquidityPerDay
      ? undefined
      : tradeFeeLiquidityPerDay.times(DAYS_IN_YEAR).abs().times(100).toFixed(4);
  return { apy: tradeFeePerDayInYear, vol: volumeTotalUSD, vol24hr: volumeTotalUSD24hr };
};

const calcTotalVolumeUSD = (transactions: MarketTransactions, cash: Cash, cutoffTimestamp: number = 0) => {
  const { trades } = transactions;
  const totalCollateral = (trades || []).reduce(
    (p, b) => (b.timestamp > cutoffTimestamp ? p.plus(new BN(b.collateral).abs()) : p),
    ZERO
  );
  return convertOnChainCashAmountToDisplayCashAmount(totalCollateral, cash.decimals);
};

const lastClaimTimestamp = (transactions: ClaimWinningsTransactions[], outcome: string, account: string): number => {
  if (!transactions || transactions.length === 0) return 0;
  const claims = transactions.filter((c) => isSameAddress(c.receiver, account) && c.outcome === outcome);
  return claims.reduce((p, c) => (Number(c.timestamp) > p ? Number(c.timestamp) : p), 0);
};

const getEthBalance = async (provider: Web3Provider, cashes: Cashes, account: string): Promise<CurrencyBalance> => {
  const ethCash = Object.values(cashes).find((c) => c.name === ETH);
  const ethbalance = await provider.getBalance(account);
  const ethValue = convertOnChainCashAmountToDisplayCashAmount(new BN(String(ethbalance)), 18);

  return {
    balance: String(ethValue),
    rawBalance: String(ethbalance),
    usdValue: ethCash ? String(ethValue.times(new BN(ethCash.usdPrice))) : String(ethValue),
  };
};

export const isAddress = (value) => {
  try {
    return ethers.utils.getAddress(value.toLowerCase());
  } catch {
    return false;
  }
};

export const getContract = (tokenAddress: string, ABI: any, library: Web3Provider, account?: string): Contract => {
  if (!isAddress(tokenAddress) || tokenAddress === NULL_ADDRESS) {
    throw Error(`Invalid 'address' parameter '${tokenAddress}'.`);
  }
  return new Contract(tokenAddress, ABI, getProviderOrSigner(library, account) as any);
};

const getAmmFactoryContract = (library: Web3Provider, address: string, account?: string): AMMFactory => {
  return AMMFactory__factory.connect(address, getProviderOrSigner(library, account));
};

export const faucetUSDC = async (library: Web3Provider, account?: string) => {
  const { marketFactories } = PARA_CONFIG;
  const usdcContract = marketFactories[0].collateral;
  const amount = ethers.BigNumber.from(10).pow(10); // 10k
  const collateral = Cash__factory.connect(usdcContract, getProviderOrSigner(library, account));
  await collateral.faucet(amount as BigNumberish);
};

const getMarketFactoryContract = (
  library: Web3Provider,
  marketFactoryData: MarketFactory,
  account?: string
): MarketFactoryContract => {
  return instantiateMarketFactory(
    marketFactoryData.type,
    marketFactoryData.subtype,
    marketFactoryData.address,
    getProviderOrSigner(library, account)
  );
};

const getAbstractMarketFactoryContract = (
  library: Web3Provider,
  address: string,
  account?: string
): AbstractMarketFactoryV2 => {
  return AbstractMarketFactoryV2__factory.connect(address, getProviderOrSigner(library, account));
};

const getBalancerPoolContract = (library: Web3Provider, address: string, account?: string): BPool => {
  return BPool__factory.connect(address, getProviderOrSigner(library, account));
};

// returns null on errors
export const getErc20Contract = (tokenAddress: string, library: Web3Provider, account: string): Contract | null => {
  if (!tokenAddress || !library) return null;
  try {
    return getContract(tokenAddress, ERC20ABI, library, account);
  } catch (error) {
    console.error("Failed to get contract", error);
    return null;
  }
};

export const getErc1155Contract = (tokenAddress: string, library: Web3Provider, account: string): Contract | null => {
  if (!tokenAddress || !library) return null;
  try {
    return getContract(tokenAddress, ParaShareTokenABI, library, account);
  } catch (error) {
    console.error("Failed to get contract", error);
    return null;
  }
};

export const getERC20Allowance = async (
  tokenAddress: string,
  provider: Web3Provider,
  account: string,
  spender: string
): Promise<string> => {
  const contract = getErc20Contract(tokenAddress, provider, account);
  const result = await contract.allowance(account, spender);
  const allowanceAmount = String(new BN(String(result)));
  return allowanceAmount;
};

export const getERC1155ApprovedForAll = async (
  tokenAddress: string,
  provider: Web3Provider,
  account: string,
  spender: string
): Promise<boolean> => {
  const contract = getErc1155Contract(tokenAddress, provider, account);
  const isApproved = await contract.isApprovedForAll(account, spender);
  return Boolean(isApproved);
};

const rewardsSupported = (ammFactories: string[]) => {
  // filter out amm factories that don't support rewards, use new flag to determine if amm factory gives rewards
  const rewardable = marketFactories()
    .filter((m) => m.hasRewards)
    .map((m) => m.ammFactory);
  return ammFactories.filter((m) => rewardable.includes(m));
};

// adding constants here with special logic
const OLDEST_MARKET_FACTORY_VER = "v1.0.0-beta.7";
const SUB_OLD_VERSION = "V1";

export const canAddLiquidity = (market: MarketInfo): boolean => {
  const initLiquidity = !market?.amm?.id;
  if (!initLiquidity) return true;
  const data = getMarketFactoryData(market.marketFactoryAddress);
  return data?.subtype !== SUB_OLD_VERSION;
};

const marketFactories = (loadtype: string = MARKET_LOAD_TYPE.SIMPLIFIED): MarketFactory[] => {
  if (loadtype === MARKET_LOAD_TYPE.SPORT)
    return PARA_CONFIG.marketFactories.filter((c) => c.type !== MARKET_FACTORY_TYPES.CRYPTO);
  return PARA_CONFIG.marketFactories;
};

const getMarketFactoryData = (marketFactoryAddress: string): MarketFactory => {
  const factory = marketFactories().find((m) => m.address.toLowerCase() === marketFactoryAddress.toLowerCase());
  if (!factory) return null;
  return factory;
};

export const ammFactoryMarketNames = (): MarketFactoryNames[] => {
  return PARA_CONFIG.marketFactories.reduce((p, factory) => {
    const isSportsLink = factory.type === MARKET_FACTORY_TYPES.SPORTSLINK;
    return {
      ...p,
      [factory.ammFactory]: isSportsLink ? "NBA & MLB" : factory.description.toUpperCase(),
    };
  });
};

// stop updating resolved markets
const addToIgnoreList = (
  ignoreList: { [factory: string]: number[] },
  factoryAddress: string,
  marketIndexs: number[] | number
) => {
  const address = factoryAddress.toUpperCase();
  const factoryList = ignoreList[address] || [];
  const filtered = marketIndexs.filter((i) => !factoryList.includes(i));
  ignoreList[address] = [...factoryList, ...filtered];
};

export const getMarketInfos = async (
  provider: Web3Provider,
  markets: MarketInfos,
  ammExchanges: AmmExchanges,
  cashes: Cashes,
  account: string,
  ignoreList: { [factory: string]: number[] },
  loadtype: string = MARKET_LOAD_TYPE.SIMPLIFIED,
  blocknumber: number
): { markets: MarketInfos; ammExchanges: AmmExchanges; blocknumber: number } => {
  const factories = marketFactories(loadtype);

  const allMarkets = await Promise.all(
    factories.map(({ type, address, ammFactory }) =>
      getFactoryMarketInfo(
        provider,
        markets,
        ammExchanges,
        cashes,
        account,
        address,
        ammFactory,
        ignoreList,
        type,
        blocknumber
      )
    )
  );

  // first market infos get all markets with liquidity
  const aMarkets = allMarkets.reduce((p, data) => ({ ...p, ...data.markets }), {});
  let filteredMarkets = { ...markets, ...aMarkets };
  const newBlocknumber = allMarkets.reduce((p, data) => (p > data.blocknumber ? p : data.blocknumber), 0);

  if (Object.keys(ignoreList).length === 0) {
    filteredMarkets = setIgnoreRemoveMarketList(filteredMarkets, ignoreList, loadtype);
  }

  const exchanges = Object.values(filteredMarkets).reduce((p, m) => ({ ...p, [m.marketId]: m.amm }), {});
  return { markets: filteredMarkets, ammExchanges: exchanges, blocknumber: newBlocknumber };
};

const setIgnoreRemoveMarketList = (
  allMarkets: MarketInfos,
  ignoreList: { [factory: string]: number[] },
  loadtype: string = MARKET_LOAD_TYPE.SIMPLIFIED
): MarketInfos => {
  // <Removal> resolved markets with no liquidity
  const nonLiqResolvedMarkets = Object.values(allMarkets).filter((m) => !m?.amm?.hasLiquidity && m?.hasWinner);

  // <Removal> speard marketw with zero line
  const zeroSpreadMarkets = Object.values(allMarkets).filter(
    (m) => m?.sportsMarketType === SPORTS_MARKET_TYPE.SPREAD && m?.spreadLine === 0 && m.amm.hasLiquidity === false
  );
  // <Removal> MLB spread and over/under
  // <Removal> for sportsbook removing crypto
  const ignoredSportsMarkets = Object.values(allMarkets).filter((m) =>
    isIgnoredMarket(m?.sportId, m?.sportsMarketType)
  );

  const ignoredCrypto =
    loadtype === MARKET_LOAD_TYPE.SPORT
      ? Object.values(allMarkets).filter(({ marketFactoryType }) => marketFactoryType === MARKET_FACTORY_TYPES.CRYPTO)
      : [];

  // <Removal> same eventIds, market with liquidity wins
  const existingEvents = Object.values(allMarkets)
    .filter((m) => m.amm.hasLiquidity && m.version === OLDEST_MARKET_FACTORY_VER)
    .map((m) => m.eventId);
  const dupEventMarkets = Object.values(allMarkets).filter(
    (m) => existingEvents.includes(m.eventId) && m.version !== OLDEST_MARKET_FACTORY_VER
  );

  // <Removal> summer nba open markets
  // TODO: need to allow when NBA season comes around again
  const openNbaV1Markets = Object.values(allMarkets).filter(
    (m) => isIgnoreOpendMarket(m?.sportId, m?.sportsMarketType) && !m.hasWinner
  );

  const ignoreRemovedMarkets = [
    ...ignoredCrypto,
    ...nonLiqResolvedMarkets,
    ...zeroSpreadMarkets,
    ...ignoredSportsMarkets,
    ...dupEventMarkets,
    ...openNbaV1Markets,
  ].reduce((p, m) => ({ ...p, [m.marketFactoryAddress]: [...(p[m.marketFactoryAddress] || []), m.turboId] }), {});

  Object.keys(ignoreRemovedMarkets).forEach((factoryAddress) =>
    addToIgnoreList(ignoreList, factoryAddress, ignoreRemovedMarkets[factoryAddress])
  );

  const filteredMarkets = Object.keys(allMarkets).reduce(
    (p, id) =>
      (ignoreRemovedMarkets[allMarkets[id].marketFactoryAddress] || []).includes(allMarkets[id].turboId)
        ? p
        : { ...p, [id]: allMarkets[id] },
    {}
  );

  // <Ignore> resolved markets
  Object.values(filteredMarkets)
    .filter((m) => m.hasWinner)
    .forEach((m) => addToIgnoreList(ignoreList, m.marketFactoryAddress, [m.turboId]));

  return filteredMarkets;
};

const getFactoryMarketInfo = async (
  provider: Web3Provider,
  markets: MarketInfos,
  ammExchanges: AmmExchanges,
  cashes: Cashes,
  account: string,
  factoryAddress: string,
  ammFactory: string,
  ignoreList: { [factory: string]: number[] },
  MarketFactoryType: string,
  blocknumber: number
): { markets: MarketInfos; ammExchanges: AmmExchanges; blocknumber: number; factoryAddress: string } => {
  const marketFactoryContract = getAbstractMarketFactoryContract(provider, factoryAddress, account);
  const numMarkets = (await marketFactoryContract.marketCount()).toNumber();
  const ignoreMarketIndexes = ignoreList[factoryAddress.toUpperCase()] || [];

  let indexes = [];
  for (let i = 1; i < numMarkets; i++) {
    if (!ignoreMarketIndexes.includes(i)) indexes.push(i);
  }

  if (indexes.length === 0) return { markets, ammExchanges, blocknumber, factoryAddress };

  const { marketInfos, exchanges, blocknumber: newBlocknumber } = await retrieveMarkets(
    indexes,
    cashes,
    provider,
    account,
    factoryAddress,
    ammFactory,
    MarketFactoryType,
    blocknumber
  );

  return {
    markets: marketInfos,
    ammExchanges: exchanges,
    blocknumber: newBlocknumber ? newBlocknumber : blocknumber,
    factoryAddress,
  };
};

const retrieveMarkets = async (
  indexes: number[],
  cashes: Cashes,
  provider: Web3Provider,
  account: string,
  factoryAddress: string,
  ammFactory: string,
  marketFactoryType: string,
  blocknumber
): Market[] => {
  const GET_MARKETS = "getMarket";
  const GET_MARKET_DETAILS = "getMarketDetails";
  const GET_POOL = "getPool";
  const marketFactoryData = getMarketFactoryData(factoryAddress);
  if (!marketFactoryData) return [];

  const marketFactoryContract = getMarketFactoryContract(provider, marketFactoryData, account);
  const marketFactoryAddress = marketFactoryContract.address;
  const marketFactoryAbi = extractABI(marketFactoryContract);
  const ammFactoryContract = getAmmFactoryContract(provider, ammFactory, account);
  const ammFactoryAddress = ammFactoryContract.address;
  const ammFactoryAbi = extractABI(ammFactoryContract);

  const contractMarketsCall: ContractCallContext[] = indexes.reduce(
    (p, index) => [
      ...p,
      {
        reference: `${marketFactoryAddress}-${index}`,
        contractAddress: marketFactoryAddress,
        abi: marketFactoryAbi,
        calls: [
          {
            reference: `${marketFactoryAddress}-${index}`,
            methodName: GET_MARKETS,
            methodParameters: [index],
            context: {
              index,
              marketFactoryAddress,
            },
          },
        ],
      },
      {
        reference: `${marketFactoryAddress}-${index}-details`,
        contractAddress: marketFactoryAddress,
        abi: marketFactoryAbi,
        calls: [
          {
            reference: `${marketFactoryAddress}-${index}`,
            methodName: GET_MARKET_DETAILS,
            methodParameters: [index],
            context: {
              index,
              marketFactoryAddress,
            },
          },
        ],
      },
      {
        reference: `${ammFactoryAddress}-${index}-pools`,
        contractAddress: ammFactoryAddress,
        abi: ammFactoryAbi,
        calls: [
          {
            reference: `${ammFactoryAddress}-${index}-pools`,
            methodName: GET_POOL,
            methodParameters: [marketFactoryAddress, index],
            context: {
              index,
              marketFactoryAddress,
            },
          },
        ],
      },
    ],
    []
  );

  let markets = [];
  const details = {};
  let exchanges = {};
  const cash = Object.values(cashes).find((c) => c.name === USDC); // todo: only supporting USDC currently, will change to multi collateral with new contract changes
  const marketsResult: ContractCallResults = await chunkedMulticall(provider, contractMarketsCall);

  for (let i = 0; i < Object.keys(marketsResult.results).length; i++) {
    const key = Object.keys(marketsResult.results)[i];
    const data = marketsResult.results[key].callsReturnContext[0].returnValues[0];
    const context = marketsResult.results[key].originalContractCallContext.calls[0].context;
    const method = String(marketsResult.results[key].originalContractCallContext.calls[0].methodName);
    const marketId = `${context.marketFactoryAddress.toLowerCase()}-${context.index}`;

    if (method === GET_MARKET_DETAILS) {
      details[marketId] = data;
    } else if (method === GET_POOL) {
      const id = data === NULL_ADDRESS ? null : data;
      exchanges[marketId] = {
        marketId,
        id,
        marketFactoryAddress,
        turboId: context.index,
        feeDecimal: "0",
        feeRaw: "0",
        feeInPercent: "0",
        transactions: [], // to be filled in the future
        trades: {}, // to be filled in the future
        cash,
        ammFactoryAddress,
      };
    } else {
      const market = decodeMarket(data, marketFactoryType);
      market.marketId = marketId;
      market.marketFactoryAddress = marketFactoryAddress;
      market.turboId = context.index;
      if (market) markets.push(market);
    }
  }

  const marketInfos = {};
  if (markets.length > 0) {
    markets.forEach((m) => {
      const marketDetails = details[m.marketId];
      marketInfos[m.marketId] = {
        ...deriveMarketInfo(m, marketDetails, marketFactoryType),
        version: marketFactoryData.version,
      };
    });
  }

  const newBlocknumber = marketsResult.blocknumber;

  if (Object.keys(exchanges).length > 0) {
    exchanges = await retrieveExchangeInfos(
      exchanges,
      marketInfos,
      marketFactoryAddress,
      ammFactoryContract,
      provider,
      account,
      marketFactoryData
    );
  }

  return { marketInfos, exchanges, blocknumber: newBlocknumber ? newBlocknumber : blocknumber };
};

export const fillGraphMarketsData = async (
  graphMarkets: { [type: string]: MarketInfos[] },
  cashes: Cashes,
  provider: Web3Provider,
  account: string,
  blocknumber: number,
  ignoreList: { [factory: string]: number[] },
  loadtype: string = MARKET_LOAD_TYPE.SIMPLIFIED,
  dmarkets: MarketInfos = {},
  damm: AmmExchanges = {}
): Promise<{ markets: MarketInfos; ammExchanges: AmmExchanges; blocknumber: number; factoryAddress: string }> => {
  let marketInfos = dmarkets;
  let exchanges = damm;
  let newBlocknumber = blocknumber;
  for (let i = 0; i < Object.keys(GRAPH_MARKETS).length; i++) {
    const key = Object.keys(GRAPH_MARKETS)[i];
    const gMarkets = graphMarkets?.[key];

    if (key === MARKET_FACTORY_TYPES.MMALINK) {
      console.log("fetching mma");
      fetchContractData("0x39Fb172fCBFBf8E594cA15a31B3bBd88E50C9B68", provider, account);
    }
    if (gMarkets?.length > 0) {
      const { markets: filledMarkets, blocknumber: updatedBlocknumber } = await fillMarketsData(
        gMarkets,
        cashes,
        provider,
        account,
        GRAPH_MARKETS[key],
        ignoreList,
        newBlocknumber
      );
      marketInfos = { ...marketInfos, ...filledMarkets };
      newBlocknumber = updatedBlocknumber ? updatedBlocknumber : blocknumber;
    }
  }
  if (Object.keys(ignoreList).length === 0) {
    marketInfos = setIgnoreRemoveMarketList(marketInfos, ignoreList, loadtype);
  }

  exchanges = Object.values(marketInfos).reduce((p, m) => ({ ...p, [m.marketId]: m.amm }), {});
  return { markets: marketInfos, ammExchanges: exchanges, blocknumber: newBlocknumber };
};

const getPoolAddresses = async (
  marketInfos: MarketInfo[],
  provider: Web3Provider,
  cash: Cash
): Promise<{ exchanges: AmmExchanges; blocknumber: number }> => {
  const exchanges = {};
  for (let i = 0; i < marketInfos.length; i++) {
    const { marketFactoryAddress, turboId, marketId } = marketInfos[i];
    const marketFactoryData = getMarketFactoryData(marketFactoryAddress);
    const ammFactoryContract = AMMFactory__factory.connect(marketFactoryData.ammFactory, provider);
    const poolAddress = await ammFactoryContract
      .getPool(marketFactoryAddress, turboId)
      .catch((e) => console.log("error fetching pool address"));
    exchanges[marketId] = {
      marketId,
      id: poolAddress === NULL_ADDRESS ? null : poolAddress,
      marketFactoryAddress,
      turboId,
      feeDecimal: "0",
      feeRaw: "0",
      feeInPercent: "0",
      transactions: [], // to be filled in the future
      trades: {}, // to be filled in the future
      cash,
      ammFactoryAddress: marketFactoryData.ammFactory,
    };
  }
  const blocknumber = await provider.getBlockNumber();
  return { exchanges, blocknumber };
};

const getPoolAddressesMulticall = async (
  marketInfos: MarketInfo[],
  provider: Web3Provider,
  cash: Cash,
  account: string
): Promise<{ exchanges: AmmExchanges; blocknumber: number }> => {
  const exchanges = [];
  const contractMarketsCall = marketInfos.reduce((p, { marketId, marketFactoryAddress, turboId }) => {
    const marketFactoryData = getMarketFactoryData(marketFactoryAddress);
    if (!marketFactoryData) return p;
    const POOLS = "getPool";
    const ammFactoryContract = getAmmFactoryContract(provider, marketFactoryData.ammFactory, account);
    const ammFactoryAddress = ammFactoryContract.address;
    const ammFactoryAbi = extractABI(ammFactoryContract);
    return [
      ...p,
      {
        reference: `${ammFactoryAddress}-${turboId}-pools`,
        contractAddress: ammFactoryAddress,
        abi: ammFactoryAbi,
        calls: [
          {
            reference: `${ammFactoryAddress}-${turboId}-pools`,
            methodName: POOLS,
            methodParameters: [marketFactoryAddress, turboId],
            context: {
              turboId,
              marketFactoryAddress,
              ammFactoryAddress,
              marketId,
            },
          },
        ],
      },
    ];
  }, []);

  const marketsResult: ContractCallResults = await chunkedMulticall(provider, contractMarketsCall);
  for (let i = 0; i < Object.keys(marketsResult.results).length; i++) {
    const key = Object.keys(marketsResult.results)[i];
    const data = marketsResult.results[key].callsReturnContext[0].returnValues[0];
    const context = marketsResult.results[key].originalContractCallContext.calls[0].context;
    const { marketFactoryAddress, turboId, marketId, ammFactoryAddress } = context;
    exchanges[marketId] = {
      marketId,
      id: data === NULL_ADDRESS ? null : data,
      marketFactoryAddress,
      turboId,
      feeDecimal: "0",
      feeRaw: "0",
      feeInPercent: "0",
      transactions: [], // to be filled in the future
      trades: {}, // to be filled in the future
      cash,
      ammFactoryAddress,
    };
  }
  return { exchanges, blocknumber: marketsResult.blocknumber };
};

const fillMarketsData = async (
  markets: MarketInfo[],
  cashes: Cashes,
  provider: Web3Provider,
  account: string,
  marketFactoryType: string,
  ignoreList: { [factory: string]: number[] },
  blocknumber
): Promise<{ markets: MarketInfos; ammExchanges: AmmExchanges; blocknumber: number }> => {
  if (!markets || markets?.length === 0) return { markets: {}, ammExchanges: {}, blocknumber };
  const marketFactories = Array.from(new Set(Object.values(markets).map((m) => m.marketFactoryAddress)));
  const filteredMarkets = markets.filter(
    (m) => !(ignoreList[m.marketFactoryAddress.toUpperCase()] || []).includes(m.turboId)
  );
  const cash = Object.values(cashes).find((c) => c.name === USDC); // todo: only supporting USDC currently, will change to multi collateral with new contract changes
  let exchanges = {};
  let newBlocknumber = blocknumber;
  try {
    const popExchanges = await getPoolAddressesMulticall(filteredMarkets, provider, cash, account);
    exchanges = popExchanges.exchanges;
    newBlocknumber = popExchanges.blocknumber ?? newBlocknumber;
  } catch (e) {
    console.log("multicall failover", e);
    const popExchanges = await getPoolAddresses(filteredMarkets, provider, cash);
    exchanges = popExchanges.exchanges;
    newBlocknumber = popExchanges.blocknumber ?? newBlocknumber;
  }

  let marketInfos: MarketInfos = {};
  if (filteredMarkets.length > 0) {
    filteredMarkets.forEach((m) => {
      const marketFactoryData = getMarketFactoryData(m.marketFactoryAddress);
      if (marketFactoryData) {
        const market = {
          ...m,
          ...decodeMarket(m, marketFactoryType),
          version: marketFactoryData.version,
        };
        marketInfos[m.marketId] = deriveMarketInfo(market, market, marketFactoryType);
      }
    });
  }

  if (Object.keys(exchanges).length > 0) {
    const fetchExchanges: AmmExchanges[] = await Promise.all(
      marketFactories.map((marketFactoryAddress) => {
        const marketFactoryData = getMarketFactoryData(marketFactoryAddress);
        if (marketFactoryData) {
          const ammFactoryContract = getAmmFactoryContract(provider, marketFactoryData.ammFactory, account);
          const factoryExchanges = Object.values(exchanges)
            .filter((e) => e.marketFactoryAddress === marketFactoryAddress)
            .reduce((p, e) => ({ ...p, [e.marketId]: e }), {});
          const factoryMarkets = Object.values(marketInfos)
            .filter((e) => e.marketFactoryAddress === marketFactoryAddress)
            .reduce((p, e) => ({ ...p, [e.marketId]: e }), {});
          return retrieveExchangeInfos(
            factoryExchanges,
            factoryMarkets,
            marketFactoryAddress,
            ammFactoryContract,
            provider,
            account,
            marketFactoryData
          );
        }
      })
    );
    exchanges = fetchExchanges.reduce((p, exs) => ({ ...p, ...exs }), {});
  }

  return { markets: marketInfos, ammExchanges: exchanges, blocknumber: newBlocknumber };
};

const exchangesHaveLiquidity = async (exchanges: AmmExchanges, provider: Web3Provider): AmmExchanges => {
  const ex = Object.values(exchanges).filter((k) => k.id);
  for (let i = 0; i < ex.length; i++) {
    const exchange = ex[i];
    const bpool = BPool__factory.connect(exchange.id, provider);
    const totalSupply = await bpool.totalSupply();
    exchange.totalSupply = totalSupply ? totalSupply : "0";
    exchange.hasLiquidity = exchange.totalSupply !== "0";
  }
  return exchanges;
};

const exchangesHaveLiquidityMulticall = async (exchanges: AmmExchanges, provider: Web3Provider): AmmExchanges[] => {
  const TOTAL_SUPPLY = "totalSupply";
  const ex = Object.values(exchanges).filter((k) => k.id);
  const contractMarketsCall: ContractCallContext[] = ex.map((e) => ({
    reference: `${e.id}-total-supply`,
    contractAddress: e.id,
    abi: BPoolABI,
    calls: [
      {
        reference: `${e.id}-total-supply`,
        methodName: TOTAL_SUPPLY,
        methodParameters: [],
        context: {
          marketId: e.marketId,
        },
      },
    ],
  }));
  const balances = {};
  const marketsResult: ContractCallResults = await chunkedMulticall(provider, contractMarketsCall);

  for (let i = 0; i < Object.keys(marketsResult.results).length; i++) {
    const key = Object.keys(marketsResult.results)[i];
    const data = marketsResult.results[key].callsReturnContext[0].returnValues[0];
    const method = String(marketsResult.results[key].originalContractCallContext.calls[0].methodName);
    const context = marketsResult.results[key].originalContractCallContext.calls[0].context;
    const marketId = context.marketId;

    if (method === TOTAL_SUPPLY) {
      balances[marketId] = data;
    }
  }

  Object.keys(exchanges).forEach((marketId) => {
    const exchange = exchanges[marketId];
    exchange.totalSupply = balances[marketId] ? String(balances[marketId]) : "0";
    exchange.hasLiquidity = exchange.totalSupply !== "0";
  });

  return exchanges;
};

const retrieveExchangeInfos = async (
  exchangesInfo: AmmExchanges,
  marketInfos: MarketInfos,
  marketFactoryAddress: string,
  ammFactory: AMMFactory,
  provider: Web3Provider,
  account: string,
  marketFactoryData: MarketFactory
): Market[] => {
  let exchanges = {};
  try {
    exchanges = await exchangesHaveLiquidityMulticall(exchangesInfo, provider);
  } catch (e) {
    console.log("total supply multicall failover");
    exchanges = await exchangesHaveLiquidity(exchangesInfo, provider);
  }

  const GET_RATIOS = "tokenRatios";
  const GET_BALANCES = "getPoolBalances";
  const GET_FEE = "getSwapFee";
  const GET_SHARE_FACTOR = "shareFactor";
  const GET_POOL_WEIGHTS = "getPoolWeights";
  const ammFactoryAddress = ammFactory.address;
  const ammFactoryAbi = extractABI(ammFactory);
  const existingIndexes = Object.keys(exchanges)
    .filter((k) => exchanges[k].id && exchanges[k]?.totalSupply !== "0")
    .map((k) => exchanges[k].turboId);
  if (!marketFactoryData) return [];

  const marketFactoryContract = getMarketFactoryContract(provider, marketFactoryData, account);
  const marketFactoryAbi = extractABI(marketFactoryContract);
  const contractPricesCall: ContractCallContext[] = existingIndexes.reduce(
    (p, index) => [
      ...p,
      {
        reference: `${ammFactoryAddress}-${index}-ratios`,
        contractAddress: ammFactoryAddress,
        abi: ammFactoryAbi,
        calls: [
          {
            reference: `${ammFactoryAddress}-${index}-ratios`,
            methodName: GET_RATIOS,
            methodParameters: [marketFactoryAddress, index],
            context: {
              index,
              marketFactoryAddress,
            },
          },
        ],
      },
    ],
    []
  );
  const indexes = Object.keys(exchanges)
    .filter((k) => exchanges[k].id)
    .map((k) => exchanges[k].turboId);
  const contractMarketsCall: ContractCallContext[] = indexes.reduce(
    (p, index) => [
      ...p,
      {
        reference: `${ammFactoryAddress}-${index}-balances`,
        contractAddress: ammFactoryAddress,
        abi: ammFactoryAbi,
        calls: [
          {
            reference: `${ammFactoryAddress}-${index}-balances`,
            methodName: GET_BALANCES,
            methodParameters: [marketFactoryAddress, index],
            context: {
              index,
              marketFactoryAddress,
            },
          },
        ],
      },
      {
        reference: `${ammFactoryAddress}-${index}-fee`,
        contractAddress: ammFactoryAddress,
        abi: ammFactoryAbi,
        calls: [
          {
            reference: `${ammFactoryAddress}-${index}-fee`,
            methodName: GET_FEE,
            methodParameters: [marketFactoryAddress, index],
            context: {
              index,
              marketFactoryAddress,
            },
          },
        ],
      },
      {
        reference: `${ammFactoryAddress}-${index}-weights`,
        contractAddress: ammFactoryAddress,
        abi: ammFactoryAbi,
        calls: [
          {
            reference: `${ammFactoryAddress}-${index}-weights`,
            methodName: GET_POOL_WEIGHTS,
            methodParameters: [marketFactoryAddress, index],
            context: {
              index,
              marketFactoryAddress,
            },
          },
        ],
      },
    ],
    []
  );
  // need to get share factor per market factory
  const shareFactorCalls: ContractCallContext[] = [
    {
      reference: `${marketFactoryAddress}-factor`,
      contractAddress: marketFactoryAddress,
      abi: marketFactoryAbi,
      calls: [
        {
          reference: `${marketFactoryAddress}-factor`,
          methodName: GET_SHARE_FACTOR,
          methodParameters: [],
          context: {
            index: 0,
            marketFactoryAddress,
          },
        },
      ],
    },
  ];

  const ratios = {};
  const balances = {};
  const fees = {};
  const shareFactors = {};
  const poolWeights = {};
  const marketsResult: ContractCallResults = await chunkedMulticall(provider, [
    ...contractMarketsCall,
    ...shareFactorCalls,
    ...contractPricesCall,
  ]);
  for (let i = 0; i < Object.keys(marketsResult.results).length; i++) {
    const key = Object.keys(marketsResult.results)[i];
    const data = marketsResult.results[key].callsReturnContext[0].returnValues[0];
    const context = marketsResult.results[key].originalContractCallContext.calls[0].context;
    const method = String(marketsResult.results[key].originalContractCallContext.calls[0].methodName);
    const marketId = `${context.marketFactoryAddress.toLowerCase()}-${context.index}`;

    if (method === GET_RATIOS) {
      ratios[marketId] = data;
    } else if (method === GET_SHARE_FACTOR) {
      shareFactors[context.marketFactoryAddress] = data;
    } else if (method === GET_POOL_WEIGHTS) {
      poolWeights[marketId] = data;
    } else if (method === GET_BALANCES) {
      balances[marketId] = data;
    } else if (method === GET_FEE) {
      fees[marketId] = data;
    }
  }

  Object.keys(exchanges).forEach((marketId) => {
    const exchange = exchanges[marketId];
    const market = marketInfos[marketId];
    const outcomePrices = calculatePrices(market, ratios[marketId], poolWeights[marketId]);
    const fee = new BN(String(fees[marketId] || DEFAULT_AMM_FEE_RAW)).toFixed();
    const balancesRaw = balances[marketId] || [];
    const weights = poolWeights[marketId];
    if (!market) {
      console.log(
        "exchange id",
        exchange.id,
        "exchange marketId",
        exchange.marketId,
        "marketId",
        marketId,
        market,
        exchange,
        marketInfos
      );
      console.log(new Set(Object.values(marketInfos).map((m) => m.marketFactoryAddress)));
    }
    exchange.ammOutcomes = market.outcomes.map((o, i) => ({
      price: exchange.id ? String(outcomePrices[i]) : "",
      ratioRaw: exchange.id ? getArrayValue(ratios[marketId], i) : "",
      ratio: exchange.id ? toDisplayRatio(getArrayValue(ratios[marketId], i)) : "",
      balanceRaw: exchange.id ? getArrayValue(balances[marketId], i) : "",
      balance: exchange.id ? String(sharesOnChainToDisplay(getArrayValue(balances[marketId], i))) : "",
      ...o,
    }));
    // create cross reference
    exchange.market = market;
    const feeDecimal = fee ? new BN(String(fee)).div(new BN(10).pow(18)) : "0";
    exchange.feeDecimal = fee ? feeDecimal.toFixed() : "0";
    exchange.feeInPercent = fee ? feeDecimal.times(100).toFixed() : "0";
    exchange.feeRaw = fee;
    exchange.balancesRaw = balancesRaw ? balancesRaw.map((b) => String(b)) : [];
    exchange.shareFactor = new BN(String(shareFactors[market.marketFactoryAddress])).toFixed();
    exchange.weights = weights ? weights.map((w) => String(w)) : [];
    exchange.liquidityUSD = getTotalLiquidity(outcomePrices, balancesRaw);
    market.amm = exchange;
  });

  return exchanges;
};

const getTotalLiquidity = (prices: string[], balances: string[]) => {
  if (prices.length === 0) return "0";
  const outcomeLiquidity = prices.map((p, i) =>
    new BN(p).times(new BN(toDisplayLiquidity(String(balances ? balances[i] : "0")))).toFixed()
  );
  return outcomeLiquidity.reduce((p, r) => p.plus(new BN(r)), ZERO).toFixed(4);
};

const getArrayValue = (ratios: string[] = [], outcomeId: number) => {
  if (ratios.length === 0) return "0";
  if (!ratios[outcomeId]) return "0";
  return String(ratios[outcomeId]);
};

const calculatePrices = (market: MarketInfo, ratios: string[] = [], weights: string[] = []): string[] => {
  let outcomePrices = [];
  if (!market) {
    console.error("market object undefined");
    return [];
  }
  const { outcomes, hasWinner } = market;
  if (hasWinner) {
    return outcomes.map((outcome) => (outcome.isWinner ? "1" : "0"));
  }
  //price[0] = ratio[0] / sum(ratio)
  const base = ratios.length > 0 ? ratios : weights;
  if (base.length > 0) {
    const sum = base.reduce((p, r) => p.plus(new BN(String(r))), ZERO);
    outcomePrices = base.map((r) => new BN(String(r)).div(sum).toFixed());
  }
  return outcomePrices;
};

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
  const winningOutcomeId: string = shareTokens.indexOf(winner);
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

const toDisplayRatio = (onChainRatio: string = "0"): string => {
  // todo: need to use cash to get decimals
  return convertOnChainCashAmountToDisplayCashAmount(onChainRatio, 18).toFixed();
};

const toDisplayLiquidity = (onChainBalance: string = "0"): string => {
  return convertOnChainCashAmountToDisplayCashAmount(onChainBalance).toFixed();
};

let ABIs = {};
export function extractABI(contract: ethers.Contract): any[] {
  if (!contract) {
    console.error("contract is null");
    return null;
  }
  const { address } = contract;
  const abi = ABIs[address];
  if (abi) return abi;

  // Interface.format returns a JSON-encoded string of the ABI when using FormatTypes.json.
  const contractAbi = JSON.parse(contract.interface.format(ethers.utils.FormatTypes.json) as string);
  ABIs[address] = contractAbi;
  return contractAbi;
}
