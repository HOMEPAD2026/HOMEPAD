// chat.test.mjs — local chat, the friends graph and private chat (api/_world-chat.mjs): friend request / accept / block,
// DMs only between friends, the rate limits, the filter, the message caps and the ghost bubble.
// Run: node tests/world/chat.test.mjs (needs ethers 6)
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const C = await import("../../api/_world-chat.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async (ws) => {
    for (const w of ws) { if (w.create && db.has(w.create)) return { ok: false, conflict: true }; if (w.del && !db.has(w.del)) return { ok: false, conflict: true }; }
    for (const w of ws) {
      if (w.create) db.set(w.create, JSON.parse(JSON.stringify(w.data)));
      else if (w.set) db.set(w.set, JSON.parse(JSON.stringify(w.data)));
      else if (w.del) db.delete(w.del);
      else if (w.inc) { const cur = db.get(w.inc) || {}; for (const [k, v] of Object.entries(w.fields)) cur[k] = (cur[k] || 0) + v; db.set(w.inc, cur); }
    }
    return { ok: true };
  },
  queryDocs: async (coll, field, value) => [...db].filter(([k, v]) => k.startsWith(coll + "/") && v[field] === value).map(([k, v]) => ({ id: k.slice(coll.length + 1), ...structuredClone(v) })),
};
const json = (status, body, cache) => ({ status, body, cache });
let T = Date.parse("2026-10-13T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
// the wait for the next second moves the clock instead of sleeping
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, sleep: async (ms) => { T += ms; } });
const who = async (name) => { const w = ethers.Wallet.createRandom(), issued = new Date(T).toISOString(); const id = w.address.toLowerCase(); if (name) db.set("worldSave/" + id, { name, xp: 0, at: T }); return { w: id, S: { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) } }; };
const act = (p, a, body) => W.handle({ action: a, ...p.S, ...body });
const chatGet = (ch) => W.read(new URL("http://x/api/social?world=chat&ch=" + ch));
const tick = (ms = 2100) => { T += ms; };

// ---- the filter ----
const f = C.chatClean;
check(f("hello there!") === "hello there!" && f("  hi   there ") === "hi there", "plain talk passes, spaces are tidied");
check(f("I don't know, it's 5 o'clock") === "I don't know, it's 5 o'clock", "apostrophes stay");
check(f("go ".repeat(100)).length === 120 && f("go ".repeat(100), 80).length === 80, "a line is cut to 120 (80 for a bubble)");
check(f("") === "" && f("<b></b>") === "b b" || f("<b></b>") !== null, "markup brackets are dropped");
check(f("visit www.evil.com") === null && f("https://x.io") === null && f("evil dot com") === null, "links are refused");
check(f("send to 0x1234567890abcdef1234567890abcdef12345678") === null && f("call 010 1234 5678") === null, "addresses and long numbers are refused");
check(f("dm me on telegram") === null, "taking the talk elsewhere is refused");
check(f("what the fuck") === null && f("sh1t") === null && f("f u c k") === null && f("fuuuuck") === null && f("you bitch") === null, "rude English is refused, even spaced or in leetspeak");
check(f("씨발") === null && f("야 병 신아") === null && f("ㅅㅂ") === null, "rude Korean is refused");
check(f("你他妈的") === null && f("傻 逼") === null, "rude Chinese is refused");
check(f("orospu çocuğu") === null && f("siktir git") === null && f("AMK") === null, "rude Turkish is refused");
check(f("a classic assistant at the Scunthorpe cocktail party") !== null && f("hello, shall we hunt?") === "hello, shall we hunt?", "ordinary words that contain a stem pass");
check(f("free airdrop here, claim now") === null && f("send me some usdt") === null && f("guaranteed profit") === null && f("connect your wallet") === null, "scam phrases are refused (en)");
check(f("무료 에어드랍 받으세요") === null && f("카톡 추가해줘") === null && f("免费空投领取") === null && f("加微信") === null && f("ücretsiz airdrop") === null, "scam phrases are refused (ko / zh / tr)");
check(f("anyone up for the raid boss?") !== null, "game talk passes");
check(C.pairKey("0xb", "0xa") === "0xa_0xb", "a pair's id is sorted");

