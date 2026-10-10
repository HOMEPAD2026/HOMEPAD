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
//   POST { action: "world-stamp", …signature, target, k }    a preset stamp (no free text), one a day per island
//   POST { action: "world-lot-save", …signature, coin, data }  a coin's Coin City lot (9×9), its creator only
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
// Firestore: worldStats/main { visitors, players } · worldOnline/<window> { n } · worldSeen/<window>_<id> · worldVisitors/<id>
//            worldPlayers/<wallet> · worldSave/<wallet>
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const WINDOW = 120e3;
const CHARS = new Set(["bot", ..."abcdef".split("").map((c) => "male-" + c), ..."abcdef".split("").map((c) => "female-" + c)]);

export const loginMessage = (wallet, issued) =>
  `ARCIRCLE World — sign in\n\nWallet: ${lc(wallet)}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;

const ids = (a, re, max) => (Array.isArray(a) ? [...new Set(a.map(String).filter((x) => re.test(x)))].slice(0, max) : []);
/// what the game may store: anything else is dropped
export function cleanSave(d) {
  const o = d && typeof d === "object" ? d : {};
  const xp = Math.max(0, Math.min(1e6, Math.floor(Number(o.xp) || 0)));
  const name = String(o.name || "").replace(/[\u0000-\u001f<>"'`\\]/g, "").trim().slice(0, 16);
  return {
    xp, name, char: CHARS.has(o.char) ? o.char : "",
    visited: ids(o.visited, /^[a-z0-9-]{1,24}$/, 40), beaten: ids(o.beaten, /^[a-z0-9-]{1,24}$/, 20),
    cards: ids(o.cards, /^c\d{1,2}$/, 40), quests: ids(o.quests, /^[a-z0-9-]{1,24}$/, 60), badges: ids(o.badges, /^[a-z0-9-]{1,24}$/, 40),
    daily: o.daily && typeof o.daily === "object" ? { day: String(o.daily.day || "").slice(0, 10), done: ids(o.daily.done, /^[a-z0-9-]{1,24}$/, 10), streak: Math.max(0, Math.min(3650, Math.floor(Number(o.daily.streak) || 0))) } : null,
  };
}

