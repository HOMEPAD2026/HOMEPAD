// api/_world-social.mjs — ARCIRCLE World's shared moments: guestbook notes on stamps, the weekly island contest,
// friends' cards, the wanderers you see in town (other players' last spots) and the weekly raid boss.
//
//   POST { action: "world-stamp-hide", …signature, at }   the island's owner hides (or shows again) one note
//   GET  ?world=island-week                               { week, top: [{ wallet, name, n, likes }] }  likes this week
//   GET  ?world=friends&wallets=0x…,…                     { friends: { wallet: { name, lv, seen, isle, likes } } }
//   GET  ?world=ghosts                                    { ghosts: [{ t, x, z, c, lv, s?, sa?, p?, h?, zn? }] }  (h: HP %, zn: the ground; signed-in only, for parties)  last 2 minutes (s: a fixed line said in the last minute; p: the tag of the friend who invited them)
//   GET  ?world=raid&wallet=0x…?                          { week, hp, max, down, top, mine, claimed, players, fellAt, next }
//   GET  ?world=raid-history                              { weeks: [{ week, players, max, dmg, fell, hours }] }  last 8
//   POST { action: "world-raid-hit", …signature, dmg }    damage dealt in the last 5 s, capped at 60 × saved level
//   POST { action: "world-raid-claim", …signature }       after the raid falls: a small ARCL thank-you, once a week
//   GET  ?world=players                                   { n, list: [{ w, name, lv, char, t, cx, at }] }  the directory, newest first
//   POST { action: "world-gift", …signature, to, kind, n } 1–3 potions (hp / sp) or up to 100 scrap; 5 a day; never ARCL
//   POST { action: "world-gifts-take", …signature }       { gifts } waiting for you, then cleared · GET ?world=gifts&wallet= { n }
//   POST { action: "world-stamp-reply", …signature, at, r } the owner answers a stamp with fixed reply r (0–5)
//   POST { action: "world-race", …signature, ms }         a hoverboard race time · GET ?world=race-top { week, top }
//   POST { action: "world-fish", …signature, fish, cm }   the week's biggest catches · GET ?world=fish-top { week, top }
//   POST { action: "world-bossrun", …signature, zone, ms } the week's fastest boss knock-outs · GET ?world=boss-top { week, top }
//   (world-ping with s = the sign-in: the wanderer shows your name and level, n / l / w in ?world=ghosts)
//
// The server can't watch a fight, so the raid trusts the game within a cap (one report per 5 s, 60 × level each) and
// its ARCL stays small (40 a week, inside the daily cap); the gear and XP are the game's own.
// A note is plain text, 60 characters, no links, no addresses and no long numbers; its island's owner can hide it.
// Firestore: worldIslandWeek/<week>_<wallet> { n } · worldStats/islandWeek_<week> { top }
//            worldStats/raid_<week> { dmg, players } · worldRaidDmg/<week>_<wallet> { n } · worldStats/raidTop_<week> { top, at }
//            worldRaidIn/<week>_<wallet> · worldRaidFell/<week> { at } · worldGhosts/<2-min window>_<shard 0–7> { list }
//            worldRaidGap/<week>_<wallet>_<slot> · worldRaidClaim/<week>_<wallet>
//            worldStats/players { list, n } · worldGifts/<wallet> { list } · worldGiftDay/<wallet>_<day> { n } · worldStats/race_<week> { top }
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
export const RAID_HP = 500000, RAID_ARCL = 40, RAID_MIN = 600, RAID_GAP = 5;
export const NOTE_MAX = 60;
/// the raid's HP: 25,000 for each raider who came last week, between 200,000 and 2,000,000 (500,000 with no history)
export const raidMax = (players) => (players > 0 ? Math.max(200000, Math.min(2000000, Math.round((players * 25000) / 50000) * 50000)) : RAID_HP);
/// the next Monday 00:00 in Seoul (when a new raid boss comes)
export const nextWeekAt = (t) => { const k = t + 9 * 3600e3, d = new Date(k), dow = (d.getUTCDay() + 6) % 7, day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return day0 + (7 - dow) * 864e5 - 9 * 3600e3; };
const CHARS = /^(bot|male-[a-f]|female-[a-f]|arc-(arc|neo|luna|kai|zen|rex|pixi|orbit|shadow|spark|mint|cici|byte|skye|ruby|titan|echo|nix|blaze|aqua|terra|volt|nova|frost|circa)|kk-(knight|mage|rogue|rogue-hooded|ranger|barbarian))$/; // arc-…: the ARC Bots (world-arcbots.js)

