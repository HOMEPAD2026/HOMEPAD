// world-survivors-data.js — SURVIVORS ARENA's rules: the heroes, the monsters, the weapons and passives (the level-up
// cards), the waves, the bosses and the end-of-run reward. world-survivors.js plays them; api/_world-survivors.mjs keeps a
// copy of RULES and reward() (the server doesn't import the game's files) and tests/world/surv.test.mjs checks they agree.
export const RULES = {
  RUN_S: 720, // 12 minutes; the final boss comes at 12:00 and the run ends when it falls (or at END_S)
  END_S: 900,
  BOSS_AT: [180, 360, 540, 720],
  DIFF: { easy: { k: 0.7, cap: 2100, hp: 0.75, dmg: 0.7, rate: 0.85 }, normal: { k: 1, cap: 3000, hp: 1, dmg: 1, rate: 1 }, hard: { k: 1.5, cap: 5000, hp: 1.45, dmg: 1.35, rate: 1.2 } },
  DAY_RUNS: 3, DAY_ARCL: 10000, MAX_KPS: 6, // paid runs a day, the game's own ARCL a day, the most knock-outs a second a run can claim
};
/// what a finished run pays (the server computes the same, never trusting a client's number): minutes survived, every 10
/// knock-outs, and — only for a run that lived to 12:00 — 300 a boss and 800 for surviving; times the difficulty, capped
export function reward({ secs, kills, bosses, diff, clear }) {
  const d = RULES.DIFF[diff] || RULES.DIFF.normal, mins = Math.floor(Math.max(0, secs) / 60);
  const base = Math.min(1200, mins * 100) + Math.min(800, Math.floor(Math.max(0, kills) / 10) * 20) + (clear ? Math.max(0, bosses) * 300 + 800 : 0);
  return Math.min(d.cap, Math.floor(base * d.k));
}
/// the world XP a run gives (kept apart from the run's own levels)
export const worldXp = ({ secs, kills, bosses, diff }) => Math.floor((Math.max(0, secs) + Math.max(0, kills) * 2 + Math.max(0, bosses) * 200) * ((RULES.DIFF[diff] || RULES.DIFF.normal).k));

// the heroes: the world's own three, each with a small edge and its first weapon
export const HEROES = [
  { id: "custom-aron", name: "ARON", perk: "Attack +10%", w: "blaster", dmg: 1.1, area: 1, speed: 1, color: "#38d8ff" },
  { id: "custom-lumi", name: "LUMI", perk: "Area +15%", w: "orb", dmg: 1, area: 1.15, speed: 1, color: "#ff6fc8" },
  { id: "custom-nex", name: "NEX", perk: "Move speed +12%", w: "laser", dmg: 1, area: 1, speed: 1.12, color: "#9b6bff" },
];

// the monsters (Quaternius Ultimate Monsters, CC0; models/world/survivors/monsters.glb): h height, fly hover height,
// hp, sp speed, dmg a touch, xp the gem's worth, r body radius
export const MON = {
  blob: { h: 0.95, hp: 9, sp: 2.3, dmg: 5, xp: 1, r: 0.45 },
  pink: { h: 1.0, hp: 15, sp: 2.6, dmg: 6, xp: 1, r: 0.45 },
  mush: { h: 1.1, hp: 22, sp: 2.4, dmg: 7, xp: 1, r: 0.5 },
  bee: { h: 1.05, fly: 0.7, hp: 14, sp: 3.7, dmg: 6, xp: 1, r: 0.45 },
  ninja: { h: 1.25, hp: 34, sp: 3.5, dmg: 9, xp: 2, r: 0.5 },
  orc: { h: 2.0, hp: 70, sp: 2.4, dmg: 12, xp: 3, r: 0.75 },
  ghost: { h: 1.5, fly: 0.45, hp: 48, sp: 3.1, dmg: 10, xp: 2, r: 0.6 },
  glub: { h: 1.4, fly: 0.55, hp: 64, sp: 2.9, dmg: 11, xp: 3, r: 0.6 },
  spiky: { h: 1.5, hp: 180, sp: 2.5, dmg: 14, xp: 12, r: 0.75, elite: true },
  mushx: { h: 1.7, hp: 260, sp: 2.6, dmg: 15, xp: 14, r: 0.8, elite: true },
  skull: { h: 2.5, hp: 420, sp: 2.5, dmg: 18, xp: 18, r: 0.95, elite: true },
  yeti: { h: 2.7, hp: 600, sp: 2.6, dmg: 20, xp: 22, r: 1.05, elite: true },
  king: { h: 4.4, hp: 3200, sp: 2.2, dmg: 22, xp: 120, r: 1.7, boss: "Mushroom King" },
  golem: { h: 4.6, fly: 0.6, hp: 7600, sp: 2.4, dmg: 26, xp: 200, r: 1.8, boss: "Goleling Prime" },
  dragon: { h: 5.0, fly: 1.2, hp: 14000, sp: 2.7, dmg: 30, xp: 320, r: 2.0, boss: "Sky Dragon" },
  titan: { h: 7.2, hp: 30000, sp: 2.3, dmg: 36, xp: 600, r: 2.6, boss: "Infinity Titan" },
};
export const BOSSES = ["king", "golem", "dragon", "titan"];
/// who comes at second s: the pool for the minute, elites now and then (weights)
export function poolAt(s) {
  const m = s / 60;
  if (m < 1) return [["blob", 1]];
  if (m < 2) return [["blob", 3], ["pink", 2]];
  if (m < 3) return [["blob", 2], ["pink", 2], ["mush", 2], ["bee", 1]];
  if (m < 4.5) return [["pink", 2], ["mush", 3], ["bee", 2], ["orc", 1]];
  if (m < 6) return [["mush", 2], ["bee", 2], ["orc", 2], ["ninja", 2]];
  if (m < 7.5) return [["ninja", 3], ["orc", 2], ["ghost", 3], ["bee", 1]];
  if (m < 9) return [["ninja", 2], ["orc", 2], ["ghost", 3], ["glub", 2]];
  if (m < 10.5) return [["orc", 2], ["ghost", 2], ["glub", 3], ["ninja", 2]];
  return [["orc", 3], ["ghost", 2], ["glub", 3], ["ninja", 2], ["mush", 1]];
}
export const eliteAt = (s) => (s < 150 ? null : s < 300 ? "spiky" : s < 420 ? "mushx" : s < 600 ? "skull" : "yeti");
/// how many should be about at second s (before the device's cap): a slow climb, then a crowd
export const crowdAt = (s) => Math.round(10 + s * 0.13 + Math.max(0, s - 360) * 0.06);
/// a monster's health at second s: tougher every minute
export const hpK = (s) => 1 + s / 150 + Math.max(0, s - 480) / 200;
/// the run's own level: XP for the next one
export const needXp = (lv) => Math.round(5 + lv * 3 + lv * lv * 0.16);

