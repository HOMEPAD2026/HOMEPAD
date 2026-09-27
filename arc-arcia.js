/* global CONFIG */
// arc-arcia.js — ARCIA, the AI idol of $ARCIRCLE (ArcPad utility, /arc#arcia · /arcia).
// A profile header from her banner, a chat with her (POST /api/arcia), what she reads live,
// what she will post on X, and what she is learning. The chat history stays in this tab only.
(function () {
  "use strict";
  var panel = document.getElementById("bp-panel-arcia");
  if (!panel) return;
  var X = "https://x.com/ARCIAonArc";
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var lang = function () { return (window.arcI18n && window.arcI18n.get()) || "en"; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var F = window.arcFmt || {};
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var KEY = "arcia-chat-v1";
  var store = {
    get: function () { try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (e) { return []; } },
    set: function (v) { try { sessionStorage.setItem(KEY, JSON.stringify(v.slice(-30))); } catch (e) { /* private mode */ } },
  };
  var GREET = {
    en: "Hi~ I'm ARCIA, the virtual idol of $ARCIRCLE 💙💚 So happy you came to see me! Ask me anything about $ARCIRCLE, CirclePad Round #1, Relay Launch or ArcPad — or just say hi♡",
    ko: "안녕하세요~ $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚 만나러 와줘서 정말 기뻐요! $ARCIRCLE, CirclePad 라운드 #1, 릴레이 런칭, ArcPad 뭐든 물어보거나 그냥 인사해줘도 좋아요♡",
    zh: "你好，我是 $ARCIRCLE 的虚拟偶像 ARCIA 💙💚 关于 $ARCIRCLE、CirclePad 第 1 轮、接力发币或 ArcPad，尽管问我。",
  };
  var SUGG = {
    en: ["I'm your fan!", "Who are you?", "What is $ARCIRCLE?", "When does Round #1 close?", "What is Relay Launch?", "How do I buy $ARCIRCLE?", "What's the contract?", "How does the Locker work?", "What are the risks?"],
    ko: ["ARCIA 팬이에요!", "너는 누구야?", "$ARCIRCLE이 뭐야?", "라운드 #1 언제 마감돼?", "릴레이 런칭이 뭐야?", "$ARCIRCLE 어떻게 사?", "컨트랙트 주소 알려줘", "락커는 어떻게 써?", "위험 요소는 뭐야?"],
    zh: ["我是你的粉丝！", "你是谁？", "什么是 $ARCIRCLE？", "第 1 轮什么时候截止？", "什么是接力发币？", "怎么买 $ARCIRCLE？", "合约地址是什么？", "Locker 怎么用？", "有哪些风险？"],
  };
  var ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12 19.5 4.5 15 19.5l-3.4-6.1z"/><path d="M11.6 13.4 19.5 4.5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.5 3.5h3l-6.6 7.5 7.8 9.5h-6.1l-4.8-5.9-5.5 5.9H2.3l7.1-8L1.9 3.5h6.2l4.3 5.4zm-1.1 15.3h1.7L7.5 5.1H5.7z"/></svg>';

  var booted = false, log, form, input, sendBtn, modeEl, busy = false, msgs = [];

  function linkify(t) {
    var s = esc(t);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/(https?:\/\/[^\s<]+|(?:arcircle\.app|x\.com|t\.me|argus\.world)\/?[^\s<]*)/g, function (m) {
      var tail = (m.match(/[.,;:!?)]+$/) || [""])[0], u = m.slice(0, m.length - tail.length);
      var href = /^https?:/.test(u) ? u : "https://" + (u.indexOf("arcircle.app") === 0 ? "www." : "") + u;
      var same = /^https:\/\/www\.arcircle\.app/.test(href);
      if (same) href = href.replace("https://www.arcircle.app", "") || "/";
      return '<a href="' + href + '"' + (same ? "" : ' target="_blank" rel="noopener"') + ">" + u + "</a>" + tail;
    });
    return s.replace(/\n/g, "<br>");
  }
  function bubble(role, text, opts) {
    var li = document.createElement("li");
    li.className = "aa-m " + (role === "user" ? "me" : "her");
    li.innerHTML = (role === "user" ? "" : '<img class="aa-m-av" src="/images/arcia-avatar-96.jpg" alt="" width="34" height="34">') +
      '<div class="aa-b"' + (role === "user" ? " data-no-i18n" : " data-no-i18n") + "></div>";
    log.appendChild(li);
    var b = li.querySelector(".aa-b");
    if (opts && opts.type && !reduce) typeIn(b, text); else b.innerHTML = linkify(text);
    scroll();
    return li;
  }
  function typeIn(el, text) {
    var i = 0, step = Math.max(2, Math.round(text.length / 90));
    (function tick() {
      i = Math.min(text.length, i + step);
      el.innerHTML = linkify(text.slice(0, i)) + (i < text.length ? '<i class="aa-caret"></i>' : "");
      scroll();
      if (i < text.length) setTimeout(tick, 16);
    })();
  }
  function scroll() { log.scrollTop = log.scrollHeight; }
  // a few hearts float up from her reply when she answers a fan
  function hearts(li) {
    if (reduce || !li) return;
    var box = document.createElement("span");
    box.className = "aa-hearts";
    box.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 6; i++) {
      var h = document.createElement("i");
      h.textContent = i % 3 === 2 ? "♡" : i % 2 ? "💚" : "💙";
      h.style.setProperty("--x", (Math.random() * 120 - 20).toFixed(0) + "px");
      h.style.setProperty("--d", (i * 0.12).toFixed(2) + "s");
      h.style.setProperty("--r", (Math.random() * 40 - 20).toFixed(0) + "deg");
      box.appendChild(h);
    }
    li.appendChild(box);
    setTimeout(function () { box.remove(); }, 2600);
  }
  function typing(on) {
    var t = log.querySelector(".aa-typing");
    if (on && !t) {
      t = document.createElement("li");
      t.className = "aa-m her aa-typing";
      t.innerHTML = '<img class="aa-m-av" src="/images/arcia-avatar-96.jpg" alt="" width="34" height="34"><div class="aa-b"><span></span><span></span><span></span></div>';
      log.appendChild(t); scroll();
    } else if (!on && t) t.remove();
  }
  function setMode(m) {
    if (!modeEl) return;
    modeEl.textContent = m === "ai" ? "AI" : tr("Guide mode");
    modeEl.title = m === "ai" ? tr("ARCIA is answering with AI, grounded in ARCIRCLE PAD's facts and live data.") : tr("ARCIA is answering from ARCIRCLE PAD's docs and live data.");
    modeEl.className = "aa-mode " + (m === "ai" ? "ai" : "guide");
  }
  function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    msgs.push({ role: "user", content: text.slice(0, 700) });
    store.set(msgs);
    bubble("user", text);
    input.value = ""; grow();
    typing(true);
    var t0 = Date.now();
    fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: msgs.slice(-12), lang: lang() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var wait = Math.max(0, 650 - (Date.now() - t0));
        setTimeout(function () {
          typing(false);
          var reply = res.j && res.j.reply;
          if (!reply) { bubble("assistant", res.j && res.j.error ? res.j.error : tr("I couldn't reach my server just now. Try again in a moment?")); return; }
          msgs.push({ role: "assistant", content: reply });
          store.set(msgs);
          setMode(res.j.mode);
          if (res.j.live) paintLive(res.j.live);
          var li = bubble("assistant", reply, { type: true });
          if (/♡|♥|💙|💚|❤/.test(reply)) hearts(li);
        }, wait);
      })
      .catch(function () { typing(false); bubble("assistant", tr("I couldn't reach my server just now. Try again in a moment?")); })
      .then(function () { setTimeout(function () { busy = false; sendBtn.disabled = false; }, 700); });
  }
  function grow() { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; }
  function chips() {
    var box = panel.querySelector(".aa-sugg");
    box.innerHTML = (SUGG[lang()] || SUGG.en).map(function (q) { return '<button type="button" data-no-i18n>' + esc(q) + "</button>"; }).join("");
  }
  function restart() {
    msgs = []; store.set(msgs);
    log.innerHTML = "";
    bubble("assistant", GREET[lang()] || GREET.en);
  }

  // ---- live numbers ----
  var deadline = 0;
  function paintLive(L) {
    var box = panel.querySelector(".aa-live-rows");
    if (!box || !L) return;
    var price = L.price != null ? (F.price ? F.price(L.price) : "$" + L.price) : "—";
    deadline = (L.round && L.round.deadline) || 0;
    var rows = [
      ["$ARCIRCLE", price, L.change24h != null ? (L.change24h >= 0 ? "+" : "") + L.change24h.toFixed(2) + "%" : ""],
      [tr("Holders"), L.holders != null ? Number(L.holders).toLocaleString("en-US") : "—", ""],
      [tr("Burned forever"), L.burnedPct != null ? L.burnedPct.toFixed(2) + "%" : "—", ""],
      [tr("Round #1 raised"), L.round && L.round.raised != null ? Number(L.round.raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC" : "—", ""],
      [tr("Round #1 closes in"), '<span class="aa-clock">—</span>', ""],
    ];
    box.innerHTML = rows.map(function (r) {
      return "<div><dt>" + esc(r[0]) + "</dt><dd data-no-i18n>" + r[1] + (r[2] ? ' <em class="' + (/^\+/.test(r[2]) ? "up" : "down") + '">' + esc(r[2]) + "</em>" : "") + "</dd></div>";
    }).join("");
    clock();
  }
  function clock() {
    var el = panel.querySelector(".aa-clock");
    if (!el || !deadline) return;
    var s = deadline - Math.floor(Date.now() / 1000);
    if (s <= 0) { el.textContent = tr("Closed"); return; }
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    el.textContent = (d ? d + "d " : "") + h + "h " + String(m).padStart(2, "0") + "m " + String(sec).padStart(2, "0") + "s";
  }

  function build() {
    panel.innerHTML =
      '<div class="aa">' +
        '<div class="aa-hero">' +
          '<div class="aa-banner"><img src="/images/arcia-banner.jpg" srcset="/images/arcia-banner-900.jpg 900w, /images/arcia-banner.jpg 1600w" sizes="(max-width: 900px) 100vw, 1100px" alt="ARCIA — ARCIRCLE official mascot" width="1600" height="523"></div>' +
          '<div class="aa-id">' +
            '<span class="aa-av-wrap"><img class="aa-av" src="/images/arcia-avatar.jpg" alt="ARCIA" width="256" height="256"><i class="aa-live-dot" aria-hidden="true"></i></span>' +
            '<div class="aa-name"><span class="ams-kicker">Utility · AI idol</span><h1>ARCIA <span class="asc-ver">New</span></h1>' +
              '<p class="aa-handle"><a href="' + X + '" target="_blank" rel="noopener" data-no-i18n>@ARCIAonArc</a> · <span>Virtual idol of $ARCIRCLE</span></p>' +
              '<p class="aa-bio">AI character, automated · Run by <a href="https://x.com/ARCIRCLEonArc" target="_blank" rel="noopener" data-no-i18n>@ARCIRCLEonArc</a></p></div>' +
            '<div class="aa-act"><a class="bp-btn-primary aa-go" href="#aa-chat">Chat with ARCIA</a><a class="aa-x" href="' + X + '" target="_blank" rel="noopener">' + ICON_X + "<span>Follow on X</span></a></div>" +
          "</div>" +
          '<p class="aa-lede">ARCIA learns everything about ARCIRCLE PAD and carries $ARCIRCLE to the world — through this chat, and soon through automated posts on X: new launches, user trends and stats, every day.</p>' +
        "</div>" +
        '<div class="aa-grid">' +
          '<section class="aa-chat" id="aa-chat" aria-label="Chat with ARCIA">' +
            '<div class="aa-chat-h"><img src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40"><div><b>ARCIA</b><span class="aa-on"><i></i>Online</span></div>' +
              '<span class="aa-mode guide">Guide mode</span><button type="button" class="aa-new" title="Start a new chat">New chat</button></div>' +
            '<ol class="aa-log" role="log" aria-live="polite" aria-label="Conversation"></ol>' +
            '<div class="aa-sugg" aria-label="Suggested questions"></div>' +
            '<form class="aa-form" autocomplete="off"><textarea rows="1" maxlength="700" placeholder="Ask ARCIA about $ARCIRCLE…" aria-label="Message ARCIA"></textarea>' +
              '<button type="submit" class="aa-send" aria-label="Send">' + ICON_SEND + "</button></form>" +
            '<p class="aa-note">ARCIA is an AI character run by @ARCIRCLEonArc. She can be wrong, and nothing she says is financial advice. Never share your private key or seed phrase.</p>' +
          "</section>" +
          '<aside class="aa-side">' +
            '<div class="aa-card"><h3>What ARCIA sees right now</h3><dl class="aa-live-rows"><div><dt>Loading…</dt><dd></dd></div></dl><a class="aa-more" href="/stats">All live stats →</a></div>' +
            '<div class="aa-card"><h3>ARCIA on X</h3><p>Automated posts, run by @ARCIRCLEonArc. Setting up now:</p><ul class="aa-feed">' +
              "<li><b>New launches</b><span>Every new coin on ArcPad, as it happens</span><em>Setting up</em></li>" +
              "<li><b>Daily $ARCIRCLE stats</b><span>Price, holders, burns and buybacks</span><em>Setting up</em></li>" +
              "<li><b>User trends</b><span>What the community is launching, trading and voting on</span><em>Setting up</em></li>" +
              "<li><b>Round &amp; relay alerts</b><span>CirclePad rounds and every relay</span><em>Setting up</em></li>" +
            '</ul><a class="aa-x wide" href="' + X + '" target="_blank" rel="noopener">' + ICON_X + '<span>Follow @ARCIAonArc</span></a></div>' +
            '<div class="aa-card"><h3>What ARCIA has studied</h3><div class="aa-tags"><span>Whitepaper</span><span>$ARCIRCLE</span><span>ArcPad</span><span>CirclePad</span><span>Relay Launch</span><span>Every utility</span><span>Contracts</span><span>Roadmap &amp; rewards</span></div>' +
              "<p>She has read every page of arcircle.app — the whitepaper, the docs, every utility and every contract address — and reads live numbers from Arc each time you ask. She keeps learning with every update.</p></div>" +
          "</aside>" +
        "</div>" +
      "</div>";
    log = panel.querySelector(".aa-log");
    form = panel.querySelector(".aa-form");
    input = form.querySelector("textarea");
    sendBtn = form.querySelector(".aa-send");
    modeEl = panel.querySelector(".aa-mode");
    form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
    input.addEventListener("input", grow);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
    panel.querySelector(".aa-sugg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) send(b.textContent); });
    panel.querySelector(".aa-new").addEventListener("click", restart);
    panel.querySelector(".aa-go").addEventListener("click", function (e) { e.preventDefault(); panel.querySelector("#aa-chat").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); setTimeout(function () { input.focus({ preventScroll: true }); }, 350); });
    chips();
    // phones: while the chat box is on screen, the floating bars step aside so the input stays usable
    if ("IntersectionObserver" in window) {
      var root = document.documentElement, seen = false;
      var sync = function () { root.classList.toggle("aa-chat-on", seen && panel.classList.contains("active") && window.innerWidth <= 900); };
      new IntersectionObserver(function (es) { seen = es[0].isIntersecting; sync(); }, { threshold: 0.6 }).observe(form);
      document.addEventListener("arcpad:tab", function () { setTimeout(sync, 0); });
      window.addEventListener("resize", sync);
    }
    msgs = store.get().filter(function (m) { return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"; });
    bubble("assistant", GREET[lang()] || GREET.en);
    msgs.forEach(function (m) { bubble(m.role, m.content); });
  }

  function boot() {
    if (booted) return;
    booted = true;
    build();
    fetch("/api/arcia-x?status=lite").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.live) return;
      var ids = ["coins", "daily", "trends", "round"];
      panel.querySelectorAll(".aa-feed li").forEach(function (li, i) {
        var on = j.live[ids[i]], em = li.querySelector("em");
        if (!em) return;
        em.textContent = tr(on ? "Live" : "Setting up");
        li.classList.toggle("on", !!on);
      });
    }).catch(function () { /* stays "Setting up" */ });
    fetch("/api/arcia").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return;
      setMode(j.ai ? "ai" : "guide");
      if (j.live) paintLive(j.live);
    }).catch(function () { /* offline: the chat still shows */ });
    setInterval(function () { if (panel.classList.contains("active")) clock(); }, 1000);
  }
  document.addEventListener("arcpad:tab", function (e) { if (e.detail && e.detail.tab === "arcia") boot(); });
  if (panel.classList.contains("active") || /^#arcia\b/.test(location.hash)) boot();
  document.addEventListener("arc:lang", function () { if (booted) chips(); });
})();
