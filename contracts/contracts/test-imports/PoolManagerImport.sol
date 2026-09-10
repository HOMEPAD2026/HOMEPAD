// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// This file exists only so PoolManager.sol gets compiled and gets an
// artifact — our own contracts only import IPoolManager (the interface),
// but tests need to deploy the real thing to test BondingCurveV4 against
// actual Uniswap V4 behavior instead of a hand-rolled mock.
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
