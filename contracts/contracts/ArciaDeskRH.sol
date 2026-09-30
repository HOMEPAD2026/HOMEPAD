// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external returns (int256 amount0, int256 amount1);
}
interface IV3Factory {
    function getPool(address a, address b, uint24 fee) external view returns (address);
}
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @title ARCIA DESK (Robinhood Chain) — ARCIA's trading desk for pons launches
/// @notice Holds the desk's WETH and the tokens it buys, and swaps them in the Uniswap v3 pools that
///         pons launches trade in (token / WETH). Same guardrails as the Arc desk:
///           • only the operator trades; only the owner withdraws, and only to itself
///           • tokens never leave except by selling them for WETH here, or by the owner's withdraw
///           • one buy spends at most `maxTrade` WETH, buys spend at most `dailyCap` a UTC day
///           • the pool must be the v3 factory's own pool for its pair, paired with WETH, and its token
///             must be registered by an owner-approved launch factory (pons: active + legacy)
///           • `paused` stops buys (selling to get out always works)
///         quote() and quoteRoundTrip() are read-only price checks: they run the swap and revert with
///         the result, so an eth_call gets the exact output.
///         Sending ETH to the desk wraps it: a deposit is just a transfer from the owner's wallet.
contract ArciaDeskRH {
    using SafeERC20 for IERC20;

    uint160 internal constant MIN_SQRT = 4295128739 + 1;
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970342 - 1;

    IV3Factory public immutable v3Factory;
    address public immutable weth;

    address public owner;
    address public operator;
    bool public paused;
    uint256 public maxTrade; // WETH (18 decimals) per buy
    uint256 public dailyCap; // WETH per UTC day, across buys
    uint256 public day;
    uint256 public spentToday;
    mapping(address => bool) public launchFactory; // pons factories whose tokens may be traded

    enum Op { Swap, Quote, RoundTrip }
    address private active; // the pool a swap is running in (its callback may pay)

    event Trade(address indexed token, bool indexed isBuy, uint256 amountIn, uint256 amountOut);
    event OperatorSet(address indexed operator);
    event OwnerSet(address indexed owner);
    event Caps(uint256 maxTrade, uint256 dailyCap);
    event Paused(bool paused);
    event LaunchFactory(address indexed factory, bool allowed);
    event Withdrawn(address indexed token, uint256 amount);

    error NotOwner();
    error NotOperator();
    error IsPaused();
    error NotWethPool();
    error NotFactoryPool();
    error NotLaunched();
    error OverTradeCap();
    error OverDailyCap();
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 amountOut);
    error RoundTripResult(uint256 tokensOut, uint256 wethBack);
    error ZeroAddress();
    error BadCallback();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(address _v3Factory, address _weth, address[] memory _launchFactories, address _owner, address _operator, uint256 _maxTrade, uint256 _dailyCap) {
        if (_v3Factory == address(0) || _weth == address(0) || _owner == address(0) || _operator == address(0)) revert ZeroAddress();
        v3Factory = IV3Factory(_v3Factory);
        weth = _weth;
        owner = _owner;
        operator = _operator;
        maxTrade = _maxTrade;
        dailyCap = _dailyCap;
        for (uint256 i = 0; i < _launchFactories.length; i++) _setFactory(_launchFactories[i], true);
        emit OwnerSet(_owner);
        emit OperatorSet(_operator);
        emit Caps(maxTrade, dailyCap);
    }

    /// @notice ETH sent here becomes the desk's WETH (the WETH contract's own refunds are just kept).
    receive() external payable {
        if (msg.sender != weth) IWETH(weth).deposit{value: msg.value}();
    }

    // ------------------------------------------------------------------ trading (operator)

    /// @notice Spend `wethIn` on the pool's token, receiving at least `minOut`.
    function buy(address pool, uint256 wethIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        if (paused) revert IsPaused();
        (address token, bool wethIs0) = _check(pool);
        if (wethIn > maxTrade) revert OverTradeCap();
        _roll();
        if (spentToday + wethIn > dailyCap) revert OverDailyCap();
        spentToday += wethIn;
        out = _swap(pool, wethIs0, wethIn, Op.Swap);
        if (out < minOut) revert Slippage(out, minOut);
        emit Trade(token, true, wethIn, out);
    }

    /// @notice Sell `tokenIn` of the pool's token for at least `minOut` WETH (works while paused).
    function sell(address pool, uint256 tokenIn, uint256 minOut) external onlyOperator returns (uint256 out) {
        (address token, bool wethIs0) = _check(pool);
        out = _swap(pool, !wethIs0, tokenIn, Op.Swap);
        if (out < minOut) revert Slippage(out, minOut);
        emit Trade(token, false, tokenIn, out);
    }

    // ------------------------------------------------------------------ quotes (anyone, eth_call)

    /// @notice Always reverts with QuoteResult(amountOut): the exact output of one swap now.
    function quote(address pool, bool isBuy, uint256 amountIn) external {
        (, bool wethIs0) = _check(pool);
        _swap(pool, isBuy ? wethIs0 : !wethIs0, amountIn, Op.Quote);
    }

    /// @notice Always reverts with RoundTripResult(tokensOut, wethBack): buy with `wethIn`, sell it all straight back.
    ///         Runs the buy for real inside the call, so the desk must hold `wethIn`.
    function quoteRoundTrip(address pool, uint256 wethIn) external {
        (, bool wethIs0) = _check(pool);
        uint256 tokensOut = _swap(pool, wethIs0, wethIn, Op.Swap);
        uint256 back = _swap(pool, !wethIs0, tokensOut, Op.Swap);
        revert RoundTripResult(tokensOut, back);
    }

    // ------------------------------------------------------------------ the swaps

    function _swap(address pool, bool zeroForOne, uint256 amountIn, Op op) internal returns (uint256 out) {
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

    /// the pool: the v3 factory's own pool for its pair and fee, one side WETH, the other side a token
    /// registered (and paired with WETH) by an approved launch factory
    function _check(address pool) internal view returns (address token, bool wethIs0) {
        address t0 = IV3Pool(pool).token0();
        address t1 = IV3Pool(pool).token1();
        if (t0 != weth && t1 != weth) revert NotWethPool();
        if (v3Factory.getPool(t0, t1, IV3Pool(pool).fee()) != pool) revert NotFactoryPool();
        wethIs0 = t0 == weth;
        token = wethIs0 ? t1 : t0;
        if (!launched(token)) revert NotLaunched();
    }

    /// @notice True when an approved launch factory's getLaunchedToken(token) says it exists and is paired with WETH.
    function launched(address token) public view returns (bool) {
        for (uint256 i = 0; i < _factories.length; i++) {
            address f = _factories[i];
            if (!launchFactory[f]) continue;
            (bool ok, bytes memory r) = f.staticcall(abi.encodeWithSignature("getLaunchedToken(address)", token));
            // (token, deployer, pairedToken, positionManager, positionId, dexId, launchConfigId,
            //  restrictionsEndBlock, supply, isToken0, poolFee, exists, initialBuyAmount)
            if (!ok || r.length < 13 * 32) continue;
            address tok; address paired; bool exists;
            assembly { tok := mload(add(r, 32)) paired := mload(add(r, 96)) exists := mload(add(r, 384)) }
            if (exists && tok == token && paired == weth) return true;
        }
        return false;
    }
    address[] private _factories;
    function factories() external view returns (address[] memory) { return _factories; }

    function _roll() internal {
        uint256 d = block.timestamp / 1 days;
        if (d != day) { day = d; spentToday = 0; }
    }

    // ------------------------------------------------------------------ owner

    function setOperator(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); operator = o; emit OperatorSet(o); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
    function setCaps(uint256 _maxTrade, uint256 _dailyCap) external onlyOwner { maxTrade = _maxTrade; dailyCap = _dailyCap; emit Caps(_maxTrade, _dailyCap); }
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setLaunchFactory(address f, bool allowed) external onlyOwner { _setFactory(f, allowed); }
    function _setFactory(address f, bool allowed) internal {
        if (f == address(0)) revert ZeroAddress();
        if (allowed && !_known[f]) { _known[f] = true; _factories.push(f); }
        launchFactory[f] = allowed;
        emit LaunchFactory(f, allowed);
    }
    mapping(address => bool) private _known;
    /// @notice Take any token (WETH, bought tokens, anything) out — always to the owner.
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
        emit Withdrawn(token, amount);
    }
    /// @notice Take WETH out as ETH — always to the owner.
    function withdrawETH(uint256 amount) external onlyOwner {
        IWETH(weth).withdraw(amount);
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "eth transfer");
        emit Withdrawn(address(0), amount);
    }
}
