// api/_desk-brain.mjs — how ARCIA DESK decides and learns. Pure functions, no IO:
// api/_desk.mjs feeds it market snapshots and closed trades, and stores what it returns.
//
// The trader it is meant to become:
//   1. Safety first, never learned away: hard gates (Token Scanner v3 critical flags, a round trip
//      that loses too much, no liquidity, launch too fresh to judge) are fixed rules.
//   2. Four playbooks, each with its own entry trigger and exits — the "styles" a memecoin trader
//      uses on fresh launches: launch momentum, pullback, volume breakout, steady climber.
//   3. Every trigger opens a PAPER trade (no money) as well, so the desk learns from many more
//      trades than $100 can pay for. Real trades are the few the policy picks.
//   4. Learning, three ways:
//      • which playbook works — Thompson sampling on each playbook's returns (paper counts half)
//      • which setups work — an online logistic model on ~20 features, trained on every close
//      • where to exit — each close records when it first crossed +10…+100% and −5…−30%, so every
//        take-profit / stop-loss pair can be replayed; the exits move one step a day toward
//        the pair that did best (stop-loss never wider than 25%)
//   5. Busy on purpose early: a warm-up that takes any gated trigger, then exploration that decays.
// Returns are net: fees, hook taxes and price impact are inside the quotes the desk trades on.

export const BRAIN_VERSION = 1;

// ---------------------------------------------------------------- the runner (after the first take-profit)
// New coins bought at a $2–10k market cap sometimes run 5–20×; selling everything at +30% would cut off the very
// trades that pay for all the losers. So profit is taken in steps and the rest rides:
//   tp  (per playbook, ~+30%)  sell tp1Pct (35%) of the position
//   tp2 (+100%, a double)      sell tp2Pct (25%) — with the first sale the stake is back, the rest is "free"
//   the rest (~40%) runs with a trailing stop measured from its peak (30% below it, 40% once it's 5×+),
//   never gives back the entry, and has maxRunH (48 h) instead of the playbook's short time limit.
export const RUN = { tp1Pct: 35, tp2: 100, tp2Pct: 25, runTrail: 30, runTrailWide: 40, maxRunH: 48 };

