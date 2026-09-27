/* global CONFIG, cpTzMode, cpSetTz, state */
// circlepad-look.js — how Round #1 looks and feels:
//   · the page accent follows the phase (raise green → voting orange → result
//     gold) and fades between them; after the result it takes the winning
//     logo's colour
//   · the background glows a little brighter when the last 5 minutes were busy
//   · an icon per ballot category (titles, phone tabs, live screen)
//   · Governance as a ballot paper: a numbered slip per category, a box to
//     tick on every candidate, a "VOTED" stamp on the ones I voted for
//   · a big burn (10+ votes at once) sends ash across the screen; several of
//     my votes in a row count up a "×N" combo
//   · phones: Transparency and "What happens next" open to their first part,
//     the rest behind "Show more"
//   · times: Local / KST / UTC, countdowns on the chain's clock
//   · Docs: a reading-progress bar
// All motion is off under "reduce motion".
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RD = () => window.circlepadRound || null;
  const phase = () => (RD() ? RD().phase() : "pre");
  const body = document.body;

  // ================= category icons =================
  const ICON = [
    '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>', // name
    '<path d="M12 3.5v17M16.2 7.6c0-1.8-1.9-2.9-4.2-2.9S7.8 5.9 7.8 7.8c0 4.4 8.4 2.3 8.4 6.7 0 1.9-1.9 3.1-4.2 3.1s-4.2-1.1-4.2-2.9"/>', // ticker
    '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M4.5 17.5l4.8-4.3 3.7 3.2 2.8-2.4 3.7 3.5"/>', // logo
    '<path d="M5.5 20.5v-16M5.5 4.5h11l-2 4 2 4h-11"/>', // roadmap
    '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', // date
  ];
  const catIcon = (id) => (ICON[id] ? `<svg class="cp-cat-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg>` : "");
  window.cpCatIcon = catIcon;

  // ================= phase accent, winner colour, activity glow =================
  let winFor = null;
  function paintTheme() {
    const ph = phase();
    const theme = ph === "raise" ? "raise" : ph === "voting" ? "voting" : ph === "result" || ph === "closed" ? "result" : "";
    if (body.dataset.cpTheme !== theme) { if (theme) body.dataset.cpTheme = theme; else delete body.dataset.cpTheme; }
    if (ph === "result") winnerColour(); else body.classList.remove("cp-win-theme");
  }
  function winnerColour() {
    const w = RD() && RD().winner ? RD().winner() : null;
    const src = w && w.logo;
    if (!src || winFor === src) return;
    winFor = src;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 32;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data;
        const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
          if (a < 128) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
          if (sat < 0.3 || mx < 60) continue;
          let h = 0;
          if (mx === r) h = ((g - b) / (mx - mn)) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
          const bin = bins[Math.floor(((h * 60 + 360) % 360) / 30)], wt = sat * (mx / 255);
          bin.w += wt; bin.r += r * wt; bin.g += g * wt; bin.b += b * wt;
        }
        const top = bins.reduce((a, b) => (b.w > a.w ? b : a));
        if (top.w < 2) return; // grey or tiny: keep the gold
        let r = top.r / top.w, g = top.g / top.w, b = top.b / top.w;
        const mx = Math.max(r, g, b), k = mx < 200 ? 200 / mx : 1; // bright enough on the dark page
        r = Math.min(255, r * k); g = Math.min(255, g * k); b = Math.min(255, b * k);
        body.style.setProperty("--cp-win", `rgb(${r | 0}, ${g | 0}, ${b | 0})`);
        body.classList.add("cp-win-theme");
      } catch { /* a logo from another origin: keep the gold */ }
    };
    img.src = src;
  }
  function paintHeat() {
    const t = Date.now() / 1000;
    const acts = (window.circlepadActivity || []).filter((a) => t - Number(a.ts || 0) < 300).length;
    const f = window.circlepadBurns;
    const burns = f && f.anchor ? f.events.filter((e) => (Number(f.anchor.block) - Number(e.b)) * 0.5 + (t - Number(f.anchor.ts || t)) < 300).length : 0;
    const heat = Math.min(1, (acts + burns) / 6);
    body.style.setProperty("--cp-heat", reduce() ? "0" : heat.toFixed(2));
  }

  // ================= Governance as a ballot paper =================
  let stampNew = null;
  function paintBallot() {
    document.querySelectorAll("#bp-gov-categories .bp-gov-cat").forEach((cat) => {
      const id = Number(String(cat.id).replace("gv-cat-", ""));
      const title = cat.querySelector(".bp-gov-cat-title");
      if (title && !title.querySelector(".cp-cat-ic")) title.insertAdjacentHTML("afterbegin", catIcon(id));
      if (cat.classList.contains("gv-unset")) return;
      cat.classList.add("cp-ballot");
      const head = cat.querySelector(".bp-gov-cat-head");
      if (head && !head.querySelector(".cp-ballot-no")) head.insertAdjacentHTML("afterbegin", `<span class="cp-ballot-no" data-no-i18n>No. 0${id + 1}</span>`);
      cat.querySelectorAll(".bp-gov-option").forEach((opt) => {
        const row = opt.querySelector(".bp-gov-option-row");
        const mine = opt.classList.contains("bp-gov-option-mine");
        if (row && !row.querySelector(".cp-box")) {
          const box = `<span class="cp-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg></span>`;
          const rank = row.querySelector(".cp-gov-rank");
          if (rank) rank.insertAdjacentHTML("afterend", box); else row.insertAdjacentHTML("afterbegin", box);
        }
        let st = opt.querySelector(".cp-stamp");
        if (mine && !st) { opt.insertAdjacentHTML("beforeend", `<span class="cp-stamp" aria-hidden="true"><b>${T("VOTED")}</b></span>`); st = opt.querySelector(".cp-stamp"); }
        if (!mine && st) st.remove();
        if (st && stampNew && Date.now() < stampNew.until && String(opt.dataset.category) === String(stampNew.cat) && String(opt.dataset.option) === String(stampNew.opt) && !reduce()) st.classList.add("new");
      });
    });
    const tabs = $("gv-cat-tabs");
    if (tabs) tabs.querySelectorAll("[data-cp-cat]").forEach((b) => { if (!b.querySelector(".cp-cat-ic")) b.insertAdjacentHTML("afterbegin", catIcon(Number(b.dataset.cpCat))); });
  }

  // ================= ash on a big burn, a combo for votes in a row =================
  function ash(n) {
    if (reduce()) return;
    const layer = document.createElement("div");
    layer.className = "cp-ash"; layer.setAttribute("aria-hidden", "true");
    for (let k = 0; k < n; k++) {
      const i = document.createElement("i");
      const z = 2 + Math.random() * 5, ember = Math.random() < 0.3;
      i.style.cssText = `left:${Math.random() * 100}vw;width:${z}px;height:${z}px;--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720 - 360}deg;animation-duration:${2.6 + Math.random() * 2.2}s;animation-delay:${Math.random() * 0.9}s`;
      if (ember) i.className = "ember";
      layer.appendChild(i);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 6500);
  }
  let combo = 0, comboAt = 0;
  function showCombo(cat, opt) {
    if (reduce()) return;
    const el = document.querySelector(`.bp-gov-option[data-category="${cat}"][data-option="${opt}"]`) || document.querySelector(".gv-coin-hero");
    let b = el ? el.getBoundingClientRect() : null;
    if (!b || b.bottom < 120 || b.top > innerHeight - 80) b = { left: innerWidth / 2 - 40, top: innerHeight * 0.42, width: 80, height: 0 }; // off screen: the middle
    const c = document.createElement("div");
    c.className = "cp-combo"; c.setAttribute("aria-hidden", "true");
    c.innerHTML = `<b data-no-i18n>×${combo}</b><span>${T("combo")}</span>`;
    c.style.cssText = `left:${Math.max(40, Math.min(innerWidth - 40, b.left + b.width / 2))}px;top:${Math.max(70, b.top + b.height / 2)}px`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1600);
  }
  document.addEventListener("circlepad:burnvote", (e) => {
    const d = e.detail || {};
    stampNew = { cat: d.category, opt: d.option, until: Date.now() + 4000 };
    const now = Date.now();
    combo = now - comboAt < 45000 ? combo + 1 : 1; comboAt = now;
    setTimeout(() => { paintBallot(); if (combo >= 2) showCombo(d.category, d.option); }, 900);
    if (Number(d.votes) >= 10) setTimeout(() => ash(Math.min(90, 30 + Number(d.votes) * 2)), 500);
  });
  let seenBurns = null;
  document.addEventListener("circlepad:burns", (e) => {
    const j = e.detail;
    if (!j || !Array.isArray(j.events)) return;
    const keys = j.events.map((x) => x.tx + ":" + x.i);
    if (seenBurns) {
      const me = typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "";
      const big = j.events.filter((x) => !seenBurns.has(x.tx + ":" + x.i) && Number(x.votes) >= 10 && String(x.voter).toLowerCase() !== me);
      if (big.length) ash(Math.min(90, 30 + Math.max(...big.map((x) => Number(x.votes))) * 2));
    }
    seenBurns = new Set(keys);
    paintHeat();
  });

  // ================= phones: long Home sections open to their first part =================
  function fold(el, more) {
    if (!el || el.__fold) return;
    el.__fold = true;
    el.classList.add("cp-fold");
    const b = document.createElement("button");
    b.type = "button"; b.className = "cp-fold-btn"; b.setAttribute("aria-expanded", "false");
    b.innerHTML = `<span>${T(more)}</span><i aria-hidden="true"></i>`;
    b.addEventListener("click", () => {
      const open = el.classList.toggle("open");
      b.setAttribute("aria-expanded", open ? "true" : "false");
      b.querySelector("span").textContent = tr(open ? "Show less" : more);
      if (!open) el.scrollIntoView({ block: "start", behavior: reduce() ? "auto" : "smooth" });
    });
    el.insertAdjacentElement("afterend", b);
  }

  // ================= times: Local / KST / UTC =================
  function tzHtml() {
    const m = typeof cpTzMode === "function" ? cpTzMode() : "local";
    return `<span class="cp-tz" role="group" aria-label="${T("Time zone")}">${[["local", "Local"], ["kst", "KST"], ["utc", "UTC"]].map(([k, l]) => `<button type="button" data-cp-tz="${k}" class="${m === k ? "on" : ""}" aria-pressed="${m === k}">${k === "local" ? T(l) : l}</button>`).join("")}</span>`;
  }
  function paintTz() {
    const head = document.querySelector("#cp-next-home .cp-next-head");
    if (head && !head.querySelector(".cp-tz-row")) head.insertAdjacentHTML("beforeend", `<div class="cp-tz-row">${tzHtml()}<small>${T("Countdowns follow the chain's clock.")}</small></div>`);
    const date = document.querySelector("#gv-cat-4 .bp-gov-cat-head");
    if (date && !date.querySelector(".cp-tz")) date.insertAdjacentHTML("beforeend", tzHtml());
    const m = typeof cpTzMode === "function" ? cpTzMode() : "local";
    document.querySelectorAll("[data-cp-tz]").forEach((b) => { const on = b.dataset.cpTz === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cp-tz]");
    if (b && typeof cpSetTz === "function") cpSetTz(b.dataset.cpTz);
  });

  // ================= Docs tab: reading progress =================
  const bar = document.createElement("div");
  bar.className = "cp-readbar"; bar.setAttribute("aria-hidden", "true");
  body.appendChild(bar);
  let rafR = 0;
  function paintRead() {
    rafR = 0;
    const docs = $("bp-panel-docs"), on = !!(docs && docs.classList.contains("active"));
    bar.hidden = !on;
    if (!on) return;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${(h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0).toFixed(4)})`;
  }
  addEventListener("scroll", () => { if (!rafR) rafR = requestAnimationFrame(paintRead); }, { passive: true });
  document.addEventListener("click", (e) => { if (e.target.closest(".bp-nav-item, .bp-doc-tab, [data-tab-link]")) setTimeout(paintRead, 60); });

  // ================= wiring =================
  function paintAll() {
    try {
      paintTheme(); paintHeat(); paintBallot(); paintTz(); paintRead();
      fold($("cpx-trust"), "Show all transparency details");
      fold($("cp-next-home"), "Show every step");
    } catch (err) { console.warn("circlepad-look", err); }
  }
  ["circlepad:state", "circlepad:lb", "circlepad:gov", "circlepad:govpaint", "circlepad:tz", "circlepad:nextpaint", "arc:lang"].forEach((ev) => document.addEventListener(ev, paintAll));
  setInterval(() => { if (!document.hidden) { paintHeat(); paintTheme(); } }, 20000);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(paintAll, 0)); else setTimeout(paintAll, 0);
})();
