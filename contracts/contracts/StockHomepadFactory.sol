// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./LaunchToken.sol";
import "./StockBondingCurve.sol";

/// @title HOMEPAD Stock-Pair Factory
/// @notice Same permissionless-launch pattern as HomepadFactory (including
///         the creator fee-sharing model — see that file's header for the
///         full explanation), but every launch is quoted against a
///         Robinhood Stock Token (or any ERC-20) chosen from a fixed
///         allowlist set at deployment, instead of ETH.
///
///         The allowlist is intentionally immutable — set once at deploy
///         time, no admin function to add more later. That matches the rest
///         of HOMEPAD's "no admin key, ever" design.
///
///         No "dev buy" here, unlike the ETH factory's launchAndBuy(). ETH
///         can ride along with the launch transaction as msg.value; an
///         ERC-20 quote token can't — the creator would need to `approve`
///         the curve before it exists, which is impossible.
contract StockHomepadFactory {
    address public immutable homeTreasury;
    address public immutable platformWallet;
    address public immutable router;

    uint256 public constant DEFAULT_SUPPLY = 1_000_000_000 ether;
    uint256 public immutable graduationThreshold; // in quote-token units (18 decimals, matching Stock Tokens)
    uint16 public immutable baseFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable homeShareBps;
    uint16 public constant MAX_EXTRA_FEE_BPS = 200;

    mapping(address => bool) public isAllowedQuote;
    address[] public allowedQuoteTokens; // for the frontend to list options

    struct LaunchMeta {
        string imageUrl;
        string description;
        string twitter;
        string telegram;
        string discord;
    }

    struct Launch {
        address token;
        address curve;
        address quoteToken;
        address creator;
        uint256 launchedAt;
        uint16 extraFeeBps;
        string imageUrl;
        string description;
        string twitter;
        string telegram;
        string discord;
    }

    Launch[] public launches;
    mapping(address => address) public curveOf;

    event Launched(
        address indexed token,
        address indexed curve,
        address indexed creator,
        address quoteToken,
        string name,
        string symbol,
        uint16 extraFeeBps
    );

    constructor(
        address homeTreasury_,
        address platformWallet_,
        address router_,
        uint256 graduationThreshold_,
        uint16 baseFeeBps_,
        uint16 creatorShareBps_,
        uint16 homeShareBps_,
        address[] memory allowedQuoteTokens_
    ) {
        require(homeTreasury_ != address(0) && platformWallet_ != address(0) && router_ != address(0), "zero address");
        require(allowedQuoteTokens_.length > 0, "need at least one quote token");
        require(creatorShareBps_ <= 10000, "bad creator split");

        homeTreasury = homeTreasury_;
        platformWallet = platformWallet_;
        router = router_;
        graduationThreshold = graduationThreshold_;
        baseFeeBps = baseFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;

        for (uint256 i = 0; i < allowedQuoteTokens_.length; i++) {
            address q = allowedQuoteTokens_[i];
            require(q != address(0), "zero quote token");
            isAllowedQuote[q] = true;
            allowedQuoteTokens.push(q);
        }
    }

    function allowedQuoteTokenCount() external view returns (uint256) {
        return allowedQuoteTokens.length;
    }

    /// @param quoteToken_ Must be one of the addresses set at deployment.
    /// @param initialVirtualQuote_ Shapes the opening price curve, in
    ///        quoteToken units.
    /// @param extraFeeBps_ Optional additional fee, 0–200 (0–2%), entirely
    ///        the creator's.
    function launch(
        string calldata name_,
        string calldata symbol_,
        address quoteToken_,
        uint256 initialVirtualQuote_,
        uint16 extraFeeBps_,
        LaunchMeta calldata meta_
    ) external returns (address tokenAddr, address curveAddr) {
        require(isAllowedQuote[quoteToken_], "quote token not allowed");
        require(extraFeeBps_ <= MAX_EXTRA_FEE_BPS, "extra fee capped at 2%");

        LaunchToken t = new LaunchToken(name_, symbol_, DEFAULT_SUPPLY, address(this));

        StockBondingCurve c = new StockBondingCurve(
            address(t),
            quoteToken_,
            msg.sender,
            homeTreasury,
            platformWallet,
            router,
            DEFAULT_SUPPLY,
            initialVirtualQuote_,
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
            quoteToken: quoteToken_,
            creator: msg.sender,
            launchedAt: block.timestamp,
            extraFeeBps: extraFeeBps_,
            imageUrl: meta_.imageUrl,
            description: meta_.description,
            twitter: meta_.twitter,
            telegram: meta_.telegram,
            discord: meta_.discord
        }));

        emit Launched(address(t), address(c), msg.sender, quoteToken_, name_, symbol_, extraFeeBps_);
        return (address(t), address(c));
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }
}
