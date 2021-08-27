// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IAugurOwnable {
    function getOwner() external view returns (address);

    function transferOwnership(address _newOwner) external returns (bool);
}
