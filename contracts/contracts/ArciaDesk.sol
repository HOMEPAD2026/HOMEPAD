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

/// @title ARCIA DESK — ARCIA's trading desk on Arc (ARCIRCLE PAD)
/// @notice Holds the desk's USDC and the tokens it buys, and swaps them on Uniswap v4 pools
///         paired with USDC (Argus launches) — any hook, any fee, any tick spacing.
///         Guardrails, so a leaked operator key can only do limited harm:
///           • only the operator trades; only the owner withdraws, and only to itself
///           • tokens never leave the contract except by selling them for USDC here,
///             by burning $ARCIRCLE (buyAndBurn sends it to 0x…dEaD) or by the owner's withdraw
///           • one buy spends at most `maxTrade` USDC, and buys spend at most `dailyCap` a UTC day
///           • the pool's hook must carry one of the owner-approved permission patterns
///             (Argus hooks: 0x2044, 0x20cc) — or have no hook at all if the owner allows it
///           • `paused` stops buys (selling to get out always works)
///         quote() and quoteRoundTrip() are read-only price checks: they run the swaps and then
///         revert with the result, so an eth_call gets the exact output, hook taxes included.
contract ArciaDesk is IUnlockCallback {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;
    address public immutable usdc;
    address public immutable arcircle;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint160 internal constant HOOK_MASK = 0x3FFF;

    address public owner;
    address public operator;
    bool public paused;
    uint256 public maxTrade; // USDC (6 decimals) per buy
    uint256 public dailyCap; // USDC per UTC day, across buys
    uint256 public burnCap; // USDC per UTC day, for buyAndBurn
    uint256 public day;
    uint256 public spentToday;
    uint256 public burnSpentToday;
    uint256 public arcircleBurned; // all time, token units
    mapping(uint16 => bool) public hookPattern; // low 14 bits of the hook address the owner accepts

    enum Op { Buy, Sell, BuyBurn, Quote, RoundTrip }
    bool private active;

    event Trade(address indexed token, bool indexed isBuy, uint256 amountIn, uint256 amountOut);
    event Burned(uint256 usdcIn, uint256 arcircleOut);
    event OperatorSet(address indexed operator);
    event OwnerSet(address indexed owner);
    event Caps(uint256 maxTrade, uint256 dailyCap, uint256 burnCap);
    event Paused(bool paused);
    event HookPattern(uint16 pattern, bool allowed);
    event Withdrawn(address indexed token, uint256 amount);

    error NotOwner();
    error NotOperator();
    error IsPaused();
    error NotUsdcPool();
    error HookNotAllowed();
    error OverTradeCap();
    error OverDailyCap();
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 amountOut);
    error RoundTripResult(uint256 tokensOut, uint256 usdcBack);
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(address _poolManager, address _usdc, address _arcircle, address _owner, address _operator) {
        if (_poolManager == address(0) || _usdc == address(0) || _owner == address(0) || _operator == address(0)) revert ZeroAddress();
        poolManager = IPoolManager(_poolManager);
        usdc = _usdc;
        arcircle = _arcircle;
        owner = _owner;
        operator = _operator;
        maxTrade = 12e6;
        dailyCap = 200e6;
        burnCap = 25e6;
        hookPattern[0x2044] = true; // Argus portals up to #7 (afterSwap + returns delta)
        hookPattern[0x20cc] = true; // Argus Portal #8 (before/after swap + returns deltas)
        emit OwnerSet(_owner);
        emit OperatorSet(_operator);
        emit Caps(maxTrade, dailyCap, burnCap);
    }

    // ------------------------------------------------------------------ trading (operator)

    /// @notice Spend `usdcIn` on the pool's token, receiving at least `minOut`.
    function buy(PoolKey calldata key, uint256 usdcIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        if (paused) revert IsPaused();
        _checkPool(key);
        if (usdcIn > maxTrade) revert OverTradeCap();
        _roll();
        if (spentToday + usdcIn > dailyCap) revert OverDailyCap();
        spentToday += usdcIn;
        out = abi.decode(poolManager.unlock(abi.encode(Op.Buy, key, usdcIn, minOut)), (uint256));
        emit Trade(_tokenOf(key), true, usdcIn, out);
    }

    /// @notice Sell `tokenIn` of the pool's token for at least `minOut` USDC (works while paused).
    function sell(PoolKey calldata key, uint256 tokenIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        _checkPool(key);
        out = abi.decode(poolManager.unlock(abi.encode(Op.Sell, key, tokenIn, minOut)), (uint256));
        emit Trade(_tokenOf(key), false, tokenIn, out);
    }

    /// @notice Buy $ARCIRCLE with `usdcIn` and send it straight to 0x…dEaD.
    function buyAndBurn(PoolKey calldata key, uint256 usdcIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        if (arcircle == address(0) || _tokenOf(key) != arcircle) revert NotUsdcPool();
        _checkPool(key);
        _roll();
        if (burnSpentToday + usdcIn > burnCap) revert OverDailyCap();
        burnSpentToday += usdcIn;
        out = abi.decode(poolManager.unlock(abi.encode(Op.BuyBurn, key, usdcIn, minOut)), (uint256));
        arcircleBurned += out;
        emit Burned(usdcIn, out);
    }

    // ------------------------------------------------------------------ quotes (anyone, eth_call)

    /// @notice Always reverts with QuoteResult(amountOut): the exact output of one swap now.
    function quote(PoolKey calldata key, bool isBuy, uint256 amountIn) external {
        _checkPool(key);
        poolManager.unlock(abi.encode(Op.Quote, key, amountIn, isBuy ? 1 : 0));
    }

    /// @notice Always reverts with RoundTripResult(tokensOut, usdcBack): buy with `usdcIn`, sell it all straight back.
    function quoteRoundTrip(PoolKey calldata key, uint256 usdcIn) external {
        _checkPool(key);
        poolManager.unlock(abi.encode(Op.RoundTrip, key, usdcIn, 0));
    }

    // ------------------------------------------------------------------ the swaps

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (Op op, PoolKey memory key, uint256 amountIn, uint256 extra) = abi.decode(data, (Op, PoolKey, uint256, uint256));
        bool usdcIs0 = Currency.unwrap(key.currency0) == usdc;
        if (op == Op.Quote) {
            bool isBuy = extra == 1;
            (, uint256 o) = _swap(key, isBuy ? usdcIs0 : !usdcIs0, amountIn);
            revert QuoteResult(o);
        }
        if (op == Op.RoundTrip) {
            (, uint256 tokensOut) = _swap(key, usdcIs0, amountIn);
            (, uint256 back) = _swap(key, !usdcIs0, tokensOut);
            revert RoundTripResult(tokensOut, back);
        }
        // Buy / BuyBurn: USDC in; Sell: token in
        bool zeroForOne = op == Op.Sell ? !usdcIs0 : usdcIs0;
        (uint256 paid, uint256 out) = _swap(key, zeroForOne, amountIn);
        if (out < extra) revert Slippage(out, extra);
        Currency cin = zeroForOne ? key.currency0 : key.currency1;
        Currency cout = zeroForOne ? key.currency1 : key.currency0;
        // settle what we owe, take what we're owed
        poolManager.sync(cin);
        IERC20(Currency.unwrap(cin)).safeTransfer(address(poolManager), paid);
        poolManager.settle();
        poolManager.take(cout, op == Op.BuyBurn ? DEAD : address(this), out);
        return abi.encode(out);
    }

    /// exact-input swap; returns (input actually used, output) from the desk's delta, hook deltas included
    function _swap(PoolKey memory key, bool zeroForOne, uint256 amountIn) internal returns (uint256 paid, uint256 out) {
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        BalanceDelta d = poolManager.swap(
            key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }),
            ""
        );
        int128 a0 = d.amount0();
        int128 a1 = d.amount1();
        int128 inD = zeroForOne ? a0 : a1;
        int128 outD = zeroForOne ? a1 : a0;
        paid = inD < 0 ? uint256(uint128(-inD)) : 0;
        out = outD > 0 ? uint256(uint128(outD)) : 0;
    }

    function _checkPool(PoolKey calldata key) internal view {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0) || c1 == address(0)) revert NotUsdcPool();
        if (c0 != usdc && c1 != usdc) revert NotUsdcPool();
        if (c0 == c1) revert NotUsdcPool();
        uint16 p = uint16(uint160(address(key.hooks)) & HOOK_MASK);
        if (!hookPattern[p]) revert HookNotAllowed();
    }
    function _tokenOf(PoolKey calldata key) internal view returns (address) {
        address c0 = Currency.unwrap(key.currency0);
        return c0 == usdc ? Currency.unwrap(key.currency1) : c0;
    }
    function _roll() internal {
        uint256 d = block.timestamp / 1 days;
        if (d != day) { day = d; spentToday = 0; burnSpentToday = 0; }
    }

    // ------------------------------------------------------------------ owner

    function setOperator(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); operator = o; emit OperatorSet(o); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
    function setCaps(uint256 _maxTrade, uint256 _dailyCap, uint256 _burnCap) external onlyOwner {
        maxTrade = _maxTrade; dailyCap = _dailyCap; burnCap = _burnCap;
        emit Caps(_maxTrade, _dailyCap, _burnCap);
    }
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setHookPattern(uint16 pattern, bool allowed) external onlyOwner { hookPattern[pattern & 0x3FFF] = allowed; emit HookPattern(pattern & 0x3FFF, allowed); }
    /// @notice Take any token (USDC, positions, anything) out — always to the owner.
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
        emit Withdrawn(token, amount);
    }
}
