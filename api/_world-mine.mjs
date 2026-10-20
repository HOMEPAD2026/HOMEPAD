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
// b5 (the owner's numbers, 17 Oct 2026):
//   ore pieces: every rock that isn't empty also gives pieces of its ore (copper 1–3; silver 1–2 and a copper half the
//   time; gold 1 and 1–2 silver), kept in worldMineInv for upgrades and the smelter
//   gems: sapphire 0.3%, ruby 0.2%, diamond 0.05% of rocks that aren't empty — collectibles for the codex (no ARCL)
//   upgrades: the pickaxe +1 to +10, each 4% fewer hits, paid in pieces and ARCL (UPG)
//   the smelter: pieces into scrap for gear (SMELT)
//   holders ($ARCIRCLE in the wallet, tiers as the halo's: any / 100K / 1M): the mine's daily limit +5,000 / +10,000 / +20,000
//   the deep mine (level 90+): rocks 30% tougher, gold 2.5% and silver 11%
//   weekend Gold Rush (Saturday and Sunday, Seoul): gold ×1.5 and 30 more minutes in the mine
//   the weekly board: ARCL mined this ISO week, the top 20
const ORE_DROP = [[[0, 1, 3]], [[1, 1, 2], [0, 0, 1]], [[2, 1, 1], [1, 1, 2]]]; // per kind: [ore, min, max] (the [0,0,1] copper: half the time)
const GEMS = [["sap", 0.003], ["ruby", 0.002], ["dia", 0.0005]];
const UPG = [{ cu: 20, arcl: 200 }, { cu: 40, arcl: 400 }, { cu: 60, ag: 10, arcl: 800 }, { cu: 80, ag: 20, arcl: 1200 }, { ag: 30, arcl: 1600 }, { ag: 40, au: 5, arcl: 2200 }, { ag: 50, au: 10, arcl: 3000 }, { au: 15, arcl: 3800 }, { au: 20, arcl: 4400 }, { au: 30, arcl: 5000 }];
const UPG_K = 0.04;
const SMELT = { cu: [10, 15], ag: [5, 40], au: [1, 60] }; // [pieces, scrap]
const HOLD_CAP = [0, 5000, 10000, 20000];
const DEEP = { level: 90, odds: [0.865, 0.11, 0.025], hits: 1.3 };
const RUSH = { gold: 1.5, extra: 30 * 60e3 };
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export const isWeekend = (t) => { const d = new Date(t + 9 * 3600e3).getUTCDay(); return d === 0 || d === 6; };
export const sessionOf = (t) => SESSION_MS + (isWeekend(t) ? RUSH.extra : 0);
export function oddsFor(deep, weekend) { const o = (deep ? DEEP.odds : ODDS).slice(); if (weekend) { o[2] *= RUSH.gold; o[0] = 1 - o[1] - o[2]; } return o; }
export const MINE = { SESSION_MS, COOL_MS, SWING_MS, SLACK, MAX_ROCKS, START_ROCKS, ODDS, EMPTY, RANGE, SKEW, HITS, TIERS, DAY_CAP, ORE_DROP, GEMS, UPG, UPG_K, SMELT, HOLD_CAP, DEEP, RUSH };

