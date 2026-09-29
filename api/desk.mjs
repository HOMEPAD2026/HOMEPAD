// api/desk.mjs — ARCIA DESK (the engine is api/_desk.mjs, the brain api/_desk-brain.mjs).
// Public, read-only:
//   GET /api/desk                         everything the page shows: money, open trades, history, learning, journal, burns
//   GET /api/desk?day=YYYY-MM-DD[&paper=1] one day's closed trades
// Scheduled (cron-job.org, every minute):
//   GET /api/desk?tick=1&key=<CRON_SECRET>   (or "Authorization: Bearer <CRON_SECRET>")
// There is no endpoint that makes the desk buy or sell: trades only come from the tick's rules.
import { tick, view, dayTrades } from "./_desk.mjs";
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
    if (q.day) return json(await dayTrades(st, q.day, q.paper === "1"), 200, "public, max-age=30, s-maxage=60");
    return json(await view(st), 200, "public, max-age=10, s-maxage=10, stale-while-revalidate=30");
  } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
}
