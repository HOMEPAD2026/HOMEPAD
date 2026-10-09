/* global ethers, state, CONFIG */
// arc-txring.js — two small pieces of motion shared by every app page:
//
//   · tx ring: every transaction the site asks a wallet to send shows a ring that fills as it
//     moves — confirm in wallet → submitted → in a block → done (green check) or failed. It hooks
//     ethers' JsonRpcSigner.sendTransaction once, so every contract call on every page gets it
//     without the page knowing.
//   · wallet rings: after someone connects a wallet, two rings (blue, green) swing in and lock
//     together over the wallet button — the same ring language as ARCIA's entrance.
(function () {
  "use strict";
  if (window.arcTxRing) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var EXPL = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";
  var R = 16, C = 2 * Math.PI * R;
  var CHECK = '<path class="txr-ok" d="M13 20.5l4.5 4.5 9-10"/>', CROSS = '<path class="txr-bad" d="M15 15l10 10M25 15 15 25"/>';

  // ---------------- tx ring ----------------
  var host = null;
  function box() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement("div");
    host.className = "txr-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
    return host;
  }
  function ring() {
    var el = document.createElement("div");
    el.className = "txr";
    el.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="txr-track" cx="20" cy="20" r="' + R + '"/><circle class="txr-fill" cx="20" cy="20" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"/><g class="txr-mark"></g></svg>' +
      '<div class="txr-t"><b></b><small></small></div><button type="button" class="txr-x" aria-label="Close">×</button>';
    box().appendChild(el);
    requestAnimationFrame(function () { el.classList.add("in"); });
    var done = false, timer = 0;
    var fill = el.querySelector(".txr-fill");
    function set(p, title, sub, cls) {
      fill.style.strokeDashoffset = (C * (1 - p)).toFixed(2);
      el.querySelector("b").textContent = tr(title);
      el.querySelector("small").innerHTML = sub || "";
      if (cls) el.classList.add(cls);
    }
    function close(ms) { clearTimeout(timer); timer = setTimeout(function () { el.classList.remove("in"); el.classList.add("out"); setTimeout(function () { el.remove(); }, 350); }, ms); }
    el.querySelector(".txr-x").addEventListener("click", function () { close(0); });
    set(0.18, "Confirm in your wallet", esc(tr("Waiting for your signature")));
    var ex = EXPL; // the transaction's own chain's explorer (Robinhood Chain for veARCIA, Pons, Orders RH…)
    var link = function (h) { return '<a href="' + esc(ex + "/tx/" + h) + '" target="_blank" rel="noopener">' + esc(h.slice(0, 10) + "…" + h.slice(-6)) + " ↗</a>"; };
    var cur = "";
    var tell = function (h, st) { if (!h) return; cur = h; try { document.dispatchEvent(new CustomEvent("arc:tx", { detail: { h: h, s: st, ex: ex } })); } catch (e) { /* old browser */ } };
    return {
      chain: function (cid) { if (Number(cid) === 4663) ex = (typeof CONFIG !== "undefined" && CONFIG.PONS && CONFIG.PONS.EXPLORER) || "https://robinhoodchain.blockscout.com"; },
      sent: function (h) { if (done) return; tell(h, "pending"); set(0.55, "Transaction submitted", esc(tr("Waiting for a block")) + " · " + link(h), "sent"); },
      mined: function (h) { if (done) return; done = true; tell(h, "ok"); set(1, "Transaction confirmed", link(h), "ok"); el.querySelector(".txr-mark").innerHTML = CHECK; if (typeof window.arcHaptic === "function") window.arcHaptic("milestone"); close(4200); },
      failed: function (h, why) { if (done) return; done = true; tell(h, "fail"); set(1, why === "rejected" ? "Cancelled in wallet" : "Transaction failed", h ? link(h) : esc(tr(why === "rejected" ? "Nothing was sent." : "Nothing changed — you can try again."))); el.classList.add(why === "rejected" ? "cancel" : "bad"); el.querySelector(".txr-mark").innerHTML = CROSS; close(why === "rejected" ? 2600 : 6000); },
    };
  }
  var rejected = function (e) { var m = String((e && (e.code || e.shortMessage || e.message)) || ""); return /ACTION_REJECTED|4001|user rejected|user denied|rejected the request/i.test(m + " " + String(e && e.info && e.info.error && e.info.error.code)); };
  function hook() {
    if (typeof ethers === "undefined" || !ethers.JsonRpcSigner || !ethers.JsonRpcSigner.prototype.sendTransaction) return false;
    var proto = ethers.JsonRpcSigner.prototype;
    if (proto.__arcRing) return true;
    var orig = proto.sendTransaction;
    proto.sendTransaction = function () {
      var r = ring();
      return orig.apply(this, arguments).then(function (resp) {
        var h = resp && resp.hash;
        if (resp && resp.chainId != null) r.chain(resp.chainId);
        if (h) r.sent(h);
        if (resp && typeof resp.wait === "function") {
          resp.wait().then(function (rc) { if (rc && rc.status === 1) r.mined(h); else r.failed(h, "reverted"); }, function (e) { r.failed(h, rejected(e) ? "rejected" : "reverted"); });
        }
        return resp;
      }, function (e) { r.failed(null, rejected(e) ? "rejected" : "error"); throw e; });
    };
    proto.__arcRing = true;
    return true;
  }
  if (!hook()) window.addEventListener("load", hook);

  // ---------------- wallet rings ----------------
  var armed = 0, last = null;
  document.addEventListener("pointerdown", function (e) {
    var t = e.target && e.target.closest && e.target.closest("#connect-btn, [data-connect], .connect-btn, .bp-connect, button");
    if (t && (t.id === "connect-btn" || /connect|지갑 연결|연결|连接/i.test(t.textContent || ""))) armed = Date.now();
  }, true);
  function celebrate() {
    if (reduce) return;
    var target = document.querySelector(".cw-b") || document.getElementById("wallet-pill-btn") || document.getElementById("wallet-slot");
    var r = target ? target.getBoundingClientRect() : { left: innerWidth - 120, top: 16, width: 100, height: 36 };
    var el = document.createElement("div");
    el.className = "wcr";
    el.setAttribute("aria-hidden", "true");
    el.style.left = Math.round(r.left + r.width / 2) + "px";
    el.style.top = Math.round(r.top + r.height / 2) + "px";
    el.innerHTML = '<i class="l"></i><i class="r"></i><b>' + esc(tr("Wallet connected")) + "</b>";
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1500);
  }
  setInterval(function () {
    var a = null;
    try { a = typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : null; } catch (e) { a = null; }
    if (a && !last && Date.now() - armed < 120000) { armed = 0; setTimeout(celebrate, 120); }
    last = a;
  }, 400);

  window.arcTxRing = { demo: function () { var r = ring(); setTimeout(function () { r.sent("0x" + "ab".repeat(32)); }, 700); setTimeout(function () { r.mined("0x" + "ab".repeat(32)); }, 1600); return r; }, celebrate: celebrate };
})();