/// the value of a rock of type t for two uniform numbers (e: empty or not, u: where in the range)
export function rockValue(t, e, u) {
  if (e < EMPTY) return 0;
  const [lo, hi] = RANGE[t], v = lo + (hi - lo) * Math.pow(u, SKEW[t]);
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
/// a rock's type for a uniform number
export const rockType = (u, o = ODDS) => (u < o[0] ? 0 : u < o[0] + o[1] ? 1 : 2);
/// mod: the upgrade and the deep mine together (1 = neither)
export const rockHits = (t, tier, u, mod = 1) => { const [a, b] = HITS[t]; return Math.max(3, Math.round((a + (b - a) * u) * TIERS[tier].k * mod)); };
export const modOf = (lv, deep) => (1 - UPG_K * Math.max(0, Math.min(10, lv | 0))) * (deep ? DEEP.hits : 1);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), own(w) → worldOwn, award(w, kind, n), holdTier(w)? → 0–3,
///   level(w)? → the player's level, isoWeek(t)?, random?, randomId? }
export function makeMine(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rnd = deps.random || (() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];
  async function tierOf(w, inv) {
    let t = 0; try { const o = deps.own ? await deps.own(w) : null, it = (o && o.items) || []; for (let i = TIERS.length - 1; i > 0; i--) if (it.includes(TIERS[i].id)) { t = i; break; } } catch { /* Common */ }
    if (inv && inv.trialUntil > now()) t = Math.max(t, 1); // the welcome week's Advanced pickaxe, for its 7 days
    return t;
  }
  const invFresh = () => ({ cu: 0, ag: 0, au: 0, gems: { sap: 0, ruby: 0, dia: 0 }, lv: 0, trialUntil: 0, found: { cu: 0, ag: 0, au: 0 } });
  async function invOf(w) { const v = (await one(`worldMineInv/${w}`)) || {}; const f = invFresh(); return { ...f, ...v, gems: { ...f.gems, ...(v.gems || {}) }, found: { ...f.found, ...(v.found || {}) } }; }
  const holdOf = async (w) => { try { return deps.holdTier ? Math.max(0, Math.min(3, (await deps.holdTier(w)) | 0)) : 0; } catch { return 0; } };
  const levelOf = async (w) => { try { return deps.level ? (await deps.level(w)) || 0 : 0; } catch { return 0; } };
  const wkOf = (t) => (deps.isoWeek ? deps.isoWeek(t) : seoulDay(t - ((new Date(t + 9 * 3600e3).getUTCDay() + 6) % 7) * 864e5));
  const fresh = () => ({ used: 0, inAt: 0, seen: 0, coolUntil: 0, runId: "", rocks: [], nextAt: 0, lastBreak: 0, n: 0 });
  // bring a stored hour up to now: the time used while inside, the cool-down's end, the full hour back after it
  function settle(r, t) {
    let end = t;
    if (r.inAt) {
      end = Math.min(t, Math.max(r.seen || 0, r.inAt) + BEAT_GRACE);
      r.used += Math.max(0, end - (r.from || r.inAt)); r.from = end;
      if (end < t) { r.inAt = 0; r.from = 0; } // the page went quiet: the visit ended at its last call (plus the grace)
    }
    const SES = sessionOf(t);
    if (r.used >= SES && !r.coolUntil) { r.coolUntil = end - (r.used - SES) + COOL_MS; r.used = SES; r.inAt = 0; r.from = 0; r.rocks = []; r.nextAt = 0; }
    if (r.coolUntil && t >= r.coolUntil) { r.coolUntil = 0; r.used = 0; r.inAt = 0; r.from = 0; r.rocks = []; r.nextAt = 0; }
    return r;
  }
  const left = (r) => (r.coolUntil ? 0 : Math.max(0, sessionOf(now()) - r.used));
  function newRock(r, tier) {
    const taken = new Set(r.rocks.map((x) => x.x)), free = [...Array(SLOTS).keys()].filter((i) => !taken.has(i));
    if (!free.length) return;
    const t = rockType(rnd(), r.odds || ODDS);
    r.rocks.push({ id: ++r.n, t, h: rockHits(t, tier, rnd(), r.mod || 1), x: free[Math.floor(rnd() * free.length)], at: now() });
  }
  function grow(r, tier, t) {
    const every = TIERS[tier].every;
    if (!r.nextAt) r.nextAt = t + every;
    while (r.nextAt <= t) { if (r.rocks.length < MAX_ROCKS) { newRock(r, tier); const x = r.rocks[r.rocks.length - 1]; if (x) x.at = r.nextAt; } r.nextAt += every; }
  }
  const pub = (r) => r.rocks.map(({ id, t, h, x }) => ({ id, t, h, x }));
  async function day(w, t) { return ((await one(`worldMineDay/${w}_${seoulDay(t)}`)) || {}).n || 0; }

  const capOf = (hold) => DAY_CAP + (HOLD_CAP[hold] || 0);
  const nextUpg = (lv) => (lv < UPG.length ? UPG[lv] : null);
  const pubInv = (v) => ({ cu: v.cu, ag: v.ag, au: v.au, gems: v.gems, lv: v.lv, trialUntil: v.trialUntil || 0, found: v.found, next: nextUpg(v.lv) });
  async function board(t) { const d = (await one(`worldStats/mineWeek_${wkOf(t)}`)) || {}; return d.top || []; }
  async function view(w, withBoard = false) {
    const t = now(), [raw, inv, hold, lv] = await Promise.all([one(`worldMineRun/${w}`), invOf(w), holdOf(w), levelOf(w)]), r = settle({ ...fresh(), ...(raw || {}) }, t);
    return json(200, { left: left(r), coolUntil: r.coolUntil || 0, tier: await tierOf(w, inv), today: await day(w, t), cap: capOf(hold), hold, inv: pubInv(inv),
      deepOk: lv >= DEEP.level, rush: isWeekend(t), session: sessionOf(t), ...(withBoard ? { board: await board(t) } : {}) });
  }
  async function enter(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), [inv, hold, lv] = await Promise.all([invOf(w), holdOf(w), levelOf(w)]), tier = await tierOf(w, inv);
    const deep = b.deep === true && lv >= DEEP.level, rush = isWeekend(t);
    if (b.deep === true && !deep) return json(403, { error: `the deep mine opens at level ${DEEP.level}` });
    const r = settle({ ...fresh(), ...((await one(`worldMineRun/${w}`)) || {}) }, t);
    if (r.coolUntil) return json(409, { error: "the mine is resting", coolUntil: r.coolUntil });
    const mod = modOf(inv.lv, deep), odds = oddsFor(deep, rush), changed = (r.deep || false) !== deep;
    // in again (or another tab): the time so far is counted; a fresh run id, so an older page's breaks no longer pay
    r.runId = rid(); r.inAt = t; r.from = t; r.seen = t; r.tier = tier; r.lastBreak = t; r.mod = mod; r.odds = odds; r.deep = deep; r.hold = hold;
    if (changed) r.rocks = []; // from the mine to the deep mine (or back): a fresh cave
    if (!r.rocks.length) { for (let i = 0; i < START_ROCKS; i++) newRock(r, tier); }
    else r.rocks.forEach((x) => { x.at = t; x.h = Math.min(x.h, rockHits(x.t, tier, 1, mod)); }); // a better pickaxe since: the old rocks get easier too
    r.nextAt = t + TIERS[tier].every;
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, runId: r.runId, left: left(r), rocks: pub(r), tier, swing: SWING_MS, k: TIERS[tier].k * mod, today: await day(w, t), cap: capOf(hold), hold, deep, rush, session: sessionOf(t), inv: pubInv(inv) });
  }
  async function load(b) {
    const s = signer(b); if (s.err) return { err: s.err };
    const w = s.wallet, t = now(), raw = await one(`worldMineRun/${w}`);
    if (!raw || !raw.runId || raw.runId !== String(b.runId || "") || !raw.inAt) return { err: json(409, { error: "that visit to the mine has ended" }) };
    const r = settle({ ...fresh(), ...raw }, t);
    if (!r.inAt || r.coolUntil) { await setDoc(`worldMineRun/${w}`, r); return { err: json(409, { error: r.coolUntil ? "your hour in the mine is used up" : "that visit to the mine has ended", coolUntil: r.coolUntil || 0, left: left(r) }) }; }
    // the hour can run out between two calls: counted up to now, at most the hour
    if (r.used >= sessionOf(t)) { settle(r, t); await setDoc(`worldMineRun/${w}`, r); return { err: json(409, { error: "your hour in the mine is used up", coolUntil: r.coolUntil, left: 0 }) }; }
    r.seen = t; return { w, t, r };
  }
  async function beat(b) {
    const L = await load(b); if (L.err) return L.err;
    const { w, t, r } = L; grow(r, r.tier || 0, t);
    settle(r, t); r.seen = t;
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, left: left(r), rocks: pub(r), coolUntil: r.coolUntil || 0 });
  }
  const pick = (a, b) => a + Math.floor(rnd() * (b - a + 1));
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
    const v = rockValue(rock.t, rnd(), rnd()), cap = capOf(r.hold || 0);
    const dk = `worldMineDay/${w}_${seoulDay(t)}`, today = ((await one(dk)) || {}).n || 0, pay = Math.max(0, Math.min(v, cap - today));
    // the ore inside (and now and then a gem): pieces for upgrades and the smelter, kept apart from ARCL
    const ore = { cu: 0, ag: 0, au: 0 }, K3 = ["cu", "ag", "au"]; let gem = null;
    if (v > 0) { for (const [o, a, z] of ORE_DROP[rock.t]) ore[K3[o]] += pick(a, z); const g = rnd(); let acc = 0; for (const [k, p] of GEMS) { acc += p; if (g < acc) { gem = k; break; } } }
    if (v > 0) { const inv = await invOf(w); inv.cu += ore.cu; inv.ag += ore.ag; inv.au += ore.au; inv.found[K3[rock.t]] = (inv.found[K3[rock.t]] || 0) + 1; if (gem) inv.gems[gem] = (inv.gems[gem] || 0) + 1; await setDoc(`worldMineInv/${w}`, inv); }
    if (pay > 0) {
      const wk = wkOf(t);
      await commit([{ inc: dk, fields: { n: pay } }, { inc: `worldMineWk/${wk}_${w}`, fields: { n: pay } }]); if (deps.award) await deps.award(w, "mine", pay);
      try { const key = `worldStats/mineWeek_${wk}`, d = await getDocs([`worldMineWk/${wk}_${w}`, key]), mine = (d[`worldMineWk/${wk}_${w}`] || {}).n || pay, cur = d[key] || { top: [] };
        const nm = deps.nameOf ? await deps.nameOf(w).catch(() => "") : "";
        await setDoc(key, { top: [{ w: w.slice(0, 6) + "…" + w.slice(-4), id: w, n: mine, name: nm || "" }, ...(cur.top || []).filter((x) => x.id !== w)].sort((a, b2) => b2.n - a.n).slice(0, 20) }); } catch { /* the board catches up on the next break */ }
    }
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, got: pay, found: v, empty: v === 0, t: rock.t, capped: pay < v, rocks: pub(r), left: left(r), today: today + pay, cap, ore, gem });
  }
  async function leave(b) {
    const L = await load(b); if (L.err) return L.err;
    const { w, t, r } = L; settle(r, t); r.inAt = 0; r.from = 0;
    await setDoc(`worldMineRun/${w}`, r);
    return json(200, { ok: true, left: left(r), coolUntil: r.coolUntil || 0 });
  }
  // the pickaxe one step up: pieces and ARCL, once per level (two at once can't both pay)
  async function upgrade(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, inv = await invOf(w), c = nextUpg(inv.lv);
    if (!c) return json(400, { error: "your pickaxe is at +10" });
    for (const k of ["cu", "ag", "au"]) if ((c[k] || 0) > (inv[k] || 0)) return json(400, { error: "not enough ore", need: c });
    const bal = ((await one(`worldArclBal/${w}`)) || {}).bal || 0; if (bal < c.arcl) return json(400, { error: "not enough ARCL", need: c });
    if (!(await commit([{ create: `worldMineUpg/${w}_${inv.lv + 1}`, data: { at: now() } }, { inc: `worldArclBal/${w}`, fields: { bal: -c.arcl, spent: c.arcl } }])).ok) return json(409, { error: "that upgrade is already done" });
    for (const k of ["cu", "ag", "au"]) inv[k] -= c[k] || 0; inv.lv += 1; await setDoc(`worldMineInv/${w}`, inv);
    if (deps.ledger) try { const b = await deps.ledger.afterSpend(w, c.arcl); await deps.ledger.record(w, "spend", "mine-upgrade", -c.arcl, { b }); } catch { /* recorded best effort */ }
    return json(200, { ok: true, inv: pubInv(inv), arcl: bal - c.arcl });
  }
  // the smelter: ore pieces into scrap (the game adds the scrap to the save, as with the Forge)
  async function smelt(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, k = String(b.ore || ""), m = SMELT[k]; if (!m) return json(400, { error: "pick an ore" });
    const times = Math.max(1, Math.min(50, Math.floor(Number(b.times) || 1))), inv = await invOf(w);
    const n = Math.min(times, Math.floor((inv[k] || 0) / m[0])); if (n < 1) return json(400, { error: "not enough ore" });
    if (!(await commit([{ create: `worldMineSmelt/${w}_${Math.floor(now() / 2000)}`, data: { at: now() } }])).ok) return json(429, { error: "one moment" });
    inv[k] -= n * m[0]; await setDoc(`worldMineInv/${w}`, inv);
    return json(200, { ok: true, supply: { kind: "scrap", n: n * m[1] }, inv: pubInv(inv) });
  }
  /// the welcome week's Advanced pickaxe for 7 days (api/_world-welcome.mjs)
  async function trial(w, ms) { const inv = await invOf(w); inv.trialUntil = Math.max(inv.trialUntil || 0, now()) + ms; await setDoc(`worldMineInv/${w}`, inv); return inv.trialUntil; }

  /// for Jurassic World (api/_world-jur.mjs): the same ore pockets and pickaxe, read and added to
  async function addOre(w, ore) { const inv = await invOf(w); for (const k of ["cu", "ag", "au"]) inv[k] = (inv[k] || 0) + Math.max(0, Math.floor(ore[k] || 0)); await setDoc(`worldMineInv/${w}`, inv); return pubInv(inv); }
  async function oreOf(w) { const inv = await invOf(w), t = await tierOf(w, inv); return { inv: pubInv(inv), tier: t, k: (TIERS[t] || TIERS[0]).k * modOf(inv.lv || 0, false) }; }
  async function takeOre(w, need) { const inv = await invOf(w); for (const k of ["cu", "ag", "au"]) if ((need[k] || 0) > (inv[k] || 0)) return null; for (const k of ["cu", "ag", "au"]) inv[k] -= need[k] || 0; await setDoc(`worldMineInv/${w}`, inv); return pubInv(inv); }

  return {
    view, trial, addOre, oreOf, takeOre,
    async handle(b) {
      if (b.action === "world-mine-enter") return enter(b);
      if (b.action === "world-mine-beat") return beat(b);
      if (b.action === "world-mine-break") return brk(b);
      if (b.action === "world-mine-leave") return leave(b);
      if (b.action === "world-mine-upgrade") return upgrade(b);
      if (b.action === "world-mine-smelt") return smelt(b);
      return null;
    },
  };
}