/// a guestbook note: "" when there's none, null when it can't be posted (a link, an address, a long number)
export function cleanNote(s) {
  const t = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>"'`\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
  if (!t) return "";
  if (/:\/\/|www\.|@\w|\b[a-z0-9-]{2,}\s*(\.|dot)\s*(com|net|org|io|xyz|app|gg|me|co|ly|link|site|top|info|fi|finance|so|to|cc|ai|sh|tv)\b/i.test(t)) return null;
  if (/0x[0-9a-f]{6,}/i.test(t) || /[1-9A-HJ-NP-Za-km-z]{30,}/.test(t) || /\d[\d\s-]{7,}\d/.test(t)) return null;
  if (/\b(t\.me|discord\.gg|telegram|whatsapp|dm me|seed phrase|private key|recovery phrase)\b/i.test(t)) return null;
  return t;
}
// a wanderer's tag: a short hash of the browser's id, so the game can skip its own and nothing traces back
export const tagOf = (id) => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h.toString(36).padStart(7, "0").slice(-7); };
// levels (the same numbers as world-rpg-data.js): the XP from one level to the next grows with the level. A save
// without xpv: 2 still counts XP the old way (100 a level) until the game converts it (xpFromOld), so its level holds.
export const XP_VERSION = 2;
// Levels 1–200 keep the curve they always had; past 200 each level costs 150 XP more than the one before (about 46,000
// at 200, 91,000 at 500), a long, steady climb to the cap. Nobody's level changes: below 200 the numbers are the same.
export const LV_MAX = 500, LV_BEND = 200;
const need0 = (lv) => 100 + 30 * (lv - 1) + (lv - 1) * (lv - 1);
const at0 = (lv) => { const n = Math.max(0, Math.floor(lv) - 1); return 100 * n + 15 * n * (n - 1) + ((n - 1) * n * (2 * n - 1)) / 6; };
export const xpNeed = (lv) => (lv < LV_BEND ? need0(lv) : need0(LV_BEND) + 150 * (lv - LV_BEND));
export const xpAt = (lv) => { const L = Math.floor(lv); if (L <= LV_BEND) return at0(L); const m = L - LV_BEND; return at0(LV_BEND) + m * need0(LV_BEND) + 75 * m * (m - 1); };
export const XP_MAX = xpAt(LV_MAX);
export const levelOfXp = (xp) => { const v = Math.max(0, Number(xp) || 0); let lo = 1, hi = LV_MAX; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xpAt(mid) <= v) lo = mid; else hi = mid - 1; } return lo; };
export const xpFromOld = (xp) => { const v = Math.max(0, Math.floor(Number(xp) || 0)), lv = 1 + Math.floor(v / 100); return xpAt(lv) + Math.floor(((v % 100) / 100) * xpNeed(lv)); };
/// a saved player's level, whichever curve its save is on
export const levelOfSave = (sv) => (!sv ? 1 : sv.xpv === XP_VERSION ? levelOfXp(sv.xp) : Math.min(LV_MAX, 1 + Math.floor((Number(sv.xp) || 0) / 100)));
export const levelOf = (xp) => levelOfXp(xp);
// how fast XP may climb on the server (api/_world.mjs save). The game runs in the browser, so the server can't watch
// a fight; it bounds the pace instead. xpPerMin: about 30 knock-outs a minute of the strongest scammers within reach,
// on a 1.5x event day; real play stays well under it. The allowance refills at that pace into a bank holding up to
// 30 minutes of it (plus room for rewards that land at once), a day brings at most 4 hours of it, and a first save
// (progress from before signing in) brings at most level 30. A save asking for more is cut to what's allowed, and
// the cut is noted (worldXpFlag/<wallet>) for the team to look at.
export const xpPerMin = (lv) => Math.round(45 * (6 + 3 * Math.min(110, Math.max(1, lv) + 10)));
export const XP_RULES = { burst: 3000, bankMin: 30, dayMin: 240, firstLv: 30 };
export const xpBankCap = (lv) => XP_RULES.burst + xpPerMin(lv) * XP_RULES.bankMin;

