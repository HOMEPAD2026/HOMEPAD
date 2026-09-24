// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ArcLock — time locks for ArcPad creators
/// @notice Anyone can lock any ERC-20 until a date they choose. Only the wallet
///         that created a lock can withdraw it, and only once the date has
///         passed; the date can be pushed later but never earlier. There is no
///         owner, no admin, no fee, no pause and no upgrade path — once tokens
///         are in, nobody (including the deployer) can move them before the
///         unlock time.
/// @dev ArcPad shows a "Locked" badge on a coin when its creator holds an
///      active lock here. Amounts are measured by balance delta, so tokens
///      that tax transfers are recorded at what actually arrived.
contract ArcLock is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Lock {
        address token;
        address owner;
        uint128 amount;
        uint64 lockedAt;
        uint64 unlockAt;
        bool withdrawn;
    }

    uint64 public constant MIN_DURATION = 1 days;
    uint64 public constant MAX_DURATION = 3650 days;

    Lock[] private _locks;
    mapping(address => uint256[]) private _byToken;
    mapping(address => uint256[]) private _byOwner;

    event Locked(uint256 indexed id, address indexed token, address indexed owner, uint256 amount, uint64 unlockAt);
    event Extended(uint256 indexed id, uint64 unlockAt);
    event Withdrawn(uint256 indexed id, address indexed owner, uint256 amount);

    error ZeroAmount();
    error BadUnlockTime();
    error NothingReceived();
    error NotOwner();
    error AlreadyWithdrawn();
    error StillLocked(uint64 unlockAt);
    error UnknownLock();

    /// @notice Lock `amount` of `token` until `unlockAt` (unix seconds). Needs an approval first.
    function lock(address token, uint256 amount, uint64 unlockAt) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        uint256 nowTs = block.timestamp;
        if (unlockAt < nowTs + MIN_DURATION || unlockAt > nowTs + MAX_DURATION) revert BadUnlockTime();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0 || received > type(uint128).max) revert NothingReceived();
        id = _locks.length;
        _locks.push(Lock(token, msg.sender, uint128(received), uint64(nowTs), unlockAt, false));
        _byToken[token].push(id);
        _byOwner[msg.sender].push(id);
        emit Locked(id, token, msg.sender, received, unlockAt);
    }

    /// @notice Push a lock's unlock time later. It can never move earlier.
    function extend(uint256 id, uint64 newUnlockAt) external {
        Lock storage l = _get(id);
        if (l.owner != msg.sender) revert NotOwner();
        if (l.withdrawn) revert AlreadyWithdrawn();
        if (newUnlockAt <= l.unlockAt || newUnlockAt > block.timestamp + MAX_DURATION) revert BadUnlockTime();
        l.unlockAt = newUnlockAt;
        emit Extended(id, newUnlockAt);
    }

    /// @notice Return the tokens to the lock's owner once the unlock time has passed.
    function withdraw(uint256 id) external nonReentrant {
        Lock storage l = _get(id);
        if (l.owner != msg.sender) revert NotOwner();
        if (l.withdrawn) revert AlreadyWithdrawn();
        if (block.timestamp < l.unlockAt) revert StillLocked(l.unlockAt);
        l.withdrawn = true;
        uint256 amount = l.amount;
        IERC20(l.token).safeTransfer(l.owner, amount);
        emit Withdrawn(id, l.owner, amount);
    }

    // ---------------- views ----------------
    function lockCount() external view returns (uint256) { return _locks.length; }
    function getLock(uint256 id) external view returns (Lock memory) { return _get(id); }
    function lockIdsOfToken(address token) external view returns (uint256[] memory) { return _byToken[token]; }
    function lockIdsOfOwner(address owner) external view returns (uint256[] memory) { return _byOwner[owner]; }

    /// @notice Every lock ever made for `token` (ids and records), newest last.
    function locksOfToken(address token) external view returns (uint256[] memory ids, Lock[] memory out) {
        ids = _byToken[token];
        out = new Lock[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = _locks[ids[i]];
    }

    /// @notice Tokens of `token` that `owner` still has locked right now.
    function activeLockedBy(address token, address owner) external view returns (uint256 total, uint64 firstUnlock) {
        uint256[] storage ids = _byToken[token];
        for (uint256 i; i < ids.length; ++i) {
            Lock storage l = _locks[ids[i]];
            if (l.owner != owner || l.withdrawn || l.unlockAt <= block.timestamp) continue;
            total += l.amount;
            if (firstUnlock == 0 || l.unlockAt < firstUnlock) firstUnlock = l.unlockAt;
        }
    }

    function _get(uint256 id) private view returns (Lock storage) {
        if (id >= _locks.length) revert UnknownLock();
        return _locks[id];
    }
}
