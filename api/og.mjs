// api/og.mjs — 1200×630 share image for an ArcPad coin: logo, ticker, live
// price and market cap, read from Arc at request time (edge-cached 5 min).
//   GET /api/og?addr=0x…   → PNG
//   GET /api/og?round=1[&w=0x…]  → CirclePad round card (optionally "0x… is in")
//   GET /api/og?scan=0x…   → Token Scanner result card (score, verdict, main reasons)
// Used as og:image / twitter:image by the /c/<address> share page.
import { ImageResponse } from "@vercel/og";
import { getCoin, isAddr, fmtUsd, SITE } from "./_arc.mjs";
import { roundState, contributionOf } from "./_round.mjs";
import { leaderboard as circleBoard } from "./_circle.mjs";
import { scanToken } from "./_scan.mjs";
import { receipt as dropReceipt } from "./_drop.mjs";
import { voteTx } from "./_burnvote.mjs";
import { lockInfo } from "./_locker.mjs";
import { forChain as predictFor } from "./_predict.mjs";
import { card as stakeCardOf } from "./_stake.mjs";
import { card as veaCardOf } from "./_vearcia.mjs";
import { cctp, DOMAIN_NAMES } from "./_cctp.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { coin as argusCoin } from "./_argus-arcpad.mjs";
import { mineView, meView, cardFacts as mineCardFacts, GAME as MINE_GAME } from "./_mine.mjs";
import { week as agentWeek } from "./_agent.mjs";

// Node.js runtime, not edge: @vercel/og's edge build compiles its WebAssembly
// renderer at runtime, which Vercel's edge sandbox refuses outside Next.js
// ("Wasm code generation disallowed by embedder") — every image came out empty.

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
async function fetchBytes(url, ms = 3500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const type = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!r.ok || !/^image\//.test(type)) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 4_000_000) return null;
    return { type, buf: Buffer.from(buf) };
  } catch { return null; } finally { clearTimeout(t); }
}
async function fetchImage(url, ms) {
  const got = await fetchBytes(url, ms);
  if (!got || !/^image\/(png|jpe?g|gif|svg\+xml)$/.test(got.type)) return null;
  return `data:${got.type};base64,${got.buf.toString("base64")}`;
}
/// Coin logos are usually WebP data URIs (the launch form shrinks uploads to
/// WebP), which the image renderer can't draw — convert anything that isn't
/// SVG to a 256px PNG first.
async function toPng(buf) {
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf, { animated: false }).resize(256, 256, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (err) { console.warn("logo convert failed", String(err && err.message || err)); return null; }
}
async function coinLogo(u) {
  u = String(u || "");
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(u);
  if (m) return /svg/i.test(m[1]) ? u : toPng(Buffer.from(m[2], "base64"));
  if (/^https:\/\//i.test(u)) {
    const got = await fetchBytes(u);
    if (!got) return null;
    return /svg/i.test(got.type) ? `data:${got.type};base64,${got.buf.toString("base64")}` : toPng(got.buf);
  }
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
function brandRow(mark, right, sub = "ArcPad · Circle's Arc") {
  return h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
    h("div", { alignItems: "center", gap: 16 },
      mark ? img(mark, { width: 58, height: 40 }) : null,
      h("div", { fontSize: 30, fontWeight: 700, letterSpacing: 1 }, "ARCIRCLE PAD"),
      h("div", { fontSize: 22, color: "#9fb098", marginLeft: 6 }, sub)),
    right);
}
function pill(text, color) {
  return h("div", { fontSize: 22, fontWeight: 700, color, padding: "8px 18px", borderRadius: 999, border: `2px solid ${color}`, alignItems: "center" }, text);
}

export async function GET(req) {
  const url = new URL(req.url);
  const addr = url.searchParams.get("addr") || "";
  const justLaunched = url.searchParams.get("kind") === "launch"; // Telegram launch announcements
  const markP = fetchImage(`${SITE}/images/arcircle-mark-sm.png`);
  const fontsP = Promise.all([400, 700, 800].map(async (weight) => {
    try {
      const r = await fetch(`${SITE}/fonts/sora-latin-${weight}-normal.woff`);
      return r.ok ? { name: "Sora", data: await r.arrayBuffer(), weight, style: "normal" } : null;
    } catch { return null; }
  }));
  if (url.searchParams.has("round")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await roundCard(await markP, url.searchParams.get("w")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600" },
    });
  }
  if (url.searchParams.has("snap")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await snapCard(await markP, url.searchParams.get("snap")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=120, s-maxage=600, stale-while-revalidate=3600" },
    });
  }
  if (url.searchParams.has("vote")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await voteCard(await markP, url.searchParams.get("vote")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=86400" },
    });
  }
  if (url.searchParams.has("bridge")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await bridgeCard(await markP, url.searchParams.get("bridge")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    });
  }
  if (url.searchParams.has("mine")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await mineCard(await markP, url.searchParams.get("mine"), url.searchParams.get("w"), url.searchParams.get("c"), url.searchParams.get("k")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=120, s-maxage=300, stale-while-revalidate=3600" },
    });
  }
  if (url.searchParams.has("nft")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await nftCard(await markP, url.searchParams.get("nft")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=120, s-maxage=600, stale-while-revalidate=3600" },
    });
  }
  if (url.searchParams.has("vearcia")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await veaCard(await markP, url.searchParams.get("vearcia")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400" },
    });
  }
  if (url.searchParams.has("stake")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await stakeCard(await markP, url.searchParams.get("stake")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400" },
    });
  }
  if (url.searchParams.has("predict")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await predictCard(await markP, url.searchParams.get("predict"), url.searchParams.get("u"), url.searchParams.get("c")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400" },
    });
  }
  if (url.searchParams.has("lock")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await lockCard(await markP, url.searchParams.get("lock"), url.searchParams.get("c") === "rh"), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=120, s-maxage=300, stale-while-revalidate=3600" },
    });
  }
  if (url.searchParams.has("lplock")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await lplockCard(await markP, url.searchParams.get("lplock")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=120, s-maxage=300, stale-while-revalidate=3600" },
    });
  }
  if (url.searchParams.has("drop")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await dropCard(await markP, url.searchParams.get("drop")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    });
  }
  if (url.searchParams.has("price")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await priceCard(await markP), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=60, s-maxage=120" },
    });
  }
  if (url.searchParams.has("a402")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await a402Card(await markP, url.searchParams.get("a402")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    });
  }
  if (url.searchParams.has("solscan")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await solScanCard(await markP, url.searchParams.get("solscan")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" },
    });
  }
  if (url.searchParams.has("agentweek")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await agentWeekCard(await markP, await fetchImage(`${SITE}/images/arcia-avatar.jpg`)), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=600, s-maxage=3600" },
    });
  }
  if (url.searchParams.has("scan")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await scanCard(await markP, url.searchParams.get("scan"), url.searchParams.get("chain") === "rh" ? "rh" : "arc"), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" },
    });
  }
  let coin = null;
  if (isAddr(addr)) { try { coin = await getCoin(addr); } catch { coin = null; } }
  // a coin launched on Argus through ArcPad (api/_argus-arcpad.mjs)
  if (!coin && isAddr(addr)) {
    try {
      const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
      const a = await argusCoin(addr, { store: st });
      if (a) coin = { token: a.token, symbol: a.symbol, name: a.name, imageUrl: a.image, priceUsd: a.priceUsd, mcapUsd: a.mcapUsd, quoteSymbol: "USDC", argus: true };
    } catch { coin = null; }
  }
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
      brandRow(mark, justLaunched ? pill("JUST LAUNCHED", "#ffd166") : pill("LIVE ON UNISWAP V4", "#39ff88")),
      h("div", { alignItems: "center", gap: 44 },
        logoEl,
        h("div", { flexDirection: "column", gap: 10, maxWidth: 820 },
          h("div", { fontSize: sym.length > 8 ? 92 : 112, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `$${sym}`),
          h("div", { fontSize: 40, color: "#b9c8b3" }, clip(coin.name || "", 36)),
          h("div", { fontSize: 24, color: "#39ff88", marginTop: 6 }, coin.argus ? `Argus via ArcPad · ${coin.token.slice(0, 6)}…${coin.token.slice(-4)}` : `arcircle.app/c/${coin.token.slice(0, 6)}…${coin.token.slice(-4)}`))),
      h("div", { gap: 18 },
        stat("Price", fmtUsd(coin.priceUsd, { plain: true })),
        stat("Market cap", fmtUsd(coin.mcapUsd), "#39ff88"),
        stat("Pair", coin.quoteSymbol || "—"),
        coin.argus ? stat("Creator fees", "70 / 30") : stat("Trade fee", `${1 + (coin.extraFeeBps || 0) / 100}%`)),
    ]);
  }
  const fonts = (await fontsP).filter(Boolean);
  return new ImageResponse(body, {
    width: W, height: H,
    ...(fonts.length ? { fonts } : {}),
    headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900" },
  });
}

