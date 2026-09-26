// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only ERC-20 that skims 1% of every transfer to its deployer —
///         so a "burn" to the dead address arrives short (ArcircleBurnVote
///         must refuse to count it).
contract MockSkimToken is ERC20 {
    address private immutable _skim;
    constructor() ERC20("Skim", "SKIM") { _skim = msg.sender; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && to != _skim) {
            uint256 fee = value / 100;
            super._update(from, _skim, fee);
            super._update(from, to, value - fee);
        } else super._update(from, to, value);
    }
}
