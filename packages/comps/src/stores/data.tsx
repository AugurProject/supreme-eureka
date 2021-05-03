import React, { useEffect } from "react";
import { DEFAULT_DATA_STATE, STUBBED_DATA_ACTIONS, PARA_CONFIG, NETWORK_BLOCK_REFRESH_TIME } from "./constants";
import { useData } from "./data-hooks";
import { useUserStore } from "./user";
import { getMarketInfos } from "../utils/contract-calls";
import { getTransactions } from "../apollo/client";

export const DataContext = React.createContext({
  ...DEFAULT_DATA_STATE,
  actions: STUBBED_DATA_ACTIONS,
});

export const DataStore = {
  actionsSet: false,
  get: () => ({ ...DEFAULT_DATA_STATE }),
  actions: STUBBED_DATA_ACTIONS,
};

export const DataProvider = ({ children }: any) => {
  const configCashes = getCashesInfo();
  const state = useData(configCashes);
  const { account, loginAccount } = useUserStore();
  const provider = loginAccount?.library ? loginAccount.library : null;
  const {
    cashes,
    actions: { updateDataHeartbeat, updateTransactions },
  } = state;
  if (!DataStore.actionsSet) {
    DataStore.actions = state.actions;
    DataStore.actionsSet = true;
  }
  const readableState = { ...state };
  delete readableState.actions;
  DataStore.get = () => readableState;
  useEffect(() => {
    let isMounted = true;
    const getMarkets = async () => {
      if (provider && account) {
        return await getMarketInfos(provider, DataStore.get().markets, cashes, account);
      }
      return { markets: {}, ammExchanges: {}, blocknumber: null, loading: true };
    };
    getMarkets().then(({ markets, ammExchanges, blocknumber, loading }) => {
      isMounted && updateDataHeartbeat({ ammExchanges, cashes, markets }, blocknumber, null, loading);
    });

    const intervalId = setInterval(() => {
      getMarkets().then(({ markets, ammExchanges, blocknumber, loading }) => {
        isMounted && updateDataHeartbeat({ ammExchanges, cashes, markets }, blocknumber, null, loading);
      });
    }, NETWORK_BLOCK_REFRESH_TIME[42]);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [provider, account]);

  useEffect(() => {
    // start data heartbeat
    let isMounted = true;

    const fetchLiquidities = () => getTransactions((transactions) => isMounted && updateTransactions(transactions));

    fetchLiquidities();

    const intervalId = setInterval(() => {
      fetchLiquidities();
    }, NETWORK_BLOCK_REFRESH_TIME[42]);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
};

export const useDataStore = () => React.useContext(DataContext);

const output = {
  DataProvider,
  useDataStore,
  DataStore,
};

// for now we jsut do this here...
const getCashesInfo = (): any[] => {
  // @ts-ignore
  const { marketFactories } = PARA_CONFIG;
  const { collateral: usdcCollateral } = marketFactories.sportsball;
  // todo: need to grab all collaterals per market factory

  const cashes = [
    {
      name: "USDC",
      displayDecimals: 2,
      decimals: usdcCollateral.decimals,
      address: usdcCollateral.address,
      shareToken: "",
      usdPrice: "1",
      asset: "",
    },
    {
      name: "ETH",
      displayDecimals: 4,
      decimals: 18,
      address: "0x7290c2b7D5Fc91a112d462fe06aBBB8948668f56",
      shareToken: "",
      usdPrice: "2000",
      asset: "ETH",
    },
  ];

  return cashes;
};

export default output;
