// api/_mine.mjs — Builder Mine's server side (api/mine.mjs routes to it; arcia-tg's tick settles with it).
//
// How a mine works (contract: contracts/contracts/BuilderMine.sol):
//   · a holder opens a mine: deposits part of a token's supply for 3–60 days; six layers, each releasing
//     half the one above (32, 16, 8, 4, 2, 1 of 63 parts); the deposit is only ever mined or burned
//   · builders join with 1 USDC, then mine in the browser: the page hashes keccak256(challenge ‖ nonce)
//     looking for SHARE_BITS leading zero bits (mine-worker.js); this file checks every share it gets
//   · each hour (an "epoch") is settled here: that hour's release is split by weight
//       weight = points × pickaxe × (1 + bonuses)       points = shares (capped per hour) + rare ores
//   · a Merkle root of cumulative amounts goes on-chain (the operator's key, MINE_OPERATOR_KEY) —
//     only builders who proved an X post are in it; everyone else's share stays unclaimable and is
//     burned with the rest when the mine ends
// Nothing here can move a mine's tokens: the contract caps every root by the schedule.
//
// Firestore (api/_store.mjs):
//   mines/<id>                 settle state: last epoch, cumulative allocation, leaderboard, stats, root
//   minetree/<id>              the rows of the newest root (for proofs)
//   minefeed/<id>              rare finds, newest first
//   mineu/<id>_<wallet>        a builder: X handle, verified posts, referees, streak
//   minee/<id>_<epoch>_<wallet> one builder's shares in one hour (k = "<id>_<epoch>" for the settle query)
//   mineep/<id>_<epoch>        the hour's running totals (live "your share of this hour")
//   minex/<handle>             X handle → wallet (one X account, one wallet)
//   minetw/<tweet id>          a post already used
import { keccak_256 } from "@noble/hashes/sha3.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ethCalls, isAddr, pad, wAddr, wBig, rpcCall } from "./_arc.mjs";
import { storeEnabled, getDocs, setDoc, commit, queryDocs } from "./_store.mjs";
import { ARCIRCLE_TOKEN } from "./_arcircle.mjs";
import { personalSigner } from "./_tg-lib.mjs";
import { sendTx, addressOfKey } from "./_x402.mjs";

export const SITE = "https://www.arcircle.app";
// BuilderMine on Arc mainnet — keep in step with config-arc.js (BUILDER_MINE_ADDRESS). Empty = not deployed:
// the page runs its practice mine and every write endpoint says so.
export const MINE_ADDRESS_DEFAULT = "";
export const mineAddress = () => { const e = String(process.env.BUILDER_MINE_ADDRESS || "").trim(); return isAddr(e) ? e.toLowerCase() : MINE_ADDRESS_DEFAULT.toLowerCase(); };
export const live = () => isAddr(mineAddress());

// ---------------- the game's numbers (the page reads them from ?cfg=1) ----------------
export const GAME = {
  epoch: 3600,              // one settle per hour
  shareBits: 21,            // a share: keccak starts with 21 zero bits (~2.1M hashes)
  goldBits: 27,             // 1 in 64 shares is also gold
  diamondBits: 31,          // 1 in 1,024 is a diamond
  goldPoints: 20, diamondPoints: 100,
  cap: 600,                 // shares that count per hour (overtime: ×1.5)
  batchEvery: 12,           // seconds between submissions (the server refuses faster than minGap)
  minGap: 8, maxBatch: 60,
  bonusCap: 100,            // bonuses add up to +100% at most
  layers: ["Topsoil", "Clay", "Stone", "Ore vein", "Deep rock", "Core"],
  layerParts: [32, 16, 8, 4, 2, 1],
  pickaxes: [
    { tier: 0, name: "Wooden pickaxe", mult: 1.0 },
    { tier: 1, name: "Stone pickaxe", mult: 1.2 },
    { tier: 2, name: "Iron pickaxe", mult: 1.5 },
    { tier: 3, name: "Gold pickaxe", mult: 1.8 },
    { tier: 4, name: "Diamond pickaxe", mult: 2.2 },
    { tier: 5, name: "Infinite pickaxe", mult: 2.6 },
  ],
  // boosts (BuilderMine boost kinds 1–4)
  boosts: [
    { kind: 1, name: "Lantern", effect: "+15% for 24 h", pct: 15 },
    { kind: 2, name: "Dynamite", effect: "+50% for 1 h", pct: 50 },
    { kind: 3, name: "Lucky charm", effect: "rare ores twice as often for 24 h", pct: 0 },
    { kind: 4, name: "Overtime", effect: "+50% hourly cap for 24 h", pct: 0 },
  ],
  holder: [[100_000, 10], [1_000_000, 20], [5_000_000, 30]], // $ARCIRCLE held → bonus %
  postPct: 5, postMax: 5,     // each extra verified X post (one a day) +5%, up to 5
  refPct: 5, refMax: 5,       // each referee who proved their X post +5%, up to 5
  referredPct: 5,             // joining through someone's link
  streakPct: 2, streakMax: 10, streakMin: 30, // a day with ≥30 shares keeps the streak
  // default item list (the contract's getItems() wins once deployed) — [price $ARCIRCLE, tier, boost, seconds]
  items: [[50_000, 1, 0, 0], [150_000, 2, 0, 0], [400_000, 3, 0, 0], [1_000_000, 4, 0, 0], [2_500_000, 5, 0, 0],
    [30_000, 0, 1, 86400], [20_000, 0, 2, 3600], [40_000, 0, 3, 86400], [30_000, 0, 4, 86400]],
};

