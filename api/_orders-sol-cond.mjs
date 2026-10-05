// api/_orders-sol-cond.mjs — the order types ARCIRCLE Orders on Solana adds on top of its program (v8).
//
// The program (solana/arcircle-orders) knows one thing: an order may be filled once its owner gets at least `min_out`.
// Every other order type is a condition the keeper waits for before it fills — the program's floor still holds:
//   stop   sell when the price falls to `trig` (or buy when it rises to it); min_out is the worst price the owner accepts
//   tpsl   one sell order, two exits: take profit at `tp` or stop the loss at `sl` (min_out sits under `sl`)
//   trail  a sell that follows the price up: fills once the price drops `trail` (bps) below the highest price seen
//   time   waits until `notBefore` (Timed buys / DCA: one order per step, each with its own start time)
//   grad   a Pump.fun coin: fills once its bonding curve completes (it graduates to its pool)
//   curve  a Pump.fun coin: fills once the bonding curve is `curve`% of the way to graduating
// Any type can also carry `notBefore` (Launch guard: nothing fills in a new coin's first minutes).
//
// Conditions are kept by the server (store doc COND_DOC), keyed by the order's address. Only the owner can set one: they
// sign a plain message with their Solana wallet (no transaction, no fee) before the order is placed — the order's
// address comes from the owner and the order's nonce, so the condition is in place before the order exists.
import { ed25519 } from "@noble/curves/ed25519.js";

export const COND_DOC = "orderssol/cond";
export const HEAD = "ARCIRCLE Orders on Solana — order conditions";
export const KINDS = ["stop", "tpsl", "trail", "time", "grad", "curve"];
export const MAX_ITEMS = 24;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58dec(s) {
  let n = 0n;
  for (const c of String(s || "")) { const i = B58.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of String(s || "")) { if (c !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}
const isKey = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || "")) && (b58dec(s) || []).length === 32;
const pos = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);

/// the message the owner signs: a header, the owner, the time, then one line per order: "<order address> <condition json>"
export function message(owner, at, items) {
  return [HEAD, `owner: ${owner}`, `at: ${at}`, ...items.map((x) => `${x.order} ${JSON.stringify(x.cond)}`)].join("\n");
}
export function parseMessage(msg) {
  const lines = String(msg || "").split("\n");
  if (lines[0] !== HEAD) return null;
  const owner = (/^owner: (\S+)$/.exec(lines[1] || "") || [])[1], at = Number((/^at: (\d+)$/.exec(lines[2] || "") || [])[1]);
  if (!isKey(owner) || !(at > 0)) return null;
  const items = [];
  for (const l of lines.slice(3)) {
    const i = l.indexOf(" ");
    if (i < 0) return null;
    const order = l.slice(0, i);
    let cond; try { cond = JSON.parse(l.slice(i + 1)); } catch { return null; }
    if (!isKey(order) || !cond || typeof cond !== "object") return null;
    items.push({ order, cond });
  }
  return items.length && items.length <= MAX_ITEMS ? { owner, at, items } : null;
}
export function verify(owner, msg, sigB64) {
  try {
    const sig = Uint8Array.from(Buffer.from(String(sigB64 || ""), "base64"));
    const pub = b58dec(owner);
    return sig.length === 64 && pub && pub.length === 32 && ed25519.verify(sig, new TextEncoder().encode(msg), pub);
  } catch { return false; }
}

