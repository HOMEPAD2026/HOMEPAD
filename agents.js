// agents.js — /agents (agents.html, MK2 2026-11-03): ARCIRCLE's AI agents and the trading agents coming to Arc.
// Live data: /api/social?world=agent-top → { top: [{ id, name, kind, lv, n }], total } (api/_world-agent.mjs).
// The mandate planner is a preview only: it writes out, in plain words, what a vault rule (api/_world-agentvault.mjs
// VAULT.KINDS + the Buyback kind) would allow; nothing is sent. en/ko/zh/tr, the language the game site picked (arc.gw.lang).
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var MAX_USD = 100; // (the vault's per-trade cap: AgentDimensionVault MAX_PER_TX)
  var EN = {
    skip: "Skip to content", play: "Play free", "nav.world": "Game World", "nav.live": "Agents now", "nav.trade": "Trading agents", "nav.plan": "Plan one", "nav.safe": "Safety",
    "hero.k": "ARCIRCLE AGENTS · ON ARC", "hero.h": "An AI agent of your own", "hero.p": "Create it in Genesis Lab. It walks at your side, talks with you and runs errands in ARCIRCLE WORLD — and next it trades for you on Arc, from a vault only you own.", "hero.go": "Create your agent", "hero.how": "How trading agents work",
    "chip.gas": "USDC gas", "chip.fin": "Sub-second finality", "chip.v4": "Uniswap v4 on Arc", "chip.own": "Your own vault",
    "live.k": "Live in ARCIRCLE WORLD", "live.h": "Agents at work this week", "live.total": "agents created", "live.week": "errands run by this week's top 10", "live.price": "$ARCIRCLE to create one · half burned", "live.wait": "Loading…", "live.none": "No errands yet this week — be the first.", "live.na": "The board can't be read right now.", "live.lv": "Lv {n}", "live.n": "{n} errands",
    "now.k": "What an agent does today", "now.h": "Live now", "n1.h": "Genesis Lab", "n1.p": "Pick AURORA, ORION or VEX, give it a unique ID and a personality. It gets a number forever.", "n2.h": "Talks with you", "n2.p": "It remembers its errands, gives you the day's briefing and takes errands by chat.", "n3.h": "Runs errands", "n3.p": "Gather, mine and scout while you play — the loot flies to your bag.", "n4.h": "Arena & Academy", "n4.p": "Quiz battles twice a day and a lesson a day in Nexus City.",
    "tr.k": "Next: trading agents", "tr.h": "It trades for you — inside your own vault", "tr.p": "You open a vault on Arc that only your wallet owns, fund it with USDC and give your agent a rule. It acts only inside the limits you set, and money can only ever go back to you.", "tr.status": "Status: the vault contract is being fixed and re-audited with Arc Studio before it goes live. Trading agents open after that audit — this page will say so.",
    "k.dca": "DCA", "k.dca.p": "Buy a fixed amount on a schedule, e.g. 10 USDC of $ARCIRCLE every day for 30 days.", "k.buyBelow": "Buy below", "k.buyBelow.p": "Buy once when the price drops to your level.", "k.takeProfit": "Take profit", "k.takeProfit.p": "Sell part of a holding once the price reaches your target.", "k.stopLoss": "Stop loss", "k.stopLoss.p": "Sell part of a holding if the price falls to your line.", "k.buyback": "Buyback & burn", "k.buyback.p": "Buy $ARCIRCLE on a schedule and send it to the burn address.", "k.soon": "After the audit",
    "pl.k": "Plan your agent", "pl.h": "Read the mandate back", "pl.p": "Set a rule and see, in plain words, exactly what your agent would be allowed to do. Nothing is sent — it's a preview.", "pl.kind": "Rule", "pl.token": "Token", "pl.usd": "USDC a trade", "pl.every": "Every", "pl.days": "For (days)", "pl.price": "Price (USDC)", "pl.pct": "Sell %", "pl.floor": "Price floor (sell no lower)",
    "m.h": "Your agent's mandate", "m.dca": "Buy {usd} USDC of {t} every {every}, for {days} days — about {n} trades and {total} USDC in all.", "m.buyBelow": "Buy {usd} USDC of {t} once, when its price is at or under {price} USDC.", "m.takeProfit": "Sell {pct}% of the vault's {t} once, when its price is at or over {price} USDC.", "m.stopLoss": "Sell {pct}% of the vault's {t} once, if its price falls to {price} USDC or lower.", "m.buyback": "Buy {usd} USDC of $ARCIRCLE every {every} for {days} days and burn it — about {n} buys, {total} USDC in all.",
    "m.lim": "Limits the vault enforces", "m.l1": "At most {max} USDC a trade; your daily cap on top", "m.l2": "Never sells below {floor} USDC (your price floor)", "m.l3": "1% slippage at most · each order expires in 10 minutes", "m.l4": "Only your wallet can withdraw — any time, never blocked", "m.l5": "Loosening a limit waits 1 hour; tightening applies at once", "m.over": "Over the {max} USDC cap — the vault would refuse it.", "m.fund": "Fund the vault with about {usd} USDC (+ a little for gas).", "m.h1": "1 hour", "m.h6": "6 hours", "m.h24": "day", "m.h168": "week",
    "sf.k": "Safety by design", "sf.h": "Limits the agent can't break",
    "s1.h": "Your vault, your keys", "s1.p": "One vault per wallet on Arc. The agent can trade inside it; only your wallet can take money out.", "s2.h": "Capped trades", "s2.p": "At most 100 USDC a trade, a daily cap you set, and a cooldown between trades.", "s3.h": "Price floors", "s3.p": "You set the lowest price a sell may take and the most slippage it may accept.", "s4.h": "Orders expire", "s4.p": "Every trade carries a deadline, so a delayed order can't fill at a stale price.", "s5.h": "Loosen slowly", "s5.p": "Raising a limit waits an hour; a new agent key or a higher fee waits a day.", "s6.h": "Audited with Arc Studio", "s6.p": "Written and audited with Arc Studio (studio.arc.io); the re-audit of the fixes comes before launch.",
    "arc.k": "Why Arc", "arc.h": "Built for markets", "arc1.h": "Deterministic, sub-second finality", "arc1.p": "A trade is final in about a second — no waiting for blocks to settle.", "arc2.h": "USDC is the gas", "arc2.p": "No second coin to hold: fees are paid in the dollars the vault already uses.", "arc3.h": "Uniswap v4 pools", "arc3.p": "Agents trade through ARCIRCLE Swap on Arc's v4 pools; the swap fee goes to the fee burn.",
    "faq.k": "Questions", "faq.h": "Good to know",
    "q1": "Can I create an agent now?", "a1": "Yes. In the game, walk to the AD Tower (or press Create your agent here). An agent costs 100,000 $ARCIRCLE from your own wallet — half is burned, half goes to the treasury.",
    "q2": "When do trading agents open?", "a2": "After the vault contract's fixes are re-audited with Arc Studio and it's deployed on Arc. Until then this page shows the rules and lets you plan one.",
    "q3": "Who holds my money?", "a3": "Your vault holds it, and only your wallet can withdraw. The agent's key can only trade inside your limits; ARCIRCLE never holds your private key.",
    "q4": "Is there a fee?", "a4": "A small fee per trade in $ARCIRCLE, shown before you start; ARCIRCLE Swap's swap fee goes to the fee burn. Every $ARCIRCLE spent splits 50% burned / 50% treasury.",
    "q5": "Will it make money?", "a5": "It does exactly what your rule says. Prices move both ways, and an agent can lose money — nothing here is a promise of returns.",
    "fin.h": "Start with your agent today", "fin.p": "Create it in the game, take it on errands — and it'll be ready when trading opens.",
    "foot.fine": "Trading agents act only on the rules you set, inside limits the vault enforces. Prices move; nothing here is financial advice or a promise of returns."
  };
  var KO = {
    skip: "본문으로", play: "무료 플레이", "nav.world": "게임 월드", "nav.live": "지금의 에이전트", "nav.trade": "트레이딩 에이전트", "nav.plan": "직접 설계", "nav.safe": "안전 장치",
    "hero.k": "ARCIRCLE AGENTS · ARC 위에서", "hero.h": "나만의 AI 에이전트", "hero.p": "Genesis Lab에서 만들어요. 내 곁을 걸으며 대화하고 ARCIRCLE WORLD에서 심부름을 해요 — 다음 단계로는 나만 소유한 금고에서 Arc 위의 거래를 대신해요.", "hero.go": "에이전트 만들기", "hero.how": "트레이딩 에이전트 알아보기",
    "chip.gas": "가스는 USDC", "chip.fin": "1초 안에 확정", "chip.v4": "Arc의 Uniswap v4", "chip.own": "나만의 금고",
    "live.k": "ARCIRCLE WORLD 실시간", "live.h": "이번 주 활동 중인 에이전트", "live.total": "만들어진 에이전트", "live.week": "이번 주 상위 10개가 한 심부름", "live.price": "$ARCIRCLE로 만들기 · 절반 소각", "live.wait": "불러오는 중…", "live.none": "이번 주 심부름이 아직 없어요 — 첫 번째가 되어 보세요.", "live.na": "지금은 순위를 불러올 수 없어요.", "live.lv": "Lv {n}", "live.n": "심부름 {n}회",
    "now.k": "지금 에이전트가 하는 일", "now.h": "지금 운영 중", "n1.h": "Genesis Lab", "n1.p": "AURORA, ORION, VEX 중 하나를 고르고 고유 ID와 성격을 정해요. 영구 번호가 붙어요.", "n2.h": "대화", "n2.p": "심부름을 기억하고, 하루 브리핑을 해주고, 채팅으로 심부름을 받아요.", "n3.h": "심부름", "n3.p": "플레이하는 동안 채집·채굴·정찰을 하고 전리품을 가방으로 보내요.", "n4.h": "아레나 & 아카데미", "n4.p": "Nexus City에서 하루 두 번 퀴즈 배틀, 하루 한 번 수업.",
    "tr.k": "다음 단계: 트레이딩 에이전트", "tr.h": "나만의 금고 안에서 대신 거래해요", "tr.p": "내 지갑만 소유하는 금고를 Arc에 열고 USDC를 넣은 뒤 에이전트에게 규칙을 줘요. 정한 한도 안에서만 움직이고, 돈은 오직 나에게만 돌아와요.", "tr.status": "현재 상태: 금고 컨트랙트를 Arc Studio로 수정·재감사하고 있어요. 감사가 끝나면 트레이딩 에이전트를 열고 이 페이지에 알려드릴게요.",
    "k.dca": "적립식(DCA)", "k.dca.p": "정해진 금액을 일정 간격으로 매수, 예: 30일 동안 매일 $ARCIRCLE 10 USDC어치.", "k.buyBelow": "지정가 매수", "k.buyBelow.p": "가격이 내가 정한 수준까지 내려오면 한 번 매수.", "k.takeProfit": "익절", "k.takeProfit.p": "가격이 목표에 닿으면 보유분 일부를 매도.", "k.stopLoss": "손절", "k.stopLoss.p": "가격이 정한 선까지 떨어지면 보유분 일부를 매도.", "k.buyback": "바이백 & 소각", "k.buyback.p": "일정 간격으로 $ARCIRCLE을 사서 소각 주소로 보내요.", "k.soon": "감사 후 오픈",
    "pl.k": "에이전트 설계", "pl.h": "위임 내용 미리 읽기", "pl.p": "규칙을 정하면 에이전트가 할 수 있는 일을 쉬운 말로 정확히 보여드려요. 아무것도 전송되지 않는 미리보기예요.", "pl.kind": "규칙", "pl.token": "토큰", "pl.usd": "1회 USDC", "pl.every": "간격", "pl.days": "기간(일)", "pl.price": "가격(USDC)", "pl.pct": "매도 %", "pl.floor": "최저 매도가(이 아래로는 안 팜)",
    "m.h": "내 에이전트의 위임 내용", "m.dca": "{t}를 {every}마다 {usd} USDC어치씩 {days}일 동안 매수 — 약 {n}회, 총 {total} USDC.", "m.buyBelow": "{t} 가격이 {price} USDC 이하가 되면 {usd} USDC어치를 한 번 매수.", "m.takeProfit": "{t} 가격이 {price} USDC 이상이 되면 금고 보유분의 {pct}%를 한 번 매도.", "m.stopLoss": "{t} 가격이 {price} USDC 이하로 떨어지면 금고 보유분의 {pct}%를 한 번 매도.", "m.buyback": "{every}마다 {usd} USDC어치 $ARCIRCLE을 사서 소각, {days}일 동안 — 약 {n}회, 총 {total} USDC.",
    "m.lim": "금고가 지키는 한도", "m.l1": "1회 최대 {max} USDC, 그 위에 내가 정한 일일 한도", "m.l2": "{floor} USDC 아래로는 절대 팔지 않음(최저가)", "m.l3": "슬리피지 최대 1% · 주문은 10분 뒤 만료", "m.l4": "출금은 내 지갑만 — 언제든, 막히지 않음", "m.l5": "한도 완화는 1시간 대기, 강화는 바로 적용", "m.over": "1회 한도 {max} USDC를 넘어요 — 금고가 거절해요.", "m.fund": "금고에 약 {usd} USDC를 넣어 주세요(+ 가스 약간).", "m.h1": "1시간", "m.h6": "6시간", "m.h24": "하루", "m.h168": "1주",
    "sf.k": "설계부터 안전하게", "sf.h": "에이전트가 넘을 수 없는 한도",
    "s1.h": "내 금고, 내 키", "s1.p": "Arc에 지갑당 금고 하나. 에이전트는 안에서 거래만 하고, 돈은 내 지갑만 꺼낼 수 있어요.", "s2.h": "거래 한도", "s2.p": "1회 최대 100 USDC, 내가 정한 일일 한도, 거래 사이 대기 시간.", "s3.h": "최저가", "s3.p": "매도 최저 가격과 최대 슬리피지를 내가 정해요.", "s4.h": "주문 만료", "s4.p": "모든 거래에 마감 시간이 있어, 늦게 실행돼 옛 가격으로 체결되지 않아요.", "s5.h": "천천히 완화", "s5.p": "한도를 올리면 1시간, 새 에이전트 키나 수수료 인상은 하루를 기다려요.", "s6.h": "Arc Studio 감사", "s6.p": "Arc Studio(studio.arc.io)로 작성·감사했고, 수정 사항의 재감사가 출시 전에 진행돼요.",
    "arc.k": "왜 Arc인가", "arc.h": "시장을 위해 만들어진 체인", "arc1.h": "결정적, 1초 안 확정", "arc1.p": "거래가 약 1초 만에 최종 확정 — 블록을 기다릴 필요가 없어요.", "arc2.h": "가스는 USDC", "arc2.p": "두 번째 코인이 필요 없어요: 금고가 쓰는 달러로 수수료를 내요.", "arc3.h": "Uniswap v4 풀", "arc3.p": "에이전트는 Arc의 v4 풀에서 ARCIRCLE Swap으로 거래하고, 스왑 수수료는 소각 금고로 가요.",
    "faq.k": "자주 묻는 질문", "faq.h": "알아두면 좋아요",
    "q1": "지금 에이전트를 만들 수 있나요?", "a1": "네. 게임에서 AD 타워로 가거나 여기서 '에이전트 만들기'를 누르세요. 내 지갑에서 100,000 $ARCIRCLE — 절반은 소각, 절반은 트레저리로 가요.",
    "q2": "트레이딩 에이전트는 언제 열리나요?", "a2": "금고 컨트랙트 수정이 Arc Studio로 재감사되고 Arc에 배포된 뒤에요. 그때까지 이 페이지에서 규칙을 보고 미리 설계해 볼 수 있어요.",
    "q3": "돈은 누가 보관하나요?", "a3": "내 금고가 보관하고 출금은 내 지갑만 할 수 있어요. 에이전트 키는 한도 안에서 거래만 하고, ARCIRCLE은 내 개인키를 절대 갖지 않아요.",
    "q4": "수수료가 있나요?", "a4": "거래마다 $ARCIRCLE로 작은 수수료가 있고 시작 전에 보여드려요. ARCIRCLE Swap의 스왑 수수료는 소각 금고로 가요. 쓰인 $ARCIRCLE은 50% 소각 / 50% 트레저리.",
    "q5": "수익이 나나요?", "a5": "규칙 그대로만 움직여요. 가격은 양방향으로 움직이고 손실도 날 수 있어요 — 수익을 약속하지 않아요.",
    "fin.h": "오늘 에이전트부터 시작하세요", "fin.p": "게임에서 만들고 심부름을 보내 두면, 트레이딩이 열릴 때 바로 준비돼 있어요.",
    "foot.fine": "트레이딩 에이전트는 내가 정한 규칙대로, 금고가 지키는 한도 안에서만 움직여요. 가격은 변하며, 이 페이지의 어떤 내용도 투자 조언이나 수익 약속이 아니에요."
  };
  var ZH = {
    skip: "跳到正文", play: "免费游玩", "nav.world": "游戏世界", "nav.live": "现在的代理", "nav.trade": "交易代理", "nav.plan": "设计一个", "nav.safe": "安全",
    "hero.k": "ARCIRCLE AGENTS · 在 ARC 上", "hero.h": "属于你的 AI 代理", "hero.p": "在 Genesis Lab 创建它。它陪你同行、与你聊天、在 ARCIRCLE WORLD 跑腿——下一步，它会在只属于你的金库里替你在 Arc 上交易。", "hero.go": "创建你的代理", "hero.how": "了解交易代理",
    "chip.gas": "USDC 付 Gas", "chip.fin": "亚秒级最终确认", "chip.v4": "Arc 上的 Uniswap v4", "chip.own": "你自己的金库",
    "live.k": "ARCIRCLE WORLD 实时", "live.h": "本周活跃的代理", "live.total": "已创建的代理", "live.week": "本周前 10 名完成的跑腿", "live.price": "$ARCIRCLE 创建一个 · 一半销毁", "live.wait": "加载中…", "live.none": "本周还没有跑腿——来做第一个吧。", "live.na": "暂时无法读取排行。", "live.lv": "Lv {n}", "live.n": "{n} 次跑腿",
    "now.k": "代理现在能做什么", "now.h": "已上线", "n1.h": "Genesis Lab", "n1.p": "选择 AURORA、ORION 或 VEX，给它独一无二的 ID 和性格，它会获得永久编号。", "n2.h": "与你聊天", "n2.p": "记得它的跑腿，给你每日简报，还能通过聊天接任务。", "n3.h": "跑腿", "n3.p": "你玩的时候它去采集、挖矿、侦察——战利品飞进你的背包。", "n4.h": "竞技场与学院", "n4.p": "在 Nexus City 每天两次答题对战、每天一节课。",
    "tr.k": "下一步：交易代理", "tr.h": "在你自己的金库里替你交易", "tr.p": "在 Arc 上开一个只属于你钱包的金库，存入 USDC，给代理一条规则。它只在你设定的限额内行动，资金只能回到你手中。", "tr.status": "状态：金库合约正在用 Arc Studio 修复并重新审计。审计完成后交易代理才会开放——本页会第一时间说明。",
    "k.dca": "定投（DCA）", "k.dca.p": "按计划买入固定金额，例如 30 天内每天买 10 USDC 的 $ARCIRCLE。", "k.buyBelow": "低价买入", "k.buyBelow.p": "价格跌到你的价位时买入一次。", "k.takeProfit": "止盈", "k.takeProfit.p": "价格达到目标时卖出部分持仓。", "k.stopLoss": "止损", "k.stopLoss.p": "价格跌到你的线时卖出部分持仓。", "k.buyback": "回购并销毁", "k.buyback.p": "按计划买入 $ARCIRCLE 并发送到销毁地址。", "k.soon": "审计后开放",
    "pl.k": "设计你的代理", "pl.h": "读一遍授权内容", "pl.p": "设定一条规则，用简单的话看清代理被允许做什么。不会发送任何内容——只是预览。", "pl.kind": "规则", "pl.token": "代币", "pl.usd": "每次 USDC", "pl.every": "间隔", "pl.days": "持续（天）", "pl.price": "价格（USDC）", "pl.pct": "卖出 %", "pl.floor": "最低卖价（不低于）",
    "m.h": "你的代理授权", "m.dca": "每{every}买入 {usd} USDC 的 {t}，持续 {days} 天——约 {n} 次，共 {total} USDC。", "m.buyBelow": "当 {t} 价格不高于 {price} USDC 时，买入一次 {usd} USDC。", "m.takeProfit": "当 {t} 价格不低于 {price} USDC 时，卖出金库持有的 {pct}%，一次。", "m.stopLoss": "若 {t} 价格跌到 {price} USDC 或更低，卖出金库持有的 {pct}%，一次。", "m.buyback": "每{every}买入 {usd} USDC 的 $ARCIRCLE 并销毁，持续 {days} 天——约 {n} 次，共 {total} USDC。",
    "m.lim": "金库强制执行的限额", "m.l1": "每次最多 {max} USDC，另加你设定的每日上限", "m.l2": "绝不低于 {floor} USDC 卖出（你的最低价）", "m.l3": "滑点最多 1% · 每笔订单 10 分钟后过期", "m.l4": "只有你的钱包能提款——随时，不会被阻止", "m.l5": "放宽限额需等 1 小时；收紧立即生效", "m.over": "超过 {max} USDC 单笔上限——金库会拒绝。", "m.fund": "向金库存入约 {usd} USDC（再加少量 Gas）。", "m.h1": "1 小时", "m.h6": "6 小时", "m.h24": "天", "m.h168": "周",
    "sf.k": "安全设计", "sf.h": "代理无法突破的限额",
    "s1.h": "你的金库，你的钥匙", "s1.p": "Arc 上每个钱包一个金库。代理只能在其中交易，只有你的钱包能取出资金。", "s2.h": "交易上限", "s2.p": "每次最多 100 USDC、你设定的每日上限，以及交易间隔。", "s3.h": "最低价", "s3.p": "你设定卖出的最低价格和可接受的最大滑点。", "s4.h": "订单过期", "s4.p": "每笔交易都有截止时间，延迟的订单不会按过时价格成交。", "s5.h": "缓慢放宽", "s5.p": "提高限额需等一小时；新的代理密钥或更高费用需等一天。", "s6.h": "Arc Studio 审计", "s6.p": "用 Arc Studio（studio.arc.io）编写和审计；修复内容的重新审计在上线前完成。",
    "arc.k": "为什么是 Arc", "arc.h": "为市场而生", "arc1.h": "确定性的亚秒级确认", "arc1.p": "交易约一秒即最终确认——无需等待区块。", "arc2.h": "USDC 就是 Gas", "arc2.p": "无需持有第二种币：手续费用金库本来就用的美元支付。", "arc3.h": "Uniswap v4 池", "arc3.p": "代理通过 ARCIRCLE Swap 在 Arc 的 v4 池交易；兑换手续费进入销毁合约。",
    "faq.k": "常见问题", "faq.h": "须知",
    "q1": "现在可以创建代理吗？", "a1": "可以。在游戏中走到 AD 塔（或点这里的“创建你的代理”）。从你自己的钱包支付 100,000 $ARCIRCLE——一半销毁，一半进入金库。",
    "q2": "交易代理什么时候开放？", "a2": "在金库合约的修复经 Arc Studio 重新审计并部署到 Arc 之后。在此之前，你可以在本页查看规则并预先设计。",
    "q3": "我的钱由谁保管？", "a3": "由你的金库保管，只有你的钱包能提款。代理密钥只能在你的限额内交易；ARCIRCLE 从不持有你的私钥。",
    "q4": "有手续费吗？", "a4": "每笔交易收取少量 $ARCIRCLE 手续费，开始前会显示；ARCIRCLE Swap 的兑换手续费进入销毁合约。花掉的 $ARCIRCLE 50% 销毁 / 50% 进入金库。",
    "q5": "会赚钱吗？", "a5": "它只会严格按你的规则执行。价格有涨有跌，代理也可能亏损——这里没有任何收益承诺。",
    "fin.h": "今天就从你的代理开始", "fin.p": "在游戏中创建它，让它去跑腿——交易开放时它就准备好了。",
    "foot.fine": "交易代理只按你设定的规则、在金库强制的限额内行动。价格会变动；本页内容不构成投资建议或收益承诺。"
  };
  var TR = {
    skip: "İçeriğe geç", play: "Ücretsiz oyna", "nav.world": "Oyun Dünyası", "nav.live": "Şu anki ajanlar", "nav.trade": "Alım-satım ajanları", "nav.plan": "Bir tane planla", "nav.safe": "Güvenlik",
    "hero.k": "ARCIRCLE AGENTS · ARC ÜZERİNDE", "hero.h": "Sana ait bir yapay zekâ ajanı", "hero.p": "Genesis Lab'da oluştur. Yanında yürür, seninle konuşur ve ARCIRCLE WORLD'de görev yapar — sıradaki adımda yalnızca senin sahip olduğun bir kasadan Arc'ta senin için alım-satım yapar.", "hero.go": "Ajanını oluştur", "hero.how": "Alım-satım ajanları nasıl çalışır",
    "chip.gas": "USDC gaz", "chip.fin": "Saniyenin altında kesinlik", "chip.v4": "Arc'ta Uniswap v4", "chip.own": "Kendi kasan",
    "live.k": "ARCIRCLE WORLD'de canlı", "live.h": "Bu hafta çalışan ajanlar", "live.total": "oluşturulan ajan", "live.week": "bu haftanın ilk 10'unun yaptığı görev", "live.price": "$ARCIRCLE ile bir tane · yarısı yakılır", "live.wait": "Yükleniyor…", "live.none": "Bu hafta henüz görev yok — ilk sen ol.", "live.na": "Liste şu an okunamıyor.", "live.lv": "Sv {n}", "live.n": "{n} görev",
    "now.k": "Bir ajan bugün ne yapar", "now.h": "Şu an canlı", "n1.h": "Genesis Lab", "n1.p": "AURORA, ORION ya da VEX'i seç, benzersiz bir kimlik ve kişilik ver. Sonsuza dek bir numarası olur.", "n2.h": "Seninle konuşur", "n2.p": "Görevlerini hatırlar, günün özetini verir ve sohbetle görev alır.", "n3.h": "Görev yapar", "n3.p": "Sen oynarken toplar, kazar, keşfeder — ganimet çantana uçar.", "n4.h": "Arena ve Akademi", "n4.p": "Nexus City'de günde iki kez bilgi yarışması, günde bir ders.",
    "tr.k": "Sırada: alım-satım ajanları", "tr.h": "Senin kasanın içinde senin için işlem yapar", "tr.p": "Arc'ta yalnızca cüzdanının sahip olduğu bir kasa açar, USDC yatırır ve ajanına bir kural verirsin. Sadece belirlediğin sınırlar içinde hareket eder ve para yalnızca sana geri dönebilir.", "tr.status": "Durum: kasa sözleşmesi yayına çıkmadan önce Arc Studio ile düzeltiliyor ve yeniden denetleniyor. Alım-satım ajanları bu denetimden sonra açılacak — bu sayfa haber verecek.",
    "k.dca": "Düzenli alım (DCA)", "k.dca.p": "Belli bir tutarı plana göre al, ör. 30 gün boyunca her gün 10 USDC'lik $ARCIRCLE.", "k.buyBelow": "Altında al", "k.buyBelow.p": "Fiyat senin seviyene inince bir kez al.", "k.takeProfit": "Kâr al", "k.takeProfit.p": "Fiyat hedefe ulaşınca elindekinin bir kısmını sat.", "k.stopLoss": "Zarar durdur", "k.stopLoss.p": "Fiyat çizgine düşerse elindekinin bir kısmını sat.", "k.buyback": "Geri alım ve yakım", "k.buyback.p": "Plana göre $ARCIRCLE al ve yakım adresine gönder.", "k.soon": "Denetimden sonra",
    "pl.k": "Ajanını planla", "pl.h": "Yetkiyi geri oku", "pl.p": "Bir kural belirle ve ajanının tam olarak ne yapabileceğini sade bir dille gör. Hiçbir şey gönderilmez — bu bir önizleme.", "pl.kind": "Kural", "pl.token": "Token", "pl.usd": "İşlem başı USDC", "pl.every": "Her", "pl.days": "Süre (gün)", "pl.price": "Fiyat (USDC)", "pl.pct": "Satış %", "pl.floor": "Taban fiyat (altında satmaz)",
    "m.h": "Ajanının yetkisi", "m.dca": "{days} gün boyunca her {every} {usd} USDC'lik {t} al — yaklaşık {n} işlem, toplam {total} USDC.", "m.buyBelow": "{t} fiyatı {price} USDC veya altındayken bir kez {usd} USDC'lik al.", "m.takeProfit": "{t} fiyatı {price} USDC veya üstündeyken kasadaki {t} miktarının %{pct}'ini bir kez sat.", "m.stopLoss": "{t} fiyatı {price} USDC veya altına düşerse kasadaki {t} miktarının %{pct}'ini bir kez sat.", "m.buyback": "{days} gün boyunca her {every} {usd} USDC'lik $ARCIRCLE al ve yak — yaklaşık {n} alım, toplam {total} USDC.",
    "m.lim": "Kasanın uyguladığı sınırlar", "m.l1": "İşlem başına en fazla {max} USDC; üstüne senin günlük sınırın", "m.l2": "{floor} USDC altında asla satmaz (taban fiyatın)", "m.l3": "En fazla %1 kayma · her emir 10 dakikada sona erer", "m.l4": "Para çekmeyi yalnızca cüzdanın yapar — her zaman, asla engellenmez", "m.l5": "Bir sınırı gevşetmek 1 saat bekler; sıkılaştırmak hemen geçerli", "m.over": "{max} USDC sınırının üstünde — kasa reddeder.", "m.fund": "Kasaya yaklaşık {usd} USDC yatır (+ biraz gaz).", "m.h1": "1 saatte", "m.h6": "6 saatte", "m.h24": "gün", "m.h168": "hafta",
    "sf.k": "Tasarımdan güvenli", "sf.h": "Ajanın aşamayacağı sınırlar",
    "s1.h": "Senin kasan, senin anahtarın", "s1.p": "Arc'ta cüzdan başına bir kasa. Ajan içinde işlem yapabilir; parayı yalnızca cüzdanın çıkarabilir.", "s2.h": "Sınırlı işlemler", "s2.p": "İşlem başına en fazla 100 USDC, belirlediğin günlük sınır ve işlemler arası bekleme.", "s3.h": "Taban fiyatlar", "s3.p": "Bir satışın alabileceği en düşük fiyatı ve en yüksek kaymayı sen belirlersin.", "s4.h": "Emirler sona erer", "s4.p": "Her işlemin bir son tarihi vardır; geciken bir emir eski fiyattan dolamaz.", "s5.h": "Yavaş gevşetme", "s5.p": "Bir sınırı yükseltmek bir saat bekler; yeni ajan anahtarı ya da daha yüksek ücret bir gün bekler.", "s6.h": "Arc Studio ile denetlendi", "s6.p": "Arc Studio (studio.arc.io) ile yazıldı ve denetlendi; düzeltmelerin yeniden denetimi yayından önce yapılır.",
    "arc.k": "Neden Arc", "arc.h": "Piyasalar için yapıldı", "arc1.h": "Belirleyici, saniyenin altında kesinlik", "arc1.p": "Bir işlem yaklaşık bir saniyede kesinleşir — blok beklemek yok.", "arc2.h": "Gaz USDC", "arc2.p": "İkinci bir coin gerekmez: ücretler kasanın zaten kullandığı dolarla ödenir.", "arc3.h": "Uniswap v4 havuzları", "arc3.p": "Ajanlar Arc'ın v4 havuzlarında ARCIRCLE Swap üzerinden işlem yapar; takas ücreti yakım kasasına gider.",
    "faq.k": "Sorular", "faq.h": "Bilmekte fayda var",
    "q1": "Şimdi ajan oluşturabilir miyim?", "a1": "Evet. Oyunda AD Kulesi'ne yürü (ya da buradan Ajanını oluştur'a bas). Bir ajan kendi cüzdanından 100.000 $ARCIRCLE — yarısı yakılır, yarısı hazineye gider.",
    "q2": "Alım-satım ajanları ne zaman açılır?", "a2": "Kasa sözleşmesinin düzeltmeleri Arc Studio ile yeniden denetlenip Arc'a dağıtıldıktan sonra. O zamana kadar bu sayfada kuralları görüp bir tane planlayabilirsin.",
    "q3": "Paramı kim tutar?", "a3": "Kasan tutar ve yalnızca cüzdanın çekebilir. Ajanın anahtarı yalnızca sınırların içinde işlem yapar; ARCIRCLE özel anahtarını asla tutmaz.",
    "q4": "Ücret var mı?", "a4": "İşlem başına $ARCIRCLE olarak küçük bir ücret, başlamadan önce gösterilir; ARCIRCLE Swap'in takas ücreti yakım kasasına gider. Harcanan her $ARCIRCLE %50 yakılır / %50 hazineye gider.",
    "q5": "Para kazandırır mı?", "a5": "Tam olarak kuralının söylediğini yapar. Fiyatlar iki yöne de hareket eder ve bir ajan para kaybedebilir — burada hiçbir getiri vaadi yok.",
    "fin.h": "Bugün ajanınla başla", "fin.p": "Oyunda oluştur, görevlere gönder — alım-satım açıldığında hazır olur.",
    "foot.fine": "Alım-satım ajanları yalnızca belirlediğin kurallarla, kasanın uyguladığı sınırlar içinde hareket eder. Fiyatlar değişir; buradaki hiçbir şey yatırım tavsiyesi ya da getiri vaadi değildir."
  };
  var DICT = { en: EN, ko: KO, zh: ZH, tr: TR };
  var lang = (function () { try { var l = localStorage.getItem("arc.gw.lang"); if (DICT[l]) return l; } catch (e) { /* private */ } var n = (navigator.language || "en").slice(0, 2); return DICT[n] ? n : "en"; })();
  var t = function (k, v) { var s = (DICT[lang] && DICT[lang][k]) || EN[k] || k; return v ? s.replace(/\{(\w+)\}/g, function (_, x) { return v[x] != null ? v[x] : ""; }) : s; };
  var KINDS = ["dca", "buyBelow", "takeProfit", "stopLoss", "buyback"], ICON = { dca: "📆", buyBelow: "🎯", takeProfit: "💰", stopLoss: "🛡️", buyback: "🔥" };
  var board = null;
  function fmt(n) { n = Number(n) || 0; var o = Math.abs(n) > 0 && Math.abs(n) < 1 ? { maximumSignificantDigits: 4 } : { maximumFractionDigits: 2 }; return n.toLocaleString(lang === "tr" ? "tr-TR" : "en-US", o); } // (a token price like 0.0004 keeps its digits)
  function paintStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i]").forEach(function (e) { e.textContent = t(e.getAttribute("data-i")); });
    $("#ag-kinds").innerHTML = KINDS.map(function (k) { return '<article class="ag-kind"><i>' + ICON[k] + "</i><b>" + esc(t("k." + k)) + "</b><p>" + esc(t("k." + k + ".p")) + '</p><span class="ag-soon">' + esc(t("k.soon")) + "</span></article>"; }).join("");
    var kindSel = $("#pf-kind"), cur = kindSel.value || "dca";
    kindSel.innerHTML = KINDS.map(function (k) { return '<option value="' + k + '">' + esc(t("k." + k)) + "</option>"; }).join(""); kindSel.value = cur;
    $("#ag-safe").innerHTML = [1, 2, 3, 4, 5, 6].map(function (i) { return '<article class="ag-card"><i>' + ["🔐", "📏", "🧱", "⏱️", "🐢", "🛠️"][i - 1] + "</i><b>" + esc(t("s" + i + ".h")) + "</b><p>" + esc(t("s" + i + ".p")) + "</p></article>"; }).join("");
    $("#ag-faq").innerHTML = [1, 2, 3, 4, 5].map(function (i) { return "<details><summary>" + esc(t("q" + i)) + "</summary><p>" + esc(t("a" + i)) + "</p></details>"; }).join("");
    paintBoard(); plan();
  }
  function paintBoard() {
    var el = $("#ag-board");
    if (board === null) return;
    if (board === false) { el.innerHTML = '<p class="ag-empty">' + esc(t("live.na")) + "</p>"; return; }
    $("#ag-total").textContent = fmt(board.total || 0);
    $("#ag-week").textContent = fmt((board.top || []).reduce(function (a, x) { return a + (x.n || 0); }, 0));
    if (!(board.top || []).length) { el.innerHTML = '<p class="ag-empty">' + esc(t("live.none")) + "</p>"; return; }
    el.innerHTML = board.top.map(function (a, i) { var k = ["aurora", "orion", "vex"].indexOf(String(a.kind)) >= 0 ? a.kind : "aurora"; return '<div class="ag-row"><span class="ag-rank">' + (i + 1) + '</span><img src="/images/agents/' + k + '-400.webp" alt="" width="48" height="48" loading="lazy"><div><b>' + esc(a.name || a.id) + "</b><small>@" + esc(a.id || "") + " · " + esc(t("live.lv", { n: a.lv || 1 })) + "</small></div><em>" + esc(t("live.n", { n: fmt(a.n || 0) })) + "</em></div>"; }).join("");
  }
  function plan() {
    var k = $("#pf-kind").value, tok = $("#pf-token").value, usd = Math.max(0, +$("#pf-usd").value || 0), every = +$("#pf-every").value || 24, days = Math.max(1, Math.min(365, +$("#pf-days").value || 1)), price = +$("#pf-price").value || 0, pct = Math.max(1, Math.min(100, +$("#pf-pct").value || 1)), floor = +$("#pf-floor").value || 0;
    var sched = k === "dca" || k === "buyback", buy = sched || k === "buyBelow", n = sched ? Math.max(1, Math.floor((days * 24) / every)) : 1;
    document.querySelectorAll(".pf-every,.pf-days").forEach(function (e) { e.hidden = !sched; }); $(".pf-price").hidden = sched; $(".pf-pct").hidden = buy; $(".pf-usd").hidden = !buy; $("#pf-token").disabled = k === "buyback";
    var line = t("m." + k, { usd: fmt(usd), t: k === "buyback" ? "$ARCIRCLE" : tok, every: t("m.h" + every), days: fmt(days), n: fmt(n), total: fmt(usd * n), price: fmt(price), pct: pct });
    var over = buy && usd > MAX_USD;
    $("#ag-mandate").innerHTML = '<p class="ag-kick">' + esc(t("m.h")) + '</p><p class="ag-mline">' + esc(line) + "</p>" + (over ? '<p class="ag-over">' + esc(t("m.over", { max: MAX_USD })) + "</p>" : "") + "<h4>" + esc(t("m.lim")) + "</h4><ul>" +
      ["<li>✅ " + esc(t("m.l1", { max: MAX_USD })) + "</li>", buy ? "" : "<li>✅ " + esc(t("m.l2", { floor: fmt(floor) })) + "</li>", "<li>✅ " + esc(t("m.l3")) + "</li>", "<li>✅ " + esc(t("m.l4")) + "</li>", "<li>✅ " + esc(t("m.l5")) + "</li>"].join("") + "</ul>" +
      (buy ? '<p class="ag-fund">' + esc(t("m.fund", { usd: fmt(usd * n) })) + "</p>" : "");
  }
  document.addEventListener("input", function (e) { if (e.target.closest("#ag-form")) plan(); });
  document.addEventListener("change", function (e) { if (e.target.closest("#ag-form")) plan(); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lang]"); if (b) { lang = b.getAttribute("data-lang"); try { localStorage.setItem("arc.gw.lang", lang); } catch (x) { /* private */ } var m = $(".gw-lang-menu"); if (m) m.hidden = true; paintStatic(); return; }
    var g = e.target.closest(".gw-globe"); if (g) { var mm = $(".gw-lang-menu"); mm.hidden = !mm.hidden; g.setAttribute("aria-expanded", String(!mm.hidden)); }
  });
  fetch("/api/social?world=agent-top", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { board = j && j.ok ? j : false; paintBoard(); }).catch(function () { board = false; paintBoard(); });
  paintStatic();
})();
