// api/c.mjs — the share page for an ArcPad coin: www.arcircle.app/c/<address>
// (rewritten here by vercel.json). Link previews on X, Telegram, Discord…
// read its Open Graph tags — title, live market cap and a generated image
// (/api/og) — and people who open it are sent straight on to the coin page.
import { getCoin, isAddr, fmtUsd, esc, SITE } from "./_arc.mjs";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const url = new URL(req.url);
  const addr = url.searchParams.get("addr") || "";
  const ref = url.searchParams.get("ref") || "";
  const refQ = isAddr(ref) ? `?ref=${ref.toLowerCase()}` : "";
  let coin = null;
  if (isAddr(addr)) { try { coin = await getCoin(addr); } catch { coin = null; } }
  const target = coin ? `/arc${refQ}#coin/${coin.token}` : `/arc${refQ}`;
  const title = coin ? `$${coin.symbol}${coin.name ? ` — ${coin.name}` : ""} on ArcPad` : "ArcPad — launch a coin on Circle's Arc";
  const desc = coin
    ? `${coin.mcapUsd != null ? `Market cap ${fmtUsd(coin.mcapUsd)}. ` : ""}Trading now in a real Uniswap v4 pool on Circle's Arc${coin.quoteSymbol ? `, paired with ${coin.quoteSymbol}` : ""}.${coin.description ? " " + coin.description.slice(0, 140) : ""}`
    : "Launch a coin with a real Uniswap v4 pool from block one. 1 USDC to launch.";
  const image = `${SITE}/api/og${coin ? `?addr=${coin.token}` : ""}`;
  const canonical = coin ? `${SITE}/c/${coin.token}` : `${SITE}/arc`;
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="icon" href="/images/favicon-32.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#39ff88}</style>
</head><body>
<p>Opening <a href="${esc(target)}">${esc(title)}</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600" },
  });
}
