// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { OmniControls } from "./OmniControls.sol";

/// @title ArcircleOFT — $ARCIRCLE on an EVM chain other than Arc (Robinhood Chain first).
/// @notice A plain mint/burn OFT with no supply of its own: the constructor mints nothing and nothing can
///         mint except a LayerZero message from a wired peer (the Arc lockbox, or another OFT that burned the
///         same amount). Its totalSupply is exactly the $ARCIRCLE that left Arc (or Solana) for this chain.
///         Pause / guardian / per-destination rate limits come from OmniControls.
contract ArcircleOFT is OFT, OmniControls {
    constructor(string memory _name, string memory _symbol, address _lzEndpoint, address _owner)
        OFT(_name, _symbol, _lzEndpoint, _owner)
        Ownable(_owner)
    {}

    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal override whenNotPaused returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);
        _outflow(_dstEid, amountSentLD);
        _burn(_from, amountSentLD);
    }

    function _credit(address _to, uint256 _amountLD, uint32 _srcEid) internal override whenNotPaused returns (uint256) {
        return super._credit(_to, _amountLD, _srcEid);
    }
}
