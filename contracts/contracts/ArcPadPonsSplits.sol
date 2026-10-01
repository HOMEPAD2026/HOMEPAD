// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// The parts of Pons V2 a splitter touches (pons-labs, contractsV2/src/v2/interfaces/ILaunchpadV2.sol).
interface IPonsV2FeeEscrowLike {
    function claim() external returns (uint256 amount);
    function claimToken(address token) external returns (uint256 amount);
    function balanceOf(address recipient) external view returns (uint256);
    function balanceOfToken(address recipient, address token) external view returns (uint256);
}

interface IPonsV2FactoryLike {
    function setBuybackEnabled(address token, bool enabled) external;
}

/// @title ArcPad × Pons — creator fee splitter
/// @notice A Pons V2 coin launched through ArcPad names this contract as its `creatorFeeRecipient`. Pons credits
///         the coin's creator fees to it in its Fee Escrow (ETH, or the pair token). Anyone may call `claim()`:
///         it pulls the balance out of the escrow and pays 70% to the creator and 30% to the ARCIRCLE PAD treasury.
///         Pons only lets the current fee recipient hand the fees to another address, and this contract has no
///         function that does — so the 70 / 30 split stays for the life of the coin.
///         The creator may move their own 70% to another wallet (`setCreator`) and may turn the coin's
///         buyback-and-lock on or off (`setBuybackEnabled`, which Pons only takes from the fee recipient).
contract ArcPadPonsSplitter {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    address public immutable splits; // the ArcPadPonsSplits that made it
    IPonsV2FeeEscrowLike public immutable escrow;
    IPonsV2FactoryLike public immutable ponsFactory;
    address public immutable treasury;
    uint16 public immutable platformBps;
    address public creator;

    uint256 private lock = 1;

    event CreatorSet(address indexed previous, address indexed creator);
    event Paid(address indexed asset, uint256 toCreator, uint256 toTreasury);

    error NotCreator();
    error ZeroAddress();
    error Reentered();
    error PayFailed(address to);

    modifier once() { if (lock != 1) revert Reentered(); lock = 2; _; lock = 1; }

    constructor(address _creator, address _escrow, address _ponsFactory, address _treasury, uint16 _platformBps) {
        if (_creator == address(0) || _escrow == address(0) || _ponsFactory == address(0) || _treasury == address(0)) revert ZeroAddress();
        splits = msg.sender;
        creator = _creator;
        escrow = IPonsV2FeeEscrowLike(_escrow);
        ponsFactory = IPonsV2FactoryLike(_ponsFactory);
        treasury = _treasury;
        platformBps = _platformBps;
        emit CreatorSet(address(0), _creator);
    }

    /// ETH from the escrow (or anyone) waits here until the next split
    receive() external payable {}

    /// @notice Pulls this splitter's ETH out of the Pons escrow and splits everything it holds, 70 / 30.
    function claim() external once returns (uint256 toCreator, uint256 toTreasury) {
        if (escrow.balanceOf(address(this)) > 0) escrow.claim();
        uint256 bal = address(this).balance;
        if (bal == 0) return (0, 0);
        toTreasury = (bal * platformBps) / BPS;
        toCreator = bal - toTreasury;
        _sendEth(creator, toCreator);
        _sendEth(treasury, toTreasury);
        emit Paid(address(0), toCreator, toTreasury);
    }

    /// @notice The same for fees credited in an ERC-20 (a launch paired with a token instead of ETH).
    function claimToken(address token) external once returns (uint256 toCreator, uint256 toTreasury) {
        if (escrow.balanceOfToken(address(this), token) > 0) escrow.claimToken(token);
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) return (0, 0);
        toTreasury = (bal * platformBps) / BPS;
        toCreator = bal - toTreasury;
        IERC20(token).safeTransfer(creator, toCreator);
        IERC20(token).safeTransfer(treasury, toTreasury);
        emit Paid(token, toCreator, toTreasury);
    }

    /// @notice What a claim would split now: the escrow's ETH for this splitter plus any ETH already here.
    function pending() external view returns (uint256) {
        return escrow.balanceOf(address(this)) + address(this).balance;
    }

    /// @notice The creator moves their 70% to another wallet (the treasury's 30% can't be moved).
    function setCreator(address next) external {
        if (msg.sender != creator) revert NotCreator();
        if (next == address(0)) revert ZeroAddress();
        emit CreatorSet(creator, next);
        creator = next;
    }

    /// @notice The creator turns a coin's buyback-and-lock on or off (Pons takes it only from the fee recipient).
    function setBuybackEnabled(address token, bool enabled) external {
        if (msg.sender != creator) revert NotCreator();
        ponsFactory.setBuybackEnabled(token, enabled);
    }

    function _sendEth(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert PayFailed(to);
    }
}

/// @title ArcPad × Pons — splitter factory
/// @notice One splitter per creator wallet, at an address known before it exists (CREATE2), so a launch can name it
///         as the fee recipient in the same transaction: Pons credits the escrow by address, and the splitter can be
///         deployed later — by anyone, with `claimFor` — to collect. `splitterOf(creator)` is what the ArcPad launch
///         page passes as `creatorFeeRecipient`, and what the listing checks.
contract ArcPadPonsSplits {
    address public immutable escrow;
    address public immutable ponsFactory;
    address public immutable treasury;
    uint16 public immutable platformBps;
    bytes32 public immutable initHashBase; // keccak of the creation code (constructor args are appended per creator)

    event SplitterDeployed(address indexed creator, address splitter);

    error BadBps();

    constructor(address _escrow, address _ponsFactory, address _treasury, uint16 _platformBps) {
        if (_platformBps == 0 || _platformBps >= 10_000) revert BadBps();
        escrow = _escrow;
        ponsFactory = _ponsFactory;
        treasury = _treasury;
        platformBps = _platformBps;
        initHashBase = keccak256(type(ArcPadPonsSplitter).creationCode);
    }

    function _init(address creator) private view returns (bytes memory) {
        return abi.encodePacked(type(ArcPadPonsSplitter).creationCode, abi.encode(creator, escrow, ponsFactory, treasury, platformBps));
    }

    /// @notice The splitter address for `creator` (deployed or not).
    function splitterOf(address creator) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(bytes1(0xff), address(this), bytes32(uint256(uint160(creator))), keccak256(_init(creator))));
        return address(uint160(uint256(h)));
    }

    /// @notice Deploys `creator`'s splitter if it isn't there yet; returns it either way.
    function deploy(address creator) public returns (address s) {
        s = splitterOf(creator);
        if (s.code.length > 0) return s;
        bytes memory init = _init(creator);
        bytes32 salt = bytes32(uint256(uint160(creator)));
        assembly { s := create2(0, add(init, 0x20), mload(init), salt) }
        require(s != address(0), "deploy");
        emit SplitterDeployed(creator, s);
    }

    /// @notice Deploys if needed and claims `creator`'s fees (anyone may call; the payouts are fixed).
    function claimFor(address creator) external returns (uint256 toCreator, uint256 toTreasury) {
        return ArcPadPonsSplitter(payable(deploy(creator))).claim();
    }
}
