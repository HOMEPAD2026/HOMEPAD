// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Test-only ERC-20 with EIP-2612 permit (like USDC), 6 decimals.
contract MockPermitToken is ERC20, ERC20Permit {
    constructor() ERC20("Mock USD", "mUSD") ERC20Permit("Mock USD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
