/* global ethers, readProvider, withRetry */
// arcircle-live.js — a lightweight, read-only $ARCIRCLE ticker for pages that
// don't load the full ArcPad trading page (CirclePad, Reward). Reads the foci
// bonding curve directly (same contract and maths as arcircle-coin.js) and
// fills any element tagged data-arl="price|mcap|progress-text|progress-fill|
// liq|holders-note". Needs ethers + arc-shared.js (readProvider, withRetry).
(function () {
  "use strict";
  // From config-arc.js; "" while $ARCIRCLE is not live (relaunching).
  var CURVE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_CURVE) || "";
  var SUPPLY = 1000000000;
  var ABI = [
    "function getReserves() view returns (uint256 quoteReserve_, uint256 tokenReserve_)",
    "function realQuoteReserve() view returns (uint256)",
    "function graduationThreshold() view returns (uint256)",
    "function graduated() view returns (bool)",
  ];

  function usdc(raw) { return Number(ethers.formatUnits(raw, 6)); }
  function tok(raw) { return Number(ethers.formatUnits(raw, 18)); }
  function fmtPrice(p) {
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (p >= 0.001) return "$" + p.toPrecision(4);
    var zeros = Math.floor(-Math.log10(p));
    var digits = (Math.round(p * Math.pow(10, zeros + 4)).toString().slice(0, 4).replace(/0+$/, "")) || "0";
    var sub = String(zeros).split("").map(function (d) { return "₀₁₂₃₄₅₆₇₈₉"[d]; }).join("");
    return "$0.0" + sub + digits;
  }
  function fmtUsd(n, exact) {
    if (n == null || !isFinite(n)) return "—";
    if (!exact && Math.abs(n) >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function setAll(key, text) {
    document.querySelectorAll('[data-arl="' + key + '"]').forEach(function (el) { el.textContent = text; });
  }

  async function refresh() {
    if (!document.querySelector("[data-arl]")) return;
    if (!CURVE) {
      setAll("price", "Not live");
      setAll("mcap", "—");
      setAll("liq", "—");
      setAll("progress-text", "Not live yet — $ARCIRCLE is relaunching");
      document.querySelectorAll('[data-arl="progress-fill"]').forEach(function (el) { el.style.width = "0%"; });
      return;
    }
    try {
      var c = new ethers.Contract(CURVE, ABI, readProvider());
      var r = await Promise.all([
        withRetry(function () { return c.getReserves(); }),
        withRetry(function () { return c.realQuoteReserve(); }),
        withRetry(function () { return c.graduationThreshold(); }),
        withRetry(function () { return c.graduated(); }),
      ]);
      var spot = usdc(r[0][0]) / tok(r[0][1]);
      var real = usdc(r[1]), thr = usdc(r[2]), graduated = r[3];
      var pct = thr > 0 ? Math.min(100, (real / thr) * 100) : 0;
      setAll("price", fmtPrice(spot));
      setAll("mcap", fmtUsd(spot * SUPPLY));
      setAll("liq", fmtUsd(real, true));
      setAll("progress-text", graduated
        ? "Graduated — trading on its DEX pool"
        : fmtUsd(real, true) + " / " + fmtUsd(thr, true) + " USDC to graduate · " + pct.toFixed(pct < 10 ? 2 : 1) + "%");
      document.querySelectorAll('[data-arl="progress-fill"]').forEach(function (el) {
        el.style.width = (graduated ? 100 : Math.max(pct, 0.6)) + "%";
      });
    } catch (e) {
      setAll("progress-text", "Live $ARCIRCLE data unavailable right now");
    }
  }

  window.arcircleLive = { refresh: refresh, fmtUsd: fmtUsd, fmtPrice: fmtPrice };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh);
  else refresh();
  if (CURVE) setInterval(function () { if (!document.hidden) refresh(); }, 30000);
})();
