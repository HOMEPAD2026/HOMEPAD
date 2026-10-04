// arc-orders-v5.js — ARCIRCLE Orders v5 extras (bundled after arc-orders-v4.js; works through window.arcOrders):
//   · Portfolio: what this wallet holds on this chain — balance, value, average Orders buy, unrealized change, open
//     orders — with "Protect" (a take-profit and stop-loss on what you hold, one tap from the form)
//   · the fee burn's dashboard: $ARCIRCLE burned by Orders fees, what's waiting for the next hourly burn against its
//     minimum, the last burn, the last 7 days (GET /api/social?orders=burns)
//   · the chain switch shows each chain's markets and whether its executor checked in lately
//   · Solana, before it opens: "tell me when it's live" — this browser (Web Push topic orders-sol) or Telegram
//   · the guide folds to its title once you know your way around
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-orders");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const O = () => window.arcOrders;
  const CH = () => (O() ? O().chain() : "arc");
  const L3 = (en, ko, zh) => (O() ? O().L3(en, ko, zh) : en);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };
  const V = { port: null, portKey: "", portBusy: false, burns: null, burnCh: null, burnShown: null, info: {}, infoAt: 0 };
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"];
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 }));
  const ARCIA_ART = '<img class="aor-arcia-mini" src="/images/arcia-avatar-96.jpg" alt="" width="36" height="36" loading="lazy">';

  // ---------------- Portfolio ----------------
  /// the tokens worth checking on this chain: markets, my orders, ★, recent, the open one
  function candidates() {
    const A = O(), S = A.state, out = new Map();
    const add = (t, sym, dec) => { t = lc(t); if (!isAddr(t)) return; const x = out.get(t) || { t, sym: null, dec: null }; x.sym = x.sym || sym || null; x.dec = x.dec != null ? x.dec : dec != null ? Number(dec) : null; out.set(t, x); };
    if (S.tok) add(S.t, S.tok.symbol, S.tok.decimals);
    add(A.defaultMkt(), null, null);
    for (const m of S.markets || []) add(m.token.address || m.token, m.token.symbol, m.token.decimals);
    for (const o of (S.mine && S.mine.orders) || []) add(o.token.address || o.token, o.token.symbol, o.token.decimals);
    for (const f of A.favs()) add(f);
    for (const r of A.recent()) add(r.t, r.sym);
    return [...out.values()].slice(0, 30);
  }
  /// my average Orders buy and my open orders, per token
  function mineBy() {
    const S = O().state, by = new Map();
    for (const o of (S.mine && S.mine.orders) || []) {
      const t = lc(o.token.address || o.token), g = by.get(t) || { bT: 0, bQ: 0, open: 0 };
      if (o.side === "buy" && o.filledPct > 0 && o.price > 0) { const x = (Number(o.buyAmount) / 10 ** o.token.decimals / 0.999) * (o.filledPct / 100); g.bT += x; g.bQ += x * o.price; }
      if (o.status === "open" || o.status === "unfunded") g.open++;
      by.set(t, g);
    }
    return by;
  }
  function priceOf(t) {
    const S = O().state;
    if (t === S.t && S.spot) return S.spot;
    const m = (S.markets || []).find((x) => lc(x.token.address || x.token) === t);
    if (m && (m.spot || m.last)) return m.spot || m.last;
    const seen = store.get(`arcircle.orders.seen.${CH()}`, {})[t];
    return seen ? seen.p : null;
  }
  async function loadPort() {
    const A = O(), w = A.me(), prov = A.rp(), c0 = CH();
    if (!w || !prov || V.portBusy || typeof ethers === "undefined") return;
    V.portBusy = true;
    try {
      const list = candidates();
      const rows = await Promise.all(list.map(async (x) => {
        try {
          const c = new ethers.Contract(x.t, ERC20, prov);
          const [bal, dec, sym] = await Promise.all([c.balanceOf(w), x.dec != null ? x.dec : c.decimals().then(Number).catch(() => 18), x.sym ? x.sym : c.symbol().catch(() => "TOKEN")]);
          return { t: x.t, sym, dec, bal: Number(bal) / 10 ** dec };
        } catch { return null; }
      }));
      if (c0 !== CH() || w !== A.me()) return;
      V.port = { ch: c0, w, at: Date.now(), rows: rows.filter((r) => r && r.bal > 0) };
    } finally { V.portBusy = false; }
    const el = $("aor-mine"); if (el && O().state.myTab === "port") portfolio(el);
  }
  function portfolio(el) {
    const A = O(); if (!A) return;
    const w = A.me(), S = A.state;
    if (!w) { el.innerHTML = `<div class="aor-empty arcia">${ARCIA_ART}<span>${T("Connect a wallet to see what you hold here.")}</span> <button type="button" class="aor-link" data-act="connect">${T("Connect wallet")}</button></div>`; return; }
    const fresh = V.port && V.port.ch === CH() && V.port.w === w;
    if (!fresh || Date.now() - V.port.at > 30e3) loadPort();
    if (!fresh) { el.innerHTML = `<div class="aor-skel" aria-hidden="true">${"<i></i>".repeat(4)}</div>`; return; }
    const qs = CH() === "rh" ? "ETH" : "USDC", qUsd = A.qUsd(), by = mineBy();
    const rows = V.port.rows.map((r) => {
      const px = priceOf(r.t), g = by.get(r.t), avg = g && g.bT ? g.bQ / g.bT : null;
      return { ...r, px, val: px ? r.bal * px : null, avg, vs: avg && px ? (px / avg - 1) * 100 : null, open: g ? g.open : 0 };
    }).sort((a, b) => (b.val || 0) - (a.val || 0));
    if (!rows.length) { el.innerHTML = `<div class="aor-empty arcia">${ARCIA_ART}<span>${T(CH() === "rh" ? "No tokens from these markets in this wallet on Robinhood Chain yet." : "No tokens from these markets in this wallet on Arc yet.")}</span></div>`; return; }
    const tot = rows.reduce((s, r) => s + (r.val || 0), 0), usd = (q) => (q != null && qUsd ? A.usd(q * qUsd) : "");
    el.innerHTML = `<div class="aor-pf">
      <div class="aor-pf-sum"><small>${T("Held here, at the pool price")}</small><b data-no-i18n>${esc(A.qv(tot))}</b>${CH() === "rh" && usd(tot) ? `<span data-no-i18n>≈ ${esc(usd(tot))}</span>` : ""}<button type="button" class="aor-link" data-pfre>${T("Refresh")}</button></div>
      <div class="aor-pf-h"><span>${T("Token")}</span><span>${T("Balance")}</span><span>${T("Value")}</span><span>${T("Avg buy")}</span><span>${T("Now vs avg buy")}</span><span></span></div>
      ${rows.map((r) => `<div class="aor-pf-r${r.t === S.t ? " on" : ""}" data-pft="${esc(r.t)}">
        <button type="button" class="aor-link" data-t="${esc(r.t)}" data-no-i18n>$${esc(r.sym)}</button>
        <span data-no-i18n>${esc(big(r.bal))}</span>
        <span data-no-i18n>${r.val != null ? esc(A.qv(r.val)) : "—"}${r.val != null && CH() === "rh" && usd(r.val) ? `<small>${esc(usd(r.val))}</small>` : ""}</span>
        <span data-no-i18n>${r.avg ? esc(A.fp(r.avg)) : "—"}</span>
        <span class="${r.vs == null ? "" : r.vs >= 0 ? "up" : "dn"}" data-no-i18n>${r.vs == null ? "—" : esc(A.pc(r.vs, 1))}${r.open ? `<small>${esc(L3(`${r.open} open`, `미체결 ${r.open}`, `${r.open} 个挂单`))}</small>` : ""}</span>
        <span class="aor-pf-a"><button type="button" class="aor-btn sm go" data-protect="${esc(r.t)}" title="${T("A take-profit and a stop-loss on what you hold — you check it, then sign")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/></svg><span data-no-i18n>${esc(L3("Protect", "보호", "保护"))}</span></button></span>
      </div>`).join("")}
      <small class="aor-pf-n">${T("Balances read from the chain; average buy from your filled Orders buys only (not swaps made elsewhere). Not advice.")}</small>
    </div>`;
  }
  /// a take-profit +25% and a stop-loss −15% from the pool price on all of a held token — filled in, never placed
  function protect(t) {
    const A = O(); if (!A) return;
    const S = A.state, F = A.form;
    const go = () => {
      const r = V.port && V.port.rows.find((x) => x.t === t);
      if (!r || !(S.spot > 0)) return;
      if (!A.PRO()) A.setMode("pro");
      S.type = "tpsl"; S.side = "sell"; S.msg = null; S.editing = null; S.pct = 0;
      const d = (v) => { const n = Number(v.toPrecision(6)); return n.toFixed(Math.min(20, Math.max(0, 9 - Math.floor(Math.log10(n))))).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };
      F.amount = d(r.bal * 0.999999); F.tp = d(S.spot * 1.25); F.sl = d(S.spot * 0.85);
      A.render(); A.flash();
      if (innerWidth <= 720) A.sheet(true); else { const fc = $("aor-formc"); if (fc) fc.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
      A.toast(tr("Take-profit +25% and stop-loss −15% filled in"), "fill", tr("Change them if you like, then sign — when one fills, the other is cancelled."));
    };
    if (S.t === t && S.tok && S.spot) { go(); return; }
    A.open(t);
    const t0 = Date.now();
    (function wait() { if (S.t === t && S.tok && S.spot > 0 && !S.loadingMkt) { go(); return; } if (Date.now() - t0 < 15000) setTimeout(wait, 300); })();
  }

  // ---------------- the fee burn's dashboard ----------------
  async function loadBurns() {
    const c0 = CH(); if (c0 === "sol") return;
    try { const r = await fetch(`/api/social?orders=burns${c0 === "rh" ? "&chain=rh" : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (c0 !== CH()) return; V.burns = j; V.burnCh = c0; } catch { /* keep */ }
    burnDash();
  }
  function burnDash() {
    const el = $("aor-burnd"), A = O();
    if (!el || !A) return;
    const b = V.burns;
    if (!b || !b.live || V.burnCh !== CH()) { el.hidden = true; return; }
    el.hidden = false;
    const open = store.get("arcircle.orders.burnopen", innerWidth > 720) === true, qs = b.quoteSym || (CH() === "rh" ? "ETH" : "USDC");
    const amt = (v) => (qs === "USDC" ? A.usd(v) : `${big(v)} ${qs}`);
    const p = b.pending, days = (b.last7 || []).slice(-7);
    const dmax = Math.max(1e-18, ...days.map((d) => d[1]));
    const nextTxt = p && p.nextIn != null ? (p.nextIn > 0 ? L3(`next check in ${Math.ceil(p.nextIn / 60)}m`, `다음 확인까지 ${Math.ceil(p.nextIn / 60)}분`, `${Math.ceil(p.nextIn / 60)} 分钟后检查`) : L3("checks with the next run", "다음 실행 때 확인", "下次运行时检查")) : "";
    const from = V.burnShown != null ? V.burnShown : 0, to = b.arcircle || 0;
    el.innerHTML = `<button type="button" class="aor-bd-h" data-bdt aria-expanded="${open}"><svg class="aor-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.4 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.6 2.2-4.6.2 1.8 1 2.6 1.8 3C11 9 11.5 6 12 3z"/></svg><b>${T("Fee burn")}</b><span data-no-i18n><i class="aor-bdn">${esc(big(reduce || !open ? to : from))}</i> $ARCIRCLE</span><small>${T("Half of every Orders fee buys $ARCIRCLE and burns it")}</small><em aria-hidden="true">${open ? "▴" : "▾"}</em></button>` +
      (open ? `<div class="aor-bd-b">
        <div class="aor-bd-g">
          <div><small>${T("$ARCIRCLE burned")}</small><b data-no-i18n>${esc(big(to))}</b></div>
          <div><small>${T("Spent from fees")}</small><b data-no-i18n>${esc(amt(b.quote || 0))}</b></div>
          <div><small>${T("Burns")}</small><b data-no-i18n>${esc(String(b.n || 0))}</b></div>
          <div><small>${T("Last burn")}</small><b data-no-i18n>${b.last && b.last.at ? esc(A.ago(b.last.at)) : "—"}</b>${b.last && b.last.tx ? `<a class="aor-tx" href="${esc(A.explorer("tx", b.last.tx))}" target="_blank" rel="noopener" data-no-i18n>${esc(big(b.last.arcircle))} ↗</a>` : ""}</div>
        </div>
        ${p ? `<div class="aor-bd-next${p.ready ? " ready" : ""}"><div class="aor-bd-nt"><small>${T(p.ready ? "Ready for the next burn" : "Waiting for the next burn")}</small><span data-no-i18n>${esc(amt(p.quote))} / ${esc(amt(p.min))}${nextTxt ? ` · ${esc(nextTxt)}` : ""}</span></div><div class="aor-bd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.pct)}"><i style="--p:${Math.max(2, p.pct).toFixed(1)}%"></i></div><p>${T("Once the fee burn holds the minimum, the executor spends it on $ARCIRCLE (checked every hour): half burned, half to the treasury.")}</p></div>` : ""}
        ${days.length ? `<div class="aor-bd-days" aria-label="${T("Burned per day")}">${days.map((d) => `<span title="${esc(d[0])} · ${esc(big(d[1]))} $ARCIRCLE"><i style="--h:${Math.max(4, (d[1] / dmax) * 100).toFixed(0)}%"></i><small data-no-i18n>${esc(d[0].slice(5))}</small></span>`).join("")}</div>` : ""}
      </div>` : "");
    if (open) V.burnShown = to;
    if (open && !reduce && from !== to) {
      const n = el.querySelector(".aor-bdn"), t0 = performance.now(), D = from ? 900 : 1400;
      const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); if (n && n.isConnected) n.textContent = big(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }

  // ---------------- the chain switch: markets and the executor per chain ----------------
  async function loadInfo() {
    if (Date.now() - V.infoAt < 120e3) { paintInfo(); return; }
    V.infoAt = Date.now();
    await Promise.all(["arc", "rh"].map(async (c) => {
      const q = c === "rh" ? "&chain=rh" : "";
      try {
        const [st, mk] = await Promise.all([fetch(`/api/social?orders=status${q}`).then((r) => (r.ok ? r.json() : null)), fetch(`/api/social?orders=markets${q}`).then((r) => (r.ok ? r.json() : null))]);
        V.info[c] = { n: mk && mk.markets ? mk.markets.length : null, k: !st || !st.live ? null : !st.at ? "off" : st.low || st.ago > 900 ? "bad" : st.ago > 180 ? "warn" : "ok" };
      } catch { /* leave it */ }
    }));
    paintInfo();
  }
  function paintInfo() {
    panel.querySelectorAll(".aor-chain [data-setchain]").forEach((b) => {
      const c = b.dataset.setchain, x = V.info[c];
      let tag = b.querySelector(".aor-cinf");
      if (!x || (x.n == null && !x.k)) { if (tag) tag.remove(); return; }
      if (!tag) { tag = document.createElement("span"); tag.className = "aor-cinf"; tag.setAttribute("data-no-i18n", ""); b.appendChild(tag); }
      const kt = x.k === "ok" ? tr("Executor checked in") : x.k === "warn" ? tr("Executor a little late") : x.k ? tr("Executor not checking in") : "";
      tag.title = [x.n != null ? L3(`${x.n} markets`, `마켓 ${x.n}개`, `${x.n} 个市场`) : "", kt].filter(Boolean).join(" · ");
      tag.innerHTML = `${x.k ? `<i class="aor-hb ${x.k}" aria-hidden="true"></i>` : ""}${x.n != null ? `<em>${x.n}</em>` : ""}`;
    });
  }

  // ---------------- Solana: tell me when it opens ----------------
  const b64b = (x) => { const t = String(x).replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  async function pushTopic(topic) {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
      const k = await fetch("/api/social?orders=pushkey").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!k || !k.key) return false;
      if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") return false;
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 4000))]);
      if (!reg || !reg.pushManager) return false;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64b(k.key) }));
      if (!sub) return false;
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pushtopic", topic, sub: sub.toJSON(), lang: O() ? O().lang() : "en" }) });
      return r.ok;
    } catch { return false; }
  }
  function solWait() {
    const el = $("aor-solwait"); if (!el) return;
    const on = store.get("arcircle.orders.solwait", false) === true;
    el.innerHTML = `<div class="aor-sw-t">${ARCIA_ART}<div><b>${T("ARCIRCLE Orders on Solana opens soon")}</b><span>${T("Limit orders on any SPL token, signed in your wallet and filled through Jupiter. Want a heads-up when it's live?")}</span></div></div>
      <div class="aor-sw-b"><button type="button" class="aor-btn go${on ? " done" : ""}" data-solpush${on ? " disabled" : ""}>${on ? T("This browser will hear it") : T("Notify this browser")}</button><a class="aor-btn ghost" href="https://t.me/ARCIAonArc_bot?start=solorders" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11.2l6.2 2.1L19 7l-7.6 8.1.1 4.9 3.1-3.7 4.2 3.1z"/></svg><span>${T("Tell me on Telegram")}</span></a></div>`;
  }

  // ---------------- the guide folds ----------------
  function guideFold() {
    const g = panel.querySelector(".aor-guide"), h = g && g.querySelector("#aor-guide-h");
    if (!g || !h || g.dataset.fold) return;
    g.dataset.fold = "1";
    const visits = Number(store.get("arcircle.orders.visits", 0)) + 1;
    store.set("arcircle.orders.visits", visits);
    const b = document.createElement("button");
    b.type = "button"; b.className = "aor-gfold";
    h.appendChild(b);
    const set = (folded) => { g.classList.toggle("folded", folded); b.setAttribute("aria-expanded", String(!folded)); b.innerHTML = `<span data-no-i18n>${esc(folded ? L3("Show the guide", "가이드 보기", "显示指南") : L3("Fold", "접기", "收起"))}</span><i aria-hidden="true">${folded ? "▾" : "▴"}</i>`; };
    const saved = store.get("arcircle.orders.guidefold", null);
    set(saved != null ? saved === true : visits > 3);
    b.addEventListener("click", () => { const f = !g.classList.contains("folded"); store.set("arcircle.orders.guidefold", f); set(f); });
  }

  // ---------------- wiring ----------------
  panel.addEventListener("click", (e) => {
    const t = e.target;
    const pr = t.closest && t.closest("[data-protect]"); if (pr) { protect(lc(pr.dataset.protect)); return; }
    if (t.closest && t.closest("[data-pfre]")) { V.port = V.port ? { ...V.port, at: 0 } : null; loadPort(); return; }
    if (t.closest && t.closest("[data-bdt]")) { store.set("arcircle.orders.burnopen", !(store.get("arcircle.orders.burnopen", innerWidth > 720) === true)); V.burnShown = null; burnDash(); return; }
    const sp = t.closest && t.closest("[data-solpush]");
    if (sp) { sp.disabled = true; pushTopic("orders-sol").then((ok) => { if (ok) store.set("arcircle.orders.solwait", true); else if (O()) O().toast(tr("This browser can't take notifications here — try Telegram."), "bad"); solWait(); }); return; }
    // the tape's burn total opens the dashboard below instead of leaving the page
    const bc = t.closest && t.closest("#aor-burnct"), bd = $("aor-burnd");
    if (bc && bd && !bd.hidden) { e.preventDefault(); store.set("arcircle.orders.burnopen", true); burnDash(); bd.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); bd.classList.remove("flash"); void bd.offsetWidth; bd.classList.add("flash"); }
  });
  let timer = 0;
  function loop() { clearInterval(timer); timer = setInterval(() => { if (panel.classList.contains("active") && !document.hidden && CH() !== "sol") { loadBurns(); loadInfo(); } }, 60e3); }
  function frame() {
    // the phone's layout (arc-orders-v4.js): make sure it knows the Orders tab is open, however the page was reached
    document.documentElement.classList.toggle("aor-live", panel.classList.contains("active"));
    guideFold();
    if (V.burnCh !== CH()) { V.burns = null; V.burnShown = null; }
    burnDash(); paintInfo();
    if (CH() !== "sol") loadBurns();
    loadInfo();
    loop();
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "orders") loop(); else clearInterval(timer); });
  window.arcOrdersV5 = { frame, portfolio, protect, solWait, state: V, _burnDash: burnDash };
  if ($("aor-body") && $("aor-body").children.length) frame();
})();
