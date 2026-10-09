// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Stand-in for HomepadFactoryArc: the same `launches(i)` / `launchIndexOf(token)` getters ArcLaunchDrop reads.
contract MockLaunchFactory {
    struct Launch {
        address token;
        address quoteToken;
        uint256 initialVirtualQuote;
        bool quoteIsCurrency0;
        address creator;
        uint256 launchedAt;
        uint16 extraFeeBps;
        string imageUrl;
        string description;
        string twitter;
        string telegram;
        string discord;
        string website;
    }
    Launch[] public launches;
    mapping(address => uint256) public launchIndexOf;

    function add(address token, uint256 at) external {
        launchIndexOf[token] = launches.length + 1;
        launches.push(Launch(token, address(0), 0, false, msg.sender, at, 0, "img", "desc", "", "", "", ""));
    }
}

contract DropCoin is ERC20 {
    constructor(string memory s) ERC20(s, s) { _mint(msg.sender, 1_000_000_000 ether); }
}
