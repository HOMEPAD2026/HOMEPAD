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
import "./HomepadFactoryPaired.sol";

/// @title HOMEPAD Paired Swap Router
/// @notice Buy/sell for HomepadFactoryPaired launches. Same settle-then-
///         swap-then-take pattern as HomepadSwapRouter, except the quote
///         side is an ERC-20 (pulled with transferFrom — approve first)
///         rather than msg.value, and the swap direction depends on which
///         side the quote token sorted to in the pool key (read from the
///         factory).
contract HomepadPairedSwapRouter is IUnlockCallback, ReentrancyGuard {
    IPoolManager public immutable poolManager;
    HomepadFactoryPaired public immutable factory;

    struct CallbackData {
        address recipient;
        address token;
        address quoteToken;
        bool quoteIsCurrency0;
        bool isBuy;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    /// @dev zeroForOne is kept in the event for frontends that already
    ///      parse the hybrid router's Swap; `isBuy` is the direction that
    ///      actually matters here.
    event Swap(address indexed trader, address indexed token, bool zeroForOne, bool isBuy, uint256 amountIn, uint256 amountOut);

    constructor(address _poolManager, address _factory) {
        poolManager = IPoolManager(_poolManager);
        factory = HomepadFactoryPaired(_factory);
    }

    /// @notice Spend `quoteAmount` of the token's quote currency for at least `minTokensOut` tokens.
    function buy(address token, uint256 quoteAmount, uint256 minTokensOut) external nonReentrant returns (uint256 amountOut) {
        require(quoteAmount > 0, "amount = 0");
        (address quote, bool quoteIs0) = _pair(token);
        require(IERC20(quote).transferFrom(msg.sender, address(this), quoteAmount), "quote transfer failed");
        bytes memory result = poolManager.unlock(abi.encode(CallbackData(msg.sender, token, quote, quoteIs0, true, quoteAmount, minTokensOut)));
        amountOut = abi.decode(result, (uint256));
        emit Swap(msg.sender, token, quoteIs0, true, quoteAmount, amountOut);
    }

    /// @notice Sell `tokenAmount` tokens for at least `minQuoteOut` of the quote currency.
    function sell(address token, uint256 tokenAmount, uint256 minQuoteOut) external nonReentrant returns (uint256 amountOut) {
        require(tokenAmount > 0, "amount = 0");
        (address quote, bool quoteIs0) = _pair(token);
        require(IERC20(token).transferFrom(msg.sender, address(this), tokenAmount), "token transfer failed");
        bytes memory result = poolManager.unlock(abi.encode(CallbackData(msg.sender, token, quote, quoteIs0, false, tokenAmount, minQuoteOut)));
        amountOut = abi.decode(result, (uint256));
        emit Swap(msg.sender, token, !quoteIs0, false, tokenAmount, amountOut);
    }

    function _pair(address token) internal view returns (address quote, bool quoteIs0) {
        quote = factory.quoteOf(token);
        require(quote != address(0), "not a paired launch");
        quoteIs0 = quote < token;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        CallbackData memory cb = abi.decode(data, (CallbackData));

        PoolKey memory key = factory.poolKeyOf(cb.token);

        // Which currency goes in / comes out for this trade.
        Currency inCur  = cb.isBuy ? (cb.quoteIsCurrency0 ? key.currency0 : key.currency1) : (cb.quoteIsCurrency0 ? key.currency1 : key.currency0);
        Currency outCur = cb.isBuy ? (cb.quoteIsCurrency0 ? key.currency1 : key.currency0) : (cb.quoteIsCurrency0 ? key.currency0 : key.currency1);
        address inErc20 = cb.isBuy ? cb.quoteToken : cb.token;
        bool zeroForOne = cb.isBuy ? cb.quoteIsCurrency0 : !cb.quoteIsCurrency0;

        // Settle the input FIRST: PoolManager's accounting expects the
        // caller to cover what it owes before taking what it's owed —
        // settling after the swap would try to pull funds the pool has
        // already paid out, which reverts.
        poolManager.sync(inCur);
        require(IERC20(inErc20).transfer(address(poolManager), cb.amountIn), "input settle transfer failed");
        poolManager.settle();

        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(cb.amountIn),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        int128 outDelta = zeroForOne ? BalanceDeltaLibrary.amount1(delta) : BalanceDeltaLibrary.amount0(delta);
        uint256 amountOut = outDelta > 0 ? uint256(uint128(outDelta)) : 0;
        require(amountOut >= cb.minAmountOut, "slippage");
        if (amountOut > 0) poolManager.take(outCur, cb.recipient, amountOut);

        // Refund any input the swap could not consume.
        int128 inDelta = zeroForOne ? BalanceDeltaLibrary.amount0(delta) : BalanceDeltaLibrary.amount1(delta);
        uint256 spent = inDelta < 0 ? uint256(uint128(-inDelta)) : 0;
        if (spent < cb.amountIn) poolManager.take(inCur, cb.recipient, cb.amountIn - spent);

        return abi.encode(amountOut);
    }
}
