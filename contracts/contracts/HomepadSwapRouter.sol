// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @title HOMEPAD Swap Router
/// @notice A raw wallet can't call PoolManager.swap() directly — every V4
///         action has to happen inside an unlock() callback. This is the
///         thin, HOMEPAD-specific contract that does that safely for
///         instant-liquidity pools: real slippage protection (unlike
///         Uniswap's own PoolSwapTest, which is test-only and has none),
///         and a refund for any ETH a buy doesn't end up using.
///
///         Every pool created by HomepadFactoryInstant always has currency0
///         = native ETH and currency1 = the launched token (see that
///         factory), so this router only needs two functions — buy and
///         sell — rather than a general-purpose arbitrary-pair swap API.
contract HomepadSwapRouter is IUnlockCallback, ReentrancyGuard {
    IPoolManager public immutable poolManager;
    address public immutable hook;
    int24 public immutable tickSpacing;

    struct CallbackData {
        address recipient;
        address token;
        bool zeroForOne; // true = ETH -> token (buy), false = token -> ETH (sell)
        uint256 amountIn;
        uint256 minAmountOut;
    }

    event Swap(address indexed trader, address indexed token, bool zeroForOne, uint256 amountIn, uint256 amountOut);

    constructor(address _poolManager, address _hook, int24 _tickSpacing) {
        poolManager = IPoolManager(_poolManager);
        hook = _hook;
        tickSpacing = _tickSpacing;
    }

    function buy(address token, uint256 minTokensOut) external payable nonReentrant returns (uint256 amountOut) {
        require(msg.value > 0, "send ETH");
        bytes memory result = poolManager.unlock(
            abi.encode(CallbackData(msg.sender, token, true, msg.value, minTokensOut))
        );
        amountOut = abi.decode(result, (uint256));

        // Exact-input swaps can consume less than requested if the pool's
        // price limit is hit first in an illiquid pool — refund whatever's
        // left rather than let it get stranded in this contract.
        uint256 refund = address(this).balance;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            require(ok, "refund failed");
        }

        emit Swap(msg.sender, token, true, msg.value, amountOut);
    }

    function sell(address token, uint256 tokenAmount, uint256 minEthOut) external nonReentrant returns (uint256 amountOut) {
        require(tokenAmount > 0, "amount = 0");
        require(IERC20(token).transferFrom(msg.sender, address(this), tokenAmount), "token transfer failed");

        bytes memory result = poolManager.unlock(
            abi.encode(CallbackData(msg.sender, token, false, tokenAmount, minEthOut))
        );
        amountOut = abi.decode(result, (uint256));

        emit Swap(msg.sender, token, false, tokenAmount, amountOut);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        CallbackData memory cb = abi.decode(data, (CallbackData));

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(cb.token),
            fee: 0,
            tickSpacing: tickSpacing,
            hooks: IHooks(hook)
        });

        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: cb.zeroForOne,
                amountSpecified: -int256(cb.amountIn), // negative = exact input
                sqrtPriceLimitX96: cb.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        int128 amt0 = BalanceDeltaLibrary.amount0(delta);
        int128 amt1 = BalanceDeltaLibrary.amount1(delta);

        uint256 amountOut;
        if (cb.zeroForOne) {
            // We owe ETH (currency0, negative delta); we receive token (currency1, positive delta).
            uint256 owed = uint256(uint128(-amt0));
            poolManager.sync(key.currency0);
            poolManager.settle{value: owed}();
            amountOut = uint256(uint128(amt1));
            require(amountOut >= cb.minAmountOut, "slippage");
            poolManager.take(key.currency1, cb.recipient, amountOut);
        } else {
            // We owe token (currency1, negative delta); we receive ETH (currency0, positive delta).
            uint256 owed = uint256(uint128(-amt1));
            poolManager.sync(key.currency1);
            require(IERC20(cb.token).transfer(address(poolManager), owed), "token settle transfer failed");
            poolManager.settle();
            amountOut = uint256(uint128(amt0));
            require(amountOut >= cb.minAmountOut, "slippage");
            poolManager.take(key.currency0, cb.recipient, amountOut);
        }

        return abi.encode(amountOut);
    }

    receive() external payable {}
}
