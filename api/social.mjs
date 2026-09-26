// api/social.mjs — creator-controlled coin profiles, verified X accounts and
// the daily Bullish / Bearish vote for ArcPad coins.
//
//   GET  /api/social?coin=0x…[&wallet=0x…]   profile + creator's X + sentiment (+ my vote)
//   GET  /api/social?creators=0x…,0x…         { x: { creator: handle } } for badges
//   POST /api/social  { action: "profile" | "x-verify" | "vote" | "logo", … }
//   GET  /logo/<sha256>.webp  (→ /api/social?logo=…)  hosted coin logos
//   GET  /api/social?circle=1[&wallet=0x…]      CirclePad pledges, Q&A, proposals, referrals
//   GET  /api/social?circle=badges&addrs=0x…,…  leaderboard chips ($ARCIRCLE holder, ArcPad creator)
//   GET  /api/social?scan=0x…[&sym=X]           Token Scanner holders + history (api/_scan.mjs)
//   GET  /api/social?scans=top                   most scanned tokens this week
//   GET  /api/social?scores=0x…,0x…              cached Token Scanner scores (Explore badges)
//   GET  /api/social?badge=0x…                   embeddable SVG badge   (/badge/<address>)
//   GET  /api/social?scanapi=0x…                 public scan JSON       (/api/v1/scan/<address>)
//   GET  /api/social?watchtick=1                 Telegram watch check (x-watch-key header)
//   GET  /api/social?bridgehist=0x…              a wallet's CCTP transfers seen on Arc (api/_bridge.mjs)
//   GET  /api/social?bridgestats=1               bridged through ARCIRCLE PAD
//   POST /api/social  { action: "scanreport" | "tgwatch" | "bridgelog", … }
//   POST /api/social  { action: "pledge" | "cqa" | "cprop" | "cprop-up" | "chide" | "cref", … }  (api/_circle.mjs)
//   GET  /api/social?token=arcircle[&wallet=0x…] $ARCIRCLE stats, buybacks, revenue, a wallet's holding (api/_token.mjs)
//   GET  /api/social?poll=rewards[&wallet=0x…]  Reward page poll; POST { action: "rpoll", … }
//   GET  /api/social?cctp=fees|msg&src=…        Bridge: Circle CCTP fee quotes / transfer status (api/_cctp.mjs)
//
// Every write carries a wallet signature over a human-readable message that
// the server rebuilds from the request itself; the signer must be the coin's
// on-chain creator (profile), the wallet being linked (X) or the voter (vote).
// Storage is Firestore via a service account (api/_store.mjs) — without that
// env var the endpoint answers { enabled: false } and the UI stays hidden.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { createHash } from "node:crypto";
import { isAddr, launchRecord, tokenBalance } from "./_arc.mjs";
import { storeEnabled, storeHealth, getDocs, setDoc, commit } from "./_store.mjs";
import * as circle from "./_circle.mjs";
import * as token from "./_token.mjs";
import { cctp } from "./_cctp.mjs";
import * as scanner from "./_scan.mjs";
import * as bridge from "./_bridge.mjs";

const te = new TextEncoder();
const hex = (b) => "0x" + Buffer.from(b).toString("hex");
function hexBytes(h) { h = String(h || "").replace(/^0x/, ""); if (!/^[0-9a-fA-F]*$/.test(h) || h.length % 2) throw new Error("bad hex"); return Uint8Array.from(Buffer.from(h, "hex")); }
export const keccakHex = (bytes) => hex(keccak_256(bytes));

/// EIP-191 personal_sign → signer address (lowercase).
export function recoverSigner(message, signature) {
  const m = te.encode(message);
  const digest = keccak_256(Buffer.concat([te.encode(`\x19Ethereum Signed Message:\n${m.length}`), m]));
  const b = hexBytes(signature);
  if (b.length !== 65) throw new Error("signature must be 65 bytes");
  let v = b[64]; if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("bad recovery id");
  const rec = new Uint8Array(65); rec[0] = v; rec.set(b.subarray(0, 64), 1);
  const pub = secp256k1.recoverPublicKey(rec, digest, { prehash: false });
  const full = secp256k1.Point.fromBytes(pub).toBytes(false);
  return "0x" + Buffer.from(keccak_256(full.subarray(1))).subarray(12).toString("hex");
}

