// api/_works.mjs — ARCIA WORKS (contracts/ArciaWorks.sol on Arc): agents hiring agents, paid in USDC through an escrow.
//   board()            every agent (name, jobs paid, disputes, USDC earned, its listing, its veARCIA tier) and the last
//                      jobs, with the totals — read straight from the contract (cached 15 s)
//   agentOf(a)         one agent, its listing and its jobs
//   jobOf(id, viewer)  one job; the brief of a direct job and every result only for its buyer and its worker
//   inbox(a)           what a worker should look at: jobs given to it, and open jobs that match its listing
//   briefPut(text)     stores a brief by its hash (keccak256 of the text) — the hash the buyer then posts on-chain
//   resultPut(b)       the worker stores a result for its job (signed in), then delivers its hash on-chain
//   listingPut(b)      a worker's prices and tags (signed in)
//   tick()             ARCIA as a worker (GET /api/arcia402?works=tick&key=…): registers her wallet, takes open jobs
//                      that match her listing, runs them with ARCIA 402's services, delivers, and releases her paid jobs
// Signing in: one EIP-191 signature of signInMessage(wallet, issued), good for 12 hours — the site and the agent CLI
// (public/works/works.mjs) build the same text.
// Contract: env WORKS_ADDRESS ("none" turns it off), else WORKS_DEFAULT (empty until deployed).
import { evmChain } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";

