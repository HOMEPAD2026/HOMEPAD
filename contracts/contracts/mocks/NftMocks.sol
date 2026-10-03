// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// test-only: a listing "marketplace" shaped like a Seaport basic order — the buyer sends ETH, the seller's NFT goes
/// to the caller with safeTransferFrom, the seller is paid and any change goes back. Not Seaport's logic.
contract MockSeaport {
    function fulfill(address nft, uint256 id, address seller, uint256 price) external payable returns (bool) {
        require(msg.value >= price, "price");
        IERC721(nft).safeTransferFrom(seller, msg.sender, id);
        (bool ok, ) = seller.call{value: price}("");
        require(ok, "pay");
        if (msg.value > price) { (ok, ) = msg.sender.call{value: msg.value - price}(""); require(ok, "change"); }
        return true;
    }
    /// takes the ETH and sends nothing
    function scam() external payable returns (bool) { return true; }
    /// sends the NFT somewhere else
    function misdirect(address nft, uint256 id, address seller, address to) external payable returns (bool) {
        IERC721(nft).transferFrom(seller, to, id);
        return true;
    }
}

/// test-only: Arbitrum's ArbSys block numbers and hashes, mapped onto the test chain's own
contract MockArbSys {
    function arbBlockNumber() external view returns (uint256) { return block.number; }
    function arbBlockHash(uint256 n) external view returns (bytes32) { return blockhash(n); }
}

/// test-only: an NFT whose transfers can be switched off (a raffle that can't pay out)
contract FrozenNFT {
    mapping(uint256 => address) public ownerOf;
    bool public frozen;
    function mint(address to, uint256 id) external { ownerOf[id] = to; }
    function freeze() external { frozen = true; }
    function transferFrom(address from, address to, uint256 id) external { require(!frozen && ownerOf[id] == from, "frozen"); ownerOf[id] = to; }
}

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// test-only: the vault's leaf + proof check on its own (the server's tree must match it)
contract MerkleCheck {
    function check(bytes32[] calldata proof, bytes32 root, address a, uint256 s, uint256 e) external pure returns (bool) {
        return MerkleProof.verifyCalldata(proof, root, keccak256(bytes.concat(keccak256(abi.encode(a, s, e)))));
    }
}
