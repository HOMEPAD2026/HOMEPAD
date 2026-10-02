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
import {IV3Pool, IV3Factory, IWETH} from "./ArciaDeskRH.sol";

/// @title ARCIA AGENT (Robinhood Chain) — per-token burn vaults on Robinhood Chain (ARCIRCLE PAD)
/// @notice The Robinhood Chain twin of ArciaAgent.sol. Anyone opens a vault for a token that trades against ETH:
///         a Uniswap v3 pool of the v3 factory paired with WETH (pons and other v3 launches), or a Uniswap v4 pool
///         paired with native ETH or WETH (no hook, or a hook the team approved). People fund it with ETH (kept as
///         WETH); ARCIA (the factory's operator key) decides WHEN to spend it, and the only thing she can do with it
///         is buy that token and send it to 0x…dEaD.
///           • it only buys and burns: bought tokens go from the pool straight to 0x…dEaD and nothing sells them
///             (quote / quoteRoundTrip always revert — nothing is kept)
///           • one buy ≤ maxBuy, all buys ≤ dailyCap a UTC day, at least `cooldown` seconds apart (ETH, 18 decimals)
///           • the owner tightens limits at once; loosening waits LOOSEN_DELAY (1 hour)
///           • the owner can pause, turn ARCIA off, and withdraw — always to the owner, at any time
///           • a v4 buy can never take more ETH than asked (a hook can't make it cost more)
///           • the factory owner can stop every vault at once (pause) but can't touch the money;
///             a new operator key only takes effect OPERATOR_DELAY after it's announced
interface IArciaAgentFactoryRH {
    function operator() external view returns (address);
    function paused() external view returns (bool);
}

