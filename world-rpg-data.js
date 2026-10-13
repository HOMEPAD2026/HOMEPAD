// world-rpg-data.js — the numbers of ARCIRCLE World's fighting: stats by level, the gear, sets, scammer levels, the
// hunting grounds. Shared by the game (world-rpg.js, world-combat.js) and the server (api/_world-shop.mjs: the Forge).
export const SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"];
export const SLOT_NAME = { weapon: "Weapon", shield: "Shield", armor: "Armor", helm: "Helmet", ring: "Ring", boots: "Boots", necklace: "Necklace" };
export const RARITY = [
  { id: "common", name: "Common", color: "#b8c2cc", mult: 1 },
  { id: "uncommon", name: "Uncommon", color: "#5fe08a", mult: 1.25 },
  { id: "rare", name: "Rare", color: "#4fa8ff", mult: 1.55 },
  { id: "epic", name: "Epic", color: "#b48cff", mult: 1.9 },
  { id: "legendary", name: "Legendary", color: "#ffc861", mult: 2.4 },
];
// five tiers per slot; a tier's items need its level and belong to its set
export const TIERS = [{ lv: 1, set: "Starter" }, { lv: 5, set: "Cold Wallet" }, { lv: 10, set: "Multisig" }, { lv: 15, set: "Vault" }, { lv: 20, set: "Arc" }];
export const BASES = {
  weapon: ["Phishing Hook Blade", "FUD Cleaver", "Rugbreaker", "Audit Saber", "ARCIRCLE Edge"],
  shield: ["Firewall Shield", "Spam Filter", "Multisig Ward", "Cold Bulwark", "Aegis of Arc"],
  armor: ["Hoodie Armor", "Cold Wallet Armor", "Ledger Mail", "Vault Plate", "Genesis Plate"],
  helm: ["Seed Guard Helm", "2FA Visor", "Hardware Helm", "Oracle Crown", "Zenith Helm"],
  ring: ["Multisig Ring", "Gas Ring", "Staker Band", "Burn Signet", "Infinity Ring"],
  boots: ["Gas-Saver Boots", "Bridge Runners", "Sprint Boots", "Flashloan Boots", "Lightspeed Boots"],
  necklace: ["Audit Pendant", "Proof Chain", "Hash Amulet", "Merkle Torc", "Arc Heart"],
};
export const baseId = (slot, tier) => `${slot}-${tier}`;
export const parseBase = (b) => { const m = /^([a-z]+)-([0-4])$/.exec(String(b || "")); return m && SLOTS.includes(m[1]) ? { slot: m[1], tier: +m[2] } : null; };

// tempering a weapon at the workbench with what you gathered (world-life.js): five stages, each 4% more and a
// brighter glow. Materials are game-only (never ARCL); the server keeps tm 0–5 (api/_world.mjs cleanItem).
export const TEMPER_MAX = 5, TEMPER_STEP = 0.04;
export const temperOf = (it) => Math.max(0, Math.min(TEMPER_MAX, Math.floor(Number(it && it.tm) || 0)));
/// what stage n (1–5) costs
export const temperCost = (n) => ({ ore: 4 * n, crystal: 3 * n, wood: 2 * n, scrap: 20 * n });

/// what one piece gives: { atk, def, hp, sp, crit, spd } — from its slot, level, rarity and enhancement
export function itemStats(it) {
  const p = parseBase(it && it.b); if (!p) return {};
  const lv = Math.max(1, it.lv || TIERS[p.tier].lv), k = RARITY[it.r || 0].mult * (1 + (it.p || 0) * 0.08) * (1 + temperOf(it) * TEMPER_STEP), r = (x) => Math.round(x * k);
  switch (p.slot) {
    case "weapon": return { atk: r(4 + lv * 1.5) };
    case "shield": return { def: r(2 + lv * 0.9), hp: r(4 + lv * 1.5) };
    case "armor": return { def: r(3 + lv * 1.1), hp: r(10 + lv * 4) };
    case "helm": return { def: r(1.5 + lv * 0.6), hp: r(6 + lv * 2.5) };
    case "ring": return { atk: r(1 + lv * 0.4), crit: Math.round((2 + lv * 0.15) * k * 10) / 10 };
    case "boots": return { def: r(1 + lv * 0.3), spd: Math.round((3 + lv * 0.25) * k) };
    case "necklace": return { sp: r(10 + lv * 3), crit: Math.round((1 + lv * 0.1) * k * 10) / 10 };
  }
  return {};
}
export const itemName = (it) => { const p = parseBase(it.b); return p ? BASES[p.slot][p.tier] + (it.p ? ` +${it.p}` : "") : "?"; };
export const STAT_NAME = { atk: "Attack", def: "Defense", hp: "Max HP", sp: "Max SP", crit: "Critical", spd: "Speed" };

