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

import { ESCROW, ARCIRCLE, ARCIRCLE_LIVE, FACTORY, VOTE, kec, S, CONTRIBUTED, big, roundState, contributionOf } from "./_round.mjs";
export { ESCROW, roundState, contributionOf };
const lc = (a) => String(a || "").toLowerCase();
const usd = (wei) => Number(wei) / 1e18; // native USDC on Arc: 18 decimals
export const textHash = (t) => kec(String(t));

// ---- messages (circlepad-community.js builds the exact same text) ----
export const pledgeMessage = (wallet, amount, issued) => `ARCIRCLE PAD — CirclePad pledge\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nAmount: ${amount} USDC\nIssued: ${issued}`;
export const qaMessage = (wallet, text, parent, issued) => `ARCIRCLE PAD — CirclePad Q&A\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nReply to: ${parent || "-"}\nIssued: ${issued}\nText: ${textHash(text)}`;
export const propMessage = (wallet, p, issued) => `ARCIRCLE PAD — CirclePad proposal\nWallet: ${lc(wallet)}\nIssued: ${issued}\nContent: ${textHash(JSON.stringify([p.title, p.pitch, p.link]))}`;
export const upMessage = (wallet, id) => `ARCIRCLE PAD — upvote CirclePad proposal\nProposal: ${id}\nWallet: ${lc(wallet)}`;
// Round #1 governance: anyone with a wallet can suggest a candidate for one of
// the five categories the vote decides; the recipient picks from them.
export const IDEA_CATS = ["name", "ticker", "logo", "roadmap", "date"];
export const ideaMessage = (wallet, cat, text, note, issued) => `ARCIRCLE PAD — CirclePad idea\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nCategory: ${IDEA_CATS[cat]}\nIssued: ${issued}\nContent: ${textHash(JSON.stringify([text, note]))}`;
export const ideaUpMessage = (wallet, id) => `ARCIRCLE PAD — back a CirclePad idea\nIdea: ${id}\nWallet: ${lc(wallet)}`;
export const hideMessage = (wallet, kind, id, issued) => `ARCIRCLE PAD — CirclePad moderation\nRound: ${ESCROW}\nHide ${kind}: ${id}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;

// ---- chain reads ----
let creatorsCache = null;
export async function creatorCounts() {
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
  const [bals, creators] = await Promise.all([(ARCIRCLE_LIVE ? ethCalls(list.map((a) => ({ to: ARCIRCLE, data: S.balanceOf + pad(a) }))) : Promise.resolve(list.map(() => null))), creatorCounts().catch(() => new Map())]);
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
      contributionOf(wallet), getDocs([`circlePledges/${ESCROW}_${wallet}`]), (ARCIRCLE_LIVE ? ethCalls([{ to: ARCIRCLE, data: S.balanceOf + pad(wallet) }]) : Promise.resolve([null])),
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

// ---- governance ideas ----
const IDEA_MAX = [32, 10, 300, 400, 30];
const IDEAS_PER_DAY = 5;
/// Normalises one suggestion for its category, or returns { error }.
export function ideaText(cat, raw) {
  let t = String(raw || "").replace(/\r/g, "").trim();
  if (cat === 3) t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  else t = t.replace(/\s+/g, " ");
  if (!t) return { error: "write your idea first" };
  if (t.length > IDEA_MAX[cat]) return { error: `keep it under ${IDEA_MAX[cat]} characters` };
  if (cat === 0 && t.length < 2) return { error: "a name needs at least 2 characters" };
  if (cat === 1) { t = t.replace(/^\$/, "").toUpperCase(); if (!/^[A-Z0-9]{1,10}$/.test(t)) return { error: "tickers use letters and numbers only, up to 10" }; }
  if (cat === 2) {
    if (/^ipfs:\/\/[A-Za-z0-9./_-]+$/.test(t)) return { t };
    try { const u = new URL(t); if (u.protocol !== "https:" || /["'<>\s`]/.test(t)) throw 0; } catch { return { error: "a logo needs an https:// or ipfs:// image link" }; }
  }
  if (cat === 3 && t.length < 10) return { error: "describe the plan in at least 10 characters" };
  if (cat === 4) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t) || !Number.isFinite(Date.parse(t))) return { error: "pick a date and time" };
    const ms = Date.parse(t);
    if (ms < Date.now()) return { error: "the launch date needs to be in the future" };
    if (ms > Date.now() + 365 * 86400e3) return { error: "pick a date within a year" };
  }
  return { t };
}
async function ballotSet(cat) {
  if (!VOTE) return false;
  const [h] = await ethCalls([{ to: VOTE, data: S.optionsSet + cat.toString(16).padStart(64, "0") }]);
  return big(h) > 0n;
}
export async function ideasData(wallet) {
  wallet = lc(wallet);
  const docs = await queryDocs("circleIdeas", "round", ESCROW, 600);
  const live = docs.filter((d) => !d.hidden).sort((a, b) => (b.up || 0) - (a.up || 0) || a.at - b.at);
  const per = [0, 0, 0, 0, 0];
  const ideas = live.filter((d) => d.cat >= 0 && d.cat < 5 && per[d.cat]++ < 60)
    .map((d) => ({ id: d.id, cat: d.cat, wallet: d.wallet, text: d.text, note: d.note || "", up: d.up || 0, at: d.at, team: !!d.team }));
  const out = { enabled: true, round: ESCROW, ideas, myUps: [] };
  if (isAddr(wallet) && ideas.length) {
    const paths = ideas.map((i) => `circleIdeaVotes/${i.id}_${wallet}`);
    const got = await getDocs(paths);
    out.myUps = ideas.filter((i) => got[`circleIdeaVotes/${i.id}_${wallet}`]).map((i) => i.id);
  }
  return out;
}
export async function ideaPost(b, recover, json) {
  const wallet = lc(b.wallet), cat = Number(b.cat);
  if (!isAddr(wallet)) return json(400, { error: "wallet must be an address" });
  if (!Number.isInteger(cat) || cat < 0 || cat > 4) return json(400, { error: "pick a category" });
  // the signature covers exactly what was typed; the check below works on the tidied form
  const rawText = String(b.text || ""), rawNote = String(b.note || "");
  const n = ideaText(cat, rawText);
  if (n.error) return json(400, { error: n.error });
  const note = rawNote.replace(/\s+/g, " ").trim();
  if (note.length > 140) return json(400, { error: "keep the note under 140 characters" });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  let signer; try { signer = recover(ideaMessage(wallet, cat, rawText, rawNote, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  if (await ballotSet(cat)) return json(409, { error: "the candidates for this one are already on the ballot" });
  const st = await roundState().catch(() => null);
  const team = !!(st && wallet === st.recipient);
  const rk = `rate/cidea_${wallet}_${dayKey()}`;
  if (!team && (await limited(rk, IDEAS_PER_DAY))) return json(429, { error: `${IDEAS_PER_DAY} ideas a day per wallet — try again tomorrow` });
  // one entry per idea: the same suggestion twice points people at the first one
  const id = kec(`${ESCROW}|${cat}|${n.t.toLowerCase()}`).slice(2, 18);
  const r = await commit([{ create: `circleIdeas/${id}`, data: { id, round: ESCROW, cat, wallet, text: n.t, note, up: 0, at: Date.now(), hidden: false, team } }, { inc: rk, fields: { n: 1 } }]);
  if (r.conflict) return json(409, { error: "someone already suggested this — back it instead", id, dup: true });
  return json(200, { ok: true, id, text: n.t });
}
export async function ideaUp(b, recover, json) {
  const wallet = lc(b.wallet), id = String(b.id || "");
  if (!isAddr(wallet) || !/^[0-9a-f]{16}$/.test(id)) return json(400, { error: "bad request" });
  let signer; try { signer = recover(ideaUpMessage(wallet, id), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  const cur = (await getDocs([`circleIdeas/${id}`]))[`circleIdeas/${id}`];
  if (!cur || cur.hidden) return json(404, { error: "that idea is gone" });
  const r = await commit([{ create: `circleIdeaVotes/${id}_${wallet}`, data: { id, wallet, at: Date.now() } }, { inc: `circleIdeas/${id}`, fields: { up: 1 } }]);
  if (r.conflict) return json(409, { error: "you already backed this one", already: true });
  return json(200, { ok: true, up: (cur.up || 0) + 1 });
}

/// The round's recipient wallet can hide a Q&A post, a proposal or an idea.
export async function hide(b, recover, json) {
  const wallet = lc(b.wallet), kind = b.kind === "prop" || b.kind === "idea" ? b.kind : "qa", id = String(b.id || "");
  if (!isAddr(wallet) || !/^[0-9a-f]{16}$/.test(id)) return json(400, { error: "bad request" });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  let signer; try { signer = recover(hideMessage(wallet, kind, id, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet || wallet !== (await roundState()).recipient) return json(403, { error: "only the round's recipient wallet can hide posts" });
  const path = kind === "prop" ? `circleProps/${id}` : kind === "idea" ? `circleIdeas/${id}` : `circleQA/${id}`;
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
export async function blockAtOrBefore(ts, hi) {
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
    // stored as "kind|wallet|amount|block|logIndex|txHash" (older entries have no hash)
    for (const l of logs) L.ev.push([lc(l.topics[0]) === CONTRIBUTED ? 1 : 0, "0x" + String(l.topics[1]).slice(26).toLowerCase(), BigInt("0x" + String(l.data).slice(2, 66)).toString(), parseInt(l.blockNumber, 16), parseInt(l.logIndex, 16), lc(l.transactionHash || "")].join("|"));
    L.scannedTo = b; chunks++;
  }
  const complete = L.scannedTo >= to;
  const EV = L.ev.map((x) => { const [k, w, amt, n, i, h] = String(x).split("|"); return [Number(k), w, amt, Number(n), Number(i), h || null]; });
  const net = new Map(), inn = new Map(), out = new Map();
  // Money both ways, for the "in & out" card: every contribution and every
  // withdrawal ever made in this round, not just the current net balances.
  const totals = { in: 0n, out: 0n, nIn: 0, nOut: 0 };
  for (const [k, w, amt] of EV) {
    const v = BigInt(amt);
    net.set(w, (net.get(w) || 0n) + (k ? v : -v));
    (k ? inn : out).set(w, ((k ? inn : out).get(w) || 0n) + v);
    if (k) { totals.in += v; totals.nIn++; } else { totals.out += v; totals.nOut++; }
  }
  const rows = [...net.entries()].filter(([, v]) => v > 0n).sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))
    .map(([address, v]) => ({ address, amount: v.toString(), depositedTotal: (inn.get(address) || 0n).toString(), withdrawnTotal: (out.get(address) || 0n).toString() }));
  const recent = [...EV].sort((x, y) => x[3] - y[3] || x[4] - y[4]).slice(-30).reverse();
  const tsOf = new Map();
  await Promise.all([...new Set(recent.map((e) => e[3]))].map(async (n) => { tsOf.set(n, (await blockTs(n)) || 0); }));
  const activity = recent.map(([k, w, amt, n, , h]) => ({ contributor: w, amount: amt, kind: k ? "in" : "out", ts: tsOf.get(n) || 0, tx: h || null }));
  const flow = {
    in: totals.in.toString(), out: totals.out.toString(), net: (totals.in - totals.out).toString(), nIn: totals.nIn, nOut: totals.nOut,
    wallets: inn.size, refunders: out.size, holding: rows.length,
  };
  // Join order (first contribution per wallet) for "#n in the circle", and
  // the net raised over time, hour by hour, for the transparency chart. Block
  // times are interpolated between the round's first block and the head —
  // Arc's block time is steady enough for an hourly chart.
  const ordered = [...EV].sort((x, y) => x[3] - y[3] || x[4] - y[4]);
  const joinOrder = [];
  { const seen = new Set(); for (const [k, w] of ordered) if (k && !seen.has(w)) { seen.add(w); joinOrder.push(w); } }
  const t0 = st.deadline - FUNDING, tEnd = Math.min(head.ts, st.deadline);
  const spb = head.number > L.from ? Math.max(0.05, (head.ts - t0) / (head.number - L.from)) : 0.5;
  const tsAt = (n) => Math.round(t0 + (n - L.from) * spb);
  const series = [];
  { let run = 0n, i = 0; for (let t = t0 + 3600; ; t += 3600) { const cut = Math.min(t, tEnd); while (i < ordered.length && tsAt(ordered[i][3]) <= cut) { const [k, , amt] = ordered[i]; run += k ? BigInt(amt) : -BigInt(amt); i++; } series.push([cut, run.toString()]); if (cut >= tEnd || series.length > 100) break; } }
  const outv = { started: true, rows, activity, flow, complete, scannedTo: L.scannedTo, joinOrder, series, startTs: t0 };
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
