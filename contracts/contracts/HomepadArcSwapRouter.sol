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
import "./HomepadFactoryArc.sol";

/// @title ARCPAD Swap Router (HomepadFactoryArc)
/// @notice Buy/sell for HomepadFactoryArc launches on Circle's Arc chain.
///         This is HomepadPairedSwapRouter's exact mechanics, retargeted at
///         HomepadFactoryArc instead of HomepadFactoryPaired — the deploy
///         script for the Arc factory explicitly noted no router existed
///         yet for it ("public routers don't route through hooked pools").
///         Both factories expose the same `quoteOf`/`poolKeyOf` shape, so
///         the settle-then-swap-then-take pattern carries over unchanged;
///         the quote side is always an ERC-20 (pulled with transferFrom —
///         approve first), same as Paired. Works whether the quote token
///         is Arc's native-USDC ERC-20 predeploy (0x3600...0000, 6
///         decimals) or any other ERC-20 quote a launch chose.
contract HomepadArcSwapRouter is IUnlockCallback, ReentrancyGuard {
    IPoolManager public immutable poolManager;
    HomepadFactoryArc public immutable factory;

    struct CallbackData {
        address recipient;
        address token;
        address quoteToken;
        bool quoteIsCurrency0;
        bool isBuy;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    event Swap(address indexed trader, address indexed token, bool zeroForOne, bool isBuy, uint256 amountIn, uint256 amountOut);

    constructor(address _poolManager, address _factory) {
        poolManager = IPoolManager(_poolManager);
        factory = HomepadFactoryArc(_factory);
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
        require(quote != address(0), "not an arc launch");
        quoteIs0 = quote < token;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        CallbackData memory cb = abi.decode(data, (CallbackData));

        PoolKey memory key = factory.poolKeyOf(cb.token);

        Currency inCur  = cb.isBuy ? (cb.quoteIsCurrency0 ? key.currency0 : key.currency1) : (cb.quoteIsCurrency0 ? key.currency1 : key.currency0);
        Currency outCur = cb.isBuy ? (cb.quoteIsCurrency0 ? key.currency1 : key.currency0) : (cb.quoteIsCurrency0 ? key.currency0 : key.currency1);
        address inErc20 = cb.isBuy ? cb.quoteToken : cb.token;
        bool zeroForOne = cb.isBuy ? cb.quoteIsCurrency0 : !cb.quoteIsCurrency0;

        // Settle the input FIRST — same ordering requirement as the Paired
        // router: PoolManager expects what's owed to be covered before it
        // pays out what it owes.
        poolManager.sync(inCur);
        uint256 beforePm = IERC20(inErc20).balanceOf(address(poolManager));
        require(IERC20(inErc20).transfer(address(poolManager), cb.amountIn), "input settle transfer failed");
        // Measure what actually landed rather than trusting the nominal
        // amount — same fee-on-transfer safety HomepadFactoryArc itself
        // applies, kept consistent here since a launch's quote token isn't
        // guaranteed plain (Arc's own USDC predeploy is untaxed, but a
        // launch can point at any ERC-20).
        uint256 settledIn = IERC20(inErc20).balanceOf(address(poolManager)) - beforePm;
        poolManager.settle();

        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(settledIn),
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
        if (spent < settledIn) poolManager.take(inCur, cb.recipient, settledIn - spent);

        return abi.encode(amountOut);
    }
}