// the sets: pieces of one tier together
export const SET_BONUS = [[2, { atkPct: 5 }], [4, { defPct: 10, hpPct: 10 }], [7, { allPct: 15 }]];

/// a character's stats: the level, then the gear, then the set bonuses
export function statsOf(level, eq, extra) {
  const s = { atk: 6 + level * 2, def: 2 + level, hp: 100 + (level - 1) * 12, sp: 100 + (level - 1) * 8, crit: 5, spd: 0 };
  const sets = {};
  for (const slot of SLOTS) {
    const it = eq && eq[slot]; if (!it) continue;
    const g = itemStats(it); for (const k in g) s[k] = (s[k] || 0) + g[k];
    const p = parseBase(it.b); if (p) sets[p.tier] = (sets[p.tier] || 0) + 1;
  }
  let atkPct = 0, defPct = 0, hpPct = 0, allPct = 0; const active = [];
  for (const [tier, n] of Object.entries(sets)) for (const [need, b] of SET_BONUS) if (n >= need) { atkPct += b.atkPct || 0; defPct += b.defPct || 0; hpPct += b.hpPct || 0; allPct += b.allPct || 0; active.push({ set: TIERS[tier].set, need }); }
  s.atk = Math.round(s.atk * (1 + (atkPct + allPct) / 100)); s.def = Math.round(s.def * (1 + (defPct + allPct) / 100));
  s.hp = Math.round(s.hp * (1 + (hpPct + allPct) / 100)); s.sp = Math.round(s.sp * (1 + allPct / 100));
  // the title you wear adds a little (TITLE_BONUS)
  if (extra) for (const k of ["atk", "def", "hp", "sp", "crit", "spd"]) if (extra[k]) s[k] += extra[k];
  // small passives on the way to the first skill: level 3 tougher, 5 quicker, 7 sharper
  if (level >= 3) s.hp = Math.round(s.hp * 1.05);
  if (level >= 5) s.spd += 5;
  if (level >= 7) s.crit += 3;
  s.crit = Math.min(60, Math.round(s.crit * 10) / 10); s.spd = Math.min(40, s.spd);
  s.sets = active;
  return s;
}
export const PASSIVES = [{ lv: 3, name: "Tough skin", line: "Max HP +5%" }, { lv: 5, name: "Quick feet", line: "Speed +5%" }, { lv: 7, name: "Sharp eye", line: "Critical +3%" }];
export const skillLevel = (level, unlock) => (level < unlock ? 0 : Math.min(5, 1 + Math.floor((level - unlock) / 5)));