// ---------------------------------------------------------------- playbooks
// age in minutes, sizes in USD, changes in %, flows as (buys − sells) / (buys + sells + 1)
export const PLAYBOOKS = {
  momentum: {
    name: "Launch momentum", why: "Early buyers keep coming and the price is rising, but it hasn't run away yet.",
    when: (f) => f.ageMin >= 3 && f.ageMin <= 90 && f.buysM5 >= 3 && f.flowM5 >= 0.2 && f.chgM5 >= 0 && f.chgM5 <= 60 && f.mom15 > 0,
    exits: { tp: 30, sl: 20, trailAt: 15, trail: 10, maxH: 3, ...RUN },
  },
  pullback: {
    name: "Pullback", why: "It fell well off its high and buyers are stepping back in.",
    when: (f) => f.ageMin >= 20 && f.ageMin <= 1440 && f.ddHigh <= -15 && f.ddHigh >= -45 && f.flowM5 >= 0 && f.buysM5 >= 2 && f.liq >= 1500,
    exits: { tp: 25, sl: 18, trailAt: 12, trail: 12, maxH: 8, ...RUN },
  },
  breakout: {
    name: "Volume breakout", why: "Volume jumped against its liquidity and the price is breaking up.",
    when: (f) => f.ageMin >= 60 && f.ageMin <= 4320 && f.volLiqH1 >= 0.5 && f.chgH1 >= 5 && f.chgH1 <= 120 && f.flowH1 >= 0.1,
    exits: { tp: 35, sl: 20, trailAt: 20, trail: 12, maxH: 12, ...RUN },
  },
  steady: {
    name: "Steady climber", why: "A calm, well spread token that keeps trading and slowly climbs.",
    when: (f) => f.ageMin >= 360 && f.ageMin <= 4320 && f.chgH1 >= -5 && f.chgH1 <= 20 && f.top10 <= 35 && f.score >= 70 && f.txH1 >= 10,
    exits: { tp: 30, sl: 15, trailAt: 15, trail: 10, maxH: 24, ...RUN },
  },
  scalp: {
    name: "Pump scalp", why: "A sudden burst of buying (or a fresh Dex payment): in fast, out at +20–25%, small size.",
    when: (f) => f.ageMin >= 2 && f.flowM5 >= 0.35 && ((f.chgM5 >= 15 && f.chgM5 <= 150 && f.buysM5 >= 6) || (f.dexPaid && f.dexPaidMin <= 10 && f.buysM5 >= 3 && f.chgSincePaid <= 30)),
    exits: { tp: 22, sl: 12, trailAt: 10, trail: 7, maxH: 0.34, tp1Pct: 75, tp2: 60, tp2Pct: 25, runTrail: 20, runTrailWide: 25, maxRunH: 0.5 },
    // 30 Sep 2026: the one real-money playbook, sized like the others — 6% of the desk ($3–$10), also in the
    // warm-up — instead of a fixed $2; fast exits stay its risk control
    fullSize: true, maxFloorX: 15, review: false, // speed over a second opinion
  },
  dipdca: {
    name: "Crash buy + DCA", why: "It crashed 55%+ off its high but still trades: buy a little, buy again at -15% and -30%, sell into the bounce.",
    when: (f) => f.ageMin >= 20 && f.ddHigh <= -55 && f.txH1 >= 5 && f.flowM5 >= 0 && f.chgM5 >= -5 && f.liq >= 800,
    exits: { tp: 25, sl: 45, trailAt: 15, trail: 10, maxH: 3, tp1Pct: 70, tp2: 80, tp2Pct: 30, runTrail: 25, runTrailWide: 30, maxRunH: 3 },
    sizeUsd: 2, dca: [-15, -30], maxFloorX: 1e9, lowCap: { usd: 10000, min: 60 }, // its thesis needs a little time: under a $10k cap it gets 1 hour, then it is sold
  },
  dexpaid: {
    name: "Dex paid", why: "The team just paid for its Dexscreener profile and buyers are still coming, but the price hasn't run yet.",
    when: (f) => f.dexPaid && f.dexPaidMin >= 1 && f.dexPaidMin <= 180 && f.chgSincePaid >= -15 && f.chgSincePaid <= 40 && f.flowM5 >= 0 && f.buysM5 >= 2 && f.ageMin >= 3,
    exits: { tp: 35, sl: 18, trailAt: 15, trail: 10, maxH: 6, ...RUN },
  },
};
export const PB_KEYS = Object.keys(PLAYBOOKS);
/// The playbooks allowed to spend real money (30 Sep 2026: the Pump scalp only). Every playbook still opens
/// PAPER trades and keeps learning, so any of them can be switched back on without starting from zero.
/// Overridden by the ARCIA_DESK_PLAYBOOKS env (comma list of keys, e.g. "scalp,dexpaid").
export const REAL_PLAYBOOKS = ["scalp"];

