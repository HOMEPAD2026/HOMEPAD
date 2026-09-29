/* global CONFIG */
// arc-desk.js — ARCIA DESK, an ARCIRCLE PAD utility (arcpad.html#desk).
// ARCIA trades new coins launched on Argus with her own small wallet (the ArciaDesk contract) and learns
// from every trade. This page only reads /api/desk (api/desk.mjs): nothing here can make her trade.
//   · status        live / paper, warm-up progress, last update, the desk contract
//   · money         equity (counts up), P&L after deposits, real win rate, $ARCIRCLE burned
//   · equity        the desk's value over time (hover for a point)
//   · open          each position: entry, now, value, P&L, where it sits between stop-loss and take-profit
//   · history       every closed trade: buy price and tx, sell prices and txs, P&L; real or paper
//   · log           buys, sells and burns as they happen
//   · learning      the four playbooks (results, exits now), what the model has learned, exit changes
//   · journal       ARCIA's daily notes; watching now; passed on (and why); burns; the rules
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-desk");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const txa = (h, label) => (h ? `<a class="dk-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${esc(label || short(h))} ↗</a>` : "");
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n < 0 ? "−$" : "$") + Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sgnUsd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + usd(n, d));
  const pc = (n, d = 1) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const cls = (n) => (n == null ? "" : n > 0 ? "up" : n < 0 ? "dn" : "");
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  /// a price in USD, small ones as $0.0₅123
  function px(n) {
    if (n == null || !isFinite(n) || n <= 0) return "—";
    if (n >= 1) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const z = Math.floor(-Math.log10(n));
    const sig = (n * 10 ** (z + 3)).toFixed(0).slice(0, 4).replace(/0+$/, "") || "0";
    return z >= 4 ? `$0.0<sub>${z}</sub>${sig}` : "$" + n.toFixed(z + 3).replace(/0+$/, "");
  }
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m` : `${Math.floor(d / 86400)}d`; };
  const dur = (m) => (m == null ? "—" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`);
  const when = (s) => (s ? new Date(s * 1000).toISOString().slice(5, 16).replace("T", " ") : "—");
  const WHY = { tp: "Take-profit", tp2: "Second take-profit (2×)", runner: "Runner trailing stop", lowcap: "30-minute limit under a $5k cap", sl: "Stop-loss", trail: "Trailing stop", time: "Time limit", be: "Back to entry", emergency: "Emergency: critical flag", crash: "Emergency: price crash", unquotable: "Emergency: can't quote" };
  const PBCOL = { momentum: "#39ff88", pullback: "#4d9fff", breakout: "#ffc861", steady: "#b58bff", dexpaid: "#35d8d0", scalp: "#ff7ac4", dipdca: "#ff9b5a" };
  const S = { d: null, booted: false, timer: 0, tab: "real", shown: { eq: null }, seenLog: null, hover: null };

  async function load() {
    try {
      const r = await fetch("/api/desk", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && !j.error) { S.d = j; paint(); }
      else if (!S.d) $("dk-body").innerHTML = `<div class="ams-card dk-empty">${T("ARCIA DESK isn't reachable right now. Try again in a minute.")}</div>`;
    } catch { if (!S.d) $("dk-body").innerHTML = `<div class="ams-card dk-empty">${T("ARCIA DESK isn't reachable right now. Try again in a minute.")}</div>`; }
  }

  // ---------------- skeleton ----------------
  function frame() {
    $("dk-body").innerHTML = `
      <div class="dk-status" id="dk-status"></div>
      <div class="dk-kpis" id="dk-kpis"><div class="dk-skel"><i></i><i></i><i></i><i></i></div></div>
      <div class="dk-grid">
        <div class="dk-main">
          <div class="ams-card dk-eqc"><div class="dk-h"><h3>${T("Profit over time")}</h3><span class="dk-sub" id="dk-eq-sub"></span></div><div class="dk-eq" id="dk-eq"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("Open positions")}</h3><span class="dk-live"><i></i>${T("Live")}</span></div><div id="dk-open"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("Trade history")}</h3>
            <div class="dk-tabs" role="tablist"><button type="button" role="tab" data-dk-tab="real">${T("Real")}</button><button type="button" role="tab" data-dk-tab="paper">${T("Paper")}</button></div></div>
            <div id="dk-hist"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("Live log")}</h3><span class="dk-sub">${T("buys, sells and burns, on-chain")}</span></div><div id="dk-log"></div></div>
        </div>
        <div class="dk-side">
          <div class="ams-card dk-learn"><div class="dk-h"><h3>${T("How ARCIA is learning")}</h3></div><div id="dk-learn"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("ARCIA's journal")}</h3></div><div id="dk-journal"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("Loss reviews")}</h3><span class="dk-sub">${T("what went wrong, written by Claude")}</span></div><div id="dk-reviews"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("Watching now")}</h3><span class="dk-sub">${T("new Argus launches")}</span></div><div id="dk-watch"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("Passed on")}</h3><span class="dk-sub">${T("and why")}</span></div><div id="dk-rej"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("$ARCIRCLE burns")}</h3></div><div id="dk-burns"></div></div>
        </div>
      </div>
      <div class="ams-card dk-rules" id="dk-rules"></div>`;
    panel.querySelector(".dk-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-dk-tab]");
      if (!b) return;
      S.tab = b.dataset.dkTab; hist();
    });
    const eq = $("dk-eq");
    eq.addEventListener("pointermove", (e) => { const r = eq.getBoundingClientRect(); S.hover = (e.clientX - r.left) / r.width; chart(); });
    eq.addEventListener("pointerleave", () => { S.hover = null; chart(); });
  }

  // ---------------- paint ----------------
  function paint() {
    const d = S.d;
    if (!d) return;
    status(d); kpis(d); chart(); openPos(d); hist(); logRows(d); learning(d); journal(d); reviewsCard(d); watch(d); rej(d); burns(d); rules(d);
  }
  function status(d) {
    const live = d.mode === "live";
    const reason = !live && /\(/.test(d.mode) ? d.mode.replace(/^paper \(|\)$/g, "") : "";
    const w = d.learn.warmup;
    $("dk-status").innerHTML = `
      <span class="dk-mode ${live ? "on" : ""}"><i></i>${live ? T("Live — real trades") : T("Paper — practising, no money moves")}</span>
      ${reason ? `<span class="dk-note">${T(reason)}</span>` : ""}
      <span class="dk-chip">${T("Warm-up")} <b data-no-i18n>${w.done}/${w.need}</b></span>
      <span class="dk-chip">${T("Updated")} <b data-no-i18n>${ago(d.updated)}</b></span>
      ${d.desk ? `<a class="dk-chip dk-addr" href="${EXPL("address", d.desk)}" target="_blank" rel="noopener">${T("Desk contract")} <b data-no-i18n>${short(d.desk)} ↗</b></a>` : ""}`;
  }
  function countUp(el, to, fmt) {
    const from = S.shown.eq;
    S.shown.eq = to;
    if (reduce || from == null || from === to || to == null) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), D = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    el.parentElement.classList.remove("dk-flash-up", "dk-flash-dn"); void el.offsetWidth;
    el.parentElement.classList.add(to >= from ? "dk-flash-up" : "dk-flash-dn");
  }
  function kpis(d) {
    const m = d.money, s = d.stats;
    const live = d.mode === "live";
    const eqV = live ? m.equity : null;
    $("dk-kpis").innerHTML = `
      <div class="dk-kpi"><small>${T("Desk value")}</small><b id="dk-eqv" data-no-i18n>${usd(eqV)}</b><span>${live ? `${T("cash")} <em data-no-i18n>${usd(m.cash)}</em> · ${T("put in")} <em data-no-i18n>${usd(m.netIn)}</em>` : T("starts when the desk is funded")}</span></div>
      <div class="dk-kpi ${cls(m.pnl)}"><small>${T("Profit / loss")}</small><b data-no-i18n>${live ? sgnUsd(m.pnl) : "—"}</b><span data-no-i18n>${live && m.pnlPct != null ? pc(m.pnlPct) : ""}</span></div>
      <div class="dk-kpi"><small>${T("Win rate (real)")}</small><b data-no-i18n>${s.winRate == null ? "—" : s.winRate + "%"}</b><span>${s.realClosed} ${T("real")} · ${s.paperClosed} ${T("paper")} · ${T("avg")} <em data-no-i18n>${pc(s.avgRet)}</em></span></div>
      <div class="dk-kpi dk-burn"><small>${T("$ARCIRCLE burned")}</small><b data-no-i18n>${num(m.burnedTok || 0)}</b><span>${T("bought with")} <em data-no-i18n>${usd(m.burnedUsd || 0)}</em> ${T("of profit")}</span></div>`;
    if (live) { const el = $("dk-eqv"); el.textContent = usd(S.shown.eq ?? eqV); countUp(el, eqV, (v) => usd(v)); }
  }
  function chart() {
    const d = S.d, el = $("dk-eq");
    if (!d || !el) return;
    const pts = d.equity || [];
    $("dk-eq-sub").textContent = pts.length ? `${tr("profit after deposits, since")} ${when(pts[0][0])} UTC` : "";
    if (pts.length < 2) { el.innerHTML = `<div class="dk-empty-s">${T("The chart starts with the first funded tick.")}</div>`; return; }
    const W = 640, H = 190, P = { l: 8, r: 8, t: 14, b: 22 };
    // the line is profit / loss (deposits and withdrawals don't move it); the hover also shows the desk's value
    const xs = pts.map((p) => p[0]), val = pts.map((p) => p[1]), ys = pts.map((p) => p[2]);
    const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
    const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), pad = (hi - lo) * 0.12 || 0.5;
    const X = (x) => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r), Y = (y) => P.t + (1 - (y - (lo - pad)) / (hi - lo + 2 * pad)) * (H - P.t - P.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[2]).toFixed(1)}`).join("");
    const up = ys[ys.length - 1] >= 0;
    let tip = "";
    if (S.hover != null) {
      const tx = x0 + S.hover * (x1 - x0);
      let k = 0; for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - tx) < Math.abs(xs[k] - tx)) k = i;
      const cx = X(xs[k]), cy = Y(ys[k]);
      tip = `<line class="dk-cross" x1="${cx}" x2="${cx}" y1="${P.t}" y2="${H - P.b}"/><circle class="dk-dot" cx="${cx}" cy="${cy}" r="4.5"/>`;
      el.dataset.tip = `${when(xs[k])} UTC · ${sgnUsd(ys[k])} · ${tr("desk")} ${usd(val[k])}`;
    } else delete el.dataset.tip;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${T("Profit over time")}">
      <defs><linearGradient id="dkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? "#39ff88" : "#ff6e5a"}" stop-opacity=".22"/><stop offset="1" stop-color="${up ? "#39ff88" : "#ff6e5a"}" stop-opacity="0"/></linearGradient></defs>
      <line class="dk-zero" x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/>
      <path d="${line}L${X(x1)},${Y(0)}L${X(x0)},${Y(0)}Z" fill="url(#dkFill)"/>
      <path class="dk-line ${up ? "up" : "dn"}" d="${line}"/>${tip}
      <text class="dk-ax" x="${W - P.r}" y="${Y(0) - 5}" text-anchor="end">$0</text>${hi > 0 ? `<text class="dk-ax" x="${W - P.r}" y="${Y(hi) + 4}" text-anchor="end">${esc(sgnUsd(hi))}</text>` : ""}${lo < 0 ? `<text class="dk-ax" x="${W - P.r}" y="${Y(lo) - 4}" text-anchor="end">${esc(sgnUsd(lo))}</text>` : ""}
    </svg>${el.dataset.tip ? `<div class="dk-tip" data-no-i18n>${esc(el.dataset.tip)}</div>` : ""}`;
  }
  /// where the return sits between the stop-loss and the take-profit
  function rangeBar(p) {
    // before the first take-profit: stop-loss → take-profit; after it: entry → the next target (2×, then the runner's peak)
    const lo = p.tpHit ? 0 : -p.sl, hi = !p.tpHit ? p.tp : !p.tp2Hit ? p.tp2 : Math.max(p.tp2 * 2, p.peak || 0), r = p.ret == null ? 0 : Math.max(lo, Math.min(hi, p.ret));
    const at = ((r - lo) / (hi - lo)) * 100, zero = ((0 - lo) / (hi - lo)) * 100;
    const stopAt = p.tpHit ? ((1 + (p.peak || 0) / 100) * (1 - (p.runTrail || 30) / 100) - 1) * 100 : p.peak - p.trail;
    const trail = p.peak != null && (p.tpHit || p.peak >= p.trailAt) ? ((Math.max(lo, Math.min(hi, stopAt)) - lo) / (hi - lo)) * 100 : null;
    return `<div class="dk-range" title="${T("stop-loss")} −${p.sl}% · ${T("take-profit")} +${p.tp}%">
      <span class="dk-r-sl" data-no-i18n>${p.tpHit ? "0%" : `−${p.sl}%`}</span><div class="dk-r-bar"><i class="dk-r-zero" style="left:${zero}%"></i>${trail != null ? `<i class="dk-r-trail" style="left:${trail}%"></i>` : ""}<b class="dk-r-at ${cls(p.ret)}" style="left:${at}%"></b></div><span class="dk-r-tp" data-no-i18n>+${Math.round(hi)}%</span></div>`;
  }
  const pbTag = (k, name) => `<span class="dk-pb" style="--pb:${PBCOL[k] || "#8c98a6"}">${T(name || k)}</span>`;
  const pbName = (k) => { const p = (S.d.learn.playbooks || []).find((x) => x.k === k); return p ? p.name : k; };
  const tokenLink = (t, sym) => `<a class="dk-tok" href="/arc#scanner?t=${esc(t)}" title="${T("Open in Token Scanner")}" data-no-i18n>${esc(sym || short(t))}</a>`;
  function openPos(d) {
    const el = $("dk-open");
    if (!d.open.length) {
      el.innerHTML = `<div class="dk-empty-s">${d.mode === "live" ? T("No open positions. ARCIA is watching new launches for a setup that passes every gate.") : T("No real positions in paper mode.")}${d.paper.open ? ` <span>${d.paper.open} ${T("paper trades running")}.</span>` : ""}</div>` + paperMini(d);
      return;
    }
    el.innerHTML = `<div class="dk-pos">` + d.open.map((p) => `
      <div class="dk-p ${cls(p.ret)}">
        <div class="dk-p-top">${tokenLink(p.t, p.sym)} ${pbTag(p.pb, pbName(p.pb))}${p.tpHit ? `<span class="dk-flag">${T("profit taken")}</span>` : ""}${p.pending ? `<span class="dk-flag">${T("confirming")}</span>` : ""}
          <b class="dk-p-ret" data-no-i18n>${pc(p.ret)}</b></div>
        <div class="dk-p-grid">
          <div><small>${T("Bought")}</small><span data-no-i18n>${px(p.entryPx)}</span><em>${txa(p.tx, "tx")} · <span data-no-i18n>${ago(p.entryTs)}</span></em></div>
          <div><small>${T("Now")}</small><span data-no-i18n>${px(p.nowPx)}</span><em data-no-i18n>${num(p.tokens)}</em></div>
          <div><small>${T("Value")}</small><span data-no-i18n>${usd(p.value, 2)}</span><em>${T("in")} <span data-no-i18n>${usd(p.usdIn)}</span></em></div>
        </div>
        ${rangeBar(p)}
        ${p.gate && p.gate.floorX != null ? `<div class="dk-p-g">${T("Launch floor")} <b data-no-i18n>${p.gate.floorX}×</b>${p.gate.dump != null ? ` · ${T("top-10 dump")} <b data-no-i18n>−${Math.round(p.gate.dump)}%</b>` : ""}${p.gate.score != null ? ` · ${T("score")} <b data-no-i18n>${p.gate.score}</b>` : ""}</div>` : ""}
        ${p.dca && p.dca.length ? `<div class="dk-p-g">${T("DCA buys")} <b data-no-i18n>${p.dca.map((l) => l + "%").join(" · ")}</b> · ${T("in")} <b data-no-i18n>${usd(p.usdIn)}</b></div>` : ""}
        ${p.added ? `<div class="dk-p-g">${T(p.added.kind === "dip" ? "Added on a dip" : "Added on strength")} <b data-no-i18n>${usd(p.added.usd)} @ ${px(p.added.px)}</b> ${txa(p.added.tx, "tx")}</div>` : ""}
        ${p.review ? `<div class="dk-p-rv"><b>${T("Risk check")}</b><span data-no-i18n>${esc(p.review.reason)}</span></div>` : ""}
        ${p.sells.length ? `<div class="dk-p-sells">${p.sells.map((s) => `<span>${T(WHY[s.why] || s.why)} ${s.pct}% <b data-no-i18n>${pc(s.ret)}</b> ${txa(s.tx, "tx")}</span>`).join("")}</div>` : ""}
      </div>`).join("") + `</div>` + paperMini(d);
  }
  function paperMini(d) {
    if (!d.paper.list.length) return "";
    return `<details class="dk-paper"><summary>${T("Paper trades running")} <b data-no-i18n>${d.paper.open}</b></summary><div class="dk-rows">` +
      d.paper.list.map((p) => `<div class="dk-row"><span>${tokenLink(p.t, p.sym)} ${pbTag(p.pb, pbName(p.pb))}</span><span class="${cls(p.ret)}" data-no-i18n>${pc(p.ret)}</span><small data-no-i18n>+${p.tp}/−${p.sl} · ${ago(p.entryTs)}</small></div>`).join("") + `</div></details>`;
  }
  function hist() {
    const d = S.d, el = $("dk-hist");
    if (!d || !el) return;
    panel.querySelectorAll("[data-dk-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dkTab === S.tab)));
    const rows = d.recent.filter((r) => (S.tab === "real" ? r.real : !r.real)).slice(0, 40);
    if (!rows.length) { el.innerHTML = `<div class="dk-empty-s">${S.tab === "real" ? T("No real trades closed yet. The first 25 are the warm-up: small trades on every setup that passes the gates, to learn fast.") : T("No paper trades closed yet.")}</div>`; return; }
    el.innerHTML = `<div class="dk-hist">` + rows.map((r) => `
      <div class="dk-h-row ${cls(r.ret)}">
        <div class="dk-h-a">${tokenLink(r.t, r.sym)} ${pbTag(r.pb, pbName(r.pb))}<small>${T(WHY[r.why] || r.why)} · <span data-no-i18n>${dur(r.mins)}</span></small></div>
        <div class="dk-h-b"><small>${T("Buy")}</small><span data-no-i18n>${px(r.entryPx)}</span>${r.real ? `<em>${txa(r.buyTx, "tx")} <span data-no-i18n>${usd(r.usdIn)}</span></em>` : `<em data-no-i18n>${when(r.entryTs)}</em>`}</div>
        <div class="dk-h-b"><small>${T("Sell")}</small><span data-no-i18n>${px(r.exitPx)}</span>${r.real ? `<em>${(r.sells || []).map((s) => txa(s.tx, s.pct + "%")).join(" ")} <span data-no-i18n>${usd(r.usdOut)}</span></em>` : `<em data-no-i18n>${when(r.exitTs)}</em>`}</div>
        <div class="dk-h-c"><b data-no-i18n>${pc(r.ret)}</b><small data-no-i18n>${r.real ? sgnUsd(r.pnl) : ""}</small></div>
      </div>`).join("") + `</div>`;
  }
  function logRows(d) {
    const el = $("dk-log");
    if (!d.log.length) { el.innerHTML = `<div class="dk-empty-s">${T("Nothing yet. Every buy, sell and burn will appear here with its transaction.")}</div>`; return; }
    const seen = S.seenLog;
    S.seenLog = new Set(d.log.map((x) => x.tx + x.side));
    el.innerHTML = `<div class="dk-log">` + d.log.slice(0, 30).map((x) => `
      <div class="dk-l ${x.side}${seen && !seen.has(x.tx + x.side) ? " dk-new" : ""}">
        <span class="dk-l-side">${T(x.side === "buy" ? "Buy" : x.side === "sell" ? "Sell" : "Burn")}</span>
        <span class="dk-l-tok" data-no-i18n>${esc(x.sym)}</span>
        <span class="dk-l-amt" data-no-i18n>${usd(x.usd)}${x.px ? ` @ ${px(x.px)}` : ""}${x.side === "burn" ? ` → ${num(x.tokens)} $ARCIRCLE` : ""}</span>
        <span class="dk-l-why">${x.side === "sell" ? `${T(WHY[x.why] || x.why)} <b class="${cls(x.ret)}" data-no-i18n>${pc(x.ret)}</b>` : x.side === "buy" ? T(pbName(x.pb)) : T("share of new profit")}</span>
        <span class="dk-l-t" data-no-i18n>${ago(x.ts)}</span>${txa(x.tx, "tx")}
      </div>`).join("") + `</div>`;
  }
  function learning(d) {
    const L = d.learn, w = L.warmup;
    const pct = Math.min(1, w.done / Math.max(1, w.need));
    const C = 2 * Math.PI * 26;
    const maxW = Math.max(0.05, ...L.weights.map((x) => Math.abs(x.w)));
    $("dk-learn").innerHTML = `
      <div class="dk-warm">
        <svg viewBox="0 0 64 64" aria-hidden="true"><circle class="dk-w-bg" cx="32" cy="32" r="26"/><circle class="dk-w-fg" cx="32" cy="32" r="26" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"/></svg>
        <div><b>${w.done < w.need ? T("Warm-up") : T("Learning")}</b><span>${w.done < w.need ? `${w.done}/${w.need} ${T("real trades — every setup that passes the gates is taken, small")}` : `${T("Trying something new on")} <span data-no-i18n>${Math.round(L.explore * 100)}%</span> ${T("of setups, the rest picked by what has worked")}`}</span>
        <small>${T("Model trained on")} <span data-no-i18n>${L.modelN}</span> ${T("closed trades (paper counts half)")}</small></div>
      </div>
      <div class="dk-pbs">${L.playbooks.map((p) => `
        <div class="dk-pbc" style="--pb:${PBCOL[p.k] || "#8c98a6"}">
          <div class="dk-pbc-h"><b>${T(p.name)}</b><span class="${cls(p.mean)}" data-no-i18n>${p.n ? pc(p.mean) : "—"}</span></div>
          <p>${T(p.why)}</p>
          <div class="dk-pbc-s"><span>${T("trades")} <b data-no-i18n>${p.real}</b>+<b data-no-i18n>${p.paper}</b> ${T("paper")}</span><span>${T("wins")} <b data-no-i18n>${p.winRate == null ? "—" : p.winRate + "%"}</b></span></div>
          <div class="dk-pbc-x" data-no-i18n>TP +${p.exits.tp}% (${p.exits.tp1Pct ?? 35}%) · 2× (${p.exits.tp2Pct ?? 25}%) · ${tr("runner")} −${p.exits.runTrail ?? 30}% ${tr("from peak")} · SL −${p.exits.sl}% · ${p.exits.maxH}h</div>
        </div>`).join("")}</div>
      ${L.tails && L.tails.n ? `<h4>${T("Big runs seen")}</h4><div class="dk-tails"><span><b data-no-i18n>${L.tails.x2}</b>${T("doubled")}</span><span><b data-no-i18n>${L.tails.x4}</b>${T("went 4×")}</span><span><b data-no-i18n>${L.tails.x11}</b>${T("went 11×+")}</span><small>${T("out of")} <span data-no-i18n>${L.tails.n}</span> ${T("trades, counting what happened after they closed — the runner is there for these")}</small></div>` : ""}
      <h4>${T("What the model has learned")}</h4>
      ${L.modelN ? `<div class="dk-wts">${L.weights.map((x) => `<div class="dk-wt"><span>${T(x.name)}</span><div class="dk-wt-bar"><i class="${x.w >= 0 ? "up" : "dn"}" style="${x.w >= 0 ? "left:50%" : `right:50%`};width:${((Math.abs(x.w) / maxW) * 50).toFixed(1)}%"></i></div><b class="${cls(x.w)}" data-no-i18n>${x.w > 0 ? "+" : ""}${x.w.toFixed(2)}</b></div>`).join("")}</div><small class="dk-legend">${T("Right: more of it has meant a winning trade. Left: a losing one.")}</small>` : `<div class="dk-empty-s">${T("Nothing yet — it learns from the first closed trades.")}</div>`}
      ${(L.adds || []).length ? `<h4>${T("Adding to a position")}</h4><div class="dk-adds">${L.adds.map((a) => `<div class="dk-add ${a.live ? "on" : ""}"><b>${T(a.name)}</b><span class="dk-add-st">${a.live ? T("live") : T("paper only")}</span>
        <small>${a.n ? `${T("edge per add")} <em class="${cls(a.edge)}" data-no-i18n>${pc(a.edge)}</em> · ${T("helped")} <em data-no-i18n>${a.helped}%</em> · <span data-no-i18n>${a.n}</span> ${T("cases")}` : T("no cases yet")}</small></div>`).join("")}</div>
        <small class="dk-legend">${T("Every paper trade records what one more buy on a dip, or on strength, would have done. A kind of add goes live only after 20+ cases with a clearly positive edge, never during the warm-up.")}</small>` : ""}
      ${L.history.some((h) => h.changes && h.changes.length) ? `<h4>${T("Exit changes")}</h4><div class="dk-rows">${L.history.filter((h) => h.changes && h.changes.length).slice(-6).reverse().map((h) => h.changes.map((c) => `<div class="dk-row"><span data-no-i18n>${esc(h.day)}</span><span>${T(pbName(c.pb))}</span><small data-no-i18n>+${c.from.tp}/−${c.from.sl} → +${c.to.tp}/−${c.to.sl}</small></div>`).join("")).join("")}</div>` : ""}`;
  }
  function journal(d) {
    const el = $("dk-journal");
    if (!d.journal.length) { el.innerHTML = `<div class="dk-empty-s">${T("ARCIA writes here once a day: what she traded, what worked, what she's changing.")}</div>`; return; }
    el.innerHTML = d.journal.slice(0, 5).map((j, i) => `
      <details class="dk-j"${i === 0 ? " open" : ""}><summary><b data-no-i18n>${esc(j.day)}</b><span>${j.stats.real} ${T("real")} · ${j.stats.paper} ${T("paper")}</span><em class="${cls(j.stats.realPnl)}" data-no-i18n>${sgnUsd(j.stats.realPnl)}</em></summary>
        ${j.text ? `<p class="dk-j-t" data-no-i18n>${esc(j.text)}</p>` : ""}
        <ul>${j.lessons.map((l) => `<li>${T(l)}</li>`).join("")}</ul></details>`).join("");
  }
  function reviewsCard(d) {
    const el = $("dk-reviews");
    const list = d.reviews || [];
    if (!list.length) { el.innerHTML = `<div class="dk-empty-s">${d.ai ? T("After a real trade loses 30% or more, Claude writes what most likely went wrong. None yet.") : T("Loss reviews start once the Claude API key is set.")}</div>`; return; }
    el.innerHTML = list.slice(0, 5).map((r) => `<div class="dk-rv"><div class="dk-rv-h">${tokenLink(r.t, r.sym)}<b class="${cls(r.ret)}" data-no-i18n>${pc(r.ret)}</b><em data-no-i18n>${ago(r.ts)}</em></div><p data-no-i18n>${esc(r.text)}</p></div>`).join("");
  }
  const watchTags = (c) => {
    const l = c.links || {}, t = [l.web ? "web" : "", l.x ? "X" : "", l.tg ? "TG" : ""].filter(Boolean);
    return (t.length ? `<span class="dk-tags" data-no-i18n>${t.join(" · ")}</span>` : "") + (c.paid ? `<span class="dk-flag dk-paid">${T("Dex paid")}</span>` : "") + (c.reused ? `<span class="dk-flag dk-warn">${T("reused links")}</span>` : "");
  };
  function watch(d) {
    const el = $("dk-watch");
    if (!d.watching.length) { el.innerHTML = `<div class="dk-empty-s">${T("No Argus launches in the last three days yet.")}</div>`; return; }
    el.innerHTML = `<div class="dk-rows">` + d.watching.map((c) => `<div class="dk-row">${tokenLink(c.t, c.sym)}<span data-no-i18n>${px(c.px)}</span>${watchTags(c)}${c.own ? `<small>${T("ArcPad launch — skipped")}</small>` : c.crit ? `<small class="dn">${T("critical flag")}</small>` : `<small data-no-i18n>${c.score == null ? tr("scanning") : c.score + "/100"} · ${ago(c.ts)}</small>`}</div>`).join("") + `</div>`;
  }
  function rej(d) {
    const el = $("dk-rej");
    if (!d.rejects.length) { el.innerHTML = `<div class="dk-empty-s">${T("Setups that fail a safety gate show up here.")}</div>`; return; }
    el.innerHTML = `<div class="dk-rows">` + d.rejects.slice(0, 10).map((r) => `<div class="dk-row dk-rj">${tokenLink(r.t, r.sym)}${r.paper ? `<span class="dk-flag">${T("paper only")}</span>` : ""}<small>${r.why.map((x) => T(x)).join(" · ")}</small><em data-no-i18n>${ago(r.ts)}</em></div>`).join("") + `</div>`;
  }
  function burns(d) {
    const el = $("dk-burns");
    const pct = d.rules.risk.burnPct;
    const head = `<p class="dk-small">${T("Once a day,")} <b data-no-i18n>${pct}%</b> ${T("of new profit above the desk's previous high buys $ARCIRCLE and sends it to 0x…dEaD, through the desk contract.")}</p>`;
    el.innerHTML = head + (d.burns.length ? `<div class="dk-rows">` + d.burns.slice(0, 8).map((b) => `<div class="dk-row"><span data-no-i18n>${esc(b.day)}</span><span data-no-i18n>${num(b.tok)} $ARCIRCLE</span><small data-no-i18n>${usd(b.usd)}</small>${txa(b.tx, "tx")}</div>`).join("") + `</div>` : `<div class="dk-empty-s">${T("No burn yet — it starts with the first profitable day.")}</div>`);
  }
  function rules(d) {
    const g = d.rules.gates, r = d.rules.risk;
    $("dk-rules").innerHTML = `
      <div class="dk-h"><h3>${T("The rules she can't learn away")}</h3></div>
      <div class="dk-rule-grid">
        <div><b>${T("Safety gates")}</b><ul>
          <li>${T("No Token Scanner critical flag")}</li><li>${T("Launched at least")} <span data-no-i18n>${g.minAgeMin}</span> ${T("minutes ago, at most 3 days")}</li>
          <li>${T("Liquidity at least")} <span data-no-i18n>$${g.minLiq}</span></li><li>${T("A buy and an immediate sell lose at most")} <span data-no-i18n>${g.maxRoundTrip}%</span></li>
          <li>${T("Taxes at most")} <span data-no-i18n>${g.maxTax}%</span> · ${T("top 10 wallets at most")} <span data-no-i18n>${g.maxTop10}%</span></li>
          <li>${T("Token Scanner: shown and learned from, but only a critical flag blocks a buy (an Argus launch can't block selling)")}</li>
          ${d.rules.realGates ? `<li>${T("Real money only: price at most")} <span data-no-i18n>${d.rules.realGates.maxFloorX}×</span> ${T("its launch floor (the pump scalp: 15×, $2), a top-10 dump under")} <span data-no-i18n>${d.rules.realGates.maxDump}%</span>${T(", and never a token with a critical flag in the last 6 hours")}</li>` : ""}
          ${d.rules.ai ? `<li>${T("A second opinion from Claude before every real buy — it can only say no")}</li>` : ""}</ul></div>
        <div><b>${T("Money limits")}</b><ul>
          <li><span data-no-i18n>${r.tradePct}%</span> ${T("of the desk per trade")} (<span data-no-i18n>$${r.minTrade}–$${r.maxTrade}</span>)${r.warmTrade ? ` · ${T("warm-up:")} <span data-no-i18n>$${r.warmTrade}</span>, <span data-no-i18n>${r.warmPerHour}</span> ${T("buys an hour")}` : ""}</li><li>${T("At most")} <span data-no-i18n>${r.maxOpen}</span> ${T("open, and")} <span data-no-i18n>${r.maxPerHour}</span> ${T("buys an hour")}</li>
          <li>${T("Down")} <span data-no-i18n>${r.dailyLossPct}%</span> ${T("in a day: no new trades until the next day")}</li>
          ${r.lowCapUsd ? `<li>${T("Under a")} <span data-no-i18n>$${(r.lowCapUsd / 1000).toFixed(0)}k</span> ${T("market cap, never held longer than")} <span data-no-i18n>${r.lowCapMin}</span> ${T("minutes (the crash-buy DCA has its own 3-hour limit)")}</li>` : ""}<li>${T("The contract caps each buy and each day's buys; only the owner can withdraw")}</li></ul></div>
        <div><b>${T("What it trades")}</b><ul>
          <li>${T("Only new coins launched on Argus, paired with USDC")}</li><li>${T("Never $ARCIRCLE itself")}</li>
          <li>${d.rules.tradeArcPad ? T("ArcPad's own Argus launches are included") : T("Not ArcPad's own Argus launches — the platform earns their fees")}</li><li>${T("No message, chat or command can make it trade")}</li></ul></div>
      </div>
      <p class="dk-disc">${T("ARCIA DESK is an experiment with a small amount of the team's own money. New coins are the riskiest thing on-chain and most lose value; ARCIA will lose trades. Nothing here is financial advice, and nobody can deposit into or copy the desk.")}</p>`;
  }

  function show() {
    if (!S.booted) { S.booted = true; frame(); }
    load();
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (panel.classList.contains("active") && !document.hidden) load(); }, 15000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "desk") show(); else clearInterval(S.timer); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && panel.classList.contains("active")) load(); });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); paint(); } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcDesk = { load, state: S };
})();
