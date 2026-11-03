// SPDX-License-Identifier: MIT
// Audited with Arc Studio — studio.arc.io (session crimson-audit, 2026-10-29: findings AD-1 … AD-14; AD-1 … AD-8 and AD-13 addressed here).
// Arc Studio re-audit of these fixes: pending (see contracts/audits/arc-studio-2026-11-03.md).
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

// the most any trade fee can ever be, in $ARCIRCLE (18 decimals) — the factory can't set more, a vault never pays more
uint256 constant AD_MAX_TRADE_FEE = 1_000e18;

/// @title AGENT DIMENSION — a player's own trading vault, run by their AI agent (ARCIRCLE WORLD)
/// @notice One vault per player. The player funds it with USDC (and a little $ARCIRCLE for fees) and picks the
///         tokens their agent may trade; the agent (the factory's operator key, driven by the rules the player set
///         in the game) decides WHEN to buy or sell them against USDC on Uniswap v4.
///           • a buy spends at most maxPerTx USDC, and never more than MAX_PER_TX (100 USDC) — a hard cap
///           • a sell gives up at most maxSellPerTx[token] of the token, and only at or above the owner's price floor
///             minPriceX18[token] (USDC units per token unit × 1e18); with no floor set the agent can't sell that token
///           • all trades ≤ dailyCap USDC a UTC day, at least `cooldown` seconds apart, each before its deadline
///           • each trade pays the factory's tradeFee in $ARCIRCLE from the vault to feeTo, never above the vault's own
///             maxFee (set by its owner) nor MAX_TRADE_FEE
///           • what it buys and sells stays in the vault; only the owner can take anything out, always to the owner,
///             at any time (paused or not)
///           • only tokens the owner allowed (each one's pool copied from the factory's list when allowed)
///           • the owner tightens any limit at once; the loosened parts wait LOOSEN_DELAY (1 hour)
///           • the owner can pause it or turn the agent off; the factory owner can stop every vault at once
///           • a new operator key, and a higher fee, only take effect 24 hours after they're announced
interface IAgentDimensionFactory {
    function operator() external view returns (address);
    function paused() external view returns (bool);
    function feeTo() external view returns (address);
    function tradeFee() external view returns (uint256);
    function poolOf(address token) external view returns (PoolKey memory);
    function ownerMoved(address from, address to) external;
}

