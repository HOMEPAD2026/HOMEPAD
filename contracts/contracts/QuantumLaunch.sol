// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Quantum Launch — an ArcPad launch with no snipers
/// @notice A coin is announced first and launched later. While it's "in superposition" (a window of 30 seconds to an
///         hour) anyone can commit USDC to it. When the window ends anyone can "collapse" it: one transaction launches
///         the coin on ArcPad (HomepadFactoryArc) and spends every committed USDC in a single buy from the coin's
///         brand-new pool. Everyone who committed gets the same price — their share of the tokens is exactly their
///         share of the USDC — so being first by a block, a bot or a private RPC buys nothing. The coin's pool doesn't
///         exist until the collapse, so nobody can buy ahead of the batch.
///
///         · No owner, no admin, no upgrade. The batch holds only what was committed (and the 1 USDC launch fee the
///           creator paid up front) until the collapse, then only what its committers haven't claimed yet.
///         · If nobody collapses within a day of the window's end (or the launch can't go through), every committer
///           takes their USDC back and the creator their launch fee.
///         · The creator can call the launch off before the window ends (everyone is refunded).
///         · On ArcPad the launching address is the coin's creator, so this batch is the creator of record: the
///           creator's trading fees come here and anyone can forward them to the real creator with sweep(). The
///           creator's cut of the batch's own buy stays with the committers (it's counted as tokens they bought).
///
///         Native USDC and the USDC ERC-20 (0x3600…) are one balance on Arc. Commits are ERC-20 transfers (6 decimals);
///         the launch fee is native (18 decimals) and is only ever moved as msg.value or a native refund to the creator.

interface IArcPadFactoryQL {
    struct LaunchMeta {
        string imageUrl;
        string description;
        string twitter;
        string telegram;
        string discord;
        string website;
    }
    function LAUNCH_FEE() external view returns (uint256);
    function MAX_EXTRA_FEE_BPS() external view returns (uint16);
    function launch(string calldata name_, string calldata symbol_, address quoteToken_, uint256 initialVirtualQuote_, uint16 extraFeeBps_, LaunchMeta calldata meta_) external payable returns (address);
    function launchAndBuy(string calldata name_, string calldata symbol_, address quoteToken_, uint256 initialVirtualQuote_, uint16 extraFeeBps_, LaunchMeta calldata meta_, uint256 devBuyQuote) external payable returns (address);
}

