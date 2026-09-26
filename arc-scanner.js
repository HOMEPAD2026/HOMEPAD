/* global ethers, CONFIG, ARC, readProvider */
// arc-scanner.js — Token Scanner, an ARCIRCLE PAD utility (arcpad.html#scanner).
// The checks and the score live in scan-core.js (generated from
// api/_scan-core.mjs, the same engine the server uses for Telegram /scan and
// the X share card). This file runs the reads in the browser and draws them:
//   • every part lands on screen the moment it's read (contract first, then
//     launchpad records, market, holders + history, then the dry-run trades);
//     the score and verdict appear once everything is in
//   • the three main reasons up top, problems first, "?" on every check
//   • holders as a donut, the token's own history as a timeline, the deployer
//   • paste a wallet instead and it lists the ArcPad coins it holds
//   • compare two tokens, watch one (alerts while ArcPad is open), share a card
// Deep link: /arc#scanner?t=0x…   Recent scans and watches: this browser only.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-scanner");
  const K = window.ArcScanCore;
  if (!panel || !K || typeof ethers === "undefined" || typeof CONFIG === "undefined") return;

  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const ex = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const short = K.short;
  const hueOf = (a) => (parseInt(String(a).slice(2, 8), 16) || 0) % 360;
  const haptic = (k) => { if (typeof window.arcHaptic === "function") window.arcHaptic(k); };
  const toast = (m) => { if (typeof window.arcToast === "function") window.arcToast(m); };
  const ARCIRCLE = lc(CONFIG.ARCIRCLE_TOKEN);
  const RECENT = "arcircle.scanner.v1", WATCH = "arcircle.scanner.watch.v1";
  const launches = () => (typeof ARC !== "undefined" && ARC.launches) || [];
  const launchOf = (a) => launches().find((l) => lc(l.token) === lc(a)) || null;

  // ---------- reads (same engine as the server) ----------
  async function fetchJson(url, ms = 9000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  }
  // The dry-run trades need eth_call's state-override argument: try each Arc endpoint until one takes it.
  async function rpcSim(method, params) {
    let last;
    for (const url of [CONFIG.RPC_URL, ...(CONFIG.RPC_FALLBACKS || [])].filter(Boolean)) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal }).finally(() => clearTimeout(t));
        const j = await r.json();
        if (j.error) { last = new Error(j.error.message || "rpc error"); if (/override|unsupported|invalid.*param|not supported|too many arguments|expected 2|unknown field/i.test(last.message)) continue; throw last; }
        return j.result;
      } catch (e) { last = e; }
    }
    throw last || new Error("no rpc");
  }
  const io = { rpc: (m, p) => readProvider().send(m, p), rpcSim, fetchJson, keccak: (h) => ethers.keccak256(String(h).startsWith("0x") ? h : "0x" + h) };
  async function fetchHolders(addr, sym) {
    const a = await fetchJson(`/api/social?scan=${addr}${sym ? `&sym=${encodeURIComponent(sym)}` : ""}`, 20000);
    if (a && Array.isArray(a.top)) return a;
    const b = await fetchJson(`/api/holders?scan=${addr}`, 28000);
    if (b && Array.isArray(b.top)) return b;
    throw new Error("holder scan failed");
  }
  async function marketFallback(addr, x) {
    if (x.arcpad) {
      const l = launchOf(addr);
      const links = [["Website", (x.arcpad && x.arcpad.website) || (l && l.website)], ["Twitter", (x.arcpad && x.arcpad.twitter) || (l && l.twitter)], ["Telegram", (x.arcpad && x.arcpad.telegram) || (l && l.telegram)]]
        .filter(([, u]) => /^https:\/\//.test(u || "")).map(([t, u]) => ({ t, u }));
      return { source: "arcpad", pairs: [], price: l ? l.priceUsdc : null, mcap: l ? l.marketCapUsd : null, created: x.arcpad.launchedAt || (l && l.launchedAt) || null, links };
    }
    if (x.argus) return { source: "argus", pairs: [] };
    return null;
  }

  // =====================================================================
  // scan state
  // =====================================================================
  let seq = 0, cur = null, compareBase = null;
  const PARTS = ["contract", "extras", "market", "holders", "trade"];
  const STEPS = [["contract", "Reading the contract"], ["extras", "Checking who controls it"], ["market", "Looking for trading pools"], ["holders", "Counting holders"], ["trade", "Dry-run buy and sell"]];

  async function scan(input) {
    const raw = String(input || "").trim();
    if (!isAddr(raw)) { message("That isn't a token address — it should start with 0x and be 42 characters long."); return; }
    const addr = ethers.getAddress(raw);
    const my = ++seq;
    const prev = recent().find((r) => lc(r.a) === lc(addr));
    cur = { addr, my, done: {}, c: null, x: {}, m: null, h: null, sim: null, res: null, prevScore: prev ? prev.sc : null, t0: performance.now() };
    $("asc-addr").value = addr;
    if (history.replaceState) history.replaceState(null, "", `${location.pathname}${location.search}#scanner?t=${addr}`);
    $("asc-go").disabled = true;
    $("asc-intro").hidden = true;
    progress(true);
    shell();
    const alive = () => my === seq;
    const mark = (part, ok) => { if (!alive()) return; cur.done[part] = true; stepDone(part, ok); paint(); };

    // 1. contract (everything else needs to know it's a token)
    try { cur.c = await K.readContract(io, addr); } catch (e) { console.warn("scanner", e); if (alive()) { progress(false); $("asc-go").disabled = false; message("Couldn't read that address from Arc right now — try again in a moment."); } return; }
    if (!alive()) return;
    if (!cur.c.contract) { progress(false); $("asc-go").disabled = false; walletMode(addr); return; }
    mark("contract", true);
    if (!cur.c.token) { PARTS.forEach((p) => { cur.done[p] = true; }); return finish(); }

    // 2. the rest side by side; each paints as it lands
    const xP = Promise.all([K.readArcPad(io, addr).catch(() => null), K.readArgus(io, addr).catch(() => null), K.readLocks(io, addr).catch(() => null)])
      .then(([arcpad, argus, locks]) => { if (!alive()) return; cur.x = { arcpad, argus, locks }; mark("extras", true); });
    const mP = K.readMarket(io, addr).catch(() => null).then(async (m) => {
      await xP;
      if (!alive()) return;
      if ((!m || !m.pairs.length) && (cur.x.arcpad || cur.x.argus)) m = (await marketFallback(addr, cur.x)) || m;
      cur.m = m; mark("market", !!m);
    });
    // the Liquidity Manager's read of the pool: how much of its liquidity is locked (lands whenever it's ready)
    (async () => {
      for (let i = 0; i < 6 && alive(); i++) {
        const j = await fetch(`/api/social?liq=${addr}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!j || !alive()) return;
        if (j.done) { cur.lp = K.lpSummary ? K.lpSummary(j) : null; if (cur.lp && cur.res) paint(); return; }
      }
    })();
    const hP = fetchHolders(addr, cur.c.symbol).then((h) => { if (alive()) { cur.h = h; mark("holders", true); } }, (e) => { console.warn("scanner holders", e); if (alive()) mark("holders", false); });
    await Promise.all([xP, hP]);
    if (!alive()) return;
    // 3. dry-run trades need a holder to act as
    cur.sim = await K.simulateFor(io, addr, cur.c, cur.h).catch(() => null);
    if (!alive()) return;
    mark("trade", !!cur.sim);
    await mP;
    if (!alive()) return;
    finish();
    // 4. an old token's history keeps filling in (the server keeps its place)
    let more = cur.h && cur.h.more, tries = 0;
    while (more && tries++ < 4 && alive()) {
      const h = await fetchHolders(addr, cur.c.symbol).catch(() => null);
      if (!alive() || !h) break;
      cur.h = h; more = h.more;
      paint(true);
      // older history can move the score: update the verdict in place
      if (cur.res && cur.shown != null && cur.res.score !== cur.shown) {
        cur.shown = cur.res.score; head(); gaugeAt(cur.res.score);
        const st = panel.querySelector(".asc-stamp"); if (st) { st.className = "asc-stamp v-" + cur.res.verdict.k; st.textContent = tr(cur.res.verdict.t); }
        remember(cur.addr, cur.c.symbol, cur.res.score); shelf();
      }
    }
    if (alive() && cur.h) { const el = panel.querySelector(".asc-more-hist"); if (el) el.remove(); }
  }
  function finish() {
    if (!cur) return;
    const wait = Math.max(0, (reduce ? 0 : 700) - (performance.now() - cur.t0));
    const my = cur.my;
    setTimeout(() => {
      if (!cur || cur.my !== my) return;
      progress(false);
      $("asc-go").disabled = false;
      cur.final = true;
      paint();
      reveal();
      if (cur.res && !cur.res.notToken) { remember(cur.addr, cur.c.symbol, cur.res.score); shelf(); renderChips(); compareMaybe(); }
      haptic(cur.res && cur.res.score >= 75 ? "milestone" : "tap");
    }, wait);
  }

  // =====================================================================
  // progress
  // =====================================================================
  function progress(on) {
    const box = $("asc-progress");
    box.hidden = !on;
    panel.classList.toggle("asc-scanning", !!on);
    if (on) {
      $("asc-steps").innerHTML = STEPS.map(([k, t]) => `<li data-s="${k}" class="on"><i aria-hidden="true"></i><span>${esc(tr(t))}</span></li>`).join("");
      box.querySelectorAll(".asc-radar .blip").forEach((b) => b.remove());
    }
  }
  function stepDone(k, ok) {
    const li = panel.querySelector(`#asc-steps [data-s="${k}"]`);
    if (li) li.className = ok === false ? "skip" : "done";
    // every finished step leaves a blip on the radar
    const radar = panel.querySelector(".asc-radar");
    if (radar && !reduce) {
      const b = document.createElement("b"); b.className = "blip" + (ok === false ? " off" : "");
      const ang = Math.random() * Math.PI * 2, r = 18 + Math.random() * 40;
      b.style.left = `${50 + Math.cos(ang) * r}%`; b.style.top = `${50 + Math.sin(ang) * r}%`;
      radar.appendChild(b);
    }
  }
  function message(msg) {
    $("asc-out").innerHTML = `<div class="asc-card asc-msg">${esc(tr(msg))}</div>`;
    $("asc-intro").hidden = true;
  }

  // =====================================================================
  // drawing
  // =====================================================================
  const ICON = {
    pass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v6M12 17h.01"/></svg>',
    risk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v6M12 7.5h.01"/></svg>',
  };
  const GROUPS = [["contract", "Contract", ["contract", "extras"]], ["control", "Who controls it", ["contract", "extras"]], ["trade", "Trading", ["trade", "extras"]],
    ["market", "Market", ["market"]], ["holders", "Holders", ["holders"]], ["history", "History", ["holders"]]];
  const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/></svg>';

  function shell() {
    const out = $("asc-out");
    out.classList.remove("in");
    out.dataset.tab = "checks";
    out.innerHTML = `
      <div class="asc-card asc-head is-loading" id="asc-head">
        <div class="asc-scanline" aria-hidden="true"></div>
        <div class="asc-id"><span class="asc-logo ph skel"></span><div class="asc-id-txt"><h2><span class="skel-line w60"></span></h2><span class="skel-line w40"></span></div></div>
        <div class="asc-verdict"><div class="asc-gauge"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="asc-g-track" cx="60" cy="60" r="52"/><circle class="asc-g-fill" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg><div class="asc-g-mid"><b class="asc-score" data-no-i18n>…</b><small>/ 100</small></div></div>
          <div class="asc-v-txt"><strong class="asc-vtitle">${esc(tr("Scanning…"))}</strong><div class="asc-reasons"></div><div class="asc-counts"></div></div></div>
        <div class="asc-actions" hidden></div>
      </div>
      <nav class="asc-tabs" role="tablist" aria-label="${esc(tr("Result sections"))}">
        ${[["checks", "Checks"], ["market", "Market"], ["holders", "Holders"], ["history", "History"]].map(([k, t], i) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${i === 0}">${esc(tr(t))}</button>`).join("")}
      </nav>
      <div class="asc-compare" id="asc-compare" hidden></div>
      <div class="asc-tiles" id="asc-tiles"></div>
      <div class="asc-grid">
        <div class="asc-checks problems" id="asc-checks">
          <div class="asc-checks-bar"><span>${esc(tr("Checks"))}</span><div class="asc-toggle" role="radiogroup"><button type="button" role="radio" aria-checked="true" data-show="problems">${esc(tr("Problems first"))}</button><button type="button" role="radio" aria-checked="false" data-show="all">${esc(tr("Show everything"))}</button></div></div>
          ${GROUPS.map(([g, t]) => `<section class="asc-card asc-group is-pending" data-g="${g}"><h3><span>${esc(tr(t))}</span><em class="st-wait">${esc(tr("Checking…"))}</em></h3><div class="asc-group-body"><div class="asc-skel-rows"><i></i><i></i></div></div></section>`).join("")}
        </div>
        <aside class="asc-side" id="asc-side">
          <div class="asc-card asc-holders is-pending" id="asc-holders"><h3>${esc(tr("Holders"))}</h3><div class="asc-donut-skel"></div></div>
        </aside>
      </div>`;
  }

  function paint(historyOnly) {
    if (!cur || !cur.c) return;
    const d = cur.done;
    cur.res = K.evaluate(cur.addr, { c: cur.c, x: cur.x, m: cur.m, h: cur.h, sim: cur.sim, lp: cur.lp || null });
    const res = cur.res;
    if (res.notToken) { renderNotToken(res); return; }
    if (!historyOnly) head();
    // groups
    GROUPS.forEach(([g, , needs]) => {
      const sec = panel.querySelector(`.asc-group[data-g="${g}"]`);
      if (!sec) return;
      const ready = needs.every((p) => d[p]);
      if (!ready) return;
      const rows = res.rows.filter((r) => r.group === g);
      if (!rows.length) { sec.hidden = true; return; }
      sec.hidden = false;
      const worst = rows.some((r) => r.status === "risk") ? "risk" : rows.some((r) => r.status === "warn") ? "warn" : "pass";
      const ok = rows.filter((r) => r.status === "pass" || r.status === "info").length;
      const html = `<h3><span>${esc(tr(GROUPS.find((x) => x[0] === g)[1]))}</span><em class="st-${worst}">${esc(tr(worst === "pass" ? "All good" : worst === "warn" ? "Worth a look" : "Risk found"))}</em></h3>
        <ul>${rows.map((r, i) => rowHtml(r, i)).join("")}</ul>
        ${ok ? `<button type="button" class="asc-more" data-more data-label="${esc(tr(worst === "pass" ? (ok === 1 ? "Show 1 check" : `Show ${ok} checks`) : `Show ${ok} more`))}">${esc(tr(worst === "pass" ? (ok === 1 ? "Show 1 check" : `Show ${ok} checks`) : `Show ${ok} more`))}</button>` : ""}`;
      if (sec.__html !== html) {
        const wasPending = sec.classList.contains("is-pending");
        sec.innerHTML = html; sec.__html = html;
        sec.classList.remove("is-pending");
        sec.classList.toggle("all-pass", worst === "pass");
        sec.dataset.worst = worst;
        if (wasPending && !reduce) { sec.classList.remove("land"); void sec.offsetWidth; sec.classList.add("land"); }
      }
    });
    if (d.market) tiles(res.market);
    if (d.holders) { holdersCard(res.dist); timelineCard(res.timeline, res.dist); deployerCard(res.dist); }
    if (cur.final) {
      // problems first: groups with risks, then warnings, then the rest
      const rank = { risk: 0, warn: 1, pass: 2 };
      panel.querySelectorAll(".asc-group").forEach((s, i) => { s.style.order = String((rank[s.dataset.worst] ?? 2) * 10 + i); });
    }
  }
  function rowHtml(r, i) {
    const help = K.HELP[r.id] || "";
    const addr = r.addr ? `<a class="asc-addr" href="${ex("address", r.addr)}" target="_blank" rel="noopener" data-no-i18n style="--h:${hueOf(r.addr)}"><i></i>${short(r.addr)}</a>` : "";
    const links = (r.links || []).map((l) => `<a href="${esc(l.href)}"${l.internal ? "" : ' target="_blank" rel="noopener nofollow"'} class="asc-link"${l.internal ? "" : " data-no-i18n"}>${esc(l.internal ? tr(l.label) : l.label)}${l.internal ? " →" : " ↗"}</a>`).join("");
    const code = r.code ? `<a href="${ex("address", cur.addr)}#code" target="_blank" rel="noopener" class="asc-link">${esc(tr(r.code.label))} ↗</a>` : "";
    return `<li class="asc-row st-${r.status}" style="--i:${i}">
      <span class="asc-ico" title="${esc(tr({ pass: "OK", warn: "Warning", risk: "Risk", info: "Note" }[r.status]))}">${ICON[r.status]}</span>
      <div class="asc-row-main">
        <div class="asc-row-top"><b>${esc(tr(r.title))}</b>${r.pts ? `<em class="asc-pts" data-no-i18n>−${r.pts}</em>` : ""}${r.est ? `<em class="asc-est">${esc(tr("From the code"))}</em>` : ""}${help ? `<button type="button" class="asc-q" aria-expanded="false" aria-label="${esc(tr("What does this mean?"))}">?</button>` : ""}</div>
        ${r.pre || addr || r.detail || r.note || links || code ? `<p>${r.pre ? `<span>${esc(tr(r.pre))}</span> ` : ""}${addr}${r.detail ? ` <span>${esc(tr(r.detail))}</span>` : ""}${r.note ? ` <span class="asc-note">${esc(tr(r.note))}</span>` : ""}${links || code ? ` <span class="asc-links-in">${links}${code}</span>` : ""}</p>` : ""}
        ${help ? `<p class="asc-help" hidden>${esc(tr(help))}</p>` : ""}
        ${r.status === "risk" || r.status === "warn" ? `<button type="button" class="asc-report" data-report="${esc(r.title)}" data-st="${r.status}">${esc(tr("Is this wrong?"))}</button>` : ""}
      </div></li>`;
  }

  function head() {
    const h = $("asc-head");
    if (!h) return;
    const c = cur.c, res = cur.res, m = res.market;
    const logo = (m && m.image) || (cur.x.arcpad && /^(https:\/\/|data:image\/)/.test(cur.x.arcpad.imageUrl || "") && cur.x.arcpad.imageUrl)
      || (launchOf(cur.addr) && /^(https:\/\/|data:image\/)/.test(launchOf(cur.addr).imageUrl || "") && launchOf(cur.addr).imageUrl)
      || (lc(cur.addr) === ARCIRCLE ? "images/arcircle-mark-sm.png" : "");
    const idHtml = `${logo ? `<img class="asc-logo" src="${esc(logo)}" alt="">` : `<span class="asc-logo ph" style="--h:${hueOf(cur.addr)}">${esc(String(c.symbol || "?").charAt(0).toUpperCase())}</span>`}
      <div class="asc-id-txt">
        <h2 data-no-i18n>${esc(c.name || "Unnamed")} <span>$${esc(c.symbol || "?")}</span></h2>
        <button type="button" class="asc-ca" data-copy="${esc(cur.addr)}" title="${esc(tr("Copy address"))}" data-no-i18n>${short(cur.addr)}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/></svg></button>
        <div class="asc-links">
          <a href="${ex("token", cur.addr)}" target="_blank" rel="noopener">${esc(tr("Explorer"))} ↗</a>
          ${m && m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">Dexscreener ↗</a>` : ""}
          <a href="#liquidity?token=${esc(cur.addr)}">${esc(tr("Liquidity & LP locks"))} →</a>
          ${lc(cur.addr) === ARCIRCLE ? `<a class="asc-act" href="/arc#arcircle">${esc(tr("Trade $ARCIRCLE"))} →</a>` : cur.x.arcpad ? `<a class="asc-act" href="/arc#coin/${esc(cur.addr)}">${esc(tr("Open on ArcPad"))} →</a>` : ""}
        </div>
      </div>`;
    const id = h.querySelector(".asc-id");
    if (id.__html !== idHtml) { id.innerHTML = idHtml; id.__html = idHtml; h.classList.remove("is-loading"); }
    if (!cur.final) return;
    const v = res.verdict;
    h.className = `asc-card asc-head asc-v-${v.k}${res.score >= 90 ? " asc-glow" : ""}`;
    const counts = { pass: 0, warn: 0, risk: 0 };
    res.rows.forEach((r) => { if (counts[r.status] != null) counts[r.status]++; });
    h.querySelector(".asc-vtitle").textContent = tr(v.t);
    h.querySelector(".asc-reasons").innerHTML = res.reasons.map((r, i) => `<span class="asc-reason st-${r.status}" style="--i:${i}">${ICON[r.status]}${esc(tr(r.title))}</span>`).join("");
    h.querySelector(".asc-counts").innerHTML = `<span class="c-pass">${counts.pass} ${esc(tr("OK"))}</span><span class="c-warn">${counts.warn} ${esc(tr(counts.warn === 1 ? "warning" : "warnings"))}</span><span class="c-risk">${counts.risk} ${esc(tr(counts.risk === 1 ? "risk" : "risks"))}</span>`
      + `<span class="asc-when">${esc(tr("Scanned"))} <time data-no-i18n>${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</time></span>`;
    const watching = watched().some((w) => lc(w.a) === lc(cur.addr));
    const acts = h.querySelector(".asc-actions");
    acts.hidden = false;
    acts.innerHTML = `
      <button type="button" data-act="rescan"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>${esc(tr("Scan again"))}</button>
      <button type="button" data-act="x"><svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.8l7.7-8.8L1.3 2.5h6.8l4.7 6.1zm-1.2 17h1.8L7.1 4.4H5.2z"/></svg>${esc(tr("Share on X"))}</button>
      <button type="button" data-act="card"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="m3.5 15 5-4.5 4 3.5 3-2.5 5 4"/></svg>${esc(tr("Save card"))}</button>
      <button type="button" data-act="link"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>${esc(tr("Copy link"))}</button>
      <button type="button" data-act="watch" aria-pressed="${watching}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>${esc(tr(watching ? "Watching" : "Watch"))}</button>
      <button type="button" data-act="embed"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/></svg>${esc(tr("Embed badge"))}</button>
      <button type="button" data-act="compare"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M16 4v16M4 8h8M12 16h8"/></svg>${esc(tr(compareBase && lc(compareBase.addr) !== lc(cur.addr) ? "Compare" : "Compare with…"))}</button>`;
  }
  // the ring fills while its colour runs red → amber → green to where the score lands
  function gaugeAt(s) {
    const h = $("asc-head");
    if (!h) return;
    const sc = h.querySelector(".asc-score"), fill = h.querySelector(".asc-g-fill"), C = 326.7, hue = Math.round(4 + (s / 100) * 136);
    fill.style.strokeDashoffset = String(C * (1 - Math.max(0.02, s / 100)));
    fill.style.stroke = `hsl(${hue} 90% 58%)`; fill.style.filter = `drop-shadow(0 0 8px hsl(${hue} 90% 58% / .6))`;
    sc.textContent = String(Math.round(s));
  }
  function reveal() {
    const h = $("asc-head");
    if (!h || !cur || !cur.res) return;
    const res = cur.res;
    const g = h.querySelector(".asc-gauge");
    const to = res.score, setAt = gaugeAt;
    cur.shown = to;
    if (reduce) setAt(to);
    else {
      const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 1200), e = 1 - Math.pow(1 - k, 3); setAt(to * e); if (k < 1) requestAnimationFrame(step); else stamp(); };
      setAt(0); requestAnimationFrame(step);
    }
    g.classList.add("in");
    // change since the last time this browser scanned it
    if (cur.prevScore != null && cur.prevScore !== to) {
      const d = to - cur.prevScore, chip = document.createElement("span");
      chip.className = "asc-delta " + (d > 0 ? "up" : "down"); chip.setAttribute("data-no-i18n", "");
      chip.textContent = `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
      chip.title = tr("Change since your last scan");
      g.appendChild(chip);
    }
    if (reduce) stamp();
    $("asc-out").classList.add("in");
    sticky();
  }
  function stamp() {
    const h = $("asc-head");
    if (!h || !cur || !cur.res || h.querySelector(".asc-stamp")) return;
    const s = document.createElement("div");
    s.className = "asc-stamp v-" + cur.res.verdict.k; s.setAttribute("aria-hidden", "true");
    s.textContent = tr(cur.res.verdict.t);
    h.appendChild(s);
    if (cur.res.verdict.k === "risk") haptic("sell");
  }
  function renderNotToken(res) {
    progress(false);
    $("asc-out").innerHTML = `<div class="asc-card asc-nottoken"><span class="asc-bad">${ICON.risk}</span><div><h2>${esc(tr(res.rows[0].title))}</h2><p>${esc(tr(res.rows[0].detail))}</p><a href="${ex("address", cur.addr)}" target="_blank" rel="noopener">${esc(tr("Open on the explorer"))} ↗</a></div></div>`;
  }

  function tiles(m) {
    const box = $("asc-tiles");
    if (!box) return;
    if (!m) { box.innerHTML = ""; return; }
    const now = Date.now() / 1000;
    const list = [
      ["Price", K.usd(m.price), m.change != null && isFinite(m.change) ? `<em class="${m.change >= 0 ? "up" : "down"}">${m.change >= 0 ? "+" : ""}${Number(m.change).toFixed(1)}%</em>` : ""],
      ["Market cap", K.usd(m.mcap)], ["Liquidity", m.liq != null ? K.usd(m.liq) : "—"], ["24h volume", m.vol != null ? K.usd(m.vol) : "—"],
      ["24h trades", m.buys != null ? `<span class="asc-b">${m.buys}</span> / <span class="asc-s">${m.sells}</span>` : "—"], ["Pool age", m.created ? K.ageText(now - m.created) : "—"],
    ];
    const html = list.map(([k, v, extra], i) => `<div style="--i:${i}"><small>${esc(tr(k))}</small><b data-no-i18n>${v}</b>${extra || ""}</div>`).join("");
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ---- holders: donut + largest wallets ----
  function holdersCard(d) {
    const box = $("asc-holders");
    if (!box) return;
    if (!d) { box.classList.remove("is-pending"); box.innerHTML = `<h3>${esc(tr("Holders"))}</h3><p class="asc-hnote">${esc(tr("The holder scan didn't finish — try again in a moment."))}</p>`; return; }
    const S = d.S;
    const segs = [["pool", "In pool", d.inPool], ["burn", "Burned", d.burned], ["lock", "Locked", d.locked], ["top", "Top 10 wallets", d.top10]]
      .map(([k, t, v]) => [k, t, (v / S) * 100]);
    const used = segs.reduce((t, s) => t + s[2], 0) + (d.infra / S) * 100;
    segs.push(["rest", "Everyone else", Math.max(0, 100 - used)]);
    const vis = segs.filter((s) => s[2] > 0.005);
    const R = 44, C = 2 * Math.PI * R;
    let acc = 0;
    const arcs = vis.map(([k, , p], i) => { const len = (p / 100) * C, gap = vis.length > 1 ? Math.min(2, len / 3) : 0; const el = `<circle class="d-${k}" data-seg="${k}" cx="60" cy="60" r="${R}" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - Math.max(0, len - gap)).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" style="--i:${i}"/>`; acc += len; return el; }).join("");
    const more = cur && cur.h && cur.h.more;
    const people = d.people.map((p, i) => {
      const pc = (p.v / S) * 100;
      const tags = [p.deployer ? `<em class="t-dep">${esc(tr("Deployer"))}</em>` : "", p.contract ? `<em class="t-con">${esc(tr("Contract"))}</em>` : ""].join("");
      return `<li style="--w:${Math.min(100, pc * 2).toFixed(2)}%"><span class="n" data-no-i18n>${i + 1}</span><a href="${ex("address", p.a)}" target="_blank" rel="noopener" data-no-i18n>${short(p.a)}</a>${tags}<b data-no-i18n>${K.pct(pc)}</b></li>`;
    }).join("") || `<li class="none">${esc(tr("No wallets besides the pool, burned and locked tokens."))}</li>`;
    const html = `<h3>${esc(tr("Holders"))}</h3>
      <div class="asc-donut-wrap"><svg class="asc-donut" viewBox="0 0 120 120" aria-hidden="true"><circle class="d-track" cx="60" cy="60" r="${R}"/>${arcs}</svg>
        <div class="asc-donut-mid"><b data-no-i18n>${d.exact ? "" : "≥"}${(d.holders || 0).toLocaleString("en-US")}</b><small>${esc(tr("holders"))}</small></div>
        <ul class="asc-legend">${vis.map(([k, t, v]) => `<li class="d-${k}" data-seg="${k}" tabindex="0"><i></i><span>${esc(tr(t))}</span><b data-no-i18n>${K.pct(v)}</b></li>`).join("")}</ul></div>
      ${growth()}
      <h4>${esc(tr("Largest wallets"))}</h4><ol class="asc-top">${people}</ol>
      ${more ? `<p class="asc-more-hist"><i></i>${esc(tr("Reading older history…"))}</p>` : ""}
      <p class="asc-hnote">${esc(tr(d.complete ? "From the token's full transfer history; balances read live." : "From recent transfer history; balances read live."))}</p>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; box.classList.remove("is-pending"); }
  }
  // holder count per day (kept by the server each time the token is scanned)
  function growth() {
    const hist = (cur && cur.h && cur.h.hist) || [];
    if (hist.length < 2) return "";
    const pts = hist.slice(-30), ns = pts.map((x) => x.n), lo = Math.min(...ns), hi = Math.max(...ns), W = 220, H = 40;
    const xy = pts.map((x, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - 4 - ((x.n - lo) / Math.max(1, hi - lo)) * (H - 8)).toFixed(1)}`).join(" ");
    const d = ns[ns.length - 1] - ns[0];
    return `<div class="asc-growth"><div><small>${esc(tr("Holders over time"))}</small><b class="${d >= 0 ? "up" : "down"}" data-no-i18n>${d >= 0 ? "+" : "−"}${Math.abs(d).toLocaleString("en-US")}</b><small data-no-i18n>${esc(pts[0].d.slice(5))} → ${esc(pts[pts.length - 1].d.slice(5))}</small></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${xy}"/></svg></div>`;
  }

  // ---- history timeline ----
  function timelineCard(events, d) {
    const side = $("asc-side");
    if (!side || !cur) return;
    let box = $("asc-timeline");
    const dec = cur.c.decimals, S = d ? d.S : 0;
    const amt = (v) => K.compact(K.units(v, dec));
    const first = d && d.firstMint;
    // the events that matter all stay; large transfers and burns only the latest few
    const all = (events || []).slice().sort((a, b) => b.b - a.b);
    const key = all.filter((e) => e.k !== "big" && e.k !== "burn");
    const moves = all.filter((e) => e.k === "big" || e.k === "burn").slice(0, 4);
    const pick = [...key.slice(0, 10), ...moves].sort((a, b) => b.b - a.b);
    const items = pick.map((e) => {
      let t, k = e.k;
      if (e.k === "mint") { const isFirst = first && e.b === first.block; t = isFirst ? `Created — ${amt(e.v)} minted` : `Minted ${amt(e.v)} more`; k = isFirst ? "create" : "mint"; }
      else if (e.k === "owner") t = /^0x0{40}$/.test(e.from) ? `Owner set to ${short(e.to)}` : K.BURN.includes(lc(e.to)) ? "Ownership renounced" : `Ownership moved to ${short(e.to)}`;
      else if (e.k === "pause") t = "Transfers paused";
      else if (e.k === "unpause") t = "Transfers resumed";
      else if (e.k === "upgrade") t = `Code upgraded to ${short(e.impl)}`;
      else if (e.k === "burn") t = `${amt(e.v)} burned`;
      else if (e.k === "big") t = `${amt(e.v)} moved (${K.pct(S ? (K.units(e.v, dec) / S) * 100 : 0)})`;
      else return "";
      const when = e.ts ? new Date(e.ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : `#${e.b}`;
      return `<li class="k-${k}"><i aria-hidden="true"></i><div><b>${esc(tr(t))}</b><small data-no-i18n>${esc(when)}${e.tx ? ` · <a href="${ex("tx", e.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ""}</small></div></li>`;
    }).filter(Boolean);
    if (!items.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.className = "asc-card asc-timeline"; box.id = "asc-timeline"; side.appendChild(box); }
    const html = `<h3>${esc(tr("History"))}</h3><ol>${items.join("")}</ol>${d && !d.complete ? `<p class="asc-hnote">${esc(tr("Recent history only — older events fill in on later scans."))}</p>` : ""}`;
    if (box.__html !== html) {
      box.innerHTML = html; box.__html = html;
      // events appear one by one as the card scrolls into view
      if (!reduce && "IntersectionObserver" in window) {
        const io2 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { box.classList.add("in"); io2.disconnect(); } }), { threshold: 0.15 });
        io2.observe(box);
      } else box.classList.add("in");
    }
  }
  // ---- deployer ----
  function deployerCard(d) {
    const side = $("asc-side");
    if (!side || !cur) return;
    const creator = (cur.x.arcpad && cur.x.arcpad.creator) || (cur.x.argus && cur.x.argus.creator) || null;
    const dep = (d && d.deployer) || creator;
    let box = $("asc-deployer");
    if (!dep) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.className = "asc-card asc-deployer"; box.id = "asc-deployer"; const tl = $("asc-timeline"); side.insertBefore(box, tl || null); }
    const held = d ? d.people.find((p) => p.deployer) : null;
    const others = launches().filter((l) => (lc(l.creator) === lc(dep) || (creator && lc(l.creator) === lc(creator))) && lc(l.token) !== lc(cur.addr)).slice(0, 6);
    const when = d && d.firstMint && d.firstMint.ts ? new Date(d.firstMint.ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;
    const html = `<h3>${esc(tr(creator && lc(creator) !== lc(dep) ? "Creator" : "Deployer"))}</h3>
      <a class="asc-addr big" href="${ex("address", dep)}" target="_blank" rel="noopener" data-no-i18n style="--h:${hueOf(dep)}"><i></i>${short(dep)} ↗</a>
      <dl class="asc-dl">
        <div><dt>${esc(tr("Still holds"))}</dt><dd data-no-i18n>${d ? (held ? K.pct((held.v / d.S) * 100) : "0%") : "—"}</dd></div>
        ${when ? `<div><dt>${esc(tr("Created"))}</dt><dd data-no-i18n>${esc(when)}</dd></div>` : ""}
        <div><dt>${esc(tr("Other ArcPad coins"))}</dt><dd data-no-i18n>${others.length}</dd></div>
      </dl>
      ${others.length ? `<div class="asc-chips-in">${others.map((l) => `<button type="button" class="asc-chip" data-t="${esc(l.token)}" data-no-i18n>$${esc(l.symbol)}</button>`).join("")}</div>` : ""}`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ---- mobile: score stays in view while you scroll the checks ----
  let stickyEl = null, stickyIo = null;
  function sticky() {
    if (!cur || !cur.res || cur.res.notToken) return;
    if (!stickyEl) {
      stickyEl = document.createElement("button");
      stickyEl.type = "button"; stickyEl.className = "asc-sticky"; stickyEl.hidden = true;
      stickyEl.addEventListener("click", () => { const h = $("asc-head"); if (h) h.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });
      document.body.appendChild(stickyEl);
    }
    const v = cur.res.verdict;
    stickyEl.className = `asc-sticky v-${v.k}`;
    stickyEl.innerHTML = `<b data-no-i18n>$${esc(cur.c.symbol)}</b><span class="sc" data-no-i18n>${cur.res.score}</span><span>${esc(tr(v.t))}</span>`;
    if (stickyIo) stickyIo.disconnect();
    if ("IntersectionObserver" in window) {
      stickyIo = new IntersectionObserver((es) => es.forEach((e) => { stickyEl.hidden = e.isIntersecting || !panel.classList.contains("active") || window.innerWidth > 900; }), { rootMargin: "-60px 0px 0px 0px" });
      stickyIo.observe($("asc-head"));
    }
  }
  document.addEventListener("arcpad:tab", (e) => { if (stickyEl && !(e.detail && e.detail.tab === "scanner")) stickyEl.hidden = true; });

  // =====================================================================
  // wallet mode: a wallet address lists the ArcPad coins it holds
  // =====================================================================
  async function walletMode(addr) {
    const out = $("asc-out");
    out.innerHTML = `<div class="asc-card asc-wallet"><div class="asc-wallet-head"><span class="asc-addr big" style="--h:${hueOf(addr)}" data-no-i18n><i></i>${short(addr)}</span><div><h2>${esc(tr("This is a wallet, not a token"))}</h2><p>${esc(tr("Here are the ArcPad coins and $ARCIRCLE it holds — scan any of them."))}</p></div></div><div class="asc-wallet-list"><div class="asc-skel-rows"><i></i><i></i><i></i></div></div></div>`;
    const toks = [...new Set([ARCIRCLE, ...launches().map((l) => lc(l.token))].filter(Boolean))];
    const bal = new Map();
    for (let i = 0; i < toks.length; i += 25) {
      const part = toks.slice(i, i + 25);
      const r = await Promise.all(part.map((t) => io.rpc("eth_call", [{ to: t, data: "0x70a08231" + addr.slice(2).toLowerCase().padStart(64, "0") }, "latest"]).catch(() => null)));
      part.forEach((t, k) => { const v = r[k] && r[k] !== "0x" ? BigInt(r[k]) : 0n; if (v > 0n) bal.set(t, v); });
    }
    const list = [...bal.entries()].map(([t, v]) => {
      const l = launchOf(t);
      const sym = t === ARCIRCLE ? "$ARCIRCLE" : l ? "$" + l.symbol : short(t);
      const units = Number(ethers.formatUnits(v, 18));
      const usdV = l && l.priceUsdc ? units * l.priceUsdc : null;
      return { t, sym, units, usdV };
    }).sort((a, b) => (b.usdV || 0) - (a.usdV || 0));
    const box = out.querySelector(".asc-wallet-list");
    box.innerHTML = list.length ? `<ul>${list.map((x) => `<li><b data-no-i18n>${esc(x.sym)}</b><span data-no-i18n>${K.compact(x.units)}${x.usdV != null ? ` · ${K.usd(x.usdV)}` : ""}</span><button type="button" class="asc-chip" data-t="${esc(x.t)}">${esc(tr("Scan"))} →</button></li>`).join("")}</ul>`
      : `<p class="asc-hnote">${esc(tr("No ArcPad coins or $ARCIRCLE in this wallet."))}</p>`;
  }

  // =====================================================================
  // compare, watch, share
  // =====================================================================
  function snapshot() {
    if (!cur || !cur.res) return null;
    const r = cur.res, d = r.dist, m = r.market;
    const ownerRow = r.rows.find((x) => x.id === "owner");
    const sell = r.rows.find((x) => x.id === "sim" && /sell|Selling/i.test(x.title));
    return {
      addr: cur.addr, sym: cur.c.symbol, score: r.score, verdict: r.verdict,
      rows: [
        ["Score", `${r.score} / 100`], ["Verdict", tr(r.verdict.t)], ["Owner", ownerRow ? tr(ownerRow.title) : "—"], ["Selling", sell ? tr(sell.title) : "—"],
        ["Liquidity", m && m.liq != null ? K.usd(m.liq) : "—"], ["Market cap", m ? K.usd(m.mcap) : "—"],
        ["Holders", d ? `${d.exact ? "" : "≥"}${(d.holders || 0).toLocaleString("en-US")}` : "—"], ["Top 10 wallets", d ? K.pct((d.top10 / d.S) * 100) : "—"],
        ["Pool age", m && m.created ? K.ageText(Date.now() / 1000 - m.created) : "—"], ["Risks", String(r.rows.filter((x) => x.status === "risk").length)],
      ],
    };
  }
  function compareMaybe() {
    const box = $("asc-compare");
    if (!box) return;
    if (!compareBase || lc(compareBase.addr) === lc(cur.addr)) { box.hidden = true; return; }
    const b = snapshot();
    const better = (i) => (i === 0 ? (b.score > compareBase.score ? "b" : b.score < compareBase.score ? "a" : "") : "");
    box.hidden = false;
    box.innerHTML = `<div class="asc-card"><div class="asc-cmp-head"><h3>${esc(tr("Side by side"))}</h3><button type="button" data-act="uncompare">${esc(tr("Clear"))}</button></div>
      <table class="asc-cmp"><thead><tr><th></th><th data-no-i18n>$${esc(compareBase.sym)}</th><th data-no-i18n>$${esc(b.sym)}</th></tr></thead>
      <tbody>${b.rows.map(([k, v], i) => `<tr><th>${esc(tr(k))}</th><td class="${better(i) === "a" ? "win" : ""}" data-no-i18n>${esc(compareBase.rows[i][1])}</td><td class="${better(i) === "b" ? "win" : ""}" data-no-i18n>${esc(v)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function watched() { try { return JSON.parse(localStorage.getItem(WATCH) || "[]"); } catch { return []; } }
  function saveWatched(list) { try { localStorage.setItem(WATCH, JSON.stringify(list.slice(0, 8))); } catch { /* private mode */ } }
  async function watchSnap(a) {
    const c = await K.readContract(io, a);
    const m = await K.readMarket(io, a).catch(() => null);
    const p = m && m.pairs && m.pairs[0];
    return { owner: c.owner || null, supply: c.supply, liq: p ? p.liq : null };
  }
  async function toggleWatch() {
    if (!cur || !cur.c) return;
    let list = watched();
    const on = list.some((w) => lc(w.a) === lc(cur.addr));
    if (on) list = list.filter((w) => lc(w.a) !== lc(cur.addr));
    else {
      const m = cur.res && cur.res.market;
      list.unshift({ a: cur.addr, s: cur.c.symbol, snap: { owner: cur.c.owner || null, supply: cur.c.supply, liq: m && m.liq != null ? m.liq : null }, at: Date.now() });
      try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch { /* fine */ }
      toast(tr("Watching — you'll get an alert here if the owner, supply or liquidity changes."));
    }
    saveWatched(list);
    head(); shelf();
  }
  // Every few minutes while ArcPad is open: owner, supply and liquidity of each watched token.
  async function watchTick() {
    if (document.hidden) return;
    const list = watched();
    let changed = false;
    for (const w of list.slice(0, 5)) {
      let s;
      try { s = await watchSnap(w.a); } catch { continue; }
      const old = w.snap || {};
      const alerts = [];
      if (lc(s.owner) !== lc(old.owner)) alerts.push(K.BURN.includes(lc(s.owner)) ? "ownership was renounced" : "the owner changed");
      if (old.supply && s.supply !== old.supply) alerts.push(BigInt(s.supply) > BigInt(old.supply) ? "new tokens were minted" : "supply went down");
      if (old.liq && s.liq != null && s.liq < old.liq * 0.7) alerts.push(`liquidity fell ${Math.round((1 - s.liq / old.liq) * 100)}%`);
      if (alerts.length) {
        const msg = `$${w.s}: ${alerts.join(", ")}`;
        toast(msg);
        try { if ("Notification" in window && Notification.permission === "granted") new Notification(tr("Token Scanner alert"), { body: msg, tag: "asc-" + w.a, icon: "/images/favicon-32.png" }); } catch { /* fine */ }
        w.alert = { msg, at: Date.now() };
      }
      w.snap = s; changed = true;
    }
    if (changed) { saveWatched(list); shelf(); }
  }
  setInterval(watchTick, 180000);

  function shareX() {
    if (!cur || !cur.res) return;
    const r = cur.res;
    const text = `$${cur.c.symbol} on the ARCIRCLE PAD Token Scanner: ${r.score}/100 · ${r.verdict.t}\n${r.reasons.map((x) => (x.status === "pass" ? "✓ " : "• ") + x.title).join("\n")}`;
    const url = `${location.origin}/s/${cur.addr}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }
  // A 1200×630 picture of the result, drawn here — for posts that need an image.
  async function saveCard() {
    if (!cur || !cur.res) return;
    const r = cur.res, W = 1200, H = 630;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const col = r.verdict.k === "ok" ? "#39ff88" : r.verdict.k === "care" ? "#ffc861" : "#ff6e5a";
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#07101c"); bg.addColorStop(1, "#0b1a14");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(930, 300, 20, 930, 300, 420); glow.addColorStop(0, col + "33"); glow.addColorStop(1, "transparent");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.fillStyle = "#9fc6ff"; g.font = "700 26px Sora, system-ui, sans-serif"; g.fillText("TOKEN SCANNER · ARCIRCLE PAD", 70, 90);
    g.fillStyle = "#ffffff"; g.font = "800 68px Sora, system-ui, sans-serif";
    const title = `$${cur.c.symbol}`.slice(0, 14); g.fillText(title, 70, 190);
    g.fillStyle = "rgba(222,233,244,.6)"; g.font = "500 28px Sora, system-ui, sans-serif"; g.fillText(String(cur.c.name || "").slice(0, 34), 70, 236);
    g.font = "500 22px ui-monospace, Menlo, monospace"; g.fillText(cur.addr, 70, 276);
    g.font = "700 30px Sora, system-ui, sans-serif";
    r.reasons.forEach((x, i) => {
      const y = 360 + i * 62, c2 = x.status === "risk" ? "#ff6e5a" : x.status === "warn" ? "#ffc861" : "#39ff88";
      g.fillStyle = c2; g.beginPath(); g.arc(88, y - 10, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#eef3f7"; g.fillText(tr(x.title).slice(0, 38), 116, y);
    });
    g.lineWidth = 26; g.strokeStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.arc(930, 300, 150, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = col; g.lineCap = "round"; g.beginPath(); g.arc(930, 300, 150, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, r.score / 100)); g.stroke();
    g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "800 110px Sora, system-ui, sans-serif"; g.fillText(String(r.score), 930, 330);
    g.fillStyle = "rgba(222,233,244,.55)"; g.font = "600 26px Sora, system-ui, sans-serif"; g.fillText("/ 100", 930, 372);
    g.fillStyle = col; g.font = "800 40px Sora, system-ui, sans-serif"; g.fillText(tr(r.verdict.t), 930, 520);
    g.textAlign = "left"; g.fillStyle = "rgba(222,233,244,.45)"; g.font = "500 22px Sora, system-ui, sans-serif";
    g.fillText(`arcircle.app/scanner · ${new Date().toISOString().slice(0, 10)} · not financial advice`, 70, 580);
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `scan-${cur.c.symbol || "token"}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  }

  // =====================================================================
  // shelf: recent scans, most scanned, watching
  // =====================================================================
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT) || "[]"); } catch { return []; } }
  function remember(addr, sym, score) {
    const list = recent().filter((r) => lc(r.a) !== lc(addr));
    list.unshift({ a: addr, s: sym, sc: score, at: Date.now() });
    try { localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 8))); } catch { /* private mode */ }
  }
  let topList = [];
  function miniRing(score) {
    const v = K.verdictOf(score || 0), C = 2 * Math.PI * 15;
    return `<span class="asc-mini v-${v.k}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><circle class="f" cx="18" cy="18" r="15" stroke-dasharray="${(C * Math.max(0.03, score / 100)).toFixed(1)} ${C.toFixed(1)}"/></svg><b data-no-i18n>${score}</b></span>`;
  }
  function shelf() {
    const box = $("asc-shelf");
    if (!box) return;
    const rec = recent().slice(0, 4), w = watched().slice(0, 6);
    const card = (r) => `<button type="button" class="asc-scard" data-t="${esc(r.a)}">${miniRing(r.sc || 0)}<span><b data-no-i18n>$${esc(r.s || "?")}</b><small>${esc(tr(K.verdictOf(r.sc || 0).t))}</small></span></button>`;
    const html = (rec.length ? `<div class="asc-shelf-col"><h3>${esc(tr("Your recent scans"))}</h3><div class="asc-scards">${rec.map(card).join("")}</div></div>` : "")
      + (topList.length ? `<div class="asc-shelf-col"><h3>${esc(tr("Most scanned this week"))}</h3><div class="asc-chips-in">${topList.slice(0, 8).map((t) => `<button type="button" class="asc-chip" data-t="${esc(t.token)}" data-no-i18n>${t.symbol ? "$" + esc(t.symbol) : short(t.token)} <i>${t.scans}</i></button>`).join("")}</div></div>` : "")
      + (w.length ? `<div class="asc-shelf-col"><h3>${esc(tr("Watching"))}</h3><div class="asc-chips-in">${w.map((x) => `<button type="button" class="asc-chip watch${x.alert && Date.now() - x.alert.at < 86400e3 ? " alert" : ""}" data-t="${esc(x.a)}" data-no-i18n title="${esc(x.alert ? x.alert.msg : "")}"><i class="dot"></i>$${esc(x.s)}</button>`).join("")}</div></div>` : "");
    box.hidden = !html;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  function renderChips() {
    const box = $("asc-chips");
    const chips = [];
    if (ARCIRCLE) chips.push({ a: CONFIG.ARCIRCLE_TOKEN, s: "$ARCIRCLE" });
    launches().slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0)).slice(0, 4).forEach((l) => chips.push({ a: l.token, s: "$" + l.symbol }));
    const html = chips.length ? `<span class="asc-chips-l">${esc(tr("Try"))}</span>${chips.map((c) => `<button type="button" class="asc-chip" data-t="${esc(c.a)}" data-no-i18n>${esc(c.s)}</button>`).join("")}` : "";
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ---- donut: pointing at a slice (or its legend line) lights it up ----
  function highlight(k, sticky) {
    const wrap = panel.querySelector(".asc-donut-wrap");
    if (!wrap) return;
    const on = sticky && wrap.dataset.hl === k ? "" : k;
    wrap.dataset.hl = on || "";
    const top = panel.querySelector(".asc-top");
    if (top) top.classList.toggle("lit", on === "top");
  }
  panel.addEventListener("pointerover", (e) => { const seg = e.target.closest && e.target.closest("[data-seg]"); if (seg && e.pointerType === "mouse") highlight(seg.dataset.seg); });
  panel.addEventListener("pointerout", (e) => { const seg = e.target.closest && e.target.closest("[data-seg]"); if (seg && e.pointerType === "mouse" && !(e.relatedTarget && seg.contains(e.relatedTarget))) { const w = panel.querySelector(".asc-donut-wrap"); if (w) w.dataset.hl = ""; const t = panel.querySelector(".asc-top"); if (t) t.classList.remove("lit"); } });

  // ---- "Is this wrong?" on a warning or risk ----
  function reportForm(btn) {
    const row = btn.closest(".asc-row");
    if (row.querySelector(".asc-report-form")) { row.querySelector(".asc-report-form").remove(); return; }
    const f = document.createElement("div");
    f.className = "asc-report-form";
    f.innerHTML = `<textarea maxlength="400" rows="2" placeholder="${esc(tr("What's wrong with this check? (optional)"))}"></textarea><button type="button" data-send-report="${esc(btn.dataset.report)}" data-st="${esc(btn.dataset.st)}">${esc(tr("Send"))}</button>`;
    btn.insertAdjacentElement("afterend", f);
    f.querySelector("textarea").focus();
  }
  async function sendReport(btn) {
    if (!cur) return;
    const f = btn.closest(".asc-report-form"), note = f.querySelector("textarea").value;
    btn.disabled = true;
    let ok = false;
    try {
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scanreport", token: cur.addr, title: btn.dataset.sendReport, status: btn.dataset.st, note, engine: K.CORE_VERSION }) });
      ok = r.ok;
    } catch { ok = false; }
    f.innerHTML = `<p class="asc-hnote">${esc(tr(ok ? "Thanks — we'll look at it." : "Couldn't send that right now — try again later."))}</p>`;
  }

  // ---- embed: a badge any site can show ----
  function embedBox(btn) {
    if (!cur) return;
    const h = $("asc-head");
    let box = h.querySelector(".asc-embed");
    if (box) { box.remove(); return; }
    const url = `${location.origin}/badge/${cur.addr}`, link = `${location.origin}/s/${cur.addr}`;
    const code = `<a href="${link}" target="_blank" rel="noopener"><img src="${url}" alt="ARCIRCLE PAD scan" height="22"></a>`;
    box = document.createElement("div");
    box.className = "asc-embed";
    box.innerHTML = `<div class="asc-embed-top"><b>${esc(tr("Show this score on your site"))}</b><img src="${esc(url)}" alt="" height="22"></div>
      <code data-no-i18n>${esc(code)}</code><div class="asc-embed-foot"><button type="button" data-copy="${esc(code)}">${esc(tr("Copy code"))}</button><span>${esc(tr("The badge updates by itself — it re-scans every few hours."))}</span></div>`;
    h.appendChild(box);
  }

  // =====================================================================
  // Explore cards: a small safety score on every coin (cached server scans)
  // =====================================================================
  (function exploreBadges() {
    const grid = document.getElementById("ap-explore-grid");
    if (!grid) return;
    const cache = new Map();
    let t = 0;
    const paint = (card) => {
      const a = lc(card.dataset.token), d = cache.get(a);
      if (!a || !d || card.querySelector(".asc-cardbadge")) return;
      // the card itself is a button, so the badge is a span that navigates on its own
      const b = document.createElement("span");
      b.className = `asc-cardbadge v-${d.k}`; b.setAttribute("role", "link"); b.tabIndex = 0; b.setAttribute("data-no-i18n", "");
      b.title = tr("Token Scanner score") + ` · ${tr(d.t)}`;
      b.innerHTML = `${SHIELD}<b>${d.score}</b>`;
      const go = (e) => { e.stopPropagation(); e.preventDefault(); location.hash = `#scanner?t=${a}`; };
      b.addEventListener("click", go);
      b.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
      (card.querySelector(".ap-card-top") || card).appendChild(b);
    };
    const run = async () => {
      const cards = [...grid.querySelectorAll(".ap-launch-card[data-token]")].slice(0, 24);
      cards.forEach(paint);
      const need = cards.map((c) => lc(c.dataset.token)).filter((a) => !cache.has(a));
      if (!need.length) return;
      need.forEach((a) => cache.set(a, null));
      const j = await fetchJson(`/api/social?scores=${need.join(",")}`, 15000);
      if (j && j.scores) Object.entries(j.scores).forEach(([a, d]) => cache.set(a, d));
      need.filter((a) => !cache.get(a)).forEach((a) => cache.delete(a)); // try again on a later render
      grid.querySelectorAll(".ap-launch-card[data-token]").forEach(paint);
    };
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(run, 400); }).observe(grid, { childList: true });
    setTimeout(run, 2500);
  })();

  // =====================================================================
  // wiring
  // =====================================================================
  $("asc-form").addEventListener("submit", (e) => { e.preventDefault(); scan($("asc-addr").value); });
  $("asc-addr").addEventListener("paste", () => setTimeout(() => { if (isAddr($("asc-addr").value.trim())) scan($("asc-addr").value); }, 0));
  $("asc-paste").addEventListener("click", async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { $("asc-addr").value = t.trim(); if (isAddr(t.trim())) scan(t); } } catch { $("asc-addr").focus(); }
  });
  panel.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-t]");
    if (t && !t.closest("#asc-form")) { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); scan(t.dataset.t); return; }
    const q = e.target.closest(".asc-q");
    if (q) { const help = q.closest(".asc-row").querySelector(".asc-help"); const open = help.hidden; help.hidden = !open; q.setAttribute("aria-expanded", String(open)); q.classList.toggle("on", open); return; }
    const more = e.target.closest("[data-more]");
    if (more) { const g = more.closest(".asc-group"); g.classList.toggle("open"); more.textContent = g.classList.contains("open") ? tr("Show less") : more.dataset.label; return; }
    const sh = e.target.closest("[data-show]");
    if (sh) { const box = $("asc-checks"); box.classList.toggle("problems", sh.dataset.show === "problems"); box.querySelectorAll("[data-show]").forEach((b) => b.setAttribute("aria-checked", String(b === sh))); return; }
    const tab = e.target.closest(".asc-tabs [data-tab]");
    if (tab) { $("asc-out").dataset.tab = tab.dataset.tab; panel.querySelectorAll(".asc-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === tab))); return; }
    const seg = e.target.closest("[data-seg]");
    if (seg) { highlight(seg.dataset.seg, true); return; }
    const rep = e.target.closest("[data-report]");
    if (rep) { reportForm(rep); return; }
    const sendRep = e.target.closest("[data-send-report]");
    if (sendRep) { sendReport(sendRep); return; }
    const cp = e.target.closest("[data-copy]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); cp.classList.add("ok"); setTimeout(() => cp.classList.remove("ok"), 1200); } catch { /* denied */ } return; }
    const act = e.target.closest("[data-act]");
    if (!act || !cur) return;
    const a = act.dataset.act;
    if (a === "rescan") scan(cur.addr);
    else if (a === "x") shareX();
    else if (a === "card") saveCard();
    else if (a === "link") { try { await navigator.clipboard.writeText(`${location.origin}/s/${cur.addr}`); act.classList.add("ok"); toast(tr("Link copied")); } catch { /* denied */ } }
    else if (a === "watch") toggleWatch();
    else if (a === "embed") embedBox(act);
    else if (a === "compare") {
      if (compareBase && lc(compareBase.addr) !== lc(cur.addr)) { compareMaybe(); $("asc-compare").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); return; }
      compareBase = snapshot();
      toast(tr("Now scan a second token to compare them side by side."));
      $("asc-addr").value = ""; $("asc-addr").focus();
    } else if (a === "uncompare") { compareBase = null; $("asc-compare").hidden = true; head(); }
  });
  function fromHash() {
    const m = /^#scanner\?(?:t|token)=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (m && (!cur || lc(cur.addr) !== lc(m[1]))) scan(m[1]);
  }
  window.addEventListener("hashchange", fromHash);
  document.addEventListener("arcpad:tab", (e) => {
    if (e.detail && e.detail.tab === "scanner") { renderChips(); shelf(); setTimeout(() => { if (!cur && !reduce) $("asc-addr").focus({ preventScroll: true }); }, 250); }
  });
  fetchJson("/api/social?scans=top", 6000).then((j) => { if (j && Array.isArray(j.top)) { topList = j.top; shelf(); } });
  renderChips(); shelf(); fromHash();
  let tries = 0;
  const chipT = setInterval(() => { renderChips(); if (++tries > 10 || launches().length) clearInterval(chipT); }, 1500);
  window.arcScanner = { scan, get state() { return cur; } };
})();
