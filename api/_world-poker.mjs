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
import { POKER, newHand, act, botMove, viewOf, legal, rng, settle } from "./_world-poker-engine.mjs";
import { BJ, deal as bjDealE, act as bjActE, insure as bjInsE, viewOf as bjView, tableOf } from "./_world-blackjack-engine.mjs";

const RUN_TTL = 3 * 3600e3, SHOW_MS = 4500, BOT_MS = 900, AWAY_KICK = 5 * 60e3, TOP_N = 20;
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const BOTS = ["AI ARON", "AI LUMI", "AI NEX", "AI ARC", "AI MINT"];
// the hero a seat is drawn as at the table (world-poker.js seats them in 3D): the player's own (ch, tn: their colour), a
// computer player's from its name. Only a shape is checked; the page draws anything it doesn't know as the default hero
const lookOf = (b) => ({ ch: /^custom-[a-z]{2,10}$/.test(String((b && b.ch) || "")) ? String(b.ch) : "", tn: Math.max(0, Math.min(7, Number(b && b.tn) | 0)) });
const BOT_LOOK = [["custom-aron", 0], ["custom-lumi", 0], ["custom-nex", 0], ["custom-aron", 3], ["custom-lumi", 1]];
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
    fest: festC.on ? { day: festC.day, days: festC.days, end: festC.end, happy: festC.happy, stamps: p.fest && p.fest.day0 === festC.day0 ? p.fest.stamps : [], first: !p.firstBuy, played: p.mis.played || 0 } : null, xpToday: p.xpToday || 0, xpCap: POKER.XP_DAY });
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
    await setDoc(`worldPokerRun/${s.wallet}`, { runId, startedAt: now(), lvl: Math.max(0, Math.min(3, Math.floor(Number(b.lvl) || 0))) });
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
    const paid = await mission(w, p, "solo3");
    await saveProg(w, p);
    return json(200, { ok: true, xp, credited: paid, prog: pub(p) });
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
    const s = R.s, t = now(), n = s.hands.length, net = s.hands.reduce((a, h) => a + h.pay - h.bet, 0) + s.insPay - s.ins;
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
    const tb = tableOf(String(b.table || "")), s = bjDealE(R.s, { bank: p.chips || 0, bet: b.bet, seed: randInt(), table: tb.id });
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
  const roomRow = (R) => ({ id: R.id, stake: R.stake, n: R.seats.filter(Boolean).length, h: humans(R), priv: !!R.priv, at: now(), playing: !!(R.hand && R.hand.street < 4) });
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
        if (seat.leaving || t > (R.deadline || 0)) { const L = legal(H); act(H, H.toAct, L && L.check ? { t: "check" } : { t: "fold" }); if (!seat.leaving) seat.miss = (seat.miss || 0) + 1; R.lastAct = t; R.deadline = t + POKER.TURN_S * 1000; changed = true; continue; }
        break;
      }
      if (H && H.street >= 4 && !H.paid) { await payHand(R); changed = true; }
      if (H && H.street >= 4 && !rush && t - (H.endAt || t) < SHOW_MS) break;
      // between hands: the away and the broke stand up; then the next hand if two can play
      for (let i = 0; i < R.seats.length; i++) { const x = R.seats[i]; if (!x) continue; if (x.leaving || (!x.bot && t - (x.last || 0) > AWAY_KICK) || x.stack <= 0) { await standUp(R, i); changed = true; } }
      const ready = R.seats.map((x, i) => (x && x.stack > 0 && !(x.miss >= 2) ? i : -1)).filter((i) => i >= 0);
      if (ready.length < 2 || !humans(R)) { if (R.hand) { R.hand = null; changed = true; } break; }
      R.button = nextSeat(R, R.button == null ? -1 : R.button, ready);
      const players = ready.map((i) => ({ id: R.seats[i].w || "bot" + i, name: R.seats[i].name, stack: R.seats[i].stack, bot: !!R.seats[i].bot, lvl: R.seats[i].lvl || 0 })), st = stakeOf(R.stake);
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
        if (p.mis.hands >= POKER.MISSIONS.hands20.need) { const got = (await mission(x.w, p, "hands20")) || 0; if (got) x.paid = got; }
        // the festival: a royal flush shown at a table pays chips, a title and a line in everyone's feed (once a hand)
        if (festC.on && sh && sh.cat === 9 && (await commit([{ create: `worldPokerJack/${R.id}_${H.handNo}_${k}`, data: { at: now() } }])).ok) {
          await addChips(x.w, F.ROYAL); say(p, "royal", { c: F.ROYAL });
          await award(x.w, (a) => { a.titles = [...new Set([...(a.titles || []), "ARCIA's Chosen"])]; });
          const cur = (await one("worldStats/drops")) || { list: [] }; await setDoc("worldStats/drops", { list: [{ w: short(x.w), name: x.name, k: "royal", at: now() }, ...(cur.list || [])].slice(0, 20) });
        }
        await stamp(x.w, p).catch(() => {});
        await saveProg(x.w, p); x.news = (p.news || []).slice(-4);
        const net = (H.result && H.result.net[k]) || 0; if (net) await board(x.w, x.name, net);
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
  }
  /// a person's view of the table
  function view(R, w) {
    const me = w ? seatOf(R, w) : -1, H = R.hand, hi = H && me >= 0 ? H.seatOf.indexOf(me) : -1;
    return { id: R.id, code: R.priv ? R.code : "", priv: !!R.priv, stake: R.stake, v: R.v, me, deadline: R.deadline || 0, now: now(),
      seats: R.seats.map((x) => (x ? { name: x.name, stack: x.stack, bot: !!x.bot, lvl: x.lvl || 0, ch: x.ch || "", tn: x.tn || 0, away: !x.bot && now() - (x.last || 0) > POKER.AWAY_S * 1000, sit: (x.miss || 0) >= 2 } : null)),
      hand: H ? { ...viewOf(H, hi), seatOf: H.seatOf, mine: hi } : null, last: R.last || null, chat: (R.chat || []).slice(-20), paid: me >= 0 && R.seats[me] ? R.seats[me].paid || 0 : 0, news: me >= 0 && R.seats[me] ? R.seats[me].news || [] : [] };
  }
  const name16 = async (w) => (((await one(`worldSave/${w}`)) || {}).name || short(w)).slice(0, 16);

  async function create(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, st = stakeOf(String(b.stake || "")), p = await prog(w);
    if ((p.chips || 0) < st.buy) return json(400, { error: "not enough chips for this table", chips: p.chips });
    const id = rid(), code = b.priv ? String(randInt() >>> 0).slice(-6).padStart(6, "0") : "";
    const R = { id, code, priv: !!b.priv, stake: st.id, seats: Array(POKER.MAX).fill(null), hand: null, handNo: 0, button: null, v: 0, chat: [], made: now() };
    p.chips -= st.buy; R.seats[0] = { w, name: await name16(w), stack: st.buy, last: now(), ...lookOf(b) };
    await saveProg(w, p); await save(R);
    if (R.priv) await setDoc(`worldPokerCode/${code}`, { id, at: now() });
    await listRooms(roomRow(R)).catch(() => {});
    return json(200, { ok: true, room: view(R, w) });
  }
  async function join(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    let id = String(b.room || ""); if (!id && b.code) { const c = await one(`worldPokerCode/${String(b.code).replace(/\D/g, "").slice(0, 6)}`); if (!c) return json(404, { error: "no table with that code" }); id = c.id; }
    const nm = await name16(w);
    const r = await mutate(id, async (R) => {
      if (seatOf(R, w) >= 0) { Object.assign(R.seats[seatOf(R, w)], { last: now() }, b.ch ? lookOf(b) : {}); return { ok: true }; }
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
    return json(200, { ok: true, room: view(r.R, w) }, "no-store");
  }
  async function bots(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, n = Math.max(1, Math.min(5, Math.floor(Number(b.n) || 1))), lvl = Math.max(0, Math.min(3, Math.floor(Number(b.lvl) || 1)));
    const r = await mutate(String(b.room || ""), async (R) => {
      if (seatOf(R, w) < 0) return { err: json(403, { error: "sit at the table first" }) };
      let added = 0; const st = stakeOf(R.stake);
      for (let i = 0; i < R.seats.length && added < n; i++) if (!R.seats[i]) { { const k = (i + added) % BOTS.length; R.seats[i] = { name: BOTS[k], stack: st.buy, bot: true, lvl, ch: BOT_LOOK[k][0], tn: BOT_LOOK[k][1] }; } added++; }
      if (!added) return { same: true };
      await step(R); return { ok: true };
    });
    if (r.err) return r.err;
    await listRooms(roomRow(r.R)).catch(() => {});
    return json(200, { ok: true, room: view(r.R, w) });
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
        default: return null;
      }
    },
  };
}
