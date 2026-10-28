// world-hwrealm-data.js — the HALLOWEEN REALM's numbers, shared by the game (world-hwrealm.js) and the server
// (api/_world-hwrealm.mjs). The owner's spec v1.0 (2026-10-28) with the owner's answers: a permanent land of its own (the
// town's Pumpkin Kings stay as they are), the Inferno Jack set as items of their own (not the bag's gear), the high grounds
// up to Lv 400, and no trading for now.
//   the clock      30 minutes a cycle on the server's clock: 20 day, 10 night (the Cursed Night), a warning 60 s before
//   the night      monsters' HP / attack / defence ×1.5, XP ×2, ARCL ×1.5 (inside the day's caps), drops ×1.5, rare ×2
//   the grounds    Pumpkin Patch 15–50 · Whispering Forest 50–100 · Graveyard of the Lost 100–200 · Witch's Candy
//                  Factory 150–250 · Midnight Clocktower 250–350 · Inferno Pumpkin Throne 350–400, round the village
//   the set        six Legendary pieces (weapon, armor, helm, ring, necklace, boots), each the Lv 100 Legendary of its
//                  slot (a Crimson Celestial piece is that × 1.3 × its multiplier, so it stays above); 2–6 worn: atk +5 %,
//                  HP +8 %, the realm's XP +15 %, damage to the realm's monsters +10 %, Pumpkin Soul
export const HW = {
  ID: "hw", NAME: "Halloween Realm", CYCLE: 1800, DAY: 1200, WARN: 60,
  NIGHT: { hp: 1.5, atk: 1.5, def: 1.5, xp: 2, arcl: 1.5, drop: 1.5, rare: 2 },
  LAND: { x: 2400, z: 2400, r: 165 }, VILLAGE_R: 26,
  // the chance a knock-out drops one of the six pieces (night ×1.5): the spec's 10.1 table
  DROP: { "": 0.0003, elite: 0.003, boss: 0.02, jack: 0.05 },
  // Pumpkin Soul Fragments: a piece salvaged gives SALVAGE (+ its + × 2), CRAFT of them make a piece of the slot you pick;
  // a field boss gives BOSS, Inferno Jack JACK, an elite one now and then (ELITE)
  FRAG: { SALVAGE: 20, CRAFT: 100, BOSS: [1, 3], JACK: [5, 10], ELITE: 0.03 },
  // enhancing a piece: +1 … +10 for fragments; a miss keeps the +
  ENH: { MAX: 10, cost: (p) => 5 + p * 5, rate: (p) => (p < 3 ? 1 : p < 6 ? 0.7 : p < 8 ? 0.5 : 0.3) },
  KILL_GAP: 700, KILL_DAY: 4000, // the server counts at most one knock-out each 0.7 s, 4,000 a Seoul day
  SOUL: { chance: 0.05, k: 1.8, cd: 8, r: 4.5 },
  JACK: { lv: 400, hpK: 60, phases: [0.7, 0.3], every: 20 * 60e3 }, // the realm's Inferno Jack: three phases (100–70 %, 70–30 %, 30–0 %)
};
/// the realm's clock: { night, left (seconds to the change), warn (the last minute of the day), cycle (its number) }
export function clockOf(ms = Date.now()) {
  const s = Math.floor(ms / 1000), t = ((s % HW.CYCLE) + HW.CYCLE) % HW.CYCLE, night = t >= HW.DAY;
  const left = night ? HW.CYCLE - t : HW.DAY - t;
  return { night, left, warn: !night && left <= HW.WARN, cycle: Math.floor(s / HW.CYCLE), t };
}
// a = the direction from the village's middle (0 = south, the way in; 90 = east), d = how far, r = the ground's size
export const GROUNDS = [
  { id: "hw-patch", name: "Pumpkin Patch", a: 45, d: 62, r: 20, lv: [15, 50], color: 0xff9a2e, mobs: ["drop", "spam"], skins: { drop: "HwSlime", spam: "HwScarecrow" }, names: { drop: "Pumpkin Slime", spam: "Cursed Scarecrow" }, eskin: "HwScarecrow", elite: 0.1, pow: 1.1,
    boss: { name: "The Pumpkin Brute", line: "Rolls over everything in the patch", skin: "HwSlime", skinH: 1.8, tint: 0xff8a1f, model: "QuadShell", scale: 1.8, y: 0.9 } },
  { id: "hw-forest", name: "Whispering Forest", a: 270, d: 82, r: 30, lv: [50, 100], color: 0x7cf5c8, mobs: ["spam", "rug"], skins: { spam: "HwGhost", rug: "HwScarecrow" }, names: { spam: "Phantom Ghost", rug: "Cursed Scarecrow" }, eskin: "HwTreant", ename: "Cursed Treant", elite: 0.16, pow: 1.25,
    boss: { name: "The Elder Treant", line: "Its roots hold the whole forest", skin: "HwTreant", skinH: 2.6, tint: 0x39ff88, model: "QuadShell", scale: 2.0, y: 1.0 } },
  { id: "hw-grave", name: "Graveyard of the Lost", a: 90, d: 82, r: 30, lv: [100, 200], color: 0xb48cff, mobs: ["rug", "spam"], skins: { rug: "HwSkeleton", spam: "HwGhost" }, names: { rug: "Skeleton Knight", spam: "Phantom Ghost" }, eskin: "HwSkeleton", ename: "Skeleton Knight", elite: 0.22, pow: 1.45,
    boss: { name: "The Grave Lord", line: "Raises the lost every midnight", skin: "HwSkeleton", skinH: 2.4, tint: 0xb48cff, model: "Trilobite", scale: 2.2, y: 1.0 } },
  { id: "hw-candy", name: "Witch's Candy Factory", a: 0, d: 80, r: 28, lv: [150, 250], color: 0xff6fae, mobs: ["drop", "spam"], skins: { drop: "HwSlime", spam: "HwScarecrow" }, names: { drop: "Jelly Slime", spam: "Candy Scarecrow" }, eskin: "HwWitch", ename: "Midnight Witch", elite: 0.2, pow: 1.6,
    boss: { name: "The Candy Witch", line: "Every sweet has a spell inside", skin: "HwWitch", skinH: 2.2, tint: 0xff6fae, model: "QuadShell", scale: 2.0, y: 1.0 } },
  { id: "hw-clock", name: "Midnight Clocktower", a: 180, d: 70, r: 26, lv: [250, 350], color: 0x5fd3ff, mobs: ["rug", "spam", "drop"], skins: { rug: "HwSkeleton", spam: "HwGhost", drop: "HwScarecrow" }, names: { rug: "Clockwork Knight", spam: "Midnight Ghost", drop: "Gear Scarecrow" }, eskin: "HwSkeleton", ename: "Clockwork Knight", elite: 0.26, pow: 1.8,
    boss: { name: "The Midnight Warden", line: "When the bell rings twelve, it wakes", skin: "HwTreant", skinH: 2.8, tint: 0x5fd3ff, model: "Trilobite", scale: 2.4, y: 1.0 } },
  { id: "hw-throne", name: "Inferno Pumpkin Throne", a: 180, d: 128, r: 28, lv: [350, 400], color: 0xff4d2a, mobs: ["spam", "rug", "drop"], skins: { spam: "HwGhost", rug: "HwSkeleton", drop: "HwWitch" }, names: { spam: "Inferno Ghost", rug: "Inferno Knight", drop: "Inferno Witch" }, eskin: "HwTreant", ename: "Burning Treant", elite: 0.3, pow: 2.0, jack: true,
    boss: { name: "Inferno Jack", line: "King of the Cursed Night", skin: "HwJack", skinH: 2.8, tint: 0xff5a1a, model: "Trilobite", scale: 2.6, y: 1.0 } },
];
export const groundXZ = (g) => [HW.LAND.x + Math.sin((g.a * Math.PI) / 180) * g.d, HW.LAND.z + Math.cos((g.a * Math.PI) / 180) * g.d];
export const groundOf = (id) => GROUNDS.find((g) => g.id === id) || null;
// the rare one: a Midnight Witch, in any ground (night ×2)
export const RARE = { skin: "HwWitch", name: "Midnight Witch", chance: 0.02 };

