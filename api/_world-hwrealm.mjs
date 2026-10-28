// api/_world-hwrealm.mjs — the HALLOWEEN REALM's server side (2026-10-28, the owner's spec v1.0): the realm's clock is
// the server's (world-hwrealm-data.js clockOf: 30 minutes, 20 day + 10 night); the Inferno Jack set's pieces are held here,
// apart from the bag's gear (the owner: items of their own, not traded for now). A knock-out in one of the realm's grounds is
// reported; the server rolls its drop (the spec's rates, ×1.5 at night) and its Pumpkin Soul Fragments, at most one report
// each 0.7 s and 4,000 a Seoul day, a ground's boss once in 10 minutes and Inferno Jack once in 20 a wallet, and only from a
// saved level that could be in that ground (its lowest level − 10).
//
//   GET  ?world=hw&wallet=0x…?                          { clock, set: { pieces, eq, frag } }
//   POST { action: "world-hw-kill", …sig, zone, rank, lv }  rank "" / elite / boss / jack → { drop?, frag, night }
//   POST { action: "world-hw-equip", …sig, slot, id|null }   wear a piece in its slot (or take it off)
//   POST { action: "world-hw-salvage", …sig, id }            a piece → fragments (20 + its + × 2)
//   POST { action: "world-hw-craft", …sig, slot }            100 fragments → a piece of that slot
//   POST { action: "world-hw-enhance", …sig, id }            fragments for a chance at +1 (to +10; a miss keeps the +)
//
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
    const rank = ["", "elite", "boss", "jack"].includes(b.rank) ? b.rank : "";
    if (rank === "jack" && !G.jack) return json(400, { error: "Inferno Jack only rules the Inferno Pumpkin Throne" });
    const lv = await deps.level(w); if (lv < G.lv[0] - 10) return json(403, { error: `this ground is for level ${G.lv[0] - 10}+ (your saved level is ${lv})`, need: G.lv[0] - 10 });
    if (!(await commit([{ create: `worldHwGap/${w}_${Math.floor(t / HW.KILL_GAP)}`, data: { at: t } }])).ok) return json(429, { error: "too fast — a moment between these" });
    const dk = `worldHwDay/${w}_${seoulDay(t)}`, c = ((await one(dk)) || {}).n || 0; if (c >= HW.KILL_DAY) return json(200, { ok: true, capped: true, frag: 0 });
    await commit([{ inc: dk, fields: { n: 1 } }]);
    if (rank === "boss" && !(await commit([{ create: `worldHwBoss/${w}_${G.id}_${Math.floor(t / 600e3)}`, data: { at: t } }])).ok) return json(200, { ok: true, again: true, frag: 0 });
    if (rank === "jack" && !(await commit([{ create: `worldHwJack/${w}_${Math.floor(t / HW.JACK.every)}`, data: { at: t } }])).ok) return json(200, { ok: true, again: true, frag: 0 });
    const night = clockOf(t).night;
    let frag = rank === "jack" ? between(HW.FRAG.JACK) : rank === "boss" ? between(HW.FRAG.BOSS) : rank === "elite" && rand() < HW.FRAG.ELITE ? 1 : 0;
    if (night && frag) frag = Math.ceil(frag * HW.NIGHT.drop);
    const got = rand() < dropChance(rank, night) ? piece(randSlot(), rank || "field") : null;
    if (!got && !frag) return json(200, { ok: true, night, frag: 0 });
    const S = await setOf(w); if (got) { if (S.pieces.length >= MAX_PIECES) frag += HW.FRAG.SALVAGE; else S.pieces.push(got); } S.frag += frag;
    await setDoc(`worldHwSet/${w}`, { ...S, upd: t });
    return json(200, { ok: true, night, frag, ...(got && S.pieces.includes(got) ? { drop: got } : {}), set: pub(S) });
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
  return {
    async read(v, url) { if (v === "hw") { const a = url.searchParams.get("wallet"); return view(isAddr(a) ? lc(a) : ""); } return null; },
    async handle(b) {
      switch (b.action) {
        case "world-hw-kill": return kill(b); case "world-hw-equip": return equip(b); case "world-hw-salvage": return salvage(b);
        case "world-hw-craft": return craft(b); case "world-hw-enhance": return enhance(b);
      }
      return null;
    },
  };
}
