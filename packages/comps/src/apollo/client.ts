import ApolloClient from "apollo-boost";
import {
  GET_BLOCK,
  GET_MARKETS,
  GET_TRANSACTIONS,
  SEARCH_MARKETS,
  GET_LATEST_BLOCK
} from "./queries";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Cash } from "../types";
import { InMemoryCache } from "apollo-cache-inmemory";
import { ErrorPolicy, FetchPolicy } from "apollo-client";
import { MARKET_FACTORY_TYPES } from "../utils/constants";
import { PARA_CONFIG } from "../stores/constants";

dayjs.extend(utc);

const defaultOptions = {
  watchQuery: {
    fetchPolicy: "no-cache" as FetchPolicy,
    errorPolicy: "ignore" as ErrorPolicy,
  },
  query: {
    fetchPolicy: "no-cache" as FetchPolicy,
    errorPolicy: "all" as ErrorPolicy,
  },
};

export const client = augurV2Client("https://api.thegraph.com/subgraphs/name/ianlapham/uniswapv2");

export const healthClient = augurV2Client("https://api.thegraph.com/index-node/graphql");

export function blockClient(uri: string) {
  return new ApolloClient({
    uri,
  });
}

export function augurV2Client(uri: string) {
  const client = new ApolloClient({
    uri,
    cache: new InMemoryCache({
      addTypename: false,
    }),
  });
  client.defaultOptions = defaultOptions;
  return client;
}

const getMarketFactories = () => {
  return PARA_CONFIG.marketFactories.reduce(
    (p, c) => ({ ...p, [c.type]: p[c.type] ? [...p[c.type], c.address.toLowerCase()] : [c.address.toLowerCase()] }),
    {}
  );
};

export async function getMarketsData() {
  const clientConfig = getClientConfig();
  let response = null;
  let block = null;
  try {
    const marketFactories = getMarketFactories();
    block = null; // will be needed in future, await getCurrentBlockNumber(clientConfig.blockClient);
    response = await augurV2Client(clientConfig.turboClient).query({
      query: GET_MARKETS,
      variables: {
        [MARKET_FACTORY_TYPES.SPORTSLINK]: marketFactories[MARKET_FACTORY_TYPES.SPORTSLINK],
        [MARKET_FACTORY_TYPES.MMALINK]: marketFactories[MARKET_FACTORY_TYPES.MMALINK],
        [MARKET_FACTORY_TYPES.CRYPTO]: marketFactories[MARKET_FACTORY_TYPES.CRYPTO],
        [MARKET_FACTORY_TYPES.NFL]: marketFactories[MARKET_FACTORY_TYPES.NFL],
      },
    });
  } catch (e) {
    console.error(e);
    return { data: null, block: null, errors: e };
  }

  if (response) {
    if (response.errors) {
      console.error(JSON.stringify(response.errors, null, 1));
    }
    return { data: response.data, block, errors: response?.errors };
  }
  return { data: null, block: null, errors: null };
}

export async function searchMarkets(searchString, cb) {
  const clientConfig = getClientConfig();
  let response = null;
  if (searchString === "") return cb(null, []);
  const searchQuery = searchString.trim().split(" ").join(" & ");
  try {
    response = await augurV2Client(clientConfig.augurClient).query({
      query: SEARCH_MARKETS,
      variables: {
        query: `${searchQuery}:*`,
      },
    });
  } catch (e) {
    cb(e, []);
    console.error(e);
  }

  if (response) {
    if (response.errors) {
      console.error(JSON.stringify(response.errors, null, 1));
    }
    if (response?.data?.marketSearch) cb(null, [...response.data.marketSearch?.map((market) => market.id)]);
    else cb(null, []);
  }
}

