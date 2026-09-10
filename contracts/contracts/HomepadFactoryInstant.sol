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
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import "./LaunchToken.sol";
import "./HomepadHook.sol";

/// @title HOMEPAD Factory (Instant Liquidity)
/// @notice No bonding curve — launch() creates a real, immediately-tradeable
///         Uniswap V4 pool in the same transaction, using HomepadHook to
///         keep the same live creator/$HOME fee split BondingCurveV4 had.
///         See HomepadHook.sol for how the fee-on-swap actually works.
///
///         Of the fixed 1B supply, 8% goes straight to the $HOME treasury
///         and the remaining 92% is paired with whatever ETH the creator
///         sends in as the pool's starting liquidity, permanently locked —
///         same "no withdraw function exists, full stop" guarantee as the
///         bonding curve version, just without a graduation step first.
contract HomepadFactoryInstant is IUnlockCallback {
    address public immutable homeTreasury;
    address public immutable platformWallet;
    IPoolManager public immutable poolManager;
    HomepadHook public immutable hook;
    int24 public immutable tickSpacing;

    uint256 public constant DEFAULT_SUPPLY = 1_000_000_000 ether;
    uint16 public constant HOME_ALLOCATION_BPS = 800; // 8% of supply goes to $HOME treasury at launch
    uint16 public immutable baseFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable homeShareBps;
    uint16 public constant MAX_EXTRA_FEE_BPS = 200;

    struct Launch {
        address token;
        PoolKeyStored poolKey;
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

    // PoolKey isn't storable directly as a public array element the way we
    // need (Currency/IHooks aren't simple value types for the auto-getter),
    // so this mirrors it in plain types for storage and reconstructs a real
    // PoolKey wherever one's actually needed.
    struct PoolKeyStored {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
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
    mapping(address => uint256) public launchIndexOf; // token => index+1 (0 = not found)

    event Launched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint16 extraFeeBps,
        string imageUrl,
        string description,
        uint256 ethSeeded
    );

    constructor(
        address homeTreasury_,
        address platformWallet_,
        address poolManager_,
        address hook_,
        int24 tickSpacing_,
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
        hook = HomepadHook(payable(hook_));
        tickSpacing = tickSpacing_;
        baseFeeBps = baseFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;
    }

    function launch(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external payable returns (address tokenAddr) {
        return _launch(name_, symbol_, extraFeeBps_, meta_, 0);
    }

    /// @notice Same as launch(), but devBuyEth of the sent value is used
    ///         to immediately buy tokens for the creator in the same
    ///         transaction, right after the pool is seeded — a real,
    ///         atomic dev buy, not just initial liquidity. The rest of
    ///         msg.value (msg.value - devBuyEth) seeds the pool exactly
    ///         like a plain launch() would.
    function launchAndBuy(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 devBuyEth
    ) external payable returns (address tokenAddr) {
        require(devBuyEth < msg.value, "devBuyEth must leave something for liquidity");
        return _launch(name_, symbol_, extraFeeBps_, meta_, devBuyEth);
    }

    function _launch(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 devBuyEth
    ) internal returns (address tokenAddr) {
        require(msg.value > 0, "send ETH for initial liquidity");
        require(extraFeeBps_ <= MAX_EXTRA_FEE_BPS, "extra fee capped at 2%");

        LaunchToken t = new LaunchToken(name_, symbol_, DEFAULT_SUPPLY, address(this));

        uint256 homeAmount = (DEFAULT_SUPPLY * HOME_ALLOCATION_BPS) / 10000;
        uint256 poolAmount = DEFAULT_SUPPLY - homeAmount;
        require(t.transfer(homeTreasury, homeAmount), "home allocation transfer failed");

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO, // native ETH — always sorts first
            currency1: Currency.wrap(address(t)),
            fee: 0, // all fee revenue comes from HomepadHook, not the pool's own LP fee
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });

        hook.registerPool(key, HomepadHook.FeeConfig({
            creator: msg.sender,
            homeTreasury: homeTreasury,
            platformWallet: platformWallet,
            baseFeeBps: baseFeeBps,
            extraFeeBps: extraFeeBps_,
            creatorShareBps: creatorShareBps,
            homeShareBps: homeShareBps
        }));

        uint256 liquidityEth = msg.value - devBuyEth;
        poolManager.unlock(abi.encode(address(t), poolAmount, liquidityEth, devBuyEth, msg.sender));

        launchIndexOf[address(t)] = launches.length + 1;
        launches.push(Launch({
            token: address(t),
            poolKey: PoolKeyStored({
                currency0: Currency.unwrap(key.currency0),
                currency1: Currency.unwrap(key.currency1),
                fee: key.fee,
                tickSpacing: key.tickSpacing,
                hooks: address(key.hooks)
            }),
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

        emit Launched(address(t), msg.sender, name_, symbol_, extraFeeBps_, meta_.imageUrl, meta_.description, msg.value);
        return address(t);
    }

    /// @dev Called back by PoolManager during unlock(). Same initialize +
    ///      modifyLiquidity + settle pattern BondingCurveV4 used at
    ///      graduation — just run here at launch time instead. If
    ///      devBuyEth > 0, also performs a real swap right after seeding
    ///      liquidity, sending the bought tokens to the creator.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (address tokenAddr, uint256 tokenAmount, uint256 ethAmount, uint256 devBuyEth, address creator) =
            abi.decode(data, (address, uint256, uint256, uint256, address));

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(tokenAddr),
            fee: 0,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });

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

        if (amt0 < 0) {
            uint256 owed0 = uint256(uint128(-amt0));
            poolManager.sync(key.currency0);
            poolManager.settle{value: owed0}();
        }
        if (amt1 < 0) {
            uint256 owed1 = uint256(uint128(-amt1));
            poolManager.sync(key.currency1);
            require(IERC20(tokenAddr).transfer(address(poolManager), owed1), "token settle transfer failed");
            poolManager.settle();
        }

        if (devBuyEth > 0) {
            _devBuy(key, devBuyEth, creator);
        }

        return "";
    }

    /// @dev A normal swap against the just-seeded real liquidity — no
    ///      override needed here (unlike the hybrid curve phase), since
    ///      real liquidity already exists by this point. The hook's own
    ///      afterSwap still takes its live fee cut exactly as it would on
    ///      any other trade, so the creator receives net-of-fee tokens,
    ///      same as a normal buyer would.
    function _devBuy(PoolKey memory key, uint256 devBuyEth, address creator) internal {
        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(devBuyEth),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        BalanceDelta swapDelta = poolManager.swap(key, swapParams, "");
        int128 ethDelta = BalanceDeltaLibrary.amount0(swapDelta);
        int128 tokenDelta = BalanceDeltaLibrary.amount1(swapDelta);

        if (ethDelta < 0) {
            poolManager.sync(key.currency0);
            poolManager.settle{value: uint256(uint128(-ethDelta))}();
        }
        if (tokenDelta > 0) {
            poolManager.take(key.currency1, creator, uint256(uint128(tokenDelta)));
        }
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    receive() external payable {}
}
