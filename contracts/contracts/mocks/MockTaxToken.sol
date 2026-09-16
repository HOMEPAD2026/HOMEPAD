// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only ERC-20 that deducts a configurable basis-points tax
///         (burned) on every transfer AND transferFrom — a stand-in for a
///         real-world token like $ARGUS, to exercise the balance-delta-safe
///         quote handling in HomepadFactoryArc regardless of what the real
///         token's tax mechanism turns out to be.
contract MockTaxToken is ERC20 {
    uint16 public immutable taxBps; // e.g. 100 = 1%

    constructor(string memory name_, string memory symbol_, uint16 taxBps_) ERC20(name_, symbol_) {
        require(taxBps_ <= 10000, "bad tax");
        taxBps = taxBps_;
        _mint(msg.sender, 1_000_000 ether);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _taxedTransfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _taxedTransfer(from, to, amount);
        return true;
    }

    function _taxedTransfer(address from, address to, uint256 amount) internal {
        uint256 tax = (amount * taxBps) / 10000;
        uint256 net = amount - tax;
        super._transfer(from, to, net);
        if (tax > 0) super._transfer(from, address(0xdead), tax);
    }
}
