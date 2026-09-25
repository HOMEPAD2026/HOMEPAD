// arc-token.js — what the $ARCIRCLE page and the Reward page share:
//   • arcToken.load(wallet)  live $ARCIRCLE numbers from /api/social?token=arcircle
//     (price, graduation, 24h volume, holders, buybacks, treasury, revenue),
//     with a direct read of the curve as a fallback for price and graduation
//   • the one definition of the ecosystem's revenue sources (ARC_REVENUE),
//     rendered identically on both pages, each with its live "so far" line
//   • the revenue flow: particles running from each source into the box it
//     feeds, drawn on a canvas behind the two columns
//   • small SVG builders (7-day line, supply donut) and number formats
// No wallet connection, no ethers. Respects prefers-reduced-motion.
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TOKEN = "0x933a94b475fa9d8ef94fa564e38dda400a595aa1";
  var CURVE = "0xa37A96C43e2335553BD79171DE6dB2806414AC64";
  var RPC = (typeof CONFIG !== "undefined" && CONFIG.RPC_URL) || "https://rpc.mainnet.arc.io";
  var EXPLORER = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";

  // ---------- formats ----------
  var SUBS = "₀₁₂₃₄₅₆₇₈₉";
  function price(p) {
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (p >= 0.001) return "$" + p.toPrecision(4);
    var zeros = Math.floor(-Math.log10(p));
    var digits = (Math.round(p * Math.pow(10, zeros + 4)).toString().slice(0, 4).replace(/0+$/, "")) || "0";
    return "$0.0" + String(zeros).split("").map(function (d) { return SUBS[d]; }).join("") + digits;
  }
  function usd(n, exact) {
    if (n == null || !isFinite(n)) return "—";
    if (!exact && Math.abs(n) >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    if (n > 0 && n < 0.01) return "<$0.01";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(n) {
    if (n == null || !isFinite(n)) return "—";
    if (Math.abs(n) >= 10000) return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function ago(ts) {
    if (!ts) return "";
    var s = Math.max(0, Date.now() / 1000 - ts);
    return s < 3600 ? Math.max(1, Math.floor(s / 60)) + "m ago" : s < 86400 ? Math.floor(s / 3600) + "h ago" : Math.floor(s / 86400) + "d ago";
  }
  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function explorer(kind, x) { return EXPLORER + "/" + kind + "/" + x; }

  // ---------- data ----------
  var memo = null; // { at, p }
  function fetchJson(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms || 12000) : null;
    return fetch(url, { signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).finally(function () { if (t) clearTimeout(t); });
  }
  // Fallback: the curve itself, four eth_calls in one batch (price + graduation only).
  function word(h, i) { return BigInt("0x" + (String(h).replace(/^0x/, "").slice(i * 64, (i + 1) * 64) || "0")); }
  function readCurve() {
    var calls = ["0x0902f1ac", "0x4f1f58fd", "0x8b0bc501", "0xe7c2b772"];
    // getReserves(), realQuoteReserve(), graduationThreshold(), graduated()
    var body = calls.map(function (d, id) { return { jsonrpc: "2.0", id: id, method: "eth_call", params: [{ to: CURVE, data: d }, "latest"] }; });
    return fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (out) {
        var by = {}; (Array.isArray(out) ? out : [out]).forEach(function (x) { by[x.id] = x.result; });
        if (!by[0] || by[0] === "0x") throw new Error("curve unreadable");
        var qr = Number(word(by[0], 0)) / 1e6, tr = Number(word(by[0], 1)) / 1e18;
        var real = Number(word(by[1] || "0x", 0)) / 1e6, thr = Number(word(by[2] || "0x", 0)) / 1e6, grad = word(by[3] || "0x", 0) > 0n;
        var p = tr > 0 ? qr / tr : null;
        return { partial: true, price: p, mcap: p != null ? p * 1e9 : null, liquidity: real, threshold: thr, graduated: grad,
          progress: grad ? 100 : thr > 0 ? Math.min(100, (real / thr) * 100) : 0, toGraduate: grad ? 0 : Math.max(0, thr - real) };
      });
  }
  function load(wallet, fresh) {
    if (!wallet && !fresh && memo && Date.now() - memo.at < 20000) return memo.p;
    var url = "/api/social?token=arcircle" + (wallet ? "&wallet=" + encodeURIComponent(wallet) : "");
    var p = fetchJson(url, wallet ? 25000 : 15000).then(function (j) {
      if (!j || j.error || j.price === undefined) throw new Error((j && j.error) || "no data");
      return j;
    }).catch(function (err) {
      if (wallet) throw err;
      return readCurve();
    });
    if (!wallet) { memo = { at: Date.now(), p: p }; p.catch(function () { memo = null; }); }
    return p;
  }
  // Keep the page's numbers current: every 30s while visible; while the
  // server is still indexing history, again after 6s.
  var subs = [], timer = null, last = null;
  function tick() {
    clearTimeout(timer);
    load(null, true).then(function (d) {
      last = d;
      subs.forEach(function (fn) { try { fn(d); } catch (e) { console.warn("arcToken subscriber", e); } });
      document.dispatchEvent(new CustomEvent("arcircle:stats", { detail: d }));
      timer = setTimeout(loop, d.complete === false ? 6000 : 30000);
    }, function () { timer = setTimeout(loop, 30000); });
  }
  function loop() { if (document.hidden) { timer = setTimeout(loop, 5000); return; } tick(); }
  function subscribe(fn) {
    subs.push(fn);
    if (last) fn(last);
    if (subs.length === 1) tick();
  }

  // ---------- helpers ----------
  function onVisible(el, fn, margin) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (ents) {
      if (ents.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { rootMargin: margin || "0px 0px -10% 0px", threshold: 0.1 });
    io.observe(el);
  }
  function countTo(el, to, fmt, ms) {
    if (!el || to == null || !isFinite(to)) return;
    if (typeof window.arcCountUp === "function") return window.arcCountUp(el, to, fmt, ms);
    el.textContent = fmt ? fmt(to) : String(to);
  }

  // ---------- revenue: one definition for both pages ----------
  var REVENUE = [
    { id: "launch", tag: "ArcPad", acc: "#4d9fff", name: "Launch fee", sub: "Flat fee on every coin launched on ArcPad", amt: "1 USDC" },
    { id: "alloc", tag: "ArcPad", acc: "#4d9fff", name: "Platform allocation", sub: "Of every ArcPad coin's supply, set aside at launch", amt: "8%" },
    { id: "fees", tag: "ArcPad", acc: "#4d9fff", name: "Trading-fee share", sub: "30% of the 1% base fee on every ArcPad trade", amt: "0.3%" },
    { id: "raise", tag: "CirclePad", acc: "#39ff88", name: "Raise share", sub: "Of each CirclePad raise when it closes", amt: "5%" },
    { id: "tax", tag: "$ARCIRCLE", acc: "#35d8d0", name: "Creator tax", sub: "On every $ARCIRCLE trade on its curve", amt: "2%" },
  ];
  window.ARC_REVENUE = REVENUE;
  function revenueRows() {
    return REVENUE.map(function (r) {
      return '<div class="ax-rev-row" style="--acc:' + r.acc + '" data-rev="' + r.id + '">' +
        '<span class="ax-tag">' + esc(r.tag) + "</span>" +
        '<div class="ax-rev-name"><strong>' + esc(r.name) + "</strong><small>" + esc(r.sub) + '</small><em class="ax-rev-live" data-rev-live="' + r.id + '"></em></div>' +
        '<div class="ax-rev-amt">' + esc(r.amt) + "</div></div>";
    }).join("");
  }
  function liveLine(id, d) {
    var rv = d && d.revenue;
    if (!rv) return "";
    if (id === "launch") return rv.launches != null ? rv.launches + " launches so far · " + usd(rv.launchFees) : "";
    if (id === "alloc") return rv.allocationCoins != null ? rv.allocationCoins + " coins so far" : "";
    if (id === "fees") return "Paid to the treasury on every trade";
    if (id === "raise") {
      var c = rv.circle;
      if (!c) return "";
      if (!c.started) return "Round #1 opens soon";
      return "Round #1: " + usd(c.raised) + " raised · " + usd(c.share) + " at close";
    }
    if (id === "tax") return rv.creatorTax != null ? usd(rv.creatorTax) + " earned since launch" : "";
    return "";
  }
  function mountRevenue(list) {
    if (!list || list.__rev) return;
    list.__rev = true;
    list.innerHTML = revenueRows();
    subscribe(function (d) {
      REVENUE.forEach(function (r) {
        var el = list.querySelector('[data-rev-live="' + r.id + '"]');
        var t = liveLine(r.id, d);
        if (el && el.textContent !== t) { el.textContent = t; el.classList.toggle("on", !!t); }
      });
    });
  }

  // ---------- revenue flow: particles from each source into the box ----------
  function mountFlow(rev) {
    var list = rev && rev.querySelector(".ax-rev-list"), dest = rev && rev.querySelector(".ax-rev-dest");
    if (!list || !dest || rev.__flow) return;
    rev.__flow = true;
    var cv = document.createElement("canvas");
    cv.className = "ax-rev-flow";
    cv.setAttribute("aria-hidden", "true");
    rev.insertBefore(cv, rev.firstChild);
    var ctx = cv.getContext("2d");
    if (!ctx) return;
    var paths = [], parts = [], running = false, visible = false, dpr = 1, wide = true, raf = 0;
    function layout() {
      var R = rev.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(R.width * dpr); cv.height = Math.round(R.height * dpr);
      cv.style.width = R.width + "px"; cv.style.height = R.height + "px";
      var D = dest.getBoundingClientRect(), L = list.getBoundingClientRect();
      wide = D.left > L.right - 4; // two columns side by side
      var rows = list.querySelectorAll(".ax-rev-row");
      paths = Array.prototype.map.call(rows, function (row, i) {
        var r = row.getBoundingClientRect();
        var acc = getComputedStyle(row).getPropertyValue("--acc").trim() || "#35d8d0";
        if (wide) {
          // from the row's right edge into the box's left edge, fanned out over its height
          var x0 = L.right - R.left - 2, y0 = r.top + r.height / 2 - R.top;
          var x1 = D.left - R.left + 2, y1 = D.top - R.top + 30 + ((D.height - 60) * i) / Math.max(1, rows.length - 1);
          var mx = (x1 - x0) * 0.55;
          return { acc: acc, p: [x0, y0, x0 + mx, y0, x1 - mx, y1, x1, y1] };
        }
        // stacked: from under the list down into the top of the box
        var sx = L.left - R.left + (L.width * (i + 1)) / (rows.length + 1), sy = L.bottom - R.top - 2;
        var ex = D.left - R.left + D.width / 2 + (i - (rows.length - 1) / 2) * 10, ey = D.top - R.top + 2;
        var my = (ey - sy) / 2;
        return { acc: acc, p: [sx, sy, sx, sy + my, ex, ey - my, ex, ey] };
      });
    }
    function bez(p, t) {
      var u = 1 - t;
      return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
        u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]];
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      paths.forEach(function (q) {
        var p = q.p;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
        ctx.strokeStyle = q.acc; ctx.globalAlpha = 0.22; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]); ctx.stroke();
      });
      ctx.setLineDash([]);
      parts.forEach(function (pt) {
        var q = paths[pt.k]; if (!q) return;
        var xy = bez(q.p, pt.t);
        ctx.globalAlpha = Math.sin(Math.PI * pt.t) * 0.95;
        ctx.fillStyle = q.acc; ctx.shadowColor = q.acc; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      });
      ctx.globalAlpha = 1;
    }
    var lastT = 0;
    function frame(t) {
      var dt = lastT ? Math.min(50, t - lastT) : 16; lastT = t;
      parts.forEach(function (pt) { pt.t += dt * pt.v; if (pt.t >= 1) { pt.t = 0; pt.k = Math.floor(Math.random() * paths.length); } });
      draw();
      if (running) raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduce || !visible || document.hidden) return;
      running = true; lastT = 0; raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }
    layout();
    for (var i = 0; i < 14; i++) parts.push({ k: i % Math.max(1, paths.length), t: Math.random(), v: 0.00022 + Math.random() * 0.00016 });
    draw();
    var relayout = function () { layout(); draw(); };
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(rev);
    window.addEventListener("resize", relayout);
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        visible = ents.some(function (e) { return e.isIntersecting; });
        if (visible) { relayout(); start(); } else stop();
      }, { threshold: 0.05 }).observe(rev);
    }
    // the live lines change row heights
    subscribe(function () { setTimeout(relayout, 60); });
  }

  // ---------- SVG builders ----------
  function spark(values, opts) {
    opts = opts || {};
    var W = opts.w || 320, Hh = opts.h || 90, pad = 4;
    var v = (values || []).filter(function (x) { return x != null && isFinite(x); });
    if (v.length < 2) return "";
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (hi === lo) { hi = lo * 1.01 || 1; lo = lo * 0.99; }
    var pts = [], n = values.length, lastV = null;
    values.forEach(function (x, i) {
      if (x == null) { if (lastV == null) return; x = lastV; }
      lastV = x;
      pts.push([pad + (i / (n - 1)) * (W - pad * 2), pad + (1 - (x - lo) / (hi - lo)) * (Hh - pad * 2)]);
    });
    var up = v[v.length - 1] >= v[0];
    var col = up ? "#39ff88" : "#ff5d73";
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
    var area = line + "L" + pts[pts.length - 1][0].toFixed(1) + " " + Hh + "L" + pts[0][0].toFixed(1) + " " + Hh + "Z";
    var id = "sg" + Math.random().toString(36).slice(2, 7);
    var endP = pts[pts.length - 1];
    return '<svg class="ax-spark ' + (up ? "up" : "down") + '" viewBox="0 0 ' + W + " " + Hh + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.label || "7-day price") + '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".28"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + id + ')" class="ax-spark-area"/>' +
      '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" pathLength="1" class="ax-spark-line"/>' +
      '<circle cx="' + endP[0].toFixed(1) + '" cy="' + endP[1].toFixed(1) + '" r="3.2" fill="' + col + '" class="ax-spark-dot"/></svg>';
  }
  function donut(parts, opts) {
    opts = opts || {};
    var total = parts.reduce(function (s, p) { return s + (p.v || 0); }, 0) || 1;
    var R = 60, C = 2 * Math.PI * R, off = 0;
    var segs = parts.map(function (p) {
      var len = ((p.v || 0) / total) * C;
      var s = '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="20" stroke-dasharray="' + Math.max(0, len - (len > 3 ? 1.5 : 0)).toFixed(2) + " " + C.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" class="ax-donut-seg"><title>' + esc(p.label) + "</title></circle>";
      off += len;
      return s;
    }).join("");
    return '<svg class="ax-donut" viewBox="0 0 160 160" role="img" aria-label="' + esc(opts.label || "Supply split") + '"><g transform="rotate(-90 80 80)"><circle cx="80" cy="80" r="' + R + '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="20"/>' + segs + "</g>" +
      '<text x="80" y="76" text-anchor="middle" class="ax-donut-big">' + esc(opts.center || "") + '</text><text x="80" y="96" text-anchor="middle" class="ax-donut-small">' + esc(opts.sub || "") + "</text></svg>";
  }

  window.arcToken = {
    load: load, subscribe: subscribe, mountRevenue: mountRevenue, mountFlow: mountFlow, spark: spark, donut: donut,
    onVisible: onVisible, countTo: countTo, fmt: { price: price, usd: usd, num: num, ago: ago, short: short, esc: esc, explorer: explorer },
    TOKEN: TOKEN, CURVE: CURVE, reduce: reduce,
  };
})();
