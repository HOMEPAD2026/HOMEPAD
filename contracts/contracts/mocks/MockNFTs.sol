// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @notice Test-only NFTs for ArcMultiSendV2.
contract MockNFT721 is ERC721 {
    constructor() ERC721("Mock 721", "M721") {}
    function mint(address to, uint256 id) external { _mint(to, id); }
}

contract MockNFT1155 is ERC1155 {
    constructor() ERC1155("") {}
    function mint(address to, uint256 id, uint256 amount) external { _mint(to, id, amount, ""); }
}

/// @notice A contract that refuses NFTs (no receiver hook).
contract NoReceiver {}
