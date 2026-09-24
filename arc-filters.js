/* global renderArcpadExploreGrid, CONFIG */
// arc-filters.js — Explore filters: pair token, launch age and market-cap range.
// Adds a "Filters" button to the Explore toolbar that opens a chip panel;
// renderArcpadExploreGrid() asks arcFilterPass(l) for every coin.
(function () {
  "use strict";
  const KEY = "arcpad.filters.v1";
  const ARCIRCLE = "0x933a94b475fa9d8ef94fa564e38dda400a595aa1";
  const USDC = String((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000").toLowerCase();
  const DEF = { pair: "all", age: "all", mcap: "all" };
  const MCAP = { lt10k: [0, 1e4], "10k": [1e4, 1e5], "100k": [1e5, 1e6], gt1m: [1e6, Infinity] };
  const AGE = { "1h": 3600, "24h": 86400, "7d": 7 * 86400 };
  let F = { ...DEF };
  try { F = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(F)); } catch (e) { /* ignore */ } };
  const count = () => ["pair", "age", "mcap"].filter((k) => F[k] !== "all").length;

  window.arcFiltersActive = () => count() > 0;
  window.arcFilterPass = function (l) {
    const q = String(l.quoteToken || "").toLowerCase();
    if (F.pair === "usdc" && q !== USDC) return false;
    if (F.pair === "arcircle" && q !== ARCIRCLE) return false;
    if (F.pair === "other" && (q === USDC || q === ARCIRCLE)) return false;
    if (F.age !== "all" && !(l.launchedAt && Date.now() / 1000 - l.launchedAt <= AGE[F.age])) return false;
    if (F.mcap !== "all") {
      const m = l.marketCapUsd, r = MCAP[F.mcap];
      if (m == null || !(m >= r[0] && m < r[1])) return false;
    }
    return true;
  };

  const GROUPS = [
    ["pair", "Pair", [["all", "All"], ["usdc", "USDC"], ["arcircle", "$ARCIRCLE"], ["other", "Other"]]],
    ["age", "Launched", [["all", "Any time"], ["1h", "1h"], ["24h", "24h"], ["7d", "7d"]]],
    ["mcap", "Market cap", [["all", "Any"], ["lt10k", "< $10K"], ["10k", "$10K–100K"], ["100k", "$100K–1M"], ["gt1m", "> $1M"]]],
  ];
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';
  function mount() {
    const bar = document.querySelector("#bp-panel-explore .cn-explore-toolbar");
    if (!bar || document.getElementById("ap-filter-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "ap-filter-btn"; btn.className = "flt-btn";
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "ap-filter-panel");
    bar.appendChild(btn);
    const panel = document.createElement("div");
    panel.id = "ap-filter-panel"; panel.className = "flt-panel"; panel.hidden = true;
    panel.innerHTML = GROUPS.map(([k, label, opts]) => `<div class="flt-group"><span class="flt-label">${label}</span><div class="flt-chips" role="radiogroup" aria-label="${label}">${opts.map(([v, t]) => `<button type="button" role="radio" data-k="${k}" data-v="${v}">${t}</button>`).join("")}</div></div>`).join("")
      + `<button type="button" class="flt-reset" data-reset>Reset filters</button>`;
    bar.insertAdjacentElement("afterend", panel);
    const paint = () => {
      const n = count();
      btn.innerHTML = `${ICON}<span>Filters</span>${n ? `<b>${n}</b>` : ""}`;
      btn.classList.toggle("on", n > 0);
      panel.querySelectorAll("[data-k]").forEach((b) => { const on = F[b.dataset.k] === b.dataset.v; b.classList.toggle("on", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
      panel.querySelector("[data-reset]").hidden = !n;
    };
    btn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      btn.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
      if (!panel.hidden) { panel.classList.remove("flt-in"); void panel.offsetWidth; panel.classList.add("flt-in"); }
    });
    panel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (b) F[b.dataset.k] = b.dataset.v;
      else if (e.target.closest("[data-reset]")) F = { ...DEF };
      else return;
      save(); paint();
      if (typeof renderArcpadExploreGrid === "function") renderArcpadExploreGrid();
    });
    paint();
    if (count() && typeof renderArcpadExploreGrid === "function") renderArcpadExploreGrid();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
