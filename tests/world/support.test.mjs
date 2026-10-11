// support.test.mjs — the World API (support) against an in-memory store. Run: node tests/world/support.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { FEE_BURN, ARCIRCLE, DAILY_CAP } = await import("../../api/_world-shop.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.parse("2026-10-11T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const w = ethers.Wallet.createRandom(), me = w.address.toLowerCase();
const COIN = "0x" + "c".repeat(40);

const admin = ethers.Wallet.createRandom(), adm = admin.address.toLowerCase();
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, launchRecord: async () => null, tokenBalance: async () => 0n, arcPrice: async () => 0.002, receipt: async () => null,
  ownerOf: async (a) => (a === FEE_BURN ? "0x" + "0".repeat(24) + adm.slice(2) : "0x") });
const sign = async (wl) => { const iss = new Date(T).toISOString(); return { wallet: wl.address, issued: iss, signature: await wl.signMessage(loginMessage(wl.address, iss)) }; };
const S = await sign(w), A = await sign(admin);
const other = ethers.Wallet.createRandom(), O = await sign(other);
const tiny = "data:image/png;base64," + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString("base64");
const balOf = async (x) => (await W.read(new URL("http://x/?world=arcl&wallet=" + x))).body.bal;
let r = await W.handle({ action: "world-support-new", ...S, kind: "bug", title: "Shop", body: "short" }); check(r.status === 400, "too short: refused");
r = await W.handle({ action: "world-support-new", ...S, kind: "bug", title: "Wallet help", body: "my key is 0x" + "ab".repeat(32) + " please check" }); check(r.status === 400 && /private key/.test(r.body.error), "a private key in the text: refused");
r = await W.handle({ action: "world-support-new", ...S, kind: "bug", title: "Seed", body: "my recovery phrase: apple banana cherry delta eagle frost grape house igloo jelly kite lemon" }); check(r.status === 400, "a recovery phrase: refused");
r = await W.handle({ action: "world-support-new", ...S, kind: "bug", title: "The shop button does nothing", body: "I tap Buy and nothing happens on my phone.", shot: tiny, where: "game", lang: "ko" });
check(r.status === 200 && r.body.ticket.status === "open" && r.body.ticket.shot && r.body.reward === 100, "bug with a screenshot: open, would earn 100");
const id = r.body.ticket.id;
check((await balOf(me)) === 0, "posting alone pays nothing");
r = await W.handle({ action: "world-support-new", ...S, kind: "idea", title: "Pets on islands", body: "Let us keep a small pet on the island." }); const id2 = r.body.ticket.id; check(r.status === 200 && r.body.reward === 20, "idea without a screenshot: 20");
let L = (await W.read(new URL("http://x/?world=support-list"))).body;
check(L.list.length === 2 && L.list.every((x) => !x.wid && /…/.test(x.w)) && L.counts.open === 2, "the public board: both, short wallets only");
const it = (await W.read(new URL("http://x/?world=support-item&id=" + id))).body.ticket; check(it.body.includes("nothing happens") && !it.wallet, "a report's page: body, no full wallet");
const sh = await W.read(new URL("http://x/?world=support-shot&id=" + id)); check(sh instanceof Response && sh.headers.get("content-type") === "image/png", "the screenshot is served as an image");
r = await W.handle({ action: "world-support-vote", ...S, id }); check(r.status === 400, "no voting on your own");
r = await W.handle({ action: "world-support-vote", ...O, id }); check(r.status === 200 && r.body.votes === 1, "me too: 1");
r = await W.handle({ action: "world-support-vote", ...O, id }); check(r.status === 409, "me too only once");
r = await W.handle({ action: "world-support-review", ...O, id, status: "accepted" }); check(r.status === 403, "a player can't review");
check((await W.read(new URL("http://x/?world=support-admin&wallet=" + adm))).body.admin === true, "the FeeBurn owner is a reviewer");
r = await W.handle({ action: "world-support-review", ...A, id, status: "accepted", reply: "Thanks! Fixed in the next update." }); check(r.status === 200 && r.body.paid === 100, "accepted: 100 ARCL paid (screenshot ×2) " + JSON.stringify(r.body).slice(0, 200));
check((await balOf(me)) === 100, "the reporter's balance: 100");
r = await W.handle({ action: "world-support-review", ...A, id, status: "done" }); check(r.body.paid === 0 && r.body.ticket.reward === 100, "done later: not paid twice");
r = await W.handle({ action: "world-support-review", ...A, id: id2, status: "declined", reply: "Maybe later." }); check(r.body.paid === 0, "declined: nothing");
L = (await W.read(new URL("http://x/?world=support-list&mine=" + me))).body; check(L.list.length === 2 && L.list.find((x) => x.id === id).status === "done", "my reports with their status");
for (let i = 0; i < 3; i++) await W.handle({ action: "world-support-new", ...S, kind: "improve", title: "More " + i, body: "Something to improve " + i });
r = await W.handle({ action: "world-support-new", ...S, kind: "improve", title: "One more", body: "Something else to improve" }); check(r.status === 429, "5 a day");
console.log(ok, "pass", bad, "fail");
if (bad) process.exit(1); process.exit(bad ? 1 : 0);
