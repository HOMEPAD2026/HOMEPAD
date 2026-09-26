// Config for the Arc-chain products — ARCPAD (arcpad.html/arcpad.js) and
// CIRCLEPAD (circlepad.html/circlepad.js). Deliberately a SEPARATE file
// from config.js (Robinhood Chain / $HOME / HOMEPAD V1): both define a
// global `CONFIG`, so never load both on the same page.
//
// wallet-appkit.js is already fully chain-agnostic — it reads every network
// parameter (CHAIN_ID_DECIMAL, CHAIN_ID_HEX, CHAIN_NAME, NATIVE_CURRENCY,
// RPC_URL, BLOCK_EXPLORER, REOWN_PROJECT_ID) from whatever CONFIG is loaded,
// so pointing it at this file is the only change needed for wallet
// connect/network-switch to work against Arc — nothing in wallet-appkit.js
// itself is Robinhood-specific.
const CONFIG = {
  CHAIN_ID_HEX: "0x13b2", // 5042 (Arc mainnet) in hex. 5042002 is Arc TESTNET — do not confuse them.
  CHAIN_ID_DECIMAL: 5042,
  CHAIN_NAME: "Arc",
  // What wallets show on their connect / approve screens (WalletConnect).
  APP_NAME: "ARCIRCLE PAD",
  APP_DESCRIPTION: "ArcPad and CirclePad — launch coins on Circle's Arc, paired in USDC.",
  APP_ICON: "/images/apple-touch-icon.png",
  RPC_URL: "https://rpc.mainnet.arc.io",
  // Read-only fallbacks, used only when RPC_URL stops answering. These are
  // the keyless mainnet endpoints listed in Arc's own docs
  // (docs.arc.io → References → RPC endpoints). Each is health-checked
  // (eth_chainId must be 5042) before the page switches to it.
  RPC_FALLBACKS: [
    "https://rpc.blockdaemon.mainnet.arc.io",
    "https://rpc.drpc.mainnet.arc.io",
    "https://rpc.quicknode.mainnet.arc.io",
  ],
  // Same WalletConnect/Reown project as the rest of the site (a project ID
  // isn't chain-restricted for basic RPC/wallet-connect use) — see
  // config.js's own REOWN_PROJECT_ID.
  REOWN_PROJECT_ID: "278f543c581f60eec5975dc755f0c3dd",
  // No HomepadFactoryArc/BigPad-on-Arc contracts existed before deployment.
  // Set this to the deploy block's timestamp once real (matches how
  // CONTRACTS_LIVE_SINCE/BIGPAD_LIVE_SINCE work in config.js) — until then,
  // leave it recent so any eth_getLogs scan stays cheap.
  CONTRACTS_LIVE_SINCE: "2026-09-22T04:00:00Z",

  // Arc's native currency IS USDC — its NATIVE representation uses 18
  // decimals (same as ETH); the separate ERC-20 USDC interface below uses
  // 6. Never confuse the two — see HomepadFactoryArc.sol's own comments.
  NATIVE_CURRENCY: { name: "USDC", symbol: "USDC", decimals: 18 },
  BLOCK_EXPLORER: "https://arc.etherscan.io",

  // Arc's native-USDC ERC-20 predeploy (6 decimals) — cross-checked against
  // Circle's own Arc docs and Uniswap's UniswapX playbook. This is the
  // quote token ARCPAD launches are priced in.
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  // Uniswap v4 PoolManager on Arc mainnet — same cross-check.
  POOL_MANAGER_ADDRESS: "0x8366a39CC670B4001A1121B8F6A443A643e40951",

  // --- ARCPAD (HomepadFactoryArc + HomepadHybridHook + HomepadArcSwapRouter) ---
  // Filled in once scripts/deploy-homepad-factory-arc.js actually runs
  // against --network arcMainnet. Empty here shows as "soon" in the UI,
  // same convention as config.js's own FACTORY_ADDRESS.
  // --- $ARCIRCLE, the core coin ---
  // Launched on Argus (argus.world) on 25 Sep 2026: a Uniswap v4 pool on
  // Arc's PoolManager, paired with USDC's ERC-20 interface (6 decimals), with
  // the whole supply in one locked position (no virtual curve, no migration).
  // Keep api/_arcircle.mjs in step. An empty ARCIRCLE_TOKEN switches every
  // page to "Not live".
  ARCIRCLE_TOKEN: "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7",
  ARCIRCLE_POOL_ID: "0xfd282cf8bbc57813724e7c6cb1bda6bdf5d2caf02b3bce60cc6aac38ed26ebba",
  // keccak256(poolId ‖ uint256(6)) — where the PoolManager keeps this pool's slot0
  // (read with extsload; lets pages without ethers read the price)
  ARCIRCLE_POOL_SLOT: "0xad85d721d91ab50f533ac7d86b01e50798b891ac2a1502187e974fabc0cf854b",
  ARCIRCLE_QUOTE_DECIMALS: 6, // USDC (ERC-20 interface, 0x3600…)
  ARCIRCLE_CURVE: "", // only for a foci-style bonding-curve launch (the first launch was one)
  ARCIRCLE_VENUE: "Argus",
  ARCIRCLE_BUY_URL: "https://argus.world/token/0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7",
  ARCIRCLE_CHART_URL: "https://dexscreener.com/arc/0xfd282cf8bbc57813724e7c6cb1bda6bdf5d2caf02b3bce60cc6aac38ed26ebba",
  ARCIRCLE_LAUNCHED_AT: 1790345391, // unix seconds the pool was created

  ARCPAD_FACTORY_ADDRESS: "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E",
  ARCPAD_HOOK_ADDRESS: "0x484D416E73Eb44d276DDeF04cDBAdf2f4907c044",
  ARCPAD_ROUTER_ADDRESS: "0xFCA8fD788d44Bb335B1451257366e06D67114785",

  // --- CIRCLEPAD (BigPadEscrow + BigPadVote, redeployed fresh on Arc — the
  // contracts are chain-agnostic native-currency contracts, so Arc's own
  // native USDC is what they raise without any code change) ---
  CIRCLEPAD_ESCROW_ADDRESS: "0xC5998d7cE728FDd6f77217fdE775aAb90Ec61703",
  // Round #1 started; BigPadVote deployed against it on 26 Sep 2026
  // (deploy-bigpad-vote.js). Voting runs from the escrow's deadline for 48h.
  CIRCLEPAD_VOTE_ADDRESS: "0x23c376615a58F059FC4bc83A38eB4aCdF8d39ff2",
  // Voting is burn-to-vote: 1 vote = 1,000 $ARCIRCLE sent to 0x…dEaD, open to
  // any holder. Candidates stay on BigPadVote above; ArcircleBurnVote counts the
  // burned votes (deploy-arcircle-burn-vote.js). "" until it's deployed — the
  // page then explains the rules but can't take votes yet.
  CIRCLEPAD_VOTE_MODE: "burn",
  // ArcircleBurnVote deployed 27 Sep 2026 (deploy-arcircle-burn-vote.js)
  CIRCLEPAD_BURNVOTE_ADDRESS: "0x89A5E13a969b42887980d7136B91C05a3849CB70",
  // Optional, shown on /circle (circlepad-plus.js):
  //   CIRCLEPAD_OPENS_AT — the announced opening time (unix seconds): an
  //     "opens in" countdown and a calendar file before start(); 0 = not announced
  //   CIRCLEPAD_ESCROW_VERIFIED — true once the escrow's source is verified on the explorer
  //   CIRCLEPAD_ALLOCATION_NOTE — how the new coin is shared with contributors
  //     (shown in the "after the close" questions; empty = "not decided yet")
  CIRCLEPAD_OPENS_AT: 0,
  CIRCLEPAD_ESCROW_VERIFIED: false,
  CIRCLEPAD_ALLOCATION_NOTE: "",

  // --- Bridge (arc-bridge.js): Circle's CCTP V2, native USDC burned on one
  // chain and minted on the other. Same TokenMessengerV2 / MessageTransmitterV2
  // on every chain below (developers.circle.com/cctp/references/contract-addresses);
  // Arc is CCTP domain 26. USDC addresses: developers.circle.com/stablecoins/usdc-contract-addresses.
  BRIDGE: {
    TOKEN_MESSENGER: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    MESSAGE_TRANSMITTER: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    ARC_DOMAIN: 26,
    CHAINS: [
      { key: "base", name: "Base", chainId: 8453, domain: 6, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", rpc: "https://base-rpc.publicnode.com", explorer: "https://basescan.org", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#3b82f6" },
      { key: "ethereum", name: "Ethereum", chainId: 1, domain: 0, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#8a92b2" },
      { key: "arbitrum", name: "Arbitrum", chainId: 42161, domain: 3, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", rpc: "https://arbitrum-one-rpc.publicnode.com", explorer: "https://arbiscan.io", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#28a0f0" },
      { key: "optimism", name: "OP Mainnet", chainId: 10, domain: 2, usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", rpc: "https://optimism-rpc.publicnode.com", explorer: "https://optimistic.etherscan.io", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#ff0420" },
      { key: "polygon", name: "Polygon", chainId: 137, domain: 7, usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com", native: { name: "POL", symbol: "POL", decimals: 18 }, color: "#8247e5" },
      { key: "avalanche", name: "Avalanche", chainId: 43114, domain: 1, usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", rpc: "https://avalanche-c-chain-rpc.publicnode.com", explorer: "https://snowtrace.io", native: { name: "Avalanche", symbol: "AVAX", decimals: 18 }, color: "#e84142" },
      { key: "unichain", name: "Unichain", chainId: 130, domain: 10, usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", rpc: "https://unichain-rpc.publicnode.com", explorer: "https://uniscan.xyz", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#f50db4" },
      { key: "linea", name: "Linea", chainId: 59144, domain: 11, usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", rpc: "https://linea-rpc.publicnode.com", explorer: "https://lineascan.build", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#61dfff" },
    ],
  },

  // --- ArcLock: creator time locks ("Locked" badge on ArcPad coins) ---
  // Empty until contracts/scripts/deploy-arc-lock.js runs on arcMainnet;
  // the lock button and badge stay hidden while it's empty.
  ARCLOCK_ADDRESS: "0x64F893947Fe2c4fe7058CFba899eA269CBa9F006",
  // ArcLPLock (contracts/ArcLPLock.sol, scripts/deploy-arc-lplock.js): time locks
  // for Uniswap v4 LP positions, used by the Liquidity Manager. Deployed 27 Sep 2026 —
  // keep api/_liq-core.mjs LIQ_ADDR.lplock in step.
  LPLOCK_ADDRESS: "0x674E7010Dab5cCb519e06df72b1D4c063952f45B",

  // --- ArcMultiSend: the Multisender utility (arcpad.html#multisend) ---
  // Deployed with contracts/scripts/deploy-arc-multisend.js (2026-09-26).
  // Empty it to put the page back into preview (no sending).
  MULTISEND_ADDRESS: "0x21733285F844cb2F03a5d692de9974F379889956",
  // ArcMultiSendV2 (permit, a token per row, NFTs) and ArcDrop (claim drops):
  // empty until contracts/scripts/deploy-arc-multisend-v2.js / deploy-arc-drop.js
  // run — their modes stay hidden until then. Keep api/_drop.mjs in step.
  MULTISEND_V2_ADDRESS: "",
  DROP_ADDRESS: "",
};

// true once $ARCIRCLE is live (its contract address is set above)
const ARCIRCLE_LIVE = /^0x[0-9a-fA-F]{40}$/.test(CONFIG.ARCIRCLE_TOKEN || "");
/// USD per $ARCIRCLE from its pool's sqrtPriceX96 (a Number or BigInt).
/// v4 sorts currencies by address; r = sqrtP² / 2^192 is raw currency1 per raw
/// currency0; $ARCIRCLE has 18 decimals, the USDC quote CONFIG.ARCIRCLE_QUOTE_DECIMALS.
function arcircleUsdFromSqrt(sqrtX96) {
  var sp = Number(sqrtX96);
  if (!(sp > 0) || !ARCIRCLE_LIVE) return null;
  var r = Math.pow(sp / Math.pow(2, 96), 2);
  var isToken0 = BigInt(CONFIG.ARCIRCLE_TOKEN) < 0x3600000000000000000000000000000000000000n;
  var p = (isToken0 ? r : 1 / r) * Math.pow(10, 18 - (CONFIG.ARCIRCLE_QUOTE_DECIMALS || 6));
  return isFinite(p) && p > 0 ? p : null;
}
