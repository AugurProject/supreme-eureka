// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../libraries/AugurOwnable.sol";

contract OwnedERC20 is ERC20, AugurOwnable {
    constructor(
        string memory name_,
        string memory symbol_,
        address _owner
    ) ERC20(name_, symbol_) {
        owner = _owner;
    }

    function trustedTransfer(
        address _from,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        _transfer(_from, _to, _amount);
    }

    function trustedMint(address _target, uint256 _amount) external onlyOwner {
        _mint(_target, _amount);
    }

    function trustedBurn(address _target, uint256 _amount) external onlyOwner {
        _burn(_target, _amount);
    }

    function trustedBurnAll(address _target) external onlyOwner returns (uint256) {
        uint256 _balance = balanceOf(_target);
        _burn(_target, _balance);
        return _balance;
    }

    function onTransferOwnership(address, address) internal override {}
}
