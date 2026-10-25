// world-raidq-data.js — RAID QUEENS' rules the game and the server share (a copy of api/_world-raidq.mjs RQ; tests/world/raidq.test.mjs
// checks the two agree): the three queens' runs and the SECRET dungeon, the day's three runs.
export const RQ = {
  OPEN: false, // false: GM wallets only (the owner, 2026-10-25); true opens it to everyone
  DAY_RUNS: 3, TIME_MAX: 15 * 60, // three runs a Seoul day (the owner's call), a run's clock at most 15 minutes
  MODES: [ // lv: to enter · min: the shortest win the server takes (s) · xpMin: a win's XP in minutes of xpPerMin(your level) · arcl, item: a win's reward
    { id: "lysitha", region: "Silver Sanctum", lv: 100, boss: 100, min: 150, xpMin: 6, arcl: 2000, item: { r: 3, p: 3, n: 1 } },
    { id: "solvira", region: "Golden Dominion", lv: 200, boss: 200, min: 150, xpMin: 8, arcl: 3000, item: { r: 4, p: 3, n: 1 } },
    { id: "nyxara", region: "Crimson Abyss", lv: 300, boss: 300, min: 150, xpMin: 10, arcl: 5000, item: { r: 4, p: 5, n: 1 } },
    // the Throne of Three (the owner, 2026-10-25: 100 / 200 / 300 / 400 / SECRET from the one building): the three queens at once, Lv 400
    { id: "throne", region: "Throne of Three", lv: 400, boss: 400, min: 180, xpMin: 14, arcl: 8000, item: { r: 4, p: 6, n: 2 }, trio: true },
  ],
  // the SECRET dungeon: its price in $ARCIRCLE, its level to enter, its three queens' levels, the shortest win, a win's XP
  // (Lv 120 → 140 in XP, the owner's number: xpAt(140) − xpAt(120)), its gear (better: Epic/Legendary, more +)
  SECRET: { id: "secret", PRICE: 10000, lv: 70, bosses: [72, 75, 78], min: 60, xp: 410010, items: [{ r: 4, p: 5 }, { r: 4, p: 4 }, { r: 3, p: 5 }] },
};
export const modeOf = (id) => (id === "secret" ? RQ.SECRET : RQ.MODES.find((m) => m.id === id) || null);
export const phaseOf = (hp, max) => (hp > max * 0.6 ? 1 : hp > max * 0.25 ? 2 : 3);
