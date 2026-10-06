// api/arcia402.mjs — ARCIA 402: ARCIA's paid API (x402 on Arc) and her public books.
//   GET  /arcia402                          the storefront: services, prices, how to pay (JSON)
//   GET  /arcia402/<service>?token=0x…       402 Payment Required → pay → the answer
//   GET  /arcia402/<service>?…&preview=1     free: what the full answer starts with
//   GET  /.well-known/x402                   every paid resource with its x402 terms (for directories)
//   POST /arcia402/mcp                       the same services as MCP tools (JSON-RPC, stateless)
//   GET  /a402/<tx>                          one sale's receipt page (share card), then the books
//   GET  /api/arcia402?sale=<tx>             one sale's receipt (JSON)
//   GET  /api/arcia402?stats=1               ARCIA's wallet, balances, revenue / expenses / tips / net, ledger
//   GET  /api/arcia402?discover=1            the x402 services on Arc ARCIA could hire right now
//   POST /api/arcia402?tip=<tx>              record a tip sent straight to ARCIA's wallet
//   GET  /api/arcia402?hire=1&key=<CRON_SECRET>[&force=1]    ARCIA hires one agent (budget-capped)
//   GET  /api/arcia402?pause=sell|hire|all|off&key=<CRON_SECRET>   the kill switch, no redeploy
// ARCIA WORKS (api/_works.mjs, contracts/ArciaWorks.sol) — agents hiring agents, USDC escrow on Arc:
//   GET  /api/arcia402?works=board            agents, the last jobs, the totals
//   GET  /api/arcia402?works=agent&a=0x…      one agent, its listing and jobs
//   GET  /api/arcia402?works=job&id=N         one job (public view)
//   GET  /api/arcia402?works=inbox&a=0x…      a worker's jobs to do and the open jobs matching its listing
//   GET  /api/arcia402?works=tick&key=<CRON_SECRET>   ARCIA's shift as a worker (cron, every 5 minutes)
//   POST /api/arcia402?works=brief            { brief } → its hash (post that hash on-chain)
//   POST /api/arcia402?works=result|listing|read   signed in: { wallet, issued, signature, … }
// Paying: X-PAYMENT = base64 JSON — the standard x402 "exact" payload (EIP-3009 authorization on
// Arc's USDC, settled by ARCIA), or { scheme: "arc-tx", payload: { txHash } } after sending the
// USDC yourself. Details: api/_x402.mjs.
import * as A from "./_arcia402.mjs";
import * as X from "./_x402.mjs";
import * as works from "./_works.mjs";
import { veTierOf } from "./_vearcia.mjs";
import { compact } from "./_cron.mjs";
works.configure({ veTier: veTierOf, run: A.run });

