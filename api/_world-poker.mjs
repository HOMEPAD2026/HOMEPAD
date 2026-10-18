// api/_world-poker.mjs — ARCIA POKER LOUNGE (world-poker.js): free play chips, the solo game's record, the multiplayer
// tables (dealt, timed and settled here with api/_world-poker-engine.mjs, a copy of the game's world-poker-engine.js),
// and the lounge's two daily missions. Chips are play money: free every day, never bought with ARCL and never turned
// into ARCL. The only ARCL here is the missions', which don't depend on winning (finish 3 solo games · play 20
// multiplayer hands), through the shop's credit (ARCL kind "poker").
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
//   GET  ?world=poker-rooms → the open public tables · ?world=poker-top → the week's most chips won at the tables
//
// A table is one document (worldPokerRoom/<id>) with the hand in it; each change writes the next version together
// with a create-only marker worldPokerSeq/<id>_<v>, so two requests at once can't both move the table.
// A seat's view shows its own cards only (the deck never leaves the server).
// Firestore: worldPokerProg/<w> · worldPokerRun/<w> · worldPokerEnd/<runId> · worldPokerRoom/<id> · worldPokerSeq/…
//            worldPokerPay/<w>_<day>_<mission> · worldPokerWeek/<week>_<w> · worldStats/pokerRooms · worldStats/pokerWeek_<week>
import { POKER, newHand, act, botMove, viewOf, legal, rng, settle } from "./_world-poker-engine.mjs";

const RUN_TTL = 3 * 3600e3, SHOW_MS = 4500, BOT_MS = 900, AWAY_KICK = 5 * 60e3, TOP_N = 20;
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const BOTS = ["AI ARON", "AI LUMI", "AI NEX", "AI ARC", "AI MINT"];
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

  // ---------------- your record: chips, poker XP, the missions ----------------
  async function prog(w) {
    const p = (await one(`worldPokerProg/${w}`)) || { chips: 0, chipDay: "", xp: 0, xpDay: "", xpToday: 0, games: 0, wins: 0, best: -1, hands: 0, mis: {} };
    const day = seoulDay(now());
    if (p.chipDay !== day) { if ((p.chips || 0) < POKER.DAY_CHIPS) p.chips = POKER.DAY_CHIPS; p.chipDay = day; p.fresh = true; } // today's free chips
    if (p.xpDay !== day) { p.xpDay = day; p.xpToday = 0; }
    if (!p.mis || p.mis.day !== day) p.mis = { day, solo: 0, hands: 0 };
    return p;
  }
  const saveProg = (w, p) => { const { fresh, ...rest } = p; return setDoc(`worldPokerProg/${w}`, rest); };
  const pub = (p) => ({ chips: p.chips, xp: p.xp, ...levelOf(p.xp), games: p.games || 0, wins: p.wins || 0, best: p.best != null ? p.best : -1, hands: p.hands || 0, mis: p.mis, xpToday: p.xpToday || 0, xpCap: POKER.XP_DAY });
  function addXp(p, n) { const g = Math.max(0, Math.min(n, POKER.XP_DAY - (p.xpToday || 0))); p.xp = (p.xp || 0) + g; p.xpToday = (p.xpToday || 0) + g; return g; }
  /// a mission reached: paid once that day (a create-only marker), inside the shop's daily cap
  async function mission(w, p, key) {
    const m = POKER.MISSIONS[key], have = key === "solo3" ? p.mis.solo : p.mis.hands;
    if (!m || have < m.need) return 0;
    if (!(await commit([{ create: `worldPokerPay/${w}_${p.mis.day}_${key}`, data: { at: now() } }])).ok) return 0;
    return deps.credit ? deps.credit(w, "poker", m.arcl) : 0;
  }

  async function me(b) { const s = signer(b); if (s.err) return s.err; const p = await prog(s.wallet); if (p.fresh) await saveProg(s.wallet, p); return json(200, { ok: true, prog: pub(p) }); }

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
    p.mis.solo = (p.mis.solo || 0) + 1;
    const paid = await mission(w, p, "solo3");
    await saveProg(w, p);
    return json(200, { ok: true, xp, credited: paid, prog: pub(p) });
  }

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
        const p = await prog(x.w); p.hands = (p.hands || 0) + 1; p.mis.hands = (p.mis.hands || 0) + 1;
        if (p.hands % POKER.MP_GAME === 0) { addXp(p, POKER.XP_GAME); p.games = (p.games || 0) + 1; }
        const sh = H.result && H.result.shown.find((y) => y.i === k); if (sh && sh.cat > (p.best != null ? p.best : -1) && H.result.pots.some((pt) => pt.win.includes(k))) p.best = sh.cat;
        if (p.mis.hands === POKER.MISSIONS.hands20.need) x.paid = (await mission(x.w, p, "hands20")) || 0;
        await saveProg(x.w, p);
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
      seats: R.seats.map((x) => (x ? { name: x.name, stack: x.stack, bot: !!x.bot, lvl: x.lvl || 0, away: !x.bot && now() - (x.last || 0) > POKER.AWAY_S * 1000, sit: (x.miss || 0) >= 2 } : null)),
      hand: H ? { ...viewOf(H, hi), seatOf: H.seatOf, mine: hi } : null, last: R.last || null, chat: (R.chat || []).slice(-20), paid: me >= 0 && R.seats[me] ? R.seats[me].paid || 0 : 0 };
  }
  const name16 = async (w) => (((await one(`worldSave/${w}`)) || {}).name || short(w)).slice(0, 16);

  async function create(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, st = stakeOf(String(b.stake || "")), p = await prog(w);
    if ((p.chips || 0) < st.buy) return json(400, { error: "not enough chips for this table", chips: p.chips });
    const id = rid(), code = b.priv ? String(randInt() >>> 0).slice(-6).padStart(6, "0") : "";
    const R = { id, code, priv: !!b.priv, stake: st.id, seats: Array(POKER.MAX).fill(null), hand: null, handNo: 0, button: null, v: 0, chat: [], made: now() };
    p.chips -= st.buy; R.seats[0] = { w, name: await name16(w), stack: st.buy, last: now() };
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
      if (seatOf(R, w) >= 0) { R.seats[seatOf(R, w)].last = now(); return { ok: true }; }
      const free = R.seats.findIndex((x) => !x); if (free < 0) return { err: json(409, { error: "the table is full" }) };
      const st = stakeOf(R.stake), p = await prog(w); if ((p.chips || 0) < st.buy) return { err: json(400, { error: "not enough chips for this table", chips: p.chips }) };
      p.chips -= st.buy; await saveProg(w, p); R.seats[free] = { w, name: nm, stack: st.buy, last: now() }; return { ok: true };
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
      for (let i = 0; i < R.seats.length && added < n; i++) if (!R.seats[i]) { R.seats[i] = { name: BOTS[(i + added) % BOTS.length], stack: st.buy, bot: true, lvl }; added++; }
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
      if (v === "poker-top") { const wk = week(), d = await one(`worldStats/pokerWeek_${wk}`); return json(200, { week: wk, top: ((d && d.top) || []).map(({ w, name, n }) => ({ w, name, n })) }, "public, max-age=30"); }
      return null;
    },
    async handle(b) {
      switch (b.action) {
        case "world-poker-me": return me(b);
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