contract QuantumBatch is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { Open, Collapsed, Refunding }

    uint256 public constant GRACE = 1 days;      // after the window: time to collapse before refunds open
    uint256 public constant MIN_COMMIT = 100_000; // 0.10 USDC (6 decimals)

    IArcPadFactoryQL public immutable factory;
    IERC20 public immutable usdc;
    QuantumPad public immutable pad;
    address public immutable creator;
    uint256 public immutable launchFee;           // native units (18 decimals)
    uint256 public immutable initialVirtualQuote;
    uint256 public immutable maxPerWallet;        // USDC (6 decimals), 0 = no cap
    uint64 public immutable openedAt;
    uint64 public immutable endsAt;
    uint16 public immutable extraFeeBps;

    string public name;
    string public symbol;
    IArcPadFactoryQL.LaunchMeta internal meta_;

    State public state;
    bool public feeRefunded;
    address public token;
    uint256 public totalCommitted;
    uint256 public committers;
    uint256 public tokensBought;      // everything the collapse's buy delivered
    uint256 public usdcLeft;          // committed USDC the buy didn't spend (returned pro rata)
    uint256 public tokensClaimed;
    uint256 public usdcLeftClaimed;
    uint256 public claimedCount;
    mapping(address => uint256) public committed;
    mapping(address => bool) public claimed;

    event Committed(address indexed user, uint256 amount, uint256 userTotal, uint256 total);
    event Uncommitted(address indexed user, uint256 amount, uint256 userTotal, uint256 total);
    event Collapsed(address indexed token, uint256 totalCommitted, uint256 tokensBought, uint256 usdcLeft, address indexed by);
    event Claimed(address indexed user, uint256 tokens, uint256 usdc);
    event Refunded(address indexed user, uint256 amount);
    event Cancelled();
    event FeeRefunded(uint256 amount);
    event Swept(address indexed asset, address indexed to, uint256 amount);

    constructor(
        IArcPadFactoryQL factory_, IERC20 usdc_, address creator_, string memory name__, string memory symbol__,
        uint256 initialVirtualQuote_, uint16 extraFeeBps_, IArcPadFactoryQL.LaunchMeta memory m, uint64 window, uint256 maxPerWallet_
    ) payable {
        factory = factory_;
        usdc = usdc_;
        pad = QuantumPad(msg.sender);
        creator = creator_;
        launchFee = msg.value;
        name = name__;
        symbol = symbol__;
        initialVirtualQuote = initialVirtualQuote_;
        extraFeeBps = extraFeeBps_;
        meta_ = m;
        maxPerWallet = maxPerWallet_;
        openedAt = uint64(block.timestamp);
        endsAt = uint64(block.timestamp) + window;
    }

    // ---------------------------------------------------------------- superposition
    /// @notice Commit `amount` USDC (6 decimals; approve this batch first). Allowed until the window ends.
    function commit(uint256 amount) external nonReentrant {
        require(state == State.Open && block.timestamp < endsAt, "window closed");
        require(amount >= MIN_COMMIT, "min 0.10 USDC");
        uint256 before = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 got = usdc.balanceOf(address(this)) - before;
        require(got > 0, "nothing received");
        uint256 mine = committed[msg.sender];
        if (mine == 0) committers += 1;
        mine += got;
        require(maxPerWallet == 0 || mine <= maxPerWallet, "over the per-wallet cap");
        committed[msg.sender] = mine;
        totalCommitted += got;
        emit Committed(msg.sender, got, mine, totalCommitted);
    }

    /// @notice Take some or all of your commit back while the window is still open.
    function uncommit(uint256 amount) external nonReentrant {
        require(state == State.Open && block.timestamp < endsAt, "window closed");
        uint256 mine = committed[msg.sender];
        require(amount > 0 && amount <= mine, "more than committed");
        mine -= amount;
        require(mine == 0 || mine >= MIN_COMMIT, "leave at least 0.10 USDC or take it all");
        committed[msg.sender] = mine;
        if (mine == 0) committers -= 1;
        totalCommitted -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Uncommitted(msg.sender, amount, mine, totalCommitted);
    }

    // ---------------------------------------------------------------- collapse
    /// @notice After the window: launch the coin and buy with everything committed, in one transaction. Anyone can.
    function collapse() external nonReentrant returns (address t) {
        require(state == State.Open, "not open");
        require(block.timestamp >= endsAt, "still in superposition");
        require(block.timestamp < uint256(endsAt) + GRACE, "too late: refunds are open");
        state = State.Collapsed;
        uint256 total = totalCommitted;
        if (total > 0) {
            usdc.forceApprove(address(factory), total);
            t = factory.launchAndBuy{value: launchFee}(name, symbol, address(usdc), initialVirtualQuote, extraFeeBps, meta_, total);
            usdc.forceApprove(address(factory), 0);
        } else {
            t = factory.launch{value: launchFee}(name, symbol, address(usdc), initialVirtualQuote, extraFeeBps, meta_);
        }
        require(t != address(0), "no token");
        token = t;
        tokensBought = IERC20(t).balanceOf(address(this));
        // the buy can leave some USDC unspent (a price limit): it's returned to committers pro rata
        usdcLeft = total > 0 ? usdc.balanceOf(address(this)) : 0;
        pad.noteCollapsed(t);
        emit Collapsed(t, total, tokensBought, usdcLeft, msg.sender);
    }

    // ---------------------------------------------------------------- after the collapse
    function _claim(address u) internal returns (bool) {
        uint256 c = committed[u];
        if (c == 0 || claimed[u]) return false;
        claimed[u] = true;
        claimedCount += 1;
        uint256 tk = (tokensBought * c) / totalCommitted;
        uint256 us = usdcLeft == 0 ? 0 : (usdcLeft * c) / totalCommitted;
        tokensClaimed += tk;
        usdcLeftClaimed += us;
        if (tk > 0) IERC20(token).safeTransfer(u, tk);
        if (us > 0) usdc.safeTransfer(u, us);
        emit Claimed(u, tk, us);
        return true;
    }
    /// @notice Your share of the tokens (and of any unspent USDC). Anyone can send it to you with claimFor.
    function claim() external nonReentrant {
        require(state == State.Collapsed, "not collapsed");
        require(_claim(msg.sender), "nothing to claim");
    }
    /// @notice Send many committers their shares (gas on the caller; tokens only go to the committers).
    function claimFor(address[] calldata users) external nonReentrant returns (uint256 n) {
        require(state == State.Collapsed, "not collapsed");
        for (uint256 i = 0; i < users.length; i++) if (_claim(users[i])) n++;
    }

    // ---------------------------------------------------------------- if it never collapses
    function _toRefunding() internal {
        if (state == State.Open && block.timestamp >= uint256(endsAt) + GRACE) state = State.Refunding;
        require(state == State.Refunding, "no refunds");
    }
    function _refund(address u) internal returns (bool) {
        uint256 c = committed[u];
        if (c == 0) return false;
        committed[u] = 0;
        usdc.safeTransfer(u, c);
        emit Refunded(u, c);
        return true;
    }
    /// @notice Your USDC back — once the launch is called off, or a day after the window if nobody collapsed it.
    function refund() external nonReentrant {
        _toRefunding();
        require(_refund(msg.sender), "nothing to refund");
    }
    function refundFor(address[] calldata users) external nonReentrant returns (uint256 n) {
        _toRefunding();
        for (uint256 i = 0; i < users.length; i++) if (_refund(users[i])) n++;
    }
    /// @notice The creator's 1 USDC launch fee back, once refunds are open.
    function refundFee() external nonReentrant {
        _toRefunding();
        require(!feeRefunded, "already refunded");
        feeRefunded = true;
        (bool ok, ) = creator.call{value: launchFee}("");
        require(ok, "fee refund failed");
        emit FeeRefunded(launchFee);
    }
    /// @notice The creator calls the launch off before the window ends: everyone is refunded, the fee goes back.
    function cancel() external nonReentrant {
        require(msg.sender == creator, "only the creator");
        require(state == State.Open && block.timestamp < endsAt, "window closed");
        state = State.Refunding;
        emit Cancelled();
        feeRefunded = true;
        (bool ok, ) = creator.call{value: launchFee}("");
        require(ok, "fee refund failed");
        emit FeeRefunded(launchFee);
    }

    // ---------------------------------------------------------------- the creator's trading fees
    /// @notice Forward what this batch holds beyond what its committers are owed to the creator — the creator's
    ///         share of the coin's trading fees (in the coin and in USDC). Anyone can call it.
    function sweep(address asset) external nonReentrant returns (uint256 amount) {
        require(state == State.Collapsed, "not collapsed");
        uint256 bal = IERC20(asset).balanceOf(address(this));
        uint256 reserved;
        if (claimedCount < committers) {
            if (asset == token) reserved = tokensBought - tokensClaimed;
            else if (asset == address(usdc)) reserved = usdcLeft - usdcLeftClaimed;
        }
        if (bal <= reserved) return 0;
        amount = bal - reserved;
        IERC20(asset).safeTransfer(creator, amount);
        emit Swept(asset, creator, amount);
    }

    // ---------------------------------------------------------------- views
    function meta() external view returns (IArcPadFactoryQL.LaunchMeta memory) { return meta_; }
    /// @notice Everything the page needs in one call; `u` may be zero.
    function info(address u) external view returns (
        uint8 state_, uint64 openedAt_, uint64 endsAt_, uint256 total, uint256 committers_, uint256 maxPerWallet_,
        address token_, uint256 tokensBought_, uint256 usdcLeft_, uint256 mine, bool claimed_, uint256 myTokens, address creator_
    ) {
        state_ = uint8(state);
        if (state == State.Open && block.timestamp >= uint256(endsAt) + GRACE) state_ = uint8(State.Refunding);
        mine = committed[u];
        myTokens = state == State.Collapsed && totalCommitted > 0 ? (tokensBought * mine) / totalCommitted : 0;
        return (state_, openedAt, endsAt, totalCommitted, committers, maxPerWallet, token, tokensBought, usdcLeft, mine, claimed[u], myTokens, creator);
    }

    receive() external payable {}
}

