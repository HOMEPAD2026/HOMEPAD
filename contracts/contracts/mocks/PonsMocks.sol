// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// test-only: the Pons V2 Fee Escrow's claim ledger (credit by recipient address, claim pays msg.sender)
contract MockPonsEscrow {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) private tok;
    function credit(address recipient) external payable { balanceOf[recipient] += msg.value; }
    function creditToken(address recipient, address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        tok[recipient][token] += amount;
    }
    function balanceOfToken(address recipient, address token) external view returns (uint256) { return tok[recipient][token]; }
    function claim() external returns (uint256 amount) {
        amount = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "escrow: pay");
    }
    function claimToken(address token) external returns (uint256 amount) {
        amount = tok[msg.sender][token];
        tok[msg.sender][token] = 0;
        IERC20(token).transfer(msg.sender, amount);
    }
}

/// test-only: the factory's fee-recipient guard on setBuybackEnabled
contract MockPonsFactoryV2 {
    mapping(address => address) public recipientOf;
    mapping(address => bool) public buyback;
    function setRecipient(address token, address r) external { recipientOf[token] = r; }
    function setBuybackEnabled(address token, bool enabled) external {
        require(msg.sender == recipientOf[token], "NotBuybackController");
        buyback[token] = enabled;
    }
}

/// test-only: a wallet that refuses ETH
contract RefusesEth { receive() external payable { revert("no"); } }

/// test-only: the parts of PonsV2LaunchFactory that ArcPad reads and calls (launchToken, getLaunchedToken, the
/// launch terms), with a launched coin that answers like PonsV2LauncherToken and a curve that answers like
/// PonsV2BondingCurve's reserve views. Not Pons's logic — only its interface.
contract MockPonsToken {
    string public name; string public symbol; string public logo; string public description;
    uint256 public constant totalSupply = 1e27; uint8 public constant decimals = 18;
    string private tw; string private tg; string private dc; string private ws; string private fc;
    constructor(string memory n, string memory s, string memory l, string memory d, MockPonsLaunchpad.Socials memory so) {
        name = n; symbol = s; logo = l; description = d; tw = so.twitter; tg = so.telegram; dc = so.discord; ws = so.website; fc = so.farcaster;
    }
    function socials() external view returns (string memory, string memory, string memory, string memory, string memory) { return (tw, tg, dc, ws, fc); }
}

contract MockPonsCurve {
    uint256 public quoteReserve; uint256 public tokenReserve; uint256 public realQuoteReserve;
    constructor(uint256 q, uint256 t) { quoteReserve = q; tokenReserve = t; }
    function getReserves() external view returns (uint256, uint256) { return (quoteReserve, tokenReserve); }
    function setReserves(uint256 q, uint256 t, uint256 real) external { quoteReserve = q; tokenReserve = t; realQuoteReserve = real; }
}

contract MockPonsLaunchpad {
    struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }
    struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }
    struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }
    struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }

    event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold);
    error LaunchFeeNotPaid();
    error LaunchEconomicsMismatch(bytes32 expected, bytes32 actual);
    error CreatorTaxTooHigh();
    error NotWhitelisted();

    address public immutable feeEscrow; address public memeHook = address(0x4444); address public poolManager = address(0x5555);
    uint256 public launchFee = 0.001 ether; uint256 public maxCreatorTaxBps = 1000; bool public launchEnabled = true;
    mapping(address => LaunchedToken) private launched;
    LaunchConfig private cfg = LaunchConfig(1e27, 100, 1.5 ether, 4.2 ether, 10000, 200, true);

    constructor(address escrow_) { feeEscrow = escrow_; }
    function setLaunchEnabled(bool on) external { launchEnabled = on; }
    function canLaunch(address) external view returns (bool) { return launchEnabled; }
    function launchConfigCount() external pure returns (uint256) { return 1; }
    function getLaunchConfig(uint256) external view returns (LaunchConfig memory) { return cfg; }
    function previewLaunchEconomics(uint256 id, address pair) public view returns (bytes32) { return keccak256(abi.encode(id, pair, cfg.phantomQuote, cfg.graduationThreshold)); }
    function getLaunchedToken(address token) external view returns (LaunchedToken memory) { return launched[token]; }
    function setRecipientOverride(address token, address r) external { launched[token].creatorFeeRecipient = r; }

    function launchToken(TokenParams calldata p, uint256 id, address pair) external payable returns (address token, address curve) {
        if (!launchEnabled) revert NotWhitelisted();
        if (msg.value != launchFee) revert LaunchFeeNotPaid();
        bytes32 want = previewLaunchEconomics(id, pair);
        if (p.expectedEconomics != bytes32(0) && p.expectedEconomics != want) revert LaunchEconomicsMismatch(p.expectedEconomics, want);
        if (p.creatorTaxBps > maxCreatorTaxBps) revert CreatorTaxTooHigh();
        token = address(new MockPonsToken(p.name, p.symbol, p.logo, p.description, p.socials));
        curve = address(new MockPonsCurve(cfg.phantomQuote, cfg.supply));
        address r = p.creatorFeeRecipient == address(0) ? msg.sender : p.creatorFeeRecipient;
        launched[token] = LaunchedToken(token, curve, msg.sender, r, pair, cfg.graduationThreshold, cfg.poolFee, cfg.tickSpacing, p.creatorTaxBps, p.buybackEnabled, 0, 0, 0, 0, true);
        emit TokenLaunched(token, curve, msg.sender, pair, id, cfg.graduationThreshold);
    }
    function setBuybackEnabled(address token, bool enabled) external {
        require(msg.sender == launched[token].creatorFeeRecipient, "NotBuybackController");
        launched[token].buybackEnabled = enabled;
    }
}