// ---- messages (the browser builds the exact same text: arc-community.js) ----
export const PROFILE_KEYS = ["description", "website", "twitter", "telegram", "discord", "banner"];
export const profileHash = (p) => keccakHex(te.encode(JSON.stringify(Object.fromEntries(PROFILE_KEYS.map((k) => [k, p[k] || ""])))));
export const profileMessage = (coin, issued, p) =>
  `ARCIRCLE PAD — update coin profile\nCoin: ${coin.toLowerCase()}\nIssued: ${issued}\nContent: ${profileHash(p)}`;
export const xMessage = (wallet, handle, issued) =>
  `ARCIRCLE PAD — verify X account\nX: @${handle}\nWallet: ${wallet.toLowerCase()}\nIssued: ${issued}`;
export const xCode = (signature) => "ARC-" + keccakHex(hexBytes(signature)).slice(2, 10).toUpperCase();
export const voteMessage = (coin, side, day) =>
  `ARCIRCLE PAD — daily sentiment\nCoin: ${coin.toLowerCase()}\nVote: ${side === "bull" ? "Bullish" : "Bearish"}\nDay: ${day} (UTC)`;

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const json = (status, body, cache = "no-store") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "access-control-allow-origin": "*" },
});
const lc = (a) => String(a || "").toLowerCase();
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

function issuedOk(iso, maxAgeMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== iso) return false;
  return t <= Date.now() + 2 * 60e3 && Date.now() - t <= maxAgeMs;
}

// ---- profile validation ----
const LINK_HOSTS = {
  website: null,
  twitter: /^(?:www\.)?(?:x|twitter)\.com$/i,
  telegram: /^(?:www\.)?(?:t\.me|telegram\.me)$/i,
  discord: /^(?:www\.)?(?:discord\.gg|discord\.com)$/i,
};
function checkProfile(p) {
  if (!p || typeof p !== "object") return "missing profile";
  for (const k of Object.keys(p)) if (!PROFILE_KEYS.includes(k)) return `unknown field ${k}`;
  for (const k of PROFILE_KEYS) if (p[k] != null && typeof p[k] !== "string") return `${k} must be text`;
  const d = p.description || "";
  if (d.length > 600) return "description is longer than 600 characters";
  for (const k of Object.keys(LINK_HOSTS)) {
    const v = p[k] || "";
    if (!v) continue;
    if (v.length > 200) return `${k} link is too long`;
    let u; try { u = new URL(v); } catch { return `${k} must be a full https:// link`; }
    if (u.protocol !== "https:") return `${k} must start with https://`;
    if (LINK_HOSTS[k] && !LINK_HOSTS[k].test(u.hostname)) return `${k} link must be on ${k === "twitter" ? "x.com" : k === "telegram" ? "t.me" : "discord.gg / discord.com"}`;
  }
  const b = p.banner || "";
  if (b) {
    const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(b);
    if (!m) return "banner must be a WebP, JPEG or PNG image";
    if (b.length > 420_000) return "banner is too large (max ~300 KB)";
    const head = Buffer.from(m[2].slice(0, 24), "base64");
    const magic = { webp: head.slice(8, 12).toString() === "WEBP", jpeg: head[0] === 0xff && head[1] === 0xd8, png: head[1] === 0x50 && head[2] === 0x4e };
    if (!magic[m[1]]) return "banner file doesn't match its type";
  }
  return null;
}

