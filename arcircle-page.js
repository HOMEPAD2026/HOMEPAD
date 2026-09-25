// arcircle-page.js — the live parts of the $ARCIRCLE page (arcircle.html):
//   • stats row, 7-day line, graduation ring, buybacks, supply donut — all
//     from arcToken (arc-token.js), refreshed every 30 seconds
//   • flywheel: particles run along the ring and steps 1→4 light up in turn,
//     in sync with the step cards (hover or tap a card to hold it)
//   • hero coin: tilts toward the pointer, and its rim glows green / red when
//     the price ticks up / down
//   • revenue list + flow into "Where it goes" (shared with the Reward page)
(function () {
  "use strict";
  if (!document.body.classList.contains("ax-token") || document.body.classList.contains("ax-reward-page")) return;
  var T = window.arcToken;
  if (!T) return;
  var F = T.fmt;
  var reduce = T.reduce;
  function all(k) { return document.querySelectorAll('[data-tk="' + k + '"]'); }
  function setText(k, v) { Array.prototype.forEach.call(all(k), function (el) { if (el.textContent !== v) el.textContent = v; }); }
  function setHtml(k, v) { Array.prototype.forEach.call(all(k), function (el) { if (el.__html !== v) { el.innerHTML = v; el.__html = v; } }); }

  // ---------- live numbers ----------
  var lastPrice = null, ringShown = false, lastData = null;
  function paint(d) {
    lastData = d;
    var indexing = d.complete === false;
    setText("price", F.price(d.price));
    setText("mcap", F.usd(d.mcap));
    Array.prototype.forEach.call(all("change"), function (el) {
      var c = indexing ? null : d.change24h;
      el.textContent = c == null ? "" : (c >= 0 ? "▲ " : "▼ ") + Math.abs(c).toFixed(Math.abs(c) < 10 ? 2 : 1) + "% 24h";
      el.className = "ax-chg " + (c == null ? "" : c >= 0 ? "up" : "down");
    });
    // While the server is still reading the history for the first time the
    // history-based numbers would be partial: show them as pending instead.
    if (indexing || d.partial) {
      setText("vol", "…"); setText("trades", indexing ? "Indexing…" : "");
      setText("holders", "…"); setText("holders-sub", indexing ? "Indexing…" : "");
    } else {
      setText("vol", F.usd(d.vol24h));
      setText("trades", d.trades24h + (d.trades24h === 1 ? " trade" : " trades"));
      Array.prototype.forEach.call(all("holders"), function (el) { T.countTo(el, d.holders, function (v) { return Math.round(v).toLocaleString("en-US"); }); });
      setText("holders-sub", "On-chain");
    }
    setText("togo", d.graduated ? "Graduated" : F.usd(d.toGraduate, true));
    setText("liq", F.usd(d.liquidity, true) + " USDC");
    setText("thr", F.usd(d.threshold, true) + " USDC");
    var pct = d.graduated ? 100 : d.progress || 0;
    Array.prototype.forEach.call(all("bar"), function (el) { el.style.width = Math.max(pct, 0.8) + "%"; });
    setText("pct", pct.toFixed(pct < 10 ? 2 : 1) + "%");
    if (ringShown) fillRing(pct);
    // coin rim: green / red on a price tick
    if (lastPrice != null && d.price != null && d.price !== lastPrice) pulseCoin(d.price > lastPrice ? "up" : "down");
    lastPrice = d.price;
    if (d.partial || indexing) return; // only the curve fallback answered / history still loading
    paintSpark(d);
    paintBuybacks(d);
    paintSupply(d);
  }
  function paintSpark(d) {
    var box = document.querySelector('[data-tk="spark"]');
    if (!box) return;
    var svg = T.spark(d.spark, { w: 320, h: 96, label: "$ARCIRCLE price over the last 7 days" });
    if (!svg) { setHtml("spark", '<p class="ax-spark-empty">Not enough trades yet for a 7-day line.</p>'); return; }
    if (box.__svg !== svg) {
      var first = !box.__svg;
      box.innerHTML = svg; box.__svg = svg; box.__html = svg;
      if (first && !reduce) {
        var s = box.querySelector("svg");
        T.onVisible(box, function () { s.classList.add("draw"); });
      } else box.querySelector("svg").classList.add("drawn");
    }
  }
  function paintBuybacks(d) {
    var b = d.buybacks;
    if (!b) return;
    setText("bb-n", String(b.n));
    setText("bb-usdc", F.usd(b.usdc));
    setText("bb-tok", F.num(b.tokens));
    var html = b.list.length
      ? b.list.slice(0, 8).map(function (x) {
        return '<a href="' + F.explorer("tx", x.tx) + '" target="_blank" rel="noopener"><span class="ax-bb-type">Buy</span><b>' + F.usd(x.usdc) + "</b><span>" + F.num(x.tokens) + " $ARCIRCLE</span><time>" + F.ago(x.ts) + '</time><span class="ax-bb-tx" aria-hidden="true">↗</span></a>';
      }).join("")
      : '<p class="ax-bb-empty">' + (d.complete === false ? "Checking every trade since launch…" : "No buybacks yet. The roadmap puts the first treasury buybacks in Phase 1 (Q4 2026) — each one will appear here automatically, with its transaction.") + "</p>";
    setHtml("bb-list", html);
    var w = (d.treasury && d.treasury.wallets) || [];
    setHtml("bb-wallets", w.length ? "Tracked: " + w.map(function (x) {
      return F.esc(x.label) + ' <a href="' + F.explorer("address", x.address) + '" target="_blank" rel="noopener" data-no-i18n>' + F.short(x.address) + " ↗</a>";
    }).join(" · ") : "");
  }
  var SPLIT = [["curve", "Bonding curve", "#35d8d0"], ["treasury", "Treasury", "#39ff88"], ["top10", "Top 10 holders", "#4d9fff"], ["others", "Everyone else", "#ffc861"]];
  function paintSupply(d) {
    if (!d.split) return;
    var parts = SPLIT.map(function (s) { return { v: d.split[s[0]] || 0, label: s[1], color: s[2] }; });
    var svg = T.donut(parts, { center: "1B", sub: "total supply", label: "Where the $ARCIRCLE supply sits" });
    var box = document.querySelector('[data-tk="donut"]');
    if (box && box.__svg !== svg) {
      var first = !box.__svg;
      box.innerHTML = svg; box.__svg = svg;
      if (first && !reduce) { var s = box.querySelector("svg"); T.onVisible(box, function () { s.classList.add("spin-in"); }); }
      else box.querySelector("svg").classList.add("shown");
    }
    setHtml("legend", SPLIT.map(function (s) {
      var v = d.split[s[0]] || 0;
      return '<li style="--c:' + s[2] + '"><span>' + s[1] + "</span><b>" + (v / 1e7).toFixed(v / 1e7 < 10 ? 2 : 1) + "%</b></li>";
    }).join(""));
  }
  function fillRing(pct) {
    var arc = document.querySelector(".ax-grad-arc");
    if (arc) arc.setAttribute("stroke-dasharray", Math.max(0.6, Math.min(100, pct)).toFixed(2) + " 100");
  }
  T.onVisible(document.getElementById("graduation"), function () {
    ringShown = true;
    if (lastData) fillRing(lastData.graduated ? 100 : lastData.progress || 0);
  });

  // ---------- hero coin ----------
  var coin = document.querySelector(".ax-coin[data-tilt]");
  function pulseCoin(dir) {
    if (!coin || reduce) return;
    coin.classList.remove("tick-up", "tick-down"); void coin.offsetWidth;
    coin.classList.add(dir === "up" ? "tick-up" : "tick-down");
    clearTimeout(coin.__t);
    coin.__t = setTimeout(function () { coin.classList.remove("tick-up", "tick-down"); }, 1400);
  }
  if (coin && !reduce && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var hero = coin.closest("section") || coin;
    var raf = 0, tx = 0, ty = 0;
    hero.addEventListener("pointermove", function (e) {
      var r = coin.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.9)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        coin.style.setProperty("--rx", (-ty * 10).toFixed(2) + "deg");
        coin.style.setProperty("--ry", (tx * 12).toFixed(2) + "deg");
        coin.style.setProperty("--gx", (50 + tx * 30).toFixed(1) + "%");
        coin.style.setProperty("--gy", (50 + ty * 30).toFixed(1) + "%");
      });
    });
    hero.addEventListener("pointerleave", function () {
      coin.style.setProperty("--rx", "0deg"); coin.style.setProperty("--ry", "0deg");
    });
  }

  // ---------- flywheel sync ----------
  var fly = document.getElementById("flywheel");
  if (fly) {
    var nodes = fly.querySelectorAll(".ax-fly-node"), steps = fly.querySelectorAll(".ax-step");
    var cur = 0, hold = false, timer = 0, on = false;
    var show = function (n) {
      cur = n;
      Array.prototype.forEach.call(nodes, function (g) { g.classList.toggle("on", Number(g.getAttribute("data-step")) === n); });
      Array.prototype.forEach.call(steps, function (li) { li.classList.toggle("on", Number(li.getAttribute("data-step")) === n); });
    };
    var cycle = function () {
      clearTimeout(timer);
      if (!on || hold || document.hidden) return;
      show(cur % 4 + 1);
      timer = setTimeout(cycle, 2600);
    };
    Array.prototype.forEach.call(steps, function (li) {
      var n = Number(li.getAttribute("data-step"));
      li.addEventListener("pointerenter", function () { hold = true; clearTimeout(timer); show(n); });
      li.addEventListener("pointerleave", function () { hold = false; timer = setTimeout(cycle, 1600); });
      li.addEventListener("click", function () { show(n); });
    });
    if (!reduce && "IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        on = ents.some(function (e) { return e.isIntersecting; });
        if (on) { fly.classList.add("fly-live"); cycle(); } else clearTimeout(timer);
      }, { threshold: 0.25 }).observe(fly);
    }
  }

  // ---------- revenue ----------
  var rev = document.querySelector("#revenue .ax-rev");
  if (rev) { T.mountRevenue(rev.querySelector("[data-rev-list]")); T.mountFlow(rev); }

  T.subscribe(paint);
})();
