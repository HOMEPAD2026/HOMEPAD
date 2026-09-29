// api/_burnvote.mjs — CirclePad burn-to-vote (contracts/ArcircleBurnVote.sol),
// read for the governance feed, the hub / $ARCIRCLE burn chips and the
// /vote/<tx> share page. Every vote is a Voted event; 1 vote = 1,000
// $ARCIRCLE sent to 0x…dEaD inside that transaction.
import { ethCalls, rpcCall, getLogs, latestBlock, pool, toQty, keccakHex } from "./_arc.mjs";

// Governance round by round: the round's escrow, its ballot (BigPadVote: the candidates the round wallet
// publishes) and its burn-to-vote (ArcircleBurnVote), with the block it was deployed in. A round's vote is
// live once both addresses are here; keep config-arc.js CIRCLEPAD_GOV in step.
export const GOV = {
  1: { escrow: "0xc5998d7ce728fdd6f77217fde775aab90ec61703", ballot: "0x23c376615a58f059fc4bc83a38eb4acdf8d39ff2", burnvote: "0x54121a7894d90a02ea973ab45eef424c2716eeb2", from: 22945226 },
  // Round #2 (started 30 Sep 2026): same rules as Round #1 — community ideas, then burn-to-vote. Filled in
  // once its BigPadVote and ArcircleBurnVote are deployed (contracts/scripts, CIRCLEPAD_ROUND2.md).
  2: { escrow: "0xb87c5aa6c6ced8afb4ab6785ab419718f296c8c3", ballot: "", burnvote: "", from: 0 },
};
const isA = (a) => /^0x[0-9a-f]{40}$/.test(String(a || ""));
const gov = (n) => ({ n: Number(n), ...GOV[n] });
/// rounds whose ballot exists (the ideas board and candidates work from here), newest first
export const ballotRounds = () => Object.keys(GOV).filter((n) => isA(GOV[n].ballot)).map(gov).sort((a, b) => b.n - a.n);
/// rounds whose burn-to-vote exists, newest first
export const voteRounds = () => Object.keys(GOV).filter((n) => isA(GOV[n].ballot) && isA(GOV[n].burnvote)).map(gov).sort((a, b) => b.n - a.n);
// The CURRENT burn-to-vote (the newest round that has one). Mutable only so tests can point it at a local chain.
export const ADDR = (() => { const c = voteRounds()[0]; return { n: c.n, escrow: c.escrow, burnvote: c.burnvote, ballot: c.ballot, from: c.from }; })();
/// the burn-to-vote of round n, or null when that round has none
export function forRound(n) {
  n = Number(n);
  if (n === ADDR.n) return ADDR;
  return voteRounds().find((g) => g.n === n) || null;
}
/// the round an ideas board belongs to: the one with this escrow, or the newest round with a ballot
export function ideasRound(escrow) {
  const L = ballotRounds();
  return escrow ? L.find((g) => g.escrow === String(escrow).toLowerCase()) || null : L[0] || null;
}
const CHUNK = 9000, MAX_CHUNKS = 40;
const lc = (a) => String(a || "").toLowerCase();
const strip = (h) => String(h || "").replace(/^0x/, "");
const ascii = (s) => "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
const sel = (sig) => keccakHex(ascii(sig)).slice(0, 10);
const T_VOTED = keccakHex(ascii("Voted(uint8,address,uint256,uint256,uint256)"));
const word = (h, i) => strip(h).slice(i * 64, (i + 1) * 64);
const big = (h) => { try { return BigInt(h && h !== "0x" ? h : 0); } catch { return 0n; } };
const pad = (n) => BigInt(n).toString(16).padStart(64, "0");
export const CATS = ["Coin name", "Ticker", "Logo", "Roadmap", "Launch date"];

/// string[] from an ABI-encoded return value
export function decodeStrings(hex) {
  const x = strip(hex);
  if (x.length < 128) return [];
  try {
    const off = Number(BigInt("0x" + x.slice(0, 64))) * 2;
    const n = Number(BigInt("0x" + x.slice(off, off + 64)));
    const base = off + 64, out = [];
    for (let i = 0; i < n && i < 32; i++) {
      const p = base + Number(BigInt("0x" + x.slice(base + i * 64, base + (i + 1) * 64))) * 2;
      const len = Number(BigInt("0x" + x.slice(p, p + 64)));
      const bytes = x.slice(p + 64, p + 64 + len * 2);
      out.push(new TextDecoder().decode(Uint8Array.from((bytes.match(/../g) || []).map((b) => parseInt(b, 16)))));
    }
    return out;
  } catch { return []; }
}
const parse = (l) => ({
  b: parseInt(l.blockNumber, 16), i: parseInt(l.logIndex, 16), tx: lc(l.transactionHash),
  cat: Number(big(l.topics[1])), voter: "0x" + strip(l.topics[2]).slice(24), opt: Number(big(l.topics[3])),
  votes: Number(big("0x" + word(l.data, 0))),
});

const optMem = new Map(); // ballot → { at, v: string[][] }
export async function ballotOptions(A = ADDR) {
  const m = optMem.get(A.ballot);
  if (m && Date.now() - m.at < 60e3) return m.v;
  const r = await ethCalls(CATS.map((_, c) => ({ to: A.ballot, data: sel("optionsSet(uint8)") + pad(c) })));
  const set = r.map((h) => big(h) > 0n);
  const o = await ethCalls(CATS.map((_, c) => (set[c] ? { to: A.ballot, data: sel("options(uint8)") + pad(c) } : null)).filter(Boolean));
  let k = 0;
  const v = CATS.map((_, c) => (set[c] ? decodeStrings(o[k++]) : []));
  optMem.set(A.ballot, { at: Date.now(), v });
  return v;
}

