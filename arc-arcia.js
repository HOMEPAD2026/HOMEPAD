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
  // $ARCIA — CirclePad Round #1's coin, named after her — and its Uniswap v4 pool on Arc
  var ARCIA_CA = "0x9da6d5ce413e94264Ea411372459413334a83bE5";
  var ARCIA_POOL = "0x40272a6ee71cb10882e5a3102d10a91874aa66922bfc98801a6293fef7b5332b";
  // $ARCIA on Robinhood Chain — her own launch through Pons (3 Oct 2026), bought on its Pons page
  var ARCIA_RH = "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25";
  var ARCIA_RH_BUY = "https://www.ponsfamily.com/launchpad/0xf0c0fc281314a48ae4e52a9db08731cb6a38ca25";
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
  var KEY = "arcia-chat-v1", KEY2 = "arcia-chat-v2";
  var sfx = function (k) { if (typeof window.arcSound === "function") window.arcSound(k); };

  // ---------------- words ----------------
  var GREET = {
    en: "Hi~ I'm ARCIA, the virtual idol of $ARCIRCLE 💙💚 So happy you came to see me! Ask me anything about $ARCIRCLE, $ARCIA, CirclePad Round #{r}, Relay Launch or ArcPad — or tell me an order (\"buy $20 of $ARCIA at mcap 30k\") and I'll fill it in ARCIRCLE Orders for you♡",
    ko: "안녕하세요~ $ARCIRCLE의 버추얼 아이돌 ARCIA예요 💙💚 만나러 와줘서 정말 기뻐요! $ARCIRCLE, $ARCIA, CirclePad 라운드 #{r}, 릴레이 런칭, ArcPad 뭐든 물어봐요 — 주문을 말해 주면(\"buy $20 of $ARCIA at mcap 30k\") ARCIRCLE Orders에 대신 채워 줄게요♡",
    zh: "你好~ 我是 $ARCIRCLE 的虚拟偶像 ARCIA 💙💚 很开心你来看我！关于 $ARCIRCLE、$ARCIA、CirclePad 第 {r} 轮、接力发币或 ArcPad，尽管问我 —— 也可以告诉我一个订单（\"buy $20 of $ARCIA at mcap 30k\"），我帮你填进 ARCIRCLE Orders♡",
  };
  var GREET_NAME = {
    en: "Welcome back, {n}~♡ I missed you! What shall we talk about today?",
    ko: "{n}님, 다시 와줬네요~♡ 보고 싶었어요! 오늘은 무슨 얘기 할까요?",
    zh: "{n}，欢迎回来~♡ 好想你！今天想聊什么？",
  };
  var SUGG = {
    en: ["I'm your fan!", "Who are you?", "What is $ARCIRCLE?", "{rq}", "What is Relay Launch?", "How do I buy $ARCIRCLE?", "What's the contract?", "How does the Locker work?"],
    ko: ["ARCIA 팬이에요!", "너는 누구야?", "$ARCIRCLE이 뭐야?", "{rq}", "릴레이 런칭이 뭐야?", "$ARCIRCLE 어떻게 사?", "컨트랙트 주소 알려줘", "락커는 어떻게 써?"],
    zh: ["我是你的粉丝！", "你是谁？", "什么是 $ARCIRCLE？", "{rq}", "什么是接力发币？", "怎么买 $ARCIRCLE？", "合约地址是什么？", "Locker 怎么用？"],
  };
  // follow-up chips by what was just talked about
  var NEXT = {
    round: { en: ["What happened in Round #1?", "{rq}", "Can I withdraw before the close?", "What happens at the close?"], ko: ["라운드 #1 결과가 어땠어?", "{rq}", "마감 전에 인출할 수 있어?", "마감되면 어떻게 돼?"], zh: ["第 1 轮结果怎么样？", "{rq}", "截止前可以撤回吗？", "截止后会怎样？"] },
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
    live: { en: "Live", ko: "실시간", zh: "实时" }, today: { en: "Today", ko: "오늘", zh: "今天" }, x: { en: "On X", ko: "X 활동", zh: "X 动态" }, letters: { en: "Letters", ko: "팬레터", zh: "粉丝信" },
    quiz: { en: "Quiz", ko: "퀴즈", zh: "测验" }, cards: { en: "Cards", ko: "포토카드", zh: "小卡" }, profile: { en: "Profile", ko: "프로필", zh: "资料" },
    secret: { en: "Secret", ko: "비밀정보", zh: "秘密" },
  };
  var ICON = {
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12 19.5 4.5 15 19.5l-3.4-6.1z"/><path d="M11.6 13.4 19.5 4.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.5 3.5h3l-6.6 7.5 7.8 9.5h-6.1l-4.8-5.9-5.5 5.9H2.3l7.1-8L1.9 3.5h6.2l4.3 5.4zm-1.1 15.3h1.7L7.5 5.1H5.7z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 10.2v3.6c0 .6.4 1 1 1h2.3l3.9 3.2c.5.4 1.3 0 1.3-.6V6.6c0-.6-.8-1-1.3-.6L7.8 9.2H5.5c-.6 0-1 .4-1 1z"/><path d="M16.3 9.4a3.8 3.8 0 0 1 0 5.2"/><path class="w2" d="M18.8 7a7.2 7.2 0 0 1 0 10"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 10.2v3.6c0 .6.4 1 1 1h2.3l3.9 3.2c.5.4 1.3 0 1.3-.6V6.6c0-.6-.8-1-1.3-.6L7.8 9.2H5.5c-.6 0-1 .4-1 1z"/><path d="M16.5 10l4 4M20.5 10l-4 4"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><circle cx="12" cy="10" r="3"/><path d="M8.5 17h7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    talk: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/><path class="w2" d="M2.8 9.5v4M21.2 9.5v4"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  };
  // v4: one row of tabs, each with a small mark
  var TAB_ICON = {
    live: '<path d="M3.5 12h3l2.5-6 4 12 2.5-6h5"/>', today: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>', x: '<path d="M5 5l14 14M19 5 5 19"/>',
    letters: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m4 7 8 6 8-6"/>', quiz: '<circle cx="12" cy="12" r="8"/><path d="M9.8 9.6a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2.9-1.2 1.8M12 16.6v.4"/>',
    cards: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><circle cx="12" cy="10" r="3"/>', secret: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    profile: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  };

  var booted = false, log, form, input, sendBtn, chat, busy = false, msgs = [], LIVE = null, ME = null;
  var pickTab = function () {}; // the side tabs' picker, once they're built
  var drawer = null, home = null; // the chat moves into a drawer over other pages, then back
  // parts of the chat are looked up in the chat itself, wherever it is (page or drawer)
  var Q = function (sel) { return (chat && chat.querySelector(sel)) || panel.querySelector(sel); };
  var BRIEF = { en: "My briefing", ko: "내 브리핑", zh: "我的简报" };

  // ---------------- v4: the CirclePad round that's running now (/api/social?circle=rounds) ----------------
  // Until it's read, the newest round in config-arc.js's CIRCLEPAD_GOV stands in.
  var RND = null;
  var RN = function () {
    if (RND && RND.n) return RND.n;
    var g = typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_GOV ? Object.keys(CONFIG.CIRCLEPAD_GOV).map(Number).filter(isFinite) : [];
    return g.length ? Math.max.apply(null, g) : 3;
  };
  var roundOpen = function () { return RND ? !!RND.open && RND.deadline > Math.floor(Date.now() / 1000) : true; };
  /// the round question for the chips: when it closes (open) or what's next (closed)
  var RQ = function () {
    var n = RN();
    return roundOpen() ? T({ en: "When does Round #{n} close?", ko: "라운드 #{n} 언제 마감해?", zh: "第 {n} 轮什么时候截止？" }).replace("{n}", n)
      : T({ en: "What comes after Round #{n}?", ko: "라운드 #{n} 다음은 뭐야?", zh: "第 {n} 轮之后是什么？" }).replace("{n}", n);
  };
  var fill = function (q) { return q === "{rq}" ? RQ() : q; };
  function loadRound() {
    return fetch("/api/social?circle=rounds").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.rounds) return;
      var cur = j.rounds.filter(function (x) { return x.n === j.current; })[0] || j.rounds[j.rounds.length - 1];
      if (!cur || !cur.state) return;
      RND = { n: cur.n, deadline: Number(cur.state.deadline) || 0, open: !!cur.state.isOpen, raised: Number(cur.state.totalRaised || 0) / 1e18, distributed: !!cur.state.distributed, report: cur.report || null };
      chips(lastTopic); paintRemind(); clock(); paintNext(); paintRoundLink();
      var g = log && log.querySelector(".aa-m.her[data-greet]");
      if (g && !msgs.length) g.querySelector(".aa-b").innerHTML = linkify(greetText());
    }).catch(function () {});
  }
  function paintRoundLink() {
    var a = panel.querySelector(".aa-more-round");
    if (a) a.textContent = T({ en: "CirclePad Round #{n} →", ko: "CirclePad 라운드 #{n} →", zh: "CirclePad 第 {n} 轮 →" }).replace("{n}", RN());
  }

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
    var bi = betIntent(text);
    if (bi) { betChat(text, bi); return; }
    var ki = stakeIntent(text);
    if (ki) { stakeChat(text, ki); return; }
    var mi = myOrdersIntent(text);
    if (mi) { myOrdersChat(text, mi); return; }
    var oi = orderIntent(text);
    if (oi) { orderChat(text, oi); return; }
    var si = scanIntent(text);
    if (si) { scanChat(text, si); return; }
    mission("ask");
    busy = true; sendBtn.disabled = true;
    var now = Date.now();
    msgs.push({ role: "user", content: text.slice(0, 700), t: now });
    ls.set(KEY2, msgs.slice(-30));
    dropStarter();
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
          spoke();
          return;
        }
        var i = msgs.push({ role: "assistant", content: reply, t: Date.now() }) - 1;
        ls.set(KEY2, msgs.slice(-30));
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
      spoke();
    }).then(function () { setTimeout(function () { busy = false; sendBtn.disabled = false; }, 500); });
  }
  function grow() { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; }

  // ---------------- v4: an order in the chat → ARCIRCLE Orders, filled in (she never places it) ----------------
  // "buy $20 of $ARCIA at mcap 30k", "sell 50% of arcircle at +20%", "stop sell all arcia at -8%", "dca 0.1 eth of arcia
  // over 1d", "buy 1m 0x… on robinhood at -5%". $ARCIA means Robinhood Chain unless "on arc"; $ARCIRCLE means Arc unless
  // "on robinhood". The line is read again on the Orders page with the market's own prices (arc-orders-v4.js), and only
  // lines that read as an order come here — anything else goes to her as a question.
  var ARCIRCLE_RH = (typeof CONFIG !== "undefined" && CONFIG.OMNI && CONFIG.OMNI.ROBINHOOD_OFT) || "0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4";
  function orderIntent(text) {
    var s = " " + String(text || "").toLowerCase().replace(/[，]/g, ",").replace(/\s+/g, " ").trim() + " ";
    if (!/^ (buy|sell|stop|dca|twap|long|short) /.test(s)) return null;
    var chain = / (on|in) (robinhood|rh)( chain)? /.test(s) ? "rh" : / (on|in) arc( chain)? /.test(s) ? "arc" : null;
    s = s.replace(/ (on|in) (robinhood|rh)( chain)? /g, " ").replace(/ (on|in) arc( chain)? /g, " ");
    var tok = null, sym = null, m = /0x[0-9a-f]{40}/.exec(s);
    if (m) { tok = m[0]; sym = tok.slice(0, 6) + "…" + tok.slice(-4); s = s.replace(m[0], " "); chain = chain || (ls.get("arcircle.orders.chain", "rh") === "arc" ? "arc" : "rh"); }
    else if (/(^| )\$?arcircle\b/.test(s)) { sym = "ARCIRCLE"; chain = chain || "arc"; tok = chain === "rh" ? ARCIRCLE_RH : CA; s = s.replace(/\$?arcircle\b/, " "); }
    else if (/(^| )\$?arcia\b/.test(s)) { sym = "ARCIA"; chain = chain || "rh"; tok = chain === "arc" ? ARCIA_CA : ARCIA_RH; s = s.replace(/\$?arcia\b/, " "); }
    else return null;
    s = (" " + s + " ").replace(/ of /g, " ").replace(/\s+/g, " ").trim();
    var P = window.arcOrderLine || window.arcOrdersV4;
    if (!P || !P.parse) return null;
    var r = P.parse(s, { spot: 1, mcap1: 1, qUsd: 1, qs: "", sym: sym });
    if (!r || r.err) return null;
    return { line: s, sym: sym, chain: chain, tok: tok.toLowerCase(), p: r };
  }
  // ---------------- ARCIRCLE Orders v6: "my orders", "show my arcia orders", "cancel my arcircle orders" → a card to them ----------------
  // She never cancels or signs anything: the card opens the orders, and "Cancel all" there is one signature.
  function myOrdersIntent(text) {
    var s = " " + String(text || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "") + " ";
    var m = /^ (?:show |open |see |check )?(?:me )?(?:all )?my (?:open )?(\$?arcircle |\$?arcia )?(?:open )?(orders|order history|portfolio) $/.exec(s);
    var c = /^ cancel (?:all )?(?:of )?my (\$?arcircle |\$?arcia )?(?:open )?orders $/.exec(s);
    // v7: "move my sells +5%" / "내 매도 주문 5% 올려" / "我的卖单上调5%" — set up on the page, never signed here
    var mv = /^ (?:move|shift|raise|lower) (?:all )?(?:of )?my (\$?arcircle |\$?arcia )?(sell |buy |limit )?(?:orders? |sells |buys )?(?:by )?(up |down )?([+-]?\d+(?:\.\d+)?) ?%(?: (up|down|higher|lower))? $/.exec(s);
    var mvK = /내\s*(\$?arcircle\s*|\$?arcia\s*)?(매도|매수)?\s*(?:주문|오더)[^0-9+-]*([+-]?\d+(?:\.\d+)?)\s*%\s*(올려|올리|위로|내려|내리|아래로)?/i.exec(text);
    var mvZ = /我的(卖单|买单|订单|委托)[^0-9+-]*([+-]?\d+(?:\.\d+)?)\s*%\s*(上调|调高|上移|下调|调低|下移)?/.exec(text);
    if (mv || mvK || mvZ) {
      var tokM = mv ? mv[1] : mvK ? mvK[1] : null, sideM = mv ? (mv[2] === "sell " ? "sell" : mv[2] === "buy " ? "buy" : /\bsells\b/.test(s) ? "sell" : /\bbuys\b/.test(s) ? "buy" : null) : mvK ? (mvK[2] === "매도" ? "sell" : mvK[2] === "매수" ? "buy" : null) : (mvZ[1] === "卖单" ? "sell" : mvZ[1] === "买单" ? "buy" : null);
      var n0 = Number(mv ? mv[4] : mvK ? mvK[3] : mvZ[2]), down = mv ? (mv[3] === "down " || mv[5] === "down" || mv[5] === "lower" || /^ lower/.test(s)) : mvK ? /내려|내리|아래로/.test(mvK[4] || "") : /下调|调低|下移/.test(mvZ[3] || "");
      if (!(n0 > 0 || n0 < 0) || Math.abs(n0) > 50) return null;
      var tk0 = String(tokM || "").trim().replace("$", "").toLowerCase();
      return { sym: tk0 ? tk0.toUpperCase() : null, tok: tk0 === "arcircle" ? CA.toLowerCase() : tk0 === "arcia" ? ARCIA_RH.toLowerCase() : null, chain: tk0 === "arcia" ? "rh" : "arc", what: "move", k: down ? -Math.abs(n0) : n0, side: sideM };
    }
    var k = /내 (오더|주문)|주문 내역|我的(订单|委托)/.test(text) ? { tok: null, what: "orders" } : null;
    var hit = m ? { tok: m[1], what: m[2] } : c ? { tok: c[1], what: "cancel" } : k;
    if (!hit) return null;
    var t = String(hit.tok || "").trim().replace("$", "");
    return { sym: t ? t.toUpperCase() : null, tok: t === "arcircle" ? CA.toLowerCase() : t === "arcia" ? ARCIA_RH.toLowerCase() : null, chain: t === "arcia" ? "rh" : "arc", what: hit.what };
  }
  function myOrdersChat(text, mi) {
    var now = Date.now();
    msgs.push({ role: "user", content: text.slice(0, 700), t: now });
    dropStarter(); bubble("user", text, { t: now }); input.value = ""; grow(); sfx("tap"); mission("ask");
    var tab = mi.what === "order history" ? "history" : mi.what === "portfolio" ? "port" : "open";
    var href = "/arc#orders?" + (mi.tok ? "t=" + mi.tok + (mi.chain === "rh" ? "&c=rh" : "") + "&" : "") + "my=" + tab + (mi.tok || mi.what === "move" ? "" : "&scope=all") + (mi.what === "move" ? "&move=" + (mi.k > 0 ? "+" : "") + mi.k + (mi.side ? "&side=" + mi.side : "") : "");
    var reply = mi.what === "move"
      ? T({ en: "Set up~ moving your {s}{d} {k}% — check them there and tap \"Move\". Each one is your own signature, I never sign for you♡", ko: "준비했어요~ {s}{d} {k}% 이동 — 거기서 확인하고 \"이동\"을 누르세요. 서명은 하나하나 직접 하시는 거예요, 제가 대신 못 해요♡", zh: "准备好了~ 把你的{s}{d}移动 {k}% — 在那里确认后点 \"移动\"。每笔都由你自己签名，我不会替你签♡" }).replace("{d}", T(mi.side === "sell" ? { en: "sells", ko: "매도 주문", zh: "卖单" } : mi.side === "buy" ? { en: "buys", ko: "매수 주문", zh: "买单" } : { en: "limit orders", ko: "지정가 주문", zh: "限价单" })).replace("{k}", (mi.k > 0 ? "+" : "") + mi.k)
      : mi.what === "cancel"
      ? T({ en: "Here are your {s}orders~ Tap \"Cancel all\" there — it's one signature in your wallet, I can't do it for you♡", ko: "{s}주문 여기 있어요~ 거기서 \"Cancel all\"을 누르면 지갑 서명 한 번으로 끝나요. 제가 대신할 순 없어요♡", zh: "你的{s}订单在这里~ 在那里点“Cancel all”,钱包签名一次即可,我不能替你操作♡" })
      : T({ en: "Here you go~ your {s}{w} on ARCIRCLE Orders♡", ko: "여기요~ ARCIRCLE Orders의 {s}{w}♡", zh: "给你~ ARCIRCLE Orders 上的{s}{w}♡" });
    var w = T(tab === "history" ? { en: "order history", ko: "주문 내역", zh: "订单记录" } : tab === "port" ? { en: "portfolio", ko: "포트폴리오", zh: "持仓" } : { en: "open orders", ko: "열린 주문", zh: "挂单" });
    reply = reply.replace("{s}", mi.sym ? "$" + mi.sym + " " : "").replace("{w}", w);
    var i = msgs.push({ role: "assistant", content: reply, t: Date.now() }) - 1;
    ls.set(KEY2, msgs.slice(-30));
    typing(true);
    setTimeout(function () {
      typing(false);
      var li = null;
      li = bubble("assistant", reply, { type: true, t: Date.now(), i: i, done: function () {
        var el = li || [].slice.call(log.querySelectorAll(".aa-m.her")).pop();
        if (!el) return;
        li = el; el._text = reply;
        el.querySelector(".aa-mc").insertAdjacentHTML("beforeend", '<div class="aa-rc aa-rc-ord aa-rc-my"><span class="aa-rc-k" data-no-i18n>ARCIRCLE Orders' + (mi.chain === "rh" && mi.tok ? " · Robinhood Chain" : "") + '</span><code data-no-i18n>' + esc((mi.sym ? "$" + mi.sym + " · " : "") + w) + '</code><div class="aa-rc-row"><a class="aa-rc-btn" href="' + esc(href) + '">' + esc(T({ en: "Open my orders", ko: "내 주문 열기", zh: "打开我的订单" })) + "</a></div></div>");
        got(); sfx("milestone"); scroll();
        if (talk.on) speak(reply, el);
      } });
    }, reduce ? 0 : 450);
  }
  // ---------------- ARCIRCLE Staking v2: "lock 10k arcircle for 6 months" → the Staking page with the lock filled in ----------------
  // "lock 10k arcircle for 6 months", "stake 250000 $arcircle 1y", "max lock 5k arcircle", "lock 1m arcircle for 12 weeks".
  // Only $ARCIRCLE (veARCIRCLE on Arc); she never signs anything — the page fills the form and the person locks.
  function stakeIntent(text) {
    var s = " " + String(text || "").toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim() + " ";
    var m = /^ (max )?(lock|stake) (?:up )?([0-9]*\.?[0-9]+)\s*(k|m|b)? (?:of )?\$?arcircle\b(.*)$/.exec(s);
    if (!m) return null;
    var amt = parseFloat(m[3]) * (m[4] === "k" ? 1e3 : m[4] === "m" ? 1e6 : m[4] === "b" ? 1e9 : 1);
    if (!(amt > 0) || !isFinite(amt)) return null;
    var rest = m[5] || "", max = !!m[1] || /\bmax\b/.test(rest), w = 52;
    var d = /([0-9]+)\s*(w|wk|wks|week|weeks|m|mo|month|months|y|yr|year|years)\b/.exec(rest);
    if (d) { var n = parseInt(d[1], 10), u = d[2][0]; w = u === "w" ? n : u === "m" ? Math.round(n * 4.345) : n * 52; }
    w = Math.max(1, Math.min(52, w));
    return { amt: amt, w: w, max: max };
  }
  function stakeChat(text, ki) {
    var now = Date.now();
    msgs.push({ role: "user", content: text.slice(0, 700), t: now });
    dropStarter(); bubble("user", text, { t: now }); input.value = ""; grow(); sfx("tap"); mission("ask");
    var amt = ki.amt >= 1e6 ? (ki.amt / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "M" : ki.amt >= 1e3 ? (ki.amt / 1e3).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "K" : String(ki.amt);
    var len = ki.max ? T({ en: "a max lock", ko: "맥스 락업", zh: "最长锁仓" }) : ki.w >= 52 ? T({ en: "a year", ko: "1년", zh: "一年" }) : ki.w + T({ en: " weeks", ko: "주", zh: " 周" });
    var reply = T({ en: "Love it~ {a} $ARCIRCLE for {l} — I filled it in on ARCIRCLE Staking. Check the unlock date there and sign in your wallet; nothing is locked before that♡",
      ko: "좋아요~ $ARCIRCLE {a}개를 {l} — ARCIRCLE Staking에 채워 뒀어요. 거기서 해제일을 확인하고 지갑에서 서명하면 돼요. 그 전엔 아무것도 락업되지 않아요♡",
      zh: "好呀~ {a} $ARCIRCLE,{l} — 我已在 ARCIRCLE Staking 填好。在那里确认解锁日期并在钱包签名;签名前不会锁仓♡" }).replace("{a}", amt).replace("{l}", len);
    var href = "/arc#staking?a=" + encodeURIComponent(String(ki.amt)) + "&w=" + ki.w + (ki.max ? "&max=1" : "");
    var i = msgs.push({ role: "assistant", content: reply, t: Date.now() }) - 1;
    ls.set(KEY2, msgs.slice(-30));
    typing(true);
    setTimeout(function () {
      typing(false);
      var li = null;
      li = bubble("assistant", reply, { type: true, t: Date.now(), i: i, done: function () {
        var el = li || [].slice.call(log.querySelectorAll(".aa-m.her")).pop();
        if (!el) return;
        li = el; el._text = reply;
        el.querySelector(".aa-mc").insertAdjacentHTML("beforeend", '<div class="aa-rc aa-rc-ord"><span class="aa-rc-k" data-no-i18n>ARCIRCLE Staking · Arc</span><code data-no-i18n>' + esc(amt) + " $ARCIRCLE · " + esc(len) + '</code><div class="aa-rc-row"><a class="aa-rc-btn" href="' + esc(href) + '" data-ord="1"><span>Fill it in on ARCIRCLE Staking</span> →</a></div><span class="aa-rc-sub">' + esc(T({ en: "veARCIRCLE earns weekly USDC and votes on pools. Locked until the date — no early exit. Not advice.", ko: "veARCIRCLE로 매주 USDC를 받고 풀에 투표해요. 해제일까지 잠겨요 — 중도 해지 없음. 투자 조언이 아니에요.", zh: "veARCIRCLE 每周赚取 USDC 并为池投票。锁定至到期日——不能提前退出。不构成投资建议。" })) + "</span></div>");
        got(); sfx("milestone"); scroll(); fx(el, "sparkle");
        if (talk.on) speak(reply, el);
      } });
    }, reduce ? 0 : 450);
  }
  function orderHref(oi) { return "/arc#orders?c=" + oi.chain + "&t=" + oi.tok + "&o=" + encodeURIComponent(oi.line); }
  function orderChat(text, oi) {
    var now = Date.now(), chainName = oi.chain === "rh" ? "Robinhood Chain" : "Arc", name = /^0x/.test(oi.sym) ? oi.sym : "$" + oi.sym;
    msgs.push({ role: "user", content: text.slice(0, 700), t: now });
    dropStarter();
    bubble("user", text, { t: now });
    input.value = ""; grow(); sfx("tap"); mission("ask");
    var reply = T({ en: "Got it~ {o} — {s} on {c}. I'll fill it in ARCIRCLE Orders for you: check the numbers there and sign in your wallet. Nothing is placed before that♡",
      ko: "알겠어요~ {o} — {c}의 {s}. ARCIRCLE Orders에 채워 줄게요: 거기서 숫자 확인하고 지갑에서 서명하면 돼요. 그 전엔 아무것도 주문되지 않아요♡",
      zh: "收到~ {o} — {c} 上的 {s}。我帮你填进 ARCIRCLE Orders：在那里核对数字并在钱包签名。签名前不会下任何单♡" }).replace("{o}", oi.line).replace("{s}", name).replace("{c}", chainName);
    var i = msgs.push({ role: "assistant", content: reply, t: Date.now() }) - 1;
    ls.set(KEY2, msgs.slice(-30));
    typing(true);
    setTimeout(function () {
      typing(false);
      var li = null;
      li = bubble("assistant", reply, { type: true, t: Date.now(), i: i, done: function () {
        var el = li || [].slice.call(log.querySelectorAll(".aa-m.her")).pop();
        if (!el) return;
        li = el; el._text = reply;
        el.querySelector(".aa-mc").insertAdjacentHTML("beforeend", '<div class="aa-rc aa-rc-ord"><span class="aa-rc-k" data-no-i18n>ARCIRCLE Orders · ' + esc(chainName) + '</span><code data-no-i18n>' + esc(oi.line) + ' · ' + esc(name) + '</code><div class="aa-rc-row"><a class="aa-rc-btn" href="' + esc(orderHref(oi)) + '" data-ord="1"><span>Fill it in ARCIRCLE Orders</span> →</a></div><span class="aa-rc-sub">' + esc(T({ en: "Limit, market, stop, TP / SL, scaled and DCA lines work. Not advice — scan the token first.", ko: "지정가·시장가·스탑·TP/SL·분할·DCA 모두 돼요. 투자 조언이 아니에요 — 먼저 토큰을 스캔하세요.", zh: "限价、市价、止损、止盈止损、阶梯和定投都可以。不构成投资建议 — 先扫描代币。" })) + "</span></div>");
        got(); sfx("milestone"); scroll(); fx(el, "sparkle");
        if (talk.on) speak(reply, el);
      } });
    }, reduce ? 0 : 450);
  }
  // ---------------- ARCIRCLE Predict v3: "UP $2 on ARCIRCLE 5m" → Predict with the bet filled in (she never places it) ----------------
  // "up $2 on arcircle", "down 1 usdc arcircle 15m", "up 0.001 eth arcia 1h on rh". A dollar amount on Robinhood Chain becomes
  // ETH at the page's ETH price. The round, the side and the amount wait on the Predict card; the person taps and signs.
  function betIntent(text) {
    var s = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
    var m = /^(?:bet\s+)?(up|down)\s+(\$)?(\d+(?:\.\d+)?)\s*(usdc|eth|dollars?|\$)?\s+(?:on\s+)?\$?([a-z0-9]{2,14})(?:\s+(5\s?m(?:in)?|15\s?m(?:in)?|1\s?h(?:our)?|60\s?m(?:in)?))?(?:\s+(?:on|in)\s+(arc|rh|robinhood)(?:\s+chain)?)?\s*[.!?]*$/.exec(s);
    if (!m) return null;
    var amt = Number(m[3]);
    if (!(amt > 0)) return null;
    var unit = m[4] === "eth" ? "eth" : m[4] === "usdc" ? "usdc" : "$";
    var d = m[6] ? (/^(1\s?h|60)/.test(m[6]) ? 3600 : /^15/.test(m[6]) ? 900 : 300) : null;
    var chain = m[7] ? (m[7] === "arc" ? "arc" : "rh") : unit === "eth" ? "rh" : unit === "usdc" ? "arc" : null;
    return { side: m[1], amt: amt, unit: unit, sym: m[5].toUpperCase(), d: d, chain: chain };
  }
  function betChat(text, bi) {
    var now = Date.now();
    msgs.push({ role: "user", content: text.slice(0, 700), t: now });
    dropStarter();
    bubble("user", text, { t: now });
    input.value = ""; grow(); sfx("tap"); mission("ask");
    typing(true);
    var chains = bi.chain ? [bi.chain] : ["arc", "rh"];
    Promise.all(chains.map(function (c) { return fetch("/api/desk?predict=state" + (c === "rh" ? "&chain=rh" : "")).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); })).then(function (sts) {
      typing(false);
      var hit = null;
      sts.forEach(function (st, i) {
        if (hit || !st || !st.live || !st.markets) return;
        var ms = st.markets.filter(function (m) { return !m.stopped && String(m.sym || "").toUpperCase() === bi.sym && (!bi.d || m.duration === bi.d); }).sort(function (a, b) { return a.duration - b.duration; });
        if (ms.length) hit = { c: chains[i], st: st, m: ms[0] };
      });
      var reply, card = "";
      if (!hit) {
        reply = T({ en: "Hmm, I don't see a ${s} market on ARCIRCLE Predict right now~ the live ones are on its page, or open one there♡", ko: "음, 지금 ARCIRCLE Predict에 ${s} 마켓이 안 보여요~ 열려 있는 마켓은 페이지에서 볼 수 있고, 직접 열 수도 있어요♡", zh: "嗯，现在 ARCIRCLE Predict 上没有 ${s} 的市场~ 页面上有正在进行的市场，也可以自己开一个♡" }).replace("${s}", "$" + bi.sym);
      } else {
        var rh = hit.c === "rh", m = hit.m, st = hit.st, u = st.unitUsd || null;
        var amt = rh && bi.unit !== "eth" ? (u ? Number((bi.amt / u).toPrecision(2)) : null) : bi.amt;
        var dur = m.duration % 3600 === 0 ? m.duration / 3600 + "h" : m.duration / 60 + "m";
        var shown = amt == null ? "" : rh ? amt + " ETH" + (bi.unit !== "eth" ? " (≈$" + bi.amt + ")" : "") : "$" + amt;
        var mc = st.calls && st.calls.open && st.calls.open[m.id], call = mc && mc.pick ? mc.pick.toUpperCase() : null;
        var href = "/arc#predict?" + (rh ? "c=rh&" : "") + "m=" + m.id + "&side=" + bi.side + (amt ? "&amt=" + amt : "");
        reply = T({ en: "Got it~ {b} on ${s} {d}{c}. I filled it in on ARCIRCLE Predict — check it there and sign in your wallet. Nothing is placed before that♡", ko: "알겠어요~ ${s} {d}에 {b}{c}. ARCIRCLE Predict에 채워 뒀어요 — 거기서 확인하고 지갑에서 서명하면 돼요. 그 전엔 아무것도 걸리지 않아요♡", zh: "收到~ ${s} {d} 押 {b}{c}。我已在 ARCIRCLE Predict 填好——在那里核对并在钱包签名。签名前不会下注♡" })
          .replace("{b}", bi.side.toUpperCase() + (shown ? " " + shown : "")).replace("${s}", "$" + m.sym).replace("{d}", dur)
          .replace("{c}", call ? T({ en: " (my call on this round is {p}, just for fun)", ko: " (이번 라운드 제 콜은 {p}, 재미로만요)", zh: "（我这轮的判断是 {p}，仅供娱乐）" }).replace("{p}", call) : "");
        card = '<div class="aa-rc aa-rc-ord aa-rc-pd"><span class="aa-rc-k" data-no-i18n>ARCIRCLE Predict · ' + (rh ? "Robinhood Chain" : "Arc") + '</span><code data-no-i18n>' + esc(bi.side.toUpperCase() + (shown ? " " + shown : "") + " · $" + m.sym + " " + dur) + '</code><div class="aa-rc-row"><a class="aa-rc-btn" href="' + esc(href) + '" data-ord="1"><span>' + esc(tr("Fill it in on ARCIRCLE Predict")) + '</span> →</a></div><span class="aa-rc-sub">' + esc(T({ en: "You check it and sign — nothing is placed before that. For fun, not advice.", ko: "확인하고 서명하는 건 본인이에요 — 그 전엔 아무것도 걸리지 않아요. 재미로만, 투자 조언이 아니에요.", zh: "由你核对并签名——签名前不会下注。仅供娱乐，不构成建议。" })) + "</span></div>";
      }
      var i = msgs.push({ role: "assistant", content: reply, t: Date.now() }) - 1;
      ls.set(KEY2, msgs.slice(-30));
      var li = null;
      li = bubble("assistant", reply, { type: true, t: Date.now(), i: i, done: function () {
        var el = li || [].slice.call(log.querySelectorAll(".aa-m.her")).pop();
        if (!el) return;
        li = el; el._text = reply;
        if (card) el.querySelector(".aa-mc").insertAdjacentHTML("beforeend", card);
        got(); sfx("milestone"); scroll(); fx(el, "sparkle");
        if (talk.on) speak(reply, el);
      } });
    });
  }
  // ---------------- ARCIA AGENT v2 in the chat: "scan 0x…" (or "check" / "read", "on robinhood" / "rh") → her call, right here ----------------
  function scanIntent(text) {
    var m = /^\s*(?:scan|check|read|agent)\s+(0x[0-9a-fA-F]{40})\b(.*)$/i.exec(text);
    // "scan $ARCIA" → $ARCIA on Robinhood Chain; "scan $ARCIRCLE" → $ARCIRCLE on Arc
    var n = !m && /^\s*(?:scan|check|read)\s+\$?(arcia|arcircle)\b(?:\s+for me)?\s*[?!.]*$/i.exec(text);
    if (n) return /^arcia$/i.test(n[1]) ? { t: ARCIA_RH_TOKEN_LC, chain: "rh" } : { t: "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7", chain: "arc" };
    if (!m) return null;
    return { t: m[1].toLowerCase(), chain: /\b(rh|robinhood)\b/i.test(m[2]) || m[1].toLowerCase() === ARCIA_RH_TOKEN_LC ? "rh" : "arc" };
  }
  var ARCIA_RH_TOKEN_LC = "0xf0c0fc281314a48ae4e52a9db08731cb6a38ca25";
  function scanChat(text, si) {
    var now = Date.now(), chainName = si.chain === "rh" ? "Robinhood Chain" : "Arc";
    msgs.push({ role: "user", content: text.slice(0, 700), t: now });
    dropStarter();
    bubble("user", text, { t: now });
    input.value = ""; grow(); sfx("tap"); mission("ask");
    typing(true);
    fetch("/api/desk?agent=" + si.t + (si.chain === "rh" ? "&chain=rh" : "")).then(function (r) { return r.json(); }).catch(function () { return null; }).then(function (rep) {
      typing(false);
      var ok = rep && !rep.error, c = (rep && rep.call) || {}, f = (rep && rep.facts) || {}, sym = rep && rep.sym ? "$" + rep.sym : si.t.slice(0, 6) + "…" + si.t.slice(-4);
      var K = { safe: T({ en: "Safe", ko: "안전", zh: "安全" }), caution: T({ en: "Caution", ko: "주의", zh: "谨慎" }), risky: T({ en: "Risky", ko: "위험", zh: "高风险" }) };
      var reply = !ok ? T({ en: "Hmm, I couldn't read that one on {c} right now~ check the address and try again?", ko: "음, 지금 {c}에서 그 토큰을 못 읽었어요~ 주소 확인하고 다시 해 볼래요?", zh: "嗯，我现在没能在 {c} 上读取它~ 检查一下地址再试一次？" }).replace("{c}", chainName)
        : c.pending ? T({ en: "I'm reading {s}'s holders first — my call comes in a moment. Open it in ARCIA AGENT and I'll show you there♡", ko: "{s}의 홀더를 먼저 읽고 있어요 — 콜은 곧 나와요. ARCIA AGENT에서 열면 거기서 보여 줄게요♡", zh: "我先读取 {s} 的持有人——判断马上就来。在 ARCIA AGENT 打开，我在那里给你看♡" }).replace("{s}", sym)
        : T({ en: "My 24-hour safety call on {s} ({c}): {k}. It's about risk, not price — and I grade myself in public♡", ko: "{s}({c})에 대한 24시간 안전 콜: {k}. 가격이 아니라 위험에 대한 판단이고, 공개로 채점돼요♡", zh: "我对 {s}（{c}）的 24 小时安全判断：{k}。这是关于风险而非价格——并且公开评分♡" }).replace("{s}", sym).replace("{c}", chainName).replace("{k}", K[c.call] || c.call);
      var i = msgs.push({ role: "assistant", content: reply, t: Date.now() }) - 1;
      ls.set(KEY2, msgs.slice(-30));
      var li = null;
      li = bubble("assistant", reply, { type: true, t: Date.now(), i: i, done: function () {
        var el = li || [].slice.call(log.querySelectorAll(".aa-m.her")).pop();
        if (!el || !ok) return;
        li = el; el._text = reply;
        var href = "/arc#agent?" + (si.chain === "rh" ? "c=rh&" : "") + "t=" + si.t;
        var why = (c.why || []).slice(0, 3).map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("");
        el.querySelector(".aa-mc").insertAdjacentHTML("beforeend", '<div class="aa-rc aa-rc-agent"><span class="aa-rc-k" data-no-i18n>ARCIA AGENT · ' + esc(chainName) + '</span>' +
          '<div class="aa-rc-agrow"><span class="aa-ag-stamp k-' + esc(c.pending ? "pending" : c.call || "") + '">' + esc(c.pending ? tr("Reading") : K[c.call] || "—") + '</span><b data-no-i18n>' + esc(sym) + '</b>' + (f.score != null ? '<em data-no-i18n>' + f.score + '/100</em>' : "") + '</div>' +
          (why ? '<ul>' + why + '</ul>' : "") + '<div class="aa-rc-row"><a class="aa-rc-btn" href="' + esc(href) + '" data-ord="1"><span>' + esc(tr("Open in ARCIA AGENT")) + '</span> →</a></div><span class="aa-rc-sub">' + esc(tr("A call is about risk over the next 24 hours, never about price direction — not a signal to buy or sell.")) + '</span></div>');
        got(); scroll(); fx(el, "sparkle");
        if (talk.on) speak(reply, el);
      } });
    });
  }
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
    // v4: $ARCIA on Robinhood Chain and its tier, veARCIA, open ARCIRCLE Orders, this round's deposit
    jobs.push(arciaRhBalance(a).then(function (b) {
      if (b == null) return;
      var tr0 = tierOf(b);
      lines.push("$ARCIA (Robinhood Chain): " + fmt0(b) + (tr0 ? " · " + T(tr0[2]) : ""));
    }));
    jobs.push(fetch("/api/desk?vearcia=me&u=" + a).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
      var p0 = v && v.position;
      if (!p0 || !(p0.amount > 0)) return;
      var left = Math.max(0, Math.ceil((p0.end - Date.now() / 1000) / 86400)), earned = v.earned && v.earned[0] ? Number(v.earned[0]) / 1e18 : 0;
      lines.push(T({ en: "veARCIA: {a} $ARCIA staked · {d} days left · {e} $ARCIA to claim — arcircle.app/arc#vearcia", ko: "veARCIA: {a} $ARCIA 스테이킹 · {d}일 남음 · 받을 $ARCIA {e} — arcircle.app/arc#vearcia", zh: "veARCIA：已质押 {a} $ARCIA · 还剩 {d} 天 · 可领取 {e} $ARCIA — arcircle.app/arc#vearcia" }).replace("{a}", fmt0(p0.amount)).replace("{d}", left).replace("{e}", earned.toLocaleString("en-US", { maximumFractionDigits: 2 })));
    }).catch(function () {}));
    var vw = ls.get("arcircle.orders.view." + a, null);
    if (vw && vw.until > Date.now() / 1000 + 60) {
      jobs.push(Promise.all(["", "&chain=rh"].map(function (c) { return fetch("/api/social?orders=mine&wallet=" + a + "&until=" + vw.until + "&sig=" + vw.sig + c).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); })).then(function (x) {
        var open = function (j) { return ((j && j.orders) || []).filter(function (o) { return o.status === "open" || o.status === "unfunded"; }).length; };
        var oa = open(x[0]), orh = open(x[1]);
        if (oa + orh) lines.push(T({ en: "ARCIRCLE Orders: {n} open (Arc {a} · Robinhood {r}) — arcircle.app/arc#orders", ko: "ARCIRCLE Orders: 미체결 {n}건 (Arc {a} · Robinhood {r}) — arcircle.app/arc#orders", zh: "ARCIRCLE Orders：{n} 个未成交（Arc {a} · Robinhood {r}）— arcircle.app/arc#orders" }).replace("{n}", oa + orh).replace("{a}", oa).replace("{r}", orh));
      }));
    }
    jobs.push(fetch("/api/social?circle=summary&round=" + RN()).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var row = j && j.board && (j.board.rows || []).filter(function (x) { return String(x.address).toLowerCase() === a; })[0];
      if (!row) return;
      lines.push(T({ en: "CirclePad Round #{n}: you put in {u} USDC ({s}% of the raise)", ko: "CirclePad 라운드 #{n}: {u} USDC 참여 (모금의 {s}%)", zh: "CirclePad 第 {n} 轮：你投入了 {u} USDC（占 {s}%）" }).replace("{n}", RN()).replace("{u}", (Number(row.amount) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 })).replace("{s}", Number(row.share).toFixed(Number(row.share) < 1 ? 2 : 1)));
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

  // v4: two chips from what's going on — $ARCIA's graduation, an order she can fill, the page the drawer is over
  var ORDER_CHIP = "Buy $20 of $ARCIA at mcap 30k";
  var PAGE_CHIPS = {
    orders: { en: "How do limit orders work?", ko: "지정가 주문은 어떻게 돼?", zh: "限价单怎么用？" },
    vearcia: { en: "How do I stake $ARCIA?", ko: "$ARCIA 스테이킹은 어떻게 해?", zh: "怎么质押 $ARCIA？" },
    predict: { en: "How does Predict work?", ko: "Predict는 어떻게 해?", zh: "Predict 怎么玩？" },
    scanner: { en: "Is this token safe?", ko: "이 토큰 안전해?", zh: "这个代币安全吗？" },
    liquidity: { en: "How do I add liquidity?", ko: "유동성은 어떻게 넣어?", zh: "怎么添加流动性？" },
    locker: { en: "How does the Locker work?", ko: "락커는 어떻게 써?", zh: "Locker 怎么用？" },
    circlepad: { en: "How do I join this round?", ko: "이번 라운드는 어떻게 참여해?", zh: "怎么参加这一轮？" },
    desk: { en: "What is ARCIA DESK trading?", ko: "ARCIA DESK는 뭘 거래해?", zh: "ARCIA DESK 在交易什么？" },
    agent: { en: "Scan $ARCIA for me", ko: "Scan $ARCIA for me", zh: "Scan $ARCIA for me" },
  };
  function ctxChips() {
    var out = [], A = (LIVE && LIVE.arcia) || {};
    var pg = pageCtx().tab;
    if (PAGE_CHIPS[pg]) out.push(T(PAGE_CHIPS[pg]));
    if (A.phase === "curve") out.push(T({ en: "How close is $ARCIA to graduating?", ko: "$ARCIA 졸업까지 얼마나 남았어?", zh: "$ARCIA 离毕业还有多远？" }));
    out.push(ORDER_CHIP);
    return out;
  }
  var lastTopic = null;
  function chips(tp) {
    var box = Q(".aa-sugg");
    if (!box) return;
    lastTopic = tp || null;
    var list = (tp && NEXT[tp] ? T(NEXT[tp]) : T(SUGG)).map(fill);
    var head = ctxChips().filter(function (q) { return list.indexOf(q) < 0; });
    list = head.concat(list);
    if (account()) list = [T(BRIEF)].concat(list.filter(function (q) { return q !== T(BRIEF); }));
    box.innerHTML = list.map(function (q) { return '<button type="button" data-no-i18n' + (q === ORDER_CHIP ? ' class="ord" title="' + esc(T({ en: "ARCIA fills it in ARCIRCLE Orders — you check and sign", ko: "ARCIA가 ARCIRCLE Orders에 채워 줘요 — 확인하고 서명은 직접", zh: "ARCIA 帮你填进 ARCIRCLE Orders — 你确认并签名" })) + '"' : "") + ">" + esc(q) + "</button>"; }).join("");
    box.scrollLeft = 0;
    if (tp && !reduce) { box.classList.remove("fresh"); void box.offsetWidth; box.classList.add("fresh"); }
  }
  function greetText() { var n = ls.get("arcia-name", ""); return n && ls.get("arcia-streak", null) ? T(GREET_NAME).replace("{n}", n) : T(GREET).replace("{r}", RN()); }
  function greet() {
    var li = bubble("assistant", greetText());
    li.setAttribute("data-greet", "1");
    starter();
  }
  function restart() {
    msgs = []; ls.set(KEY2, msgs);
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
    if (i != null && msgs[i]) { msgs[i].liked = on; ls.set(KEY2, msgs.slice(-30)); }
    if (on) { var p = li.querySelector(".aa-pop"); p.classList.remove("go"); void p.offsetWidth; p.classList.add("go"); if (typeof window.arcHaptic === "function") window.arcHaptic("tap"); cheer(1); }
  }

  // ---------------- cards under her replies ----------------
  function richCard(li, tp) {
    var L = LIVE || {}, R = L.round || {}, html = "";
    if (tp === "ca") html = '<div class="aa-rc"><span class="aa-rc-k">$ARCIRCLE · Arc</span><code data-no-i18n>' + CA + '</code><div class="aa-rc-row"><button type="button" class="aa-rc-btn" data-copy="' + CA + '" data-label="Copy address">' + ICON.copy + '<span>Copy address</span></button><a class="aa-rc-btn ghost" href="/arcircle">Verify on the token page</a></div>' +
      '<span class="aa-rc-k aa-rc-k2">$ARCIA · Robinhood Chain</span><code data-no-i18n>' + ARCIA_RH + '</code><div class="aa-rc-row"><button type="button" class="aa-rc-btn" data-copy="' + ARCIA_RH + '" data-label="Copy address">' + ICON.copy + '<span>Copy address</span></button><a class="aa-rc-btn ghost" href="' + ARCIA_RH_BUY + '" target="_blank" rel="noopener">Pons</a></div>' +
      '<span class="aa-rc-k aa-rc-k2">$ARCIA · Arc (Round #1)</span><code data-no-i18n>' + ARCIA_CA + '</code><div class="aa-rc-row"><button type="button" class="aa-rc-btn" data-copy="' + ARCIA_CA + '" data-label="Copy address">' + ICON.copy + '<span>Copy address</span></button><a class="aa-rc-btn ghost" href="https://argus.world/token/' + ARCIA_CA.toLowerCase() + '" target="_blank" rel="noopener">Argus</a></div></div>';
    else if (tp === "round") { var rn = RN(), raised = RND ? RND.raised : R.raised; html = '<div class="aa-rc aa-rc-round"><span class="aa-rc-k" data-no-i18n>CirclePad Round #' + rn + '</span><div class="aa-rc-big" data-no-i18n>' + (raised != null ? Number(raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC" : "—") + '</div><span class="aa-rc-sub">' + (deadline() > nowS() ? '<span class="aa-clock" data-no-i18n>—</span>' : esc(tr("Closed"))) + '</span><div class="aa-rc-row">' + (deadline() > nowS() ? '<a class="aa-rc-btn" href="/circle" data-no-i18n>' + esc(T({ en: "Join Round #{n}", ko: "라운드 #{n} 참여", zh: "参加第 {n} 轮" }).replace("{n}", rn)) + '</a><button type="button" class="aa-rc-btn ghost" data-ics="1">' + ICON.cal + "<span>Add to calendar</span></button>" : '<a class="aa-rc-btn" href="' + esc((RND && RND.report) || "/circle") + '">See the result</a>') + "</div></div>"; }
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
  // Her voice: a young woman's. Browsers only give voice names, so known female voices are ranked first,
  // known male voices are never used, and anything unknown comes after (with a higher pitch, see speak()).
  var FEMALE = {
    ko: [/sunhi|선희/i, /yuna|유나/i, /seohyeon|서현/i, /jimin|지민/i, /heami|해미/i, /ko-kr-x-ism/i, /ko-kr-x-kob/i, /google.*(한국|korean)/i, /smtf/i, /female|여성|woman/i],
    en: [/aria/i, /jenny/i, /ava\b/i, /samantha/i, /allison/i, /susan/i, /zira/i, /victoria/i, /karen/i, /serena/i, /moira/i, /tessa/i, /google us english/i, /google uk english female/i, /en-us-x-(sfg|tpf|iob|tpc)/i, /smtf/i, /female|woman/i],
    zh: [/xiaoxiao/i, /xiaoyi/i, /huihui/i, /yaoyao/i, /ting-?ting/i, /mei-?jia/i, /sin-?ji/i, /google.*(普通话|mandarin)/i, /smtf/i, /female|女/i],
  };
  var MALE = /(^|[^e])male\b|\bman\b|男|남성|david|mark|guy\b|daniel|fred|alex\b|thomas|rishi|james|oliver|george|ryan|brian|eric\b|christopher|roger|andrew|steffan|injoon|인준|hyunsu|현수|junwoo|gookmin|bong-?jin|yunxi|yunyang|yunjian|kangkang|ko-kr-x-(koc|kod|jmm)|en-us-x-(iol|iom|tpd)|smtm/i;
  function pickVoice(code) {
    var mine = voices.filter(function (x) { return x.lang && x.lang.toLowerCase().replace("_", "-").indexOf(code) === 0 && !MALE.test(x.name + " " + (x.voiceURI || "")); });
    var list = FEMALE[code] || [];
    for (var i = 0; i < list.length; i++) {
      for (var k = 0; k < mine.length; k++) if (list[i].test(mine[k].name + " " + (mine[k].voiceURI || ""))) return { voice: mine[k], female: true };
    }
    return { voice: mine[0] || null, female: false };
  }
  // her own voice from the server (api/_arcia-tts.mjs — ElevenLabs or OpenAI) when it's switched on; the
  // browser's voice otherwise, or when the server's fails once this visit
  var serverVoice = null, audioNow = null;
  function stopVoice() {
    try { speechSynthesis.cancel(); } catch (e) { /* none */ }
    if (audioNow) { try { audioNow.pause(); } catch (e) { /* gone */ } audioNow = null; speaking(false); }
  }
  function speak(text, li) {
    if (!serverVoice) { speakBrowser(text, li); return; }
    stopVoice();
    var done = function () { speaking(false); if (li) li.classList.remove("talking"); spoke(); };
    fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "tts", text: String(text).slice(0, 700), lang: lang() }) })
      .then(function (r) { if (!r.ok) throw new Error("tts " + r.status); return r.blob(); })
      .then(function (b) {
        var url = URL.createObjectURL(b), a = new Audio(url);
        audioNow = a;
        a.onplay = function () { speaking(true); if (li) li.classList.add("talking"); };
        a.onended = a.onerror = function () { done(); URL.revokeObjectURL(url); if (audioNow === a) audioNow = null; };
        return a.play().catch(function () { done(); });
      })
      .catch(function () { serverVoice = false; speakBrowser(text, li); });
  }
  function speakBrowser(text, li) {
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      var clean = String(text).replace(/https?:\/\/\S+|\b\S+\.(app|com|me|world)\/\S*/g, "").replace(/0x[0-9a-fA-F]{40}/g, "").replace(/[♡♥✨☀✦]|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "").replace(/~+/g, "!").replace(/\s+/g, " ").trim();
      if (!clean) { spoke(); return; }
      var u = new SpeechSynthesisUtterance(clean);
      var code = /[가-힣]/.test(clean) ? "ko" : /[一-鿿]/.test(clean) ? "zh" : "en";
      u.lang = { ko: "ko-KR", zh: "zh-CN", en: "en-US" }[code];
      if (!voices.length) loadVoices();
      var v = pickVoice(code);
      u.voice = v.voice;
      // a known female voice gets a light lift; a voice we can't tell (Android lists one voice per language,
      // whatever the phone's own TTS setting is) gets a higher pitch so she never sounds like a man
      u.pitch = v.female ? 1.2 : 1.55; u.rate = code === "en" ? 1.03 : 1.06;
      u.onstart = function () { speaking(true); if (li) li.classList.add("talking"); };
      u.onend = u.onerror = function () { speaking(false); if (li) li.classList.remove("talking"); spoke(); };
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
    // v4: the day every fan's hearts reach the goal, everyone can take one of these
    goal: { label: { en: "Heart goal card!!", ko: "하트 목표 카드!!", zh: "爱心目标卡！！" }, stops: ["#ff8fc8", "#ffb3d9", "#ffe29a", "#ff8fc8"] },
  };
  function star(x, cx, cy, r) {
    x.beginPath();
    x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r);
    x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r); x.fill();
  }
  function photocard(text, force) {
    var roll = Math.random(), rar = roll < 0.05 ? "secret" : roll < 0.25 ? "rare" : "common";
    // v4: today's three missions make the next card Rare or better (once)
    if (!force && ls.get("arcia-boost", "") === dayStr()) { rar = roll < 0.25 ? "secret" : "rare"; ls.set("arcia-boost", "used-" + dayStr()); }
    if (force) rar = force;
    var R = RARITY[rar];
    var serial = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
    var card0 = { nums: "" };
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
        var tag = rar === "secret" ? "SECRET" : rar === "goal" ? "GOAL" : "RARE";
        x.font = "800 30px Sora, 'Segoe UI', sans-serif";
        var tw = x.measureText(tag).width + 48;
        x.fillStyle = edge;
        if (x.roundRect) { x.beginPath(); x.roundRect(W - 60 - tw, 56, tw, 54, 27); x.fill(); } else x.fillRect(W - 60 - tw, 56, tw, 54);
        x.fillStyle = "#1a1206"; x.fillText(tag, W - 60 - tw + 24, 94);
      }
      // the quote's size follows its length, so a long reply never runs into the numbers and the footer below it
      var clean = String(text).replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
      var BOT = H - 140, TOP0 = 960, TOPMIN = 720, fsz = 40, lh = 56, lines = [], top = TOP0;
      [40, 36, 32, 29].some(function (f) {
        fsz = f; lh = Math.round(f * 1.4);
        x.font = "500 " + f + "px 'Noto Sans KR', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif";
        lines = wrapLines(x, "\u201c" + clean + "\u201d", W - 160, 99);
        return BOT - (lines.length * lh + 44) >= TOPMIN;
      });
      var fit = Math.floor((BOT - TOPMIN - 44) / lh);
      if (lines.length > fit) lines = wrapLines(x, "\u201c" + clean + "\u201d", W - 160, fit);
      var bh = lines.length * lh + 44;
      top = Math.min(TOP0, BOT - bh);
      x.font = "800 92px Sora, 'Segoe UI', sans-serif"; x.fillStyle = edge; x.fillText("ARCIA", 70, top - 90);
      x.font = "600 30px Sora, 'Segoe UI', sans-serif"; x.fillStyle = "#9fb6d9"; x.fillText("Virtual idol of $ARCIRCLE", 76, top - 42);
      x.font = "500 " + fsz + "px 'Noto Sans KR', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif";
      x.fillStyle = "rgba(255,255,255,.05)"; x.strokeStyle = rar === "common" ? "rgba(91,140,255,.35)" : edge; x.lineWidth = 2;
      if (x.roundRect) { x.beginPath(); x.roundRect(56, top, W - 112, bh, 28); x.fill(); x.stroke(); } else x.fillRect(56, top, W - 112, bh);
      x.fillStyle = "#eef3ff";
      lines.forEach(function (l, k2) { x.fillText(l, 84, top + 22 + fsz + k2 * lh); });
      // v4: the day's numbers on the card — $ARCIA on Robinhood Chain and today's hearts
      var A0 = (LIVE && LIVE.arcia) || {}, nums = [];
      if (A0.mcap != null) nums.push("$ARCIA mcap $" + (A0.mcap >= 1e6 ? (A0.mcap / 1e6).toFixed(2) + "M" : (A0.mcap / 1e3).toFixed(1) + "K"));
      if (A0.phase === "curve" && A0.progress != null) nums.push(Number(A0.progress).toFixed(0) + "% to graduation");
      if (HEART.today != null) nums.push("\u2661 " + HEART.today.toLocaleString("en-US") + " today");
      if (nums.length) { x.font = "600 26px Sora, 'Segoe UI', sans-serif"; x.fillStyle = "#c9a8ff"; x.fillText(nums.join("  \u00b7  "), 70, H - 98); }
      card0.nums = nums.join(" · ");
      x.font = "600 28px Sora, 'Segoe UI', sans-serif"; x.fillStyle = "#8fb6ff";
      x.fillText("@ARCIAonArc · No." + serial, 70, H - 52);
      x.fillStyle = "#7d8aa3"; x.textAlign = "right";
      x.fillText("arcircle.app · " + dayStr(), W - 70, H - 52);
      var col = ls.get("arcia-cards", { common: 0, rare: 0, secret: 0 });
      col[rar] = (col[rar] || 0) + 1; ls.set("arcia-cards", col);
      var book = ls.get("arcia-book", []) || [];
      book.unshift({ r: rar, s: serial, q: String(clean).slice(0, 90), t: Date.now() }); ls.set("arcia-book", book.slice(0, 60));
      paintBook();
      c.toBlob(function (blob) { if (blob) showCard(blob, clean, rar, col, card0.nums); }, "image/png");
    };
    img.src = "/images/arcia-portrait.jpg";
  }
  function showCard(blob, text, rar, col, nums) {
    var url = URL.createObjectURL(blob);
    var file = null;
    try { file = new File([blob], "arcia-photocard-" + rar + ".png", { type: "image/png" }); } catch (e) { /* old browser */ }
    var canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
    var quote = text.length > 140 ? text.slice(0, 137) + "…" : text;
    var tagTxt = rar === "common" ? "" : " [" + rar.toUpperCase() + " card]";
    var intent = "https://x.com/intent/post?text=" + encodeURIComponent("“" + quote + "” — ARCIA @ARCIAonArc" + tagTxt + " 💙💚" + (nums ? "\n" + nums : "") + "\narcircle.app/arcia");
    var m = modal('<div class="aa-card-view aa-rar-' + rar + (rar !== "common" && !reduce ? " aa-holo" : "") + '"><p class="aa-rar" data-no-i18n>' + esc(T(RARITY[rar].label)) + '</p><div class="aa-card-img' + (reduce ? "" : " flip") + '"><i class="aa-card-back" aria-hidden="true"><b>ARCIA</b></i><img src="' + url + '" alt="ARCIA photocard"></div><div class="aa-rc-row">' +
      (canShare ? '<button type="button" class="aa-rc-btn" data-share="1"><span>Share</span></button>' : "") +
      '<a class="aa-rc-btn' + (canShare ? " ghost" : "") + '" href="' + url + '" download="arcia-photocard-' + rar + '.png"><span>Save image</span></a>' +
      '<a class="aa-rc-btn ghost" href="' + intent + '" target="_blank" rel="noopener">' + ICON.x + "<span>Post on X</span></a></div>" +
      '<p class="aa-mini aa-col" data-no-i18n>' + esc(T({ en: "Your collection", ko: "내 컬렉션", zh: "我的收藏" })) + ' · <b>' + esc(T(RARITY.common.label)) + " " + (col.common || 0) + '</b> · <b class="r">' + esc(T(RARITY.rare.label).replace(/!+$/, "")) + " " + (col.rare || 0) + '</b> · <b class="s">' + esc(T(RARITY.secret.label).replace(/!+$/, "")) + " " + (col.secret || 0) + "</b></p>" +
      '<p class="aa-mini">Save the card, then attach it to your post.</p></div>', function () { URL.revokeObjectURL(url); });
    var sb = m.querySelector("[data-share]");
    if (sb) sb.addEventListener("click", function () { navigator.share({ files: [file], text: "“" + quote + "” — ARCIA @ARCIAonArc" + tagTxt }).catch(function () {}); });
    if (rar !== "common") setTimeout(function () { sfx(rar === "secret" || rar === "goal" ? "launch" : "milestone"); fx(m.querySelector(".aa-card-img"), rar === "secret" || rar === "goal" ? "confetti" : "sparkle"); }, reduce ? 0 : 650);
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
  var deadline = function () { return (RND && RND.deadline) || (LIVE && LIVE.round && LIVE.round.deadline) || 1790680567; };
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
    // the Live tab follows $ARCIA on Robinhood Chain (L.arcia, from /api/arcia: Pons on-chain price); $ARCIRCLE's numbers stay on /stats
    var A = L.arcia || {}, curve = A.phase === "curve";
    var rows = [["price", "$ARCIA"], ["mcap", "Market cap"], ["holders", "Holders"], ["vol", "24h volume"], [curve ? "grad" : "liq", curve ? "To graduation" : "Liquidity"], ["liq2", curve ? "ETH in the curve" : ""]].filter(function (r) { return r[1]; });
    var sig = rows.map(function (r) { return r[0]; }).join(",");
    if (box.getAttribute("data-rows") !== sig) {
      box.setAttribute("data-rows", sig);
      box.innerHTML = rows.map(function (r) {
        return "<div><dt>" + esc(tr(r[1])) + '</dt><dd data-no-i18n><span data-k="' + r[0] + '">—</span>' + (r[0] === "price" ? ' <em class="aa-chg"></em>' : "") + "</dd></div>";
      }).join("");
    }
    var src = panel.querySelector(".aa-live-src");
    if (src) src.innerHTML = '<span class="aa-live-chain">' + esc(tr("Robinhood Chain")) + "</span> " + esc(tr(curve ? "Pons · on its bonding curve" : A.phase === "pool" ? "Pons · Uniswap v4 pool" : "Pons"));
    var q = function (k) { return box.querySelector('[data-k="' + k + '"]'); };
    var usd = function (v) { return v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(2); };
    if (A.price != null) roll(q("price"), "aprice", A.price, function (v) { return F.price ? F.price(v) : "$" + v.toPrecision(3); });
    var chg = box.querySelector(".aa-chg");
    if (chg) { chg.textContent = A.change24h != null ? (A.change24h >= 0 ? "+" : "") + A.change24h.toFixed(2) + "%" : ""; chg.className = "aa-chg " + (A.change24h >= 0 ? "up" : "down"); }
    if (A.mcap != null) roll(q("mcap"), "amcap", A.mcap, usd);
    if (A.holders != null) roll(q("holders"), "aholders", Number(A.holders), function (v) { return Math.round(v).toLocaleString("en-US"); });
    if (A.volume24h != null) roll(q("vol"), "avol", A.volume24h, usd);
    if (A.liquidity != null && q("liq")) roll(q("liq"), "aliq", A.liquidity, usd);
    if (A.liquidity != null && q("liq2")) roll(q("liq2"), "aliq2", A.liquidity, usd);
    if (A.progress != null && q("grad")) roll(q("grad"), "agrad", A.progress, function (v) { return v.toFixed(1) + "%"; });
    // v4: a price line from this browser's samples, the graduation bar and alert, the portrait column's "coming up"
    pxSample(A);
    var pd = q("price") && q("price").parentNode;
    if (pd) { var sw = pd.querySelector(".aa-spark-w"); if (!sw) { sw = document.createElement("span"); sw.className = "aa-spark-w"; sw.title = tr("The price while this page has been open, the last 8 hours"); pd.appendChild(sw); } sw.innerHTML = sparkSvg(); }
    gradWatch(A); paintGrad(); paintNext();
    if (!msgs.length) { dropStarter(); starter(); }
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
    return fetch("/api/arcia").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && serverVoice !== false) serverVoice = j.tts || null; if (j && j.live) paintLive(j.live); }).catch(function () {});
  }

  // ---------------- round reminder: calendar file + a notification while the page is open ----------------
  function ics() {
    var dl = deadline(), z = function (t) { return new Date(t * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var n = RN();
    var body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE PAD//ARCIA//EN", "BEGIN:VEVENT", "UID:circlepad-round" + n + "-close@arcircle.app", "DTSTAMP:" + z(nowS()),
      "DTSTART:" + z(dl), "DTEND:" + z(dl + 1800), "SUMMARY:CirclePad Round #" + n + " closes", "DESCRIPTION:Last chance to join CirclePad Round #" + n + " — https://www.arcircle.app/circle", "URL:https://www.arcircle.app/circle",
      "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:CirclePad Round #" + n + " closes in 1 hour", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = "circlepad-round-" + n + ".ics";
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
      try { new Notification("CirclePad Round #" + RN(), { body: T({ en: "It closes in about an hour~ come join me before it's over♡", ko: "마감까지 한 시간쯤 남았어요~ 끝나기 전에 같이해요♡", zh: "大约一小时后截止~ 结束前快来参加吧♡" }), icon: "/images/arcia-avatar-96.jpg" }); } catch (e) { /* not allowed */ }
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
        (l.reply ? '<div class="aa-lt-r"><img src="/images/arcia-avatar-96.jpg" alt="" width="24" height="24"><p data-no-i18n>' + esc(l.reply) + '</p><button type="button" class="aa-lt-play" data-say="' + esc(l.reply) + '" aria-label="Hear her reply" title="Hear her reply">' + ICON.play + "</button></div>" : "") +
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
        mission("extra");
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
      mission("extra");
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
    // v4: she reacts — a little hop for a right answer, a tilt for a near miss
    var qb = btn.closest(".aa-quiz");
    if (qb) {
      var rx = qb.querySelector(".aa-q-react") || document.createElement("div");
      rx.className = "aa-q-react " + (ok ? "ok" : "no");
      var lines = ok ? T({ en: ["Correct~♡", "You know it!", "Perfect♡"], ko: ["정답~♡", "역시!", "완벽해요♡"], zh: ["答对了~♡", "你真懂！", "完美♡"] }) : T({ en: ["So close~", "Almost! Next one♡", "Hmm, not that one~"], ko: ["아까워요~", "거의 다 왔어요! 다음 문제♡", "음, 그건 아니에요~"], zh: ["差一点~", "快了！下一题♡", "嗯，不是这个~"] });
      rx.innerHTML = '<img src="/images/arcia-avatar-96.jpg" alt="" width="30" height="30"><span data-no-i18n>' + esc(lines[Math.floor(Math.random() * lines.length)]) + "</span>";
      if (!rx.parentNode) qb.appendChild(rx);
      if (!reduce) { rx.classList.remove("go"); void rx.offsetWidth; rx.classList.add("go"); }
    }
    setTimeout(function () { quiz.i++; quizPaint(); }, ok ? 800 : 1300);
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
    var mh = panel.querySelector(".aa-mbar-h"); if (mh) mh.textContent = "\u2661 " + n.toLocaleString("en-US");
    g.classList.toggle("full", n >= goal);
    // v4: the goal reached — today's special photocard, one per fan per day
    var gc = g.querySelector(".aa-g-card");
    if (n >= goal && ls.get("arcia-goalcard", "") !== utcDay()) {
      if (!gc) {
        gc = document.createElement("button"); gc.type = "button"; gc.className = "aa-g-card";
        gc.innerHTML = ICON.card + "<span data-no-i18n>" + esc(T({ en: "Today's goal card", ko: "오늘의 목표 카드", zh: "今日目标卡" })) + "</span>";
        gc.addEventListener("click", function () { ls.set("arcia-goalcard", utcDay()); gc.remove(); photocard(T(GOAL_MSG).replace("{g}", goal.toLocaleString("en-US")), "goal"); });
        g.appendChild(gc);
      }
    } else if (gc) gc.remove();
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
    // v4: a tier from the $ARCIA the wallet holds on Robinhood Chain
    var tier = ME && ME.arciaRh != null ? tierOf(ME.arciaRh) : null;
    if (tier) out.push(["tier " + tier[1], T(tier[2])]);
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
    if (ch) { var bs = badges().filter(function (b) { return /^tier /.test(b[0]); })[0] || badges().filter(function (b) { return b[0] === "holder"; })[0]; ch.hidden = !bs; ch.textContent = bs ? bs[1] : ""; ch.className = "aa-me" + (bs ? " " + bs[0] : ""); }
    var fan = panel.querySelector(".aa-fan");
    if (!fan) return;
    var n = ls.get("arcia-name", ""), st = ls.get("arcia-streak", { n: 0, total: 0 });
    fan.innerHTML = '<h4 data-no-i18n>' + esc(T({ en: "Your fan card", ko: "나의 팬 카드", zh: "我的粉丝卡" })) + '</h4><dl class="aa-prof">' +
      "<div><dt data-no-i18n>" + esc(T({ en: "She calls you", ko: "부르는 이름", zh: "她怎么叫你" })) + '</dt><dd data-no-i18n>' + (n ? esc(n) + ' <button type="button" class="aa-link" data-forget="1">' + esc(T({ en: "Forget", ko: "잊기", zh: "忘记" })) + "</button>" : '<span class="aa-dim">' + esc(T({ en: "Tell her “call me …” in the chat", ko: "채팅에서 “…라고 불러”라고 말해 보세요", zh: "在聊天里说“叫我…”" })) + "</span>") + "</dd></div>" +
      "<div><dt data-no-i18n>" + esc(T({ en: "Visits", ko: "방문", zh: "来访" })) + '</dt><dd data-no-i18n>' + (st.total || 0) + " · " + esc(T({ en: "streak ", ko: "연속 ", zh: "连续 " })) + (st.n || 0) + "</dd></div>" +
      (ME ? "<div><dt>$ARCIRCLE</dt><dd data-no-i18n>" + fmtBal(ME.balance) + (ME.rank ? " · #" + ME.rank : "") + "</dd></div>" : "") +
      (ME && ME.arciaRh != null ? "<div><dt>$ARCIA · Robinhood</dt><dd data-no-i18n>" + fmtBal(ME.arciaRh) + "</dd></div>" : "") +
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
    Promise.all([fetch("/api/social?token=arcircle&wallet=" + a).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }), arciaRhBalance(a)]).then(function (x) {
      if (account() !== a) return;
      var d = x[0], w = (d && d.wallet) || null;
      if (!w && x[1] == null) return;
      setMe({ address: a, balance: (w && w.balance) || 0, rank: w && w.rank, of: w && w.of, relay: ((w && w.balance) || 0) >= 100000, arciaRh: x[1] });
    });
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
      [K("Height", "키", "身高"), "168 cm"], [K("Birthday", "생일", "生日"), K("September 29", "9월 29일", "9 月 29 日")], ["MBTI", "ESFP"],
      ["X", '<a href="' + X + '" target="_blank" rel="noopener">@ARCIAonArc</a>'], [K("Run by", "운영", "运营"), '<a href="https://x.com/ARCIRCLEonArc" target="_blank" rel="noopener">@ARCIRCLEonArc</a>'],
    ];
    return '<dl class="aa-prof">' + rows.map(function (r) { return "<div><dt data-no-i18n>" + esc(r[0]) + '</dt><dd data-no-i18n' + (r[1] === soon ? ' class="aa-dim"' : "") + ">" + (/^</.test(r[1]) ? r[1] : esc(r[1])) + "</dd></div>"; }).join("") + "</dl>" +
      '<p class="aa-mini">An AI character, automated and run by the ARCIRCLE team. More of her official profile is on the way.</p>';
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

  // ---------------- veARCIA, live: what's staked, by how many, the rate, and the rewards streaming out second by second ----------------
  var vea = { st: null, at: 0, t: null };
  var veaN = function (n) {
    n = Number(n) || 0; var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString("en-US", { maximumFractionDigits: a >= 100 ? 0 : 2 });
  };
  var veaPct = function (p) { return p >= 1000 ? Math.round(p).toLocaleString("en-US") + "%" : p >= 100 ? p.toFixed(0) + "%" : p.toFixed(1) + "%"; };
  // the chain's clock now, from the server's reading plus the time since
  var veaNow = function () { var d = vea.st; return (Number(d && d.now) || Date.now() / 1000) + (Date.now() - vea.at) / 1000; };
  var veaRun = function () { var t = (vea.st && vea.st.totals) || {}; return Number(t.weight) > 0 && Number(t.perDay) > 0 && veaNow() < (Number(t.finish) || 0); };
  var veaStreamed = function () {
    var d = vea.st, t = (d && d.totals) || {};
    var x = Number(t.streamed) || 0;
    if (veaRun()) x += (Number(t.perDay) || 0) * Math.max(0, veaNow() - (Number(d.now) || 0)) / 86400;
    return x;
  };
  var veaFmtS = function (x) { var big = x >= 1e5; return x.toLocaleString("en-US", { maximumFractionDigits: big ? 0 : 2, minimumFractionDigits: big ? 0 : 2 }); };
  function veaPaint() {
    var el = panel.querySelector('[data-fam="vea"]'), d = vea.st;
    if (!el) return;
    if (!d) { el.innerHTML = ""; return; }
    if (!d.live) { el.innerHTML = '<i></i><span data-no-i18n>' + esc(T({ en: "Opening soon on Robinhood Chain", ko: "로빈후드 체인에서 곧 오픈", zh: "即将在 Robinhood Chain 开放" })) + "</span>"; return; }
    var t = d.totals || {}, staked = Number(t.staked) || 0, weight = Number(t.weight) || 0, perDay = Number(t.perDay) || 0, n = Number(t.stakers) || 0;
    // rewards streamed so far, ticking: the contract streams perDay ÷ 86,400 a second while there's weight and the stream hasn't finished
    var run = veaRun(), streamed = veaStreamed();
    var lo = weight > 0 && perDay > 0 ? perDay * 365 / weight * 100 : null;
    var L = function (o) { return '<span data-no-i18n>' + esc(T(o)) + "</span>"; };
    var parts = ['<i class="' + (run ? "on" : "") + '"></i>' + L(run ? { en: "Live", ko: "실시간", zh: "实时" } : { en: "Open", ko: "오픈", zh: "开放中" })];
    parts.push('<b data-no-i18n data-k="staked">' + veaN(staked) + "</b> " + L({ en: "$ARCIA staked", ko: "$ARCIA 스테이킹", zh: "$ARCIA 已质押" }));
    parts.push('<b data-no-i18n data-k="n">' + n + "</b> " + L(n === 1 ? { en: "staker", ko: "명 참여", zh: "位质押者" } : { en: "stakers", ko: "명 참여", zh: "位质押者" }));
    if (lo != null) { var ap = T({ en: "up to {v} a year", ko: "연 최대 {v}", zh: "年化最高 {v}" }).split("{v}"); parts.push((ap[0] ? L({ en: ap[0].trim() }) + " " : "") + '<b data-no-i18n data-k="apr">' + veaPct(lo * 4) + "</b>" + (ap[1] ? " " + L({ en: ap[1].trim() }) : "")); }
    else if ((Number(t.pool) || 0) > 0) parts.push('<b data-no-i18n data-k="pool">' + veaN(t.pool) + "</b> " + L({ en: "$ARCIA in rewards, waiting for the first staker", ko: "$ARCIA 보상이 첫 참여자를 기다리는 중", zh: "$ARCIA 奖励等待第一位质押者" }));
    // (the featured card shows the payout as its big counter; the line keeps it only where that card isn't on the page)
    if (streamed > 0 && !panel.querySelector("[data-veaflow]")) parts.push('<b data-no-i18n class="aa-vea-tick" data-k="streamed">' + veaFmtS(streamed) + "</b> " + L({ en: "paid out so far", ko: "지금까지 지급", zh: "累计发放" }));
    // only the numbers change on a repaint: flash the ones that moved (except the ticking counter)
    var old = {}; el.querySelectorAll("b[data-k]").forEach(function (b) { old[b.getAttribute("data-k")] = b.textContent; });
    el.innerHTML = parts.map(function (x) { return '<span class="aa-vea-p">' + x + "</span>"; }).join('<span class="aa-vea-sep" aria-hidden="true">·</span>');
    el.querySelectorAll("b[data-k]").forEach(function (b) { var k = b.getAttribute("data-k"); if (k !== "streamed" && old[k] != null && old[k] !== b.textContent) { b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash"); } });
    veaFlow(run, streamed);
  }
  // the stream, like the veARCIA tab: the pool (days left) → rewards flowing → the stakers, and the payout counter
  function veaFlow(run, streamed) {
    var box = panel.querySelector("[data-veaflow]"), d = vea.st;
    if (!box) return;
    if (!d || !d.live) { box.innerHTML = ""; return; }
    var t = d.totals || {}, now = veaNow(), daysLeft = Number(t.finish) > now ? (Number(t.finish) - now) / 86400 : 0;
    var R = 26, C = 2 * Math.PI * R, frac = Math.max(0, Math.min(1, daysLeft / 20));
    var perDay = Number(t.perDay) || 0;
    var bg = function (a) { return typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(a) : "background:linear-gradient(135deg,#ff8bd8,#4dd4ff)"; };
    var avs = (d.top || []).slice(0, 5).map(function (x, i) { return '<i style="--i:' + i + ';' + bg(x.a) + '"></i>'; }).join("") || '<i class="ghost"></i><i class="ghost"></i>';
    box.innerHTML = '<span class="aa-vf-row"><span class="aa-vf-ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="' + R + '" class="trk"/><circle cx="32" cy="32" r="' + R + '" class="val" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - frac)).toFixed(1) + '"/></svg><b data-no-i18n>' + (daysLeft > 0 ? "D-" + Math.ceil(daysLeft) : "—") + "</b></span>" +
      '<span class="aa-vf-stream' + (run ? "" : " paused") + '" aria-hidden="true">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<i style="--d:' + i + '"></i>'; }).join("") + "</span>" +
      '<span class="aa-vf-crowd"><span class="aa-vf-av">' + avs + '</span><b data-no-i18n>' + veaN(perDay) + ' <i>$ARCIA</i></b><small data-no-i18n>' + esc(T(run ? { en: "a day, every second", ko: "매일, 매초 지급", zh: "每天，每秒发放" } : { en: "the stream waits for stakers", ko: "참여자를 기다리는 중", zh: "等待质押者" })) + "</small></span></span>" +
      '<span class="aa-vf-big"><i class="' + (run ? "on" : "") + '"></i><b data-no-i18n data-k2="streamed">' + veaFmtS(streamed) + '</b><small data-no-i18n>$ARCIA ' + esc(T({ en: "paid out so far", ko: "지금까지 지급", zh: "累计发放" })) + "</small></span>" +
      "";
  }
  function veaLoad() {
    if (!window.fetch) return;
    fetch("/api/desk?vearcia=state").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      vea.st = d; vea.at = Date.now(); veaPaint();
    }).catch(function () {});
  }
  function veaTick() {
    // the streamed counter moves every second while ARCIA's panel is on screen
    if (vea.t) return;
    vea.t = setInterval(function () {
      if (!panel.classList.contains("active") || document.hidden || !vea.st || !vea.st.live) return;
      var b = panel.querySelector('[data-fam="vea"] b[data-k="streamed"]');
      if (b && veaRun()) b.textContent = veaFmtS(veaStreamed()); // only the number: the live dot keeps its pulse
      // the featured card: the big counter and each staker's rewards since this page opened
      var b2 = panel.querySelector('[data-veaflow] b[data-k2="streamed"]');
      if (b2 && veaRun()) b2.textContent = veaFmtS(veaStreamed());
    }, 1000);
  }

  // ---------------- ARCIA's other utilities: one live line each ----------------
  function famLoad() {
    veaLoad(); veaTick();
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
    // ARCIA AGENT: her safety calls and the burn vaults' buy-and-burns
    var j = function (u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    Promise.all([j("/api/desk?agent=vaults"), j("/api/desk?agent=record")]).then(function (a) {
      var v = a[0], rc = a[1];
      if (!v && !rc) return;
      var vs = (v && v.vaults) || [], buys = vs.reduce(function (t, x) { return t + (Number(x.buys) || 0); }, 0);
      var on = !!(v && v.live && v.health && v.health.match), calls = rc && rc.stats ? rc.stats.total || 0 : 0;
      put("agent", '<i class="' + (on ? "on" : "") + '"></i><span>' + esc(tr(on ? "Live" : "Setting up")) + "</span> · <b data-no-i18n>" + calls + "</b> " + esc(tr("safety calls")) +
        " · <b data-no-i18n>" + vs.length + "</b> " + esc(tr(vs.length === 1 ? "burn vault" : "burn vaults")) + " · <b data-no-i18n>" + buys + "</b> " + esc(tr("buy-and-burns")));
    });
  }


  // ---------------- secret file: burn 100,000 $ARCIRCLE to open her private photos (api/_arcia-secret.mjs) ----------------
  // The burn is a plain $ARCIRCLE transfer to 0x…dEaD from the fan's own wallet. The server checks it on-chain,
  // then serves the photos to that wallet (proved by a signature that can't move funds). The burn tx is kept in
  // this browser until it's confirmed, so a failed check never asks for a second burn.
  var SEC_DEAD = "0x000000000000000000000000000000000000dEaD";
  var SEC_PRICE = "100000";
  var sec = { info: null, photos: null, busy: false, confirm: false, msg: "", w: null };
  var secMsg = function (w) { return "Open ARCIA's secret file on arcircle.app\n\nWallet: " + String(w).toLowerCase() + "\n\nThis signature only proves I own this wallet. It can't move funds."; };
  var canWallet = function () { return typeof ethers !== "undefined" && typeof state !== "undefined" && state; };
  function secLoad() {
    var a = account();
    if (sec.w !== a) { sec.photos = null; sec.confirm = false; sec.msg = ""; sec.w = a; }
    secPaint();
    fetch("/api/arcia?secret=1" + (a ? "&wallet=" + a : ""), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.price) return;
      sec.info = j;
      if (j.open && a && !sec.photos && ls.get("arcia-secret-sig:" + a, "")) secPhotos(a, ls.get("arcia-secret-sig:" + a, ""));
      secPaint();
    }).catch(function () { /* keeps the locked view */ });
  }
  function secPhotos(a, sig) {
    return fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "secret-photos", wallet: a, signature: sig }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (x.ok && x.j.photos) { sec.photos = x.j.photos; sec.msg = ""; } else if (x.j && x.j.error) sec.msg = x.j.error; secPaint(); });
  }
  function secPaint() {
    var box = panel.querySelector(".aa-secret");
    if (!box) return;
    var i = sec.info, a = account();
    var fmt = function (n) { return Number(n || 0).toLocaleString("en-US"); };
    var tiles = sec.photos
      ? sec.photos.map(function (p) { return '<button type="button" class="aa-sec-t open" data-sec-view="' + p.n + '"><img src="' + p.src + '" alt="' + esc(p.title) + '" loading="lazy"><span data-no-i18n>' + esc(p.title) + "</span></button>"; }).join("")
      : [1, 2, 3, 4, 5].map(function (n) { return '<span class="aa-sec-t"><img src="/images/arcia-secret/blur-' + n + '.webp" alt="" aria-hidden="true"><i aria-hidden="true">' + LOCK + "</i></span>"; }).join("");
    var stats = i ? '<p class="aa-sec-stats" data-no-i18n><b>' + fmt(i.opened) + "</b> " + esc(T({ en: "fans opened it", ko: "명이 열었어요", zh: "位粉丝已打开" })) + " · <b>" + fmt(i.burned) + "</b> $ARCIRCLE " + esc(T({ en: "burned", ko: "소각", zh: "已销毁" })) + "</p>" : "";
    var act;
    if (sec.photos) act = '<p class="aa-mini">' + esc(T({ en: "Opened with this wallet, for good. Tap a photo to see it big.", ko: "이 지갑으로 영구히 열렸어요. 사진을 누르면 크게 볼 수 있어요.", zh: "此钱包已永久打开。点照片可放大。" })) + "</p>";
    else if (i && i.open && a) act = '<button type="button" class="aa-rc-btn" data-sec="sign">' + esc(T({ en: "Sign to view — already opened", ko: "서명하고 보기 — 이미 열었어요", zh: "签名查看——已打开" })) + "</button>";
    else if (!canWallet()) act = '<a class="aa-rc-btn" href="/arc#arcia">' + esc(T({ en: "Open it on ArcPad", ko: "ArcPad에서 열기", zh: "在 ArcPad 打开" })) + "</a>";
    else if (sec.confirm) act = '<div class="aa-sec-confirm"><p>' + esc(T({ en: "Burn 100,000 $ARCIRCLE from this wallet? They go to 0x…dEaD and can't come back. Nobody receives them.", ko: "이 지갑에서 100,000 $ARCIRCLE을 소각할까요? 0x…dEaD로 가서 되돌릴 수 없어요. 누구도 받지 않아요.", zh: "从此钱包销毁 100,000 $ARCIRCLE？它们会发送到 0x…dEaD，无法找回，任何人都不会收到。" })) + '</p><div><button type="button" class="aa-rc-btn" data-sec="burn">' + esc(T({ en: "Burn & open", ko: "소각하고 열기", zh: "销毁并打开" })) + '</button><button type="button" class="aa-rc-btn ghost" data-sec="cancel">' + esc(T({ en: "Cancel", ko: "취소", zh: "取消" })) + "</button></div></div>";
    else act = '<button type="button" class="aa-rc-btn" data-sec="start"' + (sec.busy ? " disabled" : "") + ">" + esc(sec.busy ? sec.busyText || "…" : a ? T({ en: "Burn 100,000 $ARCIRCLE to open", ko: "100,000 $ARCIRCLE 소각하고 열기", zh: "销毁 100,000 $ARCIRCLE 打开" }) : T({ en: "Connect a wallet to open", ko: "지갑 연결하고 열기", zh: "连接钱包后打开" })) + "</button>";
    box.innerHTML = '<p class="aa-mini" data-no-i18n>' + esc(T({ en: "ARCIA's private photos. Open them once by burning 100,000 $ARCIRCLE — every token goes to the dead address, gone for good. Opened stays opened for your wallet.", ko: "ARCIA의 비밀 사진이에요. 100,000 $ARCIRCLE을 소각하면 열려요 — 전부 dead 주소로 가서 영원히 사라져요. 한 번 열면 그 지갑에서는 계속 열려 있어요.", zh: "ARCIA 的私密照片。销毁 100,000 $ARCIRCLE 即可打开——全部发送到销毁地址，永久消失。打开后对你的钱包永久有效。" })) + "</p>" +
      '<div class="aa-sec-grid' + (sec.photos ? " on" : "") + '">' + tiles + "</div>" + stats + '<div class="aa-sec-act" data-no-i18n>' + act + "</div>" +
      (sec.msg ? '<p class="aa-sec-msg" role="status" data-no-i18n>' + esc(sec.msg) + "</p>" : "");
  }
  var LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  function secBusy(t) { sec.busy = !!t; sec.busyText = t || ""; secPaint(); }
  function secErr(e, fallback) {
    var m = e && (e.code === "ACTION_REJECTED" || e.code === 4001 || /rejected|denied/i.test(e.message || "")) ? T({ en: "Cancelled in your wallet.", ko: "지갑에서 취소했어요.", zh: "已在钱包中取消。" }) : (e && e.mine) ? e.message : fallback;
    sec.msg = m; secBusy("");
  }
  function secSign(a) {
    var have = ls.get("arcia-secret-sig:" + a, "");
    if (have) return Promise.resolve(have);
    return state.signer.signMessage(secMsg(a)).then(function (sig) { ls.set("arcia-secret-sig:" + a, sig); return sig; });
  }
  function secVerify(a, tx, sig, tries) {
    return fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "secret-open", wallet: a, tx: tx, signature: sig }) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 404 && tries > 0) return new Promise(function (res) { setTimeout(res, 2500); }).then(function () { return secVerify(a, tx, sig, tries - 1); });
        if (!x.j || !x.j.ok) throw Object.assign(new Error((x.j && x.j.error) || "couldn't check the burn"), { mine: true });
        return true;
      });
  }
  async function secStart(kind) {
    var a = account();
    if (kind === "cancel") { sec.confirm = false; secPaint(); return; }
    if (!a) { if (typeof connectWallet === "function") { try { await connectWallet(); } catch (e) { /* closed */ } } secLoad(); return; }
    if (sec.busy) return;
    sec.msg = "";
    try {
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      if (kind === "sign") { secBusy(T({ en: "Sign in your wallet…", ko: "지갑에서 서명…", zh: "请在钱包中签名…" })); var s0 = await secSign(a); await secPhotos(a, s0); secBusy(""); return; }
      var pending = ls.get("arcia-secret-tx:" + a, "");
      if (!pending && kind === "start") {
        var tok = new ethers.Contract(CONFIG.ARCIRCLE_TOKEN, ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"], state.signer);
        var bal = await tok.balanceOf(a);
        if (bal < ethers.parseUnits(SEC_PRICE, 18)) { sec.msg = T({ en: "This wallet holds less than 100,000 $ARCIRCLE.", ko: "이 지갑의 $ARCIRCLE이 100,000개보다 적어요.", zh: "此钱包的 $ARCIRCLE 少于 100,000。" }); secPaint(); return; }
        sec.confirm = true; secPaint(); return;
      }
      if (!pending) {
        sec.confirm = false;
        secBusy(T({ en: "Confirm the burn in your wallet…", ko: "지갑에서 소각 확인…", zh: "请在钱包中确认销毁…" }));
        var t = new ethers.Contract(CONFIG.ARCIRCLE_TOKEN, ["function transfer(address,uint256) returns (bool)"], state.signer);
        var tx = await t.transfer(SEC_DEAD, ethers.parseUnits(SEC_PRICE, 18));
        ls.set("arcia-secret-tx:" + a, tx.hash); pending = tx.hash;
        secBusy(T({ en: "Burning…", ko: "소각 중…", zh: "销毁中…" }));
        await tx.wait();
      }
      secBusy(T({ en: "Sign to open (no gas)…", ko: "열기 서명 (가스 없음)…", zh: "签名打开（无 Gas）…" }));
      var sig = await secSign(a);
      secBusy(T({ en: "Checking the burn…", ko: "소각 확인 중…", zh: "正在核对销毁…" }));
      await secVerify(a, pending, sig, 6);
      ls.set("arcia-secret-tx:" + a, "");
      await secPhotos(a, sig);
      secBusy("");
      toast(T({ en: "The secret file is open ♡", ko: "비밀정보가 열렸어요 ♡", zh: "秘密档案已打开 ♡" }));
      secLoad();
    } catch (e) { sec.confirm = false; secErr(e, T({ en: "That didn't go through — press the button again.", ko: "처리되지 않았어요 — 버튼을 다시 눌러 주세요.", zh: "未能完成——请再按一次。" })); }
  }
  function secView(n) {
    var p = sec.photos && sec.photos.filter(function (x) { return x.n === n; })[0];
    if (!p) return;
    var o = document.createElement("div");
    o.className = "aa-sec-view"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", p.title);
    o.innerHTML = '<img src="' + p.src + '" alt="' + esc(p.title) + '"><b data-no-i18n>' + esc(p.title) + '</b><button type="button" aria-label="Close">×</button>';
    o.addEventListener("click", function () { o.remove(); });
    document.body.appendChild(o);
  }

  // ================= v4 =================
  // ---------------- the empty chat: three ways to start ----------------
  function starter() {
    if (!log || msgs.length || log.querySelector(".aa-start")) return;
    var li = document.createElement("li");
    li.className = "aa-start";
    var A = (LIVE && LIVE.arcia) || {};
    var cards = [
      ["order", T({ en: "Tell me an order", ko: "주문을 말해 줘요", zh: "告诉我一个订单" }), T({ en: "I fill ARCIRCLE Orders for you — you sign", ko: "ARCIRCLE Orders에 채워 줄게요 — 서명은 직접", zh: "我帮你填好 ARCIRCLE Orders — 你来签名" }), "ord"],
      ["grad", T({ en: "$ARCIA's graduation", ko: "$ARCIA 졸업", zh: "$ARCIA 毕业" }), A.phase === "curve" && A.progress != null ? T({ en: "{p}% of the way on Robinhood Chain", ko: "로빈후드 체인에서 {p}% 진행", zh: "Robinhood Chain 上已完成 {p}%" }).replace("{p}", Number(A.progress).toFixed(0)) : T({ en: "Where it stands on Robinhood Chain", ko: "로빈후드 체인에서 지금 어디쯤인지", zh: "它在 Robinhood Chain 上的进度" }), "grad"],
      account() ? ["brief", T(BRIEF), T({ en: "Your wallet across ARCIRCLE PAD", ko: "ARCIRCLE PAD 전체에서 내 지갑", zh: "你在 ARCIRCLE PAD 的钱包概况" }), "brief"]
        : ["today", T({ en: "Today with ARCIA", ko: "오늘의 ARCIA", zh: "今天的 ARCIA" }), T({ en: "Her posts, trades and calls today", ko: "오늘의 게시글·매매·판정", zh: "她今天的帖子、交易和判断" }), "today"],
    ];
    li.innerHTML = '<p class="aa-start-h" data-no-i18n>' + esc(T({ en: "Start here", ko: "여기서 시작해요", zh: "从这里开始" })) + "</p>" + cards.map(function (c, k) {
      return '<button type="button" class="aa-start-c ' + c[3] + '" data-start="' + c[0] + '" style="--i:' + k + '"><b data-no-i18n>' + esc(c[1]) + '</b><span data-no-i18n>' + esc(c[2]) + "</span></button>";
    }).join("");
    log.appendChild(li);
  }
  function dropStarter() { var s0 = log && log.querySelector(".aa-start"); if (s0) s0.remove(); }
  function startAct(k) {
    if (k === "order") { input.value = ORDER_CHIP; grow(); input.focus(); try { input.setSelectionRange(0, input.value.length); } catch (e) { /* fine */ } toast(T({ en: "Change it how you like, then send — I'll fill ARCIRCLE Orders.", ko: "원하는 대로 바꿔서 보내요 — ARCIRCLE Orders에 채워 줄게요.", zh: "按你的想法修改后发送 — 我会填好 ARCIRCLE Orders。" })); return; }
    if (k === "grad") { send(T({ en: "How close is $ARCIA to graduating?", ko: "$ARCIA 졸업까지 얼마나 남았어?", zh: "$ARCIA 离毕业还有多远？" })); return; }
    if (k === "brief") { send(T(BRIEF)); return; }
    if (k === "today") { pickTab("today"); var sd = panel.querySelector(".aa-side"); if (sd && window.innerWidth <= 1100) sd.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
  }

  // ---------------- daily missions: ask, a heart, a letter or the quiz — all three make the next card Rare or better ----------------
  var MIS = [
    ["ask", { en: "Ask ARCIA something", ko: "ARCIA에게 질문하기", zh: "问 ARCIA 一个问题" }],
    ["heart", { en: "Send a heart", ko: "하트 보내기", zh: "送一颗爱心" }],
    ["extra", { en: "Write a letter or finish the quiz", ko: "팬레터 쓰기 또는 퀴즈 끝내기", zh: "写一封信或完成测验" }],
  ];
  function misState() { var m = ls.get("arcia-missions", null); return m && m.day === dayStr() ? m : { day: dayStr() }; }
  function mission(k) {
    var m = misState();
    if (m[k]) return;
    m[k] = 1; ls.set("arcia-missions", m);
    var all = MIS.every(function (x) { return m[x[0]]; });
    if (all && !m.done) {
      m.done = 1; ls.set("arcia-missions", m); ls.set("arcia-boost", dayStr());
      toast(T({ en: "All of today's missions done~ your next photocard is Rare or better♡", ko: "오늘 미션 완료~ 다음 포토카드는 레어 이상이에요♡", zh: "今天的任务全部完成~ 下一张小卡至少是稀有♡" }));
      sfx("milestone");
    }
    paintMissions(k);
  }
  function paintMissions(just) {
    var box = panel.querySelector(".aa-mis");
    if (!box) return;
    var m = misState(), n = MIS.filter(function (x) { return m[x[0]]; }).length, boost = ls.get("arcia-boost", "") === dayStr();
    box.innerHTML = '<div class="aa-mis-h"><b data-no-i18n>' + esc(T({ en: "Today's missions", ko: "오늘의 미션", zh: "今日任务" })) + '</b><em data-no-i18n>' + n + " / 3</em></div><ul>" +
      MIS.map(function (x) { return '<li class="' + (m[x[0]] ? "done" : "") + (just === x[0] ? " just" : "") + '"><i aria-hidden="true"></i><span data-no-i18n>' + esc(T(x[1])) + "</span></li>"; }).join("") + "</ul>" +
      '<p class="aa-mis-r' + (boost ? " on" : "") + '" data-no-i18n>' + esc(boost ? T({ en: "Reward ready: your next photocard is Rare or better", ko: "보상 준비: 다음 포토카드는 레어 이상", zh: "奖励已就绪：下一张小卡至少是稀有" }) : T({ en: "All three: your next photocard is Rare or better", ko: "세 개 다 하면 다음 포토카드는 레어 이상", zh: "完成三个：下一张小卡至少是稀有" })) + "</p>";
  }

  // ---------------- what's next: $ARCIA's graduation on Robinhood Chain and the CirclePad round ----------------
  function paintNext() {
    var box = panel.querySelector(".aa-next");
    if (!box) return;
    var A = (LIVE && LIVE.arcia) || {}, rows = [];
    if (A.phase === "curve" && A.progress != null) {
      var p = Math.max(0, Math.min(100, Number(A.progress)));
      rows.push('<a class="aa-nx grad" href="/arc#orders?c=rh&t=' + ARCIA_RH.toLowerCase() + '"><span class="aa-nx-k" data-no-i18n>' + esc(T({ en: "$ARCIA graduation · Robinhood Chain", ko: "$ARCIA 졸업 · 로빈후드 체인", zh: "$ARCIA 毕业 · Robinhood Chain" })) + '</span><span class="aa-nx-bar"><i style="--p:' + p.toFixed(1) + '%"></i></span><b data-no-i18n>' + p.toFixed(0) + "%</b></a>");
    } else if (A.phase && A.phase !== "curve") rows.push('<span class="aa-nx grad done"><span class="aa-nx-k" data-no-i18n>' + esc(T({ en: "$ARCIA graduated — its pool is open", ko: "$ARCIA 졸업 — 풀이 열렸어요", zh: "$ARCIA 已毕业 — 池子已开放" })) + "</span></span>");
    if (deadline() > nowS()) rows.push('<a class="aa-nx round" href="/circle"><span class="aa-nx-k" data-no-i18n>' + esc(T({ en: "CirclePad Round #{n} closes in", ko: "CirclePad 라운드 #{n} 마감까지", zh: "CirclePad 第 {n} 轮截止还有" }).replace("{n}", RN())) + '</span><b class="aa-clock" data-no-i18n>—</b></a>');
    box.innerHTML = rows.length ? '<span class="aa-cheer-k" data-no-i18n>' + esc(T({ en: "Coming up", ko: "다가오는 일", zh: "即将到来" })) + "</span>" + rows.join("") : "";
    box.hidden = !rows.length;
    clock();
  }

  // ---------------- the Live tab: $ARCIA's graduation bar, the alert and the buy-before-graduation link ----------------
  function paintGrad() {
    var box = panel.querySelector(".aa-grad");
    if (!box) return;
    var A = (LIVE && LIVE.arcia) || {};
    if (A.phase !== "curve" || A.progress == null) { box.hidden = !(A.phase && A.phase !== "curve"); if (!box.hidden) box.innerHTML = '<p class="aa-grad-done" data-no-i18n>' + esc(T({ en: "$ARCIA has graduated — its Uniswap v4 pool is open on Robinhood Chain.", ko: "$ARCIA가 졸업했어요 — 로빈후드 체인에 Uniswap v4 풀이 열렸어요.", zh: "$ARCIA 已毕业 — Robinhood Chain 上的 Uniswap v4 池已开放。" })) + '</p><a class="aa-rc-btn" href="/arc#orders?c=rh&t=' + ARCIA_RH.toLowerCase() + '">ARCIRCLE Orders →</a>'; return; }
    box.hidden = false;
    var p = Math.max(0, Math.min(100, Number(A.progress))), was = Number(box.getAttribute("data-p"));
    var on = ls.get("arcia-grad-alert", false);
    box.innerHTML = '<div class="aa-grad-h"><b data-no-i18n>' + esc(T({ en: "To graduation", ko: "졸업까지", zh: "距离毕业" })) + '</b><em data-no-i18n>' + p.toFixed(1) + '%</em></div><div class="aa-grad-bar' + (isFinite(was) && p > was && !reduce ? " up" : "") + '"><i style="width:' + p.toFixed(1) + '%"></i></div>' +
      '<p class="aa-mini" data-no-i18n>' + esc(T({ en: "When the Pons curve fills, $ARCIA moves to its Uniswap v4 pool. A limit buy can wait for that pool now.", ko: "Pons 커브가 다 차면 $ARCIA는 Uniswap v4 풀로 옮겨가요. 지금 지정가 매수를 걸어 두면 그 풀을 기다려요.", zh: "Pons 曲线填满后，$ARCIA 会进入 Uniswap v4 池。现在挂限价买单即可等待该池。" })) + "</p>" +
      '<div class="aa-coin-row"><a class="aa-rc-btn" href="/arc#orders?c=rh&t=' + ARCIA_RH.toLowerCase() + '" data-no-i18n>' + esc(T({ en: "Limit buy before graduation", ko: "졸업 전 지정가 매수", zh: "毕业前限价买入" })) + '</a><button type="button" class="aa-rc-btn ghost' + (on ? " on" : "") + '" data-gradalert="1">' + ICON.bell + '<span data-no-i18n>' + esc(on ? T({ en: "Alert on", ko: "알림 켜짐", zh: "提醒已开" }) : T({ en: "Alert me at graduation", ko: "졸업하면 알려 줘", zh: "毕业时提醒我" })) + "</span></button></div>";
    box.setAttribute("data-p", String(p));
  }
  /// the graduation alert: Web Push to this browser when the server has VAPID keys (the "arcia-grad" topic, sent by
  /// the bot's cron), otherwise a notification while this page is open
  var b64b = function (s0) { var t = s0.replace(/-/g, "+").replace(/_/g, "/"); var bin = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }); };
  function gradAlert() {
    var on = !ls.get("arcia-grad-alert", false);
    if (!on) { ls.set("arcia-grad-alert", false); paintGrad(); toast(T({ en: "Graduation alert off", ko: "졸업 알림을 껐어요", zh: "已关闭毕业提醒" })); return; }
    if (!("Notification" in window)) { toast(T({ en: "This browser can't show notifications — the ARCIA bot on Telegram can.", ko: "이 브라우저는 알림을 못 띄워요 — 텔레그램 ARCIA 봇은 할 수 있어요.", zh: "此浏览器无法显示通知 — Telegram 上的 ARCIA 机器人可以。" })); return; }
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") { toast(tr("Notifications are blocked — use the calendar file instead.")); return; }
      ls.set("arcia-grad-alert", true); paintGrad();
      var done = function (push) { toast(push ? T({ en: "I'll tell you the moment $ARCIA graduates — even with this page closed♡", ko: "$ARCIA가 졸업하는 순간 알려 줄게요 — 페이지를 닫아도요♡", zh: "$ARCIA 毕业的那一刻我会告诉你 — 关掉页面也可以♡" }) : T({ en: "I'll tell you when $ARCIA graduates while this page is open♡", ko: "이 페이지가 열려 있는 동안 $ARCIA 졸업을 알려 줄게요♡", zh: "页面打开期间 $ARCIA 毕业时我会告诉你♡" })); };
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { done(false); return; }
      fetch("/api/social?orders=pushkey").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j || !j.key) { done(false); return; }
        return Promise.race([navigator.serviceWorker.ready, new Promise(function (res) { setTimeout(function () { res(null); }, 4000); })]).then(function (reg) {
          if (!reg || !reg.pushManager) { done(false); return; }
          return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64b(j.key) }); }).then(function (sub) {
            return fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pushtopic", topic: "arcia-grad", sub: sub.toJSON() }) }).then(function (r) { done(r.ok); });
          });
        });
      }).catch(function () { done(false); });
    });
  }
  /// a phase change seen by this page (the fallback alert)
  function gradWatch(A) {
    var was = gradWatch.last; gradWatch.last = A && A.phase;
    if (!was || !A || was !== "curve" || A.phase === "curve" || !ls.get("arcia-grad-alert", false)) return;
    try { new Notification(T({ en: "$ARCIA graduated", ko: "$ARCIA 졸업", zh: "$ARCIA 已毕业" }), { body: T({ en: "Its Uniswap v4 pool is open on Robinhood Chain.", ko: "로빈후드 체인에 Uniswap v4 풀이 열렸어요.", zh: "Robinhood Chain 上的 Uniswap v4 池已开放。" }), icon: "/images/arcia-avatar-96.jpg" }); } catch (e) { /* not allowed */ }
    var li = log && bubble("assistant", T({ en: "$ARCIA just graduated~!! Its pool on Robinhood Chain is open now♡", ko: "$ARCIA가 방금 졸업했어요~!! 로빈후드 체인 풀이 열렸어요♡", zh: "$ARCIA 刚刚毕业了~!! Robinhood Chain 上的池子已开放♡" }), { type: true, cls: "sys" });
    if (li) { fx(li, "confetti"); sfx("launch"); }
  }

  // ---------------- a price line from what this browser has seen (a sample every 5 minutes, the last 8 hours) ----------------
  function pxSample(A) {
    if (!A || !(A.price > 0)) return;
    var k = "arcia-px-rh", a = ls.get(k, []) || [], t = Math.floor(Date.now() / 1000);
    a = a.filter(function (x) { return x && t - x[0] < 8 * 3600; });
    if (!a.length || t - a[a.length - 1][0] >= 300) a.push([t, A.price]); else a[a.length - 1][1] = A.price;
    ls.set(k, a.slice(-96));
  }
  function sparkSvg() {
    var a = (ls.get("arcia-px-rh", []) || []).filter(function (x) { return x && x[1] > 0; });
    if (a.length < 4) return "";
    var ps = a.map(function (x) { return x[1]; }), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps), r = hi - lo || hi * 0.01 || 1, W = 120, H = 30;
    var d = a.map(function (x, i) { return (i ? "L" : "M") + (i / (a.length - 1) * W).toFixed(1) + " " + (H - 3 - (x[1] - lo) / r * (H - 6)).toFixed(1); }).join("");
    return '<svg class="aa-spark ' + (ps[ps.length - 1] >= ps[0] ? "up" : "down") + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  // ---------------- Today with ARCIA: her posts, DESK trades, AGENT calls, ARCIA 402 and letters, newest first ----------------
  var today = { at: 0, list: null };
  function loadToday(force) {
    if (!force && today.list && Date.now() - today.at < 60000) { paintToday(); return; }
    var j = function (u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    var since = Date.now() / 1000 - 86400, out = [];
    Promise.all([j("/api/arcia-x?feed=1"), j("/api/desk"), j("/api/desk?chain=rh"), j("/api/desk?agent=record"), j("/api/arcia402?stats=1"), j("/api/arcia?letters=1")]).then(function (r) {
      ((r[0] && r[0].feed) || []).forEach(function (x) { if (x.t >= since) out.push({ t: x.t, k: "x", text: x.text, url: x.url, to: x.to }); });
      [[r[1], "Arc"], [r[2], "Robinhood"]].forEach(function (d) {
        ((d[0] && d[0].recent) || []).forEach(function (x) { if (x.real && x.exitTs >= since) out.push({ t: x.exitTs, k: "desk", sym: x.sym, pnl: x.pnl, ret: x.ret, ch: d[1] }); });
      });
      ((r[3] && r[3].calls) || []).forEach(function (x) { if (x.at >= since) out.push({ t: x.at, k: "agent", sym: x.sym, call: x.call }); });
      ((r[4] && r[4].items) || []).forEach(function (x) { var t = Math.floor((x.t || 0) / 1000); if (t >= since && (x.kind === "earn" || x.kind === "tip" || x.kind === "spend")) out.push({ t: t, k: "402", kind: x.kind, amount: x.amount, what: x.service || x.title || "" }); });
      ((r[5] && r[5].letters) || []).forEach(function (x) { var t = Math.floor((x.at || 0) / 1000); if (t >= since && x.reply) out.push({ t: t, k: "letter", name: x.name, text: x.reply }); });
      today.list = out.sort(function (a, b) { return b.t - a.t; }).slice(0, 30); today.at = Date.now();
      paintToday();
    });
  }
  function paintToday() {
    var box = panel.querySelector(".aa-today");
    if (!box) return;
    var L0 = today.list;
    if (!L0) { box.innerHTML = '<li class="aa-empty">' + esc(tr("Loading…")) + "</li>"; return; }
    if (!L0.length) { box.innerHTML = '<li class="aa-empty" data-no-i18n>' + esc(T({ en: "A quiet day so far — come back in a bit♡", ko: "아직 조용한 하루예요 — 조금 있다 다시 와요♡", zh: "今天还很安静 — 稍后再来看看♡" })) + "</li>"; return; }
    var ago = function (t) { return F.ago ? F.ago(t) : ""; };
    var KIND = { x: ["X", "x"], desk: ["DESK", "desk"], agent: ["AGENT", "agent"], "402": ["402", "a402"], letter: [T({ en: "Letter", ko: "팬레터", zh: "粉丝信" }), "letter"] };
    box.innerHTML = L0.map(function (e) {
      var body = e.k === "x" ? (e.to ? "→ @" + e.to + " · " : "") + e.text
        : e.k === "desk" ? T({ en: "Closed ${s} on {c}: {r}", ko: "{c}에서 ${s} 청산: {r}", zh: "在 {c} 平仓 ${s}：{r}" }).replace("{s}", e.sym || "?").replace("{c}", e.ch).replace("{r}", e.ret != null ? (e.ret >= 0 ? "+" : "") + (e.ret * (Math.abs(e.ret) < 5 ? 100 : 1)).toFixed(1) + "%" : e.pnl != null ? (e.pnl >= 0 ? "+$" : "−$") + Math.abs(e.pnl).toFixed(2) : "—")
        : e.k === "agent" ? T({ en: "Safety call on ${s}: {c}", ko: "${s} 안전 판정: {c}", zh: "${s} 的安全判断：{c}" }).replace("{s}", e.sym || "?").replace("{c}", T(e.call === "safe" ? { en: "Safe", ko: "안전", zh: "安全" } : e.call === "risky" ? { en: "Risky", ko: "위험", zh: "危险" } : { en: "Caution", ko: "주의", zh: "谨慎" }))
        : e.k === "402" ? T(e.kind === "earn" ? { en: "Earned ${a} with x402", ko: "x402로 ${a} 수입", zh: "通过 x402 收入 ${a}" } : e.kind === "tip" ? { en: "A ${a} tip arrived", ko: "${a} 팁이 도착했어요", zh: "收到 ${a} 小费" } : { en: "Paid another agent ${a}", ko: "다른 에이전트에 ${a} 지불", zh: "向另一个代理支付 ${a}" }).replace("{a}", Number(e.amount || 0).toFixed(2))
        : T({ en: "Answered {n}: “{t}”", ko: "{n}님에게 답장: “{t}”", zh: "回复 {n}：“{t}”" }).replace("{n}", e.name || "a fan").replace("{t}", String(e.text).slice(0, 90));
      var k = KIND[e.k];
      return '<li class="aa-td ' + k[1] + '"><span class="aa-td-k" data-no-i18n>' + esc(k[0]) + '</span><p data-no-i18n>' + esc(body) + (e.url ? ' <a href="' + esc(e.url) + '" target="_blank" rel="noopener">↗</a>' : "") + '</p><time data-no-i18n>' + esc(ago(e.t)) + "</time></li>";
    }).join("");
  }

  // ---------------- a fan tier from the $ARCIA a connected wallet holds on Robinhood Chain ----------------
  var TIERS = [[1e7, "diamond", { en: "Diamond fan", ko: "다이아 팬", zh: "钻石粉丝" }], [1e6, "gold", { en: "Gold fan", ko: "골드 팬", zh: "黄金粉丝" }], [1e5, "silver", { en: "Silver fan", ko: "실버 팬", zh: "白银粉丝" }], [1, "bronze", { en: "Bronze fan", ko: "브론즈 팬", zh: "青铜粉丝" }]];
  var tierOf = function (n) { for (var i = 0; i < TIERS.length; i++) if (n >= TIERS[i][0]) return TIERS[i]; return null; };
  function arciaRhBalance(a) {
    if (typeof ethers === "undefined" || !a) return Promise.resolve(null);
    var net = (typeof ARC_ALT_NET !== "undefined" && ARC_ALT_NET) || { id: 4663, rpc: "https://rpc.mainnet.chain.robinhood.com" };
    try {
      var prov = new ethers.JsonRpcProvider(net.rpc, Number(net.id || 4663), { staticNetwork: true });
      return new ethers.Contract(ARCIA_RH, ["function balanceOf(address) view returns (uint256)"], prov).balanceOf(a).then(function (b) { return Number(b) / 1e18; }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  // ---------------- talk mode: she listens, answers aloud, then listens again ----------------
  var talk = { on: false, rec: null, misses: 0 };
  var SRc = function () { return window.SpeechRecognition || window.webkitSpeechRecognition; };
  function talkToggle() {
    talk.on = !talk.on;
    var b = Q(".aa-talk"); if (b) { b.classList.toggle("on", talk.on); b.setAttribute("aria-pressed", talk.on ? "true" : "false"); }
    root.classList.toggle("aa-talking", talk.on);
    if (talk.on) { ls.set("arcia-voice", true); var vt = Q(".aa-voice-t"); if (vt) { vt.setAttribute("aria-pressed", "true"); vt.classList.add("on"); } talk.misses = 0; toast(T({ en: "Talk mode on — just speak, I'm listening♡", ko: "대화 모드 켜짐 — 말하면 들을게요♡", zh: "对话模式已开 — 直接说话，我在听♡" })); listen(); }
    else { if (talk.rec) { try { talk.rec.abort(); } catch (e) { /* stopped */ } } talk.rec = null; stopVoice(); }
  }
  function listen() {
    var SR = SRc();
    if (!talk.on || !SR || busy || talk.rec) return;
    var rec; try { rec = new SR(); } catch (e) { return; }
    talk.rec = rec;
    rec.lang = lang() === "ko" ? "ko-KR" : lang() === "zh" ? "zh-CN" : "en-US";
    rec.interimResults = true; rec.maxAlternatives = 1;
    var b = Q(".aa-talk"); if (b) b.classList.add("hear");
    var said = "";
    rec.onresult = function (ev) { var t = ""; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; said = t; input.value = t; grow(); if (ev.results[ev.results.length - 1].isFinal) { try { rec.stop(); } catch (e) { /* ok */ } } };
    rec.onend = rec.onerror = function () {
      talk.rec = null; if (b) b.classList.remove("hear");
      if (!talk.on) return;
      if (said.trim()) { talk.misses = 0; send(said); }
      else if (++talk.misses >= 3) talkToggle(); else setTimeout(listen, 600);
    };
    try { rec.start(); } catch (e) { talk.rec = null; }
  }
  /// after she finishes speaking, talk mode listens again
  function spoke() { if (talk.on) setTimeout(listen, 450); }

  // ---------------- a new post of hers on X: a toast and a dot on the tab ----------------
  function xWatch() {
    fetch("/api/arcia-x?feed=1").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var top = j && j.feed && j.feed[0]; if (!top) return;
      var seen = ls.get("arcia-x-seen", 0);
      if (seen && top.t > seen) {
        toast(T({ en: "ARCIA just posted on X", ko: "ARCIA가 방금 X에 글을 올렸어요", zh: "ARCIA 刚在 X 上发帖" }));
        var tb = panel.querySelector('.aa-tabs [data-t="x"]'); if (tb) tb.classList.add("dot");
      }
      if (!seen || top.t > seen) ls.set("arcia-x-seen", top.t);
    }).catch(function () {});
  }

  // ---------------- now and then, when nothing's happening, she says something small ----------------
  var IDLE = {
    en: ["Ask me where $ARCIA's graduation stands~", "Tell me an order and I'll fill it for you♡", "Did you send a heart today?", "Want a photocard? Tap the card under any reply~"],
    ko: ["$ARCIA 졸업이 어디쯤인지 물어봐요~", "주문을 말해 주면 채워 줄게요♡", "오늘 하트 보냈어요?", "포토카드 갖고 싶어요? 답장 아래 카드 버튼을 눌러요~"],
    zh: ["问问我 $ARCIA 毕业到哪一步了~", "告诉我一个订单，我帮你填好♡", "今天送爱心了吗？", "想要小卡吗？点任意回复下面的卡片按钮~"],
  };
  var idle = { t: 0, k: 0 };
  function idleArm() {
    clearTimeout(idle.t);
    var hint = panel.querySelector(".aa-idle"); if (hint) hint.classList.remove("on");
    if (reduce) return;
    idle.t = setTimeout(function () {
      if (!panel.classList.contains("active") || document.hidden || busy || document.activeElement === input) { idleArm(); return; }
      var h = panel.querySelector(".aa-idle"); if (!h) return;
      var list = T(IDLE); h.textContent = list[idle.k++ % list.length]; h.classList.add("on");
      root.classList.remove("aa-wave-hi"); void root.offsetWidth; root.classList.add("aa-wave-hi");
      setTimeout(function () { h.classList.remove("on"); root.classList.remove("aa-wave-hi"); idleArm(); }, 6000);
    }, 18000);
  }

  // ---------------- the utility cards' numbers count up the first time they're seen ----------------
  function countUp(root0) {
    if (reduce || !root0) return;
    root0.querySelectorAll("b").forEach(function (b) {
      if (b.getAttribute("data-k") === "streamed" || b.dataset.counted) return;
      var m = /^([−-]?\$?)([\d,]+(?:\.\d+)?)([KMB%]?)$/.exec(b.textContent.trim()); if (!m) return;
      var to = Number(m[2].replace(/,/g, "")), dec = (m[2].split(".")[1] || "").length; if (!(to > 0)) return;
      b.dataset.counted = "1";
      var t0 = performance.now();
      (function step(t) { var k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3), v = to * e; b.textContent = m[1] + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) + m[3]; if (k < 1) requestAnimationFrame(step); else b.textContent = m[0]; })(t0);
    });
  }

  // ---------------- build ----------------
  function build() {
    panel.innerHTML =
      '<div class="aa">' +
        '<div class="aa-hero">' +
          '<div class="aa-banner"><div class="aa-par"><picture><source type="image/webp" srcset="/images/arcia-banner2-900.webp 900w, /images/arcia-banner2.webp 1600w" sizes="(max-width: 900px) 100vw, 1100px"><img src="/images/arcia-banner2.jpg" srcset="/images/arcia-banner2-900.jpg 900w, /images/arcia-banner2.jpg 1600w" sizes="(max-width: 900px) 100vw, 1100px" alt="ARCIA — ARCIRCLE official mascot" width="1600" height="547"' + (HOST ? ' loading="lazy"' : ' fetchpriority="high"') + '></picture></div></div>' +
          '<div class="aa-id">' +
            '<span class="aa-av-wrap"><picture><source type="image/webp" srcset="/images/arcia-avatar.webp"><img class="aa-av" src="/images/arcia-avatar.jpg" alt="ARCIA" width="256" height="256"' + (HOST ? ' loading="lazy"' : "") + '></picture><i class="aa-halo" aria-hidden="true"></i><i class="aa-live-dot" aria-hidden="true"></i></span>' +
            '<div class="aa-name"><span class="ams-kicker">Utility · AI idol</span><h1>ARCIA <span class="asc-ver" title="Version 4 — new features are added regularly">v4<i>Updated regularly</i></span></h1>' +
              '<p class="aa-handle"><a href="' + X + '" target="_blank" rel="noopener" data-no-i18n>@ARCIAonArc</a><span aria-hidden="true"> · </span><span>Virtual idol of $ARCIRCLE</span></p>' +
              '<div class="aa-badges"></div></div>' +
            '<div class="aa-act"><a class="bp-btn-primary aa-go" href="#aa-chat"><span class="aa-lg">Chat with ARCIA</span><span class="aa-sh">Chat</span></a><a class="aa-x" href="' + X + '" target="_blank" rel="noopener">' + ICON.x + "<span>Follow on X</span></a><a class=\"aa-x aa-tg\" href=\"https://t.me/ARCIAonArc_bot\" target=\"_blank\" rel=\"noopener\"><span class=\"aa-lg\">Chat on Telegram</span><span class=\"aa-sh\">Telegram</span></a></div>" +
          "</div>" +
          '<p class="aa-lede">ARCIA has studied every page of ARCIRCLE PAD and carries $ARCIRCLE to the world — here in her chat, and on X, where she answers every mention within about a minute.</p>' +
          // v4: orders by chat, up front
          '<div class="aa-ordcall"><span class="aa-ordcall-k" data-no-i18n>NEW</span><div><b>Tell ARCIA your order — she fills ARCIRCLE Orders for you</b><span>Type it in the chat, like the lines below. She opens ARCIRCLE Orders with it filled in; you check it and sign. Nothing is placed before that.</span><span class="aa-ordcall-ex"><code data-no-i18n>buy $20 of $ARCIA at mcap 30k</code><code data-no-i18n>sell 50% of arcircle at +20%</code></span></div><button type="button" class="aa-rc-btn" data-ordtry="1">Try it</button></div>' +
          // ARCIA's other utilities, in one place
          // a div, not <nav>: the site's global nav rules (full-bleed width, side padding, scrolling) would pull it out of the hero on phones
          '<div class="aa-fam" role="navigation" aria-label="More from ARCIA">' +
            '<a class="aa-fam-c vea wide" href="/arc#vearcia" data-arc-tab="vearcia"><span class="aa-fam-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/><path d="M12 13.4l.8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.3z"/></svg></span>' +
              '<span class="aa-fam-t"><b>veARCIA <span class="aa-fam-beta" data-no-i18n>New</span></b><small>Stake $ARCIA for 1–20 days and earn $ARCIA every second — $ARCIRCLE holders boost up to 2.0x</small><em class="aa-fam-live" data-fam="vea"></em><span class="aa-vf" data-veaflow></span></span><i class="aa-fam-go" aria-hidden="true">→</i></a>' +
            '<a class="aa-fam-c a402" href="/arc#arcia402" data-arc-tab="arcia402"><span class="aa-fam-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="5.5"/><path d="M9 9.3v5.4M10.7 10.2c-.4-.6-1-.9-1.7-.9-.9 0-1.6.5-1.6 1.2 0 1.5 3.4.9 3.4 2.4 0 .7-.8 1.2-1.7 1.2-.8 0-1.4-.3-1.8-.9"/><path d="M15.5 7.5a5.5 5.5 0 0 1 0 9M18 5.5a8.5 8.5 0 0 1 0 13"/></svg></span>' +
              '<span class="aa-fam-t"><b>ARCIA 402</b><small>She earns and pays in USDC with x402 on Arc — every dollar on public books</small><em class="aa-fam-live" data-fam="402"></em></span><i class="aa-fam-go" aria-hidden="true">→</i></a>' +
            '<a class="aa-fam-c desk" href="/arc#desk" data-arc-tab="desk"><span class="aa-fam-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19.5h16"/><path d="M6.5 16V11M10.5 16V7.5M14.5 16v-6M18.5 16V5"/><path d="M5 9.5l4.5-4 4 3 5.5-5"/></svg></span>' +
              '<span class="aa-fam-t"><b>ARCIA DESK <span class="aa-fam-beta">Beta</span></b><small>She trades new Argus launches with her own small wallet and learns from every trade</small><em class="aa-fam-live" data-fam="desk"></em></span><i class="aa-fam-go" aria-hidden="true">→</i></a>' +
            '<a class="aa-fam-c agent" href="/arc#agent" data-arc-tab="agent"><span class="aa-fam-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg></span>' +
              '<span class="aa-fam-t"><b>ARCIA AGENT <span class="aa-fam-beta" data-no-i18n>v2</span></b><small>Paste an Arc token: she reads it, makes a 24-hour safety call and burns it from vaults anyone can fund</small><em class="aa-fam-live" data-fam="agent"></em></span><i class="aa-fam-go" aria-hidden="true">→</i></a>' +
          "</div>" +
        "</div>" +
        '<div class="aa-stage">' +
          '<aside class="aa-portrait" aria-label="ARCIA">' +
            '<div class="aa-pf"><picture><source type="image/webp" srcset="/images/arcia-portrait-480.webp 480w, /images/arcia-portrait.webp 720w" sizes="250px"><img src="/images/arcia-portrait.jpg" alt="ARCIA" width="720" height="712" loading="lazy"></picture><i class="aa-pf-halo" aria-hidden="true"></i>' +
              '<div class="aa-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
              '<div class="aa-pf-tag"><b>ARCIA</b><span><i></i>Online</span></div></div>' +
            '<div class="aa-cheer"></div>' +
            '<div class="aa-next" hidden></div><div class="aa-mis"></div>' +
          "</aside>" +
          '<section class="aa-chat" id="aa-chat" aria-label="Chat with ARCIA">' +
            '<div class="aa-chat-h"><span class="aa-mini-av"><img src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40"><i class="aa-ring" aria-hidden="true"></i></span><div><b>ARCIA</b><span class="aa-on"><i></i>Online</span></div><span class="aa-idle" aria-hidden="true"></span>' +
              (SRc() && "speechSynthesis" in window ? '<button type="button" class="aa-tool aa-talk" aria-pressed="false" title="Talk mode: speak, she answers aloud, then listens again">' + ICON.talk + "<span>Talk</span></button>" : "") +
              '<span class="aa-me" hidden data-no-i18n></span>' +
              ("speechSynthesis" in window ? '<button type="button" class="aa-tool aa-voice-t" aria-pressed="false" title="Read her replies aloud"><i class="ic-off">' + ICON.mute + '</i><i class="ic-on">' + ICON.voice + "</i><span>Voice</span></button>" : "") +
              '<button type="button" class="aa-tool aa-new" title="Start a new chat — this one is kept on this device"><span>New chat</span></button></div>' +
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
                return '<button type="button" role="tab" id="aa-t-' + t + '" aria-controls="aa-p-' + t + '" aria-selected="' + (i ? "false" : "true") + '" tabindex="' + (i ? "-1" : "0") + '" data-t="' + t + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + (TAB_ICON[t] || "") + '</svg><span data-no-i18n>' + esc(T(TABS[t])) + "</span></button>";
              }).join("") + "</div>" +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-live" aria-labelledby="aa-t-live"><h3>What ARCIA sees right now</h3><p class="aa-live-src"></p><dl class="aa-live-rows"><div><dt>Loading…</dt><dd></dd></div></dl><div class="aa-grad" hidden></div>' +
              '<div class="aa-coin"><span class="aa-coin-k rh">$ARCIA CA · Robinhood Chain</span><code data-no-i18n>' + ARCIA_RH + '</code>' +
              '<div class="aa-coin-row"><button type="button" class="aa-rc-btn" data-copy="' + ARCIA_RH + '" data-label="Copy CA">' + ICON.copy + '<span>Copy CA</span></button>' +
              '<a class="aa-rc-btn ghost" href="' + ARCIA_RH_BUY + '" target="_blank" rel="noopener">Buy on Pons</a></div>' +
              '<span class="aa-coin-k aa-coin-k2 arc">$ARCIA CA · Arc</span><code data-no-i18n>' + ARCIA_CA + '</code>' +
              '<div class="aa-coin-row"><button type="button" class="aa-rc-btn" data-copy="' + ARCIA_CA + '" data-label="Copy CA">' + ICON.copy + '<span>Copy CA</span></button>' +
              '<a class="aa-rc-btn ghost" href="https://argus.world/token/' + ARCIA_CA.toLowerCase() + '" target="_blank" rel="noopener">Buy on Argus</a>' +
              '<a class="aa-rc-btn ghost" href="https://dexscreener.com/arc/' + ARCIA_POOL + '" target="_blank" rel="noopener">Chart</a></div>' +
              '<p class="aa-mini">The price above is $ARCIA on Robinhood Chain, read on-chain from Pons; holders from the Token Scanner. New coins are risky — scan before you buy.</p></div>' +
              '<div class="aa-more-row"><a class="aa-more aa-more-round" href="/circle" data-no-i18n>CirclePad Round #' + RN() + ' →</a><a class="aa-more" href="/circle/round/1">Round #1 results →</a></div></div>' +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-today" aria-labelledby="aa-t-today" hidden><h3>Today with ARCIA</h3><p class="aa-mini">Her posts on X, ARCIA DESK trades, ARCIA AGENT calls, ARCIA 402 and the letters she answered — the last 24 hours.</p><ul class="aa-today"></ul></div>' +
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
            '<div class="aa-tabp" role="tabpanel" id="aa-p-secret" aria-labelledby="aa-t-secret" hidden><h3 data-no-i18n>' + esc(T({ en: "Secret file", ko: "비밀정보", zh: "秘密档案" })) + '</h3><div class="aa-secret"></div></div>' +
            '<div class="aa-tabp" role="tabpanel" id="aa-p-profile" aria-labelledby="aa-t-profile" hidden><h3>Official profile</h3><div class="aa-profile"></div><div class="aa-fan"></div>' +
              '<h4>What ARCIA has studied</h4><div class="aa-tags"><span>Whitepaper</span><span>$ARCIRCLE</span><span>ArcPad</span><span>CirclePad</span><span>Relay Launch</span><span>Every utility</span><span>Contracts</span><span>Roadmap &amp; rewards</span></div></div>' +
          "</aside>" +
        "</div>" +
        // v4: phones — a slim bar with her, the hearts and Chat once the hero has scrolled away
        '<div class="aa-mbar" hidden><img src="/images/arcia-avatar-96.jpg" alt="" width="30" height="30"><span><b>ARCIA</b><small><i></i>Online</small></span><em class="aa-mbar-h" data-no-i18n></em><button type="button" class="aa-rc-btn" data-mchat="1">Chat</button></div>' +
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
      mission("heart");
      var b = e.currentTarget; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
      if (!reduce) for (var k = 0; k < 6; k++) { var hp = document.createElement("i"); hp.className = "aa-hp"; hp.style.setProperty("--x", (Math.random() * 60 - 30).toFixed(0) + "px"); hp.style.setProperty("--d", (k * 60) + "ms"); hp.innerHTML = ICON.heart; b.appendChild(hp); setTimeout(function (el) { el.remove(); }.bind(null, hp), 1300); }
      fx(Q(".aa-gauge"), "hearts");
      if (typeof window.arcHaptic === "function") window.arcHaptic("tap");
    });
    var vt = Q(".aa-voice-t");
    if (vt) {
      var syncV = function () { var on = !!ls.get("arcia-voice", false); vt.setAttribute("aria-pressed", on ? "true" : "false"); vt.classList.toggle("on", on); };
      vt.addEventListener("click", function () { var on = !ls.get("arcia-voice", false); ls.set("arcia-voice", on); syncV(); if (!on) stopVoice(); else toast(tr("Voice on — she'll read her replies aloud.")); });
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
      // v4: her order card opens ARCIRCLE Orders with the line filled in (on ArcPad: the tab; elsewhere: a link)
      var od = e.target.closest("[data-ord]");
      if (od && !HOST && typeof window.arcpadShowTab === "function") { e.preventDefault(); closeDrawer(); location.hash = od.getAttribute("href").replace(/^\/arc/, ""); return; }
      var st = e.target.closest("[data-start]");
      if (st) { startAct(st.getAttribute("data-start")); return; }
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
      if (id === "x") { loadFeed(); var xb = tabs.querySelector('[data-t="x"]'); if (xb) xb.classList.remove("dot"); }
      if (id === "today") loadToday();
      var sel = tabs.querySelector('[data-t="' + id + '"]'); if (sel && sel.scrollIntoView && tabs.scrollWidth > tabs.clientWidth) tabs.scrollTo({ left: sel.offsetLeft - 12, behavior: reduce ? "auto" : "smooth" });
      if (id === "letters") { if (!lettersLoaded) loadLetters(); var nf = panel.querySelector(".aa-lform [name=name_]"); if (nf && !nf.value) nf.value = ls.get("arcia-name", "") || ""; }
      if (id === "quiz") quizPaint();
      if (id === "profile") paintFan();
      if (id === "secret") secLoad();
    };
    tabs.addEventListener("click", function (e) { var b = e.target.closest("[role=tab]"); if (b) pick(b.getAttribute("data-t")); });
    pickTab = pick;
    panel.addEventListener("click", function (e) {
      var sb = e.target.closest("[data-sec]"); if (sb) { secStart(sb.getAttribute("data-sec")); return; }
      var sv = e.target.closest("[data-sec-view]"); if (sv) secView(Number(sv.getAttribute("data-sec-view")));
    });
    tabs.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var all = [].slice.call(tabs.querySelectorAll("[role=tab]")), i = all.indexOf(document.activeElement);
      if (i < 0) return;
      pick(all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length].getAttribute("data-t"), true);
    });
    var side = panel.querySelector(".aa-side");
    side.addEventListener("click", function (e) {
      var cpy = e.target.closest("[data-copy]");
      if (cpy) copyText(cpy.getAttribute("data-copy"), cpy);
      else if (e.target.closest("[data-ics]")) ics();
      else if (e.target.closest("[data-remind]")) remind();
      else if (e.target.closest("[data-q=start]")) quizStart();
      else if (e.target.closest(".aa-q-opts button")) quizPick(e.target.closest("button"));
      else if (e.target.closest(".aa-lt-heart")) heartLetter(e.target.closest(".aa-lt-heart"));
      else if (e.target.closest("[data-forget]")) { ls.set("arcia-name", null); paintFan(); }
      else if (e.target.closest("[data-gradalert]")) gradAlert();
      else if (e.target.closest("[data-say]")) { var sy = e.target.closest("[data-say]"); speak(sy.getAttribute("data-say"), sy.closest("li")); }
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
    // v4: talk mode, the hero's "Try it", the phone bar, the portrait column, idle lines, numbers that count up
    var tk = Q(".aa-talk"); if (tk) tk.addEventListener("click", talkToggle);
    panel.querySelector("[data-ordtry]").addEventListener("click", function () { chat.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); setTimeout(function () { startAct("order"); }, reduce ? 0 : 380); });
    var mb = panel.querySelector(".aa-mbar");
    mb.addEventListener("click", function (e) { if (e.target.closest("[data-mchat]") || e.target.closest("img")) { chat.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); setTimeout(function () { input.focus({ preventScroll: true }); }, 350); } });
    if ("IntersectionObserver" in window) {
      var heroIn = true, chatIn = false;
      var mbSync = function () {
        mb.hidden = heroIn || chatIn || !panel.classList.contains("active") || window.innerWidth > 900 || (drawer && !drawer.hidden);
        if (!mb.hidden) { var tb = document.querySelector(".bp-topbar"); var bt = tb ? tb.getBoundingClientRect().bottom : 60; root.style.setProperty("--aa-top", Math.max(0, Math.min(140, bt)) + "px"); }
      };
      new IntersectionObserver(function (es) { heroIn = es[0].isIntersecting; mbSync(); }, { threshold: 0 }).observe(panel.querySelector(".aa-id"));
      new IntersectionObserver(function (es) { chatIn = es[0].isIntersecting; mbSync(); }, { threshold: 0.25 }).observe(chat);
      new IntersectionObserver(function (es) { if (es[0].isIntersecting) { countUp(panel.querySelector(".aa-fam")); } }, { threshold: 0.3 }).observe(panel.querySelector(".aa-fam"));
      window.addEventListener("resize", mbSync); document.addEventListener("arcpad:tab", function () { setTimeout(mbSync, 0); });
    }
    ["pointerdown", "keydown", "scroll"].forEach(function (ev) { panel.addEventListener(ev, idleArm, { passive: true }); });
    paintMissions(); paintNext();
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
    // v4: the chat stays on this device (localStorage, the last 30 messages) — "New chat" clears it; an older chat
    // kept for the tab only (sessionStorage) is picked up once
    msgs = (ls.get(KEY2, null) || ss.get(KEY, []) || []).filter(function (m) { return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"; });
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
    loadRound(); xWatch(); idleArm();
    setInterval(function () { if (panel.classList.contains("active") && !document.hidden) xWatch(); }, 60000);
    setInterval(function () { if (!document.hidden) loadRound(); }, 120000);
    setInterval(function () { if (panel.classList.contains("active") && !document.hidden) loadHearts(); }, 20000);
    setTimeout(checkWallet, 1200);
    setInterval(function () { if (panel.classList.contains("active")) checkWallet(); }, 5000);
    setInterval(function () { if (panel.classList.contains("active") && !document.hidden) refreshLive(); }, 20000);
    setInterval(function () { if (panel.classList.contains("active") && !document.hidden) veaLoad(); }, 30000);
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
    panel.querySelectorAll(".aa-tabs [data-t] span").forEach(function (b) { b.textContent = T(TABS[b.parentNode.getAttribute("data-t")]); });
    paintMissions(); paintNext(); paintGrad(); paintToday(); paintRoundLink();
    panel.querySelector(".aa-profile").innerHTML = profileHtml();
  });
})();
