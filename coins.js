// coins.js — the coins page (coins.html at /coins): $ARCIRCLE and ARCL in ARCIRCLE WORLD, in en/ko/zh/tr (the language
// the game site picked: localStorage arc.gw.lang). The live numbers:
//   /api/social?supply=arcircle   max · total · circulating · burned (api/_supply.mjs, read from Arc)
//   /api/social?token=arcircle    price · market cap · holders · burned.bySource · buybacks (api/_token.mjs)
//   /api/social?world=coins       the game's side: ARCL earned/spent by day and kind, the market, the exchange, $ARCIRCLE
//                                 paid in the game, LAND (api/_world-coins.mjs)
// Each block fills in on its own; one that can't be read shows "—" and says so, the rest of the page stays.
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var C1 = "#3987e5", C2 = "#d95926", C3 = "#199e70"; // the validated chart slots (coins.css)

  var EN = {
    skip: "Skip to content", play: "Play free", "nav.world": "Game World", "nav.coins": "The coins", "nav.live": "Live numbers", "nav.use": "Where to use", "nav.faq": "Questions", "nav.pad": "Platform World",
    "hero.k": "The coins of ARCIRCLE WORLD", "hero.p": "Two coins, two jobs. $ARCIRCLE is the token on Arc. ARCL is the coin you earn and spend in the game. Here is what each one does, where you use it, and the live numbers.", "hero.live": "See the live numbers",
    "pair.k": "Two coins, two jobs", "pair.h": "What each coin is",
    "arc.tag": "Token on Arc", "arc.p": "The core token of ARCIRCLE — an ERC-20 on Arc mainnet. You hold it in your own wallet; in the game it pays for items and LAND, and it settles the exchange.",
    "f.chain": "Chain", "f.supply": "Supply", "f.burn": "Burning", "f.ca": "Contract", "f.earn": "Earn", "f.spend": "Spend", "f.swap": "Exchange", "f.next": "Next",
    "arc.chain": "Arc mainnet (chain id 5042)", "arc.supply": "1,000,000,000 minted once — the contract has no mint function", "arc.burn": "Coins sent to 0x…dEaD are gone for good; every burn is on the chain",
    "ca.copy": "Copy", "ca.copied": "Copied!", "ca.view": "View on ArcScan",
    "arcl.tag": "In-game coin", "arcl.p": "The game's own coin. You earn it by playing and spend it in the world. It isn't launched as a token yet — today ARCL are in-game points, kept by the game's server.",
    "arcl.earn": "8 games, the town, quests, your island", "arcl.spend": "Shop, forge, pickaxes, poker chips, the Creator Market", "arcl.swap": "ARCL ⇄ $ARCIRCLE by request in the game; a GM settles each one", "arcl.next": "A token launch is planned (on Solana or Robinhood Chain)",
    "arcl.fee": "🔥 Planned $ARCL token fee: 2% a transaction — 1% buys back and burns $ARCIRCLE, 1% funds ARCIRCLE WORLD's development. Today's in-game ARCL has no fee.",
    "live.k": "Live numbers", "live.wait": "Loading…", "live.on": "Live", "live.off": "Not available right now",
    "arcN.h": "$ARCIRCLE on Arc", "arcN.p": "Read from the Arc chain: the price, how many hold it, and every coin burned so far.",
    "t.price": "Price", "t.mcap": "Market cap", "t.holders": "Holders", "t.burned": "Burned for good", "t.burned.e": "{p} of the supply", "t.circ": "In circulation", "t.circ.e": "outside the treasury and staking", "t.bb": "Treasury buybacks", "t.bb.e": "{n} buys · {t} $ARCIRCLE",
    "ch.supply": "Where the 1,000,000,000 are", "ch.supply.p": "Burned for good, held by the treasury and staking, and out in circulation.", "s.burned": "Burned", "s.held": "Treasury & staking", "s.circ": "In circulation",
    "ch.burns": "$ARCIRCLE burned, by source", "ch.burns.p": "Every burn on the chain, grouped by what sent it.",
    "arclN.h": "ARCL in the game", "arclN.p": "Every ARCL movement is written down in the game's ledger. These are the totals.", "arclN.since": "Every ARCL movement is written down in the game's ledger. Totals since the ledger started on {d}.",
    "t.earned": "ARCL earned", "t.earned.e": "paid out for play", "t.spent": "ARCL spent in the game", "t.spent.e": "shop, forge, market — gone from balances", "t.sales": "Creator Market sales", "t.sales.e": "{p} ARCL to the platform (20%)",
    "t.sold": "ARCL → $ARCIRCLE", "t.sold.e": "{n} settled · {a} $ARCIRCLE sent", "t.bought": "$ARCIRCLE → ARCL", "t.bought.e": "{n} settled · {a} ARCL credited", "t.open": "Exchange requests waiting", "t.open.e": "a GM settles each one",
    "t.settled": "Creator payouts", "t.settled.e": "ARCL settled to creators in $ARCIRCLE",
    "ch.days": "ARCL earned and spent, day by day", "ch.days.p": "The last 30 days (Korea time). Hover or tap a day for its numbers.", "ch.from": "Where ARCL comes from", "ch.to": "Where ARCL goes", "ch.30": "The last 30 days",
    "c.earn": "Earned", "c.spend": "Spent", "c.table": "Show the numbers as a table", "c.day": "Day", "c.none": "No movements counted yet — they show here as soon as players play.", "c.na": "These numbers can't be read right now.",
    "ig.k": "$ARCIRCLE in the game", "ig.h": "Paid, burned and exchanged in ARCIRCLE WORLD", "ig.p": "What players have done with $ARCIRCLE inside the game: items paid for (half of each payment is burned), LAND villages bought, and the exchange with ARCL.",
    "t.shop": "Items paid in $ARCIRCLE", "t.shop.e": "{a} $ARCIRCLE paid", "t.gburn": "Burned through the game", "t.gburn.e": "half of every in-game payment", "t.land": "ARCIRCLE LAND villages", "t.land.e": "{a} $ARCIRCLE to the treasury", "t.land.v": "{n} of {m} sold", "t.mkt": "Blueprints for sale", "t.mkt.e": "in the Creator Market",
    "use.k": "Where to use them", "use.h": "Earn, spend, exchange", "u.earn": "Earn ARCL", "u.spend": "Spend ARCL", "u.arc": "Use $ARCIRCLE",
    "e.surv": "<b>SURVIVORS ARENA</b> — up to 3,000 a run", "e.kart": "<b>ARCIRCLE KART</b> — 500 / 350 / 250 / 150 / 100 by place, 5 races a day, up to 2,500 a day", "e.jump": "<b>COIN JUMP</b> — 3,000 once a day", "e.def": "<b>AC DEFENSE</b> — 5 a wave, up to 150 a day", "e.rings": "<b>INFINITY RINGS</b> — 100 a new star (50 for levels 101–200)", "e.mine": "<b>ARCL MINE</b> — 10 to 10,000 a rock", "e.jur": "<b>JURASSIC WORLD</b> — 3 daily missions, 300 each", "e.poker": "<b>POKER LOUNGE</b> — 3 daily missions (never for winning)", "e.daily": "<b>Every day</b> — check-in, quests, hunts, your island",
    "s.shop": "<b>Shop</b> — styles, potions, items", "s.forge": "<b>Forge</b> — enhance and repair your gear", "s.pick": "<b>Pickaxes</b> — better tiers in the ARCL Mine", "s.chips": "<b>Poker chips</b> — ARCL → chips, one way", "s.mkt": "<b>Creator Market</b> — buy island blueprints from players", "s.swap": "<b>Exchange</b> — ARCL → $ARCIRCLE by request",
    "a.shop": "<b>Pay for items</b> in $ARCIRCLE — half is burned, half goes to the treasury", "a.land": "<b>ARCIRCLE LAND</b> — buy one of the 20 villages", "a.swap": "<b>Exchange</b> — $ARCIRCLE → ARCL (bought ARCL can pay creators)", "a.pay": "<b>Creator payouts</b> — creators' settled sales are paid in $ARCIRCLE from a GM's own wallet", "a.hold": "<b>Hold it</b> in your own wallet on Arc",
    "flow.k": "How they connect", "flow.h": "From play to the chain",
    "fl.1": "Play", "fl.1p": "Games, quests and the town pay ARCL into your balance.", "fl.2": "Spend in the world", "fl.2p": "The shop, the forge and pickaxes take ARCL out of circulation.", "fl.3": "Trade with creators", "fl.3p": "Blueprints sell for ARCL: 80% to the creator after 14 days, 20% to the platform.", "fl.4": "Exchange", "fl.4p": "ARCL ⇄ $ARCIRCLE by request; a GM settles it on Arc.", "fl.5": "Burn", "fl.5p": "$ARCIRCLE paid in the game is half burned — gone for good.",
    "faq.k": "Questions", "faq.h": "Good to know",
    "q1": "Is ARCL a token?", "a1": "Not yet. Today ARCL are in-game points, kept by the game's server and written down in its ledger. A token launch is planned; this page will say when it happens.",
    "q2": "How do I exchange ARCL and $ARCIRCLE?", "a2": "In the game, open the Exchange (the dock's Exchange button). Ask for an amount; the ARCL is held at once, and a GM settles the request on Arc. $ARCIRCLE → ARCL works the other way: you send $ARCIRCLE to the exchange desk and give the transaction.",
    "q3": "What does \"burned\" mean?", "a3": "$ARCIRCLE sent to the 0x…dEaD address (or to the zero address) can never move again. The supply counter here reads that address on the chain.",
    "q4": "Why do the ARCL totals start on a date?", "a4": "The game's ledger writes down every ARCL movement from the day it started. Movements before that weren't totalled, so they aren't in these numbers.",
    "q5": "Where do the numbers come from?", "a5": "$ARCIRCLE's numbers are read from the Arc chain. ARCL's come from the game's own ledger. Both refresh every minute or so.",
    "q6": "What is the planned $ARCL fee?", "a6": "When ARCL launches as a token, the plan is a 2% fee on each transaction: 1% buys back and burns $ARCIRCLE, 1% funds ARCIRCLE WORLD's development. Today's in-game ARCL has no fee.",
    "cta.h": "Start earning ARCL", "cta.p": "Free on phone and PC. Play, build, battle — and watch the numbers grow.",
    "foot.fine": "ARCL are in-game points. Rewards are for play and are never guaranteed. Nothing on this page is financial advice.",
    "k.vote": "Burn-to-vote", "k.mine": "Builder Mine", "k.scanner": "Token Scanner", "k.secret": "ARCIA's secret file", "k.desk": "ARCIA DESK", "k.agent": "ARCIA AGENT vaults", "k.orders": "Orders & Predict fees", "k.omni": "OMNI rewards", "k.buyback": "Buyback", "k.team": "Team & treasury", "k.wallet": "Direct burn", "k.pending": "Being labeled",
    "g.daily": "Daily & welcome", "g.island": "Island & village", "g.town": "Town & RPG", "g.sell": "Selling loot", "g.defense": "AC Defense", "g.mine": "ARCL Mine", "g.surv": "Survivors Arena", "g.kart": "ARCIRCLE KART", "g.poker": "Poker missions", "g.rings": "Infinity Rings", "g.jur": "Jurassic World", "g.jump": "Coin Jump", "g.swapbuy": "Bought with $ARCIRCLE", "g.sale": "Creator sales", "g.gm": "GM rewards", "g.other": "Other",
    "g.market": "Creator Market", "g.forge": "Forge", "g.pick": "Pickaxes", "g.chips": "Poker chips", "g.shop": "Shop items", "g.swap": "Exchange → $ARCIRCLE",
  };
  var KO = {
    skip: "본문으로", play: "무료 플레이", "nav.world": "게임 월드", "nav.coins": "코인 소개", "nav.live": "실시간 현황", "nav.use": "사용처", "nav.faq": "자주 묻는 질문", "nav.pad": "플랫폼 월드",
    "hero.k": "ARCIRCLE WORLD의 코인", "hero.p": "두 코인, 두 가지 역할. $ARCIRCLE은 Arc 체인의 토큰이고, ARCL은 게임에서 벌고 쓰는 코인이에요. 각각 무엇을 하는지, 어디서 쓰는지, 실시간 현황까지 한눈에 보세요.", "hero.live": "실시간 현황 보기",
    "pair.k": "두 코인, 두 가지 역할", "pair.h": "각 코인은 무엇인가요",
    "arc.tag": "Arc 체인 토큰", "arc.p": "ARCIRCLE의 핵심 토큰 — Arc 메인넷의 ERC-20이에요. 내 지갑에 보관하고, 게임에서는 아이템과 LAND 결제, 교환 정산에 쓰여요.",
    "f.chain": "체인", "f.supply": "발행량", "f.burn": "소각", "f.ca": "컨트랙트", "f.earn": "획득", "f.spend": "사용", "f.swap": "교환", "f.next": "예정",
    "arc.chain": "Arc 메인넷 (체인 ID 5042)", "arc.supply": "1,000,000,000개 1회 발행 — 컨트랙트에 추가 발행 기능이 없어요", "arc.burn": "0x…dEaD로 보낸 코인은 영원히 사라져요. 모든 소각은 체인에 기록돼요",
    "ca.copy": "복사", "ca.copied": "복사됨!", "ca.view": "ArcScan에서 보기",
    "arcl.tag": "게임 내 코인", "arcl.p": "게임 자체의 코인이에요. 플레이로 벌고 월드에서 써요. 아직 토큰으로 출시되지 않았고, 지금 ARCL은 게임 서버가 관리하는 게임 내 포인트예요.",
    "arcl.earn": "8개 게임, 마을, 퀘스트, 내 섬", "arcl.spend": "상점, 대장간, 곡괭이, 포커 칩, 크리에이터 마켓", "arcl.swap": "게임에서 ARCL ⇄ $ARCIRCLE 교환 신청, GM이 하나씩 정산", "arcl.next": "토큰 출시 예정 (Solana 또는 Robinhood Chain)",
    "arcl.fee": "🔥 $ARCL 토큰 출시 후 예정 수수료: 거래마다 2% — 1%는 $ARCIRCLE 바이백 & 소각, 1%는 ARCIRCLE WORLD 생태계 개발. 지금의 게임 내 ARCL에는 수수료가 없어요.",
    "live.k": "실시간 현황", "live.wait": "불러오는 중…", "live.on": "실시간", "live.off": "지금은 불러올 수 없어요",
    "arcN.h": "Arc 체인의 $ARCIRCLE", "arcN.p": "Arc 체인에서 직접 읽어요: 가격, 보유자 수, 지금까지 소각된 모든 코인.",
    "t.price": "가격", "t.mcap": "시가총액", "t.holders": "보유자", "t.burned": "영구 소각", "t.burned.e": "전체 발행량의 {p}", "t.circ": "유통량", "t.circ.e": "트레저리와 스테이킹 제외", "t.bb": "트레저리 바이백", "t.bb.e": "{n}회 · {t} $ARCIRCLE",
    "ch.supply": "10억 개는 어디에 있나요", "ch.supply.p": "영구 소각, 트레저리·스테이킹 보유, 유통 중인 물량.", "s.burned": "소각됨", "s.held": "트레저리 & 스테이킹", "s.circ": "유통 중",
    "ch.burns": "출처별 $ARCIRCLE 소각량", "ch.burns.p": "체인의 모든 소각을 보낸 곳별로 묶었어요.",
    "arclN.h": "게임 속 ARCL", "arclN.p": "모든 ARCL 이동은 게임 장부에 기록돼요. 그 합계예요.", "arclN.since": "모든 ARCL 이동은 게임 장부에 기록돼요. 장부가 시작된 {d}부터의 합계예요.",
    "t.earned": "지급된 ARCL", "t.earned.e": "플레이 보상으로 지급", "t.spent": "게임에서 사용된 ARCL", "t.spent.e": "상점·대장간·마켓 — 잔액에서 빠짐", "t.sales": "크리에이터 마켓 판매", "t.sales.e": "플랫폼 몫 {p} ARCL (20%)",
    "t.sold": "ARCL → $ARCIRCLE", "t.sold.e": "{n}건 정산 · {a} $ARCIRCLE 지급", "t.bought": "$ARCIRCLE → ARCL", "t.bought.e": "{n}건 정산 · {a} ARCL 지급", "t.open": "대기 중인 교환 신청", "t.open.e": "GM이 하나씩 정산해요",
    "t.settled": "크리에이터 정산", "t.settled.e": "크리에이터에게 $ARCIRCLE로 정산된 ARCL",
    "ch.days": "일별 ARCL 지급과 사용", "ch.days.p": "최근 30일 (한국 시간). 날짜에 마우스를 올리거나 탭하면 숫자가 보여요.", "ch.from": "ARCL은 어디서 오나요", "ch.to": "ARCL은 어디에 쓰이나요", "ch.30": "최근 30일",
    "c.earn": "지급", "c.spend": "사용", "c.table": "표로 보기", "c.day": "날짜", "c.none": "아직 집계된 이동이 없어요 — 플레이가 시작되면 바로 보여요.", "c.na": "지금은 이 숫자를 불러올 수 없어요.",
    "ig.k": "게임 속 $ARCIRCLE", "ig.h": "ARCIRCLE WORLD에서 결제·소각·교환된 양", "ig.p": "플레이어가 게임 안에서 $ARCIRCLE로 한 일: 아이템 결제(결제액의 절반은 소각), LAND 마을 구매, ARCL과의 교환.",
    "t.shop": "$ARCIRCLE로 결제한 아이템", "t.shop.e": "{a} $ARCIRCLE 결제", "t.gburn": "게임을 통해 소각", "t.gburn.e": "게임 내 결제액의 절반", "t.land": "ARCIRCLE LAND 마을", "t.land.e": "트레저리로 {a} $ARCIRCLE", "t.land.v": "{m}개 중 {n}개 판매", "t.mkt": "판매 중인 블루프린트", "t.mkt.e": "크리에이터 마켓",
    "use.k": "사용처", "use.h": "벌고, 쓰고, 교환하기", "u.earn": "ARCL 벌기", "u.spend": "ARCL 쓰기", "u.arc": "$ARCIRCLE 쓰기",
    "e.surv": "<b>SURVIVORS ARENA</b> — 한 판에 최대 3,000", "e.kart": "<b>ARCIRCLE KART</b> — 순위별 500 / 350 / 250 / 150 / 100, 하루 5판, 하루 최대 2,500", "e.jump": "<b>COIN JUMP</b> — 하루 한 번 3,000", "e.def": "<b>AC DEFENSE</b> — 웨이브당 5, 하루 최대 150", "e.rings": "<b>INFINITY RINGS</b> — 새 별마다 100 (101–200레벨은 50)", "e.mine": "<b>ARCL MINE</b> — 바위 하나에 10~10,000", "e.jur": "<b>JURASSIC WORLD</b> — 일일 미션 3개, 각 300", "e.poker": "<b>POKER LOUNGE</b> — 일일 미션 3개 (승리 보상 아님)", "e.daily": "<b>매일</b> — 출석, 퀘스트, 사냥, 내 섬",
    "s.shop": "<b>상점</b> — 스타일, 포션, 아이템", "s.forge": "<b>대장간</b> — 장비 강화와 수리", "s.pick": "<b>곡괭이</b> — ARCL 광산의 상위 등급", "s.chips": "<b>포커 칩</b> — ARCL → 칩 (한 방향)", "s.mkt": "<b>크리에이터 마켓</b> — 다른 플레이어의 섬 블루프린트 구매", "s.swap": "<b>교환</b> — ARCL → $ARCIRCLE 신청",
    "a.shop": "<b>아이템 결제</b> — $ARCIRCLE로 결제, 절반은 소각·절반은 트레저리", "a.land": "<b>ARCIRCLE LAND</b> — 20개 마을 중 하나 구매", "a.swap": "<b>교환</b> — $ARCIRCLE → ARCL (구매한 ARCL은 크리에이터에게 지급될 수 있어요)", "a.pay": "<b>크리에이터 정산</b> — 정산된 판매 수익은 GM 본인 지갑에서 $ARCIRCLE로 지급", "a.hold": "<b>보유</b> — Arc의 내 지갑에",
    "flow.k": "어떻게 연결되나요", "flow.h": "플레이에서 체인까지",
    "fl.1": "플레이", "fl.1p": "게임, 퀘스트, 마을이 내 잔액에 ARCL을 지급해요.", "fl.2": "월드에서 사용", "fl.2p": "상점, 대장간, 곡괭이가 ARCL을 유통에서 빼내요.", "fl.3": "크리에이터와 거래", "fl.3p": "블루프린트는 ARCL로 팔려요: 14일 뒤 80%는 크리에이터, 20%는 플랫폼.", "fl.4": "교환", "fl.4p": "ARCL ⇄ $ARCIRCLE 신청, GM이 Arc에서 정산.", "fl.5": "소각", "fl.5p": "게임에서 결제한 $ARCIRCLE의 절반은 소각 — 영원히 사라져요.",
    "faq.k": "자주 묻는 질문", "faq.h": "알아두면 좋아요",
    "q1": "ARCL은 토큰인가요?", "a1": "아직은 아니에요. 지금 ARCL은 게임 서버가 관리하고 장부에 기록하는 게임 내 포인트예요. 토큰 출시가 예정되어 있고, 출시되면 이 페이지에서 알려드릴게요.",
    "q2": "ARCL과 $ARCIRCLE은 어떻게 교환하나요?", "a2": "게임에서 교환(하단 Exchange 버튼)을 열고 금액을 신청하세요. ARCL은 바로 묶이고, GM이 Arc에서 신청을 정산해요. $ARCIRCLE → ARCL은 반대로, 교환 데스크로 $ARCIRCLE을 보내고 거래 해시를 입력하면 돼요.",
    "q3": "\"소각\"은 무슨 뜻인가요?", "a3": "0x…dEaD 주소(또는 0 주소)로 보낸 $ARCIRCLE은 다시는 움직일 수 없어요. 여기의 발행량 수치는 체인에서 그 주소를 직접 읽어요.",
    "q4": "ARCL 합계는 왜 특정 날짜부터인가요?", "a4": "게임 장부는 시작된 날부터 모든 ARCL 이동을 기록해요. 그 이전 이동은 합산되지 않아 이 숫자에는 없어요.",
    "q5": "숫자는 어디서 오나요?", "a5": "$ARCIRCLE 수치는 Arc 체인에서, ARCL 수치는 게임 자체 장부에서 읽어요. 둘 다 1분 정도마다 새로고침돼요.",
    "q6": "예정된 $ARCL 수수료는 무엇인가요?", "a6": "ARCL이 토큰으로 출시되면 거래마다 2% 수수료가 계획되어 있어요: 1%는 $ARCIRCLE 바이백 & 소각, 1%는 ARCIRCLE WORLD 개발. 지금의 게임 내 ARCL에는 수수료가 없어요.",
    "cta.h": "지금 ARCL을 모아보세요", "cta.p": "폰과 PC에서 무료. 플레이하고, 짓고, 싸우며 — 숫자가 커지는 걸 지켜보세요.",
    "foot.fine": "ARCL은 게임 내 포인트입니다. 보상은 플레이에 대한 것이며 보장되지 않습니다. 이 페이지의 어떤 내용도 투자 조언이 아닙니다.",
    "k.vote": "소각 투표", "k.mine": "빌더 광산", "k.scanner": "토큰 스캐너", "k.secret": "ARCIA 비밀 파일", "k.desk": "ARCIA DESK", "k.agent": "ARCIA AGENT 금고", "k.orders": "Orders & Predict 수수료", "k.omni": "OMNI 보상", "k.buyback": "바이백", "k.team": "팀 & 트레저리", "k.wallet": "직접 소각", "k.pending": "분류 중",
    "g.daily": "출석 & 웰컴", "g.island": "섬 & 마을", "g.town": "마을 & RPG", "g.sell": "전리품 판매", "g.defense": "AC 디펜스", "g.mine": "ARCL 광산", "g.surv": "서바이버즈 아레나", "g.kart": "ARCIRCLE KART", "g.poker": "포커 미션", "g.rings": "인피니티 링즈", "g.jur": "쥬라기 월드", "g.jump": "코인 점프", "g.swapbuy": "$ARCIRCLE로 구매", "g.sale": "크리에이터 판매", "g.gm": "GM 보상", "g.other": "기타",
    "g.market": "크리에이터 마켓", "g.forge": "대장간", "g.pick": "곡괭이", "g.chips": "포커 칩", "g.shop": "상점 아이템", "g.swap": "교환 → $ARCIRCLE",
  };
  var ZH = {
    skip: "跳到正文", play: "免费游玩", "nav.world": "游戏世界", "nav.coins": "两种币", "nav.live": "实时数据", "nav.use": "用途", "nav.faq": "常见问题", "nav.pad": "平台世界",
    "hero.k": "ARCIRCLE WORLD 的币", "hero.p": "两种币，两种用途。$ARCIRCLE 是 Arc 链上的代币，ARCL 是你在游戏里赚取和花费的币。这里介绍它们各自的作用、用在哪里，以及实时数据。", "hero.live": "查看实时数据",
    "pair.k": "两种币，两种用途", "pair.h": "每种币是什么",
    "arc.tag": "Arc 链代币", "arc.p": "ARCIRCLE 的核心代币——Arc 主网上的 ERC-20。保存在你自己的钱包里；在游戏中用于购买物品和 LAND，并用于兑换结算。",
    "f.chain": "链", "f.supply": "供应量", "f.burn": "销毁", "f.ca": "合约", "f.earn": "赚取", "f.spend": "花费", "f.swap": "兑换", "f.next": "计划",
    "arc.chain": "Arc 主网（链 ID 5042）", "arc.supply": "一次性铸造 1,000,000,000 枚——合约没有增发功能", "arc.burn": "发送到 0x…dEaD 的币永久消失；每次销毁都记录在链上",
    "ca.copy": "复制", "ca.copied": "已复制！", "ca.view": "在 ArcScan 查看",
    "arcl.tag": "游戏内币", "arcl.p": "游戏自己的币。通过游玩赚取，在世界中花费。目前尚未作为代币上线——现在的 ARCL 是由游戏服务器管理的游戏内积分。",
    "arcl.earn": "8 款游戏、城镇、任务、你的岛屿", "arcl.spend": "商店、锻造、镐、扑克筹码、创作者市场", "arcl.swap": "在游戏中申请 ARCL ⇄ $ARCIRCLE 兑换，由 GM 逐笔结算", "arcl.next": "计划上线代币（Solana 或 Robinhood Chain）",
    "arcl.fee": "🔥 $ARCL 代币上线后的计划手续费：每笔交易 2% —— 1% 用于回购并销毁 $ARCIRCLE，1% 用于 ARCIRCLE WORLD 生态发展。目前游戏内 ARCL 不收手续费。",
    "live.k": "实时数据", "live.wait": "加载中…", "live.on": "实时", "live.off": "暂时无法读取",
    "arcN.h": "Arc 链上的 $ARCIRCLE", "arcN.p": "直接从 Arc 链读取：价格、持有人数，以及迄今销毁的每一枚币。",
    "t.price": "价格", "t.mcap": "市值", "t.holders": "持有人", "t.burned": "永久销毁", "t.burned.e": "占供应量 {p}", "t.circ": "流通量", "t.circ.e": "不含金库和质押", "t.bb": "金库回购", "t.bb.e": "{n} 次 · {t} $ARCIRCLE",
    "ch.supply": "10 亿枚在哪里", "ch.supply.p": "永久销毁、金库与质押持有，以及流通中的部分。", "s.burned": "已销毁", "s.held": "金库与质押", "s.circ": "流通中",
    "ch.burns": "按来源统计的 $ARCIRCLE 销毁", "ch.burns.p": "链上每一次销毁，按发起方分组。",
    "arclN.h": "游戏中的 ARCL", "arclN.p": "每一笔 ARCL 变动都记录在游戏账本中。以下是总计。", "arclN.since": "每一笔 ARCL 变动都记录在游戏账本中。自账本于 {d} 启用以来的总计。",
    "t.earned": "已发放 ARCL", "t.earned.e": "作为游玩奖励发放", "t.spent": "游戏内花费的 ARCL", "t.spent.e": "商店、锻造、市场——从余额中扣除", "t.sales": "创作者市场销售额", "t.sales.e": "平台分得 {p} ARCL（20%）",
    "t.sold": "ARCL → $ARCIRCLE", "t.sold.e": "已结算 {n} 笔 · 发出 {a} $ARCIRCLE", "t.bought": "$ARCIRCLE → ARCL", "t.bought.e": "已结算 {n} 笔 · 发放 {a} ARCL", "t.open": "等待中的兑换申请", "t.open.e": "由 GM 逐笔结算",
    "t.settled": "创作者结算", "t.settled.e": "以 $ARCIRCLE 结算给创作者的 ARCL",
    "ch.days": "每日 ARCL 发放与花费", "ch.days.p": "最近 30 天（韩国时间）。悬停或点按某天查看数字。", "ch.from": "ARCL 从哪里来", "ch.to": "ARCL 用到哪里", "ch.30": "最近 30 天",
    "c.earn": "发放", "c.spend": "花费", "c.table": "以表格显示", "c.day": "日期", "c.none": "尚未统计到变动——玩家开始游玩后会立即显示。", "c.na": "暂时无法读取这些数字。",
    "ig.k": "游戏中的 $ARCIRCLE", "ig.h": "在 ARCIRCLE WORLD 中支付、销毁与兑换", "ig.p": "玩家在游戏中用 $ARCIRCLE 做了什么：购买物品（每笔支付的一半被销毁）、购买 LAND 村庄，以及与 ARCL 的兑换。",
    "t.shop": "用 $ARCIRCLE 购买的物品", "t.shop.e": "支付 {a} $ARCIRCLE", "t.gburn": "通过游戏销毁", "t.gburn.e": "每笔游戏内支付的一半", "t.land": "ARCIRCLE LAND 村庄", "t.land.e": "{a} $ARCIRCLE 进入金库", "t.land.v": "已售 {n} / {m}", "t.mkt": "在售蓝图", "t.mkt.e": "创作者市场",
    "use.k": "用途", "use.h": "赚取、花费、兑换", "u.earn": "赚取 ARCL", "u.spend": "花费 ARCL", "u.arc": "使用 $ARCIRCLE",
    "e.surv": "<b>SURVIVORS ARENA</b> —— 每局最多 3,000", "e.kart": "<b>ARCIRCLE KART</b> —— 按名次 500 / 350 / 250 / 150 / 100，每天 5 场，每天最多 2,500", "e.jump": "<b>COIN JUMP</b> —— 每天一次 3,000", "e.def": "<b>AC DEFENSE</b> —— 每波 5，每天最多 150", "e.rings": "<b>INFINITY RINGS</b> —— 每颗新星 100（101–200 关为 50）", "e.mine": "<b>ARCL MINE</b> —— 每块岩石 10 到 10,000", "e.jur": "<b>JURASSIC WORLD</b> —— 3 个每日任务，各 300", "e.poker": "<b>POKER LOUNGE</b> —— 3 个每日任务（不奖励输赢）", "e.daily": "<b>每天</b> —— 签到、任务、狩猎、你的岛屿",
    "s.shop": "<b>商店</b> —— 外观、药水、物品", "s.forge": "<b>锻造</b> —— 强化与修理装备", "s.pick": "<b>镐</b> —— ARCL 矿场的高级镐", "s.chips": "<b>扑克筹码</b> —— ARCL → 筹码（单向）", "s.mkt": "<b>创作者市场</b> —— 购买其他玩家的岛屿蓝图", "s.swap": "<b>兑换</b> —— 申请 ARCL → $ARCIRCLE",
    "a.shop": "<b>购买物品</b> —— 用 $ARCIRCLE 支付，一半销毁、一半进入金库", "a.land": "<b>ARCIRCLE LAND</b> —— 购买 20 个村庄之一", "a.swap": "<b>兑换</b> —— $ARCIRCLE → ARCL（购买的 ARCL 可支付给创作者）", "a.pay": "<b>创作者结算</b> —— 已结算的销售额由 GM 本人钱包以 $ARCIRCLE 支付", "a.hold": "<b>持有</b> —— 在 Arc 上你自己的钱包里",
    "flow.k": "它们如何连接", "flow.h": "从游玩到链上",
    "fl.1": "游玩", "fl.1p": "游戏、任务和城镇向你的余额发放 ARCL。", "fl.2": "在世界中花费", "fl.2p": "商店、锻造和镐让 ARCL 退出流通。", "fl.3": "与创作者交易", "fl.3p": "蓝图以 ARCL 出售：14 天后 80% 归创作者，20% 归平台。", "fl.4": "兑换", "fl.4p": "申请 ARCL ⇄ $ARCIRCLE，由 GM 在 Arc 上结算。", "fl.5": "销毁", "fl.5p": "游戏中支付的 $ARCIRCLE 一半被销毁——永久消失。",
    "faq.k": "常见问题", "faq.h": "值得了解",
    "q1": "ARCL 是代币吗？", "a1": "还不是。目前 ARCL 是由游戏服务器管理并记录在账本中的游戏内积分。代币上线已在计划中，上线时本页会说明。",
    "q2": "如何兑换 ARCL 和 $ARCIRCLE？", "a2": "在游戏中打开兑换（底部的 Exchange 按钮），申请金额。ARCL 会立即冻结，由 GM 在 Arc 上结算。$ARCIRCLE → ARCL 则相反：把 $ARCIRCLE 发送到兑换台并提交交易哈希。",
    "q3": "“销毁”是什么意思？", "a3": "发送到 0x…dEaD 地址（或零地址）的 $ARCIRCLE 再也无法转移。这里的供应量直接从链上读取该地址。",
    "q4": "为什么 ARCL 总计从某个日期开始？", "a4": "游戏账本从启用之日起记录每一笔 ARCL 变动。此前的变动没有汇总，因此不在这些数字中。",
    "q5": "这些数字来自哪里？", "a5": "$ARCIRCLE 的数据从 Arc 链读取，ARCL 的数据来自游戏自己的账本。两者大约每分钟刷新一次。",
    "q6": "计划中的 $ARCL 手续费是什么？", "a6": "ARCL 作为代币上线后，计划对每笔交易收取 2% 手续费：1% 用于回购并销毁 $ARCIRCLE，1% 用于 ARCIRCLE WORLD 发展。目前游戏内 ARCL 不收手续费。",
    "cta.h": "开始赚取 ARCL", "cta.p": "手机和电脑免费。游玩、建造、战斗——看着数字增长。",
    "foot.fine": "ARCL 是游戏内积分。奖励针对游玩，并不保证。本页内容均不构成投资建议。",
    "k.vote": "销毁投票", "k.mine": "建造者矿场", "k.scanner": "代币扫描器", "k.secret": "ARCIA 秘密文件", "k.desk": "ARCIA DESK", "k.agent": "ARCIA AGENT 金库", "k.orders": "Orders 与 Predict 手续费", "k.omni": "OMNI 奖励", "k.buyback": "回购", "k.team": "团队与金库", "k.wallet": "直接销毁", "k.pending": "分类中",
    "g.daily": "签到与欢迎", "g.island": "岛屿与村庄", "g.town": "城镇与 RPG", "g.sell": "出售战利品", "g.defense": "AC 塔防", "g.mine": "ARCL 矿场", "g.surv": "幸存者竞技场", "g.kart": "ARCIRCLE KART", "g.poker": "扑克任务", "g.rings": "无限之环", "g.jur": "侏罗纪世界", "g.jump": "金币跳跃", "g.swapbuy": "用 $ARCIRCLE 购买", "g.sale": "创作者销售", "g.gm": "GM 奖励", "g.other": "其他",
    "g.market": "创作者市场", "g.forge": "锻造", "g.pick": "镐", "g.chips": "扑克筹码", "g.shop": "商店物品", "g.swap": "兑换 → $ARCIRCLE",
  };
  var TR = {
    skip: "İçeriğe geç", play: "Ücretsiz oyna", "nav.world": "Oyun Dünyası", "nav.coins": "Coinler", "nav.live": "Canlı veriler", "nav.use": "Nerede kullanılır", "nav.faq": "Sorular", "nav.pad": "Platform Dünyası",
    "hero.k": "ARCIRCLE WORLD'ün coinleri", "hero.p": "İki coin, iki görev. $ARCIRCLE, Arc üzerindeki token. ARCL ise oyunda kazanıp harcadığın coin. Her birinin ne yaptığı, nerede kullanıldığı ve canlı veriler burada.", "hero.live": "Canlı verileri gör",
    "pair.k": "İki coin, iki görev", "pair.h": "Her coin nedir",
    "arc.tag": "Arc üzerinde token", "arc.p": "ARCIRCLE'ın ana tokenı — Arc ana ağında bir ERC-20. Kendi cüzdanında tutarsın; oyunda eşyalar ve LAND için ödeme yapar, takası sonuçlandırır.",
    "f.chain": "Zincir", "f.supply": "Arz", "f.burn": "Yakım", "f.ca": "Sözleşme", "f.earn": "Kazan", "f.spend": "Harca", "f.swap": "Takas", "f.next": "Sırada",
    "arc.chain": "Arc ana ağı (zincir kimliği 5042)", "arc.supply": "1.000.000.000 bir kez basıldı — sözleşmede basım işlevi yok", "arc.burn": "0x…dEaD adresine gönderilen coinler sonsuza dek gider; her yakım zincirde",
    "ca.copy": "Kopyala", "ca.copied": "Kopyalandı!", "ca.view": "ArcScan'de gör",
    "arcl.tag": "Oyun içi coin", "arcl.p": "Oyunun kendi coini. Oynayarak kazanır, dünyada harcarsın. Henüz token olarak çıkmadı — bugün ARCL, oyunun sunucusunda tutulan oyun içi puanlar.",
    "arcl.earn": "8 oyun, kasaba, görevler, adan", "arcl.spend": "Mağaza, demirci, kazmalar, poker fişleri, Yaratıcı Pazarı", "arcl.swap": "Oyunda istekle ARCL ⇄ $ARCIRCLE; her birini bir GM sonuçlandırır", "arcl.next": "Token çıkışı planlanıyor (Solana veya Robinhood Chain)",
    "arcl.fee": "🔥 Planlanan $ARCL token ücreti: işlem başına %2 — %1 $ARCIRCLE geri alım ve yakım, %1 ARCIRCLE WORLD ekosistem geliştirme. Bugünkü oyun içi ARCL'de ücret yok.",
    "live.k": "Canlı veriler", "live.wait": "Yükleniyor…", "live.on": "Canlı", "live.off": "Şu an okunamıyor",
    "arcN.h": "Arc üzerinde $ARCIRCLE", "arcN.p": "Arc zincirinden okunur: fiyat, kaç kişinin tuttuğu ve şimdiye kadar yakılan her coin.",
    "t.price": "Fiyat", "t.mcap": "Piyasa değeri", "t.holders": "Sahipler", "t.burned": "Kalıcı olarak yakıldı", "t.burned.e": "arzın {p} kadarı", "t.circ": "Dolaşımda", "t.circ.e": "hazine ve stake dışında", "t.bb": "Hazine geri alımları", "t.bb.e": "{n} alım · {t} $ARCIRCLE",
    "ch.supply": "1.000.000.000 nerede", "ch.supply.p": "Kalıcı olarak yakılan, hazine ve stake'te tutulan ve dolaşımdaki miktar.", "s.burned": "Yakıldı", "s.held": "Hazine & stake", "s.circ": "Dolaşımda",
    "ch.burns": "Kaynağa göre yakılan $ARCIRCLE", "ch.burns.p": "Zincirdeki her yakım, gönderene göre gruplanmış.",
    "arclN.h": "Oyunda ARCL", "arclN.p": "Her ARCL hareketi oyunun defterine yazılır. Toplamlar bunlar.", "arclN.since": "Her ARCL hareketi oyunun defterine yazılır. Defterin başladığı {d} tarihinden beri toplamlar.",
    "t.earned": "Kazanılan ARCL", "t.earned.e": "oyun için ödendi", "t.spent": "Oyunda harcanan ARCL", "t.spent.e": "mağaza, demirci, pazar — bakiyelerden çıktı", "t.sales": "Yaratıcı Pazarı satışları", "t.sales.e": "platforma {p} ARCL (%20)",
    "t.sold": "ARCL → $ARCIRCLE", "t.sold.e": "{n} sonuçlandı · {a} $ARCIRCLE gönderildi", "t.bought": "$ARCIRCLE → ARCL", "t.bought.e": "{n} sonuçlandı · {a} ARCL yüklendi", "t.open": "Bekleyen takas istekleri", "t.open.e": "her birini bir GM sonuçlandırır",
    "t.settled": "Yaratıcı ödemeleri", "t.settled.e": "yaratıcılara $ARCIRCLE ile ödenen ARCL",
    "ch.days": "Gün gün kazanılan ve harcanan ARCL", "ch.days.p": "Son 30 gün (Kore saati). Rakamlar için bir günün üzerine gel veya dokun.", "ch.from": "ARCL nereden geliyor", "ch.to": "ARCL nereye gidiyor", "ch.30": "Son 30 gün",
    "c.earn": "Kazanılan", "c.spend": "Harcanan", "c.table": "Rakamları tablo olarak göster", "c.day": "Gün", "c.none": "Henüz sayılan hareket yok — oyuncular oynamaya başlar başlamaz burada görünür.", "c.na": "Bu rakamlar şu an okunamıyor.",
    "ig.k": "Oyunda $ARCIRCLE", "ig.h": "ARCIRCLE WORLD'de ödenen, yakılan ve takas edilen", "ig.p": "Oyuncuların oyun içinde $ARCIRCLE ile yaptıkları: ödenen eşyalar (her ödemenin yarısı yakılır), alınan LAND köyleri ve ARCL ile takas.",
    "t.shop": "$ARCIRCLE ile ödenen eşyalar", "t.shop.e": "{a} $ARCIRCLE ödendi", "t.gburn": "Oyun üzerinden yakılan", "t.gburn.e": "her oyun içi ödemenin yarısı", "t.land": "ARCIRCLE LAND köyleri", "t.land.e": "hazineye {a} $ARCIRCLE", "t.land.v": "{m} köyden {n} satıldı", "t.mkt": "Satıştaki planlar", "t.mkt.e": "Yaratıcı Pazarı'nda",
    "use.k": "Nerede kullanılır", "use.h": "Kazan, harca, takas et", "u.earn": "ARCL kazan", "u.spend": "ARCL harca", "u.arc": "$ARCIRCLE kullan",
    "e.surv": "<b>SURVIVORS ARENA</b> — bir oyunda en fazla 3.000", "e.kart": "<b>ARCIRCLE KART</b> — sıraya göre 500 / 350 / 250 / 150 / 100, günde 5 yarış, günde en fazla 2.500", "e.jump": "<b>COIN JUMP</b> — günde bir kez 3.000", "e.def": "<b>AC DEFENSE</b> — dalga başına 5, günde en fazla 150", "e.rings": "<b>INFINITY RINGS</b> — yeni yıldız başına 100 (101–200 seviyeleri 50)", "e.mine": "<b>ARCL MINE</b> — kaya başına 10 ile 10.000", "e.jur": "<b>JURASSIC WORLD</b> — 3 günlük görev, her biri 300", "e.poker": "<b>POKER LOUNGE</b> — 3 günlük görev (kazanmak için asla değil)", "e.daily": "<b>Her gün</b> — giriş, görevler, avlar, adan",
    "s.shop": "<b>Mağaza</b> — stiller, iksirler, eşyalar", "s.forge": "<b>Demirci</b> — ekipmanını güçlendir ve onar", "s.pick": "<b>Kazmalar</b> — ARCL Madeni'nde daha iyi seviyeler", "s.chips": "<b>Poker fişleri</b> — ARCL → fiş, tek yön", "s.mkt": "<b>Yaratıcı Pazarı</b> — oyunculardan ada planları al", "s.swap": "<b>Takas</b> — istekle ARCL → $ARCIRCLE",
    "a.shop": "<b>Eşya öde</b> — $ARCIRCLE ile; yarısı yakılır, yarısı hazineye", "a.land": "<b>ARCIRCLE LAND</b> — 20 köyden birini al", "a.swap": "<b>Takas</b> — $ARCIRCLE → ARCL (satın alınan ARCL yaratıcılara ödeyebilir)", "a.pay": "<b>Yaratıcı ödemeleri</b> — sonuçlanan satışlar bir GM'in kendi cüzdanından $ARCIRCLE ile ödenir", "a.hold": "<b>Tut</b> — Arc'taki kendi cüzdanında",
    "flow.k": "Nasıl bağlanırlar", "flow.h": "Oyundan zincire",
    "fl.1": "Oyna", "fl.1p": "Oyunlar, görevler ve kasaba bakiyene ARCL öder.", "fl.2": "Dünyada harca", "fl.2p": "Mağaza, demirci ve kazmalar ARCL'yi dolaşımdan çıkarır.", "fl.3": "Yaratıcılarla ticaret", "fl.3p": "Planlar ARCL ile satılır: 14 gün sonra %80 yaratıcıya, %20 platforma.", "fl.4": "Takas", "fl.4p": "İstekle ARCL ⇄ $ARCIRCLE; bir GM Arc'ta sonuçlandırır.", "fl.5": "Yak", "fl.5p": "Oyunda ödenen $ARCIRCLE'ın yarısı yakılır — sonsuza dek gider.",
    "faq.k": "Sorular", "faq.h": "Bilmekte fayda var",
    "q1": "ARCL bir token mı?", "a1": "Henüz değil. Bugün ARCL, oyunun sunucusunda tutulan ve defterine yazılan oyun içi puanlar. Bir token çıkışı planlanıyor; olduğunda bu sayfa söyleyecek.",
    "q2": "ARCL ve $ARCIRCLE'ı nasıl takas ederim?", "a2": "Oyunda Takas'ı aç (alt çubuktaki Exchange düğmesi). Bir miktar iste; ARCL hemen tutulur ve bir GM isteği Arc'ta sonuçlandırır. $ARCIRCLE → ARCL tersine çalışır: $ARCIRCLE'ı takas masasına gönderir ve işlemi girersin.",
    "q3": "\"Yakıldı\" ne demek?", "a3": "0x…dEaD adresine (veya sıfır adresine) gönderilen $ARCIRCLE bir daha hareket edemez. Buradaki arz sayacı bu adresi doğrudan zincirden okur.",
    "q4": "ARCL toplamları neden bir tarihten başlıyor?", "a4": "Oyunun defteri başladığı günden itibaren her ARCL hareketini yazar. Öncesindeki hareketler toplanmadı, bu yüzden bu rakamlarda yoklar.",
    "q5": "Rakamlar nereden geliyor?", "a5": "$ARCIRCLE'ın rakamları Arc zincirinden okunur. ARCL'ninkiler oyunun kendi defterinden gelir. İkisi de yaklaşık her dakika yenilenir.",
    "q6": "Planlanan $ARCL ücreti nedir?", "a6": "ARCL token olarak çıktığında plan, her işlemde %2 ücret: %1 $ARCIRCLE geri alım ve yakım, %1 ARCIRCLE WORLD geliştirme. Bugünkü oyun içi ARCL'de ücret yok.",
    "cta.h": "ARCL kazanmaya başla", "cta.p": "Telefonda ve PC'de ücretsiz. Oyna, inşa et, savaş — ve rakamların büyümesini izle.",
    "foot.fine": "ARCL oyun içi puanlardır. Ödüller oyun içindir ve asla garanti edilmez. Bu sayfadaki hiçbir şey yatırım tavsiyesi değildir.",
    "k.vote": "Yakarak oy", "k.mine": "Builder Mine", "k.scanner": "Token Tarayıcı", "k.secret": "ARCIA'nın gizli dosyası", "k.desk": "ARCIA DESK", "k.agent": "ARCIA AGENT kasaları", "k.orders": "Orders & Predict ücretleri", "k.omni": "OMNI ödülleri", "k.buyback": "Geri alım", "k.team": "Ekip & hazine", "k.wallet": "Doğrudan yakım", "k.pending": "Etiketleniyor",
    "g.daily": "Günlük & hoş geldin", "g.island": "Ada & köy", "g.town": "Kasaba & RPG", "g.sell": "Ganimet satışı", "g.defense": "AC Defense", "g.mine": "ARCL Madeni", "g.surv": "Survivors Arena", "g.kart": "ARCIRCLE KART", "g.poker": "Poker görevleri", "g.rings": "Infinity Rings", "g.jur": "Jurassic World", "g.jump": "Coin Jump", "g.swapbuy": "$ARCIRCLE ile alındı", "g.sale": "Yaratıcı satışları", "g.gm": "GM ödülleri", "g.other": "Diğer",
    "g.market": "Yaratıcı Pazarı", "g.forge": "Demirci", "g.pick": "Kazmalar", "g.chips": "Poker fişleri", "g.shop": "Mağaza eşyaları", "g.swap": "Takas → $ARCIRCLE",
  };
  var LANGS = { en: EN, ko: KO, zh: ZH, tr: TR }, KEY = "arc.gw.lang", lang = "en";
  try { var q = new URLSearchParams(location.search).get("lang"); lang = LANGS[q] ? q : LANGS[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : "en"; } catch (e) { lang = "en"; }
  var t = function (k, v) { var D = LANGS[lang] || EN, s = D[k] != null ? D[k] : EN[k] != null ? EN[k] : k; return v ? String(s).replace(/\{(\w+)\}/g, function (_, x) { return v[x] != null ? v[x] : ""; }) : s; };
  var LOC = { en: "en-US", ko: "ko-KR", zh: "zh-CN", tr: "tr-TR" };
  var full = function (n) { return n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString(LOC[lang]); };
  var num = function (n) { if (n == null || !isFinite(n)) return "—"; var a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(2) + "B" : a >= 1e6 ? (n / 1e6).toFixed(2) + "M" : a >= 1e4 ? (n / 1e3).toFixed(1) + "K" : full(n); };
  var usd = function (n) { if (n == null || !isFinite(n)) return "—"; return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
  var price = function (n) { if (n == null || !isFinite(n)) return "—"; if (n >= 1) return "$" + n.toFixed(4); var s = n.toPrecision(3); return "$" + (Number(s) < 1e-6 ? Number(s).toExponential(2) : Number(s).toFixed(Math.min(12, 2 - Math.floor(Math.log10(n))))); };
  var pct = function (n) { return n == null || !isFinite(n) ? "—" : (n < 0.01 && n > 0 ? "<0.01" : n.toFixed(2)) + "%"; };

  // ---------------- the words on the page ----------------
  var data = { supply: null, token: null, coins: null };
  function paintWords() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i]").forEach(function (el) { var k = el.getAttribute("data-i"), v = t(k); if (/<b>/.test(v)) el.innerHTML = v; else el.textContent = v; });
    var now = $("#cn-lang-now"); if (now) now.textContent = lang.toUpperCase();
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-lang") === lang); });
    paintUse(); paintFlow(); paintFaq(); paintAll();
  }
  function paintUse() {
    var col = function (icon, h, rows) { return '<article class="cn-card"><h3>' + icon + esc(t(h)) + '</h3><ul class="cn-list">' + rows.map(function (r) { return "<li><i>" + r[0] + "</i><span>" + t(r[1]) + "</span></li>"; }).join("") + "</ul></article>"; };
    $("#cn-use").innerHTML =
      col('<img src="/images/arcl2-64.png" alt="">', "u.earn", [["⚔️", "e.surv"], ["🏎️", "e.kart"], ["🪙", "e.jump"], ["🛡️", "e.def"], ["⭕", "e.rings"], ["⛏️", "e.mine"], ["🦖", "e.jur"], ["🃏", "e.poker"], ["📅", "e.daily"]]) +
      col('<img src="/images/arcl2-64.png" alt="">', "u.spend", [["🛍️", "s.shop"], ["🔨", "s.forge"], ["⛏️", "s.pick"], ["🎰", "s.chips"], ["🏗️", "s.mkt"], ["🔁", "s.swap"]]) +
      col('<img src="/images/arcircle-mark-sm.webp" alt="">', "u.arc", [["🔥", "a.shop"], ["🏘️", "a.land"], ["🔁", "a.swap"], ["💠", "a.pay"], ["👛", "a.hold"]]);
  }
  function paintFlow() { $("#cn-flow").innerHTML = [1, 2, 3, 4, 5].map(function (i) { return "<li><b>" + esc(t("fl." + i)) + "</b>" + esc(t("fl." + i + "p")) + "</li>"; }).join(""); }
  function paintFaq() { $("#cn-faq").innerHTML = [1, 2, 3, 4, 5, 6].map(function (i) { return "<details><summary>" + esc(t("q" + i)) + "</summary><p>" + esc(t("a" + i)) + "</p></details>"; }).join(""); }

  // ---------------- the numbers ----------------
  var tile = function (label, value, extra, cls, title) { return '<div class="cn-tile' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + esc(title) + '"' : "") + "><small>" + esc(label) + "</small><b>" + esc(value) + "</b>" + (extra ? "<em>" + esc(extra) + "</em>" : "") + "</div>"; };
  var liveChip = function (id, ok) { var el = $(id); if (!el) return; el.classList.toggle("off", !ok); el.querySelector("span").textContent = ok === null ? t("live.wait") : ok ? t("live.on") : t("live.off"); };
  function paintArc() {
    var S = data.supply, K = data.token, B = (K && K.burned) || {};
    liveChip("#cn-live-arc", S === null && K === null ? null : !!(S || K));
    var burned = S ? S.burned : B.tokens, max = S ? S.max : 1e9;
    $("#cn-arc-tiles").innerHTML =
      tile(t("t.price"), K && K.live ? price(K.price) : "—", K && K.change24h != null ? (K.change24h >= 0 ? "▲ " : "▼ ") + Math.abs(K.change24h).toFixed(2) + "% · 24h" : "") +
      tile(t("t.mcap"), K && K.live ? usd(K.mcap) : "—", "") +
      tile(t("t.holders"), K && K.holders != null ? full(K.holders) : "—", "") +
      tile(t("t.burned"), num(burned), burned != null ? t("t.burned.e", { p: pct(burned / max * 100) }) : "", "hot", burned != null ? full(burned) + " $ARCIRCLE" : "") +
      tile(t("t.circ"), S ? num(S.circulating) : "—", t("t.circ.e"), "", S ? full(S.circulating) : "") +
      tile(t("t.bb"), K && K.buybacks ? usd(K.buybacks.usdc) : "—", K && K.buybacks ? t("t.bb.e", { n: full(K.buybacks.n), t: num(K.buybacks.tokens) }) : "");
    // the supply, in one bar: burned · the treasury and staking · out in circulation
    var sup = $("#cn-supply");
    if (S) { var held = Math.max(0, S.total - S.circulating), parts = [[t("s.burned"), S.burned, C2], [t("s.held"), held, C1], [t("s.circ"), S.circulating, C3]];
      sup.innerHTML = '<ul class="cn-legend">' + parts.map(function (p) { return '<li style="--c:' + p[2] + '"><i></i>' + esc(p[0]) + "</li>"; }).join("") + "</ul>" +
        '<div class="cn-stack" role="img" aria-label="' + esc(parts.map(function (p) { return p[0] + " " + pct(p[1] / S.max * 100); }).join(", ")) + '">' + parts.map(function (p) { return '<s style="--c:' + p[2] + ";flex:" + Math.max(p[1], S.max * 0.004) + '" data-tip="' + esc(p[0]) + "|" + full(p[1]) + " · " + pct(p[1] / S.max * 100) + '"></s>'; }).join("") + "</div>" +
        '<div class="cn-bars">' + parts.map(function (p) { return '<div class="cn-bar" style="--c:' + p[2] + '"><span>' + esc(p[0]) + "</span><s style=\"width:" + Math.max(0.5, p[1] / S.max * 100).toFixed(2) + '%"></s><em>' + num(p[1]) + " · " + pct(p[1] / S.max * 100) + "</em></div>"; }).join("") + "</div>"; }
    else sup.innerHTML = '<p class="cn-empty">' + esc(S === null ? t("live.wait") : t("c.na")) + "</p>";
    var by = B.bySource ? Object.keys(B.bySource).map(function (k) { return { label: t("k." + k) !== "k." + k ? t("k." + k) : k, v: B.bySource[k].tokens, n: B.bySource[k].n }; }) : null;
    hbars($("#cn-burns"), by, C2, K === null);
  }
  var grp = function (dir, k) {
    var E = { daily: "daily", hold: "daily", launch: "daily", welcome: "daily", stamp: "daily", isle20: "island", isle100: "island", isle300: "island", res1: "island", res5: "island", vill2: "island", vquest9: "island", liked1: "island", liked10: "island", liked50: "island", vwin: "island",
      street: "town", pickup: "town", hunt: "town", boss: "town", heart: "town", raid: "town", bounty: "town", party: "town", sell: "sell", defense: "defense", defweek: "defense", mine: "mine", surv: "surv", kart: "kart", poker: "poker", poker_fest: "poker", rings: "rings", jur: "jur", jump: "jump", swap_buy: "swapbuy", market_sale: "sale", gm: "gm" };
    var S = { market: "market", forge: "forge", mine: "pick", mine_up: "pick", pick: "pick", chips: "chips", poker: "chips", swap: "swap" };
    return dir === "earn" ? E[k] || "other" : S[k] || "shop";
  };
  function paintArcl() {
    var C = data.coins, A = C && C.arcl, X = C && C.swap;
    liveChip("#cn-live-arcl", C === null ? null : !!C);
    $("#cn-arcl-lead").textContent = A && A.since ? t("arclN.since", { d: A.since }) : t("arclN.p");
    $("#cn-arcl-tiles").innerHTML =
      tile(t("t.earned"), A ? num(A.all.earned) : "—", t("t.earned.e"), "cy", A ? full(A.all.earned) : "") +
      tile(t("t.spent"), A ? num(A.all.spent) : "—", t("t.spent.e"), "hot", A ? full(A.all.spent) : "") +
      tile(t("t.sales"), A ? num(A.all.sales) : "—", A ? t("t.sales.e", { p: num(A.all.platform) }) : "") +
      tile(t("t.settled"), A ? num(A.all.settled) : "—", t("t.settled.e")) +
      tile(t("t.sold"), X ? num(X.sold.arcl) + " ARCL" : "—", X ? t("t.sold.e", { n: full(X.sold.n), a: num(X.sold.arc) }) : "") +
      tile(t("t.bought"), X ? num(X.bought.arc) + " $ARCIRCLE" : "—", X ? t("t.bought.e", { n: full(X.bought.n), a: num(X.bought.arcl) }) : "") +
      tile(t("t.open"), X ? full(X.open) : "—", t("t.open.e"));
    days($("#cn-days"), A ? A.days : null, C === null);
    var fold = function (dir, o) { if (!o) return null; var m = {}; Object.keys(o).forEach(function (k) { var g = grp(dir, k); m[g] = (m[g] || 0) + o[k]; }); return Object.keys(m).map(function (g) { return { label: t("g." + g), v: m[g] }; }); };
    hbars($("#cn-from"), A ? fold("earn", A.earn) : null, C1, C === null);
    hbars($("#cn-to"), A ? fold("spend", A.spend) : null, C2, C === null);
    var S = C && C.shop, L = C && C.land, M = C && C.market;
    $("#cn-ig-tiles").innerHTML =
      tile(t("t.shop"), S ? full(S.paid) : "—", S ? t("t.shop.e", { a: num(S.arc) }) : "") +
      tile(t("t.gburn"), S ? num(S.burned) + " $ARCIRCLE" : "—", t("t.gburn.e"), "hot") +
      tile(t("t.land"), L ? t("t.land.v", { n: L.sold, m: L.of }) : "—", L ? t("t.land.e", { a: num(L.arc) }) : "") +
      tile(t("t.mkt"), M ? full(M.listings) : "—", t("t.mkt.e"));
  }
  function paintAll() { paintArc(); paintArcl(); }

  // ---------------- the charts ----------------
  // one series of horizontal bars, largest first (identity by the title; the value at each bar's end; a tip on hover)
  function hbars(el, rows, color, loading) {
    if (!rows) { el.innerHTML = '<p class="cn-empty">' + esc(loading ? t("live.wait") : t("c.na")) + "</p>"; return; }
    rows = rows.filter(function (r) { return r.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (!rows.length) { el.innerHTML = '<p class="cn-empty">' + esc(t("c.none")) + "</p>"; return; }
    var top = rows.slice(0, 8), rest = rows.slice(8).reduce(function (s, r) { return s + r.v; }, 0); if (rest > 0) top.push({ label: t("g.other"), v: rest });
    var max = top[0].v, sum = rows.reduce(function (s, r) { return s + r.v; }, 0);
    el.innerHTML = '<div class="cn-bars">' + top.map(function (r) { return '<div class="cn-bar" style="--c:' + color + '" data-tip="' + esc(r.label) + "|" + full(r.v) + " · " + pct(r.v / sum * 100) + '"><span>' + esc(r.label) + '</span><s style="width:' + Math.max(1, r.v / max * 100).toFixed(1) + '%"></s><em>' + num(r.v) + "</em></div>"; }).join("") + "</div>";
  }
  // ARCL earned and spent a day: two series side by side, the oldest day on the left; a legend, and a table
  function days(el, list, loading) {
    if (!list) { el.innerHTML = '<p class="cn-empty">' + esc(loading ? t("live.wait") : t("c.na")) + "</p>"; return; }
    var d = list.slice().reverse(), max = d.reduce(function (m, x) { return Math.max(m, x.earn, x.spend); }, 0);
    if (!max) { el.innerHTML = '<p class="cn-empty">' + esc(t("c.none")) + "</p>"; return; }
    var W = 760, H = 240, L = 44, R = 6, T0 = 10, B0 = 24, pw = W - L - R, ph = H - T0 - B0, n = d.length, gw = pw / n, bw = Math.max(2, Math.min(12, (gw - 4) / 2 - 1));
    var nice = function (v) { var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }, top = nice(max), y = function (v) { return T0 + ph - (v / top) * ph; };
    var bar = function (x, v, c) { if (v <= 0) return ""; var h = Math.max(1.5, (v / top) * ph), yy = T0 + ph - h, r = Math.min(4, bw / 2, h); return '<path fill="' + c + '" d="M' + x + "," + (T0 + ph) + "V" + (yy + r) + "q0,-" + r + " " + r + ",-" + r + "h" + (bw - 2 * r) + "q" + r + ",0 " + r + "," + r + "V" + (T0 + ph) + 'Z"/>'; };
    var g = "";
    for (var i = 0; i <= 4; i++) { var v = top * i / 4, yy = y(v); g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text x="' + (L - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + num(v) + "</text>"; }
    d.forEach(function (x, i) { var x0 = L + i * gw + (gw - (2 * bw + 2)) / 2; g += bar(x0, x.earn, C1) + bar(x0 + bw + 2, x.spend, C2);
      if (i % Math.ceil(n / 6) === 0 || i === n - 1) g += '<text x="' + (L + i * gw + gw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + x.day.slice(5) + "</text>";
      g += '<rect class="hit" x="' + (L + i * gw) + '" y="' + T0 + '" width="' + gw + '" height="' + ph + '" data-tip="' + esc(x.day) + "|" + t("c.earn") + ":" + C1 + ":" + full(x.earn) + "|" + t("c.spend") + ":" + C2 + ":" + full(x.spend) + '"/>'; });
    el.innerHTML = '<ul class="cn-legend"><li style="--c:' + C1 + '"><i></i>' + esc(t("c.earn")) + '</li><li style="--c:' + C2 + '"><i></i>' + esc(t("c.spend")) + "</li></ul>" +
      '<svg class="cn-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(t("ch.days")) + '">' + g + "</svg>" +
      '<details class="cn-table"><summary>' + esc(t("c.table")) + "</summary><table><thead><tr><th>" + esc(t("c.day")) + "</th><th>" + esc(t("c.earn")) + "</th><th>" + esc(t("c.spend")) + "</th></tr></thead><tbody>" +
      list.map(function (x) { return "<tr><td>" + esc(x.day) + "</td><td>" + full(x.earn) + "</td><td>" + full(x.spend) + "</td></tr>"; }).join("") + "</tbody></table></details>";
  }
  // the tip: "title|label:color:value|…" or "title|text"
  var tip = $("#cn-tip"), tipOn = null;
  function showTip(el, e) {
    var parts = String(el.getAttribute("data-tip")).split("|"), h = "<b>" + esc(parts[0]) + "</b>";
    for (var i = 1; i < parts.length; i++) { var p = parts[i].split(":"); h += p.length === 3 ? '<span style="--c:' + p[1] + '"><i></i>' + esc(p[0]) + "<em>" + esc(p[2]) + "</em></span>" : "<span><em>" + esc(parts[i]) + "</em></span>"; }
    tip.innerHTML = h; tip.hidden = false; if (tipOn && tipOn !== el) tipOn.classList.remove("on"); tipOn = el; el.classList.add("on");
    var x = e.clientX, yy = e.clientY, w = tip.offsetWidth, hh = tip.offsetHeight; tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 14)) + "px"; tip.style.top = Math.max(8, yy - hh - 12) + "px";
  }
  function hideTip() { tip.hidden = true; if (tipOn) tipOn.classList.remove("on"); tipOn = null; }
  document.addEventListener("pointermove", function (e) { var el = e.target.closest && e.target.closest("[data-tip]"); if (el) showTip(el, e); else if (!tip.hidden && e.pointerType === "mouse") hideTip(); });
  document.addEventListener("pointerdown", function (e) { var el = e.target.closest && e.target.closest("[data-tip]"); if (el) showTip(el, e); else hideTip(); });
  addEventListener("scroll", function () { if (!tip.hidden) hideTip(); }, { passive: true });

  // ---------------- reading the numbers ----------------
  var get = function (q) { return fetch("/api/social?" + q, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : false; }).catch(function () { return false; }); };
  function load() {
    get("supply=arcircle").then(function (j) { data.supply = j && j.max ? j : false; paintArc(); });
    get("token=arcircle").then(function (j) { data.token = j && !j.error ? j : false; paintArc(); });
    get("world=coins").then(function (j) { data.coins = j && j.arcl ? j : false; paintArcl(); });
  }

  // ---------------- the language and the copy button ----------------
  var menu = $(".gw-lang-menu"), globe = $(".gw-globe");
  if (globe) globe.addEventListener("click", function () { var open = menu.hidden; menu.hidden = !open; globe.setAttribute("aria-expanded", String(open)); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lang]"); if (b) { lang = b.getAttribute("data-lang"); try { localStorage.setItem(KEY, lang); } catch (x) { /* private mode */ } if (menu) menu.hidden = true; paintWords(); return; }
    if (menu && !menu.hidden && !e.target.closest(".gw-lang")) menu.hidden = true;
  });
  var copy = $("#cn-ca-copy");
  if (copy) copy.addEventListener("click", function () { var ca = $("#cn-ca").textContent; (navigator.clipboard ? navigator.clipboard.writeText(ca) : Promise.reject()).then(function () { copy.textContent = t("ca.copied"); setTimeout(function () { copy.textContent = t("ca.copy"); }, 1600); }).catch(function () {}); });

  paintWords(); load(); setInterval(function () { if (!document.hidden) load(); }, 60e3);
})();
