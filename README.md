<p align="center">
  <img src="images/og-card.jpg" alt="HOMEPAD — launch a token on Robinhood Chain, every trade fee flows back to $HOME" width="720">
</p>

<h1 align="center">🏡 HOMEPAD</h1>

<p align="center">
  A permissionless token launchpad on <a href="https://docs.robinhood.com/chain">Robinhood Chain</a>.<br>
  <strong>Every launch pays rent, and rent goes home</strong> — a share of every trade fee buys back <a href="https://rh-scan.com/token/0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f">$HOME</a>.
</p>

<p align="center">
  <a href="https://homepad.fun">Live site</a> ·
  <a href="https://homepad.fun/rent">Proof of Rent</a> ·
  <a href="https://x.com/HOMEonRobinhood">X</a> ·
  <a href="https://t.me/HOMEonRobin">Telegram</a> ·
  <a href="https://homepad.fun/mechanism.html">How it works</a> ·
  <a href="https://homepad.fun/docs.html">Docs</a>
</p>

<p align="center">
  <img alt="status" src="https://img.shields.io/badge/status-testnet-ffb648?style=flat-square">
  <img alt="chain" src="https://img.shields.io/badge/chain-Robinhood%20Chain%20testnet%20(46630)-39ff88?style=flat-square">
  <img alt="uniswap" src="https://img.shields.io/badge/liquidity-Uniswap%20v4-4d9fff?style=flat-square">
  <img alt="tests" src="https://img.shields.io/badge/contract%20tests-37%20passing-39ff88?style=flat-square">
  <img alt="slither" src="https://img.shields.io/badge/slither-clean%20on%20active%20contracts-39ff88?style=flat-square">
</p>

---

