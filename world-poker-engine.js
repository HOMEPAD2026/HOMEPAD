// world-poker-engine.js — ARCIA POKER LOUNGE's rules: no-limit Texas Hold'em for 2–6 players, the hand ranking, side
// pots, and the computer players. Shared word for word with the server (api/_world-poker-engine.mjs is a copy;
// tests/world/poker.test.mjs checks the two are the same): the server deals and settles the multiplayer tables with it,
// and the solo game runs it in the browser. Nothing here draws, and nothing reads the clock: a seeded shuffle makes
// the same deck for the same seed everywhere.
//
// Chips are play money only: they're never bought with ARCL or turned into ARCL (the lounge's ARCL comes from daily
// missions that don't depend on winning — see api/_world-poker.mjs).
//
// A card is 0–51: rank = c % 13 (0 = 2 … 12 = A), suit = ⌊c / 13⌋ (0 ♠ 1 ♥ 2 ♦ 3 ♣).
// A hand (newHand) is a plain object that survives JSON: players [{ id, name, stack, bet, total, hole, folded, allin,
// acted, seen, bot, lvl }], board, deck, street (0 pre-flop · 1 flop · 2 turn · 3 river · 4 over), button, toAct,
// curBet, minRaise, seq (full raises so far, for the re-open rule), log [{ i, t, a, st }], result.
export const POKER = {
  MAX: 6, START: 1500, SOLO_HANDS: 12, TURN_S: 20, AWAY_S: 60,
  STAKES: [{ id: "s1", sb: 10, bb: 20, buy: 2000 }, { id: "s2", sb: 50, bb: 100, buy: 10000 }, { id: "s3", sb: 100, bb: 200, buy: 20000 }, { id: "s4", sb: 500, bb: 1000, buy: 100000 }],
  DAY_CHIPS: 20000, XP_GAME: 50, XP_DAY: 500, MP_GAME: 10, // a multiplayer "game" for XP: 10 hands seated
  MISSIONS: { solo3: { need: 3, arcl: 300 }, hands20: { need: 20, arcl: 300 }, bj30: { need: 30, arcl: 300 } }, // outcome-free daily missions (ARCL: the owner's numbers)
  LEVELS: 100,
};
export const RANKS = "23456789TJQKA", SUITS = "♠♥♦♣";
export const rankOf = (c) => c % 13, suitOf = (c) => Math.floor(c / 13);
export const cardName = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
export function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function shuffled(seed) { const R = rng(seed), d = Array.from({ length: 52 }, (_, i) => i); for (let i = 51; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; } return d; }

// ---------------- the hand ranking ----------------
export const HANDS = ["High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush", "Royal Flush"];
const B = 13;
/// the value of exactly five cards: higher is better; ⌊v / 13^5⌋ is the category (0 high card … 8 straight flush)
export function eval5(cs) {
  const r = cs.map(rankOf).sort((a, b) => b - a), flush = cs.every((c) => suitOf(c) === suitOf(cs[0]));
  const cnt = {}; for (const x of r) cnt[x] = (cnt[x] || 0) + 1;
  const groups = Object.entries(cnt).map(([k, n]) => [n, +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const uniq = [...new Set(r)];
  let straight = -1;
  if (uniq.length === 5) { if (r[0] - r[4] === 4) straight = r[0]; else if (r[0] === 12 && r[1] === 3) straight = 3; } // (the wheel: A-2-3-4-5)
  const code = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * B + (ks[i] || 0); return v; };
  if (straight >= 0 && flush) return code(8, [straight]);
  if (groups[0][0] === 4) return code(7, [groups[0][1], groups[1][1]]);
  if (groups[0][0] === 3 && groups[1][0] === 2) return code(6, [groups[0][1], groups[1][1]]);
  if (flush) return code(5, r);
  if (straight >= 0) return code(4, [straight]);
  if (groups[0][0] === 3) return code(3, [groups[0][1], ...groups.slice(1).map((g) => g[1])]);
  if (groups[0][0] === 2 && groups[1][0] === 2) return code(2, [groups[0][1], groups[1][1], groups[2][1]]);
  if (groups[0][0] === 2) return code(1, [groups[0][1], ...groups.slice(1).map((g) => g[1])]);
  return code(0, r);
}
export const catOf = (v) => Math.floor(v / B ** 5);
/// the best five of up to seven cards: { v, cat, five, name } (a royal flush is the ace-high straight flush)
export function best(cs) {
  let bv = -1, bf = null; const n = cs.length;
  const take = (five) => { const v = eval5(five); if (v > bv) { bv = v; bf = five; } };
  if (n <= 5) take(cs.slice());
  else if (n === 6) for (let a = 0; a < 6; a++) take(cs.filter((_, i) => i !== a));
  else for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) take(cs.filter((_, i) => i !== a && i !== b));
  const cat = catOf(bv), royal = cat === 8 && Math.floor(bv / B ** 4) % B === 12;
  return { v: bv, cat: royal ? 9 : cat, five: bf, name: HANDS[royal ? 9 : cat] };
}

