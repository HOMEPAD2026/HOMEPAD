// api/_locker.mjs — ArcLock (Locker) reads for the server: one lock's certificate
// (/lock/<id>, its share card and the embeddable badge) and the Locker dashboard
// (every lock ever made, grouped by token). ArcLock has no events we need here:
// lockCount() + getLock(id) cover everything, batched into JSON-RPC calls.
// Two chains (Oct 2026): Arc, and Robinhood Chain (chain "rh") — the same ArcLock contract deployed there
// (config-arc.js ARCLOCK_RH_ADDRESS, or env ARCLOCK_RH_ADDRESS). Until it's set, Robinhood Chain answers
// "not live" (live: false) and the page shows it as opening soon.
import { ethCalls as arcCalls, getCoin, isAddr, keccakHex, pad, strip, wAddr, wBig, latestBlock as arcLatest } from "./_arc.mjs";
import { ARCIRCLE_TOKEN, ARCIRCLE_POOL_ID, arcircleUsd } from "./_arcircle.mjs";
import { evmChain } from "./_evm.mjs";
import { RH_CFG } from "./_snap-rh.mjs";

export const ARCLOCK = "0x64F893947Fe2c4fe7058CFba899eA269CBa9F006"; // config-arc.js ARCLOCK_ADDRESS
export const ARCLOCK_RH_DEFAULT = ""; // config-arc.js ARCLOCK_RH_ADDRESS — keep in step
const envOf = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
let rhCh = null;
const rh = () => (rhCh = rhCh || evmChain({ rpcs: () => RH_CFG.rpcs(), chainId: 4663, timeoutMs: 12000 }));
/// the chain's ArcLock and its reads
export function chainOf(c) {
  if (c === "rh") {
    const a = envOf("ARCLOCK_RH_ADDRESS") || ARCLOCK_RH_DEFAULT;
    return { id: "rh", pre: "rh:", lock: isAddr(a) ? a : "", ethCalls: (calls, o) => rh().ethCalls(calls, o), latestBlock: () => rh().latestBlock() };
  }
  return { id: "arc", pre: "", lock: ARCLOCK, ethCalls: arcCalls, latestBlock: arcLatest };
}
const USDC = "0x3600000000000000000000000000000000000000";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const lc = (a) => String(a || "").toLowerCase();
const hexOf = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
const sel = (sig) => keccakHex(hexOf(sig)).slice(0, 10);
const S = {
  lockCount: sel("lockCount()"), getLock: sel("getLock(uint256)"), locksOfToken: sel("locksOfToken(address)"),
  symbol: sel("symbol()"), name: sel("name()"), decimals: sel("decimals()"), totalSupply: sel("totalSupply()"), extsload: sel("extsload(bytes32)"),
};
const mem = new Map();
const cached = async (k, ms, fn) => { const h = mem.get(k); if (h && Date.now() - h.at < ms) return h.v; const v = await fn(); mem.set(k, { at: Date.now(), v }); if (mem.size > 300) mem.delete(mem.keys().next().value); return v; };
function str(hex) {
  if (!hex) return "";
  const h = strip(hex);
  try {
    if (h.length >= 128) { const len = Number(BigInt("0x" + h.slice(64, 128))); return new TextDecoder().decode(Uint8Array.from(h.slice(128, 128 + len * 2).match(/../g) || [], (b) => parseInt(b, 16))); }
    return new TextDecoder().decode(Uint8Array.from((h.match(/../g) || []).filter((b) => b !== "00"), (b) => parseInt(b, 16))); // bytes32 symbols
  } catch { return ""; }
}
const decodeLock = (hex, id) => (hex && strip(hex).length >= 384 ? {
  id, token: lc(wAddr(hex, 0)), owner: lc(wAddr(hex, 1)), amount: wBig(hex, 2).toString(),
  lockedAt: Number(wBig(hex, 3)), unlockAt: Number(wBig(hex, 4)), withdrawn: wBig(hex, 5) !== 0n,
} : null);

