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

/// @title ARCIRCLE Orders fee burn — where ARCIRCLE Orders' 0.1% fees go
/// @notice Fees arrive in whatever token each side received. From here:
///           • USDC: `burnBps` of it buys $ARCIRCLE from its pool and sends it to 0x…dEaD (`burn`), the rest goes to
///             the ARCIRCLE PAD treasury;
///           • $ARCIRCLE: `burnBps` straight to 0x…dEaD, the rest to the treasury (`flush`);
///           • any other token: all of it to the treasury (`flush`).
///         Nothing here can send fees anywhere else. `burn` takes a minimum out, so only the operator (the ARCIRCLE
///         Orders executor) calls it; anyone can `flush`. The owner can only change the operator (or give up ownership).
contract ArcircleFeeBurn is IUnlockCallback {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    IPoolManager public immutable poolManager;
    address public immutable usdc;
    address public immutable arcircle;
    address public immutable treasury;
    uint256 public immutable burnBps; // share of each fee that's burned, in basis points
    PoolKey internal _key; // the $ARCIRCLE / USDC pool the burn buys from

    address public owner;
    address public operator;
    uint256 public totalUsdcSpent;
    uint256 public totalBurned;

    event Burned(uint256 usdcIn, uint256 arcircleBurned, uint256 usdcToTreasury);
    event Flushed(address indexed token, uint256 burned, uint256 toTreasury);
    event OperatorSet(address operator);
    event OwnerSet(address owner);

    error ZeroAddress();
    error BadPool();
    error BadShare();
    error NotOperator();
    error NotOwner();
    error UseBurn();
    error Nothing();
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 out);

    constructor(IPoolManager _pm, address _usdc, address _arcircle, address _treasury, uint256 _burnBps, PoolKey memory key, address _operator) {
        if (address(_pm) == address(0) || _usdc == address(0) || _arcircle == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_burnBps > 10_000) revert BadShare();
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (!((c0 == _usdc && c1 == _arcircle) || (c0 == _arcircle && c1 == _usdc))) revert BadPool();
        poolManager = _pm;
        usdc = _usdc;
        arcircle = _arcircle;
        treasury = _treasury;
        burnBps = _burnBps;
        _key = key;
        owner = msg.sender;
        operator = _operator;
        emit OwnerSet(msg.sender);
        emit OperatorSet(_operator);
    }

    function poolKey() external view returns (PoolKey memory) { return _key; }

    /// @notice Spends `burnBps` of the USDC held on $ARCIRCLE (at least `minOut`) and burns it; the rest of the USDC goes
    ///         to the treasury.
    function burn(uint256 minOut) external returns (uint256 out) {
        if (msg.sender != operator && msg.sender != owner) revert NotOperator();
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        uint256 spend = (bal * burnBps) / 10_000;
        if (spend == 0) revert Nothing();
        uint256 rest = bal - spend;
        if (rest > 0) IERC20(usdc).safeTransfer(treasury, rest);
        out = abi.decode(poolManager.unlock(abi.encode(false, spend)), (uint256));
        if (out < minOut) revert Slippage(out, minOut);
        totalUsdcSpent += spend;
        totalBurned += out;
        emit Burned(spend, out, rest);
    }

    /// @notice What `usdcIn` buys of $ARCIRCLE right now (tax and impact included). Always reverts with QuoteResult.
    function quote(uint256 usdcIn) external { poolManager.unlock(abi.encode(true, usdcIn)); }

    /// @notice Sends a token's fees on: $ARCIRCLE is `burnBps` burned, the rest (and every other token) to the treasury.
    function flush(address token) external {
        if (token == usdc) revert UseBurn();
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
        bool zeroForOne = Currency.unwrap(key.currency0) == usdc;
        BalanceDelta d = poolManager.swap(key,
            SwapParams({ zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1 }), "");
        int128 inD = zeroForOne ? d.amount0() : d.amount1();
        int128 outD = zeroForOne ? d.amount1() : d.amount0();
        uint256 paid = inD < 0 ? uint256(uint128(-inD)) : 0;
        uint256 out = outD > 0 ? uint256(uint128(outD)) : 0;
        if (isQuote) revert QuoteResult(out);
        poolManager.sync(zeroForOne ? key.currency0 : key.currency1);
        IERC20(usdc).safeTransfer(address(poolManager), paid);
        poolManager.settle();
        if (out > 0) poolManager.take(zeroForOne ? key.currency1 : key.currency0, DEAD, out);
        return abi.encode(out);
    }
}
