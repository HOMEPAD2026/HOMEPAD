// api/_world-raidq.mjs — RAID QUEENS (the owner's design, 2026-10-25): runs in a space of their own, like SURVIVORS ARENA.
// Through the RAID QUEENS portal by the fountain a player picks a queen and plays a run alone: waves of Imps, elite
// Puglins, then the queen herself (phases at 60 % / 25 %). Three runs a Seoul day (RQ.DAY_RUNS), across the three queens.
//   lysitha  Silver Sanctum   Lv 100+   ·   solvira  Golden Dominion   Lv 200+   ·   nyxara  Crimson Abyss   Lv 300+
//   throne   Throne of Three  Lv 400+ — the three queens at once (counted in the three a day)
//   secret   ??? — the three queens together, Lv 70s, about two minutes alone, Lv 120 → about 140, better gear; a run
//            costs RQ.SECRET.PRICE $ARCIRCLE from the player's wallet (to FeeBurn: half burned, half the treasury, the
//            server reads the transfer back), free for GM wallets; not counted in the three a day
// The game can't be watched from here: a run is bounded instead — started here (its mode, level and clock kept), ended
// here no sooner than its minimum time and no later than TIME_MAX, once. A won run's XP is granted on the server
// (worldXpGrant: the save takes it beyond the usual pace, api/_world.mjs), its gear made here, its ARCL awarded here.
//
//   GET  ?world=rq&wallet=0x…?                      { open, gm, day: { used, max }, best, tickets, clears, pay }
//   POST { action: "world-rq-start", …signature, mode }          → { run, mode, seed }  (403 closed / level, 429 the day's three)
//   POST { action: "world-rq-end", …signature, run, won, kills } → { xp, items, arcl, credited, best, t }
//   POST { action: "world-rq-buy", …signature, tx }              a SECRET ticket from a transfer (202 while it's unconfirmed)
//   GET  ?world=rq-top&mode=lysitha|solvira|nyxara|throne|secret   { week, mode, top: [{ w, name, t }], crews: [{ id, name, tag, n }] }
//
// Firestore: worldRqRun/<id> { w, mode, at, lv } · worldRqDone/<id> · worldRqDay/<wallet>_<day> { n } · worldRqTicket/<wallet> { n }
//            worldRqBest/<wallet> { <mode>: seconds } · worldRqClear/<wallet> { <mode>: n } · worldPayTx/<tx> · worldXpGrant/<wallet> { n }
// The game keeps a copy of RQ (world-raidq-data.js); tests/world/raidq.test.mjs checks the two agree.
import { ARCIRCLE, FEE_BURN } from "./_world-shop.mjs";
import { xpAt, xpPerMin, levelOfSave } from "./_world-social.mjs";
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");

