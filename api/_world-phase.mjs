// api/_world-phase.mjs — where ARCIRCLE World's test stands, and whose data each stage reads.
//
//   phase "cbt"     the closed beta: wallets holding GATE_MIN $ARCIRCLE may enter (api/_world.mjs gate)
//   phase "closed"  between the betas: only GM wallets play; everyone else sees "open beta coming soon"
//   phase "obt"     the open beta: everyone may enter, no $ARCIRCLE needed
//
// epoch: each fresh start is a new epoch. From epoch 2 the game's progress lives in its own collections
// (worldSave_e2/…, worldStats/e2_players…), so levels, XP, gear, ARCL, islands and villages start from nothing while
// the closed beta's data stays where it was (read for the CBT rewards, never changed). What a player paid
// $ARCIRCLE for carries over: worldOwn falls back to the closed beta's record, minus what was bought with ARCL.
// The flip to the open beta is two constants here and the same two in world-lock.js: phase "obt", epoch 2.
export const WORLD_PHASE = { phase: "obt", epoch: 2 }; // b409: the open beta (from 14 October 2026)

// collections that are not progress and stay the same in every epoch: payments, counts, presence, crews, coin lots,
// health counters, the CBT reward records
const KEEP = new Set(["worldPayQuote", "worldPayTx", "worldPlayers", "worldCounted", "worldVisitors", "worldVisit", "worldSeen", "worldOnline",
  "worldDiag", "worldDiagMsg", "worldCrew", "worldCrewCode", "worldCrewOf", "worldCrewTag", "worldFriend", "worldDm", "worldDmBox", "worldPres", "worldArclNotify", "worldLot", "worldCbt", "worldCbtClaim"]);
// worldStats documents that stay: the visit counts, the paid plaza slots, the Forge and shop sales counters
const KEEP_STATS = new Set(["main", "plaza", "forge", "shop"]);

/// a document path in this epoch (epoch 1: the path itself)
export function scopePath(path, epoch) {
  const p = String(path);
  if (!(epoch >= 2) || !p.startsWith("world")) return p;
  const i = p.indexOf("/"); if (i < 0) return p;
  const coll = p.slice(0, i), doc = p.slice(i + 1);
  if (coll === "worldStats") return KEEP_STATS.has(doc) ? p : `worldStats/e${epoch}_${doc}`;
  if (KEEP.has(coll)) return p;
  return `${coll}_e${epoch}/${doc}`;
}

/// the closed beta's worldOwn for the open beta: what was paid for in $ARCIRCLE stays, what was bought with ARCL goes.
/// Items with no purchase in the log (bought before the log existed) stay.
export function carryOwn(o) {
  if (!o || typeof o !== "object") return null;
  const buys = Array.isArray(o.buys) ? o.buys : [], arcl = {}, paid = new Set();
  for (const b of buys) { if (!b || !b.id) continue; if (b.via === "arcl") arcl[b.id] = (arcl[b.id] || 0) + 1; else paid.add(b.id); }
  const out = { ...o, items: (Array.isArray(o.items) ? o.items : []).filter((id) => paid.has(id) || !arcl[id]), buys: buys.filter((b) => b && b.via !== "arcl"), carried: 1 };
  for (const [id, f] of [["rename", "renames"], ["rekind", "rekinds"], ["rechar", "rechars"]]) if (arcl[id]) out[f] = Math.max(0, (o[f] || 0) - arcl[id]);
  if (arcl.bagplus) out.bag = Math.max(0, (Math.floor(Number(o.bag)) || 0) - arcl.bagplus);
  if (arcl.isleup && !paid.has("isleup")) out.isleLv = 0;
  if (arcl.lot13 && !paid.has("lot13")) out.lots = [];
  delete out.revives; // a revive was for a knock-out in the closed beta
  return out;
}

/// the store, as this epoch sees it: { getDocs, setDoc, commit } with paths moved to the epoch's collections
export function scopeStore(store, epoch) {
  if (!(epoch >= 2)) return store;
  const S = (p) => scopePath(p, epoch);
  async function getDocs(paths) {
    const mapped = paths.map(S), got = await store.getDocs([...new Set(mapped)]), out = {};
    paths.forEach((p, i) => { out[p] = got[mapped[i]] == null ? null : got[mapped[i]]; });
    // worldOwn: the closed beta's record, carried over, until this epoch has its own
    const missing = paths.filter((p) => p.startsWith("worldOwn/") && !out[p]);
    if (missing.length) { const raw = await store.getDocs(missing); for (const p of missing) out[p] = carryOwn(raw[p]); }
    return out;
  }
  const setDoc = (p, d) => store.setDoc(S(p), d);
  const commit = (writes) => store.commit(writes.map((w) => {
    const o = { ...w };
    for (const k of ["create", "set", "del", "inc"]) if (o[k]) o[k] = S(o[k]);
    return o;
  }));
  return { getDocs, setDoc, commit };
}

// ---- the closed beta's rewards ----
// every wallet with a closed-beta save: 1 Legendary weapon. The top 3 by level (GMs left out; ties by XP) also get
// 3 / 2 / 1 more Legendary pieces in random slots. Tier 1 (Cold Wallet: worn from level 5), item level 15.
// GM wallets aren't in the ranking (so no player loses a place) but get the 2nd place's set: the weapon and 2 more.
export const CBT_REWARD = { r: 4, tier: 1, lv: 15, top: [3, 2, 1], gmRank: 2 };
export const CBT_SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"];
const rid = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); };
const pick = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
/// the pieces for a rank (0: not in the top 3)
export function cbtItems(rank) {
  const R = CBT_REWARD, it = (slot) => ({ id: rid(), b: `${slot}-${R.tier}`, r: R.r, lv: R.lv, p: 0, ...(slot === "weapon" ? { k: pick(5) } : {}) });
  const extra = rank >= 1 && rank <= 3 ? R.top[rank - 1] : 0;
  return [it("weapon"), ...Array.from({ length: extra }, () => it(CBT_SLOTS[pick(CBT_SLOTS.length)]))];
}
