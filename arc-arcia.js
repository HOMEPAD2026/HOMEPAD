/* global CONFIG, state */
// arc-arcia.js — ARCIA, the AI idol of $ARCIRCLE (ArcPad utility, /arc#arcia · /arcia).
//
// A fan-call page: her profile header, a portrait that breathes and "speaks" while she answers,
// a streamed chat with her (POST /api/arcia, NDJSON), and side tabs — live numbers with a round
// reminder, what she said on X, a fan-letter board, a quiz and her official profile.
// Kept in this browser only: the chat (this tab), the name she calls you, your daily streak,
// quiz badges, hearts and the voice switch (localStorage; optional, private mode just forgets).
// v1: she opens over any ArcPad page (the floating button, or "Ask ARCIA") and knows which
// screen you're on; long answers fold; a note when few messages are left today; "My
// briefing" for a connected wallet; ask by voice; a photocard book and a fan card to share;
// letters ranked by hearts this week; rare cards shine.
(function () {
  "use strict";
  var panel = document.getElementById("bp-panel-arcia");
  if (!panel) return;
  // on pages other than ArcPad (arc-arcia-fab.js) she lives in a hidden host and only opens as the drawer
  var HOST = panel.getAttribute("data-host") === "float";
  var X = "https://x.com/ARCIAonArc";
  var CA = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  var BUY = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_BUY_URL) || "https://argus.world/token/" + CA;
  var tr = function (s) { return (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s; };
  var lang = function () { return (window.arcI18n && window.arcI18n.get()) || "en"; };
  var T = function (o) { return o[lang()] || o.en; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var F = window.arcFmt || {};
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;
  var ss = {
    get: function (k, d) { try { var v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  var KEY = "arcia-chat-v1";
  var sfx = function (k) { if (typeof window.arcSound === "function") window.arcSound(k); };

  // ---------------- words ----------------
  var GREET = {
    en: "Hi~ I'm ARCIA, the virtual idol of $ARCIRCLE 💙💚 So happy you came to see me! Ask me anything about $ARCIRCLE, CirclePad Round #1, Relay Launch or ArcPad — or just say hi♡",
    ko: "안녕하세요~ $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚 만나러 와줘서 정말 기뻐요! $ARCIRCLE, CirclePad 라운드 #1, 릴레이 런칭, ArcPad 뭐든 물어보거나 그냥 인사해줘도 좋아요♡",
    zh: "你好~ 我是 $ARCIRCLE 的虚拟偶像 ARCIA 💙💚 很开心你来看我！关于 $ARCIRCLE、CirclePad 第 1 轮、接力发币或 ArcPad，尽管问我，或者只是打个招呼也好♡",
  };
  var GREET_NAME = {
    en: "Welcome back, {n}~♡ I missed you! What shall we talk about today?",
    ko: "{n}님, 다시 와줬네요~♡ 보고 싶었어요! 오늘은 무슨 얘기 할까요?",
    zh: "{n}，欢迎回来~♡ 好想你！今天想聊什么？",
  };
  var SUGG = {
    en: ["I'm your fan!", "Who are you?", "What is $ARCIRCLE?", "When does Round #1 close?", "What is Relay Launch?", "How do I buy $ARCIRCLE?", "What's the contract?", "How does the Locker work?"],
    ko: ["ARCIA 팬이에요!", "너는 누구야?", "$ARCIRCLE이 뭐야?", "라운드 #1 언제 마감돼?", "릴레이 런칭이 뭐야?", "$ARCIRCLE 어떻게 사?", "컨트랙트 주소 알려줘", "락커는 어떻게 써?"],
    zh: ["我是你的粉丝！", "你是谁？", "什么是 $ARCIRCLE？", "第 1 轮什么时候截止？", "什么是接力发币？", "怎么买 $ARCIRCLE？", "合约地址是什么？", "Locker 怎么用？"],
  };
  // follow-up chips by what was just talked about
  var NEXT = {
    round: { en: ["How do I join Round #1?", "What is burn-to-vote?", "Can I withdraw before the close?", "What happens at the close?"], ko: ["라운드 #1 어떻게 참여해?", "소각 투표가 뭐야?", "마감 전에 인출할 수 있어?", "마감되면 어떻게 돼?"], zh: ["怎么参加第 1 轮？", "什么是销毁投票？", "截止前可以撤回吗？", "截止后会怎样？"] },
    relay: { en: ["How much do I need to hold?", "When is the snapshot?", "Check my wallet", "What is N1, N2, N3?"], ko: ["얼마나 들고 있어야 해?", "스냅샷은 언제야?", "내 지갑 확인하고 싶어", "N1, N2, N3가 뭐야?"], zh: ["需要持有多少？", "快照是什么时候？", "查看我的钱包", "N1、N2、N3 是什么？"] },
    buy: { en: ["What's the contract?", "How do I bridge USDC to Arc?", "What are the fees?", "What are the risks?"], ko: ["컨트랙트 주소 알려줘", "Arc로 USDC 브릿지는 어떻게 해?", "수수료는 얼마야?", "위험 요소는 뭐야?"], zh: ["合约地址是什么？", "怎么把 USDC 跨链到 Arc？", "手续费是多少？", "有哪些风险？"] },
    price: { en: ["How many holders are there?", "How much has been burned?", "Where do the fees go?", "How do I buy $ARCIRCLE?"], ko: ["홀더는 몇 명이야?", "얼마나 소각됐어?", "수수료는 어디로 가?", "$ARCIRCLE 어떻게 사?"], zh: ["有多少持有人？", "销毁了多少？", "手续费去哪里？", "怎么买 $ARCIRCLE？"] },
    ca: { en: ["How do I buy $ARCIRCLE?", "Is the liquidity locked?", "Is there a team allocation?", "What is $ARCIRCLE?"], ko: ["$ARCIRCLE 어떻게 사?", "유동성은 잠겨 있어?", "팀 물량이 있어?", "$ARCIRCLE이 뭐야?"], zh: ["怎么买 $ARCIRCLE？", "流动性锁定了吗？", "有团队份额吗？", "什么是 $ARCIRCLE？"] },
    util: { en: ["How does the Locker work?", "What does the Token Scanner do?", "How do I bridge USDC?", "What is Snapshot?"], ko: ["락커는 어떻게 써?", "토큰 스캐너는 뭘 해?", "USDC 브릿지는 어떻게 해?", "스냅샷은 뭐야?"], zh: ["Locker 怎么用？", "Token Scanner 能做什么？", "怎么跨链 USDC？", "什么是 Snapshot？"] },
    arcpad: { en: ["How much does a launch cost?", "Who gets the trading fee?", "Is liquidity locked forever?", "What is CirclePad?"], ko: ["런칭 비용은 얼마야?", "거래 수수료는 누가 받아?", "유동성은 영원히 잠겨?", "CirclePad는 뭐야?"], zh: ["发币要多少钱？", "交易手续费归谁？", "流动性永久锁定吗？", "什么是 CirclePad？"] },
    fan: { en: ["How tall are you?", "What's your favorite thing?", "Where do you live?", "Sing me something~"], ko: ["키가 몇이야?", "제일 좋아하는 게 뭐야?", "어디 살아?", "노래 한 소절 불러줘~"], zh: ["你多高？", "你最喜欢什么？", "你住在哪里？", "给我唱一句吧~"] },
  };
  var THINK = {
    en: ["ARCIA is typing…", "Checking the numbers on Arc…", "Flipping through the whitepaper…", "Picking the right words~", "Almost there♡"],
    ko: ["ARCIA가 입력 중…", "Arc에서 숫자 확인하는 중…", "백서 뒤적이는 중…", "예쁜 말 고르는 중~", "거의 다 됐어요♡"],
    zh: ["ARCIA 正在输入…", "正在查看 Arc 上的数据…", "正在翻白皮书…", "正在挑选合适的话~", "马上就好♡"],
  };
  var OOPS = {
    net: { en: "Oh no, my signal dropped for a second~ Could you send that again?♡", ko: "앗, 잠깐 신호가 끊겼어요~ 한 번만 다시 보내 줄래요?♡", zh: "啊，信号刚刚断了一下~ 能再发一次吗？♡" },
    busy: { en: "Wait wait~ you're talking so fast my heart can't keep up♡ Give me a minute!", ko: "잠깐만요~ 너무 빨라서 제 심장이 못 따라가요♡ 1분만요!", zh: "等一下~ 你说得太快啦♡ 给我一分钟！" },
  };
  var CHEER = {
    en: ["Today's the day your green candle shows up — I believe it♡", "Drink some water and stretch a little, okay? I'm cheering for you~", "Every small step counts. I'm proud of you today♡", "Don't forget: you're somebody's favorite. Mine included~", "Big launches start with small circles. Let's grow ours together♡", "Rest when you need to. The chain will still be here, and so will I~", "You showed up again today — that's what real fans do♡"],
    ko: ["오늘은 당신에게 초록 캔들이 뜨는 날이에요, 저는 믿어요♡", "물 한 잔 마시고 기지개 한 번 켜요~ 제가 응원하고 있어요!", "작은 한 걸음도 다 의미 있어요. 오늘도 멋져요♡", "잊지 마요, 당신은 누군가의 최애예요. 저한테도요~", "큰 런칭도 작은 원에서 시작해요. 우리 원도 같이 키워가요♡", "힘들면 쉬어도 돼요. 체인도 저도 여기 그대로 있을게요~", "오늘도 와줬네요. 이게 진짜 팬이죠♡"],
    zh: ["今天就是你的绿色 K 线出现的日子，我相信♡", "喝点水，伸个懒腰吧~ 我在为你加油！", "每一小步都算数。今天的你也很棒♡", "别忘了，你是某人的最爱，包括我~", "大发射都从小圈子开始。一起把我们的圈子做大♡", "累了就休息吧。链还在，我也在~", "今天你又来了，这才是真粉丝♡"],
  };
  var STREAK_MSG = {
    en: "Day {n} in a row~♡ {c}", ko: "{n}일 연속 출석이에요~♡ {c}", zh: "连续第 {n} 天签到~♡ {c}",
  };
  var HOLDER_MSG = {
    en: "Oh! I can see you're holding {b} $ARCIRCLE — a real Relay holder~♡ Thank you for believing in ARCIRCLE with me. Every relay is coming your way!",
    ko: "앗! $ARCIRCLE을 {b}개나 들고 있네요 — 진짜 릴레이 홀더예요~♡ ARCIRCLE을 같이 믿어줘서 고마워요. 모든 릴레이가 당신한테 갈 거예요!",
    zh: "哇！你持有 {b} 枚 $ARCIRCLE —— 真正的接力持有人~♡ 谢谢你和我一起相信 ARCIRCLE，每一次接力都会送到你那里！",
  };
  var NAME_MSG = { en: "{n}~ what a lovely name♡ I'll remember it!", ko: "{n}! 이름 너무 예쁘다~♡ 꼭 기억할게요!", zh: "{n}~ 好可爱的名字♡ 我会记住的！" };

  var TABS = {
    live: { en: "Live", ko: "실시간", zh: "实时" }, x: { en: "On X", ko: "X 활동", zh: "X 动态" }, letters: { en: "Letters", ko: "팬레터", zh: "粉丝信" },
    quiz: { en: "Quiz", ko: "퀴즈", zh: "测验" }, cards: { en: "Cards", ko: "포토카드", zh: "小卡" }, profile: { en: "Profile", ko: "프로필", zh: "资料" },
  };
  var ICON = {
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12 19.5 4.5 15 19.5l-3.4-6.1z"/><path d="M11.6 13.4 19.5 4.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.5 3.5h3l-6.6 7.5 7.8 9.5h-6.1l-4.8-5.9-5.5 5.9H2.3l7.1-8L1.9 3.5h6.2l4.3 5.4zm-1.1 15.3h1.7L7.5 5.1H5.7z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><circle cx="12" cy="10" r="3"/><path d="M8.5 17h7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  var booted = false, log, form, input, sendBtn, chat, busy = false, msgs = [], LIVE = null, ME = null;
  var drawer = null, home = null; // the chat moves into a drawer over other pages, then back
  // parts of the chat are looked up in the chat itself, wherever it is (page or drawer)
  var Q = function (sel) { return (chat && chat.querySelector(sel)) || panel.querySelector(sel); };
  var BRIEF = { en: "My briefing", ko: "내 브리핑", zh: "我的简报" };

  // ---------------- small helpers ----------------
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
    s = s.replace(/0x[0-9a-fA-F]{40}/g, function (a) { return '<code class="aa-addr">' + a + "</code>"; });
    return s.replace(/\n/g, "<br>");
  }
  var hhmm = function (t) { try { return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  var dayStr = function (d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var fmtBal = function (v) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); };
  var account = function () { try { return typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : null; } catch (e) { return null; } };
  function copyText(t, btn) {
    var done = function () { if (!btn) return; btn.classList.add("ok"); var o = btn.getAttribute("data-label"); if (o != null) btn.lastChild.textContent = tr("Copied"); setTimeout(function () { btn.classList.remove("ok"); if (o != null) btn.lastChild.textContent = o; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () {});
    else { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { /* no clipboard */ } ta.remove(); }
  }
  function toast(text) {
    var el = panel.querySelector(".aa-toast");
    if (!el) { el = document.createElement("div"); el.className = "aa-toast"; el.setAttribute("role", "status"); panel.querySelector(".aa").appendChild(el); }
    el.textContent = text; el.classList.add("on");
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove("on"); }, 2600);
  }

  // what a message is about: picks the follow-up chips and the card under her reply
  function topic(s) {
    s = String(s || "").toLowerCase();
    if (/contract|\bca\b|address|컨트랙트|주소|合约/.test(s)) return "ca";
    if (/relay|릴레이|接力|snapshot|스냅샷|快照/.test(s)) return "relay";
    if (/round|circlepad|deadline|close|raise|burn-to-vote|라운드|마감|모금|서클패드|第 ?1 ?轮|截止/.test(s)) return "round";
    if (/\bbuy\b|how to get|purchase|swap|사\?|어떻게 사|구매|매수|怎么买|购买/.test(s)) return "buy";
    if (/price|mcap|market cap|holders|chart|가격|시총|홀더|价格|市值/.test(s)) return "price";
    if (/locker|scanner|multisend|bridge|utilit|tool|liquidity|락커|스캐너|멀티센더|브릿지|유틸|유동성|工具/.test(s)) return "util";
    if (/arcpad|launch a coin|런칭|발행|发币/.test(s)) return "arcpad";
    if (/fan|love|pretty|cute|tall|height|birthday|age|favorite|팬|사랑|예뻐|이뻐|귀여|키|생일|나이|좋아하|粉丝|喜欢|可爱/.test(s)) return "fan";
    return null;
  }

  // ---------------- the chat ----------------
  function actions(role) {
    if (role === "user") return "";
    var voice = "speechSynthesis" in window ? '<button type="button" data-a="voice" aria-label="Listen" title="Listen">' + ICON.voice + "</button>" : "";
    return '<span class="aa-acts"><button type="button" data-a="heart" aria-label="Heart this" title="Heart">' + ICON.heart + "</button>" + voice +
      '<button type="button" data-a="card" aria-label="Make a photocard" title="Photocard">' + ICON.card + '</button><button type="button" data-a="copy" aria-label="Copy" title="Copy">' + ICON.copy + "</button></span>";
  }
  function bubble(role, text, opts) {
    opts = opts || {};
    var li = document.createElement("li");
    var prev = log.lastElementChild;
    while (prev && prev.classList.contains("aa-typing")) prev = prev.previousElementSibling;
    var cont = prev && prev.classList.contains(role === "user" ? "me" : "her");
    li.className = "aa-m " + (role === "user" ? "me" : "her") + (cont ? " cont" : "") + (opts.liked ? " liked" : "") + (opts.cls ? " " + opts.cls : "");
    if (opts.i != null) li.setAttribute("data-i", opts.i);
    li.innerHTML = (role === "user" ? "" : '<img class="aa-m-av" src="/images/arcia-avatar-96.jpg" alt="" width="34" height="34">') +
      '<div class="aa-mc"><div class="aa-b" data-no-i18n></div><div class="aa-meta">' + (role === "user" ? "" : "<b>ARCIA</b>") +
      "<time data-no-i18n>" + esc(hhmm(opts.t || Date.now())) + "</time>" + actions(role) + '</div><i class="aa-pop" aria-hidden="true">' + ICON.heart + "</i></div>";
    var typing = log.querySelector(".aa-typing");
    if (typing) log.insertBefore(li, typing); else log.appendChild(li);
    var b = li.querySelector(".aa-b");
    li._text = text;
    if (opts.type && !reduce) typeIn(b, text, opts.done); else { b.innerHTML = linkify(text); if (opts.done) opts.done(); }
    scroll();
    return li;
  }
  function typeIn(el, text, done) {
    var i = 0, step = Math.max(2, Math.round(text.length / 90));
    speaking(true);
    (function tick() {
      i = Math.min(text.length, i + step);
      el.innerHTML = linkify(text.slice(0, i)) + (i < text.length ? '<i class="aa-caret"></i>' : "");
      scroll();
      if (i < text.length) setTimeout(tick, 16); else { speaking(false); if (done) done(); }
    })();
  }
  var stick = true;
  function scroll() { if (stick) log.scrollTop = log.scrollHeight; }
  var thinkT = null;
  function typing(on) {
    var t = log.querySelector(".aa-typing");
    clearInterval(thinkT);
    if (on && !t) {
      t = document.createElement("li");
      t.className = "aa-m her aa-typing";
      t.innerHTML = '<img class="aa-m-av" src="/images/arcia-avatar-96.jpg" alt="" width="34" height="34"><div class="aa-mc"><div class="aa-b"><span></span><span></span><span></span></div><small class="aa-think" data-no-i18n></small></div>';
      log.appendChild(t); stick = true; scroll();
      var k = 0, words = T(THINK), sm = t.querySelector(".aa-think");
      sm.textContent = words[0];
      thinkT = setInterval(function () { k = (k + 1) % words.length; sm.classList.remove("in"); void sm.offsetWidth; sm.textContent = words[k]; sm.classList.add("in"); }, 1700);
    } else if (!on && t) t.remove();
  }
  function speaking(on) { root.classList.toggle("aa-speaking", !!on); }
  // a reply just landed: her portrait tilts and glows for a moment
  var gotT = 0;
  function got() { if (reduce) return; root.classList.remove("aa-got"); void root.offsetWidth; root.classList.add("aa-got"); clearTimeout(gotT); gotT = setTimeout(function () { root.classList.remove("aa-got"); }, 1100); }

  // name: "my name is …", "call me …", "내 이름은 …", "…라고 불러", "我叫…"
  function sniffName(text) {
    var m = text.match(/\b(?:my name is|call me|i'?m called)\s+([A-Za-zÀ-ɏ][\wÀ-ɏ'-]{0,19})/i) ||
      text.match(/(?:내 ?이름은|제 ?이름은)\s*([^\s,.!?~]{1,12}?)(?:이야|예요|에요|이에요|입니다|야|라고|이라고)?(?=$|[\s,.!?~])/) ||
      text.match(/([가-힣A-Za-z]{1,10}?)(?:이?라고|으?로) ?불러/) ||
      text.match(/我叫\s*([^\s，。！？,.!?]{1,10})/);
    if (!m) return null;
    var n = m[1].replace(/[^\wÀ-ɏ가-힣一-鿿'-]/g, "").slice(0, 20);
    if (!n || /^(your|a|an|the|fan|arcia|너|저|나)$/i.test(n)) return null;
    return n;
  }

  function payload() {
    var name = ls.get("arcia-name", "");
    return { messages: msgs.slice(-12).map(function (m) { return { role: m.role, content: m.content }; }), lang: lang(), name: name || undefined, wallet: account() || undefined, page: pageCtx() };
  }
  // which ArcPad screen the fan is on (the drawer opens over any of them)
  function pageCtx() {
    var h = location.hash.replace(/^#/, "");
    var tab = drawer && !drawer.hidden ? (h.split(/[?/]/)[0] || "home") : "arcia";
    if (HOST) { var p = location.pathname.replace(/^\/+|\/+$/g, "").split("/"); tab = { "": "site", circle: "circlepad", round: "circlepad", "whitepaper": "whitepaper" }[p[0]] || p[0] || "site"; }
    var m = /(?:[?&](?:t|token)=|coin\/)(0x[0-9a-fA-F]{40})/.exec(h);
    return { tab: tab, token: m ? m[1] : undefined };
  }
  // one question → { text, mode, live, me, error }. Streams (NDJSON) when the server does; onText gets the text so far.
  function ask(onText) {
    return fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign(payload(), { stream: true })) }).then(function (r) {
      var ct = r.headers.get("content-type") || "";
      if (ct.indexOf("ndjson") < 0 || !r.body || !r.body.getReader) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { text: j.reply || "", mode: j.mode, live: j.live, me: j.me, left: j.left, error: !r.ok ? j.error || "net" : null, status: r.status }; });
      }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", out = { text: "" };
      function handle(line) {
        if (!line.trim()) return;
        var j; try { j = JSON.parse(line); } catch (e) { return; }
        if (j.type === "meta") { out.mode = j.mode; out.live = j.live; out.me = j.me; out.left = j.left; }
        else if (j.type === "d") { out.text += j.t; onText(out.text); }
      }
      return (function pump() {
        return reader.read().then(function (x) {
          if (x.done) { handle(buf); return out; }
          buf += dec.decode(x.value, { stream: true });
          var i;
          while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
          return pump();
        });
      })();
    });
  }

  function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    if (text === T(BRIEF)) { briefing(); return; }
    if (/^(check my wallet|내 지갑 확인하고 싶어|查看我的钱包)$/i.test(text)) { location.href = "/me" + (account() ? "?w=" + account() : ""); return; }
    busy = true; sendBtn.disabled = true;
    var now = Date.now();
    msgs.push({ role: "user", content: text.slice(0, 700), t: now });
    ss.set(KEY, msgs.slice(-30));
    bubble("user", text, { t: now });
    input.value = ""; grow();
    sfx("tap");
    var nm = sniffName(text);
    if (nm && nm !== ls.get("arcia-name", "")) { ls.set("arcia-name", nm); paintFan(); }
    typing(true);
    var t0 = Date.now(), li = null, raf = 0, latest = "";
    var draw = function () { raf = 0; if (!li) return; li.querySelector(".aa-b").innerHTML = linkify(latest) + '<i class="aa-caret"></i>'; scroll(); };
    ask(function (so) {
      latest = so;
      if (!li) { typing(false); li = bubble("assistant", "", { t: Date.now() }); speaking(true); sfx("tap"); }
      if (!raf) raf = requestAnimationFrame(draw);
    }).then(function (res) {
      var wait = li ? 0 : Math.max(0, 600 - (Date.now() - t0));
      setTimeout(function () {
        typing(false);
        if (res.live) paintLive(res.live);
        if (res.me) setMe(res.me);
        paintLeft(res.left);
        var reply = res.text;
        if (!reply) {
          if (li) li.remove();
          bubble("assistant", res.error && res.error !== "net" ? res.error : T(res.status === 429 ? OOPS.busy : OOPS.net), { cls: "note" });
          return;
        }
        var i = msgs.push({ role: "assistant", content: reply, t: Date.now() }) - 1;
        ss.set(KEY, msgs.slice(-30));
        var finish = function (el) {
          got();
          el.setAttribute("data-i", i);
          el._text = reply;
          speaking(false);
          sfx("milestone");
          react(el, text, reply);
          richCard(el, topic(text) || topic(reply));
          chips(topic(text) || topic(reply));
          fold(el, reply);
          if (ls.get("arcia-voice", false)) speak(reply, el);
        };
        if (li) { cancelAnimationFrame(raf); li.querySelector(".aa-b").innerHTML = linkify(reply); li._text = reply; finish(li); scroll(); }
        else { var nl = bubble("assistant", reply, { type: true, t: Date.now(), done: function () { finish(nl); } }); }
      }, wait);
    }).catch(function () {
      typing(false); speaking(false);
      if (li) li.remove();
      bubble("assistant", T(OOPS.net), { cls: "note" });
    }).then(function () { setTimeout(function () { busy = false; sendBtn.disabled = false; }, 500); });
  }
  function grow() { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; }
  // long answers fold to their first lines, with "Show more"
  function fold(el, text) {
    if (!el || String(text || "").length < 650 || el.querySelector(".aa-more-t")) return;
    el.classList.add("aa-long");
    var b = document.createElement("button");
    b.type = "button"; b.className = "aa-more-t"; b.textContent = T({ en: "Show more", ko: "더 보기", zh: "展开" });
    b.addEventListener("click", function () {
      var open = el.classList.toggle("aa-open");
      b.textContent = open ? T({ en: "Show less", ko: "접기", zh: "收起" }) : T({ en: "Show more", ko: "더 보기", zh: "展开" });
    });
    el.querySelector(".aa-b").after(b);
  }
  // a quiet note when only a few of today's messages are left
  function paintLeft(n) {
    var el = chat && chat.querySelector(".aa-left");
    if (!el || n == null) return;
    el.hidden = n > 5;
    el.textContent = n > 0 ? T({ en: "{n} messages left today", ko: "오늘 남은 메시지 {n}개", zh: "今天还剩 {n} 条消息" }).replace("{n}", n)
      : T({ en: "That was today's last message — see you tomorrow", ko: "오늘 마지막 메시지였어요 — 내일 또 만나요", zh: "这是今天最后一条消息 — 明天见" });
  }
  // "My briefing": what's going on with this wallet, read from the chain and this browser (no AI needed)
  function briefing() {
    var a = account();
    if (!a) return;
    busy = true; sendBtn.disabled = true;
    bubble("user", T(BRIEF), { t: Date.now() });
    typing(true);
    var lines = [], jobs = [];
    var fmt0 = function (n) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }); };
    jobs.push(fetch("/api/social?token=arcircle&wallet=" + a).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var w = d && d.wallet;
      if (!w) return;
      lines.push("$ARCIRCLE: " + fmt0(w.balance || 0) + (w.rank ? " · #" + w.rank : "") + (w.heldDays ? " · " + T({ en: "held {d} days", ko: "{d}일째 보유", zh: "已持有 {d} 天" }).replace("{d}", w.heldDays) : ""));
      lines.push((w.balance || 0) >= 100000 ? T({ en: "Relay: you're in the next relay ♡", ko: "릴레이: 다음 릴레이 대상이에요 ♡", zh: "接力：你在下一次接力名单中 ♡" })
        : T({ en: "Relay: {n} more $ARCIRCLE to join the next relay (locked tokens count too)", ko: "릴레이: {n}개 더 있으면 다음 릴레이 대상이에요 (락한 토큰도 인정)", zh: "接力：再持有 {n} 个 $ARCIRCLE 即可加入下一次接力（锁定的也算）" }).replace("{n}", fmt0(100000 - (w.balance || 0))));
    }).catch(function () {}));
    if (typeof ethers !== "undefined" && typeof readProvider === "function" && typeof CONFIG !== "undefined" && CONFIG.ARCLOCK_ADDRESS) {
      jobs.push((function () {
        var c = new ethers.Contract(CONFIG.ARCLOCK_ADDRESS, ["function lockIdsOfOwner(address) view returns (uint256[])", "function getLock(uint256) view returns (tuple(address token, address owner, uint128 amount, uint64 lockedAt, uint64 unlockAt, bool withdrawn))"], readProvider());
        return c.lockIdsOfOwner(a).then(function (ids) {
          return Promise.all(ids.slice(-20).map(function (id) { return c.getLock(id).then(function (l) { return { id: Number(id), l: l }; }); }));
        }).then(function (rows) {
          var now = Date.now() / 1000, act = rows.filter(function (r) { return !r.l.withdrawn; });
          if (!act.length) return;
          var ready = act.filter(function (r) { return Number(r.l.unlockAt) <= now; });
          var next = act.filter(function (r) { return Number(r.l.unlockAt) > now; }).sort(function (x, y) { return Number(x.l.unlockAt) - Number(y.l.unlockAt); })[0];
          if (ready.length) lines.push(T({ en: "Locker: {n} lock(s) ready to withdraw — arcircle.app/arc#locker", ko: "락커: 출금 가능한 락 {n}개 — arcircle.app/arc#locker", zh: "Locker：{n} 个锁定可以提取 — arcircle.app/arc#locker" }).replace("{n}", ready.length));
          if (next) {
            var d = Math.ceil((Number(next.l.unlockAt) - now) / 86400);
            lines.push(T({ en: "Locker: next unlock in {d} days (lock #{id})", ko: "락커: 다음 해제까지 {d}일 (락 #{id})", zh: "Locker：距下次解锁 {d} 天（锁定 #{id}）" }).replace("{d}", d).replace("{id}", next.id));
          }
        });
      })().catch(function () {}));
    }
    Promise.all(jobs).then(function () {
      var br = ls.get("arcircle.bridge.v1", null) || [], sc = ls.get("arcircle.scanner.v1", null) || [];
      var on = br.filter(function (r) { return !r.delivered && r.stage !== "failed"; });
      if (on.length) lines.push(T({ en: "Bridge: {n} transfer(s) on the way — arcircle.app/arc#bridge", ko: "브리지: 이동 중인 전송 {n}건 — arcircle.app/arc#bridge", zh: "Bridge：{n} 笔转账在途中 — arcircle.app/arc#bridge" }).replace("{n}", on.length));
      if (sc[0]) lines.push(T({ en: "Last scan: ${s} — {sc}/100", ko: "최근 스캔: ${s} — {sc}/100", zh: "最近扫描：${s} — {sc}/100" }).replace("{s}", sc[0].s || "?").replace("{sc}", sc[0].sc));
      typing(false);
      var head = T({ en: "Here's your briefing~♡", ko: "브리핑 준비했어요~♡", zh: "你的简报来啦~♡" });
      var body = lines.length ? lines.map(function (l) { return "• " + l; }).join("\n")
        : T({ en: "I couldn't read your wallet right now — try again in a moment♡", ko: "지금은 지갑을 읽을 수 없어요 — 잠시 후 다시 해줘요♡", zh: "现在读不到你的钱包 — 稍后再试♡" });
      var li = bubble("assistant", head + "\n\n" + body, { type: true, cls: "brief", t: Date.now() });
      fx(li, "sparkle");
      busy = false; sendBtn.disabled = false;
    });
  }
  // ask by voice (where the browser can listen)
  function micSetup() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !form || form.querySelector(".aa-mic")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "aa-mic"; b.setAttribute("aria-label", T({ en: "Ask by voice", ko: "음성으로 묻기", zh: "语音提问" }));
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>';
    form.insertBefore(b, sendBtn);
    var rec = null;
    b.addEventListener("click", function () {
      if (rec) { try { rec.stop(); } catch (e) { /* stopped */ } return; }
      try { rec = new SR(); } catch (e) { return; }
      rec.lang = lang() === "ko" ? "ko-KR" : lang() === "zh" ? "zh-CN" : "en-US";
      rec.interimResults = true; rec.maxAlternatives = 1;
      b.classList.add("on");
      rec.onresult = function (ev) {
        var t = "";
        for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        input.value = t; grow();
        if (ev.results[ev.results.length - 1].isFinal) { try { rec.stop(); } catch (e) { /* ok */ } send(t); }
      };
      rec.onend = rec.onerror = function () { b.classList.remove("on"); rec = null; };
      try { rec.start(); } catch (e) { b.classList.remove("on"); rec = null; }
    });
  }

  function chips(tp) {
    var box = Q(".aa-sugg");
    var list = tp && NEXT[tp] ? T(NEXT[tp]) : T(SUGG);
    if (account()) list = [T(BRIEF)].concat(list.filter(function (q) { return q !== T(BRIEF); }));
    box.innerHTML = list.map(function (q) { return '<button type="button" data-no-i18n>' + esc(q) + "</button>"; }).join("");
    box.scrollLeft = 0;
    if (tp && !reduce) { box.classList.remove("fresh"); void box.offsetWidth; box.classList.add("fresh"); }
  }
  function greet() {
    var n = ls.get("arcia-name", "");
    bubble("assistant", n && ls.get("arcia-streak", null) ? T(GREET_NAME).replace("{n}", n) : T(GREET));
  }
  function restart() {
    msgs = []; ss.set(KEY, msgs);
    log.innerHTML = "";
    greet(); chips();
  }

  // ---------------- reactions: hearts, confetti, sparkle, glow ----------------
  function fx(li, kind) {
    if (reduce || !li) return;
    var box = document.createElement("span");
    box.className = "aa-fx aa-fx-" + kind;
    box.setAttribute("aria-hidden", "true");
    var n = kind === "confetti" ? 18 : kind === "sparkle" ? 8 : 6;
    var COL = ["#4d7dff", "#35d8d0", "#39ff88", "#ffc861", "#ff8fc8"];
    for (var i = 0; i < n; i++) {
      var h = document.createElement("i");
      if (kind === "hearts") h.innerHTML = ICON.heart;
      else if (kind === "sparkle") h.textContent = "✦";
      h.style.setProperty("--x", (Math.random() * (kind === "confetti" ? 260 : 130) - (kind === "confetti" ? 130 : 20)).toFixed(0) + "px");
      h.style.setProperty("--y", (-(60 + Math.random() * 90)).toFixed(0) + "px");
      h.style.setProperty("--d", (i * (kind === "confetti" ? 0.02 : 0.1)).toFixed(2) + "s");
      h.style.setProperty("--r", (Math.random() * 360 - 180).toFixed(0) + "deg");
      h.style.setProperty("--c", COL[i % COL.length]);
      box.appendChild(h);
    }
    (li.classList.contains("aa-m") ? li.querySelector(".aa-mc") : li).appendChild(box);
    setTimeout(function () { box.remove(); }, 2600);
  }
  function react(li, q, reply) {
    var s = (q + " " + reply).toLowerCase();
    if (/congrat|celebrat|\byay\b|woohoo|축하|대박|만세|🎉|恭喜/.test(s)) fx(li, "confetti");
    else if (/pretty|cute|beautiful|gorgeous|예뻐|예쁘|이뻐|이쁘|귀여|미모|漂亮|可爱|✨/.test(q.toLowerCase())) fx(li, "sparkle");
    else if (/♡|♥|💙|💚|love|사랑|좋아해|喜欢/.test(s)) fx(li, "hearts");
    if (/\b(sad|tired|lonely|exhausted|rekt)\b|힘들|슬퍼|슬프|피곤|우울|외로|지쳤|难过|累/.test(q.toLowerCase())) { li.classList.add("comfort"); }
  }
  function toggleHeart(li) {
    var on = !li.classList.contains("liked");
    li.classList.toggle("liked", on);
    var i = li.getAttribute("data-i");
    if (i != null && msgs[i]) { msgs[i].liked = on; ss.set(KEY, msgs.slice(-30)); }
    if (on) { var p = li.querySelector(".aa-pop"); p.classList.remove("go"); void p.offsetWidth; p.classList.add("go"); if (typeof window.arcHaptic === "function") window.arcHaptic("tap"); cheer(1); }
  }

  // ---------------- cards under her replies ----------------
  function richCard(li, tp) {
    var L = LIVE || {}, R = L.round || {}, html = "";
    if (tp === "ca") html = '<div class="aa-rc"><span class="aa-rc-k">$ARCIRCLE · Arc</span><code data-no-i18n>' + CA + '</code><div class="aa-rc-row"><button type="button" class="aa-rc-btn" data-copy="' + CA + '" data-label="Copy address">' + ICON.copy + '<span>Copy address</span></button><a class="aa-rc-btn ghost" href="/arcircle">Verify on the token page</a></div></div>';
    else if (tp === "round") html = '<div class="aa-rc aa-rc-round"><span class="aa-rc-k">CirclePad Round #1</span><div class="aa-rc-big" data-no-i18n>' + (R.raised != null ? Number(R.raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC" : "—") + '</div><span class="aa-rc-sub">' + (deadline() > nowS() ? '<span class="aa-clock" data-no-i18n>—</span>' : esc(tr("Closed"))) + '</span><div class="aa-rc-row">' + (deadline() > nowS() ? '<a class="aa-rc-btn" href="/circle">Join Round #1</a><button type="button" class="aa-rc-btn ghost" data-ics="1">' + ICON.cal + "<span>Add to calendar</span></button>" : '<a class="aa-rc-btn" href="/circle/round/1">See the result</a>') + "</div></div>";
    else if (tp === "price") html = '<div class="aa-rc"><span class="aa-rc-k">$ARCIRCLE now</span><div class="aa-rc-big" data-no-i18n>' + (L.price != null ? (F.price ? F.price(L.price) : "$" + L.price) : "—") + (L.change24h != null ? ' <em class="' + (L.change24h >= 0 ? "up" : "down") + '">' + (L.change24h >= 0 ? "+" : "") + L.change24h.toFixed(2) + "%</em>" : "") + '</div><span class="aa-rc-sub" data-no-i18n>' + (L.holders != null ? Number(L.holders).toLocaleString("en-US") + " holders" : "") + '</span><div class="aa-rc-row"><a class="aa-rc-btn ghost" href="/stats">All live stats</a></div></div>';
    else if (tp === "buy") html = '<div class="aa-rc"><span class="aa-rc-k">Get $ARCIRCLE</span><div class="aa-rc-row"><a class="aa-rc-btn" href="' + esc(BUY) + '" target="_blank" rel="noopener">Buy on Argus</a><a class="aa-rc-btn ghost" href="/start">Get USDC on Arc</a></div><span class="aa-rc-sub">Check the contract first. Crypto is risky — only use what you can afford to lose.</span></div>';
    else if (tp === "relay") html = '<div class="aa-rc"><span class="aa-rc-k">Relay Launch</span><span class="aa-rc-sub">Hold 100,000+ $ARCIRCLE at the snapshot to receive every relay.</span><div class="aa-rc-row"><a class="aa-rc-btn" href="/relay">Open Relay Launch</a><a class="aa-rc-btn ghost" href="/me">Check my wallet</a></div></div>';
    else if (tp === "util") html = '<div class="aa-rc"><span class="aa-rc-k">Free utilities</span><div class="aa-rc-tags">' + [["Locker", "/arc#locker"], ["Token Scanner", "/arc#scanner"], ["Multisender", "/arc#multisend"], ["Bridge", "/arc#bridge"], ["Snapshot", "/arc#snapshot"], ["Liquidity", "/arc#liquidity"], ["Relay Launch", "/arc#relay"]].map(function (u) { return '<a href="' + u[1] + '">' + esc(u[0]) + "</a>"; }).join("") + "</div></div>";
    else if (tp === "arcpad") html = '<div class="aa-rc"><span class="aa-rc-k">ArcPad</span><span class="aa-rc-sub">1 USDC to launch · Uniswap v4 pool from block one · liquidity locked forever</span><div class="aa-rc-row"><a class="aa-rc-btn" href="/arc">Open ArcPad</a></div></div>';
    if (!html) return;
    li.querySelector(".aa-mc").insertAdjacentHTML("beforeend", html);
    clock(); scroll();
  }

  // ---------------- voice ----------------
  var voices = [];
  function loadVoices() { try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; } }
  function speak(text, li) {
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      var clean = String(text).replace(/https?:\/\/\S+|\b\S+\.(app|com|me|world)\/\S*/g, "").replace(/0x[0-9a-fA-F]{40}/g, "").replace(/[♡♥✨☀✦]|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "").replace(/~+/g, "!").replace(/\s+/g, " ").trim();
      if (!clean) return;
      var u = new SpeechSynthesisUtterance(clean);
      var code = /[가-힣]/.test(clean) ? "ko" : /[一-鿿]/.test(clean) ? "zh" : "en";
      u.lang = { ko: "ko-KR", zh: "zh-CN", en: "en-US" }[code];
      if (!voices.length) loadVoices();
      var mine = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(code) === 0; });
      u.voice = mine.filter(function (v) { return /female|woman|samantha|victoria|karen|zira|aria|jenny|yuna|sora|heami|sunhi|xiaoxiao|ting-?ting|mei-?jia|google/i.test(v.name); })[0] || mine[0] || null;
      u.pitch = 1.25; u.rate = code === "en" ? 1.02 : 1.05;
      u.onstart = function () { speaking(true); if (li) li.classList.add("talking"); };
      u.onend = u.onerror = function () { speaking(false); if (li) li.classList.remove("talking"); };
      speechSynthesis.speak(u);
    } catch (e) { /* no voice */ }
  }

  // ---------------- photocard ----------------
  function wrapLines(ctx, text, max, maxLines) {
    var words = text.split(/(\s+)/), lines = [], cur = "";
    var push = function (w) {
      if (ctx.measureText(cur + w).width <= max) { cur += w; return; }
      if (cur.trim()) lines.push(cur.trim());
      cur = "";
      if (ctx.measureText(w).width > max) { for (var k = 0; k < w.length; k++) { if (ctx.measureText(cur + w[k]).width > max) { lines.push(cur); cur = ""; } cur += w[k]; } }
      else cur = w.replace(/^\s+/, "");
    };
    words.forEach(function (w) { if (w) push(w); });
    if (cur.trim()) lines.push(cur.trim());
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, "") + "…"; }
    return lines;
  }
  // photocards come in three rarities: common (75%), rare (20%), secret (5%)
  var RARITY = {
    common: { label: { en: "Common card", ko: "일반 카드", zh: "普通卡" }, stops: ["#3f7bff", "#35d8d0", "#39ff88"] },
    rare: { label: { en: "Rare card!", ko: "레어 카드!", zh: "稀有卡！" }, stops: ["#fff1c1", "#ffc861", "#ff9f3d", "#ffe29a"] },
    secret: { label: { en: "Secret card!!", ko: "시크릿 카드!!", zh: "隐藏卡！！" }, stops: ["#ff8fc8", "#b58bff", "#4d7dff", "#35d8d0", "#39ff88", "#ffe29a", "#ff8fc8"] },
  };
  function star(x, cx, cy, r) {
    x.beginPath();
    x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r);
    x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r); x.fill();
  }
  function photocard(text) {
    var roll = Math.random(), rar = roll < 0.05 ? "secret" : roll < 0.25 ? "rare" : "common", R = RARITY[rar];
    var serial = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
    var img = new Image();
    img.onload = function () {
      var W = 1080, H = 1350, c = document.createElement("canvas");
      c.width = W; c.height = H;
      var x = c.getContext("2d");
      var grad = function (x0, y0, x1, y1) { var g = x.createLinearGradient(x0, y0, x1, y1); R.stops.forEach(function (col, k) { g.addColorStop(k / (R.stops.length - 1), col); }); return g; };
      x.fillStyle = "#070b12"; x.fillRect(0, 0, W, H);
      var s = W / img.width;
      x.drawImage(img, 0, -30, W, img.height * s);
      if (rar === "secret") { // holographic sheen over the photo
        x.save(); x.globalCompositeOperation = "screen"; x.globalAlpha = 0.22; x.fillStyle = grad(0, 0, W, 900); x.fillRect(0, 0, W, 900); x.restore();
      }
      var g = x.createLinearGradient(0, 560, 0, 900);
      g.addColorStop(0, "rgba(7,11,18,0)"); g.addColorStop(1, "rgba(7,11,18,1)");
      x.fillStyle = g; x.fillRect(0, 540, W, 380);
      x.fillStyle = "#070b12"; x.fillRect(0, 900, W, H - 900);
      var edge = grad(0, 0, W, H);
      if (rar === "common") { x.fillStyle = edge; x.fillRect(0, 0, W, 10); x.fillRect(0, H - 10, W, 10); }
      else {
        x.strokeStyle = edge; x.lineWidth = rar === "secret" ? 22 : 16;
        if (x.roundRect) { x.beginPath(); x.roundRect(14, 14, W - 28, H - 28, 34); x.stroke(); } else x.strokeRect(14, 14, W - 28, H - 28);
        x.fillStyle = rar === "secret" ? "#ffffff" : "#ffe29a";
        for (var k = 0; k < (rar === "secret" ? 26 : 14); k++) {
          var side = k % 4, t = Math.random();
          var px = side === 0 ? t * W : side === 1 ? W - 24 - Math.random() * 30 : side === 2 ? t * W : 24 + Math.random() * 30;
          var py = side === 0 ? 24 + Math.random() * 30 : side === 1 ? t * H : side === 2 ? H - 24 - Math.random() * 30 : t * H;
          x.globalAlpha = 0.55 + Math.random() * 0.45; star(x, px, py, 6 + Math.random() * 12);
        }
        x.globalAlpha = 1;
        var tag = rar === "secret" ? "SECRET" : "RARE";
        x.font = "800 30px Sora, 'Segoe UI', sans-serif";
        var tw = x.measureText(tag).width + 48;
        x.fillStyle = edge;
        if (x.roundRect) { x.beginPath(); x.roundRect(W - 60 - tw, 56, tw, 54, 27); x.fill(); } else x.fillRect(W - 60 - tw, 56, tw, 54);
        x.fillStyle = "#1a1206"; x.fillText(tag, W - 60 - tw + 24, 94);
      }
      x.font = "800 92px Sora, 'Segoe UI', sans-serif"; x.fillStyle = edge; x.fillText("ARCIA", 70, 870);
      x.font = "600 30px Sora, 'Segoe UI', sans-serif"; x.fillStyle = "#9fb6d9"; x.fillText("Virtual idol of $ARCIRCLE", 76, 918);
      var clean = String(text).replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
      x.font = "500 40px 'Noto Sans KR', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif";
      var lines = wrapLines(x, "“" + clean + "”", W - 160, 6);
      x.fillStyle = "rgba(255,255,255,.05)"; x.strokeStyle = rar === "common" ? "rgba(91,140,255,.35)" : edge; x.lineWidth = 2;
      var top = 960, bh = lines.length * 56 + 56;
      if (x.roundRect) { x.beginPath(); x.roundRect(56, top, W - 112, bh, 28); x.fill(); x.stroke(); } else x.fillRect(56, top, W - 112, bh);
      x.fillStyle = "#eef3ff";
      lines.forEach(function (l, k2) { x.fillText(l, 84, top + 70 + k2 * 56); });
      x.font = "600 28px Sora, 'Segoe UI', sans-serif"; x.fillStyle = "#8fb6ff";
      x.fillText("@ARCIAonArc · No." + serial, 70, H - 52);
      x.fillStyle = "#7d8aa3"; x.textAlign = "right";
      x.fillText("arcircle.app · " + dayStr(), W - 70, H - 52);
      var col = ls.get("arcia-cards", { common: 0, rare: 0, secret: 0 });
      col[rar] = (col[rar] || 0) + 1; ls.set("arcia-cards", col);
      var book = ls.get("arcia-book", []) || [];
      book.unshift({ r: rar, s: serial, q: String(clean).slice(0, 90), t: Date.now() }); ls.set("arcia-book", book.slice(0, 60));
      paintBook();
      c.toBlob(function (blob) { if (blob) showCard(blob, clean, rar, col); }, "image/png");
    };
    img.src = "/images/arcia-portrait.jpg";
  }
  function showCard(blob, text, rar, col) {
    var url = URL.createObjectURL(blob);
    var file = null;
    try { file = new File([blob], "arcia-photocard-" + rar + ".png", { type: "image/png" }); } catch (e) { /* old browser */ }
    var canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
    var quote = text.length > 140 ? text.slice(0, 137) + "…" : text;
    var tagTxt = rar === "common" ? "" : " [" + rar.toUpperCase() + " card]";
    var intent = "https://x.com/intent/post?text=" + encodeURIComponent("“" + quote + "” — ARCIA @ARCIAonArc" + tagTxt + " 💙💚\narcircle.app/arcia");
    var m = modal('<div class="aa-card-view aa-rar-' + rar + (rar !== "common" && !reduce ? " aa-holo" : "") + '"><p class="aa-rar" data-no-i18n>' + esc(T(RARITY[rar].label)) + '</p><div class="aa-card-img"><img src="' + url + '" alt="ARCIA photocard"></div><div class="aa-rc-row">' +
      (canShare ? '<button type="button" class="aa-rc-btn" data-share="1"><span>Share</span></button>' : "") +
      '<a class="aa-rc-btn' + (canShare ? " ghost" : "") + '" href="' + url + '" download="arcia-photocard-' + rar + '.png"><span>Save image</span></a>' +
      '<a class="aa-rc-btn ghost" href="' + intent + '" target="_blank" rel="noopener">' + ICON.x + "<span>Post on X</span></a></div>" +
      '<p class="aa-mini aa-col" data-no-i18n>' + esc(T({ en: "Your collection", ko: "내 컬렉션", zh: "我的收藏" })) + ' · <b>' + esc(T(RARITY.common.label)) + " " + (col.common || 0) + '</b> · <b class="r">' + esc(T(RARITY.rare.label).replace(/!+$/, "")) + " " + (col.rare || 0) + '</b> · <b class="s">' + esc(T(RARITY.secret.label).replace(/!+$/, "")) + " " + (col.secret || 0) + "</b></p>" +
      '<p class="aa-mini">Save the card, then attach it to your post.</p></div>', function () { URL.revokeObjectURL(url); });
    var sb = m.querySelector("[data-share]");
    if (sb) sb.addEventListener("click", function () { navigator.share({ files: [file], text: "“" + quote + "” — ARCIA @ARCIAonArc" + tagTxt }).catch(function () {}); });
    if (rar !== "common") { sfx(rar === "secret" ? "launch" : "milestone"); fx(m.querySelector(".aa-card-img"), rar === "secret" ? "confetti" : "sparkle"); }
  }
  function modal(inner, onClose) {
    var m = document.createElement("div");
    m.className = "aa-modal";
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.innerHTML = '<div class="aa-modal-box"><button type="button" class="aa-modal-x" aria-label="Close">' + ICON.close + "</button>" + inner + "</div>";
    document.body.appendChild(m);
    var close = function () { m.remove(); document.removeEventListener("keydown", key); if (onClose) onClose(); };
    var key = function (e) { if (e.key === "Escape") close(); };
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest(".aa-modal-x")) close(); });
    document.addEventListener("keydown", key);
    setTimeout(function () { var f = m.querySelector("button,a"); if (f) f.focus(); }, 30);
    return m;
  }

  // ---------------- live numbers (they roll when they change) ----------------
  var prev = {};
  var nowS = function () { return Math.floor(Date.now() / 1000); };
  var deadline = function () { return (LIVE && LIVE.round && LIVE.round.deadline) || 1790680567; };
  function roll(el, key, to, fmt) {
    var from = prev[key];
    prev[key] = to;
    if (from == null || from === to || reduce || !isFinite(from) || !isFinite(to)) { el.textContent = fmt(to); return; }
    el.classList.remove("up", "down", "flash"); void el.offsetWidth;
    el.classList.add("flash", to > from ? "up" : "down");
    var t0 = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
    })(t0);
  }
  function paintLive(L) {
    if (!L) return;
    LIVE = L;
    var box = panel.querySelector(".aa-live-rows");
    if (!box) return;
    if (!box.querySelector("[data-k]")) {
      box.innerHTML = [["price", "$ARCIRCLE"], ["holders", "Holders"], ["burned", "Burned forever"], ["raised", "Round #1 raised"], ["left", "Round #1 closes in"]].map(function (r) {
        return "<div><dt>" + esc(tr(r[1])) + '</dt><dd data-no-i18n><span data-k="' + r[0] + '">—</span>' + (r[0] === "price" ? ' <em class="aa-chg"></em>' : "") + "</dd></div>";
      }).join("");
    }
    var q = function (k) { return box.querySelector('[data-k="' + k + '"]'); };
    if (L.price != null) roll(q("price"), "price", L.price, function (v) { return F.price ? F.price(v) : "$" + v.toPrecision(3); });
    var chg = box.querySelector(".aa-chg");
    if (chg) { chg.textContent = L.change24h != null ? (L.change24h >= 0 ? "+" : "") + L.change24h.toFixed(2) + "%" : ""; chg.className = "aa-chg " + (L.change24h >= 0 ? "up" : "down"); }
    if (L.holders != null) roll(q("holders"), "holders", Number(L.holders), function (v) { return Math.round(v).toLocaleString("en-US"); });
    if (L.burnedPct != null) roll(q("burned"), "burned", L.burnedPct, function (v) { return v.toFixed(2) + "%"; });
    if (L.round && L.round.raised != null) roll(q("raised"), "raised", Number(L.round.raised), function (v) { return v.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC"; });
    var lf = q("left"); if (lf && !lf.classList.contains("aa-clock")) lf.classList.add("aa-clock");
    clock(); paintRemind();
  }
  function clock() {
    var s = deadline() - nowS();
    panel.classList.toggle("aa-urgent", s > 0 && s < 3600);
    panel.querySelectorAll(".aa-clock").forEach(function (el) {
      if (s <= 0) { el.textContent = tr("Closed"); return; }
      var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      el.textContent = (d ? d + "d " : "") + h + "h " + String(m).padStart(2, "0") + "m " + String(sec).padStart(2, "0") + "s";
    });
  }
  function refreshLive() {
    return fetch("/api/arcia").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.live) paintLive(j.live); }).catch(function () {});
  }

  // ---------------- round reminder: calendar file + a notification while the page is open ----------------
  function ics() {
    var dl = deadline(), z = function (t) { return new Date(t * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE PAD//ARCIA//EN", "BEGIN:VEVENT", "UID:circlepad-round1-close@arcircle.app", "DTSTAMP:" + z(nowS()),
      "DTSTART:" + z(dl), "DTEND:" + z(dl + 1800), "SUMMARY:CirclePad Round #1 closes", "DESCRIPTION:Last chance to join CirclePad Round #1 — https://www.arcircle.app/circle", "URL:https://www.arcircle.app/circle",
      "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:CirclePad Round #1 closes in 1 hour", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = "circlepad-round-1.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast(tr("Calendar file saved — open it to add the reminder."));
  }
  var remindT = null;
  function scheduleRemind() {
    clearTimeout(remindT);
    var at = ls.get("arcia-remind", 0);
    if (!at || !("Notification" in window) || Notification.permission !== "granted") return;
    var ms = (at - 3600 - nowS()) * 1000;
    if (ms < -3600000) { ls.set("arcia-remind", null); return; }
    remindT = setTimeout(function () {
      try { new Notification("CirclePad Round #1", { body: T({ en: "It closes in about an hour~ come join me before it's over♡", ko: "마감까지 한 시간쯤 남았어요~ 끝나기 전에 같이해요♡", zh: "大约一小时后截止~ 结束前快来参加吧♡" }), icon: "/images/arcia-avatar-96.jpg" }); } catch (e) { /* not allowed */ }
    }, Math.max(0, Math.min(ms, 2147000000)));
  }
  function remind() {
    if (!("Notification" in window)) { toast(tr("This browser can't show notifications — use the calendar file instead.")); return; }
    Notification.requestPermission().then(function (p) {
      if (p !== "granted") { toast(tr("Notifications are blocked — use the calendar file instead.")); return; }
      ls.set("arcia-remind", deadline()); scheduleRemind(); paintRemind();
      toast(tr("I'll remind you an hour before the close while this page is open."));
    });
  }
  function paintRemind() {
    var box = panel.querySelector(".aa-remind");
    if (!box) return;
    var open = deadline() > nowS();
    box.hidden = !open;
    var b = box.querySelector("[data-remind]");
    if (b) { var on = ls.get("arcia-remind", 0) === deadline() && "Notification" in window && Notification.permission === "granted"; b.classList.toggle("on", on); b.lastChild.textContent = tr(on ? "Reminder on" : "Remind me"); }
  }

  // ---------------- X feed ----------------
  function paintFeed(j) {
    var box = panel.querySelector(".aa-xfeed");
    if (!box) return;
    var list = (j && j.feed) || [];
    var head = panel.querySelector(".aa-xhead");
    if (head) head.innerHTML = '<span class="aa-dotlive' + (j && j.replies ? " on" : "") + '"></span><span>' + esc(tr(j && j.replies ? "Answering mentions about every minute" : "Replies are paused")) + "</span>" + (j && j.today != null ? '<em data-no-i18n>' + esc(T({ en: "{n} today", ko: "오늘 {n}개", zh: "今天 {n} 条" }).replace("{n}", j.today)) + "</em>" : "");
    if (!list.length) { box.innerHTML = '<li class="aa-empty">' + esc(tr("Nothing yet. Mention @ARCIAonArc on X and she'll answer you herself.")) + "</li>"; return; }
    box.innerHTML = list.slice(0, 12).map(function (r) {
      return '<li><div class="aa-xi-h"><img src="/images/arcia-avatar-96.jpg" alt="" width="22" height="22"><b>ARCIA</b>' +
        (r.kind === "reply" && r.to ? '<span data-no-i18n>→ @' + esc(r.to) + "</span>" : "") + '<time data-no-i18n>' + esc(F.ago ? F.ago(r.t) : "") + "</time></div>" +
        (r.toText ? '<p class="aa-xi-q" data-no-i18n>' + esc(r.toText) + "</p>" : "") +
        '<p class="aa-xi-t" data-no-i18n>' + esc(r.text) + '</p><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(tr("View on X")) + " ↗</a></li>";
    }).join("");
  }
  function loadFeed() { return fetch("/api/arcia-x?feed=1").then(function (r) { return r.ok ? r.json() : null; }).then(paintFeed).catch(function () { paintFeed(null); }); }

  // ---------------- fan letters ----------------
  function paintLetters(list) {
    var box = panel.querySelector(".aa-letters");
    if (!box) return;
    var hearted = ls.get("arcia-hearted", []);
    if (!list || !list.length) { box.innerHTML = '<li class="aa-empty">' + esc(tr("No letters yet. Be the first to write to her!")) + "</li>"; return; }
    box.innerHTML = list.map(function (l) {
      var on = hearted.indexOf(l.id) >= 0;
      return '<li data-id="' + esc(l.id) + '"><div class="aa-lt-h"><b data-no-i18n>' + esc(l.name) + '</b><time data-no-i18n>' + esc(F.ago ? F.ago(Math.floor(l.at / 1000)) : "") + '</time></div><p data-no-i18n>' + esc(l.text) + "</p>" +
        (l.reply ? '<div class="aa-lt-r"><img src="/images/arcia-avatar-96.jpg" alt="" width="24" height="24"><p data-no-i18n>' + esc(l.reply) + "</p></div>" : "") +
        '<button type="button" class="aa-lt-heart' + (on ? " on" : "") + '" aria-label="Heart this letter">' + ICON.heart + "<span data-no-i18n>" + (l.hearts || 0) + "</span></button></li>";
    }).join("");
  }
  var lettersLoaded = false;
  var lettersTop = false;
  function loadLetters() {
    lettersLoaded = true;
    return fetch("/api/arcia?letters=" + (lettersTop ? "top" : "1")).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { paintLetters(j && j.letters); }).catch(function () { paintLetters([]); });
  }
  function sendLetter(e) {
    e.preventDefault();
    var f = e.target, btn = f.querySelector("button[type=submit]"), msg = f.querySelector(".aa-lf-msg");
    var name = f.name_.value.trim(), text = f.text.value.trim();
    if (text.length < 2) return;
    btn.disabled = true; msg.textContent = tr("ARCIA is reading your letter…"); msg.className = "aa-lf-msg";
    if (name) ls.set("arcia-name", name.slice(0, 24));
    fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "letter", name: name, text: text, lang: lang() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (!j.ok) { msg.textContent = j.error || T(OOPS.net); msg.className = "aa-lf-msg err"; return; }
        f.text.value = ""; count(f);
        msg.textContent = tr("She wrote back!"); msg.className = "aa-lf-msg ok";
        sfx("milestone");
        loadLetters().then(function () { var li = panel.querySelector('.aa-letters li[data-id="' + j.letter.id + '"]'); if (li) { li.classList.add("new"); fx2(li); } });
      })
      .catch(function () { msg.textContent = T(OOPS.net); msg.className = "aa-lf-msg err"; })
      .then(function () { btn.disabled = false; });
  }
  function fx2(el) { if (reduce) return; el.classList.add("glow"); setTimeout(function () { el.classList.remove("glow"); }, 2400); }
  function count(f) { var c = f.querySelector(".aa-lf-count"); if (c) c.textContent = f.text.value.length + " / 280"; }
  function heartLetter(btn) {
    var li = btn.closest("li"), id = li && li.getAttribute("data-id");
    if (!id || btn.classList.contains("on")) return;
    var hearted = ls.get("arcia-hearted", []);
    btn.classList.add("on");
    var n = btn.querySelector("span"); n.textContent = Number(n.textContent || 0) + 1;
    hearted.push(id); ls.set("arcia-hearted", hearted.slice(-300));
    fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "heart", id: id }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j && j.hearts != null) n.textContent = j.hearts; if (j && !j.already) loadHearts(); }).catch(function () {});
  }

  // ---------------- quiz ----------------
  var QUIZ = [
    { q: { en: "Which chain is ARCIRCLE PAD built on?", ko: "ARCIRCLE PAD는 어느 체인 위에 있을까요?", zh: "ARCIRCLE PAD 建在哪条链上？" }, a: ["Circle's Arc", "Ethereum", "Solana", "Base"] },
    { q: { en: "What pays for gas on Arc?", ko: "Arc에서 가스비는 뭘로 낼까요?", zh: "Arc 上用什么支付 Gas？" }, a: ["USDC", "ETH", "$ARCIRCLE", "SOL"] },
    { q: { en: "How much $ARCIRCLE does one CirclePad vote burn?", ko: "CirclePad 투표 한 번에 소각되는 $ARCIRCLE은?", zh: "CirclePad 每投一票销毁多少 $ARCIRCLE？" }, a: ["1,000", "100", "10,000", "None"] },
    { q: { en: "How long is a CirclePad raise?", ko: "CirclePad 모금 기간은?", zh: "CirclePad 募集持续多久？" }, a: ["72 hours", "24 hours", "7 days", "30 days"] },
    { q: { en: "How much $ARCIRCLE do you hold to receive every Relay Launch?", ko: "모든 릴레이 런칭을 받으려면 $ARCIRCLE을 얼마나 들고 있어야 할까요?", zh: "持有多少 $ARCIRCLE 才能收到每次接力发币？" }, a: ["100,000+", "1,000", "10,000", "1,000,000"] },
    { q: { en: "How big is the team allocation of $ARCIRCLE?", ko: "$ARCIRCLE 팀 물량은 얼마일까요?", zh: "$ARCIRCLE 的团队份额是多少？" }, a: ["None — 100% went into the pool", "10%", "20%", "50%"] },
    { q: { en: "What does it cost to launch a coin on ArcPad?", ko: "ArcPad에서 코인을 런칭하는 비용은?", zh: "在 ArcPad 发一个币要多少钱？" }, a: ["1 USDC", "10 USDC", "100 USDC", "Free"] },
    { q: { en: "When a CirclePad round closes, where does 80% go?", ko: "CirclePad 라운드가 마감되면 80%는 어디로 갈까요?", zh: "CirclePad 一轮截止时，80% 去哪里？" }, a: ["The launch", "The team", "Burned", "The top contributor"] },
  ];
  var quiz = null;
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function quizStart() { quiz = { i: 0, score: 0, order: shuffle(QUIZ.map(function (_, i) { return i; })) }; quizPaint(); }
  function quizPaint() {
    var box = panel.querySelector(".aa-quiz");
    if (!box) return;
    var rec = ls.get("arcia-quiz", { best: 0 });
    if (!quiz) {
      box.innerHTML = '<p class="aa-mini" data-no-i18n>' + esc(T({ en: "Eight questions about $ARCIRCLE. Score 5+ for the Rookie Fan badge, 8/8 for ARCIRCLE Scholar.", ko: "$ARCIRCLE 문제 8개예요. 5개 이상 맞히면 루키 팬 배지, 8개 다 맞히면 ARCIRCLE 박사 배지!", zh: "8 道关于 $ARCIRCLE 的题。答对 5 题得「新晋粉丝」徽章，全对得「ARCIRCLE 学者」。" })) + "</p>" +
        (rec.best ? '<p class="aa-mini" data-no-i18n>' + esc(T({ en: "Your best: ", ko: "최고 점수: ", zh: "最佳成绩：" })) + rec.best + " / 8</p>" : "") +
        '<button type="button" class="aa-rc-btn" data-q="start">Start the quiz</button>';
      return;
    }
    if (quiz.i >= quiz.order.length) {
      var sc = quiz.score, best = Math.max(rec.best || 0, sc);
      ls.set("arcia-quiz", { best: best });
      var line = sc === 8 ? T({ en: "Perfect!! You really are my number one fan~♡", ko: "만점!! 역시 제 최애 팬이에요~♡", zh: "满分！！你真的是我的头号粉丝~♡" })
        : sc >= 5 ? T({ en: "So good~ You know ARCIRCLE really well♡", ko: "대단해요~ ARCIRCLE 진짜 잘 아네요♡", zh: "好厉害~ 你很懂 ARCIRCLE♡" })
        : T({ en: "Aww, nice try~ Let's study together and try again♡", ko: "아까워요~ 같이 공부하고 다시 도전해요♡", zh: "差一点~ 一起学习再来一次吧♡" });
      box.innerHTML = '<div class="aa-q-end"><div class="aa-q-score" data-no-i18n>' + sc + " / 8</div><p data-no-i18n>" + esc(line) + "</p>" + badgesHtml() + '<button type="button" class="aa-rc-btn" data-q="start">Try the quiz again</button></div>';
      if (sc >= 5) { fx(box, "confetti"); sfx("launch"); }
      paintFan();
      return;
    }
    var item = QUIZ[quiz.order[quiz.i]];
    var opts = shuffle(item.a.map(function (t, k) { return { t: t, ok: k === 0 }; }));
    box.innerHTML = '<div class="aa-q-top"><span data-no-i18n>' + (quiz.i + 1) + " / 8</span><i style=\"--p:" + (quiz.i / 8 * 100) + '%"></i></div><p class="aa-q-q" data-no-i18n>' + esc(T(item.q)) + '</p><div class="aa-q-opts">' +
      opts.map(function (o) { return '<button type="button" data-ok="' + (o.ok ? 1 : 0) + '" data-no-i18n>' + esc(o.t) + "</button>"; }).join("") + "</div>";
  }
  function quizPick(btn) {
    var box = btn.closest(".aa-q-opts");
    if (box.classList.contains("done")) return;
    box.classList.add("done");
    var ok = btn.getAttribute("data-ok") === "1";
    btn.classList.add(ok ? "right" : "wrong");
    if (!ok) { var r = box.querySelector('[data-ok="1"]'); if (r) r.classList.add("right"); }
    if (ok) { quiz.score++; sfx("tap"); }
    setTimeout(function () { quiz.i++; quizPaint(); }, ok ? 650 : 1200);
  }

  // ---------------- today's hearts: one gauge every fan fills together ----------------
  var HEART = { today: null, goal: 100, pending: 0, sending: false, t: 0 };
  var utcDay = function () { return new Date().toISOString().slice(0, 10); };
  var GOAL_MSG = {
    en: "We did it~!! {g} hearts from all of you today♡ Thank you, thank you — my heart is so full I could fly all the way around the Arc chain 💙💚",
    ko: "해냈어요~!! 오늘 여러분이 보내준 하트가 {g}개를 넘었어요♡ 정말 고마워요 — 마음이 너무 벅차서 Arc 체인 한 바퀴를 날아다닐 수 있을 것 같아요 💙💚",
    zh: "我们做到了~!! 今天大家送来的爱心超过 {g} 颗♡ 谢谢你们 —— 我开心得能绕 Arc 链飞一圈 💙💚",
  };
  function paintGauge(bump) {
    var g = Q(".aa-gauge");
    if (!g || HEART.today == null) return;
    var n = HEART.today, goal = HEART.goal, pct = Math.min(100, n / goal * 100);
    g.querySelector(".aa-g-fill").style.width = pct.toFixed(1) + "%";
    g.querySelector(".aa-g-num").textContent = n.toLocaleString("en-US") + " / " + goal.toLocaleString("en-US");
    g.classList.toggle("full", n >= goal);
    if (bump && !reduce) { var num = g.querySelector(".aa-g-num"); num.classList.remove("bump"); void num.offsetWidth; num.classList.add("bump"); }
    if (n >= goal && log && ls.get("arcia-goal", "") !== utcDay()) {
      ls.set("arcia-goal", utcDay());
      var li = bubble("assistant", T(GOAL_MSG).replace("{g}", goal.toLocaleString("en-US")), { type: true, cls: "sys" });
      fx(li, "confetti"); sfx("launch");
    }
  }
  function loadHearts() {
    return fetch("/api/arcia?hearts=1").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || j.today == null) return;
      HEART.goal = j.goal || HEART.goal;
      if (HEART.pending || HEART.sending) return; // our own taps are still on the way
      var bump = HEART.today != null && j.today > HEART.today;
      HEART.today = j.today; paintGauge(bump);
    }).catch(function () {});
  }
  function flushHearts() {
    if (HEART.sending || !HEART.pending) return;
    var n = Math.min(5, HEART.pending);
    HEART.pending -= n; HEART.sending = true;
    fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cheer", n: n }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.today != null && !HEART.pending) { HEART.today = j.today; HEART.goal = j.goal || HEART.goal; paintGauge(false); } })
      .catch(function () {})
      .then(function () { HEART.sending = false; if (HEART.pending) flushHearts(); });
  }
  function cheer(n) {
    var key = "arcia-cheer-" + utcDay(), used = ls.get(key, 0);
    if (used >= 30) { toast(T({ en: "You sent all 30 of today's hearts~ thank you♡", ko: "오늘 하트 30개를 다 보냈어요~ 고마워요♡", zh: "今天的 30 颗爱心都送出啦~ 谢谢你♡" })); return false; }
    ls.set(key, used + n);
    if (HEART.today == null) HEART.today = 0;
    HEART.today += n; paintGauge(true);
    HEART.pending += n;
    clearTimeout(HEART.t); HEART.t = setTimeout(flushHearts, 600);
    return true;
  }

  // ---------------- fan card, badges, streak, profile ----------------
  function badges() {
    var out = [], st = ls.get("arcia-streak", null), qz = ls.get("arcia-quiz", { best: 0 });
    if (ME && ME.relay) out.push(["holder", T({ en: "Relay holder", ko: "릴레이 홀더", zh: "接力持有人" })]);
    else if (ME && ME.balance > 0) out.push(["holder", T({ en: "Holder", ko: "홀더", zh: "持有人" })]);
    if (qz.best >= 8) out.push(["scholar", T({ en: "ARCIRCLE Scholar", ko: "ARCIRCLE 박사", zh: "ARCIRCLE 学者" })]);
    else if (qz.best >= 5) out.push(["rookie", T({ en: "Rookie Fan", ko: "루키 팬", zh: "新晋粉丝" })]);
    if (st && st.n >= 2) out.push(["streak", T({ en: "{n}-day streak", ko: "{n}일 연속", zh: "连续 {n} 天" }).replace("{n}", st.n)]);
    return out;
  }
  function badgesHtml() { return '<div class="aa-badges">' + badges().map(function (b) { return '<span class="aa-badge ' + b[0] + '" data-no-i18n>' + esc(b[1]) + "</span>"; }).join("") + "</div>"; }
  function paintFan() {
    var hb = panel.querySelector(".aa-hero .aa-badges");
    if (hb) hb.outerHTML = badgesHtml();
    var ch = Q(".aa-chat-h .aa-me");
    if (ch) { var bs = badges().filter(function (b) { return b[0] === "holder"; })[0]; ch.hidden = !bs; ch.textContent = bs ? bs[1] : ""; }
    var fan = panel.querySelector(".aa-fan");
    if (!fan) return;
    var n = ls.get("arcia-name", ""), st = ls.get("arcia-streak", { n: 0, total: 0 });
    fan.innerHTML = '<h4 data-no-i18n>' + esc(T({ en: "Your fan card", ko: "나의 팬 카드", zh: "我的粉丝卡" })) + '</h4><dl class="aa-prof">' +
      "<div><dt data-no-i18n>" + esc(T({ en: "She calls you", ko: "부르는 이름", zh: "她怎么叫你" })) + '</dt><dd data-no-i18n>' + (n ? esc(n) + ' <button type="button" class="aa-link" data-forget="1">' + esc(T({ en: "Forget", ko: "잊기", zh: "忘记" })) + "</button>" : '<span class="aa-dim">' + esc(T({ en: "Tell her “call me …” in the chat", ko: "채팅에서 “…라고 불러”라고 말해 보세요", zh: "在聊天里说“叫我…”" })) + "</span>") + "</dd></div>" +
      "<div><dt data-no-i18n>" + esc(T({ en: "Visits", ko: "방문", zh: "来访" })) + '</dt><dd data-no-i18n>' + (st.total || 0) + " · " + esc(T({ en: "streak ", ko: "연속 ", zh: "连续 " })) + (st.n || 0) + "</dd></div>" +
      (ME ? "<div><dt>$ARCIRCLE</dt><dd data-no-i18n>" + fmtBal(ME.balance) + (ME.rank ? " · #" + ME.rank : "") + "</dd></div>" : "") +
      "</dl>" + badgesHtml();
  }
  function setMe(me) {
    var had = ME;
    ME = me || null;
    paintFan();
    if (ME && ME.relay && !had && !ss.get("arcia-holder-greeted", false)) {
      ss.set("arcia-holder-greeted", true);
      var li = bubble("assistant", T(HOLDER_MSG).replace("{b}", fmtBal(ME.balance)), { type: true, cls: "sys" });
      fx(li, "sparkle");
    }
  }
  function checkWallet() {
    var a = account();
    if (a === checkWallet.last) return;
    checkWallet.last = a;
    if (!a) { ME = null; paintFan(); return; }
    fetch("/api/social?token=arcircle&wallet=" + a).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.wallet || account() !== a) return;
      var w = d.wallet;
      setMe({ address: w.address, balance: w.balance || 0, rank: w.rank, of: w.of, relay: (w.balance || 0) >= 100000 });
    }).catch(function () {});
  }
  function streak() {
    var st = ls.get("arcia-streak", null), today = dayStr(), y = new Date(); y.setDate(y.getDate() - 1);
    var first = !st;
    if (st && st.last === today) return { st: st, fresh: false, first: false };
    st = st || { n: 0, total: 0 };
    st.n = st.last === dayStr(y) ? st.n + 1 : 1;
    st.total = (st.total || 0) + 1; st.last = today;
    ls.set("arcia-streak", st);
    return { st: st, fresh: true, first: first };
  }
  function cheerText() { var c = T(CHEER), d = new Date(); return c[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % c.length]; }
  function paintCheer() {
    var el = panel.querySelector(".aa-cheer");
    if (!el) return;
    var st = ls.get("arcia-streak", { n: 1 });
    el.innerHTML = '<span class="aa-cheer-k">' + esc(tr("Today's message")) + '</span><p data-no-i18n>' + esc(cheerText()) + '</p><span class="aa-cheer-s" data-no-i18n>' + esc(T({ en: "Day {n} streak", ko: "{n}일 연속 출석", zh: "连续 {n} 天" }).replace("{n}", st.n || 1)) + "</span>";
  }
  function profileHtml() {
    var soon = T({ en: "Coming soon", ko: "곧 공개", zh: "即将公开" });
    var K = function (en, ko, zh) { return T({ en: en, ko: ko, zh: zh }); };
    var rows = [
      [K("Name", "이름", "名字"), "ARCIA"], [K("Role", "역할", "身份"), K("Virtual idol & official mascot of $ARCIRCLE", "$ARCIRCLE 버추얼 아이돌 · 공식 마스코트", "$ARCIRCLE 虚拟偶像 · 官方吉祥物")],
      [K("Debut", "데뷔", "出道"), K("September 2026", "2026년 9월", "2026 年 9 月")], [K("Lives on", "사는 곳", "住在"), K("Circle's Arc chain", "Circle의 Arc 체인", "Circle 的 Arc 链")],
      [K("Colors", "컬러", "代表色"), K("Blue & green, like the ARCIRCLE rings", "ARCIRCLE 링처럼 파랑 & 초록", "像 ARCIRCLE 圆环一样的蓝与绿")],
      [K("Loves", "좋아하는 것", "喜欢"), K("New launches, burn-to-vote, chatting with fans", "신규 런칭, 소각 투표, 팬들과 수다", "新币发射、销毁投票、和粉丝聊天")],
      [K("Height", "키", "身高"), soon], [K("Birthday", "생일", "生日"), soon], ["MBTI", soon],
      ["X", '<a href="' + X + '" target="_blank" rel="noopener">@ARCIAonArc</a>'], [K("Run by", "운영", "运营"), '<a href="https://x.com/ARCIRCLEonArc" target="_blank" rel="noopener">@ARCIRCLEonArc</a>'],
    ];
    return '<dl class="aa-prof">' + rows.map(function (r) { return "<div><dt data-no-i18n>" + esc(r[0]) + '</dt><dd data-no-i18n' + (r[1] === soon ? ' class="aa-dim"' : "") + ">" + (/^</.test(r[1]) ? r[1] : esc(r[1])) + "</dd></div>"; }).join("") + "</dl>" +
      '<p class="aa-mini">An AI character, automated and run by the ARCIRCLE team. The rest of her official profile is on the way.</p>';
  }

  // ---------------- entrance: the two rings meet and she steps out (once a day, under a second) ----------------
  function entrance() {
    if (reduce || ls.get("arcia-enter", "") === dayStr()) return false;
    ls.set("arcia-enter", dayStr());
    var o = document.createElement("div");
    o.className = "aa-enter"; o.setAttribute("aria-hidden", "true");
    o.innerHTML = '<div class="aa-en-stage"><i class="aa-en-ring l"></i><i class="aa-en-ring r"></i><img class="aa-en-av" src="/images/arcia-avatar.jpg" alt=""><b class="aa-en-name">ARCIA</b></div>';
    document.body.appendChild(o);
    setTimeout(function () { o.remove(); }, 1000);
    return true;
  }

  // ---------------- first visit ----------------
  function intro() {
    if (ls.get("arcia-intro-v1", false)) return false;
    ls.set("arcia-intro-v1", true);
    var m = modal('<div class="aa-intro"><span class="aa-av-wrap sm"><img class="aa-av" src="/images/arcia-avatar.jpg" alt="" width="96" height="96"><i class="aa-halo" aria-hidden="true"></i></span>' +
      '<h3 data-no-i18n>' + esc(T({ en: "Nice to meet you~♡", ko: "만나서 반가워요~♡", zh: "很高兴认识你~♡" })) + '</h3><p data-no-i18n>' + esc(T({ en: "I'm ARCIA, the virtual idol of $ARCIRCLE. Here's what we can do together:", ko: "저는 $ARCIRCLE의 버추얼 아이돌 ARCIA예요. 여기서 같이 할 수 있는 것들이에요:", zh: "我是 $ARCIRCLE 的虚拟偶像 ARCIA。我们可以一起做这些：" })) + "</p>" +
      '<ul data-no-i18n><li><b>' + esc(T({ en: "Chat", ko: "채팅", zh: "聊天" })) + "</b>" + esc(T({ en: "Ask me anything about ARCIRCLE PAD, or just talk.", ko: "ARCIRCLE PAD 뭐든 묻거나 그냥 수다 떨어요.", zh: "问我任何关于 ARCIRCLE PAD 的事，或者随便聊聊。" })) + "</li>" +
      "<li><b>" + esc(T({ en: "Letters", ko: "팬레터", zh: "粉丝信" })) + "</b>" + esc(T({ en: "Leave a fan letter — I read and answer every one.", ko: "팬레터를 남겨 주면 하나하나 읽고 답장해요.", zh: "给我留一封信，我每封都会读、都会回。" })) + "</li>" +
      "<li><b>" + esc(T({ en: "Daily visit", ko: "매일 출석", zh: "每日签到" })) + "</b>" + esc(T({ en: "Come by every day for a new message and your streak.", ko: "매일 와서 새 메시지랑 연속 출석을 받아 가요.", zh: "每天来看看，领取新留言和连续签到。" })) + "</li></ul>" +
      '<button type="button" class="aa-rc-btn wide" data-go="1">' + esc(T({ en: "Let's talk", ko: "이야기하러 가기", zh: "开始聊天" })) + "</button></div>");
    m.querySelector("[data-go]").addEventListener("click", function () { m.querySelector(".aa-modal-x").click(); setTimeout(function () { if (window.innerWidth > 900) input.focus({ preventScroll: true }); }, 50); });
    return true;
  }

  // ---------------- ARCIA's other utilities: one live line each ----------------
  function famLoad() {
    if (!window.fetch) return;
    var put = function (k, html) { var el = panel.querySelector('[data-fam="' + k + '"]'); if (el && html) el.innerHTML = html; };
    var money = function (n) { return (n < 0 ? "−$" : "$") + Math.abs(Number(n) || 0).toFixed(2); };
    fetch("/api/arcia402?stats=1").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var t = d && d.totals; if (!t) return;
      put("402", '<i></i><span>' + esc(tr("Earned")) + '</span> <b data-no-i18n>' + money(t.earned || 0) + '</b> · <b data-no-i18n>' + (Number(t.sold) || 0) + "</b> " + esc(tr("paid calls")));
    }).catch(function () {});
    fetch("/api/desk").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.stats) return;
      var live = d.mode === "live", n = (d.stats.realClosed || 0) + (d.open ? d.open.length : 0), p = d.money && d.money.pnl;
      put("desk", '<i class="' + (live ? "on" : "") + '"></i><span>' + esc(tr(live ? "Live" : "Paper")) + "</span> · <b data-no-i18n>" + n + "</b> " + esc(tr("real trades")) + (live && p != null ? ' · <b data-no-i18n class="' + (p >= 0 ? "up" : "down") + '">' + (p >= 0 ? "+" : "") + money(p) + "</b>" : "") + " · <span>" + esc(tr("learning")) + "</span>");
    }).catch(function () {});
  }

  // ---------------- build ----------------
  function build() {
    panel.innerHTML =
      '<div class="aa">' +
        '<div class="aa-hero">' +
          '<div class="aa-banner"><div class="aa-par"><picture><source type="image/webp" srcset="/images/arcia-banner2-900.webp 900w, /images/arcia-banner2.webp 1600w" sizes="(max-width: 900px) 100vw, 1100px"><img src="/images/arcia-banner2.jpg" srcset="/images/arcia-banner2-900.jpg 900w, /images/arcia-banner2.jpg 1600w" sizes="(max-width: 900px) 100vw, 1100px" alt="ARCIA — ARCIRCLE official mascot" width="1600" height="547"' + (HOST ? ' loading="lazy"' : ' fetchpriority="high"') + '></picture></div></div>' +
          '<div class="aa-id">' +
            '<span class="aa-av-wrap"><picture><source type="image/webp" srcset="/images/arcia-avatar.webp"><img class="aa-av" src="/images/arcia-avatar.jpg" alt="ARCIA" width="256" height="256"' + (HOST ? ' loading="lazy"' : "") + '></picture><i class="aa-halo" aria-hidden="true"></i><i class="aa-live-dot" aria-hidden="true"></i></span>' +
            '<div class="aa-name"><span class="ams-kicker">Utility · AI idol</span><h1>ARCIA <span class="asc-ver" title="Version 1 — new features are added regularly">v1<i>Updated regularly</i></span></h1>' +
              '<p class="aa-handle"><a href="' + X + '" target="_blank" rel="noopener" data-no-i18n>@ARCIAonArc</a><span aria-hidden="true"> · </span><span>Virtual idol of $ARCIRCLE</span></p>' +
              '<div class="aa-badges"></div></div>' +
            '<div class="aa-act"><a class="bp-btn-primary aa-go" href="#aa-chat"><span class="aa-lg">Chat with ARCIA</span><span class="aa-sh">Chat</span></a><a class="aa-x" href="' + X + '" target="_blank" rel="noopener">' + ICON.x + "<span>Follow on X</span></a><a class=\"aa-x aa-tg\" href=\"https://t.me/ARCIAonArc_bot\" target=\"_blank\" rel=\"noopener\"><span class=\"aa-lg\">Chat on Telegram</span><span class=\"aa-sh\">Telegram</span></a></div>" +
          "</div>" +
          '<p class="aa-lede">ARCIA has studied every page of ARCIRCLE PAD and carries $ARCIRCLE to the world — here in her chat, and on X, where she answers every mention within about a minute.</p>' +
          // ARCIA's other utilities, in one place
          // a div, not <nav>: the site's global nav rules (full-bleed width, side padding, scrolling) would pull it out of the hero on phones
          '<div class="aa-fam" role="navigation" aria-label="More from ARCIA">' +
            '<a class="aa-fam-c a402" href="/arc#arcia402" data-arc-tab="arcia402"><span class="aa-fam-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="5.5"/><path d="M9 9.3v5.4M10.7 10.2c-.4-.6-1-.9-1.7-.9-.9 0-1.6.5-1.6 1.2 0 1.5 3.4.9 3.4 2.4 0 .7-.8 1.2-1.7 1.2-.8 0-1.4-.3-1.8-.9"/><path d="M15.5 7.5a5.5 5.5 0 0 1 0 9M18 5.5a8.5 8.5 0 0 1 0 13"/></svg></span>' +
              '<span class="aa-fam-t"><b>ARCIA 402</b><small>She earns and pays in USDC with x402 on Arc — every dollar on public books</small><em class="aa-fam-live" data-fam="402"></em></span><i class="aa-fam-go" aria-hidden="true">→</i></a>' +
            '<a class="aa-fam-c desk" href="/arc#desk" data-arc-tab="desk"><span class="aa-fam-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19.5h16"/><path d="M6.5 16V11M10.5 16V7.5M14.5 16v-6M18.5 16V5"/><path d="M5 9.5l4.5-4 4 3 5.5-5"/></svg></span>' +
              '<span class="aa-fam-t"><b>ARCIA DESK <span class="aa-fam-beta">Beta</span></b><small>She trades new Argus launches with her own small wallet and learns from every trade</small><em class="aa-fam-live" data-fam="desk"></em></span><i class="aa-fam-go" aria-hidden="true">→</i></a>' +
          "</div>" +
        "</div>" +
        '<div class="aa-stage">' +
          '<aside class="aa-portrait" aria-label="ARCIA">' +
            '<div class="aa-pf"><picture><source type="image/webp" srcset="/images/arcia-portrait-480.webp 480w, /images/arcia-portrait.webp 720w" sizes="250px"><img src="/images/arcia-portrait.jpg" alt="ARCIA" width="720" height="712" loading="lazy"></picture><i class="aa-pf-halo" aria-hidden="true"></i>' +
              '<div class="aa-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
              '<div class="aa-pf-tag"><b>ARCIA</b><span><i></i>Online</span></div></div>' +
            '<div class="aa-cheer"></div>' +
          "</aside>" +
          '<section class="aa-chat" id="aa-chat" aria-label="Chat with ARCIA">' +
            '<div class="aa-chat-h"><span class="aa-mini-av"><img src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40"></span><div><b>ARCIA</b><span class="aa-on"><i></i>Online</span></div>' +
              '<span class="aa-me" hidden data-no-i18n></span>' +
              ("speechSynthesis" in window ? '<button type="button" class="aa-tool aa-voice-t" aria-pressed="false" title="Read her replies aloud">' + ICON.voice + "<span>Voice</span></button>" : "") +
              '<button type="button" class="aa-tool aa-new" title="Start a new chat"><span>New chat</span></button></div>' +
            '<div class="aa-gauge"><button type="button" class="aa-cheer-btn" aria-label="Send ARCIA a heart" title="Send ARCIA a heart">' + ICON.heart + '</button>' +
              '<div class="aa-g-main"><div class="aa-g-top"><span>Today\'s hearts</span><b class="aa-g-num" data-no-i18n>—</b></div><div class="aa-g-track"><i class="aa-g-fill"></i></div></div></div>' +
            '<ol class="aa-log" role="log" aria-live="polite" aria-label="Conversation"></ol>' +
            '<div class="aa-sugg" aria-label="Suggested questions"></div>' +
            '<form class="aa-form" autocomplete="off"><textarea rows="1" maxlength="700" placeholder="Talk to ARCIA…" aria-label="Message ARCIA" enterkeyhint="send"></textarea>' +
              '<button type="submit" class="aa-send" aria-label="Send">' + ICON.send + "</button></form>" +
            '<p class="aa-note">ARCIA is an AI character run by @ARCIRCLEonArc. She can be wrong, and nothing she says is financial advice. Never share your private key or seed phrase.</p>' +
          "</section>" +
          '<aside class="aa-side">' +
            '<div class="aa-tabs" role="tablist" aria-label="More with ARCIA">' +
              Object.keys(TABS).map(function (t, i) {
                return '<button type="button" role="tab" id="aa-t-' + t + '" aria-controls="aa-p-' + t + '" aria-selected="' + (i ? "false" : "true") + '" tabindex="' + (i ? "-1" : "0") + '" data-t="' + t + '" data-no-i18n>' + esc(T(TABS[t])) + "</button>";
              }).join("") + "</div>" +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-live" aria-labelledby="aa-t-live"><h3>What ARCIA sees right now</h3><dl class="aa-live-rows"><div><dt>Loading…</dt><dd></dd></div></dl>' +
              '<div class="aa-remind"><button type="button" class="aa-rc-btn ghost" data-ics="1">' + ICON.cal + '<span>Add to calendar</span></button><button type="button" class="aa-rc-btn ghost" data-remind="1">' + ICON.bell + "<span>Remind me</span></button>" +
              '<p class="aa-mini">Reminders show while this page is open. For alerts anywhere, join <a href="https://t.me/arcircle_launch" target="_blank" rel="noopener">t.me/arcircle_launch</a>.</p></div>' +
              '<a class="aa-more" href="/stats">All live stats →</a></div>' +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-x" aria-labelledby="aa-t-x" hidden><h3>ARCIA on X</h3><p class="aa-xhead"></p><ul class="aa-xfeed"><li class="aa-empty">Loading…</li></ul>' +
              '<a class="aa-x wide" href="' + X + '" target="_blank" rel="noopener">' + ICON.x + "<span>Follow @ARCIAonArc</span></a></div>" +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-letters" aria-labelledby="aa-t-letters" hidden><h3>Fan letters</h3><p class="aa-mini">Write to ARCIA. She reads every letter and answers it here, for everyone to see.</p>' +
              '<form class="aa-lform" autocomplete="off"><input name="name_" maxlength="24" placeholder="Your name" aria-label="Your name"><textarea name="text" maxlength="280" rows="3" placeholder="Dear ARCIA…" aria-label="Your letter" required></textarea>' +
              '<div class="aa-lf-row"><span class="aa-lf-count" data-no-i18n>0 / 280</span><button type="submit" class="aa-rc-btn">Send letter</button></div><p class="aa-lf-msg" role="status"></p></form>' +
              '<div class="aa-lsort" role="radiogroup"><button type="button" role="radio" aria-checked="true" data-lsort="new">Latest</button><button type="button" role="radio" aria-checked="false" data-lsort="top">Top this week</button></div>' +
              '<ul class="aa-letters"><li class="aa-empty">Loading…</li></ul></div>' +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-quiz" aria-labelledby="aa-t-quiz" hidden><h3>$ARCIRCLE quiz</h3><div class="aa-quiz"></div></div>' +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-cards" aria-labelledby="aa-t-cards" hidden><h3>Photocard book</h3><p class="aa-mini">Tap the card button on any of her replies to make one. Your cards are kept in this browser.</p><div class="aa-book"></div>' +
              '<button type="button" class="aa-rc-btn" data-fancard="1"><span>Make my fan card</span></button></div>' +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-profile" aria-labelledby="aa-t-profile" hidden><h3>Official profile</h3><div class="aa-profile"></div><div class="aa-fan"></div>' +
              '<h4>What ARCIA has studied</h4><div class="aa-tags"><span>Whitepaper</span><span>$ARCIRCLE</span><span>ArcPad</span><span>CirclePad</span><span>Relay Launch</span><span>Every utility</span><span>Contracts</span><span>Roadmap &amp; rewards</span></div></div>' +
          "</aside>" +
        "</div>" +
      "</div>";
    famLoad();
    panel.querySelector(".aa-fam").addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("[data-arc-tab]");
      if (!a || typeof window.arcpadShowTab !== "function" || HOST) return; // other pages: a normal link to /arc#…
      e.preventDefault(); window.arcpadShowTab(a.getAttribute("data-arc-tab"));
    });
    chat = panel.querySelector(".aa-chat");
    log = panel.querySelector(".aa-log");
    form = panel.querySelector(".aa-form");
    input = form.querySelector("textarea");
    sendBtn = form.querySelector(".aa-send");
    form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
    var leftEl = document.createElement("p"); leftEl.className = "aa-left"; leftEl.hidden = true; form.after(leftEl);
    micSetup();
    paintBook();
    input.addEventListener("input", grow);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
    log.addEventListener("scroll", function () { stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60; });
    Q(".aa-sugg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) send(b.textContent); });
    Q(".aa-new").addEventListener("click", restart);
    panel.querySelector(".aa-cheer-btn").addEventListener("click", function (e) {
      if (!cheer(1)) return;
      var b = e.currentTarget; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
      if (!reduce) for (var k = 0; k < 6; k++) { var hp = document.createElement("i"); hp.className = "aa-hp"; hp.style.setProperty("--x", (Math.random() * 60 - 30).toFixed(0) + "px"); hp.style.setProperty("--d", (k * 60) + "ms"); hp.innerHTML = ICON.heart; b.appendChild(hp); setTimeout(function (el) { el.remove(); }.bind(null, hp), 1300); }
      fx(Q(".aa-gauge"), "hearts");
      if (typeof window.arcHaptic === "function") window.arcHaptic("tap");
    });
    var vt = Q(".aa-voice-t");
    if (vt) {
      var syncV = function () { var on = !!ls.get("arcia-voice", false); vt.setAttribute("aria-pressed", on ? "true" : "false"); vt.classList.toggle("on", on); };
      vt.addEventListener("click", function () { var on = !ls.get("arcia-voice", false); ls.set("arcia-voice", on); syncV(); if (!on) try { speechSynthesis.cancel(); } catch (e) { /* none */ } else toast(tr("Voice on — she'll read her replies aloud.")); });
      syncV();
      loadVoices(); try { speechSynthesis.onvoiceschanged = loadVoices; } catch (e) { /* none */ }
    }
    panel.querySelector(".aa-go").addEventListener("click", function (e) { e.preventDefault(); chat.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); setTimeout(function () { input.focus({ preventScroll: true }); }, 350); });
    // message actions: heart / voice / photocard / copy, and double-tap to heart
    log.addEventListener("click", function (e) {
      var b = e.target.closest(".aa-acts button"), li = e.target.closest(".aa-m");
      if (b && li) {
        var a = b.getAttribute("data-a"), text = li._text || li.querySelector(".aa-b").textContent;
        if (a === "heart") toggleHeart(li);
        else if (a === "voice") speak(text, li);
        else if (a === "card") photocard(text);
        else if (a === "copy") { copyText(text); toast(tr("Copied")); }
        return;
      }
      var cp = e.target.closest("[data-copy]"); if (cp) { copyText(cp.getAttribute("data-copy"), cp); return; }
      if (e.target.closest("[data-ics]")) ics();
    });
    log.addEventListener("dblclick", function (e) { var li = e.target.closest(".aa-m.her"); if (li && !li.classList.contains("aa-typing") && e.target.closest(".aa-b")) { e.preventDefault(); try { window.getSelection().removeAllRanges(); } catch (x) { /* none */ } toggleHeart(li); } });
    var lastTap = 0;
    log.addEventListener("touchend", function (e) {
      var li = e.target.closest(".aa-m.her"); if (!li || !e.target.closest(".aa-b") || e.target.closest("a")) return;
      var t = Date.now(); if (t - lastTap < 320) { e.preventDefault(); toggleHeart(li); lastTap = 0; } else lastTap = t;
    });
    // tabs
    var tabs = panel.querySelector(".aa-tabs");
    var pick = function (id, focus) {
      tabs.querySelectorAll("[role=tab]").forEach(function (b) { var on = b.getAttribute("data-t") === id; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      panel.querySelectorAll(".aa-tabp").forEach(function (p) { p.hidden = p.id !== "aa-p-" + id; });
      if (id === "x") loadFeed();
      if (id === "letters") { if (!lettersLoaded) loadLetters(); var nf = panel.querySelector(".aa-lform [name=name_]"); if (nf && !nf.value) nf.value = ls.get("arcia-name", "") || ""; }
      if (id === "quiz") quizPaint();
      if (id === "profile") paintFan();
    };
    tabs.addEventListener("click", function (e) { var b = e.target.closest("[role=tab]"); if (b) pick(b.getAttribute("data-t")); });
    tabs.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var all = [].slice.call(tabs.querySelectorAll("[role=tab]")), i = all.indexOf(document.activeElement);
      if (i < 0) return;
      pick(all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length].getAttribute("data-t"), true);
    });
    var side = panel.querySelector(".aa-side");
    side.addEventListener("click", function (e) {
      if (e.target.closest("[data-ics]")) ics();
      else if (e.target.closest("[data-remind]")) remind();
      else if (e.target.closest("[data-q=start]")) quizStart();
      else if (e.target.closest(".aa-q-opts button")) quizPick(e.target.closest("button"));
      else if (e.target.closest(".aa-lt-heart")) heartLetter(e.target.closest(".aa-lt-heart"));
      else if (e.target.closest("[data-forget]")) { ls.set("arcia-name", null); paintFan(); }
      else if (e.target.closest("[data-fancard]")) fanCard();
      else if (e.target.closest("[data-lsort]")) {
        var sb = e.target.closest("[data-lsort]"); lettersTop = sb.getAttribute("data-lsort") === "top";
        side.querySelectorAll("[data-lsort]").forEach(function (x) { x.setAttribute("aria-checked", x === sb ? "true" : "false"); });
        loadLetters();
      }
    });
    var lf = panel.querySelector(".aa-lform");
    lf.addEventListener("submit", sendLetter);
    lf.text.addEventListener("input", function () { count(lf); });
    lf.name_.value = ls.get("arcia-name", "") || "";
    panel.querySelector(".aa-profile").innerHTML = profileHtml();
    chips();
    // phones: while the chat box is on screen, the floating bars step aside so the input stays usable
    if ("IntersectionObserver" in window) {
      var seen = false;
      var sync = function () { root.classList.toggle("aa-chat-on", seen && panel.classList.contains("active") && window.innerWidth <= 900); };
      new IntersectionObserver(function (es) { seen = es[0].isIntersecting; sync(); }, { threshold: 0.6 }).observe(form);
      document.addEventListener("arcpad:tab", function () { setTimeout(sync, 0); });
      window.addEventListener("resize", sync);
    }
    // phones: the on-screen keyboard shrinks the visual viewport — keep the input and the last message in view
    var vv = window.visualViewport;
    if (vv) {
      var fit = function () {
        if (document.activeElement !== input || window.innerWidth > 900) { log.style.height = ""; return; }
        var h = Math.round(vv.height - form.offsetHeight - Q(".aa-chat-h").offsetHeight - Q(".aa-sugg").offsetHeight - 24);
        log.style.height = Math.max(150, Math.min(520, h)) + "px";
        stick = true; scroll();
        requestAnimationFrame(function () { chat.scrollIntoView({ block: "end" }); });
      };
      vv.addEventListener("resize", fit);
      input.addEventListener("focus", function () { setTimeout(fit, 250); });
      input.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement !== input) log.style.height = ""; }, 150); });
    }
    // banner parallax
    if (!reduce) {
      var par = panel.querySelector(".aa-par"), ticking = false;
      window.addEventListener("scroll", function () {
        if (ticking || !panel.classList.contains("active")) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; var y = Math.max(0, Math.min(140, window.scrollY * 0.28)); par.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)"; });
      }, { passive: true });
    }
    // history, greeting, streak
    msgs = (ss.get(KEY, []) || []).filter(function (m) { return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"; });
    var sk = streak();
    greet();
    msgs.forEach(function (m, i) { bubble(m.role, m.content, { t: m.t, liked: m.liked, i: m.role === "assistant" ? i : null }); });
    paintCheer(); paintFan(); paintRemind(); scheduleRemind();
    var entered = entrance();
    var introShown = !ls.get("arcia-intro-v1", false);
    if (introShown) setTimeout(intro, entered ? 950 : 0);
    if (sk.fresh && !sk.first && !introShown) {
      var li = bubble("assistant", T(STREAK_MSG).replace("{n}", sk.st.n).replace("{c}", cheerText()), { type: true, cls: "sys" });
      if ([3, 7, 14, 30, 50, 100].indexOf(sk.st.n) >= 0) fx(li, "confetti"); else fx(li, "sparkle");
    }
  }

  // ---------------- photocard book ----------------
  function paintBook() {
    var box = panel.querySelector(".aa-book");
    if (!box) return;
    var book = ls.get("arcia-book", []) || [], col = ls.get("arcia-cards", { common: 0, rare: 0, secret: 0 }) || {};
    var head = '<div class="aa-book-count" data-no-i18n>' + ["common", "rare", "secret"].map(function (r) {
      return '<span class="aa-rar-' + r + '"><b>' + (col[r] || 0) + "</b>" + esc(T(RARITY[r].label).replace(/!+$/, "")) + "</span>";
    }).join("") + "</div>";
    box.innerHTML = head + (book.length ? '<ol class="aa-book-grid">' + book.map(function (c, i) {
      return '<li class="aa-bc aa-rar-' + c.r + '" style="--i:' + Math.min(i, 18) + '"><i class="aa-bc-shine" aria-hidden="true"></i><span class="aa-bc-no" data-no-i18n>No.' + esc(c.s) + '</span><p data-no-i18n>“' + esc(c.q) + '”</p><small data-no-i18n>' + esc(dayStr(new Date(c.t))) + "</small></li>";
    }).join("") + "</ol>" : '<p class="aa-empty">' + esc(T({ en: "No cards yet — make one from any reply♡", ko: "아직 카드가 없어요 — 답장에서 만들어 보세요♡", zh: "还没有小卡 — 在任何回复里制作一张吧♡" })) + "</p>");
  }
  // a fan card: name, streak, quiz, cards and badges — an image to save or share
  function fanCard() {
    var W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d"), img = new Image();
    img.onload = function () {
      var g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0b1430"); g.addColorStop(1, "#08251b"); x.fillStyle = g; x.fillRect(0, 0, W, H);
      var r = Math.min(img.width, img.height);
      x.save(); x.beginPath(); x.arc(W / 2, 330, 190, 0, Math.PI * 2); x.clip(); x.drawImage(img, (img.width - r) / 2, 0, r, r, W / 2 - 190, 140, 380, 380); x.restore();
      x.lineWidth = 10;
      var ring = x.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0); ring.addColorStop(0, "#4d9fff"); ring.addColorStop(1, "#39ff88");
      x.strokeStyle = ring; x.beginPath(); x.arc(W / 2, 330, 196, 0, Math.PI * 2); x.stroke();
      x.textAlign = "center"; x.fillStyle = "#9fd7ff"; x.font = "700 34px Sora, sans-serif"; x.fillText("ARCIA FAN CARD", W / 2, 610);
      var n = ls.get("arcia-name", "") || T({ en: "A fan of ARCIA", ko: "ARCIA의 팬", zh: "ARCIA 的粉丝" });
      x.fillStyle = "#fff"; x.font = "800 76px Sora, sans-serif"; x.fillText(String(n).slice(0, 18), W / 2, 700);
      var st = ls.get("arcia-streak", null) || { n: 0, total: 0 }, col = ls.get("arcia-cards", null) || {}, qz = ls.get("arcia-quiz", null) || { best: 0 };
      var stats = [[T({ en: "Streak", ko: "연속 방문", zh: "连续" }), (st.n || 0) + "d"], [T({ en: "Visits", ko: "방문", zh: "来访" }), String(st.total || 0)],
        [T({ en: "Quiz best", ko: "퀴즈 최고", zh: "测验最佳" }), (qz.best || 0) + "/8"], [T({ en: "Cards", ko: "카드", zh: "小卡" }), String((col.common || 0) + (col.rare || 0) + (col.secret || 0))]];
      stats.forEach(function (s2, i) {
        var bx = 120 + i * 220;
        x.fillStyle = "rgba(255,255,255,.06)"; x.beginPath();
        if (x.roundRect) x.roundRect(bx, 770, 200, 170, 26); else x.rect(bx, 770, 200, 170);
        x.fill();
        x.fillStyle = "#39ff88"; x.font = "800 58px Sora, sans-serif"; x.fillText(s2[1], bx + 100, 860);
        x.fillStyle = "#9fb0c4"; x.font = "600 26px Sora, sans-serif"; x.fillText(s2[0], bx + 100, 905);
      });
      var bs = badges().map(function (b) { return b[1]; });
      x.fillStyle = "#ffe29a"; x.font = "700 34px Sora, sans-serif"; x.fillText(bs.length ? bs.join(" · ") : T({ en: "New fan", ko: "새내기 팬", zh: "新粉丝" }), W / 2, 1030);
      x.fillStyle = "#8fb6ff"; x.font = "600 30px Sora, sans-serif"; x.fillText("@ARCIAonArc · arcircle.app/arcia", W / 2, H - 90);
      c.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        modal('<div class="aa-card-view"><p class="aa-rar" data-no-i18n>' + esc(T({ en: "Your fan card", ko: "나의 팬 카드", zh: "我的粉丝卡" })) + '</p><div class="aa-card-img"><img src="' + url + '" alt="Fan card"></div><div class="aa-rc-row"><a class="aa-rc-btn" href="' + url + '" download="arcia-fan-card.png"><span>Save image</span></a><a class="aa-rc-btn ghost" href="https://x.com/intent/post?text=' + encodeURIComponent("My ARCIA fan card 💙💚 @ARCIAonArc\narcircle.app/arcia") + '" target="_blank" rel="noopener">' + ICON.x + "<span>Post on X</span></a></div></div>", function () { URL.revokeObjectURL(url); });
      }, "image/png");
    };
    img.src = "/images/arcia-portrait.jpg";
  }
  // ---------------- the drawer: ARCIA over any ArcPad page ----------------
  function openDrawer(focus) {
    boot();
    if (panel.classList.contains("active")) {
      chat.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      if (focus) input.focus({ preventScroll: true });
      return;
    }
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.className = "aa-drawer"; drawer.hidden = true;
      drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-label", "ARCIA");
      drawer.innerHTML = '<div class="aa-dr-scrim" data-dr-close></div><div class="aa-dr-sheet"><div class="aa-dr-h"><img src="/images/arcia-avatar-96.jpg" alt="" width="36" height="36"><div><b>ARCIA</b><small>' +
        esc(T({ en: "Ask about this page", ko: "이 화면에 대해 물어보세요", zh: "问问这个页面" })) + '</small></div><a href="' + (HOST ? "/arc#arcia" : "#arcia") + '" class="aa-dr-full" data-dr-close>' +
        esc(T({ en: "Full page", ko: "전체 화면", zh: "完整页面" })) + '</a><button type="button" class="aa-dr-x" data-dr-close aria-label="Close">×</button></div><div class="aa-dr-body"></div></div>';
      document.body.appendChild(drawer);
      drawer.addEventListener("click", function (e) { if (e.target.closest("[data-dr-close]")) closeDrawer(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer && !drawer.hidden) closeDrawer(); });
      document.addEventListener("arcpad:tab", function (e) { if (e.detail && e.detail.tab === "arcia" && drawer && !drawer.hidden) closeDrawer(); });
    }
    if (!home) { home = document.createComment("aa-chat"); chat.parentNode.insertBefore(home, chat); }
    drawer.querySelector(".aa-dr-body").appendChild(chat);
    chat.classList.add("in-drawer");
    drawer.hidden = false;
    document.documentElement.classList.add("aa-dr-open");
    requestAnimationFrame(function () {
      drawer.classList.add("in"); stick = true; scroll();
      if (focus && window.innerWidth > 900) input.focus({ preventScroll: true });
    });
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("in");
    document.documentElement.classList.remove("aa-dr-open");
    setTimeout(function () {
      drawer.hidden = true;
      if (home && home.parentNode) { home.parentNode.insertBefore(chat, home); chat.classList.remove("in-drawer"); }
    }, reduce ? 0 : 240);
  }

  function boot() {
    if (booted) return;
    booted = true;
    build();
    refreshLive();
    loadHearts();
    setInterval(function () { if (panel.classList.contains("active") && !document.hidden) loadHearts(); }, 20000);
    setTimeout(checkWallet, 1200);
    setInterval(function () { if (panel.classList.contains("active")) checkWallet(); }, 5000);
    setInterval(function () { if (panel.classList.contains("active") && !document.hidden) refreshLive(); }, 60000);
    setInterval(function () { if (panel.classList.contains("active")) clock(); }, 1000);
  }
  // Other utilities hand ARCIA a question ("Ask ARCIA" buttons): open her tab and send it.
  window.arcArcia = {
    open: function () { openDrawer(true); },
    ask: function (text) {
      openDrawer(false);
      var tries = 0;
      (function go() { if (!busy && sendBtn) { send(text); return; } if (++tries < 40) setTimeout(go, 150); })();
    },
  };
  document.addEventListener("arcpad:tab", function (e) { if (e.detail && e.detail.tab === "arcia") boot(); });
  if (panel.classList.contains("active") || /^#arcia\b/.test(location.hash)) boot();
  document.addEventListener("arc:lang", function () {
    if (!booted) return;
    chips(); paintCheer(); paintFan(); quizPaint();
    panel.querySelectorAll(".aa-tabs [data-t]").forEach(function (b) { b.textContent = T(TABS[b.getAttribute("data-t")]); });
    panel.querySelector(".aa-profile").innerHTML = profileHtml();
  });
})();
