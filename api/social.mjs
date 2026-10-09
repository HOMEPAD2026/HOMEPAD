// api/social.mjs — creator-controlled coin profiles, verified X accounts and
// the daily Bullish / Bearish vote for ArcPad coins.
//
//   GET  /api/social?coin=0x…[&wallet=0x…]   profile + creator's X + sentiment (+ my vote)
//   GET  /api/social?creators=0x…,0x…         { x: { creator: handle } } for badges
//   POST /api/social  { action: "profile" | "x-verify" | "vote" | "logo", … }
//   GET  /logo/<sha256>.webp  (→ /api/social?logo=…)  hosted coin logos
//   GET  /pm/<id>  (→ /api/social?pm=…)  a Pump.fun coin's metadata JSON (api/_pump-arcpad.mjs); POST /api/social?solrpc  Solana RPC relay
//   GET  /api/social?circle=1[&wallet=0x…]      CirclePad pledges, Q&A, proposals, referrals
//   GET  /api/social?circle=badges&addrs=0x…,…  leaderboard chips ($ARCIRCLE holder, ArcPad creator)
//   GET  /api/social?scan=0x…[&sym=X]           Token Scanner holders + history (api/_scan.mjs)
//        (scan, scans=top, scores, badge, scanapi: &chain=rh reads Robinhood Chain)
//   GET  /api/social?scans=top                   most scanned tokens this week
//   GET  /api/social?scores=0x…,0x…              cached Token Scanner scores (Explore badges)
//   GET  /api/social?badge=0x…[&style=card]      embeddable SVG badge   (/badge/<address>[?style=card])
//   GET  /api/social?scanapi=0x…                 public scan JSON       (/api/v1/scan/<address>)
//   GET  /api/social?watchtick=1                 Telegram watch check (x-watch-key header)
//   GET  /api/social?bridgehist=0x…              a wallet's CCTP transfers seen on Arc (api/_bridge.mjs)
//   GET  /api/social?bridgestats=1               bridged through ARCIRCLE PAD
//   GET  /api/social?holdersnap=0x…              every holder of a token (Multisender airdrop to holders); &chain=rh: Robinhood Chain
//   GET  /api/social?drops=recent                recent + biggest Multisender sends (api/_drop.mjs)
//   GET  /api/social?dropreceipt=0x…[,0x…]       what a Multisender send delivered (receipt page)
//   GET  /api/social?received=0x…                airdrops a wallet got / can claim
//   GET  /api/social?dropsby=0x…                 a wallet's own Multisender sends
//   GET  /api/social?dropproof=<id>&wallet=0x…   ArcDrop claim proof
//   POST /api/social  { action: "scanreport" | "tgwatch" | "bridgelog" | "dropsave", … }
//   GET  /api/social?circle=ideas[&wallet=0x…][&round=<escrow>]   a round's governance ideas (api/_circle.mjs)
//   GET  /api/social?circle=src&escrow=0x…       is a round's escrow source-verified on Arc's explorer
//   GET  /api/social?cctp=fees&src=6 · ?cctp=msg&src=6&tx=0x…   CirclePad's USDC bridge-in (Circle CCTP → Arc)
//   GET  /api/social?circle=burns[&round=n]      CirclePad burn-to-vote feed + totals (api/_burnvote.mjs)
//   GET  /api/social?circle=vote&tx=0x…          one burn-vote transaction (/vote/<tx>)
//   GET  /api/social?circle=gov&round=n[&voter=0x…][&proof=cat]   a direct round's governance (no vote contracts)
//   POST /api/social  { action: "cgov-cands", round: <escrow>, cat, options, signature }   its signed candidates
//   GET  /api/social?circle=rounds[&fresh=1]     every CirclePad round + its launch process (api/_rounds.mjs)
//   GET  /api/social?circle=boot                 /circle's <head> script: which round the page runs
//   GET  /api/social?circle=summary&round=N      one round's results (Projects card)
//   GET  /api/social?circle=csv&round=N[&in=eth|sol]  a round's leaderboard as CSV (?circle=lb&round=N for JSON); in= adds ETH / SOL columns
//   GET  /api/social?vevote=list[&u=0x…]           veARCIA votes (api/_vearcia.mjs); POST vevotenew / vevote (signed)
//   GET  /api/social?fx=1                        ETH and SOL in dollars (api/_fx.mjs)
//   GET  /api/social?liq=<token>[&wallet=0x…]    Liquidity Manager: pools, positions, locks (api/_liquidity.mjs); &lite=1: pools and prices only (Orders)
//   GET  /api/social?orders=book&token=0x…       ARCIRCLE Orders (api/_orders.mjs): one market's price levels and fills
//   GET  /api/social?orders=markets | status     every market · the executor's last run
//   GET  /api/social?orders=candles&pool=0x…     5-minute candles of an Arc v4 pool (3 days)
//   GET  /api/social?orders=mine&wallet=&until=&sig=   a wallet's orders (signed: orders.viewMessage)
//   POST /api/social  { action: "orderplace" | "ordercancel" | "ordercancelall" | "orderfilled" | "orderalert", … }
//   GET  /api/social?orders=recent | burns [&chain=rh]   v3: the live tape across markets · the fee burn's totals
//   GET  /api/social?orders=alerts&wallet=&until=&sig=  a wallet's price alerts (Telegram DMs them with /orderalerts on)
//   GET  /api/social?orders=pools&token=0x…&chain=rh   a Robinhood Chain token's v4 pools against ETH (keys, prices)
//   GET  /api/social?orders=pushkey                  v4: the VAPID key for Web Push (POST { action: "pushsub", wallet, until, sig, sub })
//   every orders route takes chain=rh (query or body) for Robinhood Chain's book (ArcircleOrdersNative)
//   GET  /api/social?liqfeed=<poolId,…>[&h=24]   Liquidity Manager: adds, removals, LP locks (last h hours)
//   GET  /api/social?liqmine=<wallet>            Liquidity Manager: a wallet's positions across every token
//   GET  /api/social?liqtop=arc|rh               Liquidity Manager: trending / established pools with fee yields
//        (liq, liqfeed, liqmine, liqsafe take &chain=rh for Robinhood Chain)
//   GET  /api/social?lock=<id>                  Locker: one ArcLock lock (/lock/<id> certificate)
//   GET  /api/social?locks=overview|<token>     Locker: dashboard (every lock by token) / one token's totals
//   GET  /api/social?lockbadge=<token>          Locker: embeddable SVG badge (/lockbadge/<token>)
//   GET  /api/social?liqsafe=<token>             Liquidity Manager: scanner verdict + trade/tax checks
//   POST /api/social  { action: "cstage" }  the round wallet marks a launch step done; { action: "cround", tx } registers the next round's escrow
//   POST /api/social  { action: "pledge" | "cqa" | "cprop" | "cprop-up" | "chide" | "cref" | "cidea" | "cidea-up" | "cidea-unvote", … }  (api/_circle.mjs)
//   GET  /api/social?token=arcircle[&wallet=0x…] $ARCIRCLE stats, buybacks, burns by source, revenue, a wallet's holding (api/_token.mjs)
//   GET  /api/social?coin=arcia                  $ARCIA live: Robinhood Chain price (Pons), market, holders, burned on Robinhood Chain; (api/_arcia-coin.mjs)
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
import * as rounds from "./_rounds.mjs";
import * as burnvote from "./_burnvote.mjs";
import { arciaCoin, arciaBurned } from "./_arcia-coin.mjs";
import * as token from "./_token.mjs";
import { cctp } from "./_cctp.mjs";
import * as scanner from "./_scan.mjs";
import * as bridge from "./_bridge.mjs";
import * as drop from "./_drop.mjs";
import * as snap from "./_snapshot.mjs";
import * as liquidity from "./_liquidity.mjs";
import * as locker from "./_locker.mjs";
import * as argusArc from "./_argus-arcpad.mjs";
import * as ponsArc from "./_pons-arcpad.mjs";
import * as arcpadRH from "./_arcpad-rh.mjs";
import * as pumpArc from "./_pump-arcpad.mjs";
import * as orders from "./_orders.mjs";
import * as webpush from "./_webpush.mjs";
import * as v6mod from "./_arcpad-v6.mjs";
import * as vearcia from "./_vearcia.mjs";

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
const srcMem = new Map(); // CirclePad escrow → { at, v } (?circle=src)
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
const scanStoreEarly = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null);
// ArcPad v6 (api/_arcpad-v6.mjs): comments, referrals, launch plans
let V6 = null;
const v6 = () => (V6 = V6 || v6mod.make({ getDocs, setDoc, commit, recoverSigner, issuedOk, json, limited: (k, n, ms) => scanner.limited(k, n, ms), keccakText: (s) => keccakHex(te.encode(s)), veTier: (w) => vearcia.veTierOf(w),
  argusCoin: (t) => argusArc.coin(t, { store: storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null }) }));
