/* global ethers, state, connectWallet, ensureArcForWrite, CONFIG */
// arc-predict-x.js — ARCIRCLE Predict × (contracts/ArcPredictBands.sol, api/_predict-x.mjs), inside the Predict tab.
// A switch above Predict: "UP / DOWN" (arc-predict.js) or "Multiplier ×". In Multiplier, each round has up to four
// bands — "down more than x%", "down", "up", "up more than x%" — each with its own pool, and the winning band splits
// the whole pot: the far bands pay a multiple of the near ones.
//   · the live round: its price to beat, the price now, the move and the band it's in
//   · the round open for bets: every band's pool and multiplier, an amount, what it would pay if that band wins
//   · the last results, your bets and Claim all
// Reads GET /api/desk?predictx=state (every 3 s while open) and ?predictx=mine&u=…; bets and claims go from the wallet
// on Arc in native USDC.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-predict");
  const sw = document.getElementById("pdx-switch"), host = document.getElementById("pdx-body"), base = document.getElementById("pd-body");
  if (!panel || !sw || !host || !base) return;
  const API = "/api/desk";
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const L3 = (o) => { const l = window.arcI18n ? window.arcI18n.get() : "en"; return esc(o[l] || o.en); };
  const lc = (a) => String(a || "").toLowerCase();
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit */ } } };
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  function px(n) { if (n == null || !isFinite(n) || n <= 0) return "—"; if (n >= 1) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 4 }); const s = n.toFixed(20).split(".")[1]; const z = s.match(/^0*/)[0].length; return z >= 4 ? `$0.0${String(z).split("").map((d) => SUB[d]).join("")}${s.slice(z, z + 4)}` : "$" + n.toPrecision(4); }
  const mv = (b) => (b == null ? "—" : (b > 0 ? "+" : b < 0 ? "−" : "") + (Math.abs(b) / 100).toFixed(2) + "%");
  const mx = (x) => (x == null || !isFinite(x) ? "—" : x >= 100 ? Math.round(x) + "×" : x >= 10 ? x.toFixed(1) + "×" : x.toFixed(2) + "×");
  const dur = (d) => (d % 3600 === 0 ? d / 3600 + "h" : d / 60 + "m");
  const left = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, "0")}`; };
  const S = { mode: ls.get("arc.pdx.mode") === "x" ? "x" : "ud", st: null, mine: null, m: Number(ls.get("arc.pdx.m") || 0), pick: null, amt: ls.get("arc.pdx.amt") || "1", busy: false, msg: "", kind: "", timer: 0, clock: 0, off: 0 };
  const now = () => Date.now() / 1000 + S.off;

  // ---------------------------------------------------------------- the switch
  function paintSwitch() {
    const live = !!(S.st && S.st.live);
    sw.innerHTML = `<div class="pdx-seg" role="radiogroup" aria-label="${T("Round type")}">
      <button type="button" role="radio" aria-checked="${S.mode === "ud"}" data-pdx-mode="ud"><b>${L3({ en: "UP / DOWN", ko: "UP / DOWN", zh: "涨 / 跌" })}</b><small>${T("Two sides, even odds")}</small></button>
      <button type="button" role="radio" aria-checked="${S.mode === "x"}" data-pdx-mode="x"${live ? "" : ' aria-disabled="true"'}><b>${L3({ en: "Multiplier ×", ko: "배수 ×", zh: "倍数 ×" })}</b><small>${T(live ? "Four bands, bigger moves pay more" : "Four bands · coming soon")}</small></button></div>`;
  }
  function setMode(m) {
    if (m === "x" && !(S.st && S.st.live)) return;
    S.mode = m; ls.set("arc.pdx.mode", m);
    host.hidden = m !== "x"; base.hidden = m === "x";
    panel.classList.toggle("pdx-on", m === "x");
    paintSwitch();
    if (m === "x") { paint(); loadMine(); }
  }

  // ---------------------------------------------------------------- reads
  async function load() {
    try {
      const r = await fetch(`${API}?predictx=state`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j) { S.st = j; if (j.now) S.off = j.now - Date.now() / 1000; }
    } catch { /* keep */ }
    if (!(S.st && S.st.live) && S.mode === "x") setMode("ud");
    else if (S.mode === "x" && host.hidden) setMode("x");
    paintSwitch();
    if (S.mode === "x") paint();
  }
  async function loadMine() {
    if (!me() || !(S.st && S.st.live)) { S.mine = null; return; }
    try { const r = await fetch(`${API}?predictx=mine&u=${me()}`, { cache: "no-store" }); S.mine = r.ok ? await r.json() : null; } catch { /* keep */ }
    if (S.mode === "x") paint();
  }

  // ---------------------------------------------------------------- the page
  const mk = () => { const ms = (S.st && S.st.markets) || []; return ms.find((m) => m.id === S.m) || ms[0] || null; };
  const amount = () => { const v = Number(String(S.amt || "").replace(/,/g, "")); return v > 0 ? v : 0; };
  const tone = (i, n) => (n <= 1 ? 0.5 : i / (n - 1)); // 0 = the lowest band (red) → 1 = the highest (green)
  function cardHtml(m) {
    const L = m.live, B = m.betting, n = m.bands, fee = S.st.feeBps / 10000;
    const a = amount();
    const would = (i) => { const pot = B.pot + a, mine = B.pools[i] + a; return mine > 0 ? (a * pot * (1 - fee)) / mine : null; };
    const ladder = m.labels.map((lab, i) => {
      const on = S.pick === i + 1, cur = L.band === i;
      // an empty band: what it would pay the first bet of this amount (or $1)
      const ifMine = would(i), multNow = B.mult[i] || (() => { const x = a || 1, pot = B.pot + x; return (pot * (1 - fee)) / x; })();
      return `<button type="button" class="pdx-band${on ? " on" : ""}${cur ? " cur" : ""}" style="--t:${tone(i, n)}" data-pdx-pick="${i + 1}" aria-pressed="${on}">
        <span class="pdx-lab" data-no-i18n>${esc(lab)}</span>
        <b class="pdx-mult" data-no-i18n>${B.mult[i] ? "" : "≈ "}${mx(multNow)}</b>
        <small data-no-i18n>${usd(B.pools[i])}</small>
        ${on && a ? `<em data-no-i18n>${T("pays")} ≈ ${usd(ifMine)}</em>` : ""}
      </button>`;
    }).join("");
    const t = now(), toLock = B.locksAt - t;
    const sel = S.pick ? m.labels[S.pick - 1] : null;
    return `<div class="pdx-card">
      <div class="pdx-live">
        <div><small>${T("Live round")}</small><b data-no-i18n>${px(L.open)}</b><span>${T("price to beat")}</span></div>
        <div><small>${T("Now")}</small><b data-no-i18n>${px(m.price)}</b><span class="pdx-mv ${L.moveBps > 0 ? "up" : L.moveBps < 0 ? "dn" : ""}" data-no-i18n>${mv(L.moveBps)}</span></div>
        <div><small>${T("Ends in")}</small><b data-pdx-t="${L.endsAt}" data-no-i18n>${left(L.endsAt - t)}</b><span data-no-i18n>${usd(L.pot)} ${T("pot")}</span></div>
      </div>
      <div class="pdx-meter" aria-hidden="true">${m.labels.map((_, i) => `<i class="${L.band === i ? "cur" : ""}" style="--t:${tone(i, n)}"></i>`).join("")}</div>
      <div class="pdx-next"><h4>${T("Next round")} <small>${T("bets close in")} <b data-pdx-t="${B.locksAt}" data-no-i18n>${left(toLock)}</b> · <span data-no-i18n>${usd(B.pot)}</span> ${T("pot")}</small></h4>
        <p class="pdx-hint">${T("Pick where the price ends against its price to beat. The multiplier is what $1 returns if that band wins now — it moves as bets come in.")}</p>
        <div class="pdx-ladder" role="group" aria-label="${T("Bands")}">${ladder}</div>
        <div class="pdx-bet"><label class="pdx-in"><input id="pdx-amt" type="text" inputmode="decimal" autocomplete="off" value="${esc(S.amt)}"><em data-no-i18n>USDC</em></label>
          <div class="pdx-chips">${["0.5", "1", "2", "5"].map((v) => `<button type="button" data-pdx-amt="${v}" data-no-i18n>${v}</button>`).join("")}</div>
          <button type="button" class="bp-btn-primary pdx-go" data-pdx-go${S.busy || !sel || S.st.paused ? " disabled" : ""}>${S.busy ? T("Confirm in your wallet…") : sel ? `${T("Bet")} ${esc(String(a))} USDC · <span data-no-i18n>${esc(sel)}</span>` : T("Pick a band")}</button></div>
        <p class="pdx-msg ${esc(S.kind)}" id="pdx-msg" role="status">${esc(S.msg)}</p>
        <small class="pdx-small">${T("One band per wallet per round")} · ${usd(S.st.minBet)}–${usd(S.st.maxBet)} · ${T("fee")} ${S.st.feeBps / 100}% ${T("of a pot with a winner")} · ${T("refund if nobody — or everybody — picked the winning band")}</small>
      </div>
      ${m.last.length ? `<div class="pdx-last"><small>${T("Last rounds")}</small>${m.last.map((x) => `<span class="${x.result === "refund" ? "rf" : ""}" style="--t:${x.result === "refund" ? 0.5 : tone(x.result - 1, n)}" title="${esc(mv(x.moveBps))}" data-no-i18n>${x.result === "refund" ? "↺" : esc(m.labels[x.result - 1])}</span>`).join("")}</div>` : ""}
    </div>`;
  }
  function mineHtml() {
    const M = S.mine;
    if (!me()) return `<div class="pdx-mine"><button type="button" class="bp-btn-ghost" data-pdx-connect>${T("Connect wallet")}</button></div>`;
    if (!M || !M.bets || !M.bets.length) return "";
    return `<div class="pdx-mine"><div class="pdx-mine-h"><h4>${T("Your bets")}</h4>${M.claimIds.length ? `<button type="button" class="bp-btn-primary sm" data-pdx-claim${S.busy ? " disabled" : ""}>${T("Claim all")} · ${usd(M.claimable)}</button>` : ""}</div>
      <ul>${M.bets.slice(0, 12).map((b) => `<li><span data-no-i18n>$${esc(b.sym)} ${dur(b.duration)}</span><span data-no-i18n>${esc(b.label)}</span><b data-no-i18n>${usd(b.amount)}</b><em class="${b.result === "open" ? "" : b.claimable > 0 || (b.claimed && b.result !== "refund" && b.result === b.pick) ? "up" : b.result === "refund" ? "" : "dn"}">${b.result === "open" ? T("Running") : b.result === "refund" ? T("Refund") : b.result === b.pick ? (b.claimable > 0 ? `${T("Won")} ${usd(b.claimable)}` : T("Won · claimed")) : T("Lost")}</em></li>`).join("")}</ul></div>`;
  }
  function paint() {
    if (S.mode !== "x" || !S.st || !S.st.live) return;
    const ms = S.st.markets || [];
    if (!ms.length) { host.innerHTML = `<div class="pdx-wrap"><p class="pdx-none">${T("No multiplier markets yet — the keeper opens $ARCIRCLE 5m, 15m and 1h shortly.")}</p></div>`; return; }
    const m = mk();
    const keep = document.activeElement && document.activeElement.id === "pdx-amt";
    host.innerHTML = `<div class="pdx-wrap"><div class="pdx-mkts">${ms.map((x) => `<button type="button" data-pdx-m="${x.id}" aria-pressed="${x.id === m.id}"><b data-no-i18n>$${esc(x.sym)}</b><span data-no-i18n>${dur(x.duration)}</span></button>`).join("")}</div>${cardHtml(m)}${mineHtml()}</div>`;
    if (keep) { const i = $("pdx-amt"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  const say = (msg, kind) => { S.msg = msg; S.kind = kind || ""; const el = $("pdx-msg"); if (el) { el.textContent = msg; el.className = "pdx-msg " + S.kind; } };

  // ---------------------------------------------------------------- writes
  const ABI = ["function bet(uint256 m, uint64 epoch, uint8 pick, address ref) payable", "function claim(uint256[] ids) returns (uint256)",
    ...["NotOpen", "NoPriceToBeat", "OverMaxBet", "OverMaxSide", "OtherSide", "TooSmall", "IsPaused", "NothingToClaim", "BadBand", "BadMarket", "Reentrant", "TransferFailed"].map((e) => `error ${e}()`)];
  const errText = (e) => {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    let name = (e && e.revert && e.revert.name) || "";
    const data = e && (e.data || (e.info && e.info.error && (e.info.error.data && (e.info.error.data.data || e.info.error.data))) || (e.error && e.error.data));
    if (!name && typeof data === "string" && data.length >= 10) { try { const p = new ethers.Interface(ABI).parseError(data); if (p) name = p.name; } catch { /* not ours */ } }
    const s = name + " " + String((e && (e.shortMessage || e.reason || e.message)) || "");
    const map = { NotOpen: "Bets for this round are closed.", NoPriceToBeat: "This round has no price to beat — bet on the next one.", OverMaxBet: "That's over the most a wallet can put in one round.", OverMaxSide: "This band of the round is full.", OtherSide: "You already picked another band in this round.", TooSmall: "That's under the smallest bet.", IsPaused: "New bets are paused.", NothingToClaim: "Nothing to claim right now.", BadBand: "Pick a band.", "insufficient funds": "Not enough USDC for this and its gas." };
    for (const k of Object.keys(map)) if (s.includes(k)) return tr(map[k]);
    return (s || tr("The transaction didn't go through.")).slice(0, 180);
  };
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  async function placeBet() {
    const m = mk(), a = amount();
    if (!m || !S.pick || S.busy) return;
    if (a < S.st.minBet || a > S.st.maxBet) { say(tr("Between {a} and {b} USDC.").replace("{a}", S.st.minBet).replace("{b}", S.st.maxBet), "bad"); return; }
    S.busy = true; paint(); say("");
    try {
      const sg = await signer();
      const c = new ethers.Contract(S.st.address, ABI, sg);
      const ref = ls.get("arcircle.predict.ref") || ethers.ZeroAddress;
      const tx = await c.bet(m.id, m.betting.epoch, S.pick, /^0x[0-9a-fA-F]{40}$/.test(ref) && lc(ref) !== me() ? ref : ethers.ZeroAddress, { value: ethers.parseEther(String(a)) });
      say(tr("Placing…"));
      await tx.wait();
      say(tr("Bet placed — it settles when the round ends."), "ok");
      if (!reduce()) { const b = host.querySelector(`[data-pdx-pick="${S.pick}"]`); if (b) { b.classList.remove("pdx-pop"); void b.offsetWidth; b.classList.add("pdx-pop"); } }
    } catch (e) { say(errText(e), "bad"); }
    S.busy = false; await load(); await loadMine();
  }
  async function claimAll() {
    const ids = (S.mine && S.mine.claimIds) || [];
    if (!ids.length || S.busy) return;
    S.busy = true; paint();
    try {
      const sg = await signer();
      const tx = await new ethers.Contract(S.st.address, ABI, sg).claim(ids);
      await tx.wait();
      say(tr("Claimed — the USDC is in your wallet."), "ok");
      if (typeof window.arcConfetti === "function" && !reduce()) window.arcConfetti();
    } catch (e) { say(errText(e), "bad"); }
    S.busy = false; await loadMine();
  }

  // ---------------------------------------------------------------- wiring
  sw.addEventListener("click", (e) => { const b = e.target.closest("[data-pdx-mode]"); if (b && b.getAttribute("aria-disabled") !== "true") setMode(b.dataset.pdxMode); });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.pdxM != null) { S.m = Number(b.dataset.pdxM); ls.set("arc.pdx.m", String(S.m)); S.pick = null; paint(); return; }
    if (b.dataset.pdxPick) { S.pick = Number(b.dataset.pdxPick) === S.pick ? null : Number(b.dataset.pdxPick); paint(); return; }
    if (b.dataset.pdxAmt) { S.amt = b.dataset.pdxAmt; ls.set("arc.pdx.amt", S.amt); paint(); return; }
    if (b.hasAttribute("data-pdx-go")) { placeBet(); return; }
    if (b.hasAttribute("data-pdx-claim")) { claimAll(); return; }
    if (b.hasAttribute("data-pdx-connect") && typeof connectWallet === "function") connectWallet().then(loadMine);
  });
  host.addEventListener("input", (e) => { if (e.target.id === "pdx-amt") { S.amt = e.target.value; ls.set("arc.pdx.amt", S.amt); clearTimeout(S.it); S.it = setTimeout(paint, 350); } });
  function tick() { host.querySelectorAll("[data-pdx-t]").forEach((el) => { el.textContent = left(Number(el.dataset.pdxT) - now()); }); }
  let acct = me();
  function show() {
    load();
    clearInterval(S.timer); clearInterval(S.clock);
    S.timer = setInterval(() => { if (document.hidden || !panel.classList.contains("active")) return; if (me() !== acct) { acct = me(); loadMine(); } if (document.activeElement && document.activeElement.id === "pdx-amt") return; load(); if (S.mode === "x" && Math.random() < 0.2) loadMine(); }, 3000);
    S.clock = setInterval(tick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "predict") show(); else { clearInterval(S.timer); clearInterval(S.clock); } });
  document.addEventListener("arc:lang", () => { paintSwitch(); paint(); });
  paintSwitch();
  if (panel.classList.contains("active")) show();
  window.arcPredictX = { state: () => S.st, load, setMode, _S: S };
})();
