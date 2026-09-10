// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LaunchToken.sol";
import "./BondingCurveV4.sol";

/// @title HOMEPAD Factory (Uniswap V4)
/// @notice Same permissionless-launch pattern and fee model as
///         HomepadFactory.sol — the only difference is the curve it
///         deploys graduates into Uniswap V4's PoolManager instead of a V2
///         pool. See BondingCurveV4.sol for what that actually changes.
contract HomepadFactoryV4 {
    address public immutable homeTreasury;
    address public immutable platformWallet;
    address public immutable poolManager;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;

    uint256 public constant DEFAULT_SUPPLY = 1_000_000_000 ether;
    uint256 public immutable initialVirtualEth;
    uint256 public immutable graduationThreshold;
    uint16 public immutable baseFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable homeShareBps;
    uint16 public constant MAX_EXTRA_FEE_BPS = 200;

    struct Launch {
        address token;
        address curve;
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
    mapping(address => address) public curveOf;

    event Launched(
        address indexed token,
        address indexed curve,
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
        uint24 poolFee_,
        int24 tickSpacing_,
        uint256 initialVirtualEth_,
        uint256 graduationThreshold_,
        uint16 baseFeeBps_,
        uint16 creatorShareBps_,
        uint16 homeShareBps_
    ) {
        require(homeTreasury_ != address(0) && platformWallet_ != address(0) && poolManager_ != address(0), "zero address");
        require(creatorShareBps_ <= 10000, "bad creator split");
        homeTreasury = homeTreasury_;
        platformWallet = platformWallet_;
        poolManager = poolManager_;
        poolFee = poolFee_;
        tickSpacing = tickSpacing_;
        initialVirtualEth = initialVirtualEth_;
        graduationThreshold = graduationThreshold_;
        baseFeeBps = baseFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;
    }

    function launch(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external returns (address tokenAddr, address curveAddr) {
        return _launch(name_, symbol_, extraFeeBps_, meta_);
    }

    function launchAndBuy(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 minTokensOut_
    ) external payable returns (address tokenAddr, address curveAddr) {
        (tokenAddr, curveAddr) = _launch(name_, symbol_, extraFeeBps_, meta_);
        if (msg.value > 0) {
            BondingCurveV4(payable(curveAddr)).buy{value: msg.value}(minTokensOut_, msg.sender);
        }
    }

    function _launch(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) internal returns (address tokenAddr, address curveAddr) {
        require(extraFeeBps_ <= MAX_EXTRA_FEE_BPS, "extra fee capped at 2%");

        LaunchToken t = new LaunchToken(name_, symbol_, DEFAULT_SUPPLY, address(this));

        BondingCurveV4 c = new BondingCurveV4(
            address(t),
            msg.sender,
            homeTreasury,
            platformWallet,
            poolManager,
            poolFee,
            tickSpacing,
            DEFAULT_SUPPLY,
            initialVirtualEth,
            graduationThreshold,
            baseFeeBps,
            extraFeeBps_,
            creatorShareBps,
            homeShareBps
        );

        require(t.transfer(address(c), DEFAULT_SUPPLY), "supply transfer failed");

        curveOf[address(t)] = address(c);
        launches.push(Launch({
            token: address(t),
            curve: address(c),
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

        emit Launched(address(t), address(c), msg.sender, name_, symbol_, extraFeeBps_, meta_.imageUrl, meta_.description);
        return (address(t), address(c));
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }
}
