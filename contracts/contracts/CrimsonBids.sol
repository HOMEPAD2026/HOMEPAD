// SPDX-License-Identifier: MIT
// Arc Studio audit: pending (Arc Studio could not be run from the session that wrote this; see
// contracts/audits/arc-studio-2026-11-03.md). Do not deploy before it is audited.
pragma solidity 0.8.26;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICrimsonPiece {
    function pieceOf(uint256 tokenId) external view returns (uint16 kind, uint8 src, uint8 plus, uint8 stars);
}

/// @title Crimson Bids — offers in USDC for Crimson Celestial NFTs on Arc (ARCIRCLE WORLD, 2026-11-03)
/// @notice A buyer offers USDC for a piece, held here (escrow) until they take it back or the piece's holder accepts:
///         then the piece moves from the holder to the buyer and the holder gets the offer less the platform fee
///         (2 % at start, at most 10 %), all in the same transaction.
///           • one live offer a buyer a piece; offering more tops it up, cancelBid gives it all back at any time
///           • an offer has an expiry: after it, it can't be accepted, and its buyer (or anyone, for them) takes it back
///           • an offer is tied to the piece as it was when offered (its kind / + / stars): if the piece goes back to
///             the game and comes out again different, the old offer can't be accepted for it
///           • the holder names the least they'll receive (`minProceeds`, after the fee), so neither a fee change nor a
///             replaced offer can pay them less than they agreed to
///           • fees are counted apart from the escrow and only ever go to `feeTo`; the escrow only ever goes back to its
///             buyer or, on a sale, to the piece's holder. Nobody — the owner included — can take escrowed USDC.
contract CrimsonBids is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Offer { uint128 amount; uint64 expiry; bytes32 stamp; }

    IERC721 public immutable nft;
    IERC20 public immutable usdc;
    address public feeTo;
    uint16 public feeBps = 200;
    uint16 public constant MAX_FEE_BPS = 1000;
    uint256 public constant MIN_BID = 1e6;            // 1 USDC
    uint256 public constant MAX_BID = 1_000_000e6;    // 1,000,000 USDC
    uint256 public constant MAX_TERM = 90 days;       // the furthest an expiry may be

    mapping(uint256 => mapping(address => Offer)) public bidOf; // tokenId → bidder → offer
    mapping(uint256 => address[]) internal _bidders;
    mapping(uint256 => mapping(address => uint256)) internal _slot; // index + 1 in _bidders
    uint256 public totalEscrow;  // USDC held for live and expired offers
    uint256 public feesAccrued;  // USDC owed to feeTo (never part of the escrow)

    event Bid(uint256 indexed tokenId, address indexed bidder, uint256 amount, uint256 expiry);
    event BidCancelled(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event BidAccepted(uint256 indexed tokenId, address indexed seller, address indexed bidder, uint256 amount, uint256 fee);
    event FeesClaimed(address indexed feeTo, uint256 amount);
    event FeeSet(address feeTo, uint16 feeBps);

    error BadAmount();
    error BadExpiry();
    error OwnPiece();
    error NoBid();
    error Expired();
    error NotHolder();
    error NotApproved();
    error PieceChanged();
    error TooLittle(uint256 proceeds, uint256 minProceeds);
    error BadFee();
    error ZeroAddress();
    error NoRenounce();

    constructor(IERC721 nft_, IERC20 usdc_, address feeTo_, address owner_) Ownable(owner_) {
        if (address(nft_) == address(0) || address(usdc_) == address(0) || feeTo_ == address(0)) revert ZeroAddress();
        nft = nft_; usdc = usdc_; feeTo = feeTo_;
        emit FeeSet(feeTo_, feeBps);
    }

    // ------------------------------------------------------------------ buyers
    /// @notice Offer `amount` USDC for `tokenId` until `expiry` (approve this contract for the USDC first). With an
    ///         offer already in, `amount` is the new total: only the difference is taken, and the expiry is renewed.
    function bid(uint256 tokenId, uint256 amount, uint64 expiry) external nonReentrant {
        if (amount < MIN_BID || amount > MAX_BID) revert BadAmount();
        if (expiry <= block.timestamp || expiry > block.timestamp + MAX_TERM) revert BadExpiry();
        if (nft.ownerOf(tokenId) == msg.sender) revert OwnPiece();
        Offer storage o = bidOf[tokenId][msg.sender];
        uint256 had = o.amount;
        if (amount <= had) revert BadAmount();
        if (had == 0) { _bidders[tokenId].push(msg.sender); _slot[tokenId][msg.sender] = _bidders[tokenId].length; }
        o.amount = uint128(amount);
        o.expiry = expiry;
        o.stamp = _stamp(tokenId);
        totalEscrow += amount - had;
        usdc.safeTransferFrom(msg.sender, address(this), amount - had);
        emit Bid(tokenId, msg.sender, amount, expiry);
    }

    /// @notice Take your offer back, all of it, at any time (live or expired).
    function cancelBid(uint256 tokenId) external nonReentrant { _refund(tokenId, msg.sender); }

    /// @notice Anyone can clear an expired offer: the USDC goes back to its buyer, never anywhere else.
    function clearExpired(uint256 tokenId, address bidder) external nonReentrant {
        Offer memory o = bidOf[tokenId][bidder];
        if (o.amount == 0) revert NoBid();
        if (block.timestamp <= o.expiry) revert BadExpiry();
        _refund(tokenId, bidder);
    }

    // ------------------------------------------------------------------ holders
    /// @notice Accept `bidder`'s offer for a piece you hold (approve this contract for it, or for all, first). You get
    ///         the offer less the fee, at least `minProceeds`; the piece goes to the bidder.
    function accept(uint256 tokenId, address bidder, uint256 minProceeds) external nonReentrant {
        if (nft.ownerOf(tokenId) != msg.sender) revert NotHolder();
        if (bidder == msg.sender) revert OwnPiece();
        if (nft.getApproved(tokenId) != address(this) && !nft.isApprovedForAll(msg.sender, address(this))) revert NotApproved();
        Offer memory o = bidOf[tokenId][bidder];
        if (o.amount == 0) revert NoBid();
        if (block.timestamp > o.expiry) revert Expired();
        if (o.stamp != _stamp(tokenId)) revert PieceChanged();
        uint256 fee = (uint256(o.amount) * feeBps) / 10_000;
        uint256 proceeds = o.amount - fee;
        if (proceeds < minProceeds) revert TooLittle(proceeds, minProceeds);
        _remove(tokenId, bidder);
        totalEscrow -= o.amount;
        feesAccrued += fee;
        nft.safeTransferFrom(msg.sender, bidder, tokenId);
        usdc.safeTransfer(msg.sender, proceeds);
        emit BidAccepted(tokenId, msg.sender, bidder, o.amount, fee);
    }

    /// @notice Send the fees owed to feeTo (anyone can call it; it never touches the escrow).
    function claimFees() external nonReentrant {
        uint256 f = feesAccrued;
        feesAccrued = 0;
        usdc.safeTransfer(feeTo, f);
        emit FeesClaimed(feeTo, f);
    }

    // ------------------------------------------------------------------ views
    /// @notice A piece's live (not expired) offers.
    function liveBids(uint256 tokenId) external view returns (address[] memory bidders, uint256[] memory amounts, uint256[] memory expiries) {
        address[] storage all = _bidders[tokenId];
        uint256 n;
        for (uint256 i; i < all.length; i++) if (bidOf[tokenId][all[i]].expiry >= block.timestamp) n++;
        bidders = new address[](n); amounts = new uint256[](n); expiries = new uint256[](n);
        uint256 k;
        for (uint256 i; i < all.length; i++) {
            Offer memory o = bidOf[tokenId][all[i]];
            if (o.expiry < block.timestamp) continue;
            (bidders[k], amounts[k], expiries[k]) = (all[i], o.amount, o.expiry);
            k++;
        }
    }
    /// @notice Every offer held for a piece, expired ones included.
    function biddersOf(uint256 tokenId) external view returns (address[] memory) { return _bidders[tokenId]; }

    // ------------------------------------------------------------------ the owner (fee only)
    /// @notice The platform fee and where it goes (never above 10 %). Fees already owed go to the new feeTo.
    function setFee(address feeTo_, uint16 feeBps_) external onlyOwner {
        if (feeTo_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert BadFee();
        feeTo = feeTo_; feeBps = feeBps_;
        emit FeeSet(feeTo_, feeBps_);
    }
    /// @dev Renouncing would freeze the fee settings for good; not allowed.
    function renounceOwnership() public view override onlyOwner { revert NoRenounce(); }

    // ------------------------------------------------------------------ internal
    function _refund(uint256 tokenId, address bidder) internal {
        uint256 a = bidOf[tokenId][bidder].amount;
        if (a == 0) revert NoBid();
        _remove(tokenId, bidder);
        totalEscrow -= a;
        usdc.safeTransfer(bidder, a);
        emit BidCancelled(tokenId, bidder, a);
    }
    function _remove(uint256 tokenId, address bidder) internal {
        delete bidOf[tokenId][bidder];
        uint256 i = _slot[tokenId][bidder] - 1;
        address[] storage all = _bidders[tokenId];
        address last = all[all.length - 1];
        all[i] = last; _slot[tokenId][last] = i + 1;
        all.pop();
        delete _slot[tokenId][bidder];
    }
    function _stamp(uint256 tokenId) internal view returns (bytes32) {
        (uint16 kind, uint8 src, uint8 plus, uint8 stars) = ICrimsonPiece(address(nft)).pieceOf(tokenId);
        return keccak256(abi.encode(kind, src, plus, stars));
    }
}
