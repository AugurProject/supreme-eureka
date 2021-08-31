import React, { useState, useMemo, useEffect } from "react";
import Styles from "./liquidity-view.styles.less";
import {
  Components,
  Utils,
  useDataStore,
  useUserStore,
  useAppStatusStore,
  Constants,
  ContractCalls,
} from "@augurproject/comps";
import { categoryItems } from "../constants";
import { AppViewStats, AvailableLiquidityRewards } from "../common/labels";
import { useSimplifiedStore } from "../stores/simplified";
import { MarketInfo } from "@augurproject/comps/build/types";
const { MODAL_ADD_LIQUIDITY, ADD, CREATE, ALL_MARKETS, OTHER, POPULAR_CATEGORIES_ICONS, SPORTS } = Constants;
const {
  Links: { MarketLink },
  SelectionComps: { SquareDropdown },
  InputComps: { SearchInput },
  LabelComps: { CategoryIcon },
  MarketCardComps: { MarketTitleArea },
  ButtonComps: { PrimaryThemeButton },
} = Components;
const { canAddLiquidity } = ContractCalls;
const {
  DateUtils: { getMarketEndtimeDate },
  Formatter: { formatApy, formatCash },
} = Utils;

interface LiquidityMarketCardProps {
  key?: string;
  market: MarketInfo;
}

const applyFiltersAndSort = (
  passedInMarkets,
  setFilteredMarkets,
  transactions,
  { filter, primaryCategory, subCategories, sortBy }
) => {
  let updatedFilteredMarkets = passedInMarkets;

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
    // if (showLiquidMarkets && (!market.amm || !market.amm.hasLiquidity)) {
    //   return false;
    // }
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
  const { marketId, categories, amm, endTimestamp } = market;
  const marketTransactions = transactions[marketId];
  const formattedApy = useMemo(() => marketTransactions?.apy && formatApy(marketTransactions.apy).full, [
    marketTransactions?.apy,
  ]);
  const formattedVol = useMemo(
    () =>
      marketTransactions?.volumeTotalUSD &&
      formatCash(marketTransactions.volumeTotalUSD, amm?.cash?.name, { bigUnitPostfix: true }).full,
    [marketTransactions?.volumeTotalUSD]
  );
  const hasLiquidity = lpTokens?.[marketId];
  const canAddLiq = canAddLiquidity(market);


  return (
    <article className={Styles.LiquidityMarketCard}>
      <MarketLink id={marketId} dontGoToMarket={false}>
        <CategoryIcon {...{ categories }} />
        <MarketTitleArea {...{ ...market, timeFormat }} />
      </MarketLink>
      <span>{endTimestamp ? getMarketEndtimeDate(endTimestamp) : "-"}</span>
      <span>{formattedVol || "-"}</span>
      <span>{formattedApy || "-"}</span>
      <span>{hasLiquidity ? formatCash(hasLiquidity?.usdValue, amm?.cash?.name).full : "$0.00"}</span>
      <span>0 MATIC</span>
      <PrimaryThemeButton
        text="ADD LIQUIDITY"
        small
        disabled={!canAddLiq}
        action={() =>
          setModal({
            type: MODAL_ADD_LIQUIDITY,
            market,
            liquidityModalType: amm?.hasLiquidity ? CREATE : ADD,
            currency: amm?.cash?.name,
          })
        }
      />
    </article>
  );
};

const LiquidityView = () => {
  const {
    marketsViewSettings,
    actions: { updateMarketsViewSettings },
  } = useSimplifiedStore();
  const { markets, transactions } = useDataStore();
  const [filter, setFilter] = useState("");
  const [filteredMarkets, setFilteredMarkets] = useState([]);
  const { primaryCategory, subCategories } = marketsViewSettings;
  const marketKeys = Object.keys(markets);

  const handleFilterSort = () => {
    applyFiltersAndSort(Object.values(markets), setFilteredMarkets, transactions, {
      filter,
      primaryCategory,
      subCategories,
      sortBy: '',
    });
  };

  useEffect(() => {
    handleFilterSort();
  }, [filter, primaryCategory, subCategories]);

  useEffect(() => {
    handleFilterSort();
  }, [marketKeys.length]);

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
          onChange={() => {}}
          options={[
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
          ]}
          defaultValue={"daily+long"}
        />
        <span>My Liquidity Positions</span>
        <SearchInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          clearValue={() => setFilter("")}
          showFilter={true}
        />
      </ul>
      <section>
        <article>
          <span>Market</span>
          <button>Expires</button>
          <button>TVL</button>
          <button>APR</button>
          <button>My Liquidity</button>
          <button>My Rewards</button>
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
