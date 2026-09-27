// api/_burnvote.mjs — CirclePad burn-to-vote (contracts/ArcircleBurnVote.sol),
// read for the governance feed, the hub / $ARCIRCLE burn chips and the
// /vote/<tx> share page. Every vote is a Voted event; 1 vote = 1,000
// $ARCIRCLE sent to 0x…dEaD inside that transaction.
import { ethCalls, rpcCall, getLogs, latestBlock, pool, toQty, keccakHex } from "./_arc.mjs";

// mutable only so tests can point it at a local chain
export const ADDR = {
  burnvote: "0x54121a7894d90a02ea973ab45eef424c2716eeb2",
  ballot: "0x23c376615a58f059fc4bc83a38eb4acdf8d39ff2",
  from: 22945226, // the deploy block (27 Sep 2026; votes from then until the raise closes)
};
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

let optMem = null; // { at, v: string[][] }
export async function ballotOptions() {
  if (optMem && Date.now() - optMem.at < 60e3) return optMem.v;
  const r = await ethCalls(CATS.map((_, c) => ({ to: ADDR.ballot, data: sel("optionsSet(uint8)") + pad(c) })));
  const set = r.map((h) => big(h) > 0n);
  const o = await ethCalls(CATS.map((_, c) => (set[c] ? { to: ADDR.ballot, data: sel("options(uint8)") + pad(c) } : null)).filter(Boolean));
  let k = 0;
  const v = CATS.map((_, c) => (set[c] ? decodeStrings(o[k++]) : []));
  optMem = { at: Date.now(), v };
  return v;
}

// ---- the feed: every Voted event, kept incrementally (store doc or this instance) ----
const mem = new Map();
export async function burnFeed(store) {
  const key = `cburn/feed/${ADDR.burnvote}`; // one feed per vote contract
  let st = mem.get(key) || null;
  if (!st && store) { try { st = await store.get(key); } catch { st = null; } }
  if (!st || !Array.isArray(st.ev) || st.hi < ADDR.from - 1) st = { hi: ADDR.from - 1, ev: [] };
  const latest = await latestBlock();
  let n = 0, moved = false;
  while (st.hi < latest.number && n < MAX_CHUNKS) {
    const ranges = [];
    let a = st.hi + 1;
    for (let k = 0; k < 8 && a <= latest.number && n < MAX_CHUNKS; k++, n++) { const b = Math.min(latest.number, a + CHUNK - 1); ranges.push([a, b]); a = b + 1; }
    let logs;
    try { logs = (await pool(ranges, 8, ([x, y]) => getLogs({ address: ADDR.burnvote, topics: [T_VOTED], fromBlock: toQty(x), toBlock: toQty(y) }))).flat(); }
    catch { break; }
    for (const l of logs) { const e = parse(l); st.ev.push(`${e.b}|${e.i}|${e.tx}|${e.cat}|${e.voter}|${e.opt}|${e.votes}`); }
    st.hi = ranges[ranges.length - 1][1]; moved = true;
  }
  if (moved) { mem.set(key, st); if (store) { try { await store.set(key, st); } catch { /* this instance keeps it */ } } }
  const ev = st.ev.map((r) => { const [b, i, tx, cat, voter, opt, votes] = r.split("|"); return { b: +b, i: +i, tx, cat: +cat, voter, opt: +opt, votes: +votes }; })
    .sort((x, y) => (y.b - x.b) || (y.i - x.i));
  const [tb, tv, vc] = await ethCalls(["totalBurned()", "totalVotes()", "voterCount()"].map((s) => ({ to: ADDR.burnvote, data: sel(s) })));
  const by = new Map();
  for (const e of ev) by.set(e.voter, (by.get(e.voter) || 0) + e.votes);
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([voter, votes]) => ({ voter, votes }));
  const opts = await ballotOptions().catch(() => null);
  return {
    contract: ADDR.burnvote, done: st.hi >= latest.number, hi: st.hi, anchor: { block: latest.number, ts: latest.ts },
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
  const logs = (rc.logs || []).filter((l) => lc(l.address) === ADDR.burnvote && l.topics && l.topics[0] === T_VOTED).map(parse);
  if (!logs.length) return null;
  const opts = await ballotOptions().catch(() => null);
  const blk = await rpcCall("eth_getBlockByNumber", [rc.blockNumber, false]).catch(() => null);
  const votes = logs.reduce((a, e) => a + e.votes, 0);
  return {
    tx, voter: logs[0].voter, block: parseInt(rc.blockNumber, 16), ts: blk ? parseInt(blk.timestamp, 16) : null,
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
export async function ballotReport() {
  const opts = await ballotOptions();
  const calls = [
    ...CATS.map((_, c) => ({ to: ADDR.burnvote, data: sel("tallies(uint8)") + pad(c) })),
    ...["totalBurned()", "totalVotes()", "voterCount()", "opensAt()", "votingEnds()"].map((s) => ({ to: ADDR.burnvote, data: sel(s) })),
  ];
  const r = await ethCalls(calls);
  const tallies = CATS.map((_, c) => decodeUints(r[c]));
  const [tb, tv, vc, op, ve] = r.slice(CATS.length);
  return {
    categories: CATS.map((label, c) => ({ id: c, label, options: (opts[c] || []).map((text, i) => ({ text, votes: tallies[c][i] || 0 })) })),
    burned: big(tb).toString(), votes: Number(big(tv)), voters: Number(big(vc)), opensAt: Number(big(op)), votingEnds: Number(big(ve)),
  };
}