export const RQ = {
  OPEN: true, // open to everyone (the owner, 2026-10-25; it was GM wallets only)
  DAY_RUNS: 3, TIME_MAX: 15 * 60, // three runs a Seoul day (the owner's call), a run's clock at most 15 minutes
  MODES: [ // lv: to enter · min: the shortest win the server takes (s) · xpMin: a win's XP in minutes of xpPerMin(your level) · arcl, item: a win's reward
    { id: "lysitha", region: "Silver Sanctum", lv: 100, boss: 100, min: 150, xpMin: 6, arcl: 2000, item: { r: 3, p: 3, n: 1 } },
    { id: "solvira", region: "Golden Dominion", lv: 200, boss: 200, min: 150, xpMin: 8, arcl: 3000, item: { r: 4, p: 3, n: 1 } },
    { id: "nyxara", region: "Crimson Abyss", lv: 300, boss: 300, min: 150, xpMin: 10, arcl: 5000, item: { r: 4, p: 5, n: 1 } },
    // the Throne of Three (the owner, 2026-10-25: 100 / 200 / 300 / 400 / SECRET from the one building): the three queens at once, Lv 400
    { id: "throne", region: "Throne of Three", lv: 400, boss: 400, min: 180, xpMin: 14, arcl: 8000, item: { r: 4, p: 6, n: 2 }, trio: true },
  ],
  // the SECRET dungeon: its price in $ARCIRCLE, its level to enter, its three queens' levels, the shortest win, a win's XP
  // (Lv 120 → 140 in XP, the owner's number: xpAt(140) − xpAt(120)), its gear (better: Epic/Legendary, more +)
  // the first win of each run in a Seoul day: its ARCL × (1 + FIRST.arcl) and one more piece of gear (b4, 2026-10-25)
  FIRST: { arcl: 0.5, items: 1 },
  TOP_N: 20, // each run's week board (the fastest wins, one line a player)
  // RQX1 (2026-10-29, the owner): HARD — a run you've cleared once, again with the queen at ×1.6 HP and ×1.4 damage, more
  // monsters and a clock (limit s); a win pays XP ×1.5, ARCL ×1.6 and one more piece; its own best, clears and week board
  HARD: { xp: 1.5, arcl: 1.6, items: 1, limit: 420, hp: 1.6, atk: 1.4, mobs: 1.3 },
  // CROWN fragments: every win brings a queen's fragments (hard 3, the day's first +1; the Throne and the SECRET one for each
  // of the three); need of them make her crown — a look worn in the raid and in town
  CROWN: { need: 12, win: 1, hard: 3, first: 1, queens: ["lysitha", "solvira", "nyxara"] },
  SECRET: { id: "secret", PRICE: 1000000, lv: 70, bosses: [72, 75, 78], min: 60, xp: 410010, items: [{ r: 4, p: 5 }, { r: 4, p: 4 }, { r: 3, p: 5 }] },
};
export const modeOf = (id) => (id === "secret" ? RQ.SECRET : RQ.MODES.find((m) => m.id === id) || null);
export const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"];
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/// a won run's gear: one piece a queen (secret: three), its slot from the run, the player's level (the same every time)
export function itemsOf(mode, run, lv, extra = 0) {
  const M = modeOf(mode); if (!M) return [];
  const list = [...(mode === "secret" ? M.items : Array.from({ length: M.item.n }, () => ({ r: M.item.r, p: M.item.p }))), ...Array.from({ length: extra }, () => (mode === "secret" ? M.items[0] : { r: M.item.r, p: M.item.p }))];
  return list.map((x, i) => ({ id: ("rq" + hash(`${run}|${i}|id`).toString(36)).slice(0, 10).padEnd(6, "0"), b: `${SLOTS[hash(`${run}|${i}`) % SLOTS.length]}-4`, r: x.r, lv: Math.max(1, Math.min(100, lv)), p: x.p })); // (gear tops out at Lv 100, the save's cap and the gear's scale; the Crimson Celestial set is the step past it)
}
/// a won run's XP for a player of level lv
export const xpOf = (mode, lv, hard = false) => (mode === "secret" ? RQ.SECRET.xp : Math.round(xpPerMin(lv) * ((modeOf(mode) || {}).xpMin || 0) * (hard ? RQ.HARD.xp : 1)));
/// a win's crown fragments by queen: its own queen's (the Throne and the SECRET: one of each)
export function crownOf(mode, hard, first) { const C = RQ.CROWN, n = hard ? C.hard : C.win, out = {}; if (C.queens.includes(mode)) out[mode] = n + (first ? C.first : 0); else for (const q of C.queens) out[q] = 1 + (first && mode !== "secret" ? C.first : 0); return out; }
export const payInfo = () => ({ price: RQ.SECRET.PRICE, to: FEE_BURN, token: ARCIRCLE, amount: (BigInt(RQ.SECRET.PRICE) * 10n ** 18n).toString(), burnPct: 50 });

