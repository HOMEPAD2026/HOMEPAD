// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title veARCIA — $ARCIA staking on Robinhood Chain (ARCIRCLE PAD utility)
/// @notice Stake $ARCIA for 1 to 20 days and it becomes veARCIA: amount × a lock multiplier (1.0x for 1 day up to 2.0x
///         for 20 days). veARCIA can't be transferred; it's the weight for rewards and, later, the way to take part in
///         the ARCIA AI ecosystem and governance.
///           • rewards are $ARCIA from a reward pool that streams out over 20 days: today's rate is what's left in the
///             pool ÷ 20 days, and it's recalculated (with a fresh 20 days) whenever the pool changes. Staked wallets
///             share each second's stream pro rata to their weight; while nobody is staked the stream waits
///           • reward weight = veARCIA × a $ARCIRCLE holder boost: 1.2x from 1,000,000, 1.5x from 5,000,000 and 2.0x
///             from 10,000,000 $ARCIRCLE. The holding is checked off-chain (on Arc, where $ARCIRCLE lives) and arrives as
///             a short-lived signed note from `boostSigner`; a lower or expired boost can be applied by anyone
///           • staking is free, claiming is free and possible at any time, withdrawing after the lock ends is free.
///             Withdrawing before it ends costs a share of what's withdrawn: time left ÷ the lock's full length, at
///             most 50%. That share is burned (sent to 0x…dEaD)
///           • one position per wallet: adding to it or picking a new length restarts the lock from now (it can't end
///             earlier than it already would); a lock that has ended counts at 1.0x until it's renewed
///         The owner (the reward funder) can add $ARCIA to the reward pool and take back what hasn't streamed out yet,
///         and can name the boost signer. It can never touch staked $ARCIA or rewards already earned.
contract ArciaStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant name = "veARCIA";
    string public constant symbol = "veARCIA";
    uint8 public constant decimals = 18;

    uint256 public constant DAY = 1 days;
    uint256 public constant MIN_DAYS = 1;
    uint256 public constant MAX_DAYS = 20;
    uint256 public constant STREAM = 20 days; // the reward pool streams out over this long
    uint256 public constant MAX_PENALTY_BPS = 5_000; // an early withdrawal costs at most 50%
    uint256 public constant BOOST_MAX_TTL = 14 days; // a boost note lasts at most this long
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant ACC = 1e18;

    IERC20 public immutable arcia;

    address public owner;
    address public pendingOwner;
    address public boostSigner;

    struct Position {
        uint128 amount; // $ARCIA staked
        uint64 start; // when the current lock began
        uint64 end; // when it ends
        uint16 lockBps; // 10,000 (1.0x) … 20,000 (2.0x) while the lock runs; 10,000 once it has ended and been touched
        uint8 tier; // $ARCIRCLE boost tier 0…3
        uint64 boostUntil; // the boost lapses then
        uint64 boostIssued; // the note's issue time (a newer note replaces an older one)
        uint256 ve; // veARCIA = amount × lockBps
        uint256 weight; // reward weight = ve × boost
        uint256 paid; // accPerWeight already settled
        uint256 owed; // rewards settled but not claimed
    }

    mapping(address => Position) public positions;
    uint256 public totalStaked; // $ARCIA staked
    uint256 public totalSupply; // veARCIA
    uint256 public totalWeight;

    // ---- the reward stream ----
    uint256 public pool; // $ARCIA still to stream out
    uint256 public rateX; // per second, × 1e18
    uint256 public finish; // the stream runs until then (if nothing changes)
    uint256 public lastUpdate;
    uint256 public accPerWeight; // × 1e18
    uint256 public totalStreamed;
    uint256 public totalClaimed;
    uint256 public totalBurned;

    event Staked(address indexed user, uint256 added, uint256 amount, uint256 lockDays, uint256 end, uint256 ve);
    event Withdrawn(address indexed user, uint256 amount, uint256 penalty, uint256 received);
    event Claimed(address indexed user, uint256 amount);
    event Boosted(address indexed user, uint8 tier, uint256 until);
    event PoolChanged(uint256 pool, uint256 perDay, uint256 finish);
    event BoostSigner(address signer);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Transfer(address indexed from, address indexed to, uint256 value); // veARCIA minted / burned (never moved)

    error NotOwner();
    error ZeroAmount();
    error BadDays();
    error ShorterLock();
    error NoStake();
    error TooMuch();
    error BadBoost();
    error StaleBoost();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IERC20 _arcia, address _owner, address _boostSigner) {
        if (address(_arcia) == address(0) || _owner == address(0)) revert ZeroAmount();
        arcia = _arcia;
        owner = _owner;
        boostSigner = _boostSigner;
        lastUpdate = block.timestamp;
        finish = block.timestamp;
        emit OwnershipTransferred(address(0), _owner);
        emit BoostSigner(_boostSigner);
    }

    // ================================================================ multipliers
    /// @notice The lock multiplier for a lock of `days_` days, in basis points (1 day 10,000 … 20 days 20,000).
    function lockBpsFor(uint256 days_) public pure returns (uint256) {
        if (days_ < MIN_DAYS || days_ > MAX_DAYS) revert BadDays();
        return BPS + ((days_ - MIN_DAYS) * BPS) / (MAX_DAYS - MIN_DAYS);
    }

    /// @notice The $ARCIRCLE boost for tier 0…3, in basis points: 1.0x, 1.2x, 1.5x, 2.0x.
    function boostBps(uint8 tier) public pure returns (uint256) {
        if (tier == 1) return 12_000;
        if (tier == 2) return 15_000;
        if (tier == 3) return 20_000;
        return BPS;
    }

    // ================================================================ staking
    /// @notice Stake `amount` more $ARCIA (0 to only renew) and lock the whole position for `days_` days from now.
    ///         The new end can't be earlier than the current one.
    function stake(uint256 amount, uint256 days_) external nonReentrant {
        uint256 lb = lockBpsFor(days_);
        _accrue();
        Position storage p = positions[msg.sender];
        _settle(p);
        uint256 end = block.timestamp + days_ * DAY;
        if (p.end > end) revert ShorterLock();
        uint256 got;
        if (amount > 0) {
            uint256 before = arcia.balanceOf(address(this));
            arcia.safeTransferFrom(msg.sender, address(this), amount);
            got = arcia.balanceOf(address(this)) - before; // what actually arrived
            if (got == 0) revert ZeroAmount();
        }
        if (p.amount == 0 && got == 0) revert ZeroAmount();
        p.amount += uint128(got);
        totalStaked += got;
        p.start = uint64(block.timestamp);
        p.end = uint64(end);
        p.lockBps = uint16(lb);
        _lapseBoost(p);
        _reweigh(msg.sender, p);
        emit Staked(msg.sender, got, p.amount, days_, end, p.ve);
    }

    /// @notice What withdrawing `amount` now would cost: the penalty and its rate in basis points
    ///         (time left ÷ the lock's full length, at most 50%; nothing once the lock has ended).
    function penaltyOf(address user, uint256 amount) public view returns (uint256 penalty, uint256 bps) {
        Position storage p = positions[user];
        if (p.end <= block.timestamp || p.end <= p.start) return (0, 0);
        bps = ((uint256(p.end) - block.timestamp) * BPS) / (uint256(p.end) - p.start);
        if (bps > MAX_PENALTY_BPS) bps = MAX_PENALTY_BPS;
        penalty = (amount * bps) / BPS;
    }

    /// @notice Take back `amount` $ARCIA. Free once the lock has ended; before that, the penalty above is burned.
    ///         Unclaimed rewards stay claimable.
    function withdraw(uint256 amount) external nonReentrant {
        Position storage p = positions[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > p.amount) revert TooMuch();
        _accrue();
        _settle(p);
        (uint256 penalty,) = penaltyOf(msg.sender, amount);
        p.amount -= uint128(amount);
        totalStaked -= amount;
        if (p.amount == 0) { p.start = 0; p.end = 0; p.lockBps = 0; }
        _lapseBoost(p);
        _reweigh(msg.sender, p);
        uint256 out = amount - penalty;
        if (penalty > 0) { totalBurned += penalty; arcia.safeTransfer(DEAD, penalty); }
        if (out > 0) arcia.safeTransfer(msg.sender, out);
        emit Withdrawn(msg.sender, amount, penalty, out);
    }

    /// @notice Claim every $ARCIA reward earned so far.
    function claim() external nonReentrant returns (uint256 amount) {
        _accrue();
        Position storage p = positions[msg.sender];
        _settle(p);
        _lapseBoost(p);
        _reweigh(msg.sender, p);
        amount = p.owed;
        if (amount == 0) return 0;
        p.owed = 0;
        totalClaimed += amount;
        arcia.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Bring wallets up to date: an ended lock drops to 1.0x and a lapsed boost to none (anyone can call it).
    function poke(address[] calldata users) external {
        _accrue();
        for (uint256 i = 0; i < users.length; i++) {
            Position storage p = positions[users[i]];
            _settle(p);
            _lapseBoost(p);
            _reweigh(users[i], p);
        }
    }

    // ================================================================ the $ARCIRCLE boost
    /// @notice The message `boostSigner` signs (EIP-191 personal_sign over this hash).
    function boostHash(address user, uint8 tier, uint64 issued, uint64 until) public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("veARCIA boost"), block.chainid, address(this), user, tier, issued, until));
    }

    /// @notice Apply a signed $ARCIRCLE boost note for `user` (anyone may submit it; a newer note replaces an older one).
    function applyBoost(address user, uint8 tier, uint64 issued, uint64 until, bytes calldata sig) external {
        if (tier > 3 || until <= block.timestamp || until > issued + BOOST_MAX_TTL || issued > block.timestamp + 300) revert BadBoost();
        if (boostSigner == address(0)) revert BadBoost();
        address s = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(boostHash(user, tier, issued, until)), sig);
        if (s != boostSigner) revert BadBoost();
        Position storage p = positions[user];
        if (issued <= p.boostIssued) revert StaleBoost();
        _accrue();
        _settle(p);
        p.tier = tier;
        p.boostUntil = until;
        p.boostIssued = issued;
        _lapseBoost(p);
        _reweigh(user, p);
        emit Boosted(user, tier, until);
    }

    // ================================================================ the reward pool (owner)
    /// @notice Add `amount` $ARCIA to the reward pool; the rate becomes the pool ÷ 20 days.
    function fund(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue();
        uint256 before = arcia.balanceOf(address(this));
        arcia.safeTransferFrom(msg.sender, address(this), amount);
        uint256 got = arcia.balanceOf(address(this)) - before;
        pool += got;
        _restart();
    }

    /// @notice Take back `amount` $ARCIA that hasn't streamed out yet; the rate becomes what's left ÷ 20 days.
    function defund(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue();
        if (amount > pool) revert TooMuch();
        pool -= amount;
        _restart();
        arcia.safeTransfer(msg.sender, amount);
    }

    function setBoostSigner(address s) external onlyOwner {
        boostSigner = s;
        emit BoostSigner(s);
    }

    function transferOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ================================================================ views
    function balanceOf(address user) external view returns (uint256) { return positions[user].ve; }

    /// @notice $ARCIA streamed per day at today's rate.
    function perDay() public view returns (uint256) { return (rateX * DAY) / ACC; }

    /// @notice What `user` could claim now.
    function earned(address user) public view returns (uint256) {
        Position storage p = positions[user];
        (uint256 acc,) = _accView();
        return p.owed + (p.weight * (acc - p.paid)) / ACC;
    }

    /// @notice Everything the page needs in one call.
    function stats() external view returns (uint256 pool_, uint256 perDay_, uint256 finish_, uint256 staked_, uint256 ve_, uint256 weight_, uint256 streamed_, uint256 claimed_, uint256 burned_) {
        (, uint256 left) = _accView();
        uint256 f = finish;
        if (totalWeight == 0 && lastUpdate < f && block.timestamp > lastUpdate) f += block.timestamp - lastUpdate; // waiting
        return (left, perDay(), f, totalStaked, totalSupply, totalWeight, totalStreamed + (pool - left), totalClaimed, totalBurned);
    }

    // ================================================================ internals
    function _accView() internal view returns (uint256 acc, uint256 left) {
        acc = accPerWeight;
        left = pool;
        uint256 t = block.timestamp;
        if (t <= lastUpdate || lastUpdate >= finish || totalWeight == 0) return (acc, left);
        uint256 to = t < finish ? t : finish;
        uint256 amt = to == finish ? left : (rateX * (to - lastUpdate)) / ACC;
        if (amt > left) amt = left;
        acc += (amt * ACC) / totalWeight;
        left -= amt;
    }

    function _accrue() internal {
        uint256 t = block.timestamp;
        if (t <= lastUpdate) return;
        if (lastUpdate < finish) {
            if (totalWeight == 0) {
                finish += t - lastUpdate; // nobody to pay: the stream waits
            } else {
                uint256 to = t < finish ? t : finish;
                uint256 amt = to == finish ? pool : (rateX * (to - lastUpdate)) / ACC;
                if (amt > pool) amt = pool;
                if (amt > 0) {
                    pool -= amt;
                    totalStreamed += amt;
                    accPerWeight += (amt * ACC) / totalWeight;
                }
            }
        }
        lastUpdate = t;
    }

    function _restart() internal {
        rateX = (pool * ACC) / STREAM;
        finish = pool > 0 ? block.timestamp + STREAM : block.timestamp;
        emit PoolChanged(pool, perDay(), finish);
    }

    function _settle(Position storage p) internal {
        uint256 a = accPerWeight;
        if (p.weight > 0) p.owed += (p.weight * (a - p.paid)) / ACC;
        p.paid = a;
    }

    function _lapseBoost(Position storage p) internal {
        if (p.tier != 0 && p.boostUntil <= block.timestamp) p.tier = 0;
        if (p.amount > 0 && p.end <= block.timestamp && p.lockBps > BPS) p.lockBps = uint16(BPS); // the lock has ended
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
        }
        totalWeight = totalWeight + w - p.weight;
        p.weight = w;
    }
}
