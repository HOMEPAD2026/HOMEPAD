// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/// @title AGENT DIMENSION — a player's own trading vault, run by their AI agent (ARCIRCLE WORLD)
/// @notice One vault per player. The player funds it with USDC (and a little $ARCIRCLE for fees) and picks the
///         tokens their agent may trade; the agent (the factory's operator key, driven by the rules the player set
///         in the game) decides WHEN to buy or sell them against USDC on Uniswap v4.
///           • one trade is worth at most maxPerTx USDC, and never more than MAX_PER_TX (100 USDC) — a hard cap
///           • all trades ≤ dailyCap USDC a UTC day, at least `cooldown` seconds apart
///           • each trade pays the factory's tradeFee in $ARCIRCLE from the vault to feeTo
///           • what it buys and sells stays in the vault; only the owner can take anything out, always to the owner
///           • only tokens the owner allowed (each one's pool copied from the factory's list when allowed)
///           • the owner tightens limits at once; loosening waits LOOSEN_DELAY (1 hour)
///           • the owner can pause it or turn the agent off; the factory owner can stop every vault at once
///           • a new operator key, and a higher fee, only take effect 24 hours after they're announced
interface IAgentDimensionFactory {
    function operator() external view returns (address);
    function paused() external view returns (bool);
    function feeTo() external view returns (address);
    function tradeFee() external view returns (uint256);
    function poolOf(address token) external view returns (PoolKey memory);
}