export const SET = {
  NAME: "Inferno Jack", RARITY: "LEGENDARY", COLOR: "#ff8a1f",
  PIECES: [
    { slot: "weapon", id: "blade", name: "Inferno Blade", glb: "hw-blade", extra: { atk: 18 } },
    { slot: "armor", id: "armor", name: "Cursed Armor", glb: "hw-armor", extra: { hp: 120 } },
    { slot: "helm", id: "crown", name: "Jack's Crown", glb: "hw-crown", extra: { def: 14 } },
    { slot: "ring", id: "ring", name: "Phantom Ring", glb: "hw-ring", extra: { crit: 3 } },
    { slot: "necklace", id: "pendant", name: "Soul Pendant", glb: "hw-pendant", extra: { hwXp: 5 } },
    { slot: "boots", id: "boots", name: "Shadow Boots", glb: "hw-boots", extra: { spd: 3 } },
  ],
  BONUS: [[2, "Attack +5%", { atkPct: 5 }], [3, "Max HP +8%", { hpPct: 8 }], [4, "Halloween Realm EXP +15%", { hwXp: 15 }], [5, "Damage to the realm's monsters +10%", { hwDmg: 10 }], [6, "Pumpkin Soul", { soul: 1 }]],
};
export const pieceOf = (id) => SET.PIECES.find((p) => p.id === id) || null;
export const pieceOfSlot = (slot) => SET.PIECES.find((p) => p.slot === slot) || null;
/// one piece's stats: the slot's Legendary at Lv 100 with its + (itemStats is passed in: world-rpg-data.js), plus its own extra
export function pieceStats(inst, itemStats) {
  const P = pieceOf(inst && inst.k); if (!P) return {};
  const plus = Math.max(0, Math.min(HW.ENH.MAX, Math.floor(inst.p || 0))), out = { ...itemStats({ b: `${P.slot}-4`, r: 4, lv: 100, p: plus }) };
  for (const [k, v] of Object.entries(P.extra)) out[k] = (out[k] || 0) + v;
  return out;
}
/// the set's bonuses for the pieces worn (one a slot): { n, active: [[need, name]], stats }
export function setBonus(worn) {
  const n = new Set((worn || []).map((w) => (pieceOf(w.k) || {}).slot).filter(Boolean)).size, stats = {}, active = [];
  for (const [need, name, b] of SET.BONUS) if (n >= need) { active.push([need, name]); for (const [k, v] of Object.entries(b)) stats[k] = (stats[k] || 0) + v; }
  return { n, active, stats };
}
/// the drop's chance for a knock-out: rank "" / elite / boss / jack, at night ×1.5
export const dropChance = (rank, night) => (HW.DROP[rank] != null ? HW.DROP[rank] : HW.DROP[""]) * (night ? HW.NIGHT.drop : 1);