/// @title QuantumPad — opens Quantum Launches and keeps their list
contract QuantumPad {
    IArcPadFactoryQL public immutable factory;
    IERC20 public immutable usdc;
    uint64 public constant MIN_WINDOW = 30;
    uint64 public constant MAX_WINDOW = 3600;

    address[] public batches;
    mapping(address => bool) public isBatch;
    mapping(address => address) public batchOfToken;
    mapping(address => address[]) internal byCreator;

    event Opened(address indexed batch, address indexed creator, string name, string symbol, uint64 endsAt, uint256 maxPerWallet);
    event CollapsedTo(address indexed batch, address indexed token);

    constructor(IArcPadFactoryQL factory_, IERC20 usdc_) {
        factory = factory_;
        usdc = usdc_;
    }

    /// @notice Announce a coin. Send the ArcPad launch fee (1 USDC, native) with it; anything above is refunded.
    function open(
        string calldata name_, string calldata symbol_, uint256 initialVirtualQuote_, uint16 extraFeeBps_,
        IArcPadFactoryQL.LaunchMeta calldata m, uint64 window, uint256 maxPerWallet
    ) external payable returns (address batch) {
        require(window >= MIN_WINDOW && window <= MAX_WINDOW, "window: 30 s to 1 h");
        require(bytes(name_).length > 0 && bytes(name_).length <= 64, "name");
        require(bytes(symbol_).length > 0 && bytes(symbol_).length <= 16, "symbol");
        require(initialVirtualQuote_ > 0, "initialVirtualQuote = 0");
        require(extraFeeBps_ <= factory.MAX_EXTRA_FEE_BPS(), "extra fee too high");
        require(maxPerWallet == 0 || maxPerWallet >= QuantumBatchConsts.MIN_COMMIT, "cap below the minimum commit");
        uint256 fee = factory.LAUNCH_FEE();
        require(msg.value >= fee, "send the 1 USDC launch fee");
        batch = address(new QuantumBatch{value: fee}(factory, usdc, msg.sender, name_, symbol_, initialVirtualQuote_, extraFeeBps_, m, window, maxPerWallet));
        isBatch[batch] = true;
        batches.push(batch);
        byCreator[msg.sender].push(batch);
        emit Opened(batch, msg.sender, name_, symbol_, uint64(block.timestamp) + window, maxPerWallet);
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "refund failed");
        }
    }

    function noteCollapsed(address token) external {
        require(isBatch[msg.sender], "only a batch");
        batchOfToken[token] = msg.sender;
        emit CollapsedTo(msg.sender, token);
    }

    function count() external view returns (uint256) { return batches.length; }
    /// @notice The newest `n` batches, newest first.
    function latest(uint256 n) external view returns (address[] memory out) {
        uint256 len = batches.length;
        if (n > len) n = len;
        out = new address[](n);
        for (uint256 i = 0; i < n; i++) out[i] = batches[len - 1 - i];
    }
    function ofCreator(address c) external view returns (address[] memory) { return byCreator[c]; }
}

library QuantumBatchConsts {
    uint256 internal constant MIN_COMMIT = 100_000;
}
