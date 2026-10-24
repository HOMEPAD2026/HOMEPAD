// api/_world-raidq.mjs — RAID QUEENS (the owner's design, 2026-10-24): a land of its own for high levels (Lv 100–500),
// four regions round the Throne of Three — Silver Sanctum (Lv 100–200, CELESTIAL LYSITHA), Golden Dominion (Lv 200–300,
// RADIANT SOLVIRA), Crimson Abyss (Lv 300–400, CRIMSON NYXARA) and the Throne itself (Lv 400+, the three together:
// not open yet). Each queen's HP is everyone's (like the Pumpkin Kings: the game reports its damage every 5 s, capped
// by the reporter's level); she falls when it's gone and comes back RESPAWN minutes later at full HP (a new cycle).
// Everyone who dealt at least MIN_SHARE of her HP shares her reward: ARCL (in the ledger as "raidq") and a +piece of
// gear, the top 3 more (RANK), the rest SHARE — once a Seoul day a queen (DAY_CLAIMS), the next falls that day count
// for the chronicle only. Her phases (HP 60 % and 25 %) are worked out from her HP, the same for every player.
//
//   GET  ?world=rq&wallet=0x…?                    { queens: [{ id, lv, hp, max, down, cyc, back, phase, top }], mine, wins, clears }
//   POST { action: "world-rq-hit", …signature, queen, dmg }     damage dealt in the last 5 s (≤ CAP_K × your level, your level ≥ hers)
//   POST { action: "world-rq-claim", …signature, queen, cyc }   a share of a fallen queen's reward (asked again: the same back)
//
// Firestore: worldRqCur/<q> { c, fell } · worldRq/<q>_<c> { dmg } · worldRqDmg/<q>_<c>_<wallet> { n } · worldStats/rqTop_<q>_<c> { top }
//            worldRqGap/<wallet>_<slot> · worldRqFell/<q>_<c> { at, top } · worldRqGot/<q>_<c>_<wallet> { … } · worldRqDay/<q>_<day>_<wallet>
//            worldRqClear/<wallet> { lysitha: n, … }
// The game keeps a copy of RQ (world-raidq-data.js); tests/world/raidq.test.mjs checks the two agree.
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);

export const RQ = {
  REGIONS: [
    { id: "silver", name: "Silver Sanctum", lv: [100, 200], queen: "lysitha", skin: "blue", css: "#9fd4ff" },
    { id: "golden", name: "Golden Dominion", lv: [200, 300], queen: "solvira", skin: "green", css: "#ffd36a" },
    { id: "crimson", name: "Crimson Abyss", lv: [300, 400], queen: "nyxara", skin: "red", css: "#ff4d6d" },
    { id: "throne", name: "Throne of Three", lv: [400, 500], queen: "", skin: "", css: "#ffb4e6", soon: true },
  ],
  QUEENS: [ // hp: everyone's; arcl: the top hitter's (RANK for 1st–3rd, SHARE for the rest), item: rarity r, +p
    { id: "lysitha", name: "CELESTIAL LYSITHA", title: "The Arbiter of Stars and Divinity", lv: 100, hp: 600000, arcl: 8000, item: { r: 3, p: 5 } },
    { id: "solvira", name: "RADIANT SOLVIRA", title: "The Sovereign of Light and Sun", lv: 200, hp: 1200000, arcl: 15000, item: { r: 4, p: 3 } },
    { id: "nyxara", name: "CRIMSON NYXARA", title: "The Queen of Blood and Destruction", lv: 300, hp: 1800000, arcl: 25000, item: { r: 4, p: 5 } },
  ],
  RANK: [1, 0.6, 0.4], SHARE: 0.25, PLUS_DOWN: [0, 1, 2, 3], // the 4th and on: SHARE of the ARCL, 3 fewer +
  PHASES: [0.6, 0.25], // phase 2 below 60 % HP, phase 3 below 25 %
  GAP: 5, CAP_K: 60, MIN_SHARE: 0.03, RESPAWN: 20, DAY_CLAIMS: 1, TOP: 20, // one report per 5 s, ≤ 60 × level each; ≥ 3 % of her HP to share; back 20 min after she falls; one reward a queen a Seoul day
};
const SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"];
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export const phaseOf = (hp, max) => (hp > max * RQ.PHASES[0] ? 1 : hp > max * RQ.PHASES[1] ? 2 : 3);
/// a place's reward: rank 0 … → { arcl, item } (the item's slot from the wallet and the cycle, the same every time)
export function rewardOf(q, rank, w, cyc) {
  const Q = RQ.QUEENS.find((x) => x.id === q); if (!Q || !(rank >= 0)) return null;
  const k = rank < RQ.RANK.length ? RQ.RANK[rank] : RQ.SHARE, down = RQ.PLUS_DOWN[Math.min(rank, RQ.PLUS_DOWN.length - 1)];
  const slot = SLOTS[hash(`${w}|${q}|${cyc}`) % SLOTS.length], id = ("rq" + hash(`${w}|${q}|${cyc}|id`).toString(36)).slice(0, 10).padEnd(6, "0");
  return { arcl: Math.round(Q.arcl * k), item: { id, b: `${slot}-4`, r: rank < 3 ? Q.item.r : Math.max(2, Q.item.r - 1), lv: Q.lv, p: Math.max(0, Q.item.p - down) } };
}

