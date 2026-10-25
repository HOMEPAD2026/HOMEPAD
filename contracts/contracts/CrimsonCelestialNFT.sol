// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Crimson Celestial — ARCIRCLE WORLD's MYTHIC gear as NFTs (step C)
/// @notice A piece of the set lives in the game (the server keeps it); its holder can take it onto Arc as an NFT with a
///         voucher signed by the team's wallet (the GM signs it in their own wallet — no key on any server), and bring it
///         back into the game by returning it here (it burns, and the game gives the piece to whoever returned it).
///         The piece's id, kind, origin, + and stars travel with it and are fixed while it is an NFT.
/// @dev    tokenId = the piece's number (from the game's id); a voucher is good once (its nonce) and until its deadline.
///         A returned piece can come out again with a new voucher (same tokenId, its new + / stars).
contract CrimsonCelestialNFT is ERC721, EIP712, Ownable {
    struct Piece { uint16 kind; uint8 src; uint8 plus; uint8 stars; }
    struct Voucher { address to; uint256 tokenId; uint16 kind; uint8 src; uint8 plus; uint8 stars; uint256 nonce; uint256 deadline; }

    bytes32 public constant VOUCHER_TYPEHASH = keccak256("Voucher(address to,uint256 tokenId,uint16 kind,uint8 src,uint8 plus,uint8 stars,uint256 nonce,uint256 deadline)");

    /// the wallet whose signature makes a voucher good (the team's GM wallet); changing it waits a day
    address public signer;
    address public pendingSigner;
    uint256 public pendingSignerAt;
    uint256 public constant SIGNER_DELAY = 1 days;

    string private base;
    mapping(uint256 => Piece) public pieceOf;
    mapping(uint256 => bool) public nonceUsed;

    event Minted(uint256 indexed tokenId, address indexed to, uint16 kind, uint8 src, uint8 plus, uint8 stars, uint256 nonce);
    event Returned(uint256 indexed tokenId, address indexed by);
    event SignerProposed(address indexed signer, uint256 at);
    event SignerSet(address indexed signer);
    event BaseURISet(string uri);

    error Expired();
    error BadSignature();
    error NonceUsed();
    error NotHolder();
    error TooEarly();
    error ZeroAddress();

    constructor(address owner_, address signer_, string memory base_) ERC721("Crimson Celestial", "CRIMSON") EIP712("CrimsonCelestialNFT", "1") Ownable(owner_) {
        if (signer_ == address(0)) revert ZeroAddress();
        signer = signer_; base = base_;
        emit SignerSet(signer_);
    }

    /// @notice Take a game piece onto Arc: anyone can send the voucher, the NFT goes to the voucher's `to`.
    function mint(Voucher calldata v, bytes calldata sig) external {
        if (block.timestamp > v.deadline) revert Expired();
        if (nonceUsed[v.nonce]) revert NonceUsed();
        bytes32 h = _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, v.to, v.tokenId, v.kind, v.src, v.plus, v.stars, v.nonce, v.deadline)));
        if (ECDSA.recover(h, sig) != signer) revert BadSignature();
        nonceUsed[v.nonce] = true;
        pieceOf[v.tokenId] = Piece(v.kind, v.src, v.plus, v.stars);
        _safeMint(v.to, v.tokenId);
        emit Minted(v.tokenId, v.to, v.kind, v.src, v.plus, v.stars, v.nonce);
    }

    /// @notice Bring a piece back into the game: it burns here, and the game gives it to you.
    function toGame(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotHolder();
        _burn(tokenId);
        delete pieceOf[tokenId];
        emit Returned(tokenId, msg.sender);
    }

    /// the voucher's digest (what the GM's wallet signs, EIP-712)
    function digest(Voucher calldata v) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, v.to, v.tokenId, v.kind, v.src, v.plus, v.stars, v.nonce, v.deadline)));
    }

    // ---------------- the owner ----------------
    function proposeSigner(address s) external onlyOwner { if (s == address(0)) revert ZeroAddress(); pendingSigner = s; pendingSignerAt = block.timestamp + SIGNER_DELAY; emit SignerProposed(s, pendingSignerAt); }
    function acceptSigner() external onlyOwner { if (pendingSigner == address(0) || block.timestamp < pendingSignerAt) revert TooEarly(); signer = pendingSigner; pendingSigner = address(0); emit SignerSet(signer); }
    function setBaseURI(string calldata u) external onlyOwner { base = u; emit BaseURISet(u); }
    function _baseURI() internal view override returns (string memory) { return base; }
}
