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
  RPC_URL: "https://rpc.mainnet.arc.io",
  // Same WalletConnect/Reown project as the rest of the site (a project ID
  // isn't chain-restricted for basic RPC/wallet-connect use) — see
  // config.js's own REOWN_PROJECT_ID.
  REOWN_PROJECT_ID: "278f543c581f60eec5975dc755f0c3dd",
  // No HomepadFactoryArc/BigPad-on-Arc contracts existed before deployment.
  // Set this to the deploy block's timestamp once real (matches how
  // CONTRACTS_LIVE_SINCE/BIGPAD_LIVE_SINCE work in config.js) — until then,
  // leave it recent so any eth_getLogs scan stays cheap.
  CONTRACTS_LIVE_SINCE: "2026-09-22T00:00:00Z",

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
  ARCPAD_FACTORY_ADDRESS: "",
  ARCPAD_HOOK_ADDRESS: "",
  ARCPAD_ROUTER_ADDRESS: "",

  // --- CIRCLEPAD (BigPadEscrow + BigPadVote, redeployed fresh on Arc — the
  // contracts are chain-agnostic native-currency contracts, so Arc's own
  // native USDC is what they raise without any code change) ---
  CIRCLEPAD_ESCROW_ADDRESS: "",
  CIRCLEPAD_VOTE_ADDRESS: "",
};
