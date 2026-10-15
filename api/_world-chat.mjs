// api/_world-chat.mjs — ARCIRCLE World's talk: local chat in the area you stand in, friends (a request the other side
// accepts) and 1:1 private chat between friends.
//
//   GET  ?world=chat&ch=…                                  { ch, list: [{ id, w, n, lv, m, at, gm? }] }  the last 30 in that area (public, 3 s cache)
//   POST { action: "world-chat-say", …signature, ch, m }   one line (120 characters) into an area; signed in, named players only
//   POST { action: "world-chat-report", …signature, target, why, kind?, ch?, m? }  a report for the team (worldChatReport/<id>)
//   POST { action: "world-friends", …signature }           { friends: [{ w, st, n, lv, on, seen }], q }  st: friend | in | out | blocked
//   POST { action: "world-friend-request" | "-accept" | "-decline" | "-remove" | "-block" | "-unblock", …signature, to }
//   POST { action: "world-dm-send", …signature, to, m }    friends only
//   POST { action: "world-dm-thread", …signature, with }   { list: [{ id, w, m, at }] } the last 50, friends only, never a GET
//   POST { action: "world-dm-read", …signature, with }    clears that friend's unread count
//   POST { action: "world-dm-unread", …signature }         { dm, from: { wallet: n }, q }  one small document, for the badge
//
// An area (ch) is h-<district>, z-<hunting ground> or i-<island owner's wallet>; one rolling document holds its last
// 30 lines. A line is written by the server (read, add, write) and at most one write a second per area (a create-only
// marker per second; on a clash it waits for the next second once). A line is 120 characters, with no links,
// addresses or long numbers (cleanNote's rules), no rude words (en / ko / zh / tr) and no scam talk; a player may send
// one every 2 seconds and 60 in 10 minutes (markers), local chat and DMs together.
// Friends: one document a pair (worldFriend/<a>_<b>, ids sorted) holding the state — request (from), friends, or
// nothing but who blocked whom. A block ends the friendship and shuts the DM. Muting is the browser's own.
// Firestore: worldChat/<ch> { list } · worldChatSlot/<ch>_<second> · worldChatWin/<wallet>_<10-min window> { n } · worldChatGap/<wallet>_<2-s slot>
//            worldFriend/<a>_<b> { a, b, st, from, blk[] } · worldFriendDay/<wallet>_<day> { n } · worldDm/<a>_<b> { list } · worldDmSlot/<a>_<b>_<second>
//            worldDmBox/<wallet> { u_<friend>: unread, q: requests waiting } · worldPres/<wallet> { at, n, lv } (the ping writes it)
//            worldChatReport/<id> · worldChatRepSeen/<reporter>_<target>_<day> · worldChatRepDay/<wallet>_<day> · worldChatFlag/<wallet> { n }
import { blocked, levelOfSave } from "./_world-social.mjs";
import { isGM } from "./_world-village.mjs";
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
export const CHAT_MAX = 120, BUBBLE_MAX = 80, LOCAL_KEEP = 30, DM_KEEP = 50, GAP_MS = 2000, WIN_MS = 600e3, WIN_MAX = 60, REQ_DAY = 20, REP_DAY = 10, ONLINE_MS = 600e3;
const CH = /^(?:[hz]-[a-z0-9]{2,12}|i-0x[0-9a-f]{40})$/;
export const pairKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