// ---------------- small helpers ----------------
const lc = (a) => String(a || "").toLowerCase();
const strip = (h) => String(h).replace(/^0x/, "");
const hexToBytes = (h) => { h = strip(h); if (h.length % 2) h = "0" + h; const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; };
const toHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const kec = (bytes) => keccak_256(bytes);
const sel = (sig) => toHex(kec(new TextEncoder().encode(sig))).slice(0, 10);
const u256 = (v) => BigInt(v).toString(16).padStart(64, "0");
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
export const now = () => Math.floor(Date.now() / 1000);
export const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
function zeros(h) { let z = 0; for (const b of h) { if (b === 0) { z += 8; continue; } return z + Math.clz32(b) - 24; } return z; }
const secret = () => String(process.env.MINE_SECRET || process.env.CRON_SECRET || "").trim();
const hmac = (s) => createHmac("sha256", secret()).update(s).digest();
const opKey = () => String(process.env.MINE_OPERATOR_KEY || "").trim();
export const operatorAddress = () => addressOfKey(opKey());

const S = {
  mineCount: sel("mineCount()"), getMine: sel("getMine(uint256)"), rigOf: sel("rigOf(uint256,address)"), getItems: sel("getItems()"),
  postRoot: sel("postRoot(uint256,bytes32,uint256)"), operator: sel("operator()"), joinFee: sel("joinFee()"), arcBurned: sel("arcircleBurned()"),
  name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567", balanceOf: "0x70a08231", totalSupply: "0x18160ddd",
};
function decodeString(hex) {
  try {
    const h = strip(hex); if (h.length < 128) return "";
    const off = Number(BigInt("0x" + h.slice(0, 64))) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
    return new TextDecoder().decode(hexToBytes(h.slice(off + 64, off + 64 + len))).replace(/\0/g, "").trim();
  } catch { return ""; }
}

