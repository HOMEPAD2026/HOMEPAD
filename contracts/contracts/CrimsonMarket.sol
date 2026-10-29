// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @custom:audit Audited with Arc Studio — studio.arc.io (2026-10-29, balanced rigor; session crimson-audit, app
///         4f2ec0cc-8e7e-44f0-92b6-1e4b26e01961, thread 7a50b058-44fe-4470-ad9c-d3d7276f06ae): 1 medium · 3 low · 5 info, no critical / high.
///         Report and the game's mitigations: contracts/audits/arc-studio-2026-10-29.md. (This comment was added after the
///         deployment; the deployed bytecode is from the source before it.)
/// @title Crimson Market — buy and sell Crimson Celestial NFTs for USDC on Arc (ARCIRCLE WORLD, the owner's call 2026-10-26)
/// @notice Nothing is held here: a seller lists a piece they hold (and lets this contract move it), a buyer pays the
///         price in USDC and the piece moves from the seller straight to the buyer in the same transaction. The platform
///         fee (2 % at start, at most 10 %) goes to `feeTo`; the rest goes to the seller.
/// @dev    A listing stays valid only while the seller still holds the piece (checked at the sale), so a piece that was
///         sold elsewhere or returned to the game can't be bought here. The buyer names the most they'll pay (`maxPrice`)
///         so a seller can't raise the price under a pending buy.
contract CrimsonMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Listing { address seller; uint256 price; }

    IERC721 public immutable nft;
    IERC20 public immutable usdc;
    address public feeTo;
    uint16 public feeBps;
    uint16 public constant MAX_FEE_BPS = 1000;
    uint256 public constant MIN_PRICE = 1e6;          // 1 USDC
    uint256 public constant MAX_PRICE = 1_000_000e6;  // 1,000,000 USDC

    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event FeeSet(address feeTo, uint16 feeBps);

    error NotHolder();
    error NotApproved();
    error BadPrice();
    error NotListed();
    error PriceChanged();
    error OwnPiece();
    error BadFee();
    error ZeroAddress();

    constructor(address owner_, IERC721 nft_, IERC20 usdc_, address feeTo_, uint16 feeBps_) Ownable(owner_) {
        if (address(nft_) == address(0) || address(usdc_) == address(0) || feeTo_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert BadFee();
        nft = nft_; usdc = usdc_; feeTo = feeTo_; feeBps = feeBps_;
        emit FeeSet(feeTo_, feeBps_);
    }

    /// @notice List (or re-price) a piece you hold. Approve this contract for it (or for all) first.
    function list(uint256 tokenId, uint256 price) external {
        if (price < MIN_PRICE || price > MAX_PRICE) revert BadPrice();
        if (nft.ownerOf(tokenId) != msg.sender) revert NotHolder();
        if (nft.getApproved(tokenId) != address(this) && !nft.isApprovedForAll(msg.sender, address(this))) revert NotApproved();
        listings[tokenId] = Listing(msg.sender, price);
        emit Listed(tokenId, msg.sender, price);
    }

    /// @notice Take a listing down: its seller, or anyone once the seller no longer holds the piece.
    function cancel(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (msg.sender != l.seller && nft.ownerOf(tokenId) == l.seller) revert NotHolder();
        delete listings[tokenId];
        emit Cancelled(tokenId, l.seller);
    }

    /// @notice Buy a listed piece: pays `price` USDC (approve it first), the piece comes to you.
    function buy(uint256 tokenId, uint256 maxPrice) external nonReentrant {
        Listing memory l = listings[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.price > maxPrice) revert PriceChanged();
        if (l.seller == msg.sender) revert OwnPiece();
        if (nft.ownerOf(tokenId) != l.seller) revert NotHolder();
        delete listings[tokenId];
        uint256 fee = (l.price * feeBps) / 10_000;
        if (fee > 0) usdc.safeTransferFrom(msg.sender, feeTo, fee);
        usdc.safeTransferFrom(msg.sender, l.seller, l.price - fee);
        nft.safeTransferFrom(l.seller, msg.sender, tokenId);
        emit Sold(tokenId, l.seller, msg.sender, l.price, fee);
    }

    /// @notice The platform fee and where it goes (never above 10 %).
    function setFee(address feeTo_, uint16 feeBps_) external onlyOwner {
        if (feeTo_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert BadFee();
        feeTo = feeTo_; feeBps = feeBps_;
        emit FeeSet(feeTo_, feeBps_);
    }
}
