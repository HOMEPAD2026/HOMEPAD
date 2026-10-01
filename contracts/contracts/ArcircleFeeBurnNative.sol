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

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @title ARCIRCLE Orders fee burn (native ETH) — where ARCIRCLE Orders' 0.1% fees go on Robinhood Chain
/// @notice The ETH-chain twin of ArcircleFeeBurn: the base currency is WETH instead of USDC, and the $ARCIRCLE pool may
///         be paired with native ETH (currency 0x0) or WETH. Fees arrive in whatever token each side received. From here:
///           • WETH: `burnBps` of it buys $ARCIRCLE from its pool and sends it to 0x…dEaD (`burn`), the rest goes to
///             the ARCIRCLE PAD treasury;
///           • $ARCIRCLE: `burnBps` straight to 0x…dEaD, the rest to the treasury (`flush`);
///           • any other token: all of it to the treasury (`flush`).
///         Nothing here can send fees anywhere else. `burn` takes a minimum out, so only the operator (the ARCIRCLE
///         Orders executor) calls it; anyone can `flush`.
///         It's also ARCIRCLE Orders' fee policy: a wallet holding at least `discountMin` $ARCIRCLE trades fee-free.
///         The owner can change the operator and that threshold (a fee can only ever be waived, never raised), or give
///         up ownership.
contract ArcircleFeeBurnNative is IUnlockCallback {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    IPoolManager public immutable poolManager;
    address public immutable weth;
    address public immutable arcircle;
    address public immutable treasury;
    uint256 public immutable burnBps; // share of each fee that's burned, in basis points
    PoolKey internal _key; // the $ARCIRCLE / ETH (or WETH) pool the burn buys from

    address public owner;
    address public operator;
    uint256 public discountMin; // $ARCIRCLE (raw) a wallet holds to trade fee-free; 0 = no discount
    uint256 public totalEthSpent;
    uint256 public totalBurned;

    event Burned(uint256 ethIn, uint256 arcircleBurned, uint256 ethToTreasury);
    event Flushed(address indexed token, uint256 burned, uint256 toTreasury);
    event OperatorSet(address operator);
    event OwnerSet(address owner);
    event DiscountSet(uint256 discountMin);

    error ZeroAddress();
    error BadPool();
    error BadShare();
    error NotOperator();
    error NotOwner();
    error UseBurn();
    error Nothing();
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 out);

    constructor(IPoolManager _pm, address _weth, address _arcircle, address _treasury, uint256 _burnBps, PoolKey memory key, address _operator, uint256 _discountMin) {
        if (address(_pm) == address(0) || _weth == address(0) || _arcircle == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_burnBps > 10_000) revert BadShare();
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0)) c0 = _weth;
        if (!((c0 == _weth && c1 == _arcircle) || (c0 == _arcircle && c1 == _weth))) revert BadPool();
        poolManager = _pm;
        weth = _weth;
        arcircle = _arcircle;
        treasury = _treasury;
        burnBps = _burnBps;
        _key = key;
        owner = msg.sender;
        operator = _operator;
        discountMin = _discountMin;
        emit OwnerSet(msg.sender);
        emit OperatorSet(_operator);
        emit DiscountSet(_discountMin);
    }

    function poolKey() external view returns (PoolKey memory) { return _key; }

    /// ETH only arrives from WETH, when the burn unwraps it to pay a native-ETH pool
    receive() external payable {
        require(msg.sender == weth, "weth only");
    }

    /// @notice ARCIRCLE Orders asks this before taking its fee.
    function feeFree(address who) external view returns (bool) {
        uint256 m = discountMin;
        return m != 0 && IERC20(arcircle).balanceOf(who) >= m;
    }

    function setDiscountMin(uint256 m) external {
        if (msg.sender != owner) revert NotOwner();
        discountMin = m;
        emit DiscountSet(m);
    }

    /// @notice Spends `burnBps` of the WETH held on $ARCIRCLE (at least `minOut`) and burns it; the rest of the WETH goes
    ///         to the treasury.
    function burn(uint256 minOut) external returns (uint256 out) {
        if (msg.sender != operator && msg.sender != owner) revert NotOperator();
        uint256 bal = IERC20(weth).balanceOf(address(this));
        uint256 spend = (bal * burnBps) / 10_000;
        if (spend == 0) revert Nothing();
        uint256 rest = bal - spend;
        if (rest > 0) IERC20(weth).safeTransfer(treasury, rest);
        out = abi.decode(poolManager.unlock(abi.encode(false, spend)), (uint256));
        if (out < minOut) revert Slippage(out, minOut);
        totalEthSpent += spend;
        totalBurned += out;
        emit Burned(spend, out, rest);
    }

    /// @notice What `ethIn` buys of $ARCIRCLE right now (tax and impact included). Always reverts with QuoteResult.
    function quote(uint256 ethIn) external { poolManager.unlock(abi.encode(true, ethIn)); }

    /// @notice Sends a token's fees on: $ARCIRCLE is `burnBps` burned, the rest (and every other token) to the treasury.
    ///         WETH goes through `burn`; only the owner can flush it straight to the treasury (if the pool can't be traded).
    function flush(address token) external {
        if (token == weth && msg.sender != owner) revert UseBurn();
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) revert Nothing();
        uint256 burned = token == arcircle ? (bal * burnBps) / 10_000 : 0;
        if (burned > 0) IERC20(token).safeTransfer(DEAD, burned);
        if (bal > burned) IERC20(token).safeTransfer(treasury, bal - burned);
        if (token == arcircle) totalBurned += burned;
        emit Flushed(token, burned, bal - burned);
    }

    function setOperator(address op) external {
        if (msg.sender != owner) revert NotOwner();
        operator = op;
        emit OperatorSet(op);
    }

    /// @notice address(0) gives ownership up for good.
    function setOwner(address o) external {
        if (msg.sender != owner) revert NotOwner();
        owner = o;
        emit OwnerSet(o);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (bool isQuote, uint256 amountIn) = abi.decode(data, (bool, uint256));
        require(amountIn > 0 && amountIn <= uint256(type(int256).max), "amount");
        PoolKey memory key = _key;
        address c0 = Currency.unwrap(key.currency0);
        bool zeroForOne = c0 == weth || c0 == address(0);
        BalanceDelta d = poolManager.swap(key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }), "");
        int128 inD = zeroForOne ? d.amount0() : d.amount1();
        int128 outD = zeroForOne ? d.amount1() : d.amount0();
        uint256 paid = inD < 0 ? uint256(uint128(-inD)) : 0;
        uint256 out = outD > 0 ? uint256(uint128(outD)) : 0;
        if (isQuote) revert QuoteResult(out);
        Currency cin = zeroForOne ? key.currency0 : key.currency1;
        poolManager.sync(cin);
        if (Currency.unwrap(cin) == address(0)) {
            IWETH9(weth).withdraw(paid);
            poolManager.settle{value: paid}();
        } else {
            IERC20(weth).safeTransfer(address(poolManager), paid);
            poolManager.settle();
        }
        if (out > 0) poolManager.take(zeroForOne ? key.currency1 : key.currency0, DEAD, out);
        return abi.encode(out);
    }
}
