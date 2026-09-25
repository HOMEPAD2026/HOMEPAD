// api/c.mjs — public pages for ArcPad coins (rewritten here by vercel.json):
//   /c/<address>        share link: Open Graph card for X / Telegram / Discord,
//                        then straight on to the coin page in the app
//   /coin/<address>     indexable coin page: server-rendered HTML with the
//                        coin's facts, links and structured data, so a search
//                        for "$TICKER arc" can land on it
//   /ko/coin/<address>  the same page in Korean, /zh/coin/<address> in
//                        Simplified Chinese — linked to each other with hreflang
//   /sitemap-coins.xml  every ArcPad coin's /coin/ page, for search engines
import { getCoin, allPools, ethCalls, isAddr, fmtUsd, esc, SITE } from "./_arc.mjs";
import { roundState, contributionOf } from "./_round.mjs";

export const config = { runtime: "edge" };

const EXPLORER = "https://arc.etherscan.io";
const html = (body, cache = "public, max-age=0, s-maxage=300, stale-while-revalidate=900") =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });

export default async function handler(req) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view");
  if (view === "sitemap") return sitemap();
  if (view === "round") return roundPage(url);
  const addr = url.searchParams.get("addr") || "";
  let coin = null;
  if (isAddr(addr)) { try { coin = await getCoin(addr); } catch { coin = null; } }
  const lang = LANGS.includes(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "en";
  if (view === "page") return coinPage(coin, addr, lang);
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
<meta name="twitter:site" content="@ARCIRCLEonArc">
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

// ---------------- /coin/<address> (+ /ko/, /zh/) ----------------
const LANGS = ["en", "ko", "zh"];
const HREFLANG = { en: "en", ko: "ko", zh: "zh-Hans" };
const pagePath = (l, token) => `${l === "en" ? "" : `/${l}`}/coin/${token}`;
// Every visible string on the coin page, per language. Functions take the
// bits that are spliced in (ticker, name, pair, …) — already HTML-escaped.
const T = {
  en: {
    title: (s, n) => `$${s} (${n}) price, chart & market cap — ArcPad on Arc`,
    meta: (s, n, q) => `${n} ($${s}) is an ArcPad coin on Circle's Arc network, trading in a Uniswap v4 pool paired with ${q}.`,
    mcap: (v) => ` Market cap ${v}.`,
    og: (s, n) => `$${s} — ${n} on ArcPad`,
    explore: "Explore", sub: "ArcPad coin on Circle's Arc", verified: "Creator verified on X",
    price: "Price", marketCap: "Market cap", pair: "Pair", fee: "Trade fee",
    trade: (s) => `Trade $${s} on ArcPad →`, about: (n) => `About ${n}`,
    ca: "Contract address", caWarn: "Always check this address before buying — other tokens can use the same name or ticker.",
    links: "Links", details: "Details", network: "Network", networkV: "Arc mainnet (chain 5042)",
    pool: "Pool", poolV: (q) => `Uniswap v4, paired with ${q}`, supply: "Total supply", fixed: "(fixed)",
    creator: "Creator", launched: "Launched",
    howTo: (s) => `How to buy $${s}`,
    step1: "Get USDC on Circle's Arc network — Arc uses USDC for gas too.",
    step2: (a) => `Open ${a} and connect your wallet.`, step2link: (s) => `$${s} on ArcPad`,
    step3: "Enter an amount, check the quote and slippage, and confirm the swap.",
    what: "What is ArcPad?",
    whatP: (home, tg) => `ArcPad is the instant launchpad of ${home}. Every coin gets a real Uniswap v4 pool from block one, starts from the same fair price and pays most of its trading fee to its creator. New launches are posted live to ${tg}.`,
    newest: "Newest ArcPad coins",
    fine: "Figures are read live from Arc and cached for a few minutes. Nothing here is financial advice; crypto assets can lose all of their value.",
  },
  ko: {
    title: (s, n) => `$${s} (${n}) 시세·차트·시가총액 — Arc의 ArcPad`,
    meta: (s, n, q) => `ArcPad 코인 ${n}($${s}) — Circle의 Arc 네트워크에서 ${q} 페어 Uniswap v4 풀로 거래됩니다.`,
    mcap: (v) => ` 시가총액 ${v}.`,
    og: (s, n) => `$${s} — ArcPad의 ${n}`,
    explore: "탐색", sub: "Circle Arc의 ArcPad 코인", verified: "X 인증 크리에이터",
    price: "가격", marketCap: "시가총액", pair: "페어", fee: "거래 수수료",
    trade: (s) => `ArcPad에서 $${s} 거래 →`, about: (n) => `${n} 소개`,
    ca: "컨트랙트 주소", caWarn: "구매 전에 반드시 이 주소를 확인하세요 — 다른 토큰이 같은 이름이나 티커를 쓸 수 있습니다.",
    links: "링크", details: "상세 정보", network: "네트워크", networkV: "Arc 메인넷 (체인 5042)",
    pool: "풀", poolV: (q) => `Uniswap v4, ${q} 페어`, supply: "총 발행량", fixed: "(고정)",
    creator: "크리에이터", launched: "출시",
    howTo: (s) => `$${s} 구매 방법`,
    step1: "Circle의 Arc 네트워크에서 USDC를 준비하세요 — Arc는 가스비도 USDC로 냅니다.",
    step2: (a) => `${a} 페이지를 열고 지갑을 연결하세요.`, step2link: (s) => `ArcPad의 $${s}`,
    step3: "수량을 입력하고 견적과 슬리피지를 확인한 뒤 스왑을 확정하세요.",
    what: "ArcPad란?",
    whatP: (home, tg) => `ArcPad는 ${home}의 즉시 런치패드입니다. 모든 코인은 첫 블록부터 실제 Uniswap v4 풀을 갖고, 같은 공정한 가격에서 시작하며, 거래 수수료의 대부분이 크리에이터에게 돌아갑니다. 새 런치는 ${tg}에 실시간으로 올라옵니다.`,
    newest: "최신 ArcPad 코인",
    fine: "수치는 Arc에서 실시간으로 읽어 몇 분간 캐시됩니다. 이 페이지는 투자 조언이 아니며, 암호화폐는 가치를 모두 잃을 수 있습니다.",
  },
  zh: {
    title: (s, n) => `$${s}（${n}）价格、图表与市值 — Arc 上的 ArcPad`,
    meta: (s, n, q) => `${n}（$${s}）是 Circle Arc 网络上的 ArcPad 代币，在与 ${q} 配对的 Uniswap v4 池中交易。`,
    mcap: (v) => `市值 ${v}。`,
    og: (s, n) => `$${s} — ArcPad 上的 ${n}`,
    explore: "探索", sub: "Circle Arc 上的 ArcPad 代币", verified: "创作者已通过 X 验证",
    price: "价格", marketCap: "市值", pair: "交易对", fee: "交易费",
    trade: (s) => `在 ArcPad 交易 $${s} →`, about: (n) => `关于 ${n}`,
    ca: "合约地址", caWarn: "购买前请务必核对此地址——其他代币可能使用相同的名称或代码。",
    links: "链接", details: "详情", network: "网络", networkV: "Arc 主网（链 ID 5042）",
    pool: "资金池", poolV: (q) => `Uniswap v4，与 ${q} 配对`, supply: "总供应量", fixed: "（固定）",
    creator: "创作者", launched: "上线时间",
    howTo: (s) => `如何购买 $${s}`,
    step1: "在 Circle 的 Arc 网络上准备 USDC——Arc 的 Gas 费也用 USDC 支付。",
    step2: (a) => `打开${a}并连接钱包。`, step2link: (s) => `ArcPad 上的 $${s}`,
    step3: "输入数量，确认报价和滑点后完成兑换。",
    what: "什么是 ArcPad？",
    whatP: (home, tg) => `ArcPad 是 ${home} 的即时发射台。每个代币从第一个区块起就拥有真实的 Uniswap v4 池，以相同的公平价格起步，大部分交易手续费归创作者所有。新上线的代币会实时发布到 ${tg}。`,
    newest: "最新 ArcPad 代币",
    fine: "数据实时读取自 Arc，并缓存数分钟。本页内容不构成投资建议；加密资产可能损失全部价值。",
  },
};
const LANG_NAME = { en: "English", ko: "한국어", zh: "简体中文" };
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
async function coinPage(coin, addr, lang = "en") {
  const t = T[lang] || T.en;
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
  const lq = lang === "en" ? "" : `?lang=${lang}`;
  const tradeUrl = `${SITE}/arc${lq}#coin/${coin.token}`;
  const canonical = `${SITE}${pagePath(lang, coin.token)}`;
  const alternates = LANGS.map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE}${pagePath(l, coin.token)}">`).join("\n")
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${pagePath("en", coin.token)}">`;
  const switcher = LANGS.map((l) => (l === lang ? `<b>${LANG_NAME[l]}</b>` : `<a href="${pagePath(l, coin.token)}" hreflang="${HREFLANG[l]}" lang="${HREFLANG[l]}">${LANG_NAME[l]}</a>`)).join('<span aria-hidden="true">·</span>');
  const launched = coin.launchedAt ? new Date(coin.launchedAt * 1000) : null;
  const fee = 1 + (coin.extraFeeBps || 0) / 100;
  const title = t.title(sym, name);
  const metaDesc = `${t.meta(sym, name, coin.quoteSymbol || "USDC")}${coin.mcapUsd != null ? t.mcap(fmtUsd(coin.mcapUsd)) : ""}${desc ? " " + desc.slice(0, 120) : ""}`;
  const logo = safeImg(coin.imageUrl) ? `<img src="${esc(coin.imageUrl)}" alt="${esc(name)} logo" width="88" height="88">` : avatar(coin.token, sym);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": canonical, url: canonical, name: title, description: metaDesc, inLanguage: HREFLANG[lang],
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
<html lang="${HREFLANG[lang]}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${esc(canonical)}">
${alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:locale" content="${lang === "ko" ? "ko_KR" : lang === "zh" ? "zh_CN" : "en_US"}">
<meta property="og:title" content="${esc(t.og(sym, name))}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/api/og?addr=${coin.token}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@ARCIRCLEonArc">
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
.langs{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin:-18px 0 22px;font-size:.76rem;color:var(--dim)}.langs b{color:var(--ink);font-weight:700}.langs a{color:var(--dim)}
</style>
</head><body><div class="w">
<header class="top"><a class="brand" href="/"><img src="/images/arcircle-mark-sm.png" alt="" width="36" height="25">ARCIRCLE PAD</a>
<nav class="crumb"><a href="/arc${lq}">ArcPad</a> / <a href="/arc${lq}#explore">${t.explore}</a> / $${esc(sym)}</nav></header>
<nav class="langs" aria-label="Language">${switcher}</nav>
<main>
<section class="hero">${logo}<div><h1>$${esc(sym)}<small>${esc(name)} · ${t.sub}</small></h1>
${x ? `<a class="badge" href="https://x.com/${encodeURIComponent(x)}" rel="nofollow noopener" target="_blank">${t.verified} · @${esc(x)}</a>` : ""}</div></section>
<div class="stats">${stat(t.price, fmtUsd(coin.priceUsd, { plain: true }))}${stat(t.marketCap, fmtUsd(coin.mcapUsd))}${stat(t.pair, coin.quoteSymbol || "—")}${stat(t.fee, `${fee}%`)}</div>
<div class="cta"><a class="btn p" href="${esc(tradeUrl)}">${t.trade(esc(sym))}</a><a class="btn" href="${EXPLORER}/token/${coin.token}" rel="nofollow noopener" target="_blank">ArcScan ↗</a></div>
${desc ? `<section class="card"><h2>${t.about(esc(name))}</h2><p>${esc(desc)}</p></section>` : ""}
<section class="card"><h2>${t.ca}</h2><div class="ca">${coin.token}</div>
<p style="margin-top:10px;font-size:.84rem">${t.caWarn}</p></section>
${links.length ? `<section class="card"><h2>${t.links}</h2><div class="links">${links.map(([k, u]) => `<a href="${esc(u)}" rel="nofollow noopener ugc" target="_blank">${k}</a>`).join("")}</div></section>` : ""}
<section class="card"><h2>${t.details}</h2><dl>
<dt>${t.network}</dt><dd>${t.networkV}</dd>
<dt>${t.pool}</dt><dd>${t.poolV(esc(coin.quoteSymbol || "USDC"))}</dd>
<dt>${t.supply}</dt><dd>1,000,000,000 $${esc(sym)} ${t.fixed}</dd>
<dt>${t.creator}</dt><dd><a href="${EXPLORER}/address/${coin.creator}" rel="nofollow noopener" target="_blank">${coin.creator.slice(0, 6)}…${coin.creator.slice(-4)}</a></dd>
${launched ? `<dt>${t.launched}</dt><dd><time datetime="${launched.toISOString()}">${launched.toUTCString().replace(" GMT", " UTC")}</time></dd>` : ""}
</dl></section>
<section class="card"><h2>${t.howTo(esc(sym))}</h2><ol>
<li>${t.step1}</li>
<li>${t.step2(`<a href="${esc(tradeUrl)}">${t.step2link(esc(sym))}</a>`)}</li>
<li>${t.step3}</li></ol></section>
<section class="card"><h2>${t.what}</h2><p>${t.whatP('<a href="/">ARCIRCLE PAD</a>', '<a href="https://t.me/arcircle_launch" rel="noopener">@arcircle_launch</a>')}</p></section>
${more.length ? `<section class="card"><h2>${t.newest}</h2><div class="more">${more.map((c) => `<a href="${pagePath(lang, c.token)}">$${esc(c.symbol)}<small>${esc(c.name)}</small></a>`).join("")}</div></section>` : ""}
<p class="fine">${t.fine}</p>
</main></div></body></html>`;
  return html(body);
}

// ---------------- /sitemap-coins.xml ----------------
async function sitemap() {
  let pools = [];
  try { pools = await allPools(); } catch { pools = []; }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pools.map((p) => {
    const alt = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE}${pagePath(l, p.token)}"/>`).join("")
      + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pagePath("en", p.token)}"/>`;
    const mod = p.launchedAt ? `<lastmod>${new Date(p.launchedAt * 1000).toISOString().slice(0, 10)}</lastmod>` : "";
    return LANGS.map((l) => `  <url><loc>${SITE}${pagePath(l, p.token)}</loc>${mod}<changefreq>daily</changefreq><priority>${l === "en" ? "0.6" : "0.5"}</priority>${alt}</url>`).join("\n");
  }).join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" } });
}

