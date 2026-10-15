// quests.test.mjs — the island tutorial chain: the quest list (world-play.js) fits what the server keeps, and the two
// once-only ARCL kinds it adds ("vill2", "vquest9") are checked against the saved island. Run: node tests/world/quests.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { EARN } = await import("../../api/_world-shop.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// the client's list
const src = fs.readFileSync(new URL("../../world-play.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("const QUESTS = ["), src.indexOf("const BADGES = ["));
const ids = [...body.matchAll(/\{ id: "([^"]+)", t: /g)].map((m) => m[1]);
const chain = ["build20", "roof4", "doorwin", "light2", "furn3", "shop1", "vill2", "visit-like", "share-isle"];
check(new Set(ids).size === ids.length, "every quest id is unique");
check(ids.every((i) => /^[a-z0-9-]{1,24}$/.test(i)), "every quest id fits the server's pattern");
check(ids.length <= 60, `the quests (${ids.length}) fit the 60 ids the server keeps`);
const at = chain.map((i) => ids.indexOf(i));
check(at.every((x, i) => x >= 0 && (i === 0 || x === at[i - 1] + 1)), "the chain runs in order: " + chain.join(" > "));
check(chain.slice(1).every((i) => new RegExp(`id: "${i}"[^\\n]*gate: tutDone`).test(body)), "every step after build20 waits for Getting started");
check(/!q\.gate \|\| q\.gate\(\)/.test(src), "checkQuests and paintQuests honour the gate");
const cap = fs.readFileSync(new URL("../../api/_world.mjs", import.meta.url), "utf8");
const m = cap.match(/quests: ids\(o\.quests, .+?, (\d+)\), badges/);
check(m && +m[1] >= ids.length, "the server's quest cap holds them all");
check(EARN.some((e) => e.kind === "vill2" && e.n === 50) && EARN.some((e) => e.kind === "vquest9"), "EARN lists vill2 (50) and vquest9");

// the server
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); } } return { ok: true }; },
};
const json = (status, b) => ({ status, body: b });
const T = Date.parse("2026-10-14T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const eggs = [];
const mkW = (extra) => make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, ...extra });
const w = ethers.Wallet.createRandom(), me = w.address.toLowerCase();
const issued = new Date(T).toISOString(), S = { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) };
const claim = (W, kind) => W.handle({ action: "world-arcl-claim", ...S, kind });
let W = mkW({});
let r = await claim(W, "vill2"); check(r.status === 400, "village level 2: refused with no island");
db.set(`worldIsland/${me}`, { n: 5, res: 0, vxp: 99 });
r = await claim(W, "vill2"); check(r.status === 400, "99 village XP: not level 2 yet");
db.set(`worldIsland/${me}`, { n: 5, res: 0, vxp: 100 });
r = await claim(W, "vill2"); check(r.status === 200 && r.body.credited === 50, "100 village XP: level 2 pays 50 ARCL");
r = await claim(W, "vill2"); check(r.status === 409, "village level 2 pays once");
db.delete(`worldIsland/${me}`);
r = await claim(W, "vquest9"); check(r.status === 400, "free egg: needs a saved island");
db.set(`worldIsland/${me}`, { n: 5, res: 0, vxp: 0 });
const pets = () => ((db.get(`worldOwn/${me}`) || {}).pets || {}).list || [];
r = await claim(W, "vquest9"); check(r.status === 200 && r.body.egg === 1 && pets().length === 1, "free egg: granted once (a pet in worldOwn)");
r = await claim(W, "vquest9"); check(r.status === 409 && pets().length === 1, "free egg: not twice");
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
