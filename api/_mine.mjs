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
export const MINE_ADDRESS_DEFAULT = "0x1538c76917dE5911D71c5C397ff18cA09d52B019"; // Arc mainnet, block 23279278
export const mineAddress = () => { const e = String(process.env.BUILDER_MINE_ADDRESS || "").trim(); return isAddr(e) ? e.toLowerCase() : MINE_ADDRESS_DEFAULT.toLowerCase(); };
export const live = () => isAddr(mineAddress());

// ---------------- the game's numbers (the page reads them from ?cfg=1) ----------------
export const GAME = {
  epoch: 3600,              // one settle per hour
  shareBits: 21,            // a share: keccak starts with 21 zero bits (~2.1M hashes)
  // rare ores: a share with `extra` more zero bits is also that ore (only the best one counts), worth `pts` more
  ores: [
    { kind: "copper", name: "Copper", extra: 2, pts: 1 },        // 1 in 4 shares
    { kind: "silver", name: "Silver", extra: 4, pts: 2 },        // 1 in 16
    { kind: "gold", name: "Gold", extra: 6, pts: 10 },           // 1 in 64
    { kind: "diamond", name: "Diamond", extra: 10, pts: 60 },    // 1 in 1,024
    { kind: "arc", name: "Arc Crystal", extra: 14, pts: 500 },   // 1 in 16,384 — the jackpot
  ],
  cap: 600,                 // shares that count per hour (overtime: ×1.5)
  batchEvery: 30,           // seconds between submissions (the server refuses faster than minGap) — keeps storage writes low
  minGap: 25, maxBatch: 120,
  bonusCap: 100,            // bonuses add up to +100% at most
  layers: ["Grass", "Dirt", "Stone", "Ore", "Deep Rock", "Bedrock"],
  layerParts: [32, 16, 8, 4, 2, 1],
  pickaxes: [
    { tier: 0, id: "wood", name: "Wood pickaxe", mult: 1.0 },
    { tier: 1, id: "stone", name: "Stone pickaxe", mult: 1.15 },
    { tier: 2, id: "iron", name: "Iron pickaxe", mult: 1.3 },
    { tier: 3, id: "steel", name: "Steel pickaxe", mult: 1.5 },
    { tier: 4, id: "gold", name: "Gold pickaxe", mult: 1.7 },
    { tier: 5, id: "diamond", name: "Diamond pickaxe", mult: 2.0 },
    { tier: 6, id: "amethyst", name: "Amethyst pickaxe", mult: 2.3 },
    { tier: 7, id: "arcane", name: "Arcane pickaxe", mult: 2.7 },
  ],
  // builder ranks, from lifetime points across every mine: a small bonus, and they unlock characters and pets
  ranks: [
    { id: "apprentice", name: "Apprentice", min: 0, pct: 0 },
    { id: "miner", name: "Miner", min: 1_000, pct: 2 },
    { id: "foreman", name: "Foreman", min: 10_000, pct: 4 },
    { id: "architect", name: "Architect", min: 50_000, pct: 6 },
    { id: "legend", name: "Legend", min: 200_000, pct: 10 },
  ],
  // looks only — no effect on mining. `rank`: the rank that unlocks it
  characters: [
    { id: "apprentice", name: "Apprentice", rank: 0 }, { id: "explorer", name: "Explorer", rank: 0 }, { id: "engineer", name: "Engineer", rank: 1 },
    { id: "foreman", name: "Foreman", rank: 2 }, { id: "architect", name: "Architect", rank: 3 },
  ],
  pets: [
    { id: "arccat", name: "Arc Cat", rank: 0 }, { id: "corgi", name: "Corgi", rank: 0 }, { id: "slime", name: "Slime", rank: 1 }, { id: "arcia", name: "ARCIA", rank: 1 },
    { id: "mole", name: "Mole", rank: 2 }, { id: "picko", name: "Picko", rank: 3 }, { id: "orego", name: "Orego", rank: 4 },
  ],
  // daily quests (UTC day): rank XP, claimed on the page — they never change a mine's split
  quests: [
    { id: "dig", name: "Dig 100 shares", goal: 100, xp: 50 },
    { id: "rare", name: "Find gold or better", goal: 1, xp: 50 },
    { id: "post", name: "Share your mine on X", goal: 1, xp: 50 },
  ],
  questBonus: 100,            // all three in one day
  // achievements (badges on your builder card)
  achievements: [
    { id: "first", name: "First swing", about: "Hand in your first share" },
    { id: "k1", name: "Thousand swings", about: "1,000 shares, lifetime" },
    { id: "k10", name: "Iron arms", about: "10,000 shares, lifetime" },
    { id: "gold", name: "Gold rush", about: "Find gold" },
    { id: "diamond", name: "Diamond hands", about: "Find a diamond" },
    { id: "arc", name: "Arc Crystal", about: "Find the jackpot ore" },
    { id: "streak7", name: "Week in the mine", about: "A 7-day streak" },
    { id: "posts5", name: "Loud builder", about: "5 proven X posts" },
    { id: "crew", name: "Crew member", about: "Join or found a crew" },
    { id: "legend", name: "Legend", about: "Reach the Legend rank" },
    { id: "heart", name: "Heart hunter", about: "Find the Heart of Arc" },
    { id: "book", name: "Collector", about: "Find every ore at least once" },
  ],
  // boosts (BuilderMine boost kinds 1–4)
  boosts: [
    { kind: 1, name: "Lantern", effect: "+15% for 24 h", pct: 15 },
    { kind: 2, name: "Dynamite", effect: "+50% for 1 h", pct: 50 },
    { kind: 3, name: "Lucky gem", effect: "rare ores twice as often for 24 h", pct: 0 },
    { kind: 4, name: "Overtime barrel", effect: "+50% hourly cap for 24 h", pct: 0 },
  ],
  holder: [[100_000, 10], [1_000_000, 20], [5_000_000, 30]], // $ARCIRCLE held → bonus %
  postPct: 5, postMax: 5,     // each extra verified X post (one a day) +5%, up to 5
  refPct: 5, refMax: 5,       // each referee who proved their X post +5%, up to 5
  referredPct: 5,             // joining through someone's link
  streakPct: 2, streakMax: 10, streakMin: 30, // a day with ≥30 shares keeps the streak
  // default item list (the contract's getItems() wins once deployed) — [price $ARCIRCLE, tier, boost, seconds]
  items: [[20_000, 1, 0, 0], [60_000, 2, 0, 0], [150_000, 3, 0, 0], [300_000, 4, 0, 0], [700_000, 5, 0, 0], [1_600_000, 6, 0, 0], [4_000_000, 7, 0, 0],
    [30_000, 0, 1, 86400], [20_000, 0, 2, 3600], [40_000, 0, 3, 86400], [30_000, 0, 4, 86400]],
  feeUsd: 1,                  // opening or joining: 1 USDC worth of $ARCIRCLE, burned
  // hourly events — they only shift points *within* an hour, so they change who gets more, never how much is released
  rush: { mult: 3, kinds: ["copper", "silver", "gold"] }, // each hour one of these is the rush ore: its points ×3
  heart: { name: "Heart of Arc", extra: 8, pts: 100 },    // one per mine per hour, hidden at a secret minute:
                                                          // the first share with 8 more zero bits after it wins
  crewTiers: [[20_000, 3], [100_000, 5]],                 // a crew's points this month → bonus % for every member
  minTopUpPct: 1,                                         // a top-up is at least 1% of the first deposit (contract)
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
  postRoot: sel("postRoot(uint256,bytes32,uint256)"), operator: sel("operator()"), feeArc: sel("feeArc()"), arcBurned: sel("arcircleBurned()"),
  segmentsOf: sel("segmentsOf(uint256)"), infoOf: sel("infoOf(uint256)"), joinsPaused: sel("joinsPaused()"),
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
function decodeMine(id, hex, segHex, infoHex) {
  if (!hex || strip(hex).length < 14 * 64) return null;
  const m = {
    id, token: lc(wAddr(hex, 0)), creator: lc(wAddr(hex, 1)), deposited: wBig(hex, 2), rootTotal: wBig(hex, 3), claimed: wBig(hex, 4), burned: wBig(hex, 5),
    start: Number(wBig(hex, 6)), end: Number(wBig(hex, 7)), root: "0x" + strip(hex).slice(8 * 64, 9 * 64), builders: Number(wBig(hex, 9)), rootCount: Number(wBig(hex, 10)),
    unminedBurned: wBig(hex, 11) === 1n, closed: wBig(hex, 12) === 1n, paused: wBig(hex, 13) === 1n,
  };
  m.segs = decodeSegs(segHex) || [{ amount: m.deposited, f0: 0n }];
  m.info = decodeInfo(infoHex);
  return m;
}
// segmentsOf(id) → Seg[] { uint128 amount; uint64 f0 }
function decodeSegs(hex) {
  if (!hex || strip(hex).length < 128) return null;
  const n = Number(wBig(hex, 1));
  return Array.from({ length: n }, (_, i) => ({ amount: wBig(hex, 2 + i * 2), f0: wBig(hex, 3 + i * 2) }));
}
// infoOf(id) → (string name, string about, string link)
function decodeInfo(hex) {
  const out = { name: "", about: "", link: "" };
  try {
    const h = strip(hex); if (h.length < 64 * 4) return out;
    const base = Number(BigInt("0x" + h.slice(0, 64))) * 2; // the tuple
    const str = (i) => { const off = base + Number(BigInt("0x" + h.slice(base + i * 64, base + (i + 1) * 64))) * 2; const len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2; return new TextDecoder().decode(hexToBytes(h.slice(off + 64, off + 64 + len))).replace(/[\u0000-\u001f]/g, "").trim(); };
    out.name = str(0).slice(0, 32); out.about = str(1).slice(0, 160); out.link = str(2).slice(0, 100);
    if (!/^https:\/\/[^\s"<>]+$/i.test(out.link)) out.link = "";
  } catch { /* keep blanks */ }
  return out;
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
    const res = ids.length ? await ethCalls(ids.flatMap((i) => [{ to: mineAddress(), data: S.getMine + u256(i) }, { to: mineAddress(), data: S.segmentsOf + u256(i) }, { to: mineAddress(), data: S.infoOf + u256(i) }]), { timeoutMs: 9000 }) : [];
    return ids.map((i, k) => decodeMine(i, res[k * 3], res[k * 3 + 1], res[k * 3 + 2])).filter(Boolean);
  });
}
export async function mineInfo(id) {
  if (!live() || !/^\d{1,6}$/.test(String(id))) return null;
  const [r, sg, inf] = await ethCalls([{ to: mineAddress(), data: S.getMine + u256(id) }, { to: mineAddress(), data: S.segmentsOf + u256(id) }, { to: mineAddress(), data: S.infoOf + u256(id) }]);
  return decodeMine(Number(id), r, sg, inf);
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
const ONE = 10n ** 18n;
/// F(t) × 1e18 — the share of the six-layer halving curve reached at t (the contract's _f)
export function curve(start, end, t) {
  start = BigInt(start); end = BigInt(end); const T = BigInt(Math.floor(t));
  if (T <= start) return 0n;
  if (T >= end) return ONE;
  const layerLen = (end - start) / 6n, elapsed = T - start, k = elapsed / layerLen;
  if (k >= 6n) return ONE;
  const done = 64n - (1n << (6n - k)), w = 1n << (5n - k);
  return ((done * layerLen + w * (elapsed - k * layerLen)) * ONE) / (63n * layerLen);
}
/// the contract's emittedAt: the deposit and every top-up, each over the rest of the curve from where it came in
export function emitted(m, t) {
  const f = curve(m.start, m.end, t);
  const segs = m.segs && m.segs.length ? m.segs : [{ amount: BigInt(m.deposited), f0: 0n }];
  let total = 0n;
  for (const s of segs) { const f0 = BigInt(s.f0); if (f > f0) total += (BigInt(s.amount) * (f - f0)) / (ONE - f0); }
  return total;
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
export const rankOf = (pts) => { let r = 0; GAME.ranks.forEach((x, i) => { if ((pts || 0) >= x.min) r = i; }); return r; };
export function weigh({ rig, user, at, lifetime = 0, crew = 0 }) {
  const pick = GAME.pickaxes[Math.max(0, Math.min(GAME.pickaxes.length - 1, rig ? rig.pickaxe : 0))];
  const until = (rig && rig.boosts) || [0, 0, 0, 0];
  const u = user || {};
  const parts = [];
  const add = (label, pct) => { if (pct > 0) parts.push({ label, pct }); };
  add("$ARCIRCLE holder", holderPct(rig ? rig.arcircle : 0n));
  const rk = GAME.ranks[rankOf(lifetime)];
  add(`Rank: ${rk.name}`, rk.pct);
  add("X posts", Math.min(GAME.postMax, Math.max(0, (u.posts || []).length - 1)) * GAME.postPct);
  add("Referrals", Math.min(GAME.refMax, (u.refs || []).length) * GAME.refPct);
  add("Joined by referral", rig && isAddr(rig.referrer) && !/^0x0{40}$/.test(rig.referrer) ? GAME.referredPct : 0);
  add("Streak", Math.min(GAME.streakMax, Math.max(0, (u.streak || 0) - 1)) * GAME.streakPct);
  add("Crew", crew);
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
  handle: (h) => `minex/${lc(h)}`, tweet: (t) => `minetw/${t}`, builder: (w) => `minerank/${lc(w)}`,
  crew: (slug) => `minecrew/${slug}`, crews: () => "minecrews/all", season: (ym) => `mineseason/${ym}`, hall: () => "minehall/arc",
  heart: (id, e) => `minehrt/${id}_${e}`, counts: (id) => `minec/${id}`, day: (d) => `minestat/${d}`,
};

// ---------------- hourly events ----------------
/// this hour's rush ore (unknowable before the hour starts)
export const rushOf = (id, e) => GAME.rush.kinds[hmac(`rush|${id}|${e}`)[0] % GAME.rush.kinds.length];
/// seconds into the hour when the Heart of Arc can first be found (5–49 min) — never sent to the page
const heartAt = (id, e) => 300 + (hmac(`heart|${id}|${e}`).readUInt16BE(0) % 2640);
const orePts = (kind, rush) => kind === "heart" ? GAME.heart.pts : ((GAME.ores.find((o) => o.kind === kind) || { pts: 0 }).pts * (kind === rush ? GAME.rush.mult : 1));
/// a crew's bonus from its points this month
export function crewPct(crewDoc, ym) {
  const n = (crewDoc && crewDoc[`s${ym}`]) || 0;
  let p = 0; for (const [min, pct] of GAME.crewTiers) if (n >= min) p = pct;
  return p;
}
function crewInfo(c, ym) {
  if (!c || !(c.members || []).length) return null;
  const season = c[`s${ym}`] || 0, pct = crewPct(c, ym), next = GAME.crewTiers.find(([min]) => season < min) || null;
  return { slug: c.slug, name: c.name, n: c.members.length, season, pct, next: next ? { at: next[0], pct: next[1] } : null };
}

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
  const docs = await getDocs([P.ep(id, e, w), P.user(id, w), P.builder(w)]);
  const d = docs[P.ep(id, e, w)] || { k: `${id}_${e}`, id: Number(id), e, w: lc(w), shares: 0, ores: {}, seen: [], at: 0 };
  d.ores = d.ores || {};
  if (Date.now() - (d.at || 0) < GAME.minGap * 1000) return { error: "Too fast — the page sends your shares every few seconds.", retry: GAME.minGap };
  const wt = weigh({ rig, user: docs[P.user(id, w)], at: t, lifetime: (docs[P.builder(w)] || {}).pts || 0 });
  const cap = capFor(wt), luck = wt.lucky ? 1 : 0;
  const ch = challenge(id, e, w), seen = new Set(d.seen || []);
  const finds = [], rush = rushOf(id, e), hk = `heart:${id}:${e}`;
  const heartOpen = t - (m.start + e * GAME.epoch) >= heartAt(id, e) && !memo.has(hk);
  let heartZ = -1;
  let ok = 0, bad = 0, over = 0;
  for (const n of list) {
    const k = normNonce(n);
    if (seen.has(k)) continue;
    const z = workOf(ch, n);
    if (z < GAME.shareBits) { bad++; continue; }
    seen.add(k);
    if (d.shares >= cap) { over++; continue; } // past the hourly cap nothing counts — rare ores included
    d.shares++; ok++;
    const ore = oreOf(z, luck);
    if (ore) { d.ores[ore.kind] = (d.ores[ore.kind] || 0) + 1; finds.push({ kind: ore.kind, z }); }
    if (heartOpen && z >= GAME.shareBits + GAME.heart.extra - luck && z > heartZ) heartZ = z;
  }
  if (bad > list.length / 2 && bad > 2) return { error: "Those shares don't match this hour's challenge — reload the page.", bad };
  // the Heart of Arc: one per mine per hour — whoever's share lands first takes it (a create-only write decides)
  if (heartZ >= 0 && !(d.ores.heart > 0)) {
    const r = await commit([{ create: P.heart(id, e), data: { w: lc(w), t, id: Number(id), e } }]).catch(() => ({ ok: false }));
    memo.set(hk, { t: Date.now(), v: 1 });
    if (r.ok) { d.ores.heart = 1; finds.push({ kind: "heart", z: heartZ }); }
  }
  d.seen = [...seen].slice(-4000);
  d.at = Date.now();
  const pts = ok + finds.reduce((n, f) => n + orePts(f.kind, rush), 0);
  const writes = [{ set: P.ep(id, e, w), data: d }];
  if (pts) writes.push({ inc: P.epTot(id, e), fields: { points: pts, shares: ok } });
  // the builder's lifetime counters and today's quest progress — one write
  if (ok) {
    const q = qkey(t), inc = { sh: ok, [`${q}s`]: ok }, first = {};
    for (const f of finds) { inc[`o_${f.kind}`] = (inc[`o_${f.kind}`] || 0) + 1; first[`f_${f.kind}`] = t; if (["gold", "diamond", "arc", "heart"].includes(f.kind)) inc[`${q}r`] = (inc[`${q}r`] || 0) + 1; }
    writes.push({ inc: P.builder(w), fields: inc, min: first }); // min: the ore book keeps the first time each ore was found
  }
  await commit(writes);
  if (finds.some((f) => f.kind === "arc")) await addHall({ w: lc(w), id: Number(id), t }).catch(() => {});
  const big = finds.filter((f) => ["gold", "diamond", "arc", "heart"].includes(f.kind));
  if (big.length) await addFeed(id, big.map((f) => ({ w: lc(w), kind: f.kind, t, e }))).catch(() => {});
  return { ok: true, epoch: e, counted: ok, over, bad, shares: d.shares, ores: d.ores, cap, finds, rush, points: points(d) };
}
async function addFeed(id, rows) {
  const cur = (await getDocs([P.feed(id)]))[P.feed(id)] || { items: [] };
  cur.items = [...rows.reverse(), ...(cur.items || [])].slice(0, 40);
  await setDoc(P.feed(id), cur);
}
/// the best ore a share with `z` zero bits is (lucky charm: one bit easier), or null
export function oreOf(z, luck = 0) {
  let best = null;
  for (const o of GAME.ores) if (z >= GAME.shareBits + o.extra - luck) best = o;
  return best;
}
/// one builder's points in one hour: shares + rare ores (the hour's rush ore ×3) + the Heart of Arc
const points = (d) => {
  const rush = d && d.id != null && d.e != null ? rushOf(d.id, d.e) : null, o = (d && d.ores) || {};
  return Math.min((d && d.shares) || 0, 1e9) + GAME.ores.reduce((n, x) => n + (o[x.kind] || 0) * orePts(x.kind, rush), 0) + (o.heart || 0) * GAME.heart.pts;
};

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
  const writes = [{ set: P.user(id, w), data: u }, { set: P.tweet(ref.id), data: { w: lc(w), id: Number(id), t: now() } }, { set: P.handle(ref.handle), data: { w: lc(w), t: now() } },
    { inc: P.builder(w), fields: { [`${qkey(now())}p`]: 1, posts: 1 } }];
  const referred = u.posts.length === 1 && isAddr(rig.referrer) && !/^0x0{40}$/.test(rig.referrer);
  // the mine's own counters (the creator's dashboard): posts, builders who proved one, referrals that did
  writes.push({ inc: P.counts(id), fields: { posts: 1, ...(u.posts.length === 1 ? { xbuilders: 1 } : {}), ...(referred ? { refs: 1 } : {}) } });
  // the first proven post also counts for whoever referred this builder
  if (referred) {
    const rd = (await getDocs([P.user(id, rig.referrer)]))[P.user(id, rig.referrer)] || { id: Number(id), w: rig.referrer, posts: [], refs: [], streak: 0 };
    if (!(rd.refs || []).includes(lc(w))) { rd.refs = [...(rd.refs || []), lc(w)]; writes.push({ set: P.user(id, rig.referrer), data: rd }); }
  }
  await commit(writes);
  return { ok: true, handle: tw.handle, posts: u.posts.length, first: u.posts.length === 1, bonusPct: Math.min(GAME.postMax, u.posts.length - 1) * GAME.postPct };
}

// ---------------- looks (character & pet: cosmetic, unlocked by rank) ----------------
export function lookOf(bd) {
  const r = rankOf((bd && bd.pts) || 0);
  const c = GAME.characters.find((x) => x.id === (bd && bd.char) && x.rank <= r) || GAME.characters[0];
  const p = GAME.pets.find((x) => x.id === (bd && bd.pet) && x.rank <= r) || GAME.pets[0];
  return { char: c.id, pet: p.id };
}
export async function setPrefs(w, prefs) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  const bd = (await getDocs([P.builder(w)]))[P.builder(w)] || {};
  if (prefs && "xshare" in prefs) bd.xshare = prefs.xshare ? 1 : 0; // ARCIA may post my Arc Crystal on X (tagging my handle)
  await commit([{ set: P.builder(w), data: { ...bd, w: lc(w) } }]);
  return { ok: true, prefs: { xshare: !!bd.xshare } };
}
export async function setLook(w, char, pet) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  const bd = (await getDocs([P.builder(w)]))[P.builder(w)] || { pts: 0 };
  const r = rankOf(bd.pts || 0);
  const c = GAME.characters.find((x) => x.id === char), p = GAME.pets.find((x) => x.id === pet);
  if (char && !c) return { error: "Unknown character." };
  if (pet && !p) return { error: "Unknown pet." };
  if ((c && c.rank > r) || (p && p.rank > r)) return { error: `Reach ${GAME.ranks[Math.max(c ? c.rank : 0, p ? p.rank : 0)].name} rank to unlock that.` };
  if (c) bd.char = c.id;
  if (p) bd.pet = p.id;
  await commit([{ set: P.builder(w), data: { ...bd, w: lc(w) } }]);
  return { ok: true, look: lookOf(bd) };
}
export async function builderOf(w) { return storeEnabled() ? (await getDocs([P.builder(w)]))[P.builder(w)] || {} : {}; }

