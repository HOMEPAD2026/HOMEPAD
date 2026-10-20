// api/_world-ledger.mjs — the ARCL ledger (b-ec1, the hybrid economy): every ARCL movement written down for good, and
// the balance split by where it came from.
//
//   worldArclTx/<id>        one doc a movement: { w, t (earn | spend | hold | unhold | sale | settle …), k (the kind:
//                           a game, a shop item, market:<id> …), n (signed), b ({ bucket: n } it moved), ref, at }.
//                           Kept in full (the owner: "record more"); read back by wallet (queryDocs w) for the history.
//   worldArclBkt/<w>        the buckets that aren't plain play ARCL: { purchased, cplay, cavail }. PLAY is the rest of
//                           the balance (bal − those), so every balance from before the ledger is PLAY, as it was earned.
//                             purchased  ARCL bought with $ARCIRCLE through the Exchange
//                             cplay      a creator's sales paid with PLAY/PROMO ARCL: spends in the game, not settled
//                             cavail     a creator's sales paid with PURCHASED ARCL: settleable through the Creator
//                                        Exchange (the owner's rule, CLAUDE.md "standing decisions")
//   worldStats/econ         all-time counters { earned, spent, sales, platform, settled … }
//   worldStats/econ_<day>   the day's counters by direction and kind
//
// A spend takes PLAY first, then cplay, purchased and cavail last (the settleable stays as long as it can); a market
// purchase takes PURCHASED first (that's what pays a creator something settleable).
export const BUCKETS = ["purchased", "cplay", "cavail"];
export const ORDER = { spend: ["play", "cplay", "purchased", "cavail"], market: ["purchased", "play", "cplay", "cavail"] };

/// deps: { getDocs, setDoc, commit, queryDocs?, now, randomId? }
export function makeLedger(deps) {
  const { getDocs, commit } = deps, now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const rid = () => (deps.randomId ? deps.randomId() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/[^0-9a-z]/gi, "").slice(0, 20);
  const day = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const key = (k) => String(k || "").replace(/[^0-9a-zA-Z_:.-]/g, "").slice(0, 60) || "other";

  /// what each bucket holds now (PLAY: the rest of the balance)
  async function buckets(w) {
    const d = await getDocs([`worldArclBal/${w}`, `worldArclBkt/${w}`]), B = d[`worldArclBal/${w}`] || {}, K = d[`worldArclBkt/${w}`] || {};
    const bal = Math.max(0, Math.floor(B.bal || 0)), out = {};
    let rest = bal; for (const b of BUCKETS) { out[b] = Math.max(0, Math.min(rest, Math.floor(K[b] || 0))); rest -= out[b]; }
    return { bal, held: Math.max(0, Math.floor(B.held || 0)), play: rest, ...out, raw: K };
  }
  /// how a spend of n splits over the buckets (from a view of them before it), in an order
  function split(view, n, order = ORDER.spend) {
    const out = {}; let left = n;
    for (const b of order) { if (left <= 0) break; const take = Math.min(left, view[b] || 0); if (take > 0) { out[b] = take; left -= take; } }
    if (left > 0) out.play = (out.play || 0) + left; // (more than the view showed: a race — the rest counts as play)
    return out;
  }
  /// the commit ops that move the bucket counters by a split (sign: −1 a spend, +1 money back in)
  const bucketOps = (w, parts, sign) => { const f = {}; for (const b of BUCKETS) if (parts[b]) f[b] = sign * parts[b]; return Object.keys(f).length ? [{ inc: `worldArclBkt/${w}`, fields: f }] : []; };
  /// the movement written down: its doc, and the day's and all-time counters
  async function record(w, t, k, n, o = {}) {
    const at = now(), id = `${at.toString(36)}${rid()}`, d = day(at), kk = key(k);
    const tot = t === "earn" || t === "sale" ? { earned: Math.max(0, n) } : t === "spend" ? { spent: Math.max(0, -n) } : t === "settle" ? { settled: Math.max(0, -n) } : {};
    const ops = [{ create: `worldArclTx/${id}`, data: { w, t, k: kk, n, at, ...(o.b ? { b: o.b } : {}), ...(o.ref ? { ref: String(o.ref).slice(0, 80) } : {}) } },
      { inc: `worldStats/econ_${d}`, fields: { [t]: Math.abs(n), [`${t}_${kk.split(":")[0].replace(/[^a-zA-Z0-9_]/g, "_")}`]: Math.abs(n), n: 1 } }]; // (plain field names: Firestore wants [a-zA-Z_0-9])
    if (Object.keys(tot).length) ops.push({ inc: "worldStats/econ", fields: tot });
    await commit(ops).catch(() => { /* the movement itself already stands */ });
    return id;
  }
  /// after a spend the shop already took from the balance: which buckets it came out of
  async function afterSpend(w, n, order = ORDER.spend) {
    const v = await buckets(w), before = { ...v, bal: v.bal + n };
    // the view after the spend: PLAY was the rest; put the spend back to see what the buckets held before it
    before.play = v.play + n; const parts = split(before, n, order), ops = bucketOps(w, parts, -1);
    if (ops.length) await commit(ops).catch(() => {});
    return parts;
  }
  /// ARCL into a bucket (a purchase through the Exchange, a creator's matured sale)
  const intoOps = (w, bucket, n) => (BUCKETS.includes(bucket) && n > 0 ? [{ inc: `worldArclBkt/${w}`, fields: { [bucket]: n } }] : []);
  /// the wallet's movements, newest first
  async function history(w, limit = 200) {
    if (!deps.queryDocs) return [];
    const list = await deps.queryDocs("worldArclTx", "w", w, 1000).catch(() => []);
    return list.sort((a, b) => b.at - a.at).slice(0, limit).map(({ t, k, n, at, b, ref }) => ({ t, k, n, at, ...(b ? { b } : {}), ...(ref ? { ref } : {}) }));
  }
  async function stats(days = 14) {
    const t = now(), ks = ["worldStats/econ", ...Array.from({ length: days }, (_, i) => `worldStats/econ_${day(t - i * 864e5)}`)], d = await getDocs(ks);
    return { all: d[ks[0]] || {}, days: ks.slice(1).map((k) => ({ day: k.slice(-10), ...(d[k] || {}) })) };
  }
  return { buckets, split, bucketOps, intoOps, record, afterSpend, history, stats, one };
}
