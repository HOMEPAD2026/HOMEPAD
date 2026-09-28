// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title BuilderMine — ARCIRCLE PAD's mining utility on Arc
/// @notice Anyone who holds an Arc token can open a mine: they deposit part of their supply and
///         pick how long it runs. Builders (Arc's miners) join with a 1 USDC entry, mine in their
///         browser, and claim what they dug. Nobody can take a deposit back — not the creator,
///         not the owner of this contract: it is only ever paid to builders or burned.
///
///         Emission. A mine is six layers deep and each layer lasts a sixth of its run. Every layer
///         releases half as much as the one above (32, 16, 8, 4, 2, 1 parts of 63), so the first
///         builders dig the richest ground. `emittedAt` is the most that can have been handed out
///         at any moment, and every Merkle root is checked against it.
///
///         Claims. The operator (ARCIRCLE PAD's server) counts each hour's work off-chain and posts
///         a Merkle root of cumulative amounts per builder. A root can only grow, can never exceed
///         what the schedule has released, and can only be posted until three days after the end.
///         Builders claim the difference between their newest amount and what they already took.
///
///         Burns. Whatever no root ever gave out is burned three days after the end; whatever was
///         given out but not claimed within 30 more days is burned too. Items bought with $ARCIRCLE
///         are burned on purchase. Burned means sent to 0x…dEaD.
///
///         Items. Pickaxes are permanent and work in every mine (an upgrade costs the difference
///         between tiers). Boosts belong to one mine and run for a set time. The server reads both
///         from here when it weighs each builder's work.
/// @dev Leaves are keccak256(bytes.concat(keccak256(abi.encode(mineId, account, cumulative)))),
///      pairs hashed sorted — the OpenZeppelin StandardMerkleTree format.
contract BuilderMine is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint8 public constant LAYERS = 6;
    uint256 private constant PARTS = 63; // 32 + 16 + 8 + 4 + 2 + 1
    uint64 public constant MIN_DAYS = 3;
    uint64 public constant MAX_DAYS = 60;
    uint64 public constant MAX_START_DELAY = 7 days;
    uint64 public constant FINAL_WINDOW = 3 days;  // roots may still be posted this long after the end
    uint64 public constant CLAIM_WINDOW = 30 days; // then claims stay open this much longer
    uint256 public constant MAX_JOIN_FEE = 10e6;   // 10 USDC (6 decimals)
    uint64 public constant MAX_BOOST_STACK = 7 days;
    uint8 public constant BOOST_KINDS = 4;         // 1 lantern · 2 dynamite · 3 lucky charm · 4 overtime

    IERC20 public immutable usdc;
    IERC20 public immutable arcircle;

    struct Mine {
        address token;
        address creator;
        uint128 deposited;   // what arrived (fee-on-transfer tokens are measured)
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
    }

    struct Item {
        uint128 price;     // $ARCIRCLE (18 decimals), burned on purchase
        uint8 tier;        // 1…5 = a pickaxe tier; 0 = a boost
        uint8 boost;       // 1…BOOST_KINDS for a boost
        uint32 duration;   // seconds a boost runs
        bool active;
    }

    Mine[] private _mines;
    Item[] private _items;
    mapping(uint8 => uint256) public pickaxeItem; // tier → item id + 1 (0 = none)
    mapping(address => uint8) public pickaxeOf;    // permanent, every mine
    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(uint256 => mapping(address => address)) public referrerOf;
    mapping(uint256 => mapping(address => uint256)) public claimedBy;
    mapping(uint256 => mapping(address => mapping(uint8 => uint64))) public boostUntil;
    mapping(address => uint256[]) private _byToken;

    address public operator;
    address public feeTo;
    uint256 public joinFee = 1e6; // 1 USDC
    uint256 public arcircleBurned;

    event MineOpened(uint256 indexed id, address indexed token, address indexed creator, uint256 deposited, uint64 start, uint64 end);
    event Joined(uint256 indexed id, address indexed builder, address indexed referrer, uint256 fee);
    event RootPosted(uint256 indexed id, bytes32 root, uint256 total, uint32 count);
    event Claimed(uint256 indexed id, address indexed builder, uint256 amount, uint256 cumulative);
    event Burned(uint256 indexed id, uint256 amount, bool unclaimed);
    event ItemBought(uint256 indexed mineId, address indexed builder, uint256 indexed itemId, uint256 paid, uint8 tier, uint8 boost, uint64 until);
    event ItemSet(uint256 indexed itemId, uint128 price, uint8 tier, uint8 boost, uint32 duration, bool active);
    event OperatorSet(address operator);
    event FeeToSet(address feeTo);
    event JoinFeeSet(uint256 fee);

    error ZeroAmount();
    error BadToken();
    error BadDuration();
    error BadDelay();
    error UnknownMine();
    error UnknownItem();
    error NotStarted();
    error Ended();
    error NotEnded();
    error AlreadyJoined();
    error NotJoined();
    error NotOperator();
    error RootShrinks();
    error OverSchedule();
    error OverDeposit();
    error TooLate();
    error BadProof();
    error NothingOwed();
    error Closed();
    error AlreadyBurned();
    error ItemOff();
    error NotAnUpgrade();
    error StackTooLong();
    error FeeTooHigh();
    error BadItem();

    constructor(address usdc_, address arcircle_, address operator_, address feeTo_) Ownable(msg.sender) {
        if (usdc_ == address(0) || arcircle_ == address(0) || feeTo_ == address(0)) revert BadToken();
        usdc = IERC20(usdc_);
        arcircle = IERC20(arcircle_);
        operator = operator_;
        feeTo = feeTo_;
    }

    // ---------------- mines ----------------

    /// @notice Open a mine: deposit `amount` of `token` to be mined over `days_` days, starting
    ///         `startDelay` seconds from now. The deposit can never come back to you.
    function openMine(address token, uint256 amount, uint64 days_, uint64 startDelay) external nonReentrant returns (uint256 id) {
        if (token == address(0) || token == address(usdc)) revert BadToken();
        if (amount == 0) revert ZeroAmount();
        if (days_ < MIN_DAYS || days_ > MAX_DAYS) revert BadDuration();
        if (startDelay > MAX_START_DELAY) revert BadDelay();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 got = IERC20(token).balanceOf(address(this)) - before;
        if (got == 0 || got > type(uint128).max) revert ZeroAmount();
        uint64 start = uint64(block.timestamp) + startDelay;
        uint64 end = start + days_ * 1 days;
        id = _mines.length;
        _mines.push(Mine({ token: token, creator: msg.sender, deposited: uint128(got), rootTotal: 0, claimed: 0, burned: 0, start: start, end: end,
            root: bytes32(0), builders: 0, rootCount: 0, unminedBurned: false, closed: false }));
        _byToken[token].push(id);
        emit MineOpened(id, token, msg.sender, got, start, end);
    }

    /// @notice Join a mine as a builder: pays the entry fee in USDC (approve it first).
    ///         `referrer` counts only if they already joined this mine.
    function join(uint256 id, address referrer) external nonReentrant {
        Mine storage m = _get(id);
        if (block.timestamp >= m.end) revert Ended();
        if (joined[id][msg.sender]) revert AlreadyJoined();
        joined[id][msg.sender] = true;
        m.builders += 1;
        address ref = referrer != msg.sender && joined[id][referrer] ? referrer : address(0);
        if (ref != address(0)) referrerOf[id][msg.sender] = ref;
        uint256 fee = joinFee;
        if (fee > 0) usdc.safeTransferFrom(msg.sender, feeTo, fee);
        emit Joined(id, msg.sender, ref, fee);
    }

    /// @notice The most that can have been mined in mine `id` by time `t` (the halving schedule).
    function emittedAt(uint256 id, uint256 t) public view returns (uint256) {
        Mine storage m = _get(id);
        return _emitted(m.deposited, m.start, m.end, t);
    }

    function _emitted(uint256 total, uint256 start, uint256 end, uint256 t) private pure returns (uint256) {
        if (t <= start) return 0;
        if (t >= end) return total;
        uint256 layerLen = (end - start) / LAYERS;
        uint256 elapsed = t - start;
        uint256 k = elapsed / layerLen;
        if (k >= LAYERS) return total;
        uint256 doneParts = 64 - (uint256(1) << (LAYERS - k)); // 32 + 16 + … for the k layers above
        uint256 w = uint256(1) << (LAYERS - 1 - k);
        uint256 num = doneParts * layerLen + w * (elapsed - k * layerLen);
        return (total * num) / (PARTS * layerLen);
    }

    // ---------------- roots & claims ----------------

    /// @notice The operator posts the newest cumulative amounts. They can only grow, never pass
    ///         the schedule or the deposit, and stop three days after the mine ends.
    function postRoot(uint256 id, bytes32 root, uint256 total) external {
        if (msg.sender != operator) revert NotOperator();
        Mine storage m = _get(id);
        if (block.timestamp < m.start) revert NotStarted();
        if (block.timestamp > uint256(m.end) + FINAL_WINDOW || m.unminedBurned) revert TooLate();
        if (total < m.rootTotal) revert RootShrinks();
        if (total > _emitted(m.deposited, m.start, m.end, block.timestamp)) revert OverSchedule();
        if (total > m.deposited) revert OverDeposit();
        m.root = root;
        m.rootTotal = uint128(total);
        m.rootCount += 1;
        emit RootPosted(id, root, total, m.rootCount);
    }

    /// @notice Pay `account` what it mined in `id` and hasn't claimed yet. Anyone may submit.
    function claim(uint256 id, address account, uint256 cumulative, bytes32[] calldata proof) external nonReentrant {
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
        if (!m.unminedBurned) {
            m.unminedBurned = true;
            uint256 un = uint256(m.deposited) - m.rootTotal;
            if (un > 0) { m.burned += uint128(un); IERC20(m.token).safeTransfer(DEAD, un); emit Burned(id, un, false); }
        }
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
        if (cost > 0) { arcircle.safeTransferFrom(msg.sender, DEAD, cost); arcircleBurned += cost; }
        emit ItemBought(mineId, msg.sender, itemId, cost, it.tier, it.boost, until);
    }

    // ---------------- owner: settings only (never a mine's tokens) ----------------

    function setItem(uint256 itemId, uint128 price, uint8 tier, uint8 boost, uint32 duration, bool active) external onlyOwner {
        if (tier > 0 ? (boost != 0 || tier > 5) : (boost == 0 || boost > BOOST_KINDS || duration == 0 || duration > MAX_BOOST_STACK)) revert BadItem();
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
    function setFeeTo(address f) external onlyOwner { if (f == address(0)) revert BadToken(); feeTo = f; emit FeeToSet(f); }
    function setJoinFee(uint256 fee) external onlyOwner { if (fee > MAX_JOIN_FEE) revert FeeTooHigh(); joinFee = fee; emit JoinFeeSet(fee); }

    // ---------------- views ----------------

    function mineCount() external view returns (uint256) { return _mines.length; }
    function getMine(uint256 id) external view returns (Mine memory) { return _get(id); }
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

    function _get(uint256 id) private view returns (Mine storage) {
        if (id >= _mines.length) revert UnknownMine();
        return _mines[id];
    }
}
