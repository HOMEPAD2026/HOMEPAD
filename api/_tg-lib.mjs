// api/_tg-lib.mjs — the pieces of ARCIA's Telegram bot (api/arcia-tg.mjs) that aren't commands:
// the Telegram client, the stored documents, per-person records, wallet-signature checks, the
// safety filters (keys, seed phrases, scams) and small text helpers.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";

export const SITE = "https://www.arcircle.app";
export const BOT_URL = "https://t.me/ARCIAonArc_bot";
export const CA = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
export const ARCIA_CA = "0x9da6d5ce413e94264ea411372459413334a83be5";
// + ARCIRCLE OMNI: $ARCIRCLE on Robinhood Chain and the Arc lockbox — ours, never flagged as a fake CA
export const OMNI_CAS = ["0x6f9ebd0dfc6de9ed47eec18efeb69a9b97c71ee4", "0x075e5dc585effe0bfdc1a0d452499ce7afe2fab6"];
export const OUR_CAS = [CA, ARCIA_CA, ...OMNI_CAS];
export const env = (k) => String(process.env[k] || "").trim();
export const h = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const lc = (a) => String(a || "").toLowerCase();
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const num = (n) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
export const compact = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : num(n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ADDR_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

// ---------------- Telegram ----------------
export async function tg(method, payload = {}, ms = 15000) {
  const token = env("TG_ARCIA_BOT_TOKEN");
  if (!token) return { ok: false, description: "TG_ARCIA_BOT_TOKEN isn't set" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(ms) });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok && j.description) j.description = String(j.description).replace(token, "…");
    return j;
  } catch (e) { return { ok: false, description: String(e && e.message || e).replace(token, "…") }; }
}
/// a file someone sent (a photo), as base64 — for ARCIA to look at
export async function fileBase64(fileId, maxBytes = 4_000_000) {
  const token = env("TG_ARCIA_BOT_TOKEN");
  const f = await tg("getFile", { file_id: fileId });
  if (!f.ok || !f.result.file_path || (f.result.file_size || 0) > maxBytes) return null;
  try {
    const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.result.file_path}`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    const ext = lc(f.result.file_path.split(".").pop());
    return { data: b.toString("base64"), type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
  } catch { return null; }
}
export const kb = (rows) => ({ reply_markup: { inline_keyboard: rows.filter((r) => r && r.length) } });
/// "typing…" that lasts: Telegram drops the indicator after ~5 s, so it's re-sent every 4 s until stop()
export function keepTyping(chat_id, action = "typing") {
  let on = true;
  const beat = () => { if (on) tg("sendChatAction", { chat_id, action }, 5000); };
  beat();
  const t = setInterval(beat, 4000);
  return () => { on = false; clearInterval(t); };
}
// full-screen effects Telegram plays on a message in a private chat
export const EFFECT = { party: "5046509860389126442", fire: "5104841245755180586", heart: "5044134455711629726", like: "5107584321108051014" };
/// send, and if Telegram refuses the effect (groups, old clients), send again without it
export async function sendWithEffect(payload, effect) {
  if (effect) { const r = await tg(payload.photo ? "sendPhoto" : "sendMessage", { ...payload, message_effect_id: effect }); if (r.ok) return r; }
  return tg(payload.photo ? "sendPhoto" : "sendMessage", payload);
}

// ---------------- the store ----------------
const mem = new Map();
export async function getDoc(k, ttl = 0) {
  const m = mem.get(k);
  if (m && ttl && Date.now() - m.at < ttl) return m.v;
  if (!storeEnabled()) return m ? m.v : null;
  try { const v = (await getDocs([k]))[k] || null; mem.set(k, { v, at: Date.now() }); return v; } catch { return m ? m.v : null; }
}
export async function putDoc(k, v) {
  mem.set(k, { v, at: Date.now() });
  if (storeEnabled()) await setDoc(k, v).catch(() => null);
}
export async function getMany(keys) {
  if (!storeEnabled()) return Object.fromEntries(keys.map((k) => [k, (mem.get(k) || {}).v || null]));
  try { return await getDocs(keys); } catch { return {}; }
}
export const DOC = {
  cfg: "tgArcia/v1", seen: "tgArcia/seen", pending: "tgArcia/pending", subs: "tgArcia/subs", tick: "tgArcia/tick",
  gm: "tgArcia/gm", links: "tgArcia/links", sched: "tgArcia/sched", usage: (d = day()) => `tgArcia/usage_${d}`,
  user: (uid) => `tgArciaUser/${uid}`, conv: (k) => `tgArciaConv/${k}`,
};
export async function loadCfg() {
  const d = (await getDoc(DOC.cfg, 4000)) || {};
  return { admins: d.admins || [], targets: d.targets || [], claim: d.claim || null, me: d.me || null, chats: d.chats || {}, lastError: d.lastError || null, stickers: d.stickers || null, mirror: !!d.mirror };
}
export const saveCfg = (c) => putDoc(DOC.cfg, c);
export const chatCfg = (c, id) => ({ guard: true, autoscan: true, captcha: false, gate: 0, lang: "", ...(c.chats[String(id)] || {}) });
export async function setChatCfg(c, id, patch) { c.chats[String(id)] = { ...chatCfg(c, id), ...patch }; await saveCfg(c); return c.chats[String(id)]; }
export async function loadUser(uid) { return (await getDoc(DOC.user(uid), 3000)) || { uid }; }
export const saveUser = (u) => putDoc(DOC.user(u.uid), u);

/// today's counters: chat answers, commands, photos, lucky spins — one document per day
export async function bump(kind, key, by = 1) {
  const k = DOC.usage();
  const d = (await getDoc(k, 2000)) || {};
  d[kind] = d[kind] || {};
  d[kind][key] = (d[kind][key] || 0) + by;
  await putDoc(k, d);
  return d[kind][key];
}
export async function usage(kind, key) { const d = (await getDoc(DOC.usage(), 2000)) || {}; return key == null ? d[kind] || {} : ((d[kind] || {})[key] || 0); }

/// updates Telegram re-sends are answered once
const seenMem = new Set();
export async function firstTime(updateId) {
  if (seenMem.has(updateId)) return false;
  seenMem.add(updateId);
  if (seenMem.size > 1000) seenMem.clear();
  const d = (await getDoc(DOC.seen)) || { ids: [] };
  if (d.ids.includes(updateId)) return false;
  d.ids = [...d.ids, updateId].slice(-150);
  await putDoc(DOC.seen, d);
  return true;
}

// per person, per minute (commands); per chat, per window (reactions, auto-scans)
const hits = new Map();
export function tooMany(key, n, ms) {
  const now = Date.now(), a = (hits.get(key) || []).filter((t) => now - t < ms);
  if (a.length >= n) { hits.set(key, a); return true; }
  a.push(now); hits.set(key, a);
  if (hits.size > 5000) hits.clear();
  return false;
}

// errors go to the admins' DMs, the same error at most every 10 minutes
const lastErr = new Map();
export async function reportError(where, e) {
  const msg = `${where}: ${String(e && e.message || e).slice(0, 300)}`;
  console.error("arcia-tg", msg);
  if (Date.now() - (lastErr.get(msg) || 0) < 600e3) return;
  lastErr.set(msg, Date.now());
  const c = await loadCfg().catch(() => null);
  if (!c) return;
  c.lastError = { msg, t: Date.now() };
  await saveCfg(c);
  for (const a of c.admins.slice(0, 5)) await tg("sendMessage", { chat_id: a, text: `⚠️ ARCIA bot error\n${msg}`, link_preview_options: { is_disabled: true } }, 6000);
}

// ---------------- wallet signatures (linking a wallet to a Telegram account) ----------------
const hexToBytes = (x) => { x = String(x).replace(/^0x/, ""); const a = new Uint8Array(x.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(x.slice(i * 2, i * 2 + 2), 16); return a; };
const bytesToHex = (b) => "0x" + Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
export const linkMessage = (uid, code) => `Link my wallet to ARCIA on Telegram\n\nTelegram ID: ${uid}\nCode: ${code}\n\nThis signature only proves I own this wallet. It can't move funds.`;
/// who signed `message` with personal_sign (EIP-191), or null
export function personalSigner(message, sigHex) {
  try {
    const m = new TextEncoder().encode(message);
    const digest = keccak_256(new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`), ...m]));
    const b = hexToBytes(sigHex);
    if (b.length !== 65) return null;
    let v = b[64]; if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return null;
    const pub = secp256k1.recoverPublicKey(new Uint8Array([v, ...b.subarray(0, 64)]), digest, { prehash: false });
    return lc(bytesToHex(keccak_256(secp256k1.Point.fromBytes(pub).toBytes(false).subarray(1)).subarray(12)));
  } catch { return null; }
}

// ---------------- safety filters ----------------
/// a private key or a seed phrase in a message (a 0x… 64-hex that's a real Arc transaction is fine —
/// the caller checks that). Returns "key" | "maybe-key" | "seed" | null.
export function secretIn(text) {
  const t = String(text || "");
  if (/(^|[^0-9a-fA-Fx])[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(t)) return "key";
  if (/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(t) && /\b(private|priv|key|secret|pk)\b/i.test(t)) return "key";
  if (/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(t)) return "maybe-key";
  // 12 / 15 / 18 / 21 / 24 lowercase words of 3–8 letters in a row, nothing else on the line
  for (const line of t.split(/\n+/)) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if ([12, 15, 18, 21, 24].includes(words.length) && words.every((x) => /^[a-z]{3,8}$/.test(x)) && new Set(words).size >= words.length - 2) return "seed";
  }
  return null;
}
const ALLOW_HOSTS = /(^|\.)(arcircle\.app|x\.com|twitter\.com|t\.me|telegram\.org|argus\.world|arcscan\.app|etherscan\.io|circle\.com|arc\.network|dexscreener\.com|github\.com|youtube\.com|youtu\.be)$/i;
export function linksIn(m) {
  const t = String(m.text || m.caption || "");
  const out = [];
  for (const e of [...(m.entities || []), ...(m.caption_entities || [])]) {
    if (e.type === "url") out.push(t.substr(e.offset, e.length));
    if (e.type === "text_link" && e.url) out.push(e.url);
  }
  for (const x of t.match(/\bhttps?:\/\/\S+/gi) || []) out.push(x);
  return [...new Set(out)].map((u) => { try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).host.toLowerCase(); } catch { return ""; } }).filter(Boolean);
}
const BAIT = /\b(claim|giveaway|reward[s]?|free\s+(token|airdrop|usdc)|connect\s+(your\s+)?wallet|validate|verify\s+(your\s+)?wallet|sync\s+(your\s+)?wallet|restore|recovery|support\s+team|dm\s+me|inbox\s+me|contact\s+(admin|support)|whatsapp)\b/i;
/// why a group message looks like a scam, or null. newbie: joined in the last 72 h.
export function scamReason(m, { newbie = false } = {}) {
  const t = String(m.text || m.caption || "");
  const hosts = linksIn(m).filter((x) => !ALLOW_HOSTS.test(x));
  if (hosts.length && (newbie || BAIT.test(t))) return `link to ${hosts[0]}`;
  const addrs = (t.match(ADDR_RE) || []).map(lc);
  // our two coins: an address posted as $ARCIRCLE or $ARCIA that is neither of them
  if (/\$arcia\b/i.test(t) && /\b(ca|contract|address|token)\b/i.test(t) && addrs.length && !addrs.some((a) => OUR_CAS.includes(a))) return "a contract address posted as $ARCIA that isn't $ARCIA";
  if (/arcircle|\$arc\b/i.test(t) && /\b(ca|contract|address|token)\b/i.test(t) && addrs.length && !addrs.some((a) => OUR_CAS.includes(a))) return "a contract address posted as $ARCIRCLE that isn't $ARCIRCLE";
  const name = `${(m.from && m.from.first_name) || ""} ${(m.from && m.from.last_name) || ""} ${(m.from && m.from.username) || ""}`;
  if (/\b(admin|support|moderator|mod|official|arcircle|arcia)\b/i.test(name) && /\b(dm|inbox|message me|contact me|pm)\b/i.test(t)) return "someone posing as the team";
  return null;
}