/// a condition from a signed line → the stored shape, or { error }
export function normalize(c) {
  const kind = String(c.kind || "");
  if (kind === "none") return { kind: "none" };
  if (!KINDS.includes(kind)) return { error: "unknown order type" };
  const side = c.side === "buy" ? "buy" : c.side === "sell" ? "sell" : null;
  if (!side) return { error: "side" };
  let nonce; try { nonce = BigInt(String(c.nonce)); } catch { return { error: "nonce" }; }
  if (nonce < 0n || nonce >= 2n ** 64n) return { error: "nonce" };
  const out = { kind, side, nonce: nonce.toString() };
  const nb = Number(c.notBefore || 0);
  if (nb) { if (!(nb > 1.6e9 && nb < 4e9)) return { error: "start time" }; out.notBefore = Math.floor(nb); }
  if (kind === "stop") { if (!pos(c.trig)) return { error: "trigger price" }; out.trig = c.trig; }
  if (kind === "tpsl") {
    if (side !== "sell") return { error: "TP / SL is a sell" };
    if (!pos(c.tp) || !pos(c.sl) || !(c.tp > c.sl)) return { error: "take profit must be above the stop loss" };
    out.tp = c.tp; out.sl = c.sl;
  }
  if (kind === "trail") {
    if (side !== "sell") return { error: "a trailing stop is a sell" };
    const t = Math.round(Number(c.trail));
    if (!(t >= 50 && t <= 5000)) return { error: "trail between 0.5% and 50%" };
    if (!pos(c.hi)) return { error: "start price" };
    out.trail = t; out.hi = c.hi;
  }
  if (kind === "time" && !out.notBefore) return { error: "start time" };
  if (kind === "curve") { const p = Number(c.curve); if (!(p >= 1 && p <= 99)) return { error: "curve progress between 1% and 99%" }; out.curve = p; }
  return out;
}

/// is it time? px: the price the fill would get (SOL per token, from the quote); spot: the market price (prefilter);
/// curve: { complete, progress } for a Pump.fun coin. Returns { go } or { wait: why }.
export function gate(c, { px = null, now = Math.floor(Date.now() / 1000), curve = null } = {}) {
  if (!c) return { go: true };
  if (c.notBefore && now < c.notBefore) return { wait: "starts later" };
  const p = pos(px);
  switch (c.kind) {
    case "time": return { go: true };
    case "grad": return curve && curve.complete ? { go: true } : { wait: curve ? "on the curve" : "not a Pump.fun coin" };
    case "curve": return curve && (curve.complete || curve.progress >= c.curve) ? { go: true } : { wait: "curve below the mark" };
    case "stop": if (!p) return { wait: "no price" }; return (c.side === "sell" ? p <= c.trig : p >= c.trig) ? { go: true } : { wait: "trigger not reached" };
    case "tpsl": if (!p) return { wait: "no price" }; return p >= c.tp || p <= c.sl ? { go: true } : { wait: "between take profit and stop loss" };
    case "trail": if (!p) return { wait: "no price" }; return p <= c.hi * (1 - c.trail / 10000) ? { go: true } : { wait: "trailing" };
    default: return { go: true };
  }
}
/// the cheap check from the market price before the keeper asks Jupiter for a quote (3% of room for the size)
export function near(c, spot) {
  if (!c) return true;
  const s = pos(spot);
  if (!s) return true;
  if (c.kind === "stop") return c.side === "sell" ? s <= c.trig * 1.03 : s >= c.trig * 0.97;
  if (c.kind === "tpsl") return s >= c.tp * 0.97 || s <= c.sl * 1.03;
  if (c.kind === "trail") return s <= c.hi * (1 - c.trail / 10000) * 1.03;
  return true;
}
/// a short line for the page: what the order waits for
export function label(c) {
  if (!c) return "";
  const nb = c.notBefore ? ` · from ${new Date(c.notBefore * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC` : "";
  switch (c.kind) {
    case "stop": return `Stop at ${c.trig}${nb}`;
    case "tpsl": return `TP ${c.tp} · SL ${c.sl}${nb}`;
    case "trail": return `Trailing ${c.trail / 100}% under ${c.hi}${nb}`;
    case "time": return `Starts${nb.replace(" · from", "")}`;
    case "grad": return `When it graduates${nb}`;
    case "curve": return `At ${c.curve}% of the curve${nb}`;
    default: return "";
  }
}
