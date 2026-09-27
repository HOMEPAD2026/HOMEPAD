// arc-fmt.js — one way to write numbers across the site (home, /me, /stats, search, alerts).
//   arcFmt.usd(28100)        "$28.1K"      arcFmt.usd(7.02)   "$7.02"
//   arcFmt.price(0.0000281)  "$0.0₄281"    (zeros after "0." shown as a subscript count)
//   arcFmt.compact(966e6)    "966M"        arcFmt.num(1402.5, 2) "1,402.5"
//   arcFmt.pct(4.2, true)    "+4.20%"      arcFmt.ago(ts)      "5m" / "3h" / "2d"
(function () {
  "use strict";
  if (window.arcFmt) return;
  var fin = function (v) { return v != null && isFinite(v); };
  var trim = function (s) { return s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s; };
  function compact(v, dp) {
    if (!fin(v)) return "—";
    var a = Math.abs(v), d = dp == null ? 2 : dp;
    if (a >= 1e12) return trim((v / 1e12).toFixed(d)) + "T";
    if (a >= 1e9) return trim((v / 1e9).toFixed(d)) + "B";
    if (a >= 1e6) return trim((v / 1e6).toFixed(d)) + "M";
    if (a >= 1e4) return trim((v / 1e3).toFixed(a >= 1e5 ? 0 : 1)) + "K";
    return num(v, a >= 100 ? 0 : 2);
  }
  function num(v, dp) {
    if (!fin(v)) return "—";
    return Number(v).toLocaleString("en-US", { maximumFractionDigits: dp == null ? 2 : dp });
  }
  var SUB = "₀₁₂₃₄₅₆₇₈₉";
  function price(v) {
    if (!fin(v)) return "—";
    if (v === 0) return "$0";
    var a = Math.abs(v), sign = v < 0 ? "-" : "";
    if (a >= 1) return sign + "$" + num(a, a >= 1000 ? 0 : 4);
    if (a >= 0.01) return sign + "$" + a.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    var s = a.toFixed(20).slice(2), z = s.match(/^0*/)[0].length, digits = s.slice(z, z + 3).replace(/0+$/, "") || "0";
    if (z < 4) return sign + "$0." + s.slice(0, z) + digits;
    return sign + "$0.0" + String(z).split("").map(function (c) { return SUB[+c]; }).join("") + digits;
  }
  function usd(v) {
    if (!fin(v)) return "—";
    var a = Math.abs(v);
    if (a > 0 && a < 0.01) return price(v);
    if (a >= 1e4) return (v < 0 ? "-$" : "$") + compact(a);
    return (v < 0 ? "-$" : "$") + num(a, a >= 100 ? 0 : 2);
  }
  function pct(v, signed, dp) {
    if (!fin(v)) return "—";
    return (signed && v > 0 ? "+" : "") + v.toFixed(dp == null ? 2 : dp) + "%";
  }
  function ago(ts) {
    if (!ts) return "—";
    var s = Math.max(1, Date.now() / 1000 - ts);
    return s < 60 ? "now" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d";
  }
  window.arcFmt = { usd: usd, price: price, compact: compact, num: num, pct: pct, ago: ago };
})();
