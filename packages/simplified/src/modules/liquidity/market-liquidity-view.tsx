import React, { useState, useEffect, useMemo } from "react";
import classNames from "classnames";
import Styles from "./market-liquidity-view.styles.less";
import ButtonStyles from "../common/buttons.styles.less";
import { useHistory, useLocation } from "react-router";
import { InfoNumbers, ApprovalButton } from "../market/trading-form";
import { BigNumber as BN } from "bignumber.js";
import {
  ContractCalls,
  useDataStore,
  useUserStore,
  Components,
  Utils,
  Constants,
  useApprovalStatus,
  createBigNumber,
} from "@augurproject/comps";
import { AmmOutcome, MarketInfo, Cash, LiquidityBreakdown, DataState } from "@augurproject/comps/build/types";
import { useSimplifiedStore } from "modules/stores/simplified";
import { LIQUIDITY, MARKET_LIQUIDITY, CREATE, ADD, REMOVE, SHARES, USDC } from "../constants";
const {
  ButtonComps: { SecondaryThemeButton },
  LabelComps: { CategoryIcon },
  MarketCardComps: { MarketTitleArea, orderOutcomesForDisplay, unOrderOutcomesForDisplay },
  InputComps: { AmountInput, isInvalidNumber, OutcomesGrid },
  Links: { MarketLink },
  Icons: { WarningIcon, BackIcon, MaticIcon },
} = Components;
const {
  checkConvertLiquidityProperties,
  // doRemoveLiquidity,
  // addLiquidityPool,
  estimateAddLiquidityPool,
  getRemoveLiquidity,
} = ContractCalls;
const {
  PathUtils: { makePath, parseQuery },
  Formatter: { formatSimpleShares, formatEther },
  Calculations: { calcPricesFromOdds },
} = Utils;
const {
  MARKET_ID_PARAM_NAME,
  ApprovalAction,
  ApprovalState,
  ERROR_AMOUNT,
  CONNECT_ACCOUNT,
  ENTER_AMOUNT,
  INSUFFICIENT_BALANCE,
  ZERO,
  SET_PRICES,
  ONE,
  INVALID_PRICE,
  INVALID_PRICE_GREATER_THAN_SUBTEXT,
  INVALID_PRICE_ADD_UP_SUBTEXT,
} = Constants;

const defaultAddLiquidityBreakdown: LiquidityBreakdown = {
  lpTokens: "0",
  cashAmount: "0",
  minAmounts: [],
};
const MIN_PRICE = 0.02;

const TRADING_FEE_OPTIONS = [
  {
    id: 0,
    label: "0.0%",
    value: 0,
  },
  {
    id: 1,
    label: "0.5%",
    value: 0.5,
  },
  {
    id: 2,
    label: "1%",
    value: 1,
  },
  {
    id: 3,
    label: "2%",
    value: 2,
  },
];

export const MarketLiquidityView = () => {
  const {
    settings: { timeFormat },
  } = useSimplifiedStore();
  const location = useLocation();
  const { [MARKET_ID_PARAM_NAME]: marketId, [MARKET_LIQUIDITY]: actionType } = parseQuery(location.search);
  const { markets } = useDataStore();
  const market = markets?.[marketId];

  if (!market) {
    return <div className={classNames(Styles.MarketLiquidityView)}>Market Not Found.</div>;
  }
  const { categories } = market;
  return (
    <div className={classNames(Styles.MarketLiquidityView)}>
      <MarketLink id={marketId} dontGoToMarket={false}>
        <CategoryIcon {...{ categories }} />
        <MarketTitleArea {...{ ...market, timeFormat }} />
      </MarketLink>
      <LiquidityForm {...{ market, actionType }} />
      <LiquidityWarningFooter />
    </div>
  );
};

const LiquidityWarningFooter = () => (
  <article className={Styles.LiquidityWarningFooter}>
    <p>
      By adding liquidity you'll earn 1.50% of all trades on this market proportional to your share of the pool. Fees
      are added to the pool, accrue in real time and can be claimed by withdrawing your liquidity.
    </p>
    <span>{WarningIcon} Remove liquidity before the winning outcome is known to prevent any loss of funds</span>
  </article>
);

interface LiquidityFormProps {
  market: MarketInfo;
  actionType: string;
}

const orderMinAmountsForDisplay = (
  items: { amount: string; outcomeId: number; hide: boolean }[] = []
): { amount: string; outcomeId: number; hide: boolean }[] =>
  items.length > 0 && items[0].outcomeId === 0 ? items.slice(1).concat(items.slice(0, 1)) : items;

