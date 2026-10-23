// world-blackjack.js — blackjack at ARCIA POKER LOUNGE's table (world-poker.js hands it the scene, the cards and the
// chips): you against ARCIA, who deals from a 6-deck shoe. Three tables (10–500, 100–5,000, 1,000–50,000); hit, stand,
// double, split, surrender, insurance — the rules and the payouts are world-blackjack-engine.js.
// With a wallet the chips are the ones in your lounge record (free daily, or bought with ARCL — one way, they never
// turn back into ARCL) and ARCIA deals on the server (api/_world-poker.mjs world-bj-*): each move is asked there, and
// a round left half-played waits for you. The daily mission "play 30 blackjack hands" counts there too; its ARCL
// never depends on winning. A guest plays practice chips here in the browser (1,000, free refills).
// ARCIA's tip (the basic strategy) shows while the hint is on (Profile → Settings).
// b-pky3: two side bets, each the table's least × 5 (at most the bet): Perfect Pairs and 21+3, settled as the cards land.
//
// api: { THREE, T, esc, snd, say, banner, flash, confetti, buzz, tween, ease, moveCard, cardFrom, faceTex, toScreen,
//        stackChips, flyChips, S(), cardAt(k), ui(), prog(), save(), ctx, signed(), fast(), scaleK(), modal(html, arcia),
//        closeModal(), enterTable(), phone(), chips() (your record's chips), onProg(prog), shop() (the chip shop) }
import { BJ, deal, insure, act, legal, total, isBJ, advice, viewOf, tableOf } from "./world-blackjack-engine.js";

const fmt = (n) => Math.round(n || 0).toLocaleString("en-US");
const CHIPC = ["#e8e8f0", "#1fa85a", "#e0283c", "#22222e", "#8a4bff", "#ffc83a"];
const MOVE = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };
const SIDE_N = { mixed: "Mixed pair", colored: "Coloured pair", perfect: "Perfect pair", flush: "Flush", straight: "Straight", trips: "Three of a kind", sflush: "Straight flush", strips: "Suited trips" };
const ERR = { "not enough chips": "Not enough chips", "that bet isn't allowed at this table": "That bet isn't allowed at this table", "finish the round first": "Finish the round first", "one moment": "One moment…" };

