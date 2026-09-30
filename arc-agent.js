/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider */
// arc-agent.js — ARCIA AGENT, an ARCIRCLE PAD utility (arcpad.html#agent).
// Paste an Arc token's address and ARCIA works on it:
//   · report     Token Scanner v3 read in full, ARCIA's own take, the numbers that matter (GET /api/desk?agent=0x…)
//   · the call   Safe / Caution / Risky for the next 24h, recorded with a hash and graded in public (?agent=record)
//   · vaults     per-token burn vaults (contracts/contracts/ArciaAgent.sol, ?agent=vaults&t=): anyone funds with USDC,
//                ARCIA decides when to buy, and everything bought goes to 0x…dEaD; the owner sets limits and can
//                pause, turn ARCIA off or withdraw at any time
//   · actions    every buy & burn ARCIA made for the token, with its transaction
// Nothing on this page can make ARCIA buy: only a vault's on-chain limits and the agent's rules (api/_agent.mjs) do.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-agent");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const txa = (h, label) => (h ? `<a class="ag-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${esc(label || short(h))} ↗</a>` : "");
  const addrA = (a) => (a ? `<a class="ag-tx" href="${EXPL("address", a)}" target="_blank" rel="noopener" data-no-i18n>${short(a)} ↗</a>` : "—");
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const big$ = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? "$" + (n / 1e3).toFixed(1) + "K" : usd(n, n < 10 ? 2 : 0));
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const pc = (n, d = 1) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m` : `${Math.floor(d / 86400)}d`; };
  const inT = (s) => { const d = Math.max(0, s - Date.now() / 1000); return d < 3600 ? `${Math.ceil(d / 60)}m` : `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`; };
  const API = "/api/desk";
  const USDC = lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000");
  const ARCIRCLE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const AV = "/images/arcia-avatar-96.jpg";
  const CALLS = { safe: ["Safe", "safe"], caution: ["Caution", "caution"], risky: ["Risky", "risky"] };
  const S = { t: null, rep: null, rec: null, vs: null, tab: "overview", busy: false, booted: false, timer: 0, seenActs: null, liq: null, ownOpen: new Set(), lastStatus: {} };

  // ---------------- a per-viewer watchlist (convenience only) ----------------
  const WK = "arcircle.agent.watch";
  const watch = () => { try { const l = JSON.parse(localStorage.getItem(WK) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
  const saveWatch = (l) => { try { localStorage.setItem(WK, JSON.stringify(l.slice(0, 12))); } catch { /* private window */ } };
  const watching = (t) => watch().some((w) => w.t === lc(t));
  const NK = "arcircle.agent.notify", SK = "arcircle.agent.seen";
  const notifyOn = () => { try { return localStorage.getItem(NK) === "1"; } catch { return false; } };

  // ---------------- skeleton ----------------
  function frame() {
    $("ag-body").innerHTML = `
      <div class="ag-summon" id="ag-summon">
        <div class="ag-sum-av"><img src="${AV}" alt="" width="56" height="56"><i></i></div>
        <form class="ag-form" id="ag-form" autocomplete="off">
          <input id="ag-in" type="text" inputmode="text" spellcheck="false" placeholder="${T("Paste an Arc token address (0x…)")}" aria-label="${T("Arc token address")}">
          <button type="submit" class="ag-go" id="ag-go"><span>${T("Wake ARCIA")}</span></button>
        </form>
        <div class="ag-chips" id="ag-chips"></div>
      </div>
      <div class="ag-think" id="ag-think" hidden></div>
      <div class="ag-res" id="ag-res"></div>
      <div class="ag-land" id="ag-land"></div>
      <div class="ams-card ag-board" id="ag-board"></div>
      <div class="ams-card ag-vboard" id="ag-vboard"></div>`;
    $("ag-form").addEventListener("submit", (e) => { e.preventDefault(); wake($("ag-in").value.trim()); });
    $("ag-in").addEventListener("paste", () => setTimeout(() => { const v = $("ag-in").value.trim(); if (isAddr(v)) wake(v); }, 0));
    if (!S.wired) { S.wired = true; panel.addEventListener("click", onClick); }
    chips();
    land();
    board();
    vboard();
  }
  // ---------------- the landing: how it works, what people read, the notification switch ----------------
  async function land() {
    const el = $("ag-land");
    if (!el) return;
    const step = (n, t, d) => `<div class="ag-step"><i data-no-i18n>${n}</i><b>${T(t)}</b><span>${T(d)}</span></div>`;
    el.innerHTML = `<div class="ag-steps">${step(1, "Read", "The whole token: contract, holders, pools, market.")}<em aria-hidden="true"></em>${step(2, "Call", "Safe, Caution or Risky for 24 hours — graded in public.")}<em aria-hidden="true"></em>${step(3, "Burn", "From a vault anyone funds: bought in dips, sent to 0x…dEaD.")}</div>
      <div class="ag-trend" id="ag-trend"></div>
      <label class="ag-notify"><input type="checkbox" id="ag-notify"${notifyOn() ? " checked" : ""}> <span>${T("Notify me about the tokens I follow")}</span></label>`;
    $("ag-notify").addEventListener("change", async (e) => {
      if (e.target.checked && "Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch { /* fine */ } }
      try { localStorage.setItem(NK, e.target.checked ? "1" : "0"); } catch { /* private window */ }
    });
    try {
      const r = await fetch("/api/social?scans=top");
      const j = r.ok ? await r.json() : null;
      const top = ((j && j.top) || []).slice(0, 8);
      if (top.length) $("ag-trend").innerHTML = `<small>${T("Read most this week")}</small>` + top.map((x) => `<button type="button" class="ag-chip" data-ag-t="${esc(x.token)}"><span data-no-i18n>${esc(x.symbol || short(x.token))}</span></button>`).join("");
    } catch { /* optional */ }
  }
  // ---------------- every vault, by what it has burned, and the latest burns ----------------
  async function vboard() {
    const el = $("ag-vboard");
    if (!el) return;
    let V = null;
    try { const r = await fetch(`${API}?agent=vaults`); V = r.ok ? await r.json() : null; } catch { V = null; }
    if (!V || !V.live || !V.vaults.length) { el.hidden = true; return; }
    el.hidden = false;
    const list = V.vaults.slice().sort((a, b) => b.spent - a.spent).slice(0, 10);
    el.innerHTML = `<div class="dk-h"><h3>${T("Burn vaults")}</h3><span class="dk-sub">${T("by what ARCIA has burned")}</span></div>
      <div class="ag-vlist">${list.map((v, i) => `<button type="button" class="ag-vrow" data-ag-t="${esc(v.token)}"><em data-no-i18n>${i + 1}</em><b data-no-i18n>${esc(v.sym || short(v.token))}</b><span data-no-i18n>${num(Number(v.burned) / 10 ** (v.dec || 18))}</span><small><span data-no-i18n>${usd(v.spent)}</span> · <span data-no-i18n>${v.buys}</span> ${T("buys")}</small><i class="ag-pill ${v.paused || !v.agentOn ? "off" : "on"}">${T(v.paused ? "Paused" : v.agentOn ? "ARCIA on" : "ARCIA off")}</i></button>`).join("")}</div>
      ${V.recent.length ? `<h4>${T("Latest burns")}</h4><div class="ag-acts">${V.recent.slice(0, 6).map((a) => `<div class="ag-act"><i class="ag-flame" aria-hidden="true"></i><div><b><span data-no-i18n>${num(Number(a.burned) / 10 ** (a.dec || 18))} ${esc(a.sym || "")}</span></b><small><span data-no-i18n>${usd(a.usd)}</span> · <span data-no-i18n>${ago(a.ts)}</span></small></div>${txa(a.tx, "tx")}</div>`).join("")}</div>` : ""}`;
  }
  function chips() {
    const l = watch();
    $("ag-chips").innerHTML = `<button type="button" class="ag-chip ag-chip-arc" data-ag-t="${ARCIRCLE}" data-no-i18n>$ARCIRCLE</button>` +
      l.map((w) => `<button type="button" class="ag-chip ${w.call ? "c-" + w.call : ""}" data-ag-t="${esc(w.t)}"><span data-no-i18n>${esc(w.sym || short(w.t))}</span>${w.call ? `<i>${T(CALLS[w.call] ? CALLS[w.call][0] : w.call)}</i>` : ""}</button>`).join("");
  }
  function onClick(e) {
    const t = e.target.closest("[data-ag-t]");
    if (t) { $("ag-in").value = t.dataset.agT; wake(t.dataset.agT); return; }
    const tab = e.target.closest("[data-ag-tab]");
    if (tab) { S.tab = tab.dataset.agTab; tabs(); return; }
    const f = e.target.closest("[data-ag-follow]");
    if (f) { follow(); return; }
    const sh = e.target.closest("[data-ag-share]");
    if (sh) { shareImage(sh.dataset.agShare, sh.dataset.v); return; }
    if (e.target.closest("[data-ag-ask]") && S.rep) {
      const r = S.rep, c = r.call || {};
      const q = `${tr("Explain ARCIA AGENT's read of")} $${r.sym || short(r.t)}: ${tr("scanner score")} ${r.facts.score ?? "—"}/100, ${tr("safety call")} ${c.pending ? tr("still reading the holders") : tr((CALLS[c.call] || [c.call])[0])} (${(c.why || []).join("; ")}).`;
      if (window.arcArcia && window.arcArcia.ask) window.arcArcia.ask(q); else location.hash = "#arcia";
      return;
    }
    const cp = e.target.closest("[data-ag-copy]");
    if (cp) { try { navigator.clipboard.writeText(cp.dataset.agCopy); cp.classList.add("done"); setTimeout(() => cp.classList.remove("done"), 1200); } catch { /* no clipboard */ } }
  }
  function follow() {
    if (!S.rep) return;
    let l = watch();
    if (watching(S.t)) l = l.filter((w) => w.t !== S.t);
    else l = [{ t: S.t, sym: S.rep.sym, call: S.rep.call && S.rep.call.call, at: Date.now() }, ...l];
    saveWatch(l); chips(); card();
  }

  // ---------------- wake: the thought stream while the report loads ----------------
  const THOUGHTS = ["Reading the contract", "Checking who holds it", "Reading its pools and liquidity", "Running Token Scanner v3", "Weighing the risks", "Making my call"];
  async function wake(t) {
    if (!S.booted) { show(); if (S.t === lc(String(t || "").trim())) return; }
    t = String(t || "").trim();
    if (!isAddr(t)) { think([], "Paste a token's contract address — 0x followed by 40 characters."); return; }
    if (S.busy) return;
    S.busy = true; S.t = lc(t); S.rep = null; S.vs = null; S.seenActs = null;
    try { history.replaceState(null, "", "#agent?t=" + S.t); } catch { /* fine */ }
    $("ag-res").innerHTML = ""; $("ag-summon").classList.add("waking");
    let i = 0;
    const tick = setInterval(() => { i = Math.min(THOUGHTS.length - 1, i + 1); think(THOUGHTS.slice(0, i + 1)); }, reduce ? 50 : 650);
    think(THOUGHTS.slice(0, 1));
    let rep = null, err = null;
    try {
      const [r1, r2] = await Promise.all([fetch(`${API}?agent=${S.t}`), fetch(`${API}?agent=vaults&t=${S.t}`).catch(() => null)]);
      rep = await r1.json().catch(() => null);
      S.vs = r2 && r2.ok ? await r2.json().catch(() => null) : null;
      if (!r1.ok || !rep || rep.error) err = (rep && rep.error) || "ARCIA couldn't read that token right now.";
    } catch { err = "ARCIA couldn't read that token right now."; }
    clearInterval(tick);
    S.busy = false; $("ag-summon").classList.remove("waking");
    if (err) { think([], err); return; }
    think(THOUGHTS, null, true);
    S.rep = rep;
    // a followed token keeps its latest call on the chip
    if (watching(S.t)) { saveWatch(watch().map((w) => (w.t === S.t ? { ...w, sym: rep.sym, call: rep.call && rep.call.call } : w))); chips(); }
    setTimeout(() => { $("ag-think").hidden = true; render(); afterRender(); }, reduce ? 0 : 350);
  }
  /// ARCIA's words come after the report (a separate request), and a call waiting for the holders is asked again
  async function afterRender() {
    const t = S.t, r = S.rep;
    if (!r) return;
    if (!r.take) {
      try { const x = await fetch(`${API}?agent=take&t=${t}`); const j = x.ok ? await x.json() : null; if (S.t === t && j && j.take) { S.rep.take = j.take; typeTake(j.take.text); } } catch { /* the rules line stays */ }
    }
    clearTimeout(S.retry);
    if (r.call && r.call.pending && (S.tries = (S.tries || 0) + 1) <= 12) {
      S.retry = setTimeout(async () => {
        if (S.t !== t) return;
        try { const x = await fetch(`${API}?agent=${t}&n=${S.tries}`); const j = x.ok ? await x.json() : null; if (j && !j.error && S.t === t) { const tk = S.rep.take; S.rep = j; if (!j.take) S.rep.take = tk; card(); if (S.tab === "overview") tabs(); afterRender(); } } catch { /* next time */ }
      }, 15000);
    } else if (!(r.call && r.call.pending)) S.tries = 0;
  }
  function think(lines, error = null, done = false) {
    const el = $("ag-think");
    el.hidden = false;
    el.innerHTML = error ? `<div class="ag-th bad">${T(error)}</div>` : lines.map((l, k) => `<div class="ag-th ${done || k < lines.length - 1 ? "ok" : "now"}"><i></i>${T(l)}…</div>`).join("");
  }

  // ---------------- the result ----------------
  function render() {
    $("ag-res").innerHTML = `
      <div class="ag-grid">
        <div class="ams-card ag-card" id="ag-card"></div>
        <div class="ams-card ag-main">
          <div class="ag-tabs" role="tablist">${[["overview", "Overview"], ["record", "Record"], ["vault", "Vault"], ["actions", "ARCIA's actions"]].map(([k, l]) => `<button type="button" role="tab" data-ag-tab="${k}" aria-selected="${S.tab === k}">${T(l)}</button>`).join("")}</div>
          <div id="ag-tab"></div>
        </div>
      </div>`;
    card(); tabs();
    if (!reduce) { const c = $("ag-card"); c.classList.add("ag-scan"); setTimeout(() => c.classList.remove("ag-scan"), 1500); }
  }
  function card() {
    const r = S.rep, c = r.call || {}, k = c.pending ? ["Reading", "pending"] : CALLS[c.call] || ["—", ""];
    const el = $("ag-card");
    const graded = c.graded;
    el.className = `ams-card ag-card k-${k[1]}`;
    el.innerHTML = `
      <div class="ag-c-top"><div class="ag-av k-${k[1]} mood-${k[1]}"><img src="${AV}" alt="" width="64" height="64"></div>
        <div class="ag-c-id"><b data-no-i18n>${esc(r.sym || short(r.t))}</b><small data-no-i18n>${esc(r.name || "")}</small>${addrA(r.t)}</div>
        <button type="button" class="ag-follow ${watching(r.t) ? "on" : ""}" data-ag-follow aria-pressed="${watching(r.t)}">${T(watching(r.t) ? "Following" : "Follow")}</button></div>
      <div class="ag-call"><span class="ag-stamp k-${k[1]}">${c.pending ? `<i class="ag-spin" aria-hidden="true"></i>` : ""}${T(k[0])}</span><div><small>${T(c.pending ? "The call waits for the holders" : "ARCIA's 24-hour safety call")}</small><ul>${(c.why || []).map((w) => `<li>${T(w)}</li>`).join("")}</ul></div></div>
      <p class="ag-take" id="ag-take" data-no-i18n></p>
      <div class="ag-c-meta">
        ${c.pending ? `<span>${T("Reading the balance sheet — the call comes as soon as the holders are known.")}</span>` : `<span>${T("Called by ARCIA")} <b data-no-i18n>${ago(c.at)}</b></span>`}
        ${c.pending ? "" : `<span>`}${c.pending ? "" : graded ? `${T("Graded result")}: <b class="${graded.right === true ? "up" : graded.right === false ? "dn" : ""}">${T(graded.right === true ? "called right" : graded.right === false ? "called wrong" : "not graded")}</b>` : `${T("Graded in")} <b data-no-i18n>${inT(c.until)}</b>`}${c.pending ? "" : `</span>`}
        ${c.hash ? `<button type="button" class="ag-hash" data-ag-copy="${esc(c.hash)}" title="${T("The call's hash, recorded before the outcome")}"><span data-no-i18n>#${esc(c.hash.slice(2, 10))}</span></button>` : ""}
      </div>
      <div class="ag-c-acts"><button type="button" class="ag-btn sm" data-ag-share="call">${T("Save image")}</button><button type="button" class="ag-btn sm" data-ag-ask>${T("Ask ARCIA about it")}</button></div>
      <p class="ag-small">${T("A call is about risk over the next 24 hours, never about price direction — not a signal to buy or sell.")}</p>`;
    typeTake((r.take && r.take.text) || "");
  }
  function typeTake(text) {
    const el = $("ag-take");
    if (!el) return;
    if (reduce || !text) { el.textContent = text; return; }
    let i = 0;
    el.classList.add("typing");
    const step = () => { i = Math.min(text.length, i + 3); el.textContent = text.slice(0, i); if (i < text.length && document.body.contains(el)) setTimeout(step, 16); else el.classList.remove("typing"); };
    step();
  }
  function tabs() {
    panel.querySelectorAll("[data-ag-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.agTab === S.tab)));
    const el = $("ag-tab");
    if (!el) return;
    el.classList.remove("ag-in"); void el.offsetWidth; if (!reduce) el.classList.add("ag-in");
    if (S.tab === "overview") overview(el);
    else if (S.tab === "record") record(el);
    else if (S.tab === "vault") vaults(el);
    else actions(el);
  }
  function overview(el) {
    const r = S.rep, f = r.facts || {};
    const sc = f.score == null ? null : Math.max(0, Math.min(100, f.score));
    const C = 2 * Math.PI * 34;
    const col = sc == null ? "#8c98a6" : sc >= 75 ? "#39ff88" : sc >= 50 ? "#ffc861" : "#ff6e5a";
    const tile = (label, v, sub = "") => `<div class="ag-f"><small>${T(label)}</small><b data-no-i18n>${v}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    el.innerHTML = `
      <div class="ag-ov">
        <div class="ag-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="ag-r-bg" cx="40" cy="40" r="34"/><circle class="ag-r-fg" cx="40" cy="40" r="34" style="stroke:${col};--c:${C.toFixed(1)};--o:${sc == null ? C : (C * (1 - sc / 100)).toFixed(1)}"/></svg>
          <div><b data-no-i18n>${sc == null ? "—" : sc}</b><small>${T("scanner score")}</small></div></div>
        <div class="ag-facts">
          ${tile("Liquidity", big$(f.liq))}${tile("Market cap", big$(f.mcap))}${tile("Holders", f.holders == null ? "—" : num(f.holders))}${tile("Top 10 hold", f.top10 == null ? "—" : Math.round(f.top10) + "%", f.linked ? `${T("linked wallets")} <em data-no-i18n>${Math.round(f.linked)}%</em>` : "")}
        </div>
      </div>
      ${f.critical && f.critical.length ? `<div class="ag-crit"><b>${T("Critical")}</b>${f.critical.map((c) => `<span>${T(c)}</span>`).join("")}</div>` : ""}
      ${(r.checks || []).length ? `<h4>${T("What ARCIA would watch")}</h4><ul class="ag-issues">${r.checks.map((c) => `<li class="s-${esc(c.status)}"><b>${T(c.title)}</b>${c.detail ? `<small>${T(c.detail)}</small>` : ""}</li>`).join("")}</ul>` : `<p class="ag-small">${T("No warnings from the scanner.")}</p>`}
      <p class="ag-small"><a href="/arc#scanner?t=${esc(r.t)}" data-arc-tab="scanner">${T("Open the full Token Scanner report")} →</a> · ${T("read by ARCIA")} <span data-no-i18n>${ago(r.at)}</span></p>`;
    if (!reduce) requestAnimationFrame(() => el.querySelector(".ag-r-fg").classList.add("on"));
    else el.querySelector(".ag-r-fg").classList.add("on");
    // the number counts up with the ring
    const b = el.querySelector(".ag-ring b");
    if (b && sc != null && !reduce) { const t0 = performance.now(); const go = (t) => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(sc * e); if (k < 1) requestAnimationFrame(go); }; requestAnimationFrame(go); }
  }

  // ---------------- the public record ----------------
  async function loadRecord() {
    try { const r = await fetch(`${API}?agent=record`); S.rec = r.ok ? await r.json() : null; } catch { S.rec = null; }
  }
  function statLine(st) {
    const p = (x) => (x.n ? Math.round((x.right / x.n) * 100) + "%" : "—");
    return `<div class="ag-stats"><div><small>${T("Safe calls right")}</small><b data-no-i18n>${p(st.safe)}</b><span data-no-i18n>${st.safe.right}/${st.safe.n}</span></div>
      <div><small>${T("Risky calls right")}</small><b data-no-i18n>${p(st.risky)}</b><span data-no-i18n>${st.risky.right}/${st.risky.n}</span></div>
      <div><small>${T("Calls made")}</small><b data-no-i18n>${st.total}</b><span><span data-no-i18n>${st.open}</span> ${T("still open")}</span></div></div>`;
  }
  function callRow(c) {
    const k = CALLS[c.call] || ["—", ""], g = c.graded;
    const res = !g ? `<em class="ag-wait">${T("still open")} · <span data-no-i18n>${inT(c.until)}</span></em>` : g.void ? `<em>${T("no market to grade")}</em>` : g.right == null ? `<em>${T("not graded")}</em>`
      : `<em class="${g.right ? "up" : "dn"}">${T(g.right ? "called right" : "called wrong")} <span data-no-i18n>${pc(g.dPx, 0)}</span></em>`;
    return `<button type="button" class="ag-callrow ${g ? "flip" : ""}" data-ag-t="${esc(c.t)}"><span class="ag-stamp sm k-${k[1]}">${T(k[0])}</span><b data-no-i18n>${esc(c.sym || short(c.t))}</b><small data-no-i18n>${ago(c.at)}</small>${res}</button>`;
  }
  async function record(el) {
    el.innerHTML = `<div class="ag-skel"><i></i><i></i></div>`;
    await loadRecord();
    if (S.tab !== "record") return;
    const R = S.rec;
    if (!R) { el.innerHTML = `<div class="ag-empty">${T("The record isn't reachable right now.")}</div>`; return; }
    const mine = R.calls.filter((c) => c.t === S.t);
    el.innerHTML = statLine(R.stats) + series(R.series) + buckets(R.buckets) +
      (mine.length ? `<h4>${T("This token")}</h4><div class="ag-calls">${mine.map(callRow).join("")}</div>` : "") +
      `<h4>${T("Latest calls")}</h4><div class="ag-calls">${R.calls.slice(0, 20).map(callRow).join("") || `<div class="ag-empty">${T("No calls yet.")}</div>`}</div>
      <p class="ag-small">${T("Safe is right if the token didn't go bad in 24 hours; Risky is right if it did. \"Bad\" = the price fell 60% or more, or the liquidity 50% or more. Each call's hash is recorded before the outcome.")}</p>` + anchors(R.anchors);
    el.querySelectorAll("[data-ag-verify]").forEach((b) => b.addEventListener("click", () => verifyAnchor(b)));
  }
  /// the hit rate over time (Safe + Risky), as graded
  function series(pts) {
    if (!pts || pts.length < 2) return "";
    const W = 300, H = 60, xs = pts.map((p) => p[0]), x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
    const X = (x) => 4 + ((x - x0) / Math.max(1, x1 - x0)) * (W - 8), Y = (y) => H - 4 - (y / 100) * (H - 8);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    return `<div class="ag-series"><small>${T("Hit rate over time")}</small><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${Y(50)}" y2="${Y(50)}"/><path d="${d}"/></svg><b data-no-i18n>${pts[pts.length - 1][1]}%</b></div>`;
  }
  /// how often tokens went bad, by the scanner score when ARCIA called them
  function buckets(B) {
    if (!B || !B.some((x) => x.n)) return "";
    return `<h4>${T("Went bad within 24 hours, by scanner score")}</h4><div class="ag-bk">${B.map((x) => { const p = x.n ? (x.bad / x.n) * 100 : 0; return `<div><span data-no-i18n>${esc(x.label)}</span><i><b style="width:${p.toFixed(1)}%"></b></i><em data-no-i18n>${x.n ? Math.round(p) + "%" : "—"}</em><small data-no-i18n>${x.bad}/${x.n}</small></div>`; }).join("")}</div>`;
  }
  /// each day's calls, rolled into one hash and written on Arc by ARCIA's key — checked here, in the browser
  function anchors(A) {
    const rows = (A || []).filter((a) => a.tx);
    if (!rows.length) return `<p class="ag-small">${T("Once a day, ARCIA writes the day's call hashes on Arc as one root, so anyone can check the calls came before their outcomes. The first one is written the day after the first calls.")}</p>`;
    return `<h4>${T("Written on Arc")}</h4><div class="ag-anc">${rows.slice(0, 7).map((a) => `<div class="ag-anc-r"><b data-no-i18n>${esc(a.date)}</b><span><span data-no-i18n>${a.n}</span> ${T("calls")}</span>${txa(a.tx, "tx")}<button type="button" class="ag-btn sm" data-ag-verify="${esc(a.day)}">${T("Check")}</button><em class="ag-anc-m" data-no-i18n></em></div>`).join("")}</div>`;
  }
  async function verifyAnchor(b) {
    const day = Number(b.dataset.agVerify), a = (S.rec.anchors || []).find((x) => x.day === day), out = b.parentElement.querySelector(".ag-anc-m");
    out.textContent = "…";
    try {
      const r = await fetch(`${API}?agent=record&day=${day}`); const j = r.ok ? await r.json() : null;
      const hashes = ((j && j.dayCalls) || []).map((c) => c.hash);
      const root = ethers.keccak256("0x" + hashes.map((h) => h.replace(/^0x/, "")).join(""));
      const tx = await readProvider().getTransaction(a.tx);
      const want = "0x" + Array.from(new TextEncoder().encode(`ARCIA AGENT calls ${a.date}:`), (x) => x.toString(16).padStart(2, "0")).join("") + root.slice(2);
      const good = tx && lc(tx.data) === lc(want) && root === a.root;
      out.className = "ag-anc-m " + (good ? "up" : "dn");
      out.textContent = good ? `✓ ${tr("matches")} · ${hashes.length} ${tr("calls")}` : `✗ ${tr("doesn't match")}`;
    } catch { out.textContent = tr("couldn't check right now"); }
  }
  async function board() {
    await loadRecord();
    const el = $("ag-board");
    if (!el) return;
    if (!S.rec || !S.rec.stats.total) { el.innerHTML = `<div class="dk-h"><h3>${T("ARCIA's record")}</h3></div><div class="ag-empty">${T("ARCIA's calls start with the first token someone pastes here.")}</div>`; return; }
    el.innerHTML = `<div class="dk-h"><h3>${T("ARCIA's record")}</h3><span class="dk-sub">${T("every safety call, graded in public")}</span></div>${statLine(S.rec.stats)}<div class="ag-calls">${S.rec.calls.slice(0, 8).map(callRow).join("")}</div>`;
  }

  // ---------------- vaults ----------------
  const FACT_ABI = ["function createVault((address,address,uint24,int24,address),uint256,uint256,uint256) returns (address)", "function createBurn() view returns (uint256)"];
  const VAULT_ABI = ["function fund(uint256)", "function setPaused(bool)", "function setAgentOn(bool)", "function setLimits(uint256,uint256,uint256)", "function applyLimits()", "function withdraw(address,uint256)"];
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => (e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("Cancelled in your wallet.") : String((e && (e.shortMessage || e.reason || e.message)) || tr("The transaction didn't go through.")).slice(0, 180));
  const parse6 = (v) => { try { const a = ethers.parseUnits(String(v || "").trim() || "0", 6); return a > 0n ? a : null; } catch { return null; } };
  async function loadVaults() { try { const r = await fetch(`${API}?agent=vaults&t=${S.t}`, { cache: "no-store" }); S.vs = r.ok ? await r.json() : S.vs; } catch { /* keep */ } }
  function tank(v) {
    const full = Math.max(v.dailyCap * 2, v.usdc, 1), f = Math.min(1, v.usdc / full);
    return `<div class="ag-tank" style="--f:${(f * 100).toFixed(1)}%"><i></i><b data-no-i18n>${usd(v.usdc)}</b><small>${T("USDC ready")}</small></div>`;
  }
  const MODE_TXT = { dip: ["Dips only", "never after a pump"], steady: ["Steady", "one buy each interval"], volume: ["By volume", "each buy ≤ 2% of hourly volume"] };
  function vaultCard(v) {
    const dec = v.dec || (S.rep && S.rep.dec) || 18;
    const burned = Number(v.burned) / 10 ** dec;
    const mine = me() === v.owner;
    const st = v.status;
    const pend = v.pending;
    const due = pend && Date.now() / 1000 >= pend.readyAt;
    const next = v.lastBuyAt ? v.lastBuyAt + v.cooldown : 0;
    // a scan line when ARCIA looked again since the last paint
    const seen = S.lastStatus[v.vault], looked = st && seen != null && st.at !== seen && !reduce;
    S.lastStatus[v.vault] = st ? st.at : null;
    const m = MODE_TXT[v.mode] || MODE_TXT.dip;
    return `<div class="ag-v${looked ? " ag-looked" : ""}" data-v="${esc(v.vault)}">
      <div class="ag-v-h"><b>${T("Vault")} ${addrA(v.vault)}</b><span class="ag-pill ${v.paused ? "off" : v.agentOn ? "on" : "off"}">${T(v.paused ? "Paused" : v.agentOn ? "ARCIA on" : "ARCIA off")}</span><small>${T("owner")} ${addrA(v.owner)}${mine ? ` <em>${T("you")}</em>` : ""}</small></div>
      <div class="ag-v-body">${tank(v)}
        <div class="ag-v-st"><div><small>${T("Burned so far")}</small><b data-no-i18n>${num(burned)}</b><span data-no-i18n>${esc(v.sym || (S.rep && S.rep.sym) || "")}</span></div>
          <div><small>${T("Spent")}</small><b data-no-i18n>${usd(v.spent)}</b><span><span data-no-i18n>${v.buys}</span> ${T("buys")}</span></div>
          <div><small>${T("Vault limits")}</small><b data-no-i18n>${usd(v.maxBuy, 0)} / ${usd(v.dailyCap, 0)}</b><span>${T("per buy / per day")} · ${T("one buy every")} <span data-no-i18n>${Math.round(v.cooldown / 60)}m</span></span></div></div></div>
      <div class="ag-v-meta"><span class="ag-mode">${T("Strategy")}: <b>${T(m[0])}</b> <small>${T(m[1])}</small></span>${next > Date.now() / 1000 ? `<span>${T("Next buy possible in")} <b data-no-i18n data-ag-cd="${next}">${inT(next)}</b></span>` : `<span>${T("Can buy now")}</span>`}</div>
      ${st ? `<div class="ag-v-why"><img src="${AV}" alt="" width="20" height="20"><span>${T(st.why)}</span><em>${T("checked")} <span data-no-i18n>${ago(st.at)}</span></em></div>` : ""}
      ${pend ? `<div class="ag-v-pend">${T("Looser limits queued")}: <b data-no-i18n>${usd(pend.maxBuy, 0)} / ${usd(pend.dailyCap, 0)} · ${Math.round(pend.cooldown / 60)}m</b> — ${due ? `<button type="button" class="ag-btn sm" data-vact="apply">${T("Apply now")}</button>` : `${T("from")} <span data-no-i18n>${inT(pend.readyAt)}</span>`}</div>` : ""}
      <div class="ag-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="USDC" data-vin="fund" aria-label="${T("USDC to add")}"><button type="button" class="ag-btn go" data-vact="fund">${T("Fund vault")}</button>${v.buys ? `<button type="button" class="ag-btn" data-ag-share="vault" data-v="${esc(v.vault)}">${T("Save image")}</button>` : ""}</div>
      ${mine ? `<details class="ag-own"${S.ownOpen.has(v.vault) ? " open" : ""}><summary>${T("Owner controls")}</summary>
        <div class="ag-row"><button type="button" class="ag-btn" data-vact="pause">${T(v.paused ? "Resume" : "Pause")}</button><button type="button" class="ag-btn" data-vact="agent">${T(v.agentOn ? "Turn ARCIA off" : "Turn ARCIA on")}</button></div>
        <div class="ag-row ag-modes">${Object.keys(MODE_TXT).map((k) => `<button type="button" class="ag-btn${v.mode === k || (!v.mode && k === "dip") ? " on" : ""}" data-vact="mode" data-mode="${k}">${T(MODE_TXT[k][0])}</button>`).join("")}</div>
        <p class="ag-small">${T("Strategy is signed by your wallet (no gas).")}</p>
        <div class="ag-row"><input type="number" min="0" step="any" placeholder="${T("per buy")}" data-vin="lb"><input type="number" min="0" step="any" placeholder="${T("per day")}" data-vin="ld"><input type="number" min="1" step="1" placeholder="${T("minutes")}" data-vin="lc"><button type="button" class="ag-btn" data-vact="limits">${T("Set limits")}</button></div>
        <p class="ag-small">${T("Tighter limits apply at once; looser ones wait an hour.")}</p>
        <div class="ag-row"><input type="number" min="0" step="any" placeholder="USDC" data-vin="wd"><button type="button" class="ag-btn" data-vact="max">${T("Max")}</button><button type="button" class="ag-btn out" data-vact="withdraw">${T("Withdraw")}</button></div>
        <p class="ag-small">${T("Always to your own wallet, at any time, paused or not.")}</p></details>` : ""}
      ${msgOf(v.vault)}</div>`;
  }
  // the last message stays through the refresh that follows an action
  const msgOf = (k) => { const m = S.vmsg && S.vmsg.v === k ? S.vmsg : null; return `<p class="ag-msg ${m ? m.cls : ""}" aria-live="polite">${m ? m.h : ""}</p>`; };
  function vaults(el) {
    const V = S.vs;
    if (!V || !V.live) {
      el.innerHTML = `<div class="ag-empty ag-soon"><b>${T("Burn vaults are coming")}</b><span>${T("They open once the ARCIA AGENT contracts are deployed on Arc — the date isn't decided yet. Everything else here works now.")}</span></div>` + vaultHow();
      return;
    }
    const h = V.health || {};
    const hb = !h.key || !h.match ? `<div class="ag-health bad"><i></i><span>${T("ARCIA's key isn't connected on the server yet — vaults wait until it is.")}${h.key ? ` <small>${!h.valid ? T("The server's ARCIA_AGENT_KEY isn't a valid private key (64 hex characters, no quotes or spaces).") : `${T("The server's key belongs to")} <b data-no-i18n>${esc(h.keyAddr)}</b>, ${T("not ARCIA's operator")} <b data-no-i18n>${short(V.operator)}</b>.`}</small>` : ""}</span></div>`
      : h.low ? `<div class="ag-health warn"><i></i><span>${T("ARCIA is connected, but her wallet is low on gas")} <b data-no-i18n>(${h.gas} USDC)</b></span></div>`
      : `<div class="ag-health ok"><i></i><span>${T("ARCIA is connected")}</span><small data-no-i18n>${short(V.operator)} · ${h.gas} USDC gas</small></div>`;
    el.innerHTML = hb + (V.paused ? `<div class="ag-crit"><b>${T("Paused by the team")}</b><span>${T("Every vault waits; owners can still withdraw.")}</span></div>` : "") +
      (V.vaults.length ? V.vaults.map(vaultCard).join("") : `<div class="ag-empty">${T("No vault for this token yet.")}</div>`) +
      `<div class="ag-open" id="ag-open">${openForm()}</div>` + vaultHow();
    wireVaults(el);
  }
  const vaultHow = () => `<ol class="ag-how"><li>${T("Anyone funds the vault with USDC.")}</li><li>${T("ARCIA watches the price and buys in dips — never after a pump, never more than a 3% price move.")}</li><li>${T("Everything she buys goes straight to 0x…dEaD. The vault can't sell.")}</li></ol>`;
  function openForm() {
    const fee = S.vs && S.vs.createBurn && S.vs.createBurn !== "0" ? Number(ethers.formatEther(S.vs.createBurn)) : 0;
    return `<details${S.vs && S.vs.vaults.length ? "" : " open"}><summary>${T("Open a burn vault for this token")}</summary>
      <div class="ag-pools" id="ag-pools"><button type="button" class="ag-btn" data-vact="pools">${T("Find its USDC pool")}</button></div>
      <div class="ag-row"><label>${T("per buy")}<input type="number" min="0" step="any" value="5" data-oin="b"></label><label>${T("per day")}<input type="number" min="0" step="any" value="25" data-oin="d"></label><label>${T("every (minutes)")}<input type="number" min="1" step="1" value="10" data-oin="c"></label></div>
      ${fee ? `<p class="ag-small">${T("Opening a vault burns")} <b data-no-i18n>${num(fee)} $ARCIRCLE</b>.</p>` : ""}
      <button type="button" class="ag-btn go" data-vact="create" disabled>${T("Open vault")}</button>${msgOf("open")}</details>`;
  }
  function wireVaults(el) {
    el.querySelectorAll("[data-vact]").forEach((b) => b.addEventListener("click", () => vaultAct(b)));
    // the tank fills with a splash right after someone funds it
    if (S.splash) { const t = el.querySelector(`.ag-v[data-v="${S.splash}"] .ag-tank`); if (t && !reduce) t.classList.add("ag-splash"); S.splash = null; }
    // the owner's controls stay open across refreshes
    el.querySelectorAll(".ag-own").forEach((d) => d.addEventListener("toggle", () => { const v = d.closest(".ag-v").dataset.v; if (d.open) S.ownOpen.add(v); else S.ownOpen.delete(v); }));
  }
  async function findPools(box) {
    box.innerHTML = `<div class="ag-skel"><i></i></div>`;
    let j = null;
    for (let i = 0; i < 8; i++) {
      try { const r = await fetch(`/api/social?liq=${S.t}`, { cache: "no-store" }); j = r.ok ? await r.json() : null; } catch { j = null; }
      if (j && j.done) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    const usdcA = lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || USDC);
    const pools = ((j && j.pools) || []).filter((p) => p.key && [p.key.currency0, p.key.currency1].map(lc).includes(usdcA));
    S.liq = pools;
    if (!pools.length) { box.innerHTML = `<div class="ag-empty">${T("No Uniswap v4 pool against USDC found for this token.")}</div>`; return; }
    box.innerHTML = pools.map((p, i) => `<label class="ag-pool"><input type="radio" name="ag-pool" value="${i}"${i === 0 ? " checked" : ""}><b>${T(p.venue || "Uniswap v4")}</b><span data-no-i18n>${p.feePct != null ? p.feePct + "%" : ""}${p.dex && p.dex.liqUsd ? " · " + big$(p.dex.liqUsd) : ""}</span><small data-no-i18n>${short(p.id)}</small></label>`).join("");
    const c = panel.querySelector('[data-vact="create"]'); if (c) c.disabled = false;
  }
  async function vaultAct(b) {
    const k = b.dataset.vact, card = b.closest(".ag-v"), open = b.closest(".ag-open");
    const msgEl = (card || open || b.parentElement).querySelector(".ag-msg");
    const msg = (h, cls = "") => { S.vmsg = { v: card ? card.dataset.v : "open", h, cls }; if (msgEl) { msgEl.className = "ag-msg " + cls; msgEl.innerHTML = h; } };
    if (k === "pools") { findPools($("ag-pools")); return; }
    const v = card ? card.dataset.v : null;
    const val = (n) => { const i = (card || open).querySelector(`[data-vin="${n}"],[data-oin="${n}"]`); return i ? i.value : ""; };
    if (k === "max") { const x = S.vs.vaults.find((y) => y.vault === v); if (x) card.querySelector('[data-vin="wd"]').value = x.usdc; return; }
    if (S.acting) { msg(T("Wait for the last transaction to finish."), "bad"); return; }
    S.acting = true;
    panel.querySelectorAll(".ag-v .ag-btn, .ag-open .ag-btn").forEach((x) => { x.disabled = true; });
    try {
      const sg = await signer();
      if (k === "mode") {
        const mode = b.dataset.mode, issued = new Date().toISOString();
        msg(T("Sign in your wallet…"));
        const signature = await sg.signMessage(`ARCIRCLE PAD — ARCIA AGENT vault strategy\nVault: ${lc(v)}\nStrategy: ${mode}\nIssued: ${issued}`);
        const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "agent-mode", vault: v, mode, issued, signature }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { msg(esc(j.error || T("Couldn't save — try again.")), "bad"); return; }
        const x = S.vs.vaults.find((y) => y.vault === v); if (x) x.mode = mode;
        msg(T("Strategy saved. ARCIA uses it from her next check."), "ok");
        if (S.tab === "vault") tabs();
        return;
      }
      if (k === "create") {
        const p = S.liq && S.liq[Number((panel.querySelector('input[name="ag-pool"]:checked') || {}).value || 0)];
        const mb = parse6(val("b")), md = parse6(val("d")), cd = Math.round(Number(val("c")) * 60);
        if (!p || !mb || !md || !(cd >= 60)) { msg(T("Pick a pool and set the limits (at least 1 minute between buys)."), "bad"); return; }
        if (md < mb) { msg(T("The day's limit can't be below one buy."), "bad"); return; }
        const f = new ethers.Contract(S.vs.factory, FACT_ABI, sg);
        const fee = BigInt(S.vs.createBurn || "0");
        if (fee > 0n) {
          const a = new ethers.Contract(ARCIRCLE, ERC20, sg);
          if ((await a.allowance(state.account, S.vs.factory)) < fee) { msg(T("Approve the $ARCIRCLE to burn in your wallet…")); await (await a.approve(S.vs.factory, fee)).wait(); }
        }
        msg(T("Confirm in your wallet…"));
        const key = [p.key.currency0, p.key.currency1, p.key.fee, p.key.tickSpacing, p.key.hooks];
        const tx = await f.createVault(key, mb, md, cd);
        msg(`${T("Opening…")} ${txa(tx.hash)}`);
        await tx.wait();
        msg(`${T("Vault open. Fund it and ARCIA starts watching.")} ${txa(tx.hash)}`, "ok");
        vboard();
      } else if (k === "fund") {
        const amt = parse6(val("fund"));
        if (!amt) { msg(T("Enter an amount of USDC."), "bad"); return; }
        const u = new ethers.Contract((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || USDC, ERC20, sg);
        if ((await u.balanceOf(state.account)) < amt) { msg(T("This wallet doesn't hold that much USDC."), "bad"); return; }
        if ((await u.allowance(state.account, v)) < amt) { msg(T("Approve the USDC in your wallet…")); await (await u.approve(v, amt)).wait(); }
        msg(T("Confirm in your wallet…"));
        const tx = await new ethers.Contract(v, VAULT_ABI, sg).fund(amt);
        await tx.wait();
        msg(`${T("Added.")} ${txa(tx.hash)}`, "ok");
        S.splash = v;
      } else {
        const c = new ethers.Contract(v, VAULT_ABI, sg), x = S.vs.vaults.find((y) => y.vault === v);
        let tx;
        msg(T("Confirm in your wallet…"));
        if (k === "pause") tx = await c.setPaused(!x.paused);
        else if (k === "agent") tx = await c.setAgentOn(!x.agentOn);
        else if (k === "apply") tx = await c.applyLimits();
        else if (k === "limits") {
          const mb = parse6(val("lb")), md = parse6(val("ld")), cd = Math.round(Number(val("lc")) * 60);
          if (!mb || !md || !(cd >= 60) || md < mb) { msg(T("Per buy, per day (not below one buy) and at least 1 minute between buys."), "bad"); return; }
          tx = await c.setLimits(mb, md, cd);
        } else if (k === "withdraw") {
          const amt = parse6(val("wd"));
          if (!amt) { msg(T("Enter an amount of USDC."), "bad"); return; }
          tx = await c.withdraw((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || USDC, amt);
        }
        if (tx) { await tx.wait(); msg(`${T("Done.")} ${txa(tx.hash)}`, "ok"); }
      }
      await loadVaults();
      if (S.tab === "vault") tabs(); // the message survives the refresh (msgOf)
    } catch (e) { msg(esc(errText(e)), "bad"); }
    finally {
      S.acting = false;
      // whatever is on the page now (a refresh may have replaced the buttons)
      panel.querySelectorAll(".ag-v .ag-btn, .ag-open .ag-btn").forEach((x) => { x.disabled = x.dataset.vact === "create" && !(S.liq && S.liq.length); });
    }
  }

  // ---------------- actions ----------------
  function actions(el) {
    const acts = (S.vs && S.vs.recent) || [];
    const dec = (S.rep && S.rep.dec) || 18;
    const seen = S.seenActs; S.seenActs = new Set(acts.map((a) => a.tx));
    if (!acts.length) { el.innerHTML = `<div class="ag-empty">${T(S.vs && S.vs.live ? "No buy & burn yet for this token. Once a vault is funded, ARCIA's buys show here with their transactions." : "ARCIA's buys & burns show here once vaults are open.")}</div>`; return; }
    const fresh = seen ? acts.filter((a) => !seen.has(a.tx)) : [];
    el.innerHTML = `<div class="ag-acts">${acts.map((a) => `<div class="ag-act${seen && !seen.has(a.tx) && !reduce ? " fresh" : ""}"><i class="ag-flame" aria-hidden="true"></i><div><b>${T("Bought and burned")} <span data-no-i18n>${num(Number(a.burned) / 10 ** dec)} ${esc((S.rep && S.rep.sym) || "")}</span></b><small><span data-no-i18n>${usd(a.usd)}</span> · ${T(String(a.why || "").split(" · ")[0])} · <span data-no-i18n>${ago(a.ts)}</span></small></div>${txa(a.tx, "tx")}</div>`).join("")}</div>`;
    // the token's very first burn gets a little celebration
    if (fresh.length && acts.length === fresh.length && !reduce) confetti(el);
  }
  function confetti(host) {
    const box = document.createElement("div");
    box.className = "ag-confetti"; box.setAttribute("aria-hidden", "true");
    const cols = ["#39ff88", "#5b8cff", "#35d8d0", "#ffc861", "#ff9b5a"];
    for (let i = 0; i < 36; i++) { const b = document.createElement("i"); b.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.25}s`; box.appendChild(b); }
    host.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  }

  // ---------------- share images (drawn here, saved or shared as a PNG) ----------------
  const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  async function shareImage(kind, vaultAddr) {
    const r = S.rep; if (!r) return;
    const W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#050a14"); bg.addColorStop(1, "#071410"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = (x, y, rad, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
    glow(160, 120, 520, "rgba(91,140,255,.22)"); glow(1100, 560, 520, "rgba(57,255,136,.16)");
    const av = await loadImg(AV);
    if (av) { g.save(); g.beginPath(); g.arc(150, 150, 70, 0, Math.PI * 2); g.clip(); g.drawImage(av, 80, 80, 140, 140); g.restore(); g.lineWidth = 5; g.strokeStyle = "#39ff88"; g.beginPath(); g.arc(150, 150, 72, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#8fe9bd"; g.font = "700 26px Sora, sans-serif"; g.fillText("ARCIA AGENT", 250, 128);
    g.fillStyle = "#ffffff"; g.font = "800 64px Sora, sans-serif"; g.fillText("$" + (r.sym || "TOKEN"), 250, 196);
    const c = r.call || {}, k = CALLS[c.call] || ["Reading", ""];
    const col = { safe: "#39ff88", caution: "#ffc861", risky: "#ff6e5a" }[c.call] || "#9dcbff";
    if (kind === "vault") {
      const v = (S.vs && S.vs.vaults || []).find((x) => x.vault === vaultAddr) || {};
      const burned = Number(v.burned || 0) / 10 ** (v.dec || r.dec || 18);
      g.fillStyle = "#ffc861"; g.font = "800 92px Sora, sans-serif"; g.fillText(num(burned), 80, 360);
      g.fillStyle = "#dbe6ee"; g.font = "600 34px Inter, sans-serif"; g.fillText(`$${r.sym} bought and burned by ARCIA`, 80, 414);
      g.fillStyle = "#9fb0bd"; g.font = "500 28px Inter, sans-serif"; g.fillText(`${usd(v.spent)} spent · ${v.buys || 0} buys · every token sent to 0x…dEaD`, 80, 466);
    } else {
      g.lineWidth = 6; g.strokeStyle = col; g.fillStyle = "rgba(255,255,255,.04)";
      const txt = tr(k[0]).toUpperCase(); g.font = "800 60px Sora, sans-serif"; const tw = g.measureText(txt).width;
      g.beginPath(); g.roundRect(80, 270, tw + 60, 96, 18); g.fill(); g.stroke();
      g.fillStyle = col; g.fillText(txt, 110, 340);
      g.fillStyle = "#dbe6ee"; g.font = "600 30px Inter, sans-serif"; g.fillText("24-hour safety call · graded in public", tw + 170, 312);
      g.fillStyle = "#9fb0bd"; g.font = "500 26px Inter, sans-serif"; (c.why || []).slice(0, 3).forEach((w, i) => g.fillText("· " + w, tw + 170, 354 + i * 36));
      if (c.hash) { g.fillStyle = "#6f7e8a"; g.font = "500 22px ui-monospace, monospace"; g.fillText("hash " + c.hash.slice(0, 18) + "…", 80, 420); }
    }
    g.fillStyle = "#6f7e8a"; g.font = "500 24px Inter, sans-serif"; g.fillText("arcircle.app/arc#agent · not financial advice", 80, 580);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `arcia-agent-${(r.sym || "token").toLowerCase()}.png`, { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch { /* fall back to a download */ }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, "image/png");
  }

  // ---------------- followed tokens: new calls and burns (in-page, and as notifications when allowed) ----------------
  function toast(text) {
    let box = $("ag-toasts");
    if (!box) { box = document.createElement("div"); box.id = "ag-toasts"; box.className = "ag-toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "ag-toast"; t.innerHTML = `<img src="${AV}" alt="" width="28" height="28"><span data-no-i18n>${esc(text)}</span>`;
    box.appendChild(t); setTimeout(() => t.classList.add("out"), 6000); setTimeout(() => t.remove(), 6600);
  }
  async function checkFollows() {
    const l = watch(); if (!l.length) return;
    let seen = {}; try { seen = JSON.parse(localStorage.getItem(SK) || "{}") || {}; } catch { seen = {}; }
    const first = !seen.init;
    let R = null, V = null;
    try { const [a, b] = await Promise.all([fetch(`${API}?agent=record`), fetch(`${API}?agent=vaults`)]); R = a.ok ? await a.json() : null; V = b.ok ? await b.json() : null; } catch { return; }
    const out = [];
    for (const w of l) {
      const c = R && R.calls.find((x) => x.t === w.t);
      if (c) {
        const key = c.id + (c.graded ? ":g" : "");
        if (!first && seen["c:" + w.t] !== key) out.push(c.graded ? `${c.sym || short(w.t)}: ${tr("ARCIA's call was graded")} — ${tr(c.graded.right ? "called right" : c.graded.right === false ? "called wrong" : "not graded")}` : `${c.sym || short(w.t)}: ${tr("new safety call")} — ${tr((CALLS[c.call] || [c.call])[0])}`);
        seen["c:" + w.t] = key;
      }
      const acts = V && V.live ? V.recent.filter((a) => a.token === w.t) : [];
      if (acts.length) {
        if (!first && seen["a:" + w.t] !== acts[0].tx) out.push(`${acts[0].sym || short(w.t)}: ${tr("ARCIA bought and burned")} ${num(Number(acts[0].burned) / 10 ** (acts[0].dec || 18))}`);
        seen["a:" + w.t] = acts[0].tx;
      }
    }
    seen.init = 1;
    try { localStorage.setItem(SK, JSON.stringify(seen)); } catch { /* fine */ }
    for (const m of out.slice(0, 4)) {
      toast(m);
      if (notifyOn() && "Notification" in window && Notification.permission === "granted" && document.hidden) { try { new Notification("ARCIA AGENT", { body: m, icon: AV }); } catch { /* fine */ } }
    }
  }

  // ---------------- boot ----------------
  function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      const m = /[?&]t=(0x[0-9a-fA-F]{40})/.exec(location.hash);
      if (m) { $("ag-in").value = m[1]; wake(m[1]); }
    }
    if (!S.cd) {
      S.cd = setInterval(() => { panel.querySelectorAll("[data-ag-cd]").forEach((e) => { e.textContent = inT(Number(e.dataset.agCd)); }); }, 1000);
      setInterval(checkFollows, 90000); setTimeout(checkFollows, 4000);
    }
    clearInterval(S.timer);
    S.timer = setInterval(async () => {
      if (!panel.classList.contains("active") || document.hidden || !S.t || !S.rep) return;
      await loadVaults();
      if (S.tab === "vault" && !S.acting && !panel.querySelector(".ag-v input:focus, .ag-open input:focus")) tabs();
      if (S.tab === "actions") tabs();
      if ((S.vbN = (S.vbN || 0) + 1) % 4 === 0) vboard();
    }, 30000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "agent") show(); else clearInterval(S.timer); });
  // another page sends a token here (/arc#agent?t=0x…: the scanner, a coin page)
  window.addEventListener("hashchange", () => { const m = /^#agent\?t=(0x[0-9a-fA-F]{40})/.exec(location.hash); if (m && S.booted && lc(m[1]) !== S.t) { $("ag-in").value = m[1]; wake(m[1]); } });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); if (S.rep) render(); } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcAgent = { wake, state: S };
})();
