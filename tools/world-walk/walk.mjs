// tools/world-walk/walk.mjs — the browser walk the CLAUDE.md checklist asks for, on a phone (390×844, the 980 px
// wp-pcphone page, touch) and a desktop, signed in at level 6 against serve.mjs (started here):
//   the town loads (the seeded save's reload waited out) · the top bar and the dock · the Menu's nine tiles ·
//   the launch card → Claim → the gift box → coins fly · the Games list → into a game and out, twice ·
//   the invite sheet (a drag down closes it, phones) · a share card · a page opened before a deploy (the share card's
//   chunk gone: the page reloads itself once)
// Each check prints PASS / FAIL; screenshots go to OUT. Exit 1 on any FAIL.
//   node tools/build-world.mjs && node tools/world-walk/walk.mjs
//   env: OUT=dir (default: a temp dir) · DEVS=phone,desk · CHROME=path to Chromium · PW=dir holding node_modules/playwright
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawn } from "node:child_process"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "../..");
const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), "world-walk-")), SESS = path.join(OUT, "sess.json"), PORT = Number(process.env.PORT || 8858), H = `http://localhost:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });
let chromium; try { chromium = createRequire(path.join(process.env.PW || ROOT, "x.js"))("playwright").chromium; } catch { console.error("playwright not found: npm i --no-save playwright, or PW=<dir with node_modules/playwright>"); process.exit(2); }
const CHROME = process.env.CHROME || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => fs.existsSync(p));
let bad = 0; const check = (ok, m) => { console.log(ok ? "PASS" : "FAIL", m); if (!ok) bad++; };

const srv = spawn(process.execPath, [path.join(HERE, "serve.mjs")], { env: { ...process.env, SESS, PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok, no) => { srv.stdout.on("data", (d) => { if (/serving/.test(String(d))) ok(); }); srv.on("exit", () => no(new Error("serve.mjs stopped"))); setTimeout(() => no(new Error("serve.mjs didn't start")), 30000); });
const SJ = fs.readFileSync(SESS, "utf8");
const b = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// what serve.mjs can't answer (no chain, no ArcPad): the $ARCIRCLE balance, the coin list — not the game's failures
const LOCAL_ONLY = /world=holding|\/api\/c\?|[?&]token=/;
const NOISE = /favicon|GPU stall|WebGL|swiftshader|Automatic fallback|THREE\.|web-share|status of 404/i;

async function open(dev, { route } = {}) {
  await fetch(H + "/seedsave?lv=6");
  const p = await b.newPage(dev === "phone" ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  await p.addInitScript((S) => { try { localStorage.setItem("arc.world.set", JSON.stringify({ quality: "medium" })); localStorage.setItem("arc.world.sess", S); if (!localStorage.getItem("arc.world.view")) localStorage.setItem("arc.world.view", "full"); } catch { /* private */ } }, SJ); // (the game itself; a computer opens in the window frame by default, checked at the end)
  if (route) await p.route(route.re, route.fn);
  // page errors and server failures (5xx) fail the walk; a 4xx is the API saying no (a cooldown, a game not open) and is listed only
  const errs = [], refusals = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !NOISE.test(m.text()) && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  p.on("response", (r) => { const u = r.url(); if (!u.startsWith(H)) return; if (r.status() >= 500 && !LOCAL_ONLY.test(u)) errs.push(r.status() + " " + u.replace(H, "")); else if (r.status() >= 400 && /\/api\//.test(u)) refusals.push(r.status() + " " + u.replace(H, "").slice(0, 80) + (r.request().method() === "POST" ? " " + String(r.request().postData() || "").match(/"action":"([^"]+)"/)?.[1] : "")); });
  let loads = 0; p.on("framenavigated", (f) => { if (f === p.mainFrame()) loads++; }); // (navigations, not load events: the game page's load waits on every model)
  await p.goto(H + "/play.html", { timeout: 180000, waitUntil: "commit" });
  const G = async (f, a) => { for (let i = 0; i < 3; i++) { try { return await p.evaluate(f, a); } catch (e) { if (!/context was destroyed|navigation/i.test(String(e))) throw e; await p.waitForTimeout(1500); } } return null; };
  for (let i = 0; i < 180; i++) { await p.waitForTimeout(1000); if (await p.isVisible("#wp-make-name").catch(() => false)) break; if (await G(() => !!(window.arcWorld && window.arcWorld.jurassic) && !document.body.classList.contains("wp-intro"))) break; }
  for (let i = 0; i < 8 && !(await p.isVisible("#wp-make-name").catch(() => false)); i++) await p.waitForTimeout(500); // (a first visit's maker opens after the welcome, 1.5 s in)
  if (await p.isVisible("#wp-make-name").catch(() => false)) { await p.fill("#wp-make-name", "Ranger"); await G(() => document.getElementById("wp-make-go").click()); }
  await p.waitForTimeout(12000); // (the seeded save is newer than this browser's: the game takes it and reloads once)
  for (let i = 0; i < 120 && !(await G(() => !!(window.arcWorld && window.arcWorld.jurassic) && !document.body.classList.contains("wp-intro"))); i++) await p.waitForTimeout(1000);
  await G(() => { window.arcWorld.P.guideSeen = true; });
  const skip = () => G(() => { for (const s of ["#wp-guide-go", ".wp-qs [data-qs=go]", ".wp-tips-go", ".wp-coach-skip", ".wp-st .wp-st-x"]) document.querySelectorAll(s).forEach((c) => c.click()); });
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(800); await skip(); }
  const shot = (n) => p.screenshot({ path: path.join(OUT, `${dev}-${n}.png`), timeout: 120000 });
  const vis = (sel) => G((s) => { const e = document.querySelector(s); return !!(e && e.getClientRects().length && !e.hidden); }, sel);
  return { p, G, shot, vis, errs, refusals, loads: () => loads };
}

for (const dev of (process.env.DEVS ?? "phone,desk").split(",").filter(Boolean)) {
  const { p, G, shot, vis, errs, refusals } = await open(dev);
  await shot("town");
  const top = await G(() => [...document.querySelectorAll(".wp-hud-btns>.wp-btn")].filter((x) => x.getClientRects().length).map((x) => x.id));
  check(top.includes("wp-rew-btn") && !top.includes("wp-gift-btn") && !top.includes("wp-shop-btn"), `${dev}: the top bar folds the rewards into one button (${top.join(" ")})`);
  check((await G(() => [...document.querySelectorAll("#wp-dock .wp-dk")].filter((x) => x.getClientRects().length).map((x) => x.id)))[0] === "wp-dk-games", `${dev}: Games is the dock's first button`);
  await G(() => document.getElementById("wp-more-btn").click()); await p.waitForTimeout(800);
  check((await G(() => document.querySelectorAll(".wp-hub-main [data-hub]").length)) === 9, `${dev}: the Menu's nine big tiles`); await shot("menu");
  await G(() => document.querySelector("[data-hub-x]").click()); await p.waitForTimeout(400);
  // the launch gift
  await G(() => window.arcWorld.launch().open()); await p.waitForTimeout(1500); await shot("launch");
  const take = await G(() => !!document.querySelector(".wp-launch [data-take]"));
  if (take) {
    await G(() => document.querySelector(".wp-launch [data-take]").click());
    for (let i = 0; i < 40 && !(await vis(".wp-gift-open.show")); i++) await p.waitForTimeout(250);
    check(await vis(".wp-gift-open.show"), `${dev}: the gift box opens`); await shot("gift");
    await G(() => document.querySelector(".wp-gift-open .wp-st-buy").click()); await p.waitForTimeout(500);
    check((await G(() => document.querySelectorAll(".wp-coin").length)) > 0, `${dev}: coins fly to the Exchange button`); await p.waitForTimeout(3000);
    await G(() => document.querySelectorAll(".wp-st .wp-st-x").forEach((x) => x.click()));
  } else console.log("note", dev, "the launch gift was already taken (or the launch week is over): skipped");
  // the Games list, into a game and out, twice
  for (let round = 1; round <= 2; round++) {
    await G(() => document.getElementById("wp-dk-games").click()); await p.waitForTimeout(2200);
    check((await G(() => document.querySelectorAll(".wp-games [data-game]").length)) === 8, `${dev} round ${round}: the Games list, 8 games`); if (round === 1) await shot("games");
    await G(() => document.querySelector('[data-game="surv"]').click());
    let on = false; for (let i = 0; i < 60 && !on; i++) { await p.waitForTimeout(1000); on = await G(() => document.body.classList.contains("wp-surv")); }
    check(on, `${dev} round ${round}: into SURVIVORS ARENA`);
    let out = false; for (let i = 0; i < 15 && !out; i++) { await G(() => { const x = document.querySelector('.sv [data-a="leave"]'); if (x) x.click(); }); await p.keyboard.press("Escape"); await p.waitForTimeout(1000); out = await G(() => !document.body.classList.contains("wp-surv")); }
    check(out, `${dev} round ${round}: back in town`);
  }
  // the invite sheet (phones: a drag down closes it)
  await G(() => window.arcWorld.refer().open()); await p.waitForTimeout(2200);
  check(await vis(".wp-refer"), `${dev}: the invite panel`); await shot("invite");
  if (dev === "phone") {
    const r = await G(() => { const c = document.querySelector(".wp-refer .wp-st-card").getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + 16 }; });
    await p.mouse.move(r.x, r.y); await p.mouse.down(); for (let i = 1; i <= 8; i++) { await p.mouse.move(r.x, r.y + i * 30); await p.waitForTimeout(30); } await p.mouse.up(); await p.waitForTimeout(700);
    check(!(await vis(".wp-refer")), "phone: a drag down closes the sheet");
  } else await G(() => document.querySelector(".wp-refer .wp-st-x").click());
  // a share card
  await G(() => window.arcWorld.share({ kind: "surv", tag: "SURVIVORS ARENA", title: "VICTORY", sub: "ARON", emoji: "⚔️", rows: [["Time", "12:00", "⏱️"]] })); await p.waitForTimeout(2500);
  check(await G(() => { const i = document.querySelector(".wp-share-img"); return !!(i && i.naturalWidth === 1200); }), `${dev}: a share card (1200×630)`); await shot("share");
  check(!errs.length, `${dev}: no page errors or server failures${errs.length ? " — " + errs.slice(0, 3).join(" | ") : ""}`);
  if (refusals.length) console.log("note", dev, "API refusals (4xx):", [...new Set(refusals)].slice(0, 8).join(" | "));
  await p.close();
}
// a page opened before a deploy: the share card's chunk is gone (404) → the page reloads itself once
{ const chunk = fs.readdirSync(path.join(ROOT, "w")).find((f) => /^c-.*\.js$/.test(f) && fs.readFileSync(path.join(ROOT, "w", f), "utf8").includes("SHARE YOUR ADVENTURE"));
  if (!chunk) check(false, "stale chunk: the share card's chunk not found in /w/ (build first: node tools/build-world.mjs)");
  else { const { p, G, loads } = await open("desk", { route: { re: new RegExp("/w/" + chunk.replace(".", "\\.")), fn: (r) => r.fulfill({ status: 404, body: "gone" }) } });
    if (process.env.DEBUG) { p.on("console", (m) => console.log("  console:", m.text().slice(0, 160))); p.on("request", (r) => { if (/\/w\/c-/.test(r.url())) console.log("  req", r.url().replace(H, "")); }); }
    const before = loads(); await G(() => { window.arcWorld.share({ kind: "surv", tag: "T", title: "V", rows: [] }); });
    for (let i = 0; i < 20 && loads() === before; i++) { await p.waitForTimeout(1000); if (process.env.DEBUG) console.log("  t", i, loads(), await G(() => [...document.querySelectorAll(".wp-tst")].map((x) => x.textContent).join(" | ").slice(-120) + " share=" + !!document.querySelector(".wp-share"))); }
    check(loads() > before, `stale chunk: the page reloaded itself (loads ${before} → ${loads()})`); await p.close(); } }
await b.close(); srv.kill();
console.log(`\n${bad ? bad + " FAILED" : "all passed"} — screenshots in ${OUT}`); process.exit(bad ? 1 : 0);