// ---- X lookups (no API key: X's public oEmbed, then the embed syndication feed) ----
async function fetchJson(url, ms = 6000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; ARCIRCLE-PAD/1.0; +https://www.arcircle.app)" } });
    if (!r.ok) return { status: r.status };
    return { status: r.status, j: await r.json() };
  } catch (err) { return { status: 0, err: String(err && err.message || err) }; } finally { clearTimeout(t); }
}
function syndicationToken(id) { return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""); }
/// → { author, text } of a public post, or null.
export async function readTweet(id, handleHint) {
  for (const host of ["https://publish.x.com", "https://publish.twitter.com"]) {
    const o = await fetchJson(`${host}/oembed?url=${encodeURIComponent(`https://twitter.com/${handleHint || "i"}/status/${id}`)}&omit_script=1&dnt=true`);
    if (o.j && o.j.author_url) {
      const author = (/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i.exec(o.j.author_url) || [])[1];
      if (author) return { author, text: String(o.j.html || "") };
    }
  }
  const s = await fetchJson(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${syndicationToken(id)}`);
  if (s.j && s.j.user && s.j.user.screen_name) return { author: s.j.user.screen_name, text: String(s.j.text || "") };
  return null;
}

// ================= GET =================
export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.has("health")) return json(200, await storeHealth());
  if (url.searchParams.has("logo")) return serveLogo(url.searchParams.get("logo"));
  if (url.searchParams.get("circle") === "lb") {
    try {
      const w = url.searchParams.get("wallet");
      const lb = await circle.leaderboard(w);
      return json(200, lb, lb.complete && !w ? "public, max-age=10, s-maxage=15, stale-while-revalidate=60" : "no-store");
    }
    catch (err) { console.error("circle lb", err && err.message || err); return json(502, { error: "couldn't read the leaderboard" }); }
  }
  if (url.searchParams.get("token") === "arcircle") {
    try {
      const w = lc(url.searchParams.get("wallet"));
      const out = await token.tokenStats(isAddr(w) ? w : null);
      return json(200, out, !isAddr(w) && out.complete ? "public, max-age=15, s-maxage=20, stale-while-revalidate=120" : "no-store");
    } catch (err) { console.error("token stats", err && err.message || err); return json(502, { error: "couldn't read $ARCIRCLE right now" }); }
  }
  // Token Scanner: holders + history of any Arc token, kept in the store so
  // each scan only reads new blocks (and reaches further back until complete).
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const scanStore = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null);
  if (url.searchParams.has("scan")) {
    const t = String(url.searchParams.get("scan") || "");
    const st = scanStore();
    if (scanner.limited(`scan:${ip}`, 20, 60e3)) return json(429, { error: "too many scans — wait a minute" });
    try {
      const out = await scanner.holderScan(t, { store: st, budgetMs: 6500 });
      scanner.bumpScan(st, out.token, url.searchParams.get("sym")).catch(() => {});
      return json(200, out, out.more ? "no-store" : "public, max-age=20, s-maxage=60, stale-while-revalidate=300");
    } catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 200) }); }
  }
  if (url.searchParams.get("scans") === "top") {
    return json(200, { top: await scanner.scanTop(scanStore()) }, "public, max-age=60, s-maxage=300, stale-while-revalidate=900");
  }
  // Explore badges: cached server scores for up to 24 tokens; at most two
  // missing ones are scanned per request, the rest fill in on later visits.
  if (url.searchParams.has("scores")) {
    const list = [...new Set(String(url.searchParams.get("scores") || "").split(",").map(lc).filter(isAddr))].slice(0, 24);
    const st = scanStore();
    if (scanner.limited(`scores:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
    const out = {};
    let fresh = 0;
    for (const t of list) {
      let d = await scanner.scoreOf(t, { store: st, compute: false }).catch(() => null);
      if ((!d || Date.now() - d.at > 6 * 3600e3) && fresh < 2) { fresh++; d = await scanner.scoreOf(t, { store: st }).catch(() => d); }
      if (d && !d.notToken && d.score != null) out[t] = { score: d.score, k: d.k, t: d.t };
    }
    return json(200, { scores: out }, fresh ? "no-store" : "public, max-age=60, s-maxage=300, stale-while-revalidate=900");
  }
  // Embeddable badge: /badge/<address> → SVG
  if (url.searchParams.has("badge")) {
    const t = lc(url.searchParams.get("badge"));
    let d = null;
    if (isAddr(t) && !scanner.limited(`badge:${ip}`, 60, 60e3)) d = await scanner.scoreOf(t, { store: scanStore(), maxAgeMs: 6 * 3600e3 }).catch(() => null);
    return new Response(scanner.badgeSvg(d), { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400", "access-control-allow-origin": "*" } });
  }
  // Public JSON: /api/v1/scan/<address>
  if (url.searchParams.has("scanapi")) {
    const t = lc(url.searchParams.get("scanapi"));
    if (!isAddr(t)) return json(400, { error: "token must be an address" });
    if (scanner.limited(`api:${ip}`, 30, 60e3)) return json(429, { error: "rate limit: 30 scans a minute" });
    try { return json(200, await scanner.apiResult(t, { store: scanStore() }), "public, max-age=120, s-maxage=600, stale-while-revalidate=1800"); }
    catch (err) { return json(502, { error: "couldn't scan right now", detail: String(err && err.message || err).slice(0, 120) }); }
  }
  // Bridge: a wallet's CCTP transfers seen on Arc (rebuilds "Your transfers" on any device)
  if (url.searchParams.has("bridgehist")) {
    if (scanner.limited(`bh:${ip}`, 12, 60e3)) return json(429, { error: "slow down" });
    try { return json(200, await bridge.bridgeHistory(url.searchParams.get("bridgehist"), { store: scanStore() }), "no-store"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("bridgestats")) return json(200, await bridge.bridgeStats(scanStore()), "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  // Telegram watch list check — called every 15 minutes by the GitHub Actions job in tools/scan-watch.workflow.yml
  if (url.searchParams.has("watchtick")) {
    const key = process.env.TG_WEBHOOK_SECRET, bot = process.env.TG_BOT_TOKEN;
    if (!key || req.headers.get("x-watch-key") !== key || !bot || !storeEnabled()) return json(403, { ok: false });
    const alerts = await scanner.tgWatchTick(scanStore());
    for (const a of alerts) {
      await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: a.chat, parse_mode: "HTML", text: `<b>Watch alert · $${a.sym.replace(/[<>&]/g, "")}</b>\n${a.text}\n\n<a href="https://www.arcircle.app/s/${a.token}">Scan it again</a>` }) }).catch(() => null);
    }
    return json(200, { ok: true, alerts: alerts.length });
  }
  if (url.searchParams.has("cctp")) {
    try { const [st, body, cc] = await cctp(url.searchParams); return json(st, body, cc); }
    catch (err) { console.error("cctp", err && err.message || err); return json(502, { error: "couldn't reach Circle right now" }); }
  }
  if (url.searchParams.get("circle") === "badges") {
    try { return json(200, { badges: await circle.badges(String(url.searchParams.get("addrs") || "").split(",")) }, "public, max-age=60, s-maxage=300, stale-while-revalidate=900"); }
    catch (err) { console.error("circle badges", err && err.message || err); return json(502, { error: "couldn't read badges" }); }
  }
  if (!storeEnabled()) return json(200, { enabled: false }, "public, max-age=60, s-maxage=300");
  try {
    if (url.searchParams.get("poll") === "rewards") {
      const w = lc(url.searchParams.get("wallet"));
      return json(200, await token.pollData(w), isAddr(w) ? "no-store" : "public, max-age=10, s-maxage=15, stale-while-revalidate=60");
    }
    if (url.searchParams.has("circle")) {
      const w = lc(url.searchParams.get("wallet"));
      return json(200, await circle.circleData(w), isAddr(w) ? "no-store" : "public, max-age=10, s-maxage=15, stale-while-revalidate=60");
    }
    const creators = url.searchParams.get("creators");
    if (creators != null) {
      const list = [...new Set(creators.split(",").map(lc).filter(isAddr))].slice(0, 60);
      const docs = await getDocs(list.map((a) => `creators/${a}`));
      const x = {};
      for (const a of list) { const d = docs[`creators/${a}`]; if (d && d.x) x[a] = d.x; }
      return json(200, { enabled: true, x }, "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
    }
    const coin = lc(url.searchParams.get("coin"));
    if (!isAddr(coin)) return json(400, { error: "coin must be an address" });
    const wallet = lc(url.searchParams.get("wallet"));
    const rec = await launchRecord(coin);
    if (!rec) return json(404, { enabled: true, error: "not an ArcPad coin" });
    const creator = lc(rec.creator);
    const today = utcDay();
    const days = Array.from({ length: 7 }, (_, i) => utcDay(Date.now() - i * 86400e3));
    const paths = [`coinProfiles/${coin}`, `creators/${creator}`, ...days.map((d) => `sentiment/${coin}_${d}`)];
    if (isAddr(wallet)) paths.push(`votes/${coin}_${today}_${wallet}`);
    const docs = await getDocs(paths);
    const t = docs[`sentiment/${coin}_${today}`] || {};
    const week = { bull: 0, bear: 0 };
    for (const d of days) { const s = docs[`sentiment/${coin}_${d}`]; if (s) { week.bull += s.bull || 0; week.bear += s.bear || 0; } }
    const mine = isAddr(wallet) ? docs[`votes/${coin}_${today}_${wallet}`] : null;
    const cx = docs[`creators/${creator}`];
    return json(200, {
      enabled: true, coin, creator, day: today,
      profile: docs[`coinProfiles/${coin}`] || null,
      creatorX: cx && cx.x ? { handle: cx.x, tweetUrl: cx.tweetUrl || null, verifiedAt: cx.verifiedAt || null } : null,
      sentiment: { today: { bull: t.bull || 0, bear: t.bear || 0, hbull: t.hbull || 0, hbear: t.hbear || 0 }, week },
      myVote: mine ? mine.side : null,
    }, isAddr(wallet) ? "no-store" : "public, max-age=10, s-maxage=15, stale-while-revalidate=60");
  } catch (err) {
    console.error("social GET", err && err.message || err);
    return json(502, { enabled: true, error: "couldn't read community data right now", reason: err && err.gStatus || undefined });
  }
}

// ================= POST =================
export async function POST(req) {
  if (!storeEnabled()) return json(503, { enabled: false, error: "community features aren't switched on yet" });
  let b = {};
  try { b = (await req.json()) || {}; } catch { return json(400, { error: "bad JSON" }); }
  try {
    if (b.action === "profile") return await saveProfile(b);
    if (b.action === "x-verify") return await verifyX(b);
    if (b.action === "vote") return await vote(b);
    if (b.action === "logo") return await saveLogo(b, req);
    if (b.action === "pledge") return await circle.pledge(b, recoverSigner, json);
    if (b.action === "cqa") return await circle.qaPost(b, recoverSigner, json);
    if (b.action === "cprop") return await circle.propPost(b, recoverSigner, json);
    if (b.action === "cprop-up") return await circle.propUp(b, recoverSigner, json);
    if (b.action === "chide") return await circle.hide(b, recoverSigner, json);
    if (b.action === "cref") return await circle.refReport(b, json);
    if (b.action === "rpoll") return await token.pollVote(b, recoverSigner, json);
    if (b.action === "scanreport") return await scanReport(b, req);
    if (b.action === "bridgelog") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`blog:${ip}`, 30, 3600e3)) return json(429, { ok: false });
      return json(200, await bridge.logBridge({ get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) }, { tx: b.tx, src: b.src }));
    }
    if (b.action === "tgwatch") {
      if (!process.env.TG_WEBHOOK_SECRET || b.key !== process.env.TG_WEBHOOK_SECRET || !isAddr(b.token) || !b.chat) return json(403, { ok: false });
      return json(200, await scanner.tgWatchOp({ get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) }, { chat: b.chat, token: b.token, op: b.op }));
    }
    return json(400, { error: "unknown action" });
  } catch (err) {
    console.error("social POST", b && b.action, err && err.message || err);
    return json(500, { error: "something went wrong — try again" });
  }
}