// ---------------------------------------------------------------- hard gates (never learned)
export const GATES = {
  minAgeMin: 2, // not in the very first minutes: the sniper bots' window
  maxAgeMin: 4320, // 3 days: this desk trades new launches only
  minLiq: 800,
  maxRoundTrip: 15, // % lost buying and selling straight back at trade size
  maxTax: 12, // buy + sell tax %
  // Token Scanner: an Argus launch can't be a sell-blocking honeypot, so the score is shown and fed to the model
  // (which learns its weight) but doesn't block a buy; only a critical flag does.
  minScore: 0,
  maxTop10: 90,
};
// real money only (paper keeps trading these, so the model learns whether they matter):
//   the launch floor — an Argus pool starts at its launch price, and if the early buyers all sell the price
//   goes back there, so buying at 10× the floor can lose ~90% in one block; and the scanner's stress test
//   (the price drop if the top 10 wallets sell everything)
export const REAL_GATES = {
  maxFloorX: 6, // price at most this many × its launch floor (per playbook: the pump scalp takes 15×, small)
  maxDump: 80, // % the price drops if the top 10 wallets sell everything
  flagHours: 6, // a token that showed a critical flag stays off-limits this long
};
export function realGate(f, c, nowS, pb) {
  const r = [];
  const maxX = (pb && PLAYBOOKS[pb] && PLAYBOOKS[pb].maxFloorX) || REAL_GATES.maxFloorX;
  if (f.floorX != null && f.floorX > maxX) r.push(`${Math.round(f.floorDrop)}% above-floor risk (price ${f.floorX.toFixed(1)}× its launch floor)`);
  if (f.dumpTop10 != null && f.dumpTop10 > REAL_GATES.maxDump && pb !== "dipdca") r.push(`top 10 selling would drop it ${Math.round(f.dumpTop10)}%`);
  if (c.flagUntil && c.flagUntil > nowS) r.push(`flagged earlier: ${c.flagWhy || "critical flag"}`);
  if (f.reused) r.push("its website / X / Telegram link is also used by another launch");
  return r;
}
export function gate(f, crit) {
  const r = [];
  if (crit && crit.length) r.push(`critical: ${crit[0]}`);
  if (f.ageMin < GATES.minAgeMin) r.push("launched less than 3 minutes ago");
  if (f.ageMin > GATES.maxAgeMin) r.push("older than 3 days");
  if (!(f.liq >= GATES.minLiq)) r.push("liquidity under $800");
  if (f.rtLoss != null && f.rtLoss > GATES.maxRoundTrip) r.push(`a round trip loses ${f.rtLoss.toFixed(1)}%`);
  if (f.rtLoss == null && f.quoteFailed) r.push("the desk couldn't quote a trade in this pool");
  if (f.tax > GATES.maxTax) r.push(`taxes add up to ${f.tax}%`);
  if (GATES.minScore > 0 && f.score != null && f.score < GATES.minScore) r.push(`scanner score ${f.score}`);
  if (f.top10 != null && f.top10 > GATES.maxTop10) r.push(`top 10 wallets hold ${Math.round(f.top10)}%`);
  return r;
}

// ---------------------------------------------------------------- features
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const nz = (x, d = 0) => (x == null || !isFinite(x) ? d : x);
export const FEATURES = ["age", "liq", "mcap", "volLiq", "flowM5", "flowH1", "txM5", "chgM5", "chgH1", "ddHigh", "mom15", "score", "top10", "snipers", "linked", "tax", "rt", "holders", "social", "secTrade", "secHolders", "floorX", "dump", "socials", "reused", "dexPaid", "sincePaid"];
/// raw snapshot → feature vector in roughly [-1, 1]
export function vec(f) {
  return {
    age: Math.log1p(nz(f.ageMin)) / Math.log1p(4320),
    liq: Math.log10(nz(f.liq) + 1) / 6,
    mcap: Math.log10(nz(f.mcap) + 1) / 8,
    volLiq: clamp(nz(f.volLiqH1), 0, 5) / 5,
    flowM5: clamp(nz(f.flowM5), -1, 1),
    flowH1: clamp(nz(f.flowH1), -1, 1),
    txM5: Math.log1p(nz(f.buysM5) + nz(f.sellsM5)) / 5,
    chgM5: clamp(nz(f.chgM5), -50, 100) / 100,
    chgH1: clamp(nz(f.chgH1), -80, 300) / 300,
    ddHigh: clamp(nz(f.ddHigh), -100, 0) / 100,
    mom15: clamp(nz(f.mom15), -50, 100) / 100,
    score: nz(f.score, 50) / 100,
    top10: nz(f.top10, 40) / 100,
    snipers: clamp(nz(f.snipersPct), 0, 60) / 60,
    linked: clamp(nz(f.linkedPct), 0, 60) / 60,
    tax: clamp(nz(f.tax), 0, 20) / 20,
    rt: clamp(nz(f.rtLoss, 6), 0, 20) / 20,
    holders: Math.log10(nz(f.holders) + 1) / 4,
    social: f.social ? 1 : 0,
    secTrade: nz(f.secTrade, 60) / 100,
    secHolders: nz(f.secHolders, 60) / 100,
    floorX: clamp(Math.log10(Math.max(1, nz(f.floorX, 1))) / 2, 0, 1), // 1× → 0, 10× → 0.5, 100× → 1
    dump: clamp(nz(f.dumpTop10, 50), 0, 100) / 100,
    socials: clamp(nz(f.socialCount), 0, 3) / 3, // website, X, Telegram
    reused: f.reused ? 1 : 0, // a link another launch also uses
    dexPaid: f.dexPaid ? 1 : 0,
    sincePaid: f.dexPaid ? clamp(nz(f.chgSincePaid), -50, 100) / 100 : 0,
  };
}