export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.has("health")) return json(200, await storeHealth());
  if (url.searchParams.has("comments") || url.searchParams.has("refstats") || url.searchParams.has("launchplans")) {
    if (!storeEnabled()) return json(200, { enabled: false, items: [] });
    try {
      if (url.searchParams.has("comments")) return await v6().comments(url.searchParams.get("comments"));
      if (url.searchParams.has("refstats")) return await v6().refStats(url.searchParams.get("refstats"));
      return await v6().plans();
    } catch (err) { console.error("v6 GET", err && err.message || err); return json(502, { error: "couldn't read that right now" }); }
  }
  if (url.searchParams.has("logo")) return serveLogo(url.searchParams.get("logo"));
  // CirclePad rounds (api/_rounds.mjs): the list + launch process, the boot script for /circle, a round's summary and CSV
  if (url.searchParams.get("circle") === "rounds") {
    try { const fresh = url.searchParams.has("fresh"); return json(200, await rounds.roundsData(fresh), fresh ? "no-store" : "public, max-age=10, s-maxage=15, stale-while-revalidate=60"); }
    catch (err) { console.error("circle rounds", err && err.message || err); return json(502, { error: "couldn't read the rounds" }); }
  }
  if (url.searchParams.get("circle") === "boot") {
    let js = "window.CP_ROUNDS=null;";
    try { js = await rounds.bootScript(); } catch { /* the page falls back to Round #1 */ }
    return new Response(js, { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=20, s-maxage=20, stale-while-revalidate=300", "access-control-allow-origin": "*" } });
  }
  // CirclePad "Bring USDC from another chain": Circle's CCTP API (Iris), only the two reads the page needs.
  //   ?cctp=fees&src=<domain>            the fee tiers (fast / standard) to Arc (domain 26) with the Forwarding Service
  //   ?cctp=msg&src=<domain>&tx=0x…      a burn's attestation and the forwarded mint on Arc (forwardTxHash)
  if (url.searchParams.has("cctp")) {
    const k = url.searchParams.get("cctp"), src = Number(url.searchParams.get("src"));
    const SRC = [0, 1, 2, 3, 6, 7]; // Ethereum, Avalanche, OP, Arbitrum, Base, Polygon
    if (!SRC.includes(src)) return json(400, { error: "unsupported source chain" });
    const IRIS = "https://iris-api.circle.com/v2";
    const get = async (u) => { try { const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) }); const j = await r.json().catch(() => null); return { status: r.status, j }; } catch { return { status: 502, j: null }; } };
    if (k === "fees") {
      const r = await get(`${IRIS}/burn/USDC/fees/${src}/26?forward=true`);
      return r.j ? json(200, { src, dst: 26, fees: r.j }, "public, max-age=30, s-maxage=60") : json(502, { error: "Circle's fee API didn't answer" });
    }
    if (k === "msg") {
      const tx = String(url.searchParams.get("tx") || "");
      if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return json(400, { error: "tx must be a transaction hash" });
      const r = await get(`${IRIS}/messages/${src}?transactionHash=${tx}`);
      if (r.status === 404) return json(200, { pending: true, messages: [] });
      const m = r.j && Array.isArray(r.j.messages) ? r.j.messages : [];
      return json(200, { pending: !m.length, messages: m.map((x) => ({ status: x.status || null, forwardState: x.forwardState || null, forwardTxHash: x.forwardTxHash || null, delayReason: x.delayReason || null, decoded: x.decodedMessage && x.decodedMessage.decodedMessageBody ? { amount: x.decodedMessage.decodedMessageBody.amount || null, feeExecuted: x.decodedMessage.decodedMessageBody.feeExecuted || null, mintRecipient: x.decodedMessage.decodedMessageBody.mintRecipient || null } : null })) });
    }
    return json(400, { error: "use cctp=fees or cctp=msg" });
  }
  // is a round's escrow source-verified on Arc's explorer? (the Transparency badge) — kept 10 minutes per instance
  if (url.searchParams.get("circle") === "src") {
    const e = String(url.searchParams.get("escrow") || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(e)) return json(400, { error: "escrow must be an address" });
    const hit = srcMem.get(e);
    if (hit && Date.now() - hit.at < 600e3) return json(200, { escrow: e, verified: hit.v }, "public, max-age=60, s-maxage=600");
    let v = null;
    try { const { verifiedNow } = await import("./_scan.mjs"); v = await verifiedNow(e, "arc"); } catch { v = null; }
    if (v != null) srcMem.set(e, { at: Date.now(), v });
    return json(200, { escrow: e, verified: v }, v == null ? "no-store" : "public, max-age=60, s-maxage=600");
  }
  if (url.searchParams.get("circle") === "summary") {
    try {
      const v = await rounds.summary(url.searchParams.get("round") || 1);
      return v ? json(200, v, v.board.complete ? "public, max-age=15, s-maxage=30, stale-while-revalidate=120" : "no-store") : json(404, { error: "no such round" });
    } catch (err) { console.error("circle summary", err && err.message || err); return json(502, { error: "couldn't read the round" }); }
  }
  // ETH and SOL in dollars (CirclePad's "≈ ETH / ≈ SOL" next to USDC amounts)
  if (url.searchParams.get("fx") === "1") {
    try { const { prices } = await import("./_fx.mjs"); const p = await prices(); return json(p.eth || p.sol ? 200 : 502, p, "public, max-age=30, s-maxage=60, stale-while-revalidate=300"); }
    catch (err) { return json(502, { error: "couldn't read prices" }); }
  }
  if (url.searchParams.get("circle") === "csv") {
    try {
      const v = await rounds.leaderboardCsv(url.searchParams.get("round") || 1, { in: url.searchParams.get("in") || "" });
      if (!v) return json(404, { error: "no such round" });
      // converted ones carry today's price: never cached long
      return new Response(v.csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${v.filename}"`, "cache-control": v.unit !== "usdc" ? "public, max-age=30, s-maxage=60" : v.closed && v.complete ? "public, max-age=60, s-maxage=300" : "no-store", "access-control-allow-origin": "*" } });
    } catch (err) { console.error("circle csv", err && err.message || err); return json(502, { error: "couldn't read the leaderboard" }); }
  }
  if (url.searchParams.get("circle") === "lb") {
    try {
      const w = url.searchParams.get("wallet");
      const rn = Number(url.searchParams.get("round") || 1);
      const rr = rn > 1 ? await rounds.roundByN(rn) : null;
      if (rn > 1 && !rr) return json(404, { error: "no such round" });
      const lb = await circle.leaderboard(w, rr ? rr.escrow : undefined);
      return json(200, lb, lb.complete && !w ? "public, max-age=10, s-maxage=15, stale-while-revalidate=60" : "no-store");
    }
    catch (err) { console.error("circle lb", err && err.message || err); return json(502, { error: "couldn't read the leaderboard" }); }
  }
  // CirclePad burn-to-vote: the feed of Voted events + totals, and one vote tx (/vote/<tx>)
  if (url.searchParams.get("circle") === "burns") {
    // &round=n: that round's burn-to-vote; without it, the current one
    const A = url.searchParams.has("round") ? burnvote.forRound(url.searchParams.get("round")) : burnvote.ADDR;
    if (!A) return json(404, { error: "that round has no burn-to-vote" }, "public, max-age=30");
    try { return json(200, await burnvote.burnFeed(scanStoreEarly(), A), "public, max-age=5, s-maxage=10, stale-while-revalidate=60"); }
    catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // a direct round's governance (no vote contracts): candidates, tallies, &voter's own votes (api/_burnvote.mjs)
  if (url.searchParams.get("circle") === "gov") {
    const A = burnvote.forRound(url.searchParams.get("round") || burnvote.ADDR.n);
    if (!A || !burnvote.isDirect(A)) return json(404, { error: "that round votes through its contracts" }, "public, max-age=30");
    const v = String(url.searchParams.get("voter") || "");
    if (url.searchParams.has("proof")) {
      const c = Number(url.searchParams.get("proof"));
      if (!(c >= 0 && c < burnvote.catsOf(A).length)) return json(400, { error: "bad category" });
      try { const p = await burnvote.candProof(A, c); return p ? json(200, p, "public, max-age=60, s-maxage=3600") : json(404, { error: "not published" }, "public, max-age=10"); }
      catch (err) { return json(502, { error: "couldn't read the candidates" }); }
    }
    try { return json(200, await burnvote.directState(scanStoreEarly(), A, isAddr(v) ? v : null), isAddr(v) ? "public, max-age=3, s-maxage=5" : "public, max-age=5, s-maxage=8, stale-while-revalidate=60"); }
    catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.get("circle") === "vote") {
    try {
      const v = await burnvote.voteTx(url.searchParams.get("tx"));
      return v ? json(200, v, "public, max-age=300, s-maxage=86400") : json(404, { error: "no CirclePad vote in that transaction" }, "public, max-age=30");
    } catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // $ARCIA for the Reward and $ARCIRCLE pages: the Robinhood Chain price (Pons, on-chain), holders, the Arc coin's market
  // under arc, and what sits at 0x…dEaD on Arc
  if (url.searchParams.get("coin") === "arcia") {
    try {
      const [m, b] = await Promise.all([arciaCoin(url.origin).catch(() => null), arciaBurned().catch(() => null)]);
      return json(200, { ...(m || {}), burned: b ? b.burned : null, burnedPct: b ? b.pct : null, supply: b ? b.supply : null }, "public, max-age=20, s-maxage=30, stale-while-revalidate=300");
    } catch (err) { return json(502, { error: "couldn't read $ARCIA right now" }); }
  }
  // $ARCIRCLE supply for CoinGecko / CoinMarketCap (api/_supply.mjs): JSON, or one plain number with &q=total|circulating|max|burned
  if (url.searchParams.get("supply") === "arcircle") {
    try {
      const { supply } = await import("./_supply.mjs");
      const v = await supply(), q = url.searchParams.get("q");
      const cache = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";
      if (q && ["total", "circulating", "max", "burned"].includes(q)) return new Response(String(v[q]), { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": cache, "access-control-allow-origin": "*" } });
      return json(200, v, cache);
    } catch (err) { return json(502, { error: "couldn't read $ARCIRCLE's supply right now" }); }
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
  const scanStore = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], getMany: (ks) => getDocs(ks), set: (k, d) => setDoc(k, d) } : null);
  const scanChain = url.searchParams.get("chain") === "rh" ? "rh" : "arc";
  // veARCIA (api/_vearcia.mjs): the wallet's $ARCIRCLE holding and its signed boost note
  if (url.searchParams.has("veboost")) {
    if (scanner.limited(`veboost:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
    try { const out = await vearcia.boostNote(String(url.searchParams.get("veboost") || "")); return json(out.ok ? 200 : 400, out, "no-store"); }
    catch (err) { console.error("veboost", err && err.message || err); return json(502, { error: "couldn't check the holding right now" }); }
  }
  // veARCIA tiers of up to 24 wallets (creator profiles, the Featured row on Home): 0 none … 4 Diamond
  if (url.searchParams.has("vetiers")) {
    const list = [...new Set(String(url.searchParams.get("vetiers") || "").split(",").map(lc).filter(isAddr))].slice(0, 24);
    if (scanner.limited(`vetiers:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
    const ts = await Promise.all(list.map((w) => vearcia.veTierOf(w).catch(() => 0)));
    return json(200, { tiers: Object.fromEntries(list.map((w, i) => [w, ts[i]])) }, "public, max-age=60, s-maxage=300, stale-while-revalidate=900");
  }
  if (url.searchParams.get("vevote") === "list") {
    try { return json(200, await vearcia.voteList(String(url.searchParams.get("u") || "")), "no-store"); }
    catch (err) { console.error("vevote list", err && err.message || err); return json(502, { error: "couldn't read the votes right now" }); }
  }
  if (url.searchParams.has("scan")) {
    const t = String(url.searchParams.get("scan") || "");
    const st = scanStore();
    if (scanner.limited(`scan:${ip}`, 20, 60e3)) return json(429, { error: "too many scans — wait a minute" });
    try {
      const out = await scanner.holderScan(t, { store: st, budgetMs: 6500, chain: scanChain });
      scanner.bumpScan(st, out.token, url.searchParams.get("sym"), scanChain).catch(() => {});
      return json(200, out, out.more ? "no-store" : "public, max-age=20, s-maxage=60, stale-while-revalidate=300");
    } catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 200) }); }
  }
  // how often each check was reported as wrong (titles and counts only, no notes)
  if (url.searchParams.get("scanreports") === "summary" && storeEnabled()) {
    const d = (await getDocs(["scanReportSum/v1"]).catch(() => ({})))["scanReportSum/v1"] || { rows: [] };
    return json(200, { checks: (d.rows || []).map((x) => { const [n, ...t] = String(x).split("|"); return { title: t.join("|"), n: Number(n) || 0 }; }).slice(0, 60) }, "public, max-age=300, s-maxage=900");
  }
  if (url.searchParams.get("scans") === "top") {
    return json(200, { top: await scanner.scanTop(scanStore(), scanChain) }, "public, max-age=60, s-maxage=300, stale-while-revalidate=900");
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
      let d = await scanner.scoreOf(t, { store: st, compute: false, chain: scanChain }).catch(() => null);
      if ((!d || d.stale || Date.now() - d.at > 6 * 3600e3) && fresh < 2) { fresh++; d = await scanner.scoreOf(t, { store: st, chain: scanChain }).catch(() => d); }
      // v3: critical flags ride along (Explore badges, Builder Mine, CirclePad); one token also gets its history and last snapshot
      if (d && !d.notToken && d.score != null) out[t] = list.length === 1 ? { score: d.score, k: d.k, t: d.t, at: d.at || null, hist: d.hist || [], crit: d.crit || [], conf: d.conf || null, sub: d.sub || null, prev: d.prev || null, v: d.v || null }
        : { score: d.score, k: d.k, t: d.t, crit: d.crit || [], conf: d.conf || null };
    }
    return json(200, { scores: out }, fresh ? "no-store" : "public, max-age=60, s-maxage=300, stale-while-revalidate=900");
  }
  // Embeddable badge: /badge/<address> → SVG
  if (url.searchParams.has("badge")) {
    const t = lc(url.searchParams.get("badge"));
    let d = null;
    if (isAddr(t) && !scanner.limited(`badge:${ip}`, 60, 60e3)) d = await scanner.scoreOf(t, { store: scanStore(), maxAgeMs: 6 * 3600e3, chain: scanChain }).catch(() => null);
    return new Response(scanner.badgeSvg(d, url.searchParams.get("style") === "card" ? "card" : "pill"), { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400", "access-control-allow-origin": "*" } });
  }
  // Public JSON: /api/v1/scan/<address>
  if (url.searchParams.has("scanapi")) {
    const t = lc(url.searchParams.get("scanapi"));
    if (!isAddr(t)) return json(400, { error: "token must be an address" });
    if (scanner.limited(`api:${ip}`, 30, 60e3)) return json(429, { error: "rate limit: 30 scans a minute" });
    try { return json(200, await scanner.apiResult(t, { store: scanStore(), chain: scanChain }), "public, max-age=120, s-maxage=600, stale-while-revalidate=1800"); }
    catch (err) { return json(502, { error: "couldn't scan right now", detail: String(err && err.message || err).slice(0, 120) }); }
  }
  // Bridge: a wallet's CCTP transfers seen on Arc (rebuilds "Your transfers" on any device)
  if (url.searchParams.has("bridgehist")) {
    if (scanner.limited(`bh:${ip}`, 12, 60e3)) return json(429, { error: "slow down" });
    try { return json(200, await bridge.bridgeHistory(url.searchParams.get("bridgehist"), { store: scanStore() }), "no-store"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // Multisender
  const dropStore = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d), getMany: (keys) => getDocs(keys) } : null);
  if (url.searchParams.has("holdersnap")) {
    const t = String(url.searchParams.get("holdersnap") || "");
    if (!isAddr(t)) return json(400, { error: "token must be an address" });
    if (scanner.limited(`hs:${ip}`, 10, 60e3)) return json(429, { error: "slow down" });
    try {
      // Robinhood Chain (Holder Snapshot's chain=rh): its own balance sheet, built from the Transfer log
      if (url.searchParams.get("chain") === "rh") { const out = await snap.chainOf("rh").base(t, { store: scanStore(), budgetMs: 7000 }); const lim = Math.max(1, Math.min(10000, Number(url.searchParams.get("limit")) || 5000)); return json(200, { ...out, holders: out.holders.slice(0, lim) }, out.complete ? "public, max-age=60, s-maxage=120" : "no-store"); }
      const out = await scanner.holderSnapshot(t, { store: scanStore(), limit: url.searchParams.get("limit") }); return json(200, out, out.complete ? "public, max-age=60, s-maxage=120" : "no-store");
    }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // Locker (arc-locker.js): certificate, dashboard, badge — &chain=rh reads ArcLock on Robinhood Chain
  const lockChain = url.searchParams.get("chain") === "rh" ? "rh" : "arc";
  if (url.searchParams.has("lock")) {
    try {
      const v = await locker.lockInfo(url.searchParams.get("lock"), lockChain);
      return v ? json(200, v, v.active ? "public, max-age=30, s-maxage=60" : "public, max-age=300, s-maxage=600") : json(404, { error: "no such lock" });
    } catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // (a snapshot run also carries locks=1/0 — "count locked tokens" — and is handled further down)
  if (url.searchParams.has("locks") && !url.searchParams.has("snaprun")) {
    const q = String(url.searchParams.get("locks") || "");
    if (scanner.limited(`lk:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
    try {
      if (q === "overview") return json(200, await locker.overview(lockChain), "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
      if (!isAddr(q)) return json(400, { error: "locks must be overview or a token address" });
      return json(200, await locker.tokenLocks(q, lockChain), "public, max-age=60, s-maxage=120");
    } catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("lockbadge")) {
    const t = String(url.searchParams.get("lockbadge") || "");
    let d = null;
    if (isAddr(t) && !scanner.limited(`lkb:${ip}`, 60, 60e3)) d = await locker.tokenLocks(t, lockChain).catch(() => null);
    return new Response(locker.lockBadgeSvg(d), { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400", "access-control-allow-origin": "*" } });
  }
  // Liquidity Manager (arc-liquidity.js): pools, positions and locks for one token
  if (url.searchParams.has("lplock")) {
    try {
      const v = await liquidity.lockInfo(url.searchParams.get("lplock"));
      return v ? json(200, v, v.active ? "public, max-age=30, s-maxage=60" : "public, max-age=300, s-maxage=600") : json(404, { error: "no such lock" });
    } catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("liq")) {
    if (scanner.limited(`lq:${ip}`, 40, 60e3)) return json(429, { error: "slow down" });
    try {
      const out = await liquidity.run(url.searchParams.get("liq"), { store: scanStore(), wallet: url.searchParams.get("wallet") || "", budgetMs: 8000, extra: String(url.searchParams.get("pools") || "").split(",").filter(Boolean).slice(0, 6), chain: url.searchParams.get("chain") || "arc", lite: url.searchParams.get("lite") === "1" });
      return json(200, out, "no-store");
    } catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("liqfeed")) {
    if (scanner.limited(`lf:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
    try { return json(200, await liquidity.feed(String(url.searchParams.get("liqfeed") || "").split(","), { hours: url.searchParams.get("h"), chain: url.searchParams.get("chain") || "arc" }), "public, max-age=15, s-maxage=30, stale-while-revalidate=120"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("liqmine")) {
    if (scanner.limited(`lm:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
    try { return json(200, await liquidity.mine(url.searchParams.get("liqmine"), { store: scanStore(), budgetMs: 8000, chain: url.searchParams.get("chain") || "arc" }), "no-store"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // the chain's busiest pools (GeckoTerminal) with v4 fee yields — the Liquidity Manager's dashboard
  if (url.searchParams.has("liqtop")) {
    if (scanner.limited(`lt:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
    try { return json(200, await liquidity.top(url.searchParams.get("liqtop") || "arc", { store: scanStore() }), "public, max-age=60, s-maxage=120, stale-while-revalidate=600"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // the Token Scanner's verdict + trade checks (taxes) for the add-liquidity warning
  if (url.searchParams.has("liqsafe")) {
    const t = lc(url.searchParams.get("liqsafe"));
    if (!isAddr(t)) return json(400, { error: "token must be an address" });
    if (scanner.limited(`ls:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
    try {
      const d = await scanner.scoreOf(t, { store: scanStore(), maxAgeMs: 6 * 3600e3, chain: url.searchParams.get("chain") === "rh" ? "rh" : "arc" });
      return json(200, d && !d.notToken ? { score: d.score, k: d.k, t: d.t, trade: d.trade || null, reasons: d.reasons || [], crit: d.crit || [] } : { score: null }, "public, max-age=60, s-maxage=300");
    } catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // Holder Snapshot (arc-snapshot.js, /snap/<id>, /api/v1/snapshot/<token>)
  if (url.searchParams.has("snaprun")) {
    if (scanner.limited(`sr:${ip}`, 40, 60e3)) return json(429, { error: "slow down" });
    const q = url.searchParams;
    try {
      const out = await snap.run({ token: q.get("snaprun"), block: q.get("b"), at: q.get("at"), hold: q.get("hold"), locks: q.get("locks") !== "0", lp: q.get("lp") === "1", chain: q.get("chain") }, { store: scanStore(), budgetMs: 8500 });
      return json(200, out.done ? { ...out, rows: snap.packRows(out.rows) } : out, "no-store");
    } catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  // snapshots taken in the Snapshot tool, newest first (each one opens at #snapshot?id=)
  if (url.searchParams.has("snaplog")) {
    try { return json(200, await snap.recent({ store: scanStore(), token: url.searchParams.get("token") || "" }), "public, max-age=10, s-maxage=15"); }
    catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("snapview")) {
    if (scanner.limited(`sv:${ip}`, 60, 60e3)) return json(429, { error: "slow down" });
    try { const out = await snap.view(url.searchParams.get("snapview"), { store: scanStore(), wallet: url.searchParams.get("wallet") || "" }); return json(200, out, out.status === "done" && !url.searchParams.get("wallet") ? "public, max-age=60, s-maxage=300" : "no-store"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("snapcsv")) {
    try {
      const { csv, doc } = await snap.csvOf(url.searchParams.get("snapcsv"), { store: scanStore() });
      return new Response(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="snapshot-${doc.id}-${doc.block}.csv"`, "cache-control": "public, max-age=3600, s-maxage=86400", "access-control-allow-origin": "*" } });
    } catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("snapapi")) {
    if (scanner.limited(`sa:${ip}`, 30, 60e3)) return json(429, { error: "rate limit: 30 requests a minute" });
    const q = Object.fromEntries(url.searchParams.entries());
    try {
      const out = await snap.api({ ...q, token: q.snapapi }, { store: scanStore() });
      return new Response(JSON.stringify(out), { status: out.pending ? 202 : 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": out.pending ? "no-store" : "public, max-age=60, s-maxage=300", "access-control-allow-origin": "*", ...(out.pending ? { "retry-after": "3" } : {}) } });
    } catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.get("drops") === "recent") {
    try { return json(200, await drop.feed(dropStore()), "public, max-age=20, s-maxage=30, stale-while-revalidate=120"); }
    catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("dropreceipt")) {
    try { const out = await drop.receipt(url.searchParams.get("dropreceipt")); return out ? json(200, out, "public, max-age=300, s-maxage=3600") : json(404, { error: "not a Multisender transaction" }, "public, max-age=30"); }
    catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("dropsby")) {
    if (scanner.limited(`dby:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
    try { return json(200, await drop.sentBy(dropStore(), url.searchParams.get("dropsby")), "no-store"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("received")) {
    if (scanner.limited(`rcv:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
    try { return json(200, await drop.received(dropStore(), url.searchParams.get("received")), "no-store"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("dropproof")) {
    const st = dropStore();
    if (!st) return json(503, { error: "claim lists aren't available right now" });
    try { return json(200, await drop.dropProof(st, url.searchParams.get("dropproof"), url.searchParams.get("wallet")), "public, max-age=30, s-maxage=60"); }
    catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
  }
  if (url.searchParams.has("bridgestats")) return json(200, await bridge.bridgeStats(scanStore()), "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  // Telegram watch list check — called every 15 minutes by the GitHub Actions job in tools/scan-watch.workflow.yml
  if (url.searchParams.has("watchtick")) {
    const key = process.env.TG_WEBHOOK_SECRET, bot = process.env.TG_BOT_TOKEN;
    if (!key || req.headers.get("x-watch-key") !== key || !storeEnabled()) return json(403, { ok: false });
    const pro = await import("./_scan-pro.mjs");
    const alerts = await scanner.tgWatchTick(scanStore(), { hooks: await pro.hookTargets().catch(() => []) });
    // Pro webhooks
    for (const a of alerts.filter((x) => x.hook)) await pro.hookSend(a.hook, { token: a.token, symbol: a.sym, events: a.kinds, text: a.text, score: a.score ?? null, scan: `https://www.arcircle.app/s/${a.token}` });
    for (const a of alerts.filter((x) => x.chat && bot)) {
      await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: a.chat, parse_mode: "HTML", text: `<b>Watch alert · $${a.sym.replace(/[<>&]/g, "")}</b>\n${a.text}\n\n<a href="https://www.arcircle.app/s/${a.token}">Scan it again</a>` }) }).catch(() => null);
    }
    return json(200, { ok: true, alerts: alerts.length, hooks: alerts.filter((x) => x.hook).length });
  }
  // coins launched on Argus through ArcPad (arc-argus.js): the list for Explore
  // coins launched on Pons V2 (Robinhood Chain) through ArcPad (arc-pons.js): the list for Explore
  // ARCIRCLE Orders (arc-orders.js, api/_orders.mjs): the book of one market, a wallet's orders, the markets
  if (url.searchParams.get("orders")) {
    // Solana (api/_orders-sol.mjs: orders are program accounts, read live)
    // v4: the VAPID public key a browser subscribes to Web Push with (null until VAPID_PUBLIC_KEY / _PRIVATE_KEY are set)
    if (url.searchParams.get("orders") === "pushkey") return json(200, { key: webpush.publicKey() }, "public, max-age=300, s-maxage=600");
    if (url.searchParams.get("chain") === "sol") {
      const k = url.searchParams.get("orders");
      try {
        const SOL = await import("./_orders-sol.mjs");
        if (k === "book") { const v = await SOL.book(url.searchParams.get("token"), { store: scanStore() }); return v ? json(v.error ? 400 : 200, v, "public, max-age=4, s-maxage=6") : json(400, { error: "token is needed" }); }
        if (k === "mine") { const v = await SOL.mine(url.searchParams.get("wallet"), { store: scanStore() }); return v ? json(200, v, "no-store") : json(400, { error: "wallet is needed" }); }
        if (k === "markets") return json(200, await SOL.markets({ store: scanStore() }), "public, max-age=20, s-maxage=30");
        if (k === "status") return json(200, await SOL.status({ store: scanStore() }), "public, max-age=20, s-maxage=30");
        return json(400, { error: "unknown orders view" });
      } catch (err) { console.error("orders sol", err && err.message || err); return json(502, { error: "couldn't read Solana right now" }); }
    }
    const k = url.searchParams.get("orders"), OX = orders.forChain(url.searchParams.get("chain"));
    try {
      if (k === "book") { const v = await OX.book(url.searchParams.get("token"), { store: scanStore() }); return v ? json(200, v, "public, max-age=3, s-maxage=4") : json(400, { error: "token is needed" }); }
      if (k === "mine") {
        // a wallet's orders aren't public: one signature (viewMessage) opens them for up to 30 days — or, v8, a read-only
        // API key the wallet created (for bots: ?orders=mine&apikey=ak_…)
        if (url.searchParams.get("apikey")) {
          const ku = await OX.keyUse(url.searchParams.get("apikey"), { store: scanStore() });
          if (ku.error) return json(ku.status || 401, { error: ku.error });
          const v = await OX.mine(ku.wallet, { store: scanStore() });
          return new Response(JSON.stringify({ ...v, apikey: { used: ku.used, perDay: ku.perDay } }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*", "x-ratelimit-limit": String(ku.perDay), "x-ratelimit-remaining": String(Math.max(0, ku.perDay - ku.used)) } });
        }
        const wa = url.searchParams.get("wallet");
        if (!OX.viewOk(wa, url.searchParams.get("until"), url.searchParams.get("sig"))) return json(401, { error: "sign once to see your orders", locked: true });
        const v = await OX.mine(wa, { store: scanStore() }); return v ? json(200, v, "no-store") : json(400, { error: "wallet is needed" });
      }
      if (k === "pools") { const v = await OX.pools(url.searchParams.get("token"), { store: scanStore() }); return v ? json(200, v, "public, max-age=30, s-maxage=60") : json(400, { error: "token is needed" }); }
      if (k === "markets") return json(200, await OX.markets({ store: scanStore() }), "public, max-age=15, s-maxage=30");
      if (k === "stats") return json(200, await OX.stats({ store: scanStore() }), "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      if (k === "explore") return json(200, await OX.explore({ store: scanStore() }), "public, max-age=60, s-maxage=180, stale-while-revalidate=300");
      if (k === "status") { const [st, eu] = await Promise.all([OX.status({ store: scanStore() }), OX.ethUsd().catch(() => null)]); return json(200, { ...st, ethUsd: eu }, "public, max-age=20, s-maxage=30"); }
      // v3: the live tape across markets, the fee burn's totals, a wallet's price alerts (its view signature opens them)
      if (k === "recent") return json(200, await OX.recent({ store: scanStore() }), "public, max-age=8, s-maxage=10");
      if (k === "burns") return json(200, await OX.burns({ store: scanStore() }), "public, max-age=30, s-maxage=60");
      // v7: for bots — the public fills since a cursor (JSON), the same as a short server-sent-events stream that
      // reconnects by itself (EventSource), and a wallet's webhook (its view signature opens it)
      if (k === "feed") return json(200, await OX.feed({ store: scanStore(), since: url.searchParams.get("since"), limit: url.searchParams.get("limit") }), "public, max-age=3, s-maxage=3");
      if (k === "stream") {
        const st0 = scanStore(), enc = new TextEncoder();
        let since = Number(req.headers.get("last-event-id") || url.searchParams.get("since") || 0) || 0;
        const body = new ReadableStream({
          async start(ctl) {
            const t0 = Date.now();
            ctl.enqueue(enc.encode(`retry: 3000\n: ARCIRCLE Orders fills on ${OX.id}\n\n`));
            if (!since) { const f0 = await OX.feed({ store: st0, since: 0, limit: 1 }).catch(() => null); since = f0 ? f0.seq : 0; ctl.enqueue(enc.encode(`event: hello\ndata: ${JSON.stringify({ chain: OX.id, seq: since })}\n\n`)); }
            while (Date.now() - t0 < 8000) {
              const f = await OX.feed({ store: st0, since }).catch(() => null);
              for (const e of (f && f.list) || []) { ctl.enqueue(enc.encode(`id: ${e.id}\nevent: fill\ndata: ${JSON.stringify(e)}\n\n`)); since = Math.max(since, e.id); }
              await new Promise((r) => setTimeout(r, 2000));
              ctl.enqueue(enc.encode(": ok\n\n"));
            }
            ctl.close();
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "x-accel-buffering": "no" } });
      }
      if (k === "hook") {
        const wa = url.searchParams.get("wallet");
        if (!OX.viewOk(wa, url.searchParams.get("until"), url.searchParams.get("sig"))) return json(401, { error: "sign once to see your webhook", locked: true });
        return json(200, { hook: await OX.hookGet(wa, { store: scanStore() }) }, "no-store");
      }
      if (k === "alerts") {
        const wa = url.searchParams.get("wallet");
        if (!OX.viewOk(wa, url.searchParams.get("until"), url.searchParams.get("sig"))) return json(401, { error: "sign once to see your alerts", locked: true });
        return json(200, await OX.alerts(wa, { store: scanStore() }), "no-store");
      }
      if (k === "candles") { const v = await OX.candles(url.searchParams.get("pool"), { store: scanStore() }); return v ? json(200, v, "public, max-age=20, s-maxage=30") : json(400, { error: "pool is needed" }); }
      // v8: the week's season board (and a wallet's own line), a wallet's API keys, a wallet's own events (JSON or a
      // short stream) — the last two behind its view signature
      if (k === "season") return json(200, await OX.season({ store: scanStore(), wallet: url.searchParams.get("wallet") || "" }), url.searchParams.get("wallet") ? "no-store" : "public, max-age=30, s-maxage=60");
      if (k === "apikeys" || k === "myevents" || k === "mystream") {
        const wa = url.searchParams.get("wallet");
        if (!OX.viewOk(wa, url.searchParams.get("until"), url.searchParams.get("sig"))) return json(401, { error: "sign once to see this", locked: true });
        if (k === "apikeys") return json(200, await OX.keyList(wa, { store: scanStore() }), "no-store");
        if (k === "myevents") return json(200, await OX.myEvents(wa, { store: scanStore(), since: url.searchParams.get("since") }), "no-store");
        const st0 = scanStore(), enc = new TextEncoder();
        let since = Number(req.headers.get("last-event-id") || url.searchParams.get("since") || 0) || 0;
        const body = new ReadableStream({
          async start(ctl) {
            const t0 = Date.now();
            ctl.enqueue(enc.encode(`retry: 4000\n: your ARCIRCLE Orders on ${OX.id}\n\n`));
            if (!since) { const f0 = await OX.myEvents(wa, { store: st0, since: 0 }).catch(() => null); since = f0 ? f0.seq : 0; ctl.enqueue(enc.encode(`event: hello\ndata: ${JSON.stringify({ chain: OX.id, seq: since })}\n\n`)); }
            while (Date.now() - t0 < 20000) {
              const f = await OX.myEvents(wa, { store: st0, since }).catch(() => null);
              if (f) { for (const e of f.list) ctl.enqueue(enc.encode(`id: ${e.id}\nevent: ${e.kind}\ndata: ${JSON.stringify(e)}\n\n`)); since = Math.max(since, f.seq || since); }
              await new Promise((r) => setTimeout(r, 2500));
              ctl.enqueue(enc.encode(": ok\n\n"));
            }
            ctl.close();
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
      }
      return json(400, { error: "unknown orders view" });
    } catch (err) { return json(502, { error: "couldn't read the order book right now" }); }
  }
  // coins launched on Pump.fun (Solana) through ArcPad (arc-pump.js): the list for Explore, and their metadata JSON
  if (url.searchParams.get("pumparc") === "list") {
    try { return json(200, await pumpArc.list({ store: scanStore() }), "public, max-age=30, s-maxage=45, stale-while-revalidate=300"); }
    catch (err) { console.error("pumparc", err && err.message || err); return json(502, { error: "couldn't read the Pump.fun launches right now" }); }
  }
  if (url.searchParams.has("pm")) return servePumpMeta(url.searchParams.get("pm"));
  if (url.searchParams.get("ponsarc") === "list") {
    try { return json(200, await ponsArc.list({ store: scanStore() }), "public, max-age=30, s-maxage=60, stale-while-revalidate=300"); }
    catch (err) { console.error("ponsarc", err && err.message || err); return json(502, { error: "couldn't read the Pons launches right now" }); }
  }
  // ArcPad's own launches on Robinhood Chain (ArcPadFactoryRH, ETH pairs) — empty with live:false until it's deployed
  if (url.searchParams.get("arcpadrh") === "list") {
    try { return json(200, await arcpadRH.list(), "public, max-age=20, s-maxage=30, stale-while-revalidate=300"); }
    catch (err) { console.error("arcpadrh", err && err.message || err); return json(502, { error: "couldn't read the Robinhood Chain launches right now" }); }
  }
  if (url.searchParams.get("argusarc") === "list") {
    try { return json(200, await argusArc.list({ store: scanStore() }), "public, max-age=30, s-maxage=60, stale-while-revalidate=300"); }
    catch (err) { console.error("argusarc", err && err.message || err); return json(502, { error: "couldn't read the Argus launches right now" }); }
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
    if (url.searchParams.get("circle") === "ideas") {
      const w = lc(url.searchParams.get("wallet"));
      return json(200, await circle.ideasData(w, url.searchParams.get("round")), isAddr(w) ? "no-store" : "public, max-age=5, s-maxage=10, stale-while-revalidate=60");
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
  // ArcPad × Pump.fun: the launch page's Solana JSON-RPC relay (api/_pump-arcpad.mjs keeps it to the calls it makes)
  if (new URL(req.url).searchParams.has("solrpc")) {
    const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
    if (scanner.limited(`solrpc:${ip}`, 240, 60e3)) return json(429, { jsonrpc: "2.0", id: null, error: { code: 429, message: "slow down" } });
    let q = null;
    try { q = await req.json(); } catch { return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "bad JSON" } }); }
    return json(200, await pumpArc.proxy(q));
  }
  if (!storeEnabled()) return json(503, { enabled: false, error: "community features aren't switched on yet" });
  let b = {};
  try { b = (await req.json()) || {}; } catch { return json(400, { error: "bad JSON" }); }
  try {
    if (["comment", "commentpin", "refnote", "launchplan"].includes(b.action)) {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (b.action === "comment") return await v6().comment(b, ip);
      if (b.action === "commentpin") return await v6().pin(b);
      if (b.action === "refnote") return await v6().refNote(b, ip);
      return await v6().plan(b, ip);
    }
    if (b.action === "profile") return await saveProfile(b);
    if (b.action === "x-verify") return await verifyX(b);
    if (b.action === "vote") return await vote(b);
    if (b.action === "logo") return await saveLogo(b, req);
    if (b.action === "pledge") return await circle.pledge(b, recoverSigner, json);
    if (b.action === "cqa") return await circle.qaPost(b, recoverSigner, json);
    if (b.action === "cprop") return await circle.propPost(b, recoverSigner, json);
    if (b.action === "cprop-up") return await circle.propUp(b, recoverSigner, json);
    if (b.action === "chide") return await circle.hide(b, recoverSigner, json);
    if (b.action === "cidea") return await circle.ideaPost(b, recoverSigner, json);
    if (b.action === "cidea-up") return await circle.ideaUp(b, recoverSigner, json);
    if (b.action === "cidea-unvote") return await circle.ideaUnvote(b, recoverSigner, json);
    if (b.action === "cgov-cands") return await burnvote.publishCands(b, recoverSigner, json);
    if (b.action === "cref") return await circle.refReport(b, json);
    if (b.action === "cstage") return await rounds.stagePost(b, recoverSigner, json);
    if (b.action === "cround") return await rounds.registerRound(b, json);
    // veARCIA votes (api/_vearcia.mjs): the owner opens one, holders sign a choice weighted by veARCIA at its snapshot
    if (b.action === "vevotenew" || b.action === "vevote") {
      if (scanner.limited(`vevote:${String(b.wallet || "").toLowerCase()}`, 20, 60e3)) return json(429, { error: "slow down" });
      const deps = { recover: recoverSigner, issuedOk: (iso) => issuedOk(iso, 15 * 60e3) };
      try { const r = b.action === "vevotenew" ? await vearcia.voteCreate(b, deps) : await vearcia.voteCast(b, deps); return json(r.status, r.body, "no-store"); }
      catch (err) { console.error("vevote", err && err.message || err); return json(502, { error: "couldn't save the vote right now" }); }
    }
    if (b.action === "rpoll") return await token.pollVote(b, recoverSigner, json);
    if (b.action === "scanreport") return await scanReport(b, req);
    if (b.action === "bridgelog") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`blog:${ip}`, 30, 3600e3)) return json(429, { ok: false });
      return json(200, await bridge.logBridge({ get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) }, { tx: b.tx, src: b.src }));
    }
    if (b.action === "dropsave") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`dsave:${ip}`, 10, 3600e3)) return json(429, { ok: false });
      if (!storeEnabled()) return json(503, { ok: false, error: "claim lists aren't available right now" });
      return json(200, await drop.dropSave({ get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) }, b));
    }
    if (b.action === "snaplog") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`sl:${ip}`, 200, 3600e3)) return json(429, { error: "slow down" });
      if (!storeEnabled()) return json(503, { error: "the snapshot record isn't available right now" });
      const st = { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) };
      try { return json(200, await snap.record(b, { store: st })); }
      catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
    }
    if (b.action === "snappublish" || b.action === "snapschedule") {
      delete b.auto; // only the tool's own record is marked as one
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`sp:${ip}`, 40, 3600e3)) return json(429, { error: "slow down" });
      const st = { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) };
      try { return json(200, b.action === "snappublish" ? await snap.publish(b, { store: st, recover: recoverSigner }) : await snap.schedule(b, { store: st, recover: recoverSigner })); }
      catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
    }
    // v8: orderhook (v7's webhook — it wasn't routed here), orderpause (pause / resume), orderkey (read-only API keys)
    if (["orderplace", "ordercancel", "ordercancelall", "orderfilled", "orderalert", "orderhook", "orderpause", "orderkey"].includes(b.action)) {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`orders:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
      const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], getMany: (ks) => getDocs(ks), set: (k, d) => setDoc(k, d) } : null;
      const OX = orders.forChain(b.chain);
      const fn = { orderplace: OX.place, ordercancel: OX.cancel, ordercancelall: OX.cancelMarket, orderfilled: (x, o) => OX.noteMarketTx(x.tx, o), orderalert: OX.alertSet, orderhook: OX.hookSet, orderpause: OX.pause, orderkey: OX.keyCreate }[b.action];
      try { const r = await fn(b, { store: st }); return json(r.status, r.body); }
      catch (err) { return json(502, { error: `couldn't reach ${OX.CFG.name} right now: ` + String(err && err.message || err).slice(0, 120) }); }
    }
    // v4: this browser's Web Push subscription for a wallet's fills and alerts (the wallet's orders view signature)
    if (b.action === "pushsub") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`pushsub:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
      const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
      try { const r = await webpush.subSet(b, { store: st, viewOk: orders.ARC.viewOk }); return json(r.status, r.body); }
      catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 120) }); }
    }
    // v4 (ARCIA): this browser on a news topic — "arcia-grad", $ARCIA graduating on Robinhood Chain (no wallet needed)
    if (b.action === "pushtopic") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`pushtopic:${ip}`, 10, 60e3)) return json(429, { error: "slow down" });
      const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
      try { const r = await webpush.topicSet(b, { store: st }); return json(r.status, r.body); }
      catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 120) }); }
    }
    // ARCIRCLE Orders on Solana: a market order is a Jupiter swap built here (the API key stays on the server)
    if (b.action === "solswap") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`solswap:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
      try { const SOL = await import("./_orders-sol.mjs"); const r = await SOL.swapTx(b); return json(r.status, r.body); }
      catch (err) { return json(err && err.status ? err.status : 502, { error: String(err && err.message || err).slice(0, 160) }); }
    }
    // v8: the owner's signed conditions for Solana orders (stop, TP / SL, trailing, timed, graduation, curve)
    if (b.action === "solcond") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`solcond:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
      try { const SOL = await import("./_orders-sol.mjs"); const r = await SOL.setCond(b, { store: scanStoreEarly() }); return json(r.status, r.body); }
      catch (err) { return json(502, { error: String(err && err.message || err).slice(0, 160) }); }
    }
    if (b.action === "pumpreg") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`pumpreg:${ip}`, 10, 60e3)) return json(429, { error: "slow down" });
      const st = { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) };
      try { const r = await pumpArc.register(b, { store: st }); return json(r.status, r.body); }
      catch (err) { return json(502, { error: "couldn't read Solana right now: " + String(err && err.message || err).slice(0, 120) }); }
    }
    if (b.action === "pumpmeta") return await savePumpMeta(b, req);
    if (b.action === "ponsreg") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`ponsreg:${ip}`, 10, 60e3)) return json(429, { error: "slow down" });
      const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
      try { const r = await ponsArc.register(b, { store: st }); return json(r.status, r.body); }
      catch (err) { return json(502, { error: "couldn't read Robinhood Chain right now: " + String(err && err.message || err).slice(0, 120) }); }
    }
    if (b.action === "argusreg") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`argusreg:${ip}`, 10, 60e3)) return json(429, { error: "slow down" });
      const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
      const r = await argusArc.register(b, { store: st });
      return json(r.status, r.body);
    }
    // an Argus launch listed through ArcPad → the Telegram launch channel (once, within 15 minutes;
    // with TG_TEST_KEY the owner can re-post any listed coin). api/tg-launch.mjs forwards here.
    if (b.action === "argustg") {
      const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
      if (scanner.limited(`argustg:${ip}`, 10, 60e3)) return json(429, { error: "slow down" });
      if (!isAddr(b.token)) return json(400, { error: "token must be an address" });
      const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
      const r = await argusArc.announce(b, { store: st });
      return json(r.status, r.body);
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
  // v3: a running count per check, to tune the weights (tools/scan-golden.mjs reads /api/social?scanreports=summary)
  try {
    const cur = (await getDocs(["scanReportSum/v1"]))["scanReportSum/v1"] || { rows: [] };
    const rows = (cur.rows || []).map((x) => String(x).split("|"));
    const hit = rows.find((r) => r[1] === title);
    if (hit) hit[0] = String(Number(hit[0]) + 1); else rows.push(["1", title.replace(/\|/g, "/")]);
    rows.sort((x, y) => Number(y[0]) - Number(x[0]));
    await setDoc("scanReportSum/v1", { rows: rows.slice(0, 120).map((r) => r.join("|")) });
  } catch { /* the report itself is saved */ }
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

// ================= Pump.fun metadata (arc-pump.js) =================
// create_v2 stores only a uri; pump.fun and wallets read the coin's name, image and links from the JSON there.
// Stored under its own hash (api/_pump-arcpad.mjs metaDoc) and served forever from /pm/<id>.
async function servePumpMeta(id) {
  id = String(id || "").toLowerCase().replace(/\.json$/, "");
  if (!pumpArc.META_ID.test(id)) return new Response("bad id", { status: 400 });
  if (!storeEnabled()) return new Response("not found", { status: 404 });
  try {
    const d = (await getDocs([`pumpmeta/${id}`]))[`pumpmeta/${id}`];
    if (!d || !d.body) return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
    return new Response(d.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable", "access-control-allow-origin": "*", "x-content-type-options": "nosniff" } });
  } catch (err) { console.error("pumpmeta GET", err && err.message || err); return new Response("unavailable", { status: 503 }); }
}
async function savePumpMeta(b, req) {
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (scanner.limited(`pumpmeta:${ip}`, 20, 60e3)) return json(429, { error: "slow down" });
  const m = pumpArc.metaDoc(b);
  if (m.error) return json(400, { error: m.error });
  await setDoc(`pumpmeta/${m.id}`, { body: m.body, at: Date.now() });
  return json(200, { ok: true, id: m.id, uri: m.uri, doc: m.doc });
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
