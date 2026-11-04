// api/_world-fest.mjs — the STARTER FESTIVAL (the owner, 2026-11-04: "초심자 이벤트로 신규 지갑 신규 회원 대상 경험치 5배 그리고
// 물약 500 개씩 (3일 적용), 그리고 펫 전설 등급 1개, 무기와 갑옷 전설급 지급 좋은거로 레벨 10 부터 착용가능하게").
//
//   Who: a NEW member — a wallet whose very first save reaches the server while the festival is on (markNew, called by the
//   save with no earlier save). An account that was already playing never qualifies.
//   What, once a wallet (one claim, inside FEST.CLAIM_DAYS of joining):
//     • 5× EXP for FEST.DAYS (3) days from the claim — the server's XP allowance (api/_world.mjs xpGuard) rises with it
//     • FEST.HP 500 health + FEST.SP 500 mana potions
//     • the Legendary pet Starwhale (scholar: more EXP), made with Meshy — never in an egg
//     • the Starlight Blade and the Starlight Armor: Legendary, +FEST.PLUS, wearable from level 10 (tier 2), stats of level
//       FEST.ITEM_LV, Meshy models
//   The gear and potions wait on the server (worldOwn.fest.gifts) and the game takes each gift once (world-play.js
//   starterOwn, the same path as the Starter Package's), so a claim on a flaky phone is never lost.
//
//   GET  ?world=fest&wallet=0x…        → { start, end, open, eligible, isNew, claimed, until, gift }
//   POST world-fest-claim { …sig }     → { ok, until, pet, items, hp, sp }
//
// Firestore: worldFestNew/<w> (a new member: the first save's time) · worldFestClaim/<w> (taken) · worldOwn/<w>.festUntil
// (5× EXP until) · worldOwn/<w>.fest.gifts ([{ gid, items, hp, sp }]) · worldOwn/<w>.pets.list (+ starwhale)
export const FEST = {
  start: Date.parse("2026-11-04T22:00:00Z"), end: Date.parse("2026-12-04T22:00:00Z"), // the window new members join in (one place)
  DAYS: 3, CLAIM_DAYS: 7, XP_K: 5, HP: 500, SP: 500, PET: "starwhale", ITEM_LV: 25, PLUS: 7,
  ITEMS: [{ b: "weapon-2", u: "starb", k: 0 }, { b: "armor-2", u: "stara" }],
};
export const festOpen = (t) => t >= FEST.start && t < FEST.end;

/// deps: { getDocs, setDoc, commit, json, now, signer(b), own(w), petMax, rid() }
export function makeFest(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  async function state(w) {
    const t = now(), [nw, cl, o] = await Promise.all([one(`worldFestNew/${w}`), one(`worldFestClaim/${w}`), deps.own(w).catch(() => ({}))]);
    const isNew = !!nw, late = isNew && t > (nw.at || 0) + FEST.CLAIM_DAYS * 864e5;
    return { t, isNew, claimed: !!cl, late, until: Number(o && o.festUntil) || 0, eligible: isNew && !cl && !late && festOpen(t) };
  }
  /// the save with no earlier one: this wallet is new (once; only while the festival is on)
  async function markNew(w) {
    const t = now(); if (!festOpen(t)) return;
    await commit([{ create: `worldFestNew/${w}`, data: { at: t } }]).catch(() => {});
  }
  const gift = { days: FEST.DAYS, xpK: FEST.XP_K, hp: FEST.HP, sp: FEST.SP, pet: FEST.PET, itemLv: FEST.ITEM_LV, plus: FEST.PLUS, wearLv: 10 };
  async function view(w) {
    const t = now(), base = { start: FEST.start, end: FEST.end, open: festOpen(t), gift };
    if (!w) return json(200, { ok: true, ...base, eligible: false, isNew: false, claimed: false, until: 0 });
    const s = await state(w);
    return json(200, { ok: true, ...base, eligible: s.eligible, isNew: s.isNew, claimed: s.claimed, late: s.late, until: s.until });
  }
  async function claim(b) {
    const sg = signer(b); if (sg.err) return sg.err; const w = sg.wallet, t = now();
    if (!festOpen(t)) return json(409, { error: "the Starter Festival isn't on right now" });
    const s = await state(w);
    if (s.claimed) return json(409, { error: "already taken" });
    if (!s.isNew) return json(403, { error: "the Starter Festival is for new members who joined during it" });
    if (s.late) return json(403, { error: `the gift waits ${FEST.CLAIM_DAYS} days after joining` });
    // once: the claim record first (a second tap, or two devices at once, finds it taken)
    if (!(await commit([{ create: `worldFestClaim/${w}`, data: { at: t } }])).ok) return json(409, { error: "already taken" });
    const o = (await deps.own(w).catch(() => null)) || {};
    const until = Math.max(t, Number(o.festUntil) || 0) + FEST.DAYS * 864e5;
    const items = FEST.ITEMS.map((x) => ({ id: deps.rid().slice(0, 8), b: x.b, r: 4, lv: FEST.ITEM_LV, p: FEST.PLUS, u: x.u, ...(x.k != null ? { k: x.k } : {}) }));
    const g = { gid: deps.rid().slice(0, 10), items, hp: FEST.HP, sp: FEST.SP, at: t };
    const P = o.pets && Array.isArray(o.pets.list) ? o.pets : { list: [], n: 0, pity: 0, fresh: [] };
    let pet = false;
    if (!P.list.some((x) => x.s === FEST.PET)) { P.list.unshift({ s: FEST.PET, x: 0 }); P.list = P.list.slice(0, deps.petMax || 30); P.fresh = [...(P.fresh || []), { gid: deps.rid().slice(0, 10), s: FEST.PET, r: 4, dup: false, xp: 0, at: t }].slice(-5); pet = true; }
    await setDoc(`worldOwn/${w}`, { ...o, festUntil: until, fest: { gifts: [...((o.fest && o.fest.gifts) || []), g].slice(-3) }, pets: P });
    return json(200, { ok: true, until, pet, items, hp: FEST.HP, sp: FEST.SP });
  }
  return {
    markNew, view,
    /// the 5× while it runs (xpGuard's factor)
    xpK: (o) => ((Number(o && o.festUntil) || 0) > now() ? FEST.XP_K : 1),
    async handle(b) { if (b.action === "world-fest-claim") return claim(b); return null; },
  };
}