// scammers by level
// levels: the XP from one level to the next grows with the level — 100 at level 1, about 450 at 10, 1,000 at 20,
// 2,800 at 40 and 8,700 at 80 (so about 10 knock-outs of your own level early on, about 35 at level 80).
// Saves from before (100 XP every level, xpv missing) are converted once so nobody's level changes (xpFromOld).
// api/_world-social.mjs keeps the same numbers for the server.
export const XP_VERSION = 2;
// Levels 1–200 keep the curve they always had; past 200 each level costs 150 XP more than the one before (about 46,000
// at 200, 91,000 at 500), a long, steady climb to the cap. Nobody's level changes: below 200 the numbers are the same.
export const LV_MAX = 500, LV_BEND = 200;
const need0 = (lv) => 100 + 30 * (lv - 1) + (lv - 1) * (lv - 1);
const at0 = (lv) => { const n = Math.max(0, Math.floor(lv) - 1); return 100 * n + 15 * n * (n - 1) + ((n - 1) * n * (2 * n - 1)) / 6; };
export const xpNeed = (lv) => (lv < LV_BEND ? need0(lv) : need0(LV_BEND) + 150 * (lv - LV_BEND));
export const xpAt = (lv) => { const L = Math.floor(lv); if (L <= LV_BEND) return at0(L); const m = L - LV_BEND; return at0(LV_BEND) + m * need0(LV_BEND) + 75 * m * (m - 1); };
export const XP_MAX = xpAt(LV_MAX);
export const levelOfXp = (xp) => { const v = Math.max(0, Number(xp) || 0); let lo = 1, hi = LV_MAX; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xpAt(mid) <= v) lo = mid; else hi = mid - 1; } return lo; };
export const xpFromOld = (xp) => { const v = Math.max(0, Math.floor(Number(xp) || 0)), lv = 1 + Math.floor(v / 100); return xpAt(lv) + Math.floor(((v % 100) / 100) * xpNeed(lv)); };
/// where you are inside your level: { lv, into, need }
export const xpProgress = (xp) => { const lv = levelOfXp(xp); return { lv, into: Math.floor(xp - xpAt(lv)), need: xpNeed(lv) }; };
export const mobStats = (lv, rank = "") => {
  const k = rank === "boss" ? 14 : rank === "elite" ? 2.6 : 1;
  return { hp: Math.round((20 + lv * 14) * k), atk: Math.round((8 + lv * 4.5) * (rank === "boss" ? 1.6 : rank === "elite" ? 1.3 : 1)), def: Math.round(lv * 1.2), xp: Math.round((6 + lv * 3) * (rank === "boss" ? 15 : rank === "elite" ? 3 : 1)) };
};
export const hitDamage = (atk, def) => Math.max(1, Math.round(atk - def * 0.5));