contract AgentDimensionVault is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint256 public constant MAX_PER_TX = 100e6; // 100 USDC (6 decimals): no limit can go above this
    uint256 public constant LOOSEN_DELAY = 1 hours;
    uint256 public constant MIN_COOLDOWN = 60;

    IPoolManager public immutable poolManager;
    IAgentDimensionFactory public immutable factory;
    address public immutable usdc;
    address public immutable arcircle;

    address public owner;
    bool public paused;
    bool public agentOn = true;

    uint256 public maxPerTx; // USDC per trade
    uint256 public dailyCap; // USDC per UTC day (buys and sells together)
    uint256 public cooldown; // seconds between trades
    struct Pending { uint256 maxPerTx; uint256 dailyCap; uint256 cooldown; uint64 readyAt; }
    Pending public pending;

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
    event Paused(bool paused);
    event AgentOn(bool on);
    event OwnerSet(address indexed owner);
    event Withdrawn(address indexed token, uint256 amount);

    error NotOwner();
    error NotOperator();
    error IsPaused();
    error BadLimits();
    error NotAllowed();
    error OverMaxPerTx(uint256 usdcValue, uint256 maxPerTx);
    error OverDailyCap();
    error Cooldown(uint256 readyAt);
    error NotReady(uint256 readyAt);
    error NoPending();
    error ZeroAmount();
    error ZeroMinOut();
    error NoFeeBalance(uint256 need, uint256 have);
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 amountOut);
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(IPoolManager _pm, address _usdc, address _arcircle, address _owner, uint256 _maxPerTx, uint256 _dailyCap, uint256 _cooldown) {
        if (_owner == address(0)) revert ZeroAddress();
        poolManager = _pm;
        factory = IAgentDimensionFactory(msg.sender);
        usdc = _usdc;
        arcircle = _arcircle;
        owner = _owner;
        _checkLimits(_maxPerTx, _dailyCap, _cooldown);
        (maxPerTx, dailyCap, cooldown) = (_maxPerTx, _dailyCap, _cooldown);
        emit OwnerSet(_owner);
        emit Limits(_maxPerTx, _dailyCap, _cooldown);
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
    /// @notice Buy `token` with `amountIn` USDC (buy) or sell `amountIn` of it for USDC (sell). The trade's USDC side
    ///         must be ≤ maxPerTx (≤ 100 USDC); what comes out stays here. Pays tradeFee in $ARCIRCLE.
    function trade(address token, bool buy, uint256 amountIn, uint256 minOut) external returns (uint256 out) {
        address op = operator();
        if (op == address(0) || msg.sender != op) revert NotOperator();
        if (paused || factory.paused()) revert IsPaused();
        if (!allowed[token]) revert NotAllowed();
        if (amountIn == 0) revert ZeroAmount();
        if (minOut == 0) revert ZeroMinOut();
        if (buy && amountIn > maxPerTx) revert OverMaxPerTx(amountIn, maxPerTx);
        if (lastTradeAt != 0 && block.timestamp < lastTradeAt + cooldown) revert Cooldown(lastTradeAt + cooldown);
        uint256 fee = factory.tradeFee();
        if (fee > 0) {
            uint256 have = IERC20(arcircle).balanceOf(address(this));
            if (have < fee) revert NoFeeBalance(fee, have);
            IERC20(arcircle).safeTransfer(factory.feeTo(), fee);
        }
        out = abi.decode(poolManager.unlock(abi.encode(Op.Trade, token, buy, amountIn, minOut)), (uint256));
        uint256 value = buy ? amountIn : out; // the trade's worth in USDC
        if (value > maxPerTx) revert OverMaxPerTx(value, maxPerTx);
        uint256 d = block.timestamp / 1 days;
        if (d != day) { day = d; volumeToday = 0; }
        if (volumeToday + value > dailyCap) revert OverDailyCap();
        volumeToday += value;
        lastTradeAt = block.timestamp;
        totalVolume += value;
        totalFees += fee;
        trades += 1;
        emit Traded(token, buy, amountIn, out, value, fee);
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
    function disallowToken(address token) external onlyOwner { allowed[token] = false; emit TokenAllowed(token, false, PoolId.unwrap(_keys[token].toId())); }
    /// @notice Tighter (or equal) limits apply now; anything looser waits LOOSEN_DELAY, then applyLimits().
    function setLimits(uint256 _maxPerTx, uint256 _dailyCap, uint256 _cooldown) external onlyOwner {
        _checkLimits(_maxPerTx, _dailyCap, _cooldown);
        if (_maxPerTx <= maxPerTx && _dailyCap <= dailyCap && _cooldown >= cooldown) {
            (maxPerTx, dailyCap, cooldown) = (_maxPerTx, _dailyCap, _cooldown);
            delete pending;
            emit Limits(_maxPerTx, _dailyCap, _cooldown);
        } else {
            uint64 readyAt = uint64(block.timestamp + LOOSEN_DELAY);
            pending = Pending(_maxPerTx, _dailyCap, _cooldown, readyAt);
            emit LimitsQueued(_maxPerTx, _dailyCap, _cooldown, readyAt);
        }
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
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    /// @notice Turn the agent off (nobody can trade) or back on.
    function setAgentOn(bool on) external onlyOwner { agentOn = on; emit AgentOn(on); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
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
    uint160 internal constant HOOK_MASK = 0x3FFF;

    address public owner;
    address public operator;
    address public pendingOperator;
    uint256 public operatorReadyAt;
    bool public paused;
    address public feeTo;
    uint256 public tradeFee; // $ARCIRCLE (18 decimals) per trade
    uint256 public pendingFee;
    uint256 public feeReadyAt;
    bool public allowNoHook = true;
    mapping(uint16 => bool) public hookPattern;
    mapping(address => bool) public hookAllowed;

    mapping(address => PoolKey) internal _pools;
    address[] internal _listed;
    mapping(address => bool) public listed;

    mapping(address => address) public vaultOf; // player → their vault
    address[] public vaults;
    mapping(address => bool) public isVault;

    event VaultCreated(address indexed vault, address indexed owner);
    event PoolListed(address indexed token, bytes32 poolId, bool listed);
    event OperatorQueued(address indexed operator, uint256 readyAt);
    event OperatorSet(address indexed operator);
    event FeeQueued(uint256 fee, uint256 readyAt);
    event FeeSet(uint256 fee);
    event FeeTo(address indexed feeTo);
    event Paused(bool paused);
    event HookPattern(uint16 pattern, bool allowed);
    event HookAllowed(address hook, bool allowed);
    event AllowNoHook(bool allowed);
    event OwnerSet(address indexed owner);

    error NotOwner();
    error HasVault(address vault);
    error NotUsdcPool();
    error HookNotAllowed();
    error PoolNotLive();
    error NotListed();
    error NotReady(uint256 readyAt);
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address _poolManager, address _usdc, address _arcircle, address _owner, address _operator, address _feeTo, uint256 _tradeFee) {
        if (_poolManager == address(0) || _usdc == address(0) || _arcircle == address(0) || _owner == address(0) || _operator == address(0) || _feeTo == address(0)) revert ZeroAddress();
        poolManager = IPoolManager(_poolManager);
        usdc = _usdc;
        arcircle = _arcircle;
        owner = _owner;
        operator = _operator;
        feeTo = _feeTo;
        tradeFee = _tradeFee;
        hookPattern[0x2044] = true; // Argus portals up to #7
        hookPattern[0x20cc] = true; // Argus Portal #8
        emit OwnerSet(_owner);
        emit OperatorSet(_operator);
        emit FeeTo(_feeTo);
        emit FeeSet(_tradeFee);
    }

    /// @notice Open your vault (one per wallet). Limits in USDC (6 decimals, maxPerTx ≤ 100 USDC); cooldown in seconds.
    function createVault(uint256 maxPerTx, uint256 dailyCap, uint256 cooldown) external returns (address v) {
        if (vaultOf[msg.sender] != address(0)) revert HasVault(vaultOf[msg.sender]);
        v = address(new AgentDimensionVault(poolManager, usdc, arcircle, msg.sender, maxPerTx, dailyCap, cooldown));
        vaultOf[msg.sender] = v;
        vaults.push(v);
        isVault[v] = true;
        emit VaultCreated(v, msg.sender);
    }

    function poolOf(address token) external view returns (PoolKey memory) { if (!listed[token]) revert NotListed(); return _pools[token]; }
    function listedTokens() external view returns (address[] memory) { return _listed; }
    function vaultCount() external view returns (uint256) { return vaults.length; }

    // ------------------------------------------------------------------ the team
    /// @notice List a token agents may trade: its USDC pool on v4 (live, with an accepted hook).
    function listPool(PoolKey calldata key) external onlyOwner {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0) || c1 == address(0) || c0 == c1 || (c0 != usdc && c1 != usdc)) revert NotUsdcPool();
        address hook = address(key.hooks);
        if (hook == address(0) ? !allowNoHook : !(hookAllowed[hook] || hookPattern[uint16(uint160(hook) & HOOK_MASK)])) revert HookNotAllowed();
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
    ///         off before an unexpected key can act. To stop at once: setPaused(true).
    function queueOperator(address o) external onlyOwner {
        if (o == address(0)) revert ZeroAddress();
        pendingOperator = o;
        operatorReadyAt = block.timestamp + DELAY;
        emit OperatorQueued(o, operatorReadyAt);
    }
    function applyOperator() external {
        address o = pendingOperator;
        if (o == address(0)) revert ZeroAddress();
        if (block.timestamp < operatorReadyAt) revert NotReady(operatorReadyAt);
        operator = o;
        pendingOperator = address(0);
        operatorReadyAt = 0;
        emit OperatorSet(o);
    }
    /// @notice A lower fee applies now; a higher one waits DELAY (then applyFee()), so nobody pays more by surprise.
    function setTradeFee(uint256 fee) external onlyOwner {
        if (fee <= tradeFee) { tradeFee = fee; feeReadyAt = 0; pendingFee = 0; emit FeeSet(fee); return; }
        pendingFee = fee;
        feeReadyAt = block.timestamp + DELAY;
        emit FeeQueued(fee, feeReadyAt);
    }
    function applyFee() external {
        if (feeReadyAt == 0) revert NotReady(0);
        if (block.timestamp < feeReadyAt) revert NotReady(feeReadyAt);
        tradeFee = pendingFee;
        feeReadyAt = 0;
        emit FeeSet(tradeFee);
    }
    function setFeeTo(address f) external onlyOwner { if (f == address(0)) revert ZeroAddress(); feeTo = f; emit FeeTo(f); }
    /// @notice Stops every vault's trades at once (nobody's money moves; owners can still withdraw).
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setHookPattern(uint16 pattern, bool allowed) external onlyOwner { hookPattern[pattern & 0x3FFF] = allowed; emit HookPattern(pattern & 0x3FFF, allowed); }
    function setHookAllowed(address hook, bool allowed) external onlyOwner { hookAllowed[hook] = allowed; emit HookAllowed(hook, allowed); }
    function setAllowNoHook(bool allowed) external onlyOwner { allowNoHook = allowed; emit AllowNoHook(allowed); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
}
