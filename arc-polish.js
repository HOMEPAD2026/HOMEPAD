/* global APC, ARC, apcSpot, apcRenderHeader, apcRenderState, openArcCoin, arcAvatarBg */
// arc-polish.js — ArcPad's finishing touches:
//   • each coin page takes its colour from the coin's logo
//   • a slim sticky header (logo · ticker · price · Buy/Sell) once you scroll
//     past the coin's own header
//   • opening a coin from a card morphs the card's logo into the coin page
//     (View Transitions, where the browser supports them)
//   • a "coin is born" moment when a launch confirms
//   • live market-cap milestones celebrated on the coin page
//   • sound / haptic feedback for buys, sells and launches (arc-footer.js)
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const safeImg = (u) => /^https?:\/\//i.test(u || "") || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u || "");
  const feedback = (k) => { if (typeof window.arcFeedback === "function") window.arcFeedback(k); };

  // ================= coin colour from its logo =================
  const colorCache = new Map();
  function hueFromAddr(addr) { return parseInt(lc(addr).slice(2, 8) || "0", 16) % 360; }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  function logoColor(src) {
    return new Promise((resolve) => {
      if (!src || !/^data:image\//i.test(src)) return resolve(null); // remote logos would taint the canvas
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = c.height = 32;
          const g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0, 32, 32);
          const d = g.getImageData(0, 0, 32, 32).data;
          const buckets = new Array(36).fill(0), sums = new Array(36).fill(null).map(() => [0, 0, 0, 0]);
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
            if (a < 128) continue;
            const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0;
            if (sat < 0.28 || mx < 60) continue; // skip greys, blacks, whites
            let h;
            if (mx === r) h = ((gg - b) / (mx - mn)) % 6; else if (mx === gg) h = (b - r) / (mx - mn) + 2; else h = (r - gg) / (mx - mn) + 4;
            h = (h * 60 + 360) % 360;
            const k = Math.floor(h / 10), w = sat * (mx / 255);
            buckets[k] += w; sums[k][0] += r * w; sums[k][1] += gg * w; sums[k][2] += b * w; sums[k][3] += w;
          }
          let best = -1, bw = 0;
          buckets.forEach((w, k) => { const tot = w + (buckets[(k + 35) % 36] + buckets[(k + 1) % 36]) * 0.5; if (tot > bw) { bw = tot; best = k; } });
          if (best < 0 || bw < 2) return resolve(null);
          const s = sums[best];
          resolve([Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])]);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  async function applyCoinColor() {
    if (typeof APC === "undefined" || !APC.l) return;
    const panel = $("bp-panel-coin");
    const token = lc(APC.token);
    let rgb = colorCache.get(token);
    if (!rgb) {
      rgb = await logoColor(APC.l.imageUrl);
      if (!rgb) rgb = hslToRgb(hueFromAddr(token), 70, 56);
      // keep it readable on the dark background
      const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      if (lum < 0.35) rgb = rgb.map((v) => Math.min(255, Math.round(v + (255 - v) * 0.35)));
      colorCache.set(token, rgb);
    }
    if (lc(APC.token) !== token || !panel) return;
    panel.style.setProperty("--coin-acc", `rgb(${rgb.join(",")})`);
    panel.style.setProperty("--coin-acc-soft", `rgba(${rgb.join(",")},.16)`);
    panel.style.setProperty("--coin-acc-line", `rgba(${rgb.join(",")},.4)`);
    panel.classList.add("coin-tinted");
    const mini = $("apc-mini");
    if (mini) mini.style.setProperty("--coin-acc-line", `rgba(${rgb.join(",")},.45)`);
  }
  if (typeof apcRenderHeader === "function") {
    const orig = apcRenderHeader;
    // eslint-disable-next-line no-global-assign
    apcRenderHeader = function () { orig.apply(this, arguments); applyCoinColor().catch(() => {}); paintMini(); };
  }

  // ================= sticky mini header =================
  const mini = document.createElement("div");
  mini.id = "apc-mini"; mini.className = "apc-mini"; mini.hidden = true;
  mini.innerHTML = `<div class="apc-mini-in"><span class="apc-mini-logo"></span><b class="apc-mini-sym"></b><span class="apc-mini-price"></span><span class="apc-mini-chg"></span>
    <span class="apc-mini-sp"></span><button type="button" class="apc-mini-btn buy" data-mini="buy">Buy</button><button type="button" class="apc-mini-btn sell" data-mini="sell">Sell</button></div>`;
  document.body.appendChild(mini);
  function paintMini() {
    if (typeof APC === "undefined" || !APC.l) return;
    const l = APC.l;
    mini.querySelector(".apc-mini-logo").innerHTML = safeImg(l.imageUrl) ? `<img src="${esc(l.imageUrl)}" alt="">`
      : `<span style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(APC.token) : ""}">${esc((l.symbol || "?").slice(0, 1).toUpperCase())}</span>`;
    mini.querySelector(".apc-mini-sym").textContent = l.symbol ? `$${l.symbol}` : "";
  }
  function paintMiniPrice() {
    const p = $("apc-price"), c = $("apc-change");
    if (p) mini.querySelector(".apc-mini-price").innerHTML = p.innerHTML;
    if (c) { const m = mini.querySelector(".apc-mini-chg"); m.textContent = c.textContent.replace(/\s*(24h|since launch)$/i, ""); m.className = "apc-mini-chg " + (c.classList.contains("down") ? "down" : c.classList.contains("up") ? "up" : ""); }
  }
  let headVisible = true;
  const head = document.querySelector("#bp-panel-coin .ac2-head");
  const coinActive = () => { const p = $("bp-panel-coin"); return !!(p && p.classList.contains("active")); };
  function placeMini() {
    const wide = window.matchMedia("(min-width: 901px)").matches;
    // the top bar is sticky on desktop and fixed on phones — sit just under it
    const bar = document.querySelector(".bp-topbar");
    const r = bar && bar.getBoundingClientRect();
    mini.style.top = `${Math.max(0, r ? Math.round(r.bottom) : 0)}px`;
    if (wide) { const main = document.querySelector(".bp-main"); const mr = main && main.getBoundingClientRect(); if (mr) { mini.style.left = `${mr.left}px`; mini.style.width = `${mr.width}px`; } }
    else { mini.style.left = "0px"; mini.style.width = "100%"; }
  }
  function updateMini() {
    const show = coinActive() && !headVisible && typeof APC !== "undefined" && !!APC.l;
    if (show) { placeMini(); paintMiniPrice(); }
    if (show === !mini.hidden) return;
    mini.hidden = !show;
    requestAnimationFrame(() => mini.classList.toggle("in", show));
  }
  if (head && "IntersectionObserver" in window) {
    new IntersectionObserver((ents) => { headVisible = ents[0].isIntersecting; updateMini(); }, { rootMargin: "-90px 0px 0px 0px" }).observe(head);
  }
  document.addEventListener("arcpad:tab", () => setTimeout(updateMini, 0));
  window.addEventListener("resize", () => { if (!mini.hidden) placeMini(); });
  if (typeof apcRenderState === "function") {
    const orig = apcRenderState;
    // eslint-disable-next-line no-global-assign
    apcRenderState = function () { orig.apply(this, arguments); try { if (!mini.hidden) paintMiniPrice(); checkMilestone(); } catch (e) { console.warn(e); } };
  }
  mini.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mini]");
    if (!b) return;
    const side = b.dataset.mini;
    // phones: the bottom trade bar's sheet; desktop: scroll to the swap card
    const mtbBtn = document.querySelector(`#mtb.on [data-mtb="${side}"]`);
    if (mtbBtn) { mtbBtn.click(); return; }
    const card = $("apc-swap");
    if (!card) return;
    const tab = card.querySelector(`.ac2-swap-tabs button[data-side="${side}"]`);
    if (tab) tab.click();
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    card.classList.remove("apc-flash"); void card.offsetWidth; card.classList.add("apc-flash");
    setTimeout(() => { const inp = $("apc-amount"); if (inp) inp.focus({ preventScroll: true }); }, 450);
  });

  // ================= card → coin page morph =================
  let lastCard = null, lastAt = 0;
  document.addEventListener("pointerdown", (e) => {
    const c = e.target.closest && e.target.closest(".ap-launch-card, .pf-row, .srch-item");
    if (c) { lastCard = c; lastAt = Date.now(); }
  }, true);
  if (typeof openArcCoin === "function" && document.startViewTransition && !reduce) {
    const orig = openArcCoin;
    const morph = function (token) {
      const card = lastCard && Date.now() - lastAt < 1500 && lastCard.isConnected ? lastCard : null;
      lastCard = null;
      const logo = card && card.querySelector(".ap-card-logo, .pf-logo, img, .srch-ph");
      if (!logo || coinActive()) return orig.apply(this, arguments);
      const l = ARC.launches.find((x) => lc(x.token) === lc(token));
      const target = document.querySelector("#bp-panel-coin .apc-logo-wrap");
      logo.style.viewTransitionName = "coin-logo";
      const t = document.startViewTransition(() => {
        logo.style.viewTransitionName = "";
        orig.call(this, token);
        // paint the header right away from what the card already knows
        if (l) {
          const img = $("apc-logo"), fb = $("apc-logo-fallback");
          if (safeImg(l.imageUrl)) { img.src = l.imageUrl; img.hidden = false; fb.hidden = true; } else { img.hidden = true; fb.hidden = false; fb.textContent = (l.symbol || "?").slice(0, 1).toUpperCase(); }
          $("apc-name").textContent = l.name || l.symbol; $("apc-sym").textContent = l.symbol ? `$${l.symbol}` : "";
        }
        if (target) target.style.viewTransitionName = "coin-logo";
        window.scrollTo(0, 0);
      });
      t.finished.finally(() => { if (target) target.style.viewTransitionName = ""; });
    };
    // eslint-disable-next-line no-global-assign
    openArcCoin = morph;
    window.openArcCoin = morph;
  }

  // ================= "a coin is born" =================
  const ls = $("ap-launch-status");
  let snap = null;
  if (ls) new MutationObserver(() => {
    const pend = ls.querySelector(".status.pending");
    if (pend && /Confirm the launch|Launching/.test(pend.textContent)) {
      snap = { name: ($("ap-name") || {}).value || "", sym: (($("ap-symbol") || {}).value || "").trim().replace(/^\$/, "").toUpperCase(), logo: (($("ap-logo") || {}).value || "").trim() };
    }
    const ok = ls.querySelector(".status.success");
    if (ok && !ok.__born) { ok.__born = true; feedback("launch"); if (!reduce) birth(snap || {}); snap = null; }
  }).observe(ls, { childList: true, subtree: true });
  function birth(s) {
    const o = document.createElement("div");
    o.className = "coin-birth";
    const N = 72, dots = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 180 + Math.random() * 260;
      const hue = [205, 175, 145][i % 3];
      dots.push(`<i style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;--d:${(Math.random() * 0.35).toFixed(2)}s;background:hsl(${hue} 90% 62%)"></i>`);
    }
    const logo = safeImg(s.logo) ? `<img src="${esc(s.logo)}" alt="">` : `<span>${esc((s.sym || "?").slice(0, 1))}</span>`;
    o.innerHTML = `<div class="cb-stage">${dots.join("")}<div class="cb-ring"></div><div class="cb-logo">${logo}</div></div>
      <div class="cb-text"><b>$${esc(s.sym || "COIN")}</b><span>is live on ArcPad</span></div>`;
    document.body.appendChild(o);
    const close = () => { o.classList.add("out"); setTimeout(() => o.remove(), 500); };
    o.addEventListener("click", close);
    requestAnimationFrame(() => o.classList.add("go"));
    setTimeout(close, 3200);
  }

  // ================= market-cap milestones =================
  const STEPS = [10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2.5e6, 5e6, 10e6];
  const lastMcap = new Map();
  function checkMilestone() {
    if (typeof APC === "undefined" || !APC.l || !APC.s || !APC.s.r || APC.q.usd == null || !coinActive()) return;
    const spotEl = $("apc-mcap");
    const spot = typeof apcSpot === "function" ? apcSpot() : null;
    if (!(spot > 0)) return;
    const m = spot * 1e9 * APC.q.usd, k = lc(APC.token), prev = lastMcap.get(k);
    lastMcap.set(k, m);
    if (prev == null) return;
    const hit = STEPS.filter((x) => prev < x && m >= x).pop();
    if (!hit) return;
    const label = hit >= 1e6 ? `$${hit / 1e6}M` : `$${hit / 1e3}K`;
    if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti();
    if (typeof window.arcToast === "function") window.arcToast(`$${APC.l.symbol} just crossed ${label} market cap`);
    feedback("milestone");
    if (spotEl) { spotEl.classList.remove("apc-milestone"); void spotEl.offsetWidth; spotEl.classList.add("apc-milestone"); }
  }
})();
