// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

contract TestToken is ERC20 {
    uint8 private immutable d;
    constructor(string memory n, string memory s, uint8 dec) ERC20(n, s) { d = dec; }
    function decimals() public view override returns (uint8) { return d; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

/// Argus-like tax hook: takes `bps` of every swap's output in afterSwap (returns delta). Stateless, so its
/// runtime code can be placed at an address carrying the 0x2044 permission bits.
contract TaxHook {
    IPoolManager public immutable pm;
    uint256 public immutable bps;
    constructor(IPoolManager _pm, uint256 _bps) { pm = _pm; bps = _bps; }
    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) { return TaxHook.beforeInitialize.selector; }
    function afterSwap(address, PoolKey calldata key, SwapParams calldata p, BalanceDelta d, bytes calldata) external returns (bytes4, int128) {
        // exact input: the unspecified currency is the output
        bool outIs1 = p.zeroForOne;
        int128 out = outIs1 ? d.amount1() : d.amount0();
        if (out <= 0) return (TaxHook.afterSwap.selector, 0);
        uint256 fee = uint256(uint128(out)) * bps / 10000;
        if (fee > 0) pm.take(outIs1 ? key.currency1 : key.currency0, address(this), fee);
        return (TaxHook.afterSwap.selector, int128(int256(fee)));
    }
}
