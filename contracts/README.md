# HOMEPAD

A minimal, permissionless token launchpad for Robinhood Chain, modeled on
Pons/pump.fun-style bonding curves. Every trade fee routes to the $HOME
treasury by default. This is a working MVP with a full test suite — it is
**not yet ready for mainnet or real money.** See "Before this touches real
funds" below.

## How it works

1. **`HomepadFactory.launch(name, symbol, extraFeeBps, meta)`**
   — anyone calls this. It mints a
   fixed 1,000,000,000-token supply and deploys a dedicated `BondingCurve`
   for that token in the same transaction. No admin, no allowlist. `meta`
   is a struct of optional display fields (image URL, description,
   X/Telegram/Discord links) — pass empty strings to skip any of them.
   They're stored as plain strings in the `Launch` struct rather than
   off-chain, which is an MVP tradeoff (see "Not built yet" below).
   `extraFeeBps` is the creator's optional add-on fee — see "Fees" below.
2. **`BondingCurve.buy(minTokensOut, recipient)`** — send ETH, get tokens,
   priced along a constant-product curve (the same math Uniswap itself
   uses, just applied to virtual reserves instead of a pool). A fee is
   taken and immediately split between the creator, the $HOME treasury,
   and platform ops — the contract never holds fee money.
3. **`BondingCurve.sell(tokenAmount, minEthOut)`** — same curve, reverse
   direction, same fee.
4. **Graduation** — once net ETH raised crosses `graduationThreshold`
   (10 ETH by default), the curve locks, and **anyone** can call
   `graduate()` (not just the deployer) to push the remaining tokens + ETH
   into a real Uniswap V2 pool, then burn the LP tokens by sending them to
   `0x…dEaD`. Nobody — including whoever launched HOMEPAD — can pull that
   liquidity back out afterward.

Every one of those design choices (fixed supply, no admin key, permissionless
graduation, burned LP) exists so a launch on HOMEPAD can't be rugged by
HOMEPAD itself. It doesn't protect against a bad *token* — a creator can
still launch a token with a misleading name — it only protects against the
*platform* being the rug.

## Fees

Every trade pays `baseFeeBps` — 1% by default, fixed protocol-wide, the same
for every launch. That base fee splits `creatorShareBps` (70% by default) to
the token's creator, with the rest going to the platform side (further split
by `homeShareBps`, same as before — 100% to the $HOME treasury by default).

On top of that, each creator can optionally choose an `extraFeeBps` at
launch time — 0–2%, entirely their call, capped by `MAX_EXTRA_FEE_BPS`
(200). That extra fee, if set, goes **100% to the creator**. So total fees
on any given launch run 1%–3% depending on what its creator picked, and
whatever a creator adds beyond the 1% base is theirs alone — HOMEPAD and
$HOME never take a cut of it.

Worked example — a 1 ETH buy on a launch with the defaults and a creator
who added the full 2% extra (3% total fee = 0.03 ETH):
- Base portion (1% = 0.01 ETH): 70% (0.007 ETH) → creator, 30% (0.003 ETH) → $HOME treasury
- Extra portion (2% = 0.02 ETH): 100% → creator
- Creator receives 0.027 ETH total, $HOME treasury receives 0.003 ETH

This split is computed and paid out immediately on every trade —
`BondingCurve._routeFee()` — never held by the contract, never adjustable
after deployment.

## What's already verified

16 tests across three suites cover the full lifecycle and currently all pass:

```
npx hardhat test --no-compile
  HOMEPAD — Uniswap V4 Mode
    ✔ launches a token + curve with the full fixed supply in the curve
    ✔ splits the base fee 70/30 between creator and $HOME treasury
    ✔ graduates into a real Uniswap v4 pool once the threshold is met
    ✔ launchAndBuy bundles a dev buy atomically, same as the V2 factory
  HOMEPAD
    ✔ launches a token + curve with the full fixed supply in the curve
    ✔ splits the 1% base fee 70/30 between the creator and $HOME treasury
    ✔ sends 100% of a creator's chosen extra fee to the creator, on top of their base-fee share
    ✔ rejects an extra fee above the 2% cap
    ✔ lets a seller exit and receive ETH net of fee
    ✔ graduates once the threshold is met and burns the LP
    ✔ launchAndBuy: bundles a dev buy atomically with the launch, tokens land on the creator
    ✔ launchAndBuy: sending 0 ETH behaves exactly like a plain launch (no tokens bought)
  HOMEPAD — Stock-Paired Mode
    ✔ only allows launching against an allowlisted quote token
    ✔ splits the base fee 70/30 between creator and $HOME treasury, in the stock token
    ✔ sends 100% of the creator's chosen extra fee to them, same as the ETH curve
    ✔ graduates once the stock-quote threshold is met and burns the LP
```

