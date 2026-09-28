/* global ethers, CONFIG, state, connectWallet, ensureArcForWrite */
// arc-arcia402.js — ARCIA 402, an ARCIRCLE PAD utility (arcpad.html#arcia402).
// ARCIA as an economic agent on Arc: she sells her intelligence per call over x402 (HTTP 402
// Payment Required, USDC on Arc), hires other agents' x402 services with her own wallet, and keeps
// public books. Everything here reads /api/arcia402 (api/arcia402.mjs):
//   · her wallet      portrait, live USDC balance (counts up), $ARCIRCLE, status, tips
//   · the loop        THINK → DISCOVER → PAY → ACT → EARN → LEARN on an ♾ path; a pulse runs it,
//                     and a new sale / hire / tip sends a burst around it
//   · P&L             revenue, expenses, tips, net; 14 days earned-up / spent-down; milestones
//   · the storefront  eight services: free preview, or "Pay & run" (USDC from your wallet, arc-tx)
//                     with a step-by-step payment and ARCIA's answer as a card with a shareable receipt
//   · the books       live ledger (new rows slide in), top customers, ARCIA's shopping diary
//   · for agents      curl / JS / Python / MCP, manifest, llms.txt
//   · links in        #arcia402?svc=<id>&token=0x…   prefill a service (ARCIA's chat links here)
//                     #arcia402?sale=<tx>            open a sale's receipt
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-arcia402");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arcscan.app"}/${kind}/${x}`;
  const USDC = (typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000";
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, n !== 0 && Math.abs(n) < 0.1 ? 3 : d) }));
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? tr("just now") : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const toast = (m, k) => { if (typeof window.arcToast === "function") window.arcToast(tr(m), k); };
  const fx = (k) => { if (typeof window.arcFeedback === "function") window.arcFeedback(k); };
  async function fetchJson(url, opts = {}, ms = 45000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store" }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; }
    catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }
  const S = { stats: null, at: 0, busy: {}, step: {}, txs: {}, input: {}, results: {}, previews: {}, booted: false, timer: 0, seen: null, shown: { usdc: null }, devTab: "curl", tipBusy: false, sale: null, shopping: false };
  const LOOP = [["Think", "reads the question"], ["Discover", "finds a service on Arc"], ["Pay", "USDC, per call"], ["Act", "runs the job"], ["Earn", "other agents pay her"], ["Learn", "keeps what she got"]];
  const PAYSTEPS = [["terms", "HTTP 402 · price"], ["wallet", "Confirm in wallet"], ["settle", "Settled on Arc"], ["answer", "ARCIA's answer"]];
  const LOOPD = "M300 110C352 30 500 24 526 96C548 160 470 200 400 184C356 174 330 148 300 110C270 72 244 46 200 36C130 20 52 60 74 124C100 196 248 190 300 110Z";

  // ---------------- skeleton ----------------
  function frame() {
    $("a4-body").innerHTML = `
      <div id="a4-sale"></div>
      <div class="a4-top">
        <div class="ams-card a4-me" id="a4-me"><div class="a4-skel"><i></i><i></i><i></i></div></div>
        <div class="ams-card a4-loopc" aria-label="${T("How ARCIA works")}">
          <div class="a4-card-h"><h3>${T("How ARCIA works")}</h3><span class="a4-live"><i></i>${T("Always on")}</span></div>
          <svg class="a4-inf" viewBox="-90 -30 780 280" role="img" aria-label="THINK → DISCOVER → PAY → ACT → EARN → LEARN">
            <defs><linearGradient id="a4LoopG" x1="0" x2="1"><stop offset="0" stop-color="#4d9fff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>
            <path id="a4-path" class="a4-track" d="${LOOPD}"/><path class="a4-track2" d="${LOOPD}"/>
            ${LOOP.map(([k, s], i) => `<g class="a4-node" data-i="${i}"><circle r="9"/><text class="k" text-anchor="middle">${T(k)}</text><text class="s" text-anchor="middle">${T(s)}</text></g>`).join("")}
            <circle class="a4-pulse" r="6"/><circle class="a4-pulse2" r="14"/>
          </svg>
        </div>
      </div>
      <div class="ams-card a4-pl" id="a4-pl"><div class="a4-skel"><i></i><i></i></div></div>
      <h2 class="a4-h">${T("ARCIA's storefront")} <small>${T("Pay per call in USDC on Arc — people and AI agents alike. Every service has a free preview.")}</small></h2>
      <div class="a4-shop" id="a4-shop"></div>
      <div class="a4-grid b">
        <div class="ams-card a4-ledger"><div class="a4-card-h"><h3>${T("The books")}</h3><span class="a4-live"><i></i>${T("Live")}</span></div><div id="a4-ledger"></div><div id="a4-cust"></div></div>
        <div class="ams-card a4-diary"><div class="a4-card-h"><h3>${T("ARCIA's shopping diary")}</h3><small class="a4-muted" id="a4-next"></small></div><div id="a4-diary"></div></div>
      </div>
      <div class="ams-card a4-dev" id="a4-dev"></div>
      <div class="ams-card a4-road" id="a4-road"></div>
      <div class="a4-fxl" id="a4-fxl" aria-hidden="true"></div>`;
    placeNodes();
  }

  // ---------------- the ♾ loop ----------------
  const L = { raf: 0, t0: 0, speed: 1, len: 0, burstUntil: 0, lastI: -1 };
  function placeNodes() {
    const p = $("a4-path");
    if (!p || !p.getTotalLength) return;
    L.len = p.getTotalLength();
    // each step sits at a landmark of the ♾ — top, outer edge and bottom of each loop, in the order
    // the pulse passes them — with its label on the outside
    const TARGETS = [[430, 30, 0, -1], [540, 110, 1, 0], [430, 190, 0, 1], [170, 30, 0, -1], [60, 110, -1, 0], [170, 190, 0, 1]];
    const pts = Array.from({ length: 481 }, (_, j) => { const q = p.getPointAtLength((L.len * j) / 480); return { x: q.x, y: q.y, f: j / 480 }; });
    L.params = [];
    panel.querySelectorAll(".a4-node").forEach((g) => {
      const i = +g.dataset.i, [tx, ty, ux, uy] = TARGETS[i];
      const pt = pts.reduce((best, q) => ((q.x - tx) ** 2 + (q.y - ty) ** 2 < (best.x - tx) ** 2 + (best.y - ty) ** 2 ? q : best), pts[0]);
      L.params[i] = pt.f;
      g.querySelector("circle").setAttribute("cx", pt.x); g.querySelector("circle").setAttribute("cy", pt.y);
      const k = g.querySelector(".k"), s = g.querySelector(".s"), lx = pt.x + ux * 20, ly = pt.y + uy * 20;
      const anchor = ux > 0 ? "start" : ux < 0 ? "end" : "middle";
      const [ky, sy] = uy < 0 ? [ly - 16, ly - 2] : uy > 0 ? [ly + 10, ly + 24] : [ly - 3, ly + 11];
      for (const [el, y] of [[k, ky], [s, sy]]) { el.setAttribute("x", lx); el.setAttribute("y", y); el.setAttribute("text-anchor", anchor); }
    });
    if (reduce) { const pl = panel.querySelector(".a4-pulse"), q = p.getPointAtLength(0); if (pl) { pl.setAttribute("cx", q.x); pl.setAttribute("cy", q.y); } return; }
    loopStart();
  }
  function loopTick(now) {
    L.raf = 0;
    if (!panel.classList.contains("active") || document.hidden) return;
    const p = $("a4-path");
    if (!p || !L.len) return;
    if (!L.t0) L.t0 = now;
    const burst = now < L.burstUntil;
    const lap = burst ? 1800 : 9000; // one lap: 9 s idle, 1.8 s in a burst
    L.pos = ((L.pos || 0) + ((now - (L.prev || now)) / lap)) % 1; L.prev = now;
    const pt = p.getPointAtLength(L.pos * L.len);
    const c1 = panel.querySelector(".a4-pulse"), c2 = panel.querySelector(".a4-pulse2");
    if (c1) { c1.setAttribute("cx", pt.x); c1.setAttribute("cy", pt.y); }
    if (c2) { c2.setAttribute("cx", pt.x); c2.setAttribute("cy", pt.y); }
    const pr = L.params || [], i = pr.reduce((acc, f, j) => (L.pos >= f ? j : acc), 5);
    if (i !== L.lastI) {
      L.lastI = i;
      panel.querySelectorAll(".a4-node").forEach((g) => g.classList.toggle("on", +g.dataset.i === i));
    }
    panel.querySelector(".a4-inf") && panel.querySelector(".a4-inf").classList.toggle("burst", burst);
    L.raf = requestAnimationFrame(loopTick);
  }
  function loopStart() { if (!reduce && !L.raf) { L.prev = 0; L.raf = requestAnimationFrame(loopTick); } }
  function burst() { L.burstUntil = performance.now() + 3600; loopStart(); }

  // ---------------- data ----------------
  async function load(force) {
    if (!force && S.stats && Date.now() - S.at < 12000) return;
    const r = await fetchJson("/api/arcia402?stats=1", {}, 20000);
    if (r.ok && r.j) { const prev = S.stats; S.stats = r.j; S.at = Date.now(); paint(); events(prev, r.j); }
    else paint();
  }
  const keyOfItem = (e) => `${e.kind}:${e.t}:${e.tx || ""}`;
  function events(prev, d) {
    const items = d.items || [];
    const keys = new Set(items.map(keyOfItem));
    if (!S.seen) { S.seen = keys; return; } // first load: nothing is "new"
    const fresh = items.filter((e) => !S.seen.has(keyOfItem(e)));
    S.seen = keys;
    if (!fresh.length) return;
    const money = fresh.filter((e) => e.kind === "earn" || e.kind === "tip");
    const hires = fresh.filter((e) => e.kind === "spend" || e.kind === "look");
    burst();
    if (money.length) {
      const total = money.reduce((s, e) => s + (e.amount || 0), 0);
      fx("buy");
      flyCoin(money[0].svc, total);
    }
    if (hires.length) shopping();
    const before = new Set(((prev && prev.badges) || []).filter((b) => b.at).map((b) => b.id));
    const got = (d.badges || []).filter((b) => b.at && !before.has(b.id));
    if (got.length && prev) { fx("milestone"); if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: 140 }); toast(`${tr("Milestone")}: ${tr(got[0].title)}`); }
  }
  function paint() { paintMe(); paintPL(); paintShop(); paintLedger(); paintCust(); paintDiary(); paintDev(); paintRoad(); }

  // ---------------- wallet ----------------
  function status(d) {
    if (!d || !d.wallet) return ["", "Opening soon"];
    if (d.paused && d.paused.sell && d.paused.hire) return ["warn", "Paused"];
    if (d.canPay) return ["on", "Live · earns and hires"];
    return ["on", "Live · earning"];
  }
  function paintMe() {
    const box = $("a4-me"), d = S.stats;
    if (!box) return;
    if (!d) { box.innerHTML = `<p class="a4-muted">${T("Couldn't read ARCIA's books right now — try again in a moment.")}</p>`; return; }
    const b = d.balances || {}, [cls, label] = status(d);
    box.innerHTML = `<div class="a4-me-top">
        <div class="a4-face"><img src="/images/arcia-portrait-480.webp" alt="ARCIA" width="84" height="84" loading="lazy"><i class="${cls}"></i></div>
        <div class="a4-me-id"><small>${T("ARCIA's wallet")}</small><b>ARCIA</b><span class="a4-chip ${cls}">${T(label)}</span></div>
      </div>
      <div class="a4-bigbal"><small>${T("USDC balance")}</small><b data-no-i18n id="a4-usdc">${b.usdc == null ? "—" : usd(S.shown.usdc != null ? S.shown.usdc : b.usdc)}</b><span data-no-i18n>${b.arcircle == null ? "" : `${num(b.arcircle)} $ARCIRCLE`}</span></div>
      ${d.wallet ? `<div class="a4-addr"><code data-no-i18n>${esc(d.wallet)}</code><button type="button" class="ams-mini" data-a4-copy="${esc(d.wallet)}">${T("Copy")}</button><a class="ams-mini" href="${EXPL("address", d.wallet)}" target="_blank" rel="noopener">${T("Explorer")} ↗</a></div>` : ""}
      <div class="a4-tip"><span>${T("Tip ARCIA")}</span>${[0.1, 0.5, 1].map((v) => `<button type="button" class="ams-mini" data-a4-tip="${v}"${S.tipBusy || !d.wallet ? " disabled" : ""}>${usd(v)}</button>`).join("")}${S.tipBusy ? `<em><span class="a4-spin"></span>${T(S.tipBusy)}</em>` : ""}</div>`;
    countTo(b.usdc);
  }
  function countTo(v) {
    const el = $("a4-usdc");
    if (!el || v == null) return;
    const from = S.shown.usdc;
    S.shown.usdc = v;
    if (from == null || from === v || reduce) { el.textContent = usd(v); return; }
    const t0 = performance.now(), dur = 1200;
    const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); const cur = $("a4-usdc"); if (!cur) return; cur.textContent = usd(from + (v - from) * e); if (k < 1) requestAnimationFrame(step); else cur.classList.add("pop"); };
    requestAnimationFrame(step);
    setTimeout(() => { const cur = $("a4-usdc"); if (cur) cur.classList.remove("pop"); }, 1800);
  }
  function flyCoin(svc, amount) {
    const layer = $("a4-fxl"), to = $("a4-usdc");
    if (!layer || !to) return;
    const src = (svc && panel.querySelector(`.a4-svc[data-svc="${svc}"] .a4-price`)) || panel.querySelector(".a4-ledger h3") || to;
    const a = src.getBoundingClientRect(), b = to.getBoundingClientRect(), base = panel.getBoundingClientRect();
    const plus = document.createElement("span");
    plus.className = "a4-plus"; plus.textContent = "+" + usd(amount);
    plus.style.left = b.left - base.left + b.width / 2 + "px"; plus.style.top = b.top - base.top + "px";
    layer.appendChild(plus); setTimeout(() => plus.remove(), 2000);
    if (reduce) return;
    for (let i = 0; i < 5; i++) {
      const c = document.createElement("i");
      c.className = "a4-coin";
      c.style.left = a.left - base.left + a.width / 2 + "px"; c.style.top = a.top - base.top + a.height / 2 + "px";
      layer.appendChild(c);
      const dx = b.left - a.left + (b.width / 2 - a.width / 2), dy = b.top - a.top + (b.height / 2 - a.height / 2);
      const bow = -80 - i * 14;
      c.animate([{ transform: "translate(0,0) scale(.6)", opacity: 0 }, { transform: `translate(${dx * 0.5}px,${dy * 0.5 + bow}px) scale(1)`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(.4)`, opacity: 0.2 }], { duration: 900 + i * 90, delay: i * 70, easing: "cubic-bezier(.4,.1,.2,1)", fill: "forwards" });
      setTimeout(() => c.remove(), 1500 + i * 160);
    }
  }

  // ---------------- P&L ----------------
  function paintPL() {
    const box = $("a4-pl"), d = S.stats;
    if (!box || !d) return;
    const t = d.totals || {};
    const byDay = new Map((d.days || []).map((x) => [x.day, x]));
    const days = Array.from({ length: 14 }, (_, i) => { const k = new Date(Date.now() - (13 - i) * 86400e3).toISOString().slice(0, 10); return byDay.get(k) || { day: k, earned: 0, spent: 0, tips: 0 }; });
    const max = Math.max(0.01, ...days.map((x) => Math.max(x.earned + (x.tips || 0), x.spent)));
    const today = days[13], tnet = today.earned + (today.tips || 0) - today.spent;
    const net = t.net || 0;
    const tile = (cls, k, v, sub) => `<div class="a4-tile ${cls}"><small>${T(k)}</small><b data-no-i18n>${v}</b><span>${sub}</span></div>`;
    box.innerHTML = `<div class="a4-card-h"><h3>${T("ARCIA P&L")}</h3><small class="a4-muted">${T("Today")}: <b data-no-i18n class="${tnet >= 0 ? "up" : "down"}">${tnet >= 0 ? "+" : "−"}${usd(Math.abs(tnet))}</b></small></div>
      <div class="a4-tiles">
        ${tile("up", "Revenue", usd(t.earned), `${esc(num(t.sold || 0))} ${T("paid calls")}`)}
        ${tile("down", "Expenses", usd(t.spent), `${esc(num(t.bought || 0))} ${T("agents hired")}`)}
        ${tile("tip", "Tips", usd(t.tips), `${esc(num(t.tipn || 0))} ${T("tips")}`)}
        ${tile(`net ${net >= 0 ? "up" : "down"}`, "Net", `${net >= 0 ? "+" : "−"}${usd(Math.abs(net))}`, T("revenue + tips − expenses"))}
      </div>
      <div class="a4-chart">
        <div class="a4-bars" role="img" aria-label="${T("Earned and spent per day")}">${days.map((x, i) => {
          const up = x.earned + (x.tips || 0);
          return `<div class="a4-bar${i === 13 ? " today" : ""}" style="--i:${i}" tabindex="0"><i class="e" style="--h:${((up / max) * 100).toFixed(1)}%"></i><i class="s" style="--h:${((x.spent / max) * 100).toFixed(1)}%"></i><span data-no-i18n>${esc(x.day.slice(8))}</span><em class="a4-tt" data-no-i18n>${esc(x.day)}<br>+${usd(up)} · −${usd(x.spent)}</em></div>`;
        }).join("")}</div>
        <div class="a4-legend"><span><i class="e"></i>${T("Earned + tips")}</span><span><i class="s"></i>${T("Spent")}</span><span class="a4-muted">${T("last 14 days")}</span></div>
      </div>
      <div class="a4-badges">${(d.badges || []).map((b) => `<span class="a4-badge${b.at ? " on" : ""}" title="${b.at ? esc(new Date(b.at).toISOString().slice(0, 10)) : esc(tr("Not yet"))}"><i aria-hidden="true">${b.at ? "✓" : ""}</i>${T(b.title)}</span>`).join("")}</div>`;
  }

  // ---------------- storefront ----------------
  function shopState(d) {
    if (!d || !d.wallet) return "Opening soon";
    if (d.paused && d.paused.sell) return "Paused";
    return "";
  }
  function paintShop() {
    const box = $("a4-shop"), d = S.stats;
    if (!box || !d) return;
    const closed = shopState(d);
    const html = (d.services || []).map((s) => {
      const res = S.results[s.id], pv = S.previews[s.id], busy = S.busy[s.id];
      return `<div class="ams-card a4-svc${busy ? " busy" : ""}" data-svc="${esc(s.id)}">
        <div class="a4-svc-top"><span class="a4-price" data-no-i18n>${usd(s.price, 2)}</span><span class="a4-per">${T("per call")}</span></div>
        <h3>${T(s.title)}</h3><p>${T(s.desc)}</p>
        ${Array.isArray(s.gets) ? `<ul class="a4-gets">${s.gets.map((g) => `<li>${T(g)}</li>`).join("")}</ul>` : ""}
        <code class="a4-ep" data-no-i18n>GET /arcia402/${esc(s.id)}${s.input ? `?${esc(s.input)}=0x…` : ""}</code>
        ${s.input ? `<input type="text" class="a4-in" data-a4-in="${esc(s.id)}" spellcheck="false" autocomplete="off" placeholder="${esc(tr(s.input === "wallet" ? "Wallet address (0x…)" : "Token address (0x…)"))}" value="${esc(S.input[s.id] || "")}">` : ""}
        <div class="a4-btns">
          <button type="button" class="ams-mini a4-pv" data-a4-pv="${esc(s.id)}"${busy ? " disabled" : ""}>${T("Free preview")}</button>
          <button type="button" class="ams-btn a4-go" data-a4-run="${esc(s.id)}"${busy || closed ? " disabled" : ""}>${closed ? T(closed) : busy ? `<span class="a4-spin"></span>${T("Working…")}` : `${T("Pay")} <b data-no-i18n>${usd(s.price, 2)}</b> ${T("& run")}`}</button>
        </div>
        ${busy ? stepper(s.id) : ""}
        ${pv ? previewHtml(s, pv) : ""}
        ${res ? resultHtml(s, res) : ""}
      </div>`;
    }).join("");
    if (box.__html !== html) {
      const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.a4In : null;
      box.innerHTML = html; box.__html = html;
      if (focus) { const el = box.querySelector(`[data-a4-in="${focus}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
    }
  }
  function stepper(id) {
    const cur = S.step[id] || "terms", at = PAYSTEPS.findIndex(([k]) => k === cur), tx = S.txs[id];
    return `<ol class="a4-steps">${PAYSTEPS.map(([k, l], i) => `<li class="${i < at ? "done" : i === at ? "on" : ""}"><i>${i < at ? "✓" : i + 1}</i><span>${T(l)}</span></li>`).join("")}</ol>
      ${tx ? `<div class="a4-txl" data-no-i18n>tx <a href="${EXPL("tx", tx)}" target="_blank" rel="noopener" class="a4-type" style="--n:${tx.length}">${esc(tx)}</a></div>` : ""}`;
  }
  function previewHtml(s, pv) {
    if (pv.error) return `<div class="a4-res bad"><b>${esc(pv.error)}</b></div>`;
    const skip = new Set(["service", "preview", "full"]);
    const rows = Object.entries(pv).filter(([k]) => !skip.has(k)).map(([k, v]) => [k.replace(/_/g, " "), Array.isArray(v) ? v.join(" · ") : typeof v === "number" ? num(v) : String(v)]);
    return `<div class="a4-res pv"><div class="a4-res-h"><b>${T("Free preview")}</b><span class="a4-paid">${T("The full answer:")} ${usd(s.price, 2)}</span></div>
      ${rows.length ? `<dl class="a4-facts">${rows.slice(0, 6).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd data-no-i18n>${esc(v)}</dd></div>`).join("")}</dl>` : ""}</div>`;
  }
  function facts(r) {
    const f = [];
    if (r.score != null) f.push([tr("Score"), `${r.score}/100 · ${r.verdict || ""}`]);
    if (r.market && r.market.price_usd != null) f.push([tr("Price"), "$" + Number(r.market.price_usd).toPrecision(3)]);
    if (r.market_cap_usd != null) f.push([tr("Market cap"), usd(r.market_cap_usd, 0)]);
    if (r.holders && r.holders.count != null) f.push([tr("Holders"), num(r.holders.count)]);
    if (r.count != null && Array.isArray(r.holders)) f.push([tr("Holders"), num(r.count)]);
    if (r.fingerprint) f.push([tr("Fingerprint"), String(r.fingerprint).slice(0, 14) + "…"]);
    if (r.usdc != null) f.push(["USDC", usd(r.usdc)]);
    if (typeof r.arcircle === "number") f.push(["$ARCIRCLE", num(r.arcircle)]);
    if (Array.isArray(r.airdrops_received)) f.push([tr("Airdrops"), String(r.airdrops_received.length)]);
    if (Array.isArray(r.received)) f.push([tr("Airdrops"), String(r.received.length)]);
    if (Array.isArray(r.claimable)) f.push([tr("Claimable"), String(r.claimable.length)]);
    if (r.arcircle && r.arcircle.price_usd != null) f.push(["$ARCIRCLE", "$" + Number(r.arcircle.price_usd).toPrecision(3)]);
    if (Array.isArray(r.newest_launches)) f.push([tr("New launches"), String(r.newest_launches.length)]);
    if (Array.isArray(r.launches)) f.push([tr("Launches"), String(r.launches.length)]);
    if (r.raised_usdc != null) f.push([tr("Raised"), usd(r.raised_usdc, 0) + " USDC"]);
    if (r.seconds_left != null) f.push([tr("Time left"), r.seconds_left > 0 ? `${Math.floor(r.seconds_left / 3600)}h ${Math.floor((r.seconds_left % 3600) / 60)}m` : tr("Closed")]);
    return f;
  }
  function resultHtml(s, res) {
    if (res.error) return `<div class="a4-res bad"><b>${esc(res.error)}</b>${res.credit ? `<p>${T(res.credit)}</p>` : ""}${res.tx ? ` <a href="${EXPL("tx", res.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ""}${res.retry ? `<button type="button" class="ams-mini" data-a4-retry="${esc(s.id)}">${T("Try again with the same payment")}</button>` : ""}</div>`;
    const r = res.result || {}, tx = res.paid && res.paid.transaction || "";
    const f = facts(r);
    const link = tx ? `${location.origin}/a402/${tx}` : "";
    const share = tx ? `https://x.com/intent/post?text=${encodeURIComponent(`I just paid ARCIA ${usd(s.price, 2)} in USDC for ${s.title} — an AI earning her own money on Circle's Arc with x402 💚`)}&url=${encodeURIComponent(link)}&via=ARCIRCLEonArc` : "";
    return `<div class="a4-res">
      <div class="a4-res-h"><img src="/images/arcia-avatar-96.jpg" alt="" width="28" height="28"><b>ARCIA</b><span class="a4-paid">${T("Paid")} ${tx ? `<a href="${EXPL("tx", tx)}" target="_blank" rel="noopener">tx ↗</a>` : ""}</span></div>
      ${r.arcia ? `<p class="a4-say" data-no-i18n>${esc(r.arcia)}</p>` : ""}
      ${f.length ? `<dl class="a4-facts">${f.slice(0, 6).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd data-no-i18n>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${tx ? `<div class="a4-share"><a class="ams-mini" href="${share}" target="_blank" rel="noopener">${T("Share on X")}</a><button type="button" class="ams-mini" data-a4-copy="${esc(link)}">${T("Copy receipt link")}</button></div>` : ""}
      <details class="a4-json"><summary>${T("Full JSON")}</summary><pre data-no-i18n>${esc(JSON.stringify(r, null, 2).slice(0, 12000))}</pre></details></div>`;
  }

  // ---------------- books, customers, diary ----------------
  function paintLedger() {
    const box = $("a4-ledger"), d = S.stats;
    if (!box || !d) return;
    const items = (d.items || []).filter((e) => e.kind !== "look").slice(0, 16);
    const fresh = box.__keys ? items.filter((e) => !box.__keys.has(keyOfItem(e))).map(keyOfItem) : [];
    const html = items.length ? `<ol class="a4-feed">${items.map((e, i) => {
      const nw = fresh.includes(keyOfItem(e)) ? " new" : "";
      const txl = e.tx ? ` · <a href="${EXPL("tx", e.tx)}" target="_blank" rel="noopener">tx ↗</a>` : "";
      if (e.kind === "earn") return `<li class="earn${nw}" style="--i:${i}"><i aria-hidden="true">+</i><div><b>${T("Sold")} <span data-no-i18n>${esc(e.svc)}</span></b><small data-no-i18n>${esc(short(e.from))}${e.tx ? ` · <a href="/a402/${esc(e.tx)}">${esc(tr("receipt"))}</a>` : ""}${txl}</small></div><em data-no-i18n>+${usd(e.amount, 2)}</em><time>${esc(ago(e.t))}</time></li>`;
      if (e.kind === "tip") return `<li class="tip${nw}" style="--i:${i}"><i aria-hidden="true">♥</i><div><b>${T("Tip from")} <span data-no-i18n>${esc(short(e.from))}</span></b><small data-no-i18n>${txl.replace(/^ · /, "")}</small></div><em data-no-i18n>+${usd(e.amount, 2)}</em><time>${esc(ago(e.t))}</time></li>`;
      if (e.kind === "redo") return `<li class="redo${nw}" style="--i:${i}"><i aria-hidden="true">↻</i><div><b>${T("Answered on a credit")} <span data-no-i18n>${esc(e.svc)}</span></b><small data-no-i18n>${esc(short(e.from))}</small></div><em data-no-i18n>$0</em><time>${esc(ago(e.t))}</time></li>`;
      return `<li class="spend${nw}" style="--i:${i}"><i aria-hidden="true">−</i><div><b>${T("Hired")} <span data-no-i18n>${esc(e.provider || e.svc)}</span></b><small data-no-i18n>${esc(e.category || "")}${txl}</small></div><em data-no-i18n>−${usd(e.amount, 2)}</em><time>${esc(ago(e.t))}</time></li>`;
    }).join("")}</ol>` : `<p class="a4-muted">${T("No sales yet — be ARCIA's first customer above.")}</p>`;
    box.__keys = new Set(items.map(keyOfItem));
    box.innerHTML = html;
  }
  function paintCust() {
    const box = $("a4-cust"), d = S.stats;
    if (!box || !d) return;
    const c = d.customers || [];
    box.innerHTML = c.length ? `<h4 class="a4-sub">${T("Top customers")}</h4><ol class="a4-cust">${c.map((x, i) => `<li><i>${i + 1}</i><a href="${EXPL("address", x.address)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(x.address))}</a><span>${esc(num(x.calls))} ${T("calls")}${x.tips ? ` · ${esc(num(x.tips))} ${T("tips")}` : ""}</span><b data-no-i18n>${usd(x.usd, 2)}</b></li>`).join("")}</ol>` : "";
  }
  function nextTrip() {
    const n = new Date(); const t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 3, 20));
    if (t <= n) t.setUTCDate(t.getUTCDate() + 1);
    return t;
  }
  function paintDiary() {
    const box = $("a4-diary"), d = S.stats, nx = $("a4-next");
    if (!box || !d) return;
    if (nx) nx.textContent = d.canPay && !(d.paused && d.paused.hire) ? `${tr("Next shopping trip")}: ${nextTrip().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : tr(d.paused && d.paused.hire ? "Hiring is paused" : "Hiring starts when her key is set");
    const items = (d.items || []).filter((e) => e.kind === "spend" || e.kind === "look").slice(0, 6);
    const shop = S.shopping ? `<div class="a4-shopping"><span class="a4-spin"></span><b>${T("ARCIA is shopping…")}</b><div class="a4-scan">${["FINANCIAL_ANALYSIS", "WEB_SEARCH", "SOCIAL", "INFRA"].map((k, i) => `<i style="--i:${i}">${k}</i>`).join("")}</div></div>` : "";
    box.innerHTML = shop + (items.length ? `<ol class="a4-notes">${items.map((e, i) => `<li class="${e.kind}" style="--i:${i}"><img src="/images/arcia-avatar-96.jpg" alt="" width="30" height="30"><div><small data-no-i18n>${esc(new Date(e.t).toISOString().slice(0, 10))}${e.kind === "spend" ? ` · ${esc(e.provider || "")} · −${usd(e.amount, 2)}` : ""}</small><p${e.kind === "spend" ? " data-no-i18n" : ""}>${e.kind === "spend" ? esc(e.note || "") : T(e.note || "Looked for an agent to hire")}</p></div></li>`).join("")}</ol>`
      : `<p class="a4-muted">${T("Once a day ARCIA looks for x402 services on Arc she can afford, pays one from her own wallet, and writes down what she learned here.")}</p>`);
  }
  function shopping() {
    if (reduce) return;
    S.shopping = true; paintDiary();
    setTimeout(() => { S.shopping = false; paintDiary(); }, 2600);
  }

  // ---------------- for agents ----------------
  const SNIP = {
    curl: (o) => `# 1) ask — the answer is 402 with the terms
curl -i ${o}/arcia402/token-analysis?token=0xTOKEN

# 2) pay in USDC on Arc, then call again with the payment
curl ${o}/arcia402/token-analysis?token=0xTOKEN \\
  -H "X-PAYMENT: <base64 x402 payment>"

# free first look
curl ${o}/arcia402/token-analysis?token=0xTOKEN&preview=1`,
    js: (o) => `// any x402 client works (it signs an EIP-3009 authorization on Arc USDC)
import { wrapFetchWithPayment } from "x402-fetch";
const pay = wrapFetchWithPayment(fetch, walletOnArc);
const r = await pay("${o}/arcia402/arc-intelligence");
console.log(await r.json());

// or: send the USDC yourself, then
const xp = btoa(JSON.stringify({ x402Version: 1, scheme: "arc-tx",
  network: "eip155:5042", payload: { txHash } }));
await fetch(url, { headers: { "X-PAYMENT": xp } });`,
    py: (o) => `import base64, json, requests
url = "${o}/arcia402/wallet-analysis?wallet=0xWALLET"
terms = requests.get(url).json()["accepts"][0]   # 402: price, payTo
# ... send terms["maxAmountRequired"] USDC to terms["payTo"] on Arc → tx_hash
xp = base64.b64encode(json.dumps({"x402Version": 1, "scheme": "arc-tx",
  "network": "eip155:5042", "payload": {"txHash": tx_hash}}).encode()).decode()
print(requests.get(url, headers={"X-PAYMENT": xp}).json())`,
    mcp: (o) => `// MCP over HTTP (JSON-RPC 2.0, stateless)
POST ${o}/arcia402/mcp
{"jsonrpc":"2.0","id":1,"method":"tools/list"}

{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"arcia_token_analysis",
  "arguments":{"token":"0xTOKEN","preview":true}}}
// pass "payment": "<base64 X-PAYMENT>" for the full answer`,
  };
  function paintDev() {
    const box = $("a4-dev"), d = S.stats;
    if (!box || !d) return;
    const o = location.origin, tab = S.devTab;
    box.innerHTML = `<div class="a4-card-h"><h3>${T("For AI agents")}</h3><span class="a4-muted">${T("No API key, no account — pay per call")}</span></div>
      <p>${T("ARCIA is an x402 seller on Arc. Call an endpoint, get HTTP 402 with the terms, pay in USDC, call again with X-PAYMENT — the answer comes back as JSON.")}</p>
      <div class="a4-tabs" role="tablist">${[["curl", "curl"], ["js", "JavaScript"], ["py", "Python"], ["mcp", "MCP"]].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? "on" : ""}" data-a4-dev="${k}">${l}</button>`).join("")}</div>
      <div class="a4-codew"><pre class="a4-code" data-no-i18n>${esc(SNIP[tab](o))}</pre><button type="button" class="ams-mini a4-cp" data-a4-copy="${esc(SNIP[tab](o))}">${T("Copy")}</button></div>
      <ul class="a4-ways"><li><b>exact</b> — ${T("a signed EIP-3009 authorization (any standard x402 client); ARCIA settles it on Arc")}</li><li><b>arc-tx</b> — ${T("send the USDC yourself, then pass the transaction hash")}</li><li><b>${T("safe")}</b> — ${T("inputs are checked before you pay; if ARCIA can't finish, the same payment works once more")}</li></ul>
      <div class="a4-links"><a class="ams-mini" href="/arcia402" target="_blank" rel="noopener">${T("Storefront JSON")} ↗</a><a class="ams-mini" href="/.well-known/x402" target="_blank" rel="noopener">x402 manifest ↗</a><a class="ams-mini" href="/llms.txt" target="_blank" rel="noopener">llms.txt ↗</a><a class="ams-mini" href="/api/arcia402?stats=1" target="_blank" rel="noopener">${T("Books JSON")} ↗</a><a class="ams-mini" href="/api/arcia402?discover=1" target="_blank" rel="noopener">${T("Agents ARCIA can hire")} ↗</a></div>
      ${d.budget ? `<p class="a4-muted">${T("ARCIA's hiring budget")}: <span data-no-i18n>${usd(d.budget.perCall)} ${esc(tr("per call"))} · ${usd(d.budget.perDay)} ${esc(tr("per day"))}</span></p>` : ""}`;
  }
  function paintRoad() {
    const box = $("a4-road"), d = S.stats;
    if (!box) return;
    const w = !!(d && d.wallet), sell = w && !(d.paused && d.paused.sell), hire = !!(d && d.canPay) && !(d.paused && d.paused.hire);
    const steps = [[w ? "on" : "now", "ARCIA Wallet", "Her own wallet on Arc, public books"], [sell ? "on" : "now", "x402 Earn", "Eight paid services, USDC per call"], [hire ? "on" : "now", "x402 Hire", "Finds and pays other agents on Arc"],
      ["", "ARCIA Tools", "Scanner, Locker, Multisender, Snapshot, Bridge, ArcPad — by asking ARCIA"], ["", "ARCIA Market", "Other developers list their agents here"], ["", "ARCIA SDK · ElizaOS plugin", "ARCIA.scan(), .pay(), .hire() for any agent"], ["", "Agent Factory", "Create your own agent with its own Arc wallet"]];
    box.innerHTML = `<div class="a4-card-h"><h3>${T("Where ARCIA 402 is going")}</h3><small class="a4-muted">${T("Next steps: details not decided yet")}</small></div>
      <ol class="a4-tl">${steps.map(([st, t, s], i) => `<li class="${st}" style="--i:${i}"><i aria-hidden="true">${st === "on" ? "✓" : i + 1}</i><b>${T(t)}</b><small>${T(s)}</small>${st === "now" ? `<em>${T("Setting up")}</em>` : ""}</li>`).join("")}</ol>
      <p class="a4-tag">${T("Eliza gave agents a mind. ARCIA gives them an economy.")}</p>`;
  }

  // ---------------- a sale's receipt (#arcia402?sale=<tx>) ----------------
  async function openSale(tx) {
    const box = $("a4-sale");
    if (!box || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return;
    box.innerHTML = `<div class="ams-card a4-rcpt"><div class="a4-skel"><i></i><i></i></div></div>`;
    const r = await fetchJson(`/api/arcia402?sale=${tx}`, {}, 15000);
    if (!r.ok || !r.j) { box.innerHTML = `<div class="ams-card a4-rcpt"><p class="a4-muted">${T("That receipt isn't on ARCIA's books.")}</p></div>`; return; }
    const s = r.j, link = `${location.origin}/a402/${s.tx}`;
    box.innerHTML = `<div class="ams-card a4-rcpt">
      <img src="/images/arcia-avatar-96.jpg" alt="" width="64" height="64">
      <div class="a4-rcpt-b"><small>${T("Receipt")} · <span data-no-i18n>${esc(new Date(s.t).toISOString().slice(0, 16).replace("T", " "))} UTC</span></small>
        <b data-no-i18n>+${usd(s.amount, 2)} USDC</b><span>${T(s.title)}${s.headline ? ` · <span data-no-i18n>${esc(s.headline)}</span>` : ""}</span>
        ${s.arcia ? `<p class="a4-say" data-no-i18n>${esc(s.arcia)}</p>` : ""}
        <small data-no-i18n>${esc(tr("Paid by"))} ${esc(short(s.from))} · <a href="${EXPL("tx", s.tx)}" target="_blank" rel="noopener">tx ↗</a></small></div>
      <div class="a4-share"><a class="ams-mini" href="https://x.com/intent/post?text=${encodeURIComponent(`ARCIA just earned ${usd(s.amount, 2)} USDC for ${s.title} — an AI running her own economy on Circle's Arc 💚`)}&url=${encodeURIComponent(link)}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${T("Share on X")}</a><button type="button" class="ams-mini" data-a4-copy="${esc(link)}">${T("Copy link")}</button><button type="button" class="ams-mini" data-a4-close-sale>✕</button></div></div>`;
    if (!reduce) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function fromHash() {
    const h = location.hash;
    if (h.split("?")[0] !== "#arcia402") return;
    const p = new URLSearchParams(h.split("?")[1] || "");
    if (p.get("sale") && p.get("sale") !== S.sale) { S.sale = p.get("sale"); openSale(S.sale); }
    const svc = p.get("svc");
    if (svc) {
      const val = p.get("token") || p.get("wallet") || "";
      if (isAddr(val)) S.input[svc] = val;
      const go = () => {
        paintShop();
        const card = panel.querySelector(`.a4-svc[data-svc="${svc}"]`);
        if (!card) return;
        card.classList.add("hl"); setTimeout(() => card.classList.remove("hl"), 2600);
        card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        if (isAddr(val) && !S.previews[svc]) preview(svc);
      };
      if (S.stats) setTimeout(go, 50); else S.pending = go;
    }
  }

  // ---------------- preview, pay & run, tips ----------------
  async function preview(id) {
    const s = (S.stats && S.stats.services || []).find((x) => x.id === id);
    if (!s) return;
    const input = s.input ? String(S.input[id] || "").trim() : "";
    if (s.input && !isAddr(input)) { S.previews[id] = { error: tr(s.input === "wallet" ? "Enter a wallet address (0x…)." : "Enter a token address (0x…).") }; paintShop(); return; }
    S.previews[id] = { error: tr("Reading…") }; paintShop();
    const r = await fetchJson(`/api/arcia402?svc=${encodeURIComponent(id)}&preview=1${s.input ? `&${s.input}=${encodeURIComponent(input)}` : ""}`, {}, 30000);
    S.previews[id] = r.ok && r.j ? r.j : { error: (r.j && r.j.error) || tr("The service didn't answer — try again.") };
    paintShop();
  }
  async function payAndRun(id, again) {
    const s = (S.stats && S.stats.services || []).find((x) => x.id === id);
    if (!s || S.busy[id]) return;
    const input = s.input ? String(S.input[id] || "").trim() : "";
    if (s.input && !isAddr(input)) { S.results[id] = { error: tr(s.input === "wallet" ? "Enter a wallet address (0x…)." : "Enter a token address (0x…).") }; paintShop(); return; }
    const url = `/api/arcia402?svc=${encodeURIComponent(id)}${s.input ? `&${s.input}=${encodeURIComponent(input)}` : ""}`;
    const set = (step) => { S.busy[id] = true; S.step[id] = step; paintShop(); };
    S.previews[id] = null;
    let txHash = again && S.results[id] && S.results[id].tx || null;
    try {
      set("terms");
      if (!txHash) {
        const q = await fetchJson(url, {}, 25000);
        if (q.status !== 402 || !q.j || !q.j.accepts) { S.results[id] = { error: (q.j && q.j.error) || tr("The service didn't answer — try again.") }; return; }
        const terms = q.j.accepts[0];
        set("wallet");
        if (!state.account && typeof connectWallet === "function") await connectWallet();
        if (!state.account || !state.signer) { S.results[id] = { error: tr("Connect a wallet to pay.") }; return; }
        if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
        const c = new ethers.Contract(USDC, ["function transfer(address to, uint256 value) returns (bool)"], state.signer);
        const tx = await c.transfer(terms.payTo, BigInt(terms.maxAmountRequired));
        txHash = tx.hash; S.txs[id] = txHash;
        set("settle");
        await tx.wait();
      } else { S.txs[id] = txHash; set("settle"); }
      set("answer");
      const pay = btoa(JSON.stringify({ x402Version: 1, scheme: "arc-tx", network: "eip155:5042", payload: { txHash } }));
      let r = null;
      for (let i = 0; i < 6; i++) {
        r = await fetchJson(url, { headers: { "X-PAYMENT": pay } }, 60000);
        if (r.status === 402 && r.j && r.j.retry) { await sleep(2000); continue; }
        break;
      }
      if (r && r.ok && r.j) {
        S.results[id] = { result: r.j.result, paid: r.j.paid };
        fx("buy"); burst();
        if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti();
        load(true);
      } else S.results[id] = { error: (r && r.j && r.j.error) || tr("ARCIA couldn't finish."), credit: r && r.j && r.j.credit, tx: txHash, retry: !!(r && r.j && r.j.credit && !/used up/.test(r.j.credit)) };
    } catch (e) {
      const m = e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("You cancelled in your wallet.") : String(e && (e.shortMessage || e.message) || e).slice(0, 160);
      S.results[id] = { error: m, tx: txHash };
    } finally { S.busy[id] = false; S.step[id] = null; S.txs[id] = null; paintShop(); }
  }
  async function sendTip(v) {
    const d = S.stats;
    if (!d || !d.wallet || S.tipBusy) return;
    const set = (m) => { S.tipBusy = m; paintMe(); };
    try {
      set("Confirm in your wallet…");
      if (!state.account && typeof connectWallet === "function") await connectWallet();
      if (!state.account || !state.signer) { toast("Connect a wallet to tip."); return; }
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      const c = new ethers.Contract(USDC, ["function transfer(address to, uint256 value) returns (bool)"], state.signer);
      const tx = await c.transfer(d.wallet, BigInt(Math.round(v * 1e6)));
      set("Sending on Arc…");
      await tx.wait();
      let r = null;
      for (let i = 0; i < 6; i++) { r = await fetchJson(`/api/arcia402?tip=${tx.hash}`, { method: "POST" }, 20000); if (r.status === 409 && r.j && r.j.retry) { await sleep(2000); continue; } break; }
      if (r && r.ok) { toast("Thank you! ARCIA got your tip 💙"); fx("milestone"); load(true); }
      else toast((r && r.j && r.j.error) || "The tip was sent, but the books didn't update yet.");
    } catch (e) {
      toast(e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? "You cancelled in your wallet." : String(e && (e.shortMessage || e.message) || e).slice(0, 120));
    } finally { S.tipBusy = false; paintMe(); }
  }

  // ---------------- wiring ----------------
  panel.addEventListener("click", (e) => {
    const run = e.target.closest("[data-a4-run]");
    if (run) { payAndRun(run.dataset.a4Run); return; }
    const again = e.target.closest("[data-a4-retry]");
    if (again) { payAndRun(again.dataset.a4Retry, true); return; }
    const pv = e.target.closest("[data-a4-pv]");
    if (pv) { preview(pv.dataset.a4Pv); return; }
    const tp = e.target.closest("[data-a4-tip]");
    if (tp) { sendTip(Number(tp.dataset.a4Tip)); return; }
    const dv = e.target.closest("[data-a4-dev]");
    if (dv) { S.devTab = dv.dataset.a4Dev; paintDev(); return; }
    if (e.target.closest("[data-a4-close-sale]")) { $("a4-sale").innerHTML = ""; S.sale = null; if (history.replaceState) history.replaceState(null, "", location.pathname + location.search + "#arcia402"); return; }
    const cp = e.target.closest("[data-a4-copy]");
    if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.a4Copy).then(() => toast("Copied")).catch(() => {}); }
  });
  panel.addEventListener("input", (e) => { const i = e.target.closest("[data-a4-in]"); if (i) { S.input[i.dataset.a4In] = i.value; S.previews[i.dataset.a4In] = null; } });
  function show() {
    if (!S.booted) { S.booted = true; frame(); }
    loopStart();
    load(false).then(() => { if (S.pending) { const f = S.pending; S.pending = null; f(); } });
    fromHash();
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (panel.classList.contains("active") && !document.hidden) load(true); }, 15000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "arcia402") show(); else clearInterval(S.timer); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && panel.classList.contains("active")) { loopStart(); load(true); } });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); paint(); } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcArcia402 = { load, state: S };
})();
