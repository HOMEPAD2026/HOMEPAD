// api/_burnvote.mjs — CirclePad burn-to-vote, read for the governance feed, the hub / $ARCIRCLE burn chips
// and the /vote/<tx> share page. 1 vote = 1,000 $ARCIRCLE sent to 0x…dEaD.
//
// Two ways a round votes:
//   contract (Round #1) — the candidates live in the round's BigPadVote ("ballot") and every vote is a Voted
//     event of its ArcircleBurnVote (contracts/).
//   direct (Round #2 on) — no contract to deploy. The round wallet signs each category's candidates (stored
//     here with the signature, published once, never edited), and a vote is a plain $ARCIRCLE transfer to
//     0x…dEaD whose amount carries the choice in its last 12 decimals: votes × 1,000 $ARCIRCLE + a code of
//     round, category and candidate worth well under a billionth of a token (voteAmount / readVoteAmount).
//     Anyone can recount it from the chain: every such transfer from the first candidates to the raise's close.
import { ethCalls, rpcCall, getLogs, latestBlock, blockTs, pool, toQty, keccakHex } from "./_arc.mjs";
import { ARCIRCLE_TOKEN } from "./_arcircle.mjs";
import { roundState, forgetRound } from "./_round.mjs";
import { SITE } from "./_arc.mjs";

