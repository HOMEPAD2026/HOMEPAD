// api/_world-launch.mjs — ARCIRCLE World's official launch (after the open beta): the launch gift, and the 3× EXP potions.
//
//   The gift, once an account, in the launch week: an Advanced dinosaur egg (DINO SOULMATE, api/_world-dino.mjs gift),
//   five 3× EXP potions (an hour each) and 5,000 ARCL. Who may take it: an account that was playing before the launch
//   (its last save before the launch started: noted by preMark), or one that has reached level 5 — so a wallet made
//   just to collect it has to play a while first.
//   A potion, used: 3× EXP for an hour (back to back: the hours add up); the server's XP allowance (api/_world.mjs
//   xpGuard) rises with it, as it does for the Starter Package's 2×.
//
//   GET  ?world=launch&wallet=0x…        → { start, end, open, gift, eligible, claimed, pre, lv, xp3: { n, until } }
//   POST world-launch-claim { …sig }     → { ok, arcl, potions, egg }
//   POST world-xp-potion    { …sig }     → { ok, n, until }
//
// Firestore: worldLaunchClaim/<w> (the gift, taken) · worldLaunchPre/<w> (playing before the launch) ·
//            worldOwn/<w>.xp3n (potions held) · worldOwn/<w>.xp3Until (3× EXP until)
export const LAUNCH = { start: Date.parse("2026-10-18T15:00:00Z"), days: 7, minLv: 5, arcl: 5000, potions: 5, potionMin: 60, xpK: 3, egg: "advanced" }; // (the start: 19 October 2026, 00:00 Seoul)
export const launchEnd = () => LAUNCH.start + LAUNCH.days * 864e5;

/// deps: { getDocs, setDoc, commit, json, now, signer(b), level(w), own(w), award(w, kind, n), dinoGift(w, id, rar) }
export function makeLaunch(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const open = (t) => t >= LAUNCH.start && t < launchEnd();
  async function state(w) {
    const t = now(), [cl, pre, lv, o] = await Promise.all([one(`worldLaunchClaim/${w}`), one(`worldLaunchPre/${w}`), deps.level(w).catch(() => 1), deps.own(w).catch(() => ({}))]);
    return { t, claimed: !!cl, pre: !!pre, lv: lv || 1, eligible: !!pre || (lv || 1) >= LAUNCH.minLv, xp3: { n: Math.max(0, o.xp3n | 0), until: Number(o.xp3Until) || 0 } };
  }
  /// a save whose last one was before the launch: this account was playing before it (once; the save calls this)
  async function preMark(w, old) {
    const t = now(); if (!old || !open(t) || !((old.at || 0) < LAUNCH.start)) return;
    await commit([{ create: `worldLaunchPre/${w}`, data: { at: t, last: old.at || 0 } }]).catch(() => {});
  }
  async function claim(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now();
    if (t < LAUNCH.start) return json(409, { error: "the launch gift opens with the launch", start: LAUNCH.start });
    if (!open(t)) return json(409, { error: "the launch week is over" });
    const st = await state(w); if (st.claimed) return json(409, { error: "already taken" });
    if (!st.eligible) return json(403, { error: `reach level ${LAUNCH.minLv} to take the launch gift`, lv: st.lv, need: LAUNCH.minLv });
    // once: the claim record first (a second tap, or two devices at once, finds it taken)
    if (!(await commit([{ create: `worldLaunchClaim/${w}`, data: { at: t, lv: st.lv, pre: st.pre } }])).ok) return json(409, { error: "already taken" });
    const o = await deps.own(w).catch(() => ({})) || {};
    await setDoc(`worldOwn/${w}`, { ...o, xp3n: Math.max(0, o.xp3n | 0) + LAUNCH.potions });
    const arcl = await deps.award(w, "launch", LAUNCH.arcl).catch(() => 0);
    const egg = await deps.dinoGift(w, "launch_" + w, LAUNCH.egg).catch(() => false);
    return json(200, { ok: true, arcl, potions: LAUNCH.potions, egg: egg ? LAUNCH.egg : null, xp3: { n: Math.max(0, o.xp3n | 0) + LAUNCH.potions, until: Number(o.xp3Until) || 0 } });
  }
  async function potion(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now();
    const o = (await deps.own(w).catch(() => null)) || {}; const n = Math.max(0, o.xp3n | 0); if (!n) return json(400, { error: "no potions left" });
    const until = Math.max(t, Number(o.xp3Until) || 0) + LAUNCH.potionMin * 60e3;
    await setDoc(`worldOwn/${w}`, { ...o, xp3n: n - 1, xp3Until: until });
    return json(200, { ok: true, n: n - 1, until, now: t });
  }
  return {
    preMark,
    /// the 3× while a potion runs (xpGuard's factor)
    xpK: async (w) => { const o = await deps.own(w).catch(() => ({})); return (Number(o && o.xp3Until) || 0) > now() ? LAUNCH.xpK : 1; },
    async read(v, url) {
      if (v !== "launch") return null;
      const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase(), t = now();
      const base = { start: LAUNCH.start, end: launchEnd(), open: open(t), now: t, gift: { arcl: LAUNCH.arcl, potions: LAUNCH.potions, potionMin: LAUNCH.potionMin, xpK: LAUNCH.xpK, egg: LAUNCH.egg }, minLv: LAUNCH.minLv };
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, base, "public, max-age=30");
      const st = await state(w); return json(200, { ...base, eligible: st.eligible, claimed: st.claimed, pre: st.pre, lv: st.lv, xp3: st.xp3 }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-launch-claim") return claim(b);
      if (b.action === "world-xp-potion") return potion(b);
      return null;
    },
  };
}
