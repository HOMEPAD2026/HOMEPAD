// arc-social.js — the official community links, placed where each page
// naturally has room for them:
//   hub (/)            a glass row under the tagline
//   every header       X + Telegram icon buttons (desktop)
//   ArcPad / CirclePad sidebar "Community" block (inside the mobile menu too)
//   footer             three chips in the brand column
//   ArcPad             "never miss a launch" card on Home + Explore, and a
//                      line under the Launch button about the alerts channel
(function () {
  "use strict";
  var S = {
    x: { url: "https://x.com/ARCIRCLEonArc", handle: "@ARCIRCLEonArc", name: "X", sub: "@ARCIRCLEonArc" },
    tg: { url: "https://t.me/ARCIRCLEonarc", handle: "@ARCIRCLEonarc", name: "Telegram", sub: "Community chat" },
    alerts: { url: "https://t.me/arcircle_launch", handle: "@arcircle_launch", name: "Launch alerts", sub: "@arcircle_launch" },
  };
  window.ARC_SOCIAL = S;
  var ICON = {
    x: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-fill"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    tg: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-fill"><path d="M22.05 2.5 2.6 10.13c-1.33.53-1.32 1.27-.24 1.6l4.98 1.55 11.5-7.25c.54-.33 1.04-.15.63.22L10.7 14.3l-.36 5.16c.52 0 .75-.24 1.03-.52l2.48-2.4 5.15 3.8c.95.52 1.63.25 1.87-.88l3.38-15.9c.36-1.39-.53-2.02-1.9-1.06z"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-line"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/><path d="M3.5 8.5a9 9 0 0 1 2.2-4M20.5 8.5a9 9 0 0 0-2.2-4"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true" class="soc-line"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5"/></svg>',
  };
  var KEYS = ["x", "tg", "alerts"];
  var a = function (k, cls, inner, label) {
    return '<a class="' + cls + '" data-soc="' + k + '" href="' + S[k].url + '" target="_blank" rel="noopener"' +
      (label ? ' aria-label="' + label + '"' : "") + ">" + inner + "</a>";
  };
  var live = '<i class="soc-live" aria-hidden="true"></i>';
  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

  // ---- hub: glass row under the tagline ----
  function hubRow() {
    var sub = document.querySelector("main.ax-hero .ax-sub");
    if (!sub || document.querySelector(".ax-social")) return;
    var html = '<div class="ax-social" aria-label="Community">' + KEYS.map(function (k) {
      return a(k, "ax-soc ax-soc-" + k,
        '<span class="ax-soc-ico">' + ICON[k] + (k === "alerts" ? live : "") + "</span>" +
        '<span class="ax-soc-txt"><strong>' + S[k].name + "</strong><small>" + S[k].sub + "</small></span>");
    }).join("") + "</div>";
    sub.insertAdjacentElement("afterend", el(html));
  }

  // ---- header icon buttons (desktop) ----
  function headerIcons() {
    var host = document.querySelector(".bp-topbar-right") || document.querySelector("header.ax-top .ax-top-right") || document.querySelector("header.ax-top");
    if (!host || host.querySelector(".soc-head")) return;
    var g = el('<div class="soc-head">' +
      a("x", "soc-head-btn soc-x", ICON.x, "ARCIRCLE PAD on X") +
      a("tg", "soc-head-btn soc-tg", ICON.tg, "ARCIRCLE PAD on Telegram") + "</div>");
    var toggle = host.querySelector(".lang-toggle");
    if (toggle) host.insertBefore(g, toggle);
    else if (host.matches("header.ax-top")) host.insertBefore(g, host.querySelector(".ax-top-cta"));
    else host.insertBefore(g, host.firstChild);
  }

  // ---- ArcPad / CirclePad sidebar ----
  function sidebar() {
    var foot = document.querySelector(".bp-sidebar .bp-side-foot");
    if (!foot || document.querySelector(".bp-side-social")) return;
    var html = '<div class="bp-side-social"><div class="bp-side-section-label">Community</div><div class="bp-soc-list">' + KEYS.map(function (k) {
      return a(k, "bp-soc bp-soc-" + k,
        '<span class="bp-soc-ico">' + ICON[k] + (k === "alerts" ? live : "") + "</span>" +
        '<span class="bp-soc-txt"><strong>' + S[k].name + "</strong><small>" + S[k].sub + "</small></span>" +
        '<span class="bp-soc-ext">' + ICON.ext + "</span>");
    }).join("") + "</div></div>";
    foot.parentNode.insertBefore(el(html), foot);
  }

  // ---- footer chips ----
  function footer() {
    var brand = document.querySelector(".axf .axf-brand");
    if (!brand || brand.querySelector(".axf-social")) return;
    var html = '<div class="axf-social" aria-label="Community">' + KEYS.map(function (k) {
      return a(k, "axf-soc axf-soc-" + k, '<span class="axf-soc-ico">' + ICON[k] + "</span><span>" + S[k].name + "</span>", k === "x" ? "ARCIRCLE PAD on X" : null);
    }).join("") + "</div>";
    var net = brand.querySelector(".axf-net");
    brand.insertBefore(el(html), net || null);
  }

  // ---- ArcPad: launch alerts card + launch-form note ----
  function alertsCard() {
    var card = function (id) {
      return el('<a class="ap-alerts" id="' + id + '" href="' + S.alerts.url + '" target="_blank" rel="noopener" data-soc="alerts">' +
        '<span class="ap-alerts-ico">' + ICON.tg + '<i class="ap-alerts-ping" aria-hidden="true"></i></span>' +
        '<span class="ap-alerts-txt"><strong>Never miss a launch</strong>' +
        '<small>Every new ArcPad coin is posted to our Telegram channel the moment it goes live — logo, market cap and a trade button.</small></span>' +
        '<span class="ap-alerts-cta"><span class="ap-alerts-handle" data-no-i18n>' + S.alerts.handle + "</span><b>Join channel</b></span></a>");
    };
    var grid = document.getElementById("ap-explore-grid");
    if (grid && !document.getElementById("ap-alerts-explore")) grid.insertAdjacentElement("afterend", card("ap-alerts-explore"));
    var car = document.getElementById("ap-home-viewport");
    var carWrap = car && (car.closest(".carousel-section") || car.parentNode);
    if (carWrap && !document.getElementById("ap-alerts-home")) carWrap.insertAdjacentElement("afterend", card("ap-alerts-home"));
    var note = document.querySelector("#bp-panel-launch .ap-launch-btn-note");
    if (note && !document.querySelector(".ap-launch-announce")) {
      note.insertAdjacentElement("afterend", el('<a class="ap-launch-announce" href="' + S.alerts.url + '" target="_blank" rel="noopener" data-soc="alerts">' +
        '<span class="ap-launch-announce-ico">' + ICON.tg + "</span>" +
        '<span>Your launch is announced automatically in <b data-no-i18n>' + S.alerts.handle + "</b></span>" +
        '<span class="ap-launch-announce-go">' + ICON.ext + "</span></a>"));
    }
  }

  function track(e) {
    var t = e.target.closest && e.target.closest("[data-soc]");
    if (t && typeof window.va === "function") window.va("event", { name: "social_click", data: { to: t.getAttribute("data-soc") } });
  }

  function mount() {
    hubRow(); sidebar(); footer(); alertsCard();
    // after i18n.js has placed the language toggle
    setTimeout(headerIcons, 0);
  }
  document.addEventListener("click", track);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
