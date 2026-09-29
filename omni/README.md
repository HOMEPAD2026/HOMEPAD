# ARCIRCLE OMNI — $ARCIRCLE on Arc ♾ Robinhood Chain ♾ Solana

> **Phase 1 = Arc ⇄ Robinhood Chain.** Step-by-step (Korean): [`ROBINHOOD.md`](ROBINHOOD.md). `layerzero.config.ts` wires only
> Arc ⇄ Robinhood with DVN / library / executor addresses **pinned per chain** (on Arc the name "LayerZero Labs" also matches a
> deprecated DVN); Solana joins with `OMNI_SOLANA=1` — pin its addresses the same way before phase 2.
> Tooling: ethers v5 + `@nomiclabs/hardhat-ethers` (what LayerZero's toolbox runs on) — `npm install --legacy-peer-deps`,
> `npx hardhat test` (10 passing), `npx hardhat omni:check` before and after wiring.

One token, one supply, three chains. $ARCIRCLE keeps its Arc contract
(`0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7`, 1,000,000,000 fixed) as the **canonical** token. The other chains get
LayerZero V2 OFTs whose supply can only come from Arc:

```
                  Arc (chain 5042 · eid 30417)
          ┌──────────────────────────────────────┐
          │ $ARCIRCLE ERC-20 (Argus, unchanged)   │
          │        ▲ lock        │ unlock         │
          │ ArcircleOFTAdapter  (the lockbox)     │
          └───────┬───────────────────────┬──────┘
       LayerZero V2 (2 DVNs)       LayerZero V2 (2 DVNs)
          ┌───────┴────────┐  ◀──────▶  ┌───────┴────────┐
          │ Robinhood Chain │  mesh     │ Solana          │
          │ eid 30416       │           │ eid 30168       │
          │ ArcircleOFT     │           │ OFT program +   │
          │ mint / burn     │           │ SPL mint (6 dp) │
          └─────────────────┘           └─────────────────┘

   invariant:  ARCIRCLE.balanceOf(adapter)  ==  supply(Robinhood) + supply(Solana)   (+ messages in flight)
   global supply = 1,000,000,000, always — nothing outside Arc can mint without a matching lock or burn
```

- **Arc → Solana / Robinhood**: the user approves the adapter, calls `send`; the adapter **locks** the tokens, a
  LayerZero message is verified by the DVNs, the destination **mints** the same amount.
- **Solana / Robinhood → Arc**: the OFT **burns** on the source, the adapter **unlocks** on Arc.
- **Robinhood ⇄ Solana** directly: burn on one, mint on the other; Arc's lockbox doesn't change, the sum still holds.

LayerZero documents this exact shape: one `OFTAdapter` (lock/unlock) for a token that already exists, and plain
mint/burn OFTs everywhere else — with the rule that **only one adapter may exist in the whole mesh**, and that
**fee-on-transfer and rebasing tokens are not supported**.

## What we checked about $ARCIRCLE itself

| Check | Result | Meaning for OMNI |
|---|---|---|
| Contract | `ArgusV5RewardedToken`, verified on ArcScan, not a proxy | The token won't change under us |
| Supply | 1,000,000,000 fixed, 18 decimals, no mint | The Arc token *is* the global supply |
| Owner powers | No pause, blacklist, max-wallet or trading switch. A `portal` (Argus) can `exclude` addresses from rewards and bind the hook | Nothing can block the adapter from holding or moving tokens |
| Transfer fee | None on transfers — the buy/sell tax is taken by the Argus Uniswap v4 hook on swaps. Wallet-to-wallet hops keep the exact amount (checked on recent transfers) | Lossless transfers, so the standard adapter works. We still check every lock (`NotLossless`) |
| Holder rewards | Holders accrue USDC rewards by balance (`pendingOf`, paid by the hook via `consumeClaim`). Excluded addresses don't count | **The lockbox would earn rewards on everything bridged.** Policy below |

### Argus rewards held by the lockbox — NOT DECIDED

The adapter holds every bridged $ARCIRCLE, so by default it earns the Arc holder rewards for that share while
the people holding it on Solana/Robinhood don't. Options:

1. **Exclude the adapter** — ask Argus to call `exclude(adapter)` (only their portal can). Bridged tokens then earn
   nothing on Arc and the rewards go to the remaining Arc holders. Simplest, fully on-chain, no custody.
2. **Collect and route** — keep it eligible; the multisig calls `collectRewards(hook, claimCalldata)` (it can
   never touch the locked $ARCIRCLE — enforced in the contract and tested) and `sweep(USDC)` to a rewards wallet,
   then uses it for $ARCIRCLE buybacks or pays it to Solana/Robinhood holders. More value, more operations.
3. Leave it unclaimed — not recommended.

The contract supports 1 and 2; which one is a team decision to publish before launch.

## Contracts (this folder)

| File | Chain | Role |
|---|---|---|
| `contracts/ArcircleOFTAdapter.sol` | Arc | LayerZero `OFTAdapter` for the existing token + lossless check + pause/guardian + per-destination rate limits + reward collection that can't touch the lockbox |
| `contracts/ArcircleOFT.sol` | Robinhood Chain (and any later EVM chain) | LayerZero `OFT`, **mints nothing at deploy**, + pause/guardian/rate limits |
| `contracts/OmniControls.sol` | both | pause (owner or guardian), unpause (owner only), `setRateLimits` |
| Solana | Solana | LayerZero's OFT program (your own deployment) + a new SPL mint, `--only-oft-store true`, no premint — `solana/README.md` |

`test/omni.test.js` runs all of it against LayerZero's `EndpointV2Mock` (Arc lockbox ↔ Robinhood OFT ↔ a third OFT
standing in for Solana): 1:1 lock/mint, the three-chain invariant at every step, dust handling, rate limits that
fail closed, pause/guardian rights, a fee-on-transfer token refused, rewards collected without touching the
lockbox (including a contract that tries to pull tokens), and a non-peer that can't mint. **10/10 passing** with
solc 0.8.26 / Cancun (same target as the ArcPad contracts already on Arc).