// a build: base64 of [1, N, (x, y, z, kind, rot|colour<<2) × n]; null when it isn't one
export function checkBuild(data, N, max) {
  const s = String(data || "");
  if (!s || s.length > 48000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  let bin; try { bin = atob(s); } catch { return null; }
  if (bin.length < 2 || bin.charCodeAt(0) !== 1 || bin.charCodeAt(1) !== N || (bin.length - 2) % 5 !== 0) return null;
  const n = (bin.length - 2) / 5;
  if (n > max) return null;
  for (let i = 2; i < bin.length; i += 5) if (bin.charCodeAt(i) >= N || bin.charCodeAt(i + 2) >= N || bin.charCodeAt(i + 1) >= 24) return null;
  return { n };
}
export const STAMP_COUNT = 6;
const shortW = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const cleanName = (n) => String(n || "").replace(/[\u0000-\u001f<>"'`\\]/g, "").trim().slice(0, 16);

/// deps: { getDocs, setDoc, commit, storeEnabled, recover, issuedOk, json, launchRecord?, now? }
export function make(deps) {
  const { getDocs, setDoc, commit, recover, issuedOk, json } = deps;
  const now = () => (deps.now ? deps.now() : Date.now());
  const on = () => (deps.storeEnabled ? deps.storeEnabled() : true);
  async function stats() {
    const w = Math.floor(now() / WINDOW);
    const d = await getDocs(["worldStats/main", `worldOnline/${w}`, `worldOnline/${w - 1}`]);
    const m = d["worldStats/main"] || {}, a = (d[`worldOnline/${w}`] || {}).n || 0, b = (d[`worldOnline/${w - 1}`] || {}).n || 0;
    return { online: Math.max(a, b), visitors: m.visitors || 0, players: m.players || 0 };
  }
  async function ping(b) {
    const id = String(b.id || "");
    if (!/^[a-z0-9]{12,40}$/.test(id)) return json(400, { error: "bad id" });
    const w = Math.floor(now() / WINDOW);
    const first = await commit([{ create: `worldVisitors/${id}`, data: { at: now() } }]);
    if (first.ok) await commit([{ inc: "worldStats/main", fields: { visitors: 1 } }]);
    const seen = await commit([{ create: `worldSeen/${w}_${id}`, data: { at: now() } }]);
    if (seen.ok) await commit([{ inc: `worldOnline/${w}`, fields: { n: 1 } }]);
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
  async function login(b) {
    const s = signer(b); if (s.err) return s.err;
    const first = await commit([{ create: `worldPlayers/${s.wallet}`, data: { at: now() } }]);
    if (first.ok) await commit([{ inc: "worldStats/main", fields: { players: 1 } }]);
    const d = await getDocs([`worldSave/${s.wallet}`]);
    return json(200, { ok: true, wallet: s.wallet, firstTime: !!first.ok, save: d[`worldSave/${s.wallet}`] || null });
  }
  async function save(b) {
    const s = signer(b); if (s.err) return s.err;
    const key = `worldSave/${s.wallet}`, old = (await getDocs([key]))[key];
    if (old && now() - (old.at || 0) < 8000) return json(429, { error: "saving too often" });
    const data = cleanSave(b.data);
    // XP can only climb so fast between saves (a save at least every few minutes while playing)
    if (old && data.xp > (old.xp || 0) + 3000) data.xp = (old.xp || 0) + 3000;
    await setDoc(key, { ...data, at: now() });
    return json(200, { ok: true, at: now() });
  }
  // ---- islands ----
  const lists = async () => (await getDocs(["worldStats/islands"]))["worldStats/islands"] || { top: [], recent: [] };
  async function islandSave(b) {
    const s = signer(b); if (s.err) return s.err;
    const ok = checkBuild(b.data, 36, 6000); if (!ok) return json(400, { error: "that island data isn't valid" });
    const key = `worldIsland/${s.wallet}`, old = (await getDocs([key]))[key];
    if (old && now() - (old.at || 0) < 8000) return json(429, { error: "saving too often" });
    const name = cleanName(b.name), res = Math.max(0, Math.min(8, Math.floor(Number(b.res) || 0)));
    await setDoc(key, { data: String(b.data), name, n: ok.n, res, at: now() });
    // the recent list (and the name / size in the top list)
    try {
      const L = await lists(), entry = { wallet: s.wallet, name, n: ok.n };
      const recent = [entry, ...(L.recent || []).filter((x) => x.wallet !== s.wallet)].slice(0, 12);
      const top = (L.top || []).map((x) => (x.wallet === s.wallet ? { ...x, name, n: ok.n } : x));
      if (ok.n > 0) await setDoc("worldStats/islands", { top, recent });
    } catch { /* the island itself is saved */ }
    return json(200, { ok: true, at: now(), n: ok.n });
  }
  async function island(wallet) {
    const w = lc(wallet); if (!isAddr(w)) return json(400, { error: "wallet must be an address" });
    const d = await getDocs([`worldIsland/${w}`, `worldIslandLikes/${w}`, `worldStamps/${w}`]);
    const isl = d[`worldIsland/${w}`];
    if (!isl) return json(200, { wallet: w, data: null });
    return json(200, { wallet: w, data: isl.data, name: isl.name || "", n: isl.n || 0, at: isl.at || 0, likes: (d[`worldIslandLikes/${w}`] || {}).n || 0, stamps: ((d[`worldStamps/${w}`] || {}).list || []).slice(-20) });
  }
  async function like(b) {
    const s = signer(b); if (s.err) return s.err;
    const target = lc(b.target); if (!isAddr(target)) return json(400, { error: "target must be an address" });
    if (target === s.wallet) return json(400, { error: "that's your own island" });
    const isl = (await getDocs([`worldIsland/${target}`]))[`worldIsland/${target}`]; if (!isl) return json(404, { error: "no island there" });
    const first = await commit([{ create: `worldLikes/${target}_${s.wallet}`, data: { at: now() } }]);
    if (!first.ok) return json(409, { error: "you already liked this island" });
    await commit([{ inc: `worldIslandLikes/${target}`, fields: { n: 1 } }]);
    const likes = ((await getDocs([`worldIslandLikes/${target}`]))[`worldIslandLikes/${target}`] || {}).n || 1;
    try {
      const L = await lists();
      const top = [{ wallet: target, name: isl.name || "", n: isl.n || 0, likes }, ...(L.top || []).filter((x) => x.wallet !== target)].sort((a, c) => (c.likes || 0) - (a.likes || 0)).slice(0, 12);
      await setDoc("worldStats/islands", { top, recent: L.recent || [] });
    } catch { /* the like counts anyway */ }
    return json(200, { ok: true, likes });
  }
  async function stamp(b) {
    const s = signer(b); if (s.err) return s.err;
    const target = lc(b.target); if (!isAddr(target)) return json(400, { error: "target must be an address" });
    const k = Math.floor(Number(b.k)); if (!(k >= 0 && k < STAMP_COUNT)) return json(400, { error: "unknown stamp" });
    if (target === s.wallet) return json(400, { error: "that's your own island" });
    const day = new Date(now() + 9 * 3600e3).toISOString().slice(0, 10);
    const first = await commit([{ create: `worldStampSeen/${target}_${s.wallet}_${day}`, data: { at: now() } }]);
    if (!first.ok) return json(429, { error: "one stamp a day for each island" });
    const key = `worldStamps/${target}`, cur = (await getDocs([key]))[key] || { list: [] };
    const list = [...(cur.list || []), { k, w: shortW(s.wallet), at: now() }].slice(-30);
    await setDoc(key, { list });
    return json(200, { ok: true, stamps: list.slice(-20) });
  }
  async function lotSave(b) {
    const s = signer(b); if (s.err) return s.err;
    const coin = lc(b.coin); if (!isAddr(coin)) return json(400, { error: "coin must be an address" });
    const ok = checkBuild(b.data, 9, 600); if (!ok) return json(400, { error: "that lot data isn't valid" });
    const rec = deps.launchRecord ? await deps.launchRecord(coin) : null;
    if (!rec) return json(404, { error: "not an ArcPad coin" });
    if (lc(rec.creator) !== s.wallet) return json(403, { error: "only the wallet that launched this coin can build its lot" });
    const key = `worldLot/${coin}`, old = (await getDocs([key]))[key];
    if (old && now() - (old.at || 0) < 8000) return json(429, { error: "saving too often" });
    await setDoc(key, { data: String(b.data), n: ok.n, at: now(), by: s.wallet });
    return json(200, { ok: true, at: now() });
  }
  async function lots(coins) {
    const list = [...new Set(String(coins || "").split(",").map(lc).filter(isAddr))].slice(0, 24);
    const d = await getDocs(list.map((c) => `worldLot/${c}`)), out = {};
    for (const c of list) { const x = d[`worldLot/${c}`]; if (x && x.data) out[c] = { data: x.data, at: x.at || 0 }; }
    return json(200, { lots: out });
  }
  return {
    stats,
    // GET ?world=…
    async read(url) {
      const w = url.searchParams.get("world");
      if (!on()) return json(200, { enabled: false, data: null, top: [], recent: [], lots: {} });
      if (w === "island") return island(url.searchParams.get("wallet"));
      if (w === "islands") { const L = await lists(); return json(200, { top: L.top || [], recent: L.recent || [] }); }
      if (w === "lots") return lots(url.searchParams.get("coins"));
      return json(400, { error: "unknown world view" });
    },
    async handle(b) {
      if (!on()) return json(503, { error: "storage is off" });
      if (b.action === "world-ping") return ping(b);
      if (b.action === "world-login") return login(b);
      if (b.action === "world-save") return save(b);
      if (b.action === "world-island-save") return islandSave(b);
      if (b.action === "world-like") return like(b);
      if (b.action === "world-stamp") return stamp(b);
      if (b.action === "world-lot-save") return lotSave(b);
      return json(400, { error: "unknown action" });
    },
  };
}
