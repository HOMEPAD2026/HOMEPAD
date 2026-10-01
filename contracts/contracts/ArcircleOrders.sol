// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
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

/// Uniswap's Permit2 (AllowanceTransfer): makers who approved Permit2 once can allow this contract with a signature
interface IPermit2Transfer {
    function transferFrom(address from, address to, uint160 amount, address token) external;
}

/// who trades without the fee (ArcircleFeeBurn: holders of enough $ARCIRCLE)
interface IFeePolicy {
    function feeFree(address who) external view returns (bool);
}

/// @title ARCIRCLE Orders — limit, stop and market orders for any token with a Uniswap v4 pool on Arc
/// @notice Non-custodial. A maker signs an order (EIP-712): "sell `sellAmount` of `sell` for at least `buyAmount` of
///         `buy`, after the fee". Their tokens stay in their wallet; the only thing this contract can ever do with
///         them is carry out an order they signed, at their price or better. An order is filled
///           • against a Uniswap v4 pool (`fillPool`) once the pool reaches the maker's price, or
///           • against another signed order (`matchOrders`), wallet to wallet, both at their price or better.
///         A stop order (`triggerSqrtP`) only fills when its pool's price has crossed the trigger.
///         A timed order (`duration`) releases its `sellAmount` evenly from `start` to `start + duration` (TWAP / DCA):
///         at any moment only the released part can have been filled.
///         Orders that share a `group` (one-cancels-other, e.g. a take-profit and a stop-loss) can't both fill: the first
///         one to fill takes the group, and the others revert from then on.
///         `swapMarket` is a plain market order from the caller's own wallet.
///         Every fill pays 0.1% of what each side receives (`FEE_BPS`) to `treasury` — ArcircleFeeBurn, which buys and
///         burns $ARCIRCLE with part of it and passes the rest to the ARCIRCLE PAD treasury. Whoever `feePolicy` says
///         is fee-free (holders of enough $ARCIRCLE) pays nothing; the policy can only waive the fee, never raise it.
///         Tokens are pulled with a plain approval to this contract or, failing that, through Permit2.
///         Orders fill in parts; a maker can cancel one order (`cancel`) or all of them at once (`cancelAll`).
///         No owner, no admin, no pause, no upgrades.
contract ArcircleOrders is EIP712, IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    struct Order {
        address maker;
        address sell; // the token the maker gives
        address buy; // the token the maker receives
        uint256 sellAmount; // in total
        uint256 buyAmount; // the least the maker receives for all of `sellAmount`, after the fee
        uint160 triggerSqrtP; // 0 = a limit order; else a stop order on pool `poolId`
        bool triggerBelow; // stop: fill only while the pool's sqrtPriceX96 is ≤ (true) / ≥ (false) the trigger
        bytes32 poolId; // 0 = any pool of the pair; else only this pool
        uint64 expiry; // 0 = no expiry
        uint64 start; // timed orders: when the release begins
        uint32 duration; // 0 = all at once; else released evenly over this many seconds from `start`
        uint256 group; // 0 = none; else one-cancels-other with the maker's other orders of the same group
        uint32 epoch; // must equal epochOf[maker] (cancelAll moves it on)
        uint256 salt;
    }

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address sell,address buy,uint256 sellAmount,uint256 buyAmount,uint160 triggerSqrtP,bool triggerBelow,bytes32 poolId,uint64 expiry,uint64 start,uint32 duration,uint256 group,uint32 epoch,uint256 salt)"
    );
    uint256 public constant FEE_BPS = 10; // 0.1%
    uint8 internal constant VIA_POOL = 0;
    uint8 internal constant VIA_MATCH = 1;
    uint8 internal constant VIA_MARKET = 2;

    IPoolManager public immutable poolManager;
    address public immutable treasury;
    IPermit2Transfer public immutable permit2; // address(0) = plain approvals only
    IFeePolicy public immutable feePolicy; // address(0) = everyone pays the fee

    mapping(bytes32 => uint256) public filled; // of sellAmount
    mapping(bytes32 => bool) public cancelled;
    mapping(address => uint32) public epochOf;
    mapping(address => mapping(uint256 => bytes32)) public groupTakenBy; // maker → group → the order that filled first

    uint256 private lock = 1;

    event Filled(bytes32 indexed hash, address indexed maker, address indexed sell, address buy, uint256 sold, uint256 received, uint256 fee, uint8 via);
    event Cancelled(bytes32 indexed hash, address indexed maker);
    event CancelledAll(address indexed maker, uint32 epoch);

    error ZeroAddress();
    error Reentered();
    error BadSignature();
    error OrderCancelled();
    error OrderExpired();
    error StaleEpoch();
    error OverFill(uint256 remaining);
    error WrongPair();
    error WrongPool();
    error NotTriggered();
    error StopNotMatchable();
    error PriceNotMet(uint256 received, uint256 needed);
    error NotMaker();
    error NativeNotSupported();
    error QuoteResult(uint256 out);
    error NotReleased(uint256 released);
    error GroupTaken(bytes32 by);

    modifier once() {
        if (lock != 1) revert Reentered();
        lock = 2;
        _;
        lock = 1;
    }

    constructor(IPoolManager _poolManager, address _treasury, IPermit2Transfer _permit2, IFeePolicy _feePolicy) EIP712("ARCIRCLE Orders", "1") {
        if (address(_poolManager) == address(0) || _treasury == address(0)) revert ZeroAddress();
        poolManager = _poolManager;
        treasury = _treasury;
        permit2 = _permit2;
        feePolicy = _feePolicy;
    }

    // ------------------------------------------------------------------ views

    function hashOrder(Order calldata o) public view returns (bytes32) {
        // every field is a static type, so the struct encodes exactly as its members one after another (EIP-712 encodeData)
        return _hashTypedDataV4(keccak256(abi.encode(ORDER_TYPEHASH, o)));
    }

    /// @notice How much of `sellAmount` can be filled right now (0 once cancelled, expired, replaced by cancelAll or
    ///         beaten by another order of its group; a timed order only counts what's been released).
    function remaining(Order calldata o) external view returns (uint256) {
        bytes32 h = hashOrder(o);
        if (cancelled[h] || o.epoch != epochOf[o.maker] || (o.expiry != 0 && block.timestamp > o.expiry)) return 0;
        if (o.group != 0) { bytes32 g = groupTakenBy[o.maker][o.group]; if (g != bytes32(0) && g != h) return 0; }
        uint256 f = filled[h];
        uint256 r = released(o);
        return f >= r ? 0 : r - f;
    }

    /// @notice How much of a timed order's `sellAmount` has been released by now (all of it for other orders).
    function released(Order calldata o) public view returns (uint256) {
        if (o.duration == 0) return o.sellAmount;
        if (block.timestamp <= o.start) return 0;
        uint256 t = block.timestamp - o.start;
        return t >= o.duration ? o.sellAmount : Math.mulDiv(o.sellAmount, t, o.duration);
    }

    /// @notice The least the maker must receive, after the fee, for `amount` of their order's `sellAmount`.
    function owed(Order calldata o, uint256 amount) public pure returns (uint256) {
        return Math.mulDiv(amount, o.buyAmount, o.sellAmount, Math.Rounding.Ceil);
    }

    /// @notice The fee on `amount` received by `who`: 0.1%, or nothing if the fee policy says they're fee-free. A policy
    ///         that reverts or runs out of its gas never blocks a fill — the fee is simply charged.
    function feeOf(address who, uint256 amount) public view returns (uint256) {
        if (address(feePolicy) != address(0)) {
            (bool ok, bytes memory r) = address(feePolicy).staticcall{gas: 60_000}(abi.encodeCall(IFeePolicy.feeFree, (who)));
            if (ok && r.length >= 32 && abi.decode(r, (bool))) return 0;
        }
        return (amount * FEE_BPS) / 10_000;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ maker actions

    function cancel(Order calldata o) external {
        if (msg.sender != o.maker) revert NotMaker();
        bytes32 h = hashOrder(o);
        cancelled[h] = true;
        emit Cancelled(h, msg.sender);
    }

    /// @notice Cancels every order signed so far.
    function cancelAll() external {
        uint32 e = ++epochOf[msg.sender];
        emit CancelledAll(msg.sender, e);
    }

    // ------------------------------------------------------------------ fills

    /// @notice Fills `amount` of order `o` against pool `key`: pulls `amount` of `o.sell` from the maker, swaps it and
    ///         pays the maker what it brings, minus the fee — at least `owed(o, amount)`, or nothing happens.
    ///         Anyone may call it; the maker gets their price or better either way.
    function fillPool(Order calldata o, bytes calldata sig, uint256 amount, PoolKey calldata key) external once returns (uint256 net) {
        bytes32 h = _take(o, sig, amount);
        _pairOf(key, o.sell, o.buy);
        PoolId id = key.toId();
        if (o.poolId != bytes32(0) && PoolId.unwrap(id) != o.poolId) revert WrongPool();
        if (o.triggerSqrtP != 0) {
            (uint160 sqrtP,,,) = poolManager.getSlot0(id);
            if (o.triggerBelow ? sqrtP > o.triggerSqrtP : sqrtP < o.triggerSqrtP) revert NotTriggered();
        }
        uint256 fee;
        (net, fee) = _swapFor(o.maker, key, o.sell, o.buy, amount, o.maker);
        uint256 need = owed(o, amount);
        if (net < need) revert PriceNotMet(net, need);
        _pay(o.buy, o.maker, net, fee);
        emit Filled(h, o.maker, o.sell, o.buy, amount, net, fee, VIA_POOL);
    }

    /// @notice Two signed orders on opposite sides of a pair, settled wallet to wallet: `a` gives `aAmount` of
    ///         `a.sell`, `b` gives `bAmount` of `b.sell`, each receives the other's minus the fee — and each at least
    ///         what its own order asks for. Stop orders don't match.
    function matchOrders(Order calldata a, bytes calldata sa, Order calldata b, bytes calldata sb, uint256 aAmount, uint256 bAmount) external once {
        if (a.sell != b.buy || a.buy != b.sell || a.sell == a.buy) revert WrongPair();
        if (a.triggerSqrtP != 0 || b.triggerSqrtP != 0) revert StopNotMatchable();
        bytes32 ha = _take(a, sa, aAmount);
        bytes32 hb = _take(b, sb, bAmount);
        uint256 gotA = _pull(a.sell, a.maker, aAmount); // what arrived of a.sell (= b.buy)
        uint256 gotB = _pull(b.sell, b.maker, bAmount); // what arrived of b.sell (= a.buy)
        uint256 feeToA = feeOf(a.maker, gotB);
        uint256 feeToB = feeOf(b.maker, gotA);
        uint256 netA = gotB - feeToA;
        uint256 netB = gotA - feeToB;
        uint256 needA = owed(a, aAmount);
        if (netA < needA) revert PriceNotMet(netA, needA);
        uint256 needB = owed(b, bAmount);
        if (netB < needB) revert PriceNotMet(netB, needB);
        _pay(a.buy, a.maker, netA, feeToA);
        _pay(b.buy, b.maker, netB, feeToB);
        emit Filled(ha, a.maker, a.sell, a.buy, aAmount, netA, feeToA, VIA_MATCH);
        emit Filled(hb, b.maker, b.sell, b.buy, bAmount, netB, feeToB, VIA_MATCH);
    }

    /// @notice A market order from the caller's own wallet: `amountIn` of `sell` through pool `key`, at least `minNet`
    ///         of `buy` back after the fee.
    function swapMarket(PoolKey calldata key, address sell, address buy, uint256 amountIn, uint256 minNet) external once returns (uint256 net) {
        _pairOf(key, sell, buy);
        uint256 fee;
        (net, fee) = _swapFor(msg.sender, key, sell, buy, amountIn, msg.sender);
        if (net < minNet) revert PriceNotMet(net, minNet);
        _pay(buy, msg.sender, net, fee);
        emit Filled(bytes32(0), msg.sender, sell, buy, amountIn, net, fee, VIA_MARKET);
    }

    /// @notice What `amountIn` of `sell` would bring from pool `key` right now, before the fee. Always reverts with
    ///         QuoteResult(out) — read it with eth_call.
    function quote(PoolKey calldata key, address sell, uint256 amountIn) external {
        bool zeroForOne = Currency.unwrap(key.currency0) == sell;
        poolManager.unlock(abi.encode(true, key, zeroForOne, amountIn));
    }

    // ------------------------------------------------------------------ internals

    /// checks the order and its signature and books `amount` as filled
    function _take(Order calldata o, bytes calldata sig, uint256 amount) internal returns (bytes32 h) {
        h = hashOrder(o);
        if (cancelled[h]) revert OrderCancelled();
        if (o.epoch != epochOf[o.maker]) revert StaleEpoch();
        if (o.expiry != 0 && block.timestamp > o.expiry) revert OrderExpired();
        if (o.maker == address(0) || o.sellAmount == 0) revert ZeroAddress();
        uint256 f = filled[h];
        if (amount == 0 || f + amount > o.sellAmount) revert OverFill(o.sellAmount - f);
        if (o.duration != 0) { uint256 r = released(o); if (f + amount > r) revert NotReleased(r); }
        if (!SignatureChecker.isValidSignatureNow(o.maker, h, sig)) revert BadSignature();
        if (o.group != 0) {
            bytes32 g = groupTakenBy[o.maker][o.group];
            if (g == bytes32(0)) groupTakenBy[o.maker][o.group] = h;
            else if (g != h) revert GroupTaken(g);
        }
        filled[h] = f + amount;
    }

    function _pairOf(PoolKey calldata key, address sell, address buy) internal pure {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0) || c1 == address(0)) revert NativeNotSupported();
        if (!((c0 == sell && c1 == buy) || (c0 == buy && c1 == sell))) revert WrongPair();
    }

    /// pulls from `from` — with their approval to this contract, else through Permit2 — and returns what actually
    /// arrived (a token with a transfer tax delivers less)
    function _pull(address token, address from, uint256 amount) internal returns (uint256) {
        uint256 b0 = IERC20(token).balanceOf(address(this));
        if (address(permit2) == address(0) || IERC20(token).allowance(from, address(this)) >= amount) {
            IERC20(token).safeTransferFrom(from, address(this), amount);
        } else {
            if (amount > type(uint160).max) revert OverFill(amount);
            permit2.transferFrom(from, address(this), uint160(amount), token);
        }
        return IERC20(token).balanceOf(address(this)) - b0;
    }

    /// pulls `amount` of `sell` from `from`, swaps what arrived through `key`, refunds any input the pool didn't use;
    /// returns (net to the receiver, fee) of `buy`
    function _swapFor(address from, PoolKey calldata key, address sell, address buy, uint256 amount, address payee) internal returns (uint256 net, uint256 fee) {
        uint256 got = _pull(sell, from, amount);
        uint256 s0 = IERC20(sell).balanceOf(address(this));
        uint256 b0 = IERC20(buy).balanceOf(address(this));
        poolManager.unlock(abi.encode(false, key, Currency.unwrap(key.currency0) == sell, got));
        uint256 used = s0 - IERC20(sell).balanceOf(address(this));
        if (used < got) IERC20(sell).safeTransfer(from, got - used);
        uint256 out = IERC20(buy).balanceOf(address(this)) - b0;
        fee = feeOf(payee, out);
        net = out - fee;
    }

    function _pay(address token, address to, uint256 net, uint256 fee) internal {
        if (net > 0) IERC20(token).safeTransfer(to, net);
        if (fee > 0) IERC20(token).safeTransfer(treasury, fee);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (bool isQuote, PoolKey memory key, bool zeroForOne, uint256 amountIn) = abi.decode(data, (bool, PoolKey, bool, uint256));
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        BalanceDelta d = poolManager.swap(
            key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }),
            ""
        );
        int128 inD = zeroForOne ? d.amount0() : d.amount1();
        int128 outD = zeroForOne ? d.amount1() : d.amount0();
        uint256 paid = inD < 0 ? uint256(uint128(-inD)) : 0;
        uint256 out = outD > 0 ? uint256(uint128(outD)) : 0;
        if (isQuote) revert QuoteResult(out);
        Currency cin = zeroForOne ? key.currency0 : key.currency1;
        Currency cout = zeroForOne ? key.currency1 : key.currency0;
        poolManager.sync(cin);
        IERC20(Currency.unwrap(cin)).safeTransfer(address(poolManager), paid);
        poolManager.settle();
        if (out > 0) poolManager.take(cout, address(this), out);
        return "";
    }
}
