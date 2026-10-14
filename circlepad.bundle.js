/* circlepad.bundle.js — built by tools/build-bundles.mjs from: i18n-boot.js, config-arc.js, abis.js, arc-shared.js, arc-fmt.js, wallet-appkit.js, circlepad-boot.js, circlepad-plan.js, circlepad.js, circlepad-conv.js, arc-fx.js, arcircle-live.js, arc-motion.js, arc-footer.js, arcircle-hub.js, arc-social.js, circlepad-fx.js, circlepad-community.js, circlepad-plus.js, circlepad-ideas.js, circlepad-round.js, circlepad-rounds.js, circlepad-live.js, circlepad-look.js, circlepad-v5.js, circlepad-v9.js, arc-uxfx.js, arc-cmdk.js, arc-nav.js, arc-connect.js, arc-v9.js, arc-v10.js, arc-v12.js, arc-feel.js, arc-chrome.js, arc-a11y.js, arc-txring.js, arc-glyph.js, arc-arcia-fab.js, i18n.js. Do not edit; edit the sources. src:56526e7345a5dc00 */
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
/* ---- abis.js ---- */




const ERC20_ABI = [{"inputs": [{"internalType": "string", "name": "name_", "type": "string"}, {"internalType": "string", "name": "symbol_", "type": "string"}, {"internalType": "uint256", "name": "totalSupply_", "type": "uint256"}, {"internalType": "address", "name": "curve", "type": "address"}], "stateMutability": "nonpayable", "type": "constructor"}, {"inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {"internalType": "uint256", "name": "allowance", "type": "uint256"}, {"internalType": "uint256", "name": "needed", "type": "uint256"}], "name": "ERC20InsufficientAllowance", "type": "error"}, {"inputs": [{"internalType": "address", "name": "sender", "type": "address"}, {"internalType": "uint256", "name": "balance", "type": "uint256"}, {"internalType": "uint256", "name": "needed", "type": "uint256"}], "name": "ERC20InsufficientBalance", "type": "error"}, {"inputs": [{"internalType": "address", "name": "approver", "type": "address"}], "name": "ERC20InvalidApprover", "type": "error"}, {"inputs": [{"internalType": "address", "name": "receiver", "type": "address"}], "name": "ERC20InvalidReceiver", "type": "error"}, {"inputs": [{"internalType": "address", "name": "sender", "type": "address"}], "name": "ERC20InvalidSender", "type": "error"}, {"inputs": [{"internalType": "address", "name": "spender", "type": "address"}], "name": "ERC20InvalidSpender", "type": "error"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {"indexed": true, "internalType": "address", "name": "spender", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}], "name": "Approval", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "from", "type": "address"}, {"indexed": true, "internalType": "address", "name": "to", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}], "name": "Transfer", "type": "event"}, {"inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {"internalType": "address", "name": "spender", "type": "address"}], "name": "allowance", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {"internalType": "uint256", "name": "value", "type": "uint256"}], "name": "approve", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "decimals", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "name", "outputs": [{"internalType": "string", "name": "", "type": "string"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "symbol", "outputs": [{"internalType": "string", "name": "", "type": "string"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "totalSupply", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "to", "type": "address"}, {"internalType": "uint256", "name": "value", "type": "uint256"}], "name": "transfer", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [{"internalType": "address", "name": "from", "type": "address"}, {"internalType": "address", "name": "to", "type": "address"}, {"internalType": "uint256", "name": "value", "type": "uint256"}], "name": "transferFrom", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"}];






// HomepadFactoryPaired — hybrid mode paired with an ERC-20 quote (stock tokens / $HOME)

// HomepadPairedSwapRouter — buy/sell for paired launches (quote pulled via transferFrom)

// BigPadEscrow — minimal cap+deadline+escrow contract for BigPad's first
// round (no voting/leader/vesting logic — see contracts/BigPadEscrow.sol
// and Docs > Safety design on bigpad.html for why that's deliberate).
const BIGPAD_ESCROW_ABI = [{"inputs": [{"internalType": "address", "name": "recipient_", "type": "address"}, {"internalType": "address", "name": "platformWallet_", "type": "address"}, {"internalType": "address", "name": "treasuryWallet_", "type": "address"}, {"internalType": "uint256", "name": "cap_", "type": "uint256"}], "stateMutability": "nonpayable", "type": "constructor"}, {"inputs": [], "name": "AlreadyDistributed", "type": "error"}, {"inputs": [], "name": "AlreadyStarted", "type": "error"}, {"inputs": [], "name": "CapExceeded", "type": "error"}, {"inputs": [], "name": "InsufficientContribution", "type": "error"}, {"inputs": [], "name": "NotStarted", "type": "error"}, {"inputs": [], "name": "NothingToDistribute", "type": "error"}, {"inputs": [{"internalType": "address", "name": "owner", "type": "address"}], "name": "OwnableInvalidOwner", "type": "error"}, {"inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "OwnableUnauthorizedAccount", "type": "error"}, {"inputs": [], "name": "RaiseEnded", "type": "error"}, {"inputs": [], "name": "RaiseStillOpen", "type": "error"}, {"inputs": [], "name": "ReentrancyGuardReentrantCall", "type": "error"}, {"inputs": [], "name": "ZeroContribution", "type": "error"}, {"inputs": [], "name": "ZeroRefundAmount", "type": "error"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "contributor", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "totalRaised", "type": "uint256"}], "name": "Contributed", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": false, "internalType": "uint256", "name": "toRecipient", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "toPlatform", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "toTreasury", "type": "uint256"}], "name": "Distributed", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "previousOwner", "type": "address"}, {"indexed": true, "internalType": "address", "name": "newOwner", "type": "address"}], "name": "OwnershipTransferred", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "contributor", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "totalRaised", "type": "uint256"}], "name": "Refunded", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": false, "internalType": "uint256", "name": "deadline", "type": "uint256"}], "name": "Started", "type": "event"}, {"inputs": [], "name": "FUNDING_DURATION", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "PLATFORM_BPS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "RECIPIENT_BPS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "TREASURY_BPS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "cap", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "contribute", "outputs": [], "stateMutability": "payable", "type": "function"}, {"inputs": [{"internalType": "address", "name": "", "type": "address"}], "name": "contributions", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "deadline", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "distributed", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "isOpen", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "owner", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "platformWallet", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "recipient", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint256", "name": "amount", "type": "uint256"}], "name": "refund", "outputs": [], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [], "name": "remainingCap", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "renounceOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [], "name": "start", "outputs": [], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [], "name": "started", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "totalRaised", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "address", "name": "newOwner", "type": "address"}], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [], "name": "treasuryWallet", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "withdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function"}];

// BigPadVote — standalone identity vote (name/ticker/logo/roadmap/launch
// date) for a BigPad round. Reads contribution weight live from
// BigPadEscrow rather than holding its own snapshot or any funds — see
// contracts/BigPadVote.sol. Not wired into the frontend yet
// (CONFIG.BIGPAD_VOTE_ADDRESS is blank until deployed and a voting UI
// is built).
const BIGPAD_VOTE_ABI = [{"inputs": [{"internalType": "address", "name": "escrow_", "type": "address"}], "stateMutability": "nonpayable", "type": "constructor"}, {"inputs": [], "name": "InvalidCategory", "type": "error"}, {"inputs": [], "name": "InvalidOption", "type": "error"}, {"inputs": [], "name": "NoWeight", "type": "error"}, {"inputs": [], "name": "NotRecipient", "type": "error"}, {"inputs": [], "name": "OptionsAlreadySet", "type": "error"}, {"inputs": [], "name": "OptionsNotSet", "type": "error"}, {"inputs": [], "name": "TooFewOptions", "type": "error"}, {"inputs": [], "name": "VotingClosed", "type": "error"}, {"inputs": [], "name": "VotingNotOpenYet", "type": "error"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "uint8", "name": "category", "type": "uint8"}, {"indexed": false, "internalType": "string[]", "name": "options", "type": "string[]"}], "name": "OptionsProposed", "type": "event"}, {"anonymous": false, "inputs": [{"indexed": true, "internalType": "uint8", "name": "category", "type": "uint8"}, {"indexed": true, "internalType": "address", "name": "voter", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "optionIndex", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "weight", "type": "uint256"}], "name": "Voted", "type": "event"}, {"inputs": [], "name": "CATEGORY_COUNT", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "VOTING_WINDOW", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "escrow", "outputs": [{"internalType": "contract IBigPadEscrow", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint8", "name": "category", "type": "uint8"}], "name": "leading", "outputs": [{"internalType": "uint256", "name": "optionIndex", "type": "uint256"}, {"internalType": "uint256", "name": "weight", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint8", "name": "category", "type": "uint8"}, {"internalType": "address", "name": "voter", "type": "address"}], "name": "myVote", "outputs": [{"internalType": "bool", "name": "hasVoted", "type": "bool"}, {"internalType": "uint256", "name": "optionIndex", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint8", "name": "", "type": "uint8"}, {"internalType": "uint256", "name": "", "type": "uint256"}], "name": "optionWeight", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint8", "name": "category", "type": "uint8"}], "name": "options", "outputs": [{"internalType": "string[]", "name": "", "type": "string[]"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "name": "optionsSet", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint8", "name": "category", "type": "uint8"}, {"internalType": "string[]", "name": "newOptions", "type": "string[]"}], "name": "proposeOptions", "outputs": [], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [], "name": "recipient", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "uint8", "name": "category", "type": "uint8"}, {"internalType": "uint256", "name": "optionIndex", "type": "uint256"}], "name": "vote", "outputs": [], "stateMutability": "nonpayable", "type": "function"}, {"inputs": [], "name": "votingEnds", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}, {"inputs": [], "name": "votingOpen", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"}];

// CirclePad (arc-shared.js/circlepad.js) reuses BigPadEscrow.sol/BigPadVote.sol
// verbatim, just redeployed on Arc — same interface, so these are aliases,
// not a second copy of the ABI, kept in sync automatically.
const CIRCLEPAD_ESCROW_ABI = BIGPAD_ESCROW_ABI;
const CIRCLEPAD_VOTE_ABI = BIGPAD_VOTE_ABI;

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

  window.ethereum.on("chainChanged", async (cid) => {
    // A page that switches chains on purpose mid-flow (ARCIRCLE OMNI sending from Robinhood Chain) sets
    // window.arcChainSwitching: keep the session and pick up a signer on the new chain instead of reloading
    // (the reload is what dropped the connection and the transfer with it). Any other switch still reloads.
    if (window.arcChainSwitching) {
      state.chainId = Number.parseInt(cid, 16);
      try { state.signer = await new ethers.BrowserProvider(window.ethereum, "any").getSigner(); } catch (e) { /* next write asks again */ }
      if (typeof updateNetworkBadge === "function") updateNetworkBadge();
      return;
    }
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
            ${ARC_ALT_NET ? `<div class="wd-net" id="wallet-dropdown-net" role="radiogroup" aria-label="Wallet network"><button type="button" role="radio" data-net="arc" aria-checked="false"><i aria-hidden="true"></i>${CONFIG.CHAIN_NAME}</button><button type="button" role="radio" data-net="alt" aria-checked="false"><i aria-hidden="true"></i>${ARC_ALT_NET.short}</button>${window.arcSol ? `<button type="button" role="radio" data-net="sol" aria-checked="false"><i aria-hidden="true"></i>Solana</button>` : ""}</div>` : ""}
            ${window.arcSol ? `<div class="wd-sol" id="wallet-dropdown-sol" hidden></div>` : ""}
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
    const net = document.getElementById("wallet-dropdown-net");
    if (net) net.onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest("[data-net]");
      if (!b || b.getAttribute("aria-checked") === "true") return;
      if (b.dataset.net === "arc") switchToArcNetwork(); else if (b.dataset.net === "sol") switchToSolana(); else switchToAltNetwork();
    };
    const noteEl = document.getElementById("wallet-dropdown-note");
    if (noteEl && window.arcSol) noteEl.onclick = (e) => { const b = e.target.closest("[data-sol-pick]"); if (b) { e.stopPropagation(); switchToSolana(b.dataset.solPick); } };
    const solBox = document.getElementById("wallet-dropdown-sol");
    if (solBox) solBox.onclick = (e) => {
      e.stopPropagation();
      if (e.target.closest("[data-sol-copy]") && window.arcSol.key) navigator.clipboard.writeText(window.arcSol.key);
      if (e.target.closest("[data-sol-off]")) window.arcSol.disconnect();
    };
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
  if (window.arcSol && window.arcSol.selected()) window.arcSol.select(false); // the menu shows the EVM wallet again
  // keep the session through the switch (no reload): the chainChanged handler picks up a signer on Arc instead
  clearTimeout(switchToAltNetwork.t);
  window.arcChainSwitching = true;
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
    if (!usingAppKit) { state.chainId = CONFIG.CHAIN_ID_DECIMAL; try { state.signer = await new ethers.BrowserProvider(window.ethereum, "any").getSigner(); } catch (e) { /* next write asks */ } }
    document.dispatchEvent(new CustomEvent("arc:walletnet", { detail: { chainId: CONFIG.CHAIN_ID_DECIMAL } }));
  } catch (err) {
    const msg = String(err && (err.shortMessage || err.message) || err);
    setNote(/reject|denied|cancel/i.test(msg) ? "Switch cancelled in the wallet." : msg.slice(0, 260), true);
  } finally {
    switchingNetwork = false;
    switchToAltNetwork.t = setTimeout(() => { window.arcChainSwitching = false; }, 4000);
    if (btn) { btn.disabled = false; btn.textContent = `Switch to ${CONFIG.CHAIN_NAME}`; }
    if (badge) badge.classList.remove("network-busy");
    updateNetworkBadge();
  }
}

/// The wallet menu's second network: Robinhood Chain (Pons launches, OMNI, the desk). Choosing it switches the wallet
/// there and keeps the page from pulling it back to Arc; anything that writes on Arc still switches back first
/// (ensureArcForWrite), and Arc in the same menu switches back on demand.
var ARC_ALT_NET = (() => {
  const P = typeof CONFIG !== "undefined" && CONFIG.PONS;
  if (!P || !P.CHAIN_ID || !P.RPC) return null;
  return { id: Number(P.CHAIN_ID), hex: "0x" + Number(P.CHAIN_ID).toString(16), name: "Robinhood Chain", short: "Robinhood", rpc: P.RPC, explorer: P.EXPLORER, native: { name: "Ether", symbol: "ETH", decimals: 18 } };
})();
async function switchToAltNetwork(opts) {
  const strict = !!(opts && opts.strict); // a write is waiting on it: report failure by throwing
  if (!ARC_ALT_NET || !state.account) { if (strict) throw new Error("Connect a wallet first."); return; }
  if (switchingNetwork) { if (strict) throw new Error("Your wallet is already switching networks — try again in a moment."); return; }
  switchingNetwork = true;
  if (window.arcSol && window.arcSol.selected()) window.arcSol.select(false);
  const N = ARC_ALT_NET;
  const note = document.getElementById("wallet-dropdown-note");
  const net = document.getElementById("wallet-dropdown-net");
  const setNote = (text, bad) => { if (note) { note.hidden = !text; note.textContent = text || ""; note.classList.toggle("bad", !!bad); } };
  const add = { chainId: N.hex, chainName: N.name, rpcUrls: [N.rpc], blockExplorerUrls: [N.explorer], nativeCurrency: N.native };
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.shortMessage || e.message || "")));
  // the page must not reload (arc-shared chainChanged) or AppKit switch it back (wallet-appkit) meanwhile
  clearTimeout(switchToAltNetwork.t);
  window.arcChainSwitching = true;
  try { sessionStorage.setItem("wallet.autoSwitch." + state.account, "1"); } catch (e) { /* fine */ }
  const usingAppKit = typeof appKitReady !== "undefined" && appKitReady && !(typeof IN_APP_WALLET_BROWSER !== "undefined" && IN_APP_WALLET_BROWSER);
  const jumped = usingAppKit && typeof openConnectedWalletApp === "function" && openConnectedWalletApp();
  if (net) net.classList.add("busy");
  setNote(jumped ? `Approve the switch to ${N.name} in your wallet app, then come back here.` : `Approve the switch to ${N.name} in your wallet.`);
  try {
    let done = false;
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try {
        const acc = WagmiCoreRef.getAccount(wagmiConfigRef);
        if (acc && acc.isConnected) { if (Number(acc.chainId) !== N.id) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: N.id, addEthereumChainParameter: add }); done = true; }
      } catch (e) { if (rejected(e)) throw e; /* the wallet's own provider below */ }
    }
    const eip = state.walletProvider || window.ethereum;
    if (!done) {
      if (!eip) throw new Error("No wallet connected.");
      try { await eip.request({ method: "wallet_switchEthereumChain", params: [{ chainId: N.hex }] }); }
      catch (e) {
        if (rejected(e)) throw e;
        await eip.request({ method: "wallet_addEthereumChain", params: [add] });
        await eip.request({ method: "wallet_switchEthereumChain", params: [{ chainId: N.hex }] }).catch(() => {});
      }
    }
    state.chainId = N.id;
    if (eip) { try { state.signer = await new ethers.BrowserProvider(eip, "any").getSigner(state.account); } catch (e) { /* the next write asks again */ } }
    setNote("");
    document.dispatchEvent(new CustomEvent("arc:walletnet", { detail: { chainId: N.id } }));
  } catch (err) {
    const msg = String(err && (err.shortMessage || err.message) || err);
    setNote(rejected(err) ? "Switch cancelled in the wallet." : msg.slice(0, 260), true);
    if (strict) throw err;
  } finally {
    switchingNetwork = false;
    if (net) net.classList.remove("busy");
    switchToAltNetwork.t = setTimeout(() => { window.arcChainSwitching = false; }, 4000); // late chainChanged events land inside the hold
    updateNetworkBadge();
  }
}

/// The wallet menu's third choice: Solana (ArcPad × Pump.fun). Not a network the EVM wallet can switch to — it connects
/// the Solana wallet (arc-solwallet.js: Phantom, Solflare, Backpack, MetaMask through the Wallet Standard) beside it and
/// shows that one in the menu. The EVM wallet stays where it is, and Arc / Robinhood Chain writes keep using it.
/// With more than one Solana wallet in the browser the menu asks which (`pick` is the answer).
async function switchToSolana(pick) {
  const S = window.arcSol;
  if (!S) return;
  const note = document.getElementById("wallet-dropdown-note");
  const net = document.getElementById("wallet-dropdown-net");
  const setNote = (html, bad) => { if (note) { note.hidden = !html; note.innerHTML = html || ""; note.classList.toggle("bad", !!bad); } };
  const safe = (t) => String(t).replace(/[<>&"]/g, "");
  if (!S.key && (pick != null || !(await S.quiet()))) {
    const list = S.providers();
    if (!list.length) {
      const a = (w, href) => `<a href="${href}"${S.mobile() ? "" : ' target="_blank" rel="noopener"'}>${w}</a>`;
      setNote(S.mobile()
        ? `No Solana wallet in this browser — open this page in ${a("Phantom", S.openIn("Phantom"))}, ${a("Solflare", S.openIn("Solflare"))} or ${a("MetaMask", S.openIn("MetaMask"))}.`
        : `No Solana wallet in this browser — install ${a("Phantom", "https://phantom.com/download")} or ${a("Solflare", "https://solflare.com/download")}, or turn on Solana in ${a("MetaMask", "https://metamask.io/download")}.`, true);
      return;
    }
    if (pick == null && list.length > 1) {
      setNote(`Which Solana wallet? <span class="wd-sol-pick">${list.map((x, i) => `<button type="button" class="btn-mini" data-sol-pick="${i}">${safe(x.name)}</button>`).join("")}</span>`);
      return;
    }
    const i = pick == null ? 0 : Number(pick);
    if (!list[i]) return;
    if (net) net.classList.add("busy");
    setNote(`Approve the connection in ${safe(list[i].name)}.`);
    try { await S.connect(i); }
    catch (err) { const m = String((err && err.message) || err); setNote(/reject|denied|cancel/i.test(m) || (err && err.code === 4001) ? "Connection cancelled in the wallet." : safe(m.slice(0, 200)), true); return; }
    finally { if (net) net.classList.remove("busy"); }
  }
  setNote("");
  S.select(true);
}
document.addEventListener("arc:solwallet", () => { if (typeof updateNetworkBadge === "function") updateNetworkBadge(); });

/// The Robinhood Chain twin of ensureArcForWrite (a Multisender send on Robinhood Chain): switch the wallet there if
/// it isn't, and return a signer that is on it.
async function ensureAltForWrite() {
  if (!ARC_ALT_NET) throw new Error("Robinhood Chain isn't set up on this page.");
  const N = ARC_ALT_NET, eip = state.walletProvider || window.ethereum;
  if (!state.account || !eip) throw new Error("Connect a wallet first.");
  let on = null;
  try { on = Number.parseInt(await eip.request({ method: "eth_chainId" }), 16); } catch (e) { on = null; }
  if (on !== N.id) await switchToAltNetwork({ strict: true });
  const bp = new ethers.BrowserProvider(eip, "any");
  for (let i = 0; i < 8; i++) { // some wallets report the new chain a moment after the switch resolves
    if (Number((await bp.getNetwork()).chainId) === N.id) { state.chainId = N.id; state.signer = await bp.getSigner(state.account); return state.signer; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Your wallet is still on another network — switch it to ${N.name} and try again.`);
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
  // Solana picked in the menu (and its wallet connected): the menu shows that wallet
  const S = window.arcSol, sol = document.getElementById("wallet-dropdown-sol");
  const onSol = !!(S && S.selected() && S.key);
  if (sol) {
    sol.hidden = !onSol;
    if (onSol) sol.innerHTML = `<small>Solana · ${S.name}</small><code>${S.key.slice(0, 4)}…${S.key.slice(-4)}</code><span class="btn-mini" data-sol-copy style="cursor:pointer">Copy</span><span class="btn-mini" data-sol-off style="cursor:pointer">Disconnect</span>`;
  }
  if (onSol) {
    const net = document.getElementById("wallet-dropdown-net");
    if (net) net.querySelectorAll("[data-net]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.net === "sol")));
    badge.classList.remove("network-alt", "network-bad"); badge.classList.add("network-sol");
    badge.textContent = "Solana"; badge.title = `Solana wallet ${S.key}`; badge.style.cursor = ""; badge.onclick = null;
    const ex = document.querySelector('#wallet-dropdown a.wallet-dropdown-item[href*="/address/"], #wallet-dropdown a.wallet-dropdown-item[href*="/account/"]');
    if (ex) ex.href = `https://solscan.io/account/${S.key}`;
    if (line) { line.textContent = `Solana wallet connected — your ${CONFIG.CHAIN_NAME} wallet stays as it is`; line.classList.remove("network-bad"); line.classList.add("network-ok"); }
    if (btn) btn.hidden = true;
    document.documentElement.dataset.walletNet = "sol";
    return;
  }
  badge.classList.remove("network-sol");
  try {
    const chainId = await currentChainId();
    if (chainId == null) throw new Error("unknown");
    const onAlt = !!ARC_ALT_NET && chainId === ARC_ALT_NET.id;
    const isCorrect = chainId === CONFIG.CHAIN_ID_DECIMAL || onAlt;
    const net = document.getElementById("wallet-dropdown-net");
    if (net) net.querySelectorAll("[data-net]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.net === (onAlt ? "alt" : chainId === CONFIG.CHAIN_ID_DECIMAL ? "arc" : ""))));
    badge.classList.toggle("network-alt", onAlt);
    const ex = document.querySelector('#wallet-dropdown a.wallet-dropdown-item[href*="/address/"], #wallet-dropdown a.wallet-dropdown-item[href*="/account/"]');
    if (ex) ex.href = `${onAlt ? ARC_ALT_NET.explorer : CONFIG.BLOCK_EXPLORER}/address/${state.account}`;
    if (onAlt) {
      badge.textContent = ARC_ALT_NET.short; badge.title = `Connected to ${ARC_ALT_NET.name}`;
      badge.classList.remove("network-bad"); badge.style.cursor = ""; badge.onclick = null;
      if (line) { line.textContent = `Connected to ${ARC_ALT_NET.name}`; line.classList.remove("network-bad"); line.classList.add("network-ok"); }
      if (btn) btn.hidden = true;
      document.documentElement.dataset.walletNet = "alt";
      return;
    }
    document.documentElement.dataset.walletNet = isCorrect ? "arc" : "other";
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
    if (btn) btn.hidden = isCorrect || !!net;
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
/* ---- wallet-appkit.js ---- */
/* global ethers, CONFIG, state, renderHeader */

// Reown AppKit gives a polished multi-wallet connect modal (the one you see
// on kekfun.xyz, credited "UX by reown" at the bottom of it) — a list of
// installed/popular wallets plus a "search 80+ wallets" option, with
// WalletConnect QR support for mobile wallets baked in.
//
// This site has no build step by design, and AppKit's main package expects
// a bundler (Vite). This uses Reown's own purpose-built CDN bundle,
// @reown/appkit-cdn, which ships a single pre-bundled ESM file specifically
// so it can be used directly with no bundler. It exposes createAppKit + a
// Wagmi adapter (not an Ethers one), so this file bridges the connected
// wagmi/viem client into an ethers.Signer via ethers.BrowserProvider — the
// standard pattern for mixing wagmi's wallet layer with ethers-based
// contract code — so nothing else in app.js has to change.
//
// The modal itself is confirmed working. What's NOT fully confirmed is
// which of this pinned version's account-change events actually fire
// reliably (the docs for the current npm version describe APIs this older
// CDN build may not match exactly). Rather than depend on any single event
// working, this registers every plausible listener defensively AND polls
// for a short window after the modal opens as a guaranteed fallback — so
// the header updates even if every event hook above it turns out to be a
// no-op on this build.

let appKitModal = null;
let appKitReady = false;
let wagmiConfigRef = null;
let WagmiCoreRef = null;
let appKitNetwork = null;

// True from the moment the connect modal opens until a session is
// confirmed or the modal closes without one. While it's set, transient
// errors from a half-established session (WalletConnect pairing still
// settling, wallet app not back in the foreground yet) must NOT be treated
// as "stale session, wipe storage" — that exact cleanup, firing mid-handshake
// from the poller, is what killed connection attempts and forced people to
// clear their cache and start over.
let connectInFlight = false;
let connectPoll = null;

// On a phone, "Connect" hands off to the wallet app (MetaMask, …) and the
// browser tab goes to the background — Chrome may freeze its timers, drop the
// WalletConnect socket, or even reload the tab before the person comes back.
// The fact that a connect is under way therefore has to outlive the tab's JS
// state: it's kept in sessionStorage for a few minutes, and while it's set,
// nothing may treat the half-finished session as "stale" and wipe it.
const CONNECT_PENDING_KEY = "wallet.connectPending";
const CONNECT_PENDING_MS = 5 * 60 * 1000;
let lastResumeAt = 0;
function markConnectPending() { try { sessionStorage.setItem(CONNECT_PENDING_KEY, String(Date.now())); } catch { /* fine */ } }
function clearConnectPending() { try { sessionStorage.removeItem(CONNECT_PENDING_KEY); } catch { /* fine */ } }
function connectPending() {
  try { const t = Number(sessionStorage.getItem(CONNECT_PENDING_KEY)); return t > 0 && Date.now() - t < CONNECT_PENDING_MS; } catch { return false; }
}
/// True while a connect is being set up here or in the wallet app, or just
/// after the tab came back to the foreground (WalletConnect replays queued
/// relay messages then, and some of them throw harmless "No matching key"
/// errors while it catches up).
function connectBusy() { return connectInFlight || connectPending() || Date.now() - lastResumeAt < 30000; }

// "Disconnect" has to survive a reload. The wallet extension still has the
// site permission (a website can't revoke that), so wagmi's reconnect-on-
// mount would otherwise quietly bring the session straight back and the
// header would say "connected" again — the "it never disconnects" report.
// This flag makes the next load stay disconnected until Connect is clicked.
const USER_DISCONNECTED_KEY = "homepad.walletDisconnected";
const userDisconnected = () => { try { return localStorage.getItem(USER_DISCONNECTED_KEY) === "1"; } catch { return false; } };
function setUserDisconnected(on) { try { on ? localStorage.setItem(USER_DISCONNECTED_KEY, "1") : localStorage.removeItem(USER_DISCONNECTED_KEY); } catch { /* fine */ } }

/// The one way to end a session. Goes through AppKit's own disconnect
/// FIRST — AppKit keeps its own account store beside wagmi's, and calling
/// wagmi's disconnect() underneath it left AppKit still showing the
/// account (so its own Disconnect button then failed with "Failed to
/// disconnect", because wagmi had nothing left to disconnect). Then wagmi,
/// then storage, then our header.
async function hardDisconnect() {
  // Local state first, so the header flips to "Connect wallet" immediately
  // even if the wallet side never answers (a WalletConnect relay waiting on
  // a phone wallet that's in the background can hang the disconnect call
  // indefinitely — which looked like "Disconnect does nothing").
  state.account = null; state.signer = null; state.chainId = null; state.walletProvider = null;
  if (typeof renderHeader === "function") renderHeader();
  if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
  if (connectPoll) { clearInterval(connectPoll); connectPoll = null; }
  connectInFlight = false;
  try { if (appKitModal && typeof appKitModal.disconnect === "function") await withTimeout(appKitModal.disconnect(), 4000); } catch (e) { console.warn("appkit disconnect", e && e.message); }
  try {
    if (WagmiCoreRef && wagmiConfigRef && WagmiCoreRef.getAccount(wagmiConfigRef).isConnected) await withTimeout(WagmiCoreRef.disconnect(wagmiConfigRef), 3000);
  } catch (e) { console.warn("wagmi disconnect", e && e.message); }
  clearStaleWalletStorage();
}

// wagmi v2 persists its connection state in a single 'wagmi.*'-prefixed
// localStorage blob; WalletConnect/Reown add their own 'wc@2:' and
// '@appkit'/'@w3m' keys for relay sessions and UI state. A stale entry
// here — most often an expired WalletConnect relay session that wagmi
// still optimistically flags as connected — is exactly what produces
// "the button says Connect, but I'm secretly still connected" bugs that
// only clearing site data used to fix: wagmi reports isConnected on every
// load, syncFromWagmi() below tries to actually use that session, fails,
// and nothing ever cleans up the flag that caused it to try again next
// time. Any place that detects a broken session calls this directly
// instead of asking the person to clear their cache.
const WALLET_STORAGE_PREFIXES = ["wagmi.", "wc@2:", "@w3m", "@appkit", "WCM_VERSION", "-walletlink"];
function clearLocalWalletKeys() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (WALLET_STORAGE_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch (e) { /* storage blocked (private mode etc.) — nothing to clear anyway */ }
}
function clearStaleWalletStorage() {
  clearLocalWalletKeys();
  // WalletConnect keeps its sessions / pairings / provider namespaces in
  // IndexedDB, not localStorage. Clearing only localStorage left the two
  // halves disagreeing, and the next connect died inside AppKit with
  // "Cannot read properties of undefined (reading 'setDefaultChain')".
  // IndexedDB can't be deleted while WalletConnect has it open, so the
  // full wipe happens at the start of the next page load (see initAppKit).
  try { localStorage.setItem(WALLET_RESET_FLAG, "1"); } catch { /* fine */ }
}

// ---- WalletConnect storage self-repair ----
const WC_IDB_NAME = "WALLET_CONNECT_V2_INDEXED_DB";
const WALLET_RESET_FLAG = "wallet.resetPending";
// Bump to force every browser to start from a clean WalletConnect store
// once (v2: clears the half-wiped state older builds could leave behind).
const WALLET_STORE_VERSION_KEY = "wallet.storeVersion";
const WALLET_STORE_VERSION = "2";
const BROKEN_WC_SESSION = /setDefaultChain|Please call connect\(\)|No matching key|session topic doesn't exist|Record was recently deleted|Missing or invalid\. (?:pairing|session)/i;

function deleteWalletConnectDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(WC_IDB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
      setTimeout(resolve, 1500);
    } catch { resolve(); }
  });
}

/// Runs before AppKit loads (so nothing has the database open yet).
async function repairWalletStorageIfNeeded() {
  let need = false;
  try { need = localStorage.getItem(WALLET_RESET_FLAG) === "1" || localStorage.getItem(WALLET_STORE_VERSION_KEY) !== WALLET_STORE_VERSION; } catch { return; }
  if (!need) return;
  clearLocalWalletKeys();
  await deleteWalletConnectDb();
  try { localStorage.removeItem(WALLET_RESET_FLAG); localStorage.setItem(WALLET_STORE_VERSION_KEY, WALLET_STORE_VERSION); } catch { /* fine */ }
}

/// A corrupted WalletConnect store surfaces as one of a handful of AppKit
/// errors. Instead of leaving the person stuck on it, wipe the store and
/// reload, then reopen the connect window so they can just pick the wallet
/// again.
let healingWallet = false;
function healBrokenWalletConnect(reason) {
  if (healingWallet) return;
  if (connectBusy() || document.visibilityState === "hidden") {
    // Mid-handshake or just back from the wallet app: this is WalletConnect
    // catching up, not a broken store. Wiping + reloading here is exactly
    // what erased a connection the person had just approved in MetaMask.
    console.warn("WalletConnect error during connect — not resetting.", reason);
    return;
  }
  healingWallet = true;
  console.warn("WalletConnect store is inconsistent — resetting it and reloading.", reason);
  try { localStorage.setItem(WALLET_RESET_FLAG, "1"); sessionStorage.setItem("wallet.reopenModal", "1"); } catch { /* fine */ }
  setTimeout(() => location.reload(), 250);
}
window.addEventListener("unhandledrejection", (e) => {
  const m = String(e && e.reason && (e.reason.message || e.reason) || "");
  if (BROKEN_WC_SESSION.test(m)) healBrokenWalletConnect(m);
});
window.addEventListener("error", (e) => {
  const m = String(e && (e.message || (e.error && e.error.message)) || "");
  if (BROKEN_WC_SESSION.test(m)) healBrokenWalletConnect(m);
});

/// Races a promise against a plain timeout so a hung reconnect attempt
/// (dead WalletConnect relay, a wallet extension that never responds)
/// resolves into "treat as disconnected" instead of leaving the header in
/// limbo indefinitely with no visible next step.
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve("timeout"); });
  });
}

// Bridges a connected viem/wagmi client into an ethers v6 Signer. Standard
// wagmi<->ethers adapter pattern — the viem WalletClient's transport is an
// EIP-1193-compatible provider, which is exactly what ethers.BrowserProvider
// expects. Returns true if a wallet is connected, so the poller below can
// stop early.
// One automatic "switch to <chain>" request per address per browser tab session,
// right after a wallet connects on another chain — enough to land people on
// the right network by default, without the repeated prompts a switch on
// every sync used to cause.
let syncFailures = 0;
let syncRetryTimer = null;
function scheduleSyncRetry() {
  syncFailures++;
  if (syncRetryTimer) return;
  syncRetryTimer = setTimeout(() => { syncRetryTimer = null; syncFromWagmi(); }, Math.min(6000, 800 * syncFailures));
}

const autoSwitchTried = {
  has(a) { try { return sessionStorage.getItem("wallet.autoSwitch." + a) === "1"; } catch { return false; } },
  add(a) { try { sessionStorage.setItem("wallet.autoSwitch." + a, "1"); } catch { /* fine */ } },
};

async function syncFromWagmi() {
  if (!WagmiCoreRef || !wagmiConfigRef) return false;
  // After Disconnect, AppKit's own account store can still report the old
  // address for a while (its disconnect goes over the relay). Don't let that
  // bring the session back until Connect is pressed again.
  if (userDisconnected() && !connectBusy()) {
    if (state.account) {
      state.account = null; state.signer = null; state.chainId = null;
      if (typeof renderHeader === "function") renderHeader();
    }
    return false;
  }
  let connectorType = null;
  try {
    let account = WagmiCoreRef.getAccount(wagmiConfigRef);
    connectorType = account.connector && account.connector.type;
    if (!(account.isConnected && account.address) && appKitModal && typeof appKitModal.getAddress === "function") {
      // AppKit keeps its own account store; if it has a session wagmi's
      // store doesn't (seen on some injected builds), trust AppKit.
      const addr = appKitModal.getAddress && appKitModal.getAddress();
      const connected = typeof appKitModal.getIsConnectedState === "function" ? appKitModal.getIsConnectedState() : !!addr;
      if (addr && connected) {
        const provider = typeof appKitModal.getWalletProvider === "function" ? appKitModal.getWalletProvider() : null;
        account = { isConnected: true, address: addr, chainId: Number(appKitModal.getChainId && appKitModal.getChainId()) || null, connector: provider ? { type: "appkit", getProvider: async () => provider } : null };
      }
    }
    if (account.isConnected && account.address) {
      // The basic (non-AppKit) connect flow force-switches to Robinhood
      // Chain via ensureNetwork() in app.js. This path needs the same
      // guarantee — otherwise a wallet connected via AppKit while active
      // on some other chain would silently point every contract call here
      // at the wrong network.
      // Don't force a network switch here. This runs on every account
      // event AND on a 1.3s poll while the modal is open, so switching
      // from here meant a wallet on another chain got a "switch network?"
      // prompt over and over, and rejecting it just queued the next one.
      // The wrong-chain state is shown in the header instead, and the
      // switch happens exactly once, right before a transaction is sent
      // (ensureAppKitChain in tryWagmiWrite) or when the badge is tapped.
      state.chainId = account.chainId;

      // The connector's raw EIP-1193 provider works on any chain. (wagmi's
      // getConnectorClient is gated to chains in the config, so on a
      // wrong-chain session it threw — and the header stayed on "Connect
      // wallet" even though the wallet was connected.)
      const eip1193 = account.connector && typeof account.connector.getProvider === "function"
        ? await account.connector.getProvider()
        : (await WagmiCoreRef.getConnectorClient(wagmiConfigRef)).transport;
      const changed = state.account !== account.address;
      state.account = account.address; // header first — a signer failure below must not hide a connected wallet
      state.walletProvider = eip1193;
      if (Number(account.chainId) !== CONFIG.CHAIN_ID_DECIMAL && !window.arcChainSwitching && !autoSwitchTried.has(account.address)) {
        autoSwitchTried.add(account.address);
        setTimeout(() => { ensureAppKitChain().catch((e) => console.warn("auto network switch declined/failed", e && e.message)); }, 400);
      }
      try {
        const browserProvider = new ethers.BrowserProvider(eip1193);
        state.signer = await browserProvider.getSigner(account.address);
      } catch (signerErr) {
        console.warn("signer unavailable for now (writes still go through wagmi)", signerErr && signerErr.message);
        state.signer = state.signer || null;
      }
      // This sync is wired to several triggers (watchAccount, AppKit
      // subscribeAccount, modal close, initial load) and they often fire
      // back-to-back for the same account. Only re-render on an ACTUAL
      // change — re-rendering the Profile page 3-4 times in a row started
      // overlapping async loads that overwrote each other's results.
      connectInFlight = false;
      clearConnectPending();
      syncFailures = 0;
      if (connectPoll) { clearInterval(connectPoll); connectPoll = null; }
      if (changed) {
        if (typeof renderHeader === "function") renderHeader();
        // Wallet auto-reconnect finishes AFTER the page's initial route()
        // call, so a view that depends on state.account (Profile, a token
        // page's Balance) would otherwise sit on stale data — Profile's
        // "not connected" state forever, or a token page silently keeping
        // whichever account's numbers it had before this account switch.
        if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
      } else if (typeof updateNetworkBadge === "function") {
        updateNetworkBadge(); // chain may still have changed
      }
      return true;
    } else {
      if (state.account) {
        state.account = null;
        state.signer = null;
        if (typeof renderHeader === "function") renderHeader();
        if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
      }
      return false;
    }
  } catch (err) {
    // wagmi said isConnected, but actually using that session threw —
    // an expired WalletConnect relay or a revoked permission are the
    // usual causes. Left alone, wagmi's own persisted flag keeps saying
    // "connected" on every future load and this same failure repeats
    // forever (the exact "stuck" bug this file exists to prevent).
    // Force-disconnect and sweep storage so the NEXT check starts from a
    // state that's actually true, and reflect that in the header now
    // instead of leaving it on whatever it last showed.
    if (connectBusy()) {
      // Mid-handshake — the session may simply not be usable yet. Leave
      // storage alone; the poller / next event will try again.
      console.warn("syncFromWagmi: session not usable yet (connect in progress)", err && err.message);
      return false;
    }
    if (connectorType === "injected" || connectorType === "metaMask") {
      // An in-app browser / extension wallet can't have a "stale relay
      // session" — it re-authorises itself on every load. A failure here
      // is transient (provider not ready yet); killing the session for it
      // is what produced "connected in the wallet, Connect in the header".
      console.warn("syncFromWagmi: injected provider not ready yet", err && err.message);
      scheduleSyncRetry();
      return false;
    }
    // Right after a page load (e.g. going from /arc to /circle) wagmi is
    // still re-hydrating the WalletConnect session, and touching it throws
    // things like "connector.getChainId is not a function" for a moment.
    // Treating that as a dead session and disconnecting is what logged
    // people out every time they changed pages. Retry for a while first;
    // only a session that keeps failing is cleared as stale.
    if (syncFailures < 6) {
      console.warn("syncFromWagmi: session not ready yet — retrying", err && err.message);
      scheduleSyncRetry();
      return false;
    }
    console.warn("syncFromWagmi kept failing — clearing the stale session so it doesn't repeat.", err);
    syncFailures = 0;
    await hardDisconnect();
    return false;
  }
}

// A wallet app's built-in browser (MetaMask, Robinhood Wallet, Trust, …)
// injects window.ethereum and is already "the wallet". Putting AppKit +
// WalletConnect + wagmi's own account store in front of that added three
// places for the connection state to disagree — which is exactly what
// showed up: the wallet connected, AppKit showing the account, our header
// saying Connect. On these browsers the plain injected flow in app.js is
// used instead: one provider, one state, nothing to get out of sync.
const IN_APP_WALLET_BROWSER = !!window.ethereum && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

async function initAppKit() {
  if (IN_APP_WALLET_BROWSER || !CONFIG.REOWN_PROJECT_ID) {
    if (typeof restoreBasicWallet === "function") restoreBasicWallet();
    return;
  }

  await repairWalletStorageIfNeeded();
  try {
    // Pinned to a specific version on purpose (never @latest — that can change
// under us with no warning) but this was stuck on 1.4.1, an ~11-month-old
// build. allowUnsupportedChain (below) is documented AppKit behavior, but
// 1.4.1 predates it — or has a bug in it — which is why the "Switch
// Network" trap kept happening even with the option set correctly. Bumped
// to a current stable release.
const appkitCdn = await import("https://cdn.jsdelivr.net/npm/@reown/appkit-cdn@1.8.18/dist/appkit.min.js");
    const { createAppKit, WagmiAdapter, WagmiCore } = appkitCdn;
    WagmiCoreRef = WagmiCore;

    // Shape AppKit's own defineChain() produces. Without chainNamespace /
    // caipNetworkId this build treated the wallet's chain as "unsupported"
    // and showed its Select-network screen with nothing it could switch
    // to — the "it asks me to pick a chain and then nothing happens" bug.
    const robinhoodNetwork = {
      id: CONFIG.CHAIN_ID_DECIMAL,
      name: CONFIG.CHAIN_NAME,
      nativeCurrency: CONFIG.NATIVE_CURRENCY,
      rpcUrls: { default: { http: [CONFIG.RPC_URL] } },
      blockExplorers: { default: { name: "Explorer", url: CONFIG.BLOCK_EXPLORER } },
      chainNamespace: "eip155",
      caipNetworkId: `eip155:${CONFIG.CHAIN_ID_DECIMAL}`,
      testnet: false,
    };

    appKitNetwork = robinhoodNetwork;
    // The Bridge utility (arc-bridge.js) moves USDC to and from these chains:
    // listing them lets the wallet switch to them over WalletConnect too.
    // The site's own chain stays the default and the one every write checks.
    const bridgeNetworks = ((CONFIG.BRIDGE && CONFIG.BRIDGE.CHAINS) || []).map((c) => ({
      id: c.chainId, name: c.name, nativeCurrency: c.native,
      rpcUrls: { default: { http: [c.rpc] } },
      blockExplorers: { default: { name: "Explorer", url: c.explorer } },
      chainNamespace: "eip155", caipNetworkId: `eip155:${c.chainId}`, testnet: false,
    }));
    // ARCIRCLE OMNI sends from other chains too (arc-omni.js): list those so a WalletConnect
    // session can switch to them and wagmi doesn't treat them as unsupported.
    const omniNetworks = Object.values((CONFIG.OMNI && CONFIG.OMNI.CHAINS) || {})
      .filter((c) => c.chainId && c.rpc && c.chainId !== CONFIG.CHAIN_ID_DECIMAL && !bridgeNetworks.some((b) => b.id === c.chainId))
      .map((c) => ({
        id: c.chainId, name: c.name, nativeCurrency: { name: "Ether", symbol: c.gas || "ETH", decimals: 18 },
        rpcUrls: { default: { http: [c.rpc] } },
        blockExplorers: { default: { name: "Explorer", url: c.explorer } },
        chainNamespace: "eip155", caipNetworkId: `eip155:${c.chainId}`, testnet: false,
      }));
    const allNetworks = [robinhoodNetwork].concat(bridgeNetworks, omniNetworks);
    const wagmiAdapter = new WagmiAdapter({
      projectId: CONFIG.REOWN_PROJECT_ID,
      networks: allNetworks,
    });
    wagmiConfigRef = wagmiAdapter.wagmiConfig;

    appKitModal = createAppKit({
      adapters: [wagmiAdapter],
      networks: allNetworks,
      defaultNetwork: robinhoodNetwork,
      // A wallet that connects while on another chain (very common on
      // mobile — WalletConnect sessions come back on whatever chain the
      // wallet app is showing) must NOT be trapped in AppKit's own
      // "Switch Network" screen: on WalletConnect that screen's button
      // fires a request the wallet app can't see from the browser, so it
      // looks like it does nothing. Let the session through; the header
      // shows the wrong-chain state and ensureAppKitChain() handles the
      // switch (with wallet_addEthereumChain) when it actually matters.
      allowUnsupportedChain: true,
      projectId: CONFIG.REOWN_PROJECT_ID,
      // Shown by the wallet on its connect / approve screens.
      metadata: {
        name: CONFIG.APP_NAME || "HOMEPAD",
        description: CONFIG.APP_DESCRIPTION || "A permissionless launchpad on Robinhood Chain, built by $HOME.",
        url: location.origin,
        icons: [location.origin + (CONFIG.APP_ICON || "/images/gallery-mark.png")],
      },
      // Wallets only — no email/social login. This is a crypto-native
      // launchpad; an email-created custodial-ish wallet isn't the flow
      // we want people landing in by default.
      features: {
        email: false,
        socials: false,
      },
    });

    // AppKit reports connect failures as events (the red banner in its
    // modal). The ones that mean "the stored WalletConnect state is broken"
    // get repaired automatically instead of shown forever.
    try {
      appKitModal.subscribeEvents && appKitModal.subscribeEvents((ev) => {
        const d = ev && ev.data;
        const msg = d && d.properties && d.properties.message;
        if (d && /ERROR/.test(String(d.event)) && BROKEN_WC_SESSION.test(String(msg || ""))) healBrokenWalletConnect(msg);
      });
    } catch (e) { console.warn("subscribeEvents unavailable", e); }

    // Register every plausible "something changed" hook defensively — if a
    // given method doesn't exist or throws on this build, that's caught
    // and the others (plus the poller in tryOpenAppKit) still cover it.
    try { WagmiCoreRef.watchAccount(wagmiConfigRef, { onChange: syncFromWagmi }); } catch (e) { console.warn("watchAccount unavailable", e); }
    try { appKitModal.subscribeAccount && appKitModal.subscribeAccount(syncFromWagmi); } catch (e) { console.warn("subscribeAccount unavailable", e); }
    try {
      appKitModal.subscribeState && appKitModal.subscribeState((s) => {
        if (s.open) return;
        // Closed while the page is in front and not right after coming back
        // from the wallet app = the person dismissed it.
        if (document.visibilityState === "visible" && Date.now() - lastResumeAt > 4000) clearConnectPending();
        // One last check, then stop treating errors as "still connecting".
        syncFromWagmi().finally(() => {
          setTimeout(() => {
            const a = WagmiCoreRef.getAccount(wagmiConfigRef);
            if (!a.isConnected && !connectPending()) { connectInFlight = false; if (connectPoll) { clearInterval(connectPoll); connectPoll = null; } }
          }, 1500);
        });
      });
    } catch (e) { console.warn("subscribeState unavailable", e); }

    if (connectPending()) {
      // The tab was reloaded (or restored) in the middle of a connect — most
      // often Chrome discarding it while MetaMask was in front. Keep waiting
      // for the approved session instead of starting from "disconnected".
      connectInFlight = true;
      lastResumeAt = Date.now();
      setUserDisconnected(false);
    }
    // In case a session is already restored on load. Timeout-guarded
    // separately from syncFromWagmi's own error handling above, since a
    // HUNG reconnect (relay never responds, rather than responding with
    // an error) wouldn't hit that catch block at all.
    if (userDisconnected()) {
      // They pressed Disconnect last time. An in-app / extension wallet
      // re-authorises on every load regardless, so wagmi will have
      // reconnected on mount — undo it through AppKit's own API so both
      // stores agree, and stay disconnected until Connect is pressed.
      // (Give the auto-reconnect a beat to land first, or there's nothing
      // to undo yet and it comes back a second later.)
      await new Promise((r) => setTimeout(r, 600));
      await hardDisconnect();
    }
    const restored = userDisconnected() ? false : await withTimeout(syncFromWagmi(), 8000);
    if (restored !== true && connectPending()) startConnectPoll(90);
    if (restored === "timeout") {
      // A WalletConnect relay on a phone can take longer than this to come
      // back. Don't destroy the session for being slow — keep listening
      // (watchAccount / subscribeAccount) and check again shortly.
      console.warn("Wallet session restore is slow — will keep checking.");
      scheduleSyncRetry();
    }
    appKitReady = true;
    let reopen = false;
    try { reopen = sessionStorage.getItem("wallet.reopenModal") === "1"; sessionStorage.removeItem("wallet.reopenModal"); } catch { /* fine */ }
    if (reopen && !state.account) setTimeout(() => { tryOpenAppKit(); }, 400);
  } catch (err) {
    console.warn("Reown AppKit failed to load — falling back to the basic wallet connect button.", err);
    appKitReady = false;
  }
}

/// Guaranteed fallback: poll for a connected account, independent of whether
/// any event listener fires on this build. Only time the tab is in front
/// counts toward the limit — on a phone the person is in the wallet app for
/// most of the connect, with this tab frozen in the background.
function startConnectPoll(visibleSeconds) {
  if (connectPoll) clearInterval(connectPoll);
  let ticks = 0;
  const maxTicks = Math.ceil((visibleSeconds * 1000) / 1300);
  connectPoll = setInterval(async () => {
    if (document.visibilityState === "hidden") return;
    ticks++;
    const connected = await syncFromWagmi();
    if (connected || ticks > maxTicks) {
      clearInterval(connectPoll); connectPoll = null;
      if (!connected) { connectInFlight = false; clearConnectPending(); }
    }
  }, 1300);
}

/// Back from the wallet app: wake WalletConnect up (its socket is usually
/// gone after the tab was in the background) and look for the session the
/// person just approved.
async function onWalletResume() {
  if (!appKitReady || !WagmiCoreRef || !wagmiConfigRef) return;
  if (!(connectInFlight || connectPending())) {
    // Not connecting — just make sure an existing session is still reflected.
    syncFromWagmi().catch(() => {});
    return;
  }
  lastResumeAt = Date.now();
  connectInFlight = true;
  try { if (typeof WagmiCoreRef.reconnect === "function") await withTimeout(WagmiCoreRef.reconnect(wagmiConfigRef), 6000); } catch { /* the poll below covers it */ }
  if (!(await syncFromWagmi())) startConnectPoll(90);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onWalletResume(); });
window.addEventListener("pageshow", (e) => { if (e.persisted) onWalletResume(); });

/// Called by app.js's connect button instead of its own basic flow, when
/// AppKit is available. Returns true if it handled the click, false if the
/// caller should fall back to its own logic.
async function tryOpenAppKit() {
  if (appKitReady && appKitModal) {
    setUserDisconnected(false);
    // In-app wallet browsers (MetaMask, Robinhood Wallet, …) auto-connect
    // their injected provider; if wagmi already has the session, "Connect"
    // just means "show it" — opening the modal here lands people on
    // AppKit's Account view with a Disconnect button, which reads as a bug.
    if (await syncFromWagmi()) return true;
    connectInFlight = true;
    markConnectPending();
    appKitModal.open();
    startConnectPoll(120);
    return true;
  }
  return false;
}

/// Switches the AppKit/wagmi session to Robinhood Chain, adding the chain
/// to the wallet first if it doesn't have it. Called exactly where a
/// switch is actually needed: right before a write, or when the person
/// taps the wrong-network badge. Never from a background sync.
async function ensureAppKitChain() {
  if (!(WagmiCoreRef && wagmiConfigRef)) return;
  const account = WagmiCoreRef.getAccount(wagmiConfigRef);
  if (!account.isConnected) {
    // Session lives only in AppKit's store (see syncFromWagmi) — let AppKit
    // do the switch itself.
    if (appKitModal && typeof appKitModal.switchNetwork === "function" && appKitNetwork && Number(state.chainId) !== CONFIG.CHAIN_ID_DECIMAL) {
      await appKitModal.switchNetwork(appKitNetwork);
      state.chainId = CONFIG.CHAIN_ID_DECIMAL;
      if (typeof updateNetworkBadge === "function") updateNetworkBadge();
    }
    return;
  }
  if (account.chainId === CONFIG.CHAIN_ID_DECIMAL) return;
  const addParams = {
    chainId: CONFIG.CHAIN_ID_HEX,
    chainName: CONFIG.CHAIN_NAME,
    rpcUrls: [CONFIG.RPC_URL],
    blockExplorerUrls: [CONFIG.BLOCK_EXPLORER],
    nativeCurrency: CONFIG.NATIVE_CURRENCY,
  };
  try {
    await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CONFIG.CHAIN_ID_DECIMAL, addEthereumChainParameter: addParams });
  } catch (err) {
    // Some connectors won't auto-add. Ask the wallet directly through the
    // connector's own provider (works for WalletConnect too), then retry.
    try {
      const provider = account.connector && typeof account.connector.getProvider === "function"
        ? await account.connector.getProvider()
        : (await WagmiCoreRef.getConnectorClient(wagmiConfigRef)).transport;
      await provider.request({ method: "wallet_addEthereumChain", params: [addParams] });
      await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CONFIG.CHAIN_ID_DECIMAL });
    } catch (err2) {
      const e = new Error(
        `Your wallet needs to be on ${CONFIG.CHAIN_NAME}. If it didn't prompt you, open the wallet app and approve the network there — or add it manually: ` +
        `name ${CONFIG.CHAIN_NAME}, chain ID ${CONFIG.CHAIN_ID_DECIMAL}, RPC ${CONFIG.RPC_URL}, symbol ${(CONFIG.NATIVE_CURRENCY && CONFIG.NATIVE_CURRENCY.symbol) || "ETH"}, explorer ${CONFIG.BLOCK_EXPLORER}.`
      );
      e.cause = err2; throw e;
    }
  }
  state.chainId = CONFIG.CHAIN_ID_DECIMAL;
  await syncFromWagmi().catch(() => {}); // fresh signer on the new chain
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
}

/// On a phone connected through WalletConnect, a switch/approve request is
/// only visible inside the wallet app. Bring it to the front using the
/// deep link the wallet published in its own session metadata. Must run
/// synchronously inside a tap handler, or the browser blocks the jump.
function openConnectedWalletApp() {
  try {
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return false;
    const p = state.walletProvider;
    const meta = p && p.session && p.session.peer && p.session.peer.metadata;
    const link = meta && meta.redirect && (meta.redirect.native || meta.redirect.universal);
    if (!link) return false;
    window.location.href = link;
    return true;
  } catch { return false; }
}

/// Sends a contract write DIRECTLY through wagmi's own writeContract
/// action when AppKit is the active connection, instead of routing it
/// through ethers.Contract + ethers.BrowserProvider. That extra ethers-side
/// wrapper does its own internal verification calls (chainId, account)
/// against whatever it's wrapping, and those calls have not survived being
/// layered on top of a WalletConnect-relayed session no matter what
/// transaction fields were pre-supplied ("could not coalesce error",
/// persistent across multiple attempts to fix it from the ethers side).
/// Wagmi's own write path talks to that same session the way it was
/// actually built to be talked to — no extra wrapper in between.
///
/// Returns an ethers-compatible tx handle ({ hash, wait() }) so the rest of
/// the app's code doesn't need to change at all. Returns null if this path
/// isn't available (AppKit not connected, or this CDN build doesn't
/// export writeContract), so the caller falls back to the ethers.Contract
/// approach instead.
async function tryWagmiWrite({ address, abi, functionName, args, value }) {
  if (!(appKitReady && WagmiCoreRef && wagmiConfigRef && typeof WagmiCoreRef.writeContract === "function")) {
    return null;
  }
  await ensureAppKitChain();
  const hash = await WagmiCoreRef.writeContract(wagmiConfigRef, {
    address,
    abi,
    functionName,
    args,
    value,
    // Pinned: if the wallet somehow isn't on 4663 at this point, wagmi
    // throws instead of broadcasting the call on whatever chain it's on.
    chainId: CONFIG.CHAIN_ID_DECIMAL,
  });
  return {
    hash,
    // Waiting for confirmation only needs a plain read-only RPC connection
    // — it doesn't need to go anywhere near the wallet's own connection,
    // so this uses app.js's shared readProvider() instead of anything
    // wagmi/AppKit-related.
    wait: async () => readProvider().waitForTransaction(hash),
  };
}

initAppKit();
;
/* ---- circlepad-boot.js ---- */
/* global CONFIG */
// circlepad-boot.js — which CirclePad round /circle runs, decided before any other CirclePad script reads
// CONFIG. Round #1 is config-arc.js's escrow. Later rounds come from /api/social?circle=boot (a small
// <script> in circlepad.html's <head> that sets window.CP_ROUNDS from api/_rounds.mjs): the newest round
// that the round wallet has prepared (deployed — started or not yet) becomes the page's round: before start() it
// shows in its pre-start state (the round wallet's Start button on Home), after it runs like any round. Its raise, leaderboard, position and split work exactly like
// Round #1's (same BigPadEscrow contract); its governance comes from CONFIG.CIRCLEPAD_GOV[n]: its own vote contracts,
// or mode "direct" (no contracts — signed candidates, coded burns to 0x…dEaD), or "opens soon" until one is set. The Q&A room stays Round #1's (CIRCLEPAD_COMMUNITY_ESCROW).
// Right after the round wallet starts a round, circlepad-rounds.js leaves a short-lived note in
// localStorage so this page switches at once, before the cached boot script catches up.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS) return;
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  CONFIG.CIRCLEPAD_ROUND1_ESCROW = CONFIG.CIRCLEPAD_ESCROW_ADDRESS;
  CONFIG.CIRCLEPAD_COMMUNITY_ESCROW = CONFIG.CIRCLEPAD_ESCROW_ADDRESS;
  CONFIG.CIRCLEPAD_ROUND = 1;
  const list = (window.CP_ROUNDS && Array.isArray(window.CP_ROUNDS.list) ? window.CP_ROUNDS.list : []).filter((r) => r && r.n > 1 && isAddr(r.escrow));
  let cur = list.slice().sort((a, b) => b.n - a.n)[0] || null;
  try {
    const o = JSON.parse(localStorage.getItem("circlepad.round.just-started") || "null");
    if (o && isAddr(o.escrow) && o.n > 1 && Date.now() - o.at < 10 * 60e3 && (!cur || o.n > cur.n)) cur = { n: o.n, escrow: o.escrow, started: !!o.started };
    else if (o && Date.now() - o.at >= 10 * 60e3) localStorage.removeItem("circlepad.round.just-started");
  } catch (e) { /* storage blocked: the boot script alone decides */ }
  if (cur) {
    const G = (CONFIG.CIRCLEPAD_GOV && CONFIG.CIRCLEPAD_GOV[cur.n]) || {};
    // direct: no vote contracts — signed candidates and coded burns to 0x…dEaD (circlepad.js govDirect)
    // plan: the round launches no new coin, so there's no vote on the page — circlepad-plan.js shows what the raise does
    const plan = G.mode === "plan" && G.plan ? G.plan : null;
    const direct = G.mode === "direct";
    const chain = direct && Array.isArray(G.chain) && G.chain.length ? G.chain.join(" / ") : "";
    const voteOn = direct || (isAddr(G.vote) && isAddr(G.burnvote));
    CONFIG.CIRCLEPAD_ESCROW_ADDRESS = cur.escrow;
    CONFIG.CIRCLEPAD_ROUND = cur.n;
    CONFIG.CIRCLEPAD_ROUND_GOV = { ...G, voteOn, ballotOn: direct || isAddr(G.vote) };
    CONFIG.CIRCLEPAD_GOV_DIRECT = direct;
    CONFIG.CIRCLEPAD_ROUND_PLAN = plan;
    // the round's own ballot (the ideas board and candidates) and burn-to-vote, once they're deployed
    CONFIG.CIRCLEPAD_VOTE_ADDRESS = !direct && isAddr(G.vote) ? G.vote : "";
    CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS = !direct && voteOn ? G.burnvote : "";
    CONFIG.CIRCLEPAD_VOTE_MODE = voteOn ? "burn" : "";
    CONFIG.CIRCLEPAD_EXTRA_CANDIDATES = {};
    CONFIG.CIRCLEPAD_OPENS_AT = 0;
    CONFIG.CIRCLEPAD_ESCROW_VERIFIED = false;
    CONFIG.CIRCLEPAD_ALLOCATION_NOTE = "";
    CONFIG.CIRCLEPAD_NEXT = [
      voteOn
        ? direct
          ? { id: "vote", title: "Burn-to-vote, as in Round #1", body: chain ? "Until the raise closes. The team published Round #3's candidates — five per category, with Round #2's $TIE picks among them — plus the launch chain: Arc, Robinhood Chain or Solana. Anyone holding $ARCIRCLE burn-to-votes on them — every vote burns 1,000 $ARCIRCLE straight to 0x…dEaD. No new contract: the votes are counted from those burns on Arc." : "Until the raise closes. First a free pre-vote: anyone suggests ideas and votes on them with a wallet signature. The round wallet picks the candidates from the top, then anyone holding $ARCIRCLE burn-to-votes on name, ticker, logo, roadmap and launch date — every vote burns 1,000 $ARCIRCLE straight to 0x…dEaD. No new contract: the votes are counted from those burns on Arc.", status: "policy" }
          : { id: "vote", title: "Burn-to-vote", body: "Until the raise closes. Anyone holding $ARCIRCLE votes on name, ticker, logo, roadmap and launch date; every vote burns 1,000 $ARCIRCLE.", status: "set" }
        : { id: "vote", title: "Governance, as in Round #1", body: "First the community suggests ideas, then the round wallet publishes the candidates and $ARCIRCLE holders burn-to-vote on name, ticker, logo, roadmap and launch date until the raise closes. Opens soon.", status: "policy" },
      { id: "close", title: "The raise closes", body: "Contributions, withdrawals and voting stop. The escrow splits everything: 80% recipient, 15% treasury, 5% platform.", status: "set" },
      G.top === true ? { id: "top", title: "Top contributor paid", body: "The largest contributor at the close receives the 15%, over 3 days, sent by the team from the treasury wallet — as in Round #1.", status: "policy" }
        : { id: "top", title: "Top contributor", body: "Whether the largest contributor receives the 15% as in Round #1: not decided yet.", status: "open" },
      chain
        ? { id: "launch", title: "The coin launches", body: "On the launch date and the chain the vote picks (Arc, Robinhood Chain or Solana), with the name, ticker and logo the vote picks.", status: "policy" }
        : { id: "launch", title: "The coin launches", body: "On the launch date the vote picks, with the name, ticker and logo the vote picks. Where and how it launches: not decided yet.", status: "open" },
      { id: "airdrop", title: "Contributor airdrop", body: G.airdrop || "Not decided yet.", status: G.airdrop ? "policy" : "open" },
    ];
    if (plan) {
      const b = plan.buy || {}, a = plan.also || {};
      CONFIG.CIRCLEPAD_ALLOCATION_NOTE = G.airdrop || "";
      CONFIG.CIRCLEPAD_NEXT = [
        { id: "vote", title: "No vote this round", body: `Round #${cur.n} launches no new coin, so its burn-to-vote closed on 4 Oct 2026. The votes cast before stay on record, and their $ARCIRCLE stays burned.`, status: "policy" },
        { id: "close", title: "The raise closes", body: "Contributions and withdrawals stop. The escrow splits everything: 80% recipient, 15% treasury, 5% platform.", status: "set" },
        G.top === true ? { id: "top", title: "Top contributor paid", body: "The largest contributor at the close receives the 15%, over 3 days, sent by the team from the treasury wallet — as in Round #1.", status: "policy" }
          : { id: "top", title: "Top contributor", body: "Whether the largest contributor receives the 15% as in Round #1: not decided yet.", status: "open" },
        { id: "launch", title: `$${b.sym || "ARCIA"} is bought`, body: `After the split, the round wallet buys $${b.sym || "ARCIA"} on ${b.chain || "Robinhood Chain"} with the raise — ARCIA's own coin, the flagship of the ARCIRCLE NFT ecosystem.`, status: "policy" },
        { id: "airdrop", title: a.snapshot ? "Snapshot airdrop" : "Two allocations", body: G.airdrop || "", status: "policy" },
        a.merged
          ? { id: "r4", title: `Round #${a.round || cur.n + 1} on ${a.chain || "Solana"} — merged in`, body: `Round #${a.round || cur.n + 1} is ARCIRCLE's move to ${a.chain || "Solana"} through ${a.via || "pump.fun"}. It has no 3-day raise of its own: the ARCIRCLE team runs it on ${a.chain || "Solana"} with ${a.with || "ARCIRCLE Orders"}, and everyone in Round #${cur.n} is in it automatically, by their share.`, status: "policy" }
          : { id: "r4", title: `Round #${a.round || cur.n + 1} on ${a.chain || "Solana"}`, body: `Round #${a.round || cur.n + 1}'s token launches on ${a.chain || "Solana"} — not revealed yet. Round #${cur.n}'s contributors get an allocation of it by their share, new contributors included.`, status: "policy" },
      ];
    }
    document.documentElement.setAttribute("data-cp-round", String(cur.n));
    if (plan) document.documentElement.setAttribute("data-cp-plan", "1");
  }
  // "Round #1" in page copy → this round's number (English "#1", Chinese "第 1 轮")
  window.cpRN = () => CONFIG.CIRCLEPAD_ROUND || 1;
  window.cpRT = function (s) {
    const t = (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
    const n = window.cpRN();
    return n === 1 ? t : String(t).replace(/#1(?!\d)/g, "#" + n).replace(/第 1 轮/g, "第 " + n + " 轮");
  };
})();
;
/* ---- circlepad-plan.js ---- */
/* global CONFIG, state */
// circlepad-plan.js — a CirclePad round that launches no new coin (CONFIG.CIRCLEPAD_ROUND_PLAN, set by circlepad-boot.js
// from CONFIG.CIRCLEPAD_GOV[n].plan). Round #3 (4 Oct 2026): the raise buys $ARCIA on Robinhood Chain for its
// contributors, and they also get an allocation of Round #4's Solana token ($TBA). The other CirclePad scripts ask this
// one for their copy when a plan is set:
//   cpPlan.copy()        the featured card (title, tags, description) and the Governance tab's note
//   cpPlan.steps(set)    the launch-process timeline on Home
//   cpPlan.hero(ph, r)   the Home hero: two allocations, your share, the closed vote's record
//   cpPlan.coin()        what Projects' live-round card shows instead of a vote's winner
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ROUND_PLAN) return;
  const P = CONFIG.CIRCLEPAD_ROUND_PLAN, B = P.buy || {}, A = P.also || {};
  const N = () => Number(CONFIG.CIRCLEPAD_ROUND || 1);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const lc = (a) => String(a || "").toLowerCase();
  const SYM = "$" + (B.sym || "ARCIA"), NEXT = "$" + (A.sym || "TBA"), R4 = A.round || N() + 1;
  // 5 Oct 2026: Round #4 merged into this round — no raise of its own; the team runs it on Solana (pump.fun) with ARCIRCLE Orders
  const MERGED = !!A.merged, VIA = A.via || "pump.fun", WITH = A.with || "ARCIRCLE Orders";
  // 6 Oct 2026: both rewards go out as a snapshot airdrop, with more updates to follow
  const SNAP = !!A.snapshot;
  const num = (n, d = 0) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  let votes = null; // the closed vote's record (/api/social?circle=burns&round=n)

  async function loadVotes() {
    try {
      const r = await fetch(`/api/social?circle=burns&round=${N()}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && j.totals) { votes = { votes: Number(j.totals.votes || 0), voters: Number(j.totals.voters || 0), burned: Number(BigInt(j.totals.burned || "0") / 10n ** 18n) }; document.dispatchEvent(new CustomEvent("circlepad:state")); }
    } catch { /* the line just leaves the numbers out */ }
  }

  function copy() {
    const h2 = document.querySelector("#bp-featured .bp-featured-info h2");
    if (h2) {
      const tk = h2.querySelector(".bp-ticker");
      if (tk) { tk.setAttribute("data-no-i18n", ""); tk.textContent = `${SYM} + ${NEXT}`; }
    }
    const tags = document.querySelector("#bp-featured .bp-tags");
    if (tags && !tags.dataset.plan) { tags.dataset.plan = "1"; tags.innerHTML = ["Team-led", "USDC raise", B.chain || "Robinhood Chain", A.chain || "Solana"].map((t) => `<span>${T(t)}</span>`).join(""); }
    const desc = document.getElementById("bp-featured-desc");
    if (desc) desc.textContent = MERGED
      ? tr(`USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72 hours are up. Round #${N()} and Round #${R4} are merged: the raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, and Round #${R4} — ARCIRCLE's move to ${A.chain || "Solana"} through ${VIA} — is run by the ARCIRCLE team with ${WITH}, with no separate raise. Everyone in Round #${N()} is in Round #${R4} automatically; both rewards go by your share of the raise.`)
      : tr(`USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72 hours are up. Round #${N()} launches no new coin: the raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, and every contributor also gets an allocation of Round #${R4}'s token on ${A.chain || "Solana"} — both by their share of the raise.`);
    const gn = document.getElementById("bp-gov-note");
    if (gn) gn.textContent = tr(`No vote this round — Round #${N()} buys ${SYM} instead of launching a new coin.`);
    const pn = document.getElementById("bp-gov-panel-note");
    if (pn) {
      pn.innerHTML = `<b>${T(`Round #${N()}'s vote is closed.`)}</b> ${T(`It launches no new coin: the raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, and contributors also get an allocation of Round #${R4}'s token on ${A.chain || "Solana"}. The votes cast before 4 Oct 2026 stay on record, and their $ARCIRCLE stays burned.`)}${votes && votes.votes ? ` <span class="cp-plan-rec" data-no-i18n>${num(votes.votes)} ${esc(tr(votes.votes === 1 ? "vote" : "votes"))} · ${num(votes.burned)} $ARCIRCLE ${esc(tr("burned"))}</span>` : ""}`;
      pn.classList.add("cp-plan-note");
    }
  }

  function steps(set) {
    const tl = document.getElementById("cp-timeline");
    if (tl) tl.querySelectorAll(".bp-steps > li").forEach((li, i) => { const w = li.querySelector(".bp-step-when"); const t = i === 1 ? "Closed 4 Oct" : i === 4 ? (SNAP ? "Snapshot airdrop" : "After the split") : ""; if (w && t) w.textContent = tr(t); });
    set(2, "", "Contributions and withdrawals stop. The escrow sends 80% to the recipient, 15% to the treasury, 5% to the platform.");
    set(1, "No vote this round", `Round #${N()} launches no new coin, so there's nothing to vote on. Its burn-to-vote closed on 4 Oct 2026; the votes cast before stay on record.`);
    set(3, "", CONFIG.CIRCLEPAD_ROUND_GOV && CONFIG.CIRCLEPAD_ROUND_GOV.top === true ? "The largest contributor at the close receives the 15%, over 3 days." : "Whether the top contributor receives the 15% this round: not decided yet.");
    set(4, `${SYM} + Round #${R4}`, SNAP ? `Both rewards go out as a snapshot airdrop to the contributor list, by share of the raise: ${SYM} on ${B.chain || "Robinhood Chain"} and the Round #${R4} share on ${A.chain || "Solana"}. More updates to follow.` : MERGED ? `The raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, sent to contributors by their share. Round #${R4} on ${A.chain || "Solana"} — through ${VIA}, run by the team with ${WITH} — is shared the same way.` : `The raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, sent to contributors by their share. Round #${R4}'s token on ${A.chain || "Solana"} follows, shared the same way.`);
  }

  // your share of the raise, from the leaderboard (circlepad.js)
  function mine() {
    const me = typeof state !== "undefined" && state.account ? lc(state.account) : "";
    const rows = window.circlepadLbRows || [];
    if (!me || !rows.length) return null;
    const total = rows.reduce((s, r) => s + BigInt(r.amount || 0), 0n);
    const r = rows.find((x) => lc(x.address) === me);
    if (!r || total <= 0n) return { in: false };
    return { in: true, pct: Number((BigInt(r.amount) * 1000000n) / total) / 1e4, usdc: Number(BigInt(r.amount) / 10n ** 14n) / 1e4 };
  }

  function hero(ph, r) {
    if (!r || !r.started) return "";
    const open = !!r.isOpen, dl = Number(r.deadline || 0), m = mine();
    const you = m && m.in
      ? `<div class="cp-plan-you"><small>${T("Your share of the raise")}</small><b data-no-i18n>${num(m.pct, m.pct < 1 ? 3 : 2)}%</b><span>${T(`of the ${SYM} bought and of Round #${R4}'s allocation`)}</span></div>`
      : open ? `<div class="cp-plan-you"><small>${T("Your share of the raise")}</small><b data-no-i18n>—</b><span>${T(MERGED ? `Contribute any amount to be in both — you join Round #${R4} automatically.` : "Contribute any amount to be in both.")}</span></div>` : "";
    const rec = votes && votes.votes ? `<p class="cp-plan-vote"><i aria-hidden="true"></i>${T("Burn-to-vote closed on 4 Oct 2026")} · <span data-no-i18n>${num(votes.votes)}</span> ${T(votes.votes === 1 ? "vote" : "votes")} · <span data-no-i18n>${num(votes.burned)} $ARCIRCLE</span> ${T("burned, on record")}</p>` : "";
    return `<div class="cp-phero-copy">
        ${MERGED ? `<div class="cp-merge" aria-hidden="true"><svg viewBox="0 0 220 84"><defs><linearGradient id="cpMg" x1="0" x2="1"><stop offset="0" stop-color="#ff8bd8"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><circle class="cp-merge-a" cx="70" cy="42" r="30"/><circle class="cp-merge-b" cx="150" cy="42" r="30"/><circle class="cp-merge-c" cx="110" cy="42" r="30"/><text class="cp-merge-ta" x="70" y="47">#${esc(N())}</text><text class="cp-merge-tb" x="150" y="47">#${esc(R4)}</text><text class="cp-merge-tc" x="110" y="47">#${esc(N())}+${esc(R4)}</text></svg></div>` : ""}
        <span class="cp-phero-eyebrow">${MERGED ? T(`Round #${N()} + Round #${R4} · ${open ? "merged" : "raise closed"}`) : T(`Round #${N()} · ${open ? "the plan changed" : "raise closed"}`)}</span>
        <h2>${T(MERGED ? "Two rounds in one. Robinhood Chain and Solana." : "One round. Two chains. Two allocations.")}</h2>
        <p class="cp-phero-lede">${MERGED
          ? T(`Round #${R4} is merged into Round #${N()}. Round #${R4} is ARCIRCLE's move to ${A.chain || "Solana"} through ${VIA}: no separate 3-day raise — the ARCIRCLE team runs it on ${A.chain || "Solana"} with ${WITH}, and everyone in Round #${N()} is in it automatically. The raise buys ${SYM} on ${B.chain || "Robinhood Chain"}; both rewards go by your share, new contributors included.`)
          : T(`Round #${N()} launches no new coin. The raise buys ${SYM} — ARCIA's own coin on ${B.chain || "Robinhood Chain"} — and every contributor also gets an allocation of Round #${R4}'s token on ${A.chain || "Solana"}. Both by your share of the raise, new contributors included.`)}</p>
        <div class="cp-phero-cta">${open ? `<button type="button" class="bp-btn-primary" data-cp-plan="contribute">${T("Contribute USDC")}</button>` : ""}${B.url ? `<a class="bp-btn-ghost" href="${esc(B.url)}" target="_blank" rel="noopener">${esc(SYM)} ${T("on Pons")} ↗</a>` : ""}${open && dl ? `<span class="cp-phero-clock"><small>${T("Raise closes in")}</small><b data-no-i18n data-cp-to="${dl}">…</b></span>` : ""}</div>
        ${SNAP ? `<p class="cp-plan-snap"><i aria-hidden="true"></i><span><b>${T("Snapshot airdrop")}</b> ${T(`Round #${N()} and Round #${R4}'s rewards go out as a snapshot airdrop to the contributor list, by share of the raise. More updates to follow.`)}</span></p>` : ""}
        ${rec}
      </div>
      <div class="cp-phero-side cp-plan-side">
        <div class="cp-plan-pair">
          <div class="cp-plan-card rh"><span class="cp-plan-chain"><i></i>${T(B.chain || "Robinhood Chain")}</span><b data-no-i18n>${esc(SYM)}</b><span>${T("Bought with the raise · ARCIA's own coin, the flagship of the ARCIRCLE NFT ecosystem")}</span>${B.token ? `<button type="button" class="cp-plan-ca" data-cp-copy="${esc(B.token)}" title="${T("Copy address")}" data-no-i18n>${short(B.token)}</button>` : ""}</div>
          <span class="cp-plan-plus" aria-hidden="true">+</span>
          <div class="cp-plan-card sol"><span class="cp-plan-chain"><i></i>${T(`${A.chain || "Solana"} · Round #${R4}`)}</span><b data-no-i18n>${esc(MERGED ? VIA : NEXT)}</b><span>${T(MERGED ? `ARCIRCLE's move to ${A.chain || "Solana"}, run by the team with ${WITH}. You're in automatically, by the same share.` : `Round #${R4}'s token — not revealed yet. Allocated by the same share.`)}</span></div>
        </div>
        ${MERGED ? `<p class="cp-plan-merge"><b>${T("Why merged:")}</b> ${T(`ARCIRCLE built a new contract on ${A.chain || "Solana"} for ${WITH} — on ${A.chain || "Solana"} that costs over about $1,000 — so the team is putting its focus there and taking ARCIRCLE to ${A.chain || "Solana"} together with this round.`)}</p>` : ""}
        ${you}
        ${delivery(r)}
      </div>`;
  }

  // v8: the delivery board — after the close, each step the team takes, with its transactions (CONFIG.CIRCLEPAD_DELIVERY)
  const EXPL = { rh: "https://robinhoodchain.blockscout.com/tx/", sol: "https://solscan.io/tx/", arc: "https://arc.etherscan.io/tx/" };
  function delivery(r) {
    const D = (CONFIG.CIRCLEPAD_DELIVERY || {})[N()] || {};
    const closed = r && r.started && Math.floor(Date.now() / 1000) >= Number(r.deadline || 0);
    const rows = SNAP ? [
      ["close", closed ? "done" : "now", "The raise closes", closed ? "Closed — the split goes out from the escrow" : "Contributions are still open"],
      ["snap", D.snap && D.snap.status, "Snapshot of the contributors", "Everyone in the raise, by share — Round #2's list included"],
      ["drop", D.drop && D.drop.status, "Snapshot airdrop", `${SYM} on ${B.chain || "Robinhood Chain"} and your Round #${R4} share`],
      ["more", D.more && D.more.status, "More updates to follow", `Round #${R4} on ${A.chain || "Solana"}, through ${VIA} with ${WITH}`],
    ] : [
      ["close", closed ? "done" : "now", "The raise closes", closed ? "Closed — the split goes out from the escrow" : "Contributions are still open"],
      ["buy", D.buy && D.buy.status, `${SYM} is bought on ${B.chain || "Robinhood Chain"}`, "With the raise, after the split"],
      ["send", D.send && D.send.status, `${SYM} goes to every contributor`, "By your share of the raise"],
      ...(MERGED ? [["r4", D.r4 && D.r4.status, `Round #${R4} on ${A.chain || "Solana"}`, `Through ${VIA}, run by the team with ${WITH}`], ["r4send", D.r4send && D.r4send.status, `Round #${R4}'s share goes out`, "By the same share"]] : []),
    ];
    const txs = (k) => ((D[k] && D[k].txs) || []).filter((x) => x && x.hash).map((x) => `<a href="${esc((EXPL[x.chain] || EXPL.rh) + x.hash)}" target="_blank" rel="noopener" data-no-i18n>${esc(x.label || `${x.hash.slice(0, 8)}…`)} ↗</a>`).join("");
    const rowsHtml = rows.map(([k, st, t, sub], i) => `<li class="${st === "done" ? "done" : st === "now" ? "now" : ""}" data-dl="${esc(N() + ":" + k)}" data-dl-st="${esc(st || "")}"><i>${st === "done" ? "✓" : i + 1}</i><div><b>${T(t)}</b><small>${T(sub)}</small>${txs(k) ? `<span class="cp-dl-tx">${txs(k)}</span>` : ""}</div><em>${T(st === "done" ? "Done" : st === "now" ? "In progress" : "Waiting")}</em></li>`).join("");
    const n = (window.circlepadLbRows || []).length;
    return `<div class="cp-dl"><div class="cp-dl-h"><b>${T("Delivery board")}</b>${n ? `<small data-no-i18n>${esc(n)} ${esc(tr(n === 1 ? "contributor" : "contributors"))}</small>` : ""}</div><ol>${rowsHtml}</ol></div>`;
  }

  const coin = () => ({ name: `${SYM} + Round #${R4}`, ticker: `${B.sym || "ARCIA"} · ${NEXT}`, logo: "", date: null, road: "", any: true });

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cp-plan]");
    if (!b) return;
    if (b.dataset.cpPlan === "contribute") {
      const el = document.getElementById("bp-contribute-amount") || document.getElementById("bp-contribute-btn");
      const box = el && (el.closest(".bp-featured-side, .bp-contribute, .bp-card") || el);
      if (box) box.scrollIntoView({ behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      if (el && el.offsetParent && el.tagName === "INPUT") setTimeout(() => el.focus({ preventScroll: true }), 450);
    }
  });
  document.addEventListener("arc:lang", copy);
  window.cpPlan = { copy, steps, hero, coin };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { copy(); loadVotes(); });
  else { copy(); loadVotes(); }
})();
;
/* ---- circlepad.js ---- */
// circlepad.js — CirclePad dashboard interactivity. Still no live contract call
// anywhere in this file: the fund-pooling/auction/vote/vesting mechanism
// is a design, not a deployed contract (see the Docs > Safety design tab),
// so every number that would come from a real round is left as "—" in
// the markup rather than invented here.

(() => {
  // ---- Main sidebar tabs (Home / Projects / Governance / ...) ----
  const navItems = document.querySelectorAll(".bp-nav-item[data-tab]");
  const panels = document.querySelectorAll(".bp-panel");
  const sidebar = document.getElementById("bp-sidebar");
  const mobileMenuLabel = document.getElementById("bp-mobile-menu-label");

  function showTab(tab) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.id === `bp-panel-${tab}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (mobileMenuLabel) {
      const activeBtn = [...navItems].find((b) => b.dataset.tab === tab);
      if (activeBtn) {
        mobileMenuLabel.textContent = activeBtn.textContent.trim();
        // the tab's icon next to its name, as on ArcPad
        const ico = document.getElementById("bp-mm-ico"), svg = activeBtn.querySelector("svg");
        if (ico) ico.innerHTML = svg ? svg.outerHTML : "";
      }
      fitMobileMenu();
    }
    if (sidebar) sidebar.classList.remove("bp-menu-open");
  }
  // phones: the tab name gets the room the wallet and the buttons leave; when it wouldn't fit only
  // the tab's icon shows (the same as ArcPad)
  function fitMobileMenu() {
    const trig = document.getElementById("bp-mobile-menu-trigger"), right = document.querySelector(".bp-topbar-right");
    if (!trig || !mobileMenuLabel) return;
    if (innerWidth > 900) { trig.classList.remove("icon-only"); trig.style.maxWidth = ""; return; }
    const room = innerWidth - (right ? right.getBoundingClientRect().width : 0) - 36;
    trig.style.maxWidth = Math.max(56, room) + "px";
    trig.classList.remove("icon-only");
    if (mobileMenuLabel.scrollWidth > mobileMenuLabel.clientWidth + 1) trig.classList.add("icon-only");
  }
  window.addEventListener("resize", () => requestAnimationFrame(fitMobileMenu));
  if ("ResizeObserver" in window) { const r = document.querySelector(".bp-topbar-right"); if (r) new ResizeObserver(() => requestAnimationFrame(fitMobileMenu)).observe(r); }
  document.addEventListener("arc:lang", () => setTimeout(fitMobileMenu, 50));
  setTimeout(fitMobileMenu, 0);

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  // ---- Mobile-only dropdown: the sidebar nav is hidden by default on
  // narrow screens (see the max-width:900px block in style.css) and
  // opens as a dropdown from this trigger instead of the old horizontal
  // scroller. Desktop never shows the trigger, so the full vertical
  // sidebar there is untouched by any of this.
  const menuTrigger = document.getElementById("bp-mobile-menu-trigger");
  if (menuTrigger && sidebar) {
    menuTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("bp-menu-open");
    });
    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("bp-menu-open") && !sidebar.contains(e.target)) {
        sidebar.classList.remove("bp-menu-open");
      }
    });
  }

  // Small "Learn more →" / "How it works" links inside cards jump to
  // another sidebar tab, same as clicking the sidebar item itself.
  document.querySelectorAll("[data-tab-link]").forEach((el) => {
    el.addEventListener("click", () => showTab(el.dataset.tabLink));
  });

  // Hero's "See the preview" button scrolls to the preview round card
  // instead of switching tabs — it's already on the Home panel.
  const seePreviewBtn = document.getElementById("bp-see-preview");
  const featured = document.getElementById("bp-featured");
  if (seePreviewBtn && featured) {
    seePreviewBtn.addEventListener("click", () => {
      featured.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ---- Docs sub-tabs (How it works / Economics / Safety / FAQ) ----
  const docTabs = document.querySelectorAll(".bp-doc-tab");
  const docPanels = document.querySelectorAll(".bp-doc-panel");
  docTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      docTabs.forEach((b) => b.classList.toggle("active", b === btn));
      docPanels.forEach((p) => p.classList.toggle("active", p.id === `bp-doc-${btn.dataset.doc}`));
    });
  });

  // Chain pill: pull the real chain name from config.js so this label
  // can't silently drift out of sync with the rest of the site.
  const chainNameEl = document.getElementById("bp-chain-name");
  if (chainNameEl && typeof CONFIG !== "undefined" && CONFIG.CHAIN_NAME) {
    chainNameEl.textContent = CONFIG.CHAIN_NAME;
  }

  // Deep links: circlepad.html#governance / #docs etc. open that tab.
  const openTabFromHash = () => {
    const tab = (location.hash || "").replace(/^#\/?/, "");
    if (tab && document.getElementById(`bp-panel-${tab}`)) showTab(tab);
  };
  openTabFromHash();
  window.addEventListener("hashchange", openTabFromHash);

  // Docs → Contracts: addresses straight from config-arc.js (see
  // renderContractRows in arc-shared.js). The vote contract deploys only
  // after start() is called, so it's expected to read "not deployed yet"
  // until then.
  const contractsEl = document.getElementById("cp-contracts");
  if (contractsEl && typeof renderContractRows === "function") {
    contractsEl.innerHTML = renderContractRows([
      [`BigPadEscrow (CirclePad round #${CONFIG.CIRCLEPAD_ROUND || 1})`, CONFIG.CIRCLEPAD_ESCROW_ADDRESS, "Holds the 72h USDC raise; withdraw any time before close; 80/5/15 split at close"],
      ...(CONFIG.CIRCLEPAD_GOV_DIRECT === true ? [
        ["$ARCIRCLE (burn-to-vote)", CONFIG.ARCIRCLE_TOKEN, "No vote contract this round: a vote is a transfer to 0x…dEaD, 1,000 $ARCIRCLE per vote, the choice coded in the amount's last 12 decimals"],
      ] : [
        ["BigPadVote (candidates)", CONFIG.CIRCLEPAD_VOTE_ADDRESS, "The round's name / ticker / logo / roadmap / launch-date candidates"],
        ["ArcircleBurnVote (voting)", CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS, "1 vote = 1,000 $ARCIRCLE sent to 0x…dEaD; open to every holder; no owner"],
      ]),
    ]);
  }
})();

// ---- In-page messages instead of the browser's alert()/confirm() ----
// cpToast(text, kind) shows a short note; cpConfirm({ title, body, ok })
// resolves true/false from a small modal (arc-a11y.js gives it focus
// handling and Escape). cpErrText(err) turns a revert or wallet error into
// a sentence.
function cpToast(msg, kind) {
  let host = document.getElementById("cp-toasts");
  if (!host) { host = document.createElement("div"); host.id = "cp-toasts"; host.className = "cp-toasts"; host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
  const t = document.createElement("div");
  t.className = "cp-toast" + (kind ? " cp-toast-" + kind : "");
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, kind === "bad" ? 6000 : 3600);
}
if (typeof window.arcToast !== "function") window.arcToast = (m, k) => cpToast(m, k === "warn" ? "bad" : k);
function cpConfirm({ title, body, ok = "Continue", cancel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "cm-modal cp-confirm";
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    m.innerHTML = `<div class="cm-backdrop" data-close></div><div class="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cp-cf-t">
      <div class="cm-dhead"><div><h2 id="cp-cf-t">${esc(title)}</h2><p>${esc(body)}</p></div>
      <button type="button" class="cm-x" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="cm-foot"><button type="button" class="cm-btn" data-close>${esc(cancel)}</button><button type="button" class="cm-btn cm-btn-primary${danger ? " cp-danger" : ""}" data-ok>${esc(ok)}</button></div></div>`;
    const done = (v) => { m.classList.remove("in"); setTimeout(() => m.remove(), 200); resolve(v); };
    m.addEventListener("click", (e) => { if (e.target.closest("[data-ok]")) done(true); else if (e.target.closest("[data-close]")) done(false); });
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add("in"));
  });
}
const CP_ERRORS = {
  NotStarted: "The raise hasn't started yet.",
  RaiseEnded: "The raise has already closed.",
  ZeroContribution: "Enter an amount above zero.",
  CapExceeded: "That would go over the round's cap — try a smaller amount.",
  ZeroRefundAmount: "Enter an amount above zero to withdraw.",
  InsufficientContribution: "That's more than you've put in.",
  AlreadyStarted: "The raise has already been started.",
  NotOpen: "The raise isn't open.",
  AlreadyDistributed: "The funds have already been split.",
  OwnableUnauthorizedAccount: "Only the round's recipient wallet can do that.",
};
function cpErrText(err, fallback = "Something went wrong — try again.") {
  if (!err) return fallback;
  if (err.code === "ACTION_REJECTED" || err.code === 4001 || /user (rejected|denied)|rejected the request/i.test(err.message || "")) return "Cancelled in your wallet.";
  if (err.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(err.message || "")) return "Not enough USDC in this wallet for the amount plus gas.";
  const name = (err.revert && err.revert.name) || (/reverted with custom error '(\w+)/.exec(err.message || "") || [])[1] || (/error="?(\w+)\(/.exec(err.message || "") || [])[1];
  if (name && CP_ERRORS[name]) return CP_ERRORS[name];
  for (const k of Object.keys(CP_ERRORS)) if ((err.message || "").includes(k) || (err.data && String(err.data).includes(k))) return CP_ERRORS[k];
  return err.reason || err.shortMessage || fallback;
}

// ---- CirclePad first-round escrow (contracts/CirclePadEscrow.sol) ----
// Everything below stays a no-op — the markup keeps showing its static
// "PREVIEW" state — until CONFIG.CIRCLEPAD_ESCROW_ADDRESS is filled in after
// a real deploy (testnet rehearsed first, always). No fabricated numbers
// ever appear before that. See contracts/CirclePadEscrow.sol for exactly
// what this contract does and does not enforce — it's a cap+deadline+
// escrow only, no on-chain voting/leader/vesting logic.

function circlepadEscrowConfigured() {
  return typeof CONFIG !== "undefined" && !!CONFIG.CIRCLEPAD_ESCROW_ADDRESS && CONFIG.CIRCLEPAD_ESCROW_ADDRESS.length === 42;
}
function circlepadEscrowRead() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_ESCROW_ADDRESS, CIRCLEPAD_ESCROW_ABI, readProvider());
}
function circlepadEscrowWrite() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_ESCROW_ADDRESS, CIRCLEPAD_ESCROW_ABI, state.signer);
}

let _circlepadState = null; // cached snapshot from the last fetchCirclepadState() call
let _circlepadDeadline = null; // cached unix seconds, null until started
let _circlepadStarted = false;
let _circlepadCountdownTimer = null;
let _circlepadPollTimer = null;

// A small Multicall3 handle just for getEthBalance — MULTICALL3_ADDRESS and
// multicallRead() itself come from app.js (shared top-level scope, same as
// readProvider/state/short elsewhere in this file).
function circlepadMcBalance() {
  return new ethers.Contract(MULTICALL3_ADDRESS, ["function getEthBalance(address) view returns (uint256)"], readProvider());
}

// ---- Stale-while-revalidate cache ----
// The first paint used to sit on the static "PREVIEW" markup until every
// RPC round trip finished — on a public node that's easily a couple of
// seconds of a live round looking like it isn't one. Now the last known
// state and leaderboard are kept in localStorage (keyed by the escrow
// address, so a future round at a new address starts clean) and applied
// synchronously on load, then the real fetch overwrites them as soon as
// it lands. BigInts are serialized as tagged strings since JSON can't
// carry them natively.
function circlepadCacheKey(kind) {
  // Governance state is keyed by the vote contract, everything else by
  // the escrow — so redeploying either one starts its own cache clean.
  const addr = kind === "gov" ? CONFIG.CIRCLEPAD_VOTE_ADDRESS : CONFIG.CIRCLEPAD_ESCROW_ADDRESS;
  return `circlepad.${kind}.${addr}`;
}
function circlepadSaveCache(kind, obj) {
  try {
    localStorage.setItem(circlepadCacheKey(kind), JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? { __big: v.toString() } : v)));
  } catch { /* private mode / quota — cache is best-effort only */ }
}
function circlepadLoadCache(kind) {
  try {
    const raw = localStorage.getItem(circlepadCacheKey(kind));
    if (!raw) return null;
    return JSON.parse(raw, (_k, v) => (v && typeof v === "object" && "__big" in v ? BigInt(v.__big) : v));
  } catch { return null; }
}

// Every poll used to be a dozen-plus separate eth_calls spread across five
// different refresh functions — several of them re-fetching the exact same
// field more than once per cycle (isOpen(), started(), recipient(),
// totalRaised() were each read 2-3x). This batches all of it into one
// Multicall3 round trip (falls back to one request per call if Multicall3
// isn't deployed on the chain — see multicallRead in app.js).
async function fetchCirclepadState() {
  if (!circlepadEscrowConfigured()) return null;
  const escrow = circlepadEscrowRead();
  const mcBal = circlepadMcBalance();

  const calls = [
    { contract: escrow, method: "cap" },
    { contract: escrow, method: "started" },
    { contract: escrow, method: "deadline" },
    { contract: escrow, method: "totalRaised" },
    { contract: escrow, method: "isOpen" },
    { contract: escrow, method: "recipient" },
    { contract: escrow, method: "distributed" },
    { contract: mcBal, method: "getEthBalance", args: [CONFIG.CIRCLEPAD_ESCROW_ADDRESS] },
  ];
  let meIdx = -1, myBalIdx = -1;
  if (state.account) {
    meIdx = calls.push({ contract: escrow, method: "contributions", args: [state.account] }) - 1;
    myBalIdx = calls.push({ contract: mcBal, method: "getEthBalance", args: [state.account] }) - 1;
  }

  // multicallRead resolves a failed individual call to null rather than
  // rejecting the whole batch (see app.js) — right for most pages, but
  // silently treating a failed started()/isOpen()/distributed() read as
  // false would be actively wrong: a transient RPC hiccup could make an
  // already-live round flash back to "not started". Retry the whole
  // batch a couple times if any of those three come back null before
  // falling back to the last known-good value (or false, only if this is
  // the very first load and there's nothing to fall back to).
  let r = await multicallRead(calls);
  for (let attempt = 0; attempt < 2 && (r[1] === null || r[4] === null || r[6] === null); attempt++) {
    await new Promise((res) => setTimeout(res, 400));
    r = await multicallRead(calls);
  }

  // Native balances come through Multicall3's getEthBalance; if that one
  // read fails, ask the node directly — the recipient's "Withdraw & split"
  // button depends on the escrow's balance, so it must never read as 0 by mistake.
  if (r[7] == null) r[7] = await readProvider().getBalance(CONFIG.CIRCLEPAD_ESCROW_ADDRESS).catch(() => null);
  if (myBalIdx >= 0 && r[myBalIdx] == null) r[myBalIdx] = await readProvider().getBalance(state.account).catch(() => null);

  const prev = _circlepadState || {};
  _circlepadState = {
    cap: r[0] ?? prev.cap ?? 0n,
    started: r[1] === null ? (prev.started ?? false) : !!r[1],
    deadline: r[2] ?? prev.deadline ?? 0n,
    totalRaised: r[3] ?? prev.totalRaised ?? 0n,
    isOpen: r[4] === null ? (prev.isOpen ?? false) : !!r[4],
    recipient: r[5] || prev.recipient || ethers.ZeroAddress,
    distributed: r[6] === null ? (prev.distributed ?? false) : !!r[6],
    balance: r[7] ?? prev.balance ?? 0n,
    myContribution: meIdx >= 0 ? (r[meIdx] ?? prev.myContribution ?? 0n) : 0n,
    myWalletBalance: myBalIdx >= 0 ? (r[myBalIdx] ?? prev.myWalletBalance ?? 0n) : null,
  };
  if (r[1] === null || r[4] === null || r[6] === null) {
    console.warn("CirclePad: started/isOpen/distributed still unreadable after retries — showing last known state.");
  } else {
    // Only the account-independent fields — a different wallet may load
    // this next time, and its own contribution/balance is fetched fresh.
    const { cap, started, deadline, totalRaised, isOpen, recipient, distributed, balance } = _circlepadState;
    circlepadSaveCache("state", { cap, started, deadline, totalRaised, isOpen, recipient, distributed, balance, savedAt: Date.now() });
  }
  return _circlepadState;
}

function fmtEth(wei, maxDecimals = 4) {
  const n = Number(ethers.formatEther(wei));
  return isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals }) : "—";
}

function timeAgo(unixSec) {
  if (!unixSec) return "";
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

// Single DOM-update pass from one fetchCirclepadState() snapshot — status/
// badge, progress bar, countdown, contribute/start/refund/withdraw
// buttons, wallet balance, and the My Position panel all come from the
// same batch instead of each re-querying the chain independently.
// `accountUnknown: true` (used when painting from the localStorage cache
// before the real fetch lands) skips everything that depends on the
// connected wallet, since the cache deliberately doesn't hold that.
function applyCirclepadState(s, { accountUnknown = false } = {}) {
  if (!s) return;
  _circlepadStarted = s.started;
  _circlepadDeadline = s.started ? Number(s.deadline) : null;
  const capUncapped = s.cap === 0n;
  const capReached = !capUncapped && s.totalRaised >= s.cap;
  const isRecipient = !!(state.account && s.recipient && state.account.toLowerCase() === s.recipient.toLowerCase());

  const statusEl = document.getElementById("bp-round-status");
  if (statusEl) {
    if (!s.started) statusEl.innerHTML = `<span class="bp-status-dot amber"></span>Not started — waiting on CirclePad`;
    else if (s.isOpen) statusEl.innerHTML = `<span class="bp-status-dot bp-live"></span>Live — raise open`;
    else if (s.distributed) statusEl.innerHTML = `<span class="bp-status-dot"></span>Closed — split 80/5/15 done`;
    else if (capReached) statusEl.innerHTML = `<span class="bp-status-dot bp-live"></span>Cap reached — raise closed`;
    else statusEl.innerHTML = `<span class="bp-status-dot"></span>Raise closed`;
  }

  // Sidebar footer note + hero button both assumed "nothing is built yet"
  // — once the escrow is actually deployed that stops being true, so both
  // need to track the same real lifecycle the status row does.
  const footDot = document.getElementById("bp-side-status-dot");
  const footText = document.getElementById("bp-side-foot-text");
  const previewBtn = document.getElementById("bp-see-preview");
  if (footText) {
    if (!s.started) {
      footText.textContent = "Escrow is deployed — waiting for CirclePad to start the raise.";
      if (footDot) footDot.className = "bp-side-status-dot";
    } else if (s.isOpen) {
      footText.textContent = "Live — the raise is open for contributions.";
      if (footDot) footDot.className = "bp-side-status-dot bp-live";
    } else {
      footText.textContent = "Raise closed — funds pending distribution.";
      if (footDot) footDot.className = "bp-side-status-dot" + (capReached ? " bp-live" : "");
    }
  }
  if (previewBtn) {
    previewBtn.textContent = !s.started ? "See the round" : s.isOpen ? "Join the round" : "See the results";
  }

  // Badge only turns green/"LIVE" once the recipient has actually called
  // start() — deployed-but-not-started stays "READY" so nobody mistakes
  // this for an open raise before it is one.
  document.querySelectorAll(".bp-featured-badge").forEach((el) => {
    // v9: a closed round says so (it used to stay "LIVE" after the 72 hours)
    if (s.started && s.isOpen) { el.textContent = "LIVE"; el.classList.add("bp-live"); }
    else if (s.started) { el.textContent = "CLOSED"; el.classList.remove("bp-live"); }
    else { el.textContent = "READY"; el.classList.remove("bp-live"); }
  });

  const progressBarEl = document.getElementById("bp-round-progress-fill")?.parentElement;
  const fillEl = document.getElementById("bp-round-progress-fill");
  const labelEl = document.getElementById("bp-round-progress-label");
  if (capUncapped) {
    if (progressBarEl) progressBarEl.style.display = "none";
    if (labelEl) labelEl.innerHTML = `<span class="bp-raised-big">${fmtEth(s.totalRaised)} USDC</span>${cpAlt(s.totalRaised, "cp-alt-raised")}<span class="bp-raised-suffix">raised so far — uncapped</span>`;
  } else {
    const pct = s.cap > 0n ? Math.min(100, Number((s.totalRaised * 10000n) / s.cap) / 100) : 0;
    if (progressBarEl) progressBarEl.style.display = "";
    if (fillEl) fillEl.style.width = pct + "%";
    if (labelEl) labelEl.innerHTML = `<span class="bp-raised-big">${fmtEth(s.totalRaised)} USDC</span>${cpAlt(s.totalRaised, "cp-alt-raised")}<span class="bp-raised-suffix">of <strong>${fmtEth(s.cap)} USDC</strong> goal</span>`;
  }

  const lengthEl = document.getElementById("bp-stat-length");
  if (lengthEl) lengthEl.textContent = s.started ? new Date(_circlepadDeadline * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not started";

  const btn = document.getElementById("bp-contribute-btn");
  const row = document.getElementById("bp-contribute-row");
  const balanceRow = document.getElementById("bp-balance-row");
  const balanceVal = document.getElementById("bp-wallet-balance");
  if (btn && row) {
    if (s.isOpen) {
      row.style.display = "flex";
      btn.disabled = false;
      btn.textContent = "Contribute USDC";
      if (accountUnknown) {
        // leave the balance row exactly as it was — real fetch fills it in
      } else if (state.account && balanceRow && balanceVal) {
        balanceVal.textContent = fmtEth(s.myWalletBalance ?? 0n) + " USDC";
        balanceRow.style.display = "block";
      } else if (balanceRow) {
        balanceRow.style.display = "none";
      }
    } else {
      row.style.display = "none";
      btn.disabled = true;
      btn.textContent = !s.started ? "Not started yet" : capReached ? "Cap reached — closed" : "Raise ended";
      if (balanceRow) balanceRow.style.display = "none";
    }
  }

  updateCirclepadCountdown();
  if (accountUnknown) return;

  // Start button: recipient only, only before start().
  const startRow = document.getElementById("bp-start-row");
  if (startRow) startRow.style.display = state.account && isRecipient && !s.started ? "block" : "none";

  // Refund button: any contributor with an outstanding balance, any time
  // the raise is open — no lock-in.
  const refundRow = document.getElementById("bp-refund-row");
  const refundBtn = document.getElementById("bp-refund-btn");
  if (refundRow && refundBtn) {
    if (state.account && s.isOpen && s.myContribution > 0n) {
      refundRow.style.display = "block";
      if (!refundBtn.dataset.busy) refundBtn.textContent = `Withdraw my ${fmtEth(s.myContribution)} USDC`;
    } else {
      refundRow.style.display = "none";
    }
  }

  // Withdraw & split button: recipient only, only once closed and
  // undistributed with a nonzero balance.
  const withdrawRow = document.getElementById("bp-withdraw-row");
  const withdrawBtn = document.getElementById("bp-withdraw-btn");
  if (withdrawRow && withdrawBtn) {
    if (state.account && isRecipient && !s.isOpen && !s.distributed && s.balance > 0n) {
      withdrawRow.style.display = "block";
      if (!withdrawBtn.dataset.busy) withdrawBtn.textContent = `Withdraw ${fmtEth(s.balance)} USDC — split 80/5/15`;
    } else {
      withdrawRow.style.display = "none";
    }
  }

  // My Position panel + featured-side line + mini-stats.
  const positionEl = document.getElementById("bp-position-body");
  const sideEl = document.getElementById("bp-my-position");
  const mineStat = document.getElementById("bp-stat-mine");
  const shareStat = document.getElementById("bp-stat-myshare");
  if (!state.account) {
    if (positionEl) { positionEl.className = "bp-empty"; positionEl.textContent = "Connect your wallet to see your position."; }
    if (sideEl) sideEl.textContent = "";
    if (mineStat) mineStat.textContent = "—";
    if (shareStat) shareStat.textContent = "—";
  } else {
    const mine = s.myContribution;
    const pct = s.totalRaised > 0n ? (Number((mine * 10000n) / s.totalRaised) / 100).toFixed(2) : "0.00";
    if (mine === 0n) {
      if (positionEl) { positionEl.className = "bp-empty"; positionEl.textContent = "No contribution yet from this wallet."; }
      if (sideEl) sideEl.textContent = "";
      if (mineStat) mineStat.textContent = "0 USDC";
      if (shareStat) shareStat.textContent = "0%";
    } else {
      if (positionEl) { positionEl.className = ""; positionEl.innerHTML = `You've contributed <strong>${fmtEth(mine)} USDC</strong> ${cpAlt(mine)} — <strong>${pct}%</strong> of the raise so far.`; }
      if (sideEl) sideEl.innerHTML = `Your contribution: <strong>${fmtEth(mine)} USDC</strong> ${cpAlt(mine)} (${pct}%)`;
      if (mineStat) mineStat.textContent = fmtEth(mine) + " USDC";
      if (shareStat) shareStat.textContent = pct + "%";
    }
  }
}

async function refreshCirclepadCore() {
  applyCirclepadState(await fetchCirclepadState());
}

function updateCirclepadCountdown() {
  const el = document.getElementById("bp-round-countdown");
  if (!el) return;
  if (!_circlepadStarted || _circlepadDeadline === null) { el.innerHTML = ""; return; }
  const remaining = _circlepadDeadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) { el.innerHTML = "Raise ended"; return; }
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  el.innerHTML = `Ends in <strong>${d}d ${h}h ${m}m ${s}s</strong>`;
}

async function initCirclepadRound() {
  if (!circlepadEscrowConfigured()) {
    // No escrow wired in: the markup's neutral "Loading…" defaults would
    // otherwise sit there forever. Paint the honest pre-deploy state.
    document.querySelectorAll(".bp-featured-badge").forEach((el) => { el.textContent = "PREVIEW"; el.classList.remove("bp-live"); });
    const st = document.getElementById("bp-round-status");
    if (st) st.innerHTML = `<span class="bp-status-dot amber"></span>Preview — no round open`;
    const cb = document.getElementById("bp-contribute-btn");
    if (cb) { cb.disabled = true; cb.textContent = "Contribute USDC — not open"; }
    const ft = document.getElementById("bp-side-foot-text");
    if (ft) ft.textContent = "Not live yet — the fund-pooling contract is in design and review.";
    return;
  }

  // Paint from the last visit's cache first — synchronous, no RPC — so a
  // returning visitor sees the live round and leaderboard immediately
  // instead of a "PREVIEW"/"Loading…" flash. isOpen is recomputed against
  // the clock rather than trusted from the cache, since the deadline may
  // have passed since it was saved. The real fetch below overwrites all
  // of this as soon as it lands.
  const cachedState = circlepadLoadCache("state");
  if (cachedState && typeof cachedState.started === "boolean") {
    const now = Math.floor(Date.now() / 1000);
    const capReached = cachedState.cap > 0n && cachedState.totalRaised >= cachedState.cap;
    const isOpen = cachedState.started && now < Number(cachedState.deadline) && !capReached;
    const painted = { ...cachedState, isOpen, myContribution: 0n, myWalletBalance: null };
    applyCirclepadState(painted, { accountUnknown: true });
    // Also seed the in-memory snapshot fetchCirclepadState() falls back to on
    // a failed read — otherwise the first real fetch of the session has
    // no "previous" to recover to, and a single flaky started()/isOpen()
    // call would default to false and flip an actually-live round back
    // to READY right after the correct cached value was just shown.
    _circlepadState = painted;
  }
  const cachedLb = circlepadLoadCache("leaderboard");
  if (cachedLb && Array.isArray(cachedLb.rows) && Array.isArray(cachedLb.activity)) {
    renderCirclepadLeaderboard(cachedLb.rows, cachedLb.activity, cachedLb.flow || null);
    _circlepadLeaderboardLoadedOnce = true; // don't replace this with "Loading…" or an error
  }

  // One-time diagnostic: if Multicall3 isn't actually deployed on this
  // chain, every "batched" read below silently falls back to one request
  // per call (see multicallRead in app.js) — same correctness, much
  // slower. Logged once so a slow-loading report can be told apart from
  // "Multicall3 isn't there" vs. "something else is wrong."
  const t0 = performance.now();
  isMulticallAvailable().then((ok) => {
    console.log(`CirclePad: Multicall3 ${ok ? "available" : "NOT available — falling back to one request per call"} (checked in ${Math.round(performance.now() - t0)}ms)`);
  });

  const lengthLabel = document.getElementById("bp-stat-length-label");
  if (lengthLabel) lengthLabel.textContent = "Ends";
  const payoutLabel = document.getElementById("bp-stat-payout-label");
  if (payoutLabel) payoutLabel.textContent = "Payout wallet";

  // This contract only escrows USDC — it does not enforce the vote/lead/
  // vesting mechanism the rest of this page documents, so the copy that
  // assumed that mechanism was live needs to say so plainly instead.
  // Once the separate vote contract is configured, the governance code owns these lines.
  if (CONFIG.CIRCLEPAD_ROUND_PLAN && window.cpPlan) window.cpPlan.copy(); // a round with no vote (circlepad-plan.js)
  else if (!circlepadVoteConfigured()) {
    const desc = document.getElementById("bp-featured-desc");
    // v9: a later round whose coin and vote aren't set yet says what is fixed (the escrow) and what comes next
    if (desc) desc.textContent = (CONFIG.CIRCLEPAD_ROUND || 1) > 1
      ? (window.cpRT ? window.cpRT("A 72-hour USDC raise in its own escrow on Arc: withdraw your contribution any time before the close, then the 80 / 15 / 5 split on-chain. What Round #1 launches is announced here — governance opens soon.") : "A 72-hour USDC raise in its own escrow on Arc: withdraw your contribution any time before the close, then the 80 / 15 / 5 split on-chain. What Round #1 launches is announced here — governance opens soon.")
      : "This round is contribution-only on-chain: USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72-hour window closes. Voting on name, ticker, logo, and roadmap is not enforced by this contract — see Docs > Safety design.";
    const govNote = document.getElementById("bp-gov-note");
    if (govNote) govNote.textContent = "Voting opens at the close — the vote contract is being set up.";
    const govPanelNote = document.getElementById("bp-gov-panel-note");
    if (govPanelNote) govPanelNote.textContent = "The vote contract for this round is being set up. Candidates will appear here, and voting opens the moment the raise closes.";
  }

  try {
    const escrow = circlepadEscrowRead();
    const [recipient, platformWallet, treasuryWallet] = await Promise.all([
      escrow.recipient(), escrow.platformWallet(), escrow.treasuryWallet(),
    ]);
    const payoutEl = document.getElementById("bp-stat-payout");
    // A zero recipient (or a failed read) would print "0x0000…0000", which
    // reads like a bug — say what it means instead.
    if (payoutEl) payoutEl.innerHTML = recipient && recipient !== ethers.ZeroAddress
      ? `<a href="${CONFIG.BLOCK_EXPLORER}/address/${recipient}" target="_blank" rel="noopener">${short(recipient)}</a>`
      : "Set when the round starts";

    const nextTitle = document.getElementById("bp-nextcard-title");
    const nextBody = document.getElementById("bp-nextcard-body");
    if (nextTitle) nextTitle.textContent = window.cpRT ? window.cpRT("How Round #1 closes") : "How Round #1 closes";
    if (nextBody) {
      nextBody.innerHTML = `Once the recipient starts the clock, the raise runs for 72 hours. Contributors can withdraw their own USDC any time before it closes, no lock-in. When it closes, the balance splits automatically: 80% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${recipient}" target="_blank" rel="noopener">recipient wallet</a>, 5% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${platformWallet}" target="_blank" rel="noopener">platform wallet</a>, and 15% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${treasuryWallet}" target="_blank" rel="noopener">treasury wallet</a>. The top contributor at the close receives that 15% over 3 days, and every contributor gets an airdrop of the new coin.`;
    }
  } catch (err) {
    console.error("CirclePad: failed to load recipient/platform/treasury", err);
  }

  // Independent of each other — no reason to wait for one before starting
  // the other, and the leaderboard's first-ever fetch (binary-searching
  // for the round's starting block, see blockAtOrAfter in app.js) is the
  // slower of the two on a fresh browser with nothing cached yet.
  await Promise.all([refreshCirclepadCore(), refreshCirclepadLeaderboard()]);
  wireCirclepadContribute();
  wireCirclepadWithdraw();
  wireCirclepadStart();
  wireCirclepadRefund();

  if (_circlepadCountdownTimer) clearInterval(_circlepadCountdownTimer);
  _circlepadCountdownTimer = setInterval(() => { if (!document.hidden) updateCirclepadCountdown(); }, 1000);

  // Light polling for totals/leaderboard so other people's contributions
  // show up without a page reload. A contribution made from THIS tab
  // already triggers its own immediate refresh (see wireCirclepadContribute).
  if (_circlepadPollTimer) clearInterval(_circlepadPollTimer);
  _circlepadPollTimer = setInterval(() => {
    if (document.hidden) return; // a background tab skips the poll; coming back refreshes at once (below)
    refreshCirclepadCore();
    refreshCirclepadLeaderboard();
  }, 15000);
}

// "≈ 0.04 ETH" / "≈ 0.6 SOL" next to a USDC amount (circlepad-conv.js; the raise itself stays in USDC)
function cpAlt(v, cls) { return window.cpConv ? window.cpConv.html(v, cls) : ""; }

// Full Leaderboard panel AND the Home teaser both use this — adds a
// deposited/withdrawn breakdown line, but only for addresses that have
// actually withdrawn something. Someone who only ever contributed sees
// a plain row — "deposited: X, withdrew: 0" would just repeat the net.
function circlepadLbRowDetailedHtml(r, i, pctFn) {
  const flows = r.withdrawnTotal > 0n
    ? `<div class="bp-lb-flows">↓ ${fmtEth(r.depositedTotal)} USDC in · ↑ ${fmtEth(r.withdrawnTotal)} USDC out</div>`
    : "";
  return `<div class="bp-lb-row bp-lb-row-detailed">
    <span class="bp-lb-rank">#${i + 1}</span>
    <div class="bp-lb-addr-block">
      <span class="bp-lb-addr">${short(r.address)}</span>
      ${flows}
    </div>
    <span class="bp-lb-amount">${fmtEth(r.amount)} USDC${cpAlt(r.amount, "cp-alt-sm")}</span>
    <span class="bp-lb-pct">${pctFn(r.amount)}%</span>
    <a class="bp-lb-ext" href="${CONFIG.BLOCK_EXPLORER}/address/${r.address}" target="_blank" rel="noopener" title="View on explorer"><svg><use href="#i-ext" xlink:href="#i-ext"/></svg></a>
  </div>`;
}

let _circlepadLeaderboardLoadedOnce = false;
let _circlepadLbBusy = false;
let _circlepadLog = null;

// Contributed/Refunded events scanned so far, kept in memory and in
// localStorage (keyed by escrow address) so every refresh — and every
// return visit — only reads the blocks added since the last scan.
// Amounts are stored as strings since JSON can't carry BigInt.
function circlepadLogCache() {
  if (_circlepadLog) return _circlepadLog;
  let c = null;
  try { c = JSON.parse(localStorage.getItem(circlepadCacheKey("logs.v1")) || "null"); } catch { /* storage blocked */ }
  _circlepadLog = (c && Array.isArray(c.contributed) && Array.isArray(c.refunded))
    ? c : { from: null, scannedTo: null, endBlock: null, contributed: [], refunded: [] };
  return _circlepadLog;
}
function circlepadSaveLogCache(log) {
  try { localStorage.setItem(circlepadCacheKey("logs.v1"), JSON.stringify(log)); } catch { /* quota — memory copy still works */ }
}

function showCirclepadLeaderboardText(text) {
  const homeEl = document.getElementById("bp-home-leaderboard");
  if (homeEl) { homeEl.className = "bp-empty"; homeEl.textContent = text; }
  const fullEl = document.getElementById("bp-full-leaderboard");
  if (fullEl) fullEl.textContent = text;
}

async function refreshCirclepadLeaderboard() {
  if (!circlepadEscrowConfigured()) return;
  if (_circlepadLbBusy) return; // a long first scan must not overlap the next 15s poll
  _circlepadLbBusy = true;
  try { await refreshCirclepadLeaderboardInner(); } finally { _circlepadLbBusy = false; }
}

async function refreshCirclepadLeaderboardInner() {
  const escrow = circlepadEscrowRead();
  if (!_circlepadLeaderboardLoadedOnce) showCirclepadLeaderboardText("Loading…");

  // The server aggregates the round's events once for everyone
  // (/api/social?circle=lb); the in-browser scan below is only the fallback.
  try {
    const r = await fetch(`/api/social?circle=lb${(CONFIG.CIRCLEPAD_ROUND || 1) > 1 ? "&round=" + CONFIG.CIRCLEPAD_ROUND : ""}`, { cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    if (j && Array.isArray(j.rows) && Array.isArray(j.activity) && (j.complete || j.rows.length || !j.started)) {
      const B = (v) => BigInt(v || 0);
      const rows = j.rows.map((x) => ({ address: ethers.getAddress(x.address), amount: B(x.amount), depositedTotal: B(x.depositedTotal), withdrawnTotal: B(x.withdrawnTotal) }));
      const activity = j.activity.map((a) => ({ contributor: ethers.getAddress(a.contributor), amount: B(a.amount), kind: a.kind, ts: a.ts, tx: a.tx || null }));
      const flow = j.flow ? { ...j.flow, in: B(j.flow.in), out: B(j.flow.out), net: B(j.flow.net) } : null;
      _circlepadLeaderboardLoadedOnce = true;
      // join order + the hourly net-raised series (circlepad-plus.js)
      window.circlepadLbExtra = { joinOrder: Array.isArray(j.joinOrder) ? j.joinOrder : null, series: Array.isArray(j.series) ? j.series : null, startTs: j.startTs || null };
      renderCirclepadLeaderboard(rows, activity, flow);
      circlepadSaveCache("leaderboard", { rows, activity, flow, savedAt: Date.now() });
      return;
    }
  } catch (err) { console.warn("CirclePad: server leaderboard unavailable, scanning in the browser", err); }

  // contribute() and refund() only succeed while the raise is open —
  // between start() and the deadline — so that window is the only place
  // these events can exist: nothing to scan before start(), nothing after
  // the deadline. Arc's RPC rejects eth_getLogs over ~10k blocks, so the
  // window is read in chunks (queryFilterChunked in arc-shared.js).
  let started, deadline, duration;
  try {
    [started, deadline, duration] = await Promise.all([
      withRetry(() => escrow.started()), withRetry(() => escrow.deadline()), withRetry(() => escrow.FUNDING_DURATION()),
    ]);
  } catch (err) {
    console.error("CirclePad: failed to read round state for the leaderboard", err);
    if (!_circlepadLeaderboardLoadedOnce) showCirclepadLeaderboardText("Couldn't load the leaderboard — retrying shortly.");
    return;
  }
  if (!started) {
    _circlepadLeaderboardLoadedOnce = true;
    renderCirclepadLeaderboard([], []);
    return;
  }

  const log = circlepadLogCache();
  try {
    if (log.from == null) {
      // blockAtOrAfter returns a block at or just BEFORE the target time,
      // so starting there can never skip the start() block itself.
      log.from = await blockAtOrAfter(new Date(Number(deadline - duration) * 1000).toISOString(), "circlepad-start");
      log.scannedTo = log.from - 1;
    }
    const latest = await withRetry(() => readProvider().getBlockNumber());
    let to = latest;
    if (Math.floor(Date.now() / 1000) > Number(deadline) + 60) {
      // Raise is over: cap the window at the deadline so a visit weeks later
      // doesn't scan weeks of empty blocks. blockAtOrAfter's answer is within
      // 2,048 blocks before the deadline, so +2,100 always covers it.
      if (log.endBlock == null) {
        log.endBlock = (await blockAtOrAfter(new Date(Number(deadline) * 1000).toISOString(), "circlepad-end")) + 2100;
      }
      to = Math.min(latest, log.endBlock);
    }
    if (to > log.scannedTo) {
      const plain = (e) => ({ contributor: e.args.contributor, amount: e.args.amount.toString(), blockNumber: e.blockNumber, index: e.index ?? 0, tx: e.transactionHash || null });
      // Checkpoint after every chunk (they complete in block order), so a
      // rate-limit failure halfway through resumes from there next poll.
      await queryFilterChunked(escrow, "*", log.scannedTo + 1, to, {
        onChunk: (found, [, chunkTo], done, total) => {
          // never keep the same log twice (block + log index), even if a chunk is re-read
          const seen = new Set([...log.contributed, ...log.refunded].map((x) => `${x.blockNumber}:${x.index}`));
          for (const e of found) {
            const p = plain(e), k = `${p.blockNumber}:${p.index}`;
            if (seen.has(k)) continue;
            seen.add(k);
            if (e.eventName === "Contributed") log.contributed.push(p);
            else if (e.eventName === "Refunded") log.refunded.push(p);
          }
          log.scannedTo = chunkTo;
          if (done === total || done % 5 === 0) circlepadSaveLogCache(log);
          if (!_circlepadLeaderboardLoadedOnce && total > 3) showCirclepadLeaderboardText(`Loading contributions… ${Math.round((done / total) * 100)}%`);
        },
      });
    }
  } catch (err) {
    circlepadSaveLogCache(log); // keep whatever chunks did complete
    console.error("CirclePad: failed to load Contributed/Refunded events", err);
    // A poll that fails after an earlier success leaves the last good data up.
    if (!_circlepadLeaderboardLoadedOnce) showCirclepadLeaderboardText("Couldn't load the leaderboard — retrying shortly.");
    return;
  }
  _circlepadLeaderboardLoadedOnce = true;

  const events = log.contributed.map((e) => ({ ...e, amount: BigInt(e.amount) }));
  const refundEvents = log.refunded.map((e) => ({ ...e, amount: BigInt(e.amount) }));

  // Per-address totals read straight from the contract (authoritative)
  // rather than summed from events, so this can never double-count and
  // automatically reflects any refunds already paid out. Batched through
  // Multicall3 — one round trip instead of one eth_call per contributor.
  const uniqueAddrs = [...new Set(events.map((e) => e.contributor))];
  const amounts = uniqueAddrs.length > 0
    ? await multicallRead(uniqueAddrs.map((a) => ({ contract: escrow, method: "contributions", args: [a] })))
    : [];

  // Deposited/withdrawn totals ARE summed from the events themselves —
  // there's no single contract getter for "lifetime total in" or "lifetime
  // total out" (only the current net contributions() balance), so this is
  // the one place events are the right source, purely for display.
  const inByAddr = new Map(), outByAddr = new Map();
  for (const e of events) inByAddr.set(e.contributor, (inByAddr.get(e.contributor) ?? 0n) + e.amount);
  for (const e of refundEvents) outByAddr.set(e.contributor, (outByAddr.get(e.contributor) ?? 0n) + e.amount);

  const rows = uniqueAddrs
    .map((address, i) => ({ address, amount: amounts[i] ?? 0n, depositedTotal: inByAddr.get(address) ?? 0n, withdrawnTotal: outByAddr.get(address) ?? 0n }))
    .filter((r) => r.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));

  // Recent activity merges contributions (+) and refunds (−) in one feed,
  // newest first, so it's an honest picture of money moving both ways —
  // not just inflows. Block timestamps are resolved here (once, cached per
  // block) so the rendered list — and its cached copy — carries plain
  // unix seconds rather than needing another RPC to display "3m ago".
  const merged = [
    ...events.map((e) => ({ e, kind: "in" })),
    ...refundEvents.map((e) => ({ e, kind: "out" })),
  ].sort((a, b) => (a.e.blockNumber - b.e.blockNumber) || ((a.e.index || 0) - (b.e.index || 0)));
  const recent = merged.slice(-30).reverse();
  const blockNumbers = [...new Set(recent.map((item) => item.e.blockNumber))];
  const blocks = blockNumbers.length > 0 ? await Promise.all(blockNumbers.map((n) => readProvider().getBlock(n))) : [];
  const blockTime = new Map(blockNumbers.map((n, i) => [n, Number(blocks[i]?.timestamp ?? 0)]));
  const activity = recent.map(({ e, kind }) => ({
    contributor: e.contributor, amount: e.amount, kind, ts: blockTime.get(e.blockNumber) || 0, tx: e.tx || null,
  }));
  // Every contribution and every withdrawal, both ways (the "in & out" card).
  const sum = (list) => list.reduce((t, e) => t + e.amount, 0n);
  const fin = sum(events), fout = sum(refundEvents);
  const flow = {
    in: fin, out: fout, net: fin - fout, nIn: events.length, nOut: refundEvents.length,
    wallets: uniqueAddrs.length, refunders: new Set(refundEvents.map((e) => e.contributor)).size, holding: rows.length,
  };

  window.circlepadLbExtra = null; // circlepad-plus.js rebuilds join order + series from the event log
  renderCirclepadLeaderboard(rows, activity, flow);
  circlepadSaveCache("leaderboard", { rows, activity, flow, savedAt: Date.now() });
}

// Pure DOM render — called with fresh data from the chain, and on load with
// whatever the last visit cached, so the leaderboard is on screen instantly
// instead of after the block search + log queries finish.
// `flow` (optional): lifetime totals in and out — see refreshCirclepadLeaderboardInner.
function renderCirclepadLeaderboard(rows, activity, flow) { // eslint-disable-line no-unused-vars
  window.circlepadLbRows = rows;
  const total = rows.reduce((sum, r) => sum + r.amount, 0n);
  const pctOf = (amount) => (total > 0n ? (Number((amount * 10000n) / total) / 100).toFixed(2) : "0.00");

  const homeEl = document.getElementById("bp-home-leaderboard");
  if (homeEl) {
    if (rows.length === 0) {
      homeEl.className = "bp-empty";
      homeEl.textContent = "No contributors yet. The leaderboard fills in once a raise opens.";
    } else {
      homeEl.className = "bp-lb-mini";
      homeEl.innerHTML = rows.slice(0, 3).map((r, i) => circlepadLbRowDetailedHtml(r, i, pctOf)).join("")
        + (rows.length > 3 ? `<div class="bp-lb-more">+${rows.length - 3} more</div>` : "");
    }
  }

  const fullEl = document.getElementById("bp-full-leaderboard");
  if (fullEl) {
    fullEl.innerHTML = rows.length === 0
      ? "No contributors yet. The leaderboard fills in once a raise opens."
      : rows.map((r, i) => circlepadLbRowDetailedHtml(r, i, pctOf)).join("");
  }

  const activityEl = document.getElementById("bp-recent-activity");
  if (activityEl) {
    activityEl.innerHTML = activity.length === 0 ? "" : `<h4>Recent activity</h4>` + activity.map((a) => `
        <div class="bp-activity-item${a.kind === "out" ? " bp-activity-out" : ""}">
          <span class="bp-activity-addr">${short(a.contributor)}</span>
          <span class="bp-activity-amount">${a.kind === "out" ? "−" : "+"}${fmtEth(a.amount)} USDC</span>
          <span class="bp-activity-time">${timeAgo(a.ts)}</span>
          <a class="bp-lb-ext" href="${CONFIG.BLOCK_EXPLORER}/address/${a.contributor}" target="_blank" rel="noopener" title="View on explorer"><svg><use href="#i-ext" xlink:href="#i-ext"/></svg></a>
        </div>`).join("");
  }

  const contributorsEl = document.getElementById("bp-stat-contributors");
  if (contributorsEl) contributorsEl.textContent = rows.length > 0 ? String(rows.length) : "—";
  const leadEl = document.getElementById("bp-stat-lead");
  if (leadEl) leadEl.textContent = rows.length > 0 ? short(rows[0].address) : "—";
}

// Called by arc-shared.js's connectWallet/restoreBasicWallet/
// attachBasicWalletListeners on every account change (connect / disconnect
// / switch) — see arc-shared.js's `typeof refreshAccountDependentViews ===
// "function"` guards. No-op if the round isn't configured yet.
function refreshCirclepadMyPosition() {
  if (!circlepadEscrowConfigured()) return;
  refreshCirclepadCore();
}

// This page's own version of app.js's global refreshAccountDependentViews()
// — arc-shared.js is a shared library across ARCPAD and CIRCLEPAD, so it
// doesn't know which page-specific refresh functions exist; each page
// defines its own top-level refreshAccountDependentViews() instead.
function refreshAccountDependentViews() {
  refreshCirclepadMyPosition();
  if (typeof refreshCirclepadGovernance === "function") refreshCirclepadGovernance();
}

function wireCirclepadStart() {
  const btn = document.getElementById("bp-start-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    if (!(await cpConfirm({ title: "Start the 72-hour raise?", body: "The funding window opens right now and closes 72 hours later. This can't be undone or redone.", ok: "Start the raise" }))) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      const tx = await escrow.start();
      btn.textContent = "Confirming…";
      await tx.wait();
      await refreshCirclepadCore();
    } catch (err) {
      console.error("CirclePad: start failed", err);
      cpToast(cpErrText(err, "Start failed or was rejected."), "bad");
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireCirclepadRefund() {
  const btn = document.getElementById("bp-refund-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  // Partial withdrawals: the contract's refund(amount) takes any amount up to
  // what this wallet put in; leaving the box empty withdraws all of it.
  const amt = document.createElement("div");
  amt.className = "bp-contribute-row cp-refund-amt";
  amt.innerHTML = `<input type="number" min="0" step="0.01" class="bp-contribute-input" id="bp-refund-amount" placeholder="Amount (empty = all)"><button type="button" class="bp-btn-ghost bp-contribute-max" id="bp-refund-all">Max</button>`;
  btn.parentNode.insertBefore(amt, btn);
  const refIn = amt.querySelector("#bp-refund-amount");
  amt.querySelector("#bp-refund-all").addEventListener("click", () => { refIn.value = ""; refIn.focus(); });
  btn.addEventListener("click", async () => {
    let want = null;
    if (refIn.value.trim()) {
      try { want = ethers.parseEther(refIn.value.trim()); } catch { cpToast("That doesn't look like a valid USDC amount.", "bad"); return; }
      if (want <= 0n) { cpToast(CP_ERRORS.ZeroRefundAmount, "bad"); return; }
    }
    btn.disabled = true;
    btn.dataset.busy = "1";
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      const mine = await escrow.contributions(state.account);
      if (want !== null && want > mine) throw Object.assign(new Error("InsufficientContribution"), { revert: { name: "InsufficientContribution" } });
      const tx = await escrow.refund(want === null ? mine : want);
      btn.textContent = "Confirming…";
      await tx.wait();
      delete btn.dataset.busy;
      refIn.value = "";
      cpToast("Withdrawn to your wallet.", "ok");
      await Promise.all([refreshCirclepadCore(), refreshCirclepadLeaderboard()]);
    } catch (err) {
      console.error("CirclePad: refund failed", err);
      cpToast(cpErrText(err, "Withdraw failed or was rejected."), "bad");
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireCirclepadWithdraw() {
  const btn = document.getElementById("bp-withdraw-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    if (!(await cpConfirm({ title: "Split the raise now?", body: "The full balance goes out in one transaction: 80% to the recipient wallet, 15% to the treasury wallet and 5% to the platform wallet.", ok: "Split 80 / 15 / 5" }))) return;
    btn.disabled = true;
    btn.dataset.busy = "1";
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      const tx = await escrow.withdraw();
      btn.textContent = "Confirming…";
      await tx.wait();
      delete btn.dataset.busy;
      await refreshCirclepadCore();
    } catch (err) {
      console.error("CirclePad: withdraw failed", err);
      cpToast(cpErrText(err, "Withdraw failed or was rejected."), "bad");
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireCirclepadContribute() {
  const btn = document.getElementById("bp-contribute-btn");
  const input = document.getElementById("bp-contribute-amount");
  const maxBtn = document.getElementById("bp-contribute-max");
  if (!btn || !input || !maxBtn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  maxBtn.addEventListener("click", async () => {
    try {
      // "Max" is what this wallet can spend (less a little for gas), capped by
      // what's left of the round's cap. An uncapped round reports "unlimited"
      // room, so without a wallet there is no max to show — connect first.
      if (!state.account) {
        if (typeof connectWallet === "function") await connectWallet();
        if (!state.account) return;
      }
      const escrow = circlepadEscrowRead();
      let amount = await escrow.remainingCap();
      const balance = await readProvider().getBalance(state.account);
      const gasBuffer = ethers.parseEther("0.05"); // leave headroom for gas (paid in USDC on Arc)
      const spendable = balance > gasBuffer ? balance - gasBuffer : 0n;
      if (spendable < amount) amount = spendable;
      // two decimals is plenty for a USDC amount
      input.value = amount > 0n ? String(Math.floor(Number(ethers.formatEther(amount)) * 100) / 100) : "0";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (err) {
      console.error("CirclePad: failed to compute max contribution", err);
    }
  });

  btn.addEventListener("click", async () => {
    if (!state.account) {
      if (typeof connectWallet === "function") await connectWallet();
      if (!state.account) return;
    }
    const amountStr = input.value;
    if (!amountStr || Number(amountStr) <= 0) { cpToast("Enter a USDC amount to contribute.", "bad"); input.focus(); return; }

    let amount;
    try { amount = ethers.parseEther(amountStr); }
    catch { cpToast("That doesn't look like a valid USDC amount.", "bad"); return; }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      // Referral links (?ref=0x…) append the referrer's address after the
      // contribute() selector. The contract ignores the extra bytes; the site
      // reads them back from the transaction to credit the referrer.
      const ref = typeof circlepadReferrer === "function" ? circlepadReferrer() : null;
      const tx = ref
        ? await state.signer.sendTransaction({ to: CONFIG.CIRCLEPAD_ESCROW_ADDRESS, value: amount, data: escrow.interface.encodeFunctionData("contribute") + ref.slice(2).toLowerCase() })
        : await escrow.contribute({ value: amount });
      btn.textContent = "Confirming…";
      await tx.wait();
      input.value = "";
      cpToast("Contribution confirmed.", "ok");
      // circlepad-v5.js: the USDC coin drops into the circle
      try { document.dispatchEvent(new CustomEvent("circlepad:contributed", { detail: { amount: Number(ethers.formatEther(amount)), tx: tx.hash } })); } catch { /* fine */ }
      if (ref) { try { fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cref", tx: tx.hash }), keepalive: true }).catch(() => {}); } catch { /* best effort */ } }
      await Promise.all([refreshCirclepadCore(), refreshCirclepadLeaderboard()]);
    } catch (err) {
      console.error("CirclePad: contribution failed", err);
      cpToast(cpErrText(err, "Transaction failed or was rejected."), "bad");
      btn.disabled = false;
      btn.textContent = originalText;
      refreshCirclepadCore(); // re-applies the correct disabled/label state
    }
  });
}

// NOTE: initCirclepadRound() / initCirclepadGovernance() are called at the very
// bottom of this file, after every const/let they depend on has been
// declared. Calling them from up here — before CIRCLEPAD_VOTE_CATEGORIES,
// _circlepadGovLoadedOnce etc. exist — throws a ReferenceError (temporal
// dead zone) synchronously, before any try/catch, and left the Governance
// tab stuck on its static "Loading…" text with the failure only visible
// in the console.

// ---- Governance / voting (contracts/CirclePadVote.sol) ----
// Entirely separate from the escrow above — reads weight live from it
// but holds no funds and isn't part of that contract. No-op (fallback
// copy in the HTML stays as-is) until CONFIG.CIRCLEPAD_VOTE_ADDRESS is
// filled in after deploy.

// Five categories, each with its own kind of candidate: plain text for the
// name, a ticker, an image link for the logo, a short plan for the roadmap
// and a moment in time for the launch date. The contract only stores
// strings, so the kind decides how a candidate is typed in and shown.
function govChains() { return typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_GOV_DIRECT === true && CONFIG.CIRCLEPAD_ROUND_GOV && Array.isArray(CONFIG.CIRCLEPAD_ROUND_GOV.chain) ? CONFIG.CIRCLEPAD_ROUND_GOV.chain : []; }
const CIRCLEPAD_VOTE_CATEGORIES = [
  { id: 0, label: "Coin name", kind: "name", max: 32 },
  { id: 1, label: "Ticker", kind: "ticker", max: 10 },
  { id: 2, label: "Logo", kind: "logo", max: 300 },
  { id: 3, label: "Roadmap", kind: "roadmap", max: 400 },
  { id: 4, label: "Launch date", kind: "date", max: 40 },
  // Round #3 on: where the coin launches — one of CONFIG.CIRCLEPAD_GOV[n].chain, pre-voted then published like the rest
  ...(govChains().length ? [{ id: 5, label: "Launch chain", kind: "chain", max: 20 }] : []),
];
const GOV_MAX_OPTIONS = 8;
/// how many categories this round votes on (5, or 6 with the launch chain)
window.cpCatCount = () => CIRCLEPAD_VOTE_CATEGORIES.length;

let _circlepadGovPollTimer = null;
let _govClockTimer = null;
// The polls and clocks above sit still while the tab is hidden; when it comes back, catch up once.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (_circlepadCountdownTimer) updateCirclepadCountdown();
  if (_circlepadPollTimer) { refreshCirclepadCore(); refreshCirclepadLeaderboard(); }
  if (_circlepadGovPollTimer) refreshCirclepadGovernance();
  if (_govClockTimer) tickGovClocks();
});
let _govSkew = 0; // chain time minus this device's clock, seconds
let _govLast = null; // last rendered state
const _govDrafts = new Map(); // category → option drafts, survive the 15s refresh

const govEsc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const govNow = () => Math.floor(Date.now() / 1000) + _govSkew;

function circlepadVoteConfigured() {
  return typeof CONFIG !== "undefined" && ((!!CONFIG.CIRCLEPAD_VOTE_ADDRESS && CONFIG.CIRCLEPAD_VOTE_ADDRESS.length === 42) || CONFIG.CIRCLEPAD_GOV_DIRECT === true);
}
// A direct round (Round #2 on) has no vote contracts: the round wallet signs its candidates (kept by
// /api/social with the signature) and a vote is a plain $ARCIRCLE transfer to 0x…dEaD whose amount carries the
// choice in its last 12 decimals — votes × 1,000 $ARCIRCLE + round·10⁶ + (category+1)·10³ + (candidate+1) raw
// units, far below a billionth of a token (api/_burnvote.mjs voteAmount). Anyone can recount it from the chain.
const govDirect = () => typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_GOV_DIRECT === true;
const GOV_DUST = 10n ** 12n;
const govVoteAmount = (cat, opt, votes) => BigInt(votes) * GOV_PER_VOTE * 10n ** 18n + BigInt(CONFIG.CIRCLEPAD_ROUND || 1) * 1000000n + BigInt(cat + 1) * 1000n + BigInt(opt + 1);
const govCandMessage = (cat, options) => `ARCIRCLE PAD — CirclePad Round #${CONFIG.CIRCLEPAD_ROUND || 1} candidates\nRound: ${String(CONFIG.CIRCLEPAD_ESCROW_ADDRESS).toLowerCase()}\nCategory: ${CIRCLEPAD_VOTE_CATEGORIES[cat].label}\n` + options.map((o, i) => `${i + 1}. ${o}`).join("\n");
function circlepadVoteRead() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_VOTE_ADDRESS, CIRCLEPAD_VOTE_ABI, readProvider());
}
function circlepadVoteWrite() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_VOTE_ADDRESS, CIRCLEPAD_VOTE_ABI, state.signer);
}

// ---- burn-to-vote (contracts/ArcircleBurnVote.sol) ----
// 1 vote = 1,000 $ARCIRCLE, sent to the dead address in the vote transaction.
// Any holder can vote, as often as they like; the candidates still come from
// BigPadVote above. Burn mode with no contract address yet = the rules are
// shown but votes can't be cast.
const GOV_DEAD = "0x000000000000000000000000000000000000dEaD";
const GOV_PER_VOTE = 1000n;
const CIRCLEPAD_BURNVOTE_ABI = [
  "function vote(uint8 category, uint256 optionIndex, uint256 votes)",
  "function votingOpen() view returns (bool)",
  "function opensAt() view returns (uint256)",
  "function votingEnds() view returns (uint256)",
  "function votePrice() view returns (uint256)",
  "function tallies(uint8 category) view returns (uint256[])",
  "function myVotes(uint8 category, address voter) view returns (uint256[])",
  "function totalBurned() view returns (uint256)",
  "function totalVotes() view returns (uint256)",
  "function voterCount() view returns (uint256)",
];
const GOV_ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
];
const govBurnMode = () => typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_VOTE_MODE === "burn";
const govBurnLive = () => govBurnMode() && (/^0x[0-9a-fA-F]{40}$/.test(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS || "") || govDirect()) && /^0x[0-9a-fA-F]{40}$/.test(CONFIG.ARCIRCLE_TOKEN || "");
const govBurnRead = () => new ethers.Contract(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS, CIRCLEPAD_BURNVOTE_ABI, readProvider());
const govTokenRead = () => new ethers.Contract(CONFIG.ARCIRCLE_TOKEN, GOV_ERC20_ABI, readProvider());
let _govBurn = null; // the open "burn & vote" panel: { cat, opt, n, busy } — survives the 15s refresh
const _govLeadPrev = new Map(); // category → option that led at the last paint (crown hand-off)

// ---- how a candidate looks ----
function govLogoUrl(t) {
  let s = String(t || "").trim();
  if (/^ipfs:\/\/[A-Za-z0-9./_-]+$/.test(s)) s = "https://ipfs.io/ipfs/" + s.slice(7);
  if (!/^https:\/\/[^\s"'<>`]+$/i.test(s)) return null;
  try { const u = new URL(s); return u.protocol === "https:" ? u.href : null; } catch { return null; }
}
function govDate(t) {
  const s = String(t || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(s)) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
// Times on CirclePad: the viewer's own clock, KST or UTC (remembered per browser).
// Countdowns always follow the chain's clock; only how a moment is written changes.
const CP_TZ = { local: undefined, kst: "Asia/Seoul", utc: "UTC" };
function cpTzMode() { try { const m = localStorage.getItem("circlepad.tz"); return CP_TZ.hasOwnProperty(m) ? m : "local"; } catch (e) { return "local"; } }
function cpSetTz(m) {
  if (!CP_TZ.hasOwnProperty(m)) return;
  try { localStorage.setItem("circlepad.tz", m); } catch (e) { /* this page only */ }
  window.__cpTz = m;
  if (typeof _govLast !== "undefined" && _govLast && typeof renderCirclepadGovernance === "function") try { renderCirclepadGovernance(_govLast); } catch (e) { /* next paint */ }
  document.dispatchEvent(new CustomEvent("circlepad:tz", { detail: m }));
}
function cpFmtTime(d, opts) {
  const m = window.__cpTz || cpTzMode();
  const o = { ...opts };
  if (m === "local") o.timeZoneName = "short"; else o.timeZone = CP_TZ[m];
  const s = d.toLocaleString(undefined, o);
  return m === "local" ? s : `${s} ${m.toUpperCase()}`;
}
function govFmtDate(d) {
  return cpFmtTime(d, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function govLeft(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
const GOV_CHAIN_HUE = { arc: "#4f8cff", "robinhood chain": "#39ff88", robinhood: "#39ff88", solana: "#b46cff" };
function govOptionHtml(kind, text) {
  if (kind === "chain") return `<span class="gv-o gv-o-chain"><i style="--c:${GOV_CHAIN_HUE[String(text).toLowerCase()] || "#8aa0b4"}"></i>${govEsc(text)}</span>`;
  if (kind === "ticker") return `<span class="gv-o gv-o-ticker">$${govEsc(String(text).replace(/^\$/, ""))}</span>`;
  if (kind === "logo") {
    const u = govLogoUrl(text);
    if (u) {
      let host = ""; try { host = new URL(u).host; } catch { /* shown without */ }
      return `<span class="gv-o gv-o-logo"><img src="${govEsc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('bad')"><small>${govEsc(host)}</small></span>`;
    }
  }
  if (kind === "date") {
    const d = govDate(text);
    if (d) return `<span class="gv-o gv-o-date"><b>${govEsc(govFmtDate(d))}</b><small>${govEsc((window.__cpTz || cpTzMode()) === "utc" ? new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " KST" : d.toISOString().slice(0, 16).replace("T", " ") + " UTC")}</small></span>`;
  }
  if (kind === "roadmap") return `<span class="gv-o gv-o-road">${govEsc(text).replace(/\n/g, "<br>")}</span>`;
  return `<span class="gv-o">${govEsc(text)}</span>`;
}

async function initCirclepadGovernance() {
  if (!circlepadVoteConfigured()) return; // fallback copy in the HTML stays put
  const fallback = document.getElementById("bp-gov-fallback");
  const live = document.getElementById("bp-gov-live");
  if (fallback) fallback.style.display = "none";
  if (live) live.style.display = "block";

  const desc = document.getElementById("bp-featured-desc");
  const rg = (CONFIG.CIRCLEPAD_ROUND || 1) > 1 ? CONFIG.CIRCLEPAD_ROUND_GOV || {} : null;
  if (desc) desc.textContent = govBurnMode() && rg
    ? `USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72 hours are up. While the raise runs, anyone can suggest and pre-vote on ideas for free, then $ARCIRCLE holders burn-to-vote on the candidates. At the close it splits 80 / 15 / 5${rg.top === true ? " and the top contributor receives the 15% over 3 days" : ""}. Contributor airdrop: ${rg.airdrop || "not decided yet."}`
    : govBurnMode()
    ? "USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72 hours are up. While the raise runs, $ARCIRCLE holders burn-to-vote on the coin's identity. At the close it splits 80 / 15 / 5, the top contributor receives the 15% over 3 days and every contributor gets an airdrop."
    : "This round is contribution-only on-chain: USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72-hour window closes. Voting on name, ticker, logo, and roadmap runs in a separate contract — see the Governance tab.";

  const wrap = document.getElementById("bp-gov-live");
  if (wrap && !wrap.dataset.wired) {
    wrap.dataset.wired = "1";
    wireCirclepadGovernance(wrap);
  }

  paintCirclepadGovernanceFromCache(); // instant on a return visit; real fetch overwrites it below
  await refreshCirclepadGovernance();
  if (_circlepadGovPollTimer) clearInterval(_circlepadGovPollTimer);
  _circlepadGovPollTimer = setInterval(() => { if (!document.hidden) refreshCirclepadGovernance(); }, 15000);
  if (!_govClockTimer) _govClockTimer = setInterval(() => { if (!document.hidden) tickGovClocks(); }, 1000);
}

// Three small batched rounds rather than one call per category/option:
// round 1 finds which categories have options published, round 2 fetches
// those categories' option lists (now that their lengths are known),
// round 3 fetches every option's weight plus the caller's own vote per
// category — all through multicallRead (see app.js).
// a direct round: one API read (candidates, tallies, this wallet's votes) + the wallet's $ARCIRCLE balance
async function fetchDirectGovernanceState() {
  const q = `/api/social?circle=gov&round=${CONFIG.CIRCLEPAD_ROUND || 1}${state.account ? `&voter=${state.account.toLowerCase()}` : ""}`;
  const [d, bal] = await Promise.all([
    fetch(q, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("governance read failed: " + r.status)))),
    state.account && /^0x[0-9a-fA-F]{40}$/.test(CONFIG.ARCIRCLE_TOKEN || "") ? govTokenRead().balanceOf(state.account).catch(() => null) : Promise.resolve(null),
  ]);
  if (d.now) _govSkew = Number(d.now) - Math.floor(Date.now() / 1000);
  window.circlepadGovSkew = _govSkew;
  const categories = CIRCLEPAD_VOTE_CATEGORIES.map((c) => {
    const x = (d.categories || [])[c.id] || {};
    const mv = (x.mine || []).map((v) => BigInt(v || 0));
    let best = null; mv.forEach((v, j) => { if (v > 0n && (best === null || v > mv[best])) best = j; });
    return { id: c.id, label: c.label, set: !!x.set, fixed: !!c.fixed, options: (x.options || []).map((text, j) => ({ text, weight: BigInt((x.tallies || [])[j] || 0), mine: mv[j] ?? 0n })), myVoteIndex: best };
  });
  const burn = {
    live: true, direct: true, totalBurned: BigInt(d.totals ? d.totals.burned : 0), totalVotes: BigInt(d.totals ? d.totals.votes : 0), voterCount: BigInt(d.totals ? d.totals.voters : 0),
    votingOpen: !!d.votingOpen, opensAt: BigInt(d.opensAt || 0), votingEnds: BigInt(d.votingEnds || 0), allowance: ethers.MaxUint256,
  };
  if (bal != null) burn.bal = bal;
  return { votingOpen: !!d.votingOpen, votingEnds: BigInt(d.votingEnds || 0), opensAt: BigInt(d.opensAt || d.deadline || 0), recipient: d.recipient || ethers.ZeroAddress, deadline: BigInt(d.deadline || 0), categories, burn };
}
async function fetchCirclepadGovernanceState() {
  if (govDirect()) return fetchDirectGovernanceState();
  const vote = circlepadVoteRead();
  const round1 = [
    { contract: vote, method: "votingOpen" },
    { contract: vote, method: "votingEnds" },
    { contract: vote, method: "recipient" },
    ...CIRCLEPAD_VOTE_CATEGORIES.map((c) => ({ contract: vote, method: "optionsSet", args: [c.id] })),
  ];
  if (circlepadEscrowConfigured()) round1.push({ contract: circlepadEscrowRead(), method: "deadline" });
  const [r1, head] = await Promise.all([
    multicallRead(round1),
    readProvider().getBlock("latest").catch(() => null),
  ]);
  if (head && head.timestamp) _govSkew = Number(head.timestamp) - Math.floor(Date.now() / 1000);
  window.circlepadGovSkew = _govSkew;
  const votingOpen = !!r1[0];
  const votingEnds = r1[1] ?? 0n;
  const recipient = r1[2] || ethers.ZeroAddress;
  const setFlags = CIRCLEPAD_VOTE_CATEGORIES.map((_c, i) => !!r1[3 + i]);
  const deadline = circlepadEscrowConfigured() ? (r1[3 + CIRCLEPAD_VOTE_CATEGORIES.length] ?? 0n) : 0n;
  const setCats = CIRCLEPAD_VOTE_CATEGORIES.filter((_c, i) => setFlags[i]);

  const round2 = setCats.map((c) => ({ contract: vote, method: "options", args: [c.id] }));
  const r2 = setCats.length > 0 ? await multicallRead(round2) : [];
  const optionsByCategory = new Map(setCats.map((c, i) => [c.id, r2[i] || []]));

  const round3 = [];
  const round3Meta = [];
  const burn = govBurnLive();
  for (const c of setCats) {
    const opts = optionsByCategory.get(c.id) || [];
    if (burn) {
      round3.push({ contract: govBurnRead(), method: "tallies", args: [c.id] });
      round3Meta.push({ type: "tallies", category: c.id });
      if (state.account) { round3.push({ contract: govBurnRead(), method: "myVotes", args: [c.id, state.account] }); round3Meta.push({ type: "myVotes", category: c.id }); }
      continue;
    }
    if (govBurnMode()) continue; // burn voting announced, contract not live yet: no votes to show
    for (let j = 0; j < opts.length; j++) {
      round3.push({ contract: vote, method: "optionWeight", args: [c.id, j] });
      round3Meta.push({ type: "weight", category: c.id, option: j });
    }
    if (state.account) {
      round3.push({ contract: vote, method: "myVote", args: [c.id, state.account] });
      round3Meta.push({ type: "myVote", category: c.id });
    }
  }
  if (burn) {
    for (const m of ["totalBurned", "totalVotes", "voterCount", "votingOpen", "opensAt", "votingEnds"]) { round3.push({ contract: govBurnRead(), method: m }); round3Meta.push({ type: "burn", key: m }); }
    if (state.account) {
      round3.push({ contract: govTokenRead(), method: "balanceOf", args: [state.account] }); round3Meta.push({ type: "burn", key: "bal" });
      round3.push({ contract: govTokenRead(), method: "allowance", args: [state.account, CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS] }); round3Meta.push({ type: "burn", key: "allowance" });
    }
  }
  const r3 = round3.length > 0 ? await multicallRead(round3) : [];

  const weightsByCategory = new Map();
  const myVoteByCategory = new Map();
  const myVotesByCategory = new Map();
  const burnInfo = { live: burn };
  round3Meta.forEach((meta, i) => {
    if (meta.type === "tallies") weightsByCategory.set(meta.category, [...(r3[i] || [])].map((x) => BigInt(x)));
    else if (meta.type === "myVotes") myVotesByCategory.set(meta.category, [...(r3[i] || [])].map((x) => BigInt(x)));
    else if (meta.type === "burn") burnInfo[meta.key] = r3[i];
    else if (meta.type === "weight") {
      if (!weightsByCategory.has(meta.category)) weightsByCategory.set(meta.category, []);
      weightsByCategory.get(meta.category)[meta.option] = r3[i] ?? 0n;
    } else {
      myVoteByCategory.set(meta.category, r3[i]);
    }
  });

  const categories = CIRCLEPAD_VOTE_CATEGORIES.map((c, i) => {
    const opts = optionsByCategory.get(c.id) || [];
    const weights = weightsByCategory.get(c.id) || [];
    const myVote = myVoteByCategory.get(c.id);
    const mv = myVotesByCategory.get(c.id) || [];
    let mvBest = null; mv.forEach((v, j) => { if (v > 0n && (mvBest === null || v > mv[mvBest])) mvBest = j; });
    return {
      id: c.id,
      label: c.label,
      set: setFlags[i],
      options: opts.map((text, j) => ({ text, weight: weights[j] ?? 0n, mine: mv[j] ?? 0n })),
      myVoteIndex: burn ? mvBest : myVote && myVote[0] ? Number(myVote[1]) : null,
    };
  });

  // burn voting keeps its own window (now → the raise's close), not the ballot's
  const bEnds = burn && burnInfo.votingEnds != null ? BigInt(burnInfo.votingEnds) : 0n;
  const bOpens = burn && burnInfo.opensAt != null ? BigInt(burnInfo.opensAt) : 0n;
  return { votingOpen: burn && burnInfo.votingOpen !== undefined ? !!burnInfo.votingOpen : votingOpen, votingEnds: bEnds || votingEnds, opensAt: bOpens || deadline, recipient, deadline, categories, burn: burnInfo };
}

// raise → voting → closed, on the chain's clock
function govPhase(g) {
  const now = govNow(), ends = Number(g.votingEnds || 0), dl = Number(g.deadline || 0);
  if (g.votingOpen) return "voting";
  if (ends && now >= ends) return "closed";
  if (dl && now >= dl) return "voting"; // the chain says it opens any second
  return "raise";
}
function govLeader(c) {
  if (!c.set || !c.options.length) return null;
  let best = -1, bw = 0n;
  c.options.forEach((o, i) => { if (o.weight > bw) { bw = o.weight; best = i; } });
  return best < 0 ? null : { i: best, text: c.options[best].text, weight: bw };
}

function renderCirclepadGovernance(g) {
  // every category has an entry (a cached state from an older page can have fewer): no crash on a missing one
  if (g && Array.isArray(g.categories) && g.categories.length < CIRCLEPAD_VOTE_CATEGORIES.length) {
    g = { ...g, categories: CIRCLEPAD_VOTE_CATEGORIES.map((c) => g.categories[c.id] || { id: c.id, label: c.label, set: false, fixed: !!c.fixed, options: [], myVoteIndex: null }) };
  }
  if (g && Array.isArray(g.categories)) g.categories.forEach((c) => { if (c && c.myVoteIndex === undefined) c.myVoteIndex = null; });
  const wrap = document.getElementById("bp-gov-categories");
  _govLast = g;
  window.circlepadGov = g;

  const s = (typeof _circlepadState !== "undefined" && _circlepadState) || {};
  const phase = govPhase(g);
  const total = s.totalRaised || 0n;
  const mine = state.account ? (s.myContribution || 0n) : 0n;
  const isRecipient = !!(state.account && g.recipient && state.account.toLowerCase() === g.recipient.toLowerCase());
  const published = g.categories.filter((c) => c.set).length;
  const NC = CIRCLEPAD_VOTE_CATEGORIES.length, NP = CIRCLEPAD_VOTE_CATEGORIES.filter((c) => !c.fixed).length; // fixed categories skip the pre-vote
  const prePub = g.categories.filter((c) => c.set && !(CIRCLEPAD_VOTE_CATEGORIES[c.id] || {}).fixed).length;
  const votedIn = g.categories.filter((c) => c.myVoteIndex !== null).length;
  // burn-to-vote: what this wallet can still cast, what it has cast, what's burned overall
  const bm = govBurnMode(), bLive = !!(bm && g.burn && g.burn.live);
  const unit = GOV_PER_VOTE * 10n ** 18n;
  const bal = bLive && g.burn.bal != null ? BigInt(g.burn.bal) : 0n;
  // a direct round's vote code adds a few raw units on top: keep them in hand
  const avail = govDirect() ? (bal > GOV_DUST ? (bal - GOV_DUST) / unit : 0n) : bal / unit;
  const myCast = g.categories.reduce((a, c) => a + c.options.reduce((b, o) => b + (o.mine || 0n), 0n), 0n);
  const burnedAll = bLive && g.burn.totalBurned != null ? BigInt(g.burn.totalBurned) : 0n;
  const votesAll = bLive && g.burn.totalVotes != null ? BigInt(g.burn.totalVotes) : 0n;
  const buyUrl = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_BUY_URL) || "";

  // step 1 is the pre-vote (circlepad-ideas.js): open until a category's candidates are published
  const preOpen = prePub < NP && phase !== "closed";
  const pv = (window.circlepadIdeas && window.circlepadIdeas.stats) || { ideas: 0, votes: 0 };
  const statusEl = document.getElementById("bp-gov-live-status");
  if (statusEl) {
    statusEl.textContent = bm && preOpen && published === 0
      ? "Pre-vote first: anyone can suggest ideas and vote for free. The round wallet then picks the candidates from the top, and $ARCIRCLE holders burn-to-vote on them until the raise closes."
      : bm && preOpen && phase === "voting"
        ? "Burn-to-vote is open for the categories whose candidates are out; the others are still in the pre-vote below."
        : bm
      ? (phase === "raise"
        ? "Candidates go up first. Voting runs until the raise closes: 1 vote = 1,000 $ARCIRCLE, burned for good."
        : phase === "voting" ? (bLive ? "Voting is open until the raise closes. Anyone holding $ARCIRCLE can vote — every vote burns 1,000 $ARCIRCLE." : "Voting opens as soon as the burn-vote contract is live.")
          : "Voting has closed — these results are final.")
      : phase === "raise"
        ? "Candidates go up during the raise. Voting opens the moment it closes and runs for 48 hours."
        : phase === "voting" ? "Voting is open. Every contributor has a say, weighted by the USDC they put in."
          : "Voting has closed — these results are final.";
  }
  const note = document.getElementById("bp-gov-note");
  if (note) note.textContent = phase === "raise" ? (bm ? "Candidates are up — voting opens soon and runs until the raise closes. 1 vote = 1,000 $ARCIRCLE burned." : "Candidates are up — voting opens at the close.") : phase === "voting" ? "Voting is open — cast yours." : "Voting has closed — see the result.";

  // ---- phases, clock, the coin so far, your weight ----
  const top = document.getElementById("bp-gov-top");
  if (top) {
    const ph = (key, title, sub, st) => `<div class="gv-ph ${st}" data-ph="${key}"><i></i><b>${title}</b><small>${sub}</small></div>`;
    const dl = Number(g.deadline || 0), ends = Number(g.votingEnds || 0);
    const op = Number(g.opensAt || dl);
    const clock = phase === "raise" && op
      ? `<span>Voting opens in</span><b data-no-i18n data-gv-to="${op}">${govLeft(op - govNow())}</b>`
      : phase === "voting" && ends
        ? `<span>Voting closes in</span><b data-no-i18n data-gv-to="${ends}">${govLeft(ends - govNow())}</b>`
        : ends ? `<span>Closed</span><b data-no-i18n>${govEsc(govFmtDate(new Date(ends * 1000)))}</b>` : "";

    const lead = Object.fromEntries(g.categories.map((c) => [c.id, govLeader(c)]));
    const logo = lead[2] && govLogoUrl(lead[2].text);
    const nameL = lead[0] ? lead[0].text : "", tickL = lead[1] ? String(lead[1].text).replace(/^\$/, "") : "";
    const dateL = lead[4] ? (govDate(lead[4].text) ? govFmtDate(govDate(lead[4].text)) : lead[4].text) : "";
    const roadL = lead[3] ? String(lead[3].text).split("\n")[0] : "";
    const anyLead = Object.values(lead).some(Boolean);
    const shareText = phase === "closed" && nameL && tickL
      ? (bm ? `CirclePad Round #1 is decided: $${tickL} — ${nameL}${dateL ? `, launching ${dateL}` : ""}. Chosen by $ARCIRCLE holders, who burned ${fmtEth(burnedAll, 0)} $ARCIRCLE to vote.`
        : `CirclePad Round #1 is decided: $${tickL} — ${nameL}${dateL ? `, launching ${dateL}` : ""}. Chosen by every contributor, weighted by the USDC they put in.`)
      : "";

    let meHtml;
    if (bm) {
      const dots = CIRCLEPAD_VOTE_CATEGORIES.map((c) => `<i class="${g.categories[c.id].myVoteIndex !== null ? "on" : ""}" title="${govEsc(c.label)}"></i>`).join("");
      if (!state.account) meHtml = `<p>Connect a wallet holding $ARCIRCLE to vote — 1 vote burns 1,000 $ARCIRCLE.</p><button type="button" class="bp-btn-primary gv-me-btn" data-gv="connect">Connect wallet</button>`;
      else if (!bLive) meHtml = `<p>Hold $ARCIRCLE to vote: every 1,000 is one vote, burned when you cast it.</p>${buyUrl ? `<a class="bp-btn-ghost gv-me-btn" href="${govEsc(buyUrl)}" target="_blank" rel="noopener">Get $ARCIRCLE</a>` : ""}`;
      else meHtml = `<div class="gv-me-w"><b><span data-no-i18n>${avail.toString()}</span> <span>${avail === 1n ? "vote" : "votes"}</span></b><span data-no-i18n>${fmtEth(bal, 0)} $ARCIRCLE</span></div>
        <small>${avail > 0n ? "Each vote burns 1,000 $ARCIRCLE — it can't be changed or taken back." : `<span>You need</span> <b data-no-i18n>${fmtEth(unit - (bal % unit), 2)}</b> <span>more $ARCIRCLE to vote.</span>`}</small>
        ${myCast > 0n ? `<div class="gv-me-dots">${dots}<span><span data-no-i18n>${myCast.toString()}</span> <span>votes cast</span> · <span data-no-i18n>${fmtEth(myCast * unit, 0)}</span> <span>burned</span></span></div>` : ""}
        ${avail === 0n && buyUrl && phase !== "closed" ? `<a class="bp-btn-ghost gv-me-btn" href="${govEsc(buyUrl)}" target="_blank" rel="noopener">Get $ARCIRCLE</a>` : ""}`;
    } else if (!state.account) {
      meHtml = `<p>Connect your wallet to see your vote weight.</p><button type="button" class="bp-btn-primary gv-me-btn" data-gv="connect">Connect wallet</button>`;
    } else if (mine > 0n) {
      const pct = total > 0n ? (Number((mine * 10000n) / total) / 100).toFixed(2) : "0.00";
      const dots = CIRCLEPAD_VOTE_CATEGORIES.map((c) => `<i class="${g.categories[c.id].myVoteIndex !== null ? "on" : ""}" title="${govEsc(c.label)}"></i>`).join("");
      meHtml = `<div class="gv-me-w"><b data-no-i18n>${fmtEth(mine)} USDC</b><span data-no-i18n>${pct}%</span></div><small>${phase === "raise" ? "Your weight locks in when the raise closes." : phase === "voting" ? "You can change a vote until voting closes." : "Thanks for voting."}</small>
        <div class="gv-me-dots">${dots}<span><span data-no-i18n>${votedIn}/${NC}</span> <span>voted</span></span></div>`;
    } else if (phase === "raise") {
      meHtml = `<p>Contribute to get a vote — your weight is the USDC you put in.</p><button type="button" class="bp-btn-primary gv-me-btn" data-gv="contribute">Contribute</button>`;
    } else {
      meHtml = `<p>Only wallets that contributed to the raise can vote.</p>`;
    }

    top.innerHTML = `${published === 0 && phase !== "closed" ? "" : `
        <div class="gv-coin gv-coin-hero${phase === "closed" ? " final" : ""}" data-coin-key="${govEsc([nameL, tickL, logo || "", dateL].join("|"))}">
          <div class="gv-coin-top"><small class="gv-k">${phase === "closed" ? "The result" : "The coin being decided"}</small>${phase === "voting" && ends ? `<span class="gv-coin-clock"><span>Decided in</span> <b data-no-i18n data-gv-to="${ends}">${govLeft(ends - govNow())}</b></span>` : ""}</div>
          <div class="gv-coin-row">
            <span class="gv-coin-logo"><em data-no-i18n>${govEsc((nameL || "?").slice(0, 1).toUpperCase())}</em>${logo ? `<img src="${govEsc(logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>
            <div class="gv-coin-id"><b data-no-i18n>${govEsc(nameL || "—")}</b><span data-no-i18n>${tickL ? "$" + govEsc(tickL) : "—"}</span></div>
          </div>
          <dl>
            <div><dt>Launch date</dt><dd data-no-i18n>${govEsc(dateL || "—")}</dd></div>
            <div><dt>Roadmap</dt><dd data-no-i18n>${govEsc(roadL || "—")}</dd></div>
          </dl>
          ${anyLead ? "" : `<p class="gv-coin-empty">${phase === "raise" ? "Fills in as votes come in once voting opens." : "No votes yet."}</p>`}
          ${shareText ? `<a class="bp-btn-ghost gv-share" href="https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://www.arcircle.app/circle#governance")}&via=ARCIRCLEonArc" target="_blank" rel="noopener">Share the result</a>` : ""}
        </div>`}
      <div class="gv-bar">
        <div class="gv-phases">
          ${ph("pre", "Pre-vote", pv.ideas ? `<span data-no-i18n>${pv.ideas}</span> <span>ideas</span> · <span data-no-i18n>${pv.votes}</span> <span>votes</span>` : "Open to everyone, free", preOpen ? "now" : "done")}
          ${ph("cands", "Candidates", `<span data-no-i18n>${published}/${NC}</span> <span>published</span>`, published === NC ? "done" : published > 0 || (phase !== "raise" && !preOpen) ? "now" : "")}
          ${ph("vote", bm ? "Burn-to-vote" : "Voting", bm ? "Until the raise closes" : "48 hours after the close", phase === "voting" && published > 0 ? "now" : phase === "closed" ? "done" : "")}
          ${ph("result", "Result", "The top option in each", phase === "closed" ? "now" : "")}
        </div>
        ${clock ? `<div class="gv-clock">${clock}</div>` : ""}
        ${bm ? `<div class="gv-burned"><span>$ARCIRCLE burned</span><b data-no-i18n>${fmtEth(burnedAll, 0)}</b><small><span data-no-i18n>${votesAll.toString()}</span> <span>votes</span> · <span>1 vote = 1,000</span></small></div>` : ""}
      </div>
      <div class="gv-grid gv-grid-me"${bm && published === 0 && phase !== "closed" ? ' style="display:none"' : ""}>
        <div class="gv-me">
          <small class="gv-k">Your vote</small>
          ${meHtml}
        </div>
      </div>`;
  }

  if (!wrap) return;
  const canPropose = isRecipient && phase !== "closed";
  const canVote = bm ? phase === "voting" && bLive && !!state.account : phase === "voting" && mine > 0n;
  if (_govBurn && (!canVote || !g.categories[_govBurn.cat] || !g.categories[_govBurn.cat].options[_govBurn.opt])) _govBurn = null;

  const cards = g.categories.map((c) => {
    const def = CIRCLEPAD_VOTE_CATEGORIES[c.id];
    if (!c.set) {
      // An open editor is left exactly as it is (focus, caret, typed rows) — the
      // 15-second refresh only replaces the cards around it.
      if (canPropose) return { keep: "editor", html: `<div class="bp-gov-cat gv-unset" id="gv-cat-${c.id}" data-kind="${def.kind}" data-keep="editor"><div class="bp-gov-cat-head"><span class="bp-gov-cat-title">${govEsc(c.label)}</span></div>${govEditorHtml(def)}</div>` };
      return `<div class="bp-gov-cat gv-unset" id="gv-cat-${c.id}" data-kind="${def.kind}"><div class="bp-gov-cat-head"><span class="bp-gov-cat-title">${govEsc(c.label)}</span></div><div class="bp-empty gv-unset-row"><span>Candidates not published yet.</span>${phase !== "closed" ? `<button type="button" class="gv-suggest" data-gv="idea" data-cat="${c.id}">Suggest one</button>` : ""}</div></div>`;
    }
    const sum = c.options.reduce((a, o) => a + o.weight, 0n);
    const pctOf = (w) => (sum > 0n ? (Number((w * 10000n) / sum) / 100).toFixed(1) : "0.0");
    const turnout = total > 0n ? Math.min(100, Number((sum * 1000n) / total) / 10) : 0;
    const lead = govLeader(c);
    // burn mode: most votes first (ties keep the published order, like the contract),
    // a crown on the leader and how far each of the others is from the lead
    const order = c.options.map((_o, i) => i);
    if (bm && phase !== "raise") order.sort((a, b) => (c.options[b].weight > c.options[a].weight ? 1 : c.options[b].weight < c.options[a].weight ? -1 : a - b));
    const second = bm && lead ? c.options.reduce((m, o, i) => (i !== lead.i && o.weight > m ? o.weight : m), 0n) : 0n;
    const prevLead = _govLeadPrev.get(c.id);
    const newLead = !!(bm && lead && lead.weight > 0n && prevLead != null && prevLead !== lead.i);
    if (bm && lead && lead.weight > 0n) _govLeadPrev.set(c.id, lead.i);
    const optionsHtml = order.map((i) => {
      const o = c.options[i];
      const pct = pctOf(o.weight);
      if (bm) {
        const mineN = o.mine || 0n;
        const isLead = !!(lead && lead.weight > 0n && lead.i === i);
        let gap = "";
        if (phase === "voting" && lead && lead.weight > 0n) {
          if (isLead) gap = `<span class="gv-gap lead"><span>Leading by</span> <b data-no-i18n>${(lead.weight - second).toString()}</b></span>`;
          else { const need = lead.weight - o.weight + (i > lead.i ? 1n : 0n); gap = `<span class="gv-gap"><b data-no-i18n>${need.toString()}</b> <span>${need === 1n ? "more vote to lead" : "more votes to lead"}</span></span>`; }
        }
        const crown = isLead ? `<span class="gv-crown${newLead ? " new" : ""}" title="Leading" aria-label="Leading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg></span>` : "";
        const open = _govBurn && _govBurn.cat === c.id && _govBurn.opt === i;
        const btn = !canVote ? "" : open ? "" : `<button type="button" class="bp-gov-vote-btn" data-category="${c.id}" data-option="${i}" ${avail === 0n ? "disabled" : ""}>${mineN > 0n ? "Add votes" : "Vote"}</button>`;
        return `
        <div class="bp-gov-option${mineN > 0n ? " bp-gov-option-mine" : ""}${isLead ? " gv-lead" : ""}${phase === "closed" && isLead ? " gv-win" : ""}${open ? " gv-open" : ""}" data-category="${c.id}" data-option="${i}">
          <div class="bp-gov-option-row">
            ${crown}<span class="bp-gov-option-text" data-no-i18n>${govOptionHtml(def.kind, o.text)}</span>${isLead && newLead ? `<span class="gv-flip" role="status">Takes the lead!</span>` : ""}${mineN > 0n ? `<span class="bp-gov-mine-tag"><span>yours</span> <span data-no-i18n>${mineN.toString()}</span></span>` : ""}
            <span class="gv-pw"><span class="bp-gov-option-pct" data-no-i18n>${pct}%</span><small><span data-no-i18n>${o.weight.toString()}</span> <span>${o.weight === 1n ? "vote" : "votes"}</span></small></span>
          </div>
          <div class="bp-gov-option-bar"><div class="bp-gov-option-fill" style="width:${pct}%"></div></div>
          ${gap}${btn}${open ? govBurnPanel(_govBurn, avail, g.burn) : ""}
        </div>`;
      }
      const isMine = c.myVoteIndex === i;
      const label = isMine ? "Voted" : c.myVoteIndex !== null ? "Change vote" : "Vote";
      const btn = canVote ? `<button type="button" class="bp-gov-vote-btn" data-category="${c.id}" data-option="${i}" ${isMine ? "disabled" : ""}>${label}</button>` : "";
      return `
        <div class="bp-gov-option${isMine ? " bp-gov-option-mine" : ""}${phase === "closed" && lead && lead.i === i ? " gv-win" : ""}" data-category="${c.id}" data-option="${i}">
          <div class="bp-gov-option-row">
            <span class="bp-gov-option-text" data-no-i18n>${govOptionHtml(def.kind, o.text)}</span>${isMine ? '<span class="bp-gov-mine-tag">your vote</span>' : ""}
            <span class="gv-pw"><span class="bp-gov-option-pct" data-no-i18n>${pct}%</span><small data-no-i18n>${fmtEth(o.weight, 2)} USDC</small></span>
          </div>
          <div class="bp-gov-option-bar"><div class="bp-gov-option-fill" style="width:${pct}%"></div></div>
          ${btn}
        </div>`;
    }).join("");
    const head = bm ? `<div class="bp-gov-cat-head"><span class="bp-gov-cat-title">${govEsc(c.label)}</span>
      <span class="gv-turnout">${sum > 0n ? `<b data-no-i18n>${sum.toString()}</b> <span>votes</span> · <b data-no-i18n>${fmtEth(sum * unit, 0)}</b> <span>$ARCIRCLE burned</span>` : `<b data-no-i18n>${c.options.length}</b> <span>candidates</span>`}</span>
      ${c.myVoteIndex !== null ? `<span class="gv-done">Voted</span>` : ""}</div>` : `<div class="bp-gov-cat-head"><span class="bp-gov-cat-title">${govEsc(c.label)}</span>
      ${phase !== "raise" && total > 0n ? `<span class="gv-turnout"><b data-no-i18n>${turnout.toFixed(turnout < 10 ? 1 : 0)}%</b> <span>of the raise has voted</span></span>` : `<span class="gv-turnout"><b data-no-i18n>${c.options.length}</b> <span>candidates</span></span>`}
      ${c.myVoteIndex !== null ? `<span class="gv-done">Voted</span>` : ""}</div>`;
    return `<div class="bp-gov-cat" id="gv-cat-${c.id}" data-kind="${def.kind}">${head}<div class="bp-gov-options">${optionsHtml}</div></div>`;
  });
  if (wrap.children.length !== cards.length || [...wrap.children].some((el, i) => el.id !== `gv-cat-${i}`)) {
    wrap.innerHTML = cards.map((x) => (typeof x === "string" ? x : x.html)).join("");
    return;
  }
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  cards.forEach((x, i) => {
    const el = wrap.children[i];
    if (typeof x !== "string" && el.dataset.keep === x.keep) return;
    // FLIP: rows that change places glide to their new spot instead of jumping
    const before = still ? null : new Map([...el.querySelectorAll(".bp-gov-option")].map((o) => [o.dataset.option, o.getBoundingClientRect().top]));
    el.outerHTML = typeof x === "string" ? x : x.html;
    if (!before || !before.size) return;
    const now = document.getElementById(`gv-cat-${i}`);
    if (!now) return;
    now.querySelectorAll(".bp-gov-option").forEach((o) => {
      const was = before.get(o.dataset.option);
      if (was == null) return;
      const dy = was - o.getBoundingClientRect().top;
      if (Math.abs(dy) < 2) return;
      o.style.transform = `translateY(${dy}px)`; o.style.transition = "none";
      requestAnimationFrame(() => requestAnimationFrame(() => { o.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)"; o.style.transform = ""; }));
      o.addEventListener("transitionend", () => { o.style.transition = ""; }, { once: true });
    });
  });
  document.dispatchEvent(new CustomEvent("circlepad:govpaint"));
}

// ---- burn & vote: how many votes, what it burns ----
function govBurnPanel(b, avail, info) {
  const unit = GOV_PER_VOTE * 10n ** 18n;
  const n = BigInt(Math.max(1, b.n || 1));
  const cost = n * unit;
  const needApprove = !info || info.allowance == null || BigInt(info.allowance) < cost;
  const label = b.busy || (needApprove ? "Approve $ARCIRCLE (1/2)" : "Burn & vote");
  const quick = [1n, 5n, 10n].filter((x) => x <= avail).concat(avail > 10n ? [avail] : []);
  return `<div class="gv-bn" role="group">
    <div class="gv-bn-row">
      <button type="button" class="gv-bn-step" data-gv="bn-minus" aria-label="One vote fewer" ${n <= 1n || b.busy ? "disabled" : ""}>−</button>
      <span class="gv-bn-n"><b data-no-i18n>${n.toString()}</b> <span>${n === 1n ? "vote" : "votes"}</span></span>
      <button type="button" class="gv-bn-step" data-gv="bn-plus" aria-label="One more vote" ${n >= avail || b.busy ? "disabled" : ""}>+</button>
      <span class="gv-bn-quick">${quick.map((x) => `<button type="button" data-gv="bn-set" data-n="${x.toString()}" ${b.busy ? "disabled" : ""}${x === avail && x > 10n ? "" : ' data-no-i18n'}>${x === avail && x > 10n ? "Max" : x.toString()}</button>`).join("")}</span>
    </div>
    <p class="gv-bn-cost"><span>Burns</span> <b data-no-i18n>${fmtEth(cost, 0)} $ARCIRCLE</b> <span>for good — sent to</span> <code data-no-i18n>0x…dEaD</code></p>
    <div class="gv-bn-acts"><button type="button" class="bp-btn-ghost" data-gv="bn-cancel" ${b.busy ? "disabled" : ""}>Cancel</button><button type="button" class="bp-btn-primary" data-gv="bn-go" ${b.busy ? "disabled" : ""}>${govEsc(label)}</button></div>
    ${needApprove && !b.busy ? `<small class="gv-bn-note">First, a one-time approval lets the vote contract burn $ARCIRCLE from your wallet — only when you vote.</small>` : ""}
  </div>`;
}
function govRepaint() { if (_govLast) renderCirclepadGovernance(_govLast); }
// the pre-vote's counts feed the Governance stepper (circlepad-ideas.js)
document.addEventListener("circlepad:prevote", () => govRepaint());
async function castBurnVote() {
  const b = _govBurn, g = _govLast;
  if (!b || !g) return;
  if (!state.account) { if (typeof connectWallet === "function") await connectWallet(); if (!state.account) return; }
  const unit = GOV_PER_VOTE * 10n ** 18n;
  const n = BigInt(b.n || 1), cost = n * unit;
  const c = g.categories[b.cat], o = c && c.options[b.opt];
  if (!o) return;
  const def = CIRCLEPAD_VOTE_CATEGORIES[b.cat];
  const shown = def.kind === "date" && govDate(o.text) ? govFmtDate(govDate(o.text)) : def.kind === "ticker" ? "$" + String(o.text).replace(/^\$/, "") : def.kind === "logo" ? "this logo" : String(o.text).split("\n")[0];
  const ok = await cpConfirm({ title: `Burn ${fmtEth(cost, 0)} $ARCIRCLE for ${n} ${n === 1n ? "vote" : "votes"}?`, body: `${c.label}: ${shown}. The tokens go to the dead address — votes can't be changed or taken back.`, ok: "Burn & vote", danger: true });
  if (!ok) return;
  const set = (t) => { b.busy = t; govRepaint(); };
  try {
    await ensureArcForWrite();
    const tok = new ethers.Contract(CONFIG.ARCIRCLE_TOKEN, GOV_ERC20_ABI, state.signer);
    let tx;
    if (govDirect()) {
      // no contract and no approval: one transfer to 0x…dEaD, the choice coded in the amount
      set("Confirm the burn in wallet…");
      tx = await tok.transfer(GOV_DEAD, govVoteAmount(b.cat, b.opt, n));
    } else {
    const allow = await tok.allowance(state.account, CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS);
    if (allow < cost) {
      set("Approve in wallet…");
      const tx = await tok.approve(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS, ethers.MaxUint256);
      set("Confirming…");
      await tx.wait();
      if (g.burn) g.burn.allowance = ethers.MaxUint256;
    }
    set("Confirm the burn in wallet…");
    const bv = new ethers.Contract(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS, CIRCLEPAD_BURNVOTE_ABI, state.signer);
    tx = await bv.vote(b.cat, b.opt, n);
    }
    set("Burning…");
    await tx.wait();
    _govBurn = null;
    cpToast(`${n} ${n === 1n ? "vote" : "votes"} cast — ${fmtEth(cost, 0)} $ARCIRCLE burned.`, "ok");
    document.dispatchEvent(new CustomEvent("circlepad:burnvote", { detail: { category: b.cat, option: b.opt, votes: Number(n), tx: tx.hash, text: o.text, kind: def.kind } }));
    await refreshCirclepadGovernance();
  } catch (err) {
    console.error("CirclePad: burn vote failed", err);
    cpToast(cpErrText(err, "Vote failed or was rejected."), "bad");
    if (_govBurn) { _govBurn.busy = null; govRepaint(); }
  }
}

// ---- the recipient's editor: typed rows instead of one comma list ----
function govEditorHtml(def) {
  const drafts = _govDrafts.get(def.id) || ["", ""];
  _govDrafts.set(def.id, drafts);
  const row = (v, i) => {
    let input;
    if (def.kind === "roadmap") input = `<textarea rows="3" maxlength="${def.max}" data-i="${i}" placeholder="Phase 1 — what gets built first">${govEsc(v)}</textarea>`;
    else if (def.kind === "date") input = `<input type="datetime-local" data-i="${i}" value="${govEsc(v)}">`;
    else if (def.kind === "logo") input = `<input type="url" maxlength="${def.max}" data-i="${i}" value="${govEsc(v)}" placeholder="https://… or ipfs://… (square image)"><label class="gvi-up"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-gv-up="${i}"><span>Upload</span></label><span class="gv-ed-prev">${govLogoUrl(v) ? `<img src="${govEsc(govLogoUrl(v))}" alt="" referrerpolicy="no-referrer">` : ""}</span>`;
    else if (def.kind === "chain") input = `<select data-i="${i}"><option value="">—</option>${govChains().map((c) => `<option value="${govEsc(c)}"${c === v ? " selected" : ""}>${govEsc(c)}</option>`).join("")}</select>`;
    else input = `<input type="text" maxlength="${def.max}" data-i="${i}" value="${govEsc(v)}" placeholder="${def.kind === "ticker" ? "TICKER" : "Coin name"}"${def.kind === "ticker" ? ' autocapitalize="characters" spellcheck="false"' : ""}>`;
    return `<div class="gv-ed-row"><span class="gv-ed-n" data-no-i18n>${i + 1}</span>${input}${drafts.length > 2 ? `<button type="button" class="gv-ed-x" data-gv="del" data-i="${i}" aria-label="Remove">×</button>` : ""}</div>`;
  };
  return `<div class="gv-ed" data-category="${def.id}">
    <div class="gv-ed-rows">${drafts.map(row).join("")}</div>
    ${drafts.length < GOV_MAX_OPTIONS ? `<button type="button" class="gv-ed-add" data-gv="add">+ Add an option</button>` : ""}
    <div class="gv-ed-foot"><span class="gv-ed-hint">Only you (the recipient wallet) see this. Tap "Use" on a community idea above to fill a row. ${govDirect() ? "You sign the list with your wallet (no gas) and it's published once — it can't be edited afterwards." : "Candidates go on-chain once and can't be edited afterwards."}</span>
      <button type="button" class="bp-gov-propose-btn" data-gv="publish" data-category="${def.id}">Publish candidates</button></div>
  </div>`;
}
function govReRenderEditor(cat) {
  if (!_govLast) return;
  const el = document.getElementById(`gv-cat-${cat}`);
  const def = CIRCLEPAD_VOTE_CATEGORIES[cat];
  const ed = el && el.querySelector(".gv-ed");
  if (ed) ed.outerHTML = govEditorHtml(def);
}
// datetime-local gives local wall-clock time; the chain gets UTC.
function govDraftToOption(def, v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (def.kind === "ticker") return s.replace(/^\$/, "").toUpperCase();
  if (def.kind === "date") { const d = new Date(s); return isNaN(d) ? "" : d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
  return s;
}
function govValidate(def, opts) {
  if (opts.length < 2) return "Enter at least 2 candidates.";
  const seen = new Set();
  for (const o of opts) {
    const k = o.toLowerCase();
    if (seen.has(k)) return "Two candidates are the same.";
    seen.add(k);
    if (o.length > def.max) return "One candidate is too long.";
    if (def.kind === "ticker" && !/^[A-Z0-9]{1,10}$/.test(o)) return "Tickers use letters and numbers only, up to 10.";
    if (def.kind === "logo" && !govLogoUrl(o)) return "Each logo needs an https:// or ipfs:// image link.";
    if (def.kind === "chain" && !govChains().includes(o)) return "Pick each launch chain from the list.";
    if (def.kind === "date") { const d = govDate(o); if (!d) return "Pick a date and time for each candidate."; if (d.getTime() / 1000 < govNow()) return "Launch dates need to be in the future."; }
  }
  return null;
}

// "Use" on a community idea (circlepad-ideas.js): drop it into the recipient's editor.
window.circlepadGovUseIdea = function (cat, text) {
  const def = CIRCLEPAD_VOTE_CATEGORIES[cat];
  if (!def) return;
  let v = String(text || "");
  if (def.kind === "date") {
    const d = govDate(v);
    if (d) { const z = (n) => String(n).padStart(2, "0"); v = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
  }
  const drafts = _govDrafts.get(cat) || ["", ""];
  if (drafts.some((x) => String(x).trim().toLowerCase() === v.trim().toLowerCase())) { cpToast("That one is already in the list.", "bad"); return; }
  const empty = drafts.findIndex((x) => !String(x).trim());
  if (empty >= 0) drafts[empty] = v;
  else if (drafts.length < GOV_MAX_OPTIONS) drafts.push(v);
  else { cpToast("The list is full — remove one first.", "bad"); return; }
  _govDrafts.set(cat, drafts);
  govReRenderEditor(cat);
  const el = document.getElementById(`gv-cat-${cat}`);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("gv-flash"); void el.offsetWidth; el.classList.add("gv-flash"); }
  cpToast("Added to the candidates — publish when the list is ready.", "ok");
};

// "Fill every category from the ideas" (circlepad-ideas.js): the recipient's
// editors get the whole list at once, dates in local time for the inputs.
// Nothing goes on-chain until Publish is pressed in each category.
window.circlepadGovFill = function (cat, texts) {
  const def = CIRCLEPAD_VOTE_CATEGORIES[cat];
  if (!def) return 0;
  const z = (n) => String(n).padStart(2, "0");
  const seen = new Set(), out = [];
  for (const t of texts) {
    let v = String(t || "").trim();
    if (!v) continue;
    if (def.kind === "ticker") v = v.replace(/^\$/, "").toUpperCase();
    if (def.kind === "date") { const d = govDate(v); if (!d) continue; v = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
    const k = v.toLowerCase();
    if (seen.has(k) || v.length > def.max) continue;
    seen.add(k); out.push(v);
    if (out.length >= GOV_MAX_OPTIONS) break;
  }
  while (out.length < 2) out.push("");
  _govDrafts.set(cat, out);
  govReRenderEditor(cat);
  return out.filter(Boolean).length;
};

function wireCirclepadGovernance(root) {
  root.addEventListener("change", async (e) => {
    const f = e.target.closest("[data-gv-up]");
    if (!f || typeof window.circlepadUploadLogo !== "function") return;
    const ed = f.closest(".gv-ed");
    const cat = Number(ed.dataset.category), i = Number(f.dataset.gvUp);
    const lab = f.closest(".gvi-up"); if (lab) lab.classList.add("busy");
    const url = await window.circlepadUploadLogo(f.files && f.files[0]).catch(() => null);
    if (lab) lab.classList.remove("busy");
    if (!url) return;
    const drafts = _govDrafts.get(cat) || ["", ""];
    drafts[i] = url; _govDrafts.set(cat, drafts);
    govReRenderEditor(cat);
  });
  root.addEventListener("input", (e) => {
    const ed = e.target.closest(".gv-ed");
    if (!ed || e.target.dataset.i == null) return;
    const cat = Number(ed.dataset.category), i = Number(e.target.dataset.i);
    const drafts = _govDrafts.get(cat) || [];
    let v = e.target.value;
    if (CIRCLEPAD_VOTE_CATEGORIES[cat].kind === "ticker") { v = v.toUpperCase().replace(/[^A-Z0-9$]/g, ""); if (e.target.value !== v) e.target.value = v; }
    drafts[i] = v;
    _govDrafts.set(cat, drafts);
    if (CIRCLEPAD_VOTE_CATEGORIES[cat].kind === "logo") {
      const prev = e.target.parentNode.querySelector(".gv-ed-prev");
      const u = govLogoUrl(v);
      if (prev) prev.innerHTML = u ? `<img src="${govEsc(u)}" alt="" referrerpolicy="no-referrer">` : "";
    }
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-gv], .bp-gov-vote-btn");
    if (!b) return;
    if (b.classList.contains("bp-gov-vote-btn")) {
      if (govBurnMode()) { _govBurn = { cat: Number(b.dataset.category), opt: Number(b.dataset.option), n: 1, busy: null }; govRepaint(); return; }
      castCirclepadVote(Number(b.dataset.category), Number(b.dataset.option)); return;
    }
    const what = b.dataset.gv;
    if (what && what.startsWith("bn-") && _govBurn) {
      const g = _govLast, unit = GOV_PER_VOTE * 10n ** 18n;
      const avail = g && g.burn && g.burn.bal != null ? Number(BigInt(g.burn.bal) / unit) : 1;
      if (what === "bn-minus") _govBurn.n = Math.max(1, (_govBurn.n || 1) - 1);
      else if (what === "bn-plus") _govBurn.n = Math.min(avail, (_govBurn.n || 1) + 1);
      else if (what === "bn-set") _govBurn.n = Math.max(1, Math.min(avail, Number(b.dataset.n) || 1));
      else if (what === "bn-cancel") _govBurn = null;
      else if (what === "bn-go") { castBurnVote(); return; }
      govRepaint();
      return;
    }
    if (what === "connect") { if (typeof connectWallet === "function") await connectWallet(); return; }
    if (what === "idea") { if (window.circlepadIdeas) window.circlepadIdeas.open(Number(b.dataset.cat)); return; }
    if (what === "contribute") {
      const nav = document.querySelector('.bp-nav-item[data-tab="home"]');
      if (nav) nav.click();
      setTimeout(() => {
        if (window.matchMedia("(max-width: 900px)").matches && window.circlepadPlus && window.circlepadPlus.openSheet) { window.circlepadPlus.openSheet(); return; }
        const inp = document.getElementById("bp-contribute-amount");
        if (inp) { inp.scrollIntoView({ behavior: "smooth", block: "center" }); inp.focus({ preventScroll: true }); }
      }, 250);
      return;
    }
    const ed = b.closest(".gv-ed");
    if (!ed) return;
    const cat = Number(ed.dataset.category);
    const drafts = _govDrafts.get(cat) || ["", ""];
    if (what === "add" && drafts.length < GOV_MAX_OPTIONS) { drafts.push(""); _govDrafts.set(cat, drafts); govReRenderEditor(cat); const ins = document.querySelectorAll(`#gv-cat-${cat} .gv-ed [data-i]`); const last = [...ins].filter((x) => x.tagName !== "BUTTON").pop(); if (last) last.focus(); return; }
    if (what === "del") { drafts.splice(Number(b.dataset.i), 1); while (drafts.length < 2) drafts.push(""); _govDrafts.set(cat, drafts); govReRenderEditor(cat); return; }
    if (what === "publish") proposeCirclepadOptions(cat);
  });
}

function tickGovClocks() {
  document.querySelectorAll("[data-gv-to]").forEach((el) => {
    const left = Number(el.dataset.gvTo) - govNow();
    el.textContent = govLeft(left);
    if (left <= 0 && !el.dataset.fired) { el.dataset.fired = "1"; setTimeout(refreshCirclepadGovernance, 1500); }
  });
}

let _circlepadGovLoadedOnce = false;

async function refreshCirclepadGovernance() {
  if (!circlepadVoteConfigured()) return;
  const statusEl = document.getElementById("bp-gov-live-status");
  if (!_circlepadGovLoadedOnce && statusEl) statusEl.textContent = "Loading…";

  let g = null;
  for (let attempt = 0; attempt < 3 && !g; attempt++) {
    try {
      // A hung RPC call would otherwise leave this on "Loading…" forever —
      // race it against a timeout so a stall surfaces like any other failure.
      g = await Promise.race([
        fetchCirclepadGovernanceState(),
        new Promise((_res, rej) => setTimeout(() => rej(new Error("timed out after 10s")), 10000)),
      ]);
    } catch (err) {
      console.error(`CirclePad: failed to load governance data (attempt ${attempt + 1})`, err);
      if (attempt < 2) await new Promise((res) => setTimeout(res, 600));
    }
  }

  if (!g) {
    if (!_circlepadGovLoadedOnce && statusEl) statusEl.textContent = "Couldn't load governance data — retrying shortly.";
    return;
  }
  _circlepadGovLoadedOnce = true;
  renderCirclepadGovernance(g);
  document.dispatchEvent(new CustomEvent("circlepad:gov", { detail: { phase: govPhase(g) } }));
  // Same stale-while-revalidate cache the round state and leaderboard use,
  // keyed by the vote contract. myVoteIndex is wallet-specific and dropped.
  circlepadSaveCache("gov", {
    votingOpen: g.votingOpen,
    votingEnds: g.votingEnds,
    deadline: g.deadline,
    recipient: g.recipient,
    categories: g.categories.map((c) => ({ ...c, myVoteIndex: null, options: c.options.map((o) => ({ ...o, mine: 0n })) })),
    burn: g.burn ? { live: g.burn.live, totalBurned: g.burn.totalBurned ?? 0n, totalVotes: g.burn.totalVotes ?? 0n } : null,
    savedAt: Date.now(),
  });
}

// Paints the Governance tab from the last visit's cache — synchronous, no
// RPC — so it's on screen immediately; the real fetch then overwrites it.
function paintCirclepadGovernanceFromCache() {
  const cached = circlepadLoadCache("gov");
  if (!cached || !Array.isArray(cached.categories) || cached.categories.length < CIRCLEPAD_VOTE_CATEGORIES.length) return false;
  const votingEnds = cached.votingEnds ?? 0n;
  // Never trust a cached "open" past the cached close time.
  const votingOpen = !!cached.votingOpen && govNow() < Number(votingEnds);
  // a cache from before burn voting (or for another vote contract) isn't reused
  if (govBurnMode() && !cached.burn) return false;
  if (govBurnLive() && !cached.burn.live) return false;
  renderCirclepadGovernance({ votingOpen, votingEnds, deadline: cached.deadline ?? 0n, recipient: cached.recipient || ethers.ZeroAddress, categories: cached.categories, burn: cached.burn || null });
  _circlepadGovLoadedOnce = true; // don't replace the cached paint with "Loading…"
  return true;
}

// Recipient-only: publishes the candidates for one category, once.
async function proposeCirclepadOptions(category) {
  if (!state.account) {
    if (typeof connectWallet === "function") await connectWallet();
    if (!state.account) return;
  }
  const def = CIRCLEPAD_VOTE_CATEGORIES[category];
  const options = (_govDrafts.get(category) || []).map((v) => govDraftToOption(def, v)).filter(Boolean);
  const bad = govValidate(def, options);
  if (bad) { cpToast(bad, "bad"); return; }
  const shown = options.map((o) => (def.kind === "date" && govDate(o) ? govFmtDate(govDate(o)) : o)).join("  ·  ");
  const ok = await cpConfirm({ title: "Publish these candidates? They can't be edited later.", body: shown, ok: "Publish" });
  if (!ok) return;

  const btn = document.querySelector(`#gv-cat-${category} [data-gv="publish"]`);
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Confirm in wallet…"; }
  try {
    await ensureArcForWrite();
    if (govDirect()) {
      // a direct round: the round wallet signs the list (no gas); the site keeps it with the signature
      const signature = await state.signer.signMessage(govCandMessage(category, options));
      if (btn) btn.textContent = "Publishing…";
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cgov-cands", round: String(CONFIG.CIRCLEPAD_ESCROW_ADDRESS).toLowerCase(), cat: category, options, signature }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Publishing failed.");
    } else {
    const vote = circlepadVoteWrite();
    const tx = await vote.proposeOptions(category, options);
    if (btn) btn.textContent = "Confirming…";
    await tx.wait();
    }
    _govDrafts.delete(category);
    cpToast("Candidates published.", "ok");
    await refreshCirclepadGovernance();
  } catch (err) {
    console.error("CirclePad: proposeOptions failed", err);
    cpToast(cpErrText(err, "Publishing failed or was rejected."), "bad");
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function castCirclepadVote(category, optionIndex) {
  if (!state.account) {
    if (typeof connectWallet === "function") await connectWallet();
    if (!state.account) return;
  }
  const btn = document.querySelector(`.bp-gov-vote-btn[data-category="${category}"][data-option="${optionIndex}"]`);
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Confirm in wallet…"; }
  try {
    await ensureArcForWrite();
    const vote = circlepadVoteWrite();
    const tx = await vote.vote(category, optionIndex);
    if (btn) btn.textContent = "Confirming…";
    await tx.wait();
    await refreshCirclepadGovernance();
    // on to the next category still waiting for this wallet's vote
    const g = _govLast;
    const next = g && g.categories.find((c) => c.set && c.myVoteIndex === null);
    const el = next && document.getElementById(`gv-cat-${next.id}`);
    if (el) { cpToast("Vote recorded — next one.", "ok"); el.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else cpToast("Vote recorded.", "ok");
  } catch (err) {
    console.error("CirclePad: vote failed", err);
    cpToast(cpErrText(err, "Vote failed or was rejected."), "bad");
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// Boot — deliberately the last lines in the file, after every const/let
// above has been initialized (see the note near the middle of the file
// for why calling these any earlier breaks the Governance tab).
initCirclepadRound();
initCirclepadGovernance();

// ---- Round alerts: "alert me when it opens" + a calendar reminder for the close ----
// Browser-only: the alert fires while a CirclePad tab is open (the page
// already polls the escrow every 15s); nothing is sent to any server.
(() => {
  const countdown = document.getElementById("bp-round-countdown");
  if (!countdown || typeof applyCirclepadState !== "function") return;
  const KEY = "circlepad.notify.v1";
  const escrow = () => (typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_ESCROW_ADDRESS || "").toLowerCase();
  const armed = () => { try { return localStorage.getItem(KEY) === escrow(); } catch { return false; } };
  const arm = (on) => { try { if (on) localStorage.setItem(KEY, escrow()); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };
  const box = document.createElement("div");
  box.className = "bp-notify";
  countdown.insertAdjacentElement("afterend", box);
  let last = null;
  function ping(title, body) {
    try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "/images/favicon-32.png" }); } catch { /* not supported */ }
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch { /* fine */ } }
    const t = document.title; let n = 0;
    const iv = setInterval(() => { document.title = n++ % 2 ? t : `● ${title}`; if (n > 12) { clearInterval(iv); document.title = t; } }, 900);
  }
  function icsFor(deadline) {
    const d = (x) => new Date(x * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE PAD//CirclePad//EN", "BEGIN:VEVENT",
      `UID:circlepad-${escrow()}-${deadline}@arcircle.app`, `DTSTAMP:${d(Math.floor(Date.now() / 1000))}`,
      `DTSTART:${d(deadline - 3600)}`, `DTEND:${d(deadline)}`,
      "SUMMARY:CirclePad raise closes", "DESCRIPTION:The 72-hour CirclePad raise closes at the end of this event. https://www.arcircle.app/circle",
      "URL:https://www.arcircle.app/circle", "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:CirclePad raise closes soon", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "circlepad-raise-close.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function paint() {
    if (!last) return;
    if (!last.started) {
      box.innerHTML = armed()
        ? `<div class="bp-notify-on"><span class="bp-status-dot bp-live"></span>Alert set — keep a CirclePad tab open and this browser will ping you the moment the raise opens.</div><button type="button" class="bp-notify-link" data-notify="off">Cancel alert</button>`
        : `<button type="button" class="bp-btn-ghost bp-btn-block bp-notify-btn" data-notify="on">Alert me when the raise opens</button>`;
    } else if (last.isOpen) {
      if (armed()) { arm(false); ping("The CirclePad raise is open", "Contributions are live for 72 hours."); }
      box.innerHTML = `<button type="button" class="bp-notify-link" data-notify="ics">Add the close to my calendar</button>`;
    } else box.innerHTML = "";
  }
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-notify]");
    if (!b) return;
    const k = b.dataset.notify;
    if (k === "on") {
      arm(true);
      // Ask for OS notifications too, but don't wait on the prompt.
      try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch { /* fine */ }
    } else if (k === "off") arm(false);
    else if (k === "ics" && last && last.deadline) icsFor(Number(last.deadline));
    paint();
  });
  const orig = applyCirclepadState;
  // eslint-disable-next-line no-global-assign
  applyCirclepadState = function (s, opts) { orig(s, opts); if (s && !(opts && opts.accountUnknown && last)) { last = s; try { paint(); } catch (err) { console.warn(err); } } };
})();
;
/* ---- circlepad-conv.js ---- */
/* global ethers */
// circlepad-conv.js — CirclePad's USDC amounts also shown as "≈ ETH" or "≈ SOL".
// The raise stays in USDC; Round #2 launches on Robinhood Chain (ETH) and later rounds may launch on Solana, so the
// main amounts carry a converted line at today's price (USDC counted as $1). One choice for the whole page — ETH or
// SOL — kept in this browser. Prices: /api/social?fx=1 (api/_fx.mjs), refreshed every two minutes.
//   cpConv.html(weiOrString)  → <span class="cp-alt" data-usd="…">≈ 0.0412 ETH</span>   (18-decimal USDC amounts)
//   cpConv.htmlUsd(number)    → the same from a dollar number
//   cpConv.toggleHtml()       → the ETH | SOL switch with the rate it uses
//   cpConv.refresh()          → repaint every converted line (price or choice changed)
window.cpConv = (function () {
  "use strict";
  const KEY = "arcircle.circlepad.unit";
  let unit = "eth";
  try { const u = localStorage.getItem(KEY); if (u === "eth" || u === "sol") unit = u; } catch (e) { /* default */ }
  let px = { eth: null, sol: null, at: 0 };
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  /// an 18-decimal USDC amount (bigint, decimal string of wei) → dollars
  function usdOf(v) {
    try {
      if (typeof v === "bigint") return Number(ethers.formatEther(v));
      if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(ethers.formatEther(BigInt(v)));
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }
  function fmt(x) {
    const a = Math.abs(x);
    const d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
    return x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: a > 0 && a < 1000 ? Math.min(2, d) : 0 });
  }
  const conv = (usd, u) => { const p = px[u || unit]; return p ? usd / p : null; };
  function text(usd, u) {
    u = u || unit;
    const v = conv(usd, u);
    return v == null ? "" : `≈ ${fmt(v)} ${u.toUpperCase()}`;
  }
  const span = (usd, cls) => `<span class="cp-alt${cls ? " " + cls : ""}" data-usd="${usd}" data-no-i18n${text(usd) ? "" : " hidden"}>${esc(text(usd))}</span>`;
  const html = (amount, cls) => span(usdOf(amount), cls);
  const htmlUsd = (usd, cls) => span(Number(usd) || 0, cls);
  function rateText() {
    const p = px[unit];
    if (!p) return tr("Price loading…");
    return `1 ${unit.toUpperCase()} = $${p.toLocaleString("en-US", { maximumFractionDigits: p >= 100 ? 0 : 2 })}`;
  }
  const toggleHtml = () => `<span class="cp-unit" role="group" aria-label="${esc(tr("Also show amounts in"))}"><span class="cp-unit-l">${esc(tr("Also in"))}</span>${["eth", "sol"].map((u) => `<button type="button" data-cp-unit="${u}" aria-pressed="${u === unit}" data-no-i18n>${u.toUpperCase()}</button>`).join("")}<small class="cp-unit-rate" data-no-i18n>${esc(rateText())}</small></span>`;
  function refresh(root) {
    (root || document).querySelectorAll(".cp-alt[data-usd]").forEach((el) => {
      const t = text(Number(el.dataset.usd));
      if (el.textContent !== t) el.textContent = t;
      el.hidden = !t;
    });
    document.querySelectorAll("[data-cp-unit]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cpUnit === unit)));
    document.querySelectorAll(".cp-unit-rate").forEach((el) => { el.textContent = rateText(); });
    document.querySelectorAll("[data-cp-conv-in]").forEach((el) => { el.textContent = el.dataset.usd ? both(Number(el.dataset.usd)) : ""; });
  }
  /// "≈ 0.041 ETH · ≈ 0.61 SOL" — under the amount someone is typing
  const both = (usd) => (usd > 0 ? ["eth", "sol"].map((u) => text(usd, u)).filter(Boolean).join(" · ") : "");
  function setUnit(u) {
    if (u !== "eth" && u !== "sol") return;
    unit = u;
    try { localStorage.setItem(KEY, u); } catch (e) { /* this visit only */ }
    refresh();
    document.dispatchEvent(new CustomEvent("circlepad:unit", { detail: { unit } }));
  }
  async function load() {
    try {
      const r = await fetch("/api/social?fx=1", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && (j.eth || j.sol)) { px = { eth: Number(j.eth) || null, sol: Number(j.sol) || null, at: Number(j.at) || 0 }; refresh(); }
    } catch (e) { /* next time */ }
  }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-cp-unit]"); if (b) setUnit(b.dataset.cpUnit); });
  // a contribution box: data-cp-conv-in="<input id>" on an element shows what the typed amount is in ETH and SOL
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t || !t.id) return;
    document.querySelectorAll(`[data-cp-conv-in="${t.id}"]`).forEach((el) => { const v = Number(String(t.value || "").replace(/,/g, "")); el.dataset.usd = v > 0 ? String(v) : ""; el.textContent = v > 0 ? both(v) : ""; });
  });
  document.addEventListener("arc:lang", () => refresh());
  load();
  setInterval(() => { if (!document.hidden) load(); }, 120000);
  return { html, htmlUsd, text, conv, both, usdOf, toggleHtml, refresh, setUnit, unit: () => unit, prices: () => px, load };
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
/* ---- circlepad-fx.js ---- */
/* global connectWallet, circlepadLoadCache, circlepadEscrowConfigured, CONFIG, applyCirclepadState, renderCirclepadLeaderboard, renderCirclepadGovernance, updateCirclepadCountdown, _circlepadDeadline, _circlepadStarted, _circlepadState, ethers, state, govDate, govFmtDate */
// circlepad-fx.js — CirclePad's round card, layout and motion layer.
// circlepad.js stays the source of truth for the escrow (it reads the chain
// and writes the plain numbers); this file wraps its render functions and
// adds, on top of what they draw:
//   • a progress ring with the raised amount counting up (milestones when
//     the round is uncapped), a live glint while the raise is open
//   • a flip-digit countdown that turns urgent in the final hour
//   • "join the circle" when this wallet's contribution goes up
//   • leaderboard rows that slide to their new rank, vote bars that grow
//   • the Launch process as a full-width timeline with the current stage lit
//   • the 80/5/15 close split drawn as bars that fill when scrolled into view
//   • sidebar tidy-up (coming-soon tabs grouped), quick bar → round actions,
//     hero parallax
(function () {
  "use strict";
  if (!document.body.classList.contains("circlepad-page") || typeof applyCirclepadState !== "function") return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const toNum = (wei) => { try { return Number(ethers.formatEther(wei || 0n)); } catch (e) { return 0; } };
  const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 4 });
  const short$ = (n) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n));
  const clickTab = (tab) => { const b = document.querySelector(`.bp-nav-item[data-tab="${tab}"]`); if (b) b.click(); };
  // a leaderboard row's USDC amount (not the "≈ ETH" line under it, which moves with the price)
  const lbAmt = (r) => { const el = r.querySelector(".bp-lb-amount"); return el && el.firstChild ? el.firstChild.textContent : ""; };
  const MILESTONES = [250, 500, 1e3, 5e3, 1e4, 25e3, 5e4, 1e5, 25e4, 5e5, 1e6, 25e5, 5e6, 1e7];
  let S = null; // last state painted

  // ================= sidebar: group the not-yet-live tabs =================
  // Airdrop and Treasury are live pages now (the policy + the split at today's total)
  const SOON = [];
  (function sidebar() {
    const btns = SOON.map((t) => document.querySelector(`.bp-side-nav .bp-nav-item[data-tab="${t}"]`)).filter(Boolean);
    if (!btns.length) return;
    btns.forEach((b) => b.classList.add("cp-soon-item"));
    const pos = document.querySelector('.bp-side-nav .bp-nav-item[data-tab="position"]');
    if (pos) pos.classList.add("cp-when-live");
    const docs = document.querySelector('.bp-side-nav .bp-nav-item[data-tab="docs"]');
    const line = document.createElement("div");
    line.className = "cp-soon-line";
    line.innerHTML = `<span class="cp-soon-label">Coming soon</span>${btns.map((b) => `<button type="button" data-soon="${b.dataset.tab}">${b.textContent.trim()}</button>`).join('<span aria-hidden="true">·</span>')}`;
    line.addEventListener("click", (e) => { const b = e.target.closest("[data-soon]"); if (b) clickTab(b.dataset.soon); });
    (docs ? docs.parentNode : btns[0].parentNode).appendChild(line);
  })();

  // ================= round ring =================
  const panel = $("bp-round-panel");
  let ring = null, amtEl = null, subEl = null, metaEl = null;
  if (panel) {
    const R = 86, C = 2 * Math.PI * R;
    ring = document.createElement("div");
    ring.className = "cp-ring";
    ring.dataset.state = "idle";
    ring.style.setProperty("--cp-c", C.toFixed(1));
    ring.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">
        <defs><linearGradient id="cpRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f9bff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>
        <circle class="cp-ring-track" cx="100" cy="100" r="${R}"/>
        <circle class="cp-ring-fill" cx="100" cy="100" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
        <circle class="cp-ring-glint" cx="100" cy="100" r="${R}" stroke-dasharray="18 ${(C - 18).toFixed(1)}"/>
        <circle class="cp-ring-inner" cx="100" cy="100" r="66"/>
      </svg>
      <div class="cp-ring-center"><b class="cp-ring-amt" data-no-i18n>0</b><span class="cp-ring-unit">USDC</span><span class="cp-alt cp-ring-alt" data-usd="0" data-no-i18n hidden></span><small class="cp-ring-sub">raised</small></div>`;
    metaEl = document.createElement("div");
    metaEl.className = "cp-ring-meta";
    const status = $("bp-round-status");
    (status || panel.firstChild).insertAdjacentElement(status ? "afterend" : "beforebegin", ring);
    ring.insertAdjacentElement("afterend", metaEl);
    // the ETH | SOL choice for every "≈" line on the page, with the rate it uses
    if (window.cpConv) { const u = document.createElement("div"); u.className = "cp-ring-unitsw"; u.innerHTML = window.cpConv.toggleHtml(); metaEl.insertAdjacentElement("afterend", u); }
    amtEl = ring.querySelector(".cp-ring-amt"); subEl = ring.querySelector(".cp-ring-sub");
    panel.classList.add("cp-has-ring");
  }
  let shown = 0, raf = 0;
  function countTo(to) {
    if (!amtEl) return;
    const from = shown; shown = to;
    if (reduce || from === to) { amtEl.textContent = fmt(to); return; }
    cancelAnimationFrame(raf);
    const t0 = performance.now(), dur = from === 0 ? 900 : 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      amtEl.textContent = fmt(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step); else amtEl.textContent = fmt(to);
    };
    raf = requestAnimationFrame(step);
    if (to > from && from > 0) { ring.classList.remove("cp-bump"); void ring.offsetWidth; ring.classList.add("cp-bump"); }
  }
  function paintRing(s) {
    if (!ring) return;
    const raised = toNum(s.totalRaised), cap = toNum(s.cap);
    let pct, sub, meta;
    if (!s.started) {
      pct = 0; sub = tr(pledged > 0 ? "pledged so far" : "opens soon");
      meta = `<span class="cp-meta-note">${tr("No cap — withdraw your own USDC any time before the raise closes.")}</span>`;
    } else if (cap > 0) {
      pct = Math.min(1, raised / cap); sub = `${tr("Goal")} ${fmt(cap)}`;
      meta = `<span class="cp-meta-note">${Math.round(pct * 100)}% ${tr("of the goal")}</span>`;
    } else {
      const next = MILESTONES.find((m) => m > raised) || MILESTONES[MILESTONES.length - 1];
      pct = Math.min(1, raised / next); sub = tr(s.isOpen ? "raised · uncapped" : "raised in total");
      meta = s.isOpen
        ? `<span class="cp-meta-next">${tr("Next milestone")} <b data-no-i18n>$${short$(next)}</b></span><span class="cp-meta-note">${tr("No cap — withdraw your own USDC any time before the raise closes.")}</span>`
        : `<span class="cp-meta-note">${tr("Final total — the raise has closed.")}</span>`;
      // Crossing a milestone while watching: a quick flash of the full ring.
      const prevRaised = S ? toNum(S.totalRaised) : raised;
      const crossed = MILESTONES.filter((m) => prevRaised < m && raised >= m).pop(); // the biggest one passed
      if (crossed && S && S.started) milestone(crossed);
    }
    const urgent = s.isOpen && _circlepadDeadline && _circlepadDeadline - Date.now() / 1000 < 3600;
    ring.dataset.state = !s.started ? "idle" : s.isOpen ? (urgent ? "urgent" : "live") : "closed";
    ring.style.setProperty("--cp-p", pct.toFixed(4));
    subEl.textContent = sub;
    if (metaEl.__html !== meta) { metaEl.innerHTML = meta; metaEl.__html = meta; }
    countTo(!s.started && pledged > 0 ? pledged : raised);
    const alt = ring.querySelector(".cp-ring-alt");
    if (alt) { alt.dataset.usd = String(!s.started && pledged > 0 ? pledged : raised); if (window.cpConv) window.cpConv.refresh(ring); }
    // Someone else moved money while you watch: the ring surges (or dips
    // for a withdrawal) and the difference floats up out of it.
    if (ringLive && S && S.started && s.started) {
      const d = raised - toNum(S.totalRaised);
      if (Math.abs(d) > 1e-9) delta(d);
    }
    paintTop(s, raised);
  }
  let ringLive = false; // true after the first real (not cached) paint
  function delta(d) {
    if (!ring || reduce) return;
    ring.classList.remove("cp-surge", "cp-dip"); void ring.offsetWidth;
    ring.classList.add(d > 0 ? "cp-surge" : "cp-dip");
    const chip = document.createElement("span");
    chip.className = "cp-delta " + (d > 0 ? "up" : "down");
    chip.setAttribute("data-no-i18n", "");
    chip.textContent = `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))} USDC`;
    ring.appendChild(chip);
    setTimeout(() => chip.remove(), 2200);
  }
  // Before the raise opens the ring shows what has been pledged
  // (circlepad-community.js reports it).
  let pledged = 0;
  window.circlepadFx = {
    setPledged(total) { const t = Number(total) || 0; if (t !== pledged) { pledged = t; if (S) paintRing(S); } },
    mine: () => (S && S.myContribution ? toNum(S.myContribution) : 0),
    setPledgers(list) { pledgers = Array.isArray(list) ? list : []; if (!(S && S.started)) paintContributors(lastRows); },
    coinDrop(fromEl) { flyTo(fromEl, "cp-coin", () => { if (ring) { ring.classList.remove("cp-bump"); void ring.offsetWidth; ring.classList.add("cp-bump"); } }); },
  };
  // A small token flying from a button into the ring (pledge coin, join ring).
  function flyTo(fromEl, cls, done) {
    if (!ring || reduce) { if (done) done(); return; }
    const from = (fromEl || ring).getBoundingClientRect(), to = ring.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = cls;
    el.style.left = `${from.left + from.width / 2}px`; el.style.top = `${from.top + from.height / 2}px`;
    el.style.setProperty("--dx", `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    el.style.setProperty("--dy", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("go"));
    setTimeout(() => { el.remove(); if (done) done(); }, 760);
  }

  // ================= top bar pill + tab title =================
  const baseTitle = document.title;
  let pill = null;
  (function topPill() {
    const bar = document.querySelector(".bp-topbar");
    if (!bar) return;
    pill = document.createElement("button");
    pill.type = "button"; pill.className = "cp-top-pill"; pill.hidden = true;
    pill.innerHTML = `<span class="cp-tp-dot"></span><span class="cp-tp-state"></span><b class="cp-tp-amt" data-no-i18n></b><span class="cp-tp-time" data-no-i18n></span>`;
    pill.addEventListener("click", () => document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: "round" })));
    bar.insertBefore(pill, bar.firstChild);
  })();
  let topShown = -1;
  function paintTop(s, raised) {
    if (s.started) document.title = `${fmt(raised)} USDC ${s.isOpen ? "raised" : "final"} · CirclePad`;
    else document.title = baseTitle;
    if (!pill) return;
    pill.hidden = !s.started && !(pledged > 0);
    pill.dataset.state = !s.started ? "idle" : s.isOpen ? "live" : "closed";
    pill.querySelector(".cp-tp-state").textContent = tr(!s.started ? "Pledged" : s.isOpen ? "LIVE" : "Closed");
    const v = !s.started ? pledged : raised;
    if (v !== topShown) {
      const el = pill.querySelector(".cp-tp-amt");
      el.textContent = `${fmt(v)} USDC`;
      if (topShown >= 0 && v > topShown && !reduce) { el.classList.remove("cp-tick"); void el.offsetWidth; el.classList.add("cp-tick"); }
      topShown = v;
    }
  }
  function paintTopTime() {
    if (!pill || pill.hidden) return;
    const t = pill.querySelector(".cp-tp-time");
    if (!_circlepadStarted || !_circlepadDeadline) { t.textContent = ""; return; }
    const rem = _circlepadDeadline - Math.floor(Date.now() / 1000);
    t.textContent = rem <= 0 ? "" : rem >= 86400 ? `${Math.floor(rem / 86400)}d ${Math.floor((rem % 86400) / 3600)}h` : `${Math.floor(rem / 3600)}h ${Math.floor((rem % 3600) / 60)}m`;
  }
  setInterval(paintTopTime, 15e3);

  // ================= contributors: orbit around the ring + media box =================
  let orbit = null;
  if (ring) {
    orbit = document.createElement("div");
    orbit.className = "cp-orbit";
    orbit.setAttribute("aria-hidden", "true");
    ring.appendChild(orbit);
  }
  const media = document.querySelector("#bp-featured .bp-featured-media");
  if (media) {
    media.classList.add("cp-media");
    media.innerHTML = `<span class="cp-media-round">Round</span><b class="cp-media-n" data-no-i18n>#${(typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_ROUND) || 1}</b><span class="cp-media-stack" id="cp-media-stack"></span><span class="cp-media-count" id="cp-media-count">No contributors yet</span>`;
  }
  const seenDots = new Set();
  // Before the raise the orbit shows pledgers (gold); once it opens, the
  // contributors (each in their wallet's colour), sized by share.
  let pledgers = [], lastRows = [];
  function paintOrbit(list, gold) {
    if (!orbit) return;
    const total = list.reduce((t, x) => t + x.v, 0);
    const top = list.slice(0, 36);
    const me = state && state.account ? String(state.account).toLowerCase() : "";
    orbit.classList.toggle("cp-orbit-gold", !!gold);
    orbit.innerHTML = top.map((x, i) => {
      const a = String(x.a).toLowerCase(), share = total ? x.v / total : 0;
      const size = Math.round(8 + Math.sqrt(share) * 26), ang = (360 / Math.max(top.length, 1)) * i;
      const isNew = seenDots.size && !seenDots.has((gold ? "g" : "c") + a);
      return `<i class="cp-odot${isNew ? " is-new" : ""}${a === me ? " is-me" : ""}" data-a="${a}" title="${a.slice(0, 6)}…${a.slice(-4)} · ${fmt(x.v)} USDC" style="--a:${ang}deg;--z:${size}px;--h:${(parseInt(a.slice(2, 8), 16) || 0) % 360}"></i>`;
    }).join("");
    top.forEach((x) => seenDots.add((gold ? "g" : "c") + String(x.a).toLowerCase()));
  }
  function paintContributors(rows) {
    lastRows = rows;
    if (S && S.started) paintOrbit(rows.map((r) => ({ a: r.address, v: toNum(r.amount) })), false);
    else paintOrbit(pledgers.map((p) => ({ a: p.wallet, v: Number(p.amount) || 0 })), true);
    const stack = $("cp-media-stack"), count = $("cp-media-count");
    if (stack) stack.innerHTML = rows.slice(0, 5).map((r) => `<i style="--h:${(parseInt(String(r.address).slice(2, 8), 16) || 0) % 360}"></i>`).join("");
    if (count) count.textContent = rows.length ? `${rows.length} ${tr(rows.length === 1 ? "contributor" : "contributors")}` : tr("No contributors yet");
  }

  // ================= recent activity ticker =================
  let ticker = null;
  const featured = $("bp-featured");
  if (featured) {
    ticker = document.createElement("div");
    ticker.className = "cp-ticker"; ticker.hidden = true;
    ticker.setAttribute("aria-label", "Recent activity");
    featured.insertBefore(ticker, featured.firstChild);
  }
  // contributions (USDC) and burn votes ($ARCIRCLE) in one line, newest first
  let lastActivity = [];
  const CATS = ["Name", "Ticker", "Logo", "Roadmap", "Date", "Chain"];
  function burnItems() {
    const f = window.circlepadBurns;
    if (!f || !Array.isArray(f.events) || !f.anchor) return [];
    return f.events.slice(0, 12).map((e) => ({ kind: "burn", contributor: e.voter, votes: e.votes, cat: e.cat, text: e.text, ts: Math.round(Number(f.anchor.ts || Date.now() / 1000) - Math.max(0, Number(f.anchor.block) - Number(e.b)) * 0.5) }));
  }
  function burnLabel(a) {
    const t = String(a.text || "");
    if (a.cat === 1) return "$" + t.replace(/^\$/, "");
    if (a.cat === 2) return tr("a logo");
    if (a.cat === 3) return t.split("\n")[0].slice(0, 24);
    if (a.cat === 4 && typeof govDate === "function" && govDate(t)) return govFmtDate(govDate(t));
    return t.slice(0, 24);
  }
  function paintTicker(activity) {
    if (!ticker) return;
    if (activity) { lastActivity = activity; window.circlepadActivity = activity; }
    const items = [...(lastActivity || []), ...burnItems()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 14);
    ticker.hidden = !items.length;
    if (!items.length) return;
    const ago = (ts) => { const d = Math.max(1, Math.floor(Date.now() / 1000) - ts); return d < 60 ? "just now" : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };
    const who = (a) => `<i style="--h:${(parseInt(String(a.contributor).slice(2, 8), 16) || 0) % 360}"></i><b data-no-i18n>${String(a.contributor).slice(0, 6)}…${String(a.contributor).slice(-4)}</b>`;
    const one = items.map((a) => a.kind === "burn"
      ? `<span class="cp-tk-item cp-tk-burn"><span class="cp-flame sm" aria-hidden="true"></span>${who(a)}<span data-no-i18n>−${(Number(a.votes || 0) * 1000).toLocaleString("en-US")} $ARCIRCLE</span><small><span>${esc(tr(CATS[a.cat] || ""))}</span> <span data-no-i18n>${esc(burnLabel(a))}</span></small><em data-no-i18n>${ago(a.ts)}</em></span>`
      : `<span class="cp-tk-item cp-tk-${a.kind}">${who(a)}<span data-no-i18n>${a.kind === "out" ? "−" : "+"}${fmt(toNum(a.amount))} USDC</span><em data-no-i18n>${ago(a.ts)}</em></span>`).join("");
    const html = `<div class="cp-tk-track${items.length > 2 && !reduce ? " run" : ""}" style="--n:${items.length}">${one}${items.length > 2 && !reduce ? one : ""}</div>`;
    if (ticker.__html !== html) { ticker.innerHTML = html; ticker.__html = html; }
  }
  document.addEventListener("circlepad:burns", () => { try { paintTicker(null); } catch (e) { /* next paint */ } });

  // ================= leaderboard tab: podium + share bars =================
  function paintPodium(rows) {
    const full = $("bp-full-leaderboard");
    if (!full) return;
    let pod = $("cp-podium");
    if (rows.length < 1) { if (pod) pod.remove(); return; }
    if (!pod) { pod = document.createElement("div"); pod.id = "cp-podium"; pod.className = "cp-podium"; full.parentNode.insertBefore(pod, full); }
    const total = rows.reduce((t, r) => t + toNum(r.amount), 0);
    const top = rows.slice(0, 3);
    const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);
    const html = order.map((i) => { const r = top[i], a = String(r.address).toLowerCase(), pct = total ? (toNum(r.amount) / total) * 100 : 0;
      return `<div class="cp-pod cp-pod-${i + 1}" style="--d:${i * 0.12}s"><span class="cp-pod-av" style="--h:${(parseInt(a.slice(2, 8), 16) || 0) % 360}"></span><b data-no-i18n>${a.slice(0, 6)}…${a.slice(-4)}</b><span data-no-i18n>${fmt(toNum(r.amount))} USDC</span><em data-no-i18n>${pct.toFixed(pct >= 10 ? 0 : 1)}%</em><div class="cp-pod-step" data-no-i18n>${i + 1}</div></div>`; }).join("");
    if (pod.__html !== html) { pod.innerHTML = html; pod.__html = html; pod.classList.remove("in"); void pod.offsetWidth; pod.classList.add("in"); }
    full.querySelectorAll(".bp-lb-row").forEach((row) => {
      const pctEl = row.querySelector(".bp-lb-pct");
      const pct = pctEl ? parseFloat(pctEl.textContent) || 0 : 0;
      row.style.setProperty("--cp-share", `${Math.min(100, pct)}%`);
      row.classList.add("cp-shared");
    });
  }

  // ---- the two big moments, when they happen while someone is watching ----
  function flash(text, cls) {
    if (!ring) return;
    const f = document.createElement("div");
    f.className = "cp-ring-flash " + (cls || "");
    f.innerHTML = `<b>${text}</b>`;
    ring.appendChild(f);
    setTimeout(() => f.remove(), 2600);
  }
  function ignite() {
    if (!ring) return;
    ring.classList.remove("cp-ignite"); void ring.offsetWidth; ring.classList.add("cp-ignite");
    // "Not started" → "LIVE": rings of light spread out from the circle, and
    // the status line and badge pop as they switch over.
    if (!reduce) {
      for (let i = 0; i < 3; i++) {
        const w = document.createElement("i");
        w.className = "cp-wave"; w.style.setProperty("--d", `${i * 0.38}s`);
        ring.appendChild(w);
        setTimeout(() => w.remove(), 2600);
      }
      [$("bp-round-status"), ...document.querySelectorAll(".bp-featured-badge")].forEach((el) => {
        if (!el) return;
        el.classList.remove("cp-pop-live"); void el.offsetWidth; el.classList.add("cp-pop-live");
      });
    }
    if (orbit) orbit.classList.add("cp-to-green");
    setTimeout(() => { if (orbit) orbit.classList.remove("cp-to-green"); paintContributors(lastRows); }, 1400);
    flash(tr("The raise is open"), "cp-flash-open");
    if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: 90 });
    if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
    if (typeof window.arcToast === "function") window.arcToast(tr("The raise is open — 72 hours starting now."));
  }
  let finalized = false;
  function finalize() {
    if (!ring || finalized) return;
    finalized = true;
    ring.classList.add("cp-final");
    const st = document.createElement("div");
    st.className = "cp-stamp"; st.textContent = tr("FINAL");
    ring.appendChild(st);
    if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
  }

  function milestone(m) {
    if (!ring) return;
    ring.classList.remove("cp-milestone"); void ring.offsetWidth; ring.classList.add("cp-milestone");
    if (typeof window.arcToast === "function") window.arcToast(`${tr("The raise just passed")} $${short$(m)}`);
    // the big ones (1K, 5K, 10K, 50K, 100K and up) get the ring lit up and a real burst
    const big = [1e3, 5e3, 1e4, 5e4, 1e5, 25e4, 5e5, 1e6].includes(m);
    // every milestone flashes its number in the ring; the big ones also light it up
    if (!reduce) flash(`$${short$(m)}`, "cp-flash-ms" + (big ? "" : " sm"));
    if (big) { ring.classList.remove("cp-ms-big"); void ring.offsetWidth; ring.classList.add("cp-ms-big"); }
    if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: big ? 150 : 60 });
    document.dispatchEvent(new CustomEvent("circlepad:milestone", { detail: m }));
  }

  // The round stats sit under the description on wide screens (instead of
  // a separate row under the whole card), so the left column isn't empty
  // next to the tall ring panel.
  (function statsInCard() {
    const main = document.querySelector("#bp-featured .bp-featured-main"), stats = document.querySelector("#bp-featured .bp-mini-stats");
    if (main && stats) { main.appendChild(stats); main.classList.add("cp-main"); }
  })();

  // ================= join the circle =================
  let mine = { acct: null, v: null };
  function joinCircle(addr) {
    if (!ring || reduce) return;
    const from = ($("bp-contribute-btn") || ring).getBoundingClientRect(), to = ring.getBoundingClientRect();
    const hue = (parseInt(String(addr).slice(2, 8), 16) || 0) % 360;
    const dot = document.createElement("div");
    dot.className = "cp-join";
    dot.style.setProperty("--h", hue);
    dot.style.left = `${from.left + from.width / 2}px`; dot.style.top = `${from.top + from.height / 2}px`;
    dot.style.setProperty("--dx", `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    dot.style.setProperty("--dy", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    document.body.appendChild(dot);
    requestAnimationFrame(() => dot.classList.add("go"));
    setTimeout(() => {
      dot.remove();
      ring.classList.remove("cp-joined"); void ring.offsetWidth; ring.classList.add("cp-joined");
      if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 50 });
      if (typeof window.arcToast === "function") window.arcToast(tr("You're in the circle."));
    }, 750);
  }
  function checkJoin(s, opts) {
    if (opts && opts.accountUnknown) return;
    const acct = state && state.account ? String(state.account).toLowerCase() : null;
    const v = s.myContribution || 0n;
    if (acct && mine.acct === acct && mine.v != null && v > mine.v) { joinCircle(acct); if (typeof window.arcFeedback === "function") window.arcFeedback("buy"); }
    mine = { acct, v: acct ? v : null };
  }

  // ================= stage: timeline + quick bar + sidebar =================
  const stageOf = (s) => (!s || !s.started ? -1 : s.isOpen ? 0 : s.distributed ? 4 : 3);
  let timeline = null;
  (function buildTimeline() {
    const steps = document.querySelector(".bp-row3 .bp-steps");
    if (!steps) return;
    const card = steps.closest(".bp-card"), row = card.parentNode;
    timeline = document.createElement("section");
    timeline.className = "cp-timeline";
    const head = card.querySelector(".bp-card-head");
    timeline.id = "cp-timeline";
    timeline.innerHTML = `<div class="cp-tl-head"><h3>${head ? head.textContent.trim() : "Launch process"} <span class="cp-tl-tag" data-no-i18n>${esc(window.cpRT ? window.cpRT("Round #1") : "Round #1")}</span></h3><span class="cp-tl-now" id="cp-tl-now"></span></div>`;
    timeline.appendChild(steps);
    const note = document.createElement("p");
    note.className = "cp-tl-note";
    note.textContent = "The raise and the 80 / 15 / 5 split are enforced by the escrow contract, the vote by the burn-vote contract. The top contributor's 15% (over 3 days) and the airdrop are paid by the team.";
    timeline.appendChild(note);
    // right under the round panel, and it stays there in every phase (the launch process is the round's status)
    const featured = document.getElementById("bp-featured");
    if (featured && featured.parentNode === row.parentNode) featured.insertAdjacentElement("afterend", timeline);
    else row.parentNode.insertBefore(timeline, row);
    card.remove();
    row.classList.add("cp-row2");
  })();
  let govPhaseNow = null, lastStage = null;
  document.addEventListener("circlepad:gov", (e) => { govPhaseNow = e.detail && e.detail.phase; if (lastStage) try { paintStage(lastStage); } catch (err) { /* cosmetic */ } });
  window.cpRepaintStage = () => { if (lastStage) try { paintStage(lastStage); } catch (err) { /* cosmetic */ } };
  function paintStage(s) {
    lastStage = s;
    const st = stageOf(s);
    document.body.classList.toggle("cp-started", !!(s && s.started));
    document.body.classList.toggle("cp-open", !!(s && s.isOpen));
    if (timeline) {
      const lis = [...timeline.querySelectorAll(".bp-steps > li")];
      // steps: raise (0) → burn-to-vote, during the raise (1) → close & split (2) → top contributor (3) → launch & airdrop (4);
      // 5 = all done. After the close: the split is on-chain, steps 4–5 are marked by the round wallet (circlepad-rounds.js).
      const voting = govPhaseNow === "voting";
      const at = st < 0 ? -1 : st === 0 ? (voting ? 1 : 0) : typeof window.cpStepAfterClose === "function" ? window.cpStepAfterClose(s) : 3;
      lis.forEach((li, i) => {
        li.classList.toggle("is-now", at === i);
        li.classList.toggle("is-done", (at > 0 && i < at) || (typeof window.cpStepDoneExtra === "function" && window.cpStepDoneExtra(i)));
      });
      timeline.dataset.step = String(at);
      const label = $("cp-tl-now");
      const after = ["", "", "Raise closed — split next", "Split sent — paying the top contributor", "Top contributor paid — launching next", "Complete — all 5 steps done"];
      if (label) label.textContent = st < 0 ? tr("Waiting for the raise to open") : st === 0 ? (voting ? tr("Live — raise and voting open") : tr("Live — raise open")) : tr((typeof window.cpStageLabel === "function" && window.cpStageLabel(at)) || after[at] || "Raise closed");
      // the fill follows the real clock when circlepad-round.js knows the dates
      if (!timeline.dataset.clock || st > 0) timeline.style.setProperty("--cp-tl", at < 0 ? 0 : at >= 5 ? 1 : Math.min(1, (at + 0.5) / 5));
      document.dispatchEvent(new CustomEvent("circlepad:stage", { detail: { at } }));
    }
    paintQuick(s);
  }

  // Quick bar: it is now the same Launch / Explore / Utilities bar on every
  // page, so these only act if a [data-cp] item is ever put back in it.
  const RING_ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/></svg>';
  function paintQuick(s) {
    const q = document.querySelector('nav.ax-quick [data-cp="round"]');
    if (!q) return;
    const label = !s || !s.started ? "The round" : s.isOpen ? "Contribute" : "Results";
    const sp = q.querySelector("span:last-child");
    if (sp && sp.textContent !== tr(label)) sp.textContent = tr(label);
    const bar = q.closest("nav.ax-quick");
    // While the raise is open the bar stays put on phones — it is the
    // shortcut to contributing, so it shouldn't hide on scroll.
    bar.classList.toggle("ax-quick-pinned", !!(s && s.isOpen));
    let prog = q.querySelector(".cp-q-prog");
    if (s && s.isOpen) {
      if (!prog) { prog = document.createElement("i"); prog.className = "cp-q-prog"; q.appendChild(prog); }
      prog.style.setProperty("--p", ring ? ring.style.getPropertyValue("--cp-p") || 0 : 0);
    } else if (prog) prog.remove();
  }
  document.addEventListener("circlepad:quick", (e) => {
    const k = e.detail;
    if (k === "leaderboard") { clickTab("leaderboard"); return; }
    clickTab("home");
    setTimeout(() => {
      const target = $("bp-round-panel") || $("bp-featured");
      if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      const input = $("bp-contribute-amount");
      if (S && S.isOpen && input) setTimeout(() => input.focus({ preventScroll: true }), 450);
      if (ring) { ring.classList.remove("cp-bump"); void ring.offsetWidth; ring.classList.add("cp-bump"); }
    }, 60);
  });
  (function quickIcon() {
    const q = document.querySelector('nav.ax-quick [data-cp="round"] .ax-quick-ico');
    if (q) q.innerHTML = RING_ICO;
    const l = document.querySelector('nav.ax-quick [data-cp="leaderboard"] .ax-quick-ico');
    if (l) l.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>';
  })();

  // ================= wrap applyCirclepadState =================
  const origApply = applyCirclepadState;
  // eslint-disable-next-line no-global-assign
  applyCirclepadState = function (s, opts) {
    origApply(s, opts);
    if (!s) return;
    const prev = S;
    S = S || s;
    try { paintRing(s); checkJoin(s, opts); paintStage(s); paintSplit(s); paintTopTime(); } catch (e) { console.warn("circlepad-fx", e); }
    if (!(opts && opts.accountUnknown)) { ringLive = true; try { positionCta(s); } catch (e) { /* cosmetic */ } }
    if (flowCard) flowCard.hidden = !s.started;
    if (prev && !(opts && opts.accountUnknown)) {
      if (!prev.started && s.started) setTimeout(ignite, 50);
      else if (prev.isOpen && s.started && !s.isOpen) setTimeout(finalize, 50);
    }
    S = s;
    document.dispatchEvent(new CustomEvent("circlepad:state"));
  };

  // ================= the final 24 hours: a banner across the top of the page =================
  let banner = null;
  function finalBanner(rem, urgent) {
    if (!rem) { if (banner) banner.hidden = true; return; }
    if (!banner) {
      const host = document.querySelector(".bp-scroll");
      if (!host) return;
      banner = document.createElement("a");
      banner.className = "cp-final24"; banner.href = "#bp-round-countdown";
      banner.innerHTML = `<i aria-hidden="true"></i><b>${tr("Final 24 hours")}</b><span>${tr("The round closes in")}</span><time data-no-i18n></time><em>${tr("Join now")}</em>`;
      banner.addEventListener("click", (e) => { const t = $("bp-round-countdown"); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); } });
      host.insertBefore(banner, host.firstChild);
    }
    banner.hidden = false;
    banner.classList.toggle("urgent", !!urgent);
    const h = Math.floor(rem / 3600), m = Math.floor((rem % 3600) / 60), sec = rem % 60, z = (n) => String(n).padStart(2, "0");
    banner.querySelector("time").textContent = `${z(h)}:${z(m)}:${z(sec)}`;
  }

  // ================= countdown: flip digits, urgent last hour =================
  if (typeof updateCirclepadCountdown === "function") {
    const origCd = updateCirclepadCountdown;
    const cd = $("bp-round-countdown");
    let last = {};
    // eslint-disable-next-line no-global-assign
    updateCirclepadCountdown = function () {
      origCd();
      if (!cd || !_circlepadStarted || _circlepadDeadline == null) { last = {}; return; }
      const rem = _circlepadDeadline - Math.floor(Date.now() / 1000);
      if (rem <= 0) { last = {}; cd.classList.remove("cp-cd-urgent"); if (S && S.isOpen && S.started) finalize(); return; }
      const parts = [["d", Math.floor(rem / 86400)], ["h", Math.floor((rem % 86400) / 3600)], ["m", Math.floor((rem % 3600) / 60)], ["s", rem % 60]].filter(([u, v]) => u !== "d" || v > 0);
      const flip = rem < 86400 && !reduce;
      cd.innerHTML = `<span class="cp-cd-label">${tr("Ends in")}</span><span class="cp-cd">${parts.map(([u, v]) => {
        const val = String(v).padStart(u === "d" ? 1 : 2, "0");
        const changed = flip && last[u] != null && last[u] !== val;
        return `<span class="cp-cd-u"><b class="${changed ? "cp-flip" : ""}" data-no-i18n>${val}</b><i>${u}</i></span>`;
      }).join("")}</span>`;
      parts.forEach(([u, v]) => { last[u] = String(v).padStart(u === "d" ? 1 : 2, "0"); });
      const urgent = rem < 3600, lastDay = rem < 86400;
      cd.classList.toggle("cp-cd-urgent", urgent);
      cd.classList.toggle("cp-cd-lastday", lastDay && !urgent);
      finalBanner(lastDay ? rem : 0, urgent); // shown while the countdown runs, like the countdown itself
      if (ring && S && S.isOpen) ring.dataset.state = urgent ? "urgent" : "live";
    };
  }

  // ================= leaderboard: rows slide to their new rank =================
  if (typeof renderCirclepadLeaderboard === "function") {
    const origLb = renderCirclepadLeaderboard;
    const keyOf = (row) => { const a = row.querySelector(".bp-lb-ext"); const m = a && /0x[0-9a-fA-F]{40}/.exec(a.getAttribute("href") || ""); return m ? m[0].toLowerCase() : null; };
    const snap = () => {
      const m = new Map();
      document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row").forEach((r) => {
        const k = keyOf(r); if (k) m.set(r.closest("#bp-full-leaderboard") ? "f" + k : "h" + k, { top: r.getBoundingClientRect().top, amt: lbAmt(r) });
      });
      return m;
    };
    // eslint-disable-next-line no-global-assign
    renderCirclepadLeaderboard = function (rows, activity, flow) {
      const before = reduce ? null : snap();
      origLb(rows, activity, flow);
      try { paintContributors(rows || []); paintTicker(activity); paintPodium(rows || []); emptyCta(); paintFlow(rows || [], activity || [], flow || null); } catch (e) { console.warn("circlepad-fx", e); }
      setTimeout(() => document.dispatchEvent(new CustomEvent("circlepad:lb")), 0);
      document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row").forEach((r, i) => {
        const k = keyOf(r);
        const rank = Number((r.querySelector(".bp-lb-rank") || {}).textContent.replace("#", "")) || i + 1;
        r.classList.toggle("cp-top1", rank === 1); r.classList.toggle("cp-top3", rank <= 3);
        if (!before || !k) return;
        const id = (r.closest("#bp-full-leaderboard") ? "f" : "h") + k, was = before.get(id);
        if (!was) { if (before.size) r.classList.add("cp-row-new"); return; }
        const dy = was.top - r.getBoundingClientRect().top;
        if (Math.abs(dy) > 2) {
          r.style.transform = `translateY(${dy}px)`; r.style.transition = "none";
          requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)"; r.style.transform = ""; }));
          if (dy > 0) r.classList.add("cp-row-up");
        }
        if (was.amt && was.amt !== lbAmt(r)) r.classList.add("cp-row-changed");
      });
    };
  }

  // ================= governance: bars grow and re-sort, the leader is lit =================
  if (typeof renderCirclepadGovernance === "function") {
    const origGov = renderCirclepadGovernance;
    const prevW = new Map(), prevMine = new Map(), prevLead = new Map();
    const optKey = (opt) => (opt.dataset.category != null ? `${opt.dataset.category}:${opt.dataset.option}` : null);
    let govPainted = false;
    // eslint-disable-next-line no-global-assign
    renderCirclepadGovernance = function (g) {
      const wrap = $("bp-gov-categories");
      // where every option sat before this render, for the slide to its new rank
      const before = new Map();
      if (wrap && !reduce) wrap.querySelectorAll(".bp-gov-option").forEach((o) => { const k = optKey(o); if (k) before.set(k, o.getBoundingClientRect().top); });
      origGov(g);
      if (!wrap) return;
      wrap.querySelectorAll(".bp-gov-cat").forEach((cat, ci) => {
        cat.querySelectorAll(".bp-gov-option").forEach((opt, oi) => {
          const fill = opt.querySelector(".bp-gov-option-fill"), key = `${ci}:${oi}`;
          if (fill) {
            const to = fill.style.width, from = prevW.has(key) ? prevW.get(key) : "0%";
            prevW.set(key, to);
            if (!reduce && from !== to) { fill.style.width = from; requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = to; })); }
          }
          const isMine = opt.classList.contains("bp-gov-option-mine");
          if (isMine && prevMine.get(ci) !== oi) opt.classList.add("cp-voted-pop");
          if (isMine) prevMine.set(ci, oi);
        });
        // Most-backed option first; ties keep the order they were proposed in.
        const box = cat.querySelector(".bp-gov-options");
        if (!box) return;
        const opts = [...box.querySelectorAll(".bp-gov-option")].map((el, i) => ({ el, i, w: parseFloat((el.querySelector(".bp-gov-option-pct") || {}).textContent) || 0 }));
        opts.sort((a, b) => b.w - a.w || a.i - b.i).forEach((o, rank) => {
          box.appendChild(o.el);
          o.el.style.setProperty("--rank", rank);
          const r = document.createElement("span");
          r.className = "cp-gov-rank"; r.setAttribute("data-no-i18n", ""); r.textContent = String(rank + 1);
          const row = o.el.querySelector(".bp-gov-option-row");
          if (row) row.insertBefore(r, row.firstChild);
        });
        const top = opts[0];
        const title = (cat.querySelector(".bp-gov-cat-title") || {}).textContent || "";
        if (top && top.w > 0) {
          top.el.classList.add("cp-gov-lead");
          const k = optKey(top.el), was = prevLead.get(title);
          if (govPainted && was && k && was !== k && !reduce) {
            top.el.classList.add("cp-gov-newlead");
            const txt = (top.el.querySelector(".bp-gov-option-text") || {}).firstChild;
            if (typeof window.arcToast === "function") window.arcToast(`${tr("New leader")} · ${tr(title)}: ${txt ? txt.textContent : ""}`);
          }
          if (k) prevLead.set(title, k);
        }
      });
      // FLIP: start each option where it was, then let it glide to its new rank
      if (before.size && !reduce) {
        wrap.querySelectorAll(".bp-gov-option").forEach((o) => {
          const k = optKey(o); if (!k || !before.has(k)) return;
          const dy = before.get(k) - o.getBoundingClientRect().top;
          if (Math.abs(dy) < 2) return;
          o.style.transition = "none"; o.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => requestAnimationFrame(() => { o.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1)"; o.style.transform = ""; }));
        });
      }
      govPainted = true;
    };
  }

  // ================= My Position: an empty state that points somewhere =================
  function positionCta(s) {
    const el = $("bp-position-body");
    if (!el || !el.classList.contains("bp-empty") || el.querySelector(".cp-empty-cta")) return;
    const connected = !!(state && state.account);
    if (connected && !s.isOpen) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "cp-empty-cta";
    b.textContent = tr(connected ? "Contribute to the round" : "Connect wallet");
    b.addEventListener("click", async () => {
      if (!connected) { if (typeof connectWallet === "function") try { await connectWallet(); } catch (e) { /* cancelled */ } return; }
      clickTab("home");
      document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: "round" }));
    });
    el.appendChild(document.createElement("br")); el.appendChild(b);
  }

  // ================= money in & out: net raised + every move, both ways =================
  // Contributors can withdraw any time before the close, so the honest
  // number is the net — and the feed shows withdrawals as plainly as
  // contributions. Data comes from the same leaderboard fetch (flow totals
  // from /api/social?circle=lb, or the in-browser event scan).
  let flowCard = null, flowFilter = "all", flowSeen = null, flowLast = null;
  if (featured) {
    flowCard = document.createElement("section");
    flowCard.className = "cp-flowcard"; flowCard.id = "cp-flowcard"; flowCard.hidden = true;
    flowCard.innerHTML = `<div class="cp-fc-head"><div><h3>${tr("Money in & out")} <span class="cp-fc-live"><i></i>${tr("Live")}</span></h3>
        <p>${tr("Refunds stay open until the close, so this shows every move both ways — read straight from the escrow's events.")}</p></div></div>
      <div class="cp-fc-stats">
        <div class="cp-fc-stat cp-fc-net"><small>${tr("Net raised")}</small><b class="cp-num" data-k="net" data-no-i18n>—</b><span>${tr("held for contributors right now")}</span></div>
        <div class="cp-fc-stat cp-fc-in"><small>${tr("Contributed")}</small><b class="cp-num" data-k="in" data-no-i18n>—</b><span data-k="nin"></span></div>
        <div class="cp-fc-stat cp-fc-out"><small>${tr("Withdrawn")}</small><b class="cp-num" data-k="out" data-no-i18n>—</b><span data-k="nout"></span></div>
        <div class="cp-fc-stat cp-fc-keep"><small>${tr("Stayed in")}</small><b class="cp-num" data-k="keep" data-no-i18n>—</b><span>${tr("of every USDC put in")}</span></div>
      </div>
      <div class="cp-fc-bar" aria-hidden="true"><i class="cp-fc-bar-net"></i><i class="cp-fc-bar-out"></i></div>
      <div class="cp-fc-feedhead"><h4>${tr("Latest moves")}</h4>
        <div class="cp-fc-filter" role="radiogroup" aria-label="${tr("Show")}">
          <button type="button" role="radio" aria-checked="true" data-f="all">${tr("All")}</button><button type="button" role="radio" aria-checked="false" data-f="in">${tr("In")}</button><button type="button" role="radio" aria-checked="false" data-f="out">${tr("Out")}</button>
        </div></div>
      <ol class="cp-fc-feed" aria-live="polite"></ol>`;
    featured.insertAdjacentElement("afterend", flowCard);
    flowCard.querySelector(".cp-fc-filter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]"); if (!b) return;
      flowFilter = b.dataset.f;
      flowCard.querySelectorAll(".cp-fc-filter button").forEach((x) => x.setAttribute("aria-checked", x === b ? "true" : "false"));
      if (flowLast) paintFlow(...flowLast);
    });
  }
  const numAnim = new WeakMap();
  function rollTo(el, to, fmtFn) {
    const from = numAnim.has(el) ? numAnim.get(el) : null;
    numAnim.set(el, to);
    if (reduce || from == null || from === to) { el.textContent = fmtFn(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtFn(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.classList.remove("cp-tick"); void el.offsetWidth; el.classList.add("cp-tick");
  }
  function paintFlow(rows, activity, flow) {
    if (!flowCard) return;
    flowLast = [rows, activity, flow];
    // older cached data has no totals: rebuild them from the rows
    const f = flow || {
      in: rows.reduce((t, r) => t + (r.depositedTotal || 0n), 0n), out: rows.reduce((t, r) => t + (r.withdrawnTotal || 0n), 0n),
      nIn: null, nOut: null, wallets: rows.length, refunders: rows.filter((r) => r.withdrawnTotal > 0n).length,
    };
    const fin = toNum(f.in), fout = toNum(f.out), net = Math.max(0, fin - fout);
    const q = (k) => flowCard.querySelector(`[data-k="${k}"]`);
    const usd = (n) => `${fmt(n)} USDC`;
    rollTo(q("net"), net, usd);
    rollTo(q("in"), fin, (n) => `+${fmt(n)}`);
    rollTo(q("out"), fout, (n) => `${n > 0 ? "−" : ""}${fmt(n)}`);
    rollTo(q("keep"), fin > 0 ? (net / fin) * 100 : 100, (n) => `${n.toFixed(n >= 99.95 ? 0 : 1)}%`);
    const plural = (n, one, many) => `${n} ${tr(n === 1 ? one : many)}`;
    q("nin").textContent = f.nIn != null ? `${plural(f.nIn, "contribution", "contributions")} · ${plural(f.wallets || 0, "wallet", "wallets")}` : plural(f.wallets || 0, "wallet", "wallets");
    q("nout").textContent = f.nOut != null ? `${plural(f.nOut, "withdrawal", "withdrawals")} · ${plural(f.refunders || 0, "wallet", "wallets")}` : plural(f.refunders || 0, "wallet", "wallets");
    flowCard.style.setProperty("--net", fin > 0 ? (net / fin).toFixed(4) : 0);
    flowCard.style.setProperty("--out", fin > 0 ? (fout / fin).toFixed(4) : 0);
    flowCard.classList.toggle("cp-fc-empty", !(fin > 0));
    const list = flowCard.querySelector(".cp-fc-feed");
    const items = activity.filter((a) => flowFilter === "all" || a.kind === flowFilter);
    const keyOf = (a) => `${a.tx || ""}:${a.kind}:${String(a.contributor).toLowerCase()}:${a.amount}:${a.ts}`;
    const ago = (ts) => { if (!ts) return ""; const d = Math.max(1, Math.floor(Date.now() / 1000) - ts); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };
    const ex = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "";
    const html = items.length ? items.map((a) => {
      const k = keyOf(a), fresh = flowSeen && !flowSeen.has(k), addr = String(a.contributor);
      const link = a.tx ? `${ex}/tx/${a.tx}` : `${ex}/address/${addr}`;
      return `<li class="cp-fc-row ${a.kind === "out" ? "out" : "in"}${fresh ? " is-new" : ""}">
        <i class="cp-fc-av" style="--h:${(parseInt(addr.slice(2, 8), 16) || 0) % 360}"></i>
        <span class="cp-fc-who"><b data-no-i18n>${addr.slice(0, 6)}…${addr.slice(-4)}</b><small>${tr(a.kind === "out" ? "Withdrew" : "Contributed")}</small></span>
        <b class="cp-fc-amt" data-no-i18n>${a.kind === "out" ? "−" : "+"}${fmt(toNum(a.amount))} USDC</b>
        <time data-no-i18n>${ago(a.ts)}</time>
        <a href="${link}" target="_blank" rel="noopener" aria-label="${tr("View on explorer")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/></svg></a></li>`;
    }).join("") : `<li class="cp-fc-none">${tr(flowFilter === "out" ? "No withdrawals so far." : flowFilter === "in" ? "No contributions yet." : "No moves yet — the first contribution shows up here within seconds.")}${flowFilter !== "out" && S && S.isOpen ? ` <button type="button" class="cp-empty-cta" data-cta>${tr("Be the first to contribute")}</button>` : ""}</li>`;
    if (list.__html !== html) {
      list.innerHTML = html; list.__html = html;
      const cta = list.querySelector("[data-cta]");
      if (cta) cta.addEventListener("click", () => document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: "round" })));
    }
    flowSeen = flowSeen || new Set();
    activity.forEach((a) => flowSeen.add(keyOf(a)));
  }

  // ================= close split: 80 / 5 / 15 =================
  const next = document.querySelector(".bp-nextcard");
  let split = null;
  if (next) {
    const copy = document.createElement("div");
    copy.className = "cp-next-copy";
    while (next.firstChild) copy.appendChild(next.firstChild);
    next.appendChild(copy);
    split = document.createElement("div");
    split.className = "cp-split";
    const ROWS = [["Recipient", 80, "cp-s-a"], ["Treasury", 15, "cp-s-c"], ["Platform", 5, "cp-s-b"]];
    split.innerHTML = `<div class="cp-split-head"><span>${tr("At close")}</span><b class="cp-split-total" data-no-i18n></b></div><div class="cp-proof" hidden></div>`
      + ROWS.map(([k, p, c]) => `<div class="cp-split-row ${c}"><div class="cp-split-top"><span>${k}</span><b data-no-i18n>${p}%</b></div><div class="cp-split-bar"><i style="--w:${p}%"></i></div><small class="cp-split-amt" data-p="${p}" data-no-i18n></small></div>`).join("");
    next.appendChild(split);
    next.classList.add("cp-nextgrid");
    const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) { split.classList.add("in"); io.disconnect(); } }); }, { threshold: 0.35 }) : null;
    if (io && !reduce) io.observe(split); else split.classList.add("in");
  }
  function paintSplit(s) {
    if (!split) return;
    const total = toNum(s.totalRaised);
    split.querySelector(".cp-split-total").textContent = total > 0 ? `${fmt(total)} USDC` : "";
    split.querySelectorAll(".cp-split-amt").forEach((el) => { el.textContent = total > 0 ? `≈ ${fmt((total * Number(el.dataset.p)) / 100)} USDC` : ""; });
    split.classList.toggle("cp-flowing", !!(s.started && !s.isOpen));
    // Proof the money is where the page says: the escrow's own USDC balance
    // next to the contributions it has recorded.
    const proof = split.querySelector(".cp-proof");
    const bal = toNum(s.balance);
    if (s.started && !s.distributed && (bal > 0 || total > 0)) {
      const ok = Math.abs(bal - total) < 0.000001 || bal >= total;
      proof.hidden = false;
      proof.className = "cp-proof" + (ok ? " ok" : " warn");
      proof.innerHTML = `<span>${tr("Held by the contract")}</span> <b data-no-i18n>${fmt(bal)} USDC</b> <span class="cp-proof-mark">${ok ? tr("matches contributions") : tr("differs from contributions")}</span> <a href="${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || ""}/address/${(typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_ESCROW_ADDRESS) || ""}" target="_blank" rel="noopener">${tr("Check")} ↗</a>`;
    } else proof.hidden = true;
  }

  // ================= round tiles: numbers roll to their new value =================
  (function tileCountUp() {
    if (reduce) return;
    const RE = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/;
    document.querySelectorAll("#bp-featured .bp-mini-stat strong").forEach((el) => {
      // Our own frame writes are remembered in el.__w so the observer (which
      // fires asynchronously) can tell them apart from real updates.
      let shown = el.textContent, raf = 0;
      const write = (t) => { el.__w = t; el.textContent = t; };
      new MutationObserver(() => {
        const now = el.textContent;
        if (now === el.__w) return;
        const a = RE.exec(shown), b = RE.exec(now);
        const from = a ? parseFloat(a[2].replace(/,/g, "")) : NaN, to = b ? parseFloat(b[2].replace(/,/g, "")) : NaN;
        cancelAnimationFrame(raf);
        if (!a || !b || a[1] !== b[1] || a[3] !== b[3] || !isFinite(from) || !isFinite(to) || from === to) { shown = now; el.__w = now; return; }
        const dec = (b[2].split(".")[1] || "").length, t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
          if (k < 1) { write(b[1] + (from + (to - from) * e).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + b[3]); raf = requestAnimationFrame(step); }
          else { write(now); shown = now; }
        };
        raf = requestAnimationFrame(step);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  })();

  // ================= Home: section dots on wide screens =================
  (function sectionDots() {
    const home = $("bp-panel-home");
    if (!home || !("IntersectionObserver" in window)) return;
    const SECS = [["#bp-featured", "The round"], [".cp-timeline", "Launch process"], [".bp-row3", "Governance & leaderboard"], ["#cp-qa", "Round Q&A"], ["#cpx-trust", "Transparency"], [".bp-nextcard", "At close"]];
    const nav = document.createElement("nav");
    nav.className = "cp-dots"; nav.setAttribute("aria-label", "Sections");
    document.body.appendChild(nav);
    let io = null;
    const build = () => {
      const items = SECS.map(([sel, label]) => [home.querySelector(sel), label]).filter(([el]) => el && !el.hidden);
      nav.innerHTML = items.map(([, label], i) => `<button type="button" data-i="${i}" aria-label="${tr(label)}"><i></i><span>${tr(label)}</span></button>`).join("");
      nav.onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) items[+b.dataset.i][0].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); };
      if (io) io.disconnect();
      io = new IntersectionObserver((es) => es.forEach((en) => {
        const i = items.findIndex(([el]) => el === en.target);
        if (en.isIntersecting && i >= 0) nav.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
      }), { rootMargin: "-45% 0px -50% 0px" });
      items.forEach(([el]) => io.observe(el));
    };
    const sync = () => nav.classList.toggle("on", home.classList.contains("active"));
    new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ["class"] });
    setTimeout(() => { build(); sync(); }, 1500); // after the Q&A card has mounted
    document.addEventListener("arc:lang", build);
  })();

  // ================= empty states, skeleton, docs flow =================
  function emptyCta() {
    const home = $("bp-home-leaderboard");
    if (!home || !home.classList.contains("bp-empty") || home.querySelector(".cp-empty-cta")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "cp-empty-cta";
    b.textContent = tr(S && S.isOpen ? "Be the first to contribute" : "Pledge to be first in line");
    b.addEventListener("click", () => document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: "round" })));
    home.appendChild(document.createElement("br")); home.appendChild(b);
  }
  if (typeof showCirclepadLeaderboardText === "function") {
    const origTxt = showCirclepadLeaderboardText;
    const skel = '<div class="cp-skel" aria-hidden="true"><i></i><i></i><i></i></div>';
    // eslint-disable-next-line no-global-assign
    showCirclepadLeaderboardText = function (text) {
      origTxt(text);
      if (!/^Loading/.test(String(text))) return;
      ["bp-home-leaderboard", "bp-full-leaderboard"].forEach((id) => { const el = $(id); if (el) el.insertAdjacentHTML("beforeend", skel); });
    };
  }
  (function docsFlow() {
    const how = $("bp-doc-how");
    if (!how) return;
    const lede = how.querySelector(".bp-lede") || how.querySelector("h1");
    const flow = document.createElement("ol");
    flow.className = "cp-flow";
    const STEPS = [
      ["Pledge", "Say what you'll put in before it opens — a signature, no money moves.", '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'],
      ["Contribute", "72 hours to send USDC. Withdraw any of it until the close.", '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'],
      ["Vote", "While the raise runs, $ARCIRCLE holders decide the name, ticker, logo, roadmap and date — 1,000 burned per vote.", '<path d="M5 12l4 4 10-10"/>'],
      ["Launch", "At the close the raise splits 80 / 15 / 5 and the project goes live.", '<path d="M12 3c3 2 4.5 5.4 4.5 9 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.6 1.5-7 4.5-9z"/>'],
    ];
    flow.innerHTML = STEPS.map(([t, d, ico], i) => `<li style="--i:${i}"><span class="cp-flow-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ico}</svg></span><b>${t}</b><p>${d}</p></li>`).join("");
    lede.insertAdjacentElement("afterend", flow);
    if ("IntersectionObserver" in window && !reduce) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { flow.classList.add("in"); io.disconnect(); } }), { threshold: 0.3 });
      io.observe(flow);
    } else flow.classList.add("in");
  })();

  // ================= hero parallax =================
  const art = document.querySelector("#bp-panel-home .bp-hero-art");
  if (art && !reduce) {
    let tick = false;
    const onScroll = () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => {
        tick = false;
        const r = art.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        art.style.setProperty("--cp-par", (-r.top * 0.18).toFixed(1));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Paint once from whatever circlepad.js already applied (cache paint runs
  // before this file loads).
  // eslint-disable-next-line no-undef
  try { if (typeof _circlepadState !== "undefined" && _circlepadState) applyCirclepadState(_circlepadState, { accountUnknown: true }); } catch (e) { /* ignore */ }
  try {
    const c = typeof circlepadLoadCache === "function" && circlepadEscrowConfigured() ? circlepadLoadCache("leaderboard") : null;
    if (c && Array.isArray(c.rows)) paintFlow(c.rows, c.activity || [], c.flow || null);
  } catch (e) { /* ignore */ }
})();
;
/* ---- circlepad-community.js ---- */
/* global state, ethers, connectWallet, cpToast, cpErrText, CONFIG, circlepadLogCache, readProvider, refreshAccountDependentViews */
// circlepad-community.js — CirclePad's community layer (api/_circle.mjs via
// /api/social): pledges before the raise opens, the round Q&A, the board of
// candidate projects for future rounds, referral links and credit, and the
// leaderboard chips ($ARCIRCLE holder, ArcPad creator, "brought in").
// Plus the personal bits: invite link, share card, contribution history.
// Every post is signed by the wallet (free, no transaction); the messages
// below must match api/_circle.mjs byte for byte.
(function () {
  "use strict";
  if (!document.body.classList.contains("circlepad-page") || typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS) return;
  const API = "/api/social";
  // the Q&A room and pledges stay Round #1's (circlepad-boot.js); signed messages name that escrow
  const ESCROW = (CONFIG.CIRCLEPAD_COMMUNITY_ESCROW || CONFIG.CIRCLEPAD_ESCROW_ADDRESS).toLowerCase();
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const toast = (m, k) => (typeof cpToast === "function" ? cpToast(tr(m), k) : console.log(m));
  const num = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: n >= 10000 ? 0 : 2 });
  const hue = (a) => (parseInt(String(a).slice(2, 8), 16) || 0) % 360;
  const dot = (a, size = 22) => `<span class="cp-av" style="--h:${hue(a)};--s:${size}px" aria-hidden="true"></span>`;
  const ago = (ms) => { const s = Math.max(1, Math.floor((Date.now() - ms) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const me = () => (state && state.account ? lc(state.account) : null);
  const started = () => document.body.classList.contains("cp-started");
  const kec = (t) => ethers.keccak256(ethers.toUtf8Bytes(String(t)));

  // ---- messages: identical to api/_circle.mjs ----
  const pledgeMessage = (wallet, amount, issued) => `ARCIRCLE PAD — CirclePad pledge\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nAmount: ${amount} USDC\nIssued: ${issued}`;
  const qaMessage = (wallet, text, parent, issued) => `ARCIRCLE PAD — CirclePad Q&A\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nReply to: ${parent || "-"}\nIssued: ${issued}\nText: ${kec(text)}`;
  const propMessage = (wallet, p, issued) => `ARCIRCLE PAD — CirclePad proposal\nWallet: ${lc(wallet)}\nIssued: ${issued}\nContent: ${kec(JSON.stringify([p.title, p.pitch, p.link]))}`;
  const upMessage = (wallet, id) => `ARCIRCLE PAD — upvote CirclePad proposal\nProposal: ${id}\nWallet: ${lc(wallet)}`;
  const hideMessage = (wallet, kind, id, issued) => `ARCIRCLE PAD — CirclePad moderation\nRound: ${ESCROW}\nHide ${kind}: ${id}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;

  // ================= referral links =================
  // arcircle-hub.js already keeps the first ?ref=<wallet> a visitor arrives
  // with (30 days, this browser). circlepad.js asks this function when it
  // sends contribute(), and appends the referrer to the calldata.
  window.circlepadReferrer = function () {
    const r = typeof window.arcRef === "function" ? window.arcRef() : null;
    return r && /^0x[0-9a-f]{40}$/.test(r) && r !== me() ? r : null;
  };
  const inviteUrl = (w) => `https://www.arcircle.app/circle?ref=${w}`;
  const cardUrl = (w) => `https://www.arcircle.app/round${w ? `?w=${w}` : ""}`;

  // ================= data =================
  let D = null, busy = false;
  async function load() {
    try {
      const r = await fetch(`${API}?circle=1${me() ? `&wallet=${me()}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      D = j && j.enabled ? j : null;
      // a partial answer (the store briefly unreachable) must not break the page
      if (D) { D.pledges = D.pledges || { total: 0, count: 0, top: [] }; D.pledges.top = D.pledges.top || []; D.refs = D.refs || []; }
    } catch (e) { /* keep last */ }
    render();
  }
  async function signed(fn) {
    if (!state.account || !state.signer) {
      if (typeof connectWallet === "function") await connectWallet();
      if (!state.account || !state.signer) return null;
    }
    return fn(me(), new Date().toISOString());
  }
  async function post(body) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { api: true, j });
    return j;
  }
  const errMsg = (e) => (e && e.api ? tr(e.message.charAt(0).toUpperCase() + e.message.slice(1).replace(/([^.!?])$/, "$1.")) : typeof cpErrText === "function" ? cpErrText(e) : (e && e.message) || "Failed");

  // ================= pledges (before the raise opens) =================
  function renderPledge() {
    const panel = $("bp-round-panel");
    if (!panel) return;
    let box = $("cp-pledge");
    // pledges belong to Round #1's room (signed for its escrow); later rounds open without them
    const show = !!D && !started() && (CONFIG.CIRCLEPAD_ROUND || 1) === 1;
    if (window.circlepadFx) { window.circlepadFx.setPledged(show ? D.pledges.total : null, show ? D.pledges.count : 0); window.circlepadFx.setPledgers(show ? D.pledges.top : []); }
    paintPreStats(show);
    paintConvert();
    if (!show) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div");
      box.id = "cp-pledge"; box.className = "cp-pledge";
      const meta = panel.querySelector(".cp-ring-meta");
      (meta || panel.firstChild).insertAdjacentElement(meta ? "afterend" : "beforebegin", box);
      box.addEventListener("click", onPledgeClick);
      box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "cp-pl-amt") onPledgeClick({ target: box.querySelector("[data-pl-go]") }); });
    }
    const p = D.pledges, mine = D.myPledge;
    const html = `<div class="cp-pl-head"><span class="cp-pl-av">${p.top.slice(0, 6).map((x) => dot(x.wallet, 20)).join("")}</span>
        <span>${p.count ? `<b data-no-i18n>${num(p.total)} USDC</b> <span>pledged by</span> <b data-no-i18n>${p.count}</b> <span>${p.count === 1 ? "wallet" : "wallets"}</span>` : `<span>Be the first to pledge.</span>`}</span></div>
      ${mine ? `<div class="cp-pl-mine"><span>Your pledge</span> <b data-no-i18n>${num(mine)} USDC</b><button type="button" class="cp-link" data-pl-edit>Change</button><button type="button" class="cp-link" data-pl-cancel>Cancel</button></div>` : ""}
      <div class="cp-pl-form"${mine ? " hidden" : ""}><input type="number" min="0" step="0.01" inputmode="decimal" id="cp-pl-amt" class="bp-contribute-input" placeholder="${esc(tr("USDC you plan to put in"))}"><button type="button" class="bp-btn-primary" data-pl-go>Pledge</button></div>
      <small class="cp-pl-note">A pledge is a signed note, not a payment — nothing leaves your wallet. Change or cancel it until the raise opens.</small>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  // Before the raise: the six round tiles show the pledges instead of a row
  // of "—". circlepad.js repaints them with the round's numbers once it opens.
  function paintPreStats(pre) {
    const set = (valId, label, value) => {
      const v = $(valId); if (!v) return;
      const tile = v.closest(".bp-mini-stat"), lab = tile && tile.querySelector("span");
      if (lab && lab.textContent !== tr(label)) lab.textContent = tr(label);
      if (v.__target !== value) { v.__target = value; v.textContent = value; }
      tile.classList.add("cp-pre");
    };
    if (!pre) {
      document.querySelectorAll(".bp-mini-stat.cp-pre").forEach((t) => {
        t.classList.remove("cp-pre");
        const lab = t.querySelector("span"), v = t.querySelector("strong");
        const orig = { "bp-stat-length": "Ends", "bp-stat-contributors": "Contributors", "bp-stat-lead": "Top contributor", "bp-stat-mine": "Your contribution", "bp-stat-myshare": "Your share" }[v && v.id];
        if (orig && lab) lab.textContent = tr(orig);
        if (v) v.__target = null;
      });
      return;
    }
    const p = D.pledges, mine = D.myPledge || 0;
    set("bp-stat-length", "Pledged so far", `${num(p.total)} USDC`);
    set("bp-stat-contributors", "Pledgers", p.count ? String(p.count) : "—");
    set("bp-stat-lead", "Top pledge", p.top.length ? `${num(p.top[0].amount)} USDC` : "—");
    set("bp-stat-mine", "Your pledge", mine ? `${num(mine)} USDC` : "—");
    set("bp-stat-myshare", "Your share of pledges", mine && p.total ? `${((mine / p.total) * 100).toFixed(1)}%` : "—");
  }
  // The raise is open and this wallet pledged but hasn't contributed yet:
  // one banner, amount pre-filled.
  function paintConvert() {
    let bar = $("cp-convert");
    const mineC = window.circlepadFx ? window.circlepadFx.mine() : 0;
    const pledgedAmt = D && D.myPledge ? D.myPledge : 0;
    const open = document.body.classList.contains("cp-open");
    if (!(open && pledgedAmt > 0 && mineC < pledgedAmt)) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "cp-convert"; bar.className = "cp-convert";
      const featured = $("bp-featured");
      if (featured) featured.parentNode.insertBefore(bar, featured);
      bar.addEventListener("click", (e) => {
        if (!e.target.closest("[data-convert]")) return;
        const input = $("bp-contribute-amount");
        const left = Math.max(0, pledgedAmt - mineC);
        if (input) input.value = String(Math.round(left * 100) / 100);
        document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: "round" }));
      });
    }
    const left = Math.max(0, pledgedAmt - mineC);
    const html = `<span class="cp-cv-ico" aria-hidden="true"></span><div class="cp-cv-txt"><b>The raise is open.</b> <span>You pledged</span> <b data-no-i18n>${num(pledgedAmt)} USDC</b>${mineC > 0 ? ` <span>— </span><b data-no-i18n>${num(left)} USDC</b> <span>to go</span>` : ""}</div><button type="button" class="bp-btn-primary" data-convert>Contribute now</button>`;
    if (bar.__html !== html) { bar.innerHTML = html; bar.__html = html; }
  }
  async function onPledgeClick(e) {
    const t = e.target;
    if (t.closest("[data-pl-edit]")) { const f = $("cp-pledge").querySelector(".cp-pl-form"); f.hidden = false; $("cp-pl-amt").value = D.myPledge || ""; $("cp-pl-amt").focus(); return; }
    const cancel = t.closest("[data-pl-cancel]"), go = t.closest("[data-pl-go]");
    if (!cancel && !go) return;
    if (busy) return;
    let amount = cancel ? "0" : String(($("cp-pl-amt") || {}).value || "").trim();
    if (!cancel) {
      if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) { toast("Enter an amount in USDC, up to 2 decimals.", "bad"); return; }
      amount = String(Number(amount)); // "0100.50" → "100.5", the form the server re-signs
    }
    busy = true;
    try {
      const r = await signed(async (wallet, issued) => {
        const signature = await state.signer.signMessage(pledgeMessage(wallet, amount, issued));
        return post({ action: "pledge", wallet, amount, issued, signature });
      });
      if (!r) return;
      toast(cancel ? "Pledge cancelled." : "Pledged — you'll be first in line when the raise opens.", "ok");
      if (!cancel && typeof window.arcFeedback === "function") window.arcFeedback("milestone");
      if (!cancel && window.circlepadFx) window.circlepadFx.coinDrop(t.closest("[data-pl-go]"));
      await load();
    } catch (err) { toast(errMsg(err), "bad"); } finally { busy = false; }
  }

  // ================= round Q&A =================
  let qaParent = null, qaAll = false;
  function renderQA() {
    const anchor = document.querySelector("#bp-panel-home .bp-row3");
    let card = $("cp-qa");
    if (!D) { if (card) card.remove(); return; }
    if (!card && anchor) {
      card = document.createElement("section");
      card.id = "cp-qa"; card.className = "bp-card cp-qa";
      anchor.insertAdjacentElement("afterend", card);
      card.innerHTML = `<div class="bp-card-head"><span>Round Q&amp;A <span class="cp-count" id="cp-qa-count" data-no-i18n></span></span><span class="cp-qa-hint">Ask the team or the circle</span></div>
        <div class="cp-qa-form"><div class="cp-qa-reply" id="cp-qa-reply" hidden></div>
          <textarea id="cp-qa-text" maxlength="500" rows="2" placeholder="${esc(tr("Ask a question about the round…"))}"></textarea>
          <div class="cp-qa-foot"><small>Signed with your wallet. Pledgers, contributors and $ARCIRCLE holders can post.</small><button type="button" class="bp-btn-primary" id="cp-qa-post">Post</button></div></div>
        <div class="cp-qa-list" id="cp-qa-list"></div>`;
      card.addEventListener("click", onQAClick);
    }
    if (!card) return;
    const rec = lc(D.recipient), isTeam = me() && me() === rec;
    const roots = D.qa.filter((q) => !q.parent).reverse();
    const kids = (id) => D.qa.filter((q) => q.parent === id);
    const item = (q, reply) => `<div class="cp-qa-item${reply ? " is-reply" : ""}${q.team ? " is-team" : ""}" data-id="${q.id}">
        ${dot(q.wallet, reply ? 18 : 24)}<div class="cp-qa-body"><div class="cp-qa-meta"><b data-no-i18n>${short(q.wallet)}</b>${q.team ? `<span class="cp-team">Team</span>` : ""}<span class="cp-ago" data-no-i18n>${ago(q.at)}</span></div>
        <p data-no-i18n>${esc(q.text).replace(/\n/g, "<br>")}</p>
        <div class="cp-qa-acts">${reply ? "" : `<button type="button" class="cp-link" data-qa-reply="${q.id}">Reply</button>`}${isTeam ? `<button type="button" class="cp-link cp-muted" data-hide="qa:${q.id}">Hide</button>` : ""}</div></div></div>`;
    const shown = qaAll ? roots : roots.slice(0, 4);
    const html = roots.length
      ? shown.map((q) => `<div class="cp-thread">${item(q)}${kids(q.id).map((r) => item(r, true)).join("")}</div>`).join("")
        + (roots.length > shown.length ? `<button type="button" class="cp-more" data-qa-all>${tr("Show all")} (${roots.length})</button>` : "")
      : `<div class="bp-empty cp-empty-qa">No questions yet — ask the first one.</div>`;
    const list = $("cp-qa-list");
    if (list.__html !== html) { list.innerHTML = html; list.__html = html; }
    $("cp-qa-count").textContent = D.qa.length ? String(D.qa.length) : "";
  }
  async function onQAClick(e) {
    const t = e.target;
    const rp = t.closest("[data-qa-reply]");
    if (rp) {
      qaParent = rp.dataset.qaReply;
      const q = D.qa.find((x) => x.id === qaParent);
      const box = $("cp-qa-reply");
      box.hidden = false; box.innerHTML = `<span>${tr("Replying to")} <b data-no-i18n>${short(q ? q.wallet : "")}</b></span><button type="button" class="cp-link" data-qa-unreply>×</button>`;
      $("cp-qa-text").focus();
      return;
    }
    if (t.closest("[data-qa-unreply]")) { qaParent = null; $("cp-qa-reply").hidden = true; return; }
    if (t.closest("[data-qa-all]")) { qaAll = true; renderQA(); return; }
    const hid = t.closest("[data-hide]");
    if (hid) return hideItem(hid.dataset.hide);
    if (!t.closest("#cp-qa-post") || busy) return;
    const text = String($("cp-qa-text").value || "").replace(/\s+\n/g, "\n").trim();
    if (text.length < 3) { toast("Write at least 3 characters.", "bad"); return; }
    busy = true;
    const btn = $("cp-qa-post"); btn.disabled = true;
    try {
      const parent = qaParent || "";
      const r = await signed(async (wallet, issued) => post({ action: "cqa", wallet, text, parent, issued, signature: await state.signer.signMessage(qaMessage(wallet, text, parent, issued)) }));
      if (!r) return;
      $("cp-qa-text").value = ""; qaParent = null; $("cp-qa-reply").hidden = true;
      toast("Posted.", "ok");
      await load();
      const el = document.querySelector(`#cp-qa-list [data-id="${r.id}"]`);
      if (el) el.classList.add("cp-new");
    } catch (err) { toast(errMsg(err), "bad"); } finally { busy = false; btn.disabled = false; }
  }
  async function hideItem(spec) {
    const [kind, id] = spec.split(":");
    try {
      const r = await signed(async (wallet, issued) => post({ action: "chide", wallet, kind, id, issued, signature: await state.signer.signMessage(hideMessage(wallet, kind, id, issued)) }));
      if (r) { toast("Hidden.", "ok"); await load(); }
    } catch (err) { toast(errMsg(err), "bad"); }
  }

  // ================= proposals (Projects tab) =================
  function renderProps() {
    const panel = $("bp-panel-projects");
    if (!panel) return;
    const wrap = panel.querySelector(".bp-simple");
    let board = $("cp-props");
    if (!D) { if (board) board.remove(); return; }
    if (!board) {
      const intro = wrap.querySelector("p"), empty = wrap.querySelector(".bp-empty");
      if (intro) intro.textContent = tr("Propose a project for a future CirclePad round, and back the ones you'd put USDC into. The most-backed ideas are the shortlist for the next round.");
      if (empty) empty.remove();
      board = document.createElement("div");
      board.id = "cp-props"; board.className = "cp-props";
      wrap.classList.add("cp-props-wrap");
      board.innerHTML = `<div class="cp-prop-side"><div class="cp-prop-form bp-card"><div class="bp-card-head">Propose a project</div>
          <input id="cp-prop-title" class="bp-contribute-input" maxlength="80" placeholder="${esc(tr("Project name"))}">
          <textarea id="cp-prop-pitch" class="bp-contribute-input" maxlength="400" rows="3" placeholder="${esc(tr("What is it, and why should the circle fund it? (10–400 characters)"))}"></textarea>
          <input id="cp-prop-link" class="bp-contribute-input" maxlength="200" placeholder="${esc(tr("Link (optional) — https://…"))}">
          <div class="cp-qa-foot"><small>Signed with your wallet. Three a day per wallet.</small><button type="button" class="bp-btn-primary" id="cp-prop-go">Submit</button></div></div></div>
        <div class="cp-prop-main-col"><div class="cp-tabs" role="tablist"><button type="button" role="tab" data-sort="top" class="on">Most backed</button><button type="button" role="tab" data-sort="new">Newest</button></div>
        <div class="cp-prop-list" id="cp-prop-list"></div></div>`;
      wrap.appendChild(board);
      board.addEventListener("click", onPropClick);
    }
    const isTeam = me() && me() === lc(D.recipient);
    const mineUp = new Set(D.myUpvotes || []);
    const byTop = [...D.proposals].sort((a, b) => b.up - a.up || b.at - a.at);
    const rankOf = new Map(byTop.map((p, i) => [p.id, i]));
    const list0 = propSort === "new" ? [...D.proposals].sort((a, b) => b.at - a.at) : byTop;
    const maxUp = Math.max(1, ...D.proposals.map((p) => p.up));
    const MEDAL = ["cp-gold", "cp-silver", "cp-bronze"];
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
    const html = list0.length ? list0.map((p) => { const i = rankOf.get(p.id); return `<article class="cp-prop${i < 3 && p.up > 0 ? " is-top " + MEDAL[i] : ""}" data-id="${p.id}" style="--cp-upw:${Math.round((p.up / maxUp) * 100)}%">
        <button type="button" class="cp-up${mineUp.has(p.id) ? " on" : ""}" data-up="${p.id}" aria-pressed="${mineUp.has(p.id)}" aria-label="Back this project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg><b data-no-i18n>${p.up}</b></button>
        <div class="cp-prop-main"><h3 data-no-i18n>${esc(p.title)}</h3><p data-no-i18n>${esc(p.pitch)}</p>
          <div class="cp-qa-meta">${dot(p.wallet, 16)}<span data-no-i18n>${short(p.wallet)}</span><span class="cp-ago" data-no-i18n>${ago(p.at)}</span>
          ${p.link ? `<a class="cp-domain" href="${esc(p.link)}" target="_blank" rel="nofollow noopener ugc" data-no-i18n>${esc(host(p.link))} ↗</a>` : ""}
          ${isTeam ? `<button type="button" class="cp-link cp-muted" data-hide="prop:${p.id}">Hide</button>` : ""}</div><i class="cp-upbar" aria-hidden="true"></i></div>${i < 3 && p.up > 0 ? `<span class="cp-medal" aria-hidden="true" data-no-i18n>${i + 1}</span>` : ""}</article>`; }).join("")
      : `<div class="bp-empty">No proposals yet — the first idea sets the bar.</div>`;
    const list = $("cp-prop-list");
    if (list.__html !== html) {
      // cards slide to their new place when the order changes
      const before = new Map([...list.querySelectorAll(".cp-prop")].map((el) => [el.dataset.id, el.getBoundingClientRect().top]));
      list.innerHTML = html; list.__html = html;
      if (before.size && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        list.querySelectorAll(".cp-prop").forEach((el) => {
          const was = before.get(el.dataset.id); if (was == null) return;
          const dy = was - el.getBoundingClientRect().top; if (Math.abs(dy) < 2) return;
          el.style.transform = `translateY(${dy}px)`; el.style.transition = "none";
          requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = "transform .5s cubic-bezier(.2,.8,.2,1)"; el.style.transform = ""; }));
        });
      }
    }
    board.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b.dataset.sort === propSort));
  }
  let propSort = "top";
  async function onPropClick(e) {
    const t = e.target;
    const so = t.closest("[data-sort]");
    if (so) { propSort = so.dataset.sort; renderProps(); return; }
    const hid = t.closest("[data-hide]");
    if (hid) return hideItem(hid.dataset.hide);
    const up = t.closest("[data-up]");
    if (up && !up.classList.contains("on")) {
      const id = up.dataset.up;
      try {
        const r = await signed(async (wallet) => post({ action: "cprop-up", wallet, id, signature: await state.signer.signMessage(upMessage(wallet, id)) }));
        if (r) { up.classList.add("on", "cp-pop"); const b = up.querySelector("b"); b.textContent = String(r.up); await load(); }
      } catch (err) { toast(errMsg(err), "bad"); }
      return;
    }
    if (!t.closest("#cp-prop-go") || busy) return;
    const p = { title: $("cp-prop-title").value.trim(), pitch: $("cp-prop-pitch").value.trim(), link: $("cp-prop-link").value.trim() };
    if (p.link && !/^https:\/\//i.test(p.link)) p.link = "https://" + p.link.replace(/^http:\/\//i, "");
    if (p.title.length < 3) { toast("Give the project a name (3+ characters).", "bad"); return; }
    if (p.pitch.length < 10) { toast("Add a short pitch (10+ characters).", "bad"); return; }
    busy = true;
    try {
      const r = await signed(async (wallet, issued) => post({ action: "cprop", wallet, ...p, issued, signature: await state.signer.signMessage(propMessage(wallet, p, issued)) }));
      if (!r) return;
      ["cp-prop-title", "cp-prop-pitch", "cp-prop-link"].forEach((id) => { $(id).value = ""; });
      toast("Proposal posted.", "ok");
      await load();
    } catch (err) { toast(errMsg(err), "bad"); } finally { busy = false; }
  }

  // ================= leaderboard chips =================
  const badgeCache = new Map();
  async function decorateLeaderboard() {
    const rows = [...document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row")];
    const addrOf = (r) => { const a = r.querySelector(".bp-lb-ext"); const m = a && /0x[0-9a-fA-F]{40}/.exec(a.getAttribute("href") || ""); return m ? lc(m[0]) : null; };
    const addrs = [...new Set(rows.map(addrOf).filter(Boolean))];
    const need = addrs.filter((a) => !badgeCache.has(a));
    if (need.length) {
      try {
        const j = await (await fetch(`${API}?circle=badges&addrs=${need.join(",")}`)).json();
        need.forEach((a) => badgeCache.set(a, (j.badges || {})[a] || {}));
      } catch (e) { /* chips are optional */ }
    }
    const refs = new Map(((D && D.refs) || []).map((r) => [lc(r.ref), r]));
    rows.forEach((r) => {
      const a = addrOf(r); if (!a) return;
      const b = badgeCache.get(a) || {}, rf = refs.get(a);
      const chips = [
        a === me() ? `<span class="cp-chip cp-chip-me">You</span>` : "",
        b.launches ? `<span class="cp-chip cp-chip-arc" title="${esc(tr("Launched coins on ArcPad"))}">ArcPad creator</span>` : "",
        b.arcircle ? `<span class="cp-chip cp-chip-hold">$ARCIRCLE</span>` : "",
        rf ? `<span class="cp-chip cp-chip-ref" title="${esc(tr("USDC contributed through this wallet's invite link"))}"><span>Brought in</span> <b data-no-i18n>${num(rf.amount)}</b></span>` : "",
      ].join("");
      const block = r.querySelector(".bp-lb-addr-block") || r;
      let c = block.querySelector(".cp-chips");
      if (!chips) { if (c) c.remove(); return; }
      if (!c) { c = document.createElement("div"); c.className = "cp-chips"; block.appendChild(c); }
      if (c.innerHTML !== chips) c.innerHTML = chips;
    });
    // Top inviters, under the full leaderboard
    const full = $("bp-full-leaderboard");
    if (full && D && D.refs.length) {
      let box = $("cp-inviters");
      if (!box) { box = document.createElement("div"); box.id = "cp-inviters"; box.className = "cp-inviters"; full.insertAdjacentElement("afterend", box); }
      box.innerHTML = `<h4>Top inviters</h4>` + D.refs.slice(0, 5).map((x, i) => `<div class="cp-inv-row"><span class="bp-lb-rank" data-no-i18n>#${i + 1}</span>${dot(x.ref, 18)}<span class="bp-lb-addr" data-no-i18n>${short(x.ref)}</span><span class="cp-inv-amt" data-no-i18n>${num(x.amount)} USDC · ${x.n}</span></div>`).join("");
    }
  }
  document.addEventListener("circlepad:lb", () => { decorateLeaderboard(); if (D) paintPreStats(!started()); });

  // ================= invite + share card + history =================
  let hist = { key: null, html: "" };
  const blockTs = new Map();
  async function renderMine() {
    const w = me();
    const pos = $("bp-position-body");
    const side = $("bp-my-position");
    const mineAmt = window.circlepadFx ? window.circlepadFx.mine() : 0;
    // invite / share row, under the round panel's "your contribution" line
    let row = $("cp-share-row");
    if (w && mineAmt > 0 && side) {
      if (!row) { row = document.createElement("div"); row.id = "cp-share-row"; row.className = "cp-share-row"; side.insertAdjacentElement("afterend", row); row.addEventListener("click", onShare); }
      row.innerHTML = `<button type="button" class="cp-link" data-share-card><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.8l7.7-8.8L1.3 2.5h6.8l4.7 6.1zm-1.2 17h1.8L7.1 4.4H5.2z"/></svg><span>Share my card</span></button><button type="button" class="cp-link" data-copy-invite><span>Copy invite link</span></button>`;
    } else if (row) row.remove();
    // My Position tab: history + the same actions
    const panel = $("bp-panel-position");
    if (!panel || !w) { const h = $("cp-history"); if (h) h.remove(); return; }
    let box = $("cp-history");
    if (!box) { box = document.createElement("div"); box.id = "cp-history"; box.className = "cp-history"; (pos || panel.lastElementChild).insertAdjacentElement("afterend", box); box.addEventListener("click", onShare); }
    // Server history first (aggregated once for everyone), the in-browser
    // event log as a fallback.
    let evs = null;
    if (started()) {
      try {
        const j = await (await fetch(`${API}?circle=lb&wallet=${w}${(CONFIG.CIRCLEPAD_ROUND || 1) > 1 ? "&round=" + CONFIG.CIRCLEPAD_ROUND : ""}`, { cache: "no-store" })).json();
        if (j && Array.isArray(j.mine)) evs = j.mine.map((e, i) => { const n = -1 - i; blockTs.set(n, e.ts * 1000); return { kind: e.kind, amount: e.amount, blockNumber: n }; });
      } catch (e) { evs = null; }
    }
    let log = null;
    if (!evs) try { log = typeof circlepadLogCache === "function" ? circlepadLogCache() : null; } catch (e) { log = null; }
    if (!evs) evs = log ? [...log.contributed.map((e) => ({ ...e, kind: "in" })), ...log.refunded.map((e) => ({ ...e, kind: "out" }))].filter((e) => lc(e.contributor) === w).sort((a, b) => b.blockNumber - a.blockNumber || (b.index || 0) - (a.index || 0)).slice(0, 25) : [];
    const missing = [...new Set(evs.map((e) => e.blockNumber))].filter((n) => n >= 0 && !blockTs.has(n)).slice(0, 25);
    if (missing.length && typeof readProvider === "function") {
      try { const bs = await Promise.all(missing.map((n) => readProvider().getBlock(n))); missing.forEach((n, i) => blockTs.set(n, bs[i] ? Number(bs[i].timestamp) * 1000 : 0)); } catch (e) { /* times are optional */ }
    }
    const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
    const html = `<div class="cp-hist-acts"><button type="button" class="bp-btn-ghost" data-share-card><span>Share my card</span></button><button type="button" class="bp-btn-ghost" data-copy-invite><span>Copy invite link</span></button></div>
      <h4>Your activity</h4>${evs.length ? evs.map((e) => `<div class="cp-hist-row cp-hist-${e.kind}"><span class="cp-hist-k">${e.kind === "in" ? "Contributed" : "Withdrew"}</span><b data-no-i18n>${e.kind === "in" ? "+" : "−"}${num(Number(ethers.formatEther(BigInt(e.amount))))} USDC</b><span class="cp-ago" data-no-i18n>${esc(fmtTime(blockTs.get(e.blockNumber)))}</span></div>`).join("")
        : `<div class="bp-empty">Nothing yet from this wallet in this round.</div>`}`;
    if (hist.key !== w || hist.html !== html) { box.innerHTML = html; hist = { key: w, html }; }
  }
  async function onShare(e) {
    const w = me(); if (!w) return;
    if (e.target.closest("[data-share-card]")) {
      const text = `I'm in the CirclePad round on Arc 💚 One project, one 72h USDC raise — and everyone in it votes on what it becomes.`;
      window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(cardUrl(w))}&via=ARCIRCLEonArc`, "_blank", "noopener,width=600,height=560");
    } else if (e.target.closest("[data-copy-invite]")) {
      try { await navigator.clipboard.writeText(inviteUrl(w)); toast("Invite link copied — contributions through it are credited to you.", "ok"); }
      catch (err) { toast(inviteUrl(w)); }
    }
  }

  // ================= wiring =================
  function render() {
    try { renderPledge(); renderQA(); renderProps(); decorateLeaderboard(); renderMine(); } catch (e) { console.warn("circlepad-community", e); }
  }
  if (typeof refreshAccountDependentViews === "function") {
    const orig = refreshAccountDependentViews;
    // eslint-disable-next-line no-global-assign
    refreshAccountDependentViews = function () { orig.apply(this, arguments); load(); };
  }
  document.addEventListener("circlepad:state", () => { if (D) renderPledge(); renderMine(); });
  document.addEventListener("arc:lang", render);
  load();
  setInterval(() => { if (!document.hidden) load(); }, 30e3);
})();
;
/* ---- circlepad-plus.js ---- */
/* global ethers, CONFIG, state, applyCirclepadState, renderCirclepadLeaderboard, connectWallet, readProvider, _circlepadDeadline */
// circlepad-plus.js — the contribution flow, the transparency dashboard and
// the "circle" moments for CirclePad. circlepad.js still owns the escrow
// reads and the contribute transaction; this file only adds around them:
//   • amount chips (10 / 50 / 100 / Max) and a live "your share would be"
//     preview; on phones a sticky bar and a bottom sheet to contribute
//   • after a contribution: the share card flips over — member number,
//     amount, share, invite link, X / image
//   • "opens at" countdown and calendar files for the opening (when
//     CONFIG.CIRCLEPAD_OPENS_AT is set) — the close one lives in circlepad.js
//   • Transparency: the escrow's live balance, source-verified badge, the
//     three payout wallets, net raised hour by hour, wallets / median /
//     Lorenz curve, and what happens after the close
//   • The Circle: every contributor as a dot on slowly turning orbits, new
//     ones flying in; a live feed of who just joined; my rank pinned on the
//     leaderboard
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-round-panel")) return;
  const $ = (id) => document.getElementById(id);
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (a) => String(a || "").toLowerCase();
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const toNum = (w) => { try { return Number(ethers.formatEther(BigInt(w || 0))); } catch { return 0; } };
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 }));
  const sh = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const hue = (a) => (parseInt(String(a).slice(2, 8), 16) || 0) % 360;
  const ex = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const ESCROW = String(CONFIG.CIRCLEPAD_ESCROW_ADDRESS || "");
  const me = () => (state && state.account ? lc(state.account) : "");
  const loc = () => { const l = window.arcI18n && window.arcI18n.get(); return l === "ko" ? "ko-KR" : l === "zh" ? "zh-CN" : "en-US"; };
  const when = (ts) => new Date(ts * 1000).toLocaleString(loc(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const inviteUrl = (w) => `https://www.arcircle.app/circle?ref=${w}`;
  const cardUrl = (w) => `https://www.arcircle.app/round${w ? `?w=${w}` : ""}`;

  let S = null, rows = [], activity = [], firstLb = true, wallets = null;

  // ================= amount chips + share preview =================
  // the desktop input already has its own Max button next to it, so the chips there skip it
  function chipsHtml(id, withMax = true) {
    return `<div class="cpx-chips" id="${id}">${[10, 50, 100].map((v) => `<button type="button" data-amt="${v}" data-no-i18n>${v}</button>`).join("")}${withMax ? `<button type="button" data-amt="max">${esc(tr("Max"))}</button>` : ""}</div><p class="cpx-preview" id="${id}-p" aria-live="polite"></p>`;
  }
  function preview(val, el) {
    if (!el || !S) return;
    const x = Number(String(val || "").replace(/,/g, "")) || 0;
    if (!S.isOpen || !(x > 0)) { el.innerHTML = ""; el.classList.remove("on"); return; }
    const total = toNum(S.totalRaised), mine = toNum(S.myContribution || 0n);
    const share = ((mine + x) / (total + x)) * 100;
    const order = window.circlepadLbExtra && window.circlepadLbExtra.joinOrder;
    const joined = order ? order.length : rows.length;
    const isNew = !(mine > 0);
    el.innerHTML = `${esc(tr("Your share after this"))} <b data-no-i18n>${share >= 10 ? share.toFixed(1) : share.toFixed(2)}%</b> <span>${esc(tr("of"))} <span data-no-i18n>${fmt(total + x)} USDC</span></span>${isNew ? ` · <span>${esc(tr(`member #${joined + 1}`))}</span>` : ""}`;
    el.classList.add("on");
  }
  async function maxAmount() {
    if (!state.account && typeof connectWallet === "function") { try { await connectWallet(); } catch { /* cancelled */ } }
    if (!state.account) return null;
    const bal = await readProvider().getBalance(state.account).catch(() => null);
    if (bal == null) return null;
    const buf = ethers.parseEther("0.05");
    const v = bal > buf ? bal - buf : 0n;
    return String(Math.floor(Number(ethers.formatEther(v)) * 100) / 100);
  }
  function wireChips(box, input, prev) {
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-amt]");
      if (!b) return;
      box.querySelectorAll("[data-amt]").forEach((x) => x.classList.toggle("on", x === b));
      input.value = b.dataset.amt === "max" ? (await maxAmount()) || input.value : b.dataset.amt;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (!reduce) { input.classList.remove("cpx-pop"); void input.offsetWidth; input.classList.add("cpx-pop"); }
    });
    input.addEventListener("input", () => {
      preview(input.value, prev);
      box.querySelectorAll("[data-amt]").forEach((x) => x.classList.toggle("on", x.dataset.amt === input.value));
    });
  }
  (function mountChips() {
    const row = $("bp-contribute-row"), input = $("bp-contribute-amount");
    if (!row || !input) return;
    row.insertAdjacentHTML("afterend", chipsHtml("cpx-chips", !$("bp-contribute-max")));
    wireChips($("cpx-chips"), input, $("cpx-chips-p"));
  })();

  // ================= phones: sticky bar + bottom sheet =================
  const bar = document.createElement("div");
  bar.className = "cpx-bar"; bar.id = "cpx-bar"; bar.hidden = true;
  bar.innerHTML = `<span class="cpx-bar-dot"></span><span class="cpx-bar-t"><b data-no-i18n id="cpx-bar-amt"></b><small id="cpx-bar-time" data-no-i18n></small></span><button type="button" class="cpx-bar-go" id="cpx-bar-go">${esc(tr("Contribute"))}</button>`;
  document.body.appendChild(bar);
  const sheet = document.createElement("div");
  sheet.className = "cpx-sheet"; sheet.id = "cpx-sheet"; sheet.hidden = true;
  sheet.innerHTML = `<div class="cpx-sheet-bg" data-close></div>
    <div class="cpx-sheet-box" role="dialog" aria-modal="true" aria-labelledby="cpx-sheet-h">
      <i class="cpx-grab" aria-hidden="true"></i>
      <h3 id="cpx-sheet-h">${esc(tr("Join the circle"))}</h3>
      <p class="cpx-sheet-bal" id="cpx-sheet-bal"></p>
      <div class="cpx-sheet-in"><input id="cpx-sheet-amt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" aria-label="${esc(tr("USDC amount"))}"><span>USDC</span></div>
      <div class="cp-conv-in" data-cp-conv-in="cpx-sheet-amt" data-no-i18n></div>
      ${chipsHtml("cpx-sheet-chips")}
      <button type="button" class="bp-btn-primary bp-btn-block cpx-sheet-go" id="cpx-sheet-go">${esc(tr("Contribute USDC"))}</button>
      <p class="cpx-sheet-note">${esc(tr("You can withdraw your own USDC any time before the raise closes."))}</p>
    </div>`;
  document.body.appendChild(sheet);
  wireChips($("cpx-sheet-chips"), $("cpx-sheet-amt"), $("cpx-sheet-chips-p"));
  function openSheet() {
    if (!S || !S.isOpen) return;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("in"));
    $("cpx-sheet-bal").innerHTML = state.account && S.myWalletBalance != null ? `${esc(tr("Balance"))} <b data-no-i18n>${fmt(toNum(S.myWalletBalance))} USDC</b>` : esc(tr("Connect your wallet to contribute."));
    setTimeout(() => $("cpx-sheet-amt").focus(), 250);
  }
  function closeSheet() { sheet.classList.remove("in"); setTimeout(() => { sheet.hidden = true; }, 280); }
  sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
  $("cpx-bar-go").addEventListener("click", openSheet);
  $("cpx-sheet-go").addEventListener("click", () => {
    const v = $("cpx-sheet-amt").value;
    const main = $("bp-contribute-amount"), go = $("bp-contribute-btn");
    if (!main || !go) return;
    main.value = v;
    main.dispatchEvent(new Event("input", { bubbles: true }));
    sheetBusy = true;
    go.click();
  });
  let sheetBusy = false;
  // the sheet's button mirrors the main button ("Confirm in wallet…", "Confirming…")
  const mainBtn = $("bp-contribute-btn");
  if (mainBtn && "MutationObserver" in window) {
    new MutationObserver(() => {
      if (sheet.hidden) return;
      const g = $("cpx-sheet-go");
      g.textContent = mainBtn.textContent; g.disabled = mainBtn.disabled && sheetBusy;
    }).observe(mainBtn, { childList: true, characterData: true, subtree: true, attributes: true });
  }
  function paintBar() {
    const open = !!(S && S.isOpen);
    const ch = $("cpx-chips"), cp = $("cpx-chips-p");
    if (ch) ch.hidden = !open;
    if (cp) cp.hidden = !open;
    bar.hidden = true; // no floating contribute bar on phones (the page's own panel and the quick bar cover it)
    document.body.classList.toggle("cpx-has-bar", open);
    if (!open) return;
    $("cpx-bar-amt").textContent = `${fmt(toNum(S.totalRaised))} USDC`;
    const rem = _circlepadDeadline ? _circlepadDeadline - Math.floor(Date.now() / 1000) : 0;
    $("cpx-bar-time").textContent = rem > 0 ? (rem >= 86400 ? `${Math.floor(rem / 86400)}d ${Math.floor((rem % 86400) / 3600)}h` : `${Math.floor(rem / 3600)}h ${Math.floor((rem % 3600) / 60)}m`) : "";
    bar.classList.toggle("urgent", rem > 0 && rem < 3600);
  }
  setInterval(() => { if (S && S.isOpen) paintBar(); }, 30e3);

  // ================= the share card, after a contribution =================
  const card = document.createElement("div");
  card.className = "cpx-card"; card.id = "cpx-card"; card.hidden = true;
  document.body.appendChild(card);
  function memberNo(a) {
    const order = window.circlepadLbExtra && window.circlepadLbExtra.joinOrder;
    const i = order ? order.indexOf(lc(a)) : -1;
    return i >= 0 ? i + 1 : 0;
  }
  function showCard() {
    const w = me();
    if (!w || !S) return;
    const mine = toNum(S.myContribution || 0n), total = toNum(S.totalRaised);
    const share = total > 0 ? (mine / total) * 100 : 0;
    const n = memberNo(w) || (rows.findIndex((r) => lc(r.address) === w) >= 0 ? 0 : rows.length + 1);
    const text = `I'm in the CirclePad round on Arc 💚 ${fmt(mine)} USDC in${n ? `, member #${n}` : ""}. One project, one 72h USDC raise — and everyone in it votes on what it becomes.`;
    card.innerHTML = `<div class="cpx-card-bg" data-close></div>
      <div class="cpx-flip${reduce ? " flipped" : ""}" role="dialog" aria-modal="true" aria-label="${esc(tr("Your CirclePad card"))}">
        <div class="cpx-face cpx-front"><span class="cpx-orb" style="--h:${hue(w)}"></span><b>${esc(tr("Joining the circle…"))}</b></div>
        <div class="cpx-face cpx-back">
          <button type="button" class="cpx-x" data-close aria-label="${esc(tr("Close"))}">×</button>
          <span class="cpx-k" data-no-i18n>${esc(window.cpRT ? window.cpRT("CirclePad · Round #1") : tr("CirclePad · Round #1"))}</span>
          <div class="cpx-me"><span class="cpx-av" style="--h:${hue(w)}"></span><b data-no-i18n>${esc(sh(ethers.getAddress(w)))}</b></div>
          <h3>${esc(tr("You're in the circle"))}</h3>
          <div class="cpx-nums">
            ${n ? `<div><b data-no-i18n>#${n}</b><small>${esc(tr("member"))}</small></div>` : ""}
            <div><b data-no-i18n>${fmt(mine)}</b><small>USDC</small></div>
            <div><b data-no-i18n>${share >= 10 ? share.toFixed(1) : share.toFixed(2)}%</b><small>${esc(tr("of the raise"))}</small></div>
          </div>
          <label class="cpx-inv">${esc(tr("Your invite link"))}<span><input type="text" readonly value="${esc(inviteUrl(w))}" data-no-i18n><button type="button" data-copy>${esc(tr("Copy"))}</button></span></label>
          <small class="cpx-inv-note">${esc(tr("Contributions through it are credited to you on the leaderboard."))}</small>
          <div class="cpx-acts">
            <a class="bp-btn-primary" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(cardUrl(w))}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${esc(tr("Share on X"))}</a>
            <a class="bp-btn-ghost" href="/api/og?round=1&w=${w}" target="_blank" rel="noopener" download="circlepad-card.png">${esc(tr("Save the image"))}</a>
          </div>
        </div>
      </div>`;
    card.hidden = false;
    requestAnimationFrame(() => { card.classList.add("in"); if (!reduce) setTimeout(() => card.querySelector(".cpx-flip").classList.add("flipped"), 650); });
  }
  function closeCard() { card.classList.remove("in"); setTimeout(() => { card.hidden = true; card.innerHTML = ""; }, 300); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !card.hidden) closeCard(); });
  card.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) { closeCard(); return; }
    const c = e.target.closest("[data-copy]");
    if (c) { try { await navigator.clipboard.writeText(inviteUrl(me())); c.textContent = tr("Copied"); } catch { /* denied */ } }
  });

  // ================= opening time: countdown + calendar =================
  const opensAt = Number(CONFIG.CIRCLEPAD_OPENS_AT) || 0;
  const opens = document.createElement("div");
  opens.className = "cpx-opens"; opens.hidden = true;
  const cd = $("bp-round-countdown");
  if (cd) cd.insertAdjacentElement("afterend", opens);
  function ics(start, end, title, desc, file) {
    const d = (x) => new Date(x * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE PAD//CirclePad//EN", "BEGIN:VEVENT",
      `UID:circlepad-${lc(ESCROW)}-${start}@arcircle.app`, `DTSTAMP:${d(Math.floor(Date.now() / 1000))}`, `DTSTART:${d(start)}`, `DTEND:${d(end)}`,
      `SUMMARY:${title}`, `DESCRIPTION:${desc} https://www.arcircle.app/circle`, "URL:https://www.arcircle.app/circle",
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${title}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function paintOpens() {
    const show = !!(opensAt && S && !S.started);
    opens.hidden = !show;
    if (!show) return;
    const rem = opensAt - Math.floor(Date.now() / 1000);
    const t = rem > 0 ? `${Math.floor(rem / 86400) ? Math.floor(rem / 86400) + "d " : ""}${String(Math.floor((rem % 86400) / 3600)).padStart(2, "0")}:${String(Math.floor((rem % 3600) / 60)).padStart(2, "0")}:${String(rem % 60).padStart(2, "0")}` : "";
    const html = `<span class="cpx-opens-l">${esc(tr(rem > 0 ? "Opens in" : "Opening any moment"))}</span>${t ? `<b data-no-i18n>${t}</b>` : ""}<small>${esc(when(opensAt))}</small>
      <button type="button" class="bp-notify-link" data-ics="open">${esc(tr("Add the opening to my calendar"))}</button>`;
    if (opens.__h !== html) { opens.innerHTML = html; opens.__h = html; }
  }
  opens.addEventListener("click", (e) => { if (e.target.closest("[data-ics]")) ics(opensAt, opensAt + 3600, "CirclePad raise opens", "The 72-hour CirclePad raise opens.", "circlepad-raise-opens.ics"); });
  setInterval(() => { if (!opens.hidden) paintOpens(); }, 1000);

  // ================= transparency =================
  const trust = document.createElement("section");
  trust.className = "cpx-trust"; trust.id = "cpx-trust";
  const anchor = $("cp-flowcard") || $("bp-featured");
  if (anchor) anchor.insertAdjacentElement("afterend", trust);
  // "How Round #N closes" at the bottom of Home said the same as this card and its questions: one place for it
  const howCloses = document.querySelector("#bp-panel-home > .bp-nextcard");
  if (howCloses) howCloses.hidden = true;
  // circlepad-v5.js asks the explorer about the running round's escrow (window.cpEscrowVerified); the flag is Round #1's
  const isVerified = () => window.cpEscrowVerified != null ? window.cpEscrowVerified === true : CONFIG.CIRCLEPAD_ESCROW_VERIFIED === true && (CONFIG.CIRCLEPAD_ROUND || 1) === 1;
  function faq() {
    const note = String(CONFIG.CIRCLEPAD_ALLOCATION_NOTE || "").trim();
    const Q = [
      ["Can I get my USDC back?", "Yes — any amount, any time until the 72 hours are up. \"Withdraw my contribution\" sends it straight back from the escrow; nobody else can move your USDC while the raise is open."],
      ["What happens when the 72 hours end?", "Contributions and withdrawals stop. Everything the escrow holds is then split in one transaction: 80% to the recipient wallet, 15% to the treasury wallet and 5% to the platform wallet — the addresses above, fixed in the contract."],
      ["Who can split it, and can it happen early?", "Only the recipient wallet can call the split, and the contract refuses it until the raise has closed."],
      [CONFIG.CIRCLEPAD_ROUND_PLAN ? "How are the rewards shared with contributors?" : "How is the new coin shared with contributors?", note || "Not decided yet — the team announces it here. The list of contributors at the close is public on-chain, so anyone can check who was in and how much."],
      ["Is the contract's code public?", isVerified() ? "Yes — the escrow's source is verified on the explorer, so what it does can be read line by line." : "The source hasn't been verified on the explorer yet. The code is in the project's repository (contracts/BigPadEscrow.sol); this note changes once it is verified."],
    ];
    return `<div class="cpx-faq"><h4>${esc(tr("After the close — questions"))}</h4>${Q.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(tr(q))}</summary><p>${esc(tr(a))}</p></details>`).join("")}</div>`;
  }
  function median(xs) { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function lorenz(xs) {
    const v = xs.filter((x) => x > 0).sort((a, b) => a - b), n = v.length, tot = v.reduce((s, x) => s + x, 0);
    if (!n || !tot) return { pts: [[0, 0], [1, 1]], gini: 0 };
    let cum = 0, area = 0, prev = 0;
    const pts = [[0, 0]];
    v.forEach((x, i) => { cum += x; const y = cum / tot; area += (prev + y) / 2 / n; prev = y; if (n <= 40 || (i + 1) % Math.ceil(n / 40) === 0 || i === n - 1) pts.push([(i + 1) / n, y]); });
    return { pts, gini: Math.max(0, Math.min(1, 1 - 2 * area)) };
  }
  function seriesFallback() {
    // no server: rebuild the hourly net from this browser's event log, block
    // times interpolated from the round's start to now
    try {
      const log = typeof circlepadLogCache === "function" ? circlepadLogCache() : null;
      if (!log || log.from == null || !_circlepadDeadline) return null;
      const t0 = _circlepadDeadline - 72 * 3600, now = Math.min(Math.floor(Date.now() / 1000), _circlepadDeadline);
      const ev = [...log.contributed.map((e) => [1, e]), ...log.refunded.map((e) => [0, e])].sort((a, b) => a[1].blockNumber - b[1].blockNumber || (a[1].index || 0) - (b[1].index || 0));
      const last = Math.max(log.scannedTo || log.from, log.from + 1);
      const spb = Math.max(0.05, (now - t0) / Math.max(1, last - log.from));
      const tsAt = (n) => t0 + (n - log.from) * spb;
      const out = []; let run = 0n, i = 0;
      for (let t = t0 + 3600; ; t += 3600) { const cut = Math.min(t, now); while (i < ev.length && tsAt(ev[i][1].blockNumber) <= cut) { run += ev[i][0] ? BigInt(ev[i][1].amount) : -BigInt(ev[i][1].amount); i++; } out.push([cut, run.toString()]); if (cut >= now || out.length > 100) break; }
      const order = []; const seen = new Set();
      for (const [k, e] of ev) { const a = lc(e.contributor); if (k && !seen.has(a)) { seen.add(a); order.push(a); } }
      window.circlepadLbExtra = { joinOrder: order, series: out, startTs: t0 };
      return out;
    } catch { return null; }
  }
  function chart(series) {
    if (!series || series.length < 1) return `<div class="cpx-chart-empty">${esc(tr("The chart starts when the raise opens."))}</div>`;
    const pts = series.map(([t, v]) => [Number(t), toNum(v)]);
    const t0 = (window.circlepadLbExtra && window.circlepadLbExtra.startTs) || pts[0][0] - 3600, t1 = t0 + 72 * 3600;
    const maxV = Math.max(1, ...pts.map((p) => p[1]));
    const X = (t) => ((t - t0) / (t1 - t0)) * 600, Y = (v) => 150 - (v / maxV) * 130;
    const d = `M0 150 L${X(t0).toFixed(1)} ${Y(0).toFixed(1)} ` + pts.map(([t, v]) => `L${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    const lastP = pts[pts.length - 1];
    return `<svg class="cpx-chart" viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label="${esc(tr("Net USDC raised, hour by hour"))}">
        <defs><linearGradient id="cpxArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#39ff88" stop-opacity=".35"/><stop offset="1" stop-color="#39ff88" stop-opacity="0"/></linearGradient></defs>
        ${[0.25, 0.5, 0.75].map((k) => `<line x1="0" x2="600" y1="${(150 - k * 130).toFixed(1)}" y2="${(150 - k * 130).toFixed(1)}" class="g"/>`).join("")}
        ${[24, 48].map((hh) => `<line y1="10" y2="150" x1="${X(t0 + hh * 3600).toFixed(1)}" x2="${X(t0 + hh * 3600).toFixed(1)}" class="g"/>`).join("")}
        <path d="${d} L${X(lastP[0]).toFixed(1)} 150 Z" fill="url(#cpxArea)"/>
        <path d="${d.replace(/^M0 150 L/, "M")}" class="l" pathLength="1"/>
        <circle cx="${X(lastP[0]).toFixed(1)}" cy="${Y(lastP[1]).toFixed(1)}" r="4.5" class="dot"/>
        <text x="4" y="166">${esc(tr("Day 1"))}</text><text x="${X(t0 + 24 * 3600) + 4}" y="166">${esc(tr("Day 2"))}</text><text x="${X(t0 + 48 * 3600) + 4}" y="166">${esc(tr("Day 3"))}</text>
        <text x="596" y="22" text-anchor="end" class="v">${fmt(maxV)} USDC</text></svg>`;
  }
  function circleSvg() {
    // every contributor on up to three orbits, the biggest on the inside
    const list = rows.map((r) => ({ a: lc(r.address), v: toNum(r.amount) }));
    const total = list.reduce((s, x) => s + x.v, 0) || 1;
    const R = [70, 104, 138], cap = [12, 28, 60];
    let k = 0;
    const m = me();
    const dots = [];
    R.forEach((r, ring) => {
      const part = list.slice(k, k + cap[ring]); k += part.length;
      part.forEach((x, i) => {
        const ang = (360 / Math.max(part.length, 1)) * i + ring * 17;
        const z = Math.max(3.2, Math.min(16, 3 + Math.sqrt(x.v / total) * 30));
        dots.push(`<g class="cpx-o o${ring}" style="--a:${ang}deg"><circle class="cpx-dot${x.a === m ? " me" : ""}${seen.size && !seen.has(x.a) ? " new" : ""}" cx="150" cy="${150 - r}" r="${z.toFixed(1)}" style="--h:${hue(x.a)}" data-a="${x.a}"><title>${sh(x.a)} · ${fmt(x.v)} USDC</title></circle></g>`);
      });
    });
    list.forEach((x) => seen.add(x.a));
    const more = list.length - k;
    return `<svg class="cpx-circle" viewBox="0 0 300 300" role="img" aria-label="${esc(tr("Every contributor, as a circle"))}">
        ${R.map((r) => `<circle class="cpx-orbit" cx="150" cy="150" r="${r}"/>`).join("")}
        <g class="cpx-spin">${dots.join("")}</g>
        <text x="150" y="146" text-anchor="middle" class="n">${list.length}</text>
        <text x="150" y="166" text-anchor="middle" class="s">${esc(tr(list.length === 1 ? "member" : "members"))}</text>
        ${more > 0 ? `<text x="150" y="296" text-anchor="middle" class="s">+${more}</text>` : ""}</svg>`;
  }
  const seen = new Set();
  function paintTrust() {
    if (!trust) return;
    const extra = window.circlepadLbExtra;
    const series = (extra && extra.series) || (S && S.started ? seriesFallback() : null);
    const vals = rows.map((r) => toNum(r.amount));
    const total = vals.reduce((s, x) => s + x, 0);
    const L = lorenz(vals);
    const lp = L.pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * 100).toFixed(1)} ${(100 - y * 100).toFixed(1)}`).join("");
    const bal = S ? toNum(S.balance) : 0;
    const w = wallets || {};
    const wl = (label, pct, a) => `<li><span>${esc(tr(label))}</span><b data-no-i18n>${pct}%</b>${bal > 0 ? `<small class="cpx-amt" data-no-i18n>≈ ${fmt((bal * pct) / 100)} USDC</small>` : ""}${a ? `<a href="${ex("address", a)}" target="_blank" rel="noopener" data-no-i18n>${sh(a)} ↗</a>` : `<em>—</em>`}</li>`;
    const same = w.recipient && w.platform && lc(w.recipient) === lc(w.platform);
    trust.innerHTML = `
      <div class="cpx-trust-head"><h3>${esc(tr("Transparency"))} <span class="cpx-live"><i></i>${esc(tr("Live"))}</span></h3><p>${esc(tr("Everything here is read from the chain — the escrow's balance, its payout wallets and every contribution."))}</p></div>
      <div class="cpx-trust-grid">
        <div class="cpx-tc cpx-escrow">
          <small>${esc(tr("Held by the escrow"))}</small>
          <b class="cpx-bal" data-no-i18n>${fmt(bal)} <span>USDC</span></b>
          <a href="${ex("address", ESCROW)}" target="_blank" rel="noopener" class="cpx-addr" data-no-i18n>${sh(ESCROW)} ↗</a>
          <span class="cpx-badge ${isVerified() ? "ok" : "no"}">${esc(tr(isVerified() ? "Source verified" : "Source not verified yet"))}</span>
          <a class="cpx-code" href="${ex("address", ESCROW)}#code" target="_blank" rel="noopener">${esc(tr("Read the contract"))} ↗</a>
        </div>
        <div class="cpx-tc cpx-wallets">
          <small>${esc(tr("At the close, in one transaction"))}</small>
          <ul>${wl("Recipient", 80, w.recipient)}${wl("Treasury", 15, w.treasury)}${wl("Platform", 5, w.platform)}</ul>
          ${same ? `<p class="cpx-same">${esc(tr("The recipient and platform wallets are the same address, so it receives 85%."))}</p>` : ""}
        </div>
        <div class="cpx-tc cpx-stats">
          <div><b data-no-i18n>${rows.length}</b><small>${esc(tr("wallets in"))}</small></div>
          <div><b data-no-i18n>${fmt(median(vals))}</b><small>${esc(tr("median USDC"))}</small></div>
          <div><b data-no-i18n>${rows.length ? fmt(total / rows.length) : 0}</b><small>${esc(tr("average USDC"))}</small></div>
          <div><b data-no-i18n>${total ? ((vals[0] || 0) / total * 100).toFixed(1) : "0"}%</b><small>${esc(tr("largest wallet"))}</small></div>
          <figure class="cpx-lorenz"><svg viewBox="-2 -2 104 104" aria-hidden="true"><path d="M0 100L100 0" class="eq"/><path d="${lp} L100 100 Z" class="a"/><path d="${lp}" class="l"/></svg>
            <figcaption><b data-no-i18n>${L.gini.toFixed(2)}</b><span>${esc(tr("Gini"))}</span><small>${esc(tr("0 = everyone put in the same, 1 = one wallet put in everything"))}</small></figcaption></figure>
        </div>
        <div class="cpx-tc cpx-chartcard">
          <small>${esc(tr("Net raised, hour by hour"))}</small>
          ${chart(series)}
        </div>
        <div class="cpx-tc cpx-circlecard">
          <small>${esc(tr("The circle"))}</small>
          ${rows.length ? circleSvg() : `<div class="cpx-chart-empty">${esc(tr(S && S.started ? "No contributors yet — be the first dot." : "Every contributor becomes a dot here once the raise opens."))}</div>`}
        </div>
        ${faq()}
      </div>`;
    // the chart line draws itself once, not on every refresh
    if (!trust.__drawn && series && series.length) { trust.__drawn = true; setTimeout(() => trust.classList.add("drawn"), 1400); }
  }
  // payout wallets, once
  (async function readWallets() {
    try {
      const c = new ethers.Contract(ESCROW, ["function recipient() view returns (address)", "function platformWallet() view returns (address)", "function treasuryWallet() view returns (address)"], readProvider());
      const [recipient, platform, treasury] = await Promise.all([c.recipient(), c.platformWallet(), c.treasuryWallet()]);
      wallets = { recipient, platform, treasury };
      paintTrust();
    } catch { /* stays "—" */ }
  })();

  // ================= live feed: who just joined =================
  const feed = document.createElement("div");
  feed.className = "cpx-feed"; feed.setAttribute("aria-live", "polite");
  document.body.appendChild(feed);
  const feedSeen = new Set();
  function feedKey(a) { return `${a.tx || ""}:${a.kind}:${lc(a.contributor)}:${a.amount}`; }
  function pushFeed(a) {
    const el = document.createElement("div");
    el.className = "cpx-fitem " + (a.kind === "out" ? "out" : "in");
    const who = sh(ethers.getAddress(a.contributor));
    el.innerHTML = `<i style="--h:${hue(a.contributor)}"></i><span>${a.kind === "out" ? esc(tr(`${who} withdrew ${fmt(toNum(a.amount))} USDC`)) : esc(tr(`${who} joined with ${fmt(toNum(a.amount))} USDC`))}</span>`;
    feed.appendChild(el);
    while (feed.children.length > 3) feed.firstChild.remove();
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 400); }, 5200);
  }
  function feedCheck() {
    const items = (activity || []).slice(0, 12);
    if (firstLb) { items.forEach((a) => feedSeen.add(feedKey(a))); return; }
    const fresh = items.filter((a) => !feedSeen.has(feedKey(a)) && lc(a.contributor) !== me()).reverse();
    items.forEach((a) => feedSeen.add(feedKey(a)));
    fresh.slice(-3).forEach((a, i) => setTimeout(() => pushFeed(a), i * 700));
  }

  // ================= leaderboard: my rank, pinned =================
  const lbPanel = $("bp-panel-leaderboard");
  const pin = document.createElement("button");
  pin.type = "button"; pin.className = "cpx-pin"; pin.id = "cpx-pin"; pin.hidden = true;
  if (lbPanel) lbPanel.appendChild(pin);
  pin.addEventListener("click", () => {
    const row = [...document.querySelectorAll("#bp-full-leaderboard .bp-lb-row")].find((r) => (r.querySelector(".bp-lb-ext") || {}).href && lc(r.querySelector(".bp-lb-ext").href).includes(me()));
    if (row) { row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); row.classList.remove("cpx-hl"); void row.offsetWidth; row.classList.add("cpx-hl"); }
  });
  function paintPin() {
    const m = me();
    const i = m ? rows.findIndex((r) => lc(r.address) === m) : -1;
    pin.hidden = i < 0;
    document.querySelectorAll("#bp-full-leaderboard .bp-lb-row").forEach((r) => { const a = r.querySelector(".bp-lb-ext"); r.classList.toggle("cpx-mine", !!(a && m && lc(a.href).includes(m))); });
    if (i < 0) return;
    const total = rows.reduce((s, r) => s + toNum(r.amount), 0), v = toNum(rows[i].amount), n = memberNo(m);
    pin.innerHTML = `<span class="cpx-pin-k">${esc(tr("You"))}</span><b data-no-i18n>#${i + 1}</b><span data-no-i18n>${fmt(v)} USDC</span><span data-no-i18n>${total ? ((v / total) * 100).toFixed(2) : 0}%</span>${n ? `<em>${esc(tr(`member #${n}`))}</em>` : ""}<i aria-hidden="true">↓</i>`;
  }

  // ================= hooks =================
  let mineWas = { a: null, v: null };
  const origApply = applyCirclepadState;
  // eslint-disable-next-line no-global-assign
  applyCirclepadState = function (s, opts) {
    origApply(s, opts);
    if (!s) return;
    S = s;
    try {
      paintBar(); paintOpens();
      preview(($("bp-contribute-amount") || {}).value, $("cpx-chips-p"));
      if (!(opts && opts.accountUnknown)) {
        const a = me(), v = s.myContribution || 0n;
        if (a && mineWas.a === a && mineWas.v != null && v > mineWas.v) {
          if (!sheet.hidden) closeSheet();
          sheetBusy = false;
          setTimeout(showCard, reduce ? 100 : 1300);
        }
        mineWas = { a, v: a ? v : null };
      }
      paintTrust();
    } catch (e) { console.warn("circlepad-plus", e); }
  };
  const origLb = renderCirclepadLeaderboard;
  // eslint-disable-next-line no-global-assign
  renderCirclepadLeaderboard = function (r, act, flow) {
    origLb(r, act, flow);
    rows = r || []; activity = act || [];
    try { feedCheck(); paintTrust(); paintPin(); } catch (e) { console.warn("circlepad-plus", e); }
    firstLb = false;
  };
  document.addEventListener("arc:lang", () => { paintTrust(); paintPin(); paintOpens(); });
  window.circlepadPlus = { showCard, openSheet, preview: (v) => preview(v, $("cpx-chips-p")), state: () => ({ S, rows: rows.length }) };
})();
;
/* ---- circlepad-ideas.js ---- */
/* global state, ethers, connectWallet, cpToast, cpErrText, CONFIG, govOptionHtml, govLogoUrl, govDate, govFmtDate */
// circlepad-ideas.js — the pre-vote: step 1 of a round's governance.
// Anyone with a wallet can suggest a name, ticker, logo, roadmap or launch
// date and vote for as many ideas as they like, or take a vote back (a free
// signature, no transaction, no tokens). A category's pre-vote closes when the
// round wallet publishes its candidates — picked from the top of the pre-vote —
// and $ARCIRCLE holders then burn-to-vote on those (circlepad.js). Stored off-chain through /api/social (api/_circle.mjs);
// the signed messages below must match that file byte for byte.
(function () {
  "use strict";
  if (!document.body.classList.contains("circlepad-page") || typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS || !(CONFIG.CIRCLEPAD_VOTE_ADDRESS || CONFIG.CIRCLEPAD_GOV_DIRECT === true)) return;
  const host = document.getElementById("gv-ideas");
  if (!host) return;
  const API = "/api/social";
  const ESCROW = CONFIG.CIRCLEPAD_ESCROW_ADDRESS.toLowerCase();
  // Round #3 on: a sixth tab, the launch chain — its choices are already on the board (the team posts them), so
  // there's nothing to suggest there, only to vote for
  const CHAINS = CONFIG.CIRCLEPAD_GOV_DIRECT === true && CONFIG.CIRCLEPAD_ROUND_GOV && Array.isArray(CONFIG.CIRCLEPAD_ROUND_GOV.chain) ? CONFIG.CIRCLEPAD_ROUND_GOV.chain : [];
  const CATS = ["name", "ticker", "logo", "roadmap", "date"].concat(CHAINS.length ? ["chain"] : []);
  const LABEL = ["Coin name", "Ticker", "Logo", "Roadmap", "Launch date"].concat(CHAINS.length ? ["Launch chain"] : []);
  const MAX = [32, 10, 300, 400, 30, 20];
  const IDX = CATS.map((_, i) => i);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const toast = (m, k) => (typeof cpToast === "function" ? cpToast(tr(m), k) : console.log(m));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const hue = (a) => (parseInt(String(a).slice(2, 8), 16) || 0) % 360;
  const ago = (ms) => { const s = Math.max(1, Math.floor((Date.now() - ms) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const me = () => (state && state.account ? lc(state.account) : null);
  const kec = (t) => ethers.keccak256(ethers.toUtf8Bytes(String(t)));

  // ---- messages: identical to api/_circle.mjs ----
  const ideaMessage = (wallet, cat, text, note, issued) => `ARCIRCLE PAD — CirclePad idea\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nCategory: ${CATS[cat]}\nIssued: ${issued}\nContent: ${kec(JSON.stringify([text, note]))}`;
  const upMessage = (wallet, id) => `ARCIRCLE PAD — back a CirclePad idea\nIdea: ${id}\nWallet: ${lc(wallet)}`;
  const unvoteMessage = (wallet, id) => `ARCIRCLE PAD — withdraw a CirclePad pre-vote\nIdea: ${id}\nWallet: ${lc(wallet)}`;
  const PICK = 8; // the most candidates a category can publish (circlepad.js GOV_MAX_OPTIONS)
  const hideMessage = (wallet, id, issued) => `ARCIRCLE PAD — CirclePad moderation\nRound: ${ESCROW}\nHide idea: ${id}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;

  let D = { ideas: [], myUps: [] }, loaded = false, off = false;
  let tab = 0, formKey = "", busy = false, open = false;
  const SHOW = 8; const more = new Set(); // categories showing every idea
  const gov = () => window.circlepadGov || null;
  const published = (cat) => { const g = gov(); return !!(g && g.categories && g.categories[cat] && g.categories[cat].set); };
  const allPublished = () => IDX.every(published);
  const isRecipient = () => { const g = gov(); return !!(me() && g && g.recipient && lc(g.recipient) === me()); };
  // an idea "made the ballot" when the recipient published the same text
  const onBallot = (i) => {
    const g = gov(); const c = g && g.categories && g.categories[i.cat];
    if (!c || !c.set) return false;
    const norm = (t) => lc(String(t).replace(/^\$/, "").trim());
    return c.options.some((o) => norm(o.text) === norm(i.text));
  };

  async function load() {
    try {
      const r = await fetch(`${API}?circle=ideas&round=${ESCROW}${me() ? `&wallet=${me()}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!j || j.enabled === false) { off = true; render(); return; }
      if (Array.isArray(j.ideas)) { D = { ideas: j.ideas, myUps: j.myUps || [] }; loaded = true; document.dispatchEvent(new CustomEvent("circlepad:prevote", { detail: stats() })); }
    } catch (e) { /* keep what we have */ }
    render();
  }

  async function wallet() {
    if (!state.account || !state.signer) { if (typeof connectWallet === "function") await connectWallet(); }
    return state.account && state.signer ? me() : null;
  }
  // build the message only once the wallet is known
  async function sign(build) {
    const w = await wallet();
    return w ? state.signer.signMessage(build(w)) : null;
  }
  async function post(body) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  }

  // ---- the form, per category ----
  function inputHtml(cat) {
    const k = CATS[cat];
    if (k === "roadmap") return `<textarea id="gvi-text" rows="3" maxlength="${MAX[cat]}" placeholder="${esc(tr("Phase 1 — what gets built first"))}"></textarea>`;
    if (k === "date") return `<input id="gvi-text" type="datetime-local">`;
    if (k === "logo") return `<input id="gvi-text" type="url" maxlength="${MAX[cat]}" placeholder="${esc(tr("https://… or ipfs://… (square image)"))}"><label class="gvi-up"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="gvi-file"><span>Upload</span></label><span class="gv-ed-prev" id="gvi-prev"></span>`;
    return `<input id="gvi-text" type="text" maxlength="${MAX[cat]}" placeholder="${k === "ticker" ? "TICKER" : esc(tr("Coin name"))}"${k === "ticker" ? ' autocapitalize="characters" spellcheck="false"' : ""}>`;
  }
  function formHtml(cat) {
    if (off) return `<p class="gvi-closed">Ideas aren't switched on right now.</p>`;
    if (published(cat)) return `<p class="gvi-closed">The candidates for this one are on the ballot, so new ideas are closed.</p>`;
    if (CATS[cat] === "chain") return `<p class="gvi-closed">Where should the coin launch? The choices are set — vote for one or more below. Free, as for the rest.</p>`;
    return `<div class="gvi-form">
      <div class="gvi-row">${inputHtml(cat)}</div>
      <input id="gvi-note" type="text" maxlength="140" placeholder="${esc(tr("Why this one? (optional)"))}">
      <div class="gvi-foot"><small>Free — you sign with your wallet, no transaction, no tokens. Up to 10 ideas a day.</small>
        <button type="button" class="bp-btn-primary" id="gvi-go">Suggest</button></div>
    </div>`;
  }
  function readForm(cat) {
    const el = document.getElementById("gvi-text");
    let v = el ? el.value.trim() : "";
    if (CATS[cat] === "ticker") v = v.replace(/^\$/, "").toUpperCase();
    if (CATS[cat] === "date" && v) { const d = new Date(v); v = isNaN(d) ? "" : d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
    const note = (document.getElementById("gvi-note") || {}).value || "";
    return { text: v, note: note.trim() };
  }
  function check(cat, t) {
    if (!t) return "Write your idea first.";
    if (CATS[cat] === "ticker" && !/^[A-Z0-9]{1,10}$/.test(t)) return "Tickers use letters and numbers only, up to 10.";
    if (CATS[cat] === "logo" && !govLogoUrl(t)) return "Each logo needs an https:// or ipfs:// image link.";
    if (CATS[cat] === "roadmap" && t.length < 10) return "Describe the plan in at least 10 characters.";
    if (CATS[cat] === "date") { const d = govDate(t); if (!d) return "Pick a date and time for each candidate."; if (d.getTime() < Date.now()) return "Launch dates need to be in the future."; }
    return null;
  }

  // ---- the list ----
  function listHtml(cat) {
    const list = D.ideas.filter((i) => i.cat === cat).sort((a, b) => b.up - a.up || a.at - b.at);
    if (!loaded) return `<div class="bp-empty">Loading…</div>`;
    if (!list.length) return `<div class="bp-empty">${published(cat) ? "No ideas were posted for this one." : "No ideas yet — be the first."}</div>`;
    const rec = isRecipient() && !published(cat);
    const closed = published(cat);
    const shown = more.has(cat) ? list : list.slice(0, SHOW);
    const rest = list.length - shown.length;
    const sum = list.reduce((a, i) => a + (i.up || 0), 0);
    return shown.map((i, n) => {
      const mine = D.myUps.includes(i.id);
      const pct = sum ? Math.round(((i.up || 0) / sum) * 100) : 0;
      const top = !closed && n < PICK && (i.up || 0) > 0;
      return `<div class="gvi-item${onBallot(i) ? " ballot" : ""}${top ? " top" : ""}" data-id="${esc(i.id)}" style="--pv:${pct}%">
        <span class="gvi-rank" data-no-i18n>${n + 1}</span>
        <div class="gvi-body">
          <div class="gvi-text" data-no-i18n>${govOptionHtml(CATS[cat], i.text)}</div>
          ${i.note ? `<p class="gvi-note" data-no-i18n>${esc(i.note)}</p>` : ""}
          <div class="gvi-meta"><span class="cp-av" style="--h:${hue(i.wallet)};--s:16px" aria-hidden="true"></span><span data-no-i18n>${esc(short(i.wallet))}</span>${i.team ? `<span class="gvi-team">Team</span>` : ""}<span data-no-i18n>· ${ago(i.at)}</span>${onBallot(i) ? `<span class="gvi-ok">On the ballot</span>` : ""}</div>
        </div>
        <div class="gvi-acts">
          <button type="button" class="gvi-up-btn${mine ? " on" : ""}" data-up="${esc(i.id)}"${mine ? ' data-mine="1"' : ""} ${closed ? "disabled" : ""} aria-pressed="${mine}" aria-label="${esc(tr(mine ? "Take my pre-vote back" : "Pre-vote for this idea"))}" title="${esc(tr(closed ? "Pre-vote closed — its candidates are out" : mine ? "Voted — tap to take it back" : "Vote"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 8h-4.5v6h-5v-6H5z"/></svg><b data-no-i18n>${i.up}</b></button>
          ${sum ? `<span class="gvi-pct" data-no-i18n>${pct}%</span>` : ""}
          ${rec ? `<button type="button" class="gvi-use" data-use="${esc(i.id)}">Use</button><button type="button" class="gvi-hide" data-hide="${esc(i.id)}" aria-label="${esc(tr("Hide"))}">Hide</button>` : ""}
        </div>
      </div>`;
    }).join("") + (rest > 0 ? `<button type="button" class="gvi-more" data-more="${cat}"><span>Show all</span> <b data-no-i18n>${list.length}</b></button>` : "");
  }

  function render() {
    const g = gov();
    const phaseRaise = !g || !g.votingOpen && !(Number(g.votingEnds || 0) && Math.floor(Date.now() / 1000) >= Number(g.votingEnds));
    const counts = IDX.map((c) => D.ideas.filter((i) => i.cat === c).length);
    const total = counts.reduce((a, b) => a + b, 0);
    // once the ballot is set the board folds away — still one tap to read
    const folded = allPublished() && !open;
    host.classList.toggle("folded", folded);
    // once candidates are out, the vote comes first and the pre-vote (for what's left) moves under it
    const catsEl = document.getElementById("bp-gov-categories");
    const anyPublished = IDX.some(published);
    if (anyPublished && catsEl && host.previousElementSibling !== catsEl) catsEl.insertAdjacentElement("afterend", host);
    if (!host.querySelector(".gvi-head")) {
      host.innerHTML = `<div class="gvi-head"><div><small class="gv-k">Step 1 · Pre-vote</small><h3>Suggest and vote — open to everyone</h3><p>${CHAINS.length ? "Add ideas for the name, ticker, logo, roadmap and launch date, and pick the launch chain — vote for as many as you like, or take a vote back. Free: a wallet signature, no tokens, no gas. The round wallet picks the candidates from the top of the pre-vote; then $ARCIRCLE holders burn-to-vote on them." : "Add ideas for the name, ticker, logo, roadmap and launch date, and vote for as many as you like — or take a vote back. Free: a wallet signature, no tokens, no gas. The round wallet picks the candidates from the top of the pre-vote; then $ARCIRCLE holders burn-to-vote on them."}</p></div><button type="button" class="gvi-toggle" id="gvi-toggle"></button></div>
        <div class="gvi-tabs" role="tablist"></div><div class="gvi-formwrap"></div><div class="gvi-list"></div>`;
    }
    const tgl = host.querySelector("#gvi-toggle");
    tgl.hidden = !allPublished();
    tgl.innerHTML = `<span data-no-i18n>${total}</span> <span>${folded ? "Show ideas" : "Hide ideas"}</span>`;
    host.querySelector(".gvi-tabs").innerHTML = LABEL.map((l, i) => `<button type="button" role="tab" aria-selected="${i === tab}" class="${i === tab ? "on" : ""}${published(i) ? " set" : ""}" data-tab="${i}"><span>${esc(tr(l))}</span><b data-no-i18n>${counts[i]}</b></button>`).join("");
    // the recipient: one tap puts every idea into the candidate editors
    let fill = host.querySelector(".gvi-fill");
    const openCats = IDX.filter((c) => !published(c));
    if (isRecipient() && loaded && openCats.length && D.ideas.length) {
      if (!fill) { fill = document.createElement("div"); fill.className = "gvi-fill"; host.querySelector(".gvi-tabs").insertAdjacentElement("beforebegin", fill); }
      const html = `<div><b>${esc(tr("Round wallet"))}</b><span>${esc(tr("Put the top of the pre-vote (up to 8 per category) into the candidate lists below — you check each list, change it if you like, and publish it (one wallet signature per category). Publishing closes that category's pre-vote."))}</span></div><button type="button" class="bp-btn-primary" data-fill-all>${esc(tr("Pick the top of the pre-vote"))}</button>`;
      if (fill.__html !== html) { fill.innerHTML = html; fill.__html = html; }
    } else if (fill) fill.remove();
    const fk = `${tab}|${published(tab)}|${off}|${phaseRaise}`;
    if (fk !== formKey) { formKey = fk; host.querySelector(".gvi-formwrap").innerHTML = formHtml(tab); }
    host.querySelector(".gvi-list").innerHTML = listHtml(tab);
  }

  // ---- logo upload (the same image host ArcPad launches use) ----
  async function upload(file) {
    if (!file) return null;
    if (file.size > 4e6) { toast("That image is larger than 4 MB.", "bad"); return null; }
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logo", image: data }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { toast(j.error || "Couldn't upload that image — try a link instead.", "bad"); return null; }
    return j.url;
  }
  window.circlepadUploadLogo = upload;

  // every unpublished category: its ideas (most backed first), launch dates only
  // if they come after the vote ends, plus any team additions from the config
  function fillAll() {
    if (typeof window.circlepadGovFill !== "function") return;
    const g = gov();
    const ends = g ? Number(g.votingEnds || 0) : 0;
    const extra = (typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_EXTRA_CANDIDATES) || {};
    const filled = [], skipped = [];
    IDX.filter((c) => !published(c)).forEach((c) => {
      let list = D.ideas.filter((i) => i.cat === c).sort((a, b) => b.up - a.up || a.at - b.at).map((i) => i.text);
      if (CATS[c] === "date") {
        const ok = (t) => { const d = govDate(t); return d && (!ends || d.getTime() / 1000 > ends); };
        list.filter((t) => !ok(t)).forEach((t) => skipped.push(t));
        list = list.filter(ok);
      }
      // the most pre-voted first, up to the ballot's 8 (team additions only fill spare places)
      list = list.slice(0, PICK);
      list = list.concat((Array.isArray(extra[c]) ? extra[c] : []).slice(0, Math.max(0, PICK - list.length)));
      const n = window.circlepadGovFill(c, list);
      filled.push(`${tr(LABEL[c])} ${n}`);
    });
    toast(`${tr("Filled:")} ${filled.join(" · ")}. ${skipped.length ? `${skipped.length} ${tr("launch date left out — it's before the vote ends.")} ` : ""}${tr("Check each list, then press Publish in each category.")}`, "ok");
    const first = document.querySelector(".gv-ed");
    if (first) first.closest("[id^='gv-cat-']").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  host.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = Number(t.dataset.tab); render(); return; }
    if (e.target.closest("#gvi-toggle")) { open = !open; render(); return; }
    const mo = e.target.closest("[data-more]");
    if (mo) { more.add(Number(mo.dataset.more)); render(); return; }
    const up = e.target.closest("[data-up]");
    if (up && !busy) {
      busy = true;
      try {
        const id = up.dataset.up, back = !!up.dataset.mine;
        const sig = await sign((w) => (back ? unvoteMessage(w, id) : upMessage(w, id)));
        if (!sig) return;
        const r = await post({ action: back ? "cidea-unvote" : "cidea-up", wallet: me(), id, signature: sig });
        const it = D.ideas.find((x) => x.id === id);
        if (back && (r.ok || r.j.none)) { D.myUps = D.myUps.filter((x) => x !== id); if (it && r.ok) it.up = r.j.up; render(); toast("Pre-vote taken back.", "ok"); }
        else if (!back && (r.ok || r.j.already)) { if (!D.myUps.includes(id)) D.myUps.push(id); if (it && r.ok) it.up = r.j.up; render(); }
        else toast(r.j.error || "Couldn't record that vote.", "bad");
      } catch (err) { toast(typeof cpErrText === "function" ? cpErrText(err, "Signing was cancelled.") : "Signing was cancelled.", "bad"); }
      finally { busy = false; }
      return;
    }
    if (e.target.closest("[data-fill-all]")) { fillAll(); return; }
    const use = e.target.closest("[data-use]");
    if (use) {
      const it = D.ideas.find((x) => x.id === use.dataset.use);
      if (it && typeof window.circlepadGovUseIdea === "function") window.circlepadGovUseIdea(it.cat, it.text);
      return;
    }
    const hd = e.target.closest("[data-hide]");
    if (hd && !busy) {
      busy = true;
      try {
        const issued = new Date().toISOString();
        const sig = await sign((w) => hideMessage(w, hd.dataset.hide, issued));
        if (!sig) return;
        const r = await post({ action: "chide", kind: "idea", round: ESCROW, wallet: me(), id: hd.dataset.hide, issued, signature: sig });
        if (r.ok) { D.ideas = D.ideas.filter((x) => x.id !== hd.dataset.hide); render(); toast("Hidden.", "ok"); }
        else toast(r.j.error || "Couldn't hide that.", "bad");
      } catch (err) { toast("Signing was cancelled.", "bad"); }
      finally { busy = false; }
      return;
    }
    if (e.target.closest("#gvi-go") && !busy) {
      const cat = tab;
      const f = readForm(cat);
      const bad = check(cat, f.text);
      if (bad) { toast(bad, "bad"); return; }
      const btn = document.getElementById("gvi-go");
      busy = true; if (btn) { btn.disabled = true; btn.textContent = tr("Sign in wallet…"); }
      try {
        const issued = new Date().toISOString();
        const sig = await sign((w) => ideaMessage(w, cat, f.text, f.note, issued));
        if (!sig) return;
        const r = await post({ action: "cidea", round: ESCROW, wallet: me(), cat, text: f.text, note: f.note, issued, signature: sig });
        if (r.ok) {
          toast("Idea posted — thanks.", "ok");
          formKey = ""; // fresh, empty form
          await load();
          const row = host.querySelector(`.gvi-item[data-id="${r.j.id}"]`);
          if (row) { row.classList.add("new"); row.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
        } else if (r.j.dup) {
          toast(r.j.error, "bad");
          await load();
          const row = host.querySelector(`.gvi-item[data-id="${r.j.id}"]`);
          if (row) { row.classList.add("new"); row.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
        } else toast(r.j.error || "Couldn't post that idea.", "bad");
      } catch (err) { toast(typeof cpErrText === "function" ? cpErrText(err, "Signing was cancelled.") : "Signing was cancelled.", "bad"); }
      finally { busy = false; const b2 = document.getElementById("gvi-go"); if (b2) { b2.disabled = false; b2.textContent = tr("Suggest"); } }
    }
  });
  host.addEventListener("input", (e) => {
    if (e.target.id === "gvi-text" && CATS[tab] === "ticker") { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""); if (v !== e.target.value) e.target.value = v; }
    if (e.target.id === "gvi-text" && CATS[tab] === "logo") { const u = govLogoUrl(e.target.value); const p = document.getElementById("gvi-prev"); if (p) p.innerHTML = u ? `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer">` : ""; }
  });
  host.addEventListener("change", async (e) => {
    if (e.target.id !== "gvi-file") return;
    const lab = e.target.closest(".gvi-up"); if (lab) lab.classList.add("busy");
    const url = await upload(e.target.files && e.target.files[0]).catch(() => null);
    if (lab) lab.classList.remove("busy");
    if (!url) return;
    const inp = document.getElementById("gvi-text");
    if (inp) { inp.value = url; inp.dispatchEvent(new Event("input", { bubbles: true })); }
  });

  // the pre-vote in numbers, for the Home hero and the Governance stepper
  const stats = () => ({ ideas: D.ideas.length, votes: D.ideas.reduce((a, i) => a + (i.up || 0), 0), loaded });
  window.circlepadIdeas = {
    get stats() { return stats(); },
    open(cat) { tab = cat; open = true; render(); host.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => { const i = document.getElementById("gvi-text"); if (i) i.focus({ preventScroll: true }); }, 400); },
    reload: load,
    get data() { return D; },
  };
  document.addEventListener("circlepad:gov", () => render());
  document.addEventListener("arc:lang", () => { formKey = ""; render(); });
  let lastMe = me();
  setInterval(() => {
    if (me() !== lastMe) { lastMe = me(); load(); return; }
    const panel = document.getElementById("bp-panel-governance");
    if (panel && panel.offsetParent !== null && !document.hidden) load();
  }, 30000);
  // a wallet connecting mid-visit: its own "backed" marks
  const origRefresh = typeof window.refreshAccountDependentViews === "function" ? window.refreshAccountDependentViews : null;
  if (origRefresh) {
    // eslint-disable-next-line no-global-assign
    window.refreshAccountDependentViews = function () { origRefresh.apply(this, arguments); if (me() !== lastMe) { lastMe = me(); load(); } };
  }
  render();
  load();
})();
;
/* ---- circlepad-round.js ---- */
/* global cpFmtTime, CONFIG, ethers, state, readProvider, circlepadEscrowRead, circlepadEscrowConfigured, govLogoUrl, govDate, govFmtDate, govBurnMode, fmtEth, cpToast, _circlepadState */
// circlepad-round.js — Round #1 as it actually runs, around the rest of /circle:
//   · a one-line strip over every tab: raised · contributors · burned · clock
//   · a Home hero that follows the phase (raise → burn-to-vote → result)
//   · "What happens next": what's fixed by a contract, what's the team's plan,
//     what isn't decided yet (CONFIG.CIRCLEPAD_NEXT)
//   · Projects: the live round card · Treasury: the split at today's total
//   · governance extras: the live burn feed, voters and top burners, the
//     share card after a vote (/vote/<tx>), the burn animation, category
//     tabs + "my votes" bar on phones, and the result reveal after the close
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  // "Round #1" in copy → this round's number (circlepad-boot.js cpRT)
  const TR = (s) => esc(window.cpRT ? window.cpRT(s) : tr(s));
  const RN = () => (window.cpRN ? window.cpRN() : 1);
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const burnOn = () => typeof govBurnMode === "function" && govBurnMode();
  const BURN = String(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS || "");
  const usdc = (wei, d = 2) => (typeof fmtEth === "function" ? fmtEth(wei, d) : String(wei));
  const ALT = (v, c) => (window.cpConv ? window.cpConv.html(v, c) : ""); // "≈ 0.04 ETH" under a USDC amount (circlepad-conv.js)
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const tok = (raw) => Math.round(Number(BigInt(raw || 0) / 10n ** 18n)).toLocaleString("en-US");
  const nowS = () => Math.floor(Date.now() / 1000) + (window.circlepadGovSkew || 0);
  const left = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };
  const dt = (ts) => (typeof cpFmtTime === "function" ? cpFmtTime(new Date(ts * 1000), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : new Date(ts * 1000).toLocaleString());

  // ---- what we know, from the other scripts ----
  const R = () => (typeof _circlepadState !== "undefined" && _circlepadState) || null;
  const G = () => window.circlepadGov || null;
  const NC = () => (window.cpCatCount ? window.cpCatCount() : 5);
  const rows = () => window.circlepadLbRows || [];
  let feed = null; // /api/social?circle=burns
  let wallets = null; // { recipient, platform, treasury }
  const lead = (c) => { if (!c || !c.set || !c.options.length) return null; let best = -1, bw = 0n; c.options.forEach((o, i) => { if (o.weight > bw) { bw = o.weight; best = i; } }); return best < 0 ? null : { i: best, text: c.options[best].text, weight: bw }; };
  function phase() {
    const r = R(), g = G(), t = nowS();
    if (!r || !r.started) return "pre";
    if (g && g.votingOpen) return "voting"; // burn voting runs during the raise, until it closes
    if (r.isOpen) return "raise";
    const ends = g ? Number(g.votingEnds || 0) : 0;
    if (ends && t < ends) return "voting";
    if (ends && t >= ends) return "result";
    return "closed";
  }
  const deadline = () => Number((R() && R().deadline) || 0);
  const votingEnds = () => Number((G() && G().votingEnds) || 0);
  const opensAt = () => Number((G() && G().opensAt) || 0);
  function winner() {
    const g = G(); if (!g) return {};
    const l = (k) => lead(g.categories[k]);
    const logo = l(2) && govLogoUrl(l(2).text), d = l(4) && govDate(l(4).text);
    return { name: l(0) ? l(0).text : "", ticker: l(1) ? String(l(1).text).replace(/^\$/, "") : "", logo, date: d, road: l(3) ? String(l(3).text).split("\n")[0] : "", any: [0, 1, 2, 3, 4].some((k) => l(k)) };
  }
  const burnedTotal = () => {
    const g = G(), chain = g && g.burn && g.burn.live && g.burn.totalBurned != null ? BigInt(g.burn.totalBurned) : null;
    const api = feed ? BigInt(feed.totals.burned || 0) : null;
    return chain != null && api != null ? (chain > api ? chain : api) : chain != null ? chain : api != null ? api : 0n;
  };

  // ================= strip: raised · contributors · burned · clock =================
  const strip = document.createElement("div");
  strip.className = "cp-strip"; strip.id = "cp-strip";
  const scroll = document.querySelector(".bp-scroll");
  if (scroll) scroll.insertBefore(strip, scroll.firstChild);
  // stick just under the top bar (sticky on desktop, fixed on phones)
  const topbar = document.querySelector(".bp-topbar");
  const stickTop = () => { if (!topbar) return; const p = getComputedStyle(topbar).position; strip.style.top = (p === "fixed" || p === "sticky") ? Math.round(topbar.getBoundingClientRect().height) + "px" : "0px"; };
  stickTop(); window.addEventListener("resize", stickTop, { passive: true });
  // phones: one line (phase · raised · clock); tap it for the rest
  strip.addEventListener("click", (e) => {
    if (e.target.closest("button, a")) return;
    if (!matchMedia("(max-width: 900px)").matches) return;
    strip.classList.toggle("open");
    strip.setAttribute("aria-expanded", strip.classList.contains("open") ? "true" : "false");
  });
  function paintStrip() {
    const r = R(), ph = phase();
    if (!r || ph === "pre") { strip.hidden = true; return; }
    strip.hidden = false;
    const both = ph === "voting" && r.isOpen && votingEnds() === deadline();
    const clock = ph === "raise" ? ["Raise closes in", deadline()] : ph === "voting" ? [both ? "Raise & voting close in" : "Voting closes in", votingEnds()] : null;
    const label = ph === "raise" ? "Raising" : ph === "voting" ? (r.isOpen ? "Raising · voting" : "Voting") : ph === "result" ? "Result" : "Closed";
    strip.innerHTML = `<span class="cp-strip-ph ${ph}"><i></i>${T(label)}</span>
      <span class="cp-strip-raised"><small>${T("Raised")}</small><b data-no-i18n>${usdc(r.totalRaised || 0n, 0)} USDC</b>${ALT(r.totalRaised || 0n, "cp-alt-sm")}</span>
      <span class="cp-strip-n"><small>${T("Contributors")}</small><b data-no-i18n>${num(rows().length)}</b></span>
      ${burnOn() ? `<span class="cp-strip-burn"><small>${T("Burned by votes")}</small><b data-no-i18n data-cp-burned>${tok(burnedTotal())}</b></span>` : ""}
      ${clock ? `<span class="cp-strip-clock"><small>${T(clock[0])}</small><b data-no-i18n data-cp-to="${clock[1]}">${clock[1] > nowS() ? left(clock[1] - nowS()) : T("Closing…")}</b></span>` : ""}
      ${ph === "raise" || ph === "voting" ? `<button type="button" class="cp-strip-live" data-cp-live>${T("Live screen")}</button>` : `<span class="cp-strip-split ${r.distributed ? "ok" : "wait"}"><i></i>${T(r.distributed ? "Split sent" : "Settling the split")}</span>${(window.cpRN ? window.cpRN() : 1) === 1 ? `<a class="cp-strip-live" href="/circle/round/1">${T("Round report")}</a>` : `<button type="button" class="cp-strip-live" data-cp-go="projects">${T("Results")}</button>`}`}
      <i class="cp-strip-more" aria-hidden="true"></i>`;
    strip.setAttribute("aria-expanded", strip.classList.contains("open") ? "true" : "false");
  }

  // ================= Home hero that follows the phase =================
  const home = $("bp-panel-home");
  const hero = document.createElement("section");
  hero.className = "cp-phero"; hero.id = "cp-phase-hero"; hero.hidden = true;
  home.insertBefore(hero, home.firstChild);
  function coinCard(w, final) {
    return `<div class="cp-wc${final ? " final" : ""}">
      <span class="cp-coin-logo">${w.logo ? `<img src="${esc(w.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((w.name || "?").slice(0, 1).toUpperCase())}</em>`}</span>
      <div class="cp-coin-id"><b data-no-i18n>${esc(w.name || "—")}</b><span data-no-i18n>${w.ticker ? "$" + esc(w.ticker) : "—"}</span></div>
      <dl><div><dt>${T("Launch date")}</dt><dd data-no-i18n>${w.date ? esc(govFmtDate(w.date)) : "—"}</dd></div><div><dt>${T("Roadmap")}</dt><dd data-no-i18n>${esc(w.road || "—")}</dd></div></dl>
    </div>`;
  }
  function paintHero() {
    const ph = phase();
    document.body.classList.toggle("cp-ph-voting", ph === "voting");
    document.body.classList.toggle("cp-ph-result", ph === "result");
    if (CONFIG.CIRCLEPAD_ROUND_PLAN && window.cpPlan) { // a round with no vote: its plan (circlepad-plan.js)
      const h = window.cpPlan.hero(ph, R());
      hero.hidden = !h; if (h) { hero.className = "cp-phero plan"; if (hero.dataset.planH !== h) { hero.innerHTML = h; hero.dataset.planH = h; } }
      return;
    }
    if (!burnOn() || (ph !== "raise" && ph !== "voting" && ph !== "result")) { hero.hidden = true; return; }
    hero.hidden = false;
    const w = winner();
    if (ph === "raise") {
      // before the close: say what the burn vote is and when it opens
      const g = G(), dl = opensAt();
      const published = g && Array.isArray(g.categories) ? g.categories.filter((c) => c.set).length : 0;
      const buy = String(CONFIG.ARCIRCLE_BUY_URL || "");
      hero.className = "cp-phero upcoming";
      hero.innerHTML = `<div class="cp-phero-copy">
          <span class="cp-phero-eyebrow">${TR("Round #1 · next up: burn-to-vote")}</span>
          <h2>${T("$ARCIRCLE holders vote on the coin while the raise runs.")}</h2>
          <p class="cp-phero-lede">${T("1 vote = 1,000 $ARCIRCLE, sent to 0x…dEaD for good. Anyone holding $ARCIRCLE can vote until the raise closes.")}</p>
          <div class="cp-phero-cta">${buy ? `<a class="bp-btn-primary" href="${esc(buy)}" target="_blank" rel="noopener">${T("Get $ARCIRCLE")}</a>` : ""}<button type="button" class="bp-btn-ghost" data-cp-go="governance">${T("See the candidates")}</button>${dl > nowS() ? `<span class="cp-phero-clock"><small>${T("Voting opens in")}</small><b data-no-i18n data-cp-to="${dl}">${left(dl - nowS())}</b></span>` : ""}</div>
        </div>
        <div class="cp-phero-side"><div class="cp-wc cp-wc-burn"><span class="cp-flame" aria-hidden="true"></span><div><b data-no-i18n>1,000 $ARCIRCLE</b><span>${T("burned per vote")}</span></div>
          <dl><div><dt>${T("Burn address")}</dt><dd data-no-i18n>0x…dEaD</dd></div><div><dt>${T("Candidates")}</dt><dd><span data-no-i18n>${published}/${NC()}</span> <span>${T("published")}</span></dd></div></dl></div></div>`;
      return;
    }
    const g0 = G(), pub = g0 && Array.isArray(g0.categories) ? g0.categories.filter((c) => c.set && !c.fixed).length : 0; // fixed categories (the launch chain) don't end the pre-vote
    const pubAll = g0 && Array.isArray(g0.categories) ? g0.categories.filter((c) => c.set).length : 0;
    if (ph === "voting" && pub === 0) {
      // step 1: the pre-vote — free, open to everyone, before any candidates are out
      const pv = (window.circlepadIdeas && window.circlepadIdeas.stats) || { ideas: 0, votes: 0 };
      hero.className = "cp-phero voting prevote";
      hero.innerHTML = `<div class="cp-phero-copy">
          <span class="cp-phero-eyebrow">${TR("Round #1 · pre-vote is open")}</span>
          <h2>${T("Suggest and vote on the coin — free, open to everyone.")}</h2>
          <p class="cp-phero-lede">${T("Ideas for the name, ticker, logo, roadmap and launch date, voted up by anyone with a wallet — no tokens needed. The round wallet picks the candidates from the top, then $ARCIRCLE holders burn-to-vote on them until the raise closes.")}</p>
          <div class="cp-phero-cta"><button type="button" class="bp-btn-primary" data-cp-go="governance">${T("Join the pre-vote")}</button><span class="cp-phero-clock"><small>${T("Raise and voting close in")}</small><b data-no-i18n data-cp-to="${votingEnds()}">${left(votingEnds() - nowS())}</b></span></div>
        </div>
        <div class="cp-phero-side"><div class="cp-wc cp-wc-burn"><div><b data-no-i18n>${num(pv.ideas)}</b><span>${T("ideas")}</span></div>
          <dl><div><dt>${T("Pre-votes")}</dt><dd data-no-i18n>${num(pv.votes)}</dd></div><div><dt>${T("Candidates")}</dt><dd><span data-no-i18n>${pubAll}/${NC()}</span> <span>${T("published")}</span></dd></div></dl></div></div>`;
      return;
    }
    if (ph === "voting") {
      hero.className = "cp-phero voting";
      hero.innerHTML = `<div class="cp-phero-copy">
          <span class="cp-phero-eyebrow">${TR("Round #1 · burn-to-vote is open")}</span>
          <h2>${T("Vote on the coin. Every vote burns 1,000 $ARCIRCLE.")}</h2>
          <div class="cp-phero-burn"><span class="cp-flame" aria-hidden="true"></span><b data-no-i18n data-cp-burned>${tok(burnedTotal())}</b><span>${T("$ARCIRCLE burned so far")}</span></div>
          <div class="cp-phero-cta"><button type="button" class="bp-btn-primary" data-cp-go="governance">${T("Burn & vote")}</button><button type="button" class="bp-btn-ghost" data-cp-live>${T("Live screen")}</button>${RN() === 1 ? `<a class="bp-btn-ghost" href="/circle/round/1">${T("Round report")}</a>` : ""}<span class="cp-phero-clock"><small>${T("Voting closes in")}</small><b data-no-i18n data-cp-to="${votingEnds()}">${left(votingEnds() - nowS())}</b></span></div>
        </div>
        <div class="cp-phero-side"><small class="cp-k">${T("Leading now")}</small>${w.any ? coinCard(w, false) : `<div class="cp-wc cp-wc-empty"><span class="cp-flame" aria-hidden="true"></span><p>${T("No votes yet — the first burn sets the lead.")}</p></div>`}</div>`;
    } else {
      const launchAt = w.date ? Math.floor(w.date.getTime() / 1000) : 0;
      hero.className = "cp-phero result";
      hero.innerHTML = `<div class="cp-phero-copy">
          <span class="cp-phero-eyebrow">${TR("Round #1 · the vote is in")}</span>
          <h2>${T("This is the coin the circle chose.")}</h2>
          <p class="cp-phero-split ${R() && R().distributed ? "ok" : "wait"}"><i></i>${T(R() && R().distributed ? "Split sent — 80 / 15 / 5 paid out from the escrow." : "Settling — the recipient sends the 80 / 15 / 5 split from the escrow next.")}</p>
          <div class="cp-phero-burn"><span class="cp-flame" aria-hidden="true"></span><b data-no-i18n>${tok(burnedTotal())}</b><span>${T("$ARCIRCLE burned to decide it")}</span></div>
          <div class="cp-phero-cta">${launchAt > nowS() ? `<span class="cp-phero-clock"><small>${T("Launches in")}</small><b data-no-i18n data-cp-to="${launchAt}">${left(launchAt - nowS())}</b></span>` : ""}<button type="button" class="bp-btn-ghost" data-cp-reveal>${T("Replay the reveal")}</button>${RN() === 1 ? `<a class="bp-btn-ghost" href="/circle/round/1">${T("Round report")}</a>` : ""}</div>
        </div>
        <div class="cp-phero-side"><small class="cp-k">${T("The result")}</small>${coinCard(w, true)}</div>`;
    }
  }

  // ================= "What happens next" =================
  const STATUS = { set: "Fixed by a contract", policy: "Team plan", open: "Not decided yet" };
  function nextHtml() {
    const steps = Array.isArray(CONFIG.CIRCLEPAD_NEXT) ? CONFIG.CIRCLEPAD_NEXT : [];
    const dl = deadline(), ve = votingEnds(), t = nowS(), w = winner();
    const launchAt = w.date ? Math.floor(w.date.getTime() / 1000) : 0;
    const op = opensAt() || dl;
    const when = { close: dl ? [dl, dl] : null, vote: op && ve ? [op, ve] : null, top: dl ? [dl, dl + 3 * 86400] : null, launch: launchAt ? [launchAt, launchAt] : null, airdrop: null };
    const whenTxt = (id) => {
      const x = when[id];
      if (!x) return id === "launch" ? tr("The date the vote picks") : tr("Not decided yet");
      return x[0] === x[1] ? dt(x[0]) : `${dt(x[0])} → ${dt(x[1])}`;
    };
    return `<ol class="cp-next-list">${steps.map((s, i) => {
      const x = when[s.id], st = x ? (t >= x[1] ? "done" : t >= x[0] ? "now" : "") : "";
      return `<li class="${st}" style="--i:${i}"><span class="cp-next-dot" aria-hidden="true"></span><div>
        <div class="cp-next-top"><b>${T(s.title)}</b><span class="cp-next-st ${esc(s.status)}">${T(STATUS[s.status] || s.status)}</span></div>
        <p>${T(s.body)}</p><small data-no-i18n>${esc(whenTxt(s.id))}</small></div></li>`;
    }).join("")}</ol>`;
  }
  const nextHome = document.createElement("section");
  nextHome.className = "cp-next cp-next-home"; nextHome.id = "cp-next-home";
  const anchor = document.querySelector(".bp-nextcard");
  if (anchor) anchor.insertAdjacentElement("beforebegin", nextHome); else home.appendChild(nextHome);
  function paintNext() {
    const body = nextHtml();
    nextHome.hidden = !!document.querySelector(".cp-timeline"); // Home: the Launch process strip already walks through it (Docs keeps this list)
    nextHome.innerHTML = `<div class="cp-next-head"><h3>${T("What happens next")}</h3><small data-no-i18n>${esc(window.cpRT ? window.cpRT("Round #1 — what's fixed, what's planned, what isn't decided") : tr("Round #1 — what's fixed, what's planned, what isn't decided"))}</small></div>${body}`;
    const docs = $("cp-next-docs");
    if (docs) docs.innerHTML = body;
    document.dispatchEvent(new CustomEvent("circlepad:nextpaint"));
  }

  // ================= clock-driven fill on the launch-process strip =================
  function paintTimeline() {
    const tl = document.querySelector(".cp-timeline");
    if (!tl || !deadline()) return;
    tl.dataset.clock = "1";
    const t = nowS(), dl = deadline(), start = dl - 72 * 3600, op = opensAt() || dl;
    if (t >= dl) { delete tl.dataset.clock; if (typeof window.cpRepaintStage === "function") window.cpRepaintStage(); return; } // after the close the fill follows the real steps (circlepad-fx.js)
    const w = winner(), launchAt = w.date ? Math.floor(w.date.getTime() / 1000) : dl + 5 * 86400;
    // five steps, each a fifth of the bar: raise, burn-to-vote (during the raise), close, top contributor, launch
    const seg = (a, b, k) => (t <= a ? k / 5 : t >= b ? (k + 1) / 5 : (k + (t - a) / Math.max(1, b - a)) / 5);
    const f = t < start ? 0 : t < op ? seg(start, op, 0) : t < dl ? seg(op, dl, 1) : t < dl + 3 * 86400 ? seg(dl, dl + 3 * 86400, 3) : seg(dl + 3 * 86400, launchAt, 4);
    tl.style.setProperty("--cp-tl", Math.max(0, Math.min(1, f)).toFixed(4));
  }

  // ================= Projects: the live round =================
  function paintProjects() {
    const panel = $("bp-panel-projects"), r = R();
    if (!panel || !r || !r.started) return;
    const wrap = panel.querySelector(".bp-simple");
    let card = $("cp-round-card");
    // once the round has closed, circlepad-rounds.js shows its full summary card instead
    if (deadline() && nowS() >= deadline() && window.cpRoundCards) { if (card) card.remove(); return; }
    if (!card) { card = document.createElement("div"); card.id = "cp-round-card"; card.className = "cp-round-card"; const h1 = wrap.querySelector("h1"); if (h1) h1.insertAdjacentElement("afterend", card); else wrap.prepend(card); }
    const ph = phase(), w = CONFIG.CIRCLEPAD_ROUND_PLAN && window.cpPlan ? window.cpPlan.coin() : winner();
    const badge = ph === "raise" ? "Raising" : ph === "voting" ? "Voting" : ph === "result" ? "Decided" : "Closed";
    card.innerHTML = `<div class="cp-rc-top"><span class="cp-rc-badge ${ph}">${T(badge)}</span><span class="cp-rc-k" data-no-i18n>${esc(window.cpRT ? window.cpRT("CirclePad Round #1") : tr("CirclePad Round #1"))}</span></div>
      <div class="cp-rc-main"><span class="cp-coin-logo">${w.logo ? `<img src="${esc(w.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((w.name || "#" + (window.cpRN ? window.cpRN() : 1)).slice(0, 2))}</em>`}</span>
        <div><b data-no-i18n>${esc(w.name || tr((window.cpRN ? window.cpRN() : 1) > 1 ? "Name not decided yet" : "Name decided by the vote"))}</b><span data-no-i18n>${w.ticker ? "$" + esc(w.ticker) : "$TBD"}</span></div></div>
      <div class="cp-rc-stats"><span><small>${T("Raised")}</small><b data-no-i18n>${usdc(r.totalRaised || 0n, 0)} USDC</b>${ALT(r.totalRaised || 0n, "cp-alt-sm")}</span><span><small>${T("Contributors")}</small><b data-no-i18n>${num(rows().length)}</b></span>${burnOn() ? `<span><small>${T("Burned by votes")}</small><b data-no-i18n>${tok(burnedTotal())}</b></span>` : ""}</div>
      <div class="cp-rc-acts"><button type="button" class="bp-btn-primary" data-cp-go="${ph === "raise" ? "home" : "governance"}">${T(ph === "raise" ? "Contribute" : ph === "voting" ? "Burn & vote" : "See the result")}</button></div>`;
  }

  // ================= Treasury: the split at today's total =================
  async function loadWallets() {
    if (wallets || typeof circlepadEscrowConfigured !== "function" || !circlepadEscrowConfigured()) return;
    try { const e = circlepadEscrowRead(); const [a, b, c] = await Promise.all([e.recipient(), e.platformWallet(), e.treasuryWallet()]); wallets = { recipient: a, platform: b, treasury: c }; } catch { /* next time */ }
  }
  function paintTreasury() {
    const box = $("cp-treasury-live"), r = R();
    if (!box) return;
    if (!r || !r.started) { box.innerHTML = `<div class="bp-empty">${T("The split is shown here once the round opens.")}</div>`; return; }
    const total = BigInt(r.totalRaised || 0n), done = !!r.distributed, top = rows()[0];
    const row = (pct, name, who, note, cls) => `<div class="cp-tr-row ${cls}"><div class="cp-tr-top"><b>${T(name)}</b><span data-no-i18n>${pct}%</span></div>
      <div class="cp-tr-bar"><i style="--w:${pct}%"></i></div>
      <div class="cp-tr-amt"><b data-no-i18n>≈ ${usdc((total * BigInt(pct)) / 100n, 2)} USDC</b>${ALT((total * BigInt(pct)) / 100n, "cp-alt-sm")}${who ? `<a href="${explorer("address", who)}" target="_blank" rel="noopener" data-no-i18n>${short(who)} ↗</a>` : ""}</div>
      <small>${T(note)}</small></div>`;
    box.innerHTML = `<div class="cp-tr-head"><b>${T(done ? "Split at the close" : "If the round closed now")}</b><span data-no-i18n>${usdc(total, 2)} USDC</span>${ALT(total, "cp-alt-sm")}</div>
      ${row(80, "Recipient wallet", wallets && wallets.recipient, "The project's funds", "a")}
      ${row(15, "Treasury wallet", wallets && wallets.treasury, "Paid to the top contributor over 3 days", "c")}
      ${row(5, "Platform wallet", wallets && wallets.platform, "$ARCIRCLE buybacks and promotion", "b")}
      ${top ? `<p class="cp-tr-top-note"><span>${T(done ? "Top contributor at the close" : "Top contributor right now")}:</span> <a href="${explorer("address", top.address)}" target="_blank" rel="noopener" data-no-i18n>${short(top.address)}</a> <b data-no-i18n>${usdc(top.amount, 2)} USDC</b></p>` : ""}`;
  }

  // ================= burn feed: every vote, voters, top burners =================
  let seen = null, feedT = 0;
  async function loadFeed() {
    if (!burnOn() || !(/^0x[0-9a-fA-F]{40}$/.test(BURN) || CONFIG.CIRCLEPAD_GOV_DIRECT === true)) return;
    try {
      const r = await fetch(`/api/social?circle=burns${(CONFIG.CIRCLEPAD_ROUND || 1) > 1 ? `&round=${CONFIG.CIRCLEPAD_ROUND}` : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const fresh = seen ? j.events.filter((e) => !seen.has(e.tx + ":" + e.i)) : [];
      seen = new Set(j.events.map((e) => e.tx + ":" + e.i));
      feed = j; feedT = Date.now();
      paintFeed(fresh);
      document.querySelectorAll("[data-cp-burned]").forEach((el) => bump(el, tok(burnedTotal())));
      odoAll();
      window.circlepadBurns = j;
      document.dispatchEvent(new CustomEvent("circlepad:burns", { detail: j }));
    } catch { /* next poll */ }
  }
  const catName = (c) => ["Coin name", "Ticker", "Logo", "Roadmap", "Launch date", "Launch chain"][c] || "";
  const optLabel = (e) => (e.cat === 1 ? "$" + String(e.text || "").replace(/^\$/, "") : e.cat === 2 ? tr("a logo") : e.cat === 4 && typeof govDate === "function" && govDate(e.text) ? govFmtDate(govDate(e.text)) : e.cat === 3 ? String(e.text || "").split("\n")[0].slice(0, 40) : String(e.text || ""));
  const ago = (b) => { if (!feed) return ""; const s = Math.max(0, (feed.anchor.block - b) * 0.5); return s < 90 ? tr("just now") : s < 5400 ? `${Math.round(s / 60)}${tr("m ago")}` : `${Math.round(s / 3600)}${tr("h ago")}`; };
  function paintFeed(fresh = []) {
    const top = $("bp-gov-top");
    if (!top || !feed) return;
    let box = $("gv-burnfeed");
    // the burn feed closes the tab: the vote (and the pre-vote) come first, the record of burns after
    if (!box) { box = document.createElement("section"); box.id = "gv-burnfeed"; box.className = "gv-feed"; (top.parentNode || top).appendChild(box); }
    // nothing burned yet: the stepper already says so — the feed appears with the first vote
    box.hidden = !feed.events.length;
    const t = feed.totals, topShare = t.votes > 0 && feed.top.length ? Math.round((feed.top[0].votes / t.votes) * 100) : 0;
    box.innerHTML = `<div class="gv-feed-stats">
        <div><small>${T("Burned by votes")}</small><b data-no-i18n>${tok(t.burned)}</b><span>$ARCIRCLE</span></div>
        <div><small>${T("Votes")}</small><b data-no-i18n>${num(t.votes)}</b></div>
        <div><small>${T("Voters")}</small><b data-no-i18n>${num(t.voters)}</b></div>
        <div><small>${T("Largest voter")}</small><b data-no-i18n>${t.votes ? topShare + "%" : "—"}</b><span>${T("of all votes")}</span></div>
      </div>
      <div class="gv-feed-cols">
        <div><h4>${T("Latest burns")}</h4>${feed.events.length ? `<ul class="gv-feed-list">${feed.events.slice(0, 8).map((e) => `<li class="${fresh.some((f) => f.tx === e.tx && f.i === e.i) ? "fresh" : ""}"><span class="cp-flame sm" aria-hidden="true"></span><div><b data-no-i18n>${short(e.voter)}</b> <span>${T("burned")}</span> <b data-no-i18n>${num(e.votes * 1000)}</b> <span>$ARCIRCLE</span><small><span>${T(catName(e.cat))}</span>: <span data-no-i18n>${esc(optLabel(e))}</span></small></div><a href="${explorer("tx", e.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(ago(e.b))} ↗</a></li>`).join("")}</ul>` : `<p class="gv-feed-empty">${T(phase() === "voting" ? "No votes yet — the first burn shows up here." : "Burns show up here once voting opens.")}</p>`}</div>
        <div><h4>${T("Top burners")}</h4>${feed.top.length ? `<ol class="gv-feed-top">${feed.top.map((x) => `<li><a href="${explorer("address", x.voter)}" target="_blank" rel="noopener" data-no-i18n>${short(x.voter)}</a><b data-no-i18n>${num(x.votes)}</b><span>${T("votes")}</span><i style="--w:${t.votes ? Math.max(4, (x.votes / t.votes) * 100) : 0}%"></i></li>`).join("")}</ol>` : `<p class="gv-feed-empty">—</p>`}</div>
      </div>`;
    // someone else's vote: the candidate row glows once, and a quiet note
    const mine = state && state.account ? state.account.toLowerCase() : "";
    fresh.filter((e) => e.voter.toLowerCase() !== mine).slice(0, 3).forEach((e) => {
      glow(e.cat, e.opt);
      if (typeof cpToast === "function") cpToast(`${short(e.voter)} ${tr("burned")} ${num(e.votes * 1000)} $ARCIRCLE · ${tr(catName(e.cat))}: ${optLabel(e)}`, "ok");
    });
  }
  function glow(cat, opt) {
    const el = document.querySelector(`.bp-gov-option[data-category="${cat}"][data-option="${opt}"]`);
    if (!el || reduce()) return;
    el.classList.remove("gv-glow"); void el.offsetWidth; el.classList.add("gv-glow");
    setTimeout(() => el.classList.remove("gv-glow"), 1800);
  }
  function bump(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    if (reduce()) return;
    el.classList.remove("cp-bump"); void el.offsetWidth; el.classList.add("cp-bump");
  }

  // ================= after my vote: the burn, then a share card =================
  document.addEventListener("circlepad:burnvote", (e) => {
    const d = e.detail || {};
    burnFx(d.category, d.option, d.votes);
    shareCard(d);
    setTimeout(loadFeed, 2500);
  });
  function burnFx(cat, opt, votes) {
    if (reduce()) return;
    const from = document.querySelector(`.bp-gov-option[data-category="${cat}"][data-option="${opt}"]`) || document.querySelector(".gv-bn");
    const to = document.querySelector(".gv-burned") || document.querySelector("#cp-strip .cp-strip-burn");
    if (!from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "cp-burnfx"; layer.setAttribute("aria-hidden", "true");
    const n = Math.min(18, 6 + (votes || 1) * 2);
    for (let k = 0; k < n; k++) {
      const p = document.createElement("i");
      const x0 = a.left + a.width * (0.2 + Math.random() * 0.6), y0 = a.top + a.height * (0.3 + Math.random() * 0.4);
      p.style.cssText = `left:${x0}px;top:${y0}px;--dx:${b.left + b.width / 2 - x0}px;--dy:${b.top + b.height / 2 - y0}px;animation-delay:${k * 40}ms`;
      layer.appendChild(p);
    }
    const tag = document.createElement("span");
    tag.className = "cp-burnfx-dead"; tag.textContent = "0x…dEaD";
    tag.style.cssText = `left:${b.left + b.width / 2}px;top:${b.top - 6}px`;
    layer.appendChild(tag);
    document.body.appendChild(layer);
    setTimeout(() => { to.classList.remove("cp-flare"); void to.offsetWidth; to.classList.add("cp-flare"); }, 700);
    setTimeout(() => layer.remove(), 1800);
  }
  function shareCard(d) {
    if (!d.tx) return;
    const top = $("bp-gov-top");
    if (!top) return;
    let box = $("gv-share");
    if (!box) { box = document.createElement("section"); box.id = "gv-share"; box.className = "gv-share"; top.insertAdjacentElement("afterend", box); }
    const url = `https://www.arcircle.app/vote/${d.tx}`;
    const label = d.kind === "ticker" ? "$" + String(d.text || "").replace(/^\$/, "") : d.kind === "logo" ? "a logo" : d.kind === "roadmap" ? "a roadmap" : d.kind === "date" && govDate(d.text) ? govFmtDate(govDate(d.text)) : String(d.text || "");
    const burned = num((d.votes || 1) * 1000);
    const text = `I burned ${burned} $ARCIRCLE to vote for ${label} in CirclePad Round #1. 1 vote = 1,000 $ARCIRCLE, gone for good.`;
    box.innerHTML = `<div class="gv-share-img"><img src="/api/og?vote=${esc(d.tx)}" alt="" loading="lazy"></div>
      <div class="gv-share-copy"><b><span>${T("You burned")}</span> <span data-no-i18n>${burned}</span> $ARCIRCLE</b><p><span>${T("to vote for")}</span> <span data-no-i18n>${esc(label)}</span></p>
        <div class="gv-share-acts"><a class="bp-btn-primary" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${T("Share on X")}</a><button type="button" class="bp-btn-ghost" data-cp-copy="${esc(url)}">${T("Copy link")}</button><button type="button" class="gv-share-x" data-cp-close-share aria-label="${T("Close")}">×</button></div></div>`;
    if (!reduce()) { box.classList.remove("in"); void box.offsetWidth; box.classList.add("in"); }
  }

  // ================= phones: category tabs =================
  function paintBallotNav() {
    const cats = $("bp-gov-categories"), g = G();
    if (!cats || !g) return;
    let nav = $("gv-cat-tabs");
    if (!nav) { nav = document.createElement("nav"); nav.id = "gv-cat-tabs"; nav.className = "gv-cat-tabs"; nav.setAttribute("aria-label", tr("Categories")); cats.insertAdjacentElement("beforebegin", nav); }
    nav.innerHTML = g.categories.map((c) => `<button type="button" data-cp-cat="${c.id}" class="${c.myVoteIndex !== null ? "voted" : ""}">${T(c.label)}</button>`).join("");
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cp-cat]");
    if (c) { const el = $(`gv-cat-${c.dataset.cpCat}`); if (el) el.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" }); return; }
    const go = e.target.closest("[data-cp-go]");
    if (go) { const nav = document.querySelector(`.bp-nav-item[data-tab="${go.dataset.cpGo}"]`); if (nav) nav.click(); return; }
    const cp = e.target.closest("[data-cp-copy]");
    if (cp) { try { navigator.clipboard.writeText(cp.dataset.cpCopy); if (typeof cpToast === "function") cpToast(tr("Link copied."), "ok"); } catch { /* denied */ } return; }
    if (e.target.closest("[data-cp-close-share]")) { const b = $("gv-share"); if (b) b.remove(); return; }
    if (e.target.closest("[data-cp-reveal]")) { reveal(true); return; }
  });

  // ================= the reveal, once per browser after voting closes =================
  const REVEAL_KEY = "circlepad.reveal." + String(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS || CONFIG.CIRCLEPAD_VOTE_ADDRESS || CONFIG.CIRCLEPAD_ESCROW_ADDRESS || "").toLowerCase();
  let revealed = false;
  function reveal(force) {
    const g = G();
    if (!g || phase() !== "result") return;
    let seenIt = revealed; try { seenIt = seenIt || localStorage.getItem(REVEAL_KEY) === "1"; } catch { /* show it */ }
    if (seenIt && !force) return;
    if (document.querySelector(".cp-reveal")) return;
    revealed = true;
    try { localStorage.setItem(REVEAL_KEY, "1"); } catch { /* fine */ }
    const w = winner();
    const cards = g.categories.filter((c) => c.set).map((c, k) => {
      const l = lead(c);
      const kind = ["name", "ticker", "logo", "roadmap", "date"][c.id];
      const face = !l ? "—" : kind === "logo" && govLogoUrl(l.text) ? `<img src="${esc(govLogoUrl(l.text))}" alt="" referrerpolicy="no-referrer">` : kind === "ticker" ? "$" + esc(String(l.text).replace(/^\$/, "")) : kind === "date" && govDate(l.text) ? esc(govFmtDate(govDate(l.text))) : esc(String(l.text).split("\n")[0]);
      return `<div class="cp-rv-card" style="--k:${k}"><div class="cp-rv-in"><div class="cp-rv-back"><span>${T(c.label)}</span><b>?</b></div><div class="cp-rv-front"><span>${T(c.label)}</span><b data-no-i18n>${face}</b>${l ? `<small><span data-no-i18n>${l.weight.toString()}</span> <span>${T("votes")}</span></small>` : ""}</div></div></div>`;
    });
    const ov = document.createElement("div");
    ov.className = "cp-reveal"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", tr("The result"));
    ov.innerHTML = `<div class="cp-rv-box"><span class="cp-phero-eyebrow">${T("CirclePad Round #1 · the vote is in")}</span>
      <div class="cp-rv-grid">${cards.join("")}</div>
      <div class="cp-rv-final" style="--k:${cards.length}">${coinCard(w, true)}</div>
      <div class="cp-rv-acts">${w.any ? `<a class="bp-btn-ghost" href="https://x.com/intent/post?text=${encodeURIComponent(`CirclePad Round #1 is decided: ${w.name || ""}${w.ticker ? " ($" + w.ticker + ")" : ""}${w.date ? ", launching " + govFmtDate(w.date) : ""}. Chosen by $ARCIRCLE holders — every vote burned 1,000 $ARCIRCLE.`)}&url=${encodeURIComponent("https://www.arcircle.app/circle")}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${T("Share the result")}</a>` : ""}${RN() === 1 ? `<a class="bp-btn-ghost" href="/circle/round/1">${T("Round report")}</a>` : ""}<button type="button" class="bp-btn-primary cp-rv-close">${T("See the result")}</button></div></div>`;
    document.body.appendChild(ov);
    if (reduce()) ov.classList.add("still");
    requestAnimationFrame(() => ov.classList.add("in"));
    const close = () => { ov.classList.remove("in"); setTimeout(() => ov.remove(), 250); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest(".cp-rv-close")) close(); });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
  }

  // ================= the race for #1 (the top contributor gets the 15%) =================
  const WEI = 10n ** 18n, CENT = 10n ** 16n;
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const plain = (wei) => { const c = (wei + CENT - 1n) / CENT; return `${c / 100n}.${String(c % 100n).padStart(2, "0")}`; }; // up to the cent, for the input
  const parseAmt = (s) => { const m = /^\s*(\d*)(?:\.(\d*))?\s*$/.exec(String(s || "")); if (!m || (!m[1] && !m[2])) return 0n; return BigInt(m[1] || "0") * WEI + BigInt(((m[2] || "") + "0".repeat(18)).slice(0, 18)); };
  const race = document.createElement("div");
  race.className = "cp-race"; race.id = "cp-race"; race.hidden = true; race.setAttribute("aria-live", "polite");
  const cbtn = $("bp-contribute-btn");
  if (cbtn) cbtn.insertAdjacentElement("afterend", race);
  const input = $("bp-contribute-amount");
  function rankWith(list, addr, extra) {
    // rank of `addr` after adding `extra`; equal amounts keep the earlier wallet ahead
    const mineNow = (list.find((r) => r.address.toLowerCase() === addr) || {}).amount || 0n;
    const after = mineNow + extra;
    const ahead = list.filter((r) => r.address.toLowerCase() !== addr && r.amount >= after).length;
    return { rank: ahead + 1, after };
  }
  function paintRace() {
    const list = rows(), r = R();
    if (!r || phase() !== "raise" || !list.length) { race.hidden = true; return; }
    race.hidden = false;
    const top = list[0], w = me();
    const mineRow = w ? list.find((x) => x.address.toLowerCase() === w) : null;
    const myRank = mineRow ? list.indexOf(mineRow) + 1 : 0;
    let head, fill = 0n;
    if (mineRow && myRank === 1) {
      const second = list[1];
      head = second
        ? `<b>${T("You're #1")}</b> <span>${T("ahead by")}</span> <b data-no-i18n>${usdc(mineRow.amount - second.amount)} USDC</b>`
        : `<b>${T("You're #1")}</b> <span>${T("— the only contributor so far.")}</span>`;
    } else {
      const gap = top.amount - (mineRow ? mineRow.amount : 0n);
      fill = gap + 1n;
      head = mineRow
        ? `<span>${T("Your rank:")}</span> <b data-no-i18n>#${myRank}</b><span>.</span> <span>${T("Put in more than")}</span> <b data-no-i18n>${usdc(gap)} USDC</b> <span>${T("to take #1.")}</span>`
        : `<span>${T("#1 right now:")}</span> <b data-no-i18n>${short(top.address)}</b> <b data-no-i18n>(${usdc(top.amount)} USDC)</b><span>.</span> <span>${T("Put in more than that to take #1.")}</span>`;
    }
    // what the amount being typed would do
    let preview = "";
    const typed = input ? parseAmt(input.value) : 0n;
    if (typed > 0n) {
      const who = w || "0x0000000000000000000000000000000000000000";
      const { rank } = rankWith(list, who, typed);
      if (rank === 1) {
        const others = list.filter((x) => x.address.toLowerCase() !== who);
        const lead = others.length ? rankWith(list, who, typed).after - others[0].amount : 0n;
        preview = `<p class="cp-race-preview win">${others.length ? `<span>${T("With this you'd be #1, ahead by")}</span> <b data-no-i18n>${usdc(lead)} USDC</b>` : `<span>${T("With this you'd be #1")}</span>`}</p>`;
      } else preview = `<p class="cp-race-preview"><span>${T("With this you'd be")}</span> <b data-no-i18n>#${rank}</b></p>`;
    }
    const fillBtn = fill > 0n && input ? `<button type="button" class="cp-race-fill" data-cp-fill="${plain(fill)}"><span>${T("Use")}</span> <b data-no-i18n>${plain(fill)} USDC</b></button>` : "";
    const html = `<div class="cp-race-head"><span class="gv-crown" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg></span><p>${head}</p>${fillBtn}</div>${preview}
      <p class="cp-race-note">${T("The top contributor at the close receives the 15%, over 3 days. Contributions can be withdrawn until the close, so #1 can change up to the last second — only the ranking at the close counts.")}</p>`;
    if (race.__html !== html) { race.innerHTML = html; race.__html = html; }
  }
  race.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cp-fill]");
    if (!b || !input) return;
    input.value = b.dataset.cpFill;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
  if (input) input.addEventListener("input", paintRace);

  // ================= #1 changes hands: the crown moves =================
  let leaderWas = null;
  const bornAt = Date.now(); // the first renders (cache, then chain) aren't a hand-off
  function crownHandOff() {
    const list = rows();
    const now = list.length ? list[0].address.toLowerCase() : null;
    const prev = leaderWas;
    leaderWas = now;
    // a crown on every #1 row
    document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row").forEach((row) => {
      const isTop = row.classList.contains("cp-top1");
      let c = row.querySelector(".cp-lb-crown");
      if (isTop && !c) { c = document.createElement("span"); c.className = "cp-lb-crown"; c.setAttribute("aria-label", tr("Top contributor")); c.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>'; row.querySelector(".bp-lb-rank").appendChild(c); }
      if (!isTop && c) c.remove();
    });
    if (!prev || !now || prev === now || phase() !== "raise" || Date.now() - bornAt < 8000) return;
    const statEl = $("bp-stat-lead");
    const card = statEl && statEl.closest(".bp-mini-stat");
    if (card && !reduce()) { card.classList.remove("cp-lead-new"); void card.offsetWidth; card.classList.add("cp-lead-new"); }
    const w = me(), row = list[0];
    const msg = now === w ? tr("You took #1 — the 15% is yours if it holds at the close.")
      : prev === w ? `${tr("You lost #1 to")} ${short(now)} (${usdc(row.amount)} USDC)`
      : `${tr("New #1:")} ${short(now)} · ${usdc(row.amount)} USDC`;
    if (typeof cpToast === "function") cpToast(msg, "ok");
    if (reduce()) return;
    // fly a crown from the old leader's row to the new one
    const find = (a) => [...document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row")].filter((r) => r.offsetParent && (r.querySelector(".bp-lb-ext") || { getAttribute: () => "" }).getAttribute("href").toLowerCase().endsWith(a));
    const from = find(prev)[0], to = find(now)[0];
    const toCrown = to && to.querySelector(".cp-lb-crown");
    if (toCrown) { toCrown.classList.remove("new"); void toCrown.offsetWidth; toCrown.classList.add("new"); }
    if (!from || !toCrown) return;
    const a = from.querySelector(".bp-lb-rank").getBoundingClientRect(), b = toCrown.getBoundingClientRect();
    const fly = document.createElement("span");
    fly.className = "cp-crown-fly"; fly.setAttribute("aria-hidden", "true");
    fly.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
    fly.style.cssText = `left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px;--dx:${b.left + b.width / 2 - (a.left + a.width / 2)}px;--dy:${b.top + b.height / 2 - (a.top + a.height / 2)}px`;
    document.body.appendChild(fly);
    toCrown.style.opacity = "0";
    setTimeout(() => { fly.remove(); toCrown.style.opacity = ""; }, 800);
  }
  document.addEventListener("circlepad:lb", () => { try { paintRace(); crownHandOff(); } catch (err) { console.warn("circlepad-round race", err); } });

  // ================= the vote, alive: rolling totals, flame gauges, the coin swapping, the last hour =================
  // numbers roll digit by digit when they go up
  const odoLast = new Map();
  function odometer(el, key) {
    // still rolling from the last change: its text is the digit strips, not the number — let it finish
    if (el.classList.contains("odo") || el.querySelector(".odo-strip")) return;
    const text = el.textContent, prev = odoLast.get(key);
    odoLast.set(key, text);
    if (reduce() || prev == null || prev === text || el.dataset.odo === text) return;
    const n = (x) => Number(String(x).replace(/[^0-9]/g, "")) || 0;
    if (n(text) <= n(prev)) return;
    el.dataset.odo = text;
    const pad = prev.padStart(text.length, " ");
    el.innerHTML = [...text].map((ch, i) => {
      if (!/\d/.test(ch)) return `<span class="odo-s">${esc(ch)}</span>`;
      const from = /\d/.test(pad[i]) ? Number(pad[i]) : 0, to = Number(ch);
      const end = to >= from ? to : to + 10;
      const strip = Array.from({ length: 20 }, (_, k) => `<i>${k % 10}</i>`).join("");
      return `<span class="odo-c" style="--from:${from};--to:${end};--d:${(text.length - i) * 45}ms"><span class="odo-strip">${strip}</span></span>`;
    }).join("");
    el.classList.add("odo");
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("odo-go")));
    setTimeout(() => { if (el.dataset.odo === text) { el.classList.remove("odo", "odo-go"); el.textContent = text; } }, 1300);
  }
  function odoAll() {
    [["gov", ".gv-burned b"], ["strip", "#cp-strip [data-cp-burned]"], ["hero", "#cp-phase-hero [data-cp-burned]"], ["feed", "#gv-burnfeed .gv-feed-stats b"]].forEach(([k, sel]) => {
      const el = document.querySelector(sel);
      if (el) odometer(el, k);
    });
  }
  // how much each category has burned, as a flame gauge under its title
  const gaugeLast = new Map();
  function paintGauges() {
    const g = G();
    if (!g || !burnOn() || !Array.isArray(g.categories)) return;
    const sums = g.categories.map((c) => c.options.reduce((a, o) => a + BigInt(o.weight || 0), 0n));
    const max = sums.reduce((a, b) => (b > a ? b : a), 0n);
    g.categories.forEach((c, i) => {
      const card = $(`gv-cat-${i}`);
      if (!card || !c.set) return;
      const head = card.querySelector(".bp-gov-cat-head");
      if (!head) return;
      let gauge = card.querySelector(".gv-gauge");
      if (!gauge) { gauge = document.createElement("div"); gauge.className = "gv-gauge"; gauge.setAttribute("aria-hidden", "true"); gauge.innerHTML = `<span class="cp-flame sm"></span><div class="gv-gauge-bar"><i></i></div>`; head.insertAdjacentElement("afterend", gauge); }
      const pct = max > 0n ? Number((sums[i] * 1000n) / max) / 10 : 0;
      const bar = gauge.querySelector("i"), was = gaugeLast.has(i) ? gaugeLast.get(i) : 0;
      gaugeLast.set(i, pct);
      if (reduce() || was === pct) { bar.style.width = pct + "%"; return; }
      bar.style.transition = "none"; bar.style.width = was + "%";
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = ""; bar.style.width = pct + "%"; }));
      gauge.classList.toggle("hot", pct > 0 && sums[i] === max);
    });
  }
  // the big coin card: when the leading name / ticker / logo / date changes, it flips to the new one
  let coinKey = null;
  function coinSwap() {
    const c = document.querySelector(".gv-coin-hero");
    if (!c) return;
    const k = c.dataset.coinKey || "";
    if (coinKey != null && k !== coinKey && !reduce()) { c.classList.remove("swap"); void c.offsetWidth; c.classList.add("swap"); }
    coinKey = k;
  }
  // the last hour: the clocks beat; the last ten minutes: the strip turns red
  function paintFinal() {
    const ph = phase(), ends = ph === "voting" ? votingEnds() : ph === "raise" ? deadline() : 0;
    const rem = ends ? ends - nowS() : Infinity;
    document.body.classList.toggle("cp-final-hour", rem > 0 && rem <= 3600);
    document.body.classList.toggle("cp-final-10", rem > 0 && rem <= 600);
  }
  function aliveAll() { try { odoAll(); paintGauges(); coinSwap(); paintFinal(); } catch (err) { console.warn("circlepad-round alive", err); } }
  document.addEventListener("circlepad:govpaint", aliveAll);

  // ================= the close: at 0 every open page pulls the result by itself =================
  let closing = null; // { at, tries }
  function watchClose() {
    const ph = phase();
    if (ph !== "raise" && ph !== "voting") { if (closing && closing.el) { closing.el.remove(); } closing = null; return; }
    const ends = ph === "voting" ? votingEnds() : deadline();
    if (!ends || nowS() < ends || closing) return;
    closing = { tries: 0, el: null };
    // a short curtain while the chain catches up
    const el = document.createElement("div");
    el.className = "cp-closing"; el.setAttribute("role", "status");
    el.innerHTML = `<div class="cp-closing-box"><span class="cp-flame" aria-hidden="true"></span><b>${R() && R().isOpen === false || deadline() <= nowS() ? esc(window.cpRT ? window.cpRT("Round #1 has closed") : tr("Round #1 has closed")) : T("Voting has closed")}</b><p>${T("Counting the votes on-chain — the result opens in a moment.")}</p></div>`;
    document.body.appendChild(el); closing.el = el;
    if (!reduce()) requestAnimationFrame(() => el.classList.add("in")); else el.classList.add("in", "still");
    const pull = async () => {
      if (!closing) return;
      closing.tries++;
      try {
        if (typeof refreshCirclepadCore === "function") await refreshCirclepadCore();
        if (typeof refreshCirclepadGovernance === "function") await refreshCirclepadGovernance();
      } catch { /* retry */ }
      const now = phase();
      if (now === "result" || now === "closed") {
        const c = closing; closing = { done: true, el: null };
        if (c && c.el) { c.el.classList.remove("in"); setTimeout(() => c.el.remove(), 300); }
        paintAll(); loadFeed();
        if (now === "result") setTimeout(() => reveal(false), 400);
        return;
      }
      if (closing.tries < 40) setTimeout(pull, closing.tries < 8 ? 2500 : 6000);
      else if (closing.el) { closing.el.remove(); closing.el = null; }
    };
    setTimeout(pull, 1200);
  }

  // ================= wiring =================
  function paintAll() {
    try { paintStrip(); paintHero(); paintNext(); paintTimeline(); paintProjects(); paintTreasury(); paintBallotNav(); paintRace(); } catch (err) { console.warn("circlepad-round", err); }
    aliveAll();
  }
  document.addEventListener("circlepad:state", paintAll);
  document.addEventListener("circlepad:lb", paintAll);
  document.addEventListener("circlepad:prevote", () => paintHero());
  document.addEventListener("circlepad:gov", () => { paintAll(); if (feed) paintFeed(); if (phase() === "result") setTimeout(() => reveal(false), 600); });
  document.addEventListener("circlepad:govpaint", () => { paintBallotNav(); if (feed) paintFeed(); });
  document.addEventListener("arc:lang", paintAll);
  document.addEventListener("circlepad:tz", paintAll);
  setInterval(() => {
    document.querySelectorAll("[data-cp-to]").forEach((el) => {
      const rem = Number(el.dataset.cpTo) - nowS();
      // a raise / vote clock that hit zero waits for the chain: say so instead of "0m 0s"
      el.textContent = rem <= 0 && el.closest(".cp-strip-clock, .cp-phero.voting, .cp-phero.upcoming") ? T("Closing…") : left(rem);
    });
    const gp = $("bp-panel-governance");
    document.body.classList.toggle("cp-gov-tab", !!(gp && gp.classList.contains("active")));
    paintTimeline();
    paintFinal();
    watchClose();
  }, 1000);
  setInterval(() => { if (!document.hidden && (phase() === "voting" || Date.now() - feedT > 60e3)) loadFeed(); }, 15000);
  setInterval(() => { if (!document.hidden) paintAll(); }, 30000);
  loadWallets().then(paintAll);
  loadFeed();
  paintAll();
  window.circlepadRound = { reveal: () => reveal(true), feed: () => feed, phase, winner, burnedTotal, deadline, votingEnds, left, lead, nowS };
})();
;
/* ---- circlepad-rounds.js ---- */
/* global CONFIG, ethers, state, cpToast, cpConfirm, cpErrText, ensureArcForWrite, connectWallet, fmtEth, cpFmtTime, govLogoUrl, govDate, govFmtDate, _circlepadState, refreshCirclepadCore */
// circlepad-rounds.js — CirclePad round after round (api/_rounds.mjs):
//   · Launch process: stays under the round panel in every phase; after the close it follows the real
//     steps — the split (on-chain), then the top contributor's payout and the launch, which the round
//     wallet marks done here (signed message, optional proof link). The round wallet gets the buttons.
//   · Projects: a full summary card for every closed round (result, raise, split, launch process, vote
//     results, leaderboard, CSV) and the next round in its pre-start state, with "Start Round #N" for
//     the round wallet: it deploys a fresh BigPadEscrow (same recipient / platform / treasury wallets),
//     registers it, then calls start() — the 72-hour raise opens right then.
//   · Leaderboard: download the round's leaderboard (rank, wallet, USDC, share) as CSV.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-projects") || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const RTraw = (s, n) => { const t = tr(s); return n === 1 ? t : String(t).replace(/#1(?!\d)/g, "#" + n).replace(/第 1 轮/g, "第 " + n + " 轮"); };
  const RT = (s, n) => esc(RTraw(s, n));
  const mine = (msg) => Object.assign(new Error(msg), { mine: true });
  const errText = (e, fb) => (e && e.mine ? e.message : typeof cpErrText === "function" ? tr(cpErrText(e, fb)) : String((e && e.message) || fb));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const ex = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const usdc = (w, d = 2) => (typeof fmtEth === "function" ? fmtEth(BigInt(w || 0), d) : String(w));
  const ALT = (v, c) => (window.cpConv ? window.cpConv.html(v, c) : ""); // "≈ 0.04 ETH" under a USDC amount (circlepad-conv.js)
  const tok = (w) => Math.round(Number(BigInt(w || 0) / 10n ** 18n)).toLocaleString("en-US");
  const num = (x) => Number(x || 0).toLocaleString("en-US");
  const pct = (x) => `${Number(x || 0).toFixed(2)}%`;
  const dt = (ts) => (typeof cpFmtTime === "function" ? cpFmtTime(new Date(ts * 1000), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : new Date(ts * 1000).toLocaleString());
  const nowS = () => Math.floor(Date.now() / 1000) + (window.circlepadGovSkew || 0);
  const API = "/api/social";
  const N = () => CONFIG.CIRCLEPAD_ROUND || 1;
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const STEPS = ["72h raise", "Burn-to-vote", "Close & split", "Top contributor", "Launch & airdrop"];
  const csvUrl = (n, u) => `${API}?circle=csv&round=${n}${u ? `&in=${u}` : ""}`;
  /// the three downloads: exact USDC, and the same with ETH or SOL columns at today's price
  const csvLinks = (n) => `<a class="bp-btn-ghost" href="${csvUrl(n)}" download>${T("Download CSV")}</a><a class="bp-btn-ghost cp-csv-alt" href="${csvUrl(n, "eth")}" download data-no-i18n>CSV · ETH</a><a class="bp-btn-ghost cp-csv-alt" href="${csvUrl(n, "sol")}" download data-no-i18n>CSV · SOL</a>`;
  window.cpRoundCards = true;

  let data = null; // ?circle=rounds
  const sums = new Map(); // n → ?circle=summary
  let busy = false;
  const team = () => !!(data && data.wallets && me() && me() === data.wallets.recipient);
  const roundOf = (n) => (data ? data.rounds.find((r) => r.n === n) : null) || null;
  const marksOf = (n) => { const r = roundOf(n); return (r && r.marks) || {}; };
  const proofLink = (p) => (!p ? "" : /^0x[0-9a-fA-F]{64}$/.test(p) ? ex("tx", p) : p);
  // after the close: 2 split next · 3 top contributor · 4 launch · 5 all done (circlepad-fx.js paints it)
  const stepFrom = (st, m) => (!st || !st.started ? -1 : nowS() < Number(st.deadline) ? 0 : !st.distributed ? 2 : !(m && m.top) ? 3 : !(m && m.launch) ? 4 : 5);
  // the launch can be marked before the top contributor's 3-day payout ends: step 5 shows done on its own
  window.cpStepDoneExtra = (i) => i === 4 && !!marksOf(N()).launch;
  window.cpStageLabel = (at) => (at === 3 && marksOf(N()).launch ? "Launched — top contributor paid over 3 days" : null);
  window.cpStepAfterClose = (s) => stepFrom({ started: true, deadline: 0, distributed: !!(s && s.distributed) }, marksOf(N()));

  // ================= data =================
  async function load(fresh) {
    try {
      const r = await fetch(`${API}?circle=rounds${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j || !Array.isArray(j.rounds)) return;
      data = j;
      // this page booted on an older round (cached boot script): switch once
      const newest = j.rounds[j.rounds.length - 1];
      if (newest && newest.n > N()) {
        try {
          localStorage.setItem("circlepad.round.just-started", JSON.stringify({ n: newest.n, escrow: newest.escrow, started: !!newest.started, at: Date.now() }));
          if (sessionStorage.getItem("circlepad.round.reloaded") !== String(newest.n)) { sessionStorage.setItem("circlepad.round.reloaded", String(newest.n)); location.reload(); return; }
        } catch (e) { /* storage blocked */ }
      }
      await Promise.all(j.rounds.filter((x) => x.state && x.state.started && nowS() >= Number(x.state.deadline)).map((x) => loadSummary(x.n, fresh)));
      paintAll();
      // for circlepad-v5.js (round results, the sidebar status): the rounds and each closed round's summary
      window.cpRoundsData = { ...j, sums: Object.fromEntries([...sums.entries()].map(([k, v]) => [k, v.v])) };
      document.dispatchEvent(new CustomEvent("circlepad:rounds", { detail: window.cpRoundsData }));
    } catch (e) { console.warn("circlepad-rounds", e); }
  }
  async function loadSummary(n, fresh) {
    const have = sums.get(n);
    if (have && !fresh && Date.now() - have.at < 60e3) return;
    try {
      const r = await fetch(`${API}?circle=summary&round=${n}`, { cache: fresh ? "no-store" : "default" });
      const j = r.ok ? await r.json() : null;
      if (j && j.n === n) sums.set(n, { at: Date.now(), v: j });
    } catch (e) { /* keep the last one */ }
  }

  // ================= Launch process (Home) =================
  function adaptSteps() {
    const tl = $("cp-timeline");
    if (!tl || N() === 1 || tl.dataset.adapted) return;
    tl.dataset.adapted = "1";
    const lis = tl.querySelectorAll(".bp-steps > li");
    const set = (i, title, body) => { const li = lis[i]; if (!li) return; const s = li.querySelector("strong"), p = li.querySelector("p"); if (s && title) s.textContent = tr(title); if (p) p.textContent = tr(body); };
    const G = CONFIG.CIRCLEPAD_ROUND_GOV || {};
    if (CONFIG.CIRCLEPAD_ROUND_PLAN && window.cpPlan) { window.cpPlan.steps(set); const nt = tl.querySelector(".cp-tl-note"); if (nt) nt.textContent = tr("The raise and the 80 / 15 / 5 split are enforced by the escrow contract. The steps after the split are the team's, marked done here by the round wallet."); return; }
    if (G.voteOn) set(1, "Pre-vote, then burn-to-vote", "Anyone suggests and pre-votes on ideas for free; the round wallet picks the candidates from the top; $ARCIRCLE holders burn-to-vote on them — 1,000 $ARCIRCLE per vote.");
    else set(1, "Burn-to-vote", "As in Round #1: ideas first, then burn-to-vote with $ARCIRCLE on name, ticker, logo, roadmap and date. Opens soon.");
    set(3, "", G.top === true ? "The largest contributor at the close receives the 15%, over 3 days." : "Whether the top contributor receives the 15% this round: not decided yet.");
    set(4, "", G.airdrop ? "The coin launches on the date the vote picks. " + G.airdrop : "The coin launches on the date the vote picks. The airdrop for this round: not decided yet.");
    const note = tl.querySelector(".cp-tl-note");
    if (note) note.textContent = tr("The raise and the 80 / 15 / 5 split are enforced by the escrow contract. The steps after the split are the team's, marked done here by the round wallet.");
  }
  // a mark: when it was done (unless it's a settled mark with no time), and its proof link
  function markText(m, what) {
    if (!m) return "";
    const link = proofLink(m.proof);
    const when = m.at ? ` · <span data-no-i18n>${esc(dt(Math.floor(m.at / 1000)))}</span>` : "";
    return `<em class="cp-tl-mark"><i></i>${m.merged ? RT("Merged into Round #1", m.merged) : T(m.exception ? "Done · this round's exception" : what)}${when}${link ? ` · <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${T("Proof")} ↗</a>` : ""}</em>`;
  }
  function paintTimeline() {
    const tl = $("cp-timeline");
    if (!tl) return;
    adaptSteps();
    const s = typeof _circlepadState !== "undefined" ? _circlepadState : null;
    const m = marksOf(N());
    const lis = [...tl.querySelectorAll(".bp-steps > li")];
    const put = (i, html) => { const li = lis[i]; if (!li) return; let el = li.querySelector(".cp-tl-mark-w"); if (!html) { if (el) el.remove(); return; } if (!el) { el = document.createElement("span"); el.className = "cp-tl-mark-w"; (li.querySelector("div") || li).appendChild(el); } if (el.__h !== html) { el.innerHTML = html; el.__h = html; } };
    put(2, s && s.started && s.distributed ? `<em class="cp-tl-mark"><i></i>${T("Split sent from the escrow")}</em>` : "");
    put(3, markText(m.top, "Paid"));
    put(4, markText(m.launch, "Done"));
    // the round wallet's controls
    let box = $("cp-tl-admin");
    if (!team() || !s || !s.started) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "cp-tl-admin"; box.className = "cp-admin"; tl.appendChild(box); }
    const html = adminHtml(N(), { started: s.started, deadline: Number(s.deadline || 0), distributed: !!s.distributed, escrow: CONFIG.CIRCLEPAD_ESCROW_ADDRESS }, m);
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }
  function adminHtml(n, st, m) {
    const at = stepFrom(st, m);
    const head = `<span class="cp-admin-k">${T("Round wallet")}</span>`;
    const proof = `<input type="text" class="cp-admin-proof" data-proof-for="${n}" placeholder="${T("Proof (optional): tx hash or https:// link")}" maxlength="200" autocomplete="off" spellcheck="false">`;
    const undo = (step, label) => `<button type="button" class="bp-btn-ghost cp-admin-undo" data-cp-stage="${n}" data-step="${step}" data-undo="1">${T(label)}</button>`;
    let body = "";
    if (at === 0) body = `<p>${T("Steps 1–2 run on their own until the raise closes.")} <span data-no-i18n>${esc(dt(st.deadline))}</span></p>`;
    else if (at === 2) body = `<p>${T("The raise has closed. Send the split to move on: 80% recipient, 15% treasury, 5% platform, in one transaction.")}</p><div class="cp-admin-row"><button type="button" class="bp-btn-primary" data-cp-split="${n}" data-escrow="${esc(st.escrow)}">${T("Send the 80 / 15 / 5 split")}</button></div>`;
    else if (at >= 3) {
      // steps 4 and 5 run side by side: the top contributor is paid over 3 days while the coin launches
      const row = (step, k, label, doneLabel) => (m && m[step]
        ? `<div class="cp-admin-row"><span class="cp-admin-done">${m[step].merged ? RT("Merged into Round #1", m[step].merged) : T(m[step].exception ? "Step " + k + " done — this round's exception" : doneLabel)}</span>${m[step].fixed ? "" : undo(step, "Undo step " + k)}</div>`
        : `<div class="cp-admin-row"><button type="button" class="bp-btn-primary" data-cp-stage="${n}" data-step="${step}">${T("Mark step " + k + " done")}</button><span class="cp-admin-what">${T(label)}</span></div>`);
      body = at === 5 ? `<p>${T("Every step is done.")}</p>` : `<p>${T("Mark each step when it's done — they can be done in either order. A proof link is optional.")}</p><div class="cp-admin-row">${proof}</div>`;
      body += row("top", 4, "Top contributor has received the 15%", "Step 4 done — top contributor paid") + row("launch", 5, "Coin launched and airdrop sent", "Step 5 done — launched");
    }
    return head + body;
  }

  // ================= Projects =================
  function projectsWrap() {
    const panel = $("bp-panel-projects");
    const wrap = panel && panel.querySelector(".bp-simple");
    if (!wrap) return null;
    let box = $("cp-rounds");
    // under the heading; circlepad-round.js puts the live round's card right above it
    if (!box) { box = document.createElement("div"); box.id = "cp-rounds"; box.className = "cp-rounds"; const h1 = wrap.querySelector("h1"); if (h1) h1.insertAdjacentElement("afterend", box); else wrap.prepend(box); }
    return { wrap, box };
  }
  function miniSteps(at, m, n) {
    return `<ol class="cp-mini-steps">${STEPS.map((s, i) => {
      const cls = at < 0 ? "" : i < at || (i === 4 && m && m.launch) ? "done" : i === at ? "now" : "";
      const label = n > 1 && i === 1 ? "Coin identity" : s;
      const mk = i === 3 && m && m.top ? m.top : i === 4 && m && m.launch ? m.launch : null;
      const link = mk ? proofLink(mk.proof) : "";
      const bits = [mk && mk.merged ? RT("Merged into Round #1", mk.merged) : mk && mk.exception ? esc(tr("This round's exception")) : mk && mk.at ? esc(dt(Math.floor(mk.at / 1000))) : "", link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(tr("Proof"))} ↗</a>` : ""].filter(Boolean);
      return `<li class="${cls}"><span class="cp-ms-n">${i + 1}</span><b>${T(label)}</b>${bits.length ? `<small data-no-i18n>${bits.join(" · ")}</small>` : ""}</li>`;
    }).join("")}</ol>`;
  }
  function badgeOf(v) {
    const at = stepFrom(v.state, v.marks);
    if (v.marks && v.marks.merged) return ["done", RTraw("Merged into Round #1", v.marks.merged.into)];
    if (at >= 3 && v.marks && v.marks.launch) return ["done", "Launched"];
    return at === 2 ? ["wait", "Settling the split"] : at === 3 ? ["ok", "Split sent"] : at === 4 ? ["ok", "Top contributor paid"] : ["ok", "Closed"];
  }
  const boardOpen = new Set();
  function summaryHtml(v) {
    const n = v.n, st = v.state, at = stepFrom(st, v.marks);
    const [bcls, blabel] = badgeOf(v);
    const b = v.ballot, win = (k) => (b && b.winners && b.winners[k] && b.winners[k].winner ? b.winners[k].winner.text : "");
    const name = win(0), ticker = String(win(1) || "").replace(/^\$/, ""), logo = win(2) && typeof govLogoUrl === "function" ? govLogoUrl(win(2)) : "", date = win(4) && typeof govDate === "function" ? govDate(win(4)) : null, road = String(win(3) || "").split("\n")[0];
    const top = v.board.top;
    const total = BigInt(st.totalRaised || 0);
    const rows = v.board.rows || [];
    const all = boardOpen.has(n);
    const shown = all ? rows : rows.slice(0, 10);
    const coin = b ? `<div class="cp-sum-coin"><span class="cp-coin-logo">${logo ? `<img src="${esc(logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((name || "?").slice(0, 1).toUpperCase())}</em>`}</span>
        <div class="cp-sum-id"><small>${T("The coin the vote chose")}</small><b data-no-i18n>${esc(name || "—")}</b><span data-no-i18n>${ticker ? "$" + esc(ticker) : "—"}</span></div>
        <dl><div><dt>${T("Launch date")}</dt><dd data-no-i18n>${date && typeof govFmtDate === "function" ? esc(govFmtDate(date)) : "—"}</dd></div><div><dt>${T("Roadmap")}</dt><dd data-no-i18n>${esc(road || "—")}</dd></div></dl></div>` : "";
    const stat = (k, val, sub) => `<div><small>${T(k)}</small><b data-no-i18n>${val}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    const stats = [
      stat("Raised", `${usdc(total, 2)} USDC${ALT(total, "cp-alt-sm")}`, v.board.flow ? `<span data-no-i18n>${usdc(v.board.flow.in, 0)}</span> ${T("in")} · <span data-no-i18n>${usdc(v.board.flow.out, 0)}</span> ${T("withdrawn")}` : ""),
      stat("Contributors", num(v.board.contributors), v.board.flow ? `<span data-no-i18n>${num(v.board.flow.wallets)}</span> ${T("wallets took part")}` : ""),
      stat("Top contributor", top ? short(top.address) : "—", top ? `<span data-no-i18n>${usdc(top.amount, 2)} USDC · ${pct(top.share)}</span>` : ""),
      b ? stat("Burned by votes", `${tok(b.burned)} $ARCIRCLE`, `<span data-no-i18n>${num(b.votes)}</span> ${T("votes")} · <span data-no-i18n>${num(b.voters)}</span> ${T("voters")}`) : "",
    ].join("");
    const split = `<div class="cp-sum-split ${st.distributed ? "ok" : "wait"}">
        <div><small>${T("Recipient")} · 80%</small><b data-no-i18n>${usdc(v.split.recipient, 2)} USDC</b>${ALT(v.split.recipient, "cp-alt-sm")}${v.wallets ? `<a href="${ex("address", v.wallets.recipient)}" target="_blank" rel="noopener" data-no-i18n>${short(v.wallets.recipient)} ↗</a>` : ""}</div>
        <div><small>${T("Treasury")} · 15%</small><b data-no-i18n>${usdc(v.split.treasury, 2)} USDC</b>${ALT(v.split.treasury, "cp-alt-sm")}${v.wallets ? `<a href="${ex("address", v.wallets.treasury)}" target="_blank" rel="noopener" data-no-i18n>${short(v.wallets.treasury)} ↗</a>` : ""}</div>
        <div><small>${T("Platform")} · 5%</small><b data-no-i18n>${usdc(v.split.platform, 2)} USDC</b>${ALT(v.split.platform, "cp-alt-sm")}${v.wallets ? `<a href="${ex("address", v.wallets.platform)}" target="_blank" rel="noopener" data-no-i18n>${short(v.wallets.platform)} ↗</a>` : ""}</div>
        <p><i></i>${T(st.distributed ? "Split sent from the escrow." : "Not sent yet — the round wallet sends it from the escrow.")}</p></div>`;
    const votes = b && b.winners ? `<details class="cp-sum-sec"><summary>${T("Vote results")}</summary><table class="cp-sum-vote"><thead><tr><th>${T("Category")}</th><th>${T("Chosen")}</th><th>${T("Votes")}</th></tr></thead><tbody>${b.winners.map((c) => {
      const w = c.winner, text = w ? (c.id === 2 ? (govLogoUrl && govLogoUrl(w.text) ? `<img src="${esc(govLogoUrl(w.text))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(w.text)) : c.id === 4 && govDate(w.text) ? esc(govFmtDate(govDate(w.text))) : c.id === 3 ? esc(String(w.text).split("\n")[0]) : esc(w.text)) : "—";
      return `<tr><td>${T(c.label)}</td><td data-no-i18n>${text}</td><td data-no-i18n>${w ? `${num(w.votes)} / ${num(c.votes)}` : "0"}</td></tr>`;
    }).join("")}</tbody></table></details>` : "";
    const board = `<details class="cp-sum-sec" open><summary>${T("Leaderboard")} <span data-no-i18n>(${num(rows.length)})</span></summary>
        <ol class="cp-sum-board">${shown.map((r) => `<li><span class="cp-sb-r" data-no-i18n>#${r.rank}</span><a href="${ex("address", r.address)}" target="_blank" rel="noopener" data-no-i18n>${short(r.address)}</a><span class="cp-sb-bar"><i style="width:${Math.max(1, Math.min(100, r.share)).toFixed(2)}%"></i></span><b data-no-i18n>${usdc(r.amount, 2)}</b><em data-no-i18n>${pct(r.share)}</em></li>`).join("")}</ol>
        <div class="cp-sum-board-acts">${rows.length > 10 ? `<button type="button" class="bp-btn-ghost" data-cp-board="${n}">${T(all ? "Show the top 10" : "Show everyone")}</button>` : ""}${csvLinks(n)}</div></details>`;
    const links = [
      v.report ? `<a href="${esc(v.report)}">${T("Round report")} →</a>` : "",
      `<a href="${ex("address", v.escrow)}" target="_blank" rel="noopener">${T("Escrow contract")} ↗</a>`,
      v.contracts && v.contracts.burnvote ? `<a href="${ex("address", v.contracts.burnvote)}" target="_blank" rel="noopener">${T("Burn-vote contract")} ↗</a>` : "",
      v.deployTx ? `<a href="${ex("tx", v.deployTx)}" target="_blank" rel="noopener">${T("Deploy transaction")} ↗</a>` : "",
    ].filter(Boolean).join("");
    const admin = team() ? `<div class="cp-admin" data-admin-round="${n}">${adminHtml(n, { ...st, deadline: Number(st.deadline), escrow: v.escrow }, v.marks)}</div>` : "";
    return `<article class="cp-sum" id="cp-sum-${n}">
      <div class="cp-sum-top"><span class="cp-rc-badge ${bcls}">${T(blabel)}</span><span class="cp-sum-k">${RT("CirclePad Round #1", n)}</span><span class="cp-sum-dates" data-no-i18n>${v.startedAt ? `${esc(dt(v.startedAt))} → ${esc(dt(st.deadline))}` : ""}</span></div>
      ${coin}
      ${mergedHtml(v)}
      <div class="cp-sum-stats">${stats}</div>
      ${split}
      <div class="cp-sum-steps-w"><small class="cp-sum-h">${T("Launch process")}</small>${miniSteps(at, v.marks, n)}</div>
      ${admin}
      ${votes}
      ${board}
      <div class="cp-sum-links">${links}</div>
    </article>`;
  }
  /// a round folded into a later one: where its raise went and how its contributors are paid
  function mergedHtml(v) {
    const g = v.marks && v.marks.merged;
    if (!g) return "";
    const into = Number(g.into);
    const amt = g.usdc ? Number(g.usdc).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
    return `<div class="cp-sum-merged"><b>${RT("Merged into Round #1", into)}</b><p>${esc(RTraw("This round didn't launch on its own. Its whole raise went into Round #1, and its contributors get their share of Round #1 pro rata, from this round's list below.", into))}${amt ? ` <span data-no-i18n>(${esc(amt)} USDC)</span>` : ""}</p><button type="button" class="bp-btn-ghost" data-cp-go="governance">${RT("Go to Round #1", into)}</button></div>`;
  }
  // the round before n that has an escrow (Round #4 never had one: it went into #3 — CONFIG.CIRCLEPAD_SKIPPED)
  const SKIP = (typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_SKIPPED) || {};
  function lastBefore(n) { const ns = ((data && data.rounds) || []).map((r) => r.n).filter((k) => k < n); return ns.length ? Math.max(...ns) : n - 1; }
  /// a round number that was folded into another round: a short card where its results would be
  function skippedHtml(k) {
    const into = Number(SKIP[k]);
    const g = (CONFIG.CIRCLEPAD_GOV && CONFIG.CIRCLEPAD_GOV[into]) || {}, a = (g.plan && g.plan.also) || {};
    return `<article class="cp-sum cp-sum-skip" id="cp-sum-${k}">
      <div class="cp-sum-top"><span class="cp-rc-badge merged">${T("Merged")}</span><span class="cp-sum-k">${RT("CirclePad Round #1", k)}</span><span class="cp-sum-dates" data-no-i18n>${esc(a.mergedAt || "")}</span></div>
      <p>${esc(RTraw(`Merged into Round #${into}: ARCIRCLE's move to ${a.chain || "Solana"} through ${a.via || "pump.fun"}, run by the team with ${a.with || "ARCIRCLE Orders"} — no raise of its own. Round #${into}'s contributors are in it by their share.`, k))}${a.snapshot ? " " + T("Both rounds' rewards go out as a snapshot airdrop, with more updates to follow.") : ""}</p>
      <div class="cp-sum-links"><button type="button" class="cp-link" data-cp-jump="${into}">${RT("See Round #1", into)} →</button></div>
    </article>`;
  }
  function nextHtml(nx, pending, where) {
    const n = pending ? pending.n : nx.n;
    const can = pending ? true : nx.canOpen;
    const w = data.wallets;
    const btn = team()
      ? `<button type="button" class="bp-btn-primary" data-cp-open="${n}" ${can ? "" : "disabled"}>${RT(pending ? "Start the 72h raise" : "Prepare Round #1", n)}</button>${can ? "" : `<small class="cp-nr-wait">${RT("Round #1 closes first", lastBefore(n))}</small>`}`
      : `<small class="cp-nr-wait">${T("Opens when the round wallet starts it.")}</small>`;
    return `<article class="cp-next-round" id="cp-next-round${where ? "-" + where : ""}">
      <div class="cp-sum-top"><span class="cp-rc-badge pre">${T(pending ? "Ready to start" : "Not started")}</span><span class="cp-sum-k">${RT("CirclePad Round #1", n)}</span></div>
      <p>${T("Same escrow as Round #1: a 72-hour USDC raise, withdraw any time before the close, and the 80 / 15 / 5 split at the close.")}</p>
      <dl class="cp-nr-facts"><div><dt>${T("Opens")}</dt><dd>${T("When the round wallet presses Start — date not decided yet")}</dd></div><div><dt>${T("Coin and vote")}</dt><dd>${T("Not decided yet")}</dd></div><div><dt>${T("Round wallet")}</dt><dd data-no-i18n>${w ? `<a href="${ex("address", w.recipient)}" target="_blank" rel="noopener">${short(w.recipient)} ↗</a>` : "—"}</dd></div>${pending ? `<div><dt>${T("Escrow")}</dt><dd data-no-i18n><a href="${ex("address", pending.escrow)}" target="_blank" rel="noopener">${short(pending.escrow)} ↗</a></dd></div>` : ""}</dl>
      ${miniSteps(-1, null, n)}
      <div class="cp-nr-acts">${btn}</div>
    </article>`;
  }
  function paintProjects() {
    const pw = projectsWrap();
    if (!pw || !data) return;
    const parts = [];
    const pending = data.rounds.find((r) => r.n > 1 && !r.started) || null;
    // this round's results first (once it has closed), then the next round, then older rounds
    const closed = [...data.rounds].reverse().map((r) => sums.get(r.n)).filter((s) => s && s.v.closed).map((s) => s.v);
    const curSum = closed.find((v) => v.n === N());
    const withSkipped = (v) => Object.keys(SKIP).map(Number).filter((k) => Number(SKIP[k]) === v.n).sort((x, y) => y - x).map(skippedHtml).join("") + summaryHtml(v);
    if (pending || data.next) parts.push(nextHtml(data.next, pending));
    if (curSum) parts.push(withSkipped(curSum));
    closed.filter((v) => v !== curSum).forEach((v) => parts.push(withSkipped(v)));
    const html = parts.join("");
    // keep what the round wallet is typing across the 30s refresh
    const typed = {}; pw.box.querySelectorAll("[data-proof-for]").forEach((i) => { if (i.value) typed[i.dataset.proofFor] = i.value; });
    if (pw.box.__h !== html) { pw.box.innerHTML = html; pw.box.__h = html; pw.box.querySelectorAll("[data-proof-for]").forEach((i) => { if (typed[i.dataset.proofFor]) i.value = typed[i.dataset.proofFor]; }); }
    const empty = pw.wrap.querySelector(".bp-empty");
    if (empty) empty.hidden = !!html || !!$("cp-round-card");
  }

  // ================= Home: between rounds =================
  // Round #1 closed, Round #2 not prepared yet → the next round's card on Home too (the round wallet prepares it
  // there); a later round on the page → a line back to the earlier round's results.
  function paintHome() {
    const home = $("bp-panel-home"), feat = $("bp-featured");
    if (!home || !feat || !data) return;
    let box = $("cp-home-next");
    const cur = roundOf(N()), prev = N() > 1 ? roundOf(lastBefore(N())) : null;
    const closed = cur && cur.state && cur.state.started && nowS() >= Number(cur.state.deadline);
    let html = "";
    if (closed && data.next && !data.rounds.some((r) => r.n > N())) {
      const st = cur.state;
      html = `<div class="cp-home-done"><span class="cp-rc-badge done">${T("Complete")}</span><b>${RT("CirclePad Round #1", N())}</b><span data-no-i18n>${usdc(st.totalRaised, 2)} USDC</span><button type="button" class="cp-link" data-cp-go="projects">${T("See the results")} →</button></div>` + nextHtml(data.next, null, "home");
    } else if (prev && prev.state) {
      html = `<div class="cp-home-done"><span class="cp-rc-badge done">${T("Complete")}</span><b>${RT("CirclePad Round #1", prev.n)}</b><span data-no-i18n>${usdc(prev.state.totalRaised, 2)} USDC</span><button type="button" class="cp-link" data-cp-go="projects">${T("See the results")} →</button></div>`;
    }
    if (!html) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("section"); box.id = "cp-home-next"; box.className = "cp-home-next"; feat.insertAdjacentElement("beforebegin", box); }
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }

  // ================= Leaderboard: CSV =================
  function paintCsv() {
    const panel = $("bp-panel-leaderboard");
    const p = panel && panel.querySelector(".bp-simple > p");
    if (!p) return;
    let row = $("cp-lb-tools");
    if (!row) { row = document.createElement("div"); row.id = "cp-lb-tools"; row.className = "cp-lb-tools"; p.insertAdjacentElement("afterend", row); }
    const s = typeof _circlepadState !== "undefined" ? _circlepadState : null;
    const html = s && s.started ? `${csvLinks(N())}<small>${T("Rank, wallet, USDC and share of the raise — exact on-chain amounts. The ETH and SOL files add each amount at today's price (USDC counted as $1) and the price used.")}</small>` : "";
    if (row.__h !== html) { row.innerHTML = html; row.__h = html; }
    row.hidden = !html;
  }

  function paintAll() {
    try { relabel(); paintTimeline(); paintProjects(); paintHome(); paintCsv(); if (typeof window.cpRepaintStage === "function") window.cpRepaintStage(); } catch (e) { console.warn("circlepad-rounds paint", e); }
  }

  // ================= the round wallet's actions =================
  async function needTeam() {
    if (!me() && typeof connectWallet === "function") await connectWallet();
    if (!team()) { cpToast(tr("Connect the round wallet to do this."), "bad"); return false; }
    await ensureArcForWrite();
    return true;
  }
  const issuedNow = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  const stageMessage = (escrow, step, undo, proof, wallet, issued) => `ARCIRCLE PAD — CirclePad launch process\nRound: ${String(escrow).toLowerCase()}\nStep: ${step}\nAction: ${undo ? "undo" : "done"}\nProof: ${proof || "-"}\nWallet: ${String(wallet).toLowerCase()}\nIssued: ${issued}`;
  async function markStage(btn) {
    const n = Number(btn.dataset.cpStage), step = btn.dataset.step, undo = btn.dataset.undo === "1";
    const r = roundOf(n);
    if (!r || busy) return;
    const input = btn.closest(".cp-admin") && btn.closest(".cp-admin").querySelector("[data-proof-for]");
    const proof = undo || !input ? "" : input.value.trim();
    if (proof && !/^0x[0-9a-fA-F]{64}$/.test(proof) && !/^https:\/\//.test(proof)) { cpToast(tr("Proof must be a transaction hash or a full https:// link."), "bad"); return; }
    const label = step === "top" ? "Step 4 — top contributor paid" : "Step 5 — launch & airdrop";
    if (!(await cpConfirm({ title: tr(undo ? "Undo this step?" : "Mark this step done?"), body: `${tr(label)}. ${tr("You sign a message with the round wallet — no transaction, no gas. Everyone sees it on the launch process.")}`, ok: tr(undo ? "Undo" : "Sign & mark done") }))) return;
    busy = true; const orig = btn.textContent; btn.disabled = true; btn.textContent = tr("Sign in wallet…");
    try {
      if (!(await needTeam())) return;
      const wallet = me(), issued = issuedNow();
      const signature = await state.signer.signMessage(stageMessage(r.escrow, step, undo, proof, wallet, issued));
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cstage", round: n, wallet, step, undo, proof, issued, signature }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw mine(j.error || "couldn't save it");
      cpToast(tr(undo ? "Step undone." : "Step marked done."), "ok");
      await load(true);
    } catch (e) {
      cpToast(errText(e, "That didn't go through."), "bad");
    } finally { busy = false; btn.disabled = false; btn.textContent = orig; }
  }
  async function sendSplit(btn) {
    const n = Number(btn.dataset.cpSplit), escrow = btn.dataset.escrow;
    if (busy || !escrow) return;
    if (!(await cpConfirm({ title: tr("Split the raise now?"), body: tr("The full balance goes out in one transaction: 80% to the recipient wallet, 15% to the treasury wallet and 5% to the platform wallet."), ok: tr("Split 80 / 15 / 5") }))) return;
    busy = true; const orig = btn.textContent; btn.disabled = true; btn.textContent = tr("Confirm in wallet…");
    try {
      if (!(await needTeam())) return;
      const c = new ethers.Contract(escrow, ["function withdraw()"], state.signer);
      const tx = await c.withdraw();
      btn.textContent = tr("Confirming…");
      await tx.wait();
      cpToast(tr("Split sent."), "ok");
      if (n === N() && typeof refreshCirclepadCore === "function") await refreshCirclepadCore();
      await load(true);
    } catch (e) {
      cpToast(errText(e, "Withdraw failed or was rejected."), "bad");
    } finally { busy = false; btn.disabled = false; btn.textContent = orig; }
  }
  function loadCode() {
    if (window.CP_ESCROW_CODE) return Promise.resolve(window.CP_ESCROW_CODE);
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "/circlepad-escrow-code.js?v=1";
      s.onload = () => (window.CP_ESCROW_CODE ? res(window.CP_ESCROW_CODE) : rej(mine("escrow code missing")));
      s.onerror = () => rej(mine("couldn't load the escrow code — try again"));
      document.head.appendChild(s);
    });
  }
  async function register(tx) {
    for (let k = 0; k < 8; k++) {
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cround", tx }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.round) return j.round;
      if (res.status !== 404) throw mine(j.error || "couldn't register the round");
      await new Promise((r) => setTimeout(r, 2500)); // the node hasn't seen it yet
    }
    throw mine("the deploy isn't visible yet — press Start again in a minute");
  }
  async function openRound(btn) {
    const n = Number(btn.dataset.cpOpen);
    if (busy || !data || !data.wallets) return;
    let pending = data.rounds.find((r) => r.n === n && !r.started) || null;
    // two steps: "Prepare" deploys the round's escrow (the page switches to it, before its start), "Start" opens the 72 hours
    const body = pending
      ? tr("The 72-hour raise opens right now and closes 72 hours later. This can't be undone or redone.")
      : tr("One wallet confirmation: a fresh escrow contract is deployed with the same recipient, platform and treasury wallets as Round #1. The page then shows the round before its start; the 72 hours only begin when you press Start.");
    if (!(await cpConfirm({ title: RTraw(pending ? "Start the 72h raise" : "Prepare Round #1", n) + "?", body, ok: tr(pending ? "Start" : "Prepare") }))) return;
    busy = true; const orig = btn.textContent; btn.disabled = true;
    try {
      if (!(await needTeam())) return;
      if (!pending) {
        btn.textContent = tr("Deploy — confirm in wallet…");
        const code = await loadCode();
        const w = data.wallets;
        const f = new ethers.ContractFactory(["constructor(address,address,address,uint256)"], code, state.signer);
        const c = await f.deploy(w.recipient, w.platform, w.treasury, BigInt(w.cap || 0));
        const dtx = c.deploymentTransaction();
        btn.textContent = tr("Deploying…");
        await dtx.wait();
        btn.textContent = tr("Registering…");
        pending = await register(dtx.hash);
        try { localStorage.setItem("circlepad.round.just-started", JSON.stringify({ n: pending.n, escrow: pending.escrow, started: false, at: Date.now() })); } catch (err) { /* the boot script catches up within a minute */ }
        await fetch(`${API}?circle=rounds&fresh=1`, { cache: "no-store" }).catch(() => null);
        cpToast(RTraw("Round #1 is ready — press Start when you want the 72 hours to begin.", pending.n), "ok");
        setTimeout(() => { location.hash = "home"; location.reload(); }, 900);
        return;
      }
      btn.textContent = tr("Start — confirm in wallet…");
      const e = new ethers.Contract(pending.escrow, ["function start()"], state.signer);
      const tx = await e.start();
      btn.textContent = tr("Confirming…");
      await tx.wait();
      try { localStorage.setItem("circlepad.round.just-started", JSON.stringify({ n: pending.n, escrow: pending.escrow, started: true, at: Date.now() })); } catch (err) { /* the boot script catches up within a minute */ }
      await fetch(`${API}?circle=rounds&fresh=1`, { cache: "no-store" }).catch(() => null);
      cpToast(RTraw("Round #1 is open.", pending.n), "ok");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      cpToast(errText(e, "That didn't go through."), "bad");
      await load(true);
    } finally { busy = false; btn.disabled = false; btn.textContent = orig; }
  }
  document.addEventListener("click", (e) => {
    const j = e.target.closest("[data-cp-jump]"); if (j) { const t = $("cp-sum-" + j.dataset.cpJump); if (t) { t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); t.classList.remove("cp-flash"); void t.offsetWidth; t.classList.add("cp-flash"); } return; }
    const a = e.target.closest("[data-cp-stage]"); if (a) { markStage(a); return; }
    const s = e.target.closest("[data-cp-split]"); if (s) { sendSplit(s); return; }
    const o = e.target.closest("[data-cp-open]"); if (o) { openRound(o); return; }
    const b = e.target.closest("[data-cp-board]");
    if (b) { const n = Number(b.dataset.cpBoard); if (boardOpen.has(n)) boardOpen.delete(n); else boardOpen.add(n); paintProjects(); }
  });

  // Later rounds: this round's number on the page, and Governance says plainly that its vote isn't set up
  function relabel() {
    if (N() === 1) return;
    const note = $("bp-gov-panel-note"), G = CONFIG.CIRCLEPAD_ROUND_GOV || {};
    if (CONFIG.CIRCLEPAD_ROUND_PLAN && window.cpPlan) window.cpPlan.copy();
    else if (note && !G.voteOn) note.textContent = tr("Governance for this round opens soon, as in Round #1: first the community's ideas, then burn-to-vote with $ARCIRCLE until the raise closes. Round #1's result is on Projects.");
    const h2 = document.querySelector("#bp-featured .bp-featured-info h2");
    if (h2 && h2.firstChild && h2.firstChild.nodeType === 3) { h2.setAttribute("data-no-i18n", ""); h2.firstChild.textContent = RTraw("CirclePad Round #1", N()) + " "; }
    const tag = document.querySelector(".cp-tl-tag");
    if (tag) tag.textContent = RTraw("Round #1", N());
  }

  ["circlepad:state", "circlepad:lb", "arc:lang"].forEach((ev) => document.addEventListener(ev, paintAll));
  load(false);
  setInterval(() => { if (!document.hidden) load(false); }, 30e3);
  // the close happens on the clock: pick up the summary without waiting a full cycle
  setInterval(() => { const r = roundOf(N()); if (r && r.state && r.state.started && nowS() >= Number(r.state.deadline) && !sums.has(N())) load(true); }, 10e3);
})();
;
/* ---- circlepad-live.js ---- */
/* global CONFIG, state, fmtEth, govLogoUrl, govDate, govFmtDate, connectWallet, _circlepadState */
// circlepad-live.js — Round #1 while it's live:
//   · phones: the language switch lives in the tab menu, not the top bar
//   · Home: the coin being decided, the raise and the activity first; the
//     explainers move below them while the round runs
//   · My Position: contribution, rank, what #1 takes, my votes, my burn and
//     the airdrop on one screen
//   · Airdrop: "Eligible · contributed N USDC" once a wallet is connected
//   · a full-screen live board (clock, standings, burn counter) for streams
//     and X Spaces — the "Live screen" button, or /circle?live
//   · candidate tiles tilt and glow under the finger; the one just voted for
//     gets a flame border for a few seconds
// Every motion here is off under "reduce motion".
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const usdc = (wei, d = 2) => (typeof fmtEth === "function" ? fmtEth(wei, d) : String(wei));
  const ALT = (v, c) => (window.cpConv ? window.cpConv.html(v, c) : ""); // "≈ 0.04 ETH" under a USDC amount (circlepad-conv.js)
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const RD = () => window.circlepadRound || null;
  const R = () => (typeof _circlepadState !== "undefined" && _circlepadState) || null;
  const G = () => window.circlepadGov || null;
  const rows = () => window.circlepadLbRows || [];
  const phase = () => (RD() ? RD().phase() : "pre");
  const nowS = () => (RD() ? RD().nowS() : Math.floor(Date.now() / 1000));
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const live = () => { const p = phase(); return p === "raise" || p === "voting"; };
  const goTab = (t) => { const n = document.querySelector(`.bp-nav-item[data-tab="${t}"]`); if (n) n.click(); };

  // ================= phones: language in the menu =================
  function mountLangMenu() {
    const side = $("bp-sidebar"), top = document.querySelector(".bp-topbar .lang-toggle");
    if (!side || !top || $("cp-menu-lang")) return;
    const row = document.createElement("div");
    row.id = "cp-menu-lang"; row.className = "cp-menu-lang";
    row.innerHTML = `<span>${T("Language")}</span><div class="lang-toggle" role="group" aria-label="Language" data-no-i18n>${top.innerHTML}</div>`;
    row.addEventListener("click", (e) => {
      const b = e.target.closest("[data-l]");
      if (b && window.arcI18n) window.arcI18n.set(b.getAttribute("data-l"));
    });
    const navs = side.querySelectorAll(".bp-side-nav");
    (navs[navs.length - 1] || side).insertAdjacentElement("afterend", row);
    document.body.classList.add("cp-lang-in-menu");
  }

  // ================= Home: live things first while the round runs =================
  let ordered = false;
  function orderHome() {
    // v9: a real round leads Home whenever there is one (live, closed, or a later round waiting to start) — the
    // "how it works" pieces go under it
    if (ordered || !(live() || phase() !== "pre" || (CONFIG.CIRCLEPAD_ROUND || 1) > 1)) return;
    const home = $("bp-panel-home"), anchor = document.querySelector("#bp-panel-home > .bp-nextcard");
    if (!home || !anchor) return;
    ordered = true;
    // the launch process stays up top, under the round panel (circlepad-rounds.js)
    const explain = [".bp-hero", "#cp-flowcard", "#cpx-trust", ".cp-core-coin"].map((s) => home.querySelector(`:scope > ${s}`)).filter(Boolean);
    const lead = document.createElement("div");
    lead.className = "cp-home-more"; lead.id = "cp-home-more";
    lead.innerHTML = `<h3>${T("How CirclePad works")}</h3>`;
    anchor.insertAdjacentElement("beforebegin", lead);
    explain.forEach((el) => anchor.insertAdjacentElement("beforebegin", el));
    document.body.classList.add("cp-home-live");
  }

  // ================= My Position on one screen =================
  function myNumbers() {
    const r = R(), w = me(), list = rows(), g = G();
    const row = w ? list.find((x) => String(x.address).toLowerCase() === w) : null;
    const mine = row ? BigInt(row.amount) : r && r.myContribution != null ? BigInt(r.myContribution) : 0n;
    const rank = row ? list.indexOf(row) + 1 : 0;
    const top = list[0] || null;
    let votes = 0n, cats = 0;
    if (g && Array.isArray(g.categories)) g.categories.forEach((c) => { const s = c.options.reduce((a, o) => a + BigInt(o.mine || 0), 0n); votes += s; if (s > 0n) cats++; });
    const bal = g && g.burn && g.burn.bal != null ? BigInt(g.burn.bal) : null;
    return { r, w, list, mine, rank, top, votes, cats, bal, total: r ? BigInt(r.totalRaised || 0n) : 0n };
  }
  function paintPosition() {
    const panel = $("bp-panel-position");
    if (!panel) return;
    const wrap = panel.querySelector(".bp-simple");
    let box = $("cp-pos-sum");
    const n = myNumbers(), ph = phase();
    if (!n.w || !n.r || !n.r.started) { if (box) box.remove(); panel.classList.remove("cp-pos-on"); return; }
    if (!box) { box = document.createElement("section"); box.id = "cp-pos-sum"; box.className = "cp-pos"; const h1 = wrap.querySelector("h1"); if (h1) h1.insertAdjacentElement("afterend", box); else wrap.prepend(box); }
    panel.classList.add("cp-pos-on");
    const pct = n.total > 0n && n.mine > 0n ? (Number((n.mine * 10000n) / n.total) / 100).toFixed(2) : "0";
    const isTop = n.rank === 1;
    const second = n.list[1];
    let race;
    if (!n.top) race = [`<b>${T("Open")}</b>`, T("The first contribution takes #1")];
    else if (isTop) race = [`<b>${T("You're #1")}</b>`, second ? `<span>${T("ahead by")}</span> <span data-no-i18n>${usdc(n.mine - BigInt(second.amount))} USDC</span>` : T("the only contributor so far")];
    else race = [`<b data-no-i18n>&gt; ${usdc(BigInt(n.top.amount) - n.mine)}</b> <span data-no-i18n>USDC</span>`, `<span>${T("more takes #1 from")}</span> <span data-no-i18n>${short(n.top.address)}</span>`];
    const eligible = n.mine > 0n;
    const tile = (k, v, sub, cls = "") => `<div class="cp-pos-t ${cls}"><small>${T(k)}</small><div class="cp-pos-v">${v}</div><span class="cp-pos-s">${sub}</span></div>`;
    const html = `<div class="cp-pos-head"><span class="cp-pos-k" data-no-i18n>${esc(window.cpRT ? window.cpRT("CirclePad Round #1") : tr("CirclePad Round #1"))}</span><span class="cp-pos-w" data-no-i18n>${short(n.w)}</span></div>
      <div class="cp-pos-grid">
        ${tile("My contribution", `<b data-no-i18n>${usdc(n.mine)}</b> <span data-no-i18n>USDC</span>${n.mine > 0n ? ALT(n.mine, "cp-alt-sm") : ""}`, n.mine > 0n ? `<span data-no-i18n>${pct}%</span> <span>${T("of the raise")}</span>` : T("Nothing in yet"), "mine")}
        ${tile("My rank", n.rank ? `<b data-no-i18n>#${n.rank}</b>` : "<b>—</b>", n.rank ? `<span>${T("of")}</span> <span data-no-i18n>${num(n.list.length)}</span> <span>${T("contributors")}</span>` : T("Contribute to get a rank"), isTop ? "top" : "")}
        ${tile("Race for #1 (the 15%)", race[0], race[1], isTop ? "top" : "")}
        ${tile("My votes", `<b data-no-i18n>${num(n.votes.toString())}</b>`, n.votes > 0n ? `<span>${T("in")}</span> <span data-no-i18n>${n.cats}/${window.cpCatCount ? window.cpCatCount() : 5}</span> <span>${T("categories")}</span>` : T(ph === "voting" ? "Voting is open" : "No votes yet"))}
        ${tile("Burned by me", `<b data-no-i18n>${num((n.votes * 1000n).toString())}</b> <span data-no-i18n>$ARCIRCLE</span>`, n.bal != null ? `<span>${T("Wallet:")}</span> <span data-no-i18n>${num((n.bal / 10n ** 18n).toString())} $ARCIRCLE</span>` : T("1 vote = 1,000 $ARCIRCLE"), "burn")}
        ${tile("Airdrop", `<b>${T(eligible ? "Eligible" : "Not yet")}</b>`, eligible ? T("Size not decided yet") : T("Contribute before the close"), eligible ? "ok" : "")}
      </div>
      <div class="cp-pos-acts">${n.r.isOpen ? `<button type="button" class="bp-btn-primary" data-cp-go="home">${T(n.mine > 0n ? "Add more" : "Contribute")}</button>` : ""}${ph === "voting" ? `<button type="button" class="bp-btn-ghost" data-cp-go="governance">${T("Burn & vote")}</button>` : ""}${n.r.isOpen && n.mine > 0n ? `<button type="button" class="bp-btn-ghost" data-cp-go="home">${T("Withdraw")}</button>` : ""}</div>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ================= Airdrop: am I in? =================
  function paintAirdrop() {
    const note = $("cp-airdrop-note");
    if (!note) return;
    let box = $("cp-airdrop-me");
    if (!box) { box = document.createElement("div"); box.id = "cp-airdrop-me"; box.className = "cp-ad-me"; note.insertAdjacentElement("beforebegin", box); box.addEventListener("click", async (e) => { if (e.target.closest("[data-cp-connect]") && typeof connectWallet === "function") { try { await connectWallet(); } catch { /* cancelled */ } } }); }
    const n = myNumbers(), r = n.r;
    let html;
    if (!n.w) html = `<div class="cp-ad-row"><span class="cp-ad-dot" aria-hidden="true"></span><div><b>${T("Check your wallet")}</b><p>${T("Connect to see whether this wallet is in the airdrop.")}</p></div><button type="button" class="bp-btn-primary" data-cp-connect>${T("Connect wallet")}</button></div>`;
    else if (n.mine > 0n) html = `<div class="cp-ad-row ok"><span class="cp-ad-dot" aria-hidden="true"></span><div><b><span>${T("Eligible")}</span> · <span>${T("contributed")}</span> <span data-no-i18n>${usdc(n.mine)} USDC</span></b><p>${T(r && r.isOpen ? "Keep a contribution in until the close — the list at the close is what counts." : "This wallet is on the contributor list at the close.")}</p></div></div>`;
    else html = `<div class="cp-ad-row"><span class="cp-ad-dot" aria-hidden="true"></span><div><b>${T("Not eligible yet")}</b><p>${T(r && r.isOpen ? "Contribute any amount before the close to be in the airdrop." : (window.cpRN && window.cpRN() > 1 ? "This wallet didn't contribute to this round." : "This wallet didn't contribute to Round #1."))}</p></div>${r && r.isOpen ? `<button type="button" class="bp-btn-primary" data-cp-go="home">${T("Contribute")}</button>` : ""}</div>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ================= the live screen =================
  const KIND = ["name", "ticker", "logo", "roadmap", "date"];
  function optFace(cat, text, k) {
    const t = String(text || "");
    if (cat === 2) return `<span class="cp-ls-logo"><em data-no-i18n>#${k + 1}</em>${typeof govLogoUrl === "function" && govLogoUrl(t) ? `<img src="${esc(govLogoUrl(t))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`;
    if (cat === 1) return esc("$" + t.replace(/^\$/, ""));
    if (cat === 4 && typeof govDate === "function" && govDate(t)) return esc(govFmtDate(govDate(t)));
    return esc(t.split("\n")[0]);
  }
  let ls = null, lsT = 0;
  function lsClock() {
    if (!ls) return;
    const ph = phase(), rd = RD();
    const ends = rd ? (ph === "voting" ? rd.votingEnds() : rd.deadline()) : 0;
    const sec = Math.max(0, ends - nowS());
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p2 = (x) => String(x).padStart(2, "0");
    const parts = [[d, "days"], [p2(h), "hours"], [p2(m), "min"], [p2(s), "sec"]];
    const el = ls.querySelector(".cp-ls-digits");
    if (el) el.innerHTML = parts.map(([v, k]) => `<span><b data-no-i18n>${v}</b><small>${T(k)}</small></span>`).join("<i>:</i>");
    ls.classList.toggle("hot", sec > 0 && sec <= 600);
    const lab = ls.querySelector(".cp-ls-clock > small");
    if (lab) lab.textContent = tr(!live() ? "The round has closed" : ph === "voting" && R() && R().isOpen ? "Raise & voting close in" : ph === "voting" ? "Voting closes in" : "Raise closes in");
  }
  function lsBody() {
    if (!ls) return;
    const r = R(), g = G(), rd = RD();
    const burned = rd ? rd.burnedTotal() : 0n;
    let votes = 0n;
    const board = g && Array.isArray(g.categories) ? g.categories.filter((c) => c.set).map((c) => {
      const sum = c.options.reduce((a, o) => a + BigInt(o.weight || 0), 0n);
      votes += sum;
      const top = c.options.map((o, i) => ({ ...o, i })).sort((a, b) => (BigInt(b.weight) > BigInt(a.weight) ? 1 : BigInt(b.weight) < BigInt(a.weight) ? -1 : a.i - b.i)).slice(0, 3);
      return `<div class="cp-ls-cat k-${KIND[c.id]}"><h4>${window.cpCatIcon ? window.cpCatIcon(c.id) : ""}${T(c.label)}</h4><ol>${top.map((o, k) => {
        const pct = sum > 0n ? Number((BigInt(o.weight) * 1000n) / sum) / 10 : 0;
        return `<li class="${k === 0 && sum > 0n ? "lead" : ""}"><span class="cp-ls-face">${optFace(c.id, o.text, o.i)}</span><span class="cp-ls-bar"><i style="width:${pct}%"></i></span><b data-no-i18n>${pct ? pct.toFixed(pct >= 10 ? 0 : 1) + "%" : "0%"}</b></li>`;
      }).join("")}</ol></div>`;
    }).join("") : "";
    const top = rows()[0];
    const html = `<div class="cp-ls-stats">
        <div><small>${T("Raised")}</small><b data-no-i18n>${r ? usdc(r.totalRaised || 0n, 0) : "0"}</b><span>USDC</span>${r ? ALT(r.totalRaised || 0n, "cp-alt-sm") : ""}</div>
        <div class="burn"><small>${T("Burned by votes")}</small><b data-no-i18n data-cp-burned>${num((burned / 10n ** 18n).toString())}</b><span>$ARCIRCLE</span></div>
        <div><small>${T("Votes")}</small><b data-no-i18n>${num(votes.toString())}</b><span>${T("1 vote = 1,000 $ARCIRCLE")}</span></div>
        <div><small>${T("Top contributor")}</small><b data-no-i18n>${top ? short(top.address) : "—"}</b><span data-no-i18n>${top ? usdc(top.amount) + " USDC" : ""}</span></div>
      </div>
      <div class="cp-ls-board">${board || `<p class="cp-ls-empty">${T("Candidates show up here once they're published.")}</p>`}</div>`;
    const body = ls.querySelector(".cp-ls-body");
    if (body.__html !== html) { body.innerHTML = html; body.__html = html; }
    lsT = Date.now();
  }
  function openLive(full) {
    if (ls) return;
    ls = document.createElement("div");
    ls.className = "cp-ls"; ls.setAttribute("role", "dialog"); ls.setAttribute("aria-label", tr("Live screen"));
    ls.innerHTML = `<div class="cp-ls-top"><span class="cp-ls-brand"><i aria-hidden="true"></i><b>CirclePad</b> <span data-no-i18n>${esc(window.cpRT ? window.cpRT("Round #1 · live") : tr("Round #1 · live"))}</span></span><div class="cp-ls-btns"><button type="button" class="cp-ls-fs" data-ls-fs>${T("Full screen")}</button><button type="button" class="cp-ls-x" data-ls-close aria-label="${T("Close")}">×</button></div></div>
      <div class="cp-ls-clock"><small></small><div class="cp-ls-digits"></div></div>
      <div class="cp-ls-body"></div>
      <div class="cp-ls-foot" data-no-i18n>arcircle.app/circle</div>`;
    document.body.appendChild(ls);
    document.body.classList.add("cp-ls-open");
    if (reduce()) ls.classList.add("still");
    lsClock(); lsBody();
    requestAnimationFrame(() => ls && ls.classList.add("in"));
    if (full && ls.requestFullscreen) ls.requestFullscreen().catch(() => { /* not allowed here */ });
    ls.addEventListener("click", (e) => {
      if (e.target.closest("[data-ls-close]")) closeLive();
      else if (e.target.closest("[data-ls-fs]")) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (ls.requestFullscreen) ls.requestFullscreen().catch(() => {}); }
    });
  }
  function closeLive() {
    if (!ls) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const el = ls; ls = null;
    document.body.classList.remove("cp-ls-open");
    el.classList.remove("in"); setTimeout(() => el.remove(), 250);
    try { const u = new URL(location.href); if (u.searchParams.has("live")) { u.searchParams.delete("live"); history.replaceState(null, "", u.pathname + u.search + u.hash); } } catch { /* fine */ }
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ls) closeLive(); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-cp-live]")) openLive(true); });

  // ================= candidate tiles: tilt, glow, a flame after my vote =================
  const TILE = '.bp-gov-cat[data-kind="logo"] .bp-gov-option:not(.gv-open)';
  document.addEventListener("pointermove", (e) => {
    if (reduce() || e.pointerType !== "mouse") return;
    const t = e.target.closest && e.target.closest(TILE);
    document.querySelectorAll(".bp-gov-option.cp-tilt").forEach((x) => { if (x !== t) { x.classList.remove("cp-tilt"); x.style.removeProperty("--rx"); x.style.removeProperty("--ry"); } });
    if (!t) return;
    const b = t.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    t.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg"); t.style.setProperty("--ry", (x * 12).toFixed(2) + "deg");
    t.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(0) + "%"); t.style.setProperty("--gy", ((y + 0.5) * 100).toFixed(0) + "%");
    t.classList.add("cp-tilt");
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (reduce() || e.pointerType === "mouse") return;
    const t = e.target.closest && e.target.closest(TILE);
    if (!t || e.target.closest("button, a, input")) return;
    t.classList.remove("cp-tap"); void t.offsetWidth; t.classList.add("cp-tap");
    setTimeout(() => t.classList.remove("cp-tap"), 650);
  }, { passive: true });
  let justVoted = null;
  function flameVoted() {
    if (!justVoted) return;
    if (Date.now() > justVoted.until) { justVoted = null; document.querySelectorAll(".cp-voted-flame").forEach((x) => x.classList.remove("cp-voted-flame")); return; }
    const el = document.querySelector(`.bp-gov-option[data-category="${justVoted.cat}"][data-option="${justVoted.opt}"]`);
    if (el && !el.classList.contains("cp-voted-flame")) el.classList.add("cp-voted-flame");
  }
  document.addEventListener("circlepad:burnvote", (e) => {
    const d = e.detail || {};
    if (d.category == null || d.option == null) return;
    justVoted = { cat: d.category, opt: d.option, until: Date.now() + 6000 };
    flameVoted();
    setTimeout(flameVoted, 6100);
  });

  // ================= wiring =================
  function paintAll() {
    try { orderHome(); paintPosition(); paintAirdrop(); if (ls && Date.now() - lsT > 1500) lsBody(); flameVoted(); } catch (err) { console.warn("circlepad-live", err); }
  }
  ["circlepad:state", "circlepad:lb", "circlepad:gov", "circlepad:govpaint", "circlepad:burns", "arc:lang"].forEach((ev) => document.addEventListener(ev, paintAll));
  document.addEventListener("arc:lang", () => { const m = $("cp-menu-lang"); if (m) m.querySelector("span").textContent = tr("Language"); });
  setInterval(() => { lsClock(); if (ls && Date.now() - lsT > 5000) lsBody(); }, 1000);
  const start = () => {
    mountLangMenu(); paintAll();
    try { if (new URLSearchParams(location.search).has("live")) openLive(false); } catch { /* fine */ }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
;
/* ---- circlepad-look.js ---- */
/* global CONFIG, cpTzMode, cpSetTz, state */
// circlepad-look.js — how Round #1 looks and feels:
//   · the page accent follows the phase (raise green → voting orange → result
//     gold) and fades between them; after the result it takes the winning
//     logo's colour
//   · the background glows a little brighter when the last 5 minutes were busy
//   · an icon per ballot category (titles, phone tabs, live screen)
//   · Governance as a ballot paper: a numbered slip per category, a box to
//     tick on every candidate, a "VOTED" stamp on the ones I voted for
//   · a big burn (10+ votes at once) sends ash across the screen; several of
//     my votes in a row count up a "×N" combo
//   · phones: Transparency and "What happens next" open to their first part,
//     the rest behind "Show more"
//   · times: Local / KST / UTC, countdowns on the chain's clock
//   · Docs: a reading-progress bar
// All motion is off under "reduce motion".
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RD = () => window.circlepadRound || null;
  const phase = () => (RD() ? RD().phase() : "pre");
  const body = document.body;

  // ================= category icons =================
  const ICON = [
    '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>', // name
    '<path d="M12 3.5v17M16.2 7.6c0-1.8-1.9-2.9-4.2-2.9S7.8 5.9 7.8 7.8c0 4.4 8.4 2.3 8.4 6.7 0 1.9-1.9 3.1-4.2 3.1s-4.2-1.1-4.2-2.9"/>', // ticker
    '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M4.5 17.5l4.8-4.3 3.7 3.2 2.8-2.4 3.7 3.5"/>', // logo
    '<path d="M5.5 20.5v-16M5.5 4.5h11l-2 4 2 4h-11"/>', // roadmap
    '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', // date
  ];
  const catIcon = (id) => (ICON[id] ? `<svg class="cp-cat-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg>` : "");
  window.cpCatIcon = catIcon;

  // ================= phase accent, winner colour, activity glow =================
  let winFor = null;
  function paintTheme() {
    const ph = phase();
    const theme = ph === "raise" ? "raise" : ph === "voting" ? "voting" : ph === "result" || ph === "closed" ? "result" : "";
    if (body.dataset.cpTheme !== theme) { if (theme) body.dataset.cpTheme = theme; else delete body.dataset.cpTheme; }
    if (ph === "result") winnerColour(); else body.classList.remove("cp-win-theme");
  }
  function winnerColour() {
    const w = RD() && RD().winner ? RD().winner() : null;
    const src = w && w.logo;
    if (!src || winFor === src) return;
    winFor = src;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 32;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data;
        const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
          if (a < 128) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
          if (sat < 0.3 || mx < 60) continue;
          let h = 0;
          if (mx === r) h = ((g - b) / (mx - mn)) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
          const bin = bins[Math.floor(((h * 60 + 360) % 360) / 30)], wt = sat * (mx / 255);
          bin.w += wt; bin.r += r * wt; bin.g += g * wt; bin.b += b * wt;
        }
        const top = bins.reduce((a, b) => (b.w > a.w ? b : a));
        if (top.w < 2) return; // grey or tiny: keep the gold
        let r = top.r / top.w, g = top.g / top.w, b = top.b / top.w;
        const mx = Math.max(r, g, b), k = mx < 200 ? 200 / mx : 1; // bright enough on the dark page
        r = Math.min(255, r * k); g = Math.min(255, g * k); b = Math.min(255, b * k);
        body.style.setProperty("--cp-win", `rgb(${r | 0}, ${g | 0}, ${b | 0})`);
        body.classList.add("cp-win-theme");
      } catch { /* a logo from another origin: keep the gold */ }
    };
    img.src = src;
  }
  function paintHeat() {
    const t = Date.now() / 1000;
    const acts = (window.circlepadActivity || []).filter((a) => t - Number(a.ts || 0) < 300).length;
    const f = window.circlepadBurns;
    const burns = f && f.anchor ? f.events.filter((e) => (Number(f.anchor.block) - Number(e.b)) * 0.5 + (t - Number(f.anchor.ts || t)) < 300).length : 0;
    const heat = Math.min(1, (acts + burns) / 6);
    body.style.setProperty("--cp-heat", reduce() ? "0" : heat.toFixed(2));
  }

  // ================= Governance as a ballot paper =================
  let stampNew = null;
  function paintBallot() {
    document.querySelectorAll("#bp-gov-categories .bp-gov-cat").forEach((cat) => {
      const id = Number(String(cat.id).replace("gv-cat-", ""));
      const title = cat.querySelector(".bp-gov-cat-title");
      if (title && !title.querySelector(".cp-cat-ic")) title.insertAdjacentHTML("afterbegin", catIcon(id));
      if (cat.classList.contains("gv-unset")) return;
      cat.classList.add("cp-ballot");
      const head = cat.querySelector(".bp-gov-cat-head");
      if (head && !head.querySelector(".cp-ballot-no")) head.insertAdjacentHTML("afterbegin", `<span class="cp-ballot-no" data-no-i18n>No. 0${id + 1}</span>`);
      cat.querySelectorAll(".bp-gov-option").forEach((opt) => {
        const row = opt.querySelector(".bp-gov-option-row");
        const mine = opt.classList.contains("bp-gov-option-mine");
        if (row && !row.querySelector(".cp-box")) {
          const box = `<span class="cp-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg></span>`;
          const rank = row.querySelector(".cp-gov-rank");
          if (rank) rank.insertAdjacentHTML("afterend", box); else row.insertAdjacentHTML("afterbegin", box);
        }
        let st = opt.querySelector(".cp-stamp");
        if (mine && !st) { opt.insertAdjacentHTML("beforeend", `<span class="cp-stamp" aria-hidden="true"><b>${T("VOTED")}</b></span>`); st = opt.querySelector(".cp-stamp"); }
        if (!mine && st) st.remove();
        if (st && stampNew && Date.now() < stampNew.until && String(opt.dataset.category) === String(stampNew.cat) && String(opt.dataset.option) === String(stampNew.opt) && !reduce()) st.classList.add("new");
      });
    });
    const tabs = $("gv-cat-tabs");
    if (tabs) tabs.querySelectorAll("[data-cp-cat]").forEach((b) => { if (!b.querySelector(".cp-cat-ic")) b.insertAdjacentHTML("afterbegin", catIcon(Number(b.dataset.cpCat))); });
  }

  // ================= ash on a big burn, a combo for votes in a row =================
  function ash(n) {
    if (reduce()) return;
    const layer = document.createElement("div");
    layer.className = "cp-ash"; layer.setAttribute("aria-hidden", "true");
    for (let k = 0; k < n; k++) {
      const i = document.createElement("i");
      const z = 2 + Math.random() * 5, ember = Math.random() < 0.3;
      i.style.cssText = `left:${Math.random() * 100}vw;width:${z}px;height:${z}px;--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720 - 360}deg;animation-duration:${2.6 + Math.random() * 2.2}s;animation-delay:${Math.random() * 0.9}s`;
      if (ember) i.className = "ember";
      layer.appendChild(i);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 6500);
  }
  let combo = 0, comboAt = 0;
  function showCombo(cat, opt) {
    if (reduce()) return;
    const el = document.querySelector(`.bp-gov-option[data-category="${cat}"][data-option="${opt}"]`) || document.querySelector(".gv-coin-hero");
    let b = el ? el.getBoundingClientRect() : null;
    if (!b || b.bottom < 120 || b.top > innerHeight - 80) b = { left: innerWidth / 2 - 40, top: innerHeight * 0.42, width: 80, height: 0 }; // off screen: the middle
    const c = document.createElement("div");
    c.className = "cp-combo"; c.setAttribute("aria-hidden", "true");
    c.innerHTML = `<b data-no-i18n>×${combo}</b><span>${T("combo")}</span>`;
    c.style.cssText = `left:${Math.max(40, Math.min(innerWidth - 40, b.left + b.width / 2))}px;top:${Math.max(70, b.top + b.height / 2)}px`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1600);
  }
  document.addEventListener("circlepad:burnvote", (e) => {
    const d = e.detail || {};
    stampNew = { cat: d.category, opt: d.option, until: Date.now() + 4000 };
    const now = Date.now();
    combo = now - comboAt < 45000 ? combo + 1 : 1; comboAt = now;
    setTimeout(() => { paintBallot(); if (combo >= 2) showCombo(d.category, d.option); }, 900);
    if (Number(d.votes) >= 10) setTimeout(() => ash(Math.min(90, 30 + Number(d.votes) * 2)), 500);
  });
  let seenBurns = null;
  document.addEventListener("circlepad:burns", (e) => {
    const j = e.detail;
    if (!j || !Array.isArray(j.events)) return;
    const keys = j.events.map((x) => x.tx + ":" + x.i);
    if (seenBurns) {
      const me = typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "";
      const big = j.events.filter((x) => !seenBurns.has(x.tx + ":" + x.i) && Number(x.votes) >= 10 && String(x.voter).toLowerCase() !== me);
      if (big.length) ash(Math.min(90, 30 + Math.max(...big.map((x) => Number(x.votes))) * 2));
    }
    seenBurns = new Set(keys);
    paintHeat();
  });

  // ================= phones: long Home sections open to their first part =================
  function fold(el, more) {
    if (!el || el.__fold) return;
    el.__fold = true;
    el.classList.add("cp-fold");
    const b = document.createElement("button");
    b.type = "button"; b.className = "cp-fold-btn"; b.setAttribute("aria-expanded", "false");
    b.innerHTML = `<span>${T(more)}</span><i aria-hidden="true"></i>`;
    b.addEventListener("click", () => {
      const open = el.classList.toggle("open");
      b.setAttribute("aria-expanded", open ? "true" : "false");
      b.querySelector("span").textContent = tr(open ? "Show less" : more);
      if (!open) el.scrollIntoView({ block: "start", behavior: reduce() ? "auto" : "smooth" });
    });
    el.insertAdjacentElement("afterend", b);
  }

  // ================= times: Local / KST / UTC =================
  function tzHtml() {
    const m = typeof cpTzMode === "function" ? cpTzMode() : "local";
    return `<span class="cp-tz" role="group" aria-label="${T("Time zone")}">${[["local", "Local"], ["kst", "KST"], ["utc", "UTC"]].map(([k, l]) => `<button type="button" data-cp-tz="${k}" class="${m === k ? "on" : ""}" aria-pressed="${m === k}">${k === "local" ? T(l) : l}</button>`).join("")}</span>`;
  }
  function paintTz() {
    const head = document.querySelector("#cp-next-home .cp-next-head");
    if (head && !head.querySelector(".cp-tz-row")) head.insertAdjacentHTML("beforeend", `<div class="cp-tz-row">${tzHtml()}<small>${T("Countdowns follow the chain's clock.")}</small></div>`);
    const date = document.querySelector("#gv-cat-4 .bp-gov-cat-head");
    if (date && !date.querySelector(".cp-tz")) date.insertAdjacentHTML("beforeend", tzHtml());
    const m = typeof cpTzMode === "function" ? cpTzMode() : "local";
    document.querySelectorAll("[data-cp-tz]").forEach((b) => { const on = b.dataset.cpTz === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cp-tz]");
    if (b && typeof cpSetTz === "function") cpSetTz(b.dataset.cpTz);
  });

  // ================= Docs tab: reading progress =================
  const bar = document.createElement("div");
  bar.className = "cp-readbar"; bar.setAttribute("aria-hidden", "true");
  body.appendChild(bar);
  let rafR = 0;
  function paintRead() {
    rafR = 0;
    const docs = $("bp-panel-docs"), on = !!(docs && docs.classList.contains("active"));
    bar.hidden = !on;
    if (!on) return;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${(h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0).toFixed(4)})`;
  }
  addEventListener("scroll", () => { if (!rafR) rafR = requestAnimationFrame(paintRead); }, { passive: true });
  document.addEventListener("click", (e) => { if (e.target.closest(".bp-nav-item, .bp-doc-tab, [data-tab-link]")) setTimeout(paintRead, 60); });

  // ================= wiring =================
  function paintAll() {
    try {
      paintTheme(); paintHeat(); paintBallot(); paintTz(); paintRead();
      fold($("cpx-trust"), "Show all transparency details");
      fold($("cp-next-home"), "Show every step");
    } catch (err) { console.warn("circlepad-look", err); }
  }
  ["circlepad:state", "circlepad:lb", "circlepad:gov", "circlepad:govpaint", "circlepad:tz", "circlepad:nextpaint", "arc:lang"].forEach((ev) => document.addEventListener(ev, paintAll));
  setInterval(() => { if (!document.hidden) { paintHeat(); paintTheme(); } }, 20000);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(paintAll, 0)); else setTimeout(paintAll, 0);
})();
;
/* ---- circlepad-v5.js ---- */
/* global CONFIG, state, ethers, connectWallet, cpToast, applyCirclepadState, renderCirclepadLeaderboard, _circlepadState */
// circlepad-v5.js — CirclePad v5, on top of the other CirclePad layers (it only adds; the escrow, the round and the
// leaderboard stay where they are):
//   · each round has its own accent (CONFIG.CIRCLEPAD_GOV[n].accent), and the round number flips when a new round
//     opens (once per browser)
//   · the round box: the top contributor and the latest contribution; on phones a compact strip instead of a square
//   · the sidebar status follows the whole round: live with the time left → closed → split → delivered
//   · "Source verified" asks the explorer about the running round's escrow (/api/social?circle=src)
//   · Bring USDC from another chain: Circle's CCTP from Ethereum, Base, Arbitrum, OP, Polygon or Avalanche to your own
//     address on Arc, minted there by Circle's Forwarding Service (no Arc gas needed), then contribute as usual
//   · Projects: a results strip for every closed round (raise, contributors, $ARCIRCLE burned, the coin today)
//   · motion: the USDC coin drops into the circle after a contribution, the raise's route (Arc → Robinhood Chain →
//     $ARCIA → you) flows on rounds that buy a coin, the last hour pulses the screen edge and the contribute button
//   · ARCIA's button tucks to the edge while it would cover the round's text and buttons
// Everything with motion stops under "reduce motion".
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  // whole sentences per language (fragments can't go through the dictionary): L(en, ko, zh), already escaped by the caller
  const lang = () => (window.arcI18n && window.arcI18n.get ? window.arcI18n.get() : "en");
  const L = (en, ko, zh) => { const g = lang(); return g === "ko" && ko ? ko : g === "zh" && zh ? zh : en; };
  const RN = (n) => L(`Round #${n}`, `라운드 #${n}`, `第 ${n} 轮`);
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const phone = () => window.innerWidth <= 760;
  const N = () => Number(CONFIG.CIRCLEPAD_ROUND || 1);
  const GOV = () => (CONFIG.CIRCLEPAD_GOV || {})[N()] || {};
  const PLAN = () => (GOV().plan && GOV().plan.buy) || null;
  const short = (a) => (a ? String(a).slice(0, 6) + "…" + String(a).slice(-4) : "");
  const num = (n, d = 2) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const usd2 = (v) => num(v, v < 1e4 ? 2 : 0); // cents below 10,000 (1,999.62, not 2,000)
  const usdOf = (wei) => { try { return Number(ethers.formatEther(BigInt(wei || 0))); } catch { return 0; } };
  // the chain's clock when circlepad-round.js knows it (countdowns run on it), else this device's
  const nowS = () => { try { const r = window.circlepadRound; const t = r && r.nowS ? Number(r.nowS()) : NaN; if (isFinite(t) && t > 0) return Math.floor(t); } catch { /* fall through */ } return Math.floor(Date.now() / 1000); };
  const body = document.body;
  const S = () => (typeof _circlepadState !== "undefined" ? _circlepadState : null);
  const rounds = () => window.cpRoundsData || null;
  const curRound = () => { const d = rounds(); return d && Array.isArray(d.rounds) ? d.rounds.find((r) => r.n === N()) || null : null; };
  const marks = () => (curRound() && curRound().marks) || {};
  const left = (s) => { const d = Math.max(0, s); const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`; };

  // ================= the round's own accent =================
  const acc = GOV().accent;
  if (acc && /^#[0-9a-fA-F]{6}$/.test(acc)) {
    body.style.setProperty("--cp-round-acc", acc);
    body.classList.add("cp5-acc");
  }
  body.dataset.cpRound = String(N());

  // ================= the round number flips when a new round opens (once per browser) =================
  (function flip() {
    let seen = 0;
    try { seen = Number(localStorage.getItem("cp5.seenRound") || 0); localStorage.setItem("cp5.seenRound", String(N())); } catch { return; }
    if (!seen || seen >= N() || reduce()) return;
    const o = document.createElement("div");
    o.className = "cp5-flip"; o.setAttribute("role", "status");
    o.innerHTML = `<div class="cp5-flip-card"><span data-no-i18n>CirclePad</span><div class="cp5-flip-n" data-no-i18n><b class="from">#${seen}</b><b class="to">#${N()}</b></div><em>${T("A new round is here")}</em></div>`;
    body.appendChild(o);
    requestAnimationFrame(() => o.classList.add("go"));
    if (typeof window.arcFeedback === "function") setTimeout(() => window.arcFeedback("milestone"), 700);
    const done = () => { o.classList.add("out"); setTimeout(() => o.remove(), 500); };
    o.addEventListener("click", done);
    setTimeout(done, 2600);
  })();

  // ================= "Source verified": the running round's escrow, asked of the explorer =================
  (async function verified() {
    const e = String(CONFIG.CIRCLEPAD_ESCROW_ADDRESS || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(e)) return;
    try {
      const r = await fetch(`/api/social?circle=src&escrow=${e}`);
      let j = r.ok ? await r.json() : null;
      // the explorer didn't answer: the escrows already checked on ArcScan (config-arc.js)
      if ((!j || j.verified == null) && (CONFIG.CIRCLEPAD_VERIFIED_ESCROWS || []).map((x) => String(x).toLowerCase()).includes(e)) j = { verified: true };
      if (!j || j.verified == null) return;
      window.cpEscrowVerified = !!j.verified;
      try { keys(); } catch { /* next paint */ }
      document.querySelectorAll(".cpx-badge").forEach((b) => {
        if (!/verified/i.test(b.textContent)) return;
        b.classList.toggle("ok", j.verified); b.classList.toggle("no", !j.verified);
        b.textContent = tr(j.verified ? "Source verified" : "Source not verified yet");
      });
    } catch { /* keep the page's answer */ }
  })();

  // ================= the round box: top contributor and the latest contribution =================
  let lbRows = [], lbAct = [];
  function paintBox() {
    const media = document.querySelector("#bp-featured .cp-media");
    if (!media) return;
    let box = media.querySelector(".cp5-lead");
    if (!lbRows.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("span"); box.className = "cp5-lead"; media.appendChild(box); }
    // the latest deposit still in: a deposit later taken back by the same wallet doesn't count
    const outs = new Set((lbAct || []).filter((a) => /^(out|refund|withdraw)$/.test(a.kind || "")).map((a) => String(a.contributor).toLowerCase()));
    const top = lbRows[0], last = (lbAct || []).find((a) => !/^(out|refund|withdraw)$/.test(a.kind || "") && !outs.has(String(a.contributor).toLowerCase()));
    const sh = (a) => (a ? String(a).slice(0, 5) + "…" + String(a).slice(-3) : "");
    box.innerHTML = `<span class="cp5-lead-r"><i data-no-i18n>${esc(L("Top", "1위", "第一"))}</i><em data-no-i18n>${usd2(usdOf(top.amount))}</em><b data-no-i18n>${esc(sh(top.address))}</b></span>` +
      (last ? `<span class="cp5-lead-r"><i data-no-i18n>${esc(L("Latest", "최근", "最新"))}</i><em data-no-i18n>+${usd2(usdOf(last.amount))}</em><b data-no-i18n>${esc(sh(last.contributor))}</b></span>` : "");
  }
  if (typeof renderCirclepadLeaderboard === "function") {
    const origLb = renderCirclepadLeaderboard;
    // eslint-disable-next-line no-global-assign
    renderCirclepadLeaderboard = function (rows, activity, flow) {
      origLb(rows, activity, flow);
      try { lbRows = rows || []; lbAct = activity || []; paintBox(); keys(); } catch (e) { console.warn("circlepad-v5", e); }
    };
  }

  // ================= phones: Transparency folded to four numbers =================
  function keys() {
    const card = $("cpx-trust"), s = S();
    if (!card || !s) return;
    let k = card.querySelector(".cp5-keys");
    if (!k) { k = document.createElement("div"); k.className = "cp5-keys"; const h = card.querySelector(".cpx-trust-head"); if (h) h.insertAdjacentElement("afterend", k); else card.prepend(k); }
    const amts = lbRows.map((r) => usdOf(r.amount)).filter((x) => x > 0).sort((a, b) => a - b);
    const total = amts.reduce((t, x) => t + x, 0);
    const median = amts.length ? (amts.length % 2 ? amts[(amts.length - 1) / 2] : (amts[amts.length / 2 - 1] + amts[amts.length / 2]) / 2) : 0;
    const largest = total > 0 ? (amts[amts.length - 1] / total) * 100 : 0;
    const ver = window.cpEscrowVerified;
    k.setAttribute("data-no-i18n", "");
    k.innerHTML = [[L("In the escrow", "에스크로 잔액", "托管余额"), `${usd2(usdOf(s.balance))} USDC`], [L("Wallets in", "참여 지갑", "参与钱包"), String(amts.length)], [L("Median", "중간값", "中位数"), `${usd2(median)} USDC`], [L("Largest wallet", "최대 지갑 비중", "最大钱包占比"), `${num(largest, 1)}%`]]
      .map(([t, v]) => `<div><span>${esc(t)}</span><b>${esc(v)}</b></div>`).join("") + (ver != null ? `<p class="cp5-keys-v ${ver ? "ok" : ""}">${esc(ver ? L("Source verified on the explorer", "익스플로러에서 소스 검증됨", "源码已在浏览器验证") : L("Source not verified yet", "소스 미검증", "源码尚未验证"))}</p>` : "");
  }

  // ================= the sidebar status: the whole round =================
  function sideStatus() {
    const s = S(), txt = $("bp-side-foot-text"), dot = $("bp-side-status-dot");
    if (!s || !txt || !s.started) return;
    const m = marks(), deadline = Number(s.deadline), rv = usdOf(s.totalRaised), raised = num(rv, rv < 1e4 ? 2 : 0), plan = PLAN();
    let t = "", k = "";
    const n = N(), lf = left(deadline - nowS());
    if (s.isOpen && nowS() < deadline) { t = L(`Round #${n} is live · ${lf} left · ${raised} USDC`, `라운드 #${n} 진행 중 · ${lf} 남음 · ${raised} USDC`, `第 ${n} 轮进行中 · 剩余 ${lf} · ${raised} USDC`); k = "live"; }
    else if (m.launch) { t = L(`Round #${n} is delivered — thank you 💚`, `라운드 #${n} 배분 완료 — 감사해요 💚`, `第 ${n} 轮已完成发放 — 谢谢 💚`); k = "done"; }
    else if (s.distributed) { t = plan ? L(`Split done — buying $${plan.sym} and sending it to contributors`, `분배 완료 — $${plan.sym}를 사서 참여자에게 보내는 중`, `已分配 — 正在买入 $${plan.sym} 并发给参与者`) : L("Split done — the launch and the airdrop are next", "분배 완료 — 다음은 런칭과 에어드랍", "已分配 — 接下来是上线和空投"); k = "split"; }
    else { t = L(`Round #${n} has closed · ${raised} USDC · the split is next`, `라운드 #${n} 마감 · ${raised} USDC · 다음은 분배`, `第 ${n} 轮已结束 · ${raised} USDC · 接下来分配`); k = "closed"; }
    txt.textContent = t;
    txt.setAttribute("data-no-i18n", "");
    if (dot) dot.className = "bp-side-status-dot cp5-st-" + k + (k === "live" ? " bp-live" : "");
  }
  if (typeof applyCirclepadState === "function") {
    const origApply = applyCirclepadState;
    // eslint-disable-next-line no-global-assign
    applyCirclepadState = function (s, opts) {
      origApply(s, opts);
      try { sideStatus(); lastHour(); route(); keys(); } catch (e) { console.warn("circlepad-v5", e); }
    };
  }
  document.addEventListener("circlepad:rounds", () => { try { sideStatus(); route(); results(); } catch (e) { console.warn("circlepad-v5", e); } });
  setInterval(() => { if (!document.hidden) { try { sideStatus(); lastHour(); } catch { /* next time */ } } }, 30000);

  // ================= the last hour: the screen edge and the contribute button =================
  function lastHour() {
    const s = S();
    const on = !!(s && s.started && s.isOpen && Number(s.deadline) - nowS() > 0 && Number(s.deadline) - nowS() < 3600);
    body.classList.toggle("cp5-final", on && !reduce());
    const btn = $("bp-contribute-btn");
    if (btn) btn.classList.toggle("cp5-final-btn", on);
    if (on && !document.querySelector(".cp5-edge")) { const e = document.createElement("div"); e.className = "cp5-edge"; e.setAttribute("aria-hidden", "true"); body.appendChild(e); }
  }

  // ================= the coin drops into the circle =================
  document.addEventListener("circlepad:contributed", (e) => {
    const amt = Number(e.detail && e.detail.amount) || 0;
    const ring = document.querySelector("#bp-round-panel .cp-ring") || $("bp-round-panel");
    const from = $("bp-contribute-btn") || ring;
    if (!ring || !from) return;
    if (typeof window.arcFeedback === "function") window.arcFeedback("buy");
    const a = from.getBoundingClientRect(), b = ring.getBoundingClientRect();
    const plus = document.createElement("div");
    plus.className = "cp5-plus"; plus.textContent = `+${num(amt)} USDC`;
    plus.style.left = b.left + b.width / 2 + "px"; plus.style.top = b.top + b.height / 2 + "px";
    if (reduce()) { body.appendChild(plus); setTimeout(() => plus.remove(), 1600); return; }
    const coin = document.createElement("div");
    coin.className = "cp5-coin"; coin.setAttribute("aria-hidden", "true");
    coin.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><text x="20" y="26" text-anchor="middle">$</text></svg>';
    body.appendChild(coin);
    const x0 = a.left + a.width / 2 - 20, y0 = a.top - 10, x1 = b.left + b.width / 2 - 20, y1 = b.top + b.height / 2 - 20;
    const anim = coin.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6) rotateY(0deg)`, opacity: 0 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 120}px) scale(1.15) rotateY(540deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(.35) rotateY(900deg)`, opacity: 0.2 },
    ], { duration: 1100, easing: "cubic-bezier(.3,.7,.4,1)" });
    anim.onfinish = () => {
      coin.remove();
      ring.classList.remove("cp5-gulp"); void ring.offsetWidth; ring.classList.add("cp5-gulp");
      body.appendChild(plus); setTimeout(() => plus.remove(), 1700);
      if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 40 });
    };
  });

  // ================= the raise's route, on rounds that buy a coin (Round #3: Arc → Robinhood Chain → $ARCIA → you) ====
  function route() {
    const plan = PLAN();
    if (!plan) return;
    let el = $("cp5-route");
    if (!el) {
      const after = $("bp-featured");
      if (!after) return;
      el = document.createElement("section");
      el.id = "cp5-route"; el.className = "cp5-route";
      after.insertAdjacentElement("afterend", el);
    }
    const s = S() || {}, m = marks();
    // a snapshot round: the delivery board's airdrop step lights the last node (CONFIG.CIRCLEPAD_DELIVERY)
    const D = (CONFIG.CIRCLEPAD_DELIVERY || {})[N()] || {}, dropped = D.drop && D.drop.status === "done";
    const at = !s.started ? -1 : s.isOpen && nowS() < Number(s.deadline) ? 0 : !s.distributed ? 1 : dropped ? 5 : !m.launch ? 2 : 4;
    const st = (i) => (at > i ? "done" : at === i ? "now" : "");
    const also = GOV().plan && GOV().plan.also;
    const nodes = [
      ["USDC", L("Your USDC", "내 USDC", "你的 USDC"), L("Arc · the escrow", "Arc · 에스크로", "Arc · 托管合约")],
      ["80%", L("The split", "분배", "分配"), L("80% buys the coin", "80%로 코인 매수", "80% 用于买币")],
      ["ETH", L("To Robinhood Chain", "Robinhood Chain으로", "转到 Robinhood Chain"), L("bridged by the team", "팀이 브릿지", "由团队跨链")],
      [`$${plan.sym}`, L(`Buys $${plan.sym}`, `$${plan.sym} 매수`, `买入 $${plan.sym}`), plan.chain || "Robinhood Chain"],
      ["YOU", L("To you", "나에게", "发给你"), PLAN() && GOV().plan && GOV().plan.also && GOV().plan.also.snapshot ? L("snapshot airdrop, by your share", "스냅샷 에어드랍, 내 참여 비율대로", "快照空投，按你的出资比例") : L("by your share of the raise", "내 참여 비율대로", "按你的出资比例")],
    ];
    el.innerHTML = `<div class="cp5-route-h"><h3>${T("Where your USDC goes")}</h3><span data-no-i18n>${esc(RN(N()))}${also ? ` · ${esc(L(`plus Round #${also.round} on ${also.chain}`, `+ ${also.chain}의 라운드 #${also.round}`, `另有 ${also.chain} 上的第 ${also.round} 轮`))}` : ""}</span></div>
      <ol class="cp5-route-l">${nodes.map(([ic, t1, t2], i) => `<li class="${st(i)}"><span class="cp5-route-ic${ic.length > 4 ? " long" : ""}" data-no-i18n>${esc(ic)}</span><b data-no-i18n>${esc(t1)}</b><small data-no-i18n>${esc(t2)}</small></li>`).join("")}</ol>
      <div class="cp5-route-flow" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i style="--d:${i}"></i>`).join("")}</div>`;
    el.dataset.at = String(at);
  }

  // ================= Projects: every closed round's result =================
  const COINS = CONFIG.CIRCLEPAD_RESULTS || {};
  const mk = new Map();
  async function market(c) {
    const k = c.chain + ":" + c.token.toLowerCase();
    const hit = mk.get(k);
    if (hit && Date.now() - hit.at < 120e3) return hit.v;
    let v = null;
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${c.token}`);
      const j = r.ok ? await r.json() : null;
      const want = c.chain === "rh" ? "robinhood" : "arc";
      const ps = (j && j.pairs || []).filter((p) => p && p.chainId === want).sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      const p = ps[0];
      if (p) v = { mcap: Number(p.marketCap || p.fdv || 0) || null, liq: ps.reduce((t, x) => t + ((x.liquidity && x.liquidity.usd) || 0), 0), ch: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null, url: p.url || null };
    } catch { v = null; }
    mk.set(k, { at: Date.now(), v });
    return v;
  }
  const big$ = (n) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
  async function results() {
    const d = rounds(), panel = $("bp-panel-projects");
    if (!d || !panel) return;
    const closed = d.rounds.filter((r) => r.state && r.state.started && nowS() >= Number(r.state.deadline));
    if (!closed.length) return;
    let el = $("cp5-results");
    if (!el) {
      el = document.createElement("section");
      el.id = "cp5-results"; el.className = "cp5-results";
      // under the page's title and its one-line intro, above the round cards
      const host = panel.querySelector(".bp-simple") || panel;
      const intro = host.querySelector("h1 + p") || host.querySelector("h1");
      if (intro) intro.insertAdjacentElement("afterend", el); else host.insertBefore(el, host.firstChild);
    }
    const cards = closed.slice().reverse().map((r) => {
      const sm = (d.sums || {})[r.n] || null, c = COINS[r.n] || null;
      const raised = usdOf(r.state.totalRaised), people = sm && sm.board ? sm.board.contributors : null;
      // the ballot's burned $ARCIRCLE comes in 18-decimal units (api/_rounds.mjs summary)
      const burned = sm && sm.ballot && sm.ballot.burned != null ? (/^\d{16,}$/.test(String(sm.ballot.burned)) ? usdOf(sm.ballot.burned) : Number(sm.ballot.burned)) : null;
      const coin = c && c.merged ? `<span class="cp5-rs-coin merged" data-no-i18n>${esc(L(`Merged into Round #${c.merged}`, `라운드 #${c.merged}에 합쳐짐`, `并入第 ${c.merged} 轮`))}</span>` : c && c.retired ? `<span class="cp5-rs-coin retired" data-no-i18n title="${esc(L("Retired on 5 Oct 2026 — not an official coin any more", "2026년 10월 5일 종료 — 더 이상 공식 코인이 아니에요", "已于 2026 年 10 月 5 日停用，不再是官方币"))}">$${esc(c.sym)} <i>${esc(c.chain === "rh" ? "Robinhood Chain" : "Arc")} · ${esc(L("retired", "종료", "已停用"))}</i></span>` : c ? `<span class="cp5-rs-coin" data-no-i18n>$${esc(c.sym)} <i>${esc(c.chain === "rh" ? "Robinhood Chain" : "Arc")}</i></span>` : "";
      return `<article class="cp5-rs" data-n="${r.n}" data-no-i18n><div class="cp5-rs-top"><b>${esc(RN(r.n))}</b>${coin}</div>
        <dl><div><dt>${esc(L("Raised", "모금액", "募集"))}</dt><dd>${usd2(raised)} USDC</dd></div><div><dt>${esc(L("Contributors", "참여자", "参与者"))}</dt><dd>${people != null ? people : "—"}</dd></div>${burned ? `<div><dt>${esc(L("$ARCIRCLE burned", "$ARCIRCLE 소각", "$ARCIRCLE 销毁"))}</dt><dd>${num(burned, 0)}</dd></div>` : ""}
        ${c && c.token && !c.merged ? `<div class="cp5-rs-m" data-mk="${esc(c.chain)}:${esc(c.token)}"><dt>${esc(L("Market cap today", "현재 시가총액", "当前市值"))}</dt><dd>…</dd></div>` : ""}</dl>
        <div class="cp5-rs-foot">${r.n === 1 ? `<a href="/circle/round/1">${esc(L("Round report", "라운드 리포트", "轮次报告"))} →</a>` : ""}${c && c.token && !c.merged ? `<a href="${c.chain === "rh" ? "/arc#orders?c=rh&t=" + esc(c.token) : "/arc#coin/" + esc(c.token)}">${esc(L(`Trade $${c.sym}`, `$${c.sym} 거래`, `交易 $${c.sym}`))} →</a>` : ""}</div></article>`;
    });
    el.innerHTML = `<div class="cp5-rs-h"><h3>${T("Round results")}</h3><span>${T("Every closed round, read from the chain")}</span></div><div class="cp5-rs-grid">${cards.join("")}</div>`;
    for (const box of el.querySelectorAll("[data-mk]")) {
      const [chain, token] = box.dataset.mk.split(":");
      market({ chain, token }).then((v) => {
        const dd = box.querySelector("dd");
        if (!dd) return;
        dd.innerHTML = v ? `${esc(big$(v.mcap))}${v.ch != null ? ` <small class="${v.ch >= 0 ? "up" : "dn"}">${v.ch >= 0 ? "+" : ""}${v.ch.toFixed(1)}% 24h</small>` : ""}` : "—";
      });
    }
  }

  // ================= ARCIA's button tucks to the edge while it sits over the round (it covered text and buttons) =================
  let fabRaf = 0;
  function fabCheck() {
    fabRaf = 0;
    const fab = document.querySelector(".aa-fab");
    if (!fab) return;
    if (!$("bp-panel-home") || !$("bp-panel-home").classList.contains("active")) { body.classList.remove("cp5-fab-tuck"); return; }
    const f = fab.getBoundingClientRect();
    const hit = [...document.querySelectorAll("#bp-featured, #cp5-route, .cp-timeline, #cpx-trust")].some((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && f.top < r.bottom - 8 && f.bottom > r.top + 8 && f.left < r.right && f.right > r.left;
    });
    body.classList.toggle("cp5-fab-tuck", hit);
  }
  const fabSoon = () => { if (!fabRaf) fabRaf = requestAnimationFrame(fabCheck); };
  addEventListener("scroll", fabSoon, { passive: true });
  addEventListener("resize", fabSoon);
  setTimeout(fabCheck, 1500);
  window.cp5FabCheck = fabCheck;

  // ================= Bring USDC from another chain (Circle CCTP → your address on Arc) =================
  // TokenMessengerV2 / USDC addresses: developers.circle.com (CCTP EVM contracts; USDC contract addresses).
  // Arc is CCTP domain 26; the Forwarding Service mints on Arc for the sender, so no Arc gas is needed.
  const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
  const HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000"; // "cctp-forward", version 0
  const CH = [
    { id: 8453, d: 6, name: "Base", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", rpc: "https://mainnet.base.org", ex: "https://basescan.org", gas: "ETH" },
    { id: 42161, d: 3, name: "Arbitrum", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", rpc: "https://arb1.arbitrum.io/rpc", ex: "https://arbiscan.io", gas: "ETH" },
    { id: 10, d: 2, name: "OP Mainnet", usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", rpc: "https://mainnet.optimism.io", ex: "https://optimistic.etherscan.io", gas: "ETH" },
    { id: 1, d: 0, name: "Ethereum", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", rpc: "https://ethereum-rpc.publicnode.com", ex: "https://etherscan.io", gas: "ETH" },
    { id: 137, d: 7, name: "Polygon", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", rpc: "https://polygon-rpc.com", ex: "https://polygonscan.com", gas: "POL" },
    { id: 43114, d: 1, name: "Avalanche", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", rpc: "https://api.avax.network/ext/bc/C/rpc", ex: "https://snowtrace.io", gas: "AVAX" },
  ];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const TMABI = ["function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)"];
  const PKEY = "cp5.bridge.pending";
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const B = { ch: CH[0], fees: null, bal: null, busy: false, msg: "", step: 0, pending: null, poll: null };
  try { B.pending = JSON.parse(localStorage.getItem(PKEY) || "null"); } catch { B.pending = null; }

  async function toChain(c) {
    const hex = "0x" + c.id.toString(16);
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try {
        const acc = WagmiCoreRef.getAccount(wagmiConfigRef);
        if (acc && acc.isConnected) { if (Number(acc.chainId) !== c.id) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: c.id }); return; }
      } catch (e) { if (rejected(e)) throw e; }
    }
    const p = walletProv();
    if (!p) throw new Error(tr("No wallet found."));
    if (Number.parseInt(await p.request({ method: "eth_chainId" }), 16) === c.id) return;
    try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch (e) {
      if (rejected(e)) throw e;
      await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: c.name, rpcUrls: [c.rpc], blockExplorerUrls: [c.ex], nativeCurrency: { name: c.gas, symbol: c.gas, decimals: 18 } }] });
    }
  }
  async function signerOn(c) {
    window.arcChainSwitching = true; // the wallet layer must not pull the wallet back to Arc mid-transfer
    await toChain(c);
    const bp = new ethers.BrowserProvider(walletProv(), "any");
    for (let i = 0; i < 8; i++) { if (Number((await bp.getNetwork()).chainId) === c.id) return bp.getSigner(me()); await new Promise((r) => setTimeout(r, 500)); }
    throw new Error(L(`Your wallet is still on another network — switch it to ${c.name} and try again.`, `지갑이 아직 다른 네트워크에 있어요 — ${c.name}(으)로 바꾸고 다시 시도해 주세요.`, `钱包仍在其他网络——请切换到 ${c.name} 后重试。`));
  }
  async function fees(c) {
    try {
      const r = await fetch(`/api/social?cctp=fees&src=${c.d}`);
      const j = r.ok ? await r.json() : null;
      const raw = j && j.fees;
      const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.data) ? raw.data : [];
      const tiers = list.map((x) => ({ fin: Number(x.finalityThreshold), bps: Number(x.minimumFee || 0), fwd: x.forwardFee ? BigInt(Math.ceil(Number(x.forwardFee.med != null ? x.forwardFee.med : x.forwardFee.high || 0))) : 0n })).filter((x) => x.fin);
      return tiers.length ? tiers : null;
    } catch { return null; }
  }
  // protocol fee (bps of the amount, rounded up) + the forwarding fee; fast when the source offers it
  function plan(amount6) {
    if (!B.fees) return null;
    const fast = B.fees.find((x) => x.fin <= 1000), std = B.fees.find((x) => x.fin >= 2000);
    const t = fast || std;
    if (!t) return null;
    const proto = (amount6 * BigInt(Math.round(t.bps * 100)) + 999999n) / 1000000n;
    const maxFee = proto + t.fwd + (t.fwd / 10n); // 10% headroom on the forwarding fee
    return { fin: t.fin <= 1000 ? 1000 : 2000, fast: t.fin <= 1000, maxFee, get: amount6 > maxFee ? amount6 - maxFee : 0n };
  }
  const six = (s) => { try { return ethers.parseUnits(String(s || "0").trim() || "0", 6); } catch { return 0n; } };
  const fmt6 = (v) => num(Number(ethers.formatUnits(v || 0n, 6)), 2);

  function modal() {
    let m = $("cp5-bridge");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cp5-bridge"; m.className = "cp5-modal"; m.hidden = true;
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Bring USDC to Arc");
    body.appendChild(m);
    m.addEventListener("click", onClick);
    m.addEventListener("input", (e) => { if (e.target.id === "cp5-br-amt") { B.amt = e.target.value; paintQuote(); } });
    return m;
  }
  function open() {
    const m = modal();
    m.hidden = false; body.classList.add("cp5-modal-open");
    paint();
    if (!B.pending && !B.fees) fees(B.ch).then((f) => { B.fees = f; paint(); });
    if (B.pending) watch();
  }
  function close() { const m = $("cp5-bridge"); if (m) m.hidden = true; body.classList.remove("cp5-modal-open"); if (!B.busy) window.arcChainSwitching = false; }
  function paintQuote() {
    const q = $("cp5-br-q");
    if (!q) return;
    const a6 = six(B.amt), p = plan(a6);
    q.innerHTML = !B.fees ? `<span>${T("Reading Circle's fees…")}</span>` : !p ? `<span>${T("Circle isn't quoting this route right now.")}</span>`
      : a6 === 0n ? `<span>${esc(L("Fee", "수수료", "手续费"))} ≈ <b data-no-i18n>${fmt6(plan(1000000n).maxFee)} USDC</b> · ${T(p.fast ? "fast: usually a few minutes" : "standard: up to about 20 minutes")}</span>`
      : p.get === 0n ? `<span class="bad">${T("That's less than the fee.")}</span>`
      : `<span>${esc(L("Arrives on Arc", "Arc 도착", "到账 Arc"))} ≥ <b data-no-i18n>${fmt6(p.get)} USDC</b></span><span>${esc(L("Fee at most", "수수료 최대", "手续费最多"))} <b data-no-i18n>${fmt6(p.maxFee)} USDC</b> · ${T(p.fast ? "fast: usually a few minutes" : "standard: up to about 20 minutes")}</span>`;
    const go = $("cp5-br-go");
    if (go) go.disabled = B.busy || !p || a6 === 0n || p.get === 0n || (B.bal != null && a6 > B.bal);
  }
  function paint() {
    const m = modal(), u = me();
    const P = B.pending;
    let inner;
    if (P) {
      const c = CH.find((x) => x.d === P.d) || CH[0];
      const steps = [[L(`Sent from ${c.name}`, `${c.name}에서 보냄`, `已从 ${c.name} 发出`), true], [tr("Circle confirms the burn"), P.status === "complete" || !!P.fwd], [tr("Minted on Arc"), !!P.fwd]];
      inner = `<h3>${T("Bringing USDC to Arc")}</h3><p class="cp5-br-sub" data-no-i18n>${fmt6(BigInt(P.amount || 0))} USDC · ${esc(c.name)} → Arc · ${esc(short(P.to))}</p>
        <ol class="cp5-br-steps">${steps.map(([t, ok], i) => `<li class="${ok ? "ok" : steps.slice(0, i).every((x) => x[1]) ? "now" : ""}"><i></i>${esc(t)}</li>`).join("")}</ol>
        <p class="cp5-br-links"><a href="${c.ex}/tx/${esc(P.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(L(`Burn on ${c.name}`, `${c.name} 소각 내역`, `${c.name} 上的销毁`))} ↗</a>${P.fwd ? ` · <a href="${esc((CONFIG.BLOCK_EXPLORER || "https://arc.etherscan.io") + "/tx/" + P.fwd)}" target="_blank" rel="noopener">${T("Mint on Arc")} ↗</a>` : ""}</p>
        ${P.fwd ? `<button type="button" class="bp-btn-primary bp-btn-block" data-br="use">${T("Contribute it now")}</button><button type="button" class="cp5-br-link" data-br="clear">${T("Done — close")}</button>`
          : `<p class="cp5-br-wait">${T("This page checks every few seconds. You can close it — the transfer finishes on its own and shows here when you come back.")}</p><button type="button" class="cp5-br-link" data-br="clear">${T("Stop watching (the transfer still completes)")}</button>`}`;
    } else {
      inner = `<h3>${T("Bring USDC from another chain")}</h3>
        <p class="cp5-br-sub">${T("Circle's own bridge (CCTP) burns your USDC there and mints the same USDC to your address on Arc. Circle's Forwarding Service does the Arc side, so you don't need Arc gas.")}</p>
        <div class="cp5-br-ch" role="radiogroup" aria-label="From">${CH.map((c) => `<button type="button" role="radio" aria-checked="${c === B.ch}" data-br-ch="${c.id}">${esc(c.name)}</button>`).join("")}</div>
        ${u ? `<label class="cp5-br-in"><span data-no-i18n>${esc(L("Amount", "수량", "数量"))}</span><input id="cp5-br-amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(B.amt || "")}"><em>USDC</em></label>
          <p class="cp5-br-bal" data-no-i18n>${B.bal != null ? `${esc(L(`On ${B.ch.name}:`, `${B.ch.name} 잔액:`, `${B.ch.name} 余额:`))} <b>${fmt6(B.bal)} USDC</b> <button type="button" class="cp5-br-max" data-br="max">${esc(L("Max", "최대", "最大"))}</button>` : `<button type="button" class="cp5-br-link" data-br="bal">${esc(L(`Check my USDC on ${B.ch.name}`, `${B.ch.name}의 내 USDC 확인`, `查看我在 ${B.ch.name} 的 USDC`))}</button>`}</p>
          <div class="cp5-br-q" id="cp5-br-q"></div>
          <p class="cp5-br-to" data-no-i18n>${esc(L(`Arrives at ${short(u)} on Arc — the same address you use here. You pay a little ${B.ch.gas} for gas on ${B.ch.name}.`, `Arc의 ${short(u)}(지금 쓰는 주소)로 들어와요. ${B.ch.name} 가스비로 ${B.ch.gas}가 조금 필요해요.`, `到账 Arc 上的 ${short(u)}(就是你现在用的地址)。需要少量 ${B.ch.gas} 支付 ${B.ch.name} 的 gas。`))}</p>
          <button type="button" class="bp-btn-primary bp-btn-block" id="cp5-br-go" data-br="go"${B.busy ? " disabled" : ""}>${B.busy ? T(B.msg || "Confirm in wallet…") : T("Bring it to Arc")}</button>`
        : `<button type="button" class="bp-btn-primary bp-btn-block" data-br="connect">${T("Connect wallet")}</button>`}
        ${B.err ? `<p class="cp5-br-err">${esc(B.err)}</p>` : ""}`;
    }
    m.innerHTML = `<div class="cp5-modal-card"><button type="button" class="cp5-modal-x" data-br="close" aria-label="Close">×</button>${inner}</div>`;
    paintQuote();
  }
  async function onClick(e) {
    if (e.target === e.currentTarget) { close(); return; }
    const chb = e.target.closest("[data-br-ch]");
    if (chb && !B.busy) { B.ch = CH.find((c) => String(c.id) === chb.dataset.brCh) || B.ch; B.bal = null; B.fees = null; B.err = ""; paint(); fees(B.ch).then((f) => { B.fees = f; paintQuote(); }); return; }
    const b = e.target.closest("[data-br]");
    if (!b) return;
    const k = b.dataset.br;
    if (k === "close") return close();
    if (k === "connect") { try { await connectWallet(); } catch { /* the wallet said no */ } paint(); return; }
    if (k === "max" && B.bal != null) { B.amt = ethers.formatUnits(B.bal, 6); paint(); return; }
    if (k === "clear") { B.pending = null; try { localStorage.removeItem(PKEY); } catch { /* fine */ } clearInterval(B.poll); B.poll = null; paint(); return; }
    if (k === "use") {
      const P = B.pending;
      const got = P && P.got ? Number(ethers.formatUnits(BigInt(P.got), 6)) : 0;
      B.pending = null; try { localStorage.removeItem(PKEY); } catch { /* fine */ }
      close();
      const inp = $("bp-contribute-amount");
      if (inp && got > 0) { inp.value = String(Math.floor(got * 100) / 100); inp.dispatchEvent(new Event("input", { bubbles: true })); }
      const btn = $("bp-contribute-btn");
      if (btn) btn.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" });
      return;
    }
    if (k === "bal") {
      B.err = "";
      try { const sg = await signerOn(B.ch); B.bal = await new ethers.Contract(B.ch.usdc, ERC20, sg).balanceOf(me()); } catch (err) { B.err = rejected(err) ? tr("You rejected the request in your wallet.") : String(err.shortMessage || err.message || err).slice(0, 160); }
      paint(); return;
    }
    if (k === "go") return send();
  }
  async function send() {
    const c = B.ch, a6 = six(B.amt), p = plan(a6), u = me();
    if (!u || !p || a6 === 0n || p.get === 0n) return;
    B.busy = true; B.err = ""; B.msg = "Switching network…"; paint();
    try {
      const sg = await signerOn(c);
      const usdc = new ethers.Contract(c.usdc, ERC20, sg), tm = new ethers.Contract(TM, TMABI, sg);
      const bal = await usdc.balanceOf(u);
      B.bal = bal;
      if (bal < a6) throw new Error(L(`Not enough USDC on ${c.name}.`, `${c.name}에 USDC가 부족해요.`, `${c.name} 上的 USDC 不足。`));
      if ((await usdc.allowance(u, TM)) < a6) {
        B.msg = "Approve USDC in your wallet…"; paint();
        const ap = await usdc.approve(TM, a6);
        B.msg = "Approving…"; paint();
        await ap.wait();
      }
      B.msg = "Confirm the transfer in your wallet…"; paint();
      const tx = await tm.depositForBurnWithHook(a6, 26, ethers.zeroPadValue(u, 32), c.usdc, ethers.ZeroHash, p.maxFee, p.fin, HOOK);
      B.pending = { d: c.d, tx: tx.hash, amount: a6.toString(), got: p.get.toString(), to: u, at: Date.now(), status: null, fwd: null };
      try { localStorage.setItem(PKEY, JSON.stringify(B.pending)); } catch { /* memory copy */ }
      B.msg = "Sending…"; paint();
      await tx.wait();
      if (typeof cpToast === "function") cpToast(tr("Sent — Circle mints it on Arc in a few minutes."), "ok");
      watch();
    } catch (err) {
      B.err = rejected(err) ? tr("You rejected the request in your wallet.") : String(err.shortMessage || err.reason || err.message || err).slice(0, 180);
    } finally { B.busy = false; window.arcChainSwitching = false; paint(); }
  }
  function watch() {
    if (B.poll || !B.pending) return;
    const tick = async () => {
      const P = B.pending;
      if (!P) { clearInterval(B.poll); B.poll = null; return; }
      try {
        const r = await fetch(`/api/social?cctp=msg&src=${P.d}&tx=${P.tx}`, { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        const m = j && j.messages && j.messages[0];
        if (m) {
          P.status = m.status || P.status;
          if (m.forwardTxHash) { P.fwd = m.forwardTxHash; if (m.decoded && m.decoded.amount) { try { const fee = BigInt(m.decoded.feeExecuted || 0); P.got = (BigInt(m.decoded.amount) - fee).toString(); } catch { /* keep the estimate */ } } }
          try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch { /* fine */ }
          if (P.fwd) { clearInterval(B.poll); B.poll = null; if (typeof window.arcFeedback === "function") window.arcFeedback("milestone"); if (typeof cpToast === "function") cpToast(tr("Your USDC is on Arc."), "ok"); }
        }
      } catch { /* next tick */ }
      if (!$("cp5-bridge") || !$("cp5-bridge").hidden) paint();
      paintChip();
    };
    B.poll = setInterval(tick, 6000);
    tick();
  }
  // the entry under the contribute button, and a chip while a transfer is on its way
  function paintChip() {
    const side = $("bp-round-panel");
    if (!side) return;
    let row = side.querySelector(".cp5-br-entry");
    const s = S();
    const show = !s || !s.started || (s.isOpen && nowS() < Number(s.deadline));
    if (!show && !B.pending) { if (row) row.remove(); return; }
    if (!row) {
      row = document.createElement("div"); row.className = "cp5-br-entry";
      const after = $("bp-contribute-btn");
      if (after && after.parentNode === side) after.insertAdjacentElement("afterend", row); else side.appendChild(row);
      row.addEventListener("click", (e) => { if (e.target.closest("button")) open(); });
    }
    const P = B.pending;
    row.innerHTML = P ? `<button type="button" class="cp5-br-chip${P.fwd ? " ok" : ""}" data-no-i18n><i></i>${esc(P.fwd ? L("USDC arrived on Arc · contribute it", "USDC가 Arc에 도착했어요 · 참여하기", "USDC 已到账 Arc · 去参与") : L("USDC on its way to Arc…", "USDC가 Arc로 오는 중…", "USDC 正在转入 Arc…"))}</button>`
      : `<button type="button" class="cp5-br-open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h12M12 6l6 6-6 6"/><circle cx="4" cy="12" r="1.6"/></svg>${T("Bring USDC from another chain")}</button>`;
  }
  setTimeout(() => { paintChip(); if (B.pending && !B.pending.fwd) watch(); }, 1200);
  setInterval(() => { if (!document.hidden) paintChip(); }, 15000);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("cp5-bridge") && !$("cp5-bridge").hidden) close(); });
  window.cpBridge = { open };
  document.addEventListener("arc:lang", () => { try { paintBox(); sideStatus(); route(); results(); keys(); paintChip(); if ($("cp5-bridge") && !$("cp5-bridge").hidden) paint(); } catch { /* next paint */ } });
})();
;
/* ---- circlepad-v9.js ---- */
/* global CONFIG, state */
// circlepad-v9.js — CirclePad's round-aware copy, layout and motion (6 Oct 2026). Runs after every other CirclePad
// script (it only rearranges and decorates what they render; it never reads or writes the chain):
//   · copy that follows the round: the Airdrop tab and the Home governance card on a round with no vote (a plan
//     round such as Round #3 + #4's snapshot airdrop)
//   · layout: the round card's route ("Where your USDC goes") moves inside the card, the description folds on phones,
//     the card's badge follows the phase, empty numbers show a skeleton until they load
//   · motion: Round #3 and #4's rings merge once, a delivery step that turns done gets its stamp once, the numbers
//     under the round card bump when they change, and a contributor whose snapshot airdrop went out gets a card once.
// Every effect is skipped under prefers-reduced-motion; what each one shows is still there without it.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const N = () => Number(CONFIG.CIRCLEPAD_ROUND || 1);
  const GOV = () => (CONFIG.CIRCLEPAD_GOV || {})[N()] || {};
  const PLAN = () => CONFIG.CIRCLEPAD_ROUND_PLAN || null;
  const ALSO = () => (PLAN() && PLAN().also) || {};
  const DEL = () => (CONFIG.CIRCLEPAD_DELIVERY || {})[N()] || {};
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = () => window.matchMedia && matchMedia("(max-width: 900px)").matches;
  const R = () => (typeof _circlepadState !== "undefined" && _circlepadState) || null; // eslint-disable-line no-undef
  const RD = () => window.circlepadRound || null;
  const phase = () => (RD() ? RD().phase() : "pre");
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: the effect just repeats */ } },
  };
  const once = (k) => { const seen = store.get("cp9.once", []); if (seen.includes(k)) return false; store.set("cp9.once", [...seen, k].slice(-80)); return true; };

  // ================= copy that follows the round =================
  function copy() {
    const p = PLAN();
    if (!p) return;
    const b = p.buy || {}, a = p.also || {}, sym = "$" + (b.sym || "ARCIA"), r4 = a.round || N() + 1;
    // Airdrop tab: what this round's contributors get
    const lang = (window.arcI18n && window.arcI18n.get()) || "en";
    const ad = $("bp-panel-airdrop");
    const first = ad && ad.querySelector(".bp-simple > p");
    if (first && first.dataset.cp9 !== lang) {
      first.dataset.cp9 = lang;
      first.innerHTML = `<strong>${T("CirclePad airdrop")}</strong> — ${T(a.snapshot
        ? `every wallet in Round #${N()}'s raise is in the snapshot airdrop, by its share of the raise: ${sym} on ${b.chain || "Robinhood Chain"} and the Round #${r4} share on ${a.chain || "Solana"}. Round #2's contributors are included from Round #2's list. The contributor list at the close is public on-chain, so anyone can check who was in and how much.`
        : `every wallet in Round #${N()}'s raise gets ${sym} on ${b.chain || "Robinhood Chain"} and an allocation of Round #${r4}, by its share of the raise. The contributor list at the close is public on-chain.`)}`;
    }
    const note = $("cp-airdrop-note");
    if (note && a.snapshot && note.dataset.cp9 !== lang) { note.dataset.cp9 = lang; note.textContent = tr("Snapshot airdrop: the timing is announced here and on @arcircle_launch. More updates to follow."); }
    // Home: the governance card has nothing to vote on this round — say what the round does instead
    const list = document.querySelector("#bp-panel-home .bp-vote-list");
    if (list && list.dataset.cp9 !== lang) {
      list.dataset.cp9 = lang;
      list.classList.add("cp9-plan-list");
      const items = [`${sym} · ${b.chain || "Robinhood Chain"}`, `Round #${r4} · ${a.chain || "Solana"}`, a.snapshot ? "Snapshot airdrop" : "Two allocations"];
      list.innerHTML = items.map((t) => `<li>${T(t)}</li>`).join("");
      const head = list.closest(".bp-card") && list.closest(".bp-card").querySelector(".bp-card-head");
      if (head && head.firstChild && head.firstChild.nodeType === 3) head.firstChild.textContent = tr("This round") + " ";
    }
  }

  // ================= layout =================
  function layout() {
    const feat = $("bp-featured"), main = feat && feat.querySelector(".bp-featured-main");
    if (!feat || !main) return;
    feat.dataset.ph = phase();
    // the route ("Where your USDC goes") sits inside the round card, in the room under the description
    const route = $("cp5-route");
    if (route && route.parentElement !== main && main.classList.contains("cp-main")) { main.appendChild(route); main.classList.add("cp9-has-route"); }
    // phones: the description folds to three lines
    const desc = $("bp-featured-desc");
    if (desc && !desc.dataset.cp9) {
      desc.dataset.cp9 = "1";
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "cp9-more"; btn.hidden = true; btn.textContent = tr("Read more");
      btn.addEventListener("click", () => { const open = desc.classList.toggle("cp9-open"); btn.textContent = tr(open ? "Show less" : "Read more"); });
      desc.insertAdjacentElement("afterend", btn);
    }
    if (desc) {
      desc.classList.add("cp9-clamp");
      const btn = desc.nextElementSibling;
      if (btn && btn.classList.contains("cp9-more")) btn.hidden = !phone() || (!desc.classList.contains("cp9-open") && desc.scrollHeight <= desc.clientHeight + 4);
    }
    // numbers that haven't loaded yet: a shimmer instead of a dash
    const loaded = !!R();
    document.querySelectorAll("#bp-featured .bp-mini-stat strong").forEach((el) => el.classList.toggle("cp9-sk", !loaded && /^[—–-]?$/.test(el.textContent.trim())));
  }

  // ================= motion =================
  // Round #3 + #4: the two rings slide into one, once per browser (then they stay merged)
  let mergeIO = null;
  function merge() {
    const el = document.querySelector(".cp-merge");
    if (!el || el.dataset.cp9) return;
    el.dataset.cp9 = "1";
    const key = `merge:${N()}+${ALSO().round || ""}`;
    if (reduce() || !store.get("cp9.once", []).every((k) => k !== key)) { el.classList.add("done"); return; }
    if (!("IntersectionObserver" in window)) { el.classList.add("done"); return; }
    mergeIO = mergeIO || new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { mergeIO.unobserve(x.target); once(key); x.target.classList.add("go"); } }), { threshold: 0.6 });
    mergeIO.observe(el);
  }
  // the delivery board: a step that turns done gets its stamp the first time this browser sees it done
  function stamps() {
    const seen = store.get("cp9.dl", {});
    let dirty = false;
    document.querySelectorAll(".cp-dl li[data-dl]").forEach((li) => {
      const k = li.dataset.dl, st = li.dataset.dlSt || "";
      if (seen[k] === st) return;
      if (st === "done" && seen[k] !== undefined && !reduce()) { li.classList.add("cp9-stamp"); setTimeout(() => li.classList.remove("cp9-stamp"), 1600); }
      seen[k] = st; dirty = true;
    });
    if (dirty) store.set("cp9.dl", seen);
  }
  // the numbers under the round card: a short bump when one changes
  const lastNum = new WeakMap();
  function bumps() {
    document.querySelectorAll("#bp-featured .bp-mini-stat strong, #bp-featured .bp-raised-big").forEach((el) => {
      const t = el.textContent.trim(), prev = lastNum.get(el);
      lastNum.set(el, t);
      if (prev === undefined || prev === t || /^[—–-]?$/.test(prev) || reduce()) return;
      el.classList.remove("cp9-bump"); void el.offsetWidth; el.classList.add("cp9-bump");
    });
  }
  // the snapshot airdrop went out and this wallet is on the round's list: a card once per wallet
  function arrived() {
    const a = ALSO(), d = DEL().drop;
    if (!a.snapshot || !d || d.status !== "done") return;
    const w = me(), rows = window.circlepadLbRows || [];
    if (!w || !rows.length || !rows.some((r) => String(r.address).toLowerCase() === w)) return;
    if (!once(`drop:${N()}:${w}`)) return;
    const EXPL = { rh: "https://robinhoodchain.blockscout.com/tx/", sol: "https://solscan.io/tx/", arc: "https://arc.etherscan.io/tx/" };
    const txs = (d.txs || []).filter((x) => x && x.hash).slice(0, 3).map((x) => `<a href="${esc((EXPL[x.chain] || EXPL.rh) + x.hash)}" target="_blank" rel="noopener" data-no-i18n>${esc(x.label || x.hash.slice(0, 10) + "…")} ↗</a>`).join("");
    const box = document.createElement("div");
    box.className = "cp9-arrived"; box.setAttribute("role", "status");
    box.innerHTML = `<i aria-hidden="true"></i><div><b>${T("Your snapshot airdrop went out")}</b><p>${T(`This wallet is on Round #${N()}'s list — its share was in the snapshot.`)}</p>${txs ? `<span class="cp9-arrived-tx">${txs}</span>` : ""}</div><button type="button" aria-label="${T("Close")}">×</button>`;
    box.querySelector("button").addEventListener("click", () => { box.classList.add("out"); setTimeout(() => box.remove(), 400); });
    document.body.appendChild(box);
    if (!reduce() && typeof window.arcConfetti === "function") window.arcConfetti({ count: 70 });
  }

  function tick() {
    try { copy(); layout(); merge(); stamps(); bumps(); arrived(); } catch (e) { console.warn("circlepad-v9", e); }
  }
  ["circlepad:state", "circlepad:lb", "arc:lang", "arc:wallet"].forEach((ev) => document.addEventListener(ev, () => setTimeout(tick, 60)));
  window.addEventListener("resize", () => { clearTimeout(tick.t); tick.t = setTimeout(tick, 150); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
  setInterval(() => { if (!document.hidden) tick(); }, 2000);
})();
;
/* ---- arc-uxfx.js ---- */
/* global state, APC, apcSpot, refreshAccountDependentViews */
// arc-uxfx.js — small motion layer for ArcPad and CirclePad:
//   • a thin gradient progress bar across the top whenever the tab changes
//   • the new tab slides in from the side it sits on in the menu
//   • connecting a wallet plays the two ARCIRCLE rings locking together
//   • on a coin page, the logo's rim sweeps green / red when the price ticks
// Everything is skipped under prefers-reduced-motion.
(function () {
  "use strict";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  // ---------------- tab progress bar + direction ----------------
  const panels = [...document.querySelectorAll(".bp-panel")];
  if (panels.length) {
    const bar = document.createElement("div");
    bar.className = "ux-bar";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    let barT = null;
    const runBar = () => {
      clearTimeout(barT);
      bar.classList.remove("run", "done"); void bar.offsetWidth;
      bar.classList.add("run");
      barT = setTimeout(() => { bar.classList.add("done"); }, 420);
    };
    let cur = panels.findIndex((p) => p.classList.contains("active"));
    const mo = new MutationObserver(() => {
      const i = panels.findIndex((p) => p.classList.contains("active"));
      if (i < 0 || i === cur) return;
      const prev = cur; cur = i;
      runBar();
      const p = panels[i];
      if (prev < 0 || p.id === "bp-panel-coin" || document.documentElement.classList.contains("vt-active")) return;
      p.classList.remove("ux-from-l", "ux-from-r"); void p.offsetWidth;
      p.classList.add(i > prev ? "ux-from-r" : "ux-from-l");
      setTimeout(() => p.classList.remove("ux-from-l", "ux-from-r"), 450);
    });
    panels.forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
  }

  // ---------------- wallet connected: rings lock together ----------------
  const bootAt = Date.now();
  let lastAcct = null;
  function ringsAt(el) {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const o = document.createElement("div");
    o.className = "ux-rings";
    o.style.left = `${r.left + r.width / 2}px`;
    o.style.top = `${r.top + r.height / 2}px`;
    o.innerHTML = '<svg viewBox="0 0 120 80" aria-hidden="true"><circle class="ux-r1" cx="46" cy="40" r="22"/><circle class="ux-r2" cx="74" cy="40" r="22"/></svg>';
    document.body.appendChild(o);
    el.classList.remove("ux-wallet-glow"); void el.offsetWidth; el.classList.add("ux-wallet-glow");
    setTimeout(() => { o.remove(); el.classList.remove("ux-wallet-glow"); }, 1500);
  }
  function onAccount() {
    const acct = typeof state !== "undefined" && state.account ? String(state.account).toLowerCase() : null;
    if (acct && !lastAcct && Date.now() - bootAt > 1500) {
      let seen = false;
      try { seen = sessionStorage.getItem("arcircle.rings") === acct; sessionStorage.setItem("arcircle.rings", acct); } catch (e) { /* ignore */ }
      if (!seen) setTimeout(() => { const w = document.getElementById("wallet-slot"); if (w) ringsAt(w); }, 60);
    }
    lastAcct = acct;
  }
  if (typeof refreshAccountDependentViews === "function") {
    const orig = refreshAccountDependentViews;
    // eslint-disable-next-line no-global-assign
    refreshAccountDependentViews = function () { orig.apply(this, arguments); try { onAccount(); } catch (e) { /* ignore */ } };
  }
  setTimeout(() => { try { onAccount(); } catch (e) { /* ignore */ } }, 1600);

  // ---------------- coin page: price tick ring ----------------
  const price = document.getElementById("apc-price");
  if (price && typeof APC !== "undefined") {
    let last = null, lastTok = null;
    new MutationObserver(() => {
      const wrap = document.querySelector("#bp-panel-coin .apc-logo-wrap");
      const spot = typeof apcSpot === "function" ? apcSpot() : null;
      const tok = APC.l && APC.l.token;
      if (!wrap || spot == null || !(spot > 0)) return;
      if (tok !== lastTok) { lastTok = tok; last = spot; return; }
      if (last != null && spot !== last) {
        wrap.classList.remove("ux-tick-up", "ux-tick-down"); void wrap.offsetWidth;
        wrap.classList.add(spot > last ? "ux-tick-up" : "ux-tick-down");
      }
      last = spot;
    }).observe(price, { childList: true, characterData: true, subtree: true });
  }
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
    var ex = EXPL; // the transaction's own chain's explorer (Robinhood Chain for veARCIA, Pons, Orders RH…)
    var link = function (h) { return '<a href="' + esc(ex + "/tx/" + h) + '" target="_blank" rel="noopener">' + esc(h.slice(0, 10) + "…" + h.slice(-6)) + " ↗</a>"; };
    var cur = "";
    var tell = function (h, st) { if (!h) return; cur = h; try { document.dispatchEvent(new CustomEvent("arc:tx", { detail: { h: h, s: st, ex: ex } })); } catch (e) { /* old browser */ } };
    return {
      chain: function (cid) { if (Number(cid) === 4663) ex = (typeof CONFIG !== "undefined" && CONFIG.PONS && CONFIG.PONS.EXPLORER) || "https://robinhoodchain.blockscout.com"; },
      sent: function (h) { if (done) return; tell(h, "pending"); set(0.55, "Transaction submitted", esc(tr("Waiting for a block")) + " · " + link(h), "sent"); },
      mined: function (h) { if (done) return; done = true; tell(h, "ok"); set(1, "Transaction confirmed", link(h), "ok"); el.querySelector(".txr-mark").innerHTML = CHECK; if (typeof window.arcHaptic === "function") window.arcHaptic("milestone"); close(4200); },
      failed: function (h, why) { if (done) return; done = true; tell(h, "fail"); set(1, why === "rejected" ? "Cancelled in wallet" : "Transaction failed", h ? link(h) : esc(tr(why === "rejected" ? "Nothing was sent." : "Nothing changed — you can try again."))); el.classList.add(why === "rejected" ? "cancel" : "bad"); el.querySelector(".txr-mark").innerHTML = CROSS; close(why === "rejected" ? 2600 : 6000); },
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
        if (resp && resp.chainId != null) r.chain(resp.chainId);
        if (h) r.sent(h);
        // a Robinhood Chain transaction: the wallet is often switched back to Arc right after, so its provider would
        // look for the receipt on the wrong chain — follow it on Robinhood Chain's own RPC instead
        var rhRpc = typeof CONFIG !== "undefined" && ((CONFIG.ARCPAD_RH && CONFIG.ARCPAD_RH.RPC) || (CONFIG.PONS && CONFIG.PONS.RPC));
        var onRh = resp && resp.chainId != null && Number(resp.chainId) === 4663 && rhRpc && h;
        var waiting = onRh ? new ethers.JsonRpcProvider(rhRpc, 4663, { staticNetwork: true }).waitForTransaction(h, 1, 900000) : resp && typeof resp.wait === "function" ? resp.wait() : null;
        if (waiting) {
          waiting.then(function (rc) { if (rc && rc.status === 1) r.mined(h); else r.failed(h, "reverted"); }, function (e) { r.failed(h, rejected(e) ? "rejected" : "reverted"); });
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
    var target = document.querySelector(".cw-b") || document.getElementById("wallet-pill-btn") || document.getElementById("wallet-slot");
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
