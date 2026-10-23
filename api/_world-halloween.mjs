// api/_world-halloween.mjs — the Halloween event's Pumpkin Kings (2026-10-22, the owner's design): five Pumpkin Kings
// dance round the town by day; at night (20:00–05:00 US Eastern, the owner's call) each throws off its pumpkin and
// rampages as Inferno Jack, Lv 15 / 35 / 55 / 75 / 95. Its HP is everyone's (like the weekly raid: the game reports its
// damage every 5 s, capped by the reporter's level); when it falls, the three who hit it hardest share its reward —
// ARCL (outside the daily cap, in the ledger as "halloween") and a +enhanced piece of gear (Lv 95's first: Jack's
// Inferno Blade). Each falls once a night; the next night it's back at full HP.
//
//   GET  ?world=pk&wallet=0x…?                    { on, day, night: { on, id, at, next }, kings: [{ id, lv, hp, max, down, top }], mine, wins }
//   POST { action: "world-pk-hit", …signature, king, dmg }   damage dealt in the last 5 s (≤ 60 × your level, your level ≥ the king's − 10)
//   POST { action: "world-pk-claim", …signature, king, night? } a top-3 hitter's reward, once (asked again: the same reward back)
//
// Firestore: worldPk/<night>_<king> { dmg } · worldPkDmg/<night>_<king>_<wallet> { n } · worldStats/pkTop_<night>_<king> { top }
//            worldPkGap/<night>_<wallet>_<slot> · worldPkFell/<night>_<king> { at, top } · worldPkClaim/<night>_<king>_<wallet> { rank, arcl, item }
// The game keeps a copy of PK (world-pumpking-data.js); tests/world/pumpking.test.mjs checks the two agree.
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);

export const PK = {
  TZ: "America/New_York",
  FROM: "2026-10-22", TO: "2026-11-05", // US Eastern dates, both included: the kings are in town; a night starts on FROM … the day before TO (14 nights)
  NIGHT: [20, 5], // the rampage: 20:00 to 05:00 US Eastern
  KINGS: [ // hp: everyone's; arcl and the item go to the top hitter, the 2nd and 3rd get RANK's share and PLUS_DOWN fewer +
    { id: "k15", lv: 15, hp: 45000, arcl: 3000, item: { r: 2, p: 5 } },
    { id: "k35", lv: 35, hp: 105000, arcl: 6000, item: { r: 3, p: 3 } },
    { id: "k55", lv: 55, hp: 165000, arcl: 10000, item: { r: 3, p: 5 } },
    { id: "k75", lv: 75, hp: 225000, arcl: 18000, item: { r: 4, p: 3 } },
    { id: "k95", lv: 95, hp: 285000, arcl: 30000, item: { r: 4, p: 5, u: "jack" } },
  ],
  RANK: [1, 0.6, 0.4], PLUS_DOWN: [0, 1, 2],
  GAP: 5, CAP_K: 60, LV_BELOW: 10, MIN_SHARE: 0.02, // one report per 5 s, ≤ 60 × level each; your level ≥ the king's − 10; a top-3 place needs ≥ 2% of its HP
};
const SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"];

