// the 3× EXP WEEK: the window, the "at least ×3" rule, the server and the game share it
import { XPW, xpwOn, xpwK } from "../../world-xpweek-data.js";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
ok(XPW.END - XPW.START === 7 * 864e5, "seven days");
ok(XPW.K === 3, "×3");
ok(!xpwOn(XPW.START - 1) && xpwOn(XPW.START) && xpwOn(XPW.END - 1) && !xpwOn(XPW.END), "the window's edges");
const t = XPW.START + 1000;
ok(xpwK(t, 1) === 3, "no boost → 3");
ok(xpwK(t, 2) === 3, "the weekend's 2× doesn't stack → 3");
ok(xpwK(t, 5) === 5, "the Starter Festival's 5× stays 5");
ok(xpwK(t, 10) === 10, "festival on a weekend stays 10");
ok(xpwK(XPW.END + 1, 2) === 2 && xpwK(XPW.END + 1, 1) === 1, "after the week: as before");
// Lv 1 → 8 with a beginner's run (the calculation in world-xpweek-data.js)
const at0 = (lv) => { const n = Math.max(0, Math.floor(lv) - 1); return 100 * n + 15 * n * (n - 1) + ((n - 1) * n * (2 * n - 1)) / 6; };
const lvOf = (x) => { let l = 1; while (at0(l + 1) <= x) l++; return l; };
ok(lvOf(570) === 4 && lvOf(570 * XPW.K) === 8, "a beginner's run: Lv 4 → Lv 8 this week");
const srv = fs.readFileSync(new URL("../../api/_world.mjs", import.meta.url), "utf8"), play = fs.readFileSync(new URL("../../world-play.js", import.meta.url), "utf8");
ok(/import \{ xpwK \} from "\.\.\/world-xpweek-data\.js"/.test(srv) && /const boostK = xpwK\(now\(\),/.test(srv), "the server's allowance uses it");
ok(/return xpwK\(t, k\)/.test(play) && /n \*= xpMul\(\)/.test(play), "the game's gain() uses it");
ok(/if \(xpwOn\(\)\) return; \/\/ the 3× EXP WEEK/.test(play), "the old What's new card waits during the week");
console.log(`${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
