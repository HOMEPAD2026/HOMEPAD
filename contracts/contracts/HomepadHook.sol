// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title HOMEPAD Hook
/// @notice Every pool HOMEPAD's "instant launch" factory creates uses this
///         same hook. It's what makes an instantly-real Uniswap pool still
///         pay the same "rent" the bonding-curve version did: each pool's
///         swap fee is set to 0% at the Uniswap level (see the factory),
///         and this hook takes the entire fee cut itself on every swap,
///         splitting it live between the token's creator and $HOME —
///         no separate "collect" step, no accrual sitting in an LP
///         position waiting for someone to claim it.
///
///         One hook contract serves every launch. Each pool's fee
///         configuration (who gets paid, and the fee percentages) is
///         registered once at launch time by the factory and looked up by
///         PoolId on every swap after that.
contract HomepadHook is BaseHook {
    struct FeeConfig {
        address creator;
        address homeTreasury;
        address platformWallet;
        uint16 baseFeeBps;
        uint16 extraFeeBps;
        uint16 creatorShareBps;
        uint16 homeShareBps;
    }

    // Not immutable: the hook's own address has to satisfy Uniswap V4's
    // permission-bit requirement, which means it must be deployed via
    // CREATE2 with a mined salt — computed off-chain, before the factory
    // (which needs the hook's address in ITS OWN constructor) even exists.
    // Wiring `factory` in as a constructor arg would be circular. Instead
    // the deploy script deploys this hook first, then the factory, then
    // calls setFactory() once — after which it's permanently locked.
    address public factory;
    address public immutable deployer;

    mapping(PoolId => FeeConfig) public feeConfigs;

    event FeeRouted(PoolId indexed poolId, uint256 toCreator, uint256 toHome, uint256 toPlatform);

    // _admin is explicit rather than using msg.sender: this gets deployed
    // via a CREATE2Deployer helper contract, so msg.sender in this
    // constructor would be that helper's own address, not whoever actually
    // triggered the deployment.
    constructor(IPoolManager _poolManager, address _admin) BaseHook(_poolManager) {
        require(_admin != address(0), "zero address");
        deployer = _admin;
    }

    /// @notice One-time wiring, callable only by whoever deployed this hook
    /// and only before it's already been set — there's no function anywhere
    /// in this contract that could ever change it again after that.
    function setFactory(address _factory) external {
        require(msg.sender == deployer, "only deployer");
        require(factory == address(0), "already set");
        require(_factory != address(0), "zero address");
        factory = _factory;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "only factory");
        _;
    }

    /// @notice Called once by the factory right after a pool is created.
    function registerPool(PoolKey calldata key, FeeConfig calldata cfg) external onlyFactory {
        feeConfigs[PoolIdLibrary.toId(key)] = cfg;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true, // required — this is what lets afterSwap actually take a cut
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId id = PoolIdLibrary.toId(key);
        FeeConfig memory cfg = feeConfigs[id];
        if (cfg.creator == address(0)) {
            return (BaseHook.afterSwap.selector, 0); // not a HOMEPAD pool — shouldn't happen, but never touch a pool we don't recognize
        }

        // The "unspecified" side of the delta is what the swapper is
        // receiving — that's the amount our fee is a percentage of. For an
        // exact-output swap this would be negative (the swapper's payment
        // side) instead; those are left alone here for simplicity, same
        // as the bonding curve version only ever dealing in exact-input terms.
        int128 unspecified = params.zeroForOne ? BalanceDeltaLibrary.amount1(delta) : BalanceDeltaLibrary.amount0(delta);
        if (unspecified <= 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        uint16 totalFeeBps = cfg.baseFeeBps + cfg.extraFeeBps;
        uint256 outputAmount = uint256(uint128(unspecified));
        uint256 fee = (outputAmount * totalFeeBps) / 10000;
        if (fee == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        Currency feeCurrency = params.zeroForOne ? key.currency1 : key.currency0;
        poolManager.take(feeCurrency, address(this), fee);
        _routeFee(id, feeCurrency, fee, cfg);

        return (BaseHook.afterSwap.selector, int128(int256(fee)));
    }

    function _routeFee(PoolId id, Currency currency, uint256 fee, FeeConfig memory cfg) internal {
        uint16 total = cfg.baseFeeBps + cfg.extraFeeBps;
        uint256 baseFeePortion = total > 0 ? (fee * cfg.baseFeeBps) / total : 0;
        uint256 extraFeePortion = fee - baseFeePortion;

        uint256 creatorFromBase = (baseFeePortion * cfg.creatorShareBps) / 10000;
        uint256 platformFromBase = baseFeePortion - creatorFromBase;
        uint256 toHome = (platformFromBase * cfg.homeShareBps) / 10000;
        uint256 toPlatform = platformFromBase - toHome;
        uint256 toCreator = creatorFromBase + extraFeePortion;

        _pay(currency, cfg.creator, toCreator);
        _pay(currency, cfg.homeTreasury, toHome);
        _pay(currency, cfg.platformWallet, toPlatform);

        emit FeeRouted(id, toCreator, toHome, toPlatform);
    }

    function _pay(Currency currency, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (CurrencyLibrary.isAddressZero(currency)) {
            (bool ok, ) = to.call{value: amount}("");
            require(ok, "eth fee transfer failed");
        } else {
            require(IERC20(Currency.unwrap(currency)).transfer(to, amount), "token fee transfer failed");
        }
    }

    receive() external payable {}
}