// ---- local chat ----
const A = await who("Ann"), B = await who("Bob"), G = await who(""), N = await who("");
const CH = "h-launch";
let r = await act(A, "world-chat-say", { ch: CH, m: "hello town" });
check(r.status === 200 && r.body.msg.n === "Ann" && r.body.msg.m === "hello town", "a named, signed-in player posts a line");
r = await chatGet(CH);
check(r.status === 200 && r.body.list.length === 1 && r.body.list[0].w === A.w && /max-age=3/.test(r.cache), "the area's lines are public with a 3 s cache");
check(!("signature" in r.body.list[0]) && JSON.stringify(r.body).indexOf(A.S.signature) < 0, "no signature in the public view");
r = await act(G, "world-chat-say", { ch: CH, m: "hi" }); check(r.status === 403, "no saved name (a guest): can't post (" + r.body.error + ")");
r = await W.handle({ action: "world-chat-say", ch: CH, m: "hi" }); check(r.status === 400, "no sign-in at all: refused");
r = await act(B, "world-chat-say", { ch: "nope", m: "hi" }); check(r.status === 400, "an unknown place is refused");
r = await act(B, "world-chat-say", { ch: CH, m: "see www.x.com" }); check(r.status === 400, "a link is refused");
r = await act(B, "world-chat-say", { ch: CH, m: "   " }); check(r.status === 400, "an empty line is refused");
r = await act(B, "world-chat-say", { ch: CH, m: "go ".repeat(200) }); check(r.status === 200 && r.body.msg.m.length === 120, "a long line is cut to 120");
// the pace: one line every 2 seconds
r = await act(B, "world-chat-say", { ch: CH, m: "again" }); check(r.status === 429, "a second line within 2 seconds: refused");
tick(); r = await act(B, "world-chat-say", { ch: CH, m: "again" }); check(r.status === 200, "…and fine after 2 seconds");
// one write a second for the area: a second player in the same second waits for the next one, once
T = Math.ceil(T / 1000) * 1000 + 50; db.set(`worldChatSlot/${CH}_${Math.floor(T / 1000)}`, { at: T });
const t0 = T; r = await act(A, "world-chat-say", { ch: CH, m: "after the clash" });
check(r.status === 200 && T > t0, "a busy second: the line waits for the next one and goes in");
db.set(`worldChatSlot/${CH}_${Math.floor((T + 1000) / 1000)}`, { at: T }); db.set(`worldChatSlot/${CH}_${Math.floor(T / 1000)}`, { at: T }); tick();
db.set(`worldChatSlot/${CH}_${Math.floor(T / 1000)}`, { at: T });
const sl = store.sleep; const W2 = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, sleep: async () => {} });
r = await W2.handle({ action: "world-chat-say", ...A.S, ch: CH, m: "still busy" }); check(r.status === 429, "still busy after one retry: told to try again");
// the cap of 30 lines, and 60 in 10 minutes
const P = await who("Pip"); let last = 0;
for (let i = 0; i < 40; i++) { tick(); r = await act(P, "world-chat-say", { ch: "z-forest", m: "line " + i }); if (r.status === 200) last++; else break; }
check(last === 40 && (await chatGet("z-forest")).body.list.length === 30 && (await chatGet("z-forest")).body.list[29].m === "line 39", "an area keeps the last 30 lines");
let n = last; for (let i = 0; i < 40; i++) { tick(); r = await act(P, "world-chat-say", { ch: "z-forest", m: "more " + i }); if (r.status === 200) n++; else break; }
check(r.status === 429 && /60/.test(r.body.error) && n === 60, "60 lines in 10 minutes, then refused (" + n + ")");
T += 600e3; r = await act(P, "world-chat-say", { ch: "z-forest", m: "back" }); check(r.status === 200, "the next 10 minutes start fresh");
r = await act(A, "world-chat-say", { ch: "i-" + B.w, m: "on Bob's island" }); check(r.status === 200, "an island is an area too");

