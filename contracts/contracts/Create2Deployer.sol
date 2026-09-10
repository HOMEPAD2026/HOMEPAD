// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deploys a contract to a chosen CREATE2 address. Needed because
///         Uniswap V4 requires a hook's own address to encode which
///         callbacks it uses (specific bits must be set) — a plain `new`
///         deployment can't target that, since its address depends on the
///         deployer's nonce, not a chosen salt.
contract Create2Deployer {
    event Deployed(address addr, bytes32 salt);

    function deploy(bytes32 salt, bytes memory bytecode) external returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        require(addr != address(0), "CREATE2 deploy failed");
        emit Deployed(addr, salt);
    }

    function computeAddress(bytes32 salt, bytes32 bytecodeHash) external view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)))));
    }
}
