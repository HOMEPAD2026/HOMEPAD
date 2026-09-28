// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only stand-in for Uniswap v4's PoolManager storage reads (BuilderMine prices its fee from slot0).
contract MockExtsload {
    mapping(bytes32 => bytes32) public words;
    function set(bytes32 slot, bytes32 value) external { words[slot] = value; }
    function extsload(bytes32 slot) external view returns (bytes32) { return words[slot]; }
}
