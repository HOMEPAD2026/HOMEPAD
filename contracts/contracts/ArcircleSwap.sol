// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";

/// who swaps without the fee (ArcircleFeeBurn: holders of enough $ARCIRCLE)
interface ISwapFeePolicy {
    function feeFree(address who) external view returns (bool);
}

/// ArcircleFeeBurn: `flush(arcircle)` burns its share of the $ARCIRCLE it holds and sends the rest to the treasury
interface ISwapFeeBurn {
    function flush(address token) external;
}

/// @title ARCIRCLE Swap — buy and sell any Arc token that has a Uniswap v4 pool, paying with $ARCIRCLE, USDC or any
///        other token, in one transaction
/// @notice A route is up to three Uniswap v4 pools on Arc's PoolManager, e.g. $ARCIRCLE → USDC → a coin: the first
///         pool sells what you pay with, each next pool sells what the one before it bought, and the last one buys the
///         token you want. Everything happens inside one PoolManager unlock, so a route either completes at your
///         `minOut` or better, or nothing moves.
///
///         The fee is `feeBps` (fixed at deployment, never above 0.3%) of the route, taken in $ARCIRCLE wherever the
///         route touches $ARCIRCLE, else in USDC wherever it touches USDC, else in the token you receive — and it goes to
///         `feeTo`, ArcircleFeeBurn:
///           • $ARCIRCLE fees are flushed in the same transaction: ArcircleFeeBurn burns its share at once (to 0x…dEaD)
///             and passes the rest to the ARCIRCLE PAD treasury;
///           • USDC fees wait in ArcircleFeeBurn for its hourly `burn`, which buys $ARCIRCLE with its share and burns it;
///           • any other token goes to the treasury.
///         Whoever `feePolicy` says is fee-free (holders of enough $ARCIRCLE) pays nothing; the policy can only waive the
///         fee, never raise it.
///
///         Non-custodial: the contract only holds tokens for the length of one swap, and it returns whatever a pool
///         didn't use (the fee is worked out on what went into the route, so a pool too thin to take all of it still
///         charges the fee on the whole amount). Tokens are pulled with a plain approval to this contract. Anything
///         sent to the contract outside a swap can be `sweep`t to `feeTo` by anyone.
///         Not routed: pools that pay in the chain's native currency (currency address 0 — Arc's pools trade USDC's
///         ERC-20 interface), and tokens that tax their own transfers (such a swap reverts; a pool hook's tax is fine).
///         No owner, no admin, no pause, no upgrades.
contract ArcircleSwap is IUnlockCallback {
    using SafeERC20 for IERC20;
    using TransientStateLibrary for IPoolManager;

    uint256 public constant MAX_HOPS = 3;
    uint256 public constant MAX_FEE_BPS = 30; // 0.3%

    IPoolManager public immutable poolManager;
    address public immutable usdc;
    address public immutable arcircle;
    address public immutable feeTo; // ArcircleFeeBurn
    ISwapFeePolicy public immutable feePolicy; // address(0) = everyone pays the fee
    uint256 public immutable feeBps;

    uint256 public swaps; // completed swaps
    uint256 public flushes; // swaps whose $ARCIRCLE fee was burned in the same transaction
    mapping(address => uint256) public feesIn; // fee token → everything sent to feeTo

    uint256 private lock = 1;

    event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address feeToken, uint256 fee, uint8 hops, address to);

    error ZeroAddress();
    error BadFee();
    error BadPath();
    error Expired();
    error Reentered();
    error NativeNotSupported();
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 out, uint256 fee, uint256 feeAt);
    error NoOutput();
    error Overdrawn(address token);
    error TaxedToken(address token);

    modifier once() {
        if (lock != 1) revert Reentered();
        lock = 2;
        _;
        lock = 1;
    }

    constructor(IPoolManager _poolManager, address _usdc, address _arcircle, address _feeTo, ISwapFeePolicy _feePolicy, uint256 _feeBps) {
        if (address(_poolManager) == address(0) || _usdc == address(0) || _arcircle == address(0) || _feeTo == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert BadFee();
        poolManager = _poolManager;
        usdc = _usdc;
        arcircle = _arcircle;
        feeTo = _feeTo;
        feePolicy = _feePolicy;
        feeBps = _feeBps;
    }

    // ------------------------------------------------------------------ views

    /// @notice The fee on `amount` for `who`: `feeBps`, or nothing if the fee policy says they're fee-free. A policy that
    ///         reverts or runs out of its gas never blocks a swap — the fee is simply charged.
    function feeOf(address who, uint256 amount) public view returns (uint256) {
        return _fee(_free(who), amount);
    }

    function _free(address who) internal view returns (bool) {
        if (address(feePolicy) == address(0)) return false;
        (bool ok, bytes memory r) = address(feePolicy).staticcall{gas: 60_000}(abi.encodeCall(ISwapFeePolicy.feeFree, (who)));
        return ok && r.length >= 32 && abi.decode(r, (bool));
    }

    function _fee(bool free, uint256 amount) internal view returns (uint256) {
        return free ? 0 : (amount * feeBps) / 10_000;
    }

    /// @notice The tokens a route passes through (`tokens[0]` = what you pay with, the last = what you receive) and
    ///         where the fee is taken (an index into `tokens`). Reverts on a route that can't be swapped.
    function routeOf(PoolKey[] calldata path, address tokenIn) public view returns (address[] memory tokens, uint256 feeAt) {
        uint256 n = path.length;
        if (n == 0 || n > MAX_HOPS || tokenIn == address(0)) revert BadPath();
        tokens = new address[](n + 1);
        tokens[0] = tokenIn;
        for (uint256 i; i < n; ++i) {
            address c0 = Currency.unwrap(path[i].currency0);
            address c1 = Currency.unwrap(path[i].currency1);
            if (c0 == address(0) || c1 == address(0)) revert NativeNotSupported();
            address next = c0 == tokens[i] ? c1 : c1 == tokens[i] ? c0 : address(0);
            if (next == address(0)) revert BadPath();
            for (uint256 j; j <= i; ++j) if (tokens[j] == next) revert BadPath(); // no token twice
            tokens[i + 1] = next;
        }
        feeAt = n; // the token you receive, unless the route touches $ARCIRCLE or USDC
        for (uint256 j; j <= n; ++j) if (tokens[j] == arcircle) return (tokens, j);
        for (uint256 j; j <= n; ++j) if (tokens[j] == usdc) return (tokens, j);
    }

    /// @notice What `amountIn` of `tokenIn` brings through `path` right now for `payer`, after the fee (and the fee).
    ///         Always reverts with QuoteResult(out, fee, feeAt) — read it with eth_call. A token's own transfer tax isn't
    ///         in it; a pool hook's is.
    function quote(PoolKey[] calldata path, address tokenIn, uint256 amountIn, address payer) external {
        (address[] memory tokens, uint256 feeAt) = routeOf(path, tokenIn);
        if (amountIn == 0) revert BadPath();
        poolManager.unlock(abi.encode(true, _free(payer), path, tokens, amountIn, feeAt));
    }

    /// @notice Sends whatever this contract holds of `token` to `feeTo`. It holds nothing between swaps, so anything
    ///         here was sent to it by mistake; anyone can call this.
    function sweep(address token) external once {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).safeTransfer(feeTo, bal);
    }

    // ------------------------------------------------------------------ swap

    /// @notice Swaps `amountIn` of `tokenIn` through `path` and sends at least `minOut` of the last token to `to`
    ///         (address(0) = the caller), before `deadline` (0 = no deadline). Approve this contract for `tokenIn` first.
    function swap(PoolKey[] calldata path, address tokenIn, uint256 amountIn, uint256 minOut, address to, uint256 deadline) external once returns (uint256 out) {
        if (deadline != 0 && block.timestamp > deadline) revert Expired();
        if (amountIn == 0) revert BadPath();
        if (to == address(0)) to = msg.sender;
        (address[] memory tokens, uint256 feeAt) = routeOf(path, tokenIn);
        uint256 n = tokens.length;
        uint256[] memory b0 = new uint256[](n);
        for (uint256 j; j < n; ++j) b0[j] = IERC20(tokens[j]).balanceOf(address(this));
        // fee-free or not is decided before the input leaves the wallet (paying with $ARCIRCLE lowers the balance)
        bool free = _free(msg.sender);
        // what actually arrived (a token with a transfer tax delivers less)
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 got = IERC20(tokenIn).balanceOf(address(this)) - b0[0];
        uint256 fee;
        (out, fee) = abi.decode(poolManager.unlock(abi.encode(false, free, path, tokens, got, feeAt)), (uint256, uint256));
        if (out < minOut) revert Slippage(out, minOut);
        address feeToken = tokens[feeAt];
        // a token that taxes its own transfers arrives short: refuse it rather than pay out of anything else
        if (IERC20(tokens[n - 1]).balanceOf(address(this)) - b0[n - 1] < out + (feeAt == n - 1 ? fee : 0)) revert TaxedToken(tokens[n - 1]);
        if (feeAt != 0 && feeAt != n - 1 && IERC20(feeToken).balanceOf(address(this)) - b0[feeAt] < fee) revert TaxedToken(feeToken);
        if (fee > 0) {
            IERC20(feeToken).safeTransfer(feeTo, fee);
            feesIn[feeToken] += fee;
            // $ARCIRCLE fees burn right away; a fee burn that can't flush never blocks a swap
            if (feeToken == arcircle) {
                (bool ok,) = feeTo.call{gas: 200_000}(abi.encodeCall(ISwapFeeBurn.flush, (feeToken)));
                if (ok) ++flushes;
            }
        }
        address tokenOut = tokens[n - 1];
        uint256 r0 = IERC20(tokenOut).balanceOf(to);
        IERC20(tokenOut).safeTransfer(to, out);
        uint256 recv = IERC20(tokenOut).balanceOf(to) - r0;
        if (recv < minOut) revert Slippage(recv, minOut); // what `to` actually received
        // whatever a pool didn't use goes back: the input and any token in between to the caller, extra output to `to`
        for (uint256 j; j < n; ++j) {
            uint256 bal = IERC20(tokens[j]).balanceOf(address(this));
            if (bal > b0[j]) IERC20(tokens[j]).safeTransfer(j == n - 1 ? to : msg.sender, bal - b0[j]);
        }
        unchecked { ++swaps; }
        emit Swapped(msg.sender, tokenIn, tokenOut, got, out, feeToken, fee, uint8(n - 1), to);
    }

    // ------------------------------------------------------------------ the route, inside the PoolManager's unlock

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (bool isQuote, bool free, PoolKey[] memory path, address[] memory tokens, uint256 amountIn, uint256 feeAt) =
            abi.decode(data, (bool, bool, PoolKey[], address[], uint256, uint256));
        uint256 n = path.length;
        uint256 amt = amountIn;
        uint256 fee;
        if (feeAt == 0) {
            fee = _fee(free, amt); // stays here from what was pulled; paid to feeTo after the unlock
            amt -= fee;
        }
        uint256 spendable = amt; // of tokens[0]: never more than this goes into the pools
        for (uint256 i; i < n; ++i) {
            amt = _hop(path[i], tokens[i], amt);
            if (i + 1 == feeAt && i + 1 < n) {
                fee = _fee(free, amt);
                if (fee > 0 && !isQuote) poolManager.take(Currency.wrap(tokens[i + 1]), address(this), fee);
                amt -= fee;
            }
        }
        if (feeAt == n) {
            fee = _fee(free, amt);
            amt -= fee;
        }
        if (isQuote) revert QuoteResult(amt, fee, feeAt);
        // settle every token of the route: pay what's owed, take what's owed to us
        for (uint256 j; j <= n; ++j) {
            Currency c = Currency.wrap(tokens[j]);
            int256 d = poolManager.currencyDelta(address(this), c);
            if (d < 0) {
                // only the input is ever paid, and never more than went into the route: a hook that pushes a later
                // token negative can't make this contract pay it out of anything else
                if (j != 0 || uint256(-d) > spendable) revert Overdrawn(tokens[j]);
                poolManager.sync(c);
                IERC20(tokens[j]).safeTransfer(address(poolManager), uint256(-d));
                poolManager.settle();
            } else if (d > 0) {
                poolManager.take(c, address(this), uint256(d));
            }
        }
        return abi.encode(amt, fee);
    }

    /// one exact-in swap of `amountIn` of `sell` through `key`; returns what it bought
    function _hop(PoolKey memory key, address sell, uint256 amountIn) internal returns (uint256 out) {
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        bool zeroForOne = Currency.unwrap(key.currency0) == sell;
        BalanceDelta d = poolManager.swap(
            key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }),
            ""
        );
        int128 outD = zeroForOne ? d.amount1() : d.amount0();
        if (outD <= 0) revert NoOutput();
        out = uint256(uint128(outD));
    }
}
