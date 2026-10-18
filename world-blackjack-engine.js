// world-blackjack-engine.js — ARCIA POKER LOUNGE's blackjack: the rules, the shoe, the dealer and the payouts. Shared
// word for word with the server (api/_world-blackjack-engine.mjs is a copy; tests/world/blackjack.test.mjs checks
// the two are the same). Nothing here draws, and nothing reads the clock: a seeded shuffle makes the same shoe for the
// same seed everywhere.
//
// The house rules: 6 decks, cut at 75%; blackjack pays 3:2; the dealer peeks for blackjack and stands on soft 17;
// double on any first two cards (and after a split); split up to 4 hands (split aces take one card each); late
// surrender (half back); insurance when the dealer shows an ace (pays 2:1).
// Chips are play money only: never bought with ARCL and never turned into ARCL.
//
// A card is 0–51 as in world-poker-engine.js: rank = c % 13 (0 = 2 … 8 = 10, 9 J, 10 Q, 11 K, 12 A), suit = ⌊c / 13⌋.
// A round (deal) is a plain object that survives JSON: { shoe, ptr, bank, bet, hands: [{ cards, bet, done, doubled,
// split, res, pay }], cur, dealer, phase ("ins" | "play" | "done"), ins, insPay, log }.
export const BJ = { DECKS: 6, START: 1000, CHIPS: [10, 25, 50, 100, 250, 500], MIN: 10, MAX: 500, CUT: 0.75, SPLITS: 4, HAND_S: 2.5, XP_HAND: 5 };
export function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/// a fresh shoe of DECKS decks, shuffled from the seed
export function shoe(seed) { const R = rng(seed), d = []; for (let k = 0; k < BJ.DECKS; k++) for (let c = 0; c < 52; c++) d.push(c); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; } return d; }
export const valOf = (c) => { const r = c % 13; return r <= 8 ? r + 2 : r < 12 ? 10 : 11; };
/// a hand's total and whether an ace still counts 11 ("soft")
export function total(cards) { let t = 0, aces = 0; for (const c of cards) { t += valOf(c); if (c % 13 === 12) aces++; } while (t > 21 && aces) { t -= 10; aces--; } return { t, soft: aces > 0 }; }
export const isBJ = (h) => h.cards.length === 2 && !h.split && total(h.cards).t === 21;
const needShuffle = (s) => !s.shoe || s.ptr > s.shoe.length * BJ.CUT;
const draw = (s) => s.shoe[s.ptr++];
/// a new round: the bet comes off the bank, two cards each (the dealer's second face down). The shoe carries over
/// from the last round (a fresh one, from `seed`, once it's past the cut)
export function deal(prev, { bank, bet, seed }) {
  bet = Math.floor(Number(bet) || 0); if (bet < BJ.MIN || bet > BJ.MAX || bet > bank) return null;
  const s = { shoe: prev && !needShuffle(prev) ? prev.shoe : shoe(seed), ptr: prev && !needShuffle(prev) ? prev.ptr : 0, bank: bank - bet, bet, hands: [], cur: 0, dealer: [], phase: "play", ins: 0, insPay: 0, log: [], fresh: !prev || needShuffle(prev) };
  const h = { cards: [], bet, done: false, doubled: false, split: false, res: "", pay: 0 }; s.hands.push(h);
  h.cards.push(draw(s)); s.dealer.push(draw(s)); h.cards.push(draw(s)); s.dealer.push(draw(s));
  s.log.push({ t: "deal" });
  if (s.dealer[0] % 13 === 12) { s.phase = "ins"; return s; } // (an ace up: insurance first)
  return afterPeek(s);
}
/// the dealer looks at the hole card (with a ten or an ace up); a blackjack ends the round at once
function afterPeek(s) {
  if (total(s.dealer).t === 21 || isBJ(s.hands[0])) return finish(s, false);
  s.phase = "play"; return s;
}
/// insurance (take: true) or not, while the dealer shows an ace
export function insure(s, take) {
  if (!s || s.phase !== "ins") return null;
  if (take) { const c = Math.floor(s.bet / 2); if (c > s.bank || c <= 0) return null; s.bank -= c; s.ins = c; s.log.push({ t: "ins", a: c }); }
  return afterPeek(s);
}
/// what the hand in play may do
export function legal(s) {
  if (!s || s.phase !== "play") return null;
  const h = s.hands[s.cur], two = h.cards.length === 2, first = two && s.hands.length === 1;
  return { hit: true, stand: true, double: two && s.bank >= h.bet, split: two && valOf(h.cards[0]) === valOf(h.cards[1]) && s.hands.length < BJ.SPLITS && s.bank >= h.bet, surrender: first && !h.doubled };
}
/// one move for the hand in play: "hit" | "stand" | "double" | "split" | "surrender". Returns the round, or null
export function act(s, a) {
  const L = legal(s); if (!L || !L[a]) return null;
  const h = s.hands[s.cur];
  if (a === "hit") { h.cards.push(draw(s)); const t = total(h.cards).t; if (t >= 21) h.done = true; }
  else if (a === "stand") h.done = true;
  else if (a === "double") { s.bank -= h.bet; h.bet *= 2; h.doubled = true; h.cards.push(draw(s)); h.done = true; }
  else if (a === "surrender") { h.res = "surrender"; h.done = true; }
  else if (a === "split") {
    s.bank -= h.bet; const aces = h.cards[0] % 13 === 12, n = { cards: [h.cards.pop()], bet: h.bet, done: false, doubled: false, split: true, res: "", pay: 0 };
    h.split = true; h.cards.push(draw(s)); n.cards.push(draw(s)); s.hands.splice(s.cur + 1, 0, n);
    if (aces) { h.done = true; n.done = true; } // (split aces: one card each)
    else { if (total(h.cards).t === 21) h.done = true; if (total(n.cards).t === 21) n.done = true; }
  }
  s.log.push({ t: a, h: s.cur });
  while (s.cur < s.hands.length && s.hands[s.cur].done) s.cur++;
  if (s.cur >= s.hands.length) return finish(s, true);
  return s;
}
/// the dealer's turn (if any hand still stands against it), then every hand paid
function finish(s, play) {
  const live = s.hands.some((h) => h.res !== "surrender" && total(h.cards).t <= 21);
  if (play && live && !(s.hands.length === 1 && isBJ(s.hands[0]))) { while (true) { const d = total(s.dealer); if (d.t >= 17) break; s.dealer.push(draw(s)); } }
  const d = total(s.dealer).t, dBJ = s.dealer.length === 2 && d === 21;
  if (s.ins) { s.insPay = dBJ ? s.ins * 3 : 0; s.bank += s.insPay; }
  for (const h of s.hands) {
    const t = total(h.cards).t;
    if (h.res === "surrender") { h.pay = Math.floor(h.bet / 2); }
    else if (isBJ(h)) { h.res = dBJ ? "push" : "blackjack"; h.pay = dBJ ? h.bet : h.bet + Math.floor((h.bet * 3) / 2); }
    else if (t > 21) { h.res = "bust"; h.pay = 0; }
    else if (dBJ) { h.res = "lose"; h.pay = 0; }
    else if (d > 21 || t > d) { h.res = "win"; h.pay = h.bet * 2; }
    else if (t === d) { h.res = "push"; h.pay = h.bet; }
    else { h.res = "lose"; h.pay = 0; }
    s.bank += h.pay;
  }
  s.phase = "done"; s.cur = -1; s.log.push({ t: "done" });
  return s;
}
/// the round as the player may see it: the dealer's hole card hidden (-1) until the dealer plays; never the shoe
export function viewOf(s) { return { ...s, shoe: undefined, ptr: undefined, left: s.shoe ? s.shoe.length - s.ptr : 0, dealer: s.phase === "done" ? s.dealer.slice() : [s.dealer[0], -1] }; }
/// what a careful player does (the basic strategy for these rules): "H" hit, "S" stand, "D" double, "P" split, "R" surrender
export function advice(s) {
  const L = legal(s); if (!L) return "";
  const h = s.hands[s.cur], up = valOf(s.dealer[0]), { t, soft } = total(h.cards), u = up === 11 ? 11 : up;
  if (L.split) {
    const v = valOf(h.cards[0]);
    if (v === 11 || v === 8) return "P";
    if (v === 9 && ![7, 10, 11].includes(u)) return "P";
    if ((v === 7 || v === 3 || v === 2) && u <= 7) return "P";
    if (v === 6 && u <= 6) return "P";
    if (v === 4 && (u === 5 || u === 6)) return "P";
  }
  if (L.surrender && !soft && ((t === 16 && u >= 9) || (t === 15 && u === 10))) return "R";
  if (soft) {
    if (t >= 19) return t === 19 && u === 6 && L.double ? "D" : "S";
    if (t === 18) return u >= 2 && u <= 6 && L.double ? "D" : u <= 8 ? "S" : "H";
    const dbl = (t === 17 && u >= 3 && u <= 6) || ((t === 15 || t === 16) && u >= 4 && u <= 6) || ((t === 13 || t === 14) && (u === 5 || u === 6));
    return dbl && L.double ? "D" : "H";
  }
  if (t >= 17) return "S";
  if (t >= 13) return u <= 6 ? "S" : "H";
  if (t === 12) return u >= 4 && u <= 6 ? "S" : "H";
  if (t === 11) return L.double ? "D" : "H";
  if (t === 10) return u <= 9 && L.double ? "D" : "H";
  if (t === 9) return u >= 3 && u <= 6 && L.double ? "D" : "H";
  return "H";
}
