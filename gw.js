// gw.js — the ARCIRCLE WORLD game site (game.html). Everything on the page comes from what's live in the game (the
// status map in CLAUDE.md): the eight games, the three heroes, the events, the notices. Nothing here is invented, and
// no reward is promised: ARCL are in-game points with daily limits, the KPIs are targets.
//   · the trailer behind PLAY FREE (480p on a phone, 720p elsewhere; the poster when data is saved or motion reduced)
//   · who's in the world now and how many have visited (the gate's own numbers: POST world-ping, GET ?world=stats)
//   · English by default; 한국어 / 中文 / Türkçe from the globe (kept in this browser)
(function () {
  "use strict";
  var $ = function (q, el) { return (el || document).querySelector(q); }, $$ = function (q, el) { return Array.prototype.slice.call((el || document).querySelectorAll(q)); };
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, coarse = matchMedia("(pointer: coarse)").matches;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  // ---------------- the words ----------------
  var GAMES = [
    { id: "jurassic", img: "jurassic", c: "#4ade80" }, { id: "surv", img: "surv", c: "#ff8a3a" }, { id: "poker", img: "poker", c: "#b46cff" }, { id: "rings", img: "rings", c: "#38d8ff" },
    { id: "mine", img: "mine", c: "#ffd23a" }, { id: "defense", img: "defense", c: "#5aa8ff" }, { id: "jump", img: "jump", c: "#2ee0b0" }, { id: "beat", img: "beat", c: "#ff6fc8" },
  ];
  var HEROES = [{ id: "aron", c: "#38d8ff" }, { id: "lumi", c: "#ff6fc8" }, { id: "nex", c: "#9b6bff" }];
  var NEWS = [{ d: "2026-10-20", img: "/images/games/rings.webp", b: "hot" }, { d: "2026-10-20", img: "/images/games/surv.webp", b: "hot" }, { d: "2026-10-20", img: "/images/games/poker.webp" }, { d: "2026-10-19", img: "/images/gw/hero-poster.webp" }, { d: "2026-10-19", img: "/images/games/jurassic.webp" }, { d: "2026-10-20", img: "/images/gw/heroes-800.webp", b: "fix" }];
  var EV_COL = [["#ff6a3d", "#b8173d"], ["#2f6bff", "#1a2f8a"], ["#2ee0b0", "#0e6a6a"], ["#9b6bff", "#3a1a8a"], ["#38d8ff", "#1c4fb8"], ["#ff8a3a", "#8a2a1a"], ["#b46cff", "#4a1a7a"], ["#4ade80", "#156a3a"], ["#ffb02e", "#8a4a00"]];
  var NOTE_D = ["2026-10-20", "2026-10-20", "2026-10-20", "2026-10-20", "2026-10-19", "2026-10-18"];

  var EN = {
    skip: "Skip to content", play: "Play free",
    "nav.games": "Games", "nav.heroes": "Heroes", "nav.features": "Features", "nav.how": "How to play", "nav.guide": "Guide", "nav.road": "Roadmap", "nav.events": "Events", "nav.news": "News", "nav.policy": "Play policy", "nav.pad": "Platform World",
    "hero.tag": "One world. Countless games.", "hero.sub": "Walk a living 3D planet with your hero, jump into eight games, build your island and earn ARCL along the way.", "hero.on": "playing now", "hero.vis": "visitors so far", "hero.note": "Phone & PC · no download · play first, sign in later",
    "news.h": "Featured news", "news.all": "All notices",
    "games.k": "Eight games, one world", "games.h": "Choose your game", "games.lead": "Every game lives in the Game Village. Walk in through its door, or open the Games list — your hero, your wallet and your ARCL come with you.", "games.also": "Also in town: the hoverboard race, the weekly raid boss, 5 near and 7 far hunting grounds, and ARCIRCLE LAND.",
    "heroes.k": "Characters", "heroes.h": "Three heroes. Your pick.", "heroes.lead": "Pick one, give it your colour and a name. All three grow the same way — level 1 to 100, gear in seven slots — and each brings its own style into SURVIVORS ARENA.",
    "feat.k": "Why ARCIRCLE WORLD", "feat.h": "Built to play together",
    "how.k": "Start in a minute", "how.h": "How to play", "how.phone": "On a phone", "how.pc": "On a PC",
    "guide.k": "Guide", "guide.h": "Good to know",
    "road.k": "Plan & goals", "road.h": "Where we're going", "road.lead": "Our vision: the Roblox of crypto — one living world, countless games. These are our targets for December 31, 2026. Targets, not promises.", "road.now": "Live now", "road.next": "Planned next", "road.fine": "Planned items have no fixed dates yet and may change.",
    "ev.k": "Events", "ev.h": "Every day, every week", "no.k": "Notices", "no.h": "Updates & notices", "pol.k": "Play policy", "pol.h": "Fair play, safe wallets",
    "cta.h": "Your world is waiting", "cta.p": "Free on phone and PC. Your hero is one tap away.", "cta.pad": "Go to Platform World",
    "foot.fine": "ARCL are in-game points. Rewards are for play and are never guaranteed. Nothing on this page is financial advice.",
    playG: "Play {g}", earn: "Rewards", perk: "Perk", skill: "Skill", inSurv: "In SURVIVORS ARENA", target: "Target", soFar: "{n} so far", online: "{n} online now", live: "LIVE NOW", weekend: "Sat–Sun (KST)", tbd: "Target only — no live number yet",
    games: {
      jurassic: ["Jurassic World", "Survival · open land", "A land of its own: six biomes and realistic dinosaurs. Gather wood, stone and ore, craft at a workbench, set up camp and get through the night.", ["Six biomes, day and night, rain", "Camps with huts, beds, a campfire and a chest", "Hunting — and danger after dark"], "No ARCL here yet: XP and resources (your ore bag is shared with the mine)."],
      surv: ["Survivors Arena", "Action · 12-minute survival", "Survive twelve minutes against waves and bosses. Pick upgrade cards, evolve your weapons and open chests.", ["3 heroes, 36 cards, weapon evolutions", "Reroll · Banish · Skip, the chest roulette", "Arena Coins → permanent upgrades, a daily challenge"], "Up to 3,000 ARCL a run, 3 paid runs a day (signed in). The daily challenge pays Arena Coins."],
      poker: ["ARCIA Poker Lounge", "Cards · Hold'em & Blackjack", "Walk a 3D lounge to ARCIA's table. Play Hold'em against four AI levels or real players at server-dealt tables, or blackjack against ARCIA.", ["Tables of 2–6, private codes and chat", "Free chips every day", "A weekly top and cosmetics"], "Chips are play money. ARCL comes from 3 daily missions — never from winning."],
      rings: ["Infinity Rings", "Puzzle · 200 levels", "Turn the rings, unhook them, clear the board. Ice, portal and timer rings, and two bosses.", ["10 chapters with chests and ring styles", "3 daily puzzles and a weekly theme", "TIME ATTACK with a weekly board"], "100 ARCL a new star (levels 101–200: 50), up to 10,000 a day. Time Attack: XP only."],
      mine: ["ARCL Mine", "Action · mining", "A side-on cave full of ore. Swing, upgrade your pickaxe and break bigger rocks.", ["Pickaxe tiers", "The ore bag is shared with Jurassic World"], "10–10,000 ARCL a rock."],
      defense: ["AC Defense", "Strategy · tower defence", "Place your towers and hold the line, wave after wave.", [], "5 ARCL a wave, up to 150 a day."],
      jump: ["Coin Jump", "Platformer · climb", "Jump from platform to platform all the way up to the crown.", [], "3,000 ARCL once a day for reaching the crown."],
      beat: ["Beat Stomp", "Rhythm", "Stomp to the beat and keep the combo going.", [], "XP only."],
    },
    heroes: {
      aron: ["ARON", "Blaster · attack", "The friendly white-and-blue robot with a halo — the face of ARCIRCLE WORLD.", "Attack +10%", "Overdrive — 12 lasers all around, then double fire rate"],
      lumi: ["LUMI", "Orb · area", "Pink, bright and quick to cheer — her orbs cover a wide area.", "Area +15%", "Bloom — heal 30% and slow the crowd"],
      nex: ["NEX", "Laser · speed", "Dark armour and glowing eyes — fast, sharp and hard to catch.", "Move speed +12%", "Blink — teleport through them with a blast"],
    },
    news: [
      ["Update", "INFINITY RINGS doubles to 200 levels", "Ice, portal and timer rings, the RIFT BOSS at 200, weekly puzzles and a 60-second Time Attack."],
      ["Update", "SURVIVORS ARENA major update", "Reroll, Banish & Skip, the chest roulette, permanent upgrades, achievements and a daily challenge."],
      ["Update", "The poker lounge is now a 3D room", "Walk your hero to ARCIA's table. Players sit as heroes — and cheer when they win."],
      ["New", "ARCIRCLE LAND opens", "20 villages on the town's outer ring. Your island stands on your village for everyone to see."],
      ["Update", "Jurassic World: camps and survival", "Craft at a workbench, build huts and campfires, and get through the night."],
      ["Fix", "Smoother updates", "A page opened before an update now refreshes itself instead of failing to load a game."],
    ],
    feats: [["🌍", "One world, many games", "Eight games and a town to explore, all in one connected world."], ["💠", "Earn ARCL as you play", "In-game points for taking part, with daily limits. Exchange ARCL ⇄ $ARCIRCLE by request."], ["👛", "One wallet", "The same wallet, USDC and $ARCIRCLE as ARCIRCLE PAD. Play as a guest first."], ["🏝️", "Build your island", "A brick builder up to 36×36 (LAND owners 64×64), styles and a village score."], ["🤝", "Better together", "Chat, friends, crews, hunting parties and weekly bounties."], ["🦖", "Pets & dinosaurs", "Hatch pets and dinosaurs. Adult dinos fight beside you — and you can ride them."], ["⚔️", "An RPG at heart", "Level 1–100, gear in seven slots, a forge, and a weekly raid boss."], ["📱", "Phone & PC", "Runs in the browser, no download. English, 한국어, 中文 and Türkçe."]],
    steps: [["Press PLAY FREE", "The world opens in your browser. No download, no sign-up."], ["Make your hero", "Pick ARON, LUMI or NEX, a colour and a name."], ["Learn the moves", "Walk, jump, try the Launchpad, and knock out the training scammer."], ["Save & play", "Sign in with your wallet to keep your progress and earn ARCL — then open the Games list."]],
    ctlPhone: [["◎", "Left stick — move"], ["⤒", "Jump button"], ["⚔", "Attack and skill buttons"], ["▦", "The dock: Games, Character, Pets, Exchange"], ["☰", "Menu at the top right"]],
    ctlPc: [["WASD", "Move (or the arrow keys)"], ["Shift", "Run"], ["Space", "Jump"], ["E", "Use / enter a door"], ["Esc", "Leave / close"]],
    faq: [["Is it free?", "Yes. It's free to play in the browser on phone and PC. Some items cost ARCL that you earn in the game."], ["Do I need a wallet?", "No — play as a guest first. Sign in with a wallet to save your progress and earn ARCL."], ["What is ARCL?", "In-game points you earn by playing games, missions and daily check-ins. Each game has a daily limit."], ["Can I swap ARCL for $ARCIRCLE?", "Yes, by request in the Exchange window. The terms are shown there and can change."], ["What is ARCIRCLE LAND?", "20 villages on the town's outer ring, bought with $ARCIRCLE. The owner's island stands on the plot for everyone to see. LAND doesn't pay out."], ["How do invites work?", "Share your invite link. When your friend reaches level 5, you both get the invite reward."], ["What is Weekend 2×?", "On Saturdays and Sundays (Korea time), XP and ARCL from play are doubled."]],
    kpis: [["Registered players", "10,000+"], ["Peak concurrent players", "100+"], ["Playable games", "10+"], ["$ARCIRCLE market cap", "$5M+"], ["Partnerships & investment", "3+ signed"]],
    now: ["<b>8 games</b> in the Games list", "<b>Town & RPG</b> — level 1–100, gear, forge, raid boss", "<b>My Island</b> builder and <b>ARCIRCLE LAND</b>", "<b>Pets & DINO SOULMATE</b> — hatch, raise, ride", "<b>Crews, parties, chat</b>, friends and inbox", "<b>Seasons, quests & achievements</b>", "<b>4 languages</b>, phone and PC"],
    next: ["<b>AGENT DIMENSION</b> — your own AI agent in the world (in design)", "<b>SURVIVORS ARENA</b> 2-player co-op", "<b>Poker</b> Sit & Go tournaments and players walking the lounge", "<b>Jurassic World</b> ARCL rewards", "<b>Dino battles</b> in real time, and tournaments", "<b>Season 2</b> and a crew HQ"],
    events: [["🔥", "Weekend 2×", "Double XP and double ARCL from play.", "Sat–Sun (KST)"], ["📅", "Daily check-in", "Come back every day for your check-in reward.", "Every day"], ["🎁", "Launch gift & welcome week", "New players open a launch gift box and get a week of welcome rewards.", "New players"], ["🐉", "Weekly raid boss", "Team up against the week's raid boss in town.", "Every week"], ["♾️", "Infinity Rings daily puzzles", "Three puzzles for everyone. All three at 3 stars: +300 ARCL bonus.", "Every day"], ["⚔️", "Survivors daily challenge", "The same seed for everyone, a twist each day and its own board.", "Every day"], ["🃏", "Poker Opening Festival", "+50% chips on your first purchase in the lounge.", "Opening"], ["🏝️", "Weekly island contest", "Show off your island and vote for the best one of the week.", "Every week"], ["🛡️", "Daily scam quiz", "Learn to spot crypto scams — one quick quiz a day.", "Every day"]],
    notices: [["Pages opened before an update recover on their own", "If a game says it couldn't load right after an update, the page now refreshes itself."], ["INFINITY RINGS: levels 101–200 pay 50 ARCL a star", "Kept small while the new rings settle in. Levels 1–100 still pay 100 a star."], ["SURVIVORS ARENA: the daily challenge pays Arena Coins", "Daily challenge runs don't pay ARCL. Normal runs do: up to 3,000 a run, 3 paid runs a day."], ["Fixed: the town stopping at 75% while loading", "A date bug in the daily hunts. Fixed and covered by a test for the next ten years."], ["ARCIRCLE LAND is open", "20 villages, paid to the ARCIRCLE treasury from your own wallet. Refunds are listed in the LAND window."], ["Exchange: ARCL ⇄ $ARCIRCLE by request", "Open the Exchange from the dock. The terms are shown there."]],
    policy: [["🎮", "Fair play", ["One player, one account.", "No bots, scripts, auto-clickers or exploits — rewards earned that way can be withheld.", "Found a bug? Report it instead of using it."]], ["💠", "About rewards", ["ARCL are in-game points for taking part.", "Every game has a daily limit, and amounts can change.", "Nothing is guaranteed, and nothing here is investment advice."]], ["🛡️", "Wallet safety", ["We will never ask for your seed phrase or private key.", "Signing in only signs a log-in message. Payments (like LAND) always open in your own wallet for you to approve.", "Check that you're on arcircle.app."]], ["💬", "Community", ["Be kind in chat and guestbooks.", "No scams, spam, impersonation or hate.", "Players who break the rules can be muted or removed."]]],
  };
  var KO = {
    skip: "본문으로 건너뛰기", play: "무료 플레이",
    "nav.games": "게임", "nav.heroes": "캐릭터", "nav.features": "특징", "nav.how": "이용 방법", "nav.guide": "가이드", "nav.road": "로드맵", "nav.events": "이벤트", "nav.news": "새소식", "nav.policy": "이용 정책", "nav.pad": "플랫폼 월드",
    "hero.tag": "하나의 세계, 무한한 게임.", "hero.sub": "내 캐릭터로 살아 있는 3D 행성을 걷고, 8개의 게임에 뛰어들고, 섬을 짓고, 플레이하며 ARCL을 모으세요.", "hero.on": "명 플레이 중", "hero.vis": "누적 방문", "hero.note": "폰 & PC · 설치 없음 · 먼저 플레이, 로그인은 나중에",
    "news.h": "주목할 만한 소식", "news.all": "전체 공지",
    "games.k": "하나의 세계, 8개의 게임", "games.h": "게임을 선택하세요", "games.lead": "모든 게임은 게임 빌리지에 있어요. 문으로 걸어 들어가거나 게임 목록을 열면 돼요 — 캐릭터, 지갑, ARCL이 함께 따라와요.", "games.also": "마을에는 호버보드 레이스, 주간 레이드 보스, 가까운 사냥터 5곳·먼 사냥터 7곳, ARCIRCLE LAND도 있어요.",
    "heroes.k": "캐릭터", "heroes.h": "세 명의 영웅. 당신의 선택.", "heroes.lead": "하나를 골라 색과 이름을 정하세요. 셋 다 똑같이 성장해요 — 레벨 1~100, 장비 7칸 — 그리고 서바이버 아레나에서는 각자의 스타일을 보여 줘요.",
    "feat.k": "ARCIRCLE WORLD를 해야 하는 이유", "feat.h": "함께 놀기 위해 만든 세계",
    "how.k": "1분이면 시작", "how.h": "이용 방법", "how.phone": "폰에서", "how.pc": "PC에서",
    "guide.k": "가이드", "guide.h": "알아 두면 좋아요",
    "road.k": "플랜 & 목표", "road.h": "우리가 가는 길", "road.lead": "우리의 비전: 크립토의 로블록스 — 하나의 살아 있는 세계, 무한한 게임. 아래는 2026년 12월 31일까지의 목표예요. 약속이 아닌 목표입니다.", "road.now": "지금 플레이 가능", "road.next": "다음 계획", "road.fine": "계획 항목은 아직 날짜가 정해지지 않았고 바뀔 수 있어요.",
    "ev.k": "이벤트", "ev.h": "매일, 매주", "no.k": "공지사항", "no.h": "업데이트 & 공지", "pol.k": "이용 정책", "pol.h": "공정한 플레이, 안전한 지갑",
    "cta.h": "당신의 세계가 기다려요", "cta.p": "폰과 PC에서 무료. 캐릭터까지 한 번의 탭.", "cta.pad": "플랫폼 월드로 가기",
    "foot.fine": "ARCL은 게임 내 포인트입니다. 보상은 플레이에 대한 것이며 보장되지 않습니다. 이 페이지의 어떤 내용도 투자 조언이 아닙니다.",
    playG: "{g} 플레이", earn: "보상", perk: "특성", skill: "스킬", inSurv: "서바이버 아레나에서", target: "목표", soFar: "현재 {n}명", online: "지금 {n}명 접속 중", live: "진행 중", weekend: "토–일 (한국 시간)", tbd: "목표만 표시 — 실시간 수치는 아직 없어요",
    games: {
      jurassic: ["Jurassic World", "서바이벌 · 오픈 월드", "6개 지역과 사실적인 공룡이 사는 별도의 땅. 나무·돌·광석을 모으고, 작업대에서 제작하고, 캠프를 세워 밤을 버티세요.", ["6개 지역, 낮과 밤, 비", "오두막·침대·모닥불·상자가 있는 캠프", "사냥 — 그리고 어둠 속의 위험"], "아직 ARCL은 없어요: XP와 자원 (광석 가방은 광산과 공유)."],
      surv: ["Survivors Arena", "액션 · 12분 생존", "몰려오는 적과 보스를 상대로 12분을 버티세요. 업그레이드 카드를 고르고, 무기를 진화시키고, 상자를 여세요.", ["영웅 3명, 카드 36장, 무기 진화", "새로고침 · 제외 · 건너뛰기, 상자 룰렛", "아레나 코인 → 영구 강화, 데일리 챌린지"], "한 판 최대 3,000 ARCL, 하루 3판 (로그인 시). 데일리 챌린지는 아레나 코인을 줘요."],
      poker: ["ARCIA Poker Lounge", "카드 · 홀덤 & 블랙잭", "3D 라운지를 걸어 ARCIA의 테이블로. AI 4단계나 실제 플레이어와 서버가 딜하는 테이블에서 홀덤을, 또는 ARCIA와 블랙잭을.", ["2~6인 테이블, 비공개 코드, 채팅", "매일 무료 칩", "주간 순위와 꾸미기"], "칩은 게임용 돈이에요. ARCL은 하루 3개 미션에서 — 이겨서 받는 건 없어요."],
      rings: ["Infinity Rings", "퍼즐 · 200레벨", "링을 돌리고, 빼내고, 보드를 비우세요. 얼음·포털·시간 링과 보스 2명.", ["상자와 링 스타일이 있는 10챕터", "데일리 퍼즐 3개와 주간 테마", "주간 순위가 있는 타임어택"], "새 별마다 100 ARCL (101~200레벨: 50), 하루 최대 10,000. 타임어택은 XP만."],
      mine: ["ARCL Mine", "액션 · 채굴", "광석이 가득한 동굴. 곡괭이를 휘두르고 업그레이드해서 더 큰 바위를 깨세요.", ["곡괭이 단계", "광석 가방은 쥬라기 월드와 공유"], "바위 하나에 10~10,000 ARCL."],
      defense: ["AC Defense", "전략 · 타워 디펜스", "타워를 세우고 웨이브를 막아 내세요.", [], "웨이브당 5 ARCL, 하루 최대 150."],
      jump: ["Coin Jump", "플랫포머 · 오르기", "발판을 밟고 왕관까지 올라가세요.", [], "왕관에 닿으면 하루 한 번 3,000 ARCL."],
      beat: ["Beat Stomp", "리듬", "박자에 맞춰 밟고 콤보를 이어 가세요.", [], "XP만."],
    },
    heroes: {
      aron: ["ARON", "블래스터 · 공격", "후광을 단 친근한 흰색·파란색 로봇 — ARCIRCLE WORLD의 얼굴.", "공격력 +10%", "오버드라이브 — 사방으로 레이저 12발, 이어서 공격 속도 2배"],
      lumi: ["LUMI", "오브 · 범위", "핑크빛, 밝고 응원을 잘하는 — 넓은 범위를 덮는 오브.", "범위 +15%", "블룸 — 체력 30% 회복, 적 무리 감속"],
      nex: ["NEX", "레이저 · 속도", "어두운 갑옷과 빛나는 눈 — 빠르고 날카롭고 잡기 어려워요.", "이동 속도 +12%", "블링크 — 폭발과 함께 적들을 뚫고 순간이동"],
    },
    news: [["업데이트", "인피니티 링, 200레벨로 두 배", "얼음·포털·시간 링, 200레벨의 균열 보스, 주간 퍼즐, 60초 타임어택."], ["업데이트", "서바이버 아레나 대규모 업데이트", "새로고침·제외·건너뛰기, 상자 룰렛, 영구 강화, 업적, 데일리 챌린지."], ["업데이트", "포커 라운지가 3D 공간으로", "내 캐릭터가 ARCIA의 테이블까지 걸어가요. 플레이어는 캐릭터로 앉고, 이기면 환호해요."], ["신규", "ARCIRCLE LAND 오픈", "마을 바깥 링의 마을 20곳. 내 섬이 내 마을에 세워져 모두가 볼 수 있어요."], ["업데이트", "쥬라기 월드: 캠프와 생존", "작업대에서 제작하고, 오두막과 모닥불을 짓고, 밤을 버티세요."], ["수정", "더 매끄러운 업데이트", "업데이트 전에 열어 둔 페이지가 게임을 못 불러오는 대신 스스로 새로고침해요."]],
    feats: [["🌍", "하나의 세계, 여러 게임", "8개의 게임과 둘러볼 마을이 하나로 연결된 세계."], ["💠", "플레이하며 ARCL 모으기", "참여에 대한 게임 내 포인트, 하루 한도 있음. ARCL ⇄ $ARCIRCLE 교환은 신청제."], ["👛", "하나의 지갑", "ARCIRCLE PAD와 같은 지갑, 같은 USDC와 $ARCIRCLE. 먼저 게스트로 플레이."], ["🏝️", "내 섬 짓기", "최대 36×36 블록 빌더 (LAND 소유자 64×64), 스타일, 마을 점수."], ["🤝", "함께라서 더 즐겁게", "채팅, 친구, 크루, 사냥 파티, 주간 현상금."], ["🦖", "펫 & 공룡", "펫과 공룡을 부화시키세요. 다 자란 공룡은 함께 싸우고 탈 수도 있어요."], ["⚔️", "본격 RPG", "레벨 1~100, 장비 7칸, 대장간, 주간 레이드 보스."], ["📱", "폰 & PC", "브라우저에서 바로, 설치 없음. English, 한국어, 中文, Türkçe."]],
    steps: [["무료 플레이 누르기", "브라우저에서 바로 세계가 열려요. 설치도 가입도 필요 없어요."], ["캐릭터 만들기", "ARON, LUMI, NEX 중 하나와 색, 이름을 정하세요."], ["조작 익히기", "걷고, 점프하고, 런치패드를 타고, 훈련용 스캐머를 쓰러뜨리세요."], ["저장하고 플레이", "지갑으로 로그인하면 진행이 저장되고 ARCL을 모을 수 있어요 — 그다음 게임 목록을 여세요."]],
    ctlPhone: [["◎", "왼쪽 스틱 — 이동"], ["⤒", "점프 버튼"], ["⚔", "공격·스킬 버튼"], ["▦", "하단 독: 게임, 캐릭터, 펫, 교환"], ["☰", "오른쪽 위 메뉴"]],
    ctlPc: [["WASD", "이동 (방향키도 가능)"], ["Shift", "달리기"], ["Space", "점프"], ["E", "사용 / 문 들어가기"], ["Esc", "나가기 / 닫기"]],
    faq: [["무료인가요?", "네. 폰과 PC 브라우저에서 무료로 플레이해요. 일부 아이템은 게임에서 모은 ARCL로 사요."], ["지갑이 필요한가요?", "아니요 — 먼저 게스트로 플레이하세요. 지갑으로 로그인하면 진행이 저장되고 ARCL을 모을 수 있어요."], ["ARCL이 뭔가요?", "게임, 미션, 매일 출석으로 모으는 게임 내 포인트예요. 게임마다 하루 한도가 있어요."], ["ARCL을 $ARCIRCLE로 바꿀 수 있나요?", "네, 교환 창에서 신청하면 돼요. 조건은 그 창에 나오고 바뀔 수 있어요."], ["ARCIRCLE LAND가 뭔가요?", "마을 바깥 링의 마을 20곳으로, $ARCIRCLE로 사요. 주인의 섬이 그 자리에 세워져 모두가 볼 수 있어요. LAND에서 지급되는 보상은 없어요."], ["초대는 어떻게 하나요?", "초대 링크를 공유하세요. 친구가 레벨 5가 되면 둘 다 초대 보상을 받아요."], ["주말 2배가 뭔가요?", "토요일과 일요일(한국 시간)에는 플레이로 얻는 XP와 ARCL이 2배예요."]],
    kpis: [["가입 플레이어", "10,000+"], ["최고 동시 접속", "100+"], ["플레이 가능한 게임", "10+"], ["$ARCIRCLE 시가총액", "$5M+"], ["파트너십 & 투자", "3건+ 체결"]],
    now: ["게임 목록에 <b>8개 게임</b>", "<b>마을 & RPG</b> — 레벨 1~100, 장비, 대장간, 레이드 보스", "<b>마이 아일랜드</b> 빌더와 <b>ARCIRCLE LAND</b>", "<b>펫 & 공룡 소울메이트</b> — 부화, 육성, 탑승", "<b>크루, 파티, 채팅</b>, 친구, 우편함", "<b>시즌, 퀘스트 & 업적</b>", "<b>4개 언어</b>, 폰과 PC"],
    next: ["<b>AGENT DIMENSION</b> — 월드 안의 나만의 AI 에이전트 (설계 중)", "<b>서바이버 아레나</b> 2인 협동", "<b>포커</b> Sit & Go 토너먼트, 라운지를 걷는 다른 플레이어", "<b>쥬라기 월드</b> ARCL 보상", "실시간 <b>공룡 배틀</b>과 토너먼트", "<b>시즌 2</b>와 크루 본부"],
    events: [["🔥", "주말 2배", "플레이로 얻는 XP와 ARCL이 2배.", "토–일 (한국 시간)"], ["📅", "매일 출석", "매일 돌아와서 출석 보상을 받으세요.", "매일"], ["🎁", "런치 선물 & 웰컴 위크", "새 플레이어는 런치 선물 상자를 열고 일주일간 웰컴 보상을 받아요.", "신규 플레이어"], ["🐉", "주간 레이드 보스", "마을에서 이번 주의 레이드 보스에 함께 도전하세요.", "매주"], ["♾️", "인피니티 링 데일리 퍼즐", "모두에게 같은 퍼즐 3개. 3개 모두 별 3개: +300 ARCL 보너스.", "매일"], ["⚔️", "서바이버 데일리 챌린지", "모두에게 같은 시드, 매일 다른 변수, 전용 순위.", "매일"], ["🃏", "포커 오프닝 페스티벌", "라운지 첫 구매 시 칩 +50%.", "오픈 기념"], ["🏝️", "주간 섬 콘테스트", "내 섬을 자랑하고 이번 주 최고의 섬에 투표하세요.", "매주"], ["🛡️", "데일리 사기 퀴즈", "크립토 사기를 알아보는 하루 한 번의 짧은 퀴즈.", "매일"]],
    notices: [["업데이트 전에 열어 둔 페이지가 스스로 복구돼요", "업데이트 직후 게임을 불러오지 못했다고 나오면, 이제 페이지가 스스로 새로고침해요."], ["인피니티 링: 101~200레벨은 별 1개에 50 ARCL", "새 링이 자리 잡는 동안 낮게 잡았어요. 1~100레벨은 여전히 별 1개에 100이에요."], ["서바이버 아레나: 데일리 챌린지는 아레나 코인 지급", "데일리 챌린지는 ARCL을 주지 않아요. 일반 판은 한 판 최대 3,000, 하루 3판이에요."], ["수정: 로딩 중 75%에서 멈추던 문제", "데일리 사냥의 날짜 버그였어요. 고쳤고 앞으로 10년치를 테스트로 확인해요."], ["ARCIRCLE LAND 오픈", "마을 20곳, 내 지갑에서 ARCIRCLE 트레저리로 직접 결제해요. 환불 내역은 LAND 창에 있어요."], ["교환: ARCL ⇄ $ARCIRCLE 신청제", "하단 독에서 교환을 여세요. 조건은 그 창에 나와요."]],
    policy: [["🎮", "공정한 플레이", ["한 사람, 한 계정.", "봇, 스크립트, 오토 클릭, 버그 악용 금지 — 그렇게 얻은 보상은 보류될 수 있어요.", "버그를 찾으면 쓰지 말고 알려 주세요."]], ["💠", "보상에 대해", ["ARCL은 참여에 대한 게임 내 포인트예요.", "게임마다 하루 한도가 있고, 수량은 바뀔 수 있어요.", "어떤 것도 보장되지 않으며, 투자 조언이 아니에요."]], ["🛡️", "지갑 안전", ["시드 문구나 개인키는 절대 묻지 않아요.", "로그인은 로그인 메시지에 서명할 뿐이에요. 결제(LAND 등)는 항상 내 지갑에서 직접 승인해요.", "arcircle.app이 맞는지 확인하세요."]], ["💬", "커뮤니티", ["채팅과 방명록에서 친절하게.", "사기, 스팸, 사칭, 혐오 금지.", "규칙을 어기면 채팅 금지나 퇴장될 수 있어요."]]],
  };
  var ZH = {
    skip: "跳到内容", play: "免费游玩",
    "nav.games": "游戏", "nav.heroes": "角色", "nav.features": "特色", "nav.how": "玩法", "nav.guide": "指南", "nav.road": "路线图", "nav.events": "活动", "nav.news": "新闻", "nav.policy": "游戏规则", "nav.pad": "平台世界",
    "hero.tag": "一个世界，无数游戏。", "hero.sub": "带着你的角色漫步鲜活的 3D 星球，畅玩八款游戏，建造你的岛屿，边玩边赚 ARCL。", "hero.on": "正在游玩", "hero.vis": "累计访问", "hero.note": "手机 & 电脑 · 无需下载 · 先玩，后登录",
    "news.h": "精选新闻", "news.all": "全部公告",
    "games.k": "一个世界，八款游戏", "games.h": "选择你的游戏", "games.lead": "所有游戏都在游戏村里。走进它的门，或打开游戏列表——你的角色、钱包和 ARCL 都会跟着你。", "games.also": "镇上还有：悬浮滑板赛、每周团队首领、5 个近处和 7 个远处的狩猎场，以及 ARCIRCLE LAND。",
    "heroes.k": "角色", "heroes.h": "三位英雄，由你选择。", "heroes.lead": "选一个，给它你的颜色和名字。三位的成长方式相同——1 到 100 级、7 个装备栏——在幸存者竞技场里各有风格。",
    "feat.k": "为什么选择 ARCIRCLE WORLD", "feat.h": "为一起玩而打造",
    "how.k": "一分钟上手", "how.h": "玩法", "how.phone": "手机上", "how.pc": "电脑上",
    "guide.k": "指南", "guide.h": "须知",
    "road.k": "计划与目标", "road.h": "我们的方向", "road.lead": "我们的愿景：加密世界的 Roblox——一个鲜活的世界，无数游戏。以下是我们 2026 年 12 月 31 日的目标。是目标，不是承诺。", "road.now": "现已上线", "road.next": "下一步计划", "road.fine": "计划项目尚无确定日期，可能会调整。",
    "ev.k": "活动", "ev.h": "每天，每周", "no.k": "公告", "no.h": "更新与公告", "pol.k": "游戏规则", "pol.h": "公平游戏，安全钱包",
    "cta.h": "你的世界在等你", "cta.p": "手机和电脑免费。你的角色只差一次点击。", "cta.pad": "前往平台世界",
    "foot.fine": "ARCL 是游戏内积分。奖励来自游玩，从不保证。本页任何内容都不是投资建议。",
    playG: "玩 {g}", earn: "奖励", perk: "特性", skill: "技能", inSurv: "在幸存者竞技场", target: "目标", soFar: "目前 {n} 人", online: "现在 {n} 人在线", live: "进行中", weekend: "周六–周日（韩国时间）", tbd: "仅显示目标——暂无实时数据",
    games: {
      jurassic: ["Jurassic World", "生存 · 开放大陆", "一片独立的大陆：六种地貌和逼真的恐龙。采集木材、石头和矿石，在工作台制作，建立营地，熬过黑夜。", ["六种地貌，昼夜与降雨", "有小屋、床、篝火和箱子的营地", "狩猎——以及黑夜里的危险"], "这里暂无 ARCL：经验和资源（矿石袋与矿场共享）。"],
      surv: ["Survivors Arena", "动作 · 12 分钟生存", "在怪潮和首领中坚持十二分钟。挑选升级卡、进化武器、打开宝箱。", ["3 位英雄、36 张卡、武器进化", "重抽 · 放逐 · 跳过，宝箱轮盘", "竞技场币 → 永久强化，每日挑战"], "每局最多 3,000 ARCL，每天 3 局（登录后）。每日挑战奖励竞技场币。"],
      poker: ["ARCIA Poker Lounge", "卡牌 · 德州扑克 & 21 点", "走过 3D 休息室来到 ARCIA 的牌桌。与四个等级的 AI 或真人在服务器发牌的桌上玩德州扑克，或与 ARCIA 玩 21 点。", ["2–6 人桌、私人房间码和聊天", "每天免费筹码", "每周排行和外观"], "筹码是游戏币。ARCL 来自每天 3 个任务——从不因赢牌发放。"],
      rings: ["Infinity Rings", "解谜 · 200 关", "转动圆环，解开它们，清空棋盘。冰环、传送门环、计时环，还有两位首领。", ["10 个章节，宝箱和圆环外观", "每天 3 道谜题和每周主题", "带每周排行的限时挑战"], "每颗新星 100 ARCL（101–200 关：50），每天最多 10,000。限时挑战仅经验。"],
      mine: ["ARCL Mine", "动作 · 挖矿", "满是矿石的侧视洞穴。挥动镐子、升级它，敲碎更大的岩石。", ["镐子等级", "矿石袋与侏罗纪世界共享"], "每块岩石 10–10,000 ARCL。"],
      defense: ["AC Defense", "策略 · 塔防", "布置你的防御塔，一波接一波守住防线。", [], "每波 5 ARCL，每天最多 150。"],
      jump: ["Coin Jump", "平台跳跃 · 攀登", "一路跳上平台，直到王冠。", [], "到达王冠每天一次 3,000 ARCL。"],
      beat: ["Beat Stomp", "节奏", "踩着节拍，保持连击。", [], "仅经验。"],
    },
    heroes: {
      aron: ["ARON", "冲击枪 · 攻击", "头顶光环的友好白蓝机器人——ARCIRCLE WORLD 的门面。", "攻击 +10%", "超载——向四周发射 12 道激光，随后射速翻倍"],
      lumi: ["LUMI", "光球 · 范围", "粉色、明亮、爱加油——她的光球覆盖大范围。", "范围 +15%", "绽放——恢复 30% 生命并减速敌群"],
      nex: ["NEX", "激光 · 速度", "暗色装甲与发光双眼——迅速、锋利、难以捉摸。", "移速 +12%", "闪现——带着冲击穿越敌群"],
    },
    news: [["更新", "无限之环翻倍至 200 关", "冰环、传送门环、计时环，200 关的裂隙首领，每周谜题和 60 秒限时挑战。"], ["更新", "幸存者竞技场重大更新", "重抽、放逐和跳过，宝箱轮盘，永久强化，成就和每日挑战。"], ["更新", "扑克休息室变成 3D 空间", "带着你的角色走到 ARCIA 的牌桌。玩家以角色入座，赢了会欢呼。"], ["新内容", "ARCIRCLE LAND 开放", "小镇外环的 20 座村庄。你的岛屿立在你的村庄上，所有人都能看到。"], ["更新", "侏罗纪世界：营地与生存", "在工作台制作，搭建小屋和篝火，熬过黑夜。"], ["修复", "更顺畅的更新", "更新前打开的页面现在会自动刷新，而不是无法载入游戏。"]],
    feats: [["🌍", "一个世界，多款游戏", "八款游戏和一座可探索的小镇，全部连在一个世界里。"], ["💠", "边玩边赚 ARCL", "参与即可获得的游戏内积分，有每日上限。ARCL ⇄ $ARCIRCLE 兑换需申请。"], ["👛", "一个钱包", "与 ARCIRCLE PAD 相同的钱包、USDC 和 $ARCIRCLE。先以游客身份游玩。"], ["🏝️", "建造你的岛屿", "最大 36×36 的积木建造（LAND 拥有者 64×64），风格与村庄评分。"], ["🤝", "一起更好玩", "聊天、好友、公会、狩猎队和每周悬赏。"], ["🦖", "宠物与恐龙", "孵化宠物和恐龙。成年恐龙会与你并肩作战，还能骑乘。"], ["⚔️", "骨子里是 RPG", "1–100 级、7 个装备栏、锻造，以及每周团队首领。"], ["📱", "手机与电脑", "浏览器直接运行，无需下载。English、한국어、中文、Türkçe。"]],
    steps: [["点击免费游玩", "世界会在浏览器中打开。无需下载，无需注册。"], ["创建你的角色", "选择 ARON、LUMI 或 NEX，再选颜色和名字。"], ["学会操作", "行走、跳跃、试试弹射台，击倒训练骗子。"], ["保存并游玩", "用钱包登录即可保存进度并赚取 ARCL——然后打开游戏列表。"]],
    ctlPhone: [["◎", "左摇杆——移动"], ["⤒", "跳跃按钮"], ["⚔", "攻击和技能按钮"], ["▦", "底部栏：游戏、角色、宠物、兑换"], ["☰", "右上角菜单"]],
    ctlPc: [["WASD", "移动（或方向键）"], ["Shift", "奔跑"], ["Space", "跳跃"], ["E", "使用 / 进门"], ["Esc", "离开 / 关闭"]],
    faq: [["免费吗？", "是的。在手机和电脑的浏览器里免费游玩。部分物品需要用游戏中赚到的 ARCL 购买。"], ["需要钱包吗？", "不需要——先以游客身份游玩。用钱包登录即可保存进度并赚取 ARCL。"], ["ARCL 是什么？", "通过游戏、任务和每日签到获得的游戏内积分。每款游戏都有每日上限。"], ["ARCL 能换 $ARCIRCLE 吗？", "可以，在兑换窗口提交申请。条件会显示在那里，并可能调整。"], ["ARCIRCLE LAND 是什么？", "小镇外环的 20 座村庄，用 $ARCIRCLE 购买。拥有者的岛屿会立在地块上供所有人观看。LAND 不产生收益。"], ["邀请怎么算？", "分享你的邀请链接。好友达到 5 级时，你们都会获得邀请奖励。"], ["周末双倍是什么？", "每周六和周日（韩国时间），游玩获得的经验和 ARCL 翻倍。"]],
    kpis: [["注册玩家", "10,000+"], ["最高同时在线", "100+"], ["可玩游戏", "10+"], ["$ARCIRCLE 市值", "$5M+"], ["合作与投资", "签约 3 项+"]],
    now: ["游戏列表中的 <b>8 款游戏</b>", "<b>小镇与 RPG</b>——1–100 级、装备、锻造、团队首领", "<b>我的岛屿</b>建造与 <b>ARCIRCLE LAND</b>", "<b>宠物与恐龙伙伴</b>——孵化、养成、骑乘", "<b>公会、组队、聊天</b>、好友与信箱", "<b>赛季、任务与成就</b>", "<b>4 种语言</b>，手机和电脑"],
    next: ["<b>AGENT DIMENSION</b>——世界里属于你的 AI 代理（设计中）", "<b>幸存者竞技场</b>双人合作", "<b>扑克</b> Sit & Go 锦标赛，以及在休息室走动的其他玩家", "<b>侏罗纪世界</b> ARCL 奖励", "实时<b>恐龙对战</b>与锦标赛", "<b>第二赛季</b>与公会总部"],
    events: [["🔥", "周末双倍", "游玩获得的经验和 ARCL 翻倍。", "周六–周日（韩国时间）"], ["📅", "每日签到", "每天回来领取签到奖励。", "每天"], ["🎁", "上线礼物与欢迎周", "新玩家可打开上线礼盒，并获得一周的欢迎奖励。", "新玩家"], ["🐉", "每周团队首领", "在镇上组队挑战本周的团队首领。", "每周"], ["♾️", "无限之环每日谜题", "所有人同样的 3 道谜题。全部 3 星：+300 ARCL 奖励。", "每天"], ["⚔️", "幸存者每日挑战", "所有人同一种子，每天不同变化，独立排行。", "每天"], ["🃏", "扑克开业庆典", "在休息室首次购买筹码 +50%。", "开业"], ["🏝️", "每周岛屿大赛", "展示你的岛屿，为本周最佳岛屿投票。", "每周"], ["🛡️", "每日防骗测验", "学会识别加密骗局——每天一个小测验。", "每天"]],
    notices: [["更新前打开的页面会自动恢复", "如果更新后游戏提示无法载入，页面现在会自己刷新。"], ["无限之环：101–200 关每颗星 50 ARCL", "新圆环稳定前先保持较低。1–100 关仍为每颗星 100。"], ["幸存者竞技场：每日挑战奖励竞技场币", "每日挑战不发 ARCL。普通对局：每局最多 3,000，每天 3 局。"], ["已修复：载入时卡在 75%", "每日狩猎的日期错误。已修复，并用测试覆盖了未来十年。"], ["ARCIRCLE LAND 已开放", "20 座村庄，从你自己的钱包直接付款给 ARCIRCLE 金库。退款记录在 LAND 窗口中。"], ["兑换：ARCL ⇄ $ARCIRCLE 需申请", "从底部栏打开兑换。条件显示在那里。"]],
    policy: [["🎮", "公平游戏", ["一人一个账号。", "禁止机器人、脚本、连点器和漏洞利用——以此获得的奖励可能被扣留。", "发现漏洞请报告，不要利用。"]], ["💠", "关于奖励", ["ARCL 是参与获得的游戏内积分。", "每款游戏都有每日上限，数量可能调整。", "没有任何保证，这里也不是投资建议。"]], ["🛡️", "钱包安全", ["我们绝不会索要你的助记词或私钥。", "登录只会签署一条登录消息。付款（如 LAND）总是在你自己的钱包中由你确认。", "请确认网址是 arcircle.app。"]], ["💬", "社区", ["在聊天和留言板中友善相处。", "禁止诈骗、刷屏、冒充和仇恨言论。", "违反规则的玩家可能被禁言或移除。"]]],
  };
  var TR = {
    skip: "İçeriğe geç", play: "Ücretsiz oyna",
    "nav.games": "Oyunlar", "nav.heroes": "Kahramanlar", "nav.features": "Özellikler", "nav.how": "Nasıl oynanır", "nav.guide": "Rehber", "nav.road": "Yol haritası", "nav.events": "Etkinlikler", "nav.news": "Haberler", "nav.policy": "Oyun kuralları", "nav.pad": "Platform Dünyası",
    "hero.tag": "Tek dünya. Sayısız oyun.", "hero.sub": "Kahramanınla yaşayan bir 3D gezegende dolaş, sekiz oyuna atla, adanı kur ve oynarken ARCL kazan.", "hero.on": "şu an oynuyor", "hero.vis": "toplam ziyaret", "hero.note": "Telefon & PC · indirme yok · önce oyna, sonra giriş yap",
    "news.h": "Öne çıkan haberler", "news.all": "Tüm duyurular",
    "games.k": "Sekiz oyun, tek dünya", "games.h": "Oyununu seç", "games.lead": "Her oyun Oyun Köyü'nde. Kapısından gir ya da Oyunlar listesini aç — kahramanın, cüzdanın ve ARCL'in seninle gelir.", "games.also": "Kasabada ayrıca: hoverboard yarışı, haftalık baskın boss, 5 yakın ve 7 uzak av alanı ve ARCIRCLE LAND.",
    "heroes.k": "Karakterler", "heroes.h": "Üç kahraman. Seçim senin.", "heroes.lead": "Birini seç, rengini ve adını ver. Üçü de aynı şekilde gelişir — seviye 1–100, yedi ekipman yuvası — ve her biri SURVIVORS ARENA'ya kendi tarzını getirir.",
    "feat.k": "Neden ARCIRCLE WORLD", "feat.h": "Birlikte oynamak için yapıldı",
    "how.k": "Bir dakikada başla", "how.h": "Nasıl oynanır", "how.phone": "Telefonda", "how.pc": "PC'de",
    "guide.k": "Rehber", "guide.h": "Bilmekte fayda var",
    "road.k": "Plan & hedefler", "road.h": "Nereye gidiyoruz", "road.lead": "Vizyonumuz: kriptonun Roblox'u — yaşayan tek dünya, sayısız oyun. Bunlar 31 Aralık 2026 hedeflerimiz. Hedef, söz değil.", "road.now": "Şu an yayında", "road.next": "Sıradaki planlar", "road.fine": "Planlanan maddelerin henüz kesin tarihi yok ve değişebilir.",
    "ev.k": "Etkinlikler", "ev.h": "Her gün, her hafta", "no.k": "Duyurular", "no.h": "Güncellemeler & duyurular", "pol.k": "Oyun kuralları", "pol.h": "Adil oyun, güvenli cüzdan",
    "cta.h": "Dünyan seni bekliyor", "cta.p": "Telefon ve PC'de ücretsiz. Kahramanın bir dokunuş uzakta.", "cta.pad": "Platform Dünyası'na git",
    "foot.fine": "ARCL oyun içi puandır. Ödüller oyun içindir ve asla garanti edilmez. Bu sayfadaki hiçbir şey yatırım tavsiyesi değildir.",
    playG: "{g} oyna", earn: "Ödüller", perk: "Özellik", skill: "Yetenek", inSurv: "SURVIVORS ARENA'da", target: "Hedef", soFar: "şu ana kadar {n}", online: "şu an {n} çevrimiçi", live: "ŞU AN", weekend: "Cmt–Paz (KST)", tbd: "Yalnızca hedef — henüz canlı sayı yok",
    games: {
      jurassic: ["Jurassic World", "Hayatta kalma · açık arazi", "Kendine ait bir kara: altı biyom ve gerçekçi dinozorlar. Odun, taş ve maden topla, tezgâhta üret, kamp kur ve geceyi atlat.", ["Altı biyom, gece-gündüz, yağmur", "Kulübe, yatak, kamp ateşi ve sandıklı kamplar", "Avcılık — ve karanlıkta tehlike"], "Burada henüz ARCL yok: XP ve kaynaklar (maden çantası madenle ortak)."],
      surv: ["Survivors Arena", "Aksiyon · 12 dakika hayatta kalma", "Dalgalara ve boss'lara karşı on iki dakika dayan. Geliştirme kartları seç, silahlarını evrimleştir, sandık aç.", ["3 kahraman, 36 kart, silah evrimleri", "Yenile · Sürgün · Geç, sandık ruleti", "Arena Coin → kalıcı geliştirmeler, günlük meydan okuma"], "Tur başına en fazla 3.000 ARCL, günde 3 ücretli tur (giriş yapınca). Günlük meydan okuma Arena Coin verir."],
      poker: ["ARCIA Poker Lounge", "Kart · Hold'em & Blackjack", "3D salonda ARCIA'nın masasına yürü. Dört AI seviyesine ya da sunucunun dağıttığı masalarda gerçek oyunculara karşı Hold'em, ya da ARCIA'ya karşı blackjack oyna.", ["2–6 kişilik masalar, özel kodlar ve sohbet", "Her gün ücretsiz fiş", "Haftalık sıralama ve kozmetikler"], "Fişler oyun parasıdır. ARCL günlük 3 görevden gelir — kazanmaktan asla."],
      rings: ["Infinity Rings", "Bulmaca · 200 seviye", "Halkaları çevir, çöz, tahtayı temizle. Buz, portal ve zamanlayıcı halkaları ve iki boss.", ["Sandıklı ve halka stilli 10 bölüm", "Günlük 3 bulmaca ve haftalık tema", "Haftalık tablolu ZAMANA KARŞI"], "Her yeni yıldız 100 ARCL (101–200: 50), günde en fazla 10.000. Zamana Karşı: sadece XP."],
      mine: ["ARCL Mine", "Aksiyon · madencilik", "Cevherle dolu yandan görünüşlü bir mağara. Kazmanı salla, yükselt ve daha büyük kayaları kır.", ["Kazma seviyeleri", "Maden çantası Jurassic World ile ortak"], "Kaya başına 10–10.000 ARCL."],
      defense: ["AC Defense", "Strateji · kule savunması", "Kulelerini yerleştir ve dalga dalga hattı tut.", [], "Dalga başına 5 ARCL, günde en fazla 150."],
      jump: ["Coin Jump", "Platform · tırmanış", "Platformdan platforma zıplayarak taca kadar çık.", [], "Taca ulaşınca günde bir kez 3.000 ARCL."],
      beat: ["Beat Stomp", "Ritim", "Ritme göre bas ve komboyu sürdür.", [], "Sadece XP."],
    },
    heroes: {
      aron: ["ARON", "Blaster · saldırı", "Halesiyle sevimli beyaz-mavi robot — ARCIRCLE WORLD'ün yüzü.", "Saldırı +%10", "Overdrive — her yöne 12 lazer, ardından iki kat atış hızı"],
      lumi: ["LUMI", "Küre · alan", "Pembe, parlak ve neşeli — küreleri geniş bir alanı kaplar.", "Alan +%15", "Bloom — %30 iyileşme ve kalabalığı yavaşlatma"],
      nex: ["NEX", "Lazer · hız", "Koyu zırh ve parlayan gözler — hızlı, keskin ve yakalanması zor.", "Hareket hızı +%12", "Blink — bir patlamayla aralarından ışınlan"],
    },
    news: [["Güncelleme", "INFINITY RINGS 200 seviyeye çıktı", "Buz, portal ve zamanlayıcı halkaları, 200'de YARIK BOSS, haftalık bulmacalar ve 60 saniyelik Zamana Karşı."], ["Güncelleme", "SURVIVORS ARENA büyük güncelleme", "Yenile, Sürgün & Geç, sandık ruleti, kalıcı geliştirmeler, başarımlar ve günlük meydan okuma."], ["Güncelleme", "Poker salonu artık 3D bir oda", "Kahramanını ARCIA'nın masasına yürüt. Oyuncular kahraman olarak oturur — kazanınca sevinir."], ["Yeni", "ARCIRCLE LAND açıldı", "Kasabanın dış halkasında 20 köy. Adan köyünde herkesin göreceği şekilde durur."], ["Güncelleme", "Jurassic World: kamplar ve hayatta kalma", "Tezgâhta üret, kulübe ve kamp ateşi kur, geceyi atlat."], ["Düzeltme", "Daha akıcı güncellemeler", "Güncellemeden önce açılan sayfa artık oyunu yükleyememek yerine kendini yeniliyor."]],
    feats: [["🌍", "Tek dünya, çok oyun", "Sekiz oyun ve keşfedilecek bir kasaba, hepsi tek bağlı dünyada."], ["💠", "Oynadıkça ARCL kazan", "Katılım için oyun içi puan, günlük limitli. ARCL ⇄ $ARCIRCLE değişimi talep ile."], ["👛", "Tek cüzdan", "ARCIRCLE PAD ile aynı cüzdan, USDC ve $ARCIRCLE. Önce misafir olarak oyna."], ["🏝️", "Adanı kur", "36×36'ya kadar tuğla kurucu (LAND sahipleri 64×64), stiller ve köy puanı."], ["🤝", "Birlikte daha iyi", "Sohbet, arkadaşlar, ekipler, av grupları ve haftalık ödüller."], ["🦖", "Evcil hayvanlar & dinozorlar", "Evcil hayvan ve dinozor çıkar. Yetişkin dinozorlar yanında savaşır — ve onlara binebilirsin."], ["⚔️", "Özünde RPG", "Seviye 1–100, yedi ekipman yuvası, demirci ve haftalık baskın boss."], ["📱", "Telefon & PC", "Tarayıcıda çalışır, indirme yok. English, 한국어, 中文 ve Türkçe."]],
    steps: [["ÜCRETSİZ OYNA'ya bas", "Dünya tarayıcında açılır. İndirme yok, kayıt yok."], ["Kahramanını yap", "ARON, LUMI ya da NEX'i, bir renk ve bir ad seç."], ["Hareketleri öğren", "Yürü, zıpla, Launchpad'i dene ve eğitim dolandırıcısını yere ser."], ["Kaydet & oyna", "İlerlemeni saklamak ve ARCL kazanmak için cüzdanla giriş yap — sonra Oyunlar listesini aç."]],
    ctlPhone: [["◎", "Sol çubuk — hareket"], ["⤒", "Zıplama düğmesi"], ["⚔", "Saldırı ve yetenek düğmeleri"], ["▦", "Alt çubuk: Oyunlar, Karakter, Evcil, Değişim"], ["☰", "Sağ üstte Menü"]],
    ctlPc: [["WASD", "Hareket (veya ok tuşları)"], ["Shift", "Koş"], ["Space", "Zıpla"], ["E", "Kullan / kapıdan gir"], ["Esc", "Çık / kapat"]],
    faq: [["Ücretsiz mi?", "Evet. Telefonda ve PC'de tarayıcıda ücretsiz oynanır. Bazı eşyalar oyunda kazandığın ARCL ile alınır."], ["Cüzdan gerekli mi?", "Hayır — önce misafir olarak oyna. İlerlemeni kaydetmek ve ARCL kazanmak için cüzdanla giriş yap."], ["ARCL nedir?", "Oyunlar, görevler ve günlük girişlerle kazanılan oyun içi puan. Her oyunun günlük limiti var."], ["ARCL'i $ARCIRCLE'a çevirebilir miyim?", "Evet, Değişim penceresinden talep ederek. Koşullar orada gösterilir ve değişebilir."], ["ARCIRCLE LAND nedir?", "Kasabanın dış halkasındaki 20 köy, $ARCIRCLE ile alınır. Sahibinin adası arsada herkesin göreceği şekilde durur. LAND ödeme yapmaz."], ["Davetler nasıl çalışır?", "Davet bağlantını paylaş. Arkadaşın 5. seviyeye ulaşınca ikiniz de davet ödülü alırsınız."], ["Hafta sonu 2× nedir?", "Cumartesi ve pazar (Kore saati) oyundan gelen XP ve ARCL iki katıdır."]],
    kpis: [["Kayıtlı oyuncu", "10.000+"], ["En yüksek eşzamanlı oyuncu", "100+"], ["Oynanabilir oyun", "10+"], ["$ARCIRCLE piyasa değeri", "$5M+"], ["Ortaklık & yatırım", "3+ imzalı"]],
    now: ["Oyunlar listesinde <b>8 oyun</b>", "<b>Kasaba & RPG</b> — seviye 1–100, ekipman, demirci, baskın boss", "<b>Adam</b> kurucusu ve <b>ARCIRCLE LAND</b>", "<b>Evcil hayvanlar & DINO SOULMATE</b> — çıkar, büyüt, bin", "<b>Ekipler, gruplar, sohbet</b>, arkadaşlar ve posta", "<b>Sezonlar, görevler & başarımlar</b>", "<b>4 dil</b>, telefon ve PC"],
    next: ["<b>AGENT DIMENSION</b> — dünyada kendi AI ajanın (tasarımda)", "<b>SURVIVORS ARENA</b> 2 kişilik co-op", "<b>Poker</b> Sit & Go turnuvaları ve salonda yürüyen oyuncular", "<b>Jurassic World</b> ARCL ödülleri", "Gerçek zamanlı <b>dinozor savaşları</b> ve turnuvalar", "<b>2. sezon</b> ve ekip karargâhı"],
    events: [["🔥", "Hafta sonu 2×", "Oyundan iki kat XP ve iki kat ARCL.", "Cmt–Paz (KST)"], ["📅", "Günlük giriş", "Her gün gel, giriş ödülünü al.", "Her gün"], ["🎁", "Açılış hediyesi & hoş geldin haftası", "Yeni oyuncular açılış hediye kutusunu açar ve bir hafta hoş geldin ödülü alır.", "Yeni oyuncular"], ["🐉", "Haftalık baskın boss", "Kasabada haftanın baskın boss'una karşı takım ol.", "Her hafta"], ["♾️", "Infinity Rings günlük bulmacalar", "Herkese aynı üç bulmaca. Üçü de 3 yıldız: +300 ARCL bonus.", "Her gün"], ["⚔️", "Survivors günlük meydan okuma", "Herkese aynı tohum, her gün bir değişiklik ve kendi tablosu.", "Her gün"], ["🃏", "Poker Açılış Festivali", "Salondaki ilk alımında +%50 fiş.", "Açılış"], ["🏝️", "Haftalık ada yarışması", "Adanı göster ve haftanın en iyisine oy ver.", "Her hafta"], ["🛡️", "Günlük dolandırıcılık testi", "Kripto dolandırıcılıklarını tanımayı öğren — günde bir kısa test.", "Her gün"]],
    notices: [["Güncellemeden önce açılan sayfalar kendiliğinden toparlanıyor", "Güncellemeden hemen sonra bir oyun yüklenemedi derse, sayfa artık kendini yeniliyor."], ["INFINITY RINGS: 101–200 seviyeler yıldız başına 50 ARCL", "Yeni halkalar oturana kadar düşük tutuldu. 1–100 hâlâ yıldız başına 100."], ["SURVIVORS ARENA: günlük meydan okuma Arena Coin verir", "Günlük meydan okuma ARCL vermez. Normal turlar verir: tur başına en fazla 3.000, günde 3 tur."], ["Düzeltildi: yüklemenin %75'te durması", "Günlük avlarda bir tarih hatası. Düzeltildi ve önümüzdeki on yıl için testle kontrol ediliyor."], ["ARCIRCLE LAND açık", "20 köy, kendi cüzdanından ARCIRCLE hazinesine ödenir. İadeler LAND penceresinde listelenir."], ["Değişim: ARCL ⇄ $ARCIRCLE talep ile", "Değişimi alt çubuktan aç. Koşullar orada gösterilir."]],
    policy: [["🎮", "Adil oyun", ["Bir oyuncu, bir hesap.", "Bot, script, otomatik tıklayıcı veya açık kullanımı yok — bu şekilde kazanılan ödüller tutulabilir.", "Bir hata mı buldun? Kullanmak yerine bildir."]], ["💠", "Ödüller hakkında", ["ARCL katılım için oyun içi puandır.", "Her oyunun günlük limiti var ve miktarlar değişebilir.", "Hiçbir şey garanti değildir ve burada yatırım tavsiyesi yoktur."]], ["🛡️", "Cüzdan güvenliği", ["Kurtarma ifadeni veya özel anahtarını asla istemeyiz.", "Giriş yalnızca bir giriş mesajını imzalar. Ödemeler (LAND gibi) her zaman kendi cüzdanında senin onayına açılır.", "arcircle.app'te olduğundan emin ol."]], ["💬", "Topluluk", ["Sohbette ve ziyaretçi defterlerinde nazik ol.", "Dolandırıcılık, spam, taklit veya nefret yok.", "Kuralları çiğneyenler susturulabilir veya çıkarılabilir."]]],
  };
  var LANGS = { en: EN, ko: KO, zh: ZH, tr: TR }, KEY = "arc.gw.lang";
  var lang = "en";
  try { var q = new URLSearchParams(location.search).get("lang"); lang = LANGS[q] ? q : LANGS[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : "en"; } catch (e) { lang = "en"; }
  var D = function () { return LANGS[lang] || EN; }, t = function (k, v) { var s = D()[k] != null ? D()[k] : EN[k]; return v ? String(s).replace(/\{(\w+)\}/g, function (_, x) { return v[x] != null ? v[x] : ""; }) : s; };
  var NUMLOC = { en: "en-US", ko: "ko-KR", zh: "zh-CN", tr: "tr-TR" };
  var fmt = function (n) { try { return Number(n).toLocaleString(NUMLOC[lang]); } catch (e) { return String(n); } };
  var dateOf = function (d) { var p = d.split("-"); return { y: p[0], m: p[1], d: p[2] }; };

  // ---------------- painting the page in the chosen language ----------------
  var gi = 0, stats = null;
  function paint() {
    document.documentElement.lang = lang;
    $$("[data-i]").forEach(function (el) { var v = t(el.getAttribute("data-i")); if (v != null) el.textContent = v; });
    $(".gw-lang-cur").textContent = lang.toUpperCase();
    $$(".gw-lang-menu button").forEach(function (b) { b.classList.toggle("on", b.dataset.lang === lang); });
    var L = D();
    // news
    $("#gw-news").innerHTML = L.news.map(function (n, i) { var m = NEWS[i] || {}; return '<a class="gw-news gw-rv" style="--d:' + i + '" href="#notices"><div class="gw-news-img"><img src="' + m.img + '" alt="" loading="lazy">' + (m.b ? '<span class="gw-badge ' + m.b + '">' + esc(n[0]) + "</span>" : "") + '</div><div class="gw-news-b"><span class="gw-meta">' + esc(n[0]) + "<span>" + esc(m.d.replace(/-/g, ". ")) + "</span></span><h3>" + esc(n[1]) + "</h3><p>" + esc(n[2]) + "</p></div></a>"; }).join("");
    // games
    $("#gw-gtabs").innerHTML = GAMES.map(function (g, i) { return '<button type="button" role="tab" class="gw-gtab" data-g="' + i + '" aria-selected="' + (i === gi) + '"><img src="/images/games/' + g.img + '.webp" alt="" loading="lazy"><b>' + esc(L.games[g.id][0]) + "</b></button>"; }).join("");
    paintGame(false);
    // heroes
    $("#gw-picks").innerHTML = HEROES.map(function (h, i) { var x = L.heroes[h.id]; return '<article class="gw-pick gw-rv" style="--c:' + h.c + ";--d:" + i + '" data-tilt><div class="gw-pick-img"><img src="/images/gw/pick-' + h.id + '.webp" alt="' + esc(x[0]) + '" loading="lazy"></div><div class="gw-pick-b"><span class="gw-pick-t">' + esc(x[1]) + '</span><span class="gw-pick-n">' + esc(x[0]) + "</span><p>" + esc(x[2]) + '</p><dl><dt>' + esc(t("perk")) + "</dt><dd>" + esc(x[3]) + "</dd><dt>" + esc(t("skill")) + "</dt><dd>" + esc(x[4]) + "</dd></dl><small class=\"gw-fine\">" + esc(t("inSurv")) + "</small></div></article>"; }).join("");
    // features, steps, controls, FAQ
    $("#gw-feats").innerHTML = L.feats.map(function (f, i) { return '<div class="gw-feat gw-rv" style="--d:' + (i % 4) + '"><i>' + f[0] + "</i><h3>" + esc(f[1]) + "</h3><p>" + esc(f[2]) + "</p></div>"; }).join("");
    $("#gw-steps").innerHTML = L.steps.map(function (s, i) { return '<li class="gw-step gw-rv" style="--d:' + i + '"><div><h3>' + esc(s[0]) + "</h3><p>" + esc(s[1]) + "</p></div></li>"; }).join("");
    $("#gw-ctl-phone").innerHTML = L.ctlPhone.map(function (c) { return "<li><kbd>" + esc(c[0]) + "</kbd>" + esc(c[1]) + "</li>"; }).join("");
    $("#gw-ctl-pc").innerHTML = L.ctlPc.map(function (c) { return "<li><kbd>" + esc(c[0]) + "</kbd>" + esc(c[1]) + "</li>"; }).join("");
    $("#gw-faq").innerHTML = L.faq.map(function (f, i) { return '<details class="gw-rv" style="--d:' + (i % 3) + '"' + (i === 0 ? " open" : "") + "><summary>" + esc(f[0]) + "</summary><p>" + esc(f[1]) + "</p></details>"; }).join("");
    // roadmap
    $("#gw-kpis").innerHTML = L.kpis.map(function (k, i) { return '<div class="gw-kpi gw-rv" style="--d:' + i + '" data-kpi="' + i + '"><small>' + esc(t("target")) + " · " + esc(k[0]) + "</small><b>" + esc(k[1]) + '</b><em></em><div class="gw-meter"><i></i></div></div>'; }).join("");
    $("#gw-plan-now").innerHTML = L.now.map(function (s) { return "<li>" + s + "</li>"; }).join("");
    $("#gw-plan-next").innerHTML = L.next.map(function (s) { return "<li>" + s + "</li>"; }).join("");
    paintKpis();
    // events (Weekend 2× says LIVE on a Saturday or Sunday in Korea)
    var kst = new Date(Date.now() + 9 * 3600e3).getUTCDay(), weekend = kst === 0 || kst === 6;
    $("#gw-events").innerHTML = L.events.map(function (e, i) { var c = EV_COL[i % EV_COL.length]; return '<div class="gw-ev gw-rv" style="--a:' + c[0] + ";--b:" + c[1] + ";--d:" + (i % 3) + '">' + (i === 0 && weekend ? '<span class="gw-live-b">' + esc(t("live")) + "</span>" : "") + "<i>" + e[0] + "</i><small>" + esc(e[3]) + "</small><h3>" + esc(e[1]) + "</h3><p>" + esc(e[2]) + "</p></div>"; }).join("");
    // notices, policy
    $("#gw-notices").innerHTML = L.notices.map(function (n, i) { var d = dateOf(NOTE_D[i] || NOTE_D[0]); return '<li class="gw-rv" style="--d:' + (i % 3) + '"><time datetime="' + NOTE_D[i] + '"><b>' + d.d + "</b>" + d.y + "." + d.m + "</time><h3>" + esc(n[0]) + "</h3><p>" + esc(n[1]) + "</p></li>"; }).join("");
    $("#gw-policy").innerHTML = L.policy.map(function (p, i) { return '<div class="gw-pol gw-rv" style="--d:' + i + '"><h3><span>' + p[0] + "</span>" + esc(p[1]) + "</h3><ul>" + p[2].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"; }).join("");
    $$('.gw-drawer-in > a').forEach(function (a, i) { a.style.setProperty("--k", i); });
    reveal(); tilt(); carousel();
  }
  function paintGame(anim) {
    var L = D(), g = GAMES[gi], x = L.games[g.id], p = $("#gw-gpanel");
    p.style.setProperty("--gc", g.c);
    p.innerHTML = '<div class="gw-gart"><img src="/images/games/' + g.img + '.webp" alt="' + esc(x[0]) + '"><span class="gw-gnum">0' + (gi + 1) + '</span></div><div class="gw-ginfo"><span class="gw-badge" style="background:linear-gradient(135deg,#fff,' + g.c + ')">' + esc(x[1]) + "</span><h3>" + esc(x[0]) + "</h3><p>" + esc(x[2]) + "</p>" + (x[3].length ? '<ul class="gw-gfacts">' + x[3].map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + '<p class="gw-earn">💠 ' + esc(t("earn")) + " · " + esc(x[4]) + '</p><a class="gw-btn gw-btn-play gw-btn-lg" href="/play">' + esc(t("playG", { g: x[0] })) + "</a></div>";
    $$(".gw-gtab").forEach(function (b, i) { b.setAttribute("aria-selected", String(i === gi)); });
    if (anim && !reduce) { p.classList.remove("swap"); void p.offsetWidth; p.classList.add("swap"); }
    var tab = $('.gw-gtab[data-g="' + gi + '"]'); if (tab && anim) try { tab.scrollIntoView({ block: "nearest", inline: "center", behavior: reduce ? "auto" : "smooth" }); } catch (e) { /* fine */ }
  }
  function paintKpis() {
    var vals = [stats && stats.players != null ? [stats.players, 10000, t("soFar", { n: fmt(stats.players) })] : null, stats && stats.online != null ? [stats.online, 100, t("online", { n: fmt(stats.online) })] : null, [GAMES.length, 10, t("soFar", { n: GAMES.length })], null, null];
    $$("[data-kpi]").forEach(function (el) { var v = vals[Number(el.dataset.kpi)]; el.querySelector("em").textContent = v ? v[2] : t("tbd"); var m = el.querySelector(".gw-meter i"); m.style.width = v ? Math.max(2, Math.min(100, (v[0] / v[1]) * 100)) + "%" : "0%"; if (!v) el.querySelector(".gw-meter").style.opacity = ".3"; });
  }

  // ---------------- motion: reveal on scroll, the tilt of the hero cards, the carousel ----------------
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px" }) : null;
  function reveal() { $$(".gw-rv:not(.in)").forEach(function (el) { if (io && !reduce) io.observe(el); else el.classList.add("in"); }); }
  $$(".gw-h2, .gw-kicker, .gw-lead, .gw-gpanel, .gw-controls, .gw-plan, .gw-cta-in").forEach(function (el) { el.classList.add("gw-rv"); });
  function tilt() {
    if (reduce || coarse) return;
    $$("[data-tilt]").forEach(function (el) {
      el.addEventListener("pointermove", function (e) { var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; el.style.transform = "perspective(900px) rotateY(" + x * 10 + "deg) rotateX(" + -y * 8 + "deg) translateY(-4px)"; });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  }
  function carousel() {
    $$("[data-carousel]").forEach(function (c) {
      var tr = $(".gw-track", c), bar = $(".gw-bar i", c);
      var upd = function () { var max = tr.scrollWidth - tr.clientWidth, f = max > 0 ? tr.scrollLeft / max : 0, w = Math.max(14, (tr.clientWidth / tr.scrollWidth) * 100); bar.style.width = w + "%"; bar.style.transform = "translateX(" + f * (100 / w - 1) * 100 + "%)"; };
      tr.onscroll = upd; upd();
      $$(".gw-arrow", c).forEach(function (b) { b.onclick = function () { var card = tr.firstElementChild; tr.scrollBy({ left: Number(b.dataset.dir) * (card ? card.getBoundingClientRect().width + 18 : 300), behavior: reduce ? "auto" : "smooth" }); }; });
    });
  }

  // ---------------- the top bar, the phone menu, the language menu ----------------
  var nav = $("#gw-nav"), drawer = $("#gw-drawer"), burger = $(".gw-burger");
  function onScroll() { var y = scrollY, h = document.documentElement.scrollHeight - innerHeight; nav.classList.toggle("solid", y > 40); nav.style.setProperty("--p", (h > 0 ? (y / h) * 100 : 0) + "%");
    var ban = $(".gw-banner img"); if (ban && !reduce) { var r = ban.parentNode.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) ban.style.transform = "scale(1.08) translateY(" + ((r.top / innerHeight) * 30).toFixed(1) + "px)"; } }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  function menu(open) { drawer.hidden = !open; burger.setAttribute("aria-expanded", String(open)); document.body.style.overflow = open ? "hidden" : ""; nav.classList.toggle("solid", open || scrollY > 40); }
  burger.addEventListener("click", function () { menu(drawer.hidden); });
  drawer.addEventListener("click", function (e) { if (e.target.closest("a")) menu(false); });
  var globe = $(".gw-globe"), lm = $(".gw-lang-menu");
  globe.addEventListener("click", function (e) { e.stopPropagation(); lm.hidden = !lm.hidden; globe.setAttribute("aria-expanded", String(!lm.hidden)); });
  lm.addEventListener("click", function (e) { var b = e.target.closest("button[data-lang]"); if (!b) return; lang = b.dataset.lang; try { localStorage.setItem(KEY, lang); } catch (x) { /* this visit only */ } lm.hidden = true; paint(); paintStats(); });
  document.addEventListener("click", function () { lm.hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { lm.hidden = true; if (!drawer.hidden) menu(false); } });
  $("#gw-gtabs").addEventListener("click", function (e) { var b = e.target.closest("[data-g]"); if (!b) return; gi = Number(b.dataset.g); paintGame(true); });
  // the game picker turns by itself until you pick one, and by swipe on the art
  var auto = setInterval(function () { if (document.hidden) return; var p = $("#gw-gpanel"), r = p.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; gi = (gi + 1) % GAMES.length; paintGame(true); }, 6000);
  $("#gw-gtabs").addEventListener("pointerdown", function () { clearInterval(auto); }, { once: true });
  var sx = null; $("#gw-gpanel").addEventListener("pointerdown", function (e) { sx = e.clientX; clearInterval(auto); });
  $("#gw-gpanel").addEventListener("pointerup", function (e) { if (sx == null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) { gi = (gi + (dx < 0 ? 1 : GAMES.length - 1)) % GAMES.length; paintGame(true); } });

  // ---------------- the trailer ----------------
  var saveData = navigator.connection && navigator.connection.saveData;
  function startVideo(v, eager) {
    if (!v || saveData || reduce) return;
    var src = innerWidth < 760 ? "/images/gw/hero-480.mp4" : "/images/gw/hero-720.mp4";
    var go = function () { if (v.dataset.on) return; v.dataset.on = "1"; v.src = src; v.play().catch(function () { /* the poster stays */ }); };
    if (eager) go(); else if ("IntersectionObserver" in window) { var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { go(); o.disconnect(); } }, { rootMargin: "200px" }); o.observe(v); } else go();
  }
  startVideo($(".gw-hero .gw-video"), true); startVideo($(".gw-cta-video"), false);
  document.addEventListener("visibilitychange", function () { $$("video[data-on]").forEach(function (v) { if (document.hidden) v.pause(); else v.play().catch(function () { /* fine */ }); }); });

  // ---------------- sparkles over the trailer ----------------
  (function sparks() {
    var cv = $(".gw-sparks"); if (!cv || reduce) return; var g = cv.getContext("2d"), P = [], W = 0, H = 0, dpr = Math.min(2, devicePixelRatio || 1), run = true;
    var size = function () { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener("resize", size);
    for (var i = 0; i < (coarse ? 26 : 50); i++) P.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2, s: 0.02 + Math.random() * 0.05, h: Math.random() < 0.5 ? "120,230,255" : "120,255,210", p: Math.random() * 6 });
    new IntersectionObserver(function (es) { run = es[0].isIntersecting; }).observe(cv);
    (function f(ts) { requestAnimationFrame(f); if (!run || document.hidden) return; g.clearRect(0, 0, W, H); var tt = ts / 1000;
      for (var k = 0; k < P.length; k++) { var q = P[k]; q.y -= q.s / 60; if (q.y < -0.02) { q.y = 1.02; q.x = Math.random(); } var a = 0.35 + 0.35 * Math.sin(tt * 2 + q.p); g.beginPath(); g.fillStyle = "rgba(" + q.h + "," + a + ")"; g.shadowColor = "rgba(" + q.h + ",1)"; g.shadowBlur = 8; g.arc(q.x * W + Math.sin(tt + q.p) * 8, q.y * H, q.r, 0, 6.283); g.fill(); } })(0);
  })();

  // ---------------- who's in the world (the gate's numbers) ----------------
  function countUp(el, to) { if (!el) return; var from = Number(el.dataset.v || 0); el.dataset.v = to; if (reduce || from === to) { el.textContent = fmt(to); return; } var t0 = performance.now(), d = 1100; (function f(n) { var k = Math.min(1, (n - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(f); })(t0); }
  function paintStats() { if (!stats) return; countUp($('[data-count="online"]'), stats.online || 0); countUp($('[data-count="visitors"]'), stats.visitors || 0); paintKpis(); }
  function readStats(first) {
    var vid = ""; try { vid = localStorage.getItem("arc.world.vid") || ""; if (!/^[a-z0-9]{20}$/.test(vid)) { vid = Array.from(crypto.getRandomValues(new Uint8Array(20)), function (b) { return "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]; }).join(""); localStorage.setItem("arc.world.vid", vid); } } catch (e) { vid = ""; }
    // opening the site counts as a visit (at most once per 10 minutes a browser, api/_world.mjs), like the gate
    var req = first && vid ? fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "world-ping", id: vid, visit: true, gate: true }) }).then(function (r) { return r.ok ? r : fetch("/api/social?world=stats"); }) : fetch("/api/social?world=stats");
    req.then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.visitors != null) { stats = j; paintStats(); } }).catch(function () { /* the page works without numbers */ });
  }
  paint(); readStats(true); setInterval(function () { if (!document.hidden) readStats(false); }, 30000);
})();
