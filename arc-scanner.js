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
// v2: the launch (snipers, a bundled first block, deployer hand-outs, fresh wallets
// at the top), where the points went, the last server score and its history,
// holders as a bubble map, the creator's other coins with their scores, Telegram
// alerts through the bot, and "Ask ARCIA" about the result.
// v3: a "can't tell" status and a confidence level, critical flags apart from the score,
// section scores, dry-run sells at three sizes + a new buyer's sell + two sells in a row,
// who really controls a proxy / owner, published source, same-code tokens, copycat
// tickers, linked wallets, who trades, the deployer's other contracts, a plain-words
// summary and a source chip on every check. The Plus / Pro tools live in arc-scanner-x.js.
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
  const io = { rpc: (m, p) => readProvider().send(m, p), rpcSim, fetchJson, keccak: (h) => ethers.keccak256(String(h).startsWith("0x") ? h : "0x" + h),
    // published source code: the server asks the explorer (and keeps the answer a day)
    source: async (a, impl) => { const j = await fetchJson(`/api/scan?src=${a}${impl ? `&impl=${impl}` : ""}`, 12000); return j && typeof j.verified === "boolean" ? j : null; } };
  const within = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
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
  const STEPS = [["contract", "Reading the contract"], ["extras", "Checking who controls it and its code"], ["market", "Looking for trading pools and copycats"], ["holders", "Counting holders and linked wallets"], ["trade", "Dry-run buys and sells at three sizes"]];

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
    // the server's last score for it (instant, and it keeps the daily history)
    fetchJson(`/api/social?scores=${lc(addr)}`, 12000).then((j) => {
      if (!alive() || !j || !j.scores) return;
      cur.server = j.scores[lc(addr)] || null;
      paintServer();
    });
    const mark = (part, ok) => { if (!alive()) return; cur.done[part] = true; stepDone(part, ok); paint(); };

    // 1. contract (everything else needs to know it's a token)
    try { cur.c = await K.readContract(io, addr); } catch (e) { console.warn("scanner", e); if (alive()) { progress(false); $("asc-go").disabled = false; message("Couldn't read that address from Arc right now — try again in a moment."); } return; }
    if (!alive()) return;
    if (!cur.c.contract) { progress(false); $("asc-go").disabled = false; walletMode(addr); return; }
    mark("contract", true);
    if (!cur.c.token) { PARTS.forEach((p) => { cur.done[p] = true; }); return finish(); }

    // 2. the rest side by side; each paints as it lands
    const xP = Promise.all([K.readArcPad(io, addr).catch(() => null), K.readArgus(io, addr).catch(() => null), K.readLocks(io, addr).catch(() => null),
      within(K.readSource(io, addr, cur.c.proxy && cur.c.proxy.impl), 12000),
      cur.c.fp ? fetchJson(`/api/scan?fp=${cur.c.fp}&t=${lc(addr)}`, 8000) : null])
      .then(([arcpad, argus, locks, src, clones]) => { if (!alive()) return; cur.x = { arcpad, argus, locks }; cur.src = src; cur.clones = clones; mark("extras", true); });
    io.rpc("eth_blockNumber", []).then((b) => { if (alive()) cur.block = parseInt(b, 16); }).catch(() => null);
    const mP = K.readMarket(io, addr).catch(() => null).then(async (m) => {
      await xP;
      if (!alive()) return;
      if ((!m || !m.pairs.length) && (cur.x.arcpad || cur.x.argus)) m = (await marketFallback(addr, cur.x)) || m;
      cur.copies = await within(K.readCopies(io, addr, cur.c.symbol), 8000);
      cur.m = m; mark("market", !!m);
    });
    // the Liquidity Manager's read of the pool: how much of its liquidity is locked (lands whenever it's ready)
    (async () => {
      for (let i = 0; i < 6 && alive(); i++) {
        const j = await fetch(`/api/social?liq=${addr}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!j || !alive()) return;
        if (j.done) { cur.lp = K.lpSummary ? K.lpSummary(j) : null; cur.lpTried = true; if (cur.res) paint(); return; }
      }
      if (alive()) { cur.lpTried = true; if (cur.res && cur.final) paint(); }
    })();
    const hP = fetchHolders(addr, cur.c.symbol).then((h) => { if (alive()) { cur.h = h; mark("holders", true); } }, (e) => { console.warn("scanner holders", e); if (alive()) mark("holders", false); });
    await Promise.all([xP, hP]);
    if (!alive()) return;
    // the deployer's other contracts (explorer, via the server), side by side with the dry runs
    const depAddr = (cur.h && cur.h.deployer) || (cur.x.arcpad && cur.x.arcpad.creator) || (cur.x.argus && cur.x.argus.creator) || null;
    const dP = depAddr ? fetchJson(`/api/scan?dep=${lc(depAddr)}&not=${lc(addr)}`, 12000).then((j) => { if (alive()) cur.dep = j && !j.unknown && j.addr ? j : null; }) : Promise.resolve();
    // 3. dry-run trades need a holder to act as
    cur.sim = await K.simulateFor(io, addr, cur.c, cur.h).catch(() => null);
    await within(dP, 6000);
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
    unknown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.6M12 17h.01"/></svg>',
  };
  const GROUPS = [["contract", "Contract", ["contract", "extras"]], ["control", "Who controls it", ["contract", "extras"]], ["trade", "Trading", ["trade", "extras"]],
    ["market", "Market", ["market"]], ["holders", "Holders", ["holders"]], ["early", "Launch", ["holders"]], ["history", "History", ["holders"]]];
  // the six sections of the score (the bars in the result's header) and the check groups under each
  const SECTIONS = (K.SECTIONS || []).map(([k, t]) => [k, t, k === "launch" ? ["early", "history"] : [k]]);
  const SRC = { chain: "On-chain", sim: "Dry run", dex: "Dexscreener", explorer: "Explorer", index: "Scanner index" };
  const MISSING = { sell: "the dry-run sell", market: "market data", holders: "holders", source: "the source code", lp: "liquidity locks" };
  const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/></svg>';
  const fill = (p) => { const t = tr(p.t); return p.x == null ? t : t.replace("{x}", p.x); };

  function shell() {
    const out = $("asc-out");
    out.classList.remove("in");
    out.dataset.tab = "checks";
    out.innerHTML = `
      <div class="asc-card asc-head is-loading" id="asc-head">
        <div class="asc-scanline" aria-hidden="true"></div>
        <div class="asc-id"><span class="asc-logo ph skel"></span><div class="asc-id-txt"><h2><span class="skel-line w60"></span></h2><span class="skel-line w40"></span></div></div>
        <div class="asc-verdict"><div class="asc-gauge"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="asc-g-track" cx="60" cy="60" r="52"/><circle class="asc-g-fill" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7"/><g class="asc-g-ticks">${Array.from({ length: 20 }, (_, i) => `<line x1="60" y1="3" x2="60" y2="${i % 5 ? 7 : 10}" transform="rotate(${i * 18} 60 60)"/>`).join("")}</g><line class="asc-needle" x1="92" y1="60" x2="113" y2="60"/></svg><div class="asc-g-mid"><b class="asc-score" data-no-i18n>…</b><small>/ 100</small></div></div>
          <div class="asc-v-txt"><strong class="asc-vtitle">${esc(tr("Scanning…"))}</strong><div class="asc-crit" hidden></div><div class="asc-reasons"></div><div class="asc-counts"></div></div></div>
        <p class="asc-summary" hidden></p>
        <div class="asc-quick" hidden></div>
        <div class="asc-sections" hidden></div>
        <div class="asc-actions" hidden></div>
      </div>
      <nav class="asc-tabs" role="tablist" aria-label="${esc(tr("Result sections"))}">
        ${[["checks", "Checks"], ["tools", "Tools"], ["market", "Market"], ["holders", "Holders"], ["history", "History"]].map(([k, t], i) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${i === 0}">${esc(tr(t))}</button>`).join("")}
      </nav>
      <div class="asc-compare" id="asc-compare" hidden></div>
      <div class="asc-tiles" id="asc-tiles"></div>
      <div class="asc-x" id="asc-x"></div>
      <div class="asc-grid">
        <div class="asc-checks problems" id="asc-checks">
          <div class="asc-checks-bar"><span>${esc(tr("Checks"))}</span><div class="asc-toggle" role="radiogroup"><button type="button" role="radio" aria-checked="true" data-show="problems">${esc(tr("Problems first"))}</button><button type="button" role="radio" aria-checked="false" data-show="all">${esc(tr("Show everything"))}</button></div></div>
          ${GROUPS.map(([g, t]) => `<section class="asc-card asc-group is-pending" data-g="${g}" id="asc-g-${g}"><h3><span>${esc(tr(t))}</span><em class="st-wait">${esc(tr("Checking…"))}</em></h3><div class="asc-group-body"><div class="asc-skel-rows"><i></i><i></i></div></div></section>`).join("")}
        </div>
        <aside class="asc-side" id="asc-side">
          <div class="asc-card asc-holders is-pending" id="asc-holders"><h3>${esc(tr("Holders"))}</h3><div class="asc-donut-skel"></div></div>
        </aside>
      </div>`;
  }

  function paint(historyOnly) {
    if (!cur || !cur.c) return;
    const d = cur.done;
    cur.res = K.evaluate(cur.addr, { c: cur.c, x: cur.x, m: cur.m, h: cur.h, sim: cur.sim, lp: cur.lp || null, lpTried: !!cur.lpTried,
      src: cur.src || null, copies: cur.copies || null, clones: cur.clones || null, dep: cur.dep || null, block: cur.block || null });
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
      const worst = rows.some((r) => r.status === "risk") ? "risk" : rows.some((r) => r.status === "warn") ? "warn" : rows.some((r) => r.status === "unknown") ? "unknown" : "pass";
      const ok = rows.filter((r) => r.status === "pass" || r.status === "info").length;
      const lbl = worst === "pass" ? (ok === 1 ? "Show 1 check" : `Show ${ok} checks`) : ok === 1 ? "Show 1 passed check" : `Show ${ok} passed checks`;
      // problems first inside the group too
      const order = { risk: 0, warn: 1, unknown: 2, info: 3, pass: 4 };
      const sorted = rows.map((r, i) => [r, i]).sort((a, b) => order[a[0].status] - order[b[0].status] || a[1] - b[1]).map(([r]) => r);
      const html = `<h3><span>${esc(tr(GROUPS.find((x) => x[0] === g)[1]))}</span><em class="st-${worst}">${esc(tr(worst === "pass" ? "All good" : worst === "warn" ? "Worth a look" : worst === "unknown" ? "Couldn't check" : "Risk found"))}</em></h3>
        <ul>${sorted.map((r, i) => rowHtml(r, i)).join("")}</ul>
        ${ok ? `<button type="button" class="asc-more" data-more data-label="${esc(tr(lbl))}"><i aria-hidden="true"></i>${esc(tr(lbl))}</button>` : ""}`;
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
      const rank = { risk: 0, warn: 1, unknown: 2, pass: 3 };
      panel.querySelectorAll(".asc-group").forEach((s, i) => { s.style.order = String((rank[s.dataset.worst] ?? 3) * 10 + i); });
      document.dispatchEvent(new CustomEvent("arcscan:result", { detail: { cur } }));
    }
  }
  function rowHtml(r, i) {
    const help = K.HELP[r.id] || "";
    const addr = r.addr ? `<a class="asc-addr" href="${ex("address", r.addr)}" target="_blank" rel="noopener" data-no-i18n style="--h:${hueOf(r.addr)}"><i></i>${short(r.addr)}</a>` : "";
    const links = (r.links || []).map((l) => `<a href="${esc(l.href)}"${l.internal ? "" : ' target="_blank" rel="noopener nofollow"'} class="asc-link"${l.internal ? "" : " data-no-i18n"}>${esc(l.internal ? tr(l.label) : l.label)}${l.internal ? " →" : " ↗"}</a>`).join("");
    const code = r.code ? `<a href="${ex("address", cur.addr)}#code" target="_blank" rel="noopener" class="asc-link">${esc(tr(r.code.label))} ↗</a>` : "";
    const src = r.src && SRC[r.src] ? `<em class="asc-src s-${r.src}" title="${esc(tr("Where this answer comes from"))}">${esc(tr(SRC[r.src]))}</em>` : "";
    const retry = r.status === "unknown" ? `<button type="button" class="asc-retry" data-retry="${esc(r.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>${esc(tr("Try again"))}</button>` : "";
    return `<li class="asc-row st-${r.status}${r.crit ? " crit" : ""}" style="--i:${i}">
      <span class="asc-ico" title="${esc(tr({ pass: "OK", warn: "Warning", risk: "Risk", info: "Note", unknown: "Couldn't check" }[r.status]))}">${ICON[r.status] || ICON.info}</span>
      <div class="asc-row-main">
        <div class="asc-row-top"><b>${esc(tr(r.title))}</b>${r.crit ? `<em class="asc-critb">${esc(tr("Critical"))}</em>` : ""}${r.pts ? `<em class="asc-pts" data-no-i18n>−${r.pts}</em>` : ""}${r.est ? `<em class="asc-est">${esc(tr("From the code"))}</em>` : ""}${src}${help ? `<button type="button" class="asc-q" aria-expanded="false" aria-label="${esc(tr("What does this mean?"))}">?</button>` : ""}</div>
        ${r.pre || addr || r.detail || r.note || links || code ? `<p>${r.pre ? `<span>${esc(tr(r.pre))}</span> ` : ""}${addr}${r.detail ? ` <span>${esc(tr(r.detail))}</span>` : ""}${r.note ? ` <span class="asc-note">${esc(tr(r.note))}</span>` : ""}${links || code ? ` <span class="asc-links-in">${links}${code}</span>` : ""}</p>` : ""}
        ${r.lp ? lpBar(r.lp) : ""}
        ${help ? `<p class="asc-help" hidden>${esc(tr(help))}</p>` : ""}
        ${retry}
        ${r.status === "risk" || r.status === "warn" ? `<button type="button" class="asc-report" data-report="${esc(r.title)}" data-st="${r.status}">${esc(tr("Is this wrong?"))}</button>` : ""}
      </div></li>`;
  }
  // locked / burned / free liquidity as one bar, and a countdown to the earliest unlock
  function lpBar(lp) {
    const left = lp.soonest ? lp.soonest - Date.now() / 1000 : null;
    return `<div class="asc-lpbar" role="img" aria-label="${esc(tr("Locked"))} ${K.pct(lp.locked)}, ${esc(tr("Burned"))} ${K.pct(lp.burned)}, ${esc(tr("Free to pull"))} ${K.pct(lp.free)}">
      <div class="bar"><i class="l" style="--w:${lp.locked}%"></i><i class="b" style="--w:${lp.burned}%"></i><i class="f" style="--w:${lp.free}%"></i></div>
      <div class="key"><span class="l">${esc(tr("Locked"))} <b data-no-i18n>${K.pct(lp.locked)}</b></span><span class="b">${esc(tr("Burned"))} <b data-no-i18n>${K.pct(lp.burned)}</b></span><span class="f">${esc(tr("Free to pull"))} <b data-no-i18n>${K.pct(lp.free)}</b></span>
      ${lp.forever ? `<span class="t">${esc(tr("Locked for good"))}</span>` : left != null && left > 0 ? `<span class="t" data-countdown="${lp.soonest}">${esc(tr("Next unlock in"))} <b data-no-i18n>${K.ageText(left)}</b></span>` : ""}</div></div>`;
  }

  // ---- the header: verdict, critical flags, confidence, plain words, quick facts, section scores, actions ----
  function quickFacts(res) {
    const L = (cur.sim && cur.sim.legs) || {};
    const s0 = (L.sell || [])[0], b0 = (L.buy || [])[0], f = L.fresh;
    const launchpad = !!(cur.x.arcpad || cur.x.argus || lc(cur.addr) === ARCIRCLE);
    let sell;
    if ((s0 && !s0.ok) || (f && f.ok1 && !f.ok2)) sell = ["risk", "Sell fails", ICON.risk];
    else if (s0 && s0.ok) sell = ["pass", "Can sell", ICON.pass];
    else if (launchpad) sell = ["pass", "Launchpad template", ICON.pass];
    else sell = ["unknown", "Sell not tested", ICON.unknown];
    let tax = null;
    const ag = cur.x.argus;
    if (ag) tax = Math.max(ag.buyTaxBps, ag.sellTaxBps) / 100;
    if (s0 && s0.ok) tax = Math.max(tax || 0, s0.tax || 0);
    if (b0 && b0.ok) tax = Math.max(tax || 0, b0.tax || 0);
    if (cur.x.arcpad && cur.x.arcpad.extraFeeBps != null) tax = Math.max(tax || 0, 1 + cur.x.arcpad.extraFeeBps / 100);
    const m = res.market, lpRow = res.rows.find((r) => r.id === "lplock");
    const liqSafe = lpRow && lpRow.lp ? lpRow.lp.locked + lpRow.lp.burned : null;
    const d = res.dist;
    const t10 = d && d.S ? (d.top10 / d.S) * 100 : null;
    const chip = (st, label, val, ico) => `<div class="asc-qf st-${st}"><span class="i">${ico || ""}</span><small>${esc(tr(label))}</small><b data-no-i18n>${val}</b></div>`;
    return [
      chip(sell[0], "Selling", esc(tr(sell[1])), sell[2]),
      chip(tax == null ? "unknown" : tax >= 25 ? "risk" : tax >= 10 ? "warn" : "pass", "Tax per trade", tax == null ? "—" : K.pct(tax)),
      chip(!m || m.liq == null ? "unknown" : m.liq < 1000 ? "risk" : m.liq < 10000 ? "warn" : "pass", "Liquidity", `${m && m.liq != null ? K.usd(m.liq) : "—"}${liqSafe != null ? ` · ${K.pct(liqSafe)} ${esc(tr("locked"))}` : ""}`),
      chip(t10 == null ? "unknown" : t10 > 50 ? "risk" : t10 > 30 ? "warn" : "pass", "Top 10 wallets", t10 == null ? "—" : K.pct(t10)),
    ].join("");
  }
  function sectionBars(res) {
    return SECTIONS.map(([k, t]) => {
      const s = res.sub && res.sub[k];
      if (!s) return "";
      const v = s.score, st = v == null ? "unknown" : v >= 75 ? "ok" : v >= 45 ? "care" : "risk";
      return `<button type="button" class="asc-secbar v-${st}" data-jump="${k}" style="--w:${v == null ? 0 : v}%"><span>${esc(tr(t))}</span><i><b></b></i><em data-no-i18n>${v == null ? "?" : v}</em>${s.risk || s.warn ? `<small data-no-i18n>${s.risk ? `${s.risk}✕` : ""}${s.risk && s.warn ? " " : ""}${s.warn ? `${s.warn}!` : ""}</small>` : ""}</button>`;
    }).join("");
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
        <button type="button" class="asc-ca" data-copy="${esc(cur.addr)}" title="${esc(tr("Copy address"))}" data-no-i18n>${short(cur.addr)}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/></svg><svg class="ok" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg></button>
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
    h.className = `asc-card asc-head asc-v-${v.k}${res.score >= 90 ? " asc-glow" : ""}${h.classList.contains("revealed") ? " revealed" : ""}`;
    const counts = { pass: 0, warn: 0, risk: 0, unknown: 0 };
    res.rows.forEach((r) => { if (counts[r.status] != null) counts[r.status]++; });
    h.querySelector(".asc-vtitle").innerHTML = `${esc(tr(v.t))}<span class="asc-conf c-${res.confidence}" title="${esc(res.missing && res.missing.length ? tr("Couldn't read:") + " " + res.missing.map((x) => tr(MISSING[x] || x)).join(", ") : tr("Every key part was read"))}">${esc(tr("Confidence"))}: <b>${esc(tr({ high: "High", medium: "Medium", low: "Low" }[res.confidence] || "—"))}</b></span>`;
    const crit = h.querySelector(".asc-crit");
    crit.hidden = !(res.critical && res.critical.length);
    crit.innerHTML = (res.critical || []).map((x, i) => `<span class="asc-critp" style="--i:${i}">${ICON.risk}<small>${esc(tr("Critical"))}</small>${esc(tr(x.title))}</span>`).join("");
    h.querySelector(".asc-reasons").innerHTML = res.reasons.filter((r) => !(res.critical || []).some((c2) => c2.title === r.title)).map((r, i) => `<span class="asc-reason st-${r.status}" style="--i:${i}">${ICON[r.status]}${esc(tr(r.title))}</span>`).join("");
    const sum = h.querySelector(".asc-summary");
    sum.hidden = !(res.summary && res.summary.length);
    sum.innerHTML = `<i aria-hidden="true">${SHIELD}</i><span>${(res.summary || []).map((p) => esc(fill(p))).join(" ")}</span>`;
    const q = h.querySelector(".asc-quick"); q.hidden = false; q.innerHTML = quickFacts(res);
    const secs = h.querySelector(".asc-sections"); secs.hidden = false;
    secs.innerHTML = `<div class="asc-sec-h"><span>${esc(tr("Where the points went"))}</span>${res.cap < 100 && res.score === res.cap ? `<em>${esc(tr("Capped at"))} <b data-no-i18n>${res.cap}</b></em>` : ""}</div><div class="asc-secbars">${sectionBars(res)}</div>`;
    paintServer();
    h.querySelector(".asc-counts").innerHTML = `<span class="c-pass">${counts.pass} ${esc(tr("OK"))}</span><span class="c-warn">${counts.warn} ${esc(tr(counts.warn === 1 ? "warning" : "warnings"))}</span><span class="c-risk">${counts.risk} ${esc(tr(counts.risk === 1 ? "risk" : "risks"))}</span>${counts.unknown ? `<span class="c-unknown">${counts.unknown} ${esc(tr("couldn't check"))}</span>` : ""}`
      + `<span class="asc-when">${esc(tr("Scanned"))} <time data-no-i18n>${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</time>${res.block ? ` · <span data-no-i18n>#${res.block.toLocaleString("en-US")}</span>` : ""}</span>`;
    const watching = watched().some((w) => lc(w.a) === lc(cur.addr));
    const acts = h.querySelector(".asc-actions");
    acts.hidden = false;
    acts.innerHTML = actionsHtml(watching);
  }
  function actionsHtml(watching) {
    return `
      <button type="button" data-act="rescan"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>${esc(tr("Scan again"))}</button>
      <button type="button" data-act="x"><svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.8l7.7-8.8L1.3 2.5h6.8l4.7 6.1zm-1.2 17h1.8L7.1 4.4H5.2z"/></svg>${esc(tr("Share on X"))}</button>
      <button type="button" data-act="card"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="m3.5 15 5-4.5 4 3.5 3-2.5 5 4"/></svg>${esc(tr("Save card"))}</button>
      <button type="button" data-act="link"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>${esc(tr("Copy link"))}</button>
      <button type="button" data-act="watch" aria-pressed="${watching}"><svg viewBox="0 0 24 24" aria-hidden="true" class="bell"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>${esc(tr(watching ? "Watching" : "Watch"))}</button>
      <button type="button" data-act="tg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11l6 2.2M21 4l-3.5 16-6.5-5.5M21 4 9 13.2v5.3l2.8-3.5"/></svg>${esc(tr("Telegram alerts"))}</button>
      <button type="button" data-act="arcia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/></svg>${esc(tr("Ask ARCIA"))}</button>
      <button type="button" data-act="agent"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>${esc(tr("ARCIA AGENT"))}</button>
      <button type="button" data-act="orders"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v17"/><path d="M9.5 7H5M9.5 11H3.5M9.5 15H6"/><path d="M14.5 9H19M14.5 13H20.5M14.5 17H17.5"/></svg>${esc(tr("Limit order"))}</button>
      <button type="button" data-act="embed"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/></svg>${esc(tr("Embed badge"))}</button>
      <button type="button" data-act="report"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/></svg>${esc(tr("Freeze a report"))}<em class="asc-tier t-p2">Plus</em></button>
      <button type="button" data-act="compare"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M16 4v16M4 8h8M12 16h8"/></svg>${esc(tr(compareBase && lc(compareBase.addr) !== lc(cur.addr) ? "Compare" : "Compare with…"))}</button>`;
  }
  // the ring fills while its colour runs red → amber → green to where the score lands; the needle follows
  function gaugeAt(s) {
    const h = $("asc-head");
    if (!h) return;
    const sc = h.querySelector(".asc-score"), fill = h.querySelector(".asc-g-fill"), nd = h.querySelector(".asc-needle"), C = 326.7;
    const cl = Math.max(0, Math.min(104, s)), hue = Math.round(4 + (Math.min(100, cl) / 100) * 136);
    fill.style.strokeDashoffset = String(C * (1 - Math.max(0.02, Math.min(1, cl / 100))));
    fill.style.stroke = `hsl(${hue} 90% 58%)`; fill.style.filter = `drop-shadow(0 0 8px hsl(${hue} 90% 58% / .6))`;
    if (nd) nd.style.transform = `rotate(${(cl / 100) * 360}deg)`;
    sc.textContent = String(Math.max(0, Math.min(100, Math.round(s))));
  }
  // the server's own last score, and one score per day since
  function paintServer() {
    const h = $("asc-head");
    if (!h || !cur) return;
    const sv = cur.server;
    let box = h.querySelector(".asc-server");
    if (!sv || sv.score == null) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.className = "asc-server"; h.querySelector(".asc-v-txt").appendChild(box); }
    const ago = sv.at ? K.ageText(Math.max(60, (Date.now() - sv.at) / 1000)) : null;
    const pts = (sv.hist || []).map((x) => { const [d, v] = String(x).split("|"); return { d, v: Number(v) }; }).filter((x) => isFinite(x.v));
    if (cur.final && cur.res && !cur.res.notToken) { const today = new Date().toISOString().slice(0, 10); if (!pts.length || pts[pts.length - 1].d !== today) pts.push({ d: today, v: cur.res.score }); else pts[pts.length - 1].v = cur.res.score; }
    let spark = "";
    if (pts.length >= 2) {
      const W = 150, H = 30, xs = (i) => ((i / (pts.length - 1)) * W).toFixed(1), ys = (v) => (H - 3 - (v / 100) * (H - 6)).toFixed(1);
      spark = `<svg class="asc-hist" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${ys(75)}" y2="${ys(75)}" class="g"/><line x1="0" x2="${W}" y1="${ys(45)}" y2="${ys(45)}" class="g"/><polyline points="${pts.map((p, i) => `${xs(i)},${ys(p.v)}`).join(" ")}"/><circle cx="${xs(pts.length - 1)}" cy="${ys(pts[pts.length - 1].v)}" r="2.6"/></svg>`;
    }
    box.innerHTML = `${spark}<small>${pts.length >= 2 ? `${esc(tr("Score over time"))} · <span data-no-i18n>${esc(pts[0].d.slice(5))} → ${esc(pts[pts.length - 1].d.slice(5))}</span>` : `${esc(tr("Last server scan"))}: <b data-no-i18n>${sv.score}</b>${ago ? ` · <span data-no-i18n>${esc(ago)}</span> ${esc(tr("ago"))}` : ""}`}</small>`;
  }
  function reveal() {
    const h = $("asc-head");
    if (!h || !cur || !cur.res) return;
    const res = cur.res;
    const g = h.querySelector(".asc-gauge");
    const to = res.score;
    cur.shown = to;
    if (reduce) gaugeAt(to);
    else {
      // ease out with a small overshoot, like a needle settling
      const t0 = performance.now(), c1 = 1.4, c3 = c1 + 1;
      const step = (t) => { const k = Math.min(1, (t - t0) / 1300), e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); gaugeAt(to * e); if (k < 1) requestAnimationFrame(step); else { gaugeAt(to); stamp(); } };
      gaugeAt(0); requestAnimationFrame(step);
    }
    g.classList.add("in");
    // change since the last time this browser scanned it
    if (cur.prevScore != null && cur.prevScore !== to) {
      const d = to - cur.prevScore, chip = document.createElement("span");
      chip.className = "asc-delta " + (d > 0 ? "up" : "down"); chip.setAttribute("data-no-i18n", "");
      chip.innerHTML = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${d > 0 ? "M6 2.5 10 8H2z" : "M6 9.5 10 4H2z"}"/></svg>${Math.abs(d)}`;
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
    const k = cur.res.verdict.k;
    const s = document.createElement("div");
    s.className = "asc-stamp v-" + k; s.setAttribute("aria-hidden", "true");
    s.innerHTML = `${k === "ok" ? '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' : k === "risk" ? '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M12 6v8M12 18h.01"/></svg>'}<span>${esc(tr(cur.res.verdict.t))}</span>`;
    h.appendChild(s);
    h.classList.add("revealed", "rv-" + k);
    if (k === "risk" || (cur.res.critical && cur.res.critical.length)) haptic("sell");
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
    // trade tax: the Argus record, else the dry-run trades
    const ag = cur && cur.x && cur.x.argus;
    const legs = cur && cur.sim && cur.sim.legs;
    const lb = legs && (legs.buy || [])[0], ls = legs && (legs.sell || [])[0];
    const tax = ag ? (ag.buyTaxBps === ag.sellTaxBps ? K.pct(ag.buyTaxBps / 100) : `${K.pct(ag.buyTaxBps / 100)} / ${K.pct(ag.sellTaxBps / 100)}`)
      : (lb && lb.ok) || (ls && ls.ok) ? `${lb && lb.ok ? K.pct(lb.tax || 0) : "—"} / ${ls && ls.ok ? K.pct(ls.tax || 0) : "—"}` : null;
    if (tax) list.push(["Tax buy / sell", tax]);
    const hist = (cur && cur.h && cur.h.hist) || [];
    if (hist.length >= 2) { const dN = hist[hist.length - 1].n - hist[hist.length - 2].n; list.push(["Holders, last day", `<span class="${dN >= 0 ? "asc-b" : "asc-s"}">${dN >= 0 ? "+" : "−"}${Math.abs(dN).toLocaleString("en-US")}</span>`]); }
    // exact values on hover for the shortened ones
    const exact = { "Market cap": m.mcap, Liquidity: m.liq, "24h volume": m.vol, Price: m.price };
    const html = list.map(([k, v, extra], i) => `<div style="--i:${i}"${exact[k] != null && isFinite(exact[k]) ? ` title="${esc("$" + Number(exact[k]).toLocaleString("en-US", { maximumFractionDigits: exact[k] < 1 ? 10 : 2 }))}"` : ""}><small>${esc(tr(k))}</small><b data-no-i18n>${v}</b>${extra || ""}</div>`).join("");
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
    const view = box.dataset.view || "chart";
    const html = `<h3>${esc(tr("Holders"))}<span class="asc-hview" role="radiogroup"><button type="button" role="radio" data-hview="chart" aria-checked="${view === "chart"}">${esc(tr("Chart"))}</button><button type="button" role="radio" data-hview="map" aria-checked="${view === "map"}">${esc(tr("Map"))}</button></span></h3>
      ${view === "map" ? bubbleMap(d) : ""}
      <div class="asc-donut-wrap"${view === "map" ? " hidden" : ""}><svg class="asc-donut" viewBox="0 0 120 120" aria-hidden="true"><circle class="d-track" cx="60" cy="60" r="${R}"/>${arcs}</svg>
        <div class="asc-donut-mid"><b data-no-i18n>${d.exact ? "" : "≥"}${(d.holders || 0).toLocaleString("en-US")}</b><small>${esc(tr("holders"))}</small></div>
        <ul class="asc-legend">${vis.map(([k, t, v]) => `<li class="d-${k}" data-seg="${k}" tabindex="0"><i></i><span>${esc(tr(t))}</span><b data-no-i18n>${K.pct(v)}</b></li>`).join("")}</ul></div>
      ${growth()}
      <h4>${esc(tr("Largest wallets"))}</h4><ol class="asc-top">${people}</ol>
      ${more ? `<p class="asc-more-hist"><i></i>${esc(tr("Reading older history…"))}</p>` : ""}
      <p class="asc-hnote">${esc(tr(d.complete ? "From the token's full transfer history; balances read live." : "From recent transfer history; balances read live."))}</p>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; box.classList.remove("is-pending"); }
    earlyCard(d);
  }
  // ---- bubble map: every large wallet as a circle sized by its share; the
  // deployer, snipers, hand-outs and fresh wallets coloured; lines from the
  // deployer to the wallets it handed tokens to ----
  function bubbleMap(d) {
    const S = d.S, e = d.early || null;
    const tag = new Map();
    ((e && e.top) || []).forEach(([a, , k]) => tag.set(lc(a), k === "s" ? "snipe" : "hand"));
    const items = [];
    if (d.inPool > 0) items.push({ k: "pool", t: tr("Pool"), v: d.inPool });
    if (d.burned > 0) items.push({ k: "burn", t: tr("Burned"), v: d.burned });
    if (d.locked > 0) items.push({ k: "lock", t: tr("Locked"), v: d.locked });
    d.people.forEach((p) => items.push({ k: p.deployer ? "dep" : tag.get(lc(p.a)) || (p.contract ? "con" : p.nonce != null && p.nonce <= 2 ? "fresh" : "hold"), t: short(p.a), v: p.v, a: p.a }));
    ((e && e.top) || []).forEach(([a, v, k]) => { if (!items.some((x) => lc(x.a || "") === lc(a))) items.push({ k: k === "s" ? "snipe" : "hand", t: short(a), v: K.units(v, cur.c.decimals), a }); });
    if (!items.length) return "";
    const W = 300, H = 220, maxV = Math.max(...items.map((x) => x.v)) || 1;
    items.sort((a, b) => b.v - a.v);
    // spiral packing: each circle goes to the first free spot along a spiral from the middle
    const placed = [];
    items.slice(0, 26).forEach((it, i) => {
      const r = Math.max(5, Math.sqrt(it.v / maxV) * 46);
      let x = W / 2, y = H / 2, ang = 0, rad = 0;
      for (let k = 0; k < 900; k++) {
        const hit = placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 2.5);
        if (!hit && x - r > 2 && x + r < W - 2 && y - r > 2 && y + r < H - 2) break;
        ang += 0.35; rad += 0.45; x = W / 2 + Math.cos(ang) * rad * 1.35; y = H / 2 + Math.sin(ang) * rad * 0.95;
      }
      placed.push({ ...it, x, y, r, i });
    });
    const dep = placed.find((p) => p.k === "dep");
    const lines = dep ? placed.filter((p) => p.k === "hand").map((p) => `<line x1="${dep.x.toFixed(1)}" y1="${dep.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`).join("") : "";
    // linked wallets (v3): a coloured ring per group and dashed lines between its members
    const groupOf = new Map();
    (d.clusters || []).forEach((cl, gi) => cl.members.forEach((a) => groupOf.set(lc(a), gi)));
    placed.forEach((p) => { if (p.a && groupOf.has(lc(p.a))) p.cl = groupOf.get(lc(p.a)); });
    const clLines = (d.clusters || []).map((cl, gi) => { const ms = placed.filter((p) => p.cl === gi); return ms.slice(1).map((p) => `<line class="cl cl-${gi}" x1="${ms[0].x.toFixed(1)}" y1="${ms[0].y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`).join(""); }).join("");
    const LBL = { pool: "Pool", burn: "Burned", lock: "Locked", dep: "Deployer", snipe: "Sniper", hand: "Got a hand-out", fresh: "Fresh wallet", con: "Contract", hold: "Holder" };
    const kinds = [...new Set(placed.map((p) => p.k))];
    const nCl = new Set(placed.filter((p) => p.cl != null).map((p) => p.cl)).size;
    return `<div class="asc-bmap"><div class="asc-bmap-zoom"><button type="button" data-bz="in" aria-label="${esc(tr("Zoom in"))}">+</button><button type="button" data-bz="out" aria-label="${esc(tr("Zoom out"))}">−</button><button type="button" data-bz="reset" aria-label="${esc(tr("Reset"))}">⟲</button></div>
      <svg viewBox="0 0 ${W} ${H}" data-vb="0 0 ${W} ${H}" role="img" aria-label="${esc(tr("Holders as bubbles"))}"><g class="ln">${lines}${clLines}</g>${placed.map((p) => `<g class="b k-${p.k}${p.cl != null ? ` in-cl cl-${p.cl}` : ""}" style="--i:${p.i}"${p.a ? ` data-ba="${esc(p.a)}" data-bk="${p.k}" data-bv="${(p.v / S) * 100}"${p.cl != null ? ` data-bc="${p.cl}"` : ""} tabindex="0"` : ""}><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}"><title>${esc(p.t)} · ${K.pct((p.v / S) * 100)} · ${esc(tr(LBL[p.k]))}</title></circle>${p.r > 15 ? `<text x="${p.x.toFixed(1)}" y="${(p.y + 3.5).toFixed(1)}" text-anchor="middle">${K.pct((p.v / S) * 100)}</text>` : ""}</g>`).join("")}</svg>
      <ul class="asc-bmap-key">${kinds.map((k) => `<li class="k-${k}"><i></i>${esc(tr(LBL[k]))}</li>`).join("")}${nCl ? `<li class="k-cl"><i></i>${esc(tr("Linked group"))}</li>` : ""}</ul>
      <div class="asc-bmap-info" hidden></div></div>`;
  }
  // ---- the first minutes of trading ----
  function earlyCard(d) {
    const side = $("asc-side");
    if (!side || !cur) return;
    let box = $("asc-early");
    const e = d && d.early;
    if (!e) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.className = "asc-card asc-early"; box.id = "asc-early"; const dep = $("asc-deployer"); side.insertBefore(box, dep || $("asc-timeline") || null); }
    const S = d.S, dec = cur.c.decimals;
    const sev = e.heldPct >= 25 ? "risk" : e.heldPct >= 10 || e.sameBlock >= 5 || e.handout >= 5 ? "warn" : "ok";
    const rows = (e.top || []).slice(0, 6).map(([a, v, k]) => `<li><span class="t t-${k === "s" ? "s" : "h"}">${esc(tr(k === "s" ? "Sniper" : "Hand-out"))}</span><a href="${ex("address", a)}" target="_blank" rel="noopener" data-no-i18n>${short(a)}</a><b data-no-i18n>${K.pct((K.units(v, dec) / S) * 100)}</b></li>`).join("");
    const html = `<h3>${esc(tr("First minutes of trading"))}<em class="sev-${sev}">${esc(tr(sev === "risk" ? "Risk found" : sev === "warn" ? "Worth a look" : "All good"))}</em></h3>
      <div class="asc-early-stats">
        <div><b data-no-i18n>${e.snipers || 0}</b><small>${esc(tr("snipers"))}</small></div>
        <div><b data-no-i18n>${K.pct(e.heldPct || 0)}</b><small>${esc(tr("they still hold"))}</small></div>
        <div><b data-no-i18n>${e.sameBlock || 0}</b><small>${esc(tr("in the first block"))}</small></div>
        <div><b data-no-i18n>${e.handout || 0}</b><small>${esc(tr("hand-outs"))}</small></div>
      </div>
      ${d.fresh ? `<p class="asc-hnote">${esc(tr("Fresh wallets among the 10 largest:"))} <b data-no-i18n>${d.fresh.n} / ${d.fresh.of}</b></p>` : ""}
      ${rows ? `<ol class="asc-early-list">${rows}</ol>` : ""}
      <p class="asc-hnote">${esc(tr("Read from the token's transfers in the first ~25 minutes after it was created. Snipers bought in the first ~10 seconds."))}</p>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
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
    const depOther = cur.dep ? (cur.dep.tokens || []).filter((t) => !others.some((l) => lc(l.token) === lc(t.token))).slice(0, 8) : [];
    const when = d && d.firstMint && d.firstMint.ts ? new Date(d.firstMint.ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null;
    const html = `<h3>${esc(tr(creator && lc(creator) !== lc(dep) ? "Creator" : "Deployer"))}</h3>
      <a class="asc-addr big" href="${ex("address", dep)}" target="_blank" rel="noopener" data-no-i18n style="--h:${hueOf(dep)}"><i></i>${short(dep)} ↗</a>
      <dl class="asc-dl">
        <div><dt>${esc(tr("Still holds"))}</dt><dd data-no-i18n>${d ? (held ? K.pct((held.v / d.S) * 100) : "0%") : "—"}</dd></div>
        ${when ? `<div><dt>${esc(tr("Created"))}</dt><dd data-no-i18n>${esc(when)}</dd></div>` : ""}
        <div><dt>${esc(tr("Other ArcPad coins"))}</dt><dd data-no-i18n>${others.length}</dd></div>
        ${cur.dep ? `<div><dt>${esc(tr("Contracts it deployed"))}</dt><dd data-no-i18n>${cur.dep.created}${cur.dep.capped ? "+" : ""}</dd></div>` : ""}
        ${cur.dep && cur.dep.nonce != null ? `<div><dt>${esc(tr("Transactions sent"))}</dt><dd data-no-i18n>${cur.dep.nonce.toLocaleString("en-US")}</dd></div>` : ""}
      </dl>
      ${others.length ? `<h4>${esc(tr("Their other coins"))}</h4><ul class="asc-dep-coins">${others.map((l) => { const sc = depScores.get(lc(l.token)); return `<li><button type="button" data-t="${esc(l.token)}"><b data-no-i18n>$${esc(l.symbol)}</b><small data-no-i18n>${l.marketCapUsd != null ? K.usd(l.marketCapUsd) + " " + esc(tr("market cap")) : ""}${l.launchedAt ? " · " + K.ageText(Date.now() / 1000 - l.launchedAt) : ""}</small>${sc ? miniRing(sc.score) : `<i class="asc-dep-wait"></i>`}</button></li>`; }).join("")}</ul>` : ""}
      ${depOther.length ? `<h4>${esc(tr("Other contracts it deployed"))}</h4><ul class="asc-dep-coins">${depOther.map((t) => { const sc = depScores.get(lc(t.token)); const v = sc || (t.score != null ? t : null); return `<li><button type="button" data-t="${esc(t.token)}"><b data-no-i18n>${t.sym ? "$" + esc(t.sym) : short(t.token)}</b><small data-no-i18n>${t.ts ? K.ageText(Date.now() / 1000 - t.ts) + " " + esc(tr("ago")) : ""}</small>${v ? miniRing(v.score) : `<i class="asc-dep-wait"></i>`}</button></li>`; }).join("")}</ul>` : ""}
      <p class="asc-hnote">${esc(tr(cur.dep ? "Contracts from the explorer, scores from the scanner's own scans." : "From ArcPad's launch records."))}</p>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
    const need = [...others.map((l) => lc(l.token)), ...depOther.filter((t) => t.score == null).map((t) => lc(t.token))].filter((a) => !depScores.has(a)).slice(0, 20);
    if (need.length) {
      need.forEach((a) => depScores.set(a, null));
      fetchJson(`/api/social?scores=${need.join(",")}`, 15000).then((j) => {
        if (j && j.scores) Object.entries(j.scores).forEach(([a, v]) => depScores.set(a, v));
        if (cur && cur.res && cur.res.dist) deployerCard(cur.res.dist);
      });
    }
  }
  const depScores = new Map();

  // ---- mobile: score stays in view while you scroll the checks ----
  let stickyEl = null, stickyIo = null;
  function sticky() {
    if (!cur || !cur.res || cur.res.notToken) return;
    if (!stickyEl) {
      stickyEl = document.createElement("div");
      stickyEl.className = "asc-sticky"; stickyEl.hidden = true;
      stickyEl.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]");
        if (a) { doAct(a.dataset.act, a); return; }
        const h = $("asc-head"); if (h) h.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
      document.body.appendChild(stickyEl);
    }
    const v = cur.res.verdict, nc = (cur.res.critical || []).length;
    const watching = watched().some((w) => lc(w.a) === lc(cur.addr));
    stickyEl.className = `asc-sticky v-${v.k}`;
    stickyEl.innerHTML = `<button type="button" class="asc-st-main"><span class="sc" data-no-i18n>${cur.res.score}</span><b data-no-i18n>$${esc(cur.c.symbol)}</b><span class="vt">${esc(tr(v.t))}</span>${nc ? `<em class="crit">${esc(tr(`${nc} ${nc === 1 ? "critical flag" : "critical flags"}`))}</em>` : ""}</button>
      <span class="asc-st-acts"><button type="button" data-act="watch" aria-pressed="${watching}" title="${esc(tr(watching ? "Watching" : "Watch"))}"><svg viewBox="0 0 24 24" aria-hidden="true" class="bell"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0"/></svg></button><button type="button" data-act="x" title="${esc(tr("Share on X"))}"><svg viewBox="0 0 24 24" aria-hidden="true" class="fill"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.8l7.7-8.8L1.3 2.5h6.8l4.7 6.1zm-1.2 17h1.8L7.1 4.4H5.2z"/></svg></button></span>`;
    if (stickyIo) stickyIo.disconnect();
    if ("IntersectionObserver" in window) {
      stickyIo = new IntersectionObserver((es) => es.forEach((e) => { stickyEl.hidden = e.isIntersecting || !panel.classList.contains("active"); stickyEl.classList.toggle("on", !stickyEl.hidden); }), { rootMargin: "-60px 0px 0px 0px" });
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
        ["Critical flags", String((r.critical || []).length)], ["Confidence", tr({ high: "High", medium: "Medium", low: "Low" }[r.confidence] || "—")],
        ...SECTIONS.map(([k, t]) => [t, r.sub && r.sub[k] && r.sub[k].score != null ? String(r.sub[k].score) : "—"]),
      ],
    };
  }
  function compareMaybe() {
    const box = $("asc-compare");
    if (!box) return;
    if (!compareBase || lc(compareBase.addr) === lc(cur.addr)) { box.hidden = true; return; }
    const b = snapshot();
    // which side is better, per row (higher is better for scores and money, lower for risks and concentration)
    const num = (x) => { const n = parseFloat(String(x).replace(/[$,%≥]/g, "").replace(/K$/, "e3").replace(/M$/, "e6").replace(/B$/, "e9")); return isFinite(n) ? n : null; };
    const LOWER = new Set(["Top 10 wallets", "Risks", "Critical flags"]);
    const better = (k, va, vb) => { const a = num(va), bb = num(vb); if (a == null || bb == null || a === bb || k === "Verdict" || k === "Owner" || k === "Selling" || k === "Confidence") return ""; return (LOWER.has(k) ? a < bb : a > bb) ? "a" : "b"; };
    const onlyDiff = box.dataset.diff === "1";
    box.hidden = false;
    box.innerHTML = `<div class="asc-card"><div class="asc-cmp-head"><h3>${esc(tr("Side by side"))}</h3><label class="asc-cmp-diff"><input type="checkbox" data-cmpdiff${onlyDiff ? " checked" : ""}> ${esc(tr("Only differences"))}</label><button type="button" data-act="uncompare">${esc(tr("Clear"))}</button></div>
      <table class="asc-cmp"><thead><tr><th></th><th data-no-i18n>$${esc(compareBase.sym)}</th><th data-no-i18n>$${esc(b.sym)}</th></tr></thead>
      <tbody>${b.rows.map(([k, v], i) => { const va = compareBase.rows[i] ? compareBase.rows[i][1] : "—", w = better(k, va, v), same = String(va) === String(v); if (onlyDiff && same) return ""; return `<tr class="${same ? "same" : "diff"}"><th>${esc(tr(k))}</th><td class="${w === "a" ? "win" : ""}" data-no-i18n>${esc(va)}</td><td class="${w === "b" ? "win" : ""}" data-no-i18n>${esc(v)}</td></tr>`; }).join("")}</tbody></table></div>`;
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
    head(); shelf(); sticky();
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
      const R = w.rules || { owner: true, supply: true, liq: 30, score: false };
      const alerts = [];
      if (R.owner && lc(s.owner) !== lc(old.owner)) alerts.push(K.BURN.includes(lc(s.owner)) ? "ownership was renounced" : "the owner changed");
      if (R.supply && old.supply && s.supply !== old.supply) alerts.push(BigInt(s.supply) > BigInt(old.supply) ? "new tokens were minted" : "supply went down");
      if (R.liq && old.liq && s.liq != null && s.liq < old.liq * (1 - R.liq / 100)) alerts.push(`liquidity fell ${Math.round((1 - s.liq / old.liq) * 100)}%`);
      if (R.score) {
        const j = await fetchJson(`/api/social?scores=${lc(w.a)}`, 12000);
        const sc = j && j.scores && j.scores[lc(w.a)];
        if (sc && sc.score != null) { if (old.score != null && sc.score <= old.score - 10) alerts.push(`the scanner score dropped from ${old.score} to ${sc.score}`); s.score = sc.score; }
        else if (old.score != null) s.score = old.score;
      }
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

  // Telegram: the bot watches it every 15 minutes (owner, supply, liquidity, LP locks)
  let botName;
  async function tgWatch(btn) {
    if (botName === undefined) { const j = await fetchJson("/api/tg-launch?bot=1", 8000); botName = j && j.enabled && j.username ? j.username : null; }
    if (!botName) { toast(tr("Telegram alerts aren't switched on yet — use Watch for alerts in this browser.")); return; }
    window.open(`https://t.me/${botName}?start=watch_${cur.addr}`, "_blank", "noopener");
    btn.classList.add("ok");
  }
  function askArcia() {
    if (!window.arcArcia || !cur || !cur.res) { location.hash = "#arcia"; return; }
    const r = cur.res;
    const bad = r.rows.filter((x) => x.status === "risk" || x.status === "warn").slice(0, 5).map((x) => x.title).join("; ");
    window.arcArcia.ask(`${tr("Explain this Token Scanner result in simple words:")} $${cur.c.symbol} ${r.score}/100 (${tr(r.verdict.t)}). ${bad ? tr("Flags:") + " " + bad : tr("No warnings.")}`);
  }
  function shareX() {
    if (!cur || !cur.res) return;
    const r = cur.res;
    const text = `$${cur.c.symbol} — scanned by ARCIRCLE: ${r.score}/100 · ${r.verdict.t}\n${r.reasons.map((x) => (x.status === "pass" ? "✓ " : "• ") + x.title).join("\n")}`;
    // signed in for Pro: the link carries the wallet, so the post can count as today's share
    const by = window.arcScanX && typeof window.arcScanX.wallet === "function" ? window.arcScanX.wallet() : null;
    const url = `${location.origin}/s/${cur.addr}${by ? `?by=${by}` : ""}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }
  // A 1200×630 picture of the result, drawn here — for posts that need an image.
  async function saveCard() {
    if (!cur || !cur.res) return;
    const r = cur.res, W = 1200, H = 630;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const col = r.verdict.k === "ok" ? "#39ff88" : r.verdict.k === "care" ? "#ffc861" : "#ff6e5a";
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#07101c"); bg.addColorStop(1, r.verdict.k === "ok" ? "#08190f" : r.verdict.k === "care" ? "#1a1407" : "#1c0a0a");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(950, 250, 20, 950, 250, 440); glow.addColorStop(0, col + "38"); glow.addColorStop(1, "transparent");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.fillStyle = col; g.fillRect(0, 0, 10, H);
    const round = (x, y, w, h, rr) => { g.beginPath(); g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr); g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath(); };
    g.fillStyle = "#9fc6ff"; g.font = "700 22px Sora, system-ui, sans-serif"; g.fillText(`TOKEN SCANNER ${K.SCANNER_VERSION || "v3"} · ARCIRCLE PAD`, 60, 76);
    g.fillStyle = "#ffffff"; g.font = "800 66px Sora, system-ui, sans-serif"; g.fillText(`$${cur.c.symbol}`.slice(0, 14), 60, 160);
    g.fillStyle = "rgba(222,233,244,.62)"; g.font = "500 24px Sora, system-ui, sans-serif"; g.fillText(String(cur.c.name || "").slice(0, 38), 60, 200);
    g.font = "500 18px ui-monospace, Menlo, monospace"; g.fillText(cur.addr, 60, 232);
    // critical flags first, then the reasons
    let y = 290;
    const crit = (r.critical || []).slice(0, 2), rest = r.reasons.filter((x) => !crit.some((c2) => c2.title === x.title)).slice(0, 3 - crit.length);
    g.font = "700 24px Sora, system-ui, sans-serif";
    crit.forEach((x) => { const t = `${tr("Critical")} · ${tr(x.title)}`.slice(0, 46); const w = g.measureText(t).width + 40; round(60, y - 30, w, 44, 22); g.fillStyle = "rgba(255,110,90,.18)"; g.fill(); g.strokeStyle = "rgba(255,110,90,.8)"; g.lineWidth = 2; g.stroke(); g.fillStyle = "#ffb3a7"; g.fillText(t, 80, y); y += 58; });
    rest.forEach((x) => { const c2 = x.status === "risk" ? "#ff6e5a" : x.status === "warn" ? "#ffc861" : "#39ff88"; g.fillStyle = c2; g.beginPath(); g.arc(76, y - 9, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = "#eef3f7"; g.fillText(tr(x.title).slice(0, 40), 100, y); y += 50; });
    // section scores
    const secs = SECTIONS.filter(([k]) => r.sub && r.sub[k]);
    const bx = 60, by = 470, bw = 88, gap = 14;
    g.font = "600 14px Sora, system-ui, sans-serif";
    secs.forEach(([k, t], i) => {
      const v = r.sub[k].score, x = bx + i * (bw + gap), c2 = v == null ? "#6b7785" : v >= 75 ? "#39ff88" : v >= 45 ? "#ffc861" : "#ff6e5a";
      g.fillStyle = "rgba(255,255,255,.08)"; round(x, by, bw, 10, 5); g.fill();
      if (v) { g.fillStyle = c2; round(x, by, Math.max(10, (bw * v) / 100), 10, 5); g.fill(); }
      g.fillStyle = "rgba(222,233,244,.7)"; g.fillText(tr(t).slice(0, 11), x, by + 32);
    });
    // the ring
    g.lineWidth = 26; g.strokeStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.arc(950, 250, 150, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = col; g.lineCap = "round"; g.beginPath(); g.arc(950, 250, 150, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, r.score / 100)); g.stroke();
    g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "800 112px Sora, system-ui, sans-serif"; g.fillText(String(r.score), 950, 282);
    g.fillStyle = "rgba(222,233,244,.55)"; g.font = "600 26px Sora, system-ui, sans-serif"; g.fillText("/ 100", 950, 322);
    g.fillStyle = col; g.font = "800 40px Sora, system-ui, sans-serif"; g.fillText(tr(r.verdict.t), 950, 460);
    g.fillStyle = "rgba(222,233,244,.6)"; g.font = "600 20px Sora, system-ui, sans-serif"; g.fillText(`${tr("Confidence")}: ${tr({ high: "High", medium: "Medium", low: "Low" }[r.confidence] || "—")}`, 950, 498);
    g.textAlign = "left"; g.fillStyle = "rgba(222,233,244,.45)"; g.font = "500 20px Sora, system-ui, sans-serif";
    g.fillText(`arcircle.app/s/${short(cur.addr)} · ${new Date().toISOString().slice(0, 10)}${r.block ? ` · #${r.block}` : ""} · not financial advice`, 60, 590);
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

  // ---- bubble map: zoom with the buttons or the wheel, drag to pan, click a bubble for its details ----
  function bmapView(svg, vb) { svg.setAttribute("viewBox", vb.map((x) => x.toFixed(1)).join(" ")); svg.__vb = vb; }
  function bmapZoom(svg, f, cx, cy) {
    const base = svg.dataset.vb.split(" ").map(Number), vb = svg.__vb || base.slice();
    const w = Math.max(base[2] / 6, Math.min(base[2], vb[2] * f)), h = (w / base[2]) * base[3];
    const px = cx == null ? vb[0] + vb[2] / 2 : cx, py = cy == null ? vb[1] + vb[3] / 2 : cy;
    bmapView(svg, [px - ((px - vb[0]) * w) / vb[2], py - ((py - vb[1]) * h) / vb[3], w, h]);
  }
  panel.addEventListener("click", (e) => {
    const z = e.target.closest("[data-bz]");
    if (z) { const svg = z.closest(".asc-bmap").querySelector("svg"); if (z.dataset.bz === "reset") bmapView(svg, svg.dataset.vb.split(" ").map(Number)); else bmapZoom(svg, z.dataset.bz === "in" ? 0.7 : 1 / 0.7); return; }
    const b = e.target.closest("[data-ba]");
    if (!b || !cur || !cur.res || !cur.res.dist) return;
    const box = b.closest(".asc-bmap").querySelector(".asc-bmap-info");
    const a = b.dataset.ba, k = b.dataset.bk, v = Number(b.dataset.bv), gi = b.dataset.bc != null ? Number(b.dataset.bc) : null;
    const cl = gi != null ? cur.res.dist.clusters[gi] : null;
    const person = (cur.res.dist.people || []).find((p) => lc(p.a) === lc(a));
    const LBL = { dep: "Deployer", snipe: "Sniper", hand: "Got a hand-out", fresh: "Fresh wallet", con: "Contract", hold: "Holder" };
    panel.querySelectorAll(".asc-bmap .b.sel").forEach((x) => x.classList.remove("sel")); b.classList.add("sel");
    box.hidden = false;
    box.innerHTML = `<button type="button" class="x" data-bclose aria-label="${esc(tr("Close"))}">×</button>
      <a class="asc-addr big" href="${ex("address", a)}" target="_blank" rel="noopener" data-no-i18n style="--h:${hueOf(a)}"><i></i>${short(a)} ↗</a>
      <dl class="asc-dl"><div><dt>${esc(tr("Holds"))}</dt><dd data-no-i18n>${K.pct(v)}</dd></div><div><dt>${esc(tr("Kind"))}</dt><dd>${esc(tr(LBL[k] || "Holder"))}</dd></div>
      ${person && person.nonce != null ? `<div><dt>${esc(tr("Transactions sent"))}</dt><dd data-no-i18n>${person.nonce}</dd></div>` : ""}
      ${cl ? `<div><dt>${esc(tr("Linked group"))}</dt><dd><span data-no-i18n>${cl.members.length}</span> ${esc(tr("wallets"))} · <span data-no-i18n>${K.pct(cl.pct)}</span></dd></div>` : ""}</dl>
      ${cl ? `<p class="asc-hnote">${esc(tr(cl.why.includes("moved") ? "They moved tokens between each other." : cl.why.includes("funded") ? "They got their tokens from the same sender." : "They bought in the same first block."))}</p>` : ""}
      <button type="button" class="asc-chip" data-t="${esc(a)}">${esc(tr("Look up this wallet"))} →</button>`;
  });
  panel.addEventListener("click", (e) => { const x = e.target.closest("[data-bclose]"); if (x) { const box = x.closest(".asc-bmap-info"); box.hidden = true; panel.querySelectorAll(".asc-bmap .b.sel").forEach((y) => y.classList.remove("sel")); } });
  panel.addEventListener("wheel", (e) => {
    const svg = e.target.closest && e.target.closest(".asc-bmap svg");
    if (!svg || !e.ctrlKey && !e.metaKey && !e.altKey && !svg.__vb) return; // plain wheel scrolls the page until the map is zoomed
    e.preventDefault();
    const r = svg.getBoundingClientRect(), vb = svg.__vb || svg.dataset.vb.split(" ").map(Number);
    bmapZoom(svg, e.deltaY < 0 ? 0.85 : 1 / 0.85, vb[0] + ((e.clientX - r.left) / r.width) * vb[2], vb[1] + ((e.clientY - r.top) / r.height) * vb[3]);
  }, { passive: false });
  let pan = null;
  panel.addEventListener("pointerdown", (e) => { const svg = e.target.closest && e.target.closest(".asc-bmap svg"); if (!svg || !svg.__vb || e.target.closest("[data-ba]")) return; pan = { svg, x: e.clientX, y: e.clientY, vb: svg.__vb.slice() }; svg.setPointerCapture(e.pointerId); svg.classList.add("panning"); });
  panel.addEventListener("pointermove", (e) => { if (!pan) return; const r = pan.svg.getBoundingClientRect(); bmapView(pan.svg, [pan.vb[0] - ((e.clientX - pan.x) / r.width) * pan.vb[2], pan.vb[1] - ((e.clientY - pan.y) / r.height) * pan.vb[3], pan.vb[2], pan.vb[3]]); });
  panel.addEventListener("pointerup", () => { if (pan) { pan.svg.classList.remove("panning"); pan = null; } });

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
    box = document.createElement("div");
    box.className = "asc-embed";
    box.dataset.style = "pill"; box.dataset.fmt = "html";
    h.appendChild(box);
    paintEmbed(box);
  }
  function paintEmbed(box) {
    const st = box.dataset.style, fmt = box.dataset.fmt;
    const img = `${location.origin}/badge/${cur.addr}${st === "card" ? "?style=card" : ""}`, link = `${location.origin}/s/${cur.addr}`;
    const hgt = st === "card" ? 76 : 22, alt = "Scanned by ARCIRCLE";
    const live = `${location.origin}/embed/scan/${cur.addr}`;
    const code = st === "live" ? (fmt === "url" ? live : `<iframe src="${live}" width="380" height="112" style="border:0;border-radius:14px;max-width:100%" loading="lazy" title="Token Scanner"></iframe>`)
      : fmt === "md" ? `[![${alt}](${img})](${link})` : fmt === "url" ? img : `<a href="${link}" target="_blank" rel="noopener"><img src="${img}" alt="${alt}" height="${hgt}"></a>`;
    const seg = (key, cur2, opts) => `<div class="asc-seg" role="group">${opts.map(([v, l]) => `<button type="button" data-embed-${key}="${v}" aria-pressed="${v === cur2}">${esc(tr(l))}</button>`).join("")}</div>`;
    box.innerHTML = `<div class="asc-embed-top"><b>${esc(tr("Show this score on your site, README or docs"))}</b></div>
      <div class="asc-embed-prev">${st === "live" ? `<iframe src="${esc(live)}" width="380" height="112" style="border:0;border-radius:14px;max-width:100%" loading="lazy" title="Token Scanner"></iframe>` : `<img src="${esc(img)}" alt="" height="${hgt}">`}</div>
      <div class="asc-embed-opts">${seg("style", st, [["pill", "Badge"], ["card", "Card"], ["live", "Live card · Pro"]])}${seg("fmt", fmt, st === "live" ? [["html", "HTML"], ["url", "Link"]] : [["html", "HTML"], ["md", "Markdown"], ["url", "Image link"]])}</div>
      <code data-no-i18n>${esc(code)}</code><div class="asc-embed-foot"><button type="button" data-copy="${esc(code)}">${esc(tr("Copy code"))}</button><span>${esc(tr("It links back to this scan and updates by itself — the token is re-scanned every few hours."))}</span></div>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-embed-style],[data-embed-fmt]");
    const box = b && b.closest(".asc-embed");
    if (!box || !cur) return;
    // the live card is a Pro tool: unlock it for this token first
    if (b.dataset.embedStyle === "live" && !(window.arcScanX && window.arcScanX.has("embed", cur.addr))) {
      if (window.arcScanX) window.arcScanX.unlock("embed", cur.addr).then((ok) => { if (ok) { box.dataset.style = "live"; box.dataset.fmt = "html"; paintEmbed(box); } });
      return;
    }
    if (b.dataset.embedStyle) { box.dataset.style = b.dataset.embedStyle; if (b.dataset.embedStyle === "live" && box.dataset.fmt === "md") box.dataset.fmt = "html"; }
    if (b.dataset.embedFmt) box.dataset.fmt = b.dataset.embedFmt;
    paintEmbed(box);
  });

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
      const crit = (d.crit || []).length;
      b.className = `asc-cardbadge v-${d.k}${crit ? " has-crit" : ""}`; b.setAttribute("role", "link"); b.tabIndex = 0; b.setAttribute("data-no-i18n", "");
      b.title = tr("Token Scanner score") + ` · ${tr(d.t)}${crit ? ` · ${tr("Critical")}: ${d.crit.map((x) => tr(x)).join(", ")}` : ""}`;
      b.innerHTML = `${SHIELD}<b>${d.score}</b>${crit ? "<i>!</i>" : ""}`;
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
    const hv = e.target.closest("[data-hview]");
    if (hv) { const box = $("asc-holders"); box.dataset.view = hv.dataset.hview; if (cur && cur.res && cur.res.dist) { box.__html = ""; holdersCard(cur.res.dist); } return; }
    const rep = e.target.closest("[data-report]");
    if (rep) { reportForm(rep); return; }
    const sendRep = e.target.closest("[data-send-report]");
    if (sendRep) { sendReport(sendRep); return; }
    const cp = e.target.closest("[data-copy]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); cp.classList.add("ok"); haptic("tap"); setTimeout(() => cp.classList.remove("ok"), 1400); } catch { /* denied */ } return; }
    const rt = e.target.closest("[data-retry]");
    if (rt) { retryPart(rt.dataset.retry, rt); return; }
    const jp = e.target.closest("[data-jump]");
    if (jp) { jumpTo(jp.dataset.jump); return; }
    const act = e.target.closest("[data-act]");
    if (!act || !cur) return;
    doAct(act.dataset.act, act);
  });
  panel.addEventListener("change", (e) => {
    if (e.target.matches("[data-cmpdiff]")) { const box = $("asc-compare"); box.dataset.diff = e.target.checked ? "1" : ""; compareMaybe(); }
  });
  // a section bar in the header: open that section's checks and bring them into view
  function jumpTo(k) {
    const sec = SECTIONS.find((x) => x[0] === k);
    if (!sec) return;
    $("asc-out").dataset.tab = "checks";
    panel.querySelectorAll(".asc-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === "checks")));
    const g = panel.querySelector(`.asc-group[data-g="${sec[2][0]}"]`);
    if (!g) return;
    g.classList.add("open", "flash");
    g.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setTimeout(() => g.classList.remove("flash"), 1400);
  }
  // "Try again" on a check that couldn't be read: re-read just that part
  async function retryPart(id, btn) {
    if (!cur || !cur.c) return;
    btn.disabled = true; btn.classList.add("spin");
    const addr = cur.addr, my = cur.my;
    try {
      if (id === "source") cur.src = await within(K.readSource(io, addr, cur.c.proxy && cur.c.proxy.impl), 12000);
      else if (id === "pool") { let m = await K.readMarket(io, addr).catch(() => null); if ((!m || !m.pairs.length) && (cur.x.arcpad || cur.x.argus)) m = (await marketFallback(addr, cur.x)) || m; cur.m = m; }
      else if (id === "holders") { cur.h = await fetchHolders(addr, cur.c.symbol).catch(() => cur.h); }
      else if (id === "sim") cur.sim = await K.simulateFor(io, addr, cur.c, cur.h).catch(() => cur.sim);
      else if (id === "lplock") { const j = await fetchJson(`/api/social?liq=${addr}`, 15000); if (j && j.done) cur.lp = K.lpSummary(j); }
      else { scan(addr); return; }
    } finally { btn.disabled = false; btn.classList.remove("spin"); }
    if (!cur || cur.my !== my) return;
    paint();
    if (cur.res && cur.shown != null && cur.res.score !== cur.shown) { cur.shown = cur.res.score; gaugeAt(cur.res.score); }
  }
  async function doAct(a, act) {
    if (!cur) return;
    if (a === "rescan") scan(cur.addr);
    else if (a === "x") shareX();
    else if (a === "card") saveCard();
    else if (a === "link") { try { await navigator.clipboard.writeText(`${location.origin}/s/${cur.addr}`); act.classList.add("ok"); toast(tr("Link copied")); } catch { /* denied */ } }
    else if (a === "watch") { toggleWatch(); act.classList.remove("ring"); void act.offsetWidth; act.classList.add("ring"); haptic("tap"); }
    else if (a === "embed") embedBox(act);
    else if (a === "tg") tgWatch(act);
    else if (a === "arcia") askArcia();
    else if (a === "agent" && cur) location.hash = "#agent?t=" + cur.addr;
    else if (a === "orders" && cur) location.hash = "#orders?t=" + cur.addr;
    else if (a === "compare") {
      if (compareBase && lc(compareBase.addr) !== lc(cur.addr)) { compareMaybe(); $("asc-compare").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); return; }
      compareBase = snapshot();
      toast(tr("Now scan a second token to compare them side by side."));
      $("asc-addr").value = ""; $("asc-addr").focus();
    } else if (a === "uncompare") { compareBase = null; $("asc-compare").hidden = true; head(); }
    else document.dispatchEvent(new CustomEvent("arcscan:act", { detail: { act: a, el: act, cur } })); // v3 tools (arc-scanner-x.js)
  }
  function fromHash() {
    const m = /^#scanner\?(?:t|token)=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (m && (!cur || lc(cur.addr) !== lc(m[1]))) scan(m[1]);
  }
  window.addEventListener("hashchange", fromHash);
  document.addEventListener("arcpad:tab", (e) => {
    if (e.detail && e.detail.tab === "scanner") { renderChips(); shelf(); setTimeout(() => { if (!cur && !reduce) $("asc-addr").focus({ preventScroll: true }); }, 250); }
  });
  document.addEventListener("arcscan:redraw-holders", () => { const box = $("asc-holders"); if (box && cur && cur.res && cur.res.dist) { box.__html = ""; holdersCard(cur.res.dist); } });
  // countdowns (liquidity locks) tick once a minute
  setInterval(() => { panel.querySelectorAll("[data-countdown]").forEach((el) => { const left = Number(el.dataset.countdown) - Date.now() / 1000; const b = el.querySelector("b"); if (b && left > 0) b.textContent = K.ageText(left); }); }, 60000);
  fetchJson("/api/social?scans=top", 6000).then((j) => { if (j && Array.isArray(j.top)) { topList = j.top; shelf(); } });
  renderChips(); shelf(); fromHash();
  let tries = 0;
  const chipT = setInterval(() => { renderChips(); if (++tries > 10 || launches().length) clearInterval(chipT); }, 1500);
  // arc-scanner-x.js (the v3 tools) works through this
  window.arcScanner = { scan, get state() { return cur; }, K, io, fetchJson, tr, esc, ex, short, lc, hueOf, reduce, haptic, toast, SECTIONS, ICON, isAddr, watched, saveWatched, launches, launchOf, within };
})();
