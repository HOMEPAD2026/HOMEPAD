// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/// @title ARCIRCLE Predict — UP / DOWN rounds on Arc tokens, paid in USDC (ARCIRCLE PAD utility)
/// @notice Each market follows one Arc token's Uniswap v4 USDC pool and runs back-to-back rounds (5 minutes,
///         15 minutes, an hour…). In a round people put native USDC on UP or DOWN; the round compares the token's
///         price at its start (the "price to beat") with its price at the end, and the winning side splits the
///         whole pot pro rata, after a protocol fee (2% by default, never more than 3%).
///           • bets close `lockSecs` (30s) before the end; one side per wallet per round; per-wallet and
///             per-side caps keep rounds small (a thin pool can be pushed — small pots make that not worth it)
///           • the price is read from the pool itself (slot0), never from a server: after a round ends the
///             keeper (the operator) samples the pool several times, in different blocks, and the round closes
///             on the MEDIAN — one block's push doesn't decide it. The same median opens the next round
///           • a refund, with no fee, when one side is empty, when the price didn't move, or when the round
///             wasn't settled within GRACE (15 minutes) after its end — then anyone can claim their stake back
///           • winnings and refunds stay claimable forever; nobody can sweep them. The owner can change the
///             fee (≤ 3%, applies to rounds that start later), the caps, and pause new bets — never the money
///             already in a round
contract ArcPredict {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    address public immutable usdc; // Arc's USDC, ERC-20 face; a pool paired with it or with native (address 0) counts

    uint256 public constant MAX_FEE_BPS = 300;
    uint256 public constant MAX_SAMPLES = 5;
    uint256 public constant GRACE = 15 minutes;
    uint256 public constant MIN_DURATION = 60;
    uint256 public constant MAX_DURATION = 1 days;
    uint256 public constant STALE = 5 minutes; // a sample older than this is dropped

    enum Result { Open, Up, Down, Refund }

    struct Market {
        PoolKey key;
        address token;
        bool tokenIs0;
        bool active;
        uint32 duration;
        uint64 cur; // the round now running (0 = none)
        uint8 n; // samples taken for the current boundary
        uint64 lastSampleAt;
        uint160[5] samples;
    }
    struct Round {
        uint32 market;
        uint16 feeBps;
        Result result;
        uint64 startAt;
        uint64 lockAt;
        uint64 endAt;
        uint160 openPrice; // sqrtPriceX96 of the pool
        uint160 closePrice;
        uint128 up;
        uint128 down;
    }
    struct Bet { uint128 up; uint128 down; bool claimed; }

    address public owner;
    address public operator;
    address public feeTo;
    bool public paused;
    uint256 public feeBps = 200;
    uint256 public minBet = 0.5e18; // native USDC has 18 decimals
    uint256 public maxBet = 5e18; // per wallet per round
    uint256 public maxSide = 500e18; // per side per round
    uint256 public lockSecs = 30;
    uint256 public minSamples = 3;
    uint256 public sampleGap = 2; // seconds between two samples
    uint256 public feesOwed;
    uint256 public feesPaid;
    uint256 public volume; // all bets, ever

    Market[] internal _markets;
    Round[] internal _rounds; // _rounds[0] is a placeholder: round ids start at 1
    mapping(uint256 => uint64[]) internal _roundIds; // market → its rounds, oldest first
    mapping(uint256 => mapping(address => Bet)) public bets;
    uint256 private _lock = 1;

    event MarketAdded(uint256 indexed market, address indexed token, bytes32 poolId, uint32 duration);
    event MarketActive(uint256 indexed market, bool active);
    event RoundStarted(uint256 indexed round, uint256 indexed market, uint64 startAt, uint64 lockAt, uint64 endAt, uint160 openPrice);
    event BetPlaced(uint256 indexed round, address indexed user, bool up, uint256 amount);
    event Sampled(uint256 indexed market, uint160 price, uint8 n);
    event RoundSettled(uint256 indexed round, Result result, uint160 closePrice, uint256 up, uint256 down, uint256 fee);
    event Claimed(uint256 indexed round, address indexed user, uint256 amount);
    event FeesPaid(address indexed to, uint256 amount);
    event Limits(uint256 minBet, uint256 maxBet, uint256 maxSide, uint256 lockSecs, uint256 minSamples, uint256 sampleGap);
    event Fee(uint256 feeBps, address feeTo);
    event Paused(bool paused);
    event OwnerSet(address indexed owner);
    event OperatorSet(address indexed operator);

    error NotOwner();
    error NotAllowed();
    error IsPaused();
    error BadMarket();
    error NotUsdcPool();
    error PoolNotLive();
    error BadLimits();
    error NotOpen();
    error TooSmall();
    error OverMaxBet();
    error OverMaxSide();
    error OtherSide();
    error NothingToClaim();
    error TransferFailed();
    error Reentrant();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyStaff() { if (msg.sender != owner && msg.sender != operator) revert NotAllowed(); _; }
    modifier nonReentrant() { if (_lock != 1) revert Reentrant(); _lock = 2; _; _lock = 1; }

    constructor(IPoolManager _pm, address _usdc, address _owner, address _operator, address _feeTo) {
        if (address(_pm) == address(0) || _owner == address(0) || _operator == address(0) || _feeTo == address(0)) revert BadLimits();
        poolManager = _pm;
        usdc = _usdc;
        owner = _owner;
        operator = _operator;
        feeTo = _feeTo;
        _rounds.push();
    }

    // ---------------------------------------------------------------- views

    function marketCount() external view returns (uint256) { return _markets.length; }
    function roundCount() external view returns (uint256) { return _rounds.length - 1; }

    function market(uint256 id) external view returns (
        address token, bool tokenIs0, bool active, uint32 duration, uint64 cur, uint8 n, uint64 lastSampleAt, bytes32 poolId, uint256 rounds
    ) {
        Market storage m = _m(id);
        return (m.token, m.tokenIs0, m.active, m.duration, m.cur, m.n, m.lastSampleAt, PoolId.unwrap(m.key.toId()), _roundIds[id].length);
    }
    function marketKey(uint256 id) external view returns (PoolKey memory) { return _m(id).key; }
    function samplesOf(uint256 id) external view returns (uint160[] memory out) {
        Market storage m = _m(id);
        out = new uint160[](m.n);
        for (uint256 i; i < m.n; i++) out[i] = m.samples[i];
    }
    function round(uint256 id) external view returns (Round memory) { if (id == 0 || id >= _rounds.length) revert BadMarket(); return _rounds[id]; }
    /// the market's rounds, newest first: `n` of them, skipping the newest `skip`
    function roundsOf(uint256 id, uint256 skip, uint256 n) external view returns (uint64[] memory out) {
        uint64[] storage a = _roundIds[id];
        if (skip >= a.length) return new uint64[](0);
        uint256 k = a.length - skip < n ? a.length - skip : n;
        out = new uint64[](k);
        for (uint256 i; i < k; i++) out[i] = a[a.length - 1 - skip - i];
    }
    /// the pool's price now (sqrtPriceX96)
    function priceOf(uint256 id) public view returns (uint160 p) { (p,,,) = poolManager.getSlot0(_m(id).key.toId()); }

    /// what `user` can claim from `id` now (0 if nothing, not settled yet, or already claimed)
    function claimable(uint256 id, address user) public view returns (uint256) {
        if (id == 0 || id >= _rounds.length) return 0;
        Bet storage b = bets[id][user];
        if (b.claimed) return 0;
        Round storage r = _rounds[id];
        uint256 stake = uint256(b.up) + b.down;
        if (stake == 0) return 0;
        Result res = r.result;
        if (res == Result.Open) return block.timestamp > uint256(r.endAt) + GRACE ? stake : 0;
        if (res == Result.Refund) return stake;
        uint256 mine = res == Result.Up ? b.up : b.down;
        if (mine == 0) return 0;
        uint256 pot = uint256(r.up) + r.down;
        uint256 win = res == Result.Up ? r.up : r.down;
        return (mine * (pot - (pot * r.feeBps) / 10_000)) / win;
    }

    // ---------------------------------------------------------------- bets and claims

    function bet(uint256 id, bool up) external payable {
        if (paused) revert IsPaused();
        if (id == 0 || id >= _rounds.length) revert NotOpen();
        Round storage r = _rounds[id];
        if (r.result != Result.Open || block.timestamp < r.startAt || block.timestamp >= r.lockAt) revert NotOpen();
        if (msg.value < minBet) revert TooSmall();
        Bet storage b = bets[id][msg.sender];
        if (up ? b.down > 0 : b.up > 0) revert OtherSide();
        uint256 mine = uint256(up ? b.up : b.down) + msg.value;
        if (mine > maxBet) revert OverMaxBet();
        uint256 side = uint256(up ? r.up : r.down) + msg.value;
        if (side > maxSide) revert OverMaxSide();
        if (up) { b.up = uint128(mine); r.up = uint128(side); }
        else { b.down = uint128(mine); r.down = uint128(side); }
        volume += msg.value;
        emit BetPlaced(id, msg.sender, up, msg.value);
    }

    /// claim winnings and refunds from several rounds at once; rounds with nothing to claim are skipped
    function claim(uint256[] calldata ids) external nonReentrant returns (uint256 total) {
        for (uint256 i; i < ids.length; i++) {
            uint256 a = claimable(ids[i], msg.sender);
            if (a == 0) continue;
            bets[ids[i]][msg.sender].claimed = true;
            total += a;
            emit Claimed(ids[i], msg.sender, a);
        }
        if (total == 0) revert NothingToClaim();
        _send(msg.sender, total);
    }

    // ---------------------------------------------------------------- keeper

    /// the operator samples each market's pool once (skips a market that isn't due, already has MAX_SAMPLES,
    /// or was sampled less than `sampleGap` ago / in this block). A running round is only sampled after its end.
    function sample(uint256[] calldata ids) external {
        if (msg.sender != operator && msg.sender != owner) revert NotAllowed();
        for (uint256 i; i < ids.length; i++) {
            if (ids[i] >= _markets.length) continue;
            Market storage m = _markets[ids[i]];
            if (m.cur != 0 && block.timestamp < _rounds[m.cur].endAt) continue;
            if (m.cur == 0 && !m.active) continue;
            if (m.n > 0 && block.timestamp > uint256(m.lastSampleAt) + STALE) m.n = 0; // old samples don't count
            if (m.n >= MAX_SAMPLES || (m.n > 0 && block.timestamp < uint256(m.lastSampleAt) + (sampleGap == 0 ? 1 : sampleGap))) continue;
            (uint160 p,,,) = poolManager.getSlot0(m.key.toId());
            if (p == 0) continue;
            m.samples[m.n] = p;
            m.n += 1;
            m.lastSampleAt = uint64(block.timestamp);
            emit Sampled(ids[i], p, m.n);
        }
    }

    /// close each market's ended round on the median of its samples and open the next one (anyone can call;
    /// the prices only come from the operator's samples). A round past GRACE closes as a refund.
    function settle(uint256[] calldata ids) external {
        for (uint256 i; i < ids.length; i++) {
            if (ids[i] < _markets.length) _settle(ids[i]);
        }
    }

    function _settle(uint256 id) internal {
        Market storage m = _markets[id];
        bool enough = m.n >= minSamples && m.n > 0;
        uint160 med = enough ? _median(m) : 0;
        if (m.cur != 0) {
            Round storage r = _rounds[m.cur];
            if (block.timestamp < r.endAt) return;
            bool late = block.timestamp > uint256(r.endAt) + GRACE;
            if (!late && !enough) return;
            uint256 fee;
            if (late) {
                // nobody settled it in time: everyone gets their stake back, and the next round waits for fresh samples
                r.result = Result.Refund;
                emit RoundSettled(m.cur, Result.Refund, 0, r.up, r.down, 0);
                m.cur = 0;
                m.n = 0;
                return;
            } else {
                r.closePrice = med;
                bool upWon = m.tokenIs0 ? med > r.openPrice : med < r.openPrice;
                if (r.up == 0 || r.down == 0 || med == r.openPrice) r.result = Result.Refund;
                else {
                    r.result = upWon ? Result.Up : Result.Down;
                    uint256 pot = uint256(r.up) + r.down;
                    fee = (pot * r.feeBps) / 10_000;
                    feesOwed += fee;
                }
            }
            emit RoundSettled(m.cur, r.result, r.closePrice, r.up, r.down, fee);
            m.cur = 0;
        }
        if (enough && m.active) {
            uint64 now_ = uint64(block.timestamp);
            uint64 end = now_ + m.duration;
            uint256 l = lockSecs < m.duration / 2 ? lockSecs : m.duration / 2;
            _rounds.push(Round({ market: uint32(id), feeBps: uint16(feeBps), result: Result.Open, startAt: now_, lockAt: end - uint64(l), endAt: end,
                openPrice: med, closePrice: 0, up: 0, down: 0 }));
            uint64 rid = uint64(_rounds.length - 1);
            m.cur = rid;
            _roundIds[id].push(rid);
            emit RoundStarted(rid, id, now_, end - uint64(l), end, med);
        }
        if (enough) m.n = 0;
    }

    function _median(Market storage m) internal view returns (uint160) {
        uint256 n = m.n;
        uint160[5] memory a = m.samples;
        for (uint256 i = 1; i < n; i++) {
            uint160 x = a[i];
            uint256 j = i;
            while (j > 0 && a[j - 1] > x) { a[j] = a[j - 1]; j--; }
            a[j] = x;
        }
        return n % 2 == 1 ? a[n / 2] : uint160((uint256(a[n / 2 - 1]) + a[n / 2]) / 2);
    }

    // ---------------------------------------------------------------- markets (owner or operator)

    function addMarket(PoolKey calldata key, uint32 duration) external onlyStaff returns (uint256 id) {
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadLimits();
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        bool u0 = c0 == address(0) || c0 == usdc;
        bool u1 = c1 == address(0) || c1 == usdc;
        if (u0 == u1) revert NotUsdcPool();
        (uint160 p,,,) = poolManager.getSlot0(key.toId());
        if (p == 0) revert PoolNotLive();
        id = _markets.length;
        _markets.push();
        Market storage m = _markets[id];
        m.key = key;
        m.token = u0 ? c1 : c0;
        m.tokenIs0 = u1;
        m.active = true;
        m.duration = duration;
        emit MarketAdded(id, m.token, PoolId.unwrap(key.toId()), duration);
    }

    /// stop (or restart) a market: the running round still finishes; no new round starts while it's off
    function setActive(uint256 id, bool on) external onlyStaff {
        _m(id).active = on;
        emit MarketActive(id, on);
    }

    // ---------------------------------------------------------------- owner

    function setLimits(uint256 _minBet, uint256 _maxBet, uint256 _maxSide, uint256 _lockSecs, uint256 _minSamples, uint256 _sampleGap) external onlyOwner {
        if (_minBet == 0 || _maxBet < _minBet || _maxSide < _maxBet || _lockSecs > 600 || _minSamples == 0 || _minSamples > MAX_SAMPLES || _sampleGap > 60) revert BadLimits();
        (minBet, maxBet, maxSide, lockSecs, minSamples, sampleGap) = (_minBet, _maxBet, _maxSide, _lockSecs, _minSamples, _sampleGap);
        emit Limits(_minBet, _maxBet, _maxSide, _lockSecs, _minSamples, _sampleGap);
    }
    function setFee(uint256 bps, address to) external onlyOwner {
        if (bps > MAX_FEE_BPS || to == address(0)) revert BadLimits();
        feeBps = bps;
        feeTo = to;
        emit Fee(bps, to);
    }
    /// the protocol's fees go to feeTo (anyone can push them there)
    function payFees() external nonReentrant {
        uint256 a = feesOwed;
        if (a == 0) revert NothingToClaim();
        feesOwed = 0;
        feesPaid += a;
        emit FeesPaid(feeTo, a);
        _send(feeTo, a);
    }
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setOperator(address a) external onlyOwner { if (a == address(0)) revert BadLimits(); operator = a; emit OperatorSet(a); }
    function setOwner(address a) external onlyOwner { if (a == address(0)) revert BadLimits(); owner = a; emit OwnerSet(a); }

    // ---------------------------------------------------------------- internal

    function _m(uint256 id) internal view returns (Market storage) { if (id >= _markets.length) revert BadMarket(); return _markets[id]; }
    function _send(address to, uint256 a) internal {
        (bool ok,) = to.call{value: a}("");
        if (!ok) revert TransferFailed();
    }
}
