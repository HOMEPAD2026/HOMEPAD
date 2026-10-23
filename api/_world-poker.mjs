// api/_world-poker.mjs — ARCIA POKER LOUNGE (world-poker.js): the chips, the solo game's record, the multiplayer
// tables (dealt, timed and settled here with api/_world-poker-engine.mjs, a copy of the game's world-poker-engine.js),
// blackjack against ARCIA (dealt here with api/_world-blackjack-engine.mjs), and the lounge's daily missions.
// Chips: free every day (DAY_CHIPS), or bought with ARCL (POKER.PACKS, at most BUY_DAY ARCL a day) — one way only:
// chips never turn back into ARCL. The tables and blackjack play the chips in your record; solo poker is practice.
// The only ARCL paid here is the missions', which don't depend on winning (finish 3 solo games · play 20 table hands
// · play 30 blackjack hands), through the shop's credit (ARCL kind "poker").
//
//   POST world-poker-me          { …sig }                       → { prog }        (today's free chips topped up here)
//   POST world-poker-solo-start  { …sig, lvl }                  → { runId }
//   POST world-poker-solo-end    { …sig, runId, hands, won, best } → { xp, lv, mission }  (a game counts if it took a person's time)
//   POST world-poker-create      { …sig, stake, priv }          → { room }        (you sit down with the stake's buy-in)
//   POST world-poker-join        { …sig, room | code }          → { room }
//   POST world-poker-leave       { …sig, room }                 → { ok }          (your stack back to your chips; mid-hand: you fold)
//   POST world-poker-act         { …sig, room, t, to }          → { room }        (fold / check / call / raise / allin)
//   POST world-poker-view        { …sig?, room }                → { room }        (and the table moves on: timeouts, computer seats, the next hand)
//   POST world-poker-bots        { …sig, room, n, lvl }         → { room }        (computer players into empty seats)
//   POST world-poker-chat        { …sig, room, text }           → { room }
//   POST world-poker-buy         { …sig, pack }                 → { prog, bal }   (ARCL → chips, one way)
//   POST world-bj-state          { …sig }                       → { round, prog } (the round in play, if any: it waits for you)
//   POST world-bj-deal           { …sig, table, bet }           → { round, prog }
//   POST world-bj-act            { …sig, a }                    → { round, prog, credited }  (hit / stand / double / split / surrender)
//   POST world-bj-ins            { …sig, take }                 → { round, prog, credited }  (insurance, while ARCIA shows an ace)
//   GET  ?world=poker-rooms → the open public tables · ?world=poker-top → the week's most chips won at the tables
//
// A table is one document (worldPokerRoom/<id>) with the hand in it; each change writes the next version together
// with a create-only marker worldPokerSeq/<id>_<v>, so two requests at once can't both move the table.
// A seat's view shows its own cards only (the deck never leaves the server).
// Firestore: worldPokerProg/<w> · worldPokerRun/<w> · worldPokerEnd/<runId> · worldPokerRoom/<id> · worldPokerSeq/…
//            worldPokerPay/<w>_<day>_<mission> · worldPokerWeek/<week>_<w> · worldStats/pokerRooms · worldStats/pokerWeek_<week>
//            worldPokerBought/<w> { n } (chips bought, only ever added to; the record folds them in) · worldPokerBuy/<w>_<day>
//            worldBjRound/<w> (the shoe and the round; a version marker worldBjSeq/<w>_<v> with each change)
//            worldStats/pokerFest { start, day0 } (the Opening Festival's first day, set by the first request) ·
//            worldPokerAward/<w> { unlocks, titles, news } (what events give: kept apart from the record, never lost)
//            worldPokerFest/<w>_<day0>_<stamps> · worldPokerFirst/<w> · worldPokerJack/… · worldPokerChampDone/<week> (once markers)
// b-pky3: the record's counts and badges (p.st; engine handStats / BADGES) · worldPokerLook/<w>_<id> (a look bought
//            with chips, once) · worldStats/pokerRule_<day> (the daily rule's board) · worldPokerCrewRooms/<crew> (a crew's
//            tables) · worldPokerCrewWeek/<week>_<crew> { n } and worldStats/pokerCrewWeek_<week> (the crews' week board)
//   POST world-poker-look-buy    { …sig, id }                   → { prog }        (a card back or felt for chips: POKER.SHOP)
//   POST world-poker-crew        { …sig }                       → { crew, rooms, board }  (your crew's tables, and the crews' week)
//   POST world-poker-create      { …sig, stake, crew: true }    → a crew table: private, only your crew can sit down
//   GET  ?world=poker-rule → today's rule and its board
import { POKER, newHand, act, botMove, viewOf, legal, rng, settle, handStats, addStats, badgesOf, ruleOf, STAT_KEYS } from "./_world-poker-engine.mjs";
import { BJ, deal as bjDealE, act as bjActE, insure as bjInsE, viewOf as bjView, tableOf } from "./_world-blackjack-engine.mjs";

const RUN_TTL = 3 * 3600e3, SHOW_MS = 4500, BOT_MS = 900, AWAY_KICK = 5 * 60e3, TOP_N = 20;
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const BOTS = ["AI ARON", "AI LUMI", "AI NEX", "AI ARC", "AI MINT"];
// the hero a seat is drawn as at the table (world-poker.js seats them in 3D): the player's own (ch, tn: their colour), a
// computer player's from its name. Only a shape is checked; the page draws anything it doesn't know as the default hero
const lookOf = (b) => ({ ch: /^custom-[a-z]{2,10}$/.test(String((b && b.ch) || "")) ? String(b.ch) : "", tn: Math.max(0, Math.min(7, Number(b && b.tn) | 0)) });
const BOT_LOOK = [["custom-aron", 0], ["custom-lumi", 0], ["custom-nex", 0], ["custom-aron", 3], ["custom-lumi", 1]];
// b-pky2: the scheduled Sit & Go — one starts every 2 hours (even UTC hours); sign up any time before it starts (the
// entry in chips, given back if you change your mind); at the start the computers fill the empty seats; everyone has
// the same tournament chips (not your chips) and the blinds rise every 5 hands; the last one standing wins. The prizes
// are chips (the entries plus the house's), poker XP and a title for the winner — never ARCL
export const SNG = { EVERY: 2 * 3600e3, ENTRY: 1000, HOUSE: 5000, START: 1500, SEATS: 6, LV_HANDS: 5, BOT_LVL: 1,
  BLINDS: [[10, 20], [20, 40], [30, 60], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000], [800, 1600], [1200, 2400], [2000, 4000]],
  PAY: [0.5, 0.3, 0.2], XP: [200, 120, 60], TITLE: "Sit & Go Champion", KEEP: 45 * 60e3 };
export const sngAt = (t, k = 0) => (Math.floor(t / SNG.EVERY) + 1 + k) * SNG.EVERY; // the k-th start after t
export const sngBlinds = (handNo) => SNG.BLINDS[Math.min(SNG.BLINDS.length - 1, Math.floor(Math.max(0, handNo - 1) / SNG.LV_HANDS))];
export function sngPrizes(humans) { const pool = humans * SNG.ENTRY + SNG.HOUSE; return { pool, pay: SNG.PAY.map((f) => Math.floor(pool * f)) }; }
/// the poker level from poker XP: 100 XP a level to 10, then 150 / 200 / 250 / 300 (world-poker.js shows the same)
export function levelOf(xp) { let lv = 1, need = 100, left = Math.max(0, xp | 0); while (lv < POKER.LEVELS) { need = lv <= 10 ? 100 : lv <= 25 ? 150 : lv <= 50 ? 200 : lv <= 75 ? 250 : 300; if (left < need) break; left -= need; lv++; } return { lv, into: left, need }; }