contract AgentDimensionVault is IUnlockCallback, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint256 public constant MAX_PER_TX = 100e6; // 100 USDC (6 decimals): no limit can go above this
    uint256 public constant LOOSEN_DELAY = 1 hours;
    uint256 public constant MIN_COOLDOWN = 60;
    uint256 public constant MAX_TRADE_FEE = AD_MAX_TRADE_FEE;

    IPoolManager public immutable poolManager;
    IAgentDimensionFactory public immutable factory;
    address public immutable usdc;
    address public immutable arcircle;

    address public owner;
    address public pendingOwner;
    bool public paused;
    bool public agentOn = true;

    uint256 public maxPerTx; // USDC per buy (and the most one sell may bring)
    uint256 public dailyCap; // USDC per UTC day (buys and sells together)
    uint256 public cooldown; // seconds between trades
    uint256 public maxFee; // the most $ARCIRCLE this vault pays for one trade
    struct Pending { uint256 maxPerTx; uint256 dailyCap; uint256 cooldown; uint64 readyAt; }
    Pending public pending;

    mapping(address => uint256) public maxSellPerTx; // token units per sell
    mapping(address => uint256) public minPriceX18; // USDC units per token unit × 1e18: a sell's floor
    struct SellPending { uint256 maxSell; uint256 floor; uint64 readyAt; }
    mapping(address => SellPending) public sellPending;

    mapping(address => bool) public allowed;
    mapping(address => PoolKey) internal _keys;
    address[] internal _tokens;

    uint256 public day;
    uint256 public volumeToday;
    uint256 public lastTradeAt;
    uint256 public trades;
    uint256 public totalVolume; // USDC, all time
    uint256 public totalFees; // $ARCIRCLE paid, all time

    enum Op { Trade, Quote }

    event Traded(address indexed token, bool buy, uint256 amountIn, uint256 amountOut, uint256 usdcValue, uint256 fee);
    event Funded(address indexed from, address indexed token, uint256 amount);
    event TokenAllowed(address indexed token, bool allowed, bytes32 poolId);
    event Limits(uint256 maxPerTx, uint256 dailyCap, uint256 cooldown);
    event LimitsQueued(uint256 maxPerTx, uint256 dailyCap, uint256 cooldown, uint256 readyAt);
    event SellLimits(address indexed token, uint256 maxSell, uint256 minPriceX18);
    event SellLimitsQueued(address indexed token, uint256 maxSell, uint256 minPriceX18, uint256 readyAt);
    event MaxFee(uint256 maxFee);
    event Paused(bool paused);
    event AgentOn(bool on);
    event OwnerProposed(address indexed owner);
    event OwnerSet(address indexed owner);
    event Withdrawn(address indexed token, uint256 amount);

    error NotOwner();
    error NotOperator();
    error IsPaused();
    error BadLimits();
    error NotAllowed();
    error OverMaxPerTx(uint256 usdcValue, uint256 maxPerTx);
    error OverMaxSell(uint256 amountIn, uint256 maxSell);
    error BelowFloor(uint256 out, uint256 floorOut);
    error OverDailyCap();
    error Cooldown(uint256 readyAt);
    error Expired();
    error FeeTooHigh(uint256 fee, uint256 maxFee);
    error NotReady(uint256 readyAt);
    error NoPending();
    error ZeroAmount();
    error ZeroMinOut();
    error NoFeeBalance(uint256 need, uint256 have);
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 amountOut);
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(IPoolManager _pm, address _usdc, address _arcircle, address _owner, uint256 _maxPerTx, uint256 _dailyCap, uint256 _cooldown, uint256 _maxFee) {
        if (_owner == address(0)) revert ZeroAddress();
        poolManager = _pm;
        factory = IAgentDimensionFactory(msg.sender);
        usdc = _usdc;
        arcircle = _arcircle;
        owner = _owner;
        _checkLimits(_maxPerTx, _dailyCap, _cooldown);
        if (_maxFee > MAX_TRADE_FEE) revert BadLimits();
        (maxPerTx, dailyCap, cooldown, maxFee) = (_maxPerTx, _dailyCap, _cooldown, _maxFee);
        emit OwnerSet(_owner);
        emit Limits(_maxPerTx, _dailyCap, _cooldown);
        emit MaxFee(_maxFee);
    }

    // ------------------------------------------------------------------ views
    /// the agent's key while it's on; nobody when the owner has turned it off
    function operator() public view returns (address) { return agentOn ? factory.operator() : address(0); }
    function tokens() external view returns (address[] memory) { return _tokens; }
    function poolKeyOf(address token) external view returns (PoolKey memory) { return _keys[token]; }
    function usdcBalance() external view returns (uint256) { return IERC20(usdc).balanceOf(address(this)); }
    function feeBalance() external view returns (uint256) { return IERC20(arcircle).balanceOf(address(this)); }
    function spendableToday() external view returns (uint256) {
        uint256 v = block.timestamp / 1 days == day ? volumeToday : 0;
        return v >= dailyCap ? 0 : dailyCap - v;
    }
    function nextTradeAt() external view returns (uint256) { return lastTradeAt == 0 ? 0 : lastTradeAt + cooldown; }

    // ------------------------------------------------------------------ funding (anyone)
    /// @notice Add USDC, $ARCIRCLE (for fees) or an allowed token with an approval; a plain transfer works too.
    function fund(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, token, amount);
    }

    // ------------------------------------------------------------------ the agent
    /// @notice Buy `token` with `amountIn` USDC (buy) or sell `amountIn` of it for USDC (sell), before `deadline`.
    ///         A buy spends ≤ maxPerTx USDC; a sell gives up ≤ maxSellPerTx[token] at or above minPriceX18[token] and
    ///         brings ≤ maxPerTx USDC. What comes out stays here. Pays tradeFee (≤ maxFee) in $ARCIRCLE.
    function trade(address token, bool buy, uint256 amountIn, uint256 minOut, uint256 deadline) external nonReentrant returns (uint256 out) {
        address op = operator();
        if (op == address(0) || msg.sender != op) revert NotOperator();
        if (block.timestamp > deadline) revert Expired();
        if (paused || factory.paused()) revert IsPaused();
        if (!allowed[token]) revert NotAllowed();
        if (amountIn == 0) revert ZeroAmount();
        if (minOut == 0) revert ZeroMinOut();
        if (buy) { if (amountIn > maxPerTx) revert OverMaxPerTx(amountIn, maxPerTx); }
        else if (amountIn > maxSellPerTx[token]) revert OverMaxSell(amountIn, maxSellPerTx[token]);
        if (lastTradeAt != 0 && block.timestamp < lastTradeAt + cooldown) revert Cooldown(lastTradeAt + cooldown);
        uint256 fee = factory.tradeFee();
        if (fee > maxFee) revert FeeTooHigh(fee, maxFee);
        // effects that don't depend on the swap's result come before any external transfer
        lastTradeAt = block.timestamp;
        trades += 1;
        totalFees += fee;
        uint256 d = block.timestamp / 1 days;
        if (d != day) { day = d; volumeToday = 0; }
        if (buy) _count(amountIn);
        if (fee > 0) {
            uint256 have = IERC20(arcircle).balanceOf(address(this));
            if (have < fee) revert NoFeeBalance(fee, have);
            IERC20(arcircle).safeTransfer(factory.feeTo(), fee);
        }
        out = abi.decode(poolManager.unlock(abi.encode(Op.Trade, token, buy, amountIn, minOut)), (uint256));
        if (!buy) {
            uint256 floorP = minPriceX18[token];
            uint256 floorOut = Math.mulDiv(amountIn, floorP, 1e18, Math.Rounding.Ceil);
            if (floorP == 0 || out < floorOut) revert BelowFloor(out, floorOut);
            if (out > maxPerTx) revert OverMaxPerTx(out, maxPerTx);
            _count(out);
        }
        emit Traded(token, buy, amountIn, out, buy ? amountIn : out, fee);
    }

    function _count(uint256 value) internal {
        if (volumeToday + value > dailyCap) revert OverDailyCap();
        volumeToday += value;
        totalVolume += value;
    }

    /// @notice Always reverts with QuoteResult(amountOut): what a trade would bring right now (eth_call).
    function quote(address token, bool buy, uint256 amountIn) external {
        if (!allowed[token]) revert NotAllowed();
        poolManager.unlock(abi.encode(Op.Quote, token, buy, amountIn, uint256(0)));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (Op op, address token, bool buy, uint256 amountIn, uint256 minOut) = abi.decode(data, (Op, address, bool, uint256, uint256));
        PoolKey memory key = _keys[token];
        bool usdcIs0 = Currency.unwrap(key.currency0) == usdc;
        bool zeroForOne = buy ? usdcIs0 : !usdcIs0; // a buy pays USDC in; a sell pays the token in
        (uint256 paid, uint256 out) = _swap(key, zeroForOne, amountIn);
        if (op == Op.Quote) revert QuoteResult(out);
        if (out < minOut) revert Slippage(out, minOut);
        Currency cin = zeroForOne ? key.currency0 : key.currency1;
        Currency cout = zeroForOne ? key.currency1 : key.currency0;
        poolManager.sync(cin);
        IERC20(Currency.unwrap(cin)).safeTransfer(address(poolManager), paid);
        poolManager.settle();
        poolManager.take(cout, address(this), out);
        return abi.encode(out);
    }

    function _swap(PoolKey memory key, bool zeroForOne, uint256 amountIn) internal returns (uint256 paid, uint256 out) {
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        BalanceDelta dl = poolManager.swap(key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }), "");
        int128 inD = zeroForOne ? dl.amount0() : dl.amount1();
        int128 outD = zeroForOne ? dl.amount1() : dl.amount0();
        paid = inD < 0 ? uint256(uint128(-inD)) : 0;
        out = outD > 0 ? uint256(uint128(outD)) : 0;
    }

    // ------------------------------------------------------------------ the owner
    /// @notice Let the agent trade `token`: its pool is copied from the factory's list now, so a later change
    ///         there doesn't change this vault until the owner allows the token again.
    function allowToken(address token) external onlyOwner {
        PoolKey memory key = factory.poolOf(token);
        if (Currency.unwrap(key.currency0) == address(0) && Currency.unwrap(key.currency1) == address(0)) revert NotAllowed();
        if (!allowed[token] && Currency.unwrap(_keys[token].currency1) == address(0)) _tokens.push(token);
        _keys[token] = key;
        allowed[token] = true;
        emit TokenAllowed(token, true, PoolId.unwrap(key.toId()));
    }
    function disallowToken(address token) external onlyOwner {
        if (!allowed[token]) revert NotAllowed();
        allowed[token] = false;
        emit TokenAllowed(token, false, PoolId.unwrap(_keys[token].toId()));
    }

    /// @notice Each tighter (or equal) limit applies now; if any is looser, the whole set is queued for LOOSEN_DELAY
    ///         (then applyLimits()). A new call replaces anything queued.
    function setLimits(uint256 _maxPerTx, uint256 _dailyCap, uint256 _cooldown) external onlyOwner {
        _checkLimits(_maxPerTx, _dailyCap, _cooldown);
        (maxPerTx, dailyCap, cooldown) = (Math.min(_maxPerTx, maxPerTx), Math.min(_dailyCap, dailyCap), Math.max(_cooldown, cooldown));
        emit Limits(maxPerTx, dailyCap, cooldown);
        if (_maxPerTx > maxPerTx || _dailyCap > dailyCap || _cooldown < cooldown) {
            uint64 readyAt = uint64(block.timestamp + LOOSEN_DELAY);
            pending = Pending(_maxPerTx, _dailyCap, _cooldown, readyAt);
            emit LimitsQueued(_maxPerTx, _dailyCap, _cooldown, readyAt);
        } else delete pending;
    }
    /// @notice Anyone can apply queued limits once their delay has passed.
    function applyLimits() external {
        Pending memory p = pending;
        if (p.readyAt == 0) revert NoPending();
        if (block.timestamp < p.readyAt) revert NotReady(p.readyAt);
        (maxPerTx, dailyCap, cooldown) = (p.maxPerTx, p.dailyCap, p.cooldown);
        delete pending;
        emit Limits(p.maxPerTx, p.dailyCap, p.cooldown);
    }
    function cancelPending() external onlyOwner { delete pending; }

    /// @notice How much of `token` one sell may give up, and the lowest price it may sell at (USDC units per token unit
    ///         × 1e18). A smaller amount or a higher floor applies now; the loosened parts wait LOOSEN_DELAY
    ///         (then applySellLimits(token)). A floor of 0 stops the agent selling the token.
    function setSellLimits(address token, uint256 maxSell, uint256 floorX18) external onlyOwner {
        uint256 m = Math.min(maxSell, maxSellPerTx[token]);
        uint256 f = Math.max(floorX18, minPriceX18[token]);
        (maxSellPerTx[token], minPriceX18[token]) = (m, f);
        emit SellLimits(token, m, f);
        if (maxSell > m || floorX18 < f) {
            uint64 readyAt = uint64(block.timestamp + LOOSEN_DELAY);
            sellPending[token] = SellPending(maxSell, floorX18, readyAt);
            emit SellLimitsQueued(token, maxSell, floorX18, readyAt);
        } else delete sellPending[token];
    }
    function applySellLimits(address token) external {
        SellPending memory p = sellPending[token];
        if (p.readyAt == 0) revert NoPending();
        if (block.timestamp < p.readyAt) revert NotReady(p.readyAt);
        (maxSellPerTx[token], minPriceX18[token]) = (p.maxSell, p.floor);
        delete sellPending[token];
        emit SellLimits(token, p.maxSell, p.floor);
    }
    function cancelSellPending(address token) external onlyOwner { delete sellPending[token]; }

    /// @notice The most $ARCIRCLE this vault will pay for one trade (≤ MAX_TRADE_FEE). A trade whose fee is higher
    ///         is refused, so a fee raise at the factory only reaches this vault if its owner agrees.
    function setMaxFee(uint256 f) external onlyOwner { if (f > MAX_TRADE_FEE) revert BadLimits(); maxFee = f; emit MaxFee(f); }

    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    /// @notice Turn the agent off (nobody can trade) or back on.
    function setAgentOn(bool on) external onlyOwner { agentOn = on; emit AgentOn(on); }
    /// @notice Hand the vault to another wallet: it takes over only once it calls acceptOwnership(). address(0) cancels.
    function transferOwnership(address o) external onlyOwner { pendingOwner = o; emit OwnerProposed(o); }
    function acceptOwnership() external {
        if (msg.sender != pendingOwner || msg.sender == address(0)) revert NotOwner();
        address from = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnerSet(msg.sender);
        factory.ownerMoved(from, msg.sender);
    }
    /// @notice Take anything out — always to the owner, at any time, paused or not.
    function withdraw(address tkn, uint256 amount) external onlyOwner {
        IERC20(tkn).safeTransfer(owner, amount);
        emit Withdrawn(tkn, amount);
    }

    function _checkLimits(uint256 _maxPerTx, uint256 _dailyCap, uint256 _cooldown) internal pure {
        if (_maxPerTx == 0 || _maxPerTx > MAX_PER_TX || _dailyCap < _maxPerTx || _cooldown < MIN_COOLDOWN) revert BadLimits();
    }
}

