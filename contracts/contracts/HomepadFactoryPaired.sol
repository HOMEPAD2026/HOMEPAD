// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import "./LaunchToken.sol";
import "./HomepadHybridHook.sol";

/// @title HOMEPAD Factory (Paired Hybrid)
/// @notice Hybrid mode, but paired with an ERC-20 "quote" token instead of
///         ETH — Robinhood Stock Tokens today, $HOME later, any ERC-20 in
///         principle (the frontend curates the list). Same shape as
///         HomepadFactoryHybrid: a real Uniswap v4 pool in the launch
///         transaction, seeded with a single-sided position (100% of the
///         sellable supply, 0% quote), so the creator needs none of the
///         quote token to launch. Liquidity is permanently locked — there
///         is no withdraw function for anyone.
///
///         Two things differ from the ETH version:
///         1. v4 orders currencies by address, and an ERC-20 quote can sort
///            either side of the new token, so the pool key, the starting
///            price, and the side of the single-sided range all depend on
///            that ordering. `quoteIsCurrency0` is recorded per launch.
///         2. The quote token can't ride along as msg.value — a dev buy is
///            pulled with transferFrom (approve first), and every settle on
///            the quote side is an ERC-20 transfer.
contract HomepadFactoryPaired is IUnlockCallback {
    address public immutable homeTreasury;
    address public immutable platformWallet;
    IPoolManager public immutable poolManager;
    HomepadHybridHook public immutable hook;
    int24 public immutable tickSpacing;

    uint256 public constant DEFAULT_SUPPLY = 1_000_000_000 ether;
    uint16 public constant HOME_ALLOCATION_BPS = 800; // 8% of supply to $HOME treasury at launch
    uint16 public immutable baseFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable homeShareBps;
    uint16 public constant MAX_EXTRA_FEE_BPS = 200;

    struct Launch {
        address token;
        address quoteToken;          // the ERC-20 this token is priced in
        uint256 initialVirtualQuote; // starting price: this much quote buys the full supply (quote's own decimals)
        bool quoteIsCurrency0;       // v4 currency ordering for this pool
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
    mapping(address => address) public quoteOf;       // token => quote token

    event Launched(
        address indexed token,
        address indexed creator,
        address indexed quoteToken,
        string name,
        string symbol,
        uint16 extraFeeBps,
        uint256 initialVirtualQuote,
        string imageUrl,
        string description
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
        hook = HomepadHybridHook(payable(hook_));
        tickSpacing = tickSpacing_;
        baseFeeBps = baseFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;
    }

    /// @param quoteToken_ the ERC-20 to price this token in
    /// @param initialVirtualQuote_ starting price, expressed as "this many
    ///        quote tokens (raw units) buys the entire 1B supply" — the
    ///        same convention as initialVirtualEth on the ETH factories.
    function launch(
        string calldata name_,
        string calldata symbol_,
        address quoteToken_,
        uint256 initialVirtualQuote_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external returns (address tokenAddr) {
        return _launch(name_, symbol_, quoteToken_, initialVirtualQuote_, extraFeeBps_, meta_, 0);
    }

    /// @notice Same as launch(), plus an atomic dev buy of `devBuyQuote`
    ///         quote tokens against the freshly-seeded pool. Caller must
    ///         have approved this factory for at least that amount.
    function launchAndBuy(
        string calldata name_,
        string calldata symbol_,
        address quoteToken_,
        uint256 initialVirtualQuote_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 devBuyQuote
    ) external returns (address tokenAddr) {
        require(devBuyQuote > 0, "devBuyQuote = 0, use launch() instead");
        require(IERC20(quoteToken_).transferFrom(msg.sender, address(this), devBuyQuote), "quote transferFrom failed");
        return _launch(name_, symbol_, quoteToken_, initialVirtualQuote_, extraFeeBps_, meta_, devBuyQuote);
    }

    function _launch(
        string calldata name_,
        string calldata symbol_,
        address quoteToken_,
        uint256 initialVirtualQuote_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 devBuyQuote
    ) internal returns (address tokenAddr) {
        require(extraFeeBps_ <= MAX_EXTRA_FEE_BPS, "extra fee capped at 2%");
        require(quoteToken_ != address(0), "quote token required");
        require(initialVirtualQuote_ > 0, "initialVirtualQuote = 0");

        LaunchToken t = new LaunchToken(name_, symbol_, DEFAULT_SUPPLY, address(this));

        uint256 homeAmount = (DEFAULT_SUPPLY * HOME_ALLOCATION_BPS) / 10000;
        uint256 sellableAmount = DEFAULT_SUPPLY - homeAmount;
        require(t.transfer(homeTreasury, homeAmount), "home allocation transfer failed");

        bool quoteIs0 = quoteToken_ < address(t);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(quoteIs0 ? quoteToken_ : address(t)),
            currency1: Currency.wrap(quoteIs0 ? address(t) : quoteToken_),
            fee: 0, // the hook takes 100% of the live fee itself — see HomepadHybridHook
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });

        // v4 price = currency1 per currency0. With quote as currency0 that's
        // "tokens per quote" (supply / virtualQuote), otherwise it's
        // "quote per token" (virtualQuote / supply).
        uint256 ratioX192 = quoteIs0
            ? FullMath.mulDiv(DEFAULT_SUPPLY, 1 << 192, initialVirtualQuote_)
            : FullMath.mulDiv(initialVirtualQuote_, 1 << 192, DEFAULT_SUPPLY);
        uint160 sqrtPriceX96 = uint160(Math.sqrt(ratioX192));
        require(sqrtPriceX96 > TickMath.MIN_SQRT_PRICE && sqrtPriceX96 < TickMath.MAX_SQRT_PRICE, "starting price out of range");
        int24 startTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        // Align to tick spacing and initialize EXACTLY at that boundary, so
        // the single-sided position starts right at the current price and
        // needs zero of the quote side. Solidity's truncating division
        // rounds toward zero on both sides, which is fine either way — the
        // position simply starts at that aligned tick.
        startTick = (startTick / tickSpacing) * tickSpacing;
        if (startTick < TickMath.minUsableTick(tickSpacing)) startTick = TickMath.minUsableTick(tickSpacing);
        if (startTick > TickMath.maxUsableTick(tickSpacing)) startTick = TickMath.maxUsableTick(tickSpacing);
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

        try poolManager.unlock(abi.encode(key, address(t), quoteToken_, quoteIs0, sellableAmount, startTick, devBuyQuote, msg.sender)) {
        } catch Error(string memory reason) {
            revert(string.concat("unlock failed: ", reason));
        } catch (bytes memory lowLevelData) {
            revert(string.concat("unlock failed low-level, len=", Strings.toString(lowLevelData.length)));
        }

        // The single-sided position rounds liquidity down, so a few wei of
        // the token can be left behind here. Sweep them to the treasury so
        // this contract never holds anything (dev-buy output goes straight
        // to the buyer via take(), never through here).
        uint256 dust = t.balanceOf(address(this));
        if (dust > 0) require(t.transfer(homeTreasury, dust), "dust sweep failed");

        quoteOf[address(t)] = quoteToken_;
        launchIndexOf[address(t)] = launches.length + 1;
        launches.push(Launch({
            token: address(t),
            quoteToken: quoteToken_,
            initialVirtualQuote: initialVirtualQuote_,
            quoteIsCurrency0: quoteIs0,
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

        emit Launched(address(t), msg.sender, quoteToken_, name_, symbol_, extraFeeBps_, initialVirtualQuote_, meta_.imageUrl, meta_.description);
        return address(t);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only pool manager");
        (PoolKey memory key, address token, address quoteToken, bool quoteIs0, uint256 sellableAmount, int24 startTick, uint256 devBuyQuote, address devBuyer) =
            abi.decode(data, (PoolKey, address, address, bool, uint256, int24, uint256, address));

        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        if (quoteIs0) {
            // Token is currency1: a range entirely BELOW the current tick holds only currency1.
            tickLower = TickMath.minUsableTick(tickSpacing);
            tickUpper = startTick;
            liquidity = LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), sellableAmount);
        } else {
            // Token is currency0: a range entirely ABOVE the current tick holds only currency0.
            tickLower = startTick;
            tickUpper = TickMath.maxUsableTick(tickSpacing);
            liquidity = LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), sellableAmount);
        }
        require(liquidity > 0, "liquidity computation failed");

        BalanceDelta delta;
        try poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: int256(uint256(liquidity)), salt: bytes32(0)}),
            ""
        ) returns (BalanceDelta d, BalanceDelta) {
            delta = d;
        } catch Error(string memory reason) {
            revert(string.concat("modifyLiquidity failed: ", reason));
        } catch (bytes memory lowLevelData) {
            revert(string.concat("modifyLiquidity failed low-level, len=", Strings.toString(lowLevelData.length), " liquidity=", Strings.toString(uint256(liquidity))));
        }

        // Single-sided by construction; the quote side owed should be zero
        // (or a few wei of rounding). Both sides are ERC-20 here, so both
        // settle the same way.
        _settleIfOwed(key.currency0, BalanceDeltaLibrary.amount0(delta), quoteIs0 ? quoteToken : token);
        _settleIfOwed(key.currency1, BalanceDeltaLibrary.amount1(delta), quoteIs0 ? token : quoteToken);

        if (devBuyQuote > 0) {
            _devBuy(key, quoteIs0, quoteToken, devBuyQuote, devBuyer);
        }
        return "";
    }

    function _settleIfOwed(Currency currency, int128 amt, address erc20) internal {
        if (amt < 0) {
            uint256 owed = uint256(uint128(-amt));
            poolManager.sync(currency);
            require(IERC20(erc20).transfer(address(poolManager), owed), "liquidity settle failed");
            poolManager.settle();
        }
    }

    /// @dev A normal exact-input swap of the quote token for the new token
    ///      against the just-seeded liquidity. Direction depends on which
    ///      side the quote sorted to.
    function _devBuy(PoolKey memory key, bool quoteIs0, address quoteToken, uint256 devBuyQuote, address buyer) internal {
        // Quote in, token out: quote side settles first (ERC-20 transfer), then swap, then take the token.
        poolManager.sync(quoteIs0 ? key.currency0 : key.currency1);
        require(IERC20(quoteToken).transfer(address(poolManager), devBuyQuote), "dev buy settle failed");
        poolManager.settle();

        BalanceDelta swapDelta = poolManager.swap(key, SwapParams({
            zeroForOne: quoteIs0,
            amountSpecified: -int256(devBuyQuote),
            sqrtPriceLimitX96: quoteIs0 ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        }), "");

        int128 tokenDelta = quoteIs0 ? BalanceDeltaLibrary.amount1(swapDelta) : BalanceDeltaLibrary.amount0(swapDelta);
        if (tokenDelta > 0) {
            poolManager.take(quoteIs0 ? key.currency1 : key.currency0, buyer, uint256(uint128(tokenDelta)));
        }
        // Any quote the swap could not consume (e.g. price limit) is refunded.
        int128 quoteDelta = quoteIs0 ? BalanceDeltaLibrary.amount0(swapDelta) : BalanceDeltaLibrary.amount1(swapDelta);
        uint256 spent = quoteDelta < 0 ? uint256(uint128(-quoteDelta)) : 0;
        if (spent < devBuyQuote) {
            poolManager.take(quoteIs0 ? key.currency0 : key.currency1, buyer, devBuyQuote - spent);
        }
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    /// @notice Pool key for a launched token, for routers/frontends.
    function poolKeyOf(address token) external view returns (PoolKey memory key) {
        uint256 idx = launchIndexOf[token];
        require(idx != 0, "unknown token");
        Launch storage l = launches[idx - 1];
        key = PoolKey({
            currency0: Currency.wrap(l.quoteIsCurrency0 ? l.quoteToken : token),
            currency1: Currency.wrap(l.quoteIsCurrency0 ? token : l.quoteToken),
            fee: 0,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });
    }
}
