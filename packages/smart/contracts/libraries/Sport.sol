// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../turbo/AbstractMarketFactoryV3.sol";
import "./LineHelper.sol";

abstract contract Sport is AbstractMarketFactoryV3, LineHelper {
    event SportsEventCreated(
        uint256 id,
        uint256[] markets,
        int256[] lines,
        uint256 homeTeamId,
        uint256 awayTeamId,
        string homeTeamName,
        string awayTeamName,
        uint256 estimatedStartTime
    );

    enum SportsEventStatus {Unknown, Scheduled, Final, Postponed, Canceled}
    struct SportsEvent {
        SportsEventStatus status;
        uint256[] markets;
        int256[] lines;
        uint256 estimatedStartTime;
        uint256 homeTeamId;
        uint256 awayTeamId;
        string homeTeamName;
        string awayTeamName;
        uint256 homeScore;
        uint256 awayScore;
    }
    // EventId => EventDetails
    mapping(uint256 => SportsEvent) public sportsEvents;
    uint256[] public listOfSportsEvents;

    uint256 constant NoContest = 0;

    function eventCount() public view returns (uint256) {
        return listOfSportsEvents.length;
    }

    function getSportsEvent(uint256 _eventId) public view returns (SportsEvent memory) {
        return sportsEvents[_eventId];
    }

    function getSportsEventByIndex(uint256 _index) public view returns (SportsEvent memory _event, uint256 _eventId) {
        _eventId = listOfSportsEvents[_index];
        _event = getSportsEvent(_eventId);
    }

    function makeSportsEvent(
        uint256 _eventId,
        uint256[] memory _markets,
        int256[] memory _lines,
        uint256 _estimatedStartTime,
        uint256 _homeTeamId,
        uint256 _awayTeamId,
        string memory _homeTeamName,
        string memory _awayTeamName
    ) internal {
        // Cannot create markets for an event twice.
        require(sportsEvents[_eventId].status == SportsEventStatus.Unknown, "event exists");

        listOfSportsEvents.push(_eventId);
        sportsEvents[_eventId].status = SportsEventStatus.Scheduled; // new events must be Scheduled
        sportsEvents[_eventId].markets = _markets;
        sportsEvents[_eventId].lines = _lines;
        sportsEvents[_eventId].estimatedStartTime = _estimatedStartTime;
        sportsEvents[_eventId].homeTeamId = _homeTeamId;
        sportsEvents[_eventId].awayTeamId = _awayTeamId;
        sportsEvents[_eventId].homeTeamName = _homeTeamName;
        sportsEvents[_eventId].awayTeamName = _awayTeamName;
        // homeScore and awayScore default to zero, which is correct for new events

        emit SportsEventCreated(
            _eventId,
            _markets,
            _lines,
            _homeTeamId,
            _awayTeamId,
            _homeTeamName,
            _awayTeamName,
            _estimatedStartTime
        );
    }

    uint256 constant WhoWonUnknown = 0;
    uint256 constant WhoWonHome = 1;
    uint256 constant WhoWonAway = 2;
    uint256 constant WhoWonDraw = 3;

    function eventIsNoContest(
        SportsEvent memory _event,
        SportsEventStatus _eventStatus,
        uint256 _homeTeamId,
        uint256 _awayTeamId,
        uint256 _whoWon // pass in WhoWonUnknown if using a scoring sport
    ) internal pure returns (bool) {
        bool _draw = _whoWon == WhoWonDraw;
        bool _notFinal = _eventStatus != SportsEventStatus.Final;
        bool _unstableHomeTeamId = _event.homeTeamId != _homeTeamId;
        bool _unstableAwayTeamId = _event.awayTeamId != _awayTeamId;
        return _draw || _notFinal || _unstableHomeTeamId || _unstableAwayTeamId;
    }

    function resolveInvalidEvent(uint256 _eventId) internal {
        uint256[] memory _marketIds = sportsEvents[_eventId].markets;
        for (uint256 i = 0; i < _marketIds.length; i++) {
            uint256 _marketId = _marketIds[i];
            if (_marketId == 0) continue; // skip non-created markets
            endMarket(_marketId, NoContest);
        }
    }

    // TODO is this needed? getSportsEvent should do the same
    function getEventMarkets(uint256 _eventId) public view returns (uint256[] memory _markets) {
        uint256[] storage _original = sportsEvents[_eventId].markets;
        uint256 _len = _original.length;
        _markets = new uint256[](_len);
        for (uint256 i = 0; i < _len; i++) {
            _markets[i] = _original[i];
        }
    }
}

// TODO change this to work with the Fetcher contracts and use it there, since it's offchain-read-only.
abstract contract SportView is Sport {
    // Only usable off-chain. Gas cost can easily eclipse block limit.
    // Lists all events that could be resolved with a call to resolveEvent.
    // Not all will be resolvable because this does not ensure the game ended.
    function listResolvableEvents() external view returns (uint256[] memory) {
        uint256 _totalResolvable = countResolvableEvents();
        uint256[] memory _resolvableEvents = new uint256[](_totalResolvable);

        uint256 n = 0;
        for (uint256 i = 0; i < listOfSportsEvents.length; i++) {
            if (n > _totalResolvable) break;
            uint256 _eventId = listOfSportsEvents[i];
            if (isEventResolvable(_eventId)) {
                _resolvableEvents[n] = _eventId;
                n++;
            }
        }

        return _resolvableEvents;
    }

    function countResolvableEvents() internal view returns (uint256) {
        uint256 _totalResolvable = 0;
        for (uint256 i = 0; i < listOfSportsEvents.length; i++) {
            uint256 _eventId = listOfSportsEvents[i];
            if (isEventResolvable(_eventId)) {
                _totalResolvable++;
            }
        }
        return _totalResolvable;
    }

    // Returns true if a call to resolveEvent is potentially useful.
    function isEventResolvable(uint256 _eventId) internal view returns (bool) {
        uint256[] memory _markets = getEventMarkets(_eventId);

        bool _unresolved = false; // default because non-existing markets aren't resolvable
        for (uint256 i = 0; i < _markets.length; i++) {
            uint256 _marketId = _markets[i];
            if (_marketId != 0 && !isMarketResolved(_marketId)) {
                _unresolved = true;
                break;
            }
        }

        return _unresolved;
    }
}
