// api/_world-hwrealm.mjs — the HALLOWEEN REALM's server side (2026-10-28, the owner's spec v1.0): the realm's clock is
// the server's (world-hwrealm-data.js clockOf: 30 minutes, 20 day + 10 night); the Inferno Jack set's pieces are held here,
// apart from the bag's gear (the owner: items of their own, not traded for now). A knock-out in one of the realm's grounds is
// reported; the server rolls its drop (the spec's rates, ×1.5 at night) and its Pumpkin Soul Fragments, at most one report
// each 0.7 s and 4,000 a Seoul day, a ground's boss once in 10 minutes and Inferno Jack once in 20 a wallet, and only from a
// saved level that could be in that ground (its lowest level − 10).
//
//   GET  ?world=hw&wallet=0x…?                          { clock, set: { pieces, eq, frag } }
//   POST { action: "world-hw-kill", …sig, zone, rank, lv }  rank "" / elite / boss / jack → { drop?, frag, night, pity }
//        (HX1: every FRAG.PITY-th knock-out of a day adds a sure fragment; pity = knock-outs to the next one; a boss again
//        inside its window counts as a plain knock-out instead of nothing)
//   POST { action: "world-hw-equip", …sig, slot, id|null }   wear a piece in its slot (or take it off)
//   POST { action: "world-hw-salvage", …sig, id }            a piece → fragments (20 + its + × 2)
//   POST { action: "world-hw-craft", …sig, slot }            100 fragments → a piece of that slot
//   POST { action: "world-hw-enhance", …sig, id }            fragments for a chance at +1 (to +10; a miss keeps the +)
//
//   POST { action: "world-hw-treat", …sig, house }        HX2: knock once a Seoul day a house → { trick } | { frag } | { arcl } (worldHwTreat/<w>_<house>_<day>)
//   POST { action: "world-hw-gimmick", …sig, kind }       HX3: chest (forest) 3 · tomb (graveyard) 5 fragments, once a Seoul day each
//   GET  ?world=hw-top&wallet=0x…?                      HX3: this week's hunters (worldHwWk/<monday>_<w>, worldStats/hwWkTop_<monday>)
//   GET  ?world=hw-jack&wallet=0x…?                     HX2: the night's shared Inferno Jack { cycle, night, hp, max, down, top, mine, claimed, last }
//   POST { action: "world-hw-jack-hit", …sig, dmg }        damage in the last 5 s (night only, ≤ 60 × level, Lv 340+)
//   POST { action: "world-hw-jack-claim", …sig, cycle }    after he fell: top 3 → 30 / 20 / 10 fragments, ≥ 2 % of his HP → 5
//            worldHwNj/<cycle> { dmg } · worldHwNjDmg/<cycle>_<w> { n } · worldStats/hwNjTop_<cycle> · worldHwNjFell/<cycle> · worldHwNjClaim/<cycle>_<w>
// Firestore: worldHwSet/<wallet> { pieces: [{ id, k, p, at, src }], eq: { slot: id }, frag } · worldHwGap/… · worldHwDay/… ·
// worldHwBoss/<wallet>_<zone>_<10 min> · worldHwJack/<wallet>_<20 min>
import { HW, SET, GROUNDS, clockOf, pieceOf, pieceOfSlot, dropChance } from "../world-hwrealm-data.js";
import { randomBytes } from "node:crypto";

const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const MAX_PIECES = 60;

