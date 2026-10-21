// api/_world-coins.mjs — the public numbers for the coins page (coins.html at /coins): what ARCL and $ARCIRCLE do in
// ARCIRCLE WORLD, as totals only (no wallet's own data). $ARCIRCLE's own numbers (price, supply, burns on Arc) are read
// by the page from /api/social?token=arcircle and ?supply=arcircle; this is the game's side:
//
//   GET ?world=coins → {
//     arcl:   { all: { earned, spent, sales, platform, settled }, since, days: [{ day, earn, spend, … }] (30, newest first),
//               earn: { kind: n } · spend: { kind: n } (the 30 days by where it came from / went) },
//     swap:   { sold: { n, arcl, arc } (ARCL → $ARCIRCLE settled), bought: { n, arc, arcl } ($ARCIRCLE → ARCL), open },
//     market: { listings, sales, platform },
//     shop:   { paid, arc, burned } (in-game items paid with $ARCIRCLE: half burned, half to the treasury),
//     land:   { sold, of, arc },
//     at }
// The ledger's counters start with the ledger (b-ec1); the exchange totals are summed from every request since the
// exchange opened (worldSwapQ/<month>), kept in worldStats/swapTot and summed again at most every 10 minutes.
export const COINS = { DAYS: 30, SWAP_FROM: "2026-01", SWAP_EVERY: 10 * 60e3, MEMO: 60e3 };

export function makeCoins(deps) {
  const { getDocs, setDoc, json, ledger } = deps, now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  let memo = null;
  const months = (t) => { const out = []; let [y, m] = COINS.SWAP_FROM.split("-").map(Number); const end = new Date(t).toISOString().slice(0, 7);
    for (let i = 0; i < 240; i++) { const k = `${y}-${String(m).padStart(2, "0")}`; out.push(k); if (k >= end) break; if (++m > 12) { m = 1; y++; } } return out; };
  async function swapTotals() {
    const t = now(), cached = await one("worldStats/swapTot");
    if (cached && t - (cached.at || 0) < COINS.SWAP_EVERY) return cached;
    const ms = months(t), idx = await getDocs(ms.map((k) => `worldSwapQ/${k}`)), ids = [...new Set(ms.flatMap((k) => (idx[`worldSwapQ/${k}`] || {}).ids || []))];
    const out = { sold: { n: 0, arcl: 0, arc: 0 }, bought: { n: 0, arc: 0, arcl: 0 }, open: 0, at: t };
    for (let i = 0; i < ids.length; i += 200) {
      const d = await getDocs(ids.slice(i, i + 200).map((x) => `worldSwap/${x}`));
      for (const r of Object.values(d)) { if (!r) continue;
        if (r.status === "pending") { out.open++; continue; }
        if (r.status !== "done") continue;
        if (r.dir === "arcl2arc") { out.sold.n++; out.sold.arcl += r.amount || 0; out.sold.arc += r.give || 0; }
        else if (r.dir === "arc2arcl") { out.bought.n++; out.bought.arc += r.amount || 0; out.bought.arcl += r.give || 0; } }
    }
    await setDoc("worldStats/swapTot", out).catch(() => {});
    return out;
  }
  async function view() {
    if (memo && now() - memo.at < COINS.MEMO) return memo.v;
    const [st, swap, d] = await Promise.all([ledger.stats(COINS.DAYS), swapTotals(),
      getDocs(["worldStats/shop", "worldStats/mktIndex", ...Array.from({ length: 20 }, (_, i) => `worldLand/${i + 1}`)])]);
    const earn = {}, spend = {}; let since = null;
    for (const x of st.days) { if (x.n) since = x.day; // (the days come newest first: the last one with movements is the oldest)
      for (const [k, v] of Object.entries(x)) { const m = /^(earn|spend)_(.+)$/.exec(k); if (m && typeof v === "number") (m[1] === "earn" ? earn : spend)[m[2]] = ((m[1] === "earn" ? earn : spend)[m[2]] || 0) + v; } }
    const S = d["worldStats/shop"] || {}, L = Array.from({ length: 20 }, (_, i) => d[`worldLand/${i + 1}`]).filter((x) => x && x.owner);
    const A = st.all || {};
    const v = {
      arcl: { all: { earned: A.earned || 0, spent: A.spent || 0, sales: A.sales || 0, platform: A.platform || 0, settled: A.settled || 0 }, since,
        days: st.days.map((x) => ({ day: x.day, earn: x.earn || 0, spend: x.spend || 0, sale: x.sale || 0, settle: x.settle || 0 })), earn, spend },
      swap: { sold: swap.sold, bought: swap.bought, open: swap.open || 0 },
      market: { listings: ((d["worldStats/mktIndex"] || {}).ids || []).length, sales: A.sales || 0, platform: A.platform || 0 },
      shop: { paid: S.paid || 0, arc: Math.round((S.arcPaid || 0) * 100) / 100, burned: Math.round((S.arcBurned || 0) * 100) / 100 },
      land: { sold: L.length, of: 20, arc: L.reduce((s, x) => s + (Number(x.price) || 0), 0) },
      at: now(),
    };
    memo = { at: now(), v };
    return v;
  }
  async function read(w) { if (w !== "coins") return null; try { return json(200, await view(), "public, max-age=60, s-maxage=60, stale-while-revalidate=300"); } catch { return json(503, { error: "the numbers aren't available right now" }); } }
  return { read, view, swapTotals };
}
