// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

// MasterChef is the master of Reward. He can make Reward and he is a fair guy.
contract MasterChef is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant BONE = 10**18;

    // The percentage of the rewards period that early deposit bonus will payout.
    // e.g. Early deposit bonus hits if LP is done in the first x percent of the period.
    uint256 public constant EARLY_DEPOSIT_BONUS_REWARDS_PERCENTAGE = BONE / 10; // 10% of reward period.

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 lastActionTimestamp; // Timestamp of the withdrawal or deposit from this user.
        //
        // We do some fancy math here. Basically, any point in time, the amount of REWARDs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accRewardsPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accRewardsPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each user that deposits LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 accRewardsPerShare; // Accumulated REWARDs per share, times BONE. See below.
        uint256 totalEarlyDepositBonusRewardShares; // The total number of share currently qualifying bonus REWARDs.
        uint256 beginTimestamp; // The timestamp to begin calculating rewards at.
        uint256 earlyDepositBonusRewards; // Amount of REWARDs to distribute to early depositors.
        uint256 lastRewardTimestamp; // Last timestamp REWARDs distribution occurred.
        uint256 rewardsPeriods; // Number of days the rewards for this pool will payout.
        uint256 rewardsPerPeriod; // Amount of rewards to be given out for a given period.
    }
    // Info of each pool.
    PoolInfo[] public poolInfo;

    struct PendingRewardInfo {
        uint256 beginTimestamp;
        uint256 endTimestamp;
        uint256 earlyDepositEndTimestamp;
        uint256 accruedStandardRewards;
        uint256 accruedEarlyDepositBonusRewards;
        uint256 pendingEarlyDepositBonusRewards;
    }

    struct MarketFactoryInfo {
        uint256 earlyDepositBonusRewards; // Amount of REWARDs to distribute to early depositors.
        uint256 rewardsPeriods; // Number of days the rewards for this pool will payout.
        uint256 rewardsPerPeriod; // Amount of rewards to be given out for a given period.
    }
    mapping(address => MarketFactoryInfo) marketFactoryRewardInfo;

    // The REWARD TOKEN!
    IERC20 private rewardsToken;

    mapping(address => bool) private approvedAMMFactories;

    modifier onlyApprovedAMMFactories() {
        require(approvedAMMFactories[msg.sender], "Caller must be approved.");
        _;
    }

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event TrustMarketFactory(
        address indexed MarketFactory,
        uint256 OriginEarlyDepositBonusRewards,
        uint256 OriginrewardsPeriods,
        uint256 OriginRewardsPerPeriod,
        uint256 EarlyDepositBonusRewards,
        uint256 rewardsPeriods,
        uint256 RewardsPerPeriod
    );

    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(IERC20 _rewardsToken) {
        rewardsToken = _rewardsToken;
    }

    function trustAMMFactory(address _ammFactory) public onlyOwner {
        approvedAMMFactories[_ammFactory] = true;
    }

    function untrustAMMFactory(address _ammFactory) public onlyOwner {
        delete approvedAMMFactories[_ammFactory];
    }

    // This method can also be used to update rewards
    function addRewards(
        address _marketFactory,
        uint256 _rewardsPerMarket,
        uint256 _rewardDaysPerMarket,
        uint256 _earlyDepositBonusRewards
    ) public {
        MarketFactoryInfo memory _oldMarketFactoryInfo = marketFactoryRewardInfo[_marketFactory];

        marketFactoryRewardInfo[_marketFactory] = MarketFactoryInfo({
            rewardsPeriods: _rewardDaysPerMarket,
            rewardsPerPeriod: _rewardsPerMarket,
            earlyDepositBonusRewards: _earlyDepositBonusRewards
        });

        emit TrustMarketFactory(
            _marketFactory,
            _oldMarketFactoryInfo.earlyDepositBonusRewards,
            _oldMarketFactoryInfo.rewardsPeriods,
            _oldMarketFactoryInfo.rewardsPerPeriod,
            _earlyDepositBonusRewards,
            _rewardDaysPerMarket,
            _rewardsPerMarket
        );
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(address _marketFactory, IERC20 _lpToken) public onlyApprovedAMMFactories returns (uint256 _nextPID) {
        _nextPID = poolInfo.length;
        MarketFactoryInfo memory _marketFactoryInfo = marketFactoryRewardInfo[_marketFactory];
        poolInfo.push(
            PoolInfo({
                accRewardsPerShare: 0,
                beginTimestamp: block.timestamp,
                totalEarlyDepositBonusRewardShares: 0,
                earlyDepositBonusRewards: _marketFactoryInfo.earlyDepositBonusRewards,
                lpToken: _lpToken,
                rewardsPeriods: _marketFactoryInfo.rewardsPeriods,
                rewardsPerPeriod: _marketFactoryInfo.rewardsPerPeriod,
                lastRewardTimestamp: block.timestamp
            })
        );
    }

    // Return percentage of period that has elapsed in terms of BONE.
    function getPercentageOfRewardsForPeriod(uint256 _pid) public view returns (uint256) {
        PoolInfo storage _pool = poolInfo[_pid];
        uint256 _fromTimestamp = block.timestamp;

        if (
            // Rewards have not started yet.
            _pool.beginTimestamp > _fromTimestamp ||
            // Not sure how this happens but it is accounted for in the original master chef contract.
            _pool.lastRewardTimestamp > _fromTimestamp ||
            // No rewards to be distributed
            _pool.rewardsPerPeriod == 0 ||
            // No rewards to be distributed
            _pool.rewardsPeriods == 0
        ) {
            return 0;
        }

        uint256 _rewardsPeriodsInSeconds = _pool.rewardsPeriods * 1 days;
        uint256 _rewardPeriodEndTimestamp = _rewardsPeriodsInSeconds + _pool.beginTimestamp + 1;

        // Rewards are over for this pool. No more rewards have accrued.
        if (_pool.lastRewardTimestamp >= _rewardPeriodEndTimestamp) {
            return 0;
        }

        uint256 _timeElapsed = min(_fromTimestamp, _rewardPeriodEndTimestamp).sub(_pool.lastRewardTimestamp);

        return (_timeElapsed * BONE) / _rewardsPeriodsInSeconds;
    }

    function getUserAmount(uint256 _pid, address _user) external view returns (uint256) {
        return userInfo[_pid][_user].amount;
    }

    function getPoolRewardEndTimestamp(uint256 _pid) public view returns (uint256) {
        PoolInfo storage _pool = poolInfo[_pid];
        uint256 _rewardsPeriodsInSeconds = _pool.rewardsPeriods * 1 days + 1;
        return _rewardsPeriodsInSeconds + _pool.beginTimestamp;
    }

    // View function to see pending REWARDs on frontend.
    function getPendingRewardInfo(uint256 _pid, address _user)
        external
        view
        returns (PendingRewardInfo memory _pendingRewardInfo)
    {
        PoolInfo storage _pool = poolInfo[_pid];
        UserInfo storage _user = userInfo[_pid][_user];
        uint256 accRewardsPerShare = _pool.accRewardsPerShare;
        uint256 lpSupply = _pool.lpToken.balanceOf(address(this));
        uint256 _earlyDepositRewards = 0;

        _pendingRewardInfo.endTimestamp = _pool.rewardsPeriods * 1 days;
        _pendingRewardInfo.earlyDepositEndTimestamp =
            ((_pendingRewardInfo.endTimestamp * EARLY_DEPOSIT_BONUS_REWARDS_PERCENTAGE) / BONE) +
            _pool.beginTimestamp +
            1;

        if (_pool.totalEarlyDepositBonusRewardShares > 0 && block.timestamp > _pendingRewardInfo.endTimestamp) {
            _pendingRewardInfo.accruedEarlyDepositBonusRewards = _pool.earlyDepositBonusRewards.mul(_user.amount).div(
                _pool.totalEarlyDepositBonusRewardShares
            );
        } else if (_pool.totalEarlyDepositBonusRewardShares > 0) {
            _pendingRewardInfo.pendingEarlyDepositBonusRewards = _pool.earlyDepositBonusRewards.mul(_user.amount).div(
                _pool.totalEarlyDepositBonusRewardShares
            );
        }

        if (block.timestamp > _pool.lastRewardTimestamp && lpSupply != 0) {
            uint256 multiplier = getPercentageOfRewardsForPeriod(_pid);
            accRewardsPerShare = accRewardsPerShare.add(multiplier.mul(_pool.rewardsPerPeriod).div(lpSupply));
        }

        _pendingRewardInfo.accruedStandardRewards = _user
            .amount
            .mul(accRewardsPerShare)
            .div(BONE)
            .sub(_user.rewardDebt)
            .add(_earlyDepositRewards);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.timestamp <= pool.lastRewardTimestamp) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardTimestamp = block.timestamp;
            return;
        }
        uint256 multiplier = getPercentageOfRewardsForPeriod(_pid);
        pool.accRewardsPerShare = pool.accRewardsPerShare.add(multiplier.mul(pool.rewardsPerPeriod).div(lpSupply));
        pool.lastRewardTimestamp = block.timestamp;
    }

    // Deposit LP tokens to MasterChef for REWARD allocation.
    function depositInternal(
        address _userAddress,
        uint256 _pid,
        uint256 _amount
    ) internal {
        PoolInfo storage _pool = poolInfo[_pid];
        UserInfo storage _user = userInfo[_pid][_userAddress];

        updatePool(_pid);

        if (_user.amount > 0) {
            uint256 pending = _user.amount.mul(_pool.accRewardsPerShare).div(BONE).sub(_user.rewardDebt);
            safeRewardsTransfer(_userAddress, pending);
        }

        uint256 _rewardsPeriodsInSeconds = _pool.rewardsPeriods * 1 days;
        uint256 _bonusrewardsPeriodsEndTimestamp =
            ((_rewardsPeriodsInSeconds * EARLY_DEPOSIT_BONUS_REWARDS_PERCENTAGE) / BONE) + _pool.beginTimestamp + 1;
        uint256 _rewardPeriodEndTimestamp = _rewardsPeriodsInSeconds + _pool.beginTimestamp + 1;

        // If the user was an early deposit, remove user amount from the pool.
        // Even if the pools reward period has elapsed. They must withdraw first.
        if (
            block.timestamp > _bonusrewardsPeriodsEndTimestamp &&
            _user.lastActionTimestamp <= _bonusrewardsPeriodsEndTimestamp
        ) {
            _pool.totalEarlyDepositBonusRewardShares = _pool.totalEarlyDepositBonusRewardShares.sub(_user.amount);
        }

        // Still in the early deposit bonus period.
        if (_bonusrewardsPeriodsEndTimestamp > block.timestamp) {
            _pool.totalEarlyDepositBonusRewardShares = _pool.totalEarlyDepositBonusRewardShares.add(_amount);
        }

        _pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
        _user.amount = _user.amount.add(_amount);

        _user.rewardDebt = _user.amount.mul(_pool.accRewardsPerShare).div(BONE);
        _user.lastActionTimestamp = block.timestamp;
        emit Deposit(_userAddress, _pid, _amount);
    }

    function deposit(uint256 _pid, uint256 _amount) public {
        depositInternal(msg.sender, _pid, _amount);
    }

    // Allows approved contracts to deposit on behalf of a user.
    function trustedDeposit(
        address _user,
        uint256 _pid,
        uint256 _amount
    ) public onlyApprovedAMMFactories {
        depositInternal(_user, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdrawInternal(
        address _userAddress,
        uint256 _pid,
        uint256 _amount
    ) internal {
        PoolInfo storage _pool = poolInfo[_pid];
        UserInfo storage _user = userInfo[_pid][_userAddress];
        require(_user.amount >= _amount, "withdraw: not good");

        updatePool(_pid);

        uint256 _rewardsPeriodsInSeconds = _pool.rewardsPeriods * 1 days;
        uint256 _bonusrewardsPeriodsEndTimestamp =
            ((_rewardsPeriodsInSeconds * EARLY_DEPOSIT_BONUS_REWARDS_PERCENTAGE) / BONE) + _pool.beginTimestamp + 1;
        uint256 _rewardPeriodEndTimestamp = _rewardsPeriodsInSeconds + _pool.beginTimestamp + 1;

        if (_rewardPeriodEndTimestamp <= block.timestamp) {
            if (_pool.totalEarlyDepositBonusRewardShares > 0) {
                uint256 _rewardsToUser =
                    _pool.earlyDepositBonusRewards.mul(_amount).div(_pool.totalEarlyDepositBonusRewardShares);
                safeRewardsTransfer(_userAddress, _rewardsToUser);
            }
        } else if (_bonusrewardsPeriodsEndTimestamp >= block.timestamp) {
            // Still in the early deposit bonus period.
            _pool.totalEarlyDepositBonusRewardShares = _pool.totalEarlyDepositBonusRewardShares.sub(_amount);
        } else if (
            // If the user was an early deposit, remove user amount from the pool.
            _bonusrewardsPeriodsEndTimestamp >= _user.lastActionTimestamp
        ) {
            _pool.totalEarlyDepositBonusRewardShares = _pool.totalEarlyDepositBonusRewardShares.sub(_user.amount);
        }

        uint256 pending = _user.amount.mul(_pool.accRewardsPerShare).div(BONE).sub(_user.rewardDebt);
        safeRewardsTransfer(_userAddress, pending);
        _user.amount = _user.amount.sub(_amount);
        _user.rewardDebt = _user.amount.mul(_pool.accRewardsPerShare).div(BONE);
        _user.lastActionTimestamp = block.timestamp;
        _pool.lpToken.safeTransfer(msg.sender, _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid, uint256 _amount) public {
        withdrawInternal(msg.sender, _pid, _amount);
    }

    function trustedWithdraw(
        address _user,
        uint256 _pid,
        uint256 _amount
    ) public onlyApprovedAMMFactories {
        withdrawInternal(_user, _pid, _amount);
    }

    function withdrawRewards(uint256 _amount) external onlyOwner {
        rewardsToken.transfer(msg.sender, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
        user.lastActionTimestamp = 0;
    }

    function safeRewardsTransfer(address _to, uint256 _amount) internal {
        uint256 _rewardsBal = rewardsToken.balanceOf(address(this));
        if (_amount > _rewardsBal) {
            rewardsToken.transfer(_to, _rewardsBal);
        } else {
            rewardsToken.transfer(_to, _amount);
        }
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a <= b) {
            return a;
        } else {
            return b;
        }
    }
}