// ---------------- chain reads ----------------
const memo = new Map();
async function cached(key, ms, fn) {
  const m = memo.get(key);
  if (m && Date.now() - m.t < ms) return m.v;
  const v = await fn();
  memo.set(key, { t: Date.now(), v });
  return v;
}
function decodeMine(id, hex) {
  if (!hex || strip(hex).length < 13 * 64) return null;
  return {
    id, token: lc(wAddr(hex, 0)), creator: lc(wAddr(hex, 1)), deposited: wBig(hex, 2), rootTotal: wBig(hex, 3), claimed: wBig(hex, 4), burned: wBig(hex, 5),
    start: Number(wBig(hex, 6)), end: Number(wBig(hex, 7)), root: "0x" + strip(hex).slice(8 * 64, 9 * 64), builders: Number(wBig(hex, 9)), rootCount: Number(wBig(hex, 10)),
    unminedBurned: wBig(hex, 11) === 1n, closed: wBig(hex, 12) === 1n,
  };
}
export async function tokenMeta(tokens) {
  const uniq = [...new Set(tokens.map(lc))].filter(isAddr);
  const out = {};
  const need = uniq.filter((t) => !memo.has("tok:" + t));
  if (need.length) {
    const res = await ethCalls(need.flatMap((t) => [{ to: t, data: S.name }, { to: t, data: S.symbol }, { to: t, data: S.decimals }, { to: t, data: S.totalSupply }]));
    need.forEach((t, i) => memo.set("tok:" + t, { t: Date.now(), v: { address: t, name: decodeString(res[i * 4]) || "Token", symbol: decodeString(res[i * 4 + 1]) || "TOKEN", decimals: res[i * 4 + 2] ? Number(BigInt(res[i * 4 + 2])) : 18, supply: res[i * 4 + 3] ? BigInt(res[i * 4 + 3]).toString() : null } }));
  }
  for (const t of uniq) out[t] = memo.get("tok:" + t).v;
  return out;
}
export async function mines({ fresh = false } = {}) {
  if (!live()) return [];
  return cached("mines", fresh ? 0 : 20000, async () => {
    const [c] = await ethCalls([{ to: mineAddress(), data: S.mineCount }]);
    const n = c ? Number(BigInt(c)) : 0;
    const ids = Array.from({ length: Math.min(n, 200) }, (_, i) => n - 1 - i);
    const res = ids.length ? await ethCalls(ids.map((i) => ({ to: mineAddress(), data: S.getMine + u256(i) }))) : [];
    return ids.map((i, k) => decodeMine(i, res[k])).filter(Boolean);
  });
}
export async function mineInfo(id) {
  if (!live() || !/^\d{1,6}$/.test(String(id))) return null;
  const [r] = await ethCalls([{ to: mineAddress(), data: S.getMine + u256(id) }]);
  return decodeMine(Number(id), r);
}
export async function rigs(id, wallets) {
  if (!wallets.length) return {};
  const res = await ethCalls(wallets.flatMap((w) => [{ to: mineAddress(), data: S.rigOf + u256(id) + pad(w) }, { to: ARCIRCLE_TOKEN, data: S.balanceOf + pad(w) }]), { timeoutMs: 9000 });
  const out = {};
  wallets.forEach((w, i) => {
    const r = res[i * 2], b = res[i * 2 + 1];
    out[lc(w)] = r && strip(r).length >= 8 * 64
      ? { joined: wBig(r, 0) === 1n, referrer: lc(wAddr(r, 1)), pickaxe: Number(wBig(r, 2)), claimed: wBig(r, 3), boosts: [4, 5, 6, 7].map((k) => Number(wBig(r, k))), arcircle: b ? BigInt(b) : 0n }
      : { joined: false, referrer: "", pickaxe: 0, claimed: 0n, boosts: [0, 0, 0, 0], arcircle: b ? BigInt(b) : 0n };
  });
  return out;
}
export async function items() {
  if (!live()) return GAME.items.map(([p, tier, boost, dur], id) => ({ id, price: String(BigInt(p) * 10n ** 18n), tier, boost, duration: dur, active: true }));
  return cached("items", 60000, async () => {
    const [r] = await ethCalls([{ to: mineAddress(), data: S.getItems }]);
    if (!r) return [];
    const n = Number(wBig(r, 1));
    return Array.from({ length: n }, (_, i) => ({ id: i, price: wBig(r, 2 + i * 5).toString(), tier: Number(wBig(r, 3 + i * 5)), boost: Number(wBig(r, 4 + i * 5)), duration: Number(wBig(r, 5 + i * 5)), active: wBig(r, 6 + i * 5) === 1n }));
  });
}

// ---------------- the schedule (the contract's _emitted, to the unit) ----------------
export function emitted(m, t) {
  const total = BigInt(m.deposited), start = BigInt(m.start), end = BigInt(m.end), T = BigInt(Math.floor(t));
  if (T <= start) return 0n;
  if (T >= end) return total;
  const layerLen = (end - start) / 6n, elapsed = T - start, k = elapsed / layerLen;
  if (k >= 6n) return total;
  const done = 64n - (1n << (6n - k)), w = 1n << (5n - k);
  return (total * (done * layerLen + w * (elapsed - k * layerLen))) / (63n * layerLen);
}
export const epochs = (m) => Math.ceil((m.end - m.start) / GAME.epoch);
export const epochAt = (m, t) => Math.floor((t - m.start) / GAME.epoch);
export const layerAt = (m, t) => Math.max(0, Math.min(5, Math.floor(((t - m.start) * 6) / Math.max(1, m.end - m.start))));

// ---------------- sessions & work ----------------
export const signInMessage = (w, t) => `Builder Mine · ARCIRCLE PAD\nSign in to mine with this wallet. No transaction, nothing can move.\nWallet: ${lc(w)}\nTime: ${t}`;
export function signIn(w, t, sig) {
  if (!secret()) return { error: "Mining isn't switched on yet (MINE_SECRET)." };
  if (!isAddr(w)) return { error: "That isn't a wallet address." };
  if (!/^\d{10}$/.test(String(t)) || Math.abs(now() - Number(t)) > 600) return { error: "That signature is too old — sign again." };
  if (personalSigner(signInMessage(w, t), sig) !== lc(w)) return { error: "The signature doesn't match that wallet." };
  const exp = now() + 3 * 86400;
  return { token: `${lc(w)}.${exp}.${hmac(`s|${lc(w)}|${exp}`).toString("hex").slice(0, 40)}`, exp };
}
export function session(token, w) {
  const [a, exp, mac] = String(token || "").split(".");
  if (!secret() || lc(a) !== lc(w) || !/^\d+$/.test(exp || "") || Number(exp) < now() || !mac) return false;
  const want = Buffer.from(hmac(`s|${lc(a)}|${exp}`).toString("hex").slice(0, 40)), got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}