## Security stack (set explicitly — never rely on defaults)

- **DVNs**: 2 required on every pathway — LayerZero Labs + one more independent operator that LayerZero lists on
  Arc, Robinhood and Solana. The second one is **not decided** (`OMNI_SECOND_DVN`); `layerzero.config.ts` refuses
  to wire without it, because 1-of-1 lets a single operator forge messages.
- **Confirmations**: set on both sides of each pathway (proposal: Arc 5, Robinhood 20, Solana 32 — review).
- **Enforced options**: 80k gas for EVM receives; 200k CU + 2,500,000 lamports on Solana (creates the
  recipient's token account).
- **Rate limits**: per destination per 24h, on every chain. They **fail closed** — no limit set means nothing can
  go there. Proposal: 50,000,000 (5% of supply) per day per pathway — not decided.
- **Pause**: the guardian (a monitoring bot or a 1-of-N Safe) can pause any chain; only the owner multisig
  unpauses. Messages that arrive while paused wait at the endpoint and are retried later.
- **Ownership**: deploy with a fresh key, then `scripts/handover.ts` moves owner **and** LayerZero delegate to the
  multisig on each EVM chain; on Solana the OFT Store admin, delegate and program upgrade authority go to a
  Squads multisig. The exposed `0x80e1…8bc7` key must not be used for anything here.
- **Monitoring**: `npx hardhat omni:supply` (and the OMNI page) compares locked vs remote supply; remote > locked
  means something minted without a lock → pause everything.
- **Audit**: the contracts are thin wrappers on LayerZero's audited OFT code, but the adapter holds real value —
  get an external review before mainnet funds move.

## Liquidity, prices and arbitrage

Bridging only moves tokens; each chain needs its own market:

| Chain | Market | Status |
|---|---|---|
| Arc | Argus Uniswap v4 pool (live) | live |
| Robinhood Chain | a DEX pool ARCIRCLE/ETH or /USDG | venue **not decided** |
| Solana | Raydium / Meteora / Orca pool ARCIRCLE/SOL or /USDC | venue **not decided** |

Seed liquidity has to be real $ARCIRCLE bridged from Arc plus the quote asset (there is no team allocation to
draw from) — source and size **not decided**.

When prices differ, anyone can buy on the cheap chain, bridge, and sell on the expensive one; that trade pulls
the prices together. It only pays when the spread beats the pool fees + Argus tax + LayerZero fee + the minutes a
bridge takes, so a small spread (the 1–3% range) is normal. The OMNI page shows each chain's price and
`spread = (highest − lowest) / lowest`. ARCIRCLE PAD shows it; it doesn't run the arbitrage.

## Fees users pay

A LayerZero message fee in the source chain's gas token (USDC on Arc, ETH on Robinhood Chain, SOL on Solana),
quoted by `quoteSend` before they sign. No ARCIRCLE PAD fee is added in v1 (not decided).

## Runbook

1. `cp .env.example .env` and fill it in yourself (fresh deployer key, `OMNI_OWNER` multisig on each chain).
2. `npm install && npx hardhat test`
3. Arc: `npx hardhat lz:deploy --networks arc --tags ArcircleOFTAdapter`
4. Robinhood: `npx hardhat lz:deploy --networks robinhood --tags ArcircleOFT`
5. Solana: `solana/README.md` steps 1–2 (own OFT program, mint with **no premint**)
6. Pick the second DVN, review confirmations, then `npx hardhat lz:oapp:wire --oapp-config layerzero.config.ts`
7. `npx hardhat run scripts/handover.ts --network arc` and `--network robinhood` (rate limits, guardian, rewards
   wallet, owner + delegate → multisig); Solana hand-over per `solana/README.md`
8. Send 1 ARCIRCLE around the triangle, then `npx hardhat omni:supply` → `OK`
9. Fill `CONFIG.OMNI` in `config-arc.js` (adapter, Robinhood OFT, Solana mint/OFT store) — the OMNI page switches
   from preview to live for the chains that have an address
10. Seed pools, publish the rewards policy, announce.

## Not decided (listed so nobody assumes)

Second DVN · confirmations · daily limits · rewards policy (exclude vs collect) · Robinhood and Solana pool venues ·
seed liquidity source and size · any bridge fee · launch date.
