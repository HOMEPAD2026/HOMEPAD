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
  // your first egg: waiting for you alone at a nest by the gate (a new player's first one, so no one starts empty-handed)
  FIRST: { id: "first", x: -10, z: 28 },
  // what an egg carries (from its id, so the server and the game read the same): the species, its colours, its eyes,
  // its grade (five, rarer each step; the highest one in a hundred) and a roll within the grade
  SPECIES: [{ id: "raptor", w: 82 }, { id: "trike", w: 18 }],
  PALS: [{ id: "jade", c: 0xa8e8bc }, { id: "sand", c: 0xf0d8a8 }, { id: "ember", c: 0xf0a888 }, { id: "storm", c: 0xb0c4e8 }, { id: "violet", c: 0xd2b4f0 }, { id: "ash", c: 0xd8d8d0 }, { id: "moss", c: 0xc4d890 }, { id: "frost", c: 0xe4f6ff }],
  EYES: [{ id: "amber", c: 0xffb43c }, { id: "ice", c: 0x6cf0ff }, { id: "ruby", c: 0xff4d6d }, { id: "gold", c: 0xffe066 }],
  RARITY: [{ id: "common", w: 60 }, { id: "advanced", w: 25 }, { id: "rare", w: 10 }, { id: "epic", w: 4 }, { id: "legend", w: 1 }],
  // each grade's strength: its numbers times a factor in the grade's own band, the egg's roll picking where in it. The
  // bands never overlap, so at the same level and bond a higher grade is always the stronger
  GRADE: { common: [1.0, 1.06], advanced: [1.1, 1.16], rare: [1.2, 1.26], epic: [1.3, 1.36], legend: [1.42, 1.5] },
  // how many at once: eggs being cared for, dinosaurs raised
  MAX_EGGS: 3, MAX_DINOS: 12,
  // a day's companion missions (Seoul days): small rewards for doing things together
  MISSIONS: [{ id: "hunt", n: 5, xp: 60, bond: 3 }, { id: "pet", n: 3, xp: 20, bond: 2 }, { id: "rest", n: 1, treat: 1 }, { id: "battle", n: 3, xp: 40, bond: 2 }],
  // Dino Battles: your companion against another player's (theirs plays itself); a few a day, a rating, no ARCL for winning
  BATTLES_DAY: 5, RATING0: 1000, BATTLE_XP: 25,
  RIDE_STAGE: 3, // an adult carries you
};
const H = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/// a number from a string (the egg's id → its genes)
const HS = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickW = (list, x) => { const tot = list.reduce((a, o) => a + o.w, 0); let r = x * tot; for (const o of list) { if ((r -= o.w) < 0) return o.id; } return list[list.length - 1].id; };
/// an egg's genes, from its id: { species, pal, eye, rarity, size, iv } (iv: its roll within its grade, 0–1); a grade
/// given (a gift egg's) replaces the rolled one
export function genesOf(id, rar) {
  const h = HS(String(id || "egg")), f = (k) => H(h & 0x7fffffff, k);
  const g = { species: pickW(DINO.SPECIES, f(1)), pal: DINO.PALS[Math.floor(f(2) * DINO.PALS.length)].id, eye: DINO.EYES[Math.floor(f(3) * DINO.EYES.length)].id, rarity: pickW(DINO.RARITY, f(4)), iv: +f(6).toFixed(3), size: +(0.94 + f(5) * 0.12).toFixed(3) };
  if (rar && DINO.GRADE[rar]) g.rarity = rar; return g;
}
/// the next eggs to come out after t (from the schedule, looking ahead up to `hours`): [{ nest, from, to, x, z }]
export function nextEggs(t, hours = 12, n = 3) {
  const out = [], s0 = Math.floor(t / DINO.SLOT);
  for (let k = s0; k < s0 + hours * 2 && out.length < n; k++) DINO.NESTS.forEach((ne, i) => {
    if (out.length >= n || H(k, i + 1) >= DINO.CHANCE) return; const from = k * DINO.SLOT + Math.floor(H(k, i + 101) * (DINO.SLOT - DINO.LIVE));
    if (from + DINO.LIVE > t) out.push({ nest: ne.id, from, to: from + DINO.LIVE, x: ne.x, z: ne.z });
  });
  return out.sort((a, b) => a.from - b.from);
}
/// a day's missions as they stand: [{ id, n, have, done, got }]
export function missionsOf(m, day) { const d = m && m.day === day ? m : { day, c: {}, got: [] }; return DINO.MISSIONS.map((x) => ({ ...x, have: Math.min(x.n, d.c[x.id] || 0), done: (d.c[x.id] || 0) >= x.n, got: d.got.includes(x.id) })); }
/// one more toward a mission (the record, changed)
export function bumpMission(m, id, day) { const d = m && m.day === day ? m : { day, c: {}, got: [] }; return { ...d, c: { ...d.c, [id]: (d.c[id] || 0) + 1 } }; }
/// a Dino Battle, played out from a seed: a = { stats, stage, name }, b the same → { win, log: [{ s: 0|1, m, d, hp: [a, b] }], hp }
export function battle(a, b, seed) {
  let r = seed >>> 0; const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
  const F = [a, b].map((x) => ({ ...x, hp: x.stats.hp, atk: x.stats.atk, def: x.stats.def, used: {} })), log = [];
  let who = a.stats.atk + rnd() * 20 >= b.stats.atk + rnd() * 20 ? 0 : 1;
  for (let turn = 0; turn < 40 && F[0].hp > 0 && F[1].hp > 0; turn++) {
    const me = F[who], foe = F[1 - who]; let m = turn % 2 ? "claw" : "bite", k = 1, hits = 1;
    if (me.stage >= 4 && !me.used.fang && me.hp < me.stats.hp * 0.5) { m = "fang"; k = 0.8; hits = 3; me.used.fang = 1; }
    else if (me.stage >= 3 && !me.used.roar && turn >= 2) { m = "roar"; me.used.roar = 1; foe.atk = Math.round(foe.atk * 0.85); }
    else if (me.stage >= 2 && turn % 3 === 2) { m = "dash"; k = 1.4; }
    let d = 0; if (m !== "roar") for (let i = 0; i < hits; i++) d += Math.max(1, Math.round(me.atk * k * (0.9 + rnd() * 0.2) - foe.def * 0.5));
    foe.hp = Math.max(0, foe.hp - d); log.push({ s: who, m, d, hp: [F[0].hp, F[1].hp] }); who = 1 - who;
  }
  const win = F[1].hp <= 0 ? true : F[0].hp <= 0 ? false : F[0].hp / F[0].stats.hp >= F[1].hp / F[1].stats.hp;
  return { win, log, hp: [F[0].hp, F[1].hp] };
}
/// a rating after a battle (Elo, k 24; only yours moves: theirs plays itself)
export const rated = (ra, rb, win) => Math.round(ra + 24 * ((win ? 1 : 0) - 1 / (1 + 10 ** ((rb - ra) / 400))));
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
  const A = own.atk || 0, D = own.def || 0, HP = own.hp || 120, lv = b.lv, bond = b.bond, k = gradeK(b.genes);
  return { atk: Math.round(((20 + 2.2 * lv) * (1 + 0.003 * bond) + 0.35 * A) * k), def: Math.round(((12 + 1.8 * lv) * (1 + 0.002 * bond) + 0.4 * D) * k), hp: Math.round((100 + 18 * lv + 0.25 * HP) * k) };
}
/// its grade's factor: where its roll puts it in its grade's band (no genes: the lowest grade's bottom)
export function gradeK(g) { const band = DINO.GRADE[(g && g.rarity) || "common"] || DINO.GRADE.common, iv = Math.max(0, Math.min(1, Number(g && g.iv) || 0)); return +(band[0] + (band[1] - band[0]) * iv).toFixed(4); }
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