/// @title AGENT DIMENSION factory — one vault per player, the tokens agents may trade, the agent key and the fee.
contract AgentDimensionFactory {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    address public immutable usdc;
    address public immutable arcircle;
    uint256 public constant DELAY = 24 hours;
    uint256 public constant GRACE = 7 days; // a queued operator / fee must be applied within this after it's ready
    uint256 public constant MAX_TRADE_FEE = AD_MAX_TRADE_FEE;

    address public owner;
    address public pendingOwner;
    address public operator;
    address public pendingOperator;
    uint256 public operatorReadyAt;
    bool public paused;
    address public feeTo;
    uint256 public tradeFee; // $ARCIRCLE (18 decimals) per trade
    uint256 public pendingFee;
    uint256 public feeReadyAt;
    bool public allowNoHook = true;
    mapping(address => bool) public hookAllowed; // hooks are allowed by their exact address only

    mapping(address => PoolKey) internal _pools;
    address[] internal _listed;
    mapping(address => bool) public listed;

    mapping(address => address) public vaultOf; // player → their vault
    address[] public vaults;
    mapping(address => bool) public isVault;

    event VaultCreated(address indexed vault, address indexed owner);
    event VaultMoved(address indexed vault, address indexed from, address indexed to);
    event PoolListed(address indexed token, bytes32 poolId, bool listed);
    event OperatorQueued(address indexed operator, uint256 readyAt);
    event OperatorSet(address indexed operator);
    event FeeQueued(uint256 fee, uint256 readyAt);
    event FeeSet(uint256 fee);
    event FeeTo(address indexed feeTo);
    event Paused(bool paused);
    event HookAllowed(address hook, bool allowed);
    event AllowNoHook(bool allowed);
    event OwnerProposed(address indexed owner);
    event OwnerSet(address indexed owner);

    error NotOwner();
    error HasVault(address vault);
    error NotUsdcPool();
    error HookNotAllowed();
    error PoolNotLive();
    error NotListed();
    error NotReady(uint256 readyAt);
    error Stale();
    error BadFee();
    error NotVault();
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address _poolManager, address _usdc, address _arcircle, address _owner, address _operator, address _feeTo, uint256 _tradeFee) {
        if (_poolManager == address(0) || _usdc == address(0) || _arcircle == address(0) || _owner == address(0) || _operator == address(0) || _feeTo == address(0)) revert ZeroAddress();
        if (_tradeFee > MAX_TRADE_FEE) revert BadFee();
        poolManager = IPoolManager(_poolManager);
        usdc = _usdc;
        arcircle = _arcircle;
        owner = _owner;
        operator = _operator;
        feeTo = _feeTo;
        tradeFee = _tradeFee;
        emit OwnerSet(_owner);
        emit OperatorSet(_operator);
        emit FeeTo(_feeTo);
        emit FeeSet(_tradeFee);
    }

    /// @notice Open your vault (one per wallet). Limits in USDC (6 decimals, maxPerTx ≤ 100 USDC); cooldown in seconds.
    ///         The vault's maxFee starts at today's tradeFee: a later raise needs the owner's setMaxFee.
    function createVault(uint256 maxPerTx, uint256 dailyCap, uint256 cooldown) external returns (address v) {
        if (vaultOf[msg.sender] != address(0)) revert HasVault(vaultOf[msg.sender]);
        v = address(new AgentDimensionVault(poolManager, usdc, arcircle, msg.sender, maxPerTx, dailyCap, cooldown, tradeFee));
        vaultOf[msg.sender] = v;
        vaults.push(v);
        isVault[v] = true;
        emit VaultCreated(v, msg.sender);
    }

    /// @notice A vault tells the factory its owner changed (after acceptOwnership), so vaultOf stays right.
    ///         The new owner's own vault, if they already had one, stays theirs in vaultOf.
    function ownerMoved(address from, address to) external {
        if (!isVault[msg.sender]) revert NotVault();
        if (vaultOf[from] == msg.sender) delete vaultOf[from];
        if (vaultOf[to] == address(0)) vaultOf[to] = msg.sender;
        emit VaultMoved(msg.sender, from, to);
    }

    function poolOf(address token) external view returns (PoolKey memory) { if (!listed[token]) revert NotListed(); return _pools[token]; }
    function listedTokens() external view returns (address[] memory) { return _listed; }
    function vaultCount() external view returns (uint256) { return vaults.length; }

    // ------------------------------------------------------------------ the team
    /// @notice List a token agents may trade: its USDC pool on v4 (live, no hook or a hook allowed by its address).
    function listPool(PoolKey calldata key) external onlyOwner {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0) || c1 == address(0) || c0 == c1 || (c0 != usdc && c1 != usdc)) revert NotUsdcPool();
        address hook = address(key.hooks);
        if (hook == address(0) ? !allowNoHook : !hookAllowed[hook]) revert HookNotAllowed();
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        if (sqrtP == 0) revert PoolNotLive();
        address token = c0 == usdc ? c1 : c0;
        if (Currency.unwrap(_pools[token].currency1) == address(0)) _listed.push(token);
        _pools[token] = key;
        listed[token] = true;
        emit PoolListed(token, PoolId.unwrap(key.toId()), true);
    }
    /// @notice Stop new vaults from allowing a token (vaults that allowed it keep their copy until their owner says no).
    function unlistPool(address token) external onlyOwner { listed[token] = false; emit PoolListed(token, PoolId.unwrap(_pools[token].toId()), false); }

    /// @notice A new agent key is announced first and only takes over DELAY later, so players can turn their agent
    ///         off before an unexpected key can act. To stop at once: setPaused(true). Not applied within GRACE: stale.
    function queueOperator(address o) external onlyOwner {
        if (o == address(0)) revert ZeroAddress();
        pendingOperator = o;
        operatorReadyAt = block.timestamp + DELAY;
        emit OperatorQueued(o, operatorReadyAt);
    }
    function cancelOperator() external onlyOwner { pendingOperator = address(0); operatorReadyAt = 0; emit OperatorQueued(address(0), 0); }
    function applyOperator() external {
        address o = pendingOperator;
        if (o == address(0)) revert ZeroAddress();
        if (block.timestamp < operatorReadyAt) revert NotReady(operatorReadyAt);
        if (block.timestamp > operatorReadyAt + GRACE) revert Stale();
        operator = o;
        pendingOperator = address(0);
        operatorReadyAt = 0;
        emit OperatorSet(o);
    }
    /// @notice A lower fee applies now; a higher one waits DELAY (then applyFee()), so nobody pays more by surprise.
    ///         Never above MAX_TRADE_FEE; each vault also refuses a fee above its own maxFee.
    function setTradeFee(uint256 fee) external onlyOwner {
        if (fee > MAX_TRADE_FEE) revert BadFee();
        if (fee <= tradeFee) { tradeFee = fee; feeReadyAt = 0; pendingFee = 0; emit FeeSet(fee); return; }
        pendingFee = fee;
        feeReadyAt = block.timestamp + DELAY;
        emit FeeQueued(fee, feeReadyAt);
    }
    function cancelFee() external onlyOwner { pendingFee = 0; feeReadyAt = 0; emit FeeQueued(0, 0); }
    function applyFee() external {
        if (feeReadyAt == 0) revert NotReady(0);
        if (block.timestamp < feeReadyAt) revert NotReady(feeReadyAt);
        if (block.timestamp > feeReadyAt + GRACE) revert Stale();
        tradeFee = pendingFee;
        feeReadyAt = 0;
        emit FeeSet(tradeFee);
    }
    function setFeeTo(address f) external onlyOwner { if (f == address(0)) revert ZeroAddress(); feeTo = f; emit FeeTo(f); }
    /// @notice Stops every vault's trades at once (nobody's money moves; owners can still withdraw).
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setHookAllowed(address hook, bool allowed) external onlyOwner { hookAllowed[hook] = allowed; emit HookAllowed(hook, allowed); }
    function setAllowNoHook(bool allowed) external onlyOwner { allowNoHook = allowed; emit AllowNoHook(allowed); }
    /// @notice Two steps: the new owner takes over only once it calls acceptOwnership(). address(0) cancels.
    function transferOwnership(address o) external onlyOwner { pendingOwner = o; emit OwnerProposed(o); }
    function acceptOwnership() external {
        if (msg.sender != pendingOwner || msg.sender == address(0)) revert NotOwner();
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnerSet(msg.sender);
    }
}
