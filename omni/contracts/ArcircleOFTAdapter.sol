// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { OmniControls } from "./OmniControls.sol";

/// @title ArcircleOFTAdapter — the lockbox on Arc for $ARCIRCLE (0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7).
/// @notice $ARCIRCLE stays the one canonical token. Sending it to Solana or Robinhood Chain LOCKS it here
///         and the destination OFT MINTS the same amount; sending it back BURNS it there and UNLOCKS it here.
///         So at every moment:
///
///             ARCIRCLE.balanceOf(this adapter) == supply on Robinhood + supply on Solana (+ in flight)
///             global supply = 1,000,000,000 (the Arc token's fixed totalSupply) — never more.
///
///         There must be exactly ONE adapter for $ARCIRCLE across the whole mesh; every other chain runs a
///         mint/burn OFT. The adapter never approves anyone and has no way to move the locked tokens other
///         than a LayerZero message from a wired peer.
///
///         On top of LayerZero's OFTAdapter:
///           - lossless check: a lock must add exactly the sent amount to the lockbox (reverts otherwise),
///             so a future change in the token's transfer behaviour can't silently break the 1:1 backing;
///           - pause / guardian / per-destination rate limits (OmniControls);
///           - Argus holder rewards: $ARCIRCLE pays USDC rewards to holders by balance. Tokens locked here
///             would earn them too. `collectRewards` lets the owner trigger a claim and `sweep` moves
///             anything that is NOT $ARCIRCLE (e.g. USDC rewards) to the rewards wallet — the call is
///             refused if it would touch the lockbox's $ARCIRCLE. Whether the adapter is instead excluded
///             from rewards by Argus (portal-only `exclude`) is a policy decision — see omni/README.md.
contract ArcircleOFTAdapter is OFTAdapter, OmniControls {
    using SafeERC20 for IERC20;

    address public rewardsReceiver;

    event RewardsReceiverChanged(address indexed receiver);
    event Swept(address indexed token, address indexed to, uint256 amount);

    error NotLossless(uint256 expected, uint256 received);
    error LockboxTokenUntouchable();
    error LockboxChanged(uint256 before, uint256 afterCall);
    error NoReceiver();

    constructor(address _token, address _lzEndpoint, address _owner) OFTAdapter(_token, _lzEndpoint, _owner) Ownable(_owner) {}

    /// @notice $ARCIRCLE held here = everything that currently lives on Robinhood Chain and Solana.
    function lockedSupply() external view returns (uint256) {
        return innerToken.balanceOf(address(this));
    }

    // ------------------------------------------------------------------ lock / unlock

    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal override whenNotPaused returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);
        _outflow(_dstEid, amountSentLD);
        uint256 before = innerToken.balanceOf(address(this));
        innerToken.safeTransferFrom(_from, address(this), amountSentLD);
        uint256 got = innerToken.balanceOf(address(this)) - before;
        if (got != amountSentLD) revert NotLossless(amountSentLD, got);
    }

    function _credit(address _to, uint256 _amountLD, uint32 _srcEid) internal override whenNotPaused returns (uint256) {
        return super._credit(_to, _amountLD, _srcEid);
    }

    // ------------------------------------------------------------------ Argus rewards earned by the lockbox

    function setRewardsReceiver(address _receiver) external onlyOwner {
        rewardsReceiver = _receiver;
        emit RewardsReceiverChanged(_receiver);
    }

    /// @notice Calls `target` with `data` (e.g. the Argus hook's claim function) so rewards owed to this
    ///         address are paid out. Refused if the target is the $ARCIRCLE token itself, and reverted if
    ///         the lockbox's $ARCIRCLE balance is different afterwards — it can collect, never spend.
    function collectRewards(address target, bytes calldata data) external onlyOwner returns (bytes memory result) {
        if (target == address(innerToken)) revert LockboxTokenUntouchable();
        uint256 before = innerToken.balanceOf(address(this));
        bool ok;
        (ok, result) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        uint256 afterCall = innerToken.balanceOf(address(this));
        if (afterCall != before) revert LockboxChanged(before, afterCall);
    }

    /// @notice Moves a token that is NOT $ARCIRCLE (e.g. USDC rewards) to the rewards wallet.
    function sweep(address token) external onlyOwner {
        if (token == address(innerToken)) revert LockboxTokenUntouchable();
        if (rewardsReceiver == address(0)) revert NoReceiver();
        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(rewardsReceiver, amount);
        emit Swept(token, rewardsReceiver, amount);
    }
}
