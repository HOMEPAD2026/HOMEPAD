// api/_world-welcome.mjs — the welcome week (b5, the owner's numbers, 17 Oct 2026): seven gifts for a new player,
// one a day (Seoul days; days off don't break it), within 14 days of the first claim.
//   day 1  20 healing potions        day 2  500 ARCL        day 3  a pet egg        day 4  1,000 ARCL
//   day 5  50 scrap                  day 6  1,500 ARCL      day 7  the Advanced Pickaxe for 7 days (the ARCL Mine)
// Who's new: a wallet below level WHO_LV when it claims its first gift (an old hand doesn't get the starter gifts).
//
//   GET  ?world=welcome&wallet=0x…                   → { ok, eligible, n, today, ready, days, until }
//   POST { action: "world-welcome-claim", …signature } → { ok, day, gift, supply?, arcl?, egg?, own?, trialUntil? }
// Supplies (potions, scrap) come back as { supply } and the game adds them to the save, as with the Forge.
// Firestore: worldWelcome/<wallet> { start, days: [seoul day, …] } · worldWelcomeDay/<wallet>_<day> (a claim, once a day)
export const WELCOME = {
  WHO_LV: 20, SPAN_DAYS: 14,
  GIFTS: [{ kind: "supply", s: "hp", n: 20 }, { kind: "arcl", n: 500 }, { kind: "egg" }, { kind: "arcl", n: 1000 }, { kind: "supply", s: "scrap", n: 50 }, { kind: "arcl", n: 1500 }, { kind: "trial", ms: 7 * 864e5 }],
};
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

/// deps: { getDocs, setDoc, commit, json, now, signer(b), level(w), award(w, kind, n), freeEgg(w, source), trial(w, ms) }
export function makeWelcome(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  async function state(w) {
    const t = now(), d = await one(`worldWelcome/${w}`), lv = deps.level ? await deps.level(w).catch(() => 0) : 0;
    const days = (d && d.days) || [], start = d && d.start, until = start ? start + WELCOME.SPAN_DAYS * 864e5 : 0;
    const eligible = d ? days.length < WELCOME.GIFTS.length && t < until : lv < WELCOME.WHO_LV;
    const today = seoulDay(t), ready = eligible && !days.includes(today);
    return { d, eligible, n: days.length, today, ready, days, until, lv };
  }
  async function view(w) { const s = await state(w); return json(200, { ok: true, eligible: s.eligible, n: s.n, ready: s.ready, until: s.until, gifts: WELCOME.GIFTS.map((g) => ({ kind: g.kind, s: g.s, n: g.n })) }); }
  async function claim(b) {
    const sg = signer(b); if (sg.err) return sg.err;
    const w = sg.wallet, t = now(), s = await state(w);
    if (!s.eligible) return json(403, { error: s.d ? "the welcome week is over" : `the welcome week is for new players (below level ${WELCOME.WHO_LV})` });
    if (!s.ready) return json(409, { error: "today's gift is already yours — come back tomorrow" });
    // once a day, whatever happens at the same time
    if (!(await commit([{ create: `worldWelcomeDay/${w}_${s.today}`, data: { at: t } }])).ok) return json(409, { error: "today's gift is already yours — come back tomorrow" });
    const day = s.n + 1, g = WELCOME.GIFTS[s.n];
    await setDoc(`worldWelcome/${w}`, { start: (s.d && s.d.start) || t, days: [...s.days, s.today] });
    const out = { ok: true, day, gift: g.kind };
    if (g.kind === "supply") out.supply = { kind: g.s, n: g.n };
    else if (g.kind === "arcl") out.arcl = deps.award ? await deps.award(w, "welcome", g.n) : 0;
    else if (g.kind === "egg") { const r = deps.freeEgg ? await deps.freeEgg(w, "welcome:" + w).catch(() => null) : null; out.egg = !!(r && r.ok); if (r && r.own) out.own = r.own; }
    else if (g.kind === "trial") out.trialUntil = deps.trial ? await deps.trial(w, g.ms) : 0;
    return json(200, out);
  }
  return {
    view,
    async handle(b) { if (b.action === "world-welcome-claim") return claim(b); return null; },
  };
}