export function makeBlackjack(api) {
  const { T, esc } = api;
  let on = false, root = null, B = null, Q = [], qAt = 0, vh = [], vd = [], used = 0, wasBusy = false;

  // ---------------- the steps: each card and each payout has its moment ----------------
  function step(wait, fn) { if (!Q.length && qAt < performance.now()) qAt = performance.now(); Q.push({ wait, fn }); }
  function runQ(now) { while (Q.length && now >= qAt) { const s = Q.shift(); try { s.fn(); } catch (e) { console.warn("blackjack step", e); } qAt = now + s.wait * 1000 * api.fast(); } }
  const busy = () => Q.length > 0;

  // ---------------- where things sit on the felt ----------------
  const scale = () => (api.phone() ? 1.45 : 1.5); // (blackjack has few cards on a big felt: they can be large)
  function handX(h, n) { const w = n <= 1 ? 0 : n === 2 ? 2.2 : 1.7; return (h - (n - 1) / 2) * w; }
  function spotH(h, k, n) { const sc = scale() * (n > 2 ? 0.8 : 1); return { x: handX(h, n) - 0.15 * sc + k * 0.26 * sc, z: 1.1 - k * 0.09 * sc, y: 0.02 + k * 0.004 }; }
  function spotD(k, n) { const sc = scale(), w = (n > 4 ? 0.36 : 0.5) * sc; return { x: (k - (n - 1) / 2) * w, z: -1.75, y: 0.02 + k * 0.004 }; }
  const betSpot = (h, n) => ({ x: handX(h, n), z: 2.3 });
  const SHOE = { x: 2.0, z: -2.5 };
  function card(c, up) { const cd = api.cardAt(used++); api.cardFrom(cd, c); cd.o.position.set(SHOE.x, 0.35, SHOE.z); cd.o.rotation.y = -0.4; cd.flip.rotation.y = Math.PI; cd.o.scale.setScalar(0.8); void up; return cd; }
  function layout(dur = 0.3) {
    const s = B.s; if (!s) return; const n = s.hands.length, sc = scale();
    vh.forEach((row, h) => row.forEach((cd, k) => { const p = spotH(h, k, n); api.moveCard(cd, p.x, p.z, 0, true, dur, 0, sc * (n > 2 ? 0.8 : 1)); }));
    vd.forEach((cd, k) => { const p = spotD(k, vd.length); api.moveCard(cd, p.x, p.z, 0, cd.c >= 0 && (k !== 1 || s.phase === "done"), dur, 0, sc); });
    B.betG.forEach((g, h) => { if (h < n) { const p = betSpot(h, n); g.position.set(p.x, 0.03, p.z); api.stackChips(g, s.hands[h].bet); } else api.stackChips(g, 0); });
  }
  function dealTo(h, c) { const cd = card(c, true); (vh[h] = vh[h] || []).push(cd); const n = B.s.hands.length, p = spotH(h, vh[h].length - 1, n); api.moveCard(cd, p.x, p.z, 0, true, 0.32, 0, scale() * (n > 2 ? 0.8 : 1)); api.snd("card"); }
  function dealD(c, up) { const cd = card(c, up); vd.push(cd); const p = spotD(vd.length - 1, Math.max(2, vd.length)); api.moveCard(cd, p.x, p.z, 0, up, 0.32, 0, scale()); api.snd("card"); }

  // ---------------- the HUD ----------------
  function build() {
    const ui = api.ui(); root = document.createElement("div"); root.className = "bj"; root.hidden = true;
    root.innerHTML = `<div class="bj-vals"></div><div class="bj-tip" hidden></div>
      <div class="bj-bar"><div class="bj-bet"><div class="bj-tables">${BJ.TABLES.map((t) => `<button type="button" data-table="${t.id}">${fmt(t.min)}–${fmt(t.max)}</button>`).join("")}</div>
        <div class="bj-chips">${BJ.CHIPS.map((v, k) => `<button type="button" data-chip="${k}" style="--c:${CHIPC[k]}"><b></b></button>`).join("")}</div>
        <div class="bj-side"><button type="button" data-side="pp"><b>${esc(T("Perfect Pairs"))}</b><small></small></button><button type="button" data-side="t3"><b>21+3</b><small></small></button><button type="button" class="q" data-side="info" aria-label="${esc(T("Side bets"))}">?</button></div>
        <div class="bj-row"><button type="button" class="bj-b" data-a="clear">${esc(T("Clear"))}</button><button type="button" class="bj-b" data-a="rebet">${esc(T("Rebet"))}</button><button type="button" class="bj-b go" data-a="deal"><b>${esc(T("DEAL"))}</b><small></small></button></div>
        <button type="button" class="bj-b refill" data-a="refill" hidden>${esc(T("Free refill to {n}", { n: fmt(BJ.START) }))}</button><button type="button" class="bj-b refill" data-a="shop" hidden>${esc(T("Chip shop"))}</button></div>
      <div class="bj-play" hidden><button type="button" class="h" data-a="hit"><b>${esc(T("HIT"))}</b></button><button type="button" class="s" data-a="stand"><b>${esc(T("STAND"))}</b></button><button type="button" class="d" data-a="double"><b>${esc(T("DOUBLE"))}</b></button><button type="button" class="p" data-a="split"><b>${esc(T("SPLIT"))}</b></button><button type="button" class="r" data-a="surrender"><b>${esc(T("SURRENDER"))}</b></button></div></div>`;
    ui.root.appendChild(root);
    root.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || !on || b.disabled) return; if (b.dataset.chip) { addChip(chipVal(+b.dataset.chip)); return; } if (b.dataset.side) { sideTap(b.dataset.side); return; } if (b.dataset.table) { setTable(b.dataset.table); return; } press(b.dataset.a); });
  }
  const q = (x) => root.querySelector(x);
  const tb = () => tableOf(B.table), chipVal = (k) => BJ.CHIPS[k] * tb().k;
  const bank = () => (B.real ? api.chips() : B.bank);
  /// b-pky3: a side bet's amount: the table's least × 5, never more than the bet
  const sideAmt = () => { const t = tb(); return B.bet >= t.min ? Math.min(B.bet, t.min * 5) : 0; };
  const sides = () => { const a = sideAmt(); return { pp: B.side && B.side.pp ? a : 0, t3: B.side && B.side.t3 ? a : 0 }; };
  const sideSum = () => { const x = sides(); return x.pp + x.t3; };
  function sideTap(k) {
    if (k === "info") { api.modal(`<h3>${esc(T("Side bets"))}</h3><p class="pk-note">${esc(T("Each is the table's least bet × 5 (at most your bet), paid as the cards land."))}</p><p><b>${esc(T("Perfect Pairs"))}</b> · ${esc(T("your first two cards"))}</p><ul class="bj-pays">${Object.entries(BJ.PP).map(([n, x]) => `<li>${esc(T(SIDE_N[n]))}<b>${x}:1</b></li>`).join("")}</ul><p><b>21+3</b> · ${esc(T("your two + ARCIA's up card"))}</p><ul class="bj-pays">${Object.entries(BJ.T3).map(([n, x]) => `<li>${esc(T(SIDE_N[n]))}<b>${x}:1</b></li>`).join("")}</ul><div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Close"))}</button></div>`); return; }
    if (!B || B.wait || busy() || (B.s && B.s.phase !== "done")) return; B.side = { ...(B.side || {}), [k]: !(B.side && B.side[k]) }; api.snd("tap"); paint();
  }
  function setTable(id) { if (!B || B.wait || busy() || (B.s && B.s.phase !== "done")) return; B.table = tableOf(id).id; const t = tb(); B.bet = Math.min(Math.max(t.min, B.bet), t.max); api.snd("tab"); paint(); }
  function paint() {
    if (!root || !B) return; const s = B.s, ui = api.ui(), betting = !s || s.phase === "done", t = tb(), bk = bank();
    ui.title.textContent = B.real ? T("Blackjack · vs ARCIA") : T("Blackjack · practice"); ui.sub.textContent = T("Chips {b} · Bet {n}", { b: fmt(bk), n: fmt(betting ? B.bet : s.hands.reduce((a, h) => a + h.bet, 0)) });
    const showBet = betting && !busy(), showPlay = s && s.phase === "play" && !busy();
    q(".bj-bet").hidden = !showBet; q(".bj-play").hidden = !showPlay; root.classList.toggle("wait", !!B.wait);
    if (showBet) {
      q('[data-a="deal"] small').textContent = fmt(B.bet + sideSum()); q('[data-a="deal"]').disabled = B.wait || B.bet < t.min || B.bet > t.max || B.bet + sideSum() > bk;
      root.querySelectorAll(".bj-side [data-side]").forEach((b) => { const k = b.dataset.side; if (k === "info") return; const a = sideAmt(); b.classList.toggle("on", !!(B.side && B.side[k])); b.disabled = !a; b.querySelector("small").textContent = a ? fmt(a) : "–"; }); q('[data-a="rebet"]').disabled = !B.last || B.last > bk || B.last > t.max || B.last < t.min; q('[data-a="clear"]').disabled = !B.bet;
      root.querySelectorAll("[data-chip]").forEach((b) => { const v = chipVal(+b.dataset.chip); b.querySelector("b").textContent = v >= 1000 ? v / 1000 + "K" : v; b.disabled = B.bet + v > Math.min(t.max, bk); });
      root.querySelectorAll("[data-table]").forEach((b) => b.classList.toggle("on", b.dataset.table === B.table));
      q('[data-a="refill"]').hidden = B.real || bk >= BJ.TABLES[0].min; q('[data-a="shop"]').hidden = !B.real || bk >= t.min;
    }
    if (showPlay) { const L = legal(s); for (const k of ["double", "split", "surrender"]) q(`[data-a="${k}"]`).hidden = !L[k]; root.querySelectorAll(".bj-play button").forEach((b) => { b.disabled = !!B.wait; }); }
    const tip = q(".bj-tip"), adv = showPlay && api.prog().hint ? advice(s) : ""; tip.hidden = !adv; if (adv) tip.textContent = T("ARCIA's tip: {m} ♡", { m: T(MOVE[adv]) });
    paintVals();
  }
  function paintVals() {
    const box = q(".bj-vals"), s = B && B.s; if (!s) { box.innerHTML = ""; return; }
    const n = s.hands.length, rows = [];
    const lab = (cards, h) => { const { t, soft } = total(cards); if (h && h.res) return { t: { blackjack: T("BLACKJACK!"), win: T("WIN"), push: T("PUSH"), bust: T("BUST"), lose: T("LOSE"), surrender: T("SURRENDER") }[h.res] + (h.res === "win" || h.res === "blackjack" ? " +" + fmt(h.pay - h.bet) : ""), c: h.res }; if (t > 21) return { t: T("BUST") + " " + t, c: "bust" }; if (h && isBJ(h)) return { t: "21", c: "blackjack" }; return { t: soft && t < 21 ? `${t - 10}/${t}` : String(t), c: "" }; };
    vh.forEach((row, h) => { if (!row.length || !s.hands[h]) return; const shown = s.hands[h].cards.slice(0, row.length), p = spotH(h, row.length - 1, n), sp = api.toScreen(p.x, 0.1, p.z - 0.62), L = lab(shown, s.phase === "done" && !busy() ? s.hands[h] : null); rows.push(`<i class="bj-val ${L.c}${h === s.cur && s.phase === "play" && n > 1 ? " cur" : ""}" style="transform:translate(${sp.x}px,${sp.y}px) translate(-50%,-100%)">${esc(L.t)}</i>`); });
    if (vd.length) { const seen = s.phase === "done" ? s.dealer.slice(0, vd.length) : [s.dealer[0]], p = spotD(0, vd.length), sp = api.toScreen(0, 0.1, p.z + 0.62), L = lab(seen, null); rows.push(`<i class="bj-val dealer" style="transform:translate(${sp.x}px,${sp.y}px) translate(-50%,0)">${esc(T("ARCIA"))} · ${esc(L.t)}</i>`); }
    box.innerHTML = rows.join("");
  }

  // ---------------- a round: here (practice) or on the server (your chips) ----------------
  /// one step of the round: { op: "deal" | "act" | "ins", bet, a, take } → the round as you may see it, or null
  async function step1(o) {
    if (!B.real) {
      if (o.op === "deal") { const e = deal(B.eng, { bank: B.bank, bet: o.bet, seed: (Math.random() * 2 ** 31) | 0, table: B.table, side: o.side }); if (!e) return null; B.eng = e; }
      else if (o.op === "act") { if (!act(B.eng, o.a)) return null; }
      else if (!insure(B.eng, o.take)) return null;
      B.bank = B.eng.bank; return viewOf(B.eng);
    }
    const ss = api.ctx.sess && api.ctx.sess(); if (!ss) { api.ctx.toast(esc(T("Sign in with a wallet to play with your chips"))); return null; }
    B.wait = true; paint();
    let r = null; try { r = await api.ctx.post(o.op === "deal" ? { action: "world-bj-deal", ...ss, table: B.table, bet: o.bet, side: o.side } : o.op === "act" ? { action: "world-bj-act", ...ss, a: o.a } : { action: "world-bj-ins", ...ss, take: !!o.take }); } catch { r = null; }
    B.wait = false;
    if (!r || !r.ok || !r.j || !r.j.round) {
      const e = (r && r.j && r.j.error) || "network"; api.ctx.toast(esc(T(ERR[e] || (e === "network" ? "Network trouble — try again" : e)))); api.snd("bad");
      if (r && r.j && r.j.round) restore(r.j.round); paint(); return null;
    }
    if (r.j.prog) api.onProg(r.j.prog);
    if (r.j.credited > 0) { api.ctx.toast(`<b>+${fmt(r.j.credited)} ARCL</b> · ${esc(T("Mission complete: 30 blackjack hands"))}`); api.snd("coin"); if (api.ctx.refresh) api.ctx.refresh(); api.confetti(30); }
    return r.j.round;
  }
  function addChip(v) { if (!B || B.wait || busy() || (B.s && B.s.phase !== "done")) return; if (B.bet + v > Math.min(tb().max, bank())) { api.snd("bad"); return; } B.bet += v; api.snd("chip", 1); paint(); }
  function clearTable() { for (const row of vh) for (const cd of row) cd.o.visible = false; for (const cd of vd) cd.o.visible = false; vh = []; vd = []; used = 0; B.betG.forEach((g) => api.stackChips(g, 0)); }
  /// a round in play shown at once (coming back to a round the server kept)
  function restore(v) {
    clearTable(); B.s = v; v.hands.forEach((h, i) => { vh[i] = h.cards.map((c) => { const cd = card(c, true); return cd; }); });
    vd = v.dealer.map((c) => card(c, c >= 0)); layout(0.01);
    vd.forEach((cd, k) => { if (v.dealer[k] < 0) cd.flip.rotation.y = Math.PI; });
    if (v.phase === "ins") askIns(v);
    paint();
  }
  async function press(a) {
    if (!B || busy() || B.wait) return;
    if (a === "clear") { B.bet = 0; api.snd("tap"); paint(); return; }
    if (a === "rebet") { const t = tb(); if (B.last && B.last <= bank() && B.last <= t.max) { B.bet = B.last; api.snd("chip", 2); paint(); } return; }
    if (a === "refill") { if (B.real) return; B.bank = BJ.START; B.bet = Math.min(Math.max(B.bet, tb().min), B.bank); api.snd("coin"); api.flash(T("Refilled: {n} chips", { n: fmt(BJ.START) }), "big"); paint(); return; }
    if (a === "shop") { if (api.shop) api.shop(); return; }
    if (a === "deal") return start();
    const s0 = B.s; if (!s0 || s0.phase !== "play") return;
    const L = legal(s0); if (!L || !L[a]) { api.snd("bad"); return; }
    const h = s0.cur, before = s0.hands.map((x) => x.cards.length), v = await step1({ op: "act", a }); if (!v || !on) return;
    B.s = v; api.snd(a === "stand" ? "knock" : a === "double" || a === "split" ? "chip" : "tap");
    if (a === "split") { const moved = vh[h].pop(); vh.splice(h + 1, 0, [moved]); step(0.3, () => layout(0.3)); step(0.3, () => { dealTo(h, v.hands[h].cards[1]); }); step(0.35, () => { dealTo(h + 1, v.hands[h + 1].cards[1]); }); }
    else v.hands.forEach((x, i) => { for (let k = before[i] || 0; k < x.cards.length; k++) { const c = x.cards[k], hi = i; step(0.35, () => dealTo(hi, c)); } });
    if (a === "double") step(0.1, () => layout(0.2));
    if (a === "surrender") step(0.2, () => api.flash(T("Surrendered: half back"), ""));
    if (v.phase === "done") finish(); else step(0, paint);
    paint();
  }
  async function start() {
    if (!B || busy() || B.wait) return; const t = tb(); if (B.bet < t.min || B.bet > t.max || B.bet + sideSum() > bank()) { api.snd("bad"); return; }
    const v = await step1({ op: "deal", bet: B.bet, side: sides() }); if (!v || !on) return;
    B.last = B.bet; B.s = v; clearTable(); api.closeModal();
    if (v.fresh && B.rounds) api.flash(T("A fresh shoe"), "");
    if (v.fresh) api.snd("shuffle");
    B.rounds++;
    api.stackChips(B.betG[0], v.hands[0].bet); B.betG[0].position.set(0, 0.03, 2.3); api.snd("chip", 2);
    const h0 = v.hands[0];
    step(0.28, () => dealTo(0, h0.cards[0])); step(0.28, () => dealD(v.dealer[0], true)); step(0.28, () => dealTo(0, h0.cards[1])); step(0.45, () => dealD(v.dealer[1], false));
    if (v.side) step(0.2, () => sideShow(v.side));
    if (v.phase === "ins") step(0, () => askIns(v));
    else if (v.phase === "done") finish();
    else step(0, () => { paint(); if (isBJ(h0)) api.say(T("Blackjack! ♾️")); });
    paint();
  }
  /// b-pky3: what the side bets made
  function sideShow(sd) {
    const won = [];
    if (sd.pp) won.push(sd.ppR ? T("Perfect Pairs: {x}! +{n}", { x: T(SIDE_N[sd.ppR]), n: fmt(sd.ppPay - sd.pp) }) : "");
    if (sd.t3) won.push(sd.t3R ? T("21+3: {x}! +{n}", { x: T(SIDE_N[sd.t3R]), n: fmt(sd.t3Pay - sd.t3) }) : "");
    const hit = won.filter(Boolean); B.lastSide = { ...sd };
    if (hit.length) { api.flash(hit.join(" · "), "big"); api.snd("coin"); if (sd.ppPay + sd.t3Pay >= (sd.pp + sd.t3) * 10) api.confetti(30); }
    else api.flash(T("Side bets: no luck this time"), "");
  }
  function askIns(v) { paint(); api.say(T("Insurance? ♡")); const c = Math.floor(v.hands[0].bet / 2); api.modal(`<p class="pk-say">${esc(T("ARCIA shows an ace~ Insurance? ♡"))}</p><p>${esc(T("Costs {n} · pays 2 to 1 if ARCIA has blackjack", { n: fmt(c) }))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="bjNoIns">${esc(T("No thanks"))}</button><button type="button" class="pk-btn go" data-a="bjIns" ${c > bank() ? "disabled" : ""}>${esc(T("Insure"))}</button></div>`, true); }
  /// insurance answered (from the lounge's modal)
  async function answer(take) {
    const s0 = B && B.s; if (!s0 || s0.phase !== "ins" || B.wait) return; api.closeModal();
    const v = await step1({ op: "ins", take }); if (!v || !on) { if (B && B.s && B.s.phase === "ins") askIns(B.s); return; }
    B.s = v; if (take) api.snd("chip", 1);
    if (v.phase === "done") finish(); else { step(0.1, paint); if (take) step(0.6, () => api.flash(T("No blackjack — insurance lost"), "")); }
    paint();
  }
  /// the dealer's turn shown card by card, then every hand paid
  function finish() {
    const s = B.s;
    step(0.5, () => { const cd = vd[1]; if (cd) { cd.c = s.dealer[1]; cd.front.material.map = api.faceTex(s.dealer[1]); cd.front.material.needsUpdate = true; const p = spotD(1, 2); api.moveCard(cd, p.x, p.z, 0, true, 0.35, 0, scale()); api.snd("flip"); } });
    for (let k = 2; k < s.dealer.length; k++) { const c = s.dealer[k]; step(0.55, () => { dealD(c, true); vd.forEach((cd, j) => { const p = spotD(j, vd.length); api.moveCard(cd, p.x, p.z, 0, true, 0.25, 0, scale()); }); paintVals(); }); }
    step(0.2, () => payout());
    step(1.2, () => { paint(); });
  }
  function payout() {
    const s = B.s, n = s.hands.length, d = total(s.dealer).t, dBJ = s.dealer.length === 2 && d === 21;
    let staked = s.ins, paid = s.insPay, any = false, bj = 0;
    s.hands.forEach((h, i) => {
      staked += h.bet; paid += h.pay; const g = B.betG[i], p = betSpot(i, n);
      if (h.pay > h.bet) { any = true; api.flyChips({ x: 0, z: -2.6 }, p, h.pay - h.bet, 0.05); setTimeout(() => api.stackChips(g, h.pay), 450 * api.fast()); }
      else if (h.pay === 0) { api.flyChips(p, { x: 0, z: -3.4 }, h.bet, 0.05); api.stackChips(g, 0); }
      else api.stackChips(g, h.pay);
      if (h.res === "blackjack") bj++;
    });
    setTimeout(() => { if (!B) return; s.hands.forEach((h, i) => { if (h.pay > 0) api.flyChips(betSpot(i, n), { x: 0, z: 4.6 }, h.pay, 0.02); api.stackChips(B.betG[i], 0); }); api.snd("chip", 3); }, 1400 * api.fast());
    const net = paid - staked; B.net += net; B.hands += n;
    if (net > 0) B.streak++; else if (net < 0) B.streak = 0;
    const word = net > 0 ? `+${fmt(net)}` : net < 0 ? `-${fmt(-net)}` : "±0";
    if (bj) { api.banner(`<b>${esc(T("BLACKJACK!"))}</b><small>${word}</small>`, "jackpot"); api.confetti(36); api.snd("level"); api.buzz([40, 50, 90]); api.say(T("Blackjack! ♾️")); }
    else if (d > 21 && any) { api.banner(`<b>${esc(T("ARCIA BUSTS!"))}</b><small>${word}</small>`, "win"); api.confetti(18); api.snd("win"); api.say(T("Oops~ I busted! ♡")); }
    else if (net > 0) { api.banner(`<b>${esc(T("YOU WIN"))} ${word}</b>`, "win"); api.snd("win"); api.buzz([30]); if (B.streak >= 3) api.say(T("{n} in a row~! You're on fire ♡", { n: B.streak })); }
    else if (net === 0) api.banner(`<b>${esc(T("PUSH"))}</b><small>${esc(T("Your bet comes back"))}</small>`, "lose");
    else { api.banner(`<b>${esc(dBJ ? T("ARCIA has blackjack") : T("ARCIA wins"))}</b><small>${word}</small>`, "lose"); if (Math.random() < 0.4) api.say(T("Unlucky~ the next one's yours ♡")); }
    if (s.insPay) api.flash(T("Insurance pays {n}", { n: fmt(s.insPay) }), "big");
    if (!B.real) { const p = api.prog(); p.bjHands = (p.bjHands || 0) + n; p.bjBJ = (p.bjBJ || 0) + bj; api.save(); }
    if (bank() < tb().min) step(0.4, () => api.say(B.real ? T("Out of chips for this table~ ♡") : T("Out of chips~ Free refill below ♡")));
  }

  return {
    active: () => on,
    async start() {
      if (!root) build(); on = true; root.hidden = false; api.enterTable();
      const S = api.S(), real = !!api.signed();
      if (!B || B.real !== real) B = { real, bank: BJ.START, eng: null, table: "b1", bet: 25, last: 0, s: null, rounds: 0, hands: 0, net: 0, streak: 0, wait: false, side: { pp: false, t3: false }, betG: (B && B.betG) || [] };
      if (!B.betG.length) for (let k = 0; k < BJ.SPLITS; k++) { const g = new api.THREE.Group(); g.visible = false; S.scene.add(g); B.betG.push(g); }
      B.s = null; clearTable(); Q.length = 0; paint(); api.say(T("Place your bet~ ♡"));
      // a round you left half-played waits on the server
      if (real) { const ss = api.ctx.sess && api.ctx.sess(); try { const r = await api.ctx.post({ action: "world-bj-state", ...ss }); if (r && r.ok && r.j) { if (r.j.prog) api.onProg(r.j.prog); if (r.j.round && on) { B.table = r.j.round.table || B.table; restore(r.j.round); api.flash(T("Your round is still here"), ""); } } } catch { /* a fresh round */ } paint(); }
    },
    stop() { if (!on) return; on = false; if (root) root.hidden = true; Q.length = 0; if (B) { clearTable(); B.s = null; B.wait = false; } api.closeModal(); },
    tick() { if (!on) return; runQ(performance.now()); const b = busy(); if (b) paintVals(); else if (wasBusy) paint(); wasBusy = b; },
    answer, repaint: () => { if (on) paint(); },
    /// tests: the round's numbers and a few levers
    debug: () => ({ on, side: B ? B.side : null, sd: B && B.s ? B.s.side || null : null, real: B ? B.real : false, bank: B ? bank() : 0, bet: B ? B.bet : 0, table: B ? B.table : "", phase: B && B.s ? B.s.phase : "bet", hands: B ? B.hands : 0, q: Q.length, wait: B ? B.wait : false, cur: B && B.s ? B.s.cur : -1, n: B && B.s ? B.s.hands.length : 0, legal: B && B.s ? legal(B.s) : null, advice: B && B.s && B.s.phase === "play" ? advice(B.s) : "", net: B ? B.net : 0 }),
    press, chip: (v) => addChip(v), table: (id) => setTable(id),
  };
}
