// world-raidq-data.js — RAID QUEENS' rules the game and the server share (a copy of api/_world-raidq.mjs RQ; tests/world/raidq.test.mjs
// checks the two agree): the three queens' runs and the SECRET dungeon, the day's three runs.
export const RQ = {
  OPEN: true, // open to everyone (the owner, 2026-10-25; it was GM wallets only)
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
  // the first win of each run in a Seoul day: its ARCL × (1 + FIRST.arcl) and one more piece of gear (b4, 2026-10-25)
  FIRST: { arcl: 0.5, items: 1 },
  TOP_N: 20, // each run's week board (the fastest wins, one line a player)
  // RQX1 (2026-10-29, the owner): HARD — a run you've cleared once, again with the queen at ×1.6 HP and ×1.4 damage, more
  // monsters and a clock (limit s); a win pays XP ×1.5, ARCL ×1.6 and one more piece; its own best, clears and week board
  HARD: { xp: 1.5, arcl: 1.6, items: 1, limit: 420, hp: 1.6, atk: 1.4, mobs: 1.3 },
  // CROWN fragments: every win brings a queen's fragments (hard 3, the day's first +1; the Throne and the SECRET one for each
  // of the three); need of them make her crown — a look worn in the raid and in town
  CROWN: { need: 12, win: 1, hard: 3, first: 1, queens: ["lysitha", "solvira", "nyxara"] },
  SECRET: { id: "secret", PRICE: 1000000, lv: 70, bosses: [72, 75, 78], min: 60, xp: 410010, items: [{ r: 4, p: 5 }, { r: 4, p: 4 }, { r: 3, p: 5 }] },
};
export const modeOf = (id) => (id === "secret" ? RQ.SECRET : RQ.MODES.find((m) => m.id === id) || null);
export const phaseOf = (hp, max) => (hp > max * 0.6 ? 1 : hp > max * 0.25 ? 2 : 3);
