// world-api.test.mjs — the World API (world-api) against an in-memory store. Run: node tests/world/world-api.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage, cleanSave } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.get(p) || null])),
  setDoc: async (p, d) => { db.set(p, d); },
  commit: async (ws) => { for (const w of ws) { if (w.create) { if (db.has(w.create)) return { ok: false, conflict: true }; db.set(w.create, w.data); } else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Math.floor(Date.now() / 600000) * 600000 + 30000; // 30 s into a 10-minute block: the 2-minute online window can't roll over mid-test (it did under load)
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && new Date(t).toISOString() === iso && T - t <= max; };
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, launchRecord: async (c) => (c === "0x" + "c".repeat(40) ? { creator: w.address.toLowerCase() } : null) });
let r = await W.handle({ action: "world-ping", id: "abcdefabcdef12" });
check(r.status === 200 && r.body.visitors === 1 && r.body.online === 1, "first ping: 1 visitor, 1 online");
r = await W.handle({ action: "world-ping", id: "abcdefabcdef12" });
check(r.body.visitors === 1 && r.body.online === 1, "same visitor again: still 1 / 1");
r = await W.handle({ action: "world-ping", id: "zzzzzzzzzzzz99" });
check(r.body.visitors === 2 && r.body.online === 2, "second visitor: 2 / 2");
T += 125e3; r = await W.handle({ action: "world-ping", id: "abcdefabcdef12" });
check(r.body.online === 2 && r.body.visitors === 2, "next window: online keeps the last window's count");
const w = ethers.Wallet.createRandom(); // hardhat test key #0 (public)
const issued = new Date(T).toISOString(), sig = await w.signMessage(loginMessage(w.address, issued));
r = await W.handle({ action: "world-login", wallet: w.address, issued, signature: sig });
check(r.status === 200 && r.body.firstTime && r.body.save === null, "first sign-in: counted, no save yet");
r = await W.handle({ action: "world-login", wallet: w.address, issued, signature: sig });
check(r.status === 200 && !r.body.firstTime, "second sign-in: not counted again");
check((await W.stats()).players === 1, "1 player");
r = await W.handle({ action: "world-login", wallet: "0x" + "1".repeat(40), issued, signature: sig });
check(r.status === 403, "someone else's signature: refused");
r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: 120, xpv: 2, name: "kmp<script>", char: "female-b", visited: ["launch", "BAD ID!"], cards: ["c1", "x"], quests: ["launchpad"] } });
check(r.status === 200, "save ok");
const sv = db.get("worldSave/" + w.address.toLowerCase());
check(sv.xp === 120 && sv.name === "kmpscript" && sv.char === "female-b" && sv.visited.join() === "launch" && sv.cards.join() === "c1", "save cleaned: " + JSON.stringify({ name: sv.name, visited: sv.visited, cards: sv.cards }));
r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: 130 } });
check(r.status === 429, "saving again within 8 s: refused");
// XP climbs at a bounded pace (api/_world-social.mjs XP_RULES): a bank that refills with time, a day's limit
{ const SRV = await import("../../api/_world-social.mjs"), me = w.address.toLowerCase(), sv = () => db.get("worldSave/" + me);
  check(sv().xb === SRV.XP_RULES.burst, "a first save starts with a small XP allowance");
  T += 10e3; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: 999999, xpv: 2 } });
  const allow = SRV.XP_RULES.burst + Math.floor(SRV.xpPerMin(SRV.levelOfXp(120)) / 6);
  check(sv().xp === 120 + allow && sv().xb === 0, "a jump is cut to the allowance (" + sv().xp + ")");
  check((db.get("worldXpFlag/" + me) || {}).n === 1 && db.get("worldXpFlag/" + me).cut === 999999 - 120 - allow, "and the cut is noted for the team");
  const x1 = sv().xp;
  T += 9e3; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: x1, xpv: 2 } });
  T += 9e3; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: x1 + 999999, xpv: 2 } });
  const pace = SRV.xpPerMin(SRV.levelOfXp(x1));
  check(sv().xp - x1 <= Math.ceil(pace * 18 / 60) + 1, "a save that adds nothing doesn't top the allowance up (+" + (sv().xp - x1) + " in 18 s)");
  T += 3 * 3600e3; const x2 = sv().xp; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: x2 + 9e6, xpv: 2 } });
  check(sv().xp - x2 === SRV.xpBankCap(SRV.levelOfXp(x2)), "hours away: the allowance holds at most 30 minutes of play");
  db.set(`worldXpDay/${me}_${new Date(T + 9 * 3600e3).toISOString().slice(0, 10)}`, { n: SRV.xpPerMin(SRV.levelOfXp(sv().xp)) * SRV.XP_RULES.dayMin });
  T += 600e3; const x3 = sv().xp; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: x3 + 5000, xpv: 2 } });
  check(sv().xp === x3, "a day's XP limit reached: nothing more today");
  T += 9e3; const hi = sv().xp; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: 50, xpv: 2 } });
  check(r.status === 409 && r.body.behind && r.body.save && r.body.save.xp === hi && sv().xp === hi, "a save behind the stored one (an older device): refused, and the newer progress is sent back");
  T += 9e3; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: 50, xpv: 2 }, reset: true });
  check(r.status === 200 && sv().xp === 50, "starting over (reset): less XP is taken");
  const w2 = ethers.Wallet.createRandom(), sig2 = await w2.signMessage(loginMessage(w2.address, issued));
  r = await W.handle({ action: "world-save", wallet: w2.address, issued, signature: sig2, data: { xp: 5e6, xpv: 2 } });
  check(db.get("worldSave/" + w2.address.toLowerCase()).xp === SRV.xpAt(SRV.XP_RULES.firstLv), "a first save brings at most level 30, not level 200"); }