// ---------------------------------------------------------------- the model: online logistic regression
export function newModel() { return { b: 0, w: Object.fromEntries(FEATURES.map((k) => [k, 0])), n: 0 }; }
const sigmoid = (z) => 1 / (1 + Math.exp(-clamp(z, -30, 30)));
export function predict(model, x) {
  let z = model.b;
  for (const k of FEATURES) z += (model.w[k] || 0) * (x[k] || 0);
  return sigmoid(z);
}
/// one SGD step on a closed trade: y = 1 when it made money after costs
export function learn(model, x, y, weight = 1) {
  const p = predict(model, x), lr = 0.08 * weight / Math.sqrt(1 + model.n / 50), l2 = 0.002;
  const g = y - p;
  model.b += lr * g;
  for (const k of FEATURES) model.w[k] = (model.w[k] || 0) * (1 - l2) + lr * g * (x[k] || 0);
  model.n++;
  return model;
}
/// the features that push the odds most, for the page
export function topWeights(model, n = 6) {
  return FEATURES.map((k) => [k, model.w[k] || 0]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n);
}

// ---------------------------------------------------------------- playbook stats + Thompson sampling
export function newBandit() { return Object.fromEntries(PB_KEYS.map((k) => [k, { n: 0, mean: 0, m2: 0, wins: 0, real: 0, paper: 0, sum: 0 }])); }
/// Welford update with a weight (paper trades count half)
export function banditAdd(b, pb, ret, weight, real) {
  const s = b[pb] || (b[pb] = { n: 0, mean: 0, m2: 0, wins: 0, real: 0, paper: 0, sum: 0 });
  const n1 = s.n + weight, d = ret - s.mean;
  s.mean += (weight * d) / n1;
  s.m2 += weight * d * (ret - s.mean);
  s.n = n1; s.sum += ret * weight;
  if (ret > 0) s.wins += weight;
  if (real) s.real++; else s.paper++;
  return b;
}
function gauss(rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
/// a draw of the playbook's mean return (%): prior mean 0, 3 pseudo-trades of spread 20%
export function sampleMean(s, rand = Math.random) {
  const n0 = 3, prior = 0, sd0 = 20;
  const n = (s ? s.n : 0) + n0;
  const mean = s && s.n ? (s.mean * s.n + prior * n0) / n : prior;
  const varR = s && s.n > 1 ? s.m2 / s.n : sd0 * sd0;
  return mean + gauss(rand) * Math.sqrt(Math.max(25, varR) / n);
}

// ---------------------------------------------------------------- the policy
/// Should this gated trigger become a REAL trade?  → { go, why, p, draw, explore }
/// How often a setup is taken just to learn, once the warm-up is over: starts at 15%, settles at 8%.
export const exploreRate = (nReal) => Math.min(0.15, Math.max(0.08, 0.5 * Math.exp(-nReal / 120)));
/// A playbook whose trades have clearly lost money (after every cost — returns are measured on real sell
/// quotes) is BENCHED: it keeps running on paper, and comes back to real money on its own once its paper
/// results recover. Clear = 20+ trades averaging −1% or worse, or 10+ averaging −10% or worse.
export const BENCH = { n: 20, mean: -1, nFast: 10, meanFast: -10 };
export function benched(s) {
  if (!s || !s.n) return false;
  return (s.n >= BENCH.n && s.mean <= BENCH.mean) || (s.n >= BENCH.nFast && s.mean <= BENCH.meanFast);
}
export function decide({ pb, x, state, rand = Math.random }) {
  const L = state.learn;
  const nReal = state.stats ? state.stats.realClosed || 0 : 0;
  const p = predict(L.model, x);
  const draw = sampleMean(L.bandit[pb], rand);
  const warm = nReal < (L.warmup || 25);
  if (warm) return { go: true, why: "warm-up: every gated setup is traded to learn", p, draw, explore: true };
  if (benched(L.bandit[pb])) return { go: false, why: "benched: this playbook is losing money — paper only until it recovers", p, draw, explore: false, benched: true };
  if (rand() < exploreRate(nReal)) return { go: true, why: "exploring", p, draw, explore: true };
  // the model's odds shift the playbook's sampled mean: ±10 points at the extremes
  const score = draw + (p - 0.5) * 20;
  return score > (L.threshold ?? 0) ? { go: true, why: `expected edge ${score.toFixed(1)}`, p, draw, explore: false } : { go: false, why: `expected edge ${score.toFixed(1)} too low`, p, draw, explore: false };
}

// ---------------------------------------------------------------- exits
export const UP = [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000];
export const DOWN = [5, 10, 15, 20, 25, 30];
/// update a position's running path; returns { action: null|"tp"|"tp2"|"sl"|"trail"|"runner"|"time"|"be", sellPct }
/// sellPct: % of the ORIGINAL position for the partial take-profits; 100 = everything that's left
export function exitCheck(pos, ret, nowTs) {
  const mins = (nowTs - pos.entryTs) / 60;
  pos.peak = Math.max(pos.peak != null ? pos.peak : ret, ret);
  pos.low = Math.min(pos.low != null ? pos.low : ret, ret);
  pos.up = pos.up || {}; pos.dn = pos.dn || {};
  for (const u of UP) if (ret >= u && pos.up[u] == null) pos.up[u] = Math.round(mins);
  for (const d of DOWN) if (ret <= -d && pos.dn[d] == null) pos.dn[d] = Math.round(mins);
  const X = { ...RUN, ...pos.exits };
  if (!pos.tpHit && ret >= X.tp) return { action: "tp", sellPct: X.tp1Pct };
  if (pos.tpHit && !pos.tp2Hit && ret >= X.tp2) return { action: "tp2", sellPct: X.tp2Pct };
  if (pos.tpHit && ret <= 0) return { action: "be", sellPct: 100 }; // after taking profit, never give the rest back below entry
  if (ret <= -X.sl) return { action: "sl", sellPct: 100 };
  if (pos.tpHit) { // the runner: a trailing stop from its peak, measured on the price, and a long time limit
    const fromPeak = ((1 + ret / 100) / (1 + pos.peak / 100) - 1) * 100;
    if (fromPeak <= -(pos.peak >= 400 ? X.runTrailWide : X.runTrail)) return { action: "runner", sellPct: 100 };
    if (mins >= X.maxRunH * 60) return { action: "time", sellPct: 100 };
    return { action: null };
  }
  if (pos.peak >= X.trailAt && ret <= pos.peak - X.trail) return { action: "trail", sellPct: 100 };
  if (mins >= X.maxH * 60) return { action: "time", sellPct: 100 };
  return { action: null };
}
/// the net return of a closed position from its parts (a TP sells 60%, the rest later)
export function blended(parts) {
  const w = parts.reduce((t, p) => t + p.pct, 0) || 1;
  return parts.reduce((t, p) => t + p.pct * p.ret, 0) / w;
}
/// Replay a closed trade under take-profit tp / stop-loss sl, from its first-crossing times.
/// Plain TP/SL (no trailing): whichever threshold it crossed first; neither → its final return.
export function replay(t, tp, sl) {
  const upT = t.up && t.up[tp] != null ? t.up[tp] : null;
  const dnT = t.dn && t.dn[sl] != null ? t.dn[sl] : null;
  if (upT != null && (dnT == null || upT <= dnT)) return tp;
  if (dnT != null) return -sl;
  return t.final;
}
/// the best TP/SL pair over closed trades (at least 20), and how it compares with the current one
export function tuneExits(closed, cur) {
  if (!closed || closed.length < 20) return null;
  const TPS = [15, 20, 25, 30, 40, 50, 75], SLS = [10, 15, 20, 25];
  let best = null;
  const mean = (tp, sl) => closed.reduce((s, t) => s + replay(t, tp, sl), 0) / closed.length;
  for (const tp of TPS) for (const sl of SLS) { const m = mean(tp, sl); if (!best || m > best.m) best = { tp, sl, m }; }
  const curM = mean(nearest(TPS, cur.tp), nearest(SLS, cur.sl));
  // move one step toward the best, and only if it's clearly better
  if (best.m - curM < 1) return { tp: cur.tp, sl: cur.sl, best, curM, moved: false };
  const stepTo = (list, from, to) => { const i = list.indexOf(nearest(list, from)), j = list.indexOf(to); return list[i + Math.sign(j - i)]; };
  return { tp: stepTo(TPS, cur.tp, best.tp), sl: Math.min(25, stepTo(SLS, cur.sl, best.sl)), best, curM, moved: true };
}
const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), list[0]);