// ---------------- a hand of no-limit hold'em ----------------
const live = (p) => !p.folded && !p.out;
const canAct = (p) => live(p) && !p.allin;
/// a new hand. players: [{ id, name, stack, bot?, lvl?, out? }] (out: sitting out this hand); button: the dealer seat
export function newHand({ players, button, sb, bb, seed, handNo = 0 }) {
  const P = players.map((q) => ({ id: q.id, name: q.name || "", stack: q.stack, bet: 0, total: 0, hole: [], folded: false, allin: false, acted: false, seen: -1, bot: !!q.bot, lvl: q.lvl || 0, out: !!q.out || q.stack <= 0 }));
  const s = { seed, handNo, deck: shuffled(seed), ptr: 0, board: [], street: 0, button, sb, bb, curBet: 0, minRaise: bb, seq: 0, toAct: -1, p: P, log: [], result: null };
  const seats = P.map((p, i) => i).filter((i) => !P[i].out);
  if (seats.length < 2) { s.street = 4; s.result = { pots: [], shown: [], net: P.map(() => 0), uncontested: true }; return s; }
  const nextFrom = (i) => { for (let k = 1; k <= P.length; k++) { const j = (i + k) % P.length; if (!P[j].out) return j; } return i; };
  if (P[button] && P[button].out) s.button = nextFrom(button);
  // the deal: two cards each, starting left of the button
  let i = s.button; for (let r = 0; r < 2; r++) for (let k = 0; k < seats.length; k++) { i = nextFrom(i); P[i].hole.push(s.deck[s.ptr++]); }
  // the blinds (heads-up: the button posts the small blind and acts first before the flop)
  const heads = seats.length === 2, sbI = heads ? s.button : nextFrom(s.button), bbI = nextFrom(sbI);
  post(s, sbI, sb, "sb"); post(s, bbI, bb, "bb");
  s.curBet = Math.max(P[sbI].bet, P[bbI].bet); s.minRaise = bb; s.sbI = sbI; s.bbI = bbI;
  s.toAct = nextActor(s, bbI);
  if (s.toAct < 0) runOut(s);
  return s;
}
function post(s, i, amt, t) { const p = s.p[i], a = Math.min(amt, p.stack); p.stack -= a; p.bet += a; p.total += a; if (p.stack === 0) p.allin = true; s.log.push({ i, t, a, st: s.street }); }
/// who acts after seat i on this street, or -1 when the betting is done
function nextActor(s, i) {
  const P = s.p, n = P.length;
  if (P.filter(live).length < 2) return -1;
  for (let k = 1; k <= n; k++) { const j = (i + k) % n, p = P[j]; if (canAct(p) && (!p.acted || p.bet < s.curBet)) return j; }
  return -1;
}
export const pot = (s) => s.p.reduce((a, p) => a + p.total, 0);
/// what the player to act may do: { toCall, check, call, fold, raise: { min, max } | null } (amounts: totals this street)
export function legal(s) {
  if (s.street >= 4 || s.toAct < 0) return null;
  const p = s.p[s.toAct], toCall = Math.max(0, s.curBet - p.bet), all = p.stack + p.bet;
  const reopen = !p.acted || p.seen < s.seq;
  const canRaise = p.stack > toCall && reopen && s.p.some((o, j) => j !== s.toAct && canAct(o));
  return { toCall: Math.min(toCall, p.stack), check: toCall === 0, call: toCall > 0, fold: true, raise: canRaise ? { min: Math.min(all, s.curBet + s.minRaise), max: all } : null, allin: p.stack > 0 };
}
/// one action for the seat to act: { t: "fold" | "check" | "call" | "raise", to } (raise to a total this street;
/// a raise to everything you have is all-in). Returns the hand, or null if not allowed
export function act(s, i, a) {
  if (s.street >= 4 || i !== s.toAct || !a) return null;
  const p = s.p[i], L = legal(s); if (!L) return null;
  if (a.t === "fold") { p.folded = true; }
  else if (a.t === "check") { if (!L.check) return null; }
  else if (a.t === "call") { if (!L.call) return null; const amt = Math.min(s.curBet - p.bet, p.stack); p.stack -= amt; p.bet += amt; p.total += amt; if (p.stack === 0) p.allin = true; }
  else if (a.t === "raise" || a.t === "allin") {
    const all = p.stack + p.bet, to = a.t === "allin" ? all : Math.floor(Number(a.to) || 0);
    // all-in for no more than a call is a call; when raising isn't open (no one left to act, or the betting wasn't
    // re-opened) an all-in is a call too
    if (to <= s.curBet || !L.raise) { if (a.t === "allin" && L.call) return act(s, i, { t: "call" }); if (a.t === "allin" && L.check) return act(s, i, { t: "check" }); return null; }
    if (to > all || (to < L.raise.min && to !== all)) return null;
    const by = to - s.curBet, amt = to - p.bet; p.stack -= amt; p.bet = to; p.total += amt; if (p.stack === 0) p.allin = true;
    if (by >= s.minRaise) { s.minRaise = by; s.seq++; } // a full raise re-opens the betting
    s.curBet = to;
  } else return null;
  p.acted = true; p.seen = s.seq;
  s.log.push({ i, t: p.allin && a.t !== "fold" ? "allin" : a.t === "allin" ? "raise" : a.t, a: p.bet, st: s.street });
  advance(s, i);
  return s;
}
function advance(s, i) {
  const P = s.p, alive = P.filter(live);
  if (alive.length === 1) return settle(s);
  const nx = nextActor(s, i);
  if (nx >= 0) { s.toAct = nx; return; }
  // the street is done: bets into the pot, the next cards
  if (s.street === 3) return settle(s);
  nextStreet(s);
}
function nextStreet(s) {
  const P = s.p; for (const p of P) { p.bet = 0; p.acted = false; p.seen = -1; } s.curBet = 0; s.minRaise = s.bb; s.seq = 0;
  s.street++; s.ptr++; // (a burn card)
  const n = s.street === 1 ? 3 : 1; for (let k = 0; k < n; k++) s.board.push(s.deck[s.ptr++]);
  s.log.push({ i: -1, t: "street", a: s.street, st: s.street });
  const actors = P.filter(canAct).length;
  if (actors < 2) { if (s.street < 3) return nextStreet(s); return settle(s); } // (everyone's all-in: the board runs out)
  s.toAct = nextActor(s, s.button);
}
function runOut(s) { while (s.street < 3) { const P = s.p; for (const p of P) { p.bet = 0; } s.street++; s.ptr++; const n = s.street === 1 ? 3 : 1; for (let k = 0; k < n; k++) s.board.push(s.deck[s.ptr++]); } settle(s); }
/// the pots (main and side), each to the best hand(s) eligible for it; an odd chip goes to the first winner left of the button
export function settle(s) {
  const P = s.p, alive = P.map((p, i) => i).filter((i) => live(P[i])), net = P.map((p) => -p.total);
  s.toAct = -1; s.street = 4;
  if (alive.length === 1) { const w = alive[0], all = pot(s); P[w].stack += all; net[w] += all; s.result = { pots: [{ amt: all, win: [w] }], shown: [], net, uncontested: true }; for (const p of P) p.bet = 0; return s; }
  while (s.board.length < 5) s.board.push(s.deck[s.ptr++]);
  const val = P.map((p, i) => (alive.includes(i) ? best([...p.hole, ...s.board]) : null));
  const levels = [...new Set(alive.map((i) => P[i].total))].sort((a, b) => a - b), pots = [];
  let prev = 0;
  levels.forEach((Lv, k) => {
    let amt = 0; for (const p of P) amt += Math.max(0, Math.min(p.total, Lv) - Math.min(p.total, prev));
    if (k === levels.length - 1) for (const p of P) amt += Math.max(0, p.total - Lv); // (a folded player's extra above every caller)
    const elig = alive.filter((i) => P[i].total >= Lv), top = Math.max(...elig.map((i) => val[i].v)), win = elig.filter((i) => val[i].v === top);
    pots.push({ amt, win, elig }); prev = Lv;
  });
  const order = (w) => [...w].sort((a, b) => ((a - s.button + P.length) % P.length || P.length) - ((b - s.button + P.length) % P.length || P.length));
  for (const pt of pots) { const share = Math.floor(pt.amt / pt.win.length), odd = pt.amt - share * pt.win.length, ws = order(pt.win); ws.forEach((w, k) => { const g = share + (k < odd ? 1 : 0); P[w].stack += g; net[w] += g; }); }
  for (const p of P) p.bet = 0;
  s.result = { pots, shown: alive.map((i) => ({ i, hole: P[i].hole, cat: val[i].cat, name: val[i].name, five: val[i].five })), net, uncontested: false };
  return s;
}
/// what a seat may see: its own cards, everyone's at a showdown; never the deck
export function viewOf(s, me) {
  const shown = s.result && !s.result.uncontested ? new Set(s.result.shown.map((x) => x.i)) : new Set();
  return { ...s, deck: undefined, seed: undefined, ptr: undefined, p: s.p.map((p, i) => ({ ...p, hole: i === me || shown.has(i) ? p.hole : p.hole.map(() => -1) })) };
}