// ---------------- CirclePad round card ----------------
const num = (n) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 });
async function roundCard(mark, w) {
  let st = null, mine = 0n;
  try { st = await roundState(); } catch { st = null; }
  let member = 0;
  if (st && isAddr(w)) { try { mine = await contributionOf(w); } catch { mine = 0n; } }
  if (mine > 0n) { try { const lb = await circleBoard(); member = (lb.joinOrder || []).indexOf(String(w).toLowerCase()) + 1; } catch { member = 0; } }
  const raised = st ? Number(st.totalRaised) / 1e18 : 0;
  const left = st && st.started ? st.deadline - Math.floor(Date.now() / 1000) : 0;
  const status = !st ? "CIRCLEPAD" : !st.started ? "OPENS SOON" : st.isOpen ? "LIVE" : "CLOSED";
  const timeLeft = left > 0 ? `${Math.floor(left / 86400) ? Math.floor(left / 86400) + "d " : ""}${Math.floor((left % 86400) / 3600)}h left` : st && st.started ? "Raise closed" : "72h USDC raise";
  const pct = raised > 0 && mine > 0n ? ((Number(mine) / 1e18 / raised) * 100) : 0;
  const ring = h("div", { width: 300, height: 300, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "column",
    border: "22px solid #39ff88", boxShadow: "0 0 60px rgba(57,255,136,0.35)", backgroundColor: "rgba(0,0,0,0.35)" },
    h("div", { fontSize: 64, fontWeight: 800, letterSpacing: -2 }, num(raised)),
    h("div", { fontSize: 24, fontWeight: 700, color: "#8dffc0", letterSpacing: 4 }, "USDC"),
    h("div", { fontSize: 20, color: "#9fb098", marginTop: 6 }, "raised"));
  const who = mine > 0n
    ? [h("div", { fontSize: 34, color: "#b9c8b3" }, member ? `${w.slice(0, 6)}…${w.slice(-4)} · member #${member} of the circle` : `${w.slice(0, 6)}…${w.slice(-4)} is in the circle`),
       h("div", { fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }, `${num(Number(mine) / 1e18)} USDC`),
       h("div", { fontSize: 30, color: "#39ff88" }, `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}% of the round`)]
    : [h("div", { fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }, "Fund together."),
       h("div", { fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, color: "#8dffc0" }, "Launch bigger."),
       h("div", { fontSize: 30, color: "#b9c8b3", marginTop: 8 }, "One project, one 72-hour USDC raise on Arc.")];
  return frame([
    brandRow(mark, pill(status, status === "LIVE" ? "#39ff88" : status === "CLOSED" ? "#9fb098" : "#ffd166"), "CirclePad · Circle's Arc"),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 10, maxWidth: 720 }, who),
      ring),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 26, color: "#9fb098" },
      h("div", {}, "CirclePad round #1 · withdraw any time before close"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, timeLeft)),
  ]);
}

// ---------------- Token Scanner result card ----------------
// The same engine as the page (api/_scan-core.mjs), run here, so the picture
// an X post shows is the chain's answer — not a number anyone typed in.
/// ARCIA AGENT's week (v2): her calls by kind, how they were graded, and what the burn vaults bought and burned
async function agentWeekCard(mark, av) {
  const st = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
  const w = await agentWeek(st).catch(() => null);
  const box = (label, value, color = "#eaf2e6", sub = "") => h("div", { flexDirection: "column", gap: 6, padding: "20px 24px", borderRadius: 20, border: "2px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", width: 250 },
    h("div", { fontSize: 18, fontWeight: 700, color: "#9fb098", letterSpacing: 2 }, label.toUpperCase()), h("div", { fontSize: 48, fontWeight: 800, color }, value), sub ? h("div", { fontSize: 20, color: "#9fb098" }, sub) : null);
  const c = (w && w.calls) || { total: 0, safe: 0, caution: 0, risky: 0 }, g = (w && w.graded) || {};
  const frac = (a, b) => (b ? `${a}/${b}` : "—");
  const burnLine = w && w.burns.length ? w.burns.slice(0, 2).map((b) => `${compactN(Number(BigInt(b.burned)) / 1e18)} burned ${b.ch === "rh" ? "on Robinhood Chain" : "on Arc"} · $${b.usd}`).join("   ·   ") : "The burn vaults wait for funding";
  return frame([
    brandRow(mark, pill("ARCIA AGENT · WEEKLY", "#39ff88"), "Arc · Robinhood Chain"),
    h("div", { alignItems: "center", gap: 28 },
      av ? img(av, { width: 132, height: 132, borderRadius: 999, border: "5px solid #39ff88" }) : null,
      h("div", { flexDirection: "column", gap: 8 }, h("div", { fontSize: 66, fontWeight: 800, lineHeight: 1.05 }, "My week, graded in public"), h("div", { fontSize: 28, color: "#9fb098" }, `${c.total} safety calls · every hash written on Arc first`))),
    h("div", { gap: 18 }, box("Safe", String(c.safe), "#39ff88", `right ${frac(g.safeRight, g.safe)}`), box("Caution", String(c.caution), "#ffc861", `held ${frac(g.cautionHeld, g.caution)}`), box("Risky", String(c.risky), "#ff6e5a", `right ${frac(g.riskyRight, g.risky)}`), box("Buy & burns", String((w && w.buys) || 0), "#ffd88a", "from the vaults")),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" }, h("div", {}, burnLine), h("div", {}, "arcircle.app/arc#agent")),
  ]);
}
const compactN = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)));
async function scanCard(mark, addr, chain = "arc") {
  let out = null;
  if (isAddr(addr)) {
    const store = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
    try { out = await scanToken(addr, { store, budgetMs: 4500, chain }); } catch { out = null; }
  }
  const NET = chain === "rh" ? "Robinhood Chain" : "Circle's Arc";
  const res = out && out.res, c = out && out.c;
  if (!res || res.notToken || !c) {
    return frame([
      brandRow(mark, pill("TOKEN SCANNER V4", "#4d9fff"), `Token Scanner · ${NET}`),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 88, fontWeight: 800, lineHeight: 1.05 }, "Check any Arc token."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Who really controls it, dry-run trades at three sizes, liquidity and holders — one score, critical flags apart.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/scanner"),
    ]);
  }
  const col = res.verdict.k === "ok" ? "#39ff88" : res.verdict.k === "care" ? "#ffc861" : "#ff6e5a";
  const sym = clip(c.symbol || "TOKEN", 12);
  // v3: critical flags as red pills first, then the other reasons; the section scores as bars
  const crit = (res.critical || []).slice(0, 2);
  const critEls = crit.map((r) => h("div", { alignItems: "center", gap: 12, fontSize: 28, fontWeight: 700, color: "#ffc2b8", padding: "8px 18px", borderRadius: 14, border: "2px solid rgba(255,110,90,0.85)", backgroundColor: "rgba(255,110,90,0.16)" },
    h("div", { fontSize: 18, fontWeight: 800, color: "#2a0905", backgroundColor: "#ff6e5a", padding: "2px 8px", borderRadius: 6 }, "CRITICAL"), h("div", {}, clip(r.title, 30))));
  const reasons = [...critEls, ...res.reasons.filter((r) => !crit.some((x) => x.title === r.title)).slice(0, 3 - crit.length).map((r) => h("div", { alignItems: "center", gap: 16, fontSize: 32, color: "#eaf2e6" },
    h("div", { width: 18, height: 18, borderRadius: 99, backgroundColor: r.status === "risk" ? "#ff6e5a" : r.status === "warn" ? "#ffc861" : "#39ff88" }),
    h("div", {}, clip(r.title, 34))))];
  const SECT = [["contract", "Contract"], ["control", "Control"], ["trade", "Trading"], ["market", "Market"], ["holders", "Holders"], ["launch", "Launch"]];
  const bars = h("div", { gap: 14, marginTop: 18 }, ...SECT.filter(([k]) => res.sub && res.sub[k]).map(([k, t]) => {
    const v = res.sub[k].score, bc = v == null ? "#6b7785" : v >= 75 ? "#39ff88" : v >= 45 ? "#ffc861" : "#ff6e5a";
    return h("div", { flexDirection: "column", gap: 6, width: 104 },
      h("div", { width: 104, height: 10, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.1)" }, h("div", { width: Math.max(8, ((v || 0) / 100) * 104), height: 10, borderRadius: 99, backgroundColor: bc })),
      h("div", { fontSize: 18, color: "#9fb098" }, t));
  }));
  const ring = h("div", { width: 300, height: 300, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "column",
    border: `22px solid ${col}`, boxShadow: `0 0 60px ${col}55`, backgroundColor: "rgba(0,0,0,0.35)" },
    h("div", { fontSize: 110, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }, String(res.score)),
    h("div", { fontSize: 26, color: "#9fb098" }, "/ 100"),
    h("div", { fontSize: 20, color: "#b9c8b3", marginTop: 6 }, `confidence ${res.confidence || "—"}`));
  return frame([
    brandRow(mark, pill(res.verdict.t.toUpperCase(), col), `Token Scanner · ${NET}`),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 14, maxWidth: 700 },
        h("div", { fontSize: sym.length > 8 ? 84 : 100, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `$${sym}`),
        h("div", { fontSize: 30, color: "#b9c8b3", marginBottom: 14 }, clip(c.name || "", 34)),
        ...reasons, bars),
      ring),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" },
      h("div", {}, `arcircle.app/s/${addr.slice(0, 6)}…${addr.slice(-4)} · Scanner v4 · automated check, not advice`),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, new Date().toISOString().slice(0, 10))),
  ]);
}

