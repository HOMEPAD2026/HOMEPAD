// api/og.mjs — 1200×630 share image for an ArcPad coin: logo, ticker, live
// price and market cap, read from Arc at request time (edge-cached 5 min).
//   GET /api/og?addr=0x…   → PNG
// Used as og:image / twitter:image by the /c/<address> share page.
import { ImageResponse } from "@vercel/og";
import { getCoin, isAddr, fmtUsd, SITE } from "./_arc.mjs";

export const config = { runtime: "edge" };

const W = 1200, H = 630;
function h(type, style, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { style: { display: "flex", ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
function img(src, style) { return { type: "img", props: { src, width: style.width, height: style.height, style } }; }
function avatarBg(addr) {
  const x = parseInt(String(addr || "").toLowerCase().slice(2, 8) || "0", 16);
  const a = x % 360, b = (a + 40 + (x >> 9) % 80) % 360;
  return `linear-gradient(135deg, hsl(${a}, 70%, 52%), hsl(${b}, 75%, 40%))`;
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function fetchImage(url, ms = 3500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const type = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!r.ok || !/^image\/(png|jpe?g|gif|svg\+xml)$/.test(type)) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 2_500_000) return null;
    return `data:${type};base64,${toBase64(buf)}`;
  } catch { return null; } finally { clearTimeout(t); }
}
async function coinLogo(u) {
  if (/^data:image\/(png|jpe?g|gif|svg\+xml);base64,/i.test(u || "")) return u;
  if (/^https:\/\//i.test(u || "")) return fetchImage(u);
  return null;
}
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

function frame(children) {
  return h("div", {
    width: W, height: H, flexDirection: "column", justifyContent: "space-between", padding: "56px 64px",
    backgroundColor: "#050805", color: "#eaf2e6", fontFamily: "Sora",
    backgroundImage: "radial-gradient(circle at 12% 0%, rgba(63,155,255,0.28), transparent 45%), radial-gradient(circle at 100% 100%, rgba(57,255,136,0.22), transparent 50%)",
  }, children);
}
function brandRow(mark, right) {
  return h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
    h("div", { alignItems: "center", gap: 16 },
      mark ? img(mark, { width: 58, height: 40 }) : null,
      h("div", { fontSize: 30, fontWeight: 700, letterSpacing: 1 }, "ARCIRCLE PAD"),
      h("div", { fontSize: 22, color: "#9fb098", marginLeft: 6 }, "ArcPad · Circle's Arc")),
    right);
}
function pill(text, color) {
  return h("div", { fontSize: 22, fontWeight: 700, color, padding: "8px 18px", borderRadius: 999, border: `2px solid ${color}`, alignItems: "center" }, text);
}

export default async function handler(req) {
  const url = new URL(req.url);
  const addr = url.searchParams.get("addr") || "";
  const markP = fetchImage(`${SITE}/images/arcircle-mark-sm.png`);
  const fontsP = Promise.all([400, 700, 800].map(async (weight) => {
    try {
      const r = await fetch(`${SITE}/fonts/sora-latin-${weight}-normal.woff`);
      return r.ok ? { name: "Sora", data: await r.arrayBuffer(), weight, style: "normal" } : null;
    } catch { return null; }
  }));
  let coin = null;
  if (isAddr(addr)) { try { coin = await getCoin(addr); } catch { coin = null; } }
  const mark = await markP;
  let body;
  if (!coin) {
    body = frame([
      brandRow(mark, pill("LIVE ON ARC", "#39ff88")),
      h("div", { flexDirection: "column", gap: 18 },
        h("div", { fontSize: 88, fontWeight: 800, lineHeight: 1.05 }, "Launch a coin on Arc."),
        h("div", { fontSize: 36, color: "#9fb098" }, "A real Uniswap v4 pool from block one. 1 USDC to launch.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/arc"),
    ]);
  } else {
    const logo = await coinLogo(coin.imageUrl);
    const sym = clip(coin.symbol || "COIN", 12);
    const logoEl = logo
      ? img(logo, { width: 200, height: 200, borderRadius: 40, objectFit: "cover", border: "3px solid rgba(255,255,255,0.12)" })
      : h("div", { width: 200, height: 200, borderRadius: 40, alignItems: "center", justifyContent: "center", fontSize: 110, fontWeight: 800, color: "#fff", backgroundImage: avatarBg(coin.token) }, sym.slice(0, 1).toUpperCase());
    const stat = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "18px 26px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)", minWidth: 200 },
      h("div", { fontSize: 22, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
      h("div", { fontSize: 42, fontWeight: 800, color }, value));
    body = frame([
      brandRow(mark, pill("LIVE ON UNISWAP V4", "#39ff88")),
      h("div", { alignItems: "center", gap: 44 },
        logoEl,
        h("div", { flexDirection: "column", gap: 10, maxWidth: 820 },
          h("div", { fontSize: sym.length > 8 ? 92 : 112, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `$${sym}`),
          h("div", { fontSize: 40, color: "#b9c8b3" }, clip(coin.name || "", 36)),
          h("div", { fontSize: 24, color: "#39ff88", marginTop: 6 }, `arcircle.app/c/${coin.token.slice(0, 6)}…${coin.token.slice(-4)}`))),
      h("div", { gap: 18 },
        stat("Price", fmtUsd(coin.priceUsd, { plain: true })),
        stat("Market cap", fmtUsd(coin.mcapUsd), "#39ff88"),
        stat("Pair", coin.quoteSymbol || "—"),
        stat("Trade fee", `${1 + (coin.extraFeeBps || 0) / 100}%`)),
    ]);
  }
  const fonts = (await fontsP).filter(Boolean);
  return new ImageResponse(body, {
    width: W, height: H,
    ...(fonts.length ? { fonts } : {}),
    headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900" },
  });
}
