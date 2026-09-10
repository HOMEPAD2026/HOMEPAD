// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply ERC20 minted once, in full, to its bonding curve at creation.
/// No owner, no mint function after construction, no admin controls — matches the
/// "fixed supply, no rug" model that Pons/pump.fun-style launchpads use.
contract LaunchToken is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address curve
    ) ERC20(name_, symbol_) {
        _mint(curve, totalSupply_);
    }
}