// ---------------------------------------------------------------- sizing and limits
export const RISK = {
  tradePct: 6, // of equity per real trade
  // USD. maxTrade null = no cap of the site's own (30 Sep 2026): a buy is 6% of the desk, bounded only by the
  // contract's maxTrade / dailyCap, which the owner sets (ArcDesk.setCaps; the Rules tab's owner panel)
  minTrade: 3, maxTrade: null,
  maxOpen: 10,
  maxPerHour: 8,
  dailyLossPct: 15, // stop opening new trades for the rest of the UTC day
  keepCash: 2, // USD left in the desk
  warmTrade: 3, // USD per real trade during the warm-up
  warmPerHour: 6, // real buys an hour during the warm-up
  lowCapUsd: 5000, lowCapMin: 30, // under a $5k market cap, never hold longer than 30 minutes
  burnPct: 20, // of new profit above the high-water mark, each day
};
export function tradeSize(equity, cash) {
  const s = clamp((equity * RISK.tradePct) / 100, RISK.minTrade, RISK.maxTrade == null ? Infinity : RISK.maxTrade);
  return cash - RISK.keepCash >= s ? Math.floor(s * 100) / 100 : 0;
}

// ---------------------------------------------------------------- a fresh brain
export function newLearn() {
  return { v: BRAIN_VERSION, model: newModel(), bandit: newBandit(), exits: Object.fromEntries(PB_KEYS.map((k) => [k, { ...PLAYBOOKS[k].exits }])), threshold: 0, warmup: 25, history: [], adds: newAdds() };
}
/// fills in what a brain saved by an older version doesn't have (new playbooks, add stats)
export function ensureLearn(L) {
  L.exits = L.exits || {}; L.bandit = L.bandit || newBandit();
  for (const k of PB_KEYS) { L.exits[k] = { ...RUN, ...(L.exits[k] || PLAYBOOKS[k].exits) }; if (!L.bandit[k]) L.bandit[k] = { n: 0, mean: 0, m2: 0, wins: 0, real: 0, paper: 0, sum: 0 }; }
  L.adds = L.adds || newAdds();
  return L;
}

