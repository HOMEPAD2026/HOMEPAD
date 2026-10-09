// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IArcPadFactoryRH {
    function launchIndexOf(address token) external view returns (uint256);
    function launches(uint256 i)
        external
        view
        returns (
            address token,
            address quoteToken,
            uint256 initialVirtualQuote,
            bool quoteIsCurrency0,
            address creator,
            uint256 launchedAt,
            uint16 extraFeeBps,
            string memory imageUrl,
            string memory description,
            string memory twitter,
            string memory telegram,
            string memory discord,
            string memory website
        );
}

/// @title ARCIRCLE Launch Drop vault on Robinhood Chain (ARCIRCLE PAD utility)
/// @notice The Robinhood Chain side of the Launch Drop: every coin launched on ArcPad on Robinhood Chain
///         (ArcPadFactoryRH) gives part of its supply to veARCIRCLE holders, under the same rule as on Arc
///         (contracts/ArcLaunchDrop.sol):
///           • snapshot — a coin's drop belongs to whoever held veARCIRCLE when the week it launched began
///             (Thursday 00:00 UTC)
///           • pro rata — each holder's share is their veARCIRCLE at that moment ÷ all veARCIRCLE at that moment
///         veARCIRCLE lives on Arc, so this chain can't read it. Instead, once per week the poster publishes a Merkle
///         root of every holder's veARCIRCLE at the week's start (leaf = keccak256(keccak256(abi.encode(holder, ve))),
///         OpenZeppelin's standard tree) and their sum. Anyone can rebuild the tree from Arc's public history
///         (ArcircleStaking.balanceOfAt) and check it. A root opens for claims DELAY after it's posted; until then the
///         poster can correct it, after that it is final.
///         The treasury deposits each coin's share once (4% of supply); holders claim with their proof, any time, for
///         as many coins as they like, or anyone sends a holder theirs (claimFor). Tokens only ever go to the holder
///         they belong to. No owner and no way to take deposited tokens out — except that a drop whose week never got
///         a root within RECLAIM_AFTER goes back to the treasury, so nothing can be stuck for good.
contract ArcLaunchDropRH is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WEEK = 7 days;
    uint256 public constant DELAY = 12 hours;
    uint256 public constant RECLAIM_AFTER = 120 days;

    IArcPadFactoryRH public immutable factory;
    uint256 public immutable startWeek;
    address public immutable treasury;
    address public poster;

    struct Root {
        bytes32 root;     // veARCIRCLE at the week's start, one leaf per holder
        uint256 supply;   // the sum of every leaf's veARCIRCLE
        uint64 postedAt;  // claims open at postedAt + DELAY
    }
    struct Drop {
        uint64 week;      // snapshot: start of the week the coin launched
        uint256 amount;   // tokens deposited in total
        uint256 claimed;  // tokens paid out in total
    }
    struct Claim {
        address token;
        uint256 ve;       // the holder's veARCIRCLE at the snapshot (their leaf)
        bytes32[] proof;
    }

    mapping(uint256 => Root) public roots;
    uint256[] public postedWeeks;
    mapping(address => Drop) public drops;
    address[] public tokens;
    mapping(address => mapping(address => uint256)) public paid; // token → holder → tokens paid

    event PosterChanged(address indexed poster);
    event RootPosted(uint256 indexed week, bytes32 root, uint256 supply, uint256 opensAt);
    event DropOpened(address indexed token, uint256 week);
    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Claimed(address indexed token, address indexed holder, uint256 amount, address indexed by);
    event Reclaimed(address indexed token, uint256 amount);

    constructor(IArcPadFactoryRH factory_, uint256 startWeek_, address poster_, address treasury_) {
        require(address(factory_) != address(0) && poster_ != address(0) && treasury_ != address(0), "zero address");
        require(startWeek_ % WEEK == 0, "week");
        factory = factory_;
        startWeek = startWeek_;
        poster = poster_;
        treasury = treasury_;
        emit PosterChanged(poster_);
    }

    // ================================================================ the poster
    function setPoster(address p) external {
        require(msg.sender == poster, "poster only");
        require(p != address(0), "zero address");
        poster = p;
        emit PosterChanged(p);
    }

    /// @notice Publish (or, within DELAY of the last post, correct) the veARCIRCLE tree for the week starting `week`.
    function postRoot(uint256 week, bytes32 root, uint256 supply) external {
        require(msg.sender == poster, "poster only");
        require(week % WEEK == 0 && week >= startWeek, "week");
        require(week <= block.timestamp, "week hasn't started");
        require(root != bytes32(0) && supply > 0, "empty root");
        Root storage r = roots[week];
        if (r.postedAt != 0) require(block.timestamp < uint256(r.postedAt) + DELAY, "root is final");
        else postedWeeks.push(week);
        r.root = root;
        r.supply = supply;
        r.postedAt = uint64(block.timestamp);
        emit RootPosted(week, root, supply, block.timestamp + DELAY);
    }

    // ================================================================ views
    function dropCount() external view returns (uint256) { return tokens.length; }
    function postedCount() external view returns (uint256) { return postedWeeks.length; }

    function isOpen(uint256 week) public view returns (bool) {
        Root storage r = roots[week];
        return r.postedAt != 0 && block.timestamp >= uint256(r.postedAt) + DELAY;
    }

    /// @notice When `token` launched on ArcPad on Robinhood Chain (0 if it isn't one).
    function launchedAt(address token) public view returns (uint256) {
        uint256 idx = factory.launchIndexOf(token);
        if (idx == 0) return 0;
        (address t, , , , , uint256 at, , , , , , , ) = factory.launches(idx - 1);
        return t == token ? at : 0;
    }

    /// @notice The snapshot week a drop of `token` uses.
    function snapshotWeek(address token) public view returns (uint256) {
        uint256 at = launchedAt(token);
        require(at != 0, "not an ArcPad coin");
        uint256 w = (at / WEEK) * WEEK;
        require(w >= startWeek, "launched before Launch Drop");
        return w;
    }

    function leaf(address holder, uint256 ve) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(holder, ve))));
    }

    /// @notice Tokens of `token` that `holder` can claim now, given their leaf and proof (0 if the proof is wrong).
    function claimable(address token, address holder, uint256 ve, bytes32[] calldata proof) public view returns (uint256) {
        Drop storage d = drops[token];
        if (d.amount == 0 || !isOpen(d.week)) return 0;
        Root storage r = roots[d.week];
        if (!MerkleProof.verifyCalldata(proof, r.root, leaf(holder, ve))) return 0;
        uint256 owed = (d.amount * ve) / r.supply;
        uint256 done = paid[token][holder];
        if (owed <= done) return 0;
        uint256 left = d.amount - d.claimed;
        uint256 c = owed - done;
        return c < left ? c : left;
    }

    /// @notice A page of drops with their week's root.
    function page(uint256 from, uint256 n) external view returns (address[] memory list, Drop[] memory info, Root[] memory weekRoots) {
        uint256 len = tokens.length;
        if (from > len) from = len;
        if (n > len - from) n = len - from;
        list = new address[](n);
        info = new Drop[](n);
        weekRoots = new Root[](n);
        for (uint256 i = 0; i < n; i++) {
            address t = tokens[from + i];
            list[i] = t;
            info[i] = drops[t];
            weekRoots[i] = roots[info[i].week];
        }
    }

    // ================================================================ funding
    /// @notice Add `amount` of an ArcPad (Robinhood Chain) coin to its drop (approve first). Any time, more than once.
    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        Drop storage d = _open(token);
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 got = IERC20(token).balanceOf(address(this)) - before;
        require(got > 0, "nothing received");
        d.amount += got;
        emit Deposited(token, msg.sender, got);
    }

    /// @notice Count tokens sent straight to this contract into the coin's drop.
    function sync(address token) external nonReentrant returns (uint256 added) {
        Drop storage d = _open(token);
        uint256 held = IERC20(token).balanceOf(address(this));
        uint256 owed = d.amount - d.claimed;
        require(held > owed, "nothing new");
        added = held - owed;
        d.amount += added;
        emit Deposited(token, address(0), added);
    }

    function _open(address token) internal returns (Drop storage d) {
        d = drops[token];
        if (d.week != 0) return d;
        d.week = uint64(snapshotWeek(token));
        tokens.push(token);
        emit DropOpened(token, d.week);
    }

    /// @notice A drop whose week never got a root within RECLAIM_AFTER goes back to the treasury. Anyone can call it.
    function reclaim(address token) external nonReentrant returns (uint256 amt) {
        Drop storage d = drops[token];
        require(d.week != 0, "no drop");
        require(roots[d.week].postedAt == 0, "week has a root");
        require(block.timestamp > uint256(d.week) + RECLAIM_AFTER, "too early");
        amt = d.amount - d.claimed;
        require(amt > 0, "nothing left");
        d.amount = d.claimed;
        IERC20(token).safeTransfer(treasury, amt);
        emit Reclaimed(token, amt);
    }

    // ================================================================ payout
    /// @notice Claim your share of every coin in `list`.
    function claim(Claim[] calldata list) external nonReentrant returns (uint256 count) {
        for (uint256 i = 0; i < list.length; i++) if (_pay(list[i], msg.sender) > 0) count++;
    }

    /// @notice Send `holder` their share of every coin in `list`. Anyone can call it; tokens go to `holder`.
    function claimFor(address holder, Claim[] calldata list) external nonReentrant returns (uint256 count) {
        for (uint256 i = 0; i < list.length; i++) if (_pay(list[i], holder) > 0) count++;
    }

    function _pay(Claim calldata c, address holder) internal returns (uint256 amt) {
        if (holder == address(0)) return 0;
        amt = claimable(c.token, holder, c.ve, c.proof);
        if (amt == 0) return 0;
        paid[c.token][holder] += amt;
        drops[c.token].claimed += amt;
        IERC20(c.token).safeTransfer(holder, amt);
        emit Claimed(c.token, holder, amt, msg.sender);
    }
}
