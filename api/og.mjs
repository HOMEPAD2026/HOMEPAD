// api/og.mjs — 1200×630 share image for an ArcPad coin: logo, ticker, live
// price and market cap, read from Arc at request time (edge-cached 5 min).
//   GET /api/og?addr=0x…   → PNG
//   GET /api/og?round=1[&w=0x…]  → CirclePad round card (optionally "0x… is in")
//   GET /api/og?scan=0x…   → Token Scanner result card (score, verdict, main reasons)
// Used as og:image / twitter:image by the /c/<address> share page.
import { ImageResponse } from "@vercel/og";
import { getCoin, isAddr, fmtUsd, SITE } from "./_arc.mjs";
import { roundState, contributionOf } from "./_round.mjs";
import { scanToken } from "./_scan.mjs";
import { receipt as dropReceipt } from "./_drop.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";

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
  if (url.searchParams.has("drop")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await dropCard(await markP, url.searchParams.get("drop")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    });
  }
  if (url.searchParams.has("scan")) {
    const fonts = (await fontsP).filter(Boolean);
    return new ImageResponse(await scanCard(await markP, url.searchParams.get("scan")), {
      width: W, height: H, ...(fonts.length ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" },
    });
  }
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
      brandRow(mark, justLaunched ? pill("JUST LAUNCHED", "#ffd166") : pill("LIVE ON UNISWAP V4", "#39ff88")),
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

// ---------------- CirclePad round card ----------------
const num = (n) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 });
async function roundCard(mark, w) {
  let st = null, mine = 0n;
  try { st = await roundState(); } catch { st = null; }
  if (st && isAddr(w)) { try { mine = await contributionOf(w); } catch { mine = 0n; } }
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
    ? [h("div", { fontSize: 34, color: "#b9c8b3" }, `${w.slice(0, 6)}…${w.slice(-4)} is in the circle`),
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
async function scanCard(mark, addr) {
  let out = null;
  if (isAddr(addr)) {
    const store = storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null;
    try { out = await scanToken(addr, { store, budgetMs: 4500 }); } catch { out = null; }
  }
  const res = out && out.res, c = out && out.c;
  if (!res || res.notToken || !c) {
    return frame([
      brandRow(mark, pill("TOKEN SCANNER", "#4d9fff"), "Token Scanner · Circle's Arc"),
      h("div", { flexDirection: "column", gap: 16 },
        h("div", { fontSize: 88, fontWeight: 800, lineHeight: 1.05 }, "Check any Arc token."),
        h("div", { fontSize: 34, color: "#9fb098" }, "Contract, owner powers, a dry-run sell, liquidity and holders — in one score.")),
      h("div", { fontSize: 26, color: "#9fb098" }, "arcircle.app/scanner"),
    ]);
  }
  const col = res.verdict.k === "ok" ? "#39ff88" : res.verdict.k === "care" ? "#ffc861" : "#ff6e5a";
  const sym = clip(c.symbol || "TOKEN", 12);
  const reasons = res.reasons.slice(0, 3).map((r) => h("div", { alignItems: "center", gap: 16, fontSize: 32, color: "#eaf2e6" },
    h("div", { width: 18, height: 18, borderRadius: 99, backgroundColor: r.status === "risk" ? "#ff6e5a" : r.status === "warn" ? "#ffc861" : "#39ff88" }),
    h("div", {}, clip(r.title, 34))));
  const ring = h("div", { width: 300, height: 300, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "column",
    border: `22px solid ${col}`, boxShadow: `0 0 60px ${col}55`, backgroundColor: "rgba(0,0,0,0.35)" },
    h("div", { fontSize: 110, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }, String(res.score)),
    h("div", { fontSize: 26, color: "#9fb098" }, "/ 100"));
  return frame([
    brandRow(mark, pill(res.verdict.t.toUpperCase(), col), "Token Scanner · Circle's Arc"),
    h("div", { alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { flexDirection: "column", gap: 14, maxWidth: 700 },
        h("div", { fontSize: sym.length > 8 ? 84 : 100, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }, `$${sym}`),
        h("div", { fontSize: 30, color: "#b9c8b3", marginBottom: 14 }, clip(c.name || "", 34)),
        reasons),
      ring),
    h("div", { justifyContent: "space-between", width: "100%", fontSize: 24, color: "#9fb098" },
      h("div", {}, `arcircle.app/s/${addr.slice(0, 6)}…${addr.slice(-4)} · automated check, not advice`),
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
  const extras = [d.f && d.f.hold ? `held for ${Math.round(d.f.hold / 3600) >= 48 ? Math.round(d.f.hold / 86400) + " days" : Math.round(d.f.hold / 3600) + "h"}` : "", d.f && d.f.locks ? "locked tokens count" : "", d.by ? `signed by ${d.by.slice(0, 6)}…${d.by.slice(-4)}` : ""].filter(Boolean).join(" · ");
  const bars = Array.from({ length: 16 }, (_, i) => h("div", { width: 16, height: 30 + Math.round(150 * Math.pow(0.84, i)), borderRadius: 5, backgroundColor: i < 3 ? "#ff8bd8" : i < 9 ? acc : "#7c9cff", opacity: done ? 1 : 0.35 }));
  return frame([
    brandRow(mark, pill(done ? "SNAPSHOT" : "SCHEDULED", acc), "Snapshot · Circle's Arc"),
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
