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

/// @title ARCIA AGENT — per-token agent vaults on Arc (ARCIRCLE PAD)
/// @notice Anyone can open a vault for an Arc token that trades against USDC on Uniswap v4.
///         People fund it with USDC; ARCIA (the factory's operator key) decides WHEN to spend it,
///         and the only thing she can do with it is buy that token and send it to 0x…dEaD.
///           • it only buys and burns: no function sells or moves the token anywhere but 0x…dEaD
///             (quoteRoundTrip simulates a buy and a sell and always reverts — nothing is kept)
///           • one buy ≤ maxBuy, all buys ≤ dailyCap a UTC day, at least `cooldown` seconds apart
///           • the owner tightens limits at once; loosening waits LOOSEN_DELAY (1 hour)
///           • the owner can pause, turn ARCIA off, and withdraw — always to the owner, at any time
///           • the factory owner can stop every vault at once (pause) but can't touch the money;
///             a new operator key only takes effect OPERATOR_DELAY after it's announced
interface IArciaAgentFactory {
    function operator() external view returns (address);
    function paused() external view returns (bool);
}

contract ArciaAgentVault is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IArciaAgentFactory public immutable factory;
    address public immutable usdc;
    address public immutable token;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant LOOSEN_DELAY = 1 hours;
    uint256 public constant MIN_COOLDOWN = 60;

    PoolKey internal _key;
    address public owner;
    bool public paused;
    bool public agentOn = true;

    uint256 public maxBuy; // USDC (6 decimals) per buy
    uint256 public dailyCap; // USDC per UTC day
    uint256 public cooldown; // seconds between buys
    struct Pending { uint256 maxBuy; uint256 dailyCap; uint256 cooldown; uint64 readyAt; }
    Pending public pending;

    uint256 public day;
    uint256 public spentToday;
    uint256 public lastBuyAt;
    uint256 public totalSpent; // USDC, all time
    uint256 public totalBurned; // token units, all time
    uint256 public buys;

    enum Op { Burn, Quote, RoundTrip }

    event Burned(uint256 usdcIn, uint256 tokensBurned);
    event Funded(address indexed from, uint256 amount);
    event Limits(uint256 maxBuy, uint256 dailyCap, uint256 cooldown);
    event LimitsQueued(uint256 maxBuy, uint256 dailyCap, uint256 cooldown, uint256 readyAt);
    event Paused(bool paused);
    event AgentOn(bool on);
    event OwnerSet(address indexed owner);
    event Withdrawn(address indexed token, uint256 amount);

    error NotOwner();
    error NotOperator();
    error IsPaused();
    error BadLimits();
    error OverMaxBuy();
    error OverDailyCap();
    error Cooldown(uint256 readyAt);
    error NotReady(uint256 readyAt);
    error NoPending();
    error ZeroMinOut();
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 tokensOut);
    error RoundTripResult(uint256 tokensOut, uint256 usdcBack);
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(IPoolManager _pm, address _usdc, address _owner, PoolKey memory key, uint256 _maxBuy, uint256 _dailyCap, uint256 _cooldown) {
        if (_owner == address(0)) revert ZeroAddress();
        poolManager = _pm;
        factory = IArciaAgentFactory(msg.sender);
        usdc = _usdc;
        address c0 = Currency.unwrap(key.currency0);
        token = c0 == _usdc ? Currency.unwrap(key.currency1) : c0;
        _key = key;
        owner = _owner;
        _checkLimits(_maxBuy, _dailyCap, _cooldown);
        (maxBuy, dailyCap, cooldown) = (_maxBuy, _dailyCap, _cooldown);
        emit OwnerSet(_owner);
        emit Limits(_maxBuy, _dailyCap, _cooldown);
    }

    // ------------------------------------------------------------------ views
    function poolKey() external view returns (PoolKey memory) { return _key; }
    function poolId() external view returns (bytes32) { return PoolId.unwrap(_key.toId()); }
    /// ARCIA's key while she's on; nobody when the owner has turned her off
    function operator() public view returns (address) { return agentOn ? factory.operator() : address(0); }
    function balance() external view returns (uint256) { return IERC20(usdc).balanceOf(address(this)); }
    function spendableToday() external view returns (uint256) {
        uint256 spent = block.timestamp / 1 days == day ? spentToday : 0;
        return spent >= dailyCap ? 0 : dailyCap - spent;
    }
    function nextBuyAt() external view returns (uint256) { return lastBuyAt == 0 ? 0 : lastBuyAt + cooldown; }

    // ------------------------------------------------------------------ funding (anyone)
    /// @notice Add USDC with an approval (a plain USDC transfer to this address works too).
    function fund(uint256 amount) external {
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    // ------------------------------------------------------------------ the agent (ARCIA)
    /// @notice Spend `usdcIn` on the token and send everything bought to 0x…dEaD.
    function buyAndBurn(uint256 usdcIn, uint256 minOut) external returns (uint256 out) {
        address op = operator();
        if (op == address(0) || msg.sender != op) revert NotOperator();
        if (paused || factory.paused()) revert IsPaused();
        if (minOut == 0) revert ZeroMinOut();
        if (usdcIn == 0 || usdcIn > maxBuy) revert OverMaxBuy();
        if (lastBuyAt != 0 && block.timestamp < lastBuyAt + cooldown) revert Cooldown(lastBuyAt + cooldown);
        uint256 d = block.timestamp / 1 days;
        if (d != day) { day = d; spentToday = 0; }
        if (spentToday + usdcIn > dailyCap) revert OverDailyCap();
        spentToday += usdcIn;
        lastBuyAt = block.timestamp;
        out = abi.decode(poolManager.unlock(abi.encode(Op.Burn, usdcIn, minOut)), (uint256));
        totalSpent += usdcIn;
        totalBurned += out;
        buys += 1;
        emit Burned(usdcIn, out);
    }

    // ------------------------------------------------------------------ quotes (anyone, eth_call)
    /// @notice Always reverts with QuoteResult(tokensOut): what `usdcIn` buys right now, taxes and impact included.
    function quote(uint256 usdcIn) external { poolManager.unlock(abi.encode(Op.Quote, usdcIn, uint256(0))); }
    /// @notice Always reverts with RoundTripResult(tokensOut, usdcBack): buy, then sell it all straight back — a tax check.
    function quoteRoundTrip(uint256 usdcIn) external { poolManager.unlock(abi.encode(Op.RoundTrip, usdcIn, uint256(0))); }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (Op op, uint256 amountIn, uint256 minOut) = abi.decode(data, (Op, uint256, uint256));
        PoolKey memory key = _key;
        bool usdcIs0 = Currency.unwrap(key.currency0) == usdc;
        if (op == Op.Quote) { (, uint256 o) = _swap(key, usdcIs0, amountIn); revert QuoteResult(o); }
        if (op == Op.RoundTrip) {
            (, uint256 got) = _swap(key, usdcIs0, amountIn);
            (, uint256 back) = _swap(key, !usdcIs0, got);
            revert RoundTripResult(got, back);
        }
        // Op.Burn: USDC in, the token out straight to 0x…dEaD
        (uint256 paid, uint256 out) = _swap(key, usdcIs0, amountIn);
        if (out < minOut) revert Slippage(out, minOut);
        Currency cin = usdcIs0 ? key.currency0 : key.currency1;
        Currency cout = usdcIs0 ? key.currency1 : key.currency0;
        poolManager.sync(cin);
        IERC20(usdc).safeTransfer(address(poolManager), paid);
        poolManager.settle();
        poolManager.take(cout, DEAD, out);
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
    /// @notice Tighter (or equal) limits apply now; anything looser waits LOOSEN_DELAY, then applyLimits().
    function setLimits(uint256 _maxBuy, uint256 _dailyCap, uint256 _cooldown) external onlyOwner {
        _checkLimits(_maxBuy, _dailyCap, _cooldown);
        if (_maxBuy <= maxBuy && _dailyCap <= dailyCap && _cooldown >= cooldown) {
            (maxBuy, dailyCap, cooldown) = (_maxBuy, _dailyCap, _cooldown);
            delete pending;
            emit Limits(_maxBuy, _dailyCap, _cooldown);
        } else {
            uint64 readyAt = uint64(block.timestamp + LOOSEN_DELAY);
            pending = Pending(_maxBuy, _dailyCap, _cooldown, readyAt);
            emit LimitsQueued(_maxBuy, _dailyCap, _cooldown, readyAt);
        }
    }
    /// @notice Anyone can apply queued limits once their delay has passed.
    function applyLimits() external {
        Pending memory p = pending;
        if (p.readyAt == 0) revert NoPending();
        if (block.timestamp < p.readyAt) revert NotReady(p.readyAt);
        (maxBuy, dailyCap, cooldown) = (p.maxBuy, p.dailyCap, p.cooldown);
        delete pending;
        emit Limits(p.maxBuy, p.dailyCap, p.cooldown);
    }
    function cancelPending() external onlyOwner { delete pending; }
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    /// @notice Turn ARCIA off (nobody can buy) or back on.
    function setAgentOn(bool on) external onlyOwner { agentOn = on; emit AgentOn(on); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
    /// @notice Take anything out — always to the owner, at any time, paused or not.
    function withdraw(address tkn, uint256 amount) external onlyOwner {
        IERC20(tkn).safeTransfer(owner, amount);
        emit Withdrawn(tkn, amount);
    }

    function _checkLimits(uint256 _maxBuy, uint256 _dailyCap, uint256 _cooldown) internal pure {
        if (_maxBuy == 0 || _dailyCap < _maxBuy || _cooldown < MIN_COOLDOWN) revert BadLimits();
    }
}

/// @title ARCIA AGENT factory — opens vaults, holds ARCIA's operator key and the global stop.
contract ArciaAgentFactory {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    address public immutable usdc;
    address public immutable arcircle;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant OPERATOR_DELAY = 24 hours;
    uint160 internal constant HOOK_MASK = 0x3FFF;

    address public owner;
    address public operator;
    address public pendingOperator;
    uint256 public operatorReadyAt;
    bool public paused;
    uint256 public createBurn; // $ARCIRCLE (18 decimals) burned to open a vault; 0 = free
    bool public allowNoHook = true;
    mapping(uint16 => bool) public hookPattern; // low 14 bits of hook addresses accepted (Argus)
    mapping(address => bool) public hookAllowed; // exact hook addresses accepted (ArcPad)

    address[] public vaults;
    mapping(address => bool) public isVault;
    mapping(address => address[]) internal _byToken;
    mapping(address => address[]) internal _byOwner;

    event VaultCreated(address indexed vault, address indexed token, address indexed owner, bytes32 poolId, uint256 arcircleBurned);
    event OperatorQueued(address indexed operator, uint256 readyAt);
    event OperatorSet(address indexed operator);
    event Paused(bool paused);
    event CreateBurn(uint256 amount);
    event HookPattern(uint16 pattern, bool allowed);
    event HookAllowed(address hook, bool allowed);
    event AllowNoHook(bool allowed);
    event OwnerSet(address indexed owner);

    error NotOwner();
    error NotUsdcPool();
    error HookNotAllowed();
    error PoolNotLive();
    error NotReady(uint256 readyAt);
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address _poolManager, address _usdc, address _arcircle, address _owner, address _operator) {
        if (_poolManager == address(0) || _usdc == address(0) || _owner == address(0) || _operator == address(0)) revert ZeroAddress();
        poolManager = IPoolManager(_poolManager);
        usdc = _usdc;
        arcircle = _arcircle;
        owner = _owner;
        operator = _operator;
        hookPattern[0x2044] = true; // Argus portals up to #7
        hookPattern[0x20cc] = true; // Argus Portal #8
        emit OwnerSet(_owner);
        emit OperatorSet(_operator);
    }

    /// @notice Open a vault for the pool's token. Limits in USDC (6 decimals); cooldown in seconds.
    function createVault(PoolKey calldata key, uint256 maxBuy, uint256 dailyCap, uint256 cooldown) external returns (address v) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0) || c1 == address(0) || c0 == c1 || (c0 != usdc && c1 != usdc)) revert NotUsdcPool();
        address hook = address(key.hooks);
        if (hook == address(0) ? !allowNoHook : !(hookAllowed[hook] || hookPattern[uint16(uint160(hook) & HOOK_MASK)])) revert HookNotAllowed();
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        if (sqrtP == 0) revert PoolNotLive();
        uint256 burned = createBurn;
        if (burned > 0) IERC20(arcircle).safeTransferFrom(msg.sender, DEAD, burned);
        v = address(new ArciaAgentVault(poolManager, usdc, msg.sender, key, maxBuy, dailyCap, cooldown));
        address token = c0 == usdc ? c1 : c0;
        vaults.push(v);
        isVault[v] = true;
        _byToken[token].push(v);
        _byOwner[msg.sender].push(v);
        emit VaultCreated(v, token, msg.sender, PoolId.unwrap(key.toId()), burned);
    }

    function vaultCount() external view returns (uint256) { return vaults.length; }
    function vaultsOf(address token) external view returns (address[] memory) { return _byToken[token]; }
    function vaultsBy(address who) external view returns (address[] memory) { return _byOwner[who]; }
    function allVaults() external view returns (address[] memory) { return vaults; }

    // ------------------------------------------------------------------ the team
    /// @notice A new ARCIA key is announced first and only takes over OPERATOR_DELAY later, so vault
    ///         owners can turn ARCIA off before an unexpected key can act. To stop at once: setPaused(true).
    function queueOperator(address o) external onlyOwner {
        if (o == address(0)) revert ZeroAddress();
        pendingOperator = o;
        operatorReadyAt = block.timestamp + OPERATOR_DELAY;
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
    /// @notice Stops every vault's buys at once (nobody's money moves; owners can still withdraw).
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setCreateBurn(uint256 amount) external onlyOwner { createBurn = amount; emit CreateBurn(amount); }
    function setHookPattern(uint16 pattern, bool allowed) external onlyOwner { hookPattern[pattern & 0x3FFF] = allowed; emit HookPattern(pattern & 0x3FFF, allowed); }
    function setHookAllowed(address hook, bool allowed) external onlyOwner { hookAllowed[hook] = allowed; emit HookAllowed(hook, allowed); }
    function setAllowNoHook(bool allowed) external onlyOwner { allowNoHook = allowed; emit AllowNoHook(allowed); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
}
