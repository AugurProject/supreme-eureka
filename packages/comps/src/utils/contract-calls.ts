// @ts-nocheck
import BigNumber, { BigNumber as BN } from "bignumber.js";
import {
  AmmExchange,
  AmmExchanges,
  AmmMarketShares,
  Cashes,
  CurrencyBalance,
  PositionBalance,
  UserBalances,
  MarketInfos,
  LPTokens,
  EstimateTradeResult,
  Cash,
  AddLiquidityBreakdown,
  LiquidityBreakdown,
  AmmOutcome,
  AllMarketsTransactions,
  BuySellTransactions,
  MarketTransactions,
  AddRemoveLiquidity,
  ClaimWinningsTransactions,
  UserClaimTransactions,
} from "../types";
import { ethers } from "ethers";
import { Contract } from "@ethersproject/contracts";
import { Multicall, ContractCallResults, ContractCallContext } from "@augurproject/ethereum-multicall";
import { TransactionResponse, Web3Provider } from "@ethersproject/providers";
import {
  convertDisplayCashAmountToOnChainCashAmount,
  convertDisplayShareAmountToOnChainShareAmount,
  convertOnChainCashAmountToDisplayCashAmount,
  isSameAddress,
  lpTokensOnChainToDisplay,
  sharesOnChainToDisplay,
  sharesDisplayToOnChain,
  cashOnChainToDisplay,
} from "./format-number";
import {
  ETH,
  NULL_ADDRESS,
  USDC,
  NO_CONTEST_OUTCOME_ID,
  MARKET_STATUS,
  NUM_TICKS_STANDARD,
  DEFAULT_AMM_FEE_RAW,
  TradingDirection,
} from "./constants";
import { getProviderOrSigner } from "../components/ConnectAccount/utils";
import { createBigNumber } from "./create-big-number";
import { PARA_CONFIG } from "../stores/constants";
import ERC20ABI from "./ERC20ABI.json";
import BPoolABI from "./BPoolABI.json";
import ParaShareTokenABI from "./ParaShareTokenABI.json";
import {
  AMMFactory,
  AMMFactory__factory,
  BPool,
  BPool__factory,
  SportsLinkMarketFactory,
  SportsLinkMarketFactory__factory,
  calcSellCompleteSets,
  estimateBuy,
} from "@augurproject/smart";
import { getFullTeamName, getSportCategories, getSportId } from "./team-helpers";
import { getOutcomeName, getMarketTitle } from "./derived-market-data";