// ---- the filter ----
// Latin text is read with accents, look-alike digits and letter-spacing undone ("f u c k", "sh1t", "fuuuck"); Korean and
// Chinese are matched inside the text with spaces and marks taken out. Short stems match whole words only.
const deburr = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/ß/g, "ss").toLowerCase();
const leet = (s) => s.replace(/[0@]/g, (c) => (c === "0" ? "o" : "a")).replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/[5$]/g, "s").replace(/7/g, "t");
const collapse = (s) => s.replace(/(.)\1+/g, "$1");
// whole words (after collapsing repeats): these and anything starting with a long stem
const WORD_EXACT = new Set(["fuck", "fck", "fuk", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "fag", "retard", "nigga", "niga", "amk", "aq", "orospu", "siktir", "sikik", "sikim", "yarrak", "gavat", "ibne", "kahpe", "pust", "amcik", "amina"].map(collapse));
const WORD_STEM = ["fuck", "shit", "bitch", "nigg", "fagg", "retard", "asshole", "whore", "orospu", "siktir", "pezevenk", "motherfuck", "sikerim", "yarrak"].map(collapse);
const SQUASH = ["fuck", "bitch", "whore", "nigger", "nigga", "faggot", "asshole", "orospu", "siktir", "yarrak", "pezevenk", "aminakoy", "aminakod"];
const KO = ["씨발", "시발", "씨빨", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "지랄", "좆", "개새끼", "새끼", "미친놈", "미친년", "느금마", "창녀", "섹스"].map((x) => x.normalize("NFKC"));
const ZH = ["操你", "草你", "肏", "傻逼", "傻b", "煞笔", "沙比", "他妈的", "妈的", "你妈", "妈逼", "狗娘养", "婊子", "贱人", "去死"].map((x) => x.normalize("NFKC").toLowerCase());
function rude(t) {
  const plain = leet(deburr(t)), words = plain.split(/[^a-z]+/).filter(Boolean), merged = [];
  // single letters in a row ("f u c k") count as one word
  for (let i = 0; i < words.length; i++) { if (words[i].length === 1) { let j = i, s = ""; while (j < words.length && words[j].length === 1) s += words[j++]; merged.push(s); i = j - 1; } else merged.push(words[i]); }
  for (const w of merged) { const c = collapse(w); if (WORD_EXACT.has(c) || WORD_STEM.some((x) => c.startsWith(x))) return true; }
  const sq = plain.replace(/[^a-z]/g, "");
  if (SQUASH.some((x) => sq.includes(x))) return true;
  const cjk = String(t).normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
  return KO.some((x) => cjk.includes(x)) || ZH.some((x) => cjk.includes(x));
}
const SCAM = [
  /\b(free|claim|get|win)\s+(\w+\s+)?(airdrops?|giveaways?|usdt|nfts?|tokens?)\b/, /\b(double|triple|10x|100x)\s+(your\s+)?(money|coins?|funds|crypto|investment|usdt|eth|btc)\b/,
  /\b(guaranteed|sure|risk[- ]?free)\s+(profit|return|gain|income)s?\b/, /\b(send|give)\s+me\s+(some\s+)?(eth|usdt|usdc|btc|bnb|sol|money|crypto|coins?|tokens?|arcl|gifts?)\b/,
  /\b(connect|verify|sync|validate)\s+(your\s+)?wallet\b/, /\b(signals?|pump|vip|investment|trading)\s+(group|channel|chat|room)\b/,
  /\b(join|add|contact|message)\s+(me\s+)?(on\s+)?(wechat|kakao|kakaotalk|instagram|insta|snapchat|signal|line)\b/, /\b(passive income|financial freedom|work from home)\b/,
  /\b(i am|i'm|this is)\s+(an?\s+)?(admin|moderator|support|staff|gm)\b/,
  /(무료|공짜).{0,6}(에어드랍|에어드롭|코인|토큰)/, /(에어드랍|에어드롭).{0,6}(받|클레임|신청)/, /(수익|원금).{0,4}보장/, /(카톡|카카오톡|오픈채팅|오픈톡|텔레그램)/, /(리딩방|코인방|시그널방)/, /(지갑|월렛).{0,3}(연결|인증)/,
  /(免费|空投).{0,6}(领取|领|代币|币)/, /领取.{0,4}空投/, /(加|扫).{0,3}(微信|vx|v信|qq|飞机|电报)/, /(带单|喊单|内幕|稳赚|保本|翻倍)/, /(连接|验证).{0,3}钱包/, /私聊/,
  /\b(ucretsiz|bedava)\s+(\w+\s+)?(airdrop|token|coin|nft|kripto)/, /\b(kesin|garanti)\s+(kazan|kar|getiri)/, /\b(para|kripto|coin)\s+(gonder|yolla)/, /\b(cuzdan\w*)\s+(bagla|dogrula)/, /yatirim\s+(grubu|kanali)/, /\bikiye\s+katla/,
];
const scam = (t) => { const p = deburr(t); return SCAM.some((r) => r.test(p) || r.test(t)); };
/// one line of chat: the text, "" when there's nothing, null when it can't be said (a link, an address, rude words, scam talk)
export function chatClean(s, max = CHAT_MAX) {
  const t = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>`\\​-‏‪-‮⁦-⁩﻿]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  if (!t) return "";
  return blocked(t) || rude(t) || scam(t) ? null : t;
}
const NO_LINE = "that can't be sent — no links, addresses, rude words or offers";

/// deps: { getDocs, setDoc, commit, queryDocs?, json, now, signer, sleep? }
export function makeChat(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const one = async (p) => (await getDocs([p]))[p];
  const rid = () => now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const pub = (x) => ({ id: x.id, w: x.w, ...(x.n ? { n: x.n, lv: x.lv } : {}), m: x.m, at: x.at, ...(x.gm ? { gm: 1 } : {}) });
  const query = (f, w) => (deps.queryDocs ? deps.queryDocs("worldFriend", f, w, 100) : Promise.resolve([]));

  // one rolling document a place, written at most once a second: a create-only marker for the second, then read, add, write
  async function append(doc, slot, edit) {
    for (let i = 0; i < 2; i++) {
      if ((await commit([{ create: `${slot}${Math.floor(now() / 1000)}`, data: { at: now() } }])).ok) { await setDoc(doc, edit((await one(doc)) || {})); return true; }
      if (!i) await sleep(1000 - (now() % 1000) + 25);
    }
    return false;
  }
  // a player's pace: one line every 2 seconds, 60 in 10 minutes (markers)
  async function spend(w) {
    const t = now(), win = `worldChatWin/${w}_${Math.floor(t / WIN_MS)}`, slot = Math.floor(t / GAP_MS);
    const d = await getDocs([win, `worldChatGap/${w}_${slot - 1}`]);
    if (((d[win] || {}).n || 0) >= WIN_MAX) return json(429, { error: "slow down — 60 lines in 10 minutes at most" });
    const prev = d[`worldChatGap/${w}_${slot - 1}`];
    if ((prev && t - prev.at < GAP_MS) || !(await commit([{ create: `worldChatGap/${w}_${slot}`, data: { at: t } }])).ok) return json(429, { error: "one line every 2 seconds" });
    await commit([{ inc: win, fields: { n: 1 } }]);
    return null;
  }

  // ---- local chat ----
  async function say(b) {
    const s = signer(b); if (s.err) return s.err;
    const ch = String(b.ch || ""); if (!CH.test(ch)) return json(400, { error: "unknown place" });
    const m = chatClean(b.m); if (m === null) return json(400, { error: NO_LINE }); if (!m) return json(400, { error: "write something first" });
    const sv = await one(`worldSave/${s.wallet}`); if (!sv || !sv.name) return json(403, { error: "pick a name in the game first" });
    const lim = await spend(s.wallet); if (lim) return lim;
    const msg = { id: rid(), w: s.wallet, n: String(sv.name).slice(0, 16), lv: levelOfSave(sv), m, at: now(), ...(isGM(s.wallet) ? { gm: 1 } : {}) };
    if (!(await append(`worldChat/${ch}`, `worldChatSlot/${ch}_`, (cur) => ({ list: [...(cur.list || []), msg].slice(-LOCAL_KEEP) })))) return json(429, { error: "this place is busy — try again in a second" });
    return json(200, { ok: true, msg: pub(msg) });
  }
  async function local(ch) {
    if (!CH.test(String(ch || ""))) return json(400, { error: "unknown place" });
    const d = await one(`worldChat/${ch}`);
    return json(200, { ch, list: ((d && d.list) || []).map(pub), at: now() }, "public, max-age=3, s-maxage=3");
  }

  // ---- friends ----
  const fkey = (a, b) => `worldFriend/${pairKey(a, b)}`;
  const box = (w, fields) => commit([{ inc: `worldDmBox/${w}`, fields }]).catch(() => {});
  const other = (d, me) => (d.a === me ? d.b : d.a);
  // after a block or a removal: nothing left to keep but who blocked whom
  async function settle(d, key) {
    if ((d.blk || []).length) await setDoc(key, { ...d, st: "none", from: "" });
    else await commit([{ del: key }]).catch(() => {});
  }
  async function friendOp(b, op) {
    const s = signer(b); if (s.err) return s.err;
    const me = s.wallet, y = lc(b.to); if (!isAddr(y) || y === me) return json(400, { error: "who is it?" });
    const key = fkey(me, y), day = `worldFriendDay/${me}_${seoulDay(now())}`;
    const got = await getDocs([key, day, `worldSave/${y}`]);
    const d = got[key], blk = (d && d.blk) || [], pair = me < y ? { a: me, b: y } : { a: y, b: me };
    if (op === "request") {
      if (!got[`worldSave/${y}`]) return json(404, { error: "that wallet hasn't played yet" });
      if (blk.includes(y)) return json(403, { error: "they aren't taking requests" });
      if (blk.includes(me)) return json(400, { error: "you blocked them — unblock first" });
      if (d && d.st === "ok") return json(200, { ok: true, st: "friend" });
      if (d && d.st === "req") {
        if (d.from === me) return json(200, { ok: true, st: "out" });
        await setDoc(key, { ...d, st: "ok", from: "" }); await box(me, { q: -1 }); return json(200, { ok: true, st: "friend" }); // they had asked you already
      }
      if ((((got[day] || {}).n) || 0) >= REQ_DAY) return json(429, { error: "20 friend requests a day at most" });
      const rec = { ...pair, st: "req", from: me, blk: [], at: now() };
      if (d) await setDoc(key, rec); else if (!(await commit([{ create: key, data: rec }])).ok) return json(409, { error: "try again" });
      await commit([{ inc: day, fields: { n: 1 } }]); await box(y, { q: 1 });
      return json(200, { ok: true, st: "out" });
    }
    if (op === "accept" || op === "decline") {
      if (!d || d.st !== "req" || d.from !== y) return json(404, { error: "no request from them" });
      if (op === "accept") await setDoc(key, { ...d, st: "ok", from: "" }); else await settle(d, key);
      await box(me, { q: -1 });
      return json(200, { ok: true, st: op === "accept" ? "friend" : "" });
    }
    if (op === "remove") {
      if (!d || (d.st !== "ok" && !(d.st === "req" && d.from === me))) return json(404, { error: "not on your list" });
      await settle(d, key); if (d.st === "req") await box(y, { q: -1 });
      return json(200, { ok: true, st: "" });
    }
    if (op === "block") {
      const rec = { ...pair, st: "none", from: "", blk: [...new Set([...blk, me])], at: now() };
      if (d) await setDoc(key, rec); else if (!(await commit([{ create: key, data: rec }])).ok) { await setDoc(key, rec); }
      if (d && d.st === "req") await box(d.from === me ? y : me, { q: -1 });
      // what they sent that you hadn't read goes away with the block
      const bx = await one(`worldDmBox/${me}`), n = Math.max(0, (bx && bx[`u_${y}`]) || 0); if (n) await box(me, { [`u_${y}`]: -n });
      return json(200, { ok: true, st: "blocked" });
    }
    if (op === "unblock") {
      if (!d || !blk.includes(me)) return json(404, { error: "you haven't blocked them" });
      await settle({ ...d, blk: blk.filter((x) => x !== me) }, key);
      return json(200, { ok: true, st: "" });
    }
    return json(400, { error: "unknown action" });
  }
  async function friends(b) {
    const s = signer(b); if (s.err) return s.err;
    const me = s.wallet, docs = [...(await query("a", me)), ...(await query("b", me))], rows = [];
    for (const d of docs) {
      const o = other(d, me), blk = d.blk || [];
      if (blk.includes(o)) continue; // they blocked you: not on your list at all
      const st = blk.includes(me) ? "blocked" : d.st === "ok" ? "friend" : d.st === "req" ? (d.from === me ? "out" : "in") : "";
      if (st) rows.push({ w: o, st, at: d.at || 0 });
    }
    const keys = rows.map((r) => `worldPres/${r.w}`), got = await getDocs([...keys, `worldDmBox/${me}`]), t = now();
    const out = rows.map((r) => { const p = got[`worldPres/${r.w}`]; return { w: r.w, st: r.st, n: (p && p.n) || "", lv: (p && p.lv) || 0, on: !!(p && t - p.at <= ONLINE_MS), seen: p ? Math.floor(p.at / 600e3) * 600e3 : 0 }; });
    // the order: requests to answer, friends (online first), requests you sent, the blocked
    const rank = { in: 0, friend: 1, out: 2, blocked: 3 };
    out.sort((x, y) => rank[x.st] - rank[y.st] || y.on - x.on || x.n.localeCompare(y.n));
    // the counter behind the badge drifts when a request is taken back; a look at the list sets it right
    const q = out.filter((x) => x.st === "in").length, bx = got[`worldDmBox/${me}`];
    if (bx && (bx.q || 0) !== q) await box(me, { q: q - (bx.q || 0) });
    return json(200, { friends: out, q }, "no-store");
  }
  // the ping writes this for a signed-in player (about every 3 minutes): the friends list shows a green dot while it's under 10 minutes old
  async function presence(who) { if (who && who.w) await setDoc(`worldPres/${who.w}`, { at: now(), n: who.name, lv: who.lv }); }

  // ---- private chat: friends only ----
  async function dmAccess(me, y) {
    const key = pairKey(me, y), d = await getDocs([`worldFriend/${key}`, `worldDm/${key}`]), f = d[`worldFriend/${key}`];
    return { key, ok: !!(f && f.st === "ok" && !(f.blk || []).length), dm: d[`worldDm/${key}`] };
  }
  async function dmSend(b) {
    const s = signer(b); if (s.err) return s.err;
    const me = s.wallet, y = lc(b.to); if (!isAddr(y) || y === me) return json(400, { error: "who is it?" });
    const m = chatClean(b.m); if (m === null) return json(400, { error: NO_LINE }); if (!m) return json(400, { error: "write something first" });
    const a = await dmAccess(me, y); if (!a.ok) return json(403, { error: "you can only message friends" });
    const lim = await spend(me); if (lim) return lim;
    const msg = { id: rid(), w: me, m, at: now() };
    if (!(await append(`worldDm/${a.key}`, `worldDmSlot/${a.key}_`, (cur) => ({ list: [...(cur.list || []), msg].slice(-DM_KEEP) })))) return json(429, { error: "try again in a second" });
    await box(y, { [`u_${me}`]: 1 });
    return json(200, { ok: true, msg: pub(msg) });
  }
  async function dmThread(b) {
    const s = signer(b); if (s.err) return s.err;
    const y = lc(b.with); if (!isAddr(y) || y === s.wallet) return json(400, { error: "who is it?" });
    const a = await dmAccess(s.wallet, y); if (!a.ok) return json(403, { error: "you can only message friends" });
    return json(200, { with: y, list: ((a.dm && a.dm.list) || []).map(pub) }, "no-store");
  }
  async function dmRead(b) {
    const s = signer(b); if (s.err) return s.err;
    const y = lc(b.with); if (!isAddr(y)) return json(400, { error: "who is it?" });
    const bx = await one(`worldDmBox/${s.wallet}`), n = Math.max(0, (bx && bx[`u_${y}`]) || 0);
    if (n) await box(s.wallet, { [`u_${y}`]: -n });
    return json(200, { ok: true });
  }
  async function dmUnread(b) {
    const s = signer(b); if (s.err) return s.err;
    const bx = (await one(`worldDmBox/${s.wallet}`)) || {}, from = {}; let dm = 0;
    for (const [k, v] of Object.entries(bx)) if (k.startsWith("u_") && v > 0 && isAddr(k.slice(2))) { from[k.slice(2)] = v; dm += v; }
    return json(200, { dm, from, q: Math.max(0, bx.q || 0) }, "no-store");
  }

  // ---- reports: a ticket for the team (not on the public board) ----
  const WHY = ["spam", "abuse", "scam", "other"];
  async function report(b) {
    const s = signer(b); if (s.err) return s.err;
    const me = s.wallet, y = lc(b.target); if (!isAddr(y) || y === me) return json(400, { error: "who is it?" });
    const why = WHY.includes(b.why) ? b.why : "other", dmKind = b.kind === "dm", ch = String(b.ch || "");
    if (!dmKind && !CH.test(ch)) return json(400, { error: "unknown place" });
    const day = seoulDay(now()), dk = `worldChatRepDay/${me}_${day}`;
    if ((((await one(dk)) || {}).n || 0) >= REP_DAY) return json(429, { error: "10 reports a day at most — thank you" });
    if (!(await commit([{ create: `worldChatRepSeen/${me}_${y}_${day}`, data: { at: now() } }])).ok) return json(200, { ok: true, again: true });
    const id = rid(), text = String(b.m == null ? "" : b.m).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
    // a private chat's last lines go with the report (the reporter is one of the two)
    let ctx = []; if (dmKind) { const a = await dmAccess(me, y); ctx = ((a.dm && a.dm.list) || []).slice(-6).map((x) => ({ w: x.w, m: x.m, at: x.at })); }
    await commit([{ create: `worldChatReport/${id}`, data: { id, kind: "report", where: dmKind ? "dm" : ch, target: y, reporter: me, why, m: text, ctx, at: now(), status: "open" } }]);
    await commit([{ inc: dk, fields: { n: 1 } }, { inc: `worldChatFlag/${y}`, fields: { n: 1 } }]);
    return json(200, { ok: true });
  }

  return {
    presence, bubble: (m) => chatClean(m, BUBBLE_MAX) || "",
    async read(view, url) {
      if (view === "chat") return local(url.searchParams.get("ch"));
      return null;
    },
    async handle(b) {
      if (b.action === "world-chat-say") return say(b);
      if (b.action === "world-chat-report") return report(b);
      if (b.action === "world-friends") return friends(b);
      if (b.action === "world-friend-request") return friendOp(b, "request");
      if (b.action === "world-friend-accept") return friendOp(b, "accept");
      if (b.action === "world-friend-decline") return friendOp(b, "decline");
      if (b.action === "world-friend-remove") return friendOp(b, "remove");
      if (b.action === "world-friend-block") return friendOp(b, "block");
      if (b.action === "world-friend-unblock") return friendOp(b, "unblock");
      if (b.action === "world-dm-send") return dmSend(b);
      if (b.action === "world-dm-thread") return dmThread(b);
      if (b.action === "world-dm-read") return dmRead(b);
      if (b.action === "world-dm-unread") return dmUnread(b);
      return null;
    },
  };
}
