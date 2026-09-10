// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LaunchToken.sol";
import "./BondingCurve.sol";

/// @title HOMEPAD Factory
/// @notice Deploys a fixed-supply token + its own bonding curve in one
///         transaction. Config (fee split, treasury address, graduation
///         threshold) is set once at HOMEPAD deployment and applies to every
///         launch that goes through it — no per-launch admin override, and
///         no function anywhere in this contract can touch a launch's tokens
///         or ETH after it exists.
///
///         Fee model: baseFeeBps (1% by default) is fixed protocol-wide and
///         split creatorShareBps/rest between the creator and the platform
///         side. Each creator can additionally choose an extraFeeBps (0–2%,
///         their call, at launch time) which goes 100% to them — so total
///         fees on a given launch run 1%–3% depending on what its creator
///         picked. See BondingCurve.sol for the exact split math.
///
///         Metadata (image/description/socials) is stored as plain strings
///         on-chain for MVP simplicity — no backend or IPFS pinning needed
///         to make the Explore page work. That's a deliberate gas-cost
///         tradeoff: fine at low-to-moderate launch volume, worth migrating
///         to an off-chain URI (IPFS + indexer) if launches get frequent
///         and gas costs start to matter to creators.
contract HomepadFactory {
    address public immutable homeTreasury;
    address public immutable platformWallet;
    address public immutable router;

    uint256 public constant DEFAULT_SUPPLY = 1_000_000_000 ether; // 1B tokens, 18 decimals
    uint256 public immutable initialVirtualEth;
    uint256 public immutable graduationThreshold;
    uint16 public immutable baseFeeBps;      // e.g. 100 = 1%, protocol default
    uint16 public immutable creatorShareBps; // creator's cut of the base fee, e.g. 7000 = 70%
    uint16 public immutable homeShareBps;    // of the base fee's platform share, how much -> $HOME treasury
    uint16 public constant MAX_EXTRA_FEE_BPS = 200; // creators can add at most 2%

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
    }

    struct LaunchMeta {
        string imageUrl;
        string description;
        string twitter;
        string telegram;
        string discord;
    }

    Launch[] public launches;
    mapping(address => address) public curveOf; // token => curve

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
        address router_,
        uint256 initialVirtualEth_,
        uint256 graduationThreshold_,
        uint16 baseFeeBps_,
        uint16 creatorShareBps_,
        uint16 homeShareBps_
    ) {
        require(homeTreasury_ != address(0) && platformWallet_ != address(0) && router_ != address(0), "zero address");
        require(creatorShareBps_ <= 10000, "bad creator split");
        homeTreasury = homeTreasury_;
        platformWallet = platformWallet_;
        router = router_;
        initialVirtualEth = initialVirtualEth_;
        graduationThreshold = graduationThreshold_;
        baseFeeBps = baseFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;
    }

    /// @notice Launch a new token with no initial buy. Anyone can call this
    ///         — permissionless, like Pons. Metadata fields are all
    ///         optional — pass empty strings to skip any of them.
    /// @param extraFeeBps_ Optional additional fee, 0–200 (0–2%), entirely
    ///        yours as the creator. Pass 0 to just charge the 1% default.
    function launch(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external returns (address tokenAddr, address curveAddr) {
        return _launch(name_, symbol_, extraFeeBps_, meta_);
    }

    /// @notice Same as launch(), but if you send ETH along with the call,
    ///         it immediately buys you tokens in the same transaction — a
    ///         "dev buy," the same way Pons and pump.fun-style pads let a
    ///         creator seed their own initial position atomically with the
    ///         launch. Sending 0 ETH behaves exactly like launch().
    function launchAndBuy(
        string calldata name_,
        string calldata symbol_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_,
        uint256 minTokensOut_
    ) external payable returns (address tokenAddr, address curveAddr) {
        (tokenAddr, curveAddr) = _launch(name_, symbol_, extraFeeBps_, meta_);
        if (msg.value > 0) {
            BondingCurve(payable(curveAddr)).buy{value: msg.value}(minTokensOut_, msg.sender);
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

        BondingCurve c = new BondingCurve(
            address(t),
            msg.sender,
            homeTreasury,
            platformWallet,
            router,
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
            discord: meta_.discord
        }));

        emit Launched(address(t), address(c), msg.sender, name_, symbol_, extraFeeBps_, meta_.imageUrl, meta_.description);
        return (address(t), address(c));
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }
}
