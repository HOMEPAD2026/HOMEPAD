// arcl.js — /arcl (arcl.html, 2026-11-03): the ARCL coin's launch page — the countdown to the launch on Robinhood Chain
// (arcl-launch-data.js: window.ARC_ARCL — the time, the 30-minute delay window, the official links, the contract once
// it's posted), what ARCL is, the 2% fee, where to earn it, the exchange, what it buys, the road, safety, FAQ.
// The amounts are the servers' own (api/_world-shop.mjs EARN / CATALOG, api/_world-swap.mjs SWAP, the games' api files):
// keep them true when those change. Live numbers: /api/social?world=coins (api/_world-coins.mjs).
// en/ko/zh/tr, the language the game site picked (arc.gw.lang).
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var A = window.ARC_ARCL || { launch: Date.parse("2026-11-03T11:00:00Z"), delayEnd: Date.parse("2026-11-03T11:30:00Z"), delayMin: 30, ca: "", x: "https://x.com/ARCIRCLEonArc", tg: "https://t.me/ARCIRCLEonarc", explorer: "https://robinhoodchain.blockscout.com" };
  var ANNOUNCED = Date.parse("2026-11-03T03:20:00Z"); // (the owner's call — the progress bar runs from here to the launch)
  var IC = function (n) { return "/images/arcl/ic/" + n + "-256.webp"; };

  // ---------------- the texts ----------------
  var EN = {
    skip: "Skip to content", play: "Play free", "nav.world": "Game World", "nav.launch": "Launch", "nav.earn": "Earn", "nav.ex": "Exchange", "nav.use": "Use", "nav.fee": "Tokenomics", "nav.faq": "FAQ",
    "hero.k": "The game coin · launching on Robinhood Chain", "hero.p": "The coin you've been earning in ARCIRCLE WORLD goes on-chain. Earned by playing, spent in every game — built only for the game.",
    "cd.k": "Launch in", "cd.d": "Days", "cd.h": "Hours", "cd.m": "Minutes", "cd.s": "Seconds",
    "cd.delay": "The launch may start up to 30 minutes late. Further notices are posted on X and Telegram — follow them for the live status.",
    "cd.you": "Your time: {t}", "cd.win.h": "Launch window", "cd.win.p": "ARCL is launching on Robinhood Chain now — it can take up to {m} more minutes. Watch X and Telegram for the official go-live post.",
    "cd.live.h": "Launch time reached", "cd.live.p": "The official contract address and the live status are on X and Telegram. This page shows the contract once it's posted.",
    "cd.on.h": "ARCL is live", "cd.on.p": "ARCL trades on Robinhood Chain. Check the contract below — and only trust the official links.",
    "cta.x": "Follow on X", "cta.tg": "Join Telegram", "cta.cal": "Add to calendar",
    "what.k": "What is ARCL", "what.h": "A coin made only for the game",
    "what.p": "$ARCIRCLE is ARCIRCLE's ecosystem token on Arc. ARCL is different: it lives inside ARCIRCLE WORLD. You earn it in every game, you spend it on what makes your hero, your island and your runs better — and now it gets its own coin on Robinhood Chain.",
    "vs.a": "ARCL", "vs.b": "$ARCIRCLE", "vs.what": "What", "vs.chain": "Chain", "vs.get": "How you get it", "vs.use": "What it's for", "vs.fee": "Fee",
    "vs.a.what": "The game coin of ARCIRCLE WORLD", "vs.a.chain": "Robinhood Chain (from the launch)", "vs.a.get": "Play — every game pays it, checked by our server", "vs.a.use": "Gear, forging, styles, islands, chips, the Studio, the Creator Market …", "vs.a.fee": "2% a trade: 1% buys back & burns $ARCIRCLE, 1% builds the game",
    "vs.b.what": "ARCIRCLE's ecosystem token", "vs.b.chain": "Arc", "vs.b.get": "Swap on Arc, or buy with USDC inside the game", "vs.b.use": "Premium items, cars, LAND, AI agents — half of every payment burned", "vs.b.fee": "In-game payments: 50% burned / 50% treasury",
    "live.earn": "ARCL earned by players since Oct 21", "live.spent": "ARCL spent in the game", "live.days": "ARCL earned in the last 7 days", "live.ex": "ARCL exchanged for $ARCIRCLE", "live.src": "Where players earned it (last 30 days)", "live.mine": "My ARCL balance & history →", "live.note": "Live from our server's ledger — every ARCL movement is recorded.", "live.wait": "Loading the live numbers…", "live.off": "The live numbers aren't available right now.",
    "fee.k": "Tokenomics · the 2% fee", "fee.h": "Every trade feeds the world", "fee.p": "Each ARCL trade carries a 2% fee, split in two — and both halves go straight back into ARCIRCLE.", "fee.c": "a trade",
    "fee.a.h": "Buyback & burn $ARCIRCLE", "fee.a.p": "1% of every trade buys $ARCIRCLE and burns it — the game coin's activity shrinks the ecosystem token's supply.",
    "fee.b.h": "Game development & in-game use", "fee.b.p": "1% funds new games, content and graphics, and the ARCL rewards and uses inside the game.",
    "fee.note": "Your in-game ARCL (the balance in your account today) has no fee: the 2% applies to trades of the ARCL coin on Robinhood Chain.",
    "earn.k": "Where to earn", "earn.h": "Play anything. Earn ARCL.", "earn.p": "ARCL is paid only for things the server can check — a race it timed, a run it watched, a rock you broke. Every activity has its own daily limit, so it stays fair for everyone.",
    "tab.games": "Games", "tab.world": "The world", "tab.daily": "Daily & weekly", "tab.social": "Friends & islands",
    "r1.h": "Checked by the server", "r1.p": "Races, runs and boss fights are checked on the server's clock. Nothing is paid for a result it can't verify.",
    "r2.h": "Daily limits", "r2.p": "Each activity has its own limit, and play rewards claimed in town share 30,000 ARCL a day. The limits grow as the game grows.",
    "r3.h": "Weekend 2×", "r3.p": "Saturdays and Sundays (Seoul time) double hunting, street, boss and check-in rewards.",
    "ex.k": "Exchange", "ex.h": "Exchange ARCL for $ARCIRCLE", "ex.p": "The exchange in the game is live today, settled by the ARCIRCLE treasury on Arc. Here's every way value moves in and out of the game.",
    "x1.h": "ARCL → $ARCIRCLE", "x1.p": "Ask in the game's Exchange window. The treasury posts the rate (it opened at 10 ARCL = 1 $ARCIRCLE) and pays each request from its own wallet on Arc; the server reads the receipt back. Up to 300,000 $ARCIRCLE a wallet a day, every settlement on the public record.",
    "x3.h": "Buy $ARCIRCLE with USDC", "x3.p": "Short on $ARCIRCLE at checkout? The game swaps the rest from USDC on Arc (Uniswap v4) — you confirm each step in your wallet.",
    "x4.h": "Creator Exchange", "x4.p": "Creators earn ARCL from the Creator Market (80 / 20). The share buyers paid with purchased ARCL becomes exchangeable after 14 days, paid by a GM's own wallet.",
    "x5.h": "ARCL on Robinhood Chain", "x5.p": "From the launch, ARCL trades as its own coin on Robinhood Chain, with the 2% fee: 1% $ARCIRCLE buyback & burn, 1% for the game.",
    "x6.h": "Linking in-game ARCL with the coin", "x6.p": "How your in-game ARCL connects to the coin will be announced on X and Telegram. Until then your in-game balance stays in your account and works everywhere in the game.",
    "tag.live": "Live", "tag.launch": "Nov 3", "tag.soon": "Announced on X & TG",
    "exl.n": "exchanges settled", "exl.arcl": "ARCL exchanged", "exl.burn": "$ARCIRCLE burned by in-game payments",
    "use.k": "In-game use", "use.h": "Spend it where it counts", "use.p": "ARCL buys what makes you stronger, faster and better-looking in ARCIRCLE WORLD. A few of the things it pays for today:",
    "road.k": "The road", "road.h": "From game points to a game coin",
    "t1.k": "October 2026", "t1.h": "ARCL across 9 games", "t1.p": "Earned and spent everywhere in ARCIRCLE WORLD; the ledger records every movement.",
    "t2.k": "November 2", "t2.h": "The Exchange relaunches", "t2.p": "ARCL → $ARCIRCLE settled by the treasury on Arc, on a public record.",
    "t3.k": "November 3 · 11:00 UTC (8 PM KST)", "t3.h": "ARCL launches on Robinhood Chain", "t3.p": "The game coin goes on-chain — 2% fee: 1% $ARCIRCLE buyback & burn, 1% for the game.",
    "t4.k": "Next", "t4.h": "In-game ARCL meets the coin", "t4.p": "Linking the two, more games and more uses — every step announced on X and Telegram.",
    "safe.h": "Official links only", "safe.p": "The ARCL contract address is posted only on @ARCIRCLEonArc on X and in the official Telegram — and on this page once it's live. Nobody from ARCIRCLE will ever DM you first, ask for your seed phrase, or ask you to send coins.",
    "ca.pend": "Contract address: posted at launch on X and Telegram", "ca.copy": "Copy", "ca.copied": "Copied!", "ca.view": "View on the explorer",
    "faq.k": "Questions", "faq.h": "Good to know",
    "q1": "What is ARCL?", "a1": "The coin of ARCIRCLE WORLD. You earn it by playing — races, runs, raids, puzzles, mining, hunting — and spend it on gear, forging, styles, islands, poker chips and more. On Nov 3 it launches as its own coin on Robinhood Chain.",
    "q2": "Is ARCL the same as $ARCIRCLE?", "a2": "No. $ARCIRCLE is the ecosystem token on Arc (premium items, LAND, AI agents, half of every payment burned). ARCL is the game coin, focused only on the game — and its 2% fee buys back and burns $ARCIRCLE.",
    "q3": "When and where does it launch?", "a3": "Tuesday, Nov 3, 2026 at 8:00 PM Korea time (11:00 UTC · 6:00 AM US Eastern) on Robinhood Chain. It may start up to 30 minutes late — follow X and Telegram for the live status.",
    "q4": "What is the fee?", "a4": "2% a trade: 1% buys back and burns $ARCIRCLE, 1% funds the game's development and the ARCL used inside the game.",
    "q5": "What happens to the ARCL I already have in the game?", "a5": "It stays in your account and keeps working in every game and in the Exchange. How in-game ARCL connects to the coin will be announced on X and Telegram — no action is needed from you today.",
    "q6": "Where do I find the contract address?", "a6": "Only on @ARCIRCLEonArc on X, the official Telegram, and this page once it's live. Never use an address someone sends you in a DM.",
    "q7": "Do I need to buy ARCL to play?", "a7": "No. ARCIRCLE WORLD is free to play on phone and PC, and every game pays ARCL for playing.",
    "q8": "Is earning guaranteed?", "a8": "No. Rewards are for play, inside daily limits, and coin prices move both ways. Nothing here is financial advice.",
    "fin.h": "Start earning ARCL today", "fin.p": "Free to play on phone and PC. Every ARCL you earn in the game is counted by our server.",
    "foot.fine": "Game rewards are for play and are never guaranteed. Coin prices move both ways. Nothing on this page is financial advice.",
    "src.other": "Other",
  };
  // where to earn: [id, icon, tab] — h / a (amount) / p / l (limit) per language
  var EARN = [["mine", "mine", "games"], ["surv", "survivors", "games"], ["raidq", "raid", "games"], ["kart", "kart", "games"], ["rings", "rings", "games"], ["jump", "trophy", "games"], ["jur", "jurassic", "games"], ["poker", "poker", "games"], ["defense", "survivors", "games"],
    ["hunt", "hunt", "world"], ["street", "hunt", "world"], ["hw", "burn", "world"], ["codex", "quests", "world"], ["sell", "forge", "world"],
    ["daily", "daily", "daily"], ["fountain", "gift", "daily"], ["welcome", "gift", "daily"], ["weekly", "quests", "daily"],
    ["heart", "gift", "social"], ["village", "trophy", "social"], ["likes", "studio", "social"], ["launch", "chain", "social"]];
  var E = {
    "e.mine.h": "ARCL Mine", "e.mine.a": "10 – 10,000 a rock", "e.mine.p": "Break copper, silver and gold rocks in the cave; better pickaxes reach richer rocks. The ore bag is shared with Jurassic World.", "e.mine.l": "Up to 40,000 a day",
    "e.surv.h": "SURVIVORS ARENA", "e.surv.a": "Up to 3,000 a run", "e.surv.p": "Survive the horde for 12 minutes with ARON, LUMI or NEX — Hard pays up to 5,000. Quick and Endless modes too.", "e.surv.l": "First 3 runs a day · 10,000 a day",
    "e.raidq.h": "RAID QUEENS", "e.raidq.a": "2,000 · 3,000 · 5,000 a win", "e.raidq.p": "Bring down Lysitha, Solvira or Nyxara. The day's first win of each pays ×1.5, HARD mode ×1.6.", "e.raidq.l": "3 runs a day",
    "e.kart.h": "ARCIRCLE KART", "e.kart.a": "500 / 350 / 250 / 150 / 100", "e.kart.p": "Race the CRYPTO LEGENDS on five tracks — paid by your place. The Daily challenge adds 300.", "e.kart.l": "First 5 races a day · 2,500 a day",
    "e.rings.h": "INFINITY RINGS", "e.rings.a": "100 a new star", "e.rings.p": "200 levels of ring puzzles (levels 101–200: 50 a star). All three daily puzzles at 3 stars: +300.", "e.rings.l": "Up to 10,000 a day",
    "e.jump.h": "COIN JUMP", "e.jump.a": "3,000", "e.jump.p": "Climb all the way to the crown.", "e.jump.l": "Once a day",
    "e.jur.h": "JURASSIC WORLD", "e.jur.a": "300 a mission", "e.jur.p": "Three daily missions for taking part. A boss-hour hunter's share pays 200 / 300, a night raid held 150.", "e.jur.l": "3 missions a day",
    "e.poker.h": "ARCIA POKER LOUNGE", "e.poker.a": "300 a mission", "e.poker.p": "Three daily missions: finish solo games, play table hands, play blackjack. Never for winning — the chips are play money.", "e.poker.l": "3 missions a day",
    "e.defense.h": "AC DEFENSE", "e.defense.a": "5 a wave", "e.defense.p": "Hold the towers. The week's top 3 win 10,000 / 5,000 / 2,500.", "e.defense.l": "Up to 150 a day",
    "e.hunt.h": "Hunting grounds", "e.hunt.a": "5 – 12 a scammer", "e.hunt.p": "Knock out scammers in 12 hunting grounds — by their level. Each ground's boss pays 30.", "e.hunt.l": "100 a day · bosses 30 a day",
    "e.street.h": "Town streets", "e.street.a": "5 a scammer · 2 a coin", "e.street.p": "Street scammers, and ARCL coins lying around town.", "e.street.l": "100 each a day",
    "e.hw.h": "HALLOWEEN REALM", "e.hw.a": "×1.5 at night", "e.hw.p": "Hunt in the Cursed Night for 1.5× ARCL (Blood Moon ×2), and try Trick or Treat for 20–60.", "e.hw.l": "Inside each day's limits",
    "e.codex.h": "Item Codex", "e.codex.a": "Milestones", "e.codex.p": "Collect gear kinds: 10, 25, 50, 100 and all 175 pay ARCL once each.", "e.codex.l": "Once each",
    "e.sell.h": "Sell gear at the Forge", "e.sell.a": "6 – 260 a piece", "e.sell.p": "Spare gear sells by its rarity.", "e.sell.l": "Up to 1,500 a day",
    "e.daily.h": "Daily check-in", "e.daily.a": "20 + streak", "e.daily.p": "+5 for every day of your streak, up to +30.", "e.daily.l": "Once a day",
    "e.fountain.h": "The plaza fountain", "e.fountain.a": "10", "e.fountain.p": "Toss a coin and make a wish.", "e.fountain.l": "Once a day",
    "e.welcome.h": "Welcome week", "e.welcome.a": "7 gifts", "e.welcome.p": "A new player's first week — 500, 1,000 and 1,500 ARCL among the gifts.", "e.welcome.l": "Once each",
    "e.weekly.h": "Weekly goals", "e.weekly.a": "40 / 100 / 200", "e.weekly.p": "Bounties for 100 / 300 / 600 monsters a week, plus the party quest and the weekly raid boss.", "e.weekly.l": "Once each a week",
    "e.heart.h": "Hearts from friends", "e.heart.a": "100 each", "e.heart.p": "Friends send you hearts — send them back.", "e.heart.l": "Up to 5 a day",
    "e.village.h": "Village of the week", "e.village.a": "500 / 300 / 150", "e.village.p": "The week's top 3 villages; the month's pay 2,000 / 1,000 / 500.", "e.village.l": "Every week",
    "e.likes.h": "Island likes & stamps", "e.likes.a": "10 → 120", "e.likes.p": "Likes on your island (1 / 10 / 50), stamps you leave on others (5 each, 3 a day), island milestones.", "e.likes.l": "Once each",
    "e.launch.h": "Launch a coin on ArcPad", "e.launch.a": "100", "e.launch.p": "Launch your own coin, and hold $ARCIRCLE for 50 more.", "e.launch.l": "Once",
  };
  for (var k in E) EN[k] = E[k];
  // what ARCL buys: [id, icon]
  var USE = [["shop", "shop"], ["forge", "forge"], ["mine", "mine"], ["chips", "poker"], ["style", "studio"], ["market", "market"], ["studio", "dev"], ["more", "gift"]];
  var U = {
    "u.shop.h": "Islands & bricks", "u.shop.a": "100 – 20,000", "u.shop.p": "Ten island styles (Grass 1,500 → Volcano 20,000), the 48×48 expansion (1,500) and material bricks from 100 to 1,000.",
    "u.forge.h": "The Forge", "u.forge.a": "20 – 650", "u.forge.p": "Potions (5 for 30, 20 for 100), recall scrolls and scrap (100 for 150, 500 for 650) for crafting, enhancing, fusing and repairing gear.",
    "u.mine.h": "Pickaxe upgrades", "u.mine.a": "ARCL Mine", "u.mine.p": "Better pickaxes break richer rocks faster in the ARCL Mine.",
    "u.chips.h": "Poker chips", "u.chips.a": "One way", "u.chips.p": "Turn ARCL into chips for the ARCIA Poker Lounge's tables, Sit & Go and blackjack (chips never turn back).",
    "u.style.h": "Styles & paints", "u.style.a": "Your look", "u.style.p": "Hero paint jobs, trails and plaza styles; the Halloween Realm's Pumpkin and Phantom paints (4,000 / 6,000).",
    "u.market.h": "Creator Market", "u.market.a": "80% to the creator", "u.market.p": "Buy island blueprints other players made — two taps, and the creator earns 80%.",
    "u.studio.h": "ARCIRCLE Studio", "u.studio.a": "50 · 1,500", "u.studio.p": "Past the free quota: the AI director's change (50) and a Meshy 3D asset of your own (1,500); prefabs from the market.",
    "u.more.h": "And more", "u.more.a": "Every game", "u.more.p": "Agent errands, dino treats, Crimson Celestial enhancing and its market, and every new game's shop as it opens.",
  };
  for (k in U) EN[k] = U[k];
  var SRC = { mine: "ARCL Mine", halloween: "Halloween", surv: "SURVIVORS", defweek: "AC Defense (week)", hunt: "Hunting grounds", launch: "Coin launches", jur: "Jurassic World", kart: "KART", jump: "Coin Jump", welcome: "Welcome week", raidq: "RAID QUEENS", rings: "INFINITY RINGS", codex: "Item Codex", street: "Streets", boss: "Bosses", sell: "Forge sales", pickup: "Street coins", daily: "Check-in" };

  var KO = {
    skip: "본문으로", play: "무료로 플레이", "nav.world": "게임 월드", "nav.launch": "런칭", "nav.earn": "획득", "nav.ex": "교환", "nav.use": "사용처", "nav.fee": "토크노믹스", "nav.faq": "FAQ",
    "hero.k": "게임 코인 · 로빈후드 체인 런칭", "hero.p": "ARCIRCLE WORLD에서 모아 온 그 코인이 드디어 온체인으로. 플레이로 얻고, 모든 게임에서 쓰는 — 오직 게임을 위한 코인.",
    "cd.k": "런칭까지", "cd.d": "일", "cd.h": "시간", "cd.m": "분", "cd.s": "초",
    "cd.delay": "런칭은 최대 30분 늦어질 수 있어요. 추가 공지는 X와 텔레그램에 올라와요 — 실시간 상황은 공식 채널을 확인하세요.",
    "cd.you": "내 시간: {t}", "cd.win.h": "런칭 진행 중", "cd.win.p": "지금 로빈후드 체인에서 ARCL 런칭이 진행 중이에요 — 최대 {m}분 더 걸릴 수 있어요. 공식 오픈 공지는 X와 텔레그램을 확인하세요.",
    "cd.live.h": "런칭 시간 도달", "cd.live.p": "공식 컨트랙트 주소와 실시간 상황은 X와 텔레그램에서 확인하세요. 주소가 공지되면 이 페이지에도 표시돼요.",
    "cd.on.h": "ARCL 라이브", "cd.on.p": "ARCL이 로빈후드 체인에서 거래돼요. 아래 컨트랙트를 확인하고, 공식 링크만 믿으세요.",
    "cta.x": "X 팔로우", "cta.tg": "텔레그램 참여", "cta.cal": "캘린더에 추가",
    "what.k": "ARCL이란", "what.h": "오직 게임을 위해 만든 코인",
    "what.p": "$ARCIRCLE은 Arc 위의 ARCIRCLE 생태계 토큰이에요. ARCL은 달라요: ARCIRCLE WORLD 안에서 살아 있는 코인이에요. 모든 게임에서 얻고, 내 영웅·섬·플레이를 더 좋게 만드는 데 쓰고 — 이제 로빈후드 체인에 자기만의 코인으로 나와요.",
    "vs.a": "ARCL", "vs.b": "$ARCIRCLE", "vs.what": "정체", "vs.chain": "체인", "vs.get": "얻는 법", "vs.use": "쓰는 곳", "vs.fee": "수수료",
    "vs.a.what": "ARCIRCLE WORLD의 게임 코인", "vs.a.chain": "로빈후드 체인 (런칭부터)", "vs.a.get": "플레이 — 모든 게임이 지급, 서버가 확인", "vs.a.use": "장비, 대장간, 스타일, 섬, 포커 칩, 스튜디오, 크리에이터 마켓 …", "vs.a.fee": "거래마다 2%: 1% $ARCIRCLE 바이백 & 소각, 1% 게임 개발",
    "vs.b.what": "ARCIRCLE 생태계 토큰", "vs.b.chain": "Arc", "vs.b.get": "Arc에서 스왑, 또는 게임 안에서 USDC로 구매", "vs.b.use": "프리미엄 아이템, 자동차, LAND, AI 에이전트 — 결제마다 절반 소각", "vs.b.fee": "게임 내 결제: 50% 소각 / 50% 트레저리",
    "live.earn": "10월 21일부터 플레이어가 번 ARCL", "live.spent": "게임에서 쓴 ARCL", "live.days": "최근 7일 동안 번 ARCL", "live.ex": "$ARCIRCLE로 교환된 ARCL", "live.src": "어디서 벌었나 (최근 30일)", "live.mine": "내 ARCL 잔액 & 내역 →", "live.note": "서버 장부에서 실시간 — 모든 ARCL 이동이 기록돼요.", "live.wait": "실시간 숫자를 불러오는 중…", "live.off": "지금은 실시간 숫자를 볼 수 없어요.",
    "fee.k": "토크노믹스 · 2% 수수료", "fee.h": "모든 거래가 월드를 키운다", "fee.p": "ARCL 거래마다 2% 수수료가 붙고, 둘로 나뉘어 — 둘 다 ARCIRCLE로 돌아와요.", "fee.c": "거래당",
    "fee.a.h": "$ARCIRCLE 바이백 & 소각", "fee.a.p": "거래마다 1%로 $ARCIRCLE을 사서 소각해요 — 게임 코인의 활동이 생태계 토큰의 공급을 줄여요.",
    "fee.b.h": "게임 개발 & 게임 내 활용", "fee.b.p": "1%는 새 게임·콘텐츠·그래픽 개발과, 게임 안의 ARCL 보상과 사용처에 쓰여요.",
    "fee.note": "게임 안의 ARCL(지금 계정에 있는 잔액)에는 수수료가 없어요: 2%는 로빈후드 체인의 ARCL 코인 거래에 붙어요.",
    "earn.k": "획득 장소", "earn.h": "뭘 해도 ARCL", "earn.p": "ARCL은 서버가 확인할 수 있는 것에만 지급돼요 — 서버가 잰 레이스, 지켜본 런, 내가 깬 바위. 활동마다 하루 한도가 있어서 모두에게 공정해요.",
    "tab.games": "게임", "tab.world": "월드", "tab.daily": "매일 & 매주", "tab.social": "친구 & 섬",
    "r1.h": "서버가 확인", "r1.p": "레이스·런·보스전은 서버 시계로 확인해요. 확인할 수 없는 결과에는 지급하지 않아요.",
    "r2.h": "하루 한도", "r2.p": "활동마다 한도가 따로 있고, 마을에서 받는 플레이 보상은 하루 30,000 ARCL을 함께 써요. 한도는 게임이 커질수록 올라가요.",
    "r3.h": "주말 2배", "r3.p": "토·일요일(서울 시간)엔 사냥·거리·보스·출석 보상이 두 배.",
    "ex.k": "교환", "ex.h": "ARCL을 $ARCIRCLE로 교환", "ex.p": "게임 안의 교환소는 지금 운영 중이고, Arc의 ARCIRCLE 트레저리가 정산해요. 게임 안팎으로 가치가 오가는 모든 길:",
    "x1.h": "ARCL → $ARCIRCLE", "x1.p": "게임의 교환 창에서 신청해요. 트레저리가 환율을 공지하고(시작 환율 10 ARCL = 1 $ARCIRCLE) 자기 지갑에서 Arc로 직접 보내요. 서버가 영수증을 확인하고요. 지갑당 하루 최대 300,000 $ARCIRCLE, 모든 정산은 공개 기록에 남아요.",
    "x3.h": "USDC로 $ARCIRCLE 구매", "x3.p": "결제할 때 $ARCIRCLE이 모자라면? 게임이 Arc의 USDC로 나머지를 스왑해 줘요(Uniswap v4) — 단계마다 내 지갑에서 확인.",
    "x4.h": "크리에이터 교환", "x4.p": "크리에이터는 크리에이터 마켓에서 ARCL을 벌어요(80 / 20). 구매자가 구매한 ARCL로 낸 몫은 14일 뒤 교환할 수 있고, GM 본인 지갑에서 지급돼요.",
    "x5.h": "로빈후드 체인의 ARCL", "x5.p": "런칭부터 ARCL은 로빈후드 체인에서 자기 코인으로 거래돼요. 수수료 2%: 1% $ARCIRCLE 바이백 & 소각, 1% 게임.",
    "x6.h": "게임 내 ARCL과 코인 연결", "x6.p": "게임 안의 ARCL이 코인과 어떻게 이어지는지는 X와 텔레그램으로 공지해요. 그때까지 게임 잔액은 계정에 그대로 있고 게임 어디서나 쓸 수 있어요.",
    "tag.live": "운영 중", "tag.launch": "11월 3일", "tag.soon": "X·TG 공지 예정",
    "exl.n": "정산된 교환", "exl.arcl": "교환된 ARCL", "exl.burn": "게임 결제로 소각된 $ARCIRCLE",
    "use.k": "게임 내 활용", "use.h": "쓸 데가 확실한 코인", "use.p": "ARCL로 ARCIRCLE WORLD에서 더 강하고, 더 빠르고, 더 멋져져요. 지금 ARCL로 살 수 있는 것들:",
    "road.k": "로드맵", "road.h": "게임 포인트에서 게임 코인으로",
    "t1.k": "2026년 10월", "t1.h": "9개 게임의 ARCL", "t1.p": "ARCIRCLE WORLD 어디서나 벌고 쓰고, 장부가 모든 이동을 기록.",
    "t2.k": "11월 2일", "t2.h": "교환소 재오픈", "t2.p": "ARCL → $ARCIRCLE, Arc의 트레저리가 정산하고 공개 기록에.",
    "t3.k": "11월 3일 · 한국 시간 오후 8시", "t3.h": "로빈후드 체인 ARCL 런칭", "t3.p": "게임 코인이 온체인으로 — 수수료 2%: 1% $ARCIRCLE 바이백 & 소각, 1% 게임.",
    "t4.k": "다음", "t4.h": "게임 속 ARCL과 코인의 만남", "t4.p": "둘의 연결, 더 많은 게임과 사용처 — 매 단계 X와 텔레그램으로 공지.",
    "safe.h": "공식 링크만", "safe.p": "ARCL 컨트랙트 주소는 X의 @ARCIRCLEonArc와 공식 텔레그램에만 — 그리고 라이브가 되면 이 페이지에 — 올라와요. ARCIRCLE 팀은 먼저 DM하거나, 시드 문구를 묻거나, 코인을 보내라고 하지 않아요.",
    "ca.pend": "컨트랙트 주소: 런칭 때 X와 텔레그램에 공지", "ca.copy": "복사", "ca.copied": "복사됨!", "ca.view": "익스플로러에서 보기",
    "faq.k": "질문", "faq.h": "알아두면 좋아요",
    "q1": "ARCL이 뭔가요?", "a1": "ARCIRCLE WORLD의 코인이에요. 레이스·런·레이드·퍼즐·채굴·사냥으로 벌고, 장비·대장간·스타일·섬·포커 칩 등에 써요. 11월 3일 로빈후드 체인에서 자기 코인으로 런칭해요.",
    "q2": "ARCL과 $ARCIRCLE은 같은가요?", "a2": "아니요. $ARCIRCLE은 Arc의 생태계 토큰(프리미엄 아이템, LAND, AI 에이전트, 결제마다 절반 소각)이고, ARCL은 오직 게임에 집중한 게임 코인이에요 — 그리고 ARCL의 2% 수수료가 $ARCIRCLE을 바이백 & 소각해요.",
    "q3": "언제, 어디서 런칭하나요?", "a3": "2026년 11월 3일(화) 한국 시간 오후 8시(UTC 11:00 · 미국 동부 오전 6시), 로빈후드 체인. 최대 30분 늦어질 수 있어요 — 실시간 상황은 X와 텔레그램.",
    "q4": "수수료는요?", "a4": "거래마다 2%: 1%는 $ARCIRCLE 바이백 & 소각, 1%는 게임 개발과 게임 안의 ARCL 활용.",
    "q5": "게임에 이미 있는 ARCL은 어떻게 되나요?", "a5": "계정에 그대로 있고 모든 게임과 교환소에서 계속 쓸 수 있어요. 게임 속 ARCL이 코인과 어떻게 이어지는지는 X와 텔레그램으로 공지해요 — 오늘 따로 할 일은 없어요.",
    "q6": "컨트랙트 주소는 어디서 보나요?", "a6": "X의 @ARCIRCLEonArc, 공식 텔레그램, 그리고 라이브 후 이 페이지에서만. DM으로 받은 주소는 절대 쓰지 마세요.",
    "q7": "플레이하려면 ARCL을 사야 하나요?", "a7": "아니요. ARCIRCLE WORLD는 폰과 PC에서 무료이고, 모든 게임이 플레이에 ARCL을 지급해요.",
    "q8": "수익이 보장되나요?", "a8": "아니요. 보상은 하루 한도 안에서 플레이에 주는 것이고, 코인 가격은 오르기도 내리기도 해요. 이 페이지의 어떤 내용도 투자 조언이 아니에요.",
    "fin.h": "오늘부터 ARCL 모으기", "fin.p": "폰과 PC에서 무료. 게임에서 버는 모든 ARCL은 서버가 세요.",
    "foot.fine": "게임 보상은 플레이에 대한 것이며 보장되지 않아요. 코인 가격은 오르기도 내리기도 해요. 이 페이지의 어떤 내용도 투자 조언이 아니에요.",
    "src.other": "기타",
    "e.mine.h": "ARCL 광산", "e.mine.a": "바위당 10 – 10,000", "e.mine.p": "동굴에서 구리·은·금 바위를 깨요. 좋은 곡괭이일수록 더 귀한 바위. 광석 가방은 쥬라기 월드와 같이 써요.", "e.mine.l": "하루 최대 40,000",
    "e.surv.h": "SURVIVORS ARENA", "e.surv.a": "런당 최대 3,000", "e.surv.p": "ARON·LUMI·NEX로 12분 동안 몰려오는 적을 버텨요 — 하드는 최대 5,000. 퀵·엔드리스 모드도.", "e.surv.l": "하루 첫 3판 · 하루 10,000",
    "e.raidq.h": "RAID QUEENS", "e.raidq.a": "승리당 2,000 · 3,000 · 5,000", "e.raidq.p": "리시타·솔비라·닉사라를 쓰러뜨려요. 각 여왕의 하루 첫 승리 ×1.5, 하드 ×1.6.", "e.raidq.l": "하루 3판",
    "e.kart.h": "ARCIRCLE KART", "e.kart.a": "500 / 350 / 250 / 150 / 100", "e.kart.p": "다섯 트랙에서 CRYPTO LEGENDS와 레이스 — 순위대로 지급. 데일리 챌린지 +300.", "e.kart.l": "하루 첫 5레이스 · 하루 2,500",
    "e.rings.h": "INFINITY RINGS", "e.rings.a": "새 별 하나에 100", "e.rings.p": "200레벨 링 퍼즐(101–200레벨은 별당 50). 데일리 퍼즐 셋 모두 별 3개면 +300.", "e.rings.l": "하루 최대 10,000",
    "e.jump.h": "COIN JUMP", "e.jump.a": "3,000", "e.jump.p": "왕관까지 끝까지 올라가요.", "e.jump.l": "하루 한 번",
    "e.jur.h": "쥬라기 월드", "e.jur.a": "미션당 300", "e.jur.p": "참여만 해도 되는 데일리 미션 3개. 보스 타임 사냥꾼 몫 200 / 300, 야간 습격 방어 150.", "e.jur.l": "하루 미션 3개",
    "e.poker.h": "ARCIA POKER LOUNGE", "e.poker.a": "미션당 300", "e.poker.p": "데일리 미션 3개: 솔로 게임 끝내기, 테이블 핸드, 블랙잭. 이겨서 주는 게 아니에요 — 칩은 놀이용.", "e.poker.l": "하루 미션 3개",
    "e.defense.h": "AC DEFENSE", "e.defense.a": "웨이브당 5", "e.defense.p": "타워를 지켜요. 주간 TOP 3는 10,000 / 5,000 / 2,500.", "e.defense.l": "하루 최대 150",
    "e.hunt.h": "사냥터", "e.hunt.a": "스캐머당 5 – 12", "e.hunt.p": "12개 사냥터에서 스캐머를 쓰러뜨려요 — 레벨에 따라. 각 사냥터 보스는 30.", "e.hunt.l": "하루 100 · 보스 하루 30",
    "e.street.h": "마을 거리", "e.street.a": "스캐머 5 · 코인 2", "e.street.p": "거리의 스캐머, 그리고 마을에 떨어진 ARCL 코인.", "e.street.l": "각각 하루 100",
    "e.hw.h": "HALLOWEEN REALM", "e.hw.a": "밤엔 ×1.5", "e.hw.p": "저주받은 밤에 사냥하면 ARCL 1.5배(블러드 문 ×2), 트릭 오어 트릿 20–60.", "e.hw.l": "하루 한도 안에서",
    "e.codex.h": "아이템 도감", "e.codex.a": "마일스톤", "e.codex.p": "장비 종류 모으기: 10·25·50·100·전체 175종에 한 번씩 ARCL.", "e.codex.l": "각각 한 번",
    "e.sell.h": "대장간에서 장비 판매", "e.sell.a": "개당 6 – 260", "e.sell.p": "남는 장비는 등급대로 팔려요.", "e.sell.l": "하루 최대 1,500",
    "e.daily.h": "출석 체크", "e.daily.a": "20 + 연속", "e.daily.p": "연속 출석 하루마다 +5, 최대 +30.", "e.daily.l": "하루 한 번",
    "e.fountain.h": "광장 분수", "e.fountain.a": "10", "e.fountain.p": "동전을 던지고 소원을 빌어요.", "e.fountain.l": "하루 한 번",
    "e.welcome.h": "웰컴 위크", "e.welcome.a": "선물 7개", "e.welcome.p": "새 플레이어의 첫 주 — 500·1,000·1,500 ARCL이 선물 속에.", "e.welcome.l": "각각 한 번",
    "e.weekly.h": "주간 목표", "e.weekly.a": "40 / 100 / 200", "e.weekly.p": "한 주에 몬스터 100 / 300 / 600 현상금, 파티 퀘스트와 주간 레이드 보스도.", "e.weekly.l": "매주 한 번씩",
    "e.heart.h": "친구의 하트", "e.heart.a": "하나에 100", "e.heart.p": "친구가 하트를 보내요 — 답장도 보내 주세요.", "e.heart.l": "하루 최대 5",
    "e.village.h": "이주의 마을", "e.village.a": "500 / 300 / 150", "e.village.p": "주간 TOP 3 마을. 월간은 2,000 / 1,000 / 500.", "e.village.l": "매주",
    "e.likes.h": "섬 좋아요 & 스탬프", "e.likes.a": "10 → 120", "e.likes.p": "내 섬 좋아요(1 / 10 / 50), 남의 섬에 남긴 스탬프(개당 5, 하루 3), 섬 마일스톤.", "e.likes.l": "각각 한 번",
    "e.launch.h": "ArcPad에서 코인 런칭", "e.launch.a": "100", "e.launch.p": "내 코인을 런칭하고, $ARCIRCLE 보유로 50 더.", "e.launch.l": "한 번",
    "u.shop.h": "섬 & 브릭", "u.shop.a": "100 – 20,000", "u.shop.p": "섬 스타일 10종(잔디 1,500 → 화산 20,000), 48×48 확장(1,500), 100–1,000 재료 브릭.",
    "u.forge.h": "대장간", "u.forge.a": "20 – 650", "u.forge.p": "포션(5개 30, 20개 100), 귀환 주문서, 장비 제작·강화·합성·수리용 고철(100개 150, 500개 650).",
    "u.mine.h": "곡괭이 업그레이드", "u.mine.a": "ARCL 광산", "u.mine.p": "좋은 곡괭이로 더 귀한 바위를 더 빨리.",
    "u.chips.h": "포커 칩", "u.chips.a": "한 방향", "u.chips.p": "ARCL을 ARCIA 포커 라운지의 테이블·Sit & Go·블랙잭 칩으로(칩은 ARCL로 돌아오지 않아요).",
    "u.style.h": "스타일 & 페인트", "u.style.a": "나의 룩", "u.style.p": "영웅 페인트, 트레일, 광장 스타일. 할로윈 렐름의 펌킨·팬텀 페인트(4,000 / 6,000).",
    "u.market.h": "크리에이터 마켓", "u.market.a": "80%는 크리에이터에게", "u.market.p": "다른 플레이어가 만든 섬 설계도를 두 번 탭으로 — 크리에이터가 80%를 벌어요.",
    "u.studio.h": "ARCIRCLE 스튜디오", "u.studio.a": "50 · 1,500", "u.studio.p": "무료 한도 이후: AI 디렉터 수정(50), 나만의 Meshy 3D 에셋(1,500), 마켓의 프리팹.",
    "u.more.h": "그리고 더", "u.more.a": "모든 게임", "u.more.p": "에이전트 심부름, 공룡 간식, 크림슨 셀레스티얼 강화와 마켓, 그리고 새 게임마다 열리는 상점.",
  };
  var KO_SRC = { mine: "ARCL 광산", halloween: "할로윈", surv: "SURVIVORS", defweek: "AC 디펜스 (주간)", hunt: "사냥터", launch: "코인 런칭", jur: "쥬라기 월드", kart: "KART", jump: "코인 점프", welcome: "웰컴 위크", raidq: "RAID QUEENS", rings: "INFINITY RINGS", codex: "아이템 도감", street: "거리", boss: "보스", sell: "대장간 판매", pickup: "거리 코인", daily: "출석" };

  var ZH = {
    skip: "跳到正文", play: "免费游玩", "nav.world": "游戏世界", "nav.launch": "上线", "nav.earn": "获取", "nav.ex": "兑换", "nav.use": "用途", "nav.fee": "代币经济", "nav.faq": "常见问题",
    "hero.k": "游戏币 · 即将登陆 Robinhood Chain", "hero.p": "你在 ARCIRCLE WORLD 里一直在赚的那枚币，终于上链。靠玩获得，在每个游戏里使用 —— 只为游戏而生。",
    "cd.k": "距离上线", "cd.d": "天", "cd.h": "时", "cd.m": "分", "cd.s": "秒",
    "cd.delay": "上线可能最多推迟 30 分钟。后续公告会发布在 X 和 Telegram —— 请关注官方频道获取实时状态。",
    "cd.you": "你的时间：{t}", "cd.win.h": "上线进行中", "cd.win.p": "ARCL 正在 Robinhood Chain 上线 —— 可能还需要最多 {m} 分钟。请关注 X 和 Telegram 的官方上线公告。",
    "cd.live.h": "已到上线时间", "cd.live.p": "官方合约地址和实时状态请看 X 和 Telegram。地址公布后本页也会显示。",
    "cd.on.h": "ARCL 已上线", "cd.on.p": "ARCL 已在 Robinhood Chain 交易。请核对下方合约，只相信官方链接。",
    "cta.x": "关注 X", "cta.tg": "加入 Telegram", "cta.cal": "加入日历",
    "what.k": "什么是 ARCL", "what.h": "一枚只为游戏而生的币",
    "what.p": "$ARCIRCLE 是 ARCIRCLE 在 Arc 上的生态代币。ARCL 不同：它活在 ARCIRCLE WORLD 里。你在每个游戏中赚取它，用它让你的英雄、岛屿和每一局变得更好 —— 现在它将在 Robinhood Chain 拥有自己的币。",
    "vs.a": "ARCL", "vs.b": "$ARCIRCLE", "vs.what": "定位", "vs.chain": "链", "vs.get": "如何获得", "vs.use": "用途", "vs.fee": "手续费",
    "vs.a.what": "ARCIRCLE WORLD 的游戏币", "vs.a.chain": "Robinhood Chain（自上线起）", "vs.a.get": "游玩 —— 每个游戏都发放，由服务器核验", "vs.a.use": "装备、锻造、外观、岛屿、扑克筹码、Studio、创作者市场 …", "vs.a.fee": "每笔交易 2%：1% 回购并销毁 $ARCIRCLE，1% 用于游戏开发",
    "vs.b.what": "ARCIRCLE 生态代币", "vs.b.chain": "Arc", "vs.b.get": "在 Arc 兑换，或在游戏内用 USDC 购买", "vs.b.use": "高级道具、赛车、LAND、AI 代理 —— 每笔支付销毁一半", "vs.b.fee": "游戏内支付：50% 销毁 / 50% 金库",
    "live.earn": "10 月 21 日以来玩家赚取的 ARCL", "live.spent": "在游戏中花费的 ARCL", "live.days": "最近 7 天赚取的 ARCL", "live.ex": "兑换成 $ARCIRCLE 的 ARCL", "live.src": "玩家从哪里赚取（最近 30 天）", "live.mine": "我的 ARCL 余额与记录 →", "live.note": "实时来自服务器账本 —— 每一笔 ARCL 流动都有记录。", "live.wait": "正在加载实时数据…", "live.off": "暂时无法获取实时数据。",
    "fee.k": "代币经济 · 2% 手续费", "fee.h": "每笔交易都在滋养这个世界", "fee.p": "每笔 ARCL 交易收取 2% 手续费，分成两半 —— 全部回到 ARCIRCLE。", "fee.c": "每笔",
    "fee.a.h": "回购并销毁 $ARCIRCLE", "fee.a.p": "每笔交易的 1% 用于买入 $ARCIRCLE 并销毁 —— 游戏币的活跃让生态代币的供应减少。",
    "fee.b.h": "游戏开发与游戏内使用", "fee.b.p": "1% 用于新游戏、内容和画面的开发，以及游戏内 ARCL 的奖励与用途。",
    "fee.note": "游戏内的 ARCL（你账户里现在的余额）不收手续费：2% 只针对 Robinhood Chain 上 ARCL 币的交易。",
    "earn.k": "获取途径", "earn.h": "玩什么都能赚 ARCL", "earn.p": "ARCL 只发放给服务器能核验的结果 —— 它计时的比赛、它观察的一局、你敲碎的矿石。每项活动都有每日上限，对所有人公平。",
    "tab.games": "游戏", "tab.world": "世界", "tab.daily": "每日与每周", "tab.social": "好友与岛屿",
    "r1.h": "由服务器核验", "r1.p": "比赛、对局和首领战都按服务器时钟核验。无法核验的结果不发奖励。",
    "r2.h": "每日上限", "r2.p": "每项活动有自己的上限，城镇中领取的游玩奖励共享每天 30,000 ARCL。上限会随着游戏成长而提高。",
    "r3.h": "周末 2 倍", "r3.p": "周六和周日（首尔时间）狩猎、街头、首领和签到奖励翻倍。",
    "ex.k": "兑换", "ex.h": "把 ARCL 兑换成 $ARCIRCLE", "ex.p": "游戏内的兑换所今天已经开放，由 Arc 上的 ARCIRCLE 金库结算。价值进出游戏的所有方式：",
    "x1.h": "ARCL → $ARCIRCLE", "x1.p": "在游戏的兑换窗口申请。金库公布汇率（开放时为 10 ARCL = 1 $ARCIRCLE），并从自己的钱包在 Arc 上逐笔支付；服务器核对收据。每个钱包每天最多 300,000 $ARCIRCLE，每笔结算都在公开记录中。",
    "x3.h": "用 USDC 购买 $ARCIRCLE", "x3.p": "结账时 $ARCIRCLE 不够？游戏会用 Arc 上的 USDC 兑换差额（Uniswap v4）—— 每一步都在你的钱包里确认。",
    "x4.h": "创作者兑换", "x4.p": "创作者在创作者市场赚取 ARCL（80 / 20）。买家用购买的 ARCL 支付的部分在 14 天后可兑换，由 GM 本人的钱包支付。",
    "x5.h": "Robinhood Chain 上的 ARCL", "x5.p": "自上线起，ARCL 作为独立的币在 Robinhood Chain 交易，手续费 2%：1% $ARCIRCLE 回购销毁，1% 用于游戏。",
    "x6.h": "游戏内 ARCL 与币的连接", "x6.p": "游戏内 ARCL 如何与币连接将通过 X 和 Telegram 公布。在此之前，你的游戏余额留在账户中，在游戏各处照常使用。",
    "tag.live": "已开放", "tag.launch": "11 月 3 日", "tag.soon": "X 与 TG 公布",
    "exl.n": "已结算兑换", "exl.arcl": "已兑换 ARCL", "exl.burn": "游戏内支付销毁的 $ARCIRCLE",
    "use.k": "游戏内用途", "use.h": "花在刀刃上", "use.p": "ARCL 让你在 ARCIRCLE WORLD 更强、更快、更好看。今天它能买到的部分东西：",
    "road.k": "路线图", "road.h": "从游戏积分到游戏币",
    "t1.k": "2026 年 10 月", "t1.h": "9 款游戏中的 ARCL", "t1.p": "在 ARCIRCLE WORLD 各处赚取和花费；账本记录每一笔流动。",
    "t2.k": "11 月 2 日", "t2.h": "兑换所重新开放", "t2.p": "ARCL → $ARCIRCLE 由 Arc 上的金库结算，记录公开。",
    "t3.k": "11 月 3 日 · 北京时间 19:00", "t3.h": "ARCL 登陆 Robinhood Chain", "t3.p": "游戏币上链 —— 手续费 2%：1% $ARCIRCLE 回购销毁，1% 用于游戏。",
    "t4.k": "下一步", "t4.h": "游戏内 ARCL 与币相连", "t4.p": "连接两者、更多游戏与用途 —— 每一步都在 X 和 Telegram 公布。",
    "safe.h": "只认官方链接", "safe.p": "ARCL 合约地址只会发布在 X 的 @ARCIRCLEonArc 和官方 Telegram —— 上线后也会显示在本页。ARCIRCLE 团队绝不会主动私信你、索要助记词或让你转币。",
    "ca.pend": "合约地址：上线时在 X 和 Telegram 公布", "ca.copy": "复制", "ca.copied": "已复制！", "ca.view": "在浏览器查看",
    "faq.k": "问题", "faq.h": "须知",
    "q1": "ARCL 是什么？", "a1": "ARCIRCLE WORLD 的币。你通过游玩赚取 —— 赛车、对局、团战、谜题、挖矿、狩猎 —— 并花在装备、锻造、外观、岛屿、扑克筹码等上。11 月 3 日它将作为独立的币登陆 Robinhood Chain。",
    "q2": "ARCL 和 $ARCIRCLE 一样吗？", "a2": "不一样。$ARCIRCLE 是 Arc 上的生态代币（高级道具、LAND、AI 代理，每笔支付销毁一半）。ARCL 是只专注于游戏的游戏币 —— 它 2% 的手续费会回购并销毁 $ARCIRCLE。",
    "q3": "何时何地上线？", "a3": "2026 年 11 月 3 日（周二）北京时间 19:00（UTC 11:00 · 韩国 20:00），Robinhood Chain。可能最多推迟 30 分钟 —— 实时状态请关注 X 和 Telegram。",
    "q4": "手续费是多少？", "a4": "每笔交易 2%：1% 回购并销毁 $ARCIRCLE，1% 用于游戏开发和游戏内 ARCL 的使用。",
    "q5": "我在游戏里已有的 ARCL 怎么办？", "a5": "它留在你的账户里，在所有游戏和兑换所继续可用。游戏内 ARCL 如何与币连接会在 X 和 Telegram 公布 —— 今天你不需要做任何操作。",
    "q6": "去哪里找合约地址？", "a6": "只在 X 的 @ARCIRCLEonArc、官方 Telegram，以及上线后的本页。千万不要使用私信里别人发给你的地址。",
    "q7": "玩游戏需要买 ARCL 吗？", "a7": "不需要。ARCIRCLE WORLD 在手机和电脑上免费，每个游戏都会为游玩发放 ARCL。",
    "q8": "收益有保证吗？", "a8": "没有。奖励是在每日上限内对游玩的回馈，币价有涨有跌。本页内容不构成任何投资建议。",
    "fin.h": "今天就开始赚 ARCL", "fin.p": "手机和电脑免费游玩。你在游戏中赚到的每一枚 ARCL 都由服务器记录。",
    "foot.fine": "游戏奖励针对游玩，从不保证。币价有涨有跌。本页内容不构成任何投资建议。",
    "src.other": "其他",
    "e.mine.h": "ARCL 矿洞", "e.mine.a": "每块 10 – 10,000", "e.mine.p": "在洞里敲碎铜、银、金矿石；镐越好，矿越值钱。矿石袋与侏罗纪世界共用。", "e.mine.l": "每天最多 40,000",
    "e.surv.h": "SURVIVORS ARENA", "e.surv.a": "每局最多 3,000", "e.surv.p": "用 ARON、LUMI 或 NEX 抵挡 12 分钟的怪潮 —— 困难最多 5,000。还有快速和无尽模式。", "e.surv.l": "每天前 3 局 · 每天 10,000",
    "e.raidq.h": "RAID QUEENS", "e.raidq.a": "每胜 2,000 · 3,000 · 5,000", "e.raidq.p": "击败莉西塔、索尔维拉或尼克萨拉。每位女王每天首胜 ×1.5，困难 ×1.6。", "e.raidq.l": "每天 3 局",
    "e.kart.h": "ARCIRCLE KART", "e.kart.a": "500 / 350 / 250 / 150 / 100", "e.kart.p": "在五条赛道与 CRYPTO LEGENDS 竞速 —— 按名次发放。每日挑战 +300。", "e.kart.l": "每天前 5 场 · 每天 2,500",
    "e.rings.h": "INFINITY RINGS", "e.rings.a": "每颗新星 100", "e.rings.p": "200 关圆环谜题（101–200 关每星 50）。三道每日谜题全三星 +300。", "e.rings.l": "每天最多 10,000",
    "e.jump.h": "COIN JUMP", "e.jump.a": "3,000", "e.jump.p": "一路爬到王冠。", "e.jump.l": "每天一次",
    "e.jur.h": "侏罗纪世界", "e.jur.a": "每个任务 300", "e.jur.p": "三个参与即可的每日任务。首领时刻猎人份额 200 / 300，守住夜袭 150。", "e.jur.l": "每天 3 个任务",
    "e.poker.h": "ARCIA POKER LOUNGE", "e.poker.a": "每个任务 300", "e.poker.p": "三个每日任务：完成单人局、打牌桌手牌、玩二十一点。不按输赢发放 —— 筹码是游戏币。", "e.poker.l": "每天 3 个任务",
    "e.defense.h": "AC DEFENSE", "e.defense.a": "每波 5", "e.defense.p": "守住塔防。每周前 3 名获得 10,000 / 5,000 / 2,500。", "e.defense.l": "每天最多 150",
    "e.hunt.h": "狩猎场", "e.hunt.a": "每个骗子 5 – 12", "e.hunt.p": "在 12 个狩猎场击倒骗子 —— 按等级发放。每个狩猎场首领 30。", "e.hunt.l": "每天 100 · 首领每天 30",
    "e.street.h": "城镇街道", "e.street.a": "骗子 5 · 金币 2", "e.street.p": "街头骗子，以及散落在城里的 ARCL 金币。", "e.street.l": "各自每天 100",
    "e.hw.h": "HALLOWEEN REALM", "e.hw.a": "夜晚 ×1.5", "e.hw.p": "在诅咒之夜狩猎获得 1.5 倍 ARCL（血月 ×2），不给糖就捣蛋 20–60。", "e.hw.l": "在每日上限内",
    "e.codex.h": "道具图鉴", "e.codex.a": "里程碑", "e.codex.p": "收集装备种类：10、25、50、100 和全部 175 种各发一次 ARCL。", "e.codex.l": "各一次",
    "e.sell.h": "在铁匠铺卖装备", "e.sell.a": "每件 6 – 260", "e.sell.p": "多余装备按稀有度出售。", "e.sell.l": "每天最多 1,500",
    "e.daily.h": "每日签到", "e.daily.a": "20 + 连签", "e.daily.p": "连签每天 +5，最多 +30。", "e.daily.l": "每天一次",
    "e.fountain.h": "广场喷泉", "e.fountain.a": "10", "e.fountain.p": "投一枚硬币，许个愿。", "e.fountain.l": "每天一次",
    "e.welcome.h": "新手周", "e.welcome.a": "7 份礼物", "e.welcome.p": "新玩家的第一周 —— 礼物中有 500、1,000 和 1,500 ARCL。", "e.welcome.l": "各一次",
    "e.weekly.h": "每周目标", "e.weekly.a": "40 / 100 / 200", "e.weekly.p": "每周击败 100 / 300 / 600 只怪的赏金，还有组队任务和每周团战首领。", "e.weekly.l": "每周各一次",
    "e.heart.h": "好友的爱心", "e.heart.a": "每颗 100", "e.heart.p": "好友给你送爱心 —— 记得回送。", "e.heart.l": "每天最多 5 颗",
    "e.village.h": "本周最佳村庄", "e.village.a": "500 / 300 / 150", "e.village.p": "每周前 3 名村庄；月度为 2,000 / 1,000 / 500。", "e.village.l": "每周",
    "e.likes.h": "岛屿点赞与印章", "e.likes.a": "10 → 120", "e.likes.p": "你的岛屿获赞（1 / 10 / 50）、在别人岛上留下印章（每个 5，每天 3 个）、岛屿里程碑。", "e.likes.l": "各一次",
    "e.launch.h": "在 ArcPad 发币", "e.launch.a": "100", "e.launch.p": "发行你自己的币；持有 $ARCIRCLE 再得 50。", "e.launch.l": "一次",
    "u.shop.h": "岛屿与砖块", "u.shop.a": "100 – 20,000", "u.shop.p": "十种岛屿风格（草地 1,500 → 火山 20,000）、48×48 扩建（1,500）、100–1,000 的材质砖块。",
    "u.forge.h": "铁匠铺", "u.forge.a": "20 – 650", "u.forge.p": "药水（5 瓶 30、20 瓶 100）、回城卷轴、用于制作·强化·融合·修理的废料（100 个 150、500 个 650）。",
    "u.mine.h": "镐子升级", "u.mine.a": "ARCL 矿洞", "u.mine.p": "更好的镐子更快敲开更值钱的矿石。",
    "u.chips.h": "扑克筹码", "u.chips.a": "单向", "u.chips.p": "把 ARCL 换成 ARCIA 扑克厅牌桌、Sit & Go 和二十一点的筹码（筹码不能换回）。",
    "u.style.h": "外观与涂装", "u.style.a": "你的造型", "u.style.p": "英雄涂装、拖尾和广场风格；万圣节领域的南瓜与幻影涂装（4,000 / 6,000）。",
    "u.market.h": "创作者市场", "u.market.a": "80% 归创作者", "u.market.p": "两下点击买下其他玩家设计的岛屿蓝图 —— 创作者获得 80%。",
    "u.studio.h": "ARCIRCLE Studio", "u.studio.a": "50 · 1,500", "u.studio.p": "超出免费额度后：AI 导演修改（50）、你自己的 Meshy 3D 资源（1,500），以及市场里的预制件。",
    "u.more.h": "还有更多", "u.more.a": "每个游戏", "u.more.p": "代理跑腿、恐龙零食、绯红天穹强化与市场，以及每款新游戏开放的商店。",
  };
  var ZH_SRC = { mine: "ARCL 矿洞", halloween: "万圣节", surv: "SURVIVORS", defweek: "AC 塔防（周）", hunt: "狩猎场", launch: "发币", jur: "侏罗纪世界", kart: "KART", jump: "Coin Jump", welcome: "新手周", raidq: "RAID QUEENS", rings: "INFINITY RINGS", codex: "道具图鉴", street: "街道", boss: "首领", sell: "铁匠铺出售", pickup: "街头金币", daily: "签到" };

  var TR = {
    skip: "İçeriğe geç", play: "Ücretsiz oyna", "nav.world": "Oyun Dünyası", "nav.launch": "Lansman", "nav.earn": "Kazan", "nav.ex": "Takas", "nav.use": "Kullanım", "nav.fee": "Tokenomik", "nav.faq": "SSS",
    "hero.k": "Oyun coini · Robinhood Chain'de çıkıyor", "hero.p": "ARCIRCLE WORLD'de kazandığın coin zincire çıkıyor. Oynayarak kazanılır, her oyunda harcanır — yalnızca oyun için yapıldı.",
    "cd.k": "Lansmana", "cd.d": "Gün", "cd.h": "Saat", "cd.m": "Dakika", "cd.s": "Saniye",
    "cd.delay": "Lansman en fazla 30 dakika gecikebilir. Ek duyurular X ve Telegram'da — canlı durum için onları takip et.",
    "cd.you": "Senin saatin: {t}", "cd.win.h": "Lansman penceresi", "cd.win.p": "ARCL şu an Robinhood Chain'de çıkıyor — {m} dakika daha sürebilir. Resmi duyuru için X ve Telegram'ı izle.",
    "cd.live.h": "Lansman saati geldi", "cd.live.p": "Resmi kontrat adresi ve canlı durum X ve Telegram'da. Adres paylaşılınca bu sayfada da görünecek.",
    "cd.on.h": "ARCL canlı", "cd.on.p": "ARCL Robinhood Chain'de işlem görüyor. Aşağıdaki kontratı kontrol et — yalnızca resmi bağlantılara güven.",
    "cta.x": "X'te takip et", "cta.tg": "Telegram'a katıl", "cta.cal": "Takvime ekle",
    "what.k": "ARCL nedir", "what.h": "Yalnızca oyun için yapılmış bir coin",
    "what.p": "$ARCIRCLE, ARCIRCLE'ın Arc üzerindeki ekosistem tokeni. ARCL farklı: ARCIRCLE WORLD'ün içinde yaşar. Her oyunda kazanırsın; kahramanını, adanı ve oyunlarını daha iyi yapan şeylere harcarsın — ve şimdi Robinhood Chain'de kendi coini oluyor.",
    "vs.a": "ARCL", "vs.b": "$ARCIRCLE", "vs.what": "Ne", "vs.chain": "Zincir", "vs.get": "Nasıl alınır", "vs.use": "Ne işe yarar", "vs.fee": "Ücret",
    "vs.a.what": "ARCIRCLE WORLD'ün oyun coini", "vs.a.chain": "Robinhood Chain (lansmandan itibaren)", "vs.a.get": "Oyna — her oyun öder, sunucumuz doğrular", "vs.a.use": "Ekipman, demirci, stiller, adalar, poker fişleri, Studio, Yaratıcı Pazarı …", "vs.a.fee": "İşlem başına %2: %1 $ARCIRCLE geri alım & yakım, %1 oyun geliştirme",
    "vs.b.what": "ARCIRCLE'ın ekosistem tokeni", "vs.b.chain": "Arc", "vs.b.get": "Arc'ta takas et ya da oyunda USDC ile al", "vs.b.use": "Premium eşyalar, arabalar, LAND, yapay zekâ ajanları — her ödemenin yarısı yakılır", "vs.b.fee": "Oyun içi ödemeler: %50 yakım / %50 hazine",
    "live.earn": "21 Ekim'den beri oyuncuların kazandığı ARCL", "live.spent": "Oyunda harcanan ARCL", "live.days": "Son 7 günde kazanılan ARCL", "live.ex": "$ARCIRCLE ile takas edilen ARCL", "live.src": "Oyuncular nerede kazandı (son 30 gün)", "live.mine": "ARCL bakiyem & geçmişim →", "live.note": "Sunucumuzun defterinden canlı — her ARCL hareketi kaydedilir.", "live.wait": "Canlı rakamlar yükleniyor…", "live.off": "Canlı rakamlar şu an alınamıyor.",
    "fee.k": "Tokenomik · %2 ücret", "fee.h": "Her işlem dünyayı besler", "fee.p": "Her ARCL işleminde %2 ücret var, ikiye bölünür — iki yarısı da doğrudan ARCIRCLE'a döner.", "fee.c": "işlem başı",
    "fee.a.h": "$ARCIRCLE geri alım & yakım", "fee.a.p": "Her işlemin %1'i $ARCIRCLE alır ve yakar — oyun coininin hareketi ekosistem tokeninin arzını azaltır.",
    "fee.b.h": "Oyun geliştirme & oyun içi kullanım", "fee.b.p": "%1 yeni oyunları, içeriği ve grafikleri, ayrıca oyun içindeki ARCL ödül ve kullanımlarını finanse eder.",
    "fee.note": "Oyun içi ARCL'nde (bugünkü hesap bakiyen) ücret yok: %2, Robinhood Chain'deki ARCL coini işlemlerine uygulanır.",
    "earn.k": "Nerede kazanılır", "earn.h": "Ne oynarsan oyna. ARCL kazan.", "earn.p": "ARCL yalnızca sunucunun doğrulayabildiği şeyler için ödenir — ölçtüğü bir yarış, izlediği bir oyun, kırdığın bir kaya. Her etkinliğin kendi günlük sınırı var; herkes için adil.",
    "tab.games": "Oyunlar", "tab.world": "Dünya", "tab.daily": "Günlük & haftalık", "tab.social": "Arkadaşlar & adalar",
    "r1.h": "Sunucu doğrular", "r1.p": "Yarışlar, oyunlar ve boss savaşları sunucunun saatiyle doğrulanır. Doğrulanamayan sonuca ödeme yok.",
    "r2.h": "Günlük sınırlar", "r2.p": "Her etkinliğin kendi sınırı var; kasabada alınan oyun ödülleri günde 30.000 ARCL'yi paylaşır. Oyun büyüdükçe sınırlar artar.",
    "r3.h": "Hafta sonu 2×", "r3.p": "Cumartesi ve pazar (Seul saati) av, sokak, boss ve giriş ödülleri iki katı.",
    "ex.k": "Takas", "ex.h": "ARCL'yi $ARCIRCLE'a çevir", "ex.p": "Oyundaki takas bugün açık ve Arc'taki ARCIRCLE hazinesi tarafından sonuçlandırılıyor. Değerin oyuna girip çıktığı her yol:",
    "x1.h": "ARCL → $ARCIRCLE", "x1.p": "Oyunun Takas penceresinde iste. Hazine kuru açıklar (açılış kuru 10 ARCL = 1 $ARCIRCLE) ve her isteği Arc'ta kendi cüzdanından öder; sunucu makbuzu kontrol eder. Cüzdan başına günde en fazla 300.000 $ARCIRCLE, her ödeme herkese açık kayıtta.",
    "x3.h": "USDC ile $ARCIRCLE al", "x3.p": "Ödemede $ARCIRCLE yetmiyor mu? Oyun kalanını Arc'ta USDC'den takas eder (Uniswap v4) — her adımı cüzdanında onaylarsın.",
    "x4.h": "Yaratıcı Takası", "x4.p": "Yaratıcılar Yaratıcı Pazarı'ndan ARCL kazanır (80 / 20). Alıcıların satın alınmış ARCL ile ödediği pay 14 gün sonra takas edilebilir, bir GM'in kendi cüzdanından ödenir.",
    "x5.h": "Robinhood Chain'de ARCL", "x5.p": "Lansmandan itibaren ARCL, Robinhood Chain'de kendi coini olarak işlem görür; %2 ücret: %1 $ARCIRCLE geri alım & yakım, %1 oyun için.",
    "x6.h": "Oyun içi ARCL'nin coinle bağlantısı", "x6.p": "Oyun içi ARCL'nin coinle nasıl bağlanacağı X ve Telegram'da duyurulacak. O zamana kadar bakiyen hesabında kalır ve oyunun her yerinde çalışır.",
    "tag.live": "Açık", "tag.launch": "3 Kasım", "tag.soon": "X & TG'de duyurulacak",
    "exl.n": "sonuçlanan takas", "exl.arcl": "takas edilen ARCL", "exl.burn": "oyun içi ödemelerle yakılan $ARCIRCLE",
    "use.k": "Oyun içi kullanım", "use.h": "Değdiği yerde harca", "use.p": "ARCL, ARCIRCLE WORLD'de seni daha güçlü, daha hızlı ve daha havalı yapar. Bugün ödediği şeylerden bazıları:",
    "road.k": "Yol haritası", "road.h": "Oyun puanından oyun coinine",
    "t1.k": "Ekim 2026", "t1.h": "9 oyunda ARCL", "t1.p": "ARCIRCLE WORLD'ün her yerinde kazanılıp harcanıyor; defter her hareketi kaydediyor.",
    "t2.k": "2 Kasım", "t2.h": "Takas yeniden açıldı", "t2.p": "ARCL → $ARCIRCLE, Arc'taki hazine tarafından, herkese açık kayıtla.",
    "t3.k": "3 Kasım · TSİ 14:00", "t3.h": "ARCL Robinhood Chain'de çıkıyor", "t3.p": "Oyun coini zincire çıkıyor — %2 ücret: %1 $ARCIRCLE geri alım & yakım, %1 oyun.",
    "t4.k": "Sırada", "t4.h": "Oyun içi ARCL coinle buluşuyor", "t4.p": "İkisinin bağlantısı, daha çok oyun ve kullanım — her adım X ve Telegram'da.",
    "safe.h": "Yalnızca resmi bağlantılar", "safe.p": "ARCL kontrat adresi yalnızca X'te @ARCIRCLEonArc ve resmi Telegram'da — canlı olunca da bu sayfada — paylaşılır. ARCIRCLE'dan kimse sana önce DM atmaz, seed ifadeni istemez ya da coin göndermeni istemez.",
    "ca.pend": "Kontrat adresi: lansmanda X ve Telegram'da paylaşılacak", "ca.copy": "Kopyala", "ca.copied": "Kopyalandı!", "ca.view": "Gezginde gör",
    "faq.k": "Sorular", "faq.h": "Bilmekte fayda var",
    "q1": "ARCL nedir?", "a1": "ARCIRCLE WORLD'ün coini. Oynayarak kazanırsın — yarışlar, oyunlar, baskınlar, bulmacalar, madencilik, av — ve ekipman, demirci, stiller, adalar, poker fişleri ve daha fazlasına harcarsın. 3 Kasım'da Robinhood Chain'de kendi coini olarak çıkıyor.",
    "q2": "ARCL ile $ARCIRCLE aynı mı?", "a2": "Hayır. $ARCIRCLE Arc'taki ekosistem tokeni (premium eşyalar, LAND, yapay zekâ ajanları, her ödemenin yarısı yakılır). ARCL yalnızca oyuna odaklı oyun coini — ve %2 ücreti $ARCIRCLE geri alır ve yakar.",
    "q3": "Ne zaman, nerede çıkıyor?", "a3": "3 Kasım 2026 Salı, TSİ 14:00 (UTC 11:00 · Kore 20:00), Robinhood Chain'de. En fazla 30 dakika gecikebilir — canlı durum için X ve Telegram.",
    "q4": "Ücret ne kadar?", "a4": "İşlem başına %2: %1 $ARCIRCLE geri alım ve yakım, %1 oyunun geliştirilmesi ve oyun içinde kullanılan ARCL için.",
    "q5": "Oyunda zaten olan ARCL'me ne olacak?", "a5": "Hesabında kalır; her oyunda ve Takas'ta çalışmaya devam eder. Oyun içi ARCL'nin coinle nasıl bağlanacağı X ve Telegram'da duyurulacak — bugün bir şey yapmana gerek yok.",
    "q6": "Kontrat adresini nerede bulurum?", "a6": "Yalnızca X'te @ARCIRCLEonArc, resmi Telegram ve canlı olunca bu sayfa. DM'den gelen adresi asla kullanma.",
    "q7": "Oynamak için ARCL almam gerekir mi?", "a7": "Hayır. ARCIRCLE WORLD telefonda ve bilgisayarda ücretsiz; her oyun oynamak için ARCL öder.",
    "q8": "Kazanç garantili mi?", "a8": "Hayır. Ödüller günlük sınırlar içinde oyun içindir ve coin fiyatları iki yöne de hareket eder. Bu sayfadaki hiçbir şey yatırım tavsiyesi değildir.",
    "fin.h": "Bugün ARCL kazanmaya başla", "fin.p": "Telefonda ve bilgisayarda ücretsiz. Oyunda kazandığın her ARCL sunucumuz tarafından sayılır.",
    "foot.fine": "Oyun ödülleri oyun içindir ve asla garanti değildir. Coin fiyatları iki yöne de hareket eder. Bu sayfadaki hiçbir şey yatırım tavsiyesi değildir.",
    "src.other": "Diğer",
    "e.mine.h": "ARCL Madeni", "e.mine.a": "Kaya başı 10 – 10.000", "e.mine.p": "Mağarada bakır, gümüş ve altın kayaları kır; iyi kazma daha zengin kaya demek. Cevher çantası Jurassic World ile ortak.", "e.mine.l": "Günde en fazla 40.000",
    "e.surv.h": "SURVIVORS ARENA", "e.surv.a": "Oyun başı en fazla 3.000", "e.surv.p": "ARON, LUMI ya da NEX ile 12 dakika sürüye dayan — Zor en fazla 5.000. Hızlı ve Sonsuz modlar da var.", "e.surv.l": "Günün ilk 3 oyunu · günde 10.000",
    "e.raidq.h": "RAID QUEENS", "e.raidq.a": "Galibiyet başı 2.000 · 3.000 · 5.000", "e.raidq.p": "Lysitha, Solvira ya da Nyxara'yı devir. Her kraliçenin günlük ilk galibiyeti ×1,5, ZOR mod ×1,6.", "e.raidq.l": "Günde 3 oyun",
    "e.kart.h": "ARCIRCLE KART", "e.kart.a": "500 / 350 / 250 / 150 / 100", "e.kart.p": "Beş pistte CRYPTO LEGENDS ile yarış — sıralamana göre. Günlük meydan okuma +300.", "e.kart.l": "Günün ilk 5 yarışı · günde 2.500",
    "e.rings.h": "INFINITY RINGS", "e.rings.a": "Yeni yıldız başı 100", "e.rings.p": "200 seviye halka bulmacası (101–200: yıldız başı 50). Üç günlük bulmaca da 3 yıldızsa +300.", "e.rings.l": "Günde en fazla 10.000",
    "e.jump.h": "COIN JUMP", "e.jump.a": "3.000", "e.jump.p": "Taca kadar tırman.", "e.jump.l": "Günde bir kez",
    "e.jur.h": "JURASSIC WORLD", "e.jur.a": "Görev başı 300", "e.jur.p": "Katılmak yeterli üç günlük görev. Boss saati avcı payı 200 / 300, tutulan gece baskını 150.", "e.jur.l": "Günde 3 görev",
    "e.poker.h": "ARCIA POKER LOUNGE", "e.poker.a": "Görev başı 300", "e.poker.p": "Üç günlük görev: solo oyun bitir, masa eli oyna, blackjack oyna. Kazanmak için değil — fişler oyun parası.", "e.poker.l": "Günde 3 görev",
    "e.defense.h": "AC DEFENSE", "e.defense.a": "Dalga başı 5", "e.defense.p": "Kuleleri koru. Haftanın ilk 3'ü 10.000 / 5.000 / 2.500 kazanır.", "e.defense.l": "Günde en fazla 150",
    "e.hunt.h": "Av alanları", "e.hunt.a": "Dolandırıcı başı 5 – 12", "e.hunt.p": "12 av alanında dolandırıcıları devir — seviyelerine göre. Her alanın bossu 30.", "e.hunt.l": "Günde 100 · boss günde 30",
    "e.street.h": "Kasaba sokakları", "e.street.a": "Dolandırıcı 5 · coin 2", "e.street.p": "Sokak dolandırıcıları ve kasabada yerde duran ARCL coinleri.", "e.street.l": "Her biri günde 100",
    "e.hw.h": "HALLOWEEN REALM", "e.hw.a": "Gece ×1,5", "e.hw.p": "Lanetli Gece'de avla 1,5× ARCL (Kanlı Ay ×2), Şeker mi Şaka mı 20–60.", "e.hw.l": "Günlük sınırlar içinde",
    "e.codex.h": "Eşya Kodeksi", "e.codex.a": "Kilometre taşları", "e.codex.p": "Ekipman türleri topla: 10, 25, 50, 100 ve 175'in tamamı birer kez ARCL öder.", "e.codex.l": "Her biri bir kez",
    "e.sell.h": "Demircide ekipman sat", "e.sell.a": "Parça başı 6 – 260", "e.sell.p": "Fazla ekipman nadirliğine göre satılır.", "e.sell.l": "Günde en fazla 1.500",
    "e.daily.h": "Günlük giriş", "e.daily.a": "20 + seri", "e.daily.p": "Serinin her günü +5, en fazla +30.", "e.daily.l": "Günde bir kez",
    "e.fountain.h": "Meydan çeşmesi", "e.fountain.a": "10", "e.fountain.p": "Bir coin at, dilek tut.", "e.fountain.l": "Günde bir kez",
    "e.welcome.h": "Hoş geldin haftası", "e.welcome.a": "7 hediye", "e.welcome.p": "Yeni oyuncunun ilk haftası — hediyeler arasında 500, 1.000 ve 1.500 ARCL.", "e.welcome.l": "Her biri bir kez",
    "e.weekly.h": "Haftalık hedefler", "e.weekly.a": "40 / 100 / 200", "e.weekly.p": "Haftada 100 / 300 / 600 canavar ödülü, ayrıca parti görevi ve haftalık baskın bossu.", "e.weekly.l": "Haftada birer kez",
    "e.heart.h": "Arkadaşlardan kalpler", "e.heart.a": "Her biri 100", "e.heart.p": "Arkadaşların sana kalp gönderir — sen de gönder.", "e.heart.l": "Günde en fazla 5",
    "e.village.h": "Haftanın köyü", "e.village.a": "500 / 300 / 150", "e.village.p": "Haftanın ilk 3 köyü; ayın ilk 3'ü 2.000 / 1.000 / 500.", "e.village.l": "Her hafta",
    "e.likes.h": "Ada beğenileri & damgalar", "e.likes.a": "10 → 120", "e.likes.p": "Adana beğeniler (1 / 10 / 50), başkalarına bıraktığın damgalar (her biri 5, günde 3), ada kilometre taşları.", "e.likes.l": "Her biri bir kez",
    "e.launch.h": "ArcPad'de coin çıkar", "e.launch.a": "100", "e.launch.p": "Kendi coinini çıkar; $ARCIRCLE tutarak 50 daha.", "e.launch.l": "Bir kez",
    "u.shop.h": "Adalar & tuğlalar", "u.shop.a": "100 – 20.000", "u.shop.p": "On ada stili (Çimen 1.500 → Volkan 20.000), 48×48 genişletme (1.500) ve 100–1.000 malzeme tuğlaları.",
    "u.forge.h": "Demirci", "u.forge.a": "20 – 650", "u.forge.p": "İksirler (5'i 30, 20'si 100), dönüş parşömenleri ve üretim, güçlendirme, birleştirme ve onarım için hurda (100'ü 150, 500'ü 650).",
    "u.mine.h": "Kazma yükseltmeleri", "u.mine.a": "ARCL Madeni", "u.mine.p": "İyi kazmalar daha zengin kayaları daha hızlı kırar.",
    "u.chips.h": "Poker fişleri", "u.chips.a": "Tek yön", "u.chips.p": "ARCL'yi ARCIA Poker Lounge masaları, Sit & Go ve blackjack fişlerine çevir (fişler geri dönmez).",
    "u.style.h": "Stiller & boyalar", "u.style.a": "Görünüşün", "u.style.p": "Kahraman boyaları, izler ve meydan stilleri; Halloween Realm'in Balkabağı ve Hayalet boyaları (4.000 / 6.000).",
    "u.market.h": "Yaratıcı Pazarı", "u.market.a": "%80 yaratıcıya", "u.market.p": "Diğer oyuncuların yaptığı ada planlarını iki dokunuşla al — yaratıcı %80 kazanır.",
    "u.studio.h": "ARCIRCLE Studio", "u.studio.a": "50 · 1.500", "u.studio.p": "Ücretsiz kotadan sonra: yapay zekâ yönetmen değişikliği (50), kendi Meshy 3D varlığın (1.500), pazardaki prefablar.",
    "u.more.h": "Ve dahası", "u.more.a": "Her oyun", "u.more.p": "Ajan işleri, dino ikramları, Crimson Celestial güçlendirme ve pazarı, ve açılan her yeni oyunun mağazası.",
  };
  var TR_SRC = { mine: "ARCL Madeni", halloween: "Halloween", surv: "SURVIVORS", defweek: "AC Defense (hafta)", hunt: "Av alanları", launch: "Coin lansmanları", jur: "Jurassic World", kart: "KART", jump: "Coin Jump", welcome: "Hoş geldin haftası", raidq: "RAID QUEENS", rings: "INFINITY RINGS", codex: "Eşya Kodeksi", street: "Sokaklar", boss: "Bosslar", sell: "Demirci satışı", pickup: "Sokak coinleri", daily: "Giriş" };

  var DICT = { en: EN, ko: KO, zh: ZH, tr: TR }, SRCS = { en: SRC, ko: KO_SRC, zh: ZH_SRC, tr: TR_SRC };
  var LOC = { en: "en-US", ko: "ko-KR", zh: "zh-CN", tr: "tr-TR" };
  var lang = (function () { try { var l = localStorage.getItem("arc.gw.lang"); if (DICT[l]) return l; } catch (e) { /* private */ } var n = (navigator.language || "en").slice(0, 2); return DICT[n] ? n : "en"; })();
  var t = function (k, v) { var s = (DICT[lang] && DICT[lang][k]) || EN[k] || k; return v ? s.replace(/\{(\w+)\}/g, function (_, x) { return v[x] != null ? v[x] : ""; }) : s; };
  var fmt = function (n) { return Math.round(Number(n) || 0).toLocaleString(LOC[lang] || "en-US"); };
  var tab = "games", coins = null;

  // ---------------- painting ----------------
  function paintStatic() {
    document.documentElement.lang = lang;
    $$("[data-i]").forEach(function (e) { e.textContent = t(e.getAttribute("data-i")); });
    var row = function (side, k) { return "<dt>" + esc(t("vs." + k)) + "</dt><dd>" + esc(t("vs." + side + "." + k)) + "</dd>"; };
    $("#al-vs").innerHTML = ["a", "b"].map(function (s) { return '<article class="al-vc ' + s + ' al-rv"><h3><img src="' + (s === "a" ? "/images/arcl2-256.webp" : "/images/ui/exchange/coin-arc.webp") + '" alt="" width="52" height="52">' + esc(t("vs." + s)) + "</h3><dl>" + ["what", "chain", "get", "use", "fee"].map(function (k) { return row(s, k); }).join("") + "</dl></article>"; }).join("");
    $("#al-split").innerHTML = '<div class="al-sp al-rv"><img src="' + IC("burn") + '" alt=""><div><b>1%</b><strong>' + esc(t("fee.a.h")) + "</strong><p>" + esc(t("fee.a.p")) + '</p></div></div><div class="al-sp g al-rv"><img src="' + IC("dev") + '" alt=""><div><b>1%</b><strong>' + esc(t("fee.b.h")) + "</strong><p>" + esc(t("fee.b.p")) + "</p></div></div>";
    $("#al-earn-tabs").innerHTML = ["games", "world", "daily", "social"].map(function (k) { return '<button type="button" class="al-tab" role="tab" data-tab="' + k + '" aria-selected="' + (k === tab) + '">' + esc(t("tab." + k)) + "</button>"; }).join("");
    paintEarn();
    $("#al-earn-rules").innerHTML = [1, 2, 3].map(function (i) { return '<div class="al-rule"><b>' + esc(t("r" + i + ".h")) + "</b>" + esc(t("r" + i + ".p")) + "</div>"; }).join("");
    var X = [["x1", "exchange", "live", 1], ["x3", "shop", "live"], ["x4", "market", "live"], ["x5", "chain", "launch"], ["x6", "clock", "soon"]];
    $("#al-ex").innerHTML = X.map(function (x) { return '<article class="al-step al-rv' + (x[3] ? " big" : "") + '"><img src="' + IC(x[1]) + '" alt=""><span class="tag' + (x[2] === "soon" ? " soon" : "") + '">' + esc(t("tag." + x[2])) + "</span><h3>" + esc(t(x[0] + ".h")) + "</h3><p>" + esc(t(x[0] + ".p")) + "</p></article>"; }).join("");
    $("#al-use").innerHTML = USE.map(function (u) { return card("u." + u[0], u[1], false); }).join("");
    var phase = A.phase ? A.phase() : "soon";
    $("#al-tl").innerHTML = [1, 2, 3, 4].map(function (i) { var cls = i < 3 ? "done" : i === 3 ? (phase === "soon" ? "now" : "done") : phase === "soon" ? "" : "now"; return '<li class="al-rv ' + cls + '"><small>' + esc(t("t" + i + ".k")) + "</small><b>" + esc(t("t" + i + ".h")) + "</b><p>" + esc(t("t" + i + ".p")) + "</p></li>"; }).join("");
    $("#al-faq").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return "<details class=\"al-rv\"" + (i === 1 ? " open" : "") + "><summary>" + esc(t("q" + i)) + "</summary><p>" + esc(t("a" + i)) + "</p></details>"; }).join("");
    paintCa(); paintZones(); paintLive(); watchReveal(); tickNow(true);
  }
  function card(key, icon, lim) { return '<article class="al-card al-rv"><img src="' + IC(icon) + '" alt="" loading="lazy"><div><h3>' + esc(t(key + ".h")) + '</h3><span class="amt">' + esc(t(key + ".a")) + "</span><p>" + esc(t(key + ".p")) + "</p>" + (lim ? '<span class="lim">' + esc(t(key + ".l")) + "</span>" : "") + "</div></article>"; }
  function paintEarn() { $("#al-earn").innerHTML = EARN.filter(function (e) { return e[2] === tab; }).map(function (e) { return card("e." + e[0], e[1], true); }).join(""); watchReveal(); }
  function paintCa() {
    var el = $("#al-ca"); if (!el) return;
    if (A.ca) el.innerHTML = "<code>" + esc(A.ca) + '</code><button type="button" id="al-ca-copy">' + esc(t("ca.copy")) + '</button><a href="' + esc(A.explorer + "/token/" + A.ca) + '" target="_blank" rel="noopener">' + esc(t("ca.view")) + "</a>";
    else el.innerHTML = '<span class="pend">🔒 ' + esc(t("ca.pend")) + '</span><a href="' + esc(A.x) + '" target="_blank" rel="noopener">X</a><a href="' + esc(A.tg) + '" target="_blank" rel="noopener">Telegram</a>';
  }
  // the launch in the reader's language, US Eastern first, then their own time and five more zones
  function fmtZ(zone, o) { try { return new Intl.DateTimeFormat(LOC[lang] || "en-US", Object.assign({ timeZone: zone }, o)).format(new Date(A.launch)); } catch (e) { return ""; } }
  // each language names its own zone first (en ET, ko KST, zh 北京时间, tr TSİ), then the reader's own time and the rest
  var MAINZ = { en: ["America/New_York", "ET"], ko: ["Asia/Seoul", "KST"], zh: ["Asia/Shanghai", "北京时间"], tr: ["Europe/Istanbul", "TSİ"] };
  function paintZones() {
    var mz = MAINZ[lang] || MAINZ.en;
    $("#al-when-main").textContent = fmtZ(mz[0], { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " · " + fmtZ(mz[0], { hour: "numeric", minute: "2-digit" }) + " " + mz[1];
    var you = ""; try { you = new Intl.DateTimeFormat(LOC[lang] || "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(A.launch)); } catch (e) { /* old browser */ }
    $("#al-when-you").textContent = you ? t("cd.you", { t: you }) : "";
    var Z = [["ET", "America/New_York"], ["PT", "America/Los_Angeles"], ["UTC", "UTC"], ["KST", "Asia/Seoul"], ["北京", "Asia/Shanghai"], ["TSİ", "Europe/Istanbul"], ["SGT", "Asia/Singapore"]].filter(function (z) { return z[1] !== mz[0]; });
    $("#al-zones").innerHTML = Z.map(function (z) { return "<li><b>" + esc(z[0]) + "</b>" + esc(fmtZ(z[1], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })) + "</li>"; }).join("");
  }
  function paintLive() {
    var el = $("#al-live"); if (!el) return;
    if (coins === null) { el.innerHTML = '<p class="al-fine">' + esc(t("live.wait")) + "</p>"; return; }
    if (!coins || !coins.arcl) { el.innerHTML = '<p class="al-fine">' + esc(t("live.off")) + "</p>"; return; }
    var a = coins.arcl, week = (a.days || []).slice(0, 7).reduce(function (s, d) { return s + (d.earn || 0); }, 0), ex = (coins.swap && coins.swap.sold) || {};
    var src = Object.keys(a.earn || {}).map(function (k) { return [k, a.earn[k]]; }).sort(function (x, y) { return y[1] - x[1]; }), top = src.slice(0, 8), rest = src.slice(8).reduce(function (s, x) { return s + x[1]; }, 0);
    if (rest) top.push(["__other", rest]);
    var max = top.length ? top[0][1] : 1, names = SRCS[lang] || SRC;
    el.innerHTML = [["live.earn", a.all && a.all.earned], ["live.days", week], ["live.spent", a.all && a.all.spent], ["live.ex", ex.arcl]].map(function (s) { return '<div class="al-stat al-rv"><b data-n="' + (s[1] || 0) + '">0</b><span>' + esc(t(s[0])) + "</span></div>"; }).join("") +
      '<div class="al-src al-rv"><h4>' + esc(t("live.src")) + "</h4>" + top.map(function (x) { return '<div class="al-src-r"><span>' + esc(x[0] === "__other" ? t("src.other") : names[x[0]] || SRC[x[0]] || x[0]) + '</span><i style="width:' + Math.max(2, (x[1] / max) * 100).toFixed(1) + '%"></i><em>' + fmt(x[1]) + "</em></div>"; }).join("") + "<small>" + esc(t("live.note")) + "</small></div>";
    var exl = $("#al-exlive"); if (exl) { var sh = coins.shop || {}; exl.innerHTML = [["exl.n", ex.n], ["exl.arcl", ex.arcl], ["exl.burn", sh.burned]].map(function (s) { return '<div class="al-stat al-rv" style="border-color:#0b0d06"><b data-n="' + (s[1] || 0) + '">0</b><span>' + esc(t(s[0])) + "</span></div>"; }).join(""); }
    watchReveal();
  }
  // numbers count up once they're seen; sections fade in
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; e.target.classList.add("in"); io.unobserve(e.target); $$("[data-n]", e.target).forEach(countUp); if (e.target.matches("[data-n]")) countUp(e.target); if (e.target.id === "al-donut") donut(); }); }, { threshold: 0.15 }) : null;
  function watchReveal() { $$(".al-rv:not(.in)").forEach(function (e) { if (io) io.observe(e); else e.classList.add("in"); }); var d = $("#al-donut"); if (d && io && !d.dataset.w) { d.dataset.w = 1; io.observe(d); } else if (d && !io) donut(); }
  function countUp(el) { if (el.dataset.done) return; el.dataset.done = 1; var n = +el.dataset.n || 0, t0 = performance.now(), D = 1400; (function step(now) { var u = Math.min(1, (now - t0) / D), k = 1 - Math.pow(1 - u, 3); el.textContent = fmt(n * k); if (u < 1) requestAnimationFrame(step); })(t0); }
  function donut() { var C = 2 * Math.PI * 84, a = $(".al-dn-a"), b = $(".al-dn-b"); if (!a) return; var g = 6; a.style.strokeDasharray = (C / 2 - g) + " " + C; b.style.strokeDasharray = (C / 2 - g) + " " + C; b.style.strokeDashoffset = -(C / 2); }

  // ---------------- the countdown ----------------
  var units = {}; $$("[data-u]").forEach(function (b) { units[b.getAttribute("data-u")] = b; });
  var last = {}, flashed = false;
  var pad = function (n) { return n < 10 ? "0" + n : String(n); };
  function tickNow(force) {
    var now = Date.now(), cd = $("#al-cd"), ph = A.phase ? A.phase(now) : now < A.launch ? "soon" : now < A.delayEnd ? "window" : "live";
    if (ph === "live" && A.ca) ph = "on";
    var left = Math.max(0, A.launch - now), s = Math.floor(left / 1000);
    var v = { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
    var shown = ph === "soon" && left < 60e3 ? "final" : ph === "on" ? "live" : ph;
    if (cd.getAttribute("data-phase") !== shown || force) { cd.setAttribute("data-phase", shown); paintPhase(ph); }
    if (ph === "soon") {
      Object.keys(v).forEach(function (k) { var txt = pad(v[k]); if (units[k] && last[k] !== txt) { units[k].textContent = txt; if (!force && last[k] != null) { units[k].classList.remove("tick"); void units[k].offsetWidth; units[k].classList.add("tick"); } last[k] = txt; } });
      $("#al-bar").style.width = (Math.min(1, Math.max(0, (now - ANNOUNCED) / (A.launch - ANNOUNCED))) * 100).toFixed(2) + "%";
      $("#al-mini-t").textContent = (v.d ? v.d + "d " : "") + pad(v.h) + ":" + pad(v.m) + ":" + pad(v.s);
    } else {
      if (!flashed && now - A.launch < 5 * 60e3) { flashed = true; burst(); }
      if (ph === "window") { var wl = Math.max(0, A.delayEnd - now); $("#al-cd-live-p").textContent = t("cd.win.p", { m: Math.ceil(wl / 60e3) }); $("#al-bar").style.width = ((1 - wl / (A.delayMin * 60e3)) * 100).toFixed(2) + "%"; }
      else $("#al-bar").style.width = "100%";
      $("#al-mini-t").textContent = ph === "window" ? "LIVE · " + pad(Math.floor((A.delayEnd - now) / 60e3)) + "m" : "ARCL";
    }
  }
  function paintPhase(ph) {
    var live = $("#al-cd-live"), k = $("#al-cd-k");
    if (ph === "soon") { live.hidden = true; k.textContent = t("cd.k"); return; }
    live.hidden = false; k.textContent = ph === "on" ? "ROBINHOOD CHAIN" : "ARCL · ROBINHOOD CHAIN";
    $("#al-cd-live-h").textContent = t(ph === "window" ? "cd.win.h" : ph === "on" ? "cd.on.h" : "cd.live.h");
    $("#al-cd-live-p").textContent = ph === "window" ? t("cd.win.p", { m: A.delayMin }) : t(ph === "on" ? "cd.on.p" : "cd.live.p");
  }
  function burst() { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; var f = document.createElement("div"); f.className = "al-flash"; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 1500); sparks.boom = 1; }
  // the mini countdown in the bar once the big one is out of sight
  var heroIo = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { $("#al-mini").classList.toggle("on", !es[0].isIntersecting); }, { threshold: 0 }) : null;
  if (heroIo) heroIo.observe($("#al-cd"));

  // ---------------- sparks: lime embers rising round the coin (one canvas, paused when hidden) ----------------
  var sparks = { boom: 0 };
  (function () {
    var cv = $("#al-sparks"); if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var c = cv.getContext("2d"), P = [], W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), N = innerWidth < 760 ? 40 : 90, seen = true;
    function size() { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function add(boom) { return { x: boom ? W * (0.55 + Math.random() * 0.3) : Math.random() * W, y: boom ? H * 0.45 : H + Math.random() * 40, vx: (Math.random() - 0.5) * (boom ? 9 : 0.6), vy: -(boom ? 4 + Math.random() * 8 : 0.4 + Math.random() * 1.3), r: 0.8 + Math.random() * 2.4, a: 0.4 + Math.random() * 0.6, life: 1 }; }
    size(); addEventListener("resize", size); for (var i = 0; i < N; i++) { var p = add(); p.y = Math.random() * H; P.push(p); }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }).observe(cv);
    (function frame() {
      requestAnimationFrame(frame); if (!seen || document.hidden) return;
      if (sparks.boom) { sparks.boom = 0; for (var j = 0; j < 160; j++) P.push(add(true)); }
      c.clearRect(0, 0, W, H); c.globalCompositeOperation = "lighter";
      for (var k = P.length - 1; k >= 0; k--) { var q = P[k]; q.x += q.vx; q.y += q.vy; q.vy *= 0.995; if (q.y < -10 || q.x < -10 || q.x > W + 10) { if (P.length > N) { P.splice(k, 1); continue; } P[k] = add(); continue; }
        c.beginPath(); c.arc(q.x, q.y, q.r, 0, 7); c.fillStyle = "rgba(" + (k % 7 ? "204,255,0," : "60,203,255,") + q.a + ")"; c.fill(); }
      c.globalCompositeOperation = "source-over";
    })();
  })();

  // ---------------- the 3D coin (Meshy's model, three.js loaded only on a capable screen) ----------------
  (function () {
    var box = $("#al-coin3d"); if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches || !window.WebGLRenderingContext) return;
    var go = function () { import("/arcl-coin3d.js?v=1793606310").then(function (m) { return m.mount(box); }).catch(function () { /* the picture stays */ }); };
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 600);
  })();

  // ---------------- events ----------------
  document.addEventListener("click", function (e) {
    var tb = e.target.closest("[data-tab]"); if (tb) { tab = tb.getAttribute("data-tab"); $$("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b === tb); }); paintEarn(); return; }
    var lb = e.target.closest("[data-lang]"); if (lb) { lang = lb.getAttribute("data-lang"); try { localStorage.setItem("arc.gw.lang", lang); } catch (x) { /* private */ } $(".gw-lang-menu").hidden = true; paintStatic(); return; }
    var gl = e.target.closest(".gw-globe"); if (gl) { var m = $(".gw-lang-menu"); m.hidden = !m.hidden; gl.setAttribute("aria-expanded", String(!m.hidden)); return; }
    if (!e.target.closest(".gw-lang")) { var mm = $(".gw-lang-menu"); if (mm) mm.hidden = true; }
    if (e.target.closest("#al-cal")) { ics(); return; }
    if (e.target.closest("#al-ca-copy")) { try { navigator.clipboard.writeText(A.ca); e.target.textContent = t("ca.copied"); } catch (x) { /* no clipboard */ } }
  });
  function ics() {
    var z = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); };
    var body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE//ARCL launch//EN", "BEGIN:VEVENT", "UID:arcl-launch-2026@arcircle.app", "DTSTAMP:" + z(Date.now()), "DTSTART:" + z(A.launch), "DTEND:" + z(A.delayEnd),
      "SUMMARY:ARCL launches on Robinhood Chain", "DESCRIPTION:The ARCIRCLE WORLD game coin launches on Robinhood Chain (may start up to 30 min late). Official notices: " + A.x + " and " + A.tg, "URL:https://www.arcircle.app/arcl",
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:ARCL launches in 15 minutes", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" })); a.download = "arcl-launch.ics"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  paintStatic();
  setInterval(tickNow, 250);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tickNow(true); });
  fetch("/api/social?world=coins", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { coins = j || false; paintLive(); }).catch(function () { coins = false; paintLive(); });
  window.arcArcl = { t: t, phase: function () { return $("#al-cd").getAttribute("data-phase"); } }; // (tests)
})();
