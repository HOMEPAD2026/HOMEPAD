// tools/world-walk/serve.mjs — a local stand-in for the site, for the browser walk (walk.mjs): the repo's files, and
// /api/social's World calls answered by api/_world.mjs on an in-memory store (the same harness the tests use). A fresh
// random test wallet signs in each run; its session is written to SESS (default: a temp file) for the walk to use.
// Seed routes for tests: /seedsave?lv=6 · /seedsurv?coins · /seeddinos · /seedbuddy?lv&days&name · /seedarcl · /seedmkt?n · /seedjur[?full=1&cloak=0] · /skew?ms · /skewegg
//   node tools/world-walk/serve.mjs            (PORT=8858)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); process.chdir(ROOT);
const PORT = Number(process.env.PORT || 8858);
const { ethers } = await import("ethers");
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const db = new Map(); let SKEW = 0;
const DE = await import("../../api/_world-dino-engine.mjs");
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  queryDocs: async (col, field, value, limit = 500) => [...db.entries()].filter(([k, d]) => k.startsWith(col + "/") && d && d[field] === value).slice(0, limit).map(([k, d]) => ({ id: k.slice(col.length + 1), ...d })),
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, n] of Object.entries(x.fields)) d[k] = (d[k] || 0) + n; db.set(x.inc, d); } else if (x.set) db.set(x.set, x.data); else if (x.del) db.delete(x.del); } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b, cache) => ({ status, body: b, cache });
const W = make({ ...store, recover: recoverSigner, issuedOk: (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && Date.now() - t <= max && Date.now() - t >= -60e3; }, json, now: () => Date.now() + SKEW });
const w = ethers.Wallet.createRandom(), issued = new Date().toISOString();
const sess = { wallet: w.address.toLowerCase(), issued, signature: await w.signMessage(loginMessage(w.address.toLowerCase(), issued)) };
fs.writeFileSync(process.env.SESS || path.join(os.tmpdir(), "world-walk-sess.json"), JSON.stringify(sess));
if (process.env.GM) { const V = await import("../../api/_world-village.mjs"); V.GM_WALLETS.push(sess.wallet); }
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".ktx2": "image/ktx2", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
const log = [];
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (r) => { res.writeHead(r.status, { "content-type": "application/json" }); res.end(JSON.stringify(r.body)); };
  try {
    if (u.pathname === "/skew") { SKEW += Number(u.searchParams.get("ms") || 0); return send({ status: 200, body: { ok: true, skew: SKEW } }); }
    if (u.pathname === "/skewegg") { let t = Date.now() + SKEW; for (let i = 0; i < 4000 && !DE.eggsAt(t).length; i++) t += 60e3; SKEW = t + 30e3 - Date.now(); return send({ status: 200, body: { ok: true, skew: SKEW, eggs: DE.eggsAt(Date.now() + SKEW) } }); }
    if (u.pathname === "/seedsave") { const SO = await import("../../api/_world-social.mjs"); db.set(`worldSave/${sess.wallet}`, { xp: SO.xpAt(Number(u.searchParams.get("lv") || 6)), xpv: SO.XP_VERSION, name: "Ranger", at: Date.now() + SKEW - 60e3 }); return send({ status: 200, body: { ok: true } }); }
    if (u.pathname === "/seeddinos") { const t = Date.now() + SKEW, mk = (id, name, lv, days, rar, sp, pal) => ({ id, name, lv, xp: 0, bond: 60, hatched: t - days * 864e5, hunts: 5, species: sp, genes: { species: sp, pal, eye: "amber", rarity: rar, iv: 0.6, size: 1 } });
      const v = db.get(`worldDino/${sess.wallet}`) || { v: 0 }; v.egg = null; v.buddy = null; v.dinos = [mk("d1", "Blaze", 52, 16, "legend", "raptor", "ember"), mk("d2", "Moss", 30, 8, "advanced", "trike", "moss"), mk("d3", "Pip", 4, 1, "common", "raptor", "sand")]; v.active = "d1"; v.seq = 3; v.v = (v.v || 0) + 50; db.set(`worldDino/${sess.wallet}`, v); return send({ status: 200, body: { ok: true } }); }
    if (u.pathname === "/seedbuddy") { const k = `worldDino/${sess.wallet}`, v = db.get(k) || { v: 0 }; const lv = Number(u.searchParams.get("lv") || 1), days = Number(u.searchParams.get("days") || 0); v.egg = null; v.buddy = { name: u.searchParams.get("name") || "Rexy", lv, xp: 0, bond: 60, hatched: Date.now() + SKEW - days * 864e5, hunts: 12 }; v.v = (v.v || 0) + 50; db.set(k, v); return send({ status: 200, body: { ok: true } }); }
    if (u.pathname === "/seedland") { const n = Number(u.searchParams.get("n") || 3), t = Date.now() + SKEW; db.set(`worldLandOwn/${n}`, { w: sess.wallet, at: t }); db.set(`worldLandBy/${sess.wallet}`, { n, at: t }); db.set(`worldLand/${n}`, { owner: sess.wallet, at: t, tx: "0x" + "3".repeat(64), price: 200000 });
      // a small island to stand on it: a stepped tower of coloured bricks on a 36×36 floor
      const B = []; for (let y = 0; y < 8; y++) for (let x = 10 + y; x < 26 - y; x++) for (let z = 10 + y; z < 26 - y; z++) if (y === 0 || x === 10 + y || x === 25 - y || z === 10 + y || z === 25 - y) B.push([x, y, z, 0, (y % 4) << 2]);
      const bytes = Buffer.alloc(2 + 5 * B.length); bytes[0] = 1; bytes[1] = 36; B.forEach((b, i) => b.forEach((v, k) => { bytes[2 + i * 5 + k] = v; }));
      db.set(`worldIsland/${sess.wallet}`, { data: bytes.toString("base64"), name: "Ranger", n: B.length, at: t, N: 36, theme: "" }); return send({ status: 200, body: { ok: true, bricks: B.length } }); }
    if (u.pathname === "/seedgm") { const t = Date.now() + SKEW, r = (i, n, note) => ({ tx: "0x" + String(i).repeat(64).slice(0, 64), amount: (BigInt(n) * 10n ** 18n).toString(), tokens: n, from: sess.wallet, at: t - i * 864e5, note }); db.set(`worldGmRewards/${sess.wallet}`, { list: [r(1, 50000, "Weekly event winner"), r(2, 10000, "")] }); return send({ status: 200, body: { ok: true } }); }
    if (u.pathname === "/seedsurv") { for (const k of [...db.keys()]) if (k.startsWith("worldSurvUp/")) db.delete(k); db.set(`worldSurvMeta/${sess.wallet}`, { coins: Number(u.searchParams.get("coins") || 500), up: {}, ach: {}, evo: { star: 1 }, bosses: 0, hardClears: 0, cday: "", cn: 0, dday: "" }); return send({ status: 200, body: { ok: true } }); } // (SURVIVORS ARENA arena coins to spend)
    if (u.pathname === "/seedmkt") { const t = Date.now() + SKEW, n = Number(u.searchParams.get("n") || 3), ids = [];
      for (let i = 0; i < n; i++) { const by = new Uint8Array(2 + 24 * 5); by[0] = 1; by[1] = 64; for (let j = 0; j < 24; j++) by.set([j % 6, Math.floor(j / 12), Math.floor(j / 6) % 2, 0, (i + j) % 8 << 2], 2 + j * 5);
        const id = "seed" + i + "x" + t.toString(36), w = "0x" + String(i + 1).repeat(40).slice(0, 40), code = "ARCBP1." + Buffer.from(by).toString("base64");
        db.set(`worldMktItem/${id}`, { id, creator: w, name: ["Builder Kim", "Mira", "Tomo"][i % 3], title: ["Blue cottage", "Watch tower", "Sky garden"][i % 3], code, price: [1500, 4200, 9000][i % 3], bricks: 24, sold: i * 3, at: t - i * 6e4, status: "live" });
        db.set(`worldMktCreator/${w}`, { items: [id] }); ids.push(id); }
      const ix = db.get("worldStats/mktIndex") || {}; db.set("worldStats/mktIndex", { ids: [...ids, ...(ix.ids || [])] }); return send({ status: 200, body: { ok: true, ids } }); }
    if (u.pathname === "/seedarcl") { db.set(`worldArclBal/${sess.wallet}`, { bal: 250000, earned: 250000 }); return send({ status: 200, body: { ok: true } }); }
    if (u.pathname === "/seedjur") { const k = `worldJurInv/${sess.wallet}`, v = db.get(k) || {}; v.mat = { ...(v.mat || {}), wood: 60, stone: 40, flint: 6, fiber: 20, meat: 3, berries: 4, hardwood: 5 }; if (u.searchParams.get("full")) { v.tools = { axe: 2, spear: 1, rod: 1, armor: 1, cloak: Number(u.searchParams.get("cloak") ?? 1) }; v.mat = { ...v.mat, wood: 200, stone: 80, fiber: 60, hide: 20, bone: 12, rope: 4, torch: 3, bola: 3, berries: 20, reed: 10, antidote: 1 }; } db.set(k, v); return send({ status: 200, body: { ok: true } }); }
    if (u.pathname === "/api/social") {
      if (req.method === "POST") { let s = ""; for await (const c of req) s += c; const b = JSON.parse(s || "{}"); const r = await W.handle(b); if (/mine/.test(b.action || "")) log.push(b.action + " " + (r ? r.status : "-") + " " + JSON.stringify(r ? r.body : null).slice(0, 160)); if (r) return send(r); return send({ status: 404, body: { error: "not here" } }); }
      if (u.searchParams.get("world") === "minelog") return send({ status: 200, body: { log, bal: db.get(`worldArclBal/${sess.wallet}`) || null } });
      const r = await W.read(u); if (r) return send(r); return send({ status: 404, body: {} });
    }
    let f = path.join(".", decodeURIComponent(u.pathname)); if (f.endsWith("/")) f += "index.html";
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, () => console.log("serving", PORT, sess.wallet));
