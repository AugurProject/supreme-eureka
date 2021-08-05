import { Address, BigInt } from "@graphprotocol/graph-ts";
import { getOrCreateMarket } from "../helpers/AmmFactoryHelper";
import { getOrCreateTeamSportsMarket } from "../helpers/MarketFactoryHelper";
import {
  MarketCreated,
  MarketResolved,
  SportsLinkMarketFactory as SportsLinkMarketFactoryContract
} from "../../generated/SportsLinkMarketFactoryV2/SportsLinkMarketFactory";

function getShareTokens(contractAddress: Address, marketId: BigInt): Array<String> {
  let contract = SportsLinkMarketFactoryContract.bind(contractAddress);
  let tryGetMarket = contract.try_getMarket(marketId);
  let rawShareTokens: Address[] = new Array<Address>();
  if (!tryGetMarket.reverted) {
    rawShareTokens = tryGetMarket.value.shareTokens;
  }
  let shareTokens: String[] = new Array<String>();
  for (let i = 0; i < rawShareTokens.length; i++) {
    shareTokens.push(rawShareTokens[i].toHexString());
  }

  return shareTokens;
}

function getInitialOdds(contractAddress: Address, marketId: BigInt): Array<BigInt> {
  let contract = SportsLinkMarketFactoryContract.bind(contractAddress);
  let tryGetMarket = contract.try_getMarket(marketId);
  let initialOdds: BigInt[] = new Array<BigInt>();
  if (!tryGetMarket.reverted) {
    initialOdds = tryGetMarket.value.initialOdds;
  }
  return initialOdds;
}

export function handleMarketCreatedEvent(event: MarketCreated): void {
  let marketId = event.address.toHexString() + "-" + event.params.id.toString();

  let entity = getOrCreateTeamSportsMarket(marketId, true, false);
  getOrCreateMarket(marketId);

  entity.marketId = marketId;
  entity.transactionHash = event.transaction.hash.toHexString();
  entity.timestamp = event.block.timestamp;
  entity.creator = event.params.creator.toHexString();
  entity.estimatedStartTime = event.params.estimatedStartTime;
  entity.endTime = event.params.endTime;
  entity.marketType = BigInt.fromI32(event.params.marketType);
  entity.eventId = event.params.eventId;
  entity.homeTeamId = event.params.homeTeamId;
  entity.awayTeamId = event.params.awayTeamId;
  entity.overUnderTotal = event.params.score;
  entity.shareTokens = getShareTokens(event.address, event.params.id);
  entity.initialOdds = getInitialOdds(event.address, event.params.id);

  entity.save();
}

export function handleMarketResolvedEvent(event: MarketResolved): void {
  let marketId = event.address.toHexString() + "-" + event.params.id.toString();

  let entity = getOrCreateTeamSportsMarket(marketId, false, false);

  if (entity) {
    entity.winner = event.params.winner.toHexString();

    entity.save();
  }
}
