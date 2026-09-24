// arc-hubpulse.js — the hub's ring emblem answers the market: every new trade
// on ArcPad or the $ARCIRCLE curve (from the edge-cached /api/activity feed)
// sends a pulse of light through it — green for buys, red-tinged for $ARCIRCLE sells.
(function () {
  "use strict";
  var mark = document.querySelector(".ax-mark");
  if (!mark || !window.fetch) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var seen = null, queue = [], busy = false;
  function pulse(buy) {
    mark.classList.remove("ax-pulse-buy", "ax-pulse-sell"); void mark.offsetWidth;
    mark.classList.add(buy ? "ax-pulse-buy" : "ax-pulse-sell");
  }
  function drain() {
    if (busy || !queue.length) return;
    busy = true;
    pulse(queue.shift());
    setTimeout(function () { busy = false; drain(); }, 900);
  }
  function poll() {
    if (document.hidden) return;
    fetch("/api/activity").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !Array.isArray(d.recs)) return;
      var ids = [];
      // ArcPad swaps don't say which side is the coin without the pool's
      // orientation, so they pulse in the neutral (green) colour.
      d.recs.forEach(function (r) { ids.push({ id: r.h + ":" + r.i, buy: true }); });
      (d.curve || []).forEach(function (c) { ids.push({ id: c.h + ":" + c.i, buy: c.buy }); });
      if (seen === null) { seen = new Set(ids.map(function (x) { return x.id; })); mark.classList.add("ax-live"); return; }
      ids.forEach(function (x) {
        if (seen.has(x.id)) return;
        seen.add(x.id);
        queue.push(x.buy !== false);
      });
      queue = queue.slice(-4);
      drain();
    }).catch(function () {});
  }
  poll();
  setInterval(poll, 15000);
})();
