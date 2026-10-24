// ad-guide-data.js — the player's guide to AGENT DIMENSION and ARCIRCLE Studio Lite (the owner asked for it on 2026-10-24:
// "쉽게, 특히 스튜디오 라이트"). One copy for both places that show it: the game's guide window (world-adguide.js loads this
// file) and /game's guide section (gw.js). Keep it true to the game: limits here are the servers' constants
// (api/_world-agent.mjs AGENT, api/_world-agarena.mjs ARENA, api/_world-studio.mjs STUDIO, world-studio-gen.js KNOBS / PRESETS).
// Each guide: { title, lead, parts: [{ icon, h, p?, steps?: [[icon, title, text]], tips?: [text] }] }
window.ARC_AD_GUIDE = {
  en: {
    tabs: { ad: "AGENT DIMENSION", studio: "Studio Lite" }, title: "How to use", open: "Open", close: "Close", more: "More",
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
          ["🎮", "ARCIRCLE Studio", "Make your own games — see the Studio Lite guide."],
          ["📚", "Agent Academy", "Lessons, coming soon."] ] },
        { icon: "🏟️", h: "5. Agent Arena", steps: [
          ["❓", "How it works", "7 questions, 15 seconds each. Fast and right scores the most."],
          ["🤖", "Your agent's help", "Once a run, your agent takes away one wrong answer (50 : 50)."],
          ["⏰", "Arena hour", "Points count double at 12:00 and 21:00 Seoul time (one hour each)."],
          ["🏆", "The board", "3 runs a day; a perfect run gets +200. The week's sharpest agents are on the board. No ARCL here — it's for the glory."] ],
          tips: ["You need an agent for the Arena and errands. Walking round the city and the Studio don't need one."] },
      ],
    },
    studio: {
      title: "ARCIRCLE Studio Lite — the guide",
      lead: "Make your own game in 5 steps — no code. Pick a template, choose a look, set how hard it is, test it, publish it. Then anyone can play it, like it and try to beat your best.",
      parts: [
        { icon: "🚪", h: "1. Open the Studio", steps: [
          ["🏙️", "Go to Nexus City", "Walk through the Citadel's door east of the plaza."],
          ["🎮", "The Studio building", "Walk up to the ARCIRCLE Studio (the neon citadel) and tap it. The board by its door shows the most played games."],
          ["👛", "Sign in to keep games", "You can try everything as a guest; sign in with a wallet to save and publish."] ],
          tips: ["Three tabs at the top: 🛠️ Create (make a game) · 📁 My games (your drafts and published games) · 🕹️ Creator Arcade (everyone's games)."] },
        { icon: "🛠️", h: "2. Make a game in 5 steps", steps: [
          ["📄", "Template", "Pick Sky Runner, Infinity Dash, Arena Survival, Ring Puzzle, Sky Climb or Tower Defense (explained below). Give it a title (up to 24 letters). Short on ideas? Type one sentence — \"a fast jungle run with lots of coins\" — and your agent drafts the whole game (10 drafts a day)."],
          ["🎨", "Theme", "Choose the look: Neon City, Jungle, Ice Peaks, Lava Core or Candy Sky. The 3D preview changes at once."],
          ["📊", "Difficulty", "Tap Easy, Normal, Hard or Extreme. Under each: its stars (1 easy … 5 brutal) and the clear rate 40 test bots got. Pick the length too. Want more control? Open ⚙️ Advanced settings for each slider, and 🎲 New layout for a fresh arrangement."],
          ["▶️", "Test", "Tap ▶ Test play and play it yourself. A test run isn't counted, so try as often as you like."],
          ["🚀", "Publish", "💾 Save keeps it as a draft (you can keep 12). Publish puts it on the Creator Arcade for everyone. Then 🔗 Copy link to share it."] ],
          tips: ["You can move between steps any time with Back / Next or by tapping the step numbers.", "The preview strip and the stars update as you change anything — no need to test after every tap."] },
        { icon: "🎮", h: "3. The six templates", steps: [
          ["🏃", "Sky Runner", "Run down 3 lanes to the finish. Switch lanes past walls, jump the gaps, slide under lasers, grab coins. 3 hearts."],
          ["♾️", "Infinity Dash", "The same run with no finish: it keeps speeding up. How far can you get before your hearts run out?"],
          ["🛸", "Arena Survival", "A round arena seen from above. Drones fly in from the edge — dodge them, the big drones and the laser sweeps, grab coins, and last until the timer ends."],
          ["💍", "Ring Puzzle", "INFINITY RINGS on your own board. Tap a ring to knock it off; clear the board in as few moves as you can (the par)."],
          ["🧗", "Sky Climb", "A tower seen from the side. You bounce on your own — steer left and right (the sides wrap round), land on platforms, ride springs, dodge spikes and reach the top."],
          ["🛡️", "Tower Defense", "Foes walk the path from the portal to your crystal. Tap a pad to build a Bolt, Frost or Cannon tower; tap a tower to upgrade or sell it. Hold every wave — 10 lives."] ] },
        { icon: "🕹️", h: "4. Controls", steps: [
          ["📱", "Runner & Dash on a phone", "Swipe left/right to change lanes · swipe up or tap to jump · swipe down to slide."],
          ["⌨️", "Runner & Dash on a computer", "← → or A D to change lanes · ↑, Space or W to jump · ↓ or S to slide."],
          ["🛸", "Arena", "Phone: drag on the screen to move. Computer: arrow keys or W A S D."],
          ["💍", "Ring Puzzle", "Tap a ring. Hints are there if you're stuck."],
          ["🧗", "Sky Climb", "Phone: hold the left or right half of the screen. Computer: ← → or A D."],
          ["🛡️", "Tower Defense", "Tap a pad or a tower. ▶ Next wave calls the next wave early (+5 gold)."] ] },
        { icon: "🎚️", h: "5. What the sliders do", steps: [
          ["🏃", "Sky Runner", "Speed · Coins · Walls · Gaps to jump · Lasers to slide under · Length (30–90 s)."],
          ["♾️", "Infinity Dash", "Starting speed · Coins · Walls · Gaps · Lasers · How fast it speeds up."],
          ["🛸", "Arena Survival", "Drone speed · Coins · Drones · Laser sweeps · Big drones · Survive for."],
          ["💍", "Ring Puzzle", "Rings · Pegs · Lock rings · Ice rings · Energy rings · Hints. Every board is checked to be solvable."],
          ["🧗", "Sky Climb", "Bounce · Coins · Moving platforms · Breaking platforms · Spikes · Height (120–360 m)."],
          ["🛡️", "Tower Defense", "Enemy speed · Starting gold · Enemies a wave · Tanks · Runners · Waves (5–15)."] ] },
        { icon: "🏆", h: "6. After you publish", steps: [
          ["📄", "Your game's page", "Its cover, maker, difficulty, the Top 10 and your best."],
          ["👻", "Race the ghost", "The #1's run plays as a ghost beside you — beat it and your run becomes the ghost."],
          ["⚔️", "Challenge a friend", "Send the challenge link: your friend sees your score to beat."],
          ["❤️", "Plays and likes", "Plays are counted once every 20 seconds per player, and your own plays don't count. Likes and best runs show on the arcade."],
          ["✏️", "Change it later", "In 📁 My games: Edit, take it off the arcade, or Delete."],
          ["⭐", "Editor's picks", "Games the team stars are shown first on the Creator Arcade with a ⭐ — make something great and it could be next."] ] },
        { icon: "🧱", h: "7. Build it yourself (the second tier)", steps: [
          ["🛠️", "Open the builder", "In step 3 (Difficulty), tap 🛠️ Open the builder. It starts from the level you already have, so nothing is lost — and Back to quick start undoes it."],
          ["🧱", "Place things", "Pick a tool at the bottom, then tap the map. Runner & Dash: walls, moving walls, gaps, lasers, blinking lasers, coins, hearts. Arena: pick a moment on the timeline, tap the side a drone, big drone or laser sweep comes from, drop coins, stand pillars. Sky Climb: ledges, moving and breaking platforms, springs, spikes. Tower Defense: draw the path from the portal down to the crystal, add pads, write each wave."],
          ["🧩", "Pieces", "Ready-made bits — a zigzag, a laser tunnel, a drone ring, a staircase … Pick one and tap where it starts."],
          ["⬚", "Select · copy · paste · undo", "On the tracks, Select a stretch, then Copy, Cut, Clear or Paste it elsewhere. ↩️ ↪️ undo and redo (80 steps)."],
          ["❌", "Red ✕ = won't count", "Only fair levels are played: a free lane on every row, time to react, one thing a spot, a path that joins up. Whatever breaks a rule is marked red and left out."],
          ["⭐", "Stars as you go", "The stars and clear rate change with every tap; the strip at the side shows where the test bots fail most (red)."],
          ["▶️", "Test from here", "Test from the part you're looking at (the arena: from the moment you're on). Back brings you straight to the builder."],
          ["🃏", "Rule cards", "Runner & Dash: up to 2 — low gravity, mirrored controls, night run, one heart, speeds up."],
          ["🧩", "Ring Puzzle boards", "Pick one of six boards side by side; 🔄 swaps one, 🎲 shows six new ones."],
          ["🕘", "Versions", "Every save keeps the last 5: in 📁 My games tap 🕘 to open an earlier one."] ] },
        { icon: "💡", h: "8. Tips for a game people love", tips: [
          "Start from Normal, test it twice, then tune one slider at a time.",
          "A clear rate of about 40–70% feels fair: hard enough to want another go.",
          "Coins are fun: more coins means more to chase.",
          "A clear title says what it is: \"Lava Sprint\", \"Ice Maze 3\".",
          "Share your link and challenge friends — plays and likes bring your game up the arcade.",
          "No ARCL is paid for games yet; plays, likes and best runs are counted from day one." ] },
      ],
    },
  },
  ko: {
    tabs: { ad: "AGENT DIMENSION", studio: "스튜디오 라이트" }, title: "사용 방법", open: "열기", close: "닫기", more: "더 보기",
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
          ["🎮", "ARCIRCLE 스튜디오", "나만의 게임 만들기 — 스튜디오 라이트 설명서를 보세요."],
          ["📚", "에이전트 아카데미", "수업, 준비 중."] ] },
        { icon: "🏟️", h: "5. 에이전트 아레나", steps: [
          ["❓", "방법", "7문제, 문제당 15초. 빠르고 정확할수록 점수가 높아요."],
          ["🤖", "에이전트 도움", "한 판에 한 번, 에이전트가 오답 하나를 지워 줘요 (50 : 50)."],
          ["⏰", "아레나 아워", "서울 시간 12:00과 21:00 (각 1시간)에는 점수 2배."],
          ["🏆", "순위", "하루 3판, 만점이면 +200. 이번 주 순위에 올라요. ARCL 보상은 없어요 — 명예를 위한 대결이에요."] ],
          tips: ["아레나와 심부름에는 에이전트가 필요해요. 도시 구경과 스튜디오는 없어도 돼요."] },
      ],
    },
    studio: {
      title: "ARCIRCLE 스튜디오 라이트 사용 설명서",
      lead: "코딩 없이 5단계로 나만의 게임을 만들어요. 템플릿을 고르고, 테마를 정하고, 난이도를 맞추고, 테스트하고, 게시하면 끝! 누구나 플레이하고, 좋아요를 누르고, 내 기록에 도전할 수 있어요.",
      parts: [
        { icon: "🚪", h: "1. 스튜디오 열기", steps: [
          ["🏙️", "넥서스 시티로", "광장 동쪽 시타델의 문으로 들어가세요."],
          ["🎮", "스튜디오 건물", "ARCIRCLE 스튜디오(네온 시타델)로 걸어가 누르세요. 문 앞 보드에는 가장 많이 플레이된 게임이 있어요."],
          ["👛", "로그인하면 저장", "게스트로도 다 해 볼 수 있어요. 저장과 게시는 지갑 로그인이 필요해요."] ],
          tips: ["위쪽 탭 세 개: 🛠️ 만들기 · 📁 내 게임(임시 저장·게시한 게임) · 🕹️ 크리에이터 아케이드(모두의 게임)."] },
        { icon: "🛠️", h: "2. 5단계로 게임 만들기", steps: [
          ["📄", "템플릿", "스카이 러너, 인피니티 대시, 아레나 서바이벌, 링 퍼즐, 스카이 클라임, 타워 디펜스 중 하나를 골라요 (아래 설명). 제목을 붙여요 (24자까지). 아이디어가 없나요? \"코인이 많은 빠른 정글 런\"처럼 한 문장을 쓰면 에이전트가 게임 전체를 만들어 줘요 (하루 10번)."],
          ["🎨", "테마", "네온 시티, 정글, 얼음 봉우리, 용암 코어, 캔디 스카이 중에서 골라요. 3D 미리보기가 바로 바뀌어요."],
          ["📊", "난이도", "쉬움·보통·어려움·극한 중 하나를 눌러요. 각각 별(1 쉬움 … 5 극악)과 테스트 봇 40명의 클리어율이 보여요. 길이도 골라요. 더 세세하게? ⚙️ 고급 설정에서 슬라이더를, 🎲 새 레이아웃으로 새로운 배치를 만들어요."],
          ["▶️", "테스트", "▶ 테스트 플레이로 직접 해 봐요. 테스트 기록은 집계되지 않으니 마음껏 해 보세요."],
          ["🚀", "게시", "💾 저장하면 임시 저장(12개까지). 게시하면 크리에이터 아케이드에 올라가 모두가 플레이해요. 🔗 링크 복사로 공유하세요."] ],
          tips: ["뒤로/다음 버튼이나 단계 숫자를 눌러 언제든 단계를 오갈 수 있어요.", "바꿀 때마다 미리보기와 별이 바로 바뀌어요 — 매번 테스트할 필요 없어요."] },
        { icon: "🎮", h: "3. 템플릿 6종", steps: [
          ["🏃", "스카이 러너", "3개 레인을 달려 결승선까지. 벽은 레인을 바꿔 피하고, 구멍은 점프, 레이저는 슬라이드, 코인은 모아요. 하트 3개."],
          ["♾️", "인피니티 대시", "결승선 없는 같은 달리기: 계속 빨라져요. 하트가 다 떨어질 때까지 얼마나 갈 수 있을까요?"],
          ["🛸", "아레나 서바이벌", "위에서 보는 원형 아레나. 가장자리에서 드론이 날아와요 — 드론·큰 드론·레이저를 피하고 코인을 모으며 시간이 끝날 때까지 버텨요."],
          ["💍", "링 퍼즐", "나만의 보드로 하는 인피니티 링. 링을 눌러 떨어뜨려요. 최대한 적은 횟수(기준 횟수)로 보드를 비우세요."],
          ["🧗", "스카이 클라임", "옆에서 보는 탑이에요. 캐릭터가 저절로 튀어 올라요 — 좌우로 움직여(양 끝은 이어져 있어요) 발판에 내리고, 스프링을 타고, 가시를 피해 정상까지!"],
          ["🛡️", "타워 디펜스", "적들이 포탈에서 크리스탈까지 길을 따라 와요. 자리를 탭해 볼트·서리·캐논 타워를 짓고, 타워를 탭해 업그레이드하거나 팔아요. 모든 웨이브를 막아요 — 생명 10."] ] },
        { icon: "🕹️", h: "4. 조작법", steps: [
          ["📱", "러너·대시 (폰)", "좌우로 밀어 레인 변경 · 위로 밀거나 탭하면 점프 · 아래로 밀면 슬라이드."],
          ["⌨️", "러너·대시 (PC)", "← → 또는 A D 레인 변경 · ↑, 스페이스, W 점프 · ↓ 또는 S 슬라이드."],
          ["🛸", "아레나", "폰: 화면을 드래그해서 이동. PC: 방향키 또는 W A S D."],
          ["💍", "링 퍼즐", "링을 탭하세요. 막히면 힌트를 쓰세요."],
          ["🧗", "스카이 클라임", "폰: 화면 왼쪽/오른쪽 절반을 누르고 있기. 컴퓨터: ← → 또는 A D."],
          ["🛡️", "타워 디펜스", "자리나 타워를 탭하세요. ▶ 다음 웨이브로 다음 웨이브를 일찍 불러요(+5 골드)."] ] },
        { icon: "🎚️", h: "5. 슬라이더 설명", steps: [
          ["🏃", "스카이 러너", "속도 · 코인 · 벽 · 점프할 구멍 · 슬라이드할 레이저 · 길이 (30~90초)."],
          ["♾️", "인피니티 대시", "시작 속도 · 코인 · 벽 · 구멍 · 레이저 · 빨라지는 정도."],
          ["🛸", "아레나 서바이벌", "드론 속도 · 코인 · 드론 수 · 레이저 스윕 · 큰 드론 · 버틸 시간."],
          ["💍", "링 퍼즐", "링 · 페그 · 잠금 링 · 얼음 링 · 에너지 링 · 힌트. 모든 보드는 풀 수 있는지 확인돼요."],
          ["🧗", "스카이 클라임", "점프 높이 · 코인 · 움직이는 발판 · 부서지는 발판 · 가시 · 높이(120–360 m)."],
          ["🛡️", "타워 디펜스", "적 속도 · 시작 골드 · 웨이브당 적 · 탱커 · 러너 · 웨이브(5–15)."] ] },
        { icon: "🏆", h: "6. 게시한 다음", steps: [
          ["📄", "게임 페이지", "커버, 만든 사람, 난이도, Top 10, 내 최고 기록."],
          ["👻", "고스트와 경주", "1등의 플레이가 옆에서 고스트로 달려요 — 이기면 내 기록이 새 고스트가 돼요."],
          ["⚔️", "친구에게 도전", "도전 링크를 보내면 친구가 넘어야 할 내 점수가 보여요."],
          ["❤️", "플레이와 좋아요", "플레이는 한 사람당 20초에 한 번만 집계되고, 내 플레이는 안 세요. 좋아요와 최고 기록이 아케이드에 보여요."],
          ["✏️", "나중에 바꾸기", "📁 내 게임에서 수정, 아케이드에서 내리기, 삭제."],
          ["⭐", "에디터 추천", "운영팀이 별을 준 게임은 크리에이터 아케이드 맨 위에 ⭐와 함께 보여요 — 멋진 게임을 만들면 다음은 당신 차례!"] ] },
        { icon: "🧱", h: "7. 직접 만들기 (2단계)", steps: [
          ["🛠️", "편집기 열기", "3단계(난이도)에서 🛠️ 편집기 열기를 누르세요. 지금 만든 레벨에서 시작하니 잃는 건 없어요 — 빠른 시작으로 돌아가기로 되돌릴 수 있어요."],
          ["🧱", "놓기", "아래에서 도구를 고르고 맵을 탭하세요. 러너·대시: 벽, 움직이는 벽, 구멍, 레이저, 깜빡이는 레이저, 코인, 하트. 아레나: 타임라인에서 시간을 고르고 드론·큰 드론·레이저 스윕이 나올 방향을 탭, 코인과 기둥도 놓아요. 스카이 클라임: 발판, 움직이는·부서지는 발판, 스프링, 가시. 타워 디펜스: 포탈에서 크리스탈까지 길을 그리고, 타워 자리를 놓고, 웨이브를 적어요."],
          ["🧩", "조각", "지그재그, 레이저 터널, 드론 링, 계단 … 미리 만든 조각을 고르고 시작할 곳을 탭하세요."],
          ["⬚", "선택 · 복사 · 붙여넣기 · 되돌리기", "트랙에서 구간을 선택한 뒤 복사·잘라내기·지우기·붙여넣기. ↩️ ↪️ 되돌리기/다시 하기(80단계)."],
          ["❌", "빨간 ✕ = 반영 안 됨", "공정한 레벨만 플레이돼요: 줄마다 빈 레인 하나, 반응할 시간, 한 자리에 하나, 이어진 길. 규칙에 어긋난 건 빨간색으로 표시되고 빠져요."],
          ["⭐", "바로 보이는 별점", "탭할 때마다 별점과 클리어율이 바뀌고, 옆의 띠는 테스트 봇이 가장 많이 실패하는 곳(빨강)을 보여줘요."],
          ["▶️", "여기서부터 테스트", "보고 있는 부분부터 테스트해요(아레나: 고른 시간부터). 돌아가기를 누르면 바로 편집기로 와요."],
          ["🃏", "규칙 카드", "러너·대시: 최대 2장 — 저중력, 좌우 반전, 밤의 질주, 하트 하나, 점점 빨라짐."],
          ["🧩", "링 퍼즐 보드", "보드 6개를 나란히 보고 하나를 골라요. 🔄 하나만 바꾸기, 🎲 새 보드 6개."],
          ["🕘", "버전", "저장할 때마다 최근 5개가 남아요: 📁 내 게임에서 🕘을 눌러 이전 버전을 열어요."] ] },
        { icon: "💡", h: "8. 인기 게임 만드는 팁", tips: [
          "보통에서 시작해 두 번 테스트하고, 슬라이더는 하나씩 조절하세요.",
          "클리어율 40~70% 정도가 공정하게 느껴져요: 한 판 더 하고 싶을 만큼 어려운 정도.",
          "코인은 재미예요: 코인이 많을수록 쫓을 게 많아요.",
          "제목은 무슨 게임인지 알 수 있게: \"라바 스프린트\", \"아이스 미로 3\".",
          "링크를 공유하고 친구에게 도전하세요 — 플레이와 좋아요가 많을수록 아케이드 위로 올라가요.",
          "아직 게임으로 ARCL을 주지는 않아요. 플레이·좋아요·최고 기록은 첫날부터 집계돼요." ] },
      ],
    },
  },
  zh: {
    tabs: { ad: "AGENT DIMENSION", studio: "Studio Lite" }, title: "使用方法", open: "打开", close: "关闭", more: "更多",
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
          ["🎮", "ARCIRCLE Studio", "制作你自己的游戏——见 Studio Lite 指南。"],
          ["📚", "智能体学院", "课程，即将推出。"] ] },
        { icon: "🏟️", h: "5. 智能体竞技场", steps: [
          ["❓", "玩法", "7 道题，每题 15 秒。答得又快又对得分最高。"],
          ["🤖", "智能体帮忙", "每局一次，智能体帮你去掉一个错误答案（50 : 50）。"],
          ["⏰", "竞技场时段", "首尔时间 12:00 和 21:00（各一小时）得分翻倍。"],
          ["🏆", "排行榜", "每天 3 局，满分 +200。本周最强智能体上榜。这里没有 ARCL——只为荣誉。"] ],
          tips: ["竞技场和任务需要智能体。参观城市和 Studio 不需要。"] },
      ],
    },
    studio: {
      title: "ARCIRCLE Studio Lite 使用指南",
      lead: "无需编程，5 步做出你自己的游戏。选模板、选主题、调难度、试玩、发布。然后任何人都能玩、点赞、挑战你的纪录。",
      parts: [
        { icon: "🚪", h: "1. 打开 Studio", steps: [
          ["🏙️", "前往 Nexus 城", "从广场东边城堡的大门进入。"],
          ["🎮", "Studio 大楼", "走到 ARCIRCLE Studio（霓虹城堡）并点击。门口的看板显示最热门的游戏。"],
          ["👛", "登录后可保存", "游客也能全部试用；用钱包登录才能保存和发布。"] ],
          tips: ["顶部三个标签：🛠️ 制作 · 📁 我的游戏（草稿和已发布）· 🕹️ 创作者街机厅（所有人的游戏）。"] },
        { icon: "🛠️", h: "2. 5 步做出游戏", steps: [
          ["📄", "模板", "选择天空跑者、无限冲刺、竞技场生存、圆环解谜、天空攀登或塔防（见下）。起个标题（最多 24 个字符）。没灵感？写一句话——比如「金币很多的快速丛林跑酷」——智能体会帮你生成整个游戏（每天 10 次）。"],
          ["🎨", "主题", "选择外观：霓虹城、丛林、冰峰、熔岩核心或糖果天空。3D 预览立即更新。"],
          ["📊", "难度", "点简单、普通、困难或极限。每项下方显示星级（1 简单 … 5 残酷）和 40 个测试机器人的通关率。也可以选长度。想更细？打开 ⚙️ 高级设置调整每个滑块，用 🎲 新布局换一种排列。"],
          ["▶️", "试玩", "点 ▶ 试玩亲自玩一遍。试玩不计入成绩，想玩几次都行。"],
          ["🚀", "发布", "💾 保存为草稿（最多 12 个）。发布后上架创作者街机厅，所有人都能玩。再用 🔗 复制链接分享。"] ],
          tips: ["随时可以用 返回/下一步 或点步骤编号切换。", "每次修改，预览和星级都会立刻更新——不必每次都试玩。"] },
        { icon: "🎮", h: "3. 六种模板", steps: [
          ["🏃", "天空跑者", "在 3 条跑道上冲向终点。换道躲墙、跳过缺口、滑过激光、收集金币。3 颗心。"],
          ["♾️", "无限冲刺", "同样的跑酷但没有终点：速度不断加快。心用完之前你能跑多远？"],
          ["🛸", "竞技场生存", "俯视的圆形竞技场。无人机从边缘飞来——躲开无人机、大型无人机和激光扫射，收集金币，坚持到计时结束。"],
          ["💍", "圆环解谜", "在你自己的棋盘上玩无限圆环。点圆环把它打掉；用尽量少的步数（标准步数）清空棋盘。"],
          ["🧗", "天空攀登", "从侧面看的高塔。你会自动弹跳——左右移动（两边相连），落在平台上、踩弹簧、躲尖刺，一路登顶。"],
          ["🛡️", "塔防", "敌人沿着路径从传送门走向你的水晶。点塔位建造闪电、冰霜或加农炮塔；点塔可升级或出售。守住每一波——10 条命。"] ] },
        { icon: "🕹️", h: "4. 操作", steps: [
          ["📱", "跑者和冲刺（手机）", "左右滑动换道 · 上滑或点击跳跃 · 下滑滑铲。"],
          ["⌨️", "跑者和冲刺（电脑）", "← → 或 A D 换道 · ↑、空格或 W 跳跃 · ↓ 或 S 滑铲。"],
          ["🛸", "竞技场", "手机：在屏幕上拖动移动。电脑：方向键或 W A S D。"],
          ["💍", "圆环解谜", "点击圆环。卡住时可以用提示。"],
          ["🧗", "天空攀登", "手机：按住屏幕左半边或右半边。电脑：← → 或 A D。"],
          ["🛡️", "塔防", "点塔位或塔。▶ 下一波可提前叫来下一波（+5 金币）。"] ] },
        { icon: "🎚️", h: "5. 滑块的作用", steps: [
          ["🏃", "天空跑者", "速度 · 金币 · 墙 · 跳跃缺口 · 滑铲激光 · 长度（30–90 秒）。"],
          ["♾️", "无限冲刺", "起始速度 · 金币 · 墙 · 缺口 · 激光 · 加速快慢。"],
          ["🛸", "竞技场生存", "无人机速度 · 金币 · 无人机 · 激光扫射 · 大型无人机 · 坚持时间。"],
          ["💍", "圆环解谜", "圆环 · 钉子 · 锁环 · 冰环 · 能量环 · 提示。每个棋盘都会检查是否可解。"],
          ["🧗", "天空攀登", "弹跳高度 · 金币 · 移动平台 · 易碎平台 · 尖刺 · 高度（120–360 米）。"],
          ["🛡️", "塔防", "敌人速度 · 初始金币 · 每波敌人 · 坦克 · 疾行者 · 波次（5–15）。"] ] },
        { icon: "🏆", h: "6. 发布之后", steps: [
          ["📄", "游戏页面", "封面、作者、难度、前 10 名和你的最佳成绩。"],
          ["👻", "和幽灵赛跑", "第 1 名的成绩会以幽灵形式在你身边跑——赢了它，你的成绩就成为新幽灵。"],
          ["⚔️", "挑战好友", "发送挑战链接：好友会看到要超越的分数。"],
          ["❤️", "游玩和点赞", "每位玩家每 20 秒只计一次游玩，自己玩不计。点赞和最佳成绩会显示在街机厅。"],
          ["✏️", "之后修改", "在 📁 我的游戏中：编辑、下架或删除。"],
          ["⭐", "编辑精选", "团队加星的游戏会带着 ⭐ 排在创作者街机最前面——做出好游戏，下一个就是你。"] ] },
        { icon: "🧱", h: "7. 亲手搭建（第二层）", steps: [
          ["🛠️", "打开编辑器", "在第 3 步（难度）点 🛠️ 打开编辑器。它从你现有的关卡开始，什么都不会丢——“回到快速开始”可以撤回。"],
          ["🧱", "摆放", "在底部选工具，然后点地图。跑酷/冲刺：墙、移动墙、缺口、激光、闪烁激光、金币、爱心。竞技场：在时间轴上选时间点，点无人机、大型无人机或激光扫射出现的方向，放金币、立柱子。天空攀登：平台、移动和易碎平台、弹簧、尖刺。塔防：从传送门往下画路径到水晶，放塔位，写好每一波。"],
          ["🧩", "组件", "之字墙、激光隧道、无人机环、阶梯……选一个，点它开始的位置。"],
          ["⬚", "选择 · 复制 · 粘贴 · 撤销", "在赛道上选一段，然后复制、剪切、清除或粘贴到别处。↩️ ↪️ 撤销/重做（80 步）。"],
          ["❌", "红色 ✕ = 不计入", "只玩公平的关卡：每行留一条空道、有反应时间、一个位置一样东西、路径要连通。违反规则的会标红并被去掉。"],
          ["⭐", "实时星级", "每点一下星级和通关率都会变化；侧边的色条显示测试机器人最常失败的地方（红色）。"],
          ["▶️", "从这里测试", "从你正在看的位置开始测试（竞技场：从选中的时间点）。返回会直接回到编辑器。"],
          ["🃏", "规则卡", "跑酷/冲刺：最多 2 张——低重力、左右颠倒、夜间奔跑、只有一颗心、越来越快。"],
          ["🧩", "圆环解谜棋盘", "六个棋盘并排挑一个；🔄 换掉一个，🎲 换六个新的。"],
          ["🕘", "版本", "每次保存会保留最近 5 个：在 📁 我的游戏里点 🕘 打开以前的版本。"] ] },
        { icon: "💡", h: "8. 做出受欢迎游戏的小贴士", tips: [
          "从普通开始，试玩两次，再一次只调一个滑块。",
          "通关率约 40–70% 最公平：难到让人想再来一局。",
          "金币就是乐趣：金币越多越有追逐感。",
          "标题要一看就懂：「熔岩冲刺」「冰之迷宫 3」。",
          "分享链接、挑战好友——游玩和点赞越多，你的游戏在街机厅排得越靠前。",
          "目前游戏还不发放 ARCL；游玩、点赞和最佳成绩从第一天就开始统计。" ] },
      ],
    },
  },
  tr: {
    tabs: { ad: "AGENT DIMENSION", studio: "Studio Lite" }, title: "Nasıl kullanılır", open: "Aç", close: "Kapat", more: "Daha fazla",
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
          ["🎮", "ARCIRCLE Studio", "Kendi oyunlarını yap — Studio Lite rehberine bak."],
          ["📚", "Ajan Akademisi", "Dersler, yakında."] ] },
        { icon: "🏟️", h: "5. Ajan Arenası", steps: [
          ["❓", "Nasıl oynanır", "7 soru, her biri 15 saniye. Hızlı ve doğru olan en çok puanı alır."],
          ["🤖", "Ajanının yardımı", "Her turda bir kez ajanın bir yanlış cevabı kaldırır (50 : 50)."],
          ["⏰", "Arena saati", "Seul saatiyle 12:00 ve 21:00'de (birer saat) puanlar iki kat."],
          ["🏆", "Pano", "Günde 3 tur; kusursuz tur +200. Haftanın en keskin ajanları panoda. Burada ARCL yok — şan için."] ],
          tips: ["Arena ve görevler için ajan gerekir. Şehri gezmek ve Studio için gerekmez."] },
      ],
    },
    studio: {
      title: "ARCIRCLE Studio Lite rehberi",
      lead: "Kod yazmadan 5 adımda kendi oyununu yap. Şablon seç, görünüm seç, zorluğu ayarla, dene, yayınla. Sonra herkes oynayabilir, beğenebilir ve rekorunu geçmeye çalışabilir.",
      parts: [
        { icon: "🚪", h: "1. Studio'yu aç", steps: [
          ["🏙️", "Nexus Şehri'ne git", "Meydanın doğusundaki Kale'nin kapısından gir."],
          ["🎮", "Studio binası", "ARCIRCLE Studio'ya (neon kale) yürü ve dokun. Kapısındaki pano en çok oynanan oyunları gösterir."],
          ["👛", "Saklamak için giriş", "Misafir olarak her şeyi deneyebilirsin; kaydetmek ve yayınlamak için cüzdanla giriş yap."] ],
          tips: ["Üstte üç sekme: 🛠️ Oluştur · 📁 Oyunlarım (taslaklar ve yayınlananlar) · 🕹️ Creator Arcade (herkesin oyunları)."] },
        { icon: "🛠️", h: "2. 5 adımda oyun yap", steps: [
          ["📄", "Şablon", "Gökyüzü Koşucusu, Sonsuz Koşu, Arena Hayatta Kalma, Halka Bulmacası, Gökyüzü Tırmanışı ya da Kule Savunması seç (aşağıda). Bir başlık ver (24 harfe kadar). Fikrin mi yok? Tek cümle yaz — \"bol paralı hızlı bir orman koşusu\" — ajanın tüm oyunu taslak olarak hazırlar (günde 10)."],
          ["🎨", "Tema", "Görünümü seç: Neon Şehir, Orman, Buz Zirveleri, Lav Çekirdeği ya da Şeker Gökyüzü. 3B önizleme anında değişir."],
          ["📊", "Zorluk", "Kolay, Normal, Zor ya da Aşırı'ya dokun. Her birinin altında yıldızları (1 kolay … 5 acımasız) ve 40 test botunun geçme oranı görünür. Uzunluğu da seç. Daha fazla kontrol? ⚙️ Gelişmiş ayarlarda her kaydırıcı, 🎲 Yeni düzen ile yeni bir dizilim."],
          ["▶️", "Dene", "▶ Test oyunu ile kendin oyna. Deneme sayılmaz, istediğin kadar dene."],
          ["🚀", "Yayınla", "💾 Kaydet taslak olarak saklar (12'ye kadar). Yayınla, oyunu herkes için Creator Arcade'na koyar. Sonra 🔗 Bağlantıyı kopyala ile paylaş."] ],
          tips: ["Geri / İleri ile ya da adım numaralarına dokunarak istediğin zaman adımlar arasında geçebilirsin.", "Bir şeyi değiştirdikçe önizleme ve yıldızlar anında güncellenir — her dokunuşta denemene gerek yok."] },
        { icon: "🎮", h: "3. Altı şablon", steps: [
          ["🏃", "Gökyüzü Koşucusu", "3 şeritte bitişe koş. Duvarlardan şerit değiştirerek kaç, boşlukları atla, lazerlerin altından kay, paraları topla. 3 can."],
          ["♾️", "Sonsuz Koşu", "Bitişi olmayan aynı koşu: sürekli hızlanır. Canların bitmeden ne kadar uzağa gidebilirsin?"],
          ["🛸", "Arena Hayatta Kalma", "Yukarıdan görülen yuvarlak bir arena. Kenardan dronlar gelir — dronlardan, büyük dronlardan ve lazer taramalarından kaç, para topla ve süre bitene kadar dayan."],
          ["💍", "Halka Bulmacası", "Kendi tahtanda INFINITY RINGS. Bir halkaya dokunup düşür; tahtayı olabildiğince az hamlede (par) temizle."],
          ["🧗", "Gökyüzü Tırmanışı", "Yandan görülen bir kule. Kendiliğinden zıplarsın — sağa sola yönlen (kenarlar birbirine bağlı), platformlara kon, yaylarla uç, dikenlerden kaç ve zirveye ulaş."],
          ["🛡️", "Kule Savunması", "Düşmanlar geçitten kristaline giden yolu yürür. Bir yere dokunup Şimşek, Ayaz ya da Top kulesi kur; yükseltmek ya da satmak için kuleye dokun. Her dalgayı tut — 10 can."] ] },
        { icon: "🕹️", h: "4. Kontroller", steps: [
          ["📱", "Koşucu ve Hücum (telefon)", "Şerit için sola/sağa kaydır · zıplamak için yukarı kaydır ya da dokun · kaymak için aşağı kaydır."],
          ["⌨️", "Koşucu ve Hücum (bilgisayar)", "Şerit için ← → ya da A D · zıplamak için ↑, Boşluk ya da W · kaymak için ↓ ya da S."],
          ["🛸", "Arena", "Telefon: hareket için ekranda sürükle. Bilgisayar: ok tuşları ya da W A S D."],
          ["💍", "Halka Bulmacası", "Bir halkaya dokun. Takılırsan ipuçları var."],
          ["🧗", "Gökyüzü Tırmanışı", "Telefon: ekranın sol ya da sağ yarısına basılı tut. Bilgisayar: ← → ya da A D."],
          ["🛡️", "Kule Savunması", "Bir yere ya da kuleye dokun. ▶ Sonraki dalga bir sonraki dalgayı erken çağırır (+5 altın)."] ] },
        { icon: "🎚️", h: "5. Kaydırıcılar ne yapar", steps: [
          ["🏃", "Gökyüzü Koşucusu", "Hız · Para · Duvarlar · Atlanacak boşluklar · Altından kayılacak lazerler · Uzunluk (30–90 sn)."],
          ["♾️", "Sonsuz Koşu", "Başlangıç hızı · Para · Duvarlar · Boşluklar · Lazerler · Ne kadar hızlı hızlanır."],
          ["🛸", "Arena Hayatta Kalma", "Dron hızı · Para · Dronlar · Lazer taramaları · Büyük dronlar · Dayanma süresi."],
          ["💍", "Halka Bulmacası", "Halkalar · Çiviler · Kilit halkaları · Buz halkaları · Enerji halkaları · İpuçları. Her tahtanın çözülebilir olduğu kontrol edilir."],
          ["🧗", "Gökyüzü Tırmanışı", "Zıplama · Jetonlar · Hareketli platformlar · Kırılan platformlar · Dikenler · Yükseklik (120–360 m)."],
          ["🛡️", "Kule Savunması", "Düşman hızı · Başlangıç altını · Dalga başına düşman · Tanklar · Koşucular · Dalgalar (5–15)."] ] },
        { icon: "🏆", h: "6. Yayınladıktan sonra", steps: [
          ["📄", "Oyununun sayfası", "Kapağı, yapanı, zorluğu, İlk 10 ve en iyi skorun."],
          ["👻", "Hayaletle yarış", "1. olanın koşusu yanında hayalet olarak oynar — onu geç, senin koşun yeni hayalet olsun."],
          ["⚔️", "Bir arkadaşa meydan oku", "Meydan okuma bağlantısını gönder: arkadaşın geçmesi gereken skoru görür."],
          ["❤️", "Oynanma ve beğeni", "Oynanmalar oyuncu başına 20 saniyede bir sayılır, kendi oynamaların sayılmaz. Beğeniler ve en iyi koşular Creator Arcade'de görünür."],
          ["✏️", "Sonra değiştir", "📁 Oyunlarım'da: Düzenle, Creator Arcade'den kaldır ya da Sil."],
          ["⭐", "Editörün seçimi", "Ekibin yıldızladığı oyunlar Creator Arcade'de ⭐ ile en üstte görünür — harika bir şey yap, sıradaki sen olabilirsin."] ] },
        { icon: "🧱", h: "7. Kendin kur (ikinci seviye)", steps: [
          ["🛠️", "Editörü aç", "3. adımda (Zorluk) 🛠️ Editörü aç'a dokun. Elindeki bölümden başlar, hiçbir şey kaybolmaz — Hızlı başlangıca dön geri alır."],
          ["🧱", "Yerleştir", "Alttan bir araç seç ve haritaya dokun. Koşu ve Dash: duvarlar, hareketli duvarlar, boşluklar, lazerler, yanıp sönen lazerler, jetonlar, kalpler. Arena: zaman çizelgesinden bir an seç, dronun, büyük dronun ya da lazer taramasının geleceği yana dokun, jeton bırak, sütun dik. Gökyüzü Tırmanışı: basamaklar, hareketli ve kırılan platformlar, yaylar, dikenler. Kule Savunması: geçitten kristale yolu çiz, kule yerleri ekle, her dalgayı yaz."],
          ["🧩", "Parçalar", "Hazır parçalar — zikzak, lazer tüneli, dron halkası, merdiven … Birini seç ve başlayacağı yere dokun."],
          ["⬚", "Seç · kopyala · yapıştır · geri al", "Pistlerde bir bölüm seç, sonra Kopyala, Kes, Temizle ya da başka yere Yapıştır. ↩️ ↪️ geri al / yinele (80 adım)."],
          ["❌", "Kırmızı ✕ = sayılmaz", "Yalnızca adil bölümler oynanır: her sırada boş bir şerit, tepki süresi, bir yere tek şey, bağlı bir yol. Kurala uymayan kırmızıyla işaretlenir ve çıkarılır."],
          ["⭐", "Anında yıldızlar", "Yıldızlar ve geçme oranı her dokunuşta değişir; yandaki şerit test botlarının en çok takıldığı yeri (kırmızı) gösterir."],
          ["▶️", "Buradan test et", "Baktığın yerden test et (arena: seçtiğin andan). Geri seni doğrudan editöre getirir."],
          ["🃏", "Kural kartları", "Koşu ve Dash: en fazla 2 — düşük yerçekimi, ters kontroller, gece koşusu, tek kalp, hızlanır."],
          ["🧩", "Halka Bulmacası tahtaları", "Yan yana altı tahtadan birini seç; 🔄 birini değiştirir, 🎲 altı yeni tahta gösterir."],
          ["🕘", "Sürümler", "Her kayıt son 5'i saklar: 📁 Oyunlarım'da 🕘'a dokunup eskisini aç."] ] },
        { icon: "💡", h: "8. Sevilen bir oyun için ipuçları", tips: [
          "Normal'den başla, iki kez dene, sonra kaydırıcıları tek tek ayarla.",
          "Yaklaşık %40–70 geçme oranı adil hissettirir: bir tur daha istetecek kadar zor.",
          "Paralar eğlencedir: daha çok para, daha çok kovalamaca.",
          "Başlık ne olduğunu söylesin: \"Lav Koşusu\", \"Buz Labirenti 3\".",
          "Bağlantını paylaş ve arkadaşlarına meydan oku — oynanma ve beğeniler oyununu Creator Arcade'de yukarı taşır.",
          "Oyunlar için henüz ARCL ödenmiyor; oynanma, beğeni ve en iyi koşular ilk günden sayılıyor." ] },
      ],
    },
  },
};