/// deps: { getDocs, setDoc, commit, json, now, signer, isoWeek, credit(w, kind, n), lists() }
export function makeSocial(deps) {
  const { getDocs, setDoc, commit, json, signer, isoWeek } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];

  // ---- the weekly island contest: likes given this week ----
  async function weekLike(target, isl) {
    const wk = isoWeek(now()), mk = `worldIslandWeek/${wk}_${target}`;
    await commit([{ inc: mk, fields: { n: 1 } }]);
    const mine = ((await one(mk)) || {}).n || 1, key = `worldStats/islandWeek_${wk}`, cur = (await one(key)) || { top: [] };
    const top = [{ wallet: target, name: (isl && isl.name) || "", n: (isl && isl.n) || 0, likes: mine }, ...(cur.top || []).filter((x) => x.wallet !== target)].sort((a, b) => b.likes - a.likes).slice(0, 12);
    await setDoc(key, { top });
  }
  async function islandWeek() {
    const wk = isoWeek(now());
    return json(200, { week: wk, top: ((await one(`worldStats/islandWeek_${wk}`)) || {}).top || [] }, "public, max-age=30");
  }

  // ---- the player directory: everyone who saved with a wallet, newest first (name, level, character, title, codex) ----
  // One small document (worldStats/players, up to 400 rows), rewritten on a save only when a row changes or every 15 min.
  const DIR_MAX = 400, TITLE_ID = /^[a-z0-9]{1,12}$/;
  async function dirUpdate(w, sv) {
    if (!isAddr(w) || !sv) return;
    const x = (sv.rpg && sv.rpg.x) || {};
    const row = { w, name: String(sv.name || "").slice(0, 16), lv: levelOfSave(sv), char: String(sv.char || "").slice(0, 16), t: TITLE_ID.test(String(x.title || "")) ? x.title : "", cx: Math.min(99, Object.keys(x.seen || {}).length + (Array.isArray(sv.beaten) ? sv.beaten.length : 0)), at: now() };
    const key = "worldStats/players", cur = (await one(key)) || { list: [] }, old = (cur.list || []).find((y) => y.w === w);
    if (old && now() - (old.at || 0) < 15 * 60e3 && ["name", "lv", "char", "t", "cx"].every((k) => old[k] === row[k])) return;
    const list = [row, ...(cur.list || []).filter((y) => y.w !== w)].slice(0, DIR_MAX);
    await setDoc(key, { list, n: Math.max(list.length, cur.n || 0) });
  }
  async function players() {
    const d = (await one("worldStats/players")) || { list: [] };
    return json(200, { n: d.n || (d.list || []).length, list: (d.list || []).map((r) => ({ ...r, at: Math.floor((r.at || 0) / 600e3) * 600e3 })) }, "public, max-age=30");
  }

  // ---- gifts between players: potions and scrap only (never ARCL), five a day, the receiver collects them ----
  const GIFT = { hp: 3, sp: 3, scrap: 100 }, GIFTS_A_DAY = 5;
  const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  async function gift(b) {
    const s = signer(b); if (s.err) return s.err;
    const to = lc(b.to), kind = String(b.kind || ""), n = Math.floor(Number(b.n));
    if (!isAddr(to) || to === s.wallet) return json(400, { error: "who is it for?" });
    if (!GIFT[kind] || !(n >= 1 && n <= GIFT[kind])) return json(400, { error: "gifts are 1–3 potions or up to 100 scrap" });
    const d = await getDocs([`worldSave/${to}`, `worldSave/${s.wallet}`, `worldGiftDay/${s.wallet}_${seoulDay(now())}`]);
    if (!d[`worldSave/${to}`]) return json(404, { error: "that wallet hasn't played yet" });
    if (((d[`worldGiftDay/${s.wallet}_${seoulDay(now())}`] || {}).n || 0) >= GIFTS_A_DAY) return json(429, { error: "five gifts a day — more tomorrow" });
    await commit([{ inc: `worldGiftDay/${s.wallet}_${seoulDay(now())}`, fields: { n: 1 } }]);
    const key = `worldGifts/${to}`, cur = (await one(key)) || { list: [] };
    const g = { id: now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), from: s.wallet, name: String((d[`worldSave/${s.wallet}`] || {}).name || "").slice(0, 16), kind, n, at: now() };
    await setDoc(key, { list: [...(cur.list || []), g].slice(-30) });
    return json(200, { ok: true, gift: g });
  }
  async function giftsTake(b) {
    const s = signer(b); if (s.err) return s.err;
    const key = `worldGifts/${s.wallet}`, cur = (await one(key)) || { list: [] }, list = cur.list || [];
    if (list.length) await setDoc(key, { list: [] });
    return json(200, { ok: true, gifts: list });
  }
  async function giftsCount(w) { return json(200, { n: isAddr(w) ? (((await one(`worldGifts/${w}`)) || {}).list || []).length : 0 }, "no-store"); }

  // ---- hoverboard race on the plaza: the week's best times (a time is self-reported, so it only ranks; no rewards) ----
  const RACE_MIN_MS = 9000, RACE_MAX_MS = 600e3;
  async function raceTime(b) {
    const s = signer(b); if (s.err) return s.err;
    const ms = Math.floor(Number(b.ms)); if (!(ms >= RACE_MIN_MS && ms <= RACE_MAX_MS)) return json(400, { error: "that time doesn't look right" });
    const wk = isoWeek(now()), key = `worldStats/race_${wk}`, cur = (await one(key)) || { top: [] };
    const sv = await one(`worldSave/${s.wallet}`), old = (cur.top || []).find((x) => x.w === s.wallet);
    if (old && old.ms <= ms) return json(200, { ok: true, best: old.ms, top: (cur.top || []).map(pubRace) });
    const top = [{ w: s.wallet, name: String((sv || {}).name || "").slice(0, 16), ms, at: now() }, ...(cur.top || []).filter((x) => x.w !== s.wallet)].sort((a, c) => a.ms - c.ms).slice(0, 20);
    await setDoc(key, { top });
    return json(200, { ok: true, best: ms, top: top.map(pubRace) });
  }
  const pubRace = ({ w, name, ms }) => ({ w: w.slice(0, 6) + "…" + w.slice(-4), name: name || "", ms });
  async function raceTop() { const wk = isoWeek(now()); return json(200, { week: wk, top: (((await one(`worldStats/race_${wk}`)) || {}).top || []).map(pubRace) }, "public, max-age=20"); }

  // ---- the week's records: the biggest fish and the fastest boss knock-out (self-reported like the race, so they only
  // rank: honour, no rewards). Sizes and times outside what the game can produce are refused. ----
  const FISH_MAX = { guppy: 14, minnow: 18, carp: 55, eel: 90, whale: 160, koi: 70, cod: 80, snapper: 60, angler: 110, barb: 50, sturgeon: 150, ray: 130, leviathan: 300 };
  const BOSS_ZONES = new Set(["spam", "fields", "swamp", "canyon", "depths", "peaks", "dunes", "reef", "wastes", "ruins", "abyss", "void"]);
  const BOSS_MIN_MS = 8000, BOSS_MAX_MS = 1800e3;
  async function recordPut(b, kind) {
    const s = signer(b); if (s.err) return s.err;
    let e;
    if (kind === "fish") { const id = String(b.fish || ""), cm = Math.floor(Number(b.cm)); if (!FISH_MAX[id] || !(cm >= 1 && cm <= FISH_MAX[id])) return json(400, { error: "that catch doesn't look right" }); e = { fish: id, v: cm }; }
    else { const zn = String(b.zone || ""), ms = Math.floor(Number(b.ms)); if (!BOSS_ZONES.has(zn) || !(ms >= BOSS_MIN_MS && ms <= BOSS_MAX_MS)) return json(400, { error: "that time doesn't look right" }); e = { zone: zn, v: ms }; }
    const better = (a, c) => (kind === "fish" ? a.v > c.v : a.v < c.v);
    const wk = isoWeek(now()), key = `worldStats/${kind}_${wk}`, cur = (await one(key)) || { top: [] };
    const old = (cur.top || []).find((x) => x.w === s.wallet);
    if (old && !better(e, old)) return json(200, { ok: true, best: old.v, top: (cur.top || []).map(pubRec) });
    const sv = await one(`worldSave/${s.wallet}`);
    const top = [{ w: s.wallet, name: String((sv || {}).name || "").slice(0, 16), ...e, at: now() }, ...(cur.top || []).filter((x) => x.w !== s.wallet)].sort((a, c) => (kind === "fish" ? c.v - a.v : a.v - c.v)).slice(0, 20);
    await setDoc(key, { top });
    return json(200, { ok: true, best: e.v, top: top.map(pubRec) });
  }
  const pubRec = ({ w, name, v, fish, zone }) => ({ w: w.slice(0, 6) + "…" + w.slice(-4), name: name || "", v, ...(fish ? { fish } : {}), ...(zone ? { zone } : {}) });
  async function recordTop(kind) { const wk = isoWeek(now()); return json(200, { week: wk, top: (((await one(`worldStats/${kind}_${wk}`)) || {}).top || []).map(pubRec) }, "public, max-age=20"); }

  // ---- guestbook: the owner answers a stamp with one of a few fixed replies ----
  const REPLIES = 6;
  async function stampReply(b) {
    const s = signer(b); if (s.err) return s.err;
    const at = Math.floor(Number(b.at)), r = Math.floor(Number(b.r)); if (!(at > 0) || !(r >= 0 && r < REPLIES)) return json(400, { error: "which note, which reply?" });
    const key = `worldStamps/${s.wallet}`, cur = (await one(key)) || { list: [] };
    let found = false;
    const list = (cur.list || []).map((x) => { if (x.at !== at) return x; found = true; return { ...x, r }; });
    if (!found) return json(404, { error: "no such note on your island" });
    await setDoc(key, { list });
    return json(200, { ok: true, stamps: list.slice(-20) });
  }

  // ---- guestbook: the owner hides a note ----
  async function stampHide(b) {
    const s = signer(b); if (s.err) return s.err;
    const at = Math.floor(Number(b.at)); if (!(at > 0)) return json(400, { error: "which note?" });
    const key = `worldStamps/${s.wallet}`, cur = (await one(key)) || { list: [] };
    let found = false;
    const list = (cur.list || []).map((x) => { if (x.at !== at) return x; found = true; return { ...x, h: x.h ? 0 : 1 }; });
    if (!found) return json(404, { error: "no such note on your island" });
    await setDoc(key, { list });
    return json(200, { ok: true, stamps: list.slice(-20) });
  }

  // ---- friends: what a friend's card shows (their save's name and level, about when they last played — to the
