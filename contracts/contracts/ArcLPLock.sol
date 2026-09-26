// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev The slice of Uniswap v4's PositionManager this contract uses.
interface IV4PositionManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }
    function transferFrom(address from, address to, uint256 id) external;
    function ownerOf(uint256 id) external view returns (address);
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory poolKey, uint256 info);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
}

/// @title ArcLPLock — time locks for Uniswap v4 liquidity positions on Arc
/// @notice Lock a v4 position NFT until a date you pick. Nobody — including
/// whoever deployed this contract — can move it out early: the only way out is
/// withdraw() by the lock's owner once the date has passed. While it is
/// locked, the owner can still collect the trading fees the position earns
/// (the liquidity itself stays put) and can push the date further out, never
/// closer. There is no admin, no fee and no upgrade path.
///
/// Two ways in:
///   * one transaction: positionManager.safeTransferFrom(you, this, tokenId, abi.encode(uint64 unlockAt))
///   * or approve this contract for the NFT, then lock(tokenId, unlockAt)
contract ArcLPLock is IERC721Receiver, ReentrancyGuard {
    struct Lock {
        address owner;
        uint256 tokenId;
        uint64 lockedAt;
        uint64 unlockAt;
        bool withdrawn;
    }

    // v4-periphery Actions
    uint8 private constant DECREASE_LIQUIDITY = 0x01;
    uint8 private constant TAKE_PAIR = 0x11;
    /// @notice The furthest a lock can be set: ~100 years, so a typo can't wrap a date around.
    uint64 public constant MAX_LOCK = 100 * 365 days;

    IV4PositionManager public immutable positionManager;

    Lock[] private _locks;
    /// @dev tokenId → lock id + 1 (0 = not locked here)
    mapping(uint256 => uint256) private _lockOfPosition;
    mapping(address => uint256[]) private _byOwner;
    mapping(uint256 => mapping(address => bool)) private _listed;

    event Locked(uint256 indexed lockId, address indexed owner, uint256 indexed tokenId, uint64 unlockAt);
    event Extended(uint256 indexed lockId, uint64 unlockAt);
    event OwnerChanged(uint256 indexed lockId, address indexed from, address indexed to);
    event Withdrawn(uint256 indexed lockId, address indexed owner, uint256 indexed tokenId);
    event FeesCollected(uint256 indexed lockId, address indexed to);

    error NotPositionManager();
    error BadUnlockDate();
    error NotLockOwner();
    error StillLocked();
    error AlreadyWithdrawn();
    error NoSuchLock();
    error ZeroAddress();
    error AlreadyLocked();

    constructor(address positionManager_) {
        if (positionManager_ == address(0)) revert ZeroAddress();
        positionManager = IV4PositionManager(positionManager_);
    }

    // ------------------------------------------------------------ locking
    /// @notice Lock a position you've approved this contract for.
    function lock(uint256 tokenId, uint64 unlockAt) external nonReentrant returns (uint256 lockId) {
        positionManager.transferFrom(msg.sender, address(this), tokenId);
        return _record(msg.sender, tokenId, unlockAt);
    }

    /// @notice One-transaction lock: safeTransferFrom the position here with
    /// abi.encode(uint64 unlockAt) as data. A transfer without that data is
    /// refused, so a position can't be sent here by accident and stranded.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata data) external returns (bytes4) {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        if (data.length != 32) revert BadUnlockDate();
        _record(from, tokenId, abi.decode(data, (uint64)));
        return IERC721Receiver.onERC721Received.selector;
    }

    function _record(address owner, uint256 tokenId, uint64 unlockAt) private returns (uint256 lockId) {
        if (owner == address(0)) revert ZeroAddress();
        if (unlockAt <= block.timestamp || unlockAt > block.timestamp + MAX_LOCK) revert BadUnlockDate();
        if (_lockOfPosition[tokenId] != 0) revert AlreadyLocked();
        lockId = _locks.length;
        _locks.push(Lock({owner: owner, tokenId: tokenId, lockedAt: uint64(block.timestamp), unlockAt: unlockAt, withdrawn: false}));
        _lockOfPosition[tokenId] = lockId + 1;
        _byOwner[owner].push(lockId);
        _listed[lockId][owner] = true;
        emit Locked(lockId, owner, tokenId, unlockAt);
    }

    // ------------------------------------------------------------ owner actions
    /// @notice Push the unlock date further out. It can never move closer.
    function extend(uint256 lockId, uint64 newUnlockAt) external {
        Lock storage l = _own(lockId);
        if (newUnlockAt <= l.unlockAt || newUnlockAt > block.timestamp + MAX_LOCK) revert BadUnlockDate();
        l.unlockAt = newUnlockAt;
        emit Extended(lockId, newUnlockAt);
    }

    /// @notice Hand the lock (and the right to withdraw it later) to another wallet.
    function transferLockOwnership(uint256 lockId, address newOwner) external {
        Lock storage l = _own(lockId);
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerChanged(lockId, l.owner, newOwner);
        l.owner = newOwner;
        if (!_listed[lockId][newOwner]) { _listed[lockId][newOwner] = true; _byOwner[newOwner].push(lockId); }
    }

    /// @notice Collect the fees the locked position has earned, to the lock's
    /// owner. The liquidity itself isn't touched (a zero-liquidity decrease).
    function collectFees(uint256 lockId) external nonReentrant {
        Lock storage l = _own(lockId);
        (IV4PositionManager.PoolKey memory key, ) = positionManager.getPoolAndPositionInfo(l.tokenId);
        bytes memory actions = abi.encodePacked(DECREASE_LIQUIDITY, TAKE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(l.tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, l.owner);
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
        emit FeesCollected(lockId, l.owner);
    }

    /// @notice After the unlock date: the position goes back to the lock's owner.
    function withdraw(uint256 lockId) external nonReentrant {
        Lock storage l = _own(lockId);
        if (block.timestamp < l.unlockAt) revert StillLocked();
        l.withdrawn = true;
        delete _lockOfPosition[l.tokenId];
        positionManager.transferFrom(address(this), l.owner, l.tokenId);
        emit Withdrawn(lockId, l.owner, l.tokenId);
    }

    function _own(uint256 lockId) private view returns (Lock storage l) {
        if (lockId >= _locks.length) revert NoSuchLock();
        l = _locks[lockId];
        if (l.withdrawn) revert AlreadyWithdrawn();
        if (msg.sender != l.owner) revert NotLockOwner();
    }

    // ------------------------------------------------------------ views
    function lockCount() external view returns (uint256) { return _locks.length; }

    function getLock(uint256 lockId) external view returns (Lock memory) {
        if (lockId >= _locks.length) revert NoSuchLock();
        return _locks[lockId];
    }

    /// @notice The active lock holding a position, if any.
    function lockOfPosition(uint256 tokenId) external view returns (bool locked, uint256 lockId, Lock memory l) {
        uint256 v = _lockOfPosition[tokenId];
        if (v == 0) return (false, 0, l);
        return (true, v - 1, _locks[v - 1]);
    }

    /// @notice Batch form of lockOfPosition, for pages listing many positions.
    function locksOfPositions(uint256[] calldata tokenIds) external view returns (uint256[] memory lockIds, Lock[] memory out) {
        lockIds = new uint256[](tokenIds.length);
        out = new Lock[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 v = _lockOfPosition[tokenIds[i]];
            if (v != 0) { lockIds[i] = v - 1; out[i] = _locks[v - 1]; }
        }
    }

    /// @notice Every lock a wallet owns now (including withdrawn ones it owned).
    function locksOfOwner(address owner) external view returns (uint256[] memory ids, Lock[] memory out) {
        uint256[] storage all = _byOwner[owner];
        uint256 n;
        for (uint256 i = 0; i < all.length; i++) if (_locks[all[i]].owner == owner) n++;
        ids = new uint256[](n);
        out = new Lock[](n);
        uint256 k;
        for (uint256 i = 0; i < all.length; i++) {
            Lock storage l = _locks[all[i]];
            if (l.owner == owner) { ids[k] = all[i]; out[k] = l; k++; }
        }
    }
}
