// api/_dexstats.mjs — 24h trading numbers from Dexscreener for coins whose trades ArcPad doesn't read itself
// (Pons coins on Robinhood Chain, Pump.fun coins on Solana): volume, change, buys / sells, liquidity.
// One request per 30 tokens (Dexscreener's tokens/v1 limit), the result kept a minute per chain.
const mem = new Map();
const TTL = 60e3;
/// chain: "robinhood" | "solana" · tokens: addresses → Map(lowercase address (mint as is) → stats)
export async function dexStats(chain, tokens, { timeoutMs = 3500 } = {}) {
  const out = new Map();
  const key = (t) => (chain === "solana" ? String(t) : String(t).toLowerCase());
  const want = [...new Set((tokens || []).filter(Boolean).map(key))];
  const need = [];
  for (const t of want) { const hit = mem.get(chain + ":" + t); if (hit && Date.now() - hit.at < TTL) { if (hit.v) out.set(t, hit.v); } else need.push(t); }
  for (let i = 0; i < need.length; i += 30) {
    const part = need.slice(i, i + 30);
    let pairs = null;
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${part.join(",")}`, { signal: ctl.signal }).finally(() => clearTimeout(tm));
      pairs = r.ok ? await r.json() : null;
    } catch { pairs = null; }
    if (!Array.isArray(pairs)) continue; // offline: try again next time
    const best = new Map();
    for (const p of pairs) {
      const t = p && p.baseToken && key(p.baseToken.address);
      if (!t || !part.includes(t)) continue;
      const cur = best.get(t);
      if (!cur || ((p.liquidity && p.liquidity.usd) || 0) > ((cur.liquidity && cur.liquidity.usd) || 0)) best.set(t, p);
    }
    for (const t of part) {
      const p = best.get(t);
      const v = p ? {
        vol24: Number((p.volume && p.volume.h24) || 0), vol1h: Number((p.volume && p.volume.h1) || 0),
        chg24: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null, chg1h: p.priceChange && p.priceChange.h1 != null ? Number(p.priceChange.h1) : null,
        buys24: Number((p.txns && p.txns.h24 && p.txns.h24.buys) || 0), sells24: Number((p.txns && p.txns.h24 && p.txns.h24.sells) || 0),
        trades1h: Number((p.txns && p.txns.h1 && (p.txns.h1.buys || 0) + (p.txns.h1.sells || 0)) || 0),
        liqUsd: p.liquidity && p.liquidity.usd != null ? Number(p.liquidity.usd) : null, pair: p.pairAddress || null, dex: p.dexId || null,
      } : null;
      mem.set(chain + ":" + t, { at: Date.now(), v });
      if (v) out.set(t, v);
    }
  }
  if (mem.size > 4000) mem.clear();
  return out;
}
/// the stats merged onto list items (field `stats`), by the item's address field
export async function withDexStats(chain, items, field) {
  const m = await dexStats(chain, items.map((x) => x[field])).catch(() => new Map());
  return items.map((x) => { const s = m.get(chain === "solana" ? String(x[field]) : String(x[field]).toLowerCase()); return s ? { ...x, stats: s } : x; });
}
