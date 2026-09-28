// api/arcia402.mjs — ARCIA 402: ARCIA's paid API (x402 on Arc) and her public books.
//   GET  /arcia402                         the storefront: services, prices, how to pay (JSON)
//   GET  /arcia402/<service>?token=0x…      402 Payment Required → pay → the answer
//        token-analysis (token) · wallet-analysis (wallet) · launch-analysis (token) · arc-intelligence
//   GET  /api/arcia402?stats=1             ARCIA's wallet, balances, revenue / expenses / net, ledger
//   GET  /api/arcia402?discover=1          the x402 services on Arc ARCIA could hire right now
//   GET  /api/arcia402?hire=1&key=<CRON_SECRET>[&force=1]   ARCIA hires one agent (budget-capped)
// Paying: X-PAYMENT = base64 JSON — the standard x402 "exact" payload (EIP-3009 authorization on
// Arc's USDC, settled by ARCIA), or { scheme: "arc-tx", payload: { txHash } } after sending the
// USDC yourself. Details: api/_x402.mjs.
import * as A from "./_arcia402.mjs";
import * as X from "./_x402.mjs";

const SITE = "https://www.arcircle.app";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-payment, payment-signature",
  "access-control-expose-headers": "x-payment-response, payment-required, payment-response",
};
const json = (status, body, headers = {}, cache = "no-store") => new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...CORS, ...headers } });
const hits = new Map();
function limited(key, n, ms) {
  const now = Date.now(), a = (hits.get(key) || []).filter((t) => now - t < ms);
  a.push(now); hits.set(key, a);
  if (hits.size > 5000) hits.clear();
  return a.length > n;
}

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  try {
    if (q.stats) return json(200, await A.stats(), {}, "public, max-age=15, s-maxage=20");
    if (q.discover) {
      const list = await A.discover({ category: q.category || "", query: q.query || "" }).catch((e) => ({ error: String(e.message || e) }));
      return json(200, Array.isArray(list) ? { network: X.NETWORK, count: list.length, services: list.map(({ acc, schema, ...x }) => ({ ...x, usd: x.amount / 1e6 })) } : list, {}, "public, max-age=120, s-maxage=300");
    }
    if (q.hire) {
      const secret = process.env.CRON_SECRET;
      if (!secret || (q.key !== secret && req.headers.get("authorization") !== `Bearer ${secret}`)) return json(401, { error: "unauthorized" });
      return json(200, await A.hire({ force: q.force === "1" }));
    }
    if (q.svc) {
      if (limited(`svc:${ip}`, 40, 60e3)) return json(429, { error: "slow down" });
      const resource = `${SITE}/arcia402/${q.svc}${url.search.replace(/([?&])svc=[^&]*&?/, "$1").replace(/[?&]$/, "")}`;
      const out = await A.sell(q.svc, q, req.headers, resource);
      return json(out.status, out.body, out.headers || {});
    }
    // the storefront
    return json(200, {
      name: "ARCIA 402", by: "ARCIRCLE PAD", about: "ARCIA doesn't just think — she works, pays, earns and builds on Arc. Pay per call in USDC with x402.",
      x402Version: 1, network: X.NETWORK, asset: X.USDC, payTo: X.wallet() || null, settles: X.canSign() ? ["exact", "arc-tx"] : ["arc-tx"],
      services: A.SERVICES.map((s) => ({ id: s.id, title: s.title, description: s.desc, method: "GET", endpoint: `${SITE}/arcia402/${s.id}`, input: s.input ? { [s.input]: "0x… address" } : {}, price: { usd: s.price / 1e6, amount: String(s.price), asset: X.USDC, network: X.NETWORK } })),
      books: `${SITE}/api/arcia402?stats=1`, page: `${SITE}/arc#arcia402`,
    }, {}, "public, max-age=60, s-maxage=300");
  } catch (e) {
    console.error("arcia402", String(e && e.message || e));
    return json(e && e.status ? e.status : 502, { error: String(e && e.message || e).slice(0, 200) });
  }
}
export async function POST(req) { return GET(req); }
