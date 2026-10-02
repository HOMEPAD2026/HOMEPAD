// tools/pump-kit/entry.mjs → vendor/pump-kit.js (window.ArcPumpKit): ArcPad × Pump.fun's Solana side.
// The pieces of @solana/web3.js, @solana/spl-token and the official @pump-fun/pump-sdk the launch page (arc-pump.js) uses,
// plus the three transactions it signs. Loaded only when Pump.fun is picked. Rebuild: see tools/pump-kit/README.md.
//
//   launchTxs   create_v2 (+ an optional first buy), then the 70 / 30 creator-fee split: create_fee_sharing_config and
//               update_fee_shares_v2 with [creator 70%, ARCIRCLE PAD 30%], which revokes the sharing config's admin —
//               the split is fixed for the life of the coin. One transaction when it fits, two otherwise.
//   splitTx     the split alone (a launch whose second transaction didn't land)
//   distributeTx  pays out a coin's waiting creator fees to the shareholders (permissionless); a graduated coin's
//               PumpSwap fees are swept into the curve's vault first
import { Connection, PublicKey, Keypair, Transaction, ComputeBudgetProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { Buffer } from "buffer";
import { PUMP_SDK, OnlinePumpSdk, getBuyTokenAmountFromSolAmount, feeSharingConfigPda, bondingCurvePda, canonicalPumpPoolPda, PUMP_PROGRAM_ID, PUMP_FEE_PROGRAM_ID } from "@pump-fun/pump-sdk";

const MAX_TX = 1232; // a legacy transaction's wire size limit
const budget = (units, microLamports) => [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports })];
function txOf(ixs, payer, blockhash) {
  const t = new Transaction();
  t.feePayer = payer; t.recentBlockhash = blockhash;
  t.add(...ixs);
  return t;
}
/// bytes on the wire once signed (unsigned slots count as 64 bytes each)
export function wireSize(t) {
  try { return t.serialize({ requireAllSignatures: false, verifySignatures: false }).length; } catch { return Infinity; }
}

async function splitIxs({ creator, mint, treasury, creatorBps, current = null, create = true }) {
  if (creator.equals(treasury)) throw new Error("the creator and the treasury are the same wallet");
  const ixs = [];
  // a config made earlier (its update didn't land): only the update — the curve's creator is the config by now
  if (create) ixs.push(await PUMP_SDK.createFeeSharingConfig({ creator, mint, pool: null }));
  ixs.push(await PUMP_SDK.updateFeeSharesV2({
    authority: creator, mint, currentShareholders: current || [creator],
    newShareholders: [{ address: creator, shareBps: creatorBps }, { address: treasury, shareBps: 10000 - creatorBps }],
    quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
  }));
  return ixs;
}

/// the first transaction that fits: with a compute-unit limit and a priority fee, with the fee alone, or bare
/// (create_v2 + a first buy with a 32-letter name sits right at the limit)
function fitted(ixs, payer, blockhash, units, cuPrice) {
  for (const pre of [budget(units, cuPrice), [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice })], []]) {
    const t = txOf([...pre, ...ixs], payer, blockhash);
    if (wireSize(t) <= MAX_TX) return t;
  }
  throw new Error("the launch doesn't fit in one Solana transaction — shorten the name or symbol");
}

/// → { txs: [Transaction…], tokens: BN, single: bool }
export async function launchTxs({ global, feeConfig, creator, mint, name, symbol, uri, devBuyLamports, treasury, creatorBps = 7000, blockhash, cuPrice = 150000 }) {
  const lam = new BN(String(devBuyLamports || 0));
  let create, tokens = new BN(0);
  if (lam.gtn(0)) {
    tokens = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: lam, quoteMint: NATIVE_MINT });
    create = await PUMP_SDK.createV2AndBuyInstructions({ global, mint, name, symbol, uri, creator, user: creator, amount: tokens, solAmount: lam, mayhemMode: false });
  } else {
    create = [await PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator, user: creator, mayhemMode: false })];
  }
  const split = await splitIxs({ creator, mint, treasury, creatorBps });
  // one transaction when it fits: the coin and its split land together or not at all
  const one = txOf([...budget(lam.gtn(0) ? 500000 : 400000, cuPrice), ...create, ...split], creator, blockhash);
  if (wireSize(one) <= MAX_TX) return { txs: [one], tokens, single: true };
  return {
    txs: [fitted(create, creator, blockhash, lam.gtn(0) ? 350000 : 250000, cuPrice), fitted(split, creator, blockhash, 250000, cuPrice)],
    tokens, single: false,
  };
}
/// the split alone; with `sharingConfig` (decoded, not yet locked) only its update, from its current shareholders
export async function splitTx({ creator, mint, treasury, creatorBps = 7000, blockhash, cuPrice = 150000, sharingConfig = null }) {
  const current = sharingConfig ? sharingConfig.shareholders.map((s) => s.address) : null;
  return txOf([...budget(250000, cuPrice), ...(await splitIxs({ creator, mint, treasury, creatorBps, current, create: !sharingConfig }))], creator, blockhash);
}
export async function distributeTx({ payer, mint, sharingConfig, graduated, blockhash, cuPrice = 100000 }) {
  const ixs = [];
  if (graduated) ixs.push(await PUMP_SDK.transferCreatorFeesToPumpV2({ payer, mint, quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID }));
  ixs.push(await PUMP_SDK.distributeCreatorFeesV2({ mint, sharingConfig, sharingConfigAddress: feeSharingConfigPda(mint), quoteMint: NATIVE_MINT, payer, shouldInitializeAta: false, quoteTokenProgram: TOKEN_PROGRAM_ID }));
  return txOf([...budget(200000, cuPrice), ...ixs], payer, blockhash);
}

const kit = {
  Buffer, Connection, PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL, NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, BN,
  PUMP_SDK, OnlinePumpSdk, feeSharingConfigPda, bondingCurvePda, canonicalPumpPoolPda, PUMP_PROGRAM_ID, PUMP_FEE_PROGRAM_ID,
  launchTxs, splitTx, distributeTx, wireSize, v: "pump-sdk 2.0.0",
};
if (typeof window !== "undefined") window.ArcPumpKit = kit;
else globalThis.ArcPumpKit = kit;
