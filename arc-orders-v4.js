// arc-orders-v4.js — ARCIRCLE Orders v4 extras (bundled after arc-orders.js and arc-orders-x.js; works through
// window.arcOrders):
//   · the watchlist: every ★ market in one list — its price, 24h change, my open orders there and how far the nearest
//     one is from the price (prices from the markets list, this page, or the last time the market was open here)
//   · "type an order": a plain line like "buy 1m at 0.00000008", "sell 50% at +10%", "buy $100 at mcap 50k",
//     "stop sell all at -8%", "dca $300 over 1d", "buy 1m from -2% to -10% x5" fills the form (it never places it)
//   · Web Push: "Notify me" also subscribes this browser (GET ?orders=pushkey, POST pushsub) so fills, stops and price
//     alerts arrive with the tab closed — once the VAPID keys are set on the server; until then, in-tab notifications
//   · the phone's layout: on the Orders tab the site's quick bar steps aside for the Buy / Sell bar and ARCIA tucks in;
//     the hero's verified-source links fold behind an ⓘ
//   · the guide in three tabs (all of it stays in the page for readers without script and for ARCIA's knowledge)
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
  const O = () => window.arcOrders;
  const CH = () => (O() ? O().chain() : "arc");
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };
  const V = { draft: "", watchKey: "", pushKey: undefined, pushOn: false };

  // ---------------- the phone's layout ----------------
  const active = () => panel.classList.contains("active");
  function layout() { document.documentElement.classList.toggle("aor-live", active()); }
  document.addEventListener("arcpad:tab", () => setTimeout(layout, 0));
  /// the hero's verified-source links behind an ⓘ (phones; CSS shows the button only there)
  function heroInfo() {
    const hero = panel.querySelector(".aor-hero"), c = panel.querySelector(".aor-contracts");
    if (!hero || !c || hero.querySelector(".aor-cinfo")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "aor-cinfo"; b.setAttribute("aria-expanded", "false");
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/><path d="m9 12 2 2 4-4"/></svg><span>${T("Verified contracts")}</span><i aria-hidden="true">ⓘ</i>`;
    b.addEventListener("click", () => { const o = hero.classList.toggle("ci-open"); b.setAttribute("aria-expanded", String(o)); });
    c.parentNode.insertBefore(b, c);
    const sync = () => { b.hidden = c.hidden; };
    sync(); new MutationObserver(sync).observe(c, { attributes: true, attributeFilter: ["hidden"] });
  }

  // ---------------- the watchlist ----------------
  const SEENK = () => `arcircle.orders.seen.${CH()}`;
  /// the last price seen for each market on this chain (the watchlist's fallback for a market nobody trades)
  function noteSeen() {
    const S = O() && O().state;
    if (!S || !S.t || !S.tok || !(S.spot > 0) || S.pending) return;
    const m = store.get(SEENK(), {});
    const old = m[S.t];
    if (old && old.p === S.spot && Date.now() - (old.at || 0) < 60e3) return;
    m[S.t] = { p: S.spot, sym: S.tok.symbol, at: Date.now() };
    const keys = Object.keys(m); if (keys.length > 40) for (const k of keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 40)) delete m[k];
    store.set(SEENK(), m);
  }
  function watchRows() {
    const A = O(), S = A.state, seen = store.get(SEENK(), {});
    const mine = ((S.mine && S.mine.orders) || []).filter((o) => o.status === "open" || o.status === "unfunded");
    return A.favs().map((t) => {
      const m = S.markets.find((x) => lc(x.token.address || x.token) === t);
      const rc = A.recent().find((x) => x.t === t), sn = seen[t];
      const px = t === S.t && S.spot ? S.spot : m && (m.spot || m.last) ? m.spot || m.last : sn ? sn.p : null;
      const stale = !(t === S.t && S.spot) && !(m && (m.spot || m.last)) && !!sn;
      const sym = (m && m.token.symbol) || (rc && rc.sym) || (sn && sn.sym) || (t === S.t && S.tok ? S.tok.symbol : null);
      const os = mine.filter((o) => lc(o.token.address || o.token) === t);
      let near = null;
      for (const o of os) { const p = o.type === "stop" && o.trigger && o.trigger.price ? o.trigger.price : o.type === "trail" && o.trail ? o.trail.at : o.price; if (px && p > 0) { const d = ((p - px) / px) * 100; if (near == null || Math.abs(d) < Math.abs(near.d)) near = { d, side: o.side }; } }
      return { t, sym, px, stale, ch: m && m.change24 != null ? m.change24 : null, n: os.length, near };
    });
  }
  function watch() {
    const el = $("aor-watch"), A = O();
    if (!el || !A) return;
    noteSeen();
    const favs = A.favs();
    if (!favs.length || CH() === "sol") { el.hidden = true; el.innerHTML = ""; V.watchKey = ""; return; }
    const rows = watchRows(), open = store.get("arcircle.orders.watchopen", true) !== false;
    const key = JSON.stringify([rows, open, A.lang(), A.state.t]);
    if (key === V.watchKey && !el.hidden) return;
    V.watchKey = key; el.hidden = false;
    const fp = A.fp, pc = A.pc;
    el.innerHTML = `<button type="button" class="aor-watch-h" data-wtoggle aria-expanded="${open}"><i class="aor-star" aria-hidden="true">★</i><b>${T("Watchlist")}</b><em data-no-i18n>${rows.length}</em><small>${T("price · 24h · your orders · nearest")}</small><span aria-hidden="true">${open ? "▴" : "▾"}</span></button>` +
      (open ? `<div class="aor-watch-l">${rows.map((r) => `<button type="button" class="aor-wr${r.t === A.state.t ? " on" : ""}" data-t="${esc(r.t)}"><b data-no-i18n>$${esc(r.sym || r.t.slice(0, 6) + "…")}</b><span class="aor-wr-p" data-no-i18n${r.stale ? ` title="${T("last seen here")}"` : ""}>${r.px ? esc(fp(r.px)) : "—"}${r.stale ? "<i>·</i>" : ""}</span><em class="${r.ch == null ? "" : r.ch >= 0 ? "up" : "dn"}" data-no-i18n>${r.ch == null ? "—" : esc(pc(r.ch, 1))}</em><span class="aor-wr-n">${r.n ? `<i data-no-i18n>${r.n}</i> ${T(r.n === 1 ? "open order" : "open orders")}` : `<small>${T("no orders")}</small>`}</span><span class="aor-wr-d ${r.near ? (Math.abs(r.near.d) < 1 ? "hot" : r.near.side === "buy" ? "up" : "dn") : ""}" data-no-i18n>${r.near ? esc(pc(r.near.d, Math.abs(r.near.d) < 10 ? 1 : 0)) : ""}</span></button>`).join("")}</div>` : "");
  }

  // ---------------- "type an order" ----------------
  const SUB = { "₀": 0, "₁": 1, "₂": 2, "₃": 3, "₄": 4, "₅": 5, "₆": 6, "₇": 7, "₈": 8, "₉": 9 };
  /// "1.5m" → 1500000; "0.0₆1088" → 0.0000001088; null if it isn't a number
  function numOf(x) {
    let s = String(x || "").trim().toLowerCase().replace(/,/g, "");
    const sub = /^0\.0([₀-₉]+)(\d+)$/.exec(s);
    if (sub) s = "0.0" + "0".repeat(Number([...sub[1]].map((c) => SUB[c]).join(""))) + sub[2];
    const m = /^(\d*\.?\d+(?:e-?\d+)?)([kmb])?$/.exec(s);
    if (!m) return null;
    const v = Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1);
    return isFinite(v) && v > 0 ? v : null;
  }
  const NUM = "(\\d*\\.?\\d+(?:e-?\\d+)?[kmb]?|0\\.0[₀-₉]+\\d+)";
  /// a price: "0.00000008", "+10%" / "-5%" (from the pool's price), "mcap 50k" / "mc $1.2m" (market cap in dollars)
  function priceOf(str, ctx) {
    const s = String(str || "").trim().toLowerCase();
    let m = /^([+-−])\s*(\d*\.?\d+)\s*%$/.exec(s);
    if (m) { if (!(ctx.spot > 0)) return { err: "No pool price yet for a % price." }; const k = Number(m[2]) * (m[1] === "+" ? 1 : -1); return { v: Number((ctx.spot * (1 + k / 100)).toPrecision(4)) }; }
    m = new RegExp(`^(?:mcap|mc|market cap|cap)\\s*\\$?\\s*${NUM}$`).exec(s);
    if (m) { const mc = numOf(m[1]); if (!mc) return { err: "That market cap isn't a number." }; if (!(ctx.mcap1 > 0)) return { err: "No market cap for this token yet." }; return { v: mc / ctx.mcap1, mc }; }
    m = new RegExp(`^\\$?\\s*${NUM}$`).exec(s);
    if (m) { const v = numOf(m[1]); return v ? { v } : { err: "That price isn't a number." }; }
    return { err: "Couldn't read the price." };
  }
  /// one line → what to put in the form; deterministic, never places anything
  function parse(line, ctx) {
    let s = " " + String(line || "").toLowerCase().replace(/[，]/g, ",").replace(/\s+/g, " ").trim() + " ";
    if (!s.trim()) return null;
    const out = {};
    const take = (re) => { const m = re.exec(s); if (m) s = s.replace(m[0], " "); return m; };
    let m;
    if ((m = take(/ (buy|long|b) /))) out.side = "buy";
    else if ((m = take(/ (sell|short|s) /))) out.side = "sell";
    // timed: "dca … over 6h | 1d", "in 12 parts" (before the expiry, which also ends in d)
    if ((m = take(/ (dca|twap|timed) /))) out.type = "twap";
    if ((m = take(/ over (\d+) ?(h|hour|hours|d|day|days) /))) { out.type = "twap"; const sec = Number(m[1]) * (m[2][0] === "h" ? 3600 : 86400); const ok = [3600, 21600, 86400, 259200, 604800, 2592000]; out.dur = String(ok.reduce((a, b) => (Math.abs(b - sec) < Math.abs(a - sec) ? b : a))); }
    // expiry: "for 3d", "30d", "1 day"
    if ((m = take(/ (?:for |exp(?:ires)? (?:in )?)?(1|7|30|90) ?(?:d|day|days) /))) out.expiry = String(Number(m[1]) * 86400);
    if ((m = take(/ (?:in )?(\d+) parts /))) { const ok = [4, 6, 12, 24, 48], n = Number(m[1]); out.parts = String(ok.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))); }
    // take-profit / stop-loss pair, trailing stop
    if ((m = take(new RegExp(` tp ([^ ]+(?: [^ ]+)?) sl ([^ ]+(?: [^ ]+)?) `)))) { out.type = "tpsl"; out.tpS = m[1].trim(); out.slS = m[2].trim(); }
    if ((m = take(/ trail(?:ing)?(?: stop)?(?: by)? (\d+(?:\.\d+)?) ?% /))) { out.type = "trail"; out.trail = String([3, 5, 10, 15, 20].reduce((a, b) => (Math.abs(b - Number(m[1])) < Math.abs(a - Number(m[1])) ? b : a))); }
    // scaled: "from -2% to -10% x5"
    if ((m = take(/ from ([^ ]+) to ([^ ]+) /))) { out.type = "scaled"; out.loS = m[1]; out.hiS = m[2]; }
    if ((m = take(/ (?:x|×)\s?(\d+) /)) || (m = take(/ (\d+) orders /))) { out.n = String([3, 5, 8, 10].reduce((a, b) => (Math.abs(b - Number(m[1])) < Math.abs(a - Number(m[1])) ? b : a))); if (!out.type) out.type = "scaled"; }
    if ((m = take(/ (stop|stop-loss|stoploss) /))) out.type = out.type || "stop";
    if ((m = take(/ (market|now|instantly|at market) /))) out.type = "market";
    // the price: "at X" / "@ X" / "when X"
    if ((m = take(new RegExp(` (?:at|@|when|if) ((?:mcap|mc|market cap|cap) \\$?\\s*${NUM}|[+\\-−]\\s*\\d*\\.?\\d+ ?%|\\$?\\s*${NUM}) `)))) out.priceS = m[1].trim();
    // the amount: "50%", "all", "$100", "0.2 eth", "1.5m"
    if ((m = take(/ (all|max|everything) /))) out.pct = 100;
    else if ((m = take(/ (\d{1,3}(?:\.\d+)?) ?% /))) out.pct = Math.min(100, Number(m[1]));
    else if ((m = take(new RegExp(` \\$\\s*${NUM} `)))) out.usd = numOf(m[1]);
    else if ((m = take(new RegExp(` ${NUM} ?(eth|weth|usdc|usd) `)))) { if (m[2] === "usd") out.usd = numOf(m[1]); else out.quote = numOf(m[1]); }
    else if ((m = take(new RegExp(` ${NUM}(?: tokens?)? `)))) out.amount = numOf(m[1]);
    if (!out.side) {
      if (out.type === "tpsl" || out.type === "trail") out.side = "sell";
      else if (out.type === "twap") out.side = "buy";
      else return { err: "Start with buy or sell." };
    }
    if (out.type === "tpsl" || out.type === "trail") out.side = "sell";
    out.type = out.type || "limit";
    // prices
    const need = (k, str) => { const r = priceOf(str, ctx); if (r.err) throw new Error(r.err); out[k] = r.v; if (r.mc) out.mc = r.mc; };
    try {
      if (out.tpS) { need("tp", out.tpS); need("sl", out.slS); }
      if (out.loS) { need("lo", out.loS); need("hi", out.hiS); }
      if (out.priceS) need(out.type === "stop" ? "trigger" : out.type === "twap" ? "cap" : "price", out.priceS);
    } catch (e) { return { err: e.message }; }
    if (out.type === "limit" && !(out.price > 0)) return { err: "Add a price — at 0.0000001, at +5% or at mcap 50k." };
    if (out.type === "stop" && !(out.trigger > 0)) return { err: "Add the trigger — stop sell at -8%." };
    if (out.usd != null && !ctx.qUsd) return { err: "No dollar price for the quote yet." };
    if (out.usd != null) out.quote = out.usd / ctx.qUsd;
    if (!(out.amount > 0) && !(out.quote > 0) && !(out.pct > 0)) return { err: "Add an amount — 1m, $100, 0.1 eth or 50%." };
    return out;
  }
  const TYPE_L = { limit: "Limit", market: "Market", stop: "Stop order", tpsl: "TP / SL", trail: "Trailing stop", scaled: "Scaled", twap: "Timed (DCA)" };
  function ctxNow() {
    const A = O(), S = A.state;
    return { spot: S.spot, mcap1: A.mcapOf(1), qUsd: A.qUsd(), qs: S.quote ? S.quote.symbol : "", sym: S.tok ? S.tok.symbol : "" };
  }
  function preview(p) {
    const A = O(), ctx = ctxNow();
    if (!p) return `<small>${T("For example:")} <code data-no-i18n>buy 1m at 0.00000008</code> <code data-no-i18n>sell 50% at +10%</code> <code data-no-i18n>buy $100 at mcap 50k</code></small>`;
    if (p.err) return `<small class="bad">${T(p.err)}</small>`;
    const fp = A.fp, num = A.num, l = A.lang(), L3 = (en, ko, zh) => (l === "ko" ? ko : l === "zh" ? zh : en);
    const amt = p.pct ? L3(`${p.pct}% of your balance`, `잔액의 ${p.pct}%`, `余额的 ${p.pct}%`) : p.quote ? `${num(p.quote)} ${ctx.qs}` : `${num(p.amount)} $${ctx.sym}`;
    const at = p.price ? ` · ${L3("at", "가격", "价格")} ${fp(p.price)} ${ctx.qs}${p.mc ? ` (${L3("mcap", "시총", "市值")} ${A.usd(p.mc)})` : ""}` : p.trigger ? ` · ${L3("trigger", "트리거", "触发")} ${fp(p.trigger)}` : p.tp ? ` · TP ${fp(p.tp)} · SL ${fp(p.sl)}` : p.lo ? ` · ${fp(p.lo)} → ${fp(p.hi)}` : "";
    return `<small class="ok">→ <b>${T(p.side === "buy" ? "Buy" : "Sell")} · ${T(TYPE_L[p.type])}</b> <span data-no-i18n>${esc(amt)}${esc(at)}</span> · ${T("Enter fills the form")}</small>`;
  }
  /// the line's result into the form (and the form into view); nothing is signed or placed
  function apply(p) {
    const A = O(), S = A.state, F = A.form;
    if (!S.tok) { A.toast(tr("Open a market first."), "bad"); return false; }
    if (S.pending && (p.type !== "limit" || p.side !== "buy")) { A.toast(tr("Only a limit buy can wait for the graduation."), "bad"); return false; }
    if (!A.PRO() && !["limit", "market"].includes(p.type)) A.setMode("pro");
    S.side = p.side; S.type = p.type; S.msg = null; S.editing = null; S.pct = 0;
    // ten significant figures as a plain decimal (never 4.5e-9: the form reads digits and one point)
    const d = (v) => { if (!(v > 0) || !isFinite(v)) return ""; const n = Number(v.toPrecision(10)); return n.toFixed(Math.min(20, Math.max(0, 9 - Math.floor(Math.log10(n))))).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };
    const d6 = (v) => d(Number(v.toPrecision(6))); // a price: six significant figures, like the book's
    for (const k of ["price", "trigger", "tp", "sl", "lo", "hi", "cap"]) if (p[k] != null) F[k] = d6(p[k]);
    for (const k of ["expiry", "dur", "parts", "trail", "n"]) if (p[k] != null) F[k] = p[k];
    F.amount = ""; F.total = "";
    if (p.amount) F.amount = d(p.amount);
    if (p.quote) {
      if (p.side === "buy" && (p.type === "market" || p.type === "twap")) F.total = d(p.quote);
      else if (p.type === "limit") { F.total = d(p.quote); if (Number(F.price) > 0) F.amount = d(p.quote / Number(F.price)); }
      else { const px = Number(F.price || F.trigger || (Number(F.lo) + Number(F.hi)) / 2) || S.spot; if (px > 0) F.amount = d(p.quote / px); }
    }
    if (p.type === "limit" && F.amount && Number(F.price) > 0 && !F.total) F.total = d(Number(F.amount) * Number(F.price));
    A.render();
    if (p.pct) { const b = panel.querySelector(`#aor-formc [data-pct="${p.pct}"]`); if (b) b.click(); else { const sl = $("aor-slider"); if (sl) { sl.value = String(p.pct); sl.dispatchEvent(new Event("input", { bubbles: true })); } } }
    if (innerWidth > 720) { const fc = $("aor-formc"); if (fc) fc.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    A.toast(tr("The form is filled — check it, then place it."), "");
    return true;
  }
  function typeBox() {
    const S = O() && O().state;
    if (!S || !S.tok) return "";
    const p = V.draft.trim() ? parse(V.draft, ctxNow()) : null;
    return `<div class="aor-typeo"><label class="aor-typeo-in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h7"/><path d="m16 15 2 2 4-4"/></svg><input id="aor-typeo" type="text" autocomplete="off" spellcheck="false" placeholder="${T("Type an order: buy 1m at -5%")}" aria-label="${T("Type an order")}" value="${esc(V.draft)}"></label><div class="aor-typeo-p" id="aor-typeo-p" aria-live="polite">${V.draft.trim() ? preview(p) : ""}</div></div>`;
  }
  panel.addEventListener("input", (e) => {
    if (e.target.id !== "aor-typeo") return;
    V.draft = e.target.value;
    const pv = $("aor-typeo-p"); if (pv) pv.innerHTML = V.draft.trim() ? preview(parse(V.draft, ctxNow())) : "";
  });
  panel.addEventListener("focusin", (e) => { if (e.target.id === "aor-typeo" && !V.draft) { const pv = $("aor-typeo-p"); if (pv) pv.innerHTML = preview(null); } });
  // Enter in the box fills the form (and stops there: the page's own Enter would place the order)
  panel.addEventListener("keydown", (e) => {
    if (e.target.id !== "aor-typeo" || e.key !== "Enter") return;
    e.preventDefault(); e.stopPropagation();
    const p = parse(V.draft, ctxNow());
    if (!p || p.err) { const pv = $("aor-typeo-p"); if (pv) pv.innerHTML = preview(p); return; }
    const keep = V.draft;
    V.draft = "";
    if (!apply(p)) V.draft = keep;
  }, true);

  // ---------------- Web Push ----------------
  const b64ToBytes = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  async function pushKey() {
    if (V.pushKey !== undefined) return V.pushKey;
    try { const r = await fetch("/api/social?orders=pushkey", { cache: "no-store" }); const j = r.ok ? await r.json() : null; V.pushKey = (j && typeof j.key === "string" && j.key.length > 80 && j.key) || null; } catch { V.pushKey = null; }
    return V.pushKey;
  }
  const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 4000))]);
  async function pushSync(on, { ask = false } = {}) {
    const A = O(); if (!A) return false;
    const w = A.me();
    if (!w || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const key = await pushKey();
    if (!key) return false;
    let v = A.viewOf(w);
    if (!v && on && ask) { await A.unlock(); v = A.viewOf(w); }
    if (!v) return false;
    try {
      const reg = await swReady(); if (!reg || !reg.pushManager) return false;
      let sub = await reg.pushManager.getSubscription();
      if (on) {
        if (Notification.permission !== "granted") { if (!ask || (await Notification.requestPermission()) !== "granted") return false; }
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      }
      if (!sub) return !on;
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pushsub", wallet: w, until: v.until, sig: v.sig, sub: sub.toJSON(), lang: A.lang(), ...(on ? {} : { remove: true }) }) });
      if (!on) { await sub.unsubscribe().catch(() => null); }
      V.pushOn = on && r.ok;
      store.set("arcircle.orders.push", V.pushOn ? lc(w) : null);
      return r.ok;
    } catch { return false; }
  }
  function pushLabel() {
    const l = panel.querySelector(".aor-ntf"); if (!l) return;
    const on = store.get("arcircle.orders.push", null) === lc((O() && O().me()) || "") && !!(O() && O().me());
    l.classList.toggle("push", on);
    l.title = tr(on ? "Fills, stops and price alerts reach this browser even with the tab closed" : "Fills and alerts while this tab is open");
  }
  panel.addEventListener("change", async (e) => {
    if (e.target.id !== "aor-notify") return;
    const on = e.target.checked;
    const ok = await pushSync(on, { ask: true });
    if (on && ok) O().toast(tr("Notifications on"), "fill", tr("Fills, stops and price alerts reach this browser even with the tab closed."));
    else if (on && V.pushKey === null) O().toast(tr("Notifications on while this tab is open"), "", tr("Alerts with the tab closed: the ARCIA bot on Telegram, /orderalerts on."));
    pushLabel();
  });

  // ---------------- the guide in three tabs ----------------
  function guideTabs() {
    const g = panel.querySelector(".aor-guide"); if (!g || g.dataset.tabs) return;
    const panes = [...g.querySelectorAll(".aor-gpane[data-gp]")]; if (panes.length < 2) return;
    g.dataset.tabs = "1"; g.classList.add("tabs-on");
    const bar = g.querySelector(".aor-gtabs"); if (!bar) return;
    bar.hidden = false;
    const pick = (k) => { for (const p of panes) p.hidden = p.dataset.gp !== k; bar.querySelectorAll("[data-gt]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.gt === k))); store.set("arcircle.orders.guidetab", k); };
    bar.addEventListener("click", (e) => { const b = e.target.closest("[data-gt]"); if (b) pick(b.dataset.gt); });
    const k0 = store.get("arcircle.orders.guidetab", panes[0].dataset.gp);
    pick(panes.some((p) => p.dataset.gp === k0) ? k0 : panes[0].dataset.gp);
  }

  // ---------------- wiring ----------------
  panel.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-wtoggle]");
    if (!b) return;
    store.set("arcircle.orders.watchopen", !(store.get("arcircle.orders.watchopen", true) !== false));
    V.watchKey = ""; watch();
  });
  let timer = 0;
  function loop() { clearInterval(timer); timer = setInterval(() => { if (active() && !document.hidden && O()) { watch(); pushLabel(); } }, 1500); }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "orders") { loop(); setTimeout(() => { watch(); pushLabel(); }, 300); } else clearInterval(timer); });
  window.arcOrdersV4 = { typeBox, parse, apply, watch, pushSync, state: V, _numOf: numOf, _priceOf: priceOf };
  layout(); heroInfo(); guideTabs();
  if (active()) loop();
  // a browser already subscribed keeps its subscription fresh for the wallet (a new view signature after 30 days)
  setTimeout(() => { if (store.get("arcircle.orders.push", null) && O() && O().me()) pushSync(true).then(pushLabel); }, 4000);
})();
