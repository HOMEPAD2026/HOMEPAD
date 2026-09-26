// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only memecoin-style token: no wallet may hold more than
///         `maxWallet` (the deployer and its own transfers out are exempt) — what the Multisender's dry
///         run and failing-row finder have to catch.
contract MockLimitToken is ERC20 {
    uint256 public immutable maxWallet;
    address public immutable owner;
    constructor(uint256 maxWallet_) ERC20("Limit", "LIM") { maxWallet = maxWallet_; owner = msg.sender; _mint(msg.sender, 1_000_000 ether); }
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to != address(0) && to != owner && from != address(0) && from != owner) require(balanceOf(to) <= maxWallet, "max wallet");
    }
}
