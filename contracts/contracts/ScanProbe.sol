// SPDX-License-Identifier: MIT
// Token Scanner transfer probe. Never deployed: eth_call puts this code at an
// address that already holds the token (a state override), then asks it to
// send some. Because the code runs AS that address, the token sees a normal
// transfer from a real holder — which shows whether transfers go through and
// how much actually arrives (transfer tax).
pragma solidity ^0.8.24;

contract ScanProbe {
    function probe(address token, address to, uint256 amount) external returns (bool ok, uint256 sent, uint256 received, bytes memory err) {
        uint256 s0 = _bal(token, address(this));
        uint256 r0 = _bal(token, to);
        (bool s, bytes memory r) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!s) return (false, 0, 0, r);
        if (r.length >= 32 && abi.decode(r, (uint256)) == 0) return (false, 0, 0, r);
        uint256 s1 = _bal(token, address(this));
        uint256 r1 = _bal(token, to);
        unchecked {
            sent = s0 > s1 ? s0 - s1 : 0;
            received = r1 > r0 ? r1 - r0 : 0;
        }
        return (true, sent, received, "");
    }

    function _bal(address token, address who) private view returns (uint256 v) {
        (bool s, bytes memory r) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (s && r.length >= 32) v = abi.decode(r, (uint256));
    }
}
