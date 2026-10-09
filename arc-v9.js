// arc-v9.js — the v9 cleanup's behaviour, shared by every ARCIRCLE PAD page (styles: arc-v9.css).
// Each part checks for its own page and does nothing elsewhere. Plain script, no dependencies.
(function () {
  "use strict";
  if (window.arcV9) return;
  var D = document, H = D.documentElement;
  var lang = function () { var l = (H.getAttribute("lang") || "en").slice(0, 2); return l === "ko" || l === "zh" ? l : "en"; };
  var L = function (en, ko, zh) { var l = lang(); return l === "ko" ? ko : l === "zh" ? zh : en; };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phone = function () { return window.innerWidth <= 900; };
  var api = (window.arcV9 = {});

  // ---- utility guides: keep the newest "New in vN", fold the older ones into one line ----
  function foldNews() {
    var groups = new Map();
    [].forEach.call(D.querySelectorAll(".bp-panel details > summary > h3"), function (h) {
      if (!/^\s*New in v\d+/.test(h.textContent)) return;
      var det = h.parentNode.parentNode, par = det.parentNode;
      if (det.closest(".v9-older")) return;
      if (!groups.has(par)) groups.set(par, []);
      groups.get(par).push(det);
    });
    groups.forEach(function (list) {
      list.forEach(function (d) { d.open = false; });
      if (list.length < 2) return;
      var keep = list[0], rest = list.slice(1);
      var box = D.createElement("details");
      box.className = "v9-older";
      box.innerHTML = '<summary><span data-v9t="older">' + L("Earlier updates", "이전 업데이트", "更早的更新") + "</span> (" + rest.length + ')<a href="/updates" data-v9t="all">' + L("All updates", "전체 업데이트", "全部更新") + "</a></summary>";
      keep.parentNode.insertBefore(box, keep.nextSibling);
      rest.forEach(function (d) { box.appendChild(d); });
    });
  }

  // ---- phones: a Buy / Sell bar on the coin page ----
  function buyBar() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel) return;
    var bar = D.createElement("div");
    bar.className = "v9-buybar";
    bar.hidden = true;
    bar.setAttribute("data-no-i18n", "");
    D.body.appendChild(bar);
    var paint = function () { bar.innerHTML = '<button type="button" class="b" data-s="buy">' + L("Buy", "매수", "买入") + '</button><button type="button" class="s" data-s="sell">' + L("Sell", "매도", "卖出") + "</button>"; };
    paint();
    var target = function () { var a = D.getElementById("apc-argus-trade"); return a && !a.hidden && a.offsetParent ? a : D.getElementById("apc-swap"); };
    var on = function () { return panel.classList.contains("active") && /^#coin\//.test(location.hash) && phone(); };
    var sync = function () {
      var show = on();
      bar.hidden = !show;
      H.classList.toggle("v9-buybar-on", show);
      if (!show) return;
      var t = target(), r = t && t.getBoundingClientRect();
      bar.classList.toggle("away", !!(r && r.top < innerHeight - 120 && r.bottom > 120));
    };
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-s]"); if (!b) return;
      var t = target(); if (!t) return;
      var side = t.querySelector('[data-side="' + b.dataset.s + '"], .' + b.dataset.s);
      if (side) side.click();
      var y = t.getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(H).getPropertyValue("--anav-h"), 10) || 56) - 60;
      scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
      setTimeout(function () { var i = t.querySelector("input"); if (i) i.focus({ preventScroll: true }); }, reduce ? 0 : 450);
    });
    addEventListener("scroll", function () { if (!bar.hidden) requestAnimationFrame(sync); }, { passive: true });
    addEventListener("resize", sync);
    addEventListener("hashchange", function () { setTimeout(sync, 60); });
    D.addEventListener("arcpad:tab", function () { setTimeout(sync, 60); });
    D.addEventListener("arc:lang", paint);
    setTimeout(sync, 400);
  }


  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  // the page's own top-level state (ArcPad's scripts declare these with const/let, so they aren't on window)
  /* global APC, ARC, state */
  var G = function (name) {
    if (name === "APC") return typeof APC !== "undefined" ? APC : undefined;
    if (name === "ARC") return typeof ARC !== "undefined" ? ARC : undefined;
    if (name === "state") return typeof state !== "undefined" ? state : undefined;
    return undefined;
  };
  var usd = function (v) { return v >= 1000 ? "$" + (v / 1000).toFixed(v >= 1e4 ? 0 : 1) + "K" : "$" + v.toFixed(v >= 10 ? 0 : 2); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  // ---- ArcPad: "your first launch in 3 steps" on the Launch tab ----
  function launchGuide() {
    var panel = D.getElementById("bp-panel-launch"), form = D.getElementById("ap-launch-form");
    if (!panel || !form || store.get("v9.guide.off") === "1") return;
    var box = D.createElement("div");
    box.className = "v9-guide ap-only";
    box.id = "v9-guide";
    box.setAttribute("data-no-i18n", "");
    var lede = panel.querySelector(":scope > .bp-lede");
    if (lede) lede.parentNode.insertBefore(box, lede.nextSibling); else form.parentNode.insertBefore(box, form);
    var bal = null, busy = false;
    function acct() { var st = G("state"); return st && st.account ? st.account : null; }
    function paint() {
      var a = acct(), need = 1.1, okBal = bal != null && bal >= need;
      var step = function (n, done, title, body, act) {
        return '<li class="' + (done ? "done" : "") + '"><span class="v9-n">' + (done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>' : n) + '</span><div><b>' + title + "</b><small>" + body + "</small></div>" + (act || "") + "</li>";
      };
      box.innerHTML = '<div class="v9-guide-h"><b>' + L("Your first launch in 3 steps", "첫 런치, 3단계면 끝", "三步完成第一次发币") + '</b><button type="button" class="v9-x" data-g="off" aria-label="' + L("Hide", "숨기기", "隐藏") + '">×</button></div><ol>' +
        step(1, !!a, L("Connect a wallet", "지갑 연결", "连接钱包"), a ? esc(a.slice(0, 6) + "…" + a.slice(-4)) : L("MetaMask, Rabby or any wallet that can add Arc.", "MetaMask, Rabby 등 Arc를 추가할 수 있는 지갑이면 돼요.", "MetaMask、Rabby 或任何能添加 Arc 的钱包。"),
          a ? "" : '<button type="button" class="v9-gb" data-g="connect">' + L("Connect", "연결", "连接") + "</button>") +
        step(2, okBal, L("Have about 1.1 USDC on Arc", "Arc에 USDC 약 1.1개", "在 Arc 上准备约 1.1 USDC"),
          (bal != null ? L("You have ", "보유: ", "你有 ") + bal.toFixed(2) + " USDC · " : "") + L("1 USDC launch fee + gas. On Arc, gas is paid in USDC too.", "런치 수수료 1 USDC + 가스비. Arc에서는 가스비도 USDC로 내요.", "1 USDC 发币费 + gas。在 Arc 上 gas 也用 USDC 支付。"),
          okBal ? "" : '<a class="v9-gb ghost" href="/arc#bridge" data-g="bridge">' + L("Bridge USDC", "USDC 브리지", "跨链 USDC") + "</a>") +
        step(3, false, L("Name it and launch", "이름 짓고 런치", "起名并发币"), L("Name, ticker and a logo. Stuck on a name? Ask ARCIA for ideas.", "이름, 티커, 로고만 있으면 돼요. 이름이 고민되면 ARCIA에게 물어보세요.", "名称、代码和 Logo 即可。想不出名字?让 ARCIA 给点子。"),
          '<button type="button" class="v9-gb" data-g="start">' + L("Start", "시작", "开始") + "</button>") + "</ol>";
    }
    function refresh() {
      var a = acct();
      if (!a || busy || typeof readProvider !== "function") { if (!a) bal = null; paint(); return; }
      busy = true;
      Promise.resolve(readProvider().getBalance(a)).then(function (b) { bal = Number(b) / 1e18; }).catch(function () { /* keep */ }).then(function () { busy = false; paint(); });
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-g]"); if (!b) return;
      var g = b.dataset.g;
      if (g === "off") { store.set("v9.guide.off", "1"); box.remove(); return; }
      if (g === "connect" && typeof connectWallet === "function") { Promise.resolve(connectWallet()).then(refresh, refresh); }
      if (g === "start") { var n = D.getElementById("ap-name"); if (n) { n.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); setTimeout(function () { n.focus({ preventScroll: true }); }, reduce ? 0 : 400); } }
    });
    D.addEventListener("arcpad:tab", function (e) { if (e.detail && e.detail.tab === "launch") refresh(); });
    D.addEventListener("arc:wallet", refresh);
    D.addEventListener("arc:lang", paint);
    setInterval(function () { if (panel.classList.contains("active") && !D.hidden) refresh(); }, 15000);
    var lastA = null;
    setInterval(function () { var a = acct(); if (a !== lastA) { lastA = a; refresh(); } }, 1500);
    refresh();
  }

  // ---- ArcPad coin page: what the creator has earned, and Telegram alerts after "Watch" ----
  function coinExtras() {
    var panel = D.getElementById("bp-panel-coin");
    if (!panel) return;
    var line = null;
    function creatorBps() { var A = G("APC"); if (!A || !A.l) return null; if (A.l.platform && A.l.platform !== "arcpad") return null; return 70 + Number(A.l.extraFeeBps || 0); }
    function paintEarn() {
      var A = G("APC");
      if (!A || !A.token || !panel.classList.contains("active")) return;
      var bps = creatorBps(); if (bps == null) { if (line) line.hidden = true; return; }
      var full = A.logs && A.logs.lo <= A.logs.launchBlock, trades = A.trades || [];
      var vol = 0; for (var i = 0; i < trades.length; i++) vol += Number(trades[i].usdc) || 0;
      if (!line) { line = D.createElement("div"); line.className = "v9-earn"; line.setAttribute("data-no-i18n", ""); var host = panel.querySelector(".ac2-stats, .apc-stats, .ac2-grid") || panel.querySelector(".ac2-head"); if (!host) return; host.parentNode.insertBefore(line, host.nextSibling); }
      line.hidden = false;
      var earned = vol * bps / 10000;
      line.innerHTML = '<span class="v9-earn-i" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.6 9.8c0-1.2 1.1-2 2.4-2s2.4.8 2.4 1.9c0 2.4-4.8 1.2-4.8 3.6 0 1.1 1.1 1.9 2.4 1.9s2.4-.8 2.4-2"/></svg></span><span>' +
        (full ? L("The creator has earned", "크리에이터 누적 수익", "创作者已赚取") + ' <b>≈ ' + usd(earned) + "</b>" : L("Counting what the creator has earned…", "크리에이터 수익 계산 중…", "正在统计创作者收益…")) +
        ' <small>' + L("— ", "· ", "· ") + (bps / 100).toFixed(2) + "% " + L("of every trade goes to whoever launched it", "가 매 거래마다 런처에게 가요", "的每笔交易归发行者") + "</small></span>" +
        '<a href="/arc#launch" class="v9-earn-go">' + L("Launch yours", "나도 런치하기", "发行你的币") + "</a>";
    }
    setInterval(function () { if (!D.hidden) paintEarn(); }, 4000);
    D.addEventListener("arcpad:tab", function () { setTimeout(paintEarn, 800); });
    // starring a coin → offer ARCIA's Telegram DM for it
    D.addEventListener("click", function (e) {
      var st = e.target.closest && e.target.closest("#apc-star"); if (!st) return;
      setTimeout(function () {
        var old = D.getElementById("v9-tgpop"); if (old) old.remove();
        if (st.getAttribute("aria-pressed") !== "true") return;
        var pop = D.createElement("div");
        pop.id = "v9-tgpop"; pop.className = "v9-tgpop"; pop.setAttribute("role", "status"); pop.setAttribute("data-no-i18n", "");
        pop.innerHTML = "<span>" + L("Watching. Want ARCIA to DM you when it moves 20%?", "관심 등록 완료. 20% 움직이면 ARCIA가 DM으로 알려드릴까요?", "已关注。涨跌 20% 时让 ARCIA 私信你?") + '</span><button type="button" class="bp-btn-primary sm" data-v7tg>' + L("Telegram alerts", "텔레그램 알림", "Telegram 提醒") + '</button><button type="button" class="v9-x" aria-label="' + L("Close", "닫기", "关闭") + '">×</button>';
        st.parentNode.insertBefore(pop, st.nextSibling);
        pop.querySelector(".v9-x").addEventListener("click", function () { pop.remove(); });
        setTimeout(function () { if (pop.isConnected) pop.remove(); }, 12000);
      }, 60);
    });
    // the launch banner: more ways to tell people, and a moment of celebration
    new MutationObserver(function () {
      var c = D.getElementById("apc-celebrate");
      if (!c || c.__v9) return;
      c.__v9 = true;
      var tok = c.dataset.token, url = typeof arcCoinShareUrl === "function" ? arcCoinShareUrl(tok) : location.origin + "/c/" + tok;
      var acts = c.querySelector(".apc-cel-actions");
      if (acts) {
        var tg = D.createElement("a");
        tg.className = "apc-cel-btn"; tg.target = "_blank"; tg.rel = "noopener";
        tg.href = "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(L("Just launched on ArcPad (Circle's Arc)", "ArcPad에서 방금 런치했어요 (Circle Arc)", "刚在 ArcPad 发币 (Circle Arc)"));
        tg.textContent = "Telegram";
        var emb = D.createElement("button");
        emb.type = "button"; emb.className = "apc-cel-btn"; emb.textContent = L("Embed", "임베드", "嵌入");
        emb.addEventListener("click", function () { var b = D.getElementById("v7-embed-b"); if (b) b.click(); });
        var x = acts.querySelector(".apc-cel-x");
        acts.insertBefore(tg, x); acts.insertBefore(emb, x);
      }
      if (!reduce) confetti(c);
    }).observe(panel, { childList: true, subtree: true });
  }
  // a short burst of the two ring colours from an element
  function confetti(host) {
    var r = host.getBoundingClientRect(), layer = D.createElement("div");
    layer.className = "v9-confetti"; layer.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 46; i++) {
      var p = D.createElement("i"), a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 220;
      p.style.cssText = "left:" + (r.left + r.width / 2) + "px;top:" + (r.top + 30) + "px;--x:" + Math.cos(a) * d + "px;--y:" + (Math.sin(a) * d - 120) + "px;--r:" + (Math.random() * 720 - 360) + "deg;background:" + (i % 3 ? (i % 2 ? "#4d8dff" : "#2fe6a4") : "#ffffff") + ";animation-delay:" + Math.random() * 120 + "ms";
      layer.appendChild(p);
    }
    D.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 1800);
  }
  api.confetti = confetti;

  // ---- ArcPad launch form: what the creator's cut could look like ----
  function feeEstimate() {
    var slider = D.getElementById("ap-extrafee"), prev = D.getElementById("ap-fee-preview");
    if (!slider || !prev) return;
    var out = D.createElement("p"); out.className = "v9-feeest"; out.setAttribute("data-no-i18n", "");
    prev.parentNode.insertBefore(out, prev.nextSibling);
    var paint = function () { var bps = 70 + Number(slider.value || 0); out.innerHTML = L("At $10K of trading a day, you'd earn about ", "하루 거래량이 $10K면 약 ", "如果每天交易 $10K,你约赚 ") + "<b>$" + (10000 * bps / 10000).toFixed(0) + L("/day", "/일", "/天") + "</b>" + L(" — paid out on every trade, no claiming.", " 을 벌어요 — 매 거래마다 바로 지급, 클레임 필요 없음.", " —— 每笔交易即时到账,无需领取。"); };
    slider.addEventListener("input", paint); D.addEventListener("arc:lang", paint); paint();
  }

  // ---- ArcPad home: newest coins nobody has bought yet ----
  function firstBuyer() {
    var home = D.getElementById("bp-panel-home"), trend = D.getElementById("v6-trend");
    if (!home || !trend || !D.getElementById("bp-panel-launch")) return;
    var box = D.createElement("div"); box.className = "v9-first"; box.hidden = true; box.setAttribute("data-no-i18n", "");
    trend.parentNode.insertBefore(box, trend.nextSibling);
    function paint() {
      var A = G("ARC"); if (!A || !A.launches || !A.launches.length || typeof arcAnyStats !== "function") return;
      var now = Date.now() / 1000;
      var list = A.launches.filter(function (l) { return (!l.platform || l.platform === "arcpad") && l.launchedAt && now - l.launchedAt < 14 * 86400; })
        .filter(function (l) { var s = arcAnyStats(l); return !s || !s.trades; }).sort(function (a, b) { return b.launchedAt - a.launchedAt; }).slice(0, 3);
      if (!list.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<div class="v6-sec-h"><h3>' + L("Be the first buyer", "첫 번째 구매자 되기", "成为第一个买家") + "</h3><small>" + L("New coins with no trades in the last 24 hours", "최근 24시간 거래가 없는 새 코인", "近 24 小时无交易的新币") + '</small></div><div class="v9-first-l">' + list.map(function (l) {
        return '<a href="/arc#coin/' + esc(l.token) + '" class="v9-fc"><b>$' + esc(l.symbol) + "</b><span>" + esc(l.name || "") + "</span><em>" + L("Buy from $1", "$1부터 매수", "$1 起买") + "</em></a>";
      }).join("") + "</div>";
    }
    setInterval(function () { if (home.classList.contains("active") && !D.hidden) paint(); }, 8000);
    setTimeout(paint, 2500);
  }

  // ---- install as an app (phones; once, dismissible) ----
  function installHint() {
    if (store.get("v9.install.off") === "1" || (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone) return;
    var deferred = null, ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    function show() {
      if (!phone() || D.getElementById("v9-install")) return;
      var b = D.createElement("div"); b.id = "v9-install"; b.className = "v9-install"; b.setAttribute("role", "dialog"); b.setAttribute("aria-label", "Install"); b.setAttribute("data-no-i18n", "");
      b.innerHTML = '<img src="/images/apple-touch-icon.png" alt="" width="40" height="40"><div><b>' + L("Add ARCIRCLE to your home screen", "ARCIRCLE을 홈 화면에 추가", "把 ARCIRCLE 添加到主屏幕") + "</b><small>" +
        (deferred ? L("Opens like an app, full screen.", "앱처럼 전체 화면으로 열려요.", "像 App 一样全屏打开。") : L("Tap Share, then “Add to Home Screen”.", "공유 버튼 → ‘홈 화면에 추가’를 누르세요.", "点分享,然后“添加到主屏幕”。")) + "</small></div>" +
        (deferred ? '<button type="button" class="bp-btn-primary sm" data-i="go">' + L("Install", "설치", "安装") + "</button>" : "") + '<button type="button" class="v9-x" data-i="off" aria-label="' + L("Close", "닫기", "关闭") + '">×</button>';
      D.body.appendChild(b);
      b.addEventListener("click", function (e) {
        var t = e.target.closest("[data-i]"); if (!t) return;
        if (t.dataset.i === "go" && deferred) { deferred.prompt(); deferred.userChoice.then(function () { b.remove(); store.set("v9.install.off", "1"); }); return; }
        store.set("v9.install.off", "1"); b.remove();
      });
    }
    addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; setTimeout(show, 20000); });
    if (ios) setTimeout(show, 25000);
  }

  // ---- a small toast (bottom centre, above the phone tab bar) ----
  function toast(html, cls) {
    var t = D.createElement("div");
    t.className = "v9-toast " + (cls || ""); t.setAttribute("role", "status"); t.setAttribute("data-no-i18n", "");
    t.innerHTML = html;
    D.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("in"); });
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 300); }, 4200);
    return t;
  }
  // count a number up inside an element: keeps what's around the number ($, K, %, words)
  function countUp(el, to, fmt, ms) {
    if (reduce) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = ms || 700;
    (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }

  // ---- ArcPad coin page: after a buy, how much you got, counted up ----
  function buyToast() {
    if (typeof window.apcStatus !== "function") return;
    var orig = window.apcStatus, before = null;
    window.apcStatus = function (type, html) {
      var A = G("APC");
      if (type === "pending" && /^Buying/.test(String(html)) && A && A.user) before = A.user.tok;
      var r = orig.apply(this, arguments);
      if (type === "success" && /^Bought/.test(String(html)) && A && before != null) {
        var b0 = before, sym = A.l && A.l.symbol ? "$" + A.l.symbol : "", t0 = Date.now();
        before = null;
        (function wait() {
          var now = A.user && A.user.tok;
          if (now != null && now > b0) {
            var got = Number(now - b0) / 1e18;
            var el = toast('<b class="v9-cu">+0</b> <span>' + esc(sym) + "</span><small>" + L("in your wallet", "지갑에 들어왔어요", "已到账") + "</small>", "ok").querySelector(".v9-cu");
            countUp(el, got, function (v) { return "+" + v.toLocaleString("en-US", { maximumFractionDigits: got < 10 ? 4 : 0 }); }, 900);
            return;
          }
          if (Date.now() - t0 < 8000) setTimeout(wait, 400);
        })();
      }
      return r;
    };
  }

  // ---- coin prices flash when they move (ArcPad home cards and the Explore grid) ----
  function priceFlash() {
    if (!D.getElementById("bp-panel-home") || !D.getElementById("bp-panel-launch")) return;
    var last = new Map();
    var num = function (t) { var m = /\$([\d.,]+)\s*([KMB]?)/.exec(t || ""); if (!m) return null; var v = parseFloat(m[1].replace(/,/g, "")); return v * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1); };
    setInterval(function () {
      if (D.hidden) return;
      [].forEach.call(D.querySelectorAll(".bp-panel.active a.v6-tc, .bp-panel.active .launch-card"), function (c) {
        var key = c.getAttribute("href") || c.dataset.token || ""; if (!key) return;
        var vEl = c.querySelector(".v6-tc-n > span, .lc-mcap, [data-mcap]") || c, v = num(vEl.textContent);
        if (v == null) return;
        var p = last.get(key); last.set(key, v);
        if (p == null || p === v || reduce) return;
        c.classList.remove("v9-up", "v9-down"); void c.offsetWidth; c.classList.add(v > p ? "v9-up" : "v9-down");
      });
    }, 2000);
  }

  // ---- $ARCIRCLE burns: the chip in the menu pulses when more gets burned ----
  function burnPulse() {
    var KEY = "v9.burned";
    function tick() {
      if (D.hidden) return;
      fetch("/api/social?token=arcircle").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var b = d && d.burned && Number(d.burned.tokens); if (!(b > 0)) return;
        var prev = Number(store.get(KEY) || 0); store.set(KEY, String(b));
        if (!(prev > 0) || b <= prev) return;
        var chip = D.querySelector('.anav-chip[href="/arcircle"]');
        if (!chip || !chip.offsetParent) return;
        chip.classList.remove("v9-burn"); void chip.offsetWidth; chip.classList.add("v9-burn");
        var tip = D.createElement("span"); tip.className = "v9-burntip"; tip.textContent = "+" + Math.round(b - prev).toLocaleString("en-US") + " " + L("burned", "소각", "已销毁");
        chip.appendChild(tip); setTimeout(function () { tip.remove(); }, 3200);
      }).catch(function () { /* next time */ });
    }
    setTimeout(tick, 4000); setInterval(tick, 90000);
  }

  // ---- numbers count up the first time they come into view ----
  function countIn() {
    if (reduce || !("IntersectionObserver" in window)) return;
    var SEL = ".pg-t b, .ax-fact b, .ax-facts b, .hm-nums b, .ap-stat b, .bp-mini-stat b, .stk-pot b, .rw-meter b, .st-out b";
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, txt = el.textContent, m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(txt.trim());
        if (!m || el.children.length) return;
        var v = parseFloat(m[2].replace(/,/g, "")); if (!(v > 0)) return;
        var dec = (m[2].split(".")[1] || "").length, comma = /,/.test(m[2]) || v >= 1000;
        var mine = null;
        countUp(el, v, function (x) { mine = m[1] + x.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: comma }) + m[3]; return mine; }, 800);
        // if the page writes a fresher value while we count, the page wins
        var mo = new MutationObserver(function () { if (el.textContent !== mine) mo.disconnect(); });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(function () { mo.disconnect(); if (el.textContent !== txt && el.textContent === mine) el.textContent = txt; }, 900);
      });
    }, { threshold: 0.6 });
    var seen = new WeakSet();
    function scan() { [].forEach.call(D.querySelectorAll(SEL), function (el) { if (!seen.has(el) && /\d/.test(el.textContent)) { seen.add(el); io.observe(el); } }); }
    scan(); setInterval(scan, 3000);
  }

  // ---- values still loading: a soft shimmer instead of a bare "—", then a calm "—" if nothing comes ----
  function pending() {
    var SEL = "main b, main strong, .bp-main b, .bp-main strong, [data-hm-num], [data-lb]";
    function mark() {
      [].forEach.call(D.querySelectorAll(SEL), function (el) {
        if (el.__v9p || el.children.length || el.textContent.trim() !== "—") return;
        var fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 14) return;
        el.__v9p = Date.now(); el.classList.add("v9-skel");
        var mo = new MutationObserver(function () { if (el.textContent.trim() !== "—") { el.classList.remove("v9-skel", "v9-na"); mo.disconnect(); } });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(function () { if (el.classList.contains("v9-skel")) { el.classList.remove("v9-skel"); el.classList.add("v9-na"); el.title = L("Not available right now — Arc didn't answer. It fills in by itself when it does.", "지금은 불러올 수 없어요 — Arc 응답이 오면 자동으로 채워져요.", "暂时无法读取——Arc 响应后会自动显示。"); } }, 6000);
      });
    }
    mark(); setInterval(mark, 1500);
  }

  // ---- ARCIA's button says one thing a day ----
  function arciaBubble() {
    var day = new Date().toISOString().slice(0, 10);
    if (store.get("v9.bubble") === day) return;
    setTimeout(function () {
      var fab = D.querySelector(".aa-fab"); if (!fab || !fab.getBoundingClientRect().width) return;
      fetch("/api/c?view=latest&n=20").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
        var now = Date.now() / 1000, n = j && j.coins ? j.coins.filter(function (c) { return c.launchedAt && now - c.launchedAt < 86400; }).length : 0;
        var msg = n ? L(n + (n > 1 ? " new coins" : " new coin") + " launched today — want a look?", "오늘 새 코인 " + n + "개가 나왔어요 — 구경할래요?", "今天有 " + n + " 个新币上线——去看看?")
          : L("Ask me anything about ARCIRCLE — I'm right here.", "ARCIRCLE에 대해 뭐든 물어보세요 — 여기 있어요.", "关于 ARCIRCLE 的任何问题都可以问我——我就在这里。");
        var b = D.createElement("a");
        b.className = "v9-bubble"; b.href = n ? "/arc#explore" : "#"; b.textContent = msg; b.setAttribute("data-no-i18n", "");
        if (!n) b.addEventListener("click", function (e) { e.preventDefault(); fab.click(); b.remove(); });
        var r = fab.getBoundingClientRect();
        b.style.right = Math.max(12, innerWidth - r.right) + "px"; b.style.bottom = (innerHeight - r.top + 10) + "px";
        D.body.appendChild(b); store.set("v9.bubble", day);
        setTimeout(function () { b.classList.add("out"); setTimeout(function () { b.remove(); }, 400); }, 7000);
      });
    }, 9000);
  }

  // ---- the second menu row tucks away while you scroll down, comes back when you scroll up ----
  function compactNav() {
    var y0 = scrollY, on = false;
    addEventListener("scroll", function () {
      var y = scrollY, want = y > 160 && y > y0 + 4 ? true : y < y0 - 4 || y < 120 ? false : on;
      y0 = y;
      if (want !== on) { on = want; H.classList.toggle("anav-compact", on); }
    }, { passive: true });
  }

  // ---- phones: the menu sheet closes with a swipe down ----
  function sheetSwipe() {
    var y = null, el = null;
    D.addEventListener("touchstart", function (e) { var s = e.target.closest && e.target.closest(".anav-sheet-in"); if (!s || s.scrollTop > 0) { y = null; return; } el = s; y = e.touches[0].clientY; }, { passive: true });
    D.addEventListener("touchmove", function (e) { if (y == null || !el) return; var dy = e.touches[0].clientY - y; if (dy > 0) { el.style.transition = "none"; el.style.transform = "translateY(" + dy + "px)"; } }, { passive: true });
    D.addEventListener("touchend", function (e) {
      if (y == null || !el) return;
      var dy = e.changedTouches[0].clientY - y, s = el; y = null; el = null;
      s.style.transition = ""; s.style.transform = "";
      if (dy > 90) { var x = D.querySelector(".anav-sheet .anav-x"); if (x) x.click(); }
    });
  }

  // ---- $ARCIRCLE page on phones: the long sections fold under their titles ----
  function foldCoinPage() {
    if (!D.body.classList.contains("ax-token") || !D.querySelector("main #uses")) return;
    var secs = [].slice.call(D.querySelectorAll("main .ax-section[id]")).filter(function (x) { return x.id !== "uses"; });
    var mq = window.matchMedia && matchMedia("(max-width:900px)");
    function apply() {
      var on = mq && mq.matches;
      secs.forEach(function (sec) {
        var h = sec.querySelector(":scope > h2"); if (!h) return;
        if (on && !sec.classList.contains("v9-fold")) {
          sec.classList.add("v9-fold");
          h.setAttribute("role", "button"); h.setAttribute("tabindex", "0"); h.setAttribute("aria-expanded", "false");
          if (!h.__v9) { h.__v9 = true;
            var tog = function () { var o = !sec.classList.contains("open"); sec.classList.toggle("open", o); h.setAttribute("aria-expanded", o ? "true" : "false"); };
            h.addEventListener("click", function () { if (sec.classList.contains("v9-fold")) tog(); });
            h.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && sec.classList.contains("v9-fold")) { e.preventDefault(); tog(); } });
          }
        } else if (!on && sec.classList.contains("v9-fold")) {
          sec.classList.remove("v9-fold", "open"); h.removeAttribute("role"); h.removeAttribute("tabindex"); h.removeAttribute("aria-expanded");
        }
      });
    }
    function openFor(id) { var sec = D.getElementById(id); if (sec && sec.classList.contains("v9-fold") && !sec.classList.contains("open")) { sec.classList.add("open"); var h = sec.querySelector(":scope > h2"); if (h) h.setAttribute("aria-expanded", "true"); } }
    D.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a) openFor(a.getAttribute("href").slice(1)); }, true);
    addEventListener("hashchange", function () { openFor(location.hash.slice(1)); });
    apply(); if (mq) { if (mq.addEventListener) mq.addEventListener("change", apply); else if (mq.addListener) mq.addListener(apply); }
    if (location.hash) openFor(location.hash.slice(1));
  }

  function init() {
    foldNews();
    buyBar();
    launchGuide();
    coinExtras();
    feeEstimate();
    firstBuyer();
    installHint();
    buyToast();
    priceFlash();
    burnPulse();
    // v11: numbers no longer count up from zero on every visit (they flash only when they change: priceFlash)
    // countIn();
    pending();
    arciaBubble();
    compactNav();
    sheetSwipe();
    foldCoinPage();
    D.addEventListener("arc:lang", function () {
      [].forEach.call(D.querySelectorAll('[data-v9t="older"]'), function (e) { e.textContent = L("Earlier updates", "이전 업데이트", "更早的更新"); });
      [].forEach.call(D.querySelectorAll('[data-v9t="all"]'), function (e) { e.textContent = L("All updates", "전체 업데이트", "全部更新"); });
    });
  }
  api.L = L;
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", init); else init();
})();