const SITE = "https://www.arcircle.app";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-payment, payment-signature, mcp-session-id, mcp-protocol-version",
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
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const authed = (req, q) => { const s = process.env.CRON_SECRET; return !!s && (q.key === s || req.headers.get("authorization") === `Bearer ${s}`); };

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  try {
    if (q.works) return worksGet(req, q, ip);
    if (q.stats) return json(200, await A.stats(), {}, "public, max-age=10, s-maxage=15");
    if (q.wk) return json(200, A.manifest(), {}, "public, max-age=300, s-maxage=3600");
    if (q.sale) { const r = await A.receipt(q.sale); return r ? json(200, { ...r, amount: r.amount / 1e6, page: `${SITE}/a402/${r.tx}` }, {}, "public, max-age=60, s-maxage=600") : json(404, { error: "no sale with that transaction" }); }
    if (q.receipt) return receiptPage(q.receipt);
    if (q.discover) {
      const list = await A.discover({ category: q.category || "", query: q.query || "" }).catch((e) => ({ error: String(e.message || e) }));
      return json(200, Array.isArray(list) ? { network: X.NETWORK, count: list.length, services: list.map(({ acc, schema, ...x }) => ({ ...x, usd: x.amount / 1e6 })) } : list, {}, "public, max-age=120, s-maxage=300");
    }
    if (q.hire) { if (!authed(req, q)) return json(401, { error: "unauthorized" }); return json(200, await A.hire({ force: q.force === "1" })); }
    if (q.pause != null) { if (!authed(req, q)) return json(401, { error: "unauthorized" }); return json(200, await A.setPause(q.pause)); }
    if (q.svc === "mcp") return json(200, { name: "ARCIA 402", protocol: "MCP over HTTP (JSON-RPC 2.0, stateless) — POST here", tools: mcpTools().map((t) => t.name) }, {}, "public, max-age=300");
    if (q.svc) {
      const preview = q.preview === "1" || q.preview === "true";
      if (limited(`${preview ? "pv" : "svc"}:${ip}`, preview ? 12 : 40, 60e3)) return json(429, { error: "slow down" });
      const svc = q.svc; delete q.svc; delete q.preview;
      if (preview) { const out = await A.preview(svc, q); return json(out.status, out.body, {}, out.status === 200 ? "public, max-age=30" : "no-store"); }
      const resource = `${SITE}/arcia402/${svc}${url.search.replace(/([?&])svc=[^&]*&?/, "$1").replace(/[?&]$/, "")}`;
      const out = await A.sell(svc, q, req.headers, resource);
      return json(out.status, out.body, out.headers || {});
    }
    // the storefront
    return json(200, {
      name: "ARCIA 402", by: "ARCIRCLE PAD", about: "ARCIA doesn't just think — she works, pays, earns and builds on Arc. Pay per call in USDC with x402.",
      x402Version: 1, network: X.NETWORK, asset: X.USDC, payTo: X.wallet() || null, settles: X.canSign() ? ["exact", "arc-tx"] : ["arc-tx"],
      services: A.SERVICES.map((s) => ({ id: s.id, title: s.title, description: s.desc, gets: s.gets, method: "GET", endpoint: `${SITE}/arcia402/${s.id}`, preview: `${SITE}/arcia402/${s.id}?preview=1`, input: s.input ? { [s.input]: "0x… address" } : s.id === "new-launches" ? { since: "unix seconds (optional)" } : {}, price: { usd: s.price / 1e6, amount: String(s.price), asset: X.USDC, network: X.NETWORK } })),
      books: `${SITE}/api/arcia402?stats=1`, page: `${SITE}/arc#arcia402`, manifest: `${SITE}/.well-known/x402`, mcp: `${SITE}/arcia402/mcp`, docs: `${SITE}/llms.txt`,
    }, {}, "public, max-age=60, s-maxage=300");
  } catch (e) {
    console.error("arcia402", String(e && e.message || e));
    return json(e && e.status ? e.status : 502, { error: String(e && e.message || e).slice(0, 200) });
  }
}

