/* reward.bundle.js — built by tools/build-bundles.mjs from: i18n-boot.js, config-arc.js, abis.js, arc-shared.js, arc-fmt.js, arc-fx.js, arcircle-live.js, arc-token.js, reward.js, reward-engine.js, arc-motion.js, arc-footer.js, arcircle-hub.js, arc-social.js, arc-cmdk.js, arc-chrome.js, arc-a11y.js, arc-txring.js, arc-glyph.js, arc-arcia-fab.js, i18n.js. Do not edit; edit the sources. src:8f8348178c83d5fe */
/* ---- i18n-boot.js ---- */
// i18n-boot.js — first thing in every bundle: if the visitor reads Korean or Chinese, start
// downloading that dictionary (i18n-ko.js / i18n-zh.js) right away, while the rest of the page's
// code runs. i18n.js (last in the bundle) does the translating; English visitors download nothing.
(function () {
  "use strict";
  var l = "en";
  try {
    var q = /[?&]lang=(en|ko|zh)(?:&|$)/.exec(location.search);
    var nav = (navigator.language || "").toLowerCase();
    l = q ? q[1] : localStorage.getItem("arcircle.lang") || (nav.indexOf("ko") === 0 ? "ko" : nav.indexOf("zh") === 0 ? "zh" : "en");
  } catch (e) { /* default en */ }
  if (l !== "ko" && l !== "zh") return;
  if (l === "zh" && /^\/whitepaper/.test(location.pathname)) return;
  var busy = window.__arcDictLoading || (window.__arcDictLoading = {});
  if (busy[l]) return;
  busy[l] = true;
  var me = document.currentScript && document.currentScript.src;
  var v = (/[?&]v=(\d+)/.exec(me || "") || [])[1] || "";
  var s = document.createElement("script");
  s.src = "/i18n-" + l + ".js" + (v ? "?v=" + v : "");
  s.async = true;
  s.onerror = function () { busy[l] = false; };
  (document.head || document.documentElement).appendChild(s);
})();
;
/* ---- config-arc.js ---- */
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
  // ArcircleBurnVote deployed 27 Sep 2026 00:46 UTC, block 22945226 (deploy-arcircle-burn-vote.js):
  // voting from then until the raise closes (29 Sep 11:16:07 UTC). Replaces 0x89A5…CB70,
  // which only opened after the close and never took a vote.
  CIRCLEPAD_BURNVOTE_ADDRESS: "0x54121a7894d90a02eA973Ab45EEF424C2716EeB2",
  // Optional, shown on /circle (circlepad-plus.js):
  //   CIRCLEPAD_OPENS_AT — the announced opening time (unix seconds): an
  //     "opens in" countdown and a calendar file before start(); 0 = not announced
  //   CIRCLEPAD_ESCROW_VERIFIED — true once the escrow's source is verified on the explorer
  //   CIRCLEPAD_ALLOCATION_NOTE — how the new coin is shared with contributors
  //     (shown in the "after the close" questions; empty = "not decided yet")
  CIRCLEPAD_OPENS_AT: 0,
  CIRCLEPAD_ESCROW_VERIFIED: false,
  CIRCLEPAD_ALLOCATION_NOTE: "Every contributor gets an airdrop of the new coin — its size and timing aren't decided yet. The top contributor at the close also receives the 15% share, over 3 days.",
  // Team additions to the Round #1 ballot, added by "Fill every category from
  // the ideas" (circlepad-ideas.js) after the community's ideas. Keyed by
  // category (0 name, 1 ticker, 2 logo, 3 roadmap, 4 launch date; dates in UTC).
  // 27 Sep 2026: a second launch date, 2 Oct 20:30 KST, next to the team's 1 Oct 20:30 KST.
  CIRCLEPAD_EXTRA_CANDIDATES: { 4: ["2026-10-02T11:30:00Z"] },
  // What happens after the vote (circlepad-round.js "What happens next"). Each
  // step: status "set" (fixed by a contract), "policy" (the team's stated plan)
  // or "open" (not decided yet — shown as such).
  CIRCLEPAD_NEXT: [
    { id: "vote", title: "Burn-to-vote", body: "Until the raise closes. Anyone holding $ARCIRCLE votes on name, ticker, logo, roadmap and launch date; every vote burns 1,000 $ARCIRCLE.", status: "set" },
    { id: "close", title: "The raise closes", body: "Contributions, withdrawals and voting stop; the vote result is final. The escrow splits everything: 80% recipient, 15% treasury, 5% platform.", status: "set" },
    { id: "top", title: "Top contributor paid", body: "The largest contributor at the close receives the 15%, over 3 days, sent by the team from the treasury wallet.", status: "policy" },
    { id: "launch", title: "The coin launches", body: "On the launch date the vote picks, with the name, ticker and logo the vote picks. Where and how it launches: not decided yet.", status: "open" },
    { id: "airdrop", title: "Contributor airdrop", body: "Every contributor gets an airdrop of the new coin. Size and timing: not decided yet.", status: "policy" },
  ],

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
      { key: "polygon", name: "Polygon", chainId: 137, domain: 7, usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com", native: { name: "POL", symbol: "POL", decimals: 18 }, color: "#8247e5", fast: false },
      { key: "avalanche", name: "Avalanche", chainId: 43114, domain: 1, usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", rpc: "https://avalanche-c-chain-rpc.publicnode.com", explorer: "https://snowtrace.io", native: { name: "Avalanche", symbol: "AVAX", decimals: 18 }, color: "#e84142", fast: false },
      { key: "unichain", name: "Unichain", chainId: 130, domain: 10, usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", rpc: "https://unichain-rpc.publicnode.com", explorer: "https://uniscan.xyz", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#f50db4" },
      { key: "linea", name: "Linea", chainId: 59144, domain: 11, usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", rpc: "https://linea-rpc.publicnode.com", explorer: "https://lineascan.build", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#61dfff" },
      // v2 (Sept 2026): CCTP V2 chains with Circle's Forwarding Service. Domains, USDC addresses and
      // "fast: false" (no Fast Transfer as a source) from developers.circle.com — cctp-supported-blockchains,
      // usdc-contract-addresses, required-block-confirmations; chain ids / RPCs from ethereum-lists.
      { key: "sonic", name: "Sonic", chainId: 146, domain: 13, usdc: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894", rpc: "https://sonic-rpc.publicnode.com", explorer: "https://sonicscan.org", native: { name: "Sonic", symbol: "S", decimals: 18 }, color: "#fe9a4c", fast: false },
      { key: "worldchain", name: "World Chain", chainId: 480, domain: 14, usdc: "0x79A02482A880bCe3F13E09da970dC34dB4cD24D1", rpc: "https://worldchain-mainnet.g.alchemy.com/public", explorer: "https://worldscan.org", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#c9ccd6" },
      { key: "monad", name: "Monad", chainId: 143, domain: 15, usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", rpc: "https://rpc.monad.xyz", explorer: "https://monadscan.com", native: { name: "Monad", symbol: "MON", decimals: 18 }, color: "#836ef9", fast: false },
      { key: "sei", name: "Sei", chainId: 1329, domain: 16, usdc: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392", rpc: "https://evm-rpc.sei-apis.com", explorer: "https://seiscan.io", native: { name: "Sei", symbol: "SEI", decimals: 18 }, color: "#c1272d", fast: false },
      { key: "hyperevm", name: "HyperEVM", chainId: 999, domain: 19, usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", rpc: "https://rpc.hyperliquid.xyz/evm", explorer: "https://hyperevmscan.io", native: { name: "HYPE", symbol: "HYPE", decimals: 18 }, color: "#50d2c1", fast: false },
      { key: "ink", name: "Ink", chainId: 57073, domain: 21, usdc: "0x2D270e6886d130D724215A266106e6832161EAEd", rpc: "https://rpc-gel.inkonchain.com", explorer: "https://explorer.inkonchain.com", native: { name: "Ether", symbol: "ETH", decimals: 18 }, color: "#7132f5" },
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

  // --- BuilderMine: the Builder Mine utility (arcpad.html#mine, arc-mine.js) ---
  // Empty until contracts/scripts/deploy-builder-mine.js runs: the page shows its practice mine.
  // The server reads BUILDER_MINE_ADDRESS (Vercel env) or api/_mine.mjs — keep them in step.
  BUILDER_MINE_ADDRESS: "0x1538c76917dE5911D71c5C397ff18cA09d52B019", // Arc mainnet, block 23279278

  // --- Relay Launch (arcpad.html#relay, arc-relay.js) ---
  // After a CirclePad round closes, the round's recipient wallet launches the
  // coin the vote picked through Argus Portal #7 and relays the dev-buy tokens
  // to the round's contributors and to $ARCIRCLE holders (Snapshot + Multisender).
  // Addresses from Argus's published ABI bundle (argus-v4.json, version 3,
  // sha256 94f7e126…3da1f); the page refuses to launch if the Portal's
  // implementation pointers no longer match these.
  ARGUS: {
    PORTAL: "0xB021Be536808f551b31789422Fd28a6c9c6e97Da",
    REGISTRY: "0xfA4552DD491acC08051725fe522F4cfEaeC8EDc6",
    TOKEN_IMPL: "0x1B74922c01DDfD9C77B37D02C0a236611E8Fe500",
    SPLITTER_IMPL: "0xd9578dd861b2fe59675C2C4B09b026FcB0df37FC",
    LOCKER_IMPL: "0xb2eD8112Db1bc11F7e7AB7969C2a9d1f819Cfc6A",
    OLDER_PORTALS: ["0xA5628A11c412596e1f63b75a2C0284F843C549d6", "0x07a688a001f416cC433c68Ff56Aa26bC5131Cc6E"],
    HOOK_FLAGS: 0x2044,
  },
  // --- Launch on Argus through ArcPad (arc-argus.js, api/_argus-arcpad.mjs) ---
  // Argus Portal #8 (ArgusV5Portal, verified on ArcScan, deployed by Argus's deployer) takes a
  // payoutAddress, and its CreatorRegistry lets that payout wallet split the creator fees
  // (setPayoutSplit). An ArcPad launch sets the payout to the creator's own wallet; the creator
  // then signs a 70 / 30 split — 70% creator, 30% the ARCIRCLE PAD platform treasury. Argus's
  // own share (the Portal's treasuryBps) comes off first, exactly as on argus.world.
  // The Portal's factories (parts, hooks, quote registry) are read from the Portal itself.
  ARGUS_V5: {
    PORTAL: "0xeed7559B8A6ABf64427dc41Cb5cc6400109C5D93",
    CREATOR_REGISTRY: "0x986B478bE2F05b44b47c61E26a0BbcBcC07610eD",
    HOOK_FLAGS: 0x20cc, // the low 14 bits of every Portal #8 hook address
    PLATFORM_WALLET: "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8", // whitepaper: Platform treasury
    PLATFORM_BPS: 3000, // of the creator share
    MIN_CREATOR_ALLOC_BPS: 5000, // the creator share must be at least half of the allocation
    SUPPORT: { DEX_INFO_MCAP: 20000, MARKETING_MCAP: 100000 }, // ARCIRCLE PAD's own support policy (not on-chain)
  },
  // ARCIRCLE OMNI — $ARCIRCLE on Arc, Robinhood Chain and Solana through LayerZero V2 (omni/README.md).
  // Arc keeps the one canonical token; the adapter locks it, the other chains mint/burn. Empty addresses
  // keep the OMNI page in preview for that chain. Keep api/_omni.mjs in step.
  OMNI: {
    ADAPTER: "", // Arc · ArcircleOFTAdapter (the lockbox)
    ROBINHOOD_OFT: "", // Robinhood Chain · ArcircleOFT
    SOLANA_MINT: "", // Solana · SPL mint from the OFT program
    SOLANA_OFT_STORE: "",
    CHAINS: {
      arc: { name: "Arc", eid: 30417, chainId: 5042, gas: "USDC" },
      robinhood: { name: "Robinhood Chain", eid: 30416, chainId: 4663, gas: "ETH", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
      solana: { name: "Solana", eid: 30168, gas: "SOL", explorer: "https://solscan.io" },
    },
    LZ_SCAN: "https://layerzeroscan.com/tx/",
    SHARED_DECIMALS: 6,
  },
  RELAY: {
    OPERATOR: "0x1A35a754A4251E46971184046ac57E8AD621672E", // every round's recipient wallet
    MIN_ARCIRCLE: "100000", // whole $ARCIRCLE a wallet needs at the snapshot
    // one entry per CirclePad round; `launch` is filled in once that round's relay token is live:
    // { token: "0x…", tx: "0x…", at: "2026-10-01T11:30:00Z", snapshotBlock: 0, drops: ["0x…"] }
    ROUNDS: [
      { n: 1, label: "CirclePad Round #1", escrow: "0xC5998d7cE728FDd6f77217fdE775aAb90Ec61703",
        ballot: "0x23c376615a58F059FC4bc83A38eB4aCdF8d39ff2", burnvote: "0x54121a7894d90a02eA973Ab45EEF424C2716EeB2", launch: null },
    ],
  },
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
;
/* ---- abis.js ---- */




const ERC20_ABI = [{"inputs": [{"internalType": "string", "name": "name_", "type": "string"}, {"internalType": "string", "name": "symbol_", "type": "string"}, {"internalType": "uint256", "name": "totalSupply_", "type": "uint256"}, {"internalType": "address", "name": "curve", "type": "address"}], "stateMutability": "nonpayable", "type": "constructor"}, {"inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {"internalType": "uint256", "name": "allowance", "type": "uint256"}, {"internalType": "uint256", "name": "needed", "type": "uint256"}], "name": "ERC20InsufficientAllowance", "type": "error"}, {"inputs": [{"internalType": "address", "name": "sender", "type": "address"}, {"internalType": "uint256", "name": "balance", "type": "uint256"}, {"internalType": "uint256", "name": "needed", "type": "uint256"}], "name": "ERC20InsufficientBalance", "type": "error"}, {"inputs": [{"internalType": "address", "name": "approver", "type": "address"}], "name": "ERC20InvalidApprover", "type": "error"}, {"inputs": [{"internalType": "address", "name": "receiver", "type": "address"}], "name": "ERC20InvalidReceiver", "type": "error"}, {"inputs": [{"internalType": "address", "name": "sender", "type": "address"}], "name": "ERC20InvalidSender", "type": "error"}, {"inputs": [{"internalType": "address", "name": "spender", "type": "address"}], "name": "ERC20InvalidSpender", "type": "error"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {"indexed": true, "internalType": "address", "name": "spender", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}], "name": "Approval", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "from", "type": "address"}, {"indexed": true, "internalType": "address", "name": "to", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}], "name": "Transfer", "type": "event"}, {"inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {"internalType": "address", "name": "spender", "type": "address"}], "name": "allowance", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {"internalType": "uint256", "name": "value", "type": "uint256"}], "name": "approve", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "decimals", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "name", "outputs": [{"internalType": "string", "name": "", "type": "string"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "symbol", "outputs": [{"internalType": "string", "name": "", "type": "string"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "totalSupply", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "to", "type": "address"}, {"internalType": "uint256", "name": "value", "type": "uint256"}], "name": "transfer", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [{"internalType": "address", "name": "from", "type": "address"}, {"internalType": "address", "name": "to", "type": "address"}, {"internalType": "uint256", "name": "value", "type": "uint256"}], "name": "transferFrom", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"}];






// HomepadFactoryPaired — hybrid mode paired with an ERC-20 quote (stock tokens / $HOME)

// HomepadPairedSwapRouter — buy/sell for paired launches (quote pulled via transferFrom)

// BigPadEscrow — minimal cap+deadline+escrow contract for BigPad's first
// round (no voting/leader/vesting logic — see contracts/BigPadEscrow.sol
// and Docs > Safety design on bigpad.html for why that's deliberate).

// BigPadVote — standalone identity vote (name/ticker/logo/roadmap/launch
// date) for a BigPad round. Reads contribution weight live from
// BigPadEscrow rather than holding its own snapshot or any funds — see
// contracts/BigPadVote.sol. Not wired into the frontend yet
// (CONFIG.BIGPAD_VOTE_ADDRESS is blank until deployed and a voting UI
// is built).

// CirclePad (arc-shared.js/circlepad.js) reuses BigPadEscrow.sol/BigPadVote.sol
// verbatim, just redeployed on Arc — same interface, so these are aliases,
// not a second copy of the ABI, kept in sync automatically.

// ARCPAD (arcpad.html/arcpad.js) — HomepadFactoryArc + HomepadArcSwapRouter,
// deployed fresh on Circle's Arc chain. ABIs extracted directly from the
// compiled Hardhat artifacts (contracts/artifacts/contracts/HomepadFactoryArc.sol/
// and .../HomepadArcSwapRouter.sol/) rather than hand-transcribed, so they
// can't drift from what's actually deployed. See contracts/contracts/
// HomepadFactoryArc.sol for the full mechanics — same Uniswap v4 single-
// sided-liquidity launch as HOMEPAD_FACTORY_ABI/PAIRED_FACTORY_ABI, but
// LaunchMeta here has a dedicated `website` field (Robinhood-side HOMEPAD's
// LaunchMeta does not), and every quote-token transfer measures the actual
// balance delta rather than trusting the nominal transfer amount.
const ARC_FACTORY_ABI = [{"inputs": [{"internalType": "address", "name": "platformTreasury_", "type": "address"}, {"internalType": "address", "name": "platformWallet_", "type": "address"}, {"internalType": "address", "name": "poolManager_", "type": "address"}, {"internalType": "address", "name": "hook_", "type": "address"}, {"internalType": "int24", "name": "tickSpacing_", "type": "int24"}, {"internalType": "uint16", "name": "baseFeeBps_", "type": "uint16"}, {"internalType": "uint16", "name": "creatorShareBps_", "type": "uint16"}, {"internalType": "uint16", "name": "platformShareBps_", "type": "uint16"}], "stateMutability": "nonpayable", "type": "constructor"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "payer", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}], "name": "LaunchFeeCollected", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "token", "type": "address"}, {"indexed": true, "internalType": "address", "name": "creator", "type": "address"}, {"indexed": true, "internalType": "address", "name": "quoteToken", "type": "address"}, {"indexed": false, "internalType": "string", "name": "name", "type": "string"}, {"indexed": false, "internalType": "string", "name": "symbol", "type": "string"}, {"indexed": false, "internalType": "uint16", "name": "extraFeeBps", "type": "uint16"}, {"indexed": false, "internalType": "uint256", "name": "initialVirtualQuote", "type": "uint256"}, {"indexed": false, "internalType": "string", "name": "imageUrl", "type": "string"}, {"indexed": false, "internalType": "string", "name": "description", "type": "string"}], "name": "Launched", "type": "event"}, {"inputs": [], "name": "DEFAULT_SUPPLY", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "LAUNCH_FEE", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "MAX_EXTRA_FEE_BPS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "PLATFORM_ALLOCATION_BPS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "baseFeeBps", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "creatorShareBps", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "hook", "outputs": [{"internalType": "contract HomepadHybridHook", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "string", "name": "name_", "type": "string"}, {"internalType": "string", "name": "symbol_", "type": "string"}, {"internalType": "address", "name": "quoteToken_", "type": "address"}, {"internalType": "uint256", "name": "initialVirtualQuote_", "type": "uint256"}, {"internalType": "uint16", "name": "extraFeeBps_", "type": "uint16"}, {"components": [{"internalType": "string", "name": "imageUrl", "type": "string"}, {"internalType": "string", "name": "description", "type": "string"}, {"internalType": "string", "name": "twitter", "type": "string"}, {"internalType": "string", "name": "telegram", "type": "string"}, {"internalType": "string", "name": "discord", "type": "string"}, {"internalType": "string", "name": "website", "type": "string"}], "internalType": "struct HomepadFactoryArc.LaunchMeta", "name": "meta_", "type": "tuple"}], "name": "launch", "outputs": [{"internalType": "address", "name": "tokenAddr", "type": "address"}], "stateMutability": "payable", "type": "function"}, {"inputs": [{"internalType": "string", "name": "name_", "type": "string"}, {"internalType": "string", "name": "symbol_", "type": "string"}, {"internalType": "address", "name": "quoteToken_", "type": "address"}, {"internalType": "uint256", "name": "initialVirtualQuote_", "type": "uint256"}, {"internalType": "uint16", "name": "extraFeeBps_", "type": "uint16"}, {"components": [{"internalType": "string", "name": "imageUrl", "type": "string"}, {"internalType": "string", "name": "description", "type": "string"}, {"internalType": "string", "name": "twitter", "type": "string"}, {"internalType": "string", "name": "telegram", "type": "string"}, {"internalType": "string", "name": "discord", "type": "string"}, {"internalType": "string", "name": "website", "type": "string"}], "internalType": "struct HomepadFactoryArc.LaunchMeta", "name": "meta_", "type": "tuple"}, {"internalType": "uint256", "name": "devBuyQuote", "type": "uint256"}], "name": "launchAndBuy", "outputs": [{"internalType": "address", "name": "tokenAddr", "type": "address"}], "stateMutability": "payable", "type": "function"}, {"inputs": [], "name": "launchCount", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "", "type": "address"}], "name": "launchIndexOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "name": "launches", "outputs": [{"internalType": "address", "name": "token", "type": "address"}, {"internalType": "address", "name": "quoteToken", "type": "address"}, {"internalType": "uint256", "name": "initialVirtualQuote", "type": "uint256"}, {"internalType": "bool", "name": "quoteIsCurrency0", "type": "bool"}, {"internalType": "address", "name": "creator", "type": "address"}, {"internalType": "uint256", "name": "launchedAt", "type": "uint256"}, {"internalType": "uint16", "name": "extraFeeBps", "type": "uint16"}, {"internalType": "string", "name": "imageUrl", "type": "string"}, {"internalType": "string", "name": "description", "type": "string"}, {"internalType": "string", "name": "twitter", "type": "string"}, {"internalType": "string", "name": "telegram", "type": "string"}, {"internalType": "string", "name": "discord", "type": "string"}, {"internalType": "string", "name": "website", "type": "string"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "platformShareBps", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "platformTreasury", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "platformWallet", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "token", "type": "address"}], "name": "poolKeyOf", "outputs": [{"components": [{"internalType": "Currency", "name": "currency0", "type": "address"}, {"internalType": "Currency", "name": "currency1", "type": "address"}, {"internalType": "uint24", "name": "fee", "type": "uint24"}, {"internalType": "int24", "name": "tickSpacing", "type": "int24"}, {"internalType": "contract IHooks", "name": "hooks", "type": "address"}], "internalType": "struct PoolKey", "name": "key", "type": "tuple"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "poolManager", "outputs": [{"internalType": "contract IPoolManager", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "", "type": "address"}], "name": "quoteOf", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "tickSpacing", "outputs": [{"internalType": "int24", "name": "", "type": "int24"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "bytes", "name": "data", "type": "bytes"}], "name": "unlockCallback", "outputs": [{"internalType": "bytes", "name": "", "type": "bytes"}], "stateMutability": "nonpayable", "type": "function"}];
;
/* ---- arc-shared.js ---- */
/* global ethers, CONFIG */
// arc-shared.js — the small set of chain-agnostic read helpers ARCPAD and
// CIRCLEPAD both need (readProvider, multicallRead, blockAtOrAfter), copied
// out of app.js rather than loading all of it. app.js's own `route()` call
// at the bottom of that file drives the main HOMEPAD (Robinhood Chain)
// launchpad UI unconditionally on load — wrong DOM, wrong config, wrong
// chain for these pages. These specific helpers were already
// config-driven/chain-agnostic in app.js (nothing Robinhood-specific in
// them), so they're reproduced here verbatim rather than reimplemented.

const state = {
  account: null,
  signer: null,
  provider: null, // read-only, always available
};

// Read RPC with failover: CONFIG.RPC_URL first; if it keeps failing with
// network / rate-limit errors, the next CONFIG.RPC_FALLBACKS endpoint that
// passes a health check (eth_chainId === CONFIG.CHAIN_ID_DECIMAL) takes
// over for the rest of this browser session, and the primary is re-tried
// every 10 minutes. Wallet writes never go through this — they use the
// wallet's own provider.
const RPC_STATE = { urls: null, idx: 0, fails: 0, firstFailAt: 0, switching: null, since: 0 };
function rpcUrls() {
  if (!RPC_STATE.urls) {
    RPC_STATE.urls = [CONFIG.RPC_URL].concat(Array.isArray(CONFIG.RPC_FALLBACKS) ? CONFIG.RPC_FALLBACKS : []);
    try { const i = Number(sessionStorage.getItem("arc.rpc.idx")); if (i > 0 && i < RPC_STATE.urls.length) { RPC_STATE.idx = i; RPC_STATE.since = Date.now(); } } catch { /* storage blocked */ }
  }
  return RPC_STATE.urls;
}
function readProvider() {
  const urls = rpcUrls();
  if (RPC_STATE.idx > 0 && Date.now() - RPC_STATE.since > 2 * 60_000 && !RPC_STATE.switching) rpcProbe(0);
  if (!state.provider) {
    const net = ethers.Network.from(CONFIG.CHAIN_ID_DECIMAL);
    // the fallbacks are free tiers: dRPC refuses batches of more than 3 and QuickNode rate-limits
    // items inside one, so reads go to them one request at a time
    state.provider = new ethers.JsonRpcProvider(urls[RPC_STATE.idx], net, RPC_STATE.idx === 0 ? { staticNetwork: net } : { staticNetwork: net, batchMaxCount: 1 });
  }
  return state.provider;
}
async function rpcHealthy(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: ctl.signal });
    const j = await r.json();
    return j && parseInt(j.result, 16) === CONFIG.CHAIN_ID_DECIMAL;
  } catch { return false; } finally { clearTimeout(t); }
}
function rpcUse(i) {
  if (i === RPC_STATE.idx) return;
  RPC_STATE.idx = i; RPC_STATE.since = Date.now(); RPC_STATE.fails = 0;
  state.provider = null;
  try { sessionStorage.setItem("arc.rpc.idx", String(i)); } catch { /* fine */ }
  console.warn("Arc RPC: switched to", rpcUrls()[i]);
  // Contracts built before the switch still hold the old provider — let the
  // page re-run whatever failed to load.
  try { window.dispatchEvent(new CustomEvent("arc:rpc-switched", { detail: { url: rpcUrls()[i] } })); } catch { /* old browser */ }
}
/// Try endpoints starting at `start` (default: the one after the current).
function rpcProbe(start) {
  if (RPC_STATE.switching) return RPC_STATE.switching;
  const urls = rpcUrls();
  RPC_STATE.switching = (async () => {
    const order = start === 0 ? [0] : urls.map((_, k) => (RPC_STATE.idx + 1 + k) % urls.length).filter((k) => k !== RPC_STATE.idx);
    for (const k of order) { if (await rpcHealthy(urls[k])) { rpcUse(k); return true; } }
    if (start === 0) RPC_STATE.since = Date.now(); // primary still down — check again in 10 min
    return false;
  })().finally(() => { RPC_STATE.switching = null; });
  return RPC_STATE.switching;
}
function rpcNoteFailure() {
  const now = Date.now();
  if (now - RPC_STATE.firstFailAt > 30_000) { RPC_STATE.firstFailAt = now; RPC_STATE.fails = 0; }
  if (++RPC_STATE.fails >= 3) { RPC_STATE.fails = 0; return rpcProbe(); }
  return null;
}

const TRANSIENT_RPC = /failed to fetch|timed out|timeout|429|rate limit|too many|coalesce|network error|ECONNRESET|free plan|batch of more than/i;
async function withRetry(fn, { tries = 3, delayMs = 900 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (!TRANSIENT_RPC.test(String(err && (err.shortMessage || err.message) || err))) throw err;
      const sw = rpcNoteFailure();
      if (sw) await sw;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

// Same technique as app.js's blockAtOrAfter: bounds every eth_getLogs to
// "since these contracts went live" instead of scanning from block 0,
// cached in localStorage per chain+namespace so the answer is computed once.
const _blockAtOrAfterPromises = new Map();
function blockAtOrAfter(isoTimestamp, namespace) {
  const memoKey = `${namespace}:${isoTimestamp}`;
  if (_blockAtOrAfterPromises.has(memoKey)) return _blockAtOrAfterPromises.get(memoKey);
  const p = (async () => {
    const target = Math.floor(Date.parse(isoTimestamp) / 1000);
    const cacheKey = `arcircle.firstBlock.${CONFIG.CHAIN_ID_DECIMAL}.${namespace}.${target}`;
    try { const c = localStorage.getItem(cacheKey); if (c) return Number(c); } catch { /* storage blocked */ }
    const provider = readProvider();
    const blockAt = (n) => withRetry(() => provider.getBlock(n));

    const latest = await blockAt("latest");
    if (Number(latest.timestamp) < target) return latest.number;
    const probeN = Math.max(0, latest.number - 500_000);
    const probe = await blockAt(probeN);
    const secPerBlock = Math.max(0.01, (Number(latest.timestamp) - Number(probe.timestamp)) / Math.max(1, latest.number - probeN));
    let guess = Math.round(latest.number - (Number(latest.timestamp) - target) / secPerBlock);
    guess = Math.min(Math.max(0, guess), latest.number);
    let span = 8_000, lo, hi;
    for (;;) {
      lo = Math.max(0, guess - span); hi = Math.min(latest.number, guess + span);
      const [bLo, bHi] = await Promise.all([blockAt(lo), blockAt(hi)]);
      const loBefore = Number(bLo.timestamp) < target, hiAfter = Number(bHi.timestamp) >= target;
      if ((loBefore || lo === 0) && (hiAfter || hi === latest.number)) break;
      span *= 4;
    }
    while (hi - lo > 2048) {
      const mid = Math.floor((lo + hi) / 2);
      const b = await blockAt(mid);
      if (Number(b.timestamp) < target) lo = mid; else hi = mid;
    }
    try { localStorage.setItem(cacheKey, String(lo)); } catch { /* fine */ }
    return lo;
  })().catch((err) => { _blockAtOrAfterPromises.delete(memoKey); throw err; });
  _blockAtOrAfterPromises.set(memoKey, p);
  return p;
}

// Arc's public RPC rejects any eth_getLogs spanning more than ~10,000 blocks
// ("requested range too large", -32012; measured cap 9,960) and Arc makes a
// block every ~0.5s — ~170k blocks a day — so a single "since deploy" log
// query stops working within hours. This splits [fromBlock, toBlock] into
// ranges the RPC accepts. `filter` is anything contract.queryFilter takes
// (an event filter, an event name, or "*").
// The public RPC also rate-limits eth_getLogs (-32005 "rate limit
// exceeded"). Measured on mainnet: one request at a time with exponential
// backoff on a rate-limit hit is FASTER than running in parallel (10 chunks
// in ~2.7s sequential vs ~5s with 2 in flight), so concurrency defaults to 1.
const LOG_CHUNK_BLOCKS = 9_000;
const RATE_LIMITED = /rate limit|429|-32005|too many requests/i;
// onChunk(events, [from, to]) fires as each range completes — with the
// default concurrency of 1 that's strictly in block order, so a caller can
// checkpoint progress and resume after a failure instead of starting over.
async function queryFilterChunked(contract, filter, fromBlock, toBlock, { chunk = LOG_CHUNK_BLOCKS, concurrency = 1, onChunk = null } = {}) {
  if (toBlock == null || toBlock === "latest") toBlock = await withRetry(() => readProvider().getBlockNumber());
  if (fromBlock > toBlock) return [];
  const ranges = [];
  for (let a = fromBlock; a <= toBlock; a += chunk) ranges.push([a, Math.min(toBlock, a + chunk - 1)]);
  const fetchRange = async ([a, b]) => {
    for (let attempt = 0; ; attempt++) {
      try { return await contract.queryFilter(filter, a, b); }
      catch (err) {
        const text = JSON.stringify(err && err.error || "") + String(err && (err.shortMessage || err.message) || err);
        const retryable = RATE_LIMITED.test(text) || TRANSIENT_RPC.test(text);
        if (!retryable || attempt >= 9) throw err;
        { const sw = rpcNoteFailure(); if (sw) await sw; }
        await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt)));
      }
    }
  };
  const out = new Array(ranges.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, async () => {
    while (next < ranges.length) {
      const i = next++;
      out[i] = await fetchRange(ranges[i]);
      if (onChunk) onChunk(out[i], ranges[i], i + 1, ranges.length);
    }
  }));
  return out.flat();
}

// Multicall3 — same canonical cross-chain address, confirmed present on Arc
// mainnet too (Circle's own docs list it at this exact address).
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];
let multicallAvailable = null;

async function isMulticallAvailable() {
  if (multicallAvailable !== null) return multicallAvailable;
  try {
    const code = await readProvider().getCode(MULTICALL3_ADDRESS);
    multicallAvailable = code !== "0x";
  } catch {
    multicallAvailable = false;
  }
  if (!multicallAvailable) {
    console.warn("Multicall3 not found on this chain — falling back to one request per call.");
  }
  return multicallAvailable;
}

async function multicallRead(calls) {
  if (calls.length === 0) return [];
  const available = await isMulticallAvailable();
  const plainFallback = () => Promise.all(calls.map((c) =>
    c.contract[c.method](...(c.args || [])).catch((err) => {
      console.warn(`multicallRead fallback: ${c.method} failed`, err);
      return null;
    })
  ));

  if (!available) return plainFallback();

  try {
    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider());
    const encoded = calls.map((c) => ({
      target: c.contract.target,
      allowFailure: true,
      callData: c.contract.interface.encodeFunctionData(c.method, c.args || []),
    }));
    const results = await mc.aggregate3.staticCall(encoded);
    return results.map((r, i) => {
      if (!r.success) return null;
      try {
        const decoded = calls[i].contract.interface.decodeFunctionResult(calls[i].method, r.returnData);
        return decoded.length === 1 ? decoded[0] : decoded;
      } catch {
        return null;
      }
    });
  } catch (err) {
    console.warn("Multicall3 call failed — falling back to one request per call.", err);
    return plainFallback();
  }
}

function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

/// Docs → "Contracts" table shared by ArcPad and CirclePad. `rows` is
/// [label, address, one-line role]; an empty address renders as a
/// "not deployed yet" row instead of a broken explorer link. Every address
/// links to the block explorer from config-arc.js and has a copy button.
function renderContractRows(rows) {
  const isAddr = (a) => typeof a === "string" && a.length === 42;
  return `<div class="ac-contracts">${rows.map(([label, addr, role]) => `
    <div class="ac-row">
      <div class="ac-row-main">
        <div class="ac-label">${label}</div>
        <div class="ac-role">${role}</div>
      </div>
      ${isAddr(addr)
        ? `<div class="ac-addr">
            <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/address/${addr}" target="_blank" rel="noopener" title="${addr}"><span class="ac-addr-full">${addr}</span><span class="ac-addr-short">${short(addr)}</span> ↗</a>
            <button type="button" class="ac-copy" data-copy="${addr}" title="Copy address">Copy</button>
          </div>`
        : `<div class="ac-addr ac-addr-pending">not deployed yet</div>`}
    </div>`).join("")}
    <div class="ac-foot">Chain: ${CONFIG.CHAIN_NAME} (id ${CONFIG.CHAIN_ID_DECIMAL}) · RPC <code>${CONFIG.RPC_URL}</code> · Explorer <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}" target="_blank" rel="noopener">${CONFIG.BLOCK_EXPLORER.replace(/^https?:\/\//, "")} ↗</a></div>
  </div>`;
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".ac-copy");
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    const prev = btn.textContent; btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = prev; }, 1200);
  }).catch(() => {});
});