const getCreateBreakdown = (breakdown, market, balances, isRemove = false) => {
  const fullBreakdown = [
    ...orderMinAmountsForDisplay(breakdown.minAmounts)
      .filter((m) => !m.hide)
      .map((m) => ({
        label: `${market.outcomes[m.outcomeId]?.name} Shares`,
        value: `${formatSimpleShares(m.amount).formatted}`,
        svg: null,
      })),
    {
      label: isRemove ? "USDC" : "LP tokens",
      value: `${breakdown?.amount ? formatSimpleShares(breakdown.amount).formatted : "-"}`,
      svg: null,
    },
  ];
  const pendingRewards = balances?.pendingRewards?.[market.marketId]?.balance || "0";
  if (pendingRewards !== "0") {
    fullBreakdown.push({
      label: `LP Rewards`,
      value: `${formatEther(pendingRewards).formatted}`,
      svg: MaticIcon,
    });
  }
  return fullBreakdown;
};

const LiquidityForm = ({ market, actionType = ADD }: LiquidityFormProps) => {
  const history = useHistory();
  const {
    account,
    balances,
    loginAccount,
    // actions: { addTransaction },
  } = useUserStore();
  const { blocknumber, cashes }: DataState = useDataStore();
  const isRemove = actionType === REMOVE;
  const title = isRemove ? "Remove Liquidity" : "Add Liquidity";
  const { amm } = market;
  const mustSetPrices = Boolean(!amm?.id);
  const hasInitialOdds = market?.initialOdds && market?.initialOdds?.length && mustSetPrices;
  const initialOutcomes = hasInitialOdds
    ? calcPricesFromOdds(market?.initialOdds, amm?.ammOutcomes)
    : amm?.ammOutcomes || [];

  const [outcomes, setOutcomes] = useState<AmmOutcome[]>(orderOutcomesForDisplay(initialOutcomes));

  const [chosenCash, updateCash] = useState<string>(USDC);
  const [breakdown, setBreakdown] = useState(defaultAddLiquidityBreakdown);
  const [estimatedLpAmount, setEstimatedLpAmount] = useState<string>("0");
  const [tradingFeeSelection, setTradingFeeSelection] = useState<number>(TRADING_FEE_OPTIONS[2].id);
  const cash: Cash = cashes ? Object.values(cashes).find((c) => c.name === USDC) : Object.values(cashes)[0];
  const userTokenBalance = cash?.name ? balances[cash?.name]?.balance : "0";
  const shareBalance =
    balances && balances.lpTokens && balances.lpTokens[amm?.marketId] && balances.lpTokens[amm?.marketId].balance;
  const userMaxAmount = isRemove ? shareBalance : userTokenBalance;

  const [amount, updateAmount] = useState(isRemove ? userMaxAmount : "");

  const approvedToTransfer = ApprovalState.APPROVED;
  const isApprovedToTransfer = approvedToTransfer === ApprovalState.APPROVED;
  const approvalActionType = isRemove ? ApprovalAction.REMOVE_LIQUIDITY : ApprovalAction.ADD_LIQUIDITY;
  const approvedMain = useApprovalStatus({
    cash,
    amm,
    refresh: blocknumber,
    actionType: approvalActionType,
  });
  const isApprovedMain = approvedMain === ApprovalState.APPROVED;
  const isApproved = isRemove ? isApprovedMain && isApprovedToTransfer : isApprovedMain;
  const totalPrice = outcomes.reduce((p, outcome) => (outcome.price === "" ? parseFloat(outcome.price) + p : p), 0);

  const onChainFee = useMemo(() => {
    const feeOption = TRADING_FEE_OPTIONS.find((t) => t.id === tradingFeeSelection);
    const feePercent = actionType === CREATE ? feeOption.value : amm?.feeInPercent;

    return String(new BN(feePercent).times(new BN(10)));
  }, [tradingFeeSelection, amm?.feeRaw]);

  // ERROR SECTION
  let buttonError = "";
  let inputFormError = "";
  let lessThanMinPrice = false;
  const priceErrors = isRemove
    ? []
    : outcomes.filter((outcome) => {
        return parseFloat(outcome.price) >= 1 || isInvalidNumber(outcome.price);
      });
  const hasPriceErrors = priceErrors.length > 0;
  const hasAmountErrors = isInvalidNumber(amount);
  if (hasAmountErrors) {
    buttonError = ERROR_AMOUNT;
  } else if (hasPriceErrors) {
    buttonError = "Price is not valid";
  }
  if (!account) inputFormError = CONNECT_ACCOUNT;
  else if (!amount || amount === "0" || amount === "") inputFormError = ENTER_AMOUNT;
  else if (new BN(amount).gt(new BN(userMaxAmount))) inputFormError = INSUFFICIENT_BALANCE;
  else if (actionType === CREATE) {
    let totalPrice = ZERO;
    outcomes.forEach((outcome) => {
      const price = outcome.price;
      if (price === "0" || !price) {
        inputFormError = SET_PRICES;
      } else if (createBigNumber(price).lt(createBigNumber(MIN_PRICE))) {
        buttonError = INVALID_PRICE;
        lessThanMinPrice = true;
      } else {
        totalPrice = totalPrice.plus(createBigNumber(price));
      }
    });
    if (inputFormError === "" && !totalPrice.eq(ONE) && !market.isFuture) {
      buttonError = INVALID_PRICE;
    }
  }

  useEffect(() => {
    let isMounted = true;
    const priceErrorsWithEmptyString = isRemove
      ? []
      : outcomes.filter((outcome) => parseFloat(outcome.price) >= 1 || outcome.price === "");

    if (priceErrorsWithEmptyString.length > 0 || hasAmountErrors) {
      return isMounted && setBreakdown(defaultAddLiquidityBreakdown);
    }

    const valid = isRemove
      ? true
      : checkConvertLiquidityProperties(account, market.marketId, amount, onChainFee, outcomes, cash, amm);
    if (!valid) {
      return isMounted && setBreakdown(defaultAddLiquidityBreakdown);
    }
    async function getResults() {
      let results: LiquidityBreakdown;
      if (isRemove) {
        results = await getRemoveLiquidity(amm, loginAccount?.library, amount, account, cash, market?.hasWinner);
      } else {
        results = await estimateAddLiquidityPool(
          account,
          loginAccount?.library,
          amm,
          cash,
          amount,
          unOrderOutcomesForDisplay(outcomes)
        );
      }

      if (!results) {
        return isMounted && setBreakdown(defaultAddLiquidityBreakdown);
      }
      isMounted && setBreakdown(results);
      isMounted && setEstimatedLpAmount(results.lpTokens);
    }

    if (isApproved && !buttonError) getResults();

    return () => {
      isMounted = false;
    };
  }, [account, amount, tradingFeeSelection, cash, isApproved, buttonError, totalPrice, isRemove]);

  const actionButtonText = !amount ? "Enter Amount" : isRemove ? "Remove Liquidity" : "Add Liquidity";

  return (
    <section className={Styles.LiquidityForm}>
      <header>
        <button
          onClick={() =>
            history.push({
              pathname: makePath(LIQUIDITY),
            })
          }
        >
          {BackIcon}
        </button>
        {title}
      </header>
      <main>
        <AmountInput
          heading="Deposit Amount"
          ammCash={cash}
          updateInitialAmount={(amount) => updateAmount(amount)}
          initialAmount={amount}
          maxValue={userMaxAmount}
          chosenCash={isRemove ? SHARES : chosenCash}
          updateCash={updateCash}
          updateAmountError={() => null}
          error={hasAmountErrors}
        />
        <div className={Styles.Breakdown}>
          <span>You'll Receive</span>
          <InfoNumbers infoNumbers={getCreateBreakdown(breakdown, market, balances, isRemove)} />
        </div>
        <div className={Styles.PricesAndOutcomes}>
          <span className={Styles.PriceInstructions}>
            <span>{mustSetPrices ? "Set the Price" : "Current Prices"}</span>
            {mustSetPrices && <span>(between 0.02 - 0.1). Total price of all outcomes must add up to 1.</span>}
          </span>
        </div>

        <div className={Styles.ActionButtons}>
          {!isApproved && <ApprovalButton amm={amm} cash={cash} actionType={approvalActionType} />}
          <SecondaryThemeButton
            action={() => console.log("NYI")}
            disabled={!isApproved || inputFormError !== ""}
            error={buttonError}
            text={inputFormError === "" ? (buttonError ? buttonError : actionButtonText) : inputFormError}
            subText={
              buttonError === INVALID_PRICE
                ? lessThanMinPrice
                  ? INVALID_PRICE_GREATER_THAN_SUBTEXT
                  : INVALID_PRICE_ADD_UP_SUBTEXT
                : null
            }
            customClass={ButtonStyles.BuySellButton}
          />
        </div>
      </main>
    </section>
  );
};

export default MarketLiquidityView;
