/* global state, connectWallet */
// arc-paper.js — ARCIRCLE Paper Trading (arcpad.html#paper; api/_paper.mjs): a weekly event with play money on live
// prices. Every wallet that joins starts the week with $10,000 and trades BTC, ETH and SOL long or short, up to 1000x
// (SOL 500x), filled at the mid price (no slippage, no funding); the board ranks everyone by account value, and each finished week keeps its top 10.
//   · join: one signed message a week (no gas) → a session token kept in this browser
//   · the ticket: long / short, margin (or a share of cash), leverage, optional take-profit and stop-loss — with the
//     size, liquidation price and fee before it's placed
//   · positions with live PnL and ROE, close one or all; the last trades; the board with your rank; past weeks
// Reads GET /api/desk?paper=state&u=…, every 3 s while the tab is open. Writes POST /api/desk {action:"paper"…}.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-paper");
  const host = document.getElementById("pp-body");
  if (!panel || !host) return;
  const API = "/api/desk";
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  /// short labels with their own translations (one-word keys would change other pages in the shared dictionary)
  const L3 = (o) => { const l = window.arcI18n ? window.arcI18n.get() : "en"; return esc(o[l] || o.en); };
  const lc = (a) => String(a || "").toLowerCase();
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sgn = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (n) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2) + "%");
  const pxS = (n) => (n == null || !isFinite(n) ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: n >= 1000 ? 1 : 2, maximumFractionDigits: n >= 1000 ? 1 : n >= 10 ? 2 : 4 }));
  const left = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit */ } } };
  const tokKey = (wk) => `arc.paper.tok.${me()}.${wk}`;
  const S = { st: null, m: ls.get("arc.paper.m") || "BTC", side: "long", lev: 10, busy: false, msg: "", kind: "", hist: {}, timer: 0, clock: 0, booted: false, last: {}, view: "positions" };
  const LEVS = [2, 10, 50, 100, 500, 1000];

  // ---------------------------------------------------------------- reads
  async function load() {
    try {
      const r = await fetch(`${API}?paper=state${me() ? `&u=${me()}` : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && j.wk) {
        S.st = j;
        const t = Date.now();
        for (const k of Object.keys(j.markets || {})) { const p = j.px && j.px[k]; if (p > 0) { const h = (S.hist[k] = S.hist[k] || []); if (!h.length || h[h.length - 1][1] !== p || t - h[h.length - 1][0] > 15000) h.push([t, p]); while (h.length > 240) h.shift(); } }
      }
    } catch { /* keep the last read */ }
    paint();
  }
  const token = () => (S.st ? ls.get(tokKey(S.st.wk)) : null);
  const joined = () => !!(S.st && S.st.me && token());

  // ---------------------------------------------------------------- writes
  async function post(body) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(tr(j.error || `HTTP ${r.status}`)); e.status = r.status; throw e; }
    return j;
  }
  const say = (msg, kind) => { S.msg = msg || ""; S.kind = kind || ""; const el = $("pp-msg"); if (el) { el.className = "pp-msg " + S.kind; el.textContent = S.msg; } };
  async function join() {
    if (S.busy) return;
    if (!me() && typeof connectWallet === "function") await connectWallet();
    if (!me()) { say(tr("Connect a wallet to join."), "bad"); return; }
    S.busy = true; paint();
    try {
      const sg = typeof state !== "undefined" && state.signer;
      if (!sg) throw new Error(tr("Connect a wallet first."));
      const wk = S.st.wk, at = Math.floor(Date.now() / 1000);
      const msg = `ARCIRCLE Paper Trading\nWallet: ${me()}\nWeek: ${wk}\nIssued: ${at}\n\nPlay money only — signing costs nothing and sends no transaction.`;
      say(tr("Sign in your wallet — no gas, no transaction…"));
      const sig = await sg.signMessage(msg);
      const j = await post({ action: "paper-join", addr: me(), msg, sig });
      ls.set(tokKey(j.wk), j.tok);
      say(tr(j.isNew ? "You're in — $10,000 of play money for this week." : "Signed in on this device."), "ok");
      if (j.isNew && typeof window.arcConfetti === "function" && !reduce()) window.arcConfetti();
    } catch (e) { say(e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("Cancelled in your wallet.") : String((e && e.message) || e).slice(0, 180), "bad"); }
    S.busy = false; await load();
  }
  async function trade(op, extra) {
    if (S.busy) return;
    if (!token()) { say(tr("Join this week's event first."), "bad"); return; }
    S.busy = true; paint();
    try {
      const j = await post({ action: "paper", addr: me(), tok: token(), op, ...extra });
      if (S.st) { S.st.me = { ...j.me, rank: S.st.me ? S.st.me.rank : 0 }; S.st.px = j.px; }
      if (op === "open") { say(tr("Position opened."), "ok"); flash("pp-pos"); }
      else if (op === "close" || op === "closeall") { const h = j.me.hist && j.me.hist[0]; say(h ? `${tr("Closed")}: ${sgn(h.pnl)}` : tr("Closed."), h && h.pnl < 0 ? "" : "ok"); }
      else if (op === "tpsl") say(tr("Take-profit / stop-loss saved."), "ok");
    } catch (e) {
      if (e.status === 401) ls.set(tokKey(S.st.wk), "");
      say(String((e && e.message) || e).slice(0, 180), "bad");
    }
    S.busy = false; await load();
  }
  function flash(id) { if (reduce()) return; const el = $(id); if (!el) return; el.classList.remove("pp-flash"); void el.offsetWidth; el.classList.add("pp-flash"); }

  // ---------------------------------------------------------------- the ticket
  const cash = () => (S.st && S.st.me ? S.st.me.cash : S.st ? S.st.rules.start : 10000);
  const mkt = () => (S.st && S.st.markets[S.m]) || { name: S.m, max: 100 };
  const price = () => (S.st && S.st.px ? S.st.px[S.m] : null);
  const margin = () => { const v = Number(String(($("pp-mg") || {}).value || "").replace(/,/g, "")); return v > 0 ? v : 0; };
  function preview() {
    const el = $("pp-pre"); if (!el || !S.st) return;
    const mg = margin(), lv = Math.min(S.lev, mkt().max), p = price();
    if (!mg || !p) { el.innerHTML = `<div><span>${T("Size")}</span><b>—</b></div><div><span>${T("Liquidation")}</span><b>—</b></div><div><span>${T("Fee")}</span><b>—</b></div>`; return; }
    const R = S.st.rules, sz = mg * lv, s = S.side === "long" ? 1 : -1, mm = Math.min((sz * R.mmBps) / 10000, mg * (R.mmCap || 1));
    const liq = p * (1 - s * (mg - mm) / sz), fee = Math.min((sz * R.feeBps) / 10000, (mg * (R.feeCapBps || 1e9)) / 10000);
    el.innerHTML = `<div><span>${T("Size")}</span><b data-no-i18n>${usd(sz, 0)}</b></div><div><span>${T("Liquidation")}</span><b data-no-i18n class="pp-liq">${pxS(liq)}</b></div><div><span>${T("Fee")}</span><b data-no-i18n>${usd(fee)}</b></div>`;
    const go = $("pp-go");
    if (go && !S.busy) go.textContent = joined() ? `${tr(S.side === "long" ? "Open long" : "Open short")} ${S.m} · ${lv}x` : tr("Join to trade");
  }
  function ticketHtml() {
    const M = mkt(), mx = M.max;
    if (S.lev > mx) S.lev = mx;
    return `<div class="pp-ticket ${S.side}" id="pp-ticket">
      <div class="pp-sides" role="radiogroup" aria-label="${T("Direction")}"><button type="button" role="radio" aria-checked="${S.side === "long"}" data-pp-side="long">${L3({ en: "Long", ko: "롱", zh: "做多" })}</button><button type="button" role="radio" aria-checked="${S.side === "short"}" data-pp-side="short">${L3({ en: "Short", ko: "숏", zh: "做空" })}</button></div>
      <label class="pp-in"><span>${T("Margin")}</span><input id="pp-mg" type="text" inputmode="decimal" autocomplete="off" placeholder="100" value="${esc(ls.get("arc.paper.mg") || "100")}"><em data-no-i18n>USD</em></label>
      <div class="pp-chips">${[10, 25, 50, 100].map((v) => `<button type="button" data-pp-pct="${v}" data-no-i18n>${v}%</button>`).join("")}</div>
      <div class="pp-lev"><div class="pp-lev-h"><span>${T("Leverage")}</span><b id="pp-lev-v" data-no-i18n>${S.lev}x</b></div>
        <input id="pp-lev" type="range" min="1" max="${mx}" step="1" value="${S.lev}" aria-label="${T("Leverage")}">
        <div class="pp-chips">${LEVS.filter((v) => v <= mx).map((v) => `<button type="button" data-pp-lev="${v}" class="${v === S.lev ? "on" : ""}" data-no-i18n>${v}x</button>`).join("")}</div></div>
      <details class="pp-tpsl"><summary>${T("Take-profit / stop-loss")}</summary>
        <div class="pp-two"><label class="pp-in sm"><span>${T("Take-profit")}</span><input id="pp-tp" type="text" inputmode="decimal" autocomplete="off" placeholder="${T("price")}"></label>
        <label class="pp-in sm"><span>${T("Stop-loss")}</span><input id="pp-sl" type="text" inputmode="decimal" autocomplete="off" placeholder="${T("price")}"></label></div></details>
      <div class="pp-pre" id="pp-pre"></div>
      <button type="button" class="bp-btn-primary pp-go" id="pp-go" data-pp-go${S.busy ? " disabled" : ""}></button>
      <p class="pp-msg ${esc(S.kind)}" id="pp-msg" role="status">${esc(S.msg)}</p>
    </div>`;
  }

  // ---------------------------------------------------------------- the chart (the prices this page has seen)
  function spark(k, w = 640, h = 150) {
    const pts = S.hist[k] || [];
    if (pts.length < 2) return `<div class="pp-chart-empty">${T("The chart fills in as prices come in.")}</div>`;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
    let lo = Infinity, hi = -Infinity; for (const [, p] of pts) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    const pad = (hi - lo) * 0.15 || hi * 0.001; lo -= pad; hi += pad;
    const X = (t) => ((t - t0) / Math.max(1, t1 - t0)) * w, Y = (p) => h - ((p - lo) / (hi - lo)) * h;
    const d = pts.map(([t, p], i) => `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(p).toFixed(1)}`).join("");
    const up = pts[pts.length - 1][1] >= pts[0][1];
    const lines = ((S.st && S.st.me && S.st.me.pos) || []).filter((p) => p.m === k).flatMap((p) => [[p.en, "en"], [p.liq, "lq"], ...(p.tp ? [[p.tp, "tp"]] : []), ...(p.sl ? [[p.sl, "sl"]] : [])]).filter(([v]) => v > lo && v < hi);
    return `<svg class="pp-svg ${up ? "up" : "dn"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(k)} ${T("price")}">
      <path class="pp-area" d="${d}L${w},${h}L0,${h}Z"/><path class="pp-line" d="${d}"/>
      ${lines.map(([v, c]) => `<line class="pp-hl ${c}" x1="0" x2="${w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`).join("")}
      <circle class="pp-dot" cx="${X(pts[pts.length - 1][0]).toFixed(1)}" cy="${Y(pts[pts.length - 1][1]).toFixed(1)}" r="3.5"/></svg>`;
  }

  // ---------------------------------------------------------------- the account, positions, board
  function acctHtml() {
    const st = S.st, m = st.me;
    if (!joined()) {
      return `<div class="pp-acct pp-join"><h3>${T("Join this week")}</h3>
        <p>${T("Start with $10,000 of play money. Trade BTC, ETH and SOL with live prices and climb the board — nothing on-chain, nothing to lose.")}</p>
        <button type="button" class="bp-btn-primary" data-pp-join${S.busy ? " disabled" : ""}>${T(me() ? (m ? "Sign in on this device" : "Join — sign, no gas") : "Connect wallet")}</button>
        <small>${T("One signature a week. It costs nothing and sends no transaction.")}</small></div>`;
    }
    const cls = m.pnl > 0 ? "up" : m.pnl < 0 ? "dn" : "";
    return `<div class="pp-acct"><div class="pp-acct-h"><span>${T("Account value")}</span>${m.rank ? `<em>#${m.rank} ${L3({ en: "of", ko: "/", zh: "/" })} ${st.traders}</em>` : ""}</div>
      <b class="pp-eq" data-no-i18n>${usd(m.equity)}</b><span class="pp-pnl ${cls}" data-no-i18n>${sgn(m.pnl)} · ${pct(m.pnlPct)}</span>
      <dl><div><dt>${T("Cash")}</dt><dd data-no-i18n>${usd(m.cash)}</dd></div><div><dt>${T("Trades")}</dt><dd data-no-i18n>${m.trades}</dd></div><div><dt>${T("Liquidations")}</dt><dd data-no-i18n>${m.liqs}</dd></div></dl></div>`;
  }
  function posHtml() {
    const m = S.st.me;
    if (!joined()) return "";
    const tabs = `<div class="pp-tabs" role="tablist"><button type="button" role="tab" aria-selected="${S.view === "positions"}" data-pp-view="positions">${T("Positions")} <i data-no-i18n>${m.pos.length}</i></button><button type="button" role="tab" aria-selected="${S.view === "history"}" data-pp-view="history">${T("History")}</button></div>`;
    if (S.view === "history") {
      return `<div class="pp-pos" id="pp-pos">${tabs}${m.hist.length ? `<ul class="pp-list">${m.hist.map((h) => `<li><span class="pp-tag ${h.s > 0 ? "long" : "short"}" data-no-i18n>${h.m} ${h.lv}x</span><span data-no-i18n>${pxS(h.en)} → ${pxS(h.ex)}</span><small>${T(h.why === "liquidated" ? "Liquidated" : h.why === "take-profit" ? "Take-profit" : h.why === "stop-loss" ? "Stop-loss" : "Closed")}</small><b class="${h.pnl >= 0 ? "up" : "dn"}" data-no-i18n>${sgn(h.pnl)}</b></li>`).join("")}</ul>` : `<p class="pp-none">${T("Nothing closed yet this week.")}</p>`}</div>`;
    }
    if (!m.pos.length) return `<div class="pp-pos" id="pp-pos">${tabs}<p class="pp-none">${T("No open positions. Pick a side and a size on the left.")}</p></div>`;
    return `<div class="pp-pos" id="pp-pos">${tabs}<ul class="pp-list pp-open">${m.pos.map((p) => `<li>
        <span class="pp-tag ${p.s > 0 ? "long" : "short"}" data-no-i18n>${p.m} ${p.s > 0 ? L3({ en: "Long", ko: "롱", zh: "多" }) : L3({ en: "Short", ko: "숏", zh: "空" })} ${p.lv}x</span>
        <span class="pp-cell"><small>${T("Size")}</small><b data-no-i18n>${usd(p.sz, 0)}</b></span>
        <span class="pp-cell"><small>${T("Entry")}</small><b data-no-i18n>${pxS(p.en)}</b></span>
        <span class="pp-cell"><small>${T("Liquidation")}</small><b data-no-i18n class="pp-liq">${pxS(p.liq)}</b></span>
        <span class="pp-cell pp-r"><small>PnL</small><b class="${p.pnl >= 0 ? "up" : "dn"}" data-no-i18n>${sgn(p.pnl)} <i>${pct(p.roe)}</i></b></span>
        <button type="button" class="pp-x" data-pp-close="${p.id}"${S.busy ? " disabled" : ""}>${T("Close")}</button>
        ${p.tp || p.sl ? `<small class="pp-tl" data-no-i18n>${p.tp ? "TP " + pxS(p.tp) : ""}${p.tp && p.sl ? " · " : ""}${p.sl ? "SL " + pxS(p.sl) : ""}</small>` : ""}</li>`).join("")}</ul>
      ${m.pos.length > 1 ? `<button type="button" class="bp-btn-ghost sm pp-all" data-pp-closeall${S.busy ? " disabled" : ""}>${T("Close all")}</button>` : ""}</div>`;
  }
  function boardHtml() {
    const st = S.st, mine = me();
    const row = (r, i) => `<li class="${r.a === mine ? "me" : ""}${i < 3 ? " pod" : ""}"><i data-no-i18n>${i + 1}</i><span data-no-i18n>${r.a === mine ? L3({ en: "You", ko: "나", zh: "我" }) : short(r.a)}</span><b data-no-i18n>${usd(r.equity, 0)}</b><em class="${r.pnlPct >= 0 ? "up" : "dn"}" data-no-i18n>${pct(r.pnlPct)}</em></li>`;
    const top = st.top || [];
    const meRow = st.me && st.me.rank > 20 ? `<li class="me gap"><i data-no-i18n>${st.me.rank}</i><span>${L3({ en: "You", ko: "나", zh: "我" })}</span><b data-no-i18n>${usd(st.me.equity, 0)}</b><em class="${st.me.pnlPct >= 0 ? "up" : "dn"}" data-no-i18n>${pct(st.me.pnlPct)}</em></li>` : "";
    const seasons = (st.seasons || []).slice(0, 4);
    return `<div class="pp-board"><div class="pp-board-h"><h3>${T("This week's board")}</h3><small>${T("Ends in")} <b data-pp-end="${st.ends}" data-no-i18n>${left(st.ends - Date.now() / 1000)}</b> · <span data-no-i18n>${st.traders}</span> ${L3({ en: "traders", ko: "명 참가", zh: "位交易者" })}</small></div>
      ${top.length ? `<ol class="pp-lb">${top.slice(0, 20).map(row).join("")}${meRow}</ol>` : `<p class="pp-none">${T("Nobody has joined this week yet — the first trade puts you on top.")}</p>`}
      ${seasons.length ? `<details class="pp-seasons"><summary>${T("Past weeks")}</summary><ul>${seasons.map((w) => `<li><b data-no-i18n>${esc(w.wk)}</b> <small data-no-i18n>${w.traders}</small>${w.top.slice(0, 3).map((r, i) => `<span data-no-i18n>${["🥇", "🥈", "🥉"][i]} ${short(r.a)} ${pct(r.pnlPct)}</span>`).join("")}</li>`).join("")}</ul></details>` : ""}
      <p class="pp-foot">${T("Just for fun — no prizes are set. If the team ever runs a prize week, it's announced before the week starts.")}</p></div>`;
  }

  // ---------------------------------------------------------------- the page
  function paint() {
    const st = S.st;
    if (!st) { host.innerHTML = `<div class="pp-wrap"><p class="pp-none">${T("Loading live prices…")}</p></div>`; return; }
    if (!st.markets[S.m]) S.m = Object.keys(st.markets)[0];
    const keep = document.activeElement && host.contains(document.activeElement) ? document.activeElement.id : null;
    const mgv = ($("pp-mg") || {}).value, tpv = ($("pp-tp") || {}).value, slv = ($("pp-sl") || {}).value, open = ($("pp-ticket") || {}).querySelector && $("pp-ticket").querySelector("details") && $("pp-ticket").querySelector("details").open;
    const tabs = Object.keys(st.markets).map((k) => { const p = st.px[k], prev = S.last[k], dir = prev && p ? (p > prev ? "up" : p < prev ? "dn" : "") : ""; return `<button type="button" role="tab" aria-selected="${k === S.m}" data-pp-m="${k}"><b data-no-i18n>${k}</b><span class="pp-tick ${dir}" data-no-i18n>${pxS(p)}</span></button>`; }).join("");
    for (const k of Object.keys(st.markets)) S.last[k] = st.px[k];
    host.innerHTML = `<div class="pp-wrap">
      <div class="pp-mkts" role="tablist" aria-label="${T("Markets")}">${tabs}<span class="pp-src" data-no-i18n>${esc(st.px.src || "")}</span></div>
      <div class="pp-grid">
        <div class="pp-main">
          <div class="pp-chart"><div class="pp-chart-h"><b data-no-i18n>${S.m}</b><span>${esc(tr(st.markets[S.m].name))}</span><strong data-no-i18n>${pxS(st.px[S.m])}</strong><small>${T("up to")} <span data-no-i18n>${st.markets[S.m].max}x</span></small></div>${spark(S.m)}</div>
          ${posHtml()}
        </div>
        <div class="pp-side">${acctHtml()}${ticketHtml()}</div>
      </div>
      ${boardHtml()}
    </div>`;
    if (mgv != null && $("pp-mg")) $("pp-mg").value = mgv;
    if (!S.clearTl) { if (tpv && $("pp-tp")) $("pp-tp").value = tpv; if (slv && $("pp-sl")) $("pp-sl").value = slv; }
    S.clearTl = false;
    if (open) { const d = $("pp-ticket").querySelector("details"); if (d) d.open = true; }
    if (keep && $(keep)) { const el = $(keep); el.focus(); if (el.setSelectionRange && el.value) { try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* range input */ } } }
    preview();
  }

  host.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    // take-profit / stop-loss prices belong to one market and one side: a switch clears them
    if (b.dataset.ppM) { if (S.m !== b.dataset.ppM) S.clearTl = true; S.m = b.dataset.ppM; ls.set("arc.paper.m", S.m); paint(); return; }
    if (b.dataset.ppSide) { if (S.side !== b.dataset.ppSide) S.clearTl = true; S.side = b.dataset.ppSide; paint(); return; }
    if (b.dataset.ppLev) { S.lev = Number(b.dataset.ppLev); paint(); return; }
    if (b.dataset.ppPct) { const c = cash(), R = S.st.rules, fee = Math.min((R.feeBps / 10000) * Math.min(S.lev, mkt().max), (R.feeCapBps || 1e9) / 10000); $("pp-mg").value = String(Math.floor(((c * Number(b.dataset.ppPct)) / 100 / (1 + fee)) * 100) / 100); preview(); return; }
    if (b.dataset.ppView) { S.view = b.dataset.ppView; paint(); return; }
    if (b.hasAttribute("data-pp-join")) { join(); return; }
    if (b.hasAttribute("data-pp-go")) {
      if (!joined()) { join(); return; }
      const mg = margin(); ls.set("arc.paper.mg", String(mg || ""));
      trade("open", { m: S.m, side: S.side, margin: mg, lev: Math.min(S.lev, mkt().max), tp: Number(($("pp-tp") || {}).value) || 0, sl: Number(($("pp-sl") || {}).value) || 0 });
      return;
    }
    if (b.dataset.ppClose) { trade("close", { id: Number(b.dataset.ppClose) }); return; }
    if (b.hasAttribute("data-pp-closeall")) { trade("closeall", {}); }
  });
  host.addEventListener("input", (e) => {
    if (e.target.id === "pp-lev") { S.lev = Number(e.target.value); const v = $("pp-lev-v"); if (v) v.textContent = S.lev + "x"; host.querySelectorAll("[data-pp-lev]").forEach((x) => x.classList.toggle("on", Number(x.dataset.ppLev) === S.lev)); preview(); }
    if (e.target.id === "pp-mg") preview();
  });
  function tick() {
    if (document.hidden || !panel.classList.contains("active")) return;
    host.querySelectorAll("[data-pp-end]").forEach((el) => { el.textContent = left(Number(el.dataset.ppEnd) - Date.now() / 1000); });
  }
  let acct = me();
  function show() {
    S.booted = true; load();
    clearInterval(S.timer); clearInterval(S.clock);
    S.timer = setInterval(() => {
      if (document.hidden || !panel.classList.contains("active")) return;
      // don't repaint under someone typing
      const a = document.activeElement;
      if (a && host.contains(a) && a.tagName === "INPUT" && a.type !== "range" && !S.busy) { if (me() !== acct) acct = me(); return; }
      if (me() !== acct) acct = me();
      load();
    }, 3000);
    S.clock = setInterval(tick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "paper") show(); else { clearInterval(S.timer); clearInterval(S.clock); } });
  document.addEventListener("arc:lang", () => { if (S.booted) paint(); });
  if (panel.classList.contains("active")) show();
  window.arcPaper = { state: () => S.st, load, _S: S };
})();
