/* global CONFIG, ethers, readProvider */
// arc-pages.js — the smaller standalone pages, by body class:
//   /me        My ARCIRCLE: one wallet across $ARCIRCLE, the relay, CirclePad, airdrops, launches
//   /stats     ARCIRCLE PAD in numbers, with a 7-day $ARCIRCLE price line
//   /roadmap   the public checklist
//   /brand     colour swatches (click to copy)
//   /start     add Arc to a wallet, bring USDC, pick a path
(function () {
  "use strict";
  var body = document.body;
  if (!body.classList.contains("ax-pg")) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var T = function (s) { return esc(tr(s)); };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "")); };
  var short = function (a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; };
  var EXPL = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nf = function (n, d) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d }); };
  function usd(v) {
    if (window.arcFmt) return window.arcFmt.usd(v);
    if (v == null || !isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(a >= 1e5 ? 0 : a >= 1e4 ? 1 : 2) + "K";
    return "$" + v.toFixed(a >= 100 ? 0 : 2);
  }
  var compact = function (v) { return v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : nf(v, 0); };
  var F = window.arcFmt;
  if (F) { usd = F.usd; compact = F.compact; }
  var priceTxt = function (v) { return F ? F.price(v) : "$" + (v < 0.001 ? v.toPrecision(3) : v.toFixed(6)); };
  var getJson = function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  var date = function (ts) { return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "—"; };
  function stagger(scope) { if (reduce || !scope) return; Array.prototype.forEach.call(scope.querySelectorAll(".pg-t,.me-list li"), function (el, i) { el.style.setProperty("--i", i % 12); el.classList.add("pg-in"); }); }
  function tile(k, v, sub, cls) { return '<div class="pg-t ' + (cls || "") + '"><small>' + T(k) + '</small><b data-no-i18n>' + v + "</b><span>" + (sub || "") + "</span></div>"; }

  // ================= /me =================
  if (body.classList.contains("pg-me")) {
    var out = $("#me-out"), form = $("#me-form"), input = $("#me-addr");
    var MIN = Number((CONFIG.RELAY && CONFIG.RELAY.MIN_ARCIRCLE) || 100000);
    var run = 0;
    var show = async function (addr) {
      if (!isAddr(addr)) { out.innerHTML = '<p class="pg-bad">' + T("That doesn't look like a wallet address.") + "</p>"; return; }
      var id = ++run;
      try { history.replaceState(null, "", "/me?w=" + addr.toLowerCase()); } catch (e) { /* fine */ }
      out.innerHTML = '<p class="pg-muted">' + T("Reading this wallet from Arc…") + "</p>";
      var res = await Promise.all([
        getJson("/api/social?token=arcircle&wallet=" + addr),
        getJson("/api/social?received=" + addr),
        votesOf(addr).catch(function () { return null; }),
        relayOf(addr).catch(function () { return []; }),
      ]);
      if (id !== run) return;
      var d = res[0], w = d && d.wallet, drops = res[1], votes = res[2], relays = res[3];
      if (!w) { out.innerHTML = '<p class="pg-bad">' + T("Couldn't read this wallet right now — try again in a moment.") + "</p>"; return; }
      var bal = Number(w.balance || 0), inRelay = bal >= MIN;
      var price = d.price || 0;
      var got = (drops && drops.got) || [], claims = (drops && drops.claims) || [];
      out.innerHTML =
        '<div class="me-id"><span class="me-av" style="--h:' + ((parseInt(addr.slice(2, 8), 16) || 0) % 360) + '"></span><div><b data-no-i18n>' + short(addr) + '</b><a href="' + EXPL + "/address/" + addr + '" target="_blank" rel="noopener">' + T("On the explorer") + ' ↗</a></div><button type="button" class="ax-btn" id="me-share">' + T("Copy link") + "</button></div>" +
        '<div class="pg-grid">' +
          tile("$ARCIRCLE", nf(bal, 0), (price ? usd(bal * price) + " · " : "") + (w.rank ? "#" + nf(w.rank, 0) + " " + T("of") + " " + nf(w.of, 0) + " " + T("holders") : T("Not a holder yet")), bal > 0 ? "ok" : "") +
          tile("Holding for", w.heldDays ? nf(w.heldDays, 1) + " " + tr("days") : "—", w.holdingSince ? T("Holding since") + " " + date(w.holdingSince) : T("No holding streak yet")) +
          tile("Relay", inRelay ? tr("In") : tr("Not yet"), inRelay ? T("Receives every relay while holding") : nf(Math.max(0, MIN - bal), 0) + " " + T("more $ARCIRCLE to join the next relay"), inRelay ? "ok" : "warn") +
          tile("CirclePad Round #1", w.circle ? nf(w.circle, 2) + " USDC" : "—", w.circle ? T("Contributor — in the airdrop and the relay") : T("Not a contributor"), w.circle ? "ok" : "") +
          tile("Votes cast", votes == null ? "—" : nf(votes, 0), votes ? nf(votes * 1000, 0) + " " + T("$ARCIRCLE burned") : T("Burn-to-vote in CirclePad")) +
          tile("Coins launched", w.launches == null ? "—" : nf(w.launches, 0), w.launches ? T("on ArcPad") : T("None yet")) +
          tile("Invites", w.referrals ? nf(w.referrals.n, 0) : "—", w.referrals && w.referrals.n ? nf(w.referrals.usdc, 2) + " " + T("USDC brought into CirclePad") : T("Share your CirclePad invite link")) +
          tile("Airdrops", nf(got.length, 0), claims.length ? nf(claims.length, 0) + " " + T("waiting to be claimed") : T("received through the Multisender")) +
        "</div>" +
        (relays.length ? '<h3 class="pg-h3">' + T("Relay tokens") + '</h3><ul class="me-list">' + relays.map(function (r) { return '<li><b data-no-i18n>N' + r.n + '</b><span data-no-i18n>' + esc(r.sym) + '</span><em data-no-i18n>' + nf(r.bal, 2) + "</em></li>"; }).join("") + "</ul>" : "") +
        (got.length ? '<h3 class="pg-h3">' + T("Latest airdrops") + '</h3><ul class="me-list">' + got.slice(0, 8).map(function (g) {
          var amt = g.dec != null && g.amount ? Number(ethers.formatUnits(BigInt(g.amount), g.dec)) : null;
          return '<li><a href="/drop/' + esc(g.tx) + '" data-no-i18n>' + esc(g.sym ? "$" + g.sym : short(g.token)) + '</a><span data-no-i18n>' + (amt != null ? nf(amt, 2) : "") + '</span><em data-no-i18n>' + date(g.ts) + "</em></li>";
        }).join("") + "</ul>" : "") +
        '<div class="pg-links"><a class="ax-btn" href="/circle#position">' + T("CirclePad position") + '</a><a class="ax-btn" href="/relay">' + T("My relay") + '</a><a class="ax-btn" href="/arc#portfolio">' + T("ArcPad portfolio") + '</a><a class="ax-btn" href="/arc#multisend">' + T("Did I get an airdrop?") + "</a></div>";
      stagger(out);
      var sh = $("#me-share");
      if (sh) sh.addEventListener("click", function () { try { navigator.clipboard.writeText(location.origin + "/me?w=" + addr.toLowerCase()); sh.textContent = tr("Copied"); } catch (e) { /* denied */ } });
    };
    var votesOf = async function (addr) {
      var bv = CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS;
      if (!isAddr(bv) || typeof readProvider !== "function") return null;
      var c = new ethers.Contract(bv, ["function myVotes(uint8,address) view returns (uint256[])"], readProvider());
      var all = await Promise.all([0, 1, 2, 3, 4].map(function (k) { return c.myVotes(k, addr).catch(function () { return []; }); }));
      return all.reduce(function (s, arr) { return s + Array.from(arr).reduce(function (a, v) { return a + Number(v); }, 0); }, 0);
    };
    var relayOf = async function (addr) {
      var rounds = (CONFIG.RELAY && CONFIG.RELAY.ROUNDS) || [], outR = [];
      for (var i = 0; i < rounds.length; i++) {
        var r = rounds[i];
        if (!r.launch || !isAddr(r.launch.token)) continue;
        var t = new ethers.Contract(r.launch.token, ["function balanceOf(address) view returns (uint256)"], readProvider());
        var b = await t.balanceOf(addr).catch(function () { return 0n; });
        outR.push({ n: r.n, sym: r.launch.symbol ? "$" + r.launch.symbol : short(r.launch.token), bal: Number(ethers.formatUnits(b, 18)) });
      }
      return outR;
    };
    form.addEventListener("submit", function (e) { e.preventDefault(); show(input.value.trim()); });
    $("#me-connect").addEventListener("click", async function () {
      if (!window.ethereum) { out.innerHTML = '<p class="pg-bad">' + T("No browser wallet found — paste your address instead.") + "</p>"; return; }
      try { var acc = await window.ethereum.request({ method: "eth_requestAccounts" }); if (acc && acc[0]) { input.value = acc[0]; show(acc[0]); } } catch (e) { /* cancelled */ }
    });
    var q = new URLSearchParams(location.search).get("w");
    if (isAddr(q)) { input.value = q; show(q); }
    else if (window.ethereum && window.ethereum.request) window.ethereum.request({ method: "eth_accounts" }).then(function (a) { if (a && a[0] && !input.value) { input.value = a[0]; show(a[0]); } }).catch(function () {});
  }

  // ================= /stats =================
  if (body.classList.contains("pg-stats")) {
    var st = $("#st-out");
    var paint = function (d, burns, bridge, latest) {
      if (!d) { st.innerHTML = '<p class="pg-bad">' + T("Couldn't read the numbers right now — try again in a moment.") + "</p>"; return; }
      var rv = d.revenue || {}, c = rv.circle || {}, b = d.burned || {}, bb = d.buybacks || {};
      var voteBurn = burns && burns.totals ? Number(BigInt(burns.totals.burned || "0") / 1000000000000000000n) : null;
      st.innerHTML =
        '<section class="ax-section"><div class="ax-kicker">' + T("$ARCIRCLE") + "</div><h2>" + T("The core coin") + "</h2>" +
          '<div class="pg-grid">' +
            tile("Market cap", usd(d.mcap), d.price ? priceTxt(d.price) : "") +
            tile("24h change", d.change24h == null ? "—" : (d.change24h >= 0 ? "+" : "") + d.change24h.toFixed(2) + "%", "", d.change24h >= 0 ? "ok" : "warn") +
            tile("24h volume", usd(d.vol24h), nf(d.trades24h, 0) + " " + T("trades")) +
            tile("Holders", nf(d.holders, 0), T("wallets holding $ARCIRCLE")) +
            tile("Burned forever", (b.pct || 0).toFixed(2) + "%", nf(b.tokens, 0) + " $ARCIRCLE", "burn") +
            tile("Circulating", compact(b.circulating || 0), T("after burns")) +
            tile("Buybacks", nf(bb.n, 0), usd(bb.usdc) + " " + T("spent")) +
            tile("Liquidity", usd(d.liquidity), T("in the $ARCIRCLE pool")) +
          "</div>" +
          '<div class="st-chart" id="st-chart"><div class="st-chart-h"><b>' + T("$ARCIRCLE price, last 7 days") + '</b><span data-no-i18n id="st-chart-v"></span></div><svg id="st-line" viewBox="0 0 720 200" preserveAspectRatio="none" role="img" aria-label="' + T("$ARCIRCLE price over the last 7 days") + '"></svg><div class="st-tip" id="st-tip" hidden></div></div>' +
        "</section>" +
        '<section class="ax-section"><div class="ax-kicker">ArcPad</div><h2>' + T("Launches") + "</h2>" +
          '<div class="pg-grid">' +
            tile("Coins launched", nf(rv.launches, 0), T("1 USDC each")) +
            tile("Launch fees", usd(rv.launchFees), T("to the platform")) +
            tile("Newest coin", latest && latest.coins && latest.coins[0] ? "$" + esc(latest.coins[0].symbol) : "—", latest && latest.coins && latest.coins[0] ? usd(latest.coins[0].mcapUsd) + " " + T("market cap") : "") +
            tile("Bridged through ARCIRCLE PAD", bridge && bridge.usdc != null ? usd(bridge.usdc) : "—", bridge && bridge.n != null ? nf(bridge.n, 0) + " " + T("transfers") : T("USDC over Circle's CCTP")) +
          "</div></section>" +
        '<section class="ax-section"><div class="ax-kicker">CirclePad</div><h2>' + T("Round #1") + "</h2>" +
          '<div class="pg-grid">' +
            tile("Raised", c.raised != null ? nf(c.raised, 2) + " USDC" : "—", c.open ? T("raise open") : c.started ? T("raise closed") : T("not started")) +
            tile("Platform share (5%)", c.share != null ? nf(c.share, 2) + " USDC" : "—", T("feeds $ARCIRCLE")) +
            tile("Burned by votes", voteBurn == null ? "—" : compact(voteBurn), burns && burns.totals ? nf(burns.totals.votes, 0) + " " + T("votes from") + " " + nf(burns.totals.voters, 0) + " " + T("wallets") : "", "burn") +
            tile("Closes", c.deadline ? new Date(c.deadline * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—", '<a href="/circle/round/1">' + T("Round report") + " →</a>") +
          "</div></section>" +
        '<p class="ax-disclaimer">' + T("Figures are read from Circle's Arc by our servers and cached for up to a minute. Updated") + ' <span data-no-i18n>' + new Date().toISOString().slice(11, 16) + " UTC</span>.</p>";
      line(d.spark || [], d.sparkStep || 14400, d.ts || Math.floor(Date.now() / 1000));
      if (!st.dataset.once) { st.dataset.once = "1"; stagger(st); }
    };
    // one series, so no legend box — the title names it; a crosshair + tooltip on hover
    var line = function (pts, step, end) {
      var svg = $("#st-line"), tip = $("#st-tip"), vEl = $("#st-chart-v");
      if (!svg) return;
      var vals = pts.map(Number).filter(function (x) { return isFinite(x) && x > 0; });
      if (vals.length < 2) { svg.innerHTML = '<text x="360" y="100" text-anchor="middle" class="st-empty">' + T("Not enough trades yet") + "</text>"; return; }
      var W = 720, H = 200, P = 12, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || hi || 1;
      var xy = vals.map(function (v, i) { return [P + (i / (vals.length - 1)) * (W - 2 * P), H - P - ((v - lo) / span) * (H - 2 * P)]; });
      var d = xy.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
      var up = vals[vals.length - 1] >= vals[0];
      svg.innerHTML = [0.25, 0.5, 0.75].map(function (f) { return '<line class="st-grid" x1="0" x2="' + W + '" y1="' + (P + f * (H - 2 * P)) + '" y2="' + (P + f * (H - 2 * P)) + '"/>'; }).join("") +
        '<path class="st-area ' + (up ? "up" : "down") + '" d="' + d + "L" + (W - P) + " " + (H - P) + "L" + P + " " + (H - P) + 'Z"/><path class="st-path ' + (up ? "up" : "down") + '" d="' + d + '"/>' +
        '<line class="st-cross" id="st-cross" y1="0" y2="' + H + '" x1="0" x2="0"/>';
      var dot = $("#st-dot");
      if (!dot) { dot = document.createElement("i"); dot.id = "st-dot"; dot.className = "st-dot"; $("#st-chart").appendChild(dot); }
      var fmtP = priceTxt;
      if (vEl) vEl.textContent = fmtP(vals[vals.length - 1]) + " · " + ((vals[vals.length - 1] / vals[0] - 1) * 100).toFixed(1) + "% 7d";
      var box = $("#st-chart");
      var move = function (e) {
        var r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
        var i = Math.max(0, Math.min(vals.length - 1, Math.round(((x - P) / (W - 2 * P)) * (vals.length - 1))));
        var p = xy[i];
        $("#st-cross").setAttribute("x1", p[0]); $("#st-cross").setAttribute("x2", p[0]);
        box.classList.add("hov");
        var sr = svg.getBoundingClientRect(), br = box.getBoundingClientRect();
        dot.style.left = (sr.left - br.left + (p[0] / W) * sr.width) + "px"; dot.style.top = (sr.top - br.top + (p[1] / H) * sr.height) + "px";
        var t = end - (vals.length - 1 - i) * step;
        tip.hidden = false;
        tip.innerHTML = "<b data-no-i18n>" + fmtP(vals[i]) + "</b><span data-no-i18n>" + new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ") + " UTC</span>";
        var left = (p[0] / W) * r.width;
        tip.style.left = Math.max(60, Math.min(r.width - 60, left)) + "px";
        tip.style.top = Math.max(0, (p[1] / H) * r.height - 44) + "px";
      };
      box.onpointermove = move;
      box.onpointerleave = function () { tip.hidden = true; box.classList.remove("hov"); };
    };
    var loadStats = function () {
      Promise.all([getJson("/api/social?token=arcircle"), getJson("/api/social?circle=burns"), getJson("/api/social?bridgestats=1"), getJson("/api/c?view=latest&n=1")])
        .then(function (r) { paint(r[0], r[1], r[2], r[3]); });
    };
    loadStats();
    setInterval(function () { if (!document.hidden) loadStats(); }, 60000);
  }

  // ================= /roadmap =================
  if (body.classList.contains("pg-roadmap")) {
    // status: done | now | next | open ("not decided")
    var ITEMS = [
      ["done", "ArcPad is live", "Instant launches paired with USDC in a real Uniswap v4 pool from block one, 1 USDC to launch."],
      ["done", "$ARCIRCLE relaunched on Argus", "25 Sep 2026 — the whole supply in one locked liquidity position, no team allocation."],
      ["done", "Utilities", "Locker, Token Scanner, Multisender, Bridge, Snapshot, Liquidity Manager and Relay Launch."],
      ["done", "CirclePad Round #1", "A 72-hour USDC raise in an on-chain escrow: 1,565.66 USDC from 21 wallets. Closed 29 Sep 2026 and split 80 / 15 / 5 in one transaction."],
      ["done", "Burn-to-vote", "250 votes burned 250,000 $ARCIRCLE and chose the coin's name, ticker, logo and roadmap: ARCIA, $ARCIA."],
      ["done", "$ARCIA launched", "Round #1's coin went live on Argus. 335.49M $ARCIA went to the 18 contributors by their share, in one Multisender transaction."],
      ["done", "Two official coins", "Since 5 Oct 2026: $ARCIRCLE on Arc and $ARCIA on Robinhood Chain, nothing else. The old $ARCIA on Arc and ♾️ Infinite are retired."],
      ["now", "CirclePad Rounds #3 + #4", "Round #2 is postponed. Rounds #3 and #4 are being merged into one: one contribution, both rewards. In progress — updates on /circle."],
      ["now", "Relay N1", "The voted coin launches on Argus from the round's recipient wallet; the first buy is relayed to contributors and $ARCIRCLE holders."],
      ["now", "Verified contracts", "Publishing contract sources on the explorer."],
      ["next", "More of CirclePad on-chain", "Round #1 mixed hands-on operations with partial automation. Each round moves more steps into contracts, toward CirclePad fully automated."],
      ["next", "The rounds after", "One project at a time, round after round."],
      ["next", "Automated burns on-chain", "$ARCIA joins the reward contract with $ARCIRCLE. Utility and platform revenue flows into contracts that buy back and burn automatically. Ratios and timeline: not decided."],
      ["open", "Reward program", "Designed around ecosystem revenue, never new emissions. Size, timing and rules: not decided."],
    ];
    var LBL = { done: "Done", now: "In progress", next: "Next", open: "Not decided" };
    $("#rm-list").innerHTML = ITEMS.map(function (x, i) {
      return '<li class="rm-i ' + x[0] + '" style="--i:' + i + '"><span class="rm-dot" aria-hidden="true"></span><div><span class="rm-st">' + T(LBL[x[0]]) + "</span><h3>" + T(x[1]) + "</h3><p>" + T(x[2]) + "</p></div></li>";
    }).join("");
  }

  // ================= /brand =================
  if (body.classList.contains("pg-brand")) {
    var COLORS = [["Arc blue", "#4d9fff"], ["Cyan", "#35d8d0"], ["Circle green", "#39ff88"], ["Gold", "#ffc861"], ["Ink", "#eef3f7"], ["Night", "#04060a"]];
    var box = $("#bk-colors");
    box.innerHTML = COLORS.map(function (c) { return '<button type="button" class="bk-sw" data-hex="' + c[1] + '" style="--c:' + c[1] + '"><i></i><b>' + T(c[0]) + '</b><span data-no-i18n>' + c[1] + "</span></button>"; }).join("") +
      '<div class="bk-grad"><i></i><b>' + T("Gradient") + '</b><span data-no-i18n>#3f9bff → #35d8d0 → #39ff88</span></div>';
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-hex]");
      if (!b) return;
      try { navigator.clipboard.writeText(b.dataset.hex); b.classList.add("ok"); setTimeout(function () { b.classList.remove("ok"); }, 1200); } catch (err) { /* denied */ }
    });
  }

  // ================= /start =================
  if (body.classList.contains("pg-start")) {
    var btn = $("#sg-add"), stEl = $("#sg-st");
    btn.addEventListener("click", async function () {
      if (!window.ethereum) { stEl.textContent = tr("No browser wallet found. Install MetaMask or Rabby, or add the network by hand with the details below."); return; }
      try {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: CONFIG.CHAIN_ID_HEX, chainName: CONFIG.CHAIN_NAME, rpcUrls: [CONFIG.RPC_URL], blockExplorerUrls: [CONFIG.BLOCK_EXPLORER], nativeCurrency: CONFIG.NATIVE_CURRENCY }] });
        stEl.textContent = tr("Arc is in your wallet.");
        $("#sg-1").classList.add("done");
      } catch (e) { stEl.textContent = e && e.code === 4001 ? tr("Cancelled in your wallet.") : tr("Your wallet didn't add the network — add it by hand with the details below."); }
    });
  }
  if (!reduce) Array.prototype.forEach.call(document.querySelectorAll(".rm-i,.sg-steps > li"), function (el, i) { el.style.setProperty("--i", i % 12); el.classList.add("pg-in"); });
})();
