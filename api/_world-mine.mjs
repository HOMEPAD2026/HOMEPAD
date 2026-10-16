// api/_world-mine.mjs — the ARCL Mine (world-mine.js): a side-on cave in the Mining Village where you break copper,
// silver and gold rocks for ARCL. Everything that pays is decided here: which rocks there are, how many hits each
// takes, whether one is empty and what it holds. The page only shows them and says which one broke.
//
//   GET  ?world=mine&wallet=0x…                                 → { left, coolUntil, tier, today, cap }
//   POST { action: "world-mine-enter", …signature }             → { runId, left, rocks, tier, swing, k, today, cap }
//   POST { action: "world-mine-beat",  …signature, runId }      → { left, rocks }        (every ~15 s while inside)
//   POST { action: "world-mine-break", …signature, runId, rock } → { got, empty, t, rocks, left, today, capped }
//   POST { action: "world-mine-leave", …signature, runId }      → { left, coolUntil }
//
// Time: 60 minutes inside (SESSION_MS), counted on the server's clock while you're in (between enter and leave, and
// at most BEAT_GRACE past the last call when the page just went away). What's used stays used when you come back.
// Once all 60 are gone, the mine closes for COOL_MS (6 hours) from that moment, then the full hour is back.
//
// Rocks: up to MAX_ROCKS at once, a new one every EVERY_MS[tier] while you're inside (none bank up while away, or
// while the cave is full). Each is copper (t 0), silver (1) or gold (2) by ODDS; its hits come from HITS × the
// pickaxe's K. A rock can only break after its hits × SWING_MS × SLACK since the last break (or since it appeared):
// no faster than a real pickaxe. EMPTY of them hold nothing; the rest pay inside RANGE, the low end far more often
// (value = lo + (hi − lo) × u^SKEW): a full 10,000 gold is about 1 gold in 2,000.
// Average with the free pickaxe, mining the whole hour: about 12,000 ARCL (tests/world/mine.test.mjs checks it).
// ARCL from the mine has its own daily limit (DAY_CAP, Seoul day), outside the shop's DAILY_CAP.
//
// Pickaxes: tier 0 (Common) is everyone's; 1–3 are the shop's pick1–pick3 ($ARCIRCLE, api/_world-shop.mjs CATALOG),
// kept in worldOwn.items. A better pickaxe needs fewer hits and finds rocks faster.
//
// Firestore: worldMineRun/<wallet> (the hour, the cave's rocks) · worldMineRock/<runId>_<rockId> (a break, once) ·
// worldMineDay/<wallet>_<day> (the day's mined ARCL). All progress: none is in _world-phase.mjs's KEEP.
const SESSION_MS = 60 * 60e3, COOL_MS = 6 * 3600e3, BEAT_GRACE = 30e3, SWING_MS = 520, SLACK = 0.8;
const MAX_ROCKS = 8, START_ROCKS = 5, SLOTS = 14;
const ODDS = [0.9, 0.085, 0.015]; // copper, silver, gold
const EMPTY = 0.2;
const RANGE = [[10, 100], [100, 1000], [1000, 10000]], SKEW = [2, 2.5, 4];
const HITS = [[10, 20], [22, 34], [40, 56]];
// per pickaxe tier: the share of hits it needs, and how often a new rock shows (ms)
const TIERS = [
  { id: "", name: "Common", k: 1, every: 20500 },
  { id: "pick1", name: "Advanced", k: 0.75, every: 16400 },
  { id: "pick2", name: "Rare", k: 0.55, every: 13400 },
  { id: "pick3", name: "Legendary", k: 0.4, every: 11000 },
];
const DAY_CAP = 40000;
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export const MINE = { SESSION_MS, COOL_MS, SWING_MS, SLACK, MAX_ROCKS, START_ROCKS, ODDS, EMPTY, RANGE, SKEW, HITS, TIERS, DAY_CAP };

