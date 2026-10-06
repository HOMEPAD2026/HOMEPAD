/* global ethers, CONFIG, ARC, ACT, APC, state, readProvider, apcRenderData, apcRenderChart, apcRenderState, apcTsOf, apcSpot, apcFmtPrice,
          apcExplorer, openArcCoin, arcIsWatched, actTs, actGetLogs, arcActStats, arcChangeSinceLaunch, connectWallet */
// arcpad-v7-coin.js — ArcPad v7, part two (after arcpad-v7.js):
//   Coin page   price → chart → safety → tabs; on a phone a sticky bar jumps between them. A limit / stop order from
//               the page (tap the chart to set the price) that opens in ARCIRCLE Orders filled in. The coin's
//               ARCIRCLE Predict round. "Due diligence by ARCIA" (ARCIA WORKS, filled in). Milestones ($20K, $100K
//               market cap) as a bar and a ring around the logo. The first minute of buying in the safety check
//               (who bought, how much, what they still hold). An embed card for other sites. The price rolls like an
//               odometer and flashes, holders tick up with a "+1", a new candle grows, a big sell pops like a big buy.
//   Creator     #creator?a=0x… (and /creator/0x…, api/_aplist.mjs): every coin a wallet launched on any platform, its
//               veARCIA tier, fees its ArcPad coins made in 24 h, follow it
//   Compare     #compare?t=a,b[,c] — two or three Arc coins side by side
//   Portfolio   creator earnings across ArcPad, Argus, Pons and Pump.fun in one table (each platform's own claim), the
//               trades of the wallets you follow (last 12 h), and your watchlist on Telegram (ARCIA's DMs)
(function () {
  "use strict";
  if (typeof ARC === "undefined" || !window.arcV7) return;
  const X = window.arcV7;
  const { esc, lc, isAddr, short, usd, logoHtml, store, V, reduce, coins, statsOf, TIER } = X;
  const $ = (id) => document.getElementById(id);
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lang = () => (window.arcI18n && window.arcI18n.get && window.arcI18n.get()) || "en";
  // labels used here only
  const L2 = {
    ko: { "Limit": "지정가", "Stop": "스톱", "Buy": "매수", "Sell": "매도", "Price": "가격", "Amount": "수량", "Expires": "만료", "Tap the chart to set the price": "차트를 눌러 가격 설정", "Review in ARCIRCLE Orders": "ARCIRCLE Orders에서 확인", "now": "현재",
      "Limit or stop order": "지정가·스톱 주문", "Nothing is placed here — Orders opens with it filled in, you check it and sign.": "여기서는 아무것도 실행되지 않아요 — Orders가 채워진 채로 열리고, 확인 후 서명해요.",
      "fills right away — the price is already past it": "바로 체결돼요 — 이미 그 가격을 지났어요", "of your $": "보유한 $", "Buy when the price drops to": "가격이 다음까지 내리면 매수:", "Buy when the price climbs to": "가격이 다음까지 오르면 매수:", "Sell when the price climbs to": "가격이 다음까지 오르면 매도:", "Sell when the price drops to": "가격이 다음까지 내리면 매도:",
      "ARCIRCLE Predict": "ARCIRCLE Predict", "No Predict market on this coin yet.": "이 코인의 Predict 마켓은 아직 없어요.", "Open a market": "마켓 열기", "Round": "라운드", "locks in": "마감까지", "UP": "UP", "DOWN": "DOWN", "Bet on Predict": "Predict에서 베팅",
      "Due diligence by ARCIA": "ARCIA 실사 의뢰", "Embed": "임베드", "Embed this coin": "이 코인 임베드", "A live price card for your site — paste it where you want it.": "사이트용 실시간 가격 카드 — 원하는 곳에 붙여 넣으세요.", "Copy code": "코드 복사", "Copied": "복사됨", "Preview": "미리보기", "Light version": "라이트 버전",
      "Milestones": "마일스톤", "to go": "남음", "passed": "달성", "Market-cap milestones": "시가총액 마일스톤",
      "Chart": "차트", "Trade": "거래", "Safety": "안전", "Activity": "활동", "Orders": "주문",
      "First minute": "첫 1분", "wallet": "지갑", "wallets": "지갑", "bought": "매수", "of the supply": "공급량", "Bought in the first 60 seconds": "첫 60초 안에 매수", "they still hold": "아직 보유", "in the launch block": "런치 블록에서", "the creator among them": "크리에이터 포함", "No buys in the first minute.": "첫 1분 동안 매수 없음.",
      "Creator": "크리에이터", "Coins launched": "런치한 코인", "Best market cap": "최고 시가총액", "Volume 24h": "24시간 거래량", "Fees 24h (est.)": "24시간 수수료(추정)", "First launch": "첫 런치", "Follow": "팔로우", "Following": "팔로잉", "Share profile": "프로필 공유", "Coins": "코인",
      "No coins from this wallet on ArcPad yet.": "이 지갑이 ArcPad에서 런치한 코인이 아직 없어요.", "That isn't a wallet address.": "지갑 주소가 아니에요.", "Since launch": "런치 이후",
      "Pick two or three coins: the compare button on any card in Explore, or on a coin's page.": "두세 개의 코인을 고르세요: Explore 카드나 코인 페이지의 비교 버튼.", "Holders": "홀더", "Creator holds": "크리에이터 보유", "Top 10 hold": "상위 10 보유", "Launched": "런치", "Trade fee": "거래 수수료", "Paired with": "페어", "Trades 24h": "24시간 거래", "Market cap": "시가총액",
      "Creator earnings": "크리에이터 수익", "The coins you launched, on every platform — each platform pays out its own way.": "모든 플랫폼에서 런치한 코인 — 플랫폼마다 지급 방식이 달라요.", "Platform": "플랫폼", "Est. fees 24h": "24시간 추정 수수료", "How it pays": "지급 방식",
      "Paid to your wallet with every trade": "거래마다 지갑으로 지급", "Claim on Argus": "Argus에서 청구", "Claim: 70% you, 30% ARCIRCLE PAD": "청구: 70% 나, 30% ARCIRCLE PAD", "Pay out": "지급하기", "Open": "열기", "Connect a wallet to see the coins you launched.": "런치한 코인을 보려면 지갑을 연결하세요.", "You haven't launched a coin yet.": "아직 런치한 코인이 없어요.",
      "Wallets you follow": "팔로우한 지갑", "Their ArcPad trades in the last 12 hours.": "최근 12시간 ArcPad 거래.", "Follow a wallet": "지갑 팔로우", "Add": "추가", "Unfollow": "언팔로우", "Nothing from them in the last 12 hours.": "최근 12시간 동안 거래 없음.", "Follow a wallet to see its ArcPad trades here.": "지갑을 팔로우하면 ArcPad 거래가 여기 보여요.", "Reading their trades…": "거래를 읽는 중…", "bought": "매수", "sold": "매도", "received": "받음", "sent": "보냄", "creator fee": "크리에이터 수수료",
      "Watchlist on Telegram": "텔레그램 관심 목록", "ARCIA DMs you when a coin you watch moves 20% or passes a $20K / $100K market cap.": "관심 코인이 20% 움직이거나 시가총액 $20K / $100K를 넘으면 ARCIA가 DM을 보내요.", "DM me on Telegram": "텔레그램으로 알림 받기", "Star a coin first — your watchlist is empty.": "먼저 코인에 별표를 하세요 — 관심 목록이 비어 있어요.", "Opening Telegram…": "텔레그램을 여는 중…", "Couldn't make the link — try again.": "링크를 만들지 못했어요 — 다시 시도하세요.",
      "big sell": "큰 매도" },
    zh: { "Limit": "限价", "Stop": "止损", "Buy": "买入", "Sell": "卖出", "Price": "价格", "Amount": "数量", "Expires": "有效期", "Tap the chart to set the price": "点图表设置价格", "Review in ARCIRCLE Orders": "在 ARCIRCLE Orders 中确认", "now": "现价",
      "Limit or stop order": "限价·止损单", "Nothing is placed here — Orders opens with it filled in, you check it and sign.": "这里不会下单——Orders 会带着填好的内容打开,确认后签名。",
      "fills right away — the price is already past it": "会立即成交——价格已越过", "of your $": "你持有的 $", "Buy when the price drops to": "价格跌到以下时买入:", "Buy when the price climbs to": "价格涨到以下时买入:", "Sell when the price climbs to": "价格涨到以下时卖出:", "Sell when the price drops to": "价格跌到以下时卖出:",
      "ARCIRCLE Predict": "ARCIRCLE Predict", "No Predict market on this coin yet.": "这个币还没有 Predict 市场。", "Open a market": "开设市场", "Round": "回合", "locks in": "锁定倒计时", "UP": "涨", "DOWN": "跌", "Bet on Predict": "在 Predict 下注",
      "Due diligence by ARCIA": "委托 ARCIA 尽调", "Embed": "嵌入", "Embed this coin": "嵌入这个币", "A live price card for your site — paste it where you want it.": "给你网站的实时价格卡——粘贴到想放的位置。", "Copy code": "复制代码", "Copied": "已复制", "Preview": "预览", "Light version": "浅色版",
      "Milestones": "里程碑", "to go": "还差", "passed": "已达成", "Market-cap milestones": "市值里程碑",
      "Chart": "图表", "Trade": "交易", "Safety": "安全", "Activity": "动态", "Orders": "订单",
      "First minute": "首分钟", "wallet": "个钱包", "wallets": "个钱包", "bought": "买入", "of the supply": "的供应量", "Bought in the first 60 seconds": "在前 60 秒内买入", "they still hold": "仍持有", "in the launch block": "在发射区块中", "the creator among them": "其中包括创作者", "No buys in the first minute.": "首分钟没有买入。",
      "Creator": "创作者", "Coins launched": "发射的币", "Best market cap": "最高市值", "Volume 24h": "24 小时交易量", "Fees 24h (est.)": "24 小时手续费(估)", "First launch": "首次发射", "Follow": "关注", "Following": "已关注", "Share profile": "分享主页", "Coins": "币",
      "No coins from this wallet on ArcPad yet.": "这个钱包还没有在 ArcPad 发射过币。", "That isn't a wallet address.": "这不是钱包地址。", "Since launch": "自发射以来",
      "Pick two or three coins: the compare button on any card in Explore, or on a coin's page.": "选两到三个币:Explore 卡片或币页面上的对比按钮。", "Holders": "持有人", "Creator holds": "创作者持有", "Top 10 hold": "前 10 持有", "Launched": "发射", "Trade fee": "交易费", "Paired with": "配对", "Trades 24h": "24 小时交易", "Market cap": "市值",
      "Creator earnings": "创作者收益", "The coins you launched, on every platform — each platform pays out its own way.": "你在各平台发射的币——每个平台有自己的发放方式。", "Platform": "平台", "Est. fees 24h": "24 小时手续费(估)", "How it pays": "发放方式",
      "Paid to your wallet with every trade": "每笔交易直接到你的钱包", "Claim on Argus": "在 Argus 领取", "Claim: 70% you, 30% ARCIRCLE PAD": "领取:70% 给你,30% 给 ARCIRCLE PAD", "Pay out": "发放", "Open": "打开", "Connect a wallet to see the coins you launched.": "连接钱包查看你发射的币。", "You haven't launched a coin yet.": "你还没有发射过币。",
      "Wallets you follow": "关注的钱包", "Their ArcPad trades in the last 12 hours.": "他们近 12 小时的 ArcPad 交易。", "Follow a wallet": "关注钱包", "Add": "添加", "Unfollow": "取消关注", "Nothing from them in the last 12 hours.": "近 12 小时没有动态。", "Follow a wallet to see its ArcPad trades here.": "关注钱包后,这里会显示它的 ArcPad 交易。", "Reading their trades…": "正在读取交易…", "bought": "买入", "sold": "卖出", "received": "收到", "sent": "转出", "creator fee": "创作者费用",
      "Watchlist on Telegram": "Telegram 关注列表", "ARCIA DMs you when a coin you watch moves 20% or passes a $20K / $100K market cap.": "关注的币涨跌 20% 或市值突破 $20K / $100K 时,ARCIA 会私信你。", "DM me on Telegram": "Telegram 私信提醒", "Star a coin first — your watchlist is empty.": "先给币加星——关注列表是空的。", "Opening Telegram…": "正在打开 Telegram…", "Couldn't make the link — try again.": "无法生成链接——请重试。",
      "big sell": "大额卖出" },
  };
  const W = (s) => esc((L2[lang()] && L2[lang()][s]) || tr(s));
  const W0 = (s) => (L2[lang()] && L2[lang()][s]) || tr(s);
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const onCoin = () => { const p = $("bp-panel-coin"); return !!(p && p.classList.contains("active")) && typeof APC !== "undefined" && APC.token && APC.l; };
  const SUPPLY = 1e9, MS = [[2e4, "$20K"], [1e5, "$100K"]];
  const TREASURY = String((typeof CONFIG !== "undefined" && ((CONFIG.ARGUS && CONFIG.ARGUS.PLATFORM_WALLET) || (CONFIG.PONS && CONFIG.PONS.TREASURY))) || "0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8").toLowerCase();
  const fmtP = (v) => (v == null || !isFinite(v) ? "—" : typeof apcFmtPrice === "function" ? apcFmtPrice(v).replace("$", "") : String(v));
  const plainP = (v) => { if (!(v > 0)) return ""; const d = Math.max(2, 4 - Math.floor(Math.log10(v))); return Number(v.toFixed(Math.min(d, 18))).toString(); };
  const toast = (m, k) => (typeof window.arcToast === "function" ? window.arcToast(m, k) : null);
  const mcapNow = () => { const s = typeof apcSpot === "function" ? apcSpot() : null; return s != null && APC.q && APC.q.usd != null ? s * APC.q.usd * SUPPLY : APC.l && APC.l.marketCapUsd != null ? APC.l.marketCapUsd : null; };

  // =====================================================================
  // Coin page: layout (price → chart → safety → tabs), phone jump bar, chips
  // =====================================================================
  function coinFrame() {
    const panel = $("bp-panel-coin"); if (!panel || panel.__v7) return;
    panel.__v7 = true;
    // chips: due diligence, embed, compare
    const row = panel.querySelector(".ac2-ca-row");
    if (row) row.insertAdjacentHTML("beforeend", `<a class="ac2-chip-btn v7-dd" id="v7-dd" href="#works"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 3h3v13H5V7h3z"/><path d="m9 13 2 2 4-4"/></svg><span>${W("Due diligence by ARCIA")}</span></a>
      <button type="button" class="ac2-chip-btn v7-embed-b" id="v7-embed-b" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></svg><span>${W("Embed")}</span></button>
      <button type="button" class="ac2-chip-btn v7-cmp-b" id="v7-cmp-b" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16M3 8h8M13 16h8"/></svg><span>${T("Compare")}</span></button>`);
    // the safety check sits under the chart (arc-extras.js puts it there when it builds it; move one that exists)
    const sf = $("apc-safety-panel"), chart = panel.querySelector(".ac2-main .ac2-chart-card");
    if (sf && chart) chart.after(sf);
    // milestone bar under the "sold from the pool" bar; the ring around the logo
    const grad = panel.querySelector(".ac2-grad");
    if (grad && !$("v7-ms")) grad.insertAdjacentHTML("beforeend", `<div class="v7-ms" id="v7-ms"></div>`);
    const lw = panel.querySelector(".apc-logo-wrap");
    if (lw && !$("v7-ring")) lw.insertAdjacentHTML("beforeend", `<svg class="v7-ring" id="v7-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" class="bg"/><circle cx="50" cy="50" r="47" class="fg" pathLength="100"/></svg>`);
    // phones: a sticky bar that jumps to each part
    const head = panel.querySelector(".ac2-head");
    if (head && !$("v7-ctabs")) {
      head.insertAdjacentHTML("afterend", `<nav class="v7-ctabs" id="v7-ctabs" aria-label="Sections">${[["chart", "Chart"], ["trade", "Trade"], ["safety", "Safety"], ["acts", "Activity"], ["orders", "Orders"]].map(([k, l], i) => `<button type="button" data-v7go="${k}"${i ? "" : ' class="on"'}>${W(l)}</button>`).join("")}</nav>`);
    }
    panel.addEventListener("click", onCoinClick);
  }
  const SECT = { chart: () => document.querySelector("#bp-panel-coin .ac2-chart-card"), trade: () => { const a = $("apc-argus-trade"); return a && !a.hidden ? a : $("apc-swap"); }, safety: () => $("apc-safety-panel"), acts: () => document.querySelector("#bp-panel-coin .ac2-tabs"), orders: () => $("v7-ord") };
  function spy() {
    const nav = $("v7-ctabs"); if (!nav || !onCoin() || nav.offsetParent === null) return;
    let best = null;
    for (const k of Object.keys(SECT)) { const el = SECT[k](); if (!el) continue; const r = el.getBoundingClientRect(); if (r.top < innerHeight * 0.45) best = k; }
    nav.querySelectorAll("[data-v7go]").forEach((b) => b.classList.toggle("on", b.dataset.v7go === (best || "chart")));
  }
  function onCoinClick(e) {
    const go = e.target.closest("[data-v7go]");
    if (go) { const el = SECT[go.dataset.v7go] && SECT[go.dataset.v7go](); if (el) { const y = el.getBoundingClientRect().top + scrollY - 118; scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" }); } return; }
    if (e.target.closest("#v7-embed-b")) { embedBox(); return; }
    if (e.target.closest("#v7-cmp-b")) { if (window.arcCompareToggle) window.arcCompareToggle(APC.token); paintChips(); return; }
    const cp = e.target.closest("[data-v7copy]");
    if (cp) { const t = cp.dataset.v7copy; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { cp.textContent = W0("Copied"); setTimeout(() => { cp.textContent = W0("Copy code"); }, 1400); }, () => {}); }
  }
  function paintChips() {
    if (!onCoin()) return;
    const sym = APC.l.symbol || "";
    const dd = $("v7-dd"); if (dd) dd.href = `#works?hire=arcia&tag=token-brief&t=${lc(APC.token)}&title=${encodeURIComponent(`Due diligence on $${sym}`.slice(0, 80))}`;
    const cb = $("v7-cmp-b"); if (cb) { const on = window.arcCompare && window.arcCompare.list.includes(lc(APC.token)); cb.setAttribute("aria-pressed", on ? "true" : "false"); cb.classList.toggle("on", !!on); }
  }
  function embedBox() {
    const b = $("v7-embed-b"); let box = $("v7-embed");
    if (box) { box.remove(); b.setAttribute("aria-expanded", "false"); return; }
    const src = `${location.origin}/embed/coin/${lc(APC.token)}`;
    const code = `<iframe src="${src}" width="360" height="190" style="border:0;border-radius:16px;max-width:100%" loading="lazy" title="$${APC.l.symbol} on ArcPad"></iframe>`;
    box = document.createElement("div"); box.id = "v7-embed"; box.className = "v7-embed";
    box.innerHTML = `<b>${W("Embed this coin")}</b><p>${W("A live price card for your site — paste it where you want it.")}</p><textarea readonly rows="3" aria-label="${W("Embed")}" data-no-i18n>${esc(code)}</textarea>
      <div class="v7-embed-r"><button type="button" class="bp-btn-primary sm" data-v7copy="${esc(code)}">${W("Copy code")}</button><a class="bp-btn-ghost sm" href="${esc(src)}" target="_blank" rel="noopener">${W("Preview")}</a><a class="bp-btn-ghost sm" href="${esc(src)}?theme=light" target="_blank" rel="noopener">${W("Light version")}</a></div>`;
    b.closest(".ac2-ca-row").after(box); b.setAttribute("aria-expanded", "true");
    box.querySelector("textarea").select();
  }

  // ---- milestones: a bar with $20K / $100K, a ring around the logo to the next one ----
  const MSK = "arcpad.ms.v1";
  function paintMilestones() {
    if (!onCoin()) return;
    const m = mcapNow(), box = $("v7-ms"), ring = $("v7-ring");
    if (box) {
      const argus = APC.l.platform === "argus";
      box.hidden = argus; // Argus coins show their own support bar (arc-argus.js)
      if (!argus) {
        const max = 1.1e5, x = (v) => Math.max(0, Math.min(100, (v / max) * 100)), next = MS.find(([v]) => !(m >= v));
        const html = `<div class="v7-ms-h"><span>${W("Market-cap milestones")}</span><small data-no-i18n>${m == null ? "—" : next ? `${usd(next[0] - m)} ${W0("to go")} → ${next[1]}` : `${MS[MS.length - 1][1]} ${W0("passed")}`}</small></div>
          <div class="v7-ms-t" role="img" aria-label="${W("Market cap")} ${m == null ? "—" : usd(m)}"><i class="f" style="width:${x(m || 0).toFixed(1)}%"></i>${MS.map(([v, l]) => `<em class="${m >= v ? "on" : ""}" style="left:${x(v).toFixed(1)}%" data-no-i18n>${l}</em>`).join("")}</div>`;
        if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
      }
    }
    if (ring) {
      const next = MS.find(([v]) => !(m >= v)), prev = [...MS].reverse().find(([v]) => m >= v);
      const lo = prev ? prev[0] : 0, hi = next ? next[0] : MS[MS.length - 1][0];
      const p = m == null ? 0 : next ? Math.max(0.02, Math.min(1, (m - lo) / (hi - lo))) : 1;
      ring.style.setProperty("--p", (p * 100).toFixed(1));
      ring.classList.toggle("done", !next);
      // passing one: the ring pulses (once per coin and milestone, in this browser)
      const seen = store.get(MSK, {}), k = lc(APC.token), got = MS.filter(([v]) => m >= v).length;
      if (m != null && seen[k] != null && got > seen[k] && !reduce) { ring.classList.remove("v7-burst"); void ring.getBoundingClientRect(); ring.classList.add("v7-burst"); if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 70 }); }
      if (m != null && seen[k] !== got) { seen[k] = got; store.set(MSK, seen); }
    }
  }

  // ---- the first minute: who bought, how much of the supply, what they still hold ----
  function earlyBuyers() {
    if (typeof APC === "undefined" || !APC.l || !APC.trades || !APC.trades.length || typeof apcTsOf !== "function") return null;
    const t0 = APC.l.launchedAt; if (!t0) return null;
    const firstB = Math.min(...APC.trades.map((t) => t.b));
    const early = APC.trades.filter((t) => t.side === "buy" && t.trader && (apcTsOf(t.b) || Infinity) - t0 <= 60);
    if (!APC.logs || !(APC.logs.lo <= APC.logs.launchBlock)) return null; // the history isn't complete yet
    const wallets = new Set(early.map((t) => lc(t.trader)));
    const bought = early.reduce((s, t) => s + (t.tok || 0), 0);
    let hold = null;
    if (APC.holders) { hold = 0; for (const [a, raw] of APC.holders) if (wallets.has(lc(a))) hold += Number(ethers.formatUnits(raw, 18)); }
    const out = { n: wallets.size, pct: (bought / SUPPLY) * 100, hold: hold == null ? null : (hold / SUPPLY) * 100, first: early.filter((t) => t.b === firstB).length, creator: wallets.has(lc(APC.l.creator)) };
    // the Explore badge for this coin, until the server's own read says otherwise
    const k = lc(APC.token), cache = store.get("arcpad.early.v1", {});
    cache[k] = { n: out.n, pct: Math.round(out.pct * 100) / 100 }; const keys = Object.keys(cache); if (keys.length > 300) delete cache[keys[0]];
    store.set("arcpad.early.v1", cache);
    if (window.arcEarlyMap && !window.arcEarlyMap.has(k)) window.arcEarlyMap.set(k, cache[k]);
    return out;
  }
  window.arcEarlyBuyers = function () {
    const e = earlyBuyers(); if (!e) return null;
    const p = (v) => (v < 0.01 ? "<0.01" : v.toFixed(v < 10 ? 2 : 1));
    if (!e.n) return ["ok", W0("First minute"), W0("No buys in the first minute.")];
    const kind = e.pct <= 10 ? "ok" : e.pct <= 25 ? "warn" : "bad";
    const parts = [e.hold != null ? `${W0("they still hold")} ${p(e.hold)}%` : "", e.first > 1 ? `${e.first} ${W0("in the launch block")}` : "", e.creator ? W0("the creator among them") : ""].filter(Boolean);
    return [kind, `${W0("First minute")}: ${e.n} ${W0(e.n === 1 ? "wallet" : "wallets")} ${W0("bought")} ${p(e.pct)}%`, `${W0("Bought in the first 60 seconds")}${parts.length ? " · " + parts.join(" · ") : ""}`];
  };

  // =====================================================================
  // Limit / stop order → ARCIRCLE Orders, filled in
  // =====================================================================
  const OD = { type: "limit", side: "buy", price: "", amt: "50", pct: 50, exp: 7, token: null };
  function spotQ() { return typeof apcSpot === "function" ? apcSpot() : null; }
  function paintOrd() {
    const box = $("v7-ord"); if (!box || !onCoin()) return;
    if (OD.token !== lc(APC.token)) { OD.token = lc(APC.token); OD.price = ""; }
    const s = spotQ(), qs = (APC.q && APC.q.symbol) || "USDC", sym = APC.l.symbol || "";
    const p = Number(OD.price), dir = s && p ? p / s - 1 : null;
    const buy = OD.side === "buy";
    const want = OD.type === "limit" ? (buy ? -1 : 1) : (buy ? 1 : -1); // which side of the price the trigger should be
    const instant = dir != null && Math.sign(dir) !== want && Math.abs(dir) > 0.001;
    const amtS = buy ? `$${(Number(OD.amt) || 0).toLocaleString("en-US")}` : `${OD.pct}% ${W0("of your $")}${sym}`;
    const sentence = p ? `${W0(buy ? (want < 0 ? "Buy when the price drops to" : "Buy when the price climbs to") : (want > 0 ? "Sell when the price climbs to" : "Sell when the price drops to"))} ${fmtP(p)} ${qs}${dir != null ? ` (${dir >= 0 ? "+" : "−"}${Math.abs(dir * 100).toFixed(1)}%)` : ""}` : "";
    const line = p ? `${OD.side} ${buy ? `$${Number(OD.amt) || 0}` : `${OD.pct}%`} ${OD.type === "stop" ? "stop " : ""}at ${plainP(p)} for ${OD.exp}d` : "";
    const href = line ? `#orders?c=arc&t=${lc(APC.token)}&o=${encodeURIComponent(line)}` : "#orders";
    const html = `<h3>${W("Limit or stop order")}</h3>
      <div class="v7-ord-r"><div class="ac2-seg ac2-seg-sm" role="radiogroup" aria-label="${W("Limit or stop order")}">${["limit", "stop"].map((k) => `<button type="button" role="radio" aria-checked="${OD.type === k}" class="${OD.type === k ? "active" : ""}" data-od-type="${k}">${W(k === "limit" ? "Limit" : "Stop")}</button>`).join("")}</div>
        <div class="v7-ord-side" role="radiogroup">${["buy", "sell"].map((k) => `<button type="button" role="radio" aria-checked="${OD.side === k}" class="${k}${OD.side === k ? " on" : ""}" data-od-side="${k}">${W(k === "buy" ? "Buy" : "Sell")}</button>`).join("")}</div></div>
      <label class="v7-ord-f"><span>${W("Price")} <small data-no-i18n>${esc(qs)}</small></span><input id="v7-od-price" inputmode="decimal" autocomplete="off" placeholder="${s ? esc(plainP(s)) : "0.0"}" value="${esc(OD.price)}"></label>
      <div class="v7-ord-chips">${[-20, -10, -5, 5, 10, 20].map((k) => `<button type="button" data-od-pct="${k}" data-no-i18n>${k > 0 ? "+" : "−"}${Math.abs(k)}%</button>`).join("")}</div>
      <p class="v7-ord-hint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 9 11l4 4 7-9"/></svg>${W("Tap the chart to set the price")} · ${W("now")} <b data-no-i18n>${fmtP(s)}</b></p>
      ${buy ? `<label class="v7-ord-f"><span>${W("Amount")} <small data-no-i18n>USD</small></span><input id="v7-od-amt" inputmode="decimal" autocomplete="off" value="${esc(OD.amt)}"></label><div class="v7-ord-chips">${[10, 50, 100, 500].map((v) => `<button type="button" data-od-amt="${v}" data-no-i18n>$${v}</button>`).join("")}</div>`
        : `<div class="v7-ord-f"><span>${W("Amount")}</span><div class="v7-ord-chips wide">${[25, 50, 100].map((v) => `<button type="button" class="${OD.pct === v ? "on" : ""}" data-od-sellpct="${v}" data-no-i18n>${v}%</button>`).join("")}</div></div>`}
      <div class="v7-ord-f"><span>${W("Expires")}</span><div class="v7-ord-chips wide">${[1, 7, 30].map((d) => `<button type="button" class="${OD.exp === d ? "on" : ""}" data-od-exp="${d}" data-no-i18n>${d}d</button>`).join("")}</div></div>
      ${sentence ? `<p class="v7-ord-say${instant ? " warn" : ""}">${esc(sentence)} — <b data-no-i18n>${esc(amtS)}</b>${instant ? `<br><small>${W("fills right away — the price is already past it")}</small>` : ""}</p>` : ""}
      <a class="ac2-submit v7-ord-go${line ? "" : " off"}" href="${esc(href)}"${line ? "" : ' aria-disabled="true"'}>${W("Review in ARCIRCLE Orders")} →</a>
      <p class="ac2-fine">${W("Nothing is placed here — Orders opens with it filled in, you check it and sign.")}</p>`;
    const focus = document.activeElement && document.activeElement.id;
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; if (focus === "v7-od-price" || focus === "v7-od-amt") { const f = $(focus); f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest ? e.target : null; if (!t || !t.closest("#v7-ord")) return;
    const s = spotQ();
    let b;
    if ((b = t.closest("[data-od-type]"))) OD.type = b.dataset.odType;
    else if ((b = t.closest("[data-od-side]"))) OD.side = b.dataset.odSide;
    else if ((b = t.closest("[data-od-pct]"))) { if (s) OD.price = plainP(s * (1 + Number(b.dataset.odPct) / 100)); }
    else if ((b = t.closest("[data-od-amt]"))) OD.amt = b.dataset.odAmt;
    else if ((b = t.closest("[data-od-sellpct]"))) OD.pct = Number(b.dataset.odSellpct);
    else if ((b = t.closest("[data-od-exp]"))) OD.exp = Number(b.dataset.odExp);
    else if ((b = t.closest(".v7-ord-go.off"))) { e.preventDefault(); const f = $("v7-od-price"); if (f) f.focus(); return; }
    else return;
    paintOrd();
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "v7-od-price") { OD.price = e.target.value.replace(/[^0-9.]/g, ""); paintOrd(); }
    if (e.target.id === "v7-od-amt") { OD.amt = e.target.value.replace(/[^0-9.]/g, ""); paintOrd(); }
  });
  // tap the chart: that price goes into the order (read off the chart's own axis labels)
  const SUBD = { "₀": 0, "₁": 1, "₂": 2, "₃": 3, "₄": 4, "₅": 5, "₆": 6, "₇": 7, "₈": 8, "₉": 9 };
  const numOf = (s) => { s = String(s || "").replace(/[$,\s]/g, ""); const m = /^0\.0([₀-₉]+)(\d+)$/.exec(s); if (m) s = "0.0" + "0".repeat(Number([...m[1]].map((c) => SUBD[c]).join(""))) + m[2]; const v = Number(s); return isFinite(v) ? v : null; };
  function chartPick(ev) {
    const svg = ev.target.closest && ev.target.closest("#apc-chart svg"); if (!svg || !onCoin()) return;
    const W0v = svg.viewBox.baseVal.width;
    const pts = [...svg.querySelectorAll("text.ac2-axis:not(.ac2-axis-last)")].filter((t) => Number(t.getAttribute("x")) > W0v - 90 && t.getAttribute("text-anchor") !== "middle")
      .map((t) => ({ y: Number(t.getAttribute("y")) - 4, v: numOf(t.textContent) })).filter((p) => p.v != null);
    if (pts.length < 2) return;
    pts.sort((a, b) => a.y - b.y);
    const a = pts[0], b = pts[pts.length - 1];
    const rc = svg.getBoundingClientRect(), y = (ev.clientY - rc.top) * (svg.viewBox.baseVal.height / rc.height);
    const v = a.v + ((y - a.y) / (b.y - a.y)) * (b.v - a.v);
    if (!(v > 0)) return;
    OD.price = plainP(v);
    const s = spotQ(); if (s && OD.type === "limit") OD.side = v < s ? "buy" : "sell";
    paintOrd();
    let mk = svg.querySelector(".v7-pick");
    if (!mk) { mk = document.createElementNS("http://www.w3.org/2000/svg", "g"); mk.setAttribute("class", "v7-pick"); svg.appendChild(mk); }
    mk.innerHTML = `<line x1="0" x2="${W0v}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><circle cx="${((ev.clientX - rc.left) * (W0v / rc.width)).toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`;
    const card = $("v7-ord"); if (card && !reduce) { card.classList.remove("v7-glow"); void card.offsetWidth; card.classList.add("v7-glow"); }
    if (innerWidth <= 720 && card) card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }
  document.addEventListener("click", chartPick);

  // =====================================================================
  // ARCIRCLE Predict: this coin's round
  // =====================================================================
  const PR = { at: 0, j: null, p: null };
  async function predState() {
    if (PR.j && Date.now() - PR.at < 30e3) return PR.j;
    if (!PR.p) PR.p = fetch("/api/desk?predict=state", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => { PR.p = null; if (j && Array.isArray(j.markets)) { PR.j = j; PR.at = Date.now(); } return PR.j; });
    return PR.p;
  }
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  async function paintPredict() {
    const box = $("v7-pred"); if (!box || !onCoin()) return;
    const tok = lc(APC.token), j = await predState();
    if (!onCoin() || lc(APC.token) !== tok) return;
    const ms = j ? j.markets.filter((m) => lc(m.token) === tok && !m.stopped) : [];
    box.hidden = false;
    const unit = (j && j.unit) || "USDC";
    let html;
    if (!ms.length) html = `<h3>${W("ARCIRCLE Predict")}</h3><p class="v7-pred-none">${W("No Predict market on this coin yet.")}</p><a class="bp-card-link" href="#predict">${W("Open a market")} →</a>`;
    else {
      const m = ms.sort((a, b) => a.duration - b.duration)[0], r = m.next || m.live, tot = (r.up || 0) + (r.down || 0), up = tot ? (r.up / tot) * 100 : 50;
      const dur = m.duration % 3600 === 0 ? m.duration / 3600 + "h" : m.duration / 60 + "m";
      html = `<h3>${W("ARCIRCLE Predict")} <small data-no-i18n>$${esc(m.sym)} · ${dur}</small></h3>
        <div class="v7-pred-r"><span>${W("Round")} <b data-no-i18n>#${r.epoch + 1}</b></span><span>${W("locks in")} <b data-no-i18n data-v7lock="${r.lockAt}">${mmss(r.lockAt - Date.now() / 1000)}</b></span></div>
        <div class="v7-pred-bar" role="img" aria-label="UP ${up.toFixed(0)}% · DOWN ${(100 - up).toFixed(0)}%"><i class="up" style="width:${up.toFixed(1)}%"></i><i class="dn"></i></div>
        <div class="v7-pred-r small" data-no-i18n><span class="up">▲ ${(r.up || 0).toFixed(2)} ${esc(unit)}</span><span class="dn">${(r.down || 0).toFixed(2)} ${esc(unit)} ▼</span></div>
        <div class="v7-pred-b"><a class="v7-pred-up" href="#predict?m=${m.id}&side=up">${W("UP")}</a><a class="v7-pred-dn" href="#predict?m=${m.id}&side=down">${W("DOWN")}</a></div>
        <a class="bp-card-link" href="#predict?m=${m.id}">${W("Bet on Predict")} →</a>`;
    }
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }
  setInterval(() => { document.querySelectorAll("[data-v7lock]").forEach((el) => { el.textContent = mmss(Number(el.dataset.v7lock) - Date.now() / 1000); }); }, 1000);

  // =====================================================================
  // Motion on the coin page: odometer price, holders +1, new candle, big sell
  // =====================================================================
  const MO = { price: "", holders: null, trade: null, token: null, sells: new Set() };
  function odometer() {
    const el = $("apc-price"); if (!el) return;
    const txt = el.textContent;
    if (MO.token !== lc(APC.token)) { MO.token = lc(APC.token); MO.price = txt; MO.holders = null; MO.trade = null; MO.sells = new Set(); return; }
    if (!MO.price || txt === MO.price || txt === "—" || reduce) { MO.price = txt; return; }
    const a = numOf(MO.price.replace(/[^0-9.₀-₉]/g, "")), b = numOf(txt.replace(/[^0-9.₀-₉]/g, "")), up = a != null && b != null ? b >= a : true;
    const old = MO.price; MO.price = txt;
    const pad = old.padStart(txt.length, " ");
    el.innerHTML = [...txt].map((c, i) => (c !== pad[i] && /[0-9₀-₉]/.test(c) ? `<span class="v7-od ${up ? "up" : "dn"}" style="--d:${Math.min(i, 8) * 28}ms">${esc(c)}</span>` : esc(c))).join("");
    el.classList.remove("v7-flash-up", "v7-flash-dn"); void el.offsetWidth; el.classList.add(up ? "v7-flash-up" : "v7-flash-dn");
  }
  function holdersTick() {
    const el = $("apc-holders-count"); if (!el) return;
    const n = Number(String(el.textContent).replace(/[^0-9]/g, ""));
    if (!/\d/.test(el.textContent)) return;
    if (MO.holders != null && n > MO.holders && !reduce) {
      const f = document.createElement("span"); f.className = "v7-plus"; f.textContent = `+${n - MO.holders}`; f.setAttribute("aria-hidden", "true");
      el.parentNode.style.position = "relative"; el.parentNode.appendChild(f); setTimeout(() => f.remove(), 1300);
    }
    MO.holders = n;
  }
  function newTrade() {
    const t0 = APC.trades && APC.trades[0]; if (!t0) return;
    const id = t0.h + ":" + t0.i, fresh = MO.trade && MO.trade !== id;
    MO.trade = id;
    if (!fresh || reduce) return;
    const svg = document.querySelector("#apc-chart svg");
    if (svg) {
      const gs = svg.querySelectorAll(".v6-candles > g");
      if (gs.length) gs[gs.length - 1].classList.add("v7-newc");
      else svg.classList.add("v7-tick");
    }
    // a big sell gets its pop too (v6 shows big buys)
    const k = APC.q && APC.q.usd != null ? APC.q.usd : 1;
    for (const t of APC.trades.slice(0, 5)) {
      const tid = t.h + ":" + t.i; if (MO.sells.has(tid)) continue; MO.sells.add(tid);
      const v = (t.usdc || 0) * k, m = mcapNow();
      if (t.side !== "sell" || !(v >= Math.max(100, m ? m * 0.01 : 100))) continue;
      const card = document.querySelector("#bp-panel-coin .ac2-chart-card"); if (!card) continue;
      const el = document.createElement("div"); el.className = "v6-whale v7-whale-sell";
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14M6 12l6 6 6-6"/></svg><b data-no-i18n>−${usd(v)}</b><span>${W("big sell")}</span>`;
      card.appendChild(el); setTimeout(() => el.remove(), 3200);
    }
  }
  function onCoinData() {
    if (!onCoin()) return;
    coinFrame(); paintChips(); paintMilestones(); paintOrd(); holdersTick(); newTrade();
    const sf = $("apc-safety-panel"), chart = document.querySelector("#bp-panel-coin .ac2-main .ac2-chart-card");
    if (sf && chart && chart.nextElementSibling !== sf) chart.after(sf);
    if (!onCoinData.pred || onCoinData.pred !== lc(APC.token)) { onCoinData.pred = lc(APC.token); paintPredict(); }
  }
  if (typeof apcRenderData === "function") {
    const orig = apcRenderData;
    // eslint-disable-next-line no-global-assign
    apcRenderData = function () { orig.apply(this, arguments); try { onCoinData(); } catch (e) { console.warn(e); } };
  }
  if (typeof apcRenderState === "function") {
    const orig = apcRenderState;
    // eslint-disable-next-line no-global-assign
    apcRenderState = function () { orig.apply(this, arguments); try { if (onCoin()) { odometer(); paintMilestones(); paintOrd(); } } catch (e) { console.warn(e); } };
  }
  if (typeof apcRenderChart === "function") {
    const orig = apcRenderChart;
    // eslint-disable-next-line no-global-assign
    apcRenderChart = function () { orig.apply(this, arguments); try { const svg = document.querySelector("#apc-chart svg"); if (svg) svg.classList.add("v7-pickable"); } catch (e) { /* fine */ } };
  }

  // =====================================================================
  // Creator profile — #creator?a=0x…
  // =====================================================================
  const FKEY = "arcpad.follow.v1";
  const follows = () => store.get(FKEY, []).filter(isAddr);
  function toggleFollow(a) { a = lc(a); const f = follows(); const i = f.indexOf(a); if (i >= 0) f.splice(i, 1); else f.unshift(a); store.set(FKEY, f.slice(0, 10)); FW.at = 0; }
  const PLATN = { arcpad: "ArcPad", argus: "Argus", pons: "Pons", pump: "Pump.fun" };
  const feeRate = (l) => (l.platform === "argus" || l.platform === "pons" || l.platform === "pump" ? null : 0.007 + (Number(l.extraFeeBps) || 0) / 10000);
  async function paintCreator() {
    const box = $("v7-creator"); if (!box) return;
    const m = /^#creator\?(?:.*&)?a=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (!m) { box.innerHTML = `<div class="empty-state">${W("That isn't a wallet address.")}</div>`; return; }
    const a = lc(m[1]);
    const list = coins().filter((l) => lc(l.creator) === a).sort((x, y) => (y.marketCapUsd || 0) - (x.marketCapUsd || 0));
    if (X.loadTiers) await X.loadTiers([a]);
    const tier = (X.tiers && X.tiers[a]) || 0;
    let vol = 0, fees = 0, best = 0, first = Infinity;
    for (const l of list) { const s = statsOf(l) || {}; vol += s.vol || 0; const r = feeRate(l); if (r) fees += (s.vol || 0) * r; best = Math.max(best, l.marketCapUsd || 0); if (l.launchedAt) first = Math.min(first, l.launchedAt); }
    const fol = follows().includes(a);
    const html = `<div class="v7-cr-head"><span class="v7-cr-av" style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(a) : ""}"></span>
        <div class="v7-cr-id"><small>${W("Creator")}</small><h1 data-no-i18n>${short(a)}</h1><div class="v7-cr-tags">${tier ? `<em class="v6-badge va t${tier}" data-no-i18n>veARCIA ${TIER[tier]}</em>` : ""}${a === me() ? '<span class="ac2-you">you</span>' : ""}<code data-no-i18n>${a}</code></div></div>
        <div class="v7-cr-act"><button type="button" class="${fol ? "bp-btn-ghost" : "bp-btn-primary"} sm" data-v7follow="${a}" aria-pressed="${fol}">${W(fol ? "Following" : "Follow")}</button>
          <button type="button" class="bp-btn-ghost sm" data-v7copy="${esc(location.origin + "/creator/" + a)}">${W("Share profile")}</button>
          <a class="bp-btn-ghost sm" href="${esc((CONFIG.BLOCK_EXPLORER || "") + "/address/" + a)}" target="_blank" rel="noopener">ArcScan ↗</a></div></div>
      <div class="ac2-stats v7-cr-stats"><div class="ac2-stat"><small>${W("Coins launched")}</small><strong data-no-i18n>${list.length}</strong></div><div class="ac2-stat"><small>${W("Best market cap")}</small><strong data-no-i18n>${usd(best || null)}</strong></div>
        <div class="ac2-stat"><small>${W("Volume 24h")}</small><strong data-no-i18n>${usd(vol)}</strong></div><div class="ac2-stat"><small>${W("Fees 24h (est.)")}</small><strong data-no-i18n>${usd(fees)}</strong></div>
        <div class="ac2-stat"><small>${W("First launch")}</small><strong data-no-i18n>${isFinite(first) ? new Date(first * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</strong></div></div>
      <h3 class="v7-cr-h">${W("Coins")}</h3>
      ${list.length ? `<div class="v7-cr-list">${list.map((l) => { const s = statsOf(l) || {}, ch = typeof arcChangeSinceLaunch === "function" && !l.platform ? arcChangeSinceLaunch(l) : null; return `<a class="v7-cr-c" href="${l.platform === "pons" || l.platform === "pump" ? `#explore?plat=${l.platform}&coin=${esc(l.token)}` : `#coin/${esc(l.token)}`}" data-v6-open="${esc(l.token)}">${logoHtml(l, "v7-cr-logo")}
          <span class="v7-cr-t"><b data-no-i18n>$${esc(l.symbol)}</b><small data-no-i18n>${esc(l.name || "")}</small></span><em class="v6-plat ${l.platform || "arcpad"}" data-no-i18n>${PLATN[l.platform || "arcpad"]}</em>
          <span class="v7-cr-n"><b data-no-i18n>${usd(l.marketCapUsd)}</b><small data-no-i18n>${T("Vol 24h")} ${usd(s.vol || 0)}</small></span>
          <span class="v7-cr-ch ${ch == null ? "" : ch >= 0 ? "up" : "dn"}" title="${W("Since launch")}" data-no-i18n>${ch == null ? "" : `${ch >= 0 ? "+" : "−"}${Math.abs(ch * 100).toFixed(0)}%`}</span></a>`; }).join("")}</div>`
        : `<div class="empty-state">${W("No coins from this wallet on ArcPad yet.")}</div>`}`;
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
    document.title = `${short(a)} — ArcPad creator`;
  }
  document.addEventListener("click", (e) => {
    const f = e.target.closest && e.target.closest("[data-v7follow]");
    if (f) { toggleFollow(f.dataset.v7follow); if ($("bp-panel-creator").classList.contains("active")) paintCreator(); paintFollow(); return; }
    const cp = e.target.closest && e.target.closest("#bp-panel-creator [data-v7copy], #v7-pf [data-v7copy]");
    if (cp) { (navigator.clipboard ? navigator.clipboard.writeText(cp.dataset.v7copy) : Promise.reject()).then(() => toast(W0("Copied"), "ok"), () => {}); }
  });

  // =====================================================================
  // Compare — #compare?t=a,b,c
  // =====================================================================
  const HC = new Map(); // token → { holders, top10, creator, early } from /api/holders
  async function holderFacts(l) {
    const k = lc(l.token); if (HC.has(k)) return HC.get(k);
    let out = null;
    try {
      const r = await fetch(`/api/holders?token=${k}`); const d = r.ok ? await r.json() : null;
      if (d && Array.isArray(d.recs)) {
        const bal = new Map();
        for (const x of d.recs) if (x.k === "T") { const v = BigInt(x.v), fr = lc(x.fr), to = lc(x.to); if (!/^0x0{40}$/.test(fr)) bal.set(fr, (bal.get(fr) || 0n) - v); if (!/^0x0{40}$/.test(to)) bal.set(to, (bal.get(to) || 0n) + v); }
        const skip = new Set([CONFIG.POOL_MANAGER_ADDRESS, CONFIG.ARCPAD_HOOK_ADDRESS, CONFIG.ARCPAD_FACTORY_ADDRESS, TREASURY].map(lc)); // as the safety check: no pool, hook, factory or 8% allocation
        const hs = [...bal.entries()].filter(([a, v]) => v > 0n && !skip.has(a)).sort((a, b) => (b[1] > a[1] ? 1 : -1));
        const pctOf = (v) => (Number(v / 10n ** 12n) / 1e6 / SUPPLY) * 100;
        out = { holders: hs.length, top10: hs.slice(0, 10).reduce((s, [, v]) => s + pctOf(v), 0), creator: pctOf(bal.get(lc(l.creator)) || 0n) };
      }
    } catch { out = null; }
    HC.set(k, out);
    return out;
  }
  async function paintCompare() {
    const box = $("v7-compare"); if (!box) return;
    const m = /^#compare\?(?:.*&)?t=([0-9a-fA-Fx,]+)/.exec(location.hash);
    const toks = m ? [...new Set(m[1].split(",").map(lc).filter(isAddr))].slice(0, 3) : (window.arcCompare ? window.arcCompare.list : []);
    const all = coins(), ls = toks.map((t) => all.find((l) => lc(l.token) === t)).filter(Boolean);
    if (ls.length < 2) { box.innerHTML = `<div class="empty-state">${W("Pick two or three coins: the compare button on any card in Explore, or on a coin's page.")} <button type="button" class="bp-card-link" data-tab-link="explore" onclick="arcpadShowTab('explore')">${T("Explore")} →</button></div>`; return; }
    const facts = await Promise.all(ls.map(holderFacts));
    const early = window.arcEarlyMap || new Map();
    const rows = [
      [W("Market cap"), (l) => usd(l.marketCapUsd), (l) => l.marketCapUsd || 0],
      [T("Price"), (l) => usd(l.priceUsdc), null],
      [W("Since launch"), (l) => { const c = typeof arcChangeSinceLaunch === "function" ? arcChangeSinceLaunch(l) : null; return c == null ? "—" : `<span class="${c >= 0 ? "up" : "dn"}">${c >= 0 ? "+" : "−"}${Math.abs(c * 100).toFixed(0)}%</span>`; }, (l) => (typeof arcChangeSinceLaunch === "function" ? arcChangeSinceLaunch(l) : 0) || 0],
      [W("Volume 24h"), (l) => usd((statsOf(l) || {}).vol || 0), (l) => (statsOf(l) || {}).vol || 0],
      [W("Trades 24h"), (l) => String((statsOf(l) || {}).trades || 0), (l) => (statsOf(l) || {}).trades || 0],
      [W("Holders"), (l, i) => (facts[i] ? String(facts[i].holders) : "—"), (l, i) => (facts[i] ? facts[i].holders : 0)],
      [W("Creator holds"), (l, i) => (facts[i] ? facts[i].creator.toFixed(2) + "%" : "—"), (l, i) => (facts[i] ? -facts[i].creator : 0)],
      [W("Top 10 hold"), (l, i) => (facts[i] ? facts[i].top10.toFixed(1) + "%" : "—"), (l, i) => (facts[i] ? -facts[i].top10 : 0)],
      [W("First minute"), (l) => { const e = early.get(lc(l.token)); return e ? `${e.pct.toFixed(1)}%` : "—"; }, (l) => { const e = early.get(lc(l.token)); return e ? -e.pct : 0; }],
      [W("Trade fee"), (l) => (l.platform === "argus" ? "Argus" : `${(1 + (Number(l.extraFeeBps) || 0) / 100).toFixed(1)}%`), null],
      [W("Paired with"), (l) => esc(l.quoteSymbol || "USDC"), null],
      [W("Launched"), (l) => (l.launchedAt ? new Date(l.launchedAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"), null],
      [W("Creator"), (l) => (isAddr(l.creator) ? `<a href="#creator?a=${lc(l.creator)}" data-no-i18n>${short(l.creator)}</a>` : "—"), null],
    ];
    const html = `<div class="v7-cmp-w"><table class="v7-cmp" style="--n:${ls.length}"><thead><tr><th></th>${ls.map((l) => `<th><a href="#coin/${esc(l.token)}" class="v7-cmp-h">${logoHtml(l, "v7-cmp-logo")}<b data-no-i18n>$${esc(l.symbol)}</b><small data-no-i18n>${esc(l.name || "")}</small></a><button type="button" class="v7-cmp-x" data-v7cmp="${lc(l.token)}" aria-label="${T("Remove from compare")}">×</button></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([lab, f, score]) => { const vals = ls.map((l, i) => (score ? score(l, i) : null)); const top = score ? Math.max(...vals) : null; return `<tr><th scope="row">${lab}</th>${ls.map((l, i) => `<td class="${score && vals[i] === top && ls.length > 1 && vals.some((v) => v !== top) ? "best" : ""}" data-no-i18n>${f(l, i)}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>`;
    box.innerHTML = html;
  }

  // =====================================================================
  // Portfolio: creator earnings, wallets you follow, the watchlist on Telegram
  // =====================================================================
  function pfFrame() {
    const panel = $("bp-panel-portfolio"); if (!panel || $("v7-pf")) return;
    const at = $("pf-locks") || $("pf-body"); if (!at) return;
    at.insertAdjacentHTML("afterend", `<div class="v7-pf" id="v7-pf"><section class="v7-pf-s" id="v7-earn"></section><section class="v7-pf-s" id="v7-follow"></section><section class="v7-pf-s" id="v7-tgw"></section></div>`);
  }
  function paintEarn() {
    const box = $("v7-earn"); if (!box) return;
    const w = me();
    const list = w ? coins().filter((l) => lc(l.creator) === w) : [];
    const pay = (l) => {
      if (l.platform === "argus") return `<a href="https://argus.world/token/${esc(l.token)}" target="_blank" rel="noopener">${W("Claim on Argus")} ↗</a>`;
      if (l.platform === "pons") return `<button type="button" class="bp-btn-ghost sm" data-v7sheet="pons" data-t="${esc(l.token)}">${W("Claim: 70% you, 30% ARCIRCLE PAD")}</button>`;
      if (l.platform === "pump") return `<button type="button" class="bp-btn-ghost sm" data-v7sheet="pump" data-t="${esc(l.token)}">${W("Pay out")}</button>`;
      return `<span class="v7-pay">${W("Paid to your wallet with every trade")}</span>`;
    };
    let tot = 0;
    const rows = list.map((l) => { const s = statsOf(l) || {}, r = feeRate(l), f = r ? (s.vol || 0) * r : null; if (f) tot += f; return `<tr><td><a href="#coin/${esc(l.token)}" data-v6-open="${esc(l.token)}" class="v7-pf-coin">${logoHtml(l, "v7-pf-logo")}<b data-no-i18n>$${esc(l.symbol)}</b></a></td><td><em class="v6-plat ${l.platform || "arcpad"}" data-no-i18n>${PLATN[l.platform || "arcpad"]}</em></td><td class="r" data-no-i18n>${usd(s.vol || 0)}</td><td class="r" data-no-i18n>${f == null ? "—" : usd(f)}</td><td>${pay(l)}</td></tr>`; }).join("");
    const html = `<div class="v6-sec-h"><h3>${W("Creator earnings")}</h3><small>${W("The coins you launched, on every platform — each platform pays out its own way.")}</small></div>
      ${!w ? `<div class="empty-state">${W("Connect a wallet to see the coins you launched.")}</div>` : !list.length ? `<div class="empty-state">${W("You haven't launched a coin yet.")} <button type="button" class="bp-card-link" onclick="arcpadShowTab('launch')">${T("Launch a coin")} →</button></div>`
        : `<div class="v7-pf-tw"><table class="v7-pf-t"><thead><tr><th>${T("Coin")}</th><th>${W("Platform")}</th><th class="r">${W("Volume 24h")}</th><th class="r">${W("Est. fees 24h")}</th><th>${W("How it pays")}</th></tr></thead><tbody>${rows}</tbody>
          <tfoot><tr><th colspan="3">${W("Total")}</th><th class="r" data-no-i18n>${usd(tot)}</th><th></th></tr></tfoot></table></div>`}`;
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-v7sheet]"); if (!b) return;
    const m = b.dataset.v7sheet === "pons" ? window.arcPons : window.arcPump;
    if (m && typeof m.openSheet === "function") m.openSheet(b.dataset.t);
  });
  // wallets you follow: their ArcPad trades, from the coins' Transfer logs (last 12 hours)
  const FW = { at: 0, items: null, busy: false, key: "" };
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const pad = (a) => "0x" + "0".repeat(24) + lc(a).slice(2);
  async function loadFollow() {
    const ws = follows(); const key = ws.join(",");
    if (!ws.length) { FW.items = []; FW.key = key; return; }
    if (FW.busy || (FW.key === key && Date.now() - FW.at < 60e3)) return;
    FW.busy = true; FW.key = key;
    try {
      const prov = readProvider(), latest = await prov.getBlockNumber();
      const spb = typeof ACT !== "undefined" && ACT.spb ? ACT.spb : 0.5;
      const from = Math.max(0, latest - Math.ceil((12 * 3600) / spb)), CH = 9000;
      const toks = new Map((ARC.launches || []).map((l) => [lc(l.token), l]));
      const pm = lc(CONFIG.POOL_MANAGER_ADDRESS), router = lc(CONFIG.ARCPAD_ROUTER_ADDRESS), hook = lc(CONFIG.ARCPAD_HOOK_ADDRESS);
      const ranges = []; for (let a = from; a <= latest; a += CH) ranges.push([a, Math.min(latest, a + CH - 1)]);
      const get = (p) => (typeof actGetLogs === "function" ? actGetLogs(p) : prov.send("eth_getLogs", [p]));
      const logs = [];
      for (let i = 0; i < ranges.length; i += 3) {
        const part = await Promise.all(ranges.slice(i, i + 3).flatMap(([a, b]) => [
          get({ fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16), topics: [TRANSFER, ws.map(pad)] }).catch(() => []),
          get({ fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16), topics: [TRANSFER, null, ws.map(pad)] }).catch(() => []),
        ]));
        logs.push(...part.flat());
      }
      const seen = new Set(), items = [];
      for (const g of logs) {
        const t = lc(g.address), l = toks.get(t); if (!l) continue;
        const id = g.transactionHash + ":" + g.logIndex; if (seen.has(id)) continue; seen.add(id);
        const fr = "0x" + g.topics[1].slice(26), to = "0x" + g.topics[2].slice(26), v = Number(BigInt(g.data) / 10n ** 12n) / 1e6, b = parseInt(g.blockNumber, 16);
        const who = ws.includes(lc(to)) ? lc(to) : lc(fr);
        const kind = fr === hook && who === lc(to) ? "creator fee" : fr === pm && who === lc(to) ? "bought" : who === lc(fr) && (lc(to) === router || lc(to) === pm) ? "sold" : who === lc(to) ? "received" : "sent";
        items.push({ who, kind, l, v, usd: l.priceUsdc ? v * l.priceUsdc : null, b, ts: typeof actTs === "function" ? actTs(b) : null, h: g.transactionHash });
      }
      items.sort((a, b) => b.b - a.b);
      FW.items = items.slice(0, 40); FW.at = Date.now();
    } catch (e) { console.warn("follow feed", e); FW.items = FW.items || []; }
    FW.busy = false;
  }
  async function paintFollow() {
    const box = $("v7-follow"); if (!box) return;
    const ws = follows();
    const head = `<div class="v6-sec-h"><h3>${W("Wallets you follow")}</h3><small>${W("Their ArcPad trades in the last 12 hours.")}</small></div>
      <form class="v7-fw-add" id="v7-fw-add"><input id="v7-fw-in" placeholder="0x…" maxlength="42" spellcheck="false" autocomplete="off" aria-label="${W("Follow a wallet")}"><button type="submit" class="bp-btn-ghost sm">${W("Add")}</button></form>
      ${ws.length ? `<div class="v7-fw-ws">${ws.map((a) => `<span class="v7-fw-w"><a href="#creator?a=${a}" data-no-i18n>${short(a)}</a><button type="button" data-v7follow="${a}" aria-label="${W("Unfollow")} ${short(a)}">×</button></span>`).join("")}</div>` : ""}`;
    const body = !ws.length ? `<div class="empty-state">${W("Follow a wallet to see its ArcPad trades here.")}</div>`
      : FW.items == null || FW.busy ? `<div class="v7-fw-wait">${W("Reading their trades…")}</div>`
      : !FW.items.length ? `<div class="empty-state">${W("Nothing from them in the last 12 hours.")}</div>`
      : `<ul class="v7-fw-feed">${FW.items.map((x) => `<li class="${x.kind.replace(" ", "-")}"><span class="v7-fw-who" data-no-i18n>${short(x.who)}</span><span class="v7-fw-k">${W(x.kind)}</span>
          <a href="#coin/${esc(x.l.token)}" data-v6-open="${esc(x.l.token)}" class="v7-fw-c">${logoHtml(x.l, "v7-fw-logo")}<b data-no-i18n>$${esc(x.l.symbol)}</b></a>
          <span class="v7-fw-v" data-no-i18n>${x.usd != null ? usd(x.usd) : Number(x.v).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span><time data-no-i18n>${x.ts && typeof window.actAgo === "function" ? window.actAgo(x.ts) : x.ts ? new Date(x.ts * 1000).toLocaleTimeString() : ""}</time></li>`).join("")}</ul>`;
    const html = head + body;
    if (box.__h !== html) { const f = document.activeElement && document.activeElement.id === "v7-fw-in" ? $("v7-fw-in").value : null; box.innerHTML = html; box.__h = html; if (f != null) { $("v7-fw-in").value = f; $("v7-fw-in").focus(); } }
    if (ws.length && (FW.items == null || FW.key !== ws.join(",") || Date.now() - FW.at > 60e3) && !FW.busy) { const p = loadFollow(); box.__h = ""; paintFollow.w = p; p.then(() => paintFollow()); }
  }
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "v7-fw-add") return;
    e.preventDefault();
    const v = lc(($("v7-fw-in").value || "").trim()); if (!isAddr(v)) { $("v7-fw-in").setAttribute("aria-invalid", "true"); $("v7-fw-in").focus(); return; }
    if (!follows().includes(v)) toggleFollow(v); $("v7-fw-in").value = ""; paintFollow();
  });
  // the watchlist on Telegram: a one-time code, then ARCIA's bot adds the coins
  function paintTg() {
    const box = $("v7-tgw"); if (!box) return;
    const html = `<div class="v7-tgw"><span class="v7-tgw-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="m9 13 8-6"/></svg></span>
      <div><b>${W("Watchlist on Telegram")}</b><small>${W("ARCIA DMs you when a coin you watch moves 20% or passes a $20K / $100K market cap.")}</small></div>
      <button type="button" class="bp-btn-primary sm" data-v7tg>${W("DM me on Telegram")}</button></div>`;
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }
  async function tgWatch(btn) {
    const list = coins().filter((l) => !l.platform || l.platform === "arcpad").filter((l) => typeof arcIsWatched === "function" && arcIsWatched(l.token)).map((l) => lc(l.token)).slice(0, 12);
    if (!list.length) { toast(W0("Star a coin first — your watchlist is empty."), "bad"); return; }
    const win = window.open("", "_blank");
    btn.disabled = true; toast(W0("Opening Telegram…"));
    try {
      const r = await fetch("/api/arcia-tg?wlcode=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tokens: list }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !/^https:\/\/t\.me\/ARCIAonArc_bot\?start=wl_[a-z0-9]+$/.test(String(j.url || ""))) throw new Error(j.error || "no link");
      if (win) win.location.href = j.url; else location.href = j.url;
    } catch { if (win) win.close(); toast(W0("Couldn't make the link — try again."), "bad"); }
    btn.disabled = false;
  }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-v7tg]"); if (b) tgWatch(b); });
  // Explore's watchlist view gets the same button
  function watchBanner() {
    const grid = $("ap-explore-grid"); if (!grid) return;
    let el = $("v7-wl-tg");
    const on = typeof arcExploreSort !== "undefined" && arcExploreSort === "watch";
    if (!on) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "v7-wl-tg"; el.className = "v7-wl-tg"; grid.before(el); }
    el.innerHTML = `<span>${W("ARCIA DMs you when a coin you watch moves 20% or passes a $20K / $100K market cap.")}</span><button type="button" class="bp-btn-primary sm" data-v7tg>${W("DM me on Telegram")}</button>`;
  }

  // =====================================================================
  // wiring
  // =====================================================================
  function onTab(t) {
    if (t === "creator") paintCreator();
    if (t === "compare") paintCompare();
    if (t === "portfolio") setTimeout(() => { pfFrame(); paintEarn(); paintFollow(); paintTg(); }, 700);
    if (t === "explore") watchBanner();
    if (t === "coin") setTimeout(onCoinData, 50);
  }
  document.addEventListener("arcpad:tab", (e) => onTab(e.detail && e.detail.tab));
  addEventListener("hashchange", () => { if (/^#creator\?/.test(location.hash) && $("bp-panel-creator").classList.contains("active")) paintCreator(); if (/^#compare\?/.test(location.hash) && $("bp-panel-compare").classList.contains("active")) paintCompare(); });
  const grid = $("ap-explore-grid"); if (grid) new MutationObserver(() => { clearTimeout(watchBanner.t); watchBanner.t = setTimeout(watchBanner, 40); }).observe(grid, { childList: true });
  document.addEventListener("arc:wallet", () => { if ($("bp-panel-portfolio").classList.contains("active")) paintEarn(); });
  addEventListener("scroll", () => { if (onCoin()) { cancelAnimationFrame(spy.r); spy.r = requestAnimationFrame(spy); } }, { passive: true });
  setInterval(() => {
    if (document.hidden) return;
    if (onCoin()) paintPredict();
    const p = $("bp-panel-portfolio"); if (p && p.classList.contains("active")) { paintEarn(); paintFollow(); }
  }, 20000);
  // the launch list arrives after the page opened on #creator / #compare
  const reHome = () => { const t = document.querySelector(".bp-panel.active"); if (!t) return; if (t.id === "bp-panel-creator") paintCreator(); if (t.id === "bp-panel-compare") paintCompare(); };
  document.addEventListener("arc:activity", reHome);
  setTimeout(reHome, 2500);
  const act = document.querySelector(".bp-panel.active"); if (act) onTab(act.id.replace("bp-panel-", ""));
  window.arcV7Coin = { paintOrd, paintPredict, paintCreator, paintCompare, paintEarn, paintFollow, earlyBuyers, OD, follows, toggleFollow };
})();
