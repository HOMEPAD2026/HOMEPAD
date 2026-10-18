// world-blackjack.js — blackjack at ARCIA POKER LOUNGE's table (world-poker.js hands it the scene, the cards and the
// chips): you against ARCIA, who deals from a 6-deck shoe. Free 1,000 chips a session, bets 10–500; hit, stand,
// double, split, surrender, insurance — the rules and the payouts are world-blackjack-engine.js. Chips are play money.
// With a wallet, every 10 hands are counted by the server (api/_world-poker.mjs world-bj-end): poker XP and the daily
// mission "play 30 blackjack hands" (its ARCL never depends on winning). ARCIA's tip (the basic strategy) shows under
// your hand while the hint is on (Profile → Settings).
//
// api: { THREE, T, esc, snd, say, banner, flash, confetti, buzz, tween, ease, moveCard, cardFrom, faceTex, toScreen,
//        stackChips, flyChips, S(), cardAt(k), ui(), prog(), save(), ctx, signed(), fast(), scaleK(), modal(html, arcia),
//        closeModal(), enterTable(), phone(), onProg(prog) }
import { BJ, deal, insure, act, legal, total, isBJ, advice } from "./world-blackjack-engine.js";

const fmt = (n) => Math.round(n || 0).toLocaleString("en-US");
const seoulDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const CHIPC = { 10: "#e8e8f0", 25: "#1fa85a", 50: "#e0283c", 100: "#22222e", 250: "#8a4bff", 500: "#ffc83a" };
const MOVE = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };

