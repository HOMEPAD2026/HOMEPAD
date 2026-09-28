/* global cpFmtTime, CONFIG, ethers, state, readProvider, circlepadEscrowRead, circlepadEscrowConfigured, govLogoUrl, govDate, govFmtDate, govBurnMode, fmtEth, cpToast, _circlepadState */
// circlepad-round.js — Round #1 as it actually runs, around the rest of /circle:
//   · a one-line strip over every tab: raised · contributors · burned · clock
//   · a Home hero that follows the phase (raise → burn-to-vote → result)
//   · "What happens next": what's fixed by a contract, what's the team's plan,
//     what isn't decided yet (CONFIG.CIRCLEPAD_NEXT)
//   · Projects: the live round card · Treasury: the split at today's total
//   · governance extras: the live burn feed, voters and top burners, the
//     share card after a vote (/vote/<tx>), the burn animation, category
//     tabs + "my votes" bar on phones, and the result reveal after the close
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const burnOn = () => typeof govBurnMode === "function" && govBurnMode();
  const BURN = String(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS || "");
  const usdc = (wei, d = 2) => (typeof fmtEth === "function" ? fmtEth(wei, d) : String(wei));
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const tok = (raw) => Math.round(Number(BigInt(raw || 0) / 10n ** 18n)).toLocaleString("en-US");
  const nowS = () => Math.floor(Date.now() / 1000) + (window.circlepadGovSkew || 0);
  const left = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };
  const dt = (ts) => (typeof cpFmtTime === "function" ? cpFmtTime(new Date(ts * 1000), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : new Date(ts * 1000).toLocaleString());

  // ---- what we know, from the other scripts ----
  const R = () => (typeof _circlepadState !== "undefined" && _circlepadState) || null;
  const G = () => window.circlepadGov || null;
  const rows = () => window.circlepadLbRows || [];
  let feed = null; // /api/social?circle=burns
  let wallets = null; // { recipient, platform, treasury }
  const lead = (c) => { if (!c || !c.set || !c.options.length) return null; let best = -1, bw = 0n; c.options.forEach((o, i) => { if (o.weight > bw) { bw = o.weight; best = i; } }); return best < 0 ? null : { i: best, text: c.options[best].text, weight: bw }; };
  function phase() {
    const r = R(), g = G(), t = nowS();
    if (!r || !r.started) return "pre";
    if (g && g.votingOpen) return "voting"; // burn voting runs during the raise, until it closes
    if (r.isOpen) return "raise";
    const ends = g ? Number(g.votingEnds || 0) : 0;
    if (ends && t < ends) return "voting";
    if (ends && t >= ends) return "result";
    return "closed";
  }
  const deadline = () => Number((R() && R().deadline) || 0);
  const votingEnds = () => Number((G() && G().votingEnds) || 0);
  const opensAt = () => Number((G() && G().opensAt) || 0);
  function winner() {
    const g = G(); if (!g) return {};
    const l = (k) => lead(g.categories[k]);
    const logo = l(2) && govLogoUrl(l(2).text), d = l(4) && govDate(l(4).text);
    return { name: l(0) ? l(0).text : "", ticker: l(1) ? String(l(1).text).replace(/^\$/, "") : "", logo, date: d, road: l(3) ? String(l(3).text).split("\n")[0] : "", any: [0, 1, 2, 3, 4].some((k) => l(k)) };
  }
  const burnedTotal = () => {
    const g = G(), chain = g && g.burn && g.burn.live && g.burn.totalBurned != null ? BigInt(g.burn.totalBurned) : null;
    const api = feed ? BigInt(feed.totals.burned || 0) : null;
    return chain != null && api != null ? (chain > api ? chain : api) : chain != null ? chain : api != null ? api : 0n;
  };

  // ================= strip: raised · contributors · burned · clock =================
  const strip = document.createElement("div");
  strip.className = "cp-strip"; strip.id = "cp-strip";
  const scroll = document.querySelector(".bp-scroll");
  if (scroll) scroll.insertBefore(strip, scroll.firstChild);
  // stick just under the top bar (sticky on desktop, fixed on phones)
  const topbar = document.querySelector(".bp-topbar");
  const stickTop = () => { if (!topbar) return; const p = getComputedStyle(topbar).position; strip.style.top = (p === "fixed" || p === "sticky") ? Math.round(topbar.getBoundingClientRect().height) + "px" : "0px"; };
  stickTop(); window.addEventListener("resize", stickTop, { passive: true });
  // phones: one line (phase · raised · clock); tap it for the rest
  strip.addEventListener("click", (e) => {
    if (e.target.closest("button, a")) return;
    if (!matchMedia("(max-width: 900px)").matches) return;
    strip.classList.toggle("open");
    strip.setAttribute("aria-expanded", strip.classList.contains("open") ? "true" : "false");
  });
  function paintStrip() {
    const r = R(), ph = phase();
    if (!r || ph === "pre") { strip.hidden = true; return; }
    strip.hidden = false;
    const both = ph === "voting" && r.isOpen && votingEnds() === deadline();
    const clock = ph === "raise" ? ["Raise closes in", deadline()] : ph === "voting" ? [both ? "Raise & voting close in" : "Voting closes in", votingEnds()] : null;
    const label = ph === "raise" ? "Raising" : ph === "voting" ? (r.isOpen ? "Raising · voting" : "Voting") : ph === "result" ? "Result" : "Closed";
    strip.innerHTML = `<span class="cp-strip-ph ${ph}"><i></i>${T(label)}</span>
      <span class="cp-strip-raised"><small>${T("Raised")}</small><b data-no-i18n>${usdc(r.totalRaised || 0n, 0)} USDC</b></span>
      <span class="cp-strip-n"><small>${T("Contributors")}</small><b data-no-i18n>${num(rows().length)}</b></span>
      ${burnOn() ? `<span class="cp-strip-burn"><small>${T("Burned by votes")}</small><b data-no-i18n data-cp-burned>${tok(burnedTotal())}</b></span>` : ""}
      ${clock ? `<span class="cp-strip-clock"><small>${T(clock[0])}</small><b data-no-i18n data-cp-to="${clock[1]}">${clock[1] > nowS() ? left(clock[1] - nowS()) : T("Closing…")}</b></span>` : ""}
      ${ph === "raise" || ph === "voting" ? `<button type="button" class="cp-strip-live" data-cp-live>${T("Live screen")}</button>` : `<span class="cp-strip-split ${r.distributed ? "ok" : "wait"}"><i></i>${T(r.distributed ? "Split sent" : "Settling the split")}</span><a class="cp-strip-live" href="/circle/round/1">${T("Round report")}</a>`}
      <i class="cp-strip-more" aria-hidden="true"></i>`;
    strip.setAttribute("aria-expanded", strip.classList.contains("open") ? "true" : "false");
  }

  // ================= Home hero that follows the phase =================
  const home = $("bp-panel-home");
  const hero = document.createElement("section");
  hero.className = "cp-phero"; hero.id = "cp-phase-hero"; hero.hidden = true;
  home.insertBefore(hero, home.firstChild);
  function coinCard(w, final) {
    return `<div class="cp-wc${final ? " final" : ""}">
      <span class="cp-coin-logo">${w.logo ? `<img src="${esc(w.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((w.name || "?").slice(0, 1).toUpperCase())}</em>`}</span>
      <div class="cp-coin-id"><b data-no-i18n>${esc(w.name || "—")}</b><span data-no-i18n>${w.ticker ? "$" + esc(w.ticker) : "—"}</span></div>
      <dl><div><dt>${T("Launch date")}</dt><dd data-no-i18n>${w.date ? esc(govFmtDate(w.date)) : "—"}</dd></div><div><dt>${T("Roadmap")}</dt><dd data-no-i18n>${esc(w.road || "—")}</dd></div></dl>
    </div>`;
  }
  function paintHero() {
    const ph = phase();
    document.body.classList.toggle("cp-ph-voting", ph === "voting");
    document.body.classList.toggle("cp-ph-result", ph === "result");
    if (!burnOn() || (ph !== "raise" && ph !== "voting" && ph !== "result")) { hero.hidden = true; return; }
    hero.hidden = false;
    const w = winner();
    if (ph === "raise") {
      // before the close: say what the burn vote is and when it opens
      const g = G(), dl = opensAt();
      const published = g && Array.isArray(g.categories) ? g.categories.filter((c) => c.set).length : 0;
      const buy = String(CONFIG.ARCIRCLE_BUY_URL || "");
      hero.className = "cp-phero upcoming";
      hero.innerHTML = `<div class="cp-phero-copy">
          <span class="cp-phero-eyebrow">${T("Round #1 · next up: burn-to-vote")}</span>
          <h2>${T("$ARCIRCLE holders vote on the coin while the raise runs.")}</h2>
          <p class="cp-phero-lede">${T("1 vote = 1,000 $ARCIRCLE, sent to 0x…dEaD for good. Anyone holding $ARCIRCLE can vote until the raise closes.")}</p>
          <div class="cp-phero-cta">${buy ? `<a class="bp-btn-primary" href="${esc(buy)}" target="_blank" rel="noopener">${T("Get $ARCIRCLE")}</a>` : ""}<button type="button" class="bp-btn-ghost" data-cp-go="governance">${T("See the candidates")}</button>${dl > nowS() ? `<span class="cp-phero-clock"><small>${T("Voting opens in")}</small><b data-no-i18n data-cp-to="${dl}">${left(dl - nowS())}</b></span>` : ""}</div>
        </div>
        <div class="cp-phero-side"><div class="cp-wc cp-wc-burn"><span class="cp-flame" aria-hidden="true"></span><div><b data-no-i18n>1,000 $ARCIRCLE</b><span>${T("burned per vote")}</span></div>
          <dl><div><dt>${T("Burn address")}</dt><dd data-no-i18n>0x…dEaD</dd></div><div><dt>${T("Candidates")}</dt><dd><span data-no-i18n>${published}/5</span> <span>${T("published")}</span></dd></div></dl></div></div>`;
      return;
    }
    if (ph === "voting") {
      hero.className = "cp-phero voting";
      hero.innerHTML = `<div class="cp-phero-copy">
          <span class="cp-phero-eyebrow">${T("Round #1 · burn-to-vote is open")}</span>
          <h2>${T("Vote on the coin. Every vote burns 1,000 $ARCIRCLE.")}</h2>
          <div class="cp-phero-burn"><span class="cp-flame" aria-hidden="true"></span><b data-no-i18n data-cp-burned>${tok(burnedTotal())}</b><span>${T("$ARCIRCLE burned so far")}</span></div>
          <div class="cp-phero-cta"><button type="button" class="bp-btn-primary" data-cp-go="governance">${T("Burn & vote")}</button><button type="button" class="bp-btn-ghost" data-cp-live>${T("Live screen")}</button><a class="bp-btn-ghost" href="/circle/round/1">${T("Round report")}</a><span class="cp-phero-clock"><small>${T("Voting closes in")}</small><b data-no-i18n data-cp-to="${votingEnds()}">${left(votingEnds() - nowS())}</b></span></div>
        </div>
        <div class="cp-phero-side"><small class="cp-k">${T("Leading now")}</small>${w.any ? coinCard(w, false) : `<div class="cp-wc cp-wc-empty"><span class="cp-flame" aria-hidden="true"></span><p>${T("No votes yet — the first burn sets the lead.")}</p></div>`}</div>`;
    } else {
      const launchAt = w.date ? Math.floor(w.date.getTime() / 1000) : 0;
      hero.className = "cp-phero result";
      hero.innerHTML = `<div class="cp-phero-copy">
          <span class="cp-phero-eyebrow">${T("Round #1 · the vote is in")}</span>
          <h2>${T("This is the coin the circle chose.")}</h2>
          <p class="cp-phero-split ${R() && R().distributed ? "ok" : "wait"}"><i></i>${T(R() && R().distributed ? "Split sent — 80 / 15 / 5 paid out from the escrow." : "Settling — the recipient sends the 80 / 15 / 5 split from the escrow next.")}</p>
          <div class="cp-phero-burn"><span class="cp-flame" aria-hidden="true"></span><b data-no-i18n>${tok(burnedTotal())}</b><span>${T("$ARCIRCLE burned to decide it")}</span></div>
          <div class="cp-phero-cta">${launchAt > nowS() ? `<span class="cp-phero-clock"><small>${T("Launches in")}</small><b data-no-i18n data-cp-to="${launchAt}">${left(launchAt - nowS())}</b></span>` : ""}<button type="button" class="bp-btn-ghost" data-cp-reveal>${T("Replay the reveal")}</button><a class="bp-btn-ghost" href="/circle/round/1">${T("Round report")}</a></div>
        </div>
        <div class="cp-phero-side"><small class="cp-k">${T("The result")}</small>${coinCard(w, true)}</div>`;
    }
  }

  // ================= "What happens next" =================
  const STATUS = { set: "Fixed by a contract", policy: "Team plan", open: "Not decided yet" };
  function nextHtml() {
    const steps = Array.isArray(CONFIG.CIRCLEPAD_NEXT) ? CONFIG.CIRCLEPAD_NEXT : [];
    const dl = deadline(), ve = votingEnds(), t = nowS(), w = winner();
    const launchAt = w.date ? Math.floor(w.date.getTime() / 1000) : 0;
    const op = opensAt() || dl;
    const when = { close: dl ? [dl, dl] : null, vote: op && ve ? [op, ve] : null, top: dl ? [dl, dl + 3 * 86400] : null, launch: launchAt ? [launchAt, launchAt] : null, airdrop: null };
    const whenTxt = (id) => {
      const x = when[id];
      if (!x) return id === "launch" ? tr("The date the vote picks") : tr("Not decided yet");
      return x[0] === x[1] ? dt(x[0]) : `${dt(x[0])} → ${dt(x[1])}`;
    };
    return `<ol class="cp-next-list">${steps.map((s, i) => {
      const x = when[s.id], st = x ? (t >= x[1] ? "done" : t >= x[0] ? "now" : "") : "";
      return `<li class="${st}" style="--i:${i}"><span class="cp-next-dot" aria-hidden="true"></span><div>
        <div class="cp-next-top"><b>${T(s.title)}</b><span class="cp-next-st ${esc(s.status)}">${T(STATUS[s.status] || s.status)}</span></div>
        <p>${T(s.body)}</p><small data-no-i18n>${esc(whenTxt(s.id))}</small></div></li>`;
    }).join("")}</ol>`;
  }
  const nextHome = document.createElement("section");
  nextHome.className = "cp-next cp-next-home"; nextHome.id = "cp-next-home";
  const anchor = document.querySelector(".bp-nextcard");
  if (anchor) anchor.insertAdjacentElement("beforebegin", nextHome); else home.appendChild(nextHome);
  function paintNext() {
    const body = nextHtml();
    nextHome.innerHTML = `<div class="cp-next-head"><h3>${T("What happens next")}</h3><small>${T("Round #1 — what's fixed, what's planned, what isn't decided")}</small></div>${body}`;
    const docs = $("cp-next-docs");
    if (docs) docs.innerHTML = body;
    document.dispatchEvent(new CustomEvent("circlepad:nextpaint"));
  }

  // ================= clock-driven fill on the launch-process strip =================
  function paintTimeline() {
    const tl = document.querySelector(".cp-timeline");
    if (!tl || !deadline()) return;
    tl.dataset.clock = "1";
    const t = nowS(), dl = deadline(), start = dl - 72 * 3600, op = opensAt() || dl;
    const w = winner(), launchAt = w.date ? Math.floor(w.date.getTime() / 1000) : dl + 5 * 86400;
    // five steps, each a fifth of the bar: raise, burn-to-vote (during the raise), close, top contributor, launch
    const seg = (a, b, k) => (t <= a ? k / 5 : t >= b ? (k + 1) / 5 : (k + (t - a) / Math.max(1, b - a)) / 5);
    const f = t < start ? 0 : t < op ? seg(start, op, 0) : t < dl ? seg(op, dl, 1) : t < dl + 3 * 86400 ? seg(dl, dl + 3 * 86400, 3) : seg(dl + 3 * 86400, launchAt, 4);
    tl.style.setProperty("--cp-tl", Math.max(0, Math.min(1, f)).toFixed(4));
  }

  // ================= Projects: the live round =================
  function paintProjects() {
    const panel = $("bp-panel-projects"), r = R();
    if (!panel || !r || !r.started) return;
    const wrap = panel.querySelector(".bp-simple");
    let card = $("cp-round-card");
    if (!card) { card = document.createElement("div"); card.id = "cp-round-card"; card.className = "cp-round-card"; const h1 = wrap.querySelector("h1"); if (h1) h1.insertAdjacentElement("afterend", card); else wrap.prepend(card); }
    const ph = phase(), w = winner();
    const badge = ph === "raise" ? "Raising" : ph === "voting" ? "Voting" : ph === "result" ? "Decided" : "Closed";
    card.innerHTML = `<div class="cp-rc-top"><span class="cp-rc-badge ${ph}">${T(badge)}</span><span class="cp-rc-k">${T("CirclePad Round #1")}</span></div>
      <div class="cp-rc-main"><span class="cp-coin-logo">${w.logo ? `<img src="${esc(w.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((w.name || "#1").slice(0, 2))}</em>`}</span>
        <div><b data-no-i18n>${esc(w.name || tr("Name decided by the vote"))}</b><span data-no-i18n>${w.ticker ? "$" + esc(w.ticker) : "$TBD"}</span></div></div>
      <div class="cp-rc-stats"><span><small>${T("Raised")}</small><b data-no-i18n>${usdc(r.totalRaised || 0n, 0)} USDC</b></span><span><small>${T("Contributors")}</small><b data-no-i18n>${num(rows().length)}</b></span>${burnOn() ? `<span><small>${T("Burned by votes")}</small><b data-no-i18n>${tok(burnedTotal())}</b></span>` : ""}</div>
      <div class="cp-rc-acts"><button type="button" class="bp-btn-primary" data-cp-go="${ph === "raise" ? "home" : "governance"}">${T(ph === "raise" ? "Contribute" : ph === "voting" ? "Burn & vote" : "See the result")}</button></div>`;
  }

  // ================= Treasury: the split at today's total =================
  async function loadWallets() {
    if (wallets || typeof circlepadEscrowConfigured !== "function" || !circlepadEscrowConfigured()) return;
    try { const e = circlepadEscrowRead(); const [a, b, c] = await Promise.all([e.recipient(), e.platformWallet(), e.treasuryWallet()]); wallets = { recipient: a, platform: b, treasury: c }; } catch { /* next time */ }
  }
  function paintTreasury() {
    const box = $("cp-treasury-live"), r = R();
    if (!box) return;
    if (!r || !r.started) { box.innerHTML = `<div class="bp-empty">${T("The split is shown here once the round opens.")}</div>`; return; }
    const total = BigInt(r.totalRaised || 0n), done = !!r.distributed, top = rows()[0];
    const row = (pct, name, who, note, cls) => `<div class="cp-tr-row ${cls}"><div class="cp-tr-top"><b>${T(name)}</b><span data-no-i18n>${pct}%</span></div>
      <div class="cp-tr-bar"><i style="--w:${pct}%"></i></div>
      <div class="cp-tr-amt"><b data-no-i18n>≈ ${usdc((total * BigInt(pct)) / 100n, 2)} USDC</b>${who ? `<a href="${explorer("address", who)}" target="_blank" rel="noopener" data-no-i18n>${short(who)} ↗</a>` : ""}</div>
      <small>${T(note)}</small></div>`;
    box.innerHTML = `<div class="cp-tr-head"><b>${T(done ? "Split at the close" : "If the round closed now")}</b><span data-no-i18n>${usdc(total, 2)} USDC</span></div>
      ${row(80, "Recipient wallet", wallets && wallets.recipient, "The project's funds", "a")}
      ${row(15, "Treasury wallet", wallets && wallets.treasury, "Paid to the top contributor over 3 days", "c")}
      ${row(5, "Platform wallet", wallets && wallets.platform, "$ARCIRCLE buybacks and promotion", "b")}
      ${top ? `<p class="cp-tr-top-note"><span>${T(done ? "Top contributor at the close" : "Top contributor right now")}:</span> <a href="${explorer("address", top.address)}" target="_blank" rel="noopener" data-no-i18n>${short(top.address)}</a> <b data-no-i18n>${usdc(top.amount, 2)} USDC</b></p>` : ""}`;
  }

  // ================= burn feed: every vote, voters, top burners =================
  let seen = null, feedT = 0;
  async function loadFeed() {
    if (!burnOn() || !/^0x[0-9a-fA-F]{40}$/.test(BURN)) return;
    try {
      const r = await fetch("/api/social?circle=burns", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const fresh = seen ? j.events.filter((e) => !seen.has(e.tx + ":" + e.i)) : [];
      seen = new Set(j.events.map((e) => e.tx + ":" + e.i));
      feed = j; feedT = Date.now();
      paintFeed(fresh);
      document.querySelectorAll("[data-cp-burned]").forEach((el) => bump(el, tok(burnedTotal())));
      odoAll();
      window.circlepadBurns = j;
      document.dispatchEvent(new CustomEvent("circlepad:burns", { detail: j }));
    } catch { /* next poll */ }
  }
  const catName = (c) => ["Coin name", "Ticker", "Logo", "Roadmap", "Launch date"][c] || "";
  const optLabel = (e) => (e.cat === 1 ? "$" + String(e.text || "").replace(/^\$/, "") : e.cat === 2 ? tr("a logo") : e.cat === 4 && typeof govDate === "function" && govDate(e.text) ? govFmtDate(govDate(e.text)) : e.cat === 3 ? String(e.text || "").split("\n")[0].slice(0, 40) : String(e.text || ""));
  const ago = (b) => { if (!feed) return ""; const s = Math.max(0, (feed.anchor.block - b) * 0.5); return s < 90 ? tr("just now") : s < 5400 ? `${Math.round(s / 60)}${tr("m ago")}` : `${Math.round(s / 3600)}${tr("h ago")}`; };
  function paintFeed(fresh = []) {
    const top = $("bp-gov-top");
    if (!top || !feed) return;
    let box = $("gv-burnfeed");
    if (!box) { box = document.createElement("section"); box.id = "gv-burnfeed"; box.className = "gv-feed"; top.insertAdjacentElement("afterend", box); }
    const t = feed.totals, topShare = t.votes > 0 && feed.top.length ? Math.round((feed.top[0].votes / t.votes) * 100) : 0;
    box.innerHTML = `<div class="gv-feed-stats">
        <div><small>${T("Burned by votes")}</small><b data-no-i18n>${tok(t.burned)}</b><span>$ARCIRCLE</span></div>
        <div><small>${T("Votes")}</small><b data-no-i18n>${num(t.votes)}</b></div>
        <div><small>${T("Voters")}</small><b data-no-i18n>${num(t.voters)}</b></div>
        <div><small>${T("Largest voter")}</small><b data-no-i18n>${t.votes ? topShare + "%" : "—"}</b><span>${T("of all votes")}</span></div>
      </div>
      <div class="gv-feed-cols">
        <div><h4>${T("Latest burns")}</h4>${feed.events.length ? `<ul class="gv-feed-list">${feed.events.slice(0, 8).map((e) => `<li class="${fresh.some((f) => f.tx === e.tx && f.i === e.i) ? "fresh" : ""}"><span class="cp-flame sm" aria-hidden="true"></span><div><b data-no-i18n>${short(e.voter)}</b> <span>${T("burned")}</span> <b data-no-i18n>${num(e.votes * 1000)}</b> <span>$ARCIRCLE</span><small><span>${T(catName(e.cat))}</span>: <span data-no-i18n>${esc(optLabel(e))}</span></small></div><a href="${explorer("tx", e.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(ago(e.b))} ↗</a></li>`).join("")}</ul>` : `<p class="gv-feed-empty">${T(phase() === "voting" ? "No votes yet — the first burn shows up here." : "Burns show up here once voting opens.")}</p>`}</div>
        <div><h4>${T("Top burners")}</h4>${feed.top.length ? `<ol class="gv-feed-top">${feed.top.map((x) => `<li><a href="${explorer("address", x.voter)}" target="_blank" rel="noopener" data-no-i18n>${short(x.voter)}</a><b data-no-i18n>${num(x.votes)}</b><span>${T("votes")}</span><i style="--w:${t.votes ? Math.max(4, (x.votes / t.votes) * 100) : 0}%"></i></li>`).join("")}</ol>` : `<p class="gv-feed-empty">—</p>`}</div>
      </div>`;
    // someone else's vote: the candidate row glows once, and a quiet note
    const mine = state && state.account ? state.account.toLowerCase() : "";
    fresh.filter((e) => e.voter.toLowerCase() !== mine).slice(0, 3).forEach((e) => {
      glow(e.cat, e.opt);
      if (typeof cpToast === "function") cpToast(`${short(e.voter)} ${tr("burned")} ${num(e.votes * 1000)} $ARCIRCLE · ${tr(catName(e.cat))}: ${optLabel(e)}`, "ok");
    });
  }
  function glow(cat, opt) {
    const el = document.querySelector(`.bp-gov-option[data-category="${cat}"][data-option="${opt}"]`);
    if (!el || reduce()) return;
    el.classList.remove("gv-glow"); void el.offsetWidth; el.classList.add("gv-glow");
    setTimeout(() => el.classList.remove("gv-glow"), 1800);
  }
  function bump(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    if (reduce()) return;
    el.classList.remove("cp-bump"); void el.offsetWidth; el.classList.add("cp-bump");
  }

  // ================= after my vote: the burn, then a share card =================
  document.addEventListener("circlepad:burnvote", (e) => {
    const d = e.detail || {};
    burnFx(d.category, d.option, d.votes);
    shareCard(d);
    setTimeout(loadFeed, 2500);
  });
  function burnFx(cat, opt, votes) {
    if (reduce()) return;
    const from = document.querySelector(`.bp-gov-option[data-category="${cat}"][data-option="${opt}"]`) || document.querySelector(".gv-bn");
    const to = document.querySelector(".gv-burned") || document.querySelector("#cp-strip .cp-strip-burn");
    if (!from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "cp-burnfx"; layer.setAttribute("aria-hidden", "true");
    const n = Math.min(18, 6 + (votes || 1) * 2);
    for (let k = 0; k < n; k++) {
      const p = document.createElement("i");
      const x0 = a.left + a.width * (0.2 + Math.random() * 0.6), y0 = a.top + a.height * (0.3 + Math.random() * 0.4);
      p.style.cssText = `left:${x0}px;top:${y0}px;--dx:${b.left + b.width / 2 - x0}px;--dy:${b.top + b.height / 2 - y0}px;animation-delay:${k * 40}ms`;
      layer.appendChild(p);
    }
    const tag = document.createElement("span");
    tag.className = "cp-burnfx-dead"; tag.textContent = "0x…dEaD";
    tag.style.cssText = `left:${b.left + b.width / 2}px;top:${b.top - 6}px`;
    layer.appendChild(tag);
    document.body.appendChild(layer);
    setTimeout(() => { to.classList.remove("cp-flare"); void to.offsetWidth; to.classList.add("cp-flare"); }, 700);
    setTimeout(() => layer.remove(), 1800);
  }
  function shareCard(d) {
    if (!d.tx) return;
    const top = $("bp-gov-top");
    if (!top) return;
    let box = $("gv-share");
    if (!box) { box = document.createElement("section"); box.id = "gv-share"; box.className = "gv-share"; top.insertAdjacentElement("afterend", box); }
    const url = `https://www.arcircle.app/vote/${d.tx}`;
    const label = d.kind === "ticker" ? "$" + String(d.text || "").replace(/^\$/, "") : d.kind === "logo" ? "a logo" : d.kind === "roadmap" ? "a roadmap" : d.kind === "date" && govDate(d.text) ? govFmtDate(govDate(d.text)) : String(d.text || "");
    const burned = num((d.votes || 1) * 1000);
    const text = `I burned ${burned} $ARCIRCLE to vote for ${label} in CirclePad Round #1. 1 vote = 1,000 $ARCIRCLE, gone for good.`;
    box.innerHTML = `<div class="gv-share-img"><img src="/api/og?vote=${esc(d.tx)}" alt="" loading="lazy"></div>
      <div class="gv-share-copy"><b><span>${T("You burned")}</span> <span data-no-i18n>${burned}</span> $ARCIRCLE</b><p><span>${T("to vote for")}</span> <span data-no-i18n>${esc(label)}</span></p>
        <div class="gv-share-acts"><a class="bp-btn-primary" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${T("Share on X")}</a><button type="button" class="bp-btn-ghost" data-cp-copy="${esc(url)}">${T("Copy link")}</button><button type="button" class="gv-share-x" data-cp-close-share aria-label="${T("Close")}">×</button></div></div>`;
    if (!reduce()) { box.classList.remove("in"); void box.offsetWidth; box.classList.add("in"); }
  }

  // ================= phones: category tabs =================
  function paintBallotNav() {
    const cats = $("bp-gov-categories"), g = G();
    if (!cats || !g) return;
    let nav = $("gv-cat-tabs");
    if (!nav) { nav = document.createElement("nav"); nav.id = "gv-cat-tabs"; nav.className = "gv-cat-tabs"; nav.setAttribute("aria-label", tr("Categories")); cats.insertAdjacentElement("beforebegin", nav); }
    nav.innerHTML = g.categories.map((c) => `<button type="button" data-cp-cat="${c.id}" class="${c.myVoteIndex !== null ? "voted" : ""}">${T(c.label)}</button>`).join("");
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cp-cat]");
    if (c) { const el = $(`gv-cat-${c.dataset.cpCat}`); if (el) el.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" }); return; }
    const go = e.target.closest("[data-cp-go]");
    if (go) { const nav = document.querySelector(`.bp-nav-item[data-tab="${go.dataset.cpGo}"]`); if (nav) nav.click(); return; }
    const cp = e.target.closest("[data-cp-copy]");
    if (cp) { try { navigator.clipboard.writeText(cp.dataset.cpCopy); if (typeof cpToast === "function") cpToast(tr("Link copied."), "ok"); } catch { /* denied */ } return; }
    if (e.target.closest("[data-cp-close-share]")) { const b = $("gv-share"); if (b) b.remove(); return; }
    if (e.target.closest("[data-cp-reveal]")) { reveal(true); return; }
  });

  // ================= the reveal, once per browser after voting closes =================
  const REVEAL_KEY = "circlepad.reveal." + String(CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS || CONFIG.CIRCLEPAD_VOTE_ADDRESS || "").toLowerCase();
  let revealed = false;
  function reveal(force) {
    const g = G();
    if (!g || phase() !== "result") return;
    let seenIt = revealed; try { seenIt = seenIt || localStorage.getItem(REVEAL_KEY) === "1"; } catch { /* show it */ }
    if (seenIt && !force) return;
    if (document.querySelector(".cp-reveal")) return;
    revealed = true;
    try { localStorage.setItem(REVEAL_KEY, "1"); } catch { /* fine */ }
    const w = winner();
    const cards = g.categories.filter((c) => c.set).map((c, k) => {
      const l = lead(c);
      const kind = ["name", "ticker", "logo", "roadmap", "date"][c.id];
      const face = !l ? "—" : kind === "logo" && govLogoUrl(l.text) ? `<img src="${esc(govLogoUrl(l.text))}" alt="" referrerpolicy="no-referrer">` : kind === "ticker" ? "$" + esc(String(l.text).replace(/^\$/, "")) : kind === "date" && govDate(l.text) ? esc(govFmtDate(govDate(l.text))) : esc(String(l.text).split("\n")[0]);
      return `<div class="cp-rv-card" style="--k:${k}"><div class="cp-rv-in"><div class="cp-rv-back"><span>${T(c.label)}</span><b>?</b></div><div class="cp-rv-front"><span>${T(c.label)}</span><b data-no-i18n>${face}</b>${l ? `<small><span data-no-i18n>${l.weight.toString()}</span> <span>${T("votes")}</span></small>` : ""}</div></div></div>`;
    });
    const ov = document.createElement("div");
    ov.className = "cp-reveal"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", tr("The result"));
    ov.innerHTML = `<div class="cp-rv-box"><span class="cp-phero-eyebrow">${T("CirclePad Round #1 · the vote is in")}</span>
      <div class="cp-rv-grid">${cards.join("")}</div>
      <div class="cp-rv-final" style="--k:${cards.length}">${coinCard(w, true)}</div>
      <div class="cp-rv-acts">${w.any ? `<a class="bp-btn-ghost" href="https://x.com/intent/post?text=${encodeURIComponent(`CirclePad Round #1 is decided: ${w.name || ""}${w.ticker ? " ($" + w.ticker + ")" : ""}${w.date ? ", launching " + govFmtDate(w.date) : ""}. Chosen by $ARCIRCLE holders — every vote burned 1,000 $ARCIRCLE.`)}&url=${encodeURIComponent("https://www.arcircle.app/circle")}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${T("Share the result")}</a>` : ""}<a class="bp-btn-ghost" href="/circle/round/1">${T("Round report")}</a><button type="button" class="bp-btn-primary cp-rv-close">${T("See the result")}</button></div></div>`;
    document.body.appendChild(ov);
    if (reduce()) ov.classList.add("still");
    requestAnimationFrame(() => ov.classList.add("in"));
    const close = () => { ov.classList.remove("in"); setTimeout(() => ov.remove(), 250); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest(".cp-rv-close")) close(); });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
  }

  // ================= the race for #1 (the top contributor gets the 15%) =================
  const WEI = 10n ** 18n, CENT = 10n ** 16n;
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const plain = (wei) => { const c = (wei + CENT - 1n) / CENT; return `${c / 100n}.${String(c % 100n).padStart(2, "0")}`; }; // up to the cent, for the input
  const parseAmt = (s) => { const m = /^\s*(\d*)(?:\.(\d*))?\s*$/.exec(String(s || "")); if (!m || (!m[1] && !m[2])) return 0n; return BigInt(m[1] || "0") * WEI + BigInt(((m[2] || "") + "0".repeat(18)).slice(0, 18)); };
  const race = document.createElement("div");
  race.className = "cp-race"; race.id = "cp-race"; race.hidden = true; race.setAttribute("aria-live", "polite");
  const cbtn = $("bp-contribute-btn");
  if (cbtn) cbtn.insertAdjacentElement("afterend", race);
  const input = $("bp-contribute-amount");
  function rankWith(list, addr, extra) {
    // rank of `addr` after adding `extra`; equal amounts keep the earlier wallet ahead
    const mineNow = (list.find((r) => r.address.toLowerCase() === addr) || {}).amount || 0n;
    const after = mineNow + extra;
    const ahead = list.filter((r) => r.address.toLowerCase() !== addr && r.amount >= after).length;
    return { rank: ahead + 1, after };
  }
  function paintRace() {
    const list = rows(), r = R();
    if (!r || phase() !== "raise" || !list.length) { race.hidden = true; return; }
    race.hidden = false;
    const top = list[0], w = me();
    const mineRow = w ? list.find((x) => x.address.toLowerCase() === w) : null;
    const myRank = mineRow ? list.indexOf(mineRow) + 1 : 0;
    let head, fill = 0n;
    if (mineRow && myRank === 1) {
      const second = list[1];
      head = second
        ? `<b>${T("You're #1")}</b> <span>${T("ahead by")}</span> <b data-no-i18n>${usdc(mineRow.amount - second.amount)} USDC</b>`
        : `<b>${T("You're #1")}</b> <span>${T("— the only contributor so far.")}</span>`;
    } else {
      const gap = top.amount - (mineRow ? mineRow.amount : 0n);
      fill = gap + 1n;
      head = mineRow
        ? `<span>${T("Your rank:")}</span> <b data-no-i18n>#${myRank}</b><span>.</span> <span>${T("Put in more than")}</span> <b data-no-i18n>${usdc(gap)} USDC</b> <span>${T("to take #1.")}</span>`
        : `<span>${T("#1 right now:")}</span> <b data-no-i18n>${short(top.address)}</b> <b data-no-i18n>(${usdc(top.amount)} USDC)</b><span>.</span> <span>${T("Put in more than that to take #1.")}</span>`;
    }
    // what the amount being typed would do
    let preview = "";
    const typed = input ? parseAmt(input.value) : 0n;
    if (typed > 0n) {
      const who = w || "0x0000000000000000000000000000000000000000";
      const { rank } = rankWith(list, who, typed);
      if (rank === 1) {
        const others = list.filter((x) => x.address.toLowerCase() !== who);
        const lead = others.length ? rankWith(list, who, typed).after - others[0].amount : 0n;
        preview = `<p class="cp-race-preview win">${others.length ? `<span>${T("With this you'd be #1, ahead by")}</span> <b data-no-i18n>${usdc(lead)} USDC</b>` : `<span>${T("With this you'd be #1")}</span>`}</p>`;
      } else preview = `<p class="cp-race-preview"><span>${T("With this you'd be")}</span> <b data-no-i18n>#${rank}</b></p>`;
    }
    const fillBtn = fill > 0n && input ? `<button type="button" class="cp-race-fill" data-cp-fill="${plain(fill)}"><span>${T("Use")}</span> <b data-no-i18n>${plain(fill)} USDC</b></button>` : "";
    const html = `<div class="cp-race-head"><span class="gv-crown" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg></span><p>${head}</p>${fillBtn}</div>${preview}
      <p class="cp-race-note">${T("The top contributor at the close receives the 15%, over 3 days. Contributions can be withdrawn until the close, so #1 can change up to the last second — only the ranking at the close counts.")}</p>`;
    if (race.__html !== html) { race.innerHTML = html; race.__html = html; }
  }
  race.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cp-fill]");
    if (!b || !input) return;
    input.value = b.dataset.cpFill;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
  if (input) input.addEventListener("input", paintRace);

  // ================= #1 changes hands: the crown moves =================
  let leaderWas = null;
  const bornAt = Date.now(); // the first renders (cache, then chain) aren't a hand-off
  function crownHandOff() {
    const list = rows();
    const now = list.length ? list[0].address.toLowerCase() : null;
    const prev = leaderWas;
    leaderWas = now;
    // a crown on every #1 row
    document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row").forEach((row) => {
      const isTop = row.classList.contains("cp-top1");
      let c = row.querySelector(".cp-lb-crown");
      if (isTop && !c) { c = document.createElement("span"); c.className = "cp-lb-crown"; c.setAttribute("aria-label", tr("Top contributor")); c.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>'; row.querySelector(".bp-lb-rank").appendChild(c); }
      if (!isTop && c) c.remove();
    });
    if (!prev || !now || prev === now || phase() !== "raise" || Date.now() - bornAt < 8000) return;
    const statEl = $("bp-stat-lead");
    const card = statEl && statEl.closest(".bp-mini-stat");
    if (card && !reduce()) { card.classList.remove("cp-lead-new"); void card.offsetWidth; card.classList.add("cp-lead-new"); }
    const w = me(), row = list[0];
    const msg = now === w ? tr("You took #1 — the 15% is yours if it holds at the close.")
      : prev === w ? `${tr("You lost #1 to")} ${short(now)} (${usdc(row.amount)} USDC)`
      : `${tr("New #1:")} ${short(now)} · ${usdc(row.amount)} USDC`;
    if (typeof cpToast === "function") cpToast(msg, "ok");
    if (reduce()) return;
    // fly a crown from the old leader's row to the new one
    const find = (a) => [...document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row")].filter((r) => r.offsetParent && (r.querySelector(".bp-lb-ext") || { getAttribute: () => "" }).getAttribute("href").toLowerCase().endsWith(a));
    const from = find(prev)[0], to = find(now)[0];
    const toCrown = to && to.querySelector(".cp-lb-crown");
    if (toCrown) { toCrown.classList.remove("new"); void toCrown.offsetWidth; toCrown.classList.add("new"); }
    if (!from || !toCrown) return;
    const a = from.querySelector(".bp-lb-rank").getBoundingClientRect(), b = toCrown.getBoundingClientRect();
    const fly = document.createElement("span");
    fly.className = "cp-crown-fly"; fly.setAttribute("aria-hidden", "true");
    fly.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
    fly.style.cssText = `left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px;--dx:${b.left + b.width / 2 - (a.left + a.width / 2)}px;--dy:${b.top + b.height / 2 - (a.top + a.height / 2)}px`;
    document.body.appendChild(fly);
    toCrown.style.opacity = "0";
    setTimeout(() => { fly.remove(); toCrown.style.opacity = ""; }, 800);
  }
  document.addEventListener("circlepad:lb", () => { try { paintRace(); crownHandOff(); } catch (err) { console.warn("circlepad-round race", err); } });

  // ================= the vote, alive: rolling totals, flame gauges, the coin swapping, the last hour =================
  // numbers roll digit by digit when they go up
  const odoLast = new Map();
  function odometer(el, key) {
    const text = el.textContent, prev = odoLast.get(key);
    odoLast.set(key, text);
    if (reduce() || prev == null || prev === text || el.dataset.odo === text) return;
    const n = (x) => Number(String(x).replace(/[^0-9]/g, "")) || 0;
    if (n(text) <= n(prev)) return;
    el.dataset.odo = text;
    const pad = prev.padStart(text.length, " ");
    el.innerHTML = [...text].map((ch, i) => {
      if (!/\d/.test(ch)) return `<span class="odo-s">${esc(ch)}</span>`;
      const from = /\d/.test(pad[i]) ? Number(pad[i]) : 0, to = Number(ch);
      const end = to >= from ? to : to + 10;
      const strip = Array.from({ length: 20 }, (_, k) => `<i>${k % 10}</i>`).join("");
      return `<span class="odo-c" style="--from:${from};--to:${end};--d:${(text.length - i) * 45}ms"><span class="odo-strip">${strip}</span></span>`;
    }).join("");
    el.classList.add("odo");
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("odo-go")));
    setTimeout(() => { if (el.dataset.odo === text) { el.classList.remove("odo", "odo-go"); el.textContent = text; } }, 1300);
  }
  function odoAll() {
    [["gov", ".gv-burned b"], ["strip", "#cp-strip [data-cp-burned]"], ["hero", "#cp-phase-hero [data-cp-burned]"], ["feed", "#gv-burnfeed .gv-feed-stats b"]].forEach(([k, sel]) => {
      const el = document.querySelector(sel);
      if (el) odometer(el, k);
    });
  }
  // how much each category has burned, as a flame gauge under its title
  const gaugeLast = new Map();
  function paintGauges() {
    const g = G();
    if (!g || !burnOn() || !Array.isArray(g.categories)) return;
    const sums = g.categories.map((c) => c.options.reduce((a, o) => a + BigInt(o.weight || 0), 0n));
    const max = sums.reduce((a, b) => (b > a ? b : a), 0n);
    g.categories.forEach((c, i) => {
      const card = $(`gv-cat-${i}`);
      if (!card || !c.set) return;
      const head = card.querySelector(".bp-gov-cat-head");
      if (!head) return;
      let gauge = card.querySelector(".gv-gauge");
      if (!gauge) { gauge = document.createElement("div"); gauge.className = "gv-gauge"; gauge.setAttribute("aria-hidden", "true"); gauge.innerHTML = `<span class="cp-flame sm"></span><div class="gv-gauge-bar"><i></i></div>`; head.insertAdjacentElement("afterend", gauge); }
      const pct = max > 0n ? Number((sums[i] * 1000n) / max) / 10 : 0;
      const bar = gauge.querySelector("i"), was = gaugeLast.has(i) ? gaugeLast.get(i) : 0;
      gaugeLast.set(i, pct);
      if (reduce() || was === pct) { bar.style.width = pct + "%"; return; }
      bar.style.transition = "none"; bar.style.width = was + "%";
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = ""; bar.style.width = pct + "%"; }));
      gauge.classList.toggle("hot", pct > 0 && sums[i] === max);
    });
  }
  // the big coin card: when the leading name / ticker / logo / date changes, it flips to the new one
  let coinKey = null;
  function coinSwap() {
    const c = document.querySelector(".gv-coin-hero");
    if (!c) return;
    const k = c.dataset.coinKey || "";
    if (coinKey != null && k !== coinKey && !reduce()) { c.classList.remove("swap"); void c.offsetWidth; c.classList.add("swap"); }
    coinKey = k;
  }
  // the last hour: the clocks beat; the last ten minutes: the strip turns red
  function paintFinal() {
    const ph = phase(), ends = ph === "voting" ? votingEnds() : ph === "raise" ? deadline() : 0;
    const rem = ends ? ends - nowS() : Infinity;
    document.body.classList.toggle("cp-final-hour", rem > 0 && rem <= 3600);
    document.body.classList.toggle("cp-final-10", rem > 0 && rem <= 600);
  }
  function aliveAll() { try { odoAll(); paintGauges(); coinSwap(); paintFinal(); } catch (err) { console.warn("circlepad-round alive", err); } }
  document.addEventListener("circlepad:govpaint", aliveAll);

  // ================= the close: at 0 every open page pulls the result by itself =================
  let closing = null; // { at, tries }
  function watchClose() {
    const ph = phase();
    if (ph !== "raise" && ph !== "voting") { if (closing && closing.el) { closing.el.remove(); } closing = null; return; }
    const ends = ph === "voting" ? votingEnds() : deadline();
    if (!ends || nowS() < ends || closing) return;
    closing = { tries: 0, el: null };
    // a short curtain while the chain catches up
    const el = document.createElement("div");
    el.className = "cp-closing"; el.setAttribute("role", "status");
    el.innerHTML = `<div class="cp-closing-box"><span class="cp-flame" aria-hidden="true"></span><b>${T(R() && R().isOpen === false || deadline() <= nowS() ? "Round #1 has closed" : "Voting has closed")}</b><p>${T("Counting the votes on-chain — the result opens in a moment.")}</p></div>`;
    document.body.appendChild(el); closing.el = el;
    if (!reduce()) requestAnimationFrame(() => el.classList.add("in")); else el.classList.add("in", "still");
    const pull = async () => {
      if (!closing) return;
      closing.tries++;
      try {
        if (typeof refreshCirclepadCore === "function") await refreshCirclepadCore();
        if (typeof refreshCirclepadGovernance === "function") await refreshCirclepadGovernance();
      } catch { /* retry */ }
      const now = phase();
      if (now === "result" || now === "closed") {
        const c = closing; closing = { done: true, el: null };
        if (c && c.el) { c.el.classList.remove("in"); setTimeout(() => c.el.remove(), 300); }
        paintAll(); loadFeed();
        if (now === "result") setTimeout(() => reveal(false), 400);
        return;
      }
      if (closing.tries < 40) setTimeout(pull, closing.tries < 8 ? 2500 : 6000);
      else if (closing.el) { closing.el.remove(); closing.el = null; }
    };
    setTimeout(pull, 1200);
  }

  // ================= wiring =================
  function paintAll() {
    try { paintStrip(); paintHero(); paintNext(); paintTimeline(); paintProjects(); paintTreasury(); paintBallotNav(); paintRace(); } catch (err) { console.warn("circlepad-round", err); }
    aliveAll();
  }
  document.addEventListener("circlepad:state", paintAll);
  document.addEventListener("circlepad:lb", paintAll);
  document.addEventListener("circlepad:gov", () => { paintAll(); if (feed) paintFeed(); if (phase() === "result") setTimeout(() => reveal(false), 600); });
  document.addEventListener("circlepad:govpaint", () => { paintBallotNav(); if (feed) paintFeed(); });
  document.addEventListener("arc:lang", paintAll);
  document.addEventListener("circlepad:tz", paintAll);
  setInterval(() => {
    document.querySelectorAll("[data-cp-to]").forEach((el) => {
      const rem = Number(el.dataset.cpTo) - nowS();
      // a raise / vote clock that hit zero waits for the chain: say so instead of "0m 0s"
      el.textContent = rem <= 0 && el.closest(".cp-strip-clock, .cp-phero.voting, .cp-phero.upcoming") ? T("Closing…") : left(rem);
    });
    const gp = $("bp-panel-governance");
    document.body.classList.toggle("cp-gov-tab", !!(gp && gp.classList.contains("active")));
    paintTimeline();
    paintFinal();
    watchClose();
  }, 1000);
  setInterval(() => { if (!document.hidden && (phase() === "voting" || Date.now() - feedT > 60e3)) loadFeed(); }, 15000);
  setInterval(() => { if (!document.hidden) paintAll(); }, 30000);
  loadWallets().then(paintAll);
  loadFeed();
  paintAll();
  window.circlepadRound = { reveal: () => reveal(true), feed: () => feed, phase, winner, burnedTotal, deadline, votingEnds, left, lead, nowS };
})();
