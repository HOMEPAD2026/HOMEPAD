// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniswapV2.sol";

/// @title HOMEPAD Stock-Paired Bonding Curve
/// @notice Same mechanics as BondingCurve.sol (including the creator
///         fee-sharing model — see that file's header for the full
///         explanation), but the "reserve asset" is an ERC-20 (e.g. a
///         Robinhood Stock Token) instead of native ETH.
///
///         Buying requires the buyer to `approve` this contract for the
///         quoteToken first — there is no native-currency shortcut here the
///         way there is with ETH.
contract StockBondingCurve is ReentrancyGuard {
    IERC20 public immutable token;
    IERC20 public immutable quoteToken; // e.g. a Robinhood Stock Token
    address public immutable creator;
    address public immutable homeTreasury;
    address public immutable platformWallet;
    IUniswapV2Router02 public immutable router;

    uint256 public immutable totalSupply;
    uint256 public immutable graduationThreshold; // quoteToken units that trigger graduation

    uint16 public immutable baseFeeBps;
    uint16 public immutable extraFeeBps;
    uint16 public immutable creatorShareBps;
    uint16 public immutable homeShareBps;

    uint256 public virtualQuoteReserve;
    uint256 public virtualTokenReserve;

    uint256 public quoteRaised;
    uint256 public tokensSold;
    bool public graduated;

    event Buy(address indexed buyer, uint256 quoteIn, uint256 feePaid, uint256 tokensOut);
    event Sell(address indexed seller, uint256 tokensIn, uint256 feePaid, uint256 quoteOut);
    event Graduated(uint256 quoteToLiquidity, uint256 tokensToLiquidity, address pair, uint256 lpBurned);

    constructor(
        address token_,
        address quoteToken_,
        address creator_,
        address homeTreasury_,
        address platformWallet_,
        address router_,
        uint256 totalSupply_,
        uint256 initialVirtualQuote_,
        uint256 graduationThreshold_,
        uint16 baseFeeBps_,
        uint16 extraFeeBps_,
        uint16 creatorShareBps_,
        uint16 homeShareBps_
    ) {
        require(creator_ != address(0) && homeTreasury_ != address(0) && platformWallet_ != address(0), "zero address");
        require(quoteToken_ != address(0), "quote token required");
        require(baseFeeBps_ + extraFeeBps_ <= 1000, "fee too high");
        require(extraFeeBps_ <= 200, "extra fee capped at 2%");
        require(creatorShareBps_ <= 10000, "bad creator split");
        require(homeShareBps_ <= 10000, "bad home split");

        token = IERC20(token_);
        quoteToken = IERC20(quoteToken_);
        creator = creator_;
        homeTreasury = homeTreasury_;
        platformWallet = platformWallet_;
        router = IUniswapV2Router02(router_);
        totalSupply = totalSupply_;
        graduationThreshold = graduationThreshold_;
        baseFeeBps = baseFeeBps_;
        extraFeeBps = extraFeeBps_;
        creatorShareBps = creatorShareBps_;
        homeShareBps = homeShareBps_;

        virtualQuoteReserve = initialVirtualQuote_;
        virtualTokenReserve = totalSupply_;
    }

    modifier notGraduated() {
        require(!graduated, "graduated: trade on the DEX pool now");
        _;
    }

    function totalFeeBps() public view returns (uint16) {
        return baseFeeBps + extraFeeBps;
    }

    /// @notice Buy tokens by paying quoteToken. Caller must approve this
    ///         contract for at least `quoteIn` beforehand.
    function buy(uint256 quoteIn, uint256 minTokensOut) external nonReentrant notGraduated {
        require(quoteIn > 0, "quoteIn = 0");
        require(quoteToken.transferFrom(msg.sender, address(this), quoteIn), "quote pull failed");

        uint256 fee = (quoteIn * totalFeeBps()) / 10000;
        uint256 netIn = quoteIn - fee;

        uint256 k = virtualQuoteReserve * virtualTokenReserve;
        uint256 newVirtualQuote = virtualQuoteReserve + netIn;
        uint256 newVirtualToken = k / newVirtualQuote;
        uint256 tokensOut = virtualTokenReserve - newVirtualToken;

        require(tokensOut >= minTokensOut, "slippage");
        require(tokensOut <= token.balanceOf(address(this)), "curve depleted");

        virtualQuoteReserve = newVirtualQuote;
        virtualTokenReserve = newVirtualToken;
        quoteRaised += netIn;
        tokensSold += tokensOut;

        _routeFee(fee);
        require(token.transfer(msg.sender, tokensOut), "token transfer failed");

        emit Buy(msg.sender, quoteIn, fee, tokensOut);

        if (quoteRaised >= graduationThreshold) {
            _graduate();
        }
    }

    /// @notice Sell tokens back for quoteToken. Caller must approve this
    ///         contract for at least `tokenAmount` of `token` beforehand.
    function sell(uint256 tokenAmount, uint256 minQuoteOut) external nonReentrant notGraduated {
        require(tokenAmount > 0, "amount = 0");

        uint256 k = virtualQuoteReserve * virtualTokenReserve;
        uint256 newVirtualToken = virtualTokenReserve + tokenAmount;
        uint256 newVirtualQuote = k / newVirtualToken;
        uint256 quoteOutGross = virtualQuoteReserve - newVirtualQuote;

        uint256 available = quoteToken.balanceOf(address(this));
        if (quoteOutGross > available) {
            quoteOutGross = available;
        }

        uint256 fee = (quoteOutGross * totalFeeBps()) / 10000;
        uint256 quoteOutNet = quoteOutGross - fee;
        require(quoteOutNet >= minQuoteOut, "slippage");

        virtualQuoteReserve = newVirtualQuote;
        virtualTokenReserve = newVirtualToken;
        quoteRaised -= quoteOutGross;
        tokensSold -= tokenAmount;

        require(token.transferFrom(msg.sender, address(this), tokenAmount), "token transfer failed");
        _routeFee(fee);
        require(quoteToken.transfer(msg.sender, quoteOutNet), "quote transfer failed");

        emit Sell(msg.sender, tokenAmount, fee, quoteOutNet);
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

        if (toCreator > 0) require(quoteToken.transfer(creator, toCreator), "creator transfer failed");
        if (toHome > 0) require(quoteToken.transfer(homeTreasury, toHome), "home transfer failed");
        if (toPlatform > 0) require(quoteToken.transfer(platformWallet, toPlatform), "platform transfer failed");
    }

    /// @notice Permissionless, same as the ETH curve — anyone can trigger
    ///         graduation once the threshold is met.
    function graduate() external nonReentrant {
        require(!graduated, "already graduated");
        require(quoteRaised >= graduationThreshold, "threshold not met");
        _graduate();
    }

    function _graduate() internal {
        graduated = true;

        uint256 quoteForLp = quoteToken.balanceOf(address(this));
        uint256 tokensForLp = token.balanceOf(address(this));

        token.approve(address(router), tokensForLp);
        quoteToken.approve(address(router), quoteForLp);

        (, , uint256 liquidity) = router.addLiquidity(
            address(token),
            address(quoteToken),
            tokensForLp,
            quoteForLp,
            0,
            0,
            address(this),
            block.timestamp
        );

        address pair = IUniswapV2Factory(router.factory()).getPair(address(token), address(quoteToken));
        IERC20(pair).transfer(0x000000000000000000000000000000000000dEaD, liquidity);

        emit Graduated(quoteForLp, tokensForLp, pair, liquidity);
    }
}
