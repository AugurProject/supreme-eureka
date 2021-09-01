import React, { useState, useMemo, useEffect } from "react";
import classNames from "classnames";
import Styles from "./liquidity-view.styles.less";
import {
  Components,
  Utils,
  useDataStore,
  useUserStore,
  useAppStatusStore,
  Constants,
  ContractCalls,
  Stores,
} from "@augurproject/comps";
import { categoryItems } from "../constants";
import { AppViewStats, AvailableLiquidityRewards } from "../common/labels";
import { BonusReward } from "../common/tables";
import { useSimplifiedStore } from "../stores/simplified";
import { MarketInfo } from "@augurproject/comps/build/types";
const { MODAL_ADD_LIQUIDITY, ADD, CREATE, REMOVE, ALL_MARKETS, OTHER, POPULAR_CATEGORIES_ICONS, SPORTS } = Constants;
const {
  Links: { MarketLink },
  SelectionComps: { SquareDropdown, ToggleSwitch },
  Icons: { Arrow },
  InputComps: { SearchInput },
  LabelComps: { CategoryIcon },
  MarketCardComps: { MarketTitleArea },
  ButtonComps: { PrimaryThemeButton, SecondaryThemeButton },
} = Components;
const { canAddLiquidity } = ContractCalls;
const {
  DateUtils: { getMarketEndtimeDate },
  Formatter: { formatApy, formatCash },
} = Utils;
const {
  Utils: { isMarketFinal },
} = Stores;

const MARKET_TYPE_OPTIONS = [
  {
    label: "Daily + Long Term",
    value: "daily+long",
    disabled: false,
  },
  {
    label: "Daily Only",
    value: "daily",
    disabled: false,
  },
  {
    label: "Long Term Only",
    value: "long",
    disabled: false,
  },
];

const SORT_TYPES = {
  LIQUIDITY: "LIQUIDITY",
  REWARDS: "REWARDS",
  TVL: "TVL",
  APY: "APY",
  EXPIRES: "EXPIRES",
};

interface LiquidityMarketCardProps {
  key?: string;
  market: MarketInfo;
}

const applyFiltersAndSort = (
  passedInMarkets,
  setFilteredMarkets,
  transactions,
  userMarkets,
  { filter, primaryCategory, subCategories, marketTypeFilter, sortBy, onlyUserLiquidity }
) => {
  let updatedFilteredMarkets = passedInMarkets;

  if (onlyUserLiquidity) {
    updatedFilteredMarkets = updatedFilteredMarkets.filter((market) => userMarkets.includes(market.marketId));
  }

  if (marketTypeFilter !== MARKET_TYPE_OPTIONS[0].value) {
    updatedFilteredMarkets = updatedFilteredMarkets.filter((market) =>
      marketTypeFilter === MARKET_TYPE_OPTIONS[1].value ? !market.isFuture : market.isFuture
    );
  }

  if (filter !== "") {
    updatedFilteredMarkets = updatedFilteredMarkets.filter((market) => {
      const { title, description, categories, outcomes } = market;
      const searchRegex = new RegExp(filter, "i");
      const matchTitle = searchRegex.test(title);
      const matchDescription = searchRegex.test(description);
      const matchCategories = searchRegex.test(JSON.stringify(categories));
      const matchOutcomes = searchRegex.test(JSON.stringify(outcomes.map((outcome) => outcome.name)));
      if (matchTitle || matchDescription || matchCategories || matchOutcomes) {
        return true;
      }
      return false;
    });
  }

  updatedFilteredMarkets = updatedFilteredMarkets.filter((market: MarketInfo) => {
    if (
      primaryCategory !== ALL_MARKETS &&
      primaryCategory !== OTHER &&
      market.categories[0].toLowerCase() !== primaryCategory.toLowerCase()
    ) {
      return false;
    }
    if (primaryCategory === OTHER && POPULAR_CATEGORIES_ICONS[market.categories[0].toLowerCase()]) {
      return false;
    }
    if (primaryCategory === SPORTS && subCategories.length > 0) {
      // subCategories is always a max 2 length, markets are 3.
      const indexToCheck = subCategories.length === 1 ? 1 : market.categories.length - 1;
      if (
        market.categories[indexToCheck] &&
        market.categories[indexToCheck].toLowerCase() !== subCategories[indexToCheck - 1].toLowerCase()
      ) {
        return false;
      }
    }
    return true;
  });

  if (sortBy.type) {
    updatedFilteredMarkets = updatedFilteredMarkets.sort((marketA, marketB) => {
      const aTransactions = transactions ? transactions[marketA.marketId] : {};
      const bTransactions = transactions ? transactions[marketB.marketId] : {};
      const { type, direction } = sortBy;

      if (type === SORT_TYPES.EXPIRES) {
        return Number(marketA.endTimestam) > Number(marketB.endTimestamp) ? direction : direction * -1;
      }
        // return (bTransactions?.volumeTotalUSD || 0) > (aTransactions?.volumeTotalUSD || 0) ? 1 : -1;
      // } else if (sortBy === TWENTY_FOUR_HOUR_VOLUME) {
      //   return (bTransactions?.volume24hrTotalUSD || 0) > (aTransactions?.volume24hrTotalUSD || 0) ? 1 : -1;
      // } else if (sortBy === LIQUIDITY) {
      //   return (Number(marketB?.amm?.liquidityUSD) || 0) > (Number(marketA?.amm?.liquidityUSD) || 0) ? 1 : -1;
      // } else if (sortBy === STARTS_SOON) {
      //   return (marketA?.startTimestamp > marketB?.startTimestamp ? 1 : -1) * mod;
      // }
      return true;
    });
  }
  
  setFilteredMarkets(updatedFilteredMarkets);
};

