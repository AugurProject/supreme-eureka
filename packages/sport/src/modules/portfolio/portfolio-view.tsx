import React, { useState } from "react";
import classNames from "classnames";
import Styles from "./portfolio-view.styles.less";
import Activity from "./activity";
import { Formatter, Constants, createBigNumber, Stores, SEO, Components } from "@augurproject/comps";
import { PORTFOLIO_HEAD_TAGS } from "../seo-config";
import { Cash } from "@augurproject/comps/build/types";
import { EventBetsSection } from "../common/tables";
import { DailyFutureSwitch } from "../categories/categories";
import { useSportsStore } from "../stores/sport";
import { useBetslipStore } from "../stores/betslip";
import { BetType } from "../stores/constants";
import BigNumber from "bignumber.js";
import { claimAll } from "modules/utils";

const { formatCash } = Formatter;
const { TX_STATUS, USDC, marketStatusItems, OPEN } = Constants;
const {
  Hooks: { useDataStore, useAppStatusStore, useScrollToTopOnMount, useUserStore },
  Utils: { keyedObjToArray },
} = Stores;
const {
  SelectionComps: { SquareDropdown },
  ButtonComps: { PrimaryThemeButton, SecondaryThemeButton },
  Icons: { WinnerMedal, SimpleChevron },
  InputComps: { SearchInput },
  LabelComps: { NetworkMismatchBanner },
} = Components;

const calculateTotalWinnings = (claimbleMarketsPerCash): { total: BigNumber; ids: string[]; address: string }[] => {
  const factories = claimbleMarketsPerCash.reduce(
    (p, { ammExchange: { turboId, marketFactoryAddress }, claimableWinnings: { claimableBalance } }) => {
      const factory = p[marketFactoryAddress] || { total: new BigNumber(0), ids: [] };
      factory.total = factory.total.plus(createBigNumber(claimableBalance));
      factory.ids.push(turboId);
      factory.address = marketFactoryAddress;
      return { ...p, [marketFactoryAddress]: factory };
    },
    {}
  );
  return Object.values(factories);
};

export const getClaimAllMessage = (cash: Cash): string => `Claim All ${cash?.name} Winnings`;

const handleClaimAll = async (loginAccount, ids, factoryAddress, addTransaction, setPendingClaim) => {
  const from = loginAccount?.account;
  if (from) {
    setPendingClaim(true);
    const txDetails = await claimAll(loginAccount, ids, factoryAddress).catch((e) => console.error(e));
    setPendingClaim(false);
    if (txDetails) addTransaction(txDetails);
  }
};

const ClaimableTicket = ({ amount, cash, USDCTotal }) => {
  const {
    loginAccount,
    transactions,
    actions: { addTransaction },
  } = useUserStore();
  const [pendingClaim, setPendingClaim] = useState(false);
  const disableClaimUSDCWins = Boolean(
    transactions.find((t) => t.message === getClaimAllMessage(cash) && t.status === TX_STATUS.PENDING)
  );

  return (
    <section className={Styles.ClaimableTicket}>
      {WinnerMedal}
      <p>
        You have <b>{amount}</b> in winnings to claim in markets
      </p>
      <PrimaryThemeButton
        text={!pendingClaim ? `Claim Winnings` : `Awaiting Signature`}
        disabled={pendingClaim || disableClaimUSDCWins}
        action={() => {
          handleClaimAll(loginAccount, USDCTotal.ids, USDCTotal.address, addTransaction, setPendingClaim);
        }}
      />
    </section>
  );
};

export const ClaimWinningsSection = () => {
  const { isLogged } = useAppStatusStore();
  const {
    balances: { marketShares },
  } = useUserStore();
  const { cashes } = useDataStore();
  const claimableMarkets = marketShares ? keyedObjToArray(marketShares).filter((m) => !!m?.claimableWinnings) : [];
  const keyedCash = keyedObjToArray(cashes);
  const usdcCash = keyedCash.find((c) => c?.name === USDC);
  const USDCTotals = calculateTotalWinnings(claimableMarkets);
  const hasWinnings = USDCTotals.length > 0;

  return (
    <div className={Styles.ClaimableWinningsSection}>
      {isLogged && !hasWinnings && <div>{WinnerMedal} Any winnings will show here</div>}
      {isLogged &&
        hasWinnings &&
        USDCTotals.map((USDCTotal) => (
          <ClaimableTicket
            amount={formatCash(USDCTotal.total, usdcCash?.name).full}
            cash={usdcCash}
            USDCTotal={USDCTotal}
          />
        ))}
    </div>
  );
};

