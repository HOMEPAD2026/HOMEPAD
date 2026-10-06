// api/c.mjs — public pages for ArcPad coins (rewritten here by vercel.json):
//   /c/<address>        share link: Open Graph card for X / Telegram / Discord,
//                        then straight on to the coin page in the app
//   /coin/<address>     indexable coin page: server-rendered HTML with the
//                        coin's facts, links and structured data, so a search
//                        for "$TICKER arc" can land on it
//   /ko/coin/<address>  the same page in Korean, /zh/coin/<address> in
//                        Simplified Chinese — linked to each other with hreflang
//   /sitemap-coins.xml  every ArcPad coin's /coin/ page, for search engines
//   /s/<address>        Token Scanner share link: the result card for X, then the scanner
//   /drop/<tx>[,<tx>…]  Multisender receipt: the airdrop card for X, then the receipt in the app
//   /snap/<id>          a published / scheduled Holder Snapshot: its card, then the snapshot in the app
//   /bx/<src>/<tx>      Bridge receipt: one CCTP transfer in or out of Arc (Circle's own record), then the Bridge
//   /lock/<id>          Locker certificate: one ArcLock lock's card, then the lock in the app
//   /predict/<round>    ARCIRCLE Predict: one round's result card (?u=0x… for a wallet's bet), then the market in the app
//                       (v3: the sharer's wallet rides along as the invite: #predict?ref=0x…)
//   /predict/me/<0x…>   ARCIRCLE Predict v3: a wallet's stats card (?c=rh), then Predict with that wallet as the invite
//   /orders/fill/<tx>   ARCIRCLE Orders v5: one fill's card (?t=<token>[&c=rh]), then that market in the app
//   /circle/round/1     CirclePad Round #1 report: raise, burn-to-vote, the result — one shareable page
//   /creator/<0x…>      an ArcPad creator's share card, then their profile in the app (api/_aplist.mjs)
//   /embed/coin/<0x…>   an ArcPad coin's live price card for other sites' iframes (?theme=light)
//   /api/c?view=launches every ArcPad launch priced on the server — the browser's first paint and its fallback
import { getCoin, allPools, ethCalls, isAddr, fmtUsd, esc, SITE } from "./_arc.mjs";
import { roundState, contributionOf } from "./_round.mjs";
import { receipt as dropReceipt } from "./_drop.mjs";
import { voteTx, ballotReport, forRound } from "./_burnvote.mjs";
import { omniStatus } from "./_omni.mjs";
import { lockInfo } from "./_locker.mjs";
import { cctp, DOMAIN_NAMES } from "./_cctp.mjs";
import { launchSnapshot, coinEmbed, creatorPage } from "./_aplist.mjs";

export const config = { runtime: "edge" };

const EXPLORER = "https://arc.etherscan.io";
const html = (body, cache = "public, max-age=0, s-maxage=300, stale-while-revalidate=900") =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });

export default async function handler(req) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view");
  if (view === "sitemap") return sitemap();
  if (view === "round") return roundPage(url);
  if (view === "scan") return scanPage(url);
  if (view === "drop") return dropPage(url);
  if (view === "snap") return snapPage(url);
  if (view === "lplock") return lplockPage(url);
  if (view === "lock") return lockPage(url);
  if (view === "predict") return predictPage(url);
  if (view === "predictme") return predictMePage(url);
  if (view === "ordfill") return ordFillPage(url);
  if (view === "stake") return stakePage(url);
  if (view === "vearcia") return veaPage(url);
  if (view === "nft") return nftPage(url);
  if (view === "bridge") return bridgePage(url);
  if (view === "vote") return votePage(url);
  if (view === "report") return reportPage(url);
  if (view === "latest") return latestCoins(url);
  if (view === "coins") return allCoins();
  // ArcPad v7 (api/_aplist.mjs): the launch list from the server, the embeddable price card, a creator's share card
  if (view === "launches") {
    try { return new Response(JSON.stringify(await launchSnapshot()), { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600", "access-control-allow-origin": "*" } }); }
    catch (err) { return new Response(JSON.stringify({ error: String((err && err.message) || err).slice(0, 160) }), { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
  }
  if (view === "embed") return coinEmbed(url);
  if (view === "creator") return creatorPage(url);
  // ARCIRCLE OMNI: supply per chain, the locked == remote check, prices and spread (arc-omni.js)
  if (view === "omni") {
    try { return new Response(JSON.stringify(await omniStatus(url.origin)), { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=10, s-maxage=20, stale-while-revalidate=60" } }); }
    catch (e) { return new Response(JSON.stringify({ error: "couldn't read OMNI right now" }), { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
  }
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

// /s/<address> — a Token Scanner result to share. The card image runs the scan
// itself (/api/og?scan=), so nobody can post a score the chain didn't give.
async function scanPage(url) {
  const raw = String(url.searchParams.get("addr") || "");
  // v4: a Solana mint (base58) gets its own card; ?c=rh is a Robinhood Chain token
  const sol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) && !/^0x/i.test(raw);
  const rh = url.searchParams.get("c") === "rh";
  const addr = sol ? raw : raw.toLowerCase();
  if (!sol && !isAddr(addr)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#scanner">`, "public, max-age=300");
  let sym = "";
  if (sol) {
    // edge runtime: no Solana kit here (api/_scan-sol.mjs needs Node), so the ticker comes from Dexscreener
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${addr}`, { signal: AbortSignal.timeout(2500) });
      const list = r.ok ? await r.json() : [];
      const pair = (Array.isArray(list) ? list : []).find((x) => x && x.baseToken && x.baseToken.address === addr);
      sym = (pair && pair.baseToken.symbol) || "";
    } catch { sym = ""; }
  } else try {
    const [h] = rh ? [null] : await ethCalls([{ to: addr, data: "0x95d89b41" }]);
    const x = String(h || "").replace(/^0x/, "");
    if (x.length >= 192) { const len = parseInt(x.slice(64, 128), 16); sym = decodeURIComponent(x.slice(128, 128 + len * 2).replace(/(..)/g, "%$1")); }
  } catch { sym = ""; }
  sym = sym.replace(/[^\w$.-]/g, "").slice(0, 16);
  const title = `${sym ? "$" + sym : "Token"} — Token Scanner result on ARCIRCLE PAD`;
  const desc = sol ? "Token Scanner v4 on Solana: mint and freeze authority, Token-2022 extensions, pump.fun's curve, sell routes and holders — one score, critical flags apart. An automated check, not advice."
    : `Token Scanner v4: who really controls it, dry-run trades at three sizes, liquidity and holders, read from ${rh ? "Robinhood Chain" : "Circle's Arc"} — one score, critical flags apart, and how sure it is. An automated check, not advice.`;
  const target = `/arc#scanner?${sol ? "c=sol&" : rh ? "c=rh&" : ""}t=${addr}`;
  const image = sol ? `${SITE}/api/og?solscan=${addr}` : `${SITE}/api/og?scan=${addr}${rh ? "&chain=rh" : ""}`;
  return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${SITE}/arc#scanner">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${SITE}/s/${addr}${rh ? "?c=rh" : ""}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#4d9fff}</style>
</head><body>
<p>Opening the <a href="${esc(target)}">Token Scanner</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=300, stale-while-revalidate=900");
}

// /drop/<tx>[,<tx>…] — a Multisender send to share. Everything comes from the
// transactions' receipts (api/_drop.mjs), so nobody can claim an airdrop that didn't happen.
async function dropPage(url) {
  const txs = String(url.searchParams.get("tx") || "").split(",").filter((t) => /^0x[0-9a-fA-F]{64}$/.test(t)).slice(0, 25).map((t) => t.toLowerCase());
  if (!txs.length) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#multisend">`, "public, max-age=300");
  let r = null;
  try { r = await dropReceipt(txs.join(",")); } catch { r = null; }
  const amt = r && r.kind === "token" ? (Number(BigInt(r.total)) / 10 ** r.decimals).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " $" + r.symbol : r && r.kind === "nft" ? `${r.total} NFTs` : "Tokens";
  const title = r ? `Airdrop: ${amt} to ${r.wallets.toLocaleString("en-US")} wallets on Arc` : "Multisender — ARCIRCLE PAD";
  const desc = r ? `Sent with the ARCIRCLE PAD Multisender in ${r.txs.length} transaction${r.txs.length === 1 ? "" : "s"}, straight from ${r.sender.slice(0, 6)}…${r.sender.slice(-4)}. Every recipient and amount is on-chain.` : "Send one Arc token to many wallets at once. No fee.";
  const target = `/arc#multisend?receipt=${txs.join(",")}`;
  const image = `${SITE}/api/og?drop=${txs.join(",")}`;
  return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${SITE}/arc#multisend">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${SITE}/drop/${txs.join(",")}`)}">
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
<p>Opening the <a href="${esc(target)}">airdrop receipt</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, r ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" : "public, max-age=0, s-maxage=60");
}

// /snap/<id> — a published or scheduled Holder Snapshot (api/_snapshot.mjs).
async function snapPage(url) {
  const id = String(url.searchParams.get("id") || "").toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(id)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#snapshot">`, "public, max-age=300");
  let d = null;
  try { const r = await fetch(`${SITE}/api/social?snapview=${id}`); d = r.ok ? await r.json() : null; } catch { d = null; }
  const sym = d && d.symbol ? "$" + d.symbol : "a token";
  const title = !d ? "Holder Snapshot — ARCIRCLE PAD" : d.status === "done"
    ? `${d.title ? d.title + " — " : ""}${Number(d.count).toLocaleString("en-US")} holders of ${sym} at block #${d.block}${d.chain === "rh" ? " on Robinhood Chain" : ""}`
    : `${d.title ? d.title + " — " : ""}${sym} snapshot scheduled for ${new Date(d.at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const desc = !d ? "Every holder of an Arc or Robinhood Chain token at one block." : d.status === "done"
    ? `Fingerprint ${d.fp.slice(0, 18)}… — check whether your wallet is on the list.` : "The list is built from the chain at that moment. Check back to see whether your wallet made it.";
  const target = `/arc#snapshot?id=${id}`;
  const image = `${SITE}/api/og?snap=${id}`;
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
<meta property="og:url" content="${esc(`${SITE}/snap/${id}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#b58bff}</style>
</head><body>
<p>Opening the <a href="${esc(target)}">snapshot</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, d && d.status === "done" ? "public, max-age=0, s-maxage=600, stale-while-revalidate=86400" : "public, max-age=0, s-maxage=60");
}

// ---- ArcLPLock certificate (/lplock/<id>) ----
const fmtAmt = (raw, dec) => { const n = Number(BigInt(raw || 0)) / 10 ** Number(dec || 18); return !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
async function lplockPage(url) {
  const id = String(url.searchParams.get("id") || "");
  if (!/^\d{1,9}$/.test(id)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#liquidity">`, "public, max-age=300");
  let d = null;
  try { const r = await fetch(`${SITE}/api/social?lplock=${id}`); d = r.ok ? await r.json() : null; } catch { d = null; }
  const sym = d && d.token ? "$" + d.token.symbol : "a token";
  const until = d ? new Date(d.unlockAt * 1000).toISOString().slice(0, 10) : "";
  const title = !d ? "LP lock — ARCIRCLE PAD" : d.active ? `${sym} liquidity locked until ${until}` : d.withdrawn ? `${sym} LP lock #${id} — withdrawn` : `${sym} LP lock #${id} — ended ${until}`;
  const desc = !d ? "Uniswap v4 liquidity locked on Arc with ArcLPLock." : `${fmtAmt(d.amounts.token, d.token.decimals)} ${d.token.symbol} + ${fmtAmt(d.amounts.quote, d.quote.decimals)} ${d.quote.symbol} in a Uniswap v4 position, locked in ArcLPLock${d.poolShare ? ` — ${d.poolShare}% of the liquidity at the current price` : ""}. Nobody can move it before the date.`;
  const target = d && d.token ? `/arc#liquidity?token=${d.token.address}&lock=${id}` : "/arc#liquidity";
  const image = `${SITE}/api/og?lplock=${id}`;
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
<meta property="og:url" content="${esc(`${SITE}/lplock/${id}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#39d0ff}</style>
</head><body>
<p>Opening the <a href="${esc(target)}">liquidity lock</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, d && d.active ? "public, max-age=0, s-maxage=120" : "public, max-age=0, s-maxage=600");
}

// ---- Bridge receipt (/bx/<src>/<tx>) — read from Circle's attestation service ----
async function bridgePage(url) {
  const src = String(url.searchParams.get("src") || ""), tx = String(url.searchParams.get("tx") || "");
  if (!/^\d{1,3}$/.test(src) || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#bridge">`, "public, max-age=300");
  let m = null;
  try { const [st, body] = await cctp(new URLSearchParams({ cctp: "msg", src, tx })); m = st === 200 && body.messages && body.messages[0] ? body.messages[0] : null; } catch { m = null; }
  const from = DOMAIN_NAMES[Number(src)] || "another chain", to = m && m.dstDomain != null ? DOMAIN_NAMES[m.dstDomain] || "another chain" : "Arc";
  const amt = m && m.amount ? (Number(BigInt(m.amount)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC" : "USDC";
  const title = m ? `Bridged ${amt} from ${from} to ${to}` : "Bridge — ARCIRCLE PAD";
  const desc = m ? `Native USDC, burned on ${from} and minted on ${to} by Circle's CCTP${m.status === "complete" ? " — signed by Circle" : ""}. Bridged with ARCIRCLE PAD, no extra fee.` : "Move USDC between Arc and 14 chains with Circle's CCTP.";
  const target = "/arc#bridge";
  const image = `${SITE}/api/og?bridge=${src}:${tx.toLowerCase()}`;
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
<meta property="og:url" content="${esc(`${SITE}/bx/${src}/${tx}`)}">
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
<p>Opening the <a href="${esc(target)}">Bridge</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, m && m.status === "complete" ? "public, max-age=0, s-maxage=86400" : "public, max-age=0, s-maxage=60");
}

// ---- Locker certificate (/lock/<id>; Robinhood Chain: /lock/<id>?c=rh) ----
async function lockPage(url) {
  const id = String(url.searchParams.get("id") || "");
  const rh = url.searchParams.get("c") === "rh", cq = rh ? "?c=rh" : "", CN = rh ? "Robinhood Chain" : "Arc";
  if (!/^\d{1,9}$/.test(id)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#locker${rh ? "?c=rh" : ""}">`, "public, max-age=300");
  let d = null;
  try { d = await lockInfo(id, rh ? "rh" : "arc"); } catch { d = null; }
  const sym = d ? "$" + d.token.symbol : "a token";
  const until = d ? new Date(d.unlockAt * 1000).toISOString().slice(0, 10) : "";
  const share = d && d.pctOfSupply != null ? ` — ${d.pctOfSupply >= 1 ? d.pctOfSupply.toFixed(2) : d.pctOfSupply.toFixed(3)}% of supply` : "";
  const title = !d ? "Locker — ARCIRCLE PAD" : d.active ? `${fmtAmt(d.amount, d.token.decimals)} ${sym} locked until ${until}` : d.withdrawn ? `${sym} lock #${id} — withdrawn` : `${sym} lock #${id} — unlocked ${until}`;
  const desc = !d ? `Lock any ${CN} token until a date you pick. No owner, no admin, no fee.` : `${fmtAmt(d.amount, d.token.decimals)} ${sym}${share}, locked in ArcLock on ${CN}. Nobody — not even the locker — can move it before ${until}.`;
  const target = d ? `/arc#locker?${rh ? "c=rh&" : ""}token=${d.token.address}&lock=${id}` : `/arc#locker${rh ? "?c=rh" : ""}`;
  const image = `${SITE}/api/og?lock=${id}${rh ? "&c=rh" : ""}`;
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
<meta property="og:url" content="${esc(`${SITE}/lock/${id}${cq}`)}">
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
<p>Opening the <a href="${esc(target)}">lock</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, d && d.active ? "public, max-age=0, s-maxage=120" : "public, max-age=0, s-maxage=600");
}

// ---- veARCIA share page (/vearcia/<wallet>) ----
async function veaPage(url) {
  const u = String(url.searchParams.get("id") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(u)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#vearcia">`, "public, max-age=300");
  let d = null;
  try { const r = await fetch(`${SITE}/api/desk?vearcia=card&u=${u}`, { signal: AbortSignal.timeout(6000) }); d = r.ok ? await r.json() : null; } catch { d = null; }
  const p = d && d.position;
  const title = p ? `${Math.round(p.amount).toLocaleString("en-US")} $ARCIA staked — ${Math.round(p.ve).toLocaleString("en-US")} veARCIA` : "veARCIA — stake $ARCIA";
  const desc = "Stake $ARCIA on Robinhood Chain for 1 to 20 days: $ARCIA rewards every second, up to 2x for longer locks and up to 2x more for $ARCIRCLE holders.";
  const target = "/arc#vearcia";
  const image = `${SITE}/api/og?vearcia=${u}`;
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
<meta property="og:url" content="${esc(`${SITE}/vearcia/${u}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07060a;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#ff8bd8}</style>
</head><body>
<p><a href="${esc(target)}">${esc(title)}</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=300, stale-while-revalidate=1800");
}

// ---- ARCIRCLE Staking share page (/stake/<wallet>) ----
// /nft/<n> — an ARCIRCLE NFT Vault raffle (or /nft/vault): the card image reads the vault itself (/api/og?nft=)
async function nftPage(url) {
  const id = String(url.searchParams.get("id") || "vault");
  const n = /^\d{1,6}$/.test(id) ? Number(id) : null;
  let s = null;
  try { const r = await fetch(`${SITE}/api/desk?nft=state`, { signal: AbortSignal.timeout(6000) }); s = r.ok ? await r.json() : null; } catch { s = null; }
  const p = s && n != null && Array.isArray(s.prizes) ? s.prizes.find((x) => x.i === n) : null;
  const name = p ? String(p.title || `${p.name || "NFT"} #${p.tokenId}`).slice(0, 60) : "";
  const title = p ? (p.status === "won" ? `${name} — won in the ARCIRCLE NFT Vault raffle #${n}` : `${name} — ARCIRCLE NFT Vault raffle #${n}`) : "ARCIRCLE NFT Vault";
  const desc = "Trading fees fill a vault that can only buy NFTs. Every NFT is raffled to $ARCIRCLE holders — the more you hold and lock, the better your odds — drawn on-chain on Robinhood Chain.";
  const target = `/arc#nft${n != null ? `?prize=${n}` : ""}`;
  const image = `${SITE}/api/og?nft=${n != null ? n : "vault"}`;
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
<meta property="og:url" content="${esc(`${SITE}/nft/${n != null ? n : "vault"}`)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@ARCIRCLEonArc">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(SITE + target)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body>
<p><a href="${esc(target)}">${esc(title)}</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=120, stale-while-revalidate=600");
}

async function stakePage(url) {
  const u = String(url.searchParams.get("id") || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(u)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#staking">`, "public, max-age=300");
  let d = null;
  // read through the Node function: api/_stake.mjs pulls in modules an Edge function can't bundle
  try { const r = await fetch(`${SITE}/api/desk?stake=card&u=${u}`, { signal: AbortSignal.timeout(6000) }); d = r.ok ? await r.json() : null; if (d && d.error) d = null; } catch { d = null; }
  const amt = d && d.lock ? Math.round(d.lock.amount).toLocaleString("en-US") : "";
  const title = d && d.lock && d.lock.amount > 0 ? `${amt} $ARCIRCLE locked${d.lock.max ? " for good" : ""} — ARCIRCLE Staking` : "ARCIRCLE Staking";
  const desc = "Lock $ARCIRCLE for up to a year: USDC every week from ARCIRCLE Orders and Predict fees, and a vote on which pools ARCIRCLE PAD backs.";
  const target = "/arc#staking";
  const image = `${SITE}/api/og?stake=${u}`;
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
<meta property="og:url" content="${esc(`${SITE}/stake/${u}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#b58bff}</style>
</head><body>
<p>Opening <a href="${esc(target)}">ARCIRCLE Staking</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=600");
}

// ---- ARCIRCLE Orders v5: one fill's card (/orders/fill/<tx>?t=<token>[&c=rh]) ----
function ordFillPage(url) {
  const tx = String(url.searchParams.get("tx") || "").toLowerCase(), t = String(url.searchParams.get("t") || "").toLowerCase(), rh = url.searchParams.get("c") === "rh";
  const target = `/arc#orders${isAddr(t) ? `?t=${t}${rh ? "&c=rh" : ""}` : rh ? "?c=rh" : ""}`;
  if (!/^0x[0-9a-f]{64}$/.test(tx) || !isAddr(t)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=${esc(target)}">`, "public, max-age=300");
  const image = `${SITE}/api/og?ordfill=${tx}&t=${t}${rh ? "&c=rh" : ""}`;
  const title = `A fill on ARCIRCLE Orders${rh ? " · Robinhood Chain" : " · Arc"}`;
  const desc = "Limit, stop, take-profit and DCA orders signed in the wallet — no custody, no gas to place. 0.1% fee, half buys and burns $ARCIRCLE.";
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
<meta property="og:url" content="${esc(`${SITE}/orders/fill/${tx}?t=${t}${rh ? "&c=rh" : ""}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#4dd4ff}</style>
</head><body>
<p>Opening <a href="${esc(target)}">ARCIRCLE Orders</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=600");
}

// ---- ARCIRCLE Predict v3: a wallet's stats card (/predict/me/<0x…>[?c=rh]) ----
function predictMePage(url) {
  const u = String(url.searchParams.get("u") || "").toLowerCase(), rh = url.searchParams.get("c") === "rh";
  if (!/^0x[0-9a-f]{40}$/.test(u)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#predict">`, "public, max-age=300");
  const target = `/arc#predict?${rh ? "c=rh&" : ""}ref=${u}`;
  const image = `${SITE}/api/og?predictme=${u}${rh ? "&c=rh" : ""}`;
  const title = `${u.slice(0, 6)}…${u.slice(-4)} on ARCIRCLE Predict`;
  const desc = rh ? "Win rate, PnL and streaks calling UP or DOWN on Pons coins on Robinhood Chain — paid in ETH." : "Win rate, PnL and streaks calling UP or DOWN on Arc tokens — paid in USDC.";
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
<meta property="og:url" content="${esc(`${SITE}/predict/me/${u}${rh ? "?c=rh" : ""}`)}">
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
<p>Opening <a href="${esc(target)}">ARCIRCLE Predict</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, "public, max-age=0, s-maxage=600");
}

// ---- ARCIRCLE Predict round card (/predict/<round>[?u=0x…]) ----
async function predictPage(url) {
  const id = String(url.searchParams.get("id") || ""), u = String(url.searchParams.get("u") || ""), rh = url.searchParams.get("c") === "rh";
  if (!/^\d{1,9}$/.test(id)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/arc#predict">`, "public, max-age=300");
  let d = null;
  // read through the Node function: api/_predict.mjs pulls in modules an Edge function can't bundle
  try { const r = await fetch(`${SITE}/api/desk?predict=card${rh ? "&chain=rh" : ""}&id=${id}${/^0x[0-9a-fA-F]{40}$/.test(u) ? "&u=" + u : ""}`, { signal: AbortSignal.timeout(6000) }); d = r.ok ? await r.json() : null; if (d && (d.error || !d.id)) d = null; } catch { d = null; }
  const dur = d ? (d.duration % 3600 === 0 ? `${d.duration / 3600}h` : `${d.duration / 60}m`) : "";
  const res = d && d.result !== "open" ? (d.result === "refund" ? "refunded" : `${d.result.toUpperCase()} won`) : "live";
  const title = d ? `$${d.sym} ${dur} round #${d.id} — ${res}` : "ARCIRCLE Predict";
  const money = (x) => (rh ? `${Number(x || 0).toLocaleString("en-US", { maximumFractionDigits: x >= 1 ? 3 : 5 })} ETH` : `$${Number(x || 0).toFixed(2)}`);
  const pitch = rh ? "Call UP or DOWN on graduated Pons coins on Robinhood Chain — paid in ETH." : "Call UP or DOWN on Arc tokens — paid in USDC.";
  const desc = d && d.bet ? `${d.bet.side.toUpperCase()} with ${money(d.bet.stake)}${d.bet.won ? ` → ${money(d.bet.payout)}` : ""}. ${pitch}` : rh ? "Call UP or DOWN on a Pons coin's next minutes. The pool decides; winners split the pot, in ETH." : "Call UP or DOWN on an Arc token's next minutes. The pool decides; winners split the pot, in USDC.";
  const ref = /^0x[0-9a-fA-F]{40}$/.test(u) ? `&ref=${u.toLowerCase()}` : "";
  const target = d ? `/arc#predict?${rh ? "c=rh&" : ""}m=${d.market}${ref}` : rh ? `/arc#predict?c=rh${ref}` : `/arc#predict${ref ? "?" + ref.slice(1) : ""}`;
  const qs = (/^0x[0-9a-fA-F]{40}$/.test(u) ? `&u=${u.toLowerCase()}` : "") + (rh ? "&c=rh" : "");
  const image = `${SITE}/api/og?predict=${id}${qs}`;
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
<meta property="og:url" content="${esc(`${SITE}/predict/${id}${qs ? "?" + qs.slice(1) : ""}`)}">
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
<p>Opening <a href="${esc(target)}">ARCIRCLE Predict</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, d && d.result !== "open" ? "public, max-age=0, s-maxage=86400" : "public, max-age=0, s-maxage=60");
}

// ---- CirclePad burn-to-vote share page (/vote/<tx>) ----
function voteLabel(it) {
  if (!it) return "";
  if (it.cat === 1) return "$" + String(it.text || "").replace(/^\$/, "");
  if (it.cat === 2) return "a logo";
  if (it.cat === 3) return "a roadmap";
  if (it.cat === 4) { const d = new Date(it.text); return isNaN(d) ? it.text : d.toISOString().slice(0, 10); }
  return String(it.text || "");
}
async function votePage(url) {
  const tx = String(url.searchParams.get("tx") || "").toLowerCase();
  const target = "/circle#governance";
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return html(`<!doctype html><meta http-equiv="refresh" content="0;url=${target}">`, "public, max-age=300");
  let v = null;
  try { v = await voteTx(tx); } catch { v = null; }
  const n = v ? v.votes : 0, burned = (n * 1000).toLocaleString("en-US");
  const main = v && v.items[0];
  const title = !v ? "CirclePad vote — ARCIRCLE PAD" : `Burned ${burned} $ARCIRCLE to vote for ${voteLabel(main)}${v.items.length > 1 ? ` (+${v.items.length - 1} more)` : ""}`;
  const desc = !v ? "CirclePad Round #1: every vote burns 1,000 $ARCIRCLE." : `${n} ${n === 1 ? "vote" : "votes"} in CirclePad Round #1 (${v.items.map((i) => i.category).join(", ")}). Every vote sends 1,000 $ARCIRCLE to the dead address, gone for good.`;
  const image = `${SITE}/api/og?vote=${tx}`;
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
<meta property="og:url" content="${esc(`${SITE}/vote/${tx}`)}">
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
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#eaf2e6;font:16px system-ui,sans-serif}a{color:#39d0ff}</style>
</head><body>
<p>Opening <a href="${esc(target)}">CirclePad governance</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`, v ? "public, max-age=0, s-maxage=86400" : "public, max-age=0, s-maxage=60");
}

// ---- CirclePad round report (/circle/round/1) ----
async function reportPage(url) {
  const n = String(url.searchParams.get("n") || "1");
  if (n !== "1") return html(`<!doctype html><meta http-equiv="refresh" content="0;url=/circle">`, "public, max-age=300");
  let st = null, b = null;
  const [rs, rb] = await Promise.allSettled([roundState(), ballotReport(forRound(1))]);
  if (rs.status === "fulfilled") st = rs.value;
  if (rb.status === "fulfilled") b = rb.value;
  const now = Math.floor(Date.now() / 1000);
  const ends = b && b.votingEnds ? b.votingEnds : st ? st.deadline : 0;
  const final = !!(st && st.started && !st.isOpen && ends && now >= ends);
  const live = !!(st && st.started && !final);
  const raised = st ? Number(st.totalRaised) / 1e18 : 0;
  const burned = b ? Number(BigInt(b.burned) / 10n ** 18n) : 0;
  const num = (x, d = 0) => Number(x || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const usd = (x) => num(x, x >= 100 ? 0 : 2);
  const utc = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");
  const kst = (ts) => (ts ? new Date(ts * 1000 + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " KST" : "");
  const lead = (c) => { let best = null; c.options.forEach((o, i) => { if (o.votes > 0 && (!best || o.votes > best.votes)) best = { ...o, i }; }); return best; };
  const cats = b ? b.categories : [];
  const W = cats.map(lead);
  const logoUrl = (t) => { const x = String(t || ""); return /^https:\/\/(www\.)?arcircle\.app\/logo\/[0-9a-f]{64}\.(webp|png|jpg)$/.test(x) ? x : /^\/logo\/[0-9a-f]{64}\.(webp|png|jpg)$/.test(x) ? SITE + x : ""; };
  const dateTxt = (t) => { const d = new Date(t); return isNaN(d) ? String(t) : `${utc(d.getTime() / 1000)} · ${kst(d.getTime() / 1000)}`; };
  const face = (c, t) => c === 1 ? "$" + String(t).replace(/^\$/, "") : c === 4 ? (isNaN(new Date(t)) ? String(t) : kst(new Date(t).getTime() / 1000)) : c === 3 ? String(t).split("\n")[0] : String(t);
  const name = W[0] ? W[0].text : "", ticker = W[1] ? String(W[1].text).replace(/^\$/, "") : "", logo = W[2] ? logoUrl(W[2].text) : "";
  const title = final ? `CirclePad Round #1 — ${name || "result"}${ticker ? ` ($${ticker})` : ""}, decided by ${num(b ? b.votes : 0)} votes` : `CirclePad Round #1 — live: ${usd(raised)} USDC raised, ${num(burned)} $ARCIRCLE burned`;
  const desc = `${usd(raised)} USDC raised in one 72-hour round on Circle's Arc. ${num(b ? b.votes : 0)} votes from ${num(b ? b.voters : 0)} wallets burned ${num(burned)} $ARCIRCLE to pick the coin's name, ticker, logo, roadmap and launch date.`;
  const image = `${SITE}/api/og?round=1`;
  const pageUrl = `${SITE}/circle/round/1`;
  const shareText = final ? `CirclePad Round #1 is decided: ${name}${ticker ? ` ($${ticker})` : ""}. ${usd(raised)} USDC raised, ${num(burned)} $ARCIRCLE burned by ${num(b ? b.votes : 0)} votes.` : `CirclePad Round #1 is live: ${usd(raised)} USDC raised, ${num(burned)} $ARCIRCLE burned so far. Every vote burns 1,000 $ARCIRCLE.`;
  const catHtml = cats.map((c, ci) => {
    const sum = c.options.reduce((a, o) => a + o.votes, 0);
    const order = c.options.map((o, i) => ({ ...o, i })).sort((x, y) => y.votes - x.votes || x.i - y.i);
    return `<section class="cat"><h3>${esc(c.label)}<span>${num(sum)} ${sum === 1 ? "vote" : "votes"}</span></h3>${c.options.length ? `<ol>${order.map((o, k) => {
      const pct = sum ? (o.votes / sum) * 100 : 0, lg = ci === 2 ? logoUrl(o.text) : "";
      return `<li class="${k === 0 && o.votes > 0 ? "top" : ""}"><div class="o">${lg ? `<img src="${esc(lg)}" alt="" loading="lazy">` : ""}<b>${esc(ci === 2 ? (lg ? "" : o.text) : face(ci, o.text))}</b></div><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div><span class="v">${pct.toFixed(pct >= 10 || !pct ? 0 : 1)}% · ${num(o.votes)}</span></li>`;
    }).join("")}</ol>` : `<p class="muted">Candidates not published.</p>`}</section>`;
  }).join("");
  const split = [["Recipient wallet", 80, "The project's funds"], ["Treasury wallet", 15, "Paid to the top contributor over 3 days"], ["Platform wallet", 5, "$ARCIRCLE buybacks and promotion"]];
  // after the close the recipient sends the split out of the escrow in one transaction
  const sent = !!(st && st.distributed === true);
  const splitNote = !final ? "" : sent ? `<p class="sst ok"><i></i>Split sent — the escrow paid out 80 / 15 / 5 in one transaction.</p>`
    : `<p class="sst wait"><i></i>Settling — the raise is closed; the round's recipient sends the 80 / 15 / 5 split from the escrow in one transaction. This page updates when it lands.</p>`;
  const opened = st && st.deadline ? st.deadline - 72 * 3600 : 0;
  return html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ARCIRCLE PAD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@ARCIRCLEonArc">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="/images/favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#040605;--panel:#0c110e;--line:rgba(255,255,255,.1);--ink:#fff;--dim:#8b958e;--g:#39ff88;--o:#ff8a4c;--y:#ffd166}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(60% 40% at 15% -5%,rgba(57,255,136,.12),transparent 70%),radial-gradient(50% 40% at 100% 0%,rgba(255,138,76,.09),transparent 70%),var(--bg);color:var(--ink);font:15px/1.6 Inter,system-ui,sans-serif;min-height:100vh}
a{color:inherit}
.wrap{max-width:980px;margin:0 auto;padding:28px 18px 60px}
.hd{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:26px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:700 .95rem Sora,sans-serif}
.brand span{color:var(--dim);font-weight:600}
.badge{padding:5px 12px;border-radius:99px;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid}
.badge.live{color:#ffb38a;border-color:rgba(255,138,76,.5)}.badge.final{color:var(--y);border-color:rgba(255,209,102,.5)}
h1{font:800 clamp(1.7rem,4.6vw,2.6rem)/1.15 Sora,sans-serif;margin:0 0 8px;letter-spacing:-.01em}
.lede{color:var(--dim);margin:0 0 24px;max-width:640px}
.coin{display:flex;gap:18px;align-items:center;padding:22px;border-radius:20px;border:1px solid rgba(255,209,102,.35);background:linear-gradient(135deg,rgba(255,209,102,.08),rgba(255,255,255,.02));margin-bottom:18px}
.coin .lg{width:84px;height:84px;border-radius:20px;flex:none;display:grid;place-items:center;background:rgba(255,255,255,.06);overflow:hidden;font:800 2rem Sora,sans-serif;color:var(--y)}
.coin .lg img{width:100%;height:100%;object-fit:cover}
.coin small{display:block;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.coin b{display:block;font:800 1.9rem/1.1 Sora,sans-serif;margin:2px 0}
.coin .tk{font:700 1rem Sora,sans-serif;color:var(--y)}
.coin dl{display:flex;flex-wrap:wrap;gap:6px 22px;margin:10px 0 0;font-size:.82rem}.coin dt{color:var(--dim);font-size:.66rem;letter-spacing:.1em;text-transform:uppercase}.coin dd{margin:0}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:26px}
.stat{padding:16px;border-radius:16px;border:1px solid var(--line);background:var(--panel);min-width:0}
.stat small{display:block;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.stat b{display:block;font:800 1.55rem/1.2 Sora,sans-serif;margin:4px 0 2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.stat span{font-size:.76rem;color:var(--dim)}
.stat.burn{border-color:rgba(255,138,76,.4);background:rgba(255,120,60,.06)}.stat.burn b{color:#ffd0b0}
h2{font:700 1.1rem Sora,sans-serif;margin:30px 0 12px}
.cats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.cat{padding:16px;border-radius:16px;border:1px solid var(--line);background:var(--panel);min-width:0}
.cat h3{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 12px;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cat h3 span{letter-spacing:0;text-transform:none;font-size:.76rem}
.cat ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.cat li{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(50px,1fr) auto;gap:10px;align-items:center;font-size:.86rem;color:#c9d4de}
.cat li .o{display:flex;align-items:center;gap:8px;min-width:0}.cat li .o b{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cat li .o img{width:34px;height:34px;border-radius:8px;object-fit:cover;flex:none}
.cat li.top{color:#fff}.cat li.top .o b{font-weight:700}
.bar{height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--o),var(--y))}
.v{font-size:.76rem;font-variant-numeric:tabular-nums;color:var(--dim);white-space:nowrap}.cat li.top .v{color:var(--y)}
.split{display:flex;flex-direction:column;gap:10px}
.split div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:14px 16px;border-radius:14px;border:1px solid var(--line);background:var(--panel)}
.split b{font-weight:600}.split em{font-style:normal;font-weight:700;font-variant-numeric:tabular-nums}.split small{grid-column:1/-1;color:var(--dim);font-size:.78rem}
.tl{list-style:none;margin:0;padding:0;border-left:2px solid var(--line);margin-left:6px}
.tl li{position:relative;padding:0 0 16px 18px}.tl li::before{content:"";position:absolute;left:-7px;top:6px;width:12px;height:12px;border-radius:50%;background:var(--bg);border:2px solid var(--g)}
.tl b{display:block}.tl span{color:var(--dim);font-size:.82rem}
.acts{display:flex;flex-wrap:wrap;gap:10px;margin:28px 0 0}
.btn{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 20px;border-radius:12px;font:600 .9rem Inter,sans-serif;text-decoration:none;cursor:pointer;border:1px solid var(--line);background:rgba(255,255,255,.04);color:#fff}
.btn.p{background:#fff;color:#050505;border-color:#fff}
.muted{color:var(--dim)}
.sst{display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:12px 14px;border-radius:14px;font-size:.86rem;border:1px solid}
.sst i{flex:none;width:9px;height:9px;border-radius:50%}
.sst.ok{color:#b6ffd5;border-color:rgba(57,255,136,.4);background:rgba(57,255,136,.06)}.sst.ok i{background:var(--g);box-shadow:0 0 8px var(--g)}
.sst.wait{color:#ffe2a8;border-color:rgba(255,209,102,.4);background:rgba(255,209,102,.06)}.sst.wait i{background:var(--y);animation:pl 1.4s ease-in-out infinite}
@keyframes pl{50%{opacity:.3}}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);font-size:.78rem;color:var(--dim)}
@media (max-width:700px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cats{grid-template-columns:1fr}.coin{flex-direction:column;align-items:flex-start}.acts .btn{flex:1 1 auto}}
</style>
</head><body>
<div class="wrap">
  <div class="hd"><a class="brand" href="/circle"><svg width="26" height="26" viewBox="0 0 200 200" fill="none" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4d9fff"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs><circle cx="100" cy="100" r="70" stroke="url(#g)" stroke-width="16"/><circle cx="100" cy="100" r="28" fill="url(#g)" opacity=".85"/></svg>CirclePad <span>Round #1 report</span></a>
  <span class="badge ${final ? "final" : "live"}">${final ? "Final" : live ? "Live" : "Not started"}</span></div>
  <h1>${final ? "The circle chose its coin." : "Round #1, as it happens."}</h1>
  <p class="lede">One 72-hour USDC raise on Circle's Arc. $ARCIRCLE holders burned 1,000 $ARCIRCLE per vote to pick the coin's name, ticker, logo, roadmap and launch date. ${final ? "Final numbers, read from the chain." : "Numbers update as the chain moves — reload for the latest."}</p>
  <div class="coin"><div class="lg">${logo ? `<img src="${esc(logo)}" alt="">` : esc((name || "?").slice(0, 1).toUpperCase())}</div>
    <div><small>${final ? "The result" : "Leading now"}</small><b>${esc(name || "—")}</b><span class="tk">${ticker ? "$" + esc(ticker) : "—"}</span>
    <dl><div><dt>Launch date</dt><dd>${W[4] ? esc(dateTxt(W[4].text)) : "—"}</dd></div><div><dt>Roadmap</dt><dd>${W[3] ? esc(String(W[3].text).split("\n")[0]) : "—"}</dd></div></dl></div></div>
  <div class="stats">
    <div class="stat"><small>Raised</small><b>${usd(raised)}</b><span>USDC</span></div>
    <div class="stat"><small>Contributors</small><b id="r-n">—</b><span id="r-top">&nbsp;</span></div>
    <div class="stat burn"><small>Burned by votes</small><b>${num(burned)}</b><span>$ARCIRCLE, gone for good</span></div>
    <div class="stat"><small>Votes</small><b>${num(b ? b.votes : 0)}</b><span>1 vote = 1,000 $ARCIRCLE</span></div>
    <div class="stat"><small>Voters</small><b>${num(b ? b.voters : 0)}</b><span>wallets</span></div>
    <div class="stat"><small>${final ? "Closed" : "Closes"}</small><b style="font-size:1.05rem">${esc(utc(ends))}</b><span>${esc(kst(ends))}</span></div>
  </div>
  <h2>Every category</h2>
  <div class="cats">${catHtml || `<p class="muted">The ballot couldn't be read right now — reload in a moment.</p>`}</div>
  <h2>The split${final ? "" : " (at today's total)"}</h2>
  ${splitNote}
  <div class="split">${split.map(([k, p, note]) => `<div><b>${k}</b><em>${p}% · ≈ ${usd((raised * p) / 100)} USDC</em><small>${note}</small></div>`).join("")}</div>
  <h2>Timeline</h2>
  <ol class="tl">
    <li><b>Raise opened</b><span>${opened ? `${esc(utc(opened))} · ${esc(kst(opened))}` : "—"}</span></li>
    <li><b>Burn-to-vote opened</b><span>${esc(utc(b && b.opensAt))} · ${esc(kst(b && b.opensAt))}</span></li>
    <li><b>Raise and voting ${final ? "closed" : "close"}</b><span>${esc(utc(ends))} · ${esc(kst(ends))}</span></li>
    <li><b>Launch</b><span>${W[4] ? esc(dateTxt(W[4].text)) : "The date the vote picks"}</span></li>
  </ol>
  <div class="acts"><a class="btn p" href="/circle">Open CirclePad</a><a class="btn" href="https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}&via=ARCIRCLEonArc" target="_blank" rel="noopener">Share on X</a><button class="btn" type="button" id="r-copy">Copy link</button></div>
  <footer>Read from Circle's Arc: the round escrow, the ballot and the burn-to-vote contract. Nothing here is financial advice.</footer>
</div>
<script>
(function () {
  var c = document.getElementById("r-copy");
  c.addEventListener("click", function () { try { navigator.clipboard.writeText(${JSON.stringify(pageUrl)}); c.textContent = "Copied"; setTimeout(function () { c.textContent = "Copy link"; }, 1600); } catch (e) {} });
  fetch("/api/social?circle=lb", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
    var rows = (j && j.rows) || [];
    document.getElementById("r-n").textContent = rows.length.toLocaleString("en-US");
    if (rows[0]) { var a = rows[0].address; document.getElementById("r-top").textContent = "Top: " + a.slice(0, 6) + "…" + a.slice(-4) + " · " + (Number(BigInt(rows[0].amount) / 10n ** 16n) / 100).toLocaleString("en-US") + " USDC"; }
  }).catch(function () {});
})();
</script>
</body></html>`, final && sent ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" : final ? "public, max-age=0, s-maxage=30, stale-while-revalidate=120" : "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
}

// ---- the newest ArcPad coins, for the landing page (/api/c?view=latest[&n=3]) ----
// Every ArcPad coin as {t: token, n: name, s: symbol} for the site-wide search (⌘K).
async function allCoins() {
  const hdr = (cache) => ({ "content-type": "application/json", "cache-control": cache, "access-control-allow-origin": "*" });
  try {
    const pools = (await allPools()).slice().sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 400);
    const coins = [];
    for (let i = 0; i < pools.length; i += 25) {
      const part = await Promise.all(pools.slice(i, i + 25).map((p) => getCoin(p.token).catch(() => null)));
      for (const c of part) if (c) coins.push({ t: c.token, n: String(c.name || "").slice(0, 48), s: String(c.symbol || "").slice(0, 16) });
    }
    return new Response(JSON.stringify({ coins }), { status: 200, headers: hdr("public, max-age=0, s-maxage=300, stale-while-revalidate=900") });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && err.message) || err).slice(0, 160) }), { status: 502, headers: hdr("no-store") });
  }
}

async function latestCoins(url) {
  const n = Math.max(1, Math.min(6, Number(url.searchParams.get("n")) || 3));
  const hdr = (cache) => ({ "content-type": "application/json", "cache-control": cache, "access-control-allow-origin": "*" });
  try {
    const pools = await allPools();
    const pick = pools.slice().sort((a, b) => b.launchedAt - a.launchedAt).slice(0, n);
    const coins = (await Promise.all(pick.map((p) => getCoin(p.token).catch(() => null)))).filter(Boolean).map((c) => ({
      token: c.token, name: c.name, symbol: c.symbol, image: /^https:\/\//.test(c.imageUrl || "") ? c.imageUrl : "", launchedAt: c.launchedAt,
      mcapUsd: c.mcapUsd != null ? Math.round(c.mcapUsd) : null, quote: c.quoteSymbol || "",
    }));
    return new Response(JSON.stringify({ count: pools.length, coins }), { status: 200, headers: hdr("public, max-age=0, s-maxage=60, stale-while-revalidate=300") });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && err.message) || err).slice(0, 160) }), { status: 502, headers: hdr("no-store") });
  }
}