export function makeBlackjack(api) {
  const { T, esc } = api;
  let on = false, root = null, B = null, Q = [], qAt = 0, vh = [], vd = [], used = 0, run = null, wasBusy = false;

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
      <div class="bj-bar"><div class="bj-bet"><div class="bj-chips">${BJ.CHIPS.map((v) => `<button type="button" data-chip="${v}" style="--c:${CHIPC[v]}"><b>${v}</b></button>`).join("")}</div>
        <div class="bj-row"><button type="button" class="bj-b" data-a="clear">${esc(T("Clear"))}</button><button type="button" class="bj-b" data-a="rebet">${esc(T("Rebet"))}</button><button type="button" class="bj-b go" data-a="deal"><b>${esc(T("DEAL"))}</b><small></small></button></div>
        <button type="button" class="bj-b refill" data-a="refill" hidden>${esc(T("Free refill to {n}", { n: fmt(BJ.START) }))}</button></div>
      <div class="bj-play" hidden><button type="button" class="h" data-a="hit"><b>${esc(T("HIT"))}</b></button><button type="button" class="s" data-a="stand"><b>${esc(T("STAND"))}</b></button><button type="button" class="d" data-a="double"><b>${esc(T("DOUBLE"))}</b></button><button type="button" class="p" data-a="split"><b>${esc(T("SPLIT"))}</b></button><button type="button" class="r" data-a="surrender"><b>${esc(T("SURRENDER"))}</b></button></div></div>`;
    ui.root.appendChild(root);
    root.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || !on || b.disabled) return; if (b.dataset.chip) { addChip(+b.dataset.chip); return; } press(b.dataset.a); });
  }
  const q = (x) => root.querySelector(x);
  function paint() {
    if (!root || !B) return; const s = B.s, ui = api.ui(), betting = !s || s.phase === "done";
    ui.title.textContent = T("Blackjack · vs ARCIA"); ui.sub.textContent = T("Bank {b} · Bet {n}", { b: fmt(B.bank), n: fmt(betting ? B.bet : s.hands.reduce((a, h) => a + h.bet, 0)) });
    const showBet = betting && !busy(), showPlay = s && s.phase === "play" && !busy();
    q(".bj-bet").hidden = !showBet; q(".bj-play").hidden = !showPlay;
    if (showBet) {
      q('[data-a="deal"] small').textContent = fmt(B.bet); q('[data-a="deal"]').disabled = B.bet < BJ.MIN || B.bet > B.bank; q('[data-a="rebet"]').disabled = !B.last || B.last > B.bank; q('[data-a="clear"]').disabled = !B.bet;
      root.querySelectorAll("[data-chip]").forEach((b) => { b.disabled = B.bet + +b.dataset.chip > Math.min(BJ.MAX, B.bank); });
      q('[data-a="refill"]').hidden = B.bank >= BJ.MIN;
    }
    if (showPlay) { const L = legal(s); for (const k of ["double", "split", "surrender"]) q(`[data-a="${k}"]`).hidden = !L[k]; }
    // ARCIA's tip
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

  // ---------------- a round ----------------
  function addChip(v) { if (!B || busy() || (B.s && B.s.phase !== "done")) return; if (B.bet + v > Math.min(BJ.MAX, B.bank)) { api.snd("bad"); return; } B.bet += v; api.snd("chip", 1); paint(); }
  function clearTable() { for (const row of vh) for (const cd of row) cd.o.visible = false; for (const cd of vd) cd.o.visible = false; vh = []; vd = []; used = 0; B.betG.forEach((g) => api.stackChips(g, 0)); }
  function press(a) {
    if (!B || busy()) return;
    if (a === "clear") { B.bet = 0; api.snd("tap"); paint(); return; }
    if (a === "rebet") { if (B.last && B.last <= B.bank) { B.bet = Math.min(B.last, BJ.MAX); api.snd("chip", 2); paint(); } return; }
    if (a === "refill") { B.bank = BJ.START; B.bet = Math.min(B.bet || 25, B.bank); api.snd("coin"); api.flash(T("Refilled: {n} chips", { n: fmt(BJ.START) }), "big"); paint(); return; }
    if (a === "deal") return start();
    const s = B.s; if (!s || s.phase !== "play") return;
    const h = s.cur, before = s.hands.map((x) => x.cards.length);
    if (a === "double" || a === "split") { const L = legal(s); if (!L[a]) return; }
    if (!act(s, a)) { api.snd("bad"); return; }
    B.bank = s.bank; api.snd(a === "stand" ? "knock" : a === "double" || a === "split" ? "chip" : "tap");
    if (a === "split") { const moved = vh[h].pop(); vh.splice(h + 1, 0, [moved]); step(0.3, () => layout(0.3)); step(0.3, () => { dealTo(h, s.hands[h].cards[1]); }); step(0.35, () => { dealTo(h + 1, s.hands[h + 1].cards[1]); }); }
    else s.hands.forEach((x, i) => { for (let k = before[i] || 0; k < x.cards.length; k++) { const c = x.cards[k], hi = i; step(0.35, () => dealTo(hi, c)); } });
    if (a === "double") step(0.1, () => layout(0.2));
    if (a === "surrender") step(0.2, () => api.flash(T("Surrendered: half back"), ""));
    if (s.phase === "done") finish(); else step(0, paint);
    paint();
  }
  function start() {
    if (!B || busy()) return; if (B.bet < BJ.MIN || B.bet > B.bank) { api.snd("bad"); return; }
    const s = deal(B.s, { bank: B.bank, bet: B.bet, seed: (Math.random() * 2 ** 31) | 0 }); if (!s) { api.snd("bad"); return; }
    B.last = B.bet; B.s = s; B.bank = s.bank; clearTable(); api.closeModal();
    if (s.fresh && B.rounds) api.flash(T("A fresh shoe"), "");
    if (s.fresh) api.snd("shuffle");
    B.rounds++;
    api.stackChips(B.betG[0], s.hands[0].bet); B.betG[0].position.set(0, 0.03, 2.3); api.snd("chip", 2);
    const h0 = s.hands[0];
    step(0.28, () => dealTo(0, h0.cards[0])); step(0.28, () => dealD(s.dealer[0], true)); step(0.28, () => dealTo(0, h0.cards[1])); step(0.45, () => dealD(s.dealer[1], false));
    if (s.phase === "ins") step(0, () => { paint(); api.say(T("Insurance? ♡")); api.modal(`<p class="pk-say">${esc(T("ARCIA shows an ace~ Insurance? ♡"))}</p><p>${esc(T("Costs {n} · pays 2 to 1 if ARCIA has blackjack", { n: fmt(Math.floor(s.bet / 2)) }))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="bjNoIns">${esc(T("No thanks"))}</button><button type="button" class="pk-btn go" data-a="bjIns" ${Math.floor(s.bet / 2) > s.bank ? "disabled" : ""}>${esc(T("Insure"))}</button></div>`, true); });
    else if (s.phase === "done") finish();
    else step(0, () => { paint(); if (isBJ(h0)) api.say(T("Blackjack! ♾️")); });
    paint();
  }
  /// insurance answered (from the lounge's modal)
  function answer(take) {
    const s = B && B.s; if (!s || s.phase !== "ins") return; api.closeModal();
    if (!insure(s, take)) { api.snd("bad"); return; }
    B.bank = s.bank; if (take) api.snd("chip", 1);
    if (s.phase === "done") finish(); else { step(0.1, paint); if (take) step(0.6, () => api.flash(T("No blackjack — insurance lost"), "")); }
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
    const net = paid - staked; B.net += net; B.hands += n; B.bj += bj; B.bank = s.bank; B.sinceRun += n;
    if (net > 0) B.streak++; else if (net < 0) B.streak = 0;
    B.bestRound = Math.max(B.bestRound, net);
    const word = net > 0 ? `+${fmt(net)}` : net < 0 ? `-${fmt(-net)}` : "±0";
    if (bj) { api.banner(`<b>${esc(T("BLACKJACK!"))}</b><small>${word}</small>`, "jackpot"); api.confetti(36); api.snd("level"); api.buzz([40, 50, 90]); api.say(T("Blackjack! ♾️")); }
    else if (d > 21 && any) { api.banner(`<b>${esc(T("ARCIA BUSTS!"))}</b><small>${word}</small>`, "win"); api.confetti(18); api.snd("win"); api.say(T("Oops~ I busted! ♡")); }
    else if (net > 0) { api.banner(`<b>${esc(T("YOU WIN"))} ${word}</b>`, "win"); api.snd("win"); api.buzz([30]); if (B.streak >= 3) api.say(T("{n} in a row~! You're on fire ♡", { n: B.streak })); }
    else if (net === 0) api.banner(`<b>${esc(T("PUSH"))}</b><small>${esc(T("Your bet comes back"))}</small>`, "lose");
    else { api.banner(`<b>${esc(dBJ ? T("ARCIA has blackjack") : T("ARCIA wins"))}</b><small>${word}</small>`, "lose"); if (Math.random() < 0.4) api.say(T("Unlucky~ the next one's yours ♡")); }
    if (s.insPay) api.flash(T("Insurance pays {n}", { n: fmt(s.insPay) }), "big");
    // this device's record; a wallet's hands go to the server every 10
    const p = api.prog(), day = seoulDay(); if (p.day !== day) { p.day = day; p.xpToday = 0; }
    const xp = Math.max(0, Math.min(n * BJ.XP_HAND, 500 - (p.xpToday || 0))); p.xp = (p.xp || 0) + xp; p.xpToday = (p.xpToday || 0) + xp; p.bjHands = (p.bjHands || 0) + n; p.bjBJ = (p.bjBJ || 0) + bj; api.save();
    if (B.sinceRun >= 10) report(false);
    if (B.bank < BJ.MIN) step(0.4, () => api.say(T("Out of chips~ Free refill below ♡")));
  }

  // ---------------- the server's count (a wallet) ----------------
  function newRun() {
    const ss = api.ctx.sess && api.ctx.sess();
    run = ss && api.ctx.post ? api.ctx.post({ action: "world-bj-start", ...ss }).then((r) => (r && r.ok && r.j && r.j.runId ? r.j.runId : null)).catch(() => null) : null;
    // (a wallet whose hands can't be counted hears it once, rather than finding the mission short later)
    if (run) run.then((id) => { if (!id && B && !B.warned) { B.warned = true; api.ctx.toast(esc(T("Blackjack hands can't be counted right now — the mission waits"))); } });
  }
  async function report(last) {
    if (!run || !B || B.reporting) return; const r0 = run, hands = Math.min(60, B.sinceRun), net = B.net - B.netRun, bj = B.bj - B.bjRun; if (hands < 1) return;
    B.reporting = true;
    const id = await r0; if (!id) { B.reporting = false; if (!last) newRun(); return; }
    let r = null; try { r = await api.ctx.post({ action: "world-bj-end", ...api.ctx.sess(), runId: id, hands, net, bj }); } catch { r = null; }
    B.reporting = false;
    if (r && r.ok && r.j) {
      if (B) { B.sinceRun -= hands; B.netRun += net; B.bjRun += bj; }
      if (r.j.credited > 0) { api.ctx.toast(`<b>+${fmt(r.j.credited)} ARCL</b> · ${esc(T("Mission complete: 30 blackjack hands"))}`); api.snd("coin"); if (api.ctx.refresh) api.ctx.refresh(); api.confetti(30); }
      if (api.onProg) api.onProg(r.j.prog);
      if (!last) newRun();
    } else if (r && r.status === 409 && !last) newRun(); // (the run is gone: count from a fresh one; a "too fast" keeps counting on this one)
  }

  return {
    active: () => on,
    start() {
      if (!root) build(); on = true; root.hidden = false; api.enterTable();
      const S = api.S(); if (!B) B = { bank: BJ.START, bet: 25, last: 0, s: null, rounds: 0, hands: 0, net: 0, bj: 0, streak: 0, bestRound: 0, sinceRun: 0, netRun: 0, bjRun: 0, betG: [] };
      if (!B.betG.length) for (let k = 0; k < BJ.SPLITS; k++) { const g = new api.THREE.Group(); g.visible = false; S.scene.add(g); B.betG.push(g); }
      B.s = null; clearTable(); Q.length = 0; B.sinceRun = 0; B.netRun = B.net; B.bjRun = B.bj; newRun(); paint(); api.say(T("Place your bet~ ♡"));
    },
    /// out of blackjack (to the lounge, or the lounge closing): the hands so far go to the server
    stop() { if (!on) return; on = false; if (root) root.hidden = true; Q.length = 0; if (B) { clearTable(); report(true); B.s = null; } api.closeModal(); },
    tick() { if (!on) return; runQ(performance.now()); const b = busy(); if (b) paintVals(); else if (wasBusy) paint(); wasBusy = b; },
    answer,
    /// tests: the round's numbers and a few levers
    debug: () => ({ on, bank: B ? B.bank : 0, bet: B ? B.bet : 0, phase: B && B.s ? B.s.phase : "bet", hands: B ? B.hands : 0, q: Q.length, cur: B && B.s ? B.s.cur : -1, n: B && B.s ? B.s.hands.length : 0, legal: B && B.s ? legal(B.s) : null, advice: B && B.s && B.s.phase === "play" ? advice(B.s) : "", net: B ? B.net : 0, since: B ? B.sinceRun : 0 }),
    press, chip: addChip,
  };
}
