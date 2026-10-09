// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVeArcircle {
    function balanceOfAt(address user, uint256 t) external view returns (uint256);
    function totalSupplyAt(uint256 t) external view returns (uint256);
}

interface IArcpadFactory {
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

/// @title ARCIRCLE Launch Drop vault (ARCIRCLE PAD utility)
/// @notice Every coin launched on ArcPad gives part of its supply to veARCIRCLE holders. The ARCIRCLE PAD treasury
///         deposits that share here once per coin (4% of supply: half of the 8% platform allocation); this contract
///         does the rest:
///           • snapshot — the drop for a coin belongs to whoever held veARCIRCLE when the week the coin launched began
///             (Thursday 00:00 UTC). Locking after that moment doesn't count for that coin, so there is nothing to
///             gain by locking just before a deposit
///           • pro rata — each holder's share is their veARCIRCLE at that moment ÷ all veARCIRCLE at that moment.
///             Max (permanent) locks count at their full amount
///           • payout — holders claim any time, for as many coins as they like in one call; anyone may also push a
///             holder's tokens to them (claimFor / pushTo). Tokens only ever go to the holder they belong to
///         Only coins launched by the ArcPad factories set at deployment are accepted, and only those launched from
///         `startWeek` on. Nothing is owned: no admin, no fee, no way to take deposited tokens back out.
contract ArcLaunchDrop is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WEEK = 7 days;

    IVeArcircle public immutable staking;
    uint256 public immutable startWeek;
    address[] internal _factories;

    struct Drop {
        uint64 week;      // snapshot: start of the week the coin launched
        uint256 supply;   // veARCIRCLE at `week`
        uint256 amount;   // tokens deposited in total
        uint256 claimed;  // tokens paid out in total
    }

    mapping(address => Drop) public drops;
    address[] public tokens;
    mapping(address => mapping(address => uint256)) public paid; // token → holder → tokens paid

    event DropOpened(address indexed token, uint256 week, uint256 supply);
    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Claimed(address indexed token, address indexed holder, uint256 amount, address indexed by);

    constructor(IVeArcircle staking_, address[] memory factories_, uint256 startWeek_) {
        require(address(staking_) != address(0), "staking");
        require(factories_.length > 0 && factories_.length <= 4, "factories");
        require(startWeek_ % WEEK == 0, "week");
        for (uint256 i = 0; i < factories_.length; i++) require(factories_[i] != address(0), "factory");
        staking = staking_;
        _factories = factories_;
        startWeek = startWeek_;
    }

    // ================================================================ views
    function factories() external view returns (address[] memory) { return _factories; }
    function dropCount() external view returns (uint256) { return tokens.length; }

    /// @notice When `token` launched on ArcPad (0 if it isn't an ArcPad coin).
    function launchedAt(address token) public view returns (uint256) {
        for (uint256 i = 0; i < _factories.length; i++) {
            IArcpadFactory f = IArcpadFactory(_factories[i]);
            uint256 idx = f.launchIndexOf(token);
            if (idx != 0) {
                (address t, , , , , uint256 at, , , , , , , ) = f.launches(idx - 1);
                if (t == token) return at;
            }
        }
        return 0;
    }

    /// @notice The snapshot week a drop of `token` would use.
    function snapshotWeek(address token) public view returns (uint256) {
        uint256 at = launchedAt(token);
        require(at != 0, "not an ArcPad coin");
        uint256 w = (at / WEEK) * WEEK;
        require(w >= startWeek, "launched before Launch Drop");
        return w;
    }

    /// @notice Tokens of `token` that `holder` can claim now.
    function claimable(address token, address holder) public view returns (uint256) {
        Drop storage d = drops[token];
        if (d.supply == 0) return 0;
        uint256 owed = (d.amount * staking.balanceOfAt(holder, d.week)) / d.supply;
        uint256 done = paid[token][holder];
        if (owed <= done) return 0;
        uint256 left = d.amount - d.claimed;
        uint256 c = owed - done;
        return c < left ? c : left;
    }

    function claimableMany(address holder, address[] calldata list) external view returns (uint256[] memory out) {
        out = new uint256[](list.length);
        for (uint256 i = 0; i < list.length; i++) out[i] = claimable(list[i], holder);
    }

    /// @notice A page of drops, with what `holder` can claim from each (pass address(0) to skip that).
    function page(address holder, uint256 from, uint256 n)
        external
        view
        returns (address[] memory list, Drop[] memory info, uint256[] memory claimables)
    {
        uint256 len = tokens.length;
        if (from > len) from = len;
        if (n > len - from) n = len - from;
        list = new address[](n);
        info = new Drop[](n);
        claimables = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address t = tokens[from + i];
            list[i] = t;
            info[i] = drops[t];
            if (holder != address(0)) claimables[i] = claimable(t, holder);
        }
    }

    // ================================================================ funding
    /// @notice Add `amount` of an ArcPad coin to its drop (approve first). Can be called more than once; every
    ///         deposit goes to the same snapshot.
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

    /// @notice Count tokens that were sent straight to this contract (e.g. by a factory) into the coin's drop.
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
        if (d.supply != 0) return d;
        uint256 w = snapshotWeek(token);
        uint256 s = staking.totalSupplyAt(w);
        require(s > 0, "no veARCIRCLE at snapshot");
        d.week = uint64(w);
        d.supply = s;
        tokens.push(token);
        emit DropOpened(token, w, s);
    }

    // ================================================================ payout
    /// @notice Claim your share of every coin in `list`.
    function claim(address[] calldata list) external nonReentrant returns (uint256 count) {
        for (uint256 i = 0; i < list.length; i++) if (_pay(list[i], msg.sender) > 0) count++;
    }

    /// @notice Send `holder` their share of every coin in `list`. Anyone can call it; tokens go to `holder`.
    function claimFor(address holder, address[] calldata list) external nonReentrant returns (uint256 count) {
        for (uint256 i = 0; i < list.length; i++) if (_pay(list[i], holder) > 0) count++;
    }

    /// @notice Send one coin's drop to many holders at once. Anyone can call it; each holder gets only their share.
    function pushTo(address token, address[] calldata holders) external nonReentrant returns (uint256 total) {
        for (uint256 i = 0; i < holders.length; i++) total += _pay(token, holders[i]);
    }

    function _pay(address token, address holder) internal returns (uint256 amt) {
        if (holder == address(0)) return 0;
        amt = claimable(token, holder);
        if (amt == 0) return 0;
        paid[token][holder] += amt;
        drops[token].claimed += amt;
        IERC20(token).safeTransfer(holder, amt);
        emit Claimed(token, holder, amt, msg.sender);
    }
}
