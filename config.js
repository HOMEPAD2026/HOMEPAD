// Fill these in once HomepadFactory is actually deployed (see the main
// project's scripts/deploy.js). The launchpad app doesn't work until
// FACTORY_ADDRESS is set to a real deployed contract — the $HOME stats
// panel above it works independently of that.
const CONFIG = {
  CHAIN_ID_HEX: "0xB636", // 46630 (Robinhood Chain testnet) in hex. Mainnet is 4663 = 0x1237.
  CHAIN_ID_DECIMAL: 46630,
  CHAIN_NAME: "Robinhood Chain Testnet",
  RPC_URL: "https://rpc.testnet.chain.robinhood.com",
  BLOCK_EXPLORER: "https://explorer.testnet.chain.robinhood.com",
  NATIVE_CURRENCY: { name: "ETH", symbol: "ETH", decimals: 18 },

  FACTORY_ADDRESS: "0x154f77D9CEE487E97553330028ED1425a238085d", // HomepadFactoryV4 — graduation threshold 3 ETH
  // --- Stock pair (paired hybrid: same single-sided v4 pool as Hybrid, but
  // priced in an ERC-20 quote token — Robinhood Stock Tokens; $HOME later).
  // Deploy with contracts/scripts/deploy-paired.js and paste here. Leave
  // blank to keep "Stock" as a preview tab in the launch form.
  PAIRED_FACTORY_ADDRESS: "0x7750339Eb5b5E11d934c6FA3e0f6e9f23df0Aa4f",
  PAIRED_HOOK_ADDRESS: "0xA4BA24582a4718Ef67aCEB6fe0112B23a79A0044",
  PAIRED_SWAP_ROUTER_ADDRESS: "0x7e8cBDA25f077cEc163765223e53a5C554Af2328",
  LEGACY_PAIRED_FACTORIES: [], // [{ factory, router }] — same idea as LEGACY_HYBRID_FACTORIES
  // Quote tokens offered in the Stock tab. `defaultVirtualQuote` is the
  // suggested starting price, in the convention every HOMEPAD mode uses:
  // "this many of the quote buys the entire 1B supply". On testnet these
  // are the mock tokens deploy-paired.js prints with DEPLOY_MOCK_STOCKS=1;
  // on mainnet, the real Robinhood Stock Token addresses.
  QUOTE_TOKENS: [
    { symbol: "TSLA", name: "Tesla (mock)",  address: "0x45165CfA06b4BbF8a26DFa73c835aF012A025Be3", decimals: 18, defaultVirtualQuote: "48" },
    { symbol: "NVDA", name: "NVIDIA (mock)", address: "0x426657CA5C70Cdaf85ba7bD9f48437537AA27A28", decimals: 18, defaultVirtualQuote: "80" },
    { symbol: "AAPL", name: "Apple (mock)",  address: "0x8668639530b9F5B80577a134E283710E96376CC7", decimals: 18, defaultVirtualQuote: "50" },
  ],
  DEFAULT_SUPPLY: "1000000000", // matches HomepadFactory.DEFAULT_SUPPLY (display only)

  // --- Instant Liquidity mode (HomepadFactoryInstant + HomepadHook + HomepadSwapRouter) ---
  // No bonding curve — launch creates a real, immediately swappable
  // Uniswap v4 pool. Leave INSTANT_FACTORY_ADDRESS blank to hide this
  // launch type in the UI. See scripts/deploy-instant.js.
  INSTANT_FACTORY_ADDRESS: "0xcfF2c7FFbd867CcaE3c253Baaf10d58d5eC1ba17",
  // Earlier Instant deployments, kept (factory + its own matching router)
  // so tokens launched on them still show up in Explore — testnet only,
  // so old ones just accumulate here instead of getting cleaned up.
  LEGACY_INSTANT_FACTORIES: [
    { factory: "0xf2fC8678b00F714A08aAAC22490DD1f9c00b593B", router: "0xc9786Ab69b5dC9521FA7ECf797EE10de99Ab47F3" },
  ],
  SWAP_ROUTER_ADDRESS: "0x917F2f7A7E4607937c3562E96b2E02325264B813",
  HOOK_ADDRESS: "0xf9f5105d59AF2B2538D0AcD961D10b61C4CcC044", // HomepadHook — takes the live fee cut on every Instant Liquidity swap

  // Hybrid mode (the default launch type) — real pool from block one,
  // single-sided liquidity for curve-like price impact. See
  // HomepadFactoryHybrid / HomepadHybridHook in the contracts repo.
  HYBRID_FACTORY_ADDRESS: "0x403DE4697e1d3A7E837e5778532E1247B9C87b99",
  // Same idea as LEGACY_INSTANT_FACTORIES above.
  LEGACY_HYBRID_FACTORIES: [
    { factory: "0x8EB532d862838f3A84710736aBaF62970F801317", router: "0x0E7ee82dCDF53581B5Fc4c454C58945Bba151a19" },
  ],
  HYBRID_HOOK_ADDRESS: "0x002dDC296285D92CdB3c4c40a1b510ce67774044",
  HYBRID_SWAP_ROUTER_ADDRESS: "0xF40F33D6E3240d29a6E04339b07b927053d74cF1",
  INSTANT_HOME_ALLOCATION_BPS: 800, // 8% of supply to $HOME treasury at launch (display only, matches the contract constant)

  // --- $HOME token (already live — on MAINNET, unlike the rest of this
  // site's contracts, which are all testnet while HOMEPAD itself is
  // still being tested) ---
  HOME_TOKEN_ADDRESS: "0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f",
  HOME_TREASURY_ADDRESS: "0x0106BA97a34BFDf8a7AB68A9434Cb08E0E2991d9",
  HOME_BLOCKSCOUT_API_BASE: "https://robinhoodchain.blockscout.com", // mainnet DATA source — the live Holders stat fetch on the homepage reads from here
  // mainnet LINK-OUT for anything the user clicks (footer, docs) — a
  // nicer/faster community explorer than the Blockscout instance above.
  // Mainnet-only, same as HOME_BLOCKSCOUT_API_BASE: don't reuse this for
  // any of HOMEPAD's own (testnet) contracts. Once HOMEPAD itself moves
  // to mainnet, switch BLOCK_EXPLORER to this too.
  HOME_EXPLORER_LINK: "https://rh-scan.com",

  // Dexscreener: public API, no key needed. Pair address is the LP pool,
  // not the token — grab it from the dexscreener URL you're already using.
  DEXSCREENER_CHAIN_SLUG: "robinhood",
  DEXSCREENER_PAIR_ADDRESS: "0x177e26bc396d8a264542033533d71a94957375027bf4b47a7467cc444233bdfa",

  // Blockscout: the TESTNET explorer, for everything else on this site
  // (HOMEPAD's own launches, all testnet). Free v2 REST API, no key
  // needed for basic token/holder lookups.
  BLOCKSCOUT_API_BASE: "https://explorer.testnet.chain.robinhood.com",

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
