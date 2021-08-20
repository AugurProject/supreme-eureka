// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../libraries/IERC20Full.sol";
import "../balancer/BPool.sol";
import "./AbstractMarketFactoryV3.sol";
import "./FeePot.sol";
import "../libraries/SafeMathInt256.sol";
<<<<<<< HEAD
import "../libraries/various.sol";
=======
import "../libraries/Sport.sol";
import "../libraries/HasHeadToHeadMarket.sol";
import "../libraries/HasSpreadMarket.sol";
import "../libraries/HasOverUnderMarket.sol";
import "../libraries/ResolveByScore.sol";
import "../libraries/Versioned.sol";
>>>>>>> robert/nfl-ncaa

// NFL is standard except ties are fine: they become NoContestOrDraw.
// As a consequence, half points are not added to the lines.
contract NFLMarketFactory is
    AbstractMarketFactoryV3,
<<<<<<< HEAD
    EventualView,
    Facing,
    Spreadable,
    Hurdlable,
    UsesScores,
=======
    SportView,
    HasHeadToHeadMarket,
    HasSpreadMarket,
    HasOverUnderMarket,
    ResolvesByScore,
>>>>>>> robert/nfl-ncaa
    Versioned
{
    using SafeMathUint256 for uint256;
    using SafeMathInt256 for int256;

    uint256 constant HeadToHead = 0;
    uint256 constant Spread = 1;
    uint256 constant OverUnder = 2;

    constructor(
        address _owner,
        IERC20Full _collateral,
        uint256 _shareFactor,
        FeePot _feePot,
        uint256[3] memory _fees,
        address _protocol,
        address _linkNode
    )
        AbstractMarketFactoryV3(_owner, _collateral, _shareFactor, _feePot, _fees, _protocol)
        Versioned("v1.2.0")
<<<<<<< HEAD
        Linked(_linkNode)
        Facing(HeadToHead, "No Contest / Draw")
        Spreadable(Spread, "No Contest")
        Hurdlable(OverUnder, "No Contest")
=======
        ManagedByLink(_linkNode)
        HasHeadToHeadMarket(HeadToHead, "No Contest / Draw")
        HasSpreadMarket(Spread, "No Contest")
        HasOverUnderMarket(OverUnder, "No Contest")
>>>>>>> robert/nfl-ncaa
    {}

    function createEvent(
        uint256 _eventId,
        string memory _homeTeamName,
        uint256 _homeTeamId,
        string memory _awayTeamName,
        uint256 _awayTeamId,
        uint256 _startTimestamp,
        int256 _homeSpread,
        int256 _totalScore,
        int256[2] memory _moneylines // [home,away]
    ) public onlyLinkNode returns (uint256[] memory _marketIds) {
        // Cannot create markets for an event twice.
        require(sportsEvents[_eventId].status == SportsEventStatus.Unknown);

        _marketIds = makeMarkets(_moneylines, _homeTeamName, _awayTeamName);
        makeSportsEvent(
            _eventId,
            _marketIds,
            build3Lines(_homeSpread, _totalScore),
            _startTimestamp,
            _homeTeamId,
            _awayTeamId,
            _homeTeamName,
            _awayTeamName
        );
    }

    function makeMarkets(
        int256[2] memory _moneylines,
        string memory _homeTeamName,
        string memory _awayTeamName
    ) internal returns (uint256[] memory _marketIds) {
        _marketIds = new uint256[](3);

        _marketIds[HeadToHead] = makeHeadToHeadMarket(_moneylines, _homeTeamName, _awayTeamName);
        _marketIds[Spread] = makeSpreadMarket(_homeTeamName, _awayTeamName);
        _marketIds[OverUnder] = makeOverUnderMarket();
    }

    function resolveValidEvent(
        SportsEvent memory _event,
        uint256 _homeScore,
        uint256 _awayScore
    ) internal override {
        resolveHeadToHeadMarket(_event.markets[HeadToHead], _homeScore, _awayScore);
        resolveSpreadMarket(_event.markets[Spread], _event.lines[Spread], _homeScore, _awayScore);
        resolveOverUnderMarket(_event.markets[OverUnder], _event.lines[Spread], _homeScore, _awayScore);
    }
}