Building this surfaced two real bugs in the original V2 curve that are now
fixed and covered by tests, worth knowing about since they're the kind of
thing that would have cost real money on mainnet:

- **Rounding drift in the sell path.** The virtual-reserve math can compute
  a payout 1–2 wei larger than the contract's actual ETH balance, because
  Solidity's integer division always rounds down and buy/sell aren't
  perfectly symmetric. Fixed by clamping any sell payout to the contract's
  real balance rather than trusting the curve math blindly.
- This is exactly the category of bug an audit exists to catch systematically
  instead of one test case at a time — see below.

## Project layout

```
contracts/
  LaunchToken.sol       — fixed-supply ERC20, minted once at launch
  BondingCurve.sol       — the pricing/fee/graduation logic
  HomepadFactory.sol     — deploys token + curve together
  interfaces/IUniswapV2.sol
  mocks/MockUniswap.sol  — TEST-ONLY stand-ins for Uniswap, do not deploy these anywhere real
test/homepad.test.js
scripts/
  compile.js  — offline solc-js compiler (see note below)
  deploy.js   — deployment script, reads config from env vars
.env.example
hardhat.config.js
```

### Why there's a custom `compile.js`

This was built in a sandboxed environment that couldn't reach
`binaries.soliditylang.org`, which is where Hardhat's built-in compiler
manager downloads solc from. `scripts/compile.js` uses the `solc` **npm**
package instead (pure JS/WASM, works fully offline) and writes artifacts in
the same format Hardhat expects. If you have normal internet access, you
almost certainly don't need this — just run `npx hardhat compile` and it
will work normally. Keep `compile.js` around as a fallback either way.

## Running it locally

```bash
npm install
node scripts/compile.js        # or: npx hardhat compile
npx hardhat test --no-compile  # omit --no-compile if you used hardhat compile
```

## Deploying to Robinhood Chain testnet

1. Get testnet ETH from Robinhood Chain's faucet (chainId 46630, RPC
   `https://rpc.testnet.chain.robinhood.com`).
2. Copy `.env.example` to `.env` and fill it in — **especially
   `UNISWAP_V2_ROUTER`**. Look that address up fresh from Uniswap's own
   deployments page or Robinhood Chain's docs; don't reuse an address from
   an old tutorial or guess based on another chain.
3. `npx hardhat run scripts/deploy.js --network robinhoodTestnet`
4. Verify the deployed contract on the block explorer before telling anyone
   to use it.
5. Do a full real-money-shaped test on testnet: launch a token, buy, sell,
   push it past the graduation threshold, confirm the LP actually lands at
   the burn address on-chain.

## Before this touches real funds

Being direct about this because it matters more than any feature:

- **Get a security review before mainnet.** At minimum, run it through
  Slither or a similar static analyzer; ideally get a paid audit before
  real ETH flows through it. A launchpad holds other people's money by
  design — a bug here is categorically worse than a bug in $HOME's own
  contract.
- **This targets Uniswap V2** for graduation because it's the simplest,
  most battle-tested integration to build and reason about. Pons and other
  Robinhood Chain launchpads use Uniswap V3/V4 concentrated liquidity,
  which is more capital-efficient but meaningfully more complex to
  integrate correctly. V2 is a deliberate MVP tradeoff, not an oversight —
  worth revisiting once the core flow is proven out.
- **Legal exposure is real and I can't advise on it.** Operating a
  launchpad — infrastructure other people use to raise money — is a
  different risk category from running $HOME itself, and it may draw
  securities/AML scrutiny depending on jurisdiction. Get an actual lawyer
  before this goes live with real funds, not just before it "feels big."
- **Reputational risk to $HOME.** If a token launched on HOMEPAD turns out
  to be a scam, that reflects on $HOME whether or not HOMEPAD's contracts
  behaved correctly. Consider whether launches need any curation/reporting
  path even though the contract itself is permissionless.

## Instant Liquidity Mode (Hook-based, since this session)

A second, separate launch path: `HomepadFactoryInstant.sol` +
`HomepadHook.sol`. Instead of a bonding curve that graduates into a DEX
pool once a threshold is met, **launch itself creates a real, immediately
swappable Uniswap v4 pool** — the token is tradeable (and visible on
Dexscreener) from the same block it's created in, the same way many
"instant liquidity" launch platforms work.

