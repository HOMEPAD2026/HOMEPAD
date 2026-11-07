// hub.js — arcircle.app's front page (index.html): the door to every ARCIRCLE world.
// Languages (en/ko/zh/tr, arcircle.lang like the rest of the site), live numbers (players online and visitors from
// ?world=stats — opening the page counts as a visit, as the old gate did —, Arc's tx/s from ?arc=galaxy-lite, $ARCIRCLE's
// market cap from ?token=arcircle), and the motion: stars, parallax, cards revealed on scroll, a glow under the pointer,
// the Game World card playing its trailer on hover (computers only).
(function () {
  "use strict";
  var W = {
    ko: {
      skip: "월드로 바로 가기", navGame: "게임 월드", navPad: "플랫폼", navStudio: "크리에이터 허브", navArcia: "ARCIA", navGalaxy: "갤럭시", navArcl: "ARCL", navAgents: "AI 에이전트", navCoins: "코인",
      dGame: "하나의 월드, 10개의 게임", dPad: "ARCIRCLE PAD · 런칭 & 거래", dStudio: "브라우저에서 게임 만들기", dArcia: "Arc의 AI 아이돌", dGalaxy: "Arc의 모든 트랜잭션, 실시간", dArcl: "게임 코인", dAgents: "나를 위해 일하는 에이전트", dCoins: "$ARCIRCLE & ARCL 안내",
      lang: "언어", play: "무료 플레이", kicker: "Circle의 Arc 위에 커뮤니티가 만든 곳", h1a: "하나의 우주.", h1b: "Arc의 모든 세계.",
      sub: "게임을 하고, 코인을 런칭하고, 나만의 게임을 만들고, ARCIA를 만나고, Arc 체인 전체를 실시간으로 보세요 — 지갑 하나, 커뮤니티 하나로.",
      playBig: "ARCIRCLE WORLD 무료 플레이", explore: "세계 둘러보기", lOnline: "명 지금 플레이 중", lVisitors: "명 누적 방문", lTps: "Arc 초당 트랜잭션",
      wK: "세계를 고르세요", wH: "여덟 개의 문, 하나의 ARCIRCLE", wP: "모든 세계가 Circle의 Arc 위에서 돌아가요 — 가스는 USDC, 어디서나 같은 지갑.",
      tPlay: "플레이", cGame: "ARCIRCLE WORLD", cGameP: "하나의 오픈 월드, 10개의 게임: KART, Survivors, Jurassic, Poker, RAID QUEENS 등. 브라우저에서 무료.",
      tLaunch: "런칭 & 거래", cPad: "ARCIRCLE PAD", cPadP: "1 USDC로 첫 블록부터 진짜 풀이 있는 코인을 런칭하고, CirclePad에서 함께 펀딩하고, 지정가 주문으로 거래하세요.",
      tCreate: "만들기", cStudio: "크리에이터 허브", cStudioP: "브라우저에서 게임을 만들어요 — 3D 오비, 러너, 레이스 — 그리고 아케이드에 공개하세요.",
      tIdol: "AI 아이돌", cArciaP: "Arc의 AI 아이돌 — 모든 게임을 알고, 텔레그램과 X에서 답하고, 새 소식을 올려요.",
      tLive: "실시간 데이터", cGalaxyP: "Arc의 모든 트랜잭션이 살아있는 3D 은하를 날아다녀요 — 브리지, 스왑, 고래, 새 컨트랙트.",
      tCoin: "게임 코인", cArclP: "플레이로 버는 코인 — 무엇인지, 어디서 버는지, $ARCIRCLE과 어떻게 이어지는지.",
      tAgents: "AI 에이전트", cAgents: "AI 에이전트", cAgentsP: "게임 속 나만의 AI 에이전트 — 심부름, 아레나, 그리고 감사 후 Arc 위의 트레이딩 규칙.",
      tTokens: "토큰", cCoins: "$ARCIRCLE & ARCL", cCoinsP: "두 코인, 체인에서 읽은 실시간 숫자, 그리고 둘의 연결.",
      enter: "입장", open: "열기", meet: "만나기", watch: "보기",
      fK: "이렇게 이어져요", fH: "지갑 하나. 모든 것이 연결.", f1: "플레이하고 ARCL 벌기", f1p: "ARCIRCLE WORLD의 무료 게임이 하루 한도 안에서 게임 코인 ARCL을 줘요.",
      f2: "$ARCIRCLE로 교환", f2p: "게임에서 ARCL → $ARCIRCLE 교환을 요청하면 트레저리가 공시된 비율로 정산해요.", f3: "런칭 & 거래", f3p: "ARCIRCLE PAD에서 런칭, 라운드, 주문에 써요 — 가스는 USDC.",
      f4: "바이백 & 소각", f4p: "상점 지출과 플랫폼 수수료가 $ARCIRCLE을 사서 소각해요.",
      more: "더 보기", lWp: "백서", lRoad: "로드맵", lUpd: "업데이트", lDocs: "문서", lSup: "지원", lBrand: "브랜드", lPriv: "개인정보",
      foot: "Circle의 Arc 위에 만든 커뮤니티 프로젝트입니다. Arc나 Circle의 공식 사이트가 아닙니다.", gameOnline: "{n}명 지금 플레이 중", galaxyViews: "누적 {n}회 조회", galaxyTps: "지금 초당 {n}건", coinMcap: "$ARCIRCLE 시가총액 {n}"
    },
    zh: {
      skip: "直达各个世界", navGame: "游戏世界", navPad: "平台", navStudio: "创作者中心", navArcia: "ARCIA", navGalaxy: "星系", navArcl: "ARCL", navAgents: "AI 代理", navCoins: "代币",
      dGame: "一个世界，十款游戏", dPad: "ARCIRCLE PAD · 发行与交易", dStudio: "在浏览器里做游戏", dArcia: "Arc 的 AI 偶像", dGalaxy: "Arc 的每一笔交易，实时", dArcl: "游戏币", dAgents: "为你工作的代理", dCoins: "$ARCIRCLE 与 ARCL 说明",
      lang: "语言", play: "免费游玩", kicker: "社区在 Circle 的 Arc 上打造", h1a: "一个宇宙。", h1b: "Arc 上的每个世界。",
      sub: "玩游戏、发行代币、制作自己的游戏、认识 ARCIA，实时观看整条 Arc 链 —— 一个钱包，一个社区。",
      playBig: "免费玩 ARCIRCLE WORLD", explore: "探索各个世界", lOnline: "人正在游玩", lVisitors: "人累计访问", lTps: "Arc 每秒交易",
      wK: "选择你的世界", wH: "八扇门，一个 ARCIRCLE", wP: "每个世界都运行在 Circle 的 Arc 上 —— 用 USDC 付 gas，到处都是同一个钱包。",
      tPlay: "游玩", cGame: "ARCIRCLE WORLD", cGameP: "一个开放世界，十款游戏：KART、Survivors、Jurassic、扑克、RAID QUEENS 等。浏览器内免费。",
      tLaunch: "发行与交易", cPad: "ARCIRCLE PAD", cPadP: "用 1 USDC 发行代币，首个区块起就有真实资金池；在 CirclePad 一起众筹；用限价单交易。",
      tCreate: "创作", cStudio: "创作者中心", cStudioP: "在浏览器里做游戏 —— 3D 障碍跑、跑酷、竞速 —— 并发布到街机厅。",
      tIdol: "AI 偶像", cArciaP: "Arc 的 AI 偶像 —— 熟悉每款游戏，在 Telegram 和 X 上回答，发布最新消息。",
      tLive: "实时数据", cGalaxyP: "Arc 上的每笔交易在实时 3D 星系中飞行 —— 跨链、兑换、巨鲸、新合约。",
      tCoin: "游戏币", cArclP: "靠游玩赚取的代币 —— 它是什么、在哪里赚、如何与 $ARCIRCLE 相连。",
      tAgents: "AI 代理", cAgents: "AI 代理", cAgentsP: "游戏里属于你的 AI 代理 —— 跑腿、竞技场，以及审计后在 Arc 上的交易规则。",
      tTokens: "代币", cCoins: "$ARCIRCLE 与 ARCL", cCoinsP: "两种代币、链上实时数据，以及它们的联系。",
      enter: "进入", open: "打开", meet: "认识她", watch: "观看",
      fK: "如何相连", fH: "一个钱包，全部相连。", f1: "游玩赚取 ARCL", f1p: "ARCIRCLE WORLD 的免费游戏在每日上限内发放游戏币 ARCL。",
      f2: "兑换为 $ARCIRCLE", f2p: "在游戏中申请 ARCL → $ARCIRCLE，由金库按公布的汇率结算。", f3: "发行与交易", f3p: "在 ARCIRCLE PAD 上用于发行、轮次和订单 —— 用 USDC 付 gas。",
      f4: "回购与销毁", f4p: "商店消费和平台手续费用于回购并销毁 $ARCIRCLE。",
      more: "更多", lWp: "白皮书", lRoad: "路线图", lUpd: "更新", lDocs: "文档", lSup: "支持", lBrand: "品牌", lPriv: "隐私",
      foot: "基于 Circle 的 Arc 的社区项目，并非 Arc 或 Circle 官方网站。", gameOnline: "{n} 人正在游玩", galaxyViews: "累计 {n} 次浏览", galaxyTps: "当前每秒 {n} 笔", coinMcap: "$ARCIRCLE 市值 {n}"
    },
    tr: {
      skip: "Dünyalara geç", navGame: "Oyun Dünyası", navPad: "Platform", navStudio: "Creator Hub", navArcia: "ARCIA", navGalaxy: "Galaksi", navArcl: "ARCL", navAgents: "AI Ajanlar", navCoins: "Coinler",
      dGame: "Tek dünya, 10 oyun", dPad: "ARCIRCLE PAD · başlat & al-sat", dStudio: "Tarayıcıda oyun yap", dArcia: "Arc'ın AI idolü", dGalaxy: "Arc'taki her işlem, canlı", dArcl: "Oyun coini", dAgents: "Senin için çalışan ajanlar", dCoins: "$ARCIRCLE & ARCL rehberi",
      lang: "Dil", play: "Ücretsiz oyna", kicker: "Circle'ın Arc'ı üzerinde topluluk yapımı", h1a: "Tek evren.", h1b: "Arc'taki her dünya.",
      sub: "Oyun oyna, coin başlat, kendi oyununu yap, ARCIA ile tanış ve tüm Arc zincirini canlı izle — tek cüzdan, tek topluluk.",
      playBig: "ARCIRCLE WORLD'ü ücretsiz oyna", explore: "Dünyaları keşfet", lOnline: "kişi şu an oynuyor", lVisitors: "ziyaretçi", lTps: "Arc'ta işlem / sn",
      wK: "Dünyanı seç", wH: "Sekiz kapı, tek ARCIRCLE", wP: "Her dünya Circle'ın Arc'ında çalışır — gaz USDC ile, her yerde aynı cüzdan.",
      tPlay: "Oyna", cGame: "ARCIRCLE WORLD", cGameP: "Tek açık dünya, on oyun: KART, Survivors, Jurassic, Poker, RAID QUEENS ve fazlası. Tarayıcıda ücretsiz.",
      tLaunch: "Başlat & al-sat", cPad: "ARCIRCLE PAD", cPadP: "1 USDC'ye ilk bloktan gerçek havuzlu bir coin başlat, CirclePad'de birlikte fonla, limit emirlerle al-sat.",
      tCreate: "Yarat", cStudio: "Creator Hub", cStudioP: "Tarayıcında oyun yap — 3D obby, runner, yarış — ve arcade'e yayınla.",
      tIdol: "AI idol", cArciaP: "Arc'ın AI idolü — her oyunu bilir, Telegram ve X'te yanıtlar, yenilikleri paylaşır.",
      tLive: "Canlı veri", cGalaxyP: "Arc'taki her işlem canlı bir 3D galakside uçar — köprüler, takaslar, balinalar, yeni kontratlar.",
      tCoin: "Oyun coini", cArclP: "Oynayarak kazandığın coin — ne olduğu, nerede kazanıldığı ve $ARCIRCLE'a nasıl bağlandığı.",
      tAgents: "AI ajanlar", cAgents: "AI Ajanlar", cAgentsP: "Oyunda kendi AI ajanın — görevler, arena ve denetimden sonra Arc'ta alım-satım kuralları.",
      tTokens: "Tokenler", cCoins: "$ARCIRCLE & ARCL", cCoinsP: "İki coin, zincirden canlı rakamlar ve aralarındaki bağ.",
      enter: "Gir", open: "Aç", meet: "Tanış", watch: "İzle",
      fK: "Nasıl bağlanır", fH: "Tek cüzdan. Her şey bağlı.", f1: "Oyna & ARCL kazan", f1p: "ARCIRCLE WORLD'deki ücretsiz oyunlar günlük sınırlar içinde oyun coini ARCL öder.",
      f2: "$ARCIRCLE'a çevir", f2p: "Oyunda ARCL → $ARCIRCLE iste; hazine ilan edilen oranla öder.", f3: "Başlat & al-sat", f3p: "ARCIRCLE PAD'de başlatmalar, turlar ve emirler için kullan — gaz USDC ile.",
      f4: "Geri alım & yakım", f4p: "Dükkân harcamaları ve platform ücretleri $ARCIRCLE'ı geri alıp yakar.",
      more: "Daha fazla", lWp: "Whitepaper", lRoad: "Yol haritası", lUpd: "Güncellemeler", lDocs: "Belgeler", lSup: "Destek", lBrand: "Marka", lPriv: "Gizlilik",
      foot: "Circle'ın Arc'ı üzerinde bir topluluk projesi. Resmi bir Arc veya Circle sitesi değildir.", gameOnline: "{n} kişi şu an oynuyor", galaxyViews: "{n} görüntülenme", galaxyTps: "şu an saniyede {n} işlem", coinMcap: "$ARCIRCLE piyasa değeri {n}"
    }
  };
  var EN = { gameOnline: "{n} playing now", galaxyViews: "{n} views", galaxyTps: "{n} tx / s right now", coinMcap: "$ARCIRCLE market cap {n}" };
  var LANG = "en";
  try { var s = localStorage.getItem("arcircle.lang"); if (s && (s === "en" || W[s])) LANG = s; else { var n = (navigator.language || "en").slice(0, 2); if (W[n]) LANG = n; } } catch (e) { /* private */ }
  var t = function (k) { return (W[LANG] && W[LANG][k]) || EN[k] || k; };
  var $ = function (id) { return document.getElementById(id); };

  function applyLang() {
    document.documentElement.lang = LANG;
    document.querySelectorAll("[data-k]").forEach(function (el) {
      if (!el.dataset.en) el.dataset.en = el.innerHTML;
      var v = LANG === "en" ? null : W[LANG][el.dataset.k];
      el.innerHTML = v ? v.replace(/&(?!amp;)/g, "&amp;") : el.dataset.en;
    });
    $("hb-lang").value = LANG;
    paintLive();
  }
  $("hb-lang").addEventListener("change", function (e) { LANG = e.target.value; try { localStorage.setItem("arcircle.lang", LANG); } catch (x) { /* private */ } applyLang(); });

  // the top bar turns solid once you scroll; the phone menu
  var top = $("hb-top"), menu = $("hb-menu"), drawer = $("hb-drawer");
  // the universe dims as the worlds scroll over it
  var bgArt = document.querySelector(".hb-bg-art");
  var onScroll = function () { top.classList.toggle("solid", window.scrollY > 24); bgArt.style.setProperty("--dim", Math.max(0.28, 1 - window.scrollY / (innerHeight * 1.1)).toFixed(3)); };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  menu.addEventListener("click", function () { var open = drawer.hidden; drawer.hidden = !open; menu.setAttribute("aria-expanded", String(open)); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !drawer.hidden) { drawer.hidden = true; menu.setAttribute("aria-expanded", "false"); } });
  drawer.addEventListener("click", function (e) { if (e.target.closest("a")) { drawer.hidden = true; menu.setAttribute("aria-expanded", "false"); } });

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  // cards (and the flow's steps) come in one after another as they scroll into view
  var rv = document.querySelectorAll(".hb-card, .hb-flow li");
  if ("IntersectionObserver" in window && !reduce) {
    rv.forEach(function (el, i) { el.classList.add("hb-rv"); el.style.setProperty("--d", (i % 4) * 0.07 + "s"); });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
    rv.forEach(function (el) { io.observe(el); });
  }
  // a glow follows the pointer over a card; the Game World card plays its trailer on hover (computers)
  document.querySelectorAll(".hb-card").forEach(function (c) {
    c.addEventListener("pointermove", function (e) { var r = c.getBoundingClientRect(); c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px"); });
    var v = c.querySelector("video");
    if (!v || !fine || reduce || (navigator.connection && navigator.connection.saveData)) return;
    c.addEventListener("pointerenter", function () { if (!v.src) v.src = v.dataset.src; var p = v.play(); if (p && p.then) p.then(function () { c.classList.add("playing"); }).catch(function () { /* autoplay refused */ }); });
    c.addEventListener("pointerleave", function () { c.classList.remove("playing"); v.pause(); });
  });
  // parallax: the universe drifts a little with the mouse
  if (fine && !reduce) {
    var art = document.querySelector(".hb-bg-art"), raf = 0, mx = 0, my = 0;
    window.addEventListener("pointermove", function (e) { mx = (e.clientX / innerWidth - 0.5) * -18; my = (e.clientY / innerHeight - 0.5) * -12; if (!raf) raf = requestAnimationFrame(function () { raf = 0; art.style.setProperty("--px", mx + "px"); art.style.setProperty("--py", my + "px"); }); }, { passive: true });
  }

  // stars: a light 2D layer that twinkles (resting while the tab is hidden; still with reduce-motion)
  (function stars() {
    var cv = document.querySelector(".hb-stars"), cx = cv.getContext("2d"); if (!cx) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1), S = [], w = 0, h = 0;
    function size() { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); var n = Math.round(Math.min(160, w * h / 9000)); S = []; for (var i = 0; i < n; i++) S.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.6, c: Math.random() < 0.2 ? "#9ff3ff" : Math.random() < 0.15 ? "#b9ffd9" : "#ffffff" }); }
    size(); window.addEventListener("resize", size);
    var last = 0;
    function draw(now) {
      if (!document.hidden && now - last > 50) {
        last = now; cx.clearRect(0, 0, w, h);
        for (var i = 0; i < S.length; i++) { var s = S[i], a = reduce ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 1000 * s.s + s.p)); cx.globalAlpha = a; cx.fillStyle = s.c; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.283); cx.fill(); }
      }
      if (!reduce) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  // live numbers
  var live = {};
  var fmtN = function (n) { try { return Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : LANG === "tr" ? "tr-TR" : "en-US"); } catch (e) { return String(n); } };
  var fmtUsd = function (v) { return v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v); };
  function chip(k, txt) { var li = document.querySelector('#hb-live [data-live="' + k + '"]'); if (!li || txt == null) return; li.querySelector("b").textContent = txt; li.hidden = false; }
  function meta(k, txt) { var el = document.querySelector('.hb-meta[data-live="' + k + '"]'); if (el) el.textContent = txt || ""; }
  function paintLive() {
    if (live.online > 0) { chip("online", fmtN(live.online)); meta("gameOnline", "● " + t("gameOnline").replace("{n}", fmtN(live.online))); }
    if (live.visitors > 0) chip("visitors", fmtN(live.visitors));
    if (live.tps != null) { var v = live.tps >= 10 ? live.tps.toFixed(0) : live.tps.toFixed(1); chip("tps", v); meta("galaxyTps", "● " + t("galaxyTps").replace("{n}", v) + (live.gv > 0 ? " · 👁 " + t("galaxyViews").replace("{n}", fmtN(live.gv)) : "")); }
    if (live.mcap > 0) { chip("mcap", fmtUsd(live.mcap)); meta("coinMcap", t("coinMcap").replace("{n}", fmtUsd(live.mcap))); }
  }
  var get = function (u, o) { return fetch(u, o).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  // opening the site counts as a visit (the same browser at most once per 10 minutes on the server; api/_world.mjs) — this was the gate's job
  var vid = "";
  try { vid = localStorage.getItem("arc.world.vid") || ""; if (!/^[a-z0-9]{20}$/.test(vid)) { vid = Array.from(crypto.getRandomValues(new Uint8Array(20)), function (b) { return "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]; }).join(""); localStorage.setItem("arc.world.vid", vid); } } catch (e) { vid = ""; }
  var stats = function () { return get("/api/social?world=stats"); };
  (vid && !navigator.webdriver ? get("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "world-ping", id: vid, visit: true, gate: true }) }).then(function (j) { return j && j.visitors != null ? j : stats(); }) : stats())
    .then(function (j) { if (j) { live.online = j.online; live.visitors = j.visitors; paintLive(); } });
  function arc() { get("/api/social?arc=galaxy-lite").then(function (j) { if (j && j.stats) { var s = j.stats; live.tps = s.tps1m != null ? s.tps1m : s.tps; live.gv = j.views || 0; paintLive(); } }); }
  arc(); setInterval(function () { if (!document.hidden) arc(); }, 20000);
  get("/api/social?token=arcircle").then(function (j) { if (j && j.mcap != null) { live.mcap = j.mcap; paintLive(); } });

  applyLang();
})();
