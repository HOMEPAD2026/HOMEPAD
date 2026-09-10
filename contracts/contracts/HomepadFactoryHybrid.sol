// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import "./LaunchToken.sol";
import "./HomepadHybridHook.sol";

/// @title HOMEPAD Factory (Hybrid)
/// @notice The default launch path. Creates a real Uniswap v4 pool in the
///         same transaction as the token — visible on Dexscreener
///         immediately — seeded with a single-sided liquidity position
///         (100% of the sellable supply, 0% ETH) starting at the launch
///         price. No ETH required from the creator, same as the
///         standalone Bonding Curve mode, and the concentrated position's
///         own price impact gives the same snipe-resistant "price moves
///         against a big buyer" behavior a bonding curve has — see
///         HomepadHybridHook for the full explanation. 8% of supply goes
///         to the $HOME treasury at launch, same as the other two modes.
///         Liquidity is permanently locked — this contract has no
///         withdraw function, for itself or anyone else.
contract HomepadFactoryHybrid is IUnlockCallback {
    address public immutable homeTreasury;
    address public immutable platformWallet;
    IPoolManager public immutable poolManager;
    HomepadHybridHook public immutable hook;
    int24 public immutable tickSpacing;

    uint256 public constant DEFAULT_SUPPLY = 1_000_000_000 ether;
    uint16 public constant HOME_ALLOCATION_BPS = 800; // 8% of supply to $HOME treasury at launch
    uint256 public immutable initialVirtualEth; // sets the starting price, same convention as BondingCurveV4
    uint16 public immutable baseFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable homeShareBps;
    uint16 public constant MAX_EXTRA_FEE_BPS = 200;

    struct Launch {
        address token;
        address creator;
        uint256 launchedAt;
        uint16 extraFeeBps;
        string imageUrl;
        string description;
        string twitter;
        string telegram;
        string discord;
        string website;
    }

    struct LaunchMeta {
        string imageUrl;
        string description;
        string twitter;
        string telegram;
        string discord;
        string website;
    }

    Launch[] public launches;
    mapping(address => uint256) public launchIndexOf; // token => index+1

    event Launched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint16 extraFeeBps,
        string imageUrl,
        string description
    );

    constructor(
        address homeTreasury_,
        address platformWallet_,
        address poolManager_,
        address hook_,
        int24 tickSpacing_,
        uint256 initialVirtualEth_,
        uint16 baseFeeBps_,
        uint16 creatorShareBps_,
        uint16 homeShareBps_
    ) {
        require(homeTreasury_ != address(0) && platformWallet_ != address(0) && poolManager_ != address(0), "zero address");
        require(hook_ != address(0), "hook required");
        require(creatorShareBps_ <= 10000, "bad creator split");
        homeTreasury = homeTreasury_;
        platformWallet = platformWallet_;
        poolManager = IPoolManager(poolManager_);
        hook = HomepadHybridHook(payable(hook_));
        tickSpacing = tickSpacing_;
        initialVirtualEth = initialVirtualEth_;
        baseFeeBps = baseFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;
    }

    function launch(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external returns (address tokenAddr) {
        return _launch(name_, symbol_, extraFeeBps_, meta_, 0, address(0));
    }

    /// @notice Same as launch(), but msg.value is used to immediately buy
    ///         tokens for the creator right after the single-sided
    ///         position is seeded — a real, atomic dev buy against the
    ///         freshly-created pool, in the same transaction as the launch.
    ///         Unlike Instant mode, hybrid needs no ETH at all for the
    ///         pool itself, so the entire msg.value goes toward the buy.
    function launchAndBuy(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external payable returns (address tokenAddr) {
        require(msg.value > 0, "send ETH to buy with, or use launch() instead");
        return _launch(name_, symbol_, extraFeeBps_, meta_, msg.value, msg.sender);
    }

    function _launch(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 devBuyEth,
        address devBuyer
    ) internal returns (address tokenAddr) {
        require(extraFeeBps_ <= MAX_EXTRA_FEE_BPS, "extra fee capped at 2%");

        LaunchToken t = new LaunchToken(name_, symbol_, DEFAULT_SUPPLY, address(this));

        uint256 homeAmount = (DEFAULT_SUPPLY * HOME_ALLOCATION_BPS) / 10000;
        uint256 sellableAmount = DEFAULT_SUPPLY - homeAmount;
        require(t.transfer(homeTreasury, homeAmount), "home allocation transfer failed");

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(address(t)),
            fee: 0, // the hook takes 100% of the live fee itself — see HomepadHybridHook
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });

        // Starting price matches BondingCurveV4's convention exactly:
        // initialVirtualEth ETH would buy the full 1B supply at this price.
        uint256 ratioX192 = FullMath.mulDiv(DEFAULT_SUPPLY, 1 << 192, initialVirtualEth);
        uint160 sqrtPriceX96 = uint160(Math.sqrt(ratioX192));
        int24 startTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        // Re-derive the exact sqrt price AT the tick-spacing-aligned tick,
        // so the pool initializes exactly at the boundary the single-sided
        // position starts from — required for the position to be 100%
        // token-side with zero ETH needed.
        startTick = (startTick / tickSpacing) * tickSpacing;
        if (startTick < TickMath.MIN_TICK) startTick += tickSpacing;
        uint160 alignedSqrtPriceX96 = TickMath.getSqrtPriceAtTick(startTick);

        try poolManager.initialize(key, alignedSqrtPriceX96) returns (int24) {
        } catch Error(string memory reason) {
            revert(string.concat("initialize failed: ", reason));
        } catch (bytes memory lowLevelData) {
            revert(string.concat("initialize failed low-level, len=", Strings.toString(lowLevelData.length)));
        }

        try hook.registerHybridPool(key, HomepadHybridHook.HybridFeeConfig({
            creator: msg.sender,
            homeTreasury: homeTreasury,
            platformWallet: platformWallet,
            baseFeeBps: baseFeeBps,
            extraFeeBps: extraFeeBps_,
            creatorShareBps: creatorShareBps,
            homeShareBps: homeShareBps
        })) {
        } catch Error(string memory reason) {
            revert(string.concat("registerHybridPool failed: ", reason));
        } catch (bytes memory lowLevelData) {
            revert(string.concat("registerHybridPool failed low-level, len=", Strings.toString(lowLevelData.length)));
        }

        try poolManager.unlock(abi.encode(key, address(t), sellableAmount, startTick, devBuyEth, devBuyer)) {
        } catch Error(string memory reason) {
            revert(string.concat("unlock failed: ", reason));
        } catch (bytes memory lowLevelData) {
            revert(string.concat("unlock failed low-level, len=", Strings.toString(lowLevelData.length)));
        }

        launchIndexOf[address(t)] = launches.length + 1;
        launches.push(Launch({
            token: address(t),
            creator: msg.sender,
            launchedAt: block.timestamp,
            extraFeeBps: extraFeeBps_,
            imageUrl: meta_.imageUrl,
            description: meta_.description,
            twitter: meta_.twitter,
            telegram: meta_.telegram,
            discord: meta_.discord,
            website: meta_.website
        }));

        emit Launched(address(t), msg.sender, name_, symbol_, extraFeeBps_, meta_.imageUrl, meta_.description);
        return address(t);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (PoolKey memory key, address token, uint256 sellableAmount, int24 startTick, uint256 devBuyEth, address devBuyer) =
            abi.decode(data, (PoolKey, address, uint256, int24, uint256, address));

        int24 tickLower = TickMath.minUsableTick(tickSpacing);
        uint160 sqrtRatioAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtPriceAtTick(startTick);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, sellableAmount);
        require(liquidity > 0, "liquidity computation failed");

        BalanceDelta delta;
        try poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: tickLower, tickUpper: startTick, liquidityDelta: int256(uint256(liquidity)), salt: bytes32(0)}),
            ""
        ) returns (BalanceDelta d, BalanceDelta) {
            delta = d;
        } catch Error(string memory reason) {
            revert(string.concat("modifyLiquidity failed: ", reason));
        } catch (bytes memory lowLevelData) {
            revert(string.concat("modifyLiquidity failed low-level, len=", Strings.toString(lowLevelData.length), " liquidity=", Strings.toString(uint256(liquidity))));
        }

        // Single-sided by construction (pool initialized exactly at
        // startTick, range starts there too) — amount0 (ETH) owed should
        // be zero or a few wei of rounding, never anything meaningful.
        int128 amt0 = BalanceDeltaLibrary.amount0(delta);
        int128 amt1 = BalanceDeltaLibrary.amount1(delta);
        if (amt0 < 0) {
            uint256 owed0 = uint256(uint128(-amt0));
            poolManager.sync(key.currency0);
            poolManager.settle{value: owed0}();
        }
        if (amt1 < 0) {
            uint256 owed1 = uint256(uint128(-amt1));
            poolManager.sync(key.currency1);
            require(IERC20(token).transfer(address(poolManager), owed1), "liquidity settle failed");
            poolManager.settle();
        }

        if (devBuyEth > 0) {
            _devBuy(key, devBuyEth, devBuyer);
        }

        return "";
    }

    /// @dev A normal swap against the just-seeded real liquidity — no
    ///      curve override applies here since real liquidity already
    ///      exists at this point (the whole reason the curve phase exists
    ///      at all is to handle the case where it doesn't yet).
    function _devBuy(PoolKey memory key, uint256 devBuyEth, address buyer) internal {
        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(devBuyEth),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        BalanceDelta swapDelta = poolManager.swap(key, swapParams, "");
        int128 ethDelta = BalanceDeltaLibrary.amount0(swapDelta);
        int128 tokenDelta = BalanceDeltaLibrary.amount1(swapDelta);

        if (ethDelta < 0) {
            uint256 owed = uint256(uint128(-ethDelta));
            poolManager.sync(key.currency0);
            poolManager.settle{value: owed}();
        }
        if (tokenDelta > 0) {
            poolManager.take(key.currency1, buyer, uint256(uint128(tokenDelta)));
        }
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    receive() external payable {}
}