T += 25 * 3600e3; r = await W.handle({ action: "world-save", wallet: w.address, issued, signature: sig, data: { xp: 1 } });
check(r.status === 400, "a day-old signature: sign in again");
r = await W.handle({ action: "world-ping", id: "BAD" }); check(r.status === 400, "bad visitor id refused");
// ---- islands ----
const { checkBuild } = await import("../../api/_world.mjs");
const build = (N, bricks) => Buffer.from([1, N, ...bricks.flat()]).toString("base64");
const isle = build(36, [[1, 0, 1, 0, 5 << 2], [2, 0, 1, 11, 0]]);
check(checkBuild(isle, 36, 6000) && checkBuild(isle, 36, 6000).n === 2, "a 2-brick island checks out");
check(!checkBuild(build(36, [[40, 0, 1, 0, 0]]), 36, 6000), "a brick off the grid: refused");
check(!checkBuild(build(9, [[1, 0, 1, 0, 0]]), 36, 6000), "a lot posing as an island: refused");
check(!checkBuild("not base64!", 36, 6000), "garbage: refused");
T += 1000; const iss2 = new Date(T).toISOString(), sig2 = await w.signMessage(loginMessage(w.address, iss2));
const me = { wallet: w.address, issued: iss2, signature: sig2 };
r = await W.handle({ action: "world-island-save", ...me, data: isle, name: "kmp<b>", n: 2, res: 0 });
check(r.status === 200 && r.body.n === 2, "island saved");
const u = new URL("http://x/api/social?world=island&wallet=" + w.address);
r = await W.read(u); check(r.body.data === isle && r.body.name === "kmpb" && r.body.likes === 0, "island read back, name cleaned");
r = await W.read(new URL("http://x/api/social?world=islands")); check(r.body.recent.length === 1 && r.body.recent[0].n === 2, "recent list has it");
r = await W.handle({ action: "world-like", ...me, target: w.address }); check(r.status === 400, "liking your own island: refused");
const w2 = ethers.Wallet.createRandom(); // hardhat test key #1 (public)
const sig3 = await w2.signMessage(loginMessage(w2.address, iss2)), them = { wallet: w2.address, issued: iss2, signature: sig3 };
r = await W.handle({ action: "world-like", ...them, target: w.address }); check(r.status === 200 && r.body.likes === 1, "a like from someone else: 1");
r = await W.handle({ action: "world-like", ...them, target: w.address }); check(r.status === 409, "liking twice: refused");
r = await W.read(new URL("http://x/api/social?world=islands")); check(r.body.top[0].likes === 1, "popular list has it");
r = await W.handle({ action: "world-stamp", ...them, target: w.address, k: 2 }); check(r.status === 200 && r.body.stamps.length === 1 && r.body.stamps[0].k === 2, "stamp left");
r = await W.handle({ action: "world-stamp", ...them, target: w.address, k: 1 }); check(r.status === 429, "second stamp the same day: refused");
r = await W.handle({ action: "world-stamp", ...them, target: w.address, k: 9 }); check(r.status === 400, "unknown stamp: refused");
const lot = build(9, [[4, 0, 4, 0, 0]]), coin = "0x" + "c".repeat(40);
r = await W.handle({ action: "world-lot-save", ...them, coin, data: lot }); check(r.status === 403, "someone else's coin lot: refused");
r = await W.handle({ action: "world-lot-save", ...me, coin, data: lot }); check(r.status === 200, "the creator saves the lot");
r = await W.handle({ action: "world-lot-save", ...me, coin: "0x" + "d".repeat(40), data: lot }); check(r.status === 404, "not an ArcPad coin: refused");
r = await W.read(new URL("http://x/api/social?world=lots&coins=" + coin + ",0x" + "e".repeat(40))); check(r.body.lots[coin].data === lot && Object.keys(r.body.lots).length === 1, "lots read back");
const off = make({ ...store, recover: recoverSigner, issuedOk, json, storeEnabled: () => false });
r = await off.read(u); check(r.body.enabled === false, "storage off: islands say so");
// the beta gate: 1,000,000 $ARCIRCLE on Arc
{
  let bal = 999999n * 10n ** 18n; const G = make({ ...store, storeEnabled: () => false, recover: recoverSigner, issuedOk, json, now: () => T, tokenBalance: async (t, o) => { if (t !== "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7") throw new Error("wrong token"); return bal; } });
  const iss = new Date(T).toISOString(), sg = await w.signMessage(loginMessage(w.address, iss));
  let g = await G.handle({ action: "world-gate", wallet: w.address, issued: iss, signature: sg });
  check(g.status === 200 && g.body.ok === false && g.body.balance === 999999 && g.body.need === 1000000, "gate: 999,999 isn't enough " + JSON.stringify(g.body));
  bal = 1000000n * 10n ** 18n; g = await G.handle({ action: "world-gate", wallet: w.address, issued: iss, signature: sg });
  check(g.body.ok === true, "gate: 1,000,000 opens it");
  g = await G.handle({ action: "world-gate", wallet: "0x" + "b".repeat(40), issued: iss, signature: sg });
  check(g.status === 403, "gate: someone else's signature doesn't count");
  // the purse's fallback: a wallet's $ARCIRCLE read by the server (works with storage off too)
  let h = await G.read(new URL("http://x/?world=holding&wallet=" + w.address));
  check(h.status === 200 && h.body.arc === (1000000n * 10n ** 18n).toString(), "holding: the server reads the balance " + JSON.stringify(h.body).slice(0, 80));
  h = await G.read(new URL("http://x/?world=holding&wallet=nope")); check(h.status === 400, "holding: not an address");
}
// the signed-in count: a wallet that signed in before the count existed is counted once when it signs in again
{ const w3 = ethers.Wallet.createRandom(), a3 = w3.address.toLowerCase(); db.set(`worldPlayers/${a3}`, { at: 1 }); const before = (await W.stats()).players; const iss = new Date(T).toISOString(); const sg = await w3.signMessage(loginMessage(a3, iss));
  await W.handle({ action: "world-login", wallet: a3, issued: iss, signature: sg }); await W.handle({ action: "world-login", wallet: a3, issued: iss, signature: sg });
  check((await W.stats()).players === before + 1, "an earlier wallet is counted once on its next sign-in"); }
