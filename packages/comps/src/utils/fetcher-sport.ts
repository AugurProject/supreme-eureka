
import { Web3Provider } from "@ethersproject/providers";
import {
    MarketFactory,
    fetchInitialSports,
    instantiateMarketFactory,
    AMMFactory__factory,
    instantiateFetcher,
    SportsFetcher,
    Sport as SportMarketFactory,
} from "@augurproject/smart";

import { getProviderOrSigner } from "../components/ConnectAccount/utils";
import { decodeBaseMarketFetcher } from "./derived-market-data";

export const fetchContractData = async (config: MarketFactory, provider: Web3Provider, account: string) => {
    const offset = 0;
    const bundleSize = 1000;
    console.log(config)
    const fetcherContract = instantiateFetcher(config.type, config.subtype, config.address, getProviderOrSigner(provider, account)) as unknown as SportsFetcher;
    const marketFactoryContract = instantiateMarketFactory(
        config.type,
        config.subtype,
        config.address,
        getProviderOrSigner(provider, account)
    ) as unknown as SportMarketFactory;
    const ammFactoryContract = AMMFactory__factory.connect(config.ammFactory, getProviderOrSigner(provider, account));
    console.log('calling fetchInitialSports ....')
    
    const { factoryBundle, markets } = await fetchInitialSports(
        fetcherContract,
        marketFactoryContract,
        ammFactoryContract,
        offset,
        bundleSize,
    );

    console.log('markets', markets)
    const factoryDetails = decodeBaseMarketFetcher(factoryBundle);

    console.log('markets', markets, 'factory', factoryBundle, factoryDetails);
    return null;
    /*
    return eventBundles
        .map(createNBAStaticMarketBundle)
        .map((m) => ({ ...m, ...factoryDetails, marketFactoryType: config.type }))
        .map((m) => decodeMarketDetailsFetcher(m, factoryDetails, config));
        */
};