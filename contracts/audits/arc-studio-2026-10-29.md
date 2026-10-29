# Arc Studio security audit — 2026-10-29

| | |
|---|---|
| Date | 2026-10-29 |
| Tool | Arc Studio (`@circle-fin/arc-studio-cli`), `arc-studio run` |
| Rigor | balanced |
| Arc Studio session | `crimson-audit` — app `4f2ec0cc-8e7e-44f0-92b6-1e4b26e01961`, thread `7a50b058-44fe-4470-ad9c-d3d7276f06ae`, sandbox `izkp4hs9xryn9wco4aujj` |
| Result status | `completed`, no deployments, no transactions |
| Inputs (reference, read-only `--file`) | `contracts/contracts/CrimsonMarket.sol`, `contracts/contracts/CrimsonCelestialNFT.sol`, `contracts/contracts/AgentDimension.sol`, `contracts/test/crimson-market.test.js`, `contracts/test/crimson-celestial-nft.test.js`, `contracts/test/agent-dimension.test.js` |

Everything below is what Arc Studio returned (its result `finalText` and the
report it wrote in its sandbox at `docs/security-review.md`). No findings were
added or changed in this document. Fixes are condensed; the code snippets are
Arc Studio's.

## Method and limits (Arc Studio, verbatim)

> Manual line-by-line review of all three contracts and their tests, plus two automated review passes. The Uniswap v4 dependency and a Solidity 0.8.26 toolchain were not available in the sandbox, so AgentDimension could not be compiled and the tests were read, not run. Deployed bytecode and constructor arguments on Arc were not compared with this source. Line numbers refer to the provided files. The two deployed contracts are not upgradeable, so "fix" for them means either an operational mitigation or a redeploy.

## Severity counts

| Contract | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| CrimsonMarket (deployed `0xE0f065334A1CD845f7ebf93EcaB1f8c80A04Cd19`) | 0 | 0 | 1 | 3 | 5 |
| CrimsonCelestialNFT (deployed `0x709E1B65c529567Fbe1C79dE278c2ABbA0086ff5`) | 0 | 0 | 1 | 3 | 4 |
| AgentDimension (not deployed) | 0 | 1 | 3 | 5 | 5 |

---

## 1. CrimsonMarket.sol

| ID | Severity | Title | Lines | Fix |
|---|---|---|---|---|
| CM-1 | Medium | Stale listing survives the piece leaving and coming back (A→B→A, or `toGame` then GM re-mint with new `plus`/`stars`); old listing sells at the old price | 54-60, 72-82 | New market: store a snapshot in the listing (`bytes32 stamp = keccak256(abi.encode(nft.pieceOf(tokenId)))`, checked in `buy`), or a per-token epoch incremented in the NFT's `_update`. Live contract: sellers/UI `cancel` before `toGame` or any transfer and revoke approvals; backend cancels the seller's listings before issuing a re-mint voucher. |
| CM-2 | Low | Third parties cannot clear a listing whose token was burned (`ownerOf` reverts with `ERC721NonexistentToken`) | 63-69 | `_holder()` helper using `try nft.ownerOf(id)`; in `cancel`: `if (msg.sender != l.seller && _holder(tokenId) == l.seller) revert NotHolder();` |
| CM-3 | Low | One USDC-blacklisted payee (`feeTo` or seller) can block sales | 80-81 | Keep `feeTo` a plain, monitored address, or accrue fees in the contract with a pull-based `claim()`. |
| CM-4 | Low | Fee changes take effect immediately, up to 10% | 87-92 | Delay fee increases (queue + apply), or store fee at `list` time and charge the minimum of the two at sale. |
| CM-5 | Info | `Ownable` allows `renounceOwnership` and single-step transfer | — | Use `Ownable2Step` and disable renounce in a redeploy. |
| CM-6 | Info | Escrow-less: seller can front-run a buy; buyer only loses gas | — | Acceptable; UI should say so. |
| CM-7 | Info | `MIN_PRICE`/`MAX_PRICE` assume 6-decimal USDC; constructor doesn't check | — | Check `decimals() == 6` in a redeploy; confirm deployed `usdc` is the Arc ERC-20 USDC address. |
| CM-8 | Info | `list`/`cancel` not `nonReentrant` | — | Safe today because `buy` deletes the listing before external calls; relies on that ordering. |
| CM-9 | Info | No royalty / creator fee support | — | Design choice, noted only. |