// the level curve: an old save (no xpv) is converted on save, keeping its level; XP can still only climb so fast
check(cleanSave({ xp: 2450 }).xpv === 2 && cleanSave({ xp: 2450 }).xp === 15004 + Math.floor(0.5 * 1396), "an old 2,450 XP save becomes level 25 on the new curve");
// characters: the ARC Bots are kept, anything else unknown is dropped
check(cleanSave({ char: "arc-luna", xp: 10 }).char === "arc-luna" && cleanSave({ char: "arc-nobody" }).char === "" && cleanSave({ char: "male-c" }).char === "male-c", "saves keep ARC Bot characters and drop unknown ones");
check(cleanSave({ char: "kk-knight" }).char === "kk-knight" && cleanSave({ char: "kk-rogue-hooded" }).char === "kk-rogue-hooded" && cleanSave({ char: "kk-dragon" }).char === "", "saves keep the KayKit adventurers and drop unknown ones");
{ const o = cleanSave({ xpv: 2, outfit: { wear: { head: "halo", back: "<b>", aura: "rings", hat: "x" }, accent: "FFC861" } }).outfit;
  check(o && o.wear.head === "halo" && o.wear.aura === "rings" && !o.wear.back && !o.wear.hat && o.accent === "ffc861", "the wardrobe outfit is kept, cleaned " + JSON.stringify(o)); }
{ const r = cleanSave({ xpv: 2, rpg: { eq: { weapon: { id: "w0001", b: "weapon-2", r: 1, lv: 9, k: 3, lk: 1 }, shield: { id: "s0001", b: "shield-1", r: 0, lv: 3, k: 2 } }, bag: [{ id: "w0002", b: "weapon-0", r: 0, lv: 1, k: 9 }] } }).rpg;
  check(r.eq.weapon.k === 3 && r.eq.weapon.lk === 1 && !("k" in r.eq.shield) && !("k" in r.bag[0]), "a weapon keeps its kind and lock; bad kinds and kinds on other gear are dropped"); }
{ const r = cleanSave({ xpv: 2, rpg: { eq: { weapon: { id: "w0001", b: "weapon-2", r: 1, lv: 9, tm: 3 }, shield: { id: "s0001", b: "shield-1", r: 0, lv: 3, tm: 2 } }, bag: [{ id: "w0002", b: "weapon-0", r: 0, lv: 1, tm: 9 }] } }).rpg;
  check(r.eq.weapon.tm === 3 && !("tm" in r.eq.shield) && !("tm" in r.bag[0]), "a weapon keeps its temper stage (1–5); bad stages and stages on other gear are dropped"); }
