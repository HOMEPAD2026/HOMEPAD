// api/desk.mjs — ARCIA DESK (the engine is api/_desk.mjs, the brain api/_desk-brain.mjs).
// Public, read-only:
//   GET /api/desk                         everything the page shows: money, open trades, history, learning, journal, burns
//   GET /api/desk?day=YYYY-MM-DD[&paper=1] one day's closed trades
//   GET /api/desk?day=YYYY-MM-DD&trade=<id> one closed trade in full, with the coin's minute prices around it
// Scheduled (cron-job.org, every minute):
//   GET /api/desk?tick=1&key=<CRON_SECRET>   (or "Authorization: Bearer <CRON_SECRET>")
// Owner only (signed by the desk contract's owner wallet):
//   POST /api/desk {action:"settings", values:{tradePct,…}, issued, signature}   the sizing / scalp-gate settings
// ARCIA AGENT (api/_agent.mjs), public, read-only:
//   GET /api/desk?agent=0x…              ARCIA's report on an Arc token + her 24h safety call
//   GET /api/desk?agent=record           every safety call and how it was graded
//   GET /api/desk?agent=vaults[&t=0x…]   the burn vaults (all, or one token's) and ARCIA's actions
//   GET /api/desk?agent=take&t=0x…       ARCIA's words on a token (after its report; Claude, cached an hour)
//   …&chain=rh on the report, take and vaults: Robinhood Chain (ArciaAgentRH vaults) · ?agent=pools&t=0x…&chain=rh where a vault can buy
//   POST /api/desk {action:"agent-mode", vault, mode, issued, signature}   a vault owner's strategy (dip / steady / volume)
//   GET /api/desk?agenttick=1&key=<CRON_SECRET>   grade calls + work the vaults (also runs after every desk tick)
// ARCIA DESK on Robinhood Chain (every new launch there; the engine is api/_desk-rh.mjs): the same routes with &chain=rh —
//   GET /api/desk?chain=rh · ?chain=rh&day=… · ?chain=rh&tick=1&key=<CRON_SECRET> (its own cron-job.org entry, every minute)
//   POST {action:"settings", chain:"rh", …} (signed by the RH desk contract's owner)
// ARCIRCLE Orders' executor (api/_orders.mjs) — fills signed limit / stop orders at their makers' prices:
//   GET /api/desk?orderstick=1&key=<CRON_SECRET>   (its own cron-job.org entry, every minute; it also runs after
//                                                   a desk tick that leaves enough of the minute)
//   GET /api/desk?chain=rh&orderstick=1&key=…     the same on Robinhood Chain (ArcircleOrdersNative; also runs after
//                                                   the Robinhood desk's tick)
//   GET /api/desk?chain=sol&orderstick=1&key=…    the Solana keeper (api/_orders-sol.mjs; its own cron entry, every minute)
// ARCIRCLE Staking (api/_stake.mjs, contracts/ArcircleStaking.sol) — veARCIRCLE:
//   GET /api/desk?stake=state                totals, weekly rewards, pool votes, stakers, what the treasury owes stakers
//   GET /api/desk?stake=me&u=0x…             a wallet's lock, veARCIRCLE, claimable USDC, this and last week's vote, 8 weeks' earnings
//   GET /api/desk?stake=card&u=0x…           a wallet's lock for its share card (/stake/<wallet>)
// ARCIRCLE Predict (api/_predict.mjs, contracts/ArcPredict.sol) — UP / DOWN rounds on Arc tokens, in USDC:
//   GET /api/desk?predict=state              every market, its running round and its last results
//   GET /api/desk?predict=mine&u=0x…         a wallet's bets, what it can claim, its referrals and stats
//   GET /api/desk?predict=chart&m=<id>       the pool's price through the live round · ?predict=feed the latest bets
//   GET /api/desk?predict=lb                 leaderboard (this week, all time, streaks) · ?predict=status the keeper
//   GET /api/desk?predicttick=1&key=<CRON_SECRET>   the keeper: samples ended rounds' pools and settles them (its own
//                                                   cron-job.org entry, every minute)
// There is no endpoint that makes a desk buy or sell: trades only come from the tick's rules.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { tick, view, dayTrades, tradeDetail, saveSettings } from "./_desk.mjs";
import * as RH from "./_desk-rh.mjs";
import * as agent from "./_agent.mjs";
import * as orders from "./_orders.mjs";
import * as predict from "./_predict.mjs";
import * as stake from "./_stake.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";

