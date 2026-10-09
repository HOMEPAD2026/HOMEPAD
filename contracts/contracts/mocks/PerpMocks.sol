// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// A Chainlink-style feed the tests move by hand.
contract MockAggregator {
    uint8 public decimals = 8;
    int256 public answer;
    uint256 public updatedAt;
    function set(int256 a) external { answer = a; updatedAt = block.timestamp; }
    function setAt(int256 a, uint256 t) external { answer = a; updatedAt = t; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) { return (1, answer, updatedAt, updatedAt, 1); }
}

/// ArcircleStaking.fund stand-in: takes the USDC (or refuses, like a week with no stakers).
contract MockStakingFund {
    IERC20 public immutable usdc;
    bool public refuse;
    uint256 public funded;
    constructor(IERC20 u) { usdc = u; }
    function setRefuse(bool r) external { refuse = r; }
    function fund(uint256 amount) external { require(!refuse, "NoStakers"); usdc.transferFrom(msg.sender, address(this), amount); funded += amount; }
}