/// deps: { getDocs, setDoc, commit, json, now, signer(b), award(wallet, kind, n), level(wallet), nameOf(wallet) }
export function makeRaidQueens(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const RESP = RQ.RESPAWN * 60e3;
  /// each queen's cycle now: the stored one, or the next once she's been down RESPAWN minutes
  const cycOf = (cur, t) => { const c = (cur && cur.c) || 0; return cur && cur.fell && t - cur.fell >= RESP ? c + 1 : c; };
  async function state(w) {
    const t = now(), qs = RQ.QUEENS, curs = await getDocs(qs.map((q) => `worldRqCur/${q.id}`));
    const cyc = Object.fromEntries(qs.map((q) => [q.id, cycOf(curs[`worldRqCur/${q.id}`], t)]));
    const paths = qs.flatMap((q) => { const c = cyc[q.id], past = [c - 1, c - 2].filter((x) => x >= 0); return [`worldRq/${q.id}_${c}`, `worldStats/rqTop_${q.id}_${c}`, `worldRqFell/${q.id}_${c}`, ...(w ? [`worldRqDmg/${q.id}_${c}_${w}`, ...[c, ...past].flatMap((x) => [`worldRqFell/${q.id}_${x}`, `worldRqGot/${q.id}_${x}_${w}`])] : [])]; });
    if (w) paths.push(`worldRqClear/${w}`);
    const d = await getDocs([...new Set(paths)]);
    const queens = qs.map((q) => { const c = cyc[q.id], cur = curs[`worldRqCur/${q.id}`] || {}, dmg = (d[`worldRq/${q.id}_${c}`] || {}).dmg || 0, fell = d[`worldRqFell/${q.id}_${c}`];
      const hp = Math.max(0, q.hp - dmg), down = !!fell || dmg >= q.hp;
      return { id: q.id, lv: q.lv, max: q.hp, hp: down ? 0 : hp, down, cyc: c, back: down && cur.fell ? cur.fell + RESP : 0, phase: phaseOf(down ? 0 : hp, q.hp),
        top: ((d[`worldStats/rqTop_${q.id}_${c}`] || {}).top || []).slice(0, 5).map((x) => ({ w: x.w, name: x.name, n: x.n, ...(w && x.id === w ? { me: 1 } : {}) })) }; });
    const mine = {}, wins = [];
    if (w) for (const q of qs) { const c = cyc[q.id], m = (d[`worldRqDmg/${q.id}_${c}_${w}`] || {}).n || 0; if (m) mine[q.id] = m;
      for (const x of [c, c - 1, c - 2]) { if (x < 0) continue; const f = d[`worldRqFell/${q.id}_${x}`], r = f ? (f.top || []).findIndex((y) => y.id === w) : -1, got = d[`worldRqGot/${q.id}_${x}_${w}`];
        if (r >= 0) wins.push({ queen: q.id, cyc: x, rank: r + 1, ...(got ? { claimed: 1, arcl: got.arcl, item: got.item } : rewardOf(q.id, r, w, x)) }); } }
    return { queens, mine, wins, clears: w ? d[`worldRqClear/${w}`] || {} : {}, cyc };
  }
  const pub = ({ cyc, ...s }) => s;
  async function view(w) { return json(200, pub(await state(w)), w ? "no-store" : "public, max-age=5"); }

  async function hit(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), Q = RQ.QUEENS.find((q) => q.id === b.queen); if (!Q) return json(400, { error: "no such Raid Queen" });
    const lv = await deps.level(w); if (lv < Q.lv) return json(403, { error: `this queen is for level ${Q.lv}+ (you're ${lv})`, need: Q.lv });
    const ck = `worldRqCur/${Q.id}`, cur = (await one(ck)) || {}, c = cycOf(cur, t);
    if (c !== (cur.c || 0)) await setDoc(ck, { c, fell: 0, at: t }); // she's back: a new cycle
    else if (cur.fell) return json(200, { ok: true, counted: 0, ...pub(await state(w)) }); // still down
    const key = `worldRq/${Q.id}_${c}`, left = Q.hp - (((await one(key)) || {}).dmg || 0);
    if (left <= 0 || (await one(`worldRqFell/${Q.id}_${c}`))) return json(200, { ok: true, counted: 0, ...pub(await state(w)) });
    if (!(await commit([{ create: `worldRqGap/${w}_${Math.floor(t / (RQ.GAP * 1000))}`, data: { at: t } }])).ok) return json(429, { error: "one report every 5 seconds" });
    const n = Math.max(0, Math.min(RQ.CAP_K * lv, Math.floor(Number(b.dmg) || 0), left)); if (!n) return json(200, { ok: true, counted: 0, ...pub(await state(w)) });
    await commit([{ inc: key, fields: { dmg: n } }, { inc: `worldRqDmg/${Q.id}_${c}_${w}`, fields: { n } }]);
    const mine = ((await one(`worldRqDmg/${Q.id}_${c}_${w}`)) || {}).n || n, tk = `worldStats/rqTop_${Q.id}_${c}`, list = ((await one(tk)) || {}).top || [];
    let top = list; if (list.length < RQ.TOP || mine > list[list.length - 1].n || list.some((x) => x.id === w)) { const name = String((await deps.nameOf(w)) || "").slice(0, 16); top = [{ id: w, w: short(w), name, n: mine }, ...list.filter((x) => x.id !== w)].sort((a, z) => z.n - a.n).slice(0, RQ.TOP); await setDoc(tk, { top, at: t }); }
    const after = ((await one(key)) || {}).dmg || 0;
    if (after >= Q.hp) { const podium = top.filter((x) => x.n >= Q.hp * RQ.MIN_SHARE).map((x) => ({ id: x.id, n: x.n }));
      if ((await commit([{ create: `worldRqFell/${Q.id}_${c}`, data: { at: t, top: podium } }]).catch(() => ({ ok: false }))).ok) await setDoc(ck, { c, fell: t, at: cur.at || t }); }
    return json(200, { ok: true, counted: n, fell: after >= Q.hp, ...pub(await state(w)) });
  }
  async function claim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), Q = RQ.QUEENS.find((q) => q.id === b.queen); if (!Q) return json(400, { error: "no such Raid Queen" });
    const cyc = Math.floor(Number(b.cyc)); if (!(cyc >= 0)) return json(400, { error: "which fall?" });
    const c0 = cycOf(await one(`worldRqCur/${Q.id}`), t); if (cyc > c0 || cyc < c0 - 2) return json(400, { error: "that fall's rewards are gone" });
    const f = await one(`worldRqFell/${Q.id}_${cyc}`); if (!f) return json(400, { error: "she hasn't fallen yet" });
    const rank = (f.top || []).findIndex((x) => x.id === w); if (rank < 0) return json(403, { error: `only those who dealt ${Math.round(RQ.MIN_SHARE * 100)}% of her HP share this reward` });
    const gk = `worldRqGot/${Q.id}_${cyc}_${w}`, had = await one(gk); if (had) return json(200, { ok: true, again: true, cyc, rank: rank + 1, arcl: had.arcl, item: had.item, credited: 0, today: had.today });
    const R = rewardOf(Q.id, rank, w, cyc), day = seoulDay(t);
    // the day's reward: the first claim of the day for this queen pays; the next falls count for the chronicle only
    const first = (await commit([{ create: `worldRqDay/${Q.id}_${day}_${w}`, data: { at: t, cyc } }])).ok;
    const got = first ? { at: t, rank: rank + 1, arcl: R.arcl, item: R.item, today: 1 } : { at: t, rank: rank + 1, arcl: 0, item: null, today: 0 };
    if (!(await commit([{ create: gk, data: got }])).ok) { const h2 = await one(gk); return json(200, { ok: true, again: true, cyc, rank: rank + 1, arcl: h2 ? h2.arcl : 0, item: h2 ? h2.item : null, credited: 0 }); }
    await commit([{ inc: `worldRqClear/${w}`, fields: { [Q.id]: 1 } }]).catch(() => {});
    const credited = first && deps.award ? await deps.award(w, "raidq", R.arcl) : 0;
    return json(200, { ok: true, cyc, rank: rank + 1, arcl: got.arcl, item: got.item, credited, today: got.today });
  }
  return {
    async read(v, url) { if (v === "rq") { const a = url.searchParams.get("wallet"); return view(isAddr(a) ? lc(a) : ""); } return null; },
    async handle(b) { if (b.action === "world-rq-hit") return hit(b); if (b.action === "world-rq-claim") return claim(b); return null; },
  };
}