// anonymous health counters (world-diag.js)
{
  let r = await W.handle({ action: "world-diag", kind: "fps", b: 2, dev: "phone", q: "auto" }); check(r.status === 200, "an fps band is counted");
  r = await W.handle({ action: "world-diag", kind: "err", msg: "TypeError: x is undefined", src: "/world-play.js:12", gpu: "Adreno 640", dev: "phone" }); check(r.status === 200, "an error is counted");
  await W.handle({ action: "world-diag", kind: "err", msg: "TypeError: x is undefined", src: "/world-play.js:12", gpu: "Adreno 640", dev: "phone" });
  r = await W.read(new URL("http://x/?world=diag")); const e = r.body.errors[0];
  check(r.status === 200 && e && e.n === 2 && e.gpu === "Adreno 640" && r.body.days[0].n.fps_ph_auto_2 === 1, "the view shows the counts and the message: " + JSON.stringify(e));
  r = await W.handle({ action: "world-diag", kind: "wallet" }); check(r.status === 400, "nothing else is taken");
  // b-svx: a SURVIVORS ARENA run's end: how and when, hero, weapons, evolutions, what knocked it out (bad ids dropped)
  r = await W.handle({ action: "world-diag", kind: "survrun", dev: "phone", how: "dead", min: 4, hero: "aron", w: ["blaster", "orb", "<x>"], evo: ["star"], by: "golem" }); check(r.status === 200, "a Survivors run's end is counted");
  r = await W.read(new URL("http://x/?world=diag")); { const sv = r.body.surv || {}; check(sv.svend && sv.svend.dead_4 === 1 && sv.svw.blaster_dead === 1 && sv.svw.orb_dead === 1 && Object.keys(sv.svw).length === 2 && sv.svevo.star === 1 && sv.svby.golem === 1 && sv.svhero.aron_dead === 1, "the view sums Survivors runs: " + JSON.stringify(sv)); }
  // hitches (b441): place, cause and length; anything else in the batch is dropped
  r = await W.handle({ action: "world-diag", kind: "hitch", dev: "phone", q: "auto", h: { def_shader_1: 3, hub_other_0: 2, "x;drop_shader_1": 5, hub_bogus_0: 1 }, s: { "physical-toon": 2, "bad key!": 9 } }); check(r.status === 200, "a hitch batch is taken");
  r = await W.read(new URL("http://x/?world=diag")); { const hs = r.body.hitches || [], top = hs[0], all = JSON.stringify(hs);
    check(top && top.where === "def" && top.cause === "shader" && top.ms === "200-500" && top.n === 3 && hs.length === 2 && !/drop|bogus/.test(all), "hitches by place and cause, most first: " + all); }
  { const sh = r.body.shaders || []; check(sh.length === 1 && sh[0].kind === "physical-toon" && sh[0].n === 2 && sh[0].dev === "ph", "the shader kinds behind the hitches: " + JSON.stringify(sh)); }
  // b447: layout / js / resume causes, and which script ran long
  r = await W.handle({ action: "world-diag", kind: "hitch", dev: "phone", q: "auto", h: { hub_layout_2: 1, hub_js_1: 1, hub_resume_0: 1, hub_stall_2: 1, hub_busy_0: 1 }, j: { "wplay-eventlis": 4, "bad key!": 2 } }); check(r.status === 200, "a hitch batch with the new causes is taken");
  r = await W.read(new URL("http://x/?world=diag")); { const all = JSON.stringify(r.body.hitches || []), js = r.body.scripts || [];
    check(/"cause":"layout"/.test(all) && /"cause":"js"/.test(all) && /"cause":"resume"/.test(all) && /"cause":"stall"/.test(all) && /"cause":"busy"/.test(all), "layout, js and resume hitches are kept: " + all);
    check(js.length === 1 && js[0].what === "wplay-eventlis" && js[0].n === 4 && js[0].dev === "ph", "the scripts behind the hitches: " + JSON.stringify(js)); }
  // frame-rate bands by chip class (b404): three phones on Adreno 6xx, two typical 55+, one 30-40; the slowest 10% lower
  for (const [p50, p10] of [[7, 4], [7, 3], [4, 1]]) await W.handle({ action: "world-diag", kind: "frames", dev: "phone", q: "auto", tier: "h", fam: "adreno6", cap: 60, dpr: 1.5, p50, p10 });
  r = await W.handle({ action: "world-diag", kind: "frames", dev: "phone", q: "auto", tier: "x; drop", fam: "../../etc", cap: 999, dpr: 99, p50: 99, p10: -5 }); check(r.status === 200, "odd values are clamped, not stored as given");
  r = await W.read(new URL("http://x/?world=diag")); const ty = r.body.frames.find((f) => f.kind === "typical" && f.who === "ph_auto_h"), fm = r.body.frames.find((f) => f.kind === "family" && f.who === "ph_adreno6");
  const keys = Object.keys(r.body.days[0].n).join(" ");
  check(ty && ty.n === 3 && ty.median === "55+" && fm && fm.n === 3 && !/etc|drop|999/.test(keys) && r.body.days[0].n.cap_ph_60 === 4 && r.body.days[0].n.dpr_ph_1p5 === 3, "frames: per class and family, with the median band: " + JSON.stringify(ty) + " " + keys.slice(0, 200));
}
{ const r = cleanSave({ xpv: 2, rpg: { eq: {}, bag: [], store: Array.from({ length: 60 }, (_, i) => ({ id: "st" + String(i).padStart(4, "0"), b: "ring-0", r: 0, lv: 1, p: 0 })).concat([{ id: "bad", b: "x" }]) } }).rpg;
  check(r.store.length === 48 && r.store[0].b === "ring-0", "storage keeps 48 clean pieces"); }
// changing the character or name later takes a Character change; a weapon's kind, a Weapon kind change
{ const v = ethers.Wallet.createRandom(), a = v.address.toLowerCase(); T += 60000; const iss = new Date(T).toISOString(), sg = await v.signMessage(loginMessage(v.address, iss)), M = { wallet: v.address, issued: iss, signature: sg };
  const wpn = (k) => ({ eq: { weapon: { id: "wpn001", b: "weapon-1", r: 1, lv: 5, p: 0, ...(k == null ? {} : { k }) } }, bag: [], store: [] });
  r = await W.handle({ action: "world-save", ...M, data: { xp: 50, xpv: 2, name: "Aria", char: "kk-knight", rpg: wpn(1) } }); check(r.status === 200 && db.get("worldSave/" + a).char === "kk-knight", "the first pick is free");
  T += 9000; await W.handle({ action: "world-save", ...M, data: { xp: 50, xpv: 2, name: "Bria", char: "kk-mage", rpg: wpn(2) } });
  let sv = db.get("worldSave/" + a); check(sv.char === "kk-knight" && sv.name === "Aria", "a later character or name change without paying: the old ones stay");
  check(sv.rpg.eq.weapon.k === 1, "a weapon's kind changed without paying: it keeps its kind");
  db.set("worldOwn/" + a, { items: [], rechars: 1, rekinds: 1 });
  T += 9000; await W.handle({ action: "world-save", ...M, data: { xp: 50, xpv: 2, name: "Bria", char: "kk-mage", rpg: wpn(2) } });
  sv = db.get("worldSave/" + a); const o = db.get("worldOwn/" + a);
  check(sv.char === "kk-mage" && sv.name === "Bria" && o.recharsUsed === 1, "a paid Character change goes through, and is used up");
  check(sv.rpg.eq.weapon.k === 2 && o.rekindsUsed === 1, "a paid Weapon kind change goes through, and is used up");
  T += 9000; await W.handle({ action: "world-save", ...M, data: { xp: 50, xpv: 2, name: "Cara", char: "kk-rogue", rpg: wpn(3) } });
  sv = db.get("worldSave/" + a); check(sv.char === "kk-mage" && sv.name === "Bria" && sv.rpg.eq.weapon.k === 2, "once used, the next change needs paying again");
  T += 9000; await W.handle({ action: "world-save", ...M, data: { xp: 50, xpv: 2, name: "Bria", char: "kk-mage", rpg: { eq: { weapon: { id: "wpn002", b: "weapon-1", r: 1, lv: 5, p: 0, k: 4 } }, bag: [], store: [] } } });
  check(db.get("worldSave/" + a).rpg.eq.weapon.k === 4, "a new weapon (from the Forge) comes in any kind"); }
// b447: the hero's colour: the first pick is free, a later change is a Character change, and a save without one (an
// older page) keeps it without using anything up
{ const v = ethers.Wallet.createRandom(), a = v.address.toLowerCase(); T += 60000; const iss = new Date(T).toISOString(), sg = await v.signMessage(loginMessage(v.address, iss)), M = { wallet: v.address, issued: iss, signature: sg };
  const sv0 = (d) => W.handle({ action: "world-save", ...M, data: { xp: 50, xpv: 2, name: "Ari", char: "custom-aron", ...d } });
  r = await sv0({}); check(r.status === 200 && db.get("worldSave/" + a).char === "custom-aron", "ARON saves");
  T += 9000; await sv0({ tint: 3 }); check(db.get("worldSave/" + a).tint === 3, "the first colour is free");
  T += 9000; await sv0({}); check(db.get("worldSave/" + a).tint === 3, "a save without a colour keeps it");
  T += 9000; await sv0({ tint: 5 }); check(db.get("worldSave/" + a).tint === 3, "a later colour change without paying: the old one stays");
  db.set("worldOwn/" + a, { items: [], rechars: 1 });
  T += 9000; await sv0({}); check((db.get("worldOwn/" + a).recharsUsed || 0) === 0, "a save without a colour uses nothing up");
  T += 9000; await sv0({ tint: 5 }); check(db.get("worldSave/" + a).tint === 5 && db.get("worldOwn/" + a).recharsUsed === 1, "a paid change sets the new colour");
  T += 9000; await sv0({ tint: 99 }); check(db.get("worldSave/" + a).tint === 5, "a colour out of range is dropped (the old one stays)"); }
console.log(ok, "pass", bad, "fail");
if (bad) process.exit(1); process.exit(bad ? 1 : 0);
