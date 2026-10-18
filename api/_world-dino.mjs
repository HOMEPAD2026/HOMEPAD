// api/_world-dino.mjs — DINO SOULMATE (world-dino.js in Jurassic World): the wild eggs, the 72-hour care, the hatch and
// the one companion an account raises. Everything that decides is here, on the server's clock (the rules are
// api/_world-dino-engine.mjs, a copy of the game's world-dino-engine.js): which nest has an egg, who got it first, each
// day's care window and the egg dying when one is missed, the hatch, the companion's level, experience and bond.
// One egg or one companion an account, never both; no trading, no second one. Treats can be bought with ARCL
// (a convenience: they feed like raw meat, they add no strength).
//
//   GET  ?world=dino&wallet=0x…                → { egg, buddy, memorial, treats, now }
//   GET  ?world=dino-nests                     → { eggs: [{ nest, x, z, to }], now }     (the eggs out now, unclaimed)
//   POST world-dino-claim  { …sig, nest }      → { egg }      (one a day; not with an egg or a companion already)
//   POST world-dino-care   { …sig, kind }      → { egg, inv }  (warm: 2 wood · water · feed: a treat, raw meat or 2 berries)
//   POST world-dino-hatch  { …sig, name }      → { buddy }    (72 h after it was found, all three days cared for)
//   POST world-dino-buddy  { …sig, op }        → { buddy }    (feed · pet · rest · name)
//   POST world-dino-food   { …sig, pack }      → { treats, bal } (ARCL → treats)
//   POST world-dino-mission { …sig, id }       → { buddy, treats }  (a day's mission done: its reward, once)
//   POST world-dino-battle { …sig }            → { log, win, foe, rating, buddy } (Dino Battles: five a day, a rating; no ARCL)
//   GET  ?world=dino-ladder                    → { top: [{ name, lv, rating, … }] }
// A new player's first egg waits at DINO.FIRST for them alone (nest "first"). Every egg carries genes (genesOf: the
// species, colours, eyes, rarity — the look only); its rarity shows on the egg, the rest when it hatches.
// and for api/_world-jur.mjs: assist(w) (the companion's share of a hunt's swings), hunt(w, kind), gather(w).
//
// Firestore: worldDino/<w> { egg, buddy, memorial, claimDay, v } (+ worldDinoSeq/<w>_<v> with each change) ·
//            worldDinoClaim/<nest>_<slot> (the first to pick an egg up) · worldDinoFood/<w> { n } · worldDinoFoodDay/<w>_<day> ·
//            worldDinoRank/<w> (a companion on the battle ladder) · worldDinoIdx { ws } (who's on it)
import { DINO, eggsAt, eggState, care as careE, gainXp, gainBond, away, stageOf, assistOf, genesOf, missionsOf, bumpMission, battle, rated, statsOf } from "./_world-dino-engine.mjs";

