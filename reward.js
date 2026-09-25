/* global ethers, CONFIG, ARC_FACTORY_ABI, readProvider, withRetry, multicallRead */
// reward.js — live bits of the Reward page (reward.html). The reward program
// itself isn't live, so everything here is read-only context, plus one
// signed (free) poll:
//   • hero: the fixed supply counts up and the "0 new tokens" stamps in
//   • revenue: the shared list (arc-token.js) flowing into the treasury box,
//     and "earned so far" totals that count up
//   • "Check a wallet" (typed, linked, or "Use my wallet"): $ARCIRCLE held and
//     rank, how long it has been held, ArcPad coins created, CirclePad
//     contribution and invites — cards stagger in, the holding bar grows
//   • candidate-mechanics poll: one signed vote per wallet per mechanic
//   • roadmap: the line fills to the current phase, "We are here" pulses
(function () {
  "use strict";
  var ARCIRCLE_TOKEN = "0x933a94b475fa9d8ef94fa564e38dda400a595aa1";
  var SUPPLY = 1000000000;
  var ERC20 = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
  ];
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function T() { return window.arcToken; }
  function usd(n, exact) { return T() ? T().fmt.usd(n, exact) : "$" + Number(n || 0).toFixed(2); }
  function factory() { return new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider()); }
  function fmtTok(n) {
    if (!isFinite(n)) return "—";
    if (n === 0) return "0";
    if (n >= 10000) return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function day(ts) { return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "—"; }
  function countTo(el, v, fmt) { if (!el || v == null || !isFinite(v)) return; if (T()) T().countTo(el, v, fmt); else el.textContent = fmt ? fmt(v) : String(v); }
  function tk(k) { return document.querySelectorAll('[data-tk="' + k + '"]'); }
  function each(k, fn) { Array.prototype.forEach.call(tk(k), fn); }
  function setText(k, v) { each(k, function (el) { if (el.textContent !== v) el.textContent = v; }); }

  // ---- ArcPad launches (count for the stats strip; full list for the check) ----
  var launchesPromise = null;
  function loadLaunches() {
    if (launchesPromise) return launchesPromise;
    launchesPromise = (async function () {
      var f = factory();
      var count = Number(await withRetry(function () { return f.launchCount(); }));
      var rows = [];
      for (var start = 0; start < count; start += 20) {
        var idxs = [];
        for (var i = start; i < Math.min(count, start + 20); i++) idxs.push(i);
        var batch = await withRetry(function () {
          return multicallRead(idxs.map(function (i) { return { contract: f, method: "launches", args: [i] }; }));
        });
        batch.forEach(function (l) { if (l) rows.push({ token: l.token, creator: String(l.creator).toLowerCase(), launchedAt: Number(l.launchedAt) }); });
      }
      return { count: count, rows: rows };
    })();
    launchesPromise.catch(function () { launchesPromise = null; });
    return launchesPromise;
  }

  async function showLaunchCount() {
    var el = $("rw-launches");
    if (!el) return;
    try {
      var f = factory();
      var n = Number(await withRetry(function () { return f.launchCount(); }));
      if (T()) T().onVisible(el, function () { countTo(el, n, function (v) { return String(Math.round(v)); }); });
      else el.textContent = String(n);
    } catch (e) { el.textContent = "—"; }
  }

  // ---- hero: 1,000,000,000 counts up, the 0 stamps in ----
  function hero() {
    var box = $("rw-zero");
    if (!box) return;
    var sup = box.querySelector(".rw-zero-supply");
    var run = function () {
      box.classList.add("in");
      if (!reduce && sup) { sup.__cu = 0; countTo(sup, SUPPLY, function (v) { return Math.round(v).toLocaleString("en-US"); }); }
    };
    if (T()) T().onVisible(box, run, "0px"); else run();
  }

  // ---- revenue dashboard + treasury box ----
  function paintStats(d) {
    if (!d || d.partial) return;
    var rv = d.revenue || {};
    var tre = d.treasury || {};
    each("tre-usdc", function (el) { countTo(el, tre.usdc || 0, function (v) { return usd(v); }); });
    each("tre-arc", function (el) { countTo(el, tre.arcircle || 0, fmtTok); });
    setText("bb-n", String(d.buybacks ? d.buybacks.n : 0));
    var dash = $("rw-dash");
    if (!dash) return;
    var go = function () {
      each("earned", function (el) { countTo(el, (rv.launchFees || 0) + (rv.creatorTax || 0), function (v) { return usd(v); }); });
      each("fees", function (el) { countTo(el, rv.launchFees || 0, function (v) { return usd(v); }); });
      each("tax", function (el) { countTo(el, rv.creatorTax || 0, function (v) { return usd(v); }); });
      var c = rv.circle;
      each("raise", function (el) { countTo(el, c ? c.share || 0 : 0, function (v) { return usd(v); }); });
    };
    setText("fees-sub", rv.launches != null ? rv.launches + " launches × 1 USDC" : "1 USDC × every ArcPad launch");
    setText("tax-sub", rv.curveVolume != null ? "2% of " + usd(rv.curveVolume) + " traded on the curve" : "2% of every $ARCIRCLE trade");
    var c = rv.circle;
    setText("raise-sub", !c ? "5% of round #1 when it closes" : !c.started ? "Round #1 opens soon" : usd(c.raised) + " raised in round #1 so far");
    if (dash.__seen) go();
    else if (T()) T().onVisible(dash, function () { dash.__seen = true; go(); });
  }

  // ---- Check a wallet ----
  var checking = 0;
  async function check(addr) {
    var err = $("rw-err"), out = $("rw-result"), btn = document.querySelector("#rw-check-form button[type=submit]");
    err.hidden = true;
    if (!ethers.isAddress(addr)) {
      err.textContent = "That doesn't look like a wallet address — it should start with 0x and be 42 characters long.";
      err.hidden = false; out.hidden = true; return;
    }
    addr = ethers.getAddress(addr);
    var run = ++checking;
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      var tok = new ethers.Contract(ARCIRCLE_TOKEN, ERC20, readProvider());
      var res = await Promise.all([
        withRetry(function () { return tok.balanceOf(addr); }),
        loadLaunches(),
        T() ? T().load(addr.toLowerCase()).catch(function () { return null; }) : Promise.resolve(null),
      ]);
      if (run !== checking) return;
      var ws = res[2] && res[2].wallet ? res[2].wallet : null;
      var bal = Number(ethers.formatUnits(res[0], 18));
      $("rw-bal").textContent = fmtTok(bal) + " $ARCIRCLE";
      $("rw-bal-sub").textContent = bal > 0
        ? (bal / SUPPLY * 100).toPrecision(3).replace(/\.?0+$/, "") + "% of total supply" + (ws && ws.rank ? " · holder #" + ws.rank + " of " + ws.of : "")
        : "Not holding $ARCIRCLE right now";

      // holding period
      var bar = $("rw-held-bar");
      bar.style.width = "0%";
      if (!ws) {
        $("rw-held").textContent = "—";
        $("rw-held-sub").textContent = "Couldn't read the holding history right now";
      } else if (bal <= 0 || !ws.holdingSince) {
        $("rw-held").textContent = bal > 0 && !ws.indexed ? "…" : "0 days";
        $("rw-held-sub").textContent = bal > 0 && !ws.indexed ? "Still indexing history — try again in a minute" : "Not holding $ARCIRCLE right now";
      } else {
        var d = ws.heldDays;
        $("rw-held").textContent = d >= 1 ? d.toFixed(1) + " days" : Math.max(1, Math.round(d * 24)) + (Math.round(d * 24) === 1 ? " hour" : " hours");
        $("rw-held-sub").textContent = "Since " + day(ws.holdingSince) + " · $ARCIRCLE is " + (ws.maxDays || 0).toFixed(1) + " days old";
        var pct = ws.maxDays > 0 ? Math.min(100, (d / ws.maxDays) * 100) : 0;
        bar.__pct = pct;
      }

      var mine = res[1].rows.filter(function (r) { return r.creator === addr.toLowerCase(); })
        .sort(function (a, b) { return b.launchedAt - a.launchedAt; });
      $("rw-created").textContent = String(mine.length);
      $("rw-created-sub").textContent = mine.length
        ? "Creator activity is what creator rewards are designed to measure"
        : "No ArcPad launches from this address yet";

      // CirclePad
      if (!ws || ws.circle == null) {
        $("rw-circle").textContent = "—";
        $("rw-circle-sub").textContent = "Couldn't read CirclePad right now";
      } else {
        $("rw-circle").textContent = usd(ws.circle, true);
        $("rw-circle-sub").textContent = ws.referrals && ws.referrals.n
          ? "Invites brought " + usd(ws.referrals.usdc, true) + " into CirclePad"
          : ws.circle > 0 ? "Contributed to round #1" : "No CirclePad contribution yet";
      }

      var list = $("rw-created-list");
      list.innerHTML = "";
      if (mine.length) {
        var names = await multicallRead(mine.slice(0, 24).map(function (r) {
          return { contract: new ethers.Contract(r.token, ERC20, readProvider()), method: "symbol" };
        })).catch(function () { return []; });
        list.innerHTML = mine.slice(0, 24).map(function (r, i) {
          var sym = names[i] ? "$" + names[i] : r.token.slice(0, 6) + "…" + r.token.slice(-4);
          return '<a class="rw-chip" href="/arc#coin/' + esc(r.token) + '">' + esc(sym) + "</a>";
        }).join("") + (mine.length > 24 ? '<span class="rw-chip rw-chip-more">+' + (mine.length - 24) + " more</span>" : "");
      }
      renderInvite(addr);
      reveal(out);
      try { history.replaceState(null, "", "#check=" + addr); } catch (e) { /* fine */ }
    } catch (e) {
      err.textContent = "Couldn't reach Arc to read this wallet — check your connection and try again.";
      err.hidden = false;
    } finally {
      if (run === checking) { btn.disabled = false; btn.textContent = "Check"; }
    }
  }
  // result cards stagger in; then the holding bar grows
  function reveal(out) {
    out.hidden = false;
    var cards = out.querySelectorAll(".rw-result-card");
    Array.prototype.forEach.call(cards, function (c, i) {
      c.classList.remove("rw-in");
      c.style.transitionDelay = reduce ? "0ms" : i * 90 + "ms";
    });
    void out.offsetWidth;
    Array.prototype.forEach.call(cards, function (c) { c.classList.add("rw-in"); });
    var bar = $("rw-held-bar");
    setTimeout(function () { bar.style.width = (bar.__pct || 0) + "%"; }, reduce ? 0 : 420);
  }

  // ---- "Use my wallet": the browser wallet's address, read-only ----
  function injected() { return window.ethereum && typeof window.ethereum.request === "function" ? window.ethereum : null; }
  async function myAddress() {
    var eth = injected();
    if (!eth) throw new Error("nowallet");
    var acc = await eth.request({ method: "eth_requestAccounts" });
    if (!acc || !acc[0]) throw new Error("nowallet");
    return acc[0];
  }
  function noWalletMsg(e) {
    return e && e.message === "nowallet"
      ? "No wallet found in this browser — paste your address instead, or open this page in your wallet app's browser."
      : e && (e.code === 4001 || /reject|denied/i.test(String(e.message))) ? "The wallet request was declined." : "Your wallet didn't answer — try again.";
  }
  function useMine() {
    var err = $("rw-err");
    myAddress().then(function (a) { $("rw-addr").value = a; check(a); }, function (e) { err.textContent = noWalletMsg(e); err.hidden = false; });
  }

  // ---- Invite link (referral share is a candidate mechanic, not live) ----
  function renderInvite(addr) {
    var out = $("rw-result");
    var box = $("rw-invite");
    if (!box) {
      box = document.createElement("div");
      box.id = "rw-invite"; box.className = "rw-invite";
      out.appendChild(box);
    }
    var link = "https://www.arcircle.app/?ref=" + addr.toLowerCase();
    box.innerHTML = '<div class="rw-invite-top"><span>Invite link</span><code data-no-i18n>' + esc(link) + '</code><button type="button" class="ax-btn ax-btn-ghost rw-invite-copy">Copy</button></div>'
      + "<small>Anyone who opens ARCIRCLE PAD through this link is remembered as your invite in their browser for 30 days, and CirclePad contributions made through it are credited to you. Referral share is a candidate mechanic — nothing is paid for invites yet.</small>";
    box.querySelector(".rw-invite-copy").addEventListener("click", function (e) {
      var b = e.currentTarget;
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(link) : Promise.reject()).then(
        function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); },
        function () { b.textContent = "Copy failed"; });
    });
  }

  // ---- candidate-mechanics poll ----
  var POLL = { wallet: null, data: null };
  var pollMessage = function (mech, wallet) { return "ARCIRCLE PAD — rewards poll\nI support: " + mech + "\nWallet: " + String(wallet).toLowerCase(); };
  function pollUrl() { return "/api/social?poll=rewards" + (POLL.wallet ? "&wallet=" + POLL.wallet : ""); }
  function paintPoll() {
    var box = $("rw-poll"), d = POLL.data;
    if (!box || !d || !d.enabled) return;
    box.classList.add("on");
    var note = $("rw-poll-note");
    if (note && note.hidden) { note.hidden = false; note.textContent = "Support the mechanics you'd keep. You sign a message with your wallet — free, no transaction. One vote per wallet per mechanic; votes from $ARCIRCLE holders are counted separately."; }
    var max = 1;
    Object.keys(d.tally).forEach(function (k) { max = Math.max(max, d.tally[k].n); });
    Array.prototype.forEach.call(box.querySelectorAll(".rw-vote"), function (v) {
      var m = v.getAttribute("data-mech"), t = d.tally[m] || { n: 0, holders: 0 };
      var b = v.querySelector(".rw-vote-n b");
      countTo(b, t.n, function (x) { return String(Math.round(x)); });
      var sm = v.querySelector(".rw-vote-n small");
      var label = t.holders ? (t.n === 1 ? "supporter" : "supporters") + " · " + t.holders + (t.holders === 1 ? " holder" : " holders") : t.n === 1 ? "supporter" : "supporters";
      if (sm.textContent !== label) sm.textContent = label;
      v.querySelector(".rw-vote-bar i").style.width = (t.n / max) * 100 + "%";
      var mineOn = (d.mine || []).indexOf(m) >= 0;
      var btn = v.querySelector(".rw-vote-btn");
      btn.classList.toggle("done", mineOn);
      btn.disabled = mineOn || btn.__busy;
      btn.textContent = mineOn ? "Supported" : btn.__busy ? "Sign in wallet…" : "Support";
    });
  }
  function loadPoll() {
    return fetch(pollUrl()).then(function (r) { return r.json(); }).then(function (d) { POLL.data = d; paintPoll(); }).catch(function () { /* poll stays hidden */ });
  }
  async function vote(btn, mech) {
    var note = $("rw-poll-note");
    btn.__busy = true; paintPoll();
    try {
      var eth = injected();
      if (!eth) throw new Error("nowallet");
      var w = (await myAddress()).toLowerCase();
      POLL.wallet = w;
      var msg = pollMessage(mech, w);
      var sig = await eth.request({ method: "personal_sign", params: [ethers.hexlify(ethers.toUtf8Bytes(msg)), w] });
      var r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rpoll", mech: mech, wallet: w, signature: sig }) });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.tally) { POLL.data = j; if (typeof window.arcFeedback === "function") window.arcFeedback("success"); }
      else if (r.status === 409) await loadPoll();
      else throw new Error(j.error || "failed");
    } catch (e) {
      if (note) note.textContent = e && e.message === "nowallet" ? noWalletMsg(e) : e && (e.code === 4001 || /reject|denied/i.test(String(e.message))) ? "The signature was declined — nothing was sent." : "Couldn't record that vote — try again.";
    } finally {
      btn.__busy = false; paintPoll();
    }
  }
  function initPoll() {
    var box = $("rw-poll");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".rw-vote-btn");
      if (!btn || btn.disabled) return;
      vote(btn, btn.closest(".rw-vote").getAttribute("data-mech"));
    });
    // a wallet that already trusts this site shows its own votes (no prompt)
    var eth = injected();
    var first = eth ? eth.request({ method: "eth_accounts" }).then(function (acc) { if (acc && acc[0]) POLL.wallet = String(acc[0]).toLowerCase(); }, function () {}) : Promise.resolve();
    first.then(loadPoll);
  }

  // ---- roadmap: fill the line to the current phase ----
  function roadmap() {
    var ol = $("rw-time");
    if (!ol) return;
    var now = ol.querySelector(".rw-t.now");
    var set = function () { if (now) ol.style.setProperty("--fill", now.offsetTop + 12 + "px"); };
    set();
    window.addEventListener("resize", set);
    if (T()) T().onVisible(ol, function () { set(); ol.classList.add("fill"); });
    else ol.classList.add("fill");
  }

  function init() {
    showLaunchCount();
    hero();
    roadmap();
    initPoll();
    if (T()) {
      var rev = document.querySelector("#funding .ax-rev");
      if (rev) { T().mountRevenue(rev.querySelector("[data-rev-list]")); T().mountFlow(rev); }
      T().subscribe(paintStats);
    }
    var form = $("rw-check-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      check($("rw-addr").value.trim());
    });
    var mineBtn = $("rw-usemine");
    if (mineBtn) mineBtn.addEventListener("click", useMine);
    document.addEventListener("ax:quick", function (e) {
      if (e.detail === "check") setTimeout(function () { var i = $("rw-addr"); if (i && !i.value) i.focus({ preventScroll: true }); }, 500);
    });
    var m = /^#check=(0x[0-9a-fA-F]{40})$/.exec(location.hash);
    if (m) {
      $("rw-addr").value = m[1];
      check(m[1]);
      var sec = $("check");
      if (sec) sec.scrollIntoView();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
