// api/_world.mjs — ARCIRCLE World (/play) on the server: sign in with a wallet, progress saved per wallet, and the
// counts shown in the game and on the home gate (who's in the world now, how many have visited).
//
//   POST /api/social { action: "world-ping", id }                         presence + first-visit count → stats
//   POST /api/social { action: "world-login", wallet, issued, signature } signed sign-in → { save } (first sign-in counts a player)
//   POST /api/social { action: "world-save", wallet, issued, signature, data }  progress for that wallet (same signature, 24 h)
//   GET  /api/social?world=stats                                          { online, visitors, players }
//
// Islands (world-island.js): a build is bytes in base64 — [1, N] then 5 bytes a brick — checked for shape here.
//   POST { action: "world-island-save", wallet, issued, signature, data, name, n, res }   your island (36×36)
//   POST { action: "world-like", …signature, target }        one like per wallet per island, for good
//   POST { action: "world-stamp", …signature, target, k, msg? }  a preset stamp and an optional 60-character note
//                                                             (no links or addresses; api/_world-social.mjs), one a day per island
//   POST { action: "world-lot-save", …signature, coin, data }  a coin's lot (b-lpv: by tier, 16/24/36/48; the old 9×9 / 13×13 too), its creator only
//   POST { action: "world-lot-tier", coin }                    { tier, N, max } the lot's size now (the biggest it has reached)
//   GET  ?world=island&wallet=0x…   { data, name, n, at, likes, stamps }
//   GET  ?world=islands             { top, recent }  (worldStats/islands, kept up to date on save and like)
//   GET  ?world=lots&coins=0x…,…    { lots: { coin: { data, at } } }
//
// The signature is a free personal_sign of loginMessage(); it proves the wallet and moves nothing. It's kept in the
// player's browser for 24 h and sent with each save, so a save never needs another wallet pop-up.
// "Online" counts distinct visitors per 2-minute window (create-only marker + increment), the larger of this window
// and the last one. Progress is self-reported by the game, so it's for play (character, XP, quests), never rewards.
// Firestore: worldIsland/<wallet> · worldIslandLikes/<wallet> { n } · worldLikes/<target>_<wallet> · worldStamps/<wallet> { list }
//            worldStampSeen/<target>_<wallet>_<day> · worldLot/<coin> · worldStats/islands { top, recent }
// AC Defense, the plaza tower-defence game: api/_world-defense.mjs. Coin Jump's crown reward: api/_world-jump.mjs.
// Notes, the weekly island contest, friends' cards, wanderers and the raid boss: api/_world-social.mjs.
// Local chat, the friends graph (requests, blocks) and private chat: api/_world-chat.mjs.
// Bounties, party quests, the village rankings (week / month / all time) and their prizes: api/_world-rank.mjs.
// Firestore: worldStats/main { visitors, players } · worldCounted/<wallet> (counted once in players) · worldOnline/<window> { n } · worldSeen/<window>_<id> · worldVisitors/<id>
//            worldPlayers/<wallet> · worldSave/<wallet>
import { makeShop, FEE_BURN, BAG_BASE, BAG_MAX, bagSize, DUR_MAX, durOf, weekendK } from "./_world-shop.mjs";
import { makeSupport } from "./_world-support.mjs";
import { makeChat } from "./_world-chat.mjs";
import { makeCrew } from "./_world-crew.mjs";
import { makeRank, RANK_MIN_LV } from "./_world-rank.mjs";
import { makeVillage, isGM } from "./_world-village.mjs";
import { makeDefense } from "./_world-defense.mjs";
import { makeJump } from "./_world-jump.mjs";
import { makeMine } from "./_world-mine.mjs";
import { makeWelcome } from "./_world-welcome.mjs";
import { makeJur } from "./_world-jur.mjs";
import { makeAgentDim, AGENT } from "./_world-agent.mjs";
import { makeStudio, STUDIO } from "./_world-studio.mjs";
import { makeAgArena } from "./_world-agarena.mjs";
import { makeAgentVault } from "./_world-agentvault.mjs";
import { makeSwap } from "./_world-swap.mjs";
import { makeSurvivors } from "./_world-survivors.mjs";
import { makeHalloween } from "./_world-halloween.mjs";
import { makeRaidQueens } from "./_world-raidq.mjs";
import { makeMythic } from "./_world-mythic.mjs";
import { makeRings } from "./_world-rings.mjs";
import { makePoker } from "./_world-poker.mjs";
import { makeDino } from "./_world-dino.mjs";
import { makeLaunch } from "./_world-launch.mjs";
import { makeRefer } from "./_world-refer.mjs";
import { makeGmReward } from "./_world-gmreward.mjs";
import { makeLand, LAND } from "./_world-land.mjs";
import { makeLedger } from "./_world-ledger.mjs";
import { makeMarket } from "./_world-market.mjs";
import { makeCoins } from "./_world-coins.mjs";
import { makeLots, LOT_TIERS } from "./_world-lots.mjs";
import { makeCodex } from "./_world-codex.mjs";
import { scopeStore, cbtItems, CBT_REWARD } from "./_world-phase.mjs";
import { makeSocial, cleanNote, XP_VERSION, XP_MAX, xpFromOld, levelOfSave, levelOfXp, xpAt, xpPerMin, xpBankCap, XP_RULES } from "./_world-social.mjs";
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const WINDOW = 120e3;
// Game World's beta: wallets holding at least this much $ARCIRCLE (on Arc) may enter (world-lock.js asks)
export const GATE_MIN = 1000000n;
const ARCIRCLE_TOKEN = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
const CHARS = new Set(["bot", ..."abcdef".split("").map((c) => "male-" + c), ..."abcdef".split("").map((c) => "female-" + c), ..."arc|neo|luna|kai|zen|rex|pixi|orbit|shadow|spark|mint|cici|byte|skye|ruby|titan|echo|nix|blaze|aqua|terra|volt|nova|frost|circa".split("|").map((c) => "arc-" + c), ..."knight|mage|rogue|rogue-hooded|ranger|barbarian".split("|").map((c) => "kk-" + c)]); // arc-…: the ARC Bots (world-arcbots.js)
const CUSTOM_CHAR = /^custom-[a-z0-9-]{1,9}$/; // your own characters (world-kit.js CUSTOM_CHARS); a client without the file shows the hover bot

export const loginMessage = (wallet, issued) =>
  `ARCIRCLE World — sign in\n\nWallet: ${lc(wallet)}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;

const ids = (a, re, max) => (Array.isArray(a) ? [...new Set(a.map(String).filter((x) => re.test(x)))].slice(0, max) : []);
/// what the game may store: anything else is dropped
// the character's gear and supplies (world-rpg.js): items are { id, b (slot-tier), r (rarity 0–4), lv, p (+0–10) }
const cleanItem = (x) => (x && typeof x === "object" && /^[a-z0-9]{4,10}$/.test(String(x.id)) && /^(weapon|shield|armor|helm|ring|boots|necklace)-[0-4]$/.test(String(x.b))
  ? { id: String(x.id), b: String(x.b), r: Math.max(0, Math.min(4, Math.floor(Number(x.r) || 0))), lv: Math.max(1, Math.min(100, Math.floor(Number(x.lv) || 1))), p: Math.max(0, Math.min(10, Math.floor(Number(x.p) || 0))),
      // a weapon's chosen kind (world-gear3d.js: 0 swords … 4 staff) and a piece's lock
      ...(String(x.b).startsWith("weapon-") && Number.isInteger(x.k) && x.k >= 0 && x.k <= 4 ? { k: x.k } : {}), ...(x.lk ? { lk: 1 } : {}),
      // a weapon's temper stage (world-life.js workbench): 1–5
      ...(String(x.b).startsWith("weapon-") && Number.isInteger(x.tm) && x.tm >= 1 && x.tm <= 5 ? { tm: x.tm } : {}),
      // a one-of-a-kind piece's name (world-rpg-data.js UNIQUE: the Halloween Pumpkin King's "jack")
      ...(x.u === "jack" && String(x.b).startsWith("weapon-") ? { u: "jack" } : {}),
      // durability left on an Epic or Legendary piece (absent = full; 0 = broken); world-rpg-data.js DUR_MAX
      ...(DUR_MAX[Math.max(0, Math.min(4, Math.floor(Number(x.r) || 0)))] && Number.isInteger(x.du) && x.du >= 0 && x.du < DUR_MAX[Math.max(0, Math.min(4, Math.floor(Number(x.r) || 0)))] ? { du: x.du } : {}) } : null);
// a weapon's kind when none was chosen: settled by its id (world-gear3d.js weaponKind, the same hash)
export const idKind = (id) => { let h = 7; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 5; };
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
function cleanRpg(r) {
  if (!r || typeof r !== "object") return undefined;
  const eq = {}; for (const k of ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"]) { const it = cleanItem(r.eq && r.eq[k]); if (it && it.b.startsWith(k + "-")) eq[k] = it; }
  const bag = (Array.isArray(r.bag) ? r.bag : []).map(cleanItem).filter(Boolean).slice(0, BAG_MAX); // trimmed to the player's own size on save
  const store = (Array.isArray(r.store) ? r.store : []).map(cleanItem).filter(Boolean).slice(0, 48); // storage (world-rpg.js STORE)
  const extra = r.x && typeof r.x === "object" ? JSON.parse(JSON.stringify(r.x)) : undefined; // quests, achievements, codex, companions, season, friends, skill branches
  return { eq, bag, store, scrap: num(r.scrap, 1e7), hp: num(r.hp, 999), sp: num(r.sp, 999), recall: num(r.recall, 99), starter: r.starter ? 1 : 0, sk: /^(ice|fire|shock|meteor)$/.test(String(r.sk || "")) ? r.sk : "", ...(extra && JSON.stringify(extra).length < 16000 ? { x: extra } : {}) }; // quests, codex, fish, trophies…: room to grow
}
// the ARC Bot wardrobe: one part per place, and an accent colour (world-arcbots.js WARDROBE)
const OUTFIT_SLOTS = ["head", "face", "neck", "back", "aura"];
function cleanOutfit(o) {
  const wear = {}; const w = o.wear && typeof o.wear === "object" ? o.wear : {};
  for (const sl of OUTFIT_SLOTS) if (typeof w[sl] === "string" && /^[a-z]{2,12}$/.test(w[sl])) wear[sl] = w[sl];
  return { wear, accent: /^[0-9a-f]{6}$/i.test(String(o.accent || "")) ? String(o.accent).toLowerCase() : "" };
}
export function cleanSave(d) {
  const o = d && typeof d === "object" ? d : {};
  // XP on the rising level curve (xpv 2); a save from an older game (100 XP a level) is converted so its level holds
  const xp = Math.max(0, Math.min(XP_MAX, Math.floor(o.xpv === XP_VERSION ? Number(o.xp) || 0 : xpFromOld(o.xp))));
  const name = String(o.name || "").replace(/[\u0000-\u001f<>"'`\\]/g, "").replace(/\[\s*g\s*m\s*\]/gi, "").trim().slice(0, 16); // [GM] comes from the wallet, never the name
  return {
    xp, xpv: XP_VERSION, name, char: CHARS.has(o.char) || CUSTOM_CHAR.test(String(o.char || "")) ? o.char : "", ...(Number.isInteger(o.tint) && o.tint >= 0 && o.tint < 8 ? { tint: o.tint } : {}), /* b447: the hero's colour (0 = its own blue) */ ...(o.rpg ? { rpg: cleanRpg(o.rpg) } : {}),
    visited: ids(o.visited, /^[a-z0-9-]{1,24}$/, 40), beaten: ids(o.beaten, /^[a-z0-9-]{1,24}$/, 20),
    cards: ids(o.cards, /^c\d{1,2}$/, 40), quests: ids(o.quests, /^[a-z0-9-]{1,24}$/, 60), badges: ids(o.badges, /^[a-z0-9-]{1,24}$/, 40),
    daily: o.daily && typeof o.daily === "object" ? { day: String(o.daily.day || "").slice(0, 10), done: ids(o.daily.done, /^[a-z0-9-]{1,24}$/, 10), streak: Math.max(0, Math.min(3650, Math.floor(Number(o.daily.streak) || 0))) } : null,
    ...(o.outfit && typeof o.outfit === "object" ? { outfit: cleanOutfit(o.outfit) } : {}),
    ...(Number.isInteger(o.ep) && o.ep >= 1 && o.ep <= 99 ? { ep: o.ep } : {}), // the test this progress belongs to (api/_world-phase.mjs)
  };
}

