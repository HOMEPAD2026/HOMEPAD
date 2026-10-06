// api/_aplist.mjs — ArcPad pages and data the edge serves for the browser (routed by api/c.mjs):
//   launchSnapshot()   every ArcPad launch with its price and market cap, read on the server and cached at the edge
//                      (/api/c?view=launches, s-maxage 60). The browser paints Home and Explore from it at once and keeps
//                      it as the fallback when it can't reach Arc itself ("data from 3 min ago"). Coins launched in the
//                      last 7 days also carry `early`: what the first minute of buying took (swaps in the pool's first
//                      60 seconds, in tokens bought as a share of the supply) — the Explore card's sniper badge.
//   coinEmbed(url)     /embed/coin/<address>[?theme=light] — a small live price card any site can put in an iframe
//   creatorPage(url)   /creator/<address> — the share card for a creator's profile, then the profile in the app
import { getCoin, allPools, getLogs, latestBlock, blockTs, toQty, PM_ADDRESS, TOPIC, isAddr, fmtUsd, esc, SITE } from "./_arc.mjs";

const lc = (a) => String(a || "").toLowerCase();
const SUPPLY = 1e9;
const okImg = (u) => /^https:\/\//i.test(u || "") || (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u || "") && String(u).length <= 6000);
const signed = (hex) => { const v = BigInt(hex); return v >= (1n << 255n) ? v - (1n << 256n) : v; };

/// the first minute of a pool: swaps in [launch, launch + 60 s]. The launch block is found from the launch time:
/// a first guess from the average block time, then secant steps on the real block times (block time isn't constant)
async function earlyBuys(c, latest, spb, deadline) {
  if (!c.poolId || Date.now() > deadline) return null;
  let b = Math.max(0, Math.min(latest.number, Math.round(latest.number - (latest.ts - c.launchedAt) / spb)));
  let prev = { b: latest.number, ts: latest.ts };
  for (let k = 0; k < 5 && Date.now() < deadline; k++) {
    const ts = await blockTs(b).catch(() => null);
    if (ts == null) return null;
    if (ts === c.launchedAt) break;
    const slope = b !== prev.b && ts !== prev.ts ? (ts - prev.ts) / (b - prev.b) : spb;
    if (slope > 0 && slope < 60) spb = slope;
    const d = Math.round((c.launchedAt - ts) / spb);
    prev = { b, ts };
    if (Math.abs(d) <= 1) break;
    b = Math.max(0, Math.min(latest.number, b + d));
  }
  const span = Math.ceil(75 / spb);
  const logs = await getLogs({ address: PM_ADDRESS, topics: [TOPIC.swap, c.poolId], fromBlock: toQty(Math.max(0, b - 4)), toBlock: toQty(Math.min(latest.number, b + span)) }).catch(() => null);
  if (!logs) return null;
  const tokenIs0 = !c.quoteIsCurrency0;
  let tok = 0, n = 0, inLaunch = 0;
  const first = logs.length ? parseInt(logs[0].blockNumber, 16) : null;
  for (const log of logs) {
    const bn = parseInt(log.blockNumber, 16);
    if ((bn - b) * spb > 62) continue;
    const d = log.data.slice(2), a0 = signed("0x" + d.slice(0, 64)), a1 = signed("0x" + d.slice(64, 128));
    const t = tokenIs0 ? a0 : a1;
    if (t <= 0n) continue; // a sell
    tok += Number(t / 10n ** 12n) / 1e6; n++;
    if (bn === first) inLaunch++;
  }
  return { n, pct: Math.round((tok / SUPPLY) * 10000) / 100, first: inLaunch };
}