// ---------------- Token Scanner v4: a Solana token ----------------
async function solScanCard(mark, mint) {
  let r = null;
  try { const SOL = await import("./_scan-sol.mjs"); if (SOL.isMint(mint)) r = await SOL.scanSol(mint); } catch { r = null; }
  if (!r || r.notMint || r.error || r.score == null) {
    return frame([
      brandRow(mark, pill("TOKEN SCANNER V4", "#4d9fff"), "Token Scanner · Solana"),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 88, fontWeight: 800, lineHeight: 1.05 }, "Check any Solana token."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Mint and freeze authority, Token-2022 extensions, pump.fun's curve, sell routes and holders — one score.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/scanner"),
    ]);
  }
  const col = r.verdict.k === "ok" ? "#39ff88" : r.verdict.k === "care" ? "#ffc861" : "#ff6e5a";
  const sym = clip(r.symbol || "TOKEN", 12);
  const crit = (r.critical || []).slice(0, 2);
  const lines = [...crit.map((x) => h("div", { alignItems: "center", gap: 12, fontSize: 28, fontWeight: 700, color: "#ffc2b8", padding: "8px 18px", borderRadius: 14, border: "2px solid rgba(255,110,90,0.85)", backgroundColor: "rgba(255,110,90,0.16)" },
      h("div", { fontSize: 18, fontWeight: 800, color: "#2a0905", backgroundColor: "#ff6e5a", padding: "2px 8px", borderRadius: 6 }, "CRITICAL"), h("div", {}, clip(x.title, 30)))),
    ...(r.reasons || []).filter((x) => !crit.some((c2) => c2.title === x.title)).slice(0, 3 - crit.length).map((x) => h("div", { alignItems: "center", gap: 16, fontSize: 32, color: "#eaf2e6" },
      h("div", { width: 18, height: 18, borderRadius: 99, backgroundColor: x.status === "risk" ? "#ff6e5a" : x.status === "warn" ? "#ffc861" : "#39ff88" }), h("div", {}, clip(x.title, 34))))];
  const ring = h("div", { width: 300, height: 300, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "column", border: `22px solid ${col}`, boxShadow: `0 0 60px ${col}55`, backgroundColor: "rgba(0,0,0,0.35)" },
    h("div", { fontSize: 110, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }, String(r.score)),
    h("div", { fontSize: 26, color: "#9fb098" }, "/ 100"),
    h("div", { fontSize: 20, color: "#b9c8b3", marginTop: 6 }, `confidence ${r.confidence || "—"}`));
  return frame([
    brandRow(mark, pill(r.verdict.t.toUpperCase(), col), "Token Scanner · Solana"),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 14, maxWidth: 700 },
        h("div", { fontSize: sym.length > 8 ? 84 : 100, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `$${sym}`),
        h("div", { fontSize: 30, color: "#b9c8b3", marginBottom: 14 }, clip(r.name || "", 34)), ...lines),
      ring),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" },
      h("div", {}, `arcircle.app/s/${mint.slice(0, 5)}…${mint.slice(-4)} · Scanner v4 · Solana · not advice`),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, new Date().toISOString().slice(0, 10))),
  ]);
}

// ---------------- Multisender receipt card ----------------
// Read from the transactions themselves (api/_drop.mjs), so the numbers on an
// airdrop post are what the chain shows.
const compact = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B" : n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
async function dropCard(mark, txs) {
  let r = null;
  try { r = await dropReceipt(txs); } catch { r = null; }
  if (!r) {
    return frame([
      brandRow(mark, pill("MULTISENDER", "#39ff88"), "Multisender · Circle's Arc"),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 88, fontWeight: 800, lineHeight: 1.05 }, "One token, many wallets."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Airdrops on Arc in as few transactions as possible — no fee.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/multisend"),
    ]);
  }
  const amt = r.kind === "token" ? compact(Number(BigInt(r.total)) / 10 ** r.decimals) : r.kind === "nft" ? String(r.total) : "";
  const what = r.kind === "nft" ? `${amt} NFT${amt === "1" ? "" : "s"}` : r.kind === "multi" ? "Tokens" : `${amt} $${clip(r.symbol, 10)}`;
  const dots = Array.from({ length: 60 }, (_, i) => h("div", { width: 18, height: 18, borderRadius: 5, backgroundColor: i < Math.min(60, r.wallets) ? "#39ff88" : "rgba(255,255,255,0.12)", boxShadow: i < Math.min(60, r.wallets) ? "0 0 10px rgba(57,255,136,0.55)" : "none" }));
  return frame([
    brandRow(mark, pill("AIRDROP", "#39ff88"), "Multisender · Circle's Arc"),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 12, maxWidth: 640 },
        h("div", { fontSize: what.length > 14 ? 76 : 96, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, what),
        h("div", { fontSize: 40, color: "#b9c8b3" }, `sent to ${r.wallets.toLocaleString("en-US")} wallet${r.wallets === 1 ? "" : "s"}`),
        h("div", { fontSize: 26, color: "#9fb098", marginTop: 8 }, `${r.txs.length} transaction${r.txs.length === 1 ? "" : "s"} · straight from ${r.sender.slice(0, 6)}…${r.sender.slice(-4)}`)),
      h("div", { width: 330, flexWrap: "wrap", gap: 8 }, dots)),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" },
      h("div", {}, "arcircle.app/multisend · verified on-chain"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 10) : "")),
  ]);
}

