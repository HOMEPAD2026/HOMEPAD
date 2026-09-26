// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ArcDrop — claimable airdrops for very long lists (ARCIRCLE PAD Multisender)
/// @notice For lists too long to push one by one: the creator deposits the
///         total once with a Merkle root of (index, wallet, amount) rows, and
///         each wallet claims its own share (paying its own gas). Anyone may
///         submit a claim, but it always pays the listed wallet.
///         If the creator set an end date, whatever is still unclaimed after
///         it can be taken back by the creator — the page shows that date up
///         front. With no end date, unclaimed tokens stay claimable forever.
///         No owner, no admin, no fee, no pause, no upgrades.
/// @dev Leaves are keccak256(bytes.concat(keccak256(abi.encode(index, account, amount)))),
///      pairs are hashed sorted — the OpenZeppelin StandardMerkleTree format.
contract ArcDrop is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Drop {
        address token;
        address creator;
        bytes32 root;
        uint128 total;     // deposited
        uint128 claimed;   // paid out (or taken back)
        uint64 createdAt;
        uint64 endsAt;     // 0 = claimable forever
        uint32 recipients; // rows in the list (informational)
        uint32 claims;     // rows claimed so far
        bool reclaimed;
    }

    uint64 public constant MIN_WINDOW = 7 days;
    uint64 public constant MAX_WINDOW = 3650 days;

    Drop[] private _drops;
    mapping(uint256 => mapping(uint256 => uint256)) private _claimedBits; // drop → word → bitmap
    mapping(address => uint256[]) private _byCreator;
    mapping(address => uint256[]) private _byToken;

    event DropCreated(uint256 indexed id, address indexed token, address indexed creator, bytes32 root, uint256 total, uint256 recipients, uint64 endsAt);
    event Claimed(uint256 indexed id, uint256 index, address indexed account, uint256 amount);
    event Reclaimed(uint256 indexed id, address indexed creator, uint256 amount);

    error ZeroAmount();
    error BadRoot();
    error BadWindow();
    error ExactAmountRequired(uint256 expected, uint256 received);
    error AlreadyClaimed();
    error BadProof();
    error DropEnded();
    error NotCreator();
    error NotEnded();
    error NothingLeft();
    error UnknownDrop();

    /// @notice Deposit `total` of `token` for the list whose Merkle root is `root`.
    ///         `endsAt` 0 = never ends; otherwise at least 7 days from now.
    function create(address token, bytes32 root, uint256 total, uint32 recipients, uint64 endsAt) external nonReentrant returns (uint256 id) {
        if (total == 0 || total > type(uint128).max) revert ZeroAmount();
        if (root == bytes32(0)) revert BadRoot();
        if (endsAt != 0 && (endsAt < block.timestamp + MIN_WINDOW || endsAt > block.timestamp + MAX_WINDOW)) revert BadWindow();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        // a token that taxes transfers would leave the last claimers short
        if (received != total) revert ExactAmountRequired(total, received);
        id = _drops.length;
        _drops.push(Drop(token, msg.sender, root, uint128(total), 0, uint64(block.timestamp), endsAt, recipients, 0, false));
        _byCreator[msg.sender].push(id);
        _byToken[token].push(id);
        emit DropCreated(id, token, msg.sender, root, total, recipients, endsAt);
    }

    /// @notice Pay `amount` to `account` (row `index` of drop `id`). Anyone may call.
    function claim(uint256 id, uint256 index, address account, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Drop storage d = _get(id);
        if (d.reclaimed || (d.endsAt != 0 && block.timestamp >= d.endsAt)) revert DropEnded();
        if (isClaimed(id, index)) revert AlreadyClaimed();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
        if (!MerkleProof.verifyCalldata(proof, d.root, leaf)) revert BadProof();
        if (uint256(d.claimed) + amount > d.total) revert NothingLeft();
        _claimedBits[id][index >> 8] |= (1 << (index & 0xff));
        d.claimed += uint128(amount);
        d.claims += 1;
        IERC20(d.token).safeTransfer(account, amount);
        emit Claimed(id, index, account, amount);
    }

    /// @notice After the end date, the creator takes back what nobody claimed.
    function reclaim(uint256 id) external nonReentrant {
        Drop storage d = _get(id);
        if (msg.sender != d.creator) revert NotCreator();
        if (d.endsAt == 0 || block.timestamp < d.endsAt) revert NotEnded();
        if (d.reclaimed) revert NothingLeft();
        uint256 left = uint256(d.total) - d.claimed;
        d.reclaimed = true;
        d.claimed = d.total;
        if (left > 0) IERC20(d.token).safeTransfer(d.creator, left);
        emit Reclaimed(id, d.creator, left);
    }

    // ---------------- views ----------------
    function dropCount() external view returns (uint256) { return _drops.length; }
    function getDrop(uint256 id) external view returns (Drop memory) { return _get(id); }
    function idsOfCreator(address who) external view returns (uint256[] memory) { return _byCreator[who]; }
    function idsOfToken(address token) external view returns (uint256[] memory) { return _byToken[token]; }
    function isClaimed(uint256 id, uint256 index) public view returns (bool) {
        return (_claimedBits[id][index >> 8] >> (index & 0xff)) & 1 == 1;
    }
    /// @notice Claimed flags for many rows at once (for the claim page).
    function claimedMany(uint256 id, uint256[] calldata indexes) external view returns (bool[] memory out) {
        out = new bool[](indexes.length);
        for (uint256 i; i < indexes.length; ++i) out[i] = isClaimed(id, indexes[i]);
    }

    function _get(uint256 id) private view returns (Drop storage) {
        if (id >= _drops.length) revert UnknownDrop();
        return _drops[id];
    }
}
