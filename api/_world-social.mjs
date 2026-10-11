// api/_world-social.mjs — ARCIRCLE World's shared moments: guestbook notes on stamps, the weekly island contest,
// friends' cards, the wanderers you see in town (other players' last spots) and the weekly raid boss.
//
//   POST { action: "world-stamp-hide", …signature, at }   the island's owner hides (or shows again) one note
//   GET  ?world=island-week                               { week, top: [{ wallet, name, n, likes }] }  likes this week
//   GET  ?world=friends&wallets=0x…,…                     { friends: { wallet: { name, lv, seen, isle, likes } } }
//   GET  ?world=ghosts                                    { ghosts: [{ t, x, z, c, lv }] }  last 2 minutes
//   GET  ?world=raid&wallet=0x…?                          { week, hp, max, down, top, mine, claimed }
//   POST { action: "world-raid-hit", …signature, dmg }    damage dealt in the last 5 s, capped at 60 × saved level
//   POST { action: "world-raid-claim", …signature }       after the raid falls: a small ARCL thank-you, once a week
//
// The server can't watch a fight, so the raid trusts the game within a cap (one report per 5 s, 60 × level each) and
// its ARCL stays small (40 a week, inside the daily cap); the gear and XP are the game's own.
// A note is plain text, 60 characters, no links, no addresses and no long numbers; its island's owner can hide it.
// Firestore: worldIslandWeek/<week>_<wallet> { n } · worldStats/islandWeek_<week> { top } · worldStats/ghosts { list }
//            worldStats/raid_<week> { dmg } · worldRaidDmg/<week>_<wallet> { n } · worldStats/raidTop_<week> { top }
//            worldRaidGap/<week>_<wallet>_<slot> · worldRaidClaim/<week>_<wallet>
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
export const RAID_HP = 500000, RAID_ARCL = 40, RAID_MIN = 600, RAID_GAP = 5;
export const NOTE_MAX = 60;
const CHARS = /^(bot|male-[a-f]|female-[a-f])$/;

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
export const levelOf = (xp) => 1 + Math.floor((Number(xp) || 0) / 100);

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
  async function friends(wallets) {
    const list = [...new Set(String(wallets || "").split(",").map(lc).filter(isAddr))].slice(0, 30);
    const keys = list.flatMap((w) => [`worldSave/${w}`, `worldIsland/${w}`, `worldIslandLikes/${w}`]);
    const d = list.length ? await getDocs(keys) : {}, out = {};
    for (const w of list) {
      const sv = d[`worldSave/${w}`] || null, isl = d[`worldIsland/${w}`] || null;
      out[w] = { name: (sv && sv.name) || "", lv: sv ? levelOf(sv.xp) : 0, seen: sv && sv.at ? Math.floor(sv.at / 600e3) * 600e3 : 0, char: (sv && sv.char) || "", isle: isl ? isl.n || 0 : 0, likes: (d[`worldIslandLikes/${w}`] || {}).n || 0 };
    }
    return json(200, { friends: out }, "no-store");
  }

  // ---- wanderers: where players were in the last two minutes (no names: the ping isn't signed) ----
  const GHOST_LIFE = 120e3;
  async function ghostPing(id, g) {
    if (!g || typeof g !== "object") return;
    const x = Math.round(Number(g.x) * 10) / 10, z = Math.round(Number(g.z) * 10) / 10;
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > 150) return;
    const t = tagOf(id), c = CHARS.test(String(g.c || "")) ? g.c : "bot", lv = Math.max(1, Math.min(99, Math.floor(Number(g.lv) || 1)));
    const cur = (await one("worldStats/ghosts")) || { list: [] }, at = now();
    const list = [{ t, x, z, c, lv, at }, ...(cur.list || []).filter((y) => y.t !== t && at - y.at < GHOST_LIFE)].slice(0, 16);
    await setDoc("worldStats/ghosts", { list });
  }
  async function ghosts() {
    const at = now();
    return json(200, { ghosts: (((await one("worldStats/ghosts")) || {}).list || []).filter((y) => at - y.at < GHOST_LIFE).map(({ t, x, z, c, lv }) => ({ t, x, z, c, lv })) }, "public, max-age=10");
  }

  // ---- the weekly raid boss ----
  async function raidState(w) {
    const wk = isoWeek(now());
    const keys = [`worldStats/raid_${wk}`, `worldStats/raidTop_${wk}`, ...(w ? [`worldRaidDmg/${wk}_${w}`, `worldRaidClaim/${wk}_${w}`] : [])];
    const d = await getDocs(keys), dmg = (d[`worldStats/raid_${wk}`] || {}).dmg || 0;
    return { week: wk, max: RAID_HP, hp: Math.max(0, RAID_HP - dmg), down: dmg >= RAID_HP, top: ((d[`worldStats/raidTop_${wk}`] || {}).top || []).slice(0, 10), mine: w ? (d[`worldRaidDmg/${wk}_${w}`] || {}).n || 0 : 0, claimed: w ? !!d[`worldRaidClaim/${wk}_${w}`] : false, need: RAID_MIN, arcl: RAID_ARCL };
  }
  async function raidHit(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, wk = isoWeek(now());
    const st = await raidState(w); if (st.down) return json(200, { ok: true, ...pub(st), counted: 0 });
    const lv = levelOf(((await one(`worldSave/${w}`)) || {}).xp);
    if (lv < 10) return json(400, { error: "the raid is for level 10 and up (your saved level is " + lv + ")" });
    const slot = Math.floor(now() / (RAID_GAP * 1000));
    if (!(await commit([{ create: `worldRaidGap/${wk}_${w}_${slot}`, data: { at: now() } }])).ok) return json(429, { error: "one report every 5 seconds" });
    const n = Math.max(0, Math.min(60 * lv, Math.floor(Number(b.dmg) || 0), st.hp));
    if (!n) return json(200, { ok: true, ...pub(st), counted: 0 });
    await commit([{ inc: `worldStats/raid_${wk}`, fields: { dmg: n } }, { inc: `worldRaidDmg/${wk}_${w}`, fields: { n } }]);
    try {
      const mine = st.mine + n, name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16), key = `worldStats/raidTop_${wk}`;
      const cur = (await one(key)) || { top: [] };
      const top = [{ w: short(w), id: w, n: mine, name }, ...(cur.top || []).filter((x) => x.id !== w)].sort((a, c) => c.n - a.n).slice(0, 20);
      await setDoc(key, { top });
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
  const pub = (st) => ({ ...st, top: st.top.map(({ w: s, n, name }) => ({ w: s, n, name: name || "" })) });

  return {
    weekLike, ghostPing,
    async read(view, url) {
      if (view === "island-week") return islandWeek();
      if (view === "friends") return friends(url.searchParams.get("wallets"));
      if (view === "ghosts") return ghosts();
      if (view === "raid") { const w = lc(url.searchParams.get("wallet")); return json(200, pub(await raidState(isAddr(w) ? w : "")), isAddr(w) ? "no-store" : "public, max-age=10"); }
      return null;
    },
    async handle(b) {
      if (b.action === "world-stamp-hide") return stampHide(b);
      if (b.action === "world-raid-hit") return raidHit(b);
      if (b.action === "world-raid-claim") return raidClaim(b);
      return null;
    },
  };
}
