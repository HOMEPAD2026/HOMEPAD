// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// Arc's USDC predeploy stand-in: name/symbol/decimals are code, not storage, so its runtime can be placed at 0x3600… with setCode.
contract ArcUsdcMock is ERC20 {
    constructor() ERC20("", "") {}
    function name() public pure override returns (string memory) { return "USDC"; }
    function symbol() public pure override returns (string memory) { return "USDC"; }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}
