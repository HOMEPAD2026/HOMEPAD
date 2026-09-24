// api/c.mjs — public pages for ArcPad coins (rewritten here by vercel.json):
//   /c/<address>        share link: Open Graph card for X / Telegram / Discord,
//                        then straight on to the coin page in the app
//   /coin/<address>     indexable coin page: server-rendered HTML with the
//                        coin's facts, links and structured data, so a search
//                        for "$TICKER arc" can land on it
//   /sitemap-coins.xml  every ArcPad coin's /coin/ page, for search engines
import { getCoin, allPools, ethCalls, isAddr, fmtUsd, esc, SITE } from "./_arc.mjs";

export const config = { runtime: "edge" };

const EXPLORER = "https://arc.etherscan.io";
const html = (body, cache = "public, max-age=0, s-maxage=300, stale-while-revalidate=900") =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });

export default async function handler(req) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view");
  if (view === "sitemap") return sitemap();
  const addr = url.searchParams.get("addr") || "";
  let coin = null;
  if (isAddr(addr)) { try { coin = await getCoin(addr); } catch { coin = null; } }
  if (view === "page") return coinPage(coin, addr);
  return sharePage(url, coin);
}

function sharePage(url, coin) {
  const ref = url.searchParams.get("ref") || "";
  const refQ = isAddr(ref) ? `?ref=${ref.toLowerCase()}` : "";
  const target = coin ? `/arc${refQ}#coin/${coin.token}` : `/arc${refQ}`;
  const title = coin ? `$${coin.symbol}${coin.name ? ` — ${coin.name}` : ""} on ArcPad` : "ArcPad — launch a coin on Circle's Arc";
  const desc = coin
    ? `${coin.mcapUsd != null ? `Market cap ${fmtUsd(coin.mcapUsd)}. ` : ""}Trading now in a real Uniswap v4 pool on Circle's Arc${coin.quoteSymbol ? `, paired with ${coin.quoteSymbol}` : ""}.${coin.description ? " " + coin.description.slice(0, 140) : ""}`
    : "Launch a coin with a real Uniswap v4 pool from block one. 1 USDC to launch.";
  const image = `${SITE}/api/og${coin ? `?addr=${coin.token}` : ""}`;
  const canonical = coin ? `${SITE}/coin/${coin.token}` : `${SITE}/arc`;
  return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(coin ? `${SITE}/c/${coin.token}` : canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@HOMEonRobinhood">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="icon" href="/images/favicon-32.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#39ff88}</style>
</head><body>
<p>Opening <a href="${esc(target)}">${esc(title)}</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=120, stale-while-revalidate=600");
}

// ---------------- /coin/<address> ----------------
const safeImg = (u) => /^https:\/\//i.test(u || "") || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u || "");
function link(u, base) {
  u = String(u || "").trim();
  if (!u) return "";
  if (base && /^@?[A-Za-z0-9_]{1,32}$/.test(u)) return base + u.replace(/^@/, "");
  if (/^https?:\/\//i.test(u)) return u;
  return /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(u) ? "https://" + u : "";
}
function avatar(addr, sym) {
  const x = parseInt(String(addr).slice(2, 8), 16) || 0;
  const a = x % 360, b = (a + 70 + (x >> 9) % 90) % 360;
  return `<svg viewBox="0 0 64 64" width="88" height="88" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0b1210"/><circle cx="25" cy="32" r="13" fill="none" stroke="hsl(${a} 85% 60%)" stroke-width="5"/><circle cx="39" cy="32" r="13" fill="none" stroke="hsl(${b} 80% 55%)" stroke-width="5"/></svg>`;
}
async function profileOf(token) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${SITE}/api/social?coin=${token.toLowerCase()}`, { signal: ctl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.enabled ? j : null;
  } catch { return null; }
}
async function newest(except) {
  try {
    const pools = (await allPools()).filter((p) => p.token.toLowerCase() !== String(except || "").toLowerCase()).sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 8);
    const res = await ethCalls(pools.flatMap((p) => [{ to: p.token, data: "0x95d89b41" }, { to: p.token, data: "0x06fdde03" }]));
    const str = (h) => { try { const b = h.replace(/^0x/, ""); const off = parseInt(b.slice(0, 64), 16) * 2; const len = parseInt(b.slice(off, off + 64), 16) * 2; return new TextDecoder().decode(Uint8Array.from(b.slice(off + 64, off + 64 + len).match(/../g) || [], (c) => parseInt(c, 16))); } catch { return ""; } };
    return pools.map((p, i) => ({ token: p.token, symbol: res[i * 2] ? str(res[i * 2]) : "", name: res[i * 2 + 1] ? str(res[i * 2 + 1]) : "" })).filter((c) => c.symbol);
  } catch { return []; }
}
async function coinPage(coin, addr) {
  if (!coin) {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not an ArcPad coin</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif;text-align:center}a{color:#39ff88}</style></head><body><div><h1>Not an ArcPad coin</h1><p>${esc(addr)}</p><p><a href="/arc#explore">Explore ArcPad coins →</a></p></div></body></html>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
  }
  const [social, more] = await Promise.all([profileOf(coin.token), newest(coin.token)]);
  const p = social && social.profile ? social.profile : null;
  const pick = (k) => (p ? p[k] || "" : coin[k] || "");
  const sym = coin.symbol || "COIN", name = coin.name || sym;
  const desc = pick("description");
  const links = [
    ["Website", link(pick("website"))], ["X", link(pick("twitter"), "https://x.com/")],
    ["Telegram", link(pick("telegram"), "https://t.me/")], ["Discord", link(pick("discord"))],
  ].filter(([, u]) => u);
  const x = social && social.creatorX ? social.creatorX.handle : "";
  const tradeUrl = `${SITE}/arc#coin/${coin.token}`;
  const canonical = `${SITE}/coin/${coin.token}`;
  const launched = coin.launchedAt ? new Date(coin.launchedAt * 1000) : null;
  const fee = 1 + (coin.extraFeeBps || 0) / 100;
  const title = `$${sym} (${name}) price, chart & market cap — ArcPad on Arc`;
  const metaDesc = `${name} ($${sym}) is an ArcPad coin on Circle's Arc network, trading in a Uniswap v4 pool paired with ${coin.quoteSymbol || "USDC"}.${coin.mcapUsd != null ? ` Market cap ${fmtUsd(coin.mcapUsd)}.` : ""}${desc ? " " + desc.slice(0, 120) : ""}`;
  const logo = safeImg(coin.imageUrl) ? `<img src="${esc(coin.imageUrl)}" alt="${esc(name)} logo" width="88" height="88">` : avatar(coin.token, sym);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": canonical, url: canonical, name: title, description: metaDesc, inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: "ARCIRCLE PAD", url: SITE },
        about: { "@type": "Thing", name: `${name} ($${sym})`, identifier: coin.token, url: `${EXPLORER}/token/${coin.token}` },
        ...(launched ? { datePublished: launched.toISOString() } : {}) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "ARCIRCLE PAD", item: SITE },
        { "@type": "ListItem", position: 2, name: "ArcPad", item: `${SITE}/arc` },
        { "@type": "ListItem", position: 3, name: `$${sym}`, item: canonical },
      ] },
    ],
  };
  const stat = (k, v) => `<div class="st"><span>${k}</span><b>${esc(v)}</b></div>`;
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(`$${sym} — ${name} on ArcPad`)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/api/og?addr=${coin.token}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@HOMEonRobinhood">
<meta name="theme-color" content="#050805">
<link rel="icon" href="/images/favicon-32.png">
<link rel="preload" href="/fonts/sora-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>
@font-face{font-family:Sora;font-weight:400;font-display:swap;src:url(/fonts/sora-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:Sora;font-weight:700;font-display:swap;src:url(/fonts/sora-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:Sora;font-weight:800;font-display:swap;src:url(/fonts/sora-latin-800-normal.woff2) format("woff2")}
:root{--ink:#eaf2e6;--dim:#9fb098;--line:rgba(232,242,229,.12);--panel:rgba(255,255,255,.035)}
*{box-sizing:border-box}
body{margin:0;background:#050805;color:var(--ink);font:15px/1.6 Sora,system-ui,sans-serif;
  background-image:radial-gradient(900px 500px at 10% -10%,rgba(63,155,255,.16),transparent 60%),radial-gradient(800px 500px at 100% 0%,rgba(57,255,136,.1),transparent 60%)}
a{color:#8dffc0;text-decoration:none}a:hover{text-decoration:underline}
.w{max-width:880px;margin:0 auto;padding:22px 18px 60px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:30px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:800;letter-spacing:.04em}
.brand img{width:36px;height:auto}
.crumb{font-size:.78rem;color:var(--dim)}
.hero{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.hero img,.hero svg{width:88px;height:88px;border-radius:22px;object-fit:cover;border:1px solid var(--line)}
h1{margin:0;font-size:clamp(1.7rem,4.5vw,2.4rem);line-height:1.1;letter-spacing:-.02em}
h1 small{display:block;font-size:.55em;font-weight:400;color:var(--dim);letter-spacing:0;margin-top:6px}
.badge{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:3px 10px;border-radius:999px;font-size:.74rem;font-weight:700;color:#cfe9ff;background:rgba(29,155,240,.12);border:1px solid rgba(29,155,240,.35)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;margin:26px 0;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--line)}
.st{background:#070b09;padding:14px 16px}.st span{display:block;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}.st b{font-size:1.15rem}
.cta{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 30px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:12px;font-weight:800;border:1px solid var(--line);color:var(--ink);background:var(--panel)}
.btn.p{background:linear-gradient(100deg,#3f9bff,#35d8d0 55%,#39ff88);color:#03130c;border-color:transparent}
.btn:hover{text-decoration:none;filter:brightness(1.08)}
.card{border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:18px 20px;margin:0 0 16px}
.card h2{margin:0 0 10px;font-size:1.05rem}
.card p{margin:0 0 10px;color:#cfdac9}
.ca{font:500 .84rem ui-monospace,Menlo,monospace;word-break:break-all;color:var(--ink);background:rgba(0,0,0,.35);padding:10px 12px;border-radius:10px;border:1px solid var(--line)}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{padding:7px 12px;border-radius:999px;border:1px solid var(--line);color:var(--ink);font-size:.84rem}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:0;font-size:.9rem}dt{color:var(--dim)}dd{margin:0}
ol{margin:0;padding-left:20px;color:#cfdac9}
.more{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.more a{padding:10px 12px;border:1px solid var(--line);border-radius:12px;color:var(--ink)}.more small{display:block;color:var(--dim)}
.fine{margin-top:30px;font-size:.74rem;color:var(--dim)}
</style>
</head><body><div class="w">
<header class="top"><a class="brand" href="/"><img src="/images/arcircle-mark-sm.png" alt="" width="36" height="25">ARCIRCLE PAD</a>
<nav class="crumb"><a href="/arc">ArcPad</a> / <a href="/arc#explore">Explore</a> / $${esc(sym)}</nav></header>
<main>
<section class="hero">${logo}<div><h1>$${esc(sym)}<small>${esc(name)} · ArcPad coin on Circle's Arc</small></h1>
${x ? `<a class="badge" href="https://x.com/${encodeURIComponent(x)}" rel="nofollow noopener" target="_blank">Creator verified on X · @${esc(x)}</a>` : ""}</div></section>
<div class="stats">${stat("Price", fmtUsd(coin.priceUsd, { plain: true }))}${stat("Market cap", fmtUsd(coin.mcapUsd))}${stat("Pair", coin.quoteSymbol || "—")}${stat("Trade fee", `${fee}%`)}</div>
<div class="cta"><a class="btn p" href="${esc(tradeUrl)}">Trade $${esc(sym)} on ArcPad →</a><a class="btn" href="${EXPLORER}/token/${coin.token}" rel="nofollow noopener" target="_blank">ArcScan ↗</a></div>
${desc ? `<section class="card"><h2>About ${esc(name)}</h2><p>${esc(desc)}</p></section>` : ""}
<section class="card"><h2>Contract address</h2><div class="ca">${coin.token}</div>
<p style="margin-top:10px;font-size:.84rem">Always check this address before buying — other tokens can use the same name or ticker.</p></section>
${links.length ? `<section class="card"><h2>Links</h2><div class="links">${links.map(([k, u]) => `<a href="${esc(u)}" rel="nofollow noopener ugc" target="_blank">${k}</a>`).join("")}</div></section>` : ""}
<section class="card"><h2>Details</h2><dl>
<dt>Network</dt><dd>Arc mainnet (chain 5042)</dd>
<dt>Pool</dt><dd>Uniswap v4, paired with ${esc(coin.quoteSymbol || "USDC")}</dd>
<dt>Total supply</dt><dd>1,000,000,000 $${esc(sym)} (fixed)</dd>
<dt>Creator</dt><dd><a href="${EXPLORER}/address/${coin.creator}" rel="nofollow noopener" target="_blank">${coin.creator.slice(0, 6)}…${coin.creator.slice(-4)}</a></dd>
${launched ? `<dt>Launched</dt><dd><time datetime="${launched.toISOString()}">${launched.toUTCString().replace(" GMT", " UTC")}</time></dd>` : ""}
</dl></section>
<section class="card"><h2>How to buy $${esc(sym)}</h2><ol>
<li>Get USDC on Circle's Arc network — Arc uses USDC for gas too.</li>
<li>Open <a href="${esc(tradeUrl)}">$${esc(sym)} on ArcPad</a> and connect your wallet.</li>
<li>Enter an amount, check the quote and slippage, and confirm the swap.</li></ol></section>
<section class="card"><h2>What is ArcPad?</h2><p>ArcPad is the instant launchpad of <a href="/">ARCIRCLE PAD</a>. Every coin gets a real Uniswap v4 pool from block one, starts from the same fair price and pays most of its trading fee to its creator. New launches are posted live to <a href="https://t.me/arcircle_launch" rel="noopener">@arcircle_launch</a>.</p></section>
${more.length ? `<section class="card"><h2>Newest ArcPad coins</h2><div class="more">${more.map((c) => `<a href="/coin/${c.token}">$${esc(c.symbol)}<small>${esc(c.name)}</small></a>`).join("")}</div></section>` : ""}
<p class="fine">Figures are read live from Arc and cached for a few minutes. Nothing here is financial advice; crypto assets can lose all of their value.</p>
</main></div></body></html>`;
  return html(body);
}

// ---------------- /sitemap-coins.xml ----------------
async function sitemap() {
  let pools = [];
  try { pools = await allPools(); } catch { pools = []; }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pools.map((p) => `  <url><loc>${SITE}/coin/${p.token}</loc>${p.launchedAt ? `<lastmod>${new Date(p.launchedAt * 1000).toISOString().slice(0, 10)}</lastmod>` : ""}<changefreq>daily</changefreq><priority>0.6</priority></url>`).join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" } });
}
