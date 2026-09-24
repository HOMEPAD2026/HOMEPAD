/* global CONFIG */
// arc-footer.js — the information footer on ArcPad, CirclePad, $ARCIRCLE and
// Reward: products, resources, every live contract (copy + ArcScan), a live
// network status (latest Arc block and how fast the RPC answered), and the
// sound-effects switch. Also owns the site's feedback layer:
//   window.arcSound(kind)   — short synthesized sounds (off unless enabled)
//   window.arcHaptic(kind)  — vibration patterns per action
//   window.arcFeedback(kind) — both; kind = buy | sell | launch | milestone | tap
(function () {
  "use strict";
  var RPC = (typeof CONFIG !== "undefined" && CONFIG.RPC_URL) || "https://rpc.mainnet.arc.io";
  var EXPLORER = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";
  var SOUND_KEY = "arcircle.sound";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------- sound + haptics ----------------
  var ctx = null;
  function soundOn() { try { return localStorage.getItem(SOUND_KEY) === "on"; } catch (e) { return false; } }
  function tone(freq, start, dur, type, gain) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, ctx.currentTime + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
  }
  var SOUNDS = {
    buy: function () { tone(988, 0, 0.09, "triangle"); tone(1319, 0.07, 0.22, "triangle"); },
    sell: function () { tone(784, 0, 0.09, "triangle"); tone(587, 0.07, 0.22, "triangle"); },
    launch: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, i * 0.07, 0.28, "triangle", 0.1); }); },
    milestone: function () { tone(1047, 0, 0.12, "sine", 0.1); tone(1568, 0.1, 0.35, "sine", 0.1); },
    tap: function () { tone(1400, 0, 0.04, "sine", 0.05); },
  };
  window.arcSound = function (kind) {
    if (!soundOn() || !SOUNDS[kind]) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      SOUNDS[kind]();
    } catch (e) { /* no audio */ }
  };
  var HAPTICS = { buy: [18], sell: [10, 40, 10], launch: [30, 60, 30, 60, 90], milestone: [20, 40, 60], tap: [8] };
  window.arcHaptic = function (kind) {
    if (reduce || !navigator.vibrate || !HAPTICS[kind]) return;
    try { navigator.vibrate(HAPTICS[kind]); } catch (e) { /* not allowed */ }
  };
  window.arcFeedback = function (kind) { window.arcSound(kind); window.arcHaptic(kind); };

  // ---------------- footer ----------------
  var CONTRACTS = [
    ["ArcPad factory", "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E"],
    ["Swap router", "0xFCA8fD788d44Bb335B1451257366e06D67114785"],
    ["Fee hook", "0x484D416E73Eb44d276DDeF04cDBAdf2f4907c044"],
    ["$ARCIRCLE", "0x933a94b475fa9d8ef94fa564e38dda400a595aa1"],
    ["$ARCIRCLE curve", "0xa37A96C43e2335553BD79171DE6dB2806414AC64"],
    ["CirclePad escrow", "0xC5998d7cE728FDd6f77217fdE775aAb90Ec61703"],
  ];
  var short = function (a) { return a.slice(0, 6) + "…" + a.slice(-4); };
  function build() {
    var old = document.querySelector("footer.ah-footer");
    var dock = document.querySelector("nav.ax-dock");
    var f = document.createElement("footer");
    f.className = "axf";
    f.innerHTML =
      '<div class="axf-in">' +
        '<div class="axf-brand"><a href="/" class="axf-logo"><img src="/images/arcircle-mark-sm.png" alt="" width="40" height="28"><span>ARCIRCLE <em>PAD</em></span></a>' +
          '<p>Two launchpads and one core coin on Circle\'s Arc. Every number on this site is read live from the chain.</p>' +
          '<div class="axf-net" id="axf-net"><span class="axf-dot"></span><span class="axf-net-txt">Arc mainnet · checking…</span></div></div>' +
        '<div class="axf-col"><h4>Products</h4><a href="/arc">ArcPad</a><a href="/circle">CirclePad</a><a href="/arcircle">$ARCIRCLE</a><a href="/reward">Reward</a></div>' +
        '<div class="axf-col"><h4>Resources</h4><a href="/whitepaper">Whitepaper</a><a href="/whitepaper/ko" lang="ko">백서 (한국어)</a><a href="/arc#docs">ArcPad docs</a><a href="/circle#docs">CirclePad docs</a></div>' +
        '<div class="axf-col axf-contracts"><h4>Contracts</h4>' + CONTRACTS.map(function (c) {
          return '<div class="axf-ca"><span>' + c[0] + '</span><a href="' + EXPLORER + '/address/' + c[1] + '" target="_blank" rel="noopener" data-no-i18n>' + short(c[1]) + ' ↗</a>' +
            '<button type="button" class="axf-copy" data-copy-ca="' + c[1] + '" aria-label="Copy address">Copy</button></div>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="axf-bottom"><span>Nothing on this site is financial advice. Crypto assets can lose all of their value.</span>' +
        '<button type="button" class="axf-sound" id="axf-sound" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="axf-wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg><span></span></button></div>';
    if (old) old.replaceWith(f);
    else if (dock) dock.parentNode.insertBefore(f, dock);
    else document.body.appendChild(f);

    f.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-copy-ca]");
      if (!b) return;
      var done = function (t) { b.textContent = t; setTimeout(function () { b.textContent = "Copy"; }, 1400); };
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(b.getAttribute("data-copy-ca")) : Promise.reject()).then(function () { done("Copied"); }, function () { done("Copy failed"); });
    });
    var snd = f.querySelector("#axf-sound");
    var paint = function () {
      var on = soundOn();
      snd.setAttribute("aria-pressed", on ? "true" : "false");
      snd.classList.toggle("on", on);
      snd.querySelector("span").textContent = on ? "Sound on" : "Sound off";
    };
    snd.addEventListener("click", function () {
      try { localStorage.setItem(SOUND_KEY, soundOn() ? "off" : "on"); } catch (e) { /* storage blocked */ }
      paint();
      window.arcFeedback("tap");
    });
    paint();
    netStatus();
    setInterval(function () { if (!document.hidden) netStatus(); }, 30000);
  }

  // Latest block + round-trip time, straight from the RPC (no ethers needed).
  function netStatus() {
    var box = document.getElementById("axf-net");
    if (!box) return;
    var t0 = performance.now();
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var ms = Math.round(performance.now() - t0), n = parseInt(j.result, 16);
        if (!isFinite(n)) throw new Error("bad");
        box.className = "axf-net " + (ms < 800 ? "ok" : "slow");
        box.querySelector(".axf-net-txt").innerHTML = 'Arc mainnet · block <b data-no-i18n>#' + n.toLocaleString("en-US") + '</b> · ' + ms + ' ms';
      })
      .catch(function () { box.className = "axf-net bad"; box.querySelector(".axf-net-txt").textContent = "Arc RPC not reachable right now"; })
      .then(function () { clearTimeout(timer); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