> **Summary (CrimsonMarket):** no funds-at-risk bug. The listing, payment, and transfer order is sound, `maxPrice` protects buyers from re-pricing, and the fee is capped at 10 percent. The main weakness is that listings are not bound to a specific incarnation of a piece (CM-1), which matters because the NFT re-mints the same tokenId. Deployed as is, handle CM-1 and CM-2 operationally.

---

## 2. CrimsonCelestialNFT.sol

| ID | Severity | Title | Lines | Fix |
|---|---|---|---|---|
| CC-1 | Medium | No way to stop minting immediately if the voucher signer key is compromised (only a 24h rotation; pending proposal can't be cancelled) | 22-26, 77-78 | Add `disableSigner()` (sets `signer`/`pendingSigner` to zero) and `cancelSigner()`; owner on a multisig separate from the signer. Live contract: game stops honoring newly minted pieces during the 24h rotation. |
| CC-2 | Low | Event order can be inverted for contract recipients (`Returned` before `Minted` via `onERC721Received` → `toGame`) | 57-60 | Emit `Minted` before `_safeMint`, or use `_mint`. Live contract: indexer orders by state (`ownerOf`), not event order. |
| CC-3 | Low | Multiple valid vouchers for one tokenId; holder picks which to redeem | 52-61 | One voucher per piece at a time with short deadlines; optionally sign a per-token `mintEpoch`/min nonce: `require(v.nonce > lastNonce[v.tokenId])`. |
| CC-4 | Low | Mutable metadata base URI, no freeze or delay | 79 | Add irreversible `freezeBaseURI()`, or put changes behind the signer delay. |
| CC-5 | Info | `toGame` reverts with `ERC721NonexistentToken` rather than `NotHolder`; approved operator can't return a piece | — | Behavior fine; inconsistent error only. |
| CC-6 | Info | Same `Ownable` notes as CM-5; renounce would freeze signer rotation | — | `Ownable2Step`, block `renounceOwnership`. |
| CC-7 | Info | Wrong `to` in a voucher mints permanently to the wrong wallet; no max deadline | — | Validate server-side before signing; keep deadlines short. |
| CC-8 | Info | Signature handling is correct (EIP-712 domain, non-malleable recover, nonce consumed before mint); signer must be an EOA | — | None. |

> **Summary (CrimsonCelestialNFT):** the voucher mint is correctly built (replay and cross-chain safe, nonce consumed before interaction, existing tokenIds cannot be overwritten because `_safeMint` reverts). The real risk is operational: the signer key can mint arbitrary pieces and cannot be disabled quickly (CC-1), and the game must treat the chain as the source of truth for ordering (CC-2, CC-3).

---

## 3. AgentDimension.sol (fix before deploying)

| ID | Severity | Title | Lines | Fix |
|---|---|---|---|---|
| AD-1 | High | Sell trades not bounded by per-trade/daily limit (cap checks USDC received), operator controls slippage (`minOut = 1` accepted, full-range price limit) — a compromised operator can dump the vault's token balance | 137-164, 190-198 | Owner-set `maxSellPerTx[token]` and `minPriceX18[token]` (and/or `maxSlippageBps`); revert `OverMaxSell` / `BelowFloor`; loosening via `LOOSEN_DELAY`. Owner-set floor preferred over spot-price check (manipulable in-tx). |
| AD-2 | Medium | `tradeFee` has no upper bound; after the 24h delay one trade can move the whole `$ARCIRCLE` balance to `feeTo` | factory 374-386; vault 146-151 | `MAX_TRADE_FEE` constant checked in `setTradeFee` and constructor; per-vault owner `maxFee` enforced in `trade`. |
| AD-3 | Medium | Hook allowlist by address bit pattern trusts any CREATE2-mined address with those bits (defaults `0x2044`, `0x20cc` include return-delta flags) | factory 259, 315-316, 344 | Allow hooks by explicit address only (`hookAllowed`), or require pattern match **and** explicit address. |
| AD-4 | Medium | No `deadline` on `trade`; signed operator tx can execute later at a very different price | 137-143 | Add `uint256 deadline` and `if (block.timestamp > deadline) revert Expired();`; combine with AD-1 floor. |
| AD-5 | Low | Single-step ownership transfer on vault and factory; `vaultOf` not updated on `setOwner` | vault 238, factory 393 | Propose/accept ownership; keep `vaultOf` informational or update via factory callback. |
| AD-6 | Low | Queued operator cannot be cancelled; queued operator/fee can be applied by anyone at any later time | factory 358-372 | Add `cancelOperator()`; consider expiry on queued operator/fee. |
| AD-7 | Low | State (cooldown, daily volume, `lastTradeAt`) updated after the external swap | vault 152-163 | Move effects before `poolManager.unlock` or add `nonReentrant` (hardening; v4 blocks nested unlock today). |
| AD-8 | Low | Mixed limit changes are all delayed, including the tightening parts | vault 213-224 | Apply tightened fields immediately; queue only loosened fields. |
| AD-9 | Low | Operator/team can generate fees through tiny (1 wei) trades, limited only by 60s cooldown | — | Bounded by AD-2's fix and owner `maxFee`. |
| AD-10 | Info | Factory embeds vault creation code; size risk | — | Check `forge build --sizes` < 24,576 bytes before deploying on Arc. |
| AD-11 | Info | Requires a v4 `PoolManager` on target chain and `@uniswap/v4-core` with `types/PoolOperation.sol`; constructor addresses/decimals unchecked | — | Verify against the Arc registry at deploy time; no placeholder fee recipient. |
| AD-12 | Info | Daily cap resets at UTC midnight (up to 2× `dailyCap` across the boundary) | — | Documented behavior. |
| AD-13 | Info | `disallowToken` on never-allowed token emits `TokenAllowed` with empty pool id; fee-on-transfer/rebasing tokens make `settle` revert | — | Harmless / denial of that token only. |
| AD-14 | Info | Factory owner can pause every vault and rotate the operator for all agent-enabled vaults | — | Multisig factory owner, distinct operator key, disclose in UI. Withdrawals are never blocked (correct). |

> **Summary (AgentDimension):** the vault's custody model is good (funds only leave to the owner, withdrawals are never blocked, loosening is delayed, buys are capped). The blocking issue before deployment is AD-1: the per-trade and daily limits do not bound what a sell gives up, and slippage is operator controlled. Fix AD-1, AD-2 and AD-3 and add the AD-4 deadline before deploying, then compile and run the tests with the v4 dependency installed.

## Arc Studio audit provenance

| Subagent | Dispatched | Files audited | Corpus rules cited |
|---|---|---|---|
| solidity-auditor | yes | 17 | none |
| functional-auditor | yes | 12 | — |

---

## Mitigations applied in ARCIRCLE WORLD (2026-10-29, without redeploying)

The two deployed contracts aren't upgradeable, so the game's server and client carry the operational fixes Arc Studio
named. The contracts' own changes wait for a redeploy (and AgentDimension's fixes for a re-audit in an Arc Studio session).

| ID | What the game does now | Where |
|---|---|---|
| CM-1 | Returning a piece to the game drops its listing from the game's market index; a listing older than the token's latest mint, or by anyone but the piece's holder, isn't shown; the set window cancels the holder's own listing on Arc before `toGame` | api/_world-mythic.mjs nftBack / nftMkt, world-mythic.js nftBack |
| CC-3 | A voucher is good for one day at most (was seven; CC.NFT.DEADLINE_S); a piece with a signed voucher that hasn't run out can't be cancelled back into the game | world-mythic-data.js, api/_world-mythic.mjs nftAdmin / nftCancel |
| CC-2 | Already handled: the server moves pieces by the receipts' logs and `ownerOf`, not by event order | api/_world-mythic.mjs |
| CM-3 | `feeTo` is the treasury, a plain wallet | — |

Tests: tests/world/mythic.test.mjs (the 3-day voucher refused, cancel refused while a voucher is live, the stale listing hidden).
