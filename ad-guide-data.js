// ad-guide-data.js — the player's guide to AGENT DIMENSION and ARCIRCLE STUDIO BETA (Creator City; it replaced the Studio
// Lite guide on 2026-10-26, the owner: /game shows only the Studio Beta guide now) (the owner asked for it on 2026-10-24:
// "쉽게, 특히 스튜디오 라이트"). One copy for both places that show it: the game's guide window (world-adguide.js loads this
// file) and /game's guide section (gw.js). Keep it true to the game: limits here are the servers' constants
// (api/_world-agent.mjs AGENT, api/_world-agarena.mjs ARENA, api/_world-studio.mjs STUDIO, world-studio-gen.js KNOBS / PRESETS).
// Each guide: { title, lead, parts: [{ icon, h, p?, steps?: [[icon, title, text]], tips?: [text] }] }
window.ARC_AD_GUIDE = {
  en: {
    tabs: { ad: "AGENT DIMENSION", beta: "Studio Beta" }, title: "How to use", open: "Open", close: "Close", more: "More",
    ad: {
      title: "AGENT DIMENSION — the guide",
      lead: "Your own AI agent: it walks with you, talks with you, runs errands and plays in the Agent Arena. Here's everything in a few minutes.",
      parts: [
        { icon: "🧭", h: "1. Getting there", steps: [
          ["🏛️", "The Citadel", "Walk to the tall Nexus Infinity Citadel east of the plaza (follow the beam and the 🤖 mark on the minimap) and step through its door."],
          ["🚀", "The shortcut", "Tap \"Go to the AD Tower\" on the launch card, or Menu → AI Agent."],
          ["🌆", "Nexus City", "The door warps you into Nexus City. Anyone can look round, even without a wallet."] ] },
        { icon: "✨", h: "2. Get your agent (Genesis Lab)", steps: [
          ["🤖", "Pick one", "AURORA (gathering), ORION (mining) or VEX (scouting). Each is best at one errand."],
          ["🪪", "ID and name", "Choose a unique ID (3–16 letters, numbers or _) and a name. The ID is checked before you pay."],
          ["💬", "Personality", "Write a few words, or tap a ready one. Your agent talks this way."],
          ["🪙", "Pay and be born", "Launch price 100,000 $ARCIRCLE (list 200,000, 50% off until Oct 31). Confirm in your wallet, wait a moment for Arc, and watch it be born with its number."] ],
          tips: ["50% of every payment is burned and 50% goes to the ARCIRCLE treasury.", "Closed the tab after paying? Open the Genesis Lab again: the same payment is used — you never pay twice.", "Your agent can't move your funds. Anything on-chain always asks your own wallet first."] },
        { icon: "💬", h: "3. Your agent's window", steps: [
          ["💬", "Talk", "Chat with it (20 messages a day). It remembers its last errands — ask it to go gather, mine or scout and it offers a confirm card."],
          ["📋", "Errands", "Gather (1 h, 60 ARCL), Mine (2 h, 120 ARCL), Scout (2 h, 100 ARCL), up to 6 a day. Loot flies into your bag when it's back."],
          ["🗂️", "Job board", "Line up to 4 errands: the next one starts by itself when a slot frees, even while you're away. A second slot opens at agent level 5."],
          ["🤖", "Agent", "Your agent's card to share, its level, and the week's busiest agents."],
          ["💼", "Vault", "A trading vault on Arc for your own wallet — being prepared, not open yet."] ] },
        { icon: "🏙️", h: "4. Nexus City", steps: [
          ["🧬", "Genesis Lab", "Make or meet your agent."],
          ["🛰️", "Errand Port", "Send errands and watch the job board. Working agents are seen at the Bio Garden, Ore Refinery and Scout Deck."],
          ["🏦", "Vault Tower", "The vault (coming soon)."],
          ["🏟️", "Agent Arena", "Quiz duels with your agent (below)."],
          ["🎮", "ARCIRCLE Studio", "Make your own games — the Studio is in Creator City now (the Studio by the fountain): see the Studio Beta guide."],
          ["📚", "Agent Academy", "Lessons, coming soon."] ] },
        { icon: "🏟️", h: "5. Agent Arena", steps: [
          ["❓", "How it works", "7 questions, 15 seconds each. Fast and right scores the most."],
          ["🤖", "Your agent's help", "Once a run, your agent takes away one wrong answer (50 : 50)."],
          ["⏰", "Arena hour", "Points count double at 12:00 and 21:00 Seoul time (one hour each)."],
          ["🏆", "The board", "3 runs a day; a perfect run gets +200. The week's sharpest agents are on the board. No ARCL here — it's for the glory."] ],
          tips: ["You need an agent for the Arena and errands. Walking round the city and the Studio don't need one."] },
      ],
    },
    beta: {
      title: "ARCIRCLE STUDIO BETA — the guide",
      lead: "Make your own game with no code, publish it, and let the whole world play it — in Creator City, the makers' own land. Here's everything, step by step.",
      parts: [
        { icon: "🚪", h: "1. Getting to Creator City", steps: [
          ["🏛️", "The Studio by the fountain", "Walk to the ARCIRCLE STUDIO building on the plaza, between the portals, facing the fountain, and step through its door. It's a portal to Creator City."],
          ["🕹️", "The shortcut", "Tap 🕹️ in the top bar, or open the Map: Creator City is listed first, with all 8 of its buildings."],
          ["📱", "On a phone: sideways", "Creator City and the Studio are made for a phone held sideways. Held upright you'll see a card: tap \"Turn sideways\" (it goes full screen), or \"Back to Game World\"."],
          ["↩️", "The way back", "Tap \"Back to Game World\" at the top left, or walk through the portal behind the plaza. You land at the Studio's door in the town."] ] },
        { icon: "🏙️", h: "2. Creator City at a glance", steps: [
          ["🏆", "Hall of Fame", "In the middle of the plaza: the games players love most right now."],
          ["🎓", "Creator Academy", "Your first game in 5 steps, and 6 creator quests. Start here."],
          ["🗼", "Studio Tower", "Opens the Studio, where you make and edit your games. In the city the 🕹️ button opens it too."],
          ["🕹️", "Game Arcade + game portals", "Six glowing portals in front of the arcade hold the most played and liked games: walk in and you're playing."],
          ["⚔️", "Contest Arena", "The weekly creator contest: this week's template, the board and the prize."],
          ["🏭", "Asset Factory", "What your creator level unlocks. The Market and the Launch Portal are coming soon."] ],
          tips: ["The mentor, the builder and the gamer in the city have tips: walk up to them.", "Walk up to a building's door to open it."] },
        { icon: "⭐", h: "3. The creator tutorial (7 steps)", steps: [
          ["👀", "Visit", "Step into Creator City. The quest card on the left turns into the Creator tutorial."],
          ["📄", "Pick a template", "Follow the gold arrow to the Studio Tower. In the Studio the button for the step glows, with a line beside it."],
          ["🎚️", "Tune it", "Change the difficulty, the length or a slider."],
          ["▶️", "Test it", "Play your game once."],
          ["🚀", "Publish it", "Put it on the Creator Arcade."],
          ["🔗", "Share it", "Copy its link or make its share card."],
          ["🎮", "Play someone's game", "Walk into a game portal, or rate a game after a run."] ],
          tips: ["Each step gives 40–80 XP, the last one +300 XP and the title Rookie Creator."] },
        { icon: "🛠️", h: "4. Make a game in 3 steps", steps: [
          ["1️⃣", "Pick", "Choose a template and a theme (Neon City, Jungle, Ice Peaks, Lava Core, Candy Sky…). Give it a title. Short on ideas? Type one sentence and your agent drafts the whole game (10 a day)."],
          ["2️⃣", "Tune", "Easy, Normal, Hard or Extreme, the length, and every slider. The stars and the test bots' clear rate change as you go. You can also tell your agent what to change: \"more coins, slower lasers\"."],
          ["3️⃣", "Test & publish", "▶ Test play it yourself (test runs aren't counted), then 💾 Save (12 games kept) and 🚀 Publish to the Creator Arcade."] ],
          tips: ["If the bots can hardly clear it, the Studio asks if it's too hard before you publish.", "Every save keeps the last 5 versions: open an old one from 📁 My games."] },
        { icon: "🎮", h: "5. The templates", steps: [
          ["🏃", "Runs", "Sky Runner (to the finish), Infinity Dash (no finish, faster and faster), Sky Climb (bounce upward), Hover Race (rings in order, laps)."],
          ["🧱", "JUMP WORLD", "A platformer on a grid: blocks, moving platforms, keys and doors, switches, checkpoints, cannons, foes and a dragon boss. Its modes: Dungeon, Escape Room (against the clock), Boss Battle and Mine Rush (dig for ores)."],
          ["⚔️", "Fights", "Arena Survival (drones and laser sweeps), Coin Rush (grab coins), Monster Survival (the Survivors engine: waves, elites, a boss), Tower Defense (Bolt, Frost and Cannon towers)."],
          ["🧩", "Puzzle and rhythm", "Ring Puzzle (pick a board from six) and Beat Maker (4 lanes, Perfect and Good)."] ],
          tips: ["@arcircle's 15 official games show each template at its best: play them first in the arcade's \"Start here\" row."] },
        { icon: "🧰", h: "6. Build it yourself", steps: [
          ["🧱", "Pieces", "Every template has a builder: place walls, gaps, lasers, coins, hearts, ledges, springs, drones, pillars, path cells or notes where you want them. Jump World adds 10 ready-made pieces."],
          ["✂️", "Edit", "Select, copy, paste, undo and redo. Test from the spot you're editing."],
          ["❌", "The red ✕", "A red ✕ marks a piece the server would drop (no free lane, no time to react, a gap you can't jump). Move it and the ✕ goes."],
          ["🃏", "Rule cards", "Up to 2 for a run: low gravity, mirror, night, one heart, speed-up."] ] },
        { icon: "🌐", h: "7. Your games on the web", steps: [
          ["🆔", "Your creator ID", "In 📁 My games, pick an ID (3–20 letters: a–z, 0–9, _). You can change it 3 times; old links keep working."],
          ["🔗", "Your pages", "arcircle.app/game/@yourID shows all your games, and each game has its own page from its title — /game/@yourID/neon-run. Anyone can play it there, right in the browser."],
          ["🖼️", "Share cards", "Each game makes a picture card for X and chats, with its art and your best run."] ] },
        { icon: "🏆", h: "8. Play, rate and compete", steps: [
          ["🔎", "The Creator Arcade", "Search, sort (popular, newest, most liked) and filter by template. Editor's picks come first."],
          ["👍", "Rate", "After a run in someone else's game: fun or not, and easy, right or hard. Once a wallet; the maker sees it in their stats."],
          ["🔁", "Remix", "Make your own version of a game you like; it shows where it came from."],
          ["⚔️", "The weekly contest", "One template a week. Others' plays and likes (×5) count. When the team sets a USDC prize for the top 3, it's shown on the contest card and paid on Arc."] ] },
        { icon: "💡", h: "9. Tips for a game people love", tips: [
          "Start on Normal, play it twice, then change one slider at a time.",
          "A clear rate of about 40–70 % feels fair: hard enough to want one more go.",
          "Your stats show where runs end — fix that spot first.",
          "Give it a title that says what it is: \"Lava Run\", \"Ice Maze 3\".",
          "Share your page and challenge friends: plays and likes lift your game in the arcade.",
          "It's a beta: games don't pay ARCL yet; plays, likes and best runs are counted from day one." ] },
      ],
    },
  },
  ko: {
    tabs: { ad: "AGENT DIMENSION", beta: "스튜디오 베타" }, title: "사용 방법", open: "열기", close: "닫기", more: "더 보기",
    ad: {
      title: "AGENT DIMENSION 사용 설명서",
      lead: "나만의 AI 에이전트: 함께 걷고, 대화하고, 심부름을 하고, 에이전트 아레나에서 겨뤄요. 몇 분이면 다 알 수 있어요.",
      parts: [
        { icon: "🧭", h: "1. 가는 방법", steps: [
          ["🏛️", "시타델", "광장 동쪽의 높은 넥서스 인피니티 시타델로 걸어가 문으로 들어가세요 (빛기둥과 미니맵의 🤖 표시를 따라가요)."],
          ["🚀", "바로가기", "출시 카드의 \"AD 타워로 가기\"를 누르거나 메뉴 → AI 에이전트."],
          ["🌆", "넥서스 시티", "문을 지나면 넥서스 시티로 워프해요. 지갑이 없어도 누구나 구경할 수 있어요."] ] },
        { icon: "✨", h: "2. 에이전트 만들기 (제네시스 랩)", steps: [
          ["🤖", "고르기", "AURORA(채집), ORION(채광), VEX(정찰) 중 하나. 각자 잘하는 심부름이 있어요."],
          ["🪪", "ID와 이름", "고유 ID(영문·숫자·_ 3~16자)와 이름을 정해요. ID는 결제 전에 확인해요."],
          ["💬", "성격", "몇 마디로 쓰거나 준비된 성격을 눌러요. 에이전트가 그 말투로 말해요."],
          ["🪙", "결제하고 탄생", "출시가 100,000 $ARCIRCLE (정가 200,000, 10월 31일까지 50% 할인). 지갑에서 승인하고 Arc 확인을 잠시 기다리면 번호와 함께 탄생해요."] ],
          tips: ["결제액의 50%는 소각되고 50%는 ARCIRCLE 트레저리로 가요.", "결제 후 창을 닫았나요? 제네시스 랩을 다시 열면 같은 결제가 쓰여요 — 두 번 내지 않아요.", "에이전트는 내 자산을 옮길 수 없어요. 온체인 작업은 항상 내 지갑이 먼저 물어봐요."] },
        { icon: "💬", h: "3. 에이전트 창", steps: [
          ["💬", "대화", "하루 20번 대화해요. 최근 심부름을 기억하고, 채집·채광·정찰을 부탁하면 확인 카드를 띄워요."],
          ["📋", "심부름", "채집(1시간, 60 ARCL), 채광(2시간, 120 ARCL), 정찰(2시간, 100 ARCL), 하루 6번까지. 돌아오면 전리품이 가방으로 날아와요."],
          ["🗂️", "잡 보드", "심부름을 4개까지 예약해요. 자리가 비면 다음 심부름이 자동으로 시작돼요 — 내가 없을 때도요. 에이전트 레벨 5에 두 번째 자리가 열려요."],
          ["🤖", "에이전트", "공유 카드, 레벨, 이번 주 가장 바쁜 에이전트."],
          ["💼", "볼트", "내 지갑용 Arc 트레이딩 볼트 — 준비 중이라 아직 열리지 않았어요."] ] },
        { icon: "🏙️", h: "4. 넥서스 시티", steps: [
          ["🧬", "제네시스 랩", "에이전트를 만들거나 만나요."],
          ["🛰️", "심부름 포트", "심부름을 보내고 잡 보드를 봐요. 일하는 에이전트는 바이오 가든·광석 정제소·정찰 데크에서 보여요."],
          ["🏦", "볼트 타워", "볼트 (준비 중)."],
          ["🏟️", "에이전트 아레나", "에이전트와 함께하는 퀴즈 대결 (아래)."],
          ["🎮", "ARCIRCLE 스튜디오", "나만의 게임 만들기 — 스튜디오는 이제 크리에이터 시티에 있어요(분수대 옆 스튜디오): 스튜디오 베타 가이드를 보세요."],
          ["📚", "에이전트 아카데미", "수업, 준비 중."] ] },
        { icon: "🏟️", h: "5. 에이전트 아레나", steps: [
          ["❓", "방법", "7문제, 문제당 15초. 빠르고 정확할수록 점수가 높아요."],
          ["🤖", "에이전트 도움", "한 판에 한 번, 에이전트가 오답 하나를 지워 줘요 (50 : 50)."],
          ["⏰", "아레나 아워", "서울 시간 12:00과 21:00 (각 1시간)에는 점수 2배."],
          ["🏆", "순위", "하루 3판, 만점이면 +200. 이번 주 순위에 올라요. ARCL 보상은 없어요 — 명예를 위한 대결이에요."] ],
          tips: ["아레나와 심부름에는 에이전트가 필요해요. 도시 구경과 스튜디오는 없어도 돼요."] },
      ],
    },
    beta: {
      title: "ARCIRCLE STUDIO BETA — 가이드",
      lead: "코드 없이 나만의 게임을 만들고, 공개하고, 전 세계가 플레이하게 하세요. 제작자들의 땅, 크리에이터 시티에서. 처음부터 끝까지 차근차근 알려드릴게요.",
      parts: [
        { icon: "🚪", h: "1. 크리에이터 시티 가는 법", steps: [
          ["🏛️", "분수대 옆 스튜디오", "광장의 포털들 사이, 분수대를 바라보는 ARCIRCLE STUDIO 건물로 걸어가 문으로 들어가세요. 크리에이터 시티로 가는 포털이에요."],
          ["🕹️", "바로 가기", "위쪽 바의 🕹️를 누르거나 지도를 여세요. 크리에이터 시티가 맨 위에, 건물 8개와 함께 나와요."],
          ["📱", "휴대폰은 가로로", "크리에이터 시티와 스튜디오는 휴대폰을 가로로 들고 하도록 만들었어요. 세로로 들면 카드가 떠요. \"가로로 돌리기\"(전체 화면) 또는 \"게임월드로 돌아가기\"를 누르세요."],
          ["↩️", "돌아가기", "왼쪽 위 \"게임월드로 돌아가기\"를 누르거나 광장 뒤 포털로 걸어가세요. 마을의 스튜디오 문 앞에 도착해요."] ] },
        { icon: "🏙️", h: "2. 크리에이터 시티 한눈에", steps: [
          ["🏆", "명예의 전당", "광장 한가운데: 지금 가장 사랑받는 게임들."],
          ["🎓", "크리에이터 아카데미", "5단계로 만드는 첫 게임과 6가지 제작자 퀘스트. 여기서 시작하세요."],
          ["🗼", "스튜디오 타워", "게임을 만들고 고치는 스튜디오가 열려요. 시티 안에서는 🕹️ 버튼으로도 열려요."],
          ["🕹️", "게임 아케이드 + 게임 포털", "아케이드 앞 빛나는 포털 6개에 가장 많이 플레이되고 좋아요 받은 게임이 있어요. 걸어 들어가면 바로 플레이."],
          ["⚔️", "콘테스트 아레나", "주간 제작자 대회: 이번 주 템플릿, 순위, 상금."],
          ["🏭", "에셋 팩토리", "제작자 레벨로 열리는 것들. 마켓과 런치 포털은 곧 열려요."] ],
          tips: ["시티의 멘토, 빌더, 게이머에게 다가가면 팁을 알려줘요.", "건물 문 앞으로 걸어가면 그 건물이 열려요."] },
        { icon: "⭐", h: "3. 크리에이터 튜토리얼 (7단계)", steps: [
          ["👀", "방문하기", "크리에이터 시티에 들어가세요. 왼쪽 퀘스트 카드가 크리에이터 튜토리얼로 바뀌어요."],
          ["📄", "템플릿 고르기", "금색 화살표를 따라 스튜디오 타워로. 스튜디오에서는 해야 할 버튼이 빛나고 옆에 설명이 떠요."],
          ["🎚️", "다듬기", "난이도, 길이, 슬라이더 하나를 바꿔 보세요."],
          ["▶️", "테스트하기", "내 게임을 한 번 플레이하세요."],
          ["🚀", "게시하기", "크리에이터 아케이드에 올리세요."],
          ["🔗", "공유하기", "링크를 복사하거나 공유 카드를 만드세요."],
          ["🎮", "다른 사람 게임 하기", "게임 포털로 들어가거나, 플레이 후 게임을 평가하세요."] ],
          tips: ["단계마다 XP 40–80, 마지막엔 +300 XP와 칭호 '루키 크리에이터'."] },
        { icon: "🛠️", h: "4. 3단계로 게임 만들기", steps: [
          ["1️⃣", "고르기", "템플릿과 테마(네온 시티, 정글, 얼음 봉우리, 용암 코어, 캔디 스카이…)를 고르고 제목을 붙이세요. 아이디어가 없으면 한 문장만 쓰세요. 에이전트가 게임 전체를 만들어 줘요(하루 10번)."],
          ["2️⃣", "다듬기", "쉬움·보통·어려움·극한, 길이, 모든 슬라이더. 바꿀 때마다 별점과 테스트 봇의 클리어율이 바로 바뀌어요. 에이전트에게 말로 시켜도 돼요: \"코인 더 많이, 레이저 느리게\"."],
          ["3️⃣", "테스트 & 게시", "▶ 테스트 플레이로 직접 해 보고(테스트는 기록에 안 남아요), 💾 저장(게임 12개까지), 🚀 크리에이터 아케이드에 게시."] ],
          tips: ["봇이 거의 못 깨면 게시 전에 너무 어렵지 않은지 물어봐요.", "저장할 때마다 최근 5개 버전이 남아요. 📁 내 게임에서 예전 버전을 열 수 있어요."] },
        { icon: "🎮", h: "5. 템플릿", steps: [
          ["🏃", "달리기", "스카이 러너(결승선까지), 인피니티 대시(끝없이 빨라짐), 스카이 클라임(튕기며 위로), 호버 레이스(링을 순서대로, 랩)."],
          ["🧱", "JUMP WORLD", "격자 위 플랫포머: 블록, 움직이는 발판, 열쇠와 문, 스위치, 체크포인트, 대포, 적, 드래곤 보스. 모드: 던전, 방탈출(시간 제한), 보스 배틀, 마인 러시(광석 캐기)."],
          ["⚔️", "전투", "아레나 서바이벌(드론과 레이저), 코인 러시(코인 모으기), 몬스터 서바이벌(서바이버즈 엔진: 웨이브, 엘리트, 보스), 타워 디펜스(볼트·프로스트·캐논 타워)."],
          ["🧩", "퍼즐과 리듬", "링 퍼즐(6개 판 중 고르기)과 비트 메이커(4레인, 퍼펙트·굿)."] ],
          tips: ["@arcircle의 공식 게임 15개가 템플릿마다 최고의 예시예요. 아케이드의 \"여기서 시작\" 줄에서 먼저 해 보세요."] },
        { icon: "🧰", h: "6. 직접 만들기", steps: [
          ["🧱", "조각", "모든 템플릿에 빌더가 있어요. 벽, 구멍, 레이저, 코인, 하트, 발판, 스프링, 드론, 기둥, 길 칸, 노트를 원하는 곳에 놓으세요. 점프 월드에는 미리 만든 조각 10개가 더 있어요."],
          ["✂️", "편집", "선택, 복사, 붙여넣기, 되돌리기, 다시 하기. 고치는 그 자리부터 테스트할 수 있어요."],
          ["❌", "빨간 ✕", "서버가 빼버릴 조각에 빨간 ✕가 표시돼요(지나갈 길이 없음, 반응할 시간이 없음, 못 뛰는 구멍). 옮기면 ✕가 사라져요."],
          ["🃏", "규칙 카드", "한 판에 2개까지: 저중력, 좌우 반전, 밤, 하트 하나, 점점 빨라짐."] ] },
        { icon: "🌐", h: "7. 웹에 올라가는 내 게임", steps: [
          ["🆔", "제작자 ID", "📁 내 게임에서 ID를 정하세요(3–20자: a–z, 0–9, _). 3번까지 바꿀 수 있고, 예전 링크도 계속 작동해요."],
          ["🔗", "내 페이지", "arcircle.app/game/@내ID에 내 게임이 모두 나오고, 게임마다 제목으로 된 페이지가 생겨요 — /game/@내ID/neon-run. 누구나 브라우저에서 바로 플레이해요."],
          ["🖼️", "공유 카드", "게임마다 X와 채팅용 그림 카드가 만들어져요. 게임 아트와 내 최고 기록이 들어가요."] ] },
        { icon: "🏆", h: "8. 플레이, 평가, 대회", steps: [
          ["🔎", "크리에이터 아케이드", "검색, 정렬(인기·최신·좋아요), 템플릿별 필터. 에디터 추천이 맨 앞에 나와요."],
          ["👍", "평가", "다른 사람 게임을 한 판 하고 나면: 재미있었는지, 쉬움·적당·어려움. 지갑당 한 번, 제작자는 통계에서 봐요."],
          ["🔁", "리믹스", "마음에 드는 게임을 내 버전으로 만들어요. 원본이 어디인지 표시돼요."],
          ["⚔️", "주간 대회", "일주일에 템플릿 하나. 다른 사람들의 플레이와 좋아요(×5)가 점수예요. 팀이 상위 3명에게 USDC 상금을 정하면 대회 카드에 나오고 Arc에서 지급돼요."] ] },
        { icon: "💡", h: "9. 사랑받는 게임을 위한 팁", tips: [
          "보통으로 시작해서 두 번 해 보고, 슬라이더는 하나씩 바꾸세요.",
          "클리어율 40–70% 정도가 공정하게 느껴져요. 한 판 더 하고 싶을 만큼 어렵게.",
          "통계에 사람들이 어디서 끝나는지 나와요. 거기부터 고치세요.",
          "제목은 무슨 게임인지 알 수 있게: \"용암 질주\", \"얼음 미로 3\".",
          "내 페이지를 공유하고 친구에게 도전하세요. 플레이와 좋아요가 아케이드 순위를 올려요.",
          "베타라서 아직 게임으로 ARCL이 지급되지 않아요. 플레이, 좋아요, 최고 기록은 첫날부터 집계돼요." ] },
      ],
    },
  },
  zh: {
    tabs: { ad: "AGENT DIMENSION", beta: "Studio Beta" }, title: "使用方法", open: "打开", close: "关闭", more: "更多",
    ad: {
      title: "AGENT DIMENSION 使用指南",
      lead: "你自己的 AI 智能体：陪你同行、和你聊天、替你跑任务，还能在智能体竞技场比拼。几分钟就能全部了解。",
      parts: [
        { icon: "🧭", h: "1. 如何前往", steps: [
          ["🏛️", "城堡", "走到广场东边高耸的 Nexus 无限城堡，从大门进入（跟着光柱和小地图上的 🤖 标记）。"],
          ["🚀", "快捷方式", "点上线卡片上的「前往 AD 塔」，或 菜单 → AI 智能体。"],
          ["🌆", "Nexus 城", "穿过大门即传送到 Nexus 城。即使没有钱包也能随意参观。"] ] },
        { icon: "✨", h: "2. 获得智能体（创世实验室）", steps: [
          ["🤖", "挑选", "AURORA（采集）、ORION（采矿）或 VEX（侦察），各有最擅长的任务。"],
          ["🪪", "ID 和名字", "选一个唯一 ID（3–16 个字母、数字或 _）和名字。付款前会先检查 ID。"],
          ["💬", "性格", "写几个词，或点一个现成的。智能体会用这种语气说话。"],
          ["🪙", "付款并诞生", "上线价 100,000 $ARCIRCLE（原价 200,000，10 月 31 日前五折）。在钱包中确认，稍等 Arc 确认，就能看到它带着编号诞生。"] ],
          tips: ["每笔付款 50% 销毁，50% 进入 ARCIRCLE 金库。", "付款后关掉了页面？再次打开创世实验室，会使用同一笔付款——绝不会重复付款。", "智能体无法动用你的资金。任何链上操作都会先由你的钱包确认。"] },
        { icon: "💬", h: "3. 智能体窗口", steps: [
          ["💬", "聊天", "每天 20 条消息。它记得最近的任务——让它去采集、采矿或侦察，它会弹出确认卡片。"],
          ["📋", "任务", "采集（1 小时，60 ARCL）、采矿（2 小时，120 ARCL）、侦察（2 小时，100 ARCL），每天最多 6 次。回来时战利品会飞进背包。"],
          ["🗂️", "任务板", "最多排 4 个任务：有空位时下一个会自动开始，你不在也一样。智能体 5 级时开放第二个位置。"],
          ["🤖", "智能体", "分享卡片、等级、本周最忙的智能体。"],
          ["💼", "金库", "为你自己的钱包准备的 Arc 交易金库——筹备中，尚未开放。"] ] },
        { icon: "🏙️", h: "4. Nexus 城", steps: [
          ["🧬", "创世实验室", "创建或见到你的智能体。"],
          ["🛰️", "任务港", "派出任务、查看任务板。工作中的智能体会出现在生物花园、矿石精炼厂和侦察台。"],
          ["🏦", "金库塔", "金库（即将推出）。"],
          ["🏟️", "智能体竞技场", "和智能体一起答题对决（见下）。"],
          ["🎮", "ARCIRCLE Studio", "制作你自己的游戏——工作室现在在 Creator City（喷泉旁的工作室）：见 Studio Beta 指南。"],
          ["📚", "智能体学院", "课程，即将推出。"] ] },
        { icon: "🏟️", h: "5. 智能体竞技场", steps: [
          ["❓", "玩法", "7 道题，每题 15 秒。答得又快又对得分最高。"],
          ["🤖", "智能体帮忙", "每局一次，智能体帮你去掉一个错误答案（50 : 50）。"],
          ["⏰", "竞技场时段", "首尔时间 12:00 和 21:00（各一小时）得分翻倍。"],
          ["🏆", "排行榜", "每天 3 局，满分 +200。本周最强智能体上榜。这里没有 ARCL——只为荣誉。"] ],
          tips: ["竞技场和任务需要智能体。参观城市和 Studio 不需要。"] },
      ],
    },
    beta: {
      title: "ARCIRCLE STUDIO BETA — 指南",
      lead: "无需代码，制作属于你的游戏，发布出去，让全世界来玩——就在创作者的城市 Creator City。下面一步一步告诉你全部内容。",
      parts: [
        { icon: "🚪", h: "1. 前往 Creator City", steps: [
          ["🏛️", "喷泉旁的工作室", "走到广场上传送门之间、面朝喷泉的 ARCIRCLE STUDIO 建筑，穿过它的门。它就是通往 Creator City 的传送门。"],
          ["🕹️", "快捷方式", "点顶栏的 🕹️，或打开地图：Creator City 排在最前，列出全部 8 座建筑。"],
          ["📱", "手机请横屏", "Creator City 和工作室是为横握手机设计的。竖握时会出现卡片：点「切换为横屏」（进入全屏），或「返回游戏世界」。"],
          ["↩️", "返回", "点左上角「返回游戏世界」，或走进广场后方的传送门。你会回到小镇的工作室门口。"] ] },
        { icon: "🏙️", h: "2. Creator City 一览", steps: [
          ["🏆", "名人堂", "广场正中：现在最受欢迎的游戏。"],
          ["🎓", "创作者学院", "5 步做出第一款游戏，还有 6 个创作者任务。从这里开始。"],
          ["🗼", "工作室塔", "打开工作室，在这里制作和修改游戏。在城里按 🕹️ 也能打开。"],
          ["🕹️", "游戏街机厅 + 游戏传送门", "街机厅前 6 道发光的传送门里是最多人玩、最多点赞的游戏：走进去就开始玩。"],
          ["⚔️", "大赛竞技场", "每周创作者大赛：本周模板、排行榜和奖金。"],
          ["🏭", "素材工厂", "你的创作者等级能解锁的内容。市场和发射传送门即将开放。"] ],
          tips: ["城里的导师、建造师和玩家都有小提示：走近他们。", "走到建筑门口就能打开它。"] },
        { icon: "⭐", h: "3. 创作者教程（7 步）", steps: [
          ["👀", "到访", "进入 Creator City。左侧任务卡会变成创作者教程。"],
          ["📄", "选模板", "跟着金色箭头去工作室塔。在工作室里，该按的按钮会发光，旁边有一行说明。"],
          ["🎚️", "调整", "改一下难度、长度或一个滑块。"],
          ["▶️", "测试", "亲自玩一次你的游戏。"],
          ["🚀", "发布", "把它放上创作者街机厅。"],
          ["🔗", "分享", "复制链接或生成分享卡。"],
          ["🎮", "玩别人的游戏", "走进一道游戏传送门，或在玩完后给游戏评分。"] ],
          tips: ["每一步 40–80 XP，最后一步 +300 XP 和称号「新手创作者」。"] },
        { icon: "🛠️", h: "4. 三步做游戏", steps: [
          ["1️⃣", "选择", "选模板和主题（霓虹城市、丛林、冰峰、熔岩核心、糖果天空…），起个名字。没灵感？写一句话，你的代理会帮你做出整个游戏（每天 10 次）。"],
          ["2️⃣", "调整", "简单、普通、困难或极限，长度，以及每个滑块。星级和测试机器人的通关率会随之变化。也可以直接告诉代理要改什么：「多点金币，激光慢一点」。"],
          ["3️⃣", "测试并发布", "▶ 试玩一下（试玩不计入），然后 💾 保存（最多 12 款），🚀 发布到创作者街机厅。"] ],
          tips: ["如果机器人几乎通不了关，发布前工作室会问你是不是太难了。", "每次保存会保留最近 5 个版本：在 📁 我的游戏里打开旧版本。"] },
        { icon: "🎮", h: "5. 模板", steps: [
          ["🏃", "跑酷", "天空跑者（跑到终点）、无限冲刺（没有终点，越来越快）、天空攀登（弹跳向上）、悬浮竞速（按顺序穿环，多圈）。"],
          ["🧱", "JUMP WORLD", "网格平台跳跃：方块、移动平台、钥匙和门、开关、存档点、大炮、敌人和巨龙首领。模式：地牢、密室逃脱（限时）、首领战、矿洞冲刺（挖矿石）。"],
          ["⚔️", "战斗", "竞技场生存（无人机和激光扫射）、金币冲刺（抢金币）、怪物生存（幸存者引擎：波次、精英、首领）、塔防（雷电、冰霜、加农炮塔）。"],
          ["🧩", "解谜与节奏", "圆环谜题（从六个棋盘中选一个）和节拍创作（4 条轨道，完美与良好）。"] ],
          tips: ["@arcircle 的 15 款官方游戏展示了每个模板的最佳玩法：先在街机厅「从这里开始」一行玩玩看。"] },
        { icon: "🧰", h: "6. 亲手搭建", steps: [
          ["🧱", "部件", "每个模板都有搭建器：把墙、缺口、激光、金币、爱心、平台、弹簧、无人机、柱子、路径格或音符放到你想要的位置。JUMP WORLD 还有 10 个现成部件。"],
          ["✂️", "编辑", "选择、复制、粘贴、撤销、重做。可以从正在编辑的位置开始测试。"],
          ["❌", "红色 ✕", "红色 ✕ 表示服务器会删掉的部件（没有可走的路、来不及反应、跳不过去的缺口）。移开它，✕ 就消失。"],
          ["🃏", "规则卡", "每局最多 2 张：低重力、镜像、夜晚、一颗心、越来越快。"] ] },
        { icon: "🌐", h: "7. 你的游戏上网页", steps: [
          ["🆔", "创作者 ID", "在 📁 我的游戏里设置 ID（3–20 个字符：a–z、0–9、_）。最多可改 3 次，旧链接仍然有效。"],
          ["🔗", "你的页面", "arcircle.app/game/@你的ID 展示你所有的游戏，每款游戏还有按标题生成的页面——/game/@你的ID/neon-run。任何人都能直接在浏览器里玩。"],
          ["🖼️", "分享卡", "每款游戏都会生成适合 X 和聊天的图片卡，带有游戏美术和你的最佳成绩。"] ] },
        { icon: "🏆", h: "8. 游玩、评分与比赛", steps: [
          ["🔎", "创作者街机厅", "搜索、排序（热门、最新、最多点赞）和按模板筛选。编辑精选排在最前。"],
          ["👍", "评分", "玩完别人的游戏后：好不好玩，简单、适中还是困难。每个钱包一次，作者会在统计里看到。"],
          ["🔁", "改编", "把喜欢的游戏做成你的版本，会标明出处。"],
          ["⚔️", "每周大赛", "每周一个模板。其他人的游玩和点赞（×5）计分。团队为前 3 名设置 USDC 奖金时，会显示在大赛卡上，并在 Arc 上发放。"] ] },
        { icon: "💡", h: "9. 做出受欢迎游戏的小技巧", tips: [
          "从普通开始，玩两次，然后一次只改一个滑块。",
          "通关率约 40–70% 会让人觉得公平：难到想再来一局。",
          "统计会显示大家在哪里结束——先改那里。",
          "标题要说明是什么游戏：「熔岩跑酷」「冰雪迷宫 3」。",
          "分享你的页面、挑战朋友：游玩和点赞会让你的游戏在街机厅排名上升。",
          "这是测试版：游戏暂不发放 ARCL；游玩、点赞和最佳成绩从第一天起就会统计。" ] },
      ],
    },
  },
  tr: {
    tabs: { ad: "AGENT DIMENSION", beta: "Stüdyo Beta" }, title: "Nasıl kullanılır", open: "Aç", close: "Kapat", more: "Daha fazla",
    ad: {
      title: "AGENT DIMENSION rehberi",
      lead: "Kendi yapay zekâ ajanın: seninle yürür, konuşur, görevlere gider ve Ajan Arenası'nda yarışır. Hepsi birkaç dakikada.",
      parts: [
        { icon: "🧭", h: "1. Oraya nasıl gidilir", steps: [
          ["🏛️", "Kale", "Meydanın doğusundaki yüksek Nexus Sonsuzluk Kalesi'ne yürü ve kapısından gir (ışık sütununu ve mini haritadaki 🤖 işaretini izle)."],
          ["🚀", "Kısayol", "Çıkış kartındaki \"AD Kulesi'ne git\"e dokun ya da Menü → Yapay Zekâ Ajanı."],
          ["🌆", "Nexus Şehri", "Kapı seni Nexus Şehri'ne ışınlar. Cüzdanı olmayan da gezebilir."] ] },
        { icon: "✨", h: "2. Ajanını al (Genesis Lab)", steps: [
          ["🤖", "Birini seç", "AURORA (toplama), ORION (madencilik) ya da VEX (keşif). Her biri bir görevde en iyisidir."],
          ["🪪", "Kimlik ve ad", "Benzersiz bir kimlik (3–16 harf, rakam ya da _) ve bir ad seç. Kimlik ödemeden önce kontrol edilir."],
          ["💬", "Kişilik", "Birkaç kelime yaz ya da hazır birine dokun. Ajanın böyle konuşur."],
          ["🪙", "Öde ve doğsun", "Çıkış fiyatı 100.000 $ARCIRCLE (liste 200.000, 31 Ekim'e kadar %50 indirim). Cüzdanında onayla, Arc için biraz bekle ve numarasıyla doğuşunu izle."] ],
          tips: ["Her ödemenin %50'si yakılır, %50'si ARCIRCLE hazinesine gider.", "Ödedikten sonra sekmeyi mi kapattın? Genesis Lab'nı yeniden aç: aynı ödeme kullanılır — asla iki kez ödemezsin.", "Ajanın paranı hareket ettiremez. Zincir üstündeki her şey önce kendi cüzdanına sorar."] },
        { icon: "💬", h: "3. Ajanının penceresi", steps: [
          ["💬", "Sohbet", "Günde 20 mesaj. Son görevlerini hatırlar — toplamaya, madenciliğe ya da keşfe gitmesini iste, onay kartı açar."],
          ["📋", "Görevler", "Toplama (1 sa, 60 ARCL), Madencilik (2 sa, 120 ARCL), Keşif (2 sa, 100 ARCL), günde en çok 6. Dönünce ganimet çantana uçar."],
          ["🗂️", "İş panosu", "4 göreve kadar sırala: bir yer boşalınca sıradaki kendiliğinden başlar, sen yokken bile. İkinci yer ajan 5. seviyede açılır."],
          ["🤖", "Ajan", "Paylaşım kartı, seviyesi ve haftanın en yoğun ajanları."],
          ["💼", "Kasa", "Kendi cüzdanın için Arc'ta bir alım-satım kasası — hazırlanıyor, henüz açık değil."] ] },
        { icon: "🏙️", h: "4. Nexus Şehri", steps: [
          ["🧬", "Genesis Lab", "Ajanını yap ya da onunla buluş."],
          ["🛰️", "Görev Limanı", "Görev gönder, iş panosunu izle. Çalışan ajanlar Biyo Bahçe, Cevher Rafinerisi ve Keşif Güvertesi'nde görünür."],
          ["🏦", "Kasa Kulesi", "Kasa (yakında)."],
          ["🏟️", "Ajan Arenası", "Ajanınla bilgi yarışması (aşağıda)."],
          ["🎮", "ARCIRCLE Studio", "Kendi oyunlarını yap — Stüdyo artık Creator City'de (çeşmenin yanındaki Stüdyo): Stüdyo Beta rehberine bak."],
          ["📚", "Ajan Akademisi", "Dersler, yakında."] ] },
        { icon: "🏟️", h: "5. Ajan Arenası", steps: [
          ["❓", "Nasıl oynanır", "7 soru, her biri 15 saniye. Hızlı ve doğru olan en çok puanı alır."],
          ["🤖", "Ajanının yardımı", "Her turda bir kez ajanın bir yanlış cevabı kaldırır (50 : 50)."],
          ["⏰", "Arena saati", "Seul saatiyle 12:00 ve 21:00'de (birer saat) puanlar iki kat."],
          ["🏆", "Pano", "Günde 3 tur; kusursuz tur +200. Haftanın en keskin ajanları panoda. Burada ARCL yok — şan için."] ],
          tips: ["Arena ve görevler için ajan gerekir. Şehri gezmek ve Studio için gerekmez."] },
      ],
    },
    beta: {
      title: "ARCIRCLE STUDIO BETA — rehber",
      lead: "Kod yazmadan kendi oyununu yap, yayınla ve tüm dünya oynasın — yapımcıların kendi diyarı Creator City'de. Her şey adım adım burada.",
      parts: [
        { icon: "🚪", h: "1. Creator City'ye gitmek", steps: [
          ["🏛️", "Çeşmenin yanındaki Stüdyo", "Meydanda portalların arasında, çeşmeye bakan ARCIRCLE STUDIO binasına yürü ve kapısından geç. Bu bir Creator City portalı."],
          ["🕹️", "Kısayol", "Üst çubuktaki 🕹️'ye dokun ya da Haritayı aç: Creator City en üstte, 8 binasıyla birlikte."],
          ["📱", "Telefonda yan çevir", "Creator City ve Stüdyo yan tutulan telefon için yapıldı. Dik tutarsan bir kart çıkar: \"Yan çevir\" (tam ekran) ya da \"Oyun Dünyasına dön\"e dokun."],
          ["↩️", "Geri dönüş", "Sol üstteki \"Oyun Dünyasına dön\"e dokun ya da meydanın arkasındaki portaldan geç. Kasabada Stüdyo'nun kapısına varırsın."] ] },
        { icon: "🏙️", h: "2. Bir bakışta Creator City", steps: [
          ["🏆", "Şöhretler Salonu", "Meydanın ortasında: şu an en sevilen oyunlar."],
          ["🎓", "Yapımcı Akademisi", "5 adımda ilk oyunun ve 6 yapımcı görevi. Buradan başla."],
          ["🗼", "Stüdyo Kulesi", "Oyunlarını yapıp düzenlediğin Stüdyo'yu açar. Şehirde 🕹️ düğmesi de açar."],
          ["🕹️", "Oyun Salonu + oyun portalları", "Salonun önündeki altı parlak portalda en çok oynanan ve beğenilen oyunlar var: içine yürü, oynamaya başla."],
          ["⚔️", "Yarışma Arenası", "Haftalık yapımcı yarışması: bu haftanın şablonu, sıralama ve ödül."],
          ["🏭", "Varlık Fabrikası", "Yapımcı seviyenin açtıkları. Pazar ve Fırlatma Portalı yakında."] ],
          tips: ["Şehirdeki mentor, inşaatçı ve oyuncunun ipuçları var: yanlarına yürü.", "Bir binayı açmak için kapısına yürü."] },
        { icon: "⭐", h: "3. Yapımcı eğitimi (7 adım)", steps: [
          ["👀", "Ziyaret et", "Creator City'ye gir. Soldaki görev kartı Yapımcı eğitimine dönüşür."],
          ["📄", "Şablon seç", "Altın oku Stüdyo Kulesi'ne kadar izle. Stüdyo'da adımın düğmesi parlar, yanında bir satır açıklama çıkar."],
          ["🎚️", "Ayarla", "Zorluğu, uzunluğu ya da bir kaydırıcıyı değiştir."],
          ["▶️", "Test et", "Oyununu bir kez oyna."],
          ["🚀", "Yayınla", "Creator Arcade'e koy."],
          ["🔗", "Paylaş", "Bağlantısını kopyala ya da paylaşım kartını yap."],
          ["🎮", "Başkasının oyununu oyna", "Bir oyun portalına gir ya da bir koşudan sonra oyunu puanla."] ],
          tips: ["Her adım 40–80 XP verir, sonuncusu +300 XP ve Çaylak Yapımcı unvanı."] },
        { icon: "🛠️", h: "4. 3 adımda oyun yap", steps: [
          ["1️⃣", "Seç", "Bir şablon ve tema seç (Neon Şehir, Orman, Buz Zirveleri, Lav Çekirdeği, Şeker Gökyüzü…). Bir başlık ver. Fikir mi yok? Bir cümle yaz, ajanın oyunun tamamını hazırlasın (günde 10)."],
          ["2️⃣", "Ayarla", "Kolay, Normal, Zor ya da Aşırı, uzunluk ve her kaydırıcı. Değiştirdikçe yıldızlar ve test botlarının geçme oranı değişir. Ajanına ne değişeceğini de söyleyebilirsin: \"daha çok para, daha yavaş lazerler\"."],
          ["3️⃣", "Test et ve yayınla", "▶ Test oynayışıyla kendin dene (test koşuları sayılmaz), sonra 💾 Kaydet (12 oyun saklanır) ve 🚀 Creator Arcade'de yayınla."] ],
          tips: ["Botlar zar zor geçiyorsa Stüdyo yayınlamadan önce fazla zor olup olmadığını sorar.", "Her kayıt son 5 sürümü saklar: eskisini 📁 Oyunlarım'dan aç."] },
        { icon: "🎮", h: "5. Şablonlar", steps: [
          ["🏃", "Koşular", "Sky Runner (bitişe kadar), Infinity Dash (bitiş yok, gittikçe hızlanır), Sky Climb (zıplayarak yukarı), Hover Race (sırayla halkalar, turlar)."],
          ["🧱", "JUMP WORLD", "Izgara üzerinde platform oyunu: bloklar, hareketli platformlar, anahtarlar ve kapılar, düğmeler, kontrol noktaları, toplar, düşmanlar ve bir ejderha boss. Modları: Zindan, Kaçış Odası (zamana karşı), Boss Savaşı ve Maden Koşusu (cevher kaz)."],
          ["⚔️", "Dövüşler", "Arena Survival (dronlar ve lazer taramaları), Coin Rush (para topla), Monster Survival (Survivors motoru: dalgalar, elitler, bir boss), Tower Defense (Şimşek, Buz ve Top kuleleri)."],
          ["🧩", "Bulmaca ve ritim", "Halka Bulmacası (altı tahtadan birini seç) ve Beat Maker (4 şerit, Perfect ve Good)."] ],
          tips: ["@arcircle'ın 15 resmi oyunu her şablonu en iyi hâliyle gösterir: önce salonun \"Buradan başla\" sırasında oyna."] },
        { icon: "🧰", h: "6. Kendin kur", steps: [
          ["🧱", "Parçalar", "Her şablonun bir kurucusu var: duvarları, boşlukları, lazerleri, paraları, kalpleri, çıkıntıları, yayları, dronları, sütunları, yol hücrelerini ya da notaları istediğin yere koy. Jump World 10 hazır parça ekler."],
          ["✂️", "Düzenle", "Seç, kopyala, yapıştır, geri al, yinele. Düzenlediğin yerden test et."],
          ["❌", "Kırmızı ✕", "Kırmızı ✕ sunucunun atacağı parçayı gösterir (geçecek yol yok, tepki süresi yok, atlanamayan boşluk). Taşırsan ✕ kaybolur."],
          ["🃏", "Kural kartları", "Bir koşu için en fazla 2: düşük yerçekimi, ayna, gece, tek kalp, hızlanma."] ] },
        { icon: "🌐", h: "7. Oyunların web'de", steps: [
          ["🆔", "Yapımcı kimliğin", "📁 Oyunlarım'da bir kimlik seç (3–20 karakter: a–z, 0–9, _). 3 kez değiştirebilirsin; eski bağlantılar çalışmaya devam eder."],
          ["🔗", "Sayfaların", "arcircle.app/game/@kimliğin tüm oyunlarını gösterir ve her oyunun başlığından kendi sayfası olur — /game/@kimliğin/neon-run. Herkes orada, tarayıcıda hemen oynayabilir."],
          ["🖼️", "Paylaşım kartları", "Her oyun X ve sohbetler için, görseli ve en iyi koşunla bir resim kartı yapar."] ] },
        { icon: "🏆", h: "8. Oyna, puanla, yarış", steps: [
          ["🔎", "Creator Arcade", "Ara, sırala (popüler, en yeni, en çok beğenilen) ve şablona göre süz. Editörün seçtikleri önce gelir."],
          ["👍", "Puanla", "Başkasının oyununda bir koşudan sonra: eğlenceli mi, kolay mı, tam mı, zor mu. Cüzdan başına bir kez; yapımcı istatistiklerinde görür."],
          ["🔁", "Remiks", "Sevdiğin bir oyunun kendi sürümünü yap; nereden geldiği görünür."],
          ["⚔️", "Haftalık yarışma", "Haftada bir şablon. Başkalarının oynamaları ve beğenileri (×5) sayılır. Ekip ilk 3'e USDC ödülü koyduğunda yarışma kartında görünür ve Arc'ta ödenir."] ] },
        { icon: "💡", h: "9. Sevilen bir oyun için ipuçları", tips: [
          "Normal'den başla, iki kez oyna, sonra kaydırıcıları tek tek değiştir.",
          "Yaklaşık %40–70 geçme oranı adil hissettirir: bir tur daha istetecek kadar zor.",
          "İstatistiklerin koşuların nerede bittiğini gösterir — önce orayı düzelt.",
          "Başlık ne olduğunu söylesin: \"Lav Koşusu\", \"Buz Labirenti 3\".",
          "Sayfanı paylaş ve arkadaşlarına meydan oku: oynanma ve beğeniler oyununu salonda yukarı taşır.",
          "Bu bir beta: oyunlar henüz ARCL ödemiyor; oynanma, beğeni ve en iyi koşular ilk günden sayılıyor." ] },
      ],
    },
  },
};

