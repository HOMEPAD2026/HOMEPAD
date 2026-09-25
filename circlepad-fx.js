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
  const SOON = ["projects", "airdrop", "treasury"];
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
      pct = 0; sub = tr("opens soon");
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
    countTo(raised);
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
    if (acct && mine.acct === acct && mine.v != null && v > mine.v) joinCircle(acct);
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
    timeline.innerHTML = `<div class="cp-tl-head"><h3>${head ? head.textContent.trim() : "Launch process"}</h3><span class="cp-tl-now" id="cp-tl-now"></span></div>`;
    timeline.appendChild(steps);
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

  // Quick bar (arcircle-hub.js builds it): the round's own actions.
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
    try { paintRing(s); checkJoin(s, opts); paintStage(s); paintSplit(s); } catch (e) { console.warn("circlepad-fx", e); }
    S = s;
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
      if (rem <= 0) { last = {}; cd.classList.remove("cp-cd-urgent"); return; }
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
    split.innerHTML = `<div class="cp-split-head"><span>${tr("At close")}</span><b class="cp-split-total" data-no-i18n></b></div>`
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
  }

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