// ---------------- $ARCIRCLE price card (ARCIA's Telegram /price) ----------------
async function priceCard(mark) {
  const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(4000) }); return r.ok ? await r.json() : null; } catch { return null; } };
  const [d, sr] = await Promise.all([get(`${SITE}/api/social?token=arcircle`), get(`${SITE}/api/arcia-tg?series=1`)]);
  const pts = (sr && sr.points) || [];
  const acc = "#39ff88";
  const price = d && d.price != null ? (d.price < 0.001 ? Number(d.price).toPrecision(3) : Number(d.price).toFixed(6)) : "—";
  const ch = d && d.change24h != null ? d.change24h : null;
  let spark = null;
  if (pts.length >= 3) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const Wd = 460, Hd = 200, px = (x) => ((x - x0) / Math.max(1, x1 - x0)) * Wd, py = (y) => Hd - 10 - ((y - y0) / Math.max(1e-18, y1 - y0)) * (Hd - 20);
    const dpath = pts.map((p, i) => `${i ? "L" : "M"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ");
    const up = ys[ys.length - 1] >= ys[0];
    spark = { type: "svg", props: { width: Wd, height: Hd, viewBox: `0 0 ${Wd} ${Hd}`, children: [
      { type: "path", props: { d: `${dpath} L${Wd},${Hd} L0,${Hd} Z`, fill: up ? "rgba(57,255,136,0.12)" : "rgba(255,110,110,0.12)" } },
      { type: "path", props: { d: dpath, fill: "none", stroke: up ? acc : "#ff6e6e", strokeWidth: 5, strokeLinejoin: "round", strokeLinecap: "round" } },
    ] } };
  }
  const stat = (k, v) => h("div", { flexDirection: "column", gap: 4 }, h("div", { fontSize: 22, color: "#9fb098" }, k), h("div", { fontSize: 38, fontWeight: 800 }, v));
  return frame([
    brandRow(mark, pill("$ARCIRCLE LIVE", acc), "Circle's Arc"),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 10 },
        h("div", { alignItems: "baseline", gap: 18 },
          h("div", { fontSize: 104, fontWeight: 800, letterSpacing: -2 }, `$${price}`),
          ch != null ? h("div", { fontSize: 40, fontWeight: 700, color: ch >= 0 ? acc : "#ff6e6e" }, `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`) : null),
        h("div", { gap: 48, marginTop: 10 },
          stat("Market cap", d && d.mcap != null ? fmtUsd(d.mcap) : "—"),
          stat("Holders", d && d.holders != null ? Number(d.holders).toLocaleString("en-US") : "—"),
          stat("Burned", d && d.burned && d.burned.pct != null ? d.burned.pct.toFixed(2) + "%" : "—"))),
      spark ? h("div", { flexDirection: "column", alignItems: "flex-end", gap: 6 }, spark, h("div", { fontSize: 20, color: "#9fb098" }, "last 24 h")) : null),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" },
      h("div", {}, "arcircle.app · read live from Arc"), h("div", { color: "#eaf2e6", fontWeight: 700 }, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC")),
  ]);
}

// ---------------- ARCIA 402 sale card (/a402/<tx>) ----------------
async function a402Card(mark, tx) {
  let d = null;
  if (/^0x[0-9a-fA-F]{64}$/.test(tx || "")) { try { const r = await fetch(`${SITE}/api/arcia402?sale=${tx.toLowerCase()}`); d = r.ok ? await r.json() : null; } catch { d = null; } }
  const face = await fetchImage(`${SITE}/images/arcia-avatar.jpg`);
  const acc = "#39ff88";
  const avatar = face ? img(face, { width: 230, height: 230, borderRadius: 115, border: "6px solid rgba(57,255,136,0.7)", boxShadow: "0 0 60px rgba(57,255,136,0.35)" }) : null;
  if (!d) {
    return frame([
      brandRow(mark, pill("ARCIA 402", acc), "x402 · Circle's Arc"),
      h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
        h("div", { flexDirection: "column", gap: 16, maxWidth: 740 },
          h("div", { fontSize: 84, fontWeight: 800, lineHeight: 1.05 }, "An AI that earns on Arc."),
          h("div", { fontSize: 32, color: "#9fb098" }, "ARCIA sells her intelligence per call in USDC — and hires other agents with her own wallet.")),
        avatar),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/arc#arcia402"),
    ]);
  }
  const amt = Number(d.amount || 0);
  return frame([
    brandRow(mark, pill("PAID WITH x402", acc), "ARCIA 402 · Circle's Arc"),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 10, maxWidth: 760 },
        h("div", { fontSize: 30, color: acc, fontWeight: 700 }, "ARCIA just earned"),
        h("div", { alignItems: "baseline", gap: 16 },
          h("div", { fontSize: 120, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }, `$${amt.toFixed(2)}`),
          h("div", { fontSize: 40, color: "#b9c8b3", fontWeight: 700 }, "USDC")),
        h("div", { fontSize: 40, fontWeight: 700, marginTop: 8 }, clip(d.title, 34)),
        d.headline ? h("div", { fontSize: 28, color: "#b9c8b3" }, clip(d.headline, 48)) : null),
      avatar),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" },
      h("div", {}, `paid by ${String(d.from).slice(0, 6)}…${String(d.from).slice(-4)} · verified on Arc`),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, d.t ? new Date(d.t).toISOString().slice(0, 10) : "")),
  ]);
}

// ---------------- Holder Snapshot card (/snap/<id>) ----------------
async function snapCard(mark, id) {
  let d = null;
  if (/^[0-9a-f]{12}$/.test(id || "")) { try { const r = await fetch(`${SITE}/api/social?snapview=${id}`); d = r.ok ? await r.json() : null; } catch { d = null; } }
  const sym = d && d.symbol ? `$${clip(d.symbol, 10)}` : "Holders";
  const acc = "#b58bff";
  if (!d) {
    return frame([
      brandRow(mark, pill("SNAPSHOT", acc), "Snapshot · Circle's Arc"),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 88, fontWeight: 800, lineHeight: 1.05 }, "Every holder, one block."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Fair lists for airdrops on Arc — fingerprinted, anyone can check.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/snapshot"),
    ]);
  }
  const done = d.status === "done";
  const when = done ? new Date(d.ts * 1000) : new Date(d.at * 1000);
  const big = done ? `${Number(d.count).toLocaleString("en-US")} holders` : "Scheduled";
  const line2 = done ? `of ${sym} at block #${Number(d.block).toLocaleString("en-US")}` : `${sym} snapshot at ${when.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const rec = done && d.created ? `recorded ${new Date(d.created).toISOString().slice(0, 16).replace("T", " ")} UTC` : "";
  const extras = [rec, d.f && d.f.min ? `${Number(d.f.min).toLocaleString("en-US")}+ held` : "", d.f && d.f.hold ? `held for ${Math.round(d.f.hold / 3600) >= 48 ? Math.round(d.f.hold / 86400) + " days" : Math.round(d.f.hold / 3600) + "h"}` : "", d.f && d.f.locks ? "locked tokens count" : "", d.by ? `signed by ${d.by.slice(0, 6)}…${d.by.slice(-4)}` : ""].filter(Boolean).join(" · ");
  const bars = Array.from({ length: 16 }, (_, i) => h("div", { width: 16, height: 30 + Math.round(150 * Math.pow(0.84, i)), borderRadius: 5, backgroundColor: i < 3 ? "#ff8bd8" : i < 9 ? acc : "#7c9cff", opacity: done ? 1 : 0.35 }));
  return frame([
    brandRow(mark, pill(done ? (d.auto ? "SNAPSHOT RECORD" : "SNAPSHOT") : "SCHEDULED", acc), "Snapshot · Circle's Arc"),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 12, maxWidth: 660 },
        d.title ? h("div", { fontSize: 30, color: acc, fontWeight: 700 }, clip(d.title, 40)) : null,
        h("div", { fontSize: 92, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, big),
        h("div", { fontSize: 38, color: "#b9c8b3" }, line2),
        extras ? h("div", { fontSize: 24, color: "#9fb098", marginTop: 6 }, extras) : null),
      h("div", { alignItems: "flex-end", gap: 6, height: 190 }, bars)),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" },
      h("div", {}, done ? `fingerprint ${d.fp.slice(0, 18)}…` : "the list is built from the chain at that moment"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, `arcircle.app/snap/${d.id}`)),
  ].filter(Boolean));
}

// ---------------- ArcLPLock certificate ----------------
const amt = (raw, dec) => { const n = Number(BigInt(raw || 0)) / 10 ** Number(dec || 18); return !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
async function lplockCard(mark, id) {
  let d = null;
  if (/^\d{1,9}$/.test(id || "")) { try { const r = await fetch(`${SITE}/api/social?lplock=${id}`); d = r.ok ? await r.json() : null; } catch { d = null; } }
  const acc = "#39ff88";
  if (!d) {
    return frame([
      brandRow(mark, pill("LP LOCK", acc), "Liquidity Manager · Circle's Arc"),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 86, fontWeight: 800, lineHeight: 1.05 }, "Liquidity, locked."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Uniswap v4 positions on Arc, locked until a date nobody can bring forward.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/liquidity"),
    ]);
  }
  const sym = clip(d.token.symbol, 10), qs = clip(d.quote.symbol, 8);
  const until = new Date(d.unlockAt * 1000).toISOString().slice(0, 10);
  const days = Math.max(0, Math.ceil((d.unlockAt - d.now) / 86400));
  const span = Math.max(1, d.unlockAt - d.lockedAt), done = Math.min(1, Math.max(0, (d.now - d.lockedAt) / span));
  const state = d.withdrawn ? "WITHDRAWN" : d.active ? "LOCKED" : "LOCK ENDED";
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "16px 24px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 20, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 38, fontWeight: 800, color }, value));
  return frame([
    brandRow(mark, pill(state, d.active ? acc : "#ffd166"), "Liquidity Manager · Circle's Arc"),
    h("div", { alignItems: "center", gap: 40, width: "100%" },
      h("div", { width: 170, height: 170, borderRadius: 40, flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg, rgba(57,208,255,0.25), rgba(57,255,136,0.25))", border: "3px solid rgba(57,255,136,0.5)" },
        h("div", { width: 56, height: 44, borderTopLeftRadius: 28, borderTopRightRadius: 28, border: "9px solid #39ff88", borderBottomWidth: 0 }),
        h("div", { width: 92, height: 62, borderRadius: 16, backgroundColor: "#39ff88", alignItems: "center", justifyContent: "center" },
          h("div", { width: 14, height: 22, borderRadius: 7, backgroundColor: "#0b1413" }))),
      h("div", { flexDirection: "column", gap: 10 },
        h("div", { fontSize: 30, color: acc, fontWeight: 700 }, `$${sym} / ${qs} · Uniswap v4`),
        h("div", { fontSize: 80, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, d.active ? `Locked until ${until}` : d.withdrawn ? "Withdrawn" : `Ended ${until}`),
        h("div", { fontSize: 32, color: "#b9c8b3" }, `${amt(d.amounts.token, d.token.decimals)} ${sym} + ${amt(d.amounts.quote, d.quote.decimals)} ${qs}`))),
    h("div", { flexDirection: "column", gap: 14, width: "100%" },
      h("div", { width: "100%", height: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)" },
        h("div", { width: `${Math.round(done * 100)}%`, height: 14, borderRadius: 14, backgroundImage: "linear-gradient(90deg, #39ff88, #39d0ff)" })),
      h("div", { gap: 16 },
        box("Days left", d.active ? String(days) : "0", acc),
        box("Pool share", d.poolShare ? `${d.poolShare}%` : "—"),
        box("Position", `#${d.tokenId}`),
        box("Lock", `#${d.id}`))),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 22, color: "#9fb098" },
      h("div", {}, "ArcLPLock · nobody can move it before the date"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, `arcircle.app/lplock/${d.id}`)),
  ]);
}