// ---------------------------------------------------------------- adding to a position (추매), learned before it's used
// Two kinds: "dip" — it fell 6–15% from the entry but buyers are back; "strength" — it's up 8–20% with buying
// still strong (pyramiding). Every paper trade records what one add would have done (a second, equal tranche at
// the trigger price, sold with the first), so the desk learns the edge of adding without risking money.
// Real adds only once a kind has 20+ paper cases and an edge that's positive even at its lower bound.
export const ADD_KINDS = { dip: "Add on a dip", strength: "Add on strength" };
export function newAdds() { return { dip: { n: 0, mean: 0, m2: 0, helped: 0 }, strength: { n: 0, mean: 0, m2: 0, helped: 0 } }; }
export function addTrigger(pos, f, ret, nowS) {
  const mins = (nowS - pos.entryTs) / 60, X = pos.exits || {};
  if (pos.tpHit || mins > (X.maxH || 6) * 30) return null; // only in the first half of its time
  const move = pos.p0 && f.px ? (f.px / pos.p0 - 1) * 100 : null; // price move since entry (costs aside)
  if (move == null) return null;
  if (move <= -6 && move >= -15 && ret > -(X.sl || 20) + 3 && f.flowM5 >= 0.1 && f.buysM5 >= 2) return "dip";
  if (move >= 8 && move <= 20 && f.flowM5 >= 0.2 && f.buysM5 >= 3) return "strength";
  return null;
}
export function addLearn(adds, kind, edge) {
  const s = adds[kind] || (adds[kind] = { n: 0, mean: 0, m2: 0, helped: 0 });
  const n1 = s.n + 1, d = edge - s.mean;
  s.mean += d / n1; s.m2 += d * (edge - s.mean); s.n = n1;
  if (edge > 0) s.helped++;
  return adds;
}
export function addAllowed(adds, kind) {
  const s = adds && adds[kind];
  if (!s || s.n < 20) return false;
  const sd = Math.sqrt(s.m2 / Math.max(1, s.n - 1));
  return s.mean - sd / Math.sqrt(s.n) > 0;
}