/// the value of a rock of type t for two uniform numbers (e: empty or not, u: where in the range)
export function rockValue(t, e, u) {
  if (e < EMPTY) return 0;
  const [lo, hi] = RANGE[t], v = lo + (hi - lo) * Math.pow(u, SKEW[t]);
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
/// a rock's type for a uniform number
export const rockType = (u) => (u < ODDS[0] ? 0 : u < ODDS[0] + ODDS[1] ? 1 : 2);
export const rockHits = (t, tier, u) => { const [a, b] = HITS[t]; return Math.max(3, Math.round((a + (b - a) * u) * TIERS[tier].k)); };

/// deps: { getDocs, setDoc, commit, json, now, signer(b), own(w) → worldOwn, award(w, kind, n), random?, randomId? }
export function makeMine(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rnd = deps.random || (() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];
  async function tierOf(w) {
    try { const o = deps.own ? await deps.own(w) : null, it = (o && o.items) || []; for (let i = TIERS.length - 1; i > 0; i--) if (it.includes(TIERS[i].id)) return i; } catch { /* Common */ }
    return 0;
  }
  const fresh = () => ({ used: 0, inAt: 0, seen: 0, coolUntil: 0, runId: "", rocks: [], nextAt: 0, lastBreak: 0, n: 0 });
  // bring a stored hour up to now: the time used while inside, the cool-down's end, the full hour back after it
  function settle(r, t) {
    let end = t;
    if (r.inAt) {
      end = Math.min(t, Math.max(r.seen || 0, r.inAt) + BEAT_GRACE);
      r.used += Math.max(0, end - (r.from || r.inAt)); r.from = end;
      if (end < t) { r.inAt = 0; r.from = 0; } // the page went quiet: the visit ended at its last call (plus the grace)
    }
    if (r.used >= SESSION_MS && !r.coolUntil) { r.coolUntil = end - (r.used - SESSION_MS) + COOL_MS; r.used = SESSION_MS; r.inAt = 0; r.from = 0; r.rocks = []; r.nextAt = 0; }
    if (r.coolUntil && t >= r.coolUntil) { r.coolUntil = 0; r.used = 0; r.inAt = 0; r.from = 0; r.rocks = []; r.nextAt = 0; }
    return r;
  }
  const left = (r) => (r.coolUntil ? 0 : Math.max(0, SESSION_MS - r.used));
  function newRock(r, tier) {
    const taken = new Set(r.rocks.map((x) => x.x)), free = [...Array(SLOTS).keys()].filter((i) => !taken.has(i));
    if (!free.length) return;
    const t = rockType(rnd());
    r.rocks.push({ id: ++r.n, t, h: rockHits(t, tier, rnd()), x: free[Math.floor(rnd() * free.length)], at: now() });
  }
  function grow(r, tier, t) {
    const every = TIERS[tier].every;
    if (!r.nextAt) r.nextAt = t + every;
    while (r.nextAt <= t) { if (r.rocks.length < MAX_ROCKS) { newRock(r, tier); const x = r.rocks[r.rocks.length - 1]; if (x) x.at = r.nextAt; } r.nextAt += every; }
  }
  const pub = (r) => r.rocks.map(({ id, t, h, x }) => ({ id, t, h, x }));
  async function day(w, t) { return ((await one(`worldMineDay/${w}_${seoulDay(t)}`)) || {}).n || 0; }

  async function view(w) {
    const t = now(), r = settle({ ...fresh(), ...((await one(`worldMineRun/${w}`)) || {}) }, t);
    return json(200, { left: left(r), coolUntil: r.coolUntil || 0, tier: await tierOf(w), today: await day(w, t), cap: DAY_CAP });
  }
  async function enter(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), tier = await tierOf(w);
    const r = settle({ ...fresh(), ...((await one(`worldMineRun/${w}`)) || {}) }, t);
    if (r.coolUntil) return json(409, { error: "the mine is resting", coolUntil: r.coolUntil });
    // in again (or another tab): the time so far is counted; a fresh run id, so an older page's breaks no longer pay
    r.runId = rid(); r.inAt = t; r.from = t; r.seen = t; r.tier = tier; r.lastBreak = t;
    if (!r.rocks.length) { for (let i = 0; i < START_ROCKS; i++) newRock(r, tier); }
    else r.rocks.forEach((x) => { x.at = t; x.h = Math.min(x.h, rockHits(x.t, tier, 1)); }); // a better pickaxe since: the old rocks get easier too
    r.nextAt = t + TIERS[tier].every;
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, runId: r.runId, left: left(r), rocks: pub(r), tier, swing: SWING_MS, k: TIERS[tier].k, today: await day(w, t), cap: DAY_CAP });
  }
  async function load(b) {
    const s = signer(b); if (s.err) return { err: s.err };
    const w = s.wallet, t = now(), raw = await one(`worldMineRun/${w}`);
    if (!raw || !raw.runId || raw.runId !== String(b.runId || "") || !raw.inAt) return { err: json(409, { error: "that visit to the mine has ended" }) };
    const r = settle({ ...fresh(), ...raw }, t);
    if (!r.inAt || r.coolUntil) { await setDoc(`worldMineRun/${w}`, r); return { err: json(409, { error: r.coolUntil ? "your hour in the mine is used up" : "that visit to the mine has ended", coolUntil: r.coolUntil || 0, left: left(r) }) }; }
    // the hour can run out between two calls: counted up to now, at most the hour
    if (r.used >= SESSION_MS) { settle(r, t); await setDoc(`worldMineRun/${w}`, r); return { err: json(409, { error: "your hour in the mine is used up", coolUntil: r.coolUntil, left: 0 }) }; }
    r.seen = t; return { w, t, r };
  }
  async function beat(b) {
    const L = await load(b); if (L.err) return L.err;
    const { w, t, r } = L; grow(r, r.tier || 0, t);
    settle(r, t); r.seen = t;
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, left: left(r), rocks: pub(r), coolUntil: r.coolUntil || 0 });
  }
  async function brk(b) {
    const L = await load(b); if (L.err) return L.err;
    const { w, t, r } = L, tier = r.tier || 0, id = Math.floor(Number(b.rock));
    grow(r, tier, t);
    const i = r.rocks.findIndex((x) => x.id === id);
    if (i < 0) { await setDoc(`worldMineRun/${w}`, r); return json(409, { error: "that rock isn't there", rocks: pub(r), left: left(r) }); }
    const rock = r.rocks[i], need = rock.h * SWING_MS * SLACK, since = t - Math.max(rock.at || 0, r.lastBreak || 0);
    if (since < need) { await setDoc(`worldMineRun/${w}`, r); return json(429, { error: "too fast", wait: Math.ceil(need - since), rocks: pub(r), left: left(r) }); }
    // the break counts once (two requests at once, a retried one after a lost reply)
    if (!(await commit([{ create: `worldMineRock/${r.runId}_${rock.id}`, data: { at: t, wallet: w, t: rock.t } }])).ok) return json(409, { error: "that rock is already broken", rocks: pub(r), left: left(r) });
    r.rocks.splice(i, 1); r.lastBreak = t;
    const v = rockValue(rock.t, rnd(), rnd());
    const dk = `worldMineDay/${w}_${seoulDay(t)}`, today = ((await one(dk)) || {}).n || 0, pay = Math.max(0, Math.min(v, DAY_CAP - today));
    if (pay > 0) { await commit([{ inc: dk, fields: { n: pay } }]); if (deps.award) await deps.award(w, "mine", pay); }
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, got: pay, found: v, empty: v === 0, t: rock.t, capped: pay < v, rocks: pub(r), left: left(r), today: today + pay, cap: DAY_CAP });
  }
  async function leave(b) {
    const L = await load(b); if (L.err) return L.err;
    const { w, t, r } = L; settle(r, t); r.inAt = 0; r.from = 0;
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, left: left(r), coolUntil: r.coolUntil || 0 });
  }

  return {
    view,
    async handle(b) {
      if (b.action === "world-mine-enter") return enter(b);
      if (b.action === "world-mine-beat") return beat(b);
      if (b.action === "world-mine-break") return brk(b);
      if (b.action === "world-mine-leave") return leave(b);
      return null;
    },
  };
}