const LiquidityMarketCard = ({ market }: LiquidityMarketCardProps): React.Component => {
  const {
    settings: { timeFormat },
  } = useSimplifiedStore();
  const {
    actions: { setModal },
  } = useAppStatusStore();
  const {
    balances: { lpTokens },
  } = useUserStore();
  const { transactions } = useDataStore();
  const {
    marketId,
    categories,
    amm: {
      hasLiquidity,
      cash: { name: currency },
    },
    endTimestamp,
  } = market;
  const marketTransactions = transactions[marketId];
  const formattedApy = useMemo(() => marketTransactions?.apy && formatApy(marketTransactions.apy).full, [
    marketTransactions?.apy,
  ]);
  const formattedVol = useMemo(
    () =>
      marketTransactions?.volumeTotalUSD &&
      formatCash(marketTransactions.volumeTotalUSD, currency, { bigUnitPostfix: true }).full,
    [marketTransactions?.volumeTotalUSD]
  );
  const userHasLiquidity = lpTokens?.[marketId];
  const canAddLiq = canAddLiquidity(market);
  const isfinal = isMarketFinal(market);

  return (
    <article
      className={classNames(Styles.LiquidityMarketCard, {
        [Styles.HasUserLiquidity]: userHasLiquidity,
      })}
    >
      <MarketLink id={marketId} dontGoToMarket={false}>
        <CategoryIcon {...{ categories }} />
        <MarketTitleArea {...{ ...market, timeFormat }} />
      </MarketLink>
      <span>{endTimestamp ? getMarketEndtimeDate(endTimestamp) : "-"}</span>
      <span>{formattedVol || "-"}</span>
      <span>{formattedApy || "-"}</span>
      <span>{userHasLiquidity ? formatCash(userHasLiquidity?.usdValue, currency).full : "$0.00"}</span>
      <span>0 MATIC</span>
      <div>
        {!userHasLiquidity ? (
          <PrimaryThemeButton
            text="ADD LIQUIDITY"
            small
            disabled={!canAddLiq}
            action={() =>
              setModal({
                type: MODAL_ADD_LIQUIDITY,
                market,
                liquidityModalType: hasLiquidity ? CREATE : ADD,
                currency,
              })
            }
          />
        ) : (
          <>
            <SecondaryThemeButton
              text="-"
              small
              action={() =>
                setModal({
                  type: MODAL_ADD_LIQUIDITY,
                  market,
                  currency,
                  liquidityModalType: REMOVE,
                })
              }
            />
            <PrimaryThemeButton
              text="+"
              small
              disabled={isfinal || !canAddLiq}
              action={() =>
                !isfinal &&
                setModal({
                  type: MODAL_ADD_LIQUIDITY,
                  market,
                  currency,
                  liquidityModalType: ADD,
                })
              }
            />
          </>
        )}
      </div>
      {userHasLiquidity && <BonusReward />}
    </article>
  );
};

