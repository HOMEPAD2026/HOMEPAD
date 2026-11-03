# Arc Studio security audit — 2026-11-03 (NOT RUN — pending)

| | |
|---|---|
| Date | 2026-11-03 |
| Tool | Arc Studio (`@circle-fin/arc-studio-cli` 1.2.2, `arc-studio run`) |
| Rigor | — |
| Arc Studio session | **none — Arc Studio was not run** |
| Result status | `pending` |
| Inputs (to send, read-only `--file`) | `contracts/contracts/AgentDimension.sol`, `contracts/contracts/CrimsonBids.sol`, `contracts/contracts/mocks/BidsMocks.sol`, `contracts/test/agent-dimension.test.js`, `contracts/test/crimson-bids.test.js`, `contracts/audits/arc-studio-2026-10-29.md` (for the AD-1 … AD-14 re-check) |

## Why there is no session

studio.arc.io answered (HTTP 200) and `ARC_STUDIO_TOKEN` is set in this session's environment, but installing and
running the `@circle-fin/arc-studio-cli` package was refused by the session's permission policy (running code
downloaded from npm needs the owner's approval). So **Arc Studio has not reviewed either contract below**, and no
findings, counts or session id are recorded here. Nothing in this file is Arc Studio's output.

To run it: allow the CLI in this environment (or run it from a worker session where it's allowed) and send the inputs
above with the prompt "Re-audit AgentDimension against findings AD-1 … AD-14 of the attached 2026-10-29 report, and audit
the new CrimsonBids escrow (balanced rigor; no deployments, no transactions)". Then fill in the tables below in the
10-29 report's format, fix any Critical / High, re-run, and replace "pending" in contracts/README.md and in both
contracts' header comments with the session id.

## Severity counts

| Contract | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| AgentDimension (not deployed) — re-audit of the AD-1 … AD-14 fixes | pending | pending | pending | pending | pending |
| CrimsonBids (new, not deployed) | pending | pending | pending | pending | pending |

---

## 1. AgentDimension.sol — what changed for the 2026-10-29 findings (to be checked by Arc Studio)

This is the change list for the re-audit, written by the developer, **not** an audit result.

| ID (10-29) | Change | Test (contracts/test/agent-dimension.test.js) |
|---|---|---|
| AD-1 High | Owner-set `maxSellPerTx[token]` (token units) and `minPriceX18[token]` (USDC units per token unit × 1e18) per vault; a sell over the amount reverts `OverMaxSell`, one that brings less than `amountIn × floor` (rounded up) reverts `BelowFloor` — whatever `minOut` the operator passes. No floor set = the agent can't sell that token. `setSellLimits`: tighter parts at once, looser parts queued for `LOOSEN_DELAY`, `applySellLimits` / `cancelSellPending`. | "AD-1 …", "a sell …" |
| AD-2 Medium | `MAX_TRADE_FEE` = 1,000 $ARCIRCLE checked in the factory's constructor and `setTradeFee` (`BadFee`); each vault has an owner-set `maxFee` (starts at the fee when the vault was opened, ≤ `MAX_TRADE_FEE`), `trade` reverts `FeeTooHigh` above it. | "AD-2 …" |
| AD-3 Medium | The hook bit-pattern allowlist (`hookPattern`, `setHookPattern`, `HOOK_MASK`) is gone; a hooked pool lists only if `hookAllowed[hook]`. | "AD-3 …", "the team lists only …" |
| AD-4 Medium | `trade(token, buy, amountIn, minOut, deadline)`; `block.timestamp > deadline` reverts `Expired()`. The game's executor (api/_world-agentvault.mjs) sends now + 300 s. | "AD-4 …"; tests/world/agentvault.test.mjs |
| AD-5 Low | Two-step ownership on vault and factory (`transferOwnership` → `acceptOwnership`; `setOwner` removed). A vault's accept tells the factory (`ownerMoved`, vaults only), so `vaultOf` follows. | "AD-5 …" |
| AD-6 Low | `cancelOperator()`, `cancelFee()`; a queued operator / fee not applied within `GRACE` (7 days) after it's ready reverts `Stale()`. | "AD-6 …" |
| AD-7 Low | `trade` is `nonReentrant` (OZ `ReentrancyGuardTransient`); cooldown, trade count, fee total and a buy's volume are written before the fee transfer and the swap (a sell's volume depends on its output and is counted after, under the guard). | "AD-7 …" |
| AD-8 Low | `setLimits` applies each tighter field at once and queues the full set only if some field is looser; a later call replaces the queue. | "AD-8 …", "limits: tighter now …" |
| AD-9 Low | Bounded by AD-2 (cap + per-vault `maxFee`). | — |
| AD-10 Info | Factory runtime 17,163 bytes, init code 17,896 bytes (limit 24,576 / 49,152), hardhat, solc 0.8.26, viaIR, 200 runs. | "the factory … stays under the 24,576-byte limit" |
| AD-11 Info | Unchanged; the deploy script checks code at the PoolManager / USDC / $ARCIRCLE addresses. | — |
| AD-12 Info | Unchanged (UTC-day cap, documented). | — |
| AD-13 Info | `disallowToken` on a token that isn't allowed reverts `NotAllowed`. | "AD-13 …" |
| AD-14 Info | Unchanged: the factory owner can pause all vaults and rotate the operator (24 h); withdrawals are never blocked. | "money out only to the owner …" |

Custody model unchanged: funds leave a vault only through `withdraw`, only to its owner, at any time, paused or not.

Note for the game: with AD-1 a vault's agent can't sell a token until its owner sets `setSellLimits` for it (and an hour
passes). The game's vault tab needs a control for that before take-profit / stop-loss rules can sell.

## 2. CrimsonBids.sol — design summary for the audit (not an audit result)

Escrowed USDC offers for CrimsonCelestialNFT tokens. `bid` / `cancelBid` / `clearExpired` / `accept` / `claimFees` are
`nonReentrant`, SafeERC20 throughout. `totalEscrow` and `feesAccrued` are counted apart; the contract holds exactly
their sum (tested). No function sends escrow anywhere but back to its bidder or, on `accept`, to the piece's holder;
the owner can only change the fee (≤ 10 %) and `feeTo`, through `Ownable2Step`, and can't renounce. An offer is tied
to the piece's `pieceOf` (kind / src / + / stars) when it's made, so a piece re-minted differently after `toGame` can't
be sold on an old offer (10-29's CM-1 lesson). `minProceeds` is the holder's net after the fee (CM-4's lesson). Fees
are pulled to `feeTo` with `claimFees`, so a blocked `feeTo` can't stop sales (CM-3's lesson). Size: 5,816 bytes.

Open points to put to Arc Studio: `liveBids` loops over every offer for a token (a view; spam costs ≥ 1 USDC of
escrow each); an NFT holder that is a contract must call `accept` itself; a bidder contract that can't receive
ERC-721 makes `accept` fail for that offer only.

## Tests run (hardhat, 2026-11-03)

- `npx hardhat test test/agent-dimension.test.js` — 21 passing, 0 failing
- `npx hardhat test test/crimson-bids.test.js` — 8 passing, 0 failing
- `node tests/world/agentvault.test.mjs` (the game's executor against the new `trade` signature) — 37 passed, 0 failed
