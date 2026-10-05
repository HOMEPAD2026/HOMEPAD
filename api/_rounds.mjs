// api/_rounds.mjs — CirclePad round after round, served through /api/social:
//   · the list of rounds: Round #1 is ESCROW (api/_round.mjs); every later round is a fresh BigPadEscrow the
//     round wallet deploys from /circle ("Start Round #N", circlepad-rounds.js) and registers here by its
//     deploy transaction. A round is only listed when that transaction came from Round #1's recipient
//     wallet, carries exactly the BigPadEscrow creation code (ESCROW_CODE_HASH) and pays the same
//     recipient / platform / treasury wallets — so the page can't be pointed at any other contract.
//   · the launch process: steps 1–3 (raise, burn-to-vote, close & split) follow the contracts; steps 4
//     (top contributor paid) and 5 (launch & airdrop) are the team's, so the round wallet marks them done
//     with a signed message, optionally with a proof link. Nothing here moves funds.
//   · a round's summary (Projects → the round's card) and its leaderboard as CSV.
import { ethCalls, rpcCall, isAddr, wAddr, keccakHex } from "./_arc.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { ESCROW, VOTE, S, big, roundState, forgetRound } from "./_round.mjs";
import { leaderboard } from "./_circle.mjs";
import { ballotReport, forRound } from "./_burnvote.mjs";
import { prices } from "./_fx.mjs";

// keccak256 of circlepad-escrow-code.js's CP_ESCROW_CODE (BigPadEscrow creation code, solc 0.8.26 / 200 runs / viaIR / cancun)
export const ESCROW_CODE_HASH = "0xf4691a923fed8a3b40db2cd952a065d72b0a7385432fd7053d8fd1a2daaca57a";
export const ESCROW_CODE_BYTES = 3577;
const FUNDING = 72 * 3600;
// Round numbers that never get an escrow of their own: Round #4 was merged into Round #3 (5 Oct 2026) — ARCIRCLE's move
// to Solana, run by the team with ARCIRCLE Orders — so the round after #3 is #5. Keep config-arc.js
// CIRCLEPAD_SKIPPED the same.
export const SKIPPED = { 4: 3 };
export const nextRoundN = (n) => { let k = Number(n) + 1; while (SKIPPED[k]) k++; return k; };
const REG = "circleRounds/main";
const STEPS = ["top", "launch"]; // the team's steps, in order: 4 = top contributor paid, 5 = launch & airdrop
const lc = (a) => String(a || "").toLowerCase();
let skew = 0; // tests only (a local chain whose clock was moved)
const now = () => Math.floor(Date.now() / 1000) + skew;

// ---- storage: Firestore in production; tests swap in a plain object ----
let testStore = null;
const store = {
  enabled: () => !!testStore || storeEnabled(),
  get: async (k) => (testStore ? testStore.get(k) : (await getDocs([k]))[k]),
  set: (k, d) => (testStore ? testStore.set(k, d) : setDoc(k, d)),
};

let regMem = null;
async function registry(fresh = false) {
  if (!fresh && regMem && Date.now() - regMem.at < 20e3) return regMem.v;
  let d = null;
  if (store.enabled()) { try { d = await store.get(REG); } catch { d = regMem ? regMem.v : null; } }
  const v = { list: Array.isArray(d && d.list) ? d.list.filter((r) => r && isAddr(r.escrow)) : [] };
  regMem = { at: Date.now(), v };
  return v;
}
async function saveRegistry(v) { await store.set(REG, v); regMem = { at: Date.now(), v }; }

/// Every round, oldest first: [{ n, escrow, tx, started }]. Round #1 is always there.
export async function rounds(fresh = false) {
  const reg = await registry(fresh);
  return [{ n: 1, escrow: ESCROW, tx: null, started: true }, ...reg.list.map((r) => ({ n: r.n, escrow: lc(r.escrow), tx: r.tx || null, started: !!r.started }))];
}
export async function roundByN(n) {
  n = Number(n || 1);
  return (await rounds()).find((r) => r.n === n) || null;
}