export async function launchSnapshot({ budgetMs = 15000 } = {}) {
  const t0 = Date.now(), deadline = t0 + budgetMs;
  const pools = (await allPools()).slice().sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 500);
  const coins = [];
  for (let i = 0; i < pools.length; i += 25) {
    const part = await Promise.all(pools.slice(i, i + 25).map((p) => getCoin(p.token).catch(() => null)));
    for (const c of part) if (c) coins.push(c);
  }
  const now = Math.floor(Date.now() / 1000);
  // the sniper read: the newest launches (7 days, at most 40), inside what's left of the budget
  let early = {};
  try {
    const latest = await latestBlock();
    let spb = 0.5;
    const back = Math.max(0, latest.number - 20000), bts = await blockTs(back).catch(() => null);
    if (bts != null) { const m = (latest.ts - bts) / Math.max(1, latest.number - back); if (m > 0.05 && m < 20) spb = m; }
    const fresh = coins.filter((c) => now - c.launchedAt < 7 * 86400).slice(0, 40);
    for (let i = 0; i < fresh.length && Date.now() < deadline - 2000; i += 6) {
      const r = await Promise.all(fresh.slice(i, i + 6).map((c) => earlyBuys(c, latest, spb, deadline).catch(() => null)));
      fresh.slice(i, i + 6).forEach((c, k) => { if (r[k]) early[lc(c.token)] = r[k]; });
    }
  } catch { early = {}; }
  const launches = coins.map((c) => ({
    token: c.token, name: String(c.name || "").slice(0, 48), symbol: String(c.symbol || "").slice(0, 16), creator: c.creator,
    quoteToken: c.quoteToken, quoteSymbol: c.quoteSymbol || "", quoteDecimals: c.quoteDecimals, quoteIsUsdc: !!c.quoteIsUsdc, quoteUsd: c.quoteUsd ?? null,
    quoteIsCurrency0: c.quoteIsCurrency0, extraFeeBps: c.extraFeeBps, imageUrl: okImg(c.imageUrl) ? c.imageUrl : "", description: String(c.description || "").slice(0, 280),
    twitter: c.twitter || "", telegram: c.telegram || "", discord: c.discord || "", website: c.website || "", launchedAt: c.launchedAt,
    initialVirtualQuoteRaw: c.initialVirtualQuoteRaw || "0", priceInQuote: c.priceInQuote ?? null, priceUsdc: c.priceUsd ?? null, marketCapUsd: c.mcapUsd ?? null,
    isLivePrice: c.priceInQuote != null, ...(early[lc(c.token)] ? { early: early[lc(c.token)] } : {}),
  }));
  return { v: 1, at: Date.now(), count: pools.length, launches };
}

// ---------------- /embed/coin/<address> ----------------
export async function coinEmbed(url) {
  const addr = lc(url.searchParams.get("addr")), light = url.searchParams.get("theme") === "light";
  const c = isAddr(addr) ? await getCoin(addr).catch(() => null) : null;
  // the last 24 h of the pool from /api/activity (edge-cached): a sparkline and the change
  let pts = [];
  if (c && c.poolId) {
    try {
      const r = await fetch(`${url.origin}/api/activity`, { signal: AbortSignal.timeout(5000) });
      const j = r.ok ? await r.json() : null;
      const pid = lc(c.poolId), tokenIs0 = !c.quoteIsCurrency0, dq = c.quoteDecimals ?? 6;
      for (const x of (j && j.recs) || []) {
        if (x.p !== pid) continue;
        const sp = Number(BigInt(x.sq)) / 2 ** 96, raw = sp * sp, scale = Math.pow(10, 18 - dq);
        const p = (tokenIs0 ? raw * scale : scale / raw) * (c.quoteUsd ?? 1);
        if (Number.isFinite(p) && p > 0) pts.push(p);
      }
    } catch { pts = []; }
  }
  if (c && c.priceUsd) pts.push(c.priceUsd);
  const chg = pts.length > 1 ? (pts[pts.length - 1] - pts[0]) / pts[0] : null;
  const lo = Math.min(...pts), hi = Math.max(...pts), W = 280, H = 44;
  const path = pts.length > 1 ? pts.map((p, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * W).toFixed(1)} ${(H - 3 - ((p - lo) / (hi - lo || 1)) * (H - 6)).toFixed(1)}`).join(" ") : "";
  const up = chg == null || chg >= 0;
  const logo = c && okImg(c.imageUrl) ? `<img src="${esc(c.imageUrl)}" alt="" width="40" height="40">` : `<span class="ph">${esc(String((c && c.symbol) || "?").slice(0, 1))}</span>`;
  const href = c ? `${SITE}/arc#coin/${c.token}` : `${SITE}/arc`;
  const body = !c ? `<div class="card"><b>ArcPad</b><p>This isn't an ArcPad coin.</p><a class="go" href="${SITE}/arc" target="_blank" rel="noopener">Open ArcPad</a></div>`
    : `<a class="card" href="${href}" target="_blank" rel="noopener" aria-label="$${esc(c.symbol)} on ArcPad">
  <div class="top">${logo}<div class="id"><div class="t">$${esc(c.symbol)}</div><div class="k">${esc(c.name)} · Circle's Arc</div></div>
  <div class="px"><b>${esc(fmtUsd(c.priceUsd))}</b>${chg == null ? "" : `<em class="${up ? "up" : "dn"}">${up ? "▲" : "▼"} ${Math.abs(chg * 100).toFixed(1)}% 24h</em>`}</div></div>
  ${path ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="${up ? "#2fd57c" : "#ff5c7a"}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>` : ""}
  <div class="row"><span>Market cap <b>${esc(fmtUsd(c.mcapUsd))}</b></span><span>Paired with <b>${esc(c.quoteSymbol || "USDC")}</b></span></div>
  <span class="go">Trade on ArcPad</span>