// the hunting grounds: where they are on the flat ground (x, z), how big, which levels, which scammers
export const ZONES = [
  { id: "spam", name: "Spam Alley", lv: [1, 5], x: 0, z: 100, r: 24, color: 0x8fd6ff, ground: 0x2c4a3a, fog: 0x9fc8d8, mobs: ["spam", "drop"], boss: { name: "The Spam King", line: "Ten thousand messages, one bad link", model: "EyeDrone", scale: 1.6, y: 2.2, tint: 0xff4d6d } },
  { id: "fields", name: "Airdrop Fields", lv: [5, 10], x: 86, z: 50, r: 26, color: 0xffc861, ground: 0x4a5a2c, fog: 0xe8d8a8, mobs: ["drop", "spam"], skins: { spam: "Wasp" }, boss: { name: "The Free Mint", line: "Nothing is free if it asks for your keys", model: "QuadShell", scale: 1.7, y: 0.9, tint: 0xffc861 } },
  { id: "swamp", name: "Honeypot Swamp", lv: [10, 15], x: 86, z: -50, r: 26, color: 0x7fe05a, ground: 0x24382a, fog: 0x5a7a52, mobs: ["rug", "drop"], skins: { rug: "Frog", drop: "Snake" }, boss: { name: "The Honeypot Queen", line: "Easy to buy, impossible to sell", model: "Trilobite", scale: 1.7, y: 1.0, tint: 0xffa63a, skin: "Wasp", skinH: 3.0 } },
  { id: "canyon", name: "Rug Canyon", lv: [15, 20], x: -48, z: -90, r: 26, color: 0xff7a3c, ground: 0x5a3426, fog: 0xc88a68, mobs: ["rug", "spam"], skins: { rug: "Rat", spam: "Spider" }, boss: { name: "The Rug Titan", line: "Pulls the liquidity and runs", model: "QuadShell", scale: 2.0, y: 1.0, tint: 0xff4d2a, skin: "Skeleton", skinH: 4.6 } },
  { id: "depths", name: "Dark Market Depths", lv: [20, 30], x: -96, z: 62, r: 26, color: 0xb48cff, ground: 0x1a1428, fog: 0x2a1e40, mobs: ["rug", "drop", "spam"], skins: { rug: "Bat", drop: "Slime", spam: "Skeleton" }, boss: { name: "The Rug Dragon", line: "Hoards what it never earned", model: "Trilobite", scale: 2.1, y: 1.2, tint: 0xb48cff, skin: "Dragon", skinH: 4.2 } },
  // the far ring, Lv 30–100: each ten levels its own ground, harder scammers (pow multiplies their HP and attack),
  // elites more often, and its own boss
  { id: "peaks", name: "Ponzi Peaks", lv: [30, 40], x: 46, z: 172, r: 28, color: 0x8fe6ff, ground: 0x7f9cb2, fog: 0xbcd8ea, mobs: ["spam", "drop"], skins: { spam: "Bat", drop: "Slime" }, boss: { name: "The Ponzi Patriarch", line: "Pays the old with the new", model: "QuadShell", scale: 2.0, y: 1.0, tint: 0x8fe6ff, skin: "Skeleton", skinH: 4.8 }, deco: "ice", pow: 1.15, elite: 0.16 },
  { id: "dunes", name: "Exit-Scam Desert", lv: [40, 50], x: 161, z: 75, r: 28, color: 0xffc861, ground: 0x8a6a3a, fog: 0xe8c890, mobs: ["rug", "spam"], skins: { rug: "Snake", spam: "Spider" }, boss: { name: "The Sand Wyrm", line: "Vanishes with the treasury", model: "Trilobite", scale: 2.2, y: 1.2, tint: 0xffc861, skin: "Dragon", skinH: 4.6 }, deco: "dunes", pow: 1.25, elite: 0.18 },
  { id: "reef", name: "Phishing Reef", lv: [50, 60], x: 161, z: -75, r: 28, color: 0x35d8d0, ground: 0x0e3a40, fog: 0x2a7a80, mobs: ["spam", "drop"], skins: { spam: "Wasp", drop: "Frog" }, boss: { name: "The Kraken Phisher", line: "Every arm holds a fake login", model: "Trilobite", scale: 2.3, y: 1.0, tint: 0x35d8d0, skin: "Spider", skinH: 4.4 }, deco: "reef", pow: 1.35, elite: 0.2 },
  { id: "wastes", name: "Bot Farm Wastes", lv: [60, 70], x: 46, z: -172, r: 28, color: 0x9aff3c, ground: 0x2a3a14, fog: 0x6a8a2a, mobs: ["drop", "rug", "spam"], skins: { drop: "Rat", rug: "Spider", spam: "Wasp" }, boss: { name: "The Swarm Mother", line: "A million bots, one fake crowd", model: "EyeDrone", scale: 2.0, y: 2.0, tint: 0x9aff3c, skin: "Wasp", skinH: 3.8 }, deco: "toxic", pow: 1.45, elite: 0.22 },
  { id: "ruins", name: "Fake Exchange Ruins", lv: [70, 80], x: -102, z: -146, r: 28, color: 0xb48cff, ground: 0x2a1e3a, fog: 0x4a3a6a, mobs: ["rug", "drop", "spam"], skins: { rug: "Skeleton", drop: "Slime", spam: "Bat" }, boss: { name: "The Insolvent King", line: "Withdrawals paused, forever", model: "QuadShell", scale: 2.2, y: 1.0, tint: 0xb48cff, skin: "Skeleton", skinH: 5.4 }, deco: "ruins", pow: 1.55, elite: 0.25 },
  { id: "abyss", name: "Bridge Hack Abyss", lv: [80, 90], x: -177, z: -16, r: 28, color: 0xff4d2a, ground: 0x2a0e0a, fog: 0x5a1a10, mobs: ["spam", "rug", "drop"], skins: { spam: "Bat", rug: "Snake", drop: "Skeleton" }, boss: { name: "The Bridge Breaker", line: "Took the bridge and all it carried", model: "Trilobite", scale: 2.4, y: 1.3, tint: 0xff4d2a, skin: "Dragon", skinH: 5.2 }, deco: "lava", pow: 1.7, elite: 0.28 },
  { id: "void", name: "The Last Rug", lv: [90, 100], x: -126, z: 126, r: 28, color: 0xff4dd2, ground: 0x14081e, fog: 0x2a1040, mobs: ["rug", "spam", "drop"], skins: { rug: "Skeleton", spam: "Wasp", drop: "Spider" }, boss: { name: "The Final Rug", line: "The last pull of all", model: "Trilobite", scale: 2.6, y: 1.4, tint: 0xff4dd2, skin: "Dragon", skinH: 6.2 }, deco: "void", pow: 1.9, elite: 0.32 },
];
export const zoneAt = (x, z) => ZONES.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r) || null;
/// a far ground's fishing pond (world-life.js draws it, world-zones-far.js keeps props off it): to the side of the
/// ground, away from its gate
export const pondOf = (zn) => { if (!zn || zn.lv[0] < 30) return null; const a = Math.atan2(zn.z, zn.x) + 1.9, d = zn.r * 0.52; return { x: zn.x + Math.cos(a) * d, z: zn.z + Math.sin(a) * d, r: 2.6 }; };