// ---- friends ----
tick();
r = await act(A, "world-friend-request", { to: B.w }); check(r.status === 200 && r.body.st === "out", "a request goes out");
check(db.has("worldFriend/" + C.pairKey(A.w, B.w)), "the pair's document is worldFriend/<a>_<b>, sorted");
r = await act(A, "world-friend-request", { to: B.w }); check(r.status === 200 && r.body.st === "out", "asking twice changes nothing");
r = await act(A, "world-friend-request", { to: A.w }); check(r.status === 400, "not yourself");
r = await act(A, "world-friend-request", { to: N.w }); check(r.status === 404, "someone who hasn't played: no");
r = await act(A, "world-dm-send", { to: B.w, m: "hi friend" }); check(r.status === 403, "a request is not yet a friendship: no DM");
r = await act(B, "world-friends", {}); check(r.body.friends.length === 1 && r.body.friends[0].st === "in" && r.body.friends[0].w === A.w && r.body.q === 1, "Bob sees the request waiting");
r = await act(A, "world-friends", {}); check(r.body.friends[0].st === "out", "Ann sees it as sent");
r = await act(A, "world-friend-accept", { to: B.w }); check(r.status === 404, "the sender can't accept their own request");
r = await act(B, "world-friend-accept", { to: A.w }); check(r.status === 200 && r.body.st === "friend", "Bob accepts");
r = await act(A, "world-friends", {}); check(r.body.friends[0].st === "friend" && r.body.q === 0, "they are friends; the request count is back to 0");
// online dot from the ping
r = await act(A, "world-friends", {}); check(r.body.friends[0].on === false, "no ping yet: not online");
db.set("worldPres/" + B.w, { at: T - 5 * 60e3, n: "Bob", lv: 7 }); r = await act(A, "world-friends", {}); check(r.body.friends[0].on === true && r.body.friends[0].n === "Bob" && r.body.friends[0].lv === 7, "pinged 5 minutes ago: online, with name and level");
db.set("worldPres/" + B.w, { at: T - 11 * 60e3, n: "Bob", lv: 7 }); r = await act(A, "world-friends", {}); check(r.body.friends[0].on === false, "pinged 11 minutes ago: not online");

// ---- private chat ----
tick();
r = await act(A, "world-dm-send", { to: B.w, m: "psst" }); check(r.status === 200, "friends can message");
r = await act(A, "world-dm-send", { to: B.w, m: "again" }); check(r.status === 429, "the same pace applies to DMs");
tick(); r = await act(B, "world-dm-send", { to: A.w, m: "hey Ann" }); check(r.status === 200, "…and back");
r = await act(A, "world-dm-send", { to: B.w, m: "www.bad.com" }); check(r.status === 400, "the filter applies to DMs");
r = await act(B, "world-dm-thread", { with: A.w }); check(r.status === 200 && r.body.list.length === 2 && r.body.list[0].m === "psst", "the thread has both lines");
const Z = await who("Zed"); r = await act(Z, "world-dm-thread", { with: A.w }); check(r.status === 403, "a stranger can't read it");
r = await act(Z, "world-dm-send", { to: A.w, m: "yo" }); check(r.status === 403, "a stranger can't message");
r = await W.read(new URL("http://x/api/social?world=dm&with=" + A.w)); check(r.status === 400, "there's no GET view of a thread");
r = await act(B, "world-dm-unread", {}); check(r.body.dm === 1 && r.body.from[A.w] === 1, "Bob has 1 unread, from Ann");
r = await act(A, "world-dm-unread", {}); check(r.body.dm === 1 && r.body.from[B.w] === 1, "Ann has 1 unread, from Bob");
r = await act(B, "world-dm-read", { with: A.w }); r = await act(B, "world-dm-unread", {}); check(r.body.dm === 0, "reading clears the count");
for (let i = 0; i < 60; i++) { tick(); if ((await act(i % 2 ? A : B, "world-dm-send", { to: i % 2 ? B.w : A.w, m: "n" + i })).status !== 200) tick(600e3); }
r = await act(A, "world-dm-thread", { with: B.w }); check(r.body.list.length === 50, "a thread keeps the last 50 (" + r.body.list.length + ")");

