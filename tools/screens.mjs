// tools/screens.mjs — the screens to look at before a deploy, taken the same way each time: the plaza, the Game Village,
// the island, the Menu and the Character window, on a phone (390x844, the 980px wp-pcphone page) and on a computer
// (1280x720), as a guest. With BASE=<an older run's folder> it also says how much of each picture changed (needs sharp),
// so a panel that jumped somewhere else shows up before the players see it. Serve the repo first, then:
//   PLAYWRIGHT=/path/to/node_modules/playwright CHROME=/path/to/chrome OUT=/tmp/new BASE=/tmp/old node tools/screens.mjs 8857
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const port = process.argv[2] || "8857", OUT = process.env.OUT || "screens", BASE = process.env.BASE || ""; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errs = [];
for (const dev of ["phone", "desk"]) {
  const p = await b.newPage(dev === "phone" ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await p.addInitScript(() => { try { localStorage.setItem("arc.world.set", JSON.stringify({ quality: "medium" })); Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); } catch {} });
  p.on("pageerror", (e) => errs.push(dev + ": " + e));
  await p.goto(`http://localhost:${port}/play.html`, { timeout: 60000 });
  for (let i = 0; i < 180; i++) { await p.waitForTimeout(1000); const g = await p.$("#wp-auth-guest"); if (g && await g.isVisible()) await g.evaluate((x) => x.click()); const e = await p.$("#wp-enter"); if (e && await e.isVisible()) await e.evaluate((x) => x.click()); if (await p.isVisible("#wp-make-name")) break; }
  if (await p.isVisible("#wp-make-name")) { await p.fill("#wp-make-name", "Tester"); await p.evaluate(() => document.getElementById("wp-make-go").click()); }
  for (let i = 0; i < 40 && await p.evaluate(() => document.body.classList.contains("wp-intro")); i++) await p.waitForTimeout(1000);
  await p.evaluate(() => { window.arcWorld.P.guideSeen = true; }); for (let i = 0; i < 6; i++) { await p.waitForTimeout(700); if (await p.isVisible("#wp-guide-go")) await p.evaluate(() => document.getElementById("wp-guide-go").click()); }
  const shot = async (name) => { const f = `${OUT}/${dev}-${name}.png`; await p.screenshot({ path: f, timeout: 120000 }); return f; };
  const at = async (x, z) => { await p.evaluate(([x, z]) => { const pl = window.arcWorld.planet; pl.position.x = -x; pl.position.z = -z; window.arcWorld.cam({ yaw: 0, pitch: 0.4, dist: 1.2 }); }, [x, z]); await p.waitForTimeout(8000); };
  await at(0, 10); await shot("plaza");
  await p.evaluate(() => document.getElementById("wp-more-btn").click()); await p.waitForTimeout(1500); await shot("menu"); await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  await p.keyboard.press("i"); await p.waitForTimeout(4000); await shot("character"); await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  await at(-105, 12); await shot("village");
  await p.evaluate(() => window.arcWorld.goIsland({})); await p.waitForTimeout(14000); await shot("island");
  await p.close();
}
await b.close();
if (BASE) { let sharp = null; try { sharp = require("sharp"); } catch { console.log("(no sharp: no comparison)"); }
  if (sharp) for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith(".png"))) { const old = `${BASE}/${f}`; if (!fs.existsSync(old)) continue;
    const [a, c] = await Promise.all([sharp(`${OUT}/${f}`).raw().toBuffer({ resolveWithObject: true }), sharp(old).raw().toBuffer({ resolveWithObject: true })]);
    if (a.info.width !== c.info.width || a.info.height !== c.info.height) { console.log(f, "size changed"); continue; }
    let diff = 0; const ch = a.info.channels; for (let i = 0; i < a.data.length; i += ch) if (Math.abs(a.data[i] - c.data[i]) + Math.abs(a.data[i + 1] - c.data[i + 1]) + Math.abs(a.data[i + 2] - c.data[i + 2]) > 60) diff++;
    console.log(f, ((100 * diff) / (a.info.width * a.info.height)).toFixed(1) + "% of pixels changed"); } }
console.log("errors", errs.length, errs.slice(0, 3));