// ---- Bridge receipt card (/bx/<src>/<tx>) ----
async function bridgeCard(mark, key) {
  const [src, tx] = String(key || "").split(":");
  let m = null;
  if (/^\d{1,3}$/.test(src || "") && /^0x[0-9a-f]{64}$/i.test(tx || "")) {
    try { const [st, body] = await cctp(new URLSearchParams({ cctp: "msg", src, tx })); m = st === 200 && body.messages && body.messages[0] ? body.messages[0] : null; } catch { m = null; }
  }
  const acc = "#ffc861";
  const from = DOMAIN_NAMES[Number(src)] || "Chain", to = m && m.dstDomain != null ? DOMAIN_NAMES[m.dstDomain] || "Chain" : "Arc";
  const coin = h("div", { width: 150, height: 150, borderRadius: 75, alignItems: "center", justifyContent: "center", backgroundImage: "radial-gradient(circle at 35% 30%, #ffffff, #9cd0ff 35%, #2775ca 75%)", boxShadow: "0 0 60px rgba(77,159,255,0.6)" },
    h("div", { fontSize: 44, fontWeight: 800, color: "#0b2a55" }, "USDC"));
  const chip = (t, c) => h("div", { padding: "14px 26px", borderRadius: 999, border: `3px solid ${c}`, fontSize: 36, fontWeight: 800, color: "#eaf2e6" }, t);
  if (!m) {
    return frame([
      brandRow(mark, pill("BRIDGE", acc), "Circle CCTP · Circle's Arc"),
      h("div", { alignItems: "center", gap: 40 }, coin, h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 84, fontWeight: 800, lineHeight: 1.05 }, "USDC, anywhere."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Native USDC between Arc and 14 chains, by Circle's CCTP."))),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/arc#bridge"),
    ]);
  }
  const amt = (Number(BigInt(m.amount || "0")) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return frame([
    brandRow(mark, pill(m.status === "complete" ? "SIGNED BY CIRCLE" : "ON ITS WAY", acc), "Bridge · Circle CCTP"),
    h("div", { alignItems: "center", gap: 40, width: "100%" }, coin,
      h("div", { flexDirection: "column", gap: 18 },
        h("div", { fontSize: 96, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `${amt} USDC`),
        h("div", { alignItems: "center", gap: 18 }, chip(from, "#4d9fff"), h("div", { fontSize: 44, color: acc, fontWeight: 800 }, "→"), chip(to, "#39ff88")))),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 22, color: "#9fb098" },
      h("div", {}, "Burned on one chain, minted on the other · no wrapped tokens"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, "arcircle.app/arc#bridge")),
  ]);
}

// ---- Locker certificate card (/lock/<id>) ----
async function lockCard(mark, id, rh = false) {
  let d = null;
  const CN = rh ? "Robinhood Chain" : "Circle's Arc";
  if (/^\d{1,9}$/.test(id || "")) { try { d = await lockInfo(id, rh ? "rh" : "arc"); } catch { d = null; } }
  const acc = "#39ff88";
  const padlock = h("div", { width: 170, height: 170, borderRadius: 40, flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg, rgba(53,216,208,0.22), rgba(57,255,136,0.25))", border: "3px solid rgba(57,255,136,0.5)" },
    h("div", { width: 56, height: 44, borderTopLeftRadius: 28, borderTopRightRadius: 28, border: "9px solid #39ff88", borderBottomWidth: 0 }),
    h("div", { width: 92, height: 62, borderRadius: 16, backgroundColor: "#39ff88", alignItems: "center", justifyContent: "center" },
      h("div", { width: 14, height: 22, borderRadius: 7, backgroundColor: "#0b1413" })));
  if (!d) {
    return frame([
      brandRow(mark, pill("LOCKER", acc), `ARCIRCLE PAD · ${CN}`),
      h("div", { alignItems: "center", gap: 40 }, padlock,
        h("div", { flexDirection: "column", gap: 16 },
          h("div", { fontSize: 86, fontWeight: 800, lineHeight: 1.05 }, "Locked, on-chain."),
          h("div", { fontSize: 34, color: "#9fb098" }, rh ? "Any Robinhood Chain token, until a date nobody can bring forward." : "Any Arc token, until a date nobody can bring forward."))),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/arc#locker"),
    ]);
  }
  const sym = clip(d.token.symbol, 12);
  const until = new Date(d.unlockAt * 1000).toISOString().slice(0, 10);
  const days = Math.max(0, Math.ceil((d.unlockAt - d.now) / 86400));
  const span = Math.max(1, d.unlockAt - d.lockedAt), done = Math.min(1, Math.max(0, (d.now - d.lockedAt) / span));
  const state = d.withdrawn ? "WITHDRAWN" : d.active ? "LOCKED" : "UNLOCKED";
  const p = d.pctOfSupply == null ? "—" : `${(d.pctOfSupply >= 10 ? d.pctOfSupply.toFixed(1) : d.pctOfSupply >= 1 ? d.pctOfSupply.toFixed(2) : d.pctOfSupply.toFixed(3)).replace(/\.?0+$/, "")}%`;
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "16px 24px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 20, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 38, fontWeight: 800, color }, value));
  return frame([
    brandRow(mark, pill(state, d.active ? acc : "#ffd166"), `Locker · ${CN}`),
    h("div", { alignItems: "center", gap: 40, width: "100%" }, padlock,
      h("div", { flexDirection: "column", gap: 10 },
        h("div", { fontSize: 30, color: acc, fontWeight: 700 }, `${amt(d.amount, d.token.decimals)} $${sym}`),
        h("div", { fontSize: 80, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, d.active ? `Locked until ${until}` : d.withdrawn ? "Withdrawn" : `Unlocked ${until}`),
        h("div", { fontSize: 30, color: "#b9c8b3" }, d.usd != null ? `About ${fmtUsd(d.usd)} at today's price` : "Nobody can move it before the date"))),
    h("div", { flexDirection: "column", gap: 14, width: "100%" },
      h("div", { width: "100%", height: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)" },
        h("div", { width: `${Math.round(done * 100)}%`, height: 14, borderRadius: 14, backgroundImage: "linear-gradient(90deg, #39ff88, #35d8d0)" })),
      h("div", { gap: 16 },
        box("Days left", d.active ? String(days) : "0", acc),
        box("Of supply", p),
        box("Locked on", new Date(d.lockedAt * 1000).toISOString().slice(0, 10)),
        box("Lock", `#${d.id}`))),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 22, color: "#9fb098" },
      h("div", {}, "ArcLock · no owner, no admin, no fee"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, `arcircle.app/lock/${d.id}${rh ? "?c=rh" : ""}`)),
  ]);
}