// 10 minutes — and their island) ----
  const showGear = (sv) => {
    const eq = (sv && sv.rpg && sv.rpg.eq) || {};
    return ["weapon", "shield", "helm", "armor", "boots", "ring", "necklace"].map((s) => eq[s]).filter((it) => it && /^[a-z]+-[0-4]$/.test(String(it.b))).map((it) => ({ id: /^[a-z0-9]{4,10}$/.test(String(it.id)) ? it.id : "", b: it.b, r: Math.max(0, Math.min(4, Number(it.r) || 0)), p: Math.max(0, Math.min(10, Number(it.p) || 0)), ...(Number.isInteger(it.k) ? { k: it.k } : {}) }));
  };
  async function friends(wallets) {
    const list = [...new Set(String(wallets || "").split(",").map(lc).filter(isAddr))].slice(0, 30);
    const keys = list.flatMap((w) => [`worldSave/${w}`, `worldIsland/${w}`, `worldIslandLikes/${w}`, `worldCrewOf/${w}`]);
    const d = list.length ? await getDocs(keys) : {}, out = {};
    // the crews they're in (for the tag on the card)
    const cids = [...new Set(list.map((w) => (d[`worldCrewOf/${w}`] || {}).id).filter((x) => /^[0-9a-f]{12}$/.test(String(x || ""))))];
    const cd = cids.length ? await getDocs(cids.map((id) => `worldCrew/${id}`)) : {};
    for (const w of list) {
      const sv = d[`worldSave/${w}`] || null, isl = d[`worldIsland/${w}`] || null, x = (sv && sv.rpg && sv.rpg.x) || {};
      const cr = cd[`worldCrew/${(d[`worldCrewOf/${w}`] || {}).id}`], crew = cr && !cr.closed && (cr.members || []).includes(w) ? cr.tag : "";
      out[w] = { name: (sv && sv.name) || "", lv: sv ? levelOfSave(sv) : 0, seen: sv && sv.at ? Math.floor(sv.at / 600e3) * 600e3 : 0, char: (sv && sv.char) || "", isle: isl ? isl.n || 0 : 0, likes: (d[`worldIslandLikes/${w}`] || {}).n || 0,
        // the showcase: the titles they've earned and wear, and the gear they have on (slot, rarity, tier, +, weapon kind)
        ach: (Array.isArray(x.ach) ? x.ach : []).filter((a) => TITLE_ID.test(String(a))).slice(0, 40), t: TITLE_ID.test(String(x.title || "")) ? x.title : "", st: x.stitle ? 1 : 0,
        gear: showGear(sv), ...(crew ? { cr: crew } : {}) };
    }
    return json(200, { friends: out }, "no-store");
  }

  // ---- wanderers: where players were in the last two minutes (no names: the ping isn't signed) ----
  const GHOST_LIFE = 120e3, GHOST_SHARDS = 8;
  async function ghostPing(id, g, who = null) {
    if (!g || typeof g !== "object") return;
    const x = Math.round(Number(g.x) * 10) / 10, z = Math.round(Number(g.z) * 10) / 10;
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > 150) return;
    const t = tagOf(id), c = CHARS.test(String(g.c || "")) ? g.c : "bot", lv = Math.max(1, Math.min(99, Math.floor(Number(g.lv) || 1)));
    // eight small documents per 2-minute window, picked by the tag, so pings from many players don't queue on one
    const at = now(), key = `worldGhosts/${Math.floor(at / GHOST_LIFE)}_${parseInt(t, 36) % GHOST_SHARDS}`, cur = (await one(key)) || { list: [] };
    // a line from the fixed list (0–7, shown for a minute; there's no free text to moderate) and a friend's tag from an invite link
    const s = Number.isInteger(g.s) && g.s >= 0 && g.s < 8 ? g.s : null, p = /^[0-9a-z]{7}$/.test(String(g.p || "")) ? g.p : "";
    // for a hunting party: HP as a percentage and the ground you're in (shown to the friends who put you in theirs)
    const h = Number.isInteger(g.h) && g.h >= 0 && g.h <= 100 ? g.h : null, zn = /^[a-z]{3,8}$/.test(String(g.zn || "")) ? g.zn : "";
    const old = (cur.list || []).find((y) => y.t === t) || {};
    const e = { t, x, z, c, lv, at, ...(s != null ? { s, sa: at } : old.sa && at - old.sa < 60e3 ? { s: old.s, sa: old.sa } : {}), ...(p ? { p } : {}), ...(h != null ? { h } : {}), ...(zn ? { zn } : {}), ...(who && who.name ? { n: who.name, l: who.lv, w: who.w, ...(who.tag ? { cr: who.tag } : {}) } : {}) };
    const list = [e, ...(cur.list || []).filter((y) => y.t !== t)].slice(0, 8);
    await setDoc(key, { list });
  }
  async function ghosts() {
    const at = now(), w = Math.floor(at / GHOST_LIFE), keys = [];
    for (const win of [w, w - 1]) for (let i = 0; i < GHOST_SHARDS; i++) keys.push(`worldGhosts/${win}_${i}`);
    const d = await getDocs(keys), seen = new Map();
    for (const k of keys) for (const y of ((d[k] || {}).list || [])) if (at - y.at < GHOST_LIFE && (!seen.has(y.t) || seen.get(y.t).at < y.at)) seen.set(y.t, y);
    return json(200, { ghosts: [...seen.values()].sort((a, b) => b.at - a.at).slice(0, 24).map(({ t, x, z, c, lv, s, sa, p, n, l, w, h, zn }) => ({ t, x, z, c, lv, ...(sa && at - sa < 60e3 ? { s, sa } : {}), ...(p ? { p } : {}), ...(n ? { n, l, w } : {}), ...(h != null && n ? { h } : {}), ...(zn && n ? { zn } : {}) })) }, "public, max-age=10");
  }

  // ---- the weekly raid boss ----
  async function raidState(w) {
    const wk = isoWeek(now()), prev = isoWeek(now() - 7 * 864e5);
    const keys = [`worldStats/raid_${wk}`, `worldStats/raid_${prev}`, `worldStats/raidTop_${wk}`, `worldRaidFell/${wk}`, ...(w ? [`worldRaidDmg/${wk}_${w}`, `worldRaidClaim/${wk}_${w}`] : [])];
    const d = await getDocs(keys), R = d[`worldStats/raid_${wk}`] || {}, dmg = R.dmg || 0;
    const max = raidMax((d[`worldStats/raid_${prev}`] || {}).players || 0), fell = d[`worldRaidFell/${wk}`] || null;
    return { week: wk, max, hp: Math.max(0, max - dmg), down: dmg >= max, players: R.players || 0, fellAt: fell ? fell.at : 0, next: nextWeekAt(now()), top: ((d[`worldStats/raidTop_${wk}`] || {}).top || []).slice(0, 10), mine: w ? (d[`worldRaidDmg/${wk}_${w}`] || {}).n || 0 : 0, claimed: w ? !!d[`worldRaidClaim/${wk}_${w}`] : false, need: RAID_MIN, arcl: RAID_ARCL };
  }
  async function raidHit(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, wk = isoWeek(now());
    const st = await raidState(w); if (st.down) return json(200, { ok: true, ...pub(st), counted: 0 });
    const lv = levelOfSave(await one(`worldSave/${w}`));
    if (lv < 10) return json(400, { error: "the raid is for level 10 and up (your saved level is " + lv + ")" });
    const slot = Math.floor(now() / (RAID_GAP * 1000));
    if (!(await commit([{ create: `worldRaidGap/${wk}_${w}_${slot}`, data: { at: now() } }])).ok) return json(429, { error: "one report every 5 seconds" });
    const n = Math.max(0, Math.min(60 * lv, Math.floor(Number(b.dmg) || 0), st.hp));
    if (!n) return json(200, { ok: true, ...pub(st), counted: 0 });
    await commit([{ inc: `worldStats/raid_${wk}`, fields: { dmg: n } }, { inc: `worldRaidDmg/${wk}_${w}`, fields: { n } }]);
    // this week's raiders (next week's HP follows how many came)
    if ((await commit([{ create: `worldRaidIn/${wk}_${w}`, data: { at: now() } }])).ok) await commit([{ inc: `worldStats/raid_${wk}`, fields: { players: 1 } }]).catch(() => {});
    if (st.hp - n <= 0) await commit([{ create: `worldRaidFell/${wk}`, data: { at: now() } }]).catch(() => {});
    try {
      // the top list is rewritten only when it changes who's on it, or every 30 s for a raider already there
      const mine = st.mine + n, key = `worldStats/raidTop_${wk}`, cur = (await one(key)) || { top: [] }, list = cur.top || [];
      const inTop = list.some((x) => x.id === w), qualifies = list.length < 20 || mine > list[list.length - 1].n;
      if (qualifies && (!inTop || now() - (cur.at || 0) > 30e3 || st.hp - n <= 0)) {
        const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
        const top = [{ w: short(w), id: w, n: mine, name }, ...list.filter((x) => x.id !== w)].sort((a, c) => c.n - a.n).slice(0, 20);
        await setDoc(key, { top, at: now() });
      }
    } catch { /* the damage counts anyway */ }
    return json(200, { ok: true, counted: n, ...pub(await raidState(w)) });
  }
  async function raidClaim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, st = await raidState(w);
    if (!st.down) return json(400, { error: "the raid boss is still standing" });
    if (st.mine < RAID_MIN) return json(400, { error: `hit the raid boss for at least ${RAID_MIN} damage to share the reward` });
    if (!(await commit([{ create: `worldRaidClaim/${st.week}_${w}`, data: { at: now() } }])).ok) return json(409, { error: "already claimed this week" });
    const got = deps.credit ? await deps.credit(w, "raid", RAID_ARCL) : 0;
    return json(200, { ok: true, credited: got, ...pub(await raidState(w)) });
  }
  // the last eight raids: how many came, the HP, whether it fell and how long it took (no wallets)
  async function raidHistory() {
    const weeks = []; for (let i = 1; i <= 8; i++) weeks.push([isoWeek(now() - i * 7 * 864e5), isoWeek(now() - (i + 1) * 7 * 864e5), nextWeekAt(now() - i * 7 * 864e5) - 7 * 864e5]);
    const d = await getDocs(weeks.flatMap(([w, p]) => [`worldStats/raid_${w}`, `worldStats/raid_${p}`, `worldRaidFell/${w}`]));
    return json(200, { weeks: weeks.map(([w, p, start]) => { const R = d[`worldStats/raid_${w}`] || {}, f = d[`worldRaidFell/${w}`]; return { week: w, players: R.players || 0, max: raidMax((d[`worldStats/raid_${p}`] || {}).players || 0), dmg: R.dmg || 0, fell: !!f, hours: f ? Math.max(0, Math.round((f.at - start) / 3600e3)) : null }; }).filter((x) => x.players || x.dmg) }, "public, max-age=300");
  }
  const pub = (st) => ({ ...st, top: st.top.map(({ w: s, n, name }) => ({ w: s, n, name: name || "" })) });

  return {
    weekLike, ghostPing, dirUpdate,
    async read(view, url) {
      if (view === "island-week") return islandWeek();
      if (view === "friends") return friends(url.searchParams.get("wallets"));
      if (view === "ghosts") return ghosts();
      if (view === "raid-history") return raidHistory();
      if (view === "players") return players();
      if (view === "race-top") return raceTop();
      if (view === "fish-top") return recordTop("fish");
      if (view === "boss-top") return recordTop("boss");
      if (view === "gifts") return giftsCount(lc(url.searchParams.get("wallet")));
      if (view === "raid") { const w = lc(url.searchParams.get("wallet")); return json(200, pub(await raidState(isAddr(w) ? w : "")), isAddr(w) ? "no-store" : "public, max-age=10"); }
      return null;
    },
    async handle(b) {
      if (b.action === "world-stamp-hide") return stampHide(b);
      if (b.action === "world-stamp-reply") return stampReply(b);
      if (b.action === "world-gift") return gift(b);
      if (b.action === "world-gifts-take") return giftsTake(b);
      if (b.action === "world-race") return raceTime(b);
      if (b.action === "world-fish") return recordPut(b, "fish");
      if (b.action === "world-bossrun") return recordPut(b, "boss");
      if (b.action === "world-raid-hit") return raidHit(b);
      if (b.action === "world-raid-claim") return raidClaim(b);
      return null;
    },
  };
}