/// The hour's challenge for one builder: unknowable before the hour starts, different for every wallet.
export function challenge(id, epoch, w) {
  const seed = hmac(`seed|${id}|${epoch}`);
  return toHex(kec(concat(seed, hexToBytes(u256(id)), hexToBytes(u256(epoch)), hexToBytes(pad(lc(w))))));
}
/// zero bits of keccak256(challenge ‖ nonce) — the same bytes mine-worker.js hashes
export function workOf(ch, nonceHex) {
  const n = strip(nonceHex).toLowerCase();
  if (!/^[0-9a-f]{1,64}$/.test(n)) return -1;
  return zeros(kec(concat(hexToBytes(ch), hexToBytes(n.padStart(64, "0")))));
}
const normNonce = (n) => strip(n).toLowerCase().replace(/^0+(?=.)/, "");

// ---------------- bonuses ----------------
export function holderPct(arcircleRaw) {
  const held = Number(BigInt(arcircleRaw || 0n) / 10n ** 18n);
  let p = 0; for (const [min, pct] of GAME.holder) if (held >= min) p = pct;
  return p;
}
/// Every multiplier for one builder in one hour, itemised (the page shows the same list).
export function weigh({ rig, user, at }) {
  const pick = GAME.pickaxes[Math.max(0, Math.min(5, rig ? rig.pickaxe : 0))];
  const until = (rig && rig.boosts) || [0, 0, 0, 0];
  const u = user || {};
  const parts = [];
  const add = (label, pct) => { if (pct > 0) parts.push({ label, pct }); };
  add("$ARCIRCLE holder", holderPct(rig ? rig.arcircle : 0n));
  add("X posts", Math.min(GAME.postMax, Math.max(0, (u.posts || []).length - 1)) * GAME.postPct);
  add("Referrals", Math.min(GAME.refMax, (u.refs || []).length) * GAME.refPct);
  add("Joined by referral", rig && isAddr(rig.referrer) && !/^0x0{40}$/.test(rig.referrer) ? GAME.referredPct : 0);
  add("Streak", Math.min(GAME.streakMax, Math.max(0, (u.streak || 0) - 1)) * GAME.streakPct);
  add("Lantern", until[0] > at ? GAME.boosts[0].pct : 0);
  add("Dynamite", until[1] > at ? GAME.boosts[1].pct : 0);
  const bonus = Math.min(GAME.bonusCap, parts.reduce((n, p) => n + p.pct, 0));
  return { pickaxe: pick, parts, bonus, mult: pick.mult * (1 + bonus / 100), lucky: until[2] > at, overtime: until[3] > at };
}
export const capFor = (w) => Math.round(GAME.cap * (w && w.overtime ? 1.5 : 1));

// ---------------- store paths ----------------
const P = {
  mine: (id) => `mines/${id}`, tree: (id) => `minetree/${id}`, feed: (id) => `minefeed/${id}`,
  user: (id, w) => `mineu/${id}_${lc(w)}`, ep: (id, e, w) => `minee/${id}_${e}_${lc(w)}`, epTot: (id, e) => `mineep/${id}_${e}`,
  handle: (h) => `minex/${lc(h)}`, tweet: (t) => `minetw/${t}`,
};