// Governance round by round: the round's escrow and how it votes. Contract rounds list their ballot
// (BigPadVote) and burn-to-vote (ArcircleBurnVote) with the block they were deployed in; direct rounds need
// nothing else. Keep config-arc.js CIRCLEPAD_GOV in step.
export const GOV = {
  1: { escrow: "0xc5998d7ce728fdd6f77217fde775aab90ec61703", ballot: "0x23c376615a58f059fc4bc83a38eb4acdf8d39ff2", burnvote: "0x54121a7894d90a02ea973ab45eef424c2716eeb2", from: 22945226 },
  // Round #2 (started 30 Sep 2026): Round #1's rules — community ideas, the round wallet's candidates, burn-to-vote
  // until the raise closes — without new contracts.
  2: { escrow: "0xb87c5aa6c6ced8afb4ab6785ab419718f296c8c3", mode: "direct", ballot: "", burnvote: "", from: 0 },
  // Round #3 (started 2 Oct 2026; Round #2 merged into it on 3 Oct): Round #2's rules plus a sixth category, the
  // launch chain. Its three choices start in the free pre-vote like everything else (api/_circle.mjs seeds them);
  // the round wallet then publishes them as candidates, and burn-to-vote opens for it as for the others.
  // 3 Oct 2026: the team published Round #3's candidates here (cands, from candsAt) — five per category with Round #2's
  // $TIE picks first (its launch date had passed, so five new dates), and the three chains — so burn-to-vote opens
  // at once. A category with candidates here can't be published again; the signed route stays for anything not here.
  3: {
    // 4 Oct 2026: Round #3 launches no new coin — its raise buys $ARCIA (Robinhood Chain) and its contributors also get
    // Round #4's Solana token — so its burn-to-vote closed at closedAt: later burns aren't counted, nothing more is
    // published, and the votes cast before stay on record (config-arc.js CIRCLEPAD_GOV[3]).
    escrow: "0x9a93e6ca15c48b379e8dad7b03e83724c1d2e1e4", mode: "direct", ballot: "", burnvote: "", from: 0, chain: ["Arc", "Robinhood Chain", "Solana"], closedAt: 1791072000,
    candsAt: 1790963400,
    cands: {
      0: ["Trade. Invest. Earn.", "Arc Tide", "Trio", "Builder Bull", "Loop"],
      1: ["TIE", "TIDE", "TRIO", "BULL", "LOOP"],
      2: [
        "https://www.arcircle.app/logo/209878d3275e679275c500cbedfa9be3486c68fc13df0e6b664aa91999a87ef0.webp",
        "https://www.arcircle.app/images/circlepad/r3/tide.webp",
        "https://www.arcircle.app/images/circlepad/r3/trio.webp",
        "https://www.arcircle.app/images/circlepad/r3/bull.webp",
        "https://www.arcircle.app/images/circlepad/r3/loop.webp",
      ],
      3: [
        "Trade. Invest. Earn.",
        "Phase 1 — launch with the round's liquidity and airdrop every contributor pro rata. Phase 2 — ARCIRCLE Predict and Orders markets for the coin. Phase 3 — bridge it to the other chains through ARCIRCLE OMNI.",
        "Phase 1 — launch and airdrop. Phase 2 — a Builder Mine for the coin: holders mine it, unmined supply is burned. Phase 3 — ARCIA shares its stats and news on X and Telegram every day.",
        "Phase 1 — launch and airdrop. Phase 2 — part of the coin's trading fees buys back and burns $ARCIRCLE. Phase 3 — holders vote on the next utility every month through CirclePad.",
        "Community first: every next step is proposed and voted on through CirclePad, and each milestone is shown on ARCIRCLE PAD.",
      ],
      4: ["2026-10-06T09:30:00Z", "2026-10-06T11:30:00Z", "2026-10-07T09:30:00Z", "2026-10-07T11:30:00Z", "2026-10-08T11:30:00Z"],
      5: ["Arc", "Robinhood Chain", "Solana"],
    },
  },
};
const isA = (a) => /^0x[0-9a-f]{40}$/.test(String(a || ""));
export const isDirect = (A) => !!A && A.mode === "direct";
const gov = (n) => ({ n: Number(n), mode: "contract", ...GOV[n] });
const hasBallot = (g) => g.mode === "direct" || isA(g.ballot);
const hasVote = (g) => g.mode === "direct" || (isA(g.ballot) && isA(g.burnvote));
/// rounds whose ballot exists (the ideas board and candidates work from here), newest first
export const ballotRounds = () => Object.keys(GOV).map(gov).filter(hasBallot).sort((a, b) => b.n - a.n);
/// rounds whose burn-to-vote exists, newest first
export const voteRounds = () => Object.keys(GOV).map(gov).filter(hasVote).sort((a, b) => b.n - a.n);
// The CURRENT burn-to-vote (the newest round that has one). Mutable only so tests can point it elsewhere.
export const ADDR = (() => { const c = voteRounds()[0]; return { ...c, n: c.n, mode: c.mode, escrow: c.escrow, burnvote: c.burnvote, ballot: c.ballot, from: c.from }; })();
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
/// the sixth category (Round #3 on): where the coin launches — its candidates come from GOV[n].chain only
export const CHAIN_CAT = 5;
export const ALL_CATS = [...CATS, "Launch chain"];
/// the categories a round votes on
export const catsOf = (A) => (A && Array.isArray(A.chain) && A.chain.length ? ALL_CATS : CATS);

// ---- direct rounds: the vote code in the amount ----
export const VOTE_UNIT = 1000n * 10n ** 18n; // 1 vote = 1,000 $ARCIRCLE
const DUST = 10n ** 12n;
export const MAX_CANDS = 8;
/// the amount to send to 0x…dEaD: votes × 1,000 $ARCIRCLE + round·10⁶ + (category+1)·10³ + (candidate+1) raw units
export const voteAmount = (n, cat, opt, votes) => BigInt(votes) * VOTE_UNIT + BigInt(n) * 1000000n + BigInt(cat + 1) * 1000n + BigInt(opt + 1);
/// { round, cat, opt, votes } from an amount sent to 0x…dEaD, or null when it isn't a vote
export function readVoteAmount(v) {
  let x; try { x = BigInt(v); } catch { return null; }
  const d = x % DUST, base = x - d;
  if (base < VOTE_UNIT || base % VOTE_UNIT !== 0n) return null;
  const round = Number(d / 1000000n), cat = Number((d / 1000n) % 1000n) - 1, opt = Number(d % 1000n) - 1;
  if (round < 2 || cat < 0 || cat >= ALL_CATS.length || opt < 0 || opt >= MAX_CANDS) return null;
  return { round, cat, opt, votes: Number(base / VOTE_UNIT) };
}
const TOKEN_OVERRIDE = { v: "" };
const tokenAddr = () => TOKEN_OVERRIDE.v || String(ARCIRCLE_TOKEN || "").toLowerCase();
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEAD_TOPIC = "0x000000000000000000000000000000000000000000000000000000000000dead";