// ---------------- quests, achievements, crews, seasons, the hall of fame ----------------
export const qkey = (t) => "q" + new Date(t * 1000).toISOString().slice(0, 10).replace(/-/g, "");
export const seasonOf = (t) => new Date(t * 1000).toISOString().slice(0, 7).replace("-", "");
async function addHall(row) {
  const cur = (await getDocs([P.hall()]))[P.hall()] || { items: [] };
  cur.items = [row, ...(cur.items || [])].slice(0, 100);
  await setDoc(P.hall(), cur);
}
/// today's quests for a builder doc: progress, done, claimed
export function questsOf(bd, t = now()) {
  const q = qkey(t), claimed = (bd && bd.qc && bd.qc.day === q && bd.qc.ids) || [];
  const have = { dig: (bd && bd[`${q}s`]) || 0, rare: (bd && bd[`${q}r`]) || 0, post: (bd && bd[`${q}p`]) || 0 };
  const list = GAME.quests.map((x) => ({ ...x, have: Math.min(x.goal, have[x.id] || 0), done: (have[x.id] || 0) >= x.goal, claimed: claimed.includes(x.id) }));
  const all = list.every((x) => x.done);
  return { day: q, list, bonus: { xp: GAME.questBonus, done: all, claimed: claimed.includes("all") }, resetsIn: 86400 - (t % 86400) };
}
/// claim today's finished quests (and the all-three bonus) as rank XP
export async function claimQuests(w) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  const bd = (await getDocs([P.builder(w)]))[P.builder(w)] || {};
  const qs = questsOf(bd);
  const ids = [...qs.list.filter((x) => x.done && !x.claimed).map((x) => x.id), ...(qs.bonus.done && !qs.bonus.claimed ? ["all"] : [])];
  if (!ids.length) return { error: "Nothing to claim yet — finish a quest first." };
  const xp = ids.reduce((n, id) => n + (id === "all" ? GAME.questBonus : (GAME.quests.find((x) => x.id === id) || { xp: 0 }).xp), 0);
  const prev = bd.qc && bd.qc.day === qs.day ? bd.qc.ids : [];
  // drop quest counters from earlier days while the doc is being rewritten anyway
  const clean = Object.fromEntries(Object.entries(bd).filter(([k]) => !/^q\d{8}[srp]$/.test(k) || k.startsWith(qs.day)));
  const next = { ...clean, w: lc(w), pts: (bd.pts || 0) + xp, xp: (bd.xp || 0) + xp, qc: { day: qs.day, ids: [...prev, ...ids] } };
  await commit([{ set: P.builder(w), data: next }]);
  return { ok: true, xp, ids, lifetime: next.pts, rank: rankOf(next.pts) };
}
/// badges earned, from the builder doc (and this mine's streak/posts)
export function achievementsOf(bd, extra = {}) {
  bd = bd || {};
  const got = {
    first: (bd.sh || 0) >= 1, k1: (bd.sh || 0) >= 1000, k10: (bd.sh || 0) >= 10000,
    gold: (bd.o_gold || 0) + (bd.o_diamond || 0) + (bd.o_arc || 0) >= 1, diamond: (bd.o_diamond || 0) + (bd.o_arc || 0) >= 1, arc: (bd.o_arc || 0) >= 1,
    streak7: !!bd.st7ok || (extra.streak || 0) >= 7, posts5: (bd.posts || 0) >= 5, crew: !!bd.crew, legend: rankOf(bd.pts || 0) >= 4,
    heart: (bd.o_heart || 0) >= 1, book: BOOK.every((k) => (bd[`o_${k}`] || 0) >= 1),
  };
  return GAME.achievements.map((a) => ({ ...a, got: !!got[a.id] }));
}
/// the ore book: every ore, how many, first found
const BOOK = [...GAME.ores.map((o) => o.kind), "heart"];
export function bookOf(bd) {
  bd = bd || {};
  return BOOK.map((k) => ({ kind: k, n: bd[`o_${k}`] || 0, first: bd[`f_${k}`] || null }));
}
const slugOf = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20);
const CREW_MAX = 30;
export async function crewAct(w, act, name) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  const bd = (await getDocs([P.builder(w)]))[P.builder(w)] || {};
  const idx = (await getDocs([P.crews()]))[P.crews()] || { list: [] };
  idx.list = idx.list || [];
  if (act === "leave") {
    if (!bd.crew) return { error: "You're not in a crew." };
    const c = (await getDocs([P.crew(bd.crew)]))[P.crew(bd.crew)] || { members: [] };
    c.members = (c.members || []).filter((x) => x !== lc(w));
    const row = idx.list.find((x) => x.slug === bd.crew); if (row) row.n = c.members.length;
    idx.list = idx.list.filter((x) => x.n > 0);
    const nb = { ...bd }; delete nb.crew;
    await commit([{ set: P.crew(bd.crew), data: c }, { set: P.crews(), data: idx }, { set: P.builder(w), data: { ...nb, w: lc(w) } }]);
    return { ok: true, crew: null };
  }
  if (bd.crew) return { error: "Leave your crew first." };
  const clean = String(name || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 20);
  const slug = slugOf(clean);
  if (slug.length < 3) return { error: "A crew name needs 3–20 letters or numbers." };
  const c = (await getDocs([P.crew(slug)]))[P.crew(slug)];
  if (act === "create") {
    if (c && (c.members || []).length) return { error: "That crew name is taken — join it or pick another." };
    const crew = { slug, name: clean, owner: lc(w), members: [lc(w)], pts: 0, t: now() };
    idx.list = [...idx.list.filter((x) => x.slug !== slug), { slug, name: clean, n: 1 }].slice(-500);
    await commit([{ set: P.crew(slug), data: crew }, { set: P.crews(), data: idx }, { set: P.builder(w), data: { ...bd, w: lc(w), crew: slug } }]);
    return { ok: true, crew: { slug, name: clean } };
  }
  if (act === "join") {
    if (!c || !(c.members || []).length) return { error: "No crew by that name." };
    if (c.members.length >= CREW_MAX) return { error: `That crew is full (${CREW_MAX}).` };
    c.members = [...new Set([...c.members, lc(w)])];
    const row = idx.list.find((x) => x.slug === slug); if (row) row.n = c.members.length;
    await commit([{ set: P.crew(slug), data: c }, { set: P.crews(), data: idx }, { set: P.builder(w), data: { ...bd, w: lc(w), crew: slug } }]);
    return { ok: true, crew: { slug, name: c.name } };
  }
  return { error: "unknown crew action" };
}
/// the boards: this month's builders, crews (this month and all time), the Arc Crystal hall of fame
export async function boards() {
  if (!storeEnabled()) return { season: [], crews: [], hall: [] };
  return cached("boards", 30000, async () => {
    const ym = seasonOf(now());
    const docs = await getDocs([P.season(ym), P.crews(), P.hall()]);
    const pts = (docs[P.season(ym)] || {}).pts || {};
    const top = Object.entries(pts).sort((a, b) => b[1] - a[1]).slice(0, 50);
    const idx = ((docs[P.crews()] || {}).list || []).slice(-200);
    const crewDocs = idx.length ? await getDocs(idx.map((x) => P.crew(x.slug))) : {};
    const looks = top.length ? await getDocs(top.slice(0, 20).map(([w]) => P.builder(w))) : {};
    const crews = idx.map((x) => { const c = crewDocs[P.crew(x.slug)] || {}; return { slug: x.slug, name: c.name || x.name, n: (c.members || []).length, pts: c.pts || 0, season: c[`s${ym}`] || 0, pct: crewPct(c, ym) }; })
      .filter((c) => c.n > 0).sort((a, b) => b.season - a.season || b.pts - a.pts).slice(0, 30);
    return {
      season: { id: ym, endsIn: Math.floor((Date.UTC(+ym.slice(0, 4), +ym.slice(4), 1) - Date.now()) / 1000), top: top.map(([w, n], i) => ({ w, pts: n, look: i < 20 ? lookOf(looks[P.builder(w)]) : null, rank: rankOf(((looks[P.builder(w)] || {}).pts) || 0) })) },
      crews, hall: ((docs[P.hall()] || {}).items || []).slice(0, 30),
    };
  });
}
/// who is digging right now in a mine (handed in shares in the last 2 minutes), with their looks
async function liveBuilders(id, e) {
  const rows = (await queryDocs("minee", "k", `${id}_${e}`, 2000).catch(() => [])).filter((r) => Date.now() - (r.at || 0) < 120000);
  const ws = rows.map((r) => r.w).slice(0, 8);
  const bds = ws.length ? await getDocs(ws.map((w) => P.builder(w))) : {};
  return { n: rows.length, who: ws.map((w) => ({ w, look: lookOf(bds[P.builder(w)]) })) };
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
  const season = {};
  for (let e = (doc.settled ?? -1) + 1; e <= last && done < maxEpochs; e++, done++) {
    const rows = (await queryDocs("minee", "k", `${id}_${e}`, 2000)).filter((r) => isAddr(r.w));
    const ws = rows.map((r) => r.w);
    const [rg, users] = await Promise.all([rigs(id, ws), ws.length ? getDocs([...ws.map((w) => P.user(id, w)), ...ws.map((w) => P.builder(w))]) : {}]);
    const at = m.start + e * GAME.epoch + GAME.epoch / 2, ym = seasonOf(m.start + e * GAME.epoch);
    // crews: every member gets their crew's bonus for this month's points so far
    const slugs = [...new Set(ws.map((w) => (users[P.builder(w)] || {}).crew).filter(Boolean))];
    const crews = slugs.length ? await getDocs(slugs.map((c) => P.crew(c))) : {};
    const weights = rows.map((r) => {
      const u = users[P.user(id, r.w)], bd = users[P.builder(r.w)] || {};
      const wt = weigh({ rig: rg[r.w], user: u, at, lifetime: bd.pts || 0, crew: bd.crew ? crewPct(crews[P.crew(bd.crew)], ym) : 0 });
      return { w: r.w, r, u, pts: points(r), W: BigInt(Math.round(points(r) * wt.mult * 1e6)) };
    });
    const total = weights.reduce((n, x) => n + x.W, 0n);
    const from = emitted(m, m.start + e * GAME.epoch), to = emitted(m, Math.min(m.end, m.start + (e + 1) * GAME.epoch));
    const pot = to - from;
    const userWrites = [];
    const order = [...weights].sort((a, b) => (b.W > a.W ? 1 : b.W < a.W ? -1 : 0)).map((x) => x.w);
    for (const x of weights) {
      const got = total > 0n && x.W > 0n ? (pot * x.W) / total : 0n;
      if (got > 0n) doc.alloc[x.w] = (BigInt(doc.alloc[x.w] || 0) + got).toString();
      doc.pts[x.w] = (doc.pts[x.w] || 0) + x.pts;
      // streak: a day with ≥ streakMin shares (counted at the hour it's reached)
      const day = dayOf(m.start + e * GAME.epoch);
      const u = x.u || { id, w: x.w, posts: [], refs: [], streak: 0 };
      // this hour's result card on the page: points, what they got, place
      u.last = { e, pts: x.pts, got: got.toString(), place: order.indexOf(x.w) + 1, of: weights.length, rush: rushOf(id, e), heart: !!((x.r.ores || {}).heart) };
      u.dayShares = u.dayKey === day ? (u.dayShares || 0) + (x.r.shares || 0) : (x.r.shares || 0);
      u.dayKey = day;
      if (u.dayShares >= GAME.streakMin && u.lastDay !== day) {
        const y = dayOf(m.start + e * GAME.epoch - 86400);
        u.streak = u.lastDay === y ? (u.streak || 0) + 1 : 1;
        u.lastDay = day;
      }
      userWrites.push({ set: P.user(id, x.w), data: u });
      if (x.pts > 0) {
        const bd = users[P.builder(x.w)] || {};
        // lifetime points → rank; this month's → season; a 7-day streak once → its badge
        userWrites.push({ inc: P.builder(x.w), fields: { pts: x.pts, [`s${ym}`]: x.pts, ...(u.streak >= 7 && !bd.st7ok ? { st7ok: 1 } : {}) } });
        season[ym] = season[ym] || {}; season[ym][x.w] = (season[ym][x.w] || 0) + x.pts;
        if (bd.crew) userWrites.push({ inc: P.crew(bd.crew), fields: { pts: x.pts, [`s${ym}`]: x.pts } });
      }
    }
    doc.stats = { ...(doc.stats || {}), lastEpoch: e, lastBuilders: rows.length, lastPoints: weights.reduce((n, x) => n + x.pts, 0), lastPot: pot.toString(), lastAllocated: total > 0n ? pot.toString() : "0" };
    // the creator's dashboard: one row per settled hour [hour, builders digging, points, released, joined so far]
    doc.hist = [...(doc.hist || []), [e, rows.length, weights.reduce((n, x) => n + x.pts, 0), pot.toString(), m.builders]].slice(-1440);
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
  // the monthly season board: everyone's points this month (one doc a month)
  for (const [ym, add] of Object.entries(season)) {
    const cur = (await getDocs([P.season(ym)]))[P.season(ym)] || { pts: {} };
    cur.pts = cur.pts || {};
    for (const [w, n] of Object.entries(add)) cur.pts[w] = (cur.pts[w] || 0) + n;
    await setDoc(P.season(ym), cur);
  }
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
  const [meta, docs, act] = await Promise.all([tokenMeta([m.token]), storeEnabled() ? getDocs([P.mine(id), P.feed(id), P.epTot(id, e), P.heart(id, e)]) : {}, storeEnabled() && t < m.end ? liveBuilders(id, e) : { n: 0, who: [] }]);
  const d = docs[P.mine(id)] || {}, feed = (docs[P.feed(id)] || {}).items || [], cur = docs[P.epTot(id, e)] || {}, hrt = docs[P.heart(id, e)];
  return {
    ...ser(m), token: meta[m.token], now: t, epoch: e, epochs: epochs(m), layer: layerAt(m, t),
    emittedNow: emitted(m, t).toString(), hourPot: (emitted(m, Math.min(m.end, m.start + (e + 1) * GAME.epoch)) - emitted(m, m.start + e * GAME.epoch)).toString(),
    hour: { points: cur.points || 0, shares: cur.shares || 0 },
    top: d.top || [], feed: feed.slice(0, 20), stats: d.stats || {}, root: d.root || null, settled: d.settled ?? -1,
    active: act, hourEndsIn: m.start + (e + 1) * GAME.epoch - t,
    // this hour's events: the rush ore, and whether the Heart of Arc was found (its minute stays secret)
    events: t >= m.start && t < m.end ? { rush: rushOf(id, e), rushMult: GAME.rush.mult, heart: hrt ? { found: true, w: hrt.w, t: hrt.t } : { found: false } } : null,
    link: `${SITE}/mine/${id}`,
  };
}
export async function meView(id, w) {
  const m = await mineInfo(id);
  if (!m) return null;
  const t = now(), e = epochAt(m, t);
  const [rg, docs] = await Promise.all([rigs(id, [w]), storeEnabled() ? getDocs([P.user(id, w), P.ep(id, e, w), P.mine(id), P.tree(id), P.epTot(id, e), P.builder(w)]) : {}]);
  const rig = rg[lc(w)], u = docs[P.user(id, w)] || {}, ep = docs[P.ep(id, e, w)] || {}, md = docs[P.mine(id)] || {}, tr = docs[P.tree(id)] || {}, tot = docs[P.epTot(id, e)] || {};
  const bd = docs[P.builder(w)] || {}, lifetime = bd.pts || 0, ym = seasonOf(t);
  const crewDoc = bd.crew ? (await getDocs([P.crew(bd.crew)]))[P.crew(bd.crew)] : null;
  const wt = weigh({ rig, user: u, at: t, lifetime, crew: crewPct(crewDoc, ym) });
  const rows = tr.rows || [], k = rows.findIndex(([a]) => a === lc(w));
  const cum = k >= 0 ? rows[k][1] : "0";
  const proof = k >= 0 && md.root && md.root.root === tr.root ? buildTree(Number(id), rows).proof(k) : null;
  const myPts = points(ep);
  return {
    w: lc(w), joined: !!(rig && rig.joined), referrer: rig && !/^0x0{40}$/.test(rig.referrer) ? rig.referrer : null,
    pickaxe: rig ? rig.pickaxe : 0, boosts: rig ? rig.boosts : [0, 0, 0, 0], arcircle: rig ? rig.arcircle.toString() : "0",
    weight: wt, cap: capFor(wt),
    hour: { epoch: e, shares: ep.shares || 0, ores: ep.ores || {}, points: myPts, of: tot.points || 0 },
    lifetime, rank: rankOf(lifetime), look: lookOf(bd),
    mined: md.alloc ? md.alloc[lc(w)] || "0" : "0", points: md.pts ? md.pts[lc(w)] || 0 : 0,
    claimable: { cumulative: cum, claimed: rig ? rig.claimed.toString() : "0", proof, rootLive: !!proof },
    x: u.x || "", verified: !!u.xv, posts: (u.posts || []).length, refs: (u.refs || []).length, streak: u.streak || 0,
    quests: questsOf(bd, t), achievements: achievementsOf(bd, { streak: u.streak || 0 }), crew: bd.crew || null, crewInfo: crewInfo(crewDoc, ym), xp: bd.xp || 0,
    totals: { shares: bd.sh || 0, ores: Object.fromEntries([...GAME.ores.map((o) => [o.kind, bd[`o_${o.kind}`] || 0]), ["heart", bd.o_heart || 0]]) },
    book: bookOf(bd), prefs: { xshare: !!bd.xshare }, lastHour: u.last || null, season: bd[`s${ym}`] || 0,
    // this hour's pot × my share of the hour's points (unweighted — the settle weighs it)
    estimate: tot.points ? ((BigInt(emitted(m, Math.min(m.end, m.start + (e + 1) * GAME.epoch)) - emitted(m, m.start + e * GAME.epoch)) * BigInt(Math.round(myPts * 1000))) / BigInt(Math.max(1, Math.round((tot.points || 0) * 1000)))).toString() : "0",
    link: shareLink(id, w),
  };
}
const ser = (m) => ({ ...m, deposited: m.deposited.toString(), rootTotal: m.rootTotal.toString(), claimed: m.claimed.toString(), burned: m.burned.toString(), segs: (m.segs || []).map((x) => ({ amount: String(x.amount), f0: String(x.f0) })) });
/// a builder's card without a mine (rank, looks, quests, badges, crew)
export async function builderView(w) {
  const bd = await builderOf(w), ym = seasonOf(now());
  const crewDoc = bd.crew && storeEnabled() ? (await getDocs([P.crew(bd.crew)]))[P.crew(bd.crew)] : null;
  return { w: lc(w), lifetime: bd.pts || 0, rank: rankOf(bd.pts || 0), look: lookOf(bd), quests: questsOf(bd), achievements: achievementsOf(bd), crew: bd.crew || null, crewInfo: crewInfo(crewDoc, ym), xp: bd.xp || 0,
    totals: { shares: bd.sh || 0, ores: Object.fromEntries([...GAME.ores.map((o) => [o.kind, bd[`o_${o.kind}`] || 0]), ["heart", bd.o_heart || 0]]) },
    book: bookOf(bd), prefs: { xshare: !!bd.xshare }, season: bd[`s${ym}`] || 0 };
}
/// the creator's dashboard for one mine (public: everything here is on-chain or on the boards anyway)
export async function creatorView(id) {
  const m = await mineInfo(id);
  if (!m) return null;
  const t = now();
  const [meta, docs] = await Promise.all([tokenMeta([m.token]), storeEnabled() ? getDocs([P.mine(id), P.counts(id)]) : {}]);
  const d = docs[P.mine(id)] || {}, c = docs[P.counts(id)] || {};
  return {
    ...ser(m), token: meta[m.token], now: t, layer: layerAt(m, t), epoch: epochAt(m, t), epochs: epochs(m),
    emittedNow: emitted(m, t).toString(), left: (BigInt(m.deposited) - emitted(m, t)).toString(),
    // what the curve releases per hour from here, so the creator sees what a top-up would do
    hist: (d.hist || []).slice(-24 * 14), stats: d.stats || {}, root: d.root || null,
    counts: { posts: c.posts || 0, xbuilders: c.xbuilders || 0, refs: c.refs || 0 },
    topups: (m.segs || []).slice(1).map((x) => ({ amount: String(x.amount), f0: String(x.f0) })), minTopUp: ((BigInt((m.segs[0] || {}).amount || m.deposited) * BigInt(GAME.minTopUpPct)) / 100n).toString(),
    top: (d.top || []).slice(0, 10), link: `${SITE}/mine/${id}`, embed: `${SITE}/embed/mine/${id}`,
  };
}
/// the numbers across every mine: $ARCIRCLE burned (all time, today), who's digging, the hottest mine
export async function statsView() {
  return cached("stats", 30000, async () => {
    const t = now(), out = { live: live(), burned: null, burnedToday: null, mines: 0, liveMines: 0, joined: 0, digging: 0, hottest: null, hall: 0 };
    if (!live()) return out;
    const [r] = await ethCalls([{ to: mineAddress(), data: S.arcBurned }]).catch(() => []);
    const burned = r ? BigInt(r) : null;
    out.burned = burned != null ? burned.toString() : null;
    const list = await mines();
    out.mines = list.length;
    const running = list.filter((m) => t >= m.start && t < m.end);
    out.liveMines = running.length;
    out.joined = running.reduce((n, m) => n + m.builders, 0);
    if (!storeEnabled()) return out;
    const day = dayOf(t).replace(/-/g, "");
    const docs = await getDocs([P.day(day), P.hall(), ...running.slice(0, 12).map((m) => P.epTot(m.id, epochAt(m, t)))]);
    // $ARCIRCLE burned today: against the first reading of the day (one write a day)
    if (burned != null) {
      const base = docs[P.day(day)];
      if (!base) await commit([{ create: P.day(day), data: { burned: burned.toString(), t } }]).catch(() => {});
      out.burnedToday = (burned - BigInt((base && base.burned) || burned.toString())).toString();
    }
    out.hall = ((docs[P.hall()] || {}).items || []).length;
    let best = null;
    for (const m of running.slice(0, 12)) { const cur = docs[P.epTot(m.id, epochAt(m, t))] || {}; if ((cur.points || 0) > ((best && best.points) || 0)) best = { id: m.id, points: cur.points || 0, token: m.token }; }
    if (best) out.hottest = { id: best.id, points: best.points, symbol: (await tokenMeta([best.token]))[best.token].symbol };
    const act = await Promise.all(running.slice(0, 6).map((m) => liveBuilders(m.id, epochAt(m, t)).catch(() => ({ n: 0 }))));
    out.digging = act.reduce((n, a) => n + (a.n || 0), 0);
    return out;
  });
}
/// a card's claim, checked against the builder's own record (share cards can't be faked)
export async function cardFacts(w, card, kind) {
  const bd = await builderOf(w), ym = seasonOf(now());
  if (card === "jackpot") return ["diamond", "arc", "heart"].includes(kind) && (bd[`o_${kind}`] || 0) >= 1 ? { kind, n: bd[`o_${kind}`], first: bd[`f_${kind}`] || null } : null;
  if (card === "rank") return { rank: rankOf(bd.pts || 0), pts: bd.pts || 0 };
  if (card === "season") {
    const pts = ((await getDocs([P.season(ym)]))[P.season(ym)] || {}).pts || {};
    const order = Object.entries(pts).sort((a, b) => b[1] - a[1]), k = order.findIndex(([a]) => a === lc(w));
    return k >= 0 ? { ym, place: k + 1, of: order.length, pts: order[k][1] } : null;
  }
  if (card === "crew" && bd.crew) { const c = (await getDocs([P.crew(bd.crew)]))[P.crew(bd.crew)]; const ci = crewInfo(c, ym); return ci ? { ...ci, owner: c.owner === lc(w) } : null; }
  if (card === "book") { const b = bookOf(bd); return { found: b.filter((x) => x.n > 0).length, of: b.length, book: b }; }
  return null;
}
export async function listView() {
  const list = await mines();
  const meta = await tokenMeta(list.map((m) => m.token));
  const docs = storeEnabled() && list.length ? await getDocs(list.slice(0, 60).map((m) => P.mine(m.id))) : {};
  const t = now();
  return list.map((m) => {
    const d = docs[P.mine(m.id)] || {};
    return { ...ser(m), token: meta[m.token], layer: layerAt(m, t), emittedNow: emitted(m, t).toString(), stats: d.stats || {}, status: t < m.start ? "soon" : t < m.end ? (m.paused ? "paused" : "live") : m.closed ? "closed" : "ended" };
  });
}
export async function config() {
  let op = null, fee = null, burned = null, paused = false;
  if (live()) {
    const r = await ethCalls([{ to: mineAddress(), data: S.operator }, { to: mineAddress(), data: S.feeArc }, { to: mineAddress(), data: S.arcBurned }, { to: mineAddress(), data: S.joinsPaused }]).catch(() => []);
    op = r[0] ? lc(wAddr(r[0], 0)) : null; fee = r[1] ? BigInt(r[1]).toString() : null; burned = r[2] ? BigInt(r[2]).toString() : null; paused = !!(r[3] && BigInt(r[3]) === 1n);
  }
  const opAddr = operatorAddress();
  return {
    live: live(), address: mineAddress() || null, game: GAME, items: await items().catch(() => []), feeArc: fee, feeUsd: GAME.feeUsd, joinsPaused: paused, arcircleBurned: burned,
    ready: { secret: !!secret(), store: storeEnabled(), operatorKey: !!opAddr, operatorMatches: op && opAddr ? lc(op) === lc(opAddr) : null },
  };
}
export { P as PATHS, points };
