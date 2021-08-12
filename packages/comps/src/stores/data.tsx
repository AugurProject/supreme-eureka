import React, { useEffect, useRef } from "react";
import {
  DEFAULT_DATA_STATE,
  STUBBED_DATA_ACTIONS,
  PARA_CONFIG,
  NETWORK_BLOCK_REFRESH_TIME,
  MARKET_IGNORE_LIST,
  MULTICALL_MARKET_IGNORE_LIST,
} from "./constants";
import { useData } from "./data-hooks";
import { useUserStore, UserStore } from "./user";
import { getMarketInfos, fillGraphMarketsData } from "../utils/contract-calls";
import { getAllTransactions, getMarketsData } from "../apollo/client";
import { getDefaultProvider } from "../components/ConnectAccount/utils";
import { AppStatusStore } from "./app-status";
import { MARKET_LOAD_TYPE } from "../utils/constants";

export const DataContext = React.createContext({
  ...DEFAULT_DATA_STATE,
  actions: STUBBED_DATA_ACTIONS,
});

export const DataStore = {
  actionsSet: false,
  get: () => ({ ...DEFAULT_DATA_STATE }),
  actions: STUBBED_DATA_ACTIONS,
};

export const DataProvider = ({ loadType = MARKET_LOAD_TYPE.SIMPLIFIED, children }: any) => {
  const configCashes = getCashesInfo();
  const state = useData(configCashes);
  const { account } = useUserStore();
  const defaultProvider = useRef(getDefaultProvider());
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
  const networkId = Number(PARA_CONFIG.networkId);
  useEffect(() => {
    let isMounted = true;
    let intervalId = null;
    const getMarkets = async () => {
      const { account: userAccount, loginAccount } = UserStore.get();
      const { isRpcDown, isDegraded } = AppStatusStore.get();
      const { blocknumber: dblock, markets: dmarkets, ammExchanges: damm } = DataStore.get();
      const provider = loginAccount?.library || defaultProvider?.current;
      let infos = { markets: dmarkets, ammExchanges: damm, blocknumber: dblock };
      try {
        try {
          const { data, block, errors } = await getMarketsData();
          
          if (errors) {
            throw new Error(`Graph returned error ${errors}`);
          }
          const infos = await fillGraphMarketsData(
            data,
            cashes,
            provider,
            account,
            Number(block),
            MARKET_IGNORE_LIST,
            loadType,
            dmarkets,
            damm
          );

          // Throwing now until graph data can consistently pull all markets
          throw new Error('Temporary Graph Failover');

          if (isDegraded) {
            AppStatusStore.actions.setIsDegraded(false);
          }
          return infos;
        } catch (e) {
          // failover use multicalls
          if (!isDegraded) {
            AppStatusStore.actions.setIsDegraded(true);
          }
  
          console.log("failover to use multicall", e);
          infos = await getMarketInfos(
            provider,
            dmarkets,
            damm,
            cashes,
            userAccount,
            MULTICALL_MARKET_IGNORE_LIST,
            loadType,
            dblock
          );
        }
        if (isRpcDown) {
          AppStatusStore.actions.setIsRpcDown(false);
        }
        return infos;
      } catch (e) {
        if (e.data?.error?.details) {
          if (e.data?.error?.details.toLowerCase().indexOf("rate limit") !== -1) {
            if (e.data?.error?.data?.rate_violated.toLowerCase().indexOf("700 per 1 minute") !== -1) {
              AppStatusStore.actions.setIsRpcDown(true);
            }
          }
        }
        console.log("error getting market data", e);
      }
      return { markets: {}, ammExchanges: {}, blocknumber: null };
    };

    getMarkets().then(({ markets, ammExchanges, blocknumber }) => {
      isMounted &&
        blocknumber &&
        blocknumber > DataStore.get().blocknumber &&
        updateDataHeartbeat({ ammExchanges, cashes, markets }, blocknumber, null);
      intervalId = setInterval(() => {
        getMarkets().then(({ markets, ammExchanges, blocknumber }) => {
          isMounted &&
            blocknumber &&
            blocknumber > DataStore.get().blocknumber &&
            updateDataHeartbeat({ ammExchanges, cashes, markets }, blocknumber, null);
        });
      }, NETWORK_BLOCK_REFRESH_TIME[networkId]);
    });

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchTransactions = () =>
      getAllTransactions(account?.toLowerCase(), (transactions) => isMounted && updateTransactions(transactions));

    fetchTransactions();

    const intervalId = setInterval(() => {
      fetchTransactions();
    }, NETWORK_BLOCK_REFRESH_TIME[networkId]);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [account]);

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
  const { marketFactories } = PARA_CONFIG;
  const { collateral: usdcCollateral } = marketFactories[0];
  // todo: need to grab all collaterals per market factory

  const cashes = [
    {
      name: "USDC",
      displayDecimals: 2,
      decimals: 6,
      address: usdcCollateral,
      shareToken: "",
      usdPrice: "1",
      asset: "",
    },
    {
      name: "ETH",
      displayDecimals: 4,
      decimals: 18,
      address: "0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa", // WETH address on Matic Mumbai
      shareToken: "",
      usdPrice: "2000",
      asset: "ETH",
    },
  ];

  return cashes;
};

export default output;