const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const cleanName = (s) => String(s || "").replace(/[<>\u0000-\u001f"'`\\]/g, "").trim().slice(0, 14);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), debit(w, kind, n)?, level(w)?, jur: { take(w, need) → { ok, inv } | { err } } }
export function makeDino(deps) {
  const { getDocs, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const key = (w) => `worldDino/${w}`;
  /// your record, brought up to now: a dead egg goes to the memorial, days away cost the companion a little bond
  function norm(D0, t) {
    const D = { egg: null, buddy: null, memorial: [], claimDay: "", v: 0, ...(D0 || {}) };
    if (D.egg) { const s = eggState(D.egg, t); if (s.stage === "DEAD") { D.memorial = [...D.memorial, { found: D.egg.found, died: s.deadAt, day: s.day, nest: D.egg.nest }].slice(-10); D.egg = null; D.lost = true; } }
    if (D.buddy) D.buddy = away(D.buddy, seoulDay(t));
    return D;
  }
  async function save(w, D) { const v = (D.v || 0) + 1, { lost, ...rec } = D; const r = await commit([{ create: `worldDinoSeq/${w}_${v}`, data: { at: now() } }, { set: key(w), data: { ...rec, v } }]); if (r.ok) D.v = v; return r.ok; }
  /// one change: load, change, save (a clash with another request reloads and tries again)
  async function mutate(w, fn) {
    for (let k = 0; k < 3; k++) {
      const t = now(), D = norm(await one(key(w)), t), r = await fn(D, t); if (r && r.err) return r;
      if (await save(w, D)) return { D, r };
    }
    return { err: json(409, { error: "one moment" }) };
  }
  const treats = async (w) => ((await one(`worldDinoFood/${w}`)) || {}).n || 0;
  /// a feed: a treat if you have one, else raw meat, else two berries (from your Jurassic pack)
  async function payFeed(w) {
    if ((await treats(w)) > 0 && (await commit([{ inc: `worldDinoFood/${w}`, fields: { n: -1 } }])).ok) return { ok: true, used: "treat" };
    for (const need of DINO.FEED.slice(1)) { const r = deps.jur ? await deps.jur.take(w, need) : { err: "no pack" }; if (r.ok) return { ok: true, used: Object.keys(need)[0], inv: r.inv }; }
    return { err: "you need a dino treat, raw meat or 2 berries" };
  }
  const firstOk = (D) => !D.egg && !D.buddy && !D.firstUsed && !(D.memorial || []).length;
  const genesB = (B, w) => B.genes || genesOf("b_" + (B.found || B.hatched) + "_" + w);
  const view = (D, t, extra = {}, w = "") => {
    const e = D.egg ? { ...D.egg, rarity: genesOf(D.egg.id).rarity, state: eggState(D.egg, t) } : null, b = D.buddy ? { ...D.buddy, genes: genesB(D.buddy, w), stage: stageOf(D.buddy, t) } : null;
    return { ok: true, egg: e, buddy: b, memorial: D.memorial || [], lost: !!D.lost, first: firstOk(D) ? DINO.FIRST : null, missions: b ? missionsOf(D.m, seoulDay(t)) : null, battles: b ? { left: Math.max(0, DINO.BATTLES_DAY - (D.bt && D.bt.day === seoulDay(t) ? D.bt.n : 0)), rating: D.rating || DINO.RATING0, w: D.bw || 0, l: D.bl || 0 } : null, now: t, ...extra };
  };
  const lvOf = async (w) => (deps.level ? (await deps.level(w).catch(() => 1)) || 1 : 1);

  async function claim(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, nest = String(b.nest || "");
    if (nest === DINO.FIRST.id) {
      const r = await mutate(w, (D2, t2) => { if (!firstOk(D2)) return { err: json(409, { error: "your first egg is already yours" }) }; D2.egg = { id: "first_" + w, nest, found: t2, done: [], cares: {} }; D2.firstUsed = true; D2.claimDay = seoulDay(t2); return null; });
      return r.err || json(200, view(r.D, now(), {}, w));
    }
    const t = now(), egg = eggsAt(t).find((x) => x.nest === nest); if (!egg) return json(404, { error: "there's no egg there now" });
    const D = norm(await one(key(w)), t);
    if (D.buddy) return json(409, { error: "you already have a companion" });
    if (D.egg) return json(409, { error: "you're already caring for an egg" });
    if (D.claimDay === seoulDay(t)) return json(409, { error: "one egg a day: come back tomorrow" });
    if (!(await commit([{ create: `worldDinoClaim/${nest}_${egg.slot}`, data: { w, at: t } }])).ok) return json(409, { error: "someone picked it up first" });
    const r = await mutate(w, (D2) => { if (D2.egg || D2.buddy) return { err: json(409, { error: "you already have one" }) }; D2.egg = { id: nest + "_" + egg.slot, nest, found: t, done: [], cares: {} }; D2.claimDay = seoulDay(t); D2.firstUsed = true; return null; });
    if (r.err) return r.err;
    return json(200, view(r.D, now(), {}, w));
  }
  async function careFor(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, kind = String(b.kind || "");
    const t = now(), D0 = norm(await one(key(w)), t);
    if (!D0.egg) { if (D0.lost) await save(w, D0); return json(409, { error: D0.lost ? "the egg didn't make it" : "you have no egg", lost: !!D0.lost, memorial: D0.memorial }); }
    const dry = careE(D0.egg, kind, t); if (dry.err) return json(400, { error: dry.err });
    let inv = null;
    if (kind === "warm") { const p = deps.jur ? await deps.jur.take(w, DINO.WARM) : { err: "no pack" }; if (p.err) return json(400, { error: "warming takes 2 wood" }); inv = p.inv; }
    if (kind === "feed") { const p = await payFeed(w); if (p.err) return json(400, { error: p.err }); inv = p.inv || null; }
    const r = await mutate(w, (D) => { if (!D.egg) return { err: json(409, { error: "you have no egg" }) }; const c = careE(D.egg, kind, t); if (c.err) return { err: json(400, { error: c.err }) }; D.egg = c.egg; return null; });
    if (r.err) return r.err;
    return json(200, view(r.D, now(), { inv, treats: await treats(w) }, w));
  }
  async function hatch(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, name = cleanName(b.name) || "Rexy";
    const r = await mutate(w, (D, t) => {
      if (D.buddy) return { err: json(409, { error: "you already have a companion" }) };
      const st = D.egg && eggState(D.egg, t); if (!st || st.stage !== "READY") return { err: json(409, { error: st && st.stage === "WAIT" ? "not yet: it hatches 72 hours after you found it" : "there's no egg ready to hatch" }) };
      const g = genesOf(D.egg.id); D.buddy = { name, species: g.species, genes: g, lv: 1, xp: 0, bond: DINO.BOND0, hatched: t, hunts: 0, bosses: 0, seen: seoulDay(t), found: D.egg.found, egg: D.egg.id }; D.egg = null; return null;
    });
    if (r.err) return r.err;
    await onLadder(w, r.D).catch(() => {});
    return json(200, view(r.D, now(), {}, w));
  }
  async function buddyOp(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, op = String(b.op || ""), lv = await lvOf(w);
    let paid = null;
    if (op === "feed") { const D0 = norm(await one(key(w)), now()); if (!D0.buddy) return json(409, { error: "you have no companion" }); paid = await payFeed(w); if (paid.err) return json(400, { error: paid.err }); }
    const r = await mutate(w, (D, t) => {
      const B = D.buddy; if (!B) return { err: json(409, { error: "you have no companion" }) }; const day = seoulDay(t);
      if (op === "feed") D.buddy = gainXp(gainBond(B, DINO.BOND.feed, day), DINO.XP_FEED, lv);
      else if (op === "pet") { if (t - (B.petAt || 0) < 5 * 60e3) return { err: json(429, { error: "it's had a pat — in a few minutes" }) }; D.buddy = { ...gainXp(gainBond(B, DINO.BOND.pet, day), DINO.XP_PET, lv), petAt: t }; D.m = bumpMission(D.m, "pet", day); }
      else if (op === "rest") { if (t - (B.restAt || 0) < 3600e3) return { err: json(429, { error: "it's rested — in an hour" }) }; D.buddy = { ...gainBond(B, DINO.BOND.rest, day), restAt: t }; D.m = bumpMission(D.m, "rest", day); }
      else if (op === "name") { const n = cleanName(b.name); if (!n) return { err: json(400, { error: "a name, please" }) }; D.buddy = { ...B, name: n }; }
      else return { err: json(400, { error: "feed, pet, rest or name" }) };
      return null;
    });
    if (r.err) return r.err;
    return json(200, view(r.D, now(), { inv: paid && paid.inv, treats: await treats(w) }, w));
  }
  /// a day's mission done: its reward, once
  async function mission(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, id = String(b.id || ""), lv = await lvOf(w), M = DINO.MISSIONS.find((x) => x.id === id);
    if (!M) return json(400, { error: "which mission?" });
    const r = await mutate(w, (D, t) => { const day = seoulDay(t); if (!D.buddy) return { err: json(409, { error: "you have no companion" }) };
      const st = missionsOf(D.m, day).find((x) => x.id === id); if (!st.done) return { err: json(400, { error: "not done yet" }) }; if (st.got) return { err: json(409, { error: "already collected" }) };
      const m = D.m && D.m.day === day ? D.m : { day, c: {}, got: [] }; D.m = { ...m, got: [...m.got, id] };
      let o = D.buddy; if (M.xp) o = gainXp(o, M.xp, lv); if (M.bond) o = gainBond(o, M.bond, day); D.buddy = o; return null; });
    if (r.err) return r.err;
    if (M.treat) await commit([{ inc: `worldDinoFood/${w}`, fields: { n: M.treat } }]);
    return json(200, view(r.D, now(), { treats: await treats(w) }, w));
  }
  // ---------------- Dino Battles ----------------
  const rankOf = (w, D) => { const B = D.buddy, g = genesB(B, w); return { name: B.name, lv: B.lv, bond: B.bond, stage: stageOf(B, now()), species: g.species, pal: g.pal, eye: g.eye, rarity: g.rarity, rating: D.rating || DINO.RATING0, w: D.bw || 0, l: D.bl || 0, at: now() }; };
  async function onLadder(w, D) {
    if (!D.buddy) return; await deps.setDoc(`worldDinoRank/${w}`, rankOf(w, D));
    const ix = (await one("worldDinoIdx")) || { ws: [] }; if (!ix.ws.includes(w)) await deps.setDoc("worldDinoIdx", { ws: [...ix.ws, w].slice(-500) });
  }
  /// a wild one of about your level when there's nobody to battle yet
  const wild = (me, seed) => { const lv = Math.max(1, me.lv + Math.floor((seed % 5) - 2)), g = genesOf("wild_" + seed); return { name: g.species === "trike" ? "Wild Trike" : "Wild Raptor", lv, bond: 30, stage: me.stage, species: g.species, pal: g.pal, eye: g.eye, rarity: "common", rating: DINO.RATING0, wild: true }; };
  async function fight(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, lv = await lvOf(w), t = now(), day = seoulDay(t);
    const D0 = norm(await one(key(w)), t); if (!D0.buddy) return json(409, { error: "you have no companion" });
    if (D0.bt && D0.bt.day === day && D0.bt.n >= DINO.BATTLES_DAY) return json(429, { error: "that's today's battles — come back tomorrow" });
    const me = rankOf(w, D0), ix = ((await one("worldDinoIdx")) || { ws: [] }).ws.filter((x) => x !== w), seed = (t ^ parseInt(w.slice(2, 10), 16)) >>> 0;
    const pool = []; for (let i = 0; i < Math.min(12, ix.length); i++) pool.push(ix[(seed + i * 7919) % ix.length]);
    const docs = pool.length ? await getDocs([...new Set(pool)].map((x) => `worldDinoRank/${x}`)) : {};
    const cands = Object.values(docs).filter(Boolean).sort((a, c) => Math.abs(a.rating - me.rating) - Math.abs(c.rating - me.rating));
    const foe = cands[0] || wild(me, seed), st = (x) => statsOf({ lv: x.lv, bond: x.bond }, {});
    const res = battle({ stats: st(me), stage: me.stage, name: me.name }, { stats: st(foe), stage: foe.stage, name: foe.name }, seed);
    const r = await mutate(w, (D, t2) => { const d2 = seoulDay(t2); if (!D.buddy) return { err: json(409, { error: "you have no companion" }) };
      const bt = D.bt && D.bt.day === d2 ? D.bt : { day: d2, n: 0 }; if (bt.n >= DINO.BATTLES_DAY) return { err: json(429, { error: "that's today's battles — come back tomorrow" }) };
      D.bt = { day: d2, n: bt.n + 1 }; D.rating = rated(D.rating || DINO.RATING0, foe.rating, res.win); if (res.win) D.bw = (D.bw || 0) + 1; else D.bl = (D.bl || 0) + 1;
      D.buddy = gainBond(gainXp(D.buddy, DINO.BATTLE_XP, lv), 1, d2); D.m = bumpMission(D.m, "battle", d2); return null; });
    if (r.err) return r.err;
    await onLadder(w, r.D).catch(() => {});
    const { at, ...pubFoe } = foe;
    return json(200, view(r.D, now(), { fight: { log: res.log, win: res.win, hp: res.hp, me: { name: me.name, stats: st(me), stage: me.stage, species: me.species, pal: me.pal, eye: me.eye, rarity: me.rarity }, foe: { ...pubFoe, stats: st(foe) }, rating: r.D.rating } }, w));
  }
  async function food(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, pk = DINO.FOOD.find((x) => x.id === String(b.pack || ""));
    if (!pk) return json(400, { error: "no such pack" }); if (!deps.debit) return json(503, { error: "the shop is closed" });
    const dk = `worldDinoFoodDay/${w}_${seoulDay(now())}`, got = ((await one(dk)) || {}).n || 0; if (got + pk.n > DINO.FOOD_DAY) return json(400, { error: "that's today's treats", left: Math.max(0, DINO.FOOD_DAY - got) });
    const d = await deps.debit(w, "dino-treats", pk.arcl); if (d.err) return json(400, { error: d.err });
    await commit([{ inc: `worldDinoFood/${w}`, fields: { n: pk.n } }, { inc: dk, fields: { n: pk.n } }]);
    return json(200, { ok: true, treats: await treats(w), bal: d.bal });
  }
  // ---------------- for the hunts (api/_world-jur.mjs) ----------------
  async function buddyOf(w) { const D = norm(await one(key(w)), now()); return D.buddy; }
  /// its share of a hunt's swings (0 without one)
  async function assist(w) { return assistOf(await buddyOf(w)); }
  /// a hunt it was out for: experience, the hunts count (bond each 10), a boss's bond
  async function hunt(w, kind) {
    const lv = await lvOf(w);
    const r = await mutate(w, (D, t) => { const B = D.buddy; if (!B) return { err: true }; const day = seoulDay(t);
      let o = gainXp({ ...B, hunts: (B.hunts || 0) + 1 }, DINO.XP_HUNT[kind] || 20, lv); if (o.hunts % 10 === 0) o = gainBond(o, DINO.BOND.hunts10, day);
      if (DINO.BOSSES.includes(kind)) { o = gainBond({ ...o, bosses: (o.bosses || 0) + 1 }, DINO.BOND.boss, day); }
      D.buddy = o; D.m = bumpMission(D.m, "hunt", day); return null; });
    return r.err ? null : r.D.buddy;
  }
  async function gather(w) { const lv = await lvOf(w); const r = await mutate(w, (D) => { if (!D.buddy) return { err: true }; D.buddy = gainXp(D.buddy, DINO.XP_GATHER, lv); return null; }); return r.err ? null : r.D.buddy; }

  /// a companion's look for the town (species.palette.rarity.stage), or ""
  async function look(w) { const B = await buddyOf(w); if (!B) return ""; const g = genesB(B, w); return `${g.species}.${g.pal}.${g.rarity}.${stageOf(B, now())}`; }
  return {
    assist, hunt, gather, look,
    async read(v, url) {
      if (v === "dino-nests") { const t = now(), live = eggsAt(t), cl = await getDocs(live.map((e) => `worldDinoClaim/${e.nest}_${e.slot}`)); return json(200, { eggs: live.filter((e) => !cl[`worldDinoClaim/${e.nest}_${e.slot}`]).map(({ nest, slot, x, z, to }) => ({ nest, slot, x, z, to })), now: t }, "public, max-age=15"); }
      if (v === "dino-ladder") { const ix = ((await one("worldDinoIdx")) || { ws: [] }).ws, docs = ix.length ? await getDocs(ix.map((x) => `worldDinoRank/${x}`)) : {};
        return json(200, { top: Object.values(docs).filter(Boolean).sort((a, c) => c.rating - a.rating || c.lv - a.lv).slice(0, 20).map(({ at, ...x }) => x) }, "public, max-age=60"); }
      if (v !== "dino") return null;
      const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase(), t = now();
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, { ok: true, egg: null, buddy: null, memorial: [], now: t });
      const D = norm(await one(key(w)), t); return json(200, view(D, t, { treats: await treats(w) }, w), "no-store");
    },
    async handle(b) {
      switch (b.action) {
        case "world-dino-claim": return claim(b);
        case "world-dino-care": return careFor(b);
        case "world-dino-hatch": return hatch(b);
        case "world-dino-buddy": return buddyOp(b);
        case "world-dino-food": return food(b);
        case "world-dino-mission": return mission(b);
        case "world-dino-battle": return fight(b);
        default: return null;
      }
    },
  };
}
