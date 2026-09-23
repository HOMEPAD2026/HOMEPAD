/* global ethers, CONFIG, ARC_FACTORY_ABI, readProvider, withRetry, multicallRead, arcircleLive */
// reward.js — live bits of the Reward page (reward.html). The reward program
// itself isn't live, so everything here is read-only context:
//   • how many coins have launched on ArcPad (factory.launchCount)
//   • "Check a wallet": the on-chain activity the programs are designed
//     around — $ARCIRCLE held and ArcPad coins created by an address.
// No wallet connection and no transactions.
(function () {
  "use strict";
  var ARCIRCLE_TOKEN = "0x933a94b475fa9d8ef94fa564e38dda400a595aa1";
  var SUPPLY = 1000000000;
  var ERC20 = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
  ];
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function factory() { return new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider()); }
  function fmtTok(n) {
    if (!isFinite(n)) return "—";
    if (n === 0) return "0";
    if (n >= 10000) return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

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
      el.textContent = String(Number(await withRetry(function () { return f.launchCount(); })));
    } catch (e) { el.textContent = "—"; }
  }

  // ---- Check a wallet ----
  async function check(addr) {
    var err = $("rw-err"), out = $("rw-result"), btn = document.querySelector("#rw-check-form button");
    err.hidden = true;
    if (!ethers.isAddress(addr)) {
      err.textContent = "That doesn't look like a wallet address — it should start with 0x and be 42 characters long.";
      err.hidden = false; out.hidden = true; return;
    }
    addr = ethers.getAddress(addr);
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      var tok = new ethers.Contract(ARCIRCLE_TOKEN, ERC20, readProvider());
      var res = await Promise.all([
        withRetry(function () { return tok.balanceOf(addr); }),
        loadLaunches(),
      ]);
      var bal = Number(ethers.formatUnits(res[0], 18));
      $("rw-bal").textContent = fmtTok(bal) + " $ARCIRCLE";
      $("rw-bal-sub").textContent = bal > 0
        ? (bal / SUPPLY * 100).toPrecision(3).replace(/\.?0+$/, "") + "% of total supply"
        : "Not holding $ARCIRCLE right now";

      var mine = res[1].rows.filter(function (r) { return r.creator === addr.toLowerCase(); })
        .sort(function (a, b) { return b.launchedAt - a.launchedAt; });
      $("rw-created").textContent = String(mine.length);
      $("rw-created-sub").textContent = mine.length
        ? "Creator activity is what creator rewards are designed to measure"
        : "No ArcPad launches from this address yet";
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
      out.hidden = false;
      try { history.replaceState(null, "", "#check=" + addr); } catch (e) { /* fine */ }
    } catch (e) {
      err.textContent = "Couldn't reach Arc to read this wallet — check your connection and try again.";
      err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Check";
    }
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
      + "<small>Anyone who opens ARCIRCLE PAD through this link is remembered as your invite in their browser for 30 days. Referral share is a candidate mechanic in the whitepaper — nothing is paid for invites yet.</small>";
    box.querySelector(".rw-invite-copy").addEventListener("click", function (e) {
      var b = e.currentTarget;
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(link) : Promise.reject()).then(
        function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); },
        function () { b.textContent = "Copy failed"; });
    });
  }

  // ---- Treasury: $ARCIRCLE it holds (buybacks land here) ----
  async function showTreasury() {
    var live = document.querySelector(".rw-live");
    if (!live) return;
    var item = document.createElement("div");
    item.className = "rw-live-item";
    item.innerHTML = '<span>Treasury $ARCIRCLE</span><strong id="rw-treasury">—</strong><a class="rw-link rw-live-link" href="/arc#arcircle">Buyback history →</a>';
    live.insertBefore(item, live.querySelector(".rw-live-wide"));
    try {
      var tok = new ethers.Contract(ARCIRCLE_TOKEN, ERC20, readProvider());
      var bal = Number(ethers.formatUnits(await withRetry(function () { return tok.balanceOf(CONFIG.ARCPAD_PLATFORM_TREASURY || "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8"); }), 18));
      $("rw-treasury").textContent = fmtTok(bal);
    } catch (e) { /* stays — */ }
  }

  function init() {
    showLaunchCount();
    showTreasury();
    var form = $("rw-check-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      check($("rw-addr").value.trim());
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
