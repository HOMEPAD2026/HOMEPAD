/* global CONFIG, ethers, state, readProvider */
// arc-uhub.js — what the four v2 utilities (Locker, Token Scanner, Multisender, Bridge) share:
//   • "My activity": one drawer with your locks (read from ArcLock), scans, sends and
//     bridge transfers (this browser) — newest first, filter by utility, each links back
//   • "Ask ARCIA": a question about the utility you're on, answered in her chat
// It only reads what each utility already keeps; nothing new is stored.
(function () {
  "use strict";
  if (window.arcUHub) return;
  var PANELS = { locker: "Locker", scanner: "Token Scanner", multisend: "Multisender", bridge: "Bridge" };
  var ASK = {
    locker: "How does the Locker on ARCIRCLE PAD work, and when should I split a lock into tranches?",
    scanner: "How do I read a Token Scanner result on ARCIRCLE PAD — what do snipers, bundles and fresh wallets mean?",
    multisend: "How do I send an airdrop with the ARCIRCLE PAD Multisender, step by step?",
    bridge: "How do I bring USDC to Arc with the ARCIRCLE PAD Bridge, and what's the difference between Fast and Standard?",
  };
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var lc = function (a) { return String(a || "").toLowerCase(); };
  var short = function (a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; };
  var ls = function (k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ICO = {
    locker: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>',
    scanner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/></svg>',
    multisend: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="2.2"/><circle cx="18.5" cy="5.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/><path d="M7.7 12h8.8M7.4 10.9l9.2-4.6M7.4 13.1l9.2 4.6"/></svg>',
    bridge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5h18M4.5 15.5c2-5.3 4.7-8 7.5-8s5.5 2.7 7.5 8"/></svg>',
  };
  var num = function (raw, dec) {
    var n = Number(raw) / Math.pow(10, dec || 0);
    if (!isFinite(n)) return "—";
    return n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };
  var chainName = function (k) { var c = ((CONFIG.BRIDGE && CONFIG.BRIDGE.CHAINS) || []).find(function (x) { return x.key === k; }); return k === "arc" ? "Arc" : c ? c.name : k; };

  // ---------- gather ----------
  async function locks() {
    if (!state || !state.account || !CONFIG.ARCLOCK_ADDRESS || typeof ethers === "undefined") return [];
    try {
      var c = new ethers.Contract(CONFIG.ARCLOCK_ADDRESS, ["function lockIdsOfOwner(address) view returns (uint256[])", "function getLock(uint256) view returns (tuple(address token, address owner, uint128 amount, uint64 lockedAt, uint64 unlockAt, bool withdrawn))"], readProvider());
      var ids = (await c.lockIdsOfOwner(state.account)).slice(-20);
      var rows = await Promise.all(ids.map(function (id) { return c.getLock(id).then(function (l) { return { id: Number(id), l: l }; }).catch(function () { return null; }); }));
      var syms = {};
      await Promise.all(rows.filter(Boolean).map(function (r) {
        var t = lc(r.l.token);
        if (syms[t] !== undefined) return null;
        syms[t] = null;
        return new ethers.Contract(t, ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], readProvider()).symbol().then(function (s) { syms[t] = s; }).catch(function () {});
      }));
      return rows.filter(Boolean).map(function (r) {
        var sym = syms[lc(r.l.token)] || short(r.l.token), until = new Date(Number(r.l.unlockAt) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return { u: "locker", at: Number(r.l.lockedAt) * 1000, t: num(r.l.amount, 18) + " $" + sym, s: "#" + r.id + " · " + (r.l.withdrawn ? tr("Withdrawn") : tr("Unlocks on") + " " + until), href: "/lock/" + r.id };
      });
    } catch (e) { return []; }
  }
  function scans() {
    return (ls("arcircle.scanner.v1") || []).map(function (r) { return { u: "scanner", at: r.at || 0, t: "$" + (r.s || "?"), s: tr("Token scan") + (r.sc != null ? " · " + r.sc + " / 100" : ""), href: "/arc#scanner?t=" + r.a }; });
  }
  function sends() {
    return (ls("arcircle.multisend.hist.v1") || []).map(function (r) {
      var what = r.mode === "nft" ? r.n + " NFTs" : r.total ? num(r.total, r.dec) + " " + (r.sym || "") : "";
      return { u: "multisend", at: r.at || 0, t: what || "—", s: (r.mode === "drop" ? tr("Claim drop") + " #" + r.drop : tr("Airdrop sent")) + " · " + r.n + " " + tr(r.n === 1 ? "wallet" : "wallets"),
        href: r.mode === "drop" ? "/arc#multisend?claim=" + r.drop : r.txs && r.txs.length ? "/arc#multisend?receipt=" + r.txs.join(",") : "/arc#multisend" };
    });
  }
  function bridges() {
    return (ls("arcircle.bridge.v1") || []).map(function (r) {
      var st = r.delivered ? tr("Delivered") : r.attested ? tr("Signed by Circle") : r.stage === "failed" ? tr("Failed") : tr("On its way");
      return { u: "bridge", at: r.at || 0, t: num(r.amount, 6) + " USDC", s: chainName(r.src) + " → " + chainName(r.dst) + " · " + st, href: "/arc#bridge" };
    });
  }

  // ---------- drawer ----------
  var box = null, filter = "all", items = [];
  function open() {
    if (!box) {
      box = document.createElement("div");
      box.className = "u2-drawer"; box.hidden = true;
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", tr("My activity"));
      box.innerHTML = '<div class="u2-scrim" data-u2-close></div><aside class="u2-sheet"><div class="u2-head"><h2>' + esc(tr("My activity")) + '</h2><button type="button" class="u2-x" data-u2-close aria-label="' + esc(tr("Close")) + '">×</button></div>' +
        '<div class="u2-filters" role="radiogroup"></div><div class="u2-list"></div><p class="u2-note">' + esc(tr("Locks are read from Arc for your connected wallet. Scans, sends and bridge transfers are the ones made in this browser.")) + "</p></aside>";
      document.body.appendChild(box);
      box.addEventListener("click", function (e) {
        if (e.target.closest("[data-u2-close]")) { close(); return; }
        var f = e.target.closest("[data-u2-f]");
        if (f) { filter = f.getAttribute("data-u2-f"); paint(); return; }
        if (e.target.closest(".u2-item")) close();
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box && !box.hidden) close(); });
    }
    box.hidden = false;
    document.documentElement.classList.add("u2-lock");
    requestAnimationFrame(function () { box.classList.add("in"); });
    items = scans().concat(sends(), bridges());
    paint(true);
    locks().then(function (l) { items = items.concat(l); paint(); });
  }
  function close() {
    if (!box) return;
    box.classList.remove("in");
    document.documentElement.classList.remove("u2-lock");
    setTimeout(function () { box.hidden = true; }, reduce ? 0 : 220);
  }
  function paint(loading) {
    var counts = { all: items.length };
    items.forEach(function (x) { counts[x.u] = (counts[x.u] || 0) + 1; });
    box.querySelector(".u2-filters").innerHTML = [["all", "All"], ["locker", "Locker"], ["scanner", "Scanner"], ["multisend", "Multisender"], ["bridge", "Bridge"]].map(function (f) {
      return '<button type="button" role="radio" data-u2-f="' + f[0] + '" aria-checked="' + (filter === f[0]) + '">' + esc(tr(f[1])) + (counts[f[0]] ? " <b data-no-i18n>" + counts[f[0]] + "</b>" : "") + "</button>";
    }).join("");
    var list = items.filter(function (x) { return filter === "all" || x.u === filter; }).sort(function (a, b) { return b.at - a.at; }).slice(0, 80);
    var day = "", html = "";
    list.forEach(function (x, i) {
      var d = new Date(x.at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      if (d !== day) { day = d; html += '<h3 data-no-i18n>' + esc(d) + "</h3>"; }
      html += '<a class="u2-item u-' + x.u + '" href="' + esc(x.href) + '" style="--i:' + Math.min(i, 14) + '"><span class="u2-ico">' + ICO[x.u] + '</span><span class="u2-txt"><b data-no-i18n>' + esc(x.t) + '</b><small data-no-i18n>' + esc(x.s) + '</small></span><time data-no-i18n>' + new Date(x.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + "</time></a>";
    });
    box.querySelector(".u2-list").innerHTML = html || '<p class="u2-empty">' + esc(tr(loading ? "Reading your activity…" : "Nothing here yet — lock, scan, send or bridge something and it shows up here.")) + "</p>";
  }

  // ---------- buttons in each utility's header ----------
  function mount() {
    Object.keys(PANELS).forEach(function (k) {
      var p = document.getElementById("bp-panel-" + k);
      if (!p || p.querySelector(".u2-acts")) return;
      var host = p.querySelector(".lkr-hero-txt, .abr-hero-txt, .asc-hero-txt, .ams-hero-txt");
      if (!host) return;
      var d = document.createElement("div");
      d.className = "u2-acts";
      d.innerHTML = '<button type="button" data-u2-open><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg>' + esc(tr("My activity")) + '</button>' +
        '<button type="button" data-u2-ask="' + k + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/></svg>' + esc(tr("Ask ARCIA")) + "</button>";
      var h1 = host.querySelector("h1");
      if (h1 && h1.nextSibling) host.insertBefore(d, h1.nextSibling); else host.appendChild(d);
    });
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-u2-open]")) { open(); return; }
    var a = e.target.closest("[data-u2-ask]");
    if (a) {
      var q = tr(ASK[a.getAttribute("data-u2-ask")] || "");
      if (window.arcArcia && typeof window.arcArcia.ask === "function") window.arcArcia.ask(q);
      else location.hash = "#arcia";
    }
  });
  mount();
  document.addEventListener("arcpad:tab", mount);
  window.arcUHub = { open: open, close: close };
})();
