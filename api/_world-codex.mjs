// api/_world-codex.mjs — the item codex (the owner's call 2026-10-24: gear first, ARCL among the rewards, the owner's mock-up):
// every gear kind a player has held — 7 slots × 5 tiers × 5 grades = 175 — plus the one-of-a-kind pieces (UNIQUE). A kind
// is marked when a save reaches the server holding it (equipped, in the bag or in storage), only if the save's level
// allows its tier (TIERS: what the game lets you wear). The marks are kept here, not in the save, so a later save can't
// unmark or move them; each mark keeps when it was first seen and the best +N seen.
//   milestones (CODEX.STEPS): 10 / 25 / 50 / 100 / 175 kinds → ARCL (award: in the ledger as "codex", outside the daily
//   cap — once each, ever) and supplies (the client adds them, like the smelter's) or a title ("cx-collector" …)
//   set bonus (CODEX.SET): every grade of one slot's tier → a small stat bonus for good (the client reads the full rows)
//   GET  ?world=codex&wallet=0x…                       → { marks: { "weapon-2:3": { at, p } }, uniq: { jack: at }, n, got: [10, 25], steps, sets }
//   POST { action: "world-codex-claim", …signature, n } → { arcl, supply?, title?, got }
// Firestore: worldCodex/<wallet> { m: { "<b>:<r>": [at, p] }, u: { <id>: at }, got: [n…] }
export const CODEX = {
  SLOTS: ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"], TIER_LV: [1, 5, 10, 15, 20], GRADES: 5, UNIQUE: ["jack"],
  // the milestones — kept here in one place (the owner: caps and rewards will rise)
  STEPS: [
    { n: 10, arcl: 300, supply: { kind: "hp", n: 10 }, name: "Potions ×10" },
    { n: 25, arcl: 800, supply: { kind: "scrap", n: 500 }, name: "Scrap crate ×5" },
    { n: 50, arcl: 2000, supply: { kind: "scrap", n: 1500 }, name: "Forge crate ×3" },
    { n: 100, arcl: 5000, title: "cx-collector", name: "Title: Collector" },
    { n: 175, arcl: 15000, title: "cx-legend", name: "Title: Legend Hunter" },
  ],
  // a full column (one slot's tier in all five grades): that slot's own stat, a little, for good
  SET: { weapon: { atkPct: 1 }, shield: { defPct: 1 }, armor: { hpPct: 1 }, helm: { defPct: 1 }, ring: { crit: 0.5 }, boots: { spd: 1 }, necklace: { atkPct: 1 } },
};
export const CODEX_ALL = CODEX.SLOTS.length * CODEX.TIER_LV.length * CODEX.GRADES;
const KEY = /^(weapon|shield|armor|helm|ring|boots|necklace)-([0-4]):([0-4])$/;
/// the kinds a cleaned rpg save holds that its level allows → Map("<b>:<r>" → best +N), Set(unique ids)
export function kindsOf(rpg, level) {
  const out = new Map(), uniq = new Set(); if (!rpg) return { out, uniq };
  for (const it of [...Object.values(rpg.eq || {}), ...(rpg.bag || []), ...(rpg.store || [])]) {
    if (!it || typeof it.b !== "string") continue; const k = `${it.b}:${it.r || 0}`, m = KEY.exec(k); if (!m) continue;
    if (CODEX.TIER_LV[+m[2]] > level) continue; // (not wearable at this level: not counted yet)
    out.set(k, Math.max(out.get(k) || 0, Math.floor(Number(it.p) || 0)));
    if (it.u && CODEX.UNIQUE.includes(it.u)) uniq.add(it.u);
  }
  return { out, uniq };
}
/// the set bonus earned by the marks: every grade of a slot's tier → CODEX.SET[slot] once per full column
export function setsOf(marks) {
  const done = [], bonus = {};
  for (const slot of CODEX.SLOTS) for (let t = 0; t < CODEX.TIER_LV.length; t++) {
    let all = true; for (let r = 0; r < CODEX.GRADES; r++) if (!marks[`${slot}-${t}:${r}`]) { all = false; break; }
    if (!all) continue; done.push(`${slot}-${t}`); for (const [k, v] of Object.entries(CODEX.SET[slot])) bonus[k] = Math.round(((bonus[k] || 0) + v) * 10) / 10;
  }
  return { done, bonus };
}

/// deps: { getDocs, setDoc, commit, json, now, signer(b), award(w, kind, n) }
export function makeCodex(deps) {
  const { getDocs, setDoc, json, signer } = deps, now = () => deps.now(), one = async (p) => (await getDocs([p]))[p];
  const view = (d) => { const marks = {}; for (const [k, v] of Object.entries((d && d.m) || {})) marks[k] = { at: v[0], p: v[1] }; const s = setsOf(marks); return { marks, uniq: (d && d.u) || {}, n: Object.keys(marks).length, all: CODEX_ALL, got: (d && d.got) || [], steps: CODEX.STEPS, sets: s.done, bonus: s.bonus }; };
  /// a save reached the server: new kinds marked, a better +N kept (written only when something changed)
  async function mark(w, rpg, level) {
    const { out, uniq } = kindsOf(rpg, level); if (!out.size && !uniq.size) return 0;
    const key = `worldCodex/${w}`, d = (await one(key)) || { m: {}, u: {}, got: [] }; d.m = d.m || {}; d.u = d.u || {}; let fresh = 0, dirty = false;
    for (const [k, p] of out) { const was = d.m[k]; if (!was) { d.m[k] = [now(), p]; fresh++; dirty = true; } else if (p > (was[1] || 0)) { d.m[k] = [was[0], p]; dirty = true; } }
    for (const u of uniq) if (!d.u[u]) { d.u[u] = now(); fresh++; dirty = true; }
    if (dirty) await setDoc(key, d);
    return fresh;
  }
  async function claim(w, b) {
    const step = CODEX.STEPS.find((s) => s.n === Math.floor(Number(b.n))); if (!step) return json(400, { error: "no such milestone" });
    const key = `worldCodex/${w}`, d = (await one(key)) || { m: {}, got: [] }, n = Object.keys(d.m || {}).length;
    if (n < step.n) return json(400, { error: `collect ${step.n} kinds first (${n} so far)` });
    if ((d.got || []).includes(step.n)) return json(400, { error: "already claimed" });
    // once ever: a create-only marker first, so two taps at once can't both pay
    if (!(await deps.commit([{ create: `worldCodexPaid/${w}_${step.n}`, data: { at: now() } }])).ok) return json(400, { error: "already claimed" });
    d.got = [...(d.got || []), step.n]; await setDoc(key, d);
    const arcl = deps.award ? await deps.award(w, "codex", step.arcl) : 0;
    return json(200, { ok: true, arcl, ...(step.supply ? { supply: step.supply } : {}), ...(step.title ? { title: step.title } : {}), got: d.got });
  }
  return {
    mark,
    async read(url) { const w = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!w) return json(200, { ok: true, ...view(null) }); /* (a guest: the milestones and the empty codex) */ if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet must be an address" }); return json(200, { ok: true, ...view(await one(`worldCodex/${w}`)) }); },
    async handle(b) {
      if (b.action !== "world-codex-claim") return null;
      const s = signer(b); if (s.err) return s.err;
      return claim(s.wallet, b);
    },
  };
}