// "Is this wrong?" on a Token Scanner check — kept for review, nothing public.
async function scanReport(b, req) {
  const t = lc(b.token), title = String(b.title || "").slice(0, 120), note = String(b.note || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!isAddr(t) || !title) return json(400, { error: "token and check are required" });
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (scanner.limited(`report:${ip}`, 8, 3600e3)) return json(429, { error: "thanks — that's enough reports for this hour" });
  const id = `${t}_${Date.now()}_${createHash("sha256").update(ip + title).digest("hex").slice(0, 8)}`;
  await setDoc(`scanReports/${id}`, { token: t, title, note, status: String(b.status || "").slice(0, 8), engine: Number(b.engine) || 0, at: Date.now() });
  return json(200, { ok: true });
}

async function saveProfile(b) {
  const coin = lc(b.coin);
  if (!isAddr(coin)) return json(400, { error: "coin must be an address" });
  const bad = checkProfile(b.profile);
  if (bad) return json(400, { error: bad });
  if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
  const p = Object.fromEntries(PROFILE_KEYS.map((k) => [k, String(b.profile[k] || "")]));
  let signer;
  try { signer = recoverSigner(profileMessage(coin, b.issued, p), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  const rec = await launchRecord(coin);
  if (!rec) return json(404, { error: "not an ArcPad coin" });
  if (signer !== lc(rec.creator)) return json(403, { error: "only the wallet that launched this coin can edit it" });
  const cur = (await getDocs([`coinProfiles/${coin}`]))[`coinProfiles/${coin}`];
  if (cur && cur.issued && Date.parse(cur.issued) >= Date.parse(b.issued)) return json(409, { error: "a newer edit is already saved" });
  const doc = { ...p, issued: b.issued, updatedAt: Date.now(), updatedBy: signer };
  await setDoc(`coinProfiles/${coin}`, doc);
  return json(200, { ok: true, profile: doc });
}

async function verifyX(b) {
  const wallet = lc(b.wallet);
  const handle = String(b.handle || "").replace(/^@/, "");
  if (!isAddr(wallet)) return json(400, { error: "wallet must be an address" });
  if (!HANDLE.test(handle)) return json(400, { error: "that isn't a valid X handle" });
  if (!issuedOk(b.issued, 48 * 3600e3)) return json(400, { error: "this code expired — start again" });
  let signer;
  try { signer = recoverSigner(xMessage(wallet, handle, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  const m = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/i.exec(String(b.tweetUrl || "").trim());
  if (!m) return json(400, { error: "paste the link to your post (x.com/…/status/…)" });
  const id = m[2];
  const tw = await readTweet(id, handle);
  if (!tw) return json(502, { error: "X didn't return that post — make sure it's public, then try again in a minute" });
  if (lc(tw.author) !== lc(handle)) return json(403, { error: `that post is from @${tw.author}, not @${handle}` });
  const code = xCode(b.signature);
  if (!tw.text.toUpperCase().includes(code)) return json(403, { error: `the post doesn't contain the code ${code}` });
  const doc = { x: tw.author, tweetUrl: `https://x.com/${tw.author}/status/${id}`, tweetId: id, verifiedAt: Date.now() };
  await setDoc(`creators/${wallet}`, doc);
  return json(200, { ok: true, creator: wallet, handle: doc.x, tweetUrl: doc.tweetUrl });
}

async function vote(b) {
  const coin = lc(b.coin), wallet = lc(b.wallet), side = b.side;
  if (!isAddr(coin) || !isAddr(wallet)) return json(400, { error: "coin and wallet must be addresses" });
  if (side !== "bull" && side !== "bear") return json(400, { error: "vote must be bull or bear" });
  const today = utcDay();
  // a vote signed in the last minutes of yesterday still counts for yesterday
  const okDay = b.day === today || (b.day === utcDay(Date.now() - 10 * 60e3));
  if (!okDay) return json(400, { error: "that vote is for another day — refresh and vote again" });
  let signer;
  try { signer = recoverSigner(voteMessage(coin, side, b.day), b.signature); } catch { return json(400, { error: "invalid signature" }); }
  if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
  const rec = await launchRecord(coin);
  if (!rec) return json(404, { error: "not an ArcPad coin" });
  const holder = (await tokenBalance(coin, wallet)) > 0n;
  const inc = side === "bull" ? { bull: 1, ...(holder ? { hbull: 1 } : {}) } : { bear: 1, ...(holder ? { hbear: 1 } : {}) };
  const r = await commit([
    { create: `votes/${coin}_${b.day}_${wallet}`, data: { coin, wallet, side, day: b.day, holder, at: Date.now() } },
    { inc: `sentiment/${coin}_${b.day}`, fields: inc },
  ]);
  if (r.conflict) return json(409, { error: "you already voted on this coin today", already: true });
  const s = (await getDocs([`sentiment/${coin}_${b.day}`]))[`sentiment/${coin}_${b.day}`] || {};
  return json(200, { ok: true, side, holder, today: { bull: s.bull || 0, bear: s.bear || 0, hbull: s.hbull || 0, hbear: s.hbear || 0 } });
}

// ================= hosted logos =================
// A logo stored inside the launch transaction costs ~740 gas per character,
// so on-chain logos had to be squeezed to ~128px. Hosting it here and putting
// only the URL on-chain makes the launch cheaper and the logo sharper: every
// upload is decoded and re-encoded server-side to a 500×500 WebP (which also
// strips anything that isn't pixels), then stored under its own SHA-256, so
// the URL can never point at different bytes and is cached forever.
const LOGO_ID = /^[0-9a-f]{64}$/;
const LOGO_PX = 500;
const LOGOS_PER_HOUR = 30;
async function serveLogo(id) {
  id = String(id || "").toLowerCase().replace(/\.webp$/, "");
  if (!LOGO_ID.test(id)) return new Response("bad id", { status: 400 });
  if (!storeEnabled()) return new Response("not found", { status: 404 });
  try {
    const d = (await getDocs([`logos/${id}`]))[`logos/${id}`];
    if (!d || !d.data) return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
    return new Response(Buffer.from(d.data, "base64"), { headers: {
      "content-type": d.mime || "image/webp", "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "access-control-allow-origin": "*", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'",
    } });
  } catch (err) { console.error("logo GET", err && err.message || err); return new Response("unavailable", { status: 503 }); }
}
async function saveLogo(b, req) {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ""));
  if (!m) return json(400, { error: "upload a PNG, JPEG, WebP or GIF image" });
  const input = Buffer.from(m[2], "base64");
  if (input.length > 4_000_000) return json(413, { error: "image is larger than 4 MB" });
  // light per-IP limit so the bucket can't be filled from one place
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const hour = new Date().toISOString().slice(0, 13).replace(/\D/g, "");
  const rk = `rate/logo_${createHash("sha256").update(ip).digest("hex").slice(0, 16)}_${hour}`;
  const rate = (await getDocs([rk]))[rk];
  if (rate && rate.n >= LOGOS_PER_HOUR) return json(429, { error: "too many uploads — try again later" });
  let out;
  try {
    const sharp = (await import("sharp")).default;
    for (const q of [86, 76, 64, 52]) {
      out = await sharp(input, { animated: false, limitInputPixels: 40_000_000 })
        .rotate().resize(LOGO_PX, LOGO_PX, { fit: "cover", position: "attention" }).webp({ quality: q, effort: 4 }).toBuffer();
      if (out.length <= 160_000) break;
    }
  } catch { return json(400, { error: "that file couldn't be read as an image" }); }
  if (!out || out.length > 300_000) return json(413, { error: "that image is too detailed — try a simpler one" });
  const id = createHash("sha256").update(out).digest("hex");
  await commit([
    { set: `logos/${id}`, data: { data: out.toString("base64"), mime: "image/webp", size: out.length, px: LOGO_PX, at: Date.now() } },
    { inc: rk, fields: { n: 1 } },
  ]);
  return json(200, { ok: true, id, url: `https://www.arcircle.app/logo/${id}.webp`, bytes: out.length, px: LOGO_PX });
}
