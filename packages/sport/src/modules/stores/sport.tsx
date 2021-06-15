import React, { useEffect } from "react";
import { DEFAULT_SPORT_STATE, STUBBED_SPORT_ACTIONS, SPORT_STATE_KEYS, LOCAL_STORAGE_SETTINGS_THEME, MarketEvent } from "./constants";
import { useSport } from "./sport-hooks";
import { useUserStore, Stores, useDataStore } from "@augurproject/comps";
import { SPORTS_MARKET_TYPE } from "@augurproject/comps/build/utils/constants";
import { MarketInfo } from "@augurproject/comps/build/types";

const {
  Utils: { getSavedUserInfo },
} = Stores;

const { SETTINGS } = SPORT_STATE_KEYS;

export const SportContext = React.createContext({
  ...DEFAULT_SPORT_STATE,
  actions: STUBBED_SPORT_ACTIONS,
});

export const SportStore = {
  actionsSet: false,
  get: () => ({ ...DEFAULT_SPORT_STATE }),
  actions: STUBBED_SPORT_ACTIONS,
};

const useLoadUserSettings = () => {
  const { account } = useUserStore();
  useEffect(() => {
    if (account) {
      const savedUserSettings = getSavedUserInfo(account)[LOCAL_STORAGE_SETTINGS_THEME];
      if (savedUserSettings) {
        SportStore.actions.updateSettings(savedUserSettings);
      }
    } else {
      SportStore.actions.updateSettings(DEFAULT_SPORT_STATE[SETTINGS]);
    }
  }, [account]);
};

const useMarketEvents = () => {
  const { markets } = useDataStore();
  const marketIds = Object.keys(markets);
  const eventIds = marketIds.reduce((p, id) => p.includes(markets[id].eventId) ? p : [...p, markets[id].eventId], []);
  const numMarkets = marketIds.length;

  useEffect(() => {
    if (numMarkets) {
      const marketEvents = Object.keys(markets).reduce((p, marketId) => {
        const { eventId, description, startTimestamp, categories, hasWinner } = markets[marketId];
        return Object.keys(p).includes(eventId) ?
          {
            ...p,
            [eventId]: { ...p[eventId], marketIds: [...p[eventId].marketIds, marketId] }
          }
          : {
            ...p,
            [eventId]: {
              eventId,
              description: description.replace('?', ''),
              startTimestamp,
              categories,
              hasWinner,
              marketIds: [marketId],
              overUnderLine: null,
              spreadLine: null,
            }
          }
      }, {});

      if (marketEvents) {
        const populatedMarketEvents = Object.keys(marketEvents).reduce((p, id) => {
          const event: MarketEvent = marketEvents[id];
          const moneylineMarketId = event.marketIds.find(id => markets[id].sportsMarketType === SPORTS_MARKET_TYPE.MONEY_LINE);
          if (moneylineMarketId) {
            const moneyline: MarketInfo = markets[moneylineMarketId];
            event.description = moneyline.outcomes.length !== 0 ? `${moneyline.outcomes[1].name} vs ${moneyline.outcomes[2].name}` : event.description;
            event.outcomeNames = moneyline.outcomes.length !== 0 ? moneyline.outcomes.map(o => o.name) : [];
          }
          if (event.marketIds.length > 1) {
            const spreadMarketId = event.marketIds.find(id => markets[id].sportsMarketType === SPORTS_MARKET_TYPE.SPREAD);
            if (spreadMarketId) {
              event.spreadLine = markets[spreadMarketId].spreadOuLine;
            }
            const overUnderMarketId = event.marketIds.find(id => markets[id].sportsMarketType === SPORTS_MARKET_TYPE.OVER_UNDER);
            if (overUnderMarketId) {
              event.overUnderLine = markets[overUnderMarketId].spreadOuLine;
            }
          }
          return { ...p, [id]: event }
        }, {})
        SportStore.actions.updateMarketEvents(populatedMarketEvents);
      }
    }
  }, [eventIds.length, numMarkets]);
};


export const SportProvider = ({ children }: any) => {
  const state = useSport();

  useLoadUserSettings();
  useMarketEvents();

  if (!SportStore.actionsSet) {
    SportStore.actions = state.actions;
    SportStore.actionsSet = true;
  }
  const readableState = { ...state };
  delete readableState.actions;
  SportStore.get = () => readableState;

  return <SportContext.Provider value={state}>{children}</SportContext.Provider>;
};

export const useSportsStore = () => React.useContext(SportContext);