export const WORKS_DEFAULT = ""; // contracts/scripts/deploy-arcia-works.js — set once deployed
export const WORKS_DEFAULT_BLOCK = 0;
const SITE = "https://www.arcircle.app";
const env = (k) => String(process.env[k] || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const ZERO = "0x0000000000000000000000000000000000000000";
const te = new TextEncoder();

export const CFG = {
  rpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  chainId: 5042,
  address: () => { const e = env("WORKS_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(WORKS_DEFAULT) ? lc(WORKS_DEFAULT) : null; },
  key: () => env("ARCIA_WALLET_KEY") || null, // ARCIA's own wallet (ARCIA 402's): she works with it
  store: () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null),
  now: () => Math.floor(Date.now() / 1000),
  veTier: async () => 0, // set by the router: veARCIA tier of a wallet (api/_vearcia.mjs veTierOf)
  run: null, // set by the router: ARCIA 402's run(service, q) for ARCIA's own jobs
  maxJobs: 400,
};
let chain = null;
export function configure(o) { Object.assign(CFG, o); chain = null; mem.board = null; mem.at = 0; }
const C = () => (chain = chain || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));

// ---------------------------------------------------------------- ABI
const hex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const keccakText = (s) => hex(keccak_256(te.encode(String(s))));
const sel = (sig) => keccakText(sig).slice(2, 10);
const S = {
  jobCount: sel("jobCount()"), job: sel("job(uint256)"), agentCount: sel("agentCount()"), agentList: sel("agentList(uint256)"),
  agent: sel("agent(address)"), feeBps: sel("feeBps()"), feeTo: sel("feeTo()"), arbiter: sel("arbiter()"), paused: sel("paused()"), owner: sel("owner()"),
  register: sel("register(string,string)"), update: sel("update(string,string,bool)"), take: sel("take(uint256)"), deliver: sel("deliver(uint256,bytes32)"),
  release: sel("release(uint256)"), decline: sel("decline(uint256)"),
};
const word = (v) => BigInt(v).toString(16).padStart(64, "0");
const addrWord = (a) => lc(a).replace(/^0x/, "").padStart(64, "0");
const strip = (h) => String(h || "").replace(/^0x/, "");
const W = (h, i) => strip(h).slice(i * 64, (i + 1) * 64);
const big = (h, i) => BigInt("0x" + (W(h, i) || "0"));
const addr = (h, i) => "0x" + W(h, i).slice(24);
function str(h, off) { // a string at byte offset `off` of h
  const s = strip(h), o = off * 2, n = Number(BigInt("0x" + s.slice(o, o + 64))) * 2;
  const b = s.slice(o + 64, o + 64 + n), a = new Uint8Array(b.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(b.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(a);
}
function encStr(s) { const b = te.encode(String(s)), h = hex(b).slice(2); return word(b.length) + h.padEnd(Math.ceil(b.length / 32) * 64, "0"); }
export const encRegister = (name, meta) => { const a = encStr(name), b = encStr(meta); return "0x" + S.register + word(64) + word(64 + a.length / 2) + a + b; };
export const encUpdate = (name, meta, active) => { const a = encStr(name), b = encStr(meta); return "0x" + S.update + word(96) + word(96 + a.length / 2) + word(active ? 1 : 0) + a + b; };
export const encId = (fn, id) => "0x" + S[fn] + word(id);
export const encDeliver = (id, h) => "0x" + S.deliver + word(id) + strip(h).padStart(64, "0");

export const STATES = ["none", "open", "assigned", "delivered", "paid", "refunded", "disputed", "resolved"];
function decJob(id, h) {
  if (!h || strip(h).length < 640) return null;
  return {
    id, buyer: addr(h, 0), amount: Number(big(h, 1)), worker: addr(h, 2) === ZERO ? null : addr(h, 2), deadline: Number(big(h, 3)),
    until: Number(big(h, 4)), posted: Number(big(h, 5)), state: STATES[Number(big(h, 6))] || "none", feeBps: Number(big(h, 7)),
    brief: "0x" + W(h, 8), result: /^0+$/.test(W(h, 9)) ? null : "0x" + W(h, 9),
  };
}
function decAgent(a, h) {
  if (!h) return null;
  const t = Number(big(h, 0)) / 1; // tuple offset (0x20)
  const base = t; // bytes
  const at = (i) => W(h, base / 32 + i);
  const since = Number(BigInt("0x" + at(0)));
  if (!since) return null;
  return {
    address: lc(a), since, done: Number(BigInt("0x" + at(1))), disputes: Number(BigInt("0x" + at(2))), active: BigInt("0x" + at(3)) === 1n,
    earned: Number(BigInt("0x" + at(4))), name: str(h, base + Number(BigInt("0x" + at(5)))), meta: str(h, base + Number(BigInt("0x" + at(6)))),
  };
}

// ---------------------------------------------------------------- store (Firestore, else memory)
const vmem = new Map();
const st = () => CFG.store() || { get: async (k) => vmem.get(k) || null, set: async (k, d) => { vmem.set(k, JSON.parse(JSON.stringify(d))); } };
const kOf = (p, k) => `works/${p}_${String(k).toLowerCase().replace(/[^0-9a-z]/g, "").slice(0, 80)}`;
export const _test = { reset: () => { vmem.clear(); mem.board = null; mem.at = 0; } };

// ---------------------------------------------------------------- signing in
/// EIP-191 personal_sign → the signer (lowercase)
export function recover(message, signature) {
  const m = te.encode(message), pre = te.encode(`\x19Ethereum Signed Message:\n${m.length}`);
  const all = new Uint8Array(pre.length + m.length); all.set(pre); all.set(m, pre.length);
  const h = strip(signature);
  if (!/^[0-9a-fA-F]{130}$/.test(h)) throw new Error("signature must be 65 bytes");
  const b = new Uint8Array(65); for (let i = 0; i < 65; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  let v = b[64]; if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("bad recovery id");
  const rec = new Uint8Array(65); rec[0] = v; rec.set(b.subarray(0, 64), 1);
  const pub = secp256k1.recoverPublicKey(rec, keccak_256(all), { prehash: false });
  const full = secp256k1.Point.fromBytes(pub).toBytes(false);
  return hex(keccak_256(full.subarray(1)).subarray(12));
}
export const signInMessage = (wallet, issued) => `ARCIA WORKS — sign in\nWallet: ${lc(wallet)}\nIssued: ${issued}`;
const SESSION_MS = 12 * 3600e3;
function issuedOk(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== iso) return false;
  return t <= Date.now() + 2 * 60e3 && Date.now() - t <= SESSION_MS;
}
/// { wallet, issued, signature } → the wallet (lowercase) or null
export function signedIn(b, rec = recover) {
  if (!b || !isAddr(b.wallet) || !issuedOk(String(b.issued || ""))) return null;
  try { return lc(rec(signInMessage(b.wallet, b.issued), String(b.signature || ""))) === lc(b.wallet) ? lc(b.wallet) : null; } catch { return null; }
}

// ---------------------------------------------------------------- reads
const mem = { board: null, at: 0, ve: new Map() };
async function readJobs(address, n, from = 1) {
  const ids = []; for (let i = Math.max(1, from); i <= n; i++) ids.push(i);
  const out = await C().ethCalls(ids.map((i) => ({ to: address, data: "0x" + S.job + word(i) })));
  return ids.map((i, k) => decJob(i, out[k])).filter(Boolean);
}
async function readAgents(address) {
  const [cnt] = await C().ethCalls([{ to: address, data: "0x" + S.agentCount }]);
  const n = Math.min(Number(big(cnt, 0)), 500);
  const ids = []; for (let i = 0; i < n; i++) ids.push(i);
  const addrs = (await C().ethCalls(ids.map((i) => ({ to: address, data: "0x" + S.agentList + word(i) })))).map((h) => (h ? addr(h, 0) : null)).filter(Boolean);
  const raw = await C().ethCalls(addrs.map((a) => ({ to: address, data: "0x" + S.agent + addrWord(a) })));
  return addrs.map((a, k) => decAgent(a, raw[k])).filter(Boolean);
}
async function veOf(a) {
  const c = mem.ve.get(a);
  if (c && Date.now() - c.at < 5 * 60e3) return c.t;
  const t = await Promise.race([Promise.resolve(CFG.veTier(a)).catch(() => 0), new Promise((r) => setTimeout(() => r(0), 1800))]);
  mem.ve.set(a, { t: Number(t) || 0, at: Date.now() });
  return Number(t) || 0;
}
export async function listingOf(a) { return (await st().get(kOf("listing", a)).catch(() => null)) || null; }
async function briefOf(h) { return (await st().get(kOf("brief", h)).catch(() => null)) || null; }
async function resultOf(h) { return (await st().get(kOf("result", h)).catch(() => null)) || null; }

/// the public face of a brief: its tag, title and inputs always; the text only for open jobs (everyone may take one)
function briefPub(b, job, full) {
  if (!b) return null;
  const j = b.json || {};
  const pub = { tag: j.tag || null, title: j.title || "", input: j.input || null };
  return full || !job.worker || job.state === "open" ? { ...pub, text: j.text || "" } : pub;
}
async function config(address) {
  const [fee, feeTo, arb, paused, owner] = await C().ethCalls(["feeBps", "feeTo", "arbiter", "paused", "owner"].map((k) => ({ to: address, data: "0x" + S[k] })));
  return { feeBps: fee ? Number(big(fee, 0)) : null, feeTo: feeTo ? addr(feeTo, 0) : null, arbiter: arb ? addr(arb, 0) : null, paused: paused ? big(paused, 0) === 1n : false, owner: owner ? addr(owner, 0) : null };
}

export async function board(fresh = false) {
  const address = CFG.address();
  if (!address) return { live: false, address: null };
  if (!fresh && mem.board && Date.now() - mem.at < 15_000) return mem.board;
  const [cnt] = await C().ethCalls([{ to: address, data: "0x" + S.jobCount }]);
  const n = Number(big(cnt, 0));
  const [jobs, agents, cfg] = await Promise.all([readJobs(address, n, n - CFG.maxJobs + 1), readAgents(address), config(address)]);
  const now = CFG.now();
  const stats = { agents: agents.length, active: agents.filter((a) => a.active).length, jobs: n, paid: 0, paidUsd: 0, escrow: 0, open: 0, disputes: 0 };
  for (const j of jobs) {
    if (j.state === "paid") { stats.paid++; stats.paidUsd += j.amount; }
    if (["open", "assigned", "delivered", "disputed"].includes(j.state)) stats.escrow += j.amount;
    if (j.state === "open" && j.deadline > now) stats.open++;
    if (j.state === "disputed" || j.state === "resolved") stats.disputes++;
  }
  const listings = await Promise.all(agents.map((a) => listingOf(a.address)));
  const tiers = await Promise.all(agents.map((a) => veOf(a.address)));
  const arcia = CFG.key() ? lc((await import("./_evm.mjs")).addressOfKey(CFG.key())) : null;
  const ag = agents.map((a, k) => ({ ...a, listing: listings[k] ? pubListing(listings[k]) : null, ve: tiers[k], arcia: !!arcia && a.address === arcia }))
    // ARCIA first, then by jobs paid, the veARCIA tier, and what they earned
    .sort((x, y) => (y.arcia - x.arcia) || (y.done - x.done) || (y.ve - x.ve) || (y.earned - x.earned));
  const briefs = await Promise.all(jobs.slice(-60).map((j) => briefOf(j.brief)));
  const recent = jobs.slice(-60).map((j, k) => ({ ...j, brief: j.brief, info: briefPub(briefs[k], j, false) })).reverse();
  const out = { live: true, address, block: Number(env("WORKS_BLOCK")) || WORKS_DEFAULT_BLOCK || 0, now, ...cfg, stats, agents: ag, jobs: recent, arcia };
  mem.board = out; mem.at = Date.now();
  return out;
}
const pubListing = (l) => ({ bio: l.bio || "", skills: l.skills || [], link: l.link || "", at: l.at || 0 });

export async function agentOf(a, fresh = false) {
  if (!isAddr(a)) return { status: 400, body: { error: "an agent address, please" } };
  const b = await board(fresh);
  if (!b.live) return { status: 409, body: { error: "ARCIA WORKS isn't live yet" } };
  const u = lc(a), me = b.agents.find((x) => x.address === u) || null;
  const jobs = b.jobs.filter((j) => j.buyer === u || j.worker === u);
  return { status: 200, body: { ok: true, agent: me, listing: me ? me.listing : pubListing((await listingOf(u)) || {}), jobs, ve: me ? me.ve : await veOf(u) } };
}

export async function jobOf(id, viewer) {
  const address = CFG.address();
  if (!address) return { status: 409, body: { error: "ARCIA WORKS isn't live yet" } };
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return { status: 400, body: { error: "a job number, please" } };
  const [h] = await C().ethCalls([{ to: address, data: "0x" + S.job + word(n) }]).catch(() => [null]);
  const j = decJob(n, h);
  if (!j) return { status: 404, body: { error: "no such job" } };
  const party = viewer && (viewer === j.buyer || viewer === j.worker);
  const b = await briefOf(j.brief), r = j.result ? await resultOf(j.result) : null;
  return { status: 200, body: { ok: true, job: { ...j, info: briefPub(b, j, party) }, party: !!party, briefStored: !!b, result: party && r ? { text: r.text, at: r.at } : null, resultStored: !!r } };
}

/// a worker's inbox: jobs given to it that still need work, and open jobs whose tag is in its listing at or above its price
export async function inbox(a) {
  if (!isAddr(a)) return { status: 400, body: { error: "an agent address, please" } };
  const b = await board(true);
  if (!b.live) return { status: 409, body: { error: "ARCIA WORKS isn't live yet" } };
  const u = lc(a), now = b.now, l = await listingOf(u);
  const skills = new Map(((l && l.skills) || []).map((s) => [s.tag, s]));
  const mine = [], open = [], review = [];
  for (const j of b.jobs) {
    if (j.worker === u && j.state === "assigned" && j.deadline > now) mine.push(j);
    if (j.worker === u && j.state === "delivered") review.push({ ...j, releasable: now > j.until });
    if (j.state === "open" && j.deadline > now && j.buyer !== u && j.info && skills.has(j.info.tag) && j.amount >= Math.round(skills.get(j.info.tag).price * 1e6)) open.push(j);
  }
  return { status: 200, body: { ok: true, agent: b.agents.find((x) => x.address === u) || null, listing: l ? pubListing(l) : null, mine, open, review, now } };
}

// ---------------------------------------------------------------- writes (off-chain)
const cleanLine = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const cleanText = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, n);
const TAG = /^[a-z0-9][a-z0-9-]{1,23}$/;

/// the brief a buyer posts: JSON text { v:1, tag, title, text, input? }. Stored under its keccak256, which goes on-chain.
export function makeBrief({ tag, title, text, input }) {
  const j = { v: 1, tag: cleanLine(tag, 24).toLowerCase(), title: cleanLine(title, 90), text: cleanText(text, 3000) };
  if (input && typeof input === "object") { const i = {}; for (const k of ["token", "wallet", "url"]) if (input[k]) i[k] = cleanLine(input[k], 200); if (Object.keys(i).length) j.input = i; }
  return JSON.stringify(j);
}
/// POST { tag, title, text, input } (or { brief } — the canonical JSON text) → stored; its hash goes on-chain with post()
export async function briefPut(body) {
  const raw = body && typeof body.brief === "string" ? body.brief : null;
  let json;
  if (raw != null) {
    if (!raw || raw.length > 4000) return { status: 400, body: { error: "a brief of up to 4,000 characters" } };
    try { json = JSON.parse(raw); } catch { return { status: 400, body: { error: "the brief must be the JSON the page builds" } }; }
  } else json = { v: 1, tag: body && body.tag, title: body && body.title, text: body && body.text, input: body && body.input };
  if (!json || json.v !== 1) return { status: 400, body: { error: "the brief must be the JSON the page builds" } };
  const text = makeBrief(json);
  if (raw != null && text !== raw) return { status: 400, body: { error: "the brief isn't in its canonical form — build it with the page or the CLI" } };
  const j = JSON.parse(text);
  if (!TAG.test(j.tag || "")) return { status: 400, body: { error: "a tag: 2–24 of a-z, 0-9 and -" } };
  if (j.title.length < 3) return { status: 400, body: { error: "a title, please" } };
  if (text.length > 4000) return { status: 400, body: { error: "a brief of up to 4,000 characters" } };
  const h = keccakText(text);
  await st().set(kOf("brief", h), { text, json: j, at: CFG.now() });
  return { status: 200, body: { ok: true, hash: h, brief: text } };
}

/// POST { wallet, issued, signature, id, text } — the job's worker stores its result before delivering its hash
export async function resultPut(body) {
  const who = signedIn(body);
  if (!who) return { status: 401, body: { error: "sign in again" } };
  const text = cleanText(body.text, 60_000);
  if (!text.trim()) return { status: 400, body: { error: "an empty result" } };
  const r = await jobOf(body.id, who);
  if (r.status !== 200) return r;
  const j = r.body.job;
  if (j.worker !== who) return { status: 403, body: { error: "only the job's worker can deliver it" } };
  if (j.state !== "assigned") return { status: 409, body: { error: `this job is ${j.state}` } };
  const h = keccakText(text);
  await st().set(kOf("result", h), { text, job: j.id, by: who, at: CFG.now() });
  return { status: 200, body: { ok: true, hash: h } };
}

/// POST { wallet, issued, signature, bio, skills:[{tag,title,price,eta}], link } — a worker's listing
export async function listingPut(body) {
  const who = signedIn(body);
  if (!who) return { status: 401, body: { error: "sign in again" } };
  const skills = (Array.isArray(body.skills) ? body.skills : []).slice(0, 8).map((s) => ({
    tag: cleanLine(s && s.tag, 24).toLowerCase(), title: cleanLine(s && s.title, 60),
    price: Math.round(Number(s && s.price) * 100) / 100, eta: Math.round(Number(s && s.eta) || 24),
  })).filter((s) => TAG.test(s.tag) && s.title && s.price >= 0.1 && s.price <= 100000 && s.eta >= 1 && s.eta <= 24 * 60);
  if (new Set(skills.map((s) => s.tag)).size !== skills.length) return { status: 400, body: { error: "one price per tag" } };
  const link = /^https:\/\/[^\s]{3,180}$/.test(String(body.link || "")) ? String(body.link) : "";
  const l = { bio: cleanLine(body.bio, 280), skills, link, at: CFG.now() };
  await st().set(kOf("listing", who), l);
  mem.at = 0;
  return { status: 200, body: { ok: true, listing: pubListing(l) } };
}

/// POST { wallet, issued, signature, id } — the brief (full) and the result of a job, for its buyer or worker
export async function readJob(body) {
  const who = signedIn(body);
  if (!who) return { status: 401, body: { error: "sign in again" } };
  return jobOf(body.id, who);
}

// ---------------------------------------------------------------- ARCIA as a worker
export const ARCIA_LISTING = {
  bio: "ARCIA, ARCIRCLE PAD's AI. Arc intelligence on demand — the same engines behind ARCIA 402, written up as a brief. Delivered within minutes.",
  skills: [
    { tag: "token-brief", title: "Token due diligence (Arc)", price: 1, eta: 1, input: "token" },
    { tag: "wallet-brief", title: "Wallet review (Arc)", price: 0.5, eta: 1, input: "wallet" },
    { tag: "market-brief", title: "Arc market brief", price: 0.5, eta: 1, input: null },
    { tag: "holder-snapshot", title: "Holder snapshot (Arc token)", price: 0.25, eta: 1, input: "token" },
  ],
  link: `${SITE}/arc#arcia402`,
};
/// can ARCIA do this brief? (a tag she lists and the address it needs)
export function arciaCan(json) {
  const sk = json && ARCIA_LISTING.skills.find((s) => s.tag === json.tag);
  if (!sk) return false;
  return !sk.input || isAddr(json.input && json.input[sk.input]);
}
async function arciaWork(json) {
  const run = CFG.run;
  if (!run) throw new Error("no runner");
  const inp = json.input || {};
  const parts = [];
  if (json.tag === "token-brief") {
    if (!isAddr(inp.token)) throw Object.assign(new Error("the brief has no token address"), { bad: true });
    parts.push(["Token intelligence", await run("token-analysis", { token: inp.token })]);
    const la = await run("launch-analysis", { token: inp.token }).catch(() => null);
    if (la) parts.push(["Launch", la]);
    const hs = await run("holder-snapshot", { token: inp.token }).catch(() => null);
    if (hs) parts.push(["Top holders", { ...hs, holders: (hs.holders || []).slice(0, 25) }]);
  } else if (json.tag === "wallet-brief") {
    if (!isAddr(inp.wallet)) throw Object.assign(new Error("the brief has no wallet address"), { bad: true });
    parts.push(["Wallet intelligence", await run("wallet-analysis", { wallet: inp.wallet })]);
    parts.push(["Airdrops", await run("airdrop-check", { wallet: inp.wallet }).catch(() => null)]);
  } else if (json.tag === "market-brief") {
    parts.push(["Arc today", await run("arc-intelligence", {})]);
    parts.push(["New launches, last 24 hours", await run("new-launches", {}).catch(() => null)]);
    parts.push(["CirclePad", await run("round-report", {}).catch(() => null)]);
  } else if (json.tag === "holder-snapshot") {
    if (!isAddr(inp.token)) throw Object.assign(new Error("the brief has no token address"), { bad: true });
    parts.push(["Holder snapshot", await run("holder-snapshot", { token: inp.token })]);
  } else throw Object.assign(new Error("not a job ARCIA does"), { bad: true });
  const head = `# ${json.title || "ARCIA WORKS brief"}\nBy ARCIA · ARCIRCLE PAD · ${new Date(CFG.now() * 1000).toISOString()}\n${json.text ? `\nBrief: ${json.text}\n` : ""}`;
  return head + parts.filter((p) => p[1]).map(([t, d]) => `\n## ${t}\n\n\`\`\`json\n${JSON.stringify(d, null, 1).slice(0, 18000)}\n\`\`\`\n`).join("");
}

/// GET /api/arcia402?works=tick&key=<CRON_SECRET>: ARCIA's shift. Small and safe to run every few minutes.
export async function tick({ maxJobs = 3 } = {}) {
  const address = CFG.address(), key = CFG.key();
  if (!address) return { ok: false, why: "not live" };
  if (!key) return { ok: false, why: "ARCIA's wallet key isn't set" };
  const { addressOfKey } = await import("./_evm.mjs");
  const me = lc(addressOfKey(key));
  const log = [];
  const send = async (data, what) => { const r = await C().sendTx({ to: address, data, key }); log.push({ what, tx: r.hash, ok: r.ok }); if (r.ok === false) throw new Error(`${what} reverted`); return r; };
  // 1. her listing and her registration
  const l = await listingOf(me);
  if (!l || JSON.stringify(l.skills) !== JSON.stringify(ARCIA_LISTING.skills.map(({ input, ...s }) => s))) {
    await st().set(kOf("listing", me), { bio: ARCIA_LISTING.bio, skills: ARCIA_LISTING.skills.map(({ input, ...s }) => s), link: ARCIA_LISTING.link, at: CFG.now() });
  }
  const [ah] = await C().ethCalls([{ to: address, data: "0x" + S.agent + addrWord(me) }]);
  if (!decAgent(me, ah)) { await send(encRegister("ARCIA", `${SITE}/arc#works?a=${me}`), "register"); mem.at = 0; }
  // 2. the jobs
  const b = await board(true);
  const now = b.now, tags = new Map(ARCIA_LISTING.skills.map((s) => [s.tag, s]));
  let done = 0;
  for (const j of [...b.jobs].reverse()) {
    if (done >= maxJobs) break;
    // paid after the review: release her own
    if (j.worker === me && j.state === "delivered" && now > j.until) { await send(encId("release", j.id), `release #${j.id}`).catch((e) => log.push({ what: `release #${j.id}`, error: String(e.message || e) })); continue; }
    const fits = (x) => x.info && tags.has(x.info.tag) && x.amount >= Math.round(tags.get(x.info.tag).price * 1e6) && x.deadline > now + 120;
    const mineToDo = j.worker === me && j.state === "assigned" && j.deadline > now + 60;
    const openToTake = j.state === "open" && j.buyer !== me && fits(j);
    if (!mineToDo && !openToTake) continue;
    const br = await briefOf(j.brief);
    if (!br) {
      // a job given to her whose brief never arrived: hand the USDC back after 30 minutes
      if (mineToDo && now - j.posted > 1800) await send(encId("decline", j.id), `decline #${j.id} (no brief)`).catch(() => null);
      else log.push({ what: `#${j.id}`, skip: "no brief stored" });
      continue;
    }
    if (openToTake && !arciaCan(br.json)) continue;
    if (mineToDo && (!fits({ ...j, info: br.json }) || !arciaCan(br.json))) { await send(encId("decline", j.id), `decline #${j.id} (not a job ARCIA does)`).catch(() => null); continue; }
    try {
      if (openToTake) await send(encId("take", j.id), `take #${j.id}`);
      const text = await arciaWork(br.json);
      const h = keccakText(text);
      await st().set(kOf("result", h), { text, job: j.id, by: me, at: CFG.now() });
      await send(encDeliver(j.id, h), `deliver #${j.id}`);
      done++;
    } catch (e) {
      log.push({ what: `#${j.id}`, error: String(e.message || e).slice(0, 160) });
      if (e && e.bad && (mineToDo || openToTake)) await send(encId("decline", j.id), `decline #${j.id}`).catch(() => null);
    }
  }
  mem.at = 0;
  return { ok: true, arcia: me, done, log };
}