// a build: base64 of [1, N, (x, y, z, kind, rot|colour<<2) × n]; null when it isn't one
export function checkBuild(data, N, max) {
  const s = String(data || "");
  if (Array.isArray(N)) { for (const n of N) { const r = checkBuild(data, n, max); if (r) return { ...r, N: n }; } return null; }
  if (!s || s.length > Math.ceil((2 + 5 * max) / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  let bin; try { bin = atob(s); } catch { return null; }
  if (bin.length < 2 || bin.charCodeAt(0) !== 1 || bin.charCodeAt(1) !== N || (bin.length - 2) % 5 !== 0) return null;
  const n = (bin.length - 2) / 5;
  if (n > max) return null;
  for (let i = 2; i < bin.length; i += 5) if (bin.charCodeAt(i) >= N || bin.charCodeAt(i + 2) >= N || bin.charCodeAt(i + 1) >= 32) return null;
  return { n };
}
export const STAMP_COUNT = 6;
const shortW = (w) => w.slice(0, 6) + "…" + w.slice(-4);
// a hidden note keeps its stamp but not its words
const pubStamps = (list) => list.slice(-20).map(({ m, h, ...x }) => (h ? { ...x, h: 1 } : m ? { ...x, m } : x));
const cleanName = (n) => String(n || "").replace(/[\u0000-\u001f<>"'`\\]/g, "").trim().slice(0, 16);

/// deps: { getDocs, setDoc, commit, storeEnabled, recover, issuedOk, json, launchRecord?, now?, phase? }
/// phase (api/_world-phase.mjs WORLD_PHASE): { phase: "cbt" | "closed" | "obt" | "live", epoch }; without it, the closed beta
export function make(deps) {
  const PH = deps.phase && typeof deps.phase === "object" ? deps.phase : { phase: "cbt", epoch: 1 };
  // the store as this epoch sees it (every module gets it); `raw` reads the closed beta's own data for its rewards
  const raw = { getDocs: deps.getDocs, setDoc: deps.setDoc, commit: deps.commit };
  deps = { ...deps, ...scopeStore(raw, PH.epoch) };
  const { getDocs, setDoc, commit, recover, issuedOk, json } = deps;
  const now = () => (deps.now ? deps.now() : Date.now());
  const on = () => (deps.storeEnabled ? deps.storeEnabled() : true);
  async function stats() {
    const w = Math.floor(now() / WINDOW);
    const d = await getDocs(["worldStats/main", `worldOnline/${w}`, `worldOnline/${w - 1}`]);
    const m = d["worldStats/main"] || {}, A = d[`worldOnline/${w}`] || {}, B = d[`worldOnline/${w - 1}`] || {}, a = A.n || 0, b = B.n || 0;
    // who's in now: signed in with a wallet (the ping's sign-in checked here) and guests — the busier of the two windows
    const C = a >= b ? A : B, wal = Math.min(C.n || 0, C.wal || 0);
    return { online: Math.max(a, b), wallets: wal, guests: Math.max(0, (C.n || 0) - wal), visitors: m.visitors || 0, uniques: m.uniques || 0, players: m.players || 0, phase: PH.phase, epoch: PH.epoch };
  }
  // ---- anonymous health counters (world-diag.js): errors, frame-rate bands, a GPU memory climb; no wallet, no place ----
  const word = (x, n) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, n);
  const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
  async function diag(b) {
    const day = `worldDiag/${seoulDay(now())}`, dev = b.dev === "phone" ? "ph" : "pc", q = word(b.q, 8) || "auto";
    if (b.kind === "fps") { const f = Math.max(0, Math.min(4, Math.floor(Number(b.b) || 0))); await commit([{ inc: day, fields: { [`fps_${dev}_${q}_${f}`]: 1 } }]).catch(() => {}); return json(200, { ok: true }); }
    if (b.kind === "frames") {
      // the frame-rate bands from real devices (world-diag.js): per device, quality, chip class and family
      const band = (v) => Math.max(0, Math.min(7, Math.floor(Number(v) || 0)));
      const tier = /^[hlu]$/.test(String(b.tier)) ? b.tier : "u", fam = /^[a-z0-9]{2,12}$/.test(String(b.fam)) ? b.fam : "other";
      const cap = [30, 45, 60].includes(Number(b.cap)) ? Number(b.cap) : 60, dpr = Math.max(0.5, Math.min(3, Math.round((Number(b.dpr) || 1) * 4) / 4));
      const p50 = band(b.p50), p10 = band(b.p10), k = `${dev}_${q}_${tier}`;
      await commit([{ inc: day, fields: { [`f50_${k}_${p50}`]: 1, [`f10_${k}_${p10}`]: 1, [`fam_${dev}_${fam}_${p50}`]: 1, [`cap_${dev}_${cap}`]: 1, [`dpr_${dev}_${String(dpr).replace(".", "p")}`]: 1 } }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "scene") { // 2026-10-25: how much a place draws a frame (world-diag.js drawSample): sums for averages + the draw-call band
      const w = word(b.w, 8), fam = /^[a-z0-9]{2,12}$/.test(String(b.fam)) ? b.fam : "other"; if (!w) return json(400, { error: "bad place" });
      const n = (v, mx) => Math.max(0, Math.min(mx, Math.round(Number(v) || 0))), c50 = n(b.c50, 20000), c90 = n(b.c90, 20000), cb = c50 < 100 ? 0 : c50 < 200 ? 1 : c50 < 300 ? 2 : c50 < 500 ? 3 : c50 < 800 ? 4 : 5, k = `scn_${dev}_${w}`;
      await commit([{ inc: day, fields: { [`${k}_n`]: 1, [`${k}_c50`]: c50, [`${k}_c90`]: c90, [`${k}_t50`]: n(b.t50, 50000), [`${k}_prog`]: n(b.prog, 5000), [`${k}_tex`]: n(b.tex, 20000), [`${k}_geo`]: n(b.geo, 50000), [`${k}_b${cb}`]: 1, [`scf_${dev}_${fam}_${w}_b${cb}`]: 1 } }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "hitch") { // b441: long frames by place, cause and length (world-diag.js)
      const f = {}; let n = 0;
      for (const [k, v] of Object.entries(b.h && typeof b.h === "object" ? b.h : {})) { if (n >= 24 || !/^[a-z0-9]{1,8}_(shader|tex|geo|move|fight|layout|js|resume|busy|stall|other)_[012]$/.test(k)) continue; f[`hit_${dev}_${k}`] = Math.max(1, Math.min(60, Math.floor(Number(v) || 1))); n++; }
      for (const [k, v] of Object.entries(b.s && typeof b.s === "object" ? b.s : {})) { if (n >= 36 || !/^[a-z0-9-]{1,24}$/.test(k)) continue; f[`hsh_${dev}_${k}`] = Math.max(1, Math.min(60, Math.floor(Number(v) || 1))); n++; } // which shaders were built
      for (const [k, v] of Object.entries(b.j && typeof b.j === "object" ? b.j : {})) { if (n >= 44 || !/^[a-z0-9-]{1,24}$/.test(k)) continue; f[`hjs_${dev}_${k}`] = Math.max(1, Math.min(60, Math.floor(Number(v) || 1))); n++; } // b447: which script ran long (file-what)
      if (n) await commit([{ inc: day, fields: f }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "surv") { // SURVIVORS ARENA's own frames (world-survivors.js): quality step 0–2, chip family, crowd band
      const band = (v) => Math.max(0, Math.min(7, Math.floor(Number(v) || 0))), sq = Math.max(0, Math.min(2, Math.floor(Number(b.sq) || 0))), fam = /^[a-z0-9]{2,12}$/.test(String(b.fam)) ? b.fam : "other";
      const crowd = Math.max(0, Math.min(3, Math.floor(Number(b.crowd) || 0))), k = `${dev}_${q}${sq}`;
      await commit([{ inc: day, fields: { [`sv50_${k}_${band(b.p50)}`]: 1, [`sv10_${k}_${band(b.p10)}`]: 1, [`svfam_${dev}_${fam}_${band(b.p50)}`]: 1, [`svcrowd_${dev}_${crowd}_${band(b.p50)}`]: 1 } }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "site") { // the game site (game.html, gw.js): what people do there — a visit, PLAY FREE pressed (and from which section), the language picked, the trailer's sound — counts only, no ids
      const ev = ["visit", "play", "lang", "sound", "viewer", "detail", "invite"].includes(b.ev) ? b.ev : "", at = /^[a-z]{2,12}$/.test(String(b.at || "")) ? String(b.at) : "", dev = b.dev === "pc" ? "pc" : "ph";
      if (ev) await commit([{ inc: day, fields: { [`site_${ev}_${dev}`]: 1, ...(at ? { [`site_${ev}_${at}`]: 1 } : {}) } }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "survrun") { // b-svx: a SURVIVORS ARENA run's end (world-survivors.js endRun): how and when it ended, the hero, the weapons and evolutions it had, what knocked it out — for the balance
      const id = (v) => (/^[a-z]{2,12}$/.test(String(v || "")) ? String(v) : ""), how = ["dead", "win", "time", "quit"].includes(b.how) ? b.how : "quit", min = Math.max(0, Math.min(15, Math.floor(Number(b.min) || 0)));
      const f = { [`svend_${how}_${min}`]: 1 }, hero = id(b.hero), by = id(b.by);
      if (hero) f[`svhero_${hero}_${how}`] = 1; if (by && how === "dead") f[`svby_${by}`] = 1;
      for (const w of (Array.isArray(b.w) ? b.w : []).slice(0, 6)) if (id(w)) f[`svw_${id(w)}_${how}`] = 1;
      for (const e of (Array.isArray(b.evo) ? b.evo : []).slice(0, 6)) if (id(e)) f[`svevo_${id(e)}`] = 1;
      await commit([{ inc: day, fields: f }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "rings") { // INFINITY RINGS' frames (world-rings.js): chip family
      const band = (v) => Math.max(0, Math.min(7, Math.floor(Number(v) || 0))), fam = /^[a-z0-9]{2,12}$/.test(String(b.fam)) ? b.fam : "other";
      await commit([{ inc: day, fields: { [`rg50_${dev}_${q}_${band(b.p50)}`]: 1, [`rg10_${dev}_${q}_${band(b.p10)}`]: 1, [`rgfam_${dev}_${fam}_${band(b.p50)}`]: 1 } }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "funnel") { // b-st3: the first minutes, step by step (world-diag.js funnel): counts only, new browsers apart
      const ev = FUNNEL.includes(b.ev) ? b.ev : ""; if (!ev) return json(400, { error: "unknown step" });
      await commit([{ inc: day, fields: { [`fun_${ev}_${dev}`]: 1, ...(b.nw ? { [`fun_${ev}_${dev}_new`]: 1 } : {}) } }]).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "mem") { await commit([{ inc: day, fields: { [`mem_${dev}_${q}`]: 1 } }]).catch(() => {}); return json(200, { ok: true }); }
    if (b.kind === "err") {
      const msg = String(b.msg || "").slice(0, 180); if (!msg) return json(400, { error: "empty" });
      const h = hash(msg);
      await commit([{ inc: day, fields: { [`err_${h}`]: 1 } }]).catch(() => {});
      await commit([{ create: `worldDiagMsg/${h}`, data: { msg, src: String(b.src || "").slice(0, 60), gpu: String(b.gpu || "").slice(0, 80), dev, at: now() } }]).catch(() => {});
      await userLog(b, dev, msg).catch(() => {});
      return json(200, { ok: true });
    }
    if (b.kind === "uready") { // a signed-in player got in: how long the load took (the line that says a player's last visit worked)
      const sec = Math.max(0, Math.min(999, Math.round(Number(b.sec) || 0)));
      await userLog(b, dev, `ready in ${sec}s`).catch(() => {}); return json(200, { ok: true });
    }
    return json(400, { error: "unknown kind" });
  }
  /// the owner, 2026-10-25: a log per player, errors above all — every error and slow / stuck load a signed-in player's
  /// browser reports, and each time they got in, kept under their wallet (worldDiagUser/<wallet>: the last 60, newest
  /// first) with their name, browser and GPU; worldDiagUsers/recent lists the last 400 players who reported anything.
  /// Unsigned (the report can come from a page that can't sign yet), so it's a log, never a record anything trusts;
  /// only a GM reads it (world-diag-user)
  const UA = (s) => String(s || "").replace(/[^\w .;:/()\-]/g, "").slice(0, 60);
  async function userLog(b, dev, line) {
    const w = lc(b.w); if (!isAddr(w)) return;
    const k = `worldDiagUser/${w}`, ik = "worldDiagUsers/recent", d = await getDocs([k, ik]), cur = d[k] || {}, ix = d[ik] || {};
    const e = { at: now(), m: String(line).slice(0, 200), s: String(b.src || "").slice(0, 60), ua: UA(b.ua), g: String(b.gpu || "").slice(0, 60), d: dev, v: String(b.v || "").slice(0, 24), q: word(b.q, 8) };
    const name = String(b.nm || cur.name || "").slice(0, 16);
    await setDoc(k, { w, name, at: e.at, list: [e, ...(Array.isArray(cur.list) ? cur.list : [])].slice(0, 60) });
    const m = { ...(ix.m || {}) }, o = m[w] || {}; m[w] = { name, at: e.at, n: (o.n || 0) + 1, err: (o.err || 0) + (/^ready in/.test(e.m) ? 0 : 1), last: e.m.slice(0, 90), ua: e.ua, d: dev };
    await setDoc(ik, { m: Object.fromEntries(Object.entries(m).sort((x, y) => y[1].at - x[1].at).slice(0, 400)) });
  }
  async function userLogRead(b) {
    const v = signer(b); if (v.err) return v.err; if (!isGM(v.wallet)) return json(403, { error: "GM only" });
    const q = String(b.q || "").trim().toLowerCase(), ix = ((await getDocs(["worldDiagUsers/recent"]))["worldDiagUsers/recent"] || {}).m || {};
    const hits = !q ? [] : isAddr(q) ? [q] : Object.entries(ix).filter(([w, o]) => w.includes(q) || String(o.name || "").toLowerCase().includes(q)).slice(0, 5).map(([w]) => w);
    const docs = hits.length ? await getDocs(hits.map((w) => `worldDiagUser/${w}`)) : {};
    return json(200, { recent: Object.entries(ix).slice(0, 60).map(([w, o]) => ({ w, ...o })), found: hits.map((w) => docs[`worldDiagUser/${w}`] || { w, list: [] }) });
  }
  const FUNNEL = ["open", "ready", "maker", "named", "start", "move", "fight", "game", "back"];
  async function diagView() {
    const days = [0, 1, 2].map((i) => seoulDay(now() - i * 864e5)), d = await getDocs(days.map((x) => `worldDiag/${x}`));
    const out = days.map((x) => ({ day: x, n: d[`worldDiag/${x}`] || {} }));
    const errs = [...new Set(out.flatMap((x) => Object.keys(x.n).filter((k) => k.startsWith("err_")).map((k) => k.slice(4))))].slice(0, 40);
    const m = errs.length ? await getDocs(errs.map((h) => `worldDiagMsg/${h}`)) : {};
    // frames: for each device / quality / chip class (and chip family), how many reports fell in each band, and the band
    // half of them reached (the median) — the numbers Auto quality is tuned by
    const BANDS = ["<15", "15-20", "20-25", "25-30", "30-40", "40-50", "50-55", "55+"], fr = {};
    for (const x of out) for (const [key, v] of Object.entries(x.n)) {
      const m = /^(f50|f10|fam|sv50|sv10|svfam|svcrowd|rg50|rg10|rgfam)_(.+)_(\d)$/.exec(key); if (!m) continue;
      const g = (fr[m[1] + ":" + m[2]] = fr[m[1] + ":" + m[2]] || [0, 0, 0, 0, 0, 0, 0, 0]); g[+m[3]] += v;
    }
    const frames = Object.entries(fr).map(([k, c]) => { const n = c.reduce((a, b) => a + b, 0); let s = 0, med = 0; for (let i = 0; i < 8; i++) { s += c[i]; if (s * 2 >= n) { med = i; break; } } const [kind, who] = k.split(":"); return { kind: ({ f50: "typical", f10: "slowest10", fam: "family", sv50: "surv-typical", sv10: "surv-slowest10", svfam: "surv-family", svcrowd: "surv-crowd", rg50: "rings-typical", rg10: "rings-slowest10", rgfam: "rings-family" })[kind] || kind, who, n, median: BANDS[med], bands: Object.fromEntries(c.map((v, i) => [BANDS[i], v]).filter((e) => e[1])) }; }).sort((a, b) => b.n - a.n);
    // hitches: totals over the three days, most first (dev_place_cause_band; band 0 = 100–200 ms, 1 = 200–500, 2 = 500+)
    const hc = {}; for (const x of out) for (const [key, v] of Object.entries(x.n)) if (key.startsWith("hit_")) hc[key.slice(4)] = (hc[key.slice(4)] || 0) + v;
    const hitches = Object.entries(hc).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => { const [dev, where, cause, band] = k.split("_"); return { dev, where, cause, ms: ["100-200", "200-500", "500+"][+band] || band, n }; });
    const sc = {}; for (const x of out) for (const [key, v] of Object.entries(x.n)) if (key.startsWith("hsh_")) sc[key.slice(4)] = (sc[key.slice(4)] || 0) + v;
    const shaders = Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => { const i = k.indexOf("_"); return { dev: k.slice(0, i), kind: k.slice(i + 1), n }; });
    const jc = {}; for (const x of out) for (const [key, v] of Object.entries(x.n)) if (key.startsWith("hjs_")) jc[key.slice(4)] = (jc[key.slice(4)] || 0) + v;
    const scripts = Object.entries(jc).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => { const i = k.indexOf("_"); return { dev: k.slice(0, i), what: k.slice(i + 1), n }; });
    // b-svx: SURVIVORS ARENA runs over the three days: ends by minute, weapons by how their runs ended, evolutions, what knocked runs out, heroes
    const sv = {}; for (const x of out) for (const [key, v] of Object.entries(x.n)) { const m = /^(svend|svhero|svby|svw|svevo)_(.+)$/.exec(key); if (m) { const g = (sv[m[1]] = sv[m[1]] || {}); g[m[2]] = (g[m[2]] || 0) + v; } }
    // 2026-10-25: what each place draws a frame, averaged over the reports (device_place): draw calls (median, busiest 10 %),
    // triangles (k), shaders, textures, geometries, and how many reports sat in each draw-call band (<100 … 800+)
    const sn = {}; for (const x of out) for (const [key, v] of Object.entries(x.n)) { const m = /^scn_(ph|pc)_([a-z0-9_]+)_(n|c50|c90|t50|prog|tex|geo|b\d)$/.exec(key); if (!m) continue; const g = (sn[m[1] + "_" + m[2]] = sn[m[1] + "_" + m[2]] || {}); g[m[3]] = (g[m[3]] || 0) + v; }
    const scenes = Object.entries(sn).map(([k, g]) => { const i = k.indexOf("_"), a = (f) => Math.round((g[f] || 0) / Math.max(1, g.n || 0)); return { dev: k.slice(0, i), where: k.slice(i + 1), n: g.n || 0, calls: a("c50"), calls90: a("c90"), ktris: a("t50"), shaders: a("prog"), textures: a("tex"), geos: a("geo"), bands: ["<100", "100-200", "200-300", "300-500", "500-800", "800+"].map((l, j) => [l, g["b" + j] || 0]).filter((x) => x[1]) }; }).sort((x, y) => y.calls - x.calls);
    // b-st3: the first minutes by day: how many visits reached each step (phone / computer, and new browsers)
    const funnel = out.map((x) => ({ day: x.day, ...Object.fromEntries(FUNNEL.map((ev) => [ev, { ph: x.n[`fun_${ev}_ph`] || 0, pc: x.n[`fun_${ev}_pc`] || 0, phNew: x.n[`fun_${ev}_ph_new`] || 0, pcNew: x.n[`fun_${ev}_pc_new`] || 0 }])) }));
    return json(200, { days: out, funnel, scenes, frames, hitches, shaders, scripts, surv: sv, errors: errs.map((h) => ({ h, ...(m[`worldDiagMsg/${h}`] || {}), n: out.reduce((a, x) => a + (x.n["err_" + h] || 0), 0) })).sort((a, b) => b.n - a.n) }, "no-store");
  }
  async function ping(b) {
    const id = String(b.id || "");
    if (!/^[a-z0-9]{12,40}$/.test(id)) return json(400, { error: "bad id" });
    const w = Math.floor(now() / WINDOW);
    // visits add up: every time the game is opened counts (the same browser at most once per 10 minutes, so reloads
    // don't pile up); first-time browsers are kept as a separate count
    const first = await commit([{ create: `worldVisitors/${id}`, data: { at: now() } }]);
    if (first.ok) await commit([{ inc: "worldStats/main", fields: { uniques: 1 } }]);
    if (b.visit || first.ok) {
      const v = await commit([{ create: `worldVisit/${id}_${Math.floor(now() / 600e3)}`, data: { at: now() } }]);
      if (v.ok) await commit([{ inc: "worldStats/main", fields: { visitors: 1 } }]);
    }
    if (!b.gate) { // the home page's gate counts the visit but isn't "in the world"
      const seen = await commit([{ create: `worldSeen/${w}_${id}`, data: { at: now() } }]);
      if (seen.ok) await commit([{ inc: `worldOnline/${w}`, fields: { n: 1 } }]);
      // signed in? the session goes along whether or not the name shows (b.s); counted once a window a browser
      if (b.s && typeof b.s === "object" && !signer(b.s).err) { const sw = await commit([{ create: `worldSeenW/${w}_${id}`, data: { at: now() } }]); if (sw.ok) await commit([{ inc: `worldOnline/${w}`, fields: { wal: 1 } }]); }
      // where you are, for the wanderers others see; signed in (and not hidden in Settings), with your name and level
      let who = null;
      if (b.g && b.s && typeof b.s === "object" && !b.hide) { const v = signer(b.s); if (!v.err) { const sv = (await getDocs([`worldSave/${v.wallet}`]))[`worldSave/${v.wallet}`]; if (sv && sv.name) { const cr = await crew.crewOf(v.wallet).catch(() => null); who = { name: String(sv.name).slice(0, 16), lv: levelOfSave(sv), w: v.wallet, ...(cr && cr.tag && !cr.closed ? { tag: cr.tag } : {}), ...(isGM(v.wallet) ? { gm: 1 } : {}) }; } } }
      // the line they said last, for the bubble over them: signed in only, and filtered again here
      if (b.g && typeof b.g === "object") b.g = { ...b.g, m: who && typeof b.g.m === "string" ? chat.bubble(b.g.m) : "" };
      if (b.g) await social.ghostPing(id, b.g, who).catch(() => {});
      if (who && b.pr) await chat.presence(who).catch(() => {}); // the friends list's green dot (the game sends this about every 3 minutes)
    }
    return json(200, { ok: true, ...(await stats()) });
  }
  function signer(b) {
    const wallet = lc(b.wallet);
    if (!isAddr(wallet)) return { err: json(400, { error: "wallet must be an address" }) };
    if (!issuedOk(b.issued, 24 * 3600e3)) return { err: json(400, { error: "sign-in expired — sign in again" }) };
    let who; try { who = recover(loginMessage(wallet, b.issued), b.signature); } catch { return { err: json(400, { error: "invalid signature" }) }; }
    if (who !== wallet) return { err: json(403, { error: "signature doesn't match the wallet" }) };
    return { wallet };
  }
  let village = null; // made below (it reads the shop's ownership; the shop asks it about Village upgrades)
  const ledger = makeLedger({ ...deps, now }); // b-ec1: every ARCL movement written down, the balance split by where it came from
  const lotsM = makeLots({ getDocs, setDoc, now, coinMcap: deps.coinMcap }); // b-lpv: the Launchpad Village's lot tiers
  const shop = makeShop({ ...deps, json, now, signer, ledger, isleNext: (w) => village.nextUp(w), hasName: async (w) => !!(((await getDocs([`worldSave/${w}`]))[`worldSave/${w}`] || {}).name) });
  // the help desk's reviewers: SUPPORT_ADMINS (comma-separated wallets) and the owner of ArcircleFeeBurn
  let adminCache = null;
  async function admins() {
    if (adminCache && now() - adminCache.at < 600e3) return adminCache.set;
    const set = new Set(String((globalThis.process && process.env.SUPPORT_ADMINS) || "").split(/[\s,]+/).map(lc).filter(isAddr));
    try { const o = deps.ownerOf ? await deps.ownerOf(FEE_BURN) : null; if (o && o.length >= 66) set.add("0x" + o.slice(-40).toLowerCase()); } catch { /* the env list still works */ }
    adminCache = { set, at: now() }; return set;
  }
  const social = makeSocial({ ...deps, json, now, signer, isoWeek: shop.isoWeek, credit: shop.credit, dinoLook: (w) => (dino ? dino.look(w) : ""), agentLook: async (w) => { const a = (await deps.getDocs([`worldAgent/${w}`]))[`worldAgent/${w}`]; return a && a.kind && /^(aurora|orion|vex)$/.test(a.kind) ? `${a.kind}:${String(a.name || "").replace(/[^\w .-]/g, "").slice(0, 16)}` : ""; } });
  const chat = makeChat({ ...deps, json, now, signer });
  const crew = makeCrew({ ...deps, json, now, signer, isoWeek: shop.isoWeek, levelOfSave });
  const rank = makeRank({ ...deps, json, now, signer, isoWeek: shop.isoWeek, credit: shop.credit, award: shop.award });
  village = makeVillage({ ...deps, json, now, signer, isoWeek: shop.isoWeek, own: (w) => shop.own(w), award: (w, k, n) => shop.award(w, k, n) });
  const defense = makeDefense({ ...deps, json, now, signer, isoWeek: shop.isoWeek, credit: shop.credit, award: shop.award });
  const jump = makeJump({ ...deps, json, now, signer, credit: shop.credit }); // Coin Jump: the crown pays once a day (api/_world-jump.mjs)
  // the mine's holder tier ($ARCIRCLE on Arc, the halo's tiers: any / 100K / 1M), read at most every 10 minutes a wallet
  const holdCache = new Map();
  async function holdTier(w) {
    const c = holdCache.get(w); if (c && now() - c.at < 600e3) return c.t;
    let t = 0; try { if (deps.tokenBalance) { const n = Number(BigInt(await deps.tokenBalance(ARCIRCLE_TOKEN, w)) / 10n ** 18n); t = n >= 1e6 ? 3 : n >= 1e5 ? 2 : n > 0 ? 1 : 0; } } catch { t = c ? c.t : 0; }
    holdCache.set(w, { t, at: now() }); if (holdCache.size > 5000) holdCache.clear(); return t;
  }
  const saveOf = async (w) => (await getDocs([`worldSave/${w}`]))[`worldSave/${w}`];
  const mine = makeMine({ ...deps, json, now, signer, ledger, own: (w) => shop.own(w), award: (w, k, n) => shop.award(w, k, n), holdTier, isoWeek: shop.isoWeek,
    level: async (w) => levelOfSave(await saveOf(w)), nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16) }); // the ARCL Mine: each broken rock pays (api/_world-mine.mjs)
  const welcome = makeWelcome({ ...deps, json, now, signer, level: async (w) => levelOfSave(await saveOf(w)), award: (w, k, n) => shop.award(w, k, n), freeEgg: (w, src) => shop.freeEgg(w, src), trial: (w, ms) => mine.trial(w, ms) }); // the welcome week (api/_world-welcome.mjs)
  // Jurassic World's gathering, crafting and camps (api/_world-jur.mjs); its dinosaur companion (api/_world-dino.mjs)
  // helps with the hunts and takes its care from the same pack (the two reach each other through these late-bound hooks)
  let dino = null;
  const jur = makeJur({ ...deps, json, now, signer, isGM, mine, credit: shop.credit, isoWeek: shop.isoWeek, dino: { assist: (w) => dino.assist(w), hunt: (w, k) => dino.hunt(w, k), gather: (w) => dino.gather(w) } });
  dino = makeDino({ ...deps, json, now, signer, debit: shop.debit, level: async (w) => levelOfSave(await saveOf(w)), jur: { take: (w, need) => jur.take(w, need) } });
  // AGENT DIMENSION: your agent, its chat and its errands (api/_world-agent.mjs)
  const agentDim = makeAgentDim({ ...deps, json, now, signer, isGM, debit: shop.debit, jur: { give: (w, m) => jur.give(w, m) }, mine: { addOre: (w, o) => mine.addOre(w, o) },
    level: async (w) => levelOfSave(await saveOf(w)), nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16) });
  const codex = makeCodex({ ...deps, json, now, signer, award: shop.award }); // the item codex (api/_world-codex.mjs)
  const studio = makeStudio({ ...deps, json, now, signer, isGM, shut: (w) => !STUDIO.OPEN && !isGM(w), /* (open to all since 2026-10-24; STUDIO.OPEN false would keep it to the GMs) */ nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16), randomId: deps.randomId || (() => Math.random().toString(36).slice(2)) }); // AD-City 3: ARCIRCLE Studio Lite (api/_world-studio.mjs)
  const agArena = makeAgArena({ ...deps, json, now, signer, shut: (w) => !AGENT.OPEN && !isGM(w), nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16), random: deps.random || Math.random }); // AD-City 4: the Agent Arena (api/_world-agarena.mjs)
  const agentVault = makeAgentVault({ getDocs: deps.getDocs, setDoc: deps.setDoc, json, now, signer, io: deps.agentVaultIo, sel: deps.agentVaultSel, shut: (w) => !AGENT.OPEN && !isGM(w) }); // AD3: the agent trades from the player's own vault (api/_world-agentvault.mjs)
  // the official launch's gift and the 3× EXP potions (api/_world-launch.mjs)
  const launch = makeLaunch({ ...deps, json, now, signer, level: async (w) => levelOfSave(await saveOf(w)), own: (w) => shop.own(w), award: (w, k, n) => shop.award(w, k, n), dinoGift: (w, id, rar) => dino.gift(w, id, rar) });
  // invite a friend: both rewarded when the friend reaches level 5 (api/_world-refer.mjs)
  const refer = makeRefer({ ...deps, json, now, signer, level: async (w) => levelOfSave(await saveOf(w)), nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16), award: (w, k, n) => shop.award(w, k, n), dinoGift: (w, id, rar) => dino.gift(w, id, rar) });
  // the GM's $ARCIRCLE rewards, sent from the GM's own wallet and noted once the chain shows them (api/_world-gmreward.mjs)
  const gmReward = makeGmReward({ ...deps, json, now, signer, isGM, token: ARCIRCLE_TOKEN, nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16) });
  // ARCIRCLE LAND: the 20 villages bought with $ARCIRCLE (paid to the treasury), the owner's island on their village (api/_world-land.mjs)
  const land = makeLand({ ...deps, json, now, signer, isGM, token: ARCIRCLE_TOKEN, nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16) });
  const swap = makeSwap({ ...deps, json, now, signer, isGM, ledger });
  // b-ec2/3: the Creator Market (blueprints for ARCL, 80/20, 14 days on hold) and the Creator Exchange (GM-signed, verified on Arc)
  const market = makeMarket({ ...deps, json, now, signer, isGM, ledger, note: (w, t, k, n, o) => shop.note(w, t, k, n, o), nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16) });
  const coins = makeCoins({ ...deps, json, now, ledger }); // the coins page's public totals (coins.html)
  const poker = makePoker({ ...deps, json, now, signer, credit: shop.credit, debit: shop.debit, isoWeek: shop.isoWeek, crewOf: crew.crewOf }); // ARCIA POKER LOUNGE: chips (free daily, or bought with ARCL one way), tables, blackjack, outcome-free missions (api/_world-poker.mjs)
  const rings = makeRings({ ...deps, json, now, signer, credit: shop.credit, isoWeek: shop.isoWeek }); // INFINITY RINGS: each new star pays (api/_world-rings.mjs)
  const pk = makeHalloween({ ...deps, json, now, signer, award: shop.award, level: async (w) => levelOfSave(await saveOf(w)), nameOf: async (w) => String(((await saveOf(w)) || {}).name || "").slice(0, 16) }); // the Halloween Pumpkin Kings (api/_world-halloween.mjs)
  const mythic = makeMythic({ ...deps, json, now, signer, isGM, save: (w) => saveOf(w), debit: shop.debit, award: shop.award }); // MYTHIC gear held here: the Crimson Celestial set (api/_world-mythic.mjs)
  const rq = makeRaidQueens({ ...deps, json, now, signer, isGM, isoWeek: shop.isoWeek, award: shop.award, save: (w) => saveOf(w), mythic }); // RAID QUEENS: runs, the day's three, the SECRET's tickets (api/_world-raidq.mjs)
  const surv = makeSurvivors({ ...deps, json, now, signer, credit: shop.credit, isoWeek: shop.isoWeek }); // SURVIVORS ARENA: paid by the run's end (api/_world-survivors.mjs) // the Exchange: ARCL ⇄ $ARCIRCLE by request, settled by the team (api/_world-swap.mjs)
  const support = makeSupport({ ...deps, json, now, signer, grant: (w, k, n) => shop.rewardArcl(w, k, n), admins });
  // the beta gate: Game World is open to wallets holding at least GATE_MIN $ARCIRCLE on Arc. The signature proves the
  // wallet is the visitor's (the same free sign-in message); nothing is stored, so it works with storage off too.
  async function gate(b) {
    const s = signer(b); if (s.err) return s.err;
    // between the betas only GM wallets play; in the open beta everyone does, with no balance to hold
    if (PH.phase === "closed") return json(200, { ok: isGM(s.wallet), closed: true, phase: PH.phase, wallet: s.wallet });
    if (PH.phase === "obt" || PH.phase === "live") return json(200, { ok: true, phase: PH.phase, wallet: s.wallet });
    if (!deps.tokenBalance) return json(503, { error: "the balance check isn't available" });
    let bal; try { bal = BigInt(await deps.tokenBalance(ARCIRCLE_TOKEN, s.wallet)); } catch { return json(502, { error: "couldn't read the balance on Arc — try again in a moment" }); }
    const whole = Number(bal / 10n ** 18n);
    return json(200, { ok: bal >= GATE_MIN * 10n ** 18n, wallet: s.wallet, balance: whole, need: Number(GATE_MIN) });
  }
  async function login(b) {
    const s = signer(b); if (s.err) return s.err;
    const first = await commit([{ create: `worldPlayers/${s.wallet}`, data: { at: now() } }]);
    // the "signed in" count: each wallet once. It's keyed on its own marker so wallets that signed in before the count
    // existed (their worldPlayers doc was already there) are counted the next time they sign in
    const counted = await commit([{ create: `worldCounted/${s.wallet}`, data: { at: now() } }]);
    if (counted.ok) await commit([{ inc: "worldStats/main", fields: { players: 1 } }]);
    const d = await getDocs([`worldSave/${s.wallet}`]);
    return json(200, { ok: true, wallet: s.wallet, firstTime: !!first.ok, save: d[`worldSave/${s.wallet}`] || null, phase: PH.phase, epoch: PH.epoch, ...(PH.epoch >= 2 ? { cbt: await cbtInfo(s.wallet) } : {}) });
  }
  // ---- the closed beta's rewards (api/_world-phase.mjs CBT_REWARD), from its own data, which never changes ----
  // the level ranking's top 3, frozen the first time it's read once the closed beta is over (GMs left out; ties by XP)
  async function cbtTop() {
    const frozen = (await raw.getDocs(["worldCbt/top"]))["worldCbt/top"];
    if (frozen && Array.isArray(frozen.list)) return frozen.list;
    const rows = (((await raw.getDocs(["worldStats/players"]))["worldStats/players"] || {}).list || []).filter((r) => r && isAddr(r.w) && !isGM(r.w) && !r.gm);
    rows.sort((a, c) => (c.lv || 0) - (a.lv || 0));
    const cut = rows.length > 3 ? rows[2].lv || 0 : 0, cand = rows.filter((r) => (r.lv || 0) >= cut).slice(0, 30);
    const sv = cand.length ? await raw.getDocs(cand.map((r) => `worldSave/${lc(r.w)}`)) : {};
    const xpOf = (w) => { const x = sv[`worldSave/${lc(w)}`]; return x ? (x.xpv === XP_VERSION ? x.xp || 0 : xpFromOld(x.xp)) : 0; };
    const list = cand.map((r) => ({ w: lc(r.w), name: String(r.name || "").slice(0, 16), lv: r.lv || 0, xp: xpOf(r.w) })).sort((a, c) => c.lv - a.lv || c.xp - a.xp).slice(0, 3);
    if (PH.phase !== "cbt") { const made = await raw.commit([{ create: "worldCbt/top", data: { list, at: now() } }]).catch(() => ({ ok: false })); if (!made.ok) { const again = (await raw.getDocs(["worldCbt/top"]))["worldCbt/top"]; if (again && Array.isArray(again.list)) return again.list; } }
    return list;
  }
  // { eligible (a closed-beta save), rank (1–3, or 0), claimed, items (once claimed) }
  async function cbtInfo(w) {
    const d = await raw.getDocs([`worldSave/${w}`, `worldCbtClaim/${w}`]), c = d[`worldCbtClaim/${w}`];
    if (c) return { eligible: true, rank: c.rank || 0, claimed: true, items: Array.isArray(c.items) ? c.items : [] };
    if (isGM(w)) return { eligible: true, rank: CBT_REWARD.gmRank, claimed: false }; // outside the ranking, the 2nd place's set
    if (!d[`worldSave/${w}`]) return { eligible: false, rank: 0, claimed: false };
    const top = await cbtTop(), i = top.findIndex((r) => r.w === w);
    return { eligible: true, rank: i + 1, claimed: false };
  }
  // the pieces are made once and kept with the claim, so asking again returns the same ones (the game adds each id once)
  async function cbtClaim(b) {
    if (!(PH.epoch >= 2)) return json(409, { error: "the closed beta's rewards come with the open beta" });
    const s = signer(b); if (s.err) return s.err;
    const info = await cbtInfo(s.wallet);
    if (!info.eligible) return json(404, { error: "this wallet has no closed beta progress" });
    if (info.claimed) return json(200, { ok: true, again: true, rank: info.rank, items: info.items });
    const items = cbtItems(info.rank);
    const made = await raw.commit([{ create: `worldCbtClaim/${s.wallet}`, data: { at: now(), rank: info.rank, items } }]);
    if (!made.ok) { const c = (await raw.getDocs([`worldCbtClaim/${s.wallet}`]))[`worldCbtClaim/${s.wallet}`] || {}; return json(200, { ok: true, again: true, rank: c.rank || 0, items: c.items || [] }); }
    return json(200, { ok: true, rank: info.rank, items });
  }
  // GET ?world=phase: where the test stands, and the closed beta's top 3 (public: names and levels from the directory)
  async function phaseView() {
    const top = await cbtTop().catch(() => []);
    return json(200, { phase: PH.phase, epoch: PH.epoch, reward: CBT_REWARD, top: top.map((r, i) => ({ rank: i + 1, w: r.w, name: r.name, lv: r.lv })) }, "public, max-age=30");
  }
  // what a save may add: { xp (to store), gain, cut, bank (the allowance left), dayKey }
  // k: 2 while the Starter Package's 2× EXP runs (worldOwn.xpBoostUntil): the allowance fills twice as fast, holds twice as
  // much and the day's limit doubles
  async function xpGuard(w, old, want, k = 1) {
    const dayKey = `worldXpDay/${w}_${seoulDay(now())}`;
    if (!old) { const xp = Math.min(want, xpAt(XP_RULES.firstLv)); return { xp, gain: 0, cut: want - xp, bank: XP_RULES.burst, dayKey }; }
    const oldXp = old.xpv === XP_VERSION ? old.xp || 0 : xpFromOld(old.xp);
    // the allowance carries over between saves (a save that adds nothing still keeps it, so it can't be topped up that way)
    const lv = levelOfXp(oldXp), cap = xpBankCap(lv) * k, mins = Math.max(0, (now() - (old.at || 0)) / 60e3);
    const bank = Math.min(cap, (old.xb == null ? cap : Math.max(0, old.xb)) + xpPerMin(lv) * k * mins);
    if (want <= oldXp) return { xp: want, gain: 0, cut: 0, bank: Math.floor(bank), dayKey }; // nothing new (or less: the player's own choice)
    const today = ((await getDocs([dayKey]))[dayKey] || {}).n || 0, dayLeft = Math.max(0, xpPerMin(lv) * k * XP_RULES.dayMin - today);
    const gain = Math.floor(Math.max(0, Math.min(want - oldXp, bank, dayLeft)));
    return { xp: oldXp + gain, gain, cut: want - oldXp - gain, bank: Math.floor(bank - gain), dayKey };
  }
  async function save(b) {
    const s = signer(b); if (s.err) return s.err;
    const key = `worldSave/${s.wallet}`, old = (await getDocs([key]))[key];
    if (old) await launch.preMark(s.wallet, old).catch(() => {}); // (this account was playing before the launch: its gift needs no level)
    if (old && now() - (old.at || 0) < 8000) return json(429, { error: "saving too often" });
    const data = cleanSave(b.data);
    // b417: a save behind the stored one (another device has played on since: a phone at level 30, a computer still
    // showing level 20) is refused, and the newer progress is sent back for the game to load. It used to be taken as
    // "the player's own choice", so the older device wrote over the newer progress. Starting over says so (reset).
    if (old && !b.reset) { const oldXp = old.xpv === XP_VERSION ? old.xp || 0 : xpFromOld(old.xp); if (data.xp < oldXp) return json(409, { error: "your progress on another device is newer", behind: true, save: old }); }
    if (data.rpg && data.rpg.bag.length > BAG_BASE) data.rpg.bag = data.rpg.bag.slice(0, bagSize(await shop.own(s.wallet)));
    // changing the character or the name (once they're set) takes a Character change (10,000 $ARCIRCLE); a name-only
    // change can also use an old ARCL Name change. Without one, the old character and name stay.
    if (old && old.tint != null && data.tint == null) data.tint = old.tint; // b447: a save without a colour (an older page) keeps the one it has
    const charCh = !!(old && old.char && ((data.char && data.char !== old.char) || (old.tint != null && data.tint !== old.tint))), nameCh /* a colour change counts as a character change (b447) */ = !!(old && old.name && data.name && data.name !== old.name);
    if (charCh || nameCh) {
      const o = await shop.own(s.wallet);
      if ((o.rechars || 0) > (o.recharsUsed || 0)) await setDoc(`worldOwn/${s.wallet}`, { ...o, recharsUsed: (o.recharsUsed || 0) + 1 });
      else if (!charCh && (o.renames || 0) > (o.renamesUsed || 0)) await setDoc(`worldOwn/${s.wallet}`, { ...o, renamesUsed: (o.renamesUsed || 0) + 1 });
      else { data.char = old.char; data.name = old.name; if (old.tint != null) data.tint = old.tint; else delete data.tint; }
    }
    // a weapon's kind (k) changed on a piece the last save already had takes a Weapon kind change (5,000 $ARCIRCLE)
    // each; without enough of them, those pieces keep their old kind
    if (old && old.rpg && data.rpg) {
      const kindOf = (it) => (Number.isInteger(it.k) ? it.k : idKind(it.id)), before = new Map();
      for (const it of [...Object.values(old.rpg.eq || {}), ...(old.rpg.bag || []), ...(old.rpg.store || [])]) if (it && String(it.b || "").startsWith("weapon-")) before.set(it.id, kindOf(it));
      const now_ = [...Object.values(data.rpg.eq || {}), ...data.rpg.bag, ...(data.rpg.store || [])].filter((it) => it && it.b.startsWith("weapon-") && before.has(it.id) && kindOf(it) !== before.get(it.id));
      if (now_.length) {
        const o = await shop.own(s.wallet), left = (o.rekinds || 0) - (o.rekindsUsed || 0);
        if (left >= now_.length) await setDoc(`worldOwn/${s.wallet}`, { ...o, rekindsUsed: (o.rekindsUsed || 0) + now_.length });
        else for (const it of now_) it.k = before.get(it.id);
      }
    }
    // durability (world-rpg-data.js): wearing down is the game's own business, but a piece that is MORE whole than the last
    // save had it needs a repair credit (worldOwn.repairIds: a $ARCIRCLE payment or a free repair at the island), one per
    // piece, used up here; without one the piece keeps its old durability
    if (old && old.rpg && data.rpg) {
      const before = new Map(); for (const it of [...Object.values(old.rpg.eq || {}), ...(old.rpg.bag || []), ...(old.rpg.store || [])]) if (it && DUR_MAX[it.r]) before.set(it.id, durOf(it));
      const up = [...Object.values(data.rpg.eq || {}), ...data.rpg.bag, ...(data.rpg.store || [])].filter((it) => it && DUR_MAX[it.r] && before.has(it.id) && durOf(it) > before.get(it.id));
      if (up.length) {
        const o = await shop.own(s.wallet), ids = Array.isArray(o.repairIds) ? o.repairIds : [], used = [];
        for (const it of up) { if (ids.includes(it.id) && !used.includes(it.id)) used.push(it.id); else if (before.get(it.id) >= DUR_MAX[it.r]) delete it.du; else it.du = before.get(it.id); }
        if (used.length) await setDoc(`worldOwn/${s.wallet}`, { ...o, repairIds: ids.filter((x) => !used.includes(x)) });
      }
    }
    // XP can only climb so fast (the rules: api/_world-social.mjs XP_RULES): the bank refills with time, a day has its
    // limit, and a first save brings at most level 30. Whatever's asked beyond that is cut, and the cut is noted.
    const ownB = (await shop.own(s.wallet).catch(() => ({}))) || {};
    const boostK = ((Number(ownB.xpBoostUntil) || 0) > now() ? 2 : 1) * ((Number(ownB.xp3Until) || 0) > now() ? 3 : 1) * weekendK(now()); // the Starter's 2×, a launch potion's 3× and the weekend's 2× stack
    // GM wallets (the team's own testing) aren't paced
    // XP the server granted itself (a won RAID QUEENS run: worldXpGrant) goes past that pace, once
    const gk = `worldXpGrant/${s.wallet}`; let extra = 0;
    if (old && !isGM(s.wallet)) { const gr = ((await getDocs([gk]))[gk] || {}).n || 0, oldXp = old.xpv === XP_VERSION ? old.xp || 0 : xpFromOld(old.xp); extra = Math.max(0, Math.min(gr, Math.floor(data.xp - oldXp))); }
    const g = isGM(s.wallet) ? { xp: data.xp, gain: 0, cut: 0, bank: old && old.xb != null ? old.xb : 0, dayKey: "" } : await xpGuard(s.wallet, old, data.xp - extra, boostK);
    data.xp = g.xp + extra;
    if (extra > 0) await commit([{ inc: gk, fields: { n: -extra } }]).catch(() => {});
    await setDoc(key, { ...data, at: now(), xb: g.bank });
    if (g.gain > 0) await commit([{ inc: g.dayKey, fields: { n: g.gain } }]).catch(() => {});
    if (g.cut > 0) await commit([{ inc: `worldXpFlag/${s.wallet}`, fields: { n: 1, cut: g.cut } }]).catch(() => {});
    await social.dirUpdate(s.wallet, data).catch(() => {}); // the player directory (Rankings → Players)
    if (data.rpg) await codex.mark(s.wallet, data.rpg, levelOfXp(data.xp)).catch(() => {}); // the item codex: new gear kinds held
    // an invited friend reaching level 5: the invite's reward, both sides (checked only around that level)
    const lvNow = levelOfXp(data.xp); let ref = null;
    if (lvNow >= 5 && lvNow <= 12) ref = await refer.due(s.wallet).catch(() => null);
    return json(200, { ok: true, at: now(), ...(ref ? { refer: ref } : {}) });
  }
  // ---- islands ----
  const lists = async () => (await getDocs(["worldStats/islands"]))["worldStats/islands"] || { top: [], recent: [] };
  async function islandSave(b) {
    const s = signer(b); if (s.err) return s.err;
    const o = await shop.own(s.wallet), items = o.items || [];
    const landed = !!(await land.ownerOf(s.wallet).catch(() => 0)); // a LAND owner builds 64×64 and more bricks
    const sizes = [36, ...(items.includes("isle48") ? [48] : []), ...(items.includes("isle64") || landed ? [64] : [])];
    const ok = checkBuild(b.data, sizes, landed ? LAND.bricks : 12000); if (!ok) return json(400, { error: "that island data isn't valid" });
    const theme = /^style-[a-z]+$/.test(String(b.theme || "")) && items.includes(b.theme) ? b.theme : "";
    const key = `worldIsland/${s.wallet}`, old = (await getDocs([key]))[key];
    if (old && now() - (old.at || 0) < 8000) return json(429, { error: "saving too often" });
    const name = cleanName(b.name), res = Math.max(0, Math.min(8, Math.floor(Number(b.res) || 0)));
    await setDoc(key, { data: String(b.data), name, n: ok.n, res, at: now(), N: ok.N, theme, ...village.onSave(old, b.data, theme) }); // the village's score and XP (api/_world-village.mjs)
    // the recent list (and the name / size in the top list)
    try {
      const L = await lists(), entry = { wallet: s.wallet, name, n: ok.n };
      const recent = [entry, ...(L.recent || []).filter((x) => x.wallet !== s.wallet)].slice(0, 12);
      const top = (L.top || []).map((x) => (x.wallet === s.wallet ? { ...x, name, n: ok.n } : x));
      if (ok.n > 0) await setDoc("worldStats/islands", { top, recent });
    } catch { /* the island itself is saved */ }
    return json(200, { ok: true, at: now(), n: ok.n, village: await village.view(s.wallet) });
  }
  async function island(wallet, fresh) {
    const w = lc(wallet); if (!isAddr(w)) return json(400, { error: "wallet must be an address" });
    const d = await getDocs([`worldIsland/${w}`, `worldIslandLikes/${w}`, `worldStamps/${w}`]);
    const isl = d[`worldIsland/${w}`];
    // a visit may be a minute old (s-maxage 60); your own island is asked with fresh=1 and never cached
    const cache = fresh ? "no-store" : "public, max-age=15, s-maxage=60";
    if (!isl) return json(200, { wallet: w, data: null }, cache);
    return json(200, { wallet: w, data: isl.data, name: isl.name || "", n: isl.n || 0, at: isl.at || 0, theme: isl.theme || "", likes: (d[`worldIslandLikes/${w}`] || {}).n || 0, stamps: pubStamps((d[`worldStamps/${w}`] || {}).list || []), village: await village.view(w) }, cache);
  }
  async function like(b) {
    const s = signer(b); if (s.err) return s.err;
    const target = lc(b.target); if (!isAddr(target)) return json(400, { error: "target must be an address" });
    if (target === s.wallet) return json(400, { error: "that's your own island" });
    const isl = (await getDocs([`worldIsland/${target}`]))[`worldIsland/${target}`]; if (!isl) return json(404, { error: "no island there" });
    const first = await commit([{ create: `worldLikes/${target}_${s.wallet}`, data: { at: now() } }]);
    if (!first.ok) return json(409, { error: "you already liked this island" });
    await commit([{ inc: `worldIslandLikes/${target}`, fields: { n: 1 } }]);
    await village.onLike(target).catch(() => {}); // a like is 10 village XP
    const likes = ((await getDocs([`worldIslandLikes/${target}`]))[`worldIslandLikes/${target}`] || {}).n || 1;
    try {
      const L = await lists();
      const top = [{ wallet: target, name: isl.name || "", n: isl.n || 0, likes }, ...(L.top || []).filter((x) => x.wallet !== target)].sort((a, c) => (c.likes || 0) - (a.likes || 0)).slice(0, 12);
      await setDoc("worldStats/islands", { top, recent: L.recent || [] });
    } catch { /* the like counts anyway */ }
    // only a like from a player of level 3+ counts for the rankings (the like itself is recorded either way)
    if (levelOfSave((await getDocs([`worldSave/${s.wallet}`]))[`worldSave/${s.wallet}`]) >= RANK_MIN_LV) await social.weekLike(target, isl).catch(() => {});
    return json(200, { ok: true, likes });
  }
  async function stamp(b) {
    const s = signer(b); if (s.err) return s.err;
    const target = lc(b.target); if (!isAddr(target)) return json(400, { error: "target must be an address" });
    const k = Math.floor(Number(b.k)); if (!(k >= 0 && k < STAMP_COUNT)) return json(400, { error: "unknown stamp" });
    if (target === s.wallet) return json(400, { error: "that's your own island" });
    const m = cleanNote(b.msg); if (m === null) return json(400, { error: "a note can't carry links, addresses or long numbers" });
    const day = new Date(now() + 9 * 3600e3).toISOString().slice(0, 10);
    const first = await commit([{ create: `worldStampSeen/${target}_${s.wallet}_${day}`, data: { at: now() } }]);
    if (!first.ok) return json(429, { error: "one stamp a day for each island" });
    const key = `worldStamps/${target}`, cur = (await getDocs([key]))[key] || { list: [] };
    const list = [...(cur.list || []), { k, w: shortW(s.wallet), at: now(), ...(m ? { m } : {}) }].slice(-30);
    await setDoc(key, { list });
    const arcl = await shop.stampCredit(s.wallet).catch(() => 0);
    return json(200, { ok: true, stamps: pubStamps(list), arcl });
  }
  async function lotSave(b) {
    const s = signer(b); if (s.err) return s.err;
    const coin = lc(b.coin); if (!isAddr(coin)) return json(400, { error: "coin must be an address" });
    // b-lpv: the Launchpad Village's lot sizes by tier (api/_world-lots.mjs), and the old Coin City ones (9, 13) still accepted
    const ok = checkBuild(b.data, [9, 13], 1200) || checkBuild(b.data, LOT_TIERS.map((x) => x.N), LOT_TIERS[LOT_TIERS.length - 1].max); if (!ok) return json(400, { error: "that lot data isn't valid" });
    const rec = deps.launchRecord ? await deps.launchRecord(coin) : null;
    if (!rec) return json(404, { error: "not an ArcPad coin" });
    if (lc(rec.creator) !== s.wallet) return json(403, { error: "only the wallet that launched this coin can build its lot" });
    if (ok.N === 13 && !(await shop.lotPremium(s.wallet, coin))) return json(403, { error: "a 13×13 lot is the premium lot" });
    if (ok.N > 13) { const t = await lotsM.tierOf(coin), T0 = LOT_TIERS[t], k = LOT_TIERS.findIndex((x) => x.N === ok.N);
      if (k > t) return json(403, { error: "this coin's lot isn't that big yet", tier: t, N: T0.N });
      if (ok.n > LOT_TIERS[k].max) return json(400, { error: "too many bricks for this lot", max: LOT_TIERS[k].max }); }
    const key = `worldLot/${coin}`, old = (await getDocs([key]))[key];
    if (old && now() - (old.at || 0) < 8000) return json(429, { error: "saving too often" });
    await setDoc(key, { data: String(b.data), n: ok.n, at: now(), by: s.wallet, N: ok.N });
    return json(200, { ok: true, at: now() });
  }
  async function lots(coins) {
    const list = [...new Set(String(coins || "").split(",").map(lc).filter(isAddr))].slice(0, 60);
    const d = await getDocs([...list.map((c) => `worldLot/${c}`), ...list.map((c) => `worldLotTier/${c}`)]), out = {}, tiers = {};
    for (const c of list) { const x = d[`worldLot/${c}`]; if (x && x.data) out[c] = { data: x.data, at: x.at || 0, N: x.N || 9 }; const t = d[`worldLotTier/${c}`]; if (t && t.t) tiers[c] = t.t | 0; }
    return json(200, { lots: out, tiers }); // (tiers: the biggest a lot has grown to, when that's above Starter)
  }
  async function lotTier(b) { const coin = lc(b.coin); if (!isAddr(coin)) return json(400, { error: "coin must be an address" }); const t = await lotsM.tierOf(coin); return json(200, { ok: true, tier: t, N: LOT_TIERS[t].N, max: LOT_TIERS[t].max }); }
  return {
    stats,
    // GET ?world=…
    async read(url) {
      const w = url.searchParams.get("world");
      if (w === "diag") { if (!on()) return json(503, { error: "storage is off" }); return diagView(); }
      // a wallet's $ARCIRCLE on Arc (public chain data), for when the browser's own RPC reads fail
      if (w === "holding") {
        const a = url.searchParams.get("wallet");
        if (!isAddr(a)) return json(400, { error: "wallet must be an address" });
        if (!deps.tokenBalance) return json(503, { error: "the balance check isn't available" });
        try { const v = BigInt(await deps.tokenBalance(ARCIRCLE_TOKEN, lc(a))); return json(200, { wallet: lc(a), arc: v.toString() }, "public, max-age=20"); }
        catch { return json(502, { error: "couldn't read the balance on Arc" }); }
      }
      if (w === "phase") { if (!on()) return json(200, { phase: PH.phase, epoch: PH.epoch, top: [] }); return phaseView(); }
      if (!on()) return json(200, { enabled: false, data: null, top: [], recent: [], lots: {} });
      if (w === "pk") return pk.read(w, url);
      if (w === "rq" || w === "rq-top") return rq.read(w, url);
      if (w === "mythic") return mythic.read(url);
      if (w === "mythic-market") return mythic.market();
      if (w === "mythic-top") return mythic.top();
      if (w === "mythic-nft") return mythic.nftMeta(url);
      if (w === "mythic-nftmkt") return mythic.nftMkt();
      if (w === "mythic-worn") return mythic.worn(url);
      if (w === "surv" || w === "surv-top" || w === "surv-daily" || w === "surv-endless") return surv.read(w, url);
      if (w === "rings" || w === "rings-top" || w === "rings-ta" || w === "rings-chal") return rings.read(w, url);
      if (w === "poker-rooms" || w === "poker-top" || w === "poker-fest" || w === "poker-rule") return poker.read(w, url);
      if (w === "dino" || w === "dino-nests" || w === "dino-ladder") return dino.read(w, url);
      if (w === "launch") return launch.read(w, url);
      if (w === "refer") return refer.read(w, url);
      if (w === "gm-rewards") return gmReward.read(w, url);
      if (w === "land" || w === "land-refunds") return land.read(w, url);
      if (w === "swap") { const a = url.searchParams.get("wallet"); if (!isAddr(a)) return json(400, { error: "wallet must be an address" }); return swap.view(lc(a)); }
      if (w === "jur-boss" || w === "jur-top" || w === "jur-camp") return jur.read(w, url);
      if (w === "agent-id") return agentDim.idFree(url.searchParams.get("id"));
      if (w === "agent-top") return agentDim.top();
      if (w === "agent-city") return agentDim.city();
      if (String(w).startsWith("studio-")) { const r = await studio.read(url); if (r) return r; }
      if (w === "codex") return codex.read(url);
      if (w === "agarena-top") { const r = await agArena.read(url); if (r) return r; }
      if (w === "agent-vault") { const a = url.searchParams.get("wallet"); if (!isAddr(a)) return json(400, { error: "wallet must be an address" }); return agentVault.view(lc(a)); }
      if (w === "agent-vault-tick") return agentVault.tick({ key: url.searchParams.get("key") || "" });
      if (w === "agent") { const a = url.searchParams.get("wallet"); if (!isAddr(a)) return json(400, { error: "wallet must be an address" }); return agentDim.view(lc(a)); }
      if (w === "market" || w === "market-me" || w === "arcl-tx") return market.read(w, url);
      if (w === "coins") return coins.read(w);
      if (w === "jur") { const a = url.searchParams.get("wallet"); if (!isAddr(a)) return json(400, { error: "wallet must be an address" }); return jur.view(lc(a)); }
      if (w === "welcome") { const a = url.searchParams.get("wallet"); if (!isAddr(a)) return json(400, { error: "wallet must be an address" }); return welcome.view(lc(a)); }
      if (w === "mine") { const a = url.searchParams.get("wallet"); if (!isAddr(a)) return json(400, { error: "wallet must be an address" }); return mine.view(lc(a), url.searchParams.has("board")); }
      if (w === "island") return island(url.searchParams.get("wallet"), url.searchParams.has("fresh"));
      if (w === "islands") { const L = await lists(); return json(200, { top: L.top || [], recent: L.recent || [] }); }
      if (w === "lots") return lots(url.searchParams.get("coins"));
      const r = (await shop.read(w, url)) || (await social.read(w, url)) || (await chat.read(w, url)) || (await support.read(w, url)) || (await crew.read(w, url)) || (await village.read(w, url)) || (await rank.read(w, url)) || (await defense.read(w, url)); if (r) return r;
      return json(400, { error: "unknown world view" });
    },
    async handle(b) {
      if (b.action === "world-gate") return gate(b);
      if (!on()) return json(503, { error: "storage is off" });
      if (b.action === "world-ping") return ping(b);
      if (b.action === "world-diag") return diag(b);
      if (b.action === "world-diag-user") return userLogRead(b);
      if (b.action === "world-login") return login(b);
      if (!String(b.action || "").startsWith("world-support-")) {
        // between the betas: GM wallets only
        if (PH.phase === "closed") { const s = b.wallet ? signer(b) : null; if (!s || s.err || !isGM(s.wallet)) return json(423, { error: "the closed beta has ended — the open beta is coming soon", closed: true }); }
        // a fresh start: a game still holding an earlier test's progress may not write it into this one
        if (PH.epoch >= 2 && Number(b.ep) !== PH.epoch) return json(409, { error: "this game is from an earlier test — reload the page", stale: true });
      }
      if (b.action === "world-cbt-claim") return cbtClaim(b);
      if (b.action === "world-save") return save(b);
      if (b.action === "world-island-save") return islandSave(b);
      if (b.action === "world-like") return like(b);
      if (b.action === "world-stamp") return stamp(b);
      if (b.action === "world-lot-save") return lotSave(b);
      if (b.action === "world-lot-tier") return lotTier(b);
      const r = (await mythic.handle(b)) || (await codex.handle(b)) || (await shop.handle(b)) || (await social.handle(b)) || (await chat.handle(b)) || (await support.handle(b)) || (await crew.handle(b)) || (await village.handle(b)) || (await rank.handle(b)) || (await defense.handle(b)) || (await jump.handle(b)) || (await mine.handle(b)) || (await welcome.handle(b)) || (await jur.handle(b)) || (await agentDim.handle(b)) || (await studio.handle(b)) || (await agArena.handle(b)) || (await agentVault.handle(b)) || (await swap.handle(b)) || (await surv.handle(b)) || (await pk.handle(b)) || (await rq.handle(b)) || (await rings.handle(b)) || (await poker.handle(b)) || (await dino.handle(b)) || (await launch.handle(b)) || (await refer.handle(b)) || (await gmReward.handle(b)) || (await land.handle(b)) || (await market.handle(b)); if (r) return r;
      return json(400, { error: "unknown action" });
    },
  };
}