/// deps: { getDocs, setDoc, commit, json, now, signer(b), award(wallet, kind, n), save(wallet) → the save, isGM(wallet), receipt(tx) }
export function makeRaidQueens(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const gm = (w) => !!(deps.isGM && deps.isGM(w));
  const levelOf = async (w) => levelOfSave(await deps.save(w));
  async function view(w) {
    const t = now(), day = seoulDay(t);
    if (!w) return json(200, { open: RQ.OPEN, day: { used: 0, max: RQ.DAY_RUNS }, pay: payInfo() }, "public, max-age=30");
    const fks = [...RQ.MODES.map((m) => m.id), "secret"].map((m) => `worldRqFirst/${w}_${day}_${m}`);
    const d = await getDocs([`worldRqDay/${w}_${day}`, `worldRqTicket/${w}`, `worldRqBest/${w}`, `worldRqClear/${w}`, `worldRqCrown/${w}`, ...fks]);
    return json(200, { open: RQ.OPEN, gm: gm(w), day: { used: (d[`worldRqDay/${w}_${day}`] || {}).n || 0, max: RQ.DAY_RUNS }, tickets: (d[`worldRqTicket/${w}`] || {}).n || 0,
      best: d[`worldRqBest/${w}`] || {}, clears: d[`worldRqClear/${w}`] || {}, crown: d[`worldRqCrown/${w}`] || {}, firstDone: fks.filter((k) => d[k]).map((k) => k.split("_").pop()), pay: payInfo() }, "no-store");
  }
  async function start(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now(), G = gm(w);
    if (!RQ.OPEN && !G) return json(403, { error: "RAID QUEENS opens soon" });
    const M = modeOf(b.mode); if (!M) return json(400, { error: "no such run" });
    const lv = await levelOf(w); if (lv < M.lv) return json(403, { error: `this run is for level ${M.lv}+ (you're ${lv})`, need: M.lv });
    const hard = !!b.hard && M.id !== "secret"; if (hard && !G && !(((await one(`worldRqClear/${w}`)) || {})[M.id] > 0)) return json(403, { error: "clear this run once to open HARD" });
    if (M.id === "secret") {
      if (!G) { const tk = (await one(`worldRqTicket/${w}`)) || {}; if (!((tk.n || 0) > 0)) return json(402, { error: `the secret dungeon costs ${RQ.SECRET.PRICE.toLocaleString("en-US")} $ARCIRCLE`, pay: payInfo() });
        await commit([{ inc: `worldRqTicket/${w}`, fields: { n: -1 } }]); }
    } else if (!G) {
      const dk = `worldRqDay/${w}_${seoulDay(t)}`, used = ((await one(dk)) || {}).n || 0;
      if (used >= RQ.DAY_RUNS) return json(429, { error: `three runs a day — back tomorrow`, used });
      await commit([{ inc: dk, fields: { n: 1 } }]);
    }
    const id = ("r" + t.toString(36) + hash(`${w}|${t}|${Math.random()}`).toString(36)).slice(0, 20);
    await setDoc(`worldRqRun/${id}`, { w, mode: M.id, at: t, lv, ...(hard ? { hard: true } : {}) });
    return json(200, { ok: true, run: id, mode: M.id, seed: hash(id) % 1e6, lv, hard });
  }
  async function end(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now();
    const id = String(b.run || ""); if (!/^r[a-z0-9]{4,24}$/.test(id)) return json(400, { error: "which run?" });
    const r = await one(`worldRqRun/${id}`); if (!r || r.w !== w) return json(404, { error: "no such run" });
    const sec = (t - r.at) / 1000, M = modeOf(r.mode);
    if (b.won && sec < M.min) return json(400, { error: "that was too quick", min: M.min, t: Math.round(sec) }); // (before the lock: the run can still end once it's been long enough)
    if (!(await commit([{ create: `worldRqDone/${id}`, data: { at: t, won: !!b.won } }])).ok) return json(409, { error: "this run is already over" });
    if (!b.won) return json(200, { ok: true, won: false, t: Math.round(sec) });
    if (sec > (r.hard ? RQ.HARD.limit + 30 : RQ.TIME_MAX)) return json(400, { error: "the run's time ran out", t: Math.round(sec) }); // (HARD's clock, and half a minute for the last hit to reach us)
    const fk = `worldRqFirst/${w}_${seoulDay(t)}_${r.mode}`, first = (await commit([{ create: fk, data: { at: t, run: id } }])).ok; // (the day's first win of this run: a bonus)
    const H = !!r.hard, mk = r.mode + (H ? "H" : ""); // (HARD keeps its own best, clears and board under "<mode>H")
    const items = itemsOf(r.mode, id, r.lv, (first ? RQ.FIRST.items : 0) + (H ? RQ.HARD.items : 0)), xp = xpOf(r.mode, r.lv, H), arcl = r.mode === "secret" ? 0 : Math.round(M.arcl * (first ? 1 + RQ.FIRST.arcl : 1) * (H ? RQ.HARD.arcl : 1));
    const crown = crownOf(r.mode, H, first);
    await commit([{ inc: `worldXpGrant/${w}`, fields: { n: xp } }, { inc: `worldRqClear/${w}`, fields: { [mk]: 1 } }, { inc: `worldRqCrown/${w}`, fields: crown }, { inc: "worldStats/raidq", fields: { [mk]: 1 } }]).catch(() => {});
    const bk = `worldRqBest/${w}`, bst = (await one(bk)) || {}, tt = Math.round(sec), best = !bst[mk] || tt < bst[mk];
    if (best) await setDoc(bk, { ...bst, [mk]: tt });
    const credited = arcl && deps.award ? await deps.award(w, "raidq", arcl) : 0;
    const rank = await boards(w, mk, tt).catch(() => null); const crowns = (await one(`worldRqCrown/${w}`)) || {};
    // the Crimson Celestial set: maybe a MYTHIC piece, made and kept on the server (api/_world-mythic.mjs; once a run: after the done-lock)
    const mythic = deps.mythic ? await deps.mythic.roll(w, r.mode, id).catch(() => null) : null;
    return json(200, { ok: true, won: true, mode: r.mode, hard: H, t: tt, xp, items, arcl, credited, best, first, rank, crown, crowns, ...(mythic ? { mythic } : {}) });
  }
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : seoulDay(now()).slice(0, 7));
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  /// a win on the week's boards: the run's fastest (one line a player) and the crews' clears; returns your place
  async function boards(w, mode, t) {
    const wk = week(), key = `worldStats/rqWeek_${wk}_${mode}`, cur = await one(key); let top = (cur && cur.top) || [];
    const was = top.find((x) => x.id === w);
    if (!was || t < was.t) { const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16); top = [{ w: short(w), id: w, t, name }, ...top.filter((x) => x.id !== w)].sort((a, b) => a.t - b.t).slice(0, RQ.TOP_N); await setDoc(key, { top }); }
    const cm = await one(`worldCrewOf/${w}`);
    if (cm && cm.id) { const c = await one(`worldCrew/${cm.id}`); if (c) { const ck = `worldStats/rqCrewWeek_${wk}`, cc = (await one(ck)) || {}, e = cc[cm.id] || { n: 0 };
      const faster = !e.t || t < e.t, nm = faster ? String(((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16) : e.by || ""; // (RQX1: the crew's fastest win of the week and who made it)
      await setDoc(ck, { ...cc, [cm.id]: { n: (e.n || 0) + 1, name: String(c.name || "").slice(0, 24), tag: String(c.tag || "").slice(0, 6), t: faster ? t : e.t, by: nm } }); } }
    const i = top.findIndex((x) => x.id === w); return i < 0 ? null : i + 1;
  }
  async function topView(mode) {
    const H = /H$/.test(mode), M = modeOf(H ? mode.slice(0, -1) : mode); if (!M || (H && M.id === "secret")) return json(400, { error: "which run?" });
    const wk = week(), [d, cc] = await Promise.all([one(`worldStats/rqWeek_${wk}_${M.id}${H ? "H" : ""}`), one(`worldStats/rqCrewWeek_${wk}`)]);
    const crews = Object.entries(cc || {}).map(([id, v]) => ({ id, name: v.name, tag: v.tag, n: v.n || 0, t: v.t || 0, by: v.by || "" })).sort((a, b) => b.n - a.n || (a.t || 1e9) - (b.t || 1e9)).slice(0, 10);
    return json(200, { week: wk, mode: M.id + (H ? "H" : ""), top: ((d && d.top) || []).map(({ w, name, t }) => ({ w, name: name || w, t })), crews }, "public, max-age=30");
  }
  // a SECRET ticket: a transfer of SECRET.PRICE $ARCIRCLE from this wallet to FeeBurn, each transaction good for one run
  async function buy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    if (!RQ.OPEN && !gm(w)) return json(403, { error: "RAID QUEENS opens soon" });
    const tx = lc(b.tx); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "which transaction?", pay: payInfo() });
    const txk = `worldPayTx/${tx}`; if (await one(txk)) return json(409, { error: "this transaction was already used" });
    const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" });
    if (rc.status !== "0x1") return json(400, { error: "the transaction failed" });
    const paid = (rc.logs || []).filter((l) => lc(l.address) === ARCIRCLE && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(w) && lc(l.topics[2]) === pad32(FEE_BURN)).reduce((x, l) => x + BigInt(l.data), 0n);
    if (paid < BigInt(RQ.SECRET.PRICE) * 10n ** 18n) return json(400, { error: `the transfer is less than ${RQ.SECRET.PRICE.toLocaleString("en-US")} $ARCIRCLE` });
    if (!(await commit([{ create: txk, data: { wallet: w, item: "rq-secret", at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    const tok = Number(paid / 10n ** 12n) / 1e6;
    await commit([{ inc: `worldRqTicket/${w}`, fields: { n: 1 } }, { inc: "worldStats/shop", fields: { paid: 1, arcPaid: tok, arcBurned: tok / 2 } }, { inc: "worldStats/rqSales", fields: { n: 1, arc: tok } }]);
    return json(200, { ok: true, tickets: (((await one(`worldRqTicket/${w}`)) || {}).n) || 1 });
  }
  return {
    async read(v, url) { if (v === "rq") { const a = url.searchParams.get("wallet"); return view(isAddr(a) ? lc(a) : ""); } if (v === "rq-top") return topView(String(url.searchParams.get("mode") || "lysitha")); return null; },
    async handle(b) { if (b.action === "world-rq-start") return start(b); if (b.action === "world-rq-end") return end(b); if (b.action === "world-rq-buy") return buy(b); return null; },
  };
}
// (the SECRET's XP is the owner's: from Lv 120 to 140)
export const SECRET_XP_CHECK = () => xpAt(140) - xpAt(120);