> **Testnet only.** Everything in this repo is deployed to Robinhood Chain **testnet** (chain ID `46630`). Nothing here has been professionally audited yet and nothing here is financial advice. The `$HOME` token itself is live on mainnet and is a separate deployment. See [Status](#status) for exactly what's done and what isn't before mainnet.

## What it does

Anyone can launch a fixed-supply (1,000,000,000) ERC-20 through HOMEPAD, with no admin key anywhere in the contracts — nobody, including whoever runs HOMEPAD, can pause, drain, or redirect a launch after it exists. Every trade pays a fee that is split **immediately, on-chain** between the token's creator and the `$HOME` treasury. No contract ever holds fee money. [Proof of Rent](https://homepad.fun/rent) shows every fee ever collected, each one traceable to its transaction.

### Four launch modes

| Mode | What happens at launch | Price comes from | Creator needs |
|---|---|---|---|
| **Hybrid** *(default)* | A real Uniswap v4 pool from block one, **single-sided** (all supply, priced against a virtual ETH reserve) | Curve-like impact, real pool — visible on Dexscreener immediately | Nothing (0 ETH) |
| **Bonding Curve** | A standalone curve contract holds the supply; graduates into a locked v4 pool once it raises the threshold (3 ETH on testnet) | Constant-product curve on virtual reserves | Nothing (0 ETH) |
| **Instant Liquidity** | A real Uniswap v4 pool, **two-sided** — creator's ETH seeds actual liquidity | Real pool from block one | ETH for liquidity |
| **Stock Pair** | Hybrid, priced in an ERC-20 quote (Robinhood Stock Tokens; $HOME later) instead of ETH — single-sided v4 pool, either currency ordering | Curve-like, in the quote token | Nothing (buys need a one-time approve) |

All four share the same fee structure and the same **Dev Buy** option (`launchAndBuy()` — buy your own tokens atomically in the launch transaction). Every trade on every mode gets an exact, on-chain **minOut** — for the three v4-based modes this comes from a static-call simulation of the real swap (there's no on-chain quoter for a v4 pool), not an off-chain estimate.

> ⚠️ **Known open risk (Stock Pair only):** real Robinhood Stock Tokens carry a `uiMultiplier()` that changes on corporate actions (splits, dividends — AAPL has already had one). `HomepadFactoryPaired`/`HomepadPairedSwapRouter` don't yet account for this, so a live pool could mis-price if a corporate action lands while it's open. Testnet uses mock stock tokens, which never trigger this — it only matters once Stock Pair uses real Stock Token addresses.

### Fees

- **1% base fee** on every trade, protocol-wide → split **70% creator / 30% `$HOME` treasury** by default (`creatorShareBps=7000`, `homeShareBps=10000` — the platform wallet's own cut is 0% at these defaults, all of the non-creator share currently goes to `$HOME`).
- Creators can add **up to 2% extra** at launch — that part is 100% theirs.
- Total per launch: 1–3%.
- **Launching itself is free** — `launch()` isn't payable and requires no ETH. Only `launchAndBuy()` takes ETH (or, for Stock Pair, the quote token), and that amount becomes the creator's own dev-buy or Instant-mode liquidity — it's never a fee.
- The split is **immutable once a factory is deployed** — there is no function anywhere that changes it after the fact.

### The rent loop

```
launch a token → trading happens → rent (fees) collected → $HOME bought back
       ↑                                                          ↓
  more creators arrive  ←  community grows  ←  liquidity deepens (POL)
```

[Proof of Rent](https://homepad.fun/rent) shows the left half of this loop live — total rent, 24h rent, creator payouts, launch volume, all read straight from on-chain events. The right half (buyback, protocol-owned liquidity) is **not automated yet**: `contracts/scripts/distribute-rent.js` is an interactive manual script for the four-way split described on the [Flywheel page](https://homepad.fun/flywheel.html) (50% buyback / 30% POL / 10% creator incentives / 10% ops), and Proof of Rent shows those rows as zero rather than implying they already run.

## Repo layout

```
.
├── index.html · explore.html · launch.html      Frontend pages (plain HTML/CSS/JS, no build step)
├── mechanism.html · docs.html · flywheel.html
├── guide-launch.html · guide-trade.html · guide-rent.html   Plain-language 3-step walkthrough, linked from the footer
├── rent.html            Proof of Rent — live on-chain rent dashboard
├── app.js               Routing, launch form, Explore, token pages, Profile, trading
├── rent.js              Proof of Rent's on-chain aggregation (fee events, volume, poolId attribution)
├── home-stats.js        $HOME live stats (Dexscreener + Blockscout) and the home carousel
├── wallet-appkit.js     Wallet connection (Reown AppKit / wagmi)
├── footer.js · launch-modal.js
├── config.js            Every address, RPC, and URL in one place
├── abis.js              Contract ABIs
├── style.css            Single stylesheet; all responsive rules live in one section at the end
├── vercel.json           Clean-URL rewrite (/rent -> rent.html)
├── images/              Stickers, favicons, Open Graph card
├── FRONTEND.md          Frontend notes
└── contracts/           Hardhat project
    ├── contracts/       HomepadFactoryHybrid · HomepadHybridHook · HomepadFactoryV4 · BondingCurveV4 ·
    │                    HomepadFactoryInstant · HomepadHook · HomepadSwapRouter · HomepadFactoryPaired · HomepadPairedSwapRouter …
    ├── test/            37 tests across all modes
    ├── scripts/         deploy-*.js per mode (incl. deploy-paired.js), distribute-rent.js,
    │                    verify-testnet.js + lib/verify.js (Blockscout source verification)
    └── README.md        Contract-level notes
```

## Running it

### Frontend

No build tooling — any static file server works:

```bash
npx serve .
# or: python3 -m http.server 8080
```

Everything is driven by `config.js`. The site talks to testnet by default; connecting a wallet prompts it to add/switch to Robinhood Chain testnet automatically.

### Contracts

```bash
cd contracts
npm install
cp .env.example .env        # fill in a deployer key — never a wallet holding real funds
npx hardhat test            # 37 tests
npx hardhat run scripts/deploy-hybrid.js  --network robinhoodTestnet
npx hardhat run scripts/deploy-v4.js      --network robinhoodTestnet
npx hardhat run scripts/deploy-instant.js --network robinhoodTestnet
DEPLOY_MOCK_STOCKS=1 npx hardhat run scripts/deploy-paired.js --network robinhoodTestnet   # stock pair (+ mock stocks on testnet)
```

Every `deploy-*.js` script above verifies its own contracts' source on Blockscout automatically right after deploying (both networks' official explorer — Etherscan doesn't support Robinhood Chain at all). To retroactively verify contracts that were already deployed before this was added, `scripts/verify-testnet.js` verifies all of them in one run:

```bash
npx hardhat run scripts/verify-testnet.js --network robinhoodTestnet
```

After deploying, paste the printed addresses into `config.js`. If a factory is ever redeployed, add the previous `{ factory, router }` pair to the matching `LEGACY_*_FACTORIES` list so tokens launched on it keep showing up.

## Deployed contracts (testnet)

Network: Robinhood Chain testnet · chain ID `46630` · RPC `https://rpc.testnet.chain.robinhood.com` · [explorer](https://explorer.testnet.chain.robinhood.com)

| Contract | Address |
|---|---|
| Hybrid Factory | `0x403DE4697e1d3A7E837e5778532E1247B9C87b99` |
| Hybrid Hook | `0x002dDC296285D92CdB3c4c40a1b510ce67774044` |
| Hybrid Swap Router | `0xF40F33D6E3240d29a6E04339b07b927053d74cF1` |
| Bonding Curve Factory (`HomepadFactoryV4`) | `0x154f77D9CEE487E97553330028ED1425a238085d` |
| Instant Liquidity Factory | `0xcfF2c7FFbd867CcaE3c253Baaf10d58d5eC1ba17` |
| Instant Hook | `0xf9f5105d59AF2B2538D0AcD961D10b61C4CcC044` |
| Instant Swap Router | `0x917F2f7A7E4607937c3562E96b2E02325264B813` |
| Stock Pair Factory (`HomepadFactoryPaired`) | `0x7750339Eb5b5E11d934c6FA3e0f6e9f23df0Aa4f` |
| Stock Pair Hook | `0xA4BA24582a4718Ef67aCEB6fe0112B23a79A0044` |
| Stock Pair Swap Router | `0x7e8cBDA25f077cEc163765223e53a5C554Af2328` |
| Mock TSLA / NVDA / AAPL (testnet quote tokens) | `0x45165C...25Be3` / `0x426657...27A28` / `0x866863...376CC7` |
| Uniswap v4 PoolManager (testnet) | `0x552815eF68E6eb418A3d65D0AA1043d93204F612` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

`$HOME` (mainnet): `0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f` · [Dexscreener](https://dexscreener.com/robinhood/0x177e26bc396d8a264542033533d71a94957375027bf4b47a7467cc444233bdfa) · [rh-scan](https://rh-scan.com/token/0xE9aB3214a9b77BAEbFdE2B6D17dEc4823599ff6f)

Confirmed mainnet addresses for the eventual mainnet deploy (Robinhood Chain, chain ID `4663`): Uniswap v4 PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`; Stock Tokens TSLA `0x322F0929c4625eD5bAd873c95208D54E1c003b2d`, NVDA `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`, AAPL `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` — each cross-checked against multiple independent sources, not just one.

## How the frontend reads the chain

- Explore, the home carousel, and Profile batch every read through **Multicall3** (2 RPC round-trips for the whole list), falling back to individual calls if it's unavailable.
- 24h price change is reconstructed from each token's own trade events; the home carousel skips that step (`fetchAllLaunches({ skipHistory: true })`) so the first paint stays fast.
- Profile creator fees and Proof of Rent are both exact, not estimated: Instant/Hybrid/Paired sum the hook's `FeeRouted` events (one query per hook, not per token — poolId attributes each event back to a token locally), Bonding Curve replays the curve's own split math over its `Buy`/`Sell` events.

## Status

- [x] Four launch modes, deployed and tested on testnet (Stock Pair uses mock TSLA/NVDA/AAPL for now)
- [x] Explore (search / sort / filter), token pages with charts and trading, Profile (launches / holdings / fees), Proof of Rent dashboard
- [x] Mobile and desktop passes
- [x] Slippage protection on every trade (Hybrid/Instant/Paired use a static-call quote + tolerance for minOut, matching Bonding Curve)
- [x] Automatic source verification on deploy (Blockscout)
- [x] Contract-level review pass: fixed-supply vanilla ERC-20, no owner/pause/blacklist anywhere, hooks hold only afterSwap+afterSwapReturnDelta permissions (no ability to block a sale or liquidity removal), fee split immutable per factory, Slither static analysis run with no real findings on the active contracts (findings were either false positives — reentrancy guards/try-catch patterns Slither doesn't fully model — or scoped to superseded pre-v4 contracts), HookScan (Uniswap v4 hook-specific analyzer) run against both hooks with zero findings on all 4 detectors
- [x] Confirmed dead code removed (`HomepadHybridSwapRouter.sol` — Hybrid and Instant both actually deploy the generic `HomepadSwapRouter`)
- [x] `website` field added to `LaunchMeta`/`Launch` across all four active factories — contract-side only; frontend intentionally not wired up until the next real redeploy, so it doesn't break against the currently-live testnet contracts
- [ ] Anti-snipe wallet caps for Hybrid launches
- [ ] RENT model automation (buyback + POL — see Proof of Rent and the Flywheel page)
- [ ] Stock Pair corporate-action handling (see the warning above) — needed before Stock Pair uses real Stock Tokens
- [ ] Professional security audit
- [ ] Live scanner check on mainnet (Dexscreener/GMGN/a v4-aware honeypot checker) once a real token is launched — can't be verified from code alone

## Security & disclaimer

The contracts have **no admin key**: no pause, no upgrade, no fee redirect. Graduated liquidity is burned, not locked. That protects against the *platform* being the rug — it does nothing about a *token* being one. Verify the contract address of anything you buy. Nothing here is financial advice.

Not affiliated with, operated by, or endorsed by Robinhood Markets.

---

<p align="center">Built in public. 💚</p>
