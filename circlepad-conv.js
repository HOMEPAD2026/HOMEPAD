/* global ethers */
// circlepad-conv.js — CirclePad's USDC amounts also shown as "≈ ETH" or "≈ SOL".
// The raise stays in USDC; Round #2 launches on Robinhood Chain (ETH) and later rounds may launch on Solana, so the
// main amounts carry a converted line at today's price (USDC counted as $1). One choice for the whole page — ETH or
// SOL — kept in this browser. Prices: /api/social?fx=1 (api/_fx.mjs), refreshed every two minutes.
//   cpConv.html(weiOrString)  → <span class="cp-alt" data-usd="…">≈ 0.0412 ETH</span>   (18-decimal USDC amounts)
//   cpConv.htmlUsd(number)    → the same from a dollar number
//   cpConv.toggleHtml()       → the ETH | SOL switch with the rate it uses
//   cpConv.refresh()          → repaint every converted line (price or choice changed)
window.cpConv = (function () {
  "use strict";
  const KEY = "arcircle.circlepad.unit";
  let unit = "eth";
  try { const u = localStorage.getItem(KEY); if (u === "eth" || u === "sol") unit = u; } catch (e) { /* default */ }
  let px = { eth: null, sol: null, at: 0 };
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  /// an 18-decimal USDC amount (bigint, decimal string of wei) → dollars
  function usdOf(v) {
    try {
      if (typeof v === "bigint") return Number(ethers.formatEther(v));
      if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(ethers.formatEther(BigInt(v)));
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }
  function fmt(x) {
    const a = Math.abs(x);
    const d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
    return x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: a > 0 && a < 1000 ? Math.min(2, d) : 0 });
  }
  const conv = (usd, u) => { const p = px[u || unit]; return p ? usd / p : null; };
  function text(usd, u) {
    u = u || unit;
    const v = conv(usd, u);
    return v == null ? "" : `≈ ${fmt(v)} ${u.toUpperCase()}`;
  }
  const span = (usd, cls) => `<span class="cp-alt${cls ? " " + cls : ""}" data-usd="${usd}" data-no-i18n${text(usd) ? "" : " hidden"}>${esc(text(usd))}</span>`;
  const html = (amount, cls) => span(usdOf(amount), cls);
  const htmlUsd = (usd, cls) => span(Number(usd) || 0, cls);
  function rateText() {
    const p = px[unit];
    if (!p) return tr("Price loading…");
    return `1 ${unit.toUpperCase()} = $${p.toLocaleString("en-US", { maximumFractionDigits: p >= 100 ? 0 : 2 })}`;
  }
  const toggleHtml = () => `<span class="cp-unit" role="group" aria-label="${esc(tr("Also show amounts in"))}"><span class="cp-unit-l">${esc(tr("Also in"))}</span>${["eth", "sol"].map((u) => `<button type="button" data-cp-unit="${u}" aria-pressed="${u === unit}" data-no-i18n>${u.toUpperCase()}</button>`).join("")}<small class="cp-unit-rate" data-no-i18n>${esc(rateText())}</small></span>`;
  function refresh(root) {
    (root || document).querySelectorAll(".cp-alt[data-usd]").forEach((el) => {
      const t = text(Number(el.dataset.usd));
      if (el.textContent !== t) el.textContent = t;
      el.hidden = !t;
    });
    document.querySelectorAll("[data-cp-unit]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cpUnit === unit)));
    document.querySelectorAll(".cp-unit-rate").forEach((el) => { el.textContent = rateText(); });
    document.querySelectorAll("[data-cp-conv-in]").forEach((el) => { el.textContent = el.dataset.usd ? both(Number(el.dataset.usd)) : ""; });
  }
  /// "≈ 0.041 ETH · ≈ 0.61 SOL" — under the amount someone is typing
  const both = (usd) => (usd > 0 ? ["eth", "sol"].map((u) => text(usd, u)).filter(Boolean).join(" · ") : "");
  function setUnit(u) {
    if (u !== "eth" && u !== "sol") return;
    unit = u;
    try { localStorage.setItem(KEY, u); } catch (e) { /* this visit only */ }
    refresh();
    document.dispatchEvent(new CustomEvent("circlepad:unit", { detail: { unit } }));
  }
  async function load() {
    try {
      const r = await fetch("/api/social?fx=1", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && (j.eth || j.sol)) { px = { eth: Number(j.eth) || null, sol: Number(j.sol) || null, at: Number(j.at) || 0 }; refresh(); }
    } catch (e) { /* next time */ }
  }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-cp-unit]"); if (b) setUnit(b.dataset.cpUnit); });
  // a contribution box: data-cp-conv-in="<input id>" on an element shows what the typed amount is in ETH and SOL
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t || !t.id) return;
    document.querySelectorAll(`[data-cp-conv-in="${t.id}"]`).forEach((el) => { const v = Number(String(t.value || "").replace(/,/g, "")); el.dataset.usd = v > 0 ? String(v) : ""; el.textContent = v > 0 ? both(v) : ""; });
  });
  document.addEventListener("arc:lang", () => refresh());
  load();
  setInterval(() => { if (!document.hidden) load(); }, 120000);
  return { html, htmlUsd, text, conv, both, usdOf, toggleHtml, refresh, setUnit, unit: () => unit, prices: () => px, load };
})();