// the art beside each step (cut from the owner's guide mock-up, images/ui/guide/*.webp), by part and step index; the
// same in every language
window.ARC_AD_GUIDE.art = {
  studio: { head: "studio-head", steps: { "0-0": "portal", "0-1": "studio", "1-0": "tpl", "1-1": "theme", "1-2": "diff", "1-3": "test", "1-4": "publish" } },
  ad: { lead: "robot", steps: { "0-0": "citadel", "0-2": "city", "1-0": "agents", "1-3": "summon", "2-1": "errands" } },
};

// one way to draw it, for the game's window and /game alike (styles: /ad-guide.css). → HTML of the tabs, the lead and the
// parts; open: how many parts start open
window.ARC_AD_GUIDE.html = function (lang, tab, esc, open) {
  var A = window.ARC_AD_GUIDE, D = A[lang] || A.en, G = D[tab], ART = A.art[tab] || { steps: {} }, img = function (n) { return "/images/ui/guide/" + n + ".webp?v=1"; };
  var nOpen = open == null ? 2 : open;
  var head = '<header class="adg-head">' + (ART.head ? '<img class="adg-head-art" src="' + img(ART.head) + '" alt="">' : "") +
    '<small>📖 ' + esc(D.title) + '</small><h2>' + esc(G.title) + '</h2>' +
    '<nav class="adg-tabs">' + ["ad", "studio"].map(function (k) { return '<button type="button" data-adg="' + k + '" class="' + (k === tab ? "on" : "") + '">' + (k === "ad" ? "🤖 " : "🎮 ") + esc(D.tabs[k]) + "</button>"; }).join("") + "</nav></header>";
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

