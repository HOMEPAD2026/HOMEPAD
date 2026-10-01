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
import {IV3Pool, IV3Factory, IWETH} from "./ArciaDeskRH.sol";

/// @title ARCIA DESK (Robinhood Chain) v2 — ARCIA's trading desk for any new launch on Robinhood Chain
/// @notice Holds the desk's WETH and the tokens it buys, and swaps them where new Robinhood Chain coins trade:
///           • Uniswap v3: the v3 factory's own pool for the pair, paired with WETH (pons and other v3 launches)
///           • Uniswap v4: a PoolManager pool paired with native ETH or WETH (pools.trade, Bags and others),
///             with no hook, or a hook the owner approved
///         No launchpad check: what to trade is the operator's call, inside these guardrails:
///           • only the operator trades; only the owner withdraws, and only to itself
///           • tokens never leave except by selling them for ETH/WETH here, or by the owner's withdraw
///           • one buy spends at most `maxTrade` WETH, buys spend at most `dailyCap` a UTC day
///           • a v4 swap can never take more ETH than the amount asked (a hook can't make a buy cost more)
///           • `paused` stops buys (selling to get out always works)
///         quote*() and quoteRoundTrip*() are read-only price checks: they run the swaps and revert with the result,
///         so an eth_call gets the exact output. The v4 round trip moves the tokens for real inside the call, so a
///         token that taxes or blocks transfers shows it.
///         Sending ETH to the desk wraps it: a deposit is just a transfer from the owner's wallet.
contract ArciaDeskRH2 is IUnlockCallback {
    using SafeERC20 for IERC20;

    uint160 internal constant MIN_SQRT = 4295128739 + 1;
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970342 - 1;

    IV3Factory public immutable v3Factory;
    IPoolManager public immutable poolManager;
    address public immutable weth;

    address public owner;
    address public operator;
    bool public paused;
    uint256 public maxTrade; // WETH (18 decimals) per buy
    uint256 public dailyCap; // WETH per UTC day, across buys
    uint256 public day;
    uint256 public spentToday;
    mapping(address => bool) public hookAllowed; // v4 hooks the owner accepts (no hook is always fine)

    enum Op { Swap, Quote, RoundTrip }
    enum Op4 { Buy, Sell, Quote, RoundTrip }
    address private active; // the v3 pool a swap is running in (its callback may pay)

    event Trade(address indexed token, bool indexed isBuy, uint256 amountIn, uint256 amountOut);
    event OperatorSet(address indexed operator);
    event OwnerSet(address indexed owner);
    event Caps(uint256 maxTrade, uint256 dailyCap);
    event Paused(bool paused);
    event HookAllowed(address indexed hook, bool allowed);
    event Withdrawn(address indexed token, uint256 amount);

    error NotOwner();
    error NotOperator();
    error IsPaused();
    error NotWethPool();
    error NotFactoryPool();
    error HookNotAllowed();
    error OverTradeCap();
    error OverDailyCap();
    error OverPaid(uint256 paid, uint256 amountIn);
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 amountOut);
    error RoundTripResult(uint256 tokensOut, uint256 wethBack);
    error ZeroAddress();
    error BadCallback();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(address _v3Factory, address _poolManager, address _weth, address[] memory _hooks, address _owner, address _operator, uint256 _maxTrade, uint256 _dailyCap) {
        if (_v3Factory == address(0) || _poolManager == address(0) || _weth == address(0) || _owner == address(0) || _operator == address(0)) revert ZeroAddress();
        v3Factory = IV3Factory(_v3Factory);
        poolManager = IPoolManager(_poolManager);
        weth = _weth;
        owner = _owner;
        operator = _operator;
        maxTrade = _maxTrade;
        dailyCap = _dailyCap;
        for (uint256 i = 0; i < _hooks.length; i++) _setHook(_hooks[i], true);
        emit OwnerSet(_owner);
        emit OperatorSet(_operator);
        emit Caps(_maxTrade, _dailyCap);
    }

    /// @notice ETH sent here becomes the desk's WETH (the WETH contract's own refunds are just kept as ETH to pay with).
    receive() external payable {
        if (msg.sender != weth) IWETH(weth).deposit{value: msg.value}();
    }

    // ================================================================== Uniswap v3 (pool address)

    /// @notice Spend `wethIn` on the pool's token, receiving at least `minOut`.
    function buy(address pool, uint256 wethIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        (address token, bool wethIs0) = _check3(pool);
        _spend(wethIn);
        out = _swap3(pool, wethIs0, wethIn, Op.Swap);
        if (out < minOut) revert Slippage(out, minOut);
        emit Trade(token, true, wethIn, out);
    }

    /// @notice Sell `tokenIn` of the pool's token for at least `minOut` WETH (works while paused).
    function sell(address pool, uint256 tokenIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        (address token, bool wethIs0) = _check3(pool);
        out = _swap3(pool, !wethIs0, tokenIn, Op.Swap);
        if (out < minOut) revert Slippage(out, minOut);
        emit Trade(token, false, tokenIn, out);
    }

    /// @notice Always reverts with QuoteResult(amountOut): the exact output of one swap now.
    function quote(address pool, bool isBuy, uint256 amountIn) external {
        (, bool wethIs0) = _check3(pool);
        _swap3(pool, isBuy ? wethIs0 : !wethIs0, amountIn, Op.Quote);
    }

    /// @notice Always reverts with RoundTripResult(tokensOut, wethBack): buy with `wethIn`, sell it all straight back.
    ///         Runs the buy for real inside the call, so the desk must hold `wethIn`.
    function quoteRoundTrip(address pool, uint256 wethIn) external {
        (, bool wethIs0) = _check3(pool);
        uint256 tokensOut = _swap3(pool, wethIs0, wethIn, Op.Swap);
        uint256 back = _swap3(pool, !wethIs0, tokensOut, Op.Swap);
        revert RoundTripResult(tokensOut, back);
    }

    function _swap3(address pool, bool zeroForOne, uint256 amountIn, Op op) internal returns (uint256 out) {
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        active = pool;
        (int256 a0, int256 a1) = IV3Pool(pool).swap(address(this), zeroForOne, int256(amountIn), zeroForOne ? MIN_SQRT : MAX_SQRT, abi.encode(op));
        active = address(0);
        int256 o = zeroForOne ? a1 : a0;
        out = o < 0 ? uint256(-o) : 0;
    }

    /// @notice Uniswap v3's swap callback: pays what the swap owes (only for the pool this desk is swapping in).
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        if (msg.sender != active || active == address(0)) revert BadCallback();
        Op op = abi.decode(data, (Op));
        if (op == Op.Quote) revert QuoteResult(uint256(-(amount0Delta < 0 ? amount0Delta : amount1Delta)));
        if (amount0Delta > 0) IERC20(IV3Pool(msg.sender).token0()).safeTransfer(msg.sender, uint256(amount0Delta));
        if (amount1Delta > 0) IERC20(IV3Pool(msg.sender).token1()).safeTransfer(msg.sender, uint256(amount1Delta));
    }

    /// the v3 factory's own pool for its pair and fee, one side WETH
    function _check3(address pool) internal view returns (address token, bool wethIs0) {
        address t0 = IV3Pool(pool).token0();
        address t1 = IV3Pool(pool).token1();
        if (t0 != weth && t1 != weth) revert NotWethPool();
        if (v3Factory.getPool(t0, t1, IV3Pool(pool).fee()) != pool) revert NotFactoryPool();
        wethIs0 = t0 == weth;
        token = wethIs0 ? t1 : t0;
    }

    // ================================================================== Uniswap v4 (pool key)

    /// @notice Spend `wethIn` (as ETH or WETH, whichever the pool takes) on the pool's token, receiving at least `minOut`.
    function buy4(PoolKey calldata key, uint256 wethIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        address token = _check4(key);
        _spend(wethIn);
        out = abi.decode(poolManager.unlock(abi.encode(Op4.Buy, key, wethIn, minOut)), (uint256));
        emit Trade(token, true, wethIn, out);
    }

    /// @notice Sell `tokenIn` of the pool's token for at least `minOut` ETH/WETH, kept as WETH (works while paused).
    function sell4(PoolKey calldata key, uint256 tokenIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        address token = _check4(key);
        out = abi.decode(poolManager.unlock(abi.encode(Op4.Sell, key, tokenIn, minOut)), (uint256));
        emit Trade(token, false, tokenIn, out);
    }

    /// @notice Always reverts with QuoteResult(amountOut): the exact output of one swap now (hook deltas included).
    function quote4(PoolKey calldata key, bool isBuy, uint256 amountIn) external {
        _check4(key);
        poolManager.unlock(abi.encode(Op4.Quote, key, amountIn, isBuy ? 1 : 0));
    }

    /// @notice Always reverts with RoundTripResult(tokensOut, wethBack): buy with `wethIn`, take the tokens, send them back
    ///         and sell — transfer taxes and transfer blocks included. Needs no money in the desk.
    function quoteRoundTrip4(PoolKey calldata key, uint256 wethIn) external {
        _check4(key);
        poolManager.unlock(abi.encode(Op4.RoundTrip, key, wethIn, 0));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert BadCallback();
        (Op4 op, PoolKey memory key, uint256 amountIn, uint256 extra) = abi.decode(data, (Op4, PoolKey, uint256, uint256));
        Currency eth = key.currency0; // native ETH (address 0) always sorts first; else WETH is either side
        Currency tok = key.currency1;
        if (Currency.unwrap(key.currency1) == weth) (eth, tok) = (key.currency1, key.currency0);
        bool ethIs0 = Currency.unwrap(eth) == Currency.unwrap(key.currency0);

        if (op == Op4.Quote) {
            (, uint256 o) = _swap4(key, extra == 1 ? ethIs0 : !ethIs0, amountIn);
            revert QuoteResult(o);
        }
        if (op == Op4.RoundTrip) {
            (, uint256 got) = _swap4(key, ethIs0, amountIn);
            uint256 held = _take(tok, got); // tokens actually received
            uint256 sent = _pay(tok, held); // tokens the pool actually got back
            (, uint256 back) = _swap4(key, !ethIs0, sent);
            revert RoundTripResult(held, back);
        }
        if (op == Op4.Buy) {
            (uint256 paid, uint256 o) = _swap4(key, ethIs0, amountIn);
            if (paid > amountIn) revert OverPaid(paid, amountIn);
            _payEth(eth, paid);
            uint256 got = _take(tok, o);
            if (got < extra) revert Slippage(got, extra);
            return abi.encode(got);
        }
        // Sell: pay the tokens in first (a taxed transfer delivers less), sell what arrived
        uint256 arrived = _pay(tok, amountIn);
        (uint256 used, uint256 out) = _swap4(key, !ethIs0, arrived);
        if (used < arrived) poolManager.take(tok, address(this), arrived - used); // a price limit left some unsold
        if (out < extra) revert Slippage(out, extra);
        poolManager.take(eth, address(this), out); // native ETH comes back through receive() as WETH
        return abi.encode(out);
    }

    /// exact-input swap; returns (input actually used, output) from the desk's delta, hook deltas included
    function _swap4(PoolKey memory key, bool zeroForOne, uint256 amountIn) internal returns (uint256 paid, uint256 out) {
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        BalanceDelta d = poolManager.swap(
            key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }),
            ""
        );
        int128 inD = zeroForOne ? d.amount0() : d.amount1();
        int128 outD = zeroForOne ? d.amount1() : d.amount0();
        paid = inD < 0 ? uint256(uint128(-inD)) : 0;
        out = outD > 0 ? uint256(uint128(outD)) : 0;
    }
    /// pay `amount` of the ETH side: native ETH unwrapped from the desk's WETH, or WETH itself
    function _payEth(Currency eth, uint256 amount) internal {
        if (amount == 0) return;
        if (Currency.unwrap(eth) == address(0)) {
            IWETH(weth).withdraw(amount);
            poolManager.settle{value: amount}();
        } else _pay(eth, amount);
    }
    /// pay an ERC-20 into the PoolManager; returns what it actually received
    function _pay(Currency c, uint256 amount) internal returns (uint256) {
        poolManager.sync(c);
        IERC20(Currency.unwrap(c)).safeTransfer(address(poolManager), amount);
        return poolManager.settle();
    }
    /// take an ERC-20 from the PoolManager; returns what actually arrived
    function _take(Currency c, uint256 amount) internal returns (uint256) {
        IERC20 t = IERC20(Currency.unwrap(c));
        uint256 b0 = t.balanceOf(address(this));
        poolManager.take(c, address(this), amount);
        return t.balanceOf(address(this)) - b0;
    }

    /// paired with native ETH or WETH; no hook, or an approved one; returns the token
    function _check4(PoolKey calldata key) internal view returns (address token) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0) || c0 == weth) token = c1;
        else if (c1 == weth) token = c0;
        else revert NotWethPool();
        if (token == address(0) || token == weth) revert NotWethPool();
        address h = address(key.hooks);
        if (h != address(0) && !hookAllowed[h]) revert HookNotAllowed();
    }

    // ================================================================== shared

    function _spend(uint256 wethIn) internal {
        if (paused) revert IsPaused();
        if (wethIn > maxTrade) revert OverTradeCap();
        uint256 d = block.timestamp / 1 days;
        if (d != day) { day = d; spentToday = 0; }
        if (spentToday + wethIn > dailyCap) revert OverDailyCap();
        spentToday += wethIn;
    }

    // ------------------------------------------------------------------ owner

    function setOperator(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); operator = o; emit OperatorSet(o); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
    function setCaps(uint256 _maxTrade, uint256 _dailyCap) external onlyOwner { maxTrade = _maxTrade; dailyCap = _dailyCap; emit Caps(_maxTrade, _dailyCap); }
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setHook(address h, bool allowed) external onlyOwner { _setHook(h, allowed); }
    function _setHook(address h, bool allowed) internal { if (h == address(0)) revert ZeroAddress(); hookAllowed[h] = allowed; emit HookAllowed(h, allowed); }
    /// @notice Take any token (WETH, bought tokens, anything) out — always to the owner.
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
        emit Withdrawn(token, amount);
    }
    /// @notice Take WETH out as ETH — always to the owner.
    function withdrawETH(uint256 amount) external onlyOwner {
        IWETH(weth).withdraw(amount);
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "eth");
        emit Withdrawn(address(0), amount);
    }
}
