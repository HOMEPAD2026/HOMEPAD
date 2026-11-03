// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICrimsonBidsLike {
    function bid(uint256 tokenId, uint256 amount, uint64 expiry) external;
    function cancelBid(uint256 tokenId) external;
}

/// A bidder contract that tries to take its offer back while the piece is being sent to it (test only).
contract BidsReenter {
    ICrimsonBidsLike public immutable bids;
    IERC20 public immutable usdc;
    constructor(address bids_, address usdc_) { bids = ICrimsonBidsLike(bids_); usdc = IERC20(usdc_); }
    function place(uint256 tokenId, uint256 amount, uint64 expiry) external {
        usdc.approve(address(bids), amount);
        bids.bid(tokenId, amount, expiry);
    }
    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        bids.cancelBid(tokenId);
        return this.onERC721Received.selector;
    }
}