// the round wallet's signed candidates: one store doc per category, created once
const CAND_MAX = [32, 10, 300, 400, 40, 20];
export const candMessage = (n, escrow, cat, options) =>
  `ARCIRCLE PAD — CirclePad Round #${n} candidates\nRound: ${String(escrow).toLowerCase()}\nCategory: ${ALL_CATS[cat]}\n` + options.map((o, i) => `${i + 1}. ${o}`).join("\n");
// The store is handed in by the Node functions (api/_circle.mjs → useCandStore): this module is also bundled into
// Edge functions (api/c.mjs), which can't load api/_store.mjs (node:crypto). Without a store, candidates are read
// from the site's own /api/social?circle=gov (read-only).
let CONFIGURED = null, S = null; // { getMany(paths) → docs[], create(path, data) → false when it already exists } | tests: { get, create }
export function useCandStore(store) { CONFIGURED = store; S = store; candMem.clear(); }
const candPath = (escrow, cat) => `cgovCands/${String(escrow).toLowerCase()}_${cat}`;
async function candDocs(A) {
  const C = catsOf(A);
  const paths = C.map((_, c) => candPath(A.escrow, c));
  if (S && S.getMany) return S.getMany(paths);
  if (S && S.get) return Promise.all(paths.map((p) => S.get(p)));
  try {
    const r = await fetch(`${SITE}/api/social?circle=gov&round=${A.n}`, { headers: { accept: "application/json" } });
    const j = r.ok ? await r.json() : null;
    return C.map((_, c) => { const x = j && j.categories && j.categories[c]; return x && x.set ? { options: x.options, at: (x.at || 0) * 1000 } : null; });
  } catch { return paths.map(() => null); }
}
const candMem = new Map();
/// candidates the team put in GOV[n].cands (published from the site's code, not by a signature)
const teamCands = (A, c) => (A && A.cands && Array.isArray(A.cands[c]) && A.cands[c].length ? { options: A.cands[c].slice(), at: Number(A.candsAt) || 0, by: "team", sig: null, team: true } : null);
/// per category: { options, at (unix s), by, sig } or null while unpublished
export async function directBallot(A, fresh = false) {
  const m = candMem.get(A.escrow);
  if (!fresh && m && Date.now() - m.at < 15e3) return m.v;
  const docs = await candDocs(A);
  const v = docs.slice(0, catsOf(A).length).map((d, c) => (d && Array.isArray(d.options) ? { options: d.options.map(String), at: Math.floor(Number(d.at) / 1000), by: d.by, sig: d.sig } : teamCands(A, c)));
  candMem.set(A.escrow, { at: Date.now(), v });
  return v;
}
function tidyCand(cat, t, A = null) {
  let s = String(t ?? "").replace(/\r/g, "").trim();
  if (cat === CHAIN_CAT && A && Array.isArray(A.chain)) { const k = s.replace(/\s+/g, " ").toLowerCase(); return A.chain.find((x) => x.toLowerCase() === k) || s; }
  if (cat !== 3) s = s.replace(/\s+/g, " ");
  if (cat === 1) s = s.replace(/^\$/, "").toUpperCase();
  return s;
}
function candError(cat, list, A = null) {
  if (!Array.isArray(list) || list.length < 2) return "publish at least two candidates";
  if (list.length > MAX_CANDS) return `at most ${MAX_CANDS} candidates`;
  const seen = new Set();
  for (const o of list) {
    if (!o) return "a candidate is empty";
    if (o.length > CAND_MAX[cat]) return `keep each one under ${CAND_MAX[cat]} characters`;
    if (cat === 1 && !/^[A-Z0-9]{1,10}$/.test(o)) return "tickers are letters and digits only";
    if (cat === 2 && !/^(https:\/\/[^\s"'<>`]+|ipfs:\/\/[A-Za-z0-9./_-]+)$/i.test(o)) return "each logo is an https:// or ipfs:// link";
    if (cat === 4 && !Number.isFinite(Date.parse(o))) return "each launch date needs a date and time";
    if (cat === CHAIN_CAT && !(A && Array.isArray(A.chain) && A.chain.includes(o))) return `the launch chain is one of ${A && A.chain ? A.chain.join(", ") : "the round's chains"}`;
    const k = o.toLowerCase();
    if (seen.has(k)) return "the same candidate twice";
    seen.add(k);
  }
  return null;
}
/// POST { action: "cgov-cands", round: <escrow>, cat, options, signature } — the round wallet publishes one category
export async function publishCands(b, recover, json) {
  const A = ballotRounds().find((g) => isDirect(g) && g.escrow === String(b.round || "").toLowerCase());
  if (!A) return json(400, { error: "that round doesn't take signed candidates" });
  const cat = Number(b.cat);
  if (!Number.isInteger(cat) || cat < 0 || cat >= catsOf(A).length) return json(400, { error: "pick a category" });
  const raw = Array.isArray(b.options) ? b.options.map(String) : [];
  const options = raw.map((o) => tidyCand(cat, o, A));
  const bad = candError(cat, options, A);
  if (bad) return json(400, { error: bad });
  let signer; try { signer = recover(candMessage(A.n, A.escrow, cat, raw), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  forgetRound(A.escrow); // read it fresh: publishing is rare and the start/close matter
  const st = await roundState(A.escrow);
  if (signer !== st.recipient) return json(403, { error: "only the round's wallet publishes candidates" });
  if (!st.started) return json(409, { error: "the round hasn't started" });
  const head = await latestBlock();
  if (st.deadline && head.ts >= st.deadline) return json(409, { error: "the raise has closed" });
  if (A.closedAt && head.ts >= A.closedAt) return json(409, { error: "this round's vote is closed" });
  if ((await directBallot(A, true))[cat]) return json(409, { error: "these candidates are already published" });
  const data = { round: A.escrow, n: A.n, cat, options, raw, by: signer, sig: String(b.signature), at: Date.now() };
  const path = candPath(A.escrow, cat);
  if (!S || !S.create) return json(503, { error: "candidates can't be stored right now" });
  if (!(await S.create(path, data))) return json(409, { error: "these candidates are already published" });
  candMem.delete(A.escrow);
  return json(200, { ok: true, cat, options });
}
/// the signed text for a published category, so anyone can check the signature
export async function candProof(A, cat) {
  const docs = await candDocs(A);
  const d = docs[cat];
  if (!d && teamCands(A, cat)) return { team: true, options: A.cands[cat].slice(), message: `Published by the ARCIRCLE team in the site's code (api/_burnvote.mjs, GOV[${A.n}].cands)` };
  return d ? { message: candMessage(A.n, A.escrow, cat, d.raw || d.options), signature: d.sig, by: d.by } : null;
}

// every transfer to 0x…dEaD whose amount is a vote of this round, kept incrementally
const dmem = new Map();
async function blockAt(ts, head) {
  let lo = 0, hi = head.number;
  if (head.ts <= ts) return head.number;
  for (let k = 0; k < 40 && lo < hi; k++) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const t = await blockTs(mid);
    if (t != null && t <= ts) lo = mid; else hi = mid - 1;
  }
  return lo;
}
async function directScan(store, A, bal) {
  const key = `cburn/direct/${A.escrow}`;
  const latest = await latestBlock();
  const first = bal.filter(Boolean).reduce((m, c) => Math.min(m, c.at), Infinity);
  let st = dmem.get(key) || null;
  if (!st && store) { try { st = await store.get(key); } catch { st = null; } }
  if (!Number.isFinite(first)) return { st: { hi: latest.number, ev: [] }, latest }; // no candidates yet: nothing can be a vote
  if (!st || !Array.isArray(st.ev)) st = { hi: (A.from || (await blockAt(first - 300, latest))) - 1, ev: [] };
  let n = 0, moved = false;
  while (tokenAddr() && st.hi < latest.number && n < MAX_CHUNKS) {
    const ranges = [];
    let a = st.hi + 1;
    for (let k = 0; k < 8 && a <= latest.number && n < MAX_CHUNKS; k++, n++) { const b = Math.min(latest.number, a + CHUNK - 1); ranges.push([a, b]); a = b + 1; }
    let logs;
    try { logs = (await pool(ranges, 8, ([x, y]) => getLogs({ address: tokenAddr(), topics: [T_TRANSFER, null, DEAD_TOPIC], fromBlock: toQty(x), toBlock: toQty(y) }))).flat(); }
    catch { break; }
    const mine = logs.map((l) => ({ l, v: readVoteAmount(l.data) })).filter((x) => x.v && x.v.round === A.n);
    const ts = new Map();
    await pool([...new Set(mine.map((x) => x.l.blockNumber))], 6, async (bn) => { ts.set(bn, await blockTs(parseInt(bn, 16)).catch(() => null)); });
    for (const { l, v } of mine) {
      const t = ts.get(l.blockNumber);
      if (t == null) { logs = null; break; }
      st.ev.push(`${parseInt(l.blockNumber, 16)}|${parseInt(l.logIndex, 16)}|${lc(l.transactionHash)}|0x${strip(l.topics[1]).slice(24)}|${v.cat}|${v.opt}|${v.votes}|${t}`);
    }
    if (!logs) break; // a block time didn't come back: rescan this stretch next time
    st.hi = ranges[ranges.length - 1][1]; moved = true;
  }
  if (moved) { dmem.set(key, st); if (store) { try { await store.set(key, st); } catch { /* this instance keeps it */ } } }
  return { st, latest };
}
const evOf = (r) => { const [b, i, tx, voter, cat, opt, votes, ts] = r.split("|"); return { b: +b, i: +i, tx, voter, cat: +cat, opt: +opt, votes: +votes, ts: +ts }; };
/// does a vote count: its category's candidates were out when it was sent, the candidate exists, the raise was open
const counts = (e, bal, deadline) => { const c = bal[e.cat]; return !!c && e.opt < c.options.length && e.ts >= c.at - 60 && (!deadline || e.ts < deadline); };
/// the whole direct-round picture: candidates, tallies, a voter's own votes, totals and the feed
export async function directState(store, A, voter = null) {
  const bal = await directBallot(A);
  const [{ st, latest }, rs] = await Promise.all([directScan(store, A, bal), roundState(A.escrow).catch(() => null)]);
  const deadline = A.closedAt ? (rs && rs.deadline ? Math.min(rs.deadline, A.closedAt) : A.closedAt) : rs ? rs.deadline : 0;
  const all = st.ev.map(evOf).sort((x, y) => (y.b - x.b) || (y.i - x.i));
  const ev = all.filter((e) => counts(e, bal, deadline));
  const v = voter ? lc(voter) : null;
  const C = catsOf(A);
  const tallies = C.map((_, c) => (bal[c] ? bal[c].options.map(() => 0) : []));
  const mine = C.map((_, c) => (bal[c] ? bal[c].options.map(() => 0) : []));
  const by = new Map();
  let votes = 0;
  for (const e of ev) {
    if (!tallies[e.cat]) continue;
    tallies[e.cat][e.opt] += e.votes; votes += e.votes;
    by.set(e.voter, (by.get(e.voter) || 0) + e.votes);
    if (v && e.voter === v) mine[e.cat][e.opt] += e.votes;
  }
  const opens = bal.filter(Boolean).reduce((m, c) => Math.min(m, c.at), Infinity);
  return {
    mode: "direct", round: A.n, escrow: A.escrow, token: tokenAddr(), recipient: rs ? rs.recipient : null,
    // as in Round #1, voting runs from the start to the close; each category takes votes once its candidates are out
    deadline, now: latest.ts, opensAt: Number.isFinite(opens) ? opens : null, votingEnds: deadline,
    votingOpen: !!rs && rs.started && latest.ts < deadline, closed: A.closedAt && latest.ts >= A.closedAt ? "plan" : null,
    done: st.hi >= latest.number, hi: st.hi, anchor: { block: latest.number, ts: latest.ts },
    categories: C.map((label, c) => ({ id: c, label, set: !!bal[c], at: bal[c] ? bal[c].at : null, options: bal[c] ? bal[c].options : [], tallies: tallies[c], mine: mine[c] })),
    totals: { burned: (BigInt(votes) * VOTE_UNIT).toString(), votes, voters: by.size },
    top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([voter, votes]) => ({ voter, votes })),
    events: ev.slice(0, 60).map((e) => ({ b: e.b, i: e.i, tx: e.tx, cat: e.cat, voter: e.voter, opt: e.opt, votes: e.votes, text: bal[e.cat] ? bal[e.cat].options[e.opt] || "" : "" })),
    uncounted: all.length - ev.length,
  };
}

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
  if (isDirect(A)) return (await directBallot(A)).map((c) => (c ? c.options : []));
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
  if (isDirect(A)) {
    const d = await directState(store, A);
    return { contract: null, mode: "direct", token: d.token, round: A.n, done: d.done, hi: d.hi, anchor: d.anchor, totals: d.totals, events: d.events, top: d.top, closedAt: A.closedAt || null };
  }
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
  const dv = (rc.logs || []).filter((l) => lc(l.address) === tokenAddr() && l.topics && lc(l.topics[0]) === T_TRANSFER && lc(l.topics[2]) === DEAD_TOPIC)
    .map((l) => ({ l, v: readVoteAmount(l.data) })).filter((x) => x.v);
  const DA = dv.length ? known.find((g) => isDirect(g) && g.n === dv[0].v.round) : null;
  if (DA) {
    const [bal, blk, rs] = await Promise.all([directBallot(DA), rpcCall("eth_getBlockByNumber", [rc.blockNumber, false]).catch(() => null), roundState(DA.escrow).catch(() => null)]);
    const ts = blk ? parseInt(blk.timestamp, 16) : null;
    const items = dv.filter((x) => x.v.round === DA.n)
      .map(({ l, v }) => ({ voter: "0x" + strip(l.topics[1]).slice(24), cat: v.cat, opt: v.opt, votes: v.votes, ts }))
      .filter((e) => ts != null && counts(e, bal, rs ? rs.deadline : 0));
    if (!items.length) return null;
    const votes = items.reduce((a, e) => a + e.votes, 0);
    return {
      tx, round: DA.n, voter: items[0].voter, block: parseInt(rc.blockNumber, 16), ts, votes, burned: (BigInt(votes) * 1000n).toString(),
      items: items.map((e) => ({ cat: e.cat, category: ALL_CATS[e.cat] || "", opt: e.opt, text: bal[e.cat].options[e.opt] || "", votes: e.votes })),
    };
  }
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
  if (isDirect(A)) {
    const d = await directState(null, A);
    return {
      mode: "direct", categories: d.categories.map((c) => ({ id: c.id, label: c.label, options: c.options.map((text, i) => ({ text, votes: c.tallies[i] || 0 })) })),
      burned: d.totals.burned, votes: d.totals.votes, voters: d.totals.voters, opensAt: d.opensAt || 0, votingEnds: d.votingEnds,
    };
  }
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

export const _test = {
  useStore(m) { S = m || CONFIGURED; candMem.clear(); dmem.clear(); },
  setToken(t) { /* tests point the scan at a local token */ TOKEN_OVERRIDE.v = String(t).toLowerCase(); },
};