export async function getAllTransactions(account = "0x0", cb) {
  const clientConfig = getClientConfig();
  let response = null;
  try {
    const marketFactories = PARA_CONFIG.marketFactories.map((f) => f.address.toLowerCase());
    response = await augurV2Client(clientConfig.turboClient).query({
      query: GET_TRANSACTIONS,
      variables: {
        account,
        marketFactories,
      },
    });
  } catch (e) {
    console.error(e);
  }
  if (response) {
    if (response?.errors) {
      console.error(JSON.stringify(response.errors, null, 1));
    }
    if (response?.data) {
      const processedMarkets = (response?.data?.markets || []).reduce((acc, item) => {
        let update = acc;
        update[item.id] = item;
        return update;
      }, {});
      // THIS CODE IS FOR CONVIENCE TO INSTEAD GRAB EVERYONES CLAIMS AND FEES
      // let proceeds = [];
      // let fees = [];
      // const senders = (response?.data?.senders || []);
      // for (const index in senders) {
      //   const sender = senders[index];
      //   proceeds = proceeds.concat(sender?.claimedProceeds);
      //   fees = fees.concat(sender?.claimedFees);
      // }

      // const processedSenders = { claimedProceeds: proceeds, claimedFees: fees, userAddress: account };
      // console.log("processedSenders", processedSenders, response);
      // END CONVIENCE CODE
      const processedSenders =
        response?.data?.senders?.length > 0
          ? { ...response.data.senders[0], userAddress: account }
          : { claimedProceeds: [], claimedFees: [], positionBalance: [], userAddress: account };
      cb({ ...processedMarkets, ...processedSenders });
    }
  }
}

async function getPastDayBlockNumber(blockClient) {
  const utcCurrentTime = dayjs.utc();
  const utcOneDayBack = utcCurrentTime.subtract(1, "day").unix();
  const block = await getBlockFromTimestamp(utcOneDayBack, blockClient);
  return block;
}

/**
 * @notice Fetches first block after a given timestamp
 * @dev Query speed is optimized by limiting to a 600-second period
 * @param {Int} timestamp in seconds
 */
export async function getBlockFromTimestamp(timestamp, url) {
  const result = await blockClient(url).query({
    query: GET_BLOCK,
    variables: {
      begin: timestamp,
      end: timestamp + 600,
    },
  });
  return result ? result?.data?.blocks?.[0]?.number : 0;
}

export async function getCurrentBlockNumber(url) {
  const result = await blockClient(url).query({
    query: GET_LATEST_BLOCK,
  });
  return result ? result?.data?.blocks?.[0]?.number : 0;
}

// https://thegraph.com/explorer/subgraph/augurproject/augur-v2-staging
// kovan playground
const getClientConfig = (): { augurClient: string; blockClient: string; turboClient?: string } => {
  const { networkId } = PARA_CONFIG;
  const clientConfig = {
    "1": {
      augurClient: "https://api.thegraph.com/subgraphs/name/augurproject/augur-v2-staging",
      blockClient: "https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks",
      network: "mainnet",
    },
    "42": {
      augurClient: "https://api.thegraph.com/subgraphs/name/augurproject/augur-v2-staging",
      blockClient: "https://api.thegraph.com/subgraphs/name/blocklytics/kovan-blocks",
      turboClient: "https://api.thegraph.com/subgraphs/name/augurproject/augur-turbo-kovan",
      network: "kovan",
    },
    "80001": {
      augurClient: "https://api.thegraph.com/subgraphs/name/augurproject/augur-v2-staging",
      blockClient: "https://api.thegraph.com/subgraphs/name/x0swapsubgraph/matic-blocks", // didn't find a block for mumbai, using matic
      turboClient: "https://api.thegraph.com/subgraphs/name/augurproject/augur-turbo-mumbai-rewards",
      network: "mumbai",
      playground: "https://thegraph.com/legacy-explorer/subgraph/augurproject/augur-turbo-mumbai",
    },
    "137": {
      augurClient: "https://api.thegraph.com/subgraphs/name/augurproject/augur-v2-staging",
      blockClient: "https://api.thegraph.com/subgraphs/name/x0swapsubgraph/matic-blocks",
      turboClient: "https://api.thegraph.com/subgraphs/name/augurproject/augur-turbo-matic-staging",
      network: "matic",
    },
  };
  return clientConfig[Number(networkId)];
};

const getCashesInfo = (): Cash[] => {
  // this prob wont be used
  // const { networkId } = PARA_CONFIG;

  return [];
};
