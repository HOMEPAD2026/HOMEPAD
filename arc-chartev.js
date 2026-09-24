/* global APC, apcRenderChart, apcTsOf, apcChartPoints, apc$ */
// arc-chartev.js — event markers on the ArcPad coin chart: launch, market-cap
// milestones, creator profile edits, the creator's X verification and
// creator locks. Each is a dashed line with a pin; hover (or tap) for details.
(function () {
  "use strict";
  if (typeof APC === "undefined" || typeof apcRenderChart !== "function") return;
  const STEPS = [1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7];
  const W_PAD = { L: 12, R: 76, T: 16, B: 28 }, H = 280;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (a) => String(a || "").toLowerCase();
  const KIND = {
    launch: { label: "Launched", color: "#9fd0ff", glyph: '<path d="M0-3.6c1.3.9 2 2.4 2 4 0 .9-.2 1.6-.5 2.2L0 3.8l-1.5-1.2C-1.8 2-2 1.3-2 .4c0-1.6.7-3.1 2-4z"/>' },
    milestone: { label: "Market cap", color: "#39ff88", glyph: '<path d="M-2.2 3.4v-7M-2.2-3.6h4.4l-1 1.6 1 1.6h-4.4"/>' },
    profile: { label: "Creator updated the coin info", color: "#b28cff", glyph: '<path d="M-2.8 2.8h1.6l4-4-1.6-1.6-4 4zM.6-2.6l1.6 1.6"/>' },
    x: { label: "Creator verified on X", color: "#1d9bf0", glyph: '<path d="m-2.2.2 1.4 1.4L2.4-1.6"/>' },
    lock: { label: "Creator locked tokens", color: "#ffc861", glyph: '<rect x="-2.4" y="-.6" width="4.8" height="3.6" rx=".8"/><path d="M-1.4-.6v-1a1.4 1.4 0 0 1 2.8 0v1"/>' },
  };
  const lockCache = new Map();

  function events() {
    const l = APC.l;
    if (!l) return [];
    const out = [];
    if (l.launchedAt) out.push({ ts: l.launchedAt, kind: "launch", text: tr("Launched") });
    // market-cap milestones from the full trade history (not just the visible range)
    const k = APC.q.usd != null ? APC.q.usd : null;
    if (k != null) {
      const hist = [];
      for (const t of APC.trades.slice().reverse()) { const ts = typeof apcTsOf === "function" ? apcTsOf(t.b) : null; if (ts && t.after) hist.push({ ts, m: t.after * k * 1e9 }); }
      hist.sort((a, b) => a.ts - b.ts);
      let top = 0;
      for (const h of hist) {
        const hit = STEPS.filter((s) => top < s && h.m >= s);
        if (hit.length) {
          const s = hit[hit.length - 1];
          out.push({ ts: h.ts, kind: "milestone", text: `${s >= 1e6 ? `$${s / 1e6}M` : `$${s / 1e3}K`} ${tr("market cap")}` });
        }
        top = Math.max(top, h.m);
      }
    }
    const d = window.arcCommunity && window.arcCommunity.data ? window.arcCommunity.data() : null;
    if (d && d.profile && d.profile.updatedAt) out.push({ ts: Math.floor(d.profile.updatedAt / 1000), kind: "profile", text: tr("Creator updated the coin info") });
    if (d && d.creatorX && d.creatorX.verifiedAt) out.push({ ts: Math.floor(d.creatorX.verifiedAt / 1000), kind: "x", text: `${tr("Creator verified on X")} · @${d.creatorX.handle}` });
    const locks = lockCache.get(lc(l.token));
    if (locks) for (const x of locks) if (lc(x.owner) === lc(l.creator) && x.lockedAt) out.push({ ts: x.lockedAt, kind: "lock", text: tr("Creator locked tokens") });
    return out;
  }

  function paint() {
    const box = apc$("apc-chart");
    const svg = box && box.querySelector("svg");
    if (!svg || APC.chartSrc !== "onchain") return;
    const pts = apcChartPoints();
    if (pts.length < 2) return;
    const W = svg.viewBox.baseVal.width, t0 = pts[0].ts, t1 = pts[pts.length - 1].ts;
    const X = (ts) => W_PAD.L + ((ts - t0) / Math.max(1, t1 - t0)) * (W - W_PAD.L - W_PAD.R);
    const evs = events().filter((e) => e.ts >= t0 && e.ts <= t1).sort((a, b) => a.ts - b.ts);
    const old = svg.querySelector(".ev-layer"); if (old) old.remove();
    let legend = box.parentNode.querySelector(".ev-legend");
    if (!evs.length) { if (legend) legend.remove(); return; }
    // spread pins that would overlap
    let lastX = -99, row = 0;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "ev-layer");
    g.innerHTML = evs.map((e, i) => {
      const x = X(e.ts);
      row = x - lastX < 18 ? (row + 1) % 3 : 0; lastX = x;
      const y = W_PAD.T + 8 + row * 18, K = KIND[e.kind];
      return `<g class="ev" data-i="${i}" tabindex="0" style="--c:${K.color}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y + 8}" y2="${H - W_PAD.B}" class="ev-line"/>
        <g transform="translate(${x.toFixed(1)},${y})"><circle r="8" class="ev-pin"/><g class="ev-glyph">${K.glyph}</g></g><title>${esc(e.text)}</title></g>`;
    }).join("");
    const hit = svg.querySelector("#apc-hit");
    svg.insertBefore(g, hit ? hit.nextSibling : null);
    const tip = document.createElement("div");
    const showTip = (e, el) => {
      let t = box.querySelector(".ev-tip");
      if (!t) { t = tip; t.className = "ev-tip"; box.appendChild(t); }
      const ev = evs[Number(el.dataset.i)], rc = svg.getBoundingClientRect(), x = X(ev.ts) / W * rc.width;
      t.innerHTML = `<i style="background:${KIND[ev.kind].color}"></i><strong>${esc(ev.text)}</strong><span>${new Date(ev.ts * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>`;
      t.style.left = `${Math.min(Math.max(x - 90, 4), rc.width - 184)}px`;
      t.hidden = false;
    };
    g.querySelectorAll(".ev").forEach((el) => {
      el.addEventListener("mouseenter", (e) => showTip(e, el));
      el.addEventListener("focus", (e) => showTip(e, el));
      el.addEventListener("click", (e) => showTip(e, el));
      el.addEventListener("mouseleave", () => { const t = box.querySelector(".ev-tip"); if (t) t.hidden = true; });
    });
    // legend of the kinds on screen
    const kinds = [...new Set(evs.map((e) => e.kind))];
    if (!legend) { legend = document.createElement("div"); legend.className = "ev-legend"; box.insertAdjacentElement("afterend", legend); }
    legend.innerHTML = kinds.map((k) => `<span><i style="background:${KIND[k].color}"></i>${esc(tr(KIND[k].label))}</span>`).join("");
  }

  async function loadLocks() {
    if (!APC.l || !window.arcLock) return;
    const k = lc(APC.l.token);
    if (lockCache.has(k)) return;
    lockCache.set(k, []);
    try {
      const locks = await window.arcLock.locksOf(APC.l.token);
      lockCache.set(k, locks);
      paint();
    } catch (e) { /* no locks contract */ }
  }

  const orig = apcRenderChart;
  apcRenderChart = function () {
    orig.apply(this, arguments);
    try { paint(); loadLocks(); } catch (e) { console.warn("chart events", e); }
  };
  // community data (profile edits, X verification) arrives after the first paint
  document.addEventListener("arc:community", () => { try { paint(); } catch (e) { /* ignore */ } });
})();
