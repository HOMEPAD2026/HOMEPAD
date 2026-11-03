// /arcl — the ARCL launch page (2026-11-03): one launch time for every page, its phases, the page's wiring and its 4 languages
import fs from "node:fs"; import vm from "node:vm";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
const read = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const g = {}; vm.runInNewContext(read("arcl-launch-data.js"), { window: g, globalThis: g });
const A = g.ARC_ARCL;
ok(A && A.launch === Date.parse("2026-11-03T11:00:00Z"), "the launch is Tue 3 Nov 2026, 8:00 PM Korea = 11:00 UTC");
ok(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(A.launch)) === "8:00 PM", "8:00 PM in Seoul on the day");
ok(A.delayMin === 30 && A.delayEnd - A.launch === 30 * 60e3, "the delay window is 30 minutes");
ok(A.phase(A.launch - 1) === "soon" && A.phase(A.launch) === "window" && A.phase(A.delayEnd - 1) === "window" && A.phase(A.delayEnd) === "live", "phases: soon → window (30 min) → live");
ok(A.fee.total === 3 && A.fee.arcl === 1 && A.fee.burn === 1 && A.fee.game === 1, "3% fee: 1% $ARCL + 1% $ARCIRCLE buyback & burn + 1% the game platform");
ok(A.ca === "" || /^0x[0-9a-fA-F]{40}$/.test(A.ca), "the contract is empty until posted, or a real address");
ok(A.x === "https://x.com/ARCIRCLEonArc" && A.tg === "https://t.me/ARCIRCLEonarc", "the official links are the site's own");
// the page and its wiring
const html = read("arcl.html"), js = read("arcl.js"), vc = JSON.parse(read("vercel.json"));
ok((vc.rewrites || vc.routes || []).some((r) => r.source === "/arcl" && r.destination === "/arcl.html"), "vercel serves /arcl");
ok(/arcl-launch-data\.js/.test(html) && /arcl\.js/.test(html) && /arcl\.css/.test(html), "the page loads the launch data, its script and its styles");
const imgs = [...(html + js + read("arcl.css")).matchAll(/\/images\/arcl\/[\w/.-]+\.(?:webp|jpg)/g)].map((m) => m[0]);
const block = (name) => { const m = new RegExp("var " + name + " = \\[([\\s\\S]*?)\\];").exec(js); return m ? m[1] : ""; };
const IC = [...js.matchAll(/IC\("(\w+)"\)/g)].map((m) => m[1]).concat([...block("EARN").matchAll(/\["\w+", "(\w+)", "\w+"\]/g)].map((m) => m[1]), [...block("USE").matchAll(/\["\w+", "(\w+)"\]/g)].map((m) => m[1]), [...js.matchAll(/\["x\d", "(\w+)"/g)].map((m) => m[1]));
const missing = [...new Set(imgs)].filter((p) => !fs.existsSync(new URL("../.." + p, import.meta.url))).concat([...new Set(IC)].filter((n) => !fs.existsSync(new URL(`../../images/arcl/ic/${n}-256.webp`, import.meta.url))).map((n) => "ic/" + n));
ok(missing.length === 0, "every Meshy picture the page names exists (" + (missing.join(", ") || "all there") + ")");
ok(fs.existsSync(new URL("../../models/arcl/coin.glb", import.meta.url)) && fs.statSync(new URL("../../models/arcl/coin.glb", import.meta.url)).size < 1.2e6, "the 3D coin is packed under 1.2 MB");
// 4 languages: every key the English has, the others have too
const win = { ARC_ARCL: A, addEventListener() {}, matchMedia: () => ({ matches: true }), devicePixelRatio: 1, innerWidth: 1200 };
const keysOf = (name) => { const m = new RegExp("var " + name + " = \\{([\\s\\S]*?)\\n  \\};").exec(js); return m ? new Set([...m[1].matchAll(/"([\w.]+)":/g)].map((x) => x[1]).concat([...m[1].matchAll(/^\s+(\w+):/gm)].map((x) => x[1]))) : new Set(); };
const en = new Set([...keysOf("EN"), ...keysOf("E"), ...keysOf("U")]);
for (const L of ["KO", "ZH", "TR"]) { const k = keysOf(L), miss = [...en].filter((x) => !k.has(x) && !["skip"].includes(x) === false ? false : !k.has(x)); ok(miss.length === 0, L.toLowerCase() + " has every English text (" + (miss.slice(0, 6).join(", ") || "all") + ")"); }
ok(!/guarantee(d)? (returns|profit)|will (moon|pump)/i.test(js) && /never guaranteed|not a promise|isn't guaranteed|No\. Rewards are for play/.test(js), "no promised returns; the page says rewards aren't guaranteed");
// /game: the footer links /arcl and counts down from the same constant
const game = read("game.html"), gw = read("gw.js");
ok(/href="\/arcl" data-i="arcl\.more"/.test(game) && /id="gw-arcl-cd"/.test(game) && /arcl-launch-data\.js[^"]*" defer><\/script>\s*<script src="\/gw\.js/.test(game), "/game's ARCL card links /arcl and loads the launch time before gw.js");
ok((gw.match(/"arcl\.cd\.soon": /g) || []).length === 4 && /function arclCd\(\)/.test(gw), "the footer countdown speaks all 4 languages");
ok(/img: "\/images\/arcl\/news-1200\.webp"/.test(gw), "/game's news leads with the ARCL launch");
for (const f of ["arcl.js", "arcl.html", "gw.js", "coins.js", "api/_arcia-world.mjs"]) ok(!/6:00 PM ET|6 PM ET|23:00 UTC|오후 6시|美东 18:00|18:00 ET/.test(read(f)), f + " names the corrected time only (no 6 PM ET / 23:00 UTC left)");
console.log(`${pass} pass ${fail} fail`); if (fail) process.exit(1);