</a>`;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c ? "$" + esc(c.symbol) + " · " : ""}ArcPad</title><meta name="robots" content="noindex"><meta http-equiv="refresh" content="120">
<style>
:root{--bg:${light ? "#f6f9fb" : "#0a0f12"};--fg:${light ? "#0f1a20" : "#eef4f7"};--mut:${light ? "#5a6a73" : "#93a3ad"};--line:${light ? "#dde6eb" : "#1f2a31"};--acc:#39ff88}
*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--fg);font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}
.card{display:flex;flex-direction:column;gap:10px;max-width:360px;padding:14px;border-radius:16px;background:var(--bg);border:1px solid var(--line);color:inherit;text-decoration:none}
.card:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.top{display:flex;align-items:center;gap:10px}.top img,.ph{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none}.ph{display:grid;place-items:center;background:#1d6b4a;color:#fff;font-weight:800}
.id{min-width:0}.t{font-weight:800;font-size:17px}.k{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.px{margin-left:auto;text-align:right;font-variant-numeric:tabular-nums}.px b{display:block;font-size:16px}.px em{font-style:normal;font-size:12px;font-weight:700}.up{color:#1fb866}.dn{color:#e5486a}
svg{width:100%;height:44px;display:block}
.row{display:flex;justify-content:space-between;gap:8px;color:var(--mut);font-size:12px;font-variant-numeric:tabular-nums}.row b{color:var(--fg)}
.go{display:block;text-align:center;padding:9px;border-radius:11px;background:var(--acc);color:#03140a;font-weight:800}
</style></head><body>${body}</body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300", "content-security-policy": "frame-ancestors *" } });
}

// ---------------- /creator/<address> ----------------
export async function creatorPage(url) {
  const a = lc(url.searchParams.get("addr"));
  const ok = isAddr(a), short = ok ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
  let n = 0;
  if (ok) { try { const s = await launchSnapshot({ budgetMs: 2500 }); n = s.launches.filter((l) => lc(l.creator) === a).length; } catch { n = 0; } }
  const target = ok ? `/arc#creator?a=${a}` : "/arc#creators";
  const title = ok ? `Creator ${short} on ArcPad` : "ArcPad creators";
  const desc = ok ? `${n} coin${n === 1 ? "" : "s"} launched on ArcPad — Circle's Arc. Their coins, fees earned and track record.` : "The creators launching on ArcPad.";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex,follow">
<meta property="og:type" content="profile"><meta property="og:site_name" content="ARCIRCLE PAD"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${SITE}/creator/${a}`)}"><meta property="og:image" content="${SITE}/api/og"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@ARCIRCLEonArc">
<meta http-equiv="refresh" content="0;url=${esc(target)}"><link rel="icon" href="/images/favicon-32.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#39ff88}</style>
</head><body><p>Opening <a href="${esc(target)}">${esc(title)}</a>…</p><script>location.replace(${JSON.stringify(target)});</script></body></html>`,
  { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" } });
}