// ---- wallets fixed in an escrow ----
const walletsMem = new Map();
export async function walletsOf(escrow) {
  escrow = lc(escrow);
  if (walletsMem.has(escrow)) return walletsMem.get(escrow);
  const r = await ethCalls(["recipient", "platformWallet", "treasuryWallet", "cap"].map((k) => ({ to: escrow, data: S[k] })));
  if (r.slice(0, 3).some((x) => x == null)) throw new Error("escrow wallets unreadable");
  const v = { recipient: lc(wAddr(r[0], 0)), platform: lc(wAddr(r[1], 0)), treasury: lc(wAddr(r[2], 0)), cap: big(r[3]).toString() };
  walletsMem.set(escrow, v);
  return v;
}

// ---- the launch process ----
// Round #1 is settled: step 4 was this round's exception (the team settled it, so it counts as done) and
// step 5 is $ARCIA's launch on Argus. These marks are fixed: the round wallet can't undo or re-mark them.
// That Arc $ARCIA was retired on 5 Oct 2026 (not official any more), so step 5's proof is the delivery to the
// contributors (the Multisender receipt), not the coin's trading page.
const ROUND1_DELIVERY = "https://www.arcircle.app/arc#multisend?receipt=0xae8f4d0729dbf8202cc267d5c444f3a0008ca5238b08a9075f8cd2cec6bc92e3";
const ROUND2_ESCROW = "0xb87c5aa6c6ced8afb4ab6785ab419718f296c8c3", ROUND3_ESCROW = "0x9a93e6ca15c48b379e8dad7b03e83724c1d2e1e4";
const FIXED = {
  [lc(ESCROW)]: {
    top: { at: null, proof: null, by: "team", exception: true, fixed: true },
    launch: { at: null, proof: ROUND1_DELIVERY, by: "team", fixed: true },
  },
  // Round #2 ($TIE) didn't launch on its own: on 3 Oct 2026 it was merged into Round #3 — its whole raise
  // (1,999.62 USDC) went back in as Round #3's, and Round #2's contributors get their share of Round #3 pro rata,
  // from Round #2's list. Steps 4–5 are settled by the merge.
  [ROUND2_ESCROW]: {
    merged: { into: 3, usdc: "1999.62", by: "team", fixed: true },
    top: { at: null, proof: null, by: "team", merged: 3, fixed: true },
    launch: { at: null, proof: `https://arc.etherscan.io/address/${ROUND3_ESCROW}`, by: "team", merged: 3, fixed: true },
  },
};
async function storedStagesOf(escrow) {
  if (!store.enabled()) return {};
  try { return (await store.get(`circleStage/${lc(escrow)}`)) || {}; } catch { return {}; }
}
async function stagesOf(escrow) {
  return { ...(await storedStagesOf(escrow)), ...(FIXED[lc(escrow)] || {}) }; // a settled mark always wins
}
/// 0 raise · 1 burn-to-vote · 2 close & split · 3 top contributor · 4 launch & airdrop · 5 all done
/// Steps 4 and 5 run side by side (the top contributor is paid over 3 days while the coin launches), so
/// either can be marked first; the step shown as "now" is the first one not done yet.
export function stepNow(st, marks, t = now()) {
  if (!st || !st.started) return -1;
  if (t < st.deadline) return 0;
  if (!st.distributed) return 2;
  if (!(marks && marks.top)) return 3;
  if (!(marks && marks.launch)) return 4;
  return 5;
}
export const stageMessage = (escrow, step, undo, proof, wallet, issued) =>
  `ARCIRCLE PAD — CirclePad launch process\nRound: ${lc(escrow)}\nStep: ${step}\nAction: ${undo ? "undo" : "done"}\nProof: ${proof || "-"}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;
function issuedOk(iso, maxAgeMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== iso) return false;
  const nowMs = Date.now() + skew * 1000;
  return t <= nowMs + 2 * 60e3 && nowMs - t <= maxAgeMs;
}
const PROOF_OK = (p) => !p || /^0x[0-9a-fA-F]{64}$/.test(p) || (() => { try { const u = new URL(p); return u.protocol === "https:" && p.length <= 200 && !/["'<>\s`]/.test(p); } catch { return false; } })();