// ---------------- shares ----------------
/// Check and count a batch of nonces for the current hour. Returns what counted.
export async function submitShares(id, w, nonces, { m, rig } = {}) {
  if (!storeEnabled()) return { error: "Mining storage isn't set up yet." };
  m = m || await mineInfo(id);
  if (!m) return { error: "No such mine." };
  const t = now();
  if (t < m.start) return { error: "This mine hasn't opened yet." };
  if (t >= m.end) return { error: "This mine has ended." };
  const e = epochAt(m, t);
  // a joined builder's rig is cached a minute (boosts bought meanwhile count from the next minute)
  const rk = `rig:${id}:${lc(w)}`, hit = memo.get(rk);
  if (!rig && hit && Date.now() - hit.t < 60000) rig = hit.v;
  if (!rig) { rig = (await rigs(id, [w]))[lc(w)]; if (rig && rig.joined) memo.set(rk, { t: Date.now(), v: rig }); }
  if (!rig || !rig.joined) return { error: "Join this mine first (1 USDC)." };
  const list = [...new Set((Array.isArray(nonces) ? nonces : []).map(String))].slice(0, GAME.maxBatch);
  const docs = await getDocs([P.ep(id, e, w), P.user(id, w)]);
  const d = docs[P.ep(id, e, w)] || { k: `${id}_${e}`, id: Number(id), e, w: lc(w), shares: 0, gold: 0, diamond: 0, seen: [], at: 0 };
  if (Date.now() - (d.at || 0) < GAME.minGap * 1000) return { error: "Too fast — the page sends your shares every few seconds.", retry: GAME.minGap };
  const wt = weigh({ rig, user: docs[P.user(id, w)], at: t });
  const cap = capFor(wt), goldBits = GAME.goldBits - (wt.lucky ? 1 : 0), diamondBits = GAME.diamondBits - (wt.lucky ? 1 : 0);
  const ch = challenge(id, e, w), seen = new Set(d.seen || []);
  const finds = [];
  let ok = 0, bad = 0, over = 0;
  for (const n of list) {
    const k = normNonce(n);
    if (seen.has(k)) continue;
    const z = workOf(ch, n);
    if (z < GAME.shareBits) { bad++; continue; }
    seen.add(k);
    if (d.shares >= cap) { over++; } else { d.shares++; ok++; }
    if (z >= diamondBits) { d.diamond++; finds.push({ kind: "diamond", z }); }
    else if (z >= goldBits) { d.gold++; finds.push({ kind: "gold", z }); }
  }
  if (bad > list.length / 2 && bad > 2) return { error: "Those shares don't match this hour's challenge — reload the page.", bad };
  d.seen = [...seen].slice(-4000);
  d.at = Date.now();
  const pts = ok + finds.reduce((n, f) => n + (f.kind === "diamond" ? GAME.diamondPoints : GAME.goldPoints), 0);
  const writes = [{ set: P.ep(id, e, w), data: d }];
  if (pts) writes.push({ inc: P.epTot(id, e), fields: { points: pts, shares: ok } });
  await commit(writes);
  if (finds.length) await addFeed(id, finds.map((f) => ({ w: lc(w), kind: f.kind, t, e }))).catch(() => {});
  return { ok: true, epoch: e, counted: ok, over, bad, shares: d.shares, gold: d.gold, diamond: d.diamond, cap, finds };
}
async function addFeed(id, rows) {
  const cur = (await getDocs([P.feed(id)]))[P.feed(id)] || { items: [] };
  cur.items = [...rows.reverse(), ...(cur.items || [])].slice(0, 40);
  await setDoc(P.feed(id), cur);
}
const points = (d) => Math.min(d.shares || 0, 1e9) + (d.gold || 0) * GAME.goldPoints + (d.diamond || 0) * GAME.diamondPoints;

