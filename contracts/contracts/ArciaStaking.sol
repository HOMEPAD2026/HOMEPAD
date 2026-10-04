// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

/// @title veARCIA — $ARCIA staking on Robinhood Chain (ARCIRCLE PAD utility)
/// @notice Stake $ARCIA for 1 to 20 days and it becomes veARCIA: amount × a lock multiplier (1.0x for 1 day up to 2.0x
///         for 20 days). veARCIA can't be transferred; it's the weight for rewards and the voting power for the ARCIA
///         AI ecosystem and governance (with a timestamp history, ERC-5805 style: getPastVotes / getPastTotalSupply).
///           • rewards stream out of reward pools over 20 days: $ARCIA (stream 0) and up to 3 more tokens the owner may
///             add later. Each pool's rate is what's left in it ÷ 20 days, recalculated (with a fresh 20 days) whenever
///             it changes. Staked wallets share every second pro rata to their weight; while nobody is staked the
///             streams wait
///           • reward weight = veARCIA × a $ARCIRCLE holder boost: 1.2x from 1,000,000, 1.5x from 5,000,000 and 2.0x
///             from 10,000,000 $ARCIRCLE, checked off-chain (on Arc) and applied with a short-lived note signed by
///             `boostSigner`; anyone can submit a note, a newer one replaces an older one
///           • staking, claiming (any time) and withdrawing after the lock ends are free. Withdrawing before the end
///             costs time left ÷ the lock's full length of what's withdrawn, at most 50% — burned (sent to 0x…dEaD)
///           • one position per wallet: adding or picking a new length restarts the lock from now (never earlier
///             than it would end). Auto-renew keeps the lock (and its multiplier) running until it's turned off, then
///             the full length counts down. An ended lock counts 1.0x once touched (poke). Compound adds earned $ARCIA
///             to the position without moving tokens or touching the lock. stakeFor opens a position for a wallet
///             that has none (a gift or an airdrop, already locked)
///         The owner (the reward funder) can fund each pool and take back what hasn't streamed out yet, add a reward
///         token (up to 4 in all) and name the boost signer. It can never touch staked $ARCIA or rewards already earned.
contract ArciaStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Checkpoints for Checkpoints.Trace208;

    string public constant name = "veARCIA";
    string public constant symbol = "veARCIA";
    uint8 public constant decimals = 18;

    uint256 public constant DAY = 1 days;
    uint256 public constant MIN_DAYS = 1;
    uint256 public constant MAX_DAYS = 20;
    uint256 public constant STREAM = 20 days;
    uint256 public constant MAX_PENALTY_BPS = 5_000;
    uint256 public constant BOOST_MAX_TTL = 14 days;
    uint256 public constant MAX_REWARD_TOKENS = 4;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant ACC = 1e18;

    IERC20 public immutable arcia;

    address public owner;
    address public pendingOwner;
    address public boostSigner;

    struct Position {
        uint128 amount; // $ARCIA staked
        uint64 start; // when the current lock (or the current renewal) began
        uint64 end; // when it ends (0 while auto-renew is on)
        uint16 lockBps; // 10,000 … 20,000 while the lock runs; 10,000 once an ended lock has been touched
        uint16 lockDays; // the chosen length
        bool autoRenew;
        uint8 tier; // $ARCIRCLE boost tier 0…3
        uint64 boostUntil;
        uint64 boostIssued;
        uint256 ve; // veARCIA = amount × lockBps
        uint256 weight; // reward weight = ve × boost
    }

    struct Stream {
        IERC20 token;
        uint256 pool; // still to stream out
        uint256 rateX; // per second × 1e18
        uint256 finish;
        uint256 lastUpdate;
        uint256 acc; // per weight × 1e18
        uint256 streamed;
        uint256 claimed;
    }

    mapping(address => Position) public positions;
    Stream[] internal _streams; // 0 = $ARCIA
    mapping(address => mapping(uint256 => uint256)) public paidOf; // user → stream → acc settled
    mapping(address => mapping(uint256 => uint256)) public owedOf; // user → stream → settled, unclaimed
    uint256 public totalStaked;
    uint256 public totalSupply; // veARCIA
    uint256 public totalWeight;
    uint256 public totalBurned;
    uint256 public stakers; // wallets with $ARCIA staked

    mapping(address => Checkpoints.Trace208) internal _veCk;
    Checkpoints.Trace208 internal _totalCk;

    event Staked(address indexed user, address indexed from, uint256 added, uint256 amount, uint256 lockDays, uint256 end, uint256 ve);
    event Withdrawn(address indexed user, uint256 amount, uint256 penalty, uint256 received);
    event Compounded(address indexed user, uint256 amount);
    event AutoRenew(address indexed user, bool on, uint256 end);
    event Claimed(address indexed user, uint256 indexed stream, uint256 amount);
    event Boosted(address indexed user, uint8 tier, uint256 until);
    event PoolChanged(uint256 indexed stream, uint256 pool, uint256 perDay, uint256 finish);
    event RewardTokenAdded(uint256 indexed stream, address token);
    event BoostSigner(address signer);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Transfer(address indexed from, address indexed to, uint256 value); // veARCIA minted / burned (never moved)

    error NotOwner();
    error ZeroAmount();
    error BadDays();
    error ShorterLock();
    error NoStake();
    error HasStake();
    error TooMuch();
    error BadBoost();
    error StaleBoost();
    error BadToken();
    error BadStream();
    error FutureLookup();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IERC20 _arcia, address _owner, address _boostSigner) {
        if (address(_arcia) == address(0) || _owner == address(0)) revert ZeroAmount();
        arcia = _arcia;
        owner = _owner;
        boostSigner = _boostSigner;
        _streams.push(Stream(_arcia, 0, 0, block.timestamp, block.timestamp, 0, 0, 0));
        emit OwnershipTransferred(address(0), _owner);
        emit BoostSigner(_boostSigner);
        emit RewardTokenAdded(0, address(_arcia));
    }

    // ================================================================ multipliers
    function lockBpsFor(uint256 days_) public pure returns (uint256) {
        if (days_ < MIN_DAYS || days_ > MAX_DAYS) revert BadDays();
        return BPS + ((days_ - MIN_DAYS) * BPS) / (MAX_DAYS - MIN_DAYS);
    }

    function boostBps(uint8 tier) public pure returns (uint256) {
        if (tier == 1) return 12_000;
        if (tier == 2) return 15_000;
        if (tier == 3) return 20_000;
        return BPS;
    }

    // ================================================================ staking
    /// @notice Stake `amount` more $ARCIA (0 to only renew) for `days_` days from now. With auto-renew on, the length
    ///         can only stay or grow.
    function stake(uint256 amount, uint256 days_) external nonReentrant {
        _stake(msg.sender, msg.sender, amount, days_);
    }

    /// @notice Open a position for `user` (who has none) with `amount` of the caller's $ARCIA, locked `days_` days.
    function stakeFor(address user, uint256 amount, uint256 days_) external nonReentrant {
        if (user == address(0)) revert ZeroAmount();
        if (positions[user].amount > 0) revert HasStake();
        if (amount == 0) revert ZeroAmount();
        _stake(msg.sender, user, amount, days_);
    }

    function _stake(address from, address user, uint256 amount, uint256 days_) internal {
        uint256 lb = lockBpsFor(days_);
        _accrue();
        _settle(user);
        Position storage p = positions[user];
        uint256 end = block.timestamp + days_ * DAY;
        if (p.amount > 0) {
            if (p.autoRenew ? days_ < p.lockDays : p.end > end) revert ShorterLock();
        }
        uint256 got;
        if (amount > 0) {
            uint256 before = arcia.balanceOf(address(this));
            arcia.safeTransferFrom(from, address(this), amount);
            got = arcia.balanceOf(address(this)) - before;
            if (got == 0) revert ZeroAmount();
        }
        if (p.amount == 0) {
            if (got == 0) revert ZeroAmount();
            stakers += 1;
        }
        p.amount += uint128(got);
        totalStaked += got;
        p.lockDays = uint16(days_);
        p.lockBps = uint16(lb);
        p.start = uint64(block.timestamp);
        p.end = p.autoRenew ? 0 : uint64(end);
        _lapse(p);
        _reweigh(user, p);
        emit Staked(user, from, got, p.amount, days_, p.end, p.ve);
    }

    /// @notice Turn auto-renew on (the lock and its multiplier keep running) or off (the full length counts down from now).
    function setAutoRenew(bool on) external nonReentrant {
        Position storage p = positions[msg.sender];
        if (p.amount == 0) revert NoStake();
        _accrue();
        _settle(msg.sender);
        if (on && !p.autoRenew) {
            p.autoRenew = true;
            p.lockBps = uint16(lockBpsFor(p.lockDays)); // an ended lock gets its multiplier back
            p.start = uint64(block.timestamp);
            p.end = 0;
        } else if (!on && p.autoRenew) {
            p.autoRenew = false;
            p.start = uint64(block.timestamp);
            p.end = uint64(block.timestamp + uint256(p.lockDays) * DAY);
        }
        _lapse(p);
        _reweigh(msg.sender, p);
        emit AutoRenew(msg.sender, p.autoRenew, p.end);
    }

    /// @notice Add the $ARCIA you've earned to your position (same lock, no tokens move).
    function compound() external nonReentrant returns (uint256 amount) {
        Position storage p = positions[msg.sender];
        if (p.amount == 0) revert NoStake();
        _accrue();
        _settle(msg.sender);
        amount = owedOf[msg.sender][0];
        if (amount == 0) revert ZeroAmount();
        owedOf[msg.sender][0] = 0;
        _streams[0].claimed += amount;
        p.amount += uint128(amount);
        totalStaked += amount;
        _lapse(p);
        _reweigh(msg.sender, p);
        emit Compounded(msg.sender, amount);
    }

    /// @notice What withdrawing `amount` now costs: time left ÷ the lock's length, at most 50% (auto-renew: 50%).
    function penaltyOf(address user, uint256 amount) public view returns (uint256 penalty, uint256 bps) {
        Position storage p = positions[user];
        if (p.amount == 0) return (0, 0);
        if (p.autoRenew) bps = MAX_PENALTY_BPS;
        else {
            if (p.end <= block.timestamp || p.end <= p.start) return (0, 0);
            bps = ((uint256(p.end) - block.timestamp) * BPS) / (uint256(p.end) - p.start);
            if (bps > MAX_PENALTY_BPS) bps = MAX_PENALTY_BPS;
        }
        penalty = (amount * bps) / BPS;
    }

    /// @notice Take back `amount` $ARCIA (free once the lock has ended; before, the penalty is burned).
    function withdraw(uint256 amount) external nonReentrant {
        Position storage p = positions[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > p.amount) revert TooMuch();
        _accrue();
        _settle(msg.sender);
        (uint256 penalty,) = penaltyOf(msg.sender, amount);
        p.amount -= uint128(amount);
        totalStaked -= amount;
        if (p.amount == 0) {
            p.start = 0; p.end = 0; p.lockBps = 0; p.lockDays = 0; p.autoRenew = false;
            stakers -= 1;
        }
        _lapse(p);
        _reweigh(msg.sender, p);
        uint256 out = amount - penalty;
        if (penalty > 0) { totalBurned += penalty; arcia.safeTransfer(DEAD, penalty); }
        if (out > 0) arcia.safeTransfer(msg.sender, out);
        emit Withdrawn(msg.sender, amount, penalty, out);
    }

    /// @notice Claim everything earned, in every reward token.
    function claim() external nonReentrant returns (uint256 arciaAmount) {
        _accrue();
        _settle(msg.sender);
        Position storage p = positions[msg.sender];
        _lapse(p);
        _reweigh(msg.sender, p);
        uint256 n = _streams.length;
        for (uint256 i = 0; i < n; i++) {
            uint256 a = owedOf[msg.sender][i];
            if (a == 0) continue;
            owedOf[msg.sender][i] = 0;
            _streams[i].claimed += a;
            if (i == 0) arciaAmount = a;
            _streams[i].token.safeTransfer(msg.sender, a);
            emit Claimed(msg.sender, i, a);
        }
    }

    /// @notice Bring wallets up to date: an ended lock drops to 1.0x and a lapsed boost to none (anyone can call it).
    function poke(address[] calldata users) external {
        _accrue();
        for (uint256 i = 0; i < users.length; i++) {
            Position storage p = positions[users[i]];
            _settle(users[i]);
            _lapse(p);
            _reweigh(users[i], p);
        }
    }

    // ================================================================ the $ARCIRCLE boost
    function boostHash(address user, uint8 tier, uint64 issued, uint64 until) public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("veARCIA boost"), block.chainid, address(this), user, tier, issued, until));
    }

    function applyBoost(address user, uint8 tier, uint64 issued, uint64 until, bytes calldata sig) external {
        if (tier > 3 || until <= block.timestamp || until > issued + BOOST_MAX_TTL || issued > block.timestamp + 300) revert BadBoost();
        if (boostSigner == address(0)) revert BadBoost();
        address s = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(boostHash(user, tier, issued, until)), sig);
        if (s != boostSigner) revert BadBoost();
        Position storage p = positions[user];
        if (issued <= p.boostIssued) revert StaleBoost();
        _accrue();
        _settle(user);
        p.tier = tier;
        p.boostUntil = until;
        p.boostIssued = issued;
        _lapse(p);
        _reweigh(user, p);
        emit Boosted(user, tier, until);
    }

    // ================================================================ reward pools (owner)
    function fund(uint256 amount) external { fundStream(0, amount); }
    function defund(uint256 amount) external { defundStream(0, amount); }

    /// @notice Add `amount` of stream `i`'s token to its pool; its rate becomes the pool ÷ 20 days.
    function fundStream(uint256 i, uint256 amount) public onlyOwner nonReentrant {
        if (i >= _streams.length) revert BadStream();
        if (amount == 0) revert ZeroAmount();
        _accrue();
        Stream storage s = _streams[i];
        uint256 before = s.token.balanceOf(address(this));
        s.token.safeTransferFrom(msg.sender, address(this), amount);
        s.pool += s.token.balanceOf(address(this)) - before;
        _restart(i);
    }

    /// @notice Take back `amount` of stream `i`'s pool that hasn't streamed out; its rate becomes what's left ÷ 20 days.
    function defundStream(uint256 i, uint256 amount) public onlyOwner nonReentrant {
        if (i >= _streams.length) revert BadStream();
        if (amount == 0) revert ZeroAmount();
        _accrue();
        Stream storage s = _streams[i];
        if (amount > s.pool) revert TooMuch();
        s.pool -= amount;
        _restart(i);
        s.token.safeTransfer(msg.sender, amount);
    }

    /// @notice Add another reward token (up to 4 streams in all). It streams the same way, by the same weights.
    function addRewardToken(IERC20 token) external onlyOwner {
        if (address(token) == address(0) || address(token) == address(arcia) || _streams.length >= MAX_REWARD_TOKENS) revert BadToken();
        for (uint256 j = 0; j < _streams.length; j++) if (_streams[j].token == token) revert BadToken();
        _accrue();
        _streams.push(Stream(token, 0, 0, block.timestamp, block.timestamp, 0, 0, 0)); // everyone starts it from now
        emit RewardTokenAdded(_streams.length - 1, address(token));
    }

    function setBoostSigner(address s) external onlyOwner { boostSigner = s; emit BoostSigner(s); }
    function transferOwnership(address to) external onlyOwner { pendingOwner = to; emit OwnershipTransferStarted(owner, to); }
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ================================================================ votes (ERC-5805 style, timestamp clock)
    function clock() public view returns (uint48) { return uint48(block.timestamp); }
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure returns (string memory) { return "mode=timestamp"; }
    function balanceOf(address user) external view returns (uint256) { return positions[user].ve; }
    function getVotes(address user) external view returns (uint256) { return positions[user].ve; }
    function getPastVotes(address user, uint256 t) external view returns (uint256) {
        if (t >= block.timestamp) revert FutureLookup();
        return _veCk[user].upperLookupRecent(uint48(t));
    }
    function getPastTotalSupply(uint256 t) external view returns (uint256) {
        if (t >= block.timestamp) revert FutureLookup();
        return _totalCk.upperLookupRecent(uint48(t));
    }
    function delegates(address user) external pure returns (address) { return user; } // veARCIA votes for itself

    // ================================================================ views
    function streamCount() external view returns (uint256) { return _streams.length; }

    /// @notice Stream `i` now: token, what's left, per day, when it ends, streamed and claimed so far.
    function streamInfo(uint256 i) public view returns (address token, uint256 left_, uint256 perDay_, uint256 finish_, uint256 streamed_, uint256 claimed_) {
        Stream storage s = _streams[i];
        (, uint256 left) = _accView(s);
        uint256 f = s.finish;
        if (totalWeight == 0 && s.lastUpdate < f && block.timestamp > s.lastUpdate) f += block.timestamp - s.lastUpdate;
        return (address(s.token), left, (s.rateX * DAY) / ACC, f, s.streamed + (s.pool - left), s.claimed);
    }

    function perDay() external view returns (uint256) { return (_streams[0].rateX * DAY) / ACC; }
    function pool() external view returns (uint256) { (, uint256 left) = _accView(_streams[0]); return left; }

    function earned(address user) public view returns (uint256) { return _earned(user, 0); }
    function earnedAll(address user) external view returns (uint256[] memory out) {
        out = new uint256[](_streams.length);
        for (uint256 i = 0; i < out.length; i++) out[i] = _earned(user, i);
    }
    function _earned(address user, uint256 i) internal view returns (uint256) {
        (uint256 acc,) = _accView(_streams[i]);
        return owedOf[user][i] + (positions[user].weight * (acc - paidOf[user][i])) / ACC;
    }

    /// @notice $ARCIA stream and totals in one call.
    function stats() external view returns (uint256 pool_, uint256 perDay_, uint256 finish_, uint256 staked_, uint256 ve_, uint256 weight_, uint256 streamed_, uint256 claimed_, uint256 burned_) {
        (, uint256 left, uint256 pd, uint256 f, uint256 st, uint256 cl) = streamInfo(0);
        return (left, pd, f, totalStaked, totalSupply, totalWeight, st, cl, totalBurned);
    }

    // ================================================================ internals
    function _accView(Stream storage s) internal view returns (uint256 acc, uint256 left) {
        acc = s.acc;
        left = s.pool;
        uint256 t = block.timestamp;
        if (t <= s.lastUpdate || s.lastUpdate >= s.finish || totalWeight == 0) return (acc, left);
        uint256 to = t < s.finish ? t : s.finish;
        uint256 amt = to == s.finish ? left : (s.rateX * (to - s.lastUpdate)) / ACC;
        if (amt > left) amt = left;
        acc += (amt * ACC) / totalWeight;
        left -= amt;
    }

    function _accrue() internal {
        uint256 n = _streams.length;
        uint256 tw = totalWeight;
        uint256 t = block.timestamp;
        for (uint256 i = 0; i < n; i++) {
            Stream storage s = _streams[i];
            if (t <= s.lastUpdate) continue;
            if (s.lastUpdate < s.finish) {
                if (tw == 0) {
                    s.finish += t - s.lastUpdate; // nobody to pay: the stream waits
                } else {
                    uint256 to = t < s.finish ? t : s.finish;
                    uint256 amt = to == s.finish ? s.pool : (s.rateX * (to - s.lastUpdate)) / ACC;
                    if (amt > s.pool) amt = s.pool;
                    if (amt > 0) {
                        s.pool -= amt;
                        s.streamed += amt;
                        s.acc += (amt * ACC) / tw;
                    }
                }
            }
            s.lastUpdate = t;
        }
    }

    function _restart(uint256 i) internal {
        Stream storage s = _streams[i];
        s.rateX = (s.pool * ACC) / STREAM;
        s.finish = s.pool > 0 ? block.timestamp + STREAM : block.timestamp;
        emit PoolChanged(i, s.pool, (s.rateX * DAY) / ACC, s.finish);
    }

    function _settle(address user) internal {
        uint256 w = positions[user].weight;
        uint256 n = _streams.length;
        for (uint256 i = 0; i < n; i++) {
            uint256 a = _streams[i].acc;
            uint256 pd = paidOf[user][i];
            if (w > 0 && a > pd) owedOf[user][i] += (w * (a - pd)) / ACC;
            paidOf[user][i] = a;
        }
    }

    function _lapse(Position storage p) internal {
        if (p.tier != 0 && p.boostUntil <= block.timestamp) p.tier = 0;
        if (p.amount > 0 && !p.autoRenew && p.end <= block.timestamp && p.lockBps > BPS) p.lockBps = uint16(BPS);
    }

    function _reweigh(address user, Position storage p) internal {
        uint256 ve = (uint256(p.amount) * p.lockBps) / BPS;
        uint256 w = (ve * boostBps(p.tier)) / BPS;
        uint256 oldVe = p.ve;
        if (ve != oldVe) {
            totalSupply = totalSupply + ve - oldVe;
            if (ve > oldVe) emit Transfer(address(0), user, ve - oldVe);
            else emit Transfer(user, address(0), oldVe - ve);
            p.ve = ve;
            _veCk[user].push(clock(), uint208(ve));
            _totalCk.push(clock(), uint208(totalSupply));
        }
        totalWeight = totalWeight + w - p.weight;
        p.weight = w;
    }
}