// the Forge: what it sells for ARCL (the server keeps these prices: api/_world-shop.mjs). Tiers 0–3, and the Arc set
// (tier 4, Legendary) from level 20 for 6,000.
export const FORGE_PRICE = [40, 120, 300, 700, 6000];
// the Masterwork bench: Arc-set Epic or Legendary pieces made at your level band (each ten levels, 20–100), plain or
// already enhanced to +5 or +10. The dearest, a +10 Legendary at level 100, is 105,000 ARCL.
export const mwBand = (level) => Math.max(20, Math.min(100, Math.floor(Number(level) / 10) * 10));
export const mwPrice = (lv, r, p) => Math.round(((r === 4 ? 2000 + 280 * lv : 400 + 60 * lv) * (p === 10 ? 3.5 : p === 5 ? 1.8 : 1)) / 10) * 10;
export const mwId = (slot, r, p) => `mw:${slot}:${r}:${p}`;
export const FORGE_SUPPLY = { "hp5": { name: "5 health potions", arcl: 30, kind: "hp", n: 5 }, "sp5": { name: "5 mana potions", arcl: 30, kind: "sp", n: 5 }, "recall3": { name: "3 recall scrolls", arcl: 20, kind: "recall", n: 3 },
  "hp20": { name: "20 health potions", arcl: 100, kind: "hp", n: 20 }, "sp20": { name: "20 mana potions", arcl: 100, kind: "sp", n: 20 }, "recall10": { name: "10 recall scrolls", arcl: 60, kind: "recall", n: 10 },
  "scrap100": { name: "100 scrap", arcl: 150, kind: "scrap", n: 100 }, "scrap500": { name: "500 scrap", arcl: 650, kind: "scrap", n: 500 } };
export const forgeId = (slot, tier) => `${slot}:${tier}`;
// selling back to the Forge (the server keeps the same numbers: api/_world-shop.mjs SELL_PRICE, 1,500 a day), and the
// day's ARCL limit everything shares (DAILY_CAP there)
export const SELL_PRICE = [6, 18, 45, 110, 260], SELL_DAY_CAP = 1500, ARCL_DAY_CAP = 30000;
export const sellPrice = (it) => Math.round(SELL_PRICE[Math.max(0, Math.min(4, Math.floor(Number(it && it.r) || 0)))] * (1 + 0.05 * Math.max(0, Math.min(10, Math.floor(Number(it && it.p) || 0)))));

// titles: each achievement's title adds a small bonus while you wear it (world-quests.js; "season" from the season log)
export const TITLE_BONUS = {
  k10: { atk: 2 }, k100: { atk: 5 }, k1000: { atk: 10 }, e25: { crit: 2 }, b1: { hp: 30 }, b10: { hp: 80 }, leg: { crit: 3 },
  zones: { spd: 4 }, plus10: { def: 6 }, lv20: { atk: 4, def: 4 }, raid1: { def: 8 }, quiz: { sp: 30 }, season: { atk: 3, def: 3 },
  gpeaks: { hp: 60 }, gdunes: { spd: 5 }, greef: { sp: 50 }, gwastes: { atk: 6 }, gruins: { def: 10 }, gabyss: { crit: 4 }, gvoid: { atk: 8, def: 8 },
};
export const bonusLine = (b) => Object.entries(b || {}).map(([k, v]) => `${STAT_NAME[k]} +${v}${k === "crit" || k === "spd" ? "%" : ""}`).join(", ");