// ---------------- X posts ----------------
export const shareLink = (id, w) => `${SITE}/mine/${id}?r=${lc(w)}`;
const tweetIdOf = (url) => { const m = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/.exec(String(url || "").trim()); return m ? { handle: m[1], id: m[2] } : null; };
async function fetchTweet(tid) {
  // 1) the public embed feed (no key)
  try {
    const token = ((Number(tid) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tid}&lang=en&token=${token}`, { headers: { "user-agent": "Mozilla/5.0 ARCIRCLE-PAD" }, signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      if (j && j.user && j.user.screen_name) {
        const urls = [...((j.entities && j.entities.urls) || []).map((u) => u.expanded_url || ""), ...(j.card && j.card.url ? [j.card.url] : [])];
        return { handle: j.user.screen_name, text: j.text || "", urls, at: Date.parse(j.created_at) / 1000 || 0 };
      }
    }
  } catch { /* try the API */ }
  // 2) X API v2 with the account's keys (api/arcia-x.mjs)
  try {
    const { authHeader } = await import("./arcia-x.mjs");
    const base = `https://api.x.com/2/tweets/${tid}`, q = { expansions: "author_id", "tweet.fields": "created_at,entities", "user.fields": "username" };
    const qs = Object.entries(q).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const r = await fetch(`${base}?${qs}`, { headers: { authorization: authHeader("GET", base, q) }, signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.data) {
      const u = ((j.includes && j.includes.users) || [])[0] || {};
      return { handle: u.username || "", text: j.data.text || "", urls: ((j.data.entities && j.data.entities.urls) || []).map((x) => x.expanded_url || x.unwound_url || ""), at: Date.parse(j.data.created_at) / 1000 || 0 };
    }
  } catch { /* fall through */ }
  return null;
}
/// A builder proves a post: it must link to their own mine link and be theirs. First one unlocks claims.
export async function verifyPost(id, w, url, { m, rig } = {}) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  const ref = tweetIdOf(url);
  if (!ref) return { error: "Paste the link to your post (x.com/<you>/status/…)." };
  m = m || await mineInfo(id);
  if (!m) return { error: "No such mine." };
  if (now() > m.end + 3 * 86400) return { error: "This mine's final roots are done — posts can't count any more." };
  rig = rig || (await rigs(id, [w]))[lc(w)];
  if (!rig || !rig.joined) return { error: "Join this mine first." };
  const docs = await getDocs([P.user(id, w), P.tweet(ref.id), P.handle(ref.handle)]);
  const u = docs[P.user(id, w)] || { id: Number(id), w: lc(w), posts: [], refs: [], streak: 0 };
  if (docs[P.tweet(ref.id)]) return { error: "That post has already been used." };
  const bound = docs[P.handle(ref.handle)];
  if (bound && bound.w !== lc(w)) return { error: `@${ref.handle} is already linked to another wallet.` };
  if (u.x && lc(u.x) !== lc(ref.handle)) return { error: `This wallet posts as @${u.x} — use that account.` };
  const tw = await fetchTweet(ref.id);
  if (!tw) return { error: "Couldn't read that post. Is it public? Try again in a minute." };
  if (lc(tw.handle) !== lc(ref.handle)) return { error: "That link doesn't match the post's author." };
  if (tw.at && tw.at < m.start - 3600) return { error: "That post is older than this mine — write a new one." };
  const want = `/mine/${id}`, hay = [tw.text, ...tw.urls].join(" ").toLowerCase();
  const linked = tw.urls.some((x) => lc(x).includes(want) && lc(x).includes(lc(w))) || (hay.includes(want) && hay.includes(lc(w)));
  if (!linked) return { error: "The post needs your own mine link (the one on your card) — it has your wallet in it." };
  const day = dayOf(tw.at || now());
  if ((u.posts || []).some((p) => p.day === day)) return { error: "One post a day counts — come back tomorrow for the next bonus." };
  if ((u.posts || []).length >= 1 + GAME.postMax) return { error: "You've maxed out post bonuses for this mine." };
  u.x = tw.handle; u.xv = true;
  u.posts = [...(u.posts || []), { id: ref.id, day, t: now() }];
  const writes = [{ set: P.user(id, w), data: u }, { set: P.tweet(ref.id), data: { w: lc(w), id: Number(id), t: now() } }, { set: P.handle(ref.handle), data: { w: lc(w), t: now() } }];
  // the first proven post also counts for whoever referred this builder
  if (u.posts.length === 1 && isAddr(rig.referrer) && !/^0x0{40}$/.test(rig.referrer)) {
    const rd = (await getDocs([P.user(id, rig.referrer)]))[P.user(id, rig.referrer)] || { id: Number(id), w: rig.referrer, posts: [], refs: [], streak: 0 };
    if (!(rd.refs || []).includes(lc(w))) { rd.refs = [...(rd.refs || []), lc(w)]; writes.push({ set: P.user(id, rig.referrer), data: rd }); }
  }
  await commit(writes);
  return { ok: true, handle: tw.handle, posts: u.posts.length, first: u.posts.length === 1, bonusPct: Math.min(GAME.postMax, u.posts.length - 1) * GAME.postPct };
}

// ---------------- Merkle (same tree as the contract test) ----------------
const leaf = (id, a, v) => kec(kec(hexToBytes(u256(id) + pad(a) + u256(v))));
const cmp = (a, b) => { for (let i = 0; i < 32; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const pair = (a, b) => (cmp(a, b) < 0 ? kec(concat(a, b)) : kec(concat(b, a)));
export function buildTree(id, rows) {
  if (!rows.length) return { root: "0x" + "0".repeat(64), proof: () => [] };
  const layers = [rows.map(([a, v]) => leaf(id, a, v))];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? pair(cur[i], cur[i + 1]) : cur[i]);
    layers.push(next);
  }
  return { root: toHex(layers[layers.length - 1][0]), proof: (k) => { const p = []; for (let l = 0; l < layers.length - 1; l++) { const s = k ^ 1; if (s < layers[l].length) p.push(toHex(layers[l][s])); k >>= 1; } return p; } };
}

// ---------------- settle ----------------
/// Settle every finished hour of one mine (up to `maxEpochs` per call), then post a new root if it changed.
export async function settle(m, { maxEpochs = 6, post = true } = {}) {
  const id = m.id, t = now();
  const doc = (await getDocs([P.mine(id)]))[P.mine(id)] || { id, settled: -1, alloc: {}, pts: {}, stats: {} };
  doc.alloc = doc.alloc || {}; doc.pts = doc.pts || {};
  const last = Math.min(epochs(m) - 1, epochAt(m, t - 120) - 1); // an hour settles 2 minutes after it ends
  let done = 0;
  for (let e = (doc.settled ?? -1) + 1; e <= last && done < maxEpochs; e++, done++) {
    const rows = (await queryDocs("minee", "k", `${id}_${e}`, 2000)).filter((r) => isAddr(r.w));
    const ws = rows.map((r) => r.w);
    const [rg, users] = await Promise.all([rigs(id, ws), ws.length ? getDocs(ws.map((w) => P.user(id, w))) : {}]);
    const at = m.start + e * GAME.epoch + GAME.epoch / 2;
    const weights = rows.map((r) => {
      const u = users[P.user(id, r.w)], wt = weigh({ rig: rg[r.w], user: u, at });
      return { w: r.w, r, u, pts: points(r), W: BigInt(Math.round(points(r) * wt.mult * 1e6)) };
    });
    const total = weights.reduce((n, x) => n + x.W, 0n);
    const from = emitted(m, m.start + e * GAME.epoch), to = emitted(m, Math.min(m.end, m.start + (e + 1) * GAME.epoch));
    const pot = to - from;
    const userWrites = [];
    for (const x of weights) {
      if (total > 0n && x.W > 0n) doc.alloc[x.w] = (BigInt(doc.alloc[x.w] || 0) + (pot * x.W) / total).toString();
      doc.pts[x.w] = (doc.pts[x.w] || 0) + x.pts;
      // streak: a day with ≥ streakMin shares (counted at the hour it's reached)
      const day = dayOf(m.start + e * GAME.epoch);
      const u = x.u || { id, w: x.w, posts: [], refs: [], streak: 0 };
      u.dayShares = u.dayKey === day ? (u.dayShares || 0) + (x.r.shares || 0) : (x.r.shares || 0);
      u.dayKey = day;
      if (u.dayShares >= GAME.streakMin && u.lastDay !== day) {
        const y = dayOf(m.start + e * GAME.epoch - 86400);
        u.streak = u.lastDay === y ? (u.streak || 0) + 1 : 1;
        u.lastDay = day;
      }
      userWrites.push({ set: P.user(id, x.w), data: u });
    }
    doc.stats = { ...(doc.stats || {}), lastEpoch: e, lastBuilders: rows.length, lastPoints: weights.reduce((n, x) => n + x.pts, 0), lastPot: pot.toString(), lastAllocated: total > 0n ? pot.toString() : "0" };
    doc.settled = e;
    for (let i = 0; i < userWrites.length; i += 400) await commit(userWrites.slice(i, i + 400));
  }
  // the root: builders who proved an X post, with what they've been allocated
  const all = Object.keys(doc.alloc);
  const uv = all.length ? await getDocs(all.map((w) => P.user(id, w))) : {};
  const rows = all.filter((w) => uv[P.user(id, w)] && uv[P.user(id, w)].xv && BigInt(doc.alloc[w]) > 0n).sort().map((w) => [w, doc.alloc[w]]);
  const total = rows.reduce((n, [, v]) => n + BigInt(v), 0n);
  const tree = buildTree(id, rows);
  const allocated = all.reduce((n, w) => n + BigInt(doc.alloc[w]), 0n);
  doc.top = all.map((w) => ({ w, amt: doc.alloc[w], pts: doc.pts[w] || 0, x: (uv[P.user(id, w)] || {}).x || "" })).sort((a, b) => (BigInt(b.amt) > BigInt(a.amt) ? 1 : BigInt(b.amt) < BigInt(a.amt) ? -1 : 0)).slice(0, 25);
  doc.stats = { ...(doc.stats || {}), builders: all.length, verified: rows.length, allocated: allocated.toString(), rootable: total.toString() };
  // post when the root changed and can grow; the tree doc always holds the rows of the root that's on-chain
  const changed = tree.root !== (doc.root && doc.root.root) && rows.length > 0 && total >= BigInt(m.rootTotal);
  const writes = [];
  let posted = null;
  if (post && changed && t <= m.end + 3 * 86400 && opKey()) {
    try {
      const r = await sendTx({ to: mineAddress(), data: S.postRoot + u256(id) + strip(tree.root) + u256(total), key: opKey() });
      posted = { hash: r.hash, ok: r.ok };
      if (r.ok) { doc.root = { root: tree.root, total: total.toString(), tx: r.hash, t }; delete doc.rootError; writes.push({ set: P.tree(id), data: { root: tree.root, total: total.toString(), rows, t } }); }
      else doc.rootError = { t, hash: r.hash };
    } catch (err) { doc.rootError = { t, msg: String(err.message || err).slice(0, 200) }; }
  }
  writes.unshift({ set: P.mine(id), data: doc });
  await commit(writes);
  return { id, settled: doc.settled, epochsDone: done, rows: rows.length, total: total.toString(), posted };
}
/// Every open (or just-ended) mine; called from arcia-tg's tick and /api/mine?settle=1.
export async function settleAll({ budgetMs = 25000 } = {}) {
  if (!live() || !storeEnabled()) return { skipped: !live() ? "not deployed" : "no store" };
  const t0 = Date.now(), t = now(), out = [];
  for (const m of await mines({ fresh: true })) {
    if (Date.now() - t0 > budgetMs) break;
    if (t < m.start + GAME.epoch || t > m.end + 3 * 86400 + 3600) continue;
    try { out.push(await settle(m)); } catch (e) { out.push({ id: m.id, error: String(e.message || e).slice(0, 200) }); }
  }
  return { mines: out };
}

// ---------------- reads for the page ----------------
export async function mineView(id) {
  const m = await mineInfo(id);
  if (!m) return null;
  const t = now(), e = epochAt(m, t);
  const [meta, docs] = await Promise.all([tokenMeta([m.token]), storeEnabled() ? getDocs([P.mine(id), P.feed(id), P.epTot(id, e)]) : {}]);
  const d = docs[P.mine(id)] || {}, feed = (docs[P.feed(id)] || {}).items || [], cur = docs[P.epTot(id, e)] || {};
  return {
    ...ser(m), token: meta[m.token], now: t, epoch: e, epochs: epochs(m), layer: layerAt(m, t),
    emittedNow: emitted(m, t).toString(), hourPot: (emitted(m, Math.min(m.end, m.start + (e + 1) * GAME.epoch)) - emitted(m, m.start + e * GAME.epoch)).toString(),
    hour: { points: cur.points || 0, shares: cur.shares || 0 },
    top: d.top || [], feed: feed.slice(0, 20), stats: d.stats || {}, root: d.root || null, settled: d.settled ?? -1,
    link: `${SITE}/mine/${id}`,
  };
}
export async function meView(id, w) {
  const m = await mineInfo(id);
  if (!m) return null;
  const t = now(), e = epochAt(m, t);
  const [rg, docs] = await Promise.all([rigs(id, [w]), storeEnabled() ? getDocs([P.user(id, w), P.ep(id, e, w), P.mine(id), P.tree(id), P.epTot(id, e)]) : {}]);
  const rig = rg[lc(w)], u = docs[P.user(id, w)] || {}, ep = docs[P.ep(id, e, w)] || {}, md = docs[P.mine(id)] || {}, tr = docs[P.tree(id)] || {}, tot = docs[P.epTot(id, e)] || {};
  const wt = weigh({ rig, user: u, at: t });
  const rows = tr.rows || [], k = rows.findIndex(([a]) => a === lc(w));
  const cum = k >= 0 ? rows[k][1] : "0";
  const proof = k >= 0 && md.root && md.root.root === tr.root ? buildTree(Number(id), rows).proof(k) : null;
  const myPts = points(ep);
  return {
    w: lc(w), joined: !!(rig && rig.joined), referrer: rig && !/^0x0{40}$/.test(rig.referrer) ? rig.referrer : null,
    pickaxe: rig ? rig.pickaxe : 0, boosts: rig ? rig.boosts : [0, 0, 0, 0], arcircle: rig ? rig.arcircle.toString() : "0",
    weight: wt, cap: capFor(wt),
    hour: { epoch: e, shares: ep.shares || 0, gold: ep.gold || 0, diamond: ep.diamond || 0, points: myPts, of: tot.points || 0 },
    mined: md.alloc ? md.alloc[lc(w)] || "0" : "0", points: md.pts ? md.pts[lc(w)] || 0 : 0,
    claimable: { cumulative: cum, claimed: rig ? rig.claimed.toString() : "0", proof, rootLive: !!proof },
    x: u.x || "", verified: !!u.xv, posts: (u.posts || []).length, refs: (u.refs || []).length, streak: u.streak || 0,
    link: shareLink(id, w),
  };
}
const ser = (m) => ({ ...m, deposited: m.deposited.toString(), rootTotal: m.rootTotal.toString(), claimed: m.claimed.toString(), burned: m.burned.toString() });
export async function listView() {
  const list = await mines();
  const meta = await tokenMeta(list.map((m) => m.token));
  const docs = storeEnabled() && list.length ? await getDocs(list.slice(0, 60).map((m) => P.mine(m.id))) : {};
  const t = now();
  return list.map((m) => {
    const d = docs[P.mine(m.id)] || {};
    return { ...ser(m), token: meta[m.token], layer: layerAt(m, t), emittedNow: emitted(m, t).toString(), stats: d.stats || {}, status: t < m.start ? "soon" : t < m.end ? "live" : m.closed ? "closed" : "ended" };
  });
}
export async function config() {
  let op = null, fee = null, burned = null;
  if (live()) {
    const r = await ethCalls([{ to: mineAddress(), data: S.operator }, { to: mineAddress(), data: S.joinFee }, { to: mineAddress(), data: S.arcBurned }]).catch(() => []);
    op = r[0] ? lc(wAddr(r[0], 0)) : null; fee = r[1] ? BigInt(r[1]).toString() : null; burned = r[2] ? BigInt(r[2]).toString() : null;
  }
  const opAddr = operatorAddress();
  return {
    live: live(), address: mineAddress() || null, game: GAME, items: await items().catch(() => []), joinFee: fee || "1000000", arcircleBurned: burned,
    ready: { secret: !!secret(), store: storeEnabled(), operatorKey: !!opAddr, operatorMatches: op && opAddr ? lc(op) === lc(opAddr) : null },
  };
}
export { P as PATHS, points };