contract ArciaAgentVaultRH is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint160 internal constant MIN_SQRT = 4295128739 + 1;
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970342 - 1;

    IPoolManager public immutable poolManager;
    IArciaAgentFactoryRH public immutable factory;
    address public immutable weth;
    address public immutable token;
    address public immutable pool; // the Uniswap v3 pool, or address(0) for a v4 vault
    bool internal immutable wethIs0; // v3: WETH is the pool's token0
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant LOOSEN_DELAY = 1 hours;
    uint256 public constant MIN_COOLDOWN = 60;

    PoolKey internal _key; // v4 only
    address public owner;
    bool public paused;
    bool public agentOn = true;

    uint256 public maxBuy; // ETH (18 decimals) per buy
    uint256 public dailyCap; // ETH per UTC day
    uint256 public cooldown; // seconds between buys
    struct Pending { uint256 maxBuy; uint256 dailyCap; uint256 cooldown; uint64 readyAt; }
    Pending public pending;

    uint256 public day;
    uint256 public spentToday;
    uint256 public lastBuyAt;
    uint256 public totalSpent; // ETH, all time
    uint256 public totalBurned; // token units that reached 0x…dEaD, all time
    uint256 public buys;

    enum Op { Burn, Quote, RoundTrip }
    address private active; // the v3 pool a swap is running in (its callback may pay)

    event Burned(uint256 ethIn, uint256 tokensBurned);
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
    error OverPaid(uint256 paid, uint256 amountIn);
    error QuoteResult(uint256 tokensOut);
    error RoundTripResult(uint256 tokensOut, uint256 ethBack);
    error ZeroAddress();
    error BadCallback();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    /// @param _pool a v3 pool (then `key` is ignored), or address(0) and a v4 `key`
    constructor(IPoolManager _pm, address _weth, address _owner, address _pool, PoolKey memory key, address _token, bool _wethIs0, uint256 _maxBuy, uint256 _dailyCap, uint256 _cooldown) {
        if (_owner == address(0) || _token == address(0)) revert ZeroAddress();
        poolManager = _pm;
        factory = IArciaAgentFactoryRH(msg.sender);
        weth = _weth;
        token = _token;
        pool = _pool;
        wethIs0 = _wethIs0;
        if (_pool == address(0)) _key = key;
        owner = _owner;
        _checkLimits(_maxBuy, _dailyCap, _cooldown);
        (maxBuy, dailyCap, cooldown) = (_maxBuy, _dailyCap, _cooldown);
        emit OwnerSet(_owner);
        emit Limits(_maxBuy, _dailyCap, _cooldown);
    }

    // ------------------------------------------------------------------ funding (anyone)
    /// @notice ETH sent here becomes the vault's WETH (the WETH contract's own refunds are kept as ETH to pay a pool with).
    receive() external payable {
        if (msg.sender == weth) return;
        IWETH(weth).deposit{value: msg.value}();
        emit Funded(msg.sender, msg.value);
    }
    function fund() external payable {
        IWETH(weth).deposit{value: msg.value}();
        emit Funded(msg.sender, msg.value);
    }
    /// @notice Add WETH with an approval (a plain WETH transfer to this address works too).
    function fundWeth(uint256 amount) external {
        IERC20(weth).safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    // ------------------------------------------------------------------ views
    /// 3 = Uniswap v3 pool, 4 = Uniswap v4 pool
    function kind() external view returns (uint8) { return pool == address(0) ? 4 : 3; }
    function poolKey() external view returns (PoolKey memory) { return _key; }
    /// v4: the pool id; v3: the pool's address in the low 20 bytes
    function poolId() external view returns (bytes32) { return pool == address(0) ? PoolId.unwrap(_key.toId()) : bytes32(uint256(uint160(pool))); }
    /// ARCIA's key while she's on; nobody when the owner has turned her off
    function operator() public view returns (address) { return agentOn ? factory.operator() : address(0); }
    function balance() external view returns (uint256) { return IERC20(weth).balanceOf(address(this)); }
    function spendableToday() external view returns (uint256) {
        uint256 spent = block.timestamp / 1 days == day ? spentToday : 0;
        return spent >= dailyCap ? 0 : dailyCap - spent;
    }
    function nextBuyAt() external view returns (uint256) { return lastBuyAt == 0 ? 0 : lastBuyAt + cooldown; }

    // ------------------------------------------------------------------ the agent (ARCIA)
    /// @notice Spend `ethIn` of the vault's WETH on the token; everything bought goes straight to 0x…dEaD.
    ///         `minOut` is checked against what actually reached 0x…dEaD (a taxed token counts after its tax).
    function buyAndBurn(uint256 ethIn, uint256 minOut) external returns (uint256 out) {
        address op = operator();
        if (op == address(0) || msg.sender != op) revert NotOperator();
        if (paused || factory.paused()) revert IsPaused();
        if (minOut == 0) revert ZeroMinOut();
        if (ethIn == 0 || ethIn > maxBuy) revert OverMaxBuy();
        if (lastBuyAt != 0 && block.timestamp < lastBuyAt + cooldown) revert Cooldown(lastBuyAt + cooldown);
        uint256 d = block.timestamp / 1 days;
        if (d != day) { day = d; spentToday = 0; }
        if (spentToday + ethIn > dailyCap) revert OverDailyCap();
        spentToday += ethIn;
        lastBuyAt = block.timestamp;
        uint256 before = IERC20(token).balanceOf(DEAD);
        if (pool != address(0)) _swap3(wethIs0, ethIn, Op.Burn, DEAD);
        else poolManager.unlock(abi.encode(Op.Burn, ethIn));
        out = IERC20(token).balanceOf(DEAD) - before;
        if (out < minOut) revert Slippage(out, minOut);
        totalSpent += ethIn;
        totalBurned += out;
        buys += 1;
        emit Burned(ethIn, out);
    }

    // ------------------------------------------------------------------ quotes (anyone, eth_call)
    /// @notice Always reverts with QuoteResult(tokensOut): what `ethIn` buys right now (pool fee and impact; hook deltas on v4).
    function quote(uint256 ethIn) external {
        if (pool != address(0)) _swap3(wethIs0, ethIn, Op.Quote, address(this));
        else poolManager.unlock(abi.encode(Op.Quote, ethIn));
    }
    /// @notice Always reverts with RoundTripResult(tokensOut, ethBack): buy with `ethIn`, take the tokens, sell them all
    ///         straight back — transfer taxes and blocks included. v4 needs no money in the vault; v3 runs the buy for
    ///         real inside the call, so the vault must hold `ethIn` of WETH.
    function quoteRoundTrip(uint256 ethIn) external {
        if (pool != address(0)) {
            uint256 b0 = IERC20(token).balanceOf(address(this));
            _swap3(wethIs0, ethIn, Op.RoundTrip, address(this));
            uint256 got = IERC20(token).balanceOf(address(this)) - b0;
            uint256 back = _swap3(!wethIs0, got, Op.RoundTrip, address(this));
            revert RoundTripResult(got, back);
        }
        poolManager.unlock(abi.encode(Op.RoundTrip, ethIn));
    }

    // ------------------------------------------------------------------ Uniswap v3
    function _swap3(bool zeroForOne, uint256 amountIn, Op op, address to) internal returns (uint256 out) {
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        active = pool;
        (int256 a0, int256 a1) = IV3Pool(pool).swap(to, zeroForOne, int256(amountIn), zeroForOne ? MIN_SQRT : MAX_SQRT, abi.encode(op));
        active = address(0);
        int256 o = zeroForOne ? a1 : a0;
        out = o < 0 ? uint256(-o) : 0;
    }
    /// @notice Uniswap v3's swap callback: pays what the swap owes, only for this vault's own pool while it swaps.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        if (msg.sender != active || active == address(0)) revert BadCallback();
        Op op = abi.decode(data, (Op));
        if (op == Op.Quote) revert QuoteResult(uint256(-(amount0Delta < 0 ? amount0Delta : amount1Delta)));
        if (amount0Delta > 0) IERC20(IV3Pool(msg.sender).token0()).safeTransfer(msg.sender, uint256(amount0Delta));
        if (amount1Delta > 0) IERC20(IV3Pool(msg.sender).token1()).safeTransfer(msg.sender, uint256(amount1Delta));
    }

    // ------------------------------------------------------------------ Uniswap v4
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert BadCallback();
        (Op op, uint256 amountIn) = abi.decode(data, (Op, uint256));
        PoolKey memory key = _key;
        Currency eth = key.currency0; // native ETH (address 0) always sorts first; else WETH is either side
        Currency tok = key.currency1;
        if (Currency.unwrap(key.currency1) == weth) (eth, tok) = (key.currency1, key.currency0);
        bool ethIs0 = Currency.unwrap(eth) == Currency.unwrap(key.currency0);
        if (op == Op.Quote) {
            (, uint256 o) = _swap4(key, ethIs0, amountIn);
            revert QuoteResult(o);
        }
        if (op == Op.RoundTrip) {
            (, uint256 got) = _swap4(key, ethIs0, amountIn);
            uint256 held = _take(tok, got); // tokens actually received
            uint256 sent = _pay(tok, held); // tokens the pool actually got back
            (, uint256 back) = _swap4(key, !ethIs0, sent);
            revert RoundTripResult(held, back);
        }
        // Op.Burn: ETH in (unwrapped for a native pool), the token out straight to 0x…dEaD
        (uint256 paid, uint256 out) = _swap4(key, ethIs0, amountIn);
        if (paid > amountIn) revert OverPaid(paid, amountIn);
        if (paid > 0) {
            if (Currency.unwrap(eth) == address(0)) {
                IWETH(weth).withdraw(paid);
                poolManager.settle{value: paid}();
            } else _pay(eth, paid);
        }
        poolManager.take(tok, DEAD, out);
        return "";
    }
    function _swap4(PoolKey memory key, bool zeroForOne, uint256 amountIn) internal returns (uint256 paid, uint256 out) {
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        BalanceDelta d = poolManager.swap(key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }), "");
        int128 inD = zeroForOne ? d.amount0() : d.amount1();
        int128 outD = zeroForOne ? d.amount1() : d.amount0();
        paid = inD < 0 ? uint256(uint128(-inD)) : 0;
        out = outD > 0 ? uint256(uint128(outD)) : 0;
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
    /// @notice Take any token out (WETH included) — always to the owner, at any time, paused or not.
    function withdraw(address tkn, uint256 amount) external onlyOwner {
        IERC20(tkn).safeTransfer(owner, amount);
        emit Withdrawn(tkn, amount);
    }
    /// @notice Take WETH out as ETH — always to the owner.
    function withdrawETH(uint256 amount) external onlyOwner {
        IWETH(weth).withdraw(amount);
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "eth");
        emit Withdrawn(address(0), amount);
    }

    function _checkLimits(uint256 _maxBuy, uint256 _dailyCap, uint256 _cooldown) internal pure {
        if (_maxBuy == 0 || _dailyCap < _maxBuy || _cooldown < MIN_COOLDOWN) revert BadLimits();
    }
}

