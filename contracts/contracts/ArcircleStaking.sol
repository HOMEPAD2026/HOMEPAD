// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ARCIRCLE Staking — veARCIRCLE (ARCIRCLE PAD utility)
/// @notice Lock $ARCIRCLE for up to a year and get veARCIRCLE: voting power that is largest when the lock is new and
///         long, and runs down to zero as the unlock date gets closer (amount × time left ÷ 1 year).
///           • one lock per wallet: add to it or push its unlock date out at any time; withdraw only after it ends —
///             there is no early exit
///           • or a max lock: veARCIRCLE stays at the full amount (a year's worth) and never runs down. Turning it off
///             starts a normal one-year lock from that moment
///           • rewards in USDC: anyone can fund a week (the ARCIRCLE PAD treasury sends half of what it receives from
///             ARCIRCLE Orders and Predict fees). Week w's rewards go to whoever held veARCIRCLE when week w began,
///             pro rata, and are claimable once week w is over
///           • every week, veARCIRCLE holders vote on which pools ARCIRCLE PAD should back — the weights are recorded
///             here; what the platform does with them is its own
///         Nothing is owned: no admin, no fee, no way for anyone to move locked tokens or funded rewards. veARCIRCLE
///         can't be transferred. Times are rounded to Thursday 00:00 UTC weeks (like Curve's veCRV, which this follows).
contract ArcircleStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WEEK = 7 days;
    uint256 public constant MAXTIME = 365 days;
    uint256 public constant MAX_VOTE_POOLS = 8;
    uint256 public constant MAX_CLAIM_WEEKS = 52;

    IERC20 public immutable token; // $ARCIRCLE
    IERC20 public immutable reward; // USDC (Arc's ERC-20 face, 6 decimals)
    uint256 public immutable startWeek; // the first week rewards can be funded for

    struct Lock { uint128 amount; uint64 end; bool permanent; } // a max lock has end 0
    struct Point { int128 bias; int128 slope; uint64 ts; uint128 perm; } // perm: max-locked $ARCIRCLE (counts 1:1)

    mapping(address => Lock) public locked;
    uint256 public totalLocked;
    uint256 public permanentTotal; // $ARCIRCLE in max locks

    uint256 public epoch;
    mapping(uint256 => Point) public pointHistory; // global
    mapping(uint256 => int128) public slopeChanges; // week → slope that ends then
    mapping(address => Point[]) internal _userPoints;

    // ---- rewards ----
    mapping(uint256 => uint256) public tokensPerWeek;
    mapping(uint256 => uint256) internal _supplyCache; // week → veARCIRCLE supply when it began (+1, so 0 = not cached)
    mapping(address => uint256) public nextClaimWeek;
    uint256 public totalFunded;
    uint256 public totalClaimed;

    // ---- votes ----
    mapping(uint256 => mapping(bytes32 => uint256)) public poolVotes; // week → pool → veARCIRCLE behind it
    mapping(uint256 => uint256) public weekVotes; // week → veARCIRCLE voted in total
    mapping(uint256 => mapping(address => bytes32[])) internal _votedPools;
    mapping(uint256 => mapping(address => mapping(bytes32 => uint256))) public userPoolVote;

    event Locked(address indexed user, uint256 added, uint256 amount, uint256 end);
    event Withdrawn(address indexed user, uint256 amount);
    event MaxLock(address indexed user, bool on, uint256 end);
    event Funded(uint256 indexed week, address indexed from, uint256 amount);
    event Claimed(address indexed user, uint256 amount, uint256 untilWeek);
    event Voted(uint256 indexed week, address indexed user, bytes32 indexed pool, uint256 weight);

    error ZeroAmount();
    error NoLock();
    error LockExists();
    error LockExpired();
    error LockNotOver();
    error BadUnlock();
    error NotLonger();
    error NoStakers();
    error TooEarly();
    error BadVote();
    error MaxLocked();
    error NotMaxLocked();

    constructor(IERC20 _token, IERC20 _reward) {
        token = _token;
        reward = _reward;
        startWeek = (block.timestamp / WEEK) * WEEK;
        pointHistory[0] = Point(0, 0, uint64(block.timestamp), 0);
    }

    // ================================================================ locks
    /// @notice Lock `amount` $ARCIRCLE until `unlockTime` (rounded down to a week; at most a year from now).
    function createLock(uint256 amount, uint256 unlockTime) external nonReentrant {
        Lock memory old = locked[msg.sender];
        if (old.amount > 0) revert LockExists();
        uint256 end = (unlockTime / WEEK) * WEEK;
        if (end <= block.timestamp || end > block.timestamp + MAXTIME) revert BadUnlock();
        uint256 got = _pull(amount);
        _update(msg.sender, old, Lock(uint128(got), uint64(end), false), got);
    }

    /// @notice Lock `amount` $ARCIRCLE as a max lock: veARCIRCLE equals the amount and doesn't run down.
    function createMaxLock(uint256 amount) external nonReentrant {
        Lock memory old = locked[msg.sender];
        if (old.amount > 0) revert LockExists();
        uint256 got = _pull(amount);
        _update(msg.sender, old, Lock(uint128(got), 0, true), got);
        emit MaxLock(msg.sender, true, 0);
    }

    /// @notice Add `amount` $ARCIRCLE to a running lock (same unlock date, or still a max lock).
    function increaseAmount(uint256 amount) external nonReentrant {
        Lock memory old = locked[msg.sender];
        if (old.amount == 0) revert NoLock();
        if (!old.permanent && old.end <= block.timestamp) revert LockExpired();
        uint256 got = _pull(amount);
        _update(msg.sender, old, Lock(old.amount + uint128(got), old.end, old.permanent), got);
    }

    /// @notice Push a running lock's unlock date out to `unlockTime` (rounded down to a week; at most a year from now).
    function increaseUnlockTime(uint256 unlockTime) external nonReentrant {
        Lock memory old = locked[msg.sender];
        if (old.amount == 0) revert NoLock();
        if (old.permanent) revert MaxLocked();
        if (old.end <= block.timestamp) revert LockExpired();
        uint256 end = (unlockTime / WEEK) * WEEK;
        if (end <= old.end) revert NotLonger();
        if (end > block.timestamp + MAXTIME) revert BadUnlock();
        _update(msg.sender, old, Lock(old.amount, uint64(end), false), 0);
    }

    /// @notice Turn a running lock into a max lock: veARCIRCLE goes to the full amount and stays there.
    function lockMax() external nonReentrant {
        Lock memory old = locked[msg.sender];
        if (old.amount == 0) revert NoLock();
        if (old.permanent) revert MaxLocked();
        if (old.end <= block.timestamp) revert LockExpired();
        _update(msg.sender, old, Lock(old.amount, 0, true), 0);
        emit MaxLock(msg.sender, true, 0);
    }

    /// @notice Turn a max lock back into a normal lock that unlocks a year from now (rounded down to a week).
    function unlockMax() external nonReentrant {
        Lock memory old = locked[msg.sender];
        if (!old.permanent) revert NotMaxLocked();
        uint256 end = ((block.timestamp + MAXTIME) / WEEK) * WEEK;
        _update(msg.sender, old, Lock(old.amount, uint64(end), false), 0);
        emit MaxLock(msg.sender, false, end);
    }

    /// @notice Take the whole lock back once it has ended. Claim rewards first or after — they stay claimable.
    function withdraw() external nonReentrant {
        Lock memory old = locked[msg.sender];
        if (old.amount == 0) revert NoLock();
        if (old.permanent) revert MaxLocked();
        if (old.end > block.timestamp) revert LockNotOver();
        locked[msg.sender] = Lock(0, 0, false);
        totalLocked -= old.amount;
        _checkpoint(msg.sender, old, Lock(0, 0, false));
        token.safeTransfer(msg.sender, old.amount);
        emit Withdrawn(msg.sender, old.amount);
    }

    function _pull(uint256 amount) internal returns (uint256 got) {
        if (amount == 0) revert ZeroAmount();
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        got = token.balanceOf(address(this)) - before; // what actually arrived (a token with a transfer tax)
        if (got == 0) revert ZeroAmount();
    }

    function _update(address user, Lock memory old, Lock memory next, uint256 added) internal {
        if (nextClaimWeek[user] == 0) nextClaimWeek[user] = _weekCeil(block.timestamp); // nothing to claim before the first lock
        locked[user] = next;
        totalLocked += added;
        _checkpoint(user, old, next);
        emit Locked(user, added, next.amount, next.end);
    }

    // ================================================================ checkpoints (Curve's VotingEscrow, by timestamp)
    function _checkpoint(address user, Lock memory oldL, Lock memory newL) internal {
        Point memory uOld;
        Point memory uNew;
        int128 oldDslope;
        int128 newDslope;
        uint256 t = block.timestamp;
        if (user != address(0)) {
            if (oldL.end > t && oldL.amount > 0) {
                uOld.slope = int128(uint128(oldL.amount / MAXTIME));
                uOld.bias = uOld.slope * int128(uint128(oldL.end - t));
            }
            if (newL.end > t && newL.amount > 0) {
                uNew.slope = int128(uint128(newL.amount / MAXTIME));
                uNew.bias = uNew.slope * int128(uint128(newL.end - t));
            }
            oldDslope = slopeChanges[oldL.end];
            if (newL.end != 0) newDslope = newL.end == oldL.end ? oldDslope : slopeChanges[newL.end];
        }
        uint256 oldPerm = oldL.permanent ? oldL.amount : 0;
        uint256 newPerm = newL.permanent ? newL.amount : 0;
        Point memory last = pointHistory[epoch];
        uint256 lastTs = last.ts;
        uint256 ti = (lastTs / WEEK) * WEEK;
        uint256 e = epoch;
        for (uint256 i = 0; i < 255; i++) {
            ti += WEEK;
            int128 dSlope = 0;
            if (ti > t) ti = t;
            else dSlope = slopeChanges[ti];
            last.bias -= last.slope * int128(uint128(ti - lastTs));
            last.slope += dSlope;
            if (last.bias < 0) last.bias = 0;
            if (last.slope < 0) last.slope = 0;
            lastTs = ti;
            last.ts = uint64(ti);
            e += 1;
            if (ti == t) break;
            pointHistory[e] = last;
        }
        epoch = e;
        if (user != address(0)) {
            last.slope += uNew.slope - uOld.slope;
            last.bias += uNew.bias - uOld.bias;
            if (last.slope < 0) last.slope = 0;
            if (last.bias < 0) last.bias = 0;
            last.perm = uint128(uint256(last.perm) + newPerm - oldPerm);
            permanentTotal = last.perm;
        }
        pointHistory[e] = last;
        if (user != address(0)) {
            if (oldL.end > t) {
                oldDslope += uOld.slope;
                if (newL.end == oldL.end) oldDslope -= uNew.slope;
                slopeChanges[oldL.end] = oldDslope;
            }
            if (newL.end > t && newL.end > oldL.end) {
                newDslope -= uNew.slope;
                slopeChanges[newL.end] = newDslope;
            }
            uNew.ts = uint64(t);
            uNew.perm = uint128(newPerm);
            _userPoints[user].push(uNew);
        }
    }

    /// @notice Bring the global history up to date (anyone; the lock functions do it too).
    function checkpoint() external { _checkpoint(address(0), Lock(0, 0, false), Lock(0, 0, false)); }

    // ================================================================ voting power
    function balanceOf(address user) public view returns (uint256) { return balanceOfAt(user, block.timestamp); }
    function totalSupply() public view returns (uint256) { return totalSupplyAt(block.timestamp); }

    /// @notice A wallet's veARCIRCLE at time `t` (any time up to now).
    function balanceOfAt(address user, uint256 t) public view returns (uint256) {
        Point[] storage ps = _userPoints[user];
        uint256 n = ps.length;
        if (n == 0 || ps[0].ts > t) return 0;
        uint256 lo = 0;
        uint256 hi = n - 1;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (ps[mid].ts <= t) lo = mid;
            else hi = mid - 1;
        }
        Point memory p = ps[lo];
        if (p.perm > 0) return p.perm;
        int128 b = p.bias - p.slope * int128(uint128(t - p.ts));
        return b > 0 ? uint256(uint128(b)) : 0;
    }

    /// @notice All veARCIRCLE at time `t` (any time from the deployment on).
    function totalSupplyAt(uint256 t) public view returns (uint256) {
        if (t < pointHistory[0].ts) return 0;
        uint256 lo = 0;
        uint256 hi = epoch;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (pointHistory[mid].ts <= t) lo = mid;
            else hi = mid - 1;
        }
        Point memory last = pointHistory[lo];
        uint256 ti = (uint256(last.ts) / WEEK) * WEEK;
        for (uint256 i = 0; i < 255; i++) {
            ti += WEEK;
            int128 dSlope = 0;
            if (ti > t) ti = t;
            else dSlope = slopeChanges[ti];
            last.bias -= last.slope * int128(uint128(ti - uint256(last.ts)));
            if (ti == t) break;
            last.slope += dSlope;
            last.ts = uint64(ti);
        }
        return (last.bias > 0 ? uint256(uint128(last.bias)) : 0) + last.perm;
    }

    function userPointCount(address user) external view returns (uint256) { return _userPoints[user].length; }
    function userPoint(address user, uint256 i) external view returns (Point memory) { return _userPoints[user][i]; }

    // ================================================================ rewards
    function currentWeek() public view returns (uint256) { return (block.timestamp / WEEK) * WEEK; }
    function _weekCeil(uint256 t) internal pure returns (uint256) { return ((t + WEEK - 1) / WEEK) * WEEK; }

    /// @notice veARCIRCLE supply when week `w` began (cached the first time it's read by a transaction).
    function weekSupply(uint256 w) public view returns (uint256) {
        uint256 c = _supplyCache[w];
        return c > 0 ? c - 1 : totalSupplyAt(w);
    }
    function _weekSupply(uint256 w) internal returns (uint256 s) {
        uint256 c = _supplyCache[w];
        if (c > 0) return c - 1;
        s = totalSupplyAt(w);
        _supplyCache[w] = s + 1;
    }

    /// @notice Add `amount` USDC to this week's rewards — paid to whoever held veARCIRCLE when this week began.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 w = currentWeek();
        if (w < startWeek) revert TooEarly();
        _checkpoint(address(0), Lock(0, 0, false), Lock(0, 0, false));
        if (_weekSupply(w) == 0) revert NoStakers(); // nobody to pay this week: the USDC would be stuck
        uint256 before = reward.balanceOf(address(this));
        reward.safeTransferFrom(msg.sender, address(this), amount);
        uint256 got = reward.balanceOf(address(this)) - before;
        tokensPerWeek[w] += got;
        totalFunded += got;
        emit Funded(w, msg.sender, got);
    }

    /// @notice What `user` can claim now, and the week the claim would run up to (exclusive).
    function claimable(address user) public view returns (uint256 amount, uint256 untilWeek) {
        uint256 w = nextClaimWeek[user];
        if (w == 0) return (0, 0);
        if (w < startWeek) w = startWeek;
        uint256 cur = currentWeek();
        for (uint256 i = 0; i < MAX_CLAIM_WEEKS && w < cur; i++) {
            uint256 tpw = tokensPerWeek[w];
            if (tpw > 0) {
                uint256 s = weekSupply(w);
                if (s > 0) amount += (tpw * balanceOfAt(user, w)) / s;
            }
            w += WEEK;
        }
        untilWeek = w;
    }

    /// @notice Claim every finished week's USDC (up to MAX_CLAIM_WEEKS weeks per call).
    function claim() external nonReentrant returns (uint256 amount) {
        uint256 w = nextClaimWeek[msg.sender];
        if (w == 0) return 0;
        if (w < startWeek) w = startWeek;
        uint256 cur = currentWeek();
        _checkpoint(address(0), Lock(0, 0, false), Lock(0, 0, false));
        for (uint256 i = 0; i < MAX_CLAIM_WEEKS && w < cur; i++) {
            uint256 tpw = tokensPerWeek[w];
            if (tpw > 0) {
                uint256 s = _weekSupply(w);
                if (s > 0) amount += (tpw * balanceOfAt(msg.sender, w)) / s;
            }
            w += WEEK;
        }
        nextClaimWeek[msg.sender] = w;
        if (amount > 0) {
            totalClaimed += amount;
            reward.safeTransfer(msg.sender, amount);
        }
        emit Claimed(msg.sender, amount, w);
    }

    // ================================================================ pool votes
    /// @notice Split your veARCIRCLE across up to 8 Uniswap v4 pools (by pool id) for this week. `weights` are in
    ///         basis points and add up to at most 10,000; voting again this week replaces your earlier vote.
    function vote(bytes32[] calldata pools, uint256[] calldata weights) external {
        if (pools.length != weights.length || pools.length > MAX_VOTE_POOLS) revert BadVote();
        uint256 w = currentWeek();
        uint256 power = balanceOf(msg.sender);
        if (power == 0) revert NoLock();
        // take back this week's earlier vote
        bytes32[] storage prev = _votedPools[w][msg.sender];
        for (uint256 i = 0; i < prev.length; i++) {
            uint256 v = userPoolVote[w][msg.sender][prev[i]];
            poolVotes[w][prev[i]] -= v;
            weekVotes[w] -= v;
            userPoolVote[w][msg.sender][prev[i]] = 0;
        }
        delete _votedPools[w][msg.sender];
        uint256 sum = 0;
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i] == bytes32(0) || weights[i] == 0) revert BadVote();
            for (uint256 j = 0; j < i; j++) if (pools[j] == pools[i]) revert BadVote(); // the same pool twice
            sum += weights[i];
            uint256 v = (power * weights[i]) / 10_000;
            userPoolVote[w][msg.sender][pools[i]] = v;
            poolVotes[w][pools[i]] += v;
            weekVotes[w] += v;
            _votedPools[w][msg.sender].push(pools[i]);
            emit Voted(w, msg.sender, pools[i], v);
        }
        if (sum > 10_000) revert BadVote();
    }

    function votedPools(uint256 week, address user) external view returns (bytes32[] memory) { return _votedPools[week][user]; }
}