// ---------------- the computer players ----------------
// Beginner (0) plays loosely and calls a lot; Normal (1) by hand strength and pot odds; Hard (2) adds position,
// bet sizing and the odd bluff; Expert (3) the same with a finer read of the board (more simulations) and
// semi-bluffs on draws. They see only their own two cards and the board.
export const LEVELS = ["Beginner", "Normal", "Hard", "Expert"];
function preflop(h) { // 0–1: pairs, high cards, suited and connected
  const [a, b] = h.map(rankOf).sort((x, y) => y - x), suited = suitOf(h[0]) === suitOf(h[1]);
  let v = a === b ? 0.5 + a * 0.04 : (a + b) / 30 + (suited ? 0.06 : 0) + (a - b === 1 ? 0.05 : a - b === 2 ? 0.025 : 0) + (a >= 10 ? 0.06 : 0);
  return Math.max(0, Math.min(1, v));
}
/// the share of the time these two cards win against `opp` random hands on this board (Monte Carlo, n deals)
export function equity(hole, board, opp, n, R) {
  const used = new Set([...hole, ...board]), rest = []; for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  let win = 0;
  for (let k = 0; k < n; k++) {
    const d = rest.slice(); for (let i = d.length - 1; i > d.length - 1 - (opp * 2 + 5 - board.length) && i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; }
    let ptr = d.length - 1; const bd = board.slice(); while (bd.length < 5) bd.push(d[ptr--]);
    const mine = best([...hole, ...bd]).v; let beat = true, tie = 0;
    for (let o = 0; o < opp && beat; o++) { const v = best([d[ptr--], d[ptr--], ...bd]).v; if (v > mine) beat = false; else if (v === mine) tie++; }
    if (beat) win += tie ? 1 / (tie + 1) : 1;
  }
  return win / n;
}
/// the computer's choice for the seat to act: { t, to? }
export function botMove(s, R) {
  const L = legal(s); if (!L) return null;
  const me = s.p[s.toAct], lvl = me.lvl || 0, opp = s.p.filter((p, j) => j !== s.toAct && live(p)).length, P0 = pot(s);
  const sims = [0, 60, 140, 260][lvl];
  const eq = s.street === 0 || !sims ? Math.min(0.95, preflop(me.hole) * (opp > 2 ? 0.85 : 1) + (s.street ? best([...me.hole, ...s.board]).cat * 0.08 : 0)) : equity(me.hole, s.board, Math.max(1, opp), sims, R);
  const odds = L.toCall / (P0 + L.toCall || 1), r = R();
  const raiseTo = (k) => { if (!L.raise) return null; const want = Math.round((s.curBet + Math.max(s.bb, (P0 + L.toCall) * k)) / s.bb) * s.bb; const to = Math.max(L.raise.min, Math.min(L.raise.max, want)); return to >= L.raise.max * 0.85 ? { t: "allin" } : { t: "raise", to }; };
  if (lvl === 0) { // loose and passive
    if (L.raise && r < 0.12) return raiseTo(0.5) || (L.check ? { t: "check" } : { t: "call" });
    if (L.check) return { t: "check" };
    return eq > 0.25 || r < 0.45 ? { t: "call" } : { t: "fold" };
  }
  const bluff = [0, 0.04, 0.09, 0.12][lvl], strong = [0, 0.72, 0.66, 0.62][lvl], margin = [0, 0.02, 0.05, 0.07][lvl];
  if (eq > strong && L.raise) return raiseTo(eq > 0.85 ? 1 : 0.6);
  if (L.check) { if (L.raise && (eq > strong - 0.1 || r < bluff)) return raiseTo(0.5); return { t: "check" }; }
  if (eq > odds + margin) return { t: "call" };
  if (L.raise && r < bluff * 0.5 && s.street < 3) return raiseTo(0.7);
  return { t: "fold" };
}