// ---- Builder Mine card (/mine/<id>?r=<wallet>) — the mine's strata, and the builder's haul when a wallet is given ----
const MINE_LAYER_COLORS = ["#5f9e4a", "#b07a4a", "#7d8594", "#c9a24a", "#4a5872", "#e2553b"];
const MINE_ORE = { diamond: { name: "Diamond", color: "#7fe7ff", pts: 60 }, arc: { name: "Arc Crystal", color: "#c58bff", pts: 500 }, heart: { name: "Heart of Arc", color: "#ff6b8b", pts: 100 } };
const MINE_CARDS = ["jackpot", "rank", "season", "crew", "open", "book"];
async function mineCard(mark, id, w, card, kind) {
  let v = null, me = null, facts = null;
  if (/^\d{1,6}$/.test(id || "")) { try { v = await mineView(Number(id)); } catch { v = null; } }
  if (v && isAddr(w || "")) { try { me = await meView(Number(id), w); } catch { me = null; } }
  card = MINE_CARDS.includes(card) ? card : "";
  // every claim on a card is checked against the builder's own record; if it doesn't hold, the plain card is drawn
  if (v && card && card !== "open" && me) { try { facts = await mineCardFacts(w, card, String(kind || "")); } catch { facts = null; } }
  const acc = "#ffc861";
  if (v && ((card && card !== "open" && facts) || card === "open")) return mineSpecial(mark, v, me, card, facts, acc);
  const strata = (layer) => h("div", { width: 230, height: 360, flexDirection: "column", borderRadius: 28, overflow: "hidden", border: "3px solid rgba(255,200,97,0.45)" },
    ...MINE_LAYER_COLORS.map((c, i) => h("div", { flex: 1, backgroundColor: c, opacity: i <= layer ? 1 : 0.35, alignItems: "center", justifyContent: "center", borderTop: i ? "3px solid rgba(0,0,0,0.25)" : "none" },
      i === layer ? h("div", { width: 64, height: 64, borderRadius: 32, backgroundColor: "#0b0f14", border: `5px solid ${acc}`, alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: acc }, String(i + 1)) : null)));
  if (!v) {
    return frame([
      brandRow(mark, pill("BUILDER MINE", acc), "ARCIRCLE PAD · Circle's Arc"),
      h("div", { alignItems: "center", gap: 48 }, strata(2),
        h("div", { flexDirection: "column", gap: 16 },
          h("div", { fontSize: 86, fontWeight: 800, lineHeight: 1.05 }, "Mine on Arc."),
          h("div", { fontSize: 34, color: "#b9c8b3" }, "Holders open a mine. Builders dig it. The rest is burned."))),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/arc#mine"),
    ]);
  }
  const sym = clip(v.token.symbol, 12), dec = v.token.decimals;
  const layerName = MINE_GAME.layers[v.layer] || "";
  const ended = v.now >= v.end;
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "14px 22px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 19, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 34, fontWeight: 800, color }, value));
  const rank = me ? (v.top || []).findIndex((t) => t.w === me.w) : -1;
  const pick = me ? (MINE_GAME.pickaxes[me.pickaxe] || MINE_GAME.pickaxes[0]).name.replace(" pickaxe", "") : "";
  const headline = me && BigInt(me.mined || 0) > 0n ? `I mined ${amt(me.mined, dec)} $${sym}` : me ? `I'm mining $${sym}` : `Mine $${sym} on Arc`;
  // the builder's own character (and rank badge) from the concept art; the strata when there's no builder
  const rankInfo = me ? MINE_GAME.ranks[me.rank || 0] : null;
  const [charImg, badgeImg] = me ? await Promise.all([fetchImage(`${SITE}/images/mine/og-char-${(me.look && me.look.char) || "apprentice"}.png`), fetchImage(`${SITE}/images/mine/og-badge-${rankInfo.id}.png`)]) : [null, null];
  const hero = charImg ? h("div", { width: 250, height: 360, alignItems: "flex-end", justifyContent: "center", borderRadius: 28, backgroundImage: "radial-gradient(circle at 50% 70%, rgba(255,200,97,0.35), rgba(255,200,97,0.04) 70%)", border: "3px solid rgba(255,200,97,0.45)", position: "relative" },
    img(charImg, { width: 220, height: 330, objectFit: "contain" }),
    badgeImg ? img(badgeImg, { width: 74, height: 84, objectFit: "contain", position: "absolute", top: 10, left: 10 }) : null) : null;
  const sub = `${ended ? "Mine closed" : `Layer ${v.layer + 1} · ${layerName}`} · ${Number(v.builders).toLocaleString("en-US")} builders`;
  return frame([
    brandRow(mark, pill(ended ? "ENDED" : "BUILDER MINE", acc), "Builder Mine · Circle's Arc"),
    h("div", { alignItems: "center", gap: 48, width: "100%" }, hero || strata(ended ? 5 : v.layer),
      h("div", { flexDirection: "column", gap: 12 },
        h("div", { fontSize: 30, color: acc, fontWeight: 700 }, me ? `${me.x ? "@" + clip(me.x, 16) + " · " : ""}${rankInfo.name} builder on Arc` : "Holders open it · builders dig it"),
        h("div", { fontSize: 74, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }, headline),
        h("div", { fontSize: 30, color: "#b9c8b3" }, sub),
        h("div", { gap: 14, marginTop: 10 },
          me ? box("Pickaxe", pick, acc) : box("In the mine", `${amt(v.deposited, dec)}`, acc),
          me ? box("Rank", rank >= 0 ? `#${rank + 1}` : "—") : box("Mined so far", amt(v.emittedNow, dec)),
          me ? box("Points", Number(me.points || 0).toLocaleString("en-US")) : box("Left: burned", "at the end")))),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 22, color: "#9fb098" },
      h("div", {}, "Join with 1 USDC · mine in your browser · claim on Arc"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, `arcircle.app/mine/${v.id}`)),
  ]);
}

// the special cards: a jackpot ore, a rank, a season place, a crew, a fresh mine, the ore book
async function mineSpecial(mark, v, me, card, f, acc) {
  const sym = clip(v.token.symbol, 12), dec = v.token.decimals;
  const who = me ? (me.x ? "@" + clip(me.x, 16) : `${me.w.slice(0, 6)}…${me.w.slice(-4)}`) : "";
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "14px 22px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 19, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 34, fontWeight: 800, color }, value));
  const art = async (file, color, w = 300, hh = 300) => {
    const im = await fetchImage(`${SITE}/images/mine/${file}`);
    return h("div", { width: 330, height: 360, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundImage: `radial-gradient(circle at 50% 50%, ${color}66, ${color}08 70%)`, border: `3px solid ${color}88` },
      im ? img(im, { width: w, height: hh, objectFit: "contain" }) : h("div", { width: 160, height: 160, borderRadius: 30, backgroundColor: color }));
  };
  let pillText = "BUILDER MINE", color = acc, left, kicker, headline, sub, boxes = [];
  if (card === "jackpot") {
    const o = MINE_ORE[f.kind]; color = o.color; pillText = f.kind === "arc" ? "JACKPOT" : "RARE FIND";
    left = await art(`og-ore-${f.kind}.png`, color);
    kicker = `${who} · $${sym} mine`; headline = `I found ${f.kind === "arc" ? "an" : "a"} ${o.name}`;
    sub = f.kind === "arc" ? "1 in 16,384 shares. The rarest ore on Arc." : f.kind === "heart" ? "One per mine per hour. First to reach it wins." : "1 in 1,024 shares.";
    boxes = [box("Points", `+${o.pts}`, color), box("Found", String(f.n) + (f.n === 1 ? " time" : " times")), box("Layer", `${v.layer + 1} · ${MINE_GAME.layers[v.layer] || ""}`)];
  } else if (card === "rank") {
    const r = MINE_GAME.ranks[f.rank] || MINE_GAME.ranks[0]; pillText = "RANK UP";
    left = await art(`og-badge-${r.id}.png`, acc, 250, 290);
    kicker = `${who} · Builder on Arc`; headline = `${r.name} rank`;
    sub = r.pct ? `+${r.pct}% on every mine from now on.` : "The first rank. Every share counts.";
    const next = MINE_GAME.ranks[f.rank + 1];
    boxes = [box("Lifetime points", Number(f.pts).toLocaleString("en-US"), acc), box("Next", next ? `${next.name} · ${Number(next.min).toLocaleString("en-US")}` : "Top rank")];
  } else if (card === "season") {
    pillText = "SEASON"; const mo = new Date(Date.UTC(+f.ym.slice(0, 4), +f.ym.slice(4) - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    left = await art(`og-char-${(me.look && me.look.char) || "apprentice"}.png`, acc, 230, 330);
    kicker = `${who} · Season ${mo}`; headline = `#${f.place} of ${Number(f.of).toLocaleString("en-US")} builders`;
    sub = "Points from every mine on Arc this month.";
    boxes = [box("Season points", Number(f.pts).toLocaleString("en-US"), acc), box("Rank", (MINE_GAME.ranks[me.rank || 0] || {}).name || "")];
  } else if (card === "crew") {
    pillText = "CREW"; color = "#6fe3b0";
    left = await art(`og-char-${(me.look && me.look.char) || "apprentice"}.png`, color, 230, 330);
    kicker = `${who} · ${f.owner ? "founder" : "member"}`; headline = `Crew ${clip(f.name, 18)}`;
    sub = f.pct ? `Every member mines with +${f.pct}% this month.` : f.next ? `${Number(f.next.at - f.season).toLocaleString("en-US")} points to +${f.next.pct}% for everyone.` : "Dig together.";
    boxes = [box("Members", `${f.n} / 30`, color), box("This month", Number(f.season).toLocaleString("en-US")), box("Crew bonus", f.pct ? `+${f.pct}%` : "—", color)];
  } else if (card === "book") {
    pillText = "ORE BOOK"; color = "#c58bff";
    left = await art("og-ore-arc.png", color);
    kicker = `${who} · Builder on Arc`; headline = `${f.found} of ${f.of} ores found`;
    sub = f.found === f.of ? "Every ore on Arc, collected." : "Copper, silver, gold, diamond, Arc Crystal, the Heart of Arc.";
    boxes = f.book.slice(0, 6).map((b) => box(b.kind === "arc" ? "Arc" : b.kind === "heart" ? "Heart" : b.kind, b.n ? Number(b.n).toLocaleString("en-US") : "—", b.n ? "#eaf2e6" : "#5d6b58"));
  } else { // a fresh mine: the creator's promo card
    pillText = v.now < v.start ? "OPENS SOON" : "NEW MINE";
    left = await art("og-chest.png", acc, 290, 260);
    const days = Math.round((v.end - v.start) / 86400);
    kicker = v.info && v.info.name ? clip(v.info.name, 34) : "Builder Mine · Circle's Arc"; headline = `Mine $${sym} on Arc`;
    sub = v.info && v.info.about ? clip(v.info.about, 90) : "Builders dig it in the browser. Whatever isn't mined is burned.";
    boxes = [box("In the mine", amt(v.deposited, dec), acc), box("Runs", `${days} days`), box("Layers", "6")];
  }
  return frame([
    brandRow(mark, pill(pillText, color), "Builder Mine · Circle's Arc"),
    h("div", { alignItems: "center", gap: 44, width: "100%" }, left,
      h("div", { flexDirection: "column", gap: 12, flex: 1 },
        h("div", { fontSize: 28, color, fontWeight: 700 }, kicker),
        h("div", { fontSize: headline.length > 22 ? 62 : 74, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }, headline),
        h("div", { fontSize: 28, color: "#b9c8b3" }, sub),
        h("div", { gap: 12, marginTop: 8, flexWrap: "wrap" }, ...boxes))),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 22, color: "#9fb098" },
      h("div", {}, "Join with 1 USDC · mine in your browser · claim on Arc"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, `arcircle.app/mine/${v.id}`)),
  ]);
}