// ---- the feed: every Voted event, kept incrementally (store doc or this instance) ----
const mem = new Map();
export async function burnFeed(store, A = ADDR) {
  const key = `cburn/feed/${A.burnvote}`; // one feed per vote contract
  let st = mem.get(key) || null;
  if (!st && store) { try { st = await store.get(key); } catch { st = null; } }
  if (!st || !Array.isArray(st.ev) || st.hi < A.from - 1) st = { hi: A.from - 1, ev: [] };
  const latest = await latestBlock();
  let n = 0, moved = false;
  while (st.hi < latest.number && n < MAX_CHUNKS) {
    const ranges = [];
    let a = st.hi + 1;
    for (let k = 0; k < 8 && a <= latest.number && n < MAX_CHUNKS; k++, n++) { const b = Math.min(latest.number, a + CHUNK - 1); ranges.push([a, b]); a = b + 1; }
    let logs;
    try { logs = (await pool(ranges, 8, ([x, y]) => getLogs({ address: A.burnvote, topics: [T_VOTED], fromBlock: toQty(x), toBlock: toQty(y) }))).flat(); }
    catch { break; }
    for (const l of logs) { const e = parse(l); st.ev.push(`${e.b}|${e.i}|${e.tx}|${e.cat}|${e.voter}|${e.opt}|${e.votes}`); }
    st.hi = ranges[ranges.length - 1][1]; moved = true;
  }
  if (moved) { mem.set(key, st); if (store) { try { await store.set(key, st); } catch { /* this instance keeps it */ } } }
  const ev = st.ev.map((r) => { const [b, i, tx, cat, voter, opt, votes] = r.split("|"); return { b: +b, i: +i, tx, cat: +cat, voter, opt: +opt, votes: +votes }; })
    .sort((x, y) => (y.b - x.b) || (y.i - x.i));
  const [tb, tv, vc] = await ethCalls(["totalBurned()", "totalVotes()", "voterCount()"].map((s) => ({ to: A.burnvote, data: sel(s) })));
  const by = new Map();
  for (const e of ev) by.set(e.voter, (by.get(e.voter) || 0) + e.votes);
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([voter, votes]) => ({ voter, votes }));
  const opts = await ballotOptions(A).catch(() => null);
  return {
    contract: A.burnvote, round: A.n ?? null, done: st.hi >= latest.number, hi: st.hi, anchor: { block: latest.number, ts: latest.ts },
    totals: { burned: big(tb).toString(), votes: Number(big(tv)), voters: Number(big(vc)) },
    events: ev.slice(0, 60).map((e) => ({ ...e, text: opts && opts[e.cat] ? opts[e.cat][e.opt] || "" : "" })),
    top,
  };
}

/// One vote transaction for its share page: who burned how much for what.
export async function voteTx(tx) {
  tx = lc(tx);
  if (!/^0x[0-9a-f]{64}$/.test(tx)) throw Object.assign(new Error("tx must be a transaction hash"), { status: 400 });
  const rc = await rpcCall("eth_getTransactionReceipt", [tx]);
  if (!rc) return null;
  // any round's burn-to-vote: the share page works for every round's votes
  const known = [ADDR, ...voteRounds()];
  const A = known.find((g) => (rc.logs || []).some((l) => lc(l.address) === g.burnvote && l.topics && l.topics[0] === T_VOTED));
  if (!A) return null;
  const logs = (rc.logs || []).filter((l) => lc(l.address) === A.burnvote && l.topics && l.topics[0] === T_VOTED).map(parse);
  if (!logs.length) return null;
  const opts = await ballotOptions(A).catch(() => null);
  const blk = await rpcCall("eth_getBlockByNumber", [rc.blockNumber, false]).catch(() => null);
  const votes = logs.reduce((a, e) => a + e.votes, 0);
  return {
    tx, round: A.n ?? null, voter: logs[0].voter, block: parseInt(rc.blockNumber, 16), ts: blk ? parseInt(blk.timestamp, 16) : null,
    votes, burned: (BigInt(votes) * 1000n).toString(),
    items: logs.map((e) => ({ cat: e.cat, category: CATS[e.cat] || "", opt: e.opt, text: opts && opts[e.cat] ? opts[e.cat][e.opt] || "" : "", votes: e.votes })),
  };
}

/// The whole ballot for the round report: every option with its votes, plus the totals.
function decodeUints(hex) {
  const x = strip(hex);
  if (x.length < 128) return [];
  try {
    const off = Number(BigInt("0x" + x.slice(0, 64))) * 2, n = Number(BigInt("0x" + x.slice(off, off + 64)));
    return Array.from({ length: Math.min(n, 64) }, (_, i) => Number(BigInt("0x" + x.slice(off + 64 + i * 64, off + 128 + i * 64))));
  } catch { return []; }
}
export async function ballotReport(A = ADDR) {
  const opts = await ballotOptions(A);
  const calls = [
    ...CATS.map((_, c) => ({ to: A.burnvote, data: sel("tallies(uint8)") + pad(c) })),
    ...["totalBurned()", "totalVotes()", "voterCount()", "opensAt()", "votingEnds()"].map((s) => ({ to: A.burnvote, data: sel(s) })),
  ];
  const r = await ethCalls(calls);
  const tallies = CATS.map((_, c) => decodeUints(r[c]));
  const [tb, tv, vc, op, ve] = r.slice(CATS.length);
  return {
    categories: CATS.map((label, c) => ({ id: c, label, options: (opts[c] || []).map((text, i) => ({ text, votes: tallies[c][i] || 0 })) })),
    burned: big(tb).toString(), votes: Number(big(tv)), voters: Number(big(vc)), opensAt: Number(big(op)), votingEnds: Number(big(ve)),
  };
}
