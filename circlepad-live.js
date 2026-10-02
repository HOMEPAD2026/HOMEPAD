/* global CONFIG, state, fmtEth, govLogoUrl, govDate, govFmtDate, connectWallet, _circlepadState */
// circlepad-live.js — Round #1 while it's live:
//   · phones: the language switch lives in the tab menu, not the top bar
//   · Home: the coin being decided, the raise and the activity first; the
//     explainers move below them while the round runs
//   · My Position: contribution, rank, what #1 takes, my votes, my burn and
//     the airdrop on one screen
//   · Airdrop: "Eligible · contributed N USDC" once a wallet is connected
//   · a full-screen live board (clock, standings, burn counter) for streams
//     and X Spaces — the "Live screen" button, or /circle?live
//   · candidate tiles tilt and glow under the finger; the one just voted for
//     gets a flame border for a few seconds
// Every motion here is off under "reduce motion".
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const usdc = (wei, d = 2) => (typeof fmtEth === "function" ? fmtEth(wei, d) : String(wei));
  const ALT = (v, c) => (window.cpConv ? window.cpConv.html(v, c) : ""); // "≈ 0.04 ETH" under a USDC amount (circlepad-conv.js)
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const RD = () => window.circlepadRound || null;
  const R = () => (typeof _circlepadState !== "undefined" && _circlepadState) || null;
  const G = () => window.circlepadGov || null;
  const rows = () => window.circlepadLbRows || [];
  const phase = () => (RD() ? RD().phase() : "pre");
  const nowS = () => (RD() ? RD().nowS() : Math.floor(Date.now() / 1000));
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const live = () => { const p = phase(); return p === "raise" || p === "voting"; };
  const goTab = (t) => { const n = document.querySelector(`.bp-nav-item[data-tab="${t}"]`); if (n) n.click(); };

  // ================= phones: language in the menu =================
  function mountLangMenu() {
    const side = $("bp-sidebar"), top = document.querySelector(".bp-topbar .lang-toggle");
    if (!side || !top || $("cp-menu-lang")) return;
    const row = document.createElement("div");
    row.id = "cp-menu-lang"; row.className = "cp-menu-lang";
    row.innerHTML = `<span>${T("Language")}</span><div class="lang-toggle" role="group" aria-label="Language" data-no-i18n>${top.innerHTML}</div>`;
    row.addEventListener("click", (e) => {
      const b = e.target.closest("[data-l]");
      if (b && window.arcI18n) window.arcI18n.set(b.getAttribute("data-l"));
    });
    const navs = side.querySelectorAll(".bp-side-nav");
    (navs[navs.length - 1] || side).insertAdjacentElement("afterend", row);
    document.body.classList.add("cp-lang-in-menu");
  }

  // ================= Home: live things first while the round runs =================
  let ordered = false;
  function orderHome() {
    if (ordered || !live()) return;
    const home = $("bp-panel-home"), anchor = document.querySelector("#bp-panel-home > .bp-nextcard");
    if (!home || !anchor) return;
    ordered = true;
    // the launch process stays up top, under the round panel (circlepad-rounds.js)
    const explain = [".bp-hero", "#cp-flowcard", "#cpx-trust", ".cp-core-coin"].map((s) => home.querySelector(`:scope > ${s}`)).filter(Boolean);
    const lead = document.createElement("div");
    lead.className = "cp-home-more"; lead.id = "cp-home-more";
    lead.innerHTML = `<h3>${T("How CirclePad works")}</h3>`;
    anchor.insertAdjacentElement("beforebegin", lead);
    explain.forEach((el) => anchor.insertAdjacentElement("beforebegin", el));
    document.body.classList.add("cp-home-live");
  }

  // ================= My Position on one screen =================
  function myNumbers() {
    const r = R(), w = me(), list = rows(), g = G();
    const row = w ? list.find((x) => String(x.address).toLowerCase() === w) : null;
    const mine = row ? BigInt(row.amount) : r && r.myContribution != null ? BigInt(r.myContribution) : 0n;
    const rank = row ? list.indexOf(row) + 1 : 0;
    const top = list[0] || null;
    let votes = 0n, cats = 0;
    if (g && Array.isArray(g.categories)) g.categories.forEach((c) => { const s = c.options.reduce((a, o) => a + BigInt(o.mine || 0), 0n); votes += s; if (s > 0n) cats++; });
    const bal = g && g.burn && g.burn.bal != null ? BigInt(g.burn.bal) : null;
    return { r, w, list, mine, rank, top, votes, cats, bal, total: r ? BigInt(r.totalRaised || 0n) : 0n };
  }
  function paintPosition() {
    const panel = $("bp-panel-position");
    if (!panel) return;
    const wrap = panel.querySelector(".bp-simple");
    let box = $("cp-pos-sum");
    const n = myNumbers(), ph = phase();
    if (!n.w || !n.r || !n.r.started) { if (box) box.remove(); panel.classList.remove("cp-pos-on"); return; }
    if (!box) { box = document.createElement("section"); box.id = "cp-pos-sum"; box.className = "cp-pos"; const h1 = wrap.querySelector("h1"); if (h1) h1.insertAdjacentElement("afterend", box); else wrap.prepend(box); }
    panel.classList.add("cp-pos-on");
    const pct = n.total > 0n && n.mine > 0n ? (Number((n.mine * 10000n) / n.total) / 100).toFixed(2) : "0";
    const isTop = n.rank === 1;
    const second = n.list[1];
    let race;
    if (!n.top) race = [`<b>${T("Open")}</b>`, T("The first contribution takes #1")];
    else if (isTop) race = [`<b>${T("You're #1")}</b>`, second ? `<span>${T("ahead by")}</span> <span data-no-i18n>${usdc(n.mine - BigInt(second.amount))} USDC</span>` : T("the only contributor so far")];
    else race = [`<b data-no-i18n>&gt; ${usdc(BigInt(n.top.amount) - n.mine)}</b> <span data-no-i18n>USDC</span>`, `<span>${T("more takes #1 from")}</span> <span data-no-i18n>${short(n.top.address)}</span>`];
    const eligible = n.mine > 0n;
    const tile = (k, v, sub, cls = "") => `<div class="cp-pos-t ${cls}"><small>${T(k)}</small><div class="cp-pos-v">${v}</div><span class="cp-pos-s">${sub}</span></div>`;
    const html = `<div class="cp-pos-head"><span class="cp-pos-k" data-no-i18n>${esc(window.cpRT ? window.cpRT("CirclePad Round #1") : tr("CirclePad Round #1"))}</span><span class="cp-pos-w" data-no-i18n>${short(n.w)}</span></div>
      <div class="cp-pos-grid">
        ${tile("My contribution", `<b data-no-i18n>${usdc(n.mine)}</b> <span data-no-i18n>USDC</span>${n.mine > 0n ? ALT(n.mine, "cp-alt-sm") : ""}`, n.mine > 0n ? `<span data-no-i18n>${pct}%</span> <span>${T("of the raise")}</span>` : T("Nothing in yet"), "mine")}
        ${tile("My rank", n.rank ? `<b data-no-i18n>#${n.rank}</b>` : "<b>—</b>", n.rank ? `<span>${T("of")}</span> <span data-no-i18n>${num(n.list.length)}</span> <span>${T("contributors")}</span>` : T("Contribute to get a rank"), isTop ? "top" : "")}
        ${tile("Race for #1 (the 15%)", race[0], race[1], isTop ? "top" : "")}
        ${tile("My votes", `<b data-no-i18n>${num(n.votes.toString())}</b>`, n.votes > 0n ? `<span>${T("in")}</span> <span data-no-i18n>${n.cats}/5</span> <span>${T("categories")}</span>` : T(ph === "voting" ? "Voting is open" : "No votes yet"))}
        ${tile("Burned by me", `<b data-no-i18n>${num((n.votes * 1000n).toString())}</b> <span data-no-i18n>$ARCIRCLE</span>`, n.bal != null ? `<span>${T("Wallet:")}</span> <span data-no-i18n>${num((n.bal / 10n ** 18n).toString())} $ARCIRCLE</span>` : T("1 vote = 1,000 $ARCIRCLE"), "burn")}
        ${tile("Airdrop", `<b>${T(eligible ? "Eligible" : "Not yet")}</b>`, eligible ? T("Size not decided yet") : T("Contribute before the close"), eligible ? "ok" : "")}
      </div>
      <div class="cp-pos-acts">${n.r.isOpen ? `<button type="button" class="bp-btn-primary" data-cp-go="home">${T(n.mine > 0n ? "Add more" : "Contribute")}</button>` : ""}${ph === "voting" ? `<button type="button" class="bp-btn-ghost" data-cp-go="governance">${T("Burn & vote")}</button>` : ""}${n.r.isOpen && n.mine > 0n ? `<button type="button" class="bp-btn-ghost" data-cp-go="home">${T("Withdraw")}</button>` : ""}</div>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ================= Airdrop: am I in? =================
  function paintAirdrop() {
    const note = $("cp-airdrop-note");
    if (!note) return;
    let box = $("cp-airdrop-me");
    if (!box) { box = document.createElement("div"); box.id = "cp-airdrop-me"; box.className = "cp-ad-me"; note.insertAdjacentElement("beforebegin", box); box.addEventListener("click", async (e) => { if (e.target.closest("[data-cp-connect]") && typeof connectWallet === "function") { try { await connectWallet(); } catch { /* cancelled */ } } }); }
    const n = myNumbers(), r = n.r;
    let html;
    if (!n.w) html = `<div class="cp-ad-row"><span class="cp-ad-dot" aria-hidden="true"></span><div><b>${T("Check your wallet")}</b><p>${T("Connect to see whether this wallet is in the airdrop.")}</p></div><button type="button" class="bp-btn-primary" data-cp-connect>${T("Connect wallet")}</button></div>`;
    else if (n.mine > 0n) html = `<div class="cp-ad-row ok"><span class="cp-ad-dot" aria-hidden="true"></span><div><b><span>${T("Eligible")}</span> · <span>${T("contributed")}</span> <span data-no-i18n>${usdc(n.mine)} USDC</span></b><p>${T(r && r.isOpen ? "Keep a contribution in until the close — the list at the close is what counts." : "This wallet is on the contributor list at the close.")}</p></div></div>`;
    else html = `<div class="cp-ad-row"><span class="cp-ad-dot" aria-hidden="true"></span><div><b>${T("Not eligible yet")}</b><p>${T(r && r.isOpen ? "Contribute any amount before the close to be in the airdrop." : (window.cpRN && window.cpRN() > 1 ? "This wallet didn't contribute to this round." : "This wallet didn't contribute to Round #1."))}</p></div>${r && r.isOpen ? `<button type="button" class="bp-btn-primary" data-cp-go="home">${T("Contribute")}</button>` : ""}</div>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ================= the live screen =================
  const KIND = ["name", "ticker", "logo", "roadmap", "date"];
  function optFace(cat, text, k) {
    const t = String(text || "");
    if (cat === 2) return `<span class="cp-ls-logo"><em data-no-i18n>#${k + 1}</em>${typeof govLogoUrl === "function" && govLogoUrl(t) ? `<img src="${esc(govLogoUrl(t))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`;
    if (cat === 1) return esc("$" + t.replace(/^\$/, ""));
    if (cat === 4 && typeof govDate === "function" && govDate(t)) return esc(govFmtDate(govDate(t)));
    return esc(t.split("\n")[0]);
  }
  let ls = null, lsT = 0;
  function lsClock() {
    if (!ls) return;
    const ph = phase(), rd = RD();
    const ends = rd ? (ph === "voting" ? rd.votingEnds() : rd.deadline()) : 0;
    const sec = Math.max(0, ends - nowS());
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p2 = (x) => String(x).padStart(2, "0");
    const parts = [[d, "days"], [p2(h), "hours"], [p2(m), "min"], [p2(s), "sec"]];
    const el = ls.querySelector(".cp-ls-digits");
    if (el) el.innerHTML = parts.map(([v, k]) => `<span><b data-no-i18n>${v}</b><small>${T(k)}</small></span>`).join("<i>:</i>");
    ls.classList.toggle("hot", sec > 0 && sec <= 600);
    const lab = ls.querySelector(".cp-ls-clock > small");
    if (lab) lab.textContent = tr(!live() ? "The round has closed" : ph === "voting" && R() && R().isOpen ? "Raise & voting close in" : ph === "voting" ? "Voting closes in" : "Raise closes in");
  }
  function lsBody() {
    if (!ls) return;
    const r = R(), g = G(), rd = RD();
    const burned = rd ? rd.burnedTotal() : 0n;
    let votes = 0n;
    const board = g && Array.isArray(g.categories) ? g.categories.filter((c) => c.set).map((c) => {
      const sum = c.options.reduce((a, o) => a + BigInt(o.weight || 0), 0n);
      votes += sum;
      const top = c.options.map((o, i) => ({ ...o, i })).sort((a, b) => (BigInt(b.weight) > BigInt(a.weight) ? 1 : BigInt(b.weight) < BigInt(a.weight) ? -1 : a.i - b.i)).slice(0, 3);
      return `<div class="cp-ls-cat k-${KIND[c.id]}"><h4>${window.cpCatIcon ? window.cpCatIcon(c.id) : ""}${T(c.label)}</h4><ol>${top.map((o, k) => {
        const pct = sum > 0n ? Number((BigInt(o.weight) * 1000n) / sum) / 10 : 0;
        return `<li class="${k === 0 && sum > 0n ? "lead" : ""}"><span class="cp-ls-face">${optFace(c.id, o.text, o.i)}</span><span class="cp-ls-bar"><i style="width:${pct}%"></i></span><b data-no-i18n>${pct ? pct.toFixed(pct >= 10 ? 0 : 1) + "%" : "0%"}</b></li>`;
      }).join("")}</ol></div>`;
    }).join("") : "";
    const top = rows()[0];
    const html = `<div class="cp-ls-stats">
        <div><small>${T("Raised")}</small><b data-no-i18n>${r ? usdc(r.totalRaised || 0n, 0) : "0"}</b><span>USDC</span>${r ? ALT(r.totalRaised || 0n, "cp-alt-sm") : ""}</div>
        <div class="burn"><small>${T("Burned by votes")}</small><b data-no-i18n data-cp-burned>${num((burned / 10n ** 18n).toString())}</b><span>$ARCIRCLE</span></div>
        <div><small>${T("Votes")}</small><b data-no-i18n>${num(votes.toString())}</b><span>${T("1 vote = 1,000 $ARCIRCLE")}</span></div>
        <div><small>${T("Top contributor")}</small><b data-no-i18n>${top ? short(top.address) : "—"}</b><span data-no-i18n>${top ? usdc(top.amount) + " USDC" : ""}</span></div>
      </div>
      <div class="cp-ls-board">${board || `<p class="cp-ls-empty">${T("Candidates show up here once they're published.")}</p>`}</div>`;
    const body = ls.querySelector(".cp-ls-body");
    if (body.__html !== html) { body.innerHTML = html; body.__html = html; }
    lsT = Date.now();
  }
  function openLive(full) {
    if (ls) return;
    ls = document.createElement("div");
    ls.className = "cp-ls"; ls.setAttribute("role", "dialog"); ls.setAttribute("aria-label", tr("Live screen"));
    ls.innerHTML = `<div class="cp-ls-top"><span class="cp-ls-brand"><i aria-hidden="true"></i><b>CirclePad</b> <span data-no-i18n>${esc(window.cpRT ? window.cpRT("Round #1 · live") : tr("Round #1 · live"))}</span></span><div class="cp-ls-btns"><button type="button" class="cp-ls-fs" data-ls-fs>${T("Full screen")}</button><button type="button" class="cp-ls-x" data-ls-close aria-label="${T("Close")}">×</button></div></div>
      <div class="cp-ls-clock"><small></small><div class="cp-ls-digits"></div></div>
      <div class="cp-ls-body"></div>
      <div class="cp-ls-foot" data-no-i18n>arcircle.app/circle</div>`;
    document.body.appendChild(ls);
    document.body.classList.add("cp-ls-open");
    if (reduce()) ls.classList.add("still");
    lsClock(); lsBody();
    requestAnimationFrame(() => ls && ls.classList.add("in"));
    if (full && ls.requestFullscreen) ls.requestFullscreen().catch(() => { /* not allowed here */ });
    ls.addEventListener("click", (e) => {
      if (e.target.closest("[data-ls-close]")) closeLive();
      else if (e.target.closest("[data-ls-fs]")) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (ls.requestFullscreen) ls.requestFullscreen().catch(() => {}); }
    });
  }
  function closeLive() {
    if (!ls) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const el = ls; ls = null;
    document.body.classList.remove("cp-ls-open");
    el.classList.remove("in"); setTimeout(() => el.remove(), 250);
    try { const u = new URL(location.href); if (u.searchParams.has("live")) { u.searchParams.delete("live"); history.replaceState(null, "", u.pathname + u.search + u.hash); } } catch { /* fine */ }
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ls) closeLive(); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-cp-live]")) openLive(true); });

  // ================= candidate tiles: tilt, glow, a flame after my vote =================
  const TILE = '.bp-gov-cat[data-kind="logo"] .bp-gov-option:not(.gv-open)';
  document.addEventListener("pointermove", (e) => {
    if (reduce() || e.pointerType !== "mouse") return;
    const t = e.target.closest && e.target.closest(TILE);
    document.querySelectorAll(".bp-gov-option.cp-tilt").forEach((x) => { if (x !== t) { x.classList.remove("cp-tilt"); x.style.removeProperty("--rx"); x.style.removeProperty("--ry"); } });
    if (!t) return;
    const b = t.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    t.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg"); t.style.setProperty("--ry", (x * 12).toFixed(2) + "deg");
    t.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(0) + "%"); t.style.setProperty("--gy", ((y + 0.5) * 100).toFixed(0) + "%");
    t.classList.add("cp-tilt");
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (reduce() || e.pointerType === "mouse") return;
    const t = e.target.closest && e.target.closest(TILE);
    if (!t || e.target.closest("button, a, input")) return;
    t.classList.remove("cp-tap"); void t.offsetWidth; t.classList.add("cp-tap");
    setTimeout(() => t.classList.remove("cp-tap"), 650);
  }, { passive: true });
  let justVoted = null;
  function flameVoted() {
    if (!justVoted) return;
    if (Date.now() > justVoted.until) { justVoted = null; document.querySelectorAll(".cp-voted-flame").forEach((x) => x.classList.remove("cp-voted-flame")); return; }
    const el = document.querySelector(`.bp-gov-option[data-category="${justVoted.cat}"][data-option="${justVoted.opt}"]`);
    if (el && !el.classList.contains("cp-voted-flame")) el.classList.add("cp-voted-flame");
  }
  document.addEventListener("circlepad:burnvote", (e) => {
    const d = e.detail || {};
    if (d.category == null || d.option == null) return;
    justVoted = { cat: d.category, opt: d.option, until: Date.now() + 6000 };
    flameVoted();
    setTimeout(flameVoted, 6100);
  });

  // ================= wiring =================
  function paintAll() {
    try { orderHome(); paintPosition(); paintAirdrop(); if (ls && Date.now() - lsT > 1500) lsBody(); flameVoted(); } catch (err) { console.warn("circlepad-live", err); }
  }
  ["circlepad:state", "circlepad:lb", "circlepad:gov", "circlepad:govpaint", "circlepad:burns", "arc:lang"].forEach((ev) => document.addEventListener(ev, paintAll));
  document.addEventListener("arc:lang", () => { const m = $("cp-menu-lang"); if (m) m.querySelector("span").textContent = tr("Language"); });
  setInterval(() => { lsClock(); if (ls && Date.now() - lsT > 5000) lsBody(); }, 1000);
  const start = () => {
    mountLangMenu(); paintAll();
    try { if (new URLSearchParams(location.search).has("live")) openLive(false); } catch { /* fine */ }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