// ---------- Wallet connect (copied from app.js lines 523-653 verbatim —
// already CONFIG-driven/chain-agnostic there, nothing Robinhood-specific).
// wallet-appkit.js must be loaded on the page too (config-arc.js first) —
// it supplies tryOpenAppKit/hardDisconnect/setUserDisconnected/
// userDisconnected/clearStaleWalletStorage/ensureAppKitChain/appKitReady,
// all of which already read CONFIG rather than assuming Robinhood Chain.

async function connectWallet() {
  if (typeof setUserDisconnected === "function") setUserDisconnected(false);
  if (typeof tryOpenAppKit === "function" && await tryOpenAppKit()) return;

  if (!window.ethereum) {
    alert("No wallet found. Install MetaMask, Rabby, or another EVM wallet.");
    return;
  }
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await browserProvider.send("eth_requestAccounts", []);
  if (!accounts || !accounts.length) return;
  state.account = accounts[0];
  state.signer = await browserProvider.getSigner();
  renderHeader();
  attachBasicWalletListeners();
  try { await ensureNetwork(); } catch (err) { console.warn("network switch declined/failed — showing wrong-network badge instead", err && err.message); }
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
  if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
}

async function restoreBasicWallet() {
  if (!window.ethereum) return;
  try {
    if (typeof userDisconnected === "function" && userDisconnected()) return;
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts || !accounts.length) return;
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    state.account = accounts[0];
    state.signer = await browserProvider.getSigner();
    renderHeader();
    attachBasicWalletListeners();
    if (typeof updateNetworkBadge === "function") updateNetworkBadge();
    if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
  } catch (err) {
    console.warn("basic wallet restore failed", err && err.message);
  }
}

let basicListenersAttached = false;
function attachBasicWalletListeners() {
  if (basicListenersAttached || !window.ethereum) return;
  basicListenersAttached = true;

  window.ethereum.on("accountsChanged", async (accounts) => {
    const prevAccount = state.account;
    if (accounts.length === 0) {
      state.account = null;
      state.signer = null;
    } else {
      state.account = accounts[0];
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      state.signer = await browserProvider.getSigner();
    }
    renderHeader();
    if (state.account !== prevAccount && typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
  });

  window.ethereum.on("chainChanged", () => {
    location.reload();
  });
}

async function disconnectWallet() {
  if (typeof setUserDisconnected === "function") setUserDisconnected(true);
  if (typeof hardDisconnect === "function") { await hardDisconnect(); return; }
  try {
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      await WagmiCoreRef.disconnect(wagmiConfigRef);
    }
  } catch (err) {
    console.warn("Wallet disconnect (AppKit side) failed — clearing local state anyway.", err);
  }
  if (typeof clearStaleWalletStorage === "function") clearStaleWalletStorage();
  state.account = null;
  state.signer = null;
  renderHeader();
}

async function ensureNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.CHAIN_ID_HEX }],
    });
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CONFIG.CHAIN_ID_HEX,
          chainName: CONFIG.CHAIN_NAME,
          rpcUrls: [CONFIG.RPC_URL],
          blockExplorerUrls: [CONFIG.BLOCK_EXPLORER],
          nativeCurrency: CONFIG.NATIVE_CURRENCY,
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

// renderHeader() — same wallet-pill/dropdown markup as app.js's, minus the
// "My Profile" link (no explore.html#/profile equivalent on Arc pages yet).
// Pages using this must have a `<div id="wallet-slot"></div>` in the header.
function renderHeader() {
  const el = document.getElementById("wallet-slot");
  if (!el) return;
  if (state.account) {
    el.innerHTML = `
      <div class="wallet-info">
        <span class="network-badge" id="network-badge">…</span>
        <div class="wallet-dropdown-wrap" id="wallet-dropdown-wrap">
          <button class="wallet-pill" id="wallet-pill-btn">${short(state.account)} <svg class="wallet-pill-chevron" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg></button>
          <div class="wallet-dropdown" id="wallet-dropdown">
            <div class="wallet-dropdown-address">
              <code>${short(state.account)}</code>
              <span class="btn-mini" id="wallet-dropdown-copy" style="cursor:pointer">Copy</span>
            </div>
            <div class="wallet-dropdown-network" id="wallet-dropdown-network">…</div>
            <button type="button" class="wallet-dropdown-switch" id="wallet-dropdown-switch" hidden>Switch to ${CONFIG.CHAIN_NAME}</button>
            <div class="wallet-dropdown-note" id="wallet-dropdown-note" hidden></div>
            <a class="wallet-dropdown-item" href="${CONFIG.BLOCK_EXPLORER}/address/${state.account}" target="_blank">View on Explorer ↗</a>
            <button type="button" class="wallet-dropdown-item wallet-dropdown-disconnect" id="wallet-dropdown-disconnect">Disconnect</button>
          </div>
        </div>
      </div>
    `;
    const dropdown = document.getElementById("wallet-dropdown");
    document.getElementById("wallet-pill-btn").onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    };
    document.getElementById("wallet-dropdown-copy").onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(state.account);
    };
    document.getElementById("wallet-dropdown-disconnect").onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.remove("open");
      disconnectWallet();
    };
    document.getElementById("wallet-dropdown-switch").onclick = (e) => { e.stopPropagation(); switchToArcNetwork(); };
    dropdown.onclick = (e) => e.stopPropagation();
    if (!renderHeader._outsideClose) {
      renderHeader._outsideClose = true;
      document.addEventListener("click", () => {
        const d = document.getElementById("wallet-dropdown");
        if (d) d.classList.remove("open");
      });
    }
    updateNetworkBadge();
  } else {
    el.innerHTML = `<button class="btn btn-primary" id="connect-btn" aria-label="Connect wallet"><span class="cw-long">Connect wallet</span><span class="cw-short">Connect</span></button>`;
    document.getElementById("connect-btn").onclick = connectWallet;
  }
}

let switchingNetwork = false;
/// The one "put my wallet on Arc" action — used by the header badge and
/// the dropdown's Switch button. On a phone connected over WalletConnect
/// the approval only appears inside the wallet app, so this also brings
/// that app to the front (openConnectedWalletApp — must stay synchronous
/// inside the tap, before any await).
async function switchToArcNetwork() {
  if (switchingNetwork) return;
  switchingNetwork = true;
  const note = document.getElementById("wallet-dropdown-note");
  const btn = document.getElementById("wallet-dropdown-switch");
  const badge = document.getElementById("network-badge");
  const setNote = (text, bad) => { if (note) { note.hidden = !text; note.textContent = text || ""; note.classList.toggle("bad", !!bad); } };
  const usingAppKit = typeof appKitReady !== "undefined" && appKitReady && typeof ensureAppKitChain === "function" && !(typeof IN_APP_WALLET_BROWSER !== "undefined" && IN_APP_WALLET_BROWSER);
  const request = usingAppKit ? ensureAppKitChain() : (window.ethereum ? ensureNetwork() : Promise.reject(new Error("No wallet connected.")));
  const jumped = usingAppKit && typeof openConnectedWalletApp === "function" && openConnectedWalletApp();
  if (btn) { btn.disabled = true; btn.textContent = "Waiting for your wallet…"; }
  if (badge) badge.classList.add("network-busy");
  setNote(jumped ? `Approve the switch to ${CONFIG.CHAIN_NAME} in your wallet app, then come back here.` : `Approve the switch to ${CONFIG.CHAIN_NAME} in your wallet.`);
  try {
    await request;
    setNote("");
    if (!usingAppKit) state.chainId = CONFIG.CHAIN_ID_DECIMAL;
  } catch (err) {
    const msg = String(err && (err.shortMessage || err.message) || err);
    setNote(/reject|denied|cancel/i.test(msg) ? "Switch cancelled in the wallet." : msg.slice(0, 260), true);
  } finally {
    switchingNetwork = false;
    if (btn) { btn.disabled = false; btn.textContent = `Switch to ${CONFIG.CHAIN_NAME}`; }
    if (badge) badge.classList.remove("network-busy");
    updateNetworkBadge();
  }
}

/// Called right before every transaction on ArcPad / CirclePad: if the
/// wallet is on another chain, switch it to Arc first (and pick up a
/// signer for the new chain), so a write never goes out on the wrong
/// network or fails with a confusing chain-mismatch error.
async function ensureArcForWrite() {
  const id = await currentChainId().catch(() => null);
  if (id === CONFIG.CHAIN_ID_DECIMAL) return;
  const usingAppKit = typeof appKitReady !== "undefined" && appKitReady && typeof ensureAppKitChain === "function" && !(typeof IN_APP_WALLET_BROWSER !== "undefined" && IN_APP_WALLET_BROWSER);
  if (usingAppKit) { await ensureAppKitChain(); return; }
  if (!window.ethereum) throw new Error(`Switch your wallet to ${CONFIG.CHAIN_NAME} and try again.`);
  await ensureNetwork();
  state.chainId = CONFIG.CHAIN_ID_DECIMAL;
  state.signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
}

async function currentChainId() {
  if (state.chainId != null && Number.isFinite(Number(state.chainId))) return Number(state.chainId);
  if (state.signer && state.signer.provider) return Number((await state.signer.provider.getNetwork()).chainId);
  if (window.ethereum) return Number.parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
  return null;
}

async function updateNetworkBadge() {
  const badge = document.getElementById("network-badge");
  if (!badge || !state.account) return;
  const line = document.getElementById("wallet-dropdown-network");
  const btn = document.getElementById("wallet-dropdown-switch");
  try {
    const chainId = await currentChainId();
    if (chainId == null) throw new Error("unknown");
    const isCorrect = chainId === CONFIG.CHAIN_ID_DECIMAL;
    badge.textContent = isCorrect ? CONFIG.CHAIN_NAME : `Switch to ${CONFIG.CHAIN_NAME}`;
    badge.title = isCorrect ? `Connected to ${CONFIG.CHAIN_NAME}` : `Your wallet is on chain ${chainId} — tap to switch to ${CONFIG.CHAIN_NAME}`;
    badge.classList.toggle("network-bad", !isCorrect);
    badge.style.cursor = isCorrect ? "" : "pointer";
    badge.onclick = isCorrect ? null : (e) => { e.stopPropagation(); switchToArcNetwork(); };
    if (line) {
      line.textContent = isCorrect ? `Connected to ${CONFIG.CHAIN_NAME}` : `Wallet is on another network (chain ${chainId})`;
      line.classList.toggle("network-bad", !isCorrect);
      line.classList.toggle("network-ok", isCorrect);
    }
    if (btn) btn.hidden = isCorrect;
  } catch (err) {
    badge.textContent = "Network?";
    if (line) line.textContent = "Network unknown";
    if (btn) btn.hidden = false;
  }
}

