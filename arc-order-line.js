// arc-order-line.js — one line of words → an ARCIRCLE Orders order (window.arcOrderLine.parse). Shared by the Orders
// page's "type an order" box (arc-orders-v4.js) and ARCIA's chat (arc-arcia.js: "buy $20 of $ARCIA at mcap 30k"), on
// ArcPad and on the pages where ARCIA opens as a drawer. Deterministic and offline; it never places anything.
//   parse(line, ctx) → { side, type, amount | quote | pct, price | trigger | tp+sl | lo+hi | cap, expiry, dur, parts, trail, n }
//                      or { err } — ctx: { spot, mcap1 (market cap at a price of 1), qUsd (dollars per quote unit) }
(function () {
  "use strict";
  const SUB = { "₀": 0, "₁": 1, "₂": 2, "₃": 3, "₄": 4, "₅": 5, "₆": 6, "₇": 7, "₈": 8, "₉": 9 };
  /// "1.5m" → 1500000; "0.0₆1088" → 0.0000001088; null if it isn't a number
  function numOf(x) {
    let s = String(x || "").trim().toLowerCase().replace(/,/g, "");
    const sub = /^0\.0([₀-₉]+)(\d+)$/.exec(s);
    if (sub) s = "0.0" + "0".repeat(Number([...sub[1]].map((c) => SUB[c]).join(""))) + sub[2];
    const m = /^(\d*\.?\d+(?:e-?\d+)?)([kmb])?$/.exec(s);
    if (!m) return null;
    const v = Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1);
    return isFinite(v) && v > 0 ? v : null;
  }
  const NUM = "(\\d*\\.?\\d+(?:e-?\\d+)?[kmb]?|0\\.0[₀-₉]+\\d+)";
  /// a price: "0.00000008", "+10%" / "-5%" (from the pool's price), "mcap 50k" / "mc $1.2m" (market cap in dollars)
  function priceOf(str, ctx) {
    const s = String(str || "").trim().toLowerCase();
    let m = /^([+-−])\s*(\d*\.?\d+)\s*%$/.exec(s);
    if (m) { if (!(ctx.spot > 0)) return { err: "No pool price yet for a % price." }; const k = Number(m[2]) * (m[1] === "+" ? 1 : -1); return { v: Number((ctx.spot * (1 + k / 100)).toPrecision(4)) }; }
    m = new RegExp(`^(?:mcap|mc|market cap|cap)\\s*\\$?\\s*${NUM}$`).exec(s);
    if (m) { const mc = numOf(m[1]); if (!mc) return { err: "That market cap isn't a number." }; if (!(ctx.mcap1 > 0)) return { err: "No market cap for this token yet." }; return { v: mc / ctx.mcap1, mc }; }
    m = new RegExp(`^\\$?\\s*${NUM}$`).exec(s);
    if (m) { const v = numOf(m[1]); return v ? { v } : { err: "That price isn't a number." }; }
    return { err: "Couldn't read the price." };
  }
  /// one line → what to put in the form; deterministic, never places anything
  function parse(line, ctx) {
    let s = " " + String(line || "").toLowerCase().replace(/[，]/g, ",").replace(/\s+/g, " ").trim() + " ";
    if (!s.trim()) return null;
    const out = {};
    const take = (re) => { const m = re.exec(s); if (m) s = s.replace(m[0], " "); return m; };
    let m;
    if ((m = take(/ (buy|long|b) /))) out.side = "buy";
    else if ((m = take(/ (sell|short|s) /))) out.side = "sell";
    // timed: "dca … over 6h | 1d", "in 12 parts" (before the expiry, which also ends in d)
    if ((m = take(/ (dca|twap|timed) /))) out.type = "twap";
    if ((m = take(/ over (\d+) ?(h|hour|hours|d|day|days) /))) { out.type = "twap"; const sec = Number(m[1]) * (m[2][0] === "h" ? 3600 : 86400); const ok = [3600, 21600, 86400, 259200, 604800, 2592000]; out.dur = String(ok.reduce((a, b) => (Math.abs(b - sec) < Math.abs(a - sec) ? b : a))); }
    // expiry: "for 3d", "30d", "1 day"
    if ((m = take(/ (?:for |exp(?:ires)? (?:in )?)?(1|7|30|90) ?(?:d|day|days) /))) out.expiry = String(Number(m[1]) * 86400);
    if ((m = take(/ (?:in )?(\d+) parts /))) { const ok = [4, 6, 12, 24, 48], n = Number(m[1]); out.parts = String(ok.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))); }
    // take-profit / stop-loss pair, trailing stop
    if ((m = take(new RegExp(` tp ([^ ]+(?: [^ ]+)?) sl ([^ ]+(?: [^ ]+)?) `)))) { out.type = "tpsl"; out.tpS = m[1].trim(); out.slS = m[2].trim(); }
    if ((m = take(/ trail(?:ing)?(?: stop)?(?: by)? (\d+(?:\.\d+)?) ?% /))) { out.type = "trail"; out.trail = String([3, 5, 10, 15, 20].reduce((a, b) => (Math.abs(b - Number(m[1])) < Math.abs(a - Number(m[1])) ? b : a))); }
    // scaled: "from -2% to -10% x5"
    if ((m = take(/ from ([^ ]+) to ([^ ]+) /))) { out.type = "scaled"; out.loS = m[1]; out.hiS = m[2]; }
    if ((m = take(/ (?:x|×)\s?(\d+) /)) || (m = take(/ (\d+) orders /))) { out.n = String([3, 5, 8, 10].reduce((a, b) => (Math.abs(b - Number(m[1])) < Math.abs(a - Number(m[1])) ? b : a))); if (!out.type) out.type = "scaled"; }
    if ((m = take(/ (stop|stop-loss|stoploss) /))) out.type = out.type || "stop";
    if ((m = take(/ (market|now|instantly|at market) /))) out.type = "market";
    // the price: "at X" / "@ X" / "when X"
    if ((m = take(new RegExp(` (?:at|@|when|if) ((?:mcap|mc|market cap|cap) \\$?\\s*${NUM}|[+\\-−]\\s*\\d*\\.?\\d+ ?%|\\$?\\s*${NUM}) `)))) out.priceS = m[1].trim();
    // the amount: "50%", "all", "$100", "0.2 eth", "1.5m"
    if ((m = take(/ (all|max|everything) /))) out.pct = 100;
    else if ((m = take(/ (\d{1,3}(?:\.\d+)?) ?% /))) out.pct = Math.min(100, Number(m[1]));
    else if ((m = take(new RegExp(` \\$\\s*${NUM} `)))) out.usd = numOf(m[1]);
    else if ((m = take(new RegExp(` ${NUM} ?(eth|weth|usdc|usd) `)))) { if (m[2] === "usd") out.usd = numOf(m[1]); else out.quote = numOf(m[1]); }
    else if ((m = take(new RegExp(` ${NUM}(?: tokens?)? `)))) out.amount = numOf(m[1]);
    if (!out.side) {
      if (out.type === "tpsl" || out.type === "trail") out.side = "sell";
      else if (out.type === "twap") out.side = "buy";
      else return { err: "Start with buy or sell." };
    }
    if (out.type === "tpsl" || out.type === "trail") out.side = "sell";
    out.type = out.type || "limit";
    // prices
    const need = (k, str) => { const r = priceOf(str, ctx); if (r.err) throw new Error(r.err); out[k] = r.v; if (r.mc) out.mc = r.mc; };
    try {
      if (out.tpS) { need("tp", out.tpS); need("sl", out.slS); }
      if (out.loS) { need("lo", out.loS); need("hi", out.hiS); }
      if (out.priceS) need(out.type === "stop" ? "trigger" : out.type === "twap" ? "cap" : "price", out.priceS);
    } catch (e) { return { err: e.message }; }
    if (out.type === "limit" && !(out.price > 0)) return { err: "Add a price — at 0.0000001, at +5% or at mcap 50k." };
    if (out.type === "stop" && !(out.trigger > 0)) return { err: "Add the trigger — stop sell at -8%." };
    if (out.usd != null && !ctx.qUsd) return { err: "No dollar price for the quote yet." };
    if (out.usd != null) out.quote = out.usd / ctx.qUsd;
    if (!(out.amount > 0) && !(out.quote > 0) && !(out.pct > 0)) return { err: "Add an amount — 1m, $100, 0.1 eth or 50%." };
    return out;
  }
  window.arcOrderLine = { parse, numOf, priceOf };
})();
