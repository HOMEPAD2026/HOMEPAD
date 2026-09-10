// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

/// @title HOMEPAD Bonding Curve (Uniswap V4)
/// @notice Same mechanics, fee model, and graduation guarantees as
///         BondingCurve.sol (see that file's header — this one is
///         identical except for what happens at graduation).
///
///         V2's graduation called router.addLiquidityETH() and burned the
///         resulting ERC-20 LP token. V4 has no such router call — pools
///         live inside one shared PoolManager contract, and adding
///         liquidity means directly calling into it via the "unlock"
///         pattern: unlock() -> our unlockCallback() -> initialize the
///         pool if needed -> modifyLiquidity() -> settle what we owe.
///
///         There's no LP token to burn here. A V4 liquidity position is
///         just an internal ledger entry keyed to whichever address called
///         modifyLiquidity — in this case, this contract itself. Since this
///         contract has no function that could ever call modifyLiquidity
///         again with a negative delta (no withdraw function exists,
///         full stop), the liquidity is permanently locked by omission,
///         the same practical guarantee the V2 version got by burning an
///         LP token — just without needing that extra step.
contract BondingCurveV4 is ReentrancyGuard, IUnlockCallback {
    IERC20 public immutable token;
    address public immutable creator;
    address public immutable homeTreasury;
    address public immutable platformWallet;
    IPoolManager public immutable poolManager;
    uint24 public immutable poolFee;       // e.g. 3000 = 0.3%, Uniswap's standard tier
    int24 public immutable tickSpacing;    // e.g. 60, matching the 0.3% tier convention

    uint256 public immutable totalSupply;
    uint256 public immutable graduationThreshold;

    uint16 public immutable baseFeeBps;
    uint16 public immutable extraFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable homeShareBps;

    uint256 public virtualEthReserve;
    uint256 public virtualTokenReserve;

    uint256 public ethRaised;
    uint256 public tokensSold;
    bool public graduated;

    event Buy(address indexed buyer, uint256 ethIn, uint256 feePaid, uint256 tokensOut);
    event Sell(address indexed seller, uint256 tokensIn, uint256 feePaid, uint256 ethOut);
    event Graduated(uint256 ethToLiquidity, uint256 tokensToLiquidity, uint128 liquidity, int24 tickLower, int24 tickUpper);

    constructor(
        address token_,
        address creator_,
        address homeTreasury_,
        address platformWallet_,
        address poolManager_,
        uint24 poolFee_,
        int24 tickSpacing_,
        uint256 totalSupply_,
        uint256 initialVirtualEth_,
        uint256 graduationThreshold_,
        uint16 baseFeeBps_,
        uint16 extraFeeBps_,
        uint16 creatorShareBps_,
        uint16 homeShareBps_
    ) {
        require(creator_ != address(0) && homeTreasury_ != address(0) && platformWallet_ != address(0), "zero address");
        require(poolManager_ != address(0), "pool manager required");
        require(baseFeeBps_ + extraFeeBps_ <= 1000, "fee too high");
        require(extraFeeBps_ <= 200, "extra fee capped at 2%");
        require(creatorShareBps_ <= 10000, "bad creator split");
        require(homeShareBps_ <= 10000, "bad home split");

        token = IERC20(token_);
        creator = creator_;
        homeTreasury = homeTreasury_;
        platformWallet = platformWallet_;
        poolManager = IPoolManager(poolManager_);
        poolFee = poolFee_;
        tickSpacing = tickSpacing_;
        totalSupply = totalSupply_;
        graduationThreshold = graduationThreshold_;
        baseFeeBps = baseFeeBps_;
        extraFeeBps = extraFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;

        virtualEthReserve = initialVirtualEth_;
        virtualTokenReserve = totalSupply_;
    }

    modifier notGraduated() {
        require(!graduated, "graduated: trade on the DEX pool now");
        _;
    }

    function totalFeeBps() public view returns (uint16) {
        return baseFeeBps + extraFeeBps;
    }

    // ---------- Trading (identical to the V2 curve — see BondingCurve.sol) ----------

    function buy(uint256 minTokensOut, address recipient) external payable nonReentrant notGraduated {
        require(msg.value > 0, "send ETH");
        require(recipient != address(0), "zero recipient");

        uint256 fee = (msg.value * totalFeeBps()) / 10000;
        uint256 ethIn = msg.value - fee;

        uint256 k = virtualEthReserve * virtualTokenReserve;
        uint256 newVirtualEth = virtualEthReserve + ethIn;
        uint256 newVirtualToken = k / newVirtualEth;
        uint256 tokensOut = virtualTokenReserve - newVirtualToken;

        require(tokensOut >= minTokensOut, "slippage");
        require(tokensOut <= token.balanceOf(address(this)), "curve depleted");

        virtualEthReserve = newVirtualEth;
        virtualTokenReserve = newVirtualToken;
        ethRaised += ethIn;
        tokensSold += tokensOut;

        _routeFee(fee);
        require(token.transfer(recipient, tokensOut), "token transfer failed");

        emit Buy(recipient, msg.value, fee, tokensOut);

        if (ethRaised >= graduationThreshold) {
            _graduate();
        }
    }

    function sell(uint256 tokenAmount, uint256 minEthOut) external nonReentrant notGraduated {
        require(tokenAmount > 0, "amount = 0");

        uint256 k = virtualEthReserve * virtualTokenReserve;
        uint256 newVirtualToken = virtualTokenReserve + tokenAmount;
        uint256 newVirtualEth = k / newVirtualToken;
        uint256 ethOutGross = virtualEthReserve - newVirtualEth;

        uint256 available = address(this).balance;
        if (ethOutGross > available) {
            ethOutGross = available;
        }

        uint256 fee = (ethOutGross * totalFeeBps()) / 10000;
        uint256 ethOutNet = ethOutGross - fee;
        require(ethOutNet >= minEthOut, "slippage");

        virtualEthReserve = newVirtualEth;
        virtualTokenReserve = newVirtualToken;
        ethRaised -= ethOutGross;
        tokensSold -= tokenAmount;

        require(token.transferFrom(msg.sender, address(this), tokenAmount), "token transfer failed");
        _routeFee(fee);
        (bool sent, ) = msg.sender.call{value: ethOutNet}("");
        require(sent, "eth send failed");

        emit Sell(msg.sender, tokenAmount, fee, ethOutNet);
    }

    function _routeFee(uint256 fee) internal {
        if (fee == 0) return;

        uint16 total = totalFeeBps();
        uint256 baseFeePortion = total > 0 ? (fee * baseFeeBps) / total : 0;
        uint256 extraFeePortion = fee - baseFeePortion;

        uint256 creatorFromBase = (baseFeePortion * creatorShareBps) / 10000;
        uint256 platformFromBase = baseFeePortion - creatorFromBase;

        uint256 toHome = (platformFromBase * homeShareBps) / 10000;
        uint256 toPlatform = platformFromBase - toHome;
        uint256 toCreator = creatorFromBase + extraFeePortion;

        if (toCreator > 0) {
            (bool ok0, ) = creator.call{value: toCreator}("");
            require(ok0, "creator transfer failed");
        }
        if (toHome > 0) {
            (bool ok1, ) = homeTreasury.call{value: toHome}("");
            require(ok1, "home transfer failed");
        }
        if (toPlatform > 0) {
            (bool ok2, ) = platformWallet.call{value: toPlatform}("");
            require(ok2, "platform transfer failed");
        }
    }

    // ---------- Graduation (this is the part that's actually different from V2) ----------

    function graduate() external nonReentrant {
        require(!graduated, "already graduated");
        require(ethRaised >= graduationThreshold, "threshold not met");
        _graduate();
    }

    function _graduate() internal {
        graduated = true;
        uint256 ethForLp = address(this).balance;
        uint256 tokensForLp = token.balanceOf(address(this));
        poolManager.unlock(abi.encode(ethForLp, tokensForLp));
    }

    /// @dev Called back by PoolManager during unlock(). Not reentrancy-guarded
    ///      with the same modifier as buy/sell because it's a different,
    ///      single-purpose entry point restricted to the pool manager itself.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (uint256 ethAmount, uint256 tokenAmount) = abi.decode(data, (uint256, uint256));

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO, // native ETH — always sorts first
            currency1: Currency.wrap(address(token)),
            fee: poolFee,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(0))
        });

        // Initial price = tokenAmount (currency1) per ethAmount (currency0),
        // expressed as sqrtPriceX96. FullMath avoids the overflow a plain
        // `tokenAmount << 192` would hit for realistic token supplies.
        uint256 ratioX192 = FullMath.mulDiv(tokenAmount, 1 << 192, ethAmount);
        uint160 sqrtPriceX96 = uint160(Math.sqrt(ratioX192));
        poolManager.initialize(key, sqrtPriceX96);

        int24 tickLower = TickMath.minUsableTick(tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(tickSpacing);
        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(tickUpper);

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, ethAmount, tokenAmount
        );
        require(liquidity > 0, "no liquidity to add");

        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        int128 amt0 = BalanceDeltaLibrary.amount0(delta);
        int128 amt1 = BalanceDeltaLibrary.amount1(delta);

        // Both deltas should be negative here — we're a net depositor,
        // supplying both sides fresh into an empty pool.
        if (amt0 < 0) {
            uint256 owed0 = uint256(uint128(-amt0));
            poolManager.sync(key.currency0);
            poolManager.settle{value: owed0}();
        }
        if (amt1 < 0) {
            uint256 owed1 = uint256(uint128(-amt1));
            poolManager.sync(key.currency1);
            require(token.transfer(address(poolManager), owed1), "token settle transfer failed");
            poolManager.settle();
        }

        // Any dust ETH left in this contract after settling (rounding, or
        // liquidity computed slightly below the full balance) just stays
        // here — harmless, and nothing can ever withdraw it since there's
        // no function that does. Refunding it to the pool as a donation
        // would be a nice-to-have, not a correctness requirement.

        emit Graduated(ethAmount, tokenAmount, liquidity, tickLower, tickUpper);
        return "";
    }

    receive() external payable {}
}