/// deps: { getDocs, setDoc, commit, json, now, signer(b), level(wallet), rand?() }
export function makeHwRealm(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now(), rand = deps.rand || Math.random;
  const one = async (p) => (await getDocs([p]))[p];
  const newId = () => "hw" + randomBytes(5).toString("hex");
  const setOf = async (w) => { const d = (await one(`worldHwSet/${w}`)) || {}; return { pieces: Array.isArray(d.pieces) ? d.pieces : [], eq: d.eq && typeof d.eq === "object" ? d.eq : {}, frag: Math.max(0, Math.floor(d.frag || 0)) }; };
  const pub = (s) => ({ pieces: s.pieces.map(({ id, k, p, at, src }) => ({ id, k, p: p || 0, at, src })), eq: s.eq, frag: s.frag });
  const piece = (k, src) => ({ id: newId(), k, p: 0, at: now(), src });
  const randSlot = () => SET.PIECES[Math.floor(rand() * SET.PIECES.length)].id;
  const between = ([a, b]) => a + Math.floor(rand() * (b - a + 1));

  async function view(w) { return json(200, { clock: clockOf(now()), ...(w ? { set: pub(await setOf(w)) } : {}) }, w ? "no-store" : "public, max-age=5"); }

  async function kill(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), G = GROUNDS.find((g) => g.id === b.zone); if (!G) return json(400, { error: "not one of the Halloween Realm's grounds" });
    const rank = ["", "elite", "boss", "jack"].includes(b.rank) ? b.rank : ""; let rank0 = null;
    if (rank === "jack" && !G.jack) return json(400, { error: "Inferno Jack only rules the Inferno Pumpkin Throne" });
    const lv = await deps.level(w); if (lv < G.lv[0] - 10) return json(403, { error: `this ground is for level ${G.lv[0] - 10}+ (your saved level is ${lv})`, need: G.lv[0] - 10 });
    if (!(await commit([{ create: `worldHwGap/${w}_${Math.floor(t / HW.KILL_GAP)}`, data: { at: t } }])).ok) return json(429, { error: "too fast — a moment between these" });
    const dk = `worldHwDay/${w}_${seoulDay(t)}`, c = ((await one(dk)) || {}).n || 0; if (c >= HW.KILL_DAY) return json(200, { ok: true, capped: true, frag: 0 });
    await commit([{ inc: dk, fields: { n: 1 } }, { inc: `worldHwWk/${weekOf(t)}_${w}`, fields: { n: 1 } }]);
    if ((c + 1) % 20 === 1) await board(w, t); // (the week's board is brought up to date every 20th knock-out of yours)
    const n = c + 1, pity = HW.FRAG.PITY - (n % HW.FRAG.PITY), sure = n % HW.FRAG.PITY === 0 ? 1 : 0; // (pity: knock-outs to the next sure fragment)
    if (rank === "boss" && !(await commit([{ create: `worldHwBoss/${w}_${G.id}_${Math.floor(t / 600e3)}`, data: { at: t } }])).ok) rank0 = "";
    if (rank === "jack" && !(await commit([{ create: `worldHwJack/${w}_${Math.floor(t / HW.JACK.every)}`, data: { at: t } }])).ok) rank0 = "";
    const ck = clockOf(t), night = ck.night, blood = ck.blood, R = rank0 === null ? rank : rank0; // a boss or Jack again inside his window counts as a plain knock-out
    let frag = R === "jack" ? between(HW.FRAG.JACK) : R === "boss" ? between(HW.FRAG.BOSS) : R === "elite" && rand() < HW.FRAG.ELITE ? 1 : 0;
    if (night && frag) frag = Math.ceil(frag * (blood ? HW.BLOOD.drop : HW.NIGHT.drop));
    frag += sure;
    const got = rand() < dropChance(R, night, blood) ? piece(randSlot(), R || "field") : null;
    if (!got && !frag) return json(200, { ok: true, night, frag: 0, pity });
    const S = await setOf(w); if (got) { if (S.pieces.length >= MAX_PIECES) frag += HW.FRAG.SALVAGE; else S.pieces.push(got); } S.frag += frag;
    await setDoc(`worldHwSet/${w}`, { ...S, upd: t });
    return json(200, { ok: true, night, blood, frag, pity, ...(sure ? { sure: 1 } : {}), ...(got && S.pieces.includes(got) ? { drop: got } : {}), set: pub(S) });
  }
  async function equip(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, S = await setOf(w);
    const slot = String(b.slot || ""); if (!pieceOfSlot(slot)) return json(400, { error: "no such slot in the Inferno Jack set" });
    if (b.id == null || b.id === "") delete S.eq[slot];
    else { const p = S.pieces.find((x) => x.id === b.id); if (!p) return json(404, { error: "you don't hold that piece" }); if (pieceOf(p.k).slot !== slot) return json(400, { error: "that piece goes in another slot" }); S.eq[slot] = p.id; }
    await setDoc(`worldHwSet/${w}`, { ...S, upd: now() }); return json(200, { ok: true, set: pub(S) });
  }
  async function salvage(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, S = await setOf(w), i = S.pieces.findIndex((x) => x.id === b.id);
    if (i < 0) return json(404, { error: "you don't hold that piece" });
    const [p] = S.pieces.splice(i, 1), n = HW.FRAG.SALVAGE + (p.p || 0) * 2; for (const k of Object.keys(S.eq)) if (S.eq[k] === p.id) delete S.eq[k];
    S.frag += n; await setDoc(`worldHwSet/${w}`, { ...S, upd: now() }); return json(200, { ok: true, frag: n, set: pub(S) });
  }
  async function craft(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, S = await setOf(w), P = pieceOfSlot(String(b.slot || ""));
    if (!P) return json(400, { error: "no such slot in the Inferno Jack set" });
    if (S.frag < HW.FRAG.CRAFT) return json(400, { error: `needs ${HW.FRAG.CRAFT} Pumpkin Soul Fragments (you have ${S.frag})`, need: HW.FRAG.CRAFT });
    if (S.pieces.length >= MAX_PIECES) return json(400, { error: "you hold as many pieces as you can — salvage some first" });
    S.frag -= HW.FRAG.CRAFT; const p = piece(P.id, "craft"); S.pieces.push(p);
    await setDoc(`worldHwSet/${w}`, { ...S, upd: now() }); return json(200, { ok: true, drop: p, set: pub(S) });
  }
  async function enhance(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, S = await setOf(w), p = S.pieces.find((x) => x.id === b.id);
    if (!p) return json(404, { error: "you don't hold that piece" }); const cur = p.p || 0;
    if (cur >= HW.ENH.MAX) return json(400, { error: `already +${HW.ENH.MAX}` });
    const cost = HW.ENH.cost(cur); if (S.frag < cost) return json(400, { error: `needs ${cost} Pumpkin Soul Fragments (you have ${S.frag})`, need: cost });
    S.frag -= cost; const ok = rand() < HW.ENH.rate(cur); if (ok) p.p = cur + 1;
    await setDoc(`worldHwSet/${w}`, { ...S, upd: now() }); return json(200, { ok: true, up: ok, plus: p.p || 0, cost, set: pub(S) });
  }
  // ---- HX3: the week's hunters (Monday, Seoul): knock-outs in the realm ----
  const weekOf = (t) => { const d = new Date(t + 9 * 3600e3), wd = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd)).toISOString().slice(0, 10); };
  async function board(w, t) {
    const wk = weekOf(t), [mine, top0, sv] = await Promise.all([one(`worldHwWk/${wk}_${w}`), one(`worldStats/hwWkTop_${wk}`), one(`worldSave/${w}`)]);
    const top = ((top0 && top0.top) || []).filter((x) => x.w !== w); top.push({ w, name: String((sv && sv.name) || w.slice(0, 6) + "…").slice(0, 20), n: (mine && mine.n) || 0 }); top.sort((a, b2) => b2.n - a.n);
    await setDoc(`worldStats/hwWkTop_${wk}`, { top: top.slice(0, 20), upd: t });
  }
  async function topView(w) { const t = now(), wk = weekOf(t), [top, mine] = await Promise.all([one(`worldStats/hwWkTop_${wk}`), w ? one(`worldHwWk/${wk}_${w}`) : null]); return json(200, { week: wk, top: ((top && top.top) || []).slice(0, 10), mine: (mine && mine.n) || 0 }, w ? "no-store" : "public, max-age=30"); }
  // ---- HX2: Trick or Treat ----
  async function treat(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now(), TR = HW.TREAT, h = String(b.house || "");
    if (!TR.HOUSES.includes(h)) return json(400, { error: "nobody lives there" });
    const k = `worldHwTreat/${w}_${h}_${seoulDay(t)}`; if (!(await commit([{ create: k, data: { at: t } }])).ok) return json(200, { ok: true, again: true });
    const r = rand(); if (r < TR.TRICK) return json(200, { ok: true, trick: true });
    if (r < TR.TRICK + TR.P_ARCL && deps.award) { const n = between(TR.ARCL); const got = await deps.award(w, "hwtreat", n).catch(() => 0); if (got) return json(200, { ok: true, arcl: got }); }
    const n = between(TR.FRAG), S = await setOf(w); S.frag += n; await setDoc(`worldHwSet/${w}`, { ...S, upd: t });
    return json(200, { ok: true, frag: n, set: pub(S) });
  }
  // ---- HX3: a ground's gimmick solved (the forest chest found, the tombs lit in order): fragments once a Seoul day each ----
  async function gimmick(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now(), K = String(b.kind || ""), G0 = HW.GIMMICK[K]; if (!G0) return json(400, { error: "no such puzzle" });
    const G = GROUNDS.find((g) => g.id === G0.zone), lv = await deps.level(w); if (lv < G.lv[0] - 10) return json(403, { error: `this ground is for level ${G.lv[0] - 10}+`, need: G.lv[0] - 10 });
    if (!(await commit([{ create: `worldHwGim/${w}_${K}_${seoulDay(t)}`, data: { at: t } }])).ok) return json(200, { ok: true, again: true });
    const S = await setOf(w); S.frag += G0.frag; await setDoc(`worldHwSet/${w}`, { ...S, upd: t }); return json(200, { ok: true, frag: G0.frag, set: pub(S) });
  }
  // ---- HX2: the night's shared Inferno Jack ----
  const NJ = HW.NJACK;
  async function jackView(w) {
    const t = now(), c = clockOf(t), cy = c.cycle, [hp, top, fell, mine, last] = await Promise.all([one(`worldHwNj/${cy}`), one(`worldStats/hwNjTop_${cy}`), one(`worldHwNjFell/${cy}`), w ? one(`worldHwNjDmg/${cy}_${w}`) : null, one(`worldHwNjFell/${cy - 1}`)]);
    const dmg = Math.min(NJ.hp, (hp && hp.dmg) || 0), claim = w && fell ? await one(`worldHwNjClaim/${cy}_${w}`) : null;
    return json(200, { cycle: cy, night: c.night, left: c.left, max: NJ.hp, hp: NJ.hp - dmg, down: !!fell, top: ((top && top.top) || []).slice(0, 5), mine: (mine && mine.n) || 0, claimed: !!claim, last: last ? { top: (last.top || []).slice(0, 3) } : null }, w ? "no-store" : "public, max-age=3");
  }
  async function jackHit(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now(), c = clockOf(t), cy = c.cycle;
    if (!c.night) return json(400, { error: "Inferno Jack is everyone's only during the Cursed Night" });
    const lv = await deps.level(w); if (lv < NJ.LV_MIN) return json(403, { error: `the throne's Jack is for level ${NJ.LV_MIN}+ (your saved level is ${lv})`, need: NJ.LV_MIN });
    if (await one(`worldHwNjFell/${cy}`)) return jackView(w);
    if (!(await commit([{ create: `worldHwNjGap/${cy}_${w}_${Math.floor(t / (NJ.GAP * 1000))}`, data: { at: t } }])).ok) return json(429, { error: "a moment between these" });
    const d = Math.max(0, Math.min(Math.floor(Number(b.dmg) || 0), NJ.CAP_K * lv)); if (!d) return jackView(w);
    await commit([{ inc: `worldHwNj/${cy}`, fields: { dmg: d } }, { inc: `worldHwNjDmg/${cy}_${w}`, fields: { n: d } }]);
    const [mine, hp, top0, sv] = await Promise.all([one(`worldHwNjDmg/${cy}_${w}`), one(`worldHwNj/${cy}`), one(`worldStats/hwNjTop_${cy}`), one(`worldSave/${w}`)]);
    const n = (mine && mine.n) || d, top = ((top0 && top0.top) || []).filter((x) => x.w !== w); top.push({ w, name: String((sv && sv.name) || w.slice(0, 6) + "…").slice(0, 20), n }); top.sort((a, b2) => b2.n - a.n);
    await setDoc(`worldStats/hwNjTop_${cy}`, { top: top.slice(0, 10), upd: t });
    if (((hp && hp.dmg) || 0) >= NJ.hp) await commit([{ create: `worldHwNjFell/${cy}`, data: { at: t, top: top.slice(0, 10) } }]);
    return jackView(w);
  }
  async function jackClaim(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, cy = Math.floor(Number(b.cycle)); if (!(cy > 0)) return json(400, { error: "which night?" });
    const fell = await one(`worldHwNjFell/${cy}`); if (!fell) return json(400, { error: "Inferno Jack hasn't fallen that night" });
    const mine = await one(`worldHwNjDmg/${cy}_${w}`), n = (mine && mine.n) || 0, rank = (fell.top || []).findIndex((x) => x.w === w);
    const frag = rank >= 0 && rank < 3 ? NJ.TOP[rank] : n >= NJ.hp * NJ.MIN_SHARE ? NJ.SHARE : 0; if (!frag) return json(400, { error: `a share needs ${Math.round(NJ.MIN_SHARE * 100)} % of his HP (you hit ${n})` });
    const got = await one(`worldHwNjClaim/${cy}_${w}`); if (got) return json(200, { ok: true, again: true, frag: got.frag, rank: got.rank });
    if (!(await commit([{ create: `worldHwNjClaim/${cy}_${w}`, data: { at: now(), frag, rank } }])).ok) return json(200, { ok: true, again: true, frag, rank });
    const S = await setOf(w); S.frag += frag; await setDoc(`worldHwSet/${w}`, { ...S, upd: now() });
    return json(200, { ok: true, frag, rank, set: pub(S) });
  }
  return {
    async read(v, url) { const a = url.searchParams.get("wallet"), w = isAddr(a) ? lc(a) : ""; if (v === "hw") return view(w); if (v === "hw-jack") return jackView(w); if (v === "hw-top") return topView(w); return null; },
    async handle(b) {
      switch (b.action) {
        case "world-hw-kill": return kill(b); case "world-hw-equip": return equip(b); case "world-hw-salvage": return salvage(b);
        case "world-hw-craft": return craft(b); case "world-hw-enhance": return enhance(b);
        case "world-hw-treat": return treat(b); case "world-hw-gimmick": return gimmick(b);
        case "world-hw-jack-hit": return jackHit(b); case "world-hw-jack-claim": return jackClaim(b);
      }
      return null;
    },
  };
}
