/* global CONFIG, ethers, state, readProvider, connectWallet */
// arc-omni.js — ARCIRCLE OMNI (ArcPad utility, /arc#omni): one $ARCIRCLE across Arc, Robinhood Chain and Solana.
//
// Arc keeps the canonical token. Sending it to another chain LOCKS it in the Arc adapter and MINTS the same
// amount there; coming back BURNS it there and UNLOCKS it on Arc — LayerZero V2 OFTs (contracts in omni/).
// The page shows each chain's price and the spread, the global supply and the locked == remote check
// (/api/c?view=omni), and sends from Arc or Robinhood Chain with the user's own wallet. Until the contracts
// are deployed (CONFIG.OMNI addresses empty) it is a preview: everything can be looked at, nothing is sent.
(function () {
  "use strict";
  var panel = document.getElementById("bp-panel-omni");
  if (!panel) return;
  var O = (typeof CONFIG !== "undefined" && CONFIG.OMNI) || { CHAINS: {} };
  var C = O.CHAINS || {};
  var ARCIRCLE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); };
  var isSol = function (a) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || ""); };
  var DEPLOYED = { arc: isAddr(O.ADAPTER), robinhood: isAddr(O.ROBINHOOD_OFT), solana: isSol(O.SOLANA_MINT) };
  var LIVE = DEPLOYED.arc && (DEPLOYED.robinhood || DEPLOYED.solana);
  var ORDER = ["arc", "solana", "robinhood"];
  var SHORT = { arc: "ARC", solana: "SOL", robinhood: "RH" };
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var F = window.arcFmt || { price: function (v) { return v == null ? "—" : "$" + v; }, num: function (v) { return String(v); }, usd: function (v) { return "$" + v; } };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s) { return panel.querySelector(s); };
  var ls = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };

  var OFT_ABI = [
    "function quoteSend((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) p, bool payInLzToken) view returns ((uint256 nativeFee, uint256 lzTokenFee))",
    "function send((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) p, (uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) payable returns (tuple(bytes32 guid, uint64 nonce, tuple(uint256 nativeFee, uint256 lzTokenFee) fee), tuple(uint256 amountSentLD, uint256 amountReceivedLD))",
    "function paused() view returns (bool)",
    "function getAmountCanBeSent(uint32 dstEid) view returns (uint256 currentAmountInFlight, uint256 amountCanBeSent)",
    "function rateLimits(uint32 dstEid) view returns (uint192 amountInFlight, uint64 lastUpdated, uint192 limit, uint64 window)",
  ];
  var ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];

  // ---------------- helpers ----------------
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function b58ToHex(s) { // a Solana address → its 32 bytes, as 0x…
    var bytes = [0];
    for (var i = 0; i < s.length; i++) {
      var v = B58.indexOf(s[i]);
      if (v < 0) return null;
      for (var j = 0; j < bytes.length; j++) { v += bytes[j] * 58; bytes[j] = v & 255; v >>= 8; }
      while (v) { bytes.push(v & 255); v >>= 8; }
    }
    for (var k = 0; k < s.length && s[k] === "1"; k++) bytes.push(0);
    bytes = bytes.reverse();
    if (bytes.length > 32) bytes = bytes.slice(bytes.length - 32);
    while (bytes.length < 32) bytes.unshift(0);
    return "0x" + bytes.map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  var toB32 = function (addr, chain) { return chain === "solana" ? b58ToHex(addr) : "0x" + addr.slice(2).toLowerCase().padStart(64, "0"); };
  var me = function () { try { return typeof state !== "undefined" && state && state.account ? state.account : null; } catch (e) { return null; } };
  var fmtAmt = function (v) { return F.num ? F.num(v, v >= 1000 ? 0 : 6) : String(v); };
  var DUST = Math.pow(10, 18 - (O.SHARED_DECIMALS || 6)); // 1e12 wei = 0.000001 ARCIRCLE
  function parseAmt(s) {
    s = String(s || "").replace(/,/g, "").trim();
    if (!/^\d*\.?\d*$/.test(s) || !s || s === ".") return null;
    try { var w = ethers.parseUnits(s, 18); return w - (w % BigInt(DUST)); } catch (e) { return null; }
  }
  var chainName = function (k) { return (C[k] && C[k].name) || k; };
  var contractOn = function (k) { return k === "arc" ? O.ADAPTER : k === "robinhood" ? O.ROBINHOOD_OFT : null; };
  var ICON = {
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>',
    msg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h12M12 6l6 6-6 6"/></svg>',
    mint: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/><path d="M9 12l2 2 4-4"/></svg>',
  };
  var CHAIN_ICO = {
    arc: '<i class="om-dot arc"></i>', solana: '<i class="om-dot sol"></i>', robinhood: '<i class="om-dot rh"></i>',
  };

  // ---------------- state ----------------
  var S = ls.get("omni-form", null) || { from: "arc", to: DEPLOYED.robinhood ? "robinhood" : "solana", amt: "", to_addr: "" };
  if (DEPLOYED.robinhood && !DEPLOYED.solana && (S.from === "solana" || S.to === "solana")) { S.from = "arc"; S.to = "robinhood"; S.to_addr = ""; }
  var status = null, quote = null, quoteSeq = 0, busy = false;

  // ---------------- render ----------------
  function build() {
    panel.innerHTML =
      '<div class="om">' +
        '<div class="om-hero">' +
          '<div class="om-hero-copy"><span class="ams-kicker">Utility · Cross-chain</span>' +
            '<h1>ARCIRCLE OMNI <span class="om-state ' + (LIVE ? "live" : "pre") + '">' + (LIVE ? "Live" : "Preview") + "</span></h1>" +
            '<p class="om-chains" data-no-i18n>Arc <i class="om-inf"></i> Solana <i class="om-inf"></i> Robinhood</p>' +
            '<p class="om-lede">One $ARCIRCLE on three chains. Sending it from Arc locks it here and mints the same amount on the other chain; sending it back burns it there and unlocks it on Arc. The global supply stays 1,000,000,000.</p>' +
            (LIVE ? '<p class="om-live">Live now: Arc ⇄ Robinhood Chain. Solana opens later.</p>' : "") +
            (LIVE ? "" : '<p class="om-pre">Preview: the OMNI contracts are not deployed yet, so nothing can be sent. Prices, supply and the route below are shown so you can see how it will work.</p>') +
          "</div>" +
          '<div class="om-orbit" aria-hidden="true"><svg viewBox="0 0 240 200"><defs><linearGradient id="omG" x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4d9fff"/><stop offset=".5" stop-color="#9b7bff"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>' +
            '<path class="om-o-path" d="M120 38 L40 164 L200 164 Z"/>' +
            '<circle class="om-o-run" r="4"><animateMotion dur="5s" repeatCount="indefinite" path="M120 38 L40 164 L200 164 Z"/></circle>' +
            '<g class="om-o-node arc"><circle cx="120" cy="38" r="22"/><text x="120" y="43">ARC</text></g>' +
            '<g class="om-o-node sol"><circle cx="40" cy="164" r="22"/><text x="40" y="169">SOL</text></g>' +
            '<g class="om-o-node rh"><circle cx="200" cy="164" r="22"/><text x="200" y="169">RH</text></g>' +
            '<path class="om-o-inf" d="M120 116c-5-6.8-9.1-10-14-10a10 10 0 0 0 0 20c4.9 0 9-3.2 14-10s9.1-10 14-10a10 10 0 0 1 0 20c-4.9 0-9-3.2-14-10z"/></svg></div>' +
        "</div>" +
        '<div class="om-board" aria-label="Prices and supply">' +
          ORDER.map(function (k) { return '<div class="om-tile" data-chain="' + k + '"><small>' + CHAIN_ICO[k] + SHORT[k] + '</small><b data-no-i18n data-om="price-' + k + '">—</b><em data-om="venue-' + k + '"></em></div>'; }).join("") +
          '<div class="om-tile wide"><small>Global Supply</small><b data-no-i18n data-om="global">1,000,000,000</b><em>Fixed on Arc</em></div>' +
          '<div class="om-tile"><small>Price Spread</small><b data-no-i18n data-om="spread">—</b><em data-om="spread-note"></em></div>' +
        "</div>" +
        '<div class="om-grid">' +
          '<section class="om-card om-send" aria-label="Send $ARCIRCLE to another chain">' +
            '<h3>Send $ARCIRCLE</h3>' +
            '<div class="om-route"><div class="om-pick"><small>From</small><div class="om-chips" data-side="from"></div></div>' +
              '<button type="button" class="om-flip" aria-label="Swap direction" title="Swap direction">' + ICON.swap + "</button>" +
              '<div class="om-pick"><small>To</small><div class="om-chips" data-side="to"></div></div></div>' +
            '<label class="om-field"><span>Amount</span><div class="om-in"><input type="text" inputmode="decimal" autocomplete="off" placeholder="100000" aria-label="Amount of $ARCIRCLE" data-om="amt"><b data-no-i18n>ARCIRCLE</b><button type="button" class="om-max">Max</button></div><small class="om-bal" data-om="bal"></small></label>' +
            '<label class="om-field"><span data-om="to-label">Recipient</span><div class="om-in"><input type="text" autocomplete="off" spellcheck="false" data-om="to-addr" aria-label="Recipient address"></div><small class="om-hint" data-om="to-hint"></small></label>' +
            '<dl class="om-sum"><div><dt>You send</dt><dd data-no-i18n data-om="s-send">—</dd></div><div><dt>They receive</dt><dd data-no-i18n data-om="s-get">—</dd></div>' +
              '<div><dt>LayerZero fee</dt><dd data-no-i18n data-om="s-fee">—</dd></div><div><dt>Route</dt><dd data-om="s-route">—</dd></div>' +
              '<div><dt>Daily limit left</dt><dd data-no-i18n data-om="s-left">—</dd></div></dl>' +
            '<div class="om-flow" aria-hidden="true"><span class="om-step" data-s="1">' + ICON.lock + '<b data-om="f1">Lock on Arc</b></span><i class="om-wire"><em></em></i><span class="om-step" data-s="2">' + ICON.msg + "<b>LayerZero message</b></span><i class=\"om-wire\"><em></em></i><span class=\"om-step\" data-s=\"3\">" + ICON.mint + '<b data-om="f3">Mint on Solana</b></span></div>' +
            '<button type="button" class="om-go" data-om="go">Send</button><p class="om-msg" role="status" data-om="msg"></p>' +
          "</section>" +
          '<aside class="om-card om-supply" aria-label="Where the supply is">' +
            "<h3>Where the 1,000,000,000 is</h3>" +
            '<div class="om-bar" data-om="bar"><i class="arc"></i><i class="sol"></i><i class="rh"></i></div>' +
            '<dl class="om-legend"><div><dt>' + CHAIN_ICO.arc + 'On Arc</dt><dd data-no-i18n data-om="sup-arc">—</dd></div>' +
              "<div><dt>" + CHAIN_ICO.solana + 'On Solana</dt><dd data-no-i18n data-om="sup-sol">—</dd></div>' +
              "<div><dt>" + CHAIN_ICO.robinhood + 'On Robinhood Chain</dt><dd data-no-i18n data-om="sup-rh">—</dd></div>' +
              '<div class="lk"><dt>' + ICON.lock + 'Locked in the Arc adapter</dt><dd data-no-i18n data-om="sup-lock">—</dd></div></dl>' +
            '<p class="om-check" data-om="check"></p>' +
            '<ul class="om-safe"><li>' + ICON.shield + "<span>Only Arc holds real supply. The other chains can mint only what Arc locked.</span></li>" +
              "<li>" + ICON.shield + "<span>Two independent verifiers, LayerZero Labs and Nethermind, must confirm every message.</span></li>" +
              "<li>" + ICON.shield + "<span>Up to 10,000,000 per day each way to start, owned by a 2-of-3 Safe that can pause.</span></li>" +
              "<li>" + ICON.shield + "<span>Rewards the Arc lockbox earns go to the burn engine.</span></li></ul>" +
          "</aside>" +
        "</div>" +
        '<section class="om-card om-how"><h3>How it works</h3><ol>' +
          "<li><b>Arc to Solana or Robinhood</b><span>Approve and send. The Arc adapter locks your $ARCIRCLE and LayerZero delivers a message; the other chain mints the same amount to your address.</span></li>" +
          "<li><b>Back to Arc</b><span>Send from Solana or Robinhood Chain. The tokens are burned there and the adapter unlocks the same amount to you on Arc.</span></li>" +
          "<li><b>Between Solana and Robinhood</b><span>Burned on one, minted on the other. Arc's locked amount doesn't change, so the total still adds up.</span></li>" +
          "<li><b>Prices</b><span>Each chain has its own market. When prices drift apart, buying where it's cheaper and selling where it's higher pulls them together.</span></li>" +
        '</ol><p class="om-foot">Built on LayerZero V2 OFT: an adapter on Arc for the existing token, mint/burn OFTs on the other chains. Robinhood Chain comes first, Solana later. Not decided yet: pool size and the launch date.</p></section>' +
        (LIVE ? '<section class="om-card om-contracts"><h3>Official contracts</h3><ul>' + contractRows() + "</ul>" +
          '<p class="om-foot">Owned by a 2-of-3 Safe. Robinhood Chain $ARCIRCLE is the same coin, not a second one: it is minted only when $ARCIRCLE is locked on Arc, 1 for 1, so both chains share one supply of 1,000,000,000. Any other address called $ARCIRCLE on Robinhood Chain is not ours.</p></section>' : "") +
        '<section class="om-card om-hist" hidden><h3>Your transfers</h3><ul data-om="hist"></ul></section>' +
      "</div>";
    wire();
    paintChips(); paintForm(); paintHist();
  }

  function contractRows() {
    var ARC_EX = (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io";
    var RH_EX = (C.robinhood && C.robinhood.explorer) || "https://robinhoodchain.blockscout.com";
    var rows = [
      ["arc", "$ARCIRCLE on Arc", ARCIRCLE, ARC_EX + "/token/" + ARCIRCLE],
      ["arc", "OMNI lockbox (Arc)", O.ADAPTER, ARC_EX + "/address/" + O.ADAPTER],
      ["robinhood", "$ARCIRCLE on Robinhood Chain", O.ROBINHOOD_OFT, RH_EX + "/token/" + O.ROBINHOOD_OFT],
      ["arc", "Owner Safe (Arc + Robinhood)", O.SAFE, "https://app.safe.global/home?safe=arc:" + O.SAFE],
    ];
    var out = rows.filter(function (r) { return isAddr(r[2]); }).map(function (r) {
      return '<li>' + CHAIN_ICO[r[0]] + '<span class="om-c-n">' + esc(tr(r[1])) + '</span><code data-no-i18n>' + esc(r[2]) + "</code>" +
        '<span class="om-c-a"><button type="button" class="om-copy" data-copy="' + esc(r[2]) + '">' + esc(tr("Copy")) + '</button><a href="' + esc(r[3]) + '" target="_blank" rel="noopener">' + esc(tr("View")) + " ↗</a></span></li>";
    }).join("");
    // the official pool on Robinhood Chain (a Uniswap v4 pool id, not an address)
    if (/^0x[0-9a-fA-F]{64}$/.test(O.ROBINHOOD_POOL || "")) {
      out += '<li>' + CHAIN_ICO.robinhood + '<span class="om-c-n">' + esc(tr("$ARCIRCLE/ETH pool on Robinhood Chain (Uniswap v4, liquidity still small)")) + '</span><code data-no-i18n>' + esc(O.ROBINHOOD_POOL.slice(0, 10) + "…" + O.ROBINHOOD_POOL.slice(-8)) + "</code>" +
        '<span class="om-c-a"><a href="https://dexscreener.com/robinhood/' + esc(O.ROBINHOOD_POOL) + '" target="_blank" rel="noopener">' + esc(tr("Chart")) + " ↗</a></span></li>";
    }
    return out;
  }
  function paintChips() {
    ["from", "to"].forEach(function (side) {
      var box = panel.querySelector('.om-chips[data-side="' + side + '"]');
      box.innerHTML = ORDER.map(function (k) {
        var on = S[side] === k, off = side === "to" && k === S.from;
        return '<button type="button" class="om-chip' + (on ? " on" : "") + '" data-k="' + k + '"' + (off ? " disabled" : "") + ' aria-pressed="' + on + '">' + CHAIN_ICO[k] + '<span data-no-i18n>' + esc(k === "robinhood" ? "Robinhood" : chainName(k)) + "</span></button>";
      }).join("");
    });
  }
  function routeText() {
    if (S.from === "arc") return tr("Lock on Arc") + " → " + tr("mint on") + " " + chainName(S.to);
    if (S.to === "arc") return tr("Burn on") + " " + chainName(S.from) + " → " + tr("unlock on Arc");
    return tr("Burn on") + " " + chainName(S.from) + " → " + tr("mint on") + " " + chainName(S.to);
  }
  function paintForm() {
    var amtIn = $('[data-om="amt"]'), toIn = $('[data-om="to-addr"]');
    if (document.activeElement !== amtIn) amtIn.value = S.amt || "";
    if (document.activeElement !== toIn) toIn.value = S.to_addr || "";
    var sol = S.to === "solana";
    $('[data-om="to-label"]').textContent = tr(sol ? "Solana wallet (recipient)" : "Recipient on " + chainName(S.to));
    toIn.placeholder = sol ? "e.g. 7Xf…9kQ (base58)" : me() || "0x…";
    var w = parseAmt(S.amt);
    var n = w != null ? Number(ethers.formatUnits(w, 18)) : null;
    $('[data-om="s-send"]').textContent = n ? fmtAmt(n) + " ARCIRCLE" : "—";
    $('[data-om="s-get"]').textContent = n ? fmtAmt(n) + " ARCIRCLE" : "—";
    $('[data-om="s-route"]').textContent = routeText();
    $('[data-om="f1"]').textContent = S.from === "arc" ? tr("Lock on Arc") : tr("Burn on") + " " + (S.from === "robinhood" ? "Robinhood" : chainName(S.from));
    $('[data-om="f3"]').textContent = S.to === "arc" ? tr("Unlock on Arc") : tr("Mint on") + " " + (S.to === "robinhood" ? "Robinhood" : chainName(S.to));
    var hint = "", bad = false;
    if (S.to_addr && sol && !isSol(S.to_addr)) { hint = tr("That doesn't look like a Solana address."); bad = true; }
    else if (S.to_addr && !sol && !isAddr(S.to_addr)) { hint = tr("That doesn't look like an EVM address (0x…)."); bad = true; }
    else if (sol) hint = tr("Your ARCIRCLE token account on Solana is created for you on arrival.");
    $('[data-om="to-hint"]').textContent = hint;
    $('[data-om="to-hint"]').classList.toggle("bad", bad);
    paintButton();
    requestQuote();
  }
  function paintButton() {
    var go = $('[data-om="go"]'), msg = "", label = "Send", dis = false;
    var w = parseAmt(S.amt), ready = w != null && w > 0n;
    if (S.from === "solana") { label = "Send from Solana"; dis = true; msg = "Sending from Solana needs a Solana wallet — coming in the next version. Use Arc or Robinhood Chain as the source for now."; }
    else if (!DEPLOYED[S.from] || !(S.to === "arc" ? DEPLOYED.arc : DEPLOYED[S.to])) { label = LIVE && (S.to === "solana" || S.from === "solana") ? "Solana opens later" : "Opens when OMNI is deployed"; dis = true; }
    else if (!me()) label = "Connect wallet";
    else if (!ready) { label = "Enter an amount"; dis = true; }
    else if (!validTo()) { label = S.to === "solana" ? "Enter a Solana address" : "Enter a recipient"; dis = true; }
    go.textContent = tr(label);
    go.disabled = dis || busy;
    if (msg) setMsg(msg, "info");
  }
  function validTo() {
    var a = S.to_addr || (S.to !== "solana" ? me() : "");
    return S.to === "solana" ? isSol(a) : isAddr(a);
  }
  function setMsg(t, kind) { var m = $('[data-om="msg"]'); m.textContent = t ? tr(t) : ""; m.className = "om-msg" + (kind ? " " + kind : ""); }

  // ---------------- live numbers ----------------
  function paintStatus(j) {
    status = j;
    if (!j) return;
    ORDER.forEach(function (k) {
      var c = (j.chains || {})[k] || {};
      var p = $('[data-om="price-' + k + '"]'), v = $('[data-om="venue-' + k + '"]');
      p.textContent = c.price != null ? F.price(c.price) : "—";
      v.textContent = tr(k === "arc" ? "Argus · Uniswap v4" : !c.live ? "Not deployed yet" : c.price == null ? "No pool yet" : (c.venue || "DEX"));
    });
    $('[data-om="spread"]').textContent = j.spread != null ? (j.spread * 100).toFixed(1) + "%" : "—";
    $('[data-om="spread-note"]').textContent = tr(j.spread != null ? "Highest vs lowest" : "Needs two live markets");
    var s = j.supply || {};
    $('[data-om="global"]').textContent = F.num(s.global || 1e9, 0);
    var lockNum = s.locked || 0, free = s.arcFree != null ? s.arcFree : s.global;
    $('[data-om="sup-arc"]').textContent = free != null ? F.num(free, 0) : "—";
    $('[data-om="sup-sol"]').textContent = s.solana != null ? F.num(s.solana, 0) : "—";
    $('[data-om="sup-rh"]').textContent = s.robinhood != null ? F.num(s.robinhood, 0) : "—";
    $('[data-om="sup-lock"]').textContent = s.locked != null ? F.num(lockNum, 0) : "—";
    var g = s.global || 1e9, bar = $('[data-om="bar"]').children;
    bar[0].style.width = ((free || g) / g * 100).toFixed(3) + "%";
    bar[1].style.width = ((s.solana || 0) / g * 100).toFixed(3) + "%";
    bar[2].style.width = ((s.robinhood || 0) / g * 100).toFixed(3) + "%";
    var ck = $('[data-om="check"]'), map = {
      "not-deployed": ["pre", "Not deployed yet — all 1,000,000,000 are on Arc."],
      ok: ["ok", "Backed 1:1 — locked on Arc equals Solana + Robinhood."],
      "in-flight": ["wait", "A transfer is on its way — locked on Arc is ahead of the other chains for a moment."],
      alert: ["bad", "Remote supply is above what's locked on Arc. The team is alerted; transfers should be paused."],
      unknown: ["pre", "Couldn't read every chain just now."],
    };
    var m = map[s.check] || map.unknown;
    ck.className = "om-check " + m[0];
    ck.textContent = tr(m[1]);
  }
  function loadStatus() {
    return fetch("/api/c?view=omni").then(function (r) { return r.ok ? r.json() : null; }).then(paintStatus).catch(function () { paintStatus(status); });
  }
  function loadBalance() {
    var el = $('[data-om="bal"]');
    var a = me();
    if (!a) { el.textContent = tr("Connect a wallet to see your balance."); return; }
    var p = null, tok = null;
    try {
      if (S.from === "arc" && typeof readProvider === "function") { p = readProvider(); tok = ARCIRCLE; }
      else if (S.from === "robinhood" && DEPLOYED.robinhood) { p = new ethers.JsonRpcProvider(C.robinhood.rpc); tok = O.ROBINHOOD_OFT; }
    } catch (e) { p = null; }
    if (!p || !tok) { el.textContent = S.from === "solana" ? "" : tr("Not deployed on this chain yet."); el.dataset.max = ""; return; }
    new ethers.Contract(tok, ERC20, p).balanceOf(a).then(function (b) {
      el.dataset.max = ethers.formatUnits(b - (b % BigInt(DUST)), 18);
      el.textContent = tr("Balance") + ": " + fmtAmt(Number(ethers.formatUnits(b, 18))) + " ARCIRCLE";
    }).catch(function () { el.textContent = ""; });
  }
  function requestQuote() {
    var fee = $('[data-om="s-fee"]'), seq = ++quoteSeq;
    quote = null;
    var w = parseAmt(S.amt), addr = contractOn(S.from);
    if (!w || !isAddr(addr) || !(S.to === "arc" ? DEPLOYED.arc : DEPLOYED[S.to]) || S.from === "solana") { fee.textContent = "—"; return; }
    var to = S.to_addr || (S.to !== "solana" ? me() : "");
    if (!(S.to === "solana" ? isSol(to) : isAddr(to))) { fee.textContent = "—"; return; }
    var p = S.from === "arc" && typeof readProvider === "function" ? readProvider() : new ethers.JsonRpcProvider(C.robinhood.rpc);
    var param = sendParam(w, to);
    loadLeft(addr, p);
    fee.textContent = tr("Quoting…");
    new ethers.Contract(addr, OFT_ABI, p).quoteSend(param, false).then(function (q) {
      if (seq !== quoteSeq) return;
      quote = { nativeFee: q.nativeFee !== undefined ? q.nativeFee : q[0], lzTokenFee: 0n };
      fee.textContent = Number(ethers.formatEther(quote.nativeFee)).toLocaleString("en-US", { maximumFractionDigits: 6 }) + " " + ((C[S.from] && C[S.from].gas) || "");
    }).catch(function () { if (seq === quoteSeq) fee.textContent = tr("Couldn't quote"); });
  }
  // a route whose limit the owner Safe set to 0 is closed (the contract refuses any amount): say so, don't let it quote a send
  var closedRoute = {};
  function loadLeft(addr, p) {
    var el = $('[data-om="s-left"]'), dst = C[S.to] && C[S.to].eid, key = S.from + ">" + S.to;
    if (!dst) { el.textContent = "—"; return; }
    var c = new ethers.Contract(addr, OFT_ABI, p);
    Promise.all([c.getAmountCanBeSent(dst), c.rateLimits(dst).catch(function () { return null; })]).then(function (res) {
      var r = res[0], rl = res[1];
      var left = r.amountCanBeSent !== undefined ? r.amountCanBeSent : r[1];
      var lim = rl ? (rl.limit !== undefined ? rl.limit : rl[2]) : null;
      closedRoute[key] = lim != null && BigInt(lim) === 0n;
      el.textContent = closedRoute[key] ? tr("Closed for now") : fmtAmt(Math.floor(Number(ethers.formatUnits(left, 18)))) + " ARCIRCLE";
      if (closedRoute[key] && key === S.from + ">" + S.to) setMsg(chainName(S.from) + " → " + chainName(S.to) + ": " + tr("closed for now — sending this way is switched off."), "bad");
    }).catch(function () { el.textContent = "—"; });
  }
  function sendParam(w, to) {
    return { dstEid: C[S.to].eid, to: toB32(to, S.to), amountLD: w, minAmountLD: w, extraOptions: "0x", composeMsg: "0x", oftCmd: "0x" };
  }

  // ---------------- send ----------------
  // Same wallet handling as the USDC bridge (arc-bridge.js): switch through wagmi for AppKit / WalletConnect
  // sessions or the raw provider for injected wallets, then take a signer from whatever provider the session
  // uses, on the chain it's on now. window.arcChainSwitching keeps the page from reloading (arc-shared.js) and
  // AppKit from switching the wallet back to Arc (wallet-appkit.js) while a transfer is in progress.
  function hexChain(id) { return "0x" + Number(id).toString(16); }
  var walletProv = function () { return (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null; };
  var rejected = function (e) { return e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || ""))); };
  function addParams(k) {
    var c = C[k];
    return { chainId: hexChain(c.chainId), chainName: c.name, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer], nativeCurrency: { name: "Ether", symbol: c.gas || "ETH", decimals: 18 } };
  }
  function holdChain(on) {
    if (on) { clearTimeout(holdChain.t); window.arcChainSwitching = true; try { sessionStorage.setItem("wallet.autoSwitch." + me(), "1"); } catch (e) { /* fine */ } }
    else holdChain.t = setTimeout(function () { window.arcChainSwitching = false; }, 4000); // late chainChanged events still land inside the hold
  }
  async function switchTo(k) {
    if (k === "arc") { if (typeof ensureArcForWrite === "function") await ensureArcForWrite(); return; }
    var want = C[k].chainId;
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try {
        var acc = WagmiCoreRef.getAccount(wagmiConfigRef);
        if (acc && acc.isConnected) {
          if (Number(acc.chainId) !== want) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: want, addEthereumChainParameter: addParams(k) });
          state.chainId = want;
          return;
        }
      } catch (e) { if (rejected(e)) throw e; /* fall back to the raw provider */ }
    }
    var p = walletProv();
    if (!p) throw new Error("Switch your wallet to " + chainName(k) + " and try again.");
    var cur = Number.parseInt(await p.request({ method: "eth_chainId" }), 16);
    if (cur !== want) {
      try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain(want) }] }); }
      catch (e) {
        if (rejected(e)) throw e;
        await p.request({ method: "wallet_addEthereumChain", params: [addParams(k)] });
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain(want) }] }).catch(function () {});
      }
    }
    state.chainId = want;
  }
  async function signerOn(k) {
    var p = walletProv();
    if (!p) throw new Error("No wallet found.");
    var want = k === "arc" ? CONFIG.CHAIN_ID_DECIMAL : C[k].chainId;
    var bp = new ethers.BrowserProvider(p, "any");
    for (var i = 0; i < 6; i++) { // some wallets report the new chain a moment after the switch resolves
      if (Number((await bp.getNetwork()).chainId) === want) return bp.getSigner(me());
      await new Promise(function (r) { setTimeout(r, 500); });
    }
    throw new Error("Your wallet is still on another network — switch it to " + chainName(k) + " and press Send again.");
  }
  async function go() {
    if (busy) return;
    if (!me()) { if (typeof connectWallet === "function") connectWallet(); return; }
    var w = parseAmt(S.amt), to = S.to_addr || (S.to !== "solana" ? me() : ""), addr = contractOn(S.from);
    if (!w || !isAddr(addr) || !(S.to === "solana" ? isSol(to) : isAddr(to))) return;
    if (closedRoute[S.from + ">" + S.to]) { setMsg(chainName(S.from) + " → " + chainName(S.to) + ": " + tr("closed for now — sending this way is switched off."), "bad"); return; }
    busy = true; paintButton(); setMsg("", "");
    ls.set("omni-form", S);
    holdChain(true);
    try {
      if (S.from !== "arc") setMsg("Switch your wallet to " + chainName(S.from) + " if it asks…", "info");
      await switchTo(S.from);
      var signer = await signerOn(S.from);
      var oft = new ethers.Contract(addr, OFT_ABI, signer);
      var param = sendParam(w, to);
      var q = await oft.quoteSend(param, false);
      var fee = { nativeFee: q.nativeFee !== undefined ? q.nativeFee : q[0], lzTokenFee: 0n };
      if (S.from === "arc") {
        var tok = new ethers.Contract(ARCIRCLE, ERC20, signer);
        if ((await tok.allowance(me(), addr)) < w) {
          setMsg("Approve $ARCIRCLE for the OMNI adapter in your wallet…", "info");
          await (await tok.approve(addr, w)).wait();
        }
      }
      setMsg("Confirm the transfer in your wallet…", "info");
      flow(1);
      var tx = await oft.send(param, fee, me(), { value: fee.nativeFee });
      flow(2);
      var rec = { h: tx.hash, from: S.from, to: S.to, amt: ethers.formatUnits(w, 18), t: Date.now() };
      var h = ls.get("omni-tx", []); h.unshift(rec); ls.set("omni-tx", h.slice(0, 20)); paintHist();
      setMsg("Sent. LayerZero is delivering it — follow it on LayerZero Scan below.", "ok");
      await tx.wait();
      flow(3); S.amt = ""; ls.set("omni-form", S); paintForm(); loadBalance(); setTimeout(loadStatus, 4000);
    } catch (e) {
      flow(0);
      var m = String((e && (e.shortMessage || e.message)) || e);
      setMsg(rejected(e) ? "Cancelled in your wallet." : /RateLimitExceeded|0xa74c1c5f/i.test(m) ? "This route's daily limit is used up — try a smaller amount or later." : /EnforcedPause|0xd93c0665|paused/i.test(m) ? "OMNI is paused right now." : /insufficient funds/i.test(m) ? "Not enough " + ((C[S.from] && C[S.from].gas) || "gas") + " on " + chainName(S.from) + " for the fee." : "Couldn't send: " + m.slice(0, 140), "bad");
    } finally {
      holdChain(false);
      busy = false; paintButton();
    }
  }
  function flow(n) {
    panel.querySelectorAll(".om-step").forEach(function (s) { var k = Number(s.getAttribute("data-s")); s.classList.toggle("done", n > k || n === 3); s.classList.toggle("now", n === k && n !== 3); });
    panel.querySelector(".om-flow").classList.toggle("run", n > 0 && n < 3);
  }
  function paintHist() {
    var h = ls.get("omni-tx", []), box = $('[data-om="hist"]');
    $(".om-hist").hidden = !h.length;
    box.innerHTML = h.map(function (r) {
      return '<li><span class="om-h-r">' + CHAIN_ICO[r.from] + '<b data-no-i18n>' + esc(SHORT[r.from]) + " → " + esc(SHORT[r.to]) + '</b></span><span data-no-i18n>' + esc(fmtAmt(Number(r.amt))) + " ARCIRCLE</span>" +
        '<a href="' + esc((O.LZ_SCAN || "https://layerzeroscan.com/tx/") + r.h) + '" target="_blank" rel="noopener">LayerZero Scan ↗</a></li>';
    }).join("");
  }

  // ---------------- wiring ----------------
  function wire() {
    panel.querySelectorAll(".om-chips").forEach(function (box) {
      box.addEventListener("click", function (e) {
        var b = e.target.closest("[data-k]"); if (!b || b.disabled) return;
        var side = box.getAttribute("data-side"), k = b.getAttribute("data-k");
        S[side] = k;
        if (S.from === S.to) S.to = ORDER.filter(function (x) { return x !== S.from; })[0];
        if (side === "to" || S.to === "solana") S.to_addr = S.to === "solana" && !isSol(S.to_addr) ? "" : S.to_addr;
        ls.set("omni-form", S); paintChips(); paintForm(); loadBalance();
      });
    });
    $(".om-flip").addEventListener("click", function () {
      var f = S.from; S.from = S.to; S.to = f; S.to_addr = "";
      ls.set("omni-form", S); paintChips(); paintForm(); loadBalance();
      if (!reduce) { var b = $(".om-flip"); b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin"); }
    });
    var t = 0;
    $('[data-om="amt"]').addEventListener("input", function (e) { S.amt = e.target.value; ls.set("omni-form", S); clearTimeout(t); t = setTimeout(paintForm, 250); });
    $('[data-om="to-addr"]').addEventListener("input", function (e) { S.to_addr = e.target.value.trim(); ls.set("omni-form", S); clearTimeout(t); t = setTimeout(paintForm, 250); });
    $(".om-max").addEventListener("click", function () { var m = $('[data-om="bal"]').dataset.max; if (m) { S.amt = m; ls.set("omni-form", S); paintForm(); } });
    $('[data-om="go"]').addEventListener("click", go);
    panel.addEventListener("click", function (e) {
      var b = e.target.closest(".om-copy"); if (!b) return;
      var v = b.getAttribute("data-copy");
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { b.textContent = tr("Copied"); setTimeout(function () { b.textContent = tr("Copy"); }, 1400); }).catch(function () { /* no clipboard */ });
    });
  }

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    build();
    loadStatus(); loadBalance();
    setInterval(function () { if (panel.classList.contains("active") && !document.hidden) loadStatus(); }, 30000);
    var last = me();
    setInterval(function () { var a = me(); if (a !== last) { last = a; paintForm(); loadBalance(); } }, 1500);
  }
  document.addEventListener("arcpad:tab", function (e) { if (e.detail && e.detail.tab === "omni") boot(); });
  if (panel.classList.contains("active") || /^#omni\b/.test(location.hash)) boot();
  document.addEventListener("arc:lang", function () { if (booted) { paintForm(); paintStatus(status); } });
  window.arcOmni = { status: function () { return status; }, b58ToHex: b58ToHex };
})();
