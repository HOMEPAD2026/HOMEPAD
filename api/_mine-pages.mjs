// api/_mine-pages.mjs — Builder Mine's HTML pages, served by api/mine.mjs (Node runtime: _mine.mjs needs node:crypto,
// which the edge runtime of api/c.mjs doesn't have).
//   /mine/<id>?r=<wallet>[&c=<card>&k=<ore>]  → the share page (OG card) that forwards into the app
//   /embed/mine/<id>[?theme=light]            → a small live card any site can put in an iframe
import { mineView } from "./_mine.mjs";
import { esc, SITE } from "./_arc.mjs";

const html = (body, cache = "public, max-age=0, s-maxage=300, stale-while-revalidate=900") =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });
const fmtAmt = (raw, dec) => { const n = Number(BigInt(raw || 0)) / 10 ** Number(dec || 18); return !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };

// ---- Builder Mine share page (/mine/<id>?r=<wallet>) — the builder's card, then the mine in the app ----
export async function minePage(url) {
  const id = String(url.searchParams.get("id") || "");
  const r = String(url.searchParams.get("r") || "").toLowerCase();
  const ref = /^0x[0-9a-f]{40}$/.test(r) ? r : "";
  if (!/^\d{1,6}$/.test(id)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#mine">`, "public, max-age=300");
  let v = null;
  try { v = await mineView(Number(id)); } catch { v = null; }
  const sym = v ? "$" + v.token.symbol : "a coin";
  const title = v ? `Mine ${sym} on Arc — Builder Mine #${id}` : "Builder Mine — ARCIRCLE PAD";
  const desc = v ? `${fmtAmt(v.deposited, v.token.decimals)} ${sym} in the mine, ${Number(v.builders).toLocaleString("en-US")} builders. Join with 1 USDC, mine in your browser, claim on Arc. Whatever isn't mined is burned.` : "Holders open a mine, builders dig it. Join with 1 USDC, mine in your browser, claim on Arc.";
  const c = String(url.searchParams.get("c") || ""), k = String(url.searchParams.get("k") || "");
  const card = ["jackpot", "rank", "season", "crew", "open", "book"].includes(c) ? c : "", kind = ["diamond", "arc", "heart"].includes(k) ? k : "";
  const target = `/arc#mine?id=${id}${ref ? `&r=${ref}` : ""}`;
  const image = `${SITE}/api/og?mine=${id}${ref ? `&w=${ref}` : ""}${card ? `&c=${card}` : ""}${kind ? `&k=${kind}` : ""}`;
  return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${SITE}/mine/${id}${ref ? `?r=${ref}` : ""}${card ? `${ref ? "&" : "?"}c=${card}${kind ? `&k=${kind}` : ""}` : ""}`)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@ARCIRCLEonArc">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="icon" href="/images/favicon-32.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#ffc861}</style>
</head><body>
<p>Opening the <a href="${esc(target)}">mine</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=120");
}

// ---- Builder Mine embed (/embed/mine/<id>) — a small live card any site can put in an iframe ----
export async function mineEmbed(url) {
  const id = String(url.searchParams.get("id") || ""), light = url.searchParams.get("theme") === "light";
  let v = null;
  if (/^\d{1,6}$/.test(id)) { try { v = await mineView(Number(id)); } catch { v = null; } }
  const sym = v ? "$" + v.token.symbol : "";
  const layers = ["Grass", "Dirt", "Stone", "Ore", "Deep Rock", "Bedrock"];
  const pct = v ? Math.min(100, Math.round((Number(BigInt(v.emittedNow)) / Math.max(1, Number(BigInt(v.deposited)))) * 100)) : 0;
  const body = !v ? `<div class="card"><b>Builder Mine</b><p>This mine isn't open.</p><a class="go" href="${SITE}/arc#mine" target="_blank" rel="noopener">Open Builder Mine</a></div>`
    : `<div class="card">
  <div class="top"><img src="/images/mine/prop-sign.webp" alt="" width="44" height="44"><div><div class="k">Builder Mine #${esc(id)} · Circle's Arc</div><div class="t">Mine ${esc(sym)}</div></div><span class="st" data-st>${v.now < v.start ? "SOON" : v.now < v.end ? "LIVE" : "ENDED"}</span></div>
  ${v.info && v.info.name ? `<div class="nm">${esc(v.info.name)}</div>` : ""}
  <div class="bars" aria-label="Layer ${v.layer + 1} of 6">${layers.map((n, i) => `<i class="${i < v.layer ? "done" : i === v.layer ? "now" : ""}" title="${n}"></i>`).join("")}</div>
  <div class="row"><span>Layer <b data-layer>${v.layer + 1}</b>/6 · ${esc(layers[v.layer])}</span><span><b data-pct>${pct}</b>% mined</span></div>
  <div class="row"><span><b data-b>${Number(v.builders).toLocaleString("en-US")}</b> builders</span><span><b data-n>${v.active ? v.active.n : 0}</b> digging now</span></div>
  <div class="row"><span>${fmtAmt(v.deposited, v.token.decimals)} ${esc(sym)} in the mine</span><span data-left></span></div>
  <a class="go" href="${SITE}/mine/${esc(id)}" target="_blank" rel="noopener">Join with 1 USDC</a>
  <div class="ft">Whatever isn't mined is burned · arcircle.app</div>
</div>
<script>(function(){var end=${v.end},start=${v.start},el=document.querySelector("[data-left]");
function f(s){return s>86400?Math.floor(s/86400)+"d "+Math.floor(s%86400/3600)+"h":Math.floor(s/3600)+"h "+Math.floor(s%3600/60)+"m";}
function tick(){var t=Date.now()/1000;el.textContent=t<start?"opens in "+f(start-t):t<end?f(end-t)+" left":"ended";}
tick();setInterval(tick,30000);
setInterval(function(){fetch("/api/mine?id=${esc(id)}").then(function(r){return r.json()}).then(function(d){if(!d||d.error)return;
document.querySelector("[data-b]").textContent=Number(d.builders).toLocaleString("en-US");document.querySelector("[data-n]").textContent=d.active?d.active.n:0;
document.querySelector("[data-layer]").textContent=d.layer+1;var p=Math.min(100,Math.round(Number(d.emittedNow)/Math.max(1,Number(d.deposited))*100));document.querySelector("[data-pct]").textContent=p;
[].forEach.call(document.querySelectorAll(".bars i"),function(b,i){b.className=i<d.layer?"done":i===d.layer?"now":"";});}).catch(function(){});},60000);})();</script>`;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Builder Mine ${esc(sym)}</title><meta name="robots" content="noindex">
<style>
:root{--bg:${light ? "#f7faf5" : "#0b100b"};--fg:${light ? "#12200f" : "#eaf2e6"};--mut:${light ? "#56654f" : "#9fb098"};--line:${light ? "#dfe8da" : "#223022"};--acc:#ffc861;--acc2:${light ? "#9a6a00" : "#ffc861"}}
*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--fg);font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}
.card{margin:0;padding:16px;border-radius:18px;background:var(--bg);border:1px solid var(--line);display:flex;flex-direction:column;gap:10px;max-width:420px}
.top{display:flex;align-items:center;gap:10px}.top img{image-rendering:auto;object-fit:contain}.k{font-size:11px;color:var(--mut);letter-spacing:.04em;text-transform:uppercase}.t{font-size:20px;font-weight:800}
.st{margin-left:auto;font-size:11px;font-weight:800;padding:4px 8px;border-radius:999px;background:rgba(255,200,97,.15);color:var(--acc2)}
.nm{font-weight:600}.bars{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.bars i{height:8px;border-radius:4px;background:var(--line)}.bars i.done{background:#5f9e4a}.bars i.now{background:var(--acc);animation:p 1.6s ease-in-out infinite}
@keyframes p{50%{opacity:.55}}@media (prefers-reduced-motion:reduce){.bars i.now{animation:none}}
.row{display:flex;justify-content:space-between;gap:8px;color:var(--mut);font-size:13px;font-variant-numeric:tabular-nums}.row b{color:var(--fg)}
.go{display:block;text-align:center;padding:11px;border-radius:12px;background:var(--acc);color:#1b1300;font-weight:800;text-decoration:none}.go:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
.ft{font-size:11px;color:var(--mut);text-align:center}
</style></head><body>${body}</body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60", "content-security-policy": "frame-ancestors *" } });
}