const trimDecimalValue = (value: string | BigNumber) => createBigNumber(value).toFixed(6);
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
): Promise<AddLiquidityBreakdown> {
  if (!provider) console.error("provider is null");
  const ammFactoryContract = getAmmFactoryContract(provider, account);
  const { weights, amount, marketFactoryAddress, turboId } = shapeAddLiquidityPool(amm, cash, cashAmount, outcomes);
  const ammAddress = amm?.id;

  let addLiquidityResults = null;

  if (!ammAddress) {
    console.log("est add init", marketFactoryAddress, turboId, amount, weights, account);
    addLiquidityResults = await ammFactoryContract.callStatic.createPool(
      marketFactoryAddress,
      turboId,
      amount,
      weights,
      account
    );
  } else {
    // todo: get what the min lp token out is
    console.log("est add additional", marketFactoryAddress, "marketId", turboId, "amount", amount, 0, account);

    addLiquidityResults = await ammFactoryContract.callStatic.addLiquidity(
      marketFactoryAddress,
      turboId,
      amount,
      0,
      account
    );
  }

  if (addLiquidityResults) {
    // lp tokens are 18 decimal
    const lpTokens = trimDecimalValue(sharesOnChainToDisplay(String(addLiquidityResults)));
    // const minAmounts = outcomes.map((o) => "0");

    return {
      lpTokens,
    };
  }

  return null;
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
  const ammFactoryContract = getAmmFactoryContract(provider, account);
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
    tx = ammFactoryContract.createPool(marketFactoryAddress, turboId, amount, weights, account, {
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

const calcWeights = (prices: string[]): string[] => {
  const totalWeight = new BN(50);
  const multiplier = new BN(10).pow(new BN(18));
  const results = prices.map((price) => new BN(price).times(totalWeight).times(multiplier).toFixed());
  return results;
};

export async function getRemoveLiquidity(
  amm: AmmExchange,
  provider: Web3Provider,
  lpTokenBalance: string,
  account: string,
  cash: Cash
): Promise<LiquidityBreakdown | null> {
  if (!provider) {
    console.error("getRemoveLiquidity: no provider");
    return null;
  }
  const { market } = amm;
  const ammFactory = getAmmFactoryContract(provider, account);

  // balancer lp tokens are 18 decimal places
  const lpBalance = convertDisplayCashAmountToOnChainCashAmount(lpTokenBalance, 18).toFixed();

  const results = await ammFactory.callStatic
    .removeLiquidity(market.marketFactoryAddress, market.turboId, lpBalance, "0", account) // uint256[] calldata minAmountsOut values be?
    .catch((e) => console.log(e));

  if (!results) return null;
  const { _balances, _collateralOut } = results;

  const minAmounts: string[] = _balances.map((v) => lpTokensOnChainToDisplay(String(v)).toFixed());
  const minAmountsRaw: string[] = _balances.map((v) => new BN(String(v)).toFixed());
  const cashAmount = cashOnChainToDisplay(String(_collateralOut), cash.decimals);

  return {
    minAmountsRaw,
    minAmounts,
    cashAmount,
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
  cash: Cash
): Promise<TransactionResponse | null> {
  if (!provider) {
    console.error("doRemoveLiquidity: no provider");
    return null;
  }
  const { market } = amm;
  const ammFactory = getAmmFactoryContract(provider, account);
  const lpBalance = convertDisplayCashAmountToOnChainCashAmount(lpTokenBalance, 18).toFixed();

  return ammFactory.removeLiquidity(market.marketFactoryAddress, market.turboId, lpBalance, "0", account);
}

export const estimateBuyTrade = async (
  amm: AmmExchange,
  provider: Web3Provider,
  inputDisplayAmount: string,
  selectedOutcomeId: number,
  cash: Cash
): Promise<EstimateTradeResult | null> => {
  if (!provider) {
    console.error("doRemoveLiquidity: no provider");
    return null;
  }
  const { marketFactoryAddress, turboId } = amm;

  const amount = convertDisplayCashAmountToOnChainCashAmount(inputDisplayAmount, cash.decimals).toFixed();
  console.log(
    "estimate buy",
    "address",
    marketFactoryAddress,
    "turboId",
    turboId,
    "outcome",
    selectedOutcomeId,
    "amount",
    amount,
    0
  );
  const result = await estimateBuy(
    amm.shareFactor,
    selectedOutcomeId,
    amount,
    amm.balancesRaw,
    amm.weights,
    amm.feeRaw
  );
  const estimatedShares = sharesOnChainToDisplay(String(result));

  const tradeFees = String(new BN(inputDisplayAmount).times(new BN(amm.feeDecimal)));

  const averagePrice = new BN(inputDisplayAmount).div(new BN(estimatedShares)).toFixed(4);
  const maxProfit = String(new BN(estimatedShares).minus(new BN(inputDisplayAmount)));
  const price = new BN(amm.ammOutcomes[selectedOutcomeId]?.price);
  const slippagePercent = new BN(averagePrice).minus(price).div(price).times(100).toFixed(4);
  const ratePerCash = new BN(estimatedShares).div(new BN(inputDisplayAmount)).toFixed(6);

  console.log("buy estimate", String(result), "slippagePercent", slippagePercent);
  return {
    outputValue: trimDecimalValue(estimatedShares),
    tradeFees,
    averagePrice,
    maxProfit,
    slippagePercent,
    ratePerCash,
  };
};

export const estimateSellTrade = async (
  amm: AmmExchange,
  provider: Web3Provider,
  inputDisplayAmount: string,
  selectedOutcomeId: number,
  userBalances: string[]
): Promise<EstimateTradeResult | null> => {
  if (!provider) {
    console.error("estimateSellTrade: no provider");
    return null;
  }
  const { marketFactoryAddress, turboId } = amm;
  const amount = sharesDisplayToOnChain(inputDisplayAmount).toFixed();
  console.log(
    "estimate sell",
    "factory",
    marketFactoryAddress,
    "turboId",
    turboId,
    "outcome id",
    selectedOutcomeId,
    "amount",
    amount,
    "inputDisplayAmount",
    inputDisplayAmount,
    "shareTokens",
    amm.ammOutcomes,
    "share factor",
    amm.shareFactor
  );

  const breakdownCompleteSets = await calcSellCompleteSets(
    amm.shareFactor,
    selectedOutcomeId,
    amount,
    amm.balancesRaw,
    amm.weights,
    amm.feeRaw
  );

  console.log("breakdownWithFeeRaw", String(breakdownCompleteSets));

  if (!breakdownCompleteSets) return null;

  const completeSets = sharesOnChainToDisplay(breakdownCompleteSets); // todo: debugging div 1000 need to fix
  const tradeFees = String(new BN(inputDisplayAmount).times(new BN(amm.feeDecimal)));

  const displayAmount = new BN(inputDisplayAmount);
  const averagePrice = new BN(completeSets).div(displayAmount);
  const price = new BN(String(amm.ammOutcomes[selectedOutcomeId].price));
  const userShares = new BN(userBalances[selectedOutcomeId] || "0");
  const slippagePercent = averagePrice.minus(price).div(price).times(100).abs().toFixed(2);
  const ratePerCash = new BN(completeSets).div(displayAmount).toFixed(6);
  const displayShares = sharesOnChainToDisplay(userShares);
  const remainingShares = new BN(displayShares || "0").minus(displayAmount).abs();

  return {
    outputValue: String(completeSets),
    tradeFees,
    averagePrice: averagePrice.toFixed(2),
    maxProfit: null,
    slippagePercent,
    ratePerCash,
    remainingShares: remainingShares.toFixed(6),
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
  cash: Cash
) {
  if (!provider) return console.error("doTrade: no provider");
  const ammFactoryContract = getAmmFactoryContract(provider, account);
  const { marketFactoryAddress, turboId } = amm;
  const amount = convertDisplayCashAmountToOnChainCashAmount(inputDisplayAmount, cash.decimals).toFixed();
  if (tradeDirection === TradingDirection.ENTRY) {
    const bareMinAmount = new BN(minAmount).lt(0) ? 0 : minAmount;
    const onChainMinShares = convertDisplayShareAmountToOnChainShareAmount(bareMinAmount, cash.decimals)
      .decimalPlaces(0)
      .toFixed();
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
      onChainMinShares
    );
    return ammFactoryContract.buy(marketFactoryAddress, turboId, selectedOutcomeId, amount, onChainMinShares);
  }

  if (tradeDirection === TradingDirection.EXIT) {
    const { marketFactoryAddress, turboId } = amm;
    const amount = sharesDisplayToOnChain(inputDisplayAmount).toFixed();
    let min = new BN(minAmount);
    if (min.lt(0)) {
      min = "0.01"; // set to 1 cent until estimate gets worked out.
    }
    let onChainMinAmount = sharesDisplayToOnChain(new BN(min)).decimalPlaces(0);
    if (onChainMinAmount.lt(0)) {
      onChainMinAmount = new BN(0);
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
      onChainMinAmount.toFixed()
    );

    return ammFactoryContract.sellForCollateral(
      marketFactoryAddress,
      turboId,
      selectedOutcomeId,
      amount,
      onChainMinAmount.toFixed()
      //,{ gasLimit: "800000", gasPrice: "10000000000"}
    );
  }

  return null;
}

export const claimWinnings = (
  account: string,
  provider: Web3Provider,
  marketIds: string[],
  factories: string[] // needed for multi market factory
): Promise<TransactionResponse | null> => {
  if (!provider) return console.error("claimWinnings: no provider");
  const marketFactoryContract = getMarketFactoryContract(provider, account);
  return marketFactoryContract.claimManyWinnings(marketIds, account);
};

export const claimFees = (
  account: string,
  provider: Web3Provider,
  factories: string[] // needed for multi market factory
): Promise<TransactionResponse | null> => {
  if (!provider) return console.error("claimFees: no provider");
  const marketFactoryContract = getMarketFactoryContract(provider, account);
  return marketFactoryContract.claimSettlementFees(account);
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
    claimableFees: "0",
  };

  if (!account || !provider) return userBalances;

  const userMarketTransactions = getUserTransactions(transactions, account);
  const userClaims = transactions as UserClaimTransactions;
  const BALANCE_OF = "balanceOf";
  const LP_TOKEN_COLLECTION = "lpTokens";
  const MARKET_SHARE_COLLECTION = "marketShares";
  // finalized markets
  const finalizedMarkets = Object.values(markets).filter((m) => m.reportingState === MARKET_STATUS.FINALIZED);
  const finalizedMarketIds = finalizedMarkets.map((f) => f.marketId);
  const finalizedAmmExchanges = Object.values(ammExchanges).filter((a) => finalizedMarketIds.includes(a.marketId));

  // balance of
  const exchanges = Object.values(ammExchanges).filter((e) => e.id && e.totalSupply !== "0");
  userBalances.ETH = await getEthBalance(provider, cashes, account);

  const multicall = new Multicall({ ethersProvider: provider });
  const contractLpBalanceCall: ContractCallContext[] = exchanges.map((exchange) => ({
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
          marketid: exchange.marketId,
        },
      },
    ],
  }));

  const contractMarketShareBalanceCall: ContractCallContext[] = exchanges.reduce((p, exchange) => {
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
  const usdc = Object.values(cashes).find((c) => c.name === USDC);

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
  const balanceCalls = [...basicBalanceCalls, ...contractMarketShareBalanceCall, ...contractLpBalanceCall];
  const balanceResult: ContractCallResults = await multicall.call(balanceCalls);

  for (let i = 0; i < Object.keys(balanceResult.results).length; i++) {
    const key = Object.keys(balanceResult.results)[i];
    const method = String(balanceResult.results[key].originalContractCallContext.calls[0].methodName);
    const balanceValue = balanceResult.results[key].callsReturnContext[0].returnValues[0] as ethers.utils.Result;
    const context = balanceResult.results[key].originalContractCallContext.calls[0].context;
    const rawBalance = new BN(balanceValue._hex).toFixed();
    const { dataKey, collection, decimals, marketId, outcomeId } = context;
    const balance = convertOnChainCashAmountToDisplayCashAmount(new BN(rawBalance), new BN(decimals));

    if (method === BALANCE_OF) {
      if (!collection) {
        userBalances[dataKey] = {
          balance: balance.toFixed(),
          rawBalance: rawBalance,
          usdValue: balance.toFixed(),
        };
      } else if (collection === LP_TOKEN_COLLECTION) {
        if (rawBalance !== "0") {
          userBalances[collection][dataKey] = {
            balance: lpTokensOnChainToDisplay(rawBalance).toFixed(),
            rawBalance,
            marketId,
          };
        } else {
          delete userBalances[collection][dataKey];
        }
      } else if (collection === MARKET_SHARE_COLLECTION) {
        const fixedShareBalance = sharesOnChainToDisplay(new BN(rawBalance)).toFixed();
        // todo: re organize balances to be really simple (future)
        // can index using dataKey (shareToken)
        //userBalances[collection][dataKey] = { balance: fixedBalance, rawBalance, marketId };

        // shape AmmMarketShares
        const existingMarketShares = userBalances.marketShares[marketId];
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
          if (position) userBalances.marketShares[marketId].positions.push(position);
          userBalances.marketShares[marketId].outcomeSharesRaw[outcomeId] = rawBalance;
          userBalances.marketShares[marketId].outcomeShares[outcomeId] = fixedShareBalance;
        } else if (fixedShareBalance !== "0") {
          userBalances.marketShares[marketId] = {
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
          if (position) userBalances.marketShares[marketId].positions.push(position);
          userBalances.marketShares[marketId].outcomeSharesRaw[outcomeId] = rawBalance;
          userBalances.marketShares[marketId].outcomeShares[outcomeId] = fixedShareBalance;
        }
      }
    }
  }

  if (finalizedMarkets.length > 0) {
    const keyedFinalizedMarkets = finalizedMarkets.reduce((p, f) => ({ ...p, [f.marketId]: f }), {});
    populateClaimableWinnings(keyedFinalizedMarkets, finalizedAmmExchanges, userBalances.marketShares);
  }

  const userPositions = getTotalPositions(userBalances.marketShares);
  const availableFundsUsd = String(new BN(userBalances.ETH.usdValue).plus(new BN(userBalances.USDC.usdValue)));
  const totalAccountValue = String(new BN(availableFundsUsd).plus(new BN(userPositions.totalPositionUsd)));
  await populateInitLPValues(userBalances.lpTokens, provider, ammExchanges, account);

  return { ...userBalances, ...userPositions, totalAccountValue, availableFundsUsd };
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
        const claimableBalance = new BN(userShares.balance).minus(new BN(initValue)).abs().toFixed(4);
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
  let quantity = trimDecimalValue(balance);
  const outcomeId = Number(outcome);
  const price = amm.ammOutcomes[outcomeId].price;
  const outcomeName = amm.ammOutcomes[outcomeId].name;
  let visible = false;
  let positionFromLiquidity = false;
  let positionFromRemoveLiquidity = false;

  // need to get this from outcome
  const maxUsdValue = new BN(balance).times(new BN(amm.cash.usdPrice)).toFixed();

  let result = {
    avgPrice: "0",
    positionFromRemoveLiquidity: false,
    positionFromLiquidity: false,
  };

  const currUsdValue = new BN(balance).times(new BN(price)).times(new BN(amm.cash.usdPrice)).toFixed();
  const postitionResult = getInitPositionValues(marketTransactions, amm, outcome, account, userClaims);

  if (postitionResult) {
    avgPrice = trimDecimalValue(postitionResult.avgPrice);
    initCostUsd = new BN(postitionResult.avgPrice).times(new BN(quantity)).toFixed(4);
  }

  let usdChangedValue = new BN(currUsdValue).minus(new BN(initCostUsd));
  // ignore negative dust difference
  if (usdChangedValue.lt(new BN("0")) && usdChangedValue.gt(new BN("-0.001"))) {
    usdChangedValue = usdChangedValue.abs();
  }
  totalChangeUsd = trimDecimalValue(usdChangedValue);
  visible = true;
  positionFromLiquidity = !result.positionFromRemoveLiquidity && result.positionFromLiquidity;
  positionFromRemoveLiquidity = result.positionFromRemoveLiquidity;

  if (balance === "0") return null;

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
    positionFromLiquidity,
    positionFromRemoveLiquidity,
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
    const totalValueRaw = ammOutcomes.reduce(
      (p, v, i) => p.plus(new BN(estimate.minAmounts[i]).times(v.price)),
      new BN(0)
    );

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

const getInitPositionValues = (
  marketTransactions: MarketTransactions,
  amm: AmmExchange,
  outcome: string,
  account: string,
  userClaims: UserClaimTransactions
): { avgPrice: string; positionFromLiquidity: boolean; positionFromRemoveLiquidity: boolean } => {
  const outcomeId = String(new BN(outcome));
  // sum up trades shares
  const claimTimestamp = lastClaimTimestamp(userClaims?.claimedProceeds, outcomeId, account);
  const sharesEntered = accumSharesPrice(marketTransactions?.buys, outcomeId, account, claimTimestamp);
  const enterAvgPriceBN = sharesEntered.avgPrice;

  // get shares from LP activity
  const sharesAddLiquidity = accumLpSharesPrice(marketTransactions?.addLiquidity, outcomeId, account, claimTimestamp);
  const sharesRemoveLiquidity = accumLpSharesPrice(
    marketTransactions?.removeLiquidity,
    outcome,
    account,
    claimTimestamp
  );

  const positionFromLiquidity = sharesAddLiquidity.shares.gt(new BN(0));
  const positionFromRemoveLiquidity = sharesRemoveLiquidity.shares.gt(new BN(0));
  const totalLiquidityShares = sharesRemoveLiquidity.shares.plus(sharesAddLiquidity.shares);
  const allLiquidityCashAmounts = sharesRemoveLiquidity.cashAmount.plus(sharesAddLiquidity.cashAmount);

  const avgPriceLiquidity = totalLiquidityShares.gt(0) ? allLiquidityCashAmounts.div(totalLiquidityShares) : new BN(0);
  const totalShares = totalLiquidityShares.plus(sharesEntered.shares);
  const weightedAvgPrice = totalShares.gt(new BN(0))
    ? avgPriceLiquidity
        .times(totalLiquidityShares)
        .div(totalShares)
        .plus(enterAvgPriceBN.times(sharesEntered.shares).div(totalShares))
    : 0;

  return {
    avgPrice: String(weightedAvgPrice),
    positionFromLiquidity,
    positionFromRemoveLiquidity,
  };
};

const accumSharesPrice = (
  transactions: BuySellTransactions[],
  outcome: string,
  account: string,
  cutOffTimestamp: number
): { shares: BigNumber; cashAmount: BigNumber; avgPrice: BigNumber } => {
  if (!transactions || transactions.length === 0) return { shares: new BN(0), cashAmount: new BN(0) };
  const result = transactions
    .filter(
      (t) =>
        isSameAddress(t.user, account) && new BN(t.outcome).eq(new BN(outcome)) && Number(t.timestamp) > cutOffTimestamp
    )
    .reduce(
      (p, t) => ({
        shares: p.shares.plus(new BN(t.shares)),
        cashAmount: p.cashAmount.plus(new BN(t.collateral).abs()),
        avgPrice: p.cashAmount
          .times(p.avgPrice)
          .plus(new BN(t.collateral).times(new BN(t.price)))
          .div(p.cashAmount.plus(new BN(t.collateral))),
      }),
      { shares: new BN(0), cashAmount: new BN(0), avgPrice: new BN(0) }
    );

  return { shares: result.shares, cashAmount: result.cashAmount, avgPrice: result.avgPrice };
};

const accumLpSharesPrice = (
  transactions: AddRemoveLiquidity[],
  outcome: string,
  account: string,
  cutOffTimestamp: number
): { shares: BigNumber; cashAmount: BigNumber } => {
  if (!transactions || transactions.length === 0) return { shares: new BN(0), cashAmount: new BN(0) };

  const result = transactions
    .filter((t) => isSameAddress(t?.sender?.id, account) && Number(t.timestamp) > cutOffTimestamp)
    .reduce(
      (p, t) => {
        // todo: need to figure out price for removing liuidity, prob different than add liquidity
        const shares = t.outcomes && t.outcomes.length > 0 ? new BN(t.outcomes[Number(outcome)]) : new BN(0);
        const cashValue = new BN(t.collateral);
        return { shares: p.shares.plus(shares), cashAmount: p.cashAmount.plus(new BN(cashValue)) };
      },
      { shares: new BN(0), cashAmount: new BN(0) }
    );

  return { shares: result.shares, cashAmount: result.cashAmount };
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

const getAmmFactoryContract = (library: Web3Provider, account?: string): AMMFactory => {
  const { ammFactory } = PARA_CONFIG;
  return AMMFactory__factory.connect(ammFactory, getProviderOrSigner(library, account));
};

const getMarketFactoryContract = (library: Web3Provider, account?: string): SportsLinkMarketFactory => {
  const { marketFactories } = PARA_CONFIG;
  // need to support many markets and get collateral for each market
  const { address } = marketFactories.sportsball;
  return SportsLinkMarketFactory__factory.connect(address, getProviderOrSigner(library, account));
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

export const getMarketInfos = async (
  provider: Web3Provider,
  markets: MarketInfos,
  cashes: Cashes,
  account: string
): { markets: MarketInfos; ammExchanges: AmmExchanges; blocknumber: number; loading: boolean } => {
  const marketFactoryContract = getMarketFactoryContract(provider, account);
  const numMarkets = (await marketFactoryContract.marketCount()).toNumber();

  let indexes = [];
  for (let i = 0; i < numMarkets; i++) {
    indexes.push(i);
  }

  const { marketInfos, exchanges, blocknumber } = await retrieveMarkets(indexes, cashes, provider, account);
  return { markets: { ...markets, ...marketInfos }, ammExchanges: exchanges, blocknumber, loading: false };
};

const retrieveMarkets = async (
  indexes: number[],
  cashes: Cashes,
  provider: Web3Provider,
  account: string
): Market[] => {
  const GET_MARKETS = "getMarket";
  const GET_MARKET_DETAILS = "getMarketDetails";
  const POOLS = "pools";
  const marketFactoryContract = getMarketFactoryContract(provider, account);
  const marketFactoryAddress = marketFactoryContract.address;
  const marketFactoryAbi = extractABI(marketFactoryContract);
  const ammFactory = getAmmFactoryContract(provider, account);
  const ammFactoryAddress = ammFactory.address;
  const ammFactoryAbi = extractABI(ammFactory);
  const multicall = new Multicall({ ethersProvider: provider });
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
            methodName: POOLS,
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
  const marketsResult: ContractCallResults = await multicall.call(contractMarketsCall);
  for (let i = 0; i < Object.keys(marketsResult.results).length; i++) {
    const key = Object.keys(marketsResult.results)[i];
    const data = marketsResult.results[key].callsReturnContext[0].returnValues[0];
    const context = marketsResult.results[key].originalContractCallContext.calls[0].context;
    const method = String(marketsResult.results[key].originalContractCallContext.calls[0].methodName);
    const marketId = `${context.marketFactoryAddress.toLowerCase()}-${context.index}`;

    if (method === GET_MARKET_DETAILS) {
      details[marketId] = data;
    } else if (method === POOLS) {
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
      };
    } else {
      const market = decodeMarket(data);
      market.marketId = marketId;
      market.marketFactoryAddress = marketFactoryAddress;
      market.turboId = context.index;
      if (market) markets.push(market);
    }
  }

  const marketInfos = {};
  // populate outcomes share token addresses
  if (markets.length > 0) {
    markets.forEach((m) => {
      const marketDetails = details[m.marketId];
      marketInfos[m.marketId] = decodeMarketDetails(m, marketDetails);
    });
  }

  const blocknumber = marketsResult.blockNumber;

  if (Object.keys(exchanges).length > 0) {
    exchanges = await retrieveExchangeInfos(
      exchanges,
      marketInfos,
      marketFactoryAddress,
      ammFactory,
      provider,
      account
    );
  }

  return { marketInfos, exchanges, blocknumber };
};

const exchangesHaveLiquidity = async (exchanges: AmmExchanges, provider: Web3Provider): Market[] => {
  const TOTAL_SUPPLY = "totalSupply";
  const multicall = new Multicall({ ethersProvider: provider });
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
  const marketsResult: ContractCallResults = await multicall.call(contractMarketsCall);
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
  account: string
): Market[] => {
  const exchanges = await exchangesHaveLiquidity(exchangesInfo, provider);

  const GET_RATIOS = "tokenRatios";
  const GET_BALANCES = "getPoolBalances";
  const GET_FEE = "getSwapFee";
  const GET_SHARE_FACTOR = "shareFactor";
  const GET_POOL_WEIGHTS = "getPoolWeights";
  const ammFactoryAddress = ammFactory.address;
  const ammFactoryAbi = extractABI(ammFactory);
  const multicall = new Multicall({ ethersProvider: provider });
  const existingIndexes = Object.keys(exchanges)
    .filter((k) => exchanges[k].id && exchanges[k]?.totalSupply !== "0")
    .map((k) => exchanges[k].turboId);
  const marketFactoryContract = getMarketFactoryContract(provider, account);
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
  const marketsResult: ContractCallResults = await multicall.call([
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
    const outcomePrices = calculatePrices(ratios[marketId], poolWeights[marketId]);
    const market = marketInfos[marketId];
    const fee = new BN(String(fees[marketId] || DEFAULT_AMM_FEE_RAW)).toFixed();
    const balancesRaw = balances[marketId];
    const weights = poolWeights[marketId];
    const { numTicks } = market;
    exchange.ammOutcomes = market.outcomes.map((o, i) => ({
      price: exchange.id ? String(outcomePrices[i]) : "",
      ratioRaw: exchange.id ? getArrayValue(ratios[marketId], i) : "",
      ratio: exchange.id ? toDisplayRatio(getArrayValue(ratios[marketId], i)) : "",
      balanceRaw: exchange.id ? getArrayValue(balances[marketId], i) : "",
      balance: exchange.id ? toDisplayBalance(getArrayValue(balances[marketId], i), numTicks) : "",
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
    new BN(p).times(new BN(toDisplayLiquidity(String(balances[i])))).toFixed()
  );
  return outcomeLiquidity.reduce((p, r) => p.plus(new BN(r)), new BN(0)).toFixed(4);
};

const getArrayValue = (ratios: string[] = [], outcomeId: number) => {
  if (ratios.length === 0) return "0";
  if (!ratios[outcomeId]) return "0";
  return String(ratios[outcomeId]);
};
const calculatePrices = (ratios: string[] = [], weights: string[] = []): string[] => {
  let outcomePrices = [];
  //price[0] = ratio[0] / sum(ratio)
  const base = ratios.length > 0 ? ratios : weights;
  if (base.length > 0) {
    const sum = base.reduce((p, r) => p.plus(new BN(String(r))), new BN(0));
    outcomePrices = base.map((r) => new BN(String(r)).div(sum).toFixed());
  }
  return outcomePrices;
};

const decodeMarket = (marketData: any) => {
  const { shareTokens, endTime, winner, creator, creatorFee: onChainFee } = marketData;
  const winningOutcomeId: string = shareTokens.indexOf(winner);
  const hasWinner = winner !== NULL_ADDRESS;
  const reportingState = !hasWinner ? MARKET_STATUS.TRADING : MARKET_STATUS.FINALIZED;
  const creatorFee = new BN(String(onChainFee))
    .div(new BN(10).pow(new BN(18)))
    .times(100)
    .toFixed();

  return {
    endTimestamp: new BN(String(endTime)).toNumber(),
    marketType: "Categorical", // categorical markets
    numTicks: NUM_TICKS_STANDARD,
    totalStake: "0", //String(marketData["totalStake"]),
    winner: winningOutcomeId === -1 ? null : winningOutcomeId,
    hasWinner,
    reportingState,
    creatorFeeRaw: String(onChainFee),
    settlementFee: creatorFee,
    claimedProceeds: [],
    shareTokens,
    creator,
  };
};

const decodeMarketDetails = (market: MarketInfo, marketData: any) => {
  // todo: need to get market creation time
  const start = Math.floor(Date.now() / 1000);
  const {
    awayTeamId: coAwayTeamId,
    eventId: coEventId,
    homeTeamId: coHomeTeamId,
    estimatedStartTime,
    value0,
    marketType,
  } = marketData;
  // translate market data
  const eventId = String(coEventId); // could be used to group events
  const homeTeamId = String(coHomeTeamId); // home team identifier
  const awayTeamId = String(coAwayTeamId); // visiting team identifier
  const startTimestamp = new BN(String(estimatedStartTime)).toNumber(); // estiamted event start time
  const categories = getSportCategories(homeTeamId);
  const line = new BN(String(value0)).toNumber();
  const sportsMarketType = new BN(String(marketType)).toNumber(); // spread, todo: use constant when new sports market factory is ready.
  const homeTeam = getFullTeamName(homeTeamId);
  const awayTeam = getFullTeamName(awayTeamId);
  const sportId = getSportId(homeTeamId);

  const { shareTokens } = market;
  const outcomes = decodeOutcomes(shareTokens, sportId, homeTeam, awayTeam, sportsMarketType, line);
  const { title, description } = getMarketTitle(sportId, homeTeam, awayTeam, sportsMarketType, line, startTimestamp);

  return {
    ...market,
    creationTimestamp: String(start),
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
  };
};

const decodeOutcomes = (
  shareTokens: string[],
  sportId: string,
  homeTeam: string,
  awayTeam: string,
  sportsMarketType: number,
  line: string
) => {
  return shareTokens.map((shareToken, i) => {
    return {
      id: i,
      name: getOutcomeName(i, sportId, homeTeam, awayTeam, sportsMarketType, line), // todo: derive outcome name using market data
      symbol: shareToken,
      isInvalid: i === NO_CONTEST_OUTCOME_ID,
      isWinner: false, // need to get based on winning payout hash
      isFinalNumerator: false, // need to translate final numerator payout hash to outcome
      shareToken,
    };
  });
};

const toDisplayRatio = (onChainRatio: string = "0"): string => {
  // todo: need to use cash to get decimals
  return convertOnChainCashAmountToDisplayCashAmount(onChainRatio, 18).toFixed();
};

const toDisplayBalance = (onChainBalance: string = "0", numTick: string = "1000"): string => {
  // todo: need to use cash to get decimals
  const MULTIPLIER = new BN(10).pow(18);
  return new BN(onChainBalance).times(new BN(numTick)).div(MULTIPLIER).toFixed();
};

const toDisplayLiquidity = (onChainBalance: string = "0"): string => {
  return convertOnChainCashAmountToDisplayCashAmount(onChainBalance).toFixed();
};

let ABIs = {};
function extractABI(contract: ethers.Contract): any[] {
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
