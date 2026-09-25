// api/_circle.mjs — CirclePad's off-chain layer, served through /api/social
// (no extra function): pledges before the raise opens, the round Q&A, the
// board of candidate projects for future rounds, referral totals read from
// contribution transactions, and leaderboard badges.
//
// Nothing here touches funds. Every write is signed by the wallet it speaks
// for, the round's state (started, recipient, contributions) is read from the
// escrow contract itself, and referrals are taken from the contribution
// transaction's own calldata, so none of it can be claimed for someone else.
import { ethCalls, rpcCall, isAddr, pad, wAddr, getLogs, latestBlock, blockTs, toQty } from "./_arc.mjs";
import { storeEnabled } from "./_store.mjs";
import { getDocs, setDoc, commit, queryDocs } from "./_store.mjs";

import { ESCROW, ARCIRCLE, FACTORY, kec, S, CONTRIBUTED, big, roundState, contributionOf } from "./_round.mjs";
export { ESCROW, roundState, contributionOf };
const lc = (a) => String(a || "").toLowerCase();
const usd = (wei) => Number(wei) / 1e18; // native USDC on Arc: 18 decimals
export const textHash = (t) => kec(String(t));

// ---- messages (circlepad-community.js builds the exact same text) ----
export const pledgeMessage = (wallet, amount, issued) => `ARCIRCLE PAD — CirclePad pledge\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nAmount: ${amount} USDC\nIssued: ${issued}`;
export const qaMessage = (wallet, text, parent, issued) => `ARCIRCLE PAD — CirclePad Q&A\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nReply to: ${parent || "-"}\nIssued: ${issued}\nText: ${textHash(text)}`;
export const propMessage = (wallet, p, issued) => `ARCIRCLE PAD — CirclePad proposal\nWallet: ${lc(wallet)}\nIssued: ${issued}\nContent: ${textHash(JSON.stringify([p.title, p.pitch, p.link]))}`;
export const upMessage = (wallet, id) => `ARCIRCLE PAD — upvote CirclePad proposal\nProposal: ${id}\nWallet: ${lc(wallet)}`;
export const hideMessage = (wallet, kind, id, issued) => `ARCIRCLE PAD — CirclePad moderation\nRound: ${ESCROW}\nHide ${kind}: ${id}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;

// ---- chain reads ----
let creatorsCache = null;
async function creatorCounts() {
  if (creatorsCache && Date.now() - creatorsCache.at < 10 * 60e3) return creatorsCache.m;
  const [n] = await ethCalls([{ to: FACTORY, data: S.launchCount }]);
  const count = Number(big(n)), m = new Map();
  for (let s = 0; s < count; s += 50) {
    const recs = await ethCalls(Array.from({ length: Math.min(50, count - s) }, (_, k) => ({ to: FACTORY, data: S.launches + pad((s + k).toString(16)) })));
    for (const r of recs) if (r) { const c = lc(wAddr(r, 4)); m.set(c, (m.get(c) || 0) + 1); }
  }
  creatorsCache = { at: Date.now(), m };
  return m;
}
/// { addr: { arcircle: bool, launches: n } } for the leaderboard chips.
export async function badges(addrs) {
  const list = [...new Set(addrs.map(lc).filter(isAddr))].slice(0, 60);
  if (!list.length) return {};
  const [bals, creators] = await Promise.all([ethCalls(list.map((a) => ({ to: ARCIRCLE, data: S.balanceOf + pad(a) }))), creatorCounts().catch(() => new Map())]);
  const out = {};
  list.forEach((a, i) => { out[a] = { arcircle: big(bals[i]) > 0n, launches: creators.get(a) || 0 }; });
  return out;
}

// ---- reads for GET /api/social?circle=1 ----
export async function circleData(wallet) {
  wallet = lc(wallet);
  const [pledges, qa, props, refs, st] = await Promise.all([
    queryDocs("circlePledges", "round", ESCROW), queryDocs("circleQA", "round", ESCROW, 300),
    queryDocs("circleProps", "board", "main", 300), queryDocs("circleRefs", "round", ESCROW), roundState().catch(() => null),
  ]);
  const live = pledges.filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount);
  const byRef = new Map();
  for (const r of refs) { const x = byRef.get(r.ref) || { ref: r.ref, amount: 0, n: 0 }; x.amount += r.amount || 0; x.n += 1; byRef.set(r.ref, x); }
  const out = {
    enabled: true, round: ESCROW, recipient: st ? st.recipient : null, started: st ? st.started : null,
    pledges: { total: live.reduce((s, p) => s + p.amount, 0), count: live.length, top: live.slice(0, 8).map((p) => ({ wallet: p.wallet, amount: p.amount })) },
    myPledge: null,
    qa: qa.filter((q) => !q.hidden).sort((a, b) => a.at - b.at).slice(-120).map((q) => ({ id: q.id, wallet: q.wallet, text: q.text, parent: q.parent || null, team: !!q.team, at: q.at })),
    proposals: props.filter((p) => !p.hidden).sort((a, b) => (b.up || 0) - (a.up || 0) || b.at - a.at).slice(0, 40)
      .map((p) => ({ id: p.id, wallet: p.wallet, title: p.title, pitch: p.pitch, link: p.link || "", up: p.up || 0, at: p.at })),
    myUpvotes: [],
    refs: [...byRef.values()].sort((a, b) => b.amount - a.amount).slice(0, 20),
  };
  if (isAddr(wallet)) {
    const mine = live.find((p) => p.wallet === wallet);
    out.myPledge = mine ? mine.amount : null;
    const ids = out.proposals.map((p) => `circlePropVotes/${p.id}_${wallet}`);
    const d = ids.length ? await getDocs(ids) : {};
    out.myUpvotes = out.proposals.filter((p) => d[`circlePropVotes/${p.id}_${wallet}`]).map((p) => p.id);
  }
  return out;
}

// ---- writes ----
function issuedOk(iso, maxAgeMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== iso) return false;
  return t <= Date.now() + 2 * 60e3 && Date.now() - t <= maxAgeMs;
}
const idOf = (sig) => kec(String(sig)).slice(2, 18);
async function limited(key, max) {
  const d = (await getDocs([key]))[key];
  return !!(d && d.n >= max);
}
const hourKey = () => new Date().toISOString().slice(0, 13).replace(/\D/g, "");
const dayKey = () => new Date().toISOString().slice(0, 10).replace(/\D/g, "");

export async function pledge(b, recover, json) {
  const wallet = lc(b.wallet);
  const amount = String(b.amount || "").trim();
  if (!isAddr(wallet)) return json(400, { error: "wallet must be an address" });
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) > 10_000_000) return json(400, { error: "enter an amount in USDC, up to 2 decimals" });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  let signer; try { signer = recover(pledgeMessage(wallet, amount, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  const st = await roundState();
  if (st.started) return json(409, { error: "the raise is open — contribute instead of pledging" });
  await setDoc(`circlePledges/${ESCROW}_${wallet}`, { round: ESCROW, wallet, amount: Number(amount), at: Date.now() });
  return json(200, { ok: true, amount: Number(amount) });
}

export async function qaPost(b, recover, json) {
  const wallet = lc(b.wallet), text = String(b.text || "").replace(/\s+\n/g, "\n").trim(), parent = b.parent ? String(b.parent) : "";
  if (!isAddr(wallet)) return json(400, { error: "wallet must be an address" });
  if (text.length < 3 || text.length > 500) return json(400, { error: "write between 3 and 500 characters" });
  if (parent && !/^[0-9a-f]{16}$/.test(parent)) return json(400, { error: "bad reply target" });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  let signer; try { signer = recover(qaMessage(wallet, text, parent, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  const st = await roundState();
  const team = wallet === st.recipient;
  if (!team) {
    // Contributors, pledgers and $ARCIRCLE holders can post — enough to keep
    // drive-by spam out without closing the room to newcomers.
    const [contrib, pl, bal] = await Promise.all([
      contributionOf(wallet), getDocs([`circlePledges/${ESCROW}_${wallet}`]), ethCalls([{ to: ARCIRCLE, data: S.balanceOf + pad(wallet) }]),
    ]);
    const pledged = pl[`circlePledges/${ESCROW}_${wallet}`];
    if (!(contrib > 0n || (pledged && pledged.amount > 0) || big(bal[0]) > 0n)) return json(403, { error: "pledge, contribute or hold $ARCIRCLE to post in the round Q&A" });
  }
  const rk = `rate/cqa_${wallet}_${hourKey()}`;
  if (!team && (await limited(rk, 6))) return json(429, { error: "that's a lot of posts — try again in an hour" });
  if (parent) { const p = (await getDocs([`circleQA/${parent}`]))[`circleQA/${parent}`]; if (!p || p.hidden) return json(404, { error: "that question is gone" }); }
  const id = idOf(b.signature);
  const r = await commit([{ create: `circleQA/${id}`, data: { round: ESCROW, wallet, text, parent: parent || null, team, at: Date.now(), hidden: false } }, { inc: rk, fields: { n: 1 } }]);
  if (r.conflict) return json(409, { error: "already posted" });
  return json(200, { ok: true, id, team });
}

const LINK_OK = (u) => { try { const x = new URL(u); return x.protocol === "https:" && u.length <= 200; } catch { return false; } };
export async function propPost(b, recover, json) {
  const wallet = lc(b.wallet);
  const p = { title: String(b.title || "").trim(), pitch: String(b.pitch || "").trim(), link: String(b.link || "").trim() };
  if (!isAddr(wallet)) return json(400, { error: "wallet must be an address" });
  if (p.title.length < 3 || p.title.length > 80) return json(400, { error: "the name needs 3–80 characters" });
  if (p.pitch.length < 10 || p.pitch.length > 400) return json(400, { error: "the pitch needs 10–400 characters" });
  if (p.link && !LINK_OK(p.link)) return json(400, { error: "the link must be a full https:// address" });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  let signer; try { signer = recover(propMessage(wallet, p, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  const rk = `rate/cprop_${wallet}_${dayKey()}`;
  if (await limited(rk, 3)) return json(429, { error: "three proposals a day per wallet — try again tomorrow" });
  const id = idOf(b.signature);
  const r = await commit([{ create: `circleProps/${id}`, data: { board: "main", wallet, ...p, up: 0, at: Date.now(), hidden: false } }, { inc: rk, fields: { n: 1 } }]);
  if (r.conflict) return json(409, { error: "already posted" });
  return json(200, { ok: true, id });
}

export async function propUp(b, recover, json) {
  const wallet = lc(b.wallet), id = String(b.id || "");
  if (!isAddr(wallet) || !/^[0-9a-f]{16}$/.test(id)) return json(400, { error: "bad request" });
  let signer; try { signer = recover(upMessage(wallet, id), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  const cur = (await getDocs([`circleProps/${id}`]))[`circleProps/${id}`];
  if (!cur || cur.hidden) return json(404, { error: "that proposal is gone" });
  const r = await commit([{ create: `circlePropVotes/${id}_${wallet}`, data: { id, wallet, at: Date.now() } }, { inc: `circleProps/${id}`, fields: { up: 1 } }]);
  if (r.conflict) return json(409, { error: "you already backed this one", already: true });
  return json(200, { ok: true, up: (cur.up || 0) + 1 });
}

/// The round's recipient wallet can hide a Q&A post or a proposal.
export async function hide(b, recover, json) {
  const wallet = lc(b.wallet), kind = b.kind === "prop" ? "prop" : "qa", id = String(b.id || "");
  if (!isAddr(wallet) || !/^[0-9a-f]{16}$/.test(id)) return json(400, { error: "bad request" });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  let signer; try { signer = recover(hideMessage(wallet, kind, id, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet || wallet !== (await roundState()).recipient) return json(403, { error: "only the round's recipient wallet can hide posts" });
  const path = kind === "prop" ? `circleProps/${id}` : `circleQA/${id}`;
  const cur = (await getDocs([path]))[path];
  if (!cur) return json(404, { error: "not found" });
  await setDoc(path, { ...cur, hidden: true, hiddenAt: Date.now() });
  return json(200, { ok: true });
}

/// A contribution sent from a referral link carries the referrer's address
/// after the contribute() selector. Anyone may report the tx hash; the
/// referrer, contributor and amount all come from the chain.
export async function refReport(b, json) {
  const tx = String(b.tx || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "tx must be a transaction hash" });
  const have = (await getDocs([`circleRefs/${tx}`]))[`circleRefs/${tx}`];
  if (have) return json(200, { ok: true, already: true, ref: have.ref });
  const [t, rc] = await Promise.all([rpcCall("eth_getTransactionByHash", [tx]), rpcCall("eth_getTransactionReceipt", [tx])]);
  if (!t || !rc) return json(404, { error: "transaction not found yet — try again in a moment" });
  if (lc(t.to) !== ESCROW || rc.status !== "0x1") return json(400, { error: "not a successful CirclePad contribution" });
  const input = lc(t.input || t.data);
  if (!input.startsWith(S.contribute) || input.length !== 10 + 40) return json(400, { error: "this contribution has no referrer" });
  const ref = "0x" + input.slice(10), from = lc(t.from);
  if (!isAddr(ref) || ref === from) return json(400, { error: "self-referrals don't count" });
  const log = (rc.logs || []).find((l) => lc(l.address) === ESCROW && lc(l.topics && l.topics[0]) === CONTRIBUTED && lc(l.topics[1]).endsWith(from.slice(2)));
  if (!log) return json(400, { error: "no contribution in that transaction" });
  const amount = usd(BigInt("0x" + String(log.data).slice(2, 66)));
  const r = await commit([{ create: `circleRefs/${tx}`, data: { round: ESCROW, ref, from, amount, at: Date.now() } }]);
  return json(200, { ok: true, ref, amount, already: !!r.conflict });
}

// ---- leaderboard, aggregated once on the server ----
// Every visitor used to rebuild the leaderboard in the browser: a block
// search for the round's start, then up to ~60 eth_getLogs chunks. The
// server does it once, keeps the scanned events (memory, and Firestore when
// configured, so a cold function resumes where the last one stopped), reads
// at most MAX_CHUNKS new chunks per request, and serves the result to all.
const REFUNDED = kec("Refunded(address,uint256,uint256)");
const CHUNK = 9000, MAX_CHUNKS = 24, FUNDING = 72 * 3600;
let lbMem = null;
async function blockAtOrBefore(ts, hi) {
  let lo = Math.max(0, hi.number - Math.ceil((hi.ts - ts) * 2.2) - 5000), loTs = await blockTs(lo);
  while (loTs != null && loTs > ts && lo > 0) { lo = Math.max(0, lo - 200000); loTs = await blockTs(lo); }
  let top = hi.number;
  while (top - lo > 1) { const mid = Math.floor((lo + top) / 2), t = await blockTs(mid); if (t != null && t <= ts) lo = mid; else top = mid; }
  return lo;
}
export async function leaderboard(wallet) {
  const st = await roundState();
  if (!st.started) return { started: false, rows: [], activity: [], complete: true };
  if (lbMem && Date.now() - lbMem.at < 12e3) return withMine(lbMem.out, lbMem.EV, wallet);
  const key = `circleLb/${ESCROW}`;
  let L = lbMem ? lbMem.L : null;
  if (!L && storeEnabled()) { try { L = (await getDocs([key]))[key]; } catch { L = null; } }
  if (!L || L.deadline !== st.deadline) L = { deadline: st.deadline, from: null, scannedTo: null, end: null, ev: [] };
  const head = await latestBlock();
  if (L.from == null) { L.from = await blockAtOrBefore(st.deadline - FUNDING, head); L.scannedTo = L.from - 1; }
  let to = head.number;
  if (head.ts > st.deadline + 60) { if (L.end == null) L.end = (await blockAtOrBefore(st.deadline, head)) + 50; to = Math.min(to, L.end); }
  let chunks = 0;
  while (L.scannedTo < to && chunks < MAX_CHUNKS) {
    const a = L.scannedTo + 1, b = Math.min(to, a + CHUNK - 1);
    const logs = await getLogs({ address: ESCROW, fromBlock: toQty(a), toBlock: toQty(b), topics: [[CONTRIBUTED, REFUNDED]] });
    // stored as "kind|wallet|amount|block|logIndex" strings (Firestore can't nest arrays)
    for (const l of logs) L.ev.push([lc(l.topics[0]) === CONTRIBUTED ? 1 : 0, "0x" + String(l.topics[1]).slice(26).toLowerCase(), BigInt("0x" + String(l.data).slice(2, 66)).toString(), parseInt(l.blockNumber, 16), parseInt(l.logIndex, 16)].join("|"));
    L.scannedTo = b; chunks++;
  }
  const complete = L.scannedTo >= to;
  const EV = L.ev.map((x) => { const [k, w, amt, n, i] = String(x).split("|"); return [Number(k), w, amt, Number(n), Number(i)]; });
  const net = new Map(), inn = new Map(), out = new Map();
  for (const [k, w, amt] of EV) {
    const v = BigInt(amt);
    net.set(w, (net.get(w) || 0n) + (k ? v : -v));
    (k ? inn : out).set(w, ((k ? inn : out).get(w) || 0n) + v);
  }
  const rows = [...net.entries()].filter(([, v]) => v > 0n).sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))
    .map(([address, v]) => ({ address, amount: v.toString(), depositedTotal: (inn.get(address) || 0n).toString(), withdrawnTotal: (out.get(address) || 0n).toString() }));
  const recent = [...EV].sort((x, y) => x[3] - y[3] || x[4] - y[4]).slice(-15).reverse();
  const tsOf = new Map();
  await Promise.all([...new Set(recent.map((e) => e[3]))].map(async (n) => { tsOf.set(n, (await blockTs(n)) || 0); }));
  const activity = recent.map(([k, w, amt, n]) => ({ contributor: w, amount: amt, kind: k ? "in" : "out", ts: tsOf.get(n) || 0 }));
  const outv = { started: true, rows, activity, complete, scannedTo: L.scannedTo };
  lbMem = { at: Date.now(), L, out: outv, EV };
  if (storeEnabled() && chunks) { try { await setDoc(key, L); } catch { /* memory copy still works */ } }
  return withMine(outv, EV, wallet);
}
async function withMine(outv, EV, wallet) {
  wallet = lc(wallet);
  if (!isAddr(wallet)) return outv;
  const mine = EV.filter((e) => e[1] === wallet).sort((x, y) => y[3] - x[3] || y[4] - x[4]).slice(0, 25);
  const ts = new Map();
  await Promise.all([...new Set(mine.map((e) => e[3]))].map(async (n) => { ts.set(n, (await blockTs(n)) || 0); }));
  return { ...outv, mine: mine.map(([k, , amt, n]) => ({ kind: k ? "in" : "out", amount: amt, ts: ts.get(n) || 0 })) };
}
