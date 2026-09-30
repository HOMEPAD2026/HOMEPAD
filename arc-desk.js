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
// v2: a health banner when the schedule stops, a hero with ARCIA's mood, tabs (Overview / Positions /
// History / Playbooks / Learning / Rules), more KPIs (today, trading costs, best / worst, Claude's vetoes),
// daily P&L calendar, drawdown, "every setup" baseline, playbook leaderboard with benched playbooks,
// a trade drawer, what happened after she passed, the on-chain cash check, the next burn, toasts.
// v3 (1 Oct 2026): two desks — Arc (USDC, Argus launches) and Robinhood Chain (ETH, pons launches; /api/desk?chain=rh),
// switched at the top or by #desk?chain=rh; the Robinhood one shows ETH beside dollars, no burn, and its owner panel
// points to the chain (a plain ETH send to deposit, the explorer's Write tab for withdraw / pause / limits).
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
  // the desk shown: Arc (USDC, Argus launches) or Robinhood Chain (ETH, pons launches) — #desk / #desk?chain=rh
  const EXPL = (kind, x) => `${(S.d && S.d.net === "rh" && S.d.explorer) || (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const isRH = () => S.net === "rh";
  const netFromHash = () => (/^#desk\?(?:.*&)?chain=rh\b/.test(location.hash) ? "rh" : /^#desk\b/.test(location.hash) && /chain=arc\b/.test(location.hash) ? "arc" : null);
  const api = (q = "") => "/api/desk" + (isRH() ? "?chain=rh" + (q ? "&" + q : "") : q ? "?" + q : "");
  const eth = (n, d = 4) => (n == null || !isFinite(n) ? "—" : (n < 0 ? "−" : "") + Math.abs(Number(n)).toLocaleString("en-US", { maximumFractionDigits: d }) + " ETH");
  const sgnEth = (n, d = 5) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + eth(n, d));
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
  const WHY = { early: "Early exit (fell right after the buy)", tp: "Take-profit", tp2: "Second take-profit (2×)", runner: "Runner trailing stop", lowcap: "Time limit at a low market cap", sl: "Stop-loss", trail: "Trailing stop", time: "Time limit", be: "Back to entry", emergency: "Emergency: critical flag", crash: "Emergency: price crash", unquotable: "Emergency: can't quote" };
  const PBCOL = { momentum: "#39ff88", pullback: "#4d9fff", breakout: "#ffc861", steady: "#b58bff", dexpaid: "#35d8d0", scalp: "#ff7ac4", dipdca: "#ff9b5a" };
  const S = { net: "arc", d: null, booted: false, timer: 0, tab: "real", shown: {}, seenLog: null, hover: null, view: "overview", f: { pb: "all", res: "all" }, lastVal: {}, drawn: false, cd: 0 };
  const AV = "/images/arcia-avatar-96.jpg";
  const dayOfTs = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  const TIP = {
    tp: "Take-profit: the gain at which ARCIA sells part of the position",
    sl: "Stop-loss: the loss at which she sells everything",
    trail: "Trailing stop: once up, she sells if the price falls this far from its peak",
    runner: "Runner: what's left after taking profit rides on with a wide trailing stop",
    dca: "DCA: buying again in small steps as the price falls, for a better average",
  };
  const abbr = (k, label) => `<abbr class="dk-ab" title="${T(TIP[k])}">${esc(label)}</abbr>`;

  async function load() {
    try {
      const net = S.net;
      const r = await fetch(api(), { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (net !== S.net) return; // switched desks while this was loading
      if (j && !j.error) { S.d = j; paint(); }
      else if (!S.d) $("dk-body").innerHTML = `<div class="ams-card dk-empty">${T("ARCIA DESK isn't reachable right now. Try again in a minute.")}</div>`;
    } catch { if (!S.d) $("dk-body").innerHTML = `<div class="ams-card dk-empty">${T("ARCIA DESK isn't reachable right now. Try again in a minute.")}</div>`; }
  }

  // ---------------- skeleton ----------------
  function frame() {
    const tab = (k, label) => `<button type="button" role="tab" data-dk-view="${k}" aria-selected="${S.view === k}">${T(label)}</button>`;
    const nb = (k, label, sub) => `<button type="button" role="tab" data-dk-net="${k}" aria-selected="${S.net === k}"><b>${T(label)}</b><small>${T(sub)}</small></button>`;
    $("dk-body").innerHTML = `
      <div class="dk-net" role="tablist" aria-label="${T("Which desk")}">${nb("arc", "Arc", "USDC · Argus launches")}${nb("rh", "Robinhood Chain", "ETH · pons launches")}</div>
      <div class="dk-health" id="dk-health" hidden></div>
      <div class="dk-hero2" id="dk-hero2"></div>
      <div class="dk-status" id="dk-status"></div>
      <div class="dk-sum" id="dk-sum"></div>
      <div class="dk-nav" role="tablist" aria-label="${T("ARCIA DESK sections")}">${tab("overview", "Overview")}${tab("positions", "Positions")}${tab("history", "History")}${tab("playbooks", "Playbooks")}${tab("learning", "Learning")}${tab("rules", "Rules")}</div>
      <div class="dk-view" data-view="overview">
        <div class="dk-kpis" id="dk-kpis"><div class="dk-skel"><i></i><i></i><i></i><i></i></div></div>
        <div class="dk-grid">
          <div class="dk-main">
            <div class="ams-card dk-eqc"><div class="dk-h"><h3>${T("Profit over time")}</h3><span class="dk-sub" id="dk-eq-sub"></span></div><div class="dk-eq" id="dk-eq"></div><div class="dk-dd" id="dk-dd"></div></div>
            <div class="ams-card"><div class="dk-h"><h3>${T("Profit by day")}</h3><span class="dk-sub">${T("UTC days, real money")}</span></div><div id="dk-cal"></div></div>
            <div class="ams-card"><div class="dk-h"><h3>${T("Live log")}</h3><span class="dk-sub">${T("buys, sells and burns, on-chain")}</span></div><div id="dk-log"></div></div>
          </div>
          <div class="dk-side">
            <div class="ams-card dk-riskc"><div class="dk-h"><h3>${T("Risk now")}</h3><span class="dk-sub">${T("how much a buy spends, and why")}</span></div><div id="dk-risk"></div></div>
            <div class="ams-card"><div class="dk-h"><h3>${T("Better than taking every setup?")}</h3></div><div id="dk-base"></div></div>
            <div class="ams-card"><div class="dk-h"><h3 class="dk-radar-h"><i class="dk-radar" aria-hidden="true"></i>${T("Watching now")}</h3><span class="dk-sub">${T(isRH() ? "new pons launches" : "new Argus launches")}</span></div><div id="dk-watch"></div></div>
            <div class="ams-card"><div class="dk-h"><h3>${T("Passed on")}</h3><span class="dk-sub" id="dk-rej-sub">${T("and what happened next")}</span></div><div id="dk-rej"></div></div>
            <div class="ams-card"${isRH() ? " hidden" : ""}><div class="dk-h"><h3>${T("$ARCIRCLE burns")}</h3></div><div id="dk-burns"></div></div>
          </div>
        </div>
      </div>
      <div class="dk-view" data-view="positions" hidden>
        <div class="ams-card"><div class="dk-h"><h3>${T("Open positions")}</h3><span class="dk-live"><i></i>${T("Live")}</span></div><div id="dk-open"></div></div>
      </div>
      <div class="dk-view" data-view="history" hidden>
        <div class="ams-card"><div class="dk-h"><h3>${T("Trade history")}</h3>
          <div class="dk-tabs" role="tablist"><button type="button" role="tab" data-dk-tab="real">${T("Real")}</button><button type="button" role="tab" data-dk-tab="paper">${T("Paper")}</button></div></div>
          <div class="dk-filt" id="dk-filt"></div>
          <div id="dk-hist"></div></div>
      </div>
      <div class="dk-view" data-view="playbooks" hidden>
        <div class="ams-card"><div class="dk-h"><h3>${T("Playbook leaderboard")}</h3><span class="dk-sub">${T("real money, every cost included")}</span></div><div id="dk-board"></div></div>
        <div class="dk-grid dk-grid2">
          <div class="ams-card"><div class="dk-h"><h3>${T("Results by trade size")}</h3><span class="dk-sub">${T("real trades, in dollars")}</span></div><div id="dk-coh"></div></div>
          <div class="ams-card"><div class="dk-h"><h3>${T("Pump scalp exits, replayed")}</h3><span class="dk-sub">${T("average return per trade")}</span></div><div id="dk-grid"></div></div>
        </div>
      </div>
      <div class="dk-view" data-view="learning" hidden>
        <div class="dk-grid">
          <div class="dk-main"><div class="ams-card dk-learn"><div class="dk-h"><h3>${T("How ARCIA is learning")}</h3></div><div id="dk-learn"></div></div></div>
          <div class="dk-side">
            <div class="ams-card"><div class="dk-h"><h3>${T("ARCIA's journal")}</h3></div><div id="dk-journal"></div></div>
            <div class="ams-card"><div class="dk-h"><h3>${T("Loss reviews")}</h3><span class="dk-sub">${T("what went wrong, written by Claude")}</span></div><div id="dk-reviews"></div></div>
          </div>
        </div>
      </div>
      <div class="dk-view" data-view="rules" hidden>
        <div class="ams-card dk-proofc"><div class="dk-h"><h3>${T("On-chain check")}</h3><span class="dk-sub">${T("the desk contract, read just now")}</span></div><div id="dk-proof"></div></div>
        <div class="ams-card dk-rules" id="dk-rules"></div>
      </div>
      <div class="dk-toasts" id="dk-toasts" aria-live="polite"></div>
      <div class="dk-drawer" id="dk-drawer" hidden><div class="dk-dr-bg" data-dk-close></div><aside class="dk-dr" role="dialog" aria-modal="true" aria-label="${T("Trade details")}"><button type="button" class="dk-dr-x" data-dk-close aria-label="${T("Close")}">×</button><div id="dk-dr-body"></div></aside></div>`;
    panel.querySelector(".dk-net").addEventListener("click", (e) => { const b = e.target.closest("[data-dk-net]"); if (b) switchNet(b.dataset.dkNet, true); });
    panel.querySelector(".dk-nav").addEventListener("click", (e) => {
      const b = e.target.closest("[data-dk-view]");
      if (!b) return;
      S.view = b.dataset.dkView;
      try { localStorage.setItem("dk-view", S.view); } catch { /* fine */ }
      showView();
      // when the tab bar is stuck to the top, bring the new section's start into view just under it
      const nav = panel.querySelector(".dk-nav"), v = panel.querySelector(`.dk-view[data-view="${S.view}"]`);
      const nb = nav.getBoundingClientRect(), vt = v.getBoundingClientRect().top;
      if (vt < nb.bottom) window.scrollBy({ top: vt - nb.bottom - 10, behavior: reduce ? "auto" : "smooth" });
    });
    panel.querySelector(".dk-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-dk-tab]");
      if (!b) return;
      S.tab = b.dataset.dkTab; hist();
    });
    $("dk-filt").addEventListener("change", (e) => { const k = e.target.dataset.f; if (k) { S.f[k] = e.target.value; hist(); } });
    $("dk-hist").addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const r = e.target.closest("[data-dk-trade]");
      if (r) openTrade(r.dataset.dkTrade);
    });
    $("dk-hist").addEventListener("keydown", (e) => { const r = e.target.closest("[data-dk-trade]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openTrade(r.dataset.dkTrade); } });
    $("dk-drawer").addEventListener("click", (e) => { if (e.target.closest("[data-dk-close]")) closeTrade(); });
    $("dk-toasts").addEventListener("click", (e) => { const b = e.target.closest("[data-dk-goto]"); if (!b) return; const nb = panel.querySelector(`[data-dk-view="${b.dataset.dkGoto}"]`); if (nb) nb.click(); b.closest(".dk-toast").remove(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("dk-drawer").hidden) closeTrade(); });
    const eq = $("dk-eq");
    eq.addEventListener("pointermove", (e) => { const r = eq.getBoundingClientRect(); S.hover = (e.clientX - r.left) / r.width; chart(); });
    eq.addEventListener("pointerleave", () => { S.hover = null; chart(); });
    // the tab bar sticks under the page header, or to the top of whichever element scrolls the panel
    const setTop = () => {
      let el = panel.parentElement;
      while (el && el !== document.body && !(el.scrollHeight > el.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      const head = document.querySelector(".bp-topbar") || document.querySelector(".ax-top");
      const top = el && el !== document.body ? 0 : head ? Math.round(head.getBoundingClientRect().height) + 6 : 8;
      panel.style.setProperty("--dk-sticky", top + "px");
    };
    setTop(); window.addEventListener("resize", setTop);
    showView();
  }
  function showView() {
    panel.querySelectorAll("[data-dk-view]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dkView === S.view)));
    panel.querySelectorAll(".dk-view").forEach((v) => { const on = v.dataset.view === S.view; v.hidden = !on; if (on && !reduce) { v.classList.remove("dk-vin"); void v.offsetWidth; v.classList.add("dk-vin"); } });
    if (S.view === "overview") { S.drawn = false; chart(); }
  }

  // ---------------- paint ----------------
  function paint() {
    const d = S.d;
    if (!d) return;
    health(d); hero(d); status(d); summary(d); riskCard(d); cohorts(d); replayGrid(d); kpis(d); chart(); calendar(d); baseline(d); openPos(d); filters(d); hist(); logRows(d); board(d); learning(d); journal(d); reviewsCard(d); watch(d); rej(d); burns(d); proof(d); rules(d); toasts(d);
  }
  const staleMin = (d) => (d && d.updated ? Math.floor((Date.now() / 1000 - d.updated) / 60) : null);
  function health(d) {
    const el = $("dk-health"), m = staleMin(d);
    const stale = m != null && m >= 10;
    el.hidden = !stale;
    if (stale) el.innerHTML = `<b>${T("ARCIA is paused")}</b><span>${T("Her schedule hasn't run for")} <em data-no-i18n>${ago(d.updated)}</em>. ${T("Open positions keep their stop-losses in the rules, but nothing is checked until it runs again. The team has been alerted.")}</span>`;
  }
  /// ARCIA's mood from what just happened: paused, a win, a loss, or watching
  function mood(d) {
    const m = staleMin(d);
    if (m != null && m >= 10) return ["rest", "Taking a break"];
    const rk = (d.risk && d.risk.ramp) || {};
    if (d.mode === "live" && rk.dayPct != null && rk.dayPct <= -5) return ["careful", "Trading smaller today"];
    if (d.mode === "live" && rk.streak >= 3) return ["careful", "Slowing down after losses"];
    const last = (d.log || []).find((x) => x.side !== "buy");
    if (last && last.side === "burn") return ["burn", "Burning $ARCIRCLE"];
    if (last && Date.now() / 1000 - last.ts < 3 * 3600) return last.ret > 0 ? ["happy", "Feeling good"] : ["focus", "Staying focused"];
    return d.open.length ? ["focus", "Watching her trades"] : ["calm", "Scanning new launches"];
  }
  /// what ARCIA says under her mood: the reason her sizes are down, when they are
  function say(d) {
    const rk = (d.risk && d.risk.ramp) || {};
    if (d.mode !== "live") return "Practising on paper — no money moves";
    if (rk.dayPct != null && rk.dayPct <= -5) return "A rough day — I'm buying at half size until tomorrow.";
    if (rk.streak >= 3) return "A few losses in a row — half size until I win one back.";
    if (rk.n >= 8 && rk.pf != null && rk.pf !== "inf" && rk.pf < 0.5) return "My recent trades lost more than they made — minimum size while I learn.";
    if (rk.n >= 8 && rk.pf != null && rk.pf !== "inf" && rk.pf < 1) return "My recent trades are slightly down — half size until they recover.";
    return "Trading real money, every trade on-chain";
  }
  function hero(d) {
    const [mk, ml] = mood(d), live = d.mode === "live", m = d.money;
    const pts = (d.equity || []).slice(-60), ys = pts.map((p) => p[2]);
    let spark = "";
    if (ys.length > 1) {
      const lo = Math.min(...ys), hi = Math.max(...ys), W = 160, H = 40;
      const X = (i) => (i / (ys.length - 1)) * W, Y = (v) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6);
      spark = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="${ys[ys.length - 1] >= ys[0] ? "up" : "dn"}" d="${ys.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("")}"/></svg>`;
    }
    const need = live && m.hwm != null ? Math.max(0, (m.hwm || 0) + 0.5 - (m.pnl || 0)) : null;
    $("dk-hero2").innerHTML = `
      <div class="dk-av dk-m-${mk}"><img src="${AV}" alt="" width="64" height="64" loading="lazy"><i></i></div>
      <div class="dk-hero-t"><small>${T("ARCIA at her desk")}</small><b>${T(ml)}</b><span class="dk-say">${T(say(d))}</span></div>
      <div class="dk-hero-v"><small>${T("Desk value")}</small><b data-no-i18n>${live ? usd(m.equity) : "—"}</b><em class="${cls(m.pnl)}" data-no-i18n>${live ? `${sgnUsd(m.pnl)} ${m.pnlPct != null ? "(" + pc(m.pnlPct) + ")" : ""}` : ""}</em>${spark}</div>
      ${d.net === "rh" ? `<div class="dk-hero-b"><small>${T("In ETH")}</small><span><b data-no-i18n>${live ? eth(m.equityEth) : "—"}</b></span><em>${live ? `<span class="${cls(m.pnlEth)}" data-no-i18n>${sgnEth(m.pnlEth)}</span> · ` : ""}${T("ETH at")} <span data-no-i18n>${d.ethUsd ? usd(d.ethUsd) : "—"}</span></em></div>` : `<div class="dk-hero-b"><small>${T("Next $ARCIRCLE burn")}</small>${need == null ? `<span>${T("after the first profitable day")}</span>` : need <= 0 ? `<span class="up">${T("due at the next daily run")}</span>` : `<span><b data-no-i18n>+${usd(need)}</b> ${T("more profit to go")}</span>`}<em>${T("share of new profit above her best level")}: <span data-no-i18n>${d.rules.risk.burnPct}%</span></em></div>`}`;
    // a scan line across the hero each time a new run lands
    const h = $("dk-hero2");
    if (!reduce && S.lastUpd != null && d.updated !== S.lastUpd) { h.classList.remove("dk-scan"); void h.offsetWidth; h.classList.add("dk-scan"); }
    S.lastUpd = d.updated;
  }
  // ---------------- the top summary line ----------------
  /// the sizing ramp's state: normal / half / minimum
  function rampMode(rk) {
    if (!rk) return null;
    const why = (rk.sample && rk.sample.why) || [];
    if (why.some((w) => /minimum size/.test(w))) return ["Minimum size", "bad"];
    if (why.some((w) => /half size/.test(w))) return ["Half size", "warn"];
    return ["Normal size", "on"];
  }
  function summary(d) {
    const el = $("dk-sum"), live = d.mode === "live";
    el.hidden = !live;
    if (!live) return;
    const m = d.money, dd = d.drawdown || {}, rk = d.risk || {}, today = (d.daily || []).find((x) => x.day === dayOfTs(Date.now() / 1000));
    const b = rk.burn, md = rampMode(rk.ramp);
    const it = (label, val, c = "") => `<span class="dk-sum-i"><small>${T(label)}</small><b class="${c}" data-no-i18n>${val}</b></span>`;
    el.innerHTML = it("Total", `${sgnUsd(m.pnl)}${m.pnlPct != null ? ` · ${pc(m.pnlPct)}` : ""}`, cls(m.pnl)) +
      it("Today", `${today ? sgnUsd(today.pnl) : "—"}${rk.ramp && rk.ramp.dayPct != null ? ` · ${pc(rk.ramp.dayPct)}` : ""}`, cls(today && today.pnl)) +
      it("Deepest drop", dd.max ? "−" + usd(dd.max) : usd(0), dd.max ? "dn" : "") +
      (d.net === "rh" ? it("In ETH", sgnEth(m.pnlEth), cls(m.pnlEth)) : it("Next burn", b ? (b.needed <= 0 ? tr("due now") : `+${usd(b.needed)} ${tr("more profit")}`) : "—", b && b.needed <= 0 ? "up" : "")) +
      (md ? `<span class="dk-sum-i"><small>${T("Buy size")}</small><span class="dk-st ${md[1]}">${T(md[0])}</span></span>` : "");
  }
  // ---------------- risk now: next buy size, open exposure, the burn gauge ----------------
  function riskCard(d) {
    const el = $("dk-risk"), rk = d.risk;
    if (!rk || !rk.ramp) { el.innerHTML = `<div class="dk-empty-s">${T("Starts once the desk is funded.")}</div>`; return; }
    const r = rk.ramp || {}, sm = r.sample, e = rk.exposure || {}, b = rk.burn || {}, set = (d.settings && d.settings.values) || {};
    const live = d.mode === "live";
    const why = [];
    if (r.n >= r.rules.minN && r.pf != null && r.pf !== "inf" && r.pf < 1) why.push(`<li>${T("Last real trades")} <b data-no-i18n>${r.n}</b> · ${T("profit factor")} <b class="dn" data-no-i18n>${r.pf.toFixed(2)}</b> → ${T(r.pf < 0.5 ? "minimum size" : "half size")}</li>`);
    if (r.streak >= r.rules.streak) why.push(`<li><b data-no-i18n>${r.streak}</b> ${T("losses in a row")} → ${T("half size")}</li>`);
    if (r.dayPct != null && r.dayPct <= -r.rules.dayCutPct) why.push(`<li>${T("Today")} <b class="dn" data-no-i18n>${pc(r.dayPct)}</b> → ${T("half size")}</li>`);
    const md = rampMode(r) || ["Normal size", "on"];
    const dd = (d.drawdown || {}).max || 0;
    const fill = b.needed <= 0 ? 1 : Math.max(0.03, Math.min(1, 1 - b.needed / (dd + 0.5)));
    el.innerHTML = `
      <div class="dk-rk-next"><div><small>${T("Next pump scalp buy")}</small><b data-no-i18n>${live && sm ? (sm.ok ? usd(sm.size) : "—") : "—"}</b></div><span class="dk-st ${md[1]}">${T(md[0])}</span></div>
      ${live && sm && !sm.ok ? `<p class="dk-small">${T("Too little to trade right now — the desk waits.")}</p>` : ""}
      <ul class="dk-rk-why">${why.join("") || `<li>${T("Recent real trades aren't in a losing run")} → <b data-no-i18n>${set.tradePct}%</b> ${T("of the desk per buy")}</li>`}
        <li>${T("A buy may lose at most")} <b data-no-i18n>${set.maxLossPct}%</b> ${T("of the desk if the coin falls back to its launch floor")}</li>${sm ? `<li>${T("At the pump scalp's floor limit")} <b data-no-i18n>(${sm.atFloorX}×)</b>: ${T("a buy of at most")} <b data-no-i18n>${usd(sm.cap)}</b></li>` : ""}</ul>
      <div class="dk-rk-exp"><div><small>${T("Open now")}</small><b data-no-i18n>${usd(e.open)}</b><span><span data-no-i18n>${e.n || 0}</span> ${T("open positions")}</span></div>
        <div><small>${T("If every one fell to its launch floor")}</small><b class="${e.toFloor > 0 ? "dn" : ""}" data-no-i18n>${e.toFloor > 0 ? "−" + usd(e.toFloor) : usd(0)}</b><span>${T("the worst case, before any stop-loss")}</span></div></div>
      ${!rk.burn ? "" : `<div class="dk-rk-burn ${b.needed <= 0 ? "due" : ""}"><div class="dk-rk-bh"><small>${T("To the next $ARCIRCLE burn")}</small><b data-no-i18n>${b.needed <= 0 ? tr("due at the next daily run") : "+" + usd(b.needed)}</b></div>
        <div class="dk-rk-bar"><i style="width:${(fill * 100).toFixed(1)}%"></i>${b.needed <= 0 ? `<em class="dk-flame-i" aria-hidden="true"></em>` : ""}</div>
        <p class="dk-small">${T("A burn needs profit above the desk's best level so far.")}</p></div>`}`;
  }
  function cohorts(d) {
    const el = $("dk-coh"), c = (d.risk && d.risk.cohorts) || [];
    if (!c.some((x) => x.n)) { el.innerHTML = `<div class="dk-empty-s">${T("Shown once real trades have closed.")}</div>`; return; }
    const max = Math.max(0.01, ...c.map((x) => Math.abs(x.pnl)));
    el.innerHTML = `<div class="dk-coh">${c.map((x) => `<div class="dk-coh-r"><span data-no-i18n>${esc(x.label)}</span><small><span data-no-i18n>${x.n}</span> ${T("trades")} · <span data-no-i18n>${x.wins}</span> ${T("wins")}${x.pf != null ? ` · PF <span data-no-i18n>${x.pf.toFixed(2)}</span>` : ""}</small>
      <div class="dk-bl-bar"><i class="${x.pnl >= 0 ? "up" : "dn"}" style="${x.pnl >= 0 ? "left:50%" : "right:50%"};width:${((Math.abs(x.pnl) / max) * 50).toFixed(1)}%"></i></div><b class="${cls(x.pnl)}" data-no-i18n>${x.n ? sgnUsd(x.pnl) : "—"}</b></div>`).join("")}</div>
      <p class="dk-small">${T("The last 80 closed trades. A high win rate can still lose money if the losses are bigger than the wins — this shows it in dollars.")}</p>`;
  }
  function replayGrid(d) {
    const el = $("dk-grid"), g = d.risk && d.risk.replay;
    if (!g) { el.innerHTML = `<div class="dk-empty-s">${T("Shown once pump scalps have closed.")}</div>`; return; }
    const max = Math.max(1, ...g.cells.flat().map(Math.abs));
    const near = (list, v) => list.reduce((a, x) => (Math.abs(x - v) < Math.abs(a - v) ? x : a), list[0]);
    const cur = g.cur ? { tp: near(g.tps, g.cur.tp), sl: near(g.sls, g.cur.sl) } : null;
    el.innerHTML = `<div class="dk-tbl-w"><table class="dk-rg"><thead><tr><th><span data-no-i18n>TP ↓ · SL →</span></th>${g.sls.map((sl) => `<th data-no-i18n>−${sl}%</th>`).join("")}</tr></thead><tbody>` +
      g.tps.map((tp, i) => `<tr><th data-no-i18n>+${tp}%</th>${g.sls.map((sl, j) => { const v = g.cells[i][j], a = Math.min(1, Math.abs(v) / max);
        const k = (cur && cur.tp === tp && cur.sl === sl ? " cur" : "") + (g.best && g.best.tp === tp && g.best.sl === sl ? " best" : "");
        return `<td class="${v >= 0 ? "up" : "dn"}${k}" style="--a:${(0.12 + a * 0.6).toFixed(2)}" title="TP +${tp}% · SL −${sl}% · ${pc(v)}" data-no-i18n>${pc(v)}</td>`; }).join("")}</tr>`).join("") + `</tbody></table></div>
      <p class="dk-small"><span data-no-i18n>${g.n}</span> ${T("recent pump scalps (real and paper), replayed with a plain take-profit and stop-loss, no runner.")} <span class="dk-rg-k cur"></span>${T("current exits")} <span class="dk-rg-k best"></span>${T("best in the grid")}</p>`;
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
  function countUp(el, key, to, fmt) {
    const from = S.shown[key];
    S.shown[key] = to;
    if (reduce || from == null || from === to || to == null || !isFinite(to)) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), Dm = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / Dm), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    const box = el.closest(".dk-kpi");
    if (box) { box.classList.remove("dk-flash-up", "dk-flash-dn"); void box.offsetWidth; box.classList.add(to >= from ? "dk-flash-up" : "dk-flash-dn"); }
  }
  function kpis(d) {
    const m = d.money, s = d.stats;
    const live = d.mode === "live";
    const today = (d.daily || []).find((x) => x.day === dayOfTs(Date.now() / 1000));
    const c = s.cost || { usd: 0, n: 0 };
    const tile = (key, label, val, sub, extra = "") => `<div class="dk-kpi ${extra}"><small>${T(label)}</small><b data-no-i18n data-k="${key}">—</b><span>${sub}</span></div>`;
    $("dk-kpis").innerHTML =
      tile("eq", "Desk value", 0, live ? `${T("cash")} <em data-no-i18n>${usd(m.cash)}</em> · ${T("put in")} <em data-no-i18n>${usd(m.netIn)}</em>` : T("starts when the desk is funded")) +
      tile("pnl", "Profit / loss", 0, `<span data-no-i18n>${live && m.pnlPct != null ? pc(m.pnlPct) : ""}</span>`, cls(m.pnl)) +
      tile("today", "Today", 0, `${T("UTC day")}`, cls(today && today.pnl)) +
      tile("win", "Win rate (real)", 0, `${s.realClosed} ${T("real")} · ${s.paperClosed} ${T("paper")} · ${T("avg")} <em data-no-i18n>${pc(s.avgRet)}</em>`) +
      tile("cost", "Trading costs", 0, c.n ? `${T("taxes and price impact on")} <em data-no-i18n>${c.n}</em> ${T("trades")}` : T("counted from the next trade")) +
      tile("best", "Best / worst", 0, s.best ? `<span data-no-i18n>${esc(s.best.sym)} ${pc(s.best.ret)} · ${esc(s.worst.sym)} ${pc(s.worst.ret)}</span>` : "—") +
      tile("veto", "Claude said no", 0, T("real buys stopped by the second opinion")) +
      (d.net === "rh" ? tile("ethp", "Profit in ETH", 0, `${T("put in")} <em data-no-i18n>${eth(m.netInEth)}</em> · ${T("ETH's own price moves left out")}`, cls(m.pnlEth))
        : tile("burn", "$ARCIRCLE burned", 0, `${T("bought with")} <em data-no-i18n>${usd(m.burnedUsd || 0)}</em> ${T("of profit")}`, "dk-burn"));
    const put = (k, v, fmt) => { const el = panel.querySelector(`[data-k="${k}"]`); if (el) countUp(el, k, v, fmt); };
    put("eq", live ? m.equity : null, (v) => (live ? usd(v) : "—"));
    put("pnl", live ? m.pnl : null, (v) => (live ? sgnUsd(v) : "—"));
    put("today", today ? today.pnl : null, (v) => (v == null ? "—" : sgnUsd(v)));
    put("win", s.winRate, (v) => (v == null ? "—" : v.toFixed(1) + "%"));
    put("cost", c.n ? c.usd : null, (v) => (v == null ? "—" : usd(v)));
    const bestEl = panel.querySelector('[data-k="best"]'); if (bestEl) bestEl.textContent = s.best ? pc(s.best.ret) : "—";
    put("veto", s.vetoes || 0, (v) => String(Math.round(v)));
    if (d.net === "rh") { const el = panel.querySelector('[data-k="ethp"]'); if (el) el.textContent = live ? sgnEth(m.pnlEth) : "—"; }
    else put("burn", m.burnedTok || 0, (v) => num(v));
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
    const dd = d.drawdown || {};
    $("dk-dd").innerHTML = dd.max ? `<span>${T("Deepest drop from a high")} <b class="dn" data-no-i18n>−${usd(dd.max)}</b></span><span>${T("Below the high now")} <b class="${dd.now > 0 ? "dn" : "up"}" data-no-i18n>${dd.now > 0 ? "−" + usd(dd.now) : usd(0)}</b></span>` : "";
    const draw = !S.drawn && !reduce && S.hover == null; S.drawn = true;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${T("Profit over time")}" class="${draw ? "dk-drawin" : ""}">
      <defs><linearGradient id="dkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? "#39ff88" : "#ff6e5a"}" stop-opacity=".22"/><stop offset="1" stop-color="${up ? "#39ff88" : "#ff6e5a"}" stop-opacity="0"/></linearGradient></defs>
      <line class="dk-zero" x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/>
      <path d="${line}L${X(x1)},${Y(0)}L${X(x0)},${Y(0)}Z" fill="url(#dkFill)"/>
      <path class="dk-line ${up ? "up" : "dn"}" d="${line}"/>${tip}
      <text class="dk-ax" x="${W - P.r}" y="${Y(0) - 5}" text-anchor="end">$0</text>${hi > 0 ? `<text class="dk-ax" x="${W - P.r}" y="${Y(hi) + 4}" text-anchor="end">${esc(sgnUsd(hi))}</text>` : ""}${lo < 0 ? `<text class="dk-ax" x="${W - P.r}" y="${Y(lo) - 4}" text-anchor="end">${esc(sgnUsd(lo))}</text>` : ""}
    </svg>${el.dataset.tip ? `<div class="dk-tip" data-no-i18n>${esc(el.dataset.tip)}</div>` : ""}`;
  }
  function calendar(d) {
    const el = $("dk-cal"), days = d.daily || [];
    if (!days.length) { el.innerHTML = `<div class="dk-empty-s">${T("Starts with the first funded day.")}</div>`; return; }
    const max = Math.max(0.5, ...days.map((x) => Math.abs(x.pnl)));
    el.innerHTML = `<div class="dk-cal">${days.map((x) => { const a = Math.min(1, Math.abs(x.pnl) / max); return `<div class="dk-cd ${x.pnl > 0 ? "up" : x.pnl < 0 ? "dn" : ""}" style="--a:${(0.18 + a * 0.82).toFixed(2)}" title="${esc(x.day)} · ${esc(sgnUsd(x.pnl))}"><small data-no-i18n>${esc(x.day.slice(5))}</small><b data-no-i18n>${sgnUsd(x.pnl)}</b></div>`; }).join("")}</div>`;
  }
  function baseline(d) {
    const s = d.stats, el = $("dk-base");
    if (!s.realClosed || !s.paperClosed) { el.innerHTML = `<div class="dk-empty-s">${T("Shown once there are real and paper trades to compare.")}</div>`; return; }
    const a = s.avgRet, b = s.paperAvg, m = Math.max(1, Math.abs(a), Math.abs(b));
    const bar = (label, v, sub) => `<div class="dk-bl"><span>${T(label)}<small>${sub}</small></span><div class="dk-bl-bar"><i class="${v >= 0 ? "up" : "dn"}" style="${v >= 0 ? "left:50%" : "right:50%"};width:${((Math.abs(v) / m) * 50).toFixed(1)}%"></i></div><b class="${cls(v)}" data-no-i18n>${pc(v)}</b></div>`;
    el.innerHTML = bar("ARCIA's real trades", a, `<span data-no-i18n>${s.realClosed}</span> ${T("trades")}`) + bar("Taking every setup", b, `<span data-no-i18n>${s.paperClosed}</span> ${T("paper trades")}`) +
      `<p class="dk-small">${a > b ? T("Her picks have done better than buying everything that passed the gates.") : T("Her picks haven't beaten buying everything that passed the gates yet — that's what the learning is for.")} ${T("Average return per trade, every cost included.")}</p>`;
  }
  function board(d) {
    const el = $("dk-board"), rows = (d.leaderboard || []).slice().sort((x, y) => (y.pnl || 0) - (x.pnl || 0));
    if (!rows.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="dk-tbl-w"><table class="dk-tbl"><thead><tr><th>${T("Playbook")}</th><th>${T("Real trades")}</th><th>${T("Win rate")}</th><th>${T("Avg per trade")}</th><th>${T("P&L")}</th><th title="${T("gross wins ÷ gross losses")}">${T("Profit factor")}</th><th>${T("Avg hold")}</th><th>${T("All trades avg")}</th><th>${T("Status")}</th></tr></thead><tbody>` +
      rows.map((r) => `<tr class="${r.benched ? "dk-bench" : ""}"><td>${pbTag(r.k, r.name)}</td><td data-no-i18n>${r.real}</td><td data-no-i18n>${r.winRate == null ? "—" : r.winRate + "%"}</td><td class="${cls(r.avgRet)}" data-no-i18n>${pc(r.avgRet)}</td><td class="${cls(r.pnl)}" data-no-i18n>${r.real ? sgnUsd(r.pnl) : "—"}</td><td data-no-i18n>${r.pf == null ? "—" : r.pf.toFixed(2)}</td><td data-no-i18n>${dur(r.hold)}</td><td class="${cls(r.all.mean)}" data-no-i18n>${r.all.n ? pc(r.all.mean) : "—"}</td><td>${r.realOn === false ? `<span class="dk-st">${T("Paper only")}</span>` : r.benched ? `<span class="dk-st bench">${T("Benched")}</span>` : r.all.n ? `<span class="dk-st on">${T("Active")}</span>` : `<span class="dk-st on">${T("Real money")}</span>`}</td></tr>`).join("") + `</tbody></table></div>` +
      `<p class="dk-small">${T("A playbook is benched when it has clearly lost money: 20+ trades averaging −1% or worse, or 10+ averaging −10% or worse. It keeps trading on paper and comes back to real money on its own when those results recover. All trades avg counts paper trades at half weight.")}</p>`;
  }
  function proof(d) {
    const el = $("dk-proof"), c = d.chain || {};
    if (!d.desk) { el.innerHTML = `<div class="dk-empty-s">${T("The desk contract isn't set yet.")}</div>`; return; }
    const diff = c.usdc != null && c.cash != null ? c.usdc - c.cash : null, okM = diff != null && Math.abs(diff) < 0.05;
    const rh = d.net === "rh";
    el.innerHTML = `<div class="dk-proof"><div><small>${T(rh ? "WETH in the desk contract" : "USDC in the desk contract")}</small><b data-no-i18n>${rh ? (c.weth == null ? "—" : `${eth(c.weth, 6)} · ${usd(c.usdc)}`) : c.usdc == null ? "—" : usd(c.usdc)}</b><a class="dk-tx" href="${EXPL("address", d.desk)}" target="_blank" rel="noopener" data-no-i18n>${short(d.desk)} ↗</a></div>
      <div><small>${T("Cash on this page")}</small><b data-no-i18n>${usd(c.cash)}</b><span>${T("from her last run")}</span></div>
      <div class="dk-pf ${diff == null ? "" : okM ? "ok" : "warn"}">${diff == null ? T("Couldn't read the chain just now.") : okM ? T("They match.") : `${T("They differ by")} <b data-no-i18n>${usd(Math.abs(diff))}</b> — ${T("usually a trade settling between runs.")}`}</div></div>
      <p class="dk-small">${T("Open positions are held as tokens in the same contract; their value is what an exact sell quote from the contract says right now.")}</p>`;
    deposit(d);
  }
  // ---- the owner's money panel (Rules → On-chain check): deposit, withdraw, pause. Shown only to the desk's owner
  // wallet — the contract lets only the owner withdraw or pause, and anyone else's deposit could only be taken
  // out by the owner.
  //   deposit  — an ERC-20 transfer of Arc's USDC (0x3600…) to the desk (a native USDC send would fail: no receive())
  //   withdraw — ArciaDesk.withdraw(USDC, amount): always to the owner; works at any time, paused or not
  //   pause    — ArciaDesk.setPaused: stops new buys; selling (her exits) keeps working
  // The desk records deposits and withdrawals on its next run; neither counts as profit or loss.
  const USDC20 = "0x3600000000000000000000000000000000000000";
  const DESK_ABI = ["function owner() view returns (address)", "function paused() view returns (bool)", "function withdraw(address,uint256)", "function setPaused(bool)",
    "function maxTrade() view returns (uint256)", "function dailyCap() view returns (uint256)", "function burnCap() view returns (uint256)", "function setCaps(uint256,uint256,uint256)"];
  const NOLIMIT = 2n ** 256n - 1n, isOpenEnded = (x) => x != null && x >= 2n ** 128n;
  const U20_ABI = ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  // the owner's settings (api/desk.mjs POST): the same keys, order and message as api/_desk.mjs settingsMessage
  const SETF = [["tradePct", "Buy size", "% of desk"], ["maxLossPct", "Most a buy may lose at the launch floor", "% of desk"], ["scalpFloorX", "Pump scalp: at most", "× launch floor"],
    ["scalpMaxDump", "Pump scalp: top-10 dump under", "%"], ["earlyFailPct", "Early exit: down", "%"], ["earlyFailMin", "Early exit: in the first", "min"]];
  const setMsg = (desk, v, issued) => `ARCIRCLE PAD — ARCIA DESK settings\nDesk: ${String(desk).toLowerCase()}\nSettings: ${JSON.stringify(Object.fromEntries(SETF.map(([k]) => [k, Number(v[k])])))}\nIssued: ${issued}`;
  let depBox = null, deskOwner = null, ownerAsked = false, depLast = null, chain = { bal: null, paused: null, at: 0 }, rhBox = null, rhLast = null;
  // the page only repaints when the desk's numbers change, so a wallet that connects later is checked here
  setInterval(() => { if (depLast && !document.hidden) deposit(depLast); }, 3000);
  const fmt6 = (x) => Number(ethers.formatUnits(x, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  async function readChain(d) {
    if (typeof readProvider !== "function") return;
    const rp = readProvider();
    const dk = new ethers.Contract(d.desk, DESK_ABI, rp);
    const [bal, paused, perBuy, perDay, burnCap] = await Promise.all([new ethers.Contract(USDC20, U20_ABI, rp).balanceOf(d.desk).catch(() => null), dk.paused().catch(() => null),
      dk.maxTrade().catch(() => null), dk.dailyCap().catch(() => null), dk.burnCap().catch(() => null)]);
    chain = { bal, paused, perBuy, perDay, burnCap, at: Date.now() };
    paintMoney(d);
  }
  function paintMoney(d) {
    if (!depBox) return;
    const b = depBox.querySelector("[data-m=bal]"), ps = depBox.querySelector("[data-m=pst]"), pb = depBox.querySelector("[data-m=pause]");
    b.textContent = chain.bal == null ? "—" : fmt6(chain.bal) + " USDC";
    const open = (d.open || []).length;
    depBox.querySelector("[data-m=open]").hidden = !open;
    depBox.querySelector("[data-m=open]").textContent = open ? `${open} ${T(open === 1 ? "position is open — its coins aren't USDC yet. Pause first and wait for it to close to take everything out." : "positions are open — their coins aren't USDC yet. Pause first and wait for them to close to take everything out.")}` : "";
    ps.className = "dk-st " + (chain.paused ? "bench" : "on");
    ps.textContent = chain.paused == null ? "—" : T(chain.paused ? "Paused — no new buys" : "Trading");
    pb.textContent = T(chain.paused ? "Resume buying" : "Pause new buys");
    pb.disabled = chain.paused == null;
    const lim = (x) => (x == null ? "—" : isOpenEnded(x) ? T("no limit") : fmt6(x) + " USDC");
    depBox.querySelector("[data-m=lbuy]").textContent = lim(chain.perBuy);
    depBox.querySelector("[data-m=lday]").textContent = lim(chain.perDay);
    depBox.querySelector("[data-m=lfree]").disabled = chain.burnCap == null || (isOpenEnded(chain.perBuy) && isOpenEnded(chain.perDay));
    const st = d.settings;
    if (st) {
      for (const [k] of SETF) {
        const i = depBox.querySelector(`[data-s="${k}"]`), bd = st.bounds && st.bounds[k];
        if (bd) { i.min = bd[0]; i.max = bd[1]; depBox.querySelector(`[data-sb="${k}"]`).textContent = `${bd[0]}–${bd[1]} · ${tr("default value")} ${st.defaults[k]}`; }
        if (!i.dataset.dirty && document.activeElement !== i) i.value = st.values[k];
      }
      depBox.querySelector("[data-m=sby]").innerHTML = st.at ? `${T("last saved")} <b data-no-i18n>${when(st.at)} UTC</b>` : T("defaults");
    }
    const post = depBox.querySelector("[data-m=post]");
    post.value = (d.risk && d.risk.postDraft) || tr("Starts once the desk is funded.");
  }
  function deposit(d) {
    if (d.net === "rh") { if (depBox) depBox.hidden = true; return depositRH(d); }
    if (rhBox) rhBox.hidden = true;
    depLast = d;
    if (!d.desk || typeof ethers === "undefined") return;
    if (!ownerAsked && typeof readProvider === "function") {
      ownerAsked = true;
      new ethers.Contract(d.desk, DESK_ABI, readProvider()).owner().then((o) => { deskOwner = String(o).toLowerCase(); deposit(d); }).catch(() => { ownerAsked = false; });
    }
    const me = typeof state !== "undefined" && state.account ? String(state.account).toLowerCase() : null;
    const show = !!(me && deskOwner && me === deskOwner);
    if (!depBox) {
      if (!show) return;
      depBox = document.createElement("div");
      depBox.className = "dk-dep"; depBox.id = "dk-dep";
      depBox.innerHTML = `<div class="dk-dep-h"><b>${T("Desk money")}</b><span class="dk-st on">${T("Owner")}</span><span class="dk-dep-bal"><small>${T("USDC in the contract")}</small><b data-m="bal" data-no-i18n>—</b></span></div>
        <div class="dk-dep-grid">
          <div class="dk-dep-col"><small>${T("Deposit")}</small><div class="dk-dep-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="USDC" aria-label="${T("USDC to add")}" data-m="din"><button type="button" class="dk-dep-go" data-m="dgo">${T("Deposit")}</button></div>
            <p class="dk-small">${T("From this wallet to the desk contract, as a USDC token transfer.")}</p></div>
          <div class="dk-dep-col"><small>${T("Withdraw")}</small><div class="dk-dep-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="USDC" aria-label="${T("USDC to take out")}" data-m="win"><button type="button" class="dk-dep-max" data-m="max">${T("Max")}</button><button type="button" class="dk-dep-go dk-dep-out" data-m="wgo">${T("Withdraw")}</button></div>
            <p class="dk-small">${T("From the desk contract to the owner wallet — any amount, any time, paused or not.")}</p></div>
        </div>
        <p class="dk-dep-warn" data-m="open" hidden></p>
        <div class="dk-dep-lim"><div class="dk-dep-limh"><small>${T("Contract limits")}</small><span>${T("per buy")} <b data-m="lbuy" data-no-i18n>—</b> · ${T("per day")} <b data-m="lday" data-no-i18n>—</b></span></div>
          <div class="dk-dep-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="${T("per buy")}" aria-label="${T("USDC per buy")}" data-m="lb"><input type="number" min="0" step="any" inputmode="decimal" placeholder="${T("per day")}" aria-label="${T("USDC per day")}" data-m="ld"><button type="button" class="dk-dep-max" data-m="lset">${T("Set")}</button><button type="button" class="dk-dep-p" data-m="lfree">${T("Remove limits")}</button></div>
          <p class="dk-small">${T("A buy's size comes from the settings below (at least $3); these only cap it. They are also the most the trading key could spend in a day if it ever leaked — with no limit, the whole desk.")}</p></div>
        <div class="dk-dep-set"><div class="dk-dep-limh"><small>${T("Sizing and pump scalp settings")}</small><span data-m="sby"></span></div>
          <div class="dk-set-grid">${SETF.map(([k, label, unit]) => `<label><span>${T(label)}</span><span class="dk-set-in"><input type="number" step="any" inputmode="decimal" data-s="${k}" aria-label="${T(label)}"><em data-no-i18n>${unit}</em></span><small data-sb="${k}" data-no-i18n></small></label>`).join("")}</div>
          <div class="dk-dep-row"><button type="button" class="dk-dep-max" data-m="sset">${T("Sign and save")}</button><button type="button" class="dk-dep-p" data-m="sdef">${T("Back to defaults")}</button></div>
          <p class="dk-small">${T("Signed by the owner wallet (no gas). They change how much a buy spends and which pump scalps pass — they can't make her trade. Used from her next run.")}</p></div>
        <details class="dk-dep-post"><summary>${T("Daily post draft")}</summary><textarea data-m="post" rows="7" data-no-i18n readonly></textarea><div class="dk-dep-row"><button type="button" class="dk-dep-p" data-m="pcopy">${T("Copy")}</button></div>
          <p class="dk-small">${T("Real numbers from the desk right now. Edit before posting.")}</p></details>
        <div class="dk-dep-pause"><span class="dk-st" data-m="pst">—</span><button type="button" class="dk-dep-p" data-m="pause" disabled>—</button><small>${T("Pausing stops new buys only; she still sells what she holds.")}</small></div>
        <p class="dk-small">${T("The desk records deposits and withdrawals on its next run (about a minute). Neither counts as profit or loss.")}</p>
        <p class="dk-dep-msg" aria-live="polite"></p>`;
      $("dk-proof").insertAdjacentElement("afterend", depBox);
      const $m = (k) => depBox.querySelector(`[data-m=${k}]`);
      const msg = (h, k) => { const m = depBox.querySelector(".dk-dep-msg"); m.className = "dk-dep-msg" + (k ? " " + k : ""); m.innerHTML = h; };
      const txLink = (h) => `<a href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${short(h)} ↗</a>`;
      const errText = (err) => (err && (err.code === "ACTION_REJECTED" || err.code === 4001) ? T("Cancelled in your wallet.") : esc(String((err && (err.shortMessage || err.reason || err.message)) || T("The transaction didn't go through."))).slice(0, 200));
      const busy = (on) => depBox.querySelectorAll("button").forEach((x) => { x.disabled = on; });
      async function signer() {
        if (!state.signer && typeof connectWallet === "function") await connectWallet();
        if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
        if (!state.signer) throw new Error(T("Connect the owner wallet first."));
        if (String(state.account).toLowerCase() !== deskOwner) throw new Error(T("Only the desk's owner wallet can do this."));
        return state.signer;
      }
      const amountOf = (k) => { let a; try { a = ethers.parseUnits(String($m(k).value || "").trim(), 6); } catch { a = 0n; } return a; };
      async function run(fn) { busy(true); try { await fn(); } catch (err) { msg(errText(err), "bad"); } finally { busy(false); await readChain(depLast).catch(() => {}); } }
      $m("dgo").addEventListener("click", () => run(async () => {
        const amt = amountOf("din");
        if (!(amt > 0n)) { msg(T("Enter an amount of USDC."), "bad"); return; }
        const u = new ethers.Contract(USDC20, U20_ABI, await signer());
        const bal = await u.balanceOf(state.account);
        if (bal < amt) { msg(`${T("This wallet holds")} ${fmt6(bal)} USDC.`, "bad"); return; }
        msg(T("Confirm in your wallet…"));
        const tx = await u.transfer(depLast.desk, amt);
        msg(`${T("Sending…")} ${txLink(tx.hash)}`);
        await tx.wait();
        $m("din").value = "";
        msg(`${T("Added")} <b data-no-i18n>${fmt6(amt)} USDC</b>. ${T("The desk picks it up on its next run.")} ${txLink(tx.hash)}`, "ok");
      }));
      $m("max").addEventListener("click", () => { if (chain.bal != null) $m("win").value = ethers.formatUnits(chain.bal, 6); });
      $m("wgo").addEventListener("click", () => run(async () => {
        const amt = amountOf("win");
        if (!(amt > 0n)) { msg(T("Enter an amount of USDC."), "bad"); return; }
        const dk = new ethers.Contract(depLast.desk, DESK_ABI, await signer());
        const have = await new ethers.Contract(USDC20, U20_ABI, readProvider()).balanceOf(depLast.desk);
        if (have < amt) { msg(`${T("The desk holds")} ${fmt6(have)} USDC.`, "bad"); return; }
        msg(T("Confirm in your wallet…"));
        const tx = await dk.withdraw(USDC20, amt);
        msg(`${T("Withdrawing…")} ${txLink(tx.hash)}`);
        await tx.wait();
        $m("win").value = "";
        msg(`${T("Withdrew")} <b data-no-i18n>${fmt6(amt)} USDC</b> ${T("to the owner wallet.")} ${txLink(tx.hash)}`, "ok");
      }));
      async function setCaps(buy, day) {
        if (chain.burnCap == null) throw new Error(T("Couldn't read the contract — try again."));
        const dk = new ethers.Contract(depLast.desk, DESK_ABI, await signer());
        msg(T("Confirm in your wallet…"));
        const tx = await dk.setCaps(buy, day, chain.burnCap); // the daily burn cap stays as it is
        await tx.wait();
        return tx;
      }
      $m("lset").addEventListener("click", () => run(async () => {
        const b = amountOf("lb"), dd = amountOf("ld");
        if (!(b > 0n) || !(dd > 0n)) { msg(T("Enter both limits in USDC."), "bad"); return; }
        if (dd < b) { msg(T("The day's limit can't be below one buy."), "bad"); return; }
        const tx = await setCaps(b, dd);
        $m("lb").value = ""; $m("ld").value = "";
        msg(`${T("Limits set")}: ${T("per buy")} <b data-no-i18n>${fmt6(b)}</b> · ${T("per day")} <b data-no-i18n>${fmt6(dd)}</b> USDC. ${txLink(tx.hash)}`, "ok");
      }));
      $m("lfree").addEventListener("click", () => run(async () => {
        const tx = await setCaps(NOLIMIT, NOLIMIT);
        msg(`${T("Limits removed: a buy is sized by the desk's settings with no cap, and there's no daily limit.")} ${txLink(tx.hash)}`, "ok");
      }));
      $m("pause").addEventListener("click", () => run(async () => {
        const next = !chain.paused;
        const dk = new ethers.Contract(depLast.desk, DESK_ABI, await signer());
        msg(T("Confirm in your wallet…"));
        const tx = await dk.setPaused(next);
        await tx.wait();
        msg(`${T(next ? "Paused: no new buys. She keeps selling what she holds." : "Resumed: she can buy again.")} ${txLink(tx.hash)}`, "ok");
      }));
      depBox.querySelectorAll("[data-s]").forEach((i) => i.addEventListener("input", () => { i.dataset.dirty = "1"; }));
      async function saveSet(v) {
        const sg = await signer();
        for (const [k, label] of SETF) {
          const bd = depLast.settings && depLast.settings.bounds[k];
          if (!isFinite(v[k]) || (bd && (v[k] < bd[0] || v[k] > bd[1]))) { msg(`${T(label)}: ${bd ? `${bd[0]}–${bd[1]}` : "?"}`, "bad"); return; }
        }
        const issued = new Date().toISOString();
        msg(T("Sign in your wallet…"));
        const signature = await sg.signMessage(setMsg(depLast.desk, v, issued));
        const r = await fetch("/api/desk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settings", values: v, issued, signature }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { msg(esc(j.error || T("Couldn't save — try again.")), "bad"); return; }
        depBox.querySelectorAll("[data-s]").forEach((i) => { delete i.dataset.dirty; if (j.settings.values[i.dataset.s] != null) i.value = j.settings.values[i.dataset.s]; });
        depLast.settings = { ...depLast.settings, values: { ...depLast.settings.values, ...j.settings.values }, at: j.settings.at, by: j.settings.by };
        msg(T("Saved. She uses them from her next run."), "ok");
        setTimeout(load, 25000); // the page's copy of /api/desk is cached for about 20 seconds
      }
      $m("sset").addEventListener("click", () => run(() => saveSet(Object.fromEntries(SETF.map(([k]) => [k, Number(depBox.querySelector(`[data-s="${k}"]`).value)])))));
      $m("sdef").addEventListener("click", () => run(() => saveSet({ ...depLast.settings.defaults })));
      $m("pcopy").addEventListener("click", async () => { const t = $m("post"); try { await navigator.clipboard.writeText(t.value); msg(T("Copied."), "ok"); } catch { t.removeAttribute("readonly"); t.select(); } });
      readChain(d).catch(() => {});
    }
    depBox.hidden = !show;
    if (show && Date.now() - chain.at > 20000) readChain(d).catch(() => {});
    else if (show) paintMoney(d);
  }
  // ---- the Robinhood desk's owner panel. Its wallet moves happen on Robinhood Chain, so the page points to them
  // (a plain ETH send to deposit — the contract wraps it — and the contract's Write tab on the explorer for
  // withdrawETH / setPaused / setCaps); the settings are signed here (a signature, no gas, any network).
  function depositRH(d) {
    rhLast = d;
    const me = typeof state !== "undefined" && state.account ? String(state.account).toLowerCase() : null;
    const show = !!(d.desk && me && d.owner && me === String(d.owner).toLowerCase());
    if (!rhBox) {
      if (!show) return;
      rhBox = document.createElement("div");
      rhBox.className = "dk-dep"; rhBox.id = "dk-dep-rh";
      rhBox.innerHTML = `<div class="dk-dep-h"><b>${T("Desk money")}</b><span class="dk-st on">${T("Owner")}</span><span class="dk-dep-bal"><small>${T("WETH in the contract")}</small><b data-m="bal" data-no-i18n>—</b></span></div>
        <p class="dk-small dk-rh-net">${T("These send transactions on Robinhood Chain: your wallet is asked to switch to it first.")}</p>
        <div class="dk-dep-grid">
          <div class="dk-dep-col"><small>${T("Deposit")}</small><div class="dk-dep-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="ETH" aria-label="${T("ETH to add")}" data-m="din"><button type="button" class="dk-dep-go" data-m="dgo">${T("Deposit")}</button></div>
            <p class="dk-small">${T("ETH from this wallet to the desk contract — it becomes WETH there.")}</p>
            <div class="dk-dep-row"><code class="dk-addr-c" data-m="addr" data-no-i18n></code><button type="button" class="dk-dep-max" data-m="copy">${T("Copy")}</button></div></div>
          <div class="dk-dep-col"><small>${T("Withdraw")}</small><div class="dk-dep-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="ETH" aria-label="${T("ETH to take out")}" data-m="win"><button type="button" class="dk-dep-max" data-m="max">${T("Max")}</button><button type="button" class="dk-dep-go dk-dep-out" data-m="wgo">${T("Withdraw")}</button></div>
            <p class="dk-small">${T("From the desk contract to the owner wallet, as ETH — any amount, any time, paused or not.")}</p></div>
        </div>
        <p class="dk-dep-warn" data-m="open" hidden></p>
        <div class="dk-dep-lim"><div class="dk-dep-limh"><small>${T("Contract limits")}</small><span>${T("per buy")} <b data-m="lbuy" data-no-i18n>—</b> · ${T("per day")} <b data-m="lday" data-no-i18n>—</b></span></div>
          <div class="dk-dep-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="${T("per buy")} (ETH)" aria-label="${T("ETH per buy")}" data-m="lb"><input type="number" min="0" step="any" inputmode="decimal" placeholder="${T("per day")} (ETH)" aria-label="${T("ETH per day")}" data-m="ld"><button type="button" class="dk-dep-max" data-m="lset">${T("Set")}</button></div>
          <p class="dk-small">${T("A buy's size comes from the settings below; these only cap it. They are also the most the trading key could spend in a day if it ever leaked.")}</p></div>
        <div class="dk-dep-pause"><span class="dk-st" data-m="pst">—</span><button type="button" class="dk-dep-p" data-m="pause" disabled>—</button><small>${T("Pausing stops new buys only; she still sells what she holds.")}</small></div>
        <p class="dk-small">${T("Other tokens held in the contract can be taken out from its Write tab on the explorer (withdraw).")} <a data-m="write" target="_blank" rel="noopener">${T("Open the contract")} ↗</a></p>
        <div class="dk-dep-set"><div class="dk-dep-limh"><small>${T("Sizing and pump scalp settings")}</small><span data-m="sby"></span></div>
          <div class="dk-set-grid">${SETF.map(([k, label, unit]) => `<label><span>${T(label)}</span><span class="dk-set-in"><input type="number" step="any" inputmode="decimal" data-s="${k}" aria-label="${T(label)}"><em data-no-i18n>${unit}</em></span><small data-sb="${k}" data-no-i18n></small></label>`).join("")}</div>
          <div class="dk-dep-row"><button type="button" class="dk-dep-max" data-m="sset">${T("Sign and save")}</button><button type="button" class="dk-dep-p" data-m="sdef">${T("Back to defaults")}</button></div>
          <p class="dk-small">${T("Signed by the owner wallet (no gas). They change how much a buy spends and which pump scalps pass — they can't make her trade. Used from her next run.")}</p></div>
        <details class="dk-dep-post"><summary>${T("Daily post draft")}</summary><textarea data-m="post" rows="7" data-no-i18n readonly></textarea><div class="dk-dep-row"><button type="button" class="dk-dep-p" data-m="pcopy">${T("Copy")}</button></div></details>
        <p class="dk-small">${T("The desk records deposits and withdrawals on its next run (about a minute). Neither counts as profit or loss.")}</p>
        <p class="dk-dep-msg" aria-live="polite"></p>`;
      $("dk-proof").insertAdjacentElement("afterend", rhBox);
      const $m = (k) => rhBox.querySelector(`[data-m=${k}]`);
      const msg = (h, k) => { const m = rhBox.querySelector(".dk-dep-msg"); m.className = "dk-dep-msg" + (k ? " " + k : ""); m.innerHTML = h; };
      $m("copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(rhLast.desk); msg(T("Copied."), "ok"); } catch { msg(esc(rhLast.desk)); } });
      $m("pcopy").addEventListener("click", async () => { const t = $m("post"); try { await navigator.clipboard.writeText(t.value); msg(T("Copied."), "ok"); } catch { t.removeAttribute("readonly"); t.select(); } });
      rhBox.querySelectorAll("[data-s]").forEach((i) => i.addEventListener("input", () => { i.dataset.dirty = "1"; }));
      // ---- wallet transactions on Robinhood Chain (chain 4663): switch the wallet there, then sign as the owner
      const RH_ADD = { chainId: "0x1237", chainName: "Robinhood Chain", rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
      const RH_ABI = ["function withdrawETH(uint256)", "function setPaused(bool)", "function setCaps(uint256,uint256)"];
      const rhTx = (h) => `<a href="${rhLast.explorer}/tx/${h}" target="_blank" rel="noopener" data-no-i18n>${short(h)} ↗</a>`;
      const errText = (err) => (err && (err.code === "ACTION_REJECTED" || err.code === 4001) ? T("Cancelled in your wallet.") : esc(String((err && (err.shortMessage || err.reason || err.message)) || T("The transaction didn't go through."))).slice(0, 220));
      async function rhSigner() {
        if (typeof ethers === "undefined") throw new Error(T("The wallet library hasn't loaded yet — try again."));
        if (!state.account && typeof connectWallet === "function") await connectWallet();
        const eip = state.walletProvider || window.ethereum;
        if (!state.account || !eip) throw new Error(T("Connect the owner wallet first."));
        if (String(state.account).toLowerCase() !== String(rhLast.owner).toLowerCase()) throw new Error(T("Only the desk's owner wallet can do this."));
        window.arcChainSwitching = true; // the site mustn't pull the wallet back to Arc meanwhile
        try { await eip.request({ method: "wallet_switchEthereumChain", params: [{ chainId: RH_ADD.chainId }] }); }
        catch (e) {
          if (e && (e.code === 4902 || /unrecognized|not been added|unknown chain|not added/i.test(String(e.message)))) await eip.request({ method: "wallet_addEthereumChain", params: [RH_ADD] });
          else throw e;
        }
        const bp = new ethers.BrowserProvider(eip);
        if (Number((await bp.getNetwork()).chainId) !== 4663) throw new Error(T("Switch your wallet to Robinhood Chain and try again."));
        return bp.getSigner(state.account);
      }
      const ethIn = (k) => { let a; try { a = ethers.parseEther(String($m(k).value || "").trim()); } catch { a = 0n; } return a; };
      async function rhRun(fn) {
        const bs = rhBox.querySelectorAll("button"); bs.forEach((x) => { x.disabled = true; });
        try { await fn(); setTimeout(load, 4000); setTimeout(load, 25000); } catch (err) { msg(errText(err), "bad"); }
        finally { window.arcChainSwitching = false; bs.forEach((x) => { x.disabled = false; }); }
      }
      $m("dgo").addEventListener("click", () => rhRun(async () => {
        const amt = ethIn("din");
        if (!(amt > 0n)) { msg(T("Enter an amount of ETH."), "bad"); return; }
        const sg = await rhSigner();
        const bal = await sg.provider.getBalance(state.account);
        if (bal < amt) { msg(`${T("This wallet holds")} ${eth(Number(ethers.formatEther(bal)), 6)}.`, "bad"); return; }
        msg(T("Confirm in your wallet…"));
        const tx = await sg.sendTransaction({ to: rhLast.desk, value: amt });
        msg(`${T("Sending…")} ${rhTx(tx.hash)}`);
        await tx.wait();
        $m("din").value = "";
        msg(`${T("Added")} <b data-no-i18n>${eth(Number(ethers.formatEther(amt)), 6)}</b>. ${T("The desk picks it up on its next run.")} ${rhTx(tx.hash)}`, "ok");
      }));
      $m("max").addEventListener("click", () => { const c = rhLast.chain || {}; if (c.weth != null) $m("win").value = String(c.weth); });
      $m("wgo").addEventListener("click", () => rhRun(async () => {
        const amt = ethIn("win");
        if (!(amt > 0n)) { msg(T("Enter an amount of ETH."), "bad"); return; }
        const have = rhLast.chain && rhLast.chain.weth != null ? ethers.parseEther(String(rhLast.chain.weth)) : null;
        if (have != null && amt > have) { msg(`${T("The desk holds")} ${eth(rhLast.chain.weth, 6)}.`, "bad"); return; }
        const dk = new ethers.Contract(rhLast.desk, RH_ABI, await rhSigner());
        msg(T("Confirm in your wallet…"));
        const tx = await dk.withdrawETH(amt);
        msg(`${T("Withdrawing…")} ${rhTx(tx.hash)}`);
        await tx.wait();
        $m("win").value = "";
        msg(`${T("Withdrew")} <b data-no-i18n>${eth(Number(ethers.formatEther(amt)), 6)}</b> ${T("to the owner wallet.")} ${rhTx(tx.hash)}`, "ok");
      }));
      $m("lset").addEventListener("click", () => rhRun(async () => {
        const b = ethIn("lb"), dd = ethIn("ld");
        if (!(b > 0n) || !(dd > 0n)) { msg(T("Enter both limits in ETH."), "bad"); return; }
        if (dd < b) { msg(T("The day's limit can't be below one buy."), "bad"); return; }
        const dk = new ethers.Contract(rhLast.desk, RH_ABI, await rhSigner());
        msg(T("Confirm in your wallet…"));
        const tx = await dk.setCaps(b, dd);
        await tx.wait();
        $m("lb").value = ""; $m("ld").value = "";
        msg(`${T("Limits set")}: ${T("per buy")} <b data-no-i18n>${eth(Number(ethers.formatEther(b)), 6)}</b> · ${T("per day")} <b data-no-i18n>${eth(Number(ethers.formatEther(dd)), 6)}</b>. ${rhTx(tx.hash)}`, "ok");
      }));
      $m("pause").addEventListener("click", () => rhRun(async () => {
        const next = !rhLast.paused;
        const dk = new ethers.Contract(rhLast.desk, RH_ABI, await rhSigner());
        msg(T("Confirm in your wallet…"));
        const tx = await dk.setPaused(next);
        await tx.wait();
        rhLast.paused = next; depositRH(rhLast);
        msg(`${T(next ? "Paused: no new buys. She keeps selling what she holds." : "Resumed: she can buy again.")} ${rhTx(tx.hash)}`, "ok");
      }));
      async function saveSet(v) {
        const busy = (on) => rhBox.querySelectorAll("button").forEach((x) => { x.disabled = on; });
        busy(true);
        try {
          if (!state.signer && typeof connectWallet === "function") await connectWallet();
          if (!state.signer) throw new Error(T("Connect the owner wallet first."));
          if (String(state.account).toLowerCase() !== String(rhLast.owner).toLowerCase()) throw new Error(T("Only the desk's owner wallet can do this."));
          for (const [k, label] of SETF) {
            const bd = rhLast.settings && rhLast.settings.bounds[k];
            if (!isFinite(v[k]) || (bd && (v[k] < bd[0] || v[k] > bd[1]))) { msg(`${T(label)}: ${bd ? `${bd[0]}–${bd[1]}` : "?"}`, "bad"); return; }
          }
          const issued = new Date().toISOString();
          msg(T("Sign in your wallet…"));
          const signature = await state.signer.signMessage(setMsg(rhLast.desk, v, issued));
          const r = await fetch("/api/desk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settings", chain: "rh", values: v, issued, signature }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) { msg(esc(j.error || T("Couldn't save — try again.")), "bad"); return; }
          rhBox.querySelectorAll("[data-s]").forEach((i) => { delete i.dataset.dirty; if (j.settings.values[i.dataset.s] != null) i.value = j.settings.values[i.dataset.s]; });
          rhLast.settings = { ...rhLast.settings, values: { ...rhLast.settings.values, ...j.settings.values }, at: j.settings.at, by: j.settings.by };
          msg(T("Saved. She uses them from her next run."), "ok");
          setTimeout(load, 25000);
        } catch (err) { msg(err && (err.code === "ACTION_REJECTED" || err.code === 4001) ? T("Cancelled in your wallet.") : esc(String((err && (err.shortMessage || err.message)) || "")).slice(0, 200), "bad"); }
        finally { busy(false); }
      }
      $m("sset").addEventListener("click", () => saveSet(Object.fromEntries(SETF.map(([k]) => [k, Number(rhBox.querySelector(`[data-s="${k}"]`).value)]))));
      $m("sdef").addEventListener("click", () => saveSet({ ...rhLast.settings.defaults }));
    }
    rhBox.hidden = !show;
    if (!show) return;
    const c = d.chain || {};
    rhBox.querySelector("[data-m=bal]").textContent = c.weth == null ? "—" : eth(c.weth, 6);
    rhBox.querySelector("[data-m=addr]").textContent = d.desk;
    rhBox.querySelector("[data-m=write]").href = `${d.explorer}/address/${d.desk}?tab=write_contract`;
    const ps = rhBox.querySelector("[data-m=pst]"), pb = rhBox.querySelector("[data-m=pause]");
    ps.className = "dk-st " + (d.paused ? "bench" : "on");
    ps.textContent = d.paused == null ? "—" : tr(d.paused ? "Paused — no new buys" : "Trading");
    pb.textContent = tr(d.paused ? "Resume buying" : "Pause new buys"); pb.disabled = d.paused == null;
    const cp = (d.rules && d.rules.caps) || {};
    rhBox.querySelector("[data-m=lbuy]").textContent = cp.perBuyEth === null ? tr("no limit") : cp.perBuyEth == null ? "—" : eth(cp.perBuyEth, 6);
    rhBox.querySelector("[data-m=lday]").textContent = cp.perDayEth === null ? tr("no limit") : cp.perDayEth == null ? "—" : eth(cp.perDayEth, 6);
    const open = (d.open || []).length, ow = rhBox.querySelector("[data-m=open]");
    ow.hidden = !open;
    ow.textContent = open ? `${open} ${tr(open === 1 ? "position is open — its coins aren't ETH yet. Pause first and wait for it to close to take everything out." : "positions are open — their coins aren't ETH yet. Pause first and wait for them to close to take everything out.")}` : "";
    const st = d.settings;
    if (st) {
      for (const [k] of SETF) {
        const i = rhBox.querySelector(`[data-s="${k}"]`), bd = st.bounds && st.bounds[k];
        if (bd) { i.min = bd[0]; i.max = bd[1]; rhBox.querySelector(`[data-sb="${k}"]`).textContent = `${bd[0]}–${bd[1]} · ${tr("default value")} ${st.defaults[k]}`; }
        if (!i.dataset.dirty && document.activeElement !== i) i.value = st.values[k];
      }
      rhBox.querySelector("[data-m=sby]").innerHTML = st.at ? `${T("last saved")} <b data-no-i18n>${when(st.at)} UTC</b>` : T("defaults");
    }
    rhBox.querySelector("[data-m=post]").value = (d.risk && d.risk.postDraft) || tr("Starts once the desk is funded.");
  }
  /// show the other desk: the page is rebuilt for it (its numbers, links and owner panel are its own)
  function switchNet(k, fromClick) {
    if (k !== "rh") k = "arc";
    if (k === S.net && S.booted) return;
    S.net = k;
    try { localStorage.setItem("dk-net", k); } catch { /* fine */ }
    if (fromClick && history.replaceState) history.replaceState(null, "", location.pathname + location.search + (k === "rh" ? "#desk?chain=rh" : "#desk"));
    S.d = null; S.shown = {}; S.seenLog = null; S.toastSeen = null; S.lastUpd = null; S.drawn = false;
    if (depBox) { depBox.remove(); depBox = null; } if (rhBox) { rhBox.remove(); rhBox = null; }
    deskOwner = null; ownerAsked = false; depLast = null; rhLast = null; chain = { bal: null, paused: null, at: 0 };
    if (!S.booted) return;
    frame();
    $("dk-filt").dataset.ready = "";
    load();
  }
  function filters(d) {
    const el = $("dk-filt");
    if (el.dataset.ready) return;
    el.dataset.ready = "1";
    const pbs = (d.learn.playbooks || []).map((p) => `<option value="${esc(p.k)}">${T(p.name)}</option>`).join("");
    el.innerHTML = `<label>${T("Playbook")}<select data-f="pb"><option value="all">${T("All")}</option>${pbs}</select></label><label>${T("Result")}<select data-f="res"><option value="all">${T("All")}</option><option value="win">${T("Wins")}</option><option value="loss">${T("Losses")}</option></select></label>`;
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
  const tokenLink = (t, sym) => (S.d && S.d.net === "rh" ? `<a class="dk-tok" href="${EXPL("token", esc(t))}" target="_blank" rel="noopener" title="${T("Open on Robinhood Chain's explorer")}" data-no-i18n>${esc(sym || short(t))}</a>`
    : `<a class="dk-tok" href="/arc#scanner?t=${esc(t)}" title="${T("Open in Token Scanner")}" data-no-i18n>${esc(sym || short(t))}</a>`);
  function openPos(d) {
    const el = $("dk-open");
    if (!d.open.length) {
      el.innerHTML = `<div class="dk-empty-s">${d.mode === "live" ? T("No open positions. ARCIA is watching new launches for a setup that passes every gate.") : T("No real positions in paper mode.")}${d.paper.open ? ` <span>${d.paper.open} ${T("paper trades running")}.</span>` : ""}</div>` + paperMini(d);
      return;
    }
    const moved = (p) => { const prev = S.lastVal[p.id]; S.lastVal[p.id] = p.value; return prev != null && p.value != null && prev !== p.value ? (p.value > prev ? " dk-pulse-up" : " dk-pulse-dn") : ""; };
    el.innerHTML = `<div class="dk-pos">` + d.open.map((p) => `
      <div class="dk-p ${cls(p.ret)}${reduce ? "" : moved(p)}${!p.tpHit && p.ret != null && p.ret <= -0.6 * p.sl ? " dk-near" : ""}">
        <div class="dk-p-top">${tokenLink(p.t, p.sym)} ${pbTag(p.pb, pbName(p.pb))}${p.tpHit ? `<span class="dk-flag">${T("profit taken")}</span>` : ""}${p.pending ? `<span class="dk-flag">${T("confirming")}</span>` : ""}
          <b class="dk-p-ret" data-no-i18n>${pc(p.ret)}</b></div>
        <div class="dk-p-grid">
          <div><small>${T("Bought")}</small><span data-no-i18n>${px(p.entryPx)}</span><em>${txa(p.tx, "tx")} · <span data-no-i18n>${ago(p.entryTs)}</span></em></div>
          <div><small>${T("Now")}</small><span data-no-i18n>${px(p.nowPx)}</span><em data-no-i18n>${num(p.tokens)}</em></div>
          <div><small>${T("Value")}</small><span data-no-i18n>${usd(p.value, 2)}</span><em>${T("in")} <span data-no-i18n>${usd(p.usdIn)}</span></em></div>
        </div>
        ${rangeBar(p)}
        <div class="dk-p-g">${abbr("tp", "TP")} <b data-no-i18n>+${p.tp}%</b> · ${abbr("sl", "SL")} <b data-no-i18n>−${p.sl}%</b>${p.tpHit ? ` · ${abbr("runner", T("runner"))} <b data-no-i18n>−${p.runTrail}%</b>` : ` · ${T("time limit in")} <b data-no-i18n data-dk-cd="${p.entryTs + Math.round(p.maxH * 3600)}">${dur(Math.max(0, Math.round((p.entryTs + p.maxH * 3600 - Date.now() / 1000) / 60)))}</b>`}</div>
        ${p.gate && p.gate.floorX != null ? `<div class="dk-p-g">${T("Launch floor")} <b data-no-i18n>${p.gate.floorX}×</b>${p.gate.dump != null ? ` · ${T("top-10 dump")} <b data-no-i18n>−${Math.round(p.gate.dump)}%</b>` : ""}${p.gate.score != null ? ` · ${T("score")} <b data-no-i18n>${p.gate.score}</b>` : ""}</div>` : ""}
        ${p.dca && p.dca.length ? `<div class="dk-p-g">${abbr("dca", T("DCA buys"))} <b data-no-i18n>${p.dca.map((l) => l + "%").join(" · ")}</b> · ${T("in")} <b data-no-i18n>${usd(p.usdIn)}</b></div>` : ""}
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
    const rows = d.recent.filter((r) => (S.tab === "real" ? r.real : !r.real) && (S.f.pb === "all" || r.pb === S.f.pb) && (S.f.res === "all" || (S.f.res === "win" ? r.ret > 0 : r.ret <= 0))).slice(0, 60);
    if (!rows.length) { el.innerHTML = `<div class="dk-empty-s">${d.recent.some((r) => (S.tab === "real" ? r.real : !r.real)) ? T("No trades match these filters.") : S.tab === "real" ? T("No real trades closed yet. The first 25 are the warm-up: small trades on every setup that passes the gates, to learn fast.") : T("No paper trades closed yet.")}</div>`; return; }
    el.innerHTML = `<div class="dk-hist">` + rows.map((r) => `
      <div class="dk-h-row ${cls(r.ret)}" data-dk-trade="${esc(r.id)}|${esc(r.day || dayOfTs(r.exitTs))}" tabindex="0" role="button" aria-label="${T("Trade details")} ${esc(r.sym || "")}">
        <div class="dk-h-a">${tokenLink(r.t, r.sym)} ${pbTag(r.pb, pbName(r.pb))}<small>${T(WHY[r.why] || r.why)} · <span data-no-i18n>${dur(r.mins)}</span> · <span data-no-i18n>${when(r.exitTs)}</span></small></div>
        <div class="dk-h-b"><small>${T("Buy")}</small><span data-no-i18n>${px(r.entryPx)}</span>${r.real ? `<em>${txa(r.buyTx, "tx")} <span data-no-i18n>${usd(r.usdIn)}</span></em>` : `<em data-no-i18n>${when(r.entryTs)}</em>`}</div>
        <div class="dk-h-b"><small>${T("Sell")}</small><span data-no-i18n>${px(r.exitPx)}</span>${r.real ? `<em>${(r.sells || []).map((s) => txa(s.tx, s.pct + "%")).join(" ")} <span data-no-i18n>${usd(r.usdOut)}</span></em>` : `<em data-no-i18n>${when(r.exitTs)}</em>`}</div>
        ${r.real ? `<div class="dk-h-c dk-h-usd"><b data-no-i18n>${sgnUsd(r.pnl)}</b><small data-no-i18n>${pc(r.ret)}</small></div>` : `<div class="dk-h-c"><b data-no-i18n>${pc(r.ret)}</b><small></small></div>`}
      </div>`).join("") + `</div>`;
  }
  // ---------------- the trade drawer ----------------
  async function openTrade(key) {
    const [id, day] = key.split("|");
    const dr = $("dk-drawer"), body = $("dk-dr-body");
    dr.hidden = false; document.body.classList.add("dk-noscroll");
    requestAnimationFrame(() => dr.classList.add("on"));
    body.innerHTML = `<div class="dk-skel"><i></i><i></i></div>`;
    let j = null;
    try { const r = await fetch(api(`day=${encodeURIComponent(day)}&trade=${encodeURIComponent(id)}`)); j = r.ok ? await r.json() : null; } catch { j = null; }
    if (!j || !j.trade) { body.innerHTML = `<div class="dk-empty-s">${T("Couldn't load this trade.")}</div>`; return; }
    const t = j.trade;
    body.innerHTML = `
      <div class="dk-dr-h">${tokenLink(t.t, t.sym)} ${pbTag(t.pb, j.name)}<b class="${cls(t.ret)}" data-no-i18n>${pc(t.ret)}</b></div>
      <p class="dk-small">${t.real ? T("Real trade") : T("Paper trade")} · ${T(WHY[t.why] || t.why)} · <span data-no-i18n>${dur(t.mins)}</span> · <span data-no-i18n>${when(t.entryTs)} → ${when(t.exitTs)} UTC</span></p>
      ${tradeChart(t, j.series)}
      <div class="dk-dr-grid">
        <div><small>${T("In")}</small><b data-no-i18n>${usd(t.usdIn)}</b></div>
        <div><small>${T("Out")}</small><b data-no-i18n>${t.usdOut == null ? "—" : usd(t.usdOut)}</b></div>
        <div><small>${T("P&L")}</small><b class="${cls(t.pnl)}" data-no-i18n>${sgnUsd(t.pnl)}</b></div>
        <div><small>${T("Best / worst on the way")}</small><b data-no-i18n>${pc(t.peak)} / ${pc(t.low)}</b></div>
        <div><small>${T("Trading cost")}</small><b data-no-i18n>${t.rt != null ? t.rt.toFixed(1) + "%" : "—"}</b></div>
        <div><small>${T("Model's win odds")}</small><b data-no-i18n>${t.p != null ? Math.round(t.p * 100) + "%" : "—"}</b></div>
      </div>
      <h4>${T("Why she bought")}</h4><p class="dk-small">${esc(t.why0 || "—")}</p>
      ${t.gate ? `<h4>${T("At entry")}</h4><div class="dk-p-g">${T("Scanner score")} <b data-no-i18n>${t.gate.score ?? "—"}</b> · ${T("Launch floor")} <b data-no-i18n>${t.gate.floorX ?? "—"}×</b>${t.gate.dump != null ? ` · ${T("top-10 dump")} <b data-no-i18n>−${Math.round(t.gate.dump)}%</b>` : ""}</div>` : ""}
      ${t.review ? `<h4>${T("Claude's check")}</h4><div class="dk-p-rv"><b>${T(t.review.go ? "OK" : "No")}</b><span data-no-i18n>${esc(t.review.reason)}</span></div>` : ""}
      <h4>${T("Exits")}</h4><div class="dk-rows">${(t.parts || []).map((p) => `<div class="dk-row"><span>${T(WHY[p.why] || p.why)}</span><span data-no-i18n>${p.pct}%</span><b class="${cls(p.ret)}" data-no-i18n>${pc(p.ret)}</b>${p.tx ? txa(p.tx, "tx") : ""}</div>`).join("") || `<div class="dk-empty-s">—</div>`}</div>
      ${t.buyTx ? `<p class="dk-small">${T("Buy transaction")} ${txa(t.buyTx)}</p>` : ""}`;
  }
  function tradeChart(t, series) {
    if (!series || series.length < 3) return `<div class="dk-empty-s dk-dr-nochart">${T("The minute-by-minute price is only kept for about two hours, so this older trade shows its numbers without a chart.")}</div>`;
    const W = 520, H = 170, P = { l: 6, r: 6, t: 10, b: 16 };
    const xs = series.map((p) => p[0]), ys = series.map((p) => p[1]);
    const x0 = xs[0], x1 = xs[xs.length - 1], lo = Math.min(...ys), hi = Math.max(...ys);
    const X = (x) => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r), Y = (y) => P.t + (1 - (y - lo) / (hi - lo || 1)) * (H - P.t - P.b);
    const line = series.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    const mk = (ts, pxv, k) => (pxv ? `<circle class="dk-mk ${k}" cx="${X(Math.min(x1, Math.max(x0, ts))).toFixed(1)}" cy="${Y(pxv).toFixed(1)}" r="5"/>` : "");
    return `<div class="dk-dr-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${T("Price around the trade")}"><path class="dk-line ${t.ret >= 0 ? "up" : "dn"}" d="${line}"/>${mk(t.entryTs, t.entryPx, "buy")}${(t.parts || []).map((p) => mk(p.ts || t.exitTs, p.px, "sell")).join("")}</svg><div class="dk-dr-leg"><span><i class="buy"></i>${T("Buy")}</span><span><i class="sell"></i>${T("Sell")}</span></div></div>`;
  }
  function closeTrade() {
    const dr = $("dk-drawer");
    dr.classList.remove("on"); document.body.classList.remove("dk-noscroll");
    setTimeout(() => { dr.hidden = true; }, reduce ? 0 : 220);
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
      ${L.playbooks.some((p) => p.realOn === false) ? `<p class="dk-small dk-realonly">${T("Real money goes only through")} <b>${L.playbooks.filter((p) => p.realOn).map((p) => T(p.name)).join(", ")}</b>. ${T("The other playbooks keep trading on paper, so the desk keeps learning from them and any of them can be switched back on.")}</p>` : ""}
      <div class="dk-pbs">${L.playbooks.filter((p) => p.realOn).concat(L.playbooks.filter((p) => !p.realOn)).map((p) => `
        <div class="dk-pbc" style="--pb:${PBCOL[p.k] || "#8c98a6"}">
          <div class="dk-pbc-h"><b>${T(p.name)}${p.realOn === false ? ` <span class="dk-st">${T("Paper only")}</span>` : p.benched ? ` <span class="dk-st bench">${T("Benched")}</span>` : p.realOn ? ` <span class="dk-st on">${T("Real money")}</span>` : ""}</b><span class="${cls(p.mean)}" data-no-i18n>${p.n ? pc(p.mean) : "—"}</span></div>
          <p>${T(p.why)}</p>
          <div class="dk-pbc-s"><span>${T("trades")} <b data-no-i18n>${p.real}</b>+<b data-no-i18n>${p.paper}</b> ${T("paper")}</span><span>${T("wins")} <b data-no-i18n>${p.winRate == null ? "—" : p.winRate + "%"}</b></span></div>
          <div class="dk-pbc-sz">${p.realOn ? `${T("Real size")} <b data-no-i18n>${(d.settings && d.settings.values.tradePct) || 6}%</b> ${T("of the desk, cut by the risk rules")}` : T("Paper only — no money")}</div>
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
    if (!d.watching.length) { el.innerHTML = `<div class="dk-empty-s">${T(d.net === "rh" ? "No pons launches in the last three days yet." : "No Argus launches in the last three days yet.")}</div>`; return; }
    el.innerHTML = `<div class="dk-rows">` + d.watching.map((c) => `<div class="dk-row">${tokenLink(c.t, c.sym)}<span data-no-i18n>${px(c.px)}</span>${watchTags(c)}${c.own ? `<small>${T("ArcPad launch — skipped")}</small>` : c.crit ? `<small class="dn">${T("critical flag")}</small>` : `<small data-no-i18n>${d.net === "rh" ? (c.top10 != null ? `${tr("top 10")} ${c.top10}%` : "—") : c.score == null ? tr("scanning") : c.score + "/100"} · ${ago(c.ts)}</small>`}</div>`).join("") + `</div>`;
  }
  function rej(d) {
    const el = $("dk-rej");
    if (!d.rejects.length) { el.innerHTML = `<div class="dk-empty-s">${T("Setups that fail a safety gate show up here.")}</div>`; return; }
    let dodged = 0, missed = 0;
    const rows = d.rejects.slice(0, 12).map((r) => {
      const mv = r.px && r.nowPx ? (r.nowPx / r.px - 1) * 100 : null;
      if (mv != null) { if (mv <= -30) dodged++; else if (mv >= 100) missed++; }
      const veto = r.why.some((x) => /^risk review/.test(x));
      return `<div class="dk-row dk-rj">${tokenLink(r.t, r.sym)}${veto ? `<span class="dk-flag dk-claude">${T("Claude said no")}</span>` : ""}${r.paper ? `<span class="dk-flag">${T("paper only")}</span>` : ""}${mv != null ? `<span class="dk-mv ${cls(mv)}" data-no-i18n>${T("since")} ${pc(mv, 0)}</span>` : ""}<small>${r.why.map((x) => T(x.replace(/^risk review: /, ""))).join(" · ")}</small><em data-no-i18n>${ago(r.ts)}</em></div>`;
    });
    $("dk-rej-sub").innerHTML = dodged || missed ? `${T("dodged")} <b data-no-i18n>${dodged}</b> · ${T("missed runs")} <b data-no-i18n>${missed}</b>` : T("and what happened next");
    el.innerHTML = `<div class="dk-rows">${rows.join("")}</div><small class="dk-legend">${T("\"since\" is the price now against the price when she passed. Dodged: down 30%+ since. Missed run: up 100%+ since.")}</small>`;
  }
  // ---------------- toasts: what happened since the last refresh ----------------
  function toasts(d) {
    const box = $("dk-toasts"), seen = S.toastSeen;
    S.toastSeen = new Set((d.log || []).map((x) => x.tx + x.side));
    if (!seen) return; // first load: nothing to announce
    const fresh = (d.log || []).filter((x) => !seen.has(x.tx + x.side)).slice(0, 3);
    for (const x of fresh) {
      const [k, txt] = x.side === "buy" ? ["buy", `${tr("ARCIA bought")} ${x.sym} · ${usd(x.usd)}`] : x.side === "sell" ? [x.ret > 0 ? "win" : "loss", x.ret > 0 ? `${tr("ARCIA sold")} ${x.sym} ${pc(x.ret)}` : `${tr("ARCIA closed")} ${x.sym} ${pc(x.ret)} — ${tr("a loss, inside her rules")}`] : ["burn", `${tr("ARCIA burned")} ${num(x.tokens)} $ARCIRCLE`];
      const t = document.createElement("div");
      t.className = `dk-toast ${k}`;
      // a bigger loss gets a review from Claude (Learning → Loss reviews)
      const rv = k === "loss" && x.ret <= -30 && d.ai;
      t.innerHTML = `<img src="${AV}" alt="" width="32" height="32"><span data-no-i18n>${esc(txt)}</span>${k === "win" || k === "burn" ? `<i class="dk-spark" aria-hidden="true"></i>` : ""}${rv ? `<button type="button" class="dk-t-why" data-dk-goto="learning">${T("See why")}</button>` : ""}`;
      box.appendChild(t);
      setTimeout(() => t.classList.add("out"), rv ? 9000 : 5200);
      setTimeout(() => t.remove(), rv ? 9600 : 5800);
      if (k === "burn") { const b = panel.querySelector(".dk-kpi.dk-burn"); if (b && !reduce) { b.classList.remove("dk-flame"); void b.offsetWidth; b.classList.add("dk-flame"); } }
    }
  }
  function burns(d) {
    const el = $("dk-burns");
    if (d.net === "rh") return;
    const pct = d.rules.risk.burnPct;
    const head = `<p class="dk-small">${T("Once a day,")} <b data-no-i18n>${pct}%</b> ${T("of new profit above the desk's previous high buys $ARCIRCLE and sends it to 0x…dEaD, through the desk contract.")}</p>`;
    el.innerHTML = head + (d.burns.length ? `<div class="dk-rows">` + d.burns.slice(0, 8).map((b) => `<div class="dk-row"><span data-no-i18n>${esc(b.day)}</span><span data-no-i18n>${num(b.tok)} $ARCIRCLE</span><small data-no-i18n>${usd(b.usd)}</small>${txa(b.tx, "tx")}</div>`).join("") + `</div>` : `<div class="dk-empty-s">${T("No burn yet — it starts with the first profitable day.")}</div>`);
  }
  function rules(d) {
    const g = d.rules.gates, r = d.rules.risk, sv = (d.settings && d.settings.values) || { tradePct: r.tradePct, maxLossPct: 1.25, scalpFloorX: 7, scalpMaxDump: 60, earlyFailPct: 5, earlyFailMin: 2 };
    $("dk-rules").innerHTML = `
      <div class="dk-h"><h3>${T("The rules she can't learn away")}</h3></div>
      <div class="dk-rule-grid">
        <div><b>${T("Safety gates")}</b><ul>
          <li>${T(d.net === "rh" ? "Holders read from every transfer since launch (young tokens)" : "No Token Scanner critical flag")}</li><li>${T("Launched at least")} <span data-no-i18n>${g.minAgeMin}</span> ${T("minutes ago, at most 3 days")}</li>
          <li>${T("Liquidity at least")} <span data-no-i18n>$${g.minLiq}</span></li><li>${T("A buy and an immediate sell lose at most")} <span data-no-i18n>${g.maxRoundTrip}%</span></li>
          <li>${T("Taxes at most")} <span data-no-i18n>${g.maxTax}%</span> · ${T("top 10 wallets at most")} <span data-no-i18n>${g.maxTop10}%</span></li>
          <li>${T(d.net === "rh" ? "pons tokens are the factory's own fixed-supply tokens — no taxes, no owner switches, nothing that can block selling; what's left is who holds them" : "Token Scanner: shown and learned from, but only a critical flag blocks a buy (an Argus launch can't block selling)")}</li>
          ${d.rules.realGates ? `<li>${T("Real money only: price at most")} <span data-no-i18n>${d.rules.realGates.maxFloorX}×</span> ${T("its launch floor (the pump scalp:")} <span data-no-i18n>${sv.scalpFloorX}×</span>${T("), a top-10 dump under")} <span data-no-i18n>${d.rules.realGates.maxDump}%</span> ${T("(the pump scalp:")} <span data-no-i18n>${sv.scalpMaxDump}%</span>)${T(", and never a token with a critical flag in the last 6 hours")}</li>` : ""}
          ${d.rules.ai ? `<li>${T("A second opinion from Claude before every real buy — it can only say no")}</li>` : ""}</ul></div>
        <div><b>${T("Money limits")}</b><ul>
          <li><span data-no-i18n>${sv.tradePct}%</span> ${T("of the desk per trade")} (${r.maxTrade == null ? `${T("at least")} <span data-no-i18n>$${r.minTrade}</span>` : `<span data-no-i18n>$${r.minTrade}–$${r.maxTrade}</span>`})${r.warmTrade ? ` · ${T("warm-up:")} <span data-no-i18n>$${r.warmTrade}</span>, <span data-no-i18n>${r.warmPerHour}</span> ${T("buys an hour")}` : ""}</li><li>${T("At most")} <span data-no-i18n>${r.maxOpen}</span> ${T("open, and")} <span data-no-i18n>${r.maxPerHour}</span> ${T("buys an hour")}</li>
          <li>${T("A buy may lose at most")} <span data-no-i18n>${sv.maxLossPct}%</span> ${T("of the desk if the coin falls back to its launch floor — the closer the floor, the bigger the buy can be")}</li>
          <li>${T("Half size after 3 losses in a row, when the last 20 real trades lost money in dollars, or once the day is down 5%; the minimum size when they lost twice what they made")}</li>
          ${sv.earlyFailPct > 0 ? `<li>${T("A pump scalp down")} <span data-no-i18n>${sv.earlyFailPct}%</span> ${T("in the first")} <span data-no-i18n>${sv.earlyFailMin}</span> ${T("minutes after the buy is sold at once")}</li>` : ""}
          <li>${T("Down")} <span data-no-i18n>${r.dailyLossPct}%</span> ${T("in a day: no new trades until the next day")}</li>
          ${r.lowCapUsd ? `<li>${T("Under a")} <span data-no-i18n>$${(r.lowCapUsd / 1000).toFixed(0)}k</span> ${T("market cap, never held longer than")} <span data-no-i18n>${r.lowCapMin}</span> ${T("minutes (crash-buy DCA: under $10k, 1 hour)")}</li>` : ""}<li>${T("Contract limits")}: ${(() => { const c = d.rules.caps; if (!c) return T("each buy and each day's buys are capped; only the owner can withdraw"); const v = (x, e) => (x === null ? T("no limit") : x === undefined ? "—" : `<span data-no-i18n>$${Number(x).toLocaleString("en-US")}${e != null ? ` (${eth(e, 6)})` : ""}</span>`); return `${T("per buy")} ${v(c.perBuy, c.perBuyEth)} · ${T("per day")} ${v(c.perDay, c.perDayEth)} · ${T("only the owner can withdraw")}`; })()}</li></ul></div>
        <div><b>${T("What it trades")}</b><ul>
          ${d.net === "rh" ? `<li>${T("Only new coins launched on pons (Robinhood Chain), in their Uniswap v3 pools paired with WETH")}</li><li>${T("The money is held as ETH (WETH): returns and the day's result are counted in ETH, so ETH's own price moves aren't wins or losses; dollars are shown at the current ETH price")}</li><li>${T("No burn on this chain")}</li>`
            : `<li>${T("Only new coins launched on Argus, paired with USDC")}</li><li>${T("Never $ARCIRCLE itself")}</li>
          <li>${d.rules.tradeArcPad ? T("ArcPad's own Argus launches are included") : T("Not ArcPad's own Argus launches — the platform earns their fees")}</li>`}<li>${T("No message, chat or command can make it trade")}</li></ul></div>
      </div>
      <p class="dk-disc">${T("ARCIA DESK is an experiment with a small amount of the team's own money. New coins are the riskiest thing on-chain and most lose value; ARCIA will lose trades. Nothing here is financial advice, and nobody can deposit into or copy the desk.")}</p>`;
  }

  function show() {
    if (!S.booted) {
      let n0 = netFromHash();
      if (!n0) { try { n0 = localStorage.getItem("dk-net"); } catch { /* fine */ } }
      S.net = n0 === "rh" ? "rh" : "arc";
      S.booted = true;
      try { const v = localStorage.getItem("dk-view"); if (v) S.view = v; } catch { /* fine */ }
      frame();
      S.cd = setInterval(() => {
        panel.querySelectorAll("[data-dk-cd]").forEach((el) => { el.textContent = dur(Math.max(0, Math.round((Number(el.dataset.dkCd) - Date.now() / 1000) / 60))); });
        if (S.d) { const m = staleMin(S.d); $("dk-health").hidden = !(m != null && m >= 10); }
      }, 30000);
    }
    load();
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (panel.classList.contains("active") && !document.hidden) load(); }, 15000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "desk") show(); else clearInterval(S.timer); });
  window.addEventListener("hashchange", () => { const n = netFromHash(); if (S.booted && n && n !== S.net) switchNet(n); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && panel.classList.contains("active")) load(); });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); $("dk-filt").dataset.ready = ""; paint(); } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcDesk = { load, state: S, switchNet };
})();