// the four skills (world-combat.js SKILLS has their numbers): when each is learned
export const SKILL_INFO = [{ id: "ice", name: "Ice Ball", lv: 10 }, { id: "fire", name: "Fire Ball", lv: 20 }, { id: "shock", name: "Shock", lv: 40 }, { id: "meteor", name: "Meteor", lv: 80 }];
// skill branches: at skill level 2 each skill picks one of two ways to grow (saved in P.rpg.x.br)
export const BRANCH_AT = 2;
export const BRANCHES = {
  ice: [{ id: "a", name: "Deep Freeze", line: "Slows for 5 seconds and freezes for a moment" }, { id: "b", name: "Shatter", line: "30% more damage" }],
  fire: [{ id: "a", name: "Wildfire", line: "A wider blast that hits the crowd harder" }, { id: "b", name: "Inferno", line: "Burns twice as hard, for longer" }],
  shock: [{ id: "a", name: "Long Chain", line: "Jumps to two more scammers" }, { id: "b", name: "Overload", line: "Stuns twice as long, 20% more damage" }],
  meteor: [{ id: "a", name: "Twin Star", line: "A second meteor follows the first" }, { id: "b", name: "Crater", line: "A crater half again as wide" }],
};

// gear fusion at the Forge: three pieces of one rarity (Common or Uncommon) make one of the next rarity
export const FUSE_MAX_R = 1;
/// the piece three make: one of their slots, the highest tier and level among them, one rarity up
export const FUSE_PICK_SCRAP = 30;
export function fuseResult(items, pickSlot = Math.random(), want = "") {
  if (!Array.isArray(items) || items.length !== 3) return null;
  const r = items[0].r || 0; if (r > FUSE_MAX_R || items.some((x) => (x.r || 0) !== r)) return null;
  const ps = items.map((x) => parseBase(x.b)); if (ps.some((p) => !p)) return null;
  const slot = want && ps.some((p) => p.slot === want) ? want : ps[Math.min(2, Math.floor(pickSlot * 3))].slot, tier = Math.max(...ps.map((p) => p.tier)), lv = Math.max(...items.map((x) => x.lv || 1));
  return { b: baseId(slot, tier), r: r + 1, lv, p: 0 };
}

// this week's XP events (Seoul time): one hunting ground a weekday, everywhere at the weekend — XP only
export const WEEKDAY_ZONE = [null, "spam", "fields", "swamp", "canyon", "depths", null];
// …and one of the far ring each weekday too (the last two only at the weekend, when every ground has it)
export const WEEKDAY_FAR = [null, "peaks", "dunes", "reef", "wastes", "ruins", null];
export const XP_EVENT = 1.5;
export function xpEvent(t = Date.now()) {
  const d = new Date(t + 9 * 3600e3).getUTCDay();
  return d === 0 || d === 6 ? { all: true, k: XP_EVENT, zone: null, far: null } : { all: false, k: XP_EVENT, zone: WEEKDAY_ZONE[d], far: WEEKDAY_FAR[d] };
}
export const xpBoost = (zoneId, t = Date.now()) => { const e = xpEvent(t); return e.all || (zoneId && (zoneId === e.zone || zoneId === e.far)) ? e.k : 1; };
/// the weekend's golden rush: golden scammers turn up three times as often (only the chance: they still run)
export const goldenRush = (t = Date.now()) => (xpEvent(t).all ? 3 : 1);

// companions: one comes with each of three achievements; they grow with the scammers knocked out beside them
export const PETS = [
  { id: "drone", name: "Drone", need: "k10", line: "Zaps the nearest scammer every few seconds" },
  { id: "cat", name: "Cat", need: "b1", line: "Pulls street items to you from farther away" },
  { id: "wisp", name: "Arc Wisp", need: "zones", line: "Mends a little of your HP every few seconds" },
];
export const petLevel = (xp) => Math.min(10, 1 + Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 15)));
export const petNext = (lv) => (lv >= 10 ? null : lv * lv * 15);
