// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal ETH crowdraise escrow for BigPad's first round.
///
/// Deliberately narrow scope: funds are held in this contract — not a raw
/// wallet — until the raise closes. It does NOT implement the leader/
/// voting/vesting mechanism described on the BigPad docs page; that is a
/// separate, larger contract still in design and review (see Docs >
/// Safety design).
///
/// Lifecycle:
///  1. Deploy. Nothing is open yet.
///  2. `recipient` calls start() — this is the only thing that begins the
///     72-hour funding window (nothing happens automatically on deploy).
///  3. While open, anyone can contribute() ETH, and any contributor can
///     refund() some or all of their own contribution back, any time,
///     for any reason — no lock-in.
///  4. Once the 72 hours are up, `recipient` calls withdraw() once, which
///     splits whatever is left 80/5/15 between `recipient`, `platformWallet`,
///     and `treasuryWallet`. `recipient` cannot withdraw a single wei
///     before the window closes — there is no early-exit path for them,
///     capped raise or not.
contract BigPadEscrow is Ownable, ReentrancyGuard {
    uint256 public constant FUNDING_DURATION = 72 hours;
    uint16 public constant RECIPIENT_BPS = 8000; // 80%
    uint16 public constant PLATFORM_BPS = 500; // 5%
    uint16 public constant TREASURY_BPS = 1500; // 15%

    /// @notice Deploy/lead wallet. Also the Ownable owner — only this
    /// wallet can call start() or withdraw(). Gets 80% of the final balance.
    address public immutable recipient;
    /// @notice Gets 5% of the final balance.
    address public immutable platformWallet;
    /// @notice Gets 15% of the final balance.
    address public immutable treasuryWallet;
    /// @notice Hard cap on total ETH this contract will ever accept, in
    /// wei. Zero means uncapped — the raise is bounded by time only.
    uint256 public immutable cap;

    /// @notice True once `recipient` has called start().
    bool public started;
    /// @notice Unix timestamp the funding window closes at. Zero until
    /// start() is called.
    uint256 public deadline;

    /// @notice Total ETH currently held for contributors (i.e. net of any
    /// refunds already paid out), in wei.
    uint256 public totalRaised;
    /// @notice Per-address contribution currently outstanding, in wei.
    mapping(address => uint256) public contributions;
    /// @notice True once withdraw() has split the final balance out.
    bool public distributed;

    event Started(uint256 deadline);
    event Contributed(address indexed contributor, uint256 amount, uint256 totalRaised);
    event Refunded(address indexed contributor, uint256 amount, uint256 totalRaised);
    event Distributed(uint256 toRecipient, uint256 toPlatform, uint256 toTreasury);

    error AlreadyStarted();
    error NotStarted();
    error RaiseEnded();
    error RaiseStillOpen();
    error CapExceeded();
    error ZeroContribution();
    error ZeroRefundAmount();
    error InsufficientContribution();
    error AlreadyDistributed();
    error NothingToDistribute();

    constructor(address recipient_, address platformWallet_, address treasuryWallet_, uint256 cap_) Ownable(recipient_) {
        require(recipient_ != address(0), "recipient is zero address");
        require(platformWallet_ != address(0), "platform wallet is zero address");
        require(treasuryWallet_ != address(0), "treasury wallet is zero address");
        recipient = recipient_;
        platformWallet = platformWallet_;
        treasuryWallet = treasuryWallet_;
        cap = cap_; // 0 is a deliberate sentinel for "uncapped"
    }

    /// @notice Starts the 72-hour funding window. Only `recipient` can
    /// call this, and only once — there is no way to restart or extend it.
    function start() external onlyOwner {
        if (started) revert AlreadyStarted();
        started = true;
        deadline = block.timestamp + FUNDING_DURATION;
        emit Started(deadline);
    }

    /// @notice Contribute ETH to the raise. Reverts before start(), past
    /// the deadline, or — if a cap is set — if this would push totalRaised
    /// over it.
    function contribute() external payable nonReentrant {
        if (!started) revert NotStarted();
        if (block.timestamp >= deadline) revert RaiseEnded();
        if (msg.value == 0) revert ZeroContribution();
        if (cap > 0 && totalRaised + msg.value > cap) revert CapExceeded();

        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;

        emit Contributed(msg.sender, msg.value, totalRaised);
    }

    /// @notice Lets a contributor pull back some or all of their own
    /// contribution, any time while the raise is still open — no lock-in,
    /// no reason required. Reverts once the window has closed.
    function refund(uint256 amount) external nonReentrant {
        if (!started || block.timestamp >= deadline) revert RaiseEnded();
        if (amount == 0) revert ZeroRefundAmount();
        uint256 bal = contributions[msg.sender];
        if (amount > bal) revert InsufficientContribution();

        contributions[msg.sender] = bal - amount;
        totalRaised -= amount;

        emit Refunded(msg.sender, amount, totalRaised);

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    /// @notice Splits the final balance 80/5/15 between recipient/
    /// platform/treasury. Only `recipient` can call this, and only once
    /// the funding window has actually closed — there is no early exit
    /// for `recipient`, regardless of how much has been raised. One-shot.
    function withdraw() external onlyOwner nonReentrant {
        if (!started || block.timestamp < deadline) revert RaiseStillOpen();
        if (distributed) revert AlreadyDistributed();
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToDistribute();

        distributed = true;

        uint256 toPlatform = (balance * PLATFORM_BPS) / 10000;
        uint256 toTreasury = (balance * TREASURY_BPS) / 10000;
        uint256 toRecipient = balance - toPlatform - toTreasury; // remainder — avoids rounding dust getting stuck

        emit Distributed(toRecipient, toPlatform, toTreasury);

        (bool ok1, ) = recipient.call{value: toRecipient}("");
        require(ok1, "recipient transfer failed");
        (bool ok2, ) = platformWallet.call{value: toPlatform}("");
        require(ok2, "platform transfer failed");
        (bool ok3, ) = treasuryWallet.call{value: toTreasury}("");
        require(ok3, "treasury transfer failed");
    }

    /// @notice How much more ETH the raise can accept before hitting cap.
    /// Returns type(uint256).max for an uncapped raise.
    function remainingCap() external view returns (uint256) {
        if (cap == 0) return type(uint256).max;
        return totalRaised >= cap ? 0 : cap - totalRaised;
    }

    /// @notice Whether contribute() would currently accept a nonzero amount.
    function isOpen() external view returns (bool) {
        bool capReached = cap > 0 && totalRaised >= cap;
        return started && block.timestamp < deadline && !capReached;
    }
}