**Token split:** 8% of the fixed 1B supply goes straight to the $HOME
treasury wallet at launch. The remaining 92% is paired with whatever ETH
the creator sends in as the pool's starting liquidity — permanently
locked the same way the bonding curve version locks liquidity (no
withdraw function exists, full stop).

**Fees, kept identical to the bonding curve version:** this only works
because of `HomepadHook` — every pool created by this factory uses the
same hook, with the pool's own Uniswap fee set to 0%. On every swap, the
hook's `afterSwap` callback takes the entire fee cut itself (via V4's
"hook returns a delta" mechanism) and immediately splits it between the
token's creator and the $HOME treasury, live, the same 70/30-of-base-fee
+ 100%-of-extra-fee-to-creator math as `BondingCurveV4._routeFee`. Without
a hook, a real Uniswap pool's fees just accrue to whoever holds the LP
position (paid out only when someone actively "collects") — a hook is
the only way to keep the current pay-out-every-trade behavior while
still having a real pool from block one.

**Why a hook needs a mined address:** Uniswap v4 encodes which callbacks
a hook contract implements in specific bits of its own address, so it
can't be deployed with a plain `new` (whose address depends on deployer
nonce, not a chosen value). `Create2Deployer.sol` + the salt-mining loop
in `scripts/deploy-instant.js` (same algorithm as Uniswap's own official
`HookMiner.sol`, just run in JS instead of Solidity) find a salt that
makes `HomepadHook`'s CREATE2 address satisfy the `afterSwap` +
`afterSwapReturnDelta` permission bits before deploying it.

**Deploy order matters:** the hook needs to exist before the factory
(the factory's constructor takes the hook's address), but the hook also
needs to know the factory's address to restrict who can register a
pool's fee config — a circular dependency. `scripts/deploy-instant.js`
resolves this by deploying the hook first with an explicit `_admin`
address (not `msg.sender`, since it's deployed via `Create2Deployer` and
`msg.sender` in that constructor would be that helper contract, not the
real deployer), then the factory, then calling `hook.setFactory()` once
— permanently locked after that.

Tested against a real deployed `PoolManager`, using Uniswap's own
official `PoolSwapTest.sol` test helper to actually execute a swap and
confirm the fee lands in the creator's and $HOME's wallets immediately —
not just that the transaction didn't revert.

Deploy with:

```bash
npx hardhat run scripts/deploy-instant.js --network robinhoodTestnet
```

Same required env vars as `deploy-v4.js` (`HOME_TREASURY_ADDRESS`,
`PLATFORM_WALLET_ADDRESS`, `POOL_MANAGER_ADDRESS`), minus the pool fee
tier (always 0% here — see above for why).

**Not done yet:** the frontend still only knows how to trade against the
bonding curve path. Using this mode from the website needs a genuine
swap UI built against the Uniswap pool directly (or Robinhood Chain's
Universal Router) — buy/sell as currently built won't work against a
token launched this way.

## Uniswap V4 (the ETH-pair graduation path, since this session)

The ETH-paired factory now graduates into **Uniswap V4** instead of V2.
`HomepadFactoryV4` / `BondingCurveV4` replace `HomepadFactory` / `BondingCurve`
as the primary path — the older V2 contracts are still in the repo (and
still fully tested) as a reference, but new deploys should use the V4
versions.

What's actually different from V2:

