// userlog.test.mjs — the per-player log (api/_world.mjs userLog / userLogRead, the owner, 2026-10-25): a signed-in player's
// error and load reports kept under their wallet with name, browser and GPU, newest first and capped; "uready" lines for
// the visits that worked; the recent players' index; only a GM reads it, by wallet or by name. Run: node tests/world/userlog.test.mjs
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { GM_WALLETS } = await import("../../api/_world-village.mjs");
const { uaShort } = await import("../../world-diag.js");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) continue; if (x.create) db.set(x.create, x.data); else if (x.inc) { const d = db.get(x.inc) || {}; for (const [k, v] of Object.entries(x.fields)) d[k] = (d[k] || 0) + v; db.set(x.inc, d); } } return { ok: true }; },
  listDocs: async () => [], query: async () => [],
};
const json = (status, b) => ({ status, body: b });
let T = Date.parse("2026-10-25T12:00:00Z");
const W = make({ ...store, storeEnabled: () => true, recover: recoverSigner, issuedOk: () => true, json, now: () => T });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const P = ethers.Wallet.createRandom(), G = ethers.Wallet.createRandom(), X = ethers.Wallet.createRandom(); GM_WALLETS.push(G.address.toLowerCase());
const w = P.address.toLowerCase();
const rep = (b) => W.handle({ action: "world-diag", dev: "pc", ...b });
let r = await rep({ kind: "err", msg: "load slow 15s at 80% Opening the plaza…", src: "load", gpu: "Apple M2", w: P.address, nm: "BANANA", ua: "Mac Chrome 131", v: "b123", q: "auto" });
check(r.status === 200, "an error report is taken");
let d = db.get(`worldDiagUser/${w}`);
check(d && d.name === "BANANA" && d.list.length === 1 && d.list[0].m.startsWith("load slow") && d.list[0].ua === "Mac Chrome 131" && d.list[0].g === "Apple M2" && d.list[0].d === "pc", "kept under the wallet with name, browser, GPU, device");
T += 60e3; await rep({ kind: "uready", sec: 34.4, w: P.address, nm: "BANANA", ua: "Mac Chrome 131" });
d = db.get(`worldDiagUser/${w}`); check(d.list[0].m === "ready in 34s" && d.list.length === 2, "a visit that got in is a line too, newest first");
for (let i = 0; i < 70; i++) { T += 1000; await rep({ kind: "err", msg: "e" + i, w: P.address }); }
d = db.get(`worldDiagUser/${w}`); check(d.list.length === 60 && d.list[0].m === "e69" && d.name === "BANANA", "capped at the last 60, the name kept");
await rep({ kind: "err", msg: "guest error" }); check(![...db.keys()].some((k) => k.startsWith("worldDiagUser/") && !k.endsWith(w)), "a guest's report goes to the day's counts only");
const ix = db.get("worldDiagUsers/recent").m[w]; check(ix && ix.name === "BANANA" && ix.err === 71 && ix.n === 72, "the recent players' index counts reports and errors");
r = await W.handle({ action: "world-diag-user", ...(await sign(X)), q: "banana" }); check(r.status === 403, "a player can't read the logs");
r = await W.handle({ action: "world-diag-user", ...(await sign(G)), q: "bana" }); check(r.status === 200 && r.body.found.length === 1 && r.body.found[0].w === w && r.body.found[0].list.length === 60, "a GM finds a player by part of the name");
r = await W.handle({ action: "world-diag-user", ...(await sign(G)), q: P.address }); check(r.status === 200 && r.body.found[0].name === "BANANA", "… or by wallet");
r = await W.handle({ action: "world-diag-user", ...(await sign(G)) }); check(r.status === 200 && r.body.recent[0].w === w, "and sees the recent players with reports");
check(uaShort("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36") === "Mac Chrome 131", "a Mac's Chrome in a few words");
check(uaShort("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15") === "Mac Safari 17", "… its Safari");
check(uaShort("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36") === "Android Samsung 26", "… and Samsung Internet");
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