// Boot — same tail app.js itself has (`renderHeader(); route();`), minus
// route() since Arc pages have no HOMEPAD-style hash router. This paints
// the "Connect wallet" button the instant this script runs, before
// wallet-appkit.js even loads; wallet-appkit.js's own self-invoked
// initAppKit() (see its last line) then repaints it if a wallet is
// already authorized (restoreBasicWallet, called from there) or once
// AppKit finishes restoring a session. Script order matters: this file
// must load before wallet-appkit.js so these functions already exist
// when initAppKit() runs.
renderHeader();
;
/* ---- arc-fmt.js ---- */
// arc-fmt.js — one way to write numbers across the site (home, /me, /stats, search, alerts).
//   arcFmt.usd(28100)        "$28.1K"      arcFmt.usd(7.02)   "$7.02"
//   arcFmt.price(0.0000281)  "$0.0₄281"    (zeros after "0." shown as a subscript count)
//   arcFmt.compact(966e6)    "966M"        arcFmt.num(1402.5, 2) "1,402.5"
//   arcFmt.pct(4.2, true)    "+4.20%"      arcFmt.ago(ts)      "5m" / "3h" / "2d"
//   arcFmt.usd(123.456, true) "$123.46"    (exact: cents kept, no K/M — for single trades and balances)
// Every page's own formatter hands off to these, so a number reads the same everywhere.
(function () {
  "use strict";
  if (window.arcFmt) return;
  var fin = function (v) { return v != null && isFinite(v); };
  var trim = function (s) { return s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s; };
  function compact(v, dp) {
    if (!fin(v)) return "—";
    var a = Math.abs(v), d = dp == null ? 2 : dp;
    if (a >= 1e12) return trim((v / 1e12).toFixed(d)) + "T";
    if (a >= 1e9) return trim((v / 1e9).toFixed(d)) + "B";
    if (a >= 1e6) return trim((v / 1e6).toFixed(d)) + "M";
    if (a >= 1e4) return trim((v / 1e3).toFixed(a >= 1e5 ? 0 : 1)) + "K";
    return num(v, a >= 100 ? 0 : 2);
  }
  function num(v, dp) {
    if (!fin(v)) return "—";
    return Number(v).toLocaleString("en-US", { maximumFractionDigits: dp == null ? 2 : dp });
  }
  var SUB = "₀₁₂₃₄₅₆₇₈₉";
  function price(v) {
    if (!fin(v)) return "—";
    if (v === 0) return "$0";
    var a = Math.abs(v), sign = v < 0 ? "-" : "";
    if (a >= 1) return sign + "$" + num(a, a >= 1000 ? 0 : 4);
    if (a >= 0.01) return sign + "$" + a.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    var s = a.toFixed(20).slice(2), z = s.match(/^0*/)[0].length, digits = s.slice(z, z + 3).replace(/0+$/, "") || "0";
    if (z < 4) return sign + "$0." + s.slice(0, z) + digits;
    return sign + "$0.0" + String(z).split("").map(function (c) { return SUB[+c]; }).join("") + digits;
  }
  function usd(v, exact) {
    if (!fin(v)) return "—";
    var a = Math.abs(v);
    if (exact && a >= 0.01 && a < 1e6) return (v < 0 ? "-$" : "$") + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (a > 0 && a < 0.01) return price(v);
    if (a >= 1e4) return (v < 0 ? "-$" : "$") + compact(a);
    return (v < 0 ? "-$" : "$") + num(a, a >= 100 ? 0 : 2);
  }
  function pct(v, signed, dp) {
    if (!fin(v)) return "—";
    return (signed && v > 0 ? "+" : "") + v.toFixed(dp == null ? 2 : dp) + "%";
  }
  function ago(ts) {
    if (!ts) return "—";
    var s = Math.max(1, Date.now() / 1000 - ts);
    return s < 60 ? "now" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d";
  }
  window.arcFmt = { usd: usd, price: price, compact: compact, num: num, pct: pct, ago: ago };
})();
;
/* ---- arc-fx.js ---- */
// arc-fx.js — small, dependency-free motion helpers shared by the ARCIRCLE
// PAD pages. Everything respects prefers-reduced-motion.
//   • price flash: any live price / market-cap readout briefly glows green
//     when its number goes up and red when it goes down
//   • confetti: window.arcConfetti() — used after a successful launch
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- price flash ----
  var WATCH = '[data-ac2="price"],[data-ac2="mcap"],[data-arl="price"],[data-arl="mcap"],#apc-price,#apc-mcap,.ap-launch-card .meta span:first-child';
  var last = new WeakMap();
  var SUBS = "₀₁₂₃₄₅₆₇₈₉";
  function toNumber(text) {
    if (!text) return null;
    var t = String(text).replace(/[,\s$]/g, "");
    // Dexscreener-style small prices: 0.0₅4842 → 0.000004842
    t = t.replace(/0\.0([₀-₉]+)(\d+)/, function (_, sub, digits) {
      var n = sub.split("").map(function (c) { return SUBS.indexOf(c); }).join("");
      return "0." + "0".repeat(Number(n)) + digits;
    });
    var m = /(-?\d+(?:\.\d+)?)([KMBT])?/i.exec(t);
    if (!m) return null;
    var v = parseFloat(m[1]);
    var mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] || "").toUpperCase()] || 1;
    return v * mult;
  }
  function check(el) {
    var now = toNumber(el.textContent);
    var prev = last.get(el);
    last.set(el, now);
    if (reduce || prev == null || now == null || now === prev) return;
    el.classList.remove("fx-up", "fx-down");
    void el.offsetWidth; // restart the animation
    el.classList.add(now > prev ? "fx-up" : "fx-down");
  }
  function scan(root) {
    if (!root.querySelectorAll) return;
    if (root.matches && root.matches(WATCH)) check(root);
    root.querySelectorAll(WATCH).forEach(check);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var el = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!el) return;
        var hit = el.closest && el.closest(WATCH);
        if (hit) check(hit);
        else m.addedNodes && m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // ---- confetti ----
  window.arcConfetti = function (opts) {
    if (reduce) return;
    opts = opts || {};
    var colors = opts.colors || ["#3f9bff", "#35d8d0", "#39ff88", "#ffc861", "#ffffff"];
    var c = document.createElement("canvas");
    c.className = "fx-confetti";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    var parts = [];
    var n = opts.count || 160;
    for (var i = 0; i < n; i++) {
      var fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9), vy: -(10 + Math.random() * 12),
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 10, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        color: colors[i % colors.length],
      });
    }
    var t0 = performance.now();
    function frame(t) {
      var dt = Math.min(2, (t - (frame.prev || t)) / 16.7); frame.prev = t;
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      parts.forEach(function (p) {
        p.vy += 0.42 * dt; p.vx *= Math.pow(0.99, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        if (p.y < H + 40) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - (t - t0) / 4200);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
        ctx.restore();
      });
      if (alive && t - t0 < 4200) requestAnimationFrame(frame);
      else c.remove();
    }
    requestAnimationFrame(frame);
  };
})();
;
/* ---- arcircle-live.js ---- */
/* global ethers, readProvider, withRetry */
// arcircle-live.js — a lightweight, read-only $ARCIRCLE ticker for pages that
// don't load the full ArcPad trading page (CirclePad, Reward). Reads the foci
// bonding curve directly (same contract and maths as arcircle-coin.js) and
// fills any element tagged data-arl="price|mcap|progress-text|progress-fill|
// liq|holders-note". Needs ethers + arc-shared.js (readProvider, withRetry).
(function () {
  "use strict";
  // From config-arc.js; "" while $ARCIRCLE is not live (relaunching).
  var CURVE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_CURVE) || "";
  // Launched on Argus: a Uniswap v4 pool — price from the PoolManager's slot0.
  var POOL_SLOT = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_POOL_SLOT) || "";
  var PM = (typeof CONFIG !== "undefined" && CONFIG.POOL_MANAGER_ADDRESS) || "";
  var VENUE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_VENUE) || "";
  var SUPPLY = 1000000000;
  var ABI = [
    "function getReserves() view returns (uint256 quoteReserve_, uint256 tokenReserve_)",
    "function realQuoteReserve() view returns (uint256)",
    "function graduationThreshold() view returns (uint256)",
    "function graduated() view returns (bool)",
  ];

  function usdc(raw) { return Number(ethers.formatUnits(raw, 6)); }
  function tok(raw) { return Number(ethers.formatUnits(raw, 18)); }
  function fmtPrice(p) {
    if (window.arcFmt) return window.arcFmt.price(p);
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (p >= 0.001) return "$" + p.toPrecision(4);
    var zeros = Math.floor(-Math.log10(p));
    var digits = (Math.round(p * Math.pow(10, zeros + 4)).toString().slice(0, 4).replace(/0+$/, "")) || "0";
    var sub = String(zeros).split("").map(function (d) { return "₀₁₂₃₄₅₆₇₈₉"[d]; }).join("");
    return "$0.0" + sub + digits;
  }
  function fmtUsd(n, exact) {
    if (window.arcFmt) return window.arcFmt.usd(n, exact);
    if (n == null || !isFinite(n)) return "—";
    if (!exact && Math.abs(n) >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function setAll(key, text) {
    document.querySelectorAll('[data-arl="' + key + '"]').forEach(function (el) { el.textContent = text; });
  }

  async function refresh() {
    if (!document.querySelector("[data-arl]")) return;
    if (!CURVE && POOL_SLOT && PM) {
      try {
        var raw = await withRetry(function () { return readProvider().call({ to: PM, data: "0x1e2eaeaf" + POOL_SLOT.replace(/^0x/, "") }); });
        var p = arcircleUsdFromSqrt(BigInt(raw) & ((1n << 160n) - 1n));
        setAll("price", fmtPrice(p));
        setAll("mcap", fmtUsd(p != null ? p * SUPPLY : null));
        setAll("progress-text", "Trading on " + (VENUE || "a DEX") + " · Uniswap v4 pool");
      } catch (e) { setAll("progress-text", "Live $ARCIRCLE data unavailable right now"); }
      document.querySelectorAll('[data-arl="progress-fill"]').forEach(function (el) { el.style.width = "100%"; });
      return;
    }
    if (!CURVE) {
      setAll("price", "Not live");
      setAll("mcap", "—");
      setAll("liq", "—");
      setAll("progress-text", "Not live yet — $ARCIRCLE is relaunching");
      document.querySelectorAll('[data-arl="progress-fill"]').forEach(function (el) { el.style.width = "0%"; });
      return;
    }
    try {
      var c = new ethers.Contract(CURVE, ABI, readProvider());
      var r = await Promise.all([
        withRetry(function () { return c.getReserves(); }),
        withRetry(function () { return c.realQuoteReserve(); }),
        withRetry(function () { return c.graduationThreshold(); }),
        withRetry(function () { return c.graduated(); }),
      ]);
      var spot = usdc(r[0][0]) / tok(r[0][1]);
      var real = usdc(r[1]), thr = usdc(r[2]), graduated = r[3];
      var pct = thr > 0 ? Math.min(100, (real / thr) * 100) : 0;
      setAll("price", fmtPrice(spot));
      setAll("mcap", fmtUsd(spot * SUPPLY));
      setAll("liq", fmtUsd(real, true));
      setAll("progress-text", graduated
        ? "Graduated — trading on its DEX pool"
        : fmtUsd(real, true) + " / " + fmtUsd(thr, true) + " USDC to graduate · " + pct.toFixed(pct < 10 ? 2 : 1) + "%");
      document.querySelectorAll('[data-arl="progress-fill"]').forEach(function (el) {
        el.style.width = (graduated ? 100 : Math.max(pct, 0.6)) + "%";
      });
    } catch (e) {
      setAll("progress-text", "Live $ARCIRCLE data unavailable right now");
    }
  }

  window.arcircleLive = { refresh: refresh, fmtUsd: fmtUsd, fmtPrice: fmtPrice };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh);
  else refresh();
  if (CURVE || POOL_SLOT) setInterval(function () { if (!document.hidden) refresh(); }, 30000);
})();
;
/* ---- arc-token.js ---- */
// arc-token.js — what the $ARCIRCLE page and the Reward page share:
//   • arcToken.load(wallet)  live $ARCIRCLE numbers from /api/social?token=arcircle
//     (price, graduation, 24h volume, holders, buybacks, treasury, revenue),
//     with a direct read of the curve as a fallback for price and graduation
//   • the one definition of the ecosystem's revenue sources (ARC_REVENUE),
//     rendered identically on both pages, each with its live "so far" line
//   • the revenue flow: particles running from each source into the box it
//     feeds, drawn on a canvas behind the two columns
//   • small SVG builders (7-day line, supply donut) and number formats
// No wallet connection, no ethers. Respects prefers-reduced-motion.
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // From config-arc.js; both "" while $ARCIRCLE is not live (relaunching).
  var TOKEN = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "";
  var CURVE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_CURVE) || "";
  // Uniswap v4 pool (Argus): price from the PoolManager's slot0 for the pool
  var POOL_SLOT = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_POOL_SLOT) || "";
  var PM = (typeof CONFIG !== "undefined" && CONFIG.POOL_MANAGER_ADDRESS) || "0x8366a39CC670B4001A1121B8F6A443A643e40951";
  var RPC = (typeof CONFIG !== "undefined" && CONFIG.RPC_URL) || "https://rpc.mainnet.arc.io";
  var EXPLORER = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";

  // ---------- formats ----------
  var SUBS = "₀₁₂₃₄₅₆₇₈₉";
  function price(p) {
    if (window.arcFmt) return window.arcFmt.price(p);
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (p >= 0.001) return "$" + p.toPrecision(4);
    var zeros = Math.floor(-Math.log10(p));
    var digits = (Math.round(p * Math.pow(10, zeros + 4)).toString().slice(0, 4).replace(/0+$/, "")) || "0";
    return "$0.0" + String(zeros).split("").map(function (d) { return SUBS[d]; }).join("") + digits;
  }
  function usd(n, exact) {
    if (window.arcFmt) return window.arcFmt.usd(n, exact);
    if (n == null || !isFinite(n)) return "—";
    if (!exact && Math.abs(n) >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    if (n > 0 && n < 0.01) return "<$0.01";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(n) {
    if (n == null || !isFinite(n)) return "—";
    if (Math.abs(n) >= 10000) return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function ago(ts) {
    if (!ts) return "";
    var s = Math.max(0, Date.now() / 1000 - ts);
    return s < 3600 ? Math.max(1, Math.floor(s / 60)) + "m ago" : s < 86400 ? Math.floor(s / 3600) + "h ago" : Math.floor(s / 86400) + "d ago";
  }
  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  // Argus launch tax ("3% buy · 5% sell") and bonding milestone, from d.argus
  function pct(bps) { return (Math.round(bps) / 100).toFixed(2).replace(/\.?0+$/, "") + "%"; }
  function taxText(d) {
    var a = d && d.argus;
    if (!a || a.buyTaxBps == null) return "Fixed at launch (1–10%)";
    return a.buyTaxBps === a.sellTaxBps ? pct(a.buyTaxBps) + " buy / sell" : pct(a.buyTaxBps) + " buy · " + pct(a.sellTaxBps) + " sell";
  }
  function bondText(d) {
    var a = d && d.argus;
    if (!a || !a.verified) return "—";
    if (a.bonded) return "Reached";
    return a.bondProgress == null ? "—" : a.bondProgress.toFixed(a.bondProgress < 10 ? 2 : 1) + "%";
  }
  function explorer(kind, x) { return EXPLORER + "/" + kind + "/" + x; }

  // ---------- data ----------
  var memo = null; // { at, p }
  function fetchJson(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms || 12000) : null;
    return fetch(url, { signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).finally(function () { if (t) clearTimeout(t); });
  }
  // Fallback: the curve itself, four eth_calls in one batch (price + graduation only).
  function word(h, i) { return BigInt("0x" + (String(h).replace(/^0x/, "").slice(i * 64, (i + 1) * 64) || "0")); }
  function readCurve() {
    var calls = ["0x0902f1ac", "0x4f1f58fd", "0x8b0bc501", "0xe7c2b772"];
    // getReserves(), realQuoteReserve(), graduationThreshold(), graduated()
    var body = calls.map(function (d, id) { return { jsonrpc: "2.0", id: id, method: "eth_call", params: [{ to: CURVE, data: d }, "latest"] }; });
    return fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (out) {
        var by = {}; (Array.isArray(out) ? out : [out]).forEach(function (x) { by[x.id] = x.result; });
        if (!by[0] || by[0] === "0x") throw new Error("curve unreadable");
        var qr = Number(word(by[0], 0)) / 1e6, tr = Number(word(by[0], 1)) / 1e18;
        var real = Number(word(by[1] || "0x", 0)) / 1e6, thr = Number(word(by[2] || "0x", 0)) / 1e6, grad = word(by[3] || "0x", 0) > 0n;
        var p = tr > 0 ? qr / tr : null;
        return { partial: true, price: p, mcap: p != null ? p * 1e9 : null, liquidity: real, threshold: thr, graduated: grad,
          progress: grad ? 100 : thr > 0 ? Math.min(100, (real / thr) * 100) : 0, toGraduate: grad ? 0 : Math.max(0, thr - real) };
      });
  }
  // Fallback for a pool: slot0 → sqrtPriceX96 → USDC per $ARCIRCLE (config-arc.js)
  function readPool() {
    var body = { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: PM, data: "0x1e2eaeaf" + POOL_SLOT.replace(/^0x/, "") }, "latest"] };
    return fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (out) {
        var p = arcircleUsdFromSqrt(BigInt(out && out.result && out.result !== "0x" ? out.result : "0x0") & ((1n << 160n) - 1n));
        if (!(p > 0)) throw new Error("pool unreadable");
        return { live: true, partial: true, venue: "pool", price: p, mcap: p * 1e9 };
      });
  }
  function load(wallet, fresh) {
    if (!wallet && !fresh && memo && Date.now() - memo.at < 20000) return memo.p;
    var url = "/api/social?token=arcircle" + (wallet ? "&wallet=" + encodeURIComponent(wallet) : "");
    var p = fetchJson(url, wallet ? 25000 : 15000).then(function (j) {
      if (!j || j.error || j.price === undefined) throw new Error((j && j.error) || "no data");
      return j;
    }).catch(function (err) {
      if (wallet) throw err;
      if (POOL_SLOT && !CURVE) return readPool();
      if (!CURVE) return { live: false, partial: true, price: null };
      return readCurve();
    });
    if (!wallet) { memo = { at: Date.now(), p: p }; p.catch(function () { memo = null; }); }
    return p;
  }
  // Keep the page's numbers current: every 30s while visible; while the
  // server is still indexing history, again after 6s.
  var subs = [], timer = null, last = null;
  function tick() {
    clearTimeout(timer);
    load(null, true).then(function (d) {
      last = d;
      subs.forEach(function (fn) { try { fn(d); } catch (e) { console.warn("arcToken subscriber", e); } });
      document.dispatchEvent(new CustomEvent("arcircle:stats", { detail: d }));
      timer = setTimeout(loop, d.complete === false ? 6000 : 30000);
    }, function () { timer = setTimeout(loop, 30000); });
  }
  function loop() { if (document.hidden) { timer = setTimeout(loop, 5000); return; } tick(); }
  function subscribe(fn) {
    subs.push(fn);
    if (last) fn(last);
    if (subs.length === 1) tick();
  }

  // ---------- helpers ----------
  function onVisible(el, fn, margin) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (ents) {
      if (ents.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { rootMargin: margin || "0px 0px -10% 0px", threshold: 0.1 });
    io.observe(el);
  }
  function countTo(el, to, fmt, ms) {
    if (!el || to == null || !isFinite(to)) return;
    if (typeof window.arcCountUp === "function") return window.arcCountUp(el, to, fmt, ms);
    el.textContent = fmt ? fmt(to) : String(to);
  }

  // ---------- revenue: one definition for both pages ----------
  var REVENUE = [
    { id: "launch", tag: "ArcPad", acc: "#4d9fff", name: "Launch fee", sub: "Flat fee on every coin launched on ArcPad", amt: "1 USDC" },
    { id: "alloc", tag: "ArcPad", acc: "#4d9fff", name: "Platform allocation", sub: "Of every ArcPad coin's supply, set aside at launch", amt: "8%" },
    { id: "fees", tag: "ArcPad", acc: "#4d9fff", name: "Trading-fee share", sub: "30% of the 1% base fee on every ArcPad trade", amt: "0.3%" },
    { id: "raise", tag: "CirclePad", acc: "#39ff88", name: "Raise share", sub: "Of each CirclePad raise when it closes", amt: "5%" },
    { id: "argus", tag: "ArcPad", acc: "#4d9fff", name: "Argus launch share", sub: "30% of the creator share on coins launched on Argus through ArcPad", amt: "30%" },
    { id: "util", tag: "Utilities", acc: "#ffc861", name: "Utility revenue", sub: "Paid tools and ARCIA 402; Token Scanner unlocks and Builder Mine burn $ARCIRCLE directly", amt: "Burns" },
    { id: "tax", tag: "$ARCIRCLE", acc: "#35d8d0", name: "Creator fee", sub: "90% of the buy / sell tax on every $ARCIRCLE trade", amt: "90% of tax" },
  ];
  window.ARC_REVENUE = REVENUE;
  function revenueRows() {
    return REVENUE.map(function (r) {
      return '<div class="ax-rev-row" style="--acc:' + r.acc + '" data-rev="' + r.id + '">' +
        '<span class="ax-tag">' + esc(r.tag) + "</span>" +
        '<div class="ax-rev-name"><strong>' + esc(r.name) + "</strong><small>" + esc(r.sub) + '</small><em class="ax-rev-live" data-rev-live="' + r.id + '"></em></div>' +
        '<div class="ax-rev-amt">' + esc(r.amt) + "</div></div>";
    }).join("");
  }
  function liveLine(id, d) {
    var rv = d && d.revenue;
    if (!rv) return "";
    if (id === "launch") return rv.launches != null ? rv.launches + " launches so far · " + usd(rv.launchFees) : "";
    if (id === "alloc") return rv.allocationCoins != null ? rv.allocationCoins + " coins so far" : "";
    if (id === "fees") return "Paid to the treasury on every trade";
    if (id === "raise") {
      var c = rv.circle;
      if (!c) return "";
      if (!c.started) return "Round #1 opens soon";
      if (!c.open) return "Round #1: " + usd(c.raised) + " raised · " + usd(c.share) + " to the platform · Round #2 next";
      return "Round #1: " + usd(c.raised) + " raised · " + usd(c.share) + " at close";
    }
    if (id === "util") return d.burned && d.burned.bySource ? (function (b) { var t = ["scanner", "mine", "secret", "desk"].reduce(function (x, k) { return x + (b[k] ? b[k].tokens : 0); }, 0); return t > 0 ? num(t) + " $ARCIRCLE burned by utilities so far" : ""; })(d.burned.bySource) : "";
    if (id === "tax") return rv.creatorTax != null ? usd(rv.creatorTax) + " earned since launch" : d.live === false ? "Starts when $ARCIRCLE is live"
      : rv.curveVolume != null ? usd(rv.curveVolume) + " traded since launch" : "";
    return "";
  }
  function mountRevenue(list) {
    if (!list || list.__rev) return;
    list.__rev = true;
    list.innerHTML = revenueRows();
    subscribe(function (d) {
      REVENUE.forEach(function (r) {
        var el = list.querySelector('[data-rev-live="' + r.id + '"]');
        var t = liveLine(r.id, d);
        if (el && el.textContent !== t) { el.textContent = t; el.classList.toggle("on", !!t); }
      });
    });
  }

  // ---------- revenue flow: particles from each source into the box ----------
  function mountFlow(rev) {
    var list = rev && rev.querySelector(".ax-rev-list"), dest = rev && rev.querySelector(".ax-rev-dest");
    if (!list || !dest || rev.__flow) return;
    rev.__flow = true;
    var cv = document.createElement("canvas");
    cv.className = "ax-rev-flow";
    cv.setAttribute("aria-hidden", "true");
    rev.insertBefore(cv, rev.firstChild);
    var ctx = cv.getContext("2d");
    if (!ctx) return;
    var paths = [], parts = [], running = false, visible = false, dpr = 1, wide = true, raf = 0;
    function layout() {
      var R = rev.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(R.width * dpr); cv.height = Math.round(R.height * dpr);
      cv.style.width = R.width + "px"; cv.style.height = R.height + "px";
      var D = dest.getBoundingClientRect(), L = list.getBoundingClientRect();
      wide = D.left > L.right - 4; // two columns side by side
      var rows = list.querySelectorAll(".ax-rev-row");
      paths = Array.prototype.map.call(rows, function (row, i) {
        var r = row.getBoundingClientRect();
        var acc = getComputedStyle(row).getPropertyValue("--acc").trim() || "#35d8d0";
        var id = row.getAttribute("data-rev") || "";
        if (wide) {
          // from the row's right edge into the box's left edge, fanned out over its height
          var x0 = L.right - R.left - 2, y0 = r.top + r.height / 2 - R.top;
          var x1 = D.left - R.left + 2, y1 = D.top - R.top + 30 + ((D.height - 60) * i) / Math.max(1, rows.length - 1);
          var mx = (x1 - x0) * 0.55;
          return { id: id, acc: acc, p: [x0, y0, x0 + mx, y0, x1 - mx, y1, x1, y1] };
        }
        // stacked: from under the list down into the top of the box
        var sx = L.left - R.left + (L.width * (i + 1)) / (rows.length + 1), sy = L.bottom - R.top - 2;
        var ex = D.left - R.left + D.width / 2 + (i - (rows.length - 1) / 2) * 10, ey = D.top - R.top + 2;
        var my = (ey - sy) / 2;
        return { id: id, acc: acc, p: [sx, sy, sx, sy + my, ex, ey - my, ex, ey] };
      });
    }
    function bez(p, t) {
      var u = 1 - t;
      return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
        u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]];
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      paths.forEach(function (q) {
        var p = q.p;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
        ctx.strokeStyle = q.acc; ctx.globalAlpha = 0.22; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]); ctx.stroke();
      });
      ctx.setLineDash([]);
      parts.forEach(function (pt) {
        var q = paths[pt.k]; if (!q) return;
        var xy = bez(q.p, pt.t);
        ctx.globalAlpha = Math.sin(Math.PI * pt.t) * 0.95;
        ctx.fillStyle = q.acc; ctx.shadowColor = q.acc; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      });
      // amount chips: what each source has actually brought in, riding its path
      chips.forEach(function (c) {
        var q = paths[c.k]; if (!q) return;
        var xy = bez(q.p, c.t), a = Math.min(1, Math.sin(Math.PI * c.t) * 1.6);
        ctx.font = "700 11px Sora, sans-serif";
        var w = ctx.measureText(c.txt).width + 14, h = 19, x = xy[0] - w / 2, y = xy[1] - h / 2;
        ctx.globalAlpha = a * 0.92;
        ctx.fillStyle = "rgba(6,10,16,.92)"; ctx.strokeStyle = q.acc; ctx.lineWidth = 1;
        ctx.shadowColor = q.acc; ctx.shadowBlur = 12;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 9.5); else ctx.rect(x, y, w, h);
        ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
        ctx.fillStyle = q.acc; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(c.txt, xy[0], xy[1] + 0.5);
      });
      ctx.globalAlpha = 1;
    }
    // sources weighted by what they have earned so far (every one still flows a little)
    var weights = [], amounts = {}, chips = [], nextChip = 1200;
    function pick() {
      var tot = 0, i;
      for (i = 0; i < paths.length; i++) tot += weights[i] == null ? 1 : weights[i];
      var r = Math.random() * tot;
      for (i = 0; i < paths.length; i++) { r -= weights[i] == null ? 1 : weights[i]; if (r <= 0) return i; }
      return Math.floor(Math.random() * paths.length);
    }
    function reweigh(d) {
      var rv = (d && d.revenue) || {};
      amounts = { launch: rv.launchFees, raise: rv.circle && rv.circle.share, tax: rv.creatorTax };
      var max = 0;
      paths.forEach(function (q) { var v = amounts[q.id]; if (v > max) max = v; });
      weights = paths.map(function (q) { var v = amounts[q.id]; return 0.35 + (max > 0 && v > 0 ? (v / max) * 2.4 : 0); });
    }
    function spawnChip() {
      var ks = paths.map(function (q, i) { return amounts[q.id] > 0 ? i : -1; }).filter(function (i) { return i >= 0; });
      if (!ks.length || chips.length >= 2) return;
      var k = ks[Math.floor(Math.random() * ks.length)], v = amounts[paths[k].id];
      chips.push({ k: k, t: 0, v: 0.00016, txt: "+" + usd(v) });
    }
    var lastT = 0;
    function frame(t) {
      var dt = lastT ? Math.min(50, t - lastT) : 16; lastT = t;
      parts.forEach(function (pt) { pt.t += dt * pt.v; if (pt.t >= 1) { pt.t = 0; pt.k = pick(); } });
      nextChip -= dt;
      if (nextChip <= 0) { spawnChip(); nextChip = 2600 + Math.random() * 1800; }
      for (var c = chips.length - 1; c >= 0; c--) {
        chips[c].t += dt * chips[c].v;
        if (chips[c].t >= 1) {
          chips.splice(c, 1);
          dest.classList.remove("ax-rev-hit"); void dest.offsetWidth; dest.classList.add("ax-rev-hit");
        }
      }
      draw();
      if (running) raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduce || !visible || document.hidden) return;
      running = true; lastT = 0; raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }
    layout();
    for (var i = 0; i < 14; i++) parts.push({ k: i % Math.max(1, paths.length), t: Math.random(), v: 0.00022 + Math.random() * 0.00016 });
    draw();
    var relayout = function () { layout(); draw(); };
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(rev);
    window.addEventListener("resize", relayout);
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        visible = ents.some(function (e) { return e.isIntersecting; });
        if (visible) { relayout(); start(); } else stop();
      }, { threshold: 0.05 }).observe(rev);
    }
    // the live lines change row heights
    subscribe(function (d) { setTimeout(function () { relayout(); reweigh(d); }, 60); });
  }

  // ---------- SVG builders ----------
  function spark(values, opts) {
    opts = opts || {};
    var W = opts.w || 320, Hh = opts.h || 90, pad = 4;
    var v = (values || []).filter(function (x) { return x != null && isFinite(x); });
    if (v.length < 2) return "";
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (hi === lo) { hi = lo * 1.01 || 1; lo = lo * 0.99; }
    var pts = [], n = values.length, lastV = null;
    values.forEach(function (x, i) {
      if (x == null) { if (lastV == null) return; x = lastV; }
      lastV = x;
      pts.push([pad + (i / (n - 1)) * (W - pad * 2), pad + (1 - (x - lo) / (hi - lo)) * (Hh - pad * 2)]);
    });
    var up = v[v.length - 1] >= v[0];
    var col = up ? "#39ff88" : "#ff5d73";
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
    var area = line + "L" + pts[pts.length - 1][0].toFixed(1) + " " + Hh + "L" + pts[0][0].toFixed(1) + " " + Hh + "Z";
    var id = "sg" + Math.random().toString(36).slice(2, 7);
    var endP = pts[pts.length - 1];
    return '<svg class="ax-spark ' + (up ? "up" : "down") + '" viewBox="0 0 ' + W + " " + Hh + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.label || "7-day price") + '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".28"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + id + ')" class="ax-spark-area"/>' +
      '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" pathLength="1" class="ax-spark-line"/>' +
      '<circle cx="' + endP[0].toFixed(1) + '" cy="' + endP[1].toFixed(1) + '" r="3.2" fill="' + col + '" class="ax-spark-dot"/></svg>';
  }
  function donut(parts, opts) {
    opts = opts || {};
    var total = parts.reduce(function (s, p) { return s + (p.v || 0); }, 0) || 1;
    var R = 60, C = 2 * Math.PI * R, off = 0;
    var segs = parts.map(function (p) {
      var len = ((p.v || 0) / total) * C;
      var s = '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="20" stroke-dasharray="' + Math.max(0, len - (len > 3 ? 1.5 : 0)).toFixed(2) + " " + C.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" class="ax-donut-seg"><title>' + esc(p.label) + "</title></circle>";
      off += len;
      return s;
    }).join("");
    return '<svg class="ax-donut" viewBox="0 0 160 160" role="img" aria-label="' + esc(opts.label || "Supply split") + '"><g transform="rotate(-90 80 80)"><circle cx="80" cy="80" r="' + R + '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="20"/>' + segs + "</g>" +
      '<text x="80" y="76" text-anchor="middle" class="ax-donut-big">' + esc(opts.center || "") + '</text><text x="80" y="96" text-anchor="middle" class="ax-donut-small">' + esc(opts.sub || "") + "</text></svg>";
  }

  window.arcToken = {
    load: load, subscribe: subscribe, mountRevenue: mountRevenue, mountFlow: mountFlow, spark: spark, donut: donut,
    onVisible: onVisible, countTo: countTo, fmt: { price: price, usd: usd, num: num, ago: ago, short: short, esc: esc, explorer: explorer, tax: taxText, bond: bondText },
    TOKEN: TOKEN, CURVE: CURVE, live: !!TOKEN, reduce: reduce,
  };
})();
;
/* ---- reward.js ---- */
/* global ethers, CONFIG, ARC_FACTORY_ABI, readProvider, withRetry, multicallRead */
// reward.js — live bits of the Reward page (reward.html). The reward program
// itself isn't live, so everything here is read-only context, plus one
// signed (free) poll:
//   • hero: the fixed supply counts up and the "0 new tokens" stamps in
//   • revenue: the shared list (arc-token.js) flowing into the treasury box,
//     and "earned so far" totals that count up
//   • "Check a wallet" (typed, linked, or "Use my wallet"): $ARCIRCLE held and
//     rank, how long it has been held, ArcPad coins created, CirclePad
//     contribution and invites — cards stagger in, the holding bar grows
//   • candidate-mechanics poll: one signed vote per wallet per mechanic
//   • roadmap: the line fills to the current phase, "We are here" pulses
(function () {
  "use strict";
  // From config-arc.js; "" while $ARCIRCLE is not live (relaunching).
  var ARCIRCLE_TOKEN = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "";
  var SUPPLY = 1000000000;
  var ERC20 = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
  ];
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function T() { return window.arcToken; }
  function usd(n, exact) { return T() ? T().fmt.usd(n, exact) : "$" + Number(n || 0).toFixed(2); }
  function factory() { return new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider()); }
  function fmtTok(n) {
    if (!isFinite(n)) return "—";
    if (n === 0) return "0";
    if (n >= 10000) return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function day(ts) { return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "—"; }
  function countTo(el, v, fmt) { if (!el || v == null || !isFinite(v)) return; if (T()) T().countTo(el, v, fmt); else el.textContent = fmt ? fmt(v) : String(v); }
  function tk(k) { return document.querySelectorAll('[data-tk="' + k + '"]'); }
  function each(k, fn) { Array.prototype.forEach.call(tk(k), fn); }
  function setText(k, v) { each(k, function (el) { if (el.textContent !== v) el.textContent = v; }); }

  // ---- ArcPad launches (count for the stats strip; full list for the check) ----
  var launchesPromise = null;
  function loadLaunches() {
    if (launchesPromise) return launchesPromise;
    launchesPromise = (async function () {
      var f = factory();
      var count = Number(await withRetry(function () { return f.launchCount(); }));
      var rows = [];
      for (var start = 0; start < count; start += 20) {
        var idxs = [];
        for (var i = start; i < Math.min(count, start + 20); i++) idxs.push(i);
        var batch = await withRetry(function () {
          return multicallRead(idxs.map(function (i) { return { contract: f, method: "launches", args: [i] }; }));
        });
        batch.forEach(function (l) { if (l) rows.push({ token: l.token, creator: String(l.creator).toLowerCase(), launchedAt: Number(l.launchedAt) }); });
      }
      return { count: count, rows: rows };
    })();
    launchesPromise.catch(function () { launchesPromise = null; });
    return launchesPromise;
  }

  async function showLaunchCount() {
    var el = $("rw-launches");
    if (!el) return;
    try {
      var f = factory();
      var n = Number(await withRetry(function () { return f.launchCount(); }));
      if (T()) T().onVisible(el, function () { countTo(el, n, function (v) { return String(Math.round(v)); }); });
      else el.textContent = String(n);
    } catch (e) { el.textContent = "—"; }
  }

  // ---- hero: 1,000,000,000 counts up, the 0 stamps in ----
  function hero() {
    var box = $("rw-zero");
    if (!box) return;
    var sup = box.querySelector(".rw-zero-supply");
    var run = function () {
      box.classList.add("in");
      if (!reduce && sup) { sup.__cu = 0; countTo(sup, SUPPLY, function (v) { return Math.round(v).toLocaleString("en-US"); }); }
    };
    if (T()) T().onVisible(box, run, "0px"); else run();
  }

  // ---- revenue dashboard + treasury box ----
  function paintStats(d) {
    if (!d || d.partial) return;
    var rv = d.revenue || {};
    var tre = d.treasury || {};
    each("tre-usdc", function (el) { countTo(el, tre.usdc || 0, function (v) { return usd(v); }); });
    if (tre.arcircle != null) each("tre-arc", function (el) { countTo(el, tre.arcircle || 0, fmtTok); });
    setText("bb-n", String(d.buybacks ? d.buybacks.n : 0));
    var dash = $("rw-dash");
    if (!dash) return;
    var go = function () {
      each("earned", function (el) { countTo(el, (rv.launchFees || 0) + (rv.creatorTax || 0), function (v) { return usd(v); }); });
      each("fees", function (el) { countTo(el, rv.launchFees || 0, function (v) { return usd(v); }); });
      each("tax", function (el) { if (rv.creatorTax == null && d.venue === "pool") el.textContent = "—"; else countTo(el, rv.creatorTax || 0, function (v) { return usd(v); }); });
      var c = rv.circle;
      each("raise", function (el) { countTo(el, c ? c.share || 0 : 0, function (v) { return usd(v); }); });
    };
    setText("fees-sub", rv.launches != null ? rv.launches + " launches × 1 USDC" : "1 USDC × every ArcPad launch");
    setText("tax-sub", d.live === false ? "Starts when $ARCIRCLE is live"
      : d.venue === "pool" ? (rv.curveVolume != null ? "90% of the tax on " + usd(rv.curveVolume) + " traded" : "90% of the tax on every $ARCIRCLE trade")
      : rv.curveVolume != null ? "2% of " + usd(rv.curveVolume) + " traded on the curve" : "2% of every $ARCIRCLE trade");
    var c = rv.circle;
    setText("raise-sub", !c ? "5% of round #1 when it closes" : !c.started ? "Round #1 opens soon" : c.open ? usd(c.raised) + " raised in round #1 so far" : usd(c.share) + " from round #1 · round #2 next");
    if (dash.__seen) go();
    else if (T()) T().onVisible(dash, function () { dash.__seen = true; go(); });
  }

  // ---- Check a wallet ----
  var checking = 0;
  async function check(addr) {
    var err = $("rw-err"), out = $("rw-result"), btn = document.querySelector("#rw-check-form button[type=submit]");
    err.hidden = true;
    if (!ethers.isAddress(addr)) {
      err.textContent = "That doesn't look like a wallet address — it should start with 0x and be 42 characters long.";
      err.hidden = false; out.hidden = true; return;
    }
    addr = ethers.getAddress(addr);
    var run = ++checking;
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      var tok = ARCIRCLE_TOKEN ? new ethers.Contract(ARCIRCLE_TOKEN, ERC20, readProvider()) : null;
      var res = await Promise.all([
        tok ? withRetry(function () { return tok.balanceOf(addr); }) : Promise.resolve(null),
        loadLaunches(),
        T() ? T().load(addr.toLowerCase()).catch(function () { return null; }) : Promise.resolve(null),
      ]);
      if (run !== checking) return;
      var ws = res[2] && res[2].wallet ? res[2].wallet : null;
      var bal = res[0] == null ? 0 : Number(ethers.formatUnits(res[0], 18));
      $("rw-bal").textContent = !tok ? "Not live" : fmtTok(bal) + " $ARCIRCLE";
      $("rw-bal-sub").textContent = !tok ? "$ARCIRCLE is relaunching — nothing to hold yet"
        : bal > 0
        ? (bal / SUPPLY * 100).toPrecision(3).replace(/\.?0+$/, "") + "% of total supply" + (ws && ws.rank ? " · holder #" + ws.rank + " of " + ws.of : "")
        : "Not holding $ARCIRCLE right now";

      // holding period
      var bar = $("rw-held-bar");
      bar.style.width = "0%";
      if (!tok) {
        $("rw-held").textContent = "—";
        $("rw-held-sub").textContent = "Starts counting when $ARCIRCLE is live";
      } else if (!ws) {
        $("rw-held").textContent = "—";
        $("rw-held-sub").textContent = "Couldn't read the holding history right now";
      } else if (bal <= 0 || !ws.holdingSince) {
        $("rw-held").textContent = bal > 0 && !ws.indexed ? "…" : "0 days";
        $("rw-held-sub").textContent = bal > 0 && !ws.indexed ? "Still indexing history — try again in a minute" : "Not holding $ARCIRCLE right now";
      } else {
        var d = ws.heldDays;
        $("rw-held").textContent = d >= 1 ? d.toFixed(1) + " days" : Math.max(1, Math.round(d * 24)) + (Math.round(d * 24) === 1 ? " hour" : " hours");
        $("rw-held-sub").textContent = "Since " + day(ws.holdingSince) + " · $ARCIRCLE is " + (ws.maxDays || 0).toFixed(1) + " days old";
        var pct = ws.maxDays > 0 ? Math.min(100, (d / ws.maxDays) * 100) : 0;
        bar.__pct = pct;
      }

      var mine = res[1].rows.filter(function (r) { return r.creator === addr.toLowerCase(); })
        .sort(function (a, b) { return b.launchedAt - a.launchedAt; });
      $("rw-created").textContent = String(mine.length);
      $("rw-created-sub").textContent = mine.length
        ? "Creator activity is what creator rewards are designed to measure"
        : "No ArcPad launches from this address yet";

      // CirclePad
      if (!ws || ws.circle == null) {
        $("rw-circle").textContent = "—";
        $("rw-circle-sub").textContent = "Couldn't read CirclePad right now";
      } else {
        $("rw-circle").textContent = usd(ws.circle, true);
        $("rw-circle-sub").textContent = ws.referrals && ws.referrals.n
          ? "Invites brought " + usd(ws.referrals.usdc, true) + " into CirclePad"
          : ws.circle > 0 ? "Contributed to round #1" : "No CirclePad contribution yet";
      }
      // the burn card (reward-engine.js) fills itself from the same answer
      document.dispatchEvent(new CustomEvent("reward:wallet", { detail: { address: addr, wallet: ws } }));

      var list = $("rw-created-list");
      list.innerHTML = "";
      if (mine.length) {
        var names = await multicallRead(mine.slice(0, 24).map(function (r) {
          return { contract: new ethers.Contract(r.token, ERC20, readProvider()), method: "symbol" };
        })).catch(function () { return []; });
        list.innerHTML = mine.slice(0, 24).map(function (r, i) {
          var sym = names[i] ? "$" + names[i] : r.token.slice(0, 6) + "…" + r.token.slice(-4);
          return '<a class="rw-chip" href="/arc#coin/' + esc(r.token) + '">' + esc(sym) + "</a>";
        }).join("") + (mine.length > 24 ? '<span class="rw-chip rw-chip-more">+' + (mine.length - 24) + " more</span>" : "");
      }
      renderInvite(addr);
      reveal(out);
      try { history.replaceState(null, "", "#check=" + addr); } catch (e) { /* fine */ }
    } catch (e) {
      err.textContent = "Couldn't reach Arc to read this wallet — check your connection and try again.";
      err.hidden = false;
    } finally {
      if (run === checking) { btn.disabled = false; btn.textContent = "Check"; }
    }
  }
  // result cards stagger in; then the holding bar grows
  function reveal(out) {
    out.hidden = false;
    var cards = out.querySelectorAll(".rw-result-card");
    Array.prototype.forEach.call(cards, function (c, i) {
      c.classList.remove("rw-in");
      c.style.transitionDelay = reduce ? "0ms" : i * 90 + "ms";
    });
    void out.offsetWidth;
    Array.prototype.forEach.call(cards, function (c) { c.classList.add("rw-in"); });
    var bar = $("rw-held-bar");
    setTimeout(function () { bar.style.width = (bar.__pct || 0) + "%"; }, reduce ? 0 : 420);
  }

  // ---- "Use my wallet": the browser wallet's address, read-only ----
  function injected() { return window.ethereum && typeof window.ethereum.request === "function" ? window.ethereum : null; }
  async function myAddress() {
    var eth = injected();
    if (!eth) throw new Error("nowallet");
    var acc = await eth.request({ method: "eth_requestAccounts" });
    if (!acc || !acc[0]) throw new Error("nowallet");
    return acc[0];
  }
  function noWalletMsg(e) {
    return e && e.message === "nowallet"
      ? "No wallet found in this browser — paste your address instead, or open this page in your wallet app's browser."
      : e && (e.code === 4001 || /reject|denied/i.test(String(e.message))) ? "The wallet request was declined." : "Your wallet didn't answer — try again.";
  }
  function useMine() {
    var err = $("rw-err");
    myAddress().then(function (a) { $("rw-addr").value = a; check(a); }, function (e) { err.textContent = noWalletMsg(e); err.hidden = false; });
  }

  // ---- Invite link (referral share is a candidate mechanic, not live) ----
  function renderInvite(addr) {
    var out = $("rw-result");
    var box = $("rw-invite");
    if (!box) {
      box = document.createElement("div");
      box.id = "rw-invite"; box.className = "rw-invite";
      out.appendChild(box);
    }
    var link = "https://www.arcircle.app/?ref=" + addr.toLowerCase();
    box.innerHTML = '<div class="rw-invite-top"><span>Invite link</span><code data-no-i18n>' + esc(link) + '</code><button type="button" class="ax-btn ax-btn-ghost rw-invite-copy">Copy</button></div>'
      + "<small>Anyone who opens ARCIRCLE PAD through this link is remembered as your invite in their browser for 30 days, and CirclePad contributions made through it are credited to you. Referral share is a candidate mechanic — nothing is paid for invites yet.</small>";
    box.querySelector(".rw-invite-copy").addEventListener("click", function (e) {
      var b = e.currentTarget;
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(link) : Promise.reject()).then(
        function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); },
        function () { b.textContent = "Copy failed"; });
    });
  }

  // ---- candidate-mechanics poll ----
  var POLL = { wallet: null, data: null };
  var pollMessage = function (mech, wallet) { return "ARCIRCLE PAD — rewards poll\nI support: " + mech + "\nWallet: " + String(wallet).toLowerCase(); };
  function pollUrl() { return "/api/social?poll=rewards" + (POLL.wallet ? "&wallet=" + POLL.wallet : ""); }
  function paintPoll() {
    var box = $("rw-poll"), d = POLL.data;
    if (!box || !d || !d.enabled) return;
    box.classList.add("on");
    var note = $("rw-poll-note");
    if (note && note.hidden) { note.hidden = false; note.textContent = "Support the mechanics you'd keep. You sign a message with your wallet — free, no transaction. One vote per wallet per mechanic; votes from $ARCIRCLE holders are counted separately."; }
    var max = 1;
    Object.keys(d.tally).forEach(function (k) { max = Math.max(max, d.tally[k].n); });
    Array.prototype.forEach.call(box.querySelectorAll(".rw-vote"), function (v) {
      var m = v.getAttribute("data-mech"), t = d.tally[m] || { n: 0, holders: 0 };
      var b = v.querySelector(".rw-vote-n b");
      countTo(b, t.n, function (x) { return String(Math.round(x)); });
      var sm = v.querySelector(".rw-vote-n small");
      var label = t.holders ? (t.n === 1 ? "supporter" : "supporters") + " · " + t.holders + (t.holders === 1 ? " holder" : " holders") : t.n === 1 ? "supporter" : "supporters";
      if (sm.textContent !== label) sm.textContent = label;
      v.querySelector(".rw-vote-bar i").style.width = (t.n / max) * 100 + "%";
      var mineOn = (d.mine || []).indexOf(m) >= 0;
      var btn = v.querySelector(".rw-vote-btn");
      btn.classList.toggle("done", mineOn);
      btn.disabled = mineOn || btn.__busy;
      btn.textContent = mineOn ? "Supported" : btn.__busy ? "Sign in wallet…" : "Support";
    });
  }
  function loadPoll() {
    return fetch(pollUrl()).then(function (r) { return r.json(); }).then(function (d) { POLL.data = d; paintPoll(); }).catch(function () { /* poll stays hidden */ });
  }
  async function vote(btn, mech) {
    var note = $("rw-poll-note");
    btn.__busy = true; paintPoll();
    try {
      var eth = injected();
      if (!eth) throw new Error("nowallet");
      var w = (await myAddress()).toLowerCase();
      POLL.wallet = w;
      var msg = pollMessage(mech, w);
      var sig = await eth.request({ method: "personal_sign", params: [ethers.hexlify(ethers.toUtf8Bytes(msg)), w] });
      var r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rpoll", mech: mech, wallet: w, signature: sig }) });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.tally) { POLL.data = j; if (typeof window.arcFeedback === "function") window.arcFeedback("success"); }
      else if (r.status === 409) await loadPoll();
      else throw new Error(j.error || "failed");
    } catch (e) {
      if (note) note.textContent = e && e.message === "nowallet" ? noWalletMsg(e) : e && (e.code === 4001 || /reject|denied/i.test(String(e.message))) ? "The signature was declined — nothing was sent." : "Couldn't record that vote — try again.";
    } finally {
      btn.__busy = false; paintPoll();
    }
  }
  function initPoll() {
    var box = $("rw-poll");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".rw-vote-btn");
      if (!btn || btn.disabled) return;
      vote(btn, btn.closest(".rw-vote").getAttribute("data-mech"));
    });
    // a wallet that already trusts this site shows its own votes (no prompt)
    var eth = injected();
    var first = eth ? eth.request({ method: "eth_accounts" }).then(function (acc) { if (acc && acc[0]) POLL.wallet = String(acc[0]).toLowerCase(); }, function () {}) : Promise.resolve();
    first.then(loadPoll);
  }

  // ---- roadmap: fill the line to the current phase ----
  function roadmap() {
    var ol = $("rw-time");
    if (!ol) return;
    var now = ol.querySelector(".rw-t.now");
    var set = function () { if (now) ol.style.setProperty("--fill", now.offsetTop + 12 + "px"); };
    set();
    window.addEventListener("resize", set);
    if (T()) T().onVisible(ol, function () { set(); ol.classList.add("fill"); });
    else ol.classList.add("fill");
  }

  // ---- Tabs: the page is seven short views instead of one long scroll (the burn engine first).
  // Section ids stay as they were, so #funding, #check=0x…, #faq… still land
  // on the right view (and in-page links switch views).
  var TABS = [
    { id: "engine", label: "Burn engine", secs: ["engine", "burns"] },
    { id: "build", label: "Build", secs: ["build", "timeline"] },
    { id: "programs", label: "Programs", secs: ["programs", "principles"] },
    { id: "study", label: "Under study", secs: ["mechanics", "next"] },
    { id: "funding", label: "Funding", secs: ["funding"] },
    { id: "wallet", label: "My wallet", secs: ["check"] },
    { id: "faq", label: "FAQ", secs: ["faq", "commitments", "alerts"] },
  ];
  var showTab = null;
  function mountTabs() {
    var first = $(TABS[0].secs[0]);
    if (!first || document.querySelector(".rw-tabs")) return;
    var nav = document.createElement("nav");
    nav.className = "rw-tabs";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Reward sections");
    nav.innerHTML = '<span class="rw-tab-ink" aria-hidden="true"></span>' + TABS.map(function (t) {
      return '<button type="button" role="tab" id="rw-tab-' + t.id + '" data-tab="' + t.id + '" aria-controls="' + t.secs[0] + '">' + t.label + "</button>";
    }).join("");
    first.parentNode.insertBefore(nav, first);
    var ink = nav.querySelector(".rw-tab-ink"), cur = null;
    var tabOf = function (secId) { for (var i = 0; i < TABS.length; i++) if (TABS[i].secs.indexOf(secId) >= 0) return TABS[i]; return null; };
    var moveInk = function () {
      var b = nav.querySelector('[aria-selected="true"]');
      if (!b) return;
      ink.style.width = b.offsetWidth + "px"; ink.style.transform = "translateX(" + b.offsetLeft + "px)";
      if (b.scrollIntoView && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2);
    };
    showTab = function (id, opts) {
      var t = TABS.filter(function (x) { return x.id === id; })[0] || TABS[0];
      TABS.forEach(function (x) {
        var on = x === t;
        x.secs.forEach(function (sid) {
          var sec = $(sid);
          if (!sec) return;
          sec.hidden = !on; sec.setAttribute("role", "tabpanel"); sec.setAttribute("aria-labelledby", "rw-tab-" + x.id);
          if (on && cur && cur !== t.id) { sec.classList.remove("rw-in"); void sec.offsetWidth; sec.classList.add("rw-in"); }
        });
        var b = nav.querySelector('[data-tab="' + x.id + '"]');
        b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      });
      cur = t.id;
      moveInk();
      if (opts && opts.scroll) {
        var top = nav.getBoundingClientRect().top + window.scrollY - 70;
        if (window.scrollY > top + 4 || opts.force) window.scrollTo({ top: top, behavior: opts.instant ? "auto" : "smooth" });
      }
      document.dispatchEvent(new CustomEvent("reward:tab", { detail: { tab: t.id } }));
    };
    nav.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-tab]");
      if (!b) return;
      showTab(b.getAttribute("data-tab"), { scroll: true });
      try { history.replaceState(null, "", "#" + TABS.filter(function (x) { return x.id === b.getAttribute("data-tab"); })[0].secs[0]); } catch (err) { /* fine */ }
    });
    nav.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var i = TABS.findIndex(function (x) { return x.id === cur; });
      var n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      showTab(n.id); nav.querySelector('[data-tab="' + n.id + '"]').focus();
    });
    // in-page links (#funding, #check…) switch to the view that holds them
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href").slice(1).split("=")[0];
      var t = tabOf(id);
      if (!t) return;
      e.preventDefault();
      showTab(t.id, { scroll: true, force: true });
      try { history.replaceState(null, "", "#" + id); } catch (err) { /* fine */ }
    });
    window.addEventListener("resize", moveInk);
    // typed / shared links and the back button
    window.addEventListener("hashchange", function () {
      var id = location.hash.slice(1).split("=")[0], t = tabOf(id);
      if (t && t.id !== cur) showTab(t.id, { scroll: true, force: true });
    });
    var h = location.hash.slice(1).split("=")[0];
    var start = tabOf(h) || TABS.filter(function (x) { return x.id === h; })[0];
    showTab(start ? start.id : TABS[0].id);
    if (start && h !== "check") showTab(start.id, { scroll: true, force: true, instant: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInk);
  }

  function init() {
    mountTabs();
    showLaunchCount();
    hero();
    roadmap();
    initPoll();
    if (T()) {
      var rev = document.querySelector("#funding .ax-rev");
      if (rev) { T().mountRevenue(rev.querySelector("[data-rev-list]")); T().mountFlow(rev); }
      T().subscribe(paintStats);
    }
    var form = $("rw-check-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      check($("rw-addr").value.trim());
    });
    var mineBtn = $("rw-usemine");
    if (mineBtn) mineBtn.addEventListener("click", useMine);
    var m = /^#check=(0x[0-9a-fA-F]{40})$/.exec(location.hash);
    if (m) {
      $("rw-addr").value = m[1];
      check(m[1]);
      var sec = $("check");
      if (sec) sec.scrollIntoView();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
;
/* ---- reward-engine.js ---- */
/* global CONFIG */
// reward-engine.js — the Reward page's burn engine: the burn meter (hero), the engine flow (live paths
// run today, dashed ones are being built), the live burn feed and "burned by source", the $ARCIRCLE and
// $ARCIA cards, milestones, and a wallet's own burn card (a share image). Numbers come from
// arc-token.js (/api/social?token=arcircle: burned.list / bySource / n) and /api/social?coin=arcia.
// When the server can't answer, the last reading this browser saw is shown with its time.
(function () {
  "use strict";
  if (!document.getElementById("rw-meter")) return;
  const $ = (id) => document.getElementById(id);
  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => window.arcToken;
  const SUPPLY = 1e9;
  const EXPLORER = "https://arc.etherscan.io";
  const MILESTONES = [15, 20, 25, 30, 40, 50, 60, 75, 90];
  const KIND = {
    vote: { name: "Burn-to-vote", acc: "#39ff88" },
    mine: { name: "Builder Mine", acc: "#ffc861" },
    scanner: { name: "Token Scanner", acc: "#4d9fff" },
    secret: { name: "ARCIA's secret file", acc: "#ff8fc7" },
    desk: { name: "ARCIA DESK", acc: "#b58bff" },
    buyback: { name: "Buyback", acc: "#35d8d0" },
    team: { name: "Team & treasury", acc: "#dfe8f1" },
    wallet: { name: "Direct burn", acc: "#ff8a4c" },
    pending: { name: "Being labeled", acc: "#6b7785" },
  };
  const kindOf = (k) => KIND[k] || KIND.pending;
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toLocaleString("en-US"));
  const full = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));
  const usd = (n) => (T() ? T().fmt.usd(n) : "$" + Number(n || 0).toFixed(2));
  const price = (n) => (n == null ? "—" : T() && T().fmt.price ? T().fmt.price(n) : "$" + Number(n).toPrecision(3));
  const ago = (ts) => (T() && T().fmt.ago ? T().fmt.ago(ts) : "");
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const countTo = (el, v, fmt) => { if (!el || v == null || !isFinite(v)) return; if (!reduce && T() && T().countTo) T().countTo(el, v, fmt); else el.textContent = fmt(v); };

  // ================= the meter =================
  let lastPct = null;
  function paintMeter(b, px, stale) {
    const m = $("rw-meter");
    const pct = b.pct, tok = b.tokens;
    const set = (k, v, fmt) => { const el = q(`[data-rb="${k}"]`, m); if (el) countTo(el, v, fmt); };
    set("pct", pct, (v) => v.toFixed(2) + "%");
    set("tok", tok, (v) => num(v));
    if (px) set("usd", tok * px, (v) => usd(v)); else q('[data-rb="usd"]', m).textContent = "—";
    if (b.n != null) set("n", b.n, (v) => Math.round(v).toLocaleString("en-US"));
    const fill = q('[data-rb="fill"]', m);
    requestAnimationFrame(() => { fill.style.width = Math.min(100, pct) + "%"; });
    const next = MILESTONES.find((x) => x > pct);
    const ms = q('[data-rb="ms"]', m);
    if (next) {
      ms.style.left = next + "%"; ms.hidden = false; ms.setAttribute("data-label", next + "%");
      q('[data-rb="next"]', m).textContent = tr("Next milestone") + " " + next + "% · " + num(((next - pct) / 100) * SUPPLY) + " $ARCIRCLE " + tr("to go");
    } else { ms.hidden = true; q('[data-rb="next"]', m).textContent = ""; }
    const bl = q('[data-rb="bar-label"]', m);
    if (bl) bl.setAttribute("aria-label", pct.toFixed(2) + "% of the 1,000,000,000 $ARCIRCLE supply burned");
    const inline = q('[data-rb="pct-inline"]');
    if (inline) inline.textContent = pct.toFixed(2) + "%";
    const st = q('[data-rb="stale"]', m);
    st.hidden = !stale;
    if (stale) st.textContent = tr("Showing the last reading this browser saw") + " (" + new Date(stale).toLocaleString() + "). " + tr("Live numbers return when Arc data catches up.");
    // a milestone crossed since this browser last looked: one celebration
    const seen = ls.get("rw-ms-seen");
    const crossed = MILESTONES.filter((x) => x <= pct && (seen == null || x > seen)).pop();
    if (crossed && seen != null) celebrate(crossed);
    if (seen == null || pct > seen) ls.set("rw-ms-seen", Math.floor(pct));
    if (lastPct != null && pct > lastPct) { m.classList.remove("rw-bump"); void m.offsetWidth; m.classList.add("rw-bump"); }
    lastPct = pct;
  }
  function celebrate(ms) {
    const m = $("rw-meter");
    const tag = document.createElement("div");
    tag.className = "rw-ms-hit";
    tag.textContent = ms + "% " + tr("burned — milestone reached");
    m.appendChild(tag);
    if (!reduce) embers(m, 36);
    setTimeout(() => tag.remove(), 6000);
  }
  function embers(host, n) {
    const box = document.createElement("div");
    box.className = "rw-embers"; box.setAttribute("aria-hidden", "true");
    for (let i = 0; i < n; i++) {
      const e = document.createElement("i");
      e.style.left = Math.random() * 100 + "%";
      e.style.animationDelay = Math.random() * 0.6 + "s";
      e.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
      box.appendChild(e);
    }
    host.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }

  // ================= feed + sources =================
  const seenTx = new Set();
  let firstFeed = true, sayAt = 0;
  function paintFeed(list, at) {
    const ol = $("rw-feed");
    if (!list || !list.length) { ol.innerHTML = `<li class="rw-feed-empty">${esc(tr("No burns yet."))}</li>`; return; }
    const fresh = firstFeed ? [] : list.filter((x) => !seenTx.has(x.tx));
    ol.innerHTML = list.slice(0, 18).map((x) => {
      const k = kindOf(x.kind);
      const isNew = fresh.some((f) => f.tx === x.tx);
      return `<li class="rw-burn${isNew ? " rw-new" : ""}" style="--acc:${k.acc}">
        <span class="rw-burn-k"><i></i>${esc(tr(k.name))}</span>
        <b class="rw-burn-n" data-no-i18n>${esc(full(x.tokens))} <small>$ARCIRCLE</small></b>
        <span class="rw-burn-m" data-no-i18n>${esc(short(x.from))} · ${esc(ago(x.ts))}</span>
        <a class="rw-burn-tx" href="${EXPLORER}/tx/${esc(x.tx)}" target="_blank" rel="noopener" aria-label="${esc(tr("View transaction"))}">↗</a>
      </li>`;
    }).join("");
    list.forEach((x) => seenTx.add(x.tx));
    const fa = q('[data-rb="feed-at"]');
    if (fa) fa.textContent = at ? tr("updated") + " " + new Date(at).toLocaleTimeString() : "";
    if (fresh.length && Date.now() - sayAt > 20000) {
      sayAt = Date.now();
      const tot = fresh.reduce((s, x) => s + (x.tokens || 0), 0);
      arciaSay(tot);
      if (!reduce) embers($("rw-meter"), Math.min(24, 6 + fresh.length * 4));
    }
    firstFeed = false;
  }
  function arciaSay(tokens) {
    const wrap = q(".rw-feed-wrap");
    if (!wrap) return;
    let b = q(".rw-say", wrap);
    if (!b) { b = document.createElement("div"); b.className = "rw-say"; b.setAttribute("role", "status"); wrap.insertBefore(b, $("rw-feed")); }
    const lines = ["Another {n} $ARCIRCLE gone forever~ 💙💚", "{n} $ARCIRCLE just burned! ✨", "Burn engine says hi~ {n} $ARCIRCLE burned 🔥"];
    b.innerHTML = `<img src="images/arcia-avatar-96.jpg" alt="" width="28" height="28"><span data-no-i18n>${esc(tr(lines[Math.floor(Math.random() * lines.length)]).replace("{n}", full(tokens)))}</span>`;
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
    clearTimeout(b.__t); b.__t = setTimeout(() => b.classList.remove("on"), 6000);
  }
  function paintSources(by) {
    const ul = $("rw-srcbars");
    const rows = Object.entries(by || {}).filter(([, o]) => o && o.tokens > 0).sort((a, b) => b[1].tokens - a[1].tokens);
    if (!rows.length) { ul.innerHTML = `<li class="rw-feed-empty">${esc(tr("No burns yet."))}</li>`; return; }
    // two groups, each scaled to its own largest source (the team's early burns would flatten every utility bar);
    // the % stays each source's share of everything burned
    const tot = rows.reduce((s, [, o]) => s + o.tokens, 0);
    const TEAMISH = ["team", "buyback"];
    const groups = [["From utilities and the community", rows.filter(([k]) => !TEAMISH.includes(k))], ["From the team", rows.filter(([k]) => TEAMISH.includes(k))]].filter(([, r]) => r.length);
    ul.innerHTML = groups.map(([title, rs]) => {
      const max = rs[0][1].tokens;
      return `<li class="rw-sb-group">${esc(tr(title))}</li>` + rs.map(([k, o]) => {
        const K = kindOf(k), w = Math.max(2, (o.tokens / max) * 100);
        return `<li style="--acc:${K.acc}" data-kind="${esc(k)}">
        <div class="rw-sb-top"><span>${esc(tr(K.name))}</span><b data-no-i18n>${esc(num(o.tokens))} <small>· ${((o.tokens / tot) * 100).toFixed(o.tokens / tot < 0.01 ? 2 : 1)}%</small></b></div>
        <div class="rw-sb-bar"><i style="--w:${w.toFixed(1)}%"></i></div>
        <small class="rw-sb-n" data-no-i18n>${o.n.toLocaleString("en-US")} ${esc(tr(o.n === 1 ? "burn" : "burns"))}</small>
      </li>`;
      }).join("");
    }).join("");
    // bars grow when they're first seen
    const go = () => ul.classList.add("in");
    if (T() && T().onVisible) T().onVisible(ul, go); else go();
    // live sources in the engine light up with their totals
    qa(".rw-src[data-live]").forEach((el) => {
      const o = by[el.getAttribute("data-src")];
      let t = q(".rw-src-n", el);
      if (!t) { t = document.createElement("em"); t.className = "rw-src-n"; t.setAttribute("data-no-i18n", ""); el.appendChild(t); }
      t.textContent = o && o.tokens > 0 ? num(o.tokens) + " " + tr("burned") : "";
    });
  }

  // ================= coins =================
  function paintArc(d) {
    const set = (k, v) => { const el = q(`[data-rc="${k}"]`); if (el) el.textContent = v; };
    if (d.burned) set("arc-burned", num(d.burned.tokens) + " · " + d.burned.pct.toFixed(2) + "%");
    set("arc-price", price(d.price));
    set("arc-mcap", d.mcap != null ? usd(d.mcap) : "—");
  }
  function loadArcia() {
    if (document.hidden) return;
    fetch("/api/social?coin=arcia").then((r) => (r.ok ? r.json() : null)).then((a) => {
      if (!a || a.error) return;
      const set = (k, v) => { const el = q(`[data-rc="${k}"]`); if (el) el.textContent = v; };
      set("arcia-burned", a.burned != null ? num(a.burned) + (a.burnedPct != null ? " · " + a.burnedPct.toFixed(2) + "%" : "") : "—");
      set("arcia-price", price(a.price));
      set("arcia-mcap", a.mcap != null ? usd(a.mcap) : "—");
    }).catch(() => {});
  }

  // ================= the engine flow (desktop: an SVG over the three columns) =================
  function drawFlow() {
    const box = $("rw-flow"), svg = q(".rw-flow-svg", box);
    if (!box || !svg) return;
    const wide = box.clientWidth >= 880;
    svg.style.display = wide ? "" : "none";
    if (!wide) return;
    const r0 = box.getBoundingClientRect();
    const rel = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - r0.left, r: r.right - r0.left, t: r.top - r0.top, b: r.bottom - r0.top, cy: (r.top + r.bottom) / 2 - r0.top }; };
    const contract = rel(q('[data-node="contract"]', box)), burn = rel(q('[data-node="burn"]', box)), rew = rel(q('[data-node="rewards"]', box));
    const curve = (x1, y1, x2, y2) => { const mx = (x1 + x2) / 2; return `M${x1.toFixed(1)},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`; };
    let paths = "";
    qa(".rw-src", box).forEach((el) => {
      const s = rel(el), live = el.hasAttribute("data-live");
      if (live) {
        // live utilities burn straight to 0x…dEaD: a fan of curves into the burn node (behind the contract box)
        const k = qa(".rw-src[data-live]", box).indexOf(el), n = qa(".rw-src[data-live]", box).length;
        const ty = burn.t + 18 + ((burn.b - burn.t - 36) * (k + 0.5)) / n;
        paths += `<path class="rw-p rw-p-live" data-src="${el.getAttribute("data-src")}" d="${curve(s.r, s.cy, burn.l, ty)}"/>`;
      } else {
        paths += `<path class="rw-p rw-p-plan" data-src="${el.getAttribute("data-src")}" d="${curve(s.r, s.cy, contract.l, contract.cy)}"/>`;
      }
    });
    paths += `<path class="rw-p rw-p-plan rw-p-out" d="${curve(contract.r, contract.cy - 10, burn.l, burn.cy)}"/>`;
    paths += `<path class="rw-p rw-p-plan rw-p-out" d="${curve(contract.r, contract.cy + 10, rew.l, rew.cy)}"/>`;
    svg.setAttribute("viewBox", `0 0 ${box.clientWidth} ${box.clientHeight}`);
    svg.innerHTML = paths;
  }
  function hoverFlow() {
    const box = $("rw-flow");
    box.addEventListener("mouseover", (e) => {
      const s = e.target.closest && e.target.closest(".rw-src");
      box.classList.toggle("rw-focus", !!s);
      qa(".rw-p", box).forEach((p) => p.classList.toggle("on", !!s && p.getAttribute("data-src") === s.getAttribute("data-src")));
      qa(".rw-src", box).forEach((x) => x.classList.toggle("on", x === s));
    });
    box.addEventListener("mouseleave", () => { box.classList.remove("rw-focus"); qa(".rw-p.on, .rw-src.on", box).forEach((x) => x.classList.remove("on")); });
  }

  // ================= a wallet's own burns + its share card =================
  let walletBurn = null;
  document.addEventListener("reward:wallet", (e) => {
    const ws = e.detail && e.detail.wallet, addr = e.detail && e.detail.address;
    const n = $("rw-wburn"), sub = $("rw-wburn-sub"), btn = $("rw-wburn-share");
    if (!n) return;
    const b = ws && ws.burned;
    if (!b) { n.textContent = "—"; sub.textContent = tr("Couldn't read burns right now"); btn.hidden = true; return; }
    n.textContent = full(b.tokens) + " $ARCIRCLE";
    const parts = Object.entries(b.bySource || {}).sort((x, y) => y[1].tokens - x[1].tokens).map(([k, o]) => tr(kindOf(k).name) + " " + num(o.tokens));
    sub.textContent = b.tokens > 0 ? parts.join(" · ") : tr("No $ARCIRCLE burned from this wallet yet");
    btn.hidden = !(b.tokens > 0);
    walletBurn = { addr, b };
  });
  function card() {
    if (!walletBurn) return;
    const { addr, b } = walletBurn;
    const c = document.createElement("canvas");
    c.width = 1200; c.height = 630;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 1200, 630);
    bg.addColorStop(0, "#050910"); bg.addColorStop(1, "#0b0f16");
    g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    const glow = g.createRadialGradient(980, 520, 20, 980, 520, 520);
    glow.addColorStop(0, "rgba(255,138,76,.45)"); glow.addColorStop(1, "rgba(255,138,76,0)");
    g.fillStyle = glow; g.fillRect(0, 0, 1200, 630);
    const glow2 = g.createRadialGradient(120, 60, 10, 120, 60, 520);
    glow2.addColorStop(0, "rgba(63,155,255,.28)"); glow2.addColorStop(1, "rgba(63,155,255,0)");
    g.fillStyle = glow2; g.fillRect(0, 0, 1200, 630);
    const font = (w, px) => `${w} ${px}px Sora, Inter, system-ui, sans-serif`;
    g.fillStyle = "#eef3f7"; g.font = font(800, 22); g.fillText("ARCIRCLE PAD · BURN ENGINE", 72, 92);
    g.fillStyle = "rgba(222,233,244,.66)"; g.font = font(600, 30); g.fillText("I burned", 72, 196);
    const grad = g.createLinearGradient(72, 0, 900, 0);
    grad.addColorStop(0, "#ffc861"); grad.addColorStop(1, "#ff6a3d");
    g.fillStyle = grad; g.font = font(800, 104); g.fillText(full(b.tokens), 72, 306);
    g.fillStyle = "#eef3f7"; g.font = font(800, 44); g.fillText("$ARCIRCLE", 76, 368);
    g.font = font(600, 24); g.fillStyle = "rgba(222,233,244,.72)";
    const rows = Object.entries(b.bySource || {}).sort((x, y) => y[1].tokens - x[1].tokens).slice(0, 4);
    rows.forEach(([k, o], i) => { g.fillStyle = kindOf(k).acc; g.fillRect(76, 420 + i * 38, 12, 12); g.fillStyle = "rgba(222,233,244,.8)"; g.fillText(kindOf(k).name + " · " + full(o.tokens), 100, 432 + i * 38); });
    g.font = font(500, 22); g.fillStyle = "rgba(222,233,244,.55)";
    g.fillText(short(addr) + " · sent to 0x…dEaD, gone forever", 72, 590);
    g.textAlign = "right"; g.fillStyle = "#eef3f7"; g.font = font(700, 24); g.fillText("arcircle.app/reward", 1128, 590);
    // a small flame
    const fx = 1000, fy = 300;
    [["#ff6a3d", 120], ["#ffb35c", 82], ["#fff1c9", 42]].forEach(([col, s]) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo(fx, fy - s * 1.25); g.bezierCurveTo(fx + s * 0.9, fy - s * 0.3, fx + s * 0.8, fy + s * 0.75, fx, fy + s * 0.8);
      g.bezierCurveTo(fx - s * 0.8, fy + s * 0.75, fx - s * 0.9, fy - s * 0.3, fx, fy - s * 1.25); g.fill();
    });
    openCard(c, b);
  }
  function openCard(c, b) {
    let dlg = $("rw-card-dlg");
    if (!dlg) {
      dlg = document.createElement("div");
      dlg.id = "rw-card-dlg"; dlg.className = "rw-card-dlg"; dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-label", tr("Your burn card"));
      dlg.innerHTML = `<div class="rw-card-box"><button type="button" class="rw-card-x" aria-label="${esc(tr("Close"))}">×</button><img alt=""><div class="rw-card-acts"><a class="ax-btn ax-btn-grad" data-a="save" download="arcircle-burn-card.png">${esc(tr("Save image"))}</a><a class="ax-btn ax-btn-ghost" data-a="x" target="_blank" rel="noopener">${esc(tr("Post on X"))}</a></div><p class="rw-mini">${esc(tr("Save the image, then attach it to your post."))}</p></div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest(".rw-card-x")) dlg.hidden = true; });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") dlg.hidden = true; });
    }
    const url = c.toDataURL("image/png");
    q("img", dlg).src = url;
    q('[data-a="save"]', dlg).href = url;
    const text = `I've burned ${full(b.tokens)} $ARCIRCLE on ARCIRCLE PAD, sent to 0x…dEaD for good 🔥\n\nBuilding the burn engine on Arc ♾ @ARCIRCLEonArc\n\narcircle.app/reward`;
    q('[data-a="x"]', dlg).href = "https://x.com/intent/tweet?text=" + encodeURIComponent(text);
    dlg.hidden = false;
    q(".rw-card-x", dlg).focus();
  }

  // ================= wiring =================
  function onStats(d) {
    let b = d && d.burned, px = d && d.price, stale = 0;
    const saved = ls.get("rw-burn-last");
    if (b && b.pct != null) ls.set("rw-burn-last", { at: Date.now(), burned: b, price: px });
    else if (saved && saved.burned) { b = saved.burned; px = saved.price; stale = saved.at; }
    if (!b || b.pct == null) return;
    paintMeter(b, px, stale);
    paintFeed(b.list, stale || Date.now());
    if (b.bySource) paintSources(b.bySource);
    paintArc({ burned: b, price: px, mcap: px != null ? px * SUPPLY : null });
  }
  function init() {
    // the last reading first, so the page is never empty while Arc answers
    const saved = ls.get("rw-burn-last");
    if (saved && saved.burned) { paintMeter(saved.burned, saved.price, 0); paintFeed(saved.burned.list, saved.at); if (saved.burned.bySource) paintSources(saved.burned.bySource); }
    if (T()) T().subscribe(onStats);
    loadArcia(); setInterval(loadArcia, 60000);
    drawFlow(); hoverFlow();
    let rt = 0;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawFlow, 120); });
    document.addEventListener("reward:tab", (e) => { if (e.detail && e.detail.tab === "engine") requestAnimationFrame(drawFlow); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawFlow);
    document.addEventListener("click", (e) => {
      const cp = e.target.closest && e.target.closest(".rw-copy[data-copy]");
      if (cp) {
        const done = () => { const o = cp.textContent; cp.textContent = tr("Copied"); setTimeout(() => { cp.textContent = o; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cp.getAttribute("data-copy")).then(done, () => {});
        return;
      }
      if (e.target.closest && e.target.closest("#rw-wburn-share")) card();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
;
/* ---- arc-motion.js ---- */
/* global ethers, ACT, APC, state, readProvider, ERC20_ABI, CONFIG, actPaint, apcRenderChart, ac2RenderChart, renderHeader */
// arc-motion.js — the finishing layer on ArcPad / CirclePad / Reward:
//   • numbers count up to their new value (home stats)
//   • cards and sections ease in as they scroll into view
//   • price charts draw themselves the first time a coin opens
//   • a rocket for the launch: idles while the wallet confirms, lifts off
//     when the coin is live
//   • dock icons bounce on tap
//   • richer wallet menu: USDC (gas) and $ARCIRCLE balances, copy feedback,
//     Portfolio link, "add $ARCIRCLE to wallet"
// Everything respects prefers-reduced-motion.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) document.documentElement.classList.add("rm");
  const usd = (n) => {
    if (window.arcFmt) return window.arcFmt.usd(n);
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    if (n >= 1) return "$" + n.toFixed(2);
    return n === 0 ? "$0" : "$" + n.toPrecision(2);
  };

  // ================= count-up =================
  function countUp(el, to, fmt = (v) => String(Math.round(v)), ms = 900) {
    if (!el) return;
    const from = el.__cu != null ? el.__cu : 0;
    el.__cu = to;
    const put = (v) => { el.__last = fmt(v); el.textContent = el.__last; };
    if (reduce || !isFinite(from) || from === to) { put(to); return; }
    const t0 = performance.now();
    cancelAnimationFrame(el.__raf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      put(from + (to - from) * e);
      if (k < 1) el.__raf = requestAnimationFrame(step);
    };
    el.__raf = requestAnimationFrame(step);
  }
  window.arcCountUp = countUp;
  // Launch count: arcpad.js writes the plain number — animate from 0 to it.
  const cnt = $("ap-stat-count");
  if (cnt) new MutationObserver(() => {
    if (cnt.textContent === cnt.__last) return; // our own animation frames
    const n = Number(cnt.textContent.replace(/[^\d.]/g, ""));
    if (cnt.textContent.trim() && isFinite(n) && /^\d+$/.test(cnt.textContent.trim())) countUp(cnt, n);
  }).observe(cnt, { childList: true, characterData: true, subtree: true });
  // 24h volume across all ArcPad pools, from the activity scan.
  const vol = $("ap-stat-vol");
  if (vol && typeof actPaint === "function") {
    const orig = actPaint;
    // eslint-disable-next-line no-global-assign
    actPaint = function () {
      orig();
      try {
        if (typeof ACT !== "undefined" && ACT.hi != null) {
          let v = 0; ACT.stats.forEach((s) => { v += s.vol || 0; });
          countUp(vol, v, usd);
        }
      } catch (e) { console.warn(e); }
    };
  }

  // ================= scroll reveal =================
  const REVEAL = [".bp-card", ".ac2-card:not(.ac2-swap)", ".pf-launch", ".bp-mini-stat", ".ap-stat", ".ax-section",
    "#ap-explore-grid .ap-launch-card", ".bp-mech-card", ".apc-safety", ".ac2-buybacks", ".cr-table", ".pf-summary"].join(",");
  const seen = new WeakSet();
  const io = !reduce && "IntersectionObserver" in window ? new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.classList.contains("rv") && !c.classList.contains("rv-in")) : [];
      el.style.transitionDelay = `${Math.min(sib.indexOf(el), 6) * 55}ms`;
      el.classList.add("rv-in");
      io.unobserve(el);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }) : null;
  function scan(root) {
    if (!io) return;
    const els = root.matches && root.matches(REVEAL) ? [root] : [];
    if (root.querySelectorAll) els.push(...root.querySelectorAll(REVEAL));
    for (const el of els) {
      if (seen.has(el) || el.closest(".msheet")) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue; // hidden panel — handled when shown
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.96 && r.bottom > 0) continue; // already on screen: leave it be
      el.classList.add("rv");
      io.observe(el);
    }
  }
  if (io) {
    const kick = () => scan(document.body);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", kick); else kick();
    let q = null;
    new MutationObserver((muts) => {
      if (q) return;
      q = requestAnimationFrame(() => { q = null; muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); })); });
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("arcpad:tab", () => setTimeout(kick, 30));
  }

  // ================= chart draw-in (first render per coin) =================
  function drawOnce(boxId, key) {
    const box = $(boxId);
    const svg = box && box.querySelector("svg");
    if (!svg || reduce) return;
    // The chart re-renders a few times while a coin loads; keep one continuous
    // draw-in across those re-renders by offsetting the new SVG's animation.
    if (box.__drawn !== key) { box.__drawn = key; box.__drawAt = performance.now(); }
    const elapsed = performance.now() - box.__drawAt;
    if (elapsed > 1500) return;
    svg.style.setProperty("--cd", `${-elapsed}ms`);
    svg.classList.add("chart-draw");
  }
  if (typeof apcRenderChart === "function") {
    const orig = apcRenderChart;
    // eslint-disable-next-line no-global-assign
    apcRenderChart = function () { orig.apply(this, arguments); try { if (typeof APC !== "undefined" && APC.trades && APC.trades.length) drawOnce("apc-chart", APC.token); } catch (e) { /* cosmetic */ } };
  }
  if (typeof ac2RenderChart === "function") {
    const orig = ac2RenderChart;
    // eslint-disable-next-line no-global-assign
    ac2RenderChart = function () { orig.apply(this, arguments); try { drawOnce("ac2-chart", "arcircle"); } catch (e) { /* cosmetic */ } };
  }

  // ================= launch rocket =================
  const ROCKET = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="rkG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4d9fff"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>'
    + '<path class="rk-flame" d="M26 46c0 7 6 14 6 14s6-7 6-14z"/><path d="M32 4c9 6 13 16 13 27l-5 11H24l-5-11C19 20 23 10 32 4z" fill="url(#rkG)"/>'
    + '<circle cx="32" cy="24" r="5" fill="#050805" stroke="#eaf2e6" stroke-width="2"/><path d="M19 31l-7 9 9 1zM45 31l7 9-9 1z" fill="#35d8d0"/></svg>';
  const ls = $("ap-launch-status");
  if (ls) {
    let idle = null;
    new MutationObserver(() => {
      const pend = ls.querySelector(".status.pending");
      const ok = ls.querySelector(".status.success");
      const launching = pend && /Confirm the launch|Launching/.test(pend.textContent);
      if (launching && !pend.querySelector(".ap-rocket-idle")) {
        const r = document.createElement("span");
        r.className = "ap-rocket-idle"; r.innerHTML = ROCKET;
        pend.insertBefore(r, pend.firstChild);
        idle = r;
      }
      if (ok && !ok.__flew) {
        ok.__flew = true;
        const btn = $("ap-launch-submit");
        const rect = (idle && idle.isConnected ? idle : btn || ok).getBoundingClientRect();
        if (!reduce) {
          const f = document.createElement("div");
          f.className = "ap-rocket-fly"; f.innerHTML = ROCKET;
          f.style.left = `${rect.left + rect.width / 2 - 28}px`; f.style.top = `${rect.top - 10}px`;
          document.body.appendChild(f);
          setTimeout(() => f.remove(), 1700);
        }
        idle = null;
      }
    }).observe(ls, { childList: true, subtree: true });
  }

  // ================= dock bounce =================
  document.addEventListener("pointerdown", (e) => {
    const it = e.target.closest && e.target.closest(".ax-dock-item, .ax-quick a, .ax-quick button");
    if (!it || reduce) return;
    const ico = it.querySelector(".ax-dock-ico, span, svg") || it;
    ico.classList.remove("dock-bounce"); void ico.offsetWidth; ico.classList.add("dock-bounce");
  }, { passive: true });

  // ================= wallet menu =================
  const ARCIRCLE_TOKEN = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || ""; // "" while not live
  async function fillBalances(box) {
    if (!state.account || !box) return;
    const acct = state.account;
    try {
      const p = readProvider();
      const tok = ARCIRCLE_TOKEN ? new ethers.Contract(ARCIRCLE_TOKEN, ERC20_ABI, p) : null;
      const [nat, arc] = await Promise.all([p.getBalance(acct).catch(() => null), tok ? tok.balanceOf(acct).catch(() => null) : null]);
      if (state.account !== acct) return;
      const f = (v, d) => v == null ? "—" : Number(ethers.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 2 });
      box.querySelector("[data-wb=usdc]").textContent = f(nat, 18);
      const ab = box.querySelector("[data-wb=arc]");
      if (ab) ab.textContent = f(arc, 18);
    } catch { /* leave dashes */ }
  }
  function enhanceWallet() {
    const dd = $("wallet-dropdown");
    if (!dd || dd.__enh || !state.account) return;
    dd.__enh = true;
    const addr = dd.querySelector(".wallet-dropdown-address");
    const bal = document.createElement("div");
    bal.className = "wd-bal";
    bal.innerHTML = `<div><span>USDC <small>gas</small></span><b data-wb="usdc">…</b></div>` + (ARCIRCLE_TOKEN ? `<div><span>$ARCIRCLE</span><b data-wb="arc">…</b></div>` : "");
    if (addr) addr.insertAdjacentElement("afterend", bal);
    const copy = $("wallet-dropdown-copy");
    if (copy) copy.onclick = (e) => {
      e.stopPropagation();
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(state.account) : Promise.reject()).then(
        () => { copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1400); },
        () => { copy.textContent = "Copy failed"; });
    };
    const explorer = dd.querySelector('a.wallet-dropdown-item[href*="/address/"]');
    const frag = document.createDocumentFragment();
    if ($("bp-panel-portfolio")) {
      const pf = document.createElement("button");
      pf.type = "button"; pf.className = "wallet-dropdown-item"; pf.textContent = "Portfolio";
      pf.onclick = (e) => { e.stopPropagation(); dd.classList.remove("open"); if (window.arcpadShowTab) window.arcpadShowTab("portfolio"); };
      frag.appendChild(pf);
    }
    if (ARCIRCLE_TOKEN) {
      const add = document.createElement("button");
      add.type = "button"; add.className = "wallet-dropdown-item"; add.textContent = "Add $ARCIRCLE to wallet";
      add.onclick = async (e) => {
        e.stopPropagation();
        const params = { type: "ERC20", options: { address: ARCIRCLE_TOKEN, symbol: "ARCIRCLE", decimals: 18, image: "https://www.arcircle.app/images/arcircle-mark-sm.png" } };
        try {
          if (state.signer && state.signer.provider && state.signer.provider.send) await state.signer.provider.send("wallet_watchAsset", params);
          else if (window.ethereum) await window.ethereum.request({ method: "wallet_watchAsset", params });
          else throw new Error("no wallet");
          add.textContent = "Added — check your wallet";
        } catch { add.textContent = "Your wallet didn't accept it"; }
        setTimeout(() => { add.textContent = "Add $ARCIRCLE to wallet"; }, 2600);
      };
      frag.appendChild(add);
    }
    if (explorer) explorer.parentNode.insertBefore(frag, explorer); else dd.appendChild(frag);
    const pill = $("wallet-pill-btn");
    if (pill) pill.addEventListener("click", () => fillBalances(bal));
    fillBalances(bal);
  }
  if (typeof renderHeader === "function") {
    const orig = renderHeader;
    // eslint-disable-next-line no-global-assign
    renderHeader = function () { orig.apply(this, arguments); try { enhanceWallet(); } catch (e) { console.warn(e); } };
  }
  enhanceWallet();
})();
;
/* ---- arc-footer.js ---- */
/* global CONFIG */
// arc-footer.js — the information footer on ArcPad, CirclePad, $ARCIRCLE and
// Reward: products, resources, every live contract (copy + ArcScan), a live
// network status (latest Arc block and how fast the RPC answered), and the
// sound-effects switch. Also owns the site's feedback layer:
//   window.arcSound(kind)   — short synthesized sounds (off unless enabled)
//   window.arcHaptic(kind)  — vibration patterns per action
//   window.arcFeedback(kind) — both; kind = buy | sell | launch | milestone | tap
(function () {
  "use strict";
  var RPC = (typeof CONFIG !== "undefined" && CONFIG.RPC_URL) || "https://rpc.mainnet.arc.io";
  var EXPLORER = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";
  var SOUND_KEY = "arcircle.sound";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------- sound + haptics ----------------
  var ctx = null;
  function soundOn() { try { return localStorage.getItem(SOUND_KEY) === "on"; } catch (e) { return false; } }
  function tone(freq, start, dur, type, gain) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, ctx.currentTime + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
  }
  var SOUNDS = {
    buy: function () { tone(988, 0, 0.09, "triangle"); tone(1319, 0.07, 0.22, "triangle"); },
    sell: function () { tone(784, 0, 0.09, "triangle"); tone(587, 0.07, 0.22, "triangle"); },
    launch: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, i * 0.07, 0.28, "triangle", 0.1); }); },
    milestone: function () { tone(1047, 0, 0.12, "sine", 0.1); tone(1568, 0.1, 0.35, "sine", 0.1); },
    tap: function () { tone(1400, 0, 0.04, "sine", 0.05); },
  };
  window.arcSound = function (kind) {
    if (!soundOn() || !SOUNDS[kind]) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      SOUNDS[kind]();
    } catch (e) { /* no audio */ }
  };
  var HAPTICS = { buy: [18], sell: [10, 40, 10], launch: [30, 60, 30, 60, 90], milestone: [20, 40, 60], tap: [8] };
  window.arcHaptic = function (kind) {
    if (reduce || !navigator.vibrate || !HAPTICS[kind]) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // browsers refuse it before the first tap
    try { navigator.vibrate(HAPTICS[kind]); } catch (e) { /* not allowed */ }
  };
  window.arcFeedback = function (kind) { window.arcSound(kind); window.arcHaptic(kind); };

  // ---------------- footer ----------------
  var CONTRACTS = [
    ["ArcPad factory", "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E"],
    ["Swap router", "0xFCA8fD788d44Bb335B1451257366e06D67114785"],
    ["Fee hook", "0x484D416E73Eb44d276DDeF04cDBAdf2f4907c044"],
    // $ARCIRCLE comes from config-arc.js; "" (not live, relaunching) shows "Not live"
    ["$ARCIRCLE", (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || ""],
    ["CirclePad escrow", "0xC5998d7cE728FDd6f77217fdE775aAb90Ec61703"],
    ["CirclePad vote", "0x23c376615a58F059FC4bc83A38eB4aCdF8d39ff2"],
    ["CirclePad burn vote", "0x54121a7894d90a02eA973Ab45EEF424C2716EeB2"],
    ["Creator lock", "0x64F893947Fe2c4fe7058CFba899eA269CBa9F006"],
    ["LP lock", "0x674E7010Dab5cCb519e06df72b1D4c063952f45B"],
    ["Builder Mine", (typeof CONFIG !== "undefined" && CONFIG.BUILDER_MINE_ADDRESS) || ""],
  ];
  var short = function (a) { return a.slice(0, 6) + "…" + a.slice(-4); };
  function build() {
    var old = document.querySelector("footer.ah-footer");
    var dock = document.querySelector("nav.ax-dock");
    var f = document.createElement("footer");
    f.className = "axf";
    f.innerHTML =
      '<div class="axf-in">' +
        '<div class="axf-brand"><a href="/" class="axf-logo"><img src="/images/arcircle-mark-sm.png" alt="" width="40" height="28"><span>ARCIRCLE <em>PAD</em></span></a>' +
          '<p>Two launchpads and one core coin on Circle\'s Arc. Every number on this site is read live from the chain.</p>' +
          '<div class="axf-net" id="axf-net"><span class="axf-dot"></span><span class="axf-net-txt">Arc mainnet · checking…</span></div></div>' +
        '<div class="axf-col"><h4>Products</h4><a href="/arc">ArcPad</a><a href="/circle">CirclePad</a><a href="/arcircle">$ARCIRCLE</a><a href="/relay">Relay Launch</a><a href="/reward">Reward</a><a href="/me">My ARCIRCLE</a></div>' +
        '<div class="axf-col"><h4>Resources</h4><a href="/whitepaper">Whitepaper</a><a href="/whitepaper/ko" lang="ko">백서 (한국어)</a><a href="/arc#docs">ArcPad docs</a><a href="/circle#docs">CirclePad docs</a><a href="/start">Get started</a><a href="/stats">Stats</a><a href="/roadmap">Roadmap</a><a href="/brand">Brand kit</a></div>' +
        '<div class="axf-col axf-contracts"><h4>Contracts</h4>' + CONTRACTS.map(function (c) {
          if (!c[1]) return '<div class="axf-ca"><span>' + c[0] + '</span><em class="axf-nl">Not live</em></div>';
          return '<div class="axf-ca"><span>' + c[0] + '</span><a href="' + EXPLORER + '/address/' + c[1] + '" target="_blank" rel="noopener" data-no-i18n>' + short(c[1]) + ' ↗</a>' +
            '<button type="button" class="axf-copy" data-copy-ca="' + c[1] + '" aria-label="Copy address">Copy</button></div>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="axf-bottom"><span>Nothing on this site is financial advice. Crypto assets can lose all of their value.</span>' +
        '<button type="button" class="axf-sound" id="axf-sound" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="axf-wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg><span></span></button></div>';
    if (old) old.replaceWith(f);
    else if (dock) dock.parentNode.insertBefore(f, dock);
    else document.body.appendChild(f);

    f.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-copy-ca]");
      if (!b) return;
      var done = function (t) { b.textContent = t; setTimeout(function () { b.textContent = "Copy"; }, 1400); };
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(b.getAttribute("data-copy-ca")) : Promise.reject()).then(function () { done("Copied"); }, function () { done("Copy failed"); });
    });
    var snd = f.querySelector("#axf-sound");
    var paint = function () {
      var on = soundOn();
      snd.setAttribute("aria-pressed", on ? "true" : "false");
      snd.classList.toggle("on", on);
      snd.querySelector("span").textContent = on ? "Sound on" : "Sound off";
    };
    snd.addEventListener("click", function () {
      try { localStorage.setItem(SOUND_KEY, soundOn() ? "off" : "on"); } catch (e) { /* storage blocked */ }
      paint();
      window.arcFeedback("tap");
    });
    paint();
    netStatus();
    setInterval(function () { if (!document.hidden) netStatus(); }, 30000);
  }

  // Latest block + round-trip time, straight from the RPC (no ethers needed).
  function netStatus() {
    var box = document.getElementById("axf-net");
    if (!box) return;
    var t0 = performance.now();
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var ms = Math.round(performance.now() - t0), n = parseInt(j.result, 16);
        if (!isFinite(n)) throw new Error("bad");
        box.className = "axf-net " + (ms < 800 ? "ok" : "slow");
        box.querySelector(".axf-net-txt").innerHTML = 'Arc mainnet · block <b data-no-i18n>#' + n.toLocaleString("en-US") + '</b> · ' + ms + ' ms';
      })
      .catch(function () { box.className = "axf-net bad"; box.querySelector(".axf-net-txt").textContent = "Arc RPC not reachable right now"; })
      .then(function () { clearTimeout(timer); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
;
/* ---- arcircle-hub.js ---- */
// arcircle-hub.js — shared behaviour for the ARCIRCLE hub pages (index.html
// and arcircle.html, plus the dock on ArcPad / CirclePad / Reward): the quick
// bar above the dock, copy-to-clipboard for the $ARCIRCLE contract address,
// and redirecting old #rewards links to the Reward page. No chain calls.
(function () {
  "use strict";

  // Invite links: ?ref=<wallet>. The first one a visitor arrives with is kept
  // for 30 days (this browser only) so a future referral program can credit
  // it; the parameter is then dropped from the address bar.
  (function captureRef() {
    try {
      var u = new URL(location.href);
      var ref = (u.searchParams.get("ref") || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(ref)) return;
      var KEY = "arcircle.ref.v1";
      var cur = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!cur || !cur.at || Date.now() - cur.at > 30 * 864e5) localStorage.setItem(KEY, JSON.stringify({ ref: ref.toLowerCase(), at: Date.now(), page: u.pathname }));
      u.searchParams.delete("ref");
      if (history.replaceState) history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash);
    } catch (e) { /* storage blocked or old browser */ }
  })();
  window.arcRef = function () {
    try { var c = JSON.parse(localStorage.getItem("arcircle.ref.v1") || "null"); return c && Date.now() - c.at < 30 * 864e5 ? c.ref : null; } catch (e) { return null; }
  };

  // ---- $ARCIRCLE: live or not ----
  // The contract lives in one place (config-arc.js → CONFIG.ARCIRCLE_TOKEN).
  // Until it's set, <html> gets .arc-notlive: anything marked .arc-live-only
  // stays hidden and .arc-nl-only ("Not live") shows — which is also what a
  // page looks like before any script runs. Once set, addresses and links
  // are filled in from the config:
  //   [data-arc-ca="full|short|curve-short"]  text
  //   [data-arc-href="scan|curve|buy"]         href
  //   .ax-copy[data-copy-arc]                  copies the contract
  (function arcircleState() {
    var C = typeof CONFIG !== "undefined" ? CONFIG : {};
    var tok = /^0x[0-9a-fA-F]{40}$/.test(C.ARCIRCLE_TOKEN || "") ? C.ARCIRCLE_TOKEN : "";
    var curve = /^0x[0-9a-fA-F]{40}$/.test(C.ARCIRCLE_CURVE || "") ? C.ARCIRCLE_CURVE : "";
    var pool = /^0x[0-9a-fA-F]{64}$/.test(C.ARCIRCLE_POOL_ID || "") ? C.ARCIRCLE_POOL_ID : "";
    var root = document.documentElement;
    root.classList.toggle("arc-live", !!tok);
    root.classList.toggle("arc-notlive", !tok);
    // how it trades: a Uniswap v4 pool (Argus) or a bonding curve
    root.classList.toggle("arc-pool", !!tok && !!pool && !curve);
    root.classList.toggle("arc-curve", !!tok && !!curve);
    window.arcircleToken = function () { return tok; };
    if (!tok) return;
    var ex = C.BLOCK_EXPLORER || "https://arc.etherscan.io";
    var sh = function (a) { return a.slice(0, 6) + "…" + a.slice(-4); };
    var fill = function () {
      document.querySelectorAll("[data-arc-ca]").forEach(function (el) {
        var k = el.getAttribute("data-arc-ca");
        el.textContent = k === "full" ? tok : k === "curve-short" ? (curve ? sh(curve) : "—") : k === "pool-short" ? (pool ? sh(pool) : "—") : sh(tok);
        if (k !== "curve-short") el.title = tok;
      });
      document.querySelectorAll("[data-arc-href]").forEach(function (el) {
        var k = el.getAttribute("data-arc-href");
        el.href = k === "scan" ? ex + "/token/" + tok : k === "curve" ? (curve ? ex + "/address/" + curve + "#code" : ex + "/token/" + tok)
          : k === "chart" ? (C.ARCIRCLE_CHART_URL || ex + "/token/" + tok) : (C.ARCIRCLE_BUY_URL || "/arc#arcircle");
      });
      document.querySelectorAll("[data-copy-arc]").forEach(function (el) { el.setAttribute("data-copy", tok); });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill); else fill();
  })();

  // Rewards used to be a "coming soon" popup; they now have their own page
  // (/reward). Old links — index.html#rewards, arcircle.html#rewards, any
  // leftover [data-reward] button — are sent there.
  function openReward() { location.href = "/reward"; }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); }
      catch (err) { reject(err); }
      document.body.removeChild(ta);
    });
  }

  function handleCopy(btn) {
    var original = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", original);
    copyText(btn.getAttribute("data-copy")).then(function () {
      // the label morphs into a check mark (style.css: .ax-copy.is-done)
      btn.innerHTML = '<svg class="ax-copy-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg><span>Copied</span>';
      btn.classList.add("is-done");
    }, function () {
      btn.textContent = "Copy failed";
    }).then(function () {
      setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove("is-done");
      }, 1600);
    });
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-reward]")) { e.preventDefault(); openReward(); return; }
    // Only this file's own .ax-copy buttons — arc-shared.js already handles
    // the .ac-copy[data-copy] buttons in the ArcPad/CirclePad Contracts tab.
    var copyBtn = t.closest(".ax-copy[data-copy]");
    if (copyBtn) handleCopy(copyBtn);
  });

  // ---- Quick bar: a slim second floating row just above the dock, the same
  // on every page (hub, ArcPad, CirclePad, Reward, $ARCIRCLE): Launch,
  // Explore, and the utilities button (infinity + plus) that opens the
  // utilities panel upwards. Launch / Explore go to ArcPad; on ArcPad itself
  // they switch tabs in place.
  var ICON_ROCKET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3 2 4.5 5.4 4.5 9 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.6 1.5-7 4.5-9z"/><circle cx="12" cy="10.5" r="2"/><path d="M8 15.5l-3 1 .8-3.3M16 15.5l3 1-.8-3.3"/></svg>';
  var ICON_GRID = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/></svg>';
  // A drawn lemniscate (not the emoji): gradient stroke with a light that
  // travels round the loop, and a small plus that turns into a close mark.
  var ICON_INFINITY = '<svg class="ax-inf" viewBox="0 0 40 20" aria-hidden="true">' +
    '<defs><linearGradient id="axInfGrad" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4d9fff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>' +
    '<path class="ax-inf-base" d="M20 10C16.6 5.4 13.8 3.2 10.4 3.2a6.8 6.8 0 0 0 0 13.6c3.4 0 6.2-2.2 9.6-6.8s6.2-6.8 9.6-6.8a6.8 6.8 0 0 1 0 13.6c-3.4 0-6.2-2.2-9.6-6.8z"/>' +
    '<path class="ax-inf-shine" pathLength="100" d="M20 10C16.6 5.4 13.8 3.2 10.4 3.2a6.8 6.8 0 0 0 0 13.6c3.4 0 6.2-2.2 9.6-6.8s6.2-6.8 9.6-6.8a6.8 6.8 0 0 1 0 13.6c-3.4 0-6.2-2.2-9.6-6.8z"/></svg>';
  var ICON_PLUS = '<svg class="ax-plus" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>';

  // The four utilities. A tile with an href is live; the others show "Soon"
  // until their page exists. Multisender says "Preview" until its contract
  // address is set in config-arc.js (MULTISEND_ADDRESS).
  var UTILS = [
    { id: "locker", name: "Locker", sub: "Lock any Arc token until a date you pick", status: "v2", acc: "#35d8d0", href: "/arc#locker",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><circle cx="12" cy="15.5" r="1.4"/></svg>' },
    { id: "scanner", name: "Token Scanner", sub: "Check any Arc token before you buy", status: "v3", acc: "#4d9fff", href: "/arc#scanner",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/><circle cx="11.5" cy="11.5" r="3"/><path d="M13.7 13.7l2.3 2.3"/></svg>' },
    { id: "multisender", name: "Multisender", sub: "Send a token to many wallets in one go", acc: "#39ff88", href: "/arc#multisend",
      status: typeof CONFIG !== "undefined" && /^0x[0-9a-fA-F]{40}$/.test(CONFIG.MULTISEND_ADDRESS || "") ? "v2" : "Preview",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="2.2"/><circle cx="18.5" cy="5.5" r="2"/><circle cx="18.5" cy="12" r="2"/><circle cx="18.5" cy="18.5" r="2"/><path d="M7.7 12h8.8M7.4 10.9l9.2-4.6M7.4 13.1l9.2 4.6"/></svg>' },
    { id: "bridge", name: "Bridge", sub: "Move USDC between Arc and 14 chains", status: "v2", acc: "#ffc861", href: "/arc#bridge",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5h18"/><path d="M4.5 15.5V19M19.5 15.5V19"/><path d="M4.5 15.5c2-5.3 4.7-8 7.5-8s5.5 2.7 7.5 8"/><path d="M8.5 15.5v-3.6M12 15.5V7.5M15.5 15.5v-3.6"/></svg>' },
  ];
  // Page 2: Snapshot, Liquidity, Relay Launch, then a placeholder until the next one is decided.
  var UTILS2 = [
    { id: "snapshot", name: "Snapshot", sub: "Every holder of a token at one moment", status: "v1", acc: "#b58bff", href: "/arc#snapshot",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><circle cx="12" cy="10.3" r="2.3"/><path d="M8.3 16.2c.8-1.9 2.1-2.8 3.7-2.8s2.9.9 3.7 2.8"/></svg>' },
    { id: "liquidity", name: "Liquidity", sub: "Pools, LP positions and LP locks for any token", status: "v1", acc: "#39d0ff", href: "/arc#liquidity",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c3.2 3.8 5.5 7 5.5 9.9a5.5 5.5 0 0 1-11 0c0-2.9 2.3-6.1 5.5-9.9z"/><path d="M9.3 14.2a2.8 2.8 0 0 0 2.7 2.4"/></svg>' },
  ];
  UTILS2.push({ id: "relay", name: "Relay Launch", sub: "CirclePad round → Argus coin, relayed to holders", status: "v1", acc: "#35d8d0", href: "/arc#relay",
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="2.6"/><circle cx="12" cy="12" r="2.6"/><circle cx="18.5" cy="12" r="2.6"/><path d="M8.1 12h1.3M14.6 12h1.3"/><path d="M4 6.5c2.5-2.3 13.5-2.3 16 0M4 17.5c2.5 2.3 13.5 2.3 16 0"/></svg>' });
  UTILS2.push({ id: "arcia", name: "ARCIA", sub: "Chat with the AI idol of $ARCIRCLE", status: "v1", acc: "#5b8cff", href: "/arc#arcia",
    ico: '<img class="ax-util-av" src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40">' });
  // Page 3: ARCIRCLE OMNI (preview until its contracts are deployed), ARCIA 402, Builder Mine, ARCIA DESK.
  // Page 4: four slots in development.
  // Four tiles a page, always — a fifth would make every page as tall as three rows.
  var omniLive = typeof CONFIG !== "undefined" && CONFIG.OMNI && /^0x[0-9a-fA-F]{40}$/.test(CONFIG.OMNI.ADAPTER || "");
  var UTILS3 = [
    { id: "omni", name: "ARCIRCLE OMNI", sub: "One $ARCIRCLE across Arc, Solana and Robinhood", status: omniLive ? "Live" : "Preview", acc: "#9b7bff", href: "/arc#omni",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c-1.7-2.3-3.1-3.4-4.8-3.4a3.4 3.4 0 0 0 0 6.8c1.7 0 3.1-1.1 4.8-3.4s3.1-3.4 4.8-3.4a3.4 3.4 0 0 1 0 6.8c-1.7 0-3.1-1.1-4.8-3.4z"/><circle cx="12" cy="3.5" r="1.3"/><circle cx="4" cy="20" r="1.3"/><circle cx="20" cy="20" r="1.3"/></svg>' },
    { id: "arcia402", name: "ARCIA 402", sub: "ARCIA earns and pays in USDC with x402 on Arc", status: "v1", acc: "#39ff88", href: "/arc#arcia402",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="5.5"/><path d="M9 9.3v5.4M10.7 10.2c-.4-.6-1-.9-1.7-.9-.9 0-1.6.5-1.6 1.2 0 1.5 3.4.9 3.4 2.4 0 .7-.8 1.2-1.7 1.2-.8 0-1.4-.3-1.8-.9"/><path d="M15.5 7.5a5.5 5.5 0 0 1 0 9M18 5.5a8.5 8.5 0 0 1 0 13"/></svg>' },
  ];
  UTILS3.push({ id: "mine", name: "Builder Mine", sub: "Open a mine for your token — builders dig it, the rest is burned", status: "v1", acc: "#ffc861", href: "/arc#mine",
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19.5 14.5 10"/><path d="M8.5 6.2c4-2.6 8.6-2.4 12 .6-3.3-.5-6.3.4-8.5 2.6"/><path d="M4 21h6M14.5 16.5l2 2M19 13l1.5 1.5"/></svg>' });
  UTILS3.push({ id: "desk", name: "ARCIA DESK", sub: "ARCIA trades new Argus launches live — every trade public", status: "Beta", acc: "#39ff88", href: "/arc#desk",
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5h16"/><path d="M6.5 16V11M10.5 16V7.5M14.5 16v-6M18.5 16V5"/><path d="M5 9.5l4.5-4 4 3 5.5-5"/></svg>' });
  var NEXT = [
    { id: "next-13", sub: "In development" },
    { id: "next-14", sub: "In development" },
    { id: "next-15", sub: "In development" },
    { id: "next-16", sub: "In development" },
  ];
  var ICON_SOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M6.7 17.3l2.1-2.1M15.2 8.8l2.1-2.1"/></svg>';

  function mountQuickBar() {
    var dock = document.querySelector("nav.ax-dock");
    if (!dock || document.querySelector("nav.ax-quick")) return;
    var bar = document.createElement("nav");
    bar.className = "ax-quick";
    bar.setAttribute("aria-label", "Quick actions");
    bar.innerHTML =
      '<a class="ax-quick-item ax-quick-launch" href="/arc#launch" data-arc-tab="launch"><span class="ax-quick-ico">' + ICON_ROCKET + '</span><span>Launch</span></a>' +
      '<a class="ax-quick-item" href="/arc#explore" data-arc-tab="explore"><span class="ax-quick-ico">' + ICON_GRID + '</span><span>Explore</span></a>' +
      '<button type="button" class="ax-quick-util" aria-haspopup="dialog" aria-expanded="false" aria-controls="ax-util" aria-label="Utilities" title="Utilities">' + ICON_INFINITY + '<span class="ax-plus-wrap">' + ICON_PLUS + "</span></button>";
    dock.parentNode.insertBefore(bar, dock);

    // Sit exactly one gap above the dock, whatever height it renders at, and
    // reserve exactly that much room at the bottom of the page (dock + bar +
    // gaps) so the last cards are never hidden behind them.
    // On a wide screen the two sit side by side in one row, centred as a pair
    // (html.ax-float-row), so they cover half the height.
    var root = document.documentElement, GAP = 12;
    var sync = function () {
      var d = dock.getBoundingClientRect(), q = bar.getBoundingClientRect();
      root.style.setProperty("--ax-dock-h", Math.round(d.height) + "px");
      var dockBottom = Math.max(0, window.innerHeight - d.bottom);
      var row = window.innerWidth >= 901 && q.width + GAP + d.width + 48 <= window.innerWidth;
      root.classList.toggle("ax-float-row", row);
      if (row) {
        root.style.setProperty("--ax-q-shift", -Math.round((GAP + d.width) / 2) + "px");
        root.style.setProperty("--ax-d-shift", Math.round((q.width + GAP) / 2) + "px");
        root.style.setProperty("--ax-q-lift", Math.round((d.height - q.height) / 2) + "px");
        root.style.setProperty("--ax-float-space", Math.round(dockBottom + Math.max(d.height, q.height) + 20) + "px");
      } else root.style.setProperty("--ax-float-space", Math.round(dockBottom + d.height + 10 + q.height + 20) + "px");
    };
    sync();
    if (window.ResizeObserver) { var ro = new ResizeObserver(sync); ro.observe(dock); ro.observe(bar); }
    window.addEventListener("resize", sync);

    // Out of the way while reading: hide on scroll down, back on scroll up
    // (and always shown near the top and at the very bottom of the page).
    var lastY = window.scrollY, acc = 0, ticking = false;
    var setHidden = function (h) { bar.classList.toggle("ax-quick-hidden", h); };
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY, dy = y - lastY;
        lastY = y;
        var atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
        var row = root.classList.contains("ax-float-row");
        // wide screens: the quick bar and the dock sit side by side and slide away together
        var hide = function (h) { if (row) { root.classList.toggle("ax-float-away", h); setHidden(false); } else { root.classList.remove("ax-float-away"); setHidden(h); } };
        if (y < 80 || atBottom || bar.classList.contains("ax-quick-pinned") || bar.classList.contains("util-open")) { acc = 0; hide(false); return; }
        acc = (acc > 0) === (dy > 0) ? acc + dy : dy; // distance travelled in the current direction
        if (acc > 24) hide(true);
        else if (acc < -16) hide(false);
      });
    }, { passive: true });
    document.addEventListener("arcpad:tab", function () { acc = 0; setHidden(false); root.classList.remove("ax-float-away"); });

    mountUtilities(bar);

    bar.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-arc-tab]");
      if (!a || typeof window.arcpadShowTab !== "function") return; // other pages: normal navigation
      e.preventDefault();
      window.arcpadShowTab(a.getAttribute("data-arc-tab"));
    });

    var mark = function (tab) {
      Array.prototype.forEach.call(bar.querySelectorAll("[data-arc-tab]"), function (a) {
        if (a.getAttribute("data-arc-tab") === tab) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    };
    document.addEventListener("arcpad:tab", function (e) { mark(e.detail && e.detail.tab); });
    var active = document.querySelector(".bp-panel.active");
    if (active && typeof window.arcpadShowTab === "function") mark(active.id.replace("bp-panel-", ""));
  }
  // ---- Utilities panel: opens upwards from the infinity button, on phones
  // and desktop alike. Escape, the scrim or the button close it.
  function mountUtilities(bar) {
    var btn = bar.querySelector(".ax-quick-util");
    if (!btn) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var scrim = document.createElement("div");
    scrim.className = "ax-util-scrim";
    scrim.hidden = true;
    var panel = document.createElement("div");
    panel.className = "ax-util";
    panel.id = "ax-util";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Utilities");
    panel.setAttribute("tabindex", "-1");
    panel.hidden = true;
    var tile = function (u, i) {
      var tag = u.href ? "a" : "div";
      return "<" + tag + ' class="ax-util-tile' + (u.soon ? " is-soon" : "") + (u.href ? "" : " is-off") + '" data-util="' + u.id + '" style="--acc:' + u.acc + ";--i:" + i + '"' +
        (u.href ? ' href="' + u.href + '"' : ' aria-disabled="true"') + ">" +
        '<span class="ax-util-ico">' + (u.ico || ICON_SOON) + "</span>" +
        '<span class="ax-util-txt"><strong>' + u.name + "</strong><small>" + u.sub + "</small></span>" +
        '<em class="ax-util-st">' + u.status + "</em></" + tag + ">";
    };
    var next = function (u, i) {
      return '<div class="ax-util-tile is-soon is-off is-next" data-util="' + u.id + '" style="--acc:#8c98a6;--i:' + (i % 4) + '" aria-disabled="true">' +
        '<span class="ax-util-ico ax-util-q" aria-hidden="true"><b>?</b></span>' +
        '<span class="ax-util-txt"><strong>Coming soon</strong><small>' + u.sub + "</small></span>" +
        '<em class="ax-util-st">Soon</em><i class="ax-util-no" aria-hidden="true">' + String(i + 1).padStart(2, "0") + "</i></div>";
    };
    panel.innerHTML =
      '<div class="ax-util-head"><span class="ax-util-mark">' + ICON_INFINITY + '</span><div><strong>Utilities</strong><small>Tools for everyone on Arc</small></div>' +
      '<button type="button" class="ax-util-x" aria-label="Close">' + ICON_PLUS + "</button></div>" +
      '<div class="ax-util-pages" aria-roledescription="carousel">' +
        '<div class="ax-util-track">' +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 1 of 4" data-page="0">' + UTILS.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 2 of 4" data-page="1">' + UTILS2.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 3 of 4" data-page="2">' + UTILS3.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 4 of 4" data-page="3">' + NEXT.map(function (u, i) { return next(u, i + UTILS.length + UTILS2.length + UTILS3.length); }).join("") + "</div>" +
        "</div></div>" +
      '<div class="ax-util-pager" role="tablist" aria-label="Pages">' +
        '<button type="button" role="tab" data-go-page="0" aria-selected="true" aria-label="Page 1">1</button>' +
        '<button type="button" role="tab" data-go-page="1" aria-selected="false" aria-label="Page 2">2</button>' +
        '<button type="button" role="tab" data-go-page="2" aria-selected="false" aria-label="Page 3">3</button>' +
        '<button type="button" role="tab" data-go-page="3" aria-selected="false" aria-label="Page 4">4</button>' +
      "</div>";
    document.body.appendChild(scrim);
    document.body.appendChild(panel);
    // Builder Mine's tile: $ARCIRCLE burned and builders digging, once the contract is live
    if (typeof CONFIG !== "undefined" && /^0x[0-9a-fA-F]{40}$/.test(CONFIG.BUILDER_MINE_ADDRESS || "") && window.fetch) {
      fetch("/api/mine?stats=1").then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
        var el = panel.querySelector('[data-util="mine"] small');
        if (!el || !s || !s.live || s.burned == null) return;
        var n = Number(BigInt(s.burned) / 1000000000000000000n);
        var c = n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n);
        el.textContent = c + " $ARCIRCLE burned · " + (s.digging || 0) + " digging now";
      }).catch(function () { /* keep the line */ });
    }

    // ---- two pages: the numbers below, a swipe / drag, arrow keys or a sideways trackpad scroll ----
    var track = panel.querySelector(".ax-util-track"), pages = [].slice.call(panel.querySelectorAll(".ax-util-grid"));
    var page = 0, dragX = null, dragDx = 0, dragT = 0, moved = false;
    function goPage(n, instant) {
      page = Math.max(0, Math.min(pages.length - 1, n));
      track.classList.toggle("instant", !!instant || reduce);
      track.style.transform = "translateX(" + (-100 * page) + "%)";
      pages.forEach(function (g, i) { if (i === page) g.removeAttribute("inert"); else g.setAttribute("inert", ""); g.classList.toggle("on", i === page); });
      panel.querySelectorAll("[data-go-page]").forEach(function (b) { b.setAttribute("aria-selected", String(Number(b.getAttribute("data-go-page")) === page)); });
      panel.classList.toggle("on-p2", page >= 1);
    }
    goPage(0, true);
    panel.querySelector(".ax-util-pager").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-go-page]");
      if (b) goPage(Number(b.getAttribute("data-go-page")));
    });
    var vp = panel.querySelector(".ax-util-pages");
    vp.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragX = e.clientX; dragDx = 0; dragT = Date.now(); moved = false;
    });
    window.addEventListener("pointermove", function (e) {
      if (dragX == null) return;
      dragDx = e.clientX - dragX;
      if (!moved && Math.abs(dragDx) > 6) { moved = true; track.classList.add("instant"); try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } }
      if (!moved) return;
      var edge = (page === 0 && dragDx > 0) || (page === pages.length - 1 && dragDx < 0);
      track.style.transform = "translateX(calc(" + (-100 * page) + "% + " + (edge ? dragDx / 3 : dragDx) + "px))";
    });
    var endDrag = function () {
      if (dragX == null) return;
      var dx = dragDx, fast = Math.abs(dx) / Math.max(1, Date.now() - dragT) > 0.4;
      dragX = null;
      if (!moved) return;
      var w = vp.clientWidth || 1;
      if ((Math.abs(dx) > w * 0.22 || (fast && Math.abs(dx) > 24)) && ((dx < 0 && page < pages.length - 1) || (dx > 0 && page > 0))) goPage(page + (dx < 0 ? 1 : -1));
      else goPage(page);
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    // a drag isn't a tap on the tile underneath
    vp.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    var wheelT = 0;
    vp.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) < 12 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (Date.now() - wheelT < 450) return;
      wheelT = Date.now();
      goPage(page + (e.deltaX > 0 ? 1 : -1));
    }, { passive: false });

    var open = false, closeT = 0;
    function place() {
      var r = bar.getBoundingClientRect();
      var w = Math.min(440, window.innerWidth - 24);
      var cx = r.left + r.width / 2;
      var left = Math.max(12, Math.min(window.innerWidth - w - 12, cx - w / 2));
      panel.style.width = w + "px";
      panel.style.left = left + "px";
      panel.style.bottom = Math.round(window.innerHeight - r.top + 10) + "px";
      // the panel grows out of the button
      var b = btn.getBoundingClientRect();
      panel.style.setProperty("--ox", Math.round(b.left + b.width / 2 - left) + "px");
    }
    function show() {
      if (open) return;
      open = true;
      clearTimeout(closeT);
      bar.classList.remove("ax-quick-hidden");
      bar.classList.add("util-open");
      btn.setAttribute("aria-expanded", "true");
      scrim.hidden = false; panel.hidden = false;
      // open on the page that holds the utility you're on
      var act = document.querySelector(".bp-panel.active"), here = act && /^\/arc(?:pad\.html)?\/?$/.test(location.pathname) ? act.id.replace("bp-panel-", "") : "";
      var cur = here ? panel.querySelector('.ax-util-tile[href="/arc#' + here + '"]') : null;
      Array.prototype.forEach.call(panel.querySelectorAll(".ax-util-tile[href]"), function (a) { if (a === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
      goPage(cur ? Number(cur.parentNode.getAttribute("data-page")) || 0 : 0, true);
      place();
      void panel.offsetWidth;
      panel.classList.add("in"); scrim.classList.add("in");
      // focus moves into the panel itself (keyboard users Tab on from there)
      setTimeout(function () { if (open) panel.focus({ preventScroll: true }); }, reduce ? 0 : 180);
      if (typeof window.arcHaptic === "function") window.arcHaptic("tap");
    }
    function hide(back) {
      if (!open) return;
      open = false;
      bar.classList.remove("util-open");
      btn.setAttribute("aria-expanded", "false");
      panel.classList.remove("in"); scrim.classList.remove("in");
      closeT = setTimeout(function () { panel.hidden = true; scrim.hidden = true; }, reduce ? 0 : 260);
      if (back) btn.focus({ preventScroll: true });
    }
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); if (open) hide(true); else show(); });
    scrim.addEventListener("click", function () { hide(false); });
    panel.querySelector(".ax-util-x").addEventListener("click", function () { hide(true); });
    panel.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a.ax-util-tile")) { hide(false); return; }
      var t = e.target.closest && e.target.closest(".ax-util-tile.is-off");
      if (!t) return;
      t.classList.remove("nudge"); void t.offsetWidth; t.classList.add("nudge");
    });
    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); hide(true); return; }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && panel.contains(document.activeElement)) { e.preventDefault(); goPage(page + (e.key === "ArrowRight" ? 1 : -1)); return; }
      if (e.key !== "Tab") return;
      var f = [].slice.call(panel.querySelectorAll("a[href], button")).filter(function (el) { return !el.closest("[inert]"); }).concat([btn]);
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    window.addEventListener("resize", function () { if (open) place(); });
    document.addEventListener("arcpad:tab", function () { hide(false); });
    window.arcUtilities = { open: show, close: hide, list: UTILS.concat(UTILS2, UTILS3), page: function (n) { if (n == null) return page; goPage(n); } };
  }

  // ---- Dock: the "you are here" highlight slides from the page you came
  // from to this one (the item you clicked is remembered for one hop).
  function mountGlider() {
    var dock = document.querySelector("nav.ax-dock");
    if (!dock || dock.querySelector(".ax-dock-glider")) return;
    var items = [].slice.call(dock.querySelectorAll(".ax-dock-item"));
    var cur = items.findIndex(function (a) { return a.getAttribute("aria-current") === "page"; });
    var KEY = "ax-dock-from";
    dock.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest(".ax-dock-item");
      if (!a || cur < 0 || items.indexOf(a) === cur) return;
      try { sessionStorage.setItem(KEY, String(cur)); } catch (err) { /* private mode */ }
    });
    if (cur < 0) return;
    var g = document.createElement("span");
    g.className = "ax-dock-glider";
    g.setAttribute("aria-hidden", "true");
    dock.insertBefore(g, dock.firstChild);
    dock.classList.add("has-glider");
    var put = function (i) {
      var it = items[i];
      g.style.left = it.offsetLeft + "px"; g.style.top = it.offsetTop + "px";
      g.style.width = it.offsetWidth + "px"; g.style.height = it.offsetHeight + "px";
    };
    var from = null;
    try { from = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (err) { from = null; }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fi = from == null ? -1 : Number(from);
    if (!reduce && fi >= 0 && fi < items.length && fi !== cur) {
      put(fi);
      requestAnimationFrame(function () { requestAnimationFrame(function () { g.classList.add("glide"); put(cur); }); });
    } else { put(cur); requestAnimationFrame(function () { g.classList.add("glide"); }); }
    var re = function () { put(cur); };
    window.addEventListener("resize", re);
    if (window.ResizeObserver) new ResizeObserver(re).observe(dock);
  }

  // Loading skeletons: a live number that hasn't arrived yet shows a soft
  // shimmering bar instead of a bare "—". Only fields that are filled from
  // the network (not ones that stay "—" by design, like a disconnected
  // wallet's balance), and never longer than a few seconds — if the data
  // still isn't there the "—" comes back.
  function mountSkeletons() {
    var SEL = "[data-tk],[data-arl],[data-ac2],[data-lb],#ap-stat-vol,#ac2-liq,#rw-launches,#lkr-count,#apc-price,#apc-mcap,#apc-liq,#apc-vol,#apc-txns,#apc-holders-count,#apc-age";
    var els = [].slice.call(document.querySelectorAll(SEL)).filter(function (el) {
      return !el.children.length && el.textContent.trim() === "\u2014" && !el.closest("[data-no-skel]");
    });
    if (!els.length) return;
    els.forEach(function (el) {
      el.classList.add("arc-skel");
      if (getComputedStyle(el).display === "inline") el.classList.add("arc-skel-i");
      var mo = new MutationObserver(function () {
        if (el.textContent.trim() !== "\u2014") { el.classList.remove("arc-skel", "arc-skel-i"); mo.disconnect(); }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
      el.__skelMo = mo;
    });
    setTimeout(function () { els.forEach(function (el) { el.classList.remove("arc-skel", "arc-skel-i"); if (el.__skelMo) el.__skelMo.disconnect(); }); }, 8000);
  }

  mountQuickBar();
  mountGlider();
  mountSkeletons();

  if (location.hash === "#rewards") location.replace("/reward");
  window.addEventListener("hashchange", function () { if (location.hash === "#rewards") openReward(); });
})();
;
/* ---- arc-social.js ---- */
// arc-social.js — the official community links, placed where each page
// naturally has room for them:
//   hub (/)            a glass row under the tagline
//   every header       X + Telegram icon buttons (desktop)
//   ArcPad / CirclePad sidebar "Community" block (inside the mobile menu too)
//   footer             three chips in the brand column
//   ArcPad             "never miss a launch" card on Home + Explore, and a
//                      line under the Launch button about the alerts channel
(function () {
  "use strict";
  var S = {
    x: { url: "https://x.com/ARCIRCLEonArc", handle: "@ARCIRCLEonArc", name: "X", sub: "@ARCIRCLEonArc" },
    tg: { url: "https://t.me/ARCIRCLEonarc", handle: "@ARCIRCLEonarc", name: "Telegram", sub: "Community chat" },
    alerts: { url: "https://t.me/arcircle_launch", handle: "@arcircle_launch", name: "Launch alerts", sub: "@arcircle_launch" },
    bot: { url: "https://t.me/ARCIAonArc_bot", handle: "@ARCIAonArc_bot", name: "ARCIA bot", sub: "@ARCIAonArc_bot" },
  };
  window.ARC_SOCIAL = S;
  var ICON = {
    x: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-fill"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    tg: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-fill"><path d="M22.05 2.5 2.6 10.13c-1.33.53-1.32 1.27-.24 1.6l4.98 1.55 11.5-7.25c.54-.33 1.04-.15.63.22L10.7 14.3l-.36 5.16c.52 0 .75-.24 1.03-.52l2.48-2.4 5.15 3.8c.95.52 1.63.25 1.87-.88l3.38-15.9c.36-1.39-.53-2.02-1.9-1.06z"/></svg>',
    bot: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-line"><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 7V4M9 12.5h.01M15 12.5h.01M9.5 16h5"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-line"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/><path d="M3.5 8.5a9 9 0 0 1 2.2-4M20.5 8.5a9 9 0 0 0-2.2-4"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-line"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5"/></svg>',
  };
  var KEYS = ["x", "tg", "alerts"];
  var KEYS_ALL = ["x", "tg", "bot", "alerts"]; // sidebar + footer also list ARCIA's Telegram bot
  var a = function (k, cls, inner, label) {
    return '<a class="' + cls + '" data-soc="' + k + '" href="' + S[k].url + '" target="_blank" rel="noopener"' +
      (label ? ' aria-label="' + label + '"' : "") + ">" + inner + "</a>";
  };
  var live = '<i class="soc-live" aria-hidden="true"></i>';
  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

  // ---- hub: glass row under the tagline ----
  function hubRow() {
    var sub = document.querySelector("main.ax-hero .ax-sub");
    if (!sub || document.querySelector(".ax-social")) return;
    var html = '<div class="ax-social" aria-label="Community">' + KEYS.map(function (k) {
      return a(k, "ax-soc ax-soc-" + k,
        '<span class="ax-soc-ico">' + ICON[k] + (k === "alerts" ? live : "") + "</span>" +
        '<span class="ax-soc-txt"><strong>' + S[k].name + "</strong><small>" + S[k].sub + "</small></span>");
    }).join("") + "</div>";
    sub.insertAdjacentElement("afterend", el(html));
  }

  // ---- header icon buttons (desktop) ----
  function headerIcons() {
    var host = document.querySelector(".bp-topbar-right") || document.querySelector("header.ax-top .ax-top-right") || document.querySelector("header.ax-top");
    if (!host || host.querySelector(".soc-head")) return;
    var g = el('<div class="soc-head">' +
      a("x", "soc-head-btn soc-x", ICON.x, "ARCIRCLE PAD on X") +
      a("tg", "soc-head-btn soc-tg", ICON.tg, "ARCIRCLE PAD on Telegram") + "</div>");
    var toggle = host.querySelector(".lang-toggle");
    if (toggle) host.insertBefore(g, toggle);
    else if (host.matches("header.ax-top")) host.insertBefore(g, host.querySelector(".ax-top-cta"));
    else host.insertBefore(g, host.firstChild);
  }

  // ---- ArcPad / CirclePad sidebar ----
  function sidebar() {
    var foot = document.querySelector(".bp-sidebar .bp-side-foot");
    if (!foot || document.querySelector(".bp-side-social")) return;
    var html = '<div class="bp-side-social"><div class="bp-side-section-label">Community</div><div class="bp-soc-list">' + KEYS_ALL.map(function (k) {
      return a(k, "bp-soc bp-soc-" + k,
        '<span class="bp-soc-ico">' + ICON[k] + (k === "alerts" ? live : "") + "</span>" +
        '<span class="bp-soc-txt"><strong>' + S[k].name + "</strong><small>" + S[k].sub + "</small></span>" +
        '<span class="bp-soc-ext">' + ICON.ext + "</span>");
    }).join("") + "</div></div>";
    foot.parentNode.insertBefore(el(html), foot);
  }

  // ---- footer chips ----
  function footer() {
    var brand = document.querySelector(".axf .axf-brand");
    if (!brand || brand.querySelector(".axf-social")) return;
    var html = '<div class="axf-social" aria-label="Community">' + KEYS_ALL.map(function (k) {
      return a(k, "axf-soc axf-soc-" + k, '<span class="axf-soc-ico">' + ICON[k] + "</span><span>" + S[k].name + "</span>", k === "x" ? "ARCIRCLE PAD on X" : null);
    }).join("") + "</div>";
    var net = brand.querySelector(".axf-net");
    brand.insertBefore(el(html), net || null);
  }

  // ---- ArcPad: launch alerts card + launch-form note ----
  function alertsCard() {
    var card = function (id) {
      return el('<a class="ap-alerts" id="' + id + '" href="' + S.alerts.url + '" target="_blank" rel="noopener" data-soc="alerts">' +
        '<span class="ap-alerts-ico">' + ICON.tg + '<i class="ap-alerts-ping" aria-hidden="true"></i></span>' +
        '<span class="ap-alerts-txt"><strong>Never miss a launch</strong>' +
        '<small>Every new ArcPad coin is posted to our Telegram channel the moment it goes live — logo, market cap and a trade button.</small></span>' +
        '<span class="ap-alerts-cta"><span class="ap-alerts-handle" data-no-i18n>' + S.alerts.handle + "</span><b>Join channel</b></span></a>");
    };
    var grid = document.getElementById("ap-explore-grid");
    if (grid && !document.getElementById("ap-alerts-explore")) grid.insertAdjacentElement("afterend", card("ap-alerts-explore"));
    var car = document.getElementById("ap-home-viewport");
    var carWrap = car && (car.closest(".carousel-section") || car.parentNode);
    if (carWrap && !document.getElementById("ap-alerts-home")) carWrap.insertAdjacentElement("afterend", card("ap-alerts-home"));
    var note = document.querySelector("#bp-panel-launch .ap-launch-btn-note");
    if (note && !document.querySelector(".ap-launch-announce")) {
      note.insertAdjacentElement("afterend", el('<a class="ap-launch-announce" href="' + S.alerts.url + '" target="_blank" rel="noopener" data-soc="alerts">' +
        '<span class="ap-launch-announce-ico">' + ICON.tg + "</span>" +
        '<span>Your launch is announced automatically in <b data-no-i18n>' + S.alerts.handle + "</b></span>" +
        '<span class="ap-launch-announce-go">' + ICON.ext + "</span></a>"));
    }
  }

  function track(e) {
    var t = e.target.closest && e.target.closest("[data-soc]");
    if (t && typeof window.va === "function") window.va("event", { name: "social_click", data: { to: t.getAttribute("data-soc") } });
  }

  function mount() {
    hubRow(); sidebar(); footer(); alertsCard();
    // after i18n.js has placed the language toggle
    setTimeout(headerIcons, 0);
  }
  document.addEventListener("click", track);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
;
/* ---- arc-cmdk.js ---- */
// arc-cmdk.js — one search box for the whole site. ⌘K / Ctrl+K (or "/") opens it anywhere;
// the search button in the top bar does the same on touch screens.
// It finds pages, utilities, docs sections and ArcPad coins (by name, symbol or address).
// A pasted 0x address offers: open the coin, scan the token, or look the wallet up on /me.
(function () {
  "use strict";
  if (window.arcCmdk) return;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(a); };
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

  var PAGES = [
    ["Home", "ARCIRCLE PAD", "/", "page"],
    ["ArcPad", "Launch a coin in one transaction", "/arc", "page"],
    ["Launch a coin", "ArcPad launch form", "/arc#launch", "page"],
    ["CirclePad", "Community-funded launches · Round #2 next", "/circle", "page"],
    ["$ARCIRCLE", "Price, holders, burns and buybacks", "/arcircle", "page"],
    ["Relay Launch", "Every CirclePad coin relayed to holders", "/relay", "page"],
    ["Reward", "Holder rewards", "/reward", "page"],
    ["My ARCIRCLE", "One wallet across the whole site", "/me", "page"],
    ["Stats", "ARCIRCLE PAD in numbers", "/stats", "page"],
    ["Roadmap", "What's done, what's next", "/roadmap", "page"],
    ["Get started", "Add Arc, bring USDC, pick a path", "/start", "page"],
    ["Brand kit", "Logo and colours", "/brand", "page"],
    ["Round #1 report", "CirclePad round results", "/circle/round/1", "page"],
    ["Whitepaper", "How everything fits together", "/whitepaper", "doc"],
    ["백서 (한국어)", "Whitepaper in Korean", "/whitepaper/ko", "doc"],
    ["ArcPad docs", "Fees, curve, graduation", "/arc#docs", "doc"],
    ["CirclePad docs", "Rounds, voting, refunds", "/circle#docs", "doc"],
    ["X / Twitter", "@ARCIRCLEonArc", "https://x.com/ARCIRCLEonArc", "link"],
    ["Telegram", "Community chat", "https://t.me/ARCIRCLEonarc", "link"],
  ];
  var KIND = { page: "Page", doc: "Docs", util: "Utility", coin: "Coin", link: "Link", addr: "Address" };

  var coins = null, coinsLoading = false;
  function loadCoins() {
    if (coins || coinsLoading) return;
    coinsLoading = true;
    fetch("/api/c?view=coins").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      coins = (j && Array.isArray(j.coins)) ? j.coins : [];
      coinsLoading = false;
      if (open) render();
    }).catch(function () { coins = []; coinsLoading = false; });
  }
  function utils() {
    var l = (window.arcUtilities && Array.isArray(window.arcUtilities.list)) ? window.arcUtilities.list : [];
    if (!l.length) l = [
      { name: "Locker", sub: "Lock any Arc token", href: "/arc#locker" }, { name: "Token Scanner", sub: "Check any Arc token", href: "/arc#scanner" },
      { name: "Multisender", sub: "Send a token to many wallets", href: "/arc#multisend" }, { name: "Snapshot", sub: "Every holder at one moment", href: "/arc#snapshot" },
      { name: "Liquidity", sub: "Pools, LP positions and LP locks", href: "/arc#liquidity" }, { name: "Bridge", sub: "Move USDC to Arc", href: "/arc#bridge" },
    ];
    return l.filter(function (u) { return u.href; }).map(function (u) { return [u.name, u.sub || "", u.href, "util"]; });
  }

  function score(q, a, b) {
    a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase();
    if (!q) return 1;
    if (a === q) return 100;
    if (a.indexOf(q) === 0) return 60;
    if (a.indexOf(q) > 0) return 40;
    if (b.indexOf(q) >= 0) return 20;
    // loose: every char in order
    var i = 0; for (var k = 0; k < a.length && i < q.length; k++) if (a[k] === q[i]) i++;
    return i === q.length ? 8 : 0;
  }
  function results(q) {
    q = q.trim();
    var ql = q.toLowerCase(), out = [];
    if (isAddr(q)) {
      out.push(["Open coin on ArcPad", q, "/arc#coin/" + q, "addr"]);
      out.push(["Scan this token", "Token Scanner", "/arc#scanner?t=" + q, "addr"]);
      out.push(["Look up this wallet", "My ARCIRCLE", "/me?w=" + q.toLowerCase(), "addr"]);
      out.push(["View on the explorer", "arc.etherscan.io", ((window.CONFIG && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io") + "/address/" + q, "link"]);
      return out;
    }
    var pool = PAGES.concat(utils());
    var seen = {};
    pool.forEach(function (it) {
      if (seen[it[2]]) return; seen[it[2]] = 1;
      var s = Math.max(score(ql, it[0], it[1]), score(ql, tr(it[0]), tr(it[1])));
      if (s) out.push(it.concat([s + (it[3] === "page" ? 2 : 0)]));
    });
    if (ql && coins) {
      coins.forEach(function (c) {
        var s = Math.max(score(ql.replace(/^\$/, ""), c.s, c.n), score(ql, c.n, ""));
        if (!s && ql.length >= 4 && c.t.toLowerCase().indexOf(ql) === 0) s = 30;
        if (s) out.push(["$" + c.s, c.n, "/arc#coin/" + c.t, "coin", s - 1]);
      });
    }
    out.sort(function (a, b) { return (b[4] || 0) - (a[4] || 0); });
    return out.slice(0, ql ? 12 : 14);
  }

  var root, input, list, open = false, sel = 0, items = [], lastFocus = null;
  function build() {
    root = document.createElement("div");
    root.className = "ck";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Search");
    root.innerHTML =
      '<div class="ck-bg" data-ck-close></div>' +
      '<div class="ck-box">' +
        '<div class="ck-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="M20 20l-4.5-4.5"/></svg>' +
          '<input type="text" spellcheck="false" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="ck-list" aria-autocomplete="list">' +
          '<kbd data-ck-close>Esc</kbd></div>' +
        '<ul class="ck-list" id="ck-list" role="listbox"></ul>' +
        '<div class="ck-foot"><span><kbd>↑</kbd><kbd>↓</kbd> <em></em></span><span><kbd>↵</kbd> <em></em></span><span class="ck-hint"></span></div>' +
      "</div>";
    document.body.appendChild(root);
    input = root.querySelector("input");
    list = root.querySelector(".ck-list");
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-ck-close]")) return hide();
      var li = e.target.closest("[data-ck-i]");
      if (li) go(Number(li.getAttribute("data-ck-i")), e);
    });
    list.addEventListener("mousemove", function (e) {
      var li = e.target.closest("[data-ck-i]");
      if (li) { var i = Number(li.getAttribute("data-ck-i")); if (i !== sel) { sel = i; paintSel(); } }
    });
    input.addEventListener("input", function () { sel = 0; render(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paintSel(true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paintSel(true); }
      else if (e.key === "Enter") { e.preventDefault(); go(sel, e); }
      else if (e.key === "Escape") { e.preventDefault(); hide(); }
      else if (e.key === "Tab") e.preventDefault();
    });
  }
  function render() {
    var q = input.value;
    items = results(q);
    if (!items.length) {
      list.innerHTML = '<li class="ck-none">' + esc(coinsLoading ? tr("Loading coins…") : tr("Nothing found. Paste a token or wallet address to jump straight to it.")) + "</li>";
      return;
    }
    list.innerHTML = items.map(function (it, i) {
      var ext = /^https?:/.test(it[2]);
      return '<li role="option" id="ck-o' + i + '" data-ck-i="' + i + '" class="ck-' + it[3] + '"><span class="ck-k">' + esc(tr(KIND[it[3]] || "")) + '</span>' +
        '<span class="ck-t"><b' + (it[3] === "coin" || it[3] === "addr" && i === 0 ? " data-no-i18n" : "") + ">" + esc(it[3] === "coin" ? it[0] : tr(it[0])) + "</b><small" + (it[3] === "coin" || it[3] === "addr" ? " data-no-i18n" : "") + ">" +
        esc(it[3] === "coin" || /^0x/.test(it[1]) ? it[1] : tr(it[1])) + "</small></span>" + (ext ? '<span class="ck-x" aria-hidden="true">↗</span>' : "") + "</li>";
    }).join("");
    paintSel();
  }
  function paintSel(scroll) {
    var lis = list.querySelectorAll("[data-ck-i]");
    lis.forEach(function (li, i) { li.classList.toggle("on", i === sel); li.setAttribute("aria-selected", i === sel ? "true" : "false"); });
    input.setAttribute("aria-activedescendant", lis[sel] ? "ck-o" + sel : "");
    if (scroll && lis[sel]) lis[sel].scrollIntoView({ block: "nearest" });
  }
  function go(i, e) {
    var it = items[i];
    if (!it) return;
    var href = it[2];
    hide();
    if (/^https?:/.test(href)) { window.open(href, "_blank", "noopener"); return; }
    var here = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    var tgt = href.split("#")[0].split("?")[0] || "/";
    var norm = function (p) { return p === "/arcpad" ? "/arc" : p === "/circlepad" ? "/circle" : p; };
    if (e && (e.metaKey || e.ctrlKey)) { window.open(href, "_blank", "noopener"); return; }
    if (norm(here) === norm(tgt) && href.indexOf("#") >= 0 && href.indexOf("?") < 0) { location.hash = href.slice(href.indexOf("#")); return; }
    location.href = href;
  }
  function show(prefill) {
    if (!root) build();
    lastFocus = document.activeElement;
    root.hidden = false;
    open = true;
    document.documentElement.classList.add("ck-open");
    input.placeholder = tr("Search pages, utilities, coins, or paste an address");
    var f = root.querySelectorAll(".ck-foot em");
    f[0].textContent = tr("to move"); f[1].textContent = tr("to open");
    root.querySelector(".ck-hint").textContent = (mac ? "⌘" : "Ctrl") + " K";
    input.value = prefill || "";
    sel = 0;
    render();
    loadCoins();
    requestAnimationFrame(function () { input.focus(); root.classList.add("in"); });
  }
  function hide() {
    if (!root || !open) return;
    open = false;
    root.classList.remove("in");
    root.hidden = true;
    document.documentElement.classList.remove("ck-open");
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* gone */ }
  }

  document.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === "k") { e.preventDefault(); open ? hide() : show(); return; }
    if (k === "/" && !open && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      e.preventDefault(); show();
    }
  });
  document.addEventListener("paste", function (e) {
    if (open) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
    var s = ((e.clipboardData && e.clipboardData.getData("text")) || "").trim();
    if (isAddr(s)) { e.preventDefault(); show(s); }
  });

  // the visible trigger in the top bar (every page has either .ax-top or ArcPad/CirclePad's .headbar)
  function addTrigger() {
    if (document.querySelector(".ck-btn")) return;
    var bar = document.querySelector(".bp-topbar-right");
    var host = bar || document.querySelector("header.ax-top");
    if (!host) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "ck-btn";
    b.setAttribute("aria-label", "Search");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="M20 20l-4.5-4.5"/></svg><span>Search</span><kbd>' + (mac ? "⌘K" : "Ctrl K") + "</kbd>";
    b.addEventListener("click", function () { show(); });
    if (bar) { b.classList.add("ck-btn-bar"); b.setAttribute("aria-label", "Search the whole site"); bar.insertBefore(b, bar.querySelector(".bp-chain-pill") || bar.firstChild); return; }
    var cta = host.querySelector(".ax-top-right, .ax-top-cta");
    if (cta) host.insertBefore(b, cta); else host.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addTrigger); else addTrigger();

  window.arcCmdk = { open: show, close: hide };
})();
;
/* ---- arc-chrome.js ---- */
// arc-chrome.js — the shared top-bar pieces every page gets:
//   · product switcher (desktop): ArcPad · CirclePad · $ARCIRCLE · Relay · Stats
//   · alerts bell: new ArcPad coins, the CirclePad round clock, relay launches and site news.
//     What counts as "new" is remembered in this browser only (localStorage, optional).
//   · service worker registration (sw.js) so the site installs as an app and opens offline.
(function () {
  "use strict";
  if (window.arcChrome) return;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var F = window.arcFmt || { ago: function (t) { var s = Math.max(1, Date.now() / 1000 - t); return s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; }, usd: function (v) { return "$" + Math.round(v); } };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  var now = function () { return Math.floor(Date.now() / 1000); };
  var path = (location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/").replace(/^\/arcpad$/, "/arc").replace(/^\/circlepad$/, "/circle");

  // ---------- product switcher ----------
  var PRODUCTS = [["ArcPad", "/arc"], ["CirclePad", "/circle"], ["$ARCIRCLE", "/arcircle"], ["Relay", "/relay"], ["Stats", "/stats"]];
  function switcher(host) {
    if (host.querySelector(".ps")) return;
    var hash = location.hash;
    var nav = document.createElement("nav");
    nav.className = "ps";
    nav.setAttribute("aria-label", "Products");
    nav.innerHTML = PRODUCTS.map(function (p) {
      var on = p[1] === "/relay" ? path === "/arc" && /^#relay/.test(hash) : p[1] === "/arc" ? path === "/arc" && !/^#relay/.test(hash) : path === p[1] || path.indexOf(p[1] + "/") === 0;
      return '<a href="' + p[1] + '"' + (on ? ' aria-current="page" class="on"' : "") + (p[0] === "$ARCIRCLE" ? " data-no-i18n" : "") + ">" + esc(p[0] === "Stats" ? tr("Stats") : p[0]) + "</a>";
    }).join("");
    var brand = host.querySelector(".ax-brand");
    if (brand) brand.insertAdjacentElement("afterend", nav);
  }

  // ---------- alerts ----------
  var SEEN = "arc-nb-seen";
  var NEWS = [
    { id: "news:pages", ts: 1790496000, t: "New: My ARCIRCLE, Stats, Roadmap and site search", s: "Look up any wallet, or press Ctrl/⌘K anywhere", href: "/me" },
    { id: "news:relay", ts: 1790488800, t: "Relay Launch is in Utilities", s: "Every CirclePad coin relayed to contributors and $ARCIRCLE holders", href: "/relay" },
  ];
  var items = [], btn, panel, open = false, loaded = false;
  var seenAt = function () { var v = Number(store.get(SEEN)); return v > 0 ? v : now() - 3 * 86400; };
  function gather() {
    var tasks = [
      fetch("/api/c?view=latest&n=5").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch("/api/social?token=arcircle").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ];
    return Promise.all(tasks).then(function (r) {
      var out = NEWS.slice();
      var latest = r[0], tok = r[1];
      if (latest && Array.isArray(latest.coins)) latest.coins.forEach(function (c) {
        if (!c || !c.token || !c.launchedAt) return;
        out.push({ id: "coin:" + c.token, ts: c.launchedAt, k: "coin", t: tr("New coin on ArcPad") + ": $" + c.symbol, s: c.name + (c.mcapUsd != null ? " · " + F.usd(c.mcapUsd) : ""), href: "/arc#coin/" + c.token, raw: true });
      });
      var c = tok && tok.revenue && tok.revenue.circle;
      if (c && c.deadline) {
        var left = c.deadline - now();
        if (c.open && left > 0 && left < 86400) out.push({ id: "round1:24h", ts: c.deadline - 86400, k: "round", t: "CirclePad Round #1 closes within 24 hours", s: tr("Raised so far") + ": " + (F.num ? F.num(c.raised || 0, 2) : c.raised) + " USDC", href: "/circle" });
        if (left <= 0) out.push({ id: "round1:closed", ts: c.deadline, k: "round", t: "CirclePad Round #1 has closed", s: "See the results and the winning coin", href: "/circle/round/1" });
      }
      var rounds = (window.CONFIG && CONFIG.RELAY && CONFIG.RELAY.ROUNDS) || [];
      rounds.forEach(function (rd) {
        if (!rd.launch || !rd.launch.token) return;
        var at = rd.launch.at ? Math.floor(Date.parse(rd.launch.at) / 1000) : 0;
        out.push({ id: "relay:" + rd.n, ts: at || now(), k: "relay", t: "Relay N" + rd.n + " is live", s: rd.launch.symbol ? "$" + rd.launch.symbol : "", href: "/relay", raw: true });
      });
      out.sort(function (a, b) { return b.ts - a.ts; });
      items = out.slice(0, 12);
      loaded = true;
      paint();
    });
  }
  function unread() { var s = seenAt(); return items.filter(function (i) { return i.ts > s; }).length; }
  function paint() {
    if (!btn) return;
    var n = unread();
    var badge = btn.querySelector(".nb-n");
    badge.textContent = n > 9 ? "9+" : String(n);
    badge.hidden = !n;
    btn.setAttribute("aria-label", tr("Alerts") + (n ? " (" + n + ")" : ""));
    if (open) list();
  }
  function list() {
    var s = Number(panel.getAttribute("data-seen")) || seenAt();
    var ul = panel.querySelector(".nb-list");
    if (!loaded) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Loading…")) + "</li>"; return; }
    if (!items.length) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Nothing new yet.")) + "</li>"; return; }
    ul.innerHTML = items.map(function (i) {
      return '<li class="nb-i nb-' + (i.k || "news") + (i.ts > s ? " new" : "") + '"><a href="' + esc(i.href) + '"><i aria-hidden="true"></i><span><b' + (i.raw ? " data-no-i18n" : "") + ">" + esc(i.raw ? i.t : tr(i.t)) + "</b><small" + (i.raw ? " data-no-i18n" : "") + ">" + esc(i.raw ? i.s : tr(i.s)) + '</small></span><em data-no-i18n>' + esc(F.ago(i.ts)) + "</em></a></li>";
    }).join("");
  }
  function toggle(force) {
    open = force == null ? !open : force;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      panel.setAttribute("data-seen", String(seenAt()));
      panel.querySelector(".nb-h b").textContent = tr("Alerts");
      list();
      if (!loaded) gather();
      store.set(SEEN, String(now()));
      paint();
    }
  }
  function bell(host) {
    if (host.querySelector(".nb-btn")) return;
    var wrap = document.createElement("div");
    wrap.className = "nb";
    wrap.innerHTML = '<button type="button" class="nb-btn" aria-haspopup="true" aria-expanded="false" aria-label="Alerts">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg><span class="nb-n" hidden>0</span></button>' +
      '<div class="nb-panel" hidden><div class="nb-h"><b>Alerts</b><a href="/roadmap">' + esc(tr("Roadmap")) + ' →</a></div><ul class="nb-list"></ul></div>';
    var search = host.querySelector(".ck-btn");
    if (search) search.insertAdjacentElement("afterend", wrap);
    else { var cta = host.querySelector(".bp-chain-pill, .ax-top-right, .ax-top-cta"); if (cta) host.insertBefore(wrap, cta); else host.appendChild(wrap); }
    btn = wrap.querySelector(".nb-btn");
    panel = wrap.querySelector(".nb-panel");
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener("click", function (e) { if (open && !wrap.contains(e.target)) toggle(false); });
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") { toggle(false); btn.focus(); } });
  }

  // One order on every page's top bar: [search] [alerts] [language] [page action / wallet].
  // On ArcPad / CirclePad phones the bar floats over the "Home ▾" row, so that row is told how
  // much room the right-hand group takes (--bp-right) and never runs underneath it.
  function tidy(head) {
    var lang = head.querySelector(":scope > .lang-toggle");
    var nb = head.querySelector(":scope > .nb");
    if (lang && nb) nb.insertAdjacentElement("afterend", lang);
    if (!head.matches(".bp-topbar-right")) return;
    var root = document.documentElement;
    var fit = function () { root.style.setProperty("--bp-right", Math.ceil(head.getBoundingClientRect().width + 26) + "px"); };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(head);
    window.addEventListener("resize", fit);
  }
  function init() {
    var top = document.querySelector("header.ax-top");
    var head = document.querySelector(".bp-topbar-right") || top;
    if (top) switcher(top);
    if (head) {
      bell(head);
      tidy(head);
      setTimeout(gather, 2500);
      setInterval(function () { if (!document.hidden) gather(); }, 180000);
    }
  }
  // search (arc-cmdk.js) adds its button on DOMContentLoaded too; wait a tick so the bell sits after it
  var go = function () { setTimeout(init, 0); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();

  // ---------- installable app ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () { /* unsupported */ }); });
  }

  window.arcChrome = { refresh: gather };
})();
;
/* ---- arc-a11y.js ---- */
// arc-a11y.js — keyboard support for every modal on the page.
// Whenever a dialog opens (coin editor, lock modal, trade modal, phone trade
// sheet, …) focus moves into it, Tab / Shift+Tab cycle inside it, Escape
// closes it, and when it closes focus goes back to the button that opened it.
// Dialogs are found by watching the DOM, so modals added later by any script
// get the same behaviour without extra wiring.
(function () {
  "use strict";
  // [selector for the open dialog box, selector for its close control]
  const KINDS = [
    [".cm-modal.in .cm-dialog", "[data-close].cm-x"],
    ["#msheet:not([hidden]) .msheet-panel", ".msheet-x"],
    [".modal-overlay:not(.hidden) > .ap-modal-box, .modal-overlay:not(.hidden) > .modal", ".ap-modal-close, .modal-close, [data-close]"],
  ];
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  const stack = []; // [{ box, closeSel, back }]
  function openDialogs() {
    const out = [];
    for (const [sel, closeSel] of KINDS) document.querySelectorAll(sel).forEach((box) => { if (visible(box)) out.push({ box, closeSel }); });
    return out;
  }
  const focusables = (box) => [...box.querySelectorAll(FOCUSABLE)].filter((el) => visible(el) && !el.closest("[hidden]"));
  function enter(d) {
    const box = d.box;
    if (!box.hasAttribute("role")) box.setAttribute("role", "dialog");
    if (!box.hasAttribute("aria-modal")) box.setAttribute("aria-modal", "true");
    if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
    d.back = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    stack.push(d);
    // Focus the first form field if there is one, otherwise the dialog itself
    // (so screen readers read its title), never the close button.
    requestAnimationFrame(() => {
      if (!box.isConnected || box.contains(document.activeElement)) return;
      const field = box.querySelector('input:not([type="hidden"]):not([disabled]),textarea:not([disabled])');
      (field && visible(field) && !matchMedia("(pointer:coarse)").matches ? field : box).focus({ preventScroll: true });
    });
  }
  function leave(d) {
    const i = stack.indexOf(d);
    if (i >= 0) stack.splice(i, 1);
    const back = d.back;
    if (back && back.isConnected && visible(back) && (!document.activeElement || document.activeElement === document.body || d.box.contains(document.activeElement) || !document.activeElement.isConnected)) {
      back.focus({ preventScroll: true });
    }
  }
  function sync() {
    const open = openDialogs();
    for (const d of stack.slice()) if (!open.some((o) => o.box === d.box)) leave(d);
    for (const o of open) if (!stack.some((d) => d.box === o.box)) enter(o);
  }
  let t = 0;
  new MutationObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(sync); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });

  // Escape runs after the dialog's own handlers (bubble phase), and only if
  // the dialog is still open by then.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    sync();
    const top = stack[stack.length - 1];
    if (!top || !top.box.isConnected) return;
    const c = top.box.querySelector(top.closeSel) || (top.box.parentElement && top.box.parentElement.querySelector(top.closeSel));
    if (c) { e.preventDefault(); c.click(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const top = stack[stack.length - 1];
    if (!top || !top.box.isConnected) return;
    const f = focusables(top.box);
    if (!f.length) { e.preventDefault(); top.box.focus(); return; }
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!top.box.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && (a === first || a === top.box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }, true);
})();
;
/* ---- arc-txring.js ---- */
/* global ethers, state, CONFIG */
// arc-txring.js — two small pieces of motion shared by every app page:
//
//   · tx ring: every transaction the site asks a wallet to send shows a ring that fills as it
//     moves — confirm in wallet → submitted → in a block → done (green check) or failed. It hooks
//     ethers' JsonRpcSigner.sendTransaction once, so every contract call on every page gets it
//     without the page knowing.
//   · wallet rings: after someone connects a wallet, two rings (blue, green) swing in and lock
//     together over the wallet button — the same ring language as ARCIA's entrance.
(function () {
  "use strict";
  if (window.arcTxRing) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var EXPL = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";
  var R = 16, C = 2 * Math.PI * R;
  var CHECK = '<path class="txr-ok" d="M13 20.5l4.5 4.5 9-10"/>', CROSS = '<path class="txr-bad" d="M15 15l10 10M25 15 15 25"/>';

  // ---------------- tx ring ----------------
  var host = null;
  function box() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement("div");
    host.className = "txr-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
    return host;
  }
  function ring() {
    var el = document.createElement("div");
    el.className = "txr";
    el.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="txr-track" cx="20" cy="20" r="' + R + '"/><circle class="txr-fill" cx="20" cy="20" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"/><g class="txr-mark"></g></svg>' +
      '<div class="txr-t"><b></b><small></small></div><button type="button" class="txr-x" aria-label="Close">×</button>';
    box().appendChild(el);
    requestAnimationFrame(function () { el.classList.add("in"); });
    var done = false, timer = 0;
    var fill = el.querySelector(".txr-fill");
    function set(p, title, sub, cls) {
      fill.style.strokeDashoffset = (C * (1 - p)).toFixed(2);
      el.querySelector("b").textContent = tr(title);
      el.querySelector("small").innerHTML = sub || "";
      if (cls) el.classList.add(cls);
    }
    function close(ms) { clearTimeout(timer); timer = setTimeout(function () { el.classList.remove("in"); el.classList.add("out"); setTimeout(function () { el.remove(); }, 350); }, ms); }
    el.querySelector(".txr-x").addEventListener("click", function () { close(0); });
    set(0.18, "Confirm in your wallet", esc(tr("Waiting for your signature")));
    var link = function (h) { return '<a href="' + esc(EXPL + "/tx/" + h) + '" target="_blank" rel="noopener">' + esc(h.slice(0, 10) + "…" + h.slice(-6)) + " ↗</a>"; };
    return {
      sent: function (h) { if (done) return; set(0.55, "Transaction submitted", esc(tr("Waiting for a block")) + " · " + link(h), "sent"); },
      mined: function (h) { if (done) return; done = true; set(1, "Transaction confirmed", link(h), "ok"); el.querySelector(".txr-mark").innerHTML = CHECK; if (typeof window.arcHaptic === "function") window.arcHaptic("milestone"); close(4200); },
      failed: function (h, why) { if (done) return; done = true; set(1, why === "rejected" ? "Cancelled in wallet" : "Transaction failed", h ? link(h) : esc(tr(why === "rejected" ? "Nothing was sent." : "Nothing changed — you can try again."))); el.classList.add(why === "rejected" ? "cancel" : "bad"); el.querySelector(".txr-mark").innerHTML = CROSS; close(why === "rejected" ? 2600 : 6000); },
    };
  }
  var rejected = function (e) { var m = String((e && (e.code || e.shortMessage || e.message)) || ""); return /ACTION_REJECTED|4001|user rejected|user denied|rejected the request/i.test(m + " " + String(e && e.info && e.info.error && e.info.error.code)); };
  function hook() {
    if (typeof ethers === "undefined" || !ethers.JsonRpcSigner || !ethers.JsonRpcSigner.prototype.sendTransaction) return false;
    var proto = ethers.JsonRpcSigner.prototype;
    if (proto.__arcRing) return true;
    var orig = proto.sendTransaction;
    proto.sendTransaction = function () {
      var r = ring();
      return orig.apply(this, arguments).then(function (resp) {
        var h = resp && resp.hash;
        if (h) r.sent(h);
        if (resp && typeof resp.wait === "function") {
          resp.wait().then(function (rc) { if (rc && rc.status === 1) r.mined(h); else r.failed(h, "reverted"); }, function (e) { r.failed(h, rejected(e) ? "rejected" : "reverted"); });
        }
        return resp;
      }, function (e) { r.failed(null, rejected(e) ? "rejected" : "error"); throw e; });
    };
    proto.__arcRing = true;
    return true;
  }
  if (!hook()) window.addEventListener("load", hook);

  // ---------------- wallet rings ----------------
  var armed = 0, last = null;
  document.addEventListener("pointerdown", function (e) {
    var t = e.target && e.target.closest && e.target.closest("#connect-btn, [data-connect], .connect-btn, .bp-connect, button");
    if (t && (t.id === "connect-btn" || /connect|지갑 연결|연결|连接/i.test(t.textContent || ""))) armed = Date.now();
  }, true);
  function celebrate() {
    if (reduce) return;
    var target = document.getElementById("wallet-pill-btn") || document.getElementById("wallet-slot");
    var r = target ? target.getBoundingClientRect() : { left: innerWidth - 120, top: 16, width: 100, height: 36 };
    var el = document.createElement("div");
    el.className = "wcr";
    el.setAttribute("aria-hidden", "true");
    el.style.left = Math.round(r.left + r.width / 2) + "px";
    el.style.top = Math.round(r.top + r.height / 2) + "px";
    el.innerHTML = '<i class="l"></i><i class="r"></i><b>' + esc(tr("Wallet connected")) + "</b>";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1500);
  }
  setInterval(function () {
    var a = null;
    try { a = typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : null; } catch (e) { a = null; }
    if (a && !last && Date.now() - armed < 120000) { armed = 0; setTimeout(celebrate, 120); }
    last = a;
  }, 400);

  window.arcTxRing = { demo: function () { var r = ring(); setTimeout(function () { r.sent("0x" + "ab".repeat(32)); }, 700); setTimeout(function () { r.mined("0x" + "ab".repeat(32)); }, 1600); return r; }, celebrate: celebrate };
})();
;
/* ---- arc-glyph.js ---- */
// arc-glyph.js — ♾ drawn as the brand's own infinity mark.
// Token symbols can be emoji, and "♾" / "♾️" looks different on every phone (a purple box, a thin
// white glyph, a coloured sticker). Wherever it shows up in the page's text — a ticker, a receipt,
// a table — it's swapped for one small inline SVG in the ARCIRCLE gradient, so it reads the same
// everywhere. Inputs, textareas and copied values keep the character itself.
(function () {
  "use strict";
  if (window.arcGlyph) return;
  var RE = /♾️?/;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, NOSCRIPT: 1, TITLE: 1 };
  var PATH = "M50 25c-9-11-15-16-24-16a16 16 0 0 0 0 32c9 0 15-5 24-16s15-16 24-16a16 16 0 0 1 0 32c-9 0-15-5-24-16z";
  function defs() {
    if (document.getElementById("ax-inf-defs")) return;
    var d = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    d.id = "ax-inf-defs"; d.setAttribute("width", "0"); d.setAttribute("height", "0"); d.setAttribute("aria-hidden", "true");
    d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    d.innerHTML = '<defs><linearGradient id="axInfG" x1="0" x2="1"><stop offset="0" stop-color="#4d9fff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>';
    document.body.appendChild(d);
  }
  function mark() {
    var s = document.createElement("span");
    s.className = "ax-glyph"; s.setAttribute("role", "img"); s.setAttribute("aria-label", "♾");
    s.innerHTML = '<svg viewBox="0 0 100 50" aria-hidden="true"><path d="' + PATH + '"/></svg>';
    return s;
  }
  function swap(node) {
    var t = node.nodeValue, m, frag = null;
    while ((m = RE.exec(t))) {
      frag = frag || document.createDocumentFragment();
      if (m.index) frag.appendChild(document.createTextNode(t.slice(0, m.index)));
      frag.appendChild(mark());
      t = t.slice(m.index + m[0].length);
    }
    if (!frag) return;
    if (t) frag.appendChild(document.createTextNode(t));
    node.parentNode.replaceChild(frag, node);
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (RE.test(root.nodeValue) && root.parentNode && !SKIP[root.parentNode.nodeName] && !root.parentNode.isContentEditable) swap(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName] || !RE.test(root.textContent || "")) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { var p = n.parentNode; return !p || SKIP[p.nodeName] || p.isContentEditable || !RE.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; },
    });
    var list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(swap);
  }
  var queue = [], queued = false;
  function flush() { queued = false; var q = queue; queue = []; defs(); q.forEach(scan); }
  function start() {
    defs(); scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === "characterData") queue.push(m.target);
        else for (var i = 0; i < m.addedNodes.length; i++) queue.push(m.addedNodes[i]);
      });
      if (queue.length && !queued) { queued = true; requestAnimationFrame(flush); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.arcGlyph = { scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
;
/* ---- arc-arcia-fab.js ---- */
// arc-arcia-fab.js — ARCIA's floating "Ask ARCIA" button, on every ARCIRCLE PAD page.
// On ArcPad (/arc) her code comes with the tools bundle (arc-lazy.js); everywhere else it's
// arcia.bundle.js, loaded on the first tap into a hidden host, and she opens as the drawer.
// The button sits above the page's floating bars (the quick bar and the dock at the bottom,
// CirclePad's action bar…) so it never covers them, on phones and on desktop alike.
(function () {
  "use strict";
  if (window.arcArciaFab) return;
  var me = document.currentScript && document.currentScript.src;
  var v = (/[?&]v=(\d+)/.exec(me || "") || [])[1] || "";
  var BUNDLE = "/arcia.bundle.js" + (v ? "?v=" + v : "");
  var BARS = ".ax-quick, .ax-dock, .cpx-bar, .asn-sticky";
  var b = null, st = 0, waiters = [], bare = false;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };

  function loadStandalone(cb) {
    waiters.push(cb);
    if (st === 2) return flush();
    if (st === 1) return;
    st = 1;
    if (!document.getElementById("bp-panel-arcia")) {
      var host = document.createElement("section");
      host.id = "bp-panel-arcia"; host.className = "bp-panel aa-host"; host.hidden = true;
      host.setAttribute("data-host", "float");
      document.body.appendChild(host);
    }
    var s = document.createElement("script");
    s.src = BUNDLE;
    s.onload = function () { st = 2; flush(); };
    s.onerror = function () { st = 0; waiters = []; if (b) b.classList.remove("busy"); location.href = "/arc#arcia"; };
    document.body.appendChild(s);
  }
  function flush() { var w = waiters; waiters = []; w.forEach(function (f) { try { f(); } catch (e) { /* keep going */ } }); }
  function ready(cb) {
    if (window.arcArcia && window.arcArcia.open) return cb();
    if (window.arcLazy && document.getElementById("bp-panel-arcia") && !document.querySelector("#bp-panel-arcia[data-host]")) return window.arcLazy.load(cb); // ArcPad
    loadStandalone(cb);
  }

  // above whatever floats at the bottom under the button
  function place() {
    if (!b || b.hidden || bare) return;
    var vw = window.innerWidth, vh = window.innerHeight, mob = vw <= 900;
    var right = mob ? 14 : 20, w = b.offsetWidth || (mob ? 46 : 140);
    var x0 = vw - right - w - 8, x1 = vw - right + 8;
    var lift = 0;
    var els = document.querySelectorAll(BARS);
    for (var i = 0; i < els.length; i++) {
      var el = els[i], cs = getComputedStyle(el);
      if (el.hidden || cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
      var r = el.getBoundingClientRect();
      // phones: anything under the button; desktop: the whole bar line, so the button always sits above it
      if (!r.width || !r.height || (mob && (r.right < x0 || r.left > x1)) || r.top < vh * 0.45 || r.top > vh) continue;
      lift = Math.max(lift, vh - r.top + (mob ? 10 : 14));
    }
    b.style.bottom = lift ? Math.round(lift) + "px" : "";
  }
  var placeSoon = (function () { var t = 0; return function () { clearTimeout(t); t = setTimeout(place, 60); }; })();

  function mount() {
    if (document.querySelector(".aa-fab")) return;
    b = document.createElement("button");
    b.type = "button"; b.className = "aa-fab"; b.setAttribute("aria-label", tr("Ask ARCIA"));
    b.innerHTML = '<img src="/images/arcia-avatar-96.jpg" alt="" width="48" height="48"><i aria-hidden="true"></i><span>' + tr("Ask ARCIA") + "</span>";
    // a page without the site stylesheet (the whitepaper): the button styles itself and opens ARCIA's page
    b.addEventListener("click", function () {
      if (bare) { location.href = "/arc#arcia"; return; }
      b.classList.add("busy");
      ready(function () { b.classList.remove("busy"); if (window.arcArcia && window.arcArcia.open) window.arcArcia.open(); });
    });
    document.body.appendChild(b);
    if (getComputedStyle(b).position !== "fixed") {
      bare = true;
      b.style.cssText = "position:fixed;right:16px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:60;display:flex;align-items:center;gap:8px;padding:5px 14px 5px 5px;border-radius:99px;border:1px solid rgba(91,140,255,.45);background:rgba(8,14,26,.92);color:#eef3f7;font:700 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 24px rgba(63,123,255,.25)";
      var im = b.querySelector("img"); im.style.cssText = "width:36px;height:36px;border-radius:50%;object-fit:cover";
      var dot = b.querySelector("i"); dot.style.cssText = "position:absolute;left:31px;top:5px;width:9px;height:9px;border-radius:50%;background:#39ff88;box-shadow:0 0 0 2px #080e1a";
      if (window.innerWidth <= 900) { b.style.padding = "4px"; b.querySelector("span").style.display = "none"; }
    }
    // on ArcPad's own ARCIA tab the button would only repeat the page
    var sync = function () { var t = location.hash.replace(/^#/, "").split(/[?/]/)[0]; b.hidden = !!document.querySelector("#bp-panel-arcia:not([data-host])") && t === "arcia"; placeSoon(); };
    document.addEventListener("arcpad:tab", function () { setTimeout(sync, 0); });
    window.addEventListener("hashchange", sync);
    window.addEventListener("resize", placeSoon);
    window.addEventListener("orientationchange", placeSoon);
    window.addEventListener("load", function () { setTimeout(place, 400); });
    [300, 1200, 3000, 6000].forEach(function (ms) { setTimeout(place, ms); });
    if ("ResizeObserver" in window) { try { var ro = new ResizeObserver(placeSoon); document.querySelectorAll(BARS).forEach(function (el) { ro.observe(el); }); } catch (e) { /* fine */ } }
    sync();
  }
  window.arcArciaFab = { place: place };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
;
/* ---- i18n.js ---- */
// i18n.js — English / Korean / Simplified Chinese for every ARCIRCLE PAD page.
//
// The pages are written in English; this file swaps visible text for Korean
// or Chinese in place, and swaps it back. It works on text nodes and a few attributes
// (placeholder / title / aria-label), matching the exact English string or a
// pattern for strings with live numbers in them. A MutationObserver catches
// everything the page scripts render later (statuses, cards, tickers), so no
// page script needs to know about translation. Contract addresses, code and
// anything inside [data-no-i18n] are never touched.
//
// Choice is remembered per visitor (localStorage "arcircle.lang"); the first
// visit follows the browser language.
//
// The dictionaries live in i18n-ko.js and i18n-zh.js and are loaded only for the language in use
// (i18n-boot.js, first in every bundle, starts that download as early as it can). Until one
// arrives the page stays in English; then everything is translated in one pass and "arc:lang"
// fires so scripts that render their own text repaint.
(function () {
  "use strict";

  var ATTRS = ["placeholder", "title", "aria-label"];
  var SKIP = "script,style,noscript,code,textarea,[data-no-i18n],.ac2-ca-full,.ac2-ca-short";
  var KEY = "arcircle.lang";
  var DICT = {}, PAT = {};
  var started = false;
  var ver = (function () { var c = document.currentScript && document.currentScript.src; return (/[?&]v=(\d+)/.exec(c || "") || [])[1] || ""; })();
  function adopt(l) { var x = window.__arcDict && window.__arcDict[l]; if (x && !DICT[l]) { DICT[l] = x.d; PAT[l] = x.p; } return !!DICT[l]; }
  function need(l) {
    if (l === "en" || adopt(l)) return;
    var busy = window.__arcDictLoading || (window.__arcDictLoading = {});
    if (busy[l]) return;
    busy[l] = true;
    var s = document.createElement("script");
    s.src = "/i18n-" + l + ".js" + (ver ? "?v=" + ver : "");
    s.async = true;
    s.onerror = function () { busy[l] = false; };
    (document.head || document.documentElement).appendChild(s);
  }
  var LANGS = ["en", "ko", "zh"];
  var LABEL = { en: "EN", ko: "한", zh: "中" };
  var ARIA = { en: "English", ko: "한국어", zh: "简体中文" };
  // The whitepaper has its own English and Korean editions — no Chinese one.
  var noZh = /^\/whitepaper/.test(location.pathname);
  var lang = "en";
  try {
    var nav = (navigator.language || "").toLowerCase();
    lang = localStorage.getItem(KEY) || (nav.indexOf("ko") === 0 ? "ko" : nav.indexOf("zh") === 0 ? "zh" : "en");
  } catch (e) { /* default en */ }
  // ?lang=ko|zh|en in the address (used by the /ko/coin/ and /zh/coin/
  // pages' "Trade" links) picks the language and remembers it.
  var qLang = /[?&]lang=(en|ko|zh)(?:&|$)/.exec(location.search);
  if (qLang) { lang = qLang[1]; try { localStorage.setItem(KEY, lang); } catch (e) { /* fine */ } }
  if (LANGS.indexOf(lang) < 0 || (noZh && lang === "zh")) lang = "en";

  function translate(en, l) {
    l = l || lang;
    adopt(l);
    var d = DICT[l], pats = PAT[l];
    if (!d) return null;
    var t = en.replace(/\s+/g, " ").trim();
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(d, t)) return d[t];
    for (var i = 0; i < pats.length; i++) if (pats[i][0].test(t)) return t.replace(pats[i][0], pats[i][1]);
    return null;
  }
  function skip(el) { return !el || (el.closest && el.closest(SKIP)); }

  // Each text node remembers its English source (__en) and what we last put
  // there (__tr); anything else in it is fresh English from a page script.
  function doText(n) {
    if (skip(n.parentElement)) return;
    var cur = n.nodeValue;
    if (n.__tr != null && cur === n.__tr) return;
    n.__en = cur; n.__tr = null;
    if (lang === "en") return;
    var tr = translate(cur);
    if (tr == null) return;
    var lead = cur.match(/^\s*/)[0], trail = cur.match(/\s*$/)[0];
    n.__tr = lead + tr + trail;
    n.nodeValue = n.__tr;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    var store = el.__i18nAttr || (el.__i18nAttr = {});
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var v = el.getAttribute(a), s = store[a];
      if (s && s.tr != null && v === s.tr) return;
      store[a] = { en: v, tr: null };
      if (lang === "en") return;
      var tr = translate(v);
      if (tr != null) { store[a].tr = tr; el.setAttribute(a, tr); }
    });
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    if (root.hasAttribute && ATTRS.some(function (a) { return root.hasAttribute(a); })) doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else if (ATTRS.some(function (a) { return n.hasAttribute(a); })) doAttrs(n);
    }
  }
  function restoreAll() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.__tr != null && n.nodeValue === n.__tr) n.nodeValue = n.__en; n.__tr = null; }
      else if (n.__i18nAttr) {
        var st = n.__i18nAttr;
        Object.keys(st).forEach(function (a) { if (st[a].tr != null && n.getAttribute(a) === st[a].tr) n.setAttribute(a, st[a].en); st[a].tr = null; });
      }
    }
  }

  var paused = false;
  var observer = new MutationObserver(function (muts) {
    if (paused || lang === "en") return;
    paused = true;
    try {
      muts.forEach(function (m) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      });
    } finally { paused = false; }
  });

  function setLang(next, save) {
    lang = LANGS.indexOf(next) >= 0 && !(noZh && next === "zh") ? next : "en";
    if (save) { try { localStorage.setItem(KEY, lang); } catch (e) { /* fine */ } }
    var de = document.documentElement;
    de.lang = lang === "zh" ? "zh-CN" : lang;
    de.classList.toggle("lang-ko", lang === "ko");
    de.classList.toggle("lang-zh", lang === "zh");
    if (lang !== "en" && !adopt(lang)) need(lang); // translated when it arrives (_ready)
    paused = true;
    restoreAll();
    if (lang !== "en" && DICT[lang]) walk(document.body);
    paused = false;
    document.querySelectorAll(".lang-toggle [data-l]").forEach(function (b) {
      var on = b.getAttribute("data-l") === lang;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    try { document.dispatchEvent(new CustomEvent("arc:lang", { detail: { lang: lang } })); } catch (e) { /* old browser */ }
  }

  function mountToggle() {
    var host = document.querySelector(".bp-topbar-right") || document.querySelector("header.ax-top");
    if (!host || host.querySelector(".lang-toggle")) return;
    var g = document.createElement("div");
    g.className = "lang-toggle";
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", "Language");
    g.setAttribute("data-no-i18n", "");
    g.innerHTML = LANGS.filter(function (l) { return !(noZh && l === "zh"); }).map(function (l) {
      return '<button type="button" data-l="' + l + '" lang="' + (l === "zh" ? "zh-CN" : l) + '" aria-label="' + ARIA[l] + '" title="' + ARIA[l] + '">' + LABEL[l] + "</button>";
    }).join("");
    // On phones the group is compact (only the active language shows): tapping it opens the
    // other choices below, tapping one of those switches and closes it.
    g.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-l]");
      if (!b) return;
      if (b.classList.contains("on")) { g.classList.toggle("open"); return; }
      g.classList.remove("open");
      setLang(b.getAttribute("data-l"), true);
    });
    document.addEventListener("click", function (e) { if (!g.contains(e.target)) g.classList.remove("open"); });
    if (host.matches(".bp-topbar-right")) host.insertBefore(g, host.firstChild);
    else {
      var cta = host.querySelector(".ax-top-cta");
      var wrap = document.createElement("div");
      wrap.className = "ax-top-right";
      host.insertBefore(wrap, cta || null);
      wrap.appendChild(g);
      if (cta) wrap.appendChild(cta);
    }
  }

  function start() {
    started = true;
    mountToggle();
    setLang(lang, false);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  window.arcI18n = { set: function (l) { setLang(l, true); }, get: function () { return lang; }, translate: function (s, l) { return translate(s, l); },
    // i18n-ko.js / i18n-zh.js call this when they arrive
    _ready: function (l) { adopt(l); if (started && l === lang) setLang(lang, false); } };
  need(lang);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
;
