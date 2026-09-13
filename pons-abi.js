// pons-abi.js — Pons V2 contract interfaces (a third-party protocol, not
// HOMEPAD's own). Transcribed directly from docs.ponsfamily.com/v2's
// integration reference, not guessed. ethers v6's human-readable ABI
// parser does not support named `struct X {...}` declarations referenced
// by name elsewhere (that's a viem parseAbi feature) — confirmed by
// testing — so structs are written as inline `tuple(...)` types instead.
// Encoding a real launchToken() call against this ABI was verified to
// round-trip correctly before this shipped.

const PONS_SOCIALS_T = "tuple(string twitter, string telegram, string discord, string website, string farcaster)";
const PONS_TOKEN_PARAMS_T = `tuple(string name, string symbol, string logo, string description, ${PONS_SOCIALS_T} socials, address creatorFeeRecipient, uint16 creatorTaxBps, bool buybackEnabled, bytes32 expectedEconomics, bytes32 salt)`;
const PONS_LAUNCH_CONFIG_T = "tuple(uint256 supply, uint256 curveFeeBps, uint256 phantomQuote, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, bool enabled)";
const PONS_LAUNCHED_TOKEN_T = "tuple(address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists)";
const PONS_FEE_POLICY_T = "tuple(address protocolFeeRecipient, uint16 protocolFeeShareBps, uint16 buybackBurnBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps)";

const PONS_FACTORY_ABI = [
  "function launchConfigCount() view returns (uint256)",
  `function getLaunchConfig(uint256 id) view returns (${PONS_LAUNCH_CONFIG_T})`,
  `function launchToken(${PONS_TOKEN_PARAMS_T} params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)`,
  `function launchToken(${PONS_TOKEN_PARAMS_T} params, uint256 launchConfigId, address pairToken, address[] snipeTaxExemptions) payable returns (address token, address curve)`,
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  "function launchFee() view returns (uint256)",
  "function canLaunch(address) view returns (bool)",
  "function launchEnabled() view returns (bool)",
  "function whitelistedLaunchers(address) view returns (bool)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function approvedPairTokens(address pairToken) view returns (bool)",
  "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)",
  `function getLaunchedToken(address token) view returns (${PONS_LAUNCHED_TOKEN_T})`,
  `function getLaunchFeePolicy(address token) view returns (${PONS_FEE_POLICY_T})`,
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
];

const PONS_CURVE_ABI = [
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
  "function isNativeQuote() view returns (bool)",
  "function pairToken() view returns (address)",
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function sellableTokens() view returns (uint256)",
  "function reservedTokens() view returns (uint256)",
  "function readyToGraduate() view returns (bool)",
  "function graduated() view returns (bool)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function buybackEnabled() view returns (bool)",
  "function currentSnipeTaxBps(address recipient) view returns (uint256)",
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
];

const PONS_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  `function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, ${PONS_SOCIALS_T} tokenSocials)`,
];
