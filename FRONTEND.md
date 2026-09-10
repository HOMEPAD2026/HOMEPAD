# HOMEPAD frontend

Plain HTML/CSS/JS, no build step — same pattern as the `$HOME` site, so it
deploys to Vercel (or any static host) as-is.

## Before this works

Everything is wired up, but it's inert until `config.js` points at a real
deployed factory:

1. Deploy `HomepadFactory` (see the main `homepad/` project's
   `scripts/deploy.js`).
2. Open `config.js` and set `FACTORY_ADDRESS` to the deployed address.
3. Double check `CHAIN_ID_HEX` / `RPC_URL` / `BLOCK_EXPLORER` match whichever
   network you deployed to (testnet values are filled in by default —
   switch them when you move to mainnet, chain ID `4663`).

## Running it locally

No build tooling needed — any static file server works:

```bash
npx serve .
# or: python3 -m http.server 8080
```

Open it, connect a wallet, and it'll prompt to add/switch to Robinhood
Chain automatically if the wallet isn't already on it.

## $HOME hero + live stats (new)

The top of the page is a standalone section that works independently of
`FACTORY_ADDRESS` — it's just showing the already-live `$HOME` token:

- **Price / market cap / liquidity / 24h volume** — pulled from Dexscreener's
  public API (`api.dexscreener.com`, no key required).
- **Embedded chart** — a Dexscreener iframe embed, driven by
  `DEXSCREENER_CHAIN_SLUG` + `DEXSCREENER_PAIR_ADDRESS` in `config.js`.
- **Holder count** — pulled live from Robinhood Chain's own block explorer
  (Blockscout, `robinhoodchain.blockscout.com` on mainnet /
  `explorer.testnet.chain.robinhood.com` on testnet), via its free v2 REST
  API. No API key needed for this basic lookup.
- **CA copy button** and social/buy links.

All of this logic lives in `home-stats.js`. If a fetch fails (wrong pair
address, explorer API shape changes, etc.), the affected stat just shows
"—" instead of breaking the page — check the browser console for the
actual error.

## Launch form (expanded)

The Launch modal/page now covers:
- **Pair selection** — ETH (default) or, if `STOCK_FACTORY_ADDRESS` is set in
  `config.js`, a dropdown of whichever Stock Tokens that factory was
  deployed with. Switching to Stock mode calls `StockHomepadFactory.launch()`
  instead of `HomepadFactory.launch()`.
- **Logo** — paste a hosted URL, or upload a file (embedded as a data URI).
  A hosted URL is strongly preferred: an uploaded file gets stored as raw
  text on-chain, so a large image meaningfully raises the launch's gas cost.
  The form warns above ~80KB.
- **Socials** — X, Telegram, Discord, all optional, stored on-chain per
  launch (see the backend README's note on why this is a gas/simplicity
  tradeoff rather than IPFS).
- **Dev buy** — ETH pairs only. If you enter an amount, the form calls
  `launchAndBuy()` instead of `launch()`, bundling your own purchase into
  the same transaction as the launch. Not available for Stock pairs — an
  ERC-20 can't ride along as `msg.value` the way ETH can, so a stock-paired
  dev buy is a separate `buy()` call right after the launch confirms.

## Wallet connect

By default this uses a plain `window.ethereum` connect button. Setting
`REOWN_PROJECT_ID` in `config.js` (free at
[dashboard.reown.com](https://dashboard.reown.com)) upgrades this to Reown
AppKit's modal — a proper wallet list plus WalletConnect QR support for
mobile, the same "UX by reown" modal used by other Robinhood Chain
launchpads like kekfun.xyz.

This loads AppKit as a CDN ES module (`esm.sh`) rather than an npm
dependency, since this site has no build step by design and AppKit
normally expects one (Vite). That route is more fragile than a real
bundled install — if it fails for any reason, `wallet-appkit.js` catches
the error and the site silently falls back to the plain connect button.
Nothing breaks either way, but it's worth testing directly after setting a
project ID rather than assuming it works.

## Pages

- `index.html` — home, live stats, chart, Story/Plan, Board (Explore)
- `launch.html` — standalone Launch form (also opens as an in-page modal from `index.html`)
- `mechanism.html` — how the curve/fees/graduation/stock-pairing actually work
- `docs.html` — getting started, contract addresses (with "soon" states for anything not deployed yet), FAQ
- `footer.js` — shared footer, renders itself into any page with a `<div id="site-footer-slot"></div>`. Automatically shows "soon" badges for the Factory/Stock Factory links until `config.js` has real addresses.

## What it does

- **Explore** (`#/explore`) — reads every launch straight from
  `HomepadFactory.launches()` and shows raise progress toward graduation.
  No indexer/backend — fine for early volume, but this will get slow if
  HOMEPAD ever has hundreds of launches. A subgraph or simple backend
  cache is the eventual fix, not a day-one requirement.
- **Launch** (`#/create`) — calls `factory.launch(name, symbol)` and
  redirects to the new token's page once it's confirmed.
- **Token page** (`#/token/<address>`) — live curve stats, buy/sell.

## Known MVP gaps, called out on purpose

- **No slippage protection in the UI.** Buy/sell calls pass `0` for
  `minTokensOut` / `minEthOut`. The contract supports real slippage limits
  — the frontend just doesn't compute or apply one yet. Add this before
  real trading volume, especially once more than one person can see a
  pending transaction and front-run it.
- **No price chart.** Only the raise-progress bar exists right now.
- **No token images/socials.** Pons-style launches let a creator attach an
  image, description, and links; this MVP is name + symbol only.
- **No wallet-disconnect handling** for account/network changes mid-session
  — refresh the page after switching accounts for now.

None of these block testing the core flow — they're the natural next pass
once launches are actually happening.
