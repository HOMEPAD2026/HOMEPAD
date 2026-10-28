// hub.test.mjs — the Creator Hub's server (api/_world-hub.mjs, HUB 2): the inbox and the Studio's notifications (a comment,
// a follow, a beaten #1, a teammate), profiles with pins and the World's titles, the forum (posts, replies, likes,
// deleting), patch notes into the followers' feed, shared Jump World pieces and their uses, a GM's sponsor contests,
// and teams of up to four. On an in-memory store. Run: node tests/world/hub.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { HUB } = await import("../../api/_world-hub.mjs");
const { CO } = await import("../../api/_world-studio.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => { for (const x of ws) { if (x.create && db.has(x.create)) return { ok: false, conflict: true }; } for (const x of ws) { if (x.create) db.set(x.create, x.data); else if (x.set) db.set(x.set, x.data); } return { ok: true }; },
};
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-28T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
let n = 0; const randomId = () => (0x1000000 + ++n * 7919).toString(16) + "abcdef";
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, randomId, random: Math.random, ai: async () => "{}", tokenBalance: async () => "0", receipt: async () => null });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const get = async (q) => (await W.read(new URL("https://x/api/social?world=" + q))).body;
const me = ethers.Wallet.createRandom(), fan = ethers.Wallet.createRandom(), b2 = ethers.Wallet.createRandom(), b3 = ethers.Wallet.createRandom(), b4 = ethers.Wallet.createRandom();
const lc = (w) => w.address.toLowerCase();
const tick = (s = 31) => { T += s * 1000; };

// a published game of mine
const sv = await call(me, "world-studio-save", { spec: { title: "Neon Sprint", tpl: "runner", theme: "neon", seed: 7 } }); const id = sv.body.game.id;
await call(me, "world-studio-publish", { id, on: true });
check(!!id, "a published game to work with");

// the inbox: a comment and a follow from someone else land in mine; my own comment doesn't
await call(fan, "world-studio-comment", { id, t: "Great level!" }); tick(); await call(me, "world-studio-comment", { id, t: "Thanks all" }); tick();
await call(fan, "world-studio-follow", { id, on: true });
let inbox = await get("hub-inbox&wallet=" + lc(me));
check(inbox.items.length === 2 && inbox.items.some((x) => x.kind === "cmt" && x.id === id) && inbox.items.some((x) => x.kind === "fan"), "a comment and a follower in my inbox (my own comment not)");
const s1 = await call(me, "world-hub-seen"); inbox = await get("hub-inbox&wallet=" + lc(me)); check(s1.body.seen === T && inbox.seen === T, "seen marks the inbox read");

// a beaten #1
await call(fan, "world-studio-play", { id, coins: 1, dist: 10, done: false }); tick(25);
await call(b2, "world-studio-play", { id, coins: 9, dist: 900, done: true }); tick(25);
inbox = await get("hub-inbox&wallet=" + lc(fan));
check(inbox.items.some((x) => x.kind === "beat" && x.id === id), "the old #1 hears their record was beaten");

// a profile: bio, a banner, pins (only my own published games), safe links only; the World's titles
await call(me, "world-studio-handle", { h: "ranger" });
db.set(`worldSave/${lc(me)}`, { name: "Ranger", xp: 0, rpg: { x: { ach: ["cctut", "k10"] } } });
const pr = await call(me, "world-hub-profile", { bio: "I make <b>runners</b>", banner: 9, pins: [id, "gnotmine"], links: ["https://x.com/ranger", "javascript:alert(1)", "https://evil.example/x"] });
check(pr.body.profile.bio === "I make  b runners /b" || !/[<>]/.test(pr.body.profile.bio), "the bio loses its angle brackets");
check(pr.body.profile.banner === HUB.BANNERS - 1 && pr.body.profile.pins.length === 1 && pr.body.profile.links.length === 1, "banner clamped, only my published game pinned, only a safe link kept");
const pv = await get("hub-profile&h=ranger");
check(pv.ok && pv.world && pv.world.rookie && pv.world.ach.includes("k10") && pv.profile.pins[0] === id, "the profile shows the pins and the World's titles (Rookie Creator)");
check((await get("hub-profile&h=nobody")).error, "an unknown ID has no profile");

