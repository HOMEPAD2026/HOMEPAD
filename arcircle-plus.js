/* global CONFIG */
// arcircle-plus.js — the $ARCIRCLE page's live extras, on top of arcircle-page.js (same data from
// arc-token.js, /api/social?token=arcircle): what each use has burned, burns labeled by source, a 24h / 7d
// price chart with a crosshair, buy/sell pressure and the latest trades, top holders, safety at a glance,
// "Add to wallet", a wallet's own $ARCIRCLE (holding, unlocks, burns), the family's $ARCIA price, a sticky
// section nav, the hero's burn ring, and the flywheel reacting to new burns and launches.
(function () {
  "use strict";
  if (!document.getElementById("uses")) return;
  const $ = (id) => document.getElementById(id);
  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => window.arcToken;
  const CA = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const EXPLORER = "https://arc.etherscan.io";
  const SUPPLY = 1e9;
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toLocaleString("en-US"));
  const usd = (n) => (T() ? T().fmt.usd(n) : "$" + Number(n || 0).toFixed(2));
  const price = (n) => (n == null ? "—" : T() && T().fmt.price ? T().fmt.price(n) : "$" + Number(n).toPrecision(3));
  const ago = (ts) => (T() && T().fmt.ago ? T().fmt.ago(ts) : "");
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
  const KIND = {
    vote: ["Burn-to-vote", "#39ff88"], mine: ["Builder Mine", "#ffc861"], scanner: ["Token Scanner", "#4d9fff"], secret: ["ARCIA's secret file", "#ff8fc7"],
    desk: ["ARCIA DESK", "#b58bff"], omni: ["OMNI rewards", "#e46bff"], buyback: ["Buyback", "#35d8d0"], team: ["Team & treasury", "#dfe8f1"], wallet: ["Direct burn", "#ff8a4c"], pending: ["Burn", "#ff8a4c"],
  };
  const kind = (k) => KIND[k] || KIND.pending;
  // wallets people will recognize in the top-holder list
  const LABELS = {
    "0x1a35a754a4251e46971184046ac57e8ad621672e": "CirclePad round wallet",
    "0xc30f1694203f4fc671ec769b90149e67ce3a1f03": "ARCIA DESK",
    "0x1538c76917de5911d71c5c397ff18ca09d52b019": "Builder Mine",
    "0x54121a7894d90a02ea973ab45eef424c2716eeb2": "CirclePad burn vote",
    "0xdbc9bb465c52688c0af75e002caaa43d731b8562": "ARCIA 402 wallet",
  };

  // ================= uses: what each one has burned =================
  function paintUses(b) {
    const by = (b && b.bySource) || {};
    qa(".ac-use[data-use]").forEach((el) => {
      const u = el.getAttribute("data-use"), n = q(".ac-use-n", el);
      if (u === "relay") return;
      if (u === "engine") { const t = ["scanner", "mine", "secret", "desk", "omni"].reduce((s, k) => s + (by[k] ? by[k].tokens : 0), 0); n.textContent = t > 0 ? num(t) + " " + tr("burned by utilities so far") : ""; return; }
      const o = by[u];
      n.textContent = o && o.tokens > 0 ? num(o.tokens) + " " + tr("burned") + " · " + o.n.toLocaleString("en-US") + " " + tr(o.n === 1 ? "time" : "times") : "";
    });
  }
  // the burn list, labeled by where each burn came from (arcircle-page.js draws it first; this relabels it)
  function paintBurnList(b) {
    const box = q('[data-tk="burn-list"]');
    if (!box || !b || !b.list || !b.list.length) return;
    box.innerHTML = b.list.slice(0, 6).map((x) => {
      const K = kind(x.kind);
      return `<a href="${EXPLORER}/tx/${esc(x.tx)}" target="_blank" rel="noopener" style="--acc:${K[1]}"><span class="ax-burn-tag ac-burn-tag">${esc(tr(K[0]))}</span><b data-no-i18n>${esc(num(x.tokens))}</b><span>${x.pct != null ? esc(x.pct.toFixed(x.pct < 0.01 ? 4 : 2)) + "%" : ""}</span><time data-no-i18n>${esc(ago(x.ts))}</time><span aria-hidden="true">↗</span></a>`;
    }).join("") + `<a class="ac-burn-more" href="/reward#burns">${esc(tr("Every burn, by source"))} →</a>`;
  }

  // ================= chart: 24h / 7d with a crosshair =================
  let range = ls.get("ac-range") === "24h" ? "24h" : "7d", lastD = null;
  function chart(d) {
    const box = q('[data-ac="chart"]');
    if (!box) return;
    const pts = (range === "24h" ? d.spark24 : d.spark) || [];
    const step = range === "24h" ? (d.spark24Step || 3600) : (d.sparkStep || 14400);
    const vals = pts.map((v) => (v == null ? null : Number(v)));
    const have = vals.filter((v) => v != null);
    if (have.length < 2) { box.hidden = true; const old = q(".ax-spark-box"); if (old) old.hidden = false; return; }
    const W = 320, H = 110, pad = 6;
    const lo = Math.min(...have), hi = Math.max(...have), span = hi - lo || hi * 0.02 || 1;
    const x = (i) => pad + (i * (W - pad * 2)) / (vals.length - 1);
    const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
    let dPath = "", started = false, lastI = 0;
    vals.forEach((v, i) => { if (v == null) return; dPath += (started ? " L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); started = true; lastI = i; });
    const up = have[have.length - 1] >= have[0];
    const col = up ? "#39ff88" : "#ff6b6b";
    const area = dPath + ` L${x(lastI).toFixed(1)},${H} L${x(vals.findIndex((v) => v != null)).toFixed(1)},${H} Z`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(tr("$ARCIRCLE price over the last") + " " + (range === "24h" ? "24 hours" : "7 days"))}">
      <defs><linearGradient id="acArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#acArea)"/><path class="ac-line" d="${dPath}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(lastI).toFixed(1)}" cy="${y(vals[lastI]).toFixed(1)}" r="3.5" fill="${col}"/>
      <line class="ac-x" x1="0" x2="0" y1="0" y2="${H}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" visibility="hidden"/>
      <circle class="ac-xdot" r="4" fill="#fff" visibility="hidden"/></svg><div class="ac-tip" hidden></div>`;
    box.hidden = false;
    const old = q(".ax-spark-box"); if (old) old.hidden = true;
    const from = q('[data-ac="chart-from"]'); if (from) from.textContent = tr(range === "24h" ? "24h ago" : "7d ago");
    const lbl = q(".ax-spark-head small"); if (lbl) lbl.textContent = "$ARCIRCLE · " + tr(range === "24h" ? "24 hours" : "7 days");
    const svg = q("svg", box), line = q(".ac-x", box), dot = q(".ac-xdot", box), tip = q(".ac-tip", box);
    const nowTs = d.ts || Math.floor(Date.now() / 1000);
    const move = (clientX) => {
      const r = svg.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      let i = Math.round(fx * (vals.length - 1));
      while (i > 0 && vals[i] == null) i--;
      if (vals[i] == null) return;
      const X = x(i), Y = y(vals[i]);
      line.setAttribute("x1", X); line.setAttribute("x2", X); line.setAttribute("visibility", "visible");
      dot.setAttribute("cx", X); dot.setAttribute("cy", Y); dot.setAttribute("visibility", "visible");
      const t = new Date((nowTs - (vals.length - 1 - i) * step) * 1000);
      tip.innerHTML = `<b data-no-i18n>${esc(price(vals[i]))}</b><small data-no-i18n>${esc(t.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</small>`;
      tip.hidden = false;
      tip.style.left = Math.min(r.width - 110, Math.max(0, (X / W) * r.width - 55)) + "px";
    };
    const leave = () => { line.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
    svg.addEventListener("pointermove", (e) => move(e.clientX));
    svg.addEventListener("pointerdown", (e) => move(e.clientX));
    svg.addEventListener("pointerleave", leave);
    if (!reduce) { const p = q(".ac-line", box); const len = p.getTotalLength ? p.getTotalLength() : 0; if (len) { p.style.strokeDasharray = len; p.style.strokeDashoffset = len; requestAnimationFrame(() => { p.style.transition = "stroke-dashoffset 1s ease"; p.style.strokeDashoffset = 0; }); } }
  }
  function setRange(r) {
    range = r; ls.set("ac-range", r);
    qa(".ac-range button").forEach((b) => b.setAttribute("aria-pressed", b.getAttribute("data-range") === r ? "true" : "false"));
    if (lastD) chart(lastD);
  }

  // ================= trades + pressure =================
  const seenTrades = new Set();
  let firstTrades = true;
  function trades(d) {
    const ol = q('[data-ac="trades"]');
    if (!ol) return;
    const list = (d.recent || []).slice(0, 8);
    if (!list.length) { ol.innerHTML = `<li class="ac-empty">${esc(tr("No trades yet."))}</li>`; return; }
    ol.innerHTML = list.map((x) => {
      const isNew = !firstTrades && !seenTrades.has(x.tx + x.side + x.tokens);
      const big = x.usdc >= 100;
      return `<li class="ac-trade ${x.side === "buy" ? "buy" : "sell"}${isNew ? " ac-new" : ""}${big ? " big" : ""}">
        <span class="ac-side">${esc(tr(x.side === "buy" ? "Buy" : "Sell"))}</span>
        <b data-no-i18n>${esc(usd(x.usdc))}</b>
        <span class="ac-tok" data-no-i18n>${esc(num(x.tokens))}</span>
        <a href="${EXPLORER}/tx/${esc(x.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(ago(x.ts))} ↗</a>
      </li>`;
    }).join("");
    list.forEach((x) => seenTrades.add(x.tx + x.side + x.tokens));
    firstTrades = false;
    const pr = q('[data-ac="press"]');
    if (pr && d.buys24h != null && d.sells24h != null) {
      pr.hidden = false;
      const bv = d.buyVol24h, sv = d.sellVol24h, useVol = bv != null && sv != null && bv + sv > 0;
      q('[data-ac="buys"]', pr).textContent = d.buys24h + (useVol ? " · " + usd(bv) : "");
      q('[data-ac="sells"]', pr).textContent = d.sells24h + (useVol ? " · " + usd(sv) : "");
      const share = useVol ? bv / (bv + sv) : d.buys24h + d.sells24h > 0 ? d.buys24h / (d.buys24h + d.sells24h) : 0.5;
      q('[data-ac="press-buy"]', pr).style.width = (share * 100).toFixed(1) + "%";
    }
  }

  // ================= top holders =================
  function holders(d) {
    const ol = q('[data-ac="top"]');
    if (!ol || !d.top) return;
    if (!d.top.length) { ol.innerHTML = `<li class="ac-empty">${esc(tr("No holders to show yet."))}</li>`; return; }
    const max = d.top[0].pct || 1;
    ol.innerHTML = d.top.slice(0, 10).map((h, i) => {
      const lab = LABELS[String(h.address).toLowerCase()];
      return `<li><span class="ac-rank" data-no-i18n>${i + 1}</span>
        <a class="ac-addr" href="${EXPLORER}/address/${esc(h.address)}" target="_blank" rel="noopener"><code data-no-i18n>${esc(short(h.address))}</code>${lab ? `<small>${esc(tr(lab))}</small>` : ""}</a>
        <div class="ac-top-bar"><i style="width:${Math.max(2, (h.pct / max) * 100).toFixed(1)}%"></i></div>
        <b data-no-i18n>${esc(h.pct.toFixed(h.pct < 1 ? 3 : 2))}%</b></li>`;
    }).join("");
  }

  // ================= safety at a glance =================
  function safety(d) {
    const a = d.argus;
    const tax = q('[data-ac="tax"]');
    if (tax && a && a.buyTaxBps != null) tax.textContent = (a.buyTaxBps === a.sellTaxBps ? (a.buyTaxBps / 100) + "% " + tr("buy / sell") : (a.buyTaxBps / 100) + "% " + tr("buy") + " · " + (a.sellTaxBps / 100) + "% " + tr("sell")) + ", " + tr("forever");
  }
  function loadScore() {
    fetch("/api/v1/scan/" + CA).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j || j.score == null) return;
      const el = q('[data-ac="score"]');
      if (el) el.textContent = j.score + "/100" + (j.verdict ? " · " + tr(j.verdict) : "") + " →";
      const li = q('#ac-safe [data-safe="scan"]');
      if (li) li.classList.toggle("warn", j.score < 45);
    }).catch(() => {});
  }

  // ================= Add to wallet =================
  function addToWallet() {
    const eth = window.ethereum;
    if (!eth || !eth.request) return;
    eth.request({ method: "wallet_watchAsset", params: { type: "ERC20", options: { address: CA, symbol: "ARCIRCLE", decimals: 18, image: location.origin + "/images/arcircle-mark-sm.png" } } })
      .then((ok) => { if (ok) qa("[data-ac-add]").forEach((b) => { b.textContent = "✓ " + tr("Added"); }); })
      .catch(() => {});
  }

  // ================= a wallet's own $ARCIRCLE =================
  let checking = 0;
  async function checkMe(addr) {
    const box = $("ac-me");
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { box.hidden = false; box.innerHTML = `<p class="ac-err">${esc(tr("That doesn't look like a wallet address — it starts with 0x and is 42 characters long."))}</p>`; return; }
    const run = ++checking;
    box.hidden = false; box.innerHTML = `<p class="ac-empty">${esc(tr("Reading Arc…"))}</p>`;
    let d = null;
    try { d = T() ? await T().load(addr.toLowerCase()) : null; } catch { d = null; }
    if (run !== checking) return;
    const w = d && d.wallet;
    if (!w) { box.innerHTML = `<p class="ac-err">${esc(tr("Couldn't read this wallet right now — try again in a minute."))}</p>`; return; }
    ls.set("ac-me", addr);
    const bal = w.balance || 0;
    const tier = bal >= 5e6 ? ["+30%", "5M+"] : bal >= 1e6 ? ["+20%", "1M+"] : bal >= 1e5 ? ["+10%", "100K+"] : null;
    const next = bal < 1e5 ? 1e5 : bal < 1e6 ? 1e6 : bal < 5e6 ? 5e6 : null;
    const burned = w.burned || { tokens: 0, bySource: {} };
    const bsrc = Object.entries(burned.bySource || {}).sort((a, b) => b[1].tokens - a[1].tokens).map(([k, o]) => tr(kind(k)[0]) + " " + num(o.tokens)).join(" · ");
    const card = (acc, k, v, sub, ok) => `<div class="ac-me-card${ok === true ? " ok" : ok === false ? " no" : ""}" style="--acc:${acc}"><span>${esc(tr(k))}</span><strong data-no-i18n>${esc(v)}</strong><small>${esc(sub)}</small></div>`;
    box.innerHTML = `<div class="ac-me-grid">
      ${card("#35d8d0", "Holding", num(bal) + " $ARCIRCLE", bal > 0 ? ((bal / SUPPLY) * 100).toPrecision(3) + "% " + tr("of supply") + (w.rank ? " · " + tr("holder") + " #" + w.rank + " / " + w.of : "") : tr("Not holding right now"))}
      ${card("#39ff88", "Holding for", w.heldDays >= 1 ? w.heldDays.toFixed(1) + " " + tr("days") : bal > 0 ? Math.max(1, Math.round((w.heldDays || 0) * 24)) + " " + tr("hours") : "—", w.maxDays ? "$ARCIRCLE " + tr("is") + " " + w.maxDays.toFixed(1) + " " + tr("days old") : "")}
      ${card("#35d8d0", "Relay launches", bal >= 1e5 ? tr("Eligible") : tr("Not yet"), bal >= 1e5 ? tr("Holding 100,000+ at the snapshot") : num(1e5 - bal) + " " + tr("more to reach 100,000"), bal >= 1e5)}
      ${card("#ffc861", "Builder Mine bonus", tier ? tier[0] : "—", tier ? tr("Holding") + " " + tier[1] + (next ? " · " + num(next - bal) + " " + tr("more for the next tier") : "") : num(1e5 - bal) + " " + tr("more for +10%"), !!tier)}
      ${card("#ff8a4c", "Burned by this wallet", num(burned.tokens || 0) + " $ARCIRCLE", burned.tokens > 0 ? bsrc : tr("Nothing burned yet"))}
      ${card("#4d9fff", "CirclePad", w.circle ? usd(w.circle) : "—", w.circle ? tr("Contributed to CirclePad") : tr("No contribution yet"))}
    </div>
    <p class="ac-me-links"><a href="/me">${esc(tr("Full wallet page"))} →</a><a href="/reward#check=${esc(addr)}">${esc(tr("Burn card"))} →</a></p>`;
    if (!reduce) qa(".ac-me-card", box).forEach((c, i) => { c.style.animationDelay = i * 70 + "ms"; c.classList.add("ac-in"); });
  }
  async function prefillWallet() {
    const inp = $("ac-me-addr");
    if (!inp) return;
    const saved = ls.get("ac-me");
    if (saved) inp.value = saved;
    const eth = window.ethereum;
    if (eth && eth.request) {
      try { const acc = await eth.request({ method: "eth_accounts" }); if (acc && acc[0] && !inp.value) inp.value = acc[0]; } catch { /* not connected */ }
    }
  }

  // ================= family: $ARCIA's price =================
  function loadArcia() {
    fetch("/api/social?coin=arcia").then((r) => (r.ok ? r.json() : null)).then((a) => {
      const el = q('[data-ac="arcia-price"]');
      if (el && a && a.price != null) el.textContent = price(a.price) + (a.mcap != null ? " · " + tr("market cap") + " " + usd(a.mcap) : "");
    }).catch(() => {});
  }

  // ================= sticky section nav =================
  function sectionNav() {
    const facts = $("live");
    if (!facts || q(".ac-nav")) return;
    const items = [["uses", "Uses"], ["flywheel", "Flywheel"], ["market", "Market"], ["buybacks", "Burns & holders"], ["revenue", "Revenue"], ["yours", "Your wallet"], ["family", "Family"], ["buy", "How to buy"], ["faq", "FAQ"]].filter(([id]) => $(id));
    const nav = document.createElement("nav");
    nav.className = "ac-nav"; nav.setAttribute("aria-label", tr("On this page"));
    nav.innerHTML = items.map(([id, l]) => `<a href="#${id}" data-sec="${id}">${esc(tr(l))}</a>`).join("");
    facts.insertAdjacentElement("afterend", nav);
    const top = q(".ax-top");
    const setTop = () => { if (top) nav.style.top = `calc(env(safe-area-inset-top, 0px) + ${Math.round(top.getBoundingClientRect().height) + 8}px)`; };
    setTop(); window.addEventListener("resize", setTop);
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (!e.isIntersecting) return;
        qa("a", nav).forEach((a) => a.classList.toggle("on", a.getAttribute("data-sec") === e.target.id));
        const on = q("a.on", nav);
        if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - 24, behavior: reduce ? "auto" : "smooth" });
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    items.forEach(([id]) => io.observe($(id)));
  }

  // ================= hero burn ring + flywheel reactions + price flash =================
  function ring(pct) {
    const coin = q(".ax-coin");
    if (!coin) return;
    let r = q(".ac-ring", coin);
    if (!r) {
      r = document.createElement("div");
      r.className = "ac-ring"; r.setAttribute("aria-hidden", "true");
      r.innerHTML = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="3"/><circle class="ac-ring-arc" cx="100" cy="100" r="94" fill="none" stroke="url(#acRingG)" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 100 100)"/><defs><linearGradient id="acRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc861"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient></defs></svg><span class="ac-ring-lbl"></span>`;
      coin.appendChild(r);
    }
    const arc = q(".ac-ring-arc", r);
    requestAnimationFrame(() => { arc.setAttribute("stroke-dasharray", Math.min(100, pct).toFixed(2) + " 100"); });
    q(".ac-ring-lbl", r).textContent = pct.toFixed(2) + "% " + tr("burned");
  }
  let prevN = null, prevLaunch = null, prevPrice = null;
  function flyPing(step, text) {
    const node = q(`.ax-fly-node[data-step="${step}"]`);
    if (node) { node.classList.remove("ac-ping"); void node.getBBox(); node.classList.add("ac-ping"); setTimeout(() => node.classList.remove("ac-ping"), 2400); }
    const fly = q(".ax-fly");
    if (!fly) return;
    let note = q(".ac-fly-note", fly);
    if (!note) { note = document.createElement("p"); note.className = "ac-fly-note"; note.setAttribute("role", "status"); fly.appendChild(note); }
    note.textContent = text;
    note.classList.remove("on"); void note.offsetWidth; note.classList.add("on");
  }
  function react(d) {
    const b = d.burned;
    if (b && b.n != null) {
      if (prevN != null && b.n > prevN) { const newest = (b.list || [])[0]; flyPing(3, tr("New burn") + (newest ? ": " + num(newest.tokens) + " $ARCIRCLE · " + tr(kind(newest.kind)[0]) : "")); }
      prevN = b.n;
    }
    const L = d.revenue && d.revenue.launches;
    if (L != null) { if (prevLaunch != null && L > prevLaunch) flyPing(1, tr("New launch on ArcPad") + " · " + L + " " + tr("so far")); prevLaunch = L; }
    if (d.price != null) {
      if (prevPrice != null && d.price !== prevPrice && !reduce) {
        const dir = d.price > prevPrice ? "up" : "down";
        qa('[data-tk="price"]').forEach((el) => { el.classList.remove("ac-up", "ac-down"); void el.offsetWidth; el.classList.add("ac-" + dir); });
      }
      prevPrice = d.price;
    }
  }

  // ================= wiring =================
  function onStats(d) {
    if (!d || d.partial) return;
    lastD = d;
    if (d.burned) { paintUses(d.burned); paintBurnList(d.burned); if (d.burned.pct != null) ring(d.burned.pct); }
    if (d.spark || d.spark24) chart(d);
    trades(d); holders(d); safety(d); react(d);
  }
  function init() {
    sectionNav();
    if (T()) T().subscribe(onStats);
    loadScore(); loadArcia(); setInterval(loadArcia, 90000);
    if (window.ethereum && window.ethereum.request) qa("[data-ac-add]").forEach((b) => { b.hidden = false; });
    prefillWallet();
    qa(".ac-range button").forEach((b) => b.setAttribute("aria-pressed", b.getAttribute("data-range") === range ? "true" : "false"));
    document.addEventListener("click", (e) => {
      const t = e.target;
      const rb = t.closest && t.closest(".ac-range button");
      if (rb) { setRange(rb.getAttribute("data-range")); return; }
      if (t.closest && t.closest("[data-ac-add]")) { addToWallet(); return; }
      const cp = t.closest && t.closest(".rw-copy[data-copy]");
      if (cp) {
        const done = () => { const o = cp.textContent; cp.textContent = tr("Copied"); setTimeout(() => { cp.textContent = o; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cp.getAttribute("data-copy")).then(done, () => {});
      }
    });
    const f = $("ac-me-form");
    if (f) f.addEventListener("submit", (e) => { e.preventDefault(); checkMe($("ac-me-addr").value.trim()); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
