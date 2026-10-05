// arc-orders-x.js — ARCIRCLE Orders v3 extras (bundled right after arc-orders.js, which calls arcOrdersX.frame()
// each time it draws the page):
//   · the live tape: the latest fills across every market on this chain (GET /api/social?orders=recent[&chain=rh]),
//     read every 15 seconds while the Orders tab is open; a tap opens that market
//   · the fee burn's total: what ArcircleFeeBurn has burned in $ARCIRCLE from Orders' fees (?orders=burns), to /reward
//   · swipe-to-cancel on phones: an open order's row slid left past the line cancels it (the wallet still asks to sign)
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-orders");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const O = () => window.arcOrders;
  const CH = () => (O() ? O().chain() : "arc");
  const CQ = () => (CH() === "rh" ? "&chain=rh" : "");
  const X = { tape: null, burns: null, timer: 0, ch: null, seen: new Set() };
  const ago = (s) => { const d = Math.max(0, Math.floor(Date.now() / 1000) - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };
  const big = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 }));

  // ---------------- the tape ----------------
  async function loadTape() {
    const c0 = CH();
    if (c0 === "sol") return;
    try {
      const r = await fetch(`/api/social?orders=recent${CQ()}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (c0 !== CH()) return;
      X.tape = (j && j.fills) || [];
      X.lastFill = (j && j.lastFill) || null;
    } catch { /* keep the last */ }
    paintTape();
  }
  function paintTape() {
    const w = $("aor-tapew"), el = $("aor-tape");
    if (!w || !el) return;
    const list = (X.tape || []).slice(0, 20);
    const fp = O() ? O().fp : String;
    const bc = $("aor-burnct"), burnOn = !!(bc && !bc.hidden);
    w.hidden = !list.length && !burnOn;
    if (!list.length) { el.innerHTML = ""; el.hidden = true; return; }
    el.hidden = false;
    const item = (f) => {
      const k = `${f.tx || ""}:${f.at}:${f.price}`, fresh = X.seen.size && !X.seen.has(k);
      // v5: the pools' own swaps run in the tape too (dimmer, a ◇), Orders' fills stand out (●)
      const sw = f.via === "swap";
      return `<button type="button" class="aor-tk ${f.side === "buy" ? "up" : "dn"}${sw ? " sw" : ""}${fresh ? " fresh" : ""}" data-tapet="${esc(f.token)}" title="${T(sw ? "A swap in the pool" : f.via === "match" ? "Wallet to wallet" : f.via === "market" ? "Market order" : "Filled from the pool")}"><em class="aor-tk-k" aria-hidden="true">${sw ? "◇" : "●"}</em><b data-no-i18n>$${esc(f.sym || "?")}</b><i>${T(f.side === "buy" ? "Buy" : "Sell")}</i><span data-no-i18n>${esc(fp(f.price))}</span><small data-no-i18n>${esc(ago(f.at))}</small></button>`;
    };
    const row = list.map(item).join("");
    // a long list scrolls by itself (twice over, so the loop has no seam); a short one just sits
    const loop = !reduce && list.length >= 6;
    const lf = X.lastFill, l3 = (en, ko, zh) => { const l = O() ? O().lang() : "en"; return l === "ko" ? ko : l === "zh" ? zh : en; };
    const lastTxt = lf && lf.at ? l3(`last Orders fill ${ago(lf.at)}${ago(lf.at) === tr("just now") ? "" : " ago"}`, `마지막 Orders 체결 ${ago(lf.at)}${ago(lf.at) === tr("just now") ? "" : " 전"}`, `最近一笔 Orders 成交 ${ago(lf.at)}${ago(lf.at) === tr("just now") ? "" : "前"}`) : "";
    el.innerHTML = `<span class="aor-tape-l"><i aria-hidden="true"></i>${T("Live trades")}${lastTxt ? `<small data-no-i18n>${esc(lastTxt)}</small>` : ""}</span><div class="aor-tape-v"><div class="aor-tape-r${loop ? " loop" : ""}" style="--n:${list.length}">${row}${loop ? `<span aria-hidden="true" class="aor-tape-dup">${row}</span>` : ""}</div></div>`;
    X.seen = new Set(list.map((f) => `${f.tx || ""}:${f.at}:${f.price}`));
  }

  // ---------------- the fee burn's total ----------------
  async function loadBurns() {
    const c0 = CH();
    if (c0 === "sol") return;
    try {
      const r = await fetch(`/api/social?orders=burns${CQ()}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (c0 !== CH()) return;
      X.burns = j;
    } catch { /* keep */ }
    paintBurns();
  }
  function paintBurns() {
    const a = $("aor-burnct"); if (!a) return;
    const b = X.burns;
    if (!b || !b.live || !(b.arcircle > 0)) { a.hidden = true; paintTape(); return; }
    a.hidden = false;
    a.title = tr("Half of every Orders fee buys $ARCIRCLE and burns it — see the Reward page");
    // v4: the total rolls up from where it was (from 0 the first time), and the flame flares while it does
    const from = X.burnShown != null ? X.burnShown : 0, to = b.arcircle;
    a.innerHTML = `<svg class="aor-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.4 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.6 2.2-4.6.2 1.8 1 2.6 1.8 3C11 9 11.5 6 12 3z"/></svg><b data-no-i18n><span class="aor-burnn">${esc(big(reduce || from === to ? to : from))}</span> $ARCIRCLE</b><span>${T("burned by Orders fees")}</span><small data-no-i18n>${esc(String(b.n || 0))} ×</small>`;
    X.burnShown = to;
    if (!reduce && from !== to) {
      a.classList.add("rolling");
      const el = a.querySelector(".aor-burnn"), t0 = performance.now(), D = from ? 900 : 1400;
      const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); if (el && el.isConnected) el.textContent = big(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else a.classList.remove("rolling"); };
      requestAnimationFrame(step);
    }
    paintTape();
  }

  // ---------------- swipe to cancel (phones) ----------------
  let sw = null;
  const LINE = 96;
  // v8: right past the line edits (or opens the order's menu); a long press opens the menu
  const menuOf = (row) => { const A = O(); if (!A || !row.dataset.h) return; A.state.rowMenu = row.dataset.h; A.mine(); if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* fine */ } };
  panel.addEventListener("touchstart", (e) => {
    const row = e.target.closest && e.target.closest(".aor-mr");
    if (!row || innerWidth > 720 || !row.querySelector('[data-act="cancel"]') || e.touches.length !== 1 || e.target.closest("button, a, input")) { sw = null; return; }
    sw = { row, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, on: false };
    clearTimeout(X.lp); X.lp = setTimeout(() => { if (sw && !sw.on && sw.row === row) { const r = row; sw = null; menuOf(r); } }, 520);
  }, { passive: true });
  panel.addEventListener("touchmove", (e) => {
    if (!sw) return;
    const dx = e.touches[0].clientX - sw.x, dy = e.touches[0].clientY - sw.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(X.lp);
    if (!sw.on) { if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; } if (Math.abs(dx) > 10) { sw.on = true; sw.row.classList.add("swiping"); } else return; }
    sw.dx = Math.min(160, Math.max(-160, dx));
    sw.row.style.setProperty("--sx", sw.dx + "px");
    sw.row.classList.toggle("swipe-go", sw.dx <= -LINE);
    sw.row.classList.toggle("swipe-edit", sw.dx >= LINE);
  }, { passive: true });
  const end = () => {
    if (!sw) return;
    const { row, dx, on } = sw; sw = null;
    if (!on) return;
    clearTimeout(X.lp);
    row.classList.remove("swiping", "swipe-go", "swipe-edit");
    row.style.setProperty("--sx", "0px");
    if (dx >= LINE) { const ed = row.querySelector('[data-act="edit"]'); if (ed) ed.click(); else menuOf(row); return; }
    if (dx <= -LINE) { const b = row.querySelector('[data-act="cancel"]'); if (b) { if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* fine */ } b.click(); } }
  };
  panel.addEventListener("touchend", end);
  panel.addEventListener("touchcancel", end);

  // ---------------- wiring ----------------
  panel.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-tapet]");
    if (!b || !O()) return;
    O().open(b.dataset.tapet);
    const g = $("aor-grid"); if (g && innerWidth <= 1200) g.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });
  function poll() {
    clearInterval(X.timer);
    X.timer = setInterval(() => { if (panel.classList.contains("active") && !document.hidden && CH() !== "sol") { loadTape(); if (Date.now() - (X.bAt || 0) > 120e3) { X.bAt = Date.now(); loadBurns(); } } }, 15000);
  }
  function frame() {
    if (CH() === "sol") { clearInterval(X.timer); return; }
    if (X.ch !== CH()) { X.ch = CH(); X.tape = null; X.burns = null; X.seen = new Set(); X.burnShown = null; }
    paintBurns(); paintTape();
    loadTape(); X.bAt = Date.now(); loadBurns();
    poll();
  }
  document.addEventListener("arcpad:tab", (e) => { if (!(e.detail && e.detail.tab === "orders")) clearInterval(X.timer); else if ($("aor-tapew")) poll(); });
  window.arcOrdersX = { frame, state: X };
  if ($("aor-tapew")) frame();
})();