// ---- CirclePad burn-to-vote card (/vote/<tx>) — a flame drawn with divs, no emoji ----
async function voteCard(mark, tx) {
  let v = null;
  if (/^0x[0-9a-fA-F]{64}$/.test(tx || "")) { try { v = await voteTx(tx); } catch { v = null; } }
  const acc = "#ff8a4c";
  const flame = h("div", { width: 170, height: 170, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(160deg, rgba(255,138,76,0.28), rgba(255,209,102,0.12))", border: "3px solid rgba(255,138,76,0.55)" },
    h("div", { width: 78, height: 104, borderRadius: "50% 50% 46% 46%", backgroundImage: "linear-gradient(180deg, #ffd166, #ff7a45 60%, #e8452c)", alignItems: "flex-end", justifyContent: "center", paddingBottom: 12 },
      h("div", { width: 34, height: 48, borderRadius: "50% 50% 46% 46%", backgroundColor: "#fff1c9" })));
  if (!v) {
    return frame([
      brandRow(mark, pill("BURN TO VOTE", acc), "CirclePad · Circle's Arc"),
      h("div", { alignItems: "center", gap: 40 }, flame,
        h("div", { flexDirection: "column", gap: 14 },
          h("div", { fontSize: 80, fontWeight: 800, lineHeight: 1.05 }, "1 vote = 1,000 $ARCIRCLE"),
          h("div", { fontSize: 34, color: "#b9c8b3" }, "Burned for good. Anyone holding $ARCIRCLE can vote."))),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/circle"),
    ]);
  }
  const lab = (it) => it.cat === 1 ? "$" + clip(String(it.text || "").replace(/^\$/, ""), 12) : it.cat === 2 ? "a logo" : it.cat === 3 ? "a roadmap" : it.cat === 4 ? (isNaN(new Date(it.text)) ? clip(it.text, 20) : new Date(it.text).toISOString().slice(0, 10)) : clip(it.text, 24);
  const main = v.items[0];
  const burned = (v.votes * 1000).toLocaleString("en-US");
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "16px 24px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 20, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 38, fontWeight: 800, color }, value));
  return frame([
    brandRow(mark, pill("VOTED", acc), "CirclePad Round #1 · Circle's Arc"),
    h("div", { alignItems: "center", gap: 40, width: "100%" }, flame,
      h("div", { flexDirection: "column", gap: 10 },
        h("div", { fontSize: 30, color: acc, fontWeight: 700 }, `${main.category} · ${v.voter.slice(0, 6)}…${v.voter.slice(-4)}`),
        h("div", { fontSize: 76, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `${burned} $ARCIRCLE burned`),
        h("div", { fontSize: 36, color: "#eaf2e6" }, `to vote for ${lab(main)}${v.items.length > 1 ? ` + ${v.items.length - 1} more` : ""}`))),
    h("div", { gap: 16 },
      box("Votes", String(v.votes), acc),
      box("Per vote", "1,000"),
      box("Sent to", "0x…dEaD")),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 22, color: "#9fb098" },
      h("div", {}, "Burn to vote · no refunds, no changes"),
      h("div", { color: "#eaf2e6", fontWeight: 700 }, "arcircle.app/circle")),
  ]);
}

// ---- veARCIA: one wallet's stake (/vearcia/<wallet>) ----
async function veaCard(mark, user) {
  let d = null;
  try { d = await veaCardOf(user); } catch { d = null; }
  const pink = "#ff8bd8", blue = "#8fa8ff", g = "#39ff88";
  const big = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : Number(n || 0).toFixed(0));
  const p = d && d.position;
  if (!p) {
    return frame([
      brandRow(mark, pill("veARCIA", pink), "veARCIA · Robinhood Chain"),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 92, fontWeight: 800, lineHeight: 1.02 }, "Stake $ARCIA."),
        h("div", { fontSize: 34, color: "#b9b0c8" }, "1 to 20 days · $ARCIA rewards every second · up to 4x with a long lock and $ARCIRCLE")),
      h("div", { fontSize: 26, color: "#b9b0c8" }, "arcircle.app/arc#vearcia"),
    ]);
  }
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "16px 24px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,139,216,0.25)" },
    h("div", { fontSize: 20, color: "#b9b0c8", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 38, fontWeight: 800, color }, value));
  const lock = p.auto ? `${p.lockDays}d · auto-renew` : p.end > Math.floor(Date.now() / 1000) ? `until ${new Date(p.end * 1000).toISOString().slice(0, 10)}` : "ended";
  return frame([
    brandRow(mark, pill(d.tierName ? d.tierName.toUpperCase() : "STAKER", pink), "veARCIA · Robinhood Chain"),
    h("div", { flexDirection: "column", gap: 10 },
      h("div", { fontSize: 32, color: pink, fontWeight: 700 }, `${(p.lockBps / 10000).toFixed(2)}x lock${p.tier ? ` · ${[1, 1.2, 1.5, 2][p.tier]}x $ARCIRCLE boost` : ""}`),
      h("div", { fontSize: 104, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `${big(p.ve)} veARCIA`),
      h("div", { fontSize: 30, color: "#c9c0d8" }, `${big(p.amount)} $ARCIA staked · rewards every second`)),
    h("div", { gap: 16 },
      box("Rank", d.rank ? `#${d.rank}${d.stakers ? ` of ${d.stakers}` : ""}` : "—", blue),
      box("Received", `${big(d.received || 0)} $ARCIA`, g),
      box("Lock", lock, pink)),
  ]);
}

