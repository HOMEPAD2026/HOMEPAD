// Fill these in once HomepadFactory is actually deployed (see the main
// project's scripts/deploy.js). The launchpad app doesn't work until
// FACTORY_ADDRESS is set to a real deployed contract — the $HOME stats
// panel above it works independently of that.
const CONFIG = {
  CHAIN_ID_HEX: "0x1237", // 4663 (Robinhood Chain mainnet) in hex.
  CHAIN_ID_DECIMAL: 4663,
  CHAIN_NAME: "Robinhood Chain",
  RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
  BLOCK_EXPLORER: "https://robinhoodchain.blockscout.com",
  NATIVE_CURRENCY: { name: "ETH", symbol: "ETH", decimals: 18 },

  FACTORY_ADDRESS: "", // Bonding Curve — deferred for mainnet launch (V2 router on Robinhood Chain unconfirmed). Shows as "soon".
  // --- Stock pair (paired hybrid: same single-sided v4 pool as Hybrid, but
  // priced in an ERC-20 quote token — Robinhood Stock Tokens; $HOME later).
  // Deploy with contracts/scripts/deploy-paired.js and paste here. Leave
  // blank to keep "Stock" as a preview tab in the launch form.
  PAIRED_FACTORY_ADDRESS: "", // Stock Pair — deferred for mainnet launch. Shows as "soon".
  PAIRED_HOOK_ADDRESS: "",
  PAIRED_SWAP_ROUTER_ADDRESS: "",
  LEGACY_PAIRED_FACTORIES: [], // [{ factory, router }] — same idea as LEGACY_HYBRID_FACTORIES
  // Quote tokens offered in the Stock tab. `defaultVirtualQuote` is the
  // suggested starting price, in the convention every HOMEPAD mode uses:
  // "this many of the quote buys the entire 1B supply". On testnet these
  // are the mock tokens deploy-paired.js prints with DEPLOY_MOCK_STOCKS=1;
  // on mainnet, the real Robinhood Stock Token addresses.
  QUOTE_TOKENS: [], // cleared for mainnet — testnet mock addresses must never be used here. Repopulate with real Robinhood Stock Token addresses when Stock Pair goes live.
  DEFAULT_SUPPLY: "1000000000", // matches HomepadFactory.DEFAULT_SUPPLY (display only)

  // --- Instant Liquidity mode (HomepadFactoryInstant + HomepadHook + HomepadSwapRouter) ---
  // No bonding curve — launch creates a real, immediately swappable
  // Uniswap v4 pool. Leave INSTANT_FACTORY_ADDRESS blank to hide this
  // launch type in the UI. See scripts/deploy-instant.js.
  INSTANT_FACTORY_ADDRESS: "0x4e66058A0AA148aa86D5B9701af7205cfFa99419", // mainnet
  // Earlier Instant deployments, kept (factory + its own matching router)
  // so tokens launched on them still show up in Explore — old ones just
  // accumulate here instead of getting cleaned up.
  LEGACY_INSTANT_FACTORIES: [], // fresh mainnet deploy — no legacy launches yet
  SWAP_ROUTER_ADDRESS: "0xF7324bB4D1A44FA0BE78f60A3edB5046bfF88a54", // mainnet
  HOOK_ADDRESS: "0x3ec13E96c018A7f0C662291bbAd235f210Ea0044", // mainnet HomepadHook — takes the live fee cut on every Instant Liquidity swap

  // Hybrid mode (the default launch type) — real pool from block one,
  // single-sided liquidity for curve-like price impact. See
  // HomepadFactoryHybrid / HomepadHybridHook in the contracts repo.
  HYBRID_FACTORY_ADDRESS: "0x59b49eb9985095cC83B4AC125f8D0DD6CDE362a9", // mainnet
  // Same idea as LEGACY_INSTANT_FACTORIES above.
  LEGACY_HYBRID_FACTORIES: [], // fresh mainnet deploy — no legacy launches yet
  HYBRID_HOOK_ADDRESS: "0x7219f713b92C428789ECa85C20E540f40217C044", // mainnet
  HYBRID_SWAP_ROUTER_ADDRESS: "0x0E74050b07A5D17af89C01e54e685Cbf1F543dd0", // mainnet
  INSTANT_HOME_ALLOCATION_BPS: 800, // 8% of supply to $HOME treasury at launch (display only, matches the contract constant)

  // --- $HOME token (also live on mainnet, same as the rest of HOMEPAD's
  // Hybrid + Instant contracts now — Bonding Curve and Stock Pair are the
  // only pieces still not deployed) ---
  HOME_TOKEN_ADDRESS: "0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f",
  HOME_TREASURY_ADDRESS: "0x0106BA97a34BFDf8a7AB68A9434Cb08E0E2991d9",
  HOME_BLOCKSCOUT_API_BASE: "https://robinhoodchain.blockscout.com", // mainnet DATA source — the live Holders stat fetch on the homepage reads from here
  // mainnet LINK-OUT for anything the user clicks (footer, docs) — a
  // nicer/faster community explorer than the Blockscout instance above.
  // Kept separate from BLOCK_EXPLORER/HOME_BLOCKSCOUT_API_BASE (both now
  // mainnet too) since this one is specifically for user-facing links.
  HOME_EXPLORER_LINK: "https://rh-scan.com",

  // Dexscreener: public API, no key needed. Pair address is the LP pool,
  // not the token — grab it from the dexscreener URL you're already using.
  DEXSCREENER_CHAIN_SLUG: "robinhood",
  DEXSCREENER_PAIR_ADDRESS: "0x177e26bc396d8a264542033533d71a94957375027bf4b47a7467cc444233bdfa",

  // Blockscout: the MAINNET explorer, for everything else on this site
  // (HOMEPAD's own launches). Free v2 REST API, no key needed for basic
  // token/holder lookups.
  BLOCKSCOUT_API_BASE: "https://robinhoodchain.blockscout.com",

  // Reown AppKit (wallet-connect modal, "UX by reown" — same one kekfun.xyz
  // uses). Get a free project ID at https://dashboard.reown.com and paste
  // it here. Leave blank to keep using the basic window.ethereum connect
  // button instead — everything still works either way.
  REOWN_PROJECT_ID: "278f543c581f60eec5975dc755f0c3dd",
};

// $HOME's link-out explorer URL. rh-scan uses /token/{address} for ERC-20s
// (a dedicated token page — holders, transfers — different from its
// /address/ page); the Blockscout fallback uses /address/ for everything,
// tokens included. Centralized here so every "$HOME contract" / "explorer"
// link on the site stays consistent if this ever changes again.
function homeExplorerUrl() {
  if (CONFIG.HOME_EXPLORER_LINK) return `${CONFIG.HOME_EXPLORER_LINK}/token/${CONFIG.HOME_TOKEN_ADDRESS}`;
  return `${CONFIG.HOME_BLOCKSCOUT_API_BASE || CONFIG.BLOCK_EXPLORER}/address/${CONFIG.HOME_TOKEN_ADDRESS}`;
}
