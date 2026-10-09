// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80);
}
interface IStakingFund { function fund(uint256 amount) external; }

/// @title ARCIRCLE Perps — a small perpetual-futures market on Arc, paid in USDC (ARCIRCLE PAD utility)
/// @notice NOT AUDITED. Not to be deployed with real money before an external audit.
///
///         Traders go long or short on a few majors (BTC, ETH, SOL) with USDC collateral and low leverage. The other side
///         of every trade is one USDC pool (the LP vault, seeded by the ARCIRCLE PAD treasury): traders' losses and fees
///         go into it, their profits come out of it.
///           • orders are two-step: a trader requests, a keeper executes with a price from after the request (no
///             racing a stale price). A request the keeper doesn't execute within MAX_DELAY can be cancelled for a
///             full refund
///           • prices: the keeper's, each bounded by the market's Chainlink feed on Arc (within maxDevBps of it, and
///             the feed fresh) — a keeper can't move a fill further than that
///           • caps: leverage (never above 50x), position size, open interest per side, and the pool's worst case:
///             every position's profit is capped at `maxProfitBps` of its collateral, and the sum of those caps can't
///             pass `maxUtilBps` of the pool. So the pool can always pay every winner
///           • liquidation when collateral + PnL − fees falls under `maintBps` of the size; the keeper that liquidates
///             gets a small fee, the rest goes to the pool
///           • if a payout ever can't be made in full, the rest waits in a first-in-first-out queue that's paid
///             before anything else, and LP withdrawals stop until it's empty
///           • the pool's gains above its high-water mark are shared: `skimBps` of them goes to the $ARCIRCLE fee burn
///             (buy back and burn) and to veARCIRCLE holders' weekly USDC (ArcircleStaking.fund)
///         The owner sets parameters inside hard caps, adds markets, picks keepers and can pause new positions.
///         Nobody can take traders' collateral or the pool: only LPs withdraw their own shares.
contract ArcPerp {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_LEVERAGE = 50;
    uint256 public constant MAX_FEE_BPS = 50;       // open / close fee cap: 0.5%
    uint256 public constant MAX_BORROW_BPS_H = 10;  // borrow fee cap: 0.1% of the size an hour
    uint256 public constant MAX_DELAY = 180;        // a request not executed within 3 minutes can be cancelled
    uint256 public constant LP_COOLDOWN = 3 days;
    uint256 public constant PRICE_DEC = 1e8;

    IERC20 public immutable usdc; // 6 decimals

    struct Market {
        string name;
        IAggregatorV3 feed;     // Chainlink X / USD on Arc
        uint8 feedDec;
        bool enabled;
        uint16 maxLev;          // ≤ MAX_LEVERAGE
        uint128 maxSize;        // per position, USDC (6 dec)
        uint128 maxOiLong;
        uint128 maxOiShort;
        uint128 oiLong;
        uint128 oiShort;
    }
    struct Position {
        address owner;
        uint8 market;
        bool isLong;
        uint128 collateral;     // USDC
        uint128 size;           // USDC notional
        uint128 entry;          // price, 1e8
        uint64 openedAt;
        uint64 feeAt;           // borrow fee charged up to here
        uint128 cap;            // its profit cap (maxProfitBps of the collateral when it opened)
    }
    struct Order {
        address owner;
        uint8 kind;             // 1 open, 2 close
        uint8 market;
        bool isLong;
        bool done;
        uint128 collateral;     // open: USDC escrowed
        uint128 size;           // open: notional
        uint128 acceptable;     // worst fill price (1e8): long open / short close ≤, short open / long close ≥
        uint64 at;
        uint64 block_;
        uint32 position;        // close: the position
    }
    struct Owed { address to; uint128 amount; }

    address public owner;
    mapping(address => bool) public keeper;
    bool public paused;
    bool public lpOpen;         // anyone may add to the pool (else only the owner)

    uint16 public openFeeBps = 6;
    uint16 public closeFeeBps = 6;
    uint16 public borrowBpsPerHour = 1;
    uint16 public maintBps = 100;        // maintenance: 1% of the size
    uint16 public maxDevBps = 100;       // keeper price within 1% of Chainlink
    uint32 public maxFeedAge = 26 hours; // the feeds' heartbeat is 24 h (they also update on a 0.5% move)
    uint16 public maxPriceAge = 15;      // a keeper price at most 15 s old
    uint32 public maxProfitBps = 90000;  // a position's profit is capped at 9× its collateral
    uint16 public maxUtilBps = 8000;     // the sum of those caps ≤ 80% of the pool
    uint128 public execFee = 0.2e6;      // per request, to the keeper that executes it
    uint128 public liqFee = 2e6;         // to the keeper that liquidates (at most what's left)
    uint128 public minCollateral = 5e6;

    // the pool
    uint256 public poolAmount;           // USDC that belongs to LPs
    uint256 public reserved;             // the sum of open positions' profit caps
    uint256 public totalShares;
    mapping(address => uint256) public shares;
    mapping(address => uint256) public lastDeposit;
    uint256 public hwm;                  // high-water mark: pool USDC per whole share (1e18 share units), 1e18 = 1 USDC
    uint16 public skimBps = 5000;        // half of the pool's gains above the mark
    uint16 public burnShareBps = 5000;   // of a skim: this much to the fee burn, the rest to veARCIRCLE
    address public feeBurn;
    address public staking;

    Market[] internal _markets;
    Position[] internal _positions;      // ids from 1
    Order[] internal _orders;            // ids from 1
    Owed[] internal _queue;
    uint256 public queueHead;
    uint256 public owedTotal;
    uint256 public escrow;               // collateral + exec fees of pending orders, and open positions' collateral
    mapping(address => uint32[]) internal _userPositions;
    mapping(address => uint32[]) internal _userOrders;

    event MarketAdded(uint256 indexed id, string name, address feed);
    event MarketSet(uint256 indexed id, bool enabled, uint16 maxLev, uint128 maxSize, uint128 maxOiLong, uint128 maxOiShort);
    event OrderRequested(uint256 indexed id, address indexed owner, uint8 kind, uint8 market, bool isLong, uint128 collateral, uint128 size, uint128 acceptable, uint32 position);
    event OrderCancelled(uint256 indexed id, string why);
    event Opened(uint256 indexed position, uint256 indexed order, address indexed owner, uint8 market, bool isLong, uint128 collateral, uint128 size, uint128 price, uint256 fee);
    event Closed(uint256 indexed position, address indexed owner, uint128 price, int256 pnl, uint256 fees, uint256 paid, bool liquidated);
    event Queued(address indexed to, uint256 amount);
    event QueuePaid(address indexed to, uint256 amount);
    event Deposit(address indexed lp, uint256 amount, uint256 shares);
    event Withdraw(address indexed lp, uint256 amount, uint256 shares);
    event Skim(uint256 toBurn, uint256 toStakers);
    event Params();
    event KeeperSet(address indexed who, bool on);
    event OwnerSet(address indexed owner);
    event Paused(bool on);

    error NotOwner();
    error NotKeeper();
    error IsPaused();
    error Bad();
    error TooSmall();
    error TooBig();
    error OverOi();
    error OverUtil();
    error NotYours();
    error TooEarly();
    error Done();
    error StalePrice();
    error PriceOff();
    error QueueFirst();
    error Cooldown();
    error Reentrant();

    uint256 private _lock = 1;
    modifier nonReentrant() { if (_lock != 1) revert Reentrant(); _lock = 2; _; _lock = 1; }
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyKeeper() { if (!keeper[msg.sender]) revert NotKeeper(); _; }

    constructor(IERC20 usdc_, address owner_, address keeper_, address feeBurn_, address staking_) {
        if (address(usdc_) == address(0) || owner_ == address(0) || keeper_ == address(0) || feeBurn_ == address(0)) revert Bad();
        usdc = usdc_;
        owner = owner_;
        keeper[keeper_] = true;
        feeBurn = feeBurn_;
        staking = staking_;
        hwm = 1e18;
        _positions.push();
        _orders.push();
        emit OwnerSet(owner_);
        emit KeeperSet(keeper_, true);
    }

    // ================================================================ views
    function marketCount() external view returns (uint256) { return _markets.length; }
    function market(uint256 id) external view returns (Market memory) { return _markets[id]; }
    function position(uint256 id) external view returns (Position memory) { return _positions[id]; }
    function order(uint256 id) external view returns (Order memory) { return _orders[id]; }
    function positionCount() external view returns (uint256) { return _positions.length - 1; }
    function orderCount() external view returns (uint256) { return _orders.length - 1; }
    function queueLength() external view returns (uint256) { return _queue.length - queueHead; }
    /// a trader's positions and orders (ids, oldest first; closed ones included — check size / done)
    function positionsOf(address who) external view returns (uint32[] memory) { return _userPositions[who]; }
    function ordersOf(address who) external view returns (uint32[] memory) { return _userOrders[who]; }
    /// pool USDC per whole share (1e18 share units), scaled to 1e18 = 1 USDC; 1e18 when empty
    function sharePrice() public view returns (uint256) { return totalShares == 0 ? 1e18 : (poolAmount * 1e30) / totalShares; }
    /// what an LP could withdraw now (its shares' value, less what the pool must keep for open positions)
    function lpValue(address lp) external view returns (uint256) { return totalShares == 0 ? 0 : (shares[lp] * poolAmount) / totalShares; }
    /// a position's PnL at `price` (1e8), before fees, capped at its profit cap
    function pnlAt(uint256 id, uint256 price) public view returns (int256) {
        Position storage p = _positions[id];
        if (p.size == 0) return 0;
        int256 d = int256(price) - int256(uint256(p.entry));
        int256 pnl = (int256(uint256(p.size)) * d) / int256(uint256(p.entry));
        if (!p.isLong) pnl = -pnl;
        int256 cap = int256(uint256(p.cap));
        return pnl > cap ? cap : pnl;
    }
    function borrowFee(uint256 id) public view returns (uint256) {
        Position storage p = _positions[id];
        if (p.size == 0) return 0;
        return (uint256(p.size) * borrowBpsPerHour * (block.timestamp - p.feeAt)) / (10_000 * 3600);
    }
    /// liquidation price (1e8) of a position with its fees so far
    function liqPrice(uint256 id) external view returns (uint256) {
        Position storage p = _positions[id];
        if (p.size == 0) return 0;
        uint256 keep = (uint256(p.size) * maintBps) / 10_000 + borrowFee(id) + (uint256(p.size) * closeFeeBps) / 10_000;
        if (keep >= p.collateral) return p.entry;
        uint256 room = ((uint256(p.collateral) - keep) * uint256(p.entry)) / uint256(p.size);
        return p.isLong ? (room >= p.entry ? 0 : uint256(p.entry) - room) : uint256(p.entry) + room;
    }
    /// Chainlink's price for a market, in 1e8, and when it was updated
    function feedPrice(uint256 m) public view returns (uint256 price, uint256 updatedAt) {
        Market storage k = _markets[m];
        (, int256 a,, uint256 u,) = k.feed.latestRoundData();
        if (a <= 0) revert StalePrice();
        price = k.feedDec >= 8 ? uint256(a) / 10 ** (k.feedDec - 8) : uint256(a) * 10 ** (8 - k.feedDec);
        updatedAt = u;
    }

    // ================================================================ traders
    /// Ask to open a position: `collateral` USDC (plus the execution fee) is taken now; a keeper opens it at a price
    /// from after this request, no worse than `acceptable` (1e8). Approve first.
    function requestOpen(uint8 m, bool isLong, uint128 collateral, uint16 leverage, uint128 acceptable) external nonReentrant returns (uint256 id) {
        if (paused) revert IsPaused();
        Market storage k = _market(m);
        if (!k.enabled) revert IsPaused();
        if (collateral < minCollateral) revert TooSmall();
        if (leverage < 1 || leverage > k.maxLev) revert Bad();
        uint256 size = uint256(collateral) * leverage;
        if (size > k.maxSize) revert TooBig();
        usdc.safeTransferFrom(msg.sender, address(this), uint256(collateral) + execFee);
        escrow += uint256(collateral) + execFee;
        id = _orders.length;
        _orders.push(Order({ owner: msg.sender, kind: 1, market: m, isLong: isLong, done: false, collateral: collateral, size: uint128(size), acceptable: acceptable,
            at: uint64(block.timestamp), block_: uint64(block.number), position: 0 }));
        _userOrders[msg.sender].push(uint32(id));
        emit OrderRequested(id, msg.sender, 1, m, isLong, collateral, uint128(size), acceptable, 0);
    }
    /// Ask to close a position at a price no worse than `acceptable`. The execution fee comes from the position.
    function requestClose(uint32 pid, uint128 acceptable) external nonReentrant returns (uint256 id) {
        Position storage p = _positions[pid];
        if (p.owner != msg.sender || p.size == 0) revert NotYours();
        id = _orders.length;
        _orders.push(Order({ owner: msg.sender, kind: 2, market: p.market, isLong: p.isLong, done: false, collateral: 0, size: p.size, acceptable: acceptable,
            at: uint64(block.timestamp), block_: uint64(block.number), position: pid }));
        _userOrders[msg.sender].push(uint32(id));
        emit OrderRequested(id, msg.sender, 2, p.market, p.isLong, 0, p.size, acceptable, pid);
    }
    /// A request the keeper hasn't executed within MAX_DELAY: cancel it (an open gets its USDC back in full).
    function cancel(uint256 id) external nonReentrant {
        Order storage o = _orders[id];
        if (o.owner != msg.sender) revert NotYours();
        if (o.done) revert Done();
        if (block.timestamp < uint256(o.at) + MAX_DELAY) revert TooEarly();
        _cancel(id, "cancelled by trader", true);
    }

    // ================================================================ keepers
    /// Execute requests at `prices` (1e8, one per request) observed at `priceTime`. Each price must be no older than
    /// the request, fresh, and within maxDevBps of the market's Chainlink feed; a request that can't fill at its
    /// acceptable price (or no longer fits the caps) is cancelled and refunded.
    function execute(uint256[] calldata ids, uint256[] calldata prices, uint256 priceTime) external nonReentrant onlyKeeper {
        if (ids.length != prices.length) revert Bad();
        if (priceTime > block.timestamp || block.timestamp - priceTime > maxPriceAge) revert StalePrice();
        for (uint256 i; i < ids.length; i++) {
            Order storage o = _orders[ids[i]];
            if (o.done || o.owner == address(0)) continue;
            if (priceTime < o.at || block.number <= o.block_) continue; // the price must come after the request
            _checkPrice(o.market, prices[i]);
            if (o.kind == 1) _executeOpen(ids[i], prices[i]);
            else _executeClose(ids[i], prices[i]);
        }
        _payQueue(20);
    }
    /// Liquidate positions whose collateral + PnL − fees is under the maintenance margin at `prices`.
    function liquidate(uint256[] calldata pids, uint256[] calldata prices, uint256 priceTime) external nonReentrant onlyKeeper {
        if (pids.length != prices.length) revert Bad();
        if (priceTime > block.timestamp || block.timestamp - priceTime > maxPriceAge) revert StalePrice();
        for (uint256 i; i < pids.length; i++) {
            Position storage p = _positions[pids[i]];
            if (p.size == 0) continue;
            _checkPrice(p.market, prices[i]);
            if (!_liquidatable(pids[i], prices[i])) continue;
            _close(pids[i], prices[i], true);
        }
        _payQueue(20);
    }
    function liquidatable(uint256 pid, uint256 price) external view returns (bool) { return _positions[pid].size > 0 && _liquidatable(pid, price); }
    /// Pay whoever waits in the queue, oldest first, as far as the pool allows (anyone).
    function payQueue(uint256 n) external nonReentrant { _payQueue(n); }
    /// Share the pool's gains above its high-water mark (anyone; it only ever moves gains above the mark).
    function skim() external nonReentrant returns (uint256 total) {
        if (owedTotal > 0 || totalShares == 0) return 0;
        uint256 sp = sharePrice();
        if (sp <= hwm) return 0;
        uint256 gain = ((sp - hwm) * totalShares) / 1e30;
        total = (gain * skimBps) / 10_000;
        if (total == 0 || poolAmount < reserved + total) return 0;
        poolAmount -= total;
        hwm = sharePrice();
        uint256 toBurn = (total * burnShareBps) / 10_000;
        uint256 toStakers = total - toBurn;
        if (toStakers > 0 && staking != address(0)) {
            usdc.forceApprove(staking, toStakers);
            try IStakingFund(staking).fund(toStakers) {} catch { toBurn += toStakers; toStakers = 0; usdc.forceApprove(staking, 0); }
        } else { toBurn += toStakers; toStakers = 0; }
        if (toBurn > 0) usdc.safeTransfer(feeBurn, toBurn);
        emit Skim(toBurn, toStakers);
    }

    // ================================================================ LPs
    function deposit(uint256 amount) external nonReentrant returns (uint256 s) {
        if (!lpOpen && msg.sender != owner) revert NotOwner();
        if (amount == 0) revert TooSmall();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        // the first deposit (or one into an emptied pool) sets 1 share = 1 USDC
        bool first = totalShares == 0 || poolAmount == 0;
        s = first ? amount * 1e12 : (amount * totalShares) / poolAmount;
        if (s == 0) revert TooSmall();
        totalShares += s;
        poolAmount += amount;
        if (first) hwm = sharePrice();
        shares[msg.sender] += s;
        lastDeposit[msg.sender] = block.timestamp;
        emit Deposit(msg.sender, amount, s);
    }
    function withdraw(uint256 s) external nonReentrant returns (uint256 amount) {
        if (s == 0 || s > shares[msg.sender]) revert Bad();
        if (owedTotal > 0) revert QueueFirst();
        if (block.timestamp < lastDeposit[msg.sender] + LP_COOLDOWN) revert Cooldown();
        amount = (s * poolAmount) / totalShares;
        if (poolAmount - amount < (reserved * 10_000) / maxUtilBps) revert OverUtil(); // keep the open positions covered
        shares[msg.sender] -= s;
        totalShares -= s;
        poolAmount -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, s);
    }

    // ================================================================ owner
    function addMarket(string calldata name, IAggregatorV3 feed, uint16 maxLev, uint128 maxSize, uint128 maxOiLong, uint128 maxOiShort) external onlyOwner returns (uint256 id) {
        if (address(feed) == address(0) || maxLev == 0 || maxLev > MAX_LEVERAGE || _markets.length >= 255) revert Bad();
        id = _markets.length;
        _markets.push();
        Market storage k = _markets[id];
        k.name = name; k.feed = feed; k.feedDec = feed.decimals();
        (k.enabled, k.maxLev, k.maxSize, k.maxOiLong, k.maxOiShort) = (true, maxLev, maxSize, maxOiLong, maxOiShort);
        emit MarketAdded(id, name, address(feed));
        emit MarketSet(id, true, maxLev, maxSize, maxOiLong, maxOiShort);
    }
    function setMarket(uint8 m, bool enabled, uint16 maxLev, uint128 maxSize, uint128 maxOiLong, uint128 maxOiShort) external onlyOwner {
        if (maxLev == 0 || maxLev > MAX_LEVERAGE) revert Bad();
        Market storage k = _market(m);
        (k.enabled, k.maxLev, k.maxSize, k.maxOiLong, k.maxOiShort) = (enabled, maxLev, maxSize, maxOiLong, maxOiShort);
        emit MarketSet(m, enabled, maxLev, maxSize, maxOiLong, maxOiShort);
    }
    function setFees(uint16 openBps, uint16 closeBps, uint16 borrowH, uint128 exec, uint128 liq) external onlyOwner {
        if (openBps > MAX_FEE_BPS || closeBps > MAX_FEE_BPS || borrowH > MAX_BORROW_BPS_H || exec > 2e6 || liq > 20e6) revert Bad();
        (openFeeBps, closeFeeBps, borrowBpsPerHour, execFee, liqFee) = (openBps, closeBps, borrowH, exec, liq);
        emit Params();
    }
    function setRisk(uint16 maint, uint16 dev, uint32 feedAge, uint16 priceAge, uint32 profitBps, uint16 utilBps, uint128 minColl) external onlyOwner {
        if (maint < 50 || maint > 1000 || dev == 0 || dev > 300 || feedAge > 2 days || priceAge == 0 || priceAge > 60 || profitBps < 10_000 || profitBps > 200_000 || utilBps == 0 || utilBps > 10_000 || minColl == 0) revert Bad();
        (maintBps, maxDevBps, maxFeedAge, maxPriceAge, maxProfitBps, maxUtilBps, minCollateral) = (maint, dev, feedAge, priceAge, profitBps, utilBps, minColl);
        emit Params();
    }
    function setSkim(uint16 skim_, uint16 burnShare, address feeBurn_, address staking_) external onlyOwner {
        if (skim_ > 10_000 || burnShare > 10_000 || feeBurn_ == address(0)) revert Bad();
        (skimBps, burnShareBps, feeBurn, staking) = (skim_, burnShare, feeBurn_, staking_);
        emit Params();
    }
    function setKeeper(address who, bool on) external onlyOwner { keeper[who] = on; emit KeeperSet(who, on); }
    function setPaused(bool on) external onlyOwner { paused = on; emit Paused(on); }
    function setLpOpen(bool on) external onlyOwner { lpOpen = on; emit Params(); }
    function setOwner(address o) external onlyOwner { if (o == address(0)) revert Bad(); owner = o; emit OwnerSet(o); }

    // ================================================================ internal
    function _market(uint8 m) internal view returns (Market storage) { if (m >= _markets.length) revert Bad(); return _markets[m]; }
    function _checkPrice(uint8 m, uint256 price) internal view {
        (uint256 cl, uint256 at) = feedPrice(m);
        if (block.timestamp > at + maxFeedAge) revert StalePrice();
        uint256 d = price > cl ? price - cl : cl - price;
        if (price == 0 || d * 10_000 > cl * maxDevBps) revert PriceOff();
    }
    function _cancel(uint256 id, string memory why, bool refundExec) internal {
        Order storage o = _orders[id];
        o.done = true;
        if (o.kind == 1) {
            uint256 back = uint256(o.collateral) + (refundExec ? execFee : 0);
            escrow -= uint256(o.collateral) + execFee;
            if (!refundExec) usdc.safeTransfer(msg.sender, execFee); // the keeper still gets paid for trying
            usdc.safeTransfer(o.owner, back);
        }
        emit OrderCancelled(id, why);
    }
    function _executeOpen(uint256 id, uint256 price) internal {
        Order storage o = _orders[id];
        Market storage k = _markets[o.market];
        if (paused || !k.enabled) { _cancel(id, "paused", false); return; }
        if (o.isLong ? price > o.acceptable : price < o.acceptable) { _cancel(id, "price moved", false); return; }
        uint256 liab = (uint256(o.collateral) * maxProfitBps) / 10_000;
        if (reserved + liab > (poolAmount * maxUtilBps) / 10_000) { _cancel(id, "pool full", false); return; }
        if (o.isLong ? uint256(k.oiLong) + o.size > k.maxOiLong : uint256(k.oiShort) + o.size > k.maxOiShort) { _cancel(id, "open interest full", false); return; }
        uint256 fee = (uint256(o.size) * openFeeBps) / 10_000;
        if (fee >= o.collateral) { _cancel(id, "too small", false); return; }
        o.done = true;
        escrow -= execFee; // the rest of the escrow stays as the position's collateral
        usdc.safeTransfer(msg.sender, execFee);
        uint128 coll = o.collateral - uint128(fee);
        escrow -= fee;
        poolAmount += fee;
        // the cap is on the collateral after the fee
        uint128 cap = uint128((uint256(coll) * maxProfitBps) / 10_000);
        reserved += cap;
        if (o.isLong) k.oiLong += o.size; else k.oiShort += o.size;
        uint256 pid = _positions.length;
        _positions.push(Position({ owner: o.owner, market: o.market, isLong: o.isLong, collateral: coll, size: o.size, entry: uint128(price),
            openedAt: uint64(block.timestamp), feeAt: uint64(block.timestamp), cap: cap }));
        _userPositions[o.owner].push(uint32(pid));
        emit Opened(pid, id, o.owner, o.market, o.isLong, coll, o.size, uint128(price), fee);
    }
    function _executeClose(uint256 id, uint256 price) internal {
        Order storage o = _orders[id];
        Position storage p = _positions[o.position];
        if (p.size == 0) { o.done = true; emit OrderCancelled(id, "already closed"); return; }
        if (p.isLong ? price < o.acceptable : price > o.acceptable) { o.done = true; emit OrderCancelled(id, "price moved"); return; }
        o.done = true;
        _close(o.position, price, false);
    }
    function _liquidatable(uint256 pid, uint256 price) internal view returns (bool) {
        Position storage p = _positions[pid];
        int256 eq = int256(uint256(p.collateral)) + pnlAt(pid, price) - int256(borrowFee(pid)) - int256((uint256(p.size) * closeFeeBps) / 10_000);
        return eq < int256((uint256(p.size) * maintBps) / 10_000);
    }
    /// settle a position at `price`: its collateral is released, losses and fees go to the pool, profits come from it
    function _close(uint256 pid, uint256 price, bool liq) internal {
        Position storage p = _positions[pid];
        Market storage k = _markets[p.market];
        int256 pnl = pnlAt(pid, price);
        uint256 fees = borrowFee(pid) + (uint256(p.size) * closeFeeBps) / 10_000;
        uint256 coll = p.collateral;
        if (p.isLong) k.oiLong -= p.size; else k.oiShort -= p.size;
        reserved -= p.cap;
        escrow -= coll;
        address to = p.owner;
        p.size = 0;
        int256 out = int256(coll) + pnl - int256(fees);
        uint256 pay;
        if (liq || out <= 0) {
            // all of it to the pool, less the keeper's fee (out of what's left)
            uint256 left = out > 0 ? uint256(out) : 0;
            uint256 kf = left < liqFee ? left : liqFee;
            if (!liq) { kf = 0; pay = left; } // a voluntary close at a loss still returns what's left (here: nothing)
            poolAmount += coll - kf - pay;
            if (kf > 0) usdc.safeTransfer(msg.sender, kf);
        } else {
            pay = uint256(out);
            if (pay >= coll) {
                uint256 profit = pay - coll;
                if (profit <= poolAmount) { poolAmount -= profit; }
                else { uint256 short_ = profit - poolAmount; poolAmount = 0; pay -= short_; _queue.push(Owed(to, uint128(short_))); owedTotal += short_; emit Queued(to, short_); }
            } else {
                poolAmount += coll - pay;
            }
        }
        if (pay > 0) usdc.safeTransfer(to, pay);
        emit Closed(pid, to, uint128(price), pnl, fees, pay, liq);
    }
    function _payQueue(uint256 n) internal {
        while (n > 0 && queueHead < _queue.length && poolAmount > reserved) {
            Owed storage q = _queue[queueHead];
            uint256 room = poolAmount - reserved;
            uint256 a = q.amount <= room ? q.amount : room;
            poolAmount -= a;
            owedTotal -= a;
            q.amount -= uint128(a);
            usdc.safeTransfer(q.to, a);
            emit QueuePaid(q.to, a);
            if (q.amount == 0) queueHead++;
            else break;
            n--;
        }
    }
}