/// symbol / name / decimals / supply of a token (cached 10 min)
export function tokenMeta(token, chain = "arc") {
  token = lc(token);
  const C = chainOf(chain);
  return cached(`${C.pre}meta:${token}`, 600e3, async () => {
    const [sy, nm, dc, ts] = await C.ethCalls([{ to: token, data: S.symbol }, { to: token, data: S.name }, { to: token, data: S.decimals }, { to: token, data: S.totalSupply }]);
    return { address: token, symbol: str(sy) || "TOKEN", name: str(nm) || "", decimals: dc ? Number(BigInt(dc)) : 18, supply: ts ? BigInt(ts).toString() : "0" };
  });
}
/// Robinhood Chain: the deepest Dexscreener pair's USD price, or null
async function dexUsd(token) {
  try {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/robinhood/${token}`, { signal: AbortSignal.timeout(5000) });
    const j = r.ok ? await r.json() : null;
    const p = (Array.isArray(j) ? j : []).filter((x) => x && x.priceUsd && x.baseToken && lc(x.baseToken.address) === token)
      .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
    return p ? Number(p.priceUsd) || null : null;
  } catch { return null; }
}
/// USD price of one token, or null: USDC, $ARCIRCLE (its Argus pool) and ArcPad coins (their pool); Dexscreener on Robinhood Chain
export function priceUsd(token, chain = "arc") {
  token = lc(token);
  if (chain === "rh") return cached(`rh:px:${token}`, 60e3, () => dexUsd(token));
  if (token === lc(USDC)) return Promise.resolve(1);
  return cached(`px:${token}`, 60e3, async () => {
    try {
      if (token === lc(ARCIRCLE_TOKEN)) {
        const slot = keccakHex(strip(ARCIRCLE_POOL_ID) + pad("6"));
        const [s0] = await arcCalls([{ to: PM, data: S.extsload + strip(slot) }]);
        return s0 ? arcircleUsd(BigInt(s0) & ((1n << 160n) - 1n)) : null;
      }
      const c = await getCoin(token);
      return c && c.priceUsd != null ? c.priceUsd : null;
    } catch { return null; }
  });
}
const pct = (amount, supply) => { const s = BigInt(supply || 0); return s > 0n ? Number((BigInt(amount) * 1000000n) / s) / 10000 : null; };
const units = (raw, dec) => Number(BigInt(raw || 0)) / 10 ** dec;

/// One lock → { id, token{…}, owner, amount, lockedAt, unlockAt, withdrawn, active, now, pctOfSupply, usd }
export async function lockInfo(idIn, chain = "arc") {
  const id = Number(idIn);
  if (!Number.isInteger(id) || id < 0 || id > 1e9) return null;
  const C = chainOf(chain);
  if (!C.lock) return null;
  return cached(`${C.pre}lock:${id}`, 30e3, async () => {
    const [[hex], head] = await Promise.all([C.ethCalls([{ to: C.lock, data: S.getLock + pad(id.toString(16)) }]), C.latestBlock().catch(() => null)]);
    const l = decodeLock(hex, id);
    if (!l) return null;
    const [token, px] = await Promise.all([tokenMeta(l.token, C.id), priceUsd(l.token, C.id)]);
    const now = head && head.ts ? head.ts : Math.floor(Date.now() / 1000);
    const usd = px != null ? units(l.amount, token.decimals) * px : null;
    return { ...l, chain: C.id, token, now, active: !l.withdrawn && l.unlockAt > now, pctOfSupply: pct(l.amount, token.supply), usd };
  });
}

/// Every lock of one token, with the totals the badge shows
export async function tokenLocks(tokenIn, chain = "arc") {
  const token = lc(tokenIn);
  if (!isAddr(token)) return null;
  const C = chainOf(chain);
  return cached(`${C.pre}tok:${token}`, 60e3, async () => {
    const [hex] = C.lock ? await C.ethCalls([{ to: C.lock, data: S.locksOfToken + pad(token) }]) : [null];
    const meta = await tokenMeta(token, C.id);
    const now = Math.floor(Date.now() / 1000);
    const locks = [];
    if (hex) {
      // (uint256[] ids, Lock[] out): two offsets, then ids, then the static structs
      const h = strip(hex), w = (i) => BigInt("0x" + (h.slice(i * 64, (i + 1) * 64) || "0"));
      const oIds = Number(w(0)) / 32, oOut = Number(w(1)) / 32, n = Number(w(oIds));
      for (let i = 0; i < n; i++) {
        const base = oOut + 1 + i * 6;
        const rec = "0x" + h.slice(base * 64, (base + 6) * 64);
        const l = decodeLock(rec, Number(w(oIds + 1 + i)));
        if (l) locks.push(l);
      }
    }
    const active = locks.filter((l) => !l.withdrawn && l.unlockAt > now);
    const total = active.reduce((s, l) => s + BigInt(l.amount), 0n);
    const next = active.length ? Math.min(...active.map((l) => l.unlockAt)) : 0;
    const last = active.length ? Math.max(...active.map((l) => l.unlockAt)) : 0;
    return { chain: C.id, live: !!C.lock, token: meta, locks: locks.length, active: active.length, locked: total.toString(), pctOfSupply: pct(total, meta.supply), nextUnlock: next, lastUnlock: last };
  });
}

/// The Locker dashboard: every lock grouped by token, the biggest (by share of supply), and what unlocks in 30 days
export async function overview(chain = "arc") {
  const C = chainOf(chain);
  if (!C.lock) return { chain: C.id, live: false, at: Math.floor(Date.now() / 1000), locksEver: 0, activeLocks: 0, tokens: 0, tvlUsd: null, top: [], soon: [] };
  return cached(`${C.pre}overview`, 60e3, async () => {
    const [cnt] = await C.ethCalls([{ to: C.lock, data: S.lockCount }]);
    const n = cnt ? Number(BigInt(cnt)) : 0;
    const all = [];
    for (let s = 0; s < Math.min(n, 2000); s += 100) {
      const ids = Array.from({ length: Math.min(100, n - s) }, (_, k) => s + k);
      const r = await C.ethCalls(ids.map((i) => ({ to: C.lock, data: S.getLock + pad(i.toString(16)) })), { timeoutMs: 9000 });
      r.forEach((hex, k) => { const l = decodeLock(hex, ids[k]); if (l) all.push(l); });
    }
    const now = Math.floor(Date.now() / 1000);
    const byTok = new Map();
    for (const l of all) {
      const t = byTok.get(l.token) || { token: l.token, locks: 0, active: 0, locked: 0n, next: 0 };
      t.locks++;
      if (!l.withdrawn && l.unlockAt > now) { t.active++; t.locked += BigInt(l.amount); t.next = t.next ? Math.min(t.next, l.unlockAt) : l.unlockAt; }
      byTok.set(l.token, t);
    }
    const toks = [...byTok.values()];
    const metas = new Map(await Promise.all(toks.map(async (t) => [t.token, await tokenMeta(t.token, C.id).catch(() => null)])));
    const prices = new Map(await Promise.all(toks.filter((t) => t.active).map(async (t) => [t.token, await priceUsd(t.token, C.id)])));
    let tvl = 0, priced = 0;
    const rows = toks.map((t) => {
      const m = metas.get(t.token) || { address: t.token, symbol: "TOKEN", name: "", decimals: 18, supply: "0" };
      const px = prices.get(t.token);
      const usd = px != null && t.locked > 0n ? units(t.locked, m.decimals) * px : null;
      if (usd != null) { tvl += usd; priced++; }
      return { token: m, locks: t.locks, active: t.active, locked: t.locked.toString(), pctOfSupply: pct(t.locked, m.supply), usd, nextUnlock: t.next };
    });
    const soon = all.filter((l) => !l.withdrawn && l.unlockAt > now && l.unlockAt <= now + 30 * 86400).sort((a, b) => a.unlockAt - b.unlockAt).slice(0, 12)
      .map((l) => { const m = metas.get(l.token); return { ...l, symbol: m ? m.symbol : "TOKEN", decimals: m ? m.decimals : 18, pctOfSupply: m ? pct(l.amount, m.supply) : null }; });
    return {
      chain: C.id, live: true, at: now, locksEver: n, activeLocks: all.filter((l) => !l.withdrawn && l.unlockAt > now).length,
      tokens: rows.filter((r) => r.active).length, tvlUsd: priced ? tvl : null,
      top: rows.filter((r) => r.active).sort((a, b) => (b.usd || 0) - (a.usd || 0) || (b.pctOfSupply || 0) - (a.pctOfSupply || 0)).slice(0, 10),
      soon,
    };
  });
}

/// Embeddable SVG: "Locked on ARCIRCLE PAD · 12.5% of supply · until 2027-03-01"
export function lockBadgeSvg(d) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const FONT = 'font-family="Verdana,DejaVu Sans,Geneva,sans-serif"';
  const on = d && d.active > 0;
  const p = d && d.pctOfSupply != null ? (d.pctOfSupply >= 10 ? d.pctOfSupply.toFixed(1) : d.pctOfSupply >= 1 ? d.pctOfSupply.toFixed(2) : d.pctOfSupply.toFixed(3)).replace(/\.?0+$/, "") : null;
  const left = "Locked on ARCIRCLE";
  const right = !d ? "unknown" : on ? `${p != null ? p + "% of supply" : "active"} · until ${new Date(d.lastUnlock * 1000).toISOString().slice(0, 10)}` : "no active lock";
  const lt = Math.round(left.length * 6.3), rt = Math.round(right.length * 7.1);
  const lw = 26 + lt + 8, rw = rt + 16, W = lw + rw;
  const col = on ? "#1f9d57" : "#5b6472";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="22" role="img" aria-label="${esc(left)}: ${esc(right)}"><title>${esc(left)}: ${esc(right)}</title>
<linearGradient id="arcl-g${W}" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="arcl-r${W}"><rect width="${W}" height="22" rx="4"/></clipPath>
<g clip-path="url(#arcl-r${W})"><rect width="${lw}" height="22" fill="#0b1320"/><rect x="${lw}" width="${rw}" height="22" fill="${col}"/><rect width="${W}" height="22" fill="url(#arcl-g${W})"/></g>
<g transform="translate(7 4)" fill="none" stroke="#39ff88" stroke-width="1.6"><rect x="0.8" y="6" width="10.4" height="8" rx="2"/><path d="M3 6V4.2a3 3 0 0 1 6 0V6"/></g>
<g fill="#fff" ${FONT} font-size="11"><text x="26" y="15" textLength="${lt}" lengthAdjust="spacingAndGlyphs">${esc(left)}</text><text x="${lw + 8}" y="15" font-weight="bold" textLength="${rt}" lengthAdjust="spacingAndGlyphs">${esc(right)}</text></g></svg>`;
}
