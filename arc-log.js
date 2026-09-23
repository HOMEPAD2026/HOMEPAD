// arc-log.js — reports uncaught front-end errors to /api/log (Vercel function
// logs) so problems people hit on their own phones and wallets are visible.
// At most 5 reports per page view, duplicates dropped, nothing personal sent:
// the message, where it happened, the page path and the build version.
(function () {
  "use strict";
  var sent = 0, seen = {};
  var ver = (function () { var m = /[?&]v=(\d+)/.exec((document.currentScript || {}).src || ""); return m ? m[1] : ""; })();
  var IGNORE = /^Script error\.?$|ResizeObserver loop|Non-Error promise rejection captured|User (rejected|denied)|user rejected|ACTION_REJECTED|4001|Load failed$|Failed to fetch$|NetworkError when attempting|The operation was aborted|AbortError/i;
  function send(kind, msg, src, line, stack) {
    msg = String(msg || "").slice(0, 400);
    if (!msg || IGNORE.test(msg) || sent >= 5) return;
    var key = kind + "|" + msg + "|" + (src || "") + ":" + (line || "");
    if (seen[key]) return;
    seen[key] = 1; sent++;
    var body = JSON.stringify({ kind: kind, msg: msg, src: String(src || "").replace(location.origin, "").slice(0, 200), line: line || 0,
      stack: String(stack || "").slice(0, 1200), page: location.pathname + location.hash.replace(/0x[0-9a-fA-F]{40}/g, "0x…"), v: ver });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/log", new Blob([body], { type: "application/json" }))) return;
      fetch("/api/log", { method: "POST", body: body, headers: { "content-type": "application/json" }, keepalive: true }).catch(function () {});
    } catch (e) { /* never let the reporter throw */ }
  }
  window.addEventListener("error", function (e) {
    if (!e || !e.message) return; // resource load errors have no message
    send("error", e.message, e.filename, e.lineno, e.error && e.error.stack);
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    var msg = r && (r.shortMessage || r.message) || String(r);
    send("rejection", msg, "", 0, r && r.stack);
  });
  window.arcReportError = function (msg, err) { send("manual", msg + (err ? ": " + (err.shortMessage || err.message || err) : ""), "", 0, err && err.stack); };
})();