export async function stagePost(b, recover, json) {
  const wallet = lc(b.wallet), step = String(b.step || ""), undo = !!b.undo, proof = String(b.proof || "").trim();
  const r = await roundByN(b.round);
  if (!r) return json(404, { error: "no such round" });
  if (!isAddr(wallet)) return json(400, { error: "wallet must be an address" });
  if (!STEPS.includes(step)) return json(400, { error: "only the team's steps (top contributor, launch) are marked by hand" });
  if (!PROOF_OK(proof)) return json(400, { error: "proof must be a transaction hash or a full https:// link" });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  let signer; try { signer = recover(stageMessage(r.escrow, step, undo, proof, wallet, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  forgetRound(r.escrow);
  const st = await roundState(r.escrow);
  if (wallet !== st.recipient) return json(403, { error: "only the round's wallet can move the launch process" });
  const marks = await stagesOf(r.escrow);
  const at = stepNow(st, marks);
  if (undo) {
    if (!marks[step]) return json(409, { error: "that step isn't marked done" });
    if (marks[step].fixed) return json(409, { error: "this round's step is settled and can't be undone" });
    const saved = await storedStagesOf(r.escrow); delete saved[step];
    await store.set(`circleStage/${r.escrow}`, saved);
    const next = await stagesOf(r.escrow);
    return json(200, { ok: true, marks: next, step: stepNow(st, next) });
  }
  if (at < 3) return json(409, { error: at < 2 ? "the raise hasn't closed yet" : "send the 80 / 15 / 5 split from the escrow first" });
  if (marks[step]) return json(409, { error: "that step is already done" });
  await store.set(`circleStage/${r.escrow}`, { ...(await storedStagesOf(r.escrow)), [step]: { at: Date.now(), proof: proof || null, by: wallet } });
  const next = await stagesOf(r.escrow);
  return json(200, { ok: true, marks: next, step: stepNow(st, next) });
}

// ---- registering the next round ----
export async function registerRound(b, json) {
  const tx = lc(b.tx);
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "tx must be a transaction hash" });
  const list = await rounds(true);
  const have = list.find((r) => r.tx === tx);
  if (have) return json(200, { ok: true, already: true, round: have });
  const [t, rc] = await Promise.all([rpcCall("eth_getTransactionByHash", [tx]), rpcCall("eth_getTransactionReceipt", [tx])]);
  if (!t || !rc) return json(404, { error: "transaction not found yet — try again in a moment" });
  if (t.to || rc.status !== "0x1" || !isAddr(rc.contractAddress)) return json(400, { error: "not a successful contract deployment" });
  const one = await walletsOf(ESCROW);
  if (lc(t.from) !== one.recipient) return json(403, { error: "only the round wallet can open a new round" });
  const input = lc(t.input || t.data);
  const codeLen = 2 + ESCROW_CODE_BYTES * 2;
  if (input.length !== codeLen + 4 * 64 || keccakHex(input.slice(0, codeLen)) !== ESCROW_CODE_HASH) return json(400, { error: "that isn't the CirclePad escrow contract" });
  const arg = (i) => input.slice(codeLen + i * 64, codeLen + (i + 1) * 64);
  if ("0x" + arg(0).slice(24) !== one.recipient || "0x" + arg(1).slice(24) !== one.platform || "0x" + arg(2).slice(24) !== one.treasury) {
    return json(400, { error: "a new round must pay the same recipient, platform and treasury wallets as Round #1" });
  }
  // one round at a time: the last one must have closed, and none may be waiting to start
  const last = list[list.length - 1];
  const lastSt = await roundState(last.escrow).catch(() => null);
  if (!lastSt || !lastSt.started) return json(409, { error: `Round #${last.n} hasn't started yet — start it before opening another` });
  if (now() < lastSt.deadline) return json(409, { error: `Round #${last.n} is still open` });
  const escrow = lc(rc.contractAddress);
  const reg = await registry(true);
  const entry = { n: nextRoundN(last.n), escrow, tx, block: parseInt(rc.blockNumber, 16), at: Date.now(), started: false };
  await saveRegistry({ list: [...reg.list, entry] });
  return json(200, { ok: true, round: { n: entry.n, escrow, tx, started: false } });
}

/// Keeps the registry's "started" flag in step with the chain (boot script and page read it).
async function syncStarted(list, states) {
  const reg = await registry();
  let dirty = false;
  const next = reg.list.map((r) => {
    const i = list.findIndex((x) => x.escrow === lc(r.escrow));
    const st = states[i];
    if (st && st.started && !r.started) { dirty = true; return { ...r, started: true, deadline: st.deadline }; }
    return r;
  });
  if (dirty && store.enabled()) { try { await saveRegistry({ list: next }); } catch { /* next read tries again */ } }
}

// ---- GET ?circle=rounds ----
const ser = (st) => (st ? { started: st.started, deadline: st.deadline, totalRaised: st.totalRaised.toString(), cap: st.cap.toString(), recipient: st.recipient, isOpen: st.isOpen, distributed: st.distributed } : null);
export async function roundsData(fresh = false) {
  const list = await rounds(fresh);
  if (fresh) list.forEach((r) => forgetRound(r.escrow));
  const [states, marks, wallets] = await Promise.all([
    Promise.all(list.map((r) => roundState(r.escrow).catch(() => null))),
    Promise.all(list.map((r) => stagesOf(r.escrow))),
    walletsOf(ESCROW).catch(() => null),
  ]);
  await syncStarted(list, states);
  const t = now();
  const out = list.map((r, i) => ({ ...r, started: states[i] ? states[i].started : r.started, state: ser(states[i]), marks: marks[i], step: stepNow(states[i], marks[i], t), report: r.n === 1 ? "/circle/round/1" : null }));
  const last = out[out.length - 1];
  // the next round: pre-start until the round wallet deploys + starts it
  const lastClosed = !!(last.state && last.state.started && t >= last.state.deadline);
  const next = last.started ? { n: nextRoundN(last.n), canOpen: lastClosed, waitingFor: lastClosed ? null : `Round #${last.n} closes first` } : null;
  const current = [...out].reverse().find((r) => r.started) || out[0];
  return { rounds: out, current: current.n, next, skipped: SKIPPED, wallets, now: t, storeOn: store.enabled() };
}

/// A tiny script for /circle's <head>: which round the page runs. Only the registry (one store read), so it's fast.
export async function bootScript() {
  let list = [];
  try { list = await rounds(); } catch { list = []; }
  // a round deployed but not started yet: one chain read, so the page switches the moment start() lands
  const pending = list.filter((r) => r.n > 1 && !r.started);
  if (pending.length) {
    const sts = await Promise.all(pending.map((r) => { forgetRound(r.escrow); return roundState(r.escrow).catch(() => null); }));
    pending.forEach((r, i) => { if (sts[i] && sts[i].started) r.started = true; });
  }
  const v = { list: list.map((r) => ({ n: r.n, escrow: r.escrow, started: !!r.started })) };
  return `window.CP_ROUNDS=${JSON.stringify(v)};`;
}

// ---- a round's summary (Projects card) ----
const pct = (a, total) => (total > 0n ? Number((a * 1000000n) / total) / 10000 : 0);
export async function summary(n) {
  const r = await roundByN(n);
  if (!r) return null;
  forgetRound(r.escrow);
  const [st, marks, wallets, lb, ballot] = await Promise.all([
    roundState(r.escrow), stagesOf(r.escrow), walletsOf(r.escrow).catch(() => null), leaderboard(null, r.escrow),
    forRound(r.n) ? ballotReport(forRound(r.n)).catch(() => null) : Promise.resolve(null),
  ]);
  const total = st.totalRaised;
  const rows = (lb.rows || []).map((x, i) => ({ rank: i + 1, address: x.address, amount: x.amount, share: pct(BigInt(x.amount), total), deposited: x.depositedTotal, withdrawn: x.withdrawnTotal }));
  const split = { recipient: ((total * 8000n) / 10000n).toString(), treasury: ((total * 1500n) / 10000n).toString(), platform: ((total * 500n) / 10000n).toString() };
  const winners = ballot ? ballot.categories.map((c) => {
    const best = c.options.reduce((a, o, i) => (o.votes > (a ? a.votes : 0) ? { i, text: o.text, votes: o.votes } : a), null);
    return { id: c.id, label: c.label, winner: best, options: c.options.length, votes: c.options.reduce((s, o) => s + o.votes, 0) };
  }) : null;
  return {
    n: r.n, escrow: r.escrow, deployTx: r.tx, state: ser(st), step: stepNow(st, marks), marks, wallets, split,
    closed: st.started && now() >= st.deadline, startedAt: st.started ? st.deadline - FUNDING : null,
    board: { rows, complete: !!lb.complete, flow: lb.flow || null, contributors: rows.length, top: rows[0] || null },
    ballot: ballot ? { burned: ballot.burned, votes: ballot.votes, voters: ballot.voters, opensAt: ballot.opensAt, votingEnds: ballot.votingEnds, winners } : null,
    contracts: { escrow: r.escrow, vote: forRound(r.n) ? forRound(r.n).ballot || null : null, burnvote: forRound(r.n) ? forRound(r.n).burnvote || null : null },
    govMode: forRound(r.n) ? forRound(r.n).mode : null, // "direct": signed candidates + burns to 0x…dEaD, no vote contracts
    report: r.n === 1 ? "/circle/round/1" : null,
  };
}

// ---- the leaderboard as CSV (exact amounts, 18-decimal native USDC) ----
// in: "eth" or "sol" adds each amount converted at today's price (USDC counted as $1), the price used and when —
// the USDC columns stay the exact on-chain amounts. Throws when that price can't be read (no guessed numbers).
const dec18 = (wei) => { const v = BigInt(wei || 0), neg = v < 0n, a = neg ? -v : v; const i = a / 10n ** 18n, f = (a % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, ""); return (neg ? "-" : "") + i.toString() + (f ? "." + f : ""); };
export async function leaderboardCsv(n, { in: unit = "" } = {}) {
  const r = await roundByN(n);
  if (!r) return null;
  unit = unit === "eth" || unit === "sol" ? unit : "";
  forgetRound(r.escrow);
  const [st, lb, px] = await Promise.all([roundState(r.escrow), leaderboard(null, r.escrow), unit ? prices() : null]);
  const usdPer = unit ? px && px[unit] : null;
  if (unit && !usdPer) throw new Error(`couldn't read the ${unit.toUpperCase()} price right now`);
  const total = st.totalRaised;
  const D = unit === "sol" ? 9 : 8; // SOL has 9 decimals; ETH to 8 is well below a cent
  const cv = (wei) => (Number(dec18(wei)) / usdPer).toFixed(D);
  const U = unit;
  const head = ["rank", "wallet", "contributed_usdc", ...(U ? [`contributed_${U}`] : []), "share_pct", "deposited_usdc", ...(U ? [`deposited_${U}`] : []), "withdrawn_usdc", ...(U ? [`withdrawn_${U}`] : []),
    ...(U ? [`${U}_usd_price`, "priced_at_utc"] : [])];
  const at = U ? new Date(px.at * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") : "";
  const lines = [head.join(",")];
  (lb.rows || []).forEach((x, i) => lines.push([i + 1, x.address, dec18(x.amount), ...(U ? [cv(x.amount)] : []), pct(BigInt(x.amount), total).toFixed(4),
    dec18(x.depositedTotal), ...(U ? [cv(x.depositedTotal)] : []), dec18(x.withdrawnTotal), ...(U ? [cv(x.withdrawnTotal)] : []), ...(U ? [usdPer, at] : [])].join(",")));
  const closed = st.started && now() >= st.deadline;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return { csv: lines.join("\n") + "\n", filename: `circlepad-round-${r.n}-leaderboard${closed ? "-final" : "-" + stamp + "Z"}${U ? "-in-" + U : ""}.csv`, complete: !!lb.complete, closed, unit: U || "usdc" };
}

export const _test = { useStore: (s) => { testStore = s; regMem = null; }, dec18, skew: (s) => { skew = s; } };
