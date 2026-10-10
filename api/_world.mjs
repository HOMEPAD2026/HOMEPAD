// api/_world.mjs — ARCIRCLE World (/play) on the server: sign in with a wallet, progress saved per wallet, and the
// counts shown in the game and on the home gate (who's in the world now, how many have visited).
//
//   POST /api/social { action: "world-ping", id }                         presence + first-visit count → stats
//   POST /api/social { action: "world-login", wallet, issued, signature } signed sign-in → { save } (first sign-in counts a player)
//   POST /api/social { action: "world-save", wallet, issued, signature, data }  progress for that wallet (same signature, 24 h)
//   GET  /api/social?world=stats                                          { online, visitors, players }
//
// The signature is a free personal_sign of loginMessage(); it proves the wallet and moves nothing. It's kept in the
// player's browser for 24 h and sent with each save, so a save never needs another wallet pop-up.
// "Online" counts distinct visitors per 2-minute window (create-only marker + increment), the larger of this window
// and the last one. Progress is self-reported by the game, so it's for play (character, XP, quests), never rewards.
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

/// deps: { getDocs, setDoc, commit, storeEnabled, recover, issuedOk, json, now? }
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
  return {
    stats,
    async handle(b) {
      if (!on()) return json(503, { error: "storage is off" });
      if (b.action === "world-ping") return ping(b);
      if (b.action === "world-login") return login(b);
      if (b.action === "world-save") return save(b);
      return json(400, { error: "unknown action" });
    },
  };
}