// the forum
const bad1 = await call(fan, "world-hub-post", { b: "nope", title: "Hello", t: "Hello there" }); check(bad1.status === 400, "an unknown board is refused");
const p1 = await call(fan, "world-hub-post", { b: "show", title: "My first game", t: "Play it and tell me!", game: id }); const pid = p1.body.id;
check(/^t/.test(pid || ""), "a post on the show board");
const p2 = await call(fan, "world-hub-post", { b: "show", title: "Again", t: "Too soon after the last" }); check(p2.status === 429, "a second post within the gap waits");
tick(); const r1 = await call(me, "world-hub-reply", { id: pid, t: "Nice one" });
check(r1.body.replies.length === 1, "a reply");
inbox = await get("hub-inbox&wallet=" + lc(fan)); check(inbox.items.some((x) => x.kind === "reply" && x.id === pid), "the poster hears about the reply");
const l1 = await call(me, "world-hub-like", { id: pid }), l2 = await call(me, "world-hub-like", { id: pid });
check(l1.body.likes === 1 && l2.body.already && l2.body.likes === 1, "a like once a wallet");
let board = await get("hub-board&b=show"); check(board.posts.length === 1 && board.posts[0].n === 1 && board.posts[0].likes === 1 && board.posts[0].game === id, "the board lists the post with its replies, likes and game");
const thread = await get("hub-post&id=" + pid); check(thread.post.t === "Play it and tell me!" && thread.replies[0].t === "Nice one", "the thread reads back");
const d0 = await call(me, "world-hub-del", { id: pid }); check(d0.status === 403, "someone else can't delete a post");
const d1 = await call(fan, "world-hub-del", { id: pid }); board = await get("hub-board&b=show"); check(d1.body.ok && !board.posts.length, "its writer deletes it");

// patch notes → my followers' feed
const nt = await call(me, "world-hub-note", { id, t: "Faster ending, more coins" });
check(nt.body.notes.length === 1 && (await get("hub-notes&id=" + id)).notes[0].t === "Faster ending, more coins", "a patch note on my game");
const feed = await get("studio-feed&wallet=" + lc(fan)); check(feed.games.some((g) => g.id === id && g.note === "Faster ending, more coins"), "the follower's feed carries the note");
check((await call(fan, "world-hub-note", { id, t: "hacked" })).status === 404, "only the maker writes a note");

// pieces
tick(); const bp = await call(me, "world-hub-piece", { name: "Spike pit", piece: { cells: [[0, 0, "x"], [99, 0, "x"]] } }); check(bp.status === 400, "a piece outside the grid is refused");
tick(); const pc = await call(me, "world-hub-piece", { name: "Spike pit", piece: { cells: [[0, 0, "b"], [1, 0, "s"], [2, 0, "b"]] } }); const pcid = pc.body.id;
check(/^p/.test(pcid || "") && (await get("hub-pieces")).list[0].w === 3, "a shared piece is listed with its size");
const u1 = await call(fan, "world-hub-piece-use", { id: pcid }), u2 = await call(fan, "world-hub-piece-use", { id: pcid }), u3 = await call(me, "world-hub-piece-use", { id: pcid });
check(u1.body.uses === 1 && u2.body.uses === 1 && u3.body.uses === 1, "a use counted once a wallet, never the maker's own");
inbox = await get("hub-inbox&wallet=" + lc(me)); check(inbox.items.some((x) => x.kind === "use"), "the maker hears their piece was used");
check((await get("hub-piece&id=" + pcid)).piece.cells.length === 3, "the piece's cells read back");

// sponsors: GMs only, past ends refused, ended ones hidden
check((await call(fan, "world-hub-sponsor", { title: "Hack", ends: T + 9e9 })).status === 403, "only a GM sets a sponsor contest");

// teams of up to four
const inv = await call(me, "world-studio-co-invite", { id }); const code = inv.body.code;
await call(b2, "world-studio-co-join", { code }); await call(b3, "world-studio-co-join", { code });
let g = db.get(`worldStudio/${id}`); check(g.co.length === 2 && g.coCode === code, "two teammates in, the code still open");
inbox = await get("hub-inbox&wallet=" + lc(me)); check(inbox.items.filter((x) => x.kind === "team").length === 2, "the owner hears each teammate join");
await call(b4, "world-studio-co-join", { code }); g = db.get(`worldStudio/${id}`); check(g.co.length === CO.TEAM - 1 && !g.coCode, "a third fills the team and closes the code");
const full = await call(fan, "world-studio-co-join", { code }); check(full.status >= 400, "a fifth can't join");
await call(b3, "world-studio-co-leave", { id }); g = db.get(`worldStudio/${id}`); check(g.co.length === 2 && !g.co.includes(lc(b3)) && !/,.*,/.test(g.coName), "a member leaving leaves the others");
await call(me, "world-studio-co-leave", { id }); g = db.get(`worldStudio/${id}`); check(!g.co.length, "the owner leaving ends the team");

check([...db.keys()].every((k) => /^[^/]+\/[^/]+$/.test(k)), "every document is collection/id (Firestore refuses a bare name: worldHubPieces once was one)");
console.log(`\n${ok} pass ${bad} fail`); process.exit(bad ? 1 : 0);
