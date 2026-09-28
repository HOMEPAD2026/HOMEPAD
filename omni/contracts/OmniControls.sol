// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { RateLimiter } from "@layerzerolabs/oapp-evm/contracts/oapp/utils/RateLimiter.sol";

/// @title OmniControls — the safety switches every ARCIRCLE OMNI contract shares.
/// @notice
///  - pause:      stops sends AND receives on this chain. A message that arrives while paused fails in
///                lzReceive and stays stored at the LayerZero endpoint; anyone can retry it after unpause,
///                so nothing is lost — it only waits.
///  - rate limit: a per-destination cap on how much can leave this chain in a rolling window. It bounds
///                the damage of a compromised peer or a bug to one window's worth of tokens.
///  - guardian:   a second key (a monitoring bot or a 1-of-N Safe) that can pause but never unpause,
///                change limits or move anything. Unpausing is the owner's (the multisig's) call.
abstract contract OmniControls is Ownable, Pausable, RateLimiter {
    address public guardian;

    event GuardianChanged(address indexed guardian);

    error NotGuardianOrOwner();

    function setGuardian(address _guardian) external onlyOwner {
        guardian = _guardian;
        emit GuardianChanged(_guardian);
    }

    function pause() external {
        if (msg.sender != owner() && msg.sender != guardian) revert NotGuardianOrOwner();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Outbound limits per destination endpoint id: { dstEid, limit (local decimals), window (seconds) }.
    function setRateLimits(RateLimitConfig[] calldata _configs) external onlyOwner {
        _setRateLimits(_configs);
    }

    function resetRateLimits(uint32[] calldata _eids) external onlyOwner {
        _resetRateLimits(_eids);
    }
}
