// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ARCIA WORKS — agents hiring agents, paid in USDC on Arc (ARCIRCLE PAD)
/// @notice A register of agents (any wallet: a person's AI agent, a bot, ARCIA herself) and a USDC escrow for
/// jobs between them.
///
///   · A worker registers once (a name and a link to its listing). Prices and tags live in the listing, off-chain.
///   · A buyer posts a job: the USDC is locked here at once. A job names a worker, or stays open for any registered
///     worker to take. Only a hash of the brief goes on-chain (the text sits with the site, readable by the two
///     parties).
///   · The worker delivers before the deadline (a hash of the result). The buyer then has 24 hours to accept or
///     dispute; silence counts as accepting — after the 24 hours anyone can release the payment.
///   · No delivery by the deadline: the buyer takes the USDC back. A worker can decline any time before delivering
///     (the buyer is refunded at once); a buyer can cancel an open job nobody has taken yet.
///   · A dispute goes to the arbiter, who splits the job between the two. If the arbiter hasn't decided within
///     14 days, either party can split it 50 / 50 — money in a job can never be stuck.
///   · On payment a fee (at most 5%, fixed for the job when it's posted) goes to the fee wallet.
///
/// The owner can set the fee and the fee wallet, name the arbiter and pause new jobs. Nothing here lets the owner,
/// the arbiter or anyone else move the USDC of a job except along the paths above; a pause never stops a delivery,
/// an accept, a release, a refund or a dispute.
contract ArciaWorks is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    uint16 public constant MAX_FEE_BPS = 500; // 5%
    uint64 public constant REVIEW = 24 hours; // the buyer's window after a delivery
    uint64 public constant DISPUTE_TIMEOUT = 14 days; // the arbiter's window
    uint64 public constant MIN_TIME = 10 minutes; // shortest deadline from posting
    uint64 public constant MAX_TIME = 60 days; // longest deadline from posting
    uint96 public constant MIN_AMOUNT = 100_000; // 0.10 USDC (6 decimals)

    uint16 public feeBps;
    address public feeTo;
    address public arbiter;
    bool public paused; // stops new jobs and new registrations only

    struct Agent {
        uint64 since; // 0 = not registered
        uint32 done; // jobs paid (accepted, released or a dispute split in its favour)
        uint32 disputes; // jobs disputed against it
        bool active; // takes new jobs
        uint128 earned; // USDC received, after fees
        string name;
        string meta; // a link to its listing (prices, tags, how to reach it)
    }

    enum State { None, Open, Assigned, Delivered, Settled, Refunded, Disputed, Resolved }

    struct Job {
        address buyer;
        uint96 amount;
        address worker; // 0 while open
        uint64 deadline; // delivery by
        uint64 until; // Delivered: the end of the review · Disputed: the end of the arbiter's window
        uint64 posted;
        State state;
        uint16 feeBps; // the fee when posted
        bytes32 brief; // keccak256 of the brief
        bytes32 result; // keccak256 of the result
    }

    mapping(address => Agent) private _agents;
    address[] public agentList;
    Job[] private _jobs; // id = index + 1

    event Registered(address indexed agent, string name, string meta);
    event Updated(address indexed agent, string name, string meta, bool active);
    event Posted(uint256 indexed id, address indexed buyer, address indexed worker, uint256 amount, uint64 deadline, bytes32 brief);
    event Taken(uint256 indexed id, address indexed worker);
    event Declined(uint256 indexed id, address indexed worker);
    event Cancelled(uint256 indexed id);
    event Delivered(uint256 indexed id, bytes32 result, uint64 reviewUntil);
    event Paid(uint256 indexed id, address indexed worker, uint256 toWorker, uint256 fee, bool byBuyer);
    event Refunded(uint256 indexed id, address indexed buyer, uint256 amount);
    event Disputed(uint256 indexed id, uint64 until);
    event Resolved(uint256 indexed id, uint16 workerBps, uint256 toWorker, uint256 toBuyer, uint256 fee, bool stale);
    event FeeSet(uint16 bps, address to);
    event ArbiterSet(address arbiter);
    event PausedSet(bool paused);

    error NotRegistered();
    error AlreadyRegistered();
    error BadInput();
    error BadState();
    error NotAllowed();
    error TooEarly();
    error TooLate();
    error IsPaused();

    constructor(address usdc_, address owner_, address feeTo_, uint16 feeBps_, address arbiter_) Ownable(owner_) {
        if (usdc_ == address(0) || feeTo_ == address(0) || feeBps_ > MAX_FEE_BPS) revert BadInput();
        usdc = IERC20(usdc_);
        feeTo = feeTo_;
        feeBps = feeBps_;
        arbiter = arbiter_ == address(0) ? owner_ : arbiter_;
    }

    // ---------------------------------------------------------------- agents

    function register(string calldata name, string calldata meta) external {
        if (paused) revert IsPaused();
        Agent storage a = _agents[msg.sender];
        if (a.since != 0) revert AlreadyRegistered();
        _checkText(name, meta);
        a.since = uint64(block.timestamp);
        a.active = true;
        a.name = name;
        a.meta = meta;
        agentList.push(msg.sender);
        emit Registered(msg.sender, name, meta);
    }

    function update(string calldata name, string calldata meta, bool active) external {
        Agent storage a = _agents[msg.sender];
        if (a.since == 0) revert NotRegistered();
        _checkText(name, meta);
        a.name = name;
        a.meta = meta;
        a.active = active;
        emit Updated(msg.sender, name, meta, active);
    }

    function _checkText(string calldata name, string calldata meta) private pure {
        uint256 n = bytes(name).length;
        if (n == 0 || n > 48 || bytes(meta).length > 200) revert BadInput();
    }

    // ---------------------------------------------------------------- jobs

    /// @notice Lock `amount` USDC (approve this contract first) for a job delivered by `deadline`. `worker` = 0 posts
    /// an open job any registered worker can take.
    function post(address worker, uint96 amount, uint64 deadline, bytes32 brief) external nonReentrant returns (uint256 id) {
        if (paused) revert IsPaused();
        if (amount < MIN_AMOUNT || brief == bytes32(0)) revert BadInput();
        if (deadline < block.timestamp + MIN_TIME || deadline > block.timestamp + MAX_TIME) revert BadInput();
        if (worker != address(0)) {
            if (worker == msg.sender) revert NotAllowed();
            Agent storage a = _agents[worker];
            if (a.since == 0 || !a.active) revert NotRegistered();
        }
        _jobs.push(Job({
            buyer: msg.sender, amount: amount, worker: worker, deadline: deadline, until: 0, posted: uint64(block.timestamp),
            state: worker == address(0) ? State.Open : State.Assigned, feeBps: feeBps, brief: brief, result: bytes32(0)
        }));
        id = _jobs.length;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Posted(id, msg.sender, worker, amount, deadline, brief);
    }

    /// @notice A registered worker takes an open job.
    function take(uint256 id) external {
        Job storage j = _job(id);
        if (j.state != State.Open) revert BadState();
        if (block.timestamp >= j.deadline) revert TooLate();
        if (msg.sender == j.buyer) revert NotAllowed();
        Agent storage a = _agents[msg.sender];
        if (a.since == 0 || !a.active) revert NotRegistered();
        j.worker = msg.sender;
        j.state = State.Assigned;
        emit Taken(id, msg.sender);
    }

    /// @notice The worker backs out before delivering — the buyer gets the USDC back at once.
    function decline(uint256 id) external nonReentrant {
        Job storage j = _job(id);
        if (j.state != State.Assigned) revert BadState();
        if (msg.sender != j.worker) revert NotAllowed();
        emit Declined(id, msg.sender);
        _refund(id, j);
    }

    /// @notice The buyer cancels an open job nobody has taken.
    function cancel(uint256 id) external nonReentrant {
        Job storage j = _job(id);
        if (j.state != State.Open) revert BadState();
        if (msg.sender != j.buyer) revert NotAllowed();
        emit Cancelled(id);
        _refund(id, j);
    }

    function deliver(uint256 id, bytes32 result) external {
        Job storage j = _job(id);
        if (j.state != State.Assigned) revert BadState();
        if (msg.sender != j.worker) revert NotAllowed();
        if (block.timestamp >= j.deadline) revert TooLate();
        if (result == bytes32(0)) revert BadInput();
        j.result = result;
        j.state = State.Delivered;
        j.until = uint64(block.timestamp) + REVIEW;
        emit Delivered(id, result, j.until);
    }

    function accept(uint256 id) external nonReentrant {
        Job storage j = _job(id);
        if (j.state != State.Delivered) revert BadState();
        if (msg.sender != j.buyer) revert NotAllowed();
        _pay(id, j, true);
    }

    /// @notice After the 24-hour review, anyone can pay the worker.
    function release(uint256 id) external nonReentrant {
        Job storage j = _job(id);
        if (j.state != State.Delivered) revert BadState();
        if (block.timestamp <= j.until) revert TooEarly();
        _pay(id, j, false);
    }

    /// @notice Nothing delivered by the deadline: the buyer takes the USDC back.
    function refund(uint256 id) external nonReentrant {
        Job storage j = _job(id);
        if (j.state != State.Assigned && j.state != State.Open) revert BadState();
        if (msg.sender != j.buyer) revert NotAllowed();
        if (block.timestamp < j.deadline) revert TooEarly();
        _refund(id, j);
    }

    function dispute(uint256 id) external {
        Job storage j = _job(id);
        if (j.state != State.Delivered) revert BadState();
        if (msg.sender != j.buyer) revert NotAllowed();
        if (block.timestamp > j.until) revert TooLate();
        j.state = State.Disputed;
        j.until = uint64(block.timestamp) + DISPUTE_TIMEOUT;
        _agents[j.worker].disputes += 1;
        emit Disputed(id, j.until);
    }

    /// @notice The arbiter splits a disputed job: `workerBps` of it to the worker (less the fee), the rest back.
    function resolve(uint256 id, uint16 workerBps) external nonReentrant {
        if (msg.sender != arbiter) revert NotAllowed();
        Job storage j = _job(id);
        if (j.state != State.Disputed) revert BadState();
        if (workerBps > 10_000) revert BadInput();
        _split(id, j, workerBps, false);
    }

    /// @notice The arbiter's 14 days are up: either party splits the job 50 / 50, without a fee.
    function settleStale(uint256 id) external nonReentrant {
        Job storage j = _job(id);
        if (j.state != State.Disputed) revert BadState();
        if (msg.sender != j.buyer && msg.sender != j.worker) revert NotAllowed();
        if (block.timestamp <= j.until) revert TooEarly();
        _split(id, j, 5_000, true);
    }

    // ---------------------------------------------------------------- money out

    function _pay(uint256 id, Job storage j, bool byBuyer) private {
        uint256 amt = j.amount;
        uint256 fee = (amt * j.feeBps) / 10_000;
        uint256 net = amt - fee;
        j.state = State.Settled;
        Agent storage a = _agents[j.worker];
        a.done += 1;
        a.earned += uint128(net);
        if (fee > 0) usdc.safeTransfer(feeTo, fee);
        usdc.safeTransfer(j.worker, net);
        emit Paid(id, j.worker, net, fee, byBuyer);
    }

    function _refund(uint256 id, Job storage j) private {
        j.state = State.Refunded;
        usdc.safeTransfer(j.buyer, j.amount);
        emit Refunded(id, j.buyer, j.amount);
    }

    function _split(uint256 id, Job storage j, uint16 workerBps, bool stale) private {
        uint256 amt = j.amount;
        uint256 gross = (amt * workerBps) / 10_000;
        uint256 fee = stale ? 0 : (gross * j.feeBps) / 10_000;
        uint256 toWorker = gross - fee;
        uint256 toBuyer = amt - gross;
        j.state = State.Resolved;
        if (workerBps >= 5_000 && toWorker > 0) {
            Agent storage a = _agents[j.worker];
            a.done += 1;
            a.earned += uint128(toWorker);
        } else if (toWorker > 0) {
            _agents[j.worker].earned += uint128(toWorker);
        }
        if (fee > 0) usdc.safeTransfer(feeTo, fee);
        if (toWorker > 0) usdc.safeTransfer(j.worker, toWorker);
        if (toBuyer > 0) usdc.safeTransfer(j.buyer, toBuyer);
        emit Resolved(id, workerBps, toWorker, toBuyer, fee, stale);
    }

    // ---------------------------------------------------------------- owner

    function setFee(uint16 bps, address to) external onlyOwner {
        if (bps > MAX_FEE_BPS || to == address(0)) revert BadInput();
        feeBps = bps;
        feeTo = to;
        emit FeeSet(bps, to);
    }

    function setArbiter(address a) external onlyOwner {
        if (a == address(0)) revert BadInput();
        arbiter = a;
        emit ArbiterSet(a);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    // ---------------------------------------------------------------- reads

    function _job(uint256 id) private view returns (Job storage) {
        if (id == 0 || id > _jobs.length) revert BadInput();
        return _jobs[id - 1];
    }

    function job(uint256 id) external view returns (Job memory) {
        return _job(id);
    }

    function jobCount() external view returns (uint256) {
        return _jobs.length;
    }

    function agent(address a) external view returns (Agent memory) {
        return _agents[a];
    }

    function agentCount() external view returns (uint256) {
        return agentList.length;
    }
}
