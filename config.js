// Fill these in once HomepadFactory is actually deployed (see the main
// project's scripts/deploy.js). The launchpad app doesn't work until
// FACTORY_ADDRESS is set to a real deployed contract — the $HOME stats
// panel above it works independently of that.
const CONFIG = {
  CHAIN_ID_HEX: "0x1237", // 4663 (Robinhood Chain mainnet) in hex.
  CHAIN_ID_DECIMAL: 4663,
  CHAIN_NAME: "Robinhood Chain",
  RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
  // No HOMEPAD mainnet contract existed before this moment (first deploy
  // was ~08:50 UTC on 2026-09-10). Every eth_getLogs the site makes starts
  // from the block at this timestamp instead of block 0 — the chain has
  // tens of millions of blocks before it, and the public RPC times out
  // scanning them ("log query timed out", -32000). Keep this BEFORE the
  // earliest deploy; later is wrong, earlier is only slower.
  CONTRACTS_LIVE_SINCE: "2026-09-10T00:00:00Z",
  // User-facing link-out explorer (rh-scan, community Robinhood mainnet
  // explorer — /token/{addr} for ERC-20s, /address/{addr} otherwise, /tx/{hash}).
  // Data fetches use BLOCKSCOUT_API_BASE / HOME_BLOCKSCOUT_API_BASE below,
  // which stay on the official Blockscout instance — rh-scan is links only.
  BLOCK_EXPLORER: "https://rh-scan.com",
  NATIVE_CURRENCY: { name: "ETH", symbol: "ETH", decimals: 18 },

  FACTORY_ADDRESS: "", // Bonding Curve — deferred for mainnet launch (V2 router on Robinhood Chain unconfirmed). Shows as "soon".
  // --- Stock pair (paired hybrid: same single-sided v4 pool as Hybrid, but
  // priced in an ERC-20 quote token — Robinhood Stock Tokens; $HOME later).
  // Deploy with contracts/scripts/deploy-paired.js and paste here. Leave
  // blank to keep "Stock" as a preview tab in the launch form.
  // Deployed for the $HOMEPAD pair (see HOMEPAD_QUOTE above). Stock Pair
  // proper (real Robinhood Stock Token quotes) is a separate decision —
  // this factory instance works for any ERC-20 quote, Stock's own
  // corporate-action question just hasn't been resolved yet, so
  // QUOTE_TOKENS stays empty until it is.
  PAIRED_FACTORY_ADDRESS: "0x917F2f7A7E4607937c3562E96b2E02325264B813", // mainnet
  PAIRED_HOOK_ADDRESS: "0xB85aA5549848e2805F9c1c30d86f59c9F32F8044", // mainnet
  PAIRED_SWAP_ROUTER_ADDRESS: "0x1fB52768E4DDD54E18327d13E87E4E2cf5F8d592", // mainnet
  LEGACY_PAIRED_FACTORIES: [], // [{ factory, router }] — same idea as LEGACY_HYBRID_FACTORIES
  // Quote tokens offered in the Stock tab. `defaultVirtualQuote` is the
  // suggested starting price, in the convention every HOMEPAD mode uses:
  // "this many of the quote buys the entire 1B supply". On testnet these
  // are the mock tokens deploy-paired.js prints with DEPLOY_MOCK_STOCKS=1;
  // on mainnet, the real Robinhood Stock Token addresses.
  QUOTE_TOKENS: [], // cleared for mainnet — testnet mock addresses must never be used here. Repopulate with real Robinhood Stock Token addresses when Stock Pair goes live.

  // Dedicated single-fixed-quote pair tabs ($HOME, $HOMEPAD) — unlike
  // QUOTE_TOKENS (a dropdown of several stock tickers), each of these is
  // exactly one token, so the launch form shows no picker, just the tab.
  // Leave an address blank to keep that tab "soon"; both need the paired
  // factory (below) deployed too. defaultVirtualQuote is only a
  // starting-price suggestion shown as a placeholder — creators can type
  // any value in the Starting Price field; the launch form also
  // auto-computes a live suggestion matching Hybrid's current starting
  // valuation, so this static number is really just a pre-live fallback.
  HOME_QUOTE: { symbol: "HOME", name: "Home", address: "0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f", decimals: 18, defaultVirtualQuote: "3000" },
  HOMEPAD_QUOTE: { symbol: "HOMEPAD", name: "HOMEPAD", address: "0x90D1D926e843f85b99d0B378dcdF6C4f684d57F5", decimals: 18, defaultVirtualQuote: "1000000" },
  DEFAULT_SUPPLY: "1000000000", // matches HomepadFactory.DEFAULT_SUPPLY (display only)

  // --- Instant Liquidity mode (HomepadFactoryInstant + HomepadHook + HomepadSwapRouter) ---
  // No bonding curve — launch creates a real, immediately swappable
  // Uniswap v4 pool. Leave INSTANT_FACTORY_ADDRESS blank to hide this
  // launch type in the UI. See scripts/deploy-instant.js.
  INSTANT_FACTORY_ADDRESS: "0x8EB532d862838f3A84710736aBaF62970F801317", // mainnet (redeployed with correct PoolManager)
  // Earlier Instant deployments, kept (factory + its own matching router)
  // so tokens launched on them still show up in Explore — old ones just
  // accumulate here instead of getting cleaned up.
  LEGACY_INSTANT_FACTORIES: [], // fresh mainnet deploy — no legacy launches yet
  SWAP_ROUTER_ADDRESS: "0x0E7ee82dCDF53581B5Fc4c454C58945Bba151a19", // mainnet (redeployed with correct PoolManager)
  HOOK_ADDRESS: "0x408BF145843c050A080D6BA6D0C415484BB0C044", // mainnet (redeployed with correct PoolManager) HomepadHook — takes the live fee cut on every Instant Liquidity swap

  // Hybrid mode (the default launch type) — real pool from block one,
  // single-sided liquidity for curve-like price impact. See
  // HomepadFactoryHybrid / HomepadHybridHook in the contracts repo.
  HYBRID_FACTORY_ADDRESS: "0x73Ee9CF9C0bA0D1f375A7be8D3483Df4F3785F0C", // mainnet (redeployed with correct PoolManager)
  // Same idea as LEGACY_INSTANT_FACTORIES above.
  LEGACY_HYBRID_FACTORIES: [], // fresh mainnet deploy — no legacy launches yet
  HYBRID_HOOK_ADDRESS: "0xa42D91Dd900384873CFd907Ab8d1047846b34044", // mainnet (redeployed with correct PoolManager)
  HYBRID_SWAP_ROUTER_ADDRESS: "0xBB001483EB3213Dc79e2Ea0cDfFdb08A5813a85A", // mainnet (redeployed with correct PoolManager)
  // Launches whose treasury allocation/burn the Rent page tracks by name.
  // Test launches stay out; any launch whose allocation has actually been
  // burned shows up automatically on top of this list.
  RENT_FEATURED_TOKENS: [
    "0x90D1D926e843f85b99d0B378dcdF6C4f684d57F5", // $HOMEPAD
  ],
  INSTANT_HOME_ALLOCATION_BPS: 800,

  // World map rules (world.html). Capitals are launched paired with
  // $HOMEPAD. Market-cap gated: once a claim is past WORLD_RESET_GRACE_SEC
  // old (a short sniping-protection window, not a real deadline) AND its
  // current market cap is under WORLD_RESET_MCAP_USD, anyone can pay
  // WORLD_RESET_FEE_HOMEPAD ($HOMEPAD, sent to the $HOME treasury) and
  // launch the capital again, taking it over.
  WORLD_RESET_GRACE_SEC: 300,
  WORLD_RESET_MCAP_USD: 50000,
  WORLD_RESET_FEE_HOMEPAD: "2000000",

  // $NHOOD ("The World Game" companion token) has two separate
  // deployments — a burn on either counts. A capital's current creator can
  // burn NHOOD_MOTTO_BURN_AMOUNT (sent to the standard dead address, a real
  // burn, not a payment to any treasury) to inscribe a short motto next to
  // their capital's flag. The burn itself is verified on-chain; the motto
  // TEXT is stored in Firestore (mottos/{iso2}) since arbitrary strings
  // have nowhere to live on-chain without a dedicated registry contract —
  // this needs firebase-config.js filled in to actually persist.
  NHOOD_TOKEN_ADDRESSES: [
    "0xC71D3b8df5A0a0B0C86C671549b4C99F08F2dD14", // Pons (paired USDG)
    "0x9aDABf23ed66f01c9EAd70f3FaF5d8849Fd64B2B", // Pairex (priced in KRW)
  ],
  NHOOD_MOTTO_BURN_AMOUNT: "10000", // paid to CONFIG.HOME_TREASURY_ADDRESS as a plain ERC-20 transfer

  // --- $HOME token (also live on mainnet, same as the rest of HOMEPAD's
  // Hybrid + Instant contracts now — Bonding Curve and Stock Pair are the
  // only pieces still not deployed) ---
  HOME_TOKEN_ADDRESS: "0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f",
  HOME_TREASURY_ADDRESS: "0x0106BA97a34BFDf8a7AB68A9434Cb08E0E2991d9",
  HOME_BLOCKSCOUT_API_BASE: "https://robinhoodchain.blockscout.com", // mainnet DATA source — the live Holders stat fetch on the homepage reads from here
  // $HOME's own link-out — same rh-scan as BLOCK_EXPLORER now. Kept as its
  // own key so homeExplorerUrl() can build the /token/ URL for $HOME.
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