// ---- US Eastern time (Intl knows the clock changes; 1 Nov 2026 falls inside the event) ----
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: PK.TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function etParts(t) { const p = {}; for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value; return { day: `${p.year}-${p.month}-${p.day}`, h: +p.hour % 24, m: +p.minute }; }
const dayAdd = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
/// the moment a US Eastern wall-clock hour happens on a day (two passes: the offset at that moment, not now)
export function etAt(day, h) { let t = Date.parse(day + "T00:00:00Z") + h * 3600e3; for (let i = 0; i < 2; i++) { const p = etParts(t), off = Date.parse(`${p.day}T${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}:00Z`) - t; t = Date.parse(day + "T00:00:00Z") + h * 3600e3 - off; } return t; }
/// the kings are in town (day or night)
export const dayOn = (t) => { const d = etParts(t).day; return d >= PK.FROM && d <= PK.TO; };
/// which night it is: id = the US Eastern date it began on; on while 20:00–05:00 of an event night; next: when the next one begins
export function nightOf(t) {
  const p = etParts(t), id = p.h >= PK.NIGHT[0] ? p.day : p.h < PK.NIGHT[1] ? dayAdd(p.day, -1) : "", on = !!id && id >= PK.FROM && id < PK.TO;
  let nd = p.h >= PK.NIGHT[0] ? dayAdd(p.day, 1) : p.day; if (nd < PK.FROM) nd = PK.FROM;
  const next = nd < PK.TO ? etAt(nd, PK.NIGHT[0]) : 0;
  return { on, id: on ? id : "", at: on ? etAt(dayAdd(id, 1), PK.NIGHT[1]) : 0, next };
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/// a place's reward: rank 0–2 → { arcl, item } (the item's slot from the wallet and the night, the same every time)
export function rewardOf(king, rank, w, night) {
  const K = PK.KINGS.find((k) => k.id === king); if (!K || !(rank >= 0 && rank < PK.RANK.length)) return null;
  const u = rank === 0 && K.item.u ? K.item.u : "", slot = u ? "weapon" : SLOTS[hash(`${w}|${night}|${king}`) % SLOTS.length];
  const tier = K.lv >= 20 ? 4 : K.lv >= 15 ? 3 : 2, id = ("pk" + hash(`${w}|${night}|${king}|id`).toString(36)).slice(0, 10).padEnd(6, "0");
  return { arcl: Math.round(K.arcl * PK.RANK[rank]), item: { id, b: `${slot}-${tier}`, r: K.item.r, lv: Math.min(100, K.lv), p: Math.max(0, K.item.p - PK.PLUS_DOWN[rank]), ...(u ? { u } : {}) } };
}

/// deps: { getDocs, setDoc, commit, json, now, signer(b), award(wallet, kind, n), level(wallet), nameOf(wallet) }
export function makeHalloween(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  async function state(w, night) {
    const n = night || nightOf(now()).id, ks = PK.KINGS;
    const paths = n ? ks.flatMap((k) => [`worldPk/${n}_${k.id}`, `worldStats/pkTop_${n}_${k.id}`, `worldPkFell/${n}_${k.id}`, ...(w ? [`worldPkDmg/${n}_${k.id}_${w}`, `worldPkClaim/${n}_${k.id}_${w}`] : [])]) : [];
    const d = paths.length ? await getDocs(paths) : {};
    const kings = ks.map((k) => { const dmg = n ? ((d[`worldPk/${n}_${k.id}`] || {}).dmg || 0) : 0, fell = n ? d[`worldPkFell/${n}_${k.id}`] : null;
      return { id: k.id, lv: k.lv, max: k.hp, hp: Math.max(0, k.hp - dmg), down: !!fell || dmg >= k.hp, top: ((n && (d[`worldStats/pkTop_${n}_${k.id}`] || {}).top) || []).slice(0, 5).map((x) => ({ w: x.w, name: x.name, n: x.n, ...(w && x.id === w ? { me: 1 } : {}) })), fell }; });
    const mine = {}, wins = [];
    if (w && n) for (const k of ks) { const m = (d[`worldPkDmg/${n}_${k.id}_${w}`] || {}).n || 0; if (m) mine[k.id] = m;
      const f = d[`worldPkFell/${n}_${k.id}`], r = f ? (f.top || []).findIndex((x) => x.id === w) : -1, c = d[`worldPkClaim/${n}_${k.id}_${w}`];
      if (r >= 0) wins.push({ king: k.id, night: n, rank: r + 1, ...(c ? { claimed: 1, arcl: c.arcl, item: c.item } : rewardOf(k.id, r, w, n)) }); }
    return { night: n, kings, mine, wins };
  }
  const pub = (s) => ({ kings: s.kings.map(({ fell, ...k }) => k), mine: s.mine, wins: s.wins });
  async function view(w) { const t = now(), ni = nightOf(t), s = await state(w, ni.id); return json(200, { on: dayOn(t), day: etParts(t).day, night: ni, ...pub(s) }, w ? "no-store" : "public, max-age=5"); }

  async function hit(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), ni = nightOf(t); if (!ni.on) return json(400, { error: "the Pumpkin Kings only fight at night (20:00–05:00 US Eastern)" });
    const K = PK.KINGS.find((k) => k.id === b.king); if (!K) return json(400, { error: "no such Pumpkin King" });
    const lv = await deps.level(w); if (lv < K.lv - PK.LV_BELOW) return json(403, { error: `this one is for level ${K.lv - PK.LV_BELOW}+ (you're ${lv})`, need: K.lv - PK.LV_BELOW });
    const n0 = ni.id, key = `worldPk/${n0}_${K.id}`, cur = (await one(key)) || {}, left = K.hp - (cur.dmg || 0);
    if (left <= 0 || (await one(`worldPkFell/${n0}_${K.id}`))) return json(200, { ok: true, counted: 0, ...pub(await state(w, n0)) });
    if (!(await commit([{ create: `worldPkGap/${n0}_${w}_${Math.floor(t / (PK.GAP * 1000))}`, data: { at: t } }])).ok) return json(429, { error: "one report every 5 seconds" });
    const n = Math.max(0, Math.min(PK.CAP_K * lv, Math.floor(Number(b.dmg) || 0), left)); if (!n) return json(200, { ok: true, counted: 0, ...pub(await state(w, n0)) });
    await commit([{ inc: key, fields: { dmg: n } }, { inc: `worldPkDmg/${n0}_${K.id}_${w}`, fields: { n } }]);
    const mine = ((await one(`worldPkDmg/${n0}_${K.id}_${w}`)) || {}).n || n, tk = `worldStats/pkTop_${n0}_${K.id}`, list = ((await one(tk)) || {}).top || [];
    let top = list; if (list.length < 10 || mine > list[list.length - 1].n || list.some((x) => x.id === w)) { const name = String((await deps.nameOf(w)) || "").slice(0, 16); top = [{ id: w, w: short(w), name, n: mine }, ...list.filter((x) => x.id !== w)].sort((a, c) => c.n - a.n).slice(0, 10); await setDoc(tk, { top, at: t }); }
    const after = ((await one(key)) || {}).dmg || 0;
    if (after >= K.hp) { const podium = top.filter((x) => x.n >= K.hp * PK.MIN_SHARE).slice(0, 3).map((x) => ({ id: x.id, n: x.n })); await commit([{ create: `worldPkFell/${n0}_${K.id}`, data: { at: t, top: podium } }]).catch(() => {}); }
    return json(200, { ok: true, counted: n, fell: after >= K.hp, ...pub(await state(w, n0)) });
  }
  async function claim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), K = PK.KINGS.find((k) => k.id === b.king); if (!K) return json(400, { error: "no such Pumpkin King" });
    // tonight's, or the last night's (a reward waits until the next night is over)
    const ni = nightOf(t), last = nightOf(t - 12 * 3600e3), night = /^\d{4}-\d{2}-\d{2}$/.test(String(b.night || "")) ? String(b.night) : ni.id || last.id;
    if (!night || ![ni.id, last.id, nightOf(t - 24 * 3600e3).id].includes(night)) return json(400, { error: "that night's rewards are gone" });
    const f = await one(`worldPkFell/${night}_${K.id}`); if (!f) return json(400, { error: "this Pumpkin King hasn't fallen yet" });
    const rank = (f.top || []).findIndex((x) => x.id === w); if (rank < 0) return json(403, { error: "only its top 3 hitters share this reward" });
    const ck = `worldPkClaim/${night}_${K.id}_${w}`, had = await one(ck); if (had) return json(200, { ok: true, again: true, night, rank: rank + 1, arcl: had.arcl, item: had.item, credited: 0 });
    const R = rewardOf(K.id, rank, w, night);
    if (!(await commit([{ create: ck, data: { at: t, rank: rank + 1, arcl: R.arcl, item: R.item } }])).ok) { const h2 = await one(ck); return json(200, { ok: true, again: true, night, rank: rank + 1, arcl: h2 ? h2.arcl : R.arcl, item: h2 ? h2.item : R.item, credited: 0 }); }
    const got = deps.award ? await deps.award(w, "halloween", R.arcl) : 0;
    return json(200, { ok: true, night, rank: rank + 1, arcl: R.arcl, item: R.item, credited: got });
  }
  return {
    async read(v, url) { if (v === "pk") { const a = url.searchParams.get("wallet"); return view(isAddr(a) ? lc(a) : ""); } return null; },
    async handle(b) { if (b.action === "world-pk-hit") return hit(b); if (b.action === "world-pk-claim") return claim(b); return null; },
  };
}
