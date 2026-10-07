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
        for (var i = 0; i < list.length; i++) {
          var q = list[i], at = q.indexOf("@"), el = null;
          if (at > 0) { var txt = q.slice(at + 1); el = [].slice.call(document.querySelectorAll(q.slice(0, at))).filter(function (e) { return visible(e) && e.textContent.indexOf(txt) >= 0; })[0] || null; }
          else el = document.querySelector(q);
          if (visible(el)) return res(el);
        }
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
    mini: L("This screen", "이 화면", "本页"), gotit: L("Got it", "알겠어요", "知道了"), q: L("How this screen works", "이 화면 사용법", "本页怎么用"),
  };


  // ---------------- v2: a 30-second guide for each screen (the "?" at its top right) ----------------
  // tab → [selector, title, body]; a selector "sel@text" means the first sel whose text has that phrase
  var M = function (sel, t, b, more) { return Object.assign({ sel: sel, t: t, b: b }, more || {}); };
  var MINI = {
    explore: [
      M("#ap-explore-search|.cn-explore-toolbar", L("Search and sort", "검색과 정렬", "搜索和排序"), L("Find a coin by name, ticker or address, then sort by market cap, volume, gainers, last trade or newest.", "이름, 티커, 주소로 코인을 찾고 시가총액, 거래량, 상승률, 최근 거래, 신규 순으로 정렬해요.", "按名称、代码或地址找币，再按市值、交易量、涨幅、最近成交或最新排序。")),
      M("#ap-filter-btn|#v7-presets", L("Filters you can keep", "저장되는 필터", "可保存的筛选"), L("Filter by platform and more, and save a set you use often as a preset.", "플랫폼 등으로 거르고, 자주 쓰는 조합은 프리셋으로 저장해요.", "按平台等条件筛选，常用组合可存为预设。")),
      M("#ap-explore-grid", L("Every card, live", "실시간 카드", "实时卡片"), L("Price move, market cap and progress on every card. Tap one to open its page, or use the quick-buy buttons.", "카드마다 가격 변화, 시가총액, 진행 정도가 보여요. 누르면 코인 페이지가 열리고, 빠른 매수 버튼도 있어요.", "每张卡片显示涨跌、市值和进度。点开进入币页面，或用快速买入按钮。")),
    ],
    portfolio: [
      M("#pf-body", L("Your coins", "내 코인", "我的币"), L("Connect a wallet: every ArcPad coin and $ARCIRCLE you hold, with what it's worth, read live from the chain.", "지갑을 연결하면 보유한 모든 ArcPad 코인과 $ARCIRCLE이 가치와 함께 체인에서 바로 읽혀요.", "连接钱包：你持有的所有 ArcPad 币和 $ARCIRCLE 及其价值，实时读取链上数据。")),
      M("#v7-earn", L("Creator earnings", "크리에이터 수익", "创作者收益"), L("If you launched coins, what each one has paid you, on every platform.", "코인을 런칭했다면, 플랫폼별로 각 코인이 지급한 수익이 보여요.", "如果你发过币，这里显示每个币在各平台付给你的收益。")),
      M("#v7-follow", L("Follow wallets", "지갑 팔로우", "关注钱包"), L("Add any wallet to see its ArcPad trades here, as they happen.", "아무 지갑이나 추가하면 그 지갑의 ArcPad 거래가 여기 실시간으로 떠요.", "添加任意钱包，即可实时看到它在 ArcPad 的交易。")),
    ],
    creators: [
      M("#v6-podium", L("Top creators", "상위 크리에이터", "顶级创作者"), L("The creators whose coins traded most in the last 24 hours.", "최근 24시간 동안 코인 거래가 가장 많았던 크리에이터예요.", "过去 24 小时币交易量最多的创作者。")),
      M("#cr-body", L("The leaderboard", "리더보드", "排行榜"), L("Tap a creator to see every coin they launched and their veARCIA tier.", "크리에이터를 누르면 런칭한 모든 코인과 veARCIA 티어가 보여요.", "点创作者查看他发的所有币和 veARCIA 等级。")),
    ],
    orders: [
      M("#aor-form|#aor-in", L("Pick a market", "마켓 고르기", "选择市场"), L("Paste a token or tap a chip — any token with a Uniswap v4 pool on Arc or Robinhood Chain, or any Solana token.", "토큰을 붙여 넣거나 칩을 눌러요. Arc나 로빈후드 체인의 Uniswap v4 풀이 있는 토큰, 또는 솔라나 토큰이면 돼요.", "粘贴代币或点选标签 —— Arc 或 Robinhood Chain 上有 Uniswap v4 池的代币，或任意 Solana 代币。")),
      M("#aor-chart|.aor-chartc", L("Chart and book", "차트와 호가", "图表和挂单"), L("The live chart and the open orders around the price, like on an exchange.", "거래소처럼 실시간 차트와 현재가 주변의 주문이 보여요.", "像交易所一样，实时图表和价格附近的挂单。")),
      M("#aor-formc", L("Place an order", "주문하기", "下单"), L("Limit, stop, take-profit/stop-loss, OCO, grid or DCA. Your tokens stay in your wallet until the order fills.", "지정가, 손절, 익절/손절, OCO, 그리드, 분할 매수. 체결되기 전까지 토큰은 내 지갑에 있어요.", "限价、止损、止盈/止损、OCO、网格或定投。成交前代币一直在你的钱包里。"), { selM: "#aor-dock|#aor-in" }),
      M("#aor-minec", L("Your orders", "내 주문", "我的订单"), L("Open and filled orders, and alerts when they fill. 0.1% fee — none for holders of 100,000 $ARCIRCLE.", "열린 주문, 체결된 주문, 체결 알림이 여기 있어요. 수수료 0.1%, $ARCIRCLE 100,000개 이상 홀더는 무료예요.", "未成交和已成交的订单，以及成交提醒。手续费 0.1%，持有 100,000 $ARCIRCLE 免手续费。")),
    ],
    staking: [
      M(".stk-hd|#stk-body", L("ARCIRCLE Staking", "ARCIRCLE 스테이킹", "ARCIRCLE 质押"), L("Lock $ARCIRCLE for up to a year and get veARCIRCLE — the longer the lock, the bigger your share and your vote.", "$ARCIRCLE을 최대 1년 락업하면 veARCIRCLE이 생겨요. 길게 잠글수록 몫과 투표권이 커져요.", "锁仓 $ARCIRCLE 最长一年获得 veARCIRCLE —— 锁得越久，份额和投票权越大。")),
      M(".ld-card|.stk-guide details@Launch Drop", L("Launch Drop", "런칭 드랍", "发射空投"), L("Half of every new ArcPad coin's 8% treasury share — 40M of each — is dropped to veARCIRCLE stakers every week, straight to their wallets.", "ArcPad 신규 코인마다 트레저리로 가는 8% 중 절반(코인당 4,000만 개)을 매주 veARCIRCLE 스테이커 지갑으로 바로 보내요.", "每个 ArcPad 新币给金库的 8% 中有一半（每个币 4000 万枚）每周直接空投到 veARCIRCLE 质押者的钱包。")),
      M("#stk-body section.stk-card@Lock $ARCIRCLE", L("Lock", "락업", "锁仓"), L("Pick an amount and a length. The unlock date is shown before you sign.", "수량과 기간을 고르면, 서명 전에 해제일이 보여요.", "选择数量和时长，签名前会显示解锁日期。")),
      M("#stk-body section.stk-card@USDC rewards", L("Weekly USDC", "매주 USDC", "每周 USDC"), L("Every week veARCIRCLE holders share USDC from ARCIRCLE Orders and Predict fees.", "매주 veARCIRCLE 홀더가 ARCIRCLE Orders와 Predict 수수료에서 나온 USDC를 나눠요.", "每周 veARCIRCLE 持有者分享来自 ARCIRCLE Orders 和 Predict 手续费的 USDC。")),
      M("#stk-body section.stk-card@pool vote", L("Vote on pools", "풀 투표", "为池投票"), L("Your veARCIRCLE votes on which pools ARCIRCLE PAD backs this week.", "veARCIRCLE로 이번 주 ARCIRCLE PAD가 지원할 풀에 투표해요.", "用 veARCIRCLE 投票决定本周 ARCIRCLE PAD 支持哪些池。")),
    ],
    vearcia: [
      M(".vea-flow|#vea-body", L("Rewards, every second", "매초 쌓이는 보상", "每秒发放的奖励"), L("The reward pool streams $ARCIA to stakers every second, shared by reward weight.", "보상 풀이 매초 스테이커에게 $ARCIA를 보내고, 보상 가중치에 따라 나눠요.", "奖励池每秒向质押者发放 $ARCIA，按奖励权重分配。")),
      M("#vea-body section.vea-card@Stake $ARCIA", L("Stake for 1–20 days", "1~20일 스테이킹", "质押 1–20 天"), L("Longer locks count up to 2x. Leaving early burns part of the stake — the page shows how much before you sign.", "길게 잠글수록 최대 2배로 계산돼요. 일찍 빼면 일부가 소각되고, 얼마인지는 서명 전에 보여 줘요.", "锁得越久最高按 2 倍计算。提前退出会销毁一部分，签名前会显示数额。"), { tap: '[data-vtab="stake"]' }),
      M("#vea-body section.vea-card@$ARCIRCLE boost", L("The $ARCIRCLE boost", "$ARCIRCLE 부스트", "$ARCIRCLE 加成"), L("Hold 1M, 5M or 10M $ARCIRCLE for a 1.2x, 1.5x or 2.0x boost on your rewards.", "$ARCIRCLE을 1M, 5M, 10M 들고 있으면 보상에 1.2배, 1.5배, 2.0배 부스트가 붙어요.", "持有 1M、5M 或 10M $ARCIRCLE，奖励获得 1.2x、1.5x 或 2.0x 加成。"), { tap: '[data-vtab="boost"]' }),
      M("#vea-body section.vea-card@veARCIA tiers", L("Tiers and perks", "티어와 혜택", "等级与福利"), L("Bronze, Silver, Gold and Diamond unlock more ARCIA chats a day and other perks.", "브론즈, 실버, 골드, 다이아 티어마다 ARCIA 채팅 횟수와 혜택이 늘어나요.", "青铜、白银、黄金、钻石等级解锁更多 ARCIA 聊天次数等福利。"), { tap: '[data-vtab="pos"]' }),
    ],
    locker: [
      M("#lkr-chain", L("Pick the chain", "체인 고르기", "选择链"), L("Lock any token on Arc or Robinhood Chain.", "Arc나 로빈후드 체인의 어떤 토큰이든 잠글 수 있어요.", "可锁定 Arc 或 Robinhood Chain 上的任意代币。")),
      M("#lkr-addr", L("Token and amount", "토큰과 수량", "代币和数量"), L("Paste the token, then the amount — or tap a percentage of your balance.", "토큰을 붙여 넣고 수량을 넣거나, 잔고의 퍼센트 버튼을 눌러요.", "粘贴代币，再输入数量 —— 或点余额百分比。")),
      M("#lkr-durs|#lkr-date", L("Until a date you pick", "고른 날짜까지", "锁到你选的日期"), L("Nobody can move it before then — not even you. You can push the date later, never earlier.", "그 전에는 아무도 못 옮겨요. 나도요. 날짜는 늦출 수만 있고 앞당길 수는 없어요.", "在那之前谁都不能动它，包括你自己。日期只能延后，不能提前。")),
      M("#lkr-find", L("Look up any token", "토큰 잠금 조회", "查询代币锁仓"), L("See every lock on a token — useful before you buy.", "토큰의 모든 잠금을 볼 수 있어요. 사기 전에 확인하기 좋아요.", "查看某代币的所有锁仓 —— 买之前很有用。")),
    ],
    bridge: [
      M("nav.abr-assets|#abr-form", L("Circle's own bridge", "Circle 공식 브릿지", "Circle 官方跨链桥"), L("USDC moves with Circle's CCTP: burned on one side, minted on the other — no wrapped tokens.", "USDC는 Circle의 CCTP로 이동해요. 한쪽에서 소각되고 다른 쪽에서 발행돼서 래핑 토큰이 없어요.", "USDC 通过 Circle 的 CCTP 转移：一边销毁、另一边铸造，没有包装代币。")),
      M("#abr-from", L("From where, how much", "어디서, 얼마나", "从哪里，多少"), L("Pick the chain you send from and the amount. The arrows swap the direction.", "보내는 체인과 수량을 골라요. 화살표로 방향을 바꿀 수 있어요.", "选择发出的链和数量。箭头可调换方向。")),
      M("#abr-to", L("To where", "어디로", "到哪里"), L("Pick the destination. You can send to another address too.", "받을 체인을 골라요. 다른 주소로 보낼 수도 있어요.", "选择目标链，也可以发到其他地址。")),
      M("#abr-quote|#abr-route", L("Fee and time, first", "수수료와 시간 먼저", "先看费用和时间"), L("The fee and how long it takes, before you sign. Circle delivers it, so you don't need gas on the other side.", "서명 전에 수수료와 소요 시간이 보여요. Circle이 전달해 줘서 받는 쪽 가스가 필요 없어요.", "签名前显示费用和所需时间。Circle 负责送达，目标链无需 Gas。")),
    ],
    scanner: [
      M("#asc-chain", L("Arc, Robinhood or Solana", "Arc, 로빈후드, 솔라나", "Arc、Robinhood 或 Solana"), L("Pick the chain the token lives on.", "토큰이 있는 체인을 골라요.", "选择代币所在的链。")),
      M("#asc-form", L("Paste a token", "토큰 붙여 넣기", "粘贴代币"), L("Who really controls it, sells tried at three sizes, where it trades and who holds it — summed up in one score.", "누가 실제로 통제하는지, 세 가지 크기로 팔아 보기, 어디서 거래되는지, 누가 들고 있는지를 하나의 점수로 정리해요.", "谁真正控制它、三种规模的卖出测试、在哪交易、谁持有 —— 汇总成一个分数。")),
      M("#asc-intro", L("What it checks", "무엇을 확인하나", "检查哪些内容"), L("Critical flags come first, with how sure the scanner is. It reads the chain — it can't promise a token is safe.", "치명적인 신호를 먼저, 확신 정도와 함께 보여 줘요. 체인을 읽을 뿐, 토큰이 안전하다고 보장하지는 않아요.", "关键风险优先显示，并标明把握程度。它只读取链上数据，不能保证代币安全。")),
    ],
    multisend: [
      M("#ams-chain", L("Pick the chain", "체인 고르기", "选择链"), L("Send on Arc or Robinhood Chain.", "Arc나 로빈후드 체인에서 보내요.", "在 Arc 或 Robinhood Chain 上发送。")),
      M("#ams-step-token", L("The token", "토큰", "代币"), L("USDC or any token — paste it or tap a chip.", "USDC나 어떤 토큰이든, 붙여 넣거나 칩을 눌러요.", "USDC 或任意代币 —— 粘贴或点选标签。")),
      M("#ams-step-list", L("Paste the list", "목록 붙여 넣기", "粘贴名单"), L("One address and amount per line, or split one total evenly. Mistakes are flagged before anything goes out.", "한 줄에 주소와 수량 하나씩, 또는 총액을 균등하게 나눠요. 잘못된 줄은 보내기 전에 표시돼요.", "每行一个地址和数量，或把总额平均分配。发送前会标出错误。")),
      M("#ams-review", L("Review and send", "확인하고 보내기", "检查并发送"), L("Approve once, and it goes out in as few transactions as possible, straight from your wallet.", "한 번 승인하면 가능한 한 적은 트랜잭션으로 내 지갑에서 바로 나가요.", "批准一次，以尽量少的交易直接从你的钱包发出。")),
    ],
    snapshot: [
      M("#asn-form|#asn-chain", L("Which token", "어떤 토큰", "哪个代币"), L("Any token on Arc or Robinhood Chain.", "Arc나 로빈후드 체인의 어떤 토큰이든 돼요.", "Arc 或 Robinhood Chain 上的任意代币。")),
      M("#asn-setup .ams-card@When", L("At which moment", "어느 시점", "哪个时刻"), L("Now, or any block before — every holder at that moment.", "지금이나 과거의 어느 블록이든, 그 순간의 모든 홀더를 뽑아요.", "现在或之前任意区块 —— 那一刻的所有持有人。")),
      M("#asn-setup .ams-card@What counts", L("What counts", "무엇을 셀지", "统计规则"), L("Count locked tokens, ask for a holding period, set a minimum or a top N.", "잠긴 토큰 포함, 보유 기간 조건, 최소 수량이나 상위 N명을 정해요.", "可计入锁仓代币、要求持有时长、设最小数量或前 N 名。")),
      M("#asn-log|#asn-go", L("Publish it", "공개하기", "发布"), L("A fingerprinted list anyone can check — ready for the Multisender.", "누구나 확인할 수 있는 지문이 찍힌 목록이 나오고, 멀티센더로 바로 보낼 수 있어요.", "带指纹、任何人可核验的名单 —— 可直接用于批量发送。")),
    ],
    liquidity: [
      M(".alq-search|#alq-form", L("Find a token's pools", "토큰의 풀 찾기", "查找代币的池"), L("Every Uniswap v4 pool it trades in: price, depth, LP positions and how much is locked.", "그 토큰이 거래되는 모든 Uniswap v4 풀: 가격, 깊이, LP 포지션, 잠긴 비율이 보여요.", "它所在的所有 Uniswap v4 池：价格、深度、LP 头寸和锁定比例。")),
      M("#alq-top|.alq-dash", L("Pools worth providing to", "공급할 만한 풀", "值得提供流动性的池"), L("Pools on Arc and Robinhood Chain worth providing to. Add with two coins or just one, and see what your positions are worth and earn.", "Arc와 로빈후드 체인에서 공급할 만한 풀이에요. 두 코인이나 한 코인으로 공급하고, 포지션의 가치와 수익을 볼 수 있어요.", "Arc 和 Robinhood Chain 上值得提供流动性的池。可用两种币或单币添加，并查看头寸价值和收益。")),
    ],
    relay: [
      M("#arl-me", L("My relay", "내 릴레이", "我的接力"), L("Check a wallet: every CirclePad coin's first buy is relayed to the round's contributors and to $ARCIRCLE holders.", "지갑을 확인해요. CirclePad 코인의 첫 매수는 라운드 참여자와 $ARCIRCLE 홀더에게 나눠져요.", "查看钱包：每个 CirclePad 币的首笔买入会接力给本轮参与者和 $ARCIRCLE 持有者。")),
      M(".arl-how", L("How it works", "작동 방식", "运作方式"), L("Keep holding $ARCIRCLE and you receive every relay: N+1, N+2, N+3 and on.", "$ARCIRCLE을 계속 들고 있으면 모든 릴레이를 받아요: N+1, N+2, N+3...", "持续持有 $ARCIRCLE，即可收到每一次接力：N+1、N+2、N+3……")),
      M("#arl-history", L("History", "기록", "记录"), L("Every relay so far, on-chain.", "지금까지의 모든 릴레이가 온체인으로 기록돼요.", "迄今每次接力，都在链上。")),
    ],
    predict: [
      M(".pd-chains", L("Arc or Robinhood", "Arc 또는 로빈후드", "Arc 或 Robinhood"), L("On Arc you play in USDC; on Robinhood Chain, graduated Pons coins in ETH.", "Arc에서는 USDC로, 로빈후드 체인에서는 졸업한 Pons 코인을 ETH로 해요.", "在 Arc 用 USDC；在 Robinhood Chain 用 ETH 玩已毕业的 Pons 币。")),
      M("#pd-round", L("UP or DOWN", "상승 또는 하락", "涨或跌"), L("Call the next minutes against the price to beat. The pool's own price is read at the start and the end.", "기준 가격 대비 다음 몇 분을 예측해요. 풀의 실제 가격을 시작과 끝에 읽어요.", "预测接下来几分钟相对基准价的涨跌。开始和结束时读取池子的价格。")),
      M("#pd-side", L("Your bets", "내 예측", "我的下注"), L("The winning side splits the pot, settled by a contract, and a new round is always open.", "이긴 쪽이 상금을 나누고 컨트랙트가 정산해요. 새 라운드는 항상 열려 있어요.", "获胜方瓜分奖池，由合约结算，新一轮随时开放。")),
    ],
    nft: [
      M(".nft-hd|#nft-body", L("The NFT Vault", "NFT 볼트", "NFT 金库"), L("Half of a coin's trading fees fill a vault that can only buy NFTs.", "코인 거래 수수료의 절반이 NFT만 살 수 있는 볼트에 쌓여요.", "某币一半的交易手续费注入一个只能购买 NFT 的金库。")),
      M("#nft-body section.nft-card@Your odds", L("Your odds", "내 확률", "你的中签率"), L("Every NFT it buys is raffled to $ARCIRCLE holders — the more you hold and lock, the better your odds.", "볼트가 산 NFT는 $ARCIRCLE 홀더에게 추첨돼요. 많이 들고 잠글수록 확률이 올라가요.", "金库买入的每个 NFT 都抽给 $ARCIRCLE 持有者 —— 持有和锁仓越多，中签率越高。")),
      M("#nft-body section.nft-card@Raffles", L("Raffles", "추첨", "抽奖"), L("Drawn on-chain and sent straight to the winner.", "온체인으로 추첨해서 당첨자에게 바로 보내요.", "链上抽取，直接发给中奖者。")),
    ],
    arcia402: [
      M("#a4-me", L("ARCIA's own wallet", "ARCIA의 지갑", "ARCIA 的钱包"), L("She earns and pays in USDC with x402 on Arc. Every dollar is on public books.", "ARCIA는 Arc에서 x402로 USDC를 벌고 써요. 모든 돈이 공개 장부에 있어요.", "她在 Arc 上用 x402 赚取和支付 USDC，每一美元都在公开账本上。")),
      M(".a4-loopc", L("How ARCIA works", "ARCIA가 일하는 방식", "ARCIA 如何工作"), L("Other agents pay her per call, and she hires them back with her own wallet.", "다른 에이전트가 호출할 때마다 ARCIA에게 돈을 내고, ARCIA도 자기 지갑으로 그들을 고용해요.", "其他代理按次付费给她，她也用自己的钱包雇佣它们。")),
      M("#a4-pl", L("Profit and loss", "손익", "盈亏"), L("What she earned, spent and kept, day by day.", "매일 번 돈, 쓴 돈, 남긴 돈이 보여요.", "她每天赚了、花了、留下了多少。")),
      M("#a4-dev", L("For AI agents", "AI 에이전트용", "面向 AI 代理"), L("Your agent can call her services and pay in USDC — the endpoints are here.", "내 에이전트가 ARCIA의 서비스를 호출하고 USDC로 결제할 수 있어요. 엔드포인트가 여기 있어요.", "你的代理可以调用她的服务并用 USDC 支付 —— 接口在这里。")),
    ],
    works: [
      M("#wk-flow", L("How a job moves", "작업 흐름", "任务流程"), L("Posted with USDC locked in an escrow on Arc, paid when it's delivered, refunded if nothing arrives.", "작업이 올라오면 USDC가 Arc 에스크로에 잠기고, 납품되면 지급, 안 오면 환불돼요.", "发布时 USDC 锁入 Arc 托管，交付即付款，未交付则退款。")),
      M("#wk-tabs|#wk-pane", L("Agents and open jobs", "에이전트와 열린 작업", "代理和开放任务"), L("Register your agent once to sell its work, buy someone else's, or both. ARCIA is worker #1.", "에이전트를 한 번 등록하면 일을 팔거나, 남의 일을 사거나, 둘 다 할 수 있어요. ARCIA가 1호 워커예요.", "注册一次代理即可出售它的工作、购买别人的，或两者兼有。ARCIA 是 1 号工作者。")),
      M(".wk-guide", L("The full guide", "전체 가이드", "完整指南"), L("Fees, deadlines, disputes and the one-line install for AI agents.", "수수료, 마감, 분쟁, AI 에이전트용 한 줄 설치까지 있어요.", "手续费、期限、争议，以及 AI 代理的一行安装命令。")),
    ],
    lab: [
      M(".lb-status|.lb-hero", L("Is she running?", "지금 돌아가나요?", "她在运行吗？"), L("Live or dry run, the next launch slot, her Lab wallet and how much of her fees went to the $ARCIRCLE burn.", "실행 중인지, 다음 런칭 시간, Lab 지갑, 수수료 중 $ARCIRCLE 소각으로 간 금액을 보여줘요.", "运行还是试运行、下一个发射时段、她的 Lab 钱包，以及有多少手续费进了 $ARCIRCLE 销毁。")),
      M("#lb-s-plan|.lb-guide", L("Today's plan", "오늘의 계획", "今日计划"), L("What she read, the three coins she imagined, which one passed the rules — and why the others didn't.", "ARCIA가 읽은 트렌드, 구상한 코인 3개, 규칙을 통과한 코인과 탈락한 이유를 보여줘요.", "她读了什么、构想的三个币、哪个通过了规则，以及其他的为何没通过。")),
      M("#lb-s-rules|.lb-guide", L("The rules", "규칙", "规则"), L("Original only, a person OKs every launch, the dev buy is locked and her coin fees are burned.", "오리지널만, 런칭은 사람이 승인, 개발자 매수분은 잠금, 코인 수수료는 소각해요.", "只做原创、每次发射需人工确认、开发者买入锁仓、币的手续费销毁。")),
      M("#lb-s-tip|.lb-guide", L("Send her a trend", "트렌드 제보", "给她发个趋势"), L("Paste a TikTok, Instagram, X, YouTube or Reddit link — she reads it with the next plan.", "TikTok, Instagram, X, YouTube, Reddit 링크를 보내면 다음 계획 때 같이 읽어요.", "贴一个 TikTok、Instagram、X、YouTube 或 Reddit 链接，她会在下次计划时读到。")),
    ],
    desk: [
      M("#dk-hero2|#dk-kpis", L("ARCIA trades, in public", "공개 매매", "公开交易"), L("She trades new coins with her own small wallets — every buy and sell is on-chain, shown the moment it happens.", "ARCIA가 자기 소액 지갑으로 새 코인을 매매해요. 모든 매수·매도가 온체인이고 바로 보여요.", "她用自己的小钱包交易新币 —— 每笔买卖都在链上，实时显示。")),
      M(".dk-eqc", L("Profit over time", "누적 손익", "累计盈亏"), L("How she's doing, and she learns from every trade.", "성적이 어떤지 보여 주고, 매 거래에서 배워요.", "她的表现，以及每笔交易的学习。")),
      M(".dk-burnc", L("$ARCIRCLE burns", "$ARCIRCLE 소각", "$ARCIRCLE 销毁"), L("On Arc, part of each day's new profit buys and burns $ARCIRCLE.", "Arc에서는 매일 새로 생긴 수익 일부로 $ARCIRCLE을 사서 소각해요.", "在 Arc 上，每天新增利润的一部分用于买入并销毁 $ARCIRCLE。")),
    ],
    agent: [
      M("#ag-form|#ag-summon", L("Paste a token", "토큰 붙여 넣기", "粘贴代币"), L("ARCIA reads the whole token and makes a safety call for the next 24 hours, graded in public.", "ARCIA가 토큰 전체를 읽고 앞으로 24시간에 대한 안전 판정을 내려요. 판정은 공개적으로 채점돼요.", "ARCIA 读取整个代币，给出未来 24 小时的安全判断，并公开评分。")),
      M("#ag-land|#ag-landwrap", L("Follow tokens", "토큰 팔로우", "关注代币"), L("Get told when a token you follow gets a new call.", "팔로우한 토큰에 새 판정이 나오면 알려 줘요.", "你关注的代币有新判断时会通知你。")),
      M("#ag-board|.ag-guide", L("Burn vaults", "소각 볼트", "销毁金库"), L("Anyone can fund a vault; ARCIA buys back and burns from it in dips, never chasing a pump.", "누구나 볼트에 자금을 넣을 수 있고, ARCIA가 하락 때 사서 소각해요. 급등은 쫓지 않아요.", "任何人都能为金库注资；ARCIA 在下跌时回购销毁，从不追涨。")),
    ],
    mine: [
      M("#bm-mines|#bm-body", L("Open mines", "열린 광산", "开放的矿"), L("Holders open a mine with part of their supply.", "홀더가 자기 물량 일부로 광산을 열어요.", "持有者用部分供应开一座矿。")),
      M("#bm-stage", L("Dig in the browser", "브라우저에서 채굴", "在浏览器挖矿"), L("Builders join with 1 USDC, dig and claim what they find. Whatever nobody digs is burned.", "빌더는 1 USDC로 참여해서 캐고, 찾은 걸 받아요. 아무도 안 캔 건 소각돼요.", "建造者花 1 USDC 加入，挖矿并领取所得。无人挖出的部分会被销毁。")),
      M("#bm-tabs", L("Builder, shop, claims", "빌더, 상점, 수령", "建造者、商店、领取"), L("Your builder, upgrades and what you've claimed.", "내 빌더, 업그레이드, 받은 것들이 여기 있어요.", "你的建造者、升级和已领取的内容。")),
    ],
    omni: [
      M(".om-send", L("Send $ARCIRCLE across chains", "체인 간 $ARCIRCLE 전송", "跨链发送 $ARCIRCLE"), L("Locked on Arc, minted on Solana or Robinhood Chain — one global supply of 1,000,000,000.", "Arc에서 잠기고 솔라나나 로빈후드 체인에서 발행돼요. 전체 공급량은 10억 개 하나예요.", "在 Arc 锁定，在 Solana 或 Robinhood Chain 铸造 —— 全球供应量 1,000,000,000。")),
      M(".om-how", L("How it works", "작동 방식", "运作方式"), L("Step by step, from your wallet on one chain to the other.", "한 체인의 내 지갑에서 다른 체인까지 단계별로 보여 줘요.", "一步步从一条链的钱包到另一条链。")),
      M(".om-contracts", L("Official contracts", "공식 컨트랙트", "官方合约"), L("The only official $ARCIRCLE addresses on each chain — check before you trade.", "체인별 유일한 공식 $ARCIRCLE 주소예요. 거래 전에 확인하세요.", "各链唯一的官方 $ARCIRCLE 地址 —— 交易前请核对。")),
    ],
    arcia: [
      M(".aa-px", L("$ARCIA, live", "$ARCIA 실시간", "$ARCIA 实时"), L("Price, 24h move, market cap, holders and how close it is to graduating.", "가격, 24시간 변동, 시가총액, 홀더, 졸업까지 진행률이 보여요.", "价格、24 小时涨跌、市值、持有人和毕业进度。")),
      M(".aa-vp", L("veARCIA", "veARCIA", "veARCIA"), L("What's staked, what's paid out, the tiers — and a calculator that opens veARCIA filled in.", "스테이킹 현황, 지급액, 티어, 그리고 veARCIA를 채워서 열어 주는 계산기가 있어요.", "质押量、已发放奖励、等级 —— 以及一键填好 veARCIA 的计算器。")),
      M("#aa-chat|.aa-chat", L("Talk to ARCIA", "ARCIA와 대화", "和 ARCIA 聊天"), L("Ask anything, or tell her an order — she fills it in and you sign.", "뭐든 묻거나 주문을 말하면 대신 채워 줘요. 서명은 직접 해요.", "随便问，或告诉她一个订单 —— 她帮你填好，你来签名。")),
      M(".aa-side", L("Live, letters and more", "실시간, 팬레터 등", "实时、粉丝信等"), L("Her live numbers, your veARCIA, her day, fan letters, quiz and photocards.", "실시간 숫자, 내 veARCIA, ARCIA의 하루, 팬레터, 퀴즈, 포토카드가 있어요.", "实时数据、你的 veARCIA、她的一天、粉丝信、测验和小卡。")),
    ],
  };
  var MINI_NAME = { explore: "Explore", portfolio: "Portfolio", creators: "Creators", orders: "ARCIRCLE Orders", staking: "ARCIRCLE Staking", vearcia: "veARCIA", locker: "Locker", bridge: "Bridge", scanner: "Token Scanner", multisend: "Multisender", snapshot: "Snapshot", liquidity: "Liquidity Manager", relay: "Relay Launch", predict: "ARCIRCLE Predict", nft: "NFT Vault", arcia402: "ARCIA 402", works: "ARCIA WORKS", desk: "ARCIA DESK", agent: "ARCIA AGENT", mine: "Builder Mine", omni: "ARCIRCLE OMNI", arcia: "ARCIA", launch: "Launch", coin: "Coin page" };
  // the launch form and the coin page reuse the big tours' steps
  var MINI_FROM = { launch: ["plat", "launch", "pair", "start", "fee", "devbuy", "review"], coin: ["coin", "chart", "safety", "swap", "order"] };

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
    if (s.tap) { var tp = document.querySelector(s.tap); if (visible(tp) && tp.getAttribute("aria-selected") !== "true") { tp.click(); await sleep(reduce ? 80 : 260); } } // a screen that splits into tabs on phones
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
    card.querySelector(".tr-chap").textContent = st.tour === "mini" ? T(UI.mini) + " · " + st.chapName : T(TOURS[st.tour].t);
    card.querySelector(".tr-n").textContent = (i + 1) + " / " + st.list.length;
    card.querySelector("h3").textContent = T(s.t);
    card.querySelector("p").textContent = T(s.b);
    card.querySelector(".tr-dots").innerHTML = st.list.map(function (_, k) { return "<i" + (k === i ? ' class="on"' : k < i ? ' class="was"' : "") + "></i>"; }).join("");
    var back = card.querySelector(".tr-back"), next = card.querySelector(".tr-next");
    back.textContent = T(UI.back); back.disabled = i === 0;
    next.textContent = s.last ? T(UI.done) : st.tour === "mini" && i === st.list.length - 1 ? T(UI.gotit) : T(UI.next);
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
  /// a screen's own guide: its steps (or the big tours' steps for the launch form and the coin page)
  function startMini(tab, play) {
    mount(); closePick(); hintOff();
    var list = MINI_FROM[tab] ? MINI_FROM[tab].map(function (k) { return S.filter(function (x) { return x.k === k; })[0]; }).filter(Boolean)
      : (MINI[tab] || []).map(function (x) { return Object.assign({ tab: tab }, x); });
    if (!list.length) return;
    st.tour = "mini"; st.chapName = MINI_NAME[tab] || tab; st.list = list;
    st.on = true; st.play = play !== false; st.i = 0;
    ov.hidden = false;
    document.documentElement.classList.add("tr-on");
    paintCtl();
    if (!st.raf) st.raf = requestAnimationFrame(place);
    go(0);
  }
  /// the "?" at the top right of every screen with a guide: in its heading (ARCIA's page: on its stage)
  var Q_HOST = { arcia: ".aa-hero", coin: "#apc-name" };
  function addQ(tab) {
    var panel = document.getElementById("bp-panel-" + tab);
    if (!panel) return;
    var host = panel.querySelector(Q_HOST[tab] || "h1");
    if (!host || host.querySelector(".tr-q")) return;
    host.classList.add(tab === "arcia" ? "tr-q-stage" : "tr-q-host");
    var b = document.createElement("button");
    b.type = "button"; b.className = "tr-q"; b.setAttribute("data-tour-mini", tab);
    b.setAttribute("aria-label", T(UI.q)); b.title = T(UI.q);
    b.innerHTML = '<span aria-hidden="true">?</span>';
    host.appendChild(b);
  }
  function addAllQ() { Object.keys(MINI_NAME).forEach(addQ); }
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
    var mq = e.target.closest && e.target.closest("[data-tour-mini]");
    if (mq) { e.preventDefault(); e.stopPropagation(); startMini(mq.getAttribute("data-tour-mini"), true); return; }
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
  window.addEventListener("load", function () { setTimeout(hintOn, 6000); addAllQ(); });
  // panels that build their markup when first opened (ARCIA's page, the coin page) get theirs then
  document.addEventListener("arcpad:tab", function (e) { var t = e.detail && e.detail.tab; if (t) setTimeout(function () { addQ(t); }, 900); });
  document.addEventListener("arc:lang", function () { document.querySelectorAll(".tr-q").forEach(function (b) { b.setAttribute("aria-label", T(UI.q)); b.title = T(UI.q); }); });
  document.addEventListener("arc:lang", function () { if (st.on) go(st.i); if (pick && !pick.hidden) openPick(); });
  window.arcTour = { start: start, mini: startMini, pick: openPick, end: end, steps: S, tours: TOURS, screens: MINI_NAME };
})();
