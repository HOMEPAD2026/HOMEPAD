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
  },
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
  // The Multisender on Robinhood Chain (the page's Arc | Robinhood Chain switch): ArcMultiSendV2 deployed there with
  // deploy-arc-multisend-v2.js --network robinhoodMainnet — ETH and any ERC-20 or NFT. Empty: Robinhood Chain shows
  // as "opening soon" (a list can be loaded and checked, not sent).
  MULTISEND_RH_ADDRESS: "0x07Ec525DC675206618C3e5E7fd92C7C0707df6C4", // ArcMultiSendV2 on Robinhood Chain (2026-10-01)
  // ARCIRCLE Orders (contracts/contracts/ArcircleOrders.sol, arc-orders.js), deployed on Arc 2026-10-02 (block 23739979).
  // Its fees go to ArcircleFeeBurn 0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034. Keep api/_orders.mjs CFG in step.
  ORDERS_ADDRESS: "0x1A31C2539d6e3fBdF276E8D74bA67aEc4De9008e",
  ORDERS_PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3", // Uniswap's Permit2: makers can allow ARCIRCLE Orders with a signature
  ORDERS_FREE_HOLD: 100000, // $ARCIRCLE held for fee-free orders (shown before the contract is live; ArcircleFeeBurn.discountMin decides)
  // ARCIRCLE Orders on Robinhood Chain (ArcircleOrdersNative + ArcircleFeeBurnNative, contracts/scripts/deploy-arcircle-orders-rh.js):
  // empty until deployed — the Robinhood side of arcpad.html#orders is a preview until then. Permit2 only once confirmed there.
  ORDERS_RH_ADDRESS: "",
  ORDERS_RH_FEEBURN: "",
  ORDERS_RH_PERMIT2: "",
  ORDERS_RH_WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",

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