// ---------------- /round[?w=0x…] — CirclePad share link ----------------
// Open Graph card for the round (or for one contributor's place in it), then
// straight on to /circle, carrying the sharer as the referrer.
async function roundPage(url) {
  const w = String(url.searchParams.get("w") || "").toLowerCase();
  let st = null, mine = 0n;
  try { st = await roundState(); } catch { st = null; }
  if (st && isAddr(w)) { try { mine = await contributionOf(w); } catch { mine = 0n; } }
  const raised = st ? Number(st.totalRaised) / 1e18 : 0;
  const n = (x) => x.toLocaleString("en-US", { maximumFractionDigits: x >= 100 ? 0 : 2 });
  const title = mine > 0n ? `${w.slice(0, 6)}…${w.slice(-4)} is in the CirclePad round with ${n(Number(mine) / 1e18)} USDC`
    : !st || !st.started ? "CirclePad round #1 — opening soon on Arc" : st.isOpen ? `CirclePad round #1 — ${n(raised)} USDC raised, live now` : `CirclePad round #1 closed at ${n(raised)} USDC`;
  const desc = "One project, one 72-hour USDC raise on Circle's Arc. Withdraw your own USDC any time before it closes; everyone who joins votes on what the project becomes.";
  const target = `/circle${isAddr(w) ? `?ref=${w}` : ""}`;
  const image = `${SITE}/api/og?round=1${isAddr(w) ? `&w=${w}` : ""}`;
  return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${SITE}/circle">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${SITE}/round${isAddr(w) ? `?w=${w}` : ""}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#39ff88}</style>
</head><body>
<p>Opening <a href="${esc(target)}">CirclePad</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
}
