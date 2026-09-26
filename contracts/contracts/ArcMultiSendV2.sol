// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @title ArcMultiSendV2 — ARCIRCLE PAD's Multisender, second version
/// @notice Everything ArcMultiSend does, plus:
///           • sendWithPermit   — an EIP-2612 signature instead of a separate
///                                approval transaction (USDC and most newer tokens)
///           • sendMulti        — a different token on every row
///           • sendERC721 / sendERC1155 — NFTs to many wallets
///         Tokens always go straight from the caller's wallet to each
///         recipient; the contract never holds any and only ever pulls from
///         whoever calls it. Each batch is all-or-nothing.
///         No owner, no admin, no fee, no pause, no upgrades.
contract ArcMultiSendV2 {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_RECIPIENTS = 500;

    uint256 public batches;
    uint256 public transfers;

    event Sent(address indexed token, address indexed sender, uint256 recipients, uint256 total);
    event SentMulti(address indexed sender, uint256 recipients);
    event SentNFT(address indexed nft, address indexed sender, uint256 recipients, uint256 items);

    error BadInput();
    error TooMany();
    error ZeroAddress();
    error ZeroAmount();

    // ---------------- ERC-20 ----------------

    /// @notice Send `amounts[i]` of `token` to `to[i]`. Needs an approval for the total.
    function send(address token, address[] calldata to, uint256[] calldata amounts) public returns (uint256 total) {
        total = _send(token, to, amounts);
        emit Sent(token, msg.sender, to.length, total);
    }

    /// @notice Send the same `amount` of `token` to everyone in `to`.
    function sendSame(address token, address[] calldata to, uint256 amount) external returns (uint256 total) {
        uint256 n = to.length;
        if (n == 0) revert BadInput();
        if (n > MAX_RECIPIENTS) revert TooMany();
        if (amount == 0) revert ZeroAmount();
        IERC20 t = IERC20(token);
        for (uint256 i; i < n; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            t.safeTransferFrom(msg.sender, to[i], amount);
        }
        total = amount * n;
        _count(n);
        emit Sent(token, msg.sender, n, total);
    }

    /// @notice `send` with an EIP-2612 permit for `value` signed by the caller —
    ///         no separate approval transaction. If the permit was already used
    ///         (someone front-ran it), an existing allowance is enough.
    function sendWithPermit(
        address token, address[] calldata to, uint256[] calldata amounts,
        uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint256 total) {
        try IERC20Permit(token).permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
        total = _send(token, to, amounts);
        emit Sent(token, msg.sender, to.length, total);
    }

    /// @notice A different token on every row: `tokens[i]` × `amounts[i]` → `to[i]`.
    ///         Needs an approval for each token's total.
    function sendMulti(address[] calldata tokens, address[] calldata to, uint256[] calldata amounts) external {
        uint256 n = to.length;
        if (n == 0 || n != amounts.length || n != tokens.length) revert BadInput();
        if (n > MAX_RECIPIENTS) revert TooMany();
        for (uint256 i; i < n; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            IERC20(tokens[i]).safeTransferFrom(msg.sender, to[i], amounts[i]);
        }
        _count(n);
        emit SentMulti(msg.sender, n);
    }

    // ---------------- NFTs ----------------

    /// @notice ERC-721: token `ids[i]` of `nft` → `to[i]`. Needs setApprovalForAll.
    function sendERC721(address nft, address[] calldata to, uint256[] calldata ids) external {
        uint256 n = to.length;
        if (n == 0 || n != ids.length) revert BadInput();
        if (n > MAX_RECIPIENTS) revert TooMany();
        IERC721 c = IERC721(nft);
        for (uint256 i; i < n; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            c.safeTransferFrom(msg.sender, to[i], ids[i]);
        }
        _count(n);
        emit SentNFT(nft, msg.sender, n, n);
    }

    /// @notice ERC-1155: `amounts[i]` of token `ids[i]` of `nft` → `to[i]`. Needs setApprovalForAll.
    function sendERC1155(address nft, address[] calldata to, uint256[] calldata ids, uint256[] calldata amounts) external {
        uint256 n = to.length;
        if (n == 0 || n != ids.length || n != amounts.length) revert BadInput();
        if (n > MAX_RECIPIENTS) revert TooMany();
        IERC1155 c = IERC1155(nft);
        uint256 items;
        for (uint256 i; i < n; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            c.safeTransferFrom(msg.sender, to[i], ids[i], amounts[i], "");
            items += amounts[i];
        }
        _count(n);
        emit SentNFT(nft, msg.sender, n, items);
    }

    // ---------------- internals ----------------
    function _send(address token, address[] calldata to, uint256[] calldata amounts) private returns (uint256 total) {
        uint256 n = to.length;
        if (n == 0 || n != amounts.length) revert BadInput();
        if (n > MAX_RECIPIENTS) revert TooMany();
        IERC20 t = IERC20(token);
        for (uint256 i; i < n; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            t.safeTransferFrom(msg.sender, to[i], amounts[i]);
            total += amounts[i];
        }
        _count(n);
    }

    function _count(uint256 n) private {
        unchecked {
            batches += 1;
            transfers += n;
        }
    }
}
