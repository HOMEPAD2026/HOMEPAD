/* global CONFIG */
// arc-tour.js — the ArcPad guide: a spotlight walkthrough of the platform (arcpad.html, /arc#tour).
//
// Four tours — the quick one (about a minute), launching a coin, trading safely, staking and earning with ARCIA.
// Each step opens the right tab, lights up one part of the page and says what it does; "Play" runs the tour by
// itself (a demo), "Next / Back" or the arrow keys walk it. Demo steps type into a form to show what happens (an
// amount on the coin page, a coin name on the launch form, an order line in ARCIA's chat) and put everything back
// when the tour ends — nothing is ever submitted or signed. Entry points: the Home hero, the sidebar's Guide, a
// link to /arc#tour (or #tour/launch, #tour/trade, #tour/earn), and a one-time "New here?" hint.
(function () {
  "use strict";
  if (!document.getElementById("bp-panel-home")) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lang = function () { return (window.arcI18n && window.arcI18n.get()) || "en"; };
  var T = function (o) { return o[lang()] || o.en; };
  var L = function (en, ko, zh) { return { en: en, ko: ko, zh: zh }; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  var phone = function () { return window.innerWidth <= 760; };
  var show = function (tab) { if (typeof window.arcpadShowTab === "function") window.arcpadShowTab(tab); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var visible = function (el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== "hidden"; };
  /// the first selector of a list that is on the page and visible, polled until `ms`
  function find(sel, ms) {
    var list = String(sel).split("|");
    var t0 = Date.now();
    return new Promise(function (res) {
      (function poll() {
        for (var i = 0; i < list.length; i++) { var el = document.querySelector(list[i]); if (visible(el)) return res(el); }
        if (Date.now() - t0 > (ms || 4000)) return res(null);
        setTimeout(poll, 120);
      })();
    });
  }
  /// a coin to show: the King of the Hill if there is one, else the first card on Explore
  function aCoin() {
    var c = document.querySelector("#ap-topcoin [data-token], .ac2-feature[data-token], .ap-launch-card[data-token]");
    var t = c && c.getAttribute("data-token");
    if (!t && typeof window.arcAllCoins === "function") { try { var all = window.arcAllCoins() || []; t = all[0] && (all[0].token || all[0].address); } catch (e) { /* none */ } }
    return /^0x[0-9a-fA-F]{40}$/.test(t || "") ? t : null;
  }
  async function openCoin() {
    var cp = document.getElementById("bp-panel-coin");
    if (cp && cp.classList.contains("active") && visible(document.getElementById("apc-price"))) return true; // already on a coin
    show("explore"); await find(".ap-launch-card[data-token]", 5000);
    var t = aCoin();
    if (!t) return false;
    if (typeof window.openArcCoin === "function") window.openArcCoin(t); else location.hash = "#coin/" + t;
    await find("#apc-price", 5000); await sleep(600);
    return true;
  }
  /// the launch form shows one step at a time (arcpad-v6.js): open the tab, then that step
  var launchWas = null;
  async function launchStep(i) {
    var p = document.getElementById("bp-panel-launch");
    if (!p || !p.classList.contains("active")) { show("launch"); await find("#v6-rail|#ap-launch-form", 5000); }
    var V = window.arcV6;
    if (V && typeof V.setStep === "function") {
      if (launchWas == null && V.state && V.state.LS) launchWas = V.state.LS.step || 0;
      V.setStep(i, true);
    }
    await sleep(250);
  }
  /// a sticky bar (the top bar, the launch steps) can sit over the step's top edge: scroll just past it
  function uncover(el) {
    var r = el.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 60), y = Math.max(1, r.top + 6);
    if (ov) ov.classList.add("probe");
    var hit = document.elementFromPoint(x, y);
    if (ov) ov.classList.remove("probe");
    if (!hit || el.contains(hit) || hit.contains(el)) return;
    for (var n = hit; n && n !== document.body; n = n.parentElement) {
      var pos = getComputedStyle(n).position;
      if (pos === "sticky" || pos === "fixed") { var b = n.getBoundingClientRect().bottom; if (b > r.top) window.scrollBy(0, -(b - r.top + 12)); return; }
    }
  }
  // ---- demo typing: shows a value going into a field, remembers what was there, puts it back at the end ----
  var typed = [];
  async function typeInto(sel, text) {
    var el = await find(sel, 3000);
    if (!el || el.value) return; // never over someone's own draft
    typed.push(el);
    for (var i = 1; i <= text.length; i++) {
      el.value = text.slice(0, i);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (!reduce) await sleep(70);
    }
  }
  function untype() {
    typed.forEach(function (el) { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
    typed = [];
  }

  // ---------------- the steps ----------------
  // sel: what lights up (a | between fallbacks) · tab / go: how to get there · do: the demo · in: the tours it's part of
  var S = [
    { k: "hello", tab: "home", sel: ".bp-hero", in: "quick",
      t: L("Welcome to ArcPad", "ArcPad에 오신 걸 환영해요", "欢迎来到 ArcPad"),
      b: L("Launch and trade coins on Circle's Arc chain. Everything is paid in USDC — gas included — so there is no other token to buy first.",
        "Circle의 Arc 체인에서 코인을 런칭하고 거래해요. 가스비까지 전부 USDC로 내니까, 먼저 사야 할 다른 토큰이 없어요.",
        "在 Circle 的 Arc 链上发币和交易。一切都用 USDC 支付（包括 Gas），无需先买其他代币。") },
    { k: "stats", tab: "home", sel: "#ap-home-stats|.ap-stat-row", in: "quick",
      t: L("Live from the chain", "체인에서 바로 읽은 숫자", "直接读取链上数据"),
      b: L("Launches, volume and fees are read on-chain. When the network is slow, the page says how old the numbers are.",
        "런칭 수, 거래량, 수수료를 온체인에서 읽어요. 네트워크가 느리면 숫자가 언제 것인지 표시해요.",
        "发币数、交易量和手续费都从链上读取。网络较慢时，页面会标明数据的时间。") },
    { k: "top", tab: "home", sel: "#ap-topcoin|.ac2-feature|#ap-home-viewport", in: "quick",
      t: L("What's moving", "지금 움직이는 코인", "正在上涨的币"),
      b: L("The King of the Hill and the newest launches. Tap any coin to open its page.",
        "킹 오브 더 힐과 최신 런칭이에요. 아무 코인이나 누르면 코인 페이지가 열려요.",
        "山丘之王和最新发币。点任意币打开它的页面。") },
    { k: "explore", tab: "explore", sel: "#ap-explore-grid|.grid-launches", in: "quick trade",
      t: L("Explore every coin", "모든 코인 둘러보기", "浏览所有币"),
      b: L("Search, sort by volume or age, filter, or keep a watchlist. Each card shows the price move, the market cap and how far the coin has come.",
        "검색하고, 거래량이나 나이로 정렬하고, 필터를 걸거나 관심 목록을 만들어요. 카드마다 가격 변화, 시가총액, 진행 정도가 보여요.",
        "搜索、按交易量或时间排序、筛选，或加入自选。每张卡片显示涨跌、市值和进度。") },
    { k: "coin", go: openCoin, sel: ".ac2-head|#apc-price", in: "quick trade",
      t: L("A coin's page", "코인 페이지", "币的页面"),
      b: L("Price, market cap, liquidity, volume and holders — read from the coin's pool on Arc, refreshed as trades land.",
        "가격, 시가총액, 유동성, 거래량, 홀더 — Arc에 있는 코인의 풀에서 읽고, 거래가 들어올 때마다 갱신돼요.",
        "价格、市值、流动性、交易量和持有人 —— 从该币在 Arc 上的池子读取，随交易实时更新。") },
    { k: "chart", go: openCoin, sel: "#apc-chart", in: "trade",
      t: L("The chart", "차트", "图表"),
      b: L("Candles from every trade. Tap the chart to set a price for a limit or stop order.",
        "모든 거래로 만든 캔들이에요. 차트를 누르면 지정가나 손절 주문 가격으로 설정돼요.",
        "由每笔交易生成的 K 线。点图表即可设为限价或止损价。") },
    { k: "safety", go: openCoin, sel: "#apc-safety-panel|#apc-safety", in: "quick trade",
      t: L("Check before you buy", "사기 전에 확인", "买之前先检查"),
      b: L("ARCIA's safety check: is the liquidity locked, who holds the supply, and how many wallets bought in the first minute — a sign of snipers.",
        "ARCIA의 안전 점검이에요. 유동성이 잠겨 있는지, 물량을 누가 들고 있는지, 첫 1분에 몇 개 지갑이 샀는지(스나이퍼 신호)를 보여 줘요.",
        "ARCIA 的安全检查：流动性是否锁定、供应在谁手里、第一分钟有多少钱包买入（狙击信号）。") },
    { k: "swap", go: openCoin, sel: "#apc-swap", in: "quick trade", do: function () { return typeInto("#apc-amount", "10"); },
      t: L("Buy or sell in USDC", "USDC로 사고팔기", "用 USDC 买卖"),
      b: L("Type an amount and you see what you get, the price impact and the fee before anything happens. Nothing moves until you sign in your wallet.",
        "수량을 넣으면 받을 양, 가격 영향, 수수료가 먼저 보여요. 지갑에서 서명하기 전엔 아무것도 움직이지 않아요.",
        "输入数量，先看到能得到多少、价格影响和手续费。在钱包签名之前不会发生任何事。") },
    { k: "order", go: openCoin, sel: "#v7-ord", in: "quick trade",
      t: L("Limit and stop orders", "지정가·손절 주문", "限价和止损单"),
      b: L("Set a price to buy the dip or protect a gain. It opens ARCIRCLE Orders filled in, and you sign there.",
        "저점 매수나 수익 보호 가격을 정해요. ARCIRCLE Orders가 채워진 채 열리고, 거기서 서명해요.",
        "设定价格抄底或锁定收益。会打开已填好的 ARCIRCLE Orders，在那里签名。") },
    { k: "plat", go: function () { return launchStep(0); }, sel: ".v6-step.plat|#agl-plat", in: "launch",
      t: L("Where to launch", "어디서 런칭할지", "在哪里发币"),
      b: L("ArcPad launches on Arc. The same form can also launch on Pons (Robinhood Chain) or Pump.fun (Solana) — Compare shows the differences.",
        "ArcPad는 Arc에서 런칭해요. 같은 폼으로 Pons(로빈후드 체인)나 Pump.fun(솔라나)에서도 런칭할 수 있고, 비교하기에서 차이를 볼 수 있어요.",
        "ArcPad 在 Arc 上发币。同一个表单也能在 Pons（Robinhood Chain）或 Pump.fun（Solana）发币 —— “比较”里可以看区别。") },
    { k: "launch", go: function () { return launchStep(1); }, sel: ".v6-step.basics|#ap-launch-form", in: "quick launch",
      do: async function () { await typeInto("#ap-name", "Arc Kitty"); await typeInto("#ap-symbol", "KITTY"); },
      t: L("Launch a coin for 1 USDC", "1 USDC로 코인 런칭", "1 USDC 发币"),
      b: L("A name, a ticker and a picture. Your coin gets a Uniswap v4 pool from block one, and its liquidity is locked forever.",
        "이름, 티커, 사진이면 돼요. 코인은 첫 블록부터 Uniswap v4 풀을 갖고, 유동성은 영원히 잠겨요.",
        "名称、代码和图片就够了。你的币从第一个区块起就有 Uniswap v4 池，流动性永久锁定。") },
    { k: "pair", go: function () { return launchStep(2); }, sel: ".ap-pair|#ap-pair-seg", in: "launch",
      t: L("Pick what it trades against", "무엇과 거래할지 고르기", "选择交易对"),
      b: L("Pair the coin with USDC, or with another Arc token if your community already holds one.",
        "USDC와 짝지을 수도 있고, 커뮤니티가 이미 들고 있는 다른 Arc 토큰과 짝지을 수도 있어요.",
        "可以与 USDC 配对，也可以与社区已持有的其他 Arc 代币配对。") },
    { k: "start", go: function () { return launchStep(2); }, sel: ".ap-start-fixed|#ap-start-mcap", in: "launch",
      t: L("The same start for everyone", "모두 같은 출발선", "所有人同一起点"),
      b: L("Every ArcPad coin opens at the same price, so no launch gets a head start.",
        "모든 ArcPad 코인은 같은 가격에서 시작해요. 어떤 런칭도 먼저 출발하지 못해요.",
        "每个 ArcPad 币都以相同价格开盘，没有哪个发币能抢跑。") },
    { k: "fee", go: function () { return launchStep(2); }, sel: "#ap-extrafee", up: "label", in: "launch",
      t: L("Your own fee", "나만의 수수료", "你自己的手续费"),
      b: L("Add an optional 0–2% fee on every trade of your coin. It's 100% yours.",
        "내 코인의 모든 거래에 0~2% 수수료를 선택해서 붙일 수 있어요. 100% 내 몫이에요.",
        "可以为你的币的每笔交易加 0–2% 的手续费，100% 归你。") },
    { k: "devbuy", go: function () { return launchStep(2); }, sel: "#ap-devbuy", up: "label", in: "launch",
      t: L("An optional first buy", "선택: 첫 매수", "可选：首笔买入"),
      b: L("Buy some of your own coin in the same transaction, so nobody can get in before you.",
        "같은 트랜잭션에서 내 코인을 먼저 살 수 있어요. 그래서 아무도 나보다 먼저 못 사요.",
        "在同一笔交易里先买一些自己的币，没人能抢在你前面。") },
    { k: "review", go: function () { return launchStep(3); }, sel: "#ap-launch-preview|.v6-step.review", selM: ".v6-step.review|#ap-launch-preview", in: "launch",
      t: L("Review and launch", "확인하고 런칭", "检查并发币"),
      b: L("The preview shows your coin card and the full cost before you sign once. Your coin's page opens as soon as the transaction lands.",
        "서명하기 전에 미리보기로 코인 카드와 전체 비용을 확인해요. 트랜잭션이 들어가자마자 코인 페이지가 열려요.",
        "签名前，预览会显示你的币卡片和全部费用。交易一上链，你的币页面就会打开。") },
    { k: "portfolio", tab: "portfolio", sel: "#bp-panel-portfolio", in: "quick trade",
      t: L("Your portfolio", "내 포트폴리오", "我的资产"),
      b: L("Connect a wallet to see your coins, what they're worth, what you earned as a creator, and the trades of wallets you follow.",
        "지갑을 연결하면 내 코인과 가치, 크리에이터로 번 수익, 팔로우한 지갑의 거래가 보여요.",
        "连接钱包查看你的币和价值、作为创作者的收益，以及关注钱包的交易。") },
    { k: "orders", tab: "orders", sel: "#aor-body|#bp-panel-orders", in: "quick trade",
      t: L("ARCIRCLE Orders", "ARCIRCLE Orders", "ARCIRCLE Orders"),
      b: L("Limit, stop and DCA orders on Arc, Robinhood Chain and Solana. Your funds stay in your wallet until an order fills.",
        "Arc, 로빈후드 체인, 솔라나에서 지정가·손절·분할 매수 주문을 걸어요. 주문이 체결되기 전까지 자금은 내 지갑에 있어요.",
        "在 Arc、Robinhood Chain 和 Solana 上挂限价、止损和定投单。成交前资金一直在你的钱包里。") },
    { k: "staking", tab: "staking", sel: "#bp-panel-staking .bp-card|#bp-panel-staking", in: "earn",
      t: L("Stake $ARCIRCLE", "$ARCIRCLE 스테이킹", "质押 $ARCIRCLE"),
      b: L("Lock $ARCIRCLE for veARCIRCLE: it earns USDC every week and votes on where rewards go.",
        "$ARCIRCLE을 락업하면 veARCIRCLE이 생겨요. 매주 USDC를 받고, 보상이 어디로 갈지 투표해요.",
        "锁仓 $ARCIRCLE 获得 veARCIRCLE：每周赚取 USDC，并投票决定奖励去向。") },
    { k: "vea", tab: "vearcia", sel: "#vea-body .vea-hero|#vea-body|#bp-panel-vearcia", in: "quick earn",
      t: L("Stake $ARCIA in veARCIA", "veARCIA에 $ARCIA 스테이킹", "在 veARCIA 质押 $ARCIA"),
      b: L("Lock $ARCIA for 1 to 20 days. Longer locks count up to 2x, $ARCIRCLE holders boost up to 2x more, and rewards stream every second.",
        "$ARCIA를 1~20일 락업해요. 길게 잠글수록 최대 2배로 계산되고, $ARCIRCLE 홀더는 최대 2배 부스트를 더 받아요. 보상은 매초 쌓여요.",
        "锁仓 $ARCIA 1 到 20 天。锁得越久最高按 2 倍计算，$ARCIRCLE 持有者还能再获得最高 2 倍加成，奖励每秒发放。") },
    { k: "calc", tab: "arcia", sel: ".aa-vp-calc", in: "earn",
      t: L("Try the numbers first", "먼저 숫자로 계산해 보기", "先算一算"),
      b: L("On ARCIA's page, the calculator shows your veARCIA, your tier and an estimate of the rewards for any amount and lock.",
        "ARCIA 페이지의 계산기에서 수량과 락 기간을 넣으면 veARCIA, 티어, 예상 보상이 나와요.",
        "在 ARCIA 页面的计算器里，输入数量和锁仓天数即可看到 veARCIA、等级和预计奖励。") },
    { k: "arcia", tab: "arcia", sel: "#aa-chat|.aa-chat", in: "quick earn", do: function () { return typeInto(".aa-form textarea", "buy $20 of $ARCIA at mcap 30k"); },
      t: L("Ask ARCIA", "ARCIA에게 물어보기", "问 ARCIA"),
      b: L("Our AI idol knows every page. Ask anything, or tell her an order like this one — she fills it in, and you check and sign.",
        "우리 AI 아이돌은 모든 페이지를 알아요. 뭐든 묻거나, 이렇게 주문을 말하면 대신 채워 줘요. 확인하고 서명은 직접 해요.",
        "我们的 AI 偶像熟悉每个页面。随便问，或者像这样说出订单 —— 她帮你填好，你确认并签名。") },
    { k: "done", tab: "home", sel: ".bp-hero", in: "quick launch trade earn", last: true,
      t: L("You're ready", "준비 끝!", "准备好了"),
      b: L("Connect a wallet with a little USDC on Arc and you can start. This guide is always under Guide in the menu.",
        "Arc에 USDC가 조금 있는 지갑을 연결하면 바로 시작할 수 있어요. 이 가이드는 메뉴의 가이드에 항상 있어요.",
        "连接一个在 Arc 上有少量 USDC 的钱包就可以开始了。本指南随时在菜单的“指南”里。") },
  ];
  var TOURS = {
    quick: { t: L("The 1-minute tour", "1분 투어", "1 分钟导览"), d: L("Everything ArcPad does, quickly", "ArcPad의 모든 것을 빠르게", "快速了解 ArcPad 的一切") },
    launch: { t: L("Launch a coin", "코인 런칭하기", "发一个币"), d: L("From a name to a live pool", "이름부터 라이브 풀까지", "从名字到上线的池子") },
    trade: { t: L("Trade safely", "안전하게 거래하기", "安全交易"), d: L("Find, check, buy and set orders", "찾고, 확인하고, 사고, 주문 걸기", "发现、检查、买入、挂单") },
    earn: { t: L("Stake and earn", "스테이킹하고 벌기", "质押与收益"), d: L("$ARCIRCLE, veARCIA and ARCIA", "$ARCIRCLE, veARCIA, ARCIA", "$ARCIRCLE、veARCIA 和 ARCIA") },
  };
  var UI = {
    next: L("Next", "다음", "下一步"), back: L("Back", "이전", "上一步"), skip: L("End tour", "투어 종료", "结束导览"), done: L("Start exploring", "둘러보기 시작", "开始探索"),
    play: L("Play", "자동 재생", "自动播放"), pause: L("Pause", "일시정지", "暂停"), pick: L("Take a tour", "투어 시작하기", "开始导览"),
    sub: L("Pick one — each runs by itself, or step through it at your pace.", "하나를 골라요. 자동으로 진행되고, 원하는 속도로 넘겨도 돼요.", "选一个 —— 可以自动播放，也可以按自己的节奏一步步看。"),
    hint: L("New here? Take the 1-minute tour of ArcPad.", "처음이세요? ArcPad 1분 투어를 해 보세요.", "第一次来？看看 1 分钟 ArcPad 导览吧。"),
    go: L("Start", "시작", "开始"), later: L("Later", "나중에", "稍后"),
  };

  // ---------------- the overlay ----------------
  var st = { on: false, list: [], i: 0, play: false, timer: 0, raf: 0, el: null, tour: "quick", t0: 0, dur: 0, left: 0, token: 0 };
  var ov, ring, card, bar;
  function mount() {
    if (ov) return;
    ov = document.createElement("div");
    ov.className = "tr-ov"; ov.hidden = true;
    ov.innerHTML = '<div class="tr-shade" data-tr="shade"></div><div class="tr-ring" aria-hidden="true"><i class="tr-tap"></i></div>' +
      '<div class="tr-card" role="dialog" aria-modal="false" aria-live="polite" aria-labelledby="tr-title"><div class="tr-top"><span class="tr-chap" data-no-i18n></span><span class="tr-n" data-no-i18n></span>' +
      '<button type="button" class="tr-x" data-tr="end" aria-label="End tour"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<h3 id="tr-title" data-no-i18n></h3><p data-no-i18n></p><div class="tr-dots" aria-hidden="true"></div><div class="tr-bar" aria-hidden="true"><i></i></div>' +
      '<div class="tr-row"><button type="button" class="tr-play" data-tr="play"></button><span class="tr-sp"></span><button type="button" class="tr-back" data-tr="back"></button><button type="button" class="tr-next" data-tr="next"></button></div></div>';
    document.body.appendChild(ov);
    ring = ov.querySelector(".tr-ring"); card = ov.querySelector(".tr-card"); bar = ov.querySelector(".tr-bar i");
    ov.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tr]"); if (!b) return;
      var k = b.getAttribute("data-tr");
      if (k === "next") { stopPlay(); go(st.i + 1); }
      else if (k === "back") { stopPlay(); go(st.i - 1); }
      else if (k === "end") end();
      else if (k === "play") { if (st.play) stopPlay(); else { st.play = true; paintCtl(); arm(); } }
      else if (k === "shade") { stopPlay(); }
    });
    document.addEventListener("keydown", function (e) {
      if (!st.on || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.key !== "Escape")) return;
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight") { stopPlay(); go(st.i + 1); }
      else if (e.key === "ArrowLeft") { stopPlay(); go(st.i - 1); }
    });
  }
  function paintCtl() {
    var pb = card.querySelector(".tr-play");
    pb.innerHTML = (st.play ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>') + "<span>" + esc(T(st.play ? UI.pause : UI.play)) + "</span>";
    pb.setAttribute("aria-pressed", st.play ? "true" : "false");
    card.classList.toggle("playing", st.play);
  }
  function place() {
    st.raf = 0;
    if (!st.on) return;
    var el = st.el, pad = 8, r;
    if (el && el.isConnected && visible(el)) {
      r = el.getBoundingClientRect();
      var top = Math.max(6, r.top - pad), left = Math.max(6, r.left - pad);
      var w = Math.min(window.innerWidth - 12, r.width + pad * 2), h = Math.min(window.innerHeight - 12, r.bottom + pad - top);
      ring.style.transform = "translate(" + left + "px," + top + "px)"; ring.style.width = w + "px"; ring.style.height = Math.max(24, h) + "px";
      ring.classList.remove("none");
      if (!phone()) {
        // the card beside the light: below if there's room, else above, else to the side
        var cw = card.offsetWidth, ch = card.offsetHeight, gap = 14, vw = window.innerWidth, vh = window.innerHeight;
        var cx = Math.max(12, Math.min(vw - cw - 12, left + w / 2 - cw / 2)), cy;
        if (h > vh * 0.6) { cx = vw - cw - 28; cy = vh - ch - 28; } // a big area: the card waits in the corner, out of the way
        else if (top + h + gap + ch < vh - 10) cy = top + h + gap;
        else if (top - gap - ch > 10) cy = top - gap - ch;
        else { cy = top + 12; cx = left + w + gap + cw < vw ? left + w + gap : Math.max(12, left - gap - cw); }
        cy = Math.max(12, Math.min(vh - ch - 12, cy));
        card.style.transform = "translate(" + Math.round(cx) + "px," + Math.round(cy) + "px)";
      }
    } else { ring.classList.add("none"); if (!phone()) card.style.transform = "translate(" + Math.round(window.innerWidth / 2 - card.offsetWidth / 2) + "px," + Math.round(window.innerHeight / 2 - card.offsetHeight / 2) + "px)"; }
    st.raf = requestAnimationFrame(place);
  }
  function stopPlay() { if (!st.play) return; st.play = false; clearTimeout(st.timer); bar.style.transition = "none"; bar.style.width = "0"; paintCtl(); }
  function arm() {
    clearTimeout(st.timer);
    if (!st.play) return;
    var s = st.list[st.i];
    if (s.last) { stopPlay(); return; }
    var dur = Math.max(4200, Math.min(9000, (T(s.b).length + T(s.t).length) * 52));
    bar.style.transition = "none"; bar.style.width = "0"; void bar.offsetWidth;
    bar.style.transition = "width " + dur + "ms linear"; bar.style.width = "100%";
    st.timer = setTimeout(function () { go(st.i + 1); }, dur);
  }
  async function go(i) {
    if (!st.on) return;
    if (i < 0) i = 0;
    if (i >= st.list.length) { end(); return; }
    var tok = ++st.token;
    st.i = i;
    var s = st.list[i];
    card.classList.add("busy");
    if (s.go) await s.go(); else if (s.tab) { var p = document.getElementById("bp-panel-" + s.tab); if (!p || !p.classList.contains("active")) show(s.tab); }
    var el = await find(phone() && s.selM ? s.selM : s.sel, 6000);
    if (el && s.up) el = el.closest(s.up) || el; // light up the whole field, not just the input
    if (tok !== st.token || !st.on) return;
    st.el = el;
    if (el) {
      var r = el.getBoundingClientRect(), vh = window.innerHeight, room = phone() ? vh * 0.5 : vh - 40;
      // bring it into view: its top a little under the top bar (on phones, above the card at the bottom)
      if (r.top < 70 || r.top > room || r.height > room) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - (phone() ? 76 : 96)), behavior: reduce ? "auto" : "smooth" });
      await sleep(reduce ? 120 : 500);
      // a tab switch can scroll the page back to the top a moment later: check once more
      var r2 = el.getBoundingClientRect();
      if (r2.top > vh * 0.75 || r2.bottom < 70) { window.scrollTo({ top: Math.max(0, window.scrollY + r2.top - (phone() ? 76 : 96)) }); await sleep(120); }
      uncover(el);
    }
    if (tok !== st.token) return;
    var chap = TOURS[st.tour];
    card.querySelector(".tr-chap").textContent = T(chap.t);
    card.querySelector(".tr-n").textContent = (i + 1) + " / " + st.list.length;
    card.querySelector("h3").textContent = T(s.t);
    card.querySelector("p").textContent = T(s.b);
    card.querySelector(".tr-dots").innerHTML = st.list.map(function (_, k) { return "<i" + (k === i ? ' class="on"' : k < i ? ' class="was"' : "") + "></i>"; }).join("");
    var back = card.querySelector(".tr-back"), next = card.querySelector(".tr-next");
    back.textContent = T(UI.back); back.disabled = i === 0;
    next.textContent = s.last ? T(UI.done) : T(UI.next);
    card.classList.remove("busy");
    if (!reduce) { card.classList.remove("in"); void card.offsetWidth; card.classList.add("in"); ring.classList.remove("pulse"); void ring.offsetWidth; ring.classList.add("pulse"); }
    if (s.do) { try { await s.do(); } catch (e) { /* the demo is only a show */ } }
    if (tok !== st.token) return;
    arm();
  }
  function start(tour, play) {
    mount();
    closePick(); hintOff();
    st.tour = TOURS[tour] ? tour : "quick";
    st.list = S.filter(function (s) { return (" " + s.in + " ").indexOf(" " + st.tour + " ") >= 0; });
    st.on = true; st.play = play !== false; st.i = 0;
    ov.hidden = false;
    document.documentElement.classList.add("tr-on");
    paintCtl();
    if (!st.raf) st.raf = requestAnimationFrame(place);
    ls.set("arc-tour-seen", 1);
    go(0);
  }
  function end() {
    if (!st.on) return;
    st.on = false; st.token++;
    clearTimeout(st.timer); cancelAnimationFrame(st.raf); st.raf = 0;
    ov.hidden = true;
    document.documentElement.classList.remove("tr-on");
    untype();
    if (launchWas != null && window.arcV6 && window.arcV6.setStep) { window.arcV6.setStep(launchWas, true); launchWas = null; }
    if (/^#tour/.test(location.hash) && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  }

  // ---------------- the picker: four tours ----------------
  var pick = null;
  function openPick() {
    mount();
    if (!pick) {
      pick = document.createElement("div");
      pick.className = "tr-pick"; pick.hidden = true; pick.setAttribute("role", "dialog"); pick.setAttribute("aria-modal", "true"); pick.setAttribute("aria-labelledby", "tr-pick-h");
      document.body.appendChild(pick);
      pick.addEventListener("click", function (e) {
        if (e.target === pick || e.target.closest("[data-trp=x]")) { closePick(); return; }
        var b = e.target.closest("[data-trp]"); if (b) start(b.getAttribute("data-trp"), true);
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pick && !pick.hidden) closePick(); });
    }
    var ICO = { quick: '<path d="M8 5.5v13l10.5-6.5z"/>', launch: '<path d="M12 3c3 2.2 4.5 5.4 4.5 9.2L14 15h-4l-2.5-2.8C7.5 8.4 9 5.2 12 3z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M10 15l-1.5 4.5M14 15l1.5 4.5"/>', trade: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>', earn: '<rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/>' };
    pick.innerHTML = '<div class="tr-pick-box"><button type="button" class="tr-x" data-trp="x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<h3 id="tr-pick-h" data-no-i18n>' + esc(T(UI.pick)) + '</h3><p data-no-i18n>' + esc(T(UI.sub)) + "</p><div class=\"tr-pick-l\">" +
      Object.keys(TOURS).map(function (k, i) {
        var n = S.filter(function (s) { return (" " + s.in + " ").indexOf(" " + k + " ") >= 0; }).length;
        return '<button type="button" data-trp="' + k + '" class="' + k + '" style="--i:' + i + '"><span class="tr-pi"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICO[k] + '</svg></span><span class="tr-pt"><b data-no-i18n>' + esc(T(TOURS[k].t)) + '</b><small data-no-i18n>' + esc(T(TOURS[k].d)) + '</small></span><em data-no-i18n>' + n + " " + esc(T(L("steps", "단계", "步"))) + "</em></button>";
      }).join("") + "</div></div>";
    pick.hidden = false;
    setTimeout(function () { var f = pick.querySelector("[data-trp=quick]"); if (f) f.focus(); }, 30);
  }
  function closePick() { if (pick) pick.hidden = true; }

  // ---------------- "New here?" — once, a few seconds after a first visit to Home ----------------
  var hint = null;
  function hintOn() {
    if (ls.get("arc-tour-seen", 0) || ls.get("arc-tour-hint", 0) || st.on || /^#(?!home)/.test(location.hash)) return;
    ls.set("arc-tour-hint", 1);
    hint = document.createElement("div");
    hint.className = "tr-hint"; hint.setAttribute("role", "status");
    hint.innerHTML = '<span class="tr-hint-i" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span><span data-no-i18n>' + esc(T(UI.hint)) + '</span><button type="button" class="tr-hint-go" data-tour="quick" data-no-i18n>' + esc(T(UI.go)) + '</button><button type="button" class="tr-hint-x" aria-label="Close" data-no-i18n>' + esc(T(UI.later)) + "</button>";
    document.body.appendChild(hint);
    hint.querySelector(".tr-hint-x").addEventListener("click", hintOff);
    setTimeout(hintOff, 16000);
  }
  function hintOff() { if (hint) { var h = hint; hint = null; h.classList.add("out"); setTimeout(function () { h.remove(); }, 260); } }

  // ---------------- entry points ----------------
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-tour]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var k = b.getAttribute("data-tour");
    if (TOURS[k]) start(k, true); else openPick();
  }, true);
  // the Home hero gets a third button (the markup has two)
  (function () {
    var cta = document.querySelector("#bp-panel-home .bp-hero-cta");
    if (!cta || cta.querySelector("[data-tour]")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "bp-btn-ghost tr-hero-b"; b.setAttribute("data-tour", "pick");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg><span>Take the 1-minute tour</span>';
    cta.appendChild(b);
  })();
  var fromHash = function () {
    var m = /^#tour(?:\/(quick|launch|trade|earn))?$/.exec(location.hash);
    if (!m) return;
    setTimeout(function () { if (m[1]) start(m[1], true); else openPick(); }, 900);
  };
  window.addEventListener("hashchange", fromHash);
  if (document.readyState === "complete") fromHash(); else window.addEventListener("load", fromHash);
  window.addEventListener("load", function () { setTimeout(hintOn, 6000); });
  document.addEventListener("arc:lang", function () { if (st.on) go(st.i); if (pick && !pick.hidden) openPick(); });
  window.arcTour = { start: start, pick: openPick, end: end, steps: S, tours: TOURS };
})();
