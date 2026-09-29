// SPDX-License-Identifier: MIT
// Token Scanner v3 transfer probe. Never deployed: eth_call puts this code at
// an address (a state override), then asks it to send some of a token. The
// code runs AS that address, so the token sees ordinary transfers.
//
//   probe(token, to, amount)        one transfer: did it go through, how much arrived
//                                   (same selector as ScanProbe v1)
//   hop(token, mid, to, amount)     this → mid, then mid (also given this code) →
//                                   `to` with what arrived: "can a brand-new holder
//                                   sell?" (the pool → fresh wallet → pool round trip)
//   twice(token, to, amount)        the same transfer two times in one transaction:
//                                   a second one refused = a cooldown between sells
pragma solidity ^0.8.24;

contract ScanProbe2 {
    function probe(address token, address to, uint256 amount) public returns (bool ok, uint256 sent, uint256 received, bytes memory err) {
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

    function hop(address token, address mid, address to, uint256 amount)
        external
        returns (bool ok1, uint256 recv1, bool ok2, uint256 sent2, uint256 recv2, bytes memory err)
    {
        bytes memory e1;
        (ok1, , recv1, e1) = probe(token, mid, amount);
        if (!ok1 || recv1 == 0) return (ok1, recv1, false, 0, 0, e1);
        try ScanProbe2(mid).probe(token, to, recv1) returns (bool b, uint256 s2, uint256 r2, bytes memory e2) {
            return (true, recv1, b, s2, r2, e2);
        } catch (bytes memory e3) {
            return (true, recv1, false, 0, 0, e3);
        }
    }

    function twice(address token, address to, uint256 amount)
        external
        returns (bool ok1, uint256 recv1, bool ok2, uint256 recv2, bytes memory err)
    {
        bytes memory e1;
        (ok1, , recv1, e1) = probe(token, to, amount);
        if (!ok1) return (false, 0, false, 0, e1);
        (ok2, , recv2, err) = probe(token, to, amount);
    }

    function _bal(address token, address who) private view returns (uint256 v) {
        (bool s, bytes memory r) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (s && r.length >= 32) v = abi.decode(r, (uint256));
    }
}
