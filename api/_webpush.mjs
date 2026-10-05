// api/_webpush.mjs — Web Push for ARCIRCLE Orders (v4): a fill, a triggered stop or a price alert reaches the browser
// even with the tab closed. No extra package: RFC 8291 message encryption (aes128gcm) and an RFC 8292 VAPID token,
// with @noble/curves (P-256 ECDH and ES256) and @noble/hashes (HKDF-SHA256); AES-128-GCM through WebCrypto.
//   env VAPID_PUBLIC_KEY   base64url, the uncompressed P-256 point (65 bytes) — the page subscribes with it
//   env VAPID_PRIVATE_KEY  base64url, the 32-byte private scalar (entered in Vercel only; never in the repo)
//   env VAPID_SUBJECT      optional contact for push services (default https://www.arcircle.app)
// Subscriptions are kept per wallet (orders/push_<wallet>, at most 5 browsers), authorized by the same signature that
// opens a wallet's orders (orders.viewOk); orders/_push lists the wallets. A subscription the push service says is
// gone (404 / 410) is dropped.
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const enc = new TextEncoder();
export const b64u = (b) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const unb64u = (s) => { const t = String(s || "").replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

/// the VAPID pair from the environment (null until both are set and the private key matches the public one)
export function vapid() {
  const pub = env("VAPID_PUBLIC_KEY"), priv = env("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return null;
  try {
    const P = unb64u(pub), d = unb64u(priv);
    if (P.length !== 65 || P[0] !== 4 || d.length !== 32) return null;
    if (b64u(p256.getPublicKey(d, false)) !== b64u(P)) return null;
    return { pub, P, d, subject: env("VAPID_SUBJECT") || "https://www.arcircle.app" };
  } catch { return null; }
}
export const publicKey = () => { const v = vapid(); return v ? v.pub : null; };

/// push services the page's browsers use; anything else is refused (no fetching arbitrary URLs from the server)
const HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/, /^android\.googleapis\.com$/];
export function normSub(x) {
  if (!x || typeof x !== "object") return null;
  let u;
  try { u = new URL(String(x.endpoint || "")); } catch { return null; }
  if (u.protocol !== "https:" || !HOSTS.some((r) => r.test(u.hostname)) || String(x.endpoint).length > 800) return null;
  const k = x.keys || {};
  try { const p = unb64u(k.p256dh), a = unb64u(k.auth); if (p.length !== 65 || p[0] !== 4 || a.length !== 16) return null; } catch { return null; }
  return { endpoint: String(x.endpoint), keys: { p256dh: String(k.p256dh), auth: String(k.auth) } };
}

/// RFC 8291: the payload encrypted for one subscription (one aes128gcm record). `rand` is for tests only.
export async function encrypt(sub, plain, rand = null) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const asPriv = rand ? rand.priv : p256.utils.randomSecretKey();
  const asPub = p256.getPublicKey(asPriv, false);
  const shared = p256.getSharedSecret(asPriv, ua, true).slice(1); // the x coordinate
  const ikm = hkdf(sha256, shared, auth, cat(enc.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = rand ? rand.salt : crypto.getRandomValues(new Uint8Array(16));
  const cek = hkdf(sha256, ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(sha256, ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, cat(plain, new Uint8Array([2]))));
  const rs = 4096, head = new Uint8Array(21);
  head.set(salt, 0); new DataView(head.buffer).setUint32(16, rs); head[20] = 65;
  return cat(head, asPub, body);
}
/// RFC 8292: the VAPID JWT (ES256) for the push service's origin
export function vapidJwt(v, endpoint, now = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const h = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))), c = b64u(enc.encode(JSON.stringify({ aud, exp: now + 12 * 3600, sub: v.subject })));
  const sig = p256.sign(sha256(enc.encode(`${h}.${c}`)), v.d, { prehash: false, format: "compact" });
  return `${h}.${c}.${b64u(sig instanceof Uint8Array ? sig : sig.toCompactRawBytes())}`;
}
/// one message to one browser: { ok, gone } (gone: the subscription has expired — drop it)
export async function send(sub, payload, { v = vapid(), fetchImpl = fetch, ttl = 86400 } = {}) {
  if (!v) return { ok: false, gone: false, why: "no VAPID keys" };
  const body = await encrypt(sub, enc.encode(JSON.stringify(payload)));
  const r = await fetchImpl(sub.endpoint, { method: "POST", headers: { "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: String(ttl), urgency: "high", authorization: `vapid t=${vapidJwt(v, sub.endpoint)}, k=${v.pub}` }, body });
  return { ok: r.status >= 200 && r.status < 300, gone: r.status === 404 || r.status === 410, status: r.status };
}

// ---------------------------------------------------------------- subscriptions
const subKey = (wa) => `orders/push_${lc(wa)}`;
const IDX = "orders/_push";
const get = async (store, k) => (store ? await store.get(k).catch(() => null) : null);
const set = async (store, k, d) => { if (store) await store.set(k, d).catch(() => null); };
/// add or remove this browser's subscription for a wallet (the wallet's orders view signature authorizes it)
export async function subSet(body, { store, viewOk } = {}) {
  const wa = lc(body && body.wallet);
  if (!isAddr(wa) || !viewOk || !viewOk(wa, body.until, body.sig)) return { status: 401, body: { error: "sign once to turn on notifications" } };
  const s = normSub(body.sub);
  if (!s) return { status: 400, body: { error: "that isn't a browser push subscription" } };
  if (!store) return { status: 503, body: { error: "notifications aren't set up on this server yet" } };
  const d = (await get(store, subKey(wa))) || { list: [] };
  d.list = (d.list || []).filter((x) => x.endpoint !== s.endpoint);
  if (!body.remove) d.list = [{ ...s, at: Math.floor(Date.now() / 1000), lang: String(body.lang || "en").slice(0, 5) }, ...d.list].slice(0, 5);
  await set(store, subKey(wa), d);
  const ix = (await get(store, IDX)) || { wallets: [] };
  const has = ix.wallets.includes(wa);
  if (d.list.length && !has) { ix.wallets = [wa, ...ix.wallets].slice(0, 5000); await set(store, IDX, ix); }
  else if (!d.list.length && has) { ix.wallets = ix.wallets.filter((x) => x !== wa); await set(store, IDX, ix); }
  return { status: 200, body: { ok: true, n: d.list.length } };
}
/// wallets with at least one browser subscribed
export async function wallets(store) { const ix = await get(store, IDX); return (ix && ix.wallets) || []; }
/// a message to every browser a wallet subscribed; expired subscriptions are dropped. Returns how many went out.
export async function toWallet(store, wallet, payload, o = {}) {
  const v = o.v || vapid();
  if (!v || !isAddr(wallet)) return 0;
  const k = subKey(wallet), d = await get(store, k);
  if (!d || !d.list || !d.list.length) return 0;
  let n = 0; const keep = [];
  for (const s of d.list) {
    const r = await send(s, payload, { v, fetchImpl: o.fetchImpl || fetch }).catch(() => ({ ok: false, gone: false }));
    if (r.ok) n++;
    if (!r.gone) keep.push(s);
  }
  if (keep.length !== d.list.length) await set(store, k, { ...d, list: keep });
  return n;
}

// ---------------- topics: browsers that asked for one piece of news, no wallet needed (v4: "arcia-grad") ----------------
export const TOPICS = ["arcia-grad", "orders-sol"]; // v5: "orders-sol" — ARCIRCLE Orders opening on Solana
/// v2 (ARCIA AGENT): one topic per followed token and chain — agent-arc-0x… / agent-rh-0x…
/// v3 (ARCIRCLE Predict): one topic per wallet and chain — predict-arc-0x… / predict-rh-0x… (its rounds' results, a lead flip)
export const topicOk = (t) => TOPICS.includes(t) || /^(agent|predict)-(arc|rh)-0x[0-9a-f]{40}$/.test(t) || /^stake-0x[0-9a-f]{40}$/.test(t);
/// v2 (Staking): a wallet's staking news — a new week's USDC, its lock ending, the vote closing
export const stakeTopic = (wallet) => `stake-${String(wallet || "").toLowerCase()}`;
export const agentTopic = (ch, token) => `agent-${ch === "rh" ? "rh" : "arc"}-${String(token || "").toLowerCase()}`;
export const predictTopic = (ch, wallet) => `predict-${ch === "rh" ? "rh" : "arc"}-${String(wallet || "").toLowerCase()}`;
const topicKey = (t) => `push/topic_${t}`;
/// add (or remove) this browser on a topic's list (at most 5,000 browsers per topic, newest kept)
export async function topicSet(body, { store } = {}) {
  const t = String((body && body.topic) || "").toLowerCase();
  if (!topicOk(t)) return { status: 400, body: { error: "unknown topic" } };
  const s = normSub(body.sub);
  if (!s) return { status: 400, body: { error: "that isn't a browser push subscription" } };
  if (!store) return { status: 503, body: { error: "notifications aren't set up on this server yet" } };
  const d = (await get(store, topicKey(t))) || { list: [] };
  d.list = (d.list || []).filter((x) => x.endpoint !== s.endpoint);
  if (!body.remove) d.list = [{ ...s, at: Math.floor(Date.now() / 1000), lang: String(body.lang || "en").slice(0, 5) }, ...d.list].slice(0, 5000);
  await set(store, topicKey(t), d);
  return { status: 200, body: { ok: true } };
}
/// one message to every browser on a topic; gone ones are dropped. Returns how many went out.
export async function toTopic(store, topic, payload, o = {}) {
  const v = o.v || vapid();
  if (!v || !topicOk(topic)) return 0;
  const k = topicKey(topic), d = await get(store, k);
  if (!d || !d.list || !d.list.length) return 0;
  let n = 0; const keep = [];
  for (const s of d.list) {
    const r = await send(s, payload, { v, fetchImpl: o.fetchImpl || fetch }).catch(() => ({ ok: false, gone: false }));
    if (r.ok) n++;
    if (!r.gone) keep.push(s);
  }
  if (keep.length !== d.list.length) await set(store, k, { ...d, list: keep });
  return n;
}
