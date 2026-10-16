// tools/hud-overlap.mjs — opens /play on a phone layout (390x844, the 980px wp-pcphone page) as a guest and lists every pair
// of HUD controls or panels that overlap by more than 15 % of the smaller one, in the plaza, the Game Village and on the
// island; it also counts the shader programs. Serve the repo first (python3 -m http.server 8857), then:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROME=/path/to/chrome OUT=/tmp node tools/hud-overlap.mjs 8857
// the phone HUD: every visible control and panel, and which pairs overlap (more than 15 % of the smaller one), in the
// plaza, on the island and in the Game Village
import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright"); // PLAYWRIGHT=path/to/node_modules/playwright if it isn't installed here
const port = process.argv[2] || "8857";
const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(`http://localhost:${port}/play.html`, { timeout: 60000 });
for (let i = 0; i < 180; i++) { await p.waitForTimeout(1000); const g = await p.$("#wp-auth-guest"); if (g && await g.isVisible()) await g.evaluate((x) => x.click()); const e = await p.$("#wp-enter"); if (e && await e.isVisible()) await e.evaluate((x) => x.click()); if (await p.isVisible("#wp-make-name")) break; }
if (await p.isVisible("#wp-make-name")) { await p.fill("#wp-make-name", "Tester"); await p.evaluate(() => document.getElementById("wp-make-go").click()); }
for (let i = 0; i < 40 && await p.evaluate(() => document.body.classList.contains("wp-intro")); i++) await p.waitForTimeout(1000);
await p.evaluate(() => { window.arcWorld.P.guideSeen = true; }); for (let i = 0; i < 6; i++) { await p.waitForTimeout(700); if (await p.isVisible("#wp-guide-go")) await p.evaluate(() => document.getElementById("wp-guide-go").click()); }
const audit = (where) => p.evaluate((where) => {
  const Q = ["#wp-quests", "#wp-qmini", ".wp-mini", ".wp-hud-btns>.wp-btn", "#wp-purse", "#wp-wallet", ".wp-online", ".wc-vit", ".wp-lv", ".wp-brand", "#wp-dock", ".wp-joy-ring,#wp-joy", "#wp-acts .wp-act", ".wc-attack", ".wc-pot", ".wc-lockon", ".wc-skill", "#wi>.wi-bar", "#wi>.wi-visitbar", ".wr-raid", ".wp-stage", ".wp-cards", ".wi-tools", ".wi-hot"];
  const els = []; for (const q of Q) document.querySelectorAll(q).forEach((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (r.width < 4 || r.height < 4 || cs.visibility === "hidden" || +cs.opacity === 0 || !e.getClientRects().length) return; if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return; els.push({ n: (e.id ? "#" + e.id : "." + String(e.className).split(" ")[0]), r, e }); });
  const out = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], c = els[j]; if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
    const w = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left), h = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top); if (w <= 0 || h <= 0) continue;
    const k = (w * h) / Math.min(a.r.width * a.r.height, c.r.width * c.r.height); if (k > 0.15) out.push(`${a.n} × ${c.n} ${Math.round(k * 100)}%`); }
  return { where, n: els.length, overlaps: out }; }, where);
console.log(JSON.stringify(await audit("plaza"))); await p.screenshot({ path: "" + (process.env.OUT || ".") + "/ov-plaza.png", timeout: 120000 });
await p.evaluate(() => { const pl = window.arcWorld.planet; pl.position.x = 105; pl.position.z = -9; }); await p.waitForTimeout(8000);
console.log(JSON.stringify(await audit("village"))); await p.screenshot({ path: "" + (process.env.OUT || ".") + "/ov-village.png", timeout: 120000 });
await p.evaluate(() => window.arcWorld.goIsland({})); await p.waitForTimeout(14000);
console.log(JSON.stringify(await audit("island"))); await p.screenshot({ path: "" + (process.env.OUT || ".") + "/ov-island.png", timeout: 120000 });
console.log("programs", JSON.stringify(await p.evaluate(() => { const c = {}; for (const pg of window.arcWorld.stage().renderer.info.programs || []) { const k = String(pg.cacheKey || "").split(",")[0]; c[k] = (c[k] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12); })));
console.log("errors", errs.length, JSON.stringify(errs.slice(0, 3))); await b.close(); process.exit(0);
