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
  var NEWS = [{ d: "2026-10-20", img: "/images/games/rings.webp", b: "hot" }, { d: "2026-10-20", img: "/images/games/surv.webp", b: "hot" }, { d: "2026-10-20", img: "/images/games/poker.webp" }, { d: "2026-10-19", img: "/images/gw/hero-poster.webp" }, { d: "2026-10-21", img: "/images/gw/key-jurassic-416.webp", b: "hot" }, { d: "2026-10-20", img: "/images/gw/heroes-800.webp", b: "fix" }];
  var EV_COL = [["#ff6a3d", "#b8173d"], ["#2f6bff", "#1a2f8a"], ["#2ee0b0", "#0e6a6a"], ["#9b6bff", "#3a1a8a"], ["#38d8ff", "#1c4fb8"], ["#ff8a3a", "#8a2a1a"], ["#b46cff", "#4a1a7a"], ["#4ade80", "#156a3a"], ["#ffb02e", "#8a4a00"]];
  var NOTE_D = ["2026-10-20", "2026-10-20", "2026-10-20", "2026-10-20", "2026-10-19", "2026-10-18"];

  var EN = {
    "nav.rank": "Rankings",
    "nav.media": "Media",
    "intro.skip": "Skip",
    "sound.on": "Sound on",
    "sound.off": "Sound off",
    "hero.back": "Welcome back, {name} · Lv {lv}",
    "hero.cont": "Continue as {name}",
    "tk.live": "LIVE",
    "tk.rings": "♾️ <b>{name}</b> leads INFINITY RINGS this week · ★{n}",
    "tk.ta": "⏱️ <b>{name}</b> tops TIME ATTACK · {n} boards",
    "tk.surv": "⚔️ <b>{name}</b> leads SURVIVORS ARENA · {t}",
    "tk.poker": "🃏 <b>{name}</b> leads the poker lounge this week",
    "tk.dino": "🦖 <b>{name}</b> tops the dino ladder · rating {n}", "tk.jur": "🦖 <b>{name}</b> leads the Jurassic hunters this week · {n} pts",
    "tk.idle": ["🔥 Weekend 2×: double XP and ARCL every Saturday and Sunday (KST)", "♾️ 200 levels of INFINITY RINGS — ice, portal and timer rings", "⚔️ SURVIVORS ARENA: up to 3,000 ARCL a run", "🏝️ Build your island — LAND owners build up to 64×64", "🦖 Hatch a dinosaur, raise it, ride it", "🃏 Free poker chips every day"],
    "cd.day": "Daily reset",
    "cd.week": "Weekly reset",
    "cd.wkOn": "Weekend 2× ends",
    "cd.wkOff": "Weekend 2× starts",
    "cd.d": "d",
    "rk.k": "Leaderboards",
    "rk.h": "This week's best",
    "rk.tabs": ["Rings ★", "Time Attack", "Survivors", "Poker", "Dino ladder", "Jurassic hunters"],
    "rk.none": "No one on this board yet this week — be the first!",
    "rk.stars": "★ {n}",
    "rk.boards": "{n} boards",
    "rk.surv": "{t} · {k} KOs",
    "rk.poker": "{n} pts",
    "rk.dino": "Lv {lv} · {n}",
    "gd.more": "Details",
    "gd.tips": "Tips",
    "gd.pay": "Rewards",
    "nd.share": "Share",
    "nd.copied": "Link copied",
    "nd.read": "Read more",
    "v.load": "Tap to load the 3D hero",
    "v.h": "Try them in 3D",
    "v.p": "The same models as in the game. Drag to turn, pick a colour, say hi.",
    "v.wave": "Wave",
    "v.play": "Play with this hero",
    "v.loading": "Loading the hero…",
    "v.fail": "3D isn't available on this device.",
    "inv.k": "Invite friends",
    "inv.h": "Play together",
    "inv.p": "Share your link. When your friend reaches level 5, you both get the invite reward.",
    "inv.btn": "Get my invite link",
    "inv.copy": "Copy",
    "inv.copied": "Copied!",
    "inv.signin": "Sign in with your wallet in the game first, then come back — or invite from the game's Menu.",
    "inv.err": "Couldn't make the link right now — try again in a moment.",
    "inv.text": "Join me in ARCIRCLE WORLD — one world, countless games!",
    "md.k": "Media",
    "md.h": "Trailer, wallpapers & logos",
    "md.trailer": "Official trailer",
    "md.wall": "Wallpapers",
    "md.logo": "Logos & icons",
    "md.dl": "Download",
    "walls": ["The world", "Three heroes", "Jurassic World", "Survivors Arena", "Infinity Rings", "ARCIA Poker"],
    "logos": ["Logo", "App icon", "Jurassic", "Survivors", "Infinity Rings", "Poker"],
    "st.wait": "Checking the servers…",
    "st.ok": "All systems normal",
    "st.down": "The game server isn't answering — try again soon",
    "pwa.install": "Add to home screen",
    "ca.k": "$ARCIRCLE contract (Arc)", "ca.copy": "Copy", "ca.copied": "Copied!", "ca.view": "View on ArcScan", "arcl.b": "ARCL", "arcl.fee": "Planned $ARCL token fee: 2% a transaction — 1% buys back and burns $ARCIRCLE, 1% funds ARCIRCLE WORLD's development. Today's in-game ARCL has no fee.", "nav.coins": "$ARCIRCLE & ARCL", "arcl.more": "How the coins work, with live numbers →", "arcl.note": "Not launched yet — ARCL are in-game points for now, not a token.",
    "sticky.s": "Free · phone & PC",
    "tips": {"jurassic": ["Press J (or the action button) to chop trees and mine rocks.", "Set up a camp with a bed and a campfire before night — the dark brings danger.", "Your ore bag is shared with the ARCL Mine."], "surv": ["Dash through a crowd when you're cornered.", "The cards show which weapon and passive evolve together — collect the pair.", "The clock pickup freezes the monsters for a moment (bosses keep moving).", "The daily challenge has its own board and pays Arena Coins."], "poker": ["Chips are play money, and there are free chips every day.", "ARCL comes from the three daily missions — never from winning a hand.", "Make a private table and share its code with your friends."], "rings": ["Tap a ring to turn it one step; drag round it to turn either way.", "A ring falls when every hook on it is open — and a fall can free its neighbours.", "A hint caps the board at 2 stars, the hammer at 1.", "Ice cracks on the first turn, portals fall in pairs, timer rings must fall in time."], "mine": ["Upgrade your pickaxe to break the bigger rocks.", "The ore you dig goes into the same bag you use in Jurassic World."], "defense": ["After a wave you pick an upgrade — towers that hit harder or reach further.", "Each wave you hold pays 5 ARCL, up to 150 a day."], "jump": ["Fall? You go back to the last checkpoint, not the start.", "The crown pays 3,000 ARCL once a day (signed in)."], "beat": ["Tap the pad as the ring lands.", "Sound off? Follow the lights."]},
    "nbody": ["Levels 101–200 bring three new rings: ice (the first turn only cracks it), portals (a pair that falls together) and timers (drop them in time). Level 200 is the RIFT BOSS, and clearing it makes you an INFINITY LEGEND. There's also a themed puzzle every day of the week and TIME ATTACK: as many boards as you can in 60 seconds, on a weekly board. Levels 101–200 pay 50 ARCL a new star for now.", "Reroll, Banish and Skip on the level-up cards, a chest roulette for 1, 3 or 5 upgrades, four pickups (food, magnet, bomb, clock), Arena Coins for six permanent upgrades, six achievements with titles, an evolution collection and a daily challenge with the same seed for everyone. Plus big critical numbers, combo counts and cut-ins.", "The lounge is a room now: your hero walks to ARCIA's table, the cashier bar, the weekly board and the style mirror. Players at the table are drawn as heroes in the chairs — they cheer when they win and shake their heads when they fold.", "Twenty villages on the town's outer ring, bought with $ARCIRCLE and paid to the ARCIRCLE treasury from your own wallet. The owner's island stands on the plot for everyone in town to see, and LAND owners build bigger islands (64×64). LAND doesn't pay out.", "Twice a day the plain's bosses wake enraged: the Alpha Raptor at 12:00 and the Thornback Titan at 20:00 (Korea time), for 30 minutes, with one HP for everyone who's there. Strike it 10 times or more and you take a hunter's share when it falls. South-east of the lake lies the Ember Basin, a volcanic bowl with lava, obsidian and sulfur — make a heat cloak first. There's fishing at the lake, hide armour, an obsidian spear, night raids on your camp, a codex and a weekly hunters' board. And three daily missions — gather 60 materials, make or build 3 things, cook 2 meals — pay 300 ARCL each, once a day, for taking part.", "If you had the page open while we updated the game, a game could fail to load. Now the page refreshes itself (twice if it must), and older game files stay online for a week."],
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
      jurassic: ["Jurassic World", "Survival · open land", "A land of its own: the Primeval Plains and realistic dinosaurs. Gather wood, stone and ore, craft at a workbench, set up camp and get through the night.", ["The Primeval Plains: a lake, forest and ridges, day and night, rain", "Camps with huts, beds, a campfire and a chest", "Hunting — and danger after dark"], "3 daily missions: 300 ARCL each, once a day, for taking part (gather 60 · make or build 3 · cook 2). Boss-hour shares and hunts give materials, not ARCL."],
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
      ["Update", "Jurassic World: boss hour, Ember Basin, daily missions", "Hunt the enraged boss together at 12:00 and 20:00 (KST), enter the volcanic Ember Basin, fish the lake — and three daily missions."],
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
    "nav.rank": "랭킹",
    "nav.media": "미디어",
    "intro.skip": "건너뛰기",
    "sound.on": "소리 켜기",
    "sound.off": "소리 끄기",
    "hero.back": "{name}님, 다시 오셨네요 · Lv {lv}",
    "hero.cont": "{name}(으)로 계속하기",
    "tk.live": "LIVE",
    "tk.rings": "♾️ 이번 주 인피니티 링 1위 <b>{name}</b> · ★{n}",
    "tk.ta": "⏱️ 타임어택 1위 <b>{name}</b> · 보드 {n}개",
    "tk.surv": "⚔️ 서바이버 아레나 1위 <b>{name}</b> · {t}",
    "tk.poker": "🃏 이번 주 포커 라운지 1위 <b>{name}</b>",
    "tk.dino": "🦖 공룡 배틀 랭킹 1위 <b>{name}</b> · 레이팅 {n}", "tk.jur": "🦖 <b>{name}</b> 님이 이번 주 쥬라기 사냥꾼 1위 · {n}점",
    "tk.idle": ["🔥 주말 2배: 매주 토·일(한국 시간) XP와 ARCL 2배", "♾️ 인피니티 링 200레벨 — 얼음·포털·시간 링", "⚔️ 서바이버 아레나: 한 판 최대 3,000 ARCL", "🏝️ 내 섬 짓기 — LAND 소유자는 64×64까지", "🦖 공룡을 부화시켜 키우고 타 보세요", "🃏 매일 무료 포커 칩"],
    "cd.day": "일일 초기화",
    "cd.week": "주간 초기화",
    "cd.wkOn": "주말 2배 종료까지",
    "cd.wkOff": "주말 2배 시작까지",
    "cd.d": "일",
    "rk.k": "리더보드",
    "rk.h": "이번 주 최고 기록",
    "rk.tabs": ["링 ★", "타임어택", "서바이버", "포커", "공룡 랭킹", "쥬라기 사냥꾼"],
    "rk.none": "이번 주 기록이 아직 없어요 — 첫 번째가 되어 보세요!",
    "rk.stars": "★ {n}",
    "rk.boards": "보드 {n}개",
    "rk.surv": "{t} · {k}킬",
    "rk.poker": "{n}점",
    "rk.dino": "Lv {lv} · {n}",
    "gd.more": "자세히",
    "gd.tips": "팁",
    "gd.pay": "보상",
    "nd.share": "공유",
    "nd.copied": "링크를 복사했어요",
    "nd.read": "더 보기",
    "v.load": "탭해서 3D 캐릭터 불러오기",
    "v.h": "3D로 만나 보세요",
    "v.p": "게임과 똑같은 모델이에요. 드래그로 돌리고, 색을 고르고, 인사해 보세요.",
    "v.wave": "인사하기",
    "v.play": "이 캐릭터로 플레이",
    "v.loading": "캐릭터를 불러오는 중…",
    "v.fail": "이 기기에서는 3D를 표시할 수 없어요.",
    "inv.k": "친구 초대",
    "inv.h": "함께 플레이해요",
    "inv.p": "내 링크를 공유하세요. 친구가 레벨 5가 되면 둘 다 초대 보상을 받아요.",
    "inv.btn": "내 초대 링크 받기",
    "inv.copy": "복사",
    "inv.copied": "복사했어요!",
    "inv.signin": "먼저 게임에서 지갑으로 로그인한 뒤 다시 와 주세요 — 또는 게임 메뉴에서 초대할 수 있어요.",
    "inv.err": "지금은 링크를 만들 수 없어요 — 잠시 후 다시 해 보세요.",
    "inv.text": "ARCIRCLE WORLD에서 같이 놀아요 — 하나의 세계, 무한한 게임!",
    "md.k": "미디어",
    "md.h": "트레일러, 배경화면 & 로고",
    "md.trailer": "공식 트레일러",
    "md.wall": "배경화면",
    "md.logo": "로고 & 아이콘",
    "md.dl": "다운로드",
    "walls": ["월드", "세 명의 영웅", "쥬라기 월드", "서바이버 아레나", "인피니티 링", "ARCIA 포커"],
    "logos": ["로고", "앱 아이콘", "쥬라기", "서바이버", "인피니티 링", "포커"],
    "st.wait": "서버 상태 확인 중…",
    "st.ok": "모든 서비스 정상",
    "st.down": "게임 서버가 응답하지 않아요 — 잠시 후 다시 해 보세요",
    "pwa.install": "홈 화면에 추가",
    "ca.k": "$ARCIRCLE 컨트랙트 (Arc)", "ca.copy": "복사", "ca.copied": "복사됨!", "ca.view": "ArcScan에서 보기", "arcl.b": "ARCL", "arcl.fee": "$ARCL 토큰 출시 후 예정 수수료: 거래마다 2% — 1%는 $ARCIRCLE 바이백 & 소각, 1%는 ARCIRCLE WORLD 생태계 개발. 지금의 게임 내 ARCL에는 수수료가 없어요.", "nav.coins": "$ARCIRCLE & ARCL", "arcl.more": "코인 설명과 실시간 현황 보기 →", "arcl.note": "아직 런칭 전이에요 — 지금 ARCL은 토큰이 아닌 게임 내 포인트예요.",
    "sticky.s": "무료 · 폰 & PC",
    "tips": {"jurassic": ["J(또는 액션 버튼)로 나무를 베고 바위를 캐요.", "밤이 되기 전에 침대와 모닥불이 있는 캠프를 세우세요 — 어둠은 위험해요.", "광석 가방은 ARCL 광산과 공유돼요."], "surv": ["몰리면 대시로 무리를 뚫고 나가세요.", "카드에 함께 진화하는 무기와 패시브가 표시돼요 — 짝을 모으세요.", "시계 아이템은 잠깐 몬스터를 멈춰요 (보스는 계속 움직여요).", "데일리 챌린지는 전용 순위가 있고 아레나 코인을 줘요."], "poker": ["칩은 게임용 돈이고, 매일 무료 칩이 있어요.", "ARCL은 하루 3개 미션에서만 — 이겨서 받는 건 없어요.", "비공개 테이블을 만들고 코드를 친구에게 공유하세요."], "rings": ["링을 탭하면 한 칸, 링을 따라 드래그하면 원하는 방향으로 돌아요.", "링의 모든 고리가 열리면 떨어지고 — 그 낙하가 이웃 링을 풀어 줄 수 있어요.", "힌트를 쓰면 최대 별 2개, 해머를 쓰면 1개예요.", "얼음은 첫 회전에 깨지고, 포털은 쌍으로 떨어지고, 시간 링은 제때 떨어뜨려야 해요."], "mine": ["곡괭이를 업그레이드하면 더 큰 바위를 깰 수 있어요.", "캔 광석은 쥬라기 월드와 같은 가방에 들어가요."], "defense": ["웨이브가 끝나면 업그레이드를 골라요 — 더 세게, 더 멀리 공격하는 타워.", "막아 낸 웨이브마다 5 ARCL, 하루 최대 150."], "jump": ["떨어지면 처음이 아니라 마지막 체크포인트로 돌아가요.", "왕관은 하루 한 번 3,000 ARCL (로그인 시)."], "beat": ["링이 내려앉는 순간 패드를 탭하세요.", "소리가 꺼져 있다면 불빛을 따라가세요."]},
    "nbody": ["101~200레벨에 새 링 세 가지가 나와요: 얼음(첫 회전은 얼음만 깨져요), 포털(쌍으로 함께 떨어져요), 시간 링(제때 떨어뜨려야 해요). 200레벨은 균열 보스이고, 깨면 INFINITY LEGEND 칭호를 받아요. 요일마다 테마 퍼즐이 있고, 60초 동안 최대한 많은 보드를 깨는 타임어택도 주간 순위와 함께 생겼어요. 101~200레벨은 당분간 새 별마다 50 ARCL이에요.", "레벨업 카드의 새로고침·제외·건너뛰기, 1·3·5개 업그레이드를 고르는 상자 룰렛, 아이템 4종(음식·자석·폭탄·시계), 영구 강화 6종을 위한 아레나 코인, 칭호가 있는 업적 6개, 진화 컬렉션, 모두에게 같은 시드의 데일리 챌린지. 큼직한 크리티컬 숫자, 콤보, 컷인 연출도 더해졌어요.", "라운지가 공간이 됐어요: 내 캐릭터가 ARCIA의 테이블, 캐셔 바, 주간 순위판, 스타일 거울까지 걸어가요. 테이블의 플레이어는 의자에 앉은 캐릭터로 보이고, 이기면 환호하고 폴드하면 고개를 저어요.", "마을 바깥 링의 마을 20곳을 $ARCIRCLE로 살 수 있어요. 결제는 내 지갑에서 ARCIRCLE 트레저리로 직접 해요. 주인의 섬이 그 자리에 세워져 마을의 모두가 볼 수 있고, LAND 소유자는 더 큰 섬(64×64)을 지을 수 있어요. LAND에서 지급되는 보상은 없어요.", "하루 두 번 평원의 보스가 분노해 깨어나요: 12:00에는 알파 랩터, 20:00에는 쏜백 타이탄 (한국 시간), 30분 동안, 그 자리에 있는 모두가 하나의 HP를 함께 깎아요. 10번 이상 공격하면 쓰러졌을 때 사냥꾼 몫을 받아요. 호수 남동쪽에는 용암, 흑요석, 유황이 있는 화산 분지 '불씨 분지'가 있어요 — 먼저 내열 망토를 만드세요. 호수 낚시, 가죽 갑옷, 흑요석 창, 캠프 밤 습격, 도감, 주간 사냥꾼 순위도 생겼어요. 그리고 일일 미션 3개 — 재료 60개 모으기, 3가지 만들거나 짓기, 요리 2번 — 는 참여 보상으로 각각 하루 한 번 300 ARCL이에요.", "게임을 업데이트하는 동안 페이지를 열어 두었다면 게임이 열리지 않을 때가 있었어요. 이제 페이지가 스스로 새로고침하고(필요하면 두 번), 이전 게임 파일도 일주일 동안 남겨 둬요."],
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
      jurassic: ["Jurassic World", "서바이벌 · 오픈 월드", "원시 평원과 사실적인 공룡이 사는 별도의 땅. 나무·돌·광석을 모으고, 작업대에서 제작하고, 캠프를 세워 밤을 버티세요.", ["원시 평원: 호수, 숲, 산등성이, 낮과 밤, 비", "오두막·침대·모닥불·상자가 있는 캠프", "사냥 — 그리고 어둠 속의 위험"], "일일 미션 3개: 참여 보상으로 각 300 ARCL, 하루 한 번 (재료 60개 · 3가지 제작/건설 · 요리 2번). 보스 몫과 사냥은 ARCL이 아니라 재료를 줘요."],
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
    news: [["업데이트", "인피니티 링, 200레벨로 두 배", "얼음·포털·시간 링, 200레벨의 균열 보스, 주간 퍼즐, 60초 타임어택."], ["업데이트", "서바이버 아레나 대규모 업데이트", "새로고침·제외·건너뛰기, 상자 룰렛, 영구 강화, 업적, 데일리 챌린지."], ["업데이트", "포커 라운지가 3D 공간으로", "내 캐릭터가 ARCIA의 테이블까지 걸어가요. 플레이어는 캐릭터로 앉고, 이기면 환호해요."], ["신규", "ARCIRCLE LAND 오픈", "마을 바깥 링의 마을 20곳. 내 섬이 내 마을에 세워져 모두가 볼 수 있어요."], ["업데이트", "쥬라기 월드: 보스 타임, 불씨 분지, 일일 미션", "12:00와 20:00(한국 시간)에 분노한 보스를 함께 사냥하고, 화산 지대 불씨 분지에 들어가고, 호수에서 낚시하세요 — 일일 미션 3개도 생겼어요."], ["수정", "더 매끄러운 업데이트", "업데이트 전에 열어 둔 페이지가 게임을 못 불러오는 대신 스스로 새로고침해요."]],
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
    "nav.rank": "排行",
    "nav.media": "媒体",
    "intro.skip": "跳过",
    "sound.on": "打开声音",
    "sound.off": "关闭声音",
    "hero.back": "欢迎回来，{name} · Lv {lv}",
    "hero.cont": "以 {name} 继续",
    "tk.live": "LIVE",
    "tk.rings": "♾️ 本周无限之环第一 <b>{name}</b> · ★{n}",
    "tk.ta": "⏱️ 限时挑战第一 <b>{name}</b> · {n} 局",
    "tk.surv": "⚔️ 幸存者竞技场第一 <b>{name}</b> · {t}",
    "tk.poker": "🃏 本周扑克休息室第一 <b>{name}</b>",
    "tk.dino": "🦖 恐龙天梯第一 <b>{name}</b> · 积分 {n}", "tk.jur": "🦖 <b>{name}</b> 本周领跑侏罗纪猎手榜 · {n} 分",
    "tk.idle": ["🔥 周末双倍：每周六、周日（韩国时间）经验和 ARCL 翻倍", "♾️ 无限之环 200 关——冰环、传送门环、计时环", "⚔️ 幸存者竞技场：每局最多 3,000 ARCL", "🏝️ 建造你的岛屿——LAND 拥有者可建到 64×64", "🦖 孵化恐龙，养大它，骑上它", "🃏 每天免费扑克筹码"],
    "cd.day": "每日重置",
    "cd.week": "每周重置",
    "cd.wkOn": "周末双倍结束",
    "cd.wkOff": "周末双倍开始",
    "cd.d": "天",
    "rk.k": "排行榜",
    "rk.h": "本周最佳",
    "rk.tabs": ["圆环 ★", "限时挑战", "幸存者", "扑克", "恐龙天梯", "侏罗纪猎手"],
    "rk.none": "本周榜上还没人——来做第一个吧！",
    "rk.stars": "★ {n}",
    "rk.boards": "{n} 局",
    "rk.surv": "{t} · {k} 击倒",
    "rk.poker": "{n} 分",
    "rk.dino": "Lv {lv} · {n}",
    "gd.more": "详情",
    "gd.tips": "技巧",
    "gd.pay": "奖励",
    "nd.share": "分享",
    "nd.copied": "链接已复制",
    "nd.read": "阅读更多",
    "v.load": "点击载入 3D 角色",
    "v.h": "3D 看看他们",
    "v.p": "与游戏中完全相同的模型。拖动旋转，挑选颜色，打个招呼。",
    "v.wave": "挥手",
    "v.play": "用这个角色开玩",
    "v.loading": "正在载入角色…",
    "v.fail": "此设备无法显示 3D。",
    "inv.k": "邀请好友",
    "inv.h": "一起玩",
    "inv.p": "分享你的链接。好友达到 5 级时，你们都会获得邀请奖励。",
    "inv.btn": "获取我的邀请链接",
    "inv.copy": "复制",
    "inv.copied": "已复制！",
    "inv.signin": "请先在游戏中用钱包登录，再回到这里——也可以在游戏菜单里邀请。",
    "inv.err": "暂时无法生成链接——请稍后再试。",
    "inv.text": "来 ARCIRCLE WORLD 和我一起玩——一个世界，无数游戏！",
    "md.k": "媒体",
    "md.h": "预告片、壁纸与标志",
    "md.trailer": "官方预告片",
    "md.wall": "壁纸",
    "md.logo": "标志与图标",
    "md.dl": "下载",
    "walls": ["世界", "三位英雄", "侏罗纪世界", "幸存者竞技场", "无限之环", "ARCIA 扑克"],
    "logos": ["标志", "应用图标", "侏罗纪", "幸存者", "无限之环", "扑克"],
    "st.wait": "正在检查服务器…",
    "st.ok": "所有服务正常",
    "st.down": "游戏服务器暂无响应——请稍后再试",
    "pwa.install": "添加到主屏幕",
    "ca.k": "$ARCIRCLE 合约 (Arc)", "ca.copy": "复制", "ca.copied": "已复制！", "ca.view": "在 ArcScan 查看", "arcl.b": "ARCL", "arcl.fee": "$ARCL 代币上线后的计划手续费：每笔交易 2% —— 1% 用于回购并销毁 $ARCIRCLE，1% 用于 ARCIRCLE WORLD 生态发展。目前游戏内 ARCL 不收手续费。", "nav.coins": "$ARCIRCLE 与 ARCL", "arcl.more": "了解两种币与实时数据 →", "arcl.note": "尚未上线——目前 ARCL 是游戏内积分，不是代币。",
    "sticky.s": "免费 · 手机和电脑",
    "tips": {"jurassic": ["按 J（或动作按钮）砍树、采石。", "入夜前搭好有床和篝火的营地——黑夜很危险。", "你的矿石袋与 ARCL 矿场共享。"], "surv": ["被包围时用冲刺穿过怪群。", "卡片会显示哪把武器和哪个被动可以一起进化——凑齐这一对。", "时钟道具会让怪物暂停片刻（首领不受影响）。", "每日挑战有独立排行，奖励竞技场币。"], "poker": ["筹码是游戏币，每天都有免费筹码。", "ARCL 只来自每天 3 个任务——从不因赢牌发放。", "创建私人牌桌，把房间码分享给好友。"], "rings": ["点一下圆环转一格；沿着圆环拖动可任意方向转。", "圆环上的钩子全部打开就会掉落——掉落还能解开相邻的圆环。", "用提示最多 2 星，用锤子最多 1 星。", "冰环第一次转动会碎冰，传送门环成对掉落，计时环必须及时掉落。"], "mine": ["升级镐子才能敲碎更大的岩石。", "挖到的矿石会放进与侏罗纪世界共用的袋子。"], "defense": ["每波结束后挑一个强化——伤害更高或射程更远的塔。", "每守住一波 5 ARCL，每天最多 150。"], "jump": ["掉下去会回到最近的检查点，而不是起点。", "王冠每天一次 3,000 ARCL（登录后）。"], "beat": ["在圆环落下的瞬间点按踏板。", "没开声音？跟着灯光走。"]},
    "nbody": ["101–200 关带来三种新圆环：冰环（第一次转动只碎冰）、传送门环（成对一起掉落）、计时环（必须及时掉落）。第 200 关是裂隙首领，通关即获得 INFINITY LEGEND 称号。每周每天还有主题谜题，以及限时挑战：60 秒内尽量多通关，进入每周排行。101–200 关目前每颗新星 50 ARCL。", "升级卡的重抽、放逐和跳过，可选 1、3 或 5 个强化的宝箱轮盘，四种道具（食物、磁铁、炸弹、时钟），用于六项永久强化的竞技场币，六个带称号的成就，进化图鉴，以及所有人同一种子的每日挑战。还有大号暴击数字、连击和特写演出。", "休息室现在是一个空间：你的角色可以走到 ARCIA 的牌桌、兑换柜台、每周排行和造型镜前。牌桌上的玩家以角色形象坐在椅子上——赢了会欢呼，弃牌会摇头。", "小镇外环的 20 座村庄，用 $ARCIRCLE 购买，从你自己的钱包直接付款给 ARCIRCLE 金库。拥有者的岛屿会立在地块上供全镇观看，LAND 拥有者还能建造更大的岛屿（64×64）。LAND 不产生收益。", "每天两次，平原的首领会暴怒醒来：12:00 是阿尔法迅猛龙，20:00 是棘背泰坦（韩国时间），持续 30 分钟，在场的所有人共享同一条血量。攻击 10 次以上，它倒下时你就能拿到猎手份额。湖的东南方是余烬盆地，一个有熔岩、黑曜石和硫磺的火山盆地——先做一件隔热斗篷。还新增了湖边钓鱼、兽皮护甲、黑曜石长矛、营地夜袭、图鉴和每周猎手榜。三个每日任务——采集 60 份材料、制作或建造 3 样东西、烹饪 2 份餐食——作为参与奖励，每个每天一次 300 ARCL。", "如果更新游戏时你的页面一直开着，游戏可能无法载入。现在页面会自己刷新（必要时两次），旧的游戏文件也会保留一周。"],
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
      jurassic: ["Jurassic World", "生存 · 开放大陆", "一片独立的大陆：原始平原和逼真的恐龙。采集木材、石头和矿石，在工作台制作，建立营地，熬过黑夜。", ["原始平原：湖泊、森林与山脊，昼夜与降雨", "有小屋、床、篝火和箱子的营地", "狩猎——以及黑夜里的危险"], "3 个每日任务：参与奖励，每个每天一次 300 ARCL（采集 60 · 制作或建造 3 · 烹饪 2）。首领份额和狩猎给材料，不给 ARCL。"],
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
    news: [["更新", "无限之环翻倍至 200 关", "冰环、传送门环、计时环，200 关的裂隙首领，每周谜题和 60 秒限时挑战。"], ["更新", "幸存者竞技场重大更新", "重抽、放逐和跳过，宝箱轮盘，永久强化，成就和每日挑战。"], ["更新", "扑克休息室变成 3D 空间", "带着你的角色走到 ARCIA 的牌桌。玩家以角色入座，赢了会欢呼。"], ["新内容", "ARCIRCLE LAND 开放", "小镇外环的 20 座村庄。你的岛屿立在你的村庄上，所有人都能看到。"], ["更新", "侏罗纪世界：首领时刻、余烬盆地、每日任务", "每天 12:00 和 20:00（韩国时间）一起狩猎暴怒的首领，进入火山余烬盆地，在湖边钓鱼——还有三个每日任务。"], ["修复", "更顺畅的更新", "更新前打开的页面现在会自动刷新，而不是无法载入游戏。"]],
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
    "nav.rank": "Sıralamalar",
    "nav.media": "Medya",
    "intro.skip": "Geç",
    "sound.on": "Sesi aç",
    "sound.off": "Sesi kapat",
    "hero.back": "Tekrar hoş geldin, {name} · Lv {lv}",
    "hero.cont": "{name} olarak devam et",
    "tk.live": "CANLI",
    "tk.rings": "♾️ Bu hafta INFINITY RINGS lideri <b>{name}</b> · ★{n}",
    "tk.ta": "⏱️ ZAMANA KARŞI lideri <b>{name}</b> · {n} tahta",
    "tk.surv": "⚔️ SURVIVORS ARENA lideri <b>{name}</b> · {t}",
    "tk.poker": "🃏 Bu hafta poker salonunun lideri <b>{name}</b>",
    "tk.dino": "🦖 Dinozor sıralamasının lideri <b>{name}</b> · puan {n}", "tk.jur": "🦖 <b>{name}</b> bu hafta Jurassic avcılarının lideri · {n} puan",
    "tk.idle": ["🔥 Hafta sonu 2×: her cumartesi ve pazar (KST) iki kat XP ve ARCL", "♾️ 200 seviyelik INFINITY RINGS — buz, portal ve zamanlayıcı halkaları", "⚔️ SURVIVORS ARENA: tur başına en fazla 3.000 ARCL", "🏝️ Adanı kur — LAND sahipleri 64×64'e kadar", "🦖 Bir dinozor çıkar, büyüt, bin", "🃏 Her gün ücretsiz poker fişi"],
    "cd.day": "Günlük sıfırlama",
    "cd.week": "Haftalık sıfırlama",
    "cd.wkOn": "Hafta sonu 2× bitiyor",
    "cd.wkOff": "Hafta sonu 2× başlıyor",
    "cd.d": "g",
    "rk.k": "Sıralamalar",
    "rk.h": "Haftanın en iyileri",
    "rk.tabs": ["Halkalar ★", "Zamana Karşı", "Survivors", "Poker", "Dinozorlar", "Jurassic avcıları"],
    "rk.none": "Bu hafta tabloda henüz kimse yok — ilk sen ol!",
    "rk.stars": "★ {n}",
    "rk.boards": "{n} tahta",
    "rk.surv": "{t} · {k} KO",
    "rk.poker": "{n} puan",
    "rk.dino": "Lv {lv} · {n}",
    "gd.more": "Ayrıntılar",
    "gd.tips": "İpuçları",
    "gd.pay": "Ödüller",
    "nd.share": "Paylaş",
    "nd.copied": "Bağlantı kopyalandı",
    "nd.read": "Devamını oku",
    "v.load": "3D kahramanı yüklemek için dokun",
    "v.h": "Onları 3D dene",
    "v.p": "Oyundakiyle aynı modeller. Döndürmek için sürükle, bir renk seç, selam ver.",
    "v.wave": "El salla",
    "v.play": "Bu kahramanla oyna",
    "v.loading": "Kahraman yükleniyor…",
    "v.fail": "Bu cihazda 3D kullanılamıyor.",
    "inv.k": "Arkadaş davet et",
    "inv.h": "Birlikte oyna",
    "inv.p": "Bağlantını paylaş. Arkadaşın 5. seviyeye ulaşınca ikiniz de davet ödülü alırsınız.",
    "inv.btn": "Davet bağlantımı al",
    "inv.copy": "Kopyala",
    "inv.copied": "Kopyalandı!",
    "inv.signin": "Önce oyunda cüzdanınla giriş yap, sonra buraya dön — ya da oyunun Menüsünden davet et.",
    "inv.err": "Bağlantı şu an oluşturulamadı — birazdan tekrar dene.",
    "inv.text": "ARCIRCLE WORLD'de bana katıl — tek dünya, sayısız oyun!",
    "md.k": "Medya",
    "md.h": "Fragman, duvar kâğıtları & logolar",
    "md.trailer": "Resmî fragman",
    "md.wall": "Duvar kâğıtları",
    "md.logo": "Logolar & simgeler",
    "md.dl": "İndir",
    "walls": ["Dünya", "Üç kahraman", "Jurassic World", "Survivors Arena", "Infinity Rings", "ARCIA Poker"],
    "logos": ["Logo", "Uygulama simgesi", "Jurassic", "Survivors", "Infinity Rings", "Poker"],
    "st.wait": "Sunucular kontrol ediliyor…",
    "st.ok": "Tüm sistemler normal",
    "st.down": "Oyun sunucusu yanıt vermiyor — birazdan tekrar dene",
    "pwa.install": "Ana ekrana ekle",
    "ca.k": "$ARCIRCLE sözleşmesi (Arc)", "ca.copy": "Kopyala", "ca.copied": "Kopyalandı!", "ca.view": "ArcScan'de gör", "arcl.b": "ARCL", "arcl.fee": "Planlanan $ARCL token ücreti: işlem başına %2 — %1 $ARCIRCLE geri alım ve yakım, %1 ARCIRCLE WORLD ekosistem geliştirme. Bugünkü oyun içi ARCL'de ücret yok.", "nav.coins": "$ARCIRCLE & ARCL", "arcl.more": "Coinler nasıl çalışır, canlı verilerle →", "arcl.note": "Henüz piyasaya çıkmadı — ARCL şimdilik bir token değil, oyun içi puan.",
    "sticky.s": "Ücretsiz · telefon & PC",
    "tips": {"jurassic": ["Ağaç kesmek ve kaya kazmak için J'ye (ya da eylem düğmesine) bas.", "Geceden önce yatak ve kamp ateşiyle bir kamp kur — karanlık tehlikelidir.", "Maden çantan ARCL Mine ile ortaktır."], "surv": ["Köşeye sıkışınca kalabalığın içinden atıl.", "Kartlar hangi silah ve pasifin birlikte evrimleştiğini gösterir — çifti topla.", "Saat eşyası canavarları bir anlığına dondurur (boss'lar hareket eder).", "Günlük meydan okumanın kendi tablosu var ve Arena Coin verir."], "poker": ["Fişler oyun parasıdır ve her gün ücretsiz fiş var.", "ARCL yalnızca günlük üç görevden gelir — el kazanmaktan asla.", "Özel masa aç ve kodunu arkadaşlarınla paylaş."], "rings": ["Bir adım çevirmek için halkaya dokun; iki yöne çevirmek için etrafında sürükle.", "Tüm kancaları açık olan halka düşer — düşüş komşularını da çözebilir.", "İpucu tahtayı en fazla 2 yıldızla, çekiç 1 yıldızla sınırlar.", "Buz ilk çevrilişte çatlar, portallar çift düşer, zamanlayıcı halkalar zamanında düşmeli."], "mine": ["Daha büyük kayaları kırmak için kazmanı yükselt.", "Kazdığın cevher Jurassic World'de kullandığın çantaya gider."], "defense": ["Bir dalgadan sonra bir geliştirme seçersin — daha sert vuran ya da daha uzağa erişen kuleler.", "Tuttuğun her dalga 5 ARCL, günde en fazla 150."], "jump": ["Düşersen başa değil, son kontrol noktasına dönersin.", "Taç günde bir kez 3.000 ARCL (giriş yapınca)."], "beat": ["Halka indiği anda pede dokun.", "Ses kapalı mı? Işıkları takip et."]},
    "nbody": ["101–200 seviyeler üç yeni halka getiriyor: buz (ilk çevriliş yalnızca buzu kırar), portal (birlikte düşen bir çift) ve zamanlayıcı (zamanında düşür). 200. seviye YARIK BOSS'tur ve onu geçen INFINITY LEGEND olur. Haftanın her günü temalı bir bulmaca ve ZAMANA KARŞI da var: 60 saniyede olabildiğince çok tahta, haftalık tabloda. 101–200 seviyeler şimdilik yeni yıldız başına 50 ARCL verir.", "Seviye kartlarında Yenile, Sürgün ve Geç; 1, 3 ya da 5 geliştirme için sandık ruleti; dört eşya (yemek, mıknatıs, bomba, saat); altı kalıcı geliştirme için Arena Coin; unvanlı altı başarım; evrim koleksiyonu ve herkese aynı tohumla günlük meydan okuma. Ayrıca büyük kritik sayılar, kombolar ve kesitler.", "Salon artık bir oda: kahramanın ARCIA'nın masasına, kasa barına, haftalık tabloya ve stil aynasına yürür. Masadaki oyuncular sandalyelerde kahraman olarak görünür — kazanınca sevinir, pas geçince başını sallar.", "Kasabanın dış halkasında $ARCIRCLE ile alınan ve kendi cüzdanından ARCIRCLE hazinesine ödenen yirmi köy. Sahibinin adası arsada tüm kasabanın göreceği şekilde durur ve LAND sahipleri daha büyük adalar (64×64) kurabilir. LAND ödeme yapmaz.", "Günde iki kez ovanın boss'ları öfkeyle uyanır: 12:00'de Alfa Raptor, 20:00'de Dikensırt Titan (Kore saati), 30 dakika boyunca, oradaki herkes için tek bir can. 10 ya da daha fazla vur, düştüğünde avcı payını al. Gölün güneydoğusunda lav, obsidyen ve kükürtlü volkanik bir çukur olan Kor Havzası var — önce bir ısı pelerini yap. Gölde balık tutma, deri zırh, obsidyen mızrak, kampa gece baskınları, bir ansiklopedi ve haftalık avcı tablosu da geldi. Üç günlük görev — 60 malzeme topla, 3 şey yap ya da kur, 2 öğün pişir — katılım için her biri günde bir kez 300 ARCL öder.", "Oyunu güncellerken sayfan açıksa bir oyun yüklenemeyebiliyordu. Artık sayfa kendini yeniliyor (gerekirse iki kez) ve eski oyun dosyaları bir hafta çevrimiçi kalıyor."],
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
      jurassic: ["Jurassic World", "Hayatta kalma · açık arazi", "Kendine ait bir kara: İlkel Ovalar ve gerçekçi dinozorlar. Odun, taş ve maden topla, tezgâhta üret, kamp kur ve geceyi atlat.", ["İlkel Ovalar: göl, orman ve sırtlar, gece-gündüz, yağmur", "Kulübe, yatak, kamp ateşi ve sandıklı kamplar", "Avcılık — ve karanlıkta tehlike"], "3 günlük görev: katılım için her biri günde bir kez 300 ARCL (60 topla · 3 yap/kur · 2 pişir). Boss payları ve avlar ARCL değil, malzeme verir."],
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
    news: [["Güncelleme", "INFINITY RINGS 200 seviyeye çıktı", "Buz, portal ve zamanlayıcı halkaları, 200'de YARIK BOSS, haftalık bulmacalar ve 60 saniyelik Zamana Karşı."], ["Güncelleme", "SURVIVORS ARENA büyük güncelleme", "Yenile, Sürgün & Geç, sandık ruleti, kalıcı geliştirmeler, başarımlar ve günlük meydan okuma."], ["Güncelleme", "Poker salonu artık 3D bir oda", "Kahramanını ARCIA'nın masasına yürüt. Oyuncular kahraman olarak oturur — kazanınca sevinir."], ["Yeni", "ARCIRCLE LAND açıldı", "Kasabanın dış halkasında 20 köy. Adan köyünde herkesin göreceği şekilde durur."], ["Güncelleme", "Jurassic World: boss saati, Kor Havzası, günlük görevler", "12:00 ve 20:00'de (KST) öfkeli boss'u birlikte avla, volkanik Kor Havzası'na gir, gölde balık tut — ve üç günlük görev."], ["Düzeltme", "Daha akıcı güncellemeler", "Güncellemeden önce açılan sayfa artık oyunu yükleyememek yerine kendini yeniliyor."]],
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
  var gi = 0, stats = null, boards = null, rk = 0;
  var KEYART = { jurassic: 1, surv: 1, rings: 1, poker: 1 }; // the owner's key art (images/gw/key-*.webp); the others show their game card
  var gArt = function (g, small) { return KEYART[g.id] ? "/images/gw/key-" + g.id + (small ? "-416" : "") + ".webp" : "/images/games/" + g.img + ".webp"; };
  var gIcon = function (g) { return KEYART[g.id] ? "/images/gw/icon-" + g.id + ".webp" : "/images/games/" + g.img + ".webp"; };
  var VER = (function () { var s = $('script[src*="gw.js"]'), m = s && /[?&]v=(\w+)/.exec(s.getAttribute("src")); return m ? m[1] : "1"; })();
  var phone = innerWidth < 760;
  var dev = coarse || phone ? "ph" : "pc";
  // what people do here, counted by kind only (api/_world.mjs diag kind "site": no ids, no wallets)
  function diag(ev, at) { try { fetch("/api/social", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "world-diag", kind: "site", ev: ev, at: at || "", dev: dev }) }).catch(function () { /* a count lost */ }); } catch (e) { /* fine */ } }
  // the h2s come in word by word
  function words(el) { var s = el.textContent; el.innerHTML = s.split(/\s+/).filter(Boolean).map(function (w, i) { return '<span class="w"><i style="--wi:' + i + '">' + esc(w) + "</i></span>"; }).join(" "); }
  function paint() {
    document.documentElement.lang = lang;
    $$("[data-i]").forEach(function (el) { var v = t(el.getAttribute("data-i")); if (typeof v !== "string") return; if (/<b>/.test(v)) el.innerHTML = v; else el.textContent = v; if (el.classList.contains("gw-h2") && !reduce) words(el); });
    $(".gw-lang-cur").textContent = lang.toUpperCase();
    $$(".gw-lang-menu button, .gw-foot-lang button").forEach(function (b) { b.classList.toggle("on", b.dataset.lang === lang); });
    var L = D();
    // news (a card opens its story)
    $("#gw-news").innerHTML = L.news.map(function (n, i) { var m = NEWS[i] || {}; return '<a class="gw-news gw-rv" style="--d:' + i + '" href="#news-' + i + '" data-news="' + i + '"><div class="gw-news-img"><img src="' + m.img + '" alt="" loading="lazy">' + (m.b ? '<span class="gw-badge ' + m.b + '">' + esc(n[0]) + "</span>" : "") + '</div><div class="gw-news-b"><span class="gw-meta">' + esc(n[0]) + "<span>" + esc(m.d.replace(/-/g, ". ")) + "</span></span><h3>" + esc(n[1]) + "</h3><p>" + esc(n[2]) + "</p></div></a>"; }).join("");
    // games
    $("#gw-gtabs").innerHTML = GAMES.map(function (g, i) { return '<button type="button" role="tab" class="gw-gtab" data-g="' + i + '" aria-selected="' + (i === gi) + '"><img src="' + gIcon(g) + '" alt="" loading="lazy"><b>' + esc(L.games[g.id][0]) + "</b></button>"; }).join("");
    paintGame(false);
    // heroes
    $("#gw-picks").innerHTML = HEROES.map(function (h, i) { var x = L.heroes[h.id]; return '<article class="gw-pick gw-rv" style="--c:' + h.c + ";--d:" + i + '" data-tilt><div class="gw-pick-img"><img src="/images/gw/pick-' + h.id + '.webp" alt="' + esc(x[0]) + '" loading="lazy"></div><div class="gw-pick-b"><span class="gw-pick-t">' + esc(x[1]) + '</span><span class="gw-pick-n">' + esc(x[0]) + "</span><p>" + esc(x[2]) + '</p><dl><dt>' + esc(t("perk")) + "</dt><dd>" + esc(x[3]) + "</dd><dt>" + esc(t("skill")) + "</dt><dd>" + esc(x[4]) + "</dd></dl><small class=\"gw-fine\">" + esc(t("inSurv")) + "</small></div></article>"; }).join("");
    paintViewer();
    paintRanks();
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
    $("#gw-events").innerHTML = L.events.map(function (e, i) { var c = EV_COL[i % EV_COL.length]; return '<div class="gw-ev gw-rv" style="--a:' + c[0] + ";--b:" + c[1] + ";--d:" + (i % 3) + '">' + (i === 0 && weekendNow() ? '<span class="gw-live-b">' + esc(t("live")) + "</span>" : "") + "<i>" + e[0] + "</i><small>" + esc(e[3]) + "</small><h3>" + esc(e[1]) + "</h3><p>" + esc(e[2]) + "</p></div>"; }).join("");
    // notices, media, policy
    $("#gw-notices").innerHTML = L.notices.map(function (n, i) { var d = dateOf(NOTE_D[i] || NOTE_D[0]); return '<li class="gw-rv" style="--d:' + (i % 3) + '"><time datetime="' + NOTE_D[i] + '"><b>' + d.d + "</b>" + d.y + "." + d.m + "</time><h3>" + esc(n[0]) + "</h3><p>" + esc(n[1]) + "</p></li>"; }).join("");
    var W = ["/images/gw/hero-poster.jpg", "/images/gw/heroes.webp", "/images/gw/key-jurassic.webp", "/images/gw/key-surv.webp", "/images/gw/key-rings.webp", "/images/gw/key-poker.webp"];
    $("#gw-walls").innerHTML = t("walls").map(function (n, i) { return '<a class="gw-wall gw-rv" style="--d:' + (i % 3) + '" href="' + W[i] + '" download><img src="' + W[i].replace("heroes.webp", "heroes-800.webp").replace(/key-(\w+)\.webp/, "key-$1-416.webp") + '" alt="" loading="lazy"><span>' + esc(n) + "<em>⬇ " + esc(t("md.dl")) + "</em></span></a>"; }).join("");
    var LG = ["/images/gw/logo.webp", "/images/gw/icon-app.webp", "/images/gw/icon-jurassic.webp", "/images/gw/icon-surv.webp", "/images/gw/icon-rings.webp", "/images/gw/icon-poker.webp"];
    $("#gw-logos").innerHTML = t("logos").map(function (n, i) { return '<a class="gw-lg gw-rv" style="--d:' + (i % 3) + '" href="' + LG[i] + '" download><img src="' + (i ? LG[i] : "/images/gw/logo-540.webp") + '" alt="" loading="lazy"><span>' + esc(n) + "</span><small>⬇ " + esc(t("md.dl")) + "</small></a>"; }).join("");
    $("#gw-policy").innerHTML = L.policy.map(function (p, i) { return '<div class="gw-pol gw-rv" style="--d:' + i + '"><h3><span>' + p[0] + "</span>" + esc(p[1]) + "</h3><ul>" + p[2].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"; }).join("");
    $$('.gw-drawer-in > a').forEach(function (a, i) { a.style.setProperty("--k", i); });
    paintBack(); paintTicker(); paintClocks(); paintStatus(); soundLabel();
    reveal(); tilt(); carousel();
  }
  var bgI = 0;
  function paintGame(anim) {
    var L = D(), g = GAMES[gi], x = L.games[g.id], p = $("#gw-gpanel");
    p.style.setProperty("--gc", g.c); $("#games").style.setProperty("--gc", g.c);
    p.innerHTML = '<i class="gw-gwipe"></i><div class="gw-gart"><img src="' + gArt(g) + '" alt="' + esc(x[0]) + '"><span class="gw-gnum">0' + (gi + 1) + '</span></div><div class="gw-ginfo"><span class="gw-badge" style="background:linear-gradient(135deg,#fff,' + g.c + ')">' + esc(x[1]) + "</span><h3>" + esc(x[0]) + "</h3><p>" + esc(x[2]) + "</p>" + (x[3].length ? '<ul class="gw-gfacts">' + x[3].map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + '<p class="gw-earn">💠 ' + esc(t("earn")) + " · " + esc(x[4]) + '</p><div class="gw-gbtns"><a class="gw-btn gw-btn-play gw-btn-lg" href="/play" data-at="game">' + esc(t("playG", { g: x[0] })) + '</a><a class="gw-btn gw-btn-ghost gw-btn-lg" href="#game-' + g.id + '" data-game="' + g.id + '">' + esc(t("gd.more")) + "</a></div></div>";
    $$(".gw-gtab").forEach(function (b, i) { b.setAttribute("aria-selected", String(i === gi)); });
    // the key art behind the section crossfades
    var imgs = $$(".gw-gbg img"), nx = imgs[bgI ^ 1], cur = imgs[bgI], src = gArt(g, true);
    if (nx && cur.getAttribute("src") !== src) { nx.onload = function () { nx.classList.add("on"); cur.classList.remove("on"); bgI ^= 1; }; nx.src = src; }
    if (anim && !reduce) { p.classList.remove("swap"); void p.offsetWidth; p.classList.add("swap"); }
    var tab = $('.gw-gtab[data-g="' + gi + '"]'); if (tab && anim) try { var tr = tab.parentNode; tr.scrollTo({ left: tab.offsetLeft - (tr.clientWidth - tab.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" }); } catch (e) { /* fine */ }
  }
  function paintKpis() {
    var vals = [stats && stats.players != null ? [stats.players, 10000, t("soFar", { n: fmt(stats.players) })] : null, stats && stats.online != null ? [stats.online, 100, t("online", { n: fmt(stats.online) })] : null, [GAMES.length, 10, t("soFar", { n: GAMES.length })], null, null];
    $$("[data-kpi]").forEach(function (el) { var v = vals[Number(el.dataset.kpi)]; el.querySelector("em").textContent = v ? v[2] : t("tbd"); var m = el.querySelector(".gw-meter i"); m.style.width = v ? Math.max(2, Math.min(100, (v[0] / v[1]) * 100)) + "%" : "0%"; if (!v) el.querySelector(".gw-meter").style.opacity = ".3"; });
  }

  // ---------------- welcome back: the hero saved in this browser (the game's own save, arc.world) ----------------
  var saved = null; try { var P = JSON.parse(localStorage.getItem("arc.world") || "null"); if (P && P.name) saved = { name: String(P.name).slice(0, 20), char: P.char, tint: P.tint | 0, xp: Number(P.xp) || 0, lv: 0 }; } catch (e) { saved = null; }
  function paintBack() {
    var el = $("#gw-back"); if (!saved) return; el.hidden = false;
    el.textContent = saved.lv ? t("hero.back", { name: saved.name, lv: saved.lv }) : t("hero.cont", { name: saved.name });
  }
  if (saved) import("/world-rpg-data.js").then(function (m) { saved.lv = m.levelOfXp(saved.xp); paintBack(); }).catch(function () { /* the name alone */ });

  // ---------------- the live strip: who leads the boards this week, and the clocks ----------------
  var nm = function (x) { return x.name || (x.w ? String(x.w).slice(0, 6) + "…" : "?"); };
  var mmss = function (s) { s = Math.max(0, Math.round(Number(s) || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  var BOARDS = [
    { q: "rings-top", icon: "/images/gw/icon-rings.webp", tk: "tk.rings", v: function (x) { return t("rk.stars", { n: fmt(x.stars) }); }, n: function (x) { return fmt(x.stars); } },
    { q: "rings-ta", icon: "/images/gw/icon-rings.webp", tk: "tk.ta", v: function (x) { return t("rk.boards", { n: fmt(x.n) }); }, n: function (x) { return fmt(x.n); } },
    { q: "surv-top", icon: "/images/gw/icon-surv.webp", tk: "tk.surv", v: function (x) { return t("rk.surv", { t: mmss(x.secs), k: fmt(x.kills || 0) }); }, n: function (x) { return mmss(x.secs); } },
    { q: "poker-top", icon: "/images/gw/icon-poker.webp", tk: "tk.poker", v: function (x) { return t("rk.poker", { n: fmt(x.n) }); }, n: function (x) { return fmt(x.n); } },
    { q: "dino-ladder", icon: "/images/gw/icon-jurassic.webp", tk: "tk.dino", v: function (x) { return t("rk.dino", { lv: x.lv || 1, n: fmt(x.rating || 0) }); }, n: function (x) { return fmt(x.rating || 0); } },
    { q: "jur-top", icon: "/images/gw/icon-jurassic.webp", tk: "tk.jur", v: function (x) { return t("rk.poker", { n: fmt(x.n) }); }, n: function (x) { return fmt(x.n); } },
  ];
  function readBoards() {
    Promise.all(BOARDS.map(function (b) { return fetch("/api/social?world=" + b.q).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && Array.isArray(j.top) ? j.top : null; }).catch(function () { return null; }); }))
      .then(function (r) { boards = r; paintTicker(); paintRanks(); });
  }
  function paintTicker() {
    var el = $("#gw-tk"), items = [];
    if (boards) BOARDS.forEach(function (b, i) { var x = boards[i] && boards[i][0]; if (x) items.push(t(b.tk, { name: esc(nm(x)), n: b.n(x), t: mmss(x.secs) })); });
    items = items.concat(t("tk.idle") || []);
    var one = items.map(function (s) { return "<span><i>◆</i>" + s + "</span>"; }).join("");
    el.innerHTML = one + one; // twice, so the run loops without a seam (it slides by half)
    el.style.setProperty("--tkd", Math.max(30, items.length * 7) + "s");
  }
  function paintRanks() {
    var tabs = t("rk.tabs");
    $("#gw-rtabs").innerHTML = BOARDS.map(function (b, i) { return '<button type="button" role="tab" data-rk="' + i + '" class="' + (i === rk ? "on" : "") + '" aria-selected="' + (i === rk) + '"><img src="' + b.icon + '" alt="">' + esc(tabs[i]) + "</button>"; }).join("");
    var list = boards && boards[rk], ol = $("#gw-rlist");
    if (!boards) { ol.innerHTML = '<li class="none">…</li>'; return; }
    ol.innerHTML = list && list.length ? list.slice(0, 10).map(function (x, i) { return '<li style="--k:' + i + '"><b>' + esc(nm(x)) + "</b><span>" + esc(BOARDS[rk].v(x)) + "</span></li>"; }).join("") : '<li class="none">' + esc(t("rk.none")) + "</li>";
  }
  $("#gw-rtabs").addEventListener("click", function (e) { var b = e.target.closest("[data-rk]"); if (!b) return; rk = Number(b.dataset.rk); paintRanks(); });
  // the clocks: the daily reset (00:00 KST), the weekly reset (Monday 00:00 KST), the weekend 2× (Sat–Sun KST)
  var KST = 9 * 3600e3, DAY = 864e5;
  var kstDay = function () { return new Date(Date.now() + KST).getUTCDay(); };
  function weekendNow() { var d = kstDay(); return d === 0 || d === 6; }
  function untilDays(n) { var k = Date.now() + KST; return (Math.floor(k / DAY) + n) * DAY - k; } // to 00:00 KST n days on
  function dur(ms) { var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = function (v) { return String(v).padStart(2, "0"); }; return (d ? d + t("cd.d") + " " : "") + p(h) + ":" + p(m) + ":" + p(x); }
  function paintClocks() {
    var d = kstDay(), wk = weekendNow(), toMon = (8 - d) % 7 || 7, toSat = (6 - d + 7) % 7 || 7;
    var C = [[t("cd.day"), untilDays(1), false], [t("cd.week"), untilDays(toMon), false], [wk ? t("cd.wkOn") : t("cd.wkOff"), wk ? untilDays(toMon) : untilDays(toSat), wk]];
    var el = $("#gw-clocks");
    if (el.children.length !== 3) el.innerHTML = C.map(function () { return '<div class="gw-clock"><small></small><b></b></div>'; }).join("");
    C.forEach(function (c, i) { var k = el.children[i]; k.classList.toggle("hot", c[2]); k.firstChild.textContent = c[0]; k.lastChild.textContent = dur(c[1]); });
  }
  setInterval(function () { if (!document.hidden) paintClocks(); }, 1000);

  // ---------------- the 3D hero (gw-hero3d.js: the game's own models; loaded only when it's wanted) ----------------
  var TINT_C = ["#e6f0ff", "#2ee0b0", "#ff6fb5", "#ffc23a", "#9b6bff", "#ff5a5a", "#ff9a3a", "#5ad65a"]; // world-kit.js HERO_TINTS (0 = the hero's own)
  var savedId = saved && String(saved.char || "").replace(/^custom-/, ""), vHero = HEROES.some(function (h) { return h.id === savedId; }) ? savedId : "aron", vTint = saved ? saved.tint || 0 : 0, viewer = null, vBusy = false;
  function paintViewer() {
    $("#gw-v-heroes").innerHTML = HEROES.map(function (h) { return '<button type="button" data-vh="' + h.id + '" style="--c:' + h.c + '" class="' + (h.id === vHero ? "on" : "") + '">' + esc(D().heroes[h.id][0]) + "</button>"; }).join("");
    $("#gw-v-tints").innerHTML = TINT_C.map(function (c, i) { return '<button type="button" data-vt="' + i + '" style="--t:' + c + '" class="' + (i === vTint ? "on" : "") + '" aria-label="' + (i + 1) + '"></button>'; }).join("");
  }
  function vMsg(s) { var m = $(".gw-v-msg"); m.hidden = !s; m.textContent = s || ""; }
  function loadViewer() {
    if (viewer || vBusy) return; vBusy = true; $(".gw-v-load").hidden = true; vMsg(t("v.loading"));
    import("/gw-hero3d.js?v=" + VER).then(function (m) { return m.mount($(".gw-v-cv"), { ver: "?v=" + VER }); }).then(function (v) { viewer = v; window.__gwHero = v; return v.show(vHero, vTint); }).then(function () { vMsg(""); vBusy = false; diag("viewer"); })
      .catch(function (e) { console.warn("3D hero:", e); vBusy = false; if (viewer) { try { viewer.dispose(); } catch (x) { /* gone */ } viewer = null; } vMsg(t("v.fail")); });
  }
  $(".gw-v-load").addEventListener("click", loadViewer);
  // on a PC it loads itself once it's on screen; on a phone it waits for a tap (it's a few MB)
  if (dev === "pc" && "IntersectionObserver" in window) { var vo = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { vo.disconnect(); loadViewer(); } }, { rootMargin: "300px" }); vo.observe($("#gw-viewer")); }
  $("#gw-viewer").addEventListener("click", function (e) {
    var h = e.target.closest("[data-vh]"), c = e.target.closest("[data-vt]");
    if (h) { vHero = h.dataset.vh; paintViewer(); if (viewer) viewer.show(vHero, vTint).catch(function () { vMsg(t("v.fail")); }); else loadViewer(); }
    if (c) { vTint = Number(c.dataset.vt); paintViewer(); if (viewer) viewer.tint(vTint); }
    if (e.target.closest('[data-v="wave"]')) { if (viewer) viewer.wave(); else loadViewer(); }
  });

  // ---------------- details: a game's or a story's sheet (#game-<id>, #news-<n> open it) ----------------
  var sheet = $("#gw-sheet"), sheetBody = $("#gw-sheet-body"), lastFocus = null;
  function openSheet(html) { lastFocus = document.activeElement; sheetBody.innerHTML = html; sheet.hidden = false; document.body.style.overflow = "hidden"; $(".gw-sheet-card").scrollTop = 0; try { $(".gw-sheet-x").focus({ preventScroll: true }); } catch (e) { /* fine */ } }
  function closeSheet() { if (sheet.hidden) return; sheet.hidden = true; document.body.style.overflow = ""; if (/^#(game|news)-/.test(location.hash)) try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* fine */ } if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
  function gameSheet(id) {
    var g = GAMES.filter(function (x) { return x.id === id; })[0]; if (!g) return false; var x = D().games[id], tips = (t("tips") || {})[id] || [];
    var gal = [gArt(g), "/images/games/" + g.img + ".webp"].filter(function (s, i, a) { return a.indexOf(s) === i; });
    openSheet('<div class="gw-sheet-hero"><img src="' + gArt(g) + '" alt=""></div><div class="gw-sheet-in" style="--gc:' + g.c + '"><span class="gw-badge" style="background:linear-gradient(135deg,#fff,' + g.c + ');justify-self:start">' + esc(x[1]) + "</span><h3>" + esc(x[0]) + "</h3><p>" + esc(x[2]) + "</p>" + (x[3].length ? "<ul>" + x[3].map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + (tips.length ? "<h4>" + esc(t("gd.tips")) + "</h4><ul>" + tips.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + "<h4>" + esc(t("gd.pay")) + "</h4><p>💠 " + esc(x[4]) + '</p><div class="gw-sheet-gal">' + gal.map(function (s) { return '<img src="' + s + '" alt="" loading="lazy">'; }).join("") + '</div><div class="gw-sheet-acts"><a class="gw-btn gw-btn-play gw-btn-lg" href="/play" data-at="detail">' + esc(t("playG", { g: x[0] })) + "</a></div></div>");
    diag("detail", "game"); return true;
  }
  function newsSheet(i) {
    var n = D().news[i], m = NEWS[i]; if (!n || !m) return false; var body = (t("nbody") || [])[i] || n[2];
    openSheet('<div class="gw-sheet-hero"><img src="' + m.img + '" alt=""></div><div class="gw-sheet-in"><span class="gw-meta">' + esc(n[0]) + "<span>" + esc(m.d.replace(/-/g, ". ")) + "</span></span><h3>" + esc(n[1]) + "</h3><p>" + esc(body) + '</p><div class="gw-sheet-acts"><a class="gw-btn gw-btn-play gw-btn-lg" href="/play" data-at="news">' + esc(t("play")) + '</a><button type="button" class="gw-btn gw-btn-ghost gw-btn-lg" data-share="' + i + '">' + esc(t("nd.share")) + "</button></div></div>");
    diag("detail", "news"); return true;
  }
  function route() { var h = location.hash, m = /^#game-(\w+)$/.exec(h), n = /^#news-(\d)$/.exec(h); if (m) return gameSheet(m[1]); if (n) return newsSheet(Number(n[1])); closeSheet(); return false; }
  addEventListener("hashchange", route);
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-game]"), n = e.target.closest("[data-news]"), s = e.target.closest("[data-share]");
    if (g) { e.preventDefault(); try { history.replaceState(null, "", "#game-" + g.dataset.game); } catch (x) { /* fine */ } gameSheet(g.dataset.game); }
    else if (n) { e.preventDefault(); try { history.replaceState(null, "", "#news-" + n.dataset.news); } catch (x) { /* fine */ } newsSheet(Number(n.dataset.news)); }
    else if (s) { var url = location.origin + "/game#news-" + s.dataset.share, title = D().news[Number(s.dataset.share)][1];
      if (navigator.share) navigator.share({ title: title, url: url }).catch(function () { /* closed */ });
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { s.textContent = t("nd.copied"); }).catch(function () { /* fine */ }); }
    else if (e.target.closest("[data-close]")) closeSheet();
  });

  // ---------------- invite: your link, made by the game's own invite code (api/_world-refer.mjs) ----------------
  var invBtn = $("#gw-inv-btn"), invMsg = $("#gw-inv-msg"), invOut = $("#gw-inv-out");
  var sess = function () { try { var s = JSON.parse(localStorage.getItem("arc.world.sess") || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch (e) { return null; } };
  invBtn.addEventListener("click", function () {
    var s = sess(); invMsg.textContent = ""; if (!s) { invMsg.textContent = t("inv.signin"); return; }
    invBtn.disabled = true; var ep = (window.arcWorldLock && window.arcWorldLock.epoch) || 1, b = { action: "world-refer-code", ep: ep };
    Object.keys(s).forEach(function (k) { b[k] = s[k]; });
    fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        invBtn.disabled = false; if (!j || !/^[0-9a-z]{8}$/.test(j.code || "")) { invMsg.textContent = t("inv.err"); return; }
        var link = location.origin + "/play?ref=" + j.code; invOut.hidden = false; invOut.innerHTML = "<code>" + esc(link) + '</code><button type="button">' + esc(t("inv.copy")) + "</button>";
        $("button", invOut).onclick = function () { var bt = this; if (navigator.share && coarse) { navigator.share({ title: "ARCIRCLE WORLD", text: t("inv.text"), url: link }).catch(function () { /* closed */ }); return; } (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { bt.textContent = t("inv.copied"); }).catch(function () { /* select it by hand */ }); };
        diag("invite");
      }).catch(function () { invBtn.disabled = false; invMsg.textContent = t("inv.err"); });
  });

  // ---------------- motion: reveal on scroll, the tilt of the hero cards, the carousel ----------------
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px" }) : null;
  function reveal() { $$(".gw-rv:not(.in)").forEach(function (el) { if (io && !reduce) io.observe(el); else el.classList.add("in"); }); }
  $$(".gw-h2, .gw-kicker, .gw-lead, .gw-gpanel, .gw-controls, .gw-plan, .gw-cta-in, .gw-viewer, .gw-inv, .gw-trailer").forEach(function (el) { el.classList.add("gw-rv"); });
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
  // coins float up over the goals the first time they come into view
  if (!reduce && "IntersectionObserver" in window) { var co = new IntersectionObserver(function (es) { if (!es[0].isIntersecting) return; co.disconnect(); var box = $("#gw-kpis"); box.style.position = "relative";
    for (var i = 0; i < 14; i++) (function (i) { setTimeout(function () { var c = document.createElement("i"); c.className = "gw-coinfx"; c.style.left = (5 + Math.random() * 90) + "%"; c.style.top = (40 + Math.random() * 55) + "%"; box.appendChild(c); setTimeout(function () { c.remove(); }, 2300); }, i * 110); })(i); }, { threshold: 0.3 }); co.observe($("#gw-kpis")); }
  // the cursor's glow (a mouse only)
  if (!reduce && !coarse) { var cur = $(".gw-cursor"); addEventListener("pointermove", function (e) { if (e.pointerType !== "mouse") return; cur.classList.add("on"); cur.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, { passive: true }); document.addEventListener("pointerleave", function () { cur.classList.remove("on"); }); }

  // ---------------- the top bar, the phone menu, the language menu, the PLAY bar, parallax ----------------
  var nav = $("#gw-nav"), drawer = $("#gw-drawer"), burger = $(".gw-burger"), sticky = $("#gw-sticky"), heroSec = $(".gw-hero"), heroIn = $(".gw-hero-in"), ctaSec = $(".gw-cta");
  sticky.hidden = false;
  function onScroll() { var y = scrollY, h = document.documentElement.scrollHeight - innerHeight; nav.classList.toggle("solid", y > 40); nav.style.setProperty("--p", (h > 0 ? (y / h) * 100 : 0) + "%");
    var hb = heroSec.getBoundingClientRect().bottom, cr = ctaSec.getBoundingClientRect(); sticky.classList.toggle("on", hb < 120 && !(cr.top < innerHeight && cr.bottom > 0));
    if (reduce) return;
    if (hb > 0) { heroIn.style.transform = "translateY(" + (y * 0.22).toFixed(1) + "px)"; heroIn.style.opacity = String(Math.max(0, 1 - y / (innerHeight * 0.85))); }
    var ban = $(".gw-banner img"); if (ban) { var r = ban.parentNode.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) ban.style.transform = "scale(1.08) translateY(" + ((r.top / innerHeight) * 30).toFixed(1) + "px)"; } }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  function menu(open) { drawer.hidden = !open; burger.setAttribute("aria-expanded", String(open)); document.body.style.overflow = open ? "hidden" : ""; nav.classList.toggle("solid", open || scrollY > 40); }
  burger.addEventListener("click", function () { menu(drawer.hidden); });
  drawer.addEventListener("click", function (e) { if (e.target.closest("a")) menu(false); });
  var globe = $(".gw-globe"), lm = $(".gw-lang-menu");
  function setLang(l) { if (!LANGS[l] || l === lang) return; lang = l; try { localStorage.setItem(KEY, lang); } catch (x) { /* this visit only */ } paint(); paintStats(); diag("lang", l); }
  globe.addEventListener("click", function (e) { e.stopPropagation(); lm.hidden = !lm.hidden; globe.setAttribute("aria-expanded", String(!lm.hidden)); });
  lm.addEventListener("click", function (e) { var b = e.target.closest("button[data-lang]"); if (!b) return; lm.hidden = true; setLang(b.dataset.lang); });
  $(".gw-foot-lang").addEventListener("click", function (e) { var b = e.target.closest("button[data-lang]"); if (b) setLang(b.dataset.lang); });
  document.addEventListener("click", function () { lm.hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { lm.hidden = true; if (!drawer.hidden) menu(false); closeSheet(); } });
  $("#gw-gtabs").addEventListener("click", function (e) { var b = e.target.closest("[data-g]"); if (!b) return; gi = Number(b.dataset.g); paintGame(true); });
  // the game picker turns by itself until you pick one, and by swipe on the art
  var auto = setInterval(function () { if (document.hidden || !sheet.hidden) return; var p = $("#gw-gpanel"), r = p.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; gi = (gi + 1) % GAMES.length; paintGame(true); }, 6000);
  $("#gw-gtabs").addEventListener("pointerdown", function () { clearInterval(auto); }, { once: true });
  var sx = null; $("#gw-gpanel").addEventListener("pointerdown", function (e) { sx = e.clientX; clearInterval(auto); });
  $("#gw-gpanel").addEventListener("pointerup", function (e) { if (sx == null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) { gi = (gi + (dx < 0 ? 1 : GAMES.length - 1)) % GAMES.length; paintGame(true); } });

  // ---------------- PLAY: counted by where it was pressed, then the ring opens into the game ----------------
  var dive = $("#gw-dive");
  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href="/play"]'); if (!a || e.defaultPrevented) return;
    diag("play", a.dataset.at || "");
    if (reduce || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault(); dive.hidden = false; setTimeout(function () { location.href = "/play"; }, 600);
  });
  addEventListener("pageshow", function () { dive.hidden = true; });

  // ---------------- the trailer (portrait on a phone), its sound ----------------
  var saveData = navigator.connection && navigator.connection.saveData;
  function startVideo(v, eager) {
    if (!v) return; v.poster = phone ? "/images/gw/hero-poster-9x16.webp" : "/images/gw/hero-poster.webp";
    if (saveData || reduce) return;
    var src = phone ? "/images/gw/hero-9x16.mp4" : "/images/gw/hero-720.mp4";
    var go = function () { if (v.dataset.on) return; v.dataset.on = "1"; v.src = src; v.play().catch(function () { /* the poster stays */ }); };
    if (eager) go(); else if ("IntersectionObserver" in window) { var o = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { go(); o.disconnect(); } }, { rootMargin: "200px" }); o.observe(v); } else go();
  }
  var heroV = $(".gw-hero .gw-video"), sndB = $(".gw-sound");
  startVideo(heroV, true); startVideo($(".gw-cta-video"), false);
  function soundLabel() { var on = !heroV.muted; sndB.setAttribute("aria-pressed", String(on)); $("span", sndB).textContent = t(on ? "sound.off" : "sound.on"); }
  sndB.addEventListener("click", function () {
    if (!heroV.dataset.on) { heroV.dataset.on = "1"; heroV.src = phone ? "/images/gw/hero-9x16.mp4" : "/images/gw/hero-720.mp4"; }
    heroV.muted = !heroV.muted; heroV.play().catch(function () { heroV.muted = true; soundLabel(); }); soundLabel(); if (!heroV.muted) diag("sound");
  });
  document.addEventListener("visibilitychange", function () { $$(".gw-video[data-on]").forEach(function (v) { if (document.hidden) v.pause(); else v.play().catch(function () { /* fine */ }); }); });

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

  // ---------------- the first second: the ∞ comes in (once a visit, not with reduced motion or a deep link) ----------------
  (function intro() {
    var el = $("#gw-intro"), seen = false; try { seen = !!sessionStorage.getItem("arc.gw.intro"); sessionStorage.setItem("arc.gw.intro", "1"); } catch (e) { seen = true; }
    if (seen || reduce || location.hash) return;
    el.hidden = false; var done = function () { el.hidden = true; }; el.addEventListener("click", done); setTimeout(done, 2150);
  })();

  // ---------------- the $ARCIRCLE contract address in the footer: copy it ----------------
  $("#gw-ca-copy").addEventListener("click", function () { var b = this, a = $("#gw-ca").textContent.trim(); (navigator.clipboard ? navigator.clipboard.writeText(a) : Promise.reject()).then(function () { b.textContent = t("ca.copied"); setTimeout(function () { b.textContent = t("ca.copy"); }, 1600); }).catch(function () { var r = document.createRange(); r.selectNodeContents($("#gw-ca")); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }); });

  // ---------------- add to home screen ----------------
  var installEv = null, instB = $("#gw-install");
  addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEv = e; instB.hidden = false; });
  instB.addEventListener("click", function () { if (!installEv) return; installEv.prompt(); installEv.userChoice.finally(function () { installEv = null; instB.hidden = true; }); });

  // ---------------- who's in the world (the gate's numbers), and whether the servers answer ----------------
  var up = null;
  function paintStatus() { var el = $("#gw-status"); el.classList.toggle("ok", up === true); el.classList.toggle("down", up === false); $("b", el).textContent = t(up === true ? "st.ok" : up === false ? "st.down" : "st.wait"); }
  function countUp(el, to) { if (!el) return; var from = Number(el.dataset.v || 0); el.dataset.v = to; if (from !== to && !reduce) { el.classList.remove("gw-tick"); void el.offsetWidth; el.classList.add("gw-tick"); } if (reduce || from === to) { el.textContent = fmt(to); return; } var t0 = performance.now(), d = 1100; (function f(n) { var k = Math.min(1, (n - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(f); })(t0); }
  function paintStats() {
    if (!stats) return;
    // "1 playing now" is only you — the chip shows from two
    $(".gw-chip-on").hidden = !(stats.online >= 2); $(".gw-chip-vis").hidden = !(stats.visitors > 0);
    countUp($('[data-count="online"]'), stats.online || 0); countUp($('[data-count="visitors"]'), stats.visitors || 0); paintKpis();
  }
  function readStats(first) {
    var vid = ""; try { vid = localStorage.getItem("arc.world.vid") || ""; if (!/^[a-z0-9]{20}$/.test(vid)) { vid = Array.from(crypto.getRandomValues(new Uint8Array(20)), function (b) { return "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]; }).join(""); localStorage.setItem("arc.world.vid", vid); } } catch (e) { vid = ""; }
    // opening the site counts as a visit (at most once per 10 minutes a browser, api/_world.mjs), like the gate
    var req = first && vid ? fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "world-ping", id: vid, visit: true, gate: true }) }).then(function (r) { return r.ok ? r : fetch("/api/social?world=stats"); }) : fetch("/api/social?world=stats");
    req.then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { up = !!(j && j.visitors != null); if (up) { stats = j; paintStats(); } paintStatus(); }).catch(function () { up = false; paintStatus(); });
  }
  paint(); route(); readStats(true); readBoards(); diag("visit");
  setInterval(function () { if (!document.hidden) readStats(false); }, 30000);
  setInterval(function () { if (!document.hidden) readBoards(); }, 120000);
})();
