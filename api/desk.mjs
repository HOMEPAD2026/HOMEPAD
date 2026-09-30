// api/desk.mjs — ARCIA DESK (the engine is api/_desk.mjs, the brain api/_desk-brain.mjs).
// Public, read-only:
//   GET /api/desk                         everything the page shows: money, open trades, history, learning, journal, burns
//   GET /api/desk?day=YYYY-MM-DD[&paper=1] one day's closed trades
//   GET /api/desk?day=YYYY-MM-DD&trade=<id> one closed trade in full, with the coin's minute prices around it
// Scheduled (cron-job.org, every minute):
//   GET /api/desk?tick=1&key=<CRON_SECRET>   (or "Authorization: Bearer <CRON_SECRET>")
// Owner only (signed by the desk contract's owner wallet):
//   POST /api/desk {action:"settings", values:{tradePct,…}, issued, signature}   the sizing / scalp-gate settings
// There is no endpoint that makes the desk buy or sell: trades only come from the tick's rules.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { tick, view, dayTrades, tradeDetail, saveSettings } from "./_desk.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";

const json = (o, status = 200, cache = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache, "access-control-allow-origin": "*" } });
const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], getMany: (ks) => getDocs(ks), set: (k, d) => setDoc(k, d) } : null);

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const st = store();
  if (q.tick) {
    const secret = String(process.env.CRON_SECRET || "").trim();
    if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
    if (!st) return json({ error: "the store isn't configured (FIREBASE_SERVICE_ACCOUNT)" }, 503);
    try { return json(await tick(st)); } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
  }
  try {
    if (q.day && q.trade) return json(await tradeDetail(st, q.day, String(q.trade).slice(0, 20)), 200, "public, max-age=60, s-maxage=300");
    if (q.day) return json(await dayTrades(st, q.day, q.paper === "1"), 200, "public, max-age=30, s-maxage=60");
    return json(await view(st), 200, "public, max-age=10, s-maxage=20, stale-while-revalidate=60");
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}

const te = new TextEncoder();
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
  if (!b || b.action !== "settings") return json({ error: "unknown action" }, 400);
  try { const r = await saveSettings(store(), b, recoverSigner); return json(r.body, r.status); }
  catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
}
