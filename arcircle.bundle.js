/* arcircle.bundle.js — built by tools/build-bundles.mjs from: i18n-boot.js, config-arc.js, arc-fmt.js, arc-fx.js, arc-token.js, arcircle-page.js, arcircle-plus.js, arc-motion.js, arc-footer.js, arcircle-hub.js, arc-social.js, arc-burnvote-chip.js, arc-cmdk.js, arc-nav.js, arc-connect.js, arc-v9.js, arc-v10.js, arc-v12.js, arc-feel.js, arc-chrome.js, arc-a11y.js, arc-glyph.js, arc-arcia-fab.js, i18n.js. Do not edit; edit the sources. src:d15ab01962736959 */
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
  // Later rounds' governance and rules (circlepad-boot.js switches the page to the newest round). A round's
  // vote goes live once its BigPadVote (vote) and ArcircleBurnVote (burnvote) are filled in, or at once with
  // mode: "direct" (no vote contracts: the round wallet signs its candidates, votes are coded transfers to
  // 0x…dEaD — api/_burnvote.mjs) — keep api/_burnvote.mjs GOV in step. top: the largest contributor receives the 15% over 3 days (true / false / null = not decided);
  // airdrop: the contributor airdrop's text, or "" = not decided.
  CIRCLEPAD_GOV: {
    2: { mode: "direct", top: true, airdrop: "" },
    // Round #2 merged into Round #3 (3 Oct 2026). chain: a sixth category, the launch chain — these choices go
    // through the free pre-vote, then the round wallet publishes them (keep api/_burnvote.mjs GOV[3].chain the same).
    // 4 Oct 2026: Round #3 launches no new coin (the $TIE plan was dropped). The raise buys $ARCIA on Robinhood Chain for
    // its contributors, who also get an allocation of Round #4's Solana token. mode "plan": no vote on the page (the
    // burn-to-vote closed — api/_burnvote.mjs GOV[3].closedAt — and its record stays), circlepad-plan.js shows the plan.
    3: { mode: "plan", top: null, closedAt: 1791072000, accent: "#ff8bd8", // circlepad-v5.js: the round's accent ($ARCIA pink)
      // 5 Oct 2026: Round #3 and Round #4 are merged. Round #4 is ARCIRCLE's move to Solana through pump.fun with
      // ARCIRCLE Orders: no separate 3-day raise — the ARCIRCLE team runs it on Solana with ARCIRCLE Orders, and everyone
      // in Round #3 (now or before the close) is in it automatically. also.merged switches the copy (circlepad-plan.js,
      // circlepad-boot.js).
      // 6 Oct 2026: Round #3 + #4's rewards go out as a snapshot airdrop; more updates follow (snapshot: true)
      airdrop: "Round #3 and Round #4 are merged, so one contribution earns two rewards, each pro rata to your share of the raise: $ARCIA on Robinhood Chain, bought with the raise, and your share of Round #4 on Solana — launched through pump.fun by the ARCIRCLE team with ARCIRCLE Orders. Both go out as a snapshot airdrop to the contributor list, with more updates to follow. Round #2's 1,999.62 USDC went into this round, so Round #2's contributors are included from Round #2's list.",
      plan: { buy: { sym: "ARCIA", chain: "Robinhood Chain", token: "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25", url: "https://www.ponsfamily.com/launchpad/0xf0c0fc281314a48ae4e52a9db08731cb6a38ca25" },
        also: { round: 4, chain: "Solana", sym: "TBA", merged: true, via: "pump.fun", with: "ARCIRCLE Orders", mergedAt: "5 Oct 2026", snapshot: true } } },
  },
  // Round numbers with no escrow of their own (api/_rounds.mjs SKIPPED — keep the same): Round #4 went into Round #3,
  // so the round after #3 is #5. Projects shows a short "merged" card in its place.
  CIRCLEPAD_SKIPPED: { 4: 3 },
  // 7 Oct 2026: what CirclePad says about its rounds everywhere outside /circle (the main page's button, round card and
  // live bar, ArcPad's $ARCIRCLE card and roadmap, ARCIA): Round #2 postponed, Rounds #3 + #4 being merged. Set to null
  // when a round is live again — the pages then follow the round's own state.
  // 10 Oct 2026: Round #5 is live — ArcPad launches on Robinhood Chain, 4% of every coin to veARCIRCLE automatically
  // (the Launch Drop). Rounds #3 + #4: a snapshot airdrop once $ARCIA's utilities are upgraded.
  CIRCLEPAD_STATUS: {
    btn: "CirclePad · Round #5 is live",
    line: "Round #5 live: launch on ArcPad · Robinhood Chain — 4% of every coin to veARCIRCLE · Rounds #3 + #4: $ARCIA airdrop after its utility upgrade",
    chip: "Round #5",
    sub: "live",
    go: "Launch on Robinhood Chain →",
    href: "/arc#launch",
    live: true, // the home button gets its live dot
  },
  // v8: the delivery board under a plan round's hero (circlepad-plan.js) — what the team has done after the close.
  // Each step: status "" (waiting) | "now" (in progress) | "done", and txs: [{ chain: "rh" | "sol" | "arc", hash, label }].
  CIRCLEPAD_DELIVERY: {
    // 6 Oct 2026: Round #3 + #4 go out as a snapshot airdrop, then more updates
    3: {
      snap: { status: "", txs: [] }, // the snapshot: who is in, by share of the raise
      drop: { status: "", txs: [] }, // the snapshot airdrop ($ARCIA on Robinhood Chain + the Round #4 share)
      more: { status: "", txs: [] }, // the updates that follow (Round #4 on Solana)
    },
  },
  // Each closed round's coin, for the Projects results strip (circlepad-v5.js): sym, chain ("arc" | "rh"), token;
  // { merged: n } for a round that went into another one; retired: true for a coin that isn't official any more
  // (no address, no market, no trade link).
  // Coins kept off ArcPad's lists — Explore, Home (King of the Hill, Trending), the ticker: ♾️ Infinite, the test coin
  // retired on 5 Oct 2026. Keep api/_argus-arcpad.mjs HIDDEN in step.
  HIDDEN_COINS: ["0x2a15940316335bfb711db7cba98d637396e80c08"],
  CIRCLEPAD_RESULTS: {
    1: { sym: "ARCIA", chain: "arc", retired: true }, // the old $ARCIA on Arc — retired on 5 Oct 2026
    2: { merged: 3 },
    3: { sym: "ARCIA", chain: "rh", token: "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25" },
  },
  // Optional, shown on /circle (circlepad-plus.js):
  //   CIRCLEPAD_OPENS_AT — the announced opening time (unix seconds): an
  //     "opens in" countdown and a calendar file before start(); 0 = not announced
  //   CIRCLEPAD_ESCROW_VERIFIED — true once the escrow's source is verified on the explorer
  //   CIRCLEPAD_ALLOCATION_NOTE — how the new coin is shared with contributors
  //     (shown in the "after the close" questions; empty = "not decided yet")
  CIRCLEPAD_OPENS_AT: 0,
  CIRCLEPAD_ESCROW_VERIFIED: false,
  // Round escrows whose source shows on ArcScan (checked 4 Oct 2026: Round #2 exact match, Round #3 similar match to
  // Round #2 — the same code). circlepad-v5.js uses this when the live explorer check doesn't answer.
  CIRCLEPAD_VERIFIED_ESCROWS: ["0xb87c5aa6c6ced8afb4ab6785ab419718f296c8c3", "0x9a93e6ca15c48b379e8dad7b03e83724c1d2e1e4"],
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
  // ArcLock on Robinhood Chain (the Locker's Arc | Robinhood switch): the same contract, deployed there with
  // deploy-arc-lock.js --network robinhoodMainnet. Empty: Robinhood Chain shows as "opening soon" (tokens can be
  // looked up, nothing can be locked). Keep api/_locker.mjs ARCLOCK_RH_DEFAULT in step.
  ARCLOCK_RH_ADDRESS: "0x301E1e8dcB43cDddD3244889063aD4220536b38A", // ArcLock on Robinhood Chain (2026-10-02)
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
  // The Multisender on Robinhood Chain (the page's Arc | Robinhood Chain switch): ArcMultiSendV2 deployed there with
  // deploy-arc-multisend-v2.js --network robinhoodMainnet — ETH and any ERC-20 or NFT. Empty: Robinhood Chain shows
  // as "opening soon" (a list can be loaded and checked, not sent).
  MULTISEND_RH_ADDRESS: "0x07Ec525DC675206618C3e5E7fd92C7C0707df6C4", // ArcMultiSendV2 on Robinhood Chain (2026-10-01)
  // ARCIRCLE Orders (contracts/contracts/ArcircleOrders.sol, arc-orders.js), deployed on Arc 2026-10-02 (block 23739979).
  // Its fees go to ArcircleFeeBurn 0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034. Keep api/_orders.mjs CFG in step.
  ORDERS_ADDRESS: "0x1A31C2539d6e3fBdF276E8D74bA67aEc4De9008e",
  // ARCIRCLE Staking (veARCIRCLE, contracts/ArcircleStaking.sol): "" until deployed — the page itself reads the
  // address from /api/desk?stake=state (api/_stake.mjs STAKING_DEFAULT / env STAKING_ADDRESS); this one is for the footer.
  STAKING_ADDRESS: "0x301E1e8dcB43cDddD3244889063aD4220536b38A",
  // Launch Drop vault (contracts/ArcLaunchDrop.sol, scripts/deploy-arc-launch-drop.js): every ArcPad coin's 4% →
  // veARCIRCLE holders, claimed or pushed. Deployed 2026-10-09 (block 25056550). The Staking page reads the vault
  // through /api/desk?stake=drop (api/_launchdrop.mjs LAUNCHDROP_DEFAULT / env LAUNCHDROP_ADDRESS) — keep them in step.
  LAUNCHDROP_ADDRESS: "0x0921638A292Bd7Dfd001Ed62367cF8B6f0F7d613",
  // ARCIRCLE Swap (contracts/ArcircleSwap.sol, arc-swap.js): any Arc token with a Uniswap v4 pool, paid with $ARCIRCLE,
  // USDC or any token, routed through up to three pools in one transaction. Its fee (SWAP_FEE_BPS, fixed in the contract)
  // goes to ArcircleFeeBurn below. Live since 10 Oct 2026 (contracts/scripts/deploy-arcircle-swap.js); with "" the page
  // quotes the same routes through ARCIRCLE Orders as a preview and the Swap button stays off.
  SWAP_ADDRESS: "0x305Da1b305249072b13B73ab394E02046c865d56", // deployed 2026-10-10 (block 25150057)
  SWAP_FROM_BLOCK: 25150057, // Activity reads Swapped events from here
  // Quantum Launch (contracts/QuantumLaunch.sol — QuantumPad + one QuantumBatch per launch; arc-quantum.js, arcpad.html
  // #quantum): a coin is announced, USDC is committed for a window, then one transaction launches it on ArcPad and
  // buys with everything committed — everyone at the same price, nobody ahead. Empty until it's deployed
  // (scripts/deploy-quantum-launch.js); the launch form then offers "Quantum Launch". Keep api/tg-launch.mjs
  // (QUANTUM_PAD) in step.
  QUANTUM_PAD_ADDRESS: "0x9EBFB3A7724ecE9cE3f0df62532471d532223Fd2", // deployed + verified 2026-10-10 (block 25222590)
  QUANTUM_FROM_BLOCK: 25222590,
  SWAP_FEE_BPS: 10,
  ARCIRCLE_FEEBURN: "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034", // ArcircleFeeBurn: 50% of fees burned as $ARCIRCLE, 50% treasury
  ORDERS_PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3", // Uniswap's Permit2: makers can allow ARCIRCLE Orders with a signature
  ORDERS_FREE_HOLD: 100000, // $ARCIRCLE held for fee-free orders (shown before the contract is live; ArcircleFeeBurn.discountMin decides)
  // ARCIRCLE Orders on Robinhood Chain (ArcircleOrdersNative + ArcircleFeeBurnNative, contracts/scripts/deploy-arcircle-orders-rh.js):
  // live since 4 Oct 2026 (block 79560003); Uniswap's Permit2 is on Robinhood Chain too.
  ORDERS_RH_ADDRESS: "0xa53dBd06d8c604107e1Fe1B5936EFCf32D895eE3",
  ORDERS_RH_FEEBURN: "0x88bE9A0E1B13f5A10Bf155e052CB0327fd6C88D1",
  ORDERS_RH_PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  ORDERS_RH_WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  ARCIA_RH_TOKEN: "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25", // $ARCIA on Robinhood Chain (Pons): the market Orders opens there
  // veARCIA (contracts/ArciaStaking.sol on Robinhood Chain, arc-vearcia.js, api/_vearcia.mjs): "" until deployed — the page
  // previews the numbers and checks the $ARCIRCLE boost with its buttons off. Keep api/_vearcia.mjs VEARCIA_DEFAULT in step.
  VEARCIA_ADDRESS: "0x29C010620f6720582c310aFa8D8115026eC73a7e", // deployed 2026-10-04, block 79655827
  // ARCIA WORKS (contracts/ArciaWorks.sol on Arc, arc-works.js, api/_works.mjs): agents hiring agents, USDC escrow.
  // "" until contracts/scripts/deploy-arcia-works.js runs — the page shows the market, the listings and the agent skills
  // with its buttons off. Keep api/_works.mjs WORKS_DEFAULT in step.
  WORKS_ADDRESS: "",

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
  // ArcPad × Pons (arc-pons.js, api/_pons-arcpad.mjs): a coin launched on Pons V2 (Robinhood Chain) from the creator's
  // own wallet, its creatorFeeRecipient set to the creator's ArcPadPonsSplitter (contracts/contracts/ArcPadPonsSplits.sol):
  // 70% the creator, 30% the ARCIRCLE PAD treasury, for the life of the coin. With SPLITS empty the Pons option
  // shows "Being set up" and can't launch. Keep api/_pons-arcpad.mjs in step.
  PONS: {
    FACTORY: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e", // PonsV2LaunchFactory (pons-labs README, verified)
    FEE_ESCROW: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e",
    SPLITS: "0x41149F8ce23d9B4E737e51C97fFE14bBb4C09ce6", // ArcPadPonsSplits (contracts/scripts/deploy-arcpad-pons-splits.js, block 77341424)
    TREASURY: "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8", // the same ARCIRCLE PAD treasury as Argus
    PLATFORM_BPS: 3000,
    CHAIN_ID: 4663,
    RPC: "https://rpc.mainnet.chain.robinhood.com",
    EXPLORER: "https://robinhoodchain.blockscout.com",
    APP: "https://www.ponsfamily.com/launchpad", // a coin's page: APP + "/" + token
    SUPPORT: { DEX_INFO_MCAP: 20000, MARKETING_MCAP: 100000 }, // the same ArcPad support policy as Argus
  },
  // ArcPad's own launches on Robinhood Chain (arc-arcpad-rh.js, api/_arcpad-rh.mjs, contracts/ArcPadFactoryRH.sol +
  // ArcPadRouterRH.sol): an ETH-paired Uniswap v4 pool from the first block, the same 8% platform allocation and fee
  // split as ArcPad on Arc, a launch fee of about $1 in ETH (contracts/scripts/deploy-arcpad-rh.js, 10 Oct 2026). Empty
  // FACTORY shows Robinhood Chain as "soon". Keep in step with api/_arcpad-rh.mjs and api/_launchdrop-rh.mjs defaults.
  ARCPAD_RH: {
    FACTORY: "0x1446Af2D4b86cf31a96bDe8173c2bC39C8a2EEAf", // ArcPadFactoryRH (deploy-arcpad-rh.js, block 84421705, launch fee 0.0004 ETH)
    ROUTER: "0x0ab746332B5b85091b62cBC6F1Ce90F1557465B3", // ArcPadRouterRH
    HOOK: "0xD49D2D593FCf79651E2db7f554D4E13f434e8044", // its HomepadHybridHook
    DROP: "0x8e67b75b4B91c5c95c4562F99980371e4f466daA", // ArcLaunchDropRH (the merkle vault for the veARCIRCLE Launch Drop on Robinhood Chain; root poster: the treasury)
    CHAIN_ID: 4663,
    RPC: "https://rpc.mainnet.chain.robinhood.com",
    EXPLORER: "https://robinhoodchain.blockscout.com",
    VIRTUAL_USD: 4000, // the opening reserve, in dollars of ETH — the same starting market cap as on Arc
  },
  // ARCIRCLE NFT Vault (arc-nft.js, api/_nft.mjs, contracts/ArcircleNft.sol) on Robinhood Chain: a coin's Pons creator fees
  // go to ROUTER (50% the vault, 50% the treasury); the vault buys NFTs and raffles them to $ARCIRCLE holders. The page
  // reads the live addresses from /api/desk?nft=state; ROUTER here is for the Pons launch option, offered only to the
  // team wallets in LAUNCHERS. Deployed 2026-10-03 (contracts/scripts/deploy-arcircle-nft.js).
  NFT: {
    VAULT: "0x2eE3ae4140A08930Dc9cEde5cde86f3bC906c304", // ArcircleNftVault (block 78683625)
    ROUTER: "0x95B56477722dF40021797121f2faDe759dc88f65", // ArcircleNftRouter — a team Pons launch names it as the fee recipient
    LAUNCHERS: ["0x809E486817ADcBdF244060f4C8C24B4c694AF749"],
    CHAIN_ID: 4663,
    RPC: "https://rpc.mainnet.chain.robinhood.com",
    EXPLORER: "https://robinhoodchain.blockscout.com",
  },
  // ArcPad × Pump.fun (arc-pump.js, api/_pump-arcpad.mjs, the kit in tools/pump-kit → vendor/pump-kit.js): an ordinary
  // Pump.fun coin launched from the creator's own Solana wallet, its creator fees shared through Pump's own fee-sharing
  // program — 70% the creator, 30% the ARCIRCLE PAD treasury — and the split locked for good in the same signing
  // (update_fee_shares_v2 revokes the config's admin). With TREASURY empty the Pump.fun option would show "Being set up"
  // and can't launch. Keep api/_pump-arcpad.mjs CFG.treasury (or Vercel env PUMP_TREASURY) in step.
  PUMP: {
    TREASURY: "DHu2grfJTNV9ipJWkfLXiRR6yLWQWvg4aVDcZJTERmLR", // ARCIRCLE PAD's Solana wallet (base58) — receives 30% of every ArcPad Pump.fun coin's creator fees
    PLATFORM_BPS: 3000,
    RPC: "/api/social?solrpc=1", // the Solana JSON-RPC relay (env SOLANA_RPC_URL on the server picks the node)
    KIT: "/vendor/pump-kit.js?v=6c17cca6da",
    APP: "https://pump.fun/coin", // a coin's page: APP + "/" + mint
    EXPLORER: "https://solscan.io",
    SUPPORT: { DEX_INFO_MCAP: 20000, MARKETING_MCAP: 100000 }, // the same ArcPad support policy as Argus and Pons
  },
  // ARCIRCLE Orders on Solana (arc-orders-sol.js, api/_orders-sol.mjs, the program in solana/arcircle-orders): limit
  // orders that stay in the owner's Solana wallet until the keeper fills them through Jupiter, and market swaps. With
  // PROGRAM empty the Solana side is a preview. Keep api/_orders-sol.mjs CFG.program (or Vercel env ORDERS_SOL_PROGRAM)
  // in step.
  ORDERS_SOL: {
    PROGRAM: "", // the program id (base58)
    EXPLORER: "https://solscan.io",
  },
  // ARCIRCLE OMNI — $ARCIRCLE on Arc, Robinhood Chain and Solana through LayerZero V2 (omni/README.md).
  // Arc keeps the one canonical token; the adapter locks it, the other chains mint/burn. Empty addresses
  // keep the OMNI page in preview for that chain. Keep api/_omni.mjs in step.
  OMNI: {
    ADAPTER: "0x075e5DC585efFe0bfdC1a0d452499Ce7AFe2faB6", // Arc · ArcircleOFTAdapter (the lockbox)
    ROBINHOOD_OFT: "0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4", // Robinhood Chain · ArcircleOFT
    // the official $ARCIRCLE/ETH pool on Robinhood Chain (Uniswap v4, pool id) — new, liquidity still small
    ROBINHOOD_POOL: "0x1bbed8ae8485bd75d46c3bdb830d47aca49b6ccb4fad57e6263903d0c1f10a50",
    SOLANA_MINT: "", // Solana · SPL mint from the OFT program
    SOLANA_OFT_STORE: "",
    SAFE: "0xA4101562b2C6fd5e422A0F78B2fE166dF84A48Fd", // owner Safe 2-of-3 (same address on Arc and Robinhood Chain)
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
  var WATCH = '[data-ac2="price"],[data-ac2="mcap"],[data-arl="price"],[data-arl="mcap"],#apc-price,#apc-mcap,.ap-launch-card .meta span:first-child,[data-tk="price"],[data-hm-price]';
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
    var r = el.getBoundingClientRect(); // off screen (or hidden): nothing to see
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
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
      if (!c.open) return "Round #1: " + usd(c.raised) + " raised · " + usd(c.share) + " to the platform · " + ((typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_STATUS && CONFIG.CIRCLEPAD_STATUS.line) || "Round #2 next");
      return "Round #1: " + usd(c.raised) + " raised · " + usd(c.share) + " at close";
    }
    if (id === "util") return d.burned && d.burned.bySource ? (function (b) { var t = ["scanner", "mine", "secret", "desk", "agent", "orders"].reduce(function (x, k) { return x + (b[k] ? b[k].tokens : 0); }, 0); return t > 0 ? num(t) + " $ARCIRCLE burned by utilities so far" : ""; })(d.burned.bySource) : "";
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
/* ---- arcircle-page.js ---- */
// arcircle-page.js — the live parts of the $ARCIRCLE page (arcircle.html):
//   • stats row, 7-day line, graduation ring, buybacks, supply donut — all
//     from arcToken (arc-token.js), refreshed every 30 seconds
//   • flywheel: particles run along the ring and steps 1→4 light up in turn,
//     in sync with the step cards (hover or tap a card to hold it)
//   • hero coin: tilts toward the pointer, and its rim glows green / red when
//     the price ticks up / down
//   • revenue list + flow into "Where it goes" (shared with the Reward page)
(function () {
  "use strict";
  if (!document.body.classList.contains("ax-token") || document.body.classList.contains("ax-reward-page")) return;
  var T = window.arcToken;
  if (!T) return;
  var F = T.fmt;
  var reduce = T.reduce;
  function all(k) { return document.querySelectorAll('[data-tk="' + k + '"]'); }
  function setText(k, v) { Array.prototype.forEach.call(all(k), function (el) { if (el.textContent !== v) el.textContent = v; }); }
  function setHtml(k, v) { Array.prototype.forEach.call(all(k), function (el) { if (el.__html !== v) { el.innerHTML = v; el.__html = v; } }); }

  // ---------- live numbers ----------
  var lastPrice = null, ringShown = false, lastData = null;
  function paint(d) {
    lastData = d;
    if (d.live === false || !T.live) return; // not live (relaunching): the page shows its "Not live" markup
    var indexing = d.complete === false;
    setText("price", F.price(d.price));
    setText("mcap", F.usd(d.mcap));
    Array.prototype.forEach.call(all("change"), function (el) {
      var c = indexing ? null : d.change24h;
      el.textContent = c == null ? "" : (c >= 0 ? "▲ " : "▼ ") + Math.abs(c).toFixed(Math.abs(c) < 10 ? 2 : 1) + "% 24h";
      el.className = "ax-chg " + (c == null ? "" : c >= 0 ? "up" : "down");
    });
    // While the server is still reading the history for the first time the
    // history-based numbers would be partial: show them as pending instead.
    if (indexing || d.partial) {
      setText("vol", "…"); setText("trades", indexing ? "Indexing…" : "");
      setText("holders", "…"); setText("holders-sub", indexing ? "Indexing…" : "");
    } else {
      setText("vol", F.usd(d.vol24h));
      setText("trades", d.trades24h + (d.trades24h === 1 ? " trade" : " trades"));
      Array.prototype.forEach.call(all("holders"), function (el) { T.countTo(el, d.holders, function (v) { return Math.round(v).toLocaleString("en-US"); }); });
      setText("holders-sub", "On-chain");
    }
    if (d.venue === "pool") {
      setText("liq-usd", d.liquidity != null ? F.usd(d.liquidity) : "—");
      if (d.launchedAt) setText("since", new Date(d.launchedAt * 1000).toISOString().slice(0, 10));
      setText("argus-tax", F.tax(d));
      setText("argus-bond", F.bond(d));
    }
    setText("togo", d.graduated ? "Graduated" : F.usd(d.toGraduate, true));
    setText("liq", F.usd(d.liquidity, true) + " USDC");
    setText("thr", F.usd(d.threshold, true) + " USDC");
    var pct = d.graduated ? 100 : d.progress || 0;
    Array.prototype.forEach.call(all("bar"), function (el) { el.style.width = Math.max(pct, 0.8) + "%"; });
    setText("pct", pct.toFixed(pct < 10 ? 2 : 1) + "%");
    if (ringShown) fillRing(pct);
    // coin rim: green / red on a price tick
    if (lastPrice != null && d.price != null && d.price !== lastPrice) pulseCoin(d.price > lastPrice ? "up" : "down");
    lastPrice = d.price;
    if (d.partial || indexing) return; // only the curve fallback answered / history still loading
    paintBurn(d);
    paintSpark(d);
    paintBuybacks(d);
    paintSupply(d);
  }
  // burned supply (dead address) — the page ships the known burn, the API keeps it current
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dateText(ts) { var t = new Date(ts * 1000); return t.getUTCDate() + " " + MON[t.getUTCMonth()] + " " + t.getUTCFullYear(); }
  function paintBurn(d) {
    var b = d.burned;
    if (!b || !(b.tokens > 0)) return;
    var pct = b.pct.toFixed(2) + "%";
    setText("burned-pct", pct);
    setText("burned-short", F.num(b.tokens) + " $ARCIRCLE");
    setText("burned-full", b.tokens.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText("circulating", b.circulating.toLocaleString("en-US"));
    Array.prototype.forEach.call(all("burned-bar"), function (el) { el.style.width = Math.min(100, b.pct) + "%"; });
    if (b.list && b.list.length) setHtml("burn-list", b.list.slice(0, 6).map(function (x) {
      return '<a href="' + F.explorer("tx", x.tx) + '" target="_blank" rel="noopener"><span class="ax-burn-tag">Burn</span><b data-no-i18n>' + F.num(x.tokens) + "</b><span>" + x.pct.toFixed(2) + "%</span><time>" +
        (x.ts ? dateText(x.ts) : "") + '</time><span aria-hidden="true">↗</span></a>';
    }).join(""));
  }
  function paintSpark(d) {
    var box = document.querySelector('[data-tk="spark"]');
    if (!box) return;
    var svg = T.spark(d.spark, { w: 320, h: 96, label: "$ARCIRCLE price over the last 7 days" });
    if (!svg) { setHtml("spark", '<p class="ax-spark-empty">Not enough trades yet for a 7-day line.</p>'); return; }
    if (box.__svg !== svg) {
      var first = !box.__svg;
      box.innerHTML = svg; box.__svg = svg; box.__html = svg;
      if (first && !reduce) {
        var s = box.querySelector("svg");
        T.onVisible(box, function () { s.classList.add("draw"); });
      } else box.querySelector("svg").classList.add("drawn");
    }
  }
  function paintBuybacks(d) {
    var b = d.buybacks;
    if (!b) return;
    setText("bb-n", String(b.n));
    setText("bb-usdc", F.usd(b.usdc));
    setText("bb-tok", F.num(b.tokens));
    var html = b.list.length
      ? b.list.slice(0, 8).map(function (x) {
        return '<a href="' + F.explorer("tx", x.tx) + '" target="_blank" rel="noopener"><span class="ax-bb-type">Buy</span><b>' + F.usd(x.usdc) + "</b><span>" + F.num(x.tokens) + " $ARCIRCLE</span><time>" + F.ago(x.ts) + '</time><span class="ax-bb-tx" aria-hidden="true">↗</span></a>';
      }).join("")
      : '<p class="ax-bb-empty">' + (d.complete === false ? "Checking every trade since launch…" : "No buybacks yet. The roadmap puts the first treasury buybacks in Phase 1 (Q4 2026) — each one will appear here automatically, with its transaction.") + "</p>";
    setHtml("bb-list", html);
    var w = (d.treasury && d.treasury.wallets) || [];
    setHtml("bb-wallets", w.length ? "Tracked: " + w.map(function (x) {
      return F.esc(x.label) + ' <a href="' + F.explorer("address", x.address) + '" target="_blank" rel="noopener" data-no-i18n>' + F.short(x.address) + " ↗</a>";
    }).join(" · ") : "");
  }
  var SPLIT = [["curve", "Bonding curve", "#35d8d0"], ["treasury", "Treasury", "#39ff88"], ["top10", "Top 10 holders", "#4d9fff"], ["others", "Everyone else", "#ffc861"], ["burned", "Burned", "#ff7a45"]];
  function paintSupply(d) {
    if (!d.split) return;
    SPLIT[0][1] = d.venue === "pool" ? "In the pool" : "Bonding curve";
    var parts = SPLIT.map(function (s) { return { v: d.split[s[0]] || 0, label: s[1], color: s[2] }; });
    var svg = T.donut(parts, { center: "1B", sub: "total supply", label: "Where the $ARCIRCLE supply sits" });
    var box = document.querySelector('[data-tk="donut"]');
    if (box && box.__svg !== svg) {
      var first = !box.__svg;
      box.innerHTML = svg; box.__svg = svg;
      if (first && !reduce) { var s = box.querySelector("svg"); T.onVisible(box, function () { s.classList.add("spin-in"); }); }
      else box.querySelector("svg").classList.add("shown");
    }
    setHtml("legend", SPLIT.map(function (s) {
      var v = d.split[s[0]] || 0;
      return '<li style="--c:' + s[2] + '"><span>' + s[1] + "</span><b>" + (v / 1e7).toFixed(v / 1e7 < 10 || s[0] === "burned" ? 2 : 1) + "%</b></li>";
    }).join(""));
  }
  function fillRing(pct) {
    var arc = document.querySelector(".ax-grad-arc");
    if (arc) arc.setAttribute("stroke-dasharray", Math.max(0.6, Math.min(100, pct)).toFixed(2) + " 100");
  }
  T.onVisible(document.getElementById("graduation"), function () {
    ringShown = true;
    if (lastData) fillRing(lastData.graduated ? 100 : lastData.progress || 0);
  });

  // ---------- hero coin ----------
  var coin = document.querySelector(".ax-coin[data-tilt]");
  function pulseCoin(dir) {
    if (!coin || reduce) return;
    coin.classList.remove("tick-up", "tick-down"); void coin.offsetWidth;
    coin.classList.add(dir === "up" ? "tick-up" : "tick-down");
    clearTimeout(coin.__t);
    coin.__t = setTimeout(function () { coin.classList.remove("tick-up", "tick-down"); }, 1400);
  }
  if (coin && !reduce && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var hero = coin.closest("section") || coin;
    var raf = 0, tx = 0, ty = 0;
    hero.addEventListener("pointermove", function (e) {
      var r = coin.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.9)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        coin.style.setProperty("--rx", (-ty * 10).toFixed(2) + "deg");
        coin.style.setProperty("--ry", (tx * 12).toFixed(2) + "deg");
        coin.style.setProperty("--gx", (50 + tx * 30).toFixed(1) + "%");
        coin.style.setProperty("--gy", (50 + ty * 30).toFixed(1) + "%");
      });
    });
    hero.addEventListener("pointerleave", function () {
      coin.style.setProperty("--rx", "0deg"); coin.style.setProperty("--ry", "0deg");
    });
  }

  // ---------- flywheel sync ----------
  var fly = document.getElementById("flywheel");
  if (fly) {
    var nodes = fly.querySelectorAll(".ax-fly-node"), steps = fly.querySelectorAll(".ax-step");
    var cur = 0, hold = false, timer = 0, on = false;
    var show = function (n) {
      cur = n;
      Array.prototype.forEach.call(nodes, function (g) { g.classList.toggle("on", Number(g.getAttribute("data-step")) === n); });
      Array.prototype.forEach.call(steps, function (li) { li.classList.toggle("on", Number(li.getAttribute("data-step")) === n); });
    };
    var cycle = function () {
      clearTimeout(timer);
      if (!on || hold || document.hidden) return;
      show(cur % 4 + 1);
      timer = setTimeout(cycle, 2600);
    };
    Array.prototype.forEach.call(steps, function (li) {
      var n = Number(li.getAttribute("data-step"));
      li.addEventListener("pointerenter", function () { hold = true; clearTimeout(timer); show(n); });
      li.addEventListener("pointerleave", function () { hold = false; timer = setTimeout(cycle, 1600); });
      li.addEventListener("click", function () { show(n); });
    });
    if (!reduce && "IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        on = ents.some(function (e) { return e.isIntersecting; });
        if (on) { fly.classList.add("fly-live"); cycle(); } else clearTimeout(timer);
      }, { threshold: 0.25 }).observe(fly);
    }
  }

  // ---------- revenue ----------
  var rev = document.querySelector("#revenue .ax-rev");
  if (rev) { T.mountRevenue(rev.querySelector("[data-rev-list]")); T.mountFlow(rev); }

  T.subscribe(paint);
})();
;
/* ---- arcircle-plus.js ---- */
/* global CONFIG */
// arcircle-plus.js — the $ARCIRCLE page's live extras, on top of arcircle-page.js (same data from
// arc-token.js, /api/social?token=arcircle): what each use has burned, burns labeled by source, a 24h / 7d
// price chart with a crosshair, buy/sell pressure and the latest trades, top holders, safety at a glance,
// "Add to wallet", a wallet's own $ARCIRCLE (holding, unlocks, burns), the family's $ARCIA price, a sticky
// section nav, the hero's burn ring, and the flywheel reacting to new burns and launches.
(function () {
  "use strict";
  if (!document.getElementById("uses")) return;
  const $ = (id) => document.getElementById(id);
  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => window.arcToken;
  const CA = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const EXPLORER = "https://arc.etherscan.io";
  const SUPPLY = 1e9;
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toLocaleString("en-US"));
  const usd = (n) => (T() ? T().fmt.usd(n) : "$" + Number(n || 0).toFixed(2));
  const price = (n) => (n == null ? "—" : T() && T().fmt.price ? T().fmt.price(n) : "$" + Number(n).toPrecision(3));
  const ago = (ts) => (T() && T().fmt.ago ? T().fmt.ago(ts) : "");
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
  const KIND = {
    vote: ["Burn-to-vote", "#39ff88"], mine: ["Builder Mine", "#ffc861"], scanner: ["Token Scanner", "#4d9fff"], secret: ["ARCIA's secret file", "#ff8fc7"],
    desk: ["ARCIA DESK", "#b58bff"], agent: ["ARCIA AGENT vaults", "#5b8cff"], orders: ["Orders & Predict fees", "#4dd4ff"], omni: ["OMNI rewards", "#e46bff"], buyback: ["Buyback", "#35d8d0"], team: ["Team & treasury", "#dfe8f1"], wallet: ["Direct burn", "#ff8a4c"], pending: ["Burn", "#ff8a4c"],
  };
  const kind = (k) => KIND[k] || KIND.pending;
  // wallets people will recognize in the top-holder list
  const LABELS = {
    "0x1a35a754a4251e46971184046ac57e8ad621672e": "CirclePad round wallet",
    "0xc30f1694203f4fc671ec769b90149e67ce3a1f03": "ARCIA DESK",
    "0x1538c76917de5911d71c5c397ff18ca09d52b019": "Builder Mine",
    "0x54121a7894d90a02ea973ab45eef424c2716eeb2": "CirclePad burn vote",
    "0xdbc9bb465c52688c0af75e002caaa43d731b8562": "ARCIA 402 wallet",
    "0x075e5dc585effe0bfdc1a0d452499ce7afe2fab6": "OMNI lockbox (bridged to Robinhood)",
    "0xa4101562b2c6fd5e422a0f78b2fe166df84a48fd": "OMNI Safe",
  };

  // ================= uses: what each one has burned =================
  function paintUses(b) {
    const by = (b && b.bySource) || {};
    qa(".ac-use[data-use]").forEach((el) => {
      const u = el.getAttribute("data-use"), n = q(".ac-use-n", el);
      if (u === "relay") return;
      if (u === "engine") { const t = ["scanner", "mine", "secret", "desk", "agent", "orders", "omni"].reduce((s, k) => s + (by[k] ? by[k].tokens : 0), 0); n.textContent = t > 0 ? num(t) + " " + tr("burned by utilities so far") : ""; return; }
      const o = by[u];
      n.textContent = o && o.tokens > 0 ? num(o.tokens) + " " + tr("burned") + " · " + o.n.toLocaleString("en-US") + " " + tr(o.n === 1 ? "time" : "times") : "";
    });
  }
  // the burn list, labeled by where each burn came from (arcircle-page.js draws it first; this relabels it)
  function paintBurnList(b) {
    const box = q('[data-tk="burn-list"]');
    if (!box || !b || !b.list || !b.list.length) return;
    box.innerHTML = b.list.slice(0, 6).map((x) => {
      const K = kind(x.kind);
      return `<a href="${EXPLORER}/tx/${esc(x.tx)}" target="_blank" rel="noopener" style="--acc:${K[1]}"><span class="ax-burn-tag ac-burn-tag">${esc(tr(K[0]))}</span><b data-no-i18n>${esc(num(x.tokens))}</b><span>${x.pct != null ? esc(x.pct.toFixed(x.pct < 0.01 ? 4 : 2)) + "%" : ""}</span><time data-no-i18n>${esc(ago(x.ts))}</time><span aria-hidden="true">↗</span></a>`;
    }).join("") + `<a class="ac-burn-more" href="/reward#burns">${esc(tr("Every burn, by source"))} →</a>`;
  }

  // ================= chart: 24h / 7d with a crosshair =================
  let range = ls.get("ac-range") === "24h" ? "24h" : "7d", lastD = null;
  function chart(d) {
    const box = q('[data-ac="chart"]');
    if (!box) return;
    const pts = (range === "24h" ? d.spark24 : d.spark) || [];
    const step = range === "24h" ? (d.spark24Step || 3600) : (d.sparkStep || 14400);
    const vals = pts.map((v) => (v == null ? null : Number(v)));
    const have = vals.filter((v) => v != null);
    if (have.length < 2) { box.hidden = true; const old = q(".ax-spark-box"); if (old) old.hidden = false; return; }
    const W = 320, H = 110, pad = 6;
    const lo = Math.min(...have), hi = Math.max(...have), span = hi - lo || hi * 0.02 || 1;
    const x = (i) => pad + (i * (W - pad * 2)) / (vals.length - 1);
    const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
    let dPath = "", started = false, lastI = 0;
    vals.forEach((v, i) => { if (v == null) return; dPath += (started ? " L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); started = true; lastI = i; });
    const up = have[have.length - 1] >= have[0];
    const col = up ? "#39ff88" : "#ff6b6b";
    const area = dPath + ` L${x(lastI).toFixed(1)},${H} L${x(vals.findIndex((v) => v != null)).toFixed(1)},${H} Z`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(tr("$ARCIRCLE price over the last") + " " + (range === "24h" ? "24 hours" : "7 days"))}">
      <defs><linearGradient id="acArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#acArea)"/><path class="ac-line" d="${dPath}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(lastI).toFixed(1)}" cy="${y(vals[lastI]).toFixed(1)}" r="3.5" fill="${col}"/>
      <line class="ac-x" x1="0" x2="0" y1="0" y2="${H}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" visibility="hidden"/>
      <circle class="ac-xdot" r="4" fill="#fff" visibility="hidden"/></svg><div class="ac-tip" hidden></div>`;
    box.hidden = false;
    const old = q(".ax-spark-box"); if (old) old.hidden = true;
    const from = q('[data-ac="chart-from"]'); if (from) from.textContent = tr(range === "24h" ? "24h ago" : "7d ago");
    const lbl = q(".ax-spark-head small"); if (lbl) lbl.textContent = "$ARCIRCLE · " + tr(range === "24h" ? "24 hours" : "7 days");
    const svg = q("svg", box), line = q(".ac-x", box), dot = q(".ac-xdot", box), tip = q(".ac-tip", box);
    const nowTs = d.ts || Math.floor(Date.now() / 1000);
    const move = (clientX) => {
      const r = svg.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      let i = Math.round(fx * (vals.length - 1));
      while (i > 0 && vals[i] == null) i--;
      if (vals[i] == null) return;
      const X = x(i), Y = y(vals[i]);
      line.setAttribute("x1", X); line.setAttribute("x2", X); line.setAttribute("visibility", "visible");
      dot.setAttribute("cx", X); dot.setAttribute("cy", Y); dot.setAttribute("visibility", "visible");
      const t = new Date((nowTs - (vals.length - 1 - i) * step) * 1000);
      tip.innerHTML = `<b data-no-i18n>${esc(price(vals[i]))}</b><small data-no-i18n>${esc(t.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</small>`;
      tip.hidden = false;
      tip.style.left = Math.min(r.width - 110, Math.max(0, (X / W) * r.width - 55)) + "px";
    };
    const leave = () => { line.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
    svg.addEventListener("pointermove", (e) => move(e.clientX));
    svg.addEventListener("pointerdown", (e) => move(e.clientX));
    svg.addEventListener("pointerleave", leave);
    if (!reduce) { const p = q(".ac-line", box); const len = p.getTotalLength ? p.getTotalLength() : 0; if (len) { p.style.strokeDasharray = len; p.style.strokeDashoffset = len; requestAnimationFrame(() => { p.style.transition = "stroke-dashoffset 1s ease"; p.style.strokeDashoffset = 0; }); } }
  }
  function setRange(r) {
    range = r; ls.set("ac-range", r);
    qa(".ac-range button").forEach((b) => b.setAttribute("aria-pressed", b.getAttribute("data-range") === r ? "true" : "false"));
    if (lastD) chart(lastD);
  }

  // ================= trades + pressure =================
  const seenTrades = new Set();
  let firstTrades = true;
  function trades(d) {
    const ol = q('[data-ac="trades"]');
    if (!ol) return;
    const list = (d.recent || []).slice(0, 8);
    if (!list.length) { ol.innerHTML = `<li class="ac-empty">${esc(tr("No trades yet."))}</li>`; return; }
    ol.innerHTML = list.map((x) => {
      const isNew = !firstTrades && !seenTrades.has(x.tx + x.side + x.tokens);
      const big = x.usdc >= 100;
      return `<li class="ac-trade ${x.side === "buy" ? "buy" : "sell"}${isNew ? " ac-new" : ""}${big ? " big" : ""}">
        <span class="ac-side">${esc(tr(x.side === "buy" ? "Buy" : "Sell"))}</span>
        <b data-no-i18n>${esc(usd(x.usdc))}</b>
        <span class="ac-tok" data-no-i18n>${esc(num(x.tokens))}</span>
        <a href="${EXPLORER}/tx/${esc(x.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(ago(x.ts))} ↗</a>
      </li>`;
    }).join("");
    list.forEach((x) => seenTrades.add(x.tx + x.side + x.tokens));
    firstTrades = false;
    const pr = q('[data-ac="press"]');
    if (pr && d.buys24h != null && d.sells24h != null) {
      pr.hidden = false;
      const bv = d.buyVol24h, sv = d.sellVol24h, useVol = bv != null && sv != null && bv + sv > 0;
      q('[data-ac="buys"]', pr).textContent = d.buys24h + (useVol ? " · " + usd(bv) : "");
      q('[data-ac="sells"]', pr).textContent = d.sells24h + (useVol ? " · " + usd(sv) : "");
      const share = useVol ? bv / (bv + sv) : d.buys24h + d.sells24h > 0 ? d.buys24h / (d.buys24h + d.sells24h) : 0.5;
      q('[data-ac="press-buy"]', pr).style.width = (share * 100).toFixed(1) + "%";
    }
  }

  // ================= top holders =================
  function holders(d) {
    const ol = q('[data-ac="top"]');
    if (!ol || !d.top) return;
    if (!d.top.length) { ol.innerHTML = `<li class="ac-empty">${esc(tr("No holders to show yet."))}</li>`; return; }
    const max = d.top[0].pct || 1;
    ol.innerHTML = d.top.slice(0, 10).map((h, i) => {
      const lab = LABELS[String(h.address).toLowerCase()];
      return `<li><span class="ac-rank" data-no-i18n>${i + 1}</span>
        <a class="ac-addr" href="${EXPLORER}/address/${esc(h.address)}" target="_blank" rel="noopener"><code data-no-i18n>${esc(short(h.address))}</code>${lab ? `<small>${esc(tr(lab))}</small>` : ""}</a>
        <div class="ac-top-bar"><i style="width:${Math.max(2, (h.pct / max) * 100).toFixed(1)}%"></i></div>
        <b data-no-i18n>${esc(h.pct.toFixed(h.pct < 1 ? 3 : 2))}%</b></li>`;
    }).join("");
  }

  // ================= safety at a glance =================
  function safety(d) {
    const a = d.argus;
    const tax = q('[data-ac="tax"]');
    if (tax && a && a.buyTaxBps != null) tax.textContent = (a.buyTaxBps === a.sellTaxBps ? (a.buyTaxBps / 100) + "% " + tr("buy / sell") : (a.buyTaxBps / 100) + "% " + tr("buy") + " · " + (a.sellTaxBps / 100) + "% " + tr("sell")) + ", " + tr("forever");
  }
  function loadScore() {
    fetch("/api/v1/scan/" + CA).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j || j.score == null) return;
      const el = q('[data-ac="score"]');
      if (el) el.textContent = j.score + "/100" + (j.verdict ? " · " + tr(j.verdict) : "") + " →";
      const li = q('#ac-safe [data-safe="scan"]');
      if (li) li.classList.toggle("warn", j.score < 45);
    }).catch(() => {});
  }

  // ================= Add to wallet =================
  function addToWallet() {
    const eth = window.ethereum;
    if (!eth || !eth.request) return;
    eth.request({ method: "wallet_watchAsset", params: { type: "ERC20", options: { address: CA, symbol: "ARCIRCLE", decimals: 18, image: location.origin + "/images/arcircle-mark-sm.png" } } })
      .then((ok) => { if (ok) qa("[data-ac-add]").forEach((b) => { b.textContent = "✓ " + tr("Added"); }); })
      .catch(() => {});
  }

  // ================= a wallet's own $ARCIRCLE =================
  let checking = 0;
  async function checkMe(addr) {
    const box = $("ac-me");
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { box.hidden = false; box.innerHTML = `<p class="ac-err">${esc(tr("That doesn't look like a wallet address — it starts with 0x and is 42 characters long."))}</p>`; return; }
    const run = ++checking;
    box.hidden = false; box.innerHTML = `<p class="ac-empty">${esc(tr("Reading Arc…"))}</p>`;
    let d = null;
    try { d = T() ? await T().load(addr.toLowerCase()) : null; } catch { d = null; }
    if (run !== checking) return;
    const w = d && d.wallet;
    if (!w) { box.innerHTML = `<p class="ac-err">${esc(tr("Couldn't read this wallet right now — try again in a minute."))}</p>`; return; }
    ls.set("ac-me", addr);
    const bal = w.balance || 0;
    const tier = bal >= 5e6 ? ["+30%", "5M+"] : bal >= 1e6 ? ["+20%", "1M+"] : bal >= 1e5 ? ["+10%", "100K+"] : null;
    const next = bal < 1e5 ? 1e5 : bal < 1e6 ? 1e6 : bal < 5e6 ? 5e6 : null;
    const burned = w.burned || { tokens: 0, bySource: {} };
    const bsrc = Object.entries(burned.bySource || {}).sort((a, b) => b[1].tokens - a[1].tokens).map(([k, o]) => tr(kind(k)[0]) + " " + num(o.tokens)).join(" · ");
    const card = (acc, k, v, sub, ok) => `<div class="ac-me-card${ok === true ? " ok" : ok === false ? " no" : ""}" style="--acc:${acc}"><span>${esc(tr(k))}</span><strong data-no-i18n>${esc(v)}</strong><small>${esc(sub)}</small></div>`;
    box.innerHTML = `<div class="ac-me-grid">
      ${card("#35d8d0", "Holding", num(bal) + " $ARCIRCLE", bal > 0 ? ((bal / SUPPLY) * 100).toPrecision(3) + "% " + tr("of supply") + (w.rank ? " · " + tr("holder") + " #" + w.rank + " / " + w.of : "") : tr("Not holding right now"))}
      ${card("#39ff88", "Holding for", w.heldDays >= 1 ? w.heldDays.toFixed(1) + " " + tr("days") : bal > 0 ? Math.max(1, Math.round((w.heldDays || 0) * 24)) + " " + tr("hours") : "—", w.maxDays ? "$ARCIRCLE " + tr("is") + " " + w.maxDays.toFixed(1) + " " + tr("days old") : "")}
      ${card("#35d8d0", "Relay launches", bal >= 1e5 ? tr("Eligible") : tr("Not yet"), bal >= 1e5 ? tr("Holding 100,000+ at the snapshot") : num(1e5 - bal) + " " + tr("more to reach 100,000"), bal >= 1e5)}
      ${card("#ffc861", "Builder Mine bonus", tier ? tier[0] : "—", tier ? tr("Holding") + " " + tier[1] + (next ? " · " + num(next - bal) + " " + tr("more for the next tier") : "") : num(1e5 - bal) + " " + tr("more for +10%"), !!tier)}
      ${card("#ff8a4c", "Burned by this wallet", num(burned.tokens || 0) + " $ARCIRCLE", burned.tokens > 0 ? bsrc : tr("Nothing burned yet"))}
      ${card("#4d9fff", "CirclePad", w.circle ? usd(w.circle) : "—", w.circle ? tr("Contributed to CirclePad") : tr("No contribution yet"))}
    </div>
    <p class="ac-me-links"><a href="/me">${esc(tr("Full wallet page"))} →</a><a href="/reward#check=${esc(addr)}">${esc(tr("Burn card"))} →</a></p>`;
    if (!reduce) qa(".ac-me-card", box).forEach((c, i) => { c.style.animationDelay = i * 70 + "ms"; c.classList.add("ac-in"); });
  }
  async function prefillWallet() {
    const inp = $("ac-me-addr");
    if (!inp) return;
    const saved = ls.get("ac-me");
    if (saved) inp.value = saved;
    const eth = window.ethereum;
    if (eth && eth.request) {
      try { const acc = await eth.request({ method: "eth_accounts" }); if (acc && acc[0] && !inp.value) inp.value = acc[0]; } catch { /* not connected */ }
    }
  }

  // ================= family: $ARCIA's price =================
  function loadArcia() {
    fetch("/api/social?coin=arcia").then((r) => (r.ok ? r.json() : null)).then((a) => {
      const el = q('[data-ac="arcia-price"]');
      if (el && a && a.price != null) el.textContent = price(a.price) + (a.mcap != null ? " · " + tr("market cap") + " " + usd(a.mcap) : "") + (a.chain === "rh" ? " · " + tr("on Robinhood Chain") : "");
    }).catch(() => {});
  }

  // ================= sticky section nav =================
  function sectionNav() {
    const facts = $("live");
    if (!facts || q(".ac-nav")) return;
    const items = [["uses", "Uses"], ["flywheel", "Flywheel"], ["market", "Market"], ["buybacks", "Burns & holders"], ["revenue", "Revenue"], ["yours", "Your wallet"], ["family", "Official coins"], ["buy", "How to buy"], ["faq", "FAQ"]].filter(([id]) => $(id));
    const nav = document.createElement("nav");
    nav.className = "ac-nav"; nav.setAttribute("aria-label", tr("On this page"));
    nav.innerHTML = items.map(([id, l]) => `<a href="#${id}" data-sec="${id}">${esc(tr(l))}</a>`).join("");
    facts.insertAdjacentElement("afterend", nav);
    const top = q(".ax-top");
    const setTop = () => { if (top) nav.style.top = `calc(env(safe-area-inset-top, 0px) + ${Math.round(top.getBoundingClientRect().height) + 8}px)`; };
    setTop(); window.addEventListener("resize", setTop);
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (!e.isIntersecting) return;
        qa("a", nav).forEach((a) => a.classList.toggle("on", a.getAttribute("data-sec") === e.target.id));
        const on = q("a.on", nav);
        if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - 24, behavior: reduce ? "auto" : "smooth" });
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    items.forEach(([id]) => io.observe($(id)));
  }

  // ================= hero burn ring + flywheel reactions + price flash =================
  function ring(pct) {
    const coin = q(".ax-coin");
    if (!coin) return;
    let r = q(".ac-ring", coin);
    if (!r) {
      r = document.createElement("div");
      r.className = "ac-ring"; r.setAttribute("aria-hidden", "true");
      r.innerHTML = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="3"/><circle class="ac-ring-arc" cx="100" cy="100" r="94" fill="none" stroke="url(#acRingG)" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 100 100)"/><defs><linearGradient id="acRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc861"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient></defs></svg><span class="ac-ring-lbl"></span>`;
      coin.appendChild(r);
    }
    const arc = q(".ac-ring-arc", r);
    requestAnimationFrame(() => { arc.setAttribute("stroke-dasharray", Math.min(100, pct).toFixed(2) + " 100"); });
    q(".ac-ring-lbl", r).textContent = pct.toFixed(2) + "% " + tr("burned");
  }
  let prevN = null, prevLaunch = null, prevPrice = null;
  function flyPing(step, text) {
    const node = q(`.ax-fly-node[data-step="${step}"]`);
    if (node) { node.classList.remove("ac-ping"); void node.getBBox(); node.classList.add("ac-ping"); setTimeout(() => node.classList.remove("ac-ping"), 2400); }
    const fly = q(".ax-fly");
    if (!fly) return;
    let note = q(".ac-fly-note", fly);
    if (!note) { note = document.createElement("p"); note.className = "ac-fly-note"; note.setAttribute("role", "status"); fly.appendChild(note); }
    note.textContent = text;
    note.classList.remove("on"); void note.offsetWidth; note.classList.add("on");
  }
  function react(d) {
    const b = d.burned;
    if (b && b.n != null) {
      if (prevN != null && b.n > prevN) { const newest = (b.list || [])[0]; flyPing(3, tr("New burn") + (newest ? ": " + num(newest.tokens) + " $ARCIRCLE · " + tr(kind(newest.kind)[0]) : "")); }
      prevN = b.n;
    }
    const L = d.revenue && d.revenue.launches;
    if (L != null) { if (prevLaunch != null && L > prevLaunch) flyPing(1, tr("New launch on ArcPad") + " · " + L + " " + tr("so far")); prevLaunch = L; }
    if (d.price != null) {
      if (prevPrice != null && d.price !== prevPrice && !reduce) {
        const dir = d.price > prevPrice ? "up" : "down";
        qa('[data-tk="price"]').forEach((el) => { el.classList.remove("ac-up", "ac-down"); void el.offsetWidth; el.classList.add("ac-" + dir); });
      }
      prevPrice = d.price;
    }
  }

  // ================= wiring =================
  function onStats(d) {
    if (!d || d.partial) return;
    lastD = d;
    if (d.burned) { paintUses(d.burned); paintBurnList(d.burned); if (d.burned.pct != null) ring(d.burned.pct); }
    if (d.spark || d.spark24) chart(d);
    trades(d); holders(d); safety(d); react(d);
  }
  function init() {
    sectionNav();
    if (T()) T().subscribe(onStats);
    loadScore(); loadArcia(); setInterval(loadArcia, 30000);
    if (window.ethereum && window.ethereum.request) qa("[data-ac-add]").forEach((b) => { b.hidden = false; });
    prefillWallet();
    qa(".ac-range button").forEach((b) => b.setAttribute("aria-pressed", b.getAttribute("data-range") === range ? "true" : "false"));
    document.addEventListener("click", (e) => {
      const t = e.target;
      const rb = t.closest && t.closest(".ac-range button");
      if (rb) { setRange(rb.getAttribute("data-range")); return; }
      if (t.closest && t.closest("[data-ac-add]")) { addToWallet(); return; }
      const cp = t.closest && t.closest(".rw-copy[data-copy]");
      if (cp) {
        const done = () => { const o = cp.textContent; cp.textContent = tr("Copied"); setTimeout(() => { cp.textContent = o; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cp.getAttribute("data-copy")).then(done, () => {});
      }
    });
    const f = $("ac-me-form");
    if (f) f.addEventListener("submit", (e) => { e.preventDefault(); checkMe($("ac-me-addr").value.trim()); });
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
  // on Robinhood Chain (the wallet menu's second network): ETH for gas, and $ARCIRCLE's OMNI token there
  let altRp = null;
  const ALT = typeof ARC_ALT_NET !== "undefined" && ARC_ALT_NET ? ARC_ALT_NET : null;
  const altToken = (typeof CONFIG !== "undefined" && CONFIG.OMNI && CONFIG.OMNI.ROBINHOOD_OFT) || "";
  async function fillBalances(box) {
    if (!state.account || !box) return;
    const acct = state.account;
    const onAlt = !!ALT && Number(state.chainId) === ALT.id;
    const lab = box.querySelector("[data-wl=gas]");
    if (lab) lab.innerHTML = onAlt ? 'ETH <small>Robinhood</small>' : 'USDC <small>gas</small>';
    try {
      const p = onAlt ? (altRp = altRp || new ethers.JsonRpcProvider(ALT.rpc, ethers.Network.from(ALT.id), { staticNetwork: true })) : readProvider();
      const tokAddr = onAlt ? altToken : ARCIRCLE_TOKEN;
      const tok = tokAddr ? new ethers.Contract(tokAddr, ERC20_ABI, p) : null;
      const [nat, arc] = await Promise.all([p.getBalance(acct).catch(() => null), tok ? tok.balanceOf(acct).catch(() => null) : null]);
      if (state.account !== acct) return;
      const f = (v, d, m) => v == null ? "—" : Number(ethers.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: m || 2 });
      box.querySelector("[data-wb=usdc]").textContent = f(nat, 18, onAlt ? 5 : 2);
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
    bal.innerHTML = `<div><span data-wl="gas">USDC <small>gas</small></span><b data-wb="usdc">…</b></div>` + (ARCIRCLE_TOKEN ? `<div><span>$ARCIRCLE</span><b data-wb="arc">…</b></div>` : "");
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
    if (!enhanceWallet.net) { enhanceWallet.net = true; document.addEventListener("arc:walletnet", () => { const b = document.querySelector("#wallet-dropdown .wd-bal"); if (b) fillBalances(b); }); }
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
    // the running round's escrow (filled from the rounds list below); Round #1 until that's known
    ["CirclePad escrow", "0xC5998d7cE728FDd6f77217fdE775aAb90Ec61703", "cp-escrow"],
    ["CirclePad vote", "0x23c376615a58F059FC4bc83A38eB4aCdF8d39ff2"],
    ["CirclePad burn vote", "0x54121a7894d90a02eA973Ab45EEF424C2716EeB2"],
    ["Creator lock", "0x64F893947Fe2c4fe7058CFba899eA269CBa9F006"],
    ["LP lock", "0x674E7010Dab5cCb519e06df72b1D4c063952f45B"],
    ["Builder Mine", (typeof CONFIG !== "undefined" && CONFIG.BUILDER_MINE_ADDRESS) || ""],
    ["ARCIRCLE Orders", "0x1A31C2539d6e3fBdF276E8D74bA67aEc4De9008e"],
    ["Orders fee burn", "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034"],
    ["ARCIRCLE Predict", "0x41149F8ce23d9B4E737e51C97fFE14bBb4C09ce6"],
    ["ARCIRCLE Staking", (typeof CONFIG !== "undefined" && CONFIG.STAKING_ADDRESS) || ""],
    ["Quantum Launch", (typeof CONFIG !== "undefined" && CONFIG.QUANTUM_PAD_ADDRESS) || ""],
  ];
  var short = function (a) { return a.slice(0, 6) + "…" + a.slice(-4); };
  function build() {
    var old = document.querySelector("footer.ah-footer");
    var dock = document.querySelector("nav.ax-dock");
    var f = document.createElement("footer");
    f.className = "axf";
    f.innerHTML =
      '<div class="axf-in">' +
        '<div class="axf-brand"><a href="/" class="axf-logo"><img src="/images/arcircle-mark-sm.webp" alt="" width="40" height="28"><span>ARCIRCLE <em>PAD</em></span></a>' +
          '<p>Two launchpads and one core coin on Circle\'s Arc. Every number on this site is read live from the chain.</p>' +
          '<div class="axf-net" id="axf-net"><span class="axf-dot"></span><span class="axf-net-txt">Arc mainnet · checking…</span></div></div>' +
        '<div class="axf-col"><h4>Products</h4><a href="/arc">ArcPad</a><a href="/circle">CirclePad</a><a href="/arcircle">$ARCIRCLE</a><a href="/relay">Relay Launch</a><a href="/reward">Reward</a><a href="/me">My ARCIRCLE</a></div>' +
        '<div class="axf-col"><h4>Resources</h4><a href="/whitepaper">Whitepaper</a><a href="/whitepaper/ko" lang="ko">백서 (한국어)</a><a href="/arc#docs">ArcPad docs</a><a href="/circle#docs">CirclePad docs</a><a href="/start">Get started</a><a href="/stats">Stats</a><a href="/roadmap">Roadmap</a><a href="/brand">Brand kit</a></div>' +
        // the first four show; the rest fold behind "All contracts" (the column was taller than the rest of the footer)
        '<div class="axf-col axf-contracts" id="axf-contracts"><h4>Contracts</h4>' + CONTRACTS.map(function (c, i) {
          var more = i >= 4 ? " axf-more" : "";
          if (!c[1]) return '<div class="axf-ca' + more + '"><span>' + c[0] + '</span><em class="axf-nl">Not live</em></div>';
          return '<div class="axf-ca' + more + '"' + (c[2] ? ' data-axf="' + c[2] + '"' : '') + '><span>' + c[0] + '</span><a href="' + EXPLORER + '/address/' + c[1] + '" target="_blank" rel="noopener" data-no-i18n>' + short(c[1]) + ' ↗</a>' +
            '<button type="button" class="axf-copy" data-copy-ca="' + c[1] + '" aria-label="Copy address">Copy</button></div>';
        }).join("") + '<button type="button" class="axf-allca" aria-expanded="false" aria-controls="axf-contracts"><span>All contracts</span> <b data-no-i18n>' + CONTRACTS.length + '</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>' +
      '</div>' +
      '<div class="axf-bottom"><span>Nothing on this site is financial advice. Crypto assets can lose all of their value.</span>' +
        '<button type="button" class="axf-sound" id="axf-sound" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="axf-wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg><span></span></button></div>';
    if (old) old.replaceWith(f);
    else if (dock) dock.parentNode.insertBefore(f, dock);
    else document.body.appendChild(f);

    f.addEventListener("click", function (e) {
      var all = e.target.closest && e.target.closest(".axf-allca");
      if (all) { var col = all.parentNode, open = !col.classList.contains("open"); col.classList.toggle("open", open); all.setAttribute("aria-expanded", open ? "true" : "false"); all.querySelector("span").textContent = open ? "Fewer contracts" : "All contracts"; return; }
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
    rounds(f);
    netStatus();
    setInterval(function () { if (!document.hidden) netStatus(); }, 30000);
  }

  // CirclePad: the escrow of the round that's running now, and the earlier rounds' escrows folded under it.
  // /circle already has the list (window.CP_ROUNDS); other pages read the same small script once.
  function rounds(f) {
    var row = f.querySelector('[data-axf="cp-escrow"]');
    if (!row) return;
    var put = function (v) {
      var list = (v && v.list) || [];
      if (!list.length) return;
      var started = list.filter(function (r) { return r.started; });
      var cur = started[started.length - 1] || list[0];
      var ok = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); };
      if (!ok(cur.escrow)) return;
      var link = function (r) { return '<a href="' + EXPLORER + '/address/' + r.escrow + '" target="_blank" rel="noopener" data-no-i18n>#' + r.n + ' ' + short(r.escrow) + ' ↗</a>'; };
      var past = list.filter(function (r) { return r !== cur && ok(r.escrow); }).reverse();
      row.innerHTML = '<span>CirclePad escrow <em class="axf-rn" data-no-i18n>#' + cur.n + '</em></span><a href="' + EXPLORER + '/address/' + cur.escrow + '" target="_blank" rel="noopener" data-no-i18n>' + short(cur.escrow) + ' ↗</a>' +
        '<button type="button" class="axf-copy" data-copy-ca="' + cur.escrow + '" aria-label="Copy address">Copy</button>' +
        (past.length ? '<details class="axf-past"><summary>Earlier rounds</summary>' + past.map(link).join("") + '</details>' : '');
    };
    if (window.CP_ROUNDS) { put(window.CP_ROUNDS); return; }
    var go = function () {
      fetch("/api/social?circle=boot").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
        var m = /window\.CP_ROUNDS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(t || "");
        if (m) { try { put(JSON.parse(m[1])); } catch (e) { /* keep Round #1 */ } }
      }).catch(function () {});
    };
    // only when the footer comes near the screen: most visits never scroll that far
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); } }, { rootMargin: "400px" });
      io.observe(f);
    } else go();
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

  // ---- ARCIRCLE Staking: planned, not built — a "coming soon" card from its utilities tile ----
  function openStakingSoon() {
    var old = document.getElementById("ax-stk");
    if (old) old.remove();
    var tr = function (x) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate && window.arcI18n.translate(x)) || x; };
    var before = document.activeElement;
    var wrap = document.createElement("div");
    wrap.id = "ax-stk";
    wrap.className = "ax-stk";
    wrap.innerHTML =
      '<div class="ax-stk-scrim" data-stk-close></div>' +
      '<div class="ax-stk-card" role="dialog" aria-modal="true" aria-labelledby="ax-stk-h" tabindex="-1">' +
        '<button type="button" class="ax-stk-x" data-stk-close aria-label="' + tr("Close") + '">' + ICON_PLUS + "</button>" +
        '<div class="ax-stk-art"><i class="ax-stk-glow" aria-hidden="true"></i><img src="/images/arcircle-staking-320.webp" alt="ARCIRCLE Staking" width="200" height="200" decoding="async"></div>' +
        '<span class="ax-stk-kick"><i aria-hidden="true"></i>' + tr("Coming soon") + "</span>" +
        '<h2 id="ax-stk-h">ARCIRCLE Staking</h2>' +
        "<p>" + tr("Staking for $ARCIRCLE is being planned. How it works, what it pays and when it opens will be announced here and on X first.") + "</p>" +
        '<div class="ax-stk-acts"><a class="ax-stk-go" href="https://x.com/ARCIRCLEonArc" target="_blank" rel="noopener">' + tr("Follow for updates") + ' ↗</a>' +
        '<button type="button" class="ax-stk-ok" data-stk-close>' + tr("Got it") + "</button></div>" +
      "</div>";
    document.body.appendChild(wrap);
    var card = wrap.querySelector(".ax-stk-card");
    requestAnimationFrame(function () { wrap.classList.add("in"); card.focus({ preventScroll: true }); });
    var close = function () {
      wrap.classList.remove("in");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(function () { wrap.remove(); }, 260);
      if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    };
    var onKey = function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var f = [].slice.call(card.querySelectorAll("a[href], button"));
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", function (e) { if (e.target.closest("[data-stk-close]")) close(); });
  }
  window.arcStakingSoon = openStakingSoon;

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
  var ICON_WALLET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><circle cx="16" cy="13.5" r="1.2"/></svg>';
  var ICON_ORDERS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v17"/><path d="M9.5 7H5M9.5 11H3.5M9.5 15H6"/><path d="M14.5 9H19M14.5 13H20.5M14.5 17H17.5"/></svg>';
  var ICON_NFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17.5l4.6-4.4 3.4 3 3.2-3.6 4.8 5"/></svg>';
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
    { id: "scanner", name: "Token Scanner", sub: "Check any token on Arc, Robinhood Chain or Solana before you buy", status: "v4", acc: "#4d9fff", href: "/arc#scanner",
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
    { id: "liquidity", name: "Liquidity", sub: "Pool dashboard, one-coin shapes and LP locks — Arc and Robinhood", status: "v2", acc: "#39d0ff", href: "/arc#liquidity",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c3.2 3.8 5.5 7 5.5 9.9a5.5 5.5 0 0 1-11 0c0-2.9 2.3-6.1 5.5-9.9z"/><path d="M9.3 14.2a2.8 2.8 0 0 0 2.7 2.4"/></svg>' },
  ];
  UTILS2.push({ id: "relay", name: "Relay Launch", sub: "CirclePad round → Argus coin, relayed to holders", status: "v1", acc: "#35d8d0", href: "/arc#relay",
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="2.6"/><circle cx="12" cy="12" r="2.6"/><circle cx="18.5" cy="12" r="2.6"/><path d="M8.1 12h1.3M14.6 12h1.3"/><path d="M4 6.5c2.5-2.3 13.5-2.3 16 0M4 17.5c2.5 2.3 13.5 2.3 16 0"/></svg>' });
  UTILS2.push({ id: "arcia", name: "ARCIA", sub: "Chat with the AI idol of $ARCIRCLE", status: "v4", acc: "#5b8cff", href: "/arc#arcia",
    ico: '<img class="ax-util-av" src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40">' });
  // Page 3: ARCIRCLE OMNI (preview until its contracts are deployed), ARCIA 402, Builder Mine, ARCIA DESK.
  // Page 4: ARCIA AGENT, ARCIRCLE Orders, ARCIRCLE Staking, ARCIRCLE Predict. Page 5: ARCIRCLE NFT Vault, three in development.
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
  UTILS3.push({ id: "desk", name: "ARCIA DESK", sub: "ARCIA trades new launches on Arc and Robinhood Chain — every trade public", status: "v3", acc: "#39ff88", href: "/arc#desk",
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5h16"/><path d="M6.5 16V11M10.5 16V7.5M14.5 16v-6M18.5 16V5"/><path d="M5 9.5l4.5-4 4 3 5.5-5"/></svg>' });
  // page 4: ARCIA AGENT, ARCIRCLE Orders, then what's still being built
  var UTILS4 = [
    { id: "agent", name: "ARCIA AGENT", sub: "ARCIA reads any Arc token, calls it and burns it", status: "v2", acc: "#5b8cff", href: "/arc#agent",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>' },
  ];
  UTILS4.push({ id: "orders", name: "ARCIRCLE Orders", sub: "Limit, stop, TP/SL, OCO and grid orders — Arc, Robinhood and Solana", status: "v8", acc: "#4dd4ff", href: "/arc#orders",
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v17"/><path d="M9.5 7H5M9.5 11H3.5M9.5 15H6"/><path d="M14.5 9H19M14.5 13H20.5M14.5 17H17.5"/></svg>' });
  // ARCIRCLE Staking: veARCIRCLE — lock $ARCIRCLE, weekly USDC, pool votes (arc-staking.js)
  UTILS4.push({ id: "staking", name: "ARCIRCLE Staking", sub: "Lock $ARCIRCLE, earn USDC, vote", status: "v2", acc: "#b58bff", href: "/arc#staking",
    img: "/images/arcircle-staking-96.webp",
    // a lock over stacked coins (the tiles draw this icon; the image is only for places that show pictures)
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10.5" width="11" height="9" rx="2"/><path d="M6.8 10.5V8a2.7 2.7 0 0 1 5.4 0v2.5"/><ellipse cx="18" cy="9" rx="2.8" ry="1.3"/><path d="M15.2 9v3.2c0 .7 1.3 1.3 2.8 1.3s2.8-.6 2.8-1.3V9M15.2 12.2v3.2c0 .7 1.3 1.3 2.8 1.3s2.8-.6 2.8-1.3v-3.2"/></svg>' });
  // ARCIRCLE Predict: UP / DOWN rounds on Arc tokens, paid in USDC (arc-predict.js)
  UTILS4.push({ id: "predict", name: "ARCIRCLE Predict", sub: "UP or DOWN on Arc and Robinhood Chain coins", status: "v3", acc: "#39ff88", href: "/arc#predict",
    ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 18.5l5-6 3.5 3 6.5-8.5"/><path d="M14.5 7h4v4"/><path d="M3.5 21h17"/></svg>' });
  // page 5: what's still being built
  var NEXT = [
    // ARCIRCLE NFT Vault: a coin's trading fees buy NFTs, raffled to $ARCIRCLE holders (arc-nft.js)
    { id: "nft", name: "ARCIRCLE NFT Vault", sub: "Fees buy NFTs, holders win them — every draw checkable on-chain", status: "v2", acc: "#ff8bd8", href: "/arc#nft", ico: ICON_NFT },
    // veARCIA: stake $ARCIA on Robinhood Chain, $ARCIA rewards, the $ARCIRCLE boost (arc-vearcia.js)
    { id: "vearcia", name: "veARCIA", sub: "Stake $ARCIA 1–20 days, earn $ARCIA — $ARCIRCLE boosts it", status: "New", acc: "#ff8bd8", href: "/arc#vearcia", img: "/images/arcia-avatar-96.jpg",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/><path d="M12 13.4l.8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.3z"/></svg>' },
    // ARCIA WORKS: agents hiring agents — a register of AI agents and a USDC escrow for their jobs, on Arc (arc-works.js)
    { id: "works", name: "ARCIA WORKS", sub: "Agents hiring agents — jobs paid in USDC through an escrow on Arc", status: "New", acc: "#ffb547", href: "/arc#works",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7.5" width="17" height="12" rx="2.4"/><path d="M9 7.5V6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 6v1.5"/><path d="M3.5 12.8h17"/><circle cx="12" cy="12.8" r="1.5"/></svg>' },
    { id: "next-20", sub: "In development" },
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
      '<a class="ax-quick-item" href="/arc#explore" data-arc-tab="explore" aria-label="Explore"><span class="ax-quick-ico">' + ICON_GRID + '</span><span>Explore</span></a>' +
      '<a class="ax-quick-item ax-quick-pf" href="/arc#portfolio" data-arc-tab="portfolio" aria-label="Portfolio"><span class="ax-quick-ico">' + ICON_WALLET + '</span><span>Portfolio</span></a>' +
      '<a class="ax-quick-item ax-quick-orders" href="/arc#orders" data-arc-tab="orders" aria-label="Orders"><span class="ax-quick-ico">' + ICON_ORDERS + '</span><span>Orders</span></a>' +
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
      // The pair is centred on the dock's own anchor, which on pages with a
      // sidebar is the content column, not the window; nudge it sideways when
      // it would run off either edge of that column.
      var vw = window.innerWidth, cx = parseFloat(getComputedStyle(dock).left) || vw / 2;
      var lo = Math.max(24, 2 * cx - vw + 12), hi = vw - 24, w = q.width + GAP + d.width;
      var row = vw >= 901 && w <= hi - lo;
      var nudge = row ? Math.min(0, hi - (cx + w / 2)) + Math.max(0, lo - (cx - w / 2)) : 0;
      root.classList.toggle("ax-float-row", row);
      if (row) {
        root.style.setProperty("--ax-q-shift", Math.round(nudge - (GAP + d.width) / 2) + "px");
        root.style.setProperty("--ax-d-shift", Math.round(nudge + (q.width + GAP) / 2) + "px");
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
      if (u.soonPop) {
        return '<div class="ax-util-tile is-coming" role="button" tabindex="0" aria-haspopup="dialog" data-util="' + u.id + '" style="--acc:' + u.acc + ";--i:" + i + '">' +
          '<span class="ax-util-ico ax-util-img"><img src="' + u.img + '" alt="" width="38" height="38" loading="lazy" decoding="async"></span>' +
          '<span class="ax-util-txt"><strong>' + u.name + "</strong><small>" + u.sub + "</small></span>" +
          '<em class="ax-util-st">' + u.status + "</em></div>";
      }
      var tag = u.href ? "a" : "div";
      return "<" + tag + ' class="ax-util-tile' + (u.soon ? " is-soon" : "") + (u.href ? "" : " is-off") + '" data-util="' + u.id + '" style="--acc:' + u.acc + ";--i:" + i + '"' +
        (u.href ? ' href="' + u.href + '"' : ' aria-disabled="true"') + ">" +
        (u.ico || !u.img ? '<span class="ax-util-ico">' + (u.ico || ICON_SOON) + "</span>" : '<span class="ax-util-ico ax-util-img"><img src="' + u.img + '" alt="" width="38" height="38" decoding="async"></span>') +
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
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 1 of 5" data-page="0">' + UTILS.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 2 of 5" data-page="1">' + UTILS2.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 3 of 5" data-page="2">' + UTILS3.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 4 of 5" data-page="3">' + UTILS4.map(tile).join("") + "</div>" +
          '<div class="ax-util-grid" role="group" aria-roledescription="page" aria-label="Utilities 5 of 5" data-page="4">' + NEXT.map(function (u, i) { return u.href ? tile(u, i) : next(u, i + UTILS.length + UTILS2.length + UTILS3.length + UTILS4.length); }).join("") + "</div>" +
        "</div></div>" +
      '<div class="ax-util-pager" role="tablist" aria-label="Pages">' +
        '<button type="button" role="tab" data-go-page="0" aria-selected="true" aria-label="Page 1">1</button>' +
        '<button type="button" role="tab" data-go-page="1" aria-selected="false" aria-label="Page 2">2</button>' +
        '<button type="button" role="tab" data-go-page="2" aria-selected="false" aria-label="Page 3">3</button>' +
        '<button type="button" role="tab" data-go-page="3" aria-selected="false" aria-label="Page 4">4</button>' +
        '<button type="button" role="tab" data-go-page="4" aria-selected="false" aria-label="Page 5">5</button>' +
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
      fit(instant);
    }
    // the pages area takes the height of the page on show (a page of short tiles doesn't leave an empty band)
    function fit(instant) {
      var vp0 = panel.querySelector(".ax-util-pages"), g = pages[page];
      if (!vp0 || !g || panel.hidden) return;
      vp0.classList.toggle("instant", !!instant || reduce);
      vp0.style.height = g.offsetHeight + "px";
    }
    window.addEventListener("resize", function () { fit(true); });
    // a page can change height after it's measured (fonts arriving, the panel placed narrower, another language):
    // follow it
    if (window.ResizeObserver) { var pro = new ResizeObserver(function () { fit(true); }); pages.forEach(function (g) { pro.observe(g); }); }
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
      fit(true); // measured again once the panel has its final width
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
      if (e.target.closest && e.target.closest('[data-util="staking"]')) { hide(false); openStakingSoon(); return; }
      var t = e.target.closest && e.target.closest(".ax-util-tile.is-off");
      if (!t) return;
      t.classList.remove("nudge"); void t.offsetWidth; t.classList.add("nudge");
    });
    panel.addEventListener("keydown", function (e) {
      var t = e.target.closest && e.target.closest('[data-util="staking"]');
      if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); hide(false); openStakingSoon(); }
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
    window.arcUtilities = { open: show, close: hide, list: UTILS.concat(UTILS2, UTILS3, UTILS4, NEXT.filter(function (u) { return !!u.href; })), page: function (n) { if (n == null) return page; goPage(n); } };
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
/* ---- arc-burnvote-chip.js ---- */
/* global CONFIG */
// arc-burnvote-chip.js — "$ARCIRCLE burned by CirclePad votes" on the hub
// (live bar), the $ARCIRCLE page (burn card) and ArcPad's $ARCIRCLE tab.
// Reads /api/social?circle=burns; shows nothing until the first vote.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || CONFIG.CIRCLEPAD_VOTE_MODE !== "burn" || !/^0x[0-9a-fA-F]{40}$/.test(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS || "")) return;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tok = (raw) => Math.round(Number(BigInt(raw || 0) / 10n ** 18n)).toLocaleString("en-US");
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  let d = null;
  function paint() {
    if (!d || !d.totals || !d.totals.votes) return;
    const burned = tok(d.totals.burned), last = d.events && d.events[0];
    // hub: one more item on the live bar
    const bar = document.getElementById("ax-livebar");
    if (bar) {
      let a = bar.querySelector("[data-lb-burnvote]");
      if (!a) { a = document.createElement("a"); a.className = "ax-lb-item"; a.href = "/circle#governance"; a.setAttribute("data-lb-burnvote", ""); bar.appendChild(a); }
      a.innerHTML = `<span>${esc(tr("Burned by votes"))}</span><b data-no-i18n>${burned}</b><span>$ARCIRCLE</span>`;
    }
    // $ARCIRCLE page burn card / ArcPad $ARCIRCLE tab
    const spots = [document.querySelector("#burn .ax-burn-main"), document.querySelector("#bp-panel-arcircle .ac2p-burned") && document.querySelector("#bp-panel-arcircle .ac2p-burned").closest("dl")];
    spots.forEach((host) => {
      if (!host) return;
      let el = host.querySelector(".arc-bv-chip");
      if (!el) { el = document.createElement("a"); el.className = "arc-bv-chip"; el.href = "/circle#governance"; host.appendChild(el); }
      el.innerHTML = `<i aria-hidden="true"></i><span><b data-no-i18n>${burned}</b> <span>${esc(tr("$ARCIRCLE burned by CirclePad votes"))}</span> · <b data-no-i18n>${d.totals.voters}</b> <span>${esc(tr("voters"))}</span></span>${last ? `<small><span data-no-i18n>${short(last.voter)}</span> <span>${esc(tr("burned"))}</span> <span data-no-i18n>${(last.votes * 1000).toLocaleString("en-US")}</span></small>` : ""}<em aria-hidden="true">→</em>`;
    });
  }
  async function load() {
    try { const r = await fetch("/api/social?circle=burns"); if (r.ok) { d = await r.json(); paint(); } } catch { /* next time */ }
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 60000);
  document.addEventListener("arc:lang", paint);
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
    // the round line follows CONFIG.CIRCLEPAD_STATUS (config-arc.js), so it never goes stale here
    ["CirclePad", "Community-funded launches" + ((window.CONFIG && CONFIG.CIRCLEPAD_STATUS && CONFIG.CIRCLEPAD_STATUS.line) ? " · " + CONFIG.CIRCLEPAD_STATUS.line : ""), "/circle", "page"],
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
      { name: "Liquidity", sub: "Pool dashboard, one-coin shapes, LP locks", href: "/arc#liquidity" }, { name: "Bridge", sub: "Move USDC to Arc", href: "/arc#bridge" },
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
    root.className = "ckp";
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
        esc(it[3] === "coin" || /^0x/.test(it[1]) ? it[1] : tr(it[1])) + "</small></span>" + (ext ? '<span class="ck-ext" aria-hidden="true">↗</span>' : "") + "</li>";
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
/* ---- arc-nav.js ---- */
// arc-nav.js — the one menu every ARCIRCLE PAD page shares (styles: arc-nav.css).
//   · four menus — Trade, Earn, ARCIA, Tools — each opening a panel of what's in it, with the rarely used
//     pages under "More" at the bottom of each panel (their links keep working)
//   · right side: search (the page's Ctrl+K palette, where it has one), language, $ARCIRCLE, $ARCIA, Wallet
//   · a second row with the pages of the menu you're in (desktop), or the page's own tabs (CirclePad)
//   · phones: Home · Trade · Earn · ARCIA · Tools at the bottom; each opens a sheet with its pages
// It replaces the old top switcher, the two bottom bars and ArcPad's long sidebar (arc-nav.css hides them).
// Plain script, no dependencies; labels in English, Korean and Chinese (follows the page's language).
// Inside ARCIRCLE World (/play opens a shop's page in an iframe) the world is the chrome: hide the site's own.
try {
  if (window.top !== window.self && /^\/play\b/.test(window.top.location.pathname)) {
    document.documentElement.classList.add("in-world");
    // Esc inside the shop goes back to the planet
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !e.defaultPrevented) window.top.postMessage({ arcWorld: "close" }, location.origin); });
  }
} catch (e) { /* another origin */ }
(function () {
  "use strict";
  if (window.arcNav) return;
  var D = document, H = D.documentElement;
  var ICON = {"planet":"<circle cx=\"12\" cy=\"12\" r=\"5.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"/><path d=\"M3.2 15.2c-1.6 2.4 4.7 2.2 10.3-.6s9.4-6.7 7.3-7.6c-.8-.3-2.2-.1-3.9.4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"/>","home":"<path d=\"M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5V14h4v5.5h4.5V10\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","grid":"<rect x=\"3.5\" y=\"3.5\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/><rect x=\"13\" y=\"3.5\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/><rect x=\"3.5\" y=\"13\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/><rect x=\"13\" y=\"13\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/>","rocket":"<path d=\"M12 2.5c3 2 4.5 5.4 4.5 9 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.6 1.5-7 4.5-9z\"/><circle cx=\"12\" cy=\"10.5\" r=\"2\"/><path d=\"M8 15.5l-3 1 .8-3.3M16 15.5l3 1-.8-3.3M9.5 19.5 12 22l2.5-2.5\"/>","doc":"<path d=\"M6.5 3h8L18.5 6v15h-12z\"/><path d=\"M14.5 3v3h4\"/>","search":"<circle cx=\"10.8\" cy=\"10.8\" r=\"6.3\"/><path d=\"M20 20l-4.5-4.5\"/>","link":"<path d=\"M9.5 14.5 14.5 9.5\"/><path d=\"M11 7.2 13.2 5A4 4 0 1 1 19 10.8L16.8 13\"/><path d=\"M13 16.8 10.8 19A4 4 0 1 1 5 13.2L7.2 11\"/>","ext":"<path d=\"M14 5h5v5M19 5l-8.5 8.5\"/><path d=\"M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4\"/>","chevron":"<path d=\"M6 9l6 6 6-6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","wallet":"<path d=\"M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3\"/><rect x=\"4\" y=\"8\" width=\"16\" height=\"11\" rx=\"2.5\"/><circle cx=\"16\" cy=\"13.5\" r=\"1.2\" fill=\"currentColor\"/>","scan":"<path d=\"M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z\"/><circle cx=\"11.5\" cy=\"11.5\" r=\"3\"/><path d=\"M13.7 13.7l2.3 2.3\"/>","bridge":"<path d=\"M3 15.5h18\"/><path d=\"M4.5 15.5V19M19.5 15.5V19\"/><path d=\"M4.5 15.5c2-5.3 4.7-8 7.5-8s5.5 2.7 7.5 8\"/><path d=\"M8.5 15.5v-3.6M12 15.5V7.5M15.5 15.5v-3.6\"/>","omni":"<path d=\"M12 12c-1.7-2.3-3.1-3.4-4.8-3.4a3.4 3.4 0 0 0 0 6.8c1.7 0 3.1-1.1 4.8-3.4s3.1-3.4 4.8-3.4a3.4 3.4 0 0 1 0 6.8c-1.7 0-3.1-1.1-4.8-3.4z\"/><circle cx=\"12\" cy=\"3.5\" r=\"1.3\"/><circle cx=\"4\" cy=\"20\" r=\"1.3\"/><circle cx=\"20\" cy=\"20\" r=\"1.3\"/>","arcia":"<path d=\"M5 17.5V8.5A3.5 3.5 0 0 1 8.5 5h7A3.5 3.5 0 0 1 19 8.5v5a3.5 3.5 0 0 1-3.5 3.5H10l-4 3z\"/><path d=\"M12 8.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z\"/>","mine":"<path d=\"M5 19.5 14.5 10\"/><path d=\"M8.5 6.2c4-2.6 8.6-2.4 12 .6-3.3-.5-6.3.4-8.5 2.6\"/><path d=\"M4 21h6M14.5 16.5l2 2M19 13l1.5 1.5\"/>","desk":"<path d=\"M4 19.5h16\"/><path d=\"M6.5 16V11M10.5 16V7.5M14.5 16v-6M18.5 16V5\"/><path d=\"M5 9.5l4.5-4 4 3 5.5-5\"/>","agent":"<circle cx=\"12\" cy=\"12\" r=\"3.2\"/><path d=\"M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1\"/>","swap":"<path d=\"M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3\"/>","orders":"<path d=\"M12 3.5v17\"/><path d=\"M9.5 7H5M9.5 11H3.5M9.5 15H6\"/><path d=\"M14.5 9H19M14.5 13H20.5M14.5 17H17.5\"/>","predict":"<path d=\"M3.5 18.5l5-6 3.5 3 6.5-8.5\"/><path d=\"M14.5 7h4v4\"/><path d=\"M3.5 21h17\"/>","nft":"<rect x=\"3.5\" y=\"4\" width=\"17\" height=\"16\" rx=\"2.5\"/><circle cx=\"9\" cy=\"9.5\" r=\"1.8\"/><path d=\"M4 17.5l4.6-4.4 3.4 3 3.2-3.6 4.8 5\"/>","vea":"<rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"2.2\"/><path d=\"M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11\"/><path d=\"M12 13.4l.8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.3z\"/>","stake":"<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"9.5\" rx=\"2.2\"/><path d=\"M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5\"/><path d=\"M12 14v2.5\"/>","works":"<rect x=\"3.5\" y=\"7.5\" width=\"17\" height=\"12\" rx=\"2.4\"/><path d=\"M9 7.5V6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 6v1.5\"/><path d=\"M3.5 12.8h17\"/><circle cx=\"12\" cy=\"12.8\" r=\"1.5\"/>","a402":"<circle cx=\"9\" cy=\"12\" r=\"5.5\"/><path d=\"M9 9.3v5.4M10.7 10.2c-.4-.6-1-.9-1.7-.9-.9 0-1.6.5-1.6 1.2 0 1.5 3.4.9 3.4 2.4 0 .7-.8 1.2-1.7 1.2-.8 0-1.4-.3-1.8-.9\"/><path d=\"M15.5 7.5a5.5 5.5 0 0 1 0 9M18 5.5a8.5 8.5 0 0 1 0 13\"/>","relay":"<circle cx=\"5.5\" cy=\"12\" r=\"2.6\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\"/><circle cx=\"18.5\" cy=\"12\" r=\"2.6\"/><path d=\"M8.1 12h1.3M14.6 12h1.3\"/><path d=\"M4 6.5c2.5-2.3 13.5-2.3 16 0M4 17.5c2.5 2.3 13.5 2.3 16 0\"/>","snap":"<path d=\"M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16\"/><circle cx=\"12\" cy=\"10.3\" r=\"2.3\"/><path d=\"M8.3 16.2c.8-1.9 2.1-2.8 3.7-2.8s2.9.9 3.7 2.8\"/>","fan":"<circle cx=\"5.5\" cy=\"12\" r=\"2.2\"/><circle cx=\"18.5\" cy=\"5.5\" r=\"2\"/><circle cx=\"18.5\" cy=\"12\" r=\"2\"/><circle cx=\"18.5\" cy=\"18.5\" r=\"2\"/><path d=\"M7.7 12h8.8M7.4 10.9l9.2-4.6M7.4 13.1l9.2 4.6\"/>","drop":"<path d=\"M12 3.5c3.2 3.8 5.5 7 5.5 9.9a5.5 5.5 0 0 1-11 0c0-2.9 2.3-6.1 5.5-9.9z\"/><path d=\"M9.3 14.2a2.8 2.8 0 0 0 2.7 2.4\"/>","lock":"<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.5\"/><path d=\"M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7\"/><circle cx=\"12\" cy=\"15.5\" r=\"1.3\"/>","trophy":"<path d=\"M8 4h8v5a4 4 0 0 1-8 0z\"/><path d=\"M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4\"/><path d=\"M12 13v4M9 20h6M10 17h4\"/>","star":"<path d=\"M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.6l6-.9z\" fill=\"currentColor\"/>","coin":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.3v9.4\"/><path d=\"M9.4 9.6c0-1.3 1.2-2.3 2.6-2.3s2.6.9 2.6 2c0 2.6-5.2 1.3-5.2 3.9 0 1.1 1.2 2 2.6 2s2.6-.9 2.6-2.1\"/>","bars":"<path d=\"M5 20V13\"/><path d=\"M12 20V7\"/><path d=\"M19 20V10\"/>","user":"<circle cx=\"12\" cy=\"8\" r=\"3.6\"/><path d=\"M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5\"/>","gift":"<rect x=\"4\" y=\"10\" width=\"16\" height=\"10\" rx=\"1\"/><path d=\"M4 10h16M12 10v10\"/><path d=\"M12 10c-1.2-3.6-6.4-4-6.4-1.3S9 10 12 10ZM12 10c1.2-3.6 6.4-4 6.4-1.3S15 10 12 10Z\"/>","bank":"<path d=\"M4 10 12 4l8 6\"/><path d=\"M5 10v9M9.3 10v9M14.7 10v9M19 10v9\"/><path d=\"M3 21h18\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"8.2\"/><path d=\"M12 7.5V12l3.2 2\"/>","users":"<circle cx=\"9\" cy=\"8.3\" r=\"3.2\"/><path d=\"M2.8 19.5c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2\"/><path d=\"M15.5 6.3a3.1 3.1 0 0 1 0 6.1M18.8 19.5c0-2.7-1.8-5-4.3-5.8\"/>","atom":"<circle cx=\"12\" cy=\"12\" r=\"1.6\" fill=\"currentColor\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9\" ry=\"3.6\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9\" ry=\"3.6\" transform=\"rotate(60 12 12)\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9\" ry=\"3.6\" transform=\"rotate(120 12 12)\"/>","crown":"<path d=\"M4 18.5h16l-1.2-9-4 3.8-2.8-5.6-2.8 5.6-4-3.8z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"};
  ICON.tools = '<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3"/><path d="M5 4.5 9 8.5M4 9.5l3-3"/>';
  ICON.cat = '<path d="M5 9.5V4.5l3.5 3h7l3.5-3v5c1 1.3 1.5 2.8 1.5 4.5 0 4.1-3.8 6.5-8.5 6.5S3.5 18.1 3.5 14c0-1.7.5-3.2 1.5-4.5z"/><path d="M9 13.2h.01M15 13.2h.01M11 16c.6.5 1.4.5 2 0"/>';
  ICON.chat = '<path d="M5 17.5V8.5A3.5 3.5 0 0 1 8.5 5h7A3.5 3.5 0 0 1 19 8.5v5a3.5 3.5 0 0 1-3.5 3.5H10l-4 3z"/>';
  ICON.chart = '<path d="M4 19.5h16"/><path d="M7 16v-4M11 16V8M15 16v-6M19 16V5"/>';
  ICON.map = '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>';
  ICON.brand = '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>';
  ICON.flag = '<path d="M5 21V4.5M5 5h11l-2 3.5 2 3.5H5"/>';

  var TR = {
    ko: {
      "ARCIRCLE Wallet": "ARCIRCLE 지갑", Trade: "트레이드", Earn: "수익", Tools: "도구", More: "더보기", Play: "게임", "Enter Game World": "게임 월드 입장", Home: "홈", Wallet: "지갑", Search: "검색", Language: "언어", "Search & language": "검색 · 언어", Close: "닫기", Menu: "메뉴",
      Explore: "탐색", "Every coin on ArcPad, live": "ArcPad의 모든 코인 실시간", Launch: "런치", "Launch a coin with a real pool": "실제 풀과 함께 코인 발행", "Quantum Launch": "퀀텀 런치", "One price for everyone, no snipers": "모두 같은 가격, 스나이퍼 없음", "Game World": "게임 월드", "Walk ARCIRCLE World as a robot": "로봇이 되어 ARCIRCLE 월드를 걷기",
      Orders: "주문", "Limit, stop and DCA orders": "지정가·스탑·분할매수 주문", Predict: "예측", "Call UP or DOWN, up to $5": "UP/DOWN 예측, 최대 $5",
      Portfolio: "포트폴리오", "What your wallet holds": "내 지갑 보유 현황", "Fund a launch together": "함께 모금해서 런치",
      Creators: "크리에이터", "Relay Launch": "릴레이 런치", "Getting started": "시작하기",
      Staking: "스테이킹", "Lock $ARCIRCLE for veARCIRCLE": "$ARCIRCLE 락업 → veARCIRCLE", "Stake $ARCIA, earn $ARCIA": "$ARCIA 스테이킹, $ARCIA 보상",
      "NFT Vault": "NFT 볼트", "Fees buy NFTs for holders": "수수료로 홀더용 NFT 구매", Reward: "리워드", "The $ARCIRCLE burn engine": "$ARCIRCLE 소각 엔진",
      "Builder Mine": "빌더 마인", Airdrops: "에어드랍", "Every reward and where it stands": "모든 보상과 진행 상황", "Dig coins with 1 USDC": "1 USDC로 코인 채굴", Stats: "통계", "Invite friends": "친구 초대", "My profile": "내 프로필",
      "Her stage, Arc's AI idol": "Arc의 AI 아이돌 무대", "Her cat and his buyback": "ARCIA의 고양이와 바이백", "ARCIA trades new coins in public": "ARCIA가 새 코인을 공개 트레이딩",
      "Paste a token, get her safety call": "토큰 주소로 안전 판정 받기", "AI agents hire each other in USDC": "AI 에이전트끼리 USDC로 일 거래", "Talk to ARCIA": "ARCIA와 대화",
      Scanner: "스캐너", "Safety-scan any token": "토큰 안전 점검", Locker: "락커", "Lock tokens or LP": "토큰·LP 잠금", Bridge: "브리지", "Move coins between chains": "체인 간 코인 이동",
      Multisender: "멀티센더", "Send to many wallets at once": "여러 지갑에 한 번에 전송", Snapshot: "스냅샷", "Holder lists for airdrops": "에어드랍용 홀더 목록",
      Liquidity: "유동성", "Add and manage pool liquidity": "풀 유동성 추가·관리", Docs: "문서", "What's new": "새 소식", Whitepaper: "백서", Roadmap: "로드맵", Brand: "브랜드",
      "The core coin": "핵심 코인", "ARCIA's coin": "ARCIA의 코인", "Everything on ARCIRCLE PAD": "ARCIRCLE PAD 한눈에 보기",
      "Launch, buy and sell on Arc": "Arc에서 발행하고 사고팔기", "Stake, burn and get rewarded": "스테이킹·소각으로 보상받기", "Arc's AI idol and her crew": "Arc의 AI 아이돌과 친구들", "Free tools for any Arc token": "모든 Arc 토큰용 무료 도구",
    },
    zh: {
      "ARCIRCLE Wallet": "ARCIRCLE 钱包", Trade: "交易", Earn: "收益", Tools: "工具", More: "更多", Play: "游戏", "Enter Game World": "进入游戏世界", Home: "首页", Wallet: "钱包", Search: "搜索", Language: "语言", "Search & language": "搜索 · 语言", Close: "关闭", Menu: "菜单",
      Explore: "探索", "Every coin on ArcPad, live": "ArcPad 全部代币，实时", Launch: "发币", "Launch a coin with a real pool": "发行代币，自带真实池子", "Quantum Launch": "量子发射", "One price for everyone, no snipers": "所有人同一价格，没有狙击", "Game World": "游戏世界", "Walk ARCIRCLE World as a robot": "化身机器人漫游 ARCIRCLE 世界",
      Orders: "订单", "Limit, stop and DCA orders": "限价、止损和定投订单", Predict: "预测", "Call UP or DOWN, up to $5": "猜涨跌，最多 $5",
      Portfolio: "资产", "What your wallet holds": "你的钱包持仓", "Fund a launch together": "一起众筹发币",
      Creators: "创作者", "Relay Launch": "接力发币", "Getting started": "新手入门",
      Staking: "质押", "Lock $ARCIRCLE for veARCIRCLE": "锁仓 $ARCIRCLE 获得 veARCIRCLE", "Stake $ARCIA, earn $ARCIA": "质押 $ARCIA，赚 $ARCIA",
      "NFT Vault": "NFT 金库", "Fees buy NFTs for holders": "手续费为持有者购买 NFT", Reward: "奖励", "The $ARCIRCLE burn engine": "$ARCIRCLE 销毁引擎",
      "Builder Mine": "建造者矿场", Airdrops: "空投", "Every reward and where it stands": "所有奖励及进度", "Dig coins with 1 USDC": "用 1 USDC 挖币", Stats: "数据", "Invite friends": "邀请好友", "My profile": "我的主页",
      "Her stage, Arc's AI idol": "Arc 的 AI 偶像舞台", "Her cat and his buyback": "她的猫和回购", "ARCIA trades new coins in public": "ARCIA 公开交易新币",
      "Paste a token, get her safety call": "粘贴代币，获得安全判断", "AI agents hire each other in USDC": "AI 代理之间用 USDC 雇佣", "Talk to ARCIA": "和 ARCIA 聊天",
      Scanner: "扫描", "Safety-scan any token": "代币安全检查", Locker: "锁仓", "Lock tokens or LP": "锁定代币或 LP", Bridge: "跨链桥", "Move coins between chains": "跨链转移代币",
      Multisender: "批量转账", "Send to many wallets at once": "一次发给多个钱包", Snapshot: "快照", "Holder lists for airdrops": "空投用持有者名单",
      Liquidity: "流动性", "Add and manage pool liquidity": "添加和管理池子流动性", Docs: "文档", "What's new": "最新更新", Whitepaper: "白皮书", Roadmap: "路线图", Brand: "品牌",
      "The core coin": "核心代币", "ARCIA's coin": "ARCIA 的代币", "Everything on ARCIRCLE PAD": "ARCIRCLE PAD 一览",
      "Launch, buy and sell on Arc": "在 Arc 上发币和交易", "Stake, burn and get rewarded": "质押、销毁、获得奖励", "Arc's AI idol and her crew": "Arc 的 AI 偶像和她的伙伴", "Free tools for any Arc token": "适用于任何 Arc 代币的免费工具",
    },
  };
  var lang = function () { var l = (H.getAttribute("lang") || "").slice(0, 2); if (l !== "ko" && l !== "zh") { try { l = localStorage.getItem("arcircle.lang") || l; } catch (e) { /* private mode */ } } return l === "ko" || l === "zh" ? l : "en"; };
  var t = function (s) { var d = TR[lang()]; return (d && d[s]) || s; };
  var esc = function (x) { return String(x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var svg = function (k, cls) { return '<svg class="' + (cls || "anav-i") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[k] || "") + "</svg>"; };

  // ---- what's where: [id, label, description, link, icon] ----
  var GROUPS = [
    { id: "trade", label: "Trade", icon: "predict", line: "Launch, buy and sell on Arc",
      items: [["explore", "Explore", "Every coin on ArcPad, live", "/arc#explore", "grid"], ["launch", "Launch", "Launch a coin with a real pool", "/arc#launch", "rocket"],
        ["quantum", "Quantum Launch", "One price for everyone, no snipers", "/arc#quantum", "atom"],
        ["play", "Game World", "Walk ARCIRCLE World as a robot", "/play", "planet"],
        ["swap", "Swap", "Buy any Arc token with $ARCIRCLE", "/arc#swap", "swap"], ["orders", "Orders", "Limit, stop and DCA orders", "/arc#orders", "orders"], ["predict", "Predict", "Call UP or DOWN, up to $5", "/arc#predict", "predict"], ["paper", "Paper Trading", "Play money, live prices, weekly board", "/arc#paper", "trophy"],
        ["portfolio", "Portfolio", "What your wallet holds", "/arc#portfolio", "wallet"], ["circle", "CirclePad", "Fund a launch together", "/circle", "brand"]],
      more: [["perp", "Perps (soon)", "/arc#perp"], ["creators", "Creators", "/arc#creators"], ["relay", "Relay Launch", "/arc#relay"], ["start", "Getting started", "/start"]] },
    { id: "earn", label: "Earn", icon: "coin", line: "Stake, burn and get rewarded",
      items: [["staking", "Staking", "Lock $ARCIRCLE for veARCIRCLE", "/arc#staking", "stake"], ["vearcia", "veARCIA", "Stake $ARCIA, earn $ARCIA", "/arc#vearcia", "vea"],
        ["nft", "NFT Vault", "Fees buy NFTs for holders", "/arc#nft", "nft"], ["reward", "Reward", "The $ARCIRCLE burn engine", "/reward", "gift"],
        ["mine", "Builder Mine", "Dig coins with 1 USDC", "/arc#mine", "mine"], ["airdrops", "Airdrops", "Every reward and where it stands", "/airdrops", "drop"]],
      more: [["invite", "Invite friends", "/arc#portfolio"], ["stats", "Stats", "/stats"], ["me", "My profile", "/me"]] },
    { id: "arcia", label: "ARCIA", icon: "arcia", line: "Arc's AI idol and her crew",
      items: [["stage", "ARCIA", "Her stage, Arc's AI idol", "/arcia", "arcia"], ["arcat", "ARCAT", "Her cat and his buyback", "/arcat", "cat"],
        ["desk", "DESK", "ARCIA trades new coins in public", "/arc#desk", "desk"], ["agent", "AGENT", "Paste a token, get her safety call", "/arc#agent", "agent"],
        ["works", "WORKS", "AI agents hire each other in USDC", "/arc#works", "works"]],
      more: [["arcia", "Talk to ARCIA", "/arc#arcia"], ["arcia402", "ARCIA 402", "/arc#arcia402"]] },
    { id: "tools", label: "Tools", icon: "tools", line: "Free tools for any Arc token",
      items: [["scanner", "Scanner", "Safety-scan any token", "/arc#scanner", "scan"], ["locker", "Locker", "Lock tokens or LP", "/arc#locker", "lock"],
        ["bridge", "Bridge", "Move coins between chains", "/arc#bridge", "bridge"], ["multisend", "Multisender", "Send to many wallets at once", "/arc#multisend", "fan"],
        ["snapshot", "Snapshot", "Holder lists for airdrops", "/arc#snapshot", "snap"], ["liquidity", "Liquidity", "Add and manage pool liquidity", "/arc#liquidity", "drop"]],
      more: [["omni", "OMNI", "/arc#omni"], ["docs", "Docs", "/arc#docs"], ["whitepaper", "Whitepaper", "/whitepaper"], ["updates", "What's new", "/updates"], ["roadmap", "Roadmap", "/roadmap"], ["brand", "Brand", "/brand"], ["wallet", "ARCIRCLE Wallet", "/wallet"]] },
  ];
  // ArcPad tabs that live in a menu without being one of its items
  var ARC_EXTRA = { home: ["trade", "explore"], coin: ["trade", "explore"], compare: ["trade", "explore"], creator: ["trade", "creators"], arcircle: [null, null] };

  var path = (location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/").replace(/^\/arcpad$/, "/arc").replace(/^\/circlepad$/, "/circle");
  var onArc = path === "/arc";
  var arcTab = function () { var h = location.hash.replace(/^#\/?/, "").split(/[?/]/)[0]; return h && D.getElementById("bp-panel-" + h) ? h : "home"; };
  var curTab = onArc ? arcTab() : "";

  /// [group id, item id] for where we are
  function where() {
    if (onArc) {
      if (ARC_EXTRA[curTab]) return ARC_EXTRA[curTab];
      for (var i = 0; i < GROUPS.length; i++) {
        var g = GROUPS[i], all = g.items.concat(g.more);
        for (var j = 0; j < all.length; j++) if (all[j][all[j].length === 3 ? 2 : 3] === "/arc#" + curTab) return [g.id, all[j][0]];
      }
      return [null, null];
    }
    for (var a = 0; a < GROUPS.length; a++) {
      var gg = GROUPS[a], list = gg.items.concat(gg.more);
      for (var b = 0; b < list.length; b++) {
        var href = list[b][list[b].length === 3 ? 2 : 3];
        if (href.indexOf("#") < 0 && (path === href || path.indexOf(href + "/") === 0)) return [gg.id, list[b][0]];
      }
    }
    return [null, null];
  }

  // ---- following a link: on ArcPad, its own tabs switch in place ----
  function go(href, e) {
    var m = /^\/arc#([a-z0-9]+)$/.exec(href);
    if (m && onArc && D.getElementById("bp-panel-" + m[1]) && typeof window.arcpadShowTab === "function") {
      if (e) e.preventDefault();
      closeAll();
      window.arcpadShowTab(m[1]);
      return;
    }
    closeAll();
  }

  // ---- markup ----
  function itemHtml(it, here, cls) {
    var on = here[1] === it[0];
    return '<a class="' + cls + (on ? " on" : "") + '" href="' + esc(it[3]) + '"' + (on ? ' aria-current="page"' : "") + ">" +
      '<span class="anav-ib">' + svg(it[4]) + "</span><span class=\"anav-it-tx\"><b>" + esc(t(it[1])) + "</b><small>" + esc(t(it[2])) + "</small></span></a>";
  }
  function moreHtml(g) {
    return '<div class="anav-more"><span>' + esc(t("More")) + "</span>" + g.more.map(function (m) { return '<a href="' + esc(m[2]) + '">' + esc(t(m[1])) + "</a>"; }).join("") + "</div>";
  }
  function panelHtml(g, here) {
    return '<div class="anav-items">' + g.items.map(function (it) { return itemHtml(it, here, "anav-it"); }).join("") + "</div>" + moreHtml(g);
  }

  var root, tabs, sheet, strip, openG = null, lastFocus = null, hoverT = 0;
  var LANGS = [["en", "English"], ["ko", "한국어"], ["zh", "中文"]];

  function build() {
    var here = where();
    root = D.createElement("div");
    root.className = "anav";
    root.id = "anav";
    root.setAttribute("role", "banner");
    root.setAttribute("data-no-i18n", "");
    root.innerHTML =
      '<div class="anav-in">' +
        '<a class="anav-logo" href="/" aria-label="ARCIRCLE PAD — ' + esc(t("Home")) + '"><img src="/images/arcircle-mark-sm.webp" alt="" width="160" height="111"><span>ARCIRCLE</span></a>' +
        '<div class="anav-groups" role="navigation" aria-label="' + esc(t("Menu")) + '">' +
          GROUPS.map(function (g) {
            return '<div class="anav-g' + (here[0] === g.id ? " here" : "") + '" data-g="' + g.id + '">' +
              '<button type="button" class="anav-gb" aria-expanded="false" aria-controls="anav-p-' + g.id + '">' + esc(t(g.label)) + svg("chevron", "anav-chev") + "</button>" +
              '<div class="anav-panel" id="anav-p-' + g.id + '" hidden>' + panelHtml(g, here) + "</div></div>";
          }).join("") +
        "</div>" +
        '<div class="anav-right">' +
          '<button type="button" class="anav-ic anav-search" aria-label="' + esc(t("Search")) + '" hidden>' + svg("search") + "</button>" +
          '<div class="anav-lang"><button type="button" class="anav-ic anav-lb" aria-haspopup="true" aria-expanded="false" aria-label="' + esc(t("Language")) + '">' + lang().toUpperCase() + "</button>" +
            '<div class="anav-lmenu" hidden>' + LANGS.map(function (l) { return '<button type="button" data-l="' + l[0] + '"' + (lang() === l[0] ? ' aria-current="true"' : "") + ">" + l[1] + "</button>"; }).join("") + "</div></div>" +
          // phones (≤480px, arc-polish.css): search and language share this one button
          '<div class="anav-mx"><button type="button" class="anav-ic anav-mb" aria-haspopup="true" aria-expanded="false" aria-label="' + esc(t("Search & language")) + '">' + svg("search") + "<b>" + lang().toUpperCase() + "</b></button>" +
            '<div class="anav-mmenu" hidden><button type="button" data-act="search" hidden>' + svg("search") + "<span>" + esc(t("Search")) + "</span></button><hr data-act=\"search\" hidden><small>" + esc(t("Language")) + "</small>" +
              LANGS.map(function (l) { return '<button type="button" data-l="' + l[0] + '"' + (lang() === l[0] ? ' aria-current="true"' : "") + "><span>" + l[1] + "</span></button>"; }).join("") + "</div></div>" +
          // Game World from every page of the Platform World: a lit pill in the bar (the dock's centre button on phones)
          '<a class="anav-play" href="/play" title="' + esc(t("Enter Game World")) + '">' + svg("planet") + "<span>" + esc(t("Game World")) + "</span></a>" +
          '<a class="anav-chip" href="/arcircle" title="$ARCIRCLE — ' + esc(t("The core coin")) + '"><img src="/images/arcircle-mark-sm.webp" alt="" width="160" height="111"><span>$ARCIRCLE</span></a>' +
          '<a class="anav-chip" href="/arcia" title="$ARCIA — ' + esc(t("ARCIA's coin")) + '"><img src="/images/arcia-avatar-96.jpg" alt="" width="96" height="96" class="r"><span>$ARCIA</span></a>' +
          '<div class="cw"></div>' + // the wallet button: arc-connect.js fills it (the same one on every page)
        "</div>" +
      "</div>" +
      '<div class="anav-strip" role="navigation" aria-label="' + esc(t("Menu")) + ' 2" hidden><div class="anav-strip-in"></div></div>';

    tabs = D.createElement("div");
    tabs.className = "anav-tabs";
    tabs.setAttribute("role", "navigation");
    tabs.setAttribute("aria-label", t("Menu"));
    tabs.setAttribute("data-no-i18n", "");
    tabs.innerHTML = '<a class="anav-tab' + (path === "/" ? " on" : "") + '" href="/">' + svg("home") + "<span>" + esc(t("Home")) + "</span></a>" +
      GROUPS.map(function (g, i) { return (i === 2 ? '<a class="anav-tab anav-tab-play" href="/play" aria-label="' + esc(t("Enter Game World")) + '"><i>' + svg("planet") + "</i><span>" + esc(t("Play")) + "</span></a>" : "") + '<button type="button" class="anav-tab' + (here[0] === g.id ? " on" : "") + '" data-g="' + g.id + '" aria-haspopup="dialog">' + svg(g.icon) + "<span>" + esc(t(g.label)) + "</span></button>"; }).join("");

    sheet = D.createElement("div");
    sheet.className = "anav-sheet";
    sheet.hidden = true;
    sheet.setAttribute("data-no-i18n", "");
    sheet.innerHTML = '<div class="anav-scrim"></div><div class="anav-sheet-in" role="dialog" aria-modal="true" aria-labelledby="anav-sheet-h"><div class="anav-sheet-top"><b id="anav-sheet-h"></b><button type="button" class="anav-ic anav-x" aria-label="' + esc(t("Close")) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="anav-sheet-body"></div></div>';

    D.body.insertBefore(root, D.body.firstChild);
    D.body.appendChild(tabs);
    D.body.appendChild(sheet);
    strip = root.querySelector(".anav-strip");
    H.classList.add("anav-on");
    wire();
    paintStrip();
    paintMap();
    if (window.arcCmdk) showSearch();
  }
  function showSearch() { [].forEach.call(root.querySelectorAll('.anav-search, .anav-mmenu [data-act="search"]'), function (el) { el.hidden = false; }); }

  // the second row: this page's own tabs (CirclePad's sidebar), else the pages of the menu you're in
  function paintStrip() {
    var here = where(), inner = strip.querySelector(".anav-strip-in"), local = !onArc && D.querySelectorAll(".bp-sidebar .bp-nav-item[data-tab]");
    var html = "";
    if (local && local.length) {
      html = [].map.call(local, function (b) {
        var label = [].filter.call(b.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join("").trim();
        var ic = b.querySelector("svg");
        return '<button type="button" class="anav-st' + (b.classList.contains("active") ? " on" : "") + '" data-local="' + esc(b.dataset.tab) + '">' + (ic ? ic.outerHTML.replace("<svg", '<svg class="anav-i"') : "") + "<span>" + esc(label) + "</span></button>";
      }).join("");
      strip.classList.add("local");
    } else if (here[0]) {
      var g = GROUPS.filter(function (x) { return x.id === here[0]; })[0];
      html = g.items.map(function (it) { var on = here[1] === it[0]; return '<a class="anav-st' + (on ? " on" : "") + '" href="' + esc(it[3]) + '"' + (on ? ' aria-current="page"' : "") + ">" + svg(it[4]) + "<span>" + esc(t(it[1])) + "</span></a>"; }).join("");
      strip.classList.remove("local");
    }
    inner.innerHTML = html;
    strip.style.setProperty("--strip-acc", local && local.length ? "#39ff88" : ({ trade: "#4d8dff", earn: "#2fe6a4", arcia: "#ff7ad1", tools: "#8fb4d9" })[here[0]] || "#4d8dff");
    strip.hidden = !html;
    H.classList.toggle("anav-has-strip", !!html);
    H.classList.toggle("anav-has-local", !!html && strip.classList.contains("local"));
    var on = inner.querySelector(".on");
    if (on && inner.scrollWidth > inner.clientWidth) inner.scrollLeft = Math.max(0, on.offsetLeft - 24);
    // the menus and the bottom bar follow along
    [].forEach.call(root.querySelectorAll(".anav-g"), function (el) { el.classList.toggle("here", el.dataset.g === here[0]); });
    [].forEach.call(tabs.querySelectorAll(".anav-tab[data-g]"), function (el) { el.classList.toggle("on", el.dataset.g === here[0]); });
    [].forEach.call(root.querySelectorAll(".anav-panel"), function (p) {
      var g = GROUPS.filter(function (x) { return "anav-p-" + x.id === p.id; })[0];
      p.innerHTML = panelHtml(g, here);
    });
  }

  // the home page's map: the four menus side by side
  function paintMap() {
    var grid = D.getElementById("hm-map-grid"), h = D.getElementById("hm-map-h");
    if (!grid) return;
    if (h) { h.textContent = t("Everything on ARCIRCLE PAD"); h.setAttribute("data-no-i18n", ""); }
    grid.setAttribute("data-no-i18n", "");
    grid.innerHTML = GROUPS.map(function (g) {
      return '<div class="hm-mapc" data-g="' + g.id + '"><div class="hm-mapc-h">' + svg(g.icon) + "<div><b>" + esc(t(g.label)) + "</b><small>" + esc(t(g.line)) + "</small></div></div>" +
        '<div class="hm-mapc-l">' + g.items.map(function (it) { return '<a href="' + esc(it[3]) + '">' + svg(it[4]) + "<span><b>" + esc(t(it[1])) + "</b><small>" + esc(t(it[2])) + "</small></span></a>"; }).join("") + "</div></div>";
    }).join("");
  }

  // ---- open / close ----
  function setOpen(id) {
    if (openG === id) return;
    openG = id;
    [].forEach.call(root.querySelectorAll(".anav-g"), function (el) {
      var on = el.dataset.g === id;
      el.classList.toggle("open", on);
      el.querySelector(".anav-gb").setAttribute("aria-expanded", on ? "true" : "false");
      el.querySelector(".anav-panel").hidden = !on;
    });
  }
  function openSheet(id, from) {
    var g = GROUPS.filter(function (x) { return x.id === id; })[0];
    if (!g) return;
    lastFocus = from || D.activeElement;
    sheet.querySelector("#anav-sheet-h").textContent = t(g.label);
    sheet.querySelector(".anav-sheet-body").innerHTML = '<div class="anav-sheet-grid">' + g.items.map(function (it) { return itemHtml(it, where(), "anav-it"); }).join("") + "</div>" + moreHtml(g);
    sheet.hidden = false;
    H.classList.add("anav-locked");
    requestAnimationFrame(function () { sheet.classList.add("in"); });
    var x = sheet.querySelector(".anav-x"); if (x) x.focus();
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove("in");
    H.classList.remove("anav-locked");
    var done = function () { sheet.hidden = true; };
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) done(); else setTimeout(done, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function closeLang() {
    var m = root.querySelector(".anav-lmenu"); m.hidden = true; root.querySelector(".anav-lb").setAttribute("aria-expanded", "false");
    root.querySelector(".anav-mmenu").hidden = true; root.querySelector(".anav-mb").setAttribute("aria-expanded", "false");
  }
  function closeAll() { setOpen(null); closeSheet(); closeLang(); }

  function setLang(l) {
    closeLang();
    if (window.arcI18n && window.arcI18n.set) { window.arcI18n.set(l); return refresh(); }
    var own = D.querySelector('.langs [data-lang="' + l + '"], [data-lang="' + l + '"]:not(#anav *)');
    if (own) { own.click(); return setTimeout(refresh, 30); }
    try { localStorage.setItem("arcircle.lang", l); } catch (e) { /* private mode */ }
    location.reload();
  }
  // rebuild the labels in the page's language
  function refresh() {
    var keep = { strip: strip.querySelector(".anav-strip-in").scrollLeft };
    var tool = root.querySelector(".bp-topbar-right"), home = D.querySelector(".bp-topbar");
    if (tool && home) home.appendChild(tool);
    root.remove(); tabs.remove(); sheet.remove(); openG = null;
    build();
    if (init.place) init.place();
    strip.querySelector(".anav-strip-in").scrollLeft = keep.strip;
  }

  function wire() {
    var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
    [].forEach.call(root.querySelectorAll(".anav-g"), function (el) {
      var id = el.dataset.g, btn = el.querySelector(".anav-gb");
      btn.addEventListener("click", function (e) { e.stopPropagation(); closeLang(); setOpen(openG === id ? null : id); });
      btn.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(id); var f = el.querySelector(".anav-it"); if (f) f.focus(); }
      });
      if (fine) {
        el.addEventListener("mouseenter", function () { clearTimeout(hoverT); hoverT = setTimeout(function () { setOpen(id); }, openG ? 0 : 110); });
        el.addEventListener("mouseleave", function () { clearTimeout(hoverT); hoverT = setTimeout(function () { if (openG === id) setOpen(null); }, 180); });
      }
    });
    root.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (a && root.contains(a)) return go(a.getAttribute("href"), e);
      var st = e.target.closest("[data-local]");
      if (st) {
        var b = D.querySelector('.bp-sidebar .bp-nav-item[data-tab="' + st.dataset.local + '"]');
        if (b) b.click();
        setTimeout(paintStrip, 0);
      }
    });
    var lb = root.querySelector(".anav-lb"), lm = root.querySelector(".anav-lmenu");
    lb.addEventListener("click", function (e) { e.stopPropagation(); setOpen(null); var o = lm.hidden; lm.hidden = !o; lb.setAttribute("aria-expanded", o ? "true" : "false"); if (o) lm.querySelector("button").focus(); });
    lm.addEventListener("click", function (e) { var b = e.target.closest("[data-l]"); if (b) setLang(b.dataset.l); });
    var mb = root.querySelector(".anav-mb"), mm = root.querySelector(".anav-mmenu");
    mb.addEventListener("click", function (e) { e.stopPropagation(); setOpen(null); var o = mm.hidden; lm.hidden = true; mm.hidden = !o; mb.setAttribute("aria-expanded", o ? "true" : "false"); if (o) { var f = mm.querySelector("button:not([hidden])"); if (f) f.focus(); } });
    mm.addEventListener("click", function (e) {
      var b = e.target.closest("[data-l]"); if (b) return setLang(b.dataset.l);
      if (e.target.closest('[data-act="search"]')) { closeAll(); if (window.arcCmdk) window.arcCmdk.open(); }
    });
    root.querySelector(".anav-search").addEventListener("click", function () { closeAll(); if (window.arcCmdk) window.arcCmdk.open(); });
    tabs.addEventListener("click", function (e) { var b = e.target.closest("button[data-g]"); if (b) openSheet(b.dataset.g, b); });
    sheet.addEventListener("click", function (e) {
      if (e.target.closest(".anav-scrim, .anav-x")) return closeSheet();
      var a = e.target.closest("a[href]"); if (a) go(a.getAttribute("href"), e);
    });
  }

  function init() {
    if (D.getElementById("anav")) return;
    build();
    D.addEventListener("click", function (e) { if (root && !root.contains(e.target)) { setOpen(null); closeLang(); } });
    D.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!sheet.hidden) return closeSheet();
      if (openG) { var b = root.querySelector('.anav-g[data-g="' + openG + '"] .anav-gb'); setOpen(null); if (b) b.focus(); }
      closeLang();
    });
    // ArcPad: the menus follow the tab you're on
    D.addEventListener("arcpad:tab", function (e) { curTab = (e.detail && e.detail.tab) || arcTab(); paintStrip(); });
    if (onArc) window.addEventListener("hashchange", function () { curTab = arcTab(); paintStrip(); });
    // CirclePad: its sidebar tabs change from inside the page too
    var side = D.querySelector(".bp-sidebar");
    if (side && !onArc && "MutationObserver" in window) new MutationObserver(function () { clearTimeout(init.t); init.t = setTimeout(paintStrip, 30); }).observe(side, { subtree: true, attributes: true, attributeFilter: ["class"] });
    // the page changed its language (the site's switch, or ARCIA's own)
    D.addEventListener("arc:lang", function () { setTimeout(refresh, 0); });
    if ("MutationObserver" in window) new MutationObserver(function () { var l = lang(); if (l !== init.l) { init.l = l; refresh(); } }).observe(H, { attributes: true, attributeFilter: ["lang"] });
    init.l = lang();
    // ArcPad / CirclePad: their wallet button (and alerts) sit in this bar instead of a row of their own — on every
    // screen since v10 (one wallet button, not two). The ARCIRCLE Wallet link moves to Tools → More there.
    var tool = D.querySelector(".bp-topbar-right"), toolHome = tool && tool.parentNode, mq = window.matchMedia && matchMedia("all");
    if (tool && mq) {
      var place = function () {
        var right = root.querySelector(".anav-right");
        if (mq.matches && tool.parentNode !== right) right.insertBefore(tool, right.querySelector(".anav-wallet"));
        else if (!mq.matches && tool.parentNode !== toolHome) toolHome.appendChild(tool);
        H.classList.toggle("anav-tool-in", mq.matches);
      };
      place();
      init.place = place;
      if (mq.addEventListener) mq.addEventListener("change", place); else if (mq.addListener) mq.addListener(place);
    }
    // a palette that loads after us still gets its button
    setTimeout(function () { if (window.arcCmdk) showSearch(); }, 1500);
  }

  window.arcNav = { groups: GROUPS, refresh: function () { if (root) refresh(); } };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", init); else init();
})();
;
/* ---- arc-connect.js ---- */
// arc-connect.js — one wallet button for every ARCIRCLE PAD page (styles: arc-nav.css, .cw-*).
//
// The same control sits at the right end of the menu bar everywhere: "Connect wallet" until a wallet is connected,
// then the address with a menu — copy, network, balances, what's ready to claim, portfolio, recent transactions,
// explorer, disconnect. Two ways of working under the one look:
//   · app pages (ArcPad, CirclePad, Reward…): the page's own wallet code does the connecting (AppKit / WalletConnect,
//     Robinhood Chain, Solana); this reads state.account and calls connectWallet() / disconnectWallet() /
//     switchToArcNetwork() / switchToAltNetwork() / switchToSolana(). The page's own wallet slot is hidden.
//   · every other page: the browser's wallets (EIP-6963, else window.ethereum), with a small chooser when there are
//     several, links to open the site inside a wallet app on phones, and WalletConnect right on the page (QR code or
//     a phone's wallet app, through Reown's AppKit loaded only when it's picked), so a browser without a wallet
//     extension (Chrome, Edge, Safari on a computer) can still connect without leaving the page.
// A wallet connected on one page shows on the next (the address is remembered in this browser; signing reconnects
// when needed). "Disconnect" anywhere forgets it everywhere (shares ArcPad's homepad.walletDisconnected flag).
//   window.arcConnect: { address(), live(), connect(), disconnect(), provider(), mount(), on(fn) }
(function () {
  "use strict";
  if (window.arcConnect) return;
  var D = document, H = D.documentElement;
  var lang = function () { var l = (H.getAttribute("lang") || "en").slice(0, 2); if (l !== "ko" && l !== "zh") { try { l = localStorage.getItem("arcircle.lang") || l; } catch (e) { /* private */ } } return l === "ko" || l === "zh" ? l : "en"; };
  var L = function (en, ko, zh) { var l = lang(); return l === "ko" ? ko : l === "zh" ? zh : en; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "")); };
  var lc = function (a) { return String(a || "").toLowerCase(); };
  var short = function (a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } },
  };
  var KEY = "arc.cw", OFF = "homepad.walletDisconnected", TXK = "arc.cw.tx";
  var C = function () { return window.CONFIG || {}; };
  var ARC = { id: 5042, hex: "0x13b2", name: "Arc", rpc: "https://rpc.mainnet.arc.io", expl: "https://arc.etherscan.io", token: "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7" };
  var RH = { id: 4663, hex: "0x1237", name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", expl: "https://robinhoodchain.blockscout.com" };
  var subs = [];
  var api = (window.arcConnect = { on: function (fn) { subs.push(fn); } });

  // ---------------- which mode ----------------
  var appMode = function () { return typeof connectWallet === "function" && typeof state !== "undefined" && !!D.getElementById("wallet-slot"); };

  // ---------------- browser wallets (EIP-6963) ----------------
  var provs = new Map();
  window.addEventListener("eip6963:announceProvider", function (e) {
    var d = e.detail;
    if (d && d.info && d.provider) provs.set(d.info.rdns || d.info.uuid, d);
  });
  try { window.dispatchEvent(new Event("eip6963:requestProvider")); } catch (e) { /* old browser */ }
  function wallets() {
    var list = Array.from(provs.values());
    if (!list.length && window.ethereum) list.push({ info: { name: window.ethereum.isMetaMask ? "MetaMask" : window.ethereum.isRabby ? "Rabby" : L("Browser wallet", "브라우저 지갑", "浏览器钱包"), rdns: "injected", icon: "" }, provider: window.ethereum });
    return list;
  }

  // ---------------- the standalone session ----------------
  var S = { addr: "", live: false, prov: null, rdns: "", chain: 0 };
  function saved() { try { var j = JSON.parse(ls.get(KEY) || "null"); return j && isAddr(j.a) ? j : null; } catch (e) { return null; } }
  function remember(a, rdns) { if (isAddr(a)) ls.set(KEY, JSON.stringify({ a: lc(a), rdns: rdns || (saved() || {}).rdns || "", at: Date.now() })); ls.set(OFF, null); try { ls.set("arc.v10.acct", lc(a)); } catch (e) { /* fine */ } }
  function forget() { ls.set(KEY, null); ls.set(OFF, "1"); }
  function attach(p) {
    if (!p || p.__cw) return;
    p.__cw = true;
    try {
      p.on && p.on("accountsChanged", function (a) { if (appMode()) return; if (a && a[0]) { S.addr = lc(a[0]); S.live = true; remember(S.addr, S.rdns); } else { S.live = false; } paint(); emit(); });
      p.on && p.on("chainChanged", function (c) { if (appMode()) return; S.chain = parseInt(c, 16) || 0; paint(); });
    } catch (e) { /* provider without events */ }
  }
  function restore() {
    if (appMode()) return;
    var sv = saved();
    if (!sv || ls.get(OFF) === "1") return;
    S.addr = sv.a; S.rdns = sv.rdns; S.live = false;
    paint();
    // the wallets announce themselves within a moment: ask the one we used, quietly
    setTimeout(function () {
      var w = (sv.rdns && provs.get(sv.rdns)) || wallets()[0];
      if (!w) return;
      w.provider.request({ method: "eth_accounts" }).then(function (a) {
        a = (a || []).map(lc);
        if (a.indexOf(sv.a) >= 0) { S.prov = w.provider; S.live = true; attach(w.provider); return w.provider.request({ method: "eth_chainId" }).then(function (c) { S.chain = parseInt(c, 16) || 0; }); }
      }).catch(function () { /* stays remembered */ }).then(function () { paint(); emit(); });
    }, 350);
  }

  // ---------------- what everything else asks ----------------
  api.address = function () {
    if (appMode()) return typeof state !== "undefined" && state.account ? lc(state.account) : "";
    return S.addr;
  };
  api.live = function () { return appMode() ? !!(typeof state !== "undefined" && state.account) : S.live; };
  function chainId() {
    if (appMode()) { var c = typeof state !== "undefined" && state.chainId; return Number(c) || 0; }
    return S.chain;
  }
  /// an EIP-1193 provider for the connected wallet (connects first if needed)
  api.provider = function () {
    if (appMode()) return (typeof state !== "undefined" && state.walletProvider) || window.ethereum || null;
    if (S.live && S.prov) return Promise.resolve(S.prov);
    return api.connect().then(function () { return S.prov; });
  };
  function emit() { var a = api.address(); subs.forEach(function (fn) { try { fn(a); } catch (e) { /* listener's own */ } }); }

  // ---------------- connect / disconnect ----------------
  api.connect = function () {
    if (appMode()) {
      if (typeof setUserDisconnected === "function") setUserDisconnected(false);
      return Promise.resolve(connectWallet());
    }
    var list = wallets();
    if (list.length === 1) return use(list[0]);
    return chooser(list);
  };
  // the wallet's address. Some wallets answer the request with an empty list (Bitget Wallet on a non-EVM network,
  // a WalletConnect session that didn't include Arc, a phone coming back from the wallet app a moment early): ask
  // again quietly, use the address the WalletConnect session already holds, and only then say what to do.
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function accountsOf(w) {
    var p = w.provider, ok = function (a) { return a && a[0] && isAddr(a[0]); };
    return p.request({ method: "eth_requestAccounts" }).then(function (a) {
      if (ok(a)) return a;
      if (w.addr && isAddr(w.addr)) return [w.addr];
      return p.request({ method: "eth_accounts" }).catch(function () { return []; }).then(function (b) {
        if (ok(b)) return b;
        return wait(800).then(function () { return p.request({ method: "eth_accounts" }).catch(function () { return []; }); }).then(function (c) {
          if (ok(c)) return c;
          var x = new Error(L("Your wallet didn't share an address. In the wallet, pick an EVM account (Ethereum or Arc, not Bitcoin, Solana or Tron), then connect again.", "지갑이 주소를 보내주지 않았어요. 지갑에서 EVM 계정(이더리움 또는 Arc, 비트코인·솔라나·트론 아님)을 선택한 뒤 다시 연결해 주세요.", "钱包没有提供地址。请在钱包中选择 EVM 账户（以太坊或 Arc，而不是比特币、Solana 或 Tron），然后重新连接。"));
          x.noAccount = true; throw x;
        });
      });
    });
  }
  function use(w) {
    return accountsOf(w).then(function (a) {
      S.addr = lc(a[0]); S.live = true; S.prov = w.provider; S.rdns = w.info.rdns || "";
      attach(w.provider);
      remember(S.addr, S.rdns);
      closeChooser();
      return w.provider.request({ method: "eth_chainId" }).then(function (c) { S.chain = parseInt(c, 16) || 0; }).catch(function () {});
    }).then(function () {
      paint(); emit(); morph();
      if (window.arcTxRing && window.arcTxRing.celebrate) window.arcTxRing.celebrate();
      return S.addr;
    });
  }
  // ---------------- WalletConnect on this page (Reown AppKit, loaded on demand) ----------------
  var WC = null;
  function wcLoad() {
    if (WC) return WC;
    var cfg = C(), pid = cfg.REOWN_PROJECT_ID || "278f543c581f60eec5975dc755f0c3dd";
    // a blocked or very slow CDN mustn't leave the button spinning: after 15 s it counts as failed
    var slow = new Promise(function (_, no) { setTimeout(function () { no(new Error("timeout")); }, 15000); });
    WC = Promise.race([import("https://cdn.jsdelivr.net/npm/@reown/appkit-cdn@1.8.18/dist/appkit.min.js"), slow]).then(function (m) {
      var arc = { id: ARC.id, name: ARC.name, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC.rpc] } }, blockExplorers: { default: { name: "Explorer", url: ARC.expl } }, chainNamespace: "eip155", caipNetworkId: "eip155:" + ARC.id, testnet: false };
      // Ethereum is listed too: a wallet that doesn't know Arc yet (Bitget Wallet, for one) then still shares an
      // account. Signing in is a plain message signature, the same on any network.
      var eth = { id: 1, name: "Ethereum", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://cloudflare-eth.com"] } }, blockExplorers: { default: { name: "Etherscan", url: "https://etherscan.io" } }, chainNamespace: "eip155", caipNetworkId: "eip155:1", testnet: false };
      var ad = new m.WagmiAdapter({ projectId: pid, networks: [arc, eth] });
      var modal = m.createAppKit({
        adapters: [ad], networks: [arc, eth], defaultNetwork: arc, allowUnsupportedChain: true, projectId: pid,
        metadata: { name: "ARCIRCLE", description: "ARCIRCLE on Circle's Arc", url: location.origin, icons: [location.origin + "/images/arcircle-mark-sm.png"] },
        features: { email: false, socials: false, analytics: false },
        themeMode: "dark", themeVariables: { "--w3m-z-index": 20000, "--w3m-accent": "#35d8d0" },
      });
      return { modal: modal, config: ad.wagmiConfig, core: m.WagmiCore };
    });
    WC.catch(function () { WC = null; }); // a failed load can be tried again
    return WC;
  }
  /// connect through WalletConnect: an existing session comes back by itself; otherwise AppKit's modal opens
  function useWC() {
    closeChooser();
    return wcLoad().then(function (W) {
      return new Promise(function (resolve, reject) {
        var done = false, opened = false, iv = 0, unsub = null, t0 = Date.now();
        function finish(err, w) { if (done) return; done = true; clearInterval(iv); try { unsub && unsub(); } catch (e) { /* fine */ } if (err) reject(err); else resolve(w); }
        function check() {
          var a = W.core.getAccount(W.config);
          if (a && a.isConnected && a.address && a.connector && a.connector.getProvider) {
            a.connector.getProvider().then(function (p) { finish(null, { provider: p, addr: a.address, info: { name: a.connector.name || "WalletConnect", rdns: "walletconnect" } }); }, function (e) { finish(e); });
            return;
          }
          // a session from before reconnects within a moment; if there isn't one, open the modal
          if (!opened && Date.now() - t0 > 900) { opened = true; W.modal.open(); }
        }
        try { unsub = W.modal.subscribeState(function (st) { if (opened && st && !st.open) setTimeout(function () { check(); if (!done) { var x = new Error(L("The wallet wasn't connected.", "지갑이 연결되지 않았어요.", "钱包未连接。")); x.closed = true; finish(x); } }, 1500); }); } catch (e) { /* the poll covers it */ }
        iv = setInterval(check, 400); check();
      });
    }, function () { throw new Error(L("WalletConnect couldn't load here (the network or an ad blocker may be stopping it). Try again, or use a browser wallet or ARCIRCLE Wallet.", "여기서 WalletConnect를 불러오지 못했어요(네트워크나 광고 차단기가 막고 있을 수 있어요). 다시 시도하거나 브라우저 지갑 또는 ARCIRCLE Wallet을 써 주세요.", "这里无法加载 WalletConnect（可能被网络或广告拦截器阻止）。请重试，或使用浏览器钱包或 ARCIRCLE Wallet。")); }).then(function (w) { return use(w); });
  }
  api.walletConnect = useWC;

  api.disconnect = function () {
    closeMenu();
    if (appMode()) { ls.set(KEY, null); if (typeof disconnectWallet === "function") return Promise.resolve(disconnectWallet()); return Promise.resolve(); }
    var p = S.prov;
    S = { addr: "", live: false, prov: null, rdns: "", chain: 0 };
    forget();
    if (p && p.request) p.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(function () {});
    if (WC) WC.then(function (W) { try { W.core.disconnect(W.config); } catch (e) { /* fine */ } }).catch(function () {});
    paint(); emit();
    return Promise.resolve();
  };
  function switchTo(net) {
    closeMenu();
    if (appMode()) {
      if (net === "arc" && typeof switchToArcNetwork === "function") return switchToArcNetwork();
      if (net === "rh" && typeof switchToAltNetwork === "function") return switchToAltNetwork();
      if (net === "sol" && typeof switchToSolana === "function") return switchToSolana();
      return;
    }
    var n = net === "rh" ? RH : ARC, p = S.prov;
    if (!p) return api.connect();
    var cfg = C(), pons = cfg.PONS || {};
    var add = net === "rh"
      ? { chainId: RH.hex, chainName: RH.name, rpcUrls: [pons.RPC || RH.rpc], blockExplorerUrls: [pons.EXPLORER || RH.expl], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }
      : { chainId: cfg.CHAIN_ID_HEX || ARC.hex, chainName: cfg.CHAIN_NAME || ARC.name, rpcUrls: [cfg.RPC_URL || ARC.rpc], blockExplorerUrls: [cfg.BLOCK_EXPLORER || ARC.expl], nativeCurrency: cfg.NATIVE_CURRENCY || { name: "USDC", symbol: "USDC", decimals: 18 } };
    return p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: n.hex }] }).catch(function (e) {
      if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ""))) return p.request({ method: "wallet_addEthereumChain", params: [add] });
    }).then(function () { return p.request({ method: "eth_chainId" }); }).then(function (c) { S.chain = parseInt(c, 16) || 0; paint(); }).catch(function () {});
  }

  // ---------------- the chooser (several browser wallets, or none) ----------------
  var ch = null;
  function closeChooser() { if (ch) { ch.remove(); ch = null; } }
  function chooser(list) {
    return new Promise(function (resolve) {
      closeChooser();
      ch = D.createElement("div");
      ch.className = "cw-modal";
      ch.setAttribute("role", "dialog"); ch.setAttribute("aria-modal", "true"); ch.setAttribute("aria-label", L("Connect a wallet", "지갑 연결", "连接钱包"));
      var here = location.host + location.pathname + location.search;
      var phone = /Android|iPhone|iPad/i.test(navigator.userAgent || "");
      var rows = list.map(function (w, i) {
        return '<button type="button" class="cw-w" data-i="' + i + '">' + (w.info.icon ? '<img src="' + esc(w.info.icon) + '" alt="" width="28" height="28">' : '<span class="cw-wi" aria-hidden="true"></span>') + "<b>" + esc(w.info.name) + '</b><small>' + esc(w.info.rdns === "app.arcircle.wallet" ? L("Email, Google, Apple or X", "이메일·구글·애플·X", "邮箱、Google、Apple 或 X") : L("Installed", "설치됨", "已安装")) + "</small></button>";
      }).join("");
      var apps = phone ? '<div class="cw-sec">' + esc(L("Open this page in a wallet app", "지갑 앱에서 이 페이지 열기", "在钱包应用中打开本页")) + '</div>' +
        '<a class="cw-w" href="https://metamask.app.link/dapp/' + esc(here) + '"><span class="cw-wi mm" aria-hidden="true"></span><b>MetaMask</b><small>' + esc(L("Open in the app", "앱에서 열기", "在应用中打开")) + "</small></a>" +
        '<a class="cw-w" href="https://go.cb-w.com/dapp?cb_url=' + esc(encodeURIComponent(location.href)) + '"><span class="cw-wi cb" aria-hidden="true"></span><b>Coinbase Wallet</b><small>' + esc(L("Open in the app", "앱에서 열기", "在应用中打开")) + "</small></a>" +
        '<a class="cw-w" href="https://bkcode.vip?action=dapp&url=' + esc(encodeURIComponent(location.href)) + '"><span class="cw-wi bg" aria-hidden="true"></span><b>Bitget Wallet</b><small>' + esc(L("Open in the app", "앱에서 열기", "在应用中打开")) + "</small></a>" : "";
      ch.innerHTML = '<div class="cw-scrim" data-x></div><div class="cw-card">' +
        '<div class="cw-card-h"><b>' + esc(L("Connect a wallet", "지갑 연결", "连接钱包")) + '</b><button type="button" class="cw-x" data-x aria-label="' + esc(L("Close", "닫기", "关闭")) + '">×</button></div>' +
        (rows ? '<div class="cw-list">' + rows + "</div>" : '<p class="cw-none">' + esc(L("No wallet in this browser yet.", "이 브라우저에 지갑이 없어요.", "此浏览器还没有钱包。")) + "</p>") +
        '<p class="cw-err" role="alert" hidden></p>' +
        apps +
        '<div class="cw-sec">' + esc(L("More ways", "다른 방법", "更多方式")) + "</div>" +
        '<button type="button" class="cw-w" data-wc><span class="cw-wi wc" aria-hidden="true"></span><b>WalletConnect</b><small>' + esc(L("QR code, any wallet app", "QR 코드, 모든 지갑 앱", "二维码,任意钱包应用")) + "</small></button>" +
        // ARCIRCLE Wallet (email, Google, Apple or X): listed above where this page loads it, otherwise opened on /wallet
        (list.some(function (w) { return w.info && w.info.rdns === "app.arcircle.wallet"; }) ? "" : '<a class="cw-w" href="/wallet"><span class="cw-wi arc" aria-hidden="true"></span><b>ARCIRCLE Wallet</b><small>' + esc(L("Email, Google, Apple or X", "이메일·구글·애플·X", "邮箱、Google、Apple 或 X")) + "</small></a>") +
        "</div>";
      D.body.appendChild(ch);
      ch.addEventListener("click", function (e) {
        if (e.target.closest("[data-x]")) { closeChooser(); resolve(""); return; }
        var b = e.target.closest("[data-i]");
        var why = function (e) {
          var code = e && (e.code || (e.data && e.data.code)), m = (e && (e.shortMessage || e.message)) || "";
          if (code === -32002 || /already pending|already processing/i.test(m)) return L("Your wallet already has a request open. Click the wallet's icon in the browser toolbar to finish it.", "지갑에 이미 열린 요청이 있어요. 브라우저 툴바의 지갑 아이콘을 눌러 마저 진행해 주세요.", "钱包里已有一个未完成的请求。请点击浏览器工具栏中的钱包图标完成它。");
          if (code === 4001 || /reject|denied|cancel/i.test(m) || (e && e.closed)) return L("Cancelled in the wallet. Pick a wallet to try again.", "지갑에서 취소됐어요. 지갑을 골라 다시 시도해 주세요.", "已在钱包中取消。请选择钱包重试。");
          return m || L("Couldn't connect. Try again.", "연결하지 못했어요. 다시 시도해 주세요.", "无法连接，请重试。");
        };
        var fail = function (e) { if (!ch) { resolve(""); return; } var p = ch.querySelector(".cw-err"); if (p) { p.textContent = why(e); p.hidden = false; } };
        if (b) { use(list[Number(b.getAttribute("data-i"))]).then(resolve, fail); return; }
        var wcb = e.target.closest("[data-wc]"); if (wcb) { var sm = wcb.querySelector("small"); if (sm) sm.textContent = L("Opening WalletConnect…", "WalletConnect 여는 중…", "正在打开 WalletConnect…"); wcb.classList.add("busy"); }
        if (wcb) { useWC().then(resolve, function (err) { if (err && err.closed) { resolve(""); return; } chooser(list).then(resolve); setTimeout(function () { fail(err); }, 0); }); }
      });
      D.addEventListener("keydown", function k(e) { if (e.key === "Escape") { D.removeEventListener("keydown", k); closeChooser(); resolve(""); } });
      // WalletConnect takes a moment to load: start as soon as a pointer or the keyboard comes near it
      var wcBtn = ch.querySelector("[data-wc]"); if (wcBtn) ["pointerenter", "focus", "touchstart"].forEach(function (t) { wcBtn.addEventListener(t, function () { wcLoad().catch(function () {}); }, { once: true, passive: true }); });
      var first = ch.querySelector(".cw-w, .cw-x");
      if (first) first.focus();
    });
  }

  // ---------------- the button and its menu ----------------
  var root = null, btn = null, menu = null, claimN = 0, bal = null, balAt = 0, balFor = "";
  var ICON_W = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><circle cx="16" cy="13.5" r="1.2" fill="currentColor"/></svg>';
  var hue = function (a) { return (parseInt(String(a).slice(2, 8), 16) || 0) % 360; };
  function netOf(id) { return id === 5042 ? "arc" : id === 4663 ? "rh" : id ? "other" : ""; }
  function solOn() { try { return !!(window.arcSol && window.arcSol.selected && window.arcSol.selected()); } catch (e) { return false; } }
  function paint() {
    if (!btn) return;
    var a = api.address(), live = api.live(), net = netOf(chainId()), sol = appMode() && solOn();
    H.classList.toggle("cw-in", !!a);
    if (!a) {
      btn.className = "cw-b cw-off";
      btn.innerHTML = ICON_W + '<span class="cw-l">' + esc(L("Connect wallet", "지갑 연결", "连接钱包")) + '</span><span class="cw-s">' + esc(L("Connect", "연결", "连接")) + "</span>";
      btn.setAttribute("aria-label", L("Connect wallet", "지갑 연결", "连接钱包"));
      btn.setAttribute("aria-haspopup", "dialog");
      return;
    }
    var state_ = !live ? "rem" : sol ? "sol" : net === "arc" ? "ok" : net === "rh" ? "rh" : net ? "warn" : "ok";
    btn.className = "cw-b cw-on cw-" + state_;
    btn.innerHTML = '<span class="cw-av" style="--h:' + hue(a) + '" aria-hidden="true"></span><span class="cw-a" data-no-i18n>' + esc(short(a)) + '</span><i class="cw-dot" aria-hidden="true"></i>' + (claimN ? '<span class="cw-n" title="' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + '">' + claimN + "</span>" : "");
    btn.setAttribute("aria-label", L("Wallet", "지갑", "钱包") + " " + short(a));
    btn.setAttribute("aria-haspopup", "menu");
    if (menu && !menu.hidden) menuHtml();
  }
  function morph() {
    if (reduce || !btn) return;
    btn.classList.remove("cw-morph"); void btn.offsetWidth; btn.classList.add("cw-morph");
  }
  function rpc(url, calls) {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map(function (c, i) { return { jsonrpc: "2.0", id: i, method: c[0], params: c[1] }; })) })
      .then(function (r) { return r.json(); }).then(function (j) { var m = {}; (Array.isArray(j) ? j : [j]).forEach(function (x) { m[x.id] = x.result; }); return calls.map(function (_, i) { return m[i]; }); });
  }
  function balances(a) {
    if (bal && balFor === a && Date.now() - balAt < 30000) return Promise.resolve(bal);
    var cfg = C(), tok = cfg.ARCIRCLE_TOKEN || ARC.token;
    return rpc(cfg.RPC_URL || ARC.rpc, [["eth_getBalance", [a, "latest"]], ["eth_call", [{ to: tok, data: "0x70a08231" + a.slice(2).padStart(64, "0") }, "latest"]]]).then(function (r) {
      var n = function (h, d) { try { return Number(BigInt(h || "0x0") / 10n ** BigInt(d - 4)) / 1e4; } catch (e) { return null; } };
      bal = { usdc: n(r[0], 18), arc: n(r[1], 18) }; balAt = Date.now(); balFor = a;
      return bal;
    }).catch(function () { return null; });
  }
  var nf = function (v, d) { return v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }); };
  function txs() { try { return JSON.parse(ls.get(TXK) || "[]"); } catch (e) { return []; } }
  function menuHtml() {
    var a = api.address(), live = api.live(), id = chainId(), net = netOf(id), app = appMode();
    var expl = (C().BLOCK_EXPLORER || ARC.expl) + "/address/" + a;
    var list = txs().filter(function (t) { return !t.from || t.from === a; }).slice(0, 6);
    var netRow = !live ? '<div class="cw-note">' + esc(L("Remembered from your last visit. Connect to sign.", "지난 방문에서 기억한 지갑이에요. 서명하려면 연결하세요.", "上次访问记住的钱包。需要签名时请连接。")) + ' <button type="button" class="cw-link" data-cw="connect">' + esc(L("Connect", "연결", "连接")) + "</button></div>"
      : '<div class="cw-net">' + [["arc", "Arc"], ["rh", "Robinhood"]].concat(app && typeof switchToSolana === "function" ? [["sol", "Solana"]] : []).map(function (n) {
        var on = n[0] === "sol" ? solOn() : !solOn() && net === n[0];
        return '<button type="button" data-cw="net" data-net="' + n[0] + '" aria-pressed="' + on + '"><i aria-hidden="true"></i>' + n[1] + "</button>";
      }).join("") + "</div>" + (net === "other" ? '<button type="button" class="cw-warn" data-cw="net" data-net="arc">' + esc(L("Wrong network — switch to Arc", "다른 네트워크 — Arc로 전환", "网络不对 — 切换到 Arc")) + "</button>" : "");
    menu.innerHTML =
      '<div class="cw-m-h"><span class="cw-av lg" style="--h:' + hue(a) + '" aria-hidden="true"></span><div><b data-no-i18n>' + esc(short(a)) + '</b><button type="button" class="cw-link" data-cw="copy">' + esc(L("Copy address", "주소 복사", "复制地址")) + "</button></div></div>" +
      netRow +
      '<div class="cw-bal" data-cw-bal><div><small>USDC · Arc</small><b data-no-i18n>' + (bal && balFor === a ? nf(bal.usdc, 2) : "…") + '</b></div><div><small>$ARCIRCLE</small><b data-no-i18n>' + (bal && balFor === a ? nf(bal.arc, 0) : "…") + "</b></div></div>" +
      '<a class="cw-i" href="/me?w=' + esc(a) + '"><span>' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + "</span>" + (claimN ? '<em class="cw-n">' + claimN + "</em>" : "<small>" + esc(L("My ARCIRCLE", "My ARCIRCLE", "My ARCIRCLE")) + "</small>") + "</a>" +
      '<a class="cw-i" href="/arc#portfolio"><span>' + esc(L("Portfolio", "포트폴리오", "资产")) + "</span></a>" +
      '<details class="cw-tx"' + (list.length ? "" : " hidden") + "><summary>" + esc(L("Recent transactions", "최근 거래", "最近交易")) + " <small>" + list.length + "</small></summary><ul>" +
        list.map(function (t) { return '<li class="' + esc(t.s) + '"><a href="' + esc(t.ex + "/tx/" + t.h) + '" target="_blank" rel="noopener"><i aria-hidden="true"></i><span data-no-i18n>' + esc(t.h.slice(0, 10) + "…" + t.h.slice(-4)) + "</span><small>" + esc(t.s === "ok" ? L("Confirmed", "완료", "已确认") : t.s === "fail" ? L("Failed", "실패", "失败") : L("Pending", "대기 중", "待确认")) + " · " + esc(ago(t.t)) + "</small></a></li>"; }).join("") +
      "</ul></details>" +
      '<a class="cw-i" href="' + esc(expl) + '" target="_blank" rel="noopener"><span>' + esc(L("View on explorer", "익스플로러에서 보기", "在浏览器中查看")) + " ↗</span></a>" +
      '<button type="button" class="cw-i cw-dis" data-cw="disconnect"><span>' + esc(L("Disconnect", "연결 해제", "断开连接")) + "</span></button>";
  }
  function ago(t) { var s = Math.max(1, (Date.now() - t) / 1000); return s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; }
  // on a phone the menu is a sheet fixed to the bottom of the screen; inside the top bar it can't be (the bar's
  // backdrop blur makes it the box that "fixed" measures from, so the sheet landed above the screen), so it goes to <body>
  var phoneQ = window.matchMedia ? matchMedia("(max-width:900px)") : null;
  function openMenu() {
    if (!menu) return;
    var want = phoneQ && phoneQ.matches ? D.body : root; if (menu.parentNode !== want) want.appendChild(menu);
    menuHtml(); menu.hidden = false; btn.setAttribute("aria-expanded", "true");
    var a = api.address();
    balances(a).then(function () { if (!menu.hidden) menuHtml(); });
    claims();
  }
  function closeMenu() { if (menu && !menu.hidden) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } }
  var claimAt = 0;
  function claims() {
    var a = api.address();
    if (!a || !window.arcV10 || !window.arcV10.claims || Date.now() - claimAt < 60000) return;
    claimAt = Date.now();
    window.arcV10.claims(a).then(function (rows) { claimN = rows.filter(function (r) { return r.ready && !r.other; }).length; paint(); }).catch(function () {});
  }
  api.mount = function () {
    var right = D.querySelector(".anav-right");
    if (!right) return;
    var have = right.querySelector(".cw");
    if (have && have.querySelector(".cw-b")) { root = have; return; }
    root = have || D.createElement("div");
    root.className = "cw";
    root.innerHTML = '<button type="button" class="cw-b"></button><div class="cw-m" role="menu" hidden></div>';
    if (!have) { var old = right.querySelector(".anav-wallet"); if (old) old.replaceWith(root); else right.appendChild(root); }
    btn = root.querySelector(".cw-b"); menu = root.querySelector(".cw-m");
    H.classList.add("cw-on");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!api.address()) { api.connect(); return; }
      if (menu.hidden) openMenu(); else closeMenu();
    });
    menu.addEventListener("click", function (e) {
      var t = e.target.closest("[data-cw]");
      if (!t) return;
      e.stopPropagation();
      var k = t.getAttribute("data-cw");
      if (k === "copy") { if (navigator.clipboard) navigator.clipboard.writeText(api.address()); t.textContent = L("Copied", "복사됨", "已复制"); setTimeout(function () { t.textContent = L("Copy address", "주소 복사", "复制地址"); }, 1200); }
      else if (k === "disconnect") api.disconnect();
      else if (k === "connect") { closeMenu(); api.connect(); }
      else if (k === "net") switchTo(t.getAttribute("data-net"));
    });
    D.addEventListener("click", function (e) { if (root && !root.contains(e.target) && !(menu && menu.contains(e.target))) closeMenu(); });
    D.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu && !menu.hidden) { closeMenu(); btn.focus(); } });
    // the bell sits next to the wallet on every page (ArcPad / CirclePad bring their own inside the bar already)
    if (!right.querySelector(".nb") && window.arcChrome && window.arcChrome.mountBell) window.arcChrome.mountBell(right, root);
    paint();
  };

  // ---------------- recent transactions (from the tx ring, arc-txring.js) ----------------
  D.addEventListener("arc:tx", function (e) {
    var d = e.detail || {};
    if (!d.h) return;
    var list = txs().filter(function (t) { return t.h !== d.h; });
    var prev = txs().find(function (t) { return t.h === d.h; });
    list.unshift({ h: d.h, s: d.s, t: prev ? prev.t : Date.now(), ex: d.ex || ARC.expl, from: api.address() });
    ls.set(TXK, JSON.stringify(list.slice(0, 20)));
    if (menu && !menu.hidden) menuHtml();
  });

  // ---------------- app pages: follow the page's own wallet ----------------
  function follow() {
    var last = null;
    var sync = function () {
      if (D.hidden || !appMode()) return;
      var a = api.address(), key = a + "|" + chainId() + "|" + solOn();
      if (key === last) return;
      var was = last;
      last = key;
      if (a) remember(a); else if (was && ls.get(OFF) === "1") ls.set(KEY, null);
      if (a && was !== null && was.split("|")[0] === "") morph();
      paint(); emit(); claims();
    };
    setInterval(sync, 500);
    D.addEventListener("visibilitychange", sync);
    // ArcPad's connect from another page: /arc?connect=1 opens it once the page is ready
    if (/[?&]connect=1\b/.test(location.search) && appMode()) {
      setTimeout(function () { if (!api.address()) api.connect(); try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* fine */ } }, 1200);
    }
  }

  function init() {
    api.mount();
    restore();
    follow();
    setTimeout(claims, 2500);
    // the bar is rebuilt on a language change
    D.addEventListener("arc:lang", function () { setTimeout(function () { root = null; api.mount(); }, 80); });
    setInterval(function () { if (D.hidden) return; var r = D.querySelector(".anav-right"); if (r && !r.querySelector(".cw-b")) { root = null; api.mount(); } }, 1000);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); }); else setTimeout(init, 0);
})();
;
/* ---- arc-v9.js ---- */
// arc-v9.js — the v9 cleanup's behaviour, shared by every ARCIRCLE PAD page (styles: arc-v9.css).
// Each part checks for its own page and does nothing elsewhere. Plain script, no dependencies.
(function () {
  "use strict";
  if (window.arcV9) return;
  var D = document, H = D.documentElement;
  var lang = function () { var l = (H.getAttribute("lang") || "en").slice(0, 2); return l === "ko" || l === "zh" ? l : "en"; };
  var L = function (en, ko, zh) { var l = lang(); return l === "ko" ? ko : l === "zh" ? zh : en; };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phone = function () { return window.innerWidth <= 900; };
  var api = (window.arcV9 = {});

  // ---- utility guides: keep the newest "New in vN", fold the older ones into one line ----
  function foldNews() {
    var groups = new Map();
    [].forEach.call(D.querySelectorAll(".bp-panel details > summary > h3"), function (h) {
      if (!/^\s*New in v\d+/.test(h.textContent)) return;
      var det = h.parentNode.parentNode, par = det.parentNode;
      if (det.closest(".v9-older")) return;
      if (!groups.has(par)) groups.set(par, []);
      groups.get(par).push(det);
    });
    groups.forEach(function (list) {
      list.forEach(function (d) { d.open = false; });
      if (list.length < 2) return;
      var keep = list[0], rest = list.slice(1);
      var box = D.createElement("details");
      box.className = "v9-older";
      box.innerHTML = '<summary><span data-v9t="older">' + L("Earlier updates", "이전 업데이트", "更早的更新") + "</span> (" + rest.length + ')<a href="/updates" data-v9t="all">' + L("All updates", "전체 업데이트", "全部更新") + "</a></summary>";
      keep.parentNode.insertBefore(box, keep.nextSibling);
      rest.forEach(function (d) { box.appendChild(d); });
    });
  }

  // ---- phones: a Buy / Sell bar on the coin page ----
  function buyBar() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel) return;
    var bar = D.createElement("div");
    bar.className = "v9-buybar";
    bar.hidden = true;
    bar.setAttribute("data-no-i18n", "");
    D.body.appendChild(bar);
    var paint = function () { bar.innerHTML = '<button type="button" class="b" data-s="buy">' + L("Buy", "매수", "买入") + '</button><button type="button" class="s" data-s="sell">' + L("Sell", "매도", "卖出") + "</button>"; };
    paint();
    var target = function () { var a = D.getElementById("apc-argus-trade"); return a && !a.hidden && a.offsetParent ? a : D.getElementById("apc-swap"); };
    var on = function () { return panel.classList.contains("active") && /^#coin\//.test(location.hash) && phone(); };
    var sync = function () {
      var show = on();
      bar.hidden = !show;
      H.classList.toggle("v9-buybar-on", show);
      if (!show) return;
      var t = target(), r = t && t.getBoundingClientRect();
      bar.classList.toggle("away", !!(r && r.top < innerHeight - 120 && r.bottom > 120));
    };
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-s]"); if (!b) return;
      var t = target(); if (!t) return;
      var side = t.querySelector('[data-side="' + b.dataset.s + '"], .' + b.dataset.s);
      if (side) side.click();
      var y = t.getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(H).getPropertyValue("--anav-h"), 10) || 56) - 60;
      scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
      setTimeout(function () { var i = t.querySelector("input"); if (i) i.focus({ preventScroll: true }); }, reduce ? 0 : 450);
    });
    addEventListener("scroll", function () { if (!bar.hidden) requestAnimationFrame(sync); }, { passive: true });
    addEventListener("resize", sync);
    addEventListener("hashchange", function () { setTimeout(sync, 60); });
    D.addEventListener("arcpad:tab", function () { setTimeout(sync, 60); });
    D.addEventListener("arc:lang", paint);
    setTimeout(sync, 400);
  }


  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  // the page's own top-level state (ArcPad's scripts declare these with const/let, so they aren't on window)
  /* global APC, ARC, state */
  var G = function (name) {
    if (name === "APC") return typeof APC !== "undefined" ? APC : undefined;
    if (name === "ARC") return typeof ARC !== "undefined" ? ARC : undefined;
    if (name === "state") return typeof state !== "undefined" ? state : undefined;
    return undefined;
  };
  var usd = function (v) { return v >= 1000 ? "$" + (v / 1000).toFixed(v >= 1e4 ? 0 : 1) + "K" : "$" + v.toFixed(v >= 10 ? 0 : 2); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  // ---- ArcPad: "your first launch in 3 steps" on the Launch tab ----
  function launchGuide() {
    var panel = D.getElementById("bp-panel-launch"), form = D.getElementById("ap-launch-form");
    if (!panel || !form || store.get("v9.guide.off") === "1") return;
    var box = D.createElement("div");
    box.className = "v9-guide ap-only";
    box.id = "v9-guide";
    box.setAttribute("data-no-i18n", "");
    var lede = panel.querySelector(":scope > .bp-lede");
    if (lede) lede.parentNode.insertBefore(box, lede.nextSibling); else form.parentNode.insertBefore(box, form);
    var bal = null, busy = false;
    function acct() { var st = G("state"); return st && st.account ? st.account : null; }
    function paint() {
      var a = acct(), need = 1.1, okBal = bal != null && bal >= need;
      var step = function (n, done, title, body, act) {
        return '<li class="' + (done ? "done" : "") + '"><span class="v9-n">' + (done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>' : n) + '</span><div><b>' + title + "</b><small>" + body + "</small></div>" + (act || "") + "</li>";
      };
      box.innerHTML = '<div class="v9-guide-h"><b>' + L("Your first launch in 3 steps", "첫 런치, 3단계면 끝", "三步完成第一次发币") + '</b><button type="button" class="v9-x" data-g="off" aria-label="' + L("Hide", "숨기기", "隐藏") + '">×</button></div><ol>' +
        step(1, !!a, L("Connect a wallet", "지갑 연결", "连接钱包"), a ? esc(a.slice(0, 6) + "…" + a.slice(-4)) : L("MetaMask, Rabby or any wallet that can add Arc.", "MetaMask, Rabby 등 Arc를 추가할 수 있는 지갑이면 돼요.", "MetaMask、Rabby 或任何能添加 Arc 的钱包。"),
          a ? "" : '<button type="button" class="v9-gb" data-g="connect">' + L("Connect", "연결", "连接") + "</button>") +
        step(2, okBal, L("Have about 1.1 USDC on Arc", "Arc에 USDC 약 1.1개", "在 Arc 上准备约 1.1 USDC"),
          (bal != null ? L("You have ", "보유: ", "你有 ") + bal.toFixed(2) + " USDC · " : "") + L("1 USDC launch fee + gas. On Arc, gas is paid in USDC too.", "런치 수수료 1 USDC + 가스비. Arc에서는 가스비도 USDC로 내요.", "1 USDC 发币费 + gas。在 Arc 上 gas 也用 USDC 支付。"),
          okBal ? "" : '<a class="v9-gb ghost" href="/arc#bridge" data-g="bridge">' + L("Bridge USDC", "USDC 브리지", "跨链 USDC") + "</a>") +
        step(3, false, L("Name it and launch", "이름 짓고 런치", "起名并发币"), L("Name, ticker and a logo. Stuck on a name? Ask ARCIA for ideas.", "이름, 티커, 로고만 있으면 돼요. 이름이 고민되면 ARCIA에게 물어보세요.", "名称、代码和 Logo 即可。想不出名字?让 ARCIA 给点子。"),
          '<button type="button" class="v9-gb" data-g="start">' + L("Start", "시작", "开始") + "</button>") + "</ol>";
    }
    function refresh() {
      var a = acct();
      if (!a || busy || typeof readProvider !== "function") { if (!a) bal = null; paint(); return; }
      busy = true;
      Promise.resolve(readProvider().getBalance(a)).then(function (b) { bal = Number(b) / 1e18; }).catch(function () { /* keep */ }).then(function () { busy = false; paint(); });
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-g]"); if (!b) return;
      var g = b.dataset.g;
      if (g === "off") { store.set("v9.guide.off", "1"); box.remove(); return; }
      if (g === "connect" && typeof connectWallet === "function") { Promise.resolve(connectWallet()).then(refresh, refresh); }
      if (g === "start") { var n = D.getElementById("ap-name"); if (n) { n.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); setTimeout(function () { n.focus({ preventScroll: true }); }, reduce ? 0 : 400); } }
    });
    D.addEventListener("arcpad:tab", function (e) { if (e.detail && e.detail.tab === "launch") refresh(); });
    D.addEventListener("arc:wallet", refresh);
    D.addEventListener("arc:lang", paint);
    setInterval(function () { if (panel.classList.contains("active") && !D.hidden) refresh(); }, 15000);
    var lastA = null;
    var acctCheck = function () { if (D.hidden) return; var a = acct(); if (a !== lastA) { lastA = a; refresh(); } };
    setInterval(acctCheck, 1500);
    D.addEventListener("visibilitychange", acctCheck);
    refresh();
  }

  // ---- ArcPad coin page: what the creator has earned, and Telegram alerts after "Watch" ----
  function coinExtras() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel) return;
    var line = null;
    function creatorBps() { var A = G("APC"); if (!A || !A.l) return null; if (A.l.platform && A.l.platform !== "arcpad") return null; return 70 + Number(A.l.extraFeeBps || 0); }
    function paintEarn() {
      var A = G("APC");
      if (!A || !A.token || !panel.classList.contains("active")) return;
      var bps = creatorBps(); if (bps == null) { if (line) line.hidden = true; return; }
      var full = A.logs && A.logs.lo <= A.logs.launchBlock, trades = A.trades || [];
      var vol = 0; for (var i = 0; i < trades.length; i++) vol += Number(trades[i].usdc) || 0;
      if (!line) { line = D.createElement("div"); line.className = "v9-earn"; line.setAttribute("data-no-i18n", ""); var host = panel.querySelector(".ac2-stats, .apc-stats, .ac2-grid") || panel.querySelector(".ac2-head"); if (!host) return; host.parentNode.insertBefore(line, host.nextSibling); }
      line.hidden = false;
      var earned = vol * bps / 10000;
      line.innerHTML = '<span class="v9-earn-i" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.6 9.8c0-1.2 1.1-2 2.4-2s2.4.8 2.4 1.9c0 2.4-4.8 1.2-4.8 3.6 0 1.1 1.1 1.9 2.4 1.9s2.4-.8 2.4-2"/></svg></span><span>' +
        (full ? L("The creator has earned", "크리에이터 누적 수익", "创作者已赚取") + ' <b>≈ ' + usd(earned) + "</b>" : L("Counting what the creator has earned…", "크리에이터 수익 계산 중…", "正在统计创作者收益…")) +
        ' <small>' + L("— ", "· ", "· ") + (bps / 100).toFixed(2) + "% " + L("of every trade goes to whoever launched it", "가 매 거래마다 런처에게 가요", "的每笔交易归发行者") + "</small></span>" +
        '<a href="/arc#launch" class="v9-earn-go">' + L("Launch yours", "나도 런치하기", "发行你的币") + "</a>";
    }
    setInterval(function () { if (!D.hidden) paintEarn(); }, 4000);
    D.addEventListener("arcpad:tab", function () { setTimeout(paintEarn, 800); });
    // starring a coin → offer ARCIA's Telegram DM for it
    D.addEventListener("click", function (e) {
      var st = e.target.closest && e.target.closest("#apc-star"); if (!st) return;
      setTimeout(function () {
        var old = D.getElementById("v9-tgpop"); if (old) old.remove();
        if (st.getAttribute("aria-pressed") !== "true") return;
        var pop = D.createElement("div");
        pop.id = "v9-tgpop"; pop.className = "v9-tgpop"; pop.setAttribute("role", "status"); pop.setAttribute("data-no-i18n", "");
        pop.innerHTML = "<span>" + L("Watching. Want ARCIA to DM you when it moves 20%?", "관심 등록 완료. 20% 움직이면 ARCIA가 DM으로 알려드릴까요?", "已关注。涨跌 20% 时让 ARCIA 私信你?") + '</span><button type="button" class="bp-btn-primary sm" data-v7tg>' + L("Telegram alerts", "텔레그램 알림", "Telegram 提醒") + '</button><button type="button" class="v9-x" aria-label="' + L("Close", "닫기", "关闭") + '">×</button>';
        st.parentNode.insertBefore(pop, st.nextSibling);
        pop.querySelector(".v9-x").addEventListener("click", function () { pop.remove(); });
        setTimeout(function () { if (pop.isConnected) pop.remove(); }, 12000);
      }, 60);
    });
    // the launch banner: more ways to tell people, and a moment of celebration
    new MutationObserver(function () {
      var c = D.getElementById("apc-celebrate");
      if (!c || c.__v9) return;
      c.__v9 = true;
      var tok = c.dataset.token, url = typeof arcCoinShareUrl === "function" ? arcCoinShareUrl(tok) : location.origin + "/c/" + tok;
      var acts = c.querySelector(".apc-cel-actions");
      if (acts) {
        var tg = D.createElement("a");
        tg.className = "apc-cel-btn"; tg.target = "_blank"; tg.rel = "noopener";
        tg.href = "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(L("Just launched on ArcPad (Circle's Arc)", "ArcPad에서 방금 런치했어요 (Circle Arc)", "刚在 ArcPad 发币 (Circle Arc)"));
        tg.textContent = "Telegram";
        var emb = D.createElement("button");
        emb.type = "button"; emb.className = "apc-cel-btn"; emb.textContent = L("Embed", "임베드", "嵌入");
        emb.addEventListener("click", function () { var b = D.getElementById("v7-embed-b"); if (b) b.click(); });
        var x = acts.querySelector(".apc-cel-x");
        acts.insertBefore(tg, x); acts.insertBefore(emb, x);
      }
      if (!reduce) confetti(c);
    }).observe(panel, { childList: true, subtree: true });
  }
  // a short burst of the two ring colours from an element
  function confetti(host) {
    var r = host.getBoundingClientRect(), layer = D.createElement("div");
    layer.className = "v9-confetti"; layer.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 46; i++) {
      var p = D.createElement("i"), a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 220;
      p.style.cssText = "left:" + (r.left + r.width / 2) + "px;top:" + (r.top + 30) + "px;--x:" + Math.cos(a) * d + "px;--y:" + (Math.sin(a) * d - 120) + "px;--r:" + (Math.random() * 720 - 360) + "deg;background:" + (i % 3 ? (i % 2 ? "#4d8dff" : "#2fe6a4") : "#ffffff") + ";animation-delay:" + Math.random() * 120 + "ms";
      layer.appendChild(p);
    }
    D.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 1800);
  }
  api.confetti = confetti;

  // ---- ArcPad launch form: what the creator's cut could look like ----
  function feeEstimate() {
    var slider = D.getElementById("ap-extrafee"), prev = D.getElementById("ap-fee-preview");
    if (!slider || !prev) return;
    var out = D.createElement("p"); out.className = "v9-feeest"; out.setAttribute("data-no-i18n", "");
    prev.parentNode.insertBefore(out, prev.nextSibling);
    var paint = function () { var bps = 70 + Number(slider.value || 0); out.innerHTML = L("At $10K of trading a day, you'd earn about ", "하루 거래량이 $10K면 약 ", "如果每天交易 $10K,你约赚 ") + "<b>$" + (10000 * bps / 10000).toFixed(0) + L("/day", "/일", "/天") + "</b>" + L(" — paid out on every trade, no claiming.", " 을 벌어요 — 매 거래마다 바로 지급, 클레임 필요 없음.", " —— 每笔交易即时到账,无需领取。"); };
    slider.addEventListener("input", paint); D.addEventListener("arc:lang", paint); paint();
  }

  // ---- ArcPad home: newest coins nobody has bought yet ----
  function firstBuyer() {
    var home = D.getElementById("bp-panel-home"), trend = D.getElementById("v6-trend");
    if (!home || !trend || !D.getElementById("bp-panel-launch")) return;
    var box = D.createElement("div"); box.className = "v9-first"; box.hidden = true; box.setAttribute("data-no-i18n", "");
    trend.parentNode.insertBefore(box, trend.nextSibling);
    function paint() {
      var A = G("ARC"); if (!A || !A.launches || !A.launches.length || typeof arcAnyStats !== "function") return;
      var now = Date.now() / 1000;
      var list = A.launches.filter(function (l) { return (!l.platform || l.platform === "arcpad") && l.launchedAt && now - l.launchedAt < 14 * 86400; })
        .filter(function (l) { var s = arcAnyStats(l); return !s || !s.trades; }).sort(function (a, b) { return b.launchedAt - a.launchedAt; }).slice(0, 3);
      if (!list.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<div class="v6-sec-h"><h3>' + L("Be the first buyer", "첫 번째 구매자 되기", "成为第一个买家") + "</h3><small>" + L("New coins with no trades in the last 24 hours", "최근 24시간 거래가 없는 새 코인", "近 24 小时无交易的新币") + '</small></div><div class="v9-first-l">' + list.map(function (l) {
        return '<a href="/arc#coin/' + esc(l.token) + '" class="v9-fc"><b>$' + esc(l.symbol) + "</b><span>" + esc(l.name || "") + "</span><em>" + L("Buy from $1", "$1부터 매수", "$1 起买") + "</em></a>";
      }).join("") + "</div>";
    }
    setInterval(function () { if (home.classList.contains("active") && !D.hidden) paint(); }, 8000);
    setTimeout(paint, 2500);
  }

  // ---- install as an app (phones; once, dismissible) ----
  function installHint() {
    if (store.get("v9.install.off") === "1" || (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone) return;
    var deferred = null, ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    function show() {
      if (!phone() || D.getElementById("v9-install")) return;
      var b = D.createElement("div"); b.id = "v9-install"; b.className = "v9-install"; b.setAttribute("role", "dialog"); b.setAttribute("aria-label", "Install"); b.setAttribute("data-no-i18n", "");
      b.innerHTML = '<img src="/images/apple-touch-icon.png" alt="" width="40" height="40"><div><b>' + L("Add ARCIRCLE to your home screen", "ARCIRCLE을 홈 화면에 추가", "把 ARCIRCLE 添加到主屏幕") + "</b><small>" +
        (deferred ? L("Opens like an app, full screen.", "앱처럼 전체 화면으로 열려요.", "像 App 一样全屏打开。") : L("Tap Share, then “Add to Home Screen”.", "공유 버튼 → ‘홈 화면에 추가’를 누르세요.", "点分享,然后“添加到主屏幕”。")) + "</small></div>" +
        (deferred ? '<button type="button" class="bp-btn-primary sm" data-i="go">' + L("Install", "설치", "安装") + "</button>" : "") + '<button type="button" class="v9-x" data-i="off" aria-label="' + L("Close", "닫기", "关闭") + '">×</button>';
      D.body.appendChild(b);
      b.addEventListener("click", function (e) {
        var t = e.target.closest("[data-i]"); if (!t) return;
        if (t.dataset.i === "go" && deferred) { deferred.prompt(); deferred.userChoice.then(function () { b.remove(); store.set("v9.install.off", "1"); }); return; }
        store.set("v9.install.off", "1"); b.remove();
      });
    }
    addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; setTimeout(show, 20000); });
    if (ios) setTimeout(show, 25000);
  }

  // ---- a small toast (bottom centre, above the phone tab bar) ----
  function toast(html, cls) {
    var t = D.createElement("div");
    t.className = "v9-toast " + (cls || ""); t.setAttribute("role", "status"); t.setAttribute("data-no-i18n", "");
    t.innerHTML = html;
    D.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("in"); });
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 300); }, 4200);
    return t;
  }
  // count a number up inside an element: keeps what's around the number ($, K, %, words)
  function countUp(el, to, fmt, ms) {
    if (reduce) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = ms || 700;
    (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }

  // ---- ArcPad coin page: after a buy, how much you got, counted up ----
  function buyToast() {
    if (typeof window.apcStatus !== "function") return;
    var orig = window.apcStatus, before = null;
    window.apcStatus = function (type, html) {
      var A = G("APC");
      if (type === "pending" && /^Buying/.test(String(html)) && A && A.user) before = A.user.tok;
      var r = orig.apply(this, arguments);
      if (type === "success" && /^Bought/.test(String(html)) && A && before != null) {
        var b0 = before, sym = A.l && A.l.symbol ? "$" + A.l.symbol : "", t0 = Date.now();
        before = null;
        (function wait() {
          var now = A.user && A.user.tok;
          if (now != null && now > b0) {
            var got = Number(now - b0) / 1e18;
            var el = toast('<b class="v9-cu">+0</b> <span>' + esc(sym) + "</span><small>" + L("in your wallet", "지갑에 들어왔어요", "已到账") + "</small>", "ok").querySelector(".v9-cu");
            countUp(el, got, function (v) { return "+" + v.toLocaleString("en-US", { maximumFractionDigits: got < 10 ? 4 : 0 }); }, 900);
            return;
          }
          if (Date.now() - t0 < 8000) setTimeout(wait, 400);
        })();
      }
      return r;
    };
  }

  // ---- coin prices flash when they move (ArcPad home cards and the Explore grid) ----
  function priceFlash() {
    if (!D.getElementById("bp-panel-home") || !D.getElementById("bp-panel-launch")) return;
    var last = new Map();
    var num = function (t) { var m = /\$([\d.,]+)\s*([KMB]?)/.exec(t || ""); if (!m) return null; var v = parseFloat(m[1].replace(/,/g, "")); return v * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1); };
    setInterval(function () {
      if (D.hidden) return;
      [].forEach.call(D.querySelectorAll(".bp-panel.active a.v6-tc, .bp-panel.active .launch-card"), function (c) {
        var key = c.getAttribute("href") || c.dataset.token || ""; if (!key) return;
        var vEl = c.querySelector(".v6-tc-n > span, .lc-mcap, [data-mcap]") || c, v = num(vEl.textContent);
        if (v == null) return;
        var p = last.get(key); last.set(key, v);
        if (p == null || p === v || reduce) return;
        c.classList.remove("v9-up", "v9-down"); void c.offsetWidth; c.classList.add(v > p ? "v9-up" : "v9-down");
      });
    }, 2000);
  }

  // ---- $ARCIRCLE burns: the chip in the menu pulses when more gets burned ----
  function burnPulse() {
    var KEY = "v9.burned";
    function tick() {
      if (D.hidden) return;
      fetch("/api/social?token=arcircle").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var b = d && d.burned && Number(d.burned.tokens); if (!(b > 0)) return;
        var prev = Number(store.get(KEY) || 0); store.set(KEY, String(b));
        if (!(prev > 0) || b <= prev) return;
        var chip = D.querySelector('.anav-chip[href="/arcircle"]');
        if (!chip || !chip.offsetParent) return;
        chip.classList.remove("v9-burn"); void chip.offsetWidth; chip.classList.add("v9-burn");
        var tip = D.createElement("span"); tip.className = "v9-burntip"; tip.textContent = "+" + Math.round(b - prev).toLocaleString("en-US") + " " + L("burned", "소각", "已销毁");
        chip.appendChild(tip); setTimeout(function () { tip.remove(); }, 3200);
      }).catch(function () { /* next time */ });
    }
    setTimeout(tick, 4000); setInterval(tick, 90000);
  }

  // ---- numbers count up the first time they come into view ----
  function countIn() {
    if (reduce || !("IntersectionObserver" in window)) return;
    var SEL = ".pg-t b, .ax-fact b, .ax-facts b, .hm-nums b, .ap-stat b, .bp-mini-stat b, .stk-pot b, .rw-meter b, .st-out b";
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, txt = el.textContent, m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(txt.trim());
        if (!m || el.children.length) return;
        var v = parseFloat(m[2].replace(/,/g, "")); if (!(v > 0)) return;
        var dec = (m[2].split(".")[1] || "").length, comma = /,/.test(m[2]) || v >= 1000;
        var mine = null;
        countUp(el, v, function (x) { mine = m[1] + x.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: comma }) + m[3]; return mine; }, 800);
        // if the page writes a fresher value while we count, the page wins
        var mo = new MutationObserver(function () { if (el.textContent !== mine) mo.disconnect(); });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(function () { mo.disconnect(); if (el.textContent !== txt && el.textContent === mine) el.textContent = txt; }, 900);
      });
    }, { threshold: 0.6 });
    var seen = new WeakSet();
    function scan() { if (D.hidden) return; [].forEach.call(D.querySelectorAll(SEL), function (el) { if (!seen.has(el) && /\d/.test(el.textContent)) { seen.add(el); io.observe(el); } }); }
    scan(); setInterval(scan, 3000); D.addEventListener("visibilitychange", scan);
  }

  // ---- values still loading: a soft shimmer instead of a bare "—", then a calm "—" if nothing comes ----
  function pending() {
    var SEL = "main b, main strong, .bp-main b, .bp-main strong, [data-hm-num], [data-lb]";
    function mark() {
      if (D.hidden) return;
      [].forEach.call(D.querySelectorAll(SEL), function (el) {
        if (el.__v9p || el.children.length || el.textContent.trim() !== "—") return;
        var fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) return;
        el.__v9p = Date.now(); el.classList.add("v9-skel");
        var mo = new MutationObserver(function () { if (el.textContent.trim() !== "—") { el.classList.remove("v9-skel", "v9-na"); mo.disconnect(); } });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(function () { if (el.classList.contains("v9-skel")) { el.classList.remove("v9-skel"); el.classList.add("v9-na"); el.title = L("Not available right now — Arc didn't answer. It fills in by itself when it does.", "지금은 불러올 수 없어요 — Arc 응답이 오면 자동으로 채워져요.", "暂时无法读取——Arc 响应后会自动显示。"); } }, 6000);
      });
    }
    mark(); setInterval(mark, 1500); D.addEventListener("visibilitychange", mark);
  }

  // ---- ARCIA's button says one thing a day ----
  function arciaBubble() {
    var day = new Date().toISOString().slice(0, 10);
    if (store.get("v9.bubble") === day) return;
    setTimeout(function () {
      var fab = D.querySelector(".aa-fab"); if (!fab || !fab.getBoundingClientRect().width) return;
      fetch("/api/c?view=latest&n=20").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
        var now = Date.now() / 1000, n = j && j.coins ? j.coins.filter(function (c) { return c.launchedAt && now - c.launchedAt < 86400; }).length : 0;
        var msg = n ? L(n + (n > 1 ? " new coins" : " new coin") + " launched today — want a look?", "오늘 새 코인 " + n + "개가 나왔어요 — 구경할래요?", "今天有 " + n + " 个新币上线——去看看?")
          : L("Ask me anything about ARCIRCLE — I'm right here.", "ARCIRCLE에 대해 뭐든 물어보세요 — 여기 있어요.", "关于 ARCIRCLE 的任何问题都可以问我——我就在这里。");
        var b = D.createElement("a");
        b.className = "v9-bubble"; b.href = n ? "/arc#explore" : "#"; b.textContent = msg; b.setAttribute("data-no-i18n", "");
        if (!n) b.addEventListener("click", function (e) { e.preventDefault(); fab.click(); b.remove(); });
        var r = fab.getBoundingClientRect();
        b.style.right = Math.max(12, innerWidth - r.right) + "px"; b.style.bottom = (innerHeight - r.top + 10) + "px";
        D.body.appendChild(b); store.set("v9.bubble", day);
        setTimeout(function () { b.classList.add("out"); setTimeout(function () { b.remove(); }, 400); }, 7000);
      });
    }, 9000);
  }

  // ---- the second menu row tucks away while you scroll down, comes back when you scroll up ----
  function compactNav() {
    var y0 = scrollY, on = false;
    addEventListener("scroll", function () {
      var y = scrollY, want = y > 160 && y > y0 + 4 ? true : y < y0 - 4 || y < 120 ? false : on;
      y0 = y;
      if (want !== on) { on = want; H.classList.toggle("anav-compact", on); }
    }, { passive: true });
  }

  // ---- phones: the menu sheet closes with a swipe down ----
  function sheetSwipe() {
    var y = null, el = null;
    D.addEventListener("touchstart", function (e) { var s = e.target.closest && e.target.closest(".anav-sheet-in"); if (!s || s.scrollTop > 0) { y = null; return; } el = s; y = e.touches[0].clientY; }, { passive: true });
    D.addEventListener("touchmove", function (e) { if (y == null || !el) return; var dy = e.touches[0].clientY - y; if (dy > 0) { el.style.transition = "none"; el.style.transform = "translateY(" + dy + "px)"; } }, { passive: true });
    D.addEventListener("touchend", function (e) {
      if (y == null || !el) return;
      var dy = e.changedTouches[0].clientY - y, s = el; y = null; el = null;
      s.style.transition = ""; s.style.transform = "";
      if (dy > 90) { var x = D.querySelector(".anav-sheet .anav-x"); if (x) x.click(); }
    });
  }

  // ---- $ARCIRCLE page on phones: the long sections fold under their titles ----
  function foldCoinPage() {
    if (!D.body.classList.contains("ax-token") || !D.querySelector("main #uses")) return;
    var secs = [].slice.call(D.querySelectorAll("main .ax-section[id]")).filter(function (x) { return x.id !== "uses"; });
    var mq = window.matchMedia && matchMedia("(max-width:900px)");
    function apply() {
      var on = mq && mq.matches;
      secs.forEach(function (sec) {
        var h = sec.querySelector(":scope > h2"); if (!h) return;
        if (on && !sec.classList.contains("v9-fold")) {
          sec.classList.add("v9-fold");
          h.setAttribute("role", "button"); h.setAttribute("tabindex", "0"); h.setAttribute("aria-expanded", "false");
          if (!h.__v9) { h.__v9 = true;
            var tog = function () { var o = !sec.classList.contains("open"); sec.classList.toggle("open", o); h.setAttribute("aria-expanded", o ? "true" : "false"); };
            h.addEventListener("click", function () { if (sec.classList.contains("v9-fold")) tog(); });
            h.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && sec.classList.contains("v9-fold")) { e.preventDefault(); tog(); } });
          }
        } else if (!on && sec.classList.contains("v9-fold")) {
          sec.classList.remove("v9-fold", "open"); h.removeAttribute("role"); h.removeAttribute("tabindex"); h.removeAttribute("aria-expanded");
        }
      });
    }
    function openFor(id) { var sec = D.getElementById(id); if (sec && sec.classList.contains("v9-fold") && !sec.classList.contains("open")) { sec.classList.add("open"); var h = sec.querySelector(":scope > h2"); if (h) h.setAttribute("aria-expanded", "true"); } }
    D.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a) openFor(a.getAttribute("href").slice(1)); }, true);
    addEventListener("hashchange", function () { openFor(location.hash.slice(1)); });
    apply(); if (mq) { if (mq.addEventListener) mq.addEventListener("change", apply); else if (mq.addListener) mq.addListener(apply); }
    if (location.hash) openFor(location.hash.slice(1));
  }

  function init() {
    foldNews();
    buyBar();
    launchGuide();
    coinExtras();
    feeEstimate();
    firstBuyer();
    installHint();
    buyToast();
    priceFlash();
    burnPulse();
    // v11: numbers no longer count up from zero on every visit (they flash only when they change: priceFlash)
    // countIn();
    pending();
    arciaBubble();
    compactNav();
    sheetSwipe();
    foldCoinPage();
    D.addEventListener("arc:lang", function () {
      [].forEach.call(D.querySelectorAll('[data-v9t="older"]'), function (e) { e.textContent = L("Earlier updates", "이전 업데이트", "更早的更新"); });
      [].forEach.call(D.querySelectorAll('[data-v9t="all"]'), function (e) { e.textContent = L("All updates", "전체 업데이트", "全部更新"); });
    });
  }
  api.L = L;
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", init); else init();
})();
;
/* ---- arc-v10.js ---- */
// arc-v10.js — "clean, simple, easy on the eyes": the v10 cleanup's behaviour (styles: arc-v10.css).
// Every ARCIRCLE PAD page runs it; each part checks for its own page. Plain script, no dependencies.
//   · page intros cut to one line (More / Less)
//   · Explore: the live-trades strip parks on Explore and stands still; platform + presets move into Filters
//   · utility guides fold into one "How it works" block (the docs and /updates keep everything)
//   · home: one main button, the first-visit tour only on the first visit
//   · Display settings: Dim (softer contrast) and Compact (denser lists), remembered in this browser
//   · My ARCIRCLE: everything a wallet can claim, in one card, with one "Claim all on Arc"
//   · motion only when someone acts: tab switch, sparklines drawn once
(function () {
  "use strict";
  if (window.arcV10) return;
  var D = document, H = D.documentElement;
  H.classList.add("v10");
  var lang = function () { var l = (H.getAttribute("lang") || "en").slice(0, 2); if (l !== "ko" && l !== "zh") { try { l = localStorage.getItem("arcircle.lang") || l; } catch (e) { /* private */ } } return l === "ko" || l === "zh" ? l : "en"; };
  var L = function (en, ko, zh) { var l = lang(); return l === "ko" ? ko : l === "zh" ? zh : en; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } },
  };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "")); };
  var path = (location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/").replace(/^\/arcpad$/, "/arc").replace(/^\/circlepad$/, "/circle");
  var onArc = path === "/arc";
  var api = (window.arcV10 = {});

  // ---------------- Display settings (before anything paints) ----------------
  var SET = { dim: "arc.v10.dim", compact: "arc.v10.compact" };
  function applySet() {
    H.classList.toggle("v10-dim", store.get(SET.dim) === "1");
    H.classList.toggle("v10-compact", store.get(SET.compact) === "1");
  }
  applySet();
  function setRows() {
    return [["dim", L("Dim", "어둡게", "柔和"), L("Softer contrast for long sessions", "오래 볼 때 눈이 편한 대비", "长时间浏览时更柔和的对比")],
      ["compact", L("Compact", "촘촘하게", "紧凑"), L("More coins and rows on one screen", "한 화면에 더 많은 코인과 줄", "一屏显示更多币和行")]]
      .map(function (r) {
        return '<label><span>' + esc(r[1]) + "<small>" + esc(r[2]) + '</small></span><input type="checkbox" data-v10set="' + r[0] + '"' + (store.get(SET[r[0]]) === "1" ? " checked" : "") + '><i class="v10-sw" aria-hidden="true"></i></label>';
      }).join("");
  }
  function onSet(e) {
    var i = e.target.closest && e.target.closest("[data-v10set]");
    if (!i) return;
    store.set(SET[i.dataset.v10set], i.checked ? "1" : null);
    applySet();
  }
  function mountSettings() {
    var right = D.querySelector(".anav-right");
    if (!right || right.querySelector(".v10-set")) return;
    var box = D.createElement("div");
    box.className = "v10-set";
    box.innerHTML = '<button type="button" class="v10-set-b" aria-haspopup="true" aria-expanded="false" aria-label="' + esc(L("Display", "화면 설정", "显示")) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>' +
      '<div class="v10-set-m" hidden></div>';
    var lb = right.querySelector(".anav-lang");
    right.insertBefore(box, lb || right.firstChild);
    var b = box.querySelector(".v10-set-b"), m = box.querySelector(".v10-set-m");
    var close = function () { m.hidden = true; b.setAttribute("aria-expanded", "false"); };
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!m.hidden) return close();
      m.innerHTML = setRows() + '<a href="/me">' + esc(L("My ARCIRCLE — everything to claim", "My ARCIRCLE — 받을 보상 한눈에", "My ARCIRCLE — 所有可领取的")) + "</a>";
      m.hidden = false; b.setAttribute("aria-expanded", "true");
    });
    m.addEventListener("change", onSet);
    D.addEventListener("click", function (e) { if (!box.contains(e.target)) close(); });
    D.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) { close(); b.focus(); } });
  }
  // phones: the same two switches sit under the language list
  function mountLangSettings() {
    var lm = D.querySelector(".anav-lmenu");
    if (!lm || lm.querySelector(".v10-lset")) return;
    var box = D.createElement("div");
    box.className = "v10-lset v10-set-m";
    box.style.cssText = "position:static;min-width:0;padding:4px 0 0;margin-top:4px;border:0;border-top:1px solid rgba(170,190,230,.14);border-radius:0;background:none;box-shadow:none";
    box.innerHTML = setRows();
    lm.appendChild(box);
    box.addEventListener("change", onSet);
    box.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  // ---------------- page intros: one line ----------------
  function cutLedes(scope) {
    [].forEach.call((scope || D).querySelectorAll(".bp-panel > .bp-lede, .ams-hero-txt > p"), function (p) {
      if (p.dataset.v10cut || (p.textContent || "").trim().length < 120) return;
      p.dataset.v10cut = "1";
      p.classList.add("bp-lede", "v10-cut");
      var b = D.createElement("button");
      b.type = "button"; b.className = "v10-more"; b.setAttribute("aria-expanded", "false");
      b.textContent = L("More", "더 보기", "更多");
      b.addEventListener("click", function () {
        var open = p.classList.toggle("open");
        b.setAttribute("aria-expanded", open ? "true" : "false");
        b.textContent = open ? L("Less", "접기", "收起") : L("More", "더 보기", "更多");
      });
      p.insertAdjacentElement("afterend", b);
    });
  }

  // ---------------- utility guides: one folded block ----------------
  function foldGuides() {
    [].forEach.call(D.querySelectorAll(".bp-panel section.asc-guide, .bp-panel .asc-guide"), function (g) {
      if (g.closest(".v10-guide") || g.parentNode.closest(".asc-guide")) return;
      var h = g.querySelector(":scope > h2");
      var det = D.createElement("details");
      det.className = "v10-guide";
      det.innerHTML = '<summary><span>' + esc(h ? h.textContent.trim() : L("How it works", "사용 방법", "使用说明")) + '</span><small>' + esc(L("How it works · what's new", "사용 방법 · 새 소식", "使用说明 · 更新")) + "</small></summary>" +
        '<div class="v10-guide-in"></div>';
      g.parentNode.insertBefore(det, g);
      det.querySelector(".v10-guide-in").appendChild(g);
      if (h) h.hidden = true;
    });
  }

  // ---------------- Explore ----------------
  function explore() {
    var panel = D.getElementById("bp-panel-explore");
    if (!panel) return;
    // the live-trades strip: here only, standing still
    var tk = D.getElementById("ap-ticker");
    if (tk && tk.parentNode !== panel) {
      var bar = panel.querySelector(".cn-explore-toolbar");
      panel.insertBefore(tk, bar || panel.firstChild);
    }
    // platform chips and saved presets: inside Filters
    var tries = 0;
    (function move() {
      var fp = D.getElementById("ap-filter-panel"), plats = panel.querySelector(".cn-explore-toolbar > .flt-plat"), pre = D.getElementById("v7-presets");
      if (fp && plats && !fp.querySelector(".v10-fg-plat")) {
        var g = D.createElement("div");
        g.className = "flt-group v10-fg-plat";
        g.innerHTML = '<span class="flt-label">' + esc(L("Platform", "플랫폼", "平台")) + "</span>";
        g.appendChild(plats);
        fp.insertBefore(g, fp.firstChild);
      }
      if (fp && pre && pre.parentNode !== fp) {
        var gp = fp.querySelector(".v10-fg-pre") || D.createElement("div");
        gp.className = "flt-group v10-fg-pre";
        if (!gp.parentNode) { gp.innerHTML = '<span class="flt-label">' + esc(L("Saved views", "저장한 보기", "已保存视图")) + "</span>"; fp.appendChild(gp); }
        gp.appendChild(pre);
      }
      if ((!fp || !plats || !pre) && ++tries < 40) setTimeout(move, 400);
    })();
    // touch: long-press a card for its quick-buy row
    var grid = D.getElementById("ap-explore-grid");
    if (grid && !grid.dataset.v10) {
      grid.dataset.v10 = "1";
      var t = 0;
      grid.addEventListener("touchstart", function (e) { var c = e.target.closest(".launch-card"); if (!c) return; t = setTimeout(function () { c.classList.add("v10-qb"); }, 420); }, { passive: true });
      grid.addEventListener("touchend", function () { clearTimeout(t); }, { passive: true });
      grid.addEventListener("touchmove", function () { clearTimeout(t); }, { passive: true });
      // sparklines draw once, the first time a coin shows up
      var drawn = new Set();
      var draw = function () {
        if (reduce) return;
        [].forEach.call(grid.querySelectorAll(".launch-card[data-token] > svg"), function (svg) {
          var c = svg.parentNode, k = (c.dataset.token || "").toLowerCase();
          if (!k || drawn.has(k)) return;
          drawn.add(k);
          var p = svg.querySelector("path, polyline");
          if (!p || !p.getTotalLength) return;
          try { svg.style.setProperty("--len", Math.ceil(p.getTotalLength())); svg.classList.add("v10-draw"); } catch (e) { /* not measurable */ }
        });
      };
      if ("MutationObserver" in window) new MutationObserver(function () { clearTimeout(draw.t); draw.t = setTimeout(draw, 30); }).observe(grid, { childList: true });
      draw();
    }
  }

  // ---------------- coin page: a short trades list, orders folded on phones ----------------
  function coinPage() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel || panel.dataset.v10) return;
    panel.dataset.v10 = "1";
    panel.addEventListener("click", function (e) {
      var h = e.target.closest && e.target.closest("#v7-ord > h3");
      if (h && window.innerWidth <= 900) { h.parentNode.classList.toggle("v10-open"); return; }
      var s = e.target.closest && e.target.closest(".v10-showall");
      if (s) { var c = s.closest(".ac2-card"); var all = c.classList.toggle("v10-all"); s.textContent = all ? L("Show fewer", "접기", "收起") : L("Show all", "모두 보기", "显示全部"); }
    });
    var add = function () {
      [].forEach.call(panel.querySelectorAll(".ac2-card .ac2-table-wrap"), function (w) {
        var rows = w.querySelectorAll("tbody tr").length, btn = w.parentNode.querySelector(":scope > .v10-showall");
        if (rows > 8 && !btn) { btn = D.createElement("button"); btn.type = "button"; btn.className = "v10-showall"; btn.textContent = L("Show all", "모두 보기", "显示全部"); w.insertAdjacentElement("afterend", btn); }
        if (btn) btn.hidden = rows <= 8;
      });
    };
    if ("MutationObserver" in window) new MutationObserver(function () { clearTimeout(add.t); add.t = setTimeout(add, 80); }).observe(panel, { childList: true, subtree: true });
    add();
  }

  // ---------------- tab switches: one short move ----------------
  function tabIn() {
    if (reduce) return;
    var p = D.querySelector(".bp-panel.active");
    if (!p) return;
    p.classList.remove("v10-in"); void p.offsetWidth; p.classList.add("v10-in");
    setTimeout(function () { p.classList.remove("v10-in"); }, 260);
  }

  // ---------------- home: one main button ----------------
  function home() {
    if (path !== "/") return;
    var tour = D.querySelector(".hm-tour");
    if (tour) {
      var seen = store.get("arc.v10.seen");
      if (seen) tour.hidden = true;
      else store.set("arc.v10.seen", String(Date.now()));
    }
  }

  // ---------------- remember the wallet the site saw (for My ARCIRCLE and alerts) ----------------
  function watchAccount() {
    var last = "";
    setInterval(function () {
      var a = typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "";
      if (a && a !== last && isAddr(a)) { last = a; store.set("arc.v10.acct", a); D.dispatchEvent(new CustomEvent("arc:v10acct", { detail: a })); }
    }, 1500);
  }
  api.account = function () { var c = window.arcConnect && window.arcConnect.address(); if (c) return c; var a = store.get("arc.v10.acct"); return isAddr(a) ? a : ""; };

  // ---------------- My ARCIRCLE: everything to claim ----------------
  var getJson = function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  var nf = function (n, d) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d }); };
  var big = function (raw) { try { var n = Number(BigInt(raw || "0") / 10n ** 14n) / 1e4; return n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : nf(n, 2); } catch (e) { return "—"; } };
  /// what a wallet can claim right now, across the site
  api.claims = function (addr) {
    addr = String(addr || "").toLowerCase();
    return Promise.all([
      getJson("/api/desk?stake=me&u=" + addr),
      getJson("/api/desk?stake=drop&u=" + addr),
      getJson("/api/desk?vearcia=me&u=" + addr),
    ]).then(function (r) {
      var st = r[0], ld = r[1], va = r[2], out = [];
      if (st && st.live) {
        out.push({ k: "stake", t: L("Staking rewards", "스테이킹 보상", "质押奖励"), v: nf(st.claimable, 2) + " USDC", ready: st.claimable > 0, href: "/arc#staking" });
        if (st.lock && st.lock.end && !st.lock.max) {
          var days = Math.round((st.lock.end - Date.now() / 1000) / 86400);
          if (days >= 0 && days <= 14) out.push({ k: "lock", t: L("Your lock ends soon", "락업 종료 임박", "锁仓即将到期"), v: days + L(" days", "일", " 天"), ready: false, href: "/arc#staking", warn: true });
        }
      }
      if (ld && ld.mode === "vault") {
        var n = (ld.claimable || []).length;
        out.push({ k: "drop", t: L("Launch Drop", "런치 드랍", "发币空投"), v: n ? n + L(n === 1 ? " coin" : " coins", "개 코인", " 个币") : L("Nothing yet", "아직 없음", "暂无"), ready: n > 0, href: "/arc#staking", tokens: ld.claimable || [], vault: ld.vault });
      }
      if (va && va.live && va.earned && va.earned[0]) {
        var a = Number(BigInt(va.earned[0]) / 10n ** 14n) / 1e4;
        out.push({ k: "vea", t: L("veARCIA rewards (Robinhood Chain)", "veARCIA 보상 (로빈후드 체인)", "veARCIA 奖励(Robinhood Chain)"), v: nf(a, 2) + " $ARCIA", ready: a > 0, href: "/arc#vearcia", other: true });
      }
      return out;
    });
  };
  function meCard() {
    if (!D.body.classList.contains("pg-me")) return;
    var out = D.getElementById("me-out");
    if (!out) return;
    var busy = false;
    var paint = function () {
      var id = out.querySelector(".me-id");
      if (!id || out.querySelector(".v10-claims")) return;
      var addr = (new URLSearchParams(location.search).get("w") || "").toLowerCase();
      if (!isAddr(addr)) return;
      var box = D.createElement("section");
      box.className = "v10-claims";
      box.innerHTML = '<div class="v10-claims-h"><h2>' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + '</h2></div><p class="v10-claims-empty">' + esc(L("Reading…", "읽는 중…", "读取中…")) + "</p>";
      id.insertAdjacentElement("afterend", box);
      api.claims(addr).then(function (rows) {
        var arcReady = rows.filter(function (r) { return r.ready && !r.other; });
        var mine = api.account() === addr || (window.arcConnect && window.arcConnect.address() === addr);
        box.innerHTML = '<div class="v10-claims-h"><h2>' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + "</h2>" +
          (arcReady.length ? (mine ? '<button type="button" class="ld-btn pri" data-v10claim>' + esc(L("Claim all on Arc", "Arc에서 모두 수령", "在 Arc 上全部领取")) + " (" + arcReady.length + ")</button>"
            : '<a class="ld-btn" href="/arc#staking">' + esc(L("Connect this wallet to claim", "이 지갑을 연결해서 수령", "连接此钱包以领取")) + "</a>") : "") + "</div>" +
          (rows.length ? "<ul>" + rows.map(function (r) {
            return "<li><span>" + esc(r.t) + '</span><span><b data-no-i18n>' + esc(r.v) + '</b> <span class="v10-st' + (r.ready ? " ok" : "") + '">' + esc(r.ready ? L("ready", "수령 가능", "可领取") : r.warn ? "" : "—") + '</span> <a href="' + esc(r.href) + '">' + esc(L("Open", "열기", "打开")) + " →</a></span></li>";
          }).join("") + "</ul>" : '<p class="v10-claims-empty">' + esc(L("Nothing to claim yet. Lock $ARCIRCLE on Staking to get USDC every week and a piece of every new ArcPad coin.", "아직 받을 보상이 없어요. 스테이킹에서 $ARCIRCLE을 락업하면 매주 USDC와 새 ArcPad 코인을 받아요.", "暂无可领取的奖励。在质押页面锁仓 $ARCIRCLE,每周可得 USDC,还能分到每个新 ArcPad 币。")) + ' <a href="/arc#staking">' + esc(L("Open Staking", "스테이킹 열기", "打开质押")) + " →</a></p>");
        box.dataset.rows = JSON.stringify(arcReady.map(function (r) { return { k: r.k, tokens: r.tokens || [], vault: r.vault || "" }; }));
        if (mine && !out.querySelector(".v11-start")) meStart(addr, box);
      });
    };
    out.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-v10claim]");
      if (!b || busy) return;
      var box = b.closest(".v10-claims"), rows = JSON.parse(box.dataset.rows || "[]");
      busy = true; b.disabled = true;
      claimAll(rows, function (msg) { b.textContent = msg; }).then(function (ok) {
        busy = false;
        if (ok) { b.classList.add("v10-ok"); fly(b, L("Claimed", "수령 완료", "已领取")); setTimeout(function () { box.remove(); paint(); }, 1600); }
        else b.disabled = false;
      });
    });
    if ("MutationObserver" in window) new MutationObserver(paint).observe(out, { childList: true });
    paint();
  }
  /// Staking USDC + Launch Drop, on Arc, one after the other (each is the wallet's own transaction)
  function claimAll(rows, say) {
    var C = window.CONFIG || {};
    var STK = C.STAKING_ADDRESS;
    // v11: the wallet from the site's one wallet button (arc-connect.js), else the browser's
    var getP = window.arcConnect ? Promise.resolve(window.arcConnect.provider()) : Promise.resolve(window.ethereum);
    return getP.then(function (eth) {
      if (!eth || typeof ethers === "undefined") { say(L("Open this in a wallet browser", "지갑 브라우저에서 열어주세요", "请在钱包浏览器中打开")); return false; }
      return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }).catch(function () { return null; }).then(function () {
        return new ethers.BrowserProvider(eth).getSigner();
      }).then(function (s) {
        var chain = Promise.resolve();
        rows.forEach(function (r) {
          chain = chain.then(function () {
            if (r.k === "stake" && isAddr(STK)) { say(L("Confirm the USDC claim…", "USDC 수령을 확인하세요…", "请确认 USDC 领取…")); return new ethers.Contract(STK, ["function claim() returns (uint256)"], s).claim().then(function (tx) { return tx.wait(); }); }
            if (r.k === "drop" && isAddr(r.vault) && r.tokens.length) { say(L("Confirm the Launch Drop claim…", "런치 드랍 수령을 확인하세요…", "请确认发币空投领取…")); return new ethers.Contract(r.vault, ["function claim(address[] list) returns (uint256)"], s).claim(r.tokens.slice(0, 20)).then(function (tx) { return tx.wait(); }); }
          });
        });
        return chain.then(function () { say(L("Claimed", "수령 완료", "已领取")); return true; });
      });
    }).catch(function (e) { say(String((e && (e.shortMessage || e.reason || e.message)) || e).slice(0, 80)); return false; });
  }
  /// a small "+ claimed" chip flies from the button to the top bar
  function fly(from, text) {
    if (reduce || !from) return;
    var r = from.getBoundingClientRect(), to = D.querySelector(".anav-right") || D.body, t = to.getBoundingClientRect();
    var f = D.createElement("span");
    f.className = "v10-fly"; f.textContent = text;
    f.style.left = r.left + r.width / 2 - 30 + "px"; f.style.top = r.top + "px";
    D.body.appendChild(f);
    requestAnimationFrame(function () { f.style.transform = "translate(" + (t.right - 80 - r.left) + "px," + (t.top + 10 - r.top) + "px) scale(.8)"; f.style.opacity = "0"; });
    setTimeout(function () { f.remove(); }, 800);
  }
  api.fly = fly;

  // ---------------- v11: Ask ARCIA shrinks while you scroll ----------------
  function fabScroll() {
    var t = 0, lastY = window.scrollY;
    window.addEventListener("scroll", function () {
      var f = D.querySelector(".aa-fab");
      if (!f) return;
      if (Math.abs(window.scrollY - lastY) > 24) f.classList.add("v11-mini");
      lastY = window.scrollY;
      clearTimeout(t);
      // v12: on a phone she's always the small round avatar (her label covered cards and buttons)
      t = setTimeout(function () { if (!phoneNow()) f.classList.remove("v11-mini"); }, 900);
    }, { passive: true });
    var phoneNow = function () { return !!(window.matchMedia && matchMedia("(max-width: 640px)").matches); };
    var mini = function () { var f = D.querySelector(".aa-fab"); if (f) f.classList.toggle("v11-mini", phoneNow()); return !!f; };
    if (!mini()) { var n = 0, iv = setInterval(function () { if (mini() || ++n > 20) clearInterval(iv); }, 500); }
    window.addEventListener("resize", mini);
  }

  // ---------------- v11: the $ARCIRCLE contracts note opens on a tap ----------------
  function caNote() {
    var n = D.querySelector(".ax-token-hero .ax-ca-note");
    if (!n || n.dataset.v11) return;
    n.dataset.v11 = "1";
    n.title = L("Tap to read all", "눌러서 전체 보기", "点击查看全部");
    n.addEventListener("click", function (e) { if (e.target.closest("a")) return; n.classList.toggle("open"); });
  }

  // ---------------- v11: coin page shortcuts (desktop) ----------------
  function coinKeys() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel || panel.dataset.v11k) return;
    panel.dataset.v11k = "1";
    var swap = D.getElementById("apc-swap");
    if (swap && !swap.querySelector(".v11-keys")) {
      var h = D.createElement("p");
      h.className = "v11-keys";
      h.innerHTML = L("Keys", "단축키", "快捷键") + ': <kbd>B</kbd> ' + esc(L("buy", "매수", "买入")) + ' · <kbd>S</kbd> ' + esc(L("sell", "매도", "卖出")) + ' · <kbd>1</kbd>–<kbd>4</kbd> $1 / $5 / $10 / $50';
      swap.appendChild(h);
    }
    D.addEventListener("keydown", function (e) {
      if (!panel.classList.contains("active") || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target, tag = t && t.tagName;
      if (e.key === "Escape" && tag === "INPUT" && t.id === "apc-amount") { t.blur(); return; }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if (D.querySelector(".cw-modal, .cw-m:not([hidden]), .anav-sheet.in")) return;
      var k = e.key.toLowerCase(), tabs = panel.querySelectorAll("#apc-swap .ac2-swap-tabs button"), q = panel.querySelectorAll("#apc-quick button");
      if ((k === "b" || k === "s") && tabs.length >= 2) { e.preventDefault(); tabs[k === "b" ? 0 : 1].click(); var a = D.getElementById("apc-amount"); if (a) a.focus(); }
      else if (/^[1-4]$/.test(k) && q[Number(k) - 1]) { e.preventDefault(); q[Number(k) - 1].click(); }
    });
  }

  // ---------------- v11: Explore — a visible "Compare" ----------------
  function compareBtn() {
    var bar = D.querySelector("#bp-panel-explore .cn-explore-toolbar");
    if (!bar || bar.querySelector(".v11-cmp")) return;
    var b = D.createElement("button");
    b.type = "button"; b.className = "flt-btn v11-cmp"; b.setAttribute("aria-pressed", "false");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16M3 8h8M13 16h8"/></svg><span>' + esc(L("Compare", "비교", "比较")) + "</span>";
    var f = bar.querySelector("#ap-filter-btn");
    bar.insertBefore(b, f || null);
    b.addEventListener("click", function () {
      var on = H.classList.toggle("v11-cmp-on");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("on", on);
      if (on && typeof window.arcToast === "function") window.arcToast(L("Pick 2 or 3 coins to compare", "비교할 코인을 2~3개 고르세요", "选择 2 到 3 个币进行比较"), "info");
    });
  }

  // ---------------- v11: My ARCIRCLE — getting started, for a wallet that's just begun ----------------
  function meStart(addr, box) {
    var C = window.CONFIG || {};
    var rpcUrl = C.RPC_URL || "https://rpc.mainnet.arc.io";
    Promise.all([
      fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }) }).then(function (r) { return r.json(); }).catch(function () { return null; }),
      getJson("/api/social?token=arcircle&wallet=" + addr),
      getJson("/api/desk?stake=me&u=" + addr),
    ]).then(function (r) {
      var usdc = 0; try { usdc = Number(BigInt((r[0] && r[0].result) || "0x0") / 10n ** 14n) / 1e4; } catch (e) { /* none */ }
      var w = r[1] && r[1].wallet, st = r[2] || {};
      var earned = (st.history || []).reduce(function (a, h) { return a + (h.earned || 0); }, 0);
      var steps = [
        [usdc >= 0.5, L("USDC on Arc", "Arc에 USDC", "Arc 上的 USDC"), L("Gas and buys are paid in USDC", "가스와 매수 모두 USDC", "Gas 和买入都用 USDC"), "/start"],
        [!!(w && Number(w.balance) > 0), L("Hold $ARCIRCLE", "$ARCIRCLE 보유", "持有 $ARCIRCLE"), L("The core coin", "핵심 코인", "核心币"), "/arcircle"],
        [!!(st.lock && st.lock.amount > 0), L("Lock it for veARCIRCLE", "락업해서 veARCIRCLE 받기", "锁仓获得 veARCIRCLE"), L("USDC every week + every new coin's drop", "매주 USDC + 새 코인 드랍", "每周 USDC + 每个新币空投"), "/arc#staking"],
        [earned > 0, L("Your first reward", "첫 보상 받기", "第一笔奖励"), L("Claim it from here", "여기서 수령", "在这里领取"), "/arc#staking"],
      ];
      var done = steps.filter(function (x) { return x[0]; }).length;
      if (done === steps.length) return;
      var el = D.createElement("section");
      el.className = "v11-start";
      el.innerHTML = '<div class="v11-start-h"><h2>' + esc(L("Getting started", "시작하기", "入门")) + '</h2><span>' + done + " / " + steps.length + '</span></div><div class="v11-start-bar"><i style="width:' + (done / steps.length * 100) + '%"></i></div><ol>' +
        steps.map(function (x) { return '<li class="' + (x[0] ? "ok" : "") + '"><a href="' + esc(x[3]) + '"><i aria-hidden="true"></i><span><b>' + esc(x[1]) + "</b><small>" + esc(x[2]) + "</small></span></a></li>"; }).join("") + "</ol>";
      box.insertAdjacentElement("afterend", el);
    });
  }

  // ---------------- run ----------------
  function init() {
    mountSettings();
    mountLangSettings();
    cutLedes();
    foldGuides();
    explore();
    coinPage();
    home();
    meCard();
    watchAccount();
    fabScroll();
    caNote();
    coinKeys();
    compareBtn();
    if (onArc) D.addEventListener("arcpad:tab", function () { setTimeout(function () { cutLedes(); foldGuides(); explore(); compareBtn(); coinKeys(); }, 0); tabIn(); });
    // the bar is rebuilt when the language changes
    D.addEventListener("arc:lang", function () { setTimeout(function () { mountSettings(); mountLangSettings(); }, 50); });
    setTimeout(function () { mountSettings(); mountLangSettings(); foldGuides(); }, 1200);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", init); else init();
})();
;
/* ---- arc-v12.js ---- */
// arc-v12.js — layout and motion pass (v12), on every app page that loads the shared chrome:
//   · Staking: four tabs (Your lock · Launch Drop · Pool vote · Treasury & stats) instead of one long page; the
//     Launch Drop tab shows a dot when there's something to claim, and #staking?drop… opens on it
//   · Home: on a phone each menu card shows its first four links and a "+N more" that opens the rest
//   · Coin page: the header's chips get their names as aria-labels (the phone shows icons only)
//   · Coin page trades: a trade that wasn't there before slides in, and a big one (≥ $100) glows
// The styles are in arc-v10.css ("v12"). Everything respects prefers-reduced-motion.
(function () {
  "use strict";
  var D = document;
  var $ = function (id) { return D.getElementById(id); };
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  // ---------------- Staking: tabs ----------------
  var STK_TABS = [["lock", "Your lock"], ["drop", "Launch Drop"], ["vote", "Pool vote"], ["more", "Treasury & stats"]];
  function stkTabs() {
    var panel = $("bp-panel-staking"), ld = $("ld-body");
    if (!panel || !ld) return;
    var bar = $("v12-stabs");
    if (!bar) {
      bar = D.createElement("div");
      bar.id = "v12-stabs"; bar.className = "v12-stabs"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "ARCIRCLE Staking");
      ld.parentNode.insertBefore(bar, ld);
      bar.addEventListener("click", function (e) { var b = e.target.closest("[data-v12-tab]"); if (b) stkSet(b.dataset.v12Tab, true); });
      bar.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var ks = STK_TABS.map(function (x) { return x[0]; }), i = ks.indexOf(panel.dataset.v12tab);
        var n = ks[(i + (e.key === "ArrowRight" ? 1 : ks.length - 1)) % ks.length];
        stkSet(n, true); var nb = bar.querySelector('[data-v12-tab="' + n + '"]'); if (nb) nb.focus();
      });
      new MutationObserver(stkBadge).observe(ld, { childList: true, subtree: true });
      var start = /[#?&]staking\?[^#]*drop|[?&]drop\b/.test(location.hash) ? "drop" : ls.get("arc.v12.stk") || "lock";
      stkSet(STK_TABS.some(function (x) { return x[0] === start; }) ? start : "lock", false);
      window.addEventListener("hashchange", function () { if (/staking\?[^#]*drop/.test(location.hash)) stkSet("drop", false); });
    }
    bar.innerHTML = STK_TABS.map(function (x) {
      var on = panel.dataset.v12tab === x[0];
      return '<button type="button" role="tab" data-v12-tab="' + x[0] + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + esc(tr(x[1])) + (x[0] === "drop" ? '<i class="v12-dot" hidden></i>' : "") + "</button>";
    }).join("");
    stkBadge();
  }
  function stkSet(k, user) {
    var panel = $("bp-panel-staking"), bar = $("v12-stabs");
    if (!panel) return;
    var was = panel.dataset.v12tab;
    panel.dataset.v12tab = k;
    D.documentElement.dataset.v12stk = k;
    if (user) ls.set("arc.v12.stk", k);
    if (bar) [].forEach.call(bar.querySelectorAll("[data-v12-tab]"), function (b) { var on = b.dataset.v12Tab === k; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    if (user && was !== k && !reduce) { panel.classList.remove("v12-swap"); void panel.offsetWidth; panel.classList.add("v12-swap"); }
    if (user && bar) { var top = bar.getBoundingClientRect().top; if (top < 60) window.scrollBy({ top: top - 70, behavior: reduce ? "auto" : "smooth" }); }
  }
  function stkBadge() {
    var bar = $("v12-stabs"), ld = $("ld-body");
    if (!bar || !ld) return;
    var dot = bar.querySelector(".v12-dot");
    if (dot) dot.hidden = !ld.querySelector('[data-ld="claim"]');
  }

  // ---------------- Home: shorter menu cards on a phone ----------------
  function homeMap() {
    var grid = $("hm-map-grid");
    if (!grid) return;
    var paint = function () {
      [].forEach.call(grid.querySelectorAll(".hm-mapc"), function (c) {
        var l = c.querySelector(".hm-mapc-l"), n = l ? l.children.length : 0;
        if (!l || n <= 4 || c.querySelector(".v12-more")) return;
        var b = D.createElement("button");
        b.type = "button"; b.className = "v12-more"; b.setAttribute("aria-expanded", "false");
        b.textContent = tr("Show {n} more").replace("{n}", n - 4);
        b.addEventListener("click", function () { var open = !c.classList.contains("v12-open"); c.classList.toggle("v12-open", open); b.setAttribute("aria-expanded", String(open)); b.textContent = open ? tr("Show less") : tr("Show {n} more").replace("{n}", n - 4); });
        c.appendChild(b);
      });
    };
    paint();
    new MutationObserver(paint).observe(grid, { childList: true });
  }

  // ---------------- Coin page: chip names for icon-only chips ----------------
  function chipNames() {
    var row = D.querySelector("#bp-panel-coin .ac2-ca-row");
    if (!row) return;
    [].forEach.call(row.querySelectorAll(".ac2-chip-btn"), function (b) {
      var s = b.querySelector("span");
      var name = s && s.textContent.trim();
      if (name && b.getAttribute("aria-label") !== name) { b.setAttribute("aria-label", name); if (!b.title) b.title = name; }
    });
  }

  // ---------------- Coin page: new trades slide in ----------------
  var seen = { coin: "", keys: null, at: 0 };
  function tradeKey(tr0) { var a = tr0.querySelector("a.ac2-tx"); return a ? a.getAttribute("href") : ""; }
  function usdOf(tr0) { var td = tr0.children[2]; if (!td) return 0; var m = /\$?([\d,.]+)\s*([KMB])?/.exec(td.textContent || ""); if (!m) return 0; return Number(m[1].replace(/,/g, "")) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1); }
  function trades() {
    var body = $("apc-trades");
    if (!body || body.__v12) return;
    body.__v12 = true;
    new MutationObserver(function () {
      var coin = (location.hash.match(/coin\/(0x[0-9a-fA-F]{40})/) || [])[1] || "";
      var rows = [].slice.call(body.querySelectorAll("tr")).filter(function (r) { return tradeKey(r); });
      if (!rows.length) return;
      var keys = rows.map(tradeKey);
      // a new coin, or the first list: remember what's there, animate nothing
      if (coin.toLowerCase() !== seen.coin || !seen.keys) { seen = { coin: coin.toLowerCase(), keys: new Set(keys), top: keys[0] }; return; }
      var fresh = rows.filter(function (r) { return !seen.keys.has(tradeKey(r)); });
      var prevTop = seen.top;
      keys.forEach(function (k) { seen.keys.add(k); });
      seen.top = keys[0];
      // only trades that arrived on top of the list we had (a filter switch or "show more" brings older rows into view)
      var n = fresh.length;
      if (!n || n > 4 || keys.indexOf(prevTop) !== n || rows.indexOf(fresh[n - 1]) !== n - 1) return;
      if (reduce) return;
      fresh.forEach(function (r, i) {
        r.style.setProperty("--v12d", i * 70 + "ms");
        r.classList.add("v12-new");
        if (usdOf(r) >= 100) r.classList.add("v12-big");
        setTimeout(function () { r.classList.remove("v12-new", "v12-big"); }, 2600);
      });
    }).observe(body, { childList: true });
  }

  // ---------------- count-up: [data-v12-count="1,234.5"] counts from 0 the first time its key shows ----------------
  // (ARCIRCLE Swap's "$ARCIRCLE burned" after a swap; the page may redraw the same message, so each key plays once)
  var counted = {};
  function countUp(el) {
    var key = el.getAttribute("data-v12-key") || el.getAttribute("data-v12-count");
    var txt = el.getAttribute("data-v12-count") || "";
    var m = /^([\d,]*\.?\d*)\s*([KMB])?$/.exec(txt.trim());
    if (!m || !m[1]) return;
    var to = Number(m[1].replace(/,/g, "")), suf = m[2] || "", dec = (m[1].split(".")[1] || "").length;
    if (reduce || !(to > 0) || counted[key]) return;
    counted[key] = 1;
    var t0 = performance.now(), dur = 900;
    var wrap = el.closest(".v12-burn"); if (wrap) { wrap.classList.remove("v12-pop"); void wrap.offsetWidth; wrap.classList.add("v12-pop"); }
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toLocaleString("en-US", { minimumFractionDigits: k < 1 ? 0 : dec, maximumFractionDigits: dec }) + suf;
      if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = txt;
    })(t0);
  }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType !== 1) return; if (n.matches("[data-v12-count]")) countUp(n); [].forEach.call(n.querySelectorAll("[data-v12-count]"), countUp); }); });
  }).observe(D.documentElement, { childList: true, subtree: true });

  function boot() {
    stkTabs(); homeMap(); trades(); chipNames();
    var head = D.querySelector("#bp-panel-coin .ac2-ca-row");
    if (head && !head.__v12) { head.__v12 = true; new MutationObserver(chipNames).observe(head, { childList: true, subtree: true, characterData: true }); }
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();
  setTimeout(boot, 1500);
  D.addEventListener("arc:lang", function () { stkTabs(); });
  window.arcV12 = { stkSet: stkSet };
})();
;
/* ---- arc-feel.js ---- */
// arc-feel.js — small moments of feedback on every ARCIRCLE PAD page (styles in arc-polish.css):
//   · stat tiles count up the first time their number arrives (only once they're on screen)
//   · a value that never arrives says so in words, instead of a bare "—"
//   · a successful launch / swap / stake: a light burst (one pooled canvas, ≤ 60 particles, removed when done)
//     and a receipt card that slides in — pages announce it with document "arc:success"
//       detail: { kind: "launch" | "swap" | "stake", rows: [[label, value]…], url }
//   · copying to the clipboard: a check pops beside the button
// Motion is transform / opacity (and one canvas), nothing loops, and all of it is off under prefers-reduced-motion.
(function () {
  "use strict";
  if (window.arcFeel) return;
  var D = document;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // ---------------- stat tiles count up when their number first arrives ----------------
  var COUNT = ".ap-stat > strong:not(#ap-stat-count):not(#ap-stat-vol), .bp-mini-stat strong";
  var NUM = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/;
  var onScreen = new WeakMap(), waiting = new WeakMap(), watched = new WeakSet();
  var io = !reduce && "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      onScreen.set(e.target, e.isIntersecting);
      if (!e.isIntersecting) return;
      var w = waiting.get(e.target);
      if (w) { waiting.delete(e.target); count(e.target, w); }
    });
  }, { threshold: 0.3 }) : null;
  function count(el, txt) {
    var m = NUM.exec(txt.trim());
    if (!m) return;
    var v = parseFloat(m[2].replace(/,/g, ""));
    if (!(v > 0)) return;
    var dec = (m[2].split(".")[1] || "").length, comma = /,/.test(m[2]) || v >= 1000, t0 = performance.now(), ms = 700;
    var fmt = function (x) { return m[1] + x.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: comma }) + m[3]; };
    el.__feelMine = fmt(0); el.textContent = el.__feelMine;
    (function step(t) {
      if (el.textContent !== el.__feelMine) return; // the page wrote a fresher value: it wins
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.__feelMine = k < 1 ? fmt(v * e) : txt;
      el.textContent = el.__feelMine;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function watch(el) {
    if (watched.has(el)) return;
    watched.add(el);
    var had = /\d/.test(el.textContent);
    if (had || !io) return; // already has its number (or no motion): leave it be
    io.observe(el);
    var mo = new MutationObserver(function () {
      var txt = el.textContent;
      if (txt === el.__feelMine || !/\d/.test(txt)) return;
      mo.disconnect();
      if (onScreen.get(el)) count(el, txt); else waiting.set(el, txt);
    });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
  }

  // ---------------- values that never came: say so in words ----------------
  // the home page's small numbers inside a sentence ("— coins launched so far"): a skeleton while they load, then
  // the whole sentence becomes one friendly line (arc-polish.css hides the rest of it)
  var SMALL = [
    [".hm-foot [data-hm-num]", "Coin count is on its way"],
    [".hm-node [data-hm-num]", "Burn total is on its way"],
  ];
  function empties() {
    SMALL.forEach(function (x) {
      [].forEach.call(D.querySelectorAll(x[0]), function (el) {
        if (el.__feelE || el.textContent.trim() !== "—") return;
        el.__feelE = Date.now(); el.classList.add("v9-skel");
        var mo = new MutationObserver(function () { if (el.textContent.trim() !== "—") { el.classList.remove("v9-skel", "pol-empty"); el.removeAttribute("data-empty"); mo.disconnect(); } });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(function () { if (el.textContent.trim() === "—") { el.classList.remove("v9-skel"); el.classList.add("pol-empty"); el.setAttribute("data-empty", tr(x[1])); } }, 6000);
      });
    });
    // a big value v9 gave up on (arc-v9.js pending()): words instead of a faded "—"
    [].forEach.call(D.querySelectorAll(".v9-na:not([data-empty])"), function (el) { el.setAttribute("data-empty", tr("Waiting for Arc")); });
    // v9 lets go of .v9-na when the number arrives; the label goes with it
    [].forEach.call(D.querySelectorAll("[data-empty]:not(.v9-na):not(.pol-empty)"), function (el) { el.removeAttribute("data-empty"); });
    [].forEach.call(D.querySelectorAll(COUNT), watch);
  }

  // ---------------- success: a light burst and a receipt ----------------
  var MAX = 60, pool = [], cv = null, ctx = null, running = false, W = 0, H = 0;
  var COLORS = ["#3a78ff", "#2ba6ff", "#3fe0ef", "#9df3ff", "#ffffff"];
  for (var i = 0; i < MAX; i++) pool.push({ on: false });
  function burst(x, y) {
    if (reduce) return;
    if (!cv) {
      cv = D.createElement("canvas"); cv.className = "pol-burst"; cv.setAttribute("aria-hidden", "true");
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr;
      ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
      D.body.appendChild(cv);
    }
    pool.forEach(function (p, k) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, s = 5 + Math.random() * 7;
      p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.r = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 0.35;
      p.w = 4 + Math.random() * 4; p.h = 6 + Math.random() * 6; p.c = COLORS[k % COLORS.length]; p.life = 0; p.max = 60 + Math.random() * 40;
    });
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    var alive = 0;
    pool.forEach(function (p) {
      if (!p.on) return;
      p.life++; p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.life > p.max || p.y > H + 20) { p.on = false; return; }
      alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max); ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
      ctx.restore();
    });
    if (alive) requestAnimationFrame(frame);
    else { running = false; cv.remove(); cv = null; ctx = null; }
  }
  var TITLE = { launch: "Coin launched", swap: "Swap complete", stake: "Stake locked" };
  var card = null;
  function receipt(d) {
    if (card) card.remove();
    var rows = (d.rows || []).filter(function (r) { return r && r[1] != null && r[1] !== ""; });
    card = D.createElement("div");
    card.className = "pol-rcpt"; card.setAttribute("role", "status"); card.setAttribute("aria-live", "polite");
    card.innerHTML = '<div class="pol-rcpt-h"><i>' + CHECK + "</i><b>" + esc(tr(TITLE[d.kind] || "Transaction confirmed")) + "</b></div>" +
      (rows.length ? "<dl>" + rows.map(function (r) { return "<dt>" + esc(tr(r[0])) + '</dt><dd data-no-i18n title="' + esc(r[1]) + '">' + esc(r[1]) + "</dd>"; }).join("") + "</dl>" : "") +
      (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(tr("View transaction")) + " ↗</a>" : "") +
      '<button type="button" class="pol-rcpt-x" aria-label="' + esc(tr("Close")) + '">×</button>';
    D.body.appendChild(card);
    var me = card, gone = false;
    var close = function () { if (gone) return; gone = true; me.classList.remove("in"); me.classList.add("out"); setTimeout(function () { me.remove(); if (card === me) card = null; }, reduce ? 0 : 300); };
    me.querySelector(".pol-rcpt-x").addEventListener("click", close);
    var t = setTimeout(close, 8000);
    me.addEventListener("pointerenter", function () { clearTimeout(t); });
    me.addEventListener("pointerleave", function () { clearTimeout(t); t = setTimeout(close, 4000); });
    requestAnimationFrame(function () {
      me.classList.add("in");
      // the coin page's own "coin is born" moment already celebrates a launch on ArcPad
      if (D.querySelector(".coin-birth")) return;
      var r = me.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + 8);
    });
  }
  D.addEventListener("arc:success", function (e) { receipt((e && e.detail) || {}); });

  // ---------------- copied: a check beside the button ----------------
  var tap = { el: null, at: 0 };
  D.addEventListener("pointerdown", function (e) { var b = e.target && e.target.closest && e.target.closest("button, a, [role=button], [data-copy]"); if (b) tap = { el: b, at: Date.now() }; }, true);
  D.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && D.activeElement) tap = { el: D.activeElement, at: Date.now() }; }, true);
  function copied(el) {
    if (!el || !el.getBoundingClientRect || !D.body.contains(el)) return;
    var r = el.getBoundingClientRect();
    if (!r.width) return;
    var c = D.createElement("span");
    c.className = "pol-copy"; c.setAttribute("aria-hidden", "true"); c.innerHTML = CHECK;
    c.style.left = Math.round(Math.min(innerWidth - 16, r.right + 2)) + "px";
    c.style.top = Math.round(Math.max(16, r.top + 2)) + "px";
    D.body.appendChild(c);
    setTimeout(function () { c.remove(); }, reduce ? 1200 : 950);
  }
  var CP = window.Clipboard && window.Clipboard.prototype;
  if (CP && CP.writeText && !CP.__feel) {
    var orig = CP.writeText;
    CP.writeText = function () {
      var el = Date.now() - tap.at < 2000 ? tap.el : null;
      var p = orig.apply(this, arguments);
      if (p && p.then) p.then(function () { copied(el); }, function () { /* the page says it failed */ });
      return p;
    };
    CP.__feel = true;
  }

  function start() {
    empties();
    setInterval(function () { if (!D.hidden) empties(); }, 1500);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  window.arcFeel = { success: receipt, burst: burst };
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
  // v10: "Mine" — what the wallet this browser last connected can claim, or has to act on (arc-v10.js)
  var mine = [], tab = "", mineAt = 0;
  function gatherMine() {
    var V = window.arcV10, a = V && V.account && V.account();
    if (!a || !V.claims) { mine = []; return Promise.resolve(); }
    if (Date.now() - mineAt < 60000) return Promise.resolve();
    mineAt = Date.now();
    return V.claims(a).then(function (rows) {
      mine = rows.filter(function (r) { return r.ready || r.warn; }).map(function (r) {
        return { k: r.warn ? "lock" : "claim", t: r.t, s: r.v, href: r.href };
      });
      paint();
    }).catch(function () { /* later */ });
  }
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
    var n = unread() + mine.length;
    var badge = btn.querySelector(".nb-n");
    badge.textContent = n > 9 ? "9+" : String(n);
    badge.hidden = !n;
    btn.setAttribute("aria-label", tr("Alerts") + (n ? " (" + n + ")" : ""));
    if (open) list();
  }
  function tabs() {
    var t = panel.querySelector(".v10-ntabs");
    if (!t) {
      t = document.createElement("div");
      t.className = "v10-ntabs"; t.setAttribute("role", "tablist");
      t.innerHTML = '<button type="button" role="tab" data-nt="mine"></button><button type="button" role="tab" data-nt="all"></button>';
      panel.querySelector(".nb-h").insertAdjacentElement("afterend", t);
      t.addEventListener("click", function (e) { var b = e.target.closest("[data-nt]"); if (!b) return; e.stopPropagation(); tab = b.getAttribute("data-nt"); list(); });
    }
    t.querySelector('[data-nt="mine"]').textContent = tr("For you") + (mine.length ? " (" + mine.length + ")" : "");
    t.querySelector('[data-nt="all"]').textContent = tr("All");
    [].forEach.call(t.querySelectorAll("[data-nt]"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-nt") === tab ? "true" : "false"); });
  }
  function list() {
    if (!tab) tab = mine.length ? "mine" : "all";
    tabs();
    var s = Number(panel.getAttribute("data-seen")) || seenAt();
    var ul = panel.querySelector(".nb-list");
    if (tab === "mine") {
      var V = window.arcV10, a = V && V.account && V.account();
      if (!a) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Connect a wallet on ArcPad and your rewards, claims and lock dates show up here.")) + ' <a href="/arc#staking">' + esc(tr("Open Staking")) + " →</a></li>"; return; }
      if (!mine.length) { ul.innerHTML = '<li class="nb-none">' + esc(tr("Nothing to claim right now.")) + ' <a href="/me?w=' + esc(a) + '">' + esc(tr("My ARCIRCLE")) + " →</a></li>"; return; }
      ul.innerHTML = mine.map(function (i) {
        return '<li class="nb-i nb-' + i.k + ' new"><a href="' + esc(i.href) + '"><i aria-hidden="true"></i><span><b>' + esc(i.t) + '</b><small data-no-i18n>' + esc(i.s) + "</small></span></a></li>";
      }).join("") + '<li class="nb-none"><a href="/me?w=' + esc(a) + '">' + esc(tr("Everything to claim, in one place")) + " →</a></li>";
      return;
    }
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
      gatherMine();
      store.set(SEEN, String(now()));
      paint();
    }
  }
  function bell(host, before) {
    if (host.querySelector(".nb-btn") || (btn && document.body.contains(btn) && btn.offsetParent !== null)) return;
    var wrap = document.createElement("div");
    wrap.className = "nb";
    wrap.innerHTML = '<button type="button" class="nb-btn" aria-haspopup="true" aria-expanded="false" aria-label="Alerts">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg><span class="nb-n" hidden>0</span></button>' +
      '<div class="nb-panel" hidden><div class="nb-h"><b>Alerts</b><a href="/roadmap">' + esc(tr("Roadmap")) + ' →</a></div><ul class="nb-list"></ul></div>';
    var search = host.querySelector(".ck-btn");
    if (before && before.parentNode === host) host.insertBefore(wrap, before);
    else if (search) search.insertAdjacentElement("afterend", wrap);
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
    // v11: the shared menu bar (arc-nav.js) is where the bell lives, next to the wallet button
    var head = document.querySelector(".bp-topbar-right") || document.querySelector(".anav-right") || top;
    if (top) switcher(top);
    if (head) {
      bell(head, head.querySelector(":scope > .cw"));
      tidy(head);
      setTimeout(gather, 2500);
      setTimeout(gatherMine, 3500);
      document.addEventListener("arc:v10acct", function () { mineAt = 0; gatherMine(); });
      setInterval(function () { if (!document.hidden) { gather(); gatherMine(); } }, 180000);
    }
  }
  // search (arc-cmdk.js) adds its button on DOMContentLoaded too; wait a tick so the bell sits after it
  var go = function () { setTimeout(init, 0); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();

  // ---------- installable app ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () { /* unsupported */ }); });
  }

  // v11: every page's menu bar gets the bell next to the wallet button (arc-connect.js asks for it)
  var belled = false;
  function mountBell(host, before) {
    bell(host, before);
    if (!belled) { belled = true; setTimeout(gather, 1500); setTimeout(gatherMine, 2500); document.addEventListener("arc:v10acct", function () { mineAt = 0; gatherMine(); }); }
  }
  window.arcChrome = { refresh: gather, mountBell: mountBell };
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
  var BARS = ".anav-tabs, .ax-quick, .ax-dock, .cpx-bar, .asn-sticky";
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
