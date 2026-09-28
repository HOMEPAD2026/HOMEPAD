// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// Uniswap v4's PoolManager exposes its storage; slot0 of a pool packs sqrtPriceX96 in the low 160 bits.
interface IExtsload {
    function extsload(bytes32 slot) external view returns (bytes32);
}

/// @title BuilderMine — ARCIRCLE PAD's mining utility on Arc (v2)
/// @notice Anyone who holds an Arc token can open a mine: they deposit part of their supply and pick
///         how long it runs. Builders (Arc's miners) join, mine in their browser and claim what they
///         dug. Nobody can take a deposit back — not the creator, not the owner of this contract: it is
///         only ever paid to builders or burned.
///
///         Emission. A mine is six layers deep and each layer lasts a sixth of its run; every layer
///         releases half as much as the one above (32, 16, 8, 4, 2, 1 parts of 63). The share of that
///         curve reached at time t is F(t). Anyone can top a mine up while it runs: a top-up made when
///         the curve stood at F0 is released over what is left of the same curve, (F(t) − F0) / (1 − F0),
///         so nothing of it counts as already mined. `emittedAt` adds the deposit and every top-up up.
///
///         Claims. The operator (ARCIRCLE PAD's server) counts each hour's work off-chain and posts a
///         Merkle root of cumulative amounts per builder. A root can only grow, can never exceed what the
///         schedule has released, and can only be posted until three days after the end.
///
///         Burns. Whatever no root ever gave out is burned three days after the end; whatever was given
///         out but not claimed within 30 more days is burned too. Everything paid to this contract is
///         $ARCIRCLE and is burned on the spot: opening a mine and joining one cost `feeUsd6` (1 USDC)
///         worth of $ARCIRCLE at the pool's current price, and items are priced in $ARCIRCLE. Burned
///         means sent to 0x…dEaD.
/// @dev Leaves are keccak256(bytes.concat(keccak256(abi.encode(mineId, account, cumulative)))), pairs
///      hashed sorted — the OpenZeppelin StandardMerkleTree format.
contract BuilderMine is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint8 public constant LAYERS = 6;
    uint256 private constant PARTS = 63; // 32 + 16 + 8 + 4 + 2 + 1
    uint256 private constant ONE = 1e18;
    uint64 public constant MIN_DAYS = 3;
    uint64 public constant MAX_DAYS = 60;
    uint64 public constant MAX_START_DELAY = 7 days;
    uint64 public constant FINAL_WINDOW = 3 days;  // roots may still be posted this long after the end
    uint64 public constant CLAIM_WINDOW = 30 days; // then claims stay open this much longer
    uint64 public constant TOPUP_CUTOFF = 1 hours; // no top-ups in a mine's last hour
    uint256 public constant MAX_TOPUPS = 16;
    uint256 public constant MAX_FEE_USD6 = 10e6;   // 10 USDC
    uint64 public constant MAX_BOOST_STACK = 7 days;
    uint8 public constant BOOST_KINDS = 4;         // 1 lantern · 2 dynamite · 3 lucky charm · 4 overtime
    uint8 public constant MAX_TIER = 7;

    IERC20 public immutable arcircle;
    IExtsload public immutable poolManager;
    bytes32 public immutable arcPoolSlot;          // the $ARCIRCLE / USDC pool's state slot in the PoolManager
    bool public immutable arcIsToken1;             // $ARCIRCLE is currency1 (USDC currency0)

    struct Mine {
        address token;
        address creator;
        uint128 deposited;   // what arrived, top-ups included (fee-on-transfer tokens are measured)
        uint128 rootTotal;   // sum of the newest root's cumulative amounts
        uint128 claimed;     // paid to builders
        uint128 burned;      // sent to 0x…dEaD
        uint64 start;
        uint64 end;
        bytes32 root;
        uint32 builders;     // joined
        uint32 rootCount;
        bool unminedBurned;
        bool closed;         // unclaimed burned; no more claims
        bool paused;         // the creator stopped new joins
    }
    struct Seg { uint128 amount; uint64 f0; }       // a deposit and where the curve stood when it came in
    struct Info { string name; string about; string link; }
    struct Item {
        uint128 price;     // $ARCIRCLE (18 decimals), burned on purchase
        uint8 tier;        // 1…MAX_TIER = a pickaxe tier; 0 = a boost
        uint8 boost;       // 1…BOOST_KINDS for a boost
        uint32 duration;   // seconds a boost runs
        bool active;
    }

    Mine[] private _mines;
    Item[] private _items;
    mapping(uint256 => Seg[]) private _segs;
    mapping(uint256 => Info) private _info;
    mapping(uint8 => uint256) public pickaxeItem; // tier → item id + 1 (0 = none)
    mapping(address => uint8) public pickaxeOf;    // permanent, every mine
    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(uint256 => mapping(address => address)) public referrerOf;
    mapping(uint256 => mapping(address => uint256)) public claimedBy;
    mapping(uint256 => mapping(address => mapping(uint8 => uint64))) public boostUntil;
    mapping(address => uint256[]) private _byToken;

    address public operator;
    uint256 public feeUsd6 = 1e6;      // 1 USDC, paid in $ARCIRCLE
    uint256 public feeFloorArc;        // never less than this much $ARCIRCLE (a guard if the price reads odd)
    bool public joinsPaused;           // the owner's switch: no new mines or joins (claims and burns go on)
    uint256 public arcircleBurned;

    event MineOpened(uint256 indexed id, address indexed token, address indexed creator, uint256 deposited, uint64 start, uint64 end);
    event ToppedUp(uint256 indexed id, address indexed from, uint256 amount, uint64 f0);
    event MineInfo(uint256 indexed id, string name, string about, string link);
    event MinePaused(uint256 indexed id, bool paused);
    event Joined(uint256 indexed id, address indexed builder, address indexed referrer, uint256 feeArc);
    event FeeBurned(address indexed payer, uint256 amountArc, uint8 kind); // 1 open · 2 join · 3 item
    event RootPosted(uint256 indexed id, bytes32 root, uint256 total, uint32 count);
    event Claimed(uint256 indexed id, address indexed builder, uint256 amount, uint256 cumulative);
    event Burned(uint256 indexed id, uint256 amount, bool unclaimed);
    event ItemBought(uint256 indexed mineId, address indexed builder, uint256 indexed itemId, uint256 paid, uint8 tier, uint8 boost, uint64 until);
    event ItemSet(uint256 indexed itemId, uint128 price, uint8 tier, uint8 boost, uint32 duration, bool active);
    event OperatorSet(address operator);
    event FeeSet(uint256 feeUsd6, uint256 floorArc);
    event JoinsPaused(bool paused);

    error ZeroAmount();
    error BadToken();
    error BadDuration();
    error BadDelay();
    error BadInfo();
    error UnknownMine();
    error UnknownItem();
    error NotStarted();
    error Ended();
    error NotEnded();
    error AlreadyJoined();
    error NotJoined();
    error NotOperator();
    error NotCreator();
    error Paused();
    error RootShrinks();
    error OverSchedule();
    error OverDeposit();
    error TooLate();
    error TooManyTopUps();
    error BadProof();
    error NothingOwed();
    error Closed();
    error AlreadyBurned();
    error ItemOff();
    error NotAnUpgrade();
    error StackTooLong();
    error FeeTooHigh();
    error BadItem();
    error NoPrice();
    error LengthMismatch();

    constructor(address arcircle_, address poolManager_, bytes32 arcPoolSlot_, bool arcIsToken1_, address operator_) Ownable(msg.sender) {
        if (arcircle_ == address(0) || poolManager_ == address(0)) revert BadToken();
        arcircle = IERC20(arcircle_);
        poolManager = IExtsload(poolManager_);
        arcPoolSlot = arcPoolSlot_;
        arcIsToken1 = arcIsToken1_;
        operator = operator_;
    }

    // ---------------- fees: $ARCIRCLE, burned ----------------

    /// @notice What opening or joining costs right now, in $ARCIRCLE (18 decimals): `feeUsd6` of USDC at the pool price.
    function feeArc() public view returns (uint256 amount) {
        if (feeUsd6 == 0) return 0;
        uint256 sqrtP = uint256(poolManager.extsload(arcPoolSlot)) & type(uint160).max;
        if (sqrtP == 0) revert NoPrice();
        uint256 p = Math.mulDiv(sqrtP, sqrtP, 1 << 96); // price × 2^96 (currency1 per currency0, raw units)
        amount = arcIsToken1 ? Math.mulDiv(p, feeUsd6, 1 << 96) : Math.mulDiv(feeUsd6, 1 << 96, p);
        if (amount < feeFloorArc) amount = feeFloorArc;
    }
    function _burnFee(uint8 kind) private returns (uint256 amt) {
        amt = feeArc();
        if (amt > 0) { arcircle.safeTransferFrom(msg.sender, DEAD, amt); arcircleBurned += amt; emit FeeBurned(msg.sender, amt, kind); }
    }

    // ---------------- mines ----------------

    /// @notice Open a mine: deposit `amount` of `token` to be mined over `days_` days, starting `startDelay`
    ///         seconds from now, with a name, a line about it and a link. The deposit can never come back.
    ///         Costs `feeArc()` $ARCIRCLE, burned (approve it first).
    function openMine(address token, uint256 amount, uint64 days_, uint64 startDelay, string calldata name, string calldata about, string calldata link) external nonReentrant returns (uint256 id) {
        if (joinsPaused) revert Paused();
        if (token == address(0)) revert BadToken();
        if (amount == 0) revert ZeroAmount();
        if (days_ < MIN_DAYS || days_ > MAX_DAYS) revert BadDuration();
        if (startDelay > MAX_START_DELAY) revert BadDelay();
        _checkInfo(name, about, link);
        _burnFee(1);
        uint256 got = _pull(token, amount);
        uint64 start = uint64(block.timestamp) + startDelay;
        uint64 end = start + days_ * 1 days;
        id = _mines.length;
        _mines.push(Mine({ token: token, creator: msg.sender, deposited: uint128(got), rootTotal: 0, claimed: 0, burned: 0, start: start, end: end,
            root: bytes32(0), builders: 0, rootCount: 0, unminedBurned: false, closed: false, paused: false }));
        _segs[id].push(Seg({ amount: uint128(got), f0: 0 }));
        _info[id] = Info(name, about, link);
        _byToken[token].push(id);
        emit MineOpened(id, token, msg.sender, got, start, end);
        emit MineInfo(id, name, about, link);
    }

    /// @notice Add more of the mine's token while it runs (anyone may). It is released over the rest of the
    ///         curve, never counted as already mined, and — like the deposit — can never come back.
    function topUp(uint256 id, uint256 amount) external nonReentrant {
        Mine storage m = _get(id);
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp + TOPUP_CUTOFF >= m.end) revert Ended();
        if (_segs[id].length > MAX_TOPUPS) revert TooManyTopUps();
        uint64 f0 = uint64(_f(m.start, m.end, block.timestamp));
        uint256 got = _pull(m.token, amount);
        if (uint256(m.deposited) + got > type(uint128).max) revert ZeroAmount();
        m.deposited += uint128(got);
        _segs[id].push(Seg({ amount: uint128(got), f0: f0 }));
        emit ToppedUp(id, msg.sender, got, f0);
    }

    function setInfo(uint256 id, string calldata name, string calldata about, string calldata link) external {
        Mine storage m = _get(id);
        if (msg.sender != m.creator) revert NotCreator();
        _checkInfo(name, about, link);
        _info[id] = Info(name, about, link);
        emit MineInfo(id, name, about, link);
    }
    /// @notice The creator can stop (and restart) new joins to their mine. Builders already in keep mining and claiming.
    function setMinePaused(uint256 id, bool p) external {
        Mine storage m = _get(id);
        if (msg.sender != m.creator) revert NotCreator();
        m.paused = p;
        emit MinePaused(id, p);
    }

    /// @notice Join a mine as a builder. Costs `feeArc()` $ARCIRCLE, burned (approve it first).
    ///         `referrer` counts only if they already joined this mine.
    function join(uint256 id, address referrer) external nonReentrant {
        Mine storage m = _get(id);
        if (joinsPaused || m.paused) revert Paused();
        if (block.timestamp >= m.end) revert Ended();
        if (joined[id][msg.sender]) revert AlreadyJoined();
        joined[id][msg.sender] = true;
        m.builders += 1;
        address ref = referrer != msg.sender && joined[id][referrer] ? referrer : address(0);
        if (ref != address(0)) referrerOf[id][msg.sender] = ref;
        uint256 fee = _burnFee(2);
        emit Joined(id, msg.sender, ref, fee);
    }

    /// @notice The most that can have been mined in mine `id` by time `t`.
    function emittedAt(uint256 id, uint256 t) public view returns (uint256 total) {
        Mine storage m = _get(id);
        uint256 f = _f(m.start, m.end, t);
        Seg[] storage s = _segs[id];
        for (uint256 i = 0; i < s.length; i++) {
            if (f <= s[i].f0) continue;
            total += (uint256(s[i].amount) * (f - s[i].f0)) / (ONE - s[i].f0);
        }
    }
    /// @dev F(t) × 1e18: the share of the six-layer halving curve reached at t.
    function _f(uint256 start, uint256 end, uint256 t) private pure returns (uint256) {
        if (t <= start) return 0;
        if (t >= end) return ONE;
        uint256 layerLen = (end - start) / LAYERS;
        uint256 elapsed = t - start;
        uint256 k = elapsed / layerLen;
        if (k >= LAYERS) return ONE;
        uint256 doneParts = 64 - (uint256(1) << (LAYERS - k)); // 32 + 16 + … for the k layers above
        uint256 w = uint256(1) << (LAYERS - 1 - k);
        return ((doneParts * layerLen + w * (elapsed - k * layerLen)) * ONE) / (PARTS * layerLen);
    }

    // ---------------- roots & claims ----------------

    /// @notice The operator posts the newest cumulative amounts. They can only grow, never pass the schedule
    ///         or the deposit, and stop three days after the mine ends.
    function postRoot(uint256 id, bytes32 root, uint256 total) external {
        if (msg.sender != operator) revert NotOperator();
        Mine storage m = _get(id);
        if (block.timestamp < m.start) revert NotStarted();
        if (block.timestamp > uint256(m.end) + FINAL_WINDOW || m.unminedBurned) revert TooLate();
        if (total < m.rootTotal) revert RootShrinks();
        if (total > emittedAt(id, block.timestamp)) revert OverSchedule();
        if (total > m.deposited) revert OverDeposit();
        m.root = root;
        m.rootTotal = uint128(total);
        m.rootCount += 1;
        emit RootPosted(id, root, total, m.rootCount);
    }

    /// @notice Pay `account` what it mined in `id` and hasn't claimed yet. Anyone may submit.
    function claim(uint256 id, address account, uint256 cumulative, bytes32[] calldata proof) external nonReentrant {
        _claim(id, account, cumulative, proof);
    }
    /// @notice The same for several mines in one transaction (one wallet).
    function claimMany(uint256[] calldata ids, address account, uint256[] calldata cumulatives, bytes32[][] calldata proofs) external nonReentrant {
        if (ids.length != cumulatives.length || ids.length != proofs.length) revert LengthMismatch();
        for (uint256 i = 0; i < ids.length; i++) _claim(ids[i], account, cumulatives[i], proofs[i]);
    }
    function _claim(uint256 id, address account, uint256 cumulative, bytes32[] calldata proof) private {
        Mine storage m = _get(id);
        if (m.closed) revert Closed();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(id, account, cumulative))));
        if (!MerkleProof.verifyCalldata(proof, m.root, leaf)) revert BadProof();
        uint256 done = claimedBy[id][account];
        if (cumulative <= done) revert NothingOwed();
        uint256 owed = cumulative - done;
        claimedBy[id][account] = cumulative;
        m.claimed += uint128(owed);
        if (m.claimed > m.rootTotal) revert OverDeposit(); // unreachable with a sound root
        IERC20(m.token).safeTransfer(account, owed);
        emit Claimed(id, account, owed, cumulative);
    }

    /// @notice Three days after the end, burn everything no root handed out. Anyone may call.
    function burnUnmined(uint256 id) external nonReentrant {
        Mine storage m = _get(id);
        if (block.timestamp <= uint256(m.end) + FINAL_WINDOW) revert NotEnded();
        if (m.unminedBurned) revert AlreadyBurned();
        _burnUnmined(id, m);
    }
    function _burnUnmined(uint256 id, Mine storage m) private {
        m.unminedBurned = true;
        uint256 amt = uint256(m.deposited) - m.rootTotal;
        if (amt > 0) { m.burned += uint128(amt); IERC20(m.token).safeTransfer(DEAD, amt); }
        emit Burned(id, amt, false);
    }

    /// @notice After the claim window, burn what builders left unclaimed and close the mine.
    function burnUnclaimed(uint256 id) external nonReentrant {
        Mine storage m = _get(id);
        if (block.timestamp <= uint256(m.end) + FINAL_WINDOW + CLAIM_WINDOW) revert NotEnded();
        if (m.closed) revert Closed();
        if (!m.unminedBurned) _burnUnmined(id, m);
        m.closed = true;
        uint256 amt = uint256(m.rootTotal) - m.claimed;
        if (amt > 0) { m.burned += uint128(amt); IERC20(m.token).safeTransfer(DEAD, amt); }
        emit Burned(id, amt, true);
    }

    // ---------------- items ----------------

    /// @notice Buy an item with $ARCIRCLE (approve it first); what you pay is burned.
    ///         A pickaxe costs the difference from the tier you have. A boost needs `mineId`.
    function buyItem(uint256 itemId, uint256 mineId) external nonReentrant {
        if (itemId >= _items.length) revert UnknownItem();
        Item memory it = _items[itemId];
        if (!it.active) revert ItemOff();
        uint256 cost = it.price;
        uint64 until;
        if (it.tier > 0) {
            uint8 have = pickaxeOf[msg.sender];
            if (it.tier <= have) revert NotAnUpgrade();
            if (have > 0 && pickaxeItem[have] > 0) {
                uint256 paid = _items[pickaxeItem[have] - 1].price;
                cost = cost > paid ? cost - paid : 0;
            }
            pickaxeOf[msg.sender] = it.tier;
        } else {
            Mine storage m = _get(mineId);
            if (!joined[mineId][msg.sender]) revert NotJoined();
            if (block.timestamp >= m.end) revert Ended();
            uint64 cur = boostUntil[mineId][msg.sender][it.boost];
            uint64 from = cur > block.timestamp ? cur : uint64(block.timestamp);
            until = from + it.duration;
            if (until > block.timestamp + MAX_BOOST_STACK) revert StackTooLong();
            boostUntil[mineId][msg.sender][it.boost] = until;
        }
        if (cost > 0) { arcircle.safeTransferFrom(msg.sender, DEAD, cost); arcircleBurned += cost; emit FeeBurned(msg.sender, cost, 3); }
        emit ItemBought(mineId, msg.sender, itemId, cost, it.tier, it.boost, until);
    }

    // ---------------- owner: settings only (never a mine's tokens) ----------------

    function setItem(uint256 itemId, uint128 price, uint8 tier, uint8 boost, uint32 duration, bool active) external onlyOwner {
        if (tier > 0 ? (boost != 0 || tier > MAX_TIER) : (boost == 0 || boost > BOOST_KINDS || duration == 0 || duration > MAX_BOOST_STACK)) revert BadItem();
        Item memory it = Item({ price: price, tier: tier, boost: boost, duration: duration, active: active });
        if (itemId == _items.length) _items.push(it);
        else if (itemId < _items.length) {
            Item memory old = _items[itemId];
            if (old.tier != tier || old.boost != boost) revert BadItem(); // an item keeps its kind
            _items[itemId] = it;
        } else revert UnknownItem();
        if (tier > 0) pickaxeItem[tier] = itemId + 1;
        emit ItemSet(itemId, price, tier, boost, duration, active);
    }
    function setOperator(address o) external onlyOwner { operator = o; emit OperatorSet(o); }
    function setFee(uint256 usd6, uint256 floorArc) external onlyOwner { if (usd6 > MAX_FEE_USD6) revert FeeTooHigh(); feeUsd6 = usd6; feeFloorArc = floorArc; emit FeeSet(usd6, floorArc); }
    function setJoinsPaused(bool p) external onlyOwner { joinsPaused = p; emit JoinsPaused(p); }

    // ---------------- views ----------------

    function mineCount() external view returns (uint256) { return _mines.length; }
    function getMine(uint256 id) external view returns (Mine memory) { return _get(id); }
    function infoOf(uint256 id) external view returns (Info memory) { _get(id); return _info[id]; }
    function segmentsOf(uint256 id) external view returns (Seg[] memory) { _get(id); return _segs[id]; }
    function minesOfToken(address token) external view returns (uint256[] memory) { return _byToken[token]; }
    function itemCount() external view returns (uint256) { return _items.length; }
    function getItems() external view returns (Item[] memory) { return _items; }
    /// @notice One builder in one mine: joined, referrer, pickaxe, claimed, and each boost's end time.
    function rigOf(uint256 id, address who) external view returns (bool isIn, address referrer, uint8 pickaxe, uint256 claimedSoFar, uint64[4] memory boosts) {
        isIn = joined[id][who];
        referrer = referrerOf[id][who];
        pickaxe = pickaxeOf[who];
        claimedSoFar = claimedBy[id][who];
        for (uint8 k = 1; k <= BOOST_KINDS; k++) boosts[k - 1] = boostUntil[id][who][k];
    }

    function _pull(address token, uint256 amount) private returns (uint256 got) {
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        got = IERC20(token).balanceOf(address(this)) - before;
        if (got == 0 || got > type(uint128).max) revert ZeroAmount();
    }
    function _checkInfo(string calldata name, string calldata about, string calldata link) private pure {
        if (bytes(name).length > 32 || bytes(about).length > 160 || bytes(link).length > 100) revert BadInfo();
    }
    function _get(uint256 id) private view returns (Mine storage) {
        if (id >= _mines.length) revert UnknownMine();
        return _mines[id];
    }
}
