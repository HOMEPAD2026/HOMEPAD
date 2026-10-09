// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/// @title ARCIRCLE Predict × — multiplier rounds on Arc tokens, paid in USDC (ARCIRCLE PAD utility)
/// @notice The same rounds as ArcPredict, with up to four outcomes instead of UP / DOWN: each market splits the round's
///         move into bands — by default "down more than x%", "down", "up", "up more than x%" (x = 1% for 5-minute
///         rounds, 2% for 15 minutes, 5% for an hour). Each band has its own pool and the winning band splits the whole
///         pot, so the far bands pay a multiple of the near ones. One band per wallet per round. A round refunds, without
///         fee, when the price didn't move, nobody picked the winning band, or everyone did.
///         Everything else is ArcPredict's:
///         Bets are Arc's native USDC (18 decimals, sent as the value — no approval). Every market follows one token's
///         Uniswap v4 pool against USDC and runs rounds on a fixed schedule: round e covers [start + e·d, start + (e+1)·d).
///           • betting on round e opens when round e−1 locks and closes `lock` seconds before round e ends (the lock
///             is set per market — longer rounds lock earlier), so there is always a round to join
///           • the price is read from the pool itself: at every boundary the keeper (operator) samples the pool a few
///             times in different blocks within SAMPLE_WINDOW, and the boundary price is the MEDIAN. A boundary's
///             price closes the round before it and is the price to beat of the round after it
///           • the winning side splits the pot pro rata after the fee (2% by default, never above 3%). A referrer
///             earns a share of the fee its referred wallets paid (25% by default, never above 50%); the rest of the
///             fee goes to `feeTo` — ArcircleFeeBurn, which buys $ARCIRCLE with half of it and burns it
///           • a refund, without fee, when a side is empty, the price didn't move, a boundary price is missing, or the
///             round wasn't settled within GRACE after its end — then everyone can claim their stake back
///           • winnings, refunds and referral earnings are claimable forever; nothing can sweep them
///           • anyone can open a market by burning `listBurn` $ARCIRCLE, for a pool with enough liquidity and an
///             accepted hook; the team can list without a burn and stop any market (its open round still finishes)
contract ArcPredictBands {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    address public immutable usdc; // Arc's USDC, ERC-20 face (6 decimals) of the same balance as native USDC
    address public immutable arcircle; // burned to open a market
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant MAX_FEE_BPS = 300;
    uint256 public constant MAX_REF_SHARE = 5000;
    uint256 public constant MAX_SAMPLES = 5;
    uint256 public constant SAMPLE_WINDOW = 120; // a boundary is sampled within 2 minutes of it
    uint256 public constant GRACE = 15 minutes; // a round not settled 15 minutes after its end refunds
    uint256 public constant MIN_DURATION = 300;
    uint256 public constant MAX_DURATION = 1 days;
    uint160 internal constant HOOK_MASK = 0x3FFF;

    uint8 public constant MAX_BANDS = 4;
    uint8 public constant REFUND = 255; // a round's result: 0 open, 1–4 the winning band (index + 1), 255 refund

    struct Market {
        address token;
        address lister;
        bool tokenIs0;
        uint32 duration;
        uint32 lock;
        uint64 start;
        uint64 stopEpoch; // no bets on rounds ≥ this (type(uint64).max while running)
        uint64 next; // the next boundary to finalize
        uint8 n;
        uint64 lastSampleAt;
        uint160[5] samples;
        PoolKey key;
        uint8 bands;      // 2–4 outcomes
        int32[3] edges;   // the move, in bps, where each band ends (ascending): band i = move < edges[i], the last ≥ edges[n−2]
    }
    struct Round {
        uint32 market;
        uint64 epoch;
        uint16 feeBps;
        uint16 refShare;
        uint8 result;
        int32 moveBps; // the close against the open, in bps of the token's price (set when settled)
        uint160 openPrice; // sqrtPriceX96 at the round's start boundary
        uint160 closePrice;
        uint128[4] pools;
        uint128 refStake; // stake placed by wallets that have a referrer
    }
    struct Bet { uint8 pick; uint128 amount; bool claimed; } // pick = band index + 1

    address public owner;
    address public operator;
    address public feeTo;
    bool public paused;
    uint256 public feeBps = 200;
    uint256 public refShare = 2500;
    uint8 public feeMode; // how fees reach feeTo: 0 = as ERC-20 USDC (ArcircleFeeBurn), 1 = as native USDC
    uint256 public minBet = 0.5e18;
    uint256 public maxBet = 5e18; // per wallet per round
    uint256 public maxSide = 500e18; // per side per round
    uint256 public minSamples = 3;
    uint256 public sampleGap = 2; // seconds between two samples
    uint256 public feesOwed;
    uint256 public feesPaid;
    uint256 public volume;

    // community listing
    bool public listOpen;
    uint256 public listBurn; // $ARCIRCLE burned to open a market
    mapping(address => bool) public quoteAsset; // what a market's pool must be paired with
    mapping(address => uint256) public minQuote; // least USDC in range to open a market (6 decimals for the ERC-20, 18 for native)
    mapping(address => bool) public hookAllowed;
    mapping(uint16 => bool) public hookPattern;
    bool public allowNoHook = true;
    mapping(bytes32 => bool) public listed; // pool + duration, while its market runs

    Market[] internal _markets;
    Round[] internal _rounds; // round ids start at 1
    mapping(uint256 => mapping(uint256 => uint64)) public roundOf; // market → epoch → round id (0 = nobody bet)
    mapping(uint256 => mapping(uint256 => uint160)) public priceAt; // market → boundary → median price (0 = missing)
    mapping(uint256 => uint64[]) internal _roundIds;
    mapping(uint256 => mapping(address => Bet)) public bets;
    mapping(address => address) public referrerOf;
    mapping(uint256 => mapping(address => uint128)) public refStakeOf; // round → referrer → referred stake
    mapping(uint256 => mapping(address => bool)) public refClaimed;
    mapping(address => uint256) public refEarned; // referral earnings claimed, all time
    uint256 private _lock = 1;

    event MarketAdded(uint256 indexed market, address indexed token, address indexed lister, bytes32 poolId, uint32 duration, uint32 lock, uint64 start, uint256 burned);
    event Bands(uint256 indexed market, uint8 bands, int32[3] edges);
    event MarketStopped(uint256 indexed market, uint64 stopEpoch);
    event BetPlaced(uint256 indexed round, address indexed user, uint256 indexed market, uint64 epoch, uint8 pick, uint256 amount, address referrer);
    event Sampled(uint256 indexed market, uint64 boundary, uint160 price, uint8 n);
    event Boundary(uint256 indexed market, uint64 boundary, uint160 price);
    event RoundSettled(uint256 indexed round, uint256 indexed market, uint64 epoch, uint8 result, int32 moveBps, uint160 openPrice, uint160 closePrice, uint256 pot, uint256 fee, uint256 refFee);
    event Claimed(uint256 indexed round, address indexed user, uint256 amount);
    event RefClaimed(uint256 indexed round, address indexed referrer, uint256 amount);
    event FeesPaid(address indexed to, uint256 amount);
    event Limits(uint256 minBet, uint256 maxBet, uint256 maxSide, uint256 minSamples, uint256 sampleGap);
    event Fee(uint256 feeBps, uint256 refShare, address feeTo, uint8 feeMode);
    event Listing(bool open, uint256 burn);
    event Paused(bool paused);
    event OwnerSet(address indexed owner);
    event OperatorSet(address indexed operator);

    error NotOwner();
    error NotAllowed();
    error IsPaused();
    error BadMarket();
    error NotQuotePool();
    error PoolNotLive();
    error HookNotAllowed();
    error TooThin();
    error AlreadyListed();
    error ListingClosed();
    error BadLimits();
    error NotOpen();
    error NoPriceToBeat();
    error TooSmall();
    error OverMaxBet();
    error OverMaxSide();
    error OtherSide();
    error BadBand();
    error NothingToClaim();
    error TransferFailed();
    error Reentrant();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyStaff() { if (msg.sender != owner && msg.sender != operator) revert NotAllowed(); _; }
    modifier nonReentrant() { if (_lock != 1) revert Reentrant(); _lock = 2; _; _lock = 1; }

    constructor(IPoolManager _pm, address _usdc, address _arcircle, address _owner, address _operator, address _feeTo) {
        if (address(_pm) == address(0) || _usdc == address(0) || _owner == address(0) || _operator == address(0) || _feeTo == address(0)) revert BadLimits();
        poolManager = _pm;
        usdc = _usdc;
        arcircle = _arcircle;
        (owner, operator, feeTo) = (_owner, _operator, _feeTo);
        quoteAsset[_usdc] = true; // a pool paired with USDC's ERC-20 face…
        quoteAsset[address(0)] = true; // …or with native USDC
        minQuote[_usdc] = 5_000e6;
        minQuote[address(0)] = 5_000e18;
        _rounds.push();
    }

    // ---------------------------------------------------------------- time

    function startAt(uint256 m, uint256 e) public view returns (uint256) { Market storage k = _m(m); return uint256(k.start) + e * k.duration; }
    /// the round people can bet on now (it may not have started yet: it opens when the one before it locks)
    function bettingEpoch(uint256 m) public view returns (uint64) {
        Market storage k = _m(m);
        return uint64((block.timestamp + k.lock - k.start) / k.duration);
    }
    /// the round running now
    function currentEpoch(uint256 m) public view returns (uint64) { Market storage k = _m(m); return uint64((block.timestamp - k.start) / k.duration); }
    /// the lock a round of `d` seconds gets unless the team picks one: 30 s for 5 minutes, 2 minutes for 15, a sixth
    /// of anything longer (10 minutes for an hour)
    function defaultLock(uint256 d) public pure returns (uint32) { return uint32(d <= 300 ? 30 : d <= 900 ? 120 : d / 6); }

    // ---------------------------------------------------------------- views

    function marketCount() external view returns (uint256) { return _markets.length; }
    function roundCount() external view returns (uint256) { return _rounds.length - 1; }
    function market(uint256 id) external view returns (
        address token, address lister, bool tokenIs0, uint32 duration, uint32 lock, uint64 start, uint64 stopEpoch, uint64 next, uint8 n, bytes32 poolId, uint256 rounds
    ) {
        Market storage k = _m(id);
        return (k.token, k.lister, k.tokenIs0, k.duration, k.lock, k.start, k.stopEpoch, k.next, k.n, _pid(k), _roundIds[id].length);
    }
    function marketKey(uint256 id) external view returns (PoolKey memory) { return _m(id).key; }
    function samplesOf(uint256 id) external view returns (uint160[] memory out) {
        Market storage k = _m(id);
        out = new uint160[](k.n);
        for (uint256 i; i < k.n; i++) out[i] = k.samples[i];
    }
    function round(uint256 id) external view returns (Round memory) { if (id == 0 || id >= _rounds.length) revert BadMarket(); return _rounds[id]; }
    function bandsOf(uint256 id) external view returns (uint8 bands, int32[3] memory edges) { Market storage k = _m(id); return (k.bands, k.edges); }
    /// a market's rounds that have bets, newest first: `n` of them, skipping the newest `skip`
    function roundsOf(uint256 id, uint256 skip, uint256 n) external view returns (uint64[] memory out) {
        uint64[] storage a = _roundIds[id];
        if (skip >= a.length) return new uint64[](0);
        uint256 k = a.length - skip < n ? a.length - skip : n;
        out = new uint64[](k);
        for (uint256 i; i < k; i++) out[i] = a[a.length - 1 - skip - i];
    }
    function priceOf(uint256 id) public view returns (uint160) { return _price(_m(id)); }

    function claimable(uint256 id, address user) public view returns (uint256) {
        if (id == 0 || id >= _rounds.length) return 0;
        Bet storage b = bets[id][user];
        if (b.claimed || b.amount == 0) return 0;
        Round storage r = _rounds[id];
        uint8 res = r.result;
        if (res == 0) return block.timestamp > startAt(r.market, r.epoch + 1) + GRACE ? b.amount : 0;
        if (res == REFUND) return b.amount;
        if (b.pick != res) return 0;
        uint256 pot = _pot(r);
        return (uint256(b.amount) * (pot - (pot * r.feeBps) / 10_000)) / r.pools[res - 1];
    }
    /// a referrer's share of the fee its wallets paid in a round that had a winner
    function refClaimable(uint256 id, address ref) public view returns (uint256) {
        if (id == 0 || id >= _rounds.length || refClaimed[id][ref]) return 0;
        Round storage r = _rounds[id];
        if (r.result == 0 || r.result == REFUND) return 0;
        return ((uint256(refStakeOf[id][ref]) * r.feeBps) / 10_000 * r.refShare) / 10_000;
    }

    // ---------------------------------------------------------------- bets and claims

    /// bet the value (native USDC) on band `pick` (1 = the lowest) of round `epoch` of market `m` (the round open for
    /// bets now). `ref` is remembered the first time and earns a share of the fees you pay.
    function bet(uint256 m, uint64 epoch, uint8 pick, address ref) external payable nonReentrant {
        uint256 amount = msg.value;
        if (paused) revert IsPaused();
        Market storage k = _m(m);
        if (pick == 0 || pick > k.bands) revert BadBand();
        if (epoch != bettingEpoch(m) || epoch >= k.stopEpoch) revert NotOpen();
        // past its start boundary's window, a round needs its price to beat
        if (block.timestamp > uint256(k.start) + uint256(epoch) * k.duration + SAMPLE_WINDOW) {
            bool known = (k.next > epoch && priceAt[m][epoch] != 0) || (k.next == epoch && k.n >= minSamples && k.n > 0);
            if (!known) revert NoPriceToBeat();
        }
        if (amount < minBet) revert TooSmall();
        uint64 id = roundOf[m][epoch];
        if (id == 0) {
            _rounds.push();
            Round storage n = _rounds[_rounds.length - 1];
            (n.market, n.epoch, n.feeBps, n.refShare) = (uint32(m), epoch, uint16(feeBps), uint16(refShare));
            id = uint64(_rounds.length - 1);
            roundOf[m][epoch] = id;
            _roundIds[m].push(id);
        }
        Round storage r = _rounds[id];
        Bet storage b = bets[id][msg.sender];
        if (b.pick != 0 && b.pick != pick) revert OtherSide();
        uint256 mine = uint256(b.amount) + amount;
        if (mine > maxBet) revert OverMaxBet();
        uint256 side = uint256(r.pools[pick - 1]) + amount;
        if (side > maxSide) revert OverMaxSide();
        b.pick = pick;
        b.amount = uint128(mine);
        r.pools[pick - 1] = uint128(side);
        address rf = referrerOf[msg.sender];
        if (rf == address(0) && ref != address(0) && ref != msg.sender) { referrerOf[msg.sender] = ref; rf = ref; }
        if (rf != address(0)) { r.refStake += uint128(amount); refStakeOf[id][rf] += uint128(amount); }
        volume += amount;
        emit BetPlaced(id, msg.sender, m, epoch, pick, amount, rf);
    }

    /// winnings and refunds from several rounds at once; rounds with nothing to claim are skipped
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
    /// a referrer's earnings from several rounds at once
    function claimRef(uint256[] calldata ids) external nonReentrant returns (uint256 total) {
        for (uint256 i; i < ids.length; i++) {
            uint256 a = refClaimable(ids[i], msg.sender);
            if (a == 0) continue;
            refClaimed[ids[i]][msg.sender] = true;
            total += a;
            emit RefClaimed(ids[i], msg.sender, a);
        }
        if (total == 0) revert NothingToClaim();
        refEarned[msg.sender] += total;
        _send(msg.sender, total);
    }

    // ---------------------------------------------------------------- keeper

    /// the operator samples each market's pool for its next boundary (skipped when it isn't due, is full, or was
    /// sampled less than `sampleGap` ago)
    function sample(uint256[] calldata ids) external onlyStaff {
        for (uint256 i; i < ids.length; i++) {
            if (ids[i] >= _markets.length) continue;
            Market storage k = _markets[ids[i]];
            _skipMissed(ids[i], k);
            if (k.next > k.stopEpoch) continue;
            uint256 t = uint256(k.start) + uint256(k.next) * k.duration;
            if (block.timestamp < t || block.timestamp > t + SAMPLE_WINDOW) continue;
            if (k.n >= MAX_SAMPLES || (k.n > 0 && block.timestamp < uint256(k.lastSampleAt) + (sampleGap == 0 ? 1 : sampleGap))) continue;
            uint160 p = _price(k);
            if (p == 0) continue;
            k.samples[k.n] = p;
            k.n += 1;
            k.lastSampleAt = uint64(block.timestamp);
            emit Sampled(ids[i], k.next, p, k.n);
        }
    }

    /// finalize each market's boundary on the median of its samples and settle the round it closes (anyone)
    function settle(uint256[] calldata ids) external {
        for (uint256 i; i < ids.length; i++) {
            if (ids[i] >= _markets.length) continue;
            Market storage k = _markets[ids[i]];
            _skipMissed(ids[i], k);
            if (k.next > k.stopEpoch || k.n < minSamples || k.n == 0) continue;
            _finalize(ids[i], k, _median(k));
        }
    }

    /// boundaries whose window passed without enough samples get no price; their rounds refund
    function _skipMissed(uint256 m, Market storage k) internal {
        uint256 t = uint256(k.start) + uint256(k.next) * k.duration;
        if (block.timestamp <= t + SAMPLE_WINDOW) return;
        if (k.n >= minSamples && k.n > 0) {
            _finalize(m, k, _median(k));
            t = uint256(k.start) + uint256(k.next) * k.duration;
            if (block.timestamp <= t + SAMPLE_WINDOW) return;
        }
        // jump to the first boundary whose window is still open (or ahead)
        uint256 b = (block.timestamp - SAMPLE_WINDOW - k.start + k.duration - 1) / k.duration;
        if (b <= k.next) b = uint256(k.next) + 1;
        if (b > uint256(k.stopEpoch) + 1) b = uint256(k.stopEpoch) + 1;
        k.next = uint64(b);
        k.n = 0;
    }

    function _finalize(uint256 m, Market storage k, uint160 p) internal {
        uint64 b = k.next;
        priceAt[m][b] = p;
        emit Boundary(m, b, p);
        k.next = b + 1;
        k.n = 0;
        if (b == 0) return;
        uint64 id = roundOf[m][b - 1];
        if (id == 0) return;
        Round storage r = _rounds[id];
        if (r.result != 0) return;
        uint160 o = priceAt[m][b - 1];
        r.openPrice = o;
        r.closePrice = p;
        uint256 fee;
        uint256 refFee;
        uint256 pot = _pot(r);
        bool late = block.timestamp > uint256(k.start) + uint256(b) * k.duration + GRACE;
        uint8 win;
        if (!late && o != 0 && p != 0 && o != p) {
            int256 mv = moveBps(o, p, k.tokenIs0);
            r.moveBps = int32(mv > type(int32).max ? type(int32).max : mv < type(int32).min ? type(int32).min : mv);
            win = bandOf(k, mv);
        }
        // refund: no price, no move, nobody on the winning band, or everybody on it
        if (win == 0 || r.pools[win - 1] == 0 || r.pools[win - 1] == pot) r.result = REFUND;
        else {
            r.result = win;
            fee = (pot * r.feeBps) / 10_000;
            refFee = ((uint256(r.refStake) * r.feeBps) / 10_000 * r.refShare) / 10_000;
            feesOwed += fee - refFee;
        }
        emit RoundSettled(id, m, b - 1, r.result, r.moveBps, o, p, pot, fee, refFee);
    }

    /// the token's move from √price `o` to `p`, in bps (positive = the token went up against USDC). A move past
    /// ±10,000× is clamped.
    function moveBps(uint160 o, uint160 p, bool tokenIs0) public pure returns (int256) {
        // the token's price is √P² (token = currency0) or 1/√P² (token = currency1)
        (uint256 a, uint256 c) = tokenIs0 ? (uint256(p), uint256(o)) : (uint256(o), uint256(p));
        uint256 r = (a * 1e9) / c; // √(new/old) × 1e9
        if (r >= 1e11) return int256(100_000_000); // ×10,000
        uint256 ratio = (r * r) / 1e9; // new/old × 1e9
        return (int256(ratio) - 1e9) / 1e5;
    }
    /// the band (1-based) a move falls in
    function bandOf(Market storage k, int256 mv) internal view returns (uint8) {
        for (uint8 i = 0; i + 1 < k.bands; i++) if (mv < int256(k.edges[i])) return i + 1;
        return k.bands;
    }
    function _pot(Round storage r) internal view returns (uint256 s) { for (uint256 i; i < MAX_BANDS; i++) s += r.pools[i]; }

    function _median(Market storage k) internal view returns (uint160) {
        uint256 n = k.n;
        uint160[5] memory a = k.samples;
        for (uint256 i = 1; i < n; i++) {
            uint160 x = a[i];
            uint256 j = i;
            while (j > 0 && a[j - 1] > x) { a[j] = a[j - 1]; j--; }
            a[j] = x;
        }
        return n % 2 == 1 ? a[n / 2] : uint160((uint256(a[n / 2 - 1]) + a[n / 2]) / 2);
    }

    function _price(Market storage k) internal view returns (uint160 p) { (p,,,) = poolManager.getSlot0(k.key.toId()); }
    function _pid(Market storage k) internal view returns (bytes32) { return PoolId.unwrap(k.key.toId()); }

    // ---------------------------------------------------------------- markets

    /// anyone: open a market for a pool by burning `listBurn` $ARCIRCLE. Rounds of 5 minutes, 15 minutes or an hour;
    /// the pool must hold at least `minQuote` USDC in range and have no hook or an accepted one.
    function listMarket(PoolKey calldata key, uint32 duration) external returns (uint256 id) {
        if (!listOpen) revert ListingClosed();
        if (duration != 300 && duration != 900 && duration != 3600) revert BadLimits();
        uint256 b = listBurn;
        id = _add(key, duration, defaultLock(duration), true, b);
        _setBands(id, 4, defaultEdges(duration));
        if (b > 0) IERC20(arcircle).safeTransferFrom(msg.sender, DEAD, b);
    }
    /// the team: open a market without a burn, with its own lock (0 = the default) and bands (bands 0 = the default
    /// four for its length)
    function addMarket(PoolKey calldata key, uint32 duration, uint32 lock, uint8 bands, int32[3] calldata edges) external onlyStaff returns (uint256 id) {
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadLimits();
        if (lock == 0) lock = defaultLock(duration);
        if (lock < 10 || lock > duration / 2) revert BadLimits();
        id = _add(key, duration, lock, false, 0);
        if (bands == 0) _setBands(id, 4, defaultEdges(duration));
        else _setBands(id, bands, edges);
    }
    /// the default four bands: down more than x, down, up, up more than x (x = 1% for ≤ 5 minutes, 2% for ≤ 15, 5% else)
    function defaultEdges(uint256 d) public pure returns (int32[3] memory e) {
        int32 x = d <= 300 ? int32(100) : d <= 900 ? int32(200) : int32(500);
        e[0] = -x; e[1] = 0; e[2] = x;
    }
    function _setBands(uint256 id, uint8 bands, int32[3] memory edges) internal {
        if (bands < 2 || bands > MAX_BANDS) revert BadBand();
        for (uint256 i = 1; i + 1 < bands; i++) if (edges[i] <= edges[i - 1]) revert BadBand();
        Market storage k = _markets[id];
        k.bands = bands;
        k.edges = edges;
        emit Bands(id, bands, edges);
    }

    function _add(PoolKey calldata key, uint32 duration, uint32 lock, bool strict, uint256 burned) internal returns (uint256 id) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        bool q0 = quoteAsset[c0];
        if (q0 == quoteAsset[c1]) revert NotQuotePool();
        (address token, bool tokenIs0, address quote) = q0 ? (c1, false, c0) : (c0, true, c1);
        bytes32 pid = PoolId.unwrap(key.toId());
        if (strict) {
            address h = address(key.hooks);
            if (h == address(0) ? !allowNoHook : !(hookAllowed[h] || hookPattern[uint16(uint160(h) & HOOK_MASK)])) revert HookNotAllowed();
        }
        (uint160 p,,,) = poolManager.getSlot0(key.toId());
        if (p == 0) revert PoolNotLive();
        if (strict) {
            // the USDC held in range: L·√P (USDC = currency1) or L/√P (USDC = currency0)
            uint256 liq = poolManager.getLiquidity(key.toId());
            uint256 depth = tokenIs0 ? (liq * uint256(p)) >> 96 : (liq << 96) / uint256(p);
            if (depth < minQuote[quote]) revert TooThin();
        }
        bytes32 tag = keccak256(abi.encode(pid, duration));
        if (listed[tag]) revert AlreadyListed();
        listed[tag] = true;
        id = _markets.length;
        _markets.push();
        Market storage k = _markets[id];
        k.key = key;
        k.token = token;
        k.tokenIs0 = tokenIs0;
        k.lister = msg.sender;
        k.duration = duration;
        k.lock = lock;
        k.start = uint64(block.timestamp);
        k.stopEpoch = type(uint64).max;
        emit MarketAdded(id, token, msg.sender, pid, duration, lock, k.start, burned);
    }

    /// the team stops a market: the round open for bets now still runs and settles; no bets after it.
    /// The pool can be listed again afterwards.
    function stop(uint256 id) external onlyStaff {
        Market storage k = _m(id);
        if (k.stopEpoch != type(uint64).max) return;
        k.stopEpoch = bettingEpoch(id) + 1;
        listed[keccak256(abi.encode(_pid(k), k.duration))] = false;
        emit MarketStopped(id, k.stopEpoch);
    }

    // ---------------------------------------------------------------- owner

    function setLimits(uint256 _minBet, uint256 _maxBet, uint256 _maxSide, uint256 _minSamples, uint256 _sampleGap) external onlyOwner {
        if (_minBet == 0 || _maxBet < _minBet || _maxSide < _maxBet || _minSamples == 0 || _minSamples > MAX_SAMPLES || _sampleGap > 30) revert BadLimits();
        (minBet, maxBet, maxSide, minSamples, sampleGap) = (_minBet, _maxBet, _maxSide, _minSamples, _sampleGap);
        emit Limits(_minBet, _maxBet, _maxSide, _minSamples, _sampleGap);
    }
    /// the fee and the referral share apply to rounds that get their first bet after the change; `mode` is how fees
    /// reach `to` (0 = as ERC-20 USDC, 1 = as native USDC — the fallback if a fee burn can't take the ERC-20 face)
    function setFee(uint256 bps, uint256 share, address to, uint8 mode) external onlyOwner {
        if (bps > MAX_FEE_BPS || share > MAX_REF_SHARE || to == address(0) || mode > 1) revert BadLimits();
        (feeBps, refShare, feeTo, feeMode) = (bps, share, to, mode);
        emit Fee(bps, share, to, mode);
    }
    function setListing(bool open, uint256 burn) external onlyOwner {
        if (burn > 0 && arcircle == address(0)) revert BadLimits();
        (listOpen, listBurn) = (open, burn);
        emit Listing(open, burn);
    }
    function setQuote(address asset, bool ok, uint256 min) external onlyOwner { quoteAsset[asset] = ok; minQuote[asset] = min; }
    function setHookAllowed(address hook, bool ok) external onlyOwner { hookAllowed[hook] = ok; }
    function setHookPattern(uint16 bits, bool ok) external onlyOwner { hookPattern[bits] = ok; }
    function setAllowNoHook(bool ok) external onlyOwner { allowNoHook = ok; }
    function setPaused(bool p) external onlyOwner { paused = p; emit Paused(p); }
    function setOperator(address a) external onlyOwner { if (a == address(0)) revert BadLimits(); operator = a; emit OperatorSet(a); }
    function setOwner(address a) external onlyOwner { if (a == address(0)) revert BadLimits(); owner = a; emit OwnerSet(a); }

    /// the protocol's share of the fees goes to feeTo (anyone can push it there). As ERC-20 USDC (mode 0) it moves in
    /// whole 6-decimal units; the dust under a unit stays owed.
    function payFees() external nonReentrant {
        uint256 a = feesOwed;
        if (feeMode == 0) {
            uint256 six = a / 1e12;
            if (six == 0) revert NothingToClaim();
            feesOwed = a - six * 1e12;
            feesPaid += six * 1e12;
            emit FeesPaid(feeTo, six * 1e12);
            IERC20(usdc).safeTransfer(feeTo, six);
        } else {
            if (a == 0) revert NothingToClaim();
            feesOwed = 0;
            feesPaid += a;
            emit FeesPaid(feeTo, a);
            _send(feeTo, a);
        }
    }

    // ---------------------------------------------------------------- internal

    function _m(uint256 id) internal view returns (Market storage) { if (id >= _markets.length) revert BadMarket(); return _markets[id]; }
    function _send(address to, uint256 a) internal {
        (bool ok,) = to.call{value: a}("");
        if (!ok) revert TransferFailed();
    }
}