// ---- ARCIRCLE Staking: one wallet's lock (/stake/<wallet>) ----
async function stakeCard(mark, user) {
  let d = null;
  try { d = await stakeCardOf(user); } catch { d = null; }
  const v = "#b58bff", g = "#39ff88";
  const big = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(0));
  if (!d || !(d.lock && d.lock.amount > 0)) {
    return frame([
      brandRow(mark, pill("STAKING", v), "ARCIRCLE Staking · Circle's Arc"),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 92, fontWeight: 800, lineHeight: 1.02 }, "Lock $ARCIRCLE."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Earn USDC every week. Vote on where ARCIRCLE PAD goes.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/arc#staking"),
    ]);
  }
  const L = d.lock;
  const until = L.max ? "Max lock" : new Date(L.end * 1000).toISOString().slice(0, 10);
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "16px 24px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 20, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 38, fontWeight: 800, color }, value));
  return frame([
    brandRow(mark, pill(d.tier ? d.tier.name.toUpperCase() + (L.max ? " · MAX" : "") : "STAKER", v), "ARCIRCLE Staking · Circle's Arc"),
    h("div", { flexDirection: "column", gap: 10 },
      h("div", { fontSize: 32, color: v, fontWeight: 700 }, L.max ? "Locked for good, at full power" : `Locked until ${until}`),
      h("div", { fontSize: 104, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `${big(L.amount)} $ARCIRCLE`),
      h("div", { fontSize: 30, color: "#b9c8b3" }, `${big(d.ve)} veARCIRCLE · USDC every week · a say in the pool vote`)),
    h("div", { gap: 16 },
      box("Rank", d.rank ? `#${d.rank}${d.stakers ? ` of ${d.stakers}` : ""}` : "—"),
      box("Earned (8 weeks)", `$${(d.earned || 0).toFixed(2)}`, g),
      box("Lock", until, v)),
  ]);
}

// ---- ARCIRCLE NFT Vault: a raffle (/nft/<n>) or the vault (/nft/vault) ----
async function nftCard(mark, id) {
  const pink = "#ff8bd8", g = "#39ff88";
  let s = null;
  try { const N = await import("./_nft.mjs"); s = await N.state({ store: storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null }); } catch { s = null; }
  const eth = (n) => (n == null ? "—" : `${Number(n).toFixed(n > 0 && n < 0.01 ? 4 : 3)} ETH`);
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "16px 24px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 20, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 36, fontWeight: 800, color }, value));
  const p = s && Array.isArray(s.prizes) && /^\d+$/.test(String(id)) ? s.prizes.find((x) => x.i === Number(id)) : null;
  if (!p) {
    return frame([
      brandRow(mark, pill("NFT VAULT", pink), "ARCIRCLE NFT Vault · Robinhood Chain"),
      h("div", { flexDirection: "column", gap: 14 },
        h("div", { fontSize: 30, color: pink, fontWeight: 700 }, "Trading fees buy NFTs. Holders win them."),
        h("div", { fontSize: 112, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, s && s.live ? eth(s.balance) : "NFT Vault"),
        h("div", { fontSize: 30, color: "#b9c8b3" }, s && s.next ? `in the vault · next NFT up to ${eth(s.next.price)}` : "in the vault · raffled to $ARCIRCLE holders, drawn on-chain")),
      h("div", { gap: 16 }, box("NFTs bought", String(s ? s.bought || 0 : 0)), box("NFTs won", String(s ? s.won || 0 : 0), g), box("Flagship", "$ARCIA", "#d9ff7a")),
    ]);
  }
  const pic = p.image ? (await fetchImage(p.image, 3500)) || (await coinLogo(p.image)) : null;
  const r = p.raffle || {};
  const title = clip(p.title || `${p.name || short(p.collection)} #${p.tokenId}`, 26);
  const status = p.status === "won" ? ["WON", g] : p.status === "open" ? ["RAFFLE OPEN", pink] : p.status === "drawn" ? ["DRAWN", "#ffd166"] : ["IN THE VAULT", "#9fb098"];
  const left = r.drawAfter && s.now ? Math.max(0, r.drawAfter - s.now) : 0;
  const line = p.status === "won" ? `Won by ${short(r.winner)} · drawn on-chain` : p.status === "open" ? (left > 0 ? `Draw in ${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m · ${r.holders || "—"} wallets in` : "Drawing now") : "Raffled to $ARCIRCLE holders next";
  return frame([
    brandRow(mark, pill(status[0], status[1]), `ARCIRCLE NFT Vault · raffle #${p.i}`),
    h("div", { gap: 40, alignItems: "center" },
      h("div", { width: 300, height: 300, borderRadius: 32, overflow: "hidden", border: `3px solid ${status[1]}`, backgroundColor: "rgba(255,139,216,0.08)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
        pic ? img(pic, { width: 300, height: 300, objectFit: "cover" }) : h("div", { fontSize: 90, fontWeight: 800, color: pink }, `#${p.tokenId}`)),
      h("div", { flexDirection: "column", gap: 14, flex: 1 },
        h("div", { fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }, title),
        h("div", { fontSize: 32, color: status[1], fontWeight: 700 }, line),
        h("div", { gap: 14, marginTop: 8 }, box("Bought for", p.donated ? "Donated" : eth(p.paid)), box("Wallets", r.holders != null ? String(r.holders) : "—")))),
    h("div", { fontSize: 24, color: "#9fb098" }, "arcircle.app/arc#nft · trading fees buy it, a holder wins it"),
  ]);
}

// ---- ARCIRCLE Predict: one round's result (/predict/<round>?u=0x…) ----
async function predictCard(mark, id, user, c) {
  let d = null;
  try { d = await predictFor(c).roundCard(id, user); } catch { d = null; }
  const up = "#39ff88", down = "#ff5c8a";
  const rh = c === "rh", where = rh ? "ARCIRCLE Predict · Robinhood Chain" : where;
  // amounts: dollars on Arc (USDC); ETH on Robinhood Chain
  const money = (x, dp = 2) => (rh ? `${Number(x || 0).toLocaleString("en-US", { maximumFractionDigits: x >= 1 ? 3 : 5 })} ETH` : `$${Number(x || 0).toFixed(dp)}`);
  if (!d || d.result === "open") {
    return frame([
      brandRow(mark, pill("PREDICT", up), where),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 92, fontWeight: 800, lineHeight: 1.02 }, d ? `$${clip(d.sym, 12)} — round live` : "UP or DOWN?"),
        h("div", { fontSize: 34, color: "#9fb098" }, rh ? "Call a Pons coin's next minutes. The pool decides. Paid in ETH." : "Call an Arc token's next minutes. The pool decides. Paid in USDC.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/arc#predict"),
    ]);
  }
  const dur = d.duration % 3600 === 0 ? `${d.duration / 3600}h` : `${d.duration / 60}m`;
  const ch = d.open && d.close ? (d.close / d.open - 1) * 100 : null;
  const won = d.result === "up" ? up : d.result === "down" ? down : "#8fc7ff";
  const stamp = d.result === "refund" ? "REFUND" : `${d.result === "up" ? "UP" : "DOWN"} WON`;
  const me = d.bet;
  const headline = me ? (d.result === "refund" ? "Stake back" : me.won ? `+${money(me.payout - me.stake)}` : `Called ${me.side.toUpperCase()}`) : stamp;
  const box = (label, value, color = "#eaf2e6") => h("div", { flexDirection: "column", gap: 6, padding: "16px 24px", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)" },
    h("div", { fontSize: 20, color: "#9fb098", textTransform: "uppercase", letterSpacing: 2 }, label),
    h("div", { fontSize: 38, fontWeight: 800, color }, value));
  return frame([
    brandRow(mark, pill(stamp, won), where),
    h("div", { flexDirection: "column", gap: 10 },
      h("div", { fontSize: 32, color: won, fontWeight: 700 }, `$${clip(d.sym, 14)} · ${dur} round #${d.id}`),
      h("div", { fontSize: 104, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: me && me.won ? up : "#eaf2e6" }, headline),
      h("div", { fontSize: 30, color: "#b9c8b3" }, me ? `${me.side.toUpperCase()} with ${money(me.stake)}${me.won ? ` · paid ${money(me.payout)}` : ""}` : "The pool decided. Winners split the pot.")),
    h("div", { gap: 16 },
      box("Move", ch == null ? "—" : `${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(2)}%`, ch == null ? "#eaf2e6" : ch >= 0 ? up : down),
      box("Pot", money(d.pot)),
      box("UP / DOWN", rh ? `${Math.round((d.up / Math.max(1e-18, d.up + d.down)) * 100)}% / ${Math.round((d.down / Math.max(1e-18, d.up + d.down)) * 100)}%` : `$${d.up.toFixed(0)} / $${d.down.toFixed(0)}`)),
  ]);
}