const LiquidityView = () => {
  const {
    marketsViewSettings,
    actions: { updateMarketsViewSettings },
  } = useSimplifiedStore();
  const {
    balances: { lpTokens },
  } = useUserStore();
  const { markets, transactions } = useDataStore();
  const [marketTypeFilter, setMarketTypeFilter] = useState(MARKET_TYPE_OPTIONS[0].value);
  const [onlyUserLiquidity, setOnlyUserLiquidity] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState({
    type: null,
    direction: 1,
  });
  const [filteredMarkets, setFilteredMarkets] = useState([]);
  const { primaryCategory, subCategories } = marketsViewSettings;
  const marketKeys = Object.keys(markets);
  const userMarkets = Object.keys(lpTokens);

  const handleFilterSort = () => {
    applyFiltersAndSort(Object.values(markets), setFilteredMarkets, transactions, userMarkets, {
      filter,
      primaryCategory,
      subCategories,
      marketTypeFilter,
      sortBy,
      onlyUserLiquidity,
    });
  };

  useEffect(() => {
    handleFilterSort();
  }, [filter, primaryCategory, subCategories, marketTypeFilter, onlyUserLiquidity, sortBy.type, sortBy.direction]);

  useEffect(() => {
    handleFilterSort();
  }, [marketKeys.length, userMarkets.length]);

  return (
    <div className={Styles.LiquidityView}>
      <AppViewStats small liquidity />
      <AvailableLiquidityRewards />
      <h1>Explore LP Opportunties</h1>
      <p>
        Add Market liquidity to earn fees and rewards. <a href=".">Learn more →</a>
      </p>
      <ul>
        <SquareDropdown
          onChange={(value) => {
            updateMarketsViewSettings({ primaryCategory: value, subCategories: [] });
          }}
          options={categoryItems}
          defaultValue={primaryCategory}
        />
        <SquareDropdown
          onChange={(value) => setMarketTypeFilter(value)}
          options={MARKET_TYPE_OPTIONS}
          defaultValue={MARKET_TYPE_OPTIONS[0].value}
        />
        <span>
          <ToggleSwitch
            id="toggleOnlyUserLiquidity"
            toggle={onlyUserLiquidity}
            clean
            setToggle={() => setOnlyUserLiquidity(!onlyUserLiquidity)}
          />
          My Liquidity Positions
        </span>
        <SearchInput value={filter} onChange={(e) => setFilter(e.target.value)} clearValue={() => setFilter("")} />
      </ul>
      <section>
        <article>
          <span>Market</span>
          <button
            className={classNames({
              [Styles.Ascending]: sortBy.direction < 0,
            })}
            onClick={() => {
              switch (sortBy.type) {
                case SORT_TYPES.EXPIRES: {
                  setSortBy({
                    type: sortBy.direction < 0 ? null : SORT_TYPES.EXPIRES,
                    direction: sortBy.direction < 0 ? 1 : -1,
                  });
                  break;
                }
                default: {
                  setSortBy({
                    type: SORT_TYPES.EXPIRES,
                    direction: 1,
                  });
                  break;
                }
              }
            }}
          >
            Expires {sortBy.type === SORT_TYPES.EXPIRES && Arrow}
          </button>
          <button
            onClick={() => {
              switch (sortBy.type) {
                case SORT_TYPES.TVL: {
                  setSortBy({
                    type: sortBy.direction < 0 ? null : SORT_TYPES.TVL,
                    direction: sortBy.direction < 0 ? 1 : -1,
                  });
                  break;
                }
                default: {
                  setSortBy({
                    type: SORT_TYPES.TVL,
                    direction: 1,
                  });
                  break;
                }
              }
            }}
          >
            TVL
          </button>
          <button
            onClick={() => {
              switch (sortBy.type) {
                case SORT_TYPES.APY: {
                  setSortBy({
                    type: sortBy.direction < 0 ? null : SORT_TYPES.APY,
                    direction: sortBy.direction < 0 ? 1 : -1,
                  });
                  break;
                }
                default: {
                  setSortBy({
                    type: SORT_TYPES.APY,
                    direction: 1,
                  });
                  break;
                }
              }
            }}
          >
            APY
          </button>
          <button
            onClick={() => {
              switch (sortBy.type) {
                case SORT_TYPES.LIQUIDITY: {
                  setSortBy({
                    type: sortBy.direction < 0 ? null : SORT_TYPES.LIQUIDITY,
                    direction: sortBy.direction < 0 ? 1 : -1,
                  });
                  break;
                }
                default: {
                  setSortBy({
                    type: SORT_TYPES.LIQUIDITY,
                    direction: 1,
                  });
                  break;
                }
              }
            }}
          >
            My Liquidity
          </button>
          <button
            onClick={() => {
              switch (sortBy.type) {
                case SORT_TYPES.REWARDS: {
                  setSortBy({
                    type: sortBy.direction < 0 ? null : SORT_TYPES.REWARDS,
                    direction: sortBy.direction < 0 ? 1 : -1,
                  });
                  break;
                }
                default: {
                  setSortBy({
                    type: SORT_TYPES.REWARDS,
                    direction: 1,
                  });
                  break;
                }
              }
            }}
          >
            My Rewards
          </button>
          <span />
        </article>
        <section>
          {filteredMarkets.map((market: MarketInfo) => (
            <LiquidityMarketCard market={market} key={market.marketId} />
          ))}
        </section>
      </section>
    </div>
  );
};

export default LiquidityView;