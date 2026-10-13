// phase.test.mjs — the end of the closed beta and the open beta's fresh start (api/_world-phase.mjs, api/_world.mjs).
// Run: node tests/world/phase.test.mjs (needs ethers 6)
import fs from "node:fs";
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const PHM = await import("../../api/_world-phase.mjs");
const V = await import("../../api/_world-village.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? JSON.parse(JSON.stringify(db.get(p))) : null])),
  setDoc: async (p, d) => { db.set(p, d); },
  commit: async (ws) => { for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; } for (const w of ws) { if (w.create) db.set(w.create, w.data); else if (w.set) db.set(w.set, w.data); else if (w.inc) { const d = db.get(w.inc) || {}; for (const [k, n] of Object.entries(w.fields)) d[k] = (d[k] || 0) + n; db.set(w.inc, d); } } return { ok: true }; },
};
const json = (status, body) => ({ status, body });
let T = Date.now();
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && new Date(t).toISOString() === iso && T - t <= max; };
const mk = (phase) => make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, phase, tokenBalance: async () => 0n });

// ---- paths ----
const S = PHM.scopePath;
check(S("worldSave/0xab", 1) === "worldSave/0xab", "epoch 1: paths as they are");
check(S("worldSave/0xab", 2) === "worldSave_e2/0xab" && S("worldArclBal/0xab", 2) === "worldArclBal_e2/0xab" && S("worldIsland/0xab", 2) === "worldIsland_e2/0xab", "epoch 2: progress, ARCL and islands move to their own collections");
check(S("worldStats/players", 2) === "worldStats/e2_players" && S("worldStats/islands", 2) === "worldStats/e2_islands" && S("worldStats/raid_2026-W40", 2) === "worldStats/e2_raid_2026-W40", "epoch 2: rankings and lists start over");
check(["worldStats/main", "worldPayTx/0x1", "worldCrew/abc", "worldPlayers/0x1", "worldCbtClaim/0x1", "worldLot/0x1", "worldDiag/2026-10-14"].every((p) => S(p, 2) === p), "kept as they are: visit counts, payments, crews, CBT records, coin lots, health counters");
check(S("support/abc", 2) === "support/abc", "other parts of the site: untouched");

// ---- what was paid for in $ARCIRCLE carries over; what ARCL bought doesn't ----
{ const o = PHM.carryOwn({ items: ["style-grass", "brick-gold", "isle48", "plate-gold"], renames: 2, revives: 3, bag: 2, buys: [{ id: "style-grass", via: "arcircle" }, { id: "brick-gold", via: "arcl" }, { id: "rename", via: "arcl" }, { id: "rename", via: "arcircle" }, { id: "bagplus", via: "arcl" }, { id: "isle48", via: "arcl" }, { id: "isle48", via: "arcircle" }] });
  check(o.items.join() === "style-grass,isle48,plate-gold", "items: paid ones (and older ones with no record) stay, ARCL ones go: " + o.items.join());
  check(o.renames === 1 && o.bag === 1 && o.revives === undefined && o.buys.every((b) => b.via !== "arcl"), "counts drop by what ARCL bought");
  check(PHM.carryOwn(null) === null, "no record: nothing"); }

// ---- the closed beta's data ----
const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom(), C = ethers.Wallet.createRandom(), D = ethers.Wallet.createRandom(), E = ethers.Wallet.createRandom(), F = ethers.Wallet.createRandom(), G = ethers.Wallet.createRandom();
const lcw = (x) => x.address.toLowerCase();
V.GM_WALLETS.push(lcw(G)); // a test GM
const SRV = await import("../../api/_world-social.mjs");
const seed = [[A, 30, 0], [B, 25, 900], [C, 26, 0], [D, 25, 100], [E, 3, 0], [G, 60, 0]];
for (const [x, lv, more] of seed) db.set(`worldSave/${lcw(x)}`, { xp: SRV.xpAt(lv) + more, xpv: SRV.XP_VERSION, name: "p" + lv, rpg: { eq: {}, bag: [] }, at: T - 9e6 });
db.set("worldStats/players", { list: seed.map(([x, lv]) => ({ w: lcw(x), name: "p" + lv, lv, ...(x === G ? { gm: 1 } : {}) })), n: seed.length });
db.set(`worldIsland/${lcw(A)}`, { data: "AQ==", name: "A isle", n: 5, vxp: 900, at: T - 9e6 });
db.set(`worldArclBal/${lcw(A)}`, { bal: 5000 });
db.set(`worldOwn/${lcw(A)}`, { items: ["style-grass", "brick-gold"], buys: [{ id: "style-grass", via: "arcircle" }, { id: "brick-gold", via: "arcl" }] });
const sign = async (x) => { const issued = new Date(T).toISOString(); return { wallet: x.address, issued, signature: await x.signMessage(loginMessage(x.address, issued)) }; };

// ---- closed: GMs only ----
{ const W = mk({ phase: "closed", epoch: 1 });
  let r = await W.handle({ action: "world-gate", ...(await sign(A)) });
  check(r.status === 200 && r.body.ok === false && r.body.closed, "closed: a holder's gate says no");
  r = await W.handle({ action: "world-gate", ...(await sign(G)) });
  check(r.status === 200 && r.body.ok === true, "closed: a GM's gate says yes");
  r = await W.handle({ action: "world-save", ...(await sign(A)), data: { xp: 1 } });
  check(r.status === 423 && r.body.closed, "closed: a player's save is refused");
  r = await W.handle({ action: "world-arcl-claim", ...(await sign(A)), kind: "street" });
  check(r.status === 423, "closed: earning ARCL is refused");
  r = await W.handle({ action: "world-like" });
  check(r.status === 423, "closed: unsigned actions are refused");
  r = await W.handle({ action: "world-ping", id: "abcdefabcdef12" });
  check(r.status === 200 && r.body.phase === "closed", "closed: the counts still work, and say the phase");
  r = await W.handle({ action: "world-login", ...(await sign(A)) });
  check(r.status === 200 && r.body.save && r.body.phase === "closed", "closed: sign-in still works");
  r = await W.handle({ action: "world-support-new", ...(await sign(A)) });
  check(r.status !== 423, "closed: the help desk stays open (" + r.status + ")");
  T += 10e3; r = await W.handle({ action: "world-save", ...(await sign(G)), data: { xp: SRV.xpAt(60), xpv: SRV.XP_VERSION, name: "gm" } });
  check(r.status === 200, "closed: a GM still plays");
  r = await W.read(new URL("http://x/api/social?world=phase"));
  const top = r.body.top.map((x) => x.w);
  check(r.status === 200 && r.body.phase === "closed" && top.join() === [A, C, B].map(lcw).join(), "the level top 3, GMs left out, a tie settled by XP: " + r.body.top.map((x) => x.name + " " + x.lv).join(", "));
  check(db.get("worldCbt/top") && db.get("worldCbt/top").list.length === 3, "the top 3 is frozen once read"); }

// ---- the open beta: a fresh start ----
{ const W = mk({ phase: "obt", epoch: 2 });
  let r = await W.handle({ action: "world-gate", ...(await sign(F)) });
  check(r.status === 200 && r.body.ok === true, "open beta: anyone's gate says yes, no $ARCIRCLE needed");
  r = await W.handle({ action: "world-login", ...(await sign(A)) });
  check(r.status === 200 && r.body.save === null, "open beta: the closed beta's progress isn't brought back");
  check(r.body.cbt && r.body.cbt.eligible && r.body.cbt.rank === 1 && !r.body.cbt.claimed, "open beta: sign-in says the CBT reward is waiting (rank 1)");
  r = await W.handle({ action: "world-save", ...(await sign(A)), data: { xp: SRV.xpAt(30), xpv: SRV.XP_VERSION } });
  check(r.status === 409 && r.body.stale, "a game still on the closed beta's progress can't save into the open beta");
  r = await W.handle({ action: "world-save", ...(await sign(A)), ep: 2, data: { xp: 50, xpv: SRV.XP_VERSION, ep: 2, name: "A2" } });
  check(r.status === 200 && db.get(`worldSave_e2/${lcw(A)}`).xp === 50 && db.get(`worldSave_e2/${lcw(A)}`).ep === 2, "open beta: a save goes to the new collection");
  check(db.get(`worldSave/${lcw(A)}`).xp === SRV.xpAt(30), "the closed beta's save is never changed");
  check(db.get("worldStats/e2_players").list.length === 1 && db.get("worldStats/players").list.length === seed.length, "the open beta's directory starts empty");
  r = await W.read(new URL(`http://x/api/social?world=island&wallet=${lcw(A)}`));
  check(r.status === 200 && r.body.data === null, "open beta: islands and villages start over");
  const st = PHM.scopeStore(store, 2), got = await st.getDocs([`worldArclBal/${lcw(A)}`, `worldOwn/${lcw(A)}`]);
  check(got[`worldArclBal/${lcw(A)}`] === null, "open beta: ARCL starts at nothing");
  check(got[`worldOwn/${lcw(A)}`].items.join() === "style-grass", "open beta: the $ARCIRCLE purchase carries over, the ARCL one doesn't");
  // the rewards
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(A)) });
  check(r.status === 409 && r.body.stale, "the claim also needs the open beta's game");
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(A)), ep: 2 });
  const it = r.body.items || [];
  check(r.status === 200 && it.length === 4 && it[0].b === "weapon-1" && Number.isInteger(it[0].k) && it.every((x) => x.r === 4 && x.lv === PHM.CBT_REWARD.lv && /-1$/.test(x.b)), "rank 1: a Legendary weapon and 3 more Legendary pieces: " + it.map((x) => x.b).join(" "));
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(A)), ep: 2 });
  check(r.status === 200 && r.body.again && r.body.items.map((x) => x.id).join() === it.map((x) => x.id).join(), "asking again returns the same pieces (the game adds each once)");
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(C)), ep: 2 });
  check(r.body.rank === 2 && r.body.items.length === 3, "rank 2: weapon + 2");
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(B)), ep: 2 });
  check(r.body.rank === 3 && r.body.items.length === 2, "rank 3: weapon + 1");
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(E)), ep: 2 });
  check(r.body.rank === 0 && r.body.items.length === 1 && r.body.items[0].b === "weapon-1", "every other CBT player: the Legendary weapon");
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(F)), ep: 2 });
  check(r.status === 404, "a wallet new in the open beta: no CBT reward");
  r = await W.handle({ action: "world-cbt-claim", ...(await sign(G)), ep: 2 });
  check(r.status === 200 && r.body.rank === 2 && r.body.items.length === 3 && r.body.items[0].b === "weapon-1", "GMs: outside the ranking, the 2nd place's set (weapon + 2)");
  check(db.get("worldCbt/top").list.every((x) => x.w !== lcw(G)), "and the ranking itself stays without GMs");
  r = await W.handle({ action: "world-login", ...(await sign(A)) });
  check(r.body.cbt.claimed && r.body.cbt.items.length === 4, "after the claim, sign-in says it's been claimed"); }

// ---- the game and the server agree on the phase ----
{ const src = fs.readFileSync(new URL("../../world-lock.js", import.meta.url), "utf8");
  const ph = (/var PHASE = "(\w+)"/.exec(src) || [])[1], ep = Number((/var EPOCH = (\d+)/.exec(src) || [])[1]);
  check(ph === PHM.WORLD_PHASE.phase && ep === PHM.WORLD_PHASE.epoch, `world-lock.js and the server agree: ${ph} / ${ep}`); }

console.log(`${ok} pass ${bad} fail`);
if (bad) process.exit(1);
