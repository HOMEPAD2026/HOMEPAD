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

/// @title ArcPad Factory (Robinhood Chain) — ArcPad's own launches on Robinhood Chain, paired with ETH
/// @notice HomepadFactoryArc's mechanics on Robinhood Chain: a real Uniswap v4 pool at launch, single-sided
///         liquidity locked for good (no withdraw function for anyone), the same HomepadHybridHook fee split, and the
///         same 8% platform allocation — so a coin launched here is part of Launch Drop like an Arc one.
///         Differences from the Arc factory:
///           • the quote is native ETH (Uniswap v4 currency address(0)); every pool is ETH / TOKEN
///           • the launch fee is set at deployment (`launchFee`, about $1 of ETH) instead of a constant
///           • the dev buy is paid in the same msg.value as the fee: msg.value = launchFee + devBuyQuote
///         The launch functions keep the Arc factory's signatures (quoteToken_ must be address(0)) and `launches(i)`
///         keeps its layout, so the site and the Launch Drop vault read both factories the same way.
contract ArcPadFactoryRH is IUnlockCallback {
    address public immutable platformTreasury;
    address public immutable platformWallet;
    IPoolManager public immutable poolManager;
    HomepadHybridHook public immutable hook;
    int24 public immutable tickSpacing;

    uint256 public constant DEFAULT_SUPPLY = 1_000_000_000 ether;
    uint16 public constant PLATFORM_ALLOCATION_BPS = 800; // 8% of supply to the platform treasury at launch
    uint16 public immutable baseFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable platformShareBps;
    uint16 public constant MAX_EXTRA_FEE_BPS = 200;

    /// @notice Flat per-launch fee in ETH (native, 18 decimals), set at deployment (about $1 of ETH).
    uint256 public immutable launchFee;

    event LaunchFeeCollected(address indexed payer, uint256 amount);

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
        address platformTreasury_,
        address platformWallet_,
        address poolManager_,
        address hook_,
        int24 tickSpacing_,
        uint16 baseFeeBps_,
        uint16 creatorShareBps_,
        uint16 platformShareBps_,
        uint256 launchFee_
    ) {
        require(platformTreasury_ != address(0) && platformWallet_ != address(0) && poolManager_ != address(0), "zero address");
        require(hook_ != address(0), "hook required");
        require(creatorShareBps_ <= 10000, "bad creator split");
        platformTreasury = platformTreasury_;
        platformWallet = platformWallet_;
        poolManager = IPoolManager(poolManager_);
        hook = HomepadHybridHook(payable(hook_));
        tickSpacing = tickSpacing_;
        baseFeeBps = baseFeeBps_;
        creatorShareBps = creatorShareBps_;
        platformShareBps = platformShareBps_;
        launchFee = launchFee_;
    }

    /// @param quoteToken_ the ERC-20 to price this token in
    /// @param initialVirtualQuote_ starting price, expressed as "this many
    ///        quote tokens (raw units) buys the entire 1B supply" — the
    ///        same convention as initialVirtualEth on the ETH factories.
    /// @dev Payable: must send at least launchFee (ETH). Any excess above the fee is refunded to the caller.
    function launch(
        string calldata name_,
        string calldata symbol_,
        address quoteToken_,
        uint256 initialVirtualQuote_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external payable returns (address tokenAddr) {
        _collectLaunchFee();
        return _launch(name_, symbol_, quoteToken_, initialVirtualQuote_, extraFeeBps_, meta_, 0);
    }

    /// @notice Same as launch(), plus an atomic dev buy against the freshly-seeded pool, paid in ETH:
    ///         send msg.value = launchFee + devBuyQuote.
    function launchAndBuy(
        string calldata name_,
        string calldata symbol_,
        address quoteToken_,
        uint256 initialVirtualQuote_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 devBuyQuote
    ) external payable returns (address tokenAddr) {
        require(devBuyQuote > 0, "devBuyQuote = 0, use launch() instead");
        require(msg.value == launchFee + devBuyQuote, "send launchFee + devBuyQuote in ETH");
        _payFee(launchFee);
        return _launch(name_, symbol_, quoteToken_, initialVirtualQuote_, extraFeeBps_, meta_, devBuyQuote);
    }

    /// @dev Takes exactly launchFee from msg.value and forwards it to the platform treasury; refunds anything sent
    ///      above that (launch() only — launchAndBuy() spends the rest on the dev buy).
    function _collectLaunchFee() internal {
        require(msg.value >= launchFee, "launch fee: send at least launchFee in ETH");
        _payFee(launchFee);
        uint256 excess = msg.value - launchFee;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{value: excess}("");
            require(refunded, "launch fee refund failed");
        }
    }

    function _payFee(uint256 amount) internal {
        (bool sent, ) = platformTreasury.call{value: amount}("");
        require(sent, "launch fee transfer failed");
        emit LaunchFeeCollected(msg.sender, amount);
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
        require(quoteToken_ == address(0), "ETH pairs only: quoteToken must be address(0)");
        require(initialVirtualQuote_ > 0, "initialVirtualQuote = 0");

        LaunchToken t = new LaunchToken(name_, symbol_, DEFAULT_SUPPLY, address(this));

        uint256 platformAmount = (DEFAULT_SUPPLY * PLATFORM_ALLOCATION_BPS) / 10000;
        uint256 sellableAmount = DEFAULT_SUPPLY - platformAmount;
        require(t.transfer(platformTreasury, platformAmount), "platform allocation transfer failed");

        bool quoteIs0 = true; // native ETH is currency address(0): always currency0
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(quoteIs0 ? quoteToken_ : address(t)),
            currency1: Currency.wrap(quoteIs0 ? address(t) : quoteToken_),
            fee: 0,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });

        // Starting price: initialVirtualQuote_ quote buys the full sellable
        // supply. sqrtPriceX96 = sqrt(price) * 2^96, where price is
        // currency1/currency0 in raw units.
        uint256 priceX192;
        if (quoteIs0) {
            priceX192 = FullMath.mulDiv(sellableAmount, 1 << 192, initialVirtualQuote_);
        } else {
            priceX192 = FullMath.mulDiv(initialVirtualQuote_, 1 << 192, sellableAmount);
        }
        uint160 sqrtPriceX96 = uint160(Math.sqrt(priceX192));

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
            homeTreasury: platformTreasury,
            platformWallet: platformWallet,
            baseFeeBps: baseFeeBps,
            extraFeeBps: extraFeeBps_,
            creatorShareBps: creatorShareBps,
            homeShareBps: platformShareBps
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
        if (dust > 0) require(t.transfer(platformTreasury, dust), "dust sweep failed");

        _record(address(t), name_, symbol_, initialVirtualQuote_, extraFeeBps_, meta_);
        return address(t);
    }

    /// @dev The launch's record and event (its own frame: keeps _launch under the stack limit).
    function _record(address token, string calldata name_, string calldata symbol_, uint256 initialVirtualQuote_, uint16 extraFeeBps_, LaunchMeta calldata meta_) internal {
        quoteOf[token] = address(0);
        launchIndexOf[token] = launches.length + 1;
        launches.push(Launch({
            token: token,
            quoteToken: address(0),
            initialVirtualQuote: initialVirtualQuote_,
            quoteIsCurrency0: true,
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
        emit Launched(token, msg.sender, address(0), name_, symbol_, extraFeeBps_, initialVirtualQuote_, meta_.imageUrl, meta_.description);
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
        // settle the same way. poolManager.settle() itself is already
        // balance-delta-based (sync() snapshots its balance, settle()
        // reads the new one) — a taxed quote token settles for whatever
        // actually lands here, not the nominal `owed`, so a leftover debt
        // from an undershoot surfaces as unlock() reverting rather than
        // silently mis-accounting.
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
            if (erc20 == address(0)) {
                // the ETH side of a single-sided position: zero, or a few wei of rounding
                poolManager.settle{value: owed}();
            } else {
                require(IERC20(erc20).transfer(address(poolManager), owed), "liquidity settle failed");
                poolManager.settle();
            }
        }
    }

    /// @dev An exact-input swap of `devBuyQuote` ETH for the new token against the just-seeded liquidity; what the
    ///      swap could not use goes back to the buyer.
    function _devBuy(PoolKey memory key, bool, address, uint256 devBuyQuote, address buyer) internal {
        poolManager.sync(key.currency0);
        poolManager.settle{value: devBuyQuote}();
        BalanceDelta swapDelta = poolManager.swap(key, SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(devBuyQuote),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        }), "");
        int128 tokenDelta = BalanceDeltaLibrary.amount1(swapDelta);
        if (tokenDelta > 0) poolManager.take(key.currency1, buyer, uint256(uint128(tokenDelta)));
        int128 quoteDelta = BalanceDeltaLibrary.amount0(swapDelta);
        uint256 spent = quoteDelta < 0 ? uint256(uint128(-quoteDelta)) : 0;
        if (spent < devBuyQuote) poolManager.take(key.currency0, buyer, devBuyQuote - spent);
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
