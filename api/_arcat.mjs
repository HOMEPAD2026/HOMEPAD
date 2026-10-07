// api/_arcat.mjs — ARCAT, ARCIA's cat (the white plush with her rings on its forehead, hiding in her photos).
// ARCAT keeps an eye on $ARCIA (Robinhood Chain) and supports it the one way that can't hurt holders: a public buyback.
//   · reads: $ARCIA's price, 24h change, buys vs sells, liquidity and holders (api/_arcia-coin.mjs), what's burned,
//     and veARCIA (api/_vearcia.mjs): staked share, stakers, the reward pool
//   · decides once an hour: buy the dip, absorb heavy selling, a small steady buy now and then — and never chase a
//     pump (+15% in 24h or more), never more than the day's budget or 0.5% of the liquidity
//   · BUYS ONLY, never sells: half of what it buys is burned (0x…dEaD), half goes to the veARCIA reward pool
//   · ARCIA's mood comes from the same numbers (and tonight's lightsticks), and ARCAT says something about it
// Mode: "paper" — every decision is made and logged with live prices, but no transaction is sent. A real wallet
// (and its budget) are added later; nothing in this file holds a key or sends anything.
// Store: arcat/paper { log: [...], day, spent, totals } (one decision per hour, made lazily by the first read).
import { arciaCoin, arciaBurned } from "./_arcia-coin.mjs";
import * as vearcia from "./_vearcia.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";

export const RULES = { dayBudgetUsd: 20, baseUsd: 2, maxLiqShare: 0.005, chaseAbove: 15, dipStep: 5, sellPressure: 1.3, steadyEvery: 4, burnShare: 0.5 };
const DOC = "arcat/paper";
const r2 = (n, d = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
let mem = null;

/// what ARCAT sees right now
export async function signals(origin) {
  const [c, b, v] = await Promise.all([arciaCoin(origin).catch(() => null), arciaBurned().catch(() => null), vearcia.state().catch(() => null)]);
  const t = v && v.live ? v.totals : null, supply = (b && b.supply) || 1e9;
  return {
    price: c ? c.price : null, change24h: c ? c.change24h : null, mcap: c ? c.mcap : null, liquidity: c ? c.liquidity : null,
    buys24h: c ? c.buys24h : null, sells24h: c ? c.sells24h : null, holders: c ? c.holders : null, volume24h: c ? c.volume24h : null,
    burned: b ? b.burned : null, burnedPct: b ? b.pct : null,
    staked: t ? t.staked : null, stakedPct: t ? r2((t.staked / supply) * 100, 2) : null, stakers: t ? t.stakers : null,
    weekStakers: v && v.week ? v.week.stakers : null, perDay: t ? t.perDay : null, poolEnds: t ? t.finish : null,
  };
}

/// ARCIA's mood, -10…10, from the chart, the stakers, the burn and tonight's lightsticks (0…1 of the goal)
export function mood(s, sticks) {
  let x = 0;
  if (s.change24h != null) x += clamp(s.change24h / 3, -5, 5);
  if (s.weekStakers > 0) x += 2;
  if (s.stakedPct != null) x += clamp(s.stakedPct / 15, 0, 2);
  if (sticks != null) x += clamp(sticks * 2, 0, 2);
  if (s.buys24h != null && s.sells24h != null && s.buys24h > s.sells24h) x += 1;
  x = r2(clamp(x, -10, 10), 1);
  return { score: x, level: x >= 6 ? "glowing" : x >= 2.5 ? "happy" : x >= -1 ? "calm" : x >= -4 ? "worried" : "down" };
}

/// one hourly decision (pure: the same inputs give the same answer)
export function decide(s, spentToday, hour) {
  const R = RULES, left = Math.max(0, R.dayBudgetUsd - spentToday);
  if (!(s.price > 0)) return { kind: "wait", reason: "noprice", usd: 0 };
  if (left <= 0) return { kind: "wait", reason: "budget", usd: 0 };
  if (s.change24h != null && s.change24h >= R.chaseAbove) return { kind: "wait", reason: "hot", usd: 0 };
  const dip = s.change24h != null && s.change24h <= -R.dipStep ? Math.min(3, Math.floor(-s.change24h / R.dipStep)) : 0;
  const pressure = s.buys24h != null && s.sells24h != null && s.sells24h > s.buys24h * R.sellPressure ? 1 : 0;
  let usd = 0, reason = "";
  if (dip || pressure) { usd = R.baseUsd + 2 * dip + 2 * pressure; reason = dip && pressure ? "dip+selling" : dip ? "dip" : "selling"; }
  else if (hour % R.steadyEvery === 0) { usd = R.baseUsd / 2; reason = "steady"; }
  else return { kind: "wait", reason: "calm", usd: 0 };
  usd = Math.min(usd, left);
  if (s.liquidity > 0) usd = Math.min(usd, s.liquidity * R.maxLiqShare);
  usd = r2(usd);
  if (!(usd > 0)) return { kind: "wait", reason: "thin", usd: 0 };
  const tokens = usd / s.price;
  return { kind: "buy", reason, usd, tokens: r2(tokens, 0), burn: r2(tokens * R.burnShare, 0), pool: r2(tokens * (1 - R.burnShare), 0), price: s.price };
}

/// the board: signals, mood, the next move and the paper log (an hourly decision is made by the first read that hour)
export async function board(origin, sticks) {
  const s = await signals(origin);
  const now = Date.now(), hourKey = Math.floor(now / 3600e3), day = new Date(now).toISOString().slice(0, 10);
  let doc = mem;
  if (storeEnabled()) { try { doc = (await getDocs([DOC]))[DOC] || doc; } catch { /* the last one we read */ } }
  doc = doc || { log: [], day, spent: 0, hour: 0, totals: { usd: 0, tokens: 0, burn: 0, pool: 0, buys: 0 } };
  if (doc.day !== day) { doc.day = day; doc.spent = 0; }
  if (doc.hour !== hourKey && s.price > 0) {
    const d = decide(s, doc.spent || 0, new Date(now).getUTCHours());
    doc.hour = hourKey;
    doc.log = [{ t: Math.floor(now / 1000), ...d, change24h: s.change24h }, ...(doc.log || [])].slice(0, 48);
    if (d.kind === "buy") {
      doc.spent = r2((doc.spent || 0) + d.usd);
      const T = doc.totals || {};
      doc.totals = { usd: r2((T.usd || 0) + d.usd), tokens: r2((T.tokens || 0) + d.tokens, 0), burn: r2((T.burn || 0) + d.burn, 0), pool: r2((T.pool || 0) + d.pool, 0), buys: (T.buys || 0) + 1 };
    }
    mem = doc;
    if (storeEnabled()) await setDoc(DOC, doc).catch(() => {});
  }
  const next = decide(s, doc.spent || 0, (new Date(now).getUTCHours() + 1) % 24);
  return {
    v: 1, mode: "paper", rules: RULES, signals: s, mood: mood(s, sticks), next,
    budget: { day: RULES.dayBudgetUsd, spent: doc.spent || 0, left: r2(Math.max(0, RULES.dayBudgetUsd - (doc.spent || 0))) },
    totals: doc.totals || { usd: 0, tokens: 0, burn: 0, pool: 0, buys: 0 }, log: (doc.log || []).slice(0, 12),
  };
}