const json = (o, status = 200, cache = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache, "access-control-allow-origin": "*" } });
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], getMany: (ks) => getDocs(ks), set: (k, d) => setDoc(k, d) } : null);

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const st = store();
  if (q.chain === "rh" && !q.agent) return rhGET(q, req, st); // ARCIA AGENT takes chain=rh itself (below)
  // ARCIRCLE Staking (api/_stake.mjs): ?stake=state · ?stake=me&u=0x…
  if (q.stake) {
    try {
      if (q.stake === "me") { const r = await stake.me(String(q.u || "")); return json(r, r.error ? 400 : 200); }
      if (q.stake === "card") { const r = await stake.card(String(q.u || "")); return json(r || { error: "no lock" }, r ? 200 : 404, "public, max-age=30, s-maxage=60"); }
      return json(await stake.state({ store: st }), 200, "public, max-age=5, s-maxage=10");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  // ARCIRCLE Predict (api/_predict.mjs)
  if (q.predicttick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    try { return json(await predict.tick({ budgetMs: 45000, store: st })); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  if (q.predict) {
    try {
      if (q.predict === "mine") { const r = await predict.mine(String(q.u || ""), { store: st }); return json(r, r.error ? 400 : 200); }
      if (q.predict === "chart") return json(await predict.chart(q.m), 200, "public, max-age=2, s-maxage=3");
      if (q.predict === "feed") return json(await predict.feed(), 200, "public, max-age=2, s-maxage=3");
      if (q.predict === "lb") return json(await predict.leaderboard(st), 200, "public, max-age=30, s-maxage=60");
      if (q.predict === "card") { const r = await predict.roundCard(String(q.id || ""), String(q.u || "")); return json(r || { error: "no such round" }, r ? 200 : 404, r && r.result !== "open" ? "public, max-age=60, s-maxage=86400" : "public, max-age=10, s-maxage=30"); }
      if (q.predict === "status") return json((await predict.status(st)) || {}, 200, "public, max-age=10, s-maxage=20");
      return json(await predict.state({ store: st }), 200, "public, max-age=2, s-maxage=3");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  // ARCIRCLE Orders on Solana's keeper (api/_orders-sol.mjs)
  if (q.chain === "sol" && q.orderstick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    try { const SOL = await import("./_orders-sol.mjs"); return json(await SOL.tick(st, { budgetMs: 45000 })); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  if (q.orderstick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    try { return json(await orders.tick(st, { budgetMs: 45000 })); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  if (q.tick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    const t0 = Date.now();
    let out;
    try { out = await tick(st); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
    // ARCIA AGENT runs after the desk, in what's left of the minute; its failures never touch the desk's answer
    try { out.agent = await agent.tick(st, { budgetMs: 15000 }); } catch (e) { out.agent = { error: String((e && e.message) || e).slice(0, 200) }; }
    // ARCIRCLE Orders in whatever is left of the minute
    const left = 55000 - (Date.now() - t0);
    if (left > 8000) { try { out.orders = await orders.tick(st, { budgetMs: left - 3000 }); } catch (e) { out.orders = { error: String((e && e.message) || e).slice(0, 200) }; } }
    return json(out);
  }
  if (q.agenttick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    try { return json(await agent.tick(st, { budgetMs: 40000 })); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  if (q.agent) {
    try {
      const chain = q.chain === "rh" ? "rh" : "arc";
      if (q.agent === "record") return json(await agent.record(st, { day: q.day != null && /^\d{1,6}$/.test(q.day) ? Number(q.day) : null }), 200, "public, max-age=30, s-maxage=60");
      if (q.agent === "vaults") return json(await agent.vaults(st, { token: q.t || "", vault: q.v || "", chain }), 200, "public, max-age=10, s-maxage=20");
      if (q.agent === "take") { const r = await agent.take(st, String(q.t || ""), { chain }); return json(r, r.error ? 400 : 200, r.error ? "no-store" : "public, max-age=60, s-maxage=300"); }
      if (q.agent === "pools") { const r = await agent.poolsRh(String(q.t || ""), { store: st }); return json(r, r.error ? 400 : 200, r.error ? "no-store" : "public, max-age=30, s-maxage=60"); }
      const ip = req.headers.get("x-forwarded-for") || "?";
      if (agentLimited(ip)) return json({ error: "slow down — ARCIA reads one token at a time" }, 429);
      const r = await agent.report(st, q.agent, { chain });
      // a report still reading the holders is asked again soon: keep it out of the CDN's cache for long
      return json(r, r.error ? 400 : 200, r.error ? "no-store" : r.holdersPending ? "public, max-age=5, s-maxage=10" : "public, max-age=60, s-maxage=120");
    } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  try {
    if (q.day && q.trade) return json(await tradeDetail(st, q.day, String(q.trade).slice(0, 20)), 200, "public, max-age=60, s-maxage=300");
    if (q.day) return json(await dayTrades(st, q.day, q.paper === "1"), 200, "public, max-age=30, s-maxage=60");
    return json(await view(st), 200, "public, max-age=10, s-maxage=20, stale-while-revalidate=60");
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}

/// ARCIA DESK on Robinhood Chain: its tick (no ARCIA AGENT after it — that lives on Arc) and its read-only views
async function rhGET(q, req, st) {
  if (q.orderstick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    try { return json(await orders.RH.tick(st, { budgetMs: 45000 })); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  if (q.tick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    const t0 = Date.now();
    let out;
    try { out = await RH.tick(st); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
    // ARCIRCLE Orders on Robinhood Chain in whatever is left of the minute
    const left = 55000 - (Date.now() - t0);
    if (left > 8000 && out && typeof out === "object") { try { out.orders = await orders.RH.tick(st, { budgetMs: left - 3000 }); } catch (e) { out.orders = { error: String((e && e.message) || e).slice(0, 200) }; } }
    return json(out);
  }
  try {
    if (q.day && q.trade) return json(await RH.tradeDetail(st, q.day, String(q.trade).slice(0, 20)), 200, "public, max-age=60, s-maxage=300");
    if (q.day) return json(await RH.dayTrades(st, q.day, q.paper === "1"), 200, "public, max-age=30, s-maxage=60");
    return json(await RH.view(st), 200, "public, max-age=10, s-maxage=20, stale-while-revalidate=60");
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}

const te = new TextEncoder();
const hits = new Map();
/// 12 fresh reports a minute per IP (cached ones are served by the CDN)
function agentLimited(ip) { const t = Date.now(), l = (hits.get(ip) || []).filter((x) => t - x < 60e3); l.push(t); hits.set(ip, l); if (hits.size > 5000) hits.clear(); return l.length > 12; }
/// EIP-191 personal_sign → signer address (lowercase); the same as api/social.mjs
export function recoverSigner(message, signature) {
  const m = te.encode(message);
  const digest = keccak_256(Buffer.concat([te.encode(`\x19Ethereum Signed Message:\n${m.length}`), m]));
  const h = String(signature || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{130}$/.test(h)) throw new Error("signature must be 65 bytes");
  const b = Uint8Array.from(Buffer.from(h, "hex"));
  let v = b[64]; if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("bad recovery id");
  const rec = new Uint8Array(65); rec[0] = v; rec.set(b.subarray(0, 64), 1);
  const pub = secp256k1.recoverPublicKey(rec, digest, { prehash: false });
  const full = secp256k1.Point.fromBytes(pub).toBytes(false);
  return "0x" + Buffer.from(keccak_256(full.subarray(1))).subarray(12).toString("hex");
}
export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (b && b.action === "agent-mode") { try { const r = await agent.saveMode(store(), b, recoverSigner); return json(r.body, r.status); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); } }
  if (!b || b.action !== "settings") return json({ error: "unknown action" }, 400);
  try { const r = await (b.chain === "rh" ? RH.saveSettings : saveSettings)(store(), b, recoverSigner); return json(r.body, r.status); }
  catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
}
