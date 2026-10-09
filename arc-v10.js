// arc-v10.js — "clean, simple, easy on the eyes": the v10 cleanup's behaviour (styles: arc-v10.css).
// Every ARCIRCLE PAD page runs it; each part checks for its own page. Plain script, no dependencies.
//   · page intros cut to one line (More / Less)
//   · Explore: the live-trades strip parks on Explore and stands still; platform + presets move into Filters
//   · utility guides fold into one "How it works" block (the docs and /updates keep everything)
//   · home: one main button, the first-visit tour only on the first visit
//   · Display settings: Dim (softer contrast) and Compact (denser lists), remembered in this browser
//   · My ARCIRCLE: everything a wallet can claim, in one card, with one "Claim all on Arc"
//   · motion only when someone acts: tab switch, sparklines drawn once
(function () {
  "use strict";
  if (window.arcV10) return;
  var D = document, H = D.documentElement;
  H.classList.add("v10");
  var lang = function () { var l = (H.getAttribute("lang") || "en").slice(0, 2); if (l !== "ko" && l !== "zh") { try { l = localStorage.getItem("arcircle.lang") || l; } catch (e) { /* private */ } } return l === "ko" || l === "zh" ? l : "en"; };
  var L = function (en, ko, zh) { var l = lang(); return l === "ko" ? ko : l === "zh" ? zh : en; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } },
  };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "")); };
  var path = (location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/").replace(/^\/arcpad$/, "/arc").replace(/^\/circlepad$/, "/circle");
  var onArc = path === "/arc";
  var api = (window.arcV10 = {});

  // ---------------- Display settings (before anything paints) ----------------
  var SET = { dim: "arc.v10.dim", compact: "arc.v10.compact" };
  function applySet() {
    H.classList.toggle("v10-dim", store.get(SET.dim) === "1");
    H.classList.toggle("v10-compact", store.get(SET.compact) === "1");
  }
  applySet();
  function setRows() {
    return [["dim", L("Dim", "어둡게", "柔和"), L("Softer contrast for long sessions", "오래 볼 때 눈이 편한 대비", "长时间浏览时更柔和的对比")],
      ["compact", L("Compact", "촘촘하게", "紧凑"), L("More coins and rows on one screen", "한 화면에 더 많은 코인과 줄", "一屏显示更多币和行")]]
      .map(function (r) {
        return '<label><span>' + esc(r[1]) + "<small>" + esc(r[2]) + '</small></span><input type="checkbox" data-v10set="' + r[0] + '"' + (store.get(SET[r[0]]) === "1" ? " checked" : "") + '><i class="v10-sw" aria-hidden="true"></i></label>';
      }).join("");
  }
  function onSet(e) {
    var i = e.target.closest && e.target.closest("[data-v10set]");
    if (!i) return;
    store.set(SET[i.dataset.v10set], i.checked ? "1" : null);
    applySet();
  }
  function mountSettings() {
    var right = D.querySelector(".anav-right");
    if (!right || right.querySelector(".v10-set")) return;
    var box = D.createElement("div");
    box.className = "v10-set";
    box.innerHTML = '<button type="button" class="v10-set-b" aria-haspopup="true" aria-expanded="false" aria-label="' + esc(L("Display", "화면 설정", "显示")) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>' +
      '<div class="v10-set-m" hidden></div>';
    var lb = right.querySelector(".anav-lang");
    right.insertBefore(box, lb || right.firstChild);
    var b = box.querySelector(".v10-set-b"), m = box.querySelector(".v10-set-m");
    var close = function () { m.hidden = true; b.setAttribute("aria-expanded", "false"); };
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!m.hidden) return close();
      m.innerHTML = setRows() + '<a href="/me">' + esc(L("My ARCIRCLE — everything to claim", "My ARCIRCLE — 받을 보상 한눈에", "My ARCIRCLE — 所有可领取的")) + "</a>";
      m.hidden = false; b.setAttribute("aria-expanded", "true");
    });
    m.addEventListener("change", onSet);
    D.addEventListener("click", function (e) { if (!box.contains(e.target)) close(); });
    D.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) { close(); b.focus(); } });
  }
  // phones: the same two switches sit under the language list
  function mountLangSettings() {
    var lm = D.querySelector(".anav-lmenu");
    if (!lm || lm.querySelector(".v10-lset")) return;
    var box = D.createElement("div");
    box.className = "v10-lset v10-set-m";
    box.style.cssText = "position:static;min-width:0;padding:4px 0 0;margin-top:4px;border:0;border-top:1px solid rgba(170,190,230,.14);border-radius:0;background:none;box-shadow:none";
    box.innerHTML = setRows();
    lm.appendChild(box);
    box.addEventListener("change", onSet);
    box.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  // ---------------- page intros: one line ----------------
  function cutLedes(scope) {
    [].forEach.call((scope || D).querySelectorAll(".bp-panel > .bp-lede, .ams-hero-txt > p"), function (p) {
      if (p.dataset.v10cut || (p.textContent || "").trim().length < 120) return;
      p.dataset.v10cut = "1";
      p.classList.add("bp-lede", "v10-cut");
      var b = D.createElement("button");
      b.type = "button"; b.className = "v10-more"; b.setAttribute("aria-expanded", "false");
      b.textContent = L("More", "더 보기", "更多");
      b.addEventListener("click", function () {
        var open = p.classList.toggle("open");
        b.setAttribute("aria-expanded", open ? "true" : "false");
        b.textContent = open ? L("Less", "접기", "收起") : L("More", "더 보기", "更多");
      });
      p.insertAdjacentElement("afterend", b);
    });
  }

  // ---------------- utility guides: one folded block ----------------
  function foldGuides() {
    [].forEach.call(D.querySelectorAll(".bp-panel section.asc-guide, .bp-panel .asc-guide"), function (g) {
      if (g.closest(".v10-guide") || g.parentNode.closest(".asc-guide")) return;
      var h = g.querySelector(":scope > h2");
      var det = D.createElement("details");
      det.className = "v10-guide";
      det.innerHTML = '<summary><span>' + esc(h ? h.textContent.trim() : L("How it works", "사용 방법", "使用说明")) + '</span><small>' + esc(L("How it works · what's new", "사용 방법 · 새 소식", "使用说明 · 更新")) + "</small></summary>" +
        '<div class="v10-guide-in"></div>';
      g.parentNode.insertBefore(det, g);
      det.querySelector(".v10-guide-in").appendChild(g);
      if (h) h.hidden = true;
    });
  }

  // ---------------- Explore ----------------
  function explore() {
    var panel = D.getElementById("bp-panel-explore");
    if (!panel) return;
    // the live-trades strip: here only, standing still
    var tk = D.getElementById("ap-ticker");
    if (tk && tk.parentNode !== panel) {
      var bar = panel.querySelector(".cn-explore-toolbar");
      panel.insertBefore(tk, bar || panel.firstChild);
    }
    // platform chips and saved presets: inside Filters
    var tries = 0;
    (function move() {
      var fp = D.getElementById("ap-filter-panel"), plats = panel.querySelector(".cn-explore-toolbar > .flt-plat"), pre = D.getElementById("v7-presets");
      if (fp && plats && !fp.querySelector(".v10-fg-plat")) {
        var g = D.createElement("div");
        g.className = "flt-group v10-fg-plat";
        g.innerHTML = '<span class="flt-label">' + esc(L("Platform", "플랫폼", "平台")) + "</span>";
        g.appendChild(plats);
        fp.insertBefore(g, fp.firstChild);
      }
      if (fp && pre && pre.parentNode !== fp) {
        var gp = fp.querySelector(".v10-fg-pre") || D.createElement("div");
        gp.className = "flt-group v10-fg-pre";
        if (!gp.parentNode) { gp.innerHTML = '<span class="flt-label">' + esc(L("Saved views", "저장한 보기", "已保存视图")) + "</span>"; fp.appendChild(gp); }
        gp.appendChild(pre);
      }
      if ((!fp || !plats || !pre) && ++tries < 40) setTimeout(move, 400);
    })();
    // touch: long-press a card for its quick-buy row
    var grid = D.getElementById("ap-explore-grid");
    if (grid && !grid.dataset.v10) {
      grid.dataset.v10 = "1";
      var t = 0;
      grid.addEventListener("touchstart", function (e) { var c = e.target.closest(".launch-card"); if (!c) return; t = setTimeout(function () { c.classList.add("v10-qb"); }, 420); }, { passive: true });
      grid.addEventListener("touchend", function () { clearTimeout(t); }, { passive: true });
      grid.addEventListener("touchmove", function () { clearTimeout(t); }, { passive: true });
      // sparklines draw once, the first time a coin shows up
      var drawn = new Set();
      var draw = function () {
        if (reduce) return;
        [].forEach.call(grid.querySelectorAll(".launch-card[data-token] > svg"), function (svg) {
          var c = svg.parentNode, k = (c.dataset.token || "").toLowerCase();
          if (!k || drawn.has(k)) return;
          drawn.add(k);
          var p = svg.querySelector("path, polyline");
          if (!p || !p.getTotalLength) return;
          try { svg.style.setProperty("--len", Math.ceil(p.getTotalLength())); svg.classList.add("v10-draw"); } catch (e) { /* not measurable */ }
        });
      };
      if ("MutationObserver" in window) new MutationObserver(function () { clearTimeout(draw.t); draw.t = setTimeout(draw, 30); }).observe(grid, { childList: true });
      draw();
    }
  }

  // ---------------- coin page: a short trades list, orders folded on phones ----------------
  function coinPage() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel || panel.dataset.v10) return;
    panel.dataset.v10 = "1";
    panel.addEventListener("click", function (e) {
      var h = e.target.closest && e.target.closest("#v7-ord > h3");
      if (h && window.innerWidth <= 900) { h.parentNode.classList.toggle("v10-open"); return; }
      var s = e.target.closest && e.target.closest(".v10-showall");
      if (s) { var c = s.closest(".ac2-card"); var all = c.classList.toggle("v10-all"); s.textContent = all ? L("Show fewer", "접기", "收起") : L("Show all", "모두 보기", "显示全部"); }
    });
    var add = function () {
      [].forEach.call(panel.querySelectorAll(".ac2-card .ac2-table-wrap"), function (w) {
        var rows = w.querySelectorAll("tbody tr").length, btn = w.parentNode.querySelector(":scope > .v10-showall");
        if (rows > 8 && !btn) { btn = D.createElement("button"); btn.type = "button"; btn.className = "v10-showall"; btn.textContent = L("Show all", "모두 보기", "显示全部"); w.insertAdjacentElement("afterend", btn); }
        if (btn) btn.hidden = rows <= 8;
      });
    };
    if ("MutationObserver" in window) new MutationObserver(function () { clearTimeout(add.t); add.t = setTimeout(add, 80); }).observe(panel, { childList: true, subtree: true });
    add();
  }

  // ---------------- tab switches: one short move ----------------
  function tabIn() {
    if (reduce) return;
    var p = D.querySelector(".bp-panel.active");
    if (!p) return;
    p.classList.remove("v10-in"); void p.offsetWidth; p.classList.add("v10-in");
    setTimeout(function () { p.classList.remove("v10-in"); }, 260);
  }

  // ---------------- home: one main button ----------------
  function home() {
    if (path !== "/") return;
    var tour = D.querySelector(".hm-tour");
    if (tour) {
      var seen = store.get("arc.v10.seen");
      if (seen) tour.hidden = true;
      else store.set("arc.v10.seen", String(Date.now()));
    }
  }

  // ---------------- remember the wallet the site saw (for My ARCIRCLE and alerts) ----------------
  function watchAccount() {
    var last = "";
    setInterval(function () {
      var a = typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "";
      if (a && a !== last && isAddr(a)) { last = a; store.set("arc.v10.acct", a); D.dispatchEvent(new CustomEvent("arc:v10acct", { detail: a })); }
    }, 1500);
  }
  api.account = function () { var c = window.arcConnect && window.arcConnect.address(); if (c) return c; var a = store.get("arc.v10.acct"); return isAddr(a) ? a : ""; };

  // ---------------- My ARCIRCLE: everything to claim ----------------
  var getJson = function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  var nf = function (n, d) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d }); };
  var big = function (raw) { try { var n = Number(BigInt(raw || "0") / 10n ** 14n) / 1e4; return n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : nf(n, 2); } catch (e) { return "—"; } };
  /// what a wallet can claim right now, across the site
  api.claims = function (addr) {
    addr = String(addr || "").toLowerCase();
    return Promise.all([
      getJson("/api/desk?stake=me&u=" + addr),
      getJson("/api/desk?stake=drop&u=" + addr),
      getJson("/api/desk?vearcia=me&u=" + addr),
    ]).then(function (r) {
      var st = r[0], ld = r[1], va = r[2], out = [];
      if (st && st.live) {
        out.push({ k: "stake", t: L("Staking rewards", "스테이킹 보상", "质押奖励"), v: nf(st.claimable, 2) + " USDC", ready: st.claimable > 0, href: "/arc#staking" });
        if (st.lock && st.lock.end && !st.lock.max) {
          var days = Math.round((st.lock.end - Date.now() / 1000) / 86400);
          if (days >= 0 && days <= 14) out.push({ k: "lock", t: L("Your lock ends soon", "락업 종료 임박", "锁仓即将到期"), v: days + L(" days", "일", " 天"), ready: false, href: "/arc#staking", warn: true });
        }
      }
      if (ld && ld.mode === "vault") {
        var n = (ld.claimable || []).length;
        out.push({ k: "drop", t: L("Launch Drop", "런치 드랍", "发币空投"), v: n ? n + L(n === 1 ? " coin" : " coins", "개 코인", " 个币") : L("Nothing yet", "아직 없음", "暂无"), ready: n > 0, href: "/arc#staking", tokens: ld.claimable || [], vault: ld.vault });
      }
      if (va && va.live && va.earned && va.earned[0]) {
        var a = Number(BigInt(va.earned[0]) / 10n ** 14n) / 1e4;
        out.push({ k: "vea", t: L("veARCIA rewards (Robinhood Chain)", "veARCIA 보상 (로빈후드 체인)", "veARCIA 奖励(Robinhood Chain)"), v: nf(a, 2) + " $ARCIA", ready: a > 0, href: "/arc#vearcia", other: true });
      }
      return out;
    });
  };
  function meCard() {
    if (!D.body.classList.contains("pg-me")) return;
    var out = D.getElementById("me-out");
    if (!out) return;
    var busy = false;
    var paint = function () {
      var id = out.querySelector(".me-id");
      if (!id || out.querySelector(".v10-claims")) return;
      var addr = (new URLSearchParams(location.search).get("w") || "").toLowerCase();
      if (!isAddr(addr)) return;
      var box = D.createElement("section");
      box.className = "v10-claims";
      box.innerHTML = '<div class="v10-claims-h"><h2>' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + '</h2></div><p class="v10-claims-empty">' + esc(L("Reading…", "읽는 중…", "读取中…")) + "</p>";
      id.insertAdjacentElement("afterend", box);
      api.claims(addr).then(function (rows) {
        var arcReady = rows.filter(function (r) { return r.ready && !r.other; });
        var mine = api.account() === addr || (window.arcConnect && window.arcConnect.address() === addr);
        box.innerHTML = '<div class="v10-claims-h"><h2>' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + "</h2>" +
          (arcReady.length ? (mine ? '<button type="button" class="ld-btn pri" data-v10claim>' + esc(L("Claim all on Arc", "Arc에서 모두 수령", "在 Arc 上全部领取")) + " (" + arcReady.length + ")</button>"
            : '<a class="ld-btn" href="/arc#staking">' + esc(L("Connect this wallet to claim", "이 지갑을 연결해서 수령", "连接此钱包以领取")) + "</a>") : "") + "</div>" +
          (rows.length ? "<ul>" + rows.map(function (r) {
            return "<li><span>" + esc(r.t) + '</span><span><b data-no-i18n>' + esc(r.v) + '</b> <span class="v10-st' + (r.ready ? " ok" : "") + '">' + esc(r.ready ? L("ready", "수령 가능", "可领取") : r.warn ? "" : "—") + '</span> <a href="' + esc(r.href) + '">' + esc(L("Open", "열기", "打开")) + " →</a></span></li>";
          }).join("") + "</ul>" : '<p class="v10-claims-empty">' + esc(L("Nothing to claim yet. Lock $ARCIRCLE on Staking to get USDC every week and a piece of every new ArcPad coin.", "아직 받을 보상이 없어요. 스테이킹에서 $ARCIRCLE을 락업하면 매주 USDC와 새 ArcPad 코인을 받아요.", "暂无可领取的奖励。在质押页面锁仓 $ARCIRCLE,每周可得 USDC,还能分到每个新 ArcPad 币。")) + ' <a href="/arc#staking">' + esc(L("Open Staking", "스테이킹 열기", "打开质押")) + " →</a></p>");
        box.dataset.rows = JSON.stringify(arcReady.map(function (r) { return { k: r.k, tokens: r.tokens || [], vault: r.vault || "" }; }));
        if (mine && !out.querySelector(".v11-start")) meStart(addr, box);
      });
    };
    out.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-v10claim]");
      if (!b || busy) return;
      var box = b.closest(".v10-claims"), rows = JSON.parse(box.dataset.rows || "[]");
      busy = true; b.disabled = true;
      claimAll(rows, function (msg) { b.textContent = msg; }).then(function (ok) {
        busy = false;
        if (ok) { b.classList.add("v10-ok"); fly(b, L("Claimed", "수령 완료", "已领取")); setTimeout(function () { box.remove(); paint(); }, 1600); }
        else b.disabled = false;
      });
    });
    if ("MutationObserver" in window) new MutationObserver(paint).observe(out, { childList: true });
    paint();
  }
  /// Staking USDC + Launch Drop, on Arc, one after the other (each is the wallet's own transaction)
  function claimAll(rows, say) {
    var C = window.CONFIG || {};
    var STK = C.STAKING_ADDRESS;
    // v11: the wallet from the site's one wallet button (arc-connect.js), else the browser's
    var getP = window.arcConnect ? Promise.resolve(window.arcConnect.provider()) : Promise.resolve(window.ethereum);
    return getP.then(function (eth) {
      if (!eth || typeof ethers === "undefined") { say(L("Open this in a wallet browser", "지갑 브라우저에서 열어주세요", "请在钱包浏览器中打开")); return false; }
      return eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }).catch(function () { return null; }).then(function () {
        return new ethers.BrowserProvider(eth).getSigner();
      }).then(function (s) {
        var chain = Promise.resolve();
        rows.forEach(function (r) {
          chain = chain.then(function () {
            if (r.k === "stake" && isAddr(STK)) { say(L("Confirm the USDC claim…", "USDC 수령을 확인하세요…", "请确认 USDC 领取…")); return new ethers.Contract(STK, ["function claim() returns (uint256)"], s).claim().then(function (tx) { return tx.wait(); }); }
            if (r.k === "drop" && isAddr(r.vault) && r.tokens.length) { say(L("Confirm the Launch Drop claim…", "런치 드랍 수령을 확인하세요…", "请确认发币空投领取…")); return new ethers.Contract(r.vault, ["function claim(address[] list) returns (uint256)"], s).claim(r.tokens.slice(0, 20)).then(function (tx) { return tx.wait(); }); }
          });
        });
        return chain.then(function () { say(L("Claimed", "수령 완료", "已领取")); return true; });
      });
    }).catch(function (e) { say(String((e && (e.shortMessage || e.reason || e.message)) || e).slice(0, 80)); return false; });
  }
  /// a small "+ claimed" chip flies from the button to the top bar
  function fly(from, text) {
    if (reduce || !from) return;
    var r = from.getBoundingClientRect(), to = D.querySelector(".anav-right") || D.body, t = to.getBoundingClientRect();
    var f = D.createElement("span");
    f.className = "v10-fly"; f.textContent = text;
    f.style.left = r.left + r.width / 2 - 30 + "px"; f.style.top = r.top + "px";
    D.body.appendChild(f);
    requestAnimationFrame(function () { f.style.transform = "translate(" + (t.right - 80 - r.left) + "px," + (t.top + 10 - r.top) + "px) scale(.8)"; f.style.opacity = "0"; });
    setTimeout(function () { f.remove(); }, 800);
  }
  api.fly = fly;

  // ---------------- v11: Ask ARCIA shrinks while you scroll ----------------
  function fabScroll() {
    var t = 0, lastY = window.scrollY;
    window.addEventListener("scroll", function () {
      var f = D.querySelector(".aa-fab");
      if (!f) return;
      if (Math.abs(window.scrollY - lastY) > 24) f.classList.add("v11-mini");
      lastY = window.scrollY;
      clearTimeout(t);
      t = setTimeout(function () { f.classList.remove("v11-mini"); }, 900);
    }, { passive: true });
  }

  // ---------------- v11: the $ARCIRCLE contracts note opens on a tap ----------------
  function caNote() {
    var n = D.querySelector(".ax-token-hero .ax-ca-note");
    if (!n || n.dataset.v11) return;
    n.dataset.v11 = "1";
    n.title = L("Tap to read all", "눌러서 전체 보기", "点击查看全部");
    n.addEventListener("click", function (e) { if (e.target.closest("a")) return; n.classList.toggle("open"); });
  }

  // ---------------- v11: coin page shortcuts (desktop) ----------------
  function coinKeys() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel || panel.dataset.v11k) return;
    panel.dataset.v11k = "1";
    var swap = D.getElementById("apc-swap");
    if (swap && !swap.querySelector(".v11-keys")) {
      var h = D.createElement("p");
      h.className = "v11-keys";
      h.innerHTML = L("Keys", "단축키", "快捷键") + ': <kbd>B</kbd> ' + esc(L("buy", "매수", "买入")) + ' · <kbd>S</kbd> ' + esc(L("sell", "매도", "卖出")) + ' · <kbd>1</kbd>–<kbd>4</kbd> $1 / $5 / $10 / $50';
      swap.appendChild(h);
    }
    D.addEventListener("keydown", function (e) {
      if (!panel.classList.contains("active") || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target, tag = t && t.tagName;
      if (e.key === "Escape" && tag === "INPUT" && t.id === "apc-amount") { t.blur(); return; }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if (D.querySelector(".cw-modal, .cw-m:not([hidden]), .anav-sheet.in")) return;
      var k = e.key.toLowerCase(), tabs = panel.querySelectorAll("#apc-swap .ac2-swap-tabs button"), q = panel.querySelectorAll("#apc-quick button");
      if ((k === "b" || k === "s") && tabs.length >= 2) { e.preventDefault(); tabs[k === "b" ? 0 : 1].click(); var a = D.getElementById("apc-amount"); if (a) a.focus(); }
      else if (/^[1-4]$/.test(k) && q[Number(k) - 1]) { e.preventDefault(); q[Number(k) - 1].click(); }
    });
  }

  // ---------------- v11: Explore — a visible "Compare" ----------------
  function compareBtn() {
    var bar = D.querySelector("#bp-panel-explore .cn-explore-toolbar");
    if (!bar || bar.querySelector(".v11-cmp")) return;
    var b = D.createElement("button");
    b.type = "button"; b.className = "flt-btn v11-cmp"; b.setAttribute("aria-pressed", "false");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16M3 8h8M13 16h8"/></svg><span>' + esc(L("Compare", "비교", "比较")) + "</span>";
    var f = bar.querySelector("#ap-filter-btn");
    bar.insertBefore(b, f || null);
    b.addEventListener("click", function () {
      var on = H.classList.toggle("v11-cmp-on");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("on", on);
      if (on && typeof window.arcToast === "function") window.arcToast(L("Pick 2 or 3 coins to compare", "비교할 코인을 2~3개 고르세요", "选择 2 到 3 个币进行比较"), "info");
    });
  }

  // ---------------- v11: My ARCIRCLE — getting started, for a wallet that's just begun ----------------
  function meStart(addr, box) {
    var C = window.CONFIG || {};
    var rpcUrl = C.RPC_URL || "https://rpc.mainnet.arc.io";
    Promise.all([
      fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }) }).then(function (r) { return r.json(); }).catch(function () { return null; }),
      getJson("/api/social?token=arcircle&wallet=" + addr),
      getJson("/api/desk?stake=me&u=" + addr),
    ]).then(function (r) {
      var usdc = 0; try { usdc = Number(BigInt((r[0] && r[0].result) || "0x0") / 10n ** 14n) / 1e4; } catch (e) { /* none */ }
      var w = r[1] && r[1].wallet, st = r[2] || {};
      var earned = (st.history || []).reduce(function (a, h) { return a + (h.earned || 0); }, 0);
      var steps = [
        [usdc >= 0.5, L("USDC on Arc", "Arc에 USDC", "Arc 上的 USDC"), L("Gas and buys are paid in USDC", "가스와 매수 모두 USDC", "Gas 和买入都用 USDC"), "/start"],
        [!!(w && Number(w.balance) > 0), L("Hold $ARCIRCLE", "$ARCIRCLE 보유", "持有 $ARCIRCLE"), L("The core coin", "핵심 코인", "核心币"), "/arcircle"],
        [!!(st.lock && st.lock.amount > 0), L("Lock it for veARCIRCLE", "락업해서 veARCIRCLE 받기", "锁仓获得 veARCIRCLE"), L("USDC every week + every new coin's drop", "매주 USDC + 새 코인 드랍", "每周 USDC + 每个新币空投"), "/arc#staking"],
        [earned > 0, L("Your first reward", "첫 보상 받기", "第一笔奖励"), L("Claim it from here", "여기서 수령", "在这里领取"), "/arc#staking"],
      ];
      var done = steps.filter(function (x) { return x[0]; }).length;
      if (done === steps.length) return;
      var el = D.createElement("section");
      el.className = "v11-start";
      el.innerHTML = '<div class="v11-start-h"><h2>' + esc(L("Getting started", "시작하기", "入门")) + '</h2><span>' + done + " / " + steps.length + '</span></div><div class="v11-start-bar"><i style="width:' + (done / steps.length * 100) + '%"></i></div><ol>' +
        steps.map(function (x) { return '<li class="' + (x[0] ? "ok" : "") + '"><a href="' + esc(x[3]) + '"><i aria-hidden="true"></i><span><b>' + esc(x[1]) + "</b><small>" + esc(x[2]) + "</small></span></a></li>"; }).join("") + "</ol>";
      box.insertAdjacentElement("afterend", el);
    });
  }

  // ---------------- run ----------------
  function init() {
    mountSettings();
    mountLangSettings();
    cutLedes();
    foldGuides();
    explore();
    coinPage();
    home();
    meCard();
    watchAccount();
    fabScroll();
    caNote();
    coinKeys();
    compareBtn();
    if (onArc) D.addEventListener("arcpad:tab", function () { setTimeout(function () { cutLedes(); foldGuides(); explore(); compareBtn(); coinKeys(); }, 0); tabIn(); });
    // the bar is rebuilt when the language changes
    D.addEventListener("arc:lang", function () { setTimeout(function () { mountSettings(); mountLangSettings(); }, 50); });
    setTimeout(function () { mountSettings(); mountLangSettings(); foldGuides(); }, 1200);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", init); else init();
})();