/// @title ARCIA AGENT factory (Robinhood Chain) — opens vaults, holds ARCIA's operator key and the global stop.
contract ArciaAgentFactoryRH {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IV3Factory public immutable v3Factory;
    address public immutable weth;
    address public immutable arcircle; // $ARCIRCLE on Robinhood Chain (burned to open a vault when createBurn > 0)
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant OPERATOR_DELAY = 24 hours;

    address public owner;
    address public operator;
    address public pendingOperator;
    uint256 public operatorReadyAt;
    bool public paused;
    uint256 public createBurn; // $ARCIRCLE (18 decimals) burned to open a vault; 0 = free
    bool public allowNoHook = true;
    mapping(address => bool) public hookAllowed; // v4 hooks the team accepts

    address[] public vaults;
    mapping(address => bool) public isVault;
    mapping(address => address[]) internal _byToken;
    mapping(address => address[]) internal _byOwner;

    event VaultCreated(address indexed vault, address indexed token, address indexed owner, bytes32 poolId, uint256 arcircleBurned);
    event OperatorQueued(address indexed operator, uint256 readyAt);
    event OperatorSet(address indexed operator);
    event Paused(bool paused);
    event CreateBurn(uint256 amount);
    event HookAllowed(address hook, bool allowed);
    event AllowNoHook(bool allowed);
    event OwnerSet(address indexed owner);

    error NotOwner();
    error NotEthPool();
    error NotFactoryPool();
    error HookNotAllowed();
    error PoolNotLive();
    error NotReady(uint256 readyAt);
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address _poolManager, address _v3Factory, address _weth, address _arcircle, address _owner, address _operator) {
        if (_poolManager == address(0) || _v3Factory == address(0) || _weth == address(0) || _owner == address(0) || _operator == address(0)) revert ZeroAddress();
        poolManager = IPoolManager(_poolManager);
        v3Factory = IV3Factory(_v3Factory);
        weth = _weth;
        arcircle = _arcircle;
        owner = _owner;
        operator = _operator;
        emit OwnerSet(_owner);
        emit OperatorSet(_operator);
    }

    /// @notice Open a vault for a Uniswap v3 pool of the v3 factory paired with WETH. Limits in ETH (18 decimals).
    function createVault3(address pool, uint256 maxBuy, uint256 dailyCap, uint256 cooldown) external returns (address v) {
        address t0 = IV3Pool(pool).token0();
        address t1 = IV3Pool(pool).token1();
        if (t0 != weth && t1 != weth) revert NotEthPool();
        if (v3Factory.getPool(t0, t1, IV3Pool(pool).fee()) != pool) revert NotFactoryPool();
        (bool ok, bytes memory s0) = pool.staticcall(abi.encodeWithSignature("slot0()"));
        if (!ok || s0.length < 32 || abi.decode(s0, (uint256)) == 0) revert PoolNotLive();
        address token = t0 == weth ? t1 : t0;
        PoolKey memory none;
        v = _open(token, pool, none, t0 == weth, maxBuy, dailyCap, cooldown, bytes32(uint256(uint160(pool))));
    }

    /// @notice Open a vault for a Uniswap v4 pool paired with native ETH or WETH (no hook, or an approved one).
    function createVault4(PoolKey calldata key, uint256 maxBuy, uint256 dailyCap, uint256 cooldown) external returns (address v) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        address token;
        if (c0 == address(0) || c0 == weth) token = c1;
        else if (c1 == weth) token = c0;
        else revert NotEthPool();
        if (token == address(0) || token == weth) revert NotEthPool();
        address hook = address(key.hooks);
        if (hook == address(0) ? !allowNoHook : !hookAllowed[hook]) revert HookNotAllowed();
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        if (sqrtP == 0) revert PoolNotLive();
        v = _open(token, address(0), key, false, maxBuy, dailyCap, cooldown, PoolId.unwrap(key.toId()));
    }

    function _open(address token, address pool, PoolKey memory key, bool wethIs0, uint256 maxBuy, uint256 dailyCap, uint256 cooldown, bytes32 id) internal returns (address v) {
        uint256 burned = createBurn;
        if (burned > 0) IERC20(arcircle).safeTransferFrom(msg.sender, DEAD, burned);
        v = address(new ArciaAgentVaultRH(poolManager, weth, msg.sender, pool, key, token, wethIs0, maxBuy, dailyCap, cooldown));
        vaults.push(v);
        isVault[v] = true;
        _byToken[token].push(v);
        _byOwner[msg.sender].push(v);
        emit VaultCreated(v, token, msg.sender, id, burned);
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
    function setCreateBurn(uint256 amount) external onlyOwner { if (amount > 0 && arcircle == address(0)) revert ZeroAddress(); createBurn = amount; emit CreateBurn(amount); }
    function setHookAllowed(address hook, bool allowed) external onlyOwner { hookAllowed[hook] = allowed; emit HookAllowed(hook, allowed); }
    function setAllowNoHook(bool allowed) external onlyOwner { allowNoHook = allowed; emit AllowNoHook(allowed); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert ZeroAddress(); owner = o; emit OwnerSet(o); }
}
