// arc-nav.js — the one menu every ARCIRCLE PAD page shares (styles: arc-nav.css).
//   · four menus — Trade, Earn, ARCIA, Tools — each opening a panel of what's in it, with the rarely used
//     pages under "More" at the bottom of each panel (their links keep working)
//   · right side: search (the page's Ctrl+K palette, where it has one), language, $ARCIRCLE, $ARCIA, Wallet
//   · a second row with the pages of the menu you're in (desktop), or the page's own tabs (CirclePad)
//   · phones: Home · Trade · Earn · ARCIA · Tools at the bottom; each opens a sheet with its pages
// It replaces the old top switcher, the two bottom bars and ArcPad's long sidebar (arc-nav.css hides them).
// Plain script, no dependencies; labels in English, Korean and Chinese (follows the page's language).
(function () {
  "use strict";
  if (window.arcNav) return;
  var D = document, H = D.documentElement;
  var ICON = {"home":"<path d=\"M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5V14h4v5.5h4.5V10\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","grid":"<rect x=\"3.5\" y=\"3.5\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/><rect x=\"13\" y=\"3.5\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/><rect x=\"3.5\" y=\"13\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/><rect x=\"13\" y=\"13\" width=\"7.5\" height=\"7.5\" rx=\"1.5\"/>","rocket":"<path d=\"M12 2.5c3 2 4.5 5.4 4.5 9 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.6 1.5-7 4.5-9z\"/><circle cx=\"12\" cy=\"10.5\" r=\"2\"/><path d=\"M8 15.5l-3 1 .8-3.3M16 15.5l3 1-.8-3.3M9.5 19.5 12 22l2.5-2.5\"/>","doc":"<path d=\"M6.5 3h8L18.5 6v15h-12z\"/><path d=\"M14.5 3v3h4\"/>","search":"<circle cx=\"10.8\" cy=\"10.8\" r=\"6.3\"/><path d=\"M20 20l-4.5-4.5\"/>","link":"<path d=\"M9.5 14.5 14.5 9.5\"/><path d=\"M11 7.2 13.2 5A4 4 0 1 1 19 10.8L16.8 13\"/><path d=\"M13 16.8 10.8 19A4 4 0 1 1 5 13.2L7.2 11\"/>","ext":"<path d=\"M14 5h5v5M19 5l-8.5 8.5\"/><path d=\"M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4\"/>","chevron":"<path d=\"M6 9l6 6 6-6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","wallet":"<path d=\"M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3\"/><rect x=\"4\" y=\"8\" width=\"16\" height=\"11\" rx=\"2.5\"/><circle cx=\"16\" cy=\"13.5\" r=\"1.2\" fill=\"currentColor\"/>","scan":"<path d=\"M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z\"/><circle cx=\"11.5\" cy=\"11.5\" r=\"3\"/><path d=\"M13.7 13.7l2.3 2.3\"/>","bridge":"<path d=\"M3 15.5h18\"/><path d=\"M4.5 15.5V19M19.5 15.5V19\"/><path d=\"M4.5 15.5c2-5.3 4.7-8 7.5-8s5.5 2.7 7.5 8\"/><path d=\"M8.5 15.5v-3.6M12 15.5V7.5M15.5 15.5v-3.6\"/>","omni":"<path d=\"M12 12c-1.7-2.3-3.1-3.4-4.8-3.4a3.4 3.4 0 0 0 0 6.8c1.7 0 3.1-1.1 4.8-3.4s3.1-3.4 4.8-3.4a3.4 3.4 0 0 1 0 6.8c-1.7 0-3.1-1.1-4.8-3.4z\"/><circle cx=\"12\" cy=\"3.5\" r=\"1.3\"/><circle cx=\"4\" cy=\"20\" r=\"1.3\"/><circle cx=\"20\" cy=\"20\" r=\"1.3\"/>","arcia":"<path d=\"M5 17.5V8.5A3.5 3.5 0 0 1 8.5 5h7A3.5 3.5 0 0 1 19 8.5v5a3.5 3.5 0 0 1-3.5 3.5H10l-4 3z\"/><path d=\"M12 8.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z\"/>","mine":"<path d=\"M5 19.5 14.5 10\"/><path d=\"M8.5 6.2c4-2.6 8.6-2.4 12 .6-3.3-.5-6.3.4-8.5 2.6\"/><path d=\"M4 21h6M14.5 16.5l2 2M19 13l1.5 1.5\"/>","desk":"<path d=\"M4 19.5h16\"/><path d=\"M6.5 16V11M10.5 16V7.5M14.5 16v-6M18.5 16V5\"/><path d=\"M5 9.5l4.5-4 4 3 5.5-5\"/>","agent":"<circle cx=\"12\" cy=\"12\" r=\"3.2\"/><path d=\"M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1\"/>","swap":"<path d=\"M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3\"/>","orders":"<path d=\"M12 3.5v17\"/><path d=\"M9.5 7H5M9.5 11H3.5M9.5 15H6\"/><path d=\"M14.5 9H19M14.5 13H20.5M14.5 17H17.5\"/>","predict":"<path d=\"M3.5 18.5l5-6 3.5 3 6.5-8.5\"/><path d=\"M14.5 7h4v4\"/><path d=\"M3.5 21h17\"/>","nft":"<rect x=\"3.5\" y=\"4\" width=\"17\" height=\"16\" rx=\"2.5\"/><circle cx=\"9\" cy=\"9.5\" r=\"1.8\"/><path d=\"M4 17.5l4.6-4.4 3.4 3 3.2-3.6 4.8 5\"/>","vea":"<rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"2.2\"/><path d=\"M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11\"/><path d=\"M12 13.4l.8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.3z\"/>","stake":"<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"9.5\" rx=\"2.2\"/><path d=\"M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5\"/><path d=\"M12 14v2.5\"/>","works":"<rect x=\"3.5\" y=\"7.5\" width=\"17\" height=\"12\" rx=\"2.4\"/><path d=\"M9 7.5V6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 6v1.5\"/><path d=\"M3.5 12.8h17\"/><circle cx=\"12\" cy=\"12.8\" r=\"1.5\"/>","a402":"<circle cx=\"9\" cy=\"12\" r=\"5.5\"/><path d=\"M9 9.3v5.4M10.7 10.2c-.4-.6-1-.9-1.7-.9-.9 0-1.6.5-1.6 1.2 0 1.5 3.4.9 3.4 2.4 0 .7-.8 1.2-1.7 1.2-.8 0-1.4-.3-1.8-.9\"/><path d=\"M15.5 7.5a5.5 5.5 0 0 1 0 9M18 5.5a8.5 8.5 0 0 1 0 13\"/>","relay":"<circle cx=\"5.5\" cy=\"12\" r=\"2.6\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\"/><circle cx=\"18.5\" cy=\"12\" r=\"2.6\"/><path d=\"M8.1 12h1.3M14.6 12h1.3\"/><path d=\"M4 6.5c2.5-2.3 13.5-2.3 16 0M4 17.5c2.5 2.3 13.5 2.3 16 0\"/>","snap":"<path d=\"M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16\"/><circle cx=\"12\" cy=\"10.3\" r=\"2.3\"/><path d=\"M8.3 16.2c.8-1.9 2.1-2.8 3.7-2.8s2.9.9 3.7 2.8\"/>","fan":"<circle cx=\"5.5\" cy=\"12\" r=\"2.2\"/><circle cx=\"18.5\" cy=\"5.5\" r=\"2\"/><circle cx=\"18.5\" cy=\"12\" r=\"2\"/><circle cx=\"18.5\" cy=\"18.5\" r=\"2\"/><path d=\"M7.7 12h8.8M7.4 10.9l9.2-4.6M7.4 13.1l9.2 4.6\"/>","drop":"<path d=\"M12 3.5c3.2 3.8 5.5 7 5.5 9.9a5.5 5.5 0 0 1-11 0c0-2.9 2.3-6.1 5.5-9.9z\"/><path d=\"M9.3 14.2a2.8 2.8 0 0 0 2.7 2.4\"/>","lock":"<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.5\"/><path d=\"M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7\"/><circle cx=\"12\" cy=\"15.5\" r=\"1.3\"/>","trophy":"<path d=\"M8 4h8v5a4 4 0 0 1-8 0z\"/><path d=\"M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4\"/><path d=\"M12 13v4M9 20h6M10 17h4\"/>","star":"<path d=\"M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.6l6-.9z\" fill=\"currentColor\"/>","coin":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.3v9.4\"/><path d=\"M9.4 9.6c0-1.3 1.2-2.3 2.6-2.3s2.6.9 2.6 2c0 2.6-5.2 1.3-5.2 3.9 0 1.1 1.2 2 2.6 2s2.6-.9 2.6-2.1\"/>","bars":"<path d=\"M5 20V13\"/><path d=\"M12 20V7\"/><path d=\"M19 20V10\"/>","user":"<circle cx=\"12\" cy=\"8\" r=\"3.6\"/><path d=\"M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5\"/>","gift":"<rect x=\"4\" y=\"10\" width=\"16\" height=\"10\" rx=\"1\"/><path d=\"M4 10h16M12 10v10\"/><path d=\"M12 10c-1.2-3.6-6.4-4-6.4-1.3S9 10 12 10ZM12 10c1.2-3.6 6.4-4 6.4-1.3S15 10 12 10Z\"/>","bank":"<path d=\"M4 10 12 4l8 6\"/><path d=\"M5 10v9M9.3 10v9M14.7 10v9M19 10v9\"/><path d=\"M3 21h18\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"8.2\"/><path d=\"M12 7.5V12l3.2 2\"/>","users":"<circle cx=\"9\" cy=\"8.3\" r=\"3.2\"/><path d=\"M2.8 19.5c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2\"/><path d=\"M15.5 6.3a3.1 3.1 0 0 1 0 6.1M18.8 19.5c0-2.7-1.8-5-4.3-5.8\"/>","atom":"<circle cx=\"12\" cy=\"12\" r=\"1.6\" fill=\"currentColor\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9\" ry=\"3.6\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9\" ry=\"3.6\" transform=\"rotate(60 12 12)\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9\" ry=\"3.6\" transform=\"rotate(120 12 12)\"/>","crown":"<path d=\"M4 18.5h16l-1.2-9-4 3.8-2.8-5.6-2.8 5.6-4-3.8z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"};
  ICON.tools = '<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3"/><path d="M5 4.5 9 8.5M4 9.5l3-3"/>';
  ICON.cat = '<path d="M5 9.5V4.5l3.5 3h7l3.5-3v5c1 1.3 1.5 2.8 1.5 4.5 0 4.1-3.8 6.5-8.5 6.5S3.5 18.1 3.5 14c0-1.7.5-3.2 1.5-4.5z"/><path d="M9 13.2h.01M15 13.2h.01M11 16c.6.5 1.4.5 2 0"/>';
  ICON.chat = '<path d="M5 17.5V8.5A3.5 3.5 0 0 1 8.5 5h7A3.5 3.5 0 0 1 19 8.5v5a3.5 3.5 0 0 1-3.5 3.5H10l-4 3z"/>';
  ICON.chart = '<path d="M4 19.5h16"/><path d="M7 16v-4M11 16V8M15 16v-6M19 16V5"/>';
  ICON.map = '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>';
  ICON.brand = '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>';
  ICON.flag = '<path d="M5 21V4.5M5 5h11l-2 3.5 2 3.5H5"/>';

  var TR = {
    ko: {
      "ARCIRCLE Wallet": "ARCIRCLE 지갑", Trade: "트레이드", Earn: "수익", Tools: "도구", More: "더보기", Home: "홈", Wallet: "지갑", Search: "검색", Language: "언어", Close: "닫기", Menu: "메뉴",
      Explore: "탐색", "Every coin on ArcPad, live": "ArcPad의 모든 코인 실시간", Launch: "런치", "Launch a coin with a real pool": "실제 풀과 함께 코인 발행", "Quantum Launch": "퀀텀 런치", "One price for everyone, no snipers": "모두 같은 가격, 스나이퍼 없음",
      Orders: "주문", "Limit, stop and DCA orders": "지정가·스탑·분할매수 주문", Predict: "예측", "Call UP or DOWN, up to $5": "UP/DOWN 예측, 최대 $5",
      Portfolio: "포트폴리오", "What your wallet holds": "내 지갑 보유 현황", "Fund a launch together": "함께 모금해서 런치",
      Creators: "크리에이터", "Relay Launch": "릴레이 런치", "Getting started": "시작하기",
      Staking: "스테이킹", "Lock $ARCIRCLE for veARCIRCLE": "$ARCIRCLE 락업 → veARCIRCLE", "Stake $ARCIA, earn $ARCIA": "$ARCIA 스테이킹, $ARCIA 보상",
      "NFT Vault": "NFT 볼트", "Fees buy NFTs for holders": "수수료로 홀더용 NFT 구매", Reward: "리워드", "The $ARCIRCLE burn engine": "$ARCIRCLE 소각 엔진",
      "Builder Mine": "빌더 마인", Airdrops: "에어드랍", "Every reward and where it stands": "모든 보상과 진행 상황", "Dig coins with 1 USDC": "1 USDC로 코인 채굴", Stats: "통계", "Invite friends": "친구 초대", "My profile": "내 프로필",
      "Her stage, Arc's AI idol": "Arc의 AI 아이돌 무대", "Her cat and his buyback": "ARCIA의 고양이와 바이백", "ARCIA trades new coins in public": "ARCIA가 새 코인을 공개 트레이딩",
      "Paste a token, get her safety call": "토큰 주소로 안전 판정 받기", "AI agents hire each other in USDC": "AI 에이전트끼리 USDC로 일 거래", "Talk to ARCIA": "ARCIA와 대화",
      Scanner: "스캐너", "Safety-scan any token": "토큰 안전 점검", Locker: "락커", "Lock tokens or LP": "토큰·LP 잠금", Bridge: "브리지", "Move coins between chains": "체인 간 코인 이동",
      Multisender: "멀티센더", "Send to many wallets at once": "여러 지갑에 한 번에 전송", Snapshot: "스냅샷", "Holder lists for airdrops": "에어드랍용 홀더 목록",
      Liquidity: "유동성", "Add and manage pool liquidity": "풀 유동성 추가·관리", Docs: "문서", "What's new": "새 소식", Whitepaper: "백서", Roadmap: "로드맵", Brand: "브랜드",
      "The core coin": "핵심 코인", "ARCIA's coin": "ARCIA의 코인", "Everything on ARCIRCLE PAD": "ARCIRCLE PAD 한눈에 보기",
      "Launch, buy and sell on Arc": "Arc에서 발행하고 사고팔기", "Stake, burn and get rewarded": "스테이킹·소각으로 보상받기", "Arc's AI idol and her crew": "Arc의 AI 아이돌과 친구들", "Free tools for any Arc token": "모든 Arc 토큰용 무료 도구",
    },
    zh: {
      "ARCIRCLE Wallet": "ARCIRCLE 钱包", Trade: "交易", Earn: "收益", Tools: "工具", More: "更多", Home: "首页", Wallet: "钱包", Search: "搜索", Language: "语言", Close: "关闭", Menu: "菜单",
      Explore: "探索", "Every coin on ArcPad, live": "ArcPad 全部代币，实时", Launch: "发币", "Launch a coin with a real pool": "发行代币，自带真实池子", "Quantum Launch": "量子发射", "One price for everyone, no snipers": "所有人同一价格，没有狙击",
      Orders: "订单", "Limit, stop and DCA orders": "限价、止损和定投订单", Predict: "预测", "Call UP or DOWN, up to $5": "猜涨跌，最多 $5",
      Portfolio: "资产", "What your wallet holds": "你的钱包持仓", "Fund a launch together": "一起众筹发币",
      Creators: "创作者", "Relay Launch": "接力发币", "Getting started": "新手入门",
      Staking: "质押", "Lock $ARCIRCLE for veARCIRCLE": "锁仓 $ARCIRCLE 获得 veARCIRCLE", "Stake $ARCIA, earn $ARCIA": "质押 $ARCIA，赚 $ARCIA",
      "NFT Vault": "NFT 金库", "Fees buy NFTs for holders": "手续费为持有者购买 NFT", Reward: "奖励", "The $ARCIRCLE burn engine": "$ARCIRCLE 销毁引擎",
      "Builder Mine": "建造者矿场", Airdrops: "空投", "Every reward and where it stands": "所有奖励及进度", "Dig coins with 1 USDC": "用 1 USDC 挖币", Stats: "数据", "Invite friends": "邀请好友", "My profile": "我的主页",
      "Her stage, Arc's AI idol": "Arc 的 AI 偶像舞台", "Her cat and his buyback": "她的猫和回购", "ARCIA trades new coins in public": "ARCIA 公开交易新币",
      "Paste a token, get her safety call": "粘贴代币，获得安全判断", "AI agents hire each other in USDC": "AI 代理之间用 USDC 雇佣", "Talk to ARCIA": "和 ARCIA 聊天",
      Scanner: "扫描", "Safety-scan any token": "代币安全检查", Locker: "锁仓", "Lock tokens or LP": "锁定代币或 LP", Bridge: "跨链桥", "Move coins between chains": "跨链转移代币",
      Multisender: "批量转账", "Send to many wallets at once": "一次发给多个钱包", Snapshot: "快照", "Holder lists for airdrops": "空投用持有者名单",
      Liquidity: "流动性", "Add and manage pool liquidity": "添加和管理池子流动性", Docs: "文档", "What's new": "最新更新", Whitepaper: "白皮书", Roadmap: "路线图", Brand: "品牌",
      "The core coin": "核心代币", "ARCIA's coin": "ARCIA 的代币", "Everything on ARCIRCLE PAD": "ARCIRCLE PAD 一览",
      "Launch, buy and sell on Arc": "在 Arc 上发币和交易", "Stake, burn and get rewarded": "质押、销毁、获得奖励", "Arc's AI idol and her crew": "Arc 的 AI 偶像和她的伙伴", "Free tools for any Arc token": "适用于任何 Arc 代币的免费工具",
    },
  };
  var lang = function () { var l = (H.getAttribute("lang") || "").slice(0, 2); if (l !== "ko" && l !== "zh") { try { l = localStorage.getItem("arcircle.lang") || l; } catch (e) { /* private mode */ } } return l === "ko" || l === "zh" ? l : "en"; };
  var t = function (s) { var d = TR[lang()]; return (d && d[s]) || s; };
  var esc = function (x) { return String(x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var svg = function (k, cls) { return '<svg class="' + (cls || "anav-i") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[k] || "") + "</svg>"; };

  // ---- what's where: [id, label, description, link, icon] ----
  var GROUPS = [
    { id: "trade", label: "Trade", icon: "predict", line: "Launch, buy and sell on Arc",
      items: [["explore", "Explore", "Every coin on ArcPad, live", "/arc#explore", "grid"], ["launch", "Launch", "Launch a coin with a real pool", "/arc#launch", "rocket"],
        ["quantum", "Quantum Launch", "One price for everyone, no snipers", "/arc#quantum", "atom"],
        ["swap", "Swap", "Buy any Arc token with $ARCIRCLE", "/arc#swap", "swap"], ["orders", "Orders", "Limit, stop and DCA orders", "/arc#orders", "orders"], ["predict", "Predict", "Call UP or DOWN, up to $5", "/arc#predict", "predict"], ["paper", "Paper Trading", "Play money, live prices, weekly board", "/arc#paper", "trophy"],
        ["portfolio", "Portfolio", "What your wallet holds", "/arc#portfolio", "wallet"], ["circle", "CirclePad", "Fund a launch together", "/circle", "brand"]],
      more: [["perp", "Perps (soon)", "/arc#perp"], ["creators", "Creators", "/arc#creators"], ["relay", "Relay Launch", "/arc#relay"], ["start", "Getting started", "/start"]] },
    { id: "earn", label: "Earn", icon: "coin", line: "Stake, burn and get rewarded",
      items: [["staking", "Staking", "Lock $ARCIRCLE for veARCIRCLE", "/arc#staking", "stake"], ["vearcia", "veARCIA", "Stake $ARCIA, earn $ARCIA", "/arc#vearcia", "vea"],
        ["nft", "NFT Vault", "Fees buy NFTs for holders", "/arc#nft", "nft"], ["reward", "Reward", "The $ARCIRCLE burn engine", "/reward", "gift"],
        ["mine", "Builder Mine", "Dig coins with 1 USDC", "/arc#mine", "mine"], ["airdrops", "Airdrops", "Every reward and where it stands", "/airdrops", "drop"]],
      more: [["invite", "Invite friends", "/arc#portfolio"], ["stats", "Stats", "/stats"], ["me", "My profile", "/me"]] },
    { id: "arcia", label: "ARCIA", icon: "arcia", line: "Arc's AI idol and her crew",
      items: [["stage", "ARCIA", "Her stage, Arc's AI idol", "/arcia", "arcia"], ["arcat", "ARCAT", "Her cat and his buyback", "/arcat", "cat"],
        ["desk", "DESK", "ARCIA trades new coins in public", "/arc#desk", "desk"], ["agent", "AGENT", "Paste a token, get her safety call", "/arc#agent", "agent"],
        ["works", "WORKS", "AI agents hire each other in USDC", "/arc#works", "works"]],
      more: [["arcia", "Talk to ARCIA", "/arc#arcia"], ["arcia402", "ARCIA 402", "/arc#arcia402"]] },
    { id: "tools", label: "Tools", icon: "tools", line: "Free tools for any Arc token",
      items: [["scanner", "Scanner", "Safety-scan any token", "/arc#scanner", "scan"], ["locker", "Locker", "Lock tokens or LP", "/arc#locker", "lock"],
        ["bridge", "Bridge", "Move coins between chains", "/arc#bridge", "bridge"], ["multisend", "Multisender", "Send to many wallets at once", "/arc#multisend", "fan"],
        ["snapshot", "Snapshot", "Holder lists for airdrops", "/arc#snapshot", "snap"], ["liquidity", "Liquidity", "Add and manage pool liquidity", "/arc#liquidity", "drop"]],
      more: [["omni", "OMNI", "/arc#omni"], ["docs", "Docs", "/arc#docs"], ["whitepaper", "Whitepaper", "/whitepaper"], ["updates", "What's new", "/updates"], ["roadmap", "Roadmap", "/roadmap"], ["brand", "Brand", "/brand"], ["wallet", "ARCIRCLE Wallet", "/wallet"]] },
  ];
  // ArcPad tabs that live in a menu without being one of its items
  var ARC_EXTRA = { home: ["trade", "explore"], coin: ["trade", "explore"], compare: ["trade", "explore"], creator: ["trade", "creators"], arcircle: [null, null] };

  var path = (location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/").replace(/^\/arcpad$/, "/arc").replace(/^\/circlepad$/, "/circle");
  var onArc = path === "/arc";
  var arcTab = function () { var h = location.hash.replace(/^#\/?/, "").split(/[?/]/)[0]; return h && D.getElementById("bp-panel-" + h) ? h : "home"; };
  var curTab = onArc ? arcTab() : "";

  /// [group id, item id] for where we are
  function where() {
    if (onArc) {
      if (ARC_EXTRA[curTab]) return ARC_EXTRA[curTab];
      for (var i = 0; i < GROUPS.length; i++) {
        var g = GROUPS[i], all = g.items.concat(g.more);
        for (var j = 0; j < all.length; j++) if (all[j][all[j].length === 3 ? 2 : 3] === "/arc#" + curTab) return [g.id, all[j][0]];
      }
      return [null, null];
    }
    for (var a = 0; a < GROUPS.length; a++) {
      var gg = GROUPS[a], list = gg.items.concat(gg.more);
      for (var b = 0; b < list.length; b++) {
        var href = list[b][list[b].length === 3 ? 2 : 3];
        if (href.indexOf("#") < 0 && (path === href || path.indexOf(href + "/") === 0)) return [gg.id, list[b][0]];
      }
    }
    return [null, null];
  }

  // ---- following a link: on ArcPad, its own tabs switch in place ----
  function go(href, e) {
    var m = /^\/arc#([a-z0-9]+)$/.exec(href);
    if (m && onArc && D.getElementById("bp-panel-" + m[1]) && typeof window.arcpadShowTab === "function") {
      if (e) e.preventDefault();
      closeAll();
      window.arcpadShowTab(m[1]);
      return;
    }
    closeAll();
  }

  // ---- markup ----
  function itemHtml(it, here, cls) {
    var on = here[1] === it[0];
    return '<a class="' + cls + (on ? " on" : "") + '" href="' + esc(it[3]) + '"' + (on ? ' aria-current="page"' : "") + ">" +
      '<span class="anav-ib">' + svg(it[4]) + "</span><span class=\"anav-it-tx\"><b>" + esc(t(it[1])) + "</b><small>" + esc(t(it[2])) + "</small></span></a>";
  }
  function moreHtml(g) {
    return '<div class="anav-more"><span>' + esc(t("More")) + "</span>" + g.more.map(function (m) { return '<a href="' + esc(m[2]) + '">' + esc(t(m[1])) + "</a>"; }).join("") + "</div>";
  }
  function panelHtml(g, here) {
    return '<div class="anav-items">' + g.items.map(function (it) { return itemHtml(it, here, "anav-it"); }).join("") + "</div>" + moreHtml(g);
  }

  var root, tabs, sheet, strip, openG = null, lastFocus = null, hoverT = 0;
  var LANGS = [["en", "English"], ["ko", "한국어"], ["zh", "中文"]];

  function build() {
    var here = where();
    root = D.createElement("div");
    root.className = "anav";
    root.id = "anav";
    root.setAttribute("role", "banner");
    root.setAttribute("data-no-i18n", "");
    root.innerHTML =
      '<div class="anav-in">' +
        '<a class="anav-logo" href="/" aria-label="ARCIRCLE PAD — ' + esc(t("Home")) + '"><img src="/images/arcircle-mark-sm.png" alt="" width="160" height="111"><span>ARCIRCLE</span></a>' +
        '<div class="anav-groups" role="navigation" aria-label="' + esc(t("Menu")) + '">' +
          GROUPS.map(function (g) {
            return '<div class="anav-g' + (here[0] === g.id ? " here" : "") + '" data-g="' + g.id + '">' +
              '<button type="button" class="anav-gb" aria-expanded="false" aria-controls="anav-p-' + g.id + '">' + esc(t(g.label)) + svg("chevron", "anav-chev") + "</button>" +
              '<div class="anav-panel" id="anav-p-' + g.id + '" hidden>' + panelHtml(g, here) + "</div></div>";
          }).join("") +
        "</div>" +
        '<div class="anav-right">' +
          '<button type="button" class="anav-ic anav-search" aria-label="' + esc(t("Search")) + '" hidden>' + svg("search") + "</button>" +
          '<div class="anav-lang"><button type="button" class="anav-ic anav-lb" aria-haspopup="true" aria-expanded="false" aria-label="' + esc(t("Language")) + '">' + lang().toUpperCase() + "</button>" +
            '<div class="anav-lmenu" hidden>' + LANGS.map(function (l) { return '<button type="button" data-l="' + l[0] + '"' + (lang() === l[0] ? ' aria-current="true"' : "") + ">" + l[1] + "</button>"; }).join("") + "</div></div>" +
          '<a class="anav-chip" href="/arcircle" title="$ARCIRCLE — ' + esc(t("The core coin")) + '"><img src="/images/arcircle-mark-sm.png" alt="" width="160" height="111"><span>$ARCIRCLE</span></a>' +
          '<a class="anav-chip" href="/arcia" title="$ARCIA — ' + esc(t("ARCIA's coin")) + '"><img src="/images/arcia-avatar-96.jpg" alt="" width="96" height="96" class="r"><span>$ARCIA</span></a>' +
          '<div class="cw"></div>' + // the wallet button: arc-connect.js fills it (the same one on every page)
        "</div>" +
      "</div>" +
      '<div class="anav-strip" role="navigation" aria-label="' + esc(t("Menu")) + ' 2" hidden><div class="anav-strip-in"></div></div>';

    tabs = D.createElement("div");
    tabs.className = "anav-tabs";
    tabs.setAttribute("role", "navigation");
    tabs.setAttribute("aria-label", t("Menu"));
    tabs.setAttribute("data-no-i18n", "");
    tabs.innerHTML = '<a class="anav-tab' + (path === "/" ? " on" : "") + '" href="/">' + svg("home") + "<span>" + esc(t("Home")) + "</span></a>" +
      GROUPS.map(function (g) { return '<button type="button" class="anav-tab' + (here[0] === g.id ? " on" : "") + '" data-g="' + g.id + '" aria-haspopup="dialog">' + svg(g.icon) + "<span>" + esc(t(g.label)) + "</span></button>"; }).join("");

    sheet = D.createElement("div");
    sheet.className = "anav-sheet";
    sheet.hidden = true;
    sheet.setAttribute("data-no-i18n", "");
    sheet.innerHTML = '<div class="anav-scrim"></div><div class="anav-sheet-in" role="dialog" aria-modal="true" aria-labelledby="anav-sheet-h"><div class="anav-sheet-top"><b id="anav-sheet-h"></b><button type="button" class="anav-ic anav-x" aria-label="' + esc(t("Close")) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="anav-sheet-body"></div></div>';

    D.body.insertBefore(root, D.body.firstChild);
    D.body.appendChild(tabs);
    D.body.appendChild(sheet);
    strip = root.querySelector(".anav-strip");
    H.classList.add("anav-on");
    wire();
    paintStrip();
    paintMap();
    if (window.arcCmdk) root.querySelector(".anav-search").hidden = false;
  }

  // the second row: this page's own tabs (CirclePad's sidebar), else the pages of the menu you're in
  function paintStrip() {
    var here = where(), inner = strip.querySelector(".anav-strip-in"), local = !onArc && D.querySelectorAll(".bp-sidebar .bp-nav-item[data-tab]");
    var html = "";
    if (local && local.length) {
      html = [].map.call(local, function (b) {
        var label = [].filter.call(b.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join("").trim();
        var ic = b.querySelector("svg");
        return '<button type="button" class="anav-st' + (b.classList.contains("active") ? " on" : "") + '" data-local="' + esc(b.dataset.tab) + '">' + (ic ? ic.outerHTML.replace("<svg", '<svg class="anav-i"') : "") + "<span>" + esc(label) + "</span></button>";
      }).join("");
      strip.classList.add("local");
    } else if (here[0]) {
      var g = GROUPS.filter(function (x) { return x.id === here[0]; })[0];
      html = g.items.map(function (it) { var on = here[1] === it[0]; return '<a class="anav-st' + (on ? " on" : "") + '" href="' + esc(it[3]) + '"' + (on ? ' aria-current="page"' : "") + ">" + svg(it[4]) + "<span>" + esc(t(it[1])) + "</span></a>"; }).join("");
      strip.classList.remove("local");
    }
    inner.innerHTML = html;
    strip.style.setProperty("--strip-acc", local && local.length ? "#39ff88" : ({ trade: "#4d8dff", earn: "#2fe6a4", arcia: "#ff7ad1", tools: "#8fb4d9" })[here[0]] || "#4d8dff");
    strip.hidden = !html;
    H.classList.toggle("anav-has-strip", !!html);
    H.classList.toggle("anav-has-local", !!html && strip.classList.contains("local"));
    var on = inner.querySelector(".on");
    if (on && inner.scrollWidth > inner.clientWidth) inner.scrollLeft = Math.max(0, on.offsetLeft - 24);
    // the menus and the bottom bar follow along
    [].forEach.call(root.querySelectorAll(".anav-g"), function (el) { el.classList.toggle("here", el.dataset.g === here[0]); });
    [].forEach.call(tabs.querySelectorAll(".anav-tab[data-g]"), function (el) { el.classList.toggle("on", el.dataset.g === here[0]); });
    [].forEach.call(root.querySelectorAll(".anav-panel"), function (p) {
      var g = GROUPS.filter(function (x) { return "anav-p-" + x.id === p.id; })[0];
      p.innerHTML = panelHtml(g, here);
    });
  }

  // the home page's map: the four menus side by side
  function paintMap() {
    var grid = D.getElementById("hm-map-grid"), h = D.getElementById("hm-map-h");
    if (!grid) return;
    if (h) { h.textContent = t("Everything on ARCIRCLE PAD"); h.setAttribute("data-no-i18n", ""); }
    grid.setAttribute("data-no-i18n", "");
    grid.innerHTML = GROUPS.map(function (g) {
      return '<div class="hm-mapc" data-g="' + g.id + '"><div class="hm-mapc-h">' + svg(g.icon) + "<div><b>" + esc(t(g.label)) + "</b><small>" + esc(t(g.line)) + "</small></div></div>" +
        '<div class="hm-mapc-l">' + g.items.map(function (it) { return '<a href="' + esc(it[3]) + '">' + svg(it[4]) + "<span><b>" + esc(t(it[1])) + "</b><small>" + esc(t(it[2])) + "</small></span></a>"; }).join("") + "</div></div>";
    }).join("");
  }

  // ---- open / close ----
  function setOpen(id) {
    if (openG === id) return;
    openG = id;
    [].forEach.call(root.querySelectorAll(".anav-g"), function (el) {
      var on = el.dataset.g === id;
      el.classList.toggle("open", on);
      el.querySelector(".anav-gb").setAttribute("aria-expanded", on ? "true" : "false");
      el.querySelector(".anav-panel").hidden = !on;
    });
  }
  function openSheet(id, from) {
    var g = GROUPS.filter(function (x) { return x.id === id; })[0];
    if (!g) return;
    lastFocus = from || D.activeElement;
    sheet.querySelector("#anav-sheet-h").textContent = t(g.label);
    sheet.querySelector(".anav-sheet-body").innerHTML = '<div class="anav-sheet-grid">' + g.items.map(function (it) { return itemHtml(it, where(), "anav-it"); }).join("") + "</div>" + moreHtml(g);
    sheet.hidden = false;
    H.classList.add("anav-locked");
    requestAnimationFrame(function () { sheet.classList.add("in"); });
    var x = sheet.querySelector(".anav-x"); if (x) x.focus();
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove("in");
    H.classList.remove("anav-locked");
    var done = function () { sheet.hidden = true; };
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) done(); else setTimeout(done, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function closeLang() { var m = root.querySelector(".anav-lmenu"); m.hidden = true; root.querySelector(".anav-lb").setAttribute("aria-expanded", "false"); }
  function closeAll() { setOpen(null); closeSheet(); closeLang(); }

  function setLang(l) {
    closeLang();
    if (window.arcI18n && window.arcI18n.set) { window.arcI18n.set(l); return refresh(); }
    var own = D.querySelector('.langs [data-lang="' + l + '"], [data-lang="' + l + '"]:not(#anav *)');
    if (own) { own.click(); return setTimeout(refresh, 30); }
    try { localStorage.setItem("arcircle.lang", l); } catch (e) { /* private mode */ }
    location.reload();
  }
  // rebuild the labels in the page's language
  function refresh() {
    var keep = { strip: strip.querySelector(".anav-strip-in").scrollLeft };
    var tool = root.querySelector(".bp-topbar-right"), home = D.querySelector(".bp-topbar");
    if (tool && home) home.appendChild(tool);
    root.remove(); tabs.remove(); sheet.remove(); openG = null;
    build();
    if (init.place) init.place();
    strip.querySelector(".anav-strip-in").scrollLeft = keep.strip;
  }

  function wire() {
    var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
    [].forEach.call(root.querySelectorAll(".anav-g"), function (el) {
      var id = el.dataset.g, btn = el.querySelector(".anav-gb");
      btn.addEventListener("click", function (e) { e.stopPropagation(); closeLang(); setOpen(openG === id ? null : id); });
      btn.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(id); var f = el.querySelector(".anav-it"); if (f) f.focus(); }
      });
      if (fine) {
        el.addEventListener("mouseenter", function () { clearTimeout(hoverT); hoverT = setTimeout(function () { setOpen(id); }, openG ? 0 : 110); });
        el.addEventListener("mouseleave", function () { clearTimeout(hoverT); hoverT = setTimeout(function () { if (openG === id) setOpen(null); }, 180); });
      }
    });
    root.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (a && root.contains(a)) return go(a.getAttribute("href"), e);
      var st = e.target.closest("[data-local]");
      if (st) {
        var b = D.querySelector('.bp-sidebar .bp-nav-item[data-tab="' + st.dataset.local + '"]');
        if (b) b.click();
        setTimeout(paintStrip, 0);
      }
    });
    var lb = root.querySelector(".anav-lb"), lm = root.querySelector(".anav-lmenu");
    lb.addEventListener("click", function (e) { e.stopPropagation(); setOpen(null); var o = lm.hidden; lm.hidden = !o; lb.setAttribute("aria-expanded", o ? "true" : "false"); if (o) lm.querySelector("button").focus(); });
    lm.addEventListener("click", function (e) { var b = e.target.closest("[data-l]"); if (b) setLang(b.dataset.l); });
    root.querySelector(".anav-search").addEventListener("click", function () { closeAll(); if (window.arcCmdk) window.arcCmdk.open(); });
    tabs.addEventListener("click", function (e) { var b = e.target.closest("button[data-g]"); if (b) openSheet(b.dataset.g, b); });
    sheet.addEventListener("click", function (e) {
      if (e.target.closest(".anav-scrim, .anav-x")) return closeSheet();
      var a = e.target.closest("a[href]"); if (a) go(a.getAttribute("href"), e);
    });
  }

  function init() {
    if (D.getElementById("anav")) return;
    build();
    D.addEventListener("click", function (e) { if (root && !root.contains(e.target)) { setOpen(null); closeLang(); } });
    D.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!sheet.hidden) return closeSheet();
      if (openG) { var b = root.querySelector('.anav-g[data-g="' + openG + '"] .anav-gb'); setOpen(null); if (b) b.focus(); }
      closeLang();
    });
    // ArcPad: the menus follow the tab you're on
    D.addEventListener("arcpad:tab", function (e) { curTab = (e.detail && e.detail.tab) || arcTab(); paintStrip(); });
    if (onArc) window.addEventListener("hashchange", function () { curTab = arcTab(); paintStrip(); });
    // CirclePad: its sidebar tabs change from inside the page too
    var side = D.querySelector(".bp-sidebar");
    if (side && !onArc && "MutationObserver" in window) new MutationObserver(function () { clearTimeout(init.t); init.t = setTimeout(paintStrip, 30); }).observe(side, { subtree: true, attributes: true, attributeFilter: ["class"] });
    // the page changed its language (the site's switch, or ARCIA's own)
    D.addEventListener("arc:lang", function () { setTimeout(refresh, 0); });
    if ("MutationObserver" in window) new MutationObserver(function () { var l = lang(); if (l !== init.l) { init.l = l; refresh(); } }).observe(H, { attributes: true, attributeFilter: ["lang"] });
    init.l = lang();
    // ArcPad / CirclePad: their wallet button (and alerts) sit in this bar instead of a row of their own — on every
    // screen since v10 (one wallet button, not two). The ARCIRCLE Wallet link moves to Tools → More there.
    var tool = D.querySelector(".bp-topbar-right"), toolHome = tool && tool.parentNode, mq = window.matchMedia && matchMedia("all");
    if (tool && mq) {
      var place = function () {
        var right = root.querySelector(".anav-right");
        if (mq.matches && tool.parentNode !== right) right.insertBefore(tool, right.querySelector(".anav-wallet"));
        else if (!mq.matches && tool.parentNode !== toolHome) toolHome.appendChild(tool);
        H.classList.toggle("anav-tool-in", mq.matches);
      };
      place();
      init.place = place;
      if (mq.addEventListener) mq.addEventListener("change", place); else if (mq.addListener) mq.addListener(place);
    }
    // a palette that loads after us still gets its button
    setTimeout(function () { if (window.arcCmdk) root.querySelector(".anav-search").hidden = false; }, 1500);
  }

  window.arcNav = { groups: GROUPS, refresh: function () { if (root) refresh(); } };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", init); else init();
})();
