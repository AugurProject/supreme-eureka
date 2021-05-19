# Turbo Subgraph

This subgraph is available at https://thegraph.com/explorer/subgraph/AugurProject/turbo-kovan/.

For more information on how TheGraph works, see the docs on https://thegraph.com/docs/.

## How to deploy

In order to deploy the graph to Mumbai (Matic/Polygon Testnet), you need to follow these steps from the root of the project:

```text
1. yarn smart generate:environments
2. yarn subgraph prepare:abis
3. yarn subgraph prepare:mumbai
4. yarn subgraph codegen
5. You need to authenticate the access token (need to do this only once)
6. yarn subgraph deploy:mumbai
```

For Matic/Polygon Mainnet

```text
1. yarn smart generate:environments
2. yarn subgraph prepare:abis
3. yarn subgraph prepare:matic
4. yarn subgraph codegen
5. You need to authenticate the access token (need to do this only once)
6. yarn subgraph deploy:matic
```

## How to test for errors

There is a bug in TheGraph's webpage that will not show the error stacktrace. If that happens, you can find out the error logs using `curl and running the following commands: 
```text
Error logs for current subgraph version:
curl --location --request POST 'https://api.thegraph.com/index-node/graphql'  --data-raw '{"query":"{ indexingStatusForCurrentVersion(subgraphName: \"augurproject/augur-turbo-kovan\") { subgraph fatalError { message } nonFatalErrors {message } } }"}'

Error logs for pending subgraph version:
curl --location --request POST 'https://api.thegraph.com/index-node/graphql'  --data-raw '{"query":"{ indexingStatusForPendingVersion(subgraphName: \"augurproject/augur-turbo-kovan\") { subgraph fatalError { message } nonFatalErrors {message } } }"}'
```