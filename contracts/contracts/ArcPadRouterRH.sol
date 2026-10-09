// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import "./ArcPadFactoryRH.sol";

/// @title ArcPad Router (Robinhood Chain) — buy and sell ArcPad's ETH-paired coins
/// @notice buy(): send ETH, get the coin. sell(): approve the coin, get ETH. Every swap goes through the coin's own
///         Uniswap v4 pool (with its HomepadHybridHook fee), straight to the caller; nothing is kept here.
contract ArcPadRouterRH is IUnlockCallback, ReentrancyGuard {
    IPoolManager public immutable poolManager;
    ArcPadFactoryRH public immutable factory;

    struct CallbackData {
        address recipient;
        address token;
        bool isBuy;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    event Swap(address indexed trader, address indexed token, bool isBuy, uint256 amountIn, uint256 amountOut);

    constructor(address _poolManager, address _factory) {
        poolManager = IPoolManager(_poolManager);
        factory = ArcPadFactoryRH(_factory);
    }

    /// @notice Spend msg.value ETH for at least `minTokensOut` of `token`.
    function buy(address token, uint256 minTokensOut) external payable nonReentrant returns (uint256 amountOut) {
        require(msg.value > 0, "send ETH");
        require(factory.launchIndexOf(token) != 0, "not an ArcPad coin");
        amountOut = abi.decode(poolManager.unlock(abi.encode(CallbackData(msg.sender, token, true, msg.value, minTokensOut))), (uint256));
    }

    /// @notice Sell `tokenAmount` of `token` (approve this router first) for at least `minEthOut` ETH.
    function sell(address token, uint256 tokenAmount, uint256 minEthOut) external nonReentrant returns (uint256 amountOut) {
        require(tokenAmount > 0, "amount = 0");
        require(factory.launchIndexOf(token) != 0, "not an ArcPad coin");
        require(IERC20(token).transferFrom(msg.sender, address(this), tokenAmount), "token transfer failed");
        amountOut = abi.decode(poolManager.unlock(abi.encode(CallbackData(msg.sender, token, false, tokenAmount, minEthOut))), (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        CallbackData memory cb = abi.decode(data, (CallbackData));
        PoolKey memory key = factory.poolKeyOf(cb.token);
        // ETH is currency0: a buy is zeroForOne
        Currency inCur = cb.isBuy ? key.currency0 : key.currency1;
        Currency outCur = cb.isBuy ? key.currency1 : key.currency0;
        poolManager.sync(inCur);
        if (cb.isBuy) {
            poolManager.settle{value: cb.amountIn}();
        } else {
            require(IERC20(cb.token).transfer(address(poolManager), cb.amountIn), "input settle failed");
            poolManager.settle();
        }
        BalanceDelta d = poolManager.swap(key, SwapParams({
            zeroForOne: cb.isBuy,
            amountSpecified: -int256(cb.amountIn),
            sqrtPriceLimitX96: cb.isBuy ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        }), "");
        int128 outD = cb.isBuy ? BalanceDeltaLibrary.amount1(d) : BalanceDeltaLibrary.amount0(d);
        int128 inD = cb.isBuy ? BalanceDeltaLibrary.amount0(d) : BalanceDeltaLibrary.amount1(d);
        uint256 amountOut = outD > 0 ? uint256(uint128(outD)) : 0;
        require(amountOut >= cb.minAmountOut, "slippage: less than minAmountOut");
        if (amountOut > 0) poolManager.take(outCur, cb.recipient, amountOut);
        uint256 spent = inD < 0 ? uint256(uint128(-inD)) : 0;
        if (spent < cb.amountIn) poolManager.take(inCur, cb.recipient, cb.amountIn - spent);
        emit Swap(cb.recipient, cb.token, cb.isBuy, spent, amountOut);
        return abi.encode(amountOut);
    }

    receive() external payable {
        require(msg.sender == address(poolManager), "no direct ETH");
    }
}