// the cards: 6 weapons and 12 passives, 5 levels each. lv(n) says what level n gives (shown on the card)
export const WEAPONS = {
  blaster: { name: "Energy Blaster", line: "Fires at the nearest monster", dmg: [10, 13, 16, 20, 26], cd: [0.72, 0.66, 0.6, 0.55, 0.5], n: [1, 1, 2, 2, 3], pierce: [0, 1, 1, 2, 2],
    lv: ["Shoots the nearest monster", "+30% damage, pierces 1", "+1 shot", "+25% damage, pierces 2", "+1 shot, +30% damage"] },
  chain: { name: "Lightning Chain", line: "Lightning that jumps between monsters", dmg: [14, 18, 22, 28, 36], cd: [2.4, 2.2, 2.0, 1.8, 1.6], n: [3, 4, 5, 6, 8],
    lv: ["Strikes 3 monsters", "Jumps to 4", "Jumps to 5, faster", "Jumps to 6", "Jumps to 8, +30% damage"] },
  orb: { name: "Fire Orb", line: "Fireballs that circle you", dmg: [9, 11, 14, 17, 22], n: [1, 2, 2, 3, 4], rad: [2.4, 2.5, 2.7, 2.8, 3.0],
    lv: ["1 fireball circles you", "+1 fireball", "Wider, +25% damage", "+1 fireball", "+1 fireball, +30% damage"] },
  laser: { name: "Laser Beam", line: "A beam through every monster in a line", dmg: [26, 32, 40, 50, 64], cd: [3.0, 2.8, 2.6, 2.4, 2.1], n: [1, 1, 2, 2, 3],
    lv: ["A beam through the crowd", "+25% damage", "+1 beam", "+25% damage, faster", "+1 beam, +30% damage"] },
  nova: { name: "Thunder Nova", line: "A blast all around you", dmg: [18, 24, 30, 38, 48], cd: [4.4, 4.1, 3.8, 3.4, 3.0], rad: [3.6, 4.0, 4.4, 5.0, 5.6],
    lv: ["A blast that pushes back", "+30% damage", "Bigger, faster", "+25% damage, bigger", "Biggest, +25% damage"] },
  meteor: { name: "Meteor", line: "Rocks fall on the crowd", dmg: [44, 56, 70, 86, 106], cd: [4.0, 3.7, 3.4, 3.1, 2.8], n: [1, 2, 2, 3, 4],
    lv: ["A meteor on a monster", "+1 meteor", "+25% damage, faster", "+1 meteor", "+1 meteor, +25% damage"] },
};
export const PASSIVES = {
  power: { name: "Power Boost", line: "+10% damage a level" },
  rapid: { name: "Rapid Fire", line: "+10% shooting speed a level" },
  heavy: { name: "Heavy Impact", line: "+10% area a level" },
  range: { name: "Long Range", line: "+12% reach a level" },
  crit: { name: "Critical Eye", line: "+6% critical hits a level" },
  speed: { name: "Speed Boots", line: "+7% move speed a level" },
  armor: { name: "Armor Plate", line: "-7% damage taken a level" },
  vital: { name: "Vital Core", line: "+20 max HP a level" },
  recov: { name: "Recovery", line: "+0.4 HP a second a level" },
  magnet: { name: "XP Magnet", line: "+40% pickup range a level" },
  cool: { name: "Cooldown Core", line: "-6% cooldowns a level" },
  vamp: { name: "Vampire", line: "Heal on knock-outs" },
};
// evolutions: a weapon at level 5 and its passive at level 5 → a stronger weapon (offered as a card, or in a chest)
export const EVOS = [
  { id: "thunder", from: "chain", with: "cool", name: "Infinity Thunder", line: "Endless lightning: 14 jumps, twice as often" },
  { id: "star", from: "blaster", with: "rapid", name: "Star Blaster", line: "A fan of piercing stars" },
  { id: "inferno", from: "orb", with: "heavy", name: "Inferno Ring", line: "Six great fireballs" },
];
export const SLOTS = 6, MAX_LV = 5;
