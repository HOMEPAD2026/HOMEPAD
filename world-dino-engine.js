// world-dino-engine.js — DINO SOULMATE (ARCIRCLE WORLD: JURASSIC design v1.0): one dinosaur companion per account, raised
// from a wild egg. The rules both sides read: where eggs appear and when, the 72-hour care clock, growth, bond and the
// companion's numbers. Shared word for word with the server (api/_world-dino-engine.mjs is a copy;
// tests/world/dino.test.mjs checks the two are the same). Nothing here reads the clock: every function takes the time.
//
// An egg: found → day 1 care (warm, water, feed) within D1 of finding → day 2 care 20–28 h after day 1's →
// day 3 care 20–28 h after day 2's → it hatches once 72 h have passed since it was found (it waits after that).
// Missing a day's window kills the egg. A hatched companion never dies: knocked out in a fight it's back in 60 s.
export const DINO = {
  // the nests on the Primeval Plains (world-jurassic.js coordinates): eggs only ever appear at these
  NESTS: [{ id: "n0", x: -70, z: 20 }, { id: "n1", x: -20, z: -60 }, { id: "n2", x: 40, z: -95 }, { id: "n3", x: 110, z: 10 }, { id: "n4", x: -105, z: -25 }, { id: "n5", x: 95, z: 95 }, { id: "n6", x: -60, z: 95 }, { id: "n7", x: 30, z: -125 }],
  SLOT: 30 * 60e3, LIVE: 10 * 60e3, CHANCE: 0.12, // a nest's chance of an egg each half hour; it stays 10 minutes
  D1: 6 * 3600e3, WIN: [20 * 3600e3, 28 * 3600e3], HATCH: 72 * 3600e3,
  CARE: ["warm", "water", "feed"],
  // what a care costs from your Jurassic pack (the feed: a dino treat, else raw meat, else 2 berries)
  WARM: { wood: 2 }, FEED: [{ treat: 1 }, { meat: 1 }, { berries: 2 }],
  // the companion
  STAGES: [{ id: "baby", lv: 1, days: 0, size: 0.55 }, { id: "juvenile", lv: 10, days: 3, size: 0.75 }, { id: "teen", lv: 25, days: 7, size: 0.9 }, { id: "adult", lv: 50, days: 14, size: 1.15 }, { id: "awakened", lv: 80, days: 30, size: 1.3 }],
  LV_MAX: 100, LV_OVER: 5, BOND0: 30, BOND_MIN: 20, BOND_DAY: 15, BOND_AWAY: 3,
  BOND: { feed: 5, hunts10: 5, boss: 8, pet: 2, rest: 3 },
  XP_HUNT: { raptor: 30, claw: 45, trike: 60, spino: 120, alpha: 200, titan: 250 }, XP_GATHER: 3, XP_FEED: 6, XP_PET: 2,
  BOSSES: ["alpha", "spino", "titan"],
  // dino treats for ARCL (a convenience: they feed like meat, nothing more)
  FOOD: [{ id: "f1", arcl: 300, n: 3 }, { id: "f2", arcl: 900, n: 10 }], FOOD_DAY: 20,
  DOWN_MS: 60e3,
};
const H = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/// the eggs out in the nests at time t (before claims): [{ nest, slot, from, to, x, z }]
export function eggsAt(t) {
  const out = [], s = Math.floor(t / DINO.SLOT);
  for (const k of [s - 1, s]) DINO.NESTS.forEach((n, i) => {
    if (H(k, i + 1) >= DINO.CHANCE) return;
    const from = k * DINO.SLOT + Math.floor(H(k, i + 101) * (DINO.SLOT - DINO.LIVE)), to = from + DINO.LIVE;
    if (t >= from && t < to) out.push({ nest: n.id, slot: k, from, to, x: n.x, z: n.z });
  });
  return out;
}
/// an egg as it stands at t: { stage: "D1" | "D2" | "D3" | "WAIT" | "READY" | "DEAD", day, open, opensAt, closesAt, hatchAt, cares }
export function eggState(e, t) {
  if (!e) return null;
  const done = e.done || [], day = done.length + 1, hatchAt = e.found + DINO.HATCH;
  if (e.dead) return { stage: "DEAD", day, open: false, deadAt: e.dead, hatchAt, cares: e.cares || {} };
  if (day >= 4) return { stage: t >= hatchAt ? "READY" : "WAIT", day: 4, open: false, hatchAt, cares: {} };
  const opensAt = day === 1 ? e.found : done[day - 2] + DINO.WIN[0], closesAt = day === 1 ? e.found + DINO.D1 : done[day - 2] + DINO.WIN[1];
  if (t > closesAt) return { stage: "DEAD", day, open: false, deadAt: closesAt, hatchAt, cares: e.cares || {} };
  return { stage: "D" + day, day, open: t >= opensAt, opensAt, closesAt, hatchAt, cares: e.cares || {} };
}
/// one care for the egg at t (it must be its day's window); returns the egg, or null (and why)
export function care(e, kind, t) {
  const s = eggState(e, t); if (!s || !/^D[123]$/.test(s.stage)) return { err: "the egg can't be cared for now" };
  if (!s.open) return { err: "too early: come back later" };
  if (!DINO.CARE.includes(kind)) return { err: "which care?" };
  const cares = { ...(e.cares || {}) }; if (cares[kind]) return { err: "already done today" };
  cares[kind] = t; const all = DINO.CARE.every((k) => cares[k]);
  return { egg: { ...e, cares: all ? {} : cares, done: all ? [...(e.done || []), t] : e.done || [] }, dayDone: all };
}
/// the egg's look (a reading, from the clock: 35–38 °C is right; water, food and health fall toward the window's end)
export function eggVitals(e, t) {
  const s = eggState(e, t); if (!s || s.stage === "DEAD") return { temp: 30, water: 0, food: 0, health: 0 };
  if (s.stage === "WAIT" || s.stage === "READY") return { temp: 37.2, water: 100, food: 100, health: 100 };
  const span = s.closesAt - (s.day === 1 ? e.found : (e.done || [])[s.day - 2]), left = Math.max(0, Math.min(1, (s.closesAt - t) / span)), c = s.cares;
  const k = (on) => Math.round(on ? 100 : 25 + left * 70);
  return { temp: +(c.warm ? 37.2 : 33 + left * 4.5).toFixed(1), water: k(c.water), food: k(c.feed), health: Math.round(30 + left * 70) };
}
// ---------------- the companion ----------------
export const xpNeed = (lv) => 40 + 12 * lv;
export const daysWith = (b, t) => Math.max(0, Math.floor((t - b.hatched) / 864e5));
/// the growth stage: the higher of what its level and its days together both allow
export function stageOf(b, t) { const d = daysWith(b, t); let k = 0; DINO.STAGES.forEach((s, i) => { if (b.lv >= s.lv && d >= s.days) k = i; }); return k; }
/// its numbers, from its level and bond and the owner's (A attack, D defence, HP max) — the design's formulas
export function statsOf(b, own = {}) {
  const A = own.atk || 0, D = own.def || 0, HP = own.hp || 120, lv = b.lv, bond = b.bond;
  return { atk: Math.round((20 + 2.2 * lv) * (1 + 0.003 * bond) + 0.35 * A), def: Math.round((12 + 1.8 * lv) * (1 + 0.002 * bond) + 0.4 * D), hp: Math.round(100 + 18 * lv + 0.25 * HP) };
}
/// how much of a hunt it takes on: its share of the swings (30–55% of the owner's damage, as the design caps it)
export function assistOf(b) { if (!b) return 0; const c = 0.3 + 0.25 * Math.min(1, (b.lv - 1) / 79); return c / (1 + c); }
/// experience in, levels up (to the owner's level + LV_OVER, and LV_MAX): the companion, changed
export function gainXp(b, n, ownerLv) {
  const cap = Math.min(DINO.LV_MAX, Math.max(1, (ownerLv || 1) + DINO.LV_OVER)), o = { ...b, xp: (b.xp || 0) + Math.max(0, n | 0) };
  while (o.lv < cap && o.xp >= xpNeed(o.lv)) { o.xp -= xpNeed(o.lv); o.lv++; }
  if (o.lv >= cap) o.xp = Math.min(o.xp, xpNeed(o.lv) - 1);
  return o;
}
/// bond in (inside the day's cap) — day: the Seoul date
export function gainBond(b, n, day) {
  const bd = b.bondDay && b.bondDay.day === day ? b.bondDay : { day, n: 0 }, g = Math.max(0, Math.min(n, DINO.BOND_DAY - bd.n));
  return { ...b, bond: Math.min(100, (b.bond || 0) + g), bondDay: { day, n: bd.n + g } };
}
/// the days you were away (whole Seoul days between your last visit and today): a little bond lost each, never below BOND_MIN
export function away(b, day) {
  if (!b.seen || b.seen >= day) return { ...b, seen: day };
  const gap = Math.round((Date.parse(day) - Date.parse(b.seen)) / 864e5) - 1;
  return { ...b, seen: day, bond: gap > 0 ? Math.max(Math.min(b.bond, DINO.BOND_MIN), b.bond - gap * DINO.BOND_AWAY) : b.bond };
}