const useEventPositionsData = (sortBy: string, search: string) => {
  const {
    markets,
    transactions: { positionBalance },
  } = useDataStore();
  const { marketEvents } = useSportsStore();
  const { active } = useBetslipStore();
  let marketIds = null;
  let events = null;
  let eventPositionsData = null;
  if (sortBy === OPEN) {
    marketIds = Array.from(
      new Set(
        Object.entries(active)
          .map(([txhash, bet]: [string, BetType]) => {
            return bet.betId.slice(0, bet.betId.lastIndexOf("-"));
          })
          .filter((i) => i)
      )
    );
    events = Array.from(new Set(marketIds.map((marketId) => markets?.[marketId]?.eventId)))
      .map((eventId) => marketEvents[eventId])
      .filter((v) => v);
    eventPositionsData = events.reduce((acc, event) => {
      const out = { ...acc };
      const bets = Object.entries(active).reduce((a, [txhash, bet]: [string, BetType]) => {
        let result = { ...a };
        const marketId = bet?.betId.slice(0, bet?.betId.lastIndexOf("-"));
        if (event?.marketIds?.includes(marketId)) {
          result[txhash] = bet;
        }
        return result;
      }, {});
      out[event?.eventId] = {
        eventId: event?.eventId,
        eventTitle: event?.description,
        eventStartTime: event?.startTimestamp,
        bets,
        marketIds: event?.marketIds,
      };
      return out;
    }, {});
  } else {
    marketIds = Array.from(new Set(positionBalance?.map((p) => p?.marketId))).filter((v) => v);
    events = Array.from(new Set(marketIds?.map((marketId: string) => markets?.[marketId]?.eventId)))
      .map((eventId) => marketEvents[eventId])
      .filter((v) => v);
    eventPositionsData = events.reduce((acc, event) => {
      const out = { ...acc };
      const bets = positionBalance.reduce((a, test) => {
        let result = { ...a };
        if (event?.marketIds?.includes(test?.marketId)) {
          const market = markets[test?.marketId];
          const betId = `${test.marketId}-${parseInt(test?.outcomeId)}`;
          result[betId || test?.id] = {
            ...test,
            wager: test?.initCostUsd,
            price: test?.avgPrice,
            name: market?.outcomes?.[parseInt(test?.outcomeId)]?.name,
            betId,
            toWin: test?.payout,
            cashoutAmount: test?.payout,
            canCashOut: true,
          };
        }
        return result;
      }, {});
      out[event?.eventId] = {
        eventId: event?.eventId,
        eventTitle: event?.description,
        eventStartTime: event?.startTimestamp,
        bets,
        marketIds: event?.marketIds,
      };
      return out;
    }, {});
  }
  if (!!search) {
    eventPositionsData = Object.entries(eventPositionsData)
      .filter(([eventID, event]: any) => {
        const searchRegex = new RegExp(search, "i");
        const { eventTitle, eventStartTime, bets } = event;
        const eventStart = new Date(eventStartTime * 1000);
        const matchEventTitle = searchRegex.test(eventTitle);
        const matchDate = searchRegex.test(eventStart.toString());
        const matchOutcomes = searchRegex.test(
          JSON.stringify(Object.entries(bets).map(([betId, bet]: any) => bet?.name))
        );
        return matchEventTitle || matchDate || matchOutcomes;
      })
      .reduce((acc, [eventId, event]) => {
        const out = { ...acc };
        out[eventId] = event;
        return out;
      }, {});
  }
  return eventPositionsData;
};

export const PortfolioView = () => {
  useScrollToTopOnMount();
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState(OPEN);
  const [eventTypeFilter, setEventTypeFilter] = useState(0);
  const [showActivity, setShowActivity] = useState(false);
  const eventPositionsData = useEventPositionsData(sortBy, filter);

  return (
    <div
      className={classNames(Styles.PortfolioView, {
        [Styles.ActivityShown]: showActivity,
      })}
    >
      <SEO {...PORTFOLIO_HEAD_TAGS} />
      <section>
        <NetworkMismatchBanner />
        <ClaimWinningsSection />
        <ul className={Styles.FilterSearchNav}>
          <SquareDropdown
            onChange={(value) => {
              setSortBy(value);
            }}
            options={marketStatusItems}
            defaultValue={sortBy}
            preLabel="Market Status"
          />
          <DailyFutureSwitch selection={eventTypeFilter} setSelection={(id) => setEventTypeFilter(id)} />
          <SecondaryThemeButton text="YOUR ACTIVITY" action={() => setShowActivity(!showActivity)} small />
          <SearchInput value={filter} onChange={(e) => setFilter(e.target.value)} clearValue={() => setFilter("")} />
        </ul>
        <EventBetsSection eventPositionData={eventPositionsData} />
      </section>
      <section>
        <SecondaryThemeButton
          text="MY BETS"
          reverseContent
          icon={SimpleChevron}
          action={() => setShowActivity(!showActivity)}
          small
        />
        <h2>Your Activity</h2>
        <ClaimWinningsSection />
        <Activity />
      </section>
    </div>
  );
};

export default PortfolioView;