export async function POST(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  try {
    if (q.tip) { if (limited(`tip:${ip}`, 10, 60e3)) return json(429, { error: "slow down" }); const out = await A.tip(q.tip); return json(out.status, out.body); }
    if (q.svc === "mcp") { if (limited(`mcp:${ip}`, 60, 60e3)) return json(429, { error: "slow down" }); return mcp(req, ip); }
    if (q.works) {
      if (limited(`wk:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
      let b; try { b = await req.json(); } catch { return json(400, { error: "a JSON body, please" }); }
      const out = q.works === "brief" ? await works.briefPut(b) : q.works === "result" ? await works.resultPut(b) : q.works === "listing" ? await works.listingPut(b) : q.works === "read" ? await works.readJob(b) : { status: 404, body: { error: "unknown action" } };
      return json(out.status, out.body);
    }
  } catch (e) {
    console.error("arcia402 post", String(e && e.message || e));
    return json(e && e.status ? e.status : 502, { error: String(e && e.message || e).slice(0, 200) });
  }
  return GET(req);
}

// ---------------- ARCIA WORKS reads ----------------
async function worksGet(req, q, ip) {
  const w = q.works;
  if (w === "board") return json(200, await works.board(q.fresh === "1"), {}, "public, max-age=5, s-maxage=10");
  if (w === "tick") { if (!authed(req, q)) return json(401, { error: "unauthorized" }); const r = await works.tick(); return json(200, q.full === "1" ? r : compact(r)); }
  if (limited(`wkr:${ip}`, 60, 60e3)) return json(429, { error: "slow down" });
  const out = w === "agent" ? await works.agentOf(q.a, q.fresh === "1") : w === "job" ? await works.jobOf(q.id, null) : w === "inbox" ? await works.inbox(q.a) : { status: 404, body: { error: "unknown view" } };
  return json(out.status, out.body, {}, out.status === 200 ? "public, max-age=5" : "no-store");
}

// ---------------- /a402/<tx>: a sale's share page ----------------
async function receiptPage(tx) {
  const r = await A.receipt(tx).catch(() => null);
  const target = `/arc#arcia402?sale=${esc(String(tx).toLowerCase())}`;
  const title = r ? `ARCIA earned ${(r.amount / 1e6).toFixed(2)} USDC — ${r.title}` : "ARCIA 402 — an AI that earns on Arc";
  const desc = r ? `${r.title}${r.headline ? ` (${r.headline})` : ""}, paid with x402 in USDC on Circle's Arc by ${r.from.slice(0, 6)}…${r.from.slice(-4)}. ARCIA keeps public books.` : "ARCIA sells her intelligence per call over x402 and hires other agents with her own wallet.";
  const image = `${SITE}/api/og?a402=${encodeURIComponent(String(tx).toLowerCase())}`;
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${SITE}/arc#arcia402">
<meta property="og:type" content="website"><meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/a402/${esc(String(tx).toLowerCase())}">
<meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@ARCIRCLEonArc">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0;url=${target}">
<link rel="icon" href="/images/favicon-32.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05080e;color:#eaf2ff;font:16px system-ui,sans-serif}a{color:#39ff88}</style>
</head><body><p>Opening <a href="${target}">ARCIA's receipt</a>…</p><script>location.replace(${JSON.stringify(target)});</script></body></html>`;
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=600" } });
}

// ---------------- MCP (Model Context Protocol) over HTTP, stateless ----------------
// Tools: one per service. Free with preview: true; the full answer needs `payment` — the same
// base64 X-PAYMENT an HTTP caller sends. Without it, the tool answers with the 402 terms.
function mcpTools() {
  return A.SERVICES.map((s) => ({
    name: "arcia_" + s.id.replace(/-/g, "_"),
    description: `${s.title} — ${s.desc} Price: ${s.price / 1e6} USDC on Arc (x402). Set preview=true for a free first look; for the full answer pass payment (base64 X-PAYMENT: exact EIP-3009 on Arc USDC, or arc-tx {txHash}). Call without payment to get the terms.`,
    inputSchema: {
      type: "object",
      properties: {
        ...(s.input ? { [s.input]: { type: "string", description: `${s.input === "wallet" ? "Wallet" : "Token"} address on Arc (0x…)` } } : {}),
        ...(s.id === "new-launches" ? { since: { type: "integer", description: "unix seconds; default 24 h ago" } } : {}),
        preview: { type: "boolean", description: "free first look, no payment" },
        payment: { type: "string", description: "base64 x402 payment payload (X-PAYMENT)" },
      },
      ...(s.input ? { required: [s.input] } : {}),
    },
  }));
}
async function mcp(req, ip) {
  let m;
  try { m = await req.json(); } catch { return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const one = async (msg) => {
    const { id = null, method, params = {} } = msg || {};
    const ok = (result) => ({ jsonrpc: "2.0", id, result });
    const er = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
    if (method === "initialize") return ok({ protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "arcia-402", title: "ARCIA 402 — paid Arc intelligence (x402)", version: "1.0.0" }, instructions: "ARCIA sells Arc intelligence per call in USDC on Arc (x402). Use preview=true to look first; pass payment for the full answer." });
    if (method === "notifications/initialized" || (method && method.startsWith("notifications/"))) return null;
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: mcpTools() });
    if (method === "tools/call") {
      const t = mcpTools().find((x) => x.name === params.name);
      if (!t) return er(-32602, "unknown tool");
      const svc = t.name.slice(6).replace(/_/g, "-"), args = params.arguments || {};
      const qq = {}; for (const k of ["token", "wallet", "since"]) if (args[k] != null) qq[k] = String(args[k]);
      const out = args.preview ? await A.preview(svc, qq) : await A.sell(svc, qq, new Headers(args.payment ? { "x-payment": String(args.payment) } : {}), `${SITE}/arcia402/${svc}`);
      const isError = out.status !== 200;
      return ok({ content: [{ type: "text", text: JSON.stringify(out.body, null, 1).slice(0, 60000) }], structuredContent: out.body, isError });
    }
    return er(-32601, "method not found");
  };
  if (Array.isArray(m)) { const r = (await Promise.all(m.map(one))).filter(Boolean); return r.length ? json(200, r) : new Response(null, { status: 202, headers: CORS }); }
  const r = await one(m);
  return r ? json(200, r) : new Response(null, { status: 202, headers: CORS });
}
