// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniswapV2.sol";

/// @title HOMEPAD Bonding Curve
/// @notice One of these is deployed per launched token by HomepadFactory.
///         Holds the token's entire fixed supply and sells it along a
///         constant-product curve until a graduation threshold of ETH is
///         raised, then permissionlessly migrates the raised ETH + remaining
///         tokens into a Uniswap V2 pool and burns the LP so nobody —
///         including this contract's deployer — can ever pull it back out.
///
///         Fee model: every trade pays `baseFeeBps` (the protocol default,
///         1% at deploy time) plus whatever `extraFeeBps` the creator chose
///         at launch (0–2%), for a total of 1%–3%. The base fee is split
///         `creatorShareBps` (70% by default) to the creator and the rest to
///         the platform side (further split between the $HOME treasury and
///         platform ops via `homeShareBps`, unchanged from before). The
///         extra fee, if any, goes 100% to the creator — it's their choice
///         to charge it, so it's entirely theirs.
///
///         There is no owner function that can change any of this after
///         deployment — whatever is set at construction is permanent.
contract BondingCurve is ReentrancyGuard {
    IERC20 public immutable token;
    address public immutable creator;
    address public immutable homeTreasury;
    address public immutable platformWallet;
    IUniswapV2Router02 public immutable router;

    uint256 public immutable totalSupply;
    uint256 public immutable graduationThreshold; // wei of net ETH raised that triggers graduation

    uint16 public immutable baseFeeBps;      // protocol default fee, e.g. 100 = 1%
    uint16 public immutable extraFeeBps;     // creator-chosen add-on, 0–200 (0–2%), 100% to creator
    uint16 public immutable creatorShareBps; // creator's cut of the BASE fee, e.g. 7000 = 70%
    uint16 public immutable homeShareBps;    // of the base fee's platform share, how much -> $HOME treasury (rest -> platformWallet)

    // Virtual reserves used only for pricing (constant product k = ethR * tokenR).
    // Starting them above the real balances gives new launches a gentler
    // opening curve instead of an instant vertical price spike.
    uint256 public virtualEthReserve;
    uint256 public virtualTokenReserve;

    uint256 public ethRaised;      // net ETH banked toward graduation (post-fee)
    uint256 public tokensSold;     // running total sold to buyers
    bool public graduated;

    event Buy(address indexed buyer, uint256 ethIn, uint256 feePaid, uint256 tokensOut);
    event Sell(address indexed seller, uint256 tokensIn, uint256 feePaid, uint256 ethOut);
    event Graduated(uint256 ethToLiquidity, uint256 tokensToLiquidity, address pair, uint256 lpBurned);

    constructor(
        address token_,
        address creator_,
        address homeTreasury_,
        address platformWallet_,
        address router_,
        uint256 totalSupply_,
        uint256 initialVirtualEth_,
        uint256 graduationThreshold_,
        uint16 baseFeeBps_,
        uint16 extraFeeBps_,
        uint16 creatorShareBps_,
        uint16 homeShareBps_
    ) {
        require(creator_ != address(0) && homeTreasury_ != address(0) && platformWallet_ != address(0), "zero address");
        require(baseFeeBps_ + extraFeeBps_ <= 1000, "fee too high"); // hard cap 10% total
        require(extraFeeBps_ <= 200, "extra fee capped at 2%");
        require(creatorShareBps_ <= 10000, "bad creator split");
        require(homeShareBps_ <= 10000, "bad home split");

        token = IERC20(token_);
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

    /// @notice Buy tokens along the curve. Reverts if the output is below
    ///         minTokensOut. Tokens go to `recipient`, not necessarily
    ///         msg.sender — this lets HomepadFactory buy on a launcher's
    ///         behalf in the same transaction as launch() (a "dev buy"),
    ///         forwarding the tokens straight to them. A normal direct buy
    ///         just passes its own address as recipient.
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

    /// @notice Sell tokens back into the curve. Reverts if payout is below minEthOut.
    function sell(uint256 tokenAmount, uint256 minEthOut) external nonReentrant notGraduated {
        require(tokenAmount > 0, "amount = 0");

        uint256 k = virtualEthReserve * virtualTokenReserve;
        uint256 newVirtualToken = virtualTokenReserve + tokenAmount;
        uint256 newVirtualEth = k / newVirtualToken;
        uint256 ethOutGross = virtualEthReserve - newVirtualEth;

        // The virtual-reserve math can drift by a wei or two from the
        // contract's true ETH balance due to integer-division rounding.
        // Clamp to what the curve actually holds so a sell can never be
        // computed as larger than the contract can pay — the contract's
        // real balance is the source of truth, not the virtual curve.
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

    /// @dev Splits a trade's total fee three ways:
    ///      1. baseFee's creatorShareBps -> creator
    ///      2. baseFee's remainder, further split by homeShareBps -> homeTreasury / platformWallet
    ///      3. the entire extraFee -> creator
    function _routeFee(uint256 fee) internal {
        if (fee == 0) return;

        uint16 total = totalFeeBps();
        // baseFeeBps's share of this specific fee amount (proportional split,
        // since `fee` was computed off totalFeeBps as a whole).
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

    /// @notice Anyone can call this once the threshold is met — it does not
    ///         depend on the deployer or any admin key. Sends the raised ETH
    ///         and the curve's remaining tokens into a new Uniswap V2 pool,
    ///         then burns the LP so it can never be withdrawn again.
    function graduate() external nonReentrant {
        require(!graduated, "already graduated");
        require(ethRaised >= graduationThreshold, "threshold not met");
        _graduate();
    }

    function _graduate() internal {
        graduated = true;

        uint256 ethForLp = address(this).balance;
        uint256 tokensForLp = token.balanceOf(address(this));

        token.approve(address(router), tokensForLp);

        (, , uint256 liquidity) = router.addLiquidityETH{value: ethForLp}(
            address(token),
            tokensForLp,
            0, // MVP: no min — acceptable because this is a one-time, permissionless, same-block action
            0,
            address(this),
            block.timestamp
        );

        address pair = IUniswapV2Factory(router.factory()).getPair(address(token), router.WETH());
        // Burn the LP: send it somewhere nobody holds a key to.
        IERC20(pair).transfer(0x000000000000000000000000000000000000dEaD, liquidity);

        emit Graduated(ethForLp, tokensForLp, pair, liquidity);
    }

    receive() external payable {}
}