// the art beside each step (cut from the owner's guide mock-up, images/ui/guide/*.webp), by part and step index; the
// same in every language
window.ARC_AD_GUIDE.art = {
  beta: { head: "/images/gw/key-cc.webp", steps: { "0-0": "/images/cc/b-tower.webp", "1-0": "/images/cc/b-hall.webp", "1-1": "/images/cc/b-academy.webp", "1-3": "/images/cc/b-arcade.webp", "1-4": "/images/cc/b-contest.webp", "1-5": "/images/cc/b-factory.webp", "3-0": "tpl", "3-1": "diff", "3-2": "publish" } },
  ad: { lead: "robot", steps: { "0-0": "citadel", "0-2": "city", "1-0": "agents", "1-3": "summon", "2-1": "errands" } },
};

// one way to draw it, for the game's window and /game alike (styles: /ad-guide.css). → HTML of the tabs, the lead and the
// parts; open: how many parts start open
window.ARC_AD_GUIDE.html = function (lang, tab, esc, open, tabs) {
  var A = window.ARC_AD_GUIDE, D = A[lang] || A.en, G = D[tab], ART = A.art[tab] || { steps: {} }, img = function (n) { return n.charAt(0) === "/" ? n : "/images/ui/guide/" + n + ".webp?v=1"; };
  var nOpen = open == null ? 2 : open, TABS = tabs || ["ad", "beta"]; // (/game shows only the Studio Beta guide)
  var head = '<header class="adg-head">' + (ART.head ? '<img class="adg-head-art" src="' + img(ART.head) + '" alt="">' : "") +
    '<small>📖 ' + esc(D.title) + '</small><h2>' + esc(G.title) + '</h2>' +
    (TABS.length > 1 ? '<nav class="adg-tabs">' + TABS.map(function (k) { return '<button type="button" data-adg="' + k + '" class="' + (k === tab ? "on" : "") + '">' + (k === "ad" ? "🤖 " : "🎮 ") + esc(D.tabs[k]) + "</button>"; }).join("") + "</nav>" : "") + "</header>";
  var lead = '<p class="adg-lead' + (ART.lead ? " art" : "") + '">' + esc(G.lead) + (ART.lead ? '<img src="' + img(ART.lead) + '" alt="">' : "") + "</p>";
  var parts = G.parts.map(function (p, i) {
    var h = String(p.h).replace(/^\d+\.\s*/, "");
    var steps = p.steps ? '<ol class="adg-steps">' + p.steps.map(function (s, j) { var a = ART.steps[i + "-" + j];
      return '<li class="' + (a ? "art" : "") + '"><b class="adg-n">' + (j + 1) + '</b><i class="adg-ic" aria-hidden="true">' + s[0] + '</i><div class="adg-tx"><b>' + esc(s[1]) + "</b><p>" + esc(s[2]) + "</p></div>" + (a ? '<img class="adg-art" src="' + img(a) + '" alt="">' : "") + "</li>"; }).join("") + "</ol>" : "";
    var tips = p.tips ? '<ul class="adg-tips">' + p.tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "";
    return '<details class="adg-part p' + i + '"' + (i < nOpen ? " open" : "") + '><summary><b class="adg-pn">' + (i + 1) + '</b><span class="adg-pi" aria-hidden="true">' + p.icon + "</span>" + esc(h) + "</summary>" + steps + tips + "</details>";
  }).join("");
  return head + '<div class="adg-body">' + lead + parts + "</div>";
};

