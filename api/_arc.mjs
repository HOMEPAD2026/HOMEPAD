// api/_arc.mjs — tiny read-only Arc client shared by the share-page and
// OG-image functions (files starting with "_" are not deployed as routes).
// Plain JSON-RPC + hand-rolled ABI decoding, so the edge bundle stays small:
// no ethers, just keccak from @noble/hashes for the Uniswap v4 pool id.
import { keccak_256 } from "@noble/hashes/sha3.js";

export const SITE = "https://www.arcircle.app";
const RPC = (typeof process !== "undefined" && process.env && process.env.ARC_RPC_URL) || "https://rpc.mainnet.arc.io";
const FACTORY = "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const ARCIRCLE = "0x933a94b475fa9d8ef94fa564e38dda400a595aa1";
const ARCIRCLE_CURVE = "0xa37A96C43e2335553BD79171DE6dB2806414AC64";
const SEL = {
  launchIndexOf: "0x08b74625", launches: "0x7b443a76", poolKeyOf: "0x8652edf9", launchCount: "0x27cca59f",
  name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567", extsload: "0x1e2eaeaf", getReserves: "0x0902f1ac",
};

export const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const strip = (h) => String(h).replace(/^0x/, "");
const pad = (h) => strip(h).toLowerCase().padStart(64, "0");
const word = (hex, i) => strip(hex).slice(i * 64, (i + 1) * 64);
const wAddr = (hex, i) => "0x" + word(hex, i).slice(24);
const wBig = (hex, i) => BigInt("0x" + (word(hex, i) || "0"));
function wString(hex, i) {
  const h = strip(hex);
  const off = Number(BigInt("0x" + word(h, i))) * 2;
  const len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
  const bytes = h.slice(off + 64, off + 64 + len);
  const arr = new Uint8Array(bytes.length / 2);
  for (let k = 0; k < arr.length; k++) arr[k] = parseInt(bytes.slice(k * 2, k * 2 + 2), 16);
  return new TextDecoder().decode(arr);
}
const decodeString = (hex) => { try { return strip(hex).length >= 128 ? wString(hex, 0) : ""; } catch { return ""; } };
function hexToBytes(h) { h = strip(h); const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; }
const keccakHex = (h) => "0x" + Array.from(keccak_256(hexToBytes(h)), (b) => b.toString(16).padStart(2, "0")).join("");

/// One JSON-RPC batch of eth_calls → array of hex results (null on error).
export async function ethCalls(calls, { timeoutMs = 6000 } = {}) {
  const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
    const out = await r.json();
    const arr = Array.isArray(out) ? out : [out];
    const byId = new Map(arr.map((x) => [x.id, x]));
    return calls.map((_, i) => { const x = byId.get(i); return x && x.result && x.result !== "0x" ? x.result : null; });
  } finally { if (t) clearTimeout(t); }
}

function priceInQuote(sqrt, quoteIsCurrency0, dec) {
  if (!sqrt) return null;
  const sp = Number(sqrt) / 2 ** 96;
  const raw = sp * sp;
  const scale = Math.pow(10, 18 - dec);
  const p = quoteIsCurrency0 ? scale / raw : raw * scale;
  return Number.isFinite(p) && p > 0 ? p : null;
}

/// Everything a share card needs about an ArcPad coin, read live from Arc.
/// Returns null when the address isn't an ArcPad launch.
export async function getCoin(addr) {
  if (!isAddr(addr)) return null;
  const [idxHex] = await ethCalls([{ to: FACTORY, data: SEL.launchIndexOf + pad(addr) }]);
  const idx = idxHex ? Number(BigInt(idxHex)) : 0;
  if (!idx) return null;
  const [rec, nameHex, symHex, keyHex] = await ethCalls([
    { to: FACTORY, data: SEL.launches + pad((idx - 1).toString(16)) },
    { to: addr, data: SEL.name }, { to: addr, data: SEL.symbol },
    { to: FACTORY, data: SEL.poolKeyOf + pad(addr) },
  ]);
  if (!rec) return null;
  const l = {
    token: wAddr(rec, 0), quoteToken: wAddr(rec, 1), quoteIsCurrency0: wBig(rec, 3) !== 0n, creator: wAddr(rec, 4),
    launchedAt: Number(wBig(rec, 5)), extraFeeBps: Number(wBig(rec, 6)),
    imageUrl: wString(rec, 7), description: wString(rec, 8),
    name: decodeString(nameHex), symbol: decodeString(symHex),
  };
  const q = l.quoteToken.toLowerCase();
  l.quoteIsUsdc = q === USDC.toLowerCase();
  l.quoteSymbol = l.quoteIsUsdc ? "USDC" : q === ARCIRCLE ? "ARCIRCLE" : "";
  // pool state: sqrtPriceX96 from the PoolManager's storage
  let sqrt = null;
  if (keyHex) {
    const poolId = keccakHex(strip(keyHex).slice(0, 5 * 64));
    const slot = keccakHex(strip(poolId) + pad("6"));
    const calls = [{ to: POOL_MANAGER, data: SEL.extsload + strip(slot) }];
    if (!l.quoteIsUsdc) calls.push({ to: l.quoteToken, data: SEL.decimals }, { to: l.quoteToken, data: SEL.symbol });
    if (q === ARCIRCLE) calls.push({ to: ARCIRCLE_CURVE, data: SEL.getReserves });
    const r = await ethCalls(calls);
    if (r[0]) sqrt = BigInt(r[0]) & ((1n << 160n) - 1n);
    l.quoteDecimals = l.quoteIsUsdc ? 6 : r[1] ? Number(BigInt(r[1])) : 18;
    if (!l.quoteIsUsdc && r[2]) l.quoteSymbol = decodeString(r[2]) || l.quoteSymbol;
    if (q === ARCIRCLE && r[3]) {
      const qr = Number(wBig(r[3], 0)) / 1e6, tr = Number(wBig(r[3], 1)) / 1e18;
      l.quoteUsd = tr > 0 ? qr / tr : null;
    }
  }
  if (l.quoteIsUsdc) l.quoteUsd = 1;
  l.priceInQuote = priceInQuote(sqrt, l.quoteIsCurrency0, l.quoteDecimals ?? 6);
  l.priceUsd = l.priceInQuote != null && l.quoteUsd != null ? l.priceInQuote * l.quoteUsd : null;
  l.mcapUsd = l.priceUsd != null ? l.priceUsd * 1e9 : null;
  return l;
}

export function fmtUsd(n, { plain = false } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  if (n >= 1) return "$" + n.toFixed(2);
  if (n <= 0) return "$0";
  // $0.0₅4563 style: count the zeros after the point
  const s = n.toFixed(20).slice(2);
  const z = s.match(/^0*/)[0].length;
  const sig = s.slice(z, z + 4).replace(/0+$/, "") || "0";
  if (z < 4 || plain) return "$" + n.toFixed(Math.min(z + 4, 20)).replace(/0+$/, "");
  const sub = String(z).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("");
  return `$0.0${sub}${sig}`;
}
export const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