// ---------------------------------------------------------------- plain-words lessons (deterministic)
const FNAME = { age: "launch age", liq: "liquidity", mcap: "market cap", volLiq: "volume vs liquidity", flowM5: "5-minute buy pressure", flowH1: "1-hour buy pressure",
  txM5: "5-minute activity", chgM5: "5-minute price move", chgH1: "1-hour price move", ddHigh: "distance from the high", mom15: "15-minute momentum", score: "scanner score",
  top10: "top-10 concentration", snipers: "sniper share", linked: "linked wallets", tax: "taxes", rt: "round-trip cost", holders: "holder count", social: "listed socials",
  secTrade: "scanner trading section", secHolders: "scanner holders section", floorX: "height above the launch floor", dump: "top-10 dump risk", socials: "website / X / Telegram", reused: "reused links", dexPaid: "Dexscreener profile paid", sincePaid: "move since Dex paid" };
export const featureName = (k) => FNAME[k] || k;
export function lessons(learn, closedToday) {
  const out = [];
  const b = learn.bandit;
  const ranked = PB_KEYS.filter((k) => b[k] && b[k].n >= 3).sort((x, y) => b[y].mean - b[x].mean);
  if (ranked.length) {
    const top = ranked[0], low = ranked[ranked.length - 1];
    out.push(`Best playbook so far: ${PLAYBOOKS[top].name} (${b[top].mean >= 0 ? "+" : ""}${b[top].mean.toFixed(1)}% a trade over ${Math.round(b[top].n)} weighted trades).`);
    if (low !== top) out.push(`Weakest: ${PLAYBOOKS[low].name} (${b[low].mean >= 0 ? "+" : ""}${b[low].mean.toFixed(1)}%).`);
  }
  const tw = topWeights(learn.model, 3).filter(([, w]) => Math.abs(w) > 0.05);
  tw.forEach(([k, w]) => out.push(`Higher ${featureName(k)} has been ${w > 0 ? "helping" : "hurting"} (weight ${w > 0 ? "+" : ""}${w.toFixed(2)}).`));
  if (closedToday && closedToday.length) {
    const r = closedToday.map((t) => t.ret), wins = r.filter((x) => x > 0).length;
    out.push(`Today: ${closedToday.length} closed, ${wins} wins, average ${(r.reduce((a, c) => a + c, 0) / r.length).toFixed(1)}%.`);
    const sls = closedToday.filter((t) => t.why === "sl").length;
    if (sls >= 3 && sls / closedToday.length > 0.5) out.push("More than half hit the stop-loss today — entries are coming in late.");
  }
  return out;
}