- **No router call.** V4 has one shared `PoolManager` contract for every
  pool on the chain. Adding liquidity means calling `PoolManager.unlock()`,
  which calls back into `BondingCurveV4.unlockCallback()` — inside that
  callback, the pool is initialized (if it doesn't exist yet), liquidity is
  added via `modifyLiquidity()`, and both sides are "settled" (paid) using
  V4's flash-accounting model.
- **No LP token to burn.** A V4 position is an internal ledger entry keyed
  to whichever address called `modifyLiquidity` — here, the curve contract
  itself. Since the curve has no function that could ever call
  `modifyLiquidity` again with a negative delta, the liquidity is
  permanently locked by omission, the same practical guarantee the V2
  version got by burning an ERC-20 LP token, just without an extra step.
- **Full-range liquidity math**, computed with Uniswap's own
  `LiquidityAmounts` and `TickMath` libraries (`@uniswap/v4-periphery` /
  `@uniswap/v4-core`) rather than hand-rolled fixed-point math — this is
  exactly the kind of arithmetic that's dangerous to get wrong, so it uses
  the audited libraries directly instead of reimplementing them.

Tested against a **real deployed `PoolManager`**, not a mock — `PoolManager`
is a dependency-light, directly-deployable contract, so the test suite
deploys the actual thing and verifies graduation by checking the
`Graduated` event's liquidity amount and that `PoolManager`'s ETH balance
actually increased. If the settle math were wrong, V4 itself would revert
the transaction rather than let currency deltas fail to net to zero — so a
passing test here is a fairly strong signal, not just "it didn't throw."

Deploy with:

```bash
npx hardhat run scripts/deploy-v4.js --network robinhoodTestnet
```

Requires `POOL_MANAGER_ADDRESS` — Robinhood Chain's live Uniswap v4
`PoolManager` address, looked up fresh at deploy time, same rule as every
other external contract address in this project. **Confirmed testnet
address:** `0x552815eF68E6eb418A3d65D0AA1043d93204F612` (**confirmed
mainnet address:** `0x8366a39CC670B4001A1121B8F6A443A643e40951` — see
`.env.example`'s warning before using either one against the wrong
network) — see `.env.example` for the full set of testnet V4 addresses
Robinhood published (PositionManager, Universal Router, Permit2), none of
which this project currently uses besides PoolManager itself.

One current limitation worth knowing: `@uniswap/v4-periphery`'s
`PositionManager` (the NFT-position wrapper most frontends use) depends on
the `permit2` npm package, which has been unpublished from the npm
registry as of this session. `BondingCurveV4` avoids that entirely by
calling the core `PoolManager` directly instead of going through
`PositionManager` — which turned out fine for this use case (no NFT is
needed since the position is never meant to move), but is worth
remembering if a future feature genuinely needs `PositionManager` itself.

## Stock-paired mode

`StockHomepadFactory` + `StockBondingCurve` are the same permissionless-launch,
no-admin-key, burned-LP pattern as the ETH version — the only difference is
what backs the pool. Robinhood Stock Tokens (AAPL, TSLA, NVDA, and 20+ others)
are plain 18-decimal ERC-20s on Robinhood Chain — [confirmed in Robinhood's
own docs](https://docs.robinhood.com/chain/stock-tokens): "no special SDK
required." Pairing against one is just standard ERC20/ERC20 liquidity instead
of ETH liquidity.

Practical differences from the ETH curve:
- **Buying requires an `approve` first.** There's no native-currency
  shortcut — `quoteToken.approve(curveAddress, amount)`, then
  `curve.buy(amount, minTokensOut)`.
- **The allowlist of quote tokens is fixed at deploy time** (an array passed
  to the constructor) and can never be added to later — consistent with
  "no admin key, ever" everywhere else in this project. Supporting a newly
  added Stock Token later means deploying a new `StockHomepadFactory`, not
  upgrading this one.
- **Look up quote token addresses fresh, every time**, from
  [docs.robinhood.com/chain/contracts](https://docs.robinhood.com/chain/contracts)
  — that page is generated live from Robinhood's on-chain registry. Never
  reuse an address you saw once in an article or a tweet; verify it
  yourself before it goes anywhere near `scripts/deploy-stock.js`.

Deploy the same way as the ETH factory, with `STOCK_QUOTE_TOKENS` added to
`.env`:

```bash
npx hardhat run scripts/deploy-stock.js --network robinhoodTestnet
```

7 tests cover this mode (allowlist enforcement, buy + fee routing, and
graduation) — all passing as of this session, run alongside the ETH tests:

```
npx hardhat test --no-compile
  HOMEPAD
    ✔ launches a token + curve with the full fixed supply in the curve
    ✔ lets a buyer purchase tokens along the curve and routes the fee to $HOME treasury
    ✔ lets a seller exit and receive ETH net of fee
    ✔ graduates once the threshold is met and burns the LP
  HOMEPAD — Stock-Paired Mode
    ✔ only allows launching against an allowlisted quote token
    ✔ lets a buyer pay with the stock token (after approve) and routes the fee to $HOME
    ✔ graduates once the stock-quote threshold is met and burns the LP
```

## Not built yet

- Frontend (explore/create/token pages) — next step once the contracts feel
  solid
- Anti-snipe protection on the opening seconds of a curve (Pons and others
  have this; it's a known gap here)
- Any admin/pause mechanism — currently there is none by design, which is
  good for trust but means a discovered bug can't be paused, only migrated
  away from
