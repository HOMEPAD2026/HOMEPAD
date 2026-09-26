// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ArcMultiSend — send an ERC-20 to many wallets in one transaction
/// @notice ARCIRCLE PAD's Multisender. Tokens go straight from the sender's
///         wallet to each recipient (transferFrom) — this contract never holds
///         any, and it only ever pulls from whoever calls it, so an approval
///         given to it can't be used by anyone else.
///         No owner, no admin, no fee, no pause, no upgrades.
/// @dev USDC on Arc is sent through its ERC-20 interface (6 decimals).
///      If any single transfer fails, the whole batch reverts — nobody gets a
///      partial airdrop by accident.
contract ArcMultiSend {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_RECIPIENTS = 500;

    /// @notice Running totals, for the stats on the page.
    uint256 public batches;
    uint256 public transfers;

    event Sent(address indexed token, address indexed sender, uint256 recipients, uint256 total);

    error BadInput();
    error TooMany();
    error ZeroAddress();
    error ZeroAmount();

    /// @notice Send `amounts[i]` of `token` to `to[i]`. Needs an approval for the total first.
    function send(address token, address[] calldata to, uint256[] calldata amounts) external returns (uint256 total) {
        uint256 n = to.length;
        if (n == 0 || n != amounts.length) revert BadInput();
        if (n > MAX_RECIPIENTS) revert TooMany();
        IERC20 t = IERC20(token);
        for (uint256 i; i < n; ++i) {
            address r = to[i];
            uint256 a = amounts[i];
            if (r == address(0)) revert ZeroAddress();
            if (a == 0) revert ZeroAmount();
            t.safeTransferFrom(msg.sender, r, a);
            total += a;
        }
        _count(n);
        emit Sent(token, msg.sender, n, total);
    }

    /// @notice Send the same `amount` of `token` to every address in `to`.
    function sendSame(address token, address[] calldata to, uint256 amount) external returns (uint256 total) {
        uint256 n = to.length;
        if (n == 0) revert BadInput();
        if (n > MAX_RECIPIENTS) revert TooMany();
        if (amount == 0) revert ZeroAmount();
        IERC20 t = IERC20(token);
        for (uint256 i; i < n; ++i) {
            address r = to[i];
            if (r == address(0)) revert ZeroAddress();
            t.safeTransferFrom(msg.sender, r, amount);
        }
        total = amount * n;
        _count(n);
        emit Sent(token, msg.sender, n, total);
    }

    function _count(uint256 n) private {
        unchecked {
            batches += 1;
            transfers += n;
        }
    }
}