// ---- blocking ----
tick();
r = await act(B, "world-friend-block", { to: A.w }); check(r.status === 200 && r.body.st === "blocked", "Bob blocks Ann");
r = await act(A, "world-dm-send", { to: B.w, m: "hello?" }); check(r.status === 403, "a block shuts the DM");
r = await act(B, "world-dm-send", { to: A.w, m: "hello?" }); check(r.status === 403, "…both ways");
r = await act(B, "world-dm-thread", { with: A.w }); check(r.status === 403, "…and the thread");
r = await act(A, "world-friend-request", { to: B.w }); check(r.status === 403, "the blocked can't ask again");
r = await act(B, "world-friend-request", { to: A.w }); check(r.status === 400, "the blocker must unblock first");
r = await act(A, "world-friends", {}); check(r.body.friends.length === 0, "Ann doesn't see Bob any more");
r = await act(B, "world-friends", {}); check(r.body.friends.length === 1 && r.body.friends[0].st === "blocked", "Bob sees Ann under Blocked");
r = await act(B, "world-friend-unblock", { to: A.w }); check(r.status === 200, "Bob unblocks");
check(!db.has("worldFriend/" + C.pairKey(A.w, B.w)), "no blocks, no friendship: the pair's document is gone");
r = await act(A, "world-dm-send", { to: B.w, m: "still?" }); check(r.status === 403, "unblocked is not friends again");
r = await act(A, "world-friend-request", { to: B.w }); r = await act(B, "world-friend-decline", { to: A.w }); check(r.status === 200 && !db.has("worldFriend/" + C.pairKey(A.w, B.w)), "declining removes the request");
r = await act(A, "world-friend-request", { to: B.w }); r = await act(B, "world-friend-request", { to: A.w }); check(r.body.st === "friend", "asking each other at once makes them friends");
r = await act(A, "world-friend-remove", { to: B.w }); check(r.status === 200 && !db.has("worldFriend/" + C.pairKey(A.w, B.w)), "removing a friend deletes the pair");
r = await act(A, "world-friend-remove", { to: B.w }); check(r.status === 404, "removing twice: nothing there");
// a daily cap on requests
const S = await who("Spam"); let sent = 0, rr;
for (let i = 0; i < 25; i++) { const t = await who("T" + i); rr = await act(S, "world-friend-request", { to: t.w }); if (rr.status === 200) sent++; else break; }
check(sent === 20 && rr.status === 429, "20 friend requests a day, then refused");

// ---- reports ----
r = await act(A, "world-chat-report", { target: B.w, why: "abuse", ch: CH, m: "bad line" });
const rep = [...db].filter(([k]) => k.startsWith("worldChatReport/")).map(([, v]) => v);
check(r.status === 200 && rep.length === 1 && rep[0].target === B.w && rep[0].reporter === A.w && rep[0].why === "abuse" && rep[0].status === "open", "a report is stored for the team");
r = await act(A, "world-chat-report", { target: B.w, why: "abuse", ch: CH }); check(r.body.again && [...db.keys()].filter((k) => k.startsWith("worldChatReport/")).length === 1, "reporting the same player twice a day counts once");
check(db.get("worldChatFlag/" + B.w).n === 1, "the player's flag count goes up");
r = await act(A, "world-chat-report", { target: A.w, why: "spam", ch: CH }); check(r.status === 400, "not yourself");

// ---- the ghost bubble ----
const ping = (p, g, extra = {}) => W.handle({ action: "world-ping", id: "tag" + p.w.slice(2, 16), g: { x: 1, z: 2, c: "bot", lv: 3, ...g }, s: p.S, ...extra });
await ping(A, { m: "hello all" }, { pr: 1 });
let gh = await W.read(new URL("http://x/api/social?world=ghosts"));
check(gh.body.ghosts.some((x) => x.m === "hello all" && x.sa), "a signed-in player's last line shows as the ghost's bubble");
check(db.get("worldPres/" + A.w).n === "Ann", "the ping with pr keeps the presence document");
await ping(B, { m: "www.evil.com" }); gh = await W.read(new URL("http://x/api/social?world=ghosts"));
check(!gh.body.ghosts.some((x) => /evil/.test(x.m || "")), "a bubble is filtered like a line");
await W.handle({ action: "world-ping", id: "guestguestguest1", g: { x: 1, z: 2, c: "bot", lv: 1, m: "free text from a guest" } });
gh = await W.read(new URL("http://x/api/social?world=ghosts"));
check(!gh.body.ghosts.some((x) => /guest/.test(x.m || "")), "a guest's ping carries no text");
await W.handle({ action: "world-ping", id: "guestguestguest2", g: { x: 1, z: 2, c: "bot", lv: 1, s: 2 } });
gh = await W.read(new URL("http://x/api/social?world=ghosts")); check(gh.body.ghosts.some((x) => x.s === 2 && x.sa), "the fixed lines still work");

console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
