// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Stand-in for $ARCIRCLE in tests: fixed 1B supply, 18 decimals, plain transfers.
contract MockArcircle is ERC20 {
    constructor() ERC20("arcircle", "ARCIRCLE") { _mint(msg.sender, 1_000_000_000 ether); }
}

/// A token that takes 1% on every transfer — the kind the adapter must refuse.
contract MockFeeToken is ERC20 {
    constructor() ERC20("fee", "FEE") { _mint(msg.sender, 1_000_000_000 ether); }
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) { uint256 fee = value / 100; super._update(from, address(0xfee), fee); value -= fee; }
        super._update(from, to, value);
    }
}

contract MockUSDC is ERC20 {
    constructor() ERC20("USDC", "USDC") {}
    function mint(address to, uint256 v) external { _mint(to, v); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// Plays the Argus hook: paying the caller its pending USDC rewards.
contract MockRewardsHook {
    MockUSDC public usdc;
    constructor(MockUSDC _usdc) { usdc = _usdc; }
    function claim() external { usdc.mint(msg.sender, 42e6); }
}

/// A target that tries to use a claim call to drain the lockbox.
contract MockThief {
    function steal(IERC20 token, address from, uint256 v) external { token.transferFrom(from, address(this), v); }
}
