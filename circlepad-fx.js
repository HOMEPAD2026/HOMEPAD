/* global applyCirclepadState, renderCirclepadLeaderboard, renderCirclepadGovernance, updateCirclepadCountdown, _circlepadDeadline, _circlepadStarted, _circlepadState, ethers, state */
// circlepad-fx.js — CirclePad's round card, layout and motion layer.
// circlepad.js stays the source of truth for the escrow (it reads the chain
// and writes the plain numbers); this file wraps its render functions and
// adds, on top of what they draw:
//   • a progress ring with the raised amount counting up (milestones when
//     the round is uncapped), a live glint while the raise is open
//   • a flip-digit countdown that turns urgent in the final hour
//   • "join the circle" when this wallet's contribution goes up
//   • leaderboard rows that slide to their new rank, vote bars that grow
//   • the Launch process as a full-width timeline with the current stage lit
//   • the 80/5/15 close split drawn as bars that fill when scrolled into view
//   • sidebar tidy-up (coming-soon tabs grouped), quick bar → round actions,
//     hero parallax
(function () {
  "use strict";
  if (!document.body.classList.contains("circlepad-page") || typeof applyCirclepadState !== "function") return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const toNum = (wei) => { try { return Number(ethers.formatEther(wei || 0n)); } catch (e) { return 0; } };
  const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 4 });
  const short$ = (n) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n));
  const clickTab = (tab) => { const b = document.querySelector(`.bp-nav-item[data-tab="${tab}"]`); if (b) b.click(); };
  const MILESTONES = [1e3, 5e3, 1e4, 25e3, 5e4, 1e5, 25e4, 5e5, 1e6, 25e5, 5e6, 1e7];
  let S = null; // last state painted

  // ================= sidebar: group the not-yet-live tabs =================
  const SOON = ["airdrop", "treasury"];
  (function sidebar() {
    const btns = SOON.map((t) => document.querySelector(`.bp-side-nav .bp-nav-item[data-tab="${t}"]`)).filter(Boolean);
    if (!btns.length) return;
    btns.forEach((b) => b.classList.add("cp-soon-item"));
    const pos = document.querySelector('.bp-side-nav .bp-nav-item[data-tab="position"]');
    if (pos) pos.classList.add("cp-when-live");
    const docs = document.querySelector('.bp-side-nav .bp-nav-item[data-tab="docs"]');
    const line = document.createElement("div");
    line.className = "cp-soon-line";
    line.innerHTML = `<span class="cp-soon-label">Coming soon</span>${btns.map((b) => `<button type="button" data-soon="${b.dataset.tab}">${b.textContent.trim()}</button>`).join('<span aria-hidden="true">·</span>')}`;
    line.addEventListener("click", (e) => { const b = e.target.closest("[data-soon]"); if (b) clickTab(b.dataset.soon); });
    (docs ? docs.parentNode : btns[0].parentNode).appendChild(line);
  })();

  // ================= round ring =================
  const panel = $("bp-round-panel");
  let ring = null, amtEl = null, subEl = null, metaEl = null;
  if (panel) {
    const R = 86, C = 2 * Math.PI * R;
    ring = document.createElement("div");
    ring.className = "cp-ring";
    ring.dataset.state = "idle";
    ring.style.setProperty("--cp-c", C.toFixed(1));
    ring.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">
        <defs><linearGradient id="cpRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f9bff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>
        <circle class="cp-ring-track" cx="100" cy="100" r="${R}"/>
        <circle class="cp-ring-fill" cx="100" cy="100" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
        <circle class="cp-ring-glint" cx="100" cy="100" r="${R}" stroke-dasharray="18 ${(C - 18).toFixed(1)}"/>
        <circle class="cp-ring-inner" cx="100" cy="100" r="66"/>
      </svg>
      <div class="cp-ring-center"><b class="cp-ring-amt" data-no-i18n>0</b><span class="cp-ring-unit">USDC</span><small class="cp-ring-sub">raised</small></div>`;
    metaEl = document.createElement("div");
    metaEl.className = "cp-ring-meta";
    const status = $("bp-round-status");
    (status || panel.firstChild).insertAdjacentElement(status ? "afterend" : "beforebegin", ring);
    ring.insertAdjacentElement("afterend", metaEl);
    amtEl = ring.querySelector(".cp-ring-amt"); subEl = ring.querySelector(".cp-ring-sub");
    panel.classList.add("cp-has-ring");
  }
  let shown = 0, raf = 0;
  function countTo(to) {
    if (!amtEl) return;
    const from = shown; shown = to;
    if (reduce || from === to) { amtEl.textContent = fmt(to); return; }
    cancelAnimationFrame(raf);
    const t0 = performance.now(), dur = from === 0 ? 900 : 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      amtEl.textContent = fmt(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step); else amtEl.textContent = fmt(to);
    };
    raf = requestAnimationFrame(step);
    if (to > from && from > 0) { ring.classList.remove("cp-bump"); void ring.offsetWidth; ring.classList.add("cp-bump"); }
  }
  function paintRing(s) {
    if (!ring) return;
    const raised = toNum(s.totalRaised), cap = toNum(s.cap);
    let pct, sub, meta;
    if (!s.started) {
      pct = 0; sub = tr(pledged > 0 ? "pledged so far" : "opens soon");
      meta = `<span class="cp-meta-note">${tr("No cap — withdraw your own USDC any time before the raise closes.")}</span>`;
    } else if (cap > 0) {
      pct = Math.min(1, raised / cap); sub = `${tr("Goal")} ${fmt(cap)}`;
      meta = `<span class="cp-meta-note">${Math.round(pct * 100)}% ${tr("of the goal")}</span>`;
    } else {
      const next = MILESTONES.find((m) => m > raised) || MILESTONES[MILESTONES.length - 1];
      pct = Math.min(1, raised / next); sub = tr(s.isOpen ? "raised · uncapped" : "raised in total");
      meta = s.isOpen
        ? `<span class="cp-meta-next">${tr("Next milestone")} <b data-no-i18n>$${short$(next)}</b></span><span class="cp-meta-note">${tr("No cap — withdraw your own USDC any time before the raise closes.")}</span>`
        : `<span class="cp-meta-note">${tr("Final total — the raise has closed.")}</span>`;
      // Crossing a milestone while watching: a quick flash of the full ring.
      const prevRaised = S ? toNum(S.totalRaised) : raised;
      const crossed = MILESTONES.find((m) => prevRaised < m && raised >= m);
      if (crossed && S && S.started) milestone(crossed);
    }
    const urgent = s.isOpen && _circlepadDeadline && _circlepadDeadline - Date.now() / 1000 < 3600;
    ring.dataset.state = !s.started ? "idle" : s.isOpen ? (urgent ? "urgent" : "live") : "closed";
    ring.style.setProperty("--cp-p", pct.toFixed(4));
    subEl.textContent = sub;
    if (metaEl.__html !== meta) { metaEl.innerHTML = meta; metaEl.__html = meta; }
    countTo(!s.started && pledged > 0 ? pledged : raised);
    paintTop(s, raised);
  }
  // Before the raise opens the ring shows what has been pledged
  // (circlepad-community.js reports it).
  let pledged = 0;
  window.circlepadFx = {
    setPledged(total) { const t = Number(total) || 0; if (t !== pledged) { pledged = t; if (S) paintRing(S); } },
    mine: () => (S && S.myContribution ? toNum(S.myContribution) : 0),
    setPledgers(list) { pledgers = Array.isArray(list) ? list : []; if (!(S && S.started)) paintContributors(lastRows); },
    coinDrop(fromEl) { flyTo(fromEl, "cp-coin", () => { if (ring) { ring.classList.remove("cp-bump"); void ring.offsetWidth; ring.classList.add("cp-bump"); } }); },
  };
  // A small token flying from a button into the ring (pledge coin, join ring).
  function flyTo(fromEl, cls, done) {
    if (!ring || reduce) { if (done) done(); return; }
    const from = (fromEl || ring).getBoundingClientRect(), to = ring.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = cls;
    el.style.left = `${from.left + from.width / 2}px`; el.style.top = `${from.top + from.height / 2}px`;
    el.style.setProperty("--dx", `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    el.style.setProperty("--dy", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("go"));
    setTimeout(() => { el.remove(); if (done) done(); }, 760);
  }

  // ================= top bar pill + tab title =================
  const baseTitle = document.title;
  let pill = null;
  (function topPill() {
    const bar = document.querySelector(".bp-topbar");
    if (!bar) return;
    pill = document.createElement("button");
    pill.type = "button"; pill.className = "cp-top-pill"; pill.hidden = true;
    pill.innerHTML = `<span class="cp-tp-dot"></span><span class="cp-tp-state"></span><b class="cp-tp-amt" data-no-i18n></b><span class="cp-tp-time" data-no-i18n></span>`;
    pill.addEventListener("click", () => document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: "round" })));
    bar.insertBefore(pill, bar.firstChild);
  })();
  let topShown = -1;
  function paintTop(s, raised) {
    if (s.started) document.title = `${fmt(raised)} USDC ${s.isOpen ? "raised" : "final"} · CirclePad`;
    else document.title = baseTitle;
    if (!pill) return;
    pill.hidden = !s.started && !(pledged > 0);
    pill.dataset.state = !s.started ? "idle" : s.isOpen ? "live" : "closed";
    pill.querySelector(".cp-tp-state").textContent = tr(!s.started ? "Pledged" : s.isOpen ? "LIVE" : "Closed");
    const v = !s.started ? pledged : raised;
    if (v !== topShown) {
      const el = pill.querySelector(".cp-tp-amt");
      el.textContent = `${fmt(v)} USDC`;
      if (topShown >= 0 && v > topShown && !reduce) { el.classList.remove("cp-tick"); void el.offsetWidth; el.classList.add("cp-tick"); }
      topShown = v;
    }
  }
  function paintTopTime() {
    if (!pill || pill.hidden) return;
    const t = pill.querySelector(".cp-tp-time");
    if (!_circlepadStarted || !_circlepadDeadline) { t.textContent = ""; return; }
    const rem = _circlepadDeadline - Math.floor(Date.now() / 1000);
    t.textContent = rem <= 0 ? "" : rem >= 86400 ? `${Math.floor(rem / 86400)}d ${Math.floor((rem % 86400) / 3600)}h` : `${Math.floor(rem / 3600)}h ${Math.floor((rem % 3600) / 60)}m`;
  }
  setInterval(paintTopTime, 15e3);

  // ================= contributors: orbit around the ring + media box =================
  let orbit = null;
  if (ring) {
    orbit = document.createElement("div");
    orbit.className = "cp-orbit";
    orbit.setAttribute("aria-hidden", "true");
    ring.appendChild(orbit);
  }
  const media = document.querySelector("#bp-featured .bp-featured-media");
  if (media) {
    media.classList.add("cp-media");
    media.innerHTML = `<span class="cp-media-round">Round</span><b class="cp-media-n" data-no-i18n>#1</b><span class="cp-media-stack" id="cp-media-stack"></span><span class="cp-media-count" id="cp-media-count">No contributors yet</span>`;
  }
  const seenDots = new Set();
  // Before the raise the orbit shows pledgers (gold); once it opens, the
  // contributors (each in their wallet's colour), sized by share.
  let pledgers = [], lastRows = [];
  function paintOrbit(list, gold) {
    if (!orbit) return;
    const total = list.reduce((t, x) => t + x.v, 0);
    const top = list.slice(0, 24);
    orbit.classList.toggle("cp-orbit-gold", !!gold);
    orbit.innerHTML = top.map((x, i) => {
      const a = String(x.a).toLowerCase(), share = total ? x.v / total : 0;
      const size = Math.round(8 + Math.sqrt(share) * 26), ang = (360 / Math.max(top.length, 1)) * i;
      const isNew = seenDots.size && !seenDots.has((gold ? "g" : "c") + a);
      return `<i class="cp-odot${isNew ? " is-new" : ""}" style="--a:${ang}deg;--z:${size}px;--h:${(parseInt(a.slice(2, 8), 16) || 0) % 360}"></i>`;
    }).join("");
    top.forEach((x) => seenDots.add((gold ? "g" : "c") + String(x.a).toLowerCase()));
  }
  function paintContributors(rows) {
    lastRows = rows;
    if (S && S.started) paintOrbit(rows.map((r) => ({ a: r.address, v: toNum(r.amount) })), false);
    else paintOrbit(pledgers.map((p) => ({ a: p.wallet, v: Number(p.amount) || 0 })), true);
    const stack = $("cp-media-stack"), count = $("cp-media-count");
    if (stack) stack.innerHTML = rows.slice(0, 5).map((r) => `<i style="--h:${(parseInt(String(r.address).slice(2, 8), 16) || 0) % 360}"></i>`).join("");
    if (count) count.textContent = rows.length ? `${rows.length} ${tr(rows.length === 1 ? "contributor" : "contributors")}` : tr("No contributors yet");
  }

  // ================= recent activity ticker =================
  let ticker = null;
  const featured = $("bp-featured");
  if (featured) {
    ticker = document.createElement("div");
    ticker.className = "cp-ticker"; ticker.hidden = true;
    ticker.setAttribute("aria-label", "Recent activity");
    featured.insertBefore(ticker, featured.firstChild);
  }
  function paintTicker(activity) {
    if (!ticker) return;
    const items = (activity || []).slice(0, 12);
    ticker.hidden = !items.length;
    if (!items.length) return;
    const ago = (ts) => { const d = Math.max(1, Math.floor(Date.now() / 1000) - ts); return d < 60 ? "just now" : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };
    const one = items.map((a) => `<span class="cp-tk-item cp-tk-${a.kind}"><i style="--h:${(parseInt(String(a.contributor).slice(2, 8), 16) || 0) % 360}"></i><b data-no-i18n>${String(a.contributor).slice(0, 6)}…${String(a.contributor).slice(-4)}</b><span data-no-i18n>${a.kind === "out" ? "−" : "+"}${fmt(toNum(a.amount))} USDC</span><em data-no-i18n>${ago(a.ts)}</em></span>`).join("");
    const html = `<div class="cp-tk-track${items.length > 2 && !reduce ? " run" : ""}" style="--n:${items.length}">${one}${items.length > 2 && !reduce ? one : ""}</div>`;
    if (ticker.__html !== html) { ticker.innerHTML = html; ticker.__html = html; }
  }

  // ================= leaderboard tab: podium + share bars =================
  function paintPodium(rows) {
    const full = $("bp-full-leaderboard");
    if (!full) return;
    let pod = $("cp-podium");
    if (rows.length < 1) { if (pod) pod.remove(); return; }
    if (!pod) { pod = document.createElement("div"); pod.id = "cp-podium"; pod.className = "cp-podium"; full.parentNode.insertBefore(pod, full); }
    const total = rows.reduce((t, r) => t + toNum(r.amount), 0);
    const top = rows.slice(0, 3);
    const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);
    const html = order.map((i) => { const r = top[i], a = String(r.address).toLowerCase(), pct = total ? (toNum(r.amount) / total) * 100 : 0;
      return `<div class="cp-pod cp-pod-${i + 1}" style="--d:${i * 0.12}s"><span class="cp-pod-av" style="--h:${(parseInt(a.slice(2, 8), 16) || 0) % 360}"></span><b data-no-i18n>${a.slice(0, 6)}…${a.slice(-4)}</b><span data-no-i18n>${fmt(toNum(r.amount))} USDC</span><em data-no-i18n>${pct.toFixed(pct >= 10 ? 0 : 1)}%</em><div class="cp-pod-step" data-no-i18n>${i + 1}</div></div>`; }).join("");
    if (pod.__html !== html) { pod.innerHTML = html; pod.__html = html; pod.classList.remove("in"); void pod.offsetWidth; pod.classList.add("in"); }
    full.querySelectorAll(".bp-lb-row").forEach((row) => {
      const pctEl = row.querySelector(".bp-lb-pct");
      const pct = pctEl ? parseFloat(pctEl.textContent) || 0 : 0;
      row.style.setProperty("--cp-share", `${Math.min(100, pct)}%`);
      row.classList.add("cp-shared");
    });
  }

  // ---- the two big moments, when they happen while someone is watching ----
  function flash(text, cls) {
    if (!ring) return;
    const f = document.createElement("div");
    f.className = "cp-ring-flash " + (cls || "");
    f.innerHTML = `<b>${text}</b>`;
    ring.appendChild(f);
    setTimeout(() => f.remove(), 2600);
  }
  function ignite() {
    if (!ring) return;
    ring.classList.remove("cp-ignite"); void ring.offsetWidth; ring.classList.add("cp-ignite");
    if (orbit) orbit.classList.add("cp-to-green");
    setTimeout(() => { if (orbit) orbit.classList.remove("cp-to-green"); paintContributors(lastRows); }, 1400);
    flash(tr("The raise is open"), "cp-flash-open");
    if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: 90 });
    if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
    if (typeof window.arcToast === "function") window.arcToast(tr("The raise is open — 72 hours starting now."));
  }
  let finalized = false;
  function finalize() {
    if (!ring || finalized) return;
    finalized = true;
    ring.classList.add("cp-final");
    const st = document.createElement("div");
    st.className = "cp-stamp"; st.textContent = tr("FINAL");
    ring.appendChild(st);
    if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
  }

  function milestone(m) {
    if (!ring) return;
    ring.classList.remove("cp-milestone"); void ring.offsetWidth; ring.classList.add("cp-milestone");
    if (typeof window.arcToast === "function") window.arcToast(`${tr("The raise just passed")} $${short$(m)}`);
    if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: 60 });
  }

  // The round stats sit under the description on wide screens (instead of
  // a separate row under the whole card), so the left column isn't empty
  // next to the tall ring panel.
  (function statsInCard() {
    const main = document.querySelector("#bp-featured .bp-featured-main"), stats = document.querySelector("#bp-featured .bp-mini-stats");
    if (main && stats) { main.appendChild(stats); main.classList.add("cp-main"); }
  })();

  // ================= join the circle =================
  let mine = { acct: null, v: null };
  function joinCircle(addr) {
    if (!ring || reduce) return;
    const from = ($("bp-contribute-btn") || ring).getBoundingClientRect(), to = ring.getBoundingClientRect();
    const hue = (parseInt(String(addr).slice(2, 8), 16) || 0) % 360;
    const dot = document.createElement("div");
    dot.className = "cp-join";
    dot.style.setProperty("--h", hue);
    dot.style.left = `${from.left + from.width / 2}px`; dot.style.top = `${from.top + from.height / 2}px`;
    dot.style.setProperty("--dx", `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    dot.style.setProperty("--dy", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    document.body.appendChild(dot);
    requestAnimationFrame(() => dot.classList.add("go"));
    setTimeout(() => {
      dot.remove();
      ring.classList.remove("cp-joined"); void ring.offsetWidth; ring.classList.add("cp-joined");
      if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 50 });
      if (typeof window.arcToast === "function") window.arcToast(tr("You're in the circle."));
    }, 750);
  }
  function checkJoin(s, opts) {
    if (opts && opts.accountUnknown) return;
    const acct = state && state.account ? String(state.account).toLowerCase() : null;
    const v = s.myContribution || 0n;
    if (acct && mine.acct === acct && mine.v != null && v > mine.v) { joinCircle(acct); if (typeof window.arcFeedback === "function") window.arcFeedback("buy"); }
    mine = { acct, v: acct ? v : null };
  }

  // ================= stage: timeline + quick bar + sidebar =================
  const stageOf = (s) => (!s || !s.started ? -1 : s.isOpen ? 0 : s.distributed ? 4 : 3);
  let timeline = null;
  (function buildTimeline() {
    const steps = document.querySelector(".bp-row3 .bp-steps");
    if (!steps) return;
    const card = steps.closest(".bp-card"), row = card.parentNode;
    timeline = document.createElement("section");
    timeline.className = "cp-timeline";
    const head = card.querySelector(".bp-card-head");
    timeline.innerHTML = `<div class="cp-tl-head"><h3>${head ? head.textContent.trim() : "Launch process"} <span class="cp-tl-tag">Full design</span></h3><span class="cp-tl-now" id="cp-tl-now"></span></div>`;
    timeline.appendChild(steps);
    const note = document.createElement("p");
    note.className = "cp-tl-note";
    note.textContent = "Round #1's contract runs the 72-hour raise and the 80 / 15 / 5 split at the close. Lead preparation, the LP step and vesting are the full CirclePad design, still in review.";
    timeline.appendChild(note);
    row.parentNode.insertBefore(timeline, row);
    card.remove();
    row.classList.add("cp-row2");
  })();
  function paintStage(s) {
    const st = stageOf(s);
    document.body.classList.toggle("cp-started", !!(s && s.started));
    document.body.classList.toggle("cp-open", !!(s && s.isOpen));
    if (timeline) {
      const lis = [...timeline.querySelectorAll(".bp-steps > li")];
      // live: funding + governance run side by side (steps 1 and 2)
      lis.forEach((li, i) => {
        const now = st === 0 ? i <= 1 : st === i;
        li.classList.toggle("is-now", now);
        li.classList.toggle("is-done", st >= 0 && (st === 0 ? false : i < st));
      });
      const label = $("cp-tl-now");
      if (label) label.textContent = st < 0 ? tr("Waiting for the raise to open") : st === 0 ? tr("Live — raise open") : st === 3 ? tr("Raise closed") : tr("Distributed");
      timeline.style.setProperty("--cp-tl", st < 0 ? 0 : st === 0 ? 0.25 : Math.min(1, (st + 0.5) / 5));
    }
    paintQuick(s);
  }

  // Quick bar: it is now the same Launch / Explore / Utilities bar on every
  // page, so these only act if a [data-cp] item is ever put back in it.
  const RING_ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/></svg>';
  function paintQuick(s) {
    const q = document.querySelector('nav.ax-quick [data-cp="round"]');
    if (!q) return;
    const label = !s || !s.started ? "The round" : s.isOpen ? "Contribute" : "Results";
    const sp = q.querySelector("span:last-child");
    if (sp && sp.textContent !== tr(label)) sp.textContent = tr(label);
    const bar = q.closest("nav.ax-quick");
    // While the raise is open the bar stays put on phones — it is the
    // shortcut to contributing, so it shouldn't hide on scroll.
    bar.classList.toggle("ax-quick-pinned", !!(s && s.isOpen));
    let prog = q.querySelector(".cp-q-prog");
    if (s && s.isOpen) {
      if (!prog) { prog = document.createElement("i"); prog.className = "cp-q-prog"; q.appendChild(prog); }
      prog.style.setProperty("--p", ring ? ring.style.getPropertyValue("--cp-p") || 0 : 0);
    } else if (prog) prog.remove();
  }
  document.addEventListener("circlepad:quick", (e) => {
    const k = e.detail;
    if (k === "leaderboard") { clickTab("leaderboard"); return; }
    clickTab("home");
    setTimeout(() => {
      const target = $("bp-round-panel") || $("bp-featured");
      if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      const input = $("bp-contribute-amount");
      if (S && S.isOpen && input) setTimeout(() => input.focus({ preventScroll: true }), 450);
      if (ring) { ring.classList.remove("cp-bump"); void ring.offsetWidth; ring.classList.add("cp-bump"); }
    }, 60);
  });
  (function quickIcon() {
    const q = document.querySelector('nav.ax-quick [data-cp="round"] .ax-quick-ico');
    if (q) q.innerHTML = RING_ICO;
    const l = document.querySelector('nav.ax-quick [data-cp="leaderboard"] .ax-quick-ico');
    if (l) l.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>';
  })();

  // ================= wrap applyCirclepadState =================
  const origApply = applyCirclepadState;
  // eslint-disable-next-line no-global-assign
  applyCirclepadState = function (s, opts) {
    origApply(s, opts);
    if (!s) return;
    const prev = S;
    S = S || s;
    try { paintRing(s); checkJoin(s, opts); paintStage(s); paintSplit(s); paintTopTime(); } catch (e) { console.warn("circlepad-fx", e); }
    if (prev && !(opts && opts.accountUnknown)) {
      if (!prev.started && s.started) setTimeout(ignite, 50);
      else if (prev.isOpen && s.started && !s.isOpen) setTimeout(finalize, 50);
    }
    S = s;
    document.dispatchEvent(new CustomEvent("circlepad:state"));
  };

  // ================= countdown: flip digits, urgent last hour =================
  if (typeof updateCirclepadCountdown === "function") {
    const origCd = updateCirclepadCountdown;
    const cd = $("bp-round-countdown");
    let last = {};
    // eslint-disable-next-line no-global-assign
    updateCirclepadCountdown = function () {
      origCd();
      if (!cd || !_circlepadStarted || _circlepadDeadline == null) { last = {}; return; }
      const rem = _circlepadDeadline - Math.floor(Date.now() / 1000);
      if (rem <= 0) { last = {}; cd.classList.remove("cp-cd-urgent"); if (S && S.isOpen && S.started) finalize(); return; }
      const parts = [["d", Math.floor(rem / 86400)], ["h", Math.floor((rem % 86400) / 3600)], ["m", Math.floor((rem % 3600) / 60)], ["s", rem % 60]].filter(([u, v]) => u !== "d" || v > 0);
      const flip = rem < 86400 && !reduce;
      cd.innerHTML = `<span class="cp-cd-label">${tr("Ends in")}</span><span class="cp-cd">${parts.map(([u, v]) => {
        const val = String(v).padStart(u === "d" ? 1 : 2, "0");
        const changed = flip && last[u] != null && last[u] !== val;
        return `<span class="cp-cd-u"><b class="${changed ? "cp-flip" : ""}" data-no-i18n>${val}</b><i>${u}</i></span>`;
      }).join("")}</span>`;
      parts.forEach(([u, v]) => { last[u] = String(v).padStart(u === "d" ? 1 : 2, "0"); });
      const urgent = rem < 3600;
      cd.classList.toggle("cp-cd-urgent", urgent);
      if (ring && S && S.isOpen) ring.dataset.state = urgent ? "urgent" : "live";
    };
  }

  // ================= leaderboard: rows slide to their new rank =================
  if (typeof renderCirclepadLeaderboard === "function") {
    const origLb = renderCirclepadLeaderboard;
    const keyOf = (row) => { const a = row.querySelector(".bp-lb-ext"); const m = a && /0x[0-9a-fA-F]{40}/.exec(a.getAttribute("href") || ""); return m ? m[0].toLowerCase() : null; };
    const snap = () => {
      const m = new Map();
      document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row").forEach((r) => {
        const k = keyOf(r); if (k) m.set(r.closest("#bp-full-leaderboard") ? "f" + k : "h" + k, { top: r.getBoundingClientRect().top, amt: (r.querySelector(".bp-lb-amount") || {}).textContent });
      });
      return m;
    };
    // eslint-disable-next-line no-global-assign
    renderCirclepadLeaderboard = function (rows, activity) {
      const before = reduce ? null : snap();
      origLb(rows, activity);
      try { paintContributors(rows || []); paintTicker(activity); paintPodium(rows || []); emptyCta(); } catch (e) { console.warn("circlepad-fx", e); }
      setTimeout(() => document.dispatchEvent(new CustomEvent("circlepad:lb")), 0);
      document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row").forEach((r, i) => {
        const k = keyOf(r);
        const rank = Number((r.querySelector(".bp-lb-rank") || {}).textContent.replace("#", "")) || i + 1;
        r.classList.toggle("cp-top1", rank === 1); r.classList.toggle("cp-top3", rank <= 3);
        if (!before || !k) return;
        const id = (r.closest("#bp-full-leaderboard") ? "f" : "h") + k, was = before.get(id);
        if (!was) { if (before.size) r.classList.add("cp-row-new"); return; }
        const dy = was.top - r.getBoundingClientRect().top;
        if (Math.abs(dy) > 2) {
          r.style.transform = `translateY(${dy}px)`; r.style.transition = "none";
          requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)"; r.style.transform = ""; }));
          if (dy > 0) r.classList.add("cp-row-up");
        }
        if (was.amt && was.amt !== (r.querySelector(".bp-lb-amount") || {}).textContent) r.classList.add("cp-row-changed");
      });
    };
  }

  // ================= governance: bars grow, your vote gets a check =================
  if (typeof renderCirclepadGovernance === "function") {
    const origGov = renderCirclepadGovernance;
    const prevW = new Map(), prevMine = new Map();
    // eslint-disable-next-line no-global-assign
    renderCirclepadGovernance = function (g) {
      origGov(g);
      const wrap = $("bp-gov-categories");
      if (!wrap) return;
      wrap.querySelectorAll(".bp-gov-cat").forEach((cat, ci) => {
        cat.querySelectorAll(".bp-gov-option").forEach((opt, oi) => {
          const fill = opt.querySelector(".bp-gov-option-fill"), key = `${ci}:${oi}`;
          if (fill) {
            const to = fill.style.width, from = prevW.has(key) ? prevW.get(key) : "0%";
            prevW.set(key, to);
            if (!reduce && from !== to) { fill.style.width = from; requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = to; })); }
          }
          const isMine = opt.classList.contains("bp-gov-option-mine");
          if (isMine && prevMine.get(ci) !== oi) opt.classList.add("cp-voted-pop");
          if (isMine) prevMine.set(ci, oi);
        });
      });
    };
  }

  // ================= close split: 80 / 5 / 15 =================
  const next = document.querySelector(".bp-nextcard");
  let split = null;
  if (next) {
    const copy = document.createElement("div");
    copy.className = "cp-next-copy";
    while (next.firstChild) copy.appendChild(next.firstChild);
    next.appendChild(copy);
    split = document.createElement("div");
    split.className = "cp-split";
    const ROWS = [["Recipient", 80, "cp-s-a"], ["Treasury", 15, "cp-s-c"], ["Platform", 5, "cp-s-b"]];
    split.innerHTML = `<div class="cp-split-head"><span>${tr("At close")}</span><b class="cp-split-total" data-no-i18n></b></div><div class="cp-proof" hidden></div>`
      + ROWS.map(([k, p, c]) => `<div class="cp-split-row ${c}"><div class="cp-split-top"><span>${k}</span><b data-no-i18n>${p}%</b></div><div class="cp-split-bar"><i style="--w:${p}%"></i></div><small class="cp-split-amt" data-p="${p}" data-no-i18n></small></div>`).join("");
    next.appendChild(split);
    next.classList.add("cp-nextgrid");
    const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) { split.classList.add("in"); io.disconnect(); } }); }, { threshold: 0.35 }) : null;
    if (io && !reduce) io.observe(split); else split.classList.add("in");
  }
  function paintSplit(s) {
    if (!split) return;
    const total = toNum(s.totalRaised);
    split.querySelector(".cp-split-total").textContent = total > 0 ? `${fmt(total)} USDC` : "";
    split.querySelectorAll(".cp-split-amt").forEach((el) => { el.textContent = total > 0 ? `≈ ${fmt((total * Number(el.dataset.p)) / 100)} USDC` : ""; });
    split.classList.toggle("cp-flowing", !!(s.started && !s.isOpen));
    // Proof the money is where the page says: the escrow's own USDC balance
    // next to the contributions it has recorded.
    const proof = split.querySelector(".cp-proof");
    const bal = toNum(s.balance);
    if (s.started && !s.distributed && (bal > 0 || total > 0)) {
      const ok = Math.abs(bal - total) < 0.000001 || bal >= total;
      proof.hidden = false;
      proof.className = "cp-proof" + (ok ? " ok" : " warn");
      proof.innerHTML = `<span>${tr("Held by the contract")}</span> <b data-no-i18n>${fmt(bal)} USDC</b> <span class="cp-proof-mark">${ok ? tr("matches contributions") : tr("differs from contributions")}</span> <a href="${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || ""}/address/${(typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_ESCROW_ADDRESS) || ""}" target="_blank" rel="noopener">${tr("Check")} ↗</a>`;
    } else proof.hidden = true;
  }

  // ================= round tiles: numbers roll to their new value =================
  (function tileCountUp() {
    if (reduce) return;
    const RE = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/;
    document.querySelectorAll("#bp-featured .bp-mini-stat strong").forEach((el) => {
      // Our own frame writes are remembered in el.__w so the observer (which
      // fires asynchronously) can tell them apart from real updates.
      let shown = el.textContent, raf = 0;
      const write = (t) => { el.__w = t; el.textContent = t; };
      new MutationObserver(() => {
        const now = el.textContent;
        if (now === el.__w) return;
        const a = RE.exec(shown), b = RE.exec(now);
        const from = a ? parseFloat(a[2].replace(/,/g, "")) : NaN, to = b ? parseFloat(b[2].replace(/,/g, "")) : NaN;
        cancelAnimationFrame(raf);
        if (!a || !b || a[1] !== b[1] || a[3] !== b[3] || !isFinite(from) || !isFinite(to) || from === to) { shown = now; el.__w = now; return; }
        const dec = (b[2].split(".")[1] || "").length, t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
          if (k < 1) { write(b[1] + (from + (to - from) * e).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + b[3]); raf = requestAnimationFrame(step); }
          else { write(now); shown = now; }
        };
        raf = requestAnimationFrame(step);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  })();

  // ================= Home: section dots on wide screens =================
  (function sectionDots() {
    const home = $("bp-panel-home");
    if (!home || !("IntersectionObserver" in window)) return;
    const SECS = [["#bp-featured", "The round"], [".cp-timeline", "Launch process"], [".bp-row3", "Governance & leaderboard"], ["#cp-qa", "Round Q&A"], [".bp-nextcard", "At close"]];
    const nav = document.createElement("nav");
    nav.className = "cp-dots"; nav.setAttribute("aria-label", "Sections");
    document.body.appendChild(nav);
    let io = null;
    const build = () => {
      const items = SECS.map(([sel, label]) => [home.querySelector(sel), label]).filter(([el]) => el);
      nav.innerHTML = items.map(([, label], i) => `<button type="button" data-i="${i}" aria-label="${tr(label)}"><i></i><span>${tr(label)}</span></button>`).join("");
      nav.onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) items[+b.dataset.i][0].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); };
      if (io) io.disconnect();
      io = new IntersectionObserver((es) => es.forEach((en) => {
        const i = items.findIndex(([el]) => el === en.target);
        if (en.isIntersecting && i >= 0) nav.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
      }), { rootMargin: "-45% 0px -50% 0px" });
      items.forEach(([el]) => io.observe(el));
    };
    const sync = () => nav.classList.toggle("on", home.classList.contains("active"));
    new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ["class"] });
    setTimeout(() => { build(); sync(); }, 1500); // after the Q&A card has mounted
    document.addEventListener("arc:lang", build);
  })();

  // ================= empty states, skeleton, docs flow =================
  function emptyCta() {
    const home = $("bp-home-leaderboard");
    if (!home || !home.classList.contains("bp-empty") || home.querySelector(".cp-empty-cta")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "cp-empty-cta";
    b.textContent = tr(S && S.isOpen ? "Be the first to contribute" : "Pledge to be first in line");
    b.addEventListener("click", () => document.dispatchEvent(new CustomEvent("circlepad:quick", { detail: "round" })));
    home.appendChild(document.createElement("br")); home.appendChild(b);
  }
  if (typeof showCirclepadLeaderboardText === "function") {
    const origTxt = showCirclepadLeaderboardText;
    const skel = '<div class="cp-skel" aria-hidden="true"><i></i><i></i><i></i></div>';
    // eslint-disable-next-line no-global-assign
    showCirclepadLeaderboardText = function (text) {
      origTxt(text);
      if (!/^Loading/.test(String(text))) return;
      ["bp-home-leaderboard", "bp-full-leaderboard"].forEach((id) => { const el = $(id); if (el) el.insertAdjacentHTML("beforeend", skel); });
    };
  }
  (function docsFlow() {
    const how = $("bp-doc-how");
    if (!how) return;
    const lede = how.querySelector(".bp-lede") || how.querySelector("h1");
    const flow = document.createElement("ol");
    flow.className = "cp-flow";
    const STEPS = [
      ["Pledge", "Say what you'll put in before it opens — a signature, no money moves.", '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'],
      ["Contribute", "72 hours to send USDC. Withdraw any of it until the close.", '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'],
      ["Vote", "Contributors decide the name, ticker, logo, roadmap and date.", '<path d="M5 12l4 4 10-10"/>'],
      ["Launch", "At the close the raise splits 80 / 15 / 5 and the project goes live.", '<path d="M12 3c3 2 4.5 5.4 4.5 9 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.6 1.5-7 4.5-9z"/>'],
    ];
    flow.innerHTML = STEPS.map(([t, d, ico], i) => `<li style="--i:${i}"><span class="cp-flow-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ico}</svg></span><b>${t}</b><p>${d}</p></li>`).join("");
    lede.insertAdjacentElement("afterend", flow);
    if ("IntersectionObserver" in window && !reduce) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { flow.classList.add("in"); io.disconnect(); } }), { threshold: 0.3 });
      io.observe(flow);
    } else flow.classList.add("in");
  })();

  // ================= hero parallax =================
  const art = document.querySelector("#bp-panel-home .bp-hero-art");
  if (art && !reduce) {
    let tick = false;
    const onScroll = () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => {
        tick = false;
        const r = art.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        art.style.setProperty("--cp-par", (-r.top * 0.18).toFixed(1));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Paint once from whatever circlepad.js already applied (cache paint runs
  // before this file loads).
  // eslint-disable-next-line no-undef
  try { if (typeof _circlepadState !== "undefined" && _circlepadState) applyCirclepadState(_circlepadState, { accountUnknown: true }); } catch (e) { /* ignore */ }
})();
