// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal ETH crowdraise escrow for BigPad's first round.
///
/// Deliberately narrow scope: an optional hard cap, a fixed deadline, and
/// funds held in this contract — not a raw wallet — until the raise
/// closes. It does NOT implement the leader/voting/vesting mechanism
/// described on the BigPad docs page; that is a separate, larger contract
/// still in design and review (see Docs > Safety design). This contract
/// exists so the very first round doesn't have to wait for that one. It
/// upgrades "ETH sent straight to an EOA" to "ETH locked in an auditable,
/// time-boxed contract" — nothing more, nothing less.
///
/// Known limitation, by design, in this version: if the raise ends with
/// little raised, contributors have no on-chain refund path — `recipient`
/// can withdraw whatever came in once the deadline passes (or the cap is
/// hit). This is disclosed on-site, not hidden.
contract BigPadEscrow is Ownable, ReentrancyGuard {
    /// @notice Where funds go once the raise closes. Also the Ownable
    /// owner — only this wallet can call withdraw(), and it always pays
    /// itself, never an address supplied at call time.
    address public immutable recipient;

    /// @notice Hard cap on total ETH this contract will ever accept, in
    /// wei. Zero means uncapped — the raise is bounded by `deadline` only.
    uint256 public immutable cap;

    /// @notice Unix timestamp after which contribute() stops accepting ETH.
    uint256 public immutable deadline;

    /// @notice Total ETH accepted so far, in wei.
    uint256 public totalRaised;

    /// @notice Per-address running total contributed, in wei.
    mapping(address => uint256) public contributions;

    /// @notice True once withdraw() has moved the funds out.
    bool public withdrawn;

    event Contributed(address indexed contributor, uint256 amount, uint256 totalRaised);
    event Withdrawn(address indexed to, uint256 amount);

    error RaiseEnded();
    error CapExceeded();
    error ZeroContribution();
    error RaiseStillOpen();
    error AlreadyWithdrawn();
    error NothingToWithdraw();

    constructor(address recipient_, uint256 cap_, uint256 deadline_) Ownable(recipient_) {
        require(recipient_ != address(0), "recipient is zero address");
        require(deadline_ > block.timestamp, "deadline must be in the future");
        recipient = recipient_;
        cap = cap_; // 0 is a deliberate sentinel for "uncapped" — see contribute()/isOpen()/withdraw()
        deadline = deadline_;
    }

    /// @notice Contribute ETH to the raise. Reverts past the deadline, or
    /// — if a cap is set — if this contribution would push totalRaised
    /// over it. Check remainingCap() first and send at most that much.
    function contribute() external payable nonReentrant {
        if (block.timestamp >= deadline) revert RaiseEnded();
        if (msg.value == 0) revert ZeroContribution();
        if (cap > 0 && totalRaised + msg.value > cap) revert CapExceeded();

        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;

        emit Contributed(msg.sender, msg.value, totalRaised);
    }

    /// @notice Releases the escrowed ETH to `recipient`. Callable only by
    /// `recipient` itself, and only once the raise has actually closed —
    /// the deadline has passed, or (if a cap is set) the cap was reached.
    /// An uncapped raise can only close by deadline. One-shot: pays out
    /// the full balance, once.
    function withdraw() external onlyOwner nonReentrant {
        bool capReached = cap > 0 && totalRaised >= cap;
        if (block.timestamp < deadline && !capReached) revert RaiseStillOpen();
        if (withdrawn) revert AlreadyWithdrawn();
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToWithdraw();

        withdrawn = true;
        emit Withdrawn(recipient, balance);

        (bool ok, ) = recipient.call{value: balance}("");
        require(ok, "ETH transfer failed");
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
        return block.timestamp < deadline && !capReached;
    }
}