/// deps: { getDocs, setDoc, commit, json, now, signer(b), credit(wallet, kind, n), isoWeek(t)?, randomId?, randInt? }
export function makePoker(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const randInt = deps.randInt || (() => crypto.getRandomValues(new Uint32Array(1))[0] | 0);
  const one = async (p) => (await getDocs([p]))[p];
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : seoulDay(now()).slice(0, 7));
  const stakeOf = (id) => POKER.STAKES.find((x) => x.id === id) || POKER.STAKES[0];

  // ---------------- the Opening Festival ----------------
  const F = POKER.FEST; let festC = { on: false };
  /// the festival as it stands now: { on, day (1–7), days, day0, end, happy } — its first day is set by the first
  /// request after it ships (a create-only write, so every server agrees)
  async function festNow() {
    let d = await one("worldStats/pokerFest"); const t = now();
    if (!d) { const day0 = seoulDay(t), start = Date.parse(day0 + "T00:00:00+09:00"); await commit([{ create: "worldStats/pokerFest", data: { start, day0 } }]); d = (await one("worldStats/pokerFest")) || { start, day0 }; }
    const day = Math.floor((t - d.start) / 864e5) + 1, end = d.start + F.DAYS * 864e5, h = new Date(t + 9 * 3600e3).getUTCHours();
    festC = { on: day >= 1 && day <= F.DAYS, day, days: F.DAYS, day0: d.day0, start: d.start, end, happy: day >= 1 && day <= F.DAYS && h >= F.HAPPY[0] && h < F.HAPPY[1] };
    return festC;
  }
  const mult = () => (festC.on && festC.happy ? 2 : 1); // (happy hour: mission progress ×2)
  const say = (p, t, x = {}) => { p.news = [...(p.news || []), { at: now(), t, ...x }].slice(-8); };
  /// what an event gives that must never be lost (looks, titles, a line of news): its own record, read with yours
  async function award(w, f) { const k = `worldPokerAward/${w}`, a = (await one(k)) || { unlocks: [], titles: [], news: [] }; f(a); a.news = (a.news || []).slice(-8); await setDoc(k, a); }
  const addChips = (w, n) => commit([{ inc: `worldPokerBought/${w}`, fields: { n } }]);
  /// a day's stamp (10 real table or blackjack hands), and the ARCL at 3 / 5 / 7 stamps — once each
  async function stamp(w, p) {
    if (!festC.on) return; const day = seoulDay(now()); p.fest = p.fest && p.fest.day0 === festC.day0 ? p.fest : { day0: festC.day0, stamps: [] };
    if ((p.mis.played || 0) < F.STAMP || p.fest.stamps.includes(day)) return;
    p.fest.stamps = [...p.fest.stamps, day]; say(p, "stamp", { n: p.fest.stamps.length });
    for (const [th, arcl] of Object.entries(F.STAMPS)) {
      if (p.fest.stamps.length < +th || !(await commit([{ create: `worldPokerFest/${w}_${festC.day0}_${th}`, data: { at: now() } }])).ok) continue;
      const got = deps.credit ? await deps.credit(w, "poker-fest", arcl) : 0; say(p, "stampPay", { n: +th, a: got });
      if (+th === 7) await award(w, (a) => { a.unlocks = [...new Set([...(a.unlocks || []), "back:night"])]; a.news = [...(a.news || []), { at: now(), t: "night" }]; });
    }
  }
  /// the week's top 3 at the tables, paid once the week is over (for the weeks the festival ran in)
  async function champions() {
    if (!festC.start || !deps.isoWeek) return; const t = now(), prev = deps.isoWeek(t - 7 * 864e5), w0 = deps.isoWeek(festC.start), w1 = deps.isoWeek(festC.end - 1);
    if (prev < w0 || prev > w1 || prev >= deps.isoWeek(t)) return;
    if (!(await commit([{ create: `worldPokerChampDone/${prev}`, data: { at: t } }])).ok) return;
    const top = (((await one(`worldStats/pokerWeek_${prev}`)) || {}).top || []).filter((x) => x.n > 0).slice(0, 3);
    for (let r = 0; r < top.length; r++) {
      const id = top[r].id, c = F.CHAMP[r]; await addChips(id, c);
      await award(id, (a) => { a.unlocks = [...new Set([...(a.unlocks || []), "felt:champ"])]; a.titles = [...new Set([...(a.titles || []), "Table Champion"])]; a.news = [...(a.news || []), { at: t, t: "champ", r: r + 1, c, wk: prev }]; });
    }
  }

  // ---------------- your record: chips, poker XP, the missions ----------------
  async function prog(w) {
    await festNow().catch(() => {});
    const d = await getDocs([`worldPokerProg/${w}`, `worldPokerBought/${w}`, `worldPokerAward/${w}`]);
    const p = d[`worldPokerProg/${w}`] || { chips: 0, chipDay: "", xp: 0, xpDay: "", xpToday: 0, games: 0, wins: 0, best: -1, hands: 0, mis: {} };
    // chips bought with ARCL: an add-only count, folded in here (a record written over by an older copy folds them in
    // again, so a purchase can't be lost)
    const bought = (d[`worldPokerBought/${w}`] || {}).n || 0; if (bought > (p.boughtSeen || 0)) { p.chips = (p.chips || 0) + bought - (p.boughtSeen || 0); p.boughtSeen = bought; }
    const day = seoulDay(now());
    const free = festC.on ? F.CHIPS : POKER.DAY_CHIPS;
    if (p.chipDay !== day) { if ((p.chips || 0) < free) p.chips = free; p.chipDay = day; p.fresh = true; } // today's free chips (doubled in the festival)
    if (p.xpDay !== day) { p.xpDay = day; p.xpToday = 0; }
    if (!p.mis || p.mis.day !== day) p.mis = { day, solo: 0, hands: 0, bj: 0, played: 0 };
    const a = d[`worldPokerAward/${w}`] || {}; Object.defineProperty(p, "award", { value: a, enumerable: false }); // (read with the record, never saved into it)
    return p;
  }
  const saveProg = (w, p) => { const { fresh, ...rest } = p; return setDoc(`worldPokerProg/${w}`, rest); };
  const pub = (p) => ({ chips: p.chips, xp: p.xp, ...levelOf(p.xp), games: p.games || 0, wins: p.wins || 0, best: p.best != null ? p.best : -1, hands: p.hands || 0, bjHands: p.bjHands || 0, bjBJ: p.bjBJ || 0, bjBest: p.bjBest || 0, mis: p.mis,
    unlocks: (p.award && p.award.unlocks) || [], titles: (p.award && p.award.titles) || [], news: [...(p.news || []), ...((p.award && p.award.news) || [])].sort((a, b) => a.at - b.at).slice(-8),
    st: p.st || {}, badges: badgesOf(p.st), fest: festC.on ? { day: festC.day, days: festC.days, end: festC.end, happy: festC.happy, stamps: p.fest && p.fest.day0 === festC.day0 ? p.fest.stamps : [], first: !p.firstBuy, played: p.mis.played || 0 } : null, xpToday: p.xpToday || 0, xpCap: POKER.XP_DAY });
  function addXp(p, n) { const g = Math.max(0, Math.min(n, POKER.XP_DAY - (p.xpToday || 0))); p.xp = (p.xp || 0) + g; p.xpToday = (p.xpToday || 0) + g; return g; }
  /// a mission reached: paid once that day (a create-only marker), inside the shop's daily cap
  async function mission(w, p, key) {
    const m = POKER.MISSIONS[key], have = key === "solo3" ? p.mis.solo : key === "bj30" ? p.mis.bj || 0 : p.mis.hands;
    if (!m || have < m.need) return 0;
    if (!(await commit([{ create: `worldPokerPay/${w}_${p.mis.day}_${key}`, data: { at: now() } }])).ok) return 0;
    return deps.credit ? deps.credit(w, "poker", m.arcl) : 0;
  }

  async function me(b) { const s = signer(b); if (s.err) return s.err; await festNow().catch(() => {}); await champions().catch(() => {}); const p = await prog(s.wallet); /* (a finished week's champions are paid before your record is read) */ if (p.fresh) await saveProg(s.wallet, p); return json(200, { ok: true, prog: pub(p) }); }

  // ---------------- solo: the game runs in the browser; a finished game counts here ----------------
  async function soloStart(b) {
    const s = signer(b); if (s.err) return s.err; const runId = rid();
    const rule = b.rule && String(b.rule) === ruleOf(seoulDay(now())).id ? String(b.rule) : ""; // (b-pky3: today's rule, or none)
    await setDoc(`worldPokerRun/${s.wallet}`, { runId, startedAt: now(), lvl: Math.max(0, Math.min(3, Math.floor(Number(b.lvl) || 0))), rule, tut: !!b.tut });
    return json(200, { runId });
  }
  async function soloEnd(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now(), run = await one(`worldPokerRun/${w}`);
    if (!run || run.runId !== String(b.runId || "") || t - run.startedAt > RUN_TTL) return json(409, { error: "that game isn't active" });
    const hands = Math.floor(Number(b.hands) || 0);
    if (hands < 1 || hands > 40) return json(400, { error: "bad numbers" });
    if (t - run.startedAt < Math.max(20e3, hands * 5e3)) return json(400, { error: "faster than it can be played" });
    if (!(await commit([{ create: `worldPokerEnd/${run.runId}`, data: { at: t, wallet: w, hands } }])).ok) return json(409, { error: "that game has ended" });
    const p = await prog(w), xp = addXp(p, POKER.XP_GAME);
    p.games = (p.games || 0) + 1; if (b.won === true) p.wins = (p.wins || 0) + 1;
    const bc = Math.max(-1, Math.min(9, Math.floor(Number(b.best)))); if (Number.isFinite(bc) && bc > (p.best != null ? p.best : -1)) p.best = bc;
    p.mis.solo = (p.mis.solo || 0) + mult();
    // b-pky3: the game's counts (the browser's; none can be more than the hands played) into your record, and its badges
    const had = badgesOf(p.st), g = b.st && typeof b.st === "object" ? b.st : {}, add = {};
    for (const k of STAT_KEYS) add[k] = Math.max(0, Math.min(hands, Math.floor(Number(g[k]) || 0)));
    add.h = hands; add.big = Math.max(0, Math.min(2000, Math.floor(Number(g.big) || 0))); p.st = addStats(p.st, add);
    if (run.tut) p.st.tut = 1;
    let rule = null;
    if (run.rule && run.rule === ruleOf(seoulDay(t)).id) { // the daily rule: a win counts toward Rule Breaker; the day's board keeps the best finish
      const chips = Math.max(0, Math.min(POKER.START * 2 * 6 * 2, Math.floor(Number(b.chips) || 0))); if (b.won === true) p.st.rule = (p.st.rule || 0) + 1;
      const k = `worldStats/pokerRule_${seoulDay(t)}`, cur = ((await one(k)) || {}).top || [], nm = await name16(w), old = cur.find((x) => x.id === w);
      if (!old || chips > old.n) { const top = [{ id: w, w: short(w), name: nm, n: chips, won: b.won === true }, ...cur.filter((x) => x.id !== w)].sort((a, b2) => b2.n - a.n).slice(0, TOP_N); await setDoc(k, { top }); }
      rule = { id: run.rule, n: chips };
    }
    for (const id of badgesOf(p.st)) if (!had.includes(id)) say(p, "badge", { id });
    const paid = await mission(w, p, "solo3");
    await saveProg(w, p);
    return json(200, { ok: true, xp, credited: paid, rule, prog: pub(p) });
  }

  // ---------------- the chip shop: ARCL → chips, one way ----------------
  async function buy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, pk = POKER.PACKS.find((x) => x.id === String(b.pack || ""));
    if (!pk) return json(400, { error: "no such pack" });
    if (!deps.debit) return json(503, { error: "the chip shop is closed" });
    const day = seoulDay(now()), dk = `worldPokerBuy/${w}_${day}`, got = ((await one(dk)) || {}).n || 0;
    if (got + pk.arcl > POKER.BUY_DAY) return json(400, { error: "today's chip limit is reached", left: Math.max(0, POKER.BUY_DAY - got) });
    const d = await deps.debit(w, "poker-chips", pk.arcl); if (d.err) return json(400, { error: d.err });
    // the festival's +50% on a wallet's first chip purchase (once: a create-only marker)
    await festNow().catch(() => {});
    const bonus = festC.on && (await commit([{ create: `worldPokerFirst/${w}`, data: { at: now(), pack: pk.id } }])).ok ? Math.floor(pk.chips * F.FIRST) : 0;
    await commit([{ inc: `worldPokerBought/${w}`, fields: { n: pk.chips + bonus } }, { inc: dk, fields: { n: pk.arcl } }, { inc: "worldStats/pokerChips", fields: { arcl: pk.arcl, chips: pk.chips + bonus } }]);
    const p = await prog(w); if (bonus) { p.firstBuy = true; say(p, "first", { c: bonus }); } else if (festC.on) p.firstBuy = true; await saveProg(w, p);
    return json(200, { ok: true, chips: pk.chips + bonus, bonus, prog: pub(p), bal: d.bal, today: got + pk.arcl, cap: POKER.BUY_DAY });
  }

  // ---------------- blackjack: dealt here, against the chips in your record ----------------
  const bjKey = (w) => `worldBjRound/${w}`;
  const roundOf = (R) => (R && R.s ? { ...bjView(R.s), table: R.table || "b1" } : null);
  /// the round and the record saved together, with a create-only version marker (a double tap can't play twice)
  async function bjSave(w, R, p) { const v = (R.v || 0) + 1, { fresh, ...rec } = p; const r = await commit([{ create: `worldBjSeq/${w}_${v}`, data: { at: now() } }, { set: bjKey(w), data: { ...R, v } }, { set: `worldPokerProg/${w}`, data: rec }]); if (r.ok) R.v = v; return r.ok; }
  /// a round over: its hands into your record; the mission's count only at a person's pace (HAND_S between rounds)
  function book(R, p) {
    const s = R.s, t = now(), n = s.hands.length, sd = s.side || {}, net = s.hands.reduce((a, h) => a + h.pay - h.bet, 0) + s.insPay - s.ins + (sd.ppPay || 0) - (sd.pp || 0) + (sd.t3Pay || 0) - (sd.t3 || 0);
    p.bjHands = (p.bjHands || 0) + n; p.bjBJ = (p.bjBJ || 0) + s.hands.filter((h) => h.res === "blackjack").length; if (net > (p.bjBest || 0)) p.bjBest = net;
    if (t - (R.counted || 0) >= BJ.HAND_S * 1000) { R.counted = t; p.mis.bj = (p.mis.bj || 0) + n * mult(); p.mis.played = (p.mis.played || 0) + n; addXp(p, n * BJ.XP_HAND); }
    // the festival: three rounds in a row with a blackjack pay chips (after the round is saved)
    R.bjRun = s.hands.some((h) => h.res === "blackjack") ? (R.bjRun || 0) + 1 : 0;
    if (festC.on && R.bjRun >= 3) { R.bjRun = 0; R.bonus = F.BJ3; say(p, "bj3", { c: F.BJ3 }); }
  }
  async function bjState(b) { const s = signer(b); if (s.err) return s.err; const w = s.wallet, [R, p] = await Promise.all([one(bjKey(w)), prog(w)]); if (p.fresh) await saveProg(w, p); return json(200, { ok: true, round: R && R.s && R.s.phase !== "done" ? roundOf(R) : null, prog: pub(p) }, "no-store"); }
  /// one change to the round: load the round and the record, change, save both (a clash: try again, up to 3 times)
  async function bjMove(b, fn) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    for (let k = 0; k < 3; k++) {
      const [R0, p] = await Promise.all([one(bjKey(w)), prog(w)]), R = R0 || { v: 0 };
      const err = fn(R, p); if (err) return err;
      R.bonus = 0; if (R.s.phase === "done") { book(R, p); await stamp(w, p).catch(() => {}); }
      if (await bjSave(w, R, p)) {
        if (R.bonus) await addChips(w, R.bonus).catch(() => {});
        const paid = R.s.phase === "done" ? await mission(w, p, "bj30") : 0;
        return json(200, { ok: true, round: roundOf(R), prog: pub(R.bonus ? await prog(w) : p), credited: paid });
      }
    }
    return json(409, { error: "one moment" });
  }
  const bjDeal = (b) => bjMove(b, (R, p) => {
    if (R.s && R.s.phase !== "done") return json(409, { error: "finish the round first", round: roundOf(R) });
    const tb = tableOf(String(b.table || "")), side = b.side && typeof b.side === "object" ? { pp: b.side.pp, t3: b.side.t3 } : null, s = bjDealE(R.s, { bank: p.chips || 0, bet: b.bet, seed: randInt(), table: tb.id, side }); // (b-pky3: the side bets)
    if (!s) return json(400, { error: (p.chips || 0) < Math.floor(Number(b.bet) || 0) ? "not enough chips" : "that bet isn't allowed at this table" });
    R.s = s; R.table = tb.id; R.at = now(); p.chips = s.bank; return null;
  });
  const bjAct = (b) => bjMove(b, (R, p) => { if (!R.s || R.s.phase !== "play") return json(409, { error: "no hand to play" }); if (!bjActE(R.s, String(b.a || ""))) return json(400, { error: "that move isn't allowed" }); p.chips = R.s.bank; return null; });
  const bjIns = (b) => bjMove(b, (R, p) => { if (!R.s || R.s.phase !== "ins") return json(409, { error: "no insurance to answer" }); if (!bjInsE(R.s, !!b.take)) return json(400, { error: "not enough chips" }); p.chips = R.s.bank; return null; });

  // ---------------- the tables ----------------
  const roomKey = (id) => `worldPokerRoom/${id}`;
  async function listRooms(update) {
    const k = "worldStats/pokerRooms", cur = ((await one(k)) || {}).list || [], t = now();
    let list = cur.filter((x) => t - x.at < 10 * 60e3);
    if (update) { list = list.filter((x) => x.id !== update.id); if (update.n > 0 && !update.priv) list.unshift(update); }
    list = list.slice(0, 40); await setDoc(k, { list }); return list;
  }
  const humans = (R) => R.seats.filter((x) => x && !x.bot).length;
  const roomRow = (R) => ({ id: R.id, stake: R.stake, n: R.seats.filter(Boolean).length, h: humans(R), priv: !!(R.priv || R.tour), at: now(), playing: !!(R.hand && R.hand.street < 4) });
  /// save the next version: the room and its create-only version marker in one write
  async function save(R) { const v = (R.v || 0) + 1; const r = await commit([{ create: `worldPokerSeq/${R.id}_${v}`, data: { at: now() } }, { set: roomKey(R.id), data: { ...R, v } }]); if (r.ok) R.v = v; return r.ok; }
  /// load, change, save; a clash with another request reloads and tries again (up to 4 times)
  async function mutate(id, fn) {
    for (let k = 0; k < 4; k++) {
      const R = await one(roomKey(id)); if (!R) return { err: json(404, { error: "no such table" }) };
      const res = await fn(R); if (res && res.err) return res;
      if (res && res.same) return { R };
      if (await save(R)) return { R, res };
    }
    return { err: json(409, { error: "the table is busy — try again" }) };
  }
  const seatOf = (R, w) => R.seats.findIndex((x) => x && x.w === w);

  /// the table moves on by itself: a hand's result shown for a moment, then the stacks back to the seats, leavers paid
  /// out, the next hand dealt; a seat that runs out of time checks or folds; computer seats act after a short think
  /// rush: no one is left to watch (the last person stood up mid-hand): the computers finish the hand at once
  async function step(R, rush = false) {
    const t = now(); let changed = false;
    for (let guard = 0; guard < (rush ? 400 : 24); guard++) {
      const H = R.hand;
      if (H && H.street < 4) {
        const si = H.seatOf[H.toAct], seat = R.seats[si];
        if (!seat) { act(H, H.toAct, { t: "fold" }); changed = true; continue; }
        if (seat.bot) { if (!rush && t - (R.lastAct || 0) < BOT_MS) break; const m = botMove(H, rng(H.seed ^ (H.log.length * 7919))); if (!act(H, H.toAct, m || { t: "fold" })) act(H, H.toAct, { t: "fold" }); R.lastAct = Math.max((R.lastAct || 0) + BOT_MS, t - BOT_MS * 3); // (a long gap between looks: the computers catch up, one think each)
         R.deadline = t + POKER.TURN_S * 1000; changed = true; continue; }
        if (seat.leaving || t > (R.deadline || 0) || (R.tour && seat.miss >= 2)) { const L = legal(H); act(H, H.toAct, L && L.check ? { t: "check" } : { t: "fold" }); if (!seat.leaving) seat.miss = (seat.miss || 0) + 1; R.lastAct = t; R.deadline = t + POKER.TURN_S * 1000; changed = true; continue; }
        break;
      }
      if (H && H.street >= 4 && !H.paid) { await payHand(R); changed = true; }
      if (H && H.street >= 4 && !rush && t - (H.endAt || t) < SHOW_MS) break;
      // between hands: the away and the broke stand up; then the next hand if two can play
      if (R.tour) { if (R.tour.done) break; if (sngBust(R)) changed = true; }
      else for (let i = 0; i < R.seats.length; i++) { const x = R.seats[i]; if (!x) continue; if (x.leaving || (!x.bot && t - (x.last || 0) > AWAY_KICK) || x.stack <= 0) { await standUp(R, i); changed = true; } }
      const ready = R.seats.map((x, i) => (x && x.stack > 0 && (R.tour || !(x.miss >= 2)) ? i : -1)).filter((i) => i >= 0);
      if (R.tour && (ready.length < 2 || !R.seats.some((x) => x && !x.bot && x.stack > 0))) { await sngEnd(R); changed = true; break; } // (the last one standing, or only computers left: they're ranked by their stacks)
      if (ready.length < 2 || !humans(R)) { if (R.hand) { R.hand = null; changed = true; } break; }
      R.button = nextSeat(R, R.button == null ? -1 : R.button, ready);
      const players = ready.map((i) => ({ id: R.seats[i].w || "bot" + i, name: R.seats[i].name, stack: R.seats[i].stack, bot: !!R.seats[i].bot, lvl: R.seats[i].lvl || 0 })), st = R.tour ? (([sb, bb]) => ({ sb, bb }))(sngBlinds((R.handNo || 0) + 1)) : stakeOf(R.stake);
      if (R.tour) R.tour.pre = Object.fromEntries(ready.map((i) => [i, R.seats[i].stack])); // (who had more going in: two out in one hand are placed by it)
      const hand = newHand({ players, button: ready.indexOf(R.button), sb: st.sb, bb: st.bb, seed: randInt(), handNo: (R.handNo || 0) + 1 });
      hand.seatOf = ready; R.handNo = hand.handNo; R.hand = hand; R.deadline = t + POKER.TURN_S * 1000; R.lastAct = t; changed = true;
      if (hand.street >= 4) { hand.endAt = t; }
    }
    return changed;
  }
  function nextSeat(R, from, ready) { for (let k = 1; k <= R.seats.length; k++) { const j = (from + k) % R.seats.length; if (ready.includes(j)) return j; } return ready[0]; }
  /// a finished hand: stacks back to the seats, each person's hands and missions counted, the week's board
  async function payHand(R) {
    const H = R.hand; H.paid = true; H.endAt = now();
    H.p.forEach((p, k) => { const x = R.seats[H.seatOf[k]]; if (x) x.stack = p.stack; });
    R.last = { handNo: H.handNo, board: H.board, result: H.result, log: H.log, names: H.p.map((p) => p.name), seatOf: H.seatOf, shown: H.result ? H.result.shown : [] };
    for (let k = 0; k < H.p.length; k++) {
      const x = R.seats[H.seatOf[k]]; if (!x || x.bot || !x.w) continue;
      try {
        const p = await prog(x.w); p.hands = (p.hands || 0) + 1; p.mis.hands = (p.mis.hands || 0) + mult(); p.mis.played = (p.mis.played || 0) + 1;
        if (p.hands % POKER.MP_GAME === 0) { addXp(p, POKER.XP_GAME); p.games = (p.games || 0) + 1; }
        const sh = H.result && H.result.shown.find((y) => y.i === k); if (sh && sh.cat > (p.best != null ? p.best : -1) && H.result.pots.some((pt) => pt.win.includes(k))) p.best = sh.cat;
        if (!R.tour) { const had = badgesOf(p.st); p.st = addStats(p.st, handStats(H, k)); for (const id of badgesOf(p.st)) if (!had.includes(id)) say(p, "badge", { id }); } // (b-pky3: your counts and badges; a Sit & Go's chips aren't yours)
        if (p.mis.hands >= POKER.MISSIONS.hands20.need) { const got = (await mission(x.w, p, "hands20")) || 0; if (got) x.paid = got; }
        // the festival: a royal flush shown at a table pays chips, a title and a line in everyone's feed (once a hand)
        if (festC.on && sh && sh.cat === 9 && (await commit([{ create: `worldPokerJack/${R.id}_${H.handNo}_${k}`, data: { at: now() } }])).ok) {
          await addChips(x.w, F.ROYAL); say(p, "royal", { c: F.ROYAL });
          await award(x.w, (a) => { a.titles = [...new Set([...(a.titles || []), "ARCIA's Chosen"])]; });
          const cur = (await one("worldStats/drops")) || { list: [] }; await setDoc("worldStats/drops", { list: [{ w: short(x.w), name: x.name, k: "royal", at: now() }, ...(cur.list || [])].slice(0, 20) });
        }
        await stamp(x.w, p).catch(() => {});
        await saveProg(x.w, p); x.news = (p.news || []).slice(-4);
        const net = (H.result && H.result.net[k]) || 0; if (net && !R.tour) await board(x.w, x.name, net); // (tournament chips aren't yours: not on the week's board)
      } catch { /* the hand still counts on the table */ }
    }
  }
  async function standUp(R, i) {
    const x = R.seats[i]; R.seats[i] = null;
    if (x && !x.bot && x.w && x.stack > 0) { const p = await prog(x.w); p.chips = (p.chips || 0) + x.stack; await saveProg(x.w, p); }
  }
  async function board(w, name, net) {
    const wk = week(), mk = `worldPokerWeek/${wk}_${w}`; await commit([{ inc: mk, fields: { n: net } }]);
    const [mine, cur] = await Promise.all([one(mk), one(`worldStats/pokerWeek_${wk}`)]), n = (mine && mine.n) || net;
    const top = [{ w: short(w), id: w, n, name: String(name || "").slice(0, 16) }, ...(((cur && cur.top) || []).filter((x) => x.id !== w))].sort((a, b) => b.n - a.n).slice(0, TOP_N);
    await setDoc(`worldStats/pokerWeek_${wk}`, { top });
    // b-pky3: your crew's week (the sum of its members' table chips won and lost)
    const c = deps.crewOf ? await deps.crewOf(w).catch(() => null) : null; if (!c || !c.id || c.closed) return;
    const ck = `worldPokerCrewWeek/${wk}_${c.id}`; await commit([{ inc: ck, fields: { n: net } }]);
    const [cm, cc] = await Promise.all([one(ck), one(`worldStats/pokerCrewWeek_${wk}`)]);
    const ctop = [{ id: c.id, tag: c.tag || "", name: String(c.name || "").slice(0, 20), n: (cm && cm.n) || net }, ...(((cc && cc.top) || []).filter((x) => x.id !== c.id))].sort((a, b) => b.n - a.n).slice(0, TOP_N);
    await setDoc(`worldStats/pokerCrewWeek_${wk}`, { top: ctop });
  }
  /// a person's view of the table
  function view(R, w) {
    const me = w ? seatOf(R, w) : -1, H = R.hand, hi = H && me >= 0 ? H.seatOf.indexOf(me) : -1;
    return { id: R.id, code: R.priv ? R.code : "", priv: !!R.priv, crew: R.crew ? R.crew.tag || "crew" : "", stake: R.stake, v: R.v, me, deadline: R.deadline || 0, now: now(),
      seats: R.seats.map((x) => (x ? { name: x.name, stack: x.stack, bot: !!x.bot, lvl: x.lvl || 0, ch: x.ch || "", tn: x.tn || 0, away: !x.bot && now() - (x.last || 0) > POKER.AWAY_S * 1000, sit: (x.miss || 0) >= 2 } : null)),
      tour: R.tour ? (() => { const T0 = R.tour, [sb, bb] = sngBlinds((R.handNo || 0) + (H && H.street < 4 ? 0 : 1)), lv = Math.min(SNG.BLINDS.length - 1, Math.floor(Math.max(0, (R.handNo || 1) - 1) / SNG.LV_HANDS));
        const mine = w && T0.places ? T0.places.findIndex((y) => y.w === short(w)) : w ? (() => { const j = T0.out.findIndex((y) => y.id === w); return j >= 0 ? T0.n - j - 1 : -1; })() : -1;
        return { id: String(T0.id), lv: lv + 1, sb, bb, next: SNG.LV_HANDS - (Math.max(0, (R.handNo || 1) - 1) % SNG.LV_HANDS), left: R.seats.filter((x) => x && x.stack > 0).length, n: T0.n, pool: T0.pool, pay: T0.pay, done: !!T0.done, places: T0.places || null, mine }; })() : null,
      watch: R.watchN || 0,
      hand: H ? { ...viewOf(H, hi), seatOf: H.seatOf, mine: hi } : null, last: R.last || null, chat: (R.chat || []).slice(-20), paid: me >= 0 && R.seats[me] ? R.seats[me].paid || 0 : 0, news: me >= 0 && R.seats[me] ? R.seats[me].news || [] : [] };
  }
  const name16 = async (w) => (((await one(`worldSave/${w}`)) || {}).name || short(w)).slice(0, 16);

  async function create(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, st = stakeOf(String(b.stake || "")), p = await prog(w);
    if ((p.chips || 0) < st.buy) return json(400, { error: "not enough chips for this table", chips: p.chips });
    const cr = b.crew ? (deps.crewOf ? await deps.crewOf(w).catch(() => null) : null) : null; if (b.crew && (!cr || !cr.id || cr.closed)) return json(400, { error: "you're not in a crew" });
    const priv = !!(b.priv || cr), id = rid(), code = priv ? String(randInt() >>> 0).slice(-6).padStart(6, "0") : "";
    const R = { id, code, priv, stake: st.id, seats: Array(POKER.MAX).fill(null), hand: null, handNo: 0, button: null, v: 0, chat: [], made: now(), ...(cr ? { crew: { id: cr.id, tag: cr.tag || "" } } : {}) };
    p.chips -= st.buy; R.seats[0] = { w, name: await name16(w), stack: st.buy, last: now(), ...lookOf(b) };
    await saveProg(w, p); await save(R);
    if (R.priv) await setDoc(`worldPokerCode/${code}`, { id, at: now() });
    if (cr) { const k = `worldPokerCrewRooms/${cr.id}`, cur = ((await one(k)) || {}).list || []; await setDoc(k, { list: [{ id, stake: st.id, at: now() }, ...cur.filter((x) => now() - x.at < 6 * 3600e3)].slice(0, 12) }); }
    await listRooms(roomRow(R)).catch(() => {});
    return json(200, { ok: true, room: view(R, w) });
  }
  async function join(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    let id = String(b.room || ""); if (!id && b.code) { const c = await one(`worldPokerCode/${String(b.code).replace(/\D/g, "").slice(0, 6)}`); if (!c) return json(404, { error: "no table with that code" }); id = c.id; }
    const nm = await name16(w), myCrew = deps.crewOf ? await deps.crewOf(w).catch(() => null) : null;
    const r = await mutate(id, async (R) => {
      if (R.crew && seatOf(R, w) < 0 && !(myCrew && myCrew.id === R.crew.id)) return { err: json(403, { error: "this is a crew table" }) }; // (b-pky3)
      if (seatOf(R, w) >= 0) { Object.assign(R.seats[seatOf(R, w)], { last: now(), leaving: false, miss: 0 }, b.ch ? lookOf(b) : {}); return { ok: true }; }
      if (R.tour) return { err: json(409, { error: "this Sit & Go has started" }) };
      const free = R.seats.findIndex((x) => !x); if (free < 0) return { err: json(409, { error: "the table is full" }) };
      const st = stakeOf(R.stake), p = await prog(w); if ((p.chips || 0) < st.buy) return { err: json(400, { error: "not enough chips for this table", chips: p.chips }) };
      p.chips -= st.buy; await saveProg(w, p); R.seats[free] = { w, name: nm, stack: st.buy, last: now(), ...lookOf(b) }; return { ok: true };
    });
    if (r.err) return r.err;
    await listRooms(roomRow(r.R)).catch(() => {});
    return json(200, { ok: true, room: view(r.R, w) });
  }
  async function leave(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    const r = await mutate(String(b.room || ""), async (R) => {
      const i = seatOf(R, w); if (i < 0) return { same: true };
      const H = R.hand, k = H && H.street < 4 ? H.seatOf.indexOf(i) : -1;
      if (k >= 0 && !H.p[k].folded) { if (H.toAct === k) act(H, k, { t: "fold" }); else H.p[k].folded = true; R.seats[i].leaving = true; if (H.street < 4 && H.p.filter((p) => !p.folded && !p.out).length === 1) settle(H); return { ok: true }; } // (the last one in wins the pot)
      if (k >= 0) { R.seats[i].leaving = true; return { ok: true }; }
      if (R.tour) { R.seats[i].leaving = true; return { ok: true }; } // (a Sit & Go seat stays: it folds until you come back or the blinds take it)
      await standUp(R, i); return { ok: true };
    });
    if (r.err) return r.err;
    // the last person at the table: the hand finishes now and their stack comes back with them
    if (r.R) { const rush = !r.R.seats.some((x) => x && !x.bot && !x.leaving); await step(r.R, rush).then((ch) => ch && save(r.R)).catch(() => {}); await listRooms(roomRow(r.R)).catch(() => {}); }
    return json(200, { ok: true });
  }
  async function doAct(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    const r = await mutate(String(b.room || ""), async (R) => {
      const i = seatOf(R, w), H = R.hand; if (i < 0 || !H || H.street >= 4) return { err: json(409, { error: "not your turn" }) };
      const k = H.seatOf.indexOf(i); if (k !== H.toAct) return { err: json(409, { error: "not your turn" }) };
      if (!act(H, k, { t: String(b.t || ""), to: Number(b.to) })) return { err: json(400, { error: "that move isn't allowed" }) };
      R.seats[i].last = now(); R.seats[i].miss = 0; R.lastAct = now(); R.deadline = now() + POKER.TURN_S * 1000;
      await step(R); return { ok: true };
    });
    if (r.err) return r.err;
    return json(200, { ok: true, room: view(r.R, w) });
  }
  async function doView(b) {
    let w = ""; if (b.wallet) { const s = signer(b); if (s.err) return s.err; w = s.wallet; }
    const r = await mutate(String(b.room || ""), async (R) => {
      const i = w ? seatOf(R, w) : -1; let touched = false;
      if (i >= 0) { const x = R.seats[i]; if (now() - (x.last || 0) > 10e3 || x.miss) { x.last = now(); if (x.miss >= 2) x.miss = 0; touched = true; } }
      const ch = await step(R);
      return ch || touched ? { ok: true } : { same: true };
    });
    if (r.err) return r.err;
    if (!w || seatOf(r.R, w) < 0) r.R.watchN = await watchers(r.R.id, String(b.vt || "")).catch(() => 0); else r.R.watchN = ((await one(`worldPokerWatch/${r.R.id}`)) || { list: [] }).list.filter((y) => now() - y.at < 30e3).length;
    return json(200, { ok: true, room: view(r.R, w) }, "no-store");
  }
  async function bots(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, n = Math.max(1, Math.min(5, Math.floor(Number(b.n) || 1))), lvl = Math.max(0, Math.min(3, Math.floor(Number(b.lvl) || 1)));
    const r = await mutate(String(b.room || ""), async (R) => {
      if (seatOf(R, w) < 0) return { err: json(403, { error: "sit at the table first" }) };
      if (R.tour) return { err: json(409, { error: "not at a Sit & Go" }) };
      let added = 0; const st = stakeOf(R.stake);
      for (let i = 0; i < R.seats.length && added < n; i++) if (!R.seats[i]) { { const k = (i + added) % BOTS.length; R.seats[i] = { name: BOTS[k], stack: st.buy, bot: true, lvl, ch: BOT_LOOK[k][0], tn: BOT_LOOK[k][1] }; } added++; }
      if (!added) return { same: true };
      await step(R); return { ok: true };
    });
    if (r.err) return r.err;
    await listRooms(roomRow(r.R)).catch(() => {});
    return json(200, { ok: true, room: view(r.R, w) });
  }
  // ---------------- b-pky2: the scheduled Sit & Go ----------------
  const sngKey = (id) => `worldPokerSng/${id}`;
  /// a Sit & Go's record: { id, at, reg: [{ w, name, ch, tn }], room, done, places }; each change writes the next version
  /// with a create-only marker, like a table, so two sign-ups at once can't drop one
  async function sngMutate(id, fn) {
    for (let k = 0; k < 4; k++) {
      const G = (await one(sngKey(id))) || { id, at: Number(id), reg: [], room: "", done: false, v: 0 };
      const res = await fn(G); if (res && res.err) return res; if (res && res.same) return { G };
      const v = (G.v || 0) + 1, r = await commit([{ create: `worldPokerSngSeq/${id}_${v}`, data: { at: now() } }, { set: sngKey(id), data: { ...G, v } }]);
      if (r.ok) { G.v = v; return { G, res }; }
    }
    return { err: json(409, { error: "busy — try again" }) };
  }
  /// between hands: who ran out of chips is out, the smaller stack going in first (their place counted from the bottom)
  function sngBust(R) {
    const T0 = R.tour, pre = T0.pre || {}; const gone = [];
    R.seats.forEach((x, i) => { if (x && x.stack <= 0) gone.push(i); });
    if (!gone.length) return false;
    gone.sort((a, b) => (pre[a] || 0) - (pre[b] || 0));
    for (const i of gone) { const x = R.seats[i]; T0.out.push({ name: x.name, w: x.w ? short(x.w) : "", id: x.w || "", bot: !!x.bot, ch: x.ch || "", tn: x.tn || 0 }); R.seats[i] = null; }
    return true;
  }
  /// the end: places from the top (the last ones standing by their stacks, then the ones out, last out first), the
  /// prizes to the people in the top 3 (each paid once: a create-only marker), XP, the winner's title
  async function sngEnd(R) {
    const T0 = R.tour; if (T0.done) return; T0.done = true; R.hand = null;
    const left = R.seats.map((x, i) => (x ? { x, i } : null)).filter(Boolean).sort((a, b) => b.x.stack - a.x.stack)
      .map(({ x }) => ({ name: x.name, w: x.w ? short(x.w) : "", id: x.w || "", bot: !!x.bot, ch: x.ch || "", tn: x.tn || 0 }));
    const places = [...left, ...T0.out.slice().reverse()]; T0.places = places.map(({ id, ...y }) => y); T0.endAt = now();
    for (let r = 0; r < places.length && r < SNG.PAY.length; r++) {
      const y = places[r]; if (y.bot || !y.id) continue; const prize = T0.pay[r] || 0;
      if (!(await commit([{ create: `worldPokerSngPay/${T0.id}_${y.id}`, data: { at: now(), r: r + 1, prize } }])).ok) continue;
      try {
        if (prize) await addChips(y.id, prize);
        const p = await prog(y.id); const xp = addXp(p, SNG.XP[r] || 0); p.sngWins = (p.sngWins || 0) + (r === 0 ? 1 : 0); p.sngTop3 = (p.sngTop3 || 0) + 1;
        say(p, "sng", { r: r + 1, c: prize, xp }); await saveProg(y.id, p);
        if (r === 0) await award(y.id, (a) => { a.titles = [...new Set([...(a.titles || []), SNG.TITLE])]; });
      } catch { /* the place stands; the record catches up next time */ }
    }
    await sngMutate(String(T0.id), (G) => { G.done = true; G.places = T0.places; return { ok: true }; }).catch(() => {});
  }
  /// a Sit & Go whose time has come: the people signed up sit down with the tournament chips, the computers fill the rest
  async function sngStart(id) {
    const G = await one(sngKey(id)); if (!G || G.room || G.done || now() < G.at) return G;
    const reg = (G.reg || []).slice(0, SNG.SEATS);
    if (!reg.length) { const r = await sngMutate(id, (g) => { if (g.room || g.done) return { same: true }; g.done = true; g.places = []; return { ok: true }; }); return r.G || G; }
    const rid0 = `sng${id}`, { pool, pay } = sngPrizes(reg.length);
    const seats = Array(POKER.MAX).fill(null); reg.forEach((y, i) => { seats[i] = { w: y.w, name: y.name, stack: SNG.START, last: 0, ch: y.ch || "", tn: y.tn || 0 }; });
    for (let i = reg.length, k = 0; i < SNG.SEATS; i++, k++) seats[i] = { name: BOTS[k % BOTS.length], stack: SNG.START, bot: true, lvl: SNG.BOT_LVL, ch: BOT_LOOK[k % BOTS.length][0], tn: BOT_LOOK[k % BOTS.length][1] };
    const R = { id: rid0, code: "", priv: false, stake: "s1", seats, hand: null, handNo: 0, button: null, v: 0, chat: [], made: now(),
      tour: { id, at: G.at, n: reg.length + (SNG.SEATS - reg.length), humans: reg.length, pool, pay, out: [], pre: {}, done: false } };
    await save(R); // (the room's first version marker is create-only: of two starts at once, one table)
    await sngMutate(id, (g) => { if (g.room) return { same: true }; g.room = rid0; return { ok: true }; });
    return { ...G, room: rid0 };
  }
  const sngIdle = (R) => !!(R.tour && !R.tour.done && R.seats.every((x) => !x || x.bot || x.stack <= 0 || x.leaving || x.miss >= 2));
  const sngPub = (G, w) => { const reg = G.reg || [], room = G.room || "", { pool, pay } = sngPrizes(Math.max(1, reg.length));
    return { id: String(G.id), at: G.at, n: reg.length, max: SNG.SEATS, names: reg.map((y) => y.name), entry: SNG.ENTRY, pool, pay, room, done: !!G.done, places: G.places || null, mine: !!(w && reg.some((y) => y.w === w)), state: G.done ? "done" : room ? "play" : "reg" }; };
  /// the lobby's Sit & Go card: the one playing or just finished (if any), and the next two
  async function sngList(b) {
    let w = ""; if (b.wallet) { const s = signer(b); if (s.err) return s.err; w = s.wallet; }
    const t = now(), prev = sngAt(t, -1), ids = [prev, sngAt(t, 0), sngAt(t, 1)].map(String);
    let d = await getDocs(ids.map(sngKey));
    if (d[sngKey(ids[0])] && !d[sngKey(ids[0])].room && !d[sngKey(ids[0])].done) { await sngStart(ids[0]).catch(() => {}); d = await getDocs(ids.map(sngKey)); }
    // a Sit & Go table moves when someone looks: the lobby's look moves it too (and when no one in it is still playing,
    // the computers finish it at once), so the places are paid even if everyone left
    for (const id of ids.slice(0, 2)) { const g = d[sngKey(id)]; if (g && g.room && !g.done) await mutate(g.room, async (R) => ((await step(R, sngIdle(R))) ? { ok: true } : { same: true })).catch(() => {}); }
    const list = ids.map((id) => sngPub(d[sngKey(id)] || { id, at: Number(id), reg: [] }, w)).filter((g, i) => i > 0 || (g.n && (g.state !== "done" || t - g.at < SNG.KEEP)));
    let chips = null; if (w) chips = (await prog(w)).chips;
    return json(200, { ok: true, now: t, list, chips, rules: { entry: SNG.ENTRY, house: SNG.HOUSE, start: SNG.START, lvHands: SNG.LV_HANDS, pay: SNG.PAY, xp: SNG.XP } }, "no-store");
  }
  async function sngReg(b, on) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, id = String(b.id || ""), t = now();
    if (!/^\d{10,15}$/.test(id) || Number(id) % SNG.EVERY) return json(400, { error: "no such Sit & Go" });
    if (Number(id) <= t) return json(409, { error: "this Sit & Go has started" });
    if (Number(id) > sngAt(t, 1)) return json(400, { error: "sign-up isn't open yet" });
    const p = await prog(w); if (on && (p.chips || 0) < SNG.ENTRY) return json(400, { error: "not enough chips for the entry", chips: p.chips });
    const nm = await name16(w), look = lookOf(b);
    const r = await sngMutate(id, (G) => {
      const has = (G.reg || []).some((y) => y.w === w);
      if (on) { if (has) return { same: true }; if ((G.reg || []).length >= SNG.SEATS) return { err: json(409, { error: "this Sit & Go is full" }) }; G.reg = [...(G.reg || []), { w, name: nm, ...look }]; return { paid: true }; }
      if (!has) return { same: true }; G.reg = G.reg.filter((y) => y.w !== w); return { back: true };
    });
    if (r.err) return r.err;
    if (r.res && r.res.paid) { p.chips -= SNG.ENTRY; await saveProg(w, p); }
    if (r.res && r.res.back) { p.chips = (p.chips || 0) + SNG.ENTRY; await saveProg(w, p); }
    return json(200, { ok: true, sng: sngPub(r.G, w), chips: p.chips });
  }

  // ---------------- b-pky2: who's walking the lounge, and their emotes ----------------
  const HERE = { LIFE: 20e3, MAX: 12, R: 30, EMO: new Set(["wave", "cheer", "lol", "heart", "gg", "dance"]) };
  async function here(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now();
    const x = Math.round(Number(b.x) * 10) / 10, z = Math.round(Number(b.z) * 10) / 10; if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > HERE.R) return json(400, { error: "where?" });
    const k = "worldStats/pokerHere", cur = ((await one(k)) || {}).list || [], id = short(w), old = cur.find((y) => y.id === id) || {};
    const em = HERE.EMO.has(String(b.em || "")) ? String(b.em) : "";
    const e = { id, n: await name16(w), ...lookOf(b), x, z, f: Math.round((Number(b.f) || 0) * 100) / 100, at: t, ...(em ? { em, ea: t } : old.ea && t - old.ea < 4000 ? { em: old.em, ea: old.ea } : {}) };
    const list = [e, ...cur.filter((y) => y.id !== id && t - y.at < HERE.LIFE)].slice(0, HERE.MAX); await setDoc(k, { list });
    return json(200, { ok: true, list: list.filter((y) => y.id !== id).map(({ at, ea, ...y }) => ({ ...y, ago: t - at, ...(ea ? { ea: t - ea } : {}) })), now: t }, "no-store");
  }
  // ---------------- b-pky3: looks for chips, crew tables, the daily rule ----------------
  /// a card back or a felt bought with chips (POKER.SHOP): once (a create-only marker), never back into chips
  async function lookBuy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, it = POKER.SHOP.find((x) => x.id === String(b.id || ""));
    if (!it) return json(400, { error: "no such look" });
    const p = await prog(w); if (((p.award && p.award.unlocks) || []).includes(it.id)) return json(409, { error: "you have it already" });
    if ((p.chips || 0) < it.chips) return json(400, { error: "not enough chips" });
    if (!(await commit([{ create: `worldPokerLook/${w}_${it.id.replace(":", "_")}`, data: { at: now(), chips: it.chips } }])).ok) return json(409, { error: "you have it already" });
    p.chips -= it.chips; await saveProg(w, p);
    await award(w, (a) => { a.unlocks = [...new Set([...(a.unlocks || []), it.id])]; });
    return json(200, { ok: true, prog: pub(await prog(w)) });
  }
  /// your crew's open tables and the crews' week board
  async function crewTables(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, wk = week();
    const c = deps.crewOf ? await deps.crewOf(w).catch(() => null) : null, board = (((await one(`worldStats/pokerCrewWeek_${wk}`)) || {}).top || []).map(({ tag, name, n, id }) => ({ tag, name, n, mine: !!(c && c.id === id) }));
    if (!c || !c.id || c.closed) return json(200, { ok: true, crew: null, rooms: [], board }, "no-store");
    const list = ((await one(`worldPokerCrewRooms/${c.id}`)) || {}).list || [], docs = list.length ? await getDocs(list.map((x) => roomKey(x.id))) : {};
    const rooms = list.map((x) => docs[roomKey(x.id)]).filter((R) => R && R.seats.some((y) => y && !y.bot)).map((R) => ({ id: R.id, stake: R.stake, n: R.seats.filter(Boolean).length, h: humans(R), names: R.seats.filter((y) => y && !y.bot).map((y) => y.name).slice(0, 6) }));
    return json(200, { ok: true, crew: { tag: c.tag || "", name: c.name || "" }, rooms, board }, "no-store");
  }

  // spectators: a watcher's page sends a token now and then; the table shows how many are watching
  async function watchers(id, vt) {
    const k = `worldPokerWatch/${id}`, t = now(), cur = ((await one(k)) || {}).list || [];
    let list = cur.filter((y) => t - y.at < 30e3);
    if (vt && /^[a-z0-9]{6,16}$/.test(vt)) { const old = list.find((y) => y.t === vt); if (!old || t - old.at > 10e3) { list = [{ t: vt, at: t }, ...list.filter((y) => y.t !== vt)].slice(0, 50); await setDoc(k, { list }); } }
    return list.length;
  }

  const EMOTES = new Set([":gg:", ":nice:", ":wow:", ":lol:", ":gl:", ":heart:"]);
  async function chat(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    const text = String(b.text || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 60); if (!text) return json(400, { error: "empty" });
    const r = await mutate(String(b.room || ""), async (R) => {
      const i = seatOf(R, w); if (i < 0) return { err: json(403, { error: "sit at the table first" }) };
      R.chat = [...(R.chat || []), { n: R.seats[i].name, t: text, e: EMOTES.has(text), at: now() }].slice(-20); return { ok: true };
    });
    if (r.err) return r.err;
    return json(200, { ok: true, room: view(r.R, w) });
  }

  return {
    async read(v) {
      if (v === "poker-rooms") { const list = ((await one("worldStats/pokerRooms")) || {}).list || [], t = now(); return json(200, { rooms: list.filter((x) => t - x.at < 10 * 60e3 && !x.priv).map(({ id, stake, n, h, playing }) => ({ id, stake, n, h, playing })) }, "public, max-age=5"); }
      if (v === "poker-rule") { const day = seoulDay(now()); return json(200, { day, rule: ruleOf(day), top: (((await one(`worldStats/pokerRule_${day}`)) || {}).top || []).map(({ w, name, n, won }) => ({ w, name, n, won })) }, "public, max-age=30"); }
      if (v === "poker-fest") { await festNow(); return json(200, { fest: festC.on ? { day: festC.day, days: festC.days, end: festC.end, happy: festC.happy } : null, now: now() }, "public, max-age=60"); }
      if (v === "poker-top") { await festNow().catch(() => {}); await champions().catch(() => {}); const wk = week(), d = await one(`worldStats/pokerWeek_${wk}`); return json(200, { week: wk, top: ((d && d.top) || []).map(({ w, name, n }) => ({ w, name, n })) }, "public, max-age=30"); }
      return null;
    },
    async handle(b) {
      switch (b.action) {
        case "world-poker-me": return me(b);
        case "world-poker-buy": return buy(b);
        case "world-bj-state": return bjState(b);
        case "world-bj-deal": return bjDeal(b);
        case "world-bj-act": return bjAct(b);
        case "world-bj-ins": return bjIns(b);
        case "world-poker-solo-start": return soloStart(b);
        case "world-poker-solo-end": return soloEnd(b);
        case "world-poker-create": return create(b);
        case "world-poker-join": return join(b);
        case "world-poker-leave": return leave(b);
        case "world-poker-act": return doAct(b);
        case "world-poker-view": return doView(b);
        case "world-poker-bots": return bots(b);
        case "world-poker-chat": return chat(b);
        case "world-poker-sng": return sngList(b);
        case "world-poker-sng-reg": return sngReg(b, true);
        case "world-poker-sng-unreg": return sngReg(b, false);
        case "world-poker-here": return here(b);
        case "world-poker-look-buy": return lookBuy(b);
        case "world-poker-crew": return crewTables(b);
        default: return null;
      }
    },
  };
}
