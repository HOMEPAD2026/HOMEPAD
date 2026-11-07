// arcircle.app's front page (index.html + hub.js + hub.css): the hub that leads to every world, and the old
// ARCIRCLE PAD home moved to /platform (platform.html). Run: node tests/world/home.test.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

const html = read("index.html"), js = read("hub.js"), css = read("hub.css"), plat = read("platform.html");
// every world has its door
for (const href of ["/game", "/platform", "/studio", "/arcia", "/galaxy", "/arcl", "/agents", "/coins", "/play"]) ok(html.includes(`href="${href}"`), "link " + href);
// the link card
ok(/og:image" content="https:\/\/www\.arcircle\.app\/images\/hub\/og-card\.jpg"/.test(html), "og:image");
ok(html.includes('name="twitter:card" content="summary_large_image"'), "twitter card");
ok(fs.existsSync(path.join(ROOT, "images/hub/og-card.jpg")), "og-card.jpg exists");
for (const m of html.matchAll(/(?:src|srcset|href|poster|data-src)="(\/images\/[^"? ]+)/g)) ok(fs.existsSync(path.join(ROOT, m[1])), "file " + m[1]);
// the old front door is gone from both pages; the PAD home lives on at /platform
ok(!html.includes("arc-gate.js") && !plat.includes("arc-gate.js"), "no gate overlay");
ok(plat.includes("ARCIRCLE PAD") && plat.includes("home.bundle.js") && plat.includes('href="https://www.arcircle.app/platform"'), "platform.html is the PAD home");
const vj = JSON.parse(read("vercel.json"));
ok(vj.rewrites.some((r) => r.source === "/platform" && r.destination === "/platform.html"), "rewrite /platform");
ok(read("arc-nav.js").includes('href="/platform">\' + svg("home")'), "PAD's Home tab goes to /platform");
ok(read("tools/build-bundles.mjs").includes('"index.min.css": ["platform.html"'), "index.min.css purges against platform.html");
// opening the front page still counts a visit (the gate used to)
ok(/action: "world-ping", id: vid, visit: true, gate: true/.test(js), "visit ping");
ok(read("api/social.mjs").includes('get("arc") === "galaxy-lite"'), "galaxy-lite route");
// every data-k key has a translation in ko / zh / tr
const keys = [...new Set([...html.matchAll(/data-k="([a-zA-Z0-9]+)"/g)].map((m) => m[1]))];
const W = vm.runInNewContext("(" + js.slice(js.indexOf("var W = {") + 8, js.indexOf("var EN = {")).trim().replace(/;\s*$/, "") + ")");
for (const l of ["ko", "zh", "tr"]) { const miss = keys.filter((k) => !W[l][k]); ok(!miss.length, l + " missing " + miss.join(",")); }
ok(keys.length >= 50, "keys " + keys.length);
// layout: phones get one column, the background is never capped by the img max-width reset
ok(/@media \(max-width: 760px\)[\s\S]*\.hb-grid \{ grid-template-columns: 1fr;/.test(css), "phone one column");
ok(/\.hb-bg-art \{[^}]*max-width: none/.test(css), "bg not capped");
console.log(`home: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
