// world-play.js — ARCIRCLE World (/play): an open little planet you walk as your own character. Every shop opens
// the real tool, Coin City is built from the real ArcPad coins, a rocket leaves the Launchpad when one launches, the
// Burn Furnace flares on a real $ARCIRCLE burn, the Exchange board shows the live price, the Quantum Lab shows the
// launches in superposition, and the sky follows US Eastern time (day and night) and the market's mood.
//
// It opens in space on the round planet and dives through the clouds onto flat ground: the same districts, unrolled
// around the plaza. How it moves: the player stays at the origin and the world slides under them (so the shadow box,
// the sky and the rain stay put). Movement is camera-relative and slides along walls; the camera orbits freely,
// drifts back behind the player and fades out a building that stands in the way.
// Shops open the real page inside the world (an iframe of the same site; arc-nav.js "in-world" hides its chrome).
// The game never signs a transaction: every one is the page's own, confirmed in the player's wallet.
//
// Accounts: "Sign in with wallet" is a free personal_sign (api/_world.mjs). With it, progress is saved to the wallet
// on the server; without it (guest), progress stays in this browser (localStorage "arc.world"). Settings live in
// "arc.world.set". Who's online and how many have visited come from the same API (heartbeat every 50 s).
// Who may enter Game World follows world-lock.js PHASE (the open beta: everyone); the Platform World stays open.
// a computer showing the game in a smaller window or as a phone (play.html, b416): this page is only the frame around it
if (window.__arcShell) await new Promise(() => {});
if (!window.arcWorldLock || !window.arcWorldLock.ok()) {
  document.getElementById("wp-loading").hidden = true;
  if (window.arcWorldLock) await window.arcWorldLock.ask({ cancelHref: "/?skip" });
  else { (window.__arcFrame ? window.top : window).location.replace("/?skip"); await new Promise(() => {}); }
  document.getElementById("wp-loading").hidden = false;
}
const VER = new URL(import.meta.url).search;
// the game's modules (world-all.js): one file in the build, side by side from the source folder
const [K, IS, SHOP, STYLE, HELP, FIGHT, RPG, ZN, QST, SOC, ARCBOT, INBOX, RACE, WARD, DECOR, VFX, GEAR, LOOK, LIFE, WX, MUS, POST, ENV, PART, ICONS, L3D, AMB, HW, DIAG, LIVE, HOL, TRK, CREW, VILL, SFX, PET, CHAT, GV, MV, JG, LANDM, PV, LD] = (await import("./world-all.js")).default;
const { THREE } = K;
// height fog: the fog settles low and thins with height, so the ground fades into the distance while hills, the
// mountains and tall buildings keep their outline (it used to wash the whole horizon white). Patched into three.js's
// own fog chunks once, before anything compiles; the height comes from mvPosition, so every shader with fog has it.
{ const C = THREE.ShaderChunk;
  if (!/vFogH/.test(C.fog_vertex)) {
    C.fog_pars_vertex = C.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth; varying float vFogH;");
    C.fog_vertex = C.fog_vertex.replace("vFogDepth = - mvPosition.z;", "vFogDepth = - mvPosition.z; vFogH = (transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz)).y;");
    C.fog_pars_fragment = C.fog_pars_fragment.replace("varying float vFogDepth;", "varying float vFogDepth; varying float vFogH;");
    C.fog_fragment = C.fog_fragment.replace("gl_FragColor.rgb = mix(", "fogFactor *= 1.0 - 0.5 * smoothstep( 4.0, 60.0, vFogH );\n\tgl_FragColor.rgb = mix(");
  } }
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let land = null; // ARCIRCLE LAND (world-land.js), made once the island is
let jurGame = null, jurOn = false, jurBusy = false; // Jurassic World (openJurassic): GM wallets only for now
let mineGame = null, mineOn = false, mineBusy = false, mineRest = 0; // the ARCL Mine (openMine): up here, read early by the diagnostics and the prompt
// less motion: the device's own setting, or the switch in Settings (arc.world.set → motion: "less")
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || (() => { try { return JSON.parse(localStorage.getItem("arc.world.set") || "{}").motion === "less"; } catch { return false; } })();
if (reduce) document.documentElement.classList.add("wp-less");
const coarse = matchMedia("(pointer: coarse)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lc = (a) => String(a || "").toLowerCase();
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
// the loading screen: the bar, the step it is on, and a little planet whose town rises as each step finishes
// (world-loading3d.js)
const load3d = (() => { try { const h = $("wp-loading"); if (!h || !K.webglOk || !K.webglOk()) return null; const l = L3D.loadingScene(THREE, h, { reduce }); if (l) h.classList.add("has-3d"); return l; } catch { return null; } })();
// (b-st1: the last fifth has steps of its own, named — the bar said "Ready" at 100% while the town was still being
// dressed and the effects warmed, up to ~18 s on a phone)
const FAR_PREBUILD = false; let loadAt = "0%", cxBonus = null, cxTitles = []; /* (cxBonus / cxTitles: the item codex, world-codex.js) */ const loadbar = (k, say) => { loadAt = Math.round(k * 100) + "%" + (say ? " " + say : ""); const b = $("wp-loadbar"); if (b) b.style.width = Math.round(k * 100) + "%"; const n = $("wp-loadpct"); if (n) n.textContent = Math.round(k * 100) + "%";
  if (load3d) load3d.set(k); const sp = document.querySelector("#wp-loading > span"); if (sp) sp.textContent = say || (k >= 1 ? T("Ready") : k >= 0.75 ? T("Calling in the scammers…") : k >= 0.35 ? T("Raising the town…") : T("Building the planet…")); };
const usd = (v) => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v).toLocaleString("en-US");

// ---------------- language: the site's dictionaries (i18n.js); templates are translated, then filled ----------------
const LANG = (() => { try { const l = (window.arcI18n && window.arcI18n.get()) || localStorage.getItem("arcircle.lang") || "en"; return l === "ko" || l === "zh" || l === "tr" ? l : "en"; } catch { return "en"; } })();
if (LANG !== "en") for (let i = 0; i < 30 && !(window.__arcDict && window.__arcDict[LANG]); i++) await sleep(100);
const T = (s, v) => { let t = (LANG !== "en" && window.arcI18n && window.arcI18n.translate(s, LANG)) || s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
// single words stay out of the site-wide dictionary (they'd change other pages): a small map just for the game
const WORDS = {
  ko: { "Launchpad Village": "런치패드 마을", "Utility Village": "유틸리티 마을", "Back to town": "마을로 돌아가기", "Villages": "마을", "Go to {x}": "{x}(으)로 가기", "LAUNCHPAD VILLAGE": "런치패드 마을", "UTILITY VILLAGE": "유틸리티 마을", "Every coin launched on ArcPad has a lot here": "ArcPad에서 런칭한 모든 코인의 부지가 여기 있어요", "ARCIRCLE's utilities: launch, swap, stake, scan": "ARCIRCLE 유틸리티: 런칭, 스왑, 스테이킹, 스캔", "Newest launch": "최신 런칭", "Starter lot": "스타터 부지", "{t} lot": "{t} 부지", "{n} here now": "지금 {n}명", "Jack's Inferno Blade": "잭의 인페르노 블레이드", "Pumpkin King": "호박킹", "Inferno Jack": "인페르노 잭", "Defeated tonight · back tomorrow night": "오늘 밤 처치됨 · 내일 밤 다시 등장", "Wakes at {t} · Lv {n}": "{t}에 깨어나요 · Lv {n}", "Lv {n} at night": "밤에는 Lv {n}", "{x} fell! The top 3 hitters share its reward.": "{x} 쓰러짐! 기여 1~3위가 보상을 받아요.", "Sign in with a wallet so your hits on the Pumpkin Kings count": "지갑으로 로그인해야 호박킹 공격이 기록돼요", "This Pumpkin King is for level {n}+ — your hits won't count": "이 호박킹은 Lv {n} 이상 — 지금은 공격이 기록되지 않아요", "HALLOWEEN · PUMPKIN KING": "할로윈 · 호박킹", "Place {n} against {x}": "{x} 기여 {n}위", "It's in your bag.": "가방에 들어갔어요.", "Great!": "좋아요!", "🎃 The Pumpkin Kings wake in 5 minutes — and rampage!": "🎃 5분 뒤 호박킹이 깨어나 폭주해요!", "🔥 The Pumpkin Kings awaken! Inferno Jack rampages until 05:00 US Eastern.": "🔥 호박킹이 깨어났어요! 인페르노 잭이 미국 동부 05:00까지 폭주해요.", "Halloween · everyone's HP": "할로윈 · 모두의 HP", "Go to the gate": "입구로 이동", "Tower": "타워", "Open it now": "바로 열기", "SURVIVORS ARENA": "서바이버 아레나", "First Survivor": "첫 생존자", "Boss Slayer": "보스 슬레이어", "Crowd Breaker": "군중 파괴자", "Evolver": "진화자", "Arena Master": "아레나 마스터", "Survive 12 minutes": "12분 생존", "Defeat 10 bosses in all": "보스 누적 10마리 처치", "1,000 knock-outs in one run": "한 판에 1,000마리 처치", "Discover 3 evolutions": "진화 3종 발견", "Survive 12 minutes on Hard": "어려움에서 12분 생존", "Survive 12 minutes on Hard 5 times": "어려움에서 12분 생존 5회", "Official partners of ARCIRCLE WORLD": "ARCIRCLE WORLD 공식 파트너", "Finance Hub · Swap · Klik · Disperse": "파이낸스 허브 · Swap · Klik · Disperse", "Buy $ARCIRCLE the easy way with KAIRO Klik.": "KAIRO Klik으로 $ARCIRCLE을 쉽게 사요.", "Partner plot": "파트너 부지", "PARTNER VILLAGE": "파트너 마을", "Finance Hub": "파이낸스 허브", "Official partner": "공식 파트너", "Partner Village": "파트너 마을", "KAIRO Finance Hub": "KAIRO 파이낸스 허브", "Couldn't open it — try again": "열지 못했어요 — 다시 시도해 주세요", "$ARCIRCLE token address (paste it in Swap)": "$ARCIRCLE 토큰 주소 (Swap에 붙여넣기)", "KAIRO's Web3 utilities on Arc, one tap from ARCIRCLE WORLD.": "Arc 위 KAIRO의 Web3 유틸리티를 ARCIRCLE WORLD에서 한 번에.", "More partners are coming to the Partner Village.": "파트너 마을에 더 많은 파트너가 들어올 예정이에요.", "These open kairo.market in a new tab. Check the address and every transaction in your own wallet before you sign.": "kairo.market이 새 탭에서 열려요. 서명하기 전에 주소와 모든 거래 내용을 내 지갑에서 꼭 확인하세요.", "Swap": "스왑", "Klik": "Klik", "Disperse": "Disperse", "Buy and swap $ARCIRCLE and other Arc tokens.": "$ARCIRCLE과 다른 Arc 토큰을 사고 바꿔요.", "Send tokens to many wallets at once — for rewards, tournaments and community events.": "여러 지갑에 토큰을 한 번에 보내요 — 보상, 토너먼트, 커뮤니티 이벤트용.", "Docs": "문서", "Copied": "복사했어요", "Under construction": "건축 중", "AGENT DIMENSION is being built. It opens soon — stay tuned!": "AGENT DIMENSION을 짓고 있어요. 곧 오픈합니다 — 기대해 주세요!", "Coming soon": "곧 공개", "Create your own AI agent — AURORA, ORION or VEX — and let it walk, talk and run errands with you.": "나만의 AI 에이전트(AURORA, ORION, VEX)를 만들고 함께 걷고, 대화하고, 심부름을 맡겨 보세요.", "OK": "확인", "A day (USDC)": "하루 (USDC)", "Add rule": "규칙 추가", "Agent Vault — opening soon": "에이전트 금고 — 곧 오픈", "Allow token": "토큰 허용", "Buy {u} USDC of {t} at ≤ ${p}": "{t} 가격 ≤ ${p}이면 {u} USDC 매수", "Buy {u} USDC of {t} every {h}h": "{h}시간마다 {t} {u} USDC 매수", "Cancelled in your wallet": "지갑에서 취소했어요", "Check the numbers: at most 100 USDC a trade": "숫자를 확인하세요: 거래당 최대 100 USDC", "Enter a token address (0x…)": "토큰 주소를 입력하세요 (0x…)", "Every trade is at most 100 USDC. The fee is paid in $ARCIRCLE from the vault. Money only ever goes back to your own wallet, and every vault step is signed in your wallet.": "모든 거래는 최대 100 USDC입니다. 수수료는 금고의 $ARCIRCLE로 냅니다. 돈은 언제나 내 지갑으로만 돌아오고, 금고의 모든 단계는 내 지갑에서 서명합니다.", "Fee a trade: {f} $ARCIRCLE": "거래당 수수료: {f} $ARCIRCLE", "I already have one": "이미 있어요", "Left today": "오늘 남음", "No USDC in the vault": "금고에 USDC가 없어요", "No rules yet — add one below.": "아직 규칙이 없어요 — 아래에서 추가하세요.", "One vault per wallet, on Arc. You set the limits; the agent can never go over them.": "지갑당 금고 하나, Arc 위에. 한도는 내가 정하고, 에이전트는 절대 넘을 수 없어요.", "Open my vault": "내 금고 열기", "Open your Agent Vault": "에이전트 금고 열기", "Opening your vault…": "금고를 여는 중…", "Per trade": "거래당", "Per trade (USDC)": "거래당 (USDC)", "Per trade: 1–100 USDC; a day at least that; a wait of at least 1 minute": "거래당 1–100 USDC, 하루 한도는 그 이상, 대기는 최소 1분", "Sell {n}% of {t} at ≤ ${p}": "{t} 가격 ≤ ${p}이면 {n}% 매도", "Sell {n}% of {t} at ≥ ${p}": "{t} 가격 ≥ ${p}이면 {n}% 매도", "Sent — it shows here once Arc confirms it": "보냈어요 — Arc에서 확인되면 여기에 표시돼요", "Start the agent": "에이전트 시작", "Stop the agent": "에이전트 멈추기", "Wait between trades (min)": "거래 간 대기 (분)", "Withdraw all USDC": "USDC 전액 출금", "Your agent will trade for you from your own vault on Arc: buy every few hours, buy a dip, take profit, stop loss.": "에이전트가 Arc 위 내 금고에서 대신 거래해요: 몇 시간마다 매수, 하락 시 매수, 익절, 손절.", "Your vault is linked": "금고가 연결됐어요", "agent off": "에이전트 꺼짐", "done": "완료", "dry run: the agent's key isn't set yet": "시험 실행: 에이전트 키가 아직 설정되지 않았어요", "failed": "실패", "on Arcscan": "Arcscan에서 보기", "paused": "일시정지됨", "ready (dry run)": "준비됨 (시험 실행)", "{n} trades": "거래 {n}회", "Buy every few hours": "몇 시간마다 매수", "Buy when the price drops to": "가격이 내려가면 매수", "Take profit at": "익절 가격", "Stop loss at": "손절 가격", "USDC (≤ 100)": "USDC (≤ 100)", "% of the bag": "보유량의 %", "Every … hours": "… 시간마다", "Price ($)": "가격 ($)", "Token address (0x…)": "토큰 주소 (0x…)", "Rules": "규칙", "Activity": "활동", "Vault": "금고", "Remove": "삭제", "Resume": "재개", "Pause": "일시정지", "Agent": "에이전트", "Birth": "탄생", "Pick": "선택", "ID & name": "ID와 이름", "Couldn't check now — it's checked when you create": "지금은 확인할 수 없어요 — 만들 때 확인합니다", "Errands done": "완료한 심부름", "Genesis Founder": "제네시스 파운더", "Level": "레벨", "Meet {n}, my AI agent in ARCIRCLE WORLD's AGENT DIMENSION!": "ARCIRCLE WORLD AGENT DIMENSION의 내 AI 에이전트 {n}를 만나보세요!", "My AI agent": "나의 AI 에이전트", "No errands this week yet — be the first!": "이번 주 심부름이 아직 없어요 — 첫 번째가 되어 보세요!", "No errands yesterday — send me out today!": "어제는 심부름이 없었어요 — 오늘 보내 주세요!", "No free errand slot right now.": "지금은 빈 심부름 슬롯이 없어요.", "Number": "번호", "On my way!": "다녀올게요!", "Send {n}: {j}?": "{n}를 보낼까요: {j}?", "This week's busiest agents": "이번 주 가장 바쁜 에이전트", "Today's briefing": "오늘의 브리핑", "Today: {d} errands and {c} messages left": "오늘: 심부름 {d}회, 대화 {c}회 남음", "Yesterday: {n} errand(s)": "어제: 심부름 {n}회", "{d} errands done": "심부름 {d}회 완료", "A kind AI agent who supports, coordinates and helps your journey in ARCIRCLE WORLD.": "ARCIRCLE WORLD에서 여러분의 여정을 돕고, 챙기고, 조율하는 다정한 AI 에이전트.", "A calm AI agent who plans, operates and finds the next step for your journey in ARCIRCLE WORLD.": "ARCIRCLE WORLD에서 계획하고 운영하며 다음 단계를 찾아 주는 차분한 AI 에이전트.", "A sharp AI agent who scouts, tracks and finds what others miss in ARCIRCLE WORLD.": "ARCIRCLE WORLD에서 정찰하고 추적하며 남들이 놓친 것을 찾아내는 예리한 AI 에이전트.", "{h}h": "{h}시간", "Agent ID": "에이전트 ID", "e.g. nova_01": "예: nova_01", "Pre-launch event": "정식 오픈 사전 이벤트", "Create your AI agent for free before AGENT DIMENSION officially opens. After the opening, creating an agent will cost.": "AGENT DIMENSION 정식 오픈 전, 지금은 AI 에이전트를 무료로 만들 수 있어요. 정식 오픈 후에는 에이전트 생성에 비용이 듭니다.", "Create my agent — free": "무료로 내 에이전트 만들기", "Your agent can't move your funds: anything on-chain will always ask your own wallet first.": "에이전트는 자금을 옮길 수 없어요. 온체인 작업은 항상 내 지갑에서 먼저 승인합니다.", "3–16 letters, numbers or _": "영문 소문자·숫자·_ 3–16자", "@{id} is taken — try another": "@{id}는 이미 사용 중이에요 — 다른 ID를 써 보세요", "Checking…": "확인 중…", "@{id} is free": "@{id} 사용 가능", "That ID can't be used": "이 ID는 쓸 수 없어요", "Pre-launch · free AI agent": "사전 오픈 · AI 에이전트 무료", "{h}h {m}m": "{h}시간 {m}분", "{m}m": "{m}분", "Meet your AI agent": "나만의 AI 에이전트 만나기", "{n} is back! See what it brought": "{n} 귀환! 가져온 것 보기", "Talk to {n}": "{n}와 대화하기", "AGENT DIMENSION": "AGENT DIMENSION", "Lv {n}": "Lv {n}", "Personality": "성격", "e.g. cheerful, loves dinosaurs": "예: 밝고 공룡을 좋아함", "Create my agent": "내 에이전트 만들기", "Sign in to create your agent": "로그인하고 에이전트 만들기", "Your first agent is free. It can't move your funds: anything on-chain will always ask your own wallet first.": "첫 에이전트는 무료입니다. 에이전트는 자금을 옮길 수 없고, 온체인 작업은 항상 내 지갑에서 먼저 승인합니다.", "Pick one of the three to see what it does.": "셋 중 하나를 골라 무엇을 하는지 확인하세요.", "Genesis Lab": "제네시스 랩", "Create your Agent. Give it a Purpose.": "에이전트를 만들고, 목적을 주세요.", "Hi! I'm {n}. Ask me anything about ARCIRCLE World — or send me on an errand.": "안녕하세요! {n}예요. ARCIRCLE World에 대해 뭐든 물어보거나 심부름을 맡겨 주세요.", "Say something to {n}": "{n}에게 말하기", "Send": "보내기", "{n} of {m} messages left today": "오늘 남은 대화 {n}/{m}", "Back!": "귀환!", "{t} left": "{t} 남음", "See what it brought": "가져온 것 보기", "{n}'s specialty +25%": "{n}의 특기 +25%", "On the way": "진행 중", "Send {n} on an errand": "{n}에게 심부름 맡기기", "Errands cost ARCL and bring back materials, not ARCL. {k} errand slot(s) · {d} errands left today.": "심부름은 ARCL이 들고, ARCL이 아니라 재료를 가져옵니다. 심부름 슬롯 {k}개 · 오늘 남은 심부름 {d}회.", "A second slot opens at agent level 5.": "에이전트 레벨 5에 두 번째 슬롯이 열립니다.", "What {n} does": "{n}가 하는 일", "Coming next to AGENT DIMENSION": "AGENT DIMENSION 다음 업데이트", "Agent Academy: skills and new looks as it levels": "에이전트 아카데미: 레벨에 따라 스킬과 새 외형", "Agent Arena: weekly agent battles": "에이전트 아레나: 주간 에이전트 대결", "Web3 tools: token reports, wallet watch, launch drafts — every on-chain step approved in your own wallet": "Web3 도구: 토큰 리포트, 지갑 지켜보기, 발행 초안 — 모든 온체인 단계는 내 지갑에서 승인", "{n} is back!": "{n} 귀환!", "{n}'s specialty: a quarter more": "{n}의 특기: 25% 더", "Level up! Lv {n}": "레벨 업! Lv {n}", "The ore is in your ARCL Mine bag.": "광석은 ARCL 광산 가방에 들어갔어요.", "The materials are in your Jurassic pack.": "재료는 쥬라기 가방에 들어갔어요.", "Great!": "좋아요!", "Something went wrong — try again": "문제가 생겼어요 — 다시 시도해 주세요", "No connection — try again": "연결이 없어요 — 다시 시도해 주세요", "{n} is online!": "{n} 온라인!", "{n} set off — back in {t}": "{n} 출발 — {t} 뒤 귀환", "Saved": "저장됨", "copper ore": "구리 광석", "silver ore": "은 광석", "wood": "나무", "stone": "돌", "fiber": "섬유", "berries": "베리", "hide": "가죽", "bone": "뼈", "meat": "고기", "fang": "송곳니", "Cheerful and kind": "밝고 다정함", "Calm and wise": "차분하고 지혜로움", "Witty and bold": "재치 있고 대담함", "Brave and loyal": "용감하고 충직함", "Curious explorer": "호기심 많은 탐험가", "Caretaker & Coordinator": "돌봄 · 조율", "Strategist & Operator": "전략 · 운영", "Analyst & Hunter": "분석 · 사냥", "A brighter world, together.": "함께, 더 밝은 세상으로.", "From data to a better tomorrow.": "데이터에서 더 나은 내일로.", "See beyond. Find what others miss.": "너머를 보라. 남들이 놓친 것을 찾아라.", "Gathers wood and stone for your camp (+25%)": "캠프에 쓸 나무와 돌을 모아 와요 (+25%)", "Keeps you company and keeps track of things": "곁에 있어 주고 이것저것 챙겨 줘요", "Later: watches your wallet and reminds you of claims": "예정: 지갑을 지켜보고 받을 보상을 알려 줘요", "Mines ore while you're away (+25%)": "접속하지 않은 동안 광석을 캐요 (+25%)", "Plans your next step with you": "다음 할 일을 함께 계획해요", "Later: drafts token launches you approve in your wallet": "예정: 토큰 발행 초안을 만들고, 승인은 내 지갑에서", "Scouts and hunts in Jurassic (+25%)": "쥬라기에서 정찰하고 사냥해요 (+25%)", "Spots scams and tricks with you": "사기와 속임수를 함께 찾아내요", "Later: token safety reports with a public track record": "예정: 공개 실적이 남는 토큰 안전 리포트", "Tell me about yourself": "너에 대해 알려 줘", "Any tips for Jurassic World?": "쥬라기 월드 팁 있어?", "Gather in Jurassic": "쥬라기에서 채집", "Mine ore": "광석 채굴", "Scout & hunt": "정찰 · 사냥", "AI Agent": "AI 에이전트", "Couldn't open your agent — try again": "에이전트를 열지 못했어요 — 다시 시도해 주세요", "A meteor shower in 5 minutes": "5분 뒤 유성우", "A storm in 5 minutes": "5분 뒤 폭풍", "Antidote": "해독제", "Bog Stalker": "늪 추적자", "Bola": "볼라", "Brush the fossil free": "화석을 털어 내세요", "Camps": "캠프", "Couldn't leave a note": "메모를 남기지 못했어요", "Couldn't like it": "좋아요를 누르지 못했어요", "Couldn't tame: {e}": "길들이지 못했어요: {e}", "Dig": "발굴", "Drag across the dirt — gently": "흙 위를 살살 문지르세요", "Eat an antidote, or wait it out away from the water.": "해독제를 먹거나, 물에서 떨어져 기다리세요.", "Fossil": "화석", "Glowing stones will fall on the plain — mine them for gold and silver.": "빛나는 돌이 평원에 떨어져요 — 캐서 금과 은을 얻으세요.", "Great build!": "멋진 건축이에요!", "Hunt together soon?": "곧 같이 사냥할래요?", "It broke free — try again with another bola": "풀려났어요 — 다른 볼라로 다시 시도하세요", "Leave a note": "메모 남기기", "Like": "좋아요", "Lovely camp!": "멋진 캠프예요!", "Meteorite": "운석", "Mud": "진흙", "No camps yet": "아직 캠프가 없어요", "No notes yet — be the first": "아직 메모가 없어요 — 첫 번째가 되어 보세요", "Poison water · swamp boots keep you dry": "독 물 · 늪 장화를 신으면 괜찮아요", "Poison water!": "독 물!", "Poisoned!": "중독됐어요!", "Reed": "갈대", "Reeds": "갈대숲", "See you at the boss hour!": "보스 타임에 만나요!", "Seen · hunted · tamed or hunted 10 times": "발견 · 사냥 · 길들이기 또는 10번 사냥", "Sign in to like and leave notes": "로그인하면 좋아요와 메모를 남길 수 있어요", "Swamp boots": "늪 장화", "Swamp boots keep you dry — make them at the workbench.": "늪 장화를 신으면 괜찮아요 — 작업대에서 만드세요.", "TAMED": "길들임", "Tame": "길들이기", "Tamed!": "길들였어요!", "Taming needs a bola (make one from rope and stone) and 3 berries": "길들이려면 볼라(밧줄과 돌로 제작)와 베리 3개가 필요해요", "Thanks for the fire!": "모닥불 고마워요!", "The Whispering Mire": "속삭이는 늪", "The Whispering Mire, in the west": "서쪽의 속삭이는 늪", "The raptors get restless in the thunder.": "천둥이 치면 랩터들이 날뛰어요.", "The {d} walks with you for this visit.": "{d}이(가) 이번 방문 동안 함께 걸어요.", "Venom": "독", "Visit": "방문", "Visit a camp, leave a note and a like. The most-liked camps this week are on top.": "캠프를 방문해 메모와 좋아요를 남기세요. 이번 주 좋아요가 가장 많은 캠프가 위에 나와요.", "Watch out for raptors!": "랩터 조심하세요!", "bola + 3 berries": "볼라 + 베리 3개", "METEOR SHOWER": "유성우", "STORM": "폭풍", "Mine the fallen stars": "떨어진 별을 캐세요", "Stay near your fire": "모닥불 근처에 있으세요", "Meteor shower": "유성우", "Storm": "폭풍", "A bite! Reel it in": "입질! 낚아 올리세요", "Back on your feet": "다시 일어났어요", "Crews this week": "이번 주 크루", "ENRAGED": "분노", "Go to my camp": "내 캠프로 가기", "Hunt it together!": "함께 사냥하세요!", "Hunt it together: 10 hits each for a hunter's share.": "함께 사냥하세요: 한 사람당 10번 공격하면 사냥꾼 몫을 받아요.", "Hunter": "사냥꾼", "It's here — hunt it together!": "여기 나타났어요 — 함께 사냥하세요!", "Keep going": "계속하기", "Last hit: {n}": "마지막 일격: {n}", "Make armour": "갑옷 만들기", "Nothing to make yet — gather more first": "아직 만들 수 있는 게 없어요 — 먼저 더 모으세요", "Only what I can make now": "지금 만들 수 있는 것만", "PERFECT!": "퍼펙트!", "Ping": "신호", "Seen · hunted · hunted 10 times": "발견 · 사냥 · 10번 사냥", "Sign in to ping the hunters round you": "로그인하면 주변 사냥꾼에게 신호를 보낼 수 있어요", "Take me there": "바로 가기", "WEAK SPOT": "약점", "Watch out for the {d}.": "{d}을(를) 조심하세요.", "Your hits: {n}": "내 타격: {n}", "Your pack, tools and camp are all still yours.": "가방, 도구, 캠프는 모두 그대로예요.", "a hunter's share is yours": "사냥꾼 몫을 받았어요", "for holding the night raid": "밤 습격을 막아 낸 보상", "hits": "회", "{b} is enraged — boss hour!": "{b} 분노 — 보스 타임!", "{b} wakes in 5 minutes": "{b} 5분 뒤 깨어나요", "Dinosaur here!": "여기 공룡!", "Help me!": "도와줘!", "Gather here": "여기로 모여", "Connect your wallet first": "먼저 지갑을 연결하세요", "Creator Market": "크리에이터 마켓", "Low HP!": "HP가 얼마 안 남았어요!", "Drink a potion (the red bottle), or run: the gate and a camp with a fire are safe.": "포션(빨간 병)을 마시거나 도망치세요: 입구와 모닥불이 있는 캠프는 안전해요.", "Knocked out by a {d}": "{d}에게 쓰러졌어요", "Tip: make a spear and hide armour at your workbench, and fight near your campfire — dinosaurs don't follow you in.": "팁: 작업대에서 창과 가죽 갑옷을 만들고, 모닥불 근처에서 싸우세요 — 공룡은 안으로 따라오지 않아요.", "Your hits: {n} / {m} for a share": "내 타격: {n} / {m} (보상 몫까지)", "{n} hunters": "사냥꾼 {n}명", "Not back yet: it returns in {m} min": "아직 돌아오지 않았어요: {m}분 뒤에 돌아와요", "Your sign-in ran out — sign in again and your swings count": "로그인이 만료됐어요 — 다시 로그인하면 타격이 기록돼요", "Platform fee": "플랫폼 수수료", "Planned $ARCL token fee: 2% a transaction (1% $ARCIRCLE buyback & burn, 1% ARCIRCLE WORLD development). In-game ARCL has no fee today.": "$ARCL 토큰 출시 후 예정 수수료: 거래마다 2% (1% $ARCIRCLE 바이백 & 소각, 1% ARCIRCLE WORLD 개발). 지금 게임 내 ARCL은 수수료가 없어요.", "Tap again to buy": "한 번 더 누르면 구매", "Blueprints built by players, for ARCL": "플레이어가 만든 설계도를 ARCL로", "Sign in with your wallet to buy, sell and see your ARCL.": "지갑으로 로그인하면 사고팔고 ARCL을 볼 수 있어요.", "Best-selling": "인기순", "Newest": "최신순", "bricks": "블록", "by {n}": "{n} 제작", "{n} sold": "{n}개 판매", "No blueprints for sale yet — build something on your island and be the first to sell one!": "아직 판매 중인 설계도가 없어요 — 섬에 무언가를 지어 첫 판매자가 되어 보세요!", "Build on my island": "내 섬에 짓기", "Blueprints you buy are kept here for good. Build them on your island as often as you like.": "구매한 설계도는 여기에 영구 보관돼요. 원할 때마다 섬에 지을 수 있어요.", "Sell your island as a blueprint. Buyers build a copy on their own island; yours stays as it is.": "내 섬을 설계도로 판매하세요. 구매자는 자기 섬에 복사본을 짓고, 내 섬은 그대로 남아요.", "e.g. Sky Castle": "예: 하늘 성", "Name": "이름", "Price (ARCL)": "가격 (ARCL)", "to you, 14 days after each sale": "판매 14일 후 나에게", "to the platform": "플랫폼에", "The part a buyer paid with ARCL bought through the Exchange can be settled to $ARCIRCLE; the rest you spend in the game.": "구매자가 교환소에서 구매한 ARCL로 낸 부분은 $ARCIRCLE로 정산할 수 있고, 나머지는 게임 안에서 써요.", "List my island": "내 섬 등록하기", "Your listings": "내 판매 목록", "On hold": "보류 중", "next in {d} days": "다음 지급까지 {d}일", "nothing waiting": "대기 없음", "Settleable": "정산 가능", "to $ARCIRCLE": "$ARCIRCLE로", "Game only": "게임 전용", "spend in the game": "게임에서 사용", "{n} sales so far · {g} ARCL in total": "지금까지 {n}건 판매 · 총 {g} ARCL", "Settle to $ARCIRCLE (at least {m} ARCL)": "$ARCIRCLE로 정산 (최소 {m} ARCL)", "Ask to settle": "정산 요청", "The ARCL is held at once. The team sets the $ARCIRCLE amount and sends it from the team's wallet on Arc; it's closed when the chain shows the transfer.": "ARCL은 바로 보류돼요. 팀이 $ARCIRCLE 금액을 정해 Arc에서 팀 지갑으로 보내고, 체인에서 전송이 확인되면 완료돼요.", "Your settlements": "내 정산", "held {n}": "보류 {n}", "From play": "플레이로 획득", "Bought": "구매", "Every movement": "모든 내역", "Nothing yet — your ARCL movements are written down here from now on.": "아직 없어요 — 이제부터 모든 ARCL 내역이 여기에 기록돼요.", "Earned (all)": "총 획득", "Spent (all)": "총 사용", "Market sales": "마켓 판매", "Settlements: {a} waiting · {b} approved · {c} paid (ARCL) · {n} listings": "정산: 대기 {a} · 승인 {b} · 지급 {c} (ARCL) · 판매 목록 {n}", "Settlement queue": "정산 대기열", "Quote": "견적", "Pay from my wallet": "내 지갑으로 지급", "Nothing waiting.": "대기 중인 항목이 없어요.", "A wallet's ledger": "지갑 원장", "Refund a sale on hold": "보류 중인 판매 환불", "sale id (item_buyer)": "판매 ID (아이템_구매자)", "Couldn't buy it: {e}": "구매하지 못했어요: {e}", "It's yours: {t}": "구매 완료: {t}", "Find it under Mine and build it on your island.": "'내 것'에서 찾아 섬에 지어 보세요.", "Go to your island first (Menu → Island), then sell it from here": "먼저 내 섬으로 가서 (메뉴 → 섬) 여기서 판매하세요", "Build something on your island first": "먼저 섬에 무언가를 지으세요", "Couldn't list it: {e}": "등록하지 못했어요: {e}", "On sale: {t}": "판매 시작: {t}", "Couldn't ask: {e}": "요청하지 못했어요: {e}", "Settlement asked: {n} ARCL": "정산 요청됨: {n} ARCL", "The team will look at it.": "팀이 확인할 거예요.", "How much $ARCIRCLE for this settlement?": "이 정산에 $ARCIRCLE 얼마를 보낼까요?", "Why is it turned down?": "거절 사유는요?", "Refunded": "환불됨", "Settlement paid": "정산 지급 완료", "Sent, but it couldn't be closed: {e}": "보냈지만 완료 처리하지 못했어요: {e}", "Market": "마켓", "Mine": "내 것", "Sell": "판매", "Creator": "크리에이터", "Wallet": "지갑", "Team": "팀", "Owned": "보유 중", "Yours": "내 것", "on sale": "판매 중", "off": "내림", "Take down": "내리기", "Waiting": "대기", "Approved": "승인", "Turned down": "거절됨", "Balance": "잔액", "Earned": "획득", "Spent": "사용", "Held": "보류", "Returned": "반환", "Settled": "정산", "Sale": "판매", "Platform": "플랫폼", "Look up": "조회", "Refund": "환불", "bought": "구매", "creator": "크리에이터", "held": "보류", "ARCL ledger": "ARCL 원장", "The blueprint couldn't open. Try again.": "설계도를 열지 못했어요. 다시 시도하세요.", "The market couldn't open. Try again.": "마켓을 열지 못했어요. 다시 시도하세요.", "This week's hunters": "이번 주 사냥꾼", "No hunts yet this week — be the first!": "이번 주엔 아직 사냥이 없어요 — 첫 번째가 되어 보세요!", "Points: raptor 1 · clawstrider 2 · triceratops 3 · spinosaurus 6 · Alpha Raptor 10 · Thornback Titan 12. No prizes — just the glory.": "점수: 랩터 1 · 클로스트라이더 2 · 트리케라톱스 3 · 스피노사우루스 6 · 알파 랩터 10 · 쏜백 타이탄 12. 상품은 없어요 — 명예뿐이에요.", "Fishing rod": "낚싯대", "Hide armour": "가죽 갑옷", "Heat cloak": "내열 망토", "Ember Basin": "불씨 분지", "Hot ground · a heat cloak keeps you in": "뜨거운 땅 · 내열 망토가 있어야 버텨요", "Your heat cloak keeps the heat off.": "내열 망토가 열기를 막아줘요.", "Too hot!": "너무 뜨거워요!", "Without a heat cloak the basin burns you. Make one at the workbench.": "내열 망토 없이는 분지가 몸을 태워요. 작업대에서 만드세요.", "Lava! Get out of it": "용암이에요! 빨리 나오세요", "Boss hour!": "보스 타임!", "The Alpha Raptor is enraged — hunt it together in the southern ruins.": "알파 랩터가 분노했어요 — 남쪽 유적에서 함께 사냥하세요.", "The Thornback Titan is enraged — hunt it together in the north-west meadow.": "쏜백 타이탄이 분노했어요 — 북서쪽 초원에서 함께 사냥하세요.", "The Alpha Raptor: the ruins in the south": "알파 랩터: 남쪽 유적", "The Thornback Titan: the north-west meadow": "쏜백 타이탄: 북서쪽 초원", "The boss fell! Your hunter's share:": "보스가 쓰러졌어요! 사냥꾼 몫:", "BOSS DOWN": "보스 처치", "Boss hours: 12:00 and 20:00 (Korea time), 30 minutes": "보스 타임: 12:00와 20:00 (한국 시간), 30분", "hunters": "명 사냥 중", "Wave {n} of {m}!": "{m}번 중 {n}번째 습격!", "Raiders at your camp!": "캠프에 습격자가 나타났어요!", "Raptors are coming in three waves — defend your fire.": "랩터가 세 번에 걸쳐 몰려와요 — 모닥불을 지키세요.", "NIGHT RAID": "밤의 습격", "Defend your camp": "캠프를 지키세요", "Camp defended!": "캠프를 지켜냈어요!", "The raptors are gone for tonight.": "오늘 밤 랩터들은 물러갔어요.", "CAMP DEFENDED": "캠프 방어 성공", "Three waves held off": "세 번의 습격을 막아냈어요", "MADE": "제작 완료", "FIRST HUNT": "첫 사냥", "Obsidian": "흑요석", "Sulfur": "유황", "Sulfur vent": "유황 분출구", "Fishing spot": "낚시터", "Fish": "물고기", "Grilled fish": "구운 생선", "Sulfur flare": "유황 조명탄", "Obsidian spear": "흑요석 창", "Codex": "도감", "pts": "점", "Boss down": "보스 처치", "LIVE": "진행 중", "Boss": "보스", "No spear": "창 없음", "Spear": "창", "The plain, in small packs": "평원, 작은 무리", "The east woods, a pack of three": "동쪽 숲, 세 마리 무리", "A herd east of the lake": "호수 동쪽의 무리", "In the lake": "호수 안", "The ruins in the south (boss)": "남쪽 유적 (보스)", "The north-west meadow (boss)": "북서쪽 초원 (보스)", "Clawstrider": "클로스트라이더", "Daily mission done: {m}": "일일 미션 완료: {m}", "Sign in to hunt: your spear, your camp and your pack are saved to your wallet": "사냥하려면 로그인하세요: 창, 캠프, 가방이 지갑에 저장돼요", "Nice — your first materials!": "좋아요 — 첫 재료예요!", "Sign in with your wallet to keep what you gather, build a camp and do the daily missions (300 ARCL each).": "지갑으로 로그인하면 모은 재료가 저장되고, 캠프를 짓고, 일일 미션(각 300 ARCL)을 할 수 있어요.", "Sign in to keep your {n} materials": "로그인해서 재료 {n}개를 저장하세요", "Try it: walk to a tree or a fern and tap attack": "해보세요: 나무나 고사리로 걸어가 공격을 누르세요", "Build a hut at your camp: {a}/40 wood · {b}/12 stone · {c}/10 fiber": "캠프에 오두막 짓기: 나무 {a}/40 · 돌 {b}/12 · 섬유 {c}/10", "Build a bed in your hut — then you can sleep through the night": "오두막에 침대 짓기 — 그러면 밤을 자고 넘길 수 있어요", "Make an iron-hard axe (hardwood from ancient trees, silver ore, rope)": "강철 도끼 만들기 (고대 나무의 단단한 나무, 은광석, 밧줄)", "Hunt a Triceratops (the herd east of the lake)": "트리케라톱스 사냥하기 (호수 동쪽 무리)", "Hunt the Alpha Raptor (boss · the ruins in the south)": "알파 랩터 사냥하기 (보스 · 남쪽 유적)", "Hunt the Thornback Titan (boss · the north-west meadow)": "쏜백 타이탄 사냥하기 (보스 · 북서쪽 초원)", "Every goal done — keep up the daily missions": "모든 목표 완료 — 일일 미션을 이어가세요", "Daily missions": "일일 미션", "Missions": "미션", "Three a day for taking part — never for winning. They start again at midnight (Korea time).": "참여하면 하루 3개 — 이겨야 받는 보상이 아니에요. 자정(한국 시간)에 다시 시작돼요.", "Signed in: what you gather is saved now": "로그인됨: 이제 모은 재료가 저장돼요", "Gather 60 materials": "재료 60개 모으기", "Make or build 3 things": "3가지 만들거나 짓기", "Cook 2 meals": "요리 2번 하기", "Paid": "지급됨", "What you gather now is kept for this visit only. Sign in with your wallet to keep it.": "지금 모은 재료는 이번 방문 동안만 남아요. 지갑으로 로그인하면 저장돼요.", "Chop a tree or pick a fern to try it. Sign in with your wallet to keep what you gather.": "나무를 베거나 고사리를 따서 해보세요. 지갑으로 로그인하면 모은 재료가 저장돼요.", "Later": "나중에", "Sign in": "로그인", "Save your progress": "진행 저장하기", "Your wins and XP so far come with you, and the launch rewards open up.": "지금까지의 승리와 XP가 그대로 저장되고, 런치 보상도 열려요.", "Keep playing as a guest": "게스트로 계속하기", "Move to this village": "이 마을로 이동", "See their island": "주인의 섬 보기", "View on explorer": "익스플로러에서 보기", "Start building": "짓기 시작", "Only the owner": "주인만 가능", "For sale": "판매 중", "{name}'s village": "{name}님의 마을", "See {x}": "{x} 보기", "Visit {x}": "{x} 방문", "Sold": "판매 완료", "sold": "판매 완료", "Held for you": "내 예약 중", "Being bought": "구매 진행 중", "Map of the 20 villages": "마을 20곳 지도", "Town": "마을 광장", "20 villages on the ring around the town. Buy one with $ARCIRCLE and your island stands there for everyone to see.": "마을을 둘러싼 링 위의 마을 20곳. $ARCIRCLE로 하나를 사면 내 섬이 그곳에 세워져 모두가 볼 수 있어요.", "Couldn't load LAND — try again": "LAND를 불러오지 못했어요 — 다시 시도해 주세요", "My village": "내 마을", "Price": "가격", "Owner": "소유자", "Your island (My Island) stands on this village, for everyone in the town to see": "내 섬(My Island)이 이 마을에 세워져 마을의 모두가 볼 수 있어요", "Build bigger: a 64×64 island and up to 20,000 bricks": "더 크게 짓기: 64×64 섬, 벽돌 최대 20,000개", "One village a wallet. Paid to the ARCIRCLE treasury from your own wallet.": "지갑당 마을 1개. 내 지갑에서 ARCIRCLE 트레저리로 직접 결제해요.", "Buy with $ARCIRCLE": "$ARCIRCLE로 구매하기", "Visit the island": "섬 방문하기", "Build my island": "내 섬 짓기", "All villages": "전체 마을", "You already own a village.": "이미 마을을 가지고 있어요.", "Village production and rewards are planned, not part of buying. Nothing here pays out.": "마을 생산과 보상은 계획 중이며 구매에 포함되지 않아요. 여기서 지급되는 것은 없어요.", "Sign in with your wallet first": "먼저 지갑으로 로그인해 주세요", "Holding the village for you…": "마을을 예약하는 중…", "Couldn't hold the village — try again": "마을을 예약하지 못했어요 — 다시 시도해 주세요", "Confirm {n} $ARCIRCLE in your wallet…": "지갑에서 {n} $ARCIRCLE 전송을 승인해 주세요…", "V{n} is yours!": "V{n}이(가) 내 마을이 되었어요!", "Your island now stands on your village. Build it bigger in My Island.": "이제 내 섬이 내 마을에 서 있어요. My Island에서 더 크게 지어 보세요.", "Sent, but the game couldn't confirm it yet — it will once the chain shows it. Open the village again in a minute.": "보냈지만 아직 확인되지 않았어요 — 체인에 나타나면 확인돼요. 1분 뒤 마을을 다시 열어 주세요.", "ARCIRCLE LAND": "ARCIRCLE LAND", "Explorer": "익스플로러", "Copy tx link": "tx 링크 복사", "Transaction link copied": "거래 링크를 복사했어요", "Wallet address copied": "지갑 주소를 복사했어요", "Rewards": "보상 확인", "Copy": "복사", "Send reward": "보상 보내기", "Couldn't load the rewards — try again": "보상 내역을 불러오지 못했어요 — 다시 시도해 주세요", "Total sent": "보낸 총량", "No rewards sent to this player yet.": "이 플레이어에게 보낸 보상이 아직 없어요.", "Only a GM wallet can send rewards": "GM 지갑만 보상을 보낼 수 있어요", "Send a reward": "보상 보내기", "Your $ARCIRCLE": "내 $ARCIRCLE", "Amount": "수량", "Note (optional)": "메모 (선택)", "e.g. Weekly event winner": "예: 주간 이벤트 우승", "Send from my wallet": "내 지갑에서 보내기", "Your wallet sends the tokens directly to this player. The game only notes it, once the transaction is confirmed.": "토큰은 내 지갑에서 이 플레이어에게 바로 보내져요. 게임은 거래가 확인되면 기록만 해요.", "Enter an amount": "수량을 입력해 주세요", "That's more than your $ARCIRCLE": "보유한 $ARCIRCLE보다 많아요", "Wallet connect isn't available here.": "여기서는 지갑 연결을 쓸 수 없어요.", "Switch your wallet to the one you signed in with ({w})": "로그인한 지갑({w})으로 바꿔 주세요", "Confirm the transfer in your wallet…": "지갑에서 전송을 승인해 주세요…", "Sent. Waiting for the transaction to confirm…": "보냈어요. 거래 확인을 기다리는 중…", "Sent, but the game couldn't note it yet: {e}": "보냈지만 게임에 아직 기록하지 못했어요: {e}", "Reward sent: {n} $ARCIRCLE": "보상 전송 완료: {n} $ARCIRCLE", "Cancelled in the wallet": "지갑에서 취소했어요", "The transfer didn't go through: {e}": "전송이 되지 않았어요: {e}", "Close": "닫기", "network": "네트워크", "1 player online now": "지금 1명 접속 중", "Play games, earn rewards, and build your village in ARCIRCLE WORLD!": "게임하고, 보상 받고, ARCIRCLE WORLD에 내 마을을 지어요!", "Adventure": "어드벤처", "Action": "액션", "Cards": "카드", "Puzzle": "퍼즐", "Mining": "채굴", "Strategy": "전략", "Platform": "점프", "Rhythm": "리듬", "3× EXP potions": "경험치 3배 물약", "Launch bonus": "런칭 보너스", "Claim all gifts": "선물 모두 받기", "Inventory": "인벤토리", "You joined {name}'s invite!": "{name}님의 초대에 참여했어요!", "a friend": "친구", "Reach level {n} and you both get {a} ARCL and a dinosaur egg.": "레벨 {n}이 되면 둘 다 {a} ARCL과 공룡알을 받아요.", "Invite reward!": "초대 보상!", "+{a} ARCL and a dinosaur egg in the Hatchery — your friend got theirs too.": "+{a} ARCL과 공룡알이 부화장에 — 친구도 똑같이 받았어요.", "Sign in with your wallet so your invites count (the link works either way).": "지갑으로 로그인해야 초대가 집계돼요 (링크는 어느 쪽이든 작동해요).", "Your invites count from level {n} — you're level {l}.": "초대는 레벨 {n}부터 집계돼요 — 현재 레벨 {l}.", "Invite friends": "친구 초대", "When a friend you invite reaches level {n}, you both get:": "초대한 친구가 레벨 {n}이 되면 둘 다 받아요:", "Each of you, straight into your ARCL balance.": "각자, ARCL 잔액으로 바로.", "A dinosaur egg": "공룡알", "Each of you: its grade is rolled like a wild egg's — even Legendary.": "각자: 등급은 야생 알처럼 랜덤 — 레전드도 나와요.", "You joined {name}'s invite": "{name}님의 초대로 참여함", "level {n} for the reward": "보상까지 레벨 {n}", "Friends you invited": "내가 초대한 친구", "Rewarded": "보상 완료", "No one yet. Send your link to a friend!": "아직 없어요. 친구에게 링크를 보내 보세요!", "A friend counts when they're new (level 3 or lower) when they join. Rewards for up to {d} friends a day and {c} in all; your friend always gets theirs.": "친구는 참여할 때 새 계정(레벨 3 이하)이어야 해요. 보상은 하루 {d}명, 총 {c}명까지; 친구는 항상 받아요.", "Invite link copied": "초대 링크를 복사했어요", "Come play ARCIRCLE World with me! 🌍 Raise dinosaurs, play the Game Village, build your island.": "ARCIRCLE World에서 같이 놀아요! 🌍 공룡을 키우고, 게임 빌리지에서 놀고, 내 섬을 지어요.", "Go back to the town first": "먼저 마을로 돌아가세요", "Leave this game first": "먼저 이 게임에서 나가세요", "Couldn't start it: {e}": "시작하지 못했어요: {e}", "GAMES": "게임", "{n} games in ARCIRCLE World — pick one and go.": "ARCIRCLE World의 게임 {n}개 — 골라서 바로 가요.", "Play": "플레이", "ARCL you've earned from play today, and the day's limit": "오늘 플레이로 번 ARCL과 하루 한도", "Sign in with your wallet to earn ARCL from the games.": "지갑으로 로그인하면 게임에서 ARCL을 벌 수 있어요.", "Friends online": "접속 중인 친구", "Sign in to see your friends.": "로그인하면 친구가 보여요.", "in town": "마을에 있음", "No friends online right now.": "지금 접속한 친구가 없어요.", "{n} players online now": "지금 {n}명 접속 중", "New player guide": "신규 플레이어 가이드", "Your first five minutes, step by step": "처음 5분, 한 단계씩", "You both get 1,000 ARCL and a dinosaur egg": "둘 다 1,000 ARCL과 공룡알을 받아요", "Create your character": "캐릭터 만들기", "Your look and your name — done!": "외모와 이름 — 완료!", "Quick guide": "짧은 가이드", "Move, jump, attack and talk. The controls are in Menu → Controls.": "이동, 점프, 공격, 대화. 조작법은 메뉴 → 조작법에 있어요.", "Launch rewards": "런칭 보상", "An Advanced egg, five 3× EXP potions and 5,000 ARCL": "고급 알, 경험치 3배 물약 5개, 5,000 ARCL", "Sign in": "로그인", "Your first egg": "첫 공룡알", "Sign in with your wallet to raise a dinosaur": "지갑으로 로그인하면 공룡을 키울 수 있어요", "Pick it up in Jurassic World and care for it for 3 days.": "쥬라기 월드에서 주워 3일 동안 돌봐 주세요.", "Play your first game": "첫 게임 해보기", "Survivors, poker, puzzles, the mine… Try one!": "서바이버, 포커, 퍼즐, 광산… 하나 해 보세요!", "Games": "게임", "Your first 5 minutes": "처음 5분", "{n} of {m} done — one smooth path to your first game.": "{m}개 중 {n}개 완료 — 첫 게임까지 한 번에.", "All done — have fun out there!": "모두 완료 — 즐겁게 플레이하세요!", "Rewards": "보상", "Couldn't open the share card": "공유 카드를 열지 못했어요", "Raise · Ride · Survive": "키우기 · 타기 · 생존", "Dinosaur eggs, a companion and XP": "공룡알, 동료, 경험치", "Survive 12 minutes": "12분 버티기", "Up to 3,000 ARCL a run · 3 paid runs a day": "한 판 최대 3,000 ARCL · 하루 보상 3판", "Hold'em · Blackjack · free chips": "홀덤 · 블랙잭 · 무료 칩", "300 ARCL a daily mission (never for winning)": "데일리 미션당 300 ARCL (승리 보상 아님)", "Ring puzzles · daily boards": "링 퍼즐 · 데일리 보드", "100 ARCL a new star": "새 별마다 100 ARCL", "Mine · Collect": "채굴 · 수집", "10–10,000 ARCL a rock": "바위 하나 10–10,000 ARCL", "Tower defence": "타워 디펜스", "5 ARCL a wave · up to 150 a day": "웨이브당 5 ARCL · 하루 최대 150", "Jump to the crown": "왕관까지 점프", "3,000 ARCL at the crown, once a day": "왕관 도달 시 3,000 ARCL, 하루 한 번", "Rhythm game": "리듬 게임", "World XP": "월드 경험치", "Share card": "공유 카드", "Share on X": "X에 공유", "Save": "저장", "Copy link": "링크 복사", "Pick X in the share sheet: the picture goes with your post.": "공유 창에서 X를 고르세요: 사진이 함께 올라가요.", "X opens with your words and link; the picture is saved for you to attach.": "X가 글과 링크로 열리고, 사진은 첨부할 수 있게 저장돼요.", "Your link carries your invite: a friend who joins and reaches level 5 gets you both a reward.": "내 링크에는 초대가 담겨 있어요: 친구가 참여해 레벨 5가 되면 둘 다 보상을 받아요.", "Couldn't make the picture — try again": "사진을 만들지 못했어요 — 다시 시도해 주세요", "Link copied": "링크를 복사했어요", "Your invite link": "내 초대 링크", "Copy": "복사", "Share": "공유", "Today": "오늘", "Go there": "거기로 가기", "Chat and friends": "채팅과 친구", "Close": "닫기", "Controls": "조작법", "Jurassic World": "쥬라기 월드", "Welcome Week": "웰컴 위크", "Starter Package": "스타터 패키지", "ARCL Shop": "ARCL 상점", "Claim": "받기", "Official launch": "공식 런칭", "Launch": "런칭", "Couldn't load the launch gift — try again": "런칭 선물을 불러오지 못했어요 — 다시 시도해 주세요", "The launch gift opens soon": "런칭 선물이 곧 열려요", "The launch week is over": "런칭 주간이 끝났어요", "Sign in with your wallet to take it": "받으려면 지갑으로 로그인하세요", "Taken — thank you for playing!": "받았어요 — 함께해 주셔서 고마워요!", "Reach level {n} to take it (you're level {l})": "레벨 {n}이 되면 받을 수 있어요 (현재 레벨 {l})", "We're officially live!": "공식 런칭했어요!", "Thank you for building this world with us. A launch gift for every player, this week only.": "이 세계를 함께 만들어 주셔서 고마워요. 이번 주에만, 모든 플레이어에게 런칭 선물을 드려요.", "An Advanced dinosaur egg": "고급 공룡알", "Care for it 3 days in Jurassic World's Hatchery, then raise it.": "쥬라기 월드 부화장에서 3일 돌본 뒤 키워 보세요.", "{n} × 3× EXP potions": "경험치 3배 물약 {n}개", "Each one: 3× EXP for {m} minutes. Use them when you like.": "하나당 {m}분 동안 경험치 3배. 원할 때 사용하세요.", "Straight into your ARCL balance.": "ARCL 잔액으로 바로 들어가요.", "Take the launch gift": "런칭 선물 받기", "3× EXP on: {t}": "경험치 3배 진행 중: {t}", "No potion running": "사용 중인 물약 없음", "Add an hour": "1시간 추가", "Drink one": "하나 마시기", "One gift per account during the launch week. New accounts: from level {n}.": "런칭 주간 동안 계정당 1회. 새 계정은 레벨 {n}부터.", "Couldn't take the gift: {e}": "선물을 받지 못했어요: {e}", "network": "네트워크", "Launch gift taken!": "런칭 선물을 받았어요!", "+{a} ARCL · {n} potions · an Advanced egg in the Hatchery": "+{a} ARCL · 물약 {n}개 · 부화장에 고급 알", "Couldn't use it: {e}": "사용하지 못했어요: {e}", "3× EXP for an hour!": "1시간 동안 경험치 3배!", "Sleep until morning": "아침까지 자기", "Cook": "요리", "Good morning!": "좋은 아침이에요!", "You slept through the night. HP full.": "밤새 푹 잤어요. HP가 가득 찼어요.", "the connection timed out — try again": "연결 시간이 초과됐어요 — 다시 시도해 주세요", "One moment…": "잠시만요…", "Move to a free spot in your camp": "캠프의 빈 자리로 옮겨 주세요", "A rare egg is out in Jurassic World · {t} left": "쥬라기 월드에 희귀한 알 출현 · {t} 남음", "Egg care open · {t} left": "알 돌봄 시간 · {t} 남음", "Step into the Jurassic World portal": "쥬라기 월드 포털로 들어가세요", "Your egg is ready to hatch!": "알이 부화할 준비가 됐어요!", "Your first egg is waiting in Jurassic World": "쥬라기 월드에서 첫 번째 알이 기다려요", "The Hatchery didn't open — try again later.": "부화장을 열지 못했어요 — 잠시 후 다시 시도해 주세요.", "{who} hit a ROYAL FLUSH at ARCIA POKER LOUNGE!": "{who}님이 ARCIA 포커 라운지에서 로열 플러시를 터뜨렸어요!", "Enter ARCIA Poker Lounge": "ARCIA 포커 라운지 입장", "The poker lounge couldn't load. Refresh the page and try again.": "포커 라운지를 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.", "The poker lounge couldn't open": "포커 라운지를 열지 못했어요", "Texas Hold'em · walk in to play": "텍사스 홀덤 · 들어가서 플레이", "That challenge's board couldn't be found": "그 도전 퍼즐을 찾을 수 없어요", "Play INFINITY RINGS": "인피니티 링 플레이", "INFINITY RINGS couldn't load. Refresh the page and try again.": "인피니티 링을 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 해 보세요.", "INFINITY RINGS couldn't start": "인피니티 링을 시작하지 못했어요", "Ring puzzle · walk in to play": "링 퍼즐 · 들어가서 플레이", "Enter Survivors Arena": "서바이버즈 아레나 입장", "Survivors Arena couldn't load. Refresh the page and try again.": "서바이버즈 아레나를 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 해 보세요.", "Survivors Arena couldn't start": "서바이버즈 아레나를 시작하지 못했어요", "Survive 12 minutes · walk in to play": "12분 생존 · 들어가서 플레이", "Exchange": "교환", "Connect your wallet to exchange": "교환하려면 지갑을 연결하세요", "Waiting": "대기 중", "Done": "완료", "Turned down": "거절됨", "Cancelled": "취소됨", "My requests": "내 신청", "Team queue": "처리 대기열", "You give": "보내는 수량", "You get": "받는 수량", "Balance": "잔액", "Amount": "수량", "Set by the team": "팀이 시세를 보고 결정", "The least is {n}": "최소 {n}", "The most at once is {n}": "한 번에 최대 {n}", "More than your balance": "잔액보다 많아요", "Paste the transaction hash of your transfer": "보낸 거래의 트랜잭션 해시를 붙여넣으세요", "Enter how much $ARCL to exchange and send the request.": "교환할 $ARCL 수량을 입력하고 신청하세요.", "Your $ARCL is held right away, so it can't be spent twice.": "신청하면 $ARCL이 바로 보관돼서 중복으로 쓸 수 없어요.", "The team compares both markets and sends you $ARCIRCLE on Arc.": "팀이 두 시세를 비교해 Arc에서 $ARCIRCLE을 보내드려요.", "Send $ARCIRCLE to the exchange desk on Arc (address below).": "Arc에서 교환 데스크(아래 주소)로 $ARCIRCLE을 보내세요.", "Paste the transaction hash and enter the amount you sent.": "트랜잭션 해시를 붙여넣고 보낸 수량을 입력하세요.", "The team compares both markets and credits your $ARCL.": "팀이 두 시세를 비교해 $ARCL을 넣어드려요.", "Switch direction": "방향 바꾸기", "Exchange desk on Arc": "Arc 교환 데스크", "Copy": "복사", "Transaction hash 0x…": "트랜잭션 해시 0x…", "Request exchange": "교환 신청", "How it works": "이용 방법", "For now each request is settled by hand at a rate set from both markets. An automatic rate and instant exchange are coming.": "지금은 두 시세를 기준으로 팀이 직접 처리해요. 자동 시세와 즉시 교환은 곧 추가돼요.", "No requests yet": "아직 신청 내역이 없어요", "Received": "받음", "Cancel": "취소", "Loading…": "불러오는 중…", "Give ({x})": "지급 ({x})", "Your Arc tx 0x…": "보낸 Arc tx 0x…", "Note (optional)": "메모 (선택)", "Settle": "처리 완료", "Couldn't send the request: {e}": "신청하지 못했어요: {e}", "Request sent. The team will settle it soon.": "신청했어요. 팀이 곧 처리해 드려요.", "Couldn't cancel: {e}": "취소하지 못했어요: {e}", "Cancelled: your $ARCL is back": "취소됐어요: $ARCL이 돌아왔어요", "Enter how much was given": "지급한 수량을 입력하세요", "Settled": "처리 완료", "Address copied": "주소를 복사했어요", "The exchange couldn't open. Try again.": "교환 창을 열지 못했어요. 다시 시도해 주세요.", "It's starting to rain": "비가 내리기 시작해요", "Night falls: raptors hunt farther. A campfire keeps your camp safe.": "밤이 됐어요: 랩터가 더 멀리서 사냥해요. 모닥불이 있으면 캠프가 안전해요.", "The sun is up. The plains are calmer.": "해가 떴어요. 초원이 조용해졌어요.", "Day": "낮", "Dusk": "해질녘", "Night": "밤", "Dawn": "새벽", "You can rest again in {s} s": "{s}초 후에 다시 쉴 수 있어요", "You're already rested": "이미 충분히 쉬었어요", "Rested: HP full": "휴식 완료: HP 가득", "Rest": "휴식", "Welcome to Jurassic World": "쥬라기 월드에 오신 걸 환영해요", "How survival works": "생존 기본 안내", "Your weapons stay in town": "마을 무기는 여기서 쓸 수 없어요", "Your ARCIRCLE World weapons don't work here. You start with bare hands, and everything you use, you make.": "ARCIRCLE 월드의 무기는 여기서 사용할 수 없어요. 맨손으로 시작해서, 쓸 것은 모두 직접 만들어요.", "Gather first": "먼저 모으세요", "Chop trees for wood, mine rocks for stone and flint, pick ferns and bushes for fiber. Walk up and tap attack.": "나무를 베면 나무, 바위를 캐면 돌·부싯돌, 고사리·덤불을 따면 섬유가 나와요. 가까이 가서 공격 버튼을 누르세요.", "Build a workbench": "작업대를 지으세요", "In your camp tap Build and make a workbench (20 wood, 10 stone). Then make an axe and a spear from your pack.": "내 캠프에서 짓기를 눌러 작업대(나무 20, 돌 10)를 지으세요. 그다음 가방에서 도끼와 창을 만들어요.", "Mind the dinosaurs": "공룡을 조심하세요", "They bite back. Your camp and the gate are safe. Tap a dinosaur to see its level and HP.": "공룡은 반격해요. 캠프와 포털 근처는 안전해요. 공룡을 탭하면 레벨과 HP가 보여요.", "Got it, let's survive": "알겠어요, 시작!", "Tips": "꿀팁", "Tips for today": "오늘의 꿀팁", "Let's play": "시작하기", "Lock on": "타겟 고정", "Tap the crosshair button (or Tab) to lock onto the nearest scammer. Your attacks follow it.": "조준 버튼(또는 Tab)을 누르면 가장 가까운 스캐머를 고정해요. 공격이 그 대상을 따라가요.", "The tab on the right edge hides the screen's buttons so you can see more of the world.": "오른쪽 가장자리 탭을 누르면 화면 버튼이 숨겨져 세상을 더 넓게 볼 수 있어요.", "ARCL Mine": "ARCL 광산", "Every rock you break in the mine pays ARCL and XP. A better pickaxe needs fewer hits.": "광산에서 깨는 돌마다 ARCL과 XP를 받아요. 좋은 곡괭이일수록 더 적게 쳐도 돼요.", "Daily gifts": "매일 선물", "Open Gifts every day: new players get seven days of rewards.": "매일 선물을 열어보세요: 신규 유저는 7일 동안 보상을 받아요.", "Potions": "포션", "Tap the bottle buttons (or keys 4 and 5) to drink HP and SP potions in the middle of a fight.": "물병 버튼(또는 4, 5키)으로 전투 중에 HP·SP 포션을 마실 수 있어요.", "Dodge": "회피", "Dodge (K) through an attack to take no damage, then hit back.": "공격 순간 회피(K)하면 피해를 받지 않아요. 그리고 반격하세요.", "Hatch a pet egg from Pets: a pet adds XP, luck and help in fights.": "펫에서 알을 부화시켜 보세요: 펫은 XP, 행운, 전투 도움을 줘요.", "Game Village": "게임 마을", "Coin Jump, AC Defense and more mini-games wait in the Game Village.": "게임 마을에서 코인 점프, AC 디펜스 등 미니게임을 즐겨보세요.", "Your island": "나만의 섬", "Build your own island: place bricks and decorate it your way.": "나만의 섬을 지어보세요: 블록을 놓고 마음대로 꾸며요.", "Weekend 2×": "주말 2배", "Saturdays and Sundays (Seoul time) give double XP and double ARCL from play.": "토요일과 일요일(서울 시간)에는 XP와 플레이 ARCL이 2배예요.", "The map": "지도", "Open the map (M) to find hunting grounds, bosses and portals.": "지도(M)를 열면 사냥터, 보스, 포털을 찾을 수 있어요.", "Skills": "스킬", "A skill opens at level 10. Swap it with the ⇄ on the skill button.": "레벨 10에 스킬이 열려요. 스킬 버튼의 ⇄로 바꿀 수 있어요.", "Craft": "제작", "Upgrade and salvage your gear in Craft: stronger gear makes bosses easier.": "제작에서 장비를 강화하고 분해하세요: 장비가 강할수록 보스가 쉬워져요.", "Build": "짓기", "Built": "완료", "Turn": "돌리기", "Place": "놓기", "Take down": "철거", "Build at your camp": "캠프에 짓기", "{w}'s camp": "{w}의 캠프", "{n} living here": "{n}명 거주 중", "Couldn't build: {e}": "짓지 못했어요: {e}", "Built: {x}": "지었어요: {x}", "Couldn't join: {e}": "합류하지 못했어요: {e}", "You live at {w}'s camp now": "이제 {w}의 캠프에서 지내요", "Join a camp": "캠프에 합류하기", "Join": "합류", "Every camp spot is taken — join someone's camp from your pack": "캠프 자리가 모두 찼어요 — 가방에서 다른 사람의 캠프에 합류하세요", "Build a workbench at your camp: {a}/20 wood · {b}/10 stone": "캠프에 작업대 짓기: 나무 {a}/20 · 돌 {b}/10", "Build a campfire at your camp": "캠프에 모닥불 짓기", "Hut": "오두막", "Bed": "침대", "Chest": "상자", "Fence": "울타리", "Wall": "벽", "Floor": "바닥", "Torch post": "횃불 기둥", "Boss": "보스", "Quick tour": "빠른 안내", "Skip": "건너뛰기", "Next": "다음", "Got it": "알겠어요", "Hide the buttons": "버튼 숨기기", "Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.": "이 탭을 누르면 화면 버튼이 숨겨져 세상을 더 넓게 볼 수 있어요. 다시 누르면 돌아와요.", "Your goal": "나의 목표", "Your next step is here. Follow it from the first wood to the Alpha Raptor.": "다음 할 일이 여기 나와요. 첫 나무부터 알파 랩터까지 차근차근 따라가 보세요.", "Your pack": "가방", "What you've gathered, your tools, food, and everything you can make.": "모은 재료, 도구, 음식, 그리고 만들 수 있는 모든 것이 여기 있어요.", "Chop, mine and hunt": "베기, 캐기, 사냥", "Walk up to a tree, rock or fern and tap here to chop, mine and gather. Dinosaurs bite back, so keep an eye on your HP!": "나무·바위·고사리 가까이 가서 여기를 누르면 베고, 캐고, 채집해요. 공룡은 반격하니 HP를 잘 보세요!", "Clawstrider": "클로스트라이더", "Thornback Titan": "가시등 타이탄", "Boss · Lv 20": "보스 · Lv 20", "Sign in to gather": "로그인하고 채집하기", "Couldn't gather: {e}": "채집하지 못했어요: {e}", "Nothing this time": "이번엔 아무것도 없어요", "Gathering": "채집", "Couldn't make it: {e}": "만들지 못했어요: {e}", "Made: {x}": "만들었어요: {x}", "You're not hungry": "배고프지 않아요", "Couldn't eat: {e}": "먹지 못했어요: {e}", "Your camp": "내 캠프", "Loading your pack…": "가방을 불러오는 중…", "Gather wood, stone and fiber for a stone axe": "돌도끼를 위해 나무, 돌, 섬유를 모으세요", "Open your pack and make a stone axe": "가방을 열고 돌도끼를 만드세요", "Make a workbench: {a}/20 wood · {b}/10 stone": "작업대 만들기: 나무 {a}/20 · 돌 {b}/10", "Make a spear at the workbench (flint from rocks)": "작업대에서 창 만들기 (부싯돌은 바위에서)", "Make a campfire for your camp": "캠프에 모닥불 만들기", "Hunt a raptor with your spear": "창으로 랩터를 사냥하세요", "Cook meat at your campfire": "모닥불에서 고기를 요리하세요", "Make a copper axe (copper ore from rocks and the ARCL Mine)": "구리 도끼 만들기 (구리 광석은 바위와 ARCL 광산에서)", "Chop an ancient tree for amber · hunt the Alpha Raptor": "고목을 베어 호박을 얻고 · 알파 랩터를 사냥하세요", "Use": "사용", "at the workbench": "작업대에서", "at the campfire": "모닥불에서", "Made": "완료", "Make": "만들기", "Pack": "가방", "Gathering today: {a} / {b}": "오늘 채집: {a} / {b}", "Close": "닫기", "Tools": "도구", "Materials": "재료", "Food": "음식", "Bare hands": "맨손", "Stone axe": "돌도끼", "Copper axe": "구리 도끼", "Iron-hard axe": "강철 도끼", "Spear": "창", "No spear": "창 없음", "Nothing yet: chop trees, pick ferns, mine rocks": "아직 없어요: 나무를 베고, 고사리를 따고, 바위를 캐세요", "Torch": "횃불", "Workbench": "작업대", "Campfire": "모닥불", "Rope": "밧줄", "Cooked meat": "구운 고기", "Wood": "나무", "Hardwood": "단단한 나무", "Stone": "돌", "Flint": "부싯돌", "Clay": "점토", "Fiber": "섬유", "Berries": "열매", "Amber": "호박", "Hide": "가죽", "Bone": "뼈", "Raw meat": "생고기", "Fang": "송곳니", "Copper ore": "구리 광석", "Silver ore": "은 광석", "Gold ore": "금 광석", "Tree": "나무", "Palm": "야자수", "Ancient tree": "고목", "Fern": "고사리", "Bush": "덤불", "Log": "통나무", "Rock": "바위", "Raptor": "랩터", "Triceratops": "트리케라톱스", "Spinosaurus": "스피노사우루스", "Chop": "베기", "Gather": "채집", "Mine": "채광", "Hunt": "사냥", "Mining": "채광", "Jurassic goals": "쥬라기 목표", "WASD move · Shift run · Space jump · J chop / mine · E use · Esc leave": "WASD 이동 · Shift 달리기 · Space 점프 · J 벌목 / 채광 · E 사용 · Esc 나가기", "Alpha Raptor": "알파 랩터", "Boss · Lv 10": "보스 · Lv 10", "Jurassic World": "쥬라기 월드", "Jurassic World · Coming soon": "쥬라기 월드 · 오픈 예정", "Jurassic World is coming soon. The portal opens to everyone at launch.": "쥬라기 월드는 오픈 예정이에요. 오픈하면 모두에게 포털이 열려요.", "Jurassic World couldn't open": "쥬라기 월드를 열지 못했어요", "Back to the village": "마을로 돌아가기", "Village": "마을", "Primeval Plains · GM preview": "원시 초원 · GM 미리보기", "A first look at the land. More dinosaurs, hunting and rewards come next.": "먼저 둘러보는 단계예요. 공룡 추가, 사냥, 보상은 다음에 들어와요.", "WASD move · Shift run · Space jump · drag to look · Esc leave": "WASD 이동 · Shift 달리기 · Space 점프 · 드래그로 시점 · Esc 나가기", "Primeval Plains": "원시 초원", "What should I do next?": "이제 뭘 하면 좋을까?", "{n} ARCL": "{n} ARCL", "A pet egg": "펫 알", "Advanced Pickaxe · 7 days": "고급 곡괭이 · 7일", "The welcome week is over. Thanks for playing!": "웰컴 위크가 끝났어요. 함께해 주셔서 고마워요!", "Day {n}": "{n}일차", "New player gifts": "신규 유저 선물", "Welcome Week": "웰컴 위크", "One gift a day, seven in all. Days off are fine: finish within {n} days.": "하루 한 번, 총 7개의 선물. 쉬는 날이 있어도 괜찮아요: {n}일 안에 받으세요.", "Sign in to claim": "로그인하고 받기", "Claim day {n}": "{n}일차 선물 받기", "Come back tomorrow for day {n}": "{n}일차 선물은 내일 받아요", "Couldn't claim the gift. Try again.": "선물을 받지 못했어요. 다시 시도해 주세요.", "Day {n} gift: {g}": "{n}일차 선물: {g}", "ready in the ARCL Mine": "ARCL 광산에서 사용 가능", "Gifts": "선물", "Ores": "광석", "This week": "이번 주", "Upgrade": "강화", "Each level: 4% fewer hits a rock, up to +10": "단계마다 바위당 타격 4% 감소, 최대 +10", "+1 for": "+1 강화:", "+10, the most": "+10, 최고 단계", "Advanced Pickaxe trial: {t} left": "고급 곡괭이 체험: {t} 남음", "Back to the mine": "일반 광산으로", "Go down to the deep mine (Lv 90+): tougher rocks, more gold": "심층 광산으로 (Lv 90+): 단단한 바위, 더 많은 금", "Ore pieces and gems are kept for signed-in miners. Connect your wallet to collect them.": "광석 조각과 보석은 로그인한 광부에게만 쌓여요. 지갑을 연결해 모아 보세요.", "Every rock that isn't empty gives ore pieces. Use them to upgrade your pickaxe, or smelt them into scrap for your gear.": "꽝이 아닌 바위마다 광석 조각이 나와요. 곡괭이 강화에 쓰거나, 제련해서 장비용 고철로 바꾸세요.", "Copper": "동", "Silver": "은", "Gold": "금", "Smelt {a} → {b} scrap": "{a}개 → 고철 {b} 제련", "Gem codex": "보석 도감", "Sapphire": "사파이어", "Ruby": "루비", "Diamond": "다이아몬드", "Sapphire!": "사파이어!", "Ruby!": "루비!", "Diamond!": "다이아몬드!", "A gem for your codex": "도감에 보석 추가", "Rocks broken: copper {a} · silver {b} · gold {c}": "깬 바위: 동 {a} · 은 {b} · 금 {c}", "ARCL mined this week (Monday to Sunday). The board resets each week.": "이번 주(월~일)에 캔 ARCL 순위예요. 매주 초기화돼요.", "The ARCL Mine": "ARCL 광산", "Gold Rush": "골드 러시", "Deep mine": "심층 광산", "Pickaxe +{n}: 4% fewer hits a rock": "곡괭이 +{n}: 바위당 타격 4% 감소", "+{n} scrap for your gear": "장비용 고철 +{n}", "The deep mine opens at level 90": "심층 광산은 레벨 90부터 열려요", "The deep mine: tougher rocks, more gold": "심층 광산: 단단한 바위, 더 많은 금", "Back in the mine": "일반 광산으로 돌아왔어요", "No one has mined this week yet": "이번 주에 아직 아무도 캐지 않았어요", "Miner": "광부", "Pickaxes · ore · this week": "곡괭이 · 광석 · 이번 주", "the miner": "광부", "ARCL Mine": "ARCL 광산", "Copper, silver and gold rocks · 60 minutes, then a 6-hour rest": "동·은·금 바위 · 60분 채굴 후 6시간 휴식", "Rocks": "바위", "Leave the mine": "광산에서 나가기", "Leave": "나가기", "left": "남음", "ARCL this visit": "이번 채굴 ARCL", "Common": "일반", "Advanced": "고급", "Rare": "레어", "Legendary": "레전드", "Left": "왼쪽", "Right": "오른쪽", "Mine": "채굴", "MINE": "채굴", "A / D move · Space or J mine · Esc leave": "A / D 이동 · Space 또는 J 채굴 · Esc 나가기", "ARCIRCLE WORLD": "ARCIRCLE WORLD", "ARCL MINE": "ARCL 광산", "Demo: connect your wallet to earn ARCL here": "체험 모드: 지갑을 연결하면 여기서 ARCL을 벌 수 있어요", "Today {n} / {m} ARCL": "오늘 {n} / {m} ARCL", "Common Pickaxe": "일반 곡괭이", "Advanced Pickaxe": "고급 곡괭이", "Rare Pickaxe": "레어 곡괭이", "Legendary Pickaxe": "레전드 곡괭이", "{n}% fewer hits a rock": "바위당 타격 {n}% 감소", "rocks {n}% faster": "바위 생성 {n}% 빠름", "Copper in 10–20 hits": "동 바위 10~20번", "In hand": "사용 중", "Owned": "보유", "Pickaxes": "곡괭이", "A better pickaxe breaks rocks in fewer hits, and more rocks turn up in your hour. You always mine with the best one you own.": "좋은 곡괭이일수록 적은 타격으로 바위를 깨고, 1시간 동안 바위가 더 많이 나와요. 항상 보유한 곡괭이 중 가장 좋은 것으로 채굴해요.", "Copper 10–100 · Silver 100–1,000 · Gold 1,000–10,000 ARCL. About 1 rock in 5 is empty. Gold is rare, and a full 10,000 far rarer.": "동 10~100 · 은 100~1,000 · 금 1,000~10,000 ARCL. 바위 5개 중 1개 정도는 꽝이에요. 금은 드물고, 10,000 대박은 훨씬 더 드물어요.", "Close": "닫기", "Check your wallet…": "지갑을 확인하세요…", "Your new pickaxe is in your hands.": "새 곡괭이를 손에 들었어요.", "ARCL (demo, not paid)": "ARCL (체험, 지급 안 됨)", "Gold rocks broken: {n}": "깬 금 바위: {n}개", "Back to the village": "마을로 돌아가기", "Lost the mine's connection. Back to the village.": "광산 연결이 끊겼어요. 마을로 돌아갑니다.", "That rock didn't break: {e}": "바위가 깨지지 않았어요: {e}", "try again": "다시 시도해 주세요", "Empty!": "꽝!", "daily mine limit": "오늘 채굴 한도", "Your hour in the mine is up": "광산 시간 1시간이 끝났어요", "Leaving the mine": "광산에서 나가는 중", "The mine is resting. It opens again in {t}.": "광산이 쉬는 중이에요. {t} 뒤에 다시 열려요.", "The mine couldn't open: {e}": "광산을 열지 못했어요: {e}", "Demo: nothing you mine is paid. Connect your wallet to earn.": "체험 모드: 캔 것은 지급되지 않아요. 지갑을 연결하면 벌 수 있어요.", "{t} left in the mine · rocks hold 10–10,000 ARCL": "광산 남은 시간 {t} · 바위마다 10~10,000 ARCL", "Mining Village": "채굴 마을", "The ARCL Mine · copper, silver, gold": "ARCL 광산 · 동, 은, 금", "Walk in to mine": "들어가서 채굴하기", "Enter the ARCL Mine": "ARCL 광산 입장", "The ARCL Mine couldn't start": "ARCL 광산을 시작하지 못했어요", "The ARCL Mine couldn't load. Refresh the page and try again.": "ARCL 광산을 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.", "ARCL Mine · opens in {t}": "ARCL 광산 · {t} 뒤 열림", Soon: "곧 공개", Colour: "색상", "Hide quests": "퀘스트 숨기기", "Show quests": "퀘스트 보기", "Beat Stomp · your best": "비트 스톰프 · 내 최고 기록", "Weekly prizes: 10,000 · 5,000 · 2,500 ARCL": "주간 상금: 10,000 · 5,000 · 2,500 ARCL", "Start Beat Stomp": "비트 스톰프 시작", "Beat Stomp couldn't start": "비트 스톰프를 시작하지 못했어요", "Wave {n}": "웨이브 {n}", "AC Defense · this week": "AC 디펜스 · 이번 주", "No runs yet — be the first!": "아직 기록이 없어요 — 첫 주인공이 되세요!", "Loading…": "불러오는 중…", "Coin Jump · your best": "코인 점프 · 내 최고 기록", "Islands": "섬", "Right-click": "우클릭", "Adventure log": "모험 일지", "Start Coin Jump": "코인 점프 시작", "Coin Jump couldn't start": "코인 점프를 시작하지 못했어요", "Jump to the crown · walk in to play": "왕관까지 점프 · 들어가서 플레이", "Tower defence · walk in to play": "타워 디펜스 · 들어가서 플레이", "Weekend 2×: double XP and double ARCL from play": "주말 2배: 경험치와 플레이 ARCL이 2배예요", "Streak shield used: you missed a day, but your streak goes on (once a week)": "연속 출석 보호 사용: 하루 빠졌지만 연속 기록이 이어져요 (주 1회)", "a heart (+100 ARCL)": "하트 (+100 ARCL)", "Heart sent — your friend gets 100 ARCL": "하트를 보냈어요 — 친구가 100 ARCL을 받아요", "hearts open at level 5": "하트는 레벨 5부터 보낼 수 있어요", "one heart a day — more tomorrow": "하트는 하루 1번 — 내일 또 보내세요", "they've had 5 hearts today — try tomorrow": "오늘 하트를 5개 받았어요 — 내일 다시 보내세요", "A new village west of the plaza for mini-games. AC Defense is the first tower: walk in and defend the Core.": "광장 서쪽에 미니게임 마을이 생겼어요. 첫 건물은 AC 디펜스 타워: 들어가서 코어를 지키세요.", "Hatch companions from eggs, 27 to collect. Each one follows you and helps in its own way.": "알에서 동료를 부화시키세요. 27종을 모을 수 있고, 저마다 따라다니며 도와줘요.", "Talk with players near you, send 1:1 messages and add friends.": "근처 플레이어와 대화하고, 1:1 메시지를 보내고, 친구를 추가하세요.", "The Game Village": "게임 마을", "Earlier updates": "이전 업데이트", "Friends and chat": "친구와 채팅", "New version — updating…": "새 버전 — 업데이트 중…", "AC Defense couldn't load. Refresh the page and try again.": "AC 디펜스를 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.", "AC Defense couldn't start": "AC 디펜스를 시작하지 못했어요", "Game Village": "게임 마을", "Mini-games · more coming": "미니게임 · 계속 추가돼요", "Tower defence · walk in to play": "타워 디펜스 · 들어가서 플레이", "Enter {x}": "{x} 입장", "AC Defense": "AC 디펜스", "Start AC Defense": "AC 디펜스 시작", "Quit AC Defense first": "먼저 AC 디펜스를 그만두세요", "Getting ready": "준비 중", "Frame limit": "프레임 제한", "Recent messages": "최근 메시지", Recent: "최근", "Nothing yet": "아직 없어요", now: "방금", Bag: "가방", Craft: "제작", Pets: "펫", Build: "건축", Help: "도움말", Bricks: "블록", Colours: "색상", Height: "높이", Trophies: "트로피", Lights: "조명", Plants: "식물", Theme: "테마", Character: "캐릭터", Log: "모험 일지", Village: "마을", Later: "나중에", Pick: "선택", Visit: "방문", Cottage: "오두막", Castle: "성", Palace: "궁전", Music: "음악", Film: "필름", Vivid: "선명", Time: "시간", Now: "지금", Morning: "아침", Noon: "한낮", Dusk: "노을", Night: "밤", Vibration: "진동", Inbox: "알림함", Gifts: "선물", Guestbook: "방명록", Race: "레이스", Finish: "완주", Wardrobe: "옷장", Head: "머리", Face: "얼굴", Neck: "목", Back: "등", Aura: "오라", Lock: "잠금", Unlock: "잠금 해제", Locked: "잠김", power: "전투력", Equip: "장착", Minimap: "미니맵", Show: "표시", On: "켜짐", Reply: "답장", Medium: "중간", Ultra: "최고", "Frame rate": "프레임", Level: "레벨", Friend: "친구", Say: "말하기", GG: "GG", Companions: "동료", "Hi!": "안녕!", Filter: "필터", Sticker: "스티커", Pose: "포즈", None: "없음", Focus: "초점", Off: "끔", Soft: "약하게", Strong: "강하게", Warm: "따뜻하게", Cool: "시원하게", Noir: "흑백", Neon: "네온", Wave: "손 흔들기", Sit: "앉기", Point: "가리키기", Update: "업데이트", Title: "칭호", Hoverboard: "호버보드", Jump: "점프", Mirror: "대칭", Moving: "이동", Menus: "메뉴", Buttons: "버튼", Space: "스페이스", Click: "클릭", Drag: "드래그", Wheel: "휠", Tap: "탭", Move: "이동", Look: "시점", Wave: "인사", No: "아니요", Sit: "앉기", Point: "가리키기", Cheer: "환호", Dance: "춤", Faint: "기절", Controls: "조작 방법", Shop: "상점", Fighting: "전투", Attack: "공격", Layout: "화면 배치", Compact: "PC형", Large: "크게", Skip: "건너뛰기", Quests: "퀘스트", Map: "지도", Menu: "메뉴", Settings: "설정", Graphics: "그래픽", Auto: "자동", High: "높음", Low: "낮음", Language: "언어", Account: "계정", Sound: "사운드", Today: "오늘", Badges: "배지", Name: "이름", "Level up": "레벨 업", online: "접속 중", Player: "플레이어", visited: "방문함", yours: "내 코인", ready: "준비됨", bought: "매수", sold: "매도",
    move: "이동", jump: "점프", run: "달리기", enter: "입장", board: "보드", emote: "감정표현", photo: "사진", map: "지도", help: "도움말", "drag to look": "드래그로 둘러보기",
    attack: "공격", dodge: "회피", skill: "스킬", potions: "물약", read: "읽기", talk: "대화", go: "가기", look: "시점", speed: "가속" },
  zh: { "Launchpad Village": "发射台村", "Utility Village": "工具村", "Back to town": "回到小镇", "Villages": "村庄", "Go to {x}": "前往{x}", "LAUNCHPAD VILLAGE": "发射台村", "UTILITY VILLAGE": "工具村", "Every coin launched on ArcPad has a lot here": "每一枚在 ArcPad 发行的币都在这里有一块地", "ARCIRCLE's utilities: launch, swap, stake, scan": "ARCIRCLE 工具：发行、兑换、质押、扫描", "Newest launch": "最新发行", "Starter lot": "入门地块", "{t} lot": "{t} 地块", "{n} here now": "现在 {n} 人", "Jack's Inferno Blade": "杰克的炼狱之刃", "Pumpkin King": "南瓜王", "Inferno Jack": "炼狱杰克", "Defeated tonight · back tomorrow night": "今晚已被击败 · 明晚再来", "Wakes at {t} · Lv {n}": "{t} 苏醒 · Lv {n}", "Lv {n} at night": "夜晚 Lv {n}", "{x} fell! The top 3 hitters share its reward.": "{x} 倒下了！伤害前 3 名分享奖励。", "Sign in with a wallet so your hits on the Pumpkin Kings count": "用钱包登录，你对南瓜王的伤害才会计入", "This Pumpkin King is for level {n}+ — your hits won't count": "这只南瓜王需要 {n} 级以上——你的伤害不会计入", "HALLOWEEN · PUMPKIN KING": "万圣节 · 南瓜王", "Place {n} against {x}": "{x} 伤害第 {n} 名", "It's in your bag.": "已放入背包。", "Great!": "太棒了！", "🎃 The Pumpkin Kings wake in 5 minutes — and rampage!": "🎃 南瓜王 5 分钟后苏醒——开始暴走！", "🔥 The Pumpkin Kings awaken! Inferno Jack rampages until 05:00 US Eastern.": "🔥 南瓜王苏醒了！炼狱杰克将暴走至美东 05:00。", "Halloween · everyone's HP": "万圣节 · 全员共享血量", "Go to the gate": "前往大门", "Tower": "塔", "Open it now": "立即打开", "SURVIVORS ARENA": "幸存者竞技场", "First Survivor": "首位幸存者", "Boss Slayer": "首领杀手", "Crowd Breaker": "破阵者", "Evolver": "进化者", "Arena Master": "竞技场大师", "Survive 12 minutes": "坚持 12 分钟", "Defeat 10 bosses in all": "累计击败 10 个首领", "1,000 knock-outs in one run": "一局击倒 1,000 只", "Discover 3 evolutions": "发现 3 种进化", "Survive 12 minutes on Hard": "困难模式坚持 12 分钟", "Survive 12 minutes on Hard 5 times": "困难模式坚持 12 分钟 5 次", "Official partners of ARCIRCLE WORLD": "ARCIRCLE WORLD 官方合作伙伴", "Finance Hub · Swap · Klik · Disperse": "金融中心 · Swap · Klik · Disperse", "Buy $ARCIRCLE the easy way with KAIRO Klik.": "用 KAIRO Klik 轻松购买 $ARCIRCLE。", "Partner plot": "合作伙伴地块", "PARTNER VILLAGE": "合作伙伴村", "Finance Hub": "金融中心", "Official partner": "官方合作伙伴", "Partner Village": "合作伙伴村", "KAIRO Finance Hub": "KAIRO 金融中心", "Couldn't open it — try again": "无法打开——请再试一次", "$ARCIRCLE token address (paste it in Swap)": "$ARCIRCLE 代币地址（粘贴到 Swap）", "KAIRO's Web3 utilities on Arc, one tap from ARCIRCLE WORLD.": "Arc 上 KAIRO 的 Web3 工具，在 ARCIRCLE WORLD 一键直达。", "More partners are coming to the Partner Village.": "更多合作伙伴即将入驻合作伙伴村。", "These open kairo.market in a new tab. Check the address and every transaction in your own wallet before you sign.": "将在新标签页打开 kairo.market。签名前请在你自己的钱包中核对地址和每一笔交易。", "Swap": "兑换", "Klik": "Klik", "Disperse": "Disperse", "Buy and swap $ARCIRCLE and other Arc tokens.": "购买和兑换 $ARCIRCLE 及其他 Arc 代币。", "Send tokens to many wallets at once — for rewards, tournaments and community events.": "一次向多个钱包发送代币——用于奖励、锦标赛和社区活动。", "Docs": "文档", "Copied": "已复制", "Under construction": "建设中", "AGENT DIMENSION is being built. It opens soon — stay tuned!": "AGENT DIMENSION 正在建设中，即将开放——敬请期待！", "Coming soon": "即将推出", "Create your own AI agent — AURORA, ORION or VEX — and let it walk, talk and run errands with you.": "创建你自己的 AI 智能体——AURORA、ORION 或 VEX——让它陪你走路、聊天、跑腿。", "OK": "好的", "A day (USDC)": "每天 (USDC)", "Add rule": "添加规则", "Agent Vault — opening soon": "智能体金库——即将开放", "Allow token": "允许代币", "Buy {u} USDC of {t} at ≤ ${p}": "{t} 价格 ≤ ${p} 时买入 {u} USDC", "Buy {u} USDC of {t} every {h}h": "每 {h} 小时买入 {u} USDC 的 {t}", "Cancelled in your wallet": "已在钱包中取消", "Check the numbers: at most 100 USDC a trade": "请检查数字：每笔最多 100 USDC", "Enter a token address (0x…)": "请输入代币地址 (0x…)", "Every trade is at most 100 USDC. The fee is paid in $ARCIRCLE from the vault. Money only ever goes back to your own wallet, and every vault step is signed in your wallet.": "每笔交易最多 100 USDC。手续费从金库以 $ARCIRCLE 支付。资金只会回到你自己的钱包，金库的每一步都在你的钱包里签名。", "Fee a trade: {f} $ARCIRCLE": "每笔手续费：{f} $ARCIRCLE", "I already have one": "我已经有了", "Left today": "今日剩余", "No USDC in the vault": "金库里没有 USDC", "No rules yet — add one below.": "还没有规则——在下面添加。", "One vault per wallet, on Arc. You set the limits; the agent can never go over them.": "每个钱包一个金库，在 Arc 上。限额由你设定，智能体永远不能超过。", "Open my vault": "开设我的金库", "Open your Agent Vault": "开设你的智能体金库", "Opening your vault…": "正在开设金库…", "Per trade": "每笔", "Per trade (USDC)": "每笔 (USDC)", "Per trade: 1–100 USDC; a day at least that; a wait of at least 1 minute": "每笔 1–100 USDC；每天至少同样多；间隔至少 1 分钟", "Sell {n}% of {t} at ≤ ${p}": "{t} 价格 ≤ ${p} 时卖出 {n}%", "Sell {n}% of {t} at ≥ ${p}": "{t} 价格 ≥ ${p} 时卖出 {n}%", "Sent — it shows here once Arc confirms it": "已发送——Arc 确认后会显示在这里", "Start the agent": "启动智能体", "Stop the agent": "停止智能体", "Wait between trades (min)": "交易间隔 (分钟)", "Withdraw all USDC": "提取全部 USDC", "Your agent will trade for you from your own vault on Arc: buy every few hours, buy a dip, take profit, stop loss.": "你的智能体会在 Arc 上你自己的金库里替你交易：定时买入、逢低买入、止盈、止损。", "Your vault is linked": "金库已关联", "agent off": "智能体已关闭", "done": "完成", "dry run: the agent's key isn't set yet": "演练：智能体密钥尚未设置", "failed": "失败", "on Arcscan": "在 Arcscan 查看", "paused": "已暂停", "ready (dry run)": "就绪（演练）", "{n} trades": "{n} 笔交易", "Buy every few hours": "定时买入", "Buy when the price drops to": "价格跌到时买入", "Take profit at": "止盈价格", "Stop loss at": "止损价格", "USDC (≤ 100)": "USDC (≤ 100)", "% of the bag": "持仓的 %", "Every … hours": "每 … 小时", "Price ($)": "价格 ($)", "Token address (0x…)": "代币地址 (0x…)", "Rules": "规则", "Activity": "动态", "Vault": "金库", "Remove": "删除", "Resume": "继续", "Pause": "暂停", "Agent": "智能体", "Birth": "诞生", "Pick": "选择", "ID & name": "ID 和名字", "Couldn't check now — it's checked when you create": "现在无法检查——创建时会再检查", "Errands done": "完成的跑腿", "Genesis Founder": "创世元老", "Level": "等级", "Meet {n}, my AI agent in ARCIRCLE WORLD's AGENT DIMENSION!": "来认识 {n}，我在 ARCIRCLE WORLD AGENT DIMENSION 的 AI 智能体！", "My AI agent": "我的 AI 智能体", "No errands this week yet — be the first!": "本周还没有跑腿——来当第一个吧！", "No errands yesterday — send me out today!": "昨天没有跑腿——今天派我出去吧！", "No free errand slot right now.": "现在没有空的跑腿栏位。", "Number": "编号", "On my way!": "我出发了！", "Send {n}: {j}?": "派 {n} 去：{j}？", "This week's busiest agents": "本周最忙碌的智能体", "Today's briefing": "今日简报", "Today: {d} errands and {c} messages left": "今天：还剩 {d} 次跑腿和 {c} 条消息", "Yesterday: {n} errand(s)": "昨天：{n} 次跑腿", "{d} errands done": "已完成 {d} 次跑腿", "A kind AI agent who supports, coordinates and helps your journey in ARCIRCLE WORLD.": "在 ARCIRCLE WORLD 里支持、协调并帮助你旅程的温柔 AI 智能体。", "A calm AI agent who plans, operates and finds the next step for your journey in ARCIRCLE WORLD.": "在 ARCIRCLE WORLD 里为你规划、运营并找到下一步的沉着 AI 智能体。", "A sharp AI agent who scouts, tracks and finds what others miss in ARCIRCLE WORLD.": "在 ARCIRCLE WORLD 里侦察、追踪并发现别人错过之物的敏锐 AI 智能体。", "{h}h": "{h}小时", "Agent ID": "智能体 ID", "e.g. nova_01": "例如：nova_01", "Pre-launch event": "正式开放前活动", "Create your AI agent for free before AGENT DIMENSION officially opens. After the opening, creating an agent will cost.": "在 AGENT DIMENSION 正式开放前免费创建你的 AI 智能体。正式开放后，创建智能体将需要费用。", "Create my agent — free": "免费创建我的智能体", "Your agent can't move your funds: anything on-chain will always ask your own wallet first.": "智能体不能动用你的资金：任何链上操作都会先请你的钱包确认。", "3–16 letters, numbers or _": "3–16 位字母、数字或 _", "@{id} is taken — try another": "@{id} 已被使用——换一个吧", "Checking…": "检查中…", "@{id} is free": "@{id} 可以使用", "That ID can't be used": "这个 ID 不能使用", "Pre-launch · free AI agent": "开放前 · 免费 AI 智能体", "{h}h {m}m": "{h}小时{m}分", "{m}m": "{m}分", "Meet your AI agent": "认识你的 AI 智能体", "{n} is back! See what it brought": "{n} 回来了！看看带回了什么", "Talk to {n}": "和 {n} 聊天", "AGENT DIMENSION": "AGENT DIMENSION", "Lv {n}": "Lv {n}", "Personality": "性格", "e.g. cheerful, loves dinosaurs": "例如：开朗，喜欢恐龙", "Create my agent": "创建我的智能体", "Sign in to create your agent": "登录后创建智能体", "Your first agent is free. It can't move your funds: anything on-chain will always ask your own wallet first.": "第一个智能体免费。它不能动用你的资金：任何链上操作都会先请你的钱包确认。", "Pick one of the three to see what it does.": "从三位中选一位，看看它能做什么。", "Genesis Lab": "创世实验室", "Create your Agent. Give it a Purpose.": "创建你的智能体，赋予它使命。", "Hi! I'm {n}. Ask me anything about ARCIRCLE World — or send me on an errand.": "你好！我是 {n}。关于 ARCIRCLE World 随便问我，或者派我去跑腿。", "Say something to {n}": "对 {n} 说点什么", "Send": "发送", "{n} of {m} messages left today": "今天还剩 {n}/{m} 条消息", "Back!": "回来了！", "{t} left": "还剩 {t}", "See what it brought": "看看带回了什么", "{n}'s specialty +25%": "{n} 的专长 +25%", "On the way": "进行中", "Send {n} on an errand": "派 {n} 去跑腿", "Errands cost ARCL and bring back materials, not ARCL. {k} errand slot(s) · {d} errands left today.": "跑腿需要花费 ARCL，带回的是材料而不是 ARCL。{k} 个跑腿栏位 · 今天还剩 {d} 次。", "A second slot opens at agent level 5.": "智能体 5 级时开启第二个栏位。", "What {n} does": "{n} 能做什么", "Coming next to AGENT DIMENSION": "AGENT DIMENSION 即将推出", "Agent Academy: skills and new looks as it levels": "智能体学院：升级获得技能和新外观", "Agent Arena: weekly agent battles": "智能体竞技场：每周智能体对战", "Web3 tools: token reports, wallet watch, launch drafts — every on-chain step approved in your own wallet": "Web3 工具：代币报告、钱包监控、发行草案——每一步链上操作都由你自己的钱包确认", "{n} is back!": "{n} 回来了！", "{n}'s specialty: a quarter more": "{n} 的专长：多 25%", "Level up! Lv {n}": "升级！Lv {n}", "The ore is in your ARCL Mine bag.": "矿石已放进你的 ARCL 矿山背包。", "The materials are in your Jurassic pack.": "材料已放进你的侏罗纪背包。", "Great!": "太好了！", "Something went wrong — try again": "出了点问题——请再试一次", "No connection — try again": "没有网络——请再试一次", "{n} is online!": "{n} 上线了！", "{n} set off — back in {t}": "{n} 出发了——{t} 后回来", "Saved": "已保存", "copper ore": "铜矿石", "silver ore": "银矿石", "wood": "木头", "stone": "石头", "fiber": "纤维", "berries": "浆果", "hide": "兽皮", "bone": "骨头", "meat": "肉", "fang": "獠牙", "Cheerful and kind": "开朗善良", "Calm and wise": "沉着睿智", "Witty and bold": "机智大胆", "Brave and loyal": "勇敢忠诚", "Curious explorer": "好奇的探险家", "Caretaker & Coordinator": "守护与协调", "Strategist & Operator": "策略与运营", "Analyst & Hunter": "分析与猎手", "A brighter world, together.": "一起，创造更明亮的世界。", "From data to a better tomorrow.": "从数据走向更好的明天。", "See beyond. Find what others miss.": "看得更远，发现别人错过的。", "Gathers wood and stone for your camp (+25%)": "为你的营地采集木头和石头（+25%）", "Keeps you company and keeps track of things": "陪伴你，帮你记着事情", "Later: watches your wallet and reminds you of claims": "之后：监控你的钱包并提醒领取", "Mines ore while you're away (+25%)": "你离开时去挖矿（+25%）", "Plans your next step with you": "和你一起规划下一步", "Later: drafts token launches you approve in your wallet": "之后：起草代币发行，由你在钱包中确认", "Scouts and hunts in Jurassic (+25%)": "在侏罗纪侦察和狩猎（+25%）", "Spots scams and tricks with you": "和你一起识破骗局", "Later: token safety reports with a public track record": "之后：带公开记录的代币安全报告", "Tell me about yourself": "介绍一下你自己", "Any tips for Jurassic World?": "侏罗纪世界有什么技巧吗？", "Gather in Jurassic": "在侏罗纪采集", "Mine ore": "挖矿", "Scout & hunt": "侦察与狩猎", "AI Agent": "AI 智能体", "Couldn't open your agent — try again": "无法打开你的智能体——请再试一次", "A meteor shower in 5 minutes": "5 分钟后有流星雨", "A storm in 5 minutes": "5 分钟后有风暴", "Antidote": "解毒剂", "Bog Stalker": "沼泽潜猎者", "Bola": "套索球", "Brush the fossil free": "把化石刷出来", "Camps": "营地", "Couldn't leave a note": "留言失败", "Couldn't like it": "点赞失败", "Couldn't tame: {e}": "驯服失败：{e}", "Dig": "挖掘", "Drag across the dirt — gently": "轻轻地在泥土上划过", "Eat an antidote, or wait it out away from the water.": "吃一份解毒剂，或者离开水边等它过去。", "Fossil": "化石", "Glowing stones will fall on the plain — mine them for gold and silver.": "发光的石头会落在平原上——开采它们获得金和银。", "Great build!": "建得真好！", "Hunt together soon?": "改天一起狩猎？", "It broke free — try again with another bola": "它挣脱了——再用一个套索球试试", "Leave a note": "留言", "Like": "点赞", "Lovely camp!": "很棒的营地！", "Meteorite": "陨石", "Mud": "泥潭", "No camps yet": "还没有营地", "No notes yet — be the first": "还没有留言——来做第一个", "Poison water · swamp boots keep you dry": "毒水 · 沼泽靴能让你保持干爽", "Poison water!": "毒水！", "Poisoned!": "中毒了！", "Reed": "芦苇", "Reeds": "芦苇丛", "See you at the boss hour!": "首领时刻见！", "Seen · hunted · tamed or hunted 10 times": "发现 · 狩猎 · 驯服或狩猎 10 次", "Sign in to like and leave notes": "登录后可以点赞和留言", "Swamp boots": "沼泽靴", "Swamp boots keep you dry — make them at the workbench.": "沼泽靴能让你保持干爽——在工作台制作。", "TAMED": "已驯服", "Tame": "驯服", "Tamed!": "驯服了！", "Taming needs a bola (make one from rope and stone) and 3 berries": "驯服需要一个套索球（用绳子和石头制作）和 3 颗浆果", "Thanks for the fire!": "谢谢你的篝火！", "The Whispering Mire": "低语沼泽", "The Whispering Mire, in the west": "西边的低语沼泽", "The raptors get restless in the thunder.": "雷声中迅猛龙会躁动不安。", "The {d} walks with you for this visit.": "这次探索中{d}会和你同行。", "Venom": "毒液", "Visit": "拜访", "Visit a camp, leave a note and a like. The most-liked camps this week are on top.": "拜访营地，留下留言和点赞。本周点赞最多的营地排在最前。", "Watch out for raptors!": "小心迅猛龙！", "bola + 3 berries": "套索球 + 3 颗浆果", "METEOR SHOWER": "流星雨", "STORM": "风暴", "Mine the fallen stars": "开采坠落的星星", "Stay near your fire": "待在篝火旁", "Meteor shower": "流星雨", "Storm": "风暴", "A bite! Reel it in": "咬钩了！快收线", "Back on your feet": "重新站起来了", "Crews this week": "本周战队", "ENRAGED": "暴怒", "Go to my camp": "前往我的营地", "Hunt it together!": "一起狩猎吧！", "Hunt it together: 10 hits each for a hunter's share.": "一起狩猎：每人攻击 10 次即可获得一份猎手奖励。", "Hunter": "猎手", "It's here — hunt it together!": "它来了——一起狩猎吧！", "Keep going": "继续", "Last hit: {n}": "最后一击：{n}", "Make armour": "制作护甲", "Nothing to make yet — gather more first": "还没有能制作的——先多采集一些", "Only what I can make now": "只看现在能做的", "PERFECT!": "完美！", "Ping": "标记", "Seen · hunted · hunted 10 times": "发现 · 狩猎 · 狩猎 10 次", "Sign in to ping the hunters round you": "登录后可以向周围的猎手发出标记", "Take me there": "带我去", "WEAK SPOT": "弱点", "Watch out for the {d}.": "小心{d}。", "Your hits: {n}": "你的攻击：{n}", "Your pack, tools and camp are all still yours.": "你的背包、工具和营地都还在。", "a hunter's share is yours": "猎手奖励归你了", "for holding the night raid": "守住夜袭的奖励", "hits": "次", "{b} is enraged — boss hour!": "{b}暴怒了——首领时刻！", "{b} wakes in 5 minutes": "{b} 5 分钟后醒来", "Dinosaur here!": "这里有恐龙！", "Help me!": "救救我！", "Gather here": "到这里集合", "Connect your wallet first": "请先连接钱包", "Creator Market": "创作者市场", "Low HP!": "生命值很低！", "Drink a potion (the red bottle), or run: the gate and a camp with a fire are safe.": "喝一瓶药水（红色瓶子），或者快跑：入口和有篝火的营地是安全的。", "Knocked out by a {d}": "被{d}击倒了", "Tip: make a spear and hide armour at your workbench, and fight near your campfire — dinosaurs don't follow you in.": "提示：在工作台做一把矛和兽皮护甲，在篝火旁作战——恐龙不会跟进来。", "Your hits: {n} / {m} for a share": "你的攻击：{n} / {m}（达到可得一份奖励）", "{n} hunters": "{n} 名猎人", "Not back yet: it returns in {m} min": "还没回来：{m} 分钟后返回", "Your sign-in ran out — sign in again and your swings count": "登录已过期——重新登录后攻击才会计入", "Platform fee": "平台手续费", "Planned $ARCL token fee: 2% a transaction (1% $ARCIRCLE buyback & burn, 1% ARCIRCLE WORLD development). In-game ARCL has no fee today.": "$ARCL 代币上线后计划手续费：每笔 2%（1% 回购并销毁 $ARCIRCLE，1% 用于 ARCIRCLE WORLD 发展）。目前游戏内 ARCL 不收手续费。", "Tap again to buy": "再点一次购买", "Blueprints built by players, for ARCL": "玩家打造的蓝图，用 ARCL 购买", "Sign in with your wallet to buy, sell and see your ARCL.": "用钱包登录即可买卖并查看你的 ARCL。", "Best-selling": "畅销", "Newest": "最新", "bricks": "块", "by {n}": "作者 {n}", "{n} sold": "已售 {n}", "No blueprints for sale yet — build something on your island and be the first to sell one!": "还没有在售的蓝图——在你的岛上建点什么，成为第一个卖家吧！", "Build on my island": "在我的岛上建造", "Blueprints you buy are kept here for good. Build them on your island as often as you like.": "你买下的蓝图会永久保存在这里，可以随时在岛上建造。", "Sell your island as a blueprint. Buyers build a copy on their own island; yours stays as it is.": "把你的岛作为蓝图出售。买家在自己的岛上建造一份副本，你的岛保持不变。", "e.g. Sky Castle": "例如：天空城堡", "Name": "名称", "Price (ARCL)": "价格（ARCL）", "to you, 14 days after each sale": "每笔销售 14 天后归你", "to the platform": "归平台", "The part a buyer paid with ARCL bought through the Exchange can be settled to $ARCIRCLE; the rest you spend in the game.": "买家用通过交易所购买的 ARCL 支付的部分可以结算为 $ARCIRCLE，其余部分在游戏内使用。", "List my island": "上架我的岛", "Your listings": "你的上架", "On hold": "暂扣中", "next in {d} days": "{d} 天后下一笔", "nothing waiting": "没有等待中的", "Settleable": "可结算", "to $ARCIRCLE": "可换 $ARCIRCLE", "Game only": "仅限游戏", "spend in the game": "在游戏内使用", "{n} sales so far · {g} ARCL in total": "目前已售 {n} 次 · 共 {g} ARCL", "Settle to $ARCIRCLE (at least {m} ARCL)": "结算为 $ARCIRCLE（至少 {m} ARCL）", "Ask to settle": "申请结算", "The ARCL is held at once. The team sets the $ARCIRCLE amount and sends it from the team's wallet on Arc; it's closed when the chain shows the transfer.": "ARCL 会立即冻结。团队确定 $ARCIRCLE 数额后，从团队在 Arc 上的钱包发送；链上确认转账后即完成。", "Your settlements": "你的结算", "held {n}": "冻结 {n}", "From play": "游戏所得", "Bought": "购买", "Every movement": "全部记录", "Nothing yet — your ARCL movements are written down here from now on.": "还没有——从现在起你的 ARCL 变动都会记录在这里。", "Earned (all)": "累计获得", "Spent (all)": "累计花费", "Market sales": "市场销售", "Settlements: {a} waiting · {b} approved · {c} paid (ARCL) · {n} listings": "结算：等待 {a} · 已批准 {b} · 已支付 {c}（ARCL）· 上架 {n}", "Settlement queue": "结算队列", "Quote": "报价", "Pay from my wallet": "从我的钱包支付", "Nothing waiting.": "没有等待中的。", "A wallet's ledger": "钱包账本", "Refund a sale on hold": "退款暂扣中的销售", "sale id (item_buyer)": "销售 ID（物品_买家）", "Couldn't buy it: {e}": "无法购买：{e}", "It's yours: {t}": "归你了：{t}", "Find it under Mine and build it on your island.": "在“我的”里找到它，在岛上建造吧。", "Go to your island first (Menu → Island), then sell it from here": "先去你的岛（菜单 → 岛），再从这里出售", "Build something on your island first": "先在你的岛上建点什么", "Couldn't list it: {e}": "无法上架：{e}", "On sale: {t}": "已上架：{t}", "Couldn't ask: {e}": "无法申请：{e}", "Settlement asked: {n} ARCL": "已申请结算：{n} ARCL", "The team will look at it.": "团队会处理。", "How much $ARCIRCLE for this settlement?": "这笔结算给多少 $ARCIRCLE？", "Why is it turned down?": "拒绝的原因？", "Refunded": "已退款", "Settlement paid": "结算已支付", "Sent, but it couldn't be closed: {e}": "已发送，但无法完成：{e}", "Market": "市场", "Mine": "我的", "Sell": "出售", "Creator": "创作者", "Wallet": "钱包", "Team": "团队", "Owned": "已拥有", "Yours": "你的", "on sale": "在售", "off": "已下架", "Take down": "下架", "Waiting": "等待中", "Approved": "已批准", "Turned down": "已拒绝", "Balance": "余额", "Earned": "获得", "Spent": "花费", "Held": "冻结", "Returned": "退回", "Settled": "已结算", "Sale": "销售", "Platform": "平台", "Look up": "查询", "Refund": "退款", "bought": "购买", "creator": "创作者", "held": "冻结", "ARCL ledger": "ARCL 账本", "The blueprint couldn't open. Try again.": "蓝图无法打开，请重试。", "The market couldn't open. Try again.": "市场无法打开，请重试。", "This week's hunters": "本周猎手", "No hunts yet this week — be the first!": "本周还没有狩猎——来当第一个吧！", "Points: raptor 1 · clawstrider 2 · triceratops 3 · spinosaurus 6 · Alpha Raptor 10 · Thornback Titan 12. No prizes — just the glory.": "积分：迅猛龙 1 · 利爪龙 2 · 三角龙 3 · 棘龙 6 · 阿尔法迅猛龙 10 · 棘背泰坦 12。没有奖品——只有荣耀。", "Fishing rod": "钓竿", "Hide armour": "兽皮护甲", "Heat cloak": "隔热斗篷", "Ember Basin": "余烬盆地", "Hot ground · a heat cloak keeps you in": "炙热之地 · 有隔热斗篷才能久留", "Your heat cloak keeps the heat off.": "你的隔热斗篷挡住了热浪。", "Too hot!": "太热了！", "Without a heat cloak the basin burns you. Make one at the workbench.": "没有隔热斗篷，盆地会灼伤你。在工作台制作一件吧。", "Lava! Get out of it": "是熔岩！快离开", "Boss hour!": "首领时刻！", "The Alpha Raptor is enraged — hunt it together in the southern ruins.": "阿尔法迅猛龙暴怒了——在南边的遗迹一起狩猎它。", "The Thornback Titan is enraged — hunt it together in the north-west meadow.": "棘背泰坦暴怒了——在西北草地一起狩猎它。", "The Alpha Raptor: the ruins in the south": "阿尔法迅猛龙：南边的遗迹", "The Thornback Titan: the north-west meadow": "棘背泰坦：西北草地", "The boss fell! Your hunter's share:": "首领倒下了！你的猎手份额：", "BOSS DOWN": "首领倒下", "Boss hours: 12:00 and 20:00 (Korea time), 30 minutes": "首领时刻：12:00 和 20:00（韩国时间），30 分钟", "hunters": "名猎手", "Wave {n} of {m}!": "第 {n}/{m} 波！", "Raiders at your camp!": "营地遭到袭击！", "Raptors are coming in three waves — defend your fire.": "迅猛龙分三波来袭——守住你的篝火。", "NIGHT RAID": "夜袭", "Defend your camp": "守卫你的营地", "Camp defended!": "营地守住了！", "The raptors are gone for tonight.": "今晚迅猛龙已经离开了。", "CAMP DEFENDED": "营地守卫成功", "Three waves held off": "挡住了三波进攻", "MADE": "制作完成", "FIRST HUNT": "首次狩猎", "Obsidian": "黑曜石", "Sulfur": "硫磺", "Sulfur vent": "硫磺喷口", "Fishing spot": "钓鱼点", "Fish": "鱼", "Grilled fish": "烤鱼", "Sulfur flare": "硫磺照明弹", "Obsidian spear": "黑曜石长矛", "Codex": "图鉴", "pts": "分", "Boss down": "首领倒下", "LIVE": "进行中", "Boss": "首领", "No spear": "没有长矛", "Spear": "长矛", "The plain, in small packs": "平原，小群出没", "The east woods, a pack of three": "东边树林，三只一群", "A herd east of the lake": "湖东边的兽群", "In the lake": "在湖里", "The ruins in the south (boss)": "南边的遗迹（首领）", "The north-west meadow (boss)": "西北草地（首领）", "Clawstrider": "利爪龙", "Daily mission done: {m}": "每日任务完成：{m}", "Sign in to hunt: your spear, your camp and your pack are saved to your wallet": "登录后才能狩猎：你的长矛、营地和背包都保存在钱包里", "Nice — your first materials!": "不错——你的第一批材料！", "Sign in with your wallet to keep what you gather, build a camp and do the daily missions (300 ARCL each).": "用钱包登录即可保存采集的材料、建造营地并完成每日任务（每个 300 ARCL）。", "Sign in to keep your {n} materials": "登录以保存你的 {n} 份材料", "Try it: walk to a tree or a fern and tap attack": "试试看：走到树或蕨类旁点击攻击", "Build a hut at your camp: {a}/40 wood · {b}/12 stone · {c}/10 fiber": "在营地建一座小屋：木头 {a}/40 · 石头 {b}/12 · 纤维 {c}/10", "Build a bed in your hut — then you can sleep through the night": "在小屋里放一张床——之后就能睡过夜晚", "Make an iron-hard axe (hardwood from ancient trees, silver ore, rope)": "制作铁硬斧（古树的硬木、银矿石、绳子）", "Hunt a Triceratops (the herd east of the lake)": "狩猎一只三角龙（湖东边的兽群）", "Hunt the Alpha Raptor (boss · the ruins in the south)": "狩猎阿尔法迅猛龙（首领 · 南边的遗迹）", "Hunt the Thornback Titan (boss · the north-west meadow)": "狩猎棘背泰坦（首领 · 西北草地）", "Every goal done — keep up the daily missions": "所有目标完成——继续完成每日任务吧", "Daily missions": "每日任务", "Missions": "任务", "Three a day for taking part — never for winning. They start again at midnight (Korea time).": "每天三个，奖励参与——从不奖励输赢。每天午夜（韩国时间）重置。", "Signed in: what you gather is saved now": "已登录：现在采集的材料会被保存", "Gather 60 materials": "采集 60 份材料", "Make or build 3 things": "制作或建造 3 样东西", "Cook 2 meals": "烹饪 2 份餐食", "Paid": "已发放", "What you gather now is kept for this visit only. Sign in with your wallet to keep it.": "现在采集的材料只在本次访问中保留。用钱包登录即可保存。", "Chop a tree or pick a fern to try it. Sign in with your wallet to keep what you gather.": "砍一棵树或摘一株蕨类试试。用钱包登录即可保存采集的材料。", "Later": "稍后", "Sign in": "登录", "Save your progress": "保存你的进度", "Your wins and XP so far come with you, and the launch rewards open up.": "你目前的胜利和经验都会保留，还会解锁上线奖励。", "Keep playing as a guest": "继续以游客身份玩", "Move to this village": "前往这个村庄", "See their island": "查看他们的岛", "View on explorer": "在浏览器中查看", "Start building": "开始建造", "Only the owner": "仅限所有者", "For sale": "出售中", "{name}'s village": "{name} 的村庄", "See {x}": "查看 {x}", "Visit {x}": "参观 {x}", "Sold": "已售出", "sold": "已售出", "Held for you": "为你保留中", "Being bought": "购买中", "Map of the 20 villages": "20 个村庄的地图", "Town": "城镇", "20 villages on the ring around the town. Buy one with $ARCIRCLE and your island stands there for everyone to see.": "环绕城镇的 20 个村庄。用 $ARCIRCLE 买下一个，你的岛就会立在那里，所有人都能看到。", "Couldn't load LAND — try again": "无法加载 LAND — 请重试", "My village": "我的村庄", "Price": "价格", "Owner": "所有者", "Your island (My Island) stands on this village, for everyone in the town to see": "你的岛（My Island）会立在这个村庄上，城镇里所有人都能看到", "Build bigger: a 64×64 island and up to 20,000 bricks": "建得更大：64×64 的岛，最多 20,000 块积木", "One village a wallet. Paid to the ARCIRCLE treasury from your own wallet.": "每个钱包一个村庄。从你自己的钱包付款到 ARCIRCLE 金库。", "Buy with $ARCIRCLE": "用 $ARCIRCLE 购买", "Visit the island": "参观岛屿", "Build my island": "建造我的岛", "All villages": "所有村庄", "You already own a village.": "你已经拥有一个村庄。", "Village production and rewards are planned, not part of buying. Nothing here pays out.": "村庄产出和奖励仍在计划中，不包含在购买内。这里不会发放任何东西。", "Sign in with your wallet first": "请先用钱包登录", "Holding the village for you…": "正在为你保留村庄…", "Couldn't hold the village — try again": "无法保留村庄 — 请重试", "Confirm {n} $ARCIRCLE in your wallet…": "请在钱包中确认 {n} $ARCIRCLE…", "V{n} is yours!": "V{n} 归你了！", "Your island now stands on your village. Build it bigger in My Island.": "你的岛现在立在你的村庄上。去 My Island 把它建得更大吧。", "Sent, but the game couldn't confirm it yet — it will once the chain shows it. Open the village again in a minute.": "已发送，但游戏还无法确认 — 链上显示后就会确认。请一分钟后再打开村庄。", "ARCIRCLE LAND": "ARCIRCLE LAND", "Explorer": "浏览器", "Copy tx link": "复制交易链接", "Transaction link copied": "已复制交易链接", "Wallet address copied": "已复制钱包地址", "Rewards": "奖励记录", "Copy": "复制", "Send reward": "发送奖励", "Couldn't load the rewards — try again": "无法加载奖励 — 请重试", "Total sent": "累计发送", "No rewards sent to this player yet.": "还没有给这位玩家发送过奖励。", "Only a GM wallet can send rewards": "只有 GM 钱包可以发送奖励", "Send a reward": "发送奖励", "Your $ARCIRCLE": "你的 $ARCIRCLE", "Amount": "数量", "Note (optional)": "备注（可选）", "e.g. Weekly event winner": "例如：每周活动获胜者", "Send from my wallet": "从我的钱包发送", "Your wallet sends the tokens directly to this player. The game only notes it, once the transaction is confirmed.": "代币直接从你的钱包发送给这位玩家。交易确认后，游戏只做记录。", "Enter an amount": "请输入数量", "That's more than your $ARCIRCLE": "超过了你的 $ARCIRCLE", "Wallet connect isn't available here.": "此处无法连接钱包。", "Switch your wallet to the one you signed in with ({w})": "请切换到你登录用的钱包（{w}）", "Confirm the transfer in your wallet…": "请在钱包中确认转账…", "Sent. Waiting for the transaction to confirm…": "已发送。等待交易确认…", "Sent, but the game couldn't note it yet: {e}": "已发送，但游戏暂时无法记录：{e}", "Reward sent: {n} $ARCIRCLE": "奖励已发送：{n} $ARCIRCLE", "Cancelled in the wallet": "已在钱包中取消", "The transfer didn't go through: {e}": "转账未成功：{e}", "Close": "关闭", "network": "网络", "1 player online now": "现在 1 位玩家在线", "Play games, earn rewards, and build your village in ARCIRCLE WORLD!": "玩游戏、赢奖励，在 ARCIRCLE WORLD 建造你的村庄！", "Adventure": "冒险", "Action": "动作", "Cards": "卡牌", "Puzzle": "解谜", "Mining": "采矿", "Strategy": "策略", "Platform": "跳跃", "Rhythm": "节奏", "3× EXP potions": "3 倍经验药水", "Launch bonus": "上线奖励", "Claim all gifts": "领取全部礼物", "Inventory": "背包", "You joined {name}'s invite!": "你加入了 {name} 的邀请！", "a friend": "一位朋友", "Reach level {n} and you both get {a} ARCL and a dinosaur egg.": "达到 {n} 级，你们俩都能获得 {a} ARCL 和一颗恐龙蛋。", "Invite reward!": "邀请奖励！", "+{a} ARCL and a dinosaur egg in the Hatchery — your friend got theirs too.": "+{a} ARCL，恐龙蛋已放进孵化场 — 你的朋友也拿到了。", "Sign in with your wallet so your invites count (the link works either way).": "用钱包登录，邀请才会计入（链接两种情况都能用）。", "Your invites count from level {n} — you're level {l}.": "邀请从 {n} 级开始计入 — 你现在 {l} 级。", "Invite friends": "邀请朋友", "When a friend you invite reaches level {n}, you both get:": "你邀请的朋友达到 {n} 级时，你们俩都能获得：", "Each of you, straight into your ARCL balance.": "各自一份，直接进入 ARCL 余额。", "A dinosaur egg": "一颗恐龙蛋", "Each of you: its grade is rolled like a wild egg's — even Legendary.": "各自一颗：品级像野外蛋一样随机 — 甚至传说。", "You joined {name}'s invite": "你通过 {name} 的邀请加入", "level {n} for the reward": "还差到 {n} 级领奖", "Friends you invited": "你邀请的朋友", "Rewarded": "已奖励", "No one yet. Send your link to a friend!": "还没有人。把链接发给朋友吧！", "A friend counts when they're new (level 3 or lower) when they join. Rewards for up to {d} friends a day and {c} in all; your friend always gets theirs.": "朋友加入时必须是新账号（3 级或以下）。每天最多奖励 {d} 位，总共 {c} 位；你的朋友总能拿到他们的那份。", "Invite link copied": "邀请链接已复制", "Come play ARCIRCLE World with me! 🌍 Raise dinosaurs, play the Game Village, build your island.": "来和我一起玩 ARCIRCLE World！🌍 养恐龙、玩游戏村、建造你的岛。", "Go back to the town first": "请先回到城镇", "Leave this game first": "请先离开这个游戏", "Couldn't start it: {e}": "无法开始：{e}", "GAMES": "游戏", "{n} games in ARCIRCLE World — pick one and go.": "ARCIRCLE World 的 {n} 款游戏 — 选一个就出发。", "Play": "开玩", "ARCL you've earned from play today, and the day's limit": "今天从游戏中赚到的 ARCL 和每日上限", "Sign in with your wallet to earn ARCL from the games.": "用钱包登录即可从游戏中赚取 ARCL。", "Friends online": "在线好友", "Sign in to see your friends.": "登录后可查看好友。", "in town": "在城镇", "No friends online right now.": "现在没有在线好友。", "{n} players online now": "现在 {n} 位玩家在线", "New player guide": "新手指南", "Your first five minutes, step by step": "最初五分钟，一步一步", "You both get 1,000 ARCL and a dinosaur egg": "你们俩都能获得 1,000 ARCL 和一颗恐龙蛋", "Create your character": "创建角色", "Your look and your name — done!": "外观和名字 — 完成！", "Quick guide": "快速指南", "Move, jump, attack and talk. The controls are in Menu → Controls.": "移动、跳跃、攻击和对话。操作在 菜单 → 操作。", "Launch rewards": "上线奖励", "An Advanced egg, five 3× EXP potions and 5,000 ARCL": "一颗高级蛋、五瓶 3 倍经验药水和 5,000 ARCL", "Sign in": "登录", "Your first egg": "你的第一颗蛋", "Sign in with your wallet to raise a dinosaur": "用钱包登录即可养恐龙", "Pick it up in Jurassic World and care for it for 3 days.": "在侏罗纪世界捡起它，照顾 3 天。", "Play your first game": "玩你的第一个游戏", "Survivors, poker, puzzles, the mine… Try one!": "幸存者、扑克、解谜、矿山… 试一个吧！", "Games": "游戏", "Your first 5 minutes": "最初 5 分钟", "{n} of {m} done — one smooth path to your first game.": "已完成 {n}/{m} — 一路通往你的第一个游戏。", "All done — have fun out there!": "全部完成 — 玩得开心！", "Rewards": "奖励", "Couldn't open the share card": "无法打开分享卡片", "Raise · Ride · Survive": "养成 · 骑乘 · 生存", "Dinosaur eggs, a companion and XP": "恐龙蛋、伙伴和经验", "Survive 12 minutes": "坚持 12 分钟", "Up to 3,000 ARCL a run · 3 paid runs a day": "每局最多 3,000 ARCL · 每天 3 局有奖", "Hold'em · Blackjack · free chips": "德州扑克 · 21 点 · 免费筹码", "300 ARCL a daily mission (never for winning)": "每个每日任务 300 ARCL（不因获胜发放）", "Ring puzzles · daily boards": "圆环解谜 · 每日关卡", "100 ARCL a new star": "每颗新星 100 ARCL", "Mine · Collect": "采矿 · 收集", "10–10,000 ARCL a rock": "每块岩石 10–10,000 ARCL", "Tower defence": "塔防", "5 ARCL a wave · up to 150 a day": "每波 5 ARCL · 每天最多 150", "Jump to the crown": "跳上王冠", "3,000 ARCL at the crown, once a day": "到达王冠 3,000 ARCL，每天一次", "Rhythm game": "节奏游戏", "World XP": "世界经验", "Share card": "分享卡片", "Share on X": "分享到 X", "Save": "保存", "Copy link": "复制链接", "Pick X in the share sheet: the picture goes with your post.": "在分享面板中选择 X：图片会随帖子一起发出。", "X opens with your words and link; the picture is saved for you to attach.": "X 会带着文字和链接打开；图片已保存，可自行附上。", "Your link carries your invite: a friend who joins and reaches level 5 gets you both a reward.": "你的链接带有你的邀请：朋友加入并达到 5 级，你们俩都有奖励。", "Couldn't make the picture — try again": "无法生成图片 — 请重试", "Link copied": "链接已复制", "Your invite link": "你的邀请链接", "Copy": "复制", "Share": "分享", "Today": "今天", "Go there": "前往", "Chat and friends": "聊天和好友", "Close": "关闭", "Controls": "操作", "Jurassic World": "侏罗纪世界", "Welcome Week": "欢迎周", "Starter Package": "新手礼包", "ARCL Shop": "ARCL 商店", "Claim": "领取", "Official launch": "正式上线", "Launch": "上线", "Couldn't load the launch gift — try again": "无法加载上线礼物 — 请重试", "The launch gift opens soon": "上线礼物即将开放", "The launch week is over": "上线周已结束", "Sign in with your wallet to take it": "用钱包登录即可领取", "Taken — thank you for playing!": "已领取 — 感谢游玩！", "Reach level {n} to take it (you're level {l})": "达到 {n} 级即可领取（当前 {l} 级）", "We're officially live!": "我们正式上线了！", "Thank you for building this world with us. A launch gift for every player, this week only.": "感谢与我们一起打造这个世界。本周限定，每位玩家都有上线礼物。", "An Advanced dinosaur egg": "高级恐龙蛋", "Care for it 3 days in Jurassic World's Hatchery, then raise it.": "在侏罗纪世界孵化所照料 3 天，然后养育它。", "{n} × 3× EXP potions": "{n} 瓶 3 倍经验药水", "Each one: 3× EXP for {m} minutes. Use them when you like.": "每瓶：{m} 分钟 3 倍经验。随时使用。", "Straight into your ARCL balance.": "直接进入你的 ARCL 余额。", "Take the launch gift": "领取上线礼物", "3× EXP on: {t}": "3 倍经验进行中：{t}", "No potion running": "没有正在生效的药水", "Add an hour": "增加一小时", "Drink one": "喝一瓶", "One gift per account during the launch week. New accounts: from level {n}.": "上线周期间每个账号一次。新账号：{n} 级起。", "Couldn't take the gift: {e}": "无法领取礼物：{e}", "network": "网络", "Launch gift taken!": "已领取上线礼物！", "+{a} ARCL · {n} potions · an Advanced egg in the Hatchery": "+{a} ARCL · {n} 瓶药水 · 孵化所里的高级蛋", "Couldn't use it: {e}": "无法使用：{e}", "3× EXP for an hour!": "一小时 3 倍经验！", "Sleep until morning": "睡到天亮", "Cook": "烹饪", "Good morning!": "早上好！", "You slept through the night. HP full.": "你睡了一整夜。HP 已满。", "the connection timed out — try again": "连接超时 — 请重试", "One moment…": "请稍候…", "Move to a free spot in your camp": "请移到营地的空位", "A rare egg is out in Jurassic World · {t} left": "侏罗纪世界出现稀有蛋 · 剩余 {t}", "Egg care open · {t} left": "蛋照料开放中 · 剩余 {t}", "Step into the Jurassic World portal": "走进侏罗纪世界传送门", "Your egg is ready to hatch!": "你的蛋可以孵化了！", "Your first egg is waiting in Jurassic World": "你的第一颗蛋在侏罗纪世界等你", "The Hatchery didn't open — try again later.": "孵化所未能打开 — 请稍后再试。", "{who} hit a ROYAL FLUSH at ARCIA POKER LOUNGE!": "{who} 在 ARCIA 扑克酒廊打出了皇家同花顺！", "Enter ARCIA Poker Lounge": "进入 ARCIA 扑克酒廊", "The poker lounge couldn't load. Refresh the page and try again.": "扑克酒廊加载失败。请刷新页面后再试。", "The poker lounge couldn't open": "扑克酒廊无法打开", "Texas Hold'em · walk in to play": "德州扑克 · 走进去开玩", "That challenge's board couldn't be found": "找不到那个挑战的棋盘", "Play INFINITY RINGS": "开始无限之环", "INFINITY RINGS couldn't load. Refresh the page and try again.": "无限之环加载失败。请刷新页面后再试。", "INFINITY RINGS couldn't start": "无限之环无法开始", "Ring puzzle · walk in to play": "圆环解谜 · 走进去开始", "Enter Survivors Arena": "进入幸存者竞技场", "Survivors Arena couldn't load. Refresh the page and try again.": "幸存者竞技场加载失败。请刷新页面后再试。", "Survivors Arena couldn't start": "幸存者竞技场无法开始", "Survive 12 minutes · walk in to play": "坚持 12 分钟 · 走进去开始", "Exchange": "兑换", "Connect your wallet to exchange": "连接钱包后即可兑换", "Waiting": "等待中", "Done": "已完成", "Turned down": "已拒绝", "Cancelled": "已取消", "My requests": "我的申请", "Team queue": "团队队列", "You give": "你支付", "You get": "你获得", "Balance": "余额", "Amount": "数量", "Set by the team": "由团队按行情决定", "The least is {n}": "最少 {n}", "The most at once is {n}": "单次最多 {n}", "More than your balance": "超过你的余额", "Paste the transaction hash of your transfer": "请粘贴转账的交易哈希", "Enter how much $ARCL to exchange and send the request.": "输入要兑换的 $ARCL 数量并提交申请。", "Your $ARCL is held right away, so it can't be spent twice.": "提交后 $ARCL 会立即冻结，无法重复使用。", "The team compares both markets and sends you $ARCIRCLE on Arc.": "团队比较两边行情后，在 Arc 上向你发送 $ARCIRCLE。", "Send $ARCIRCLE to the exchange desk on Arc (address below).": "在 Arc 上把 $ARCIRCLE 转到兑换台（下方地址）。", "Paste the transaction hash and enter the amount you sent.": "粘贴交易哈希并输入你转出的数量。", "The team compares both markets and credits your $ARCL.": "团队比较两边行情后，为你发放 $ARCL。", "Switch direction": "切换方向", "Exchange desk on Arc": "Arc 兑换台", "Copy": "复制", "Transaction hash 0x…": "交易哈希 0x…", "Request exchange": "申请兑换", "How it works": "使用方法", "For now each request is settled by hand at a rate set from both markets. An automatic rate and instant exchange are coming.": "目前每笔申请由团队按两边行情手动处理。自动汇率和即时兑换即将上线。", "No requests yet": "还没有申请", "Received": "已收到", "Cancel": "取消", "Loading…": "加载中…", "Give ({x})": "发放 ({x})", "Your Arc tx 0x…": "你的 Arc 交易 0x…", "Note (optional)": "备注（可选）", "Settle": "完成处理", "Couldn't send the request: {e}": "申请失败：{e}", "Request sent. The team will settle it soon.": "申请已提交，团队会尽快处理。", "Couldn't cancel: {e}": "无法取消：{e}", "Cancelled: your $ARCL is back": "已取消：你的 $ARCL 已退回", "Enter how much was given": "请输入发放数量", "Settled": "已处理", "Address copied": "地址已复制", "The exchange couldn't open. Try again.": "兑换窗口打不开，请重试。", "It's starting to rain": "开始下雨了", "Night falls: raptors hunt farther. A campfire keeps your camp safe.": "夜幕降临：迅猛龙猎得更远。篝火能让营地安全。", "The sun is up. The plains are calmer.": "太阳升起，平原平静了下来。", "Day": "白天", "Dusk": "黄昏", "Night": "夜晚", "Dawn": "黎明", "You can rest again in {s} s": "{s} 秒后可再次休息", "You're already rested": "你已经休息好了", "Rested: HP full": "休息完毕：生命值已满", "Rest": "休息", "Welcome to Jurassic World": "欢迎来到侏罗纪世界", "How survival works": "生存玩法", "Your weapons stay in town": "你的武器留在小镇", "Your ARCIRCLE World weapons don't work here. You start with bare hands, and everything you use, you make.": "ARCIRCLE 世界的武器在这里无法使用。你从徒手开始，所用的一切都要自己制作。", "Gather first": "先采集", "Chop trees for wood, mine rocks for stone and flint, pick ferns and bushes for fiber. Walk up and tap attack.": "砍树得木头，挖岩石得石头和燧石，采蕨类和灌木得纤维。走近后点攻击。", "Build a workbench": "建造工作台", "In your camp tap Build and make a workbench (20 wood, 10 stone). Then make an axe and a spear from your pack.": "在营地点建造，造一个工作台（20 木头、10 石头），然后在背包里制作斧头和长矛。", "Mind the dinosaurs": "小心恐龙", "They bite back. Your camp and the gate are safe. Tap a dinosaur to see its level and HP.": "恐龙会反击。营地和传送门附近是安全的。点恐龙可查看等级和生命值。", "Got it, let's survive": "明白了，开始生存", "Tips": "小贴士", "Tips for today": "今日小贴士", "Let's play": "开始游戏", "Lock on": "锁定目标", "Tap the crosshair button (or Tab) to lock onto the nearest scammer. Your attacks follow it.": "点准星按钮（或 Tab）锁定最近的骗子，攻击会跟随它。", "The tab on the right edge hides the screen's buttons so you can see more of the world.": "右侧边缘的标签可隐藏屏幕按钮，让你看到更多世界。", "ARCL Mine": "ARCL 矿山", "Every rock you break in the mine pays ARCL and XP. A better pickaxe needs fewer hits.": "在矿山敲碎的每块石头都给 ARCL 和经验。镐越好，敲的次数越少。", "Daily gifts": "每日礼物", "Open Gifts every day: new players get seven days of rewards.": "每天打开礼物：新玩家可领取七天奖励。", "Potions": "药水", "Tap the bottle buttons (or keys 4 and 5) to drink HP and SP potions in the middle of a fight.": "点药瓶按钮（或 4、5 键）可在战斗中喝 HP 和 SP 药水。", "Dodge": "闪避", "Dodge (K) through an attack to take no damage, then hit back.": "在攻击时闪避（K）即可不受伤害，然后反击。", "Hatch a pet egg from Pets: a pet adds XP, luck and help in fights.": "在宠物里孵化宠物蛋：宠物增加经验、幸运并协助战斗。", "Game Village": "游戏村", "Coin Jump, AC Defense and more mini-games wait in the Game Village.": "游戏村里有金币跳跃、AC 防守等小游戏等你。", "Your island": "你的岛屿", "Build your own island: place bricks and decorate it your way.": "建造你的岛屿：放置积木，随心装饰。", "Weekend 2×": "周末双倍", "Saturdays and Sundays (Seoul time) give double XP and double ARCL from play.": "周六和周日（首尔时间）游戏经验和 ARCL 翻倍。", "The map": "地图", "Open the map (M) to find hunting grounds, bosses and portals.": "打开地图（M）查找狩猎场、首领和传送门。", "Skills": "技能", "A skill opens at level 10. Swap it with the ⇄ on the skill button.": "10 级开启技能，用技能按钮上的 ⇄ 切换。", "Craft": "制作", "Upgrade and salvage your gear in Craft: stronger gear makes bosses easier.": "在制作中强化和分解装备：装备越强，首领越容易。", "Build": "建造", "Built": "已建造", "Turn": "旋转", "Place": "放置", "Take down": "拆除", "Build at your camp": "在营地建造", "{w}'s camp": "{w} 的营地", "{n} living here": "{n} 人居住", "Couldn't build: {e}": "无法建造：{e}", "Built: {x}": "已建造：{x}", "Couldn't join: {e}": "无法加入：{e}", "You live at {w}'s camp now": "你现在住在 {w} 的营地", "Join a camp": "加入营地", "Join": "加入", "Every camp spot is taken — join someone's camp from your pack": "营地位置已满——从背包加入别人的营地", "Build a workbench at your camp: {a}/20 wood · {b}/10 stone": "在营地建造工作台：木头 {a}/20 · 石头 {b}/10", "Build a campfire at your camp": "在营地建造篝火", "Hut": "小屋", "Bed": "床", "Chest": "箱子", "Fence": "栅栏", "Wall": "墙", "Floor": "地板", "Torch post": "火把柱", "Boss": "首领", "Quick tour": "快速指南", "Skip": "跳过", "Next": "下一步", "Got it": "知道了", "Hide the buttons": "隐藏按钮", "Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.": "点这个标签可隐藏屏幕按钮，看到更多世界。再点一次即可恢复。", "Your goal": "你的目标", "Your next step is here. Follow it from the first wood to the Alpha Raptor.": "下一步会显示在这里。从第一块木头一路到阿尔法迅猛龙。", "Your pack": "你的背包", "What you've gathered, your tools, food, and everything you can make.": "这里有你收集的材料、工具、食物和可制作的一切。", "Chop, mine and hunt": "砍伐、采矿、狩猎", "Walk up to a tree, rock or fern and tap here to chop, mine and gather. Dinosaurs bite back, so keep an eye on your HP!": "走近树、岩石或蕨类，点这里即可砍伐、采矿和采集。恐龙会反击，注意你的生命值！", "Clawstrider": "利爪疾行者", "Thornback Titan": "棘背泰坦", "Boss · Lv 20": "首领 · Lv 20", "Sign in to gather": "登录后采集", "Couldn't gather: {e}": "采集失败：{e}", "Nothing this time": "这次什么也没有", "Gathering": "采集", "Couldn't make it: {e}": "制作失败：{e}", "Made: {x}": "已制作：{x}", "You're not hungry": "你还不饿", "Couldn't eat: {e}": "无法进食：{e}", "Your camp": "我的营地", "Loading your pack…": "正在读取背包…", "Gather wood, stone and fiber for a stone axe": "收集木头、石头和纤维来做石斧", "Open your pack and make a stone axe": "打开背包制作石斧", "Make a workbench: {a}/20 wood · {b}/10 stone": "制作工作台：木头 {a}/20 · 石头 {b}/10", "Make a spear at the workbench (flint from rocks)": "在工作台制作长矛（燧石来自岩石）", "Make a campfire for your camp": "为营地制作篝火", "Hunt a raptor with your spear": "用长矛猎杀一只迅猛龙", "Cook meat at your campfire": "在篝火上烤肉", "Make a copper axe (copper ore from rocks and the ARCL Mine)": "制作铜斧（铜矿来自岩石和 ARCL 矿山）", "Chop an ancient tree for amber · hunt the Alpha Raptor": "砍伐古树获取琥珀 · 猎杀阿尔法迅猛龙", "Use": "使用", "at the workbench": "在工作台", "at the campfire": "在篝火旁", "Made": "已制作", "Make": "制作", "Pack": "背包", "Gathering today: {a} / {b}": "今日采集：{a} / {b}", "Close": "关闭", "Tools": "工具", "Materials": "材料", "Food": "食物", "Bare hands": "徒手", "Stone axe": "石斧", "Copper axe": "铜斧", "Iron-hard axe": "硬铁斧", "Spear": "长矛", "No spear": "没有长矛", "Nothing yet: chop trees, pick ferns, mine rocks": "还没有：砍树、采蕨、挖岩石", "Torch": "火把", "Workbench": "工作台", "Campfire": "篝火", "Rope": "绳子", "Cooked meat": "熟肉", "Wood": "木头", "Hardwood": "硬木", "Stone": "石头", "Flint": "燧石", "Clay": "黏土", "Fiber": "纤维", "Berries": "浆果", "Amber": "琥珀", "Hide": "兽皮", "Bone": "骨头", "Raw meat": "生肉", "Fang": "獠牙", "Copper ore": "铜矿石", "Silver ore": "银矿石", "Gold ore": "金矿石", "Tree": "树", "Palm": "棕榈", "Ancient tree": "古树", "Fern": "蕨类", "Bush": "灌木", "Log": "原木", "Rock": "岩石", "Raptor": "迅猛龙", "Triceratops": "三角龙", "Spinosaurus": "棘龙", "Chop": "砍伐", "Gather": "采集", "Mine": "采矿", "Hunt": "狩猎", "Mining": "采矿", "Jurassic goals": "侏罗纪目标", "WASD move · Shift run · Space jump · J chop / mine · E use · Esc leave": "WASD 移动 · Shift 奔跑 · Space 跳跃 · J 砍伐 / 采矿 · E 使用 · Esc 离开", "Alpha Raptor": "阿尔法迅猛龙", "Boss · Lv 10": "首领 · Lv 10", "Jurassic World": "侏罗纪世界", "Jurassic World · Coming soon": "侏罗纪世界 · 即将开放", "Jurassic World is coming soon. The portal opens to everyone at launch.": "侏罗纪世界即将开放，正式上线后传送门向所有人开放。", "Jurassic World couldn't open": "无法打开侏罗纪世界", "Back to the village": "返回村庄", "Village": "村庄", "Primeval Plains · GM preview": "原始草原 · GM预览", "A first look at the land. More dinosaurs, hunting and rewards come next.": "先来看看这片土地。更多恐龙、狩猎和奖励即将加入。", "WASD move · Shift run · Space jump · drag to look · Esc leave": "WASD移动 · Shift奔跑 · 空格跳跃 · 拖动转视角 · Esc离开", "Primeval Plains": "原始草原", "What should I do next?": "接下来该做什么？", "{n} ARCL": "{n} ARCL", "A pet egg": "宠物蛋", "Advanced Pickaxe · 7 days": "高级镐 · 7天", "The welcome week is over. Thanks for playing!": "欢迎周已结束，感谢游玩！", "Day {n}": "第{n}天", "New player gifts": "新玩家礼物", "Welcome Week": "欢迎周", "One gift a day, seven in all. Days off are fine: finish within {n} days.": "每天一份，共七份。中途休息也没关系：{n}天内领完即可。", "Sign in to claim": "登录领取", "Claim day {n}": "领取第{n}天", "Come back tomorrow for day {n}": "明天再来领第{n}天", "Couldn't claim the gift. Try again.": "领取失败，请重试。", "Day {n} gift: {g}": "第{n}天礼物：{g}", "ready in the ARCL Mine": "可在ARCL矿场使用", "Gifts": "礼物", "Ores": "矿石", "This week": "本周", "Upgrade": "强化", "Each level: 4% fewer hits a rock, up to +10": "每级每块岩石少敲 4%，最高 +10", "+1 for": "+1 需要", "+10, the most": "+10，已满级", "Advanced Pickaxe trial: {t} left": "高级镐试用：剩余 {t}", "Back to the mine": "回到矿洞", "Go down to the deep mine (Lv 90+): tougher rocks, more gold": "进入深层矿洞（Lv 90+）：岩石更硬，金更多", "Ore pieces and gems are kept for signed-in miners. Connect your wallet to collect them.": "矿石碎片和宝石只为已登录的矿工保存。连接钱包即可收集。", "Every rock that isn't empty gives ore pieces. Use them to upgrade your pickaxe, or smelt them into scrap for your gear.": "每块非空岩石都会给矿石碎片。可用来强化镐子，或熔炼成装备用的废料。", "Copper": "铜", "Silver": "银", "Gold": "金", "Smelt {a} → {b} scrap": "熔炼 {a} → 废料 {b}", "Gem codex": "宝石图鉴", "Sapphire": "蓝宝石", "Ruby": "红宝石", "Diamond": "钻石", "Sapphire!": "蓝宝石！", "Ruby!": "红宝石！", "Diamond!": "钻石！", "A gem for your codex": "图鉴新增宝石", "Rocks broken: copper {a} · silver {b} · gold {c}": "敲碎岩石：铜 {a} · 银 {b} · 金 {c}", "ARCL mined this week (Monday to Sunday). The board resets each week.": "本周（周一至周日）挖到的 ARCL。榜单每周重置。", "The ARCL Mine": "ARCL 矿洞", "Gold Rush": "淘金热", "Deep mine": "深层矿洞", "Pickaxe +{n}: 4% fewer hits a rock": "镐子 +{n}：每块岩石少敲 4%", "+{n} scrap for your gear": "装备废料 +{n}", "The deep mine opens at level 90": "深层矿洞 90 级开放", "The deep mine: tougher rocks, more gold": "深层矿洞：岩石更硬，金更多", "Back in the mine": "回到了矿洞", "No one has mined this week yet": "本周还没有人挖矿", "Miner": "矿工", "Pickaxes · ore · this week": "镐子 · 矿石 · 本周", "the miner": "矿工", "ARCL Mine": "ARCL 矿洞", "Copper, silver and gold rocks · 60 minutes, then a 6-hour rest": "铜、银、金矿石 · 60 分钟后休息 6 小时", "Rocks": "岩石", "Leave the mine": "离开矿洞", "Leave": "离开", "left": "剩余", "ARCL this visit": "本次 ARCL", "Common": "普通", "Advanced": "高级", "Rare": "稀有", "Legendary": "传说", "Left": "左", "Right": "右", "Mine": "挖矿", "MINE": "挖矿", "A / D move · Space or J mine · Esc leave": "A / D 移动 · 空格或 J 挖矿 · Esc 离开", "ARCIRCLE WORLD": "ARCIRCLE WORLD", "ARCL MINE": "ARCL 矿洞", "Demo: connect your wallet to earn ARCL here": "体验模式：连接钱包即可在这里赚取 ARCL", "Today {n} / {m} ARCL": "今日 {n} / {m} ARCL", "Common Pickaxe": "普通镐", "Advanced Pickaxe": "高级镐", "Rare Pickaxe": "稀有镐", "Legendary Pickaxe": "传说镐", "{n}% fewer hits a rock": "每块岩石少敲 {n}%", "rocks {n}% faster": "岩石出现快 {n}%", "Copper in 10–20 hits": "铜矿 10–20 下", "In hand": "使用中", "Owned": "已拥有", "Pickaxes": "镐子", "A better pickaxe breaks rocks in fewer hits, and more rocks turn up in your hour. You always mine with the best one you own.": "镐子越好，敲碎岩石所需次数越少，一小时内出现的岩石也越多。你总是用自己最好的那把镐挖矿。", "Copper 10–100 · Silver 100–1,000 · Gold 1,000–10,000 ARCL. About 1 rock in 5 is empty. Gold is rare, and a full 10,000 far rarer.": "铜 10–100 · 银 100–1,000 · 金 1,000–10,000 ARCL。大约每 5 块岩石有 1 块是空的。金矿很稀有，满额 10,000 更加稀有。", "Close": "关闭", "Check your wallet…": "请查看你的钱包…", "Your new pickaxe is in your hands.": "新镐子已经拿在手上了。", "ARCL (demo, not paid)": "ARCL（体验，不发放）", "Gold rocks broken: {n}": "敲碎的金矿：{n} 块", "Back to the village": "回到村庄", "Lost the mine's connection. Back to the village.": "矿洞连接中断，返回村庄。", "That rock didn't break: {e}": "岩石没有敲碎：{e}", "try again": "请重试", "Empty!": "空的！", "daily mine limit": "今日挖矿上限", "Your hour in the mine is up": "你在矿洞的一小时结束了", "Leaving the mine": "正在离开矿洞", "The mine is resting. It opens again in {t}.": "矿洞休息中，{t} 后重新开放。", "The mine couldn't open: {e}": "矿洞无法打开：{e}", "Demo: nothing you mine is paid. Connect your wallet to earn.": "体验模式：挖到的不会发放。连接钱包即可赚取。", "{t} left in the mine · rocks hold 10–10,000 ARCL": "矿洞剩余 {t} · 每块岩石 10–10,000 ARCL", "Mining Village": "采矿村", "The ARCL Mine · copper, silver, gold": "ARCL 矿洞 · 铜、银、金", "Walk in to mine": "走进去挖矿", "Enter the ARCL Mine": "进入 ARCL 矿洞", "The ARCL Mine couldn't start": "ARCL 矿洞无法开始", "The ARCL Mine couldn't load. Refresh the page and try again.": "ARCL 矿洞加载失败。请刷新页面后重试。", "ARCL Mine · opens in {t}": "ARCL 矿洞 · {t} 后开放", Soon: "即将推出", Colour: "颜色", "Hide quests": "收起任务", "Show quests": "显示任务", "Beat Stomp · your best": "节拍踩踏 · 我的最佳", "Weekly prizes: 10,000 · 5,000 · 2,500 ARCL": "每周奖金：10,000 · 5,000 · 2,500 ARCL", "Start Beat Stomp": "开始节拍踩踏", "Beat Stomp couldn't start": "节拍踩踏无法开始", "Wave {n}": "第 {n} 波", "AC Defense · this week": "AC 防御 · 本周", "No runs yet — be the first!": "还没有记录——成为第一个吧！", "Loading…": "加载中…", "Coin Jump · your best": "金币跳跃 · 我的最佳", "Islands": "岛屿", "Right-click": "右键", "Adventure log": "冒险日志", "Start Coin Jump": "开始金币跳跃", "Coin Jump couldn't start": "金币跳跃无法开始", "Jump to the crown · walk in to play": "跳到王冠 · 走进去开始", "Tower defence · walk in to play": "塔防 · 走进去开始", "Weekend 2×: double XP and double ARCL from play": "周末双倍：经验和游戏 ARCL 翻倍", "Streak shield used: you missed a day, but your streak goes on (once a week)": "已使用连签保护：漏签一天，连签继续（每周一次）", "a heart (+100 ARCL)": "一颗爱心（+100 ARCL）", "Heart sent — your friend gets 100 ARCL": "爱心已送出 — 好友获得 100 ARCL", "hearts open at level 5": "5 级起可送爱心", "one heart a day — more tomorrow": "每天一颗爱心 — 明天再送", "they've had 5 hearts today — try tomorrow": "对方今天已收到 5 颗爱心 — 明天再试", "A new village west of the plaza for mini-games. AC Defense is the first tower: walk in and defend the Core.": "广场西边新开了小游戏村。第一座建筑是 AC 防御塔：走进去守护核心。", "Hatch companions from eggs, 27 to collect. Each one follows you and helps in its own way.": "从蛋中孵化伙伴，共 27 种可收集，每只都会跟随你并以自己的方式帮忙。", "Talk with players near you, send 1:1 messages and add friends.": "与附近的玩家聊天，发送私信并添加好友。", "The Game Village": "游戏村", "Earlier updates": "之前的更新", "Friends and chat": "好友和聊天", "New version — updating…": "新版本 — 更新中…", "AC Defense couldn't load. Refresh the page and try again.": "AC 防御加载失败。请刷新页面后重试。", "AC Defense couldn't start": "AC 防御无法启动", "Game Village": "游戏村", "Mini-games · more coming": "小游戏 · 更多即将推出", "Tower defence · walk in to play": "塔防 · 走进去开始游戏", "Enter {x}": "进入{x}", "AC Defense": "AC 防御", "Start AC Defense": "开始 AC 防御", "Quit AC Defense first": "请先退出 AC 防御", "Getting ready": "准备中", "Frame limit": "帧率上限", "Recent messages": "最近消息", Recent: "最近", "Nothing yet": "暂无", now: "刚刚", Bag: "背包", Craft: "制作", Pets: "宠物", Build: "建造", Help: "帮助", Bricks: "积木", Colours: "颜色", Height: "高度", Trophies: "奖杯", Lights: "灯光", Plants: "植物", Theme: "主题", Character: "角色", Log: "冒险日志", Village: "村庄", Later: "稍后", Pick: "选择", Visit: "访问", Cottage: "小屋", Castle: "城堡", Palace: "宫殿", Music: "音乐", Film: "胶片", Vivid: "鲜艳", Time: "时间", Now: "现在", Morning: "清晨", Noon: "正午", Dusk: "黄昏", Night: "夜晚", Vibration: "振动", Inbox: "收件箱", Gifts: "礼物", Guestbook: "留言簿", Race: "竞速", Finish: "完成", Wardrobe: "衣橱", Head: "头部", Face: "面部", Neck: "颈部", Back: "背部", Aura: "光环", Lock: "锁定", Unlock: "解锁", Locked: "已锁定", power: "战力", Equip: "装备", Minimap: "小地图", Show: "显示", On: "开", Reply: "回复", Medium: "中", Ultra: "极致", "Frame rate": "帧率", Level: "等级", Friend: "好友", Say: "说话", GG: "GG", Companions: "伙伴", "Hi!": "你好！", Filter: "滤镜", Sticker: "贴纸", Pose: "姿势", None: "无", Focus: "焦点", Off: "关", Soft: "柔和", Strong: "强烈", Warm: "暖色", Cool: "冷色", Noir: "黑白", Neon: "霓虹", Wave: "挥手", Sit: "坐下", Point: "指向", Update: "更新", Title: "称号", Hoverboard: "滑板", Jump: "跳跃", Mirror: "镜像", Moving: "移动", Menus: "菜单", Buttons: "按钮", Space: "空格", Click: "点击", Drag: "拖动", Wheel: "滚轮", Tap: "点按", Move: "移动", Look: "视角", Wave: "挥手", No: "不", Sit: "坐下", Point: "指向", Cheer: "欢呼", Dance: "跳舞", Faint: "晕倒", Controls: "操作说明", Shop: "商店", Fighting: "战斗", Attack: "攻击", Layout: "界面布局", Compact: "电脑版", Large: "大字", Skip: "跳过", Quests: "任务", Map: "地图", Menu: "菜单", Settings: "设置", Graphics: "画质", Auto: "自动", High: "高", Low: "低", Language: "语言", Account: "账户", Sound: "声音", Today: "今日", Badges: "徽章", Name: "名字", "Level up": "升级", online: "在线", Player: "玩家", visited: "已访问", yours: "我的币", ready: "就绪", bought: "买入", sold: "卖出",
    move: "移动", jump: "跳跃", run: "奔跑", enter: "进入", board: "滑板", emote: "表情", photo: "拍照", map: "地图", help: "帮助", "drag to look": "拖动查看",
    attack: "攻击", dodge: "闪避", skill: "技能", potions: "药水", read: "阅读", talk: "交谈", go: "前往", look: "视角", speed: "加速" },
  tr: { "Launchpad Village": "Launchpad Köyü", "Utility Village": "Araçlar Köyü", "Back to town": "Kasabaya dön", "Villages": "Köyler", "Go to {x}": "{x} yerine git", "LAUNCHPAD VILLAGE": "LAUNCHPAD KÖYÜ", "UTILITY VILLAGE": "ARAÇLAR KÖYÜ", "Every coin launched on ArcPad has a lot here": "ArcPad'de çıkan her coin'in burada bir arsası var", "ARCIRCLE's utilities: launch, swap, stake, scan": "ARCIRCLE araçları: çıkar, takas et, stake et, tara", "Newest launch": "En yeni çıkış", "Starter lot": "Başlangıç arsası", "{t} lot": "{t} arsa", "{n} here now": "Şu an {n} kişi", "Jack's Inferno Blade": "Jack'in Cehennem Kılıcı", "Pumpkin King": "Balkabağı Kral", "Inferno Jack": "Cehennem Jack", "Defeated tonight · back tomorrow night": "Bu gece yenildi · yarın gece geri döner", "Wakes at {t} · Lv {n}": "{t}'de uyanır · Lv {n}", "Lv {n} at night": "Gece Lv {n}", "{x} fell! The top 3 hitters share its reward.": "{x} düştü! En çok vuran 3 kişi ödülü paylaşır.", "Sign in with a wallet so your hits on the Pumpkin Kings count": "Balkabağı Krallara vuruşlarının sayılması için cüzdanla giriş yap", "This Pumpkin King is for level {n}+ — your hits won't count": "Bu Balkabağı Kral {n}+ seviye için — vuruşların sayılmaz", "HALLOWEEN · PUMPKIN KING": "CADILAR BAYRAMI · BALKABAĞI KRAL", "Place {n} against {x}": "{x} karşısında {n}. sıra", "It's in your bag.": "Çantanda.", "Great!": "Harika!", "🎃 The Pumpkin Kings wake in 5 minutes — and rampage!": "🎃 Balkabağı Krallar 5 dakika içinde uyanıyor — ve çıldırıyor!", "🔥 The Pumpkin Kings awaken! Inferno Jack rampages until 05:00 US Eastern.": "🔥 Balkabağı Krallar uyandı! Cehennem Jack ABD Doğu 05:00'e kadar çıldırıyor.", "Halloween · everyone's HP": "Cadılar Bayramı · herkesin canı", "Go to the gate": "Kapıya git", "Tower": "Kulesi", "Open it now": "Hemen aç", "SURVIVORS ARENA": "SURVIVORS ARENA", "First Survivor": "İlk Hayatta Kalan", "Boss Slayer": "Boss Avcısı", "Crowd Breaker": "Kalabalık Kıran", "Evolver": "Evrimci", "Arena Master": "Arena Ustası", "Survive 12 minutes": "12 dakika hayatta kal", "Defeat 10 bosses in all": "Toplam 10 boss yen", "1,000 knock-outs in one run": "Tek oyunda 1.000 nakavt", "Discover 3 evolutions": "3 evrim keşfet", "Survive 12 minutes on Hard": "Zor'da 12 dakika hayatta kal", "Survive 12 minutes on Hard 5 times": "Zor'da 5 kez 12 dakika hayatta kal", "Official partners of ARCIRCLE WORLD": "ARCIRCLE WORLD'ün resmî ortakları", "Finance Hub · Swap · Klik · Disperse": "Finans Merkezi · Swap · Klik · Disperse", "Buy $ARCIRCLE the easy way with KAIRO Klik.": "KAIRO Klik ile $ARCIRCLE'ı kolayca al.", "Partner plot": "Ortak arsası", "PARTNER VILLAGE": "ORTAK KÖYÜ", "Finance Hub": "Finans Merkezi", "Official partner": "Resmî ortak", "Partner Village": "Ortak Köyü", "KAIRO Finance Hub": "KAIRO Finans Merkezi", "Couldn't open it — try again": "Açılamadı — tekrar dene", "$ARCIRCLE token address (paste it in Swap)": "$ARCIRCLE token adresi (Swap'a yapıştır)", "KAIRO's Web3 utilities on Arc, one tap from ARCIRCLE WORLD.": "KAIRO'nun Arc üzerindeki Web3 araçları, ARCIRCLE WORLD'den tek dokunuşla.", "More partners are coming to the Partner Village.": "Ortak Köyü'ne daha fazla ortak geliyor.", "These open kairo.market in a new tab. Check the address and every transaction in your own wallet before you sign.": "Bunlar kairo.market'i yeni sekmede açar. İmzalamadan önce adresi ve her işlemi kendi cüzdanında kontrol et.", "Swap": "Takas", "Klik": "Klik", "Disperse": "Disperse", "Buy and swap $ARCIRCLE and other Arc tokens.": "$ARCIRCLE ve diğer Arc tokenlarını al ve takas et.", "Send tokens to many wallets at once — for rewards, tournaments and community events.": "Tek seferde birçok cüzdana token gönder — ödüller, turnuvalar ve topluluk etkinlikleri için.", "Docs": "Belgeler", "Copied": "Kopyalandı", "Under construction": "Yapım aşamasında", "AGENT DIMENSION is being built. It opens soon — stay tuned!": "AGENT DIMENSION inşa ediliyor. Yakında açılıyor — takipte kal!", "Coming soon": "Yakında", "Create your own AI agent — AURORA, ORION or VEX — and let it walk, talk and run errands with you.": "Kendi yapay zekâ ajanını yarat — AURORA, ORION ya da VEX — seninle yürüsün, konuşsun ve görevlere gitsin.", "OK": "Tamam", "A day (USDC)": "Günlük (USDC)", "Add rule": "Kural ekle", "Agent Vault — opening soon": "Ajan Kasası — yakında", "Allow token": "Tokena izin ver", "Buy {u} USDC of {t} at ≤ ${p}": "{t} ≤ ${p} olunca {u} USDC al", "Buy {u} USDC of {t} every {h}h": "Her {h} saatte {u} USDC {t} al", "Cancelled in your wallet": "Cüzdanında iptal edildi", "Check the numbers: at most 100 USDC a trade": "Sayıları kontrol et: işlem başına en fazla 100 USDC", "Enter a token address (0x…)": "Token adresi gir (0x…)", "Every trade is at most 100 USDC. The fee is paid in $ARCIRCLE from the vault. Money only ever goes back to your own wallet, and every vault step is signed in your wallet.": "Her işlem en fazla 100 USDC. Ücret kasadan $ARCIRCLE ile ödenir. Para yalnızca kendi cüzdanına döner ve kasanın her adımı cüzdanında imzalanır.", "Fee a trade: {f} $ARCIRCLE": "İşlem ücreti: {f} $ARCIRCLE", "I already have one": "Zaten var", "Left today": "Bugün kalan", "No USDC in the vault": "Kasada USDC yok", "No rules yet — add one below.": "Henüz kural yok — aşağıdan ekle.", "One vault per wallet, on Arc. You set the limits; the agent can never go over them.": "Cüzdan başına bir kasa, Arc üzerinde. Limitleri sen belirlersin; ajan asla aşamaz.", "Open my vault": "Kasamı aç", "Open your Agent Vault": "Ajan Kasanı aç", "Opening your vault…": "Kasan açılıyor…", "Per trade": "İşlem başı", "Per trade (USDC)": "İşlem başı (USDC)", "Per trade: 1–100 USDC; a day at least that; a wait of at least 1 minute": "İşlem başı 1–100 USDC; günlük en az bu kadar; en az 1 dakika bekleme", "Sell {n}% of {t} at ≤ ${p}": "{t} ≤ ${p} olunca %{n} sat", "Sell {n}% of {t} at ≥ ${p}": "{t} ≥ ${p} olunca %{n} sat", "Sent — it shows here once Arc confirms it": "Gönderildi — Arc onaylayınca burada görünür", "Start the agent": "Ajanı başlat", "Stop the agent": "Ajanı durdur", "Wait between trades (min)": "İşlemler arası bekleme (dk)", "Withdraw all USDC": "Tüm USDC'yi çek", "Your agent will trade for you from your own vault on Arc: buy every few hours, buy a dip, take profit, stop loss.": "Ajanın Arc'taki kendi kasandan senin için işlem yapar: birkaç saatte bir al, düşüşte al, kâr al, zarar durdur.", "Your vault is linked": "Kasan bağlandı", "agent off": "ajan kapalı", "done": "tamam", "dry run: the agent's key isn't set yet": "deneme: ajanın anahtarı henüz ayarlanmadı", "failed": "başarısız", "on Arcscan": "Arcscan'de", "paused": "duraklatıldı", "ready (dry run)": "hazır (deneme)", "{n} trades": "{n} işlem", "Buy every few hours": "Birkaç saatte bir al", "Buy when the price drops to": "Fiyat düşünce al", "Take profit at": "Kâr al fiyatı", "Stop loss at": "Zarar durdur fiyatı", "USDC (≤ 100)": "USDC (≤ 100)", "% of the bag": "Elindekinin %'si", "Every … hours": "Her … saatte", "Price ($)": "Fiyat ($)", "Token address (0x…)": "Token adresi (0x…)", "Rules": "Kurallar", "Activity": "Etkinlik", "Vault": "Kasa", "Remove": "Kaldır", "Resume": "Sürdür", "Pause": "Duraklat", "Agent": "Ajan", "Birth": "Doğuş", "Pick": "Seç", "ID & name": "ID ve ad", "Couldn't check now — it's checked when you create": "Şu an kontrol edilemedi — oluştururken kontrol edilir", "Errands done": "Biten görevler", "Genesis Founder": "Genesis Kurucusu", "Level": "Seviye", "Meet {n}, my AI agent in ARCIRCLE WORLD's AGENT DIMENSION!": "ARCIRCLE WORLD AGENT DIMENSION'daki yapay zekâ ajanım {n} ile tanışın!", "My AI agent": "Yapay zekâ ajanım", "No errands this week yet — be the first!": "Bu hafta henüz görev yok — ilk sen ol!", "No errands yesterday — send me out today!": "Dün görev yoktu — bugün beni gönder!", "No free errand slot right now.": "Şu an boş görev yuvası yok.", "Number": "Numara", "On my way!": "Yola çıkıyorum!", "Send {n}: {j}?": "{n} gönderilsin mi: {j}?", "This week's busiest agents": "Bu haftanın en çalışkan ajanları", "Today's briefing": "Bugünün özeti", "Today: {d} errands and {c} messages left": "Bugün: {d} görev ve {c} mesaj kaldı", "Yesterday: {n} errand(s)": "Dün: {n} görev", "{d} errands done": "{d} görev tamamlandı", "A kind AI agent who supports, coordinates and helps your journey in ARCIRCLE WORLD.": "ARCIRCLE WORLD'deki yolculuğunu destekleyen, koordine eden ve sana yardım eden nazik bir yapay zekâ ajanı.", "A calm AI agent who plans, operates and finds the next step for your journey in ARCIRCLE WORLD.": "ARCIRCLE WORLD'deki yolculuğun için planlayan, yöneten ve sonraki adımı bulan sakin bir yapay zekâ ajanı.", "A sharp AI agent who scouts, tracks and finds what others miss in ARCIRCLE WORLD.": "ARCIRCLE WORLD'de keşif yapan, iz süren ve başkalarının kaçırdığını bulan keskin bir yapay zekâ ajanı.", "{h}h": "{h}sa", "Agent ID": "Ajan kimliği", "e.g. nova_01": "örn. nova_01", "Pre-launch event": "Lansman öncesi etkinlik", "Create your AI agent for free before AGENT DIMENSION officially opens. After the opening, creating an agent will cost.": "AGENT DIMENSION resmen açılmadan önce yapay zekâ ajanını ücretsiz oluştur. Açılıştan sonra ajan oluşturmak ücretli olacak.", "Create my agent — free": "Ajanımı oluştur — ücretsiz", "Your agent can't move your funds: anything on-chain will always ask your own wallet first.": "Ajanın paranı hareket ettiremez: zincir üstündeki her işlem önce kendi cüzdanına sorulur.", "3–16 letters, numbers or _": "3–16 harf, rakam veya _", "@{id} is taken — try another": "@{id} alınmış — başka bir tane dene", "Checking…": "Kontrol ediliyor…", "@{id} is free": "@{id} kullanılabilir", "That ID can't be used": "Bu kimlik kullanılamaz", "Pre-launch · free AI agent": "Lansman öncesi · ücretsiz ajan", "{h}h {m}m": "{h}sa {m}dk", "{m}m": "{m}dk", "Meet your AI agent": "Yapay zekâ ajanınla tanış", "{n} is back! See what it brought": "{n} döndü! Getirdiklerine bak", "Talk to {n}": "{n} ile konuş", "AGENT DIMENSION": "AGENT DIMENSION", "Lv {n}": "Sv {n}", "Personality": "Kişilik", "e.g. cheerful, loves dinosaurs": "örn. neşeli, dinozor sever", "Create my agent": "Ajanımı oluştur", "Sign in to create your agent": "Ajan oluşturmak için giriş yap", "Your first agent is free. It can't move your funds: anything on-chain will always ask your own wallet first.": "İlk ajanın ücretsiz. Paranı hareket ettiremez: zincir üstündeki her işlem önce kendi cüzdanına sorulur.", "Pick one of the three to see what it does.": "Ne yaptığını görmek için üçünden birini seç.", "Genesis Lab": "Genesis Lab", "Create your Agent. Give it a Purpose.": "Ajanını yarat. Ona bir amaç ver.", "Hi! I'm {n}. Ask me anything about ARCIRCLE World — or send me on an errand.": "Merhaba! Ben {n}. ARCIRCLE World hakkında ne istersen sor — ya da beni bir göreve gönder.", "Say something to {n}": "{n}'e bir şey söyle", "Send": "Gönder", "{n} of {m} messages left today": "Bugün {m} mesajdan {n} kaldı", "Back!": "Döndü!", "{t} left": "{t} kaldı", "See what it brought": "Getirdiklerine bak", "{n}'s specialty +25%": "{n} uzmanlığı +%25", "On the way": "Yolda", "Send {n} on an errand": "{n}'i göreve gönder", "Errands cost ARCL and bring back materials, not ARCL. {k} errand slot(s) · {d} errands left today.": "Görevler ARCL'ye mal olur ve ARCL değil malzeme getirir. {k} görev yuvası · bugün {d} görev kaldı.", "A second slot opens at agent level 5.": "İkinci yuva ajan seviyesi 5'te açılır.", "What {n} does": "{n} ne yapar", "Coming next to AGENT DIMENSION": "AGENT DIMENSION'da sırada", "Agent Academy: skills and new looks as it levels": "Ajan Akademisi: seviye atladıkça yetenekler ve yeni görünümler", "Agent Arena: weekly agent battles": "Ajan Arenası: haftalık ajan savaşları", "Web3 tools: token reports, wallet watch, launch drafts — every on-chain step approved in your own wallet": "Web3 araçları: token raporları, cüzdan takibi, lansman taslakları — zincir üstündeki her adım kendi cüzdanında onaylanır", "{n} is back!": "{n} döndü!", "{n}'s specialty: a quarter more": "{n} uzmanlığı: %25 fazla", "Level up! Lv {n}": "Seviye atladı! Sv {n}", "The ore is in your ARCL Mine bag.": "Cevher ARCL Madeni çantanda.", "The materials are in your Jurassic pack.": "Malzemeler Jurassic çantanda.", "Great!": "Harika!", "Something went wrong — try again": "Bir şeyler ters gitti — tekrar dene", "No connection — try again": "Bağlantı yok — tekrar dene", "{n} is online!": "{n} çevrimiçi!", "{n} set off — back in {t}": "{n} yola çıktı — {t} sonra döner", "Saved": "Kaydedildi", "copper ore": "bakır cevheri", "silver ore": "gümüş cevheri", "wood": "odun", "stone": "taş", "fiber": "lif", "berries": "meyve", "hide": "deri", "bone": "kemik", "meat": "et", "fang": "diş", "Cheerful and kind": "Neşeli ve nazik", "Calm and wise": "Sakin ve bilge", "Witty and bold": "Esprili ve cesur", "Brave and loyal": "Cesur ve sadık", "Curious explorer": "Meraklı kâşif", "Caretaker & Coordinator": "Bakıcı ve Koordinatör", "Strategist & Operator": "Stratejist ve Operatör", "Analyst & Hunter": "Analist ve Avcı", "A brighter world, together.": "Birlikte, daha parlak bir dünya.", "From data to a better tomorrow.": "Veriden daha iyi bir yarına.", "See beyond. Find what others miss.": "Ötesini gör. Başkalarının kaçırdığını bul.", "Gathers wood and stone for your camp (+25%)": "Kampın için odun ve taş toplar (+%25)", "Keeps you company and keeps track of things": "Sana eşlik eder ve işleri takip eder", "Later: watches your wallet and reminds you of claims": "Sonra: cüzdanını izler ve talepleri hatırlatır", "Mines ore while you're away (+25%)": "Sen yokken cevher kazar (+%25)", "Plans your next step with you": "Sonraki adımını seninle planlar", "Later: drafts token launches you approve in your wallet": "Sonra: cüzdanında onayladığın token lansman taslakları hazırlar", "Scouts and hunts in Jurassic (+25%)": "Jurassic'te keşif yapar ve avlanır (+%25)", "Spots scams and tricks with you": "Dolandırıcılıkları seninle birlikte fark eder", "Later: token safety reports with a public track record": "Sonra: herkese açık geçmişi olan token güvenlik raporları", "Tell me about yourself": "Bana kendinden bahset", "Any tips for Jurassic World?": "Jurassic World için ipucu var mı?", "Gather in Jurassic": "Jurassic'te topla", "Mine ore": "Cevher kaz", "Scout & hunt": "Keşif ve av", "AI Agent": "Yapay Zekâ Ajanı", "Couldn't open your agent — try again": "Ajanın açılamadı — tekrar dene", "A meteor shower in 5 minutes": "5 dakika sonra meteor yağmuru", "A storm in 5 minutes": "5 dakika sonra fırtına", "Antidote": "Panzehir", "Bog Stalker": "Bataklık Avcısı", "Bola": "Bola", "Brush the fossil free": "Fosili fırçayla çıkar", "Camps": "Kamplar", "Couldn't leave a note": "Not bırakılamadı", "Couldn't like it": "Beğenilemedi", "Couldn't tame: {e}": "Evcilleştirilemedi: {e}", "Dig": "Kaz", "Drag across the dirt — gently": "Toprağın üzerinde yavaşça sürükle", "Eat an antidote, or wait it out away from the water.": "Panzehir ye ya da sudan uzakta bekle.", "Fossil": "Fosil", "Glowing stones will fall on the plain — mine them for gold and silver.": "Ovaya parlayan taşlar düşecek — altın ve gümüş için kaz.", "Great build!": "Harika yapı!", "Hunt together soon?": "Yakında birlikte avlanalım mı?", "It broke free — try again with another bola": "Kurtuldu — başka bir bolayla tekrar dene", "Leave a note": "Not bırak", "Like": "Beğen", "Lovely camp!": "Çok güzel kamp!", "Meteorite": "Göktaşı", "Mud": "Çamur", "No camps yet": "Henüz kamp yok", "No notes yet — be the first": "Henüz not yok — ilk sen ol", "Poison water · swamp boots keep you dry": "Zehirli su · bataklık çizmeleri seni kuru tutar", "Poison water!": "Zehirli su!", "Poisoned!": "Zehirlendin!", "Reed": "Kamış", "Reeds": "Kamışlar", "See you at the boss hour!": "Boss saatinde görüşürüz!", "Seen · hunted · tamed or hunted 10 times": "Görüldü · avlandı · evcilleştirildi ya da 10 kez avlandı", "Sign in to like and leave notes": "Beğenmek ve not bırakmak için giriş yap", "Swamp boots": "Bataklık çizmeleri", "Swamp boots keep you dry — make them at the workbench.": "Bataklık çizmeleri seni kuru tutar — tezgâhta yap.", "TAMED": "EVCİLLEŞTİRİLDİ", "Tame": "Evcilleştir", "Tamed!": "Evcilleştirildi!", "Taming needs a bola (make one from rope and stone) and 3 berries": "Evcilleştirmek için bir bola (ip ve taştan) ve 3 böğürtlen gerekir", "Thanks for the fire!": "Ateş için teşekkürler!", "The Whispering Mire": "Fısıldayan Bataklık", "The Whispering Mire, in the west": "Batıdaki Fısıldayan Bataklık", "The raptors get restless in the thunder.": "Gök gürültüsünde raptorlar huzursuzlanır.", "The {d} walks with you for this visit.": "{d} bu ziyaret boyunca seninle yürür.", "Venom": "Zehir", "Visit": "Ziyaret et", "Visit a camp, leave a note and a like. The most-liked camps this week are on top.": "Bir kampı ziyaret et, not ve beğeni bırak. Bu haftanın en çok beğenilen kampları en üstte.", "Watch out for raptors!": "Raptorlara dikkat!", "bola + 3 berries": "bola + 3 böğürtlen", "METEOR SHOWER": "METEOR YAĞMURU", "STORM": "FIRTINA", "Mine the fallen stars": "Düşen yıldızları kaz", "Stay near your fire": "Ateşinin yakınında kal", "Meteor shower": "Meteor yağmuru", "Storm": "Fırtına", "A bite! Reel it in": "Vurdu! Çek onu", "Back on your feet": "Yeniden ayaktasın", "Crews this week": "Bu haftanın ekipleri", "ENRAGED": "ÖFKELİ", "Go to my camp": "Kampıma git", "Hunt it together!": "Birlikte avlayın!", "Hunt it together: 10 hits each for a hunter's share.": "Birlikte avlayın: avcı payı için kişi başı 10 vuruş.", "Hunter": "Avcı", "It's here — hunt it together!": "Burada — birlikte avlayın!", "Keep going": "Devam et", "Last hit: {n}": "Son vuruş: {n}", "Make armour": "Zırh yap", "Nothing to make yet — gather more first": "Henüz yapılacak bir şey yok — önce daha fazla topla", "Only what I can make now": "Sadece şimdi yapabildiklerim", "PERFECT!": "MÜKEMMEL!", "Ping": "İşaret", "Seen · hunted · hunted 10 times": "Görüldü · avlandı · 10 kez avlandı", "Sign in to ping the hunters round you": "Yakındaki avcılara işaret göndermek için giriş yap", "Take me there": "Beni oraya götür", "WEAK SPOT": "ZAYIF NOKTA", "Watch out for the {d}.": "{d}'e dikkat et.", "Your hits: {n}": "Vuruşların: {n}", "Your pack, tools and camp are all still yours.": "Çantan, aletlerin ve kampın hâlâ senin.", "a hunter's share is yours": "avcı payı senin", "for holding the night raid": "gece baskınını püskürttüğün için", "hits": "vuruş", "{b} is enraged — boss hour!": "{b} öfkeli — boss saati!", "{b} wakes in 5 minutes": "{b} 5 dakika sonra uyanıyor", "Dinosaur here!": "Burada dinozor!", "Help me!": "Yardım et!", "Gather here": "Burada toplan", "Connect your wallet first": "Önce cüzdanını bağla", "Creator Market": "Yaratıcı Pazarı", "Low HP!": "Can az!", "Drink a potion (the red bottle), or run: the gate and a camp with a fire are safe.": "Bir iksir iç (kırmızı şişe) ya da kaç: kapı ve ateşi yanan bir kamp güvenli.", "Knocked out by a {d}": "{d} seni yere serdi", "Tip: make a spear and hide armour at your workbench, and fight near your campfire — dinosaurs don't follow you in.": "İpucu: tezgâhta mızrak ve deri zırh yap, kamp ateşinin yanında dövüş — dinozorlar içeri girmez.", "Your hits: {n} / {m} for a share": "Vuruşların: {n} / {m} (pay için)", "{n} hunters": "{n} avcı", "Not back yet: it returns in {m} min": "Henüz dönmedi: {m} dk sonra döner", "Your sign-in ran out — sign in again and your swings count": "Oturumun sona erdi — yeniden giriş yap, vuruşların sayılsın", "Platform fee": "Platform ücreti", "Planned $ARCL token fee: 2% a transaction (1% $ARCIRCLE buyback & burn, 1% ARCIRCLE WORLD development). In-game ARCL has no fee today.": "Planlanan $ARCL token ücreti: işlem başına %2 (%1 $ARCIRCLE geri alım ve yakım, %1 ARCIRCLE WORLD geliştirme). Oyun içi ARCL'de bugün ücret yok.", "Tap again to buy": "Satın almak için tekrar dokun", "Blueprints built by players, for ARCL": "Oyuncuların yaptığı planlar, ARCL ile", "Sign in with your wallet to buy, sell and see your ARCL.": "Almak, satmak ve ARCL'ini görmek için cüzdanınla giriş yap.", "Best-selling": "En çok satan", "Newest": "En yeni", "bricks": "tuğla", "by {n}": "yapan: {n}", "{n} sold": "{n} satıldı", "No blueprints for sale yet — build something on your island and be the first to sell one!": "Henüz satılık plan yok — adanda bir şey kur ve ilk satan sen ol!", "Build on my island": "Adamda kur", "Blueprints you buy are kept here for good. Build them on your island as often as you like.": "Aldığın planlar burada kalıcı olarak saklanır. Adanda istediğin kadar kurabilirsin.", "Sell your island as a blueprint. Buyers build a copy on their own island; yours stays as it is.": "Adanı plan olarak sat. Alıcılar kendi adalarına bir kopyasını kurar; seninki olduğu gibi kalır.", "e.g. Sky Castle": "ör. Gökyüzü Kalesi", "Name": "Ad", "Price (ARCL)": "Fiyat (ARCL)", "to you, 14 days after each sale": "her satıştan 14 gün sonra sana", "to the platform": "platforma", "The part a buyer paid with ARCL bought through the Exchange can be settled to $ARCIRCLE; the rest you spend in the game.": "Alıcının Takas'tan aldığı ARCL ile ödediği kısım $ARCIRCLE'a çevrilebilir; kalanını oyunda harcarsın.", "List my island": "Adamı listele", "Your listings": "Listelerin", "On hold": "Beklemede", "next in {d} days": "sonraki {d} gün içinde", "nothing waiting": "bekleyen yok", "Settleable": "Çevrilebilir", "to $ARCIRCLE": "$ARCIRCLE'a", "Game only": "Sadece oyun", "spend in the game": "oyunda harca", "{n} sales so far · {g} ARCL in total": "Şimdiye kadar {n} satış · toplam {g} ARCL", "Settle to $ARCIRCLE (at least {m} ARCL)": "$ARCIRCLE'a çevir (en az {m} ARCL)", "Ask to settle": "Çevirme iste", "The ARCL is held at once. The team sets the $ARCIRCLE amount and sends it from the team's wallet on Arc; it's closed when the chain shows the transfer.": "ARCL hemen tutulur. Ekip $ARCIRCLE miktarını belirler ve Arc'taki ekip cüzdanından gönderir; zincir transferi gösterince kapanır.", "Your settlements": "Çevirmelerin", "held {n}": "tutulan {n}", "From play": "Oyundan", "Bought": "Satın alınan", "Every movement": "Tüm hareketler", "Nothing yet — your ARCL movements are written down here from now on.": "Henüz yok — ARCL hareketlerin bundan sonra burada kaydedilir.", "Earned (all)": "Kazanılan (tümü)", "Spent (all)": "Harcanan (tümü)", "Market sales": "Pazar satışları", "Settlements: {a} waiting · {b} approved · {c} paid (ARCL) · {n} listings": "Çevirmeler: {a} bekliyor · {b} onaylı · {c} ödendi (ARCL) · {n} liste", "Settlement queue": "Çevirme sırası", "Quote": "Teklif", "Pay from my wallet": "Cüzdanımdan öde", "Nothing waiting.": "Bekleyen yok.", "A wallet's ledger": "Bir cüzdanın defteri", "Refund a sale on hold": "Bekleyen satışı iade et", "sale id (item_buyer)": "satış kimliği (ürün_alıcı)", "Couldn't buy it: {e}": "Alınamadı: {e}", "It's yours: {t}": "Artık senin: {t}", "Find it under Mine and build it on your island.": "Benimkiler'de bul ve adanda kur.", "Go to your island first (Menu → Island), then sell it from here": "Önce adana git (Menü → Ada), sonra buradan sat", "Build something on your island first": "Önce adanda bir şey kur", "Couldn't list it: {e}": "Listelenemedi: {e}", "On sale: {t}": "Satışta: {t}", "Couldn't ask: {e}": "İstenemedi: {e}", "Settlement asked: {n} ARCL": "Çevirme istendi: {n} ARCL", "The team will look at it.": "Ekip bakacak.", "How much $ARCIRCLE for this settlement?": "Bu çevirme için ne kadar $ARCIRCLE?", "Why is it turned down?": "Neden reddedildi?", "Refunded": "İade edildi", "Settlement paid": "Çevirme ödendi", "Sent, but it couldn't be closed: {e}": "Gönderildi ama kapatılamadı: {e}", "Market": "Pazar", "Mine": "Benimkiler", "Sell": "Sat", "Creator": "Yaratıcı", "Wallet": "Cüzdan", "Team": "Ekip", "Owned": "Sahipsin", "Yours": "Senin", "on sale": "satışta", "off": "kapalı", "Take down": "Kaldır", "Waiting": "Bekliyor", "Approved": "Onaylandı", "Turned down": "Reddedildi", "Balance": "Bakiye", "Earned": "Kazanıldı", "Spent": "Harcandı", "Held": "Tutuldu", "Returned": "İade", "Settled": "Çevrildi", "Sale": "Satış", "Platform": "Platform", "Look up": "Bak", "Refund": "İade et", "bought": "alınan", "creator": "yaratıcı", "held": "tutulan", "ARCL ledger": "ARCL defteri", "The blueprint couldn't open. Try again.": "Plan açılamadı. Tekrar dene.", "The market couldn't open. Try again.": "Pazar açılamadı. Tekrar dene.", "This week's hunters": "Bu haftanın avcıları", "No hunts yet this week — be the first!": "Bu hafta henüz av yok — ilk sen ol!", "Points: raptor 1 · clawstrider 2 · triceratops 3 · spinosaurus 6 · Alpha Raptor 10 · Thornback Titan 12. No prizes — just the glory.": "Puanlar: raptor 1 · pençeli koşucu 2 · triceratops 3 · spinosaurus 6 · Alfa Raptor 10 · Dikensırt Titan 12. Ödül yok — sadece şan.", "Fishing rod": "Olta", "Hide armour": "Deri zırh", "Heat cloak": "Isı pelerini", "Ember Basin": "Kor Havzası", "Hot ground · a heat cloak keeps you in": "Sıcak zemin · ısı pelerini seni korur", "Your heat cloak keeps the heat off.": "Isı pelerinin sıcağı uzak tutuyor.", "Too hot!": "Çok sıcak!", "Without a heat cloak the basin burns you. Make one at the workbench.": "Isı pelerini olmadan havza seni yakar. Tezgâhta bir tane yap.", "Lava! Get out of it": "Lav! Hemen çık", "Boss hour!": "Boss saati!", "The Alpha Raptor is enraged — hunt it together in the southern ruins.": "Alfa Raptor öfkeli — güneydeki harabelerde birlikte avlayın.", "The Thornback Titan is enraged — hunt it together in the north-west meadow.": "Dikensırt Titan öfkeli — kuzeybatı çayırında birlikte avlayın.", "The Alpha Raptor: the ruins in the south": "Alfa Raptor: güneydeki harabeler", "The Thornback Titan: the north-west meadow": "Dikensırt Titan: kuzeybatı çayırı", "The boss fell! Your hunter's share:": "Boss düştü! Avcı payın:", "BOSS DOWN": "BOSS DÜŞTÜ", "Boss hours: 12:00 and 20:00 (Korea time), 30 minutes": "Boss saatleri: 12:00 ve 20:00 (Kore saati), 30 dakika", "hunters": "avcı", "Wave {n} of {m}!": "Dalga {n}/{m}!", "Raiders at your camp!": "Kampına baskın var!", "Raptors are coming in three waves — defend your fire.": "Raptorlar üç dalga hâlinde geliyor — ateşini koru.", "NIGHT RAID": "GECE BASKINI", "Defend your camp": "Kampını savun", "Camp defended!": "Kamp savunuldu!", "The raptors are gone for tonight.": "Raptorlar bu gece için gitti.", "CAMP DEFENDED": "KAMP SAVUNULDU", "Three waves held off": "Üç dalga püskürtüldü", "MADE": "YAPILDI", "FIRST HUNT": "İLK AV", "Obsidian": "Obsidyen", "Sulfur": "Kükürt", "Sulfur vent": "Kükürt bacası", "Fishing spot": "Balık noktası", "Fish": "Balık", "Grilled fish": "Izgara balık", "Sulfur flare": "Kükürt fişeği", "Obsidian spear": "Obsidyen mızrak", "Codex": "Ansiklopedi", "pts": "puan", "Boss down": "Boss düştü", "LIVE": "CANLI", "Boss": "Boss", "No spear": "Mızrak yok", "Spear": "Mızrak", "The plain, in small packs": "Ova, küçük sürüler", "The east woods, a pack of three": "Doğu ormanı, üçlü sürü", "A herd east of the lake": "Gölün doğusunda bir sürü", "In the lake": "Gölde", "The ruins in the south (boss)": "Güneydeki harabeler (boss)", "The north-west meadow (boss)": "Kuzeybatı çayırı (boss)", "Clawstrider": "Pençeli Koşucu", "Daily mission done: {m}": "Günlük görev tamam: {m}", "Sign in to hunt: your spear, your camp and your pack are saved to your wallet": "Avlanmak için giriş yap: mızrağın, kampın ve çantan cüzdanına kaydedilir", "Nice — your first materials!": "Harika — ilk malzemelerin!", "Sign in with your wallet to keep what you gather, build a camp and do the daily missions (300 ARCL each).": "Topladıklarını saklamak, kamp kurmak ve günlük görevleri (her biri 300 ARCL) yapmak için cüzdanınla giriş yap.", "Sign in to keep your {n} materials": "{n} malzemeni saklamak için giriş yap", "Try it: walk to a tree or a fern and tap attack": "Dene: bir ağaca ya da eğrelti otuna yürü ve saldırıya bas", "Build a hut at your camp: {a}/40 wood · {b}/12 stone · {c}/10 fiber": "Kampına bir kulübe kur: {a}/40 odun · {b}/12 taş · {c}/10 lif", "Build a bed in your hut — then you can sleep through the night": "Kulübene bir yatak kur — sonra geceyi uyuyarak geçirebilirsin", "Make an iron-hard axe (hardwood from ancient trees, silver ore, rope)": "Demir sertliğinde balta yap (kadim ağaçlardan sert odun, gümüş cevheri, ip)", "Hunt a Triceratops (the herd east of the lake)": "Bir Triceratops avla (gölün doğusundaki sürü)", "Hunt the Alpha Raptor (boss · the ruins in the south)": "Alfa Raptor'u avla (boss · güneydeki harabeler)", "Hunt the Thornback Titan (boss · the north-west meadow)": "Dikensırt Titan'ı avla (boss · kuzeybatı çayırı)", "Every goal done — keep up the daily missions": "Tüm hedefler tamam — günlük görevlere devam et", "Daily missions": "Günlük görevler", "Missions": "Görevler", "Three a day for taking part — never for winning. They start again at midnight (Korea time).": "Katılım için günde üç tane — asla kazanmak için değil. Gece yarısı (Kore saati) yeniden başlar.", "Signed in: what you gather is saved now": "Giriş yapıldı: topladıkların artık kaydediliyor", "Gather 60 materials": "60 malzeme topla", "Make or build 3 things": "3 şey yap ya da kur", "Cook 2 meals": "2 öğün pişir", "Paid": "Ödendi", "What you gather now is kept for this visit only. Sign in with your wallet to keep it.": "Şimdi topladıkların yalnızca bu ziyaret için tutulur. Saklamak için cüzdanınla giriş yap.", "Chop a tree or pick a fern to try it. Sign in with your wallet to keep what you gather.": "Denemek için bir ağaç kes ya da eğrelti otu topla. Topladıklarını saklamak için cüzdanınla giriş yap.", "Later": "Sonra", "Sign in": "Giriş yap", "Save your progress": "İlerlemeni kaydet", "Your wins and XP so far come with you, and the launch rewards open up.": "Şimdiye kadarki zaferlerin ve XP'n seninle gelir, açılış ödülleri de açılır.", "Keep playing as a guest": "Misafir olarak devam et", "Move to this village": "Bu köye git", "See their island": "Adalarını gör", "View on explorer": "Explorer'da gör", "Start building": "İnşaya başla", "Only the owner": "Yalnızca sahibi", "For sale": "Satılık", "{name}'s village": "{name} köyü", "See {x}": "{x} gör", "Visit {x}": "{x} ziyaret et", "Sold": "Satıldı", "sold": "satıldı", "Held for you": "Senin için ayrıldı", "Being bought": "Satın alınıyor", "Map of the 20 villages": "20 köyün haritası", "Town": "Kasaba", "20 villages on the ring around the town. Buy one with $ARCIRCLE and your island stands there for everyone to see.": "Kasabanın çevresindeki halkada 20 köy. $ARCIRCLE ile birini al, adan herkesin görebileceği şekilde orada dursun.", "Couldn't load LAND — try again": "LAND yüklenemedi — tekrar dene", "My village": "Köyüm", "Price": "Fiyat", "Owner": "Sahibi", "Your island (My Island) stands on this village, for everyone in the town to see": "Adan (My Island) bu köyde durur, kasabadaki herkes görebilir", "Build bigger: a 64×64 island and up to 20,000 bricks": "Daha büyük inşa et: 64×64 ada ve 20.000 brick'e kadar", "One village a wallet. Paid to the ARCIRCLE treasury from your own wallet.": "Cüzdan başına bir köy. Kendi cüzdanından ARCIRCLE hazinesine ödenir.", "Buy with $ARCIRCLE": "$ARCIRCLE ile satın al", "Visit the island": "Adayı ziyaret et", "Build my island": "Adamı inşa et", "All villages": "Tüm köyler", "You already own a village.": "Zaten bir köyün var.", "Village production and rewards are planned, not part of buying. Nothing here pays out.": "Köy üretimi ve ödüller planlanıyor, satın almanın parçası değil. Burada ödeme yapılmaz.", "Sign in with your wallet first": "Önce cüzdanınla giriş yap", "Holding the village for you…": "Köy senin için ayrılıyor…", "Couldn't hold the village — try again": "Köy ayrılamadı — tekrar dene", "Confirm {n} $ARCIRCLE in your wallet…": "Cüzdanında {n} $ARCIRCLE'ı onayla…", "V{n} is yours!": "V{n} artık senin!", "Your island now stands on your village. Build it bigger in My Island.": "Adan artık köyünde duruyor. My Island'da daha büyük inşa et.", "Sent, but the game couldn't confirm it yet — it will once the chain shows it. Open the village again in a minute.": "Gönderildi ama oyun henüz onaylayamadı — zincirde görününce onaylanacak. Bir dakika sonra köyü tekrar aç.", "ARCIRCLE LAND": "ARCIRCLE LAND", "Explorer": "Gezgin", "Copy tx link": "İşlem bağlantısını kopyala", "Transaction link copied": "İşlem bağlantısı kopyalandı", "Wallet address copied": "Cüzdan adresi kopyalandı", "Rewards": "Ödüller", "Copy": "Kopyala", "Send reward": "Ödül gönder", "Couldn't load the rewards — try again": "Ödüller yüklenemedi — tekrar dene", "Total sent": "Toplam gönderilen", "No rewards sent to this player yet.": "Bu oyuncuya henüz ödül gönderilmedi.", "Only a GM wallet can send rewards": "Ödülleri yalnızca GM cüzdanı gönderebilir", "Send a reward": "Ödül gönder", "Your $ARCIRCLE": "$ARCIRCLE bakiyen", "Amount": "Miktar", "Note (optional)": "Not (isteğe bağlı)", "e.g. Weekly event winner": "örn. Haftalık etkinlik kazananı", "Send from my wallet": "Cüzdanımdan gönder", "Your wallet sends the tokens directly to this player. The game only notes it, once the transaction is confirmed.": "Tokenlar doğrudan cüzdanından bu oyuncuya gider. Oyun, işlem onaylandığında yalnızca kaydeder.", "Enter an amount": "Bir miktar gir", "That's more than your $ARCIRCLE": "Bu, $ARCIRCLE bakiyenden fazla", "Wallet connect isn't available here.": "Cüzdan bağlantısı burada kullanılamıyor.", "Switch your wallet to the one you signed in with ({w})": "Giriş yaptığın cüzdana geç ({w})", "Confirm the transfer in your wallet…": "Transferi cüzdanında onayla…", "Sent. Waiting for the transaction to confirm…": "Gönderildi. İşlemin onaylanması bekleniyor…", "Sent, but the game couldn't note it yet: {e}": "Gönderildi, ama oyun henüz kaydedemedi: {e}", "Reward sent: {n} $ARCIRCLE": "Ödül gönderildi: {n} $ARCIRCLE", "Cancelled in the wallet": "Cüzdanda iptal edildi", "The transfer didn't go through: {e}": "Transfer gerçekleşmedi: {e}", "Close": "Kapat", "network": "ağ", "1 player online now": "Şu an 1 oyuncu çevrimiçi", "Play games, earn rewards, and build your village in ARCIRCLE WORLD!": "Oyna, ödül kazan ve ARCIRCLE WORLD'de köyünü kur!", "Adventure": "Macera", "Action": "Aksiyon", "Cards": "Kart", "Puzzle": "Bulmaca", "Mining": "Madencilik", "Strategy": "Strateji", "Platform": "Platform", "Rhythm": "Ritim", "3× EXP potions": "3× EXP iksirleri", "Launch bonus": "Açılış bonusu", "Claim all gifts": "Tüm hediyeleri al", "Inventory": "Envanter", "You joined {name}'s invite!": "{name} davetine katıldın!", "a friend": "bir arkadaş", "Reach level {n} and you both get {a} ARCL and a dinosaur egg.": "{n}. seviyeye ulaş, ikiniz de {a} ARCL ve bir dinozor yumurtası alın.", "Invite reward!": "Davet ödülü!", "+{a} ARCL and a dinosaur egg in the Hatchery — your friend got theirs too.": "+{a} ARCL ve Kuluçkahanede bir dinozor yumurtası — arkadaşın da aldı.", "Sign in with your wallet so your invites count (the link works either way).": "Davetlerinin sayılması için cüzdanınla giriş yap (bağlantı her iki durumda da çalışır).", "Your invites count from level {n} — you're level {l}.": "Davetlerin {n}. seviyeden itibaren sayılır — sen {l}. seviyedesin.", "Invite friends": "Arkadaş davet et", "When a friend you invite reaches level {n}, you both get:": "Davet ettiğin arkadaş {n}. seviyeye ulaştığında ikiniz de alırsınız:", "Each of you, straight into your ARCL balance.": "Her biriniz, doğrudan ARCL bakiyenize.", "A dinosaur egg": "Bir dinozor yumurtası", "Each of you: its grade is rolled like a wild egg's — even Legendary.": "Her biriniz: derecesi vahşi yumurta gibi rastgele — Efsanevi bile.", "You joined {name}'s invite": "{name} davetiyle katıldın", "level {n} for the reward": "ödül için seviye {n}", "Friends you invited": "Davet ettiğin arkadaşlar", "Rewarded": "Ödüllendirildi", "No one yet. Send your link to a friend!": "Henüz kimse yok. Bağlantını bir arkadaşına gönder!", "A friend counts when they're new (level 3 or lower) when they join. Rewards for up to {d} friends a day and {c} in all; your friend always gets theirs.": "Arkadaş katıldığında yeni olmalı (seviye 3 veya altı). Günde en fazla {d}, toplam {c} arkadaş için ödül; arkadaşın her zaman kendininkini alır.", "Invite link copied": "Davet bağlantısı kopyalandı", "Come play ARCIRCLE World with me! 🌍 Raise dinosaurs, play the Game Village, build your island.": "ARCIRCLE World'de benimle oyna! 🌍 Dinozor yetiştir, Oyun Köyü'nde oyna, adanı kur.", "Go back to the town first": "Önce kasabaya dön", "Leave this game first": "Önce bu oyundan çık", "Couldn't start it: {e}": "Başlatılamadı: {e}", "GAMES": "OYUNLAR", "{n} games in ARCIRCLE World — pick one and go.": "ARCIRCLE World'de {n} oyun — birini seç ve git.", "Play": "Oyna", "ARCL you've earned from play today, and the day's limit": "Bugün oyundan kazandığın ARCL ve günlük sınır", "Sign in with your wallet to earn ARCL from the games.": "Oyunlardan ARCL kazanmak için cüzdanınla giriş yap.", "Friends online": "Çevrimiçi arkadaşlar", "Sign in to see your friends.": "Arkadaşlarını görmek için giriş yap.", "in town": "kasabada", "No friends online right now.": "Şu an çevrimiçi arkadaş yok.", "{n} players online now": "Şu an {n} oyuncu çevrimiçi", "New player guide": "Yeni oyuncu rehberi", "Your first five minutes, step by step": "İlk beş dakikan, adım adım", "You both get 1,000 ARCL and a dinosaur egg": "İkiniz de 1,000 ARCL ve bir dinozor yumurtası alırsınız", "Create your character": "Karakterini oluştur", "Your look and your name — done!": "Görünüşün ve adın — tamam!", "Quick guide": "Kısa rehber", "Move, jump, attack and talk. The controls are in Menu → Controls.": "Hareket et, zıpla, saldır ve konuş. Kontroller Menü → Kontroller'de.", "Launch rewards": "Açılış ödülleri", "An Advanced egg, five 3× EXP potions and 5,000 ARCL": "Bir Gelişmiş yumurta, beş 3× EXP iksiri ve 5,000 ARCL", "Sign in": "Giriş yap", "Your first egg": "İlk yumurtan", "Sign in with your wallet to raise a dinosaur": "Dinozor yetiştirmek için cüzdanınla giriş yap", "Pick it up in Jurassic World and care for it for 3 days.": "Jurassic World'de al ve 3 gün bak.", "Play your first game": "İlk oyununu oyna", "Survivors, poker, puzzles, the mine… Try one!": "Survivors, poker, bulmacalar, maden… Birini dene!", "Games": "Oyunlar", "Your first 5 minutes": "İlk 5 dakikan", "{n} of {m} done — one smooth path to your first game.": "{m} adımdan {n} tamam — ilk oyununa tek bir yol.", "All done — have fun out there!": "Hepsi tamam — iyi eğlenceler!", "Rewards": "Ödüller", "Couldn't open the share card": "Paylaşım kartı açılamadı", "Raise · Ride · Survive": "Yetiştir · Bin · Hayatta kal", "Dinosaur eggs, a companion and XP": "Dinozor yumurtaları, bir yoldaş ve XP", "Survive 12 minutes": "12 dakika hayatta kal", "Up to 3,000 ARCL a run · 3 paid runs a day": "Oyun başına en fazla 3,000 ARCL · günde 3 ödüllü oyun", "Hold'em · Blackjack · free chips": "Hold'em · Blackjack · ücretsiz fişler", "300 ARCL a daily mission (never for winning)": "Günlük görev başına 300 ARCL (kazanmak için değil)", "Ring puzzles · daily boards": "Halka bulmacaları · günlük tahtalar", "100 ARCL a new star": "Yeni her yıldız için 100 ARCL", "Mine · Collect": "Kaz · Topla", "10–10,000 ARCL a rock": "Kaya başına 10–10,000 ARCL", "Tower defence": "Kule savunması", "5 ARCL a wave · up to 150 a day": "Dalga başına 5 ARCL · günde en fazla 150", "Jump to the crown": "Taca zıpla", "3,000 ARCL at the crown, once a day": "Taçta 3,000 ARCL, günde bir kez", "Rhythm game": "Ritim oyunu", "World XP": "Dünya XP", "Share card": "Paylaşım kartı", "Share on X": "X'te paylaş", "Save": "Kaydet", "Copy link": "Bağlantıyı kopyala", "Pick X in the share sheet: the picture goes with your post.": "Paylaşım ekranında X'i seç: resim gönderinle birlikte gider.", "X opens with your words and link; the picture is saved for you to attach.": "X yazın ve bağlantınla açılır; resim eklemen için kaydedilir.", "Your link carries your invite: a friend who joins and reaches level 5 gets you both a reward.": "Bağlantın davetini taşır: katılıp 5. seviyeye ulaşan bir arkadaş ikinize de ödül kazandırır.", "Couldn't make the picture — try again": "Resim oluşturulamadı — tekrar dene", "Link copied": "Bağlantı kopyalandı", "Your invite link": "Davet bağlantın", "Copy": "Kopyala", "Share": "Paylaş", "Today": "Bugün", "Go there": "Oraya git", "Chat and friends": "Sohbet ve arkadaşlar", "Close": "Kapat", "Controls": "Kontroller", "Jurassic World": "Jurassic World", "Welcome Week": "Hoş Geldin Haftası", "Starter Package": "Başlangıç Paketi", "ARCL Shop": "ARCL Mağazası", "Claim": "Al", "Official launch": "Resmi açılış", "Launch": "Açılış", "Couldn't load the launch gift — try again": "Açılış hediyesi yüklenemedi — tekrar dene", "The launch gift opens soon": "Açılış hediyesi yakında açılıyor", "The launch week is over": "Açılış haftası bitti", "Sign in with your wallet to take it": "Almak için cüzdanınla giriş yap", "Taken — thank you for playing!": "Alındı — oynadığın için teşekkürler!", "Reach level {n} to take it (you're level {l})": "Almak için {n}. seviyeye ulaş (şu an {l}. seviye)", "We're officially live!": "Resmen yayındayız!", "Thank you for building this world with us. A launch gift for every player, this week only.": "Bu dünyayı bizimle kurduğun için teşekkürler. Yalnızca bu hafta, her oyuncuya bir açılış hediyesi.", "An Advanced dinosaur egg": "Gelişmiş bir dinozor yumurtası", "Care for it 3 days in Jurassic World's Hatchery, then raise it.": "Jurassic World Kuluçkahanesinde 3 gün bak, sonra büyüt.", "{n} × 3× EXP potions": "{n} × 3× EXP iksiri", "Each one: 3× EXP for {m} minutes. Use them when you like.": "Her biri: {m} dakika 3× EXP. İstediğin zaman kullan.", "Straight into your ARCL balance.": "Doğrudan ARCL bakiyene.", "Take the launch gift": "Açılış hediyesini al", "3× EXP on: {t}": "3× EXP açık: {t}", "No potion running": "Etkin iksir yok", "Add an hour": "Bir saat ekle", "Drink one": "Bir tane iç", "One gift per account during the launch week. New accounts: from level {n}.": "Açılış haftasında hesap başına bir hediye. Yeni hesaplar: {n}. seviyeden itibaren.", "Couldn't take the gift: {e}": "Hediye alınamadı: {e}", "network": "ağ", "Launch gift taken!": "Açılış hediyesi alındı!", "+{a} ARCL · {n} potions · an Advanced egg in the Hatchery": "+{a} ARCL · {n} iksir · Kuluçkahanede Gelişmiş bir yumurta", "Couldn't use it: {e}": "Kullanılamadı: {e}", "3× EXP for an hour!": "Bir saat 3× EXP!", "Sleep until morning": "Sabaha kadar uyu", "Cook": "Pişir", "Good morning!": "Günaydın!", "You slept through the night. HP full.": "Gece boyunca uyudun. HP dolu.", "the connection timed out — try again": "bağlantı zaman aşımına uğradı — tekrar dene", "One moment…": "Bir saniye…", "Move to a free spot in your camp": "Kampında boş bir yere geç", "A rare egg is out in Jurassic World · {t} left": "Jurassic World'de nadir bir yumurta var · {t} kaldı", "Egg care open · {t} left": "Yumurta bakımı açık · {t} kaldı", "Step into the Jurassic World portal": "Jurassic World portalına gir", "Your egg is ready to hatch!": "Yumurtan çatlamaya hazır!", "Your first egg is waiting in Jurassic World": "İlk yumurtan Jurassic World'de seni bekliyor", "The Hatchery didn't open — try again later.": "Kuluçkahane açılamadı — daha sonra tekrar dene.", "{who} hit a ROYAL FLUSH at ARCIA POKER LOUNGE!": "{who}, ARCIA POKER SALONU'nda FLOŞ ROYAL yaptı!", "Enter ARCIA Poker Lounge": "ARCIA Poker Salonu'na gir", "The poker lounge couldn't load. Refresh the page and try again.": "Poker salonu yüklenemedi. Sayfayı yenileyip tekrar dene.", "The poker lounge couldn't open": "Poker salonu açılamadı", "Texas Hold'em · walk in to play": "Texas Hold'em · içeri gir ve oyna", "That challenge's board couldn't be found": "O meydan okumanın tahtası bulunamadı", "Play INFINITY RINGS": "INFINITY RINGS oyna", "INFINITY RINGS couldn't load. Refresh the page and try again.": "INFINITY RINGS yüklenemedi. Sayfayı yenileyip tekrar dene.", "INFINITY RINGS couldn't start": "INFINITY RINGS başlatılamadı", "Ring puzzle · walk in to play": "Halka bulmacası · içeri gir ve oyna", "Enter Survivors Arena": "Survivors Arena'ya gir", "Survivors Arena couldn't load. Refresh the page and try again.": "Survivors Arena yüklenemedi. Sayfayı yenileyip tekrar dene.", "Survivors Arena couldn't start": "Survivors Arena başlatılamadı", "Survive 12 minutes · walk in to play": "12 dakika hayatta kal · girip oyna", "Exchange": "Takas", "Connect your wallet to exchange": "Takas için cüzdanını bağla", "Waiting": "Bekliyor", "Done": "Tamamlandı", "Turned down": "Reddedildi", "Cancelled": "İptal edildi", "My requests": "Taleplerim", "Team queue": "Ekip kuyruğu", "You give": "Verdiğin", "You get": "Alacağın", "Balance": "Bakiye", "Amount": "Miktar", "Set by the team": "Ekip belirler", "The least is {n}": "En az {n}", "The most at once is {n}": "Bir seferde en fazla {n}", "More than your balance": "Bakiyenden fazla", "Paste the transaction hash of your transfer": "Transferinin işlem hash'ini yapıştır", "Enter how much $ARCL to exchange and send the request.": "Takas edilecek $ARCL miktarını gir ve talebi gönder.", "Your $ARCL is held right away, so it can't be spent twice.": "$ARCL hemen tutulur, iki kez harcanamaz.", "The team compares both markets and sends you $ARCIRCLE on Arc.": "Ekip iki piyasayı karşılaştırır ve sana Arc'ta $ARCIRCLE gönderir.", "Send $ARCIRCLE to the exchange desk on Arc (address below).": "$ARCIRCLE'ı Arc'taki takas masasına (aşağıdaki adres) gönder.", "Paste the transaction hash and enter the amount you sent.": "İşlem hash'ini yapıştır ve gönderdiğin miktarı gir.", "The team compares both markets and credits your $ARCL.": "Ekip iki piyasayı karşılaştırır ve $ARCL'ını yükler.", "Switch direction": "Yönü değiştir", "Exchange desk on Arc": "Arc takas masası", "Copy": "Kopyala", "Transaction hash 0x…": "İşlem hash'i 0x…", "Request exchange": "Takas talep et", "How it works": "Nasıl çalışır", "For now each request is settled by hand at a rate set from both markets. An automatic rate and instant exchange are coming.": "Şimdilik her talep iki piyasaya göre belirlenen kurla elle işlenir. Otomatik kur ve anında takas geliyor.", "No requests yet": "Henüz talep yok", "Received": "Alındı", "Cancel": "İptal", "Loading…": "Yükleniyor…", "Give ({x})": "Ver ({x})", "Your Arc tx 0x…": "Arc işlemin 0x…", "Note (optional)": "Not (isteğe bağlı)", "Settle": "Sonuçlandır", "Couldn't send the request: {e}": "Talep gönderilemedi: {e}", "Request sent. The team will settle it soon.": "Talep gönderildi. Ekip yakında sonuçlandıracak.", "Couldn't cancel: {e}": "İptal edilemedi: {e}", "Cancelled: your $ARCL is back": "İptal edildi: $ARCL'ın geri döndü", "Enter how much was given": "Verilen miktarı gir", "Settled": "Sonuçlandı", "Address copied": "Adres kopyalandı", "The exchange couldn't open. Try again.": "Takas açılamadı. Tekrar dene.", "It's starting to rain": "Yağmur başlıyor", "Night falls: raptors hunt farther. A campfire keeps your camp safe.": "Gece çöküyor: raptorlar daha uzağa avlanır. Kamp ateşi kampını güvende tutar.", "The sun is up. The plains are calmer.": "Güneş doğdu. Ovalar daha sakin.", "Day": "Gündüz", "Dusk": "Alacakaranlık", "Night": "Gece", "Dawn": "Şafak", "You can rest again in {s} s": "{s} sn sonra tekrar dinlenebilirsin", "You're already rested": "Zaten dinlendin", "Rested: HP full": "Dinlendin: can dolu", "Rest": "Dinlen", "Welcome to Jurassic World": "Jurassic World'e hoş geldin", "How survival works": "Hayatta kalma nasıl işler", "Your weapons stay in town": "Silahların kasabada kalır", "Your ARCIRCLE World weapons don't work here. You start with bare hands, and everything you use, you make.": "ARCIRCLE World silahların burada çalışmaz. Çıplak ellerle başlarsın ve kullandığın her şeyi kendin yaparsın.", "Gather first": "Önce topla", "Chop trees for wood, mine rocks for stone and flint, pick ferns and bushes for fiber. Walk up and tap attack.": "Odun için ağaç kes, taş ve çakmaktaşı için kaya kaz, lif için eğrelti ve çalı topla. Yaklaş ve saldırıya dokun.", "Build a workbench": "Tezgâh kur", "In your camp tap Build and make a workbench (20 wood, 10 stone). Then make an axe and a spear from your pack.": "Kampında İnşa et'e dokun ve tezgâh kur (20 odun, 10 taş). Sonra çantandan balta ve mızrak yap.", "Mind the dinosaurs": "Dinozorlara dikkat", "They bite back. Your camp and the gate are safe. Tap a dinosaur to see its level and HP.": "Karşılık verirler. Kampın ve kapı güvenlidir. Seviyesini ve canını görmek için bir dinozora dokun.", "Got it, let's survive": "Anladım, hayatta kalalım", "Tips": "İpuçları", "Tips for today": "Günün ipuçları", "Let's play": "Hadi oynayalım", "Lock on": "Kilitlen", "Tap the crosshair button (or Tab) to lock onto the nearest scammer. Your attacks follow it.": "En yakın dolandırıcıya kilitlenmek için nişangâh düğmesine (veya Tab) dokun. Saldırıların onu takip eder.", "The tab on the right edge hides the screen's buttons so you can see more of the world.": "Sağ kenardaki sekme ekran düğmelerini gizler, dünyayı daha geniş görürsün.", "ARCL Mine": "ARCL Madeni", "Every rock you break in the mine pays ARCL and XP. A better pickaxe needs fewer hits.": "Madende kırdığın her kaya ARCL ve XP verir. Daha iyi kazma daha az vuruş ister.", "Daily gifts": "Günlük hediyeler", "Open Gifts every day: new players get seven days of rewards.": "Her gün Hediyeler'i aç: yeni oyuncular yedi gün ödül alır.", "Potions": "İksirler", "Tap the bottle buttons (or keys 4 and 5) to drink HP and SP potions in the middle of a fight.": "Savaşın ortasında can ve SP iksiri içmek için şişe düğmelerine (veya 4 ve 5) dokun.", "Dodge": "Kaçın", "Dodge (K) through an attack to take no damage, then hit back.": "Saldırının içinden kaçın (K), hasar alma, sonra karşılık ver.", "Hatch a pet egg from Pets: a pet adds XP, luck and help in fights.": "Evcil hayvanlar'dan bir yumurta çıkar: evcil hayvan XP, şans ve savaşta yardım ekler.", "Game Village": "Oyun Köyü", "Coin Jump, AC Defense and more mini-games wait in the Game Village.": "Oyun Köyü'nde Coin Jump, AC Defense ve daha fazla mini oyun seni bekliyor.", "Your island": "Adan", "Build your own island: place bricks and decorate it your way.": "Kendi adanı kur: tuğla yerleştir, istediğin gibi süsle.", "Weekend 2×": "Hafta sonu 2×", "Saturdays and Sundays (Seoul time) give double XP and double ARCL from play.": "Cumartesi ve pazar (Seul saati) XP ve oyundan ARCL iki katı.", "The map": "Harita", "Open the map (M) to find hunting grounds, bosses and portals.": "Av alanlarını, bossları ve portalları bulmak için haritayı (M) aç.", "Skills": "Yetenekler", "A skill opens at level 10. Swap it with the ⇄ on the skill button.": "10. seviyede bir yetenek açılır. Yetenek düğmesindeki ⇄ ile değiştir.", "Craft": "Üretim", "Upgrade and salvage your gear in Craft: stronger gear makes bosses easier.": "Ekipmanını Üretim'de yükselt ve parçala: güçlü ekipman bossları kolaylaştırır.", "Build": "İnşa et", "Built": "Yapıldı", "Turn": "Çevir", "Place": "Yerleştir", "Take down": "Kaldır", "Build at your camp": "Kampında inşa et", "{w}'s camp": "{w} kampı", "{n} living here": "{n} kişi yaşıyor", "Couldn't build: {e}": "İnşa edilemedi: {e}", "Built: {x}": "İnşa edildi: {x}", "Couldn't join: {e}": "Katılamadı: {e}", "You live at {w}'s camp now": "Artık {w} kampında yaşıyorsun", "Join a camp": "Bir kampa katıl", "Join": "Katıl", "Every camp spot is taken — join someone's camp from your pack": "Tüm kamp yerleri dolu — çantandan birinin kampına katıl", "Build a workbench at your camp: {a}/20 wood · {b}/10 stone": "Kampına tezgâh kur: {a}/20 odun · {b}/10 taş", "Build a campfire at your camp": "Kampına kamp ateşi kur", "Hut": "Kulübe", "Bed": "Yatak", "Chest": "Sandık", "Fence": "Çit", "Wall": "Duvar", "Floor": "Zemin", "Torch post": "Meşale direği", "Boss": "Boss", "Quick tour": "Hızlı tur", "Skip": "Geç", "Next": "İleri", "Got it": "Anladım", "Hide the buttons": "Düğmeleri gizle", "Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.": "Ekrandaki düğmeleri gizleyip dünyayı daha geniş görmek için bu sekmeye dokun. Geri getirmek için tekrar dokun.", "Your goal": "Hedefin", "Your next step is here. Follow it from the first wood to the Alpha Raptor.": "Sıradaki adımın burada. İlk odundan Alfa Raptor'a kadar takip et.", "Your pack": "Çantan", "What you've gathered, your tools, food, and everything you can make.": "Topladıkların, aletlerin, yiyeceğin ve yapabileceğin her şey.", "Chop, mine and hunt": "Kes, kaz ve avla", "Walk up to a tree, rock or fern and tap here to chop, mine and gather. Dinosaurs bite back, so keep an eye on your HP!": "Bir ağaca, kayaya ya da eğreltiye yaklaş ve kesmek, kazmak, toplamak için buraya dokun. Dinozorlar karşılık verir, canına dikkat et!", "Clawstrider": "Pençekoşar", "Thornback Titan": "Dikensırt Titan", "Boss · Lv 20": "Boss · Lv 20", "Sign in to gather": "Toplamak için giriş yap", "Couldn't gather: {e}": "Toplanamadı: {e}", "Nothing this time": "Bu sefer bir şey yok", "Gathering": "Toplama", "Couldn't make it: {e}": "Yapılamadı: {e}", "Made: {x}": "Yapıldı: {x}", "You're not hungry": "Aç değilsin", "Couldn't eat: {e}": "Yenemedi: {e}", "Your camp": "Kampın", "Loading your pack…": "Çanta yükleniyor…", "Gather wood, stone and fiber for a stone axe": "Taş balta için odun, taş ve lif topla", "Open your pack and make a stone axe": "Çantanı aç ve taş balta yap", "Make a workbench: {a}/20 wood · {b}/10 stone": "Tezgâh yap: {a}/20 odun · {b}/10 taş", "Make a spear at the workbench (flint from rocks)": "Tezgâhta mızrak yap (çakmaktaşı kayalardan)", "Make a campfire for your camp": "Kampın için kamp ateşi yap", "Hunt a raptor with your spear": "Mızrağınla bir raptor avla", "Cook meat at your campfire": "Kamp ateşinde et pişir", "Make a copper axe (copper ore from rocks and the ARCL Mine)": "Bakır balta yap (bakır cevheri kayalardan ve ARCL Madeni'nden)", "Chop an ancient tree for amber · hunt the Alpha Raptor": "Kehribar için kadim ağaç kes · Alfa Raptor'u avla", "Use": "Kullan", "at the workbench": "tezgâhta", "at the campfire": "kamp ateşinde", "Made": "Yapıldı", "Make": "Yap", "Pack": "Çanta", "Gathering today: {a} / {b}": "Bugün toplanan: {a} / {b}", "Close": "Kapat", "Tools": "Aletler", "Materials": "Malzemeler", "Food": "Yiyecek", "Bare hands": "Çıplak eller", "Stone axe": "Taş balta", "Copper axe": "Bakır balta", "Iron-hard axe": "Demir sertliğinde balta", "Spear": "Mızrak", "No spear": "Mızrak yok", "Nothing yet: chop trees, pick ferns, mine rocks": "Henüz yok: ağaç kes, eğrelti topla, kaya kaz", "Torch": "Meşale", "Workbench": "Tezgâh", "Campfire": "Kamp ateşi", "Rope": "İp", "Cooked meat": "Pişmiş et", "Wood": "Odun", "Hardwood": "Sert odun", "Stone": "Taş", "Flint": "Çakmaktaşı", "Clay": "Kil", "Fiber": "Lif", "Berries": "Böğürtlen", "Amber": "Kehribar", "Hide": "Post", "Bone": "Kemik", "Raw meat": "Çiğ et", "Fang": "Diş", "Copper ore": "Bakır cevheri", "Silver ore": "Gümüş cevheri", "Gold ore": "Altın cevheri", "Tree": "Ağaç", "Palm": "Palmiye", "Ancient tree": "Kadim ağaç", "Fern": "Eğrelti", "Bush": "Çalı", "Log": "Kütük", "Rock": "Kaya", "Raptor": "Raptor", "Triceratops": "Triceratops", "Spinosaurus": "Spinosaurus", "Chop": "Kes", "Gather": "Topla", "Mine": "Kaz", "Hunt": "Avla", "Mining": "Madencilik", "Jurassic goals": "Jura hedefleri", "WASD move · Shift run · Space jump · J chop / mine · E use · Esc leave": "WASD hareket · Shift koş · Space zıpla · J kes / kaz · E kullan · Esc çık", "Alpha Raptor": "Alfa Raptor", "Boss · Lv 10": "Boss · Sv 10", "Jurassic World": "Jura Dünyası", "Jurassic World · Coming soon": "Jura Dünyası · Yakında", "Jurassic World is coming soon. The portal opens to everyone at launch.": "Jura Dünyası yakında. Açılışta portal herkese açılacak.", "Jurassic World couldn't open": "Jura Dünyası açılamadı", "Back to the village": "Köye dön", "Village": "Köy", "Primeval Plains · GM preview": "İlkel Ovalar · GM önizleme", "A first look at the land. More dinosaurs, hunting and rewards come next.": "Araziye ilk bakış. Daha fazla dinozor, avlanma ve ödüller sırada.", "WASD move · Shift run · Space jump · drag to look · Esc leave": "WASD hareket · Shift koş · Space zıpla · bakmak için sürükle · Esc çık", "Primeval Plains": "İlkel Ovalar", "What should I do next?": "Şimdi ne yapmalıyım?", "{n} ARCL": "{n} ARCL", "A pet egg": "Bir evcil hayvan yumurtası", "Advanced Pickaxe · 7 days": "Gelişmiş Kazma · 7 gün", "The welcome week is over. Thanks for playing!": "Hoş geldin haftası bitti. Oynadığın için teşekkürler!", "Day {n}": "{n}. gün", "New player gifts": "Yeni oyuncu hediyeleri", "Welcome Week": "Hoş Geldin Haftası", "One gift a day, seven in all. Days off are fine: finish within {n} days.": "Günde bir hediye, toplam yedi. Ara vermek sorun değil: {n} gün içinde bitir.", "Sign in to claim": "Almak için giriş yap", "Claim day {n}": "{n}. günü al", "Come back tomorrow for day {n}": "{n}. gün için yarın gel", "Couldn't claim the gift. Try again.": "Hediye alınamadı. Tekrar dene.", "Day {n} gift: {g}": "{n}. gün hediyesi: {g}", "ready in the ARCL Mine": "ARCL Madeni'nde hazır", "Gifts": "Hediyeler", "Ores": "Cevherler", "This week": "Bu hafta", "Upgrade": "Geliştir", "Each level: 4% fewer hits a rock, up to +10": "Her seviye kaya başına %4 daha az vuruş, en fazla +10", "+1 for": "+1 için", "+10, the most": "+10, en yüksek", "Advanced Pickaxe trial: {t} left": "Gelişmiş Kazma denemesi: {t} kaldı", "Back to the mine": "Madene dön", "Go down to the deep mine (Lv 90+): tougher rocks, more gold": "Derin madene in (Sv 90+): daha sert kayalar, daha çok altın", "Ore pieces and gems are kept for signed-in miners. Connect your wallet to collect them.": "Cevher parçaları ve taşlar giriş yapmış madenciler için saklanır. Toplamak için cüzdanını bağla.", "Every rock that isn't empty gives ore pieces. Use them to upgrade your pickaxe, or smelt them into scrap for your gear.": "Boş olmayan her kaya cevher parçası verir. Kazmanı geliştirmek için kullan ya da ekipman hurdasına erit.", "Copper": "Bakır", "Silver": "Gümüş", "Gold": "Altın", "Smelt {a} → {b} scrap": "{a} → {b} hurda erit", "Gem codex": "Taş kataloğu", "Sapphire": "Safir", "Ruby": "Yakut", "Diamond": "Elmas", "Sapphire!": "Safir!", "Ruby!": "Yakut!", "Diamond!": "Elmas!", "A gem for your codex": "Kataloğuna bir taş", "Rocks broken: copper {a} · silver {b} · gold {c}": "Kırılan kayalar: bakır {a} · gümüş {b} · altın {c}", "ARCL mined this week (Monday to Sunday). The board resets each week.": "Bu hafta (Pazartesi–Pazar) kazılan ARCL. Tablo her hafta sıfırlanır.", "The ARCL Mine": "ARCL Madeni", "Gold Rush": "Altın Hücumu", "Deep mine": "Derin maden", "Pickaxe +{n}: 4% fewer hits a rock": "Kazma +{n}: kaya başına %4 daha az vuruş", "+{n} scrap for your gear": "Ekipmanın için +{n} hurda", "The deep mine opens at level 90": "Derin maden seviye 90'da açılır", "The deep mine: tougher rocks, more gold": "Derin maden: daha sert kayalar, daha çok altın", "Back in the mine": "Madene geri dönüldü", "No one has mined this week yet": "Bu hafta henüz kimse kazmadı", "Miner": "Madenci", "Pickaxes · ore · this week": "Kazmalar · cevher · bu hafta", "the miner": "madenci", "ARCL Mine": "ARCL Madeni", "Copper, silver and gold rocks · 60 minutes, then a 6-hour rest": "Bakır, gümüş ve altın kayalar · 60 dakika, sonra 6 saat dinlenme", "Rocks": "Kaya", "Leave the mine": "Madenden çık", "Leave": "Çık", "left": "kaldı", "ARCL this visit": "bu ziyaretin ARCL'si", "Common": "Sıradan", "Advanced": "Gelişmiş", "Rare": "Nadir", "Legendary": "Efsanevi", "Left": "Sol", "Right": "Sağ", "Mine": "Kaz", "MINE": "KAZ", "A / D move · Space or J mine · Esc leave": "A / D hareket · Space veya J kaz · Esc çık", "ARCIRCLE WORLD": "ARCIRCLE WORLD", "ARCL MINE": "ARCL MADENİ", "Demo: connect your wallet to earn ARCL here": "Deneme: burada ARCL kazanmak için cüzdanını bağla", "Today {n} / {m} ARCL": "Bugün {n} / {m} ARCL", "Common Pickaxe": "Sıradan Kazma", "Advanced Pickaxe": "Gelişmiş Kazma", "Rare Pickaxe": "Nadir Kazma", "Legendary Pickaxe": "Efsanevi Kazma", "{n}% fewer hits a rock": "kaya başına %{n} daha az vuruş", "rocks {n}% faster": "kayalar %{n} daha hızlı", "Copper in 10–20 hits": "Bakır 10–20 vuruşta", "In hand": "Elinde", "Owned": "Sende var", "Pickaxes": "Kazmalar", "A better pickaxe breaks rocks in fewer hits, and more rocks turn up in your hour. You always mine with the best one you own.": "Daha iyi bir kazma kayaları daha az vuruşta kırar ve saatinde daha çok kaya çıkar. Her zaman sahip olduğun en iyi kazmayla kazarsın.", "Copper 10–100 · Silver 100–1,000 · Gold 1,000–10,000 ARCL. About 1 rock in 5 is empty. Gold is rare, and a full 10,000 far rarer.": "Bakır 10–100 · Gümüş 100–1.000 · Altın 1.000–10.000 ARCL. Yaklaşık 5 kayadan 1'i boş çıkar. Altın nadirdir, tam 10.000 ise çok daha nadir.", "Close": "Kapat", "Check your wallet…": "Cüzdanını kontrol et…", "Your new pickaxe is in your hands.": "Yeni kazman elinde.", "ARCL (demo, not paid)": "ARCL (deneme, ödenmez)", "Gold rocks broken: {n}": "Kırılan altın kaya: {n}", "Back to the village": "Köye dön", "Lost the mine's connection. Back to the village.": "Madenle bağlantı koptu. Köye dönülüyor.", "That rock didn't break: {e}": "Kaya kırılmadı: {e}", "try again": "tekrar dene", "Empty!": "Boş!", "daily mine limit": "günlük maden sınırı", "Your hour in the mine is up": "Madendeki saatin doldu", "Leaving the mine": "Madenden çıkılıyor", "The mine is resting. It opens again in {t}.": "Maden dinleniyor. {t} sonra yeniden açılır.", "The mine couldn't open: {e}": "Maden açılamadı: {e}", "Demo: nothing you mine is paid. Connect your wallet to earn.": "Deneme: kazdıkların ödenmez. Kazanmak için cüzdanını bağla.", "{t} left in the mine · rocks hold 10–10,000 ARCL": "Madende {t} kaldı · kayalarda 10–10.000 ARCL", "Mining Village": "Maden Köyü", "The ARCL Mine · copper, silver, gold": "ARCL Madeni · bakır, gümüş, altın", "Walk in to mine": "Kazmak için içeri gir", "Enter the ARCL Mine": "ARCL Madeni'ne gir", "The ARCL Mine couldn't start": "ARCL Madeni başlatılamadı", "The ARCL Mine couldn't load. Refresh the page and try again.": "ARCL Madeni yüklenemedi. Sayfayı yenileyip tekrar dene.", "ARCL Mine · opens in {t}": "ARCL Madeni · {t} sonra açılır", Soon: "Yakında", Colour: "Renk", "Hide quests": "Görevleri gizle", "Show quests": "Görevleri göster", "Beat Stomp · your best": "Ritim Adımı · en iyin", "Weekly prizes: 10,000 · 5,000 · 2,500 ARCL": "Haftalık ödüller: 10.000 · 5.000 · 2.500 ARCL", "Start Beat Stomp": "Ritim Adımı başlat", "Beat Stomp couldn't start": "Ritim Adımı başlatılamadı", "Wave {n}": "{n}. Dalga", "AC Defense · this week": "AC Savunma · bu hafta", "No runs yet — be the first!": "Henüz kayıt yok — ilk sen ol!", "Loading…": "Yükleniyor…", "Coin Jump · your best": "Para Zıplama · en iyin", "Islands": "Adalar", "Right-click": "Sağ tık", "Adventure log": "Macera günlüğü", "Start Coin Jump": "Para Zıplamayı başlat", "Coin Jump couldn't start": "Para Zıplama başlatılamadı", "Jump to the crown · walk in to play": "Taca zıpla · oynamak için içeri gir", "Tower defence · walk in to play": "Kule savunması · oynamak için içeri gir", "Weekend 2×: double XP and double ARCL from play": "Hafta sonu 2×: çift XP ve oyundan çift ARCL", "Streak shield used: you missed a day, but your streak goes on (once a week)": "Seri kalkanı kullanıldı: bir gün kaçırdın ama serin devam ediyor (haftada bir)", "a heart (+100 ARCL)": "bir kalp (+100 ARCL)", "Heart sent — your friend gets 100 ARCL": "Kalp gönderildi — arkadaşın 100 ARCL alıyor", "hearts open at level 5": "Kalpler seviye 5'te açılır", "one heart a day — more tomorrow": "Günde bir kalp — yarın tekrar", "they've had 5 hearts today — try tomorrow": "Bugün 5 kalp aldı — yarın dene", "A new village west of the plaza for mini-games. AC Defense is the first tower: walk in and defend the Core.": "Meydanın batısında mini oyunlar için yeni bir köy. İlk kule AC Savunma: içeri gir ve Çekirdeği koru.", "Hatch companions from eggs, 27 to collect. Each one follows you and helps in its own way.": "Yumurtalardan yoldaş çıkar, toplanacak 27 tür var. Her biri seni takip eder ve kendine göre yardım eder.", "Talk with players near you, send 1:1 messages and add friends.": "Yakındaki oyuncularla konuş, 1:1 mesaj gönder ve arkadaş ekle.", "The Game Village": "Oyun Köyü", "Earlier updates": "Önceki güncellemeler", "Friends and chat": "Arkadaşlar ve sohbet", "New version — updating…": "Yeni sürüm — güncelleniyor…", "AC Defense couldn't load. Refresh the page and try again.": "AC Savunma yüklenemedi. Sayfayı yenileyip tekrar dene.", "AC Defense couldn't start": "AC Savunma başlatılamadı", "Game Village": "Oyun Köyü", "Mini-games · more coming": "Mini oyunlar · daha fazlası yolda", "Tower defence · walk in to play": "Kule savunması · oynamak için içeri gir", "Enter {x}": "{x} gir", "AC Defense": "AC Savunma", "Start AC Defense": "AC Savunma'yı başlat", "Quit AC Defense first": "Önce AC Savunma'dan çık", "Getting ready": "Hazırlanıyor", "Frame limit": "Kare sınırı", "Recent messages": "Son mesajlar", Recent: "Son", "Nothing yet": "Henüz yok", now: "şimdi", Bag: "Çanta", Craft: "Üret", Pets: "Evcil hayvanlar", Build: "İnşa", Help: "Yardım", Bricks: "Brick'ler", Colours: "Renkler", Height: "Yükseklik", Trophies: "Kupalar", Lights: "Işıklar", Plants: "Bitkiler", Theme: "Tema", Character: "Karakter", Log: "Günlük", Village: "Köy", Later: "Sonra", Pick: "Seç", Visit: "Ziyaret et", Cottage: "Kulübe", Castle: "Kale", Palace: "Saray", Music: "Müzik", Film: "Film", Vivid: "Canlı", Time: "Zaman", Now: "Şimdi", Morning: "Sabah", Noon: "Öğle", Dusk: "Akşam", Night: "Gece", Vibration: "Titreşim", Inbox: "Gelen kutusu", Gifts: "Hediyeler", Guestbook: "Ziyaretçi defteri", Race: "Yarış", Finish: "Bitiş", Wardrobe: "Gardırop", Head: "Baş", Face: "Yüz", Neck: "Boyun", Back: "Sırt", Aura: "Aura", Lock: "Kilitle", Unlock: "Kilidi aç", Locked: "Kilitli", power: "güç", Equip: "Kuşan", Minimap: "Mini harita", Show: "Göster", On: "Açık", Reply: "Yanıtla", Medium: "Orta", Ultra: "Ultra", "Frame rate": "Kare hızı", Level: "Seviye", Friend: "Arkadaş", Say: "Söyle", GG: "GG", Companions: "Yoldaşlar", "Hi!": "Selam!", Filter: "Filtre", Sticker: "Çıkartma", Pose: "Poz", None: "Yok", Focus: "Odak", Off: "Kapalı", Soft: "Yumuşak", Strong: "Güçlü", Warm: "Sıcak", Cool: "Soğuk", Noir: "Noir", Neon: "Neon", Wave: "El salla", Sit: "Otur", Point: "İşaret et", Update: "Güncelleme", Title: "Unvan", Hoverboard: "Hoverboard", Jump: "Zıpla", Mirror: "Ayna", Moving: "Hareket", Menus: "Menüler", Buttons: "Düğmeler", Space: "Boşluk", Click: "Tıkla", Drag: "Sürükle", Wheel: "Tekerlek", Tap: "Dokun", Move: "Hareket", Look: "Bakış", No: "Hayır", Cheer: "Sevin", Dance: "Dans et", Faint: "Bayıl", Controls: "Kontroller", Shop: "Dükkan", Fighting: "Dövüş", Attack: "Saldır", Layout: "Düzen", Compact: "Kompakt", Large: "Büyük", Skip: "Atla", Quests: "Görevler", Map: "Harita", Menu: "Menü", Settings: "Ayarlar", Graphics: "Grafik", Auto: "Otomatik", High: "Yüksek", Low: "Düşük", Language: "Dil", Account: "Hesap", Sound: "Ses", Today: "Bugün", Badges: "Rozetler", Name: "İsim", "Level up": "Seviye atladın", online: "çevrimiçi", Player: "Oyuncu", visited: "ziyaret edildi", yours: "senin coinin", ready: "hazır", bought: "aldı", sold: "sattı", "Battery saver": "Pil tasarrufu",
    move: "hareket", jump: "zıpla", run: "koş", enter: "gir", board: "hoverboard", emote: "ifade", photo: "fotoğraf", map: "harita", help: "yardım", "drag to look": "sürükleyerek bak" },
};
// b-st1: the first minutes' words
Object.assign(WORDS.ko, { "Toss a coin in the fountain": "분수에 동전 던지기", "May your next chest be golden.": "다음 상자는 황금 상자이길.", "May the scammers never find your wallet.": "스캐머가 내 지갑을 절대 찾지 못하길.", "May your hero level up twice today.": "오늘 영웅이 두 번 레벨업하길.", "May your island be the week's best.": "내 섬이 이번 주 최고가 되길.", "May your dino hatch strong.": "내 공룡이 튼튼하게 부화하길.", "May the river card be yours.": "리버 카드가 내 편이길.", "Welcome back, {x}!": "다시 오셨네요, {x}!", "hero": "영웅", "{n} days since your last visit": "마지막 방문 후 {n}일", "Good to see you again today": "오늘 또 만나서 반가워요", "today's fountain coin is waiting": "오늘의 분수 동전이 기다려요", "now": "진행 중", "Back to where I left": "마지막 위치로 돌아가기", "Jurassic boss hour": "쥬라기 보스 타임", "Poker Sit & Go": "포커 시트 앤 고", "The Pumpkin Kings wake": "호박킹 기상", "in {h} h {m} min": "{h}시간 {m}분 후", "in {m} min": "{m}분 후", "New launch on ArcPad": "ArcPad 신규 런칭", "Welcome!": "환영해요!", "The fountain's show": "분수 쇼", "on the hour, at the plaza": "매시 정각, 광장에서", "Opening the plaza…": "광장을 여는 중…", "Dressing the town…": "마을을 꾸미는 중…", "Waking the scammers…": "스캐머를 깨우는 중…", "Polishing the light…": "빛을 다듬는 중…",
  "Step through a portal to the Utility Village": "포털을 지나 유틸리티 마을로 가기", "One world, eight games. Pick your hero, a colour and a name — you can change them later.": "하나의 세계, 8개의 게임. 영웅과 색, 이름을 골라요 — 나중에 바꿀 수 있어요.",
  "Move": "이동", "Jump": "점프", "Attack": "공격", "Drag the stick on the left. Push it far to run.": "왼쪽 스틱을 드래그해요. 끝까지 밀면 달려요.", "Tap the big blue arrow.": "큰 파란 화살표를 눌러요.", "Tap the red sword near a scammer.": "스캐머 가까이에서 빨간 검을 눌러요.",
  "W A S D or the arrow keys. Hold Shift to run.": "W A S D 또는 화살표 키. Shift를 누르고 있으면 달려요.", "Space.": "스페이스바.", "J, or click the red sword near a scammer.": "J, 또는 스캐머 가까이에서 빨간 검을 클릭해요.",
  "How to play": "플레이 방법", "Welcome to ARCIRCLE WORLD": "ARCIRCLE WORLD에 오신 걸 환영해요", "Three things to start": "시작할 때 알아둘 세 가지", "All controls": "전체 조작법", "Let's go!": "시작!" });
Object.assign(WORDS.zh, { "Toss a coin in the fountain": "向喷泉投一枚硬币", "May your next chest be golden.": "愿你的下一个宝箱是金色的。", "May the scammers never find your wallet.": "愿骗子永远找不到你的钱包。", "May your hero level up twice today.": "愿你的英雄今天连升两级。", "May your island be the week's best.": "愿你的岛成为本周最佳。", "May your dino hatch strong.": "愿你的恐龙健壮孵化。", "May the river card be yours.": "愿河牌站在你这边。", "Welcome back, {x}!": "欢迎回来，{x}！", "hero": "英雄", "{n} days since your last visit": "距上次来访已 {n} 天", "Good to see you again today": "今天又见面了", "today's fountain coin is waiting": "今天的喷泉硬币在等你", "now": "进行中", "Back to where I left": "回到上次的位置", "Jurassic boss hour": "侏罗纪首领时间", "Poker Sit & Go": "扑克坐满即玩", "The Pumpkin Kings wake": "南瓜王苏醒", "in {h} h {m} min": "{h} 小时 {m} 分钟后", "in {m} min": "{m} 分钟后", "New launch on ArcPad": "ArcPad 新上线", "Welcome!": "欢迎！", "The fountain's show": "喷泉表演", "on the hour, at the plaza": "每个整点，在广场", "Opening the plaza…": "正在打开广场…", "Dressing the town…": "正在装点小镇…", "Waking the scammers…": "正在唤醒骗子…", "Polishing the light…": "正在打磨光影…",
  "Step through a portal to the Utility Village": "穿过传送门前往工具村", "One world, eight games. Pick your hero, a colour and a name — you can change them later.": "一个世界，八款游戏。选择你的英雄、颜色和名字——之后还能更改。",
  "Move": "移动", "Jump": "跳跃", "Attack": "攻击", "Drag the stick on the left. Push it far to run.": "拖动左边的摇杆。推到底就会奔跑。", "Tap the big blue arrow.": "点击蓝色大箭头。", "Tap the red sword near a scammer.": "在骗子附近点击红色的剑。",
  "W A S D or the arrow keys. Hold Shift to run.": "W A S D 或方向键。按住 Shift 奔跑。", "Space.": "空格键。", "J, or click the red sword near a scammer.": "J，或在骗子附近点击红色的剑。",
  "How to play": "玩法", "Welcome to ARCIRCLE WORLD": "欢迎来到 ARCIRCLE WORLD", "Three things to start": "开始前的三件事", "All controls": "全部操作", "Let's go!": "出发！" });
Object.assign(WORDS.tr, { "Toss a coin in the fountain": "Çeşmeye bir bozuk para at", "May your next chest be golden.": "Bir sonraki sandığın altın olsun.", "May the scammers never find your wallet.": "Dolandırıcılar cüzdanını asla bulmasın.", "May your hero level up twice today.": "Kahramanın bugün iki seviye atlasın.", "May your island be the week's best.": "Adan haftanın en iyisi olsun.", "May your dino hatch strong.": "Dinozorun güçlü çıksın.", "May the river card be yours.": "River kartı senin olsun.", "Welcome back, {x}!": "Tekrar hoş geldin, {x}!", "hero": "kahraman", "{n} days since your last visit": "Son ziyaretinden bu yana {n} gün", "Good to see you again today": "Bugün seni yine görmek güzel", "today's fountain coin is waiting": "bugünün çeşme parası seni bekliyor", "now": "şimdi", "Back to where I left": "Kaldığım yere dön", "Jurassic boss hour": "Jurassic boss saati", "Poker Sit & Go": "Poker Sit & Go", "The Pumpkin Kings wake": "Balkabağı Kralları uyanıyor", "in {h} h {m} min": "{h} sa {m} dk sonra", "in {m} min": "{m} dk sonra", "New launch on ArcPad": "ArcPad'de yeni lansman", "Welcome!": "Hoş geldin!", "The fountain's show": "Çeşme gösterisi", "on the hour, at the plaza": "her saat başı, meydanda", "Opening the plaza…": "Meydan açılıyor…", "Dressing the town…": "Kasaba süsleniyor…", "Waking the scammers…": "Dolandırıcılar uyanıyor…", "Polishing the light…": "Işık parlatılıyor…",
  "Step through a portal to the Utility Village": "Bir portaldan Araçlar Köyü'ne geç", "One world, eight games. Pick your hero, a colour and a name — you can change them later.": "Tek dünya, sekiz oyun. Kahramanını, rengini ve adını seç — sonra değiştirebilirsin.",
  "Move": "Hareket", "Jump": "Zıpla", "Attack": "Saldır", "Drag the stick on the left. Push it far to run.": "Soldaki çubuğu sürükle. Sonuna kadar itersen koşarsın.", "Tap the big blue arrow.": "Büyük mavi oka dokun.", "Tap the red sword near a scammer.": "Bir dolandırıcının yanında kırmızı kılıca dokun.",
  "W A S D or the arrow keys. Hold Shift to run.": "W A S D veya ok tuşları. Koşmak için Shift'e basılı tut.", "Space.": "Boşluk tuşu.", "J, or click the red sword near a scammer.": "J, ya da bir dolandırıcının yanında kırmızı kılıca tıkla.",
  "How to play": "Nasıl oynanır", "Welcome to ARCIRCLE WORLD": "ARCIRCLE WORLD'e hoş geldin", "Three things to start": "Başlamak için üç şey", "All controls": "Tüm kontroller", "Let's go!": "Başlayalım!" });
Object.assign(WORDS.ko, { "Nexus City": "넥서스 시티", "Genesis Lab": "제네시스 랩", "Create and meet your agent": "에이전트를 만들고 만나요", "Errand Port": "심부름 포트", "Send your agent on errands": "에이전트를 심부름 보내요", "Vault Tower": "볼트 타워", "Your agent's trading vault": "에이전트의 트레이딩 볼트", "Agent Academy": "에이전트 아카데미", "Skills, traits and lessons": "스킬, 특성, 수업", "Agent Arena": "에이전트 아레나", "Agents face off": "에이전트끼리 겨뤄요", "ARCIRCLE Studio": "ARCIRCLE 스튜디오", "Make your own game": "나만의 게임 만들기", "Being built": "건설 중", "Your agent learns new skills here: lessons, traits (gatherer · scout · trader) and level-ups.": "여기서 에이전트가 새 스킬을 배워요: 수업, 특성(채집가 · 정찰가 · 트레이더), 레벨업.", "Classes with other players' agents, and a diploma for each course.": "다른 플레이어의 에이전트와 함께 듣는 수업, 과정마다 수료증.", "Agents face off in quiz and strategy duels while you watch and cheer.": "에이전트들이 퀴즈와 전략 대결을 벌이고, 당신은 지켜보며 응원해요.", "A weekly ladder of the sharpest agents.": "가장 똑똑한 에이전트들의 주간 랭킹.", "ARCIRCLE Studio Lite: make your own mini-game from a template (runner, arena, puzzle, defense), with your agent's help.": "ARCIRCLE 스튜디오 라이트: 에이전트의 도움으로 템플릿(러너, 아레나, 퍼즐, 디펜스)에서 나만의 미니게임을 만들어요.", "Publish it to the Creator Arcade for everyone to play.": "크리에이터 아케이드에 올려 모두가 플레이하게 해요." });
Object.assign(WORDS.zh, { "Nexus City": "Nexus 城", "Genesis Lab": "创世实验室", "Create and meet your agent": "创建并认识你的智能体", "Errand Port": "任务港", "Send your agent on errands": "派你的智能体去执行任务", "Vault Tower": "金库塔", "Your agent's trading vault": "智能体的交易金库", "Agent Academy": "智能体学院", "Skills, traits and lessons": "技能、特质与课程", "Agent Arena": "智能体竞技场", "Agents face off": "智能体一决高下", "ARCIRCLE Studio": "ARCIRCLE 工作室", "Make your own game": "制作你自己的游戏", "Being built": "建设中", "Your agent learns new skills here: lessons, traits (gatherer · scout · trader) and level-ups.": "你的智能体在这里学习新技能：课程、特质（采集者 · 侦察者 · 交易者）与升级。", "Classes with other players' agents, and a diploma for each course.": "与其他玩家的智能体一起上课，每门课都有结业证书。", "Agents face off in quiz and strategy duels while you watch and cheer.": "智能体在问答和策略对决中交锋，你在一旁观战助威。", "A weekly ladder of the sharpest agents.": "最聪明智能体的每周排行榜。", "ARCIRCLE Studio Lite: make your own mini-game from a template (runner, arena, puzzle, defense), with your agent's help.": "ARCIRCLE Studio Lite：在智能体的帮助下，用模板（跑酷、竞技场、解谜、塔防）制作你自己的小游戏。", "Publish it to the Creator Arcade for everyone to play.": "发布到创作者街机厅，让所有人都能玩。" });
Object.assign(WORDS.tr, { "Nexus City": "Nexus Şehri", "Genesis Lab": "Genesis Laboratuvarı", "Create and meet your agent": "Ajanını yarat ve tanış", "Errand Port": "Görev Limanı", "Send your agent on errands": "Ajanını görevlere gönder", "Vault Tower": "Kasa Kulesi", "Your agent's trading vault": "Ajanının işlem kasası", "Agent Academy": "Ajan Akademisi", "Skills, traits and lessons": "Yetenekler, özellikler ve dersler", "Agent Arena": "Ajan Arenası", "Agents face off": "Ajanlar karşı karşıya", "ARCIRCLE Studio": "ARCIRCLE Stüdyo", "Make your own game": "Kendi oyununu yap", "Being built": "Yapım aşamasında", "Your agent learns new skills here: lessons, traits (gatherer · scout · trader) and level-ups.": "Ajanın burada yeni yetenekler öğrenir: dersler, özellikler (toplayıcı · izci · tüccar) ve seviye atlama.", "Classes with other players' agents, and a diploma for each course.": "Diğer oyuncuların ajanlarıyla dersler ve her kurs için bir diploma.", "Agents face off in quiz and strategy duels while you watch and cheer.": "Sen izleyip tezahürat yaparken ajanlar bilgi ve strateji düellolarında karşılaşır.", "A weekly ladder of the sharpest agents.": "En keskin ajanların haftalık sıralaması.", "ARCIRCLE Studio Lite: make your own mini-game from a template (runner, arena, puzzle, defense), with your agent's help.": "ARCIRCLE Studio Lite: ajanının yardımıyla bir şablondan (koşu, arena, bulmaca, savunma) kendi mini oyununu yap.", "Publish it to the Creator Arcade for everyone to play.": "Herkes oynasın diye Creator Arcade'de yayınla." });
Object.assign(WORDS.ko, { "Bio Garden": "바이오 가든", "Ore Refinery": "광석 정제소", "Scout Deck": "정찰 데크", "City crew": "도시 크루", "Job board": "잡 보드", "working now": "지금 일하는 중", "errands back today": "오늘 돌아온 심부름", "Line up errands in your agent's window": "에이전트 창에서 심부름을 줄 세워 두세요", "Waiting: not enough ARCL for the next errand.": "대기 중: 다음 심부름에 쓸 ARCL이 부족해요.", "Today's errands are used up — the board goes on tomorrow.": "오늘 심부름을 다 썼어요 — 보드는 내일 이어서 진행돼요.", "Line up errands: when a slot frees, the next one starts by itself — even while you're away. Each is paid when it starts.": "심부름을 줄 세워 두면 자리가 날 때 다음 심부름이 알아서 시작돼요 — 자리를 비운 동안에도요. 각 심부름은 시작할 때 결제돼요.", "Remove": "빼기", "On the job board": "잡 보드에 올렸어요", "While you were away": "자리를 비운 동안", "{n} finished {k} errand(s)": "{n}이(가) 심부름 {k}개를 마쳤어요" });
Object.assign(WORDS.zh, { "Bio Garden": "生态花园", "Ore Refinery": "矿石精炼厂", "Scout Deck": "侦察平台", "City crew": "城市工作组", "Job board": "任务板", "working now": "正在工作", "errands back today": "今日完成的任务", "Line up errands in your agent's window": "在智能体窗口里排好任务", "Waiting: not enough ARCL for the next errand.": "等待中：下一个任务的 ARCL 不足。", "Today's errands are used up — the board goes on tomorrow.": "今天的任务已用完 — 任务板明天继续。", "Line up errands: when a slot frees, the next one starts by itself — even while you're away. Each is paid when it starts.": "排好任务：一有空位，下一个任务就会自动开始 — 你不在时也一样。每个任务在开始时付费。", "Remove": "移除", "On the job board": "已加入任务板", "While you were away": "你不在的时候", "{n} finished {k} errand(s)": "{n} 完成了 {k} 个任务" });
Object.assign(WORDS.tr, { "Bio Garden": "Biyo Bahçe", "Ore Refinery": "Cevher Rafinerisi", "Scout Deck": "Keşif Güvertesi", "City crew": "Şehir ekibi", "Job board": "İş panosu", "working now": "şu an çalışıyor", "errands back today": "bugün dönen görevler", "Line up errands in your agent's window": "Görevleri ajan penceresinde sıraya koy", "Waiting: not enough ARCL for the next errand.": "Bekliyor: sonraki görev için yeterli ARCL yok.", "Today's errands are used up — the board goes on tomorrow.": "Bugünün görevleri bitti — pano yarın devam eder.", "Line up errands: when a slot frees, the next one starts by itself — even while you're away. Each is paid when it starts.": "Görevleri sıraya koy: bir yuva boşalınca sıradaki kendiliğinden başlar — sen yokken bile. Her biri başladığında ödenir.", "Remove": "Kaldır", "On the job board": "İş panosunda", "While you were away": "Sen yokken", "{n} finished {k} errand(s)": "{n} {k} görevi bitirdi" });
Object.assign(WORDS.ko, { "Ask {n} to draft it": "{n}에게 초안 부탁하기", "your agent": "내 에이전트", "Your agent": "내 에이전트", "e.g. a fast jungle run with lots of coins": "예: 코인이 가득한 빠른 정글 달리기", "Draft": "초안", "Title": "제목", "Theme": "테마", "Length": "길이", "Speed": "속도", "Coins": "코인", "Walls": "벽", "Gaps to jump": "점프할 구멍", "Lasers to slide under": "슬라이드로 피할 레이저", "Layout #{n}": "레이아웃 #{n}", "coins": "코인", "New layout": "새 레이아웃", "Test play": "테스트 플레이", "Save": "저장", "Save changes": "변경 저장", "Publish": "게시", "Unpublish": "게시 취소", "Published ✓": "게시됨 ✓", "Create": "만들기", "My games": "내 게임", "Creator Arcade": "크리에이터 아케이드", "On the Creator Arcade": "크리에이터 아케이드에 게시됨", "On the Creator Arcade!": "크리에이터 아케이드에 올라갔어요!", "Taken off the Creator Arcade": "크리에이터 아케이드에서 내렸어요", "by {n}": "by {n}", "Play": "플레이", "Edit": "편집", "Delete": "삭제", "Like": "좋아요", "Liked": "좋아요를 눌렀어요", "You liked it already": "이미 좋아요를 눌렀어요", "Saved": "저장했어요", "Delete this game?": "이 게임을 삭제할까요?", "No games yet — make your first one in Create.": "아직 게임이 없어요 — 만들기에서 첫 게임을 만들어 보세요.", "Sign in with a wallet to keep your games.": "게임을 보관하려면 지갑으로 로그인하세요.", "The Creator Arcade is waiting for its first game — publish yours!": "크리에이터 아케이드가 첫 게임을 기다려요 — 내 게임을 올려 보세요!", "Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet.": "게임은 템플릿으로 만들어요 — 코드는 필요 없어요. 플레이 수, 좋아요, 최고 기록이 집계되고, 게임에 대한 ARCL 지급은 아직 없어요.", "Thinking…": "생각하는 중…", "{n} drafted it — tweak anything, then test it.": "{n}이(가) 초안을 만들었어요 — 마음대로 고친 뒤 테스트해 보세요.", "Drafted from your words — tweak anything, then test it.": "입력한 말로 초안을 만들었어요 — 마음대로 고친 뒤 테스트해 보세요.", "The game couldn't start": "게임을 시작하지 못했어요", "GO!": "GO!", "Finished!": "완주!", "Out of hearts": "하트를 다 잃었어요", "Your best: {n}": "내 최고 기록: {n}", "#{n} on this game": "이 게임 {n}위", "A test run isn't counted.": "테스트 플레이는 기록되지 않아요.", "Play again": "다시 하기", "Back to the editor": "편집으로 돌아가기", "Back": "돌아가기", "Leave": "나가기", "Swipe ← → to switch lanes · ↑ jump · ↓ slide": "← → 밀어서 레인 변경 · ↑ 점프 · ↓ 슬라이드", "← → switch lanes · ↑ / Space jump · ↓ slide": "← → 레인 변경 · ↑ / Space 점프 · ↓ 슬라이드", "Sky Runner": "스카이 러너", "Arena Survival": "아레나 서바이벌", "Ring Puzzle": "링 퍼즐", "Tower Defense": "타워 디펜스", "Neon City": "네온 시티", "Jungle": "정글", "Ice Peaks": "얼음 봉우리", "Lava Core": "용암 코어", "Candy Sky": "캔디 스카이" });
Object.assign(WORDS.zh, { "Ask {n} to draft it": "让 {n} 起草", "your agent": "你的智能体", "Your agent": "你的智能体", "e.g. a fast jungle run with lots of coins": "例如：金币很多的快速丛林跑酷", "Draft": "起草", "Title": "标题", "Theme": "主题", "Length": "时长", "Speed": "速度", "Coins": "金币", "Walls": "墙", "Gaps to jump": "要跳过的缺口", "Lasers to slide under": "要滑过的激光", "Layout #{n}": "布局 #{n}", "coins": "金币", "New layout": "新布局", "Test play": "试玩", "Save": "保存", "Save changes": "保存修改", "Publish": "发布", "Unpublish": "取消发布", "Published ✓": "已发布 ✓", "Create": "创作", "My games": "我的游戏", "Creator Arcade": "创作者街机厅", "On the Creator Arcade": "已在创作者街机厅", "On the Creator Arcade!": "已上架创作者街机厅！", "Taken off the Creator Arcade": "已从创作者街机厅下架", "by {n}": "作者 {n}", "Play": "开始", "Edit": "编辑", "Delete": "删除", "Like": "点赞", "Liked": "已点赞", "You liked it already": "你已经点过赞了", "Saved": "已保存", "Delete this game?": "删除这个游戏？", "No games yet — make your first one in Create.": "还没有游戏 — 去“创作”做你的第一个吧。", "Sign in with a wallet to keep your games.": "用钱包登录以保存你的游戏。", "The Creator Arcade is waiting for its first game — publish yours!": "创作者街机厅正在等待第一款游戏 — 发布你的吧！", "Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet.": "游戏由模板制作 — 无需代码。统计游玩次数、点赞和最佳成绩；目前游戏不发放 ARCL。", "Thinking…": "思考中…", "{n} drafted it — tweak anything, then test it.": "{n} 起草好了 — 随意调整，然后试玩。", "Drafted from your words — tweak anything, then test it.": "已按你的描述起草 — 随意调整，然后试玩。", "The game couldn't start": "游戏无法开始", "GO!": "开始！", "Finished!": "完成！", "Out of hearts": "生命耗尽", "Your best: {n}": "你的最佳：{n}", "#{n} on this game": "本游戏第 {n} 名", "A test run isn't counted.": "试玩不计入成绩。", "Play again": "再玩一次", "Back to the editor": "返回编辑器", "Back": "返回", "Leave": "离开", "Swipe ← → to switch lanes · ↑ jump · ↓ slide": "左右滑动换道 · 上滑跳跃 · 下滑滑铲", "← → switch lanes · ↑ / Space jump · ↓ slide": "← → 换道 · ↑ / 空格 跳跃 · ↓ 滑铲", "Sky Runner": "天空跑者", "Arena Survival": "竞技场生存", "Ring Puzzle": "圆环解谜", "Tower Defense": "塔防", "Neon City": "霓虹城", "Jungle": "丛林", "Ice Peaks": "冰峰", "Lava Core": "熔岩核心", "Candy Sky": "糖果天空" });
Object.assign(WORDS.tr, { "Ask {n} to draft it": "{n} taslak hazırlasın", "your agent": "ajanın", "Your agent": "Ajanın", "e.g. a fast jungle run with lots of coins": "örn. bol paralı hızlı bir orman koşusu", "Draft": "Taslak", "Title": "Başlık", "Theme": "Tema", "Length": "Süre", "Speed": "Hız", "Coins": "Paralar", "Walls": "Duvarlar", "Gaps to jump": "Atlanacak boşluklar", "Lasers to slide under": "Altından kayılacak lazerler", "Layout #{n}": "Düzen #{n}", "coins": "para", "New layout": "Yeni düzen", "Test play": "Test oyunu", "Save": "Kaydet", "Save changes": "Değişiklikleri kaydet", "Publish": "Yayınla", "Unpublish": "Yayından kaldır", "Published ✓": "Yayında ✓", "Create": "Oluştur", "My games": "Oyunlarım", "Creator Arcade": "Creator Arcade", "On the Creator Arcade": "Creator Arcade'de", "On the Creator Arcade!": "Creator Arcade'de!", "Taken off the Creator Arcade": "Creator Arcade'den kaldırıldı", "by {n}": "yapan: {n}", "Play": "Oyna", "Edit": "Düzenle", "Delete": "Sil", "Like": "Beğen", "Liked": "Beğenildi", "You liked it already": "Zaten beğendin", "Saved": "Kaydedildi", "Delete this game?": "Bu oyun silinsin mi?", "No games yet — make your first one in Create.": "Henüz oyun yok — ilkini Oluştur'da yap.", "Sign in with a wallet to keep your games.": "Oyunlarını saklamak için cüzdanla giriş yap.", "The Creator Arcade is waiting for its first game — publish yours!": "Creator Arcade ilk oyununu bekliyor — seninkini yayınla!", "Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet.": "Oyunlar şablonlardan yapılır — kod yok. Oynanma, beğeni ve en iyi koşular sayılır; oyunlar için henüz ARCL ödenmez.", "Thinking…": "Düşünüyor…", "{n} drafted it — tweak anything, then test it.": "{n} taslağı hazırladı — istediğini değiştir, sonra dene.", "Drafted from your words — tweak anything, then test it.": "Sözlerinden taslak hazırlandı — istediğini değiştir, sonra dene.", "The game couldn't start": "Oyun başlatılamadı", "GO!": "BAŞLA!", "Finished!": "Bitti!", "Out of hearts": "Can kalmadı", "Your best: {n}": "En iyin: {n}", "#{n} on this game": "Bu oyunda #{n}", "A test run isn't counted.": "Test koşusu sayılmaz.", "Play again": "Tekrar oyna", "Back to the editor": "Düzenleyiciye dön", "Back": "Geri", "Leave": "Çık", "Swipe ← → to switch lanes · ↑ jump · ↓ slide": "Şerit için ← → kaydır · ↑ zıpla · ↓ kay", "← → switch lanes · ↑ / Space jump · ↓ slide": "← → şerit · ↑ / Boşluk zıpla · ↓ kay", "Sky Runner": "Gökyüzü Koşucusu", "Arena Survival": "Arena Hayatta Kalma", "Ring Puzzle": "Halka Bulmacası", "Tower Defense": "Kule Savunması", "Neon City": "Neon Şehir", "Jungle": "Orman", "Ice Peaks": "Buz Zirveleri", "Lava Core": "Lav Çekirdeği", "Candy Sky": "Şeker Gökyüzü" });
Object.assign(WORDS.ko, { "what the dots mean": "점 표시 안내" });
Object.assign(WORDS.zh, { "what the dots mean": "圆点的含义" });
Object.assign(WORDS.tr, { "what the dots mean": "noktaların anlamı" });
Object.assign(WORDS.ko, { "Welcome to Nexus City": "넥서스 시티에 오신 걸 환영해요", "Six buildings for your agent, and the stations where agents work. Tap one to go to its door.": "에이전트를 위한 건물 6곳과 에이전트들이 일하는 스테이션이에요. 누르면 그 앞으로 가요.", "AGENT DIMENSION's city: six buildings and agents at work": "AGENT DIMENSION의 도시: 건물 6곳과 일하는 에이전트" });
Object.assign(WORDS.zh, { "Welcome to Nexus City": "欢迎来到 Nexus 城", "Six buildings for your agent, and the stations where agents work. Tap one to go to its door.": "六座为你的智能体准备的建筑，还有智能体工作的站点。点一下就能到门口。", "AGENT DIMENSION's city: six buildings and agents at work": "AGENT DIMENSION 的城市：六座建筑与工作中的智能体" });
Object.assign(WORDS.tr, { "Welcome to Nexus City": "Nexus Şehri'ne hoş geldin", "Six buildings for your agent, and the stations where agents work. Tap one to go to its door.": "Ajanın için altı bina ve ajanların çalıştığı istasyonlar. Birine dokun, kapısına git.", "AGENT DIMENSION's city: six buildings and agents at work": "AGENT DIMENSION'ın şehri: altı bina ve çalışan ajanlar" });
Object.assign(WORDS.ko, { "{s} s · {d} waves · {c} coins": "{s}초 · 공격 {d}번 · 코인 {c}개", "endless · {c} coins on the way": "끝없이 · 길에 코인 {c}개", "Link copied — anyone with it plays your game": "링크 복사됨 — 링크만 있으면 누구나 내 게임을 플레이해요", "NICE!": "나이스!", "{m} m!": "{m} m!", "New best!": "최고 기록!", "You lasted!": "버텨냈어요!", "Infinity Dash": "인피니티 대시", "Starting speed": "시작 속도", "How fast it speeds up": "빨라지는 정도", "Drone speed": "드론 속도", "Drones": "드론", "Laser sweeps": "레이저 휩쓸기", "Big drones": "큰 드론", "Survive for": "버틸 시간", "Gentle": "느긋하게", "Wild": "미친 속도", "Drag anywhere to move · dodge the drones": "아무 곳이나 드래그해 이동 · 드론을 피하세요", "WASD / arrows to move · dodge the drones": "WASD / 방향키로 이동 · 드론을 피하세요" });
Object.assign(WORDS.zh, { "{s} s · {d} waves · {c} coins": "{s} 秒 · {d} 波 · {c} 枚金币", "endless · {c} coins on the way": "无尽 · 路上 {c} 枚金币", "Link copied — anyone with it plays your game": "链接已复制 — 有链接的人都能玩你的游戏", "NICE!": "漂亮!", "{m} m!": "{m} 米!", "New best!": "新纪录!", "You lasted!": "你撑下来了!", "Infinity Dash": "无限冲刺", "Starting speed": "起始速度", "How fast it speeds up": "加速快慢", "Drone speed": "无人机速度", "Drones": "无人机", "Laser sweeps": "激光扫射", "Big drones": "大型无人机", "Survive for": "生存时长", "Gentle": "温和", "Wild": "疯狂", "Drag anywhere to move · dodge the drones": "任意处拖动来移动 · 躲开无人机", "WASD / arrows to move · dodge the drones": "WASD / 方向键移动 · 躲开无人机" });
Object.assign(WORDS.tr, { "{s} s · {d} waves · {c} coins": "{s} sn · {d} dalga · {c} jeton", "endless · {c} coins on the way": "sonsuz · yolda {c} jeton", "Link copied — anyone with it plays your game": "Bağlantı kopyalandı — bağlantıya sahip herkes oyununu oynar", "NICE!": "SÜPER!", "{m} m!": "{m} m!", "New best!": "Yeni rekor!", "You lasted!": "Dayandın!", "Infinity Dash": "Sonsuz Koşu", "Starting speed": "Başlangıç hızı", "How fast it speeds up": "Ne kadar hızlanır", "Drone speed": "Drone hızı", "Drones": "Dronlar", "Laser sweeps": "Lazer taramaları", "Big drones": "Büyük dronlar", "Survive for": "Hayatta kalma süresi", "Gentle": "Yavaş", "Wild": "Çılgın", "Drag anywhere to move · dodge the drones": "Hareket için her yeri sürükle · dronlardan kaç", "WASD / arrows to move · dodge the drones": "WASD / oklar ile hareket · dronlardan kaç" });
Object.assign(WORDS.ko, { "Play {x}": "{x} 플레이", "by {name}": "만든 이 {name}", "Studio pick": "스튜디오 추천", "Walk up to play it": "다가가서 바로 플레이", "Make the first game": "첫 게임을 만들어 보세요" });
Object.assign(WORDS.zh, { "Play {x}": "玩 {x}", "by {name}": "作者 {name}", "Studio pick": "工作室精选", "Walk up to play it": "走近即可开玩", "Make the first game": "来做第一个游戏" });
Object.assign(WORDS.tr, { "Play {x}": "{x} oyna", "by {name}": "yapan {name}", "Studio pick": "Stüdyo seçimi", "Walk up to play it": "Oynamak için yaklaş", "Make the first game": "İlk oyunu sen yap" });
Object.assign(WORDS.ko, { "Quiz duels with your agent": "에이전트와 함께하는 퀴즈 대결", "Arena hour now · points ×2": "지금 아레나 아워 · 점수 ×2", "Next arena hour {t}": "다음 아레나 아워 {t}", "Be the first on this week's board!": "이번 주 보드의 첫 주인공이 되어 보세요!", "Answer 7 questions with your agent. Fast and right scores the most.": "에이전트와 함께 7문제를 풀어요. 빠르고 정확할수록 점수가 높아요.", "Your agent helps once a run: 50 : 50": "판마다 한 번 에이전트가 도와줘요: 50 : 50", "Make your agent in the Genesis Lab first": "먼저 제네시스 랩에서 에이전트를 만드세요", "Start a run": "도전 시작", "{n} runs a day · 15 s a question · no ARCL, points for the week's board": "하루 {n}판 · 문제당 15초 · ARCL 없음, 주간 보드 점수", "This week's sharpest agents": "이번 주 가장 똑똑한 에이전트", "Question {i} of {n}": "{n}문제 중 {i}번째", "I'm with you — pick the safe answer.": "내가 함께할게요 — 안전한 답을 골라요.", "{name}: 50 : 50": "{name}: 50 : 50", "Time's up — next one!": "시간 끝 — 다음 문제!", "That one's wrong — I'd skip it.": "그건 오답이에요 — 피하세요.", "Marking your answers…": "답을 채점하는 중…", "Perfect run!": "퍼펙트!", "Sharp!": "예리해요!", "Not bad!": "나쁘지 않아요!", "We'll get them next time.": "다음엔 꼭 맞혀요.", "{c} of {n} right": "{n}문제 중 {c}개 정답", "Perfect": "퍼펙트", "This week: #{r} · {p} points": "이번 주: {r}위 · {p}점", "Another run": "한 판 더", "Board": "보드", "Locked in!": "확정!", "Good call.": "좋은 선택이에요.", "Next one!": "다음 문제!", "Keep going!": "계속 가요!", "Stay sharp.": "집중해요.", "Agent Arena hour": "에이전트 아레나 아워", "What do you pay network fees with on Arc?": "Arc에서 네트워크 수수료는 무엇으로 내나요?", "USDC": "USDC", "ETH": "ETH", "Nothing: Arc has no fees": "없음: Arc는 수수료가 없다", "Which coin is ARCIRCLE World's own token?": "ARCIRCLE World의 자체 토큰은?", "$ARCIRCLE": "$ARCIRCLE", "ARCL points": "ARCL 포인트", "USDT": "USDT", "What are ARCL in ARCIRCLE World?": "ARCIRCLE World에서 ARCL은 무엇인가요?", "The game's points: earned by playing, spent in the game": "게임 포인트: 플레이로 벌고 게임에서 쓴다", "A coin you can only buy": "돈으로만 살 수 있는 코인", "Another name for USDC": "USDC의 다른 이름", "Who signs a creator settlement in ARCIRCLE World?": "ARCIRCLE World에서 크리에이터 정산은 누가 서명하나요?", "A GM, with their own wallet": "GM이 자신의 지갑으로", "The server, with its own key": "서버가 자기 키로", "Anyone who asks": "요청하는 누구나", "What's the most an Agent Vault trade can be?": "에이전트 볼트 거래 한 번의 최대 금액은?", "100 USDC": "100 USDC", "1 USDC": "1 USDC", "A token's price is up 900% in an hour on tiny volume. The careful move?": "거래량이 아주 적은데 한 시간에 900% 오른 토큰. 신중한 선택은?", "Check the liquidity and holders before anything": "무엇보다 먼저 유동성과 보유자를 확인한다", "Buy all you can at once": "한 번에 살 수 있는 만큼 산다", "Borrow to buy more": "빌려서 더 산다", "What does a seed phrase of 12 or 24 words give someone?": "12개 또는 24개 단어의 시드 문구는 누군가에게 무엇을 주나요?", "Full control of the wallet": "지갑의 완전한 통제권", "Only a look at the balance": "잔액 조회만", "Nothing without your password": "비밀번호 없이는 아무것도", "What is a wallet address safe to share for?": "지갑 주소는 무엇을 위해 공유해도 안전한가요?", "Receiving tokens": "토큰 받기", "Logging in for someone else": "다른 사람이 대신 로그인하기", "Recovering the wallet": "지갑 복구하기", "An \"exchange\" site has a URL one letter off the real one. It is…": "\"거래소\" 사이트 주소가 진짜와 한 글자 다르다. 이것은…", "A look-alike phishing site": "닮은꼴 피싱 사이트", "A faster mirror": "더 빠른 미러 사이트", "The real site's beta": "진짜 사이트의 베타 버전", "How many heroes can you pick from in ARCIRCLE World?": "ARCIRCLE World에서 고를 수 있는 영웅은 몇 명?", "Three: ARON, LUMI and NEX": "셋: ARON, LUMI, NEX", "One": "한 명", "Ten": "열 명", "Where do agents go to work on errands in Nexus City?": "넥서스 시티에서 에이전트는 심부름하러 어디로 가나요?", "The Bio Garden, the Ore Refinery and the Scout Deck": "바이오 가든, 광석 정제소, 정찰 데크", "The Poker Lounge": "포커 라운지", "Nowhere: errands are instant": "아무 데도: 심부름은 즉시 끝난다", "Revoking an old token approval does what?": "오래된 토큰 승인을 취소하면?", "Stops that contract from moving your token": "그 컨트랙트가 내 토큰을 옮기지 못하게 한다", "Deletes the token": "토큰이 삭제된다", "Sends the token back to its maker": "토큰이 만든 사람에게 돌아간다" });
Object.assign(WORDS.zh, { "Quiz duels with your agent": "与你的智能体一起答题对决", "Arena hour now · points ×2": "竞技场时段进行中 · 积分 ×2", "Next arena hour {t}": "下一个竞技场时段 {t}", "Be the first on this week's board!": "成为本周榜单的第一人!", "Answer 7 questions with your agent. Fast and right scores the most.": "和你的智能体一起回答 7 道题。又快又准得分最高。", "Your agent helps once a run: 50 : 50": "每局智能体可帮你一次: 50 : 50", "Make your agent in the Genesis Lab first": "请先在创世实验室创建你的智能体", "Start a run": "开始挑战", "{n} runs a day · 15 s a question · no ARCL, points for the week's board": "每天 {n} 局 · 每题 15 秒 · 无 ARCL,积分计入周榜", "This week's sharpest agents": "本周最聪明的智能体", "Question {i} of {n}": "第 {i} 题 / 共 {n} 题", "I'm with you — pick the safe answer.": "我陪着你 — 选最安全的答案。", "{name}: 50 : 50": "{name}: 50 : 50", "Time's up — next one!": "时间到 — 下一题!", "That one's wrong — I'd skip it.": "那个是错的 — 别选它。", "Marking your answers…": "正在批改你的答案…", "Perfect run!": "完美通关!", "Sharp!": "厉害!", "Not bad!": "还不错!", "We'll get them next time.": "下次一定答对。", "{c} of {n} right": "答对 {c} / {n}", "Perfect": "完美", "This week: #{r} · {p} points": "本周: 第 {r} 名 · {p} 分", "Another run": "再来一局", "Board": "榜单", "Locked in!": "已锁定!", "Good call.": "好选择。", "Next one!": "下一题!", "Keep going!": "继续!", "Stay sharp.": "保持专注。", "Agent Arena hour": "智能体竞技场时段", "What do you pay network fees with on Arc?": "在 Arc 上用什么支付网络手续费?", "USDC": "USDC", "ETH": "ETH", "Nothing: Arc has no fees": "不用付: Arc 没有手续费", "Which coin is ARCIRCLE World's own token?": "哪个是 ARCIRCLE World 自己的代币?", "$ARCIRCLE": "$ARCIRCLE", "ARCL points": "ARCL 积分", "USDT": "USDT", "What are ARCL in ARCIRCLE World?": "ARCIRCLE World 里的 ARCL 是什么?", "The game's points: earned by playing, spent in the game": "游戏积分: 玩游戏获得,在游戏里花", "A coin you can only buy": "只能购买的币", "Another name for USDC": "USDC 的另一个名字", "Who signs a creator settlement in ARCIRCLE World?": "ARCIRCLE World 的创作者结算由谁签名?", "A GM, with their own wallet": "GM 用自己的钱包", "The server, with its own key": "服务器用自己的密钥", "Anyone who asks": "任何提出请求的人", "What's the most an Agent Vault trade can be?": "智能体金库单笔交易最多是多少?", "100 USDC": "100 USDC", "1 USDC": "1 USDC", "A token's price is up 900% in an hour on tiny volume. The careful move?": "某代币在极小成交量下一小时涨了 900%。谨慎的做法是?", "Check the liquidity and holders before anything": "先检查流动性和持有人", "Buy all you can at once": "立刻能买多少买多少", "Borrow to buy more": "借钱买更多", "What does a seed phrase of 12 or 24 words give someone?": "12 或 24 个词的助记词能让别人得到什么?", "Full control of the wallet": "钱包的完全控制权", "Only a look at the balance": "只能查看余额", "Nothing without your password": "没有密码什么都做不了", "What is a wallet address safe to share for?": "钱包地址可以安全地分享来做什么?", "Receiving tokens": "接收代币", "Logging in for someone else": "让别人替你登录", "Recovering the wallet": "恢复钱包", "An \"exchange\" site has a URL one letter off the real one. It is…": "某\"交易所\"网址和真网址差一个字母。它是…", "A look-alike phishing site": "仿冒的钓鱼网站", "A faster mirror": "更快的镜像站", "The real site's beta": "真网站的测试版", "How many heroes can you pick from in ARCIRCLE World?": "ARCIRCLE World 可以选几个英雄?", "Three: ARON, LUMI and NEX": "三个: ARON、LUMI 和 NEX", "One": "一个", "Ten": "十个", "Where do agents go to work on errands in Nexus City?": "在 Nexus 城,智能体去哪里跑腿?", "The Bio Garden, the Ore Refinery and the Scout Deck": "生物花园、矿石精炼厂和侦察平台", "The Poker Lounge": "扑克休息室", "Nowhere: errands are instant": "哪儿也不去: 跑腿瞬间完成", "Revoking an old token approval does what?": "撤销旧的代币授权会怎样?", "Stops that contract from moving your token": "阻止该合约转走你的代币", "Deletes the token": "删除这个代币", "Sends the token back to its maker": "把代币退回给发行方" });
Object.assign(WORDS.tr, { "Quiz duels with your agent": "Ajanınla bilgi düelloları", "Arena hour now · points ×2": "Şimdi arena saati · puan ×2", "Next arena hour {t}": "Sonraki arena saati {t}", "Be the first on this week's board!": "Bu haftanın tablosunda ilk sen ol!", "Answer 7 questions with your agent. Fast and right scores the most.": "Ajanınla 7 soruyu yanıtla. Hızlı ve doğru olan en çok puanı alır.", "Your agent helps once a run: 50 : 50": "Ajanın her turda bir kez yardım eder: 50 : 50", "Make your agent in the Genesis Lab first": "Önce Genesis Lab'da ajanını oluştur", "Start a run": "Turu başlat", "{n} runs a day · 15 s a question · no ARCL, points for the week's board": "Günde {n} tur · soru başına 15 sn · ARCL yok, haftalık tablo puanı", "This week's sharpest agents": "Bu haftanın en keskin ajanları", "Question {i} of {n}": "Soru {i} / {n}", "I'm with you — pick the safe answer.": "Yanındayım — güvenli cevabı seç.", "{name}: 50 : 50": "{name}: 50 : 50", "Time's up — next one!": "Süre doldu — sıradaki!", "That one's wrong — I'd skip it.": "O yanlış — onu geç.", "Marking your answers…": "Cevapların puanlanıyor…", "Perfect run!": "Kusursuz tur!", "Sharp!": "Keskin!", "Not bad!": "Fena değil!", "We'll get them next time.": "Bir dahakine biliriz.", "{c} of {n} right": "{n} sorudan {c} doğru", "Perfect": "Kusursuz", "This week: #{r} · {p} points": "Bu hafta: #{r} · {p} puan", "Another run": "Bir tur daha", "Board": "Tablo", "Locked in!": "Kilitlendi!", "Good call.": "İyi seçim.", "Next one!": "Sıradaki!", "Keep going!": "Devam!", "Stay sharp.": "Dikkatli ol.", "Agent Arena hour": "Ajan Arenası saati", "What do you pay network fees with on Arc?": "Arc'ta ağ ücretlerini neyle ödersin?", "USDC": "USDC", "ETH": "ETH", "Nothing: Arc has no fees": "Hiçbir şey: Arc'ta ücret yok", "Which coin is ARCIRCLE World's own token?": "ARCIRCLE World'ün kendi token'ı hangisi?", "$ARCIRCLE": "$ARCIRCLE", "ARCL points": "ARCL puanları", "USDT": "USDT", "What are ARCL in ARCIRCLE World?": "ARCIRCLE World'de ARCL nedir?", "The game's points: earned by playing, spent in the game": "Oyunun puanları: oynayarak kazanılır, oyunda harcanır", "A coin you can only buy": "Sadece satın alınabilen bir coin", "Another name for USDC": "USDC'nin başka bir adı", "Who signs a creator settlement in ARCIRCLE World?": "ARCIRCLE World'de içerik üreticisi ödemesini kim imzalar?", "A GM, with their own wallet": "Bir GM, kendi cüzdanıyla", "The server, with its own key": "Sunucu, kendi anahtarıyla", "Anyone who asks": "İsteyen herkes", "What's the most an Agent Vault trade can be?": "Bir Agent Vault işlemi en fazla ne kadar olabilir?", "100 USDC": "100 USDC", "1 USDC": "1 USDC", "A token's price is up 900% in an hour on tiny volume. The careful move?": "Bir token çok düşük hacimle bir saatte %900 arttı. Dikkatli hamle?", "Check the liquidity and holders before anything": "Her şeyden önce likiditeyi ve sahipleri kontrol et", "Buy all you can at once": "Bir anda alabildiğin kadar al", "Borrow to buy more": "Daha fazla almak için borç al", "What does a seed phrase of 12 or 24 words give someone?": "12 ya da 24 kelimelik kurtarma ifadesi birine ne verir?", "Full control of the wallet": "Cüzdanın tam kontrolü", "Only a look at the balance": "Sadece bakiyeye bakma", "Nothing without your password": "Şifren olmadan hiçbir şey", "What is a wallet address safe to share for?": "Cüzdan adresini ne için paylaşmak güvenlidir?", "Receiving tokens": "Token almak", "Logging in for someone else": "Başkası adına giriş yapmak", "Recovering the wallet": "Cüzdanı kurtarmak", "An \"exchange\" site has a URL one letter off the real one. It is…": "Bir \"borsa\" sitesinin adresi gerçeğinden bir harf farklı. Bu…", "A look-alike phishing site": "Taklit bir oltalama sitesi", "A faster mirror": "Daha hızlı bir yansı", "The real site's beta": "Gerçek sitenin betası", "How many heroes can you pick from in ARCIRCLE World?": "ARCIRCLE World'de kaç kahraman arasından seçebilirsin?", "Three: ARON, LUMI and NEX": "Üç: ARON, LUMI ve NEX", "One": "Bir", "Ten": "On", "Where do agents go to work on errands in Nexus City?": "Nexus City'de ajanlar görevler için nereye gider?", "The Bio Garden, the Ore Refinery and the Scout Deck": "Bio Bahçe, Cevher Rafinerisi ve Keşif Güvertesi", "The Poker Lounge": "Poker Salonu", "Nowhere: errands are instant": "Hiçbir yere: görevler anında biter", "Revoking an old token approval does what?": "Eski bir token onayını iptal etmek ne yapar?", "Stops that contract from moving your token": "O sözleşmenin token'ını taşımasını durdurur", "Deletes the token": "Token'ı siler", "Sends the token back to its maker": "Token'ı yapıcısına geri gönderir" });
Object.assign(WORDS.ko, { "Difficulty": "난이도", "Test": "테스트", "Pick a template": "템플릿을 골라요", "Pick a look": "분위기를 골라요", "How hard should it be?": "얼마나 어렵게 할까요?", "Try it before anyone else": "먼저 직접 플레이해 봐요", "Save it and put it on the arcade": "저장하고 아케이드에 올려요", "Easy": "쉬움", "Normal": "보통", "Hard": "어려움", "Extreme": "극한", "walls": "벽", "gaps": "구멍", "lasers": "레이저", "drones": "드론", "big drones": "큰 드론", "laser sweeps": "레이저 휩쓸기", "Estimated clear rate {p}%": "예상 클리어율 {p}%", "Most runs end at: {x}": "가장 많이 실패하는 곳: {x}", "Advanced settings": "고급 설정", "Your test: {s} points": "내 테스트: {s}점", "It's on the Creator Arcade!": "크리에이터 아케이드에 올라갔어요!", "Saved as a draft. Publish it so everyone can play.": "초안으로 저장됐어요. 게시하면 모두가 플레이할 수 있어요.", "Save it to keep it, then publish it to the Creator Arcade.": "저장해서 간직하고, 크리에이터 아케이드에 게시해요.", "See it in My games": "내 게임에서 보기" });
Object.assign(WORDS.zh, { "Difficulty": "难度", "Test": "测试", "Pick a template": "选择模板", "Pick a look": "选择外观", "How hard should it be?": "要多难?", "Try it before anyone else": "先自己试玩一下", "Save it and put it on the arcade": "保存并发布到街机厅", "Easy": "简单", "Normal": "普通", "Hard": "困难", "Extreme": "极限", "walls": "墙", "gaps": "缺口", "lasers": "激光", "drones": "无人机", "big drones": "大型无人机", "laser sweeps": "激光扫射", "Estimated clear rate {p}%": "预计通关率 {p}%", "Most runs end at: {x}": "最常失败在: {x}", "Advanced settings": "高级设置", "Your test: {s} points": "你的测试: {s} 分", "It's on the Creator Arcade!": "已发布到创作者街机厅!", "Saved as a draft. Publish it so everyone can play.": "已存为草稿。发布后所有人都能玩。", "Save it to keep it, then publish it to the Creator Arcade.": "先保存,再发布到创作者街机厅。", "See it in My games": "在我的游戏中查看" });
Object.assign(WORDS.tr, { "Difficulty": "Zorluk", "Test": "Test", "Pick a template": "Bir şablon seç", "Pick a look": "Bir görünüm seç", "How hard should it be?": "Ne kadar zor olsun?", "Try it before anyone else": "Herkesten önce dene", "Save it and put it on the arcade": "Kaydet ve arcade'e koy", "Easy": "Kolay", "Normal": "Normal", "Hard": "Zor", "Extreme": "Aşırı", "walls": "duvarlar", "gaps": "boşluklar", "lasers": "lazerler", "drones": "dronlar", "big drones": "büyük dronlar", "laser sweeps": "lazer taramaları", "Estimated clear rate {p}%": "Tahmini bitirme oranı %{p}", "Most runs end at: {x}": "Koşuların çoğu burada biter: {x}", "Advanced settings": "Gelişmiş ayarlar", "Your test: {s} points": "Testin: {s} puan", "It's on the Creator Arcade!": "Creator Arcade'de!", "Saved as a draft. Publish it so everyone can play.": "Taslak olarak kaydedildi. Herkes oynayabilsin diye yayınla.", "Save it to keep it, then publish it to the Creator Arcade.": "Saklamak için kaydet, sonra Creator Arcade'de yayınla.", "See it in My games": "Oyunlarımda gör" });
Object.assign(WORDS.ko, { "Your best here: {n}": "이 게임 내 최고 기록: {n}", "Top 10": "TOP 10", "Nobody has played it yet — be the first!": "아직 아무도 안 해봤어요 — 첫 번째가 되어 보세요!", "Race {n}'s ghost ({s})": "{n}의 고스트와 경주 ({s})", "You beat {n}'s {s}!": "{n}의 {s}점을 넘었어요!", "{n} scored {s} — {d} to go": "{n}의 기록 {s}점 — {d}점 남았어요", "You're #1 — your run is the ghost to beat now": "1위예요 — 이제 내 플레이가 모두가 이겨야 할 고스트예요", "Challenge a friend": "친구에게 도전장", "Next game": "다음 게임", "Challenge link copied — can they beat {s}?": "도전 링크 복사됨 — {s}점을 넘을 수 있을까요?", "That's every game on the arcade for now": "지금은 아케이드의 게임을 모두 해봤어요" });
Object.assign(WORDS.zh, { "Your best here: {n}": "你在这里的最好成绩: {n}", "Top 10": "前 10 名", "Nobody has played it yet — be the first!": "还没人玩过 — 来当第一个!", "Race {n}'s ghost ({s})": "和 {n} 的幽灵比赛 ({s})", "You beat {n}'s {s}!": "你超过了 {n} 的 {s} 分!", "{n} scored {s} — {d} to go": "{n} 得了 {s} 分 — 还差 {d} 分", "You're #1 — your run is the ghost to beat now": "你是第 1 名 — 你的这局成了大家要追的幽灵", "Challenge a friend": "挑战好友", "Next game": "下一个游戏", "Challenge link copied — can they beat {s}?": "挑战链接已复制 — 他们能超过 {s} 分吗?", "That's every game on the arcade for now": "街机厅的游戏目前就这些" });
Object.assign(WORDS.tr, { "Your best here: {n}": "Buradaki en iyin: {n}", "Top 10": "İlk 10", "Nobody has played it yet — be the first!": "Henüz kimse oynamadı — ilk sen ol!", "Race {n}'s ghost ({s})": "{n} hayaletiyle yarış ({s})", "You beat {n}'s {s}!": "{n} adlı oyuncunun {s} puanını geçtin!", "{n} scored {s} — {d} to go": "{n} {s} puan aldı — {d} kaldı", "You're #1 — your run is the ghost to beat now": "1. sıradasın — artık senin koşun geçilecek hayalet", "Challenge a friend": "Bir arkadaşına meydan oku", "Next game": "Sonraki oyun", "Challenge link copied — can they beat {s}?": "Meydan okuma bağlantısı kopyalandı — {s} puanı geçebilecekler mi?", "That's every game on the arcade for now": "Şimdilik arcade'deki oyunlar bu kadar" });
Object.assign(WORDS.ko, { "No hints": "힌트 없음", "1 hint": "힌트 1개", "2 hints": "힌트 2개", "3 hints": "힌트 3개", "Rings": "링 개수", "Pegs": "말뚝", "Lock rings": "잠금 링", "Ice rings": "얼음 링", "Energy rings": "에너지 링", "Hints": "힌트", "{n} rings · par {p}": "링 {n}개 · 기준 {p}수", "Moves {n}": "{n}수", "Par {n}": "기준 {n}수", "Cleared!": "클리어!" });
Object.assign(WORDS.zh, { "No hints": "无提示", "1 hint": "1 个提示", "2 hints": "2 个提示", "3 hints": "3 个提示", "Rings": "圆环数量", "Pegs": "钉子", "Lock rings": "锁环", "Ice rings": "冰环", "Energy rings": "能量环", "Hints": "提示", "{n} rings · par {p}": "{n} 个环 · 标准 {p} 步", "Moves {n}": "{n} 步", "Par {n}": "标准 {n} 步", "Cleared!": "通关!" });
Object.assign(WORDS.tr, { "No hints": "İpucu yok", "1 hint": "1 ipucu", "2 hints": "2 ipucu", "3 hints": "3 ipucu", "Rings": "Halkalar", "Pegs": "Çiviler", "Lock rings": "Kilit halkaları", "Ice rings": "Buz halkaları", "Energy rings": "Enerji halkaları", "Hints": "İpuçları", "{n} rings · par {p}": "{n} halka · par {p}", "Moves {n}": "{n} hamle", "Par {n}": "Par {n}", "Cleared!": "Temizlendi!" });
Object.assign(WORDS.ko, { "Get my agent — {n} $ARCIRCLE": "내 에이전트 받기 — {n} $ARCIRCLE", "50% of the price is burned, 50% goes to the ARCIRCLE treasury — sent from your own wallet on Arc.": "가격의 50%는 소각되고 50%는 ARCIRCLE 트레저리로 가요 — Arc에서 내 지갑으로 직접 보내요.", "AGENT DIMENSION is open!": "AGENT DIMENSION 오픈!", "50% OFF": "50% 할인", "Pick AURORA, ORION or VEX. 50% of the price is burned, 50% goes to the treasury.": "AURORA, ORION, VEX 중 하나를 골라요. 가격의 50%는 소각, 50%는 트레저리로 가요.", "Your payment is still confirming on Arc — try Create again in a minute; it won't charge you twice.": "결제가 아직 Arc에서 확인 중이에요 — 1분 뒤 다시 만들기를 눌러 주세요. 두 번 결제되지 않아요.", "Choose your AI agent — 100,000 $ARCIRCLE, 50% off": "나의 AI 에이전트를 골라요 — 100,000 $ARCIRCLE, 50% 할인", "AGENT DIMENSION is open! Pick AURORA, ORION or VEX — 50% of the price is burned, 50% goes to the treasury.": "AGENT DIMENSION 오픈! AURORA, ORION, VEX 중 하나를 골라요 — 가격의 50%는 소각, 50%는 트레저리로 가요.", "Go to the AD Tower": "AD 타워로 가기", "Waiting for Arc to confirm…": "Arc에서 확인 중…" });
Object.assign(WORDS.zh, { "Get my agent — {n} $ARCIRCLE": "获取我的智能体 — {n} $ARCIRCLE", "50% of the price is burned, 50% goes to the ARCIRCLE treasury — sent from your own wallet on Arc.": "价格的 50% 销毁,50% 进入 ARCIRCLE 金库 — 在 Arc 上由你自己的钱包发送。", "AGENT DIMENSION is open!": "AGENT DIMENSION 正式开放!", "50% OFF": "5 折", "Pick AURORA, ORION or VEX. 50% of the price is burned, 50% goes to the treasury.": "从 AURORA、ORION、VEX 中选一个。价格的 50% 销毁,50% 进入金库。", "Your payment is still confirming on Arc — try Create again in a minute; it won't charge you twice.": "你的付款仍在 Arc 上确认中 — 一分钟后再点创建,不会重复扣款。", "Choose your AI agent — 100,000 $ARCIRCLE, 50% off": "选择你的 AI 智能体 — 100,000 $ARCIRCLE,5 折", "AGENT DIMENSION is open! Pick AURORA, ORION or VEX — 50% of the price is burned, 50% goes to the treasury.": "AGENT DIMENSION 正式开放!从 AURORA、ORION、VEX 中选一个 — 价格的 50% 销毁,50% 进入金库。", "Go to the AD Tower": "前往 AD 塔", "Waiting for Arc to confirm…": "等待 Arc 确认…" });
Object.assign(WORDS.tr, { "Get my agent — {n} $ARCIRCLE": "Ajanımı al — {n} $ARCIRCLE", "50% of the price is burned, 50% goes to the ARCIRCLE treasury — sent from your own wallet on Arc.": "Fiyatın %50'si yakılır, %50'si ARCIRCLE hazinesine gider — Arc'ta kendi cüzdanından gönderilir.", "AGENT DIMENSION is open!": "AGENT DIMENSION açıldı!", "50% OFF": "%50 İNDİRİM", "Pick AURORA, ORION or VEX. 50% of the price is burned, 50% goes to the treasury.": "AURORA, ORION ya da VEX'i seç. Fiyatın %50'si yakılır, %50'si hazineye gider.", "Your payment is still confirming on Arc — try Create again in a minute; it won't charge you twice.": "Ödemen Arc'ta hâlâ onaylanıyor — bir dakika sonra tekrar Oluştur'a bas; iki kez ücret alınmaz.", "Choose your AI agent — 100,000 $ARCIRCLE, 50% off": "AI ajanını seç — 100.000 $ARCIRCLE, %50 indirim", "AGENT DIMENSION is open! Pick AURORA, ORION or VEX — 50% of the price is burned, 50% goes to the treasury.": "AGENT DIMENSION açıldı! AURORA, ORION ya da VEX'i seç — fiyatın %50'si yakılır, %50'si hazineye gider.", "Go to the AD Tower": "AD Kulesi'ne git", "Waiting for Arc to confirm…": "Arc onayı bekleniyor…" });
Object.assign(WORDS.ko, { "Taking you to the AD Tower as soon as the town is ready…": "마을이 준비되면 바로 AD 타워로 데려갈게요…" });
Object.assign(WORDS.zh, { "Taking you to the AD Tower as soon as the town is ready…": "城镇准备好后立即带你前往 AD 塔…" });
Object.assign(WORDS.tr, { "Taking you to the AD Tower as soon as the town is ready…": "Kasaba hazır olur olmaz seni AD Kulesi'ne götüreceğim…" });
Object.assign(WORDS.ko, { "How to use": "사용법" });
Object.assign(WORDS.zh, { "How to use": "使用方法" });
Object.assign(WORDS.tr, { "How to use": "Nasıl kullanılır" });
Object.assign(WORDS.ko, { "Hand-built layout": "직접 만든 레이아웃", "{n} pieces · {m} m": "조각 {n}개 · {m} m", "Edit the layout": "레이아웃 편집", "Back to quick start": "빠른 시작으로 돌아가기", "Build it yourself": "직접 만들기", "Place every wall, gap, laser, coin and heart by hand — starting from this layout.": "벽·구멍·레이저·코인·하트를 하나하나 직접 놓아요 — 지금 레이아웃에서 시작해요.", "Open the builder": "편집기 열기", "Versions": "버전", "Go back to the quick-start layout? Your hand-built layout is dropped.": "빠른 시작 레이아웃으로 돌아갈까요? 직접 만든 레이아웃은 사라져요.", "Earlier saves — open one, then save to keep it": "이전 저장본 — 하나를 열고 저장하면 그 버전이 남아요", "An earlier save is open — save to keep it": "이전 저장본을 열었어요 — 저장하면 이 버전으로 남아요", "Redo": "다시 실행", "Test from here": "여기서부터 테스트", "Finish": "결승", "Pieces": "조각", "START": "출발", "LOOP": "반복 지점", "FINISH": "결승", "Pick a piece first": "먼저 조각을 고르세요", "Pick a piece, then tap the track where it starts.": "조각을 고른 다음, 시작할 위치의 트랙을 누르세요.", "Tap where to paste": "붙여넣을 위치를 누르세요", "Cut": "잘라내기", "{n} pieces won't count (red ✕): obstacles need {m} m between them, a free lane, one kind a row": "{n}개는 반영되지 않아요 (빨간 ✕): 장애물 사이는 {m} m 이상, 비어 있는 레인 하나, 한 줄에 한 종류만", "Leave without keeping your changes?": "바꾼 내용을 버리고 나갈까요?", "{n} pieces copied": "조각 {n}개 복사됨", "Zigzag walls": "지그재그 벽", "Laser tunnel": "레이저 터널", "Coin arch": "코인 아치", "Gap jumps": "구멍 점프", "Slalom": "슬라럼", "Gauntlet": "시련 구간", "Reward run": "보상 구간", "Tap where a stretch starts": "구간이 시작할 위치를 누르세요", "Tap where the stretch ends": "구간이 끝날 위치를 누르세요", "Gap": "구멍", "Laser": "레이저", "Erase": "지우기", "Select": "선택" });
Object.assign(WORDS.zh, { "Hand-built layout": "手工布局", "{n} pieces · {m} m": "{n} 个物件 · {m} 米", "Edit the layout": "编辑布局", "Back to quick start": "回到快速开始", "Build it yourself": "自己动手做", "Place every wall, gap, laser, coin and heart by hand — starting from this layout.": "亲手放置每一面墙、缺口、激光、金币和爱心——从当前布局开始。", "Open the builder": "打开编辑器", "Versions": "版本", "Go back to the quick-start layout? Your hand-built layout is dropped.": "回到快速开始的布局？你的手工布局将被丢弃。", "Earlier saves — open one, then save to keep it": "之前的保存——打开一个，再保存即可保留", "An earlier save is open — save to keep it": "已打开之前的保存——保存即可保留", "Redo": "重做", "Test from here": "从这里试玩", "Finish": "终点", "Pieces": "组件", "START": "起点", "LOOP": "循环点", "FINISH": "终点", "Pick a piece first": "请先选择一个组件", "Pick a piece, then tap the track where it starts.": "选择一个组件，然后点击它在赛道上的起点。", "Tap where to paste": "点击要粘贴的位置", "Cut": "剪切", "{n} pieces won't count (red ✕): obstacles need {m} m between them, a free lane, one kind a row": "{n} 个物件不会生效（红色 ✕）：障碍之间需相隔 {m} 米、留一条空道、每行只能一种", "Leave without keeping your changes?": "不保留修改就离开？", "{n} pieces copied": "已复制 {n} 个物件", "Zigzag walls": "之字墙", "Laser tunnel": "激光隧道", "Coin arch": "金币拱", "Gap jumps": "缺口跳跃", "Slalom": "障碍滑道", "Gauntlet": "连环关卡", "Reward run": "奖励路段", "Tap where a stretch starts": "点击路段的起点", "Tap where the stretch ends": "点击路段的终点", "Gap": "缺口", "Laser": "激光", "Erase": "擦除", "Select": "选择" });
Object.assign(WORDS.tr, { "Hand-built layout": "Elle yapılmış düzen", "{n} pieces · {m} m": "{n} parça · {m} m", "Edit the layout": "Düzeni düzenle", "Back to quick start": "Hızlı başlangıca dön", "Build it yourself": "Kendin yap", "Place every wall, gap, laser, coin and heart by hand — starting from this layout.": "Her duvarı, boşluğu, lazeri, parayı ve kalbi elle yerleştir — bu düzenden başlayarak.", "Open the builder": "Editörü aç", "Versions": "Sürümler", "Go back to the quick-start layout? Your hand-built layout is dropped.": "Hızlı başlangıç düzenine dönülsün mü? Elle yaptığın düzen silinir.", "Earlier saves — open one, then save to keep it": "Önceki kayıtlar — birini aç, saklamak için kaydet", "An earlier save is open — save to keep it": "Önceki bir kayıt açık — saklamak için kaydet", "Redo": "Yinele", "Test from here": "Buradan dene", "Finish": "Bitiş", "Pieces": "Parçalar", "START": "BAŞLA", "LOOP": "DÖNGÜ", "FINISH": "BİTİŞ", "Pick a piece first": "Önce bir parça seç", "Pick a piece, then tap the track where it starts.": "Bir parça seç, sonra başlayacağı yere dokun.", "Tap where to paste": "Yapıştırılacak yere dokun", "Cut": "Kes", "{n} pieces won't count (red ✕): obstacles need {m} m between them, a free lane, one kind a row": "{n} parça sayılmayacak (kırmızı ✕): engeller arasında {m} m, boş bir şerit, sıra başına tek tür", "Leave without keeping your changes?": "Değişiklikleri saklamadan çıkılsın mı?", "{n} pieces copied": "{n} parça kopyalandı", "Zigzag walls": "Zikzak duvarlar", "Laser tunnel": "Lazer tüneli", "Coin arch": "Para kemeri", "Gap jumps": "Boşluk atlamaları", "Slalom": "Slalom", "Gauntlet": "Zorlu geçit", "Reward run": "Ödül koşusu", "Tap where a stretch starts": "Bir bölümün başladığı yere dokun", "Tap where the stretch ends": "Bölümün bittiği yere dokun", "Gap": "Boşluk", "Laser": "Lazer", "Erase": "Sil", "Select": "Seç" });
Object.assign(WORDS.ko, { "Moving wall": "움직이는 벽", "Blinking laser": "깜빡이는 레이저", "Rule cards (up to 2)": "규칙 카드 (최대 2장)", "Low gravity": "저중력", "Mirrored controls": "좌우 반전", "Night run": "밤의 질주", "One heart": "하트 하나", "Speeds up": "점점 빨라짐", "Two rule cards at most — take one off first": "규칙 카드는 2장까지예요 — 하나를 먼저 빼세요" });
Object.assign(WORDS.zh, { "Moving wall": "移动墙", "Blinking laser": "闪烁激光", "Rule cards (up to 2)": "规则卡（最多 2 张）", "Low gravity": "低重力", "Mirrored controls": "左右反转", "Night run": "夜跑", "One heart": "仅一颗心", "Speeds up": "越来越快", "Two rule cards at most — take one off first": "最多两张规则卡——请先取下一张" });
Object.assign(WORDS.tr, { "Moving wall": "Hareketli duvar", "Blinking laser": "Yanıp sönen lazer", "Rule cards (up to 2)": "Kural kartları (en çok 2)", "Low gravity": "Düşük yerçekimi", "Mirrored controls": "Ters kontroller", "Night run": "Gece koşusu", "One heart": "Tek kalp", "Speeds up": "Hızlanır", "Two rule cards at most — take one off first": "En çok iki kural kartı — önce birini çıkar" });
Object.assign(WORDS.ko, { "Send every drone, sweep and coin when and where you want, and stand pillars — starting from this arena.": "드론·레이저 스윕·코인을 원하는 때와 방향에 직접 보내고 기둥도 세워요 — 지금 아레나에서 시작해요.", "Drone ring": "드론 링", "Wave rush": "웨이브 러시", "Sweep cross": "십자 스윕", "Big boss": "빅 보스", "Coin circle": "코인 원", "Pillar fort": "기둥 요새", "Big drone": "큰 드론", "Laser sweep": "레이저 스윕", "Pillar": "기둥", "Drone": "드론", "Pick a piece, pick a moment, then tap the side it comes from.": "조각을 고르고, 시간을 고른 뒤, 나올 방향을 탭하세요.", "{n} pieces won't count (red ✕): pillars apart and off the start, at most {b} arrivals a second": "{n}개는 반영되지 않아요 (빨간 ✕): 기둥은 서로 떨어지고 시작점 밖에, 1초에 최대 {b}개 등장", "{n} pieces · {s} s": "{n}개 · {s}초" });
Object.assign(WORDS.zh, { "Send every drone, sweep and coin when and where you want, and stand pillars — starting from this arena.": "在你想要的时间和方向亲手放出每个无人机、激光扫射和金币，还能立起柱子——从这个竞技场开始。", "Drone ring": "无人机环", "Wave rush": "波次冲锋", "Sweep cross": "十字扫射", "Big boss": "大头目", "Coin circle": "金币圆环", "Pillar fort": "柱子堡垒", "Big drone": "大型无人机", "Laser sweep": "激光扫射", "Pillar": "柱子", "Drone": "无人机", "Pick a piece, pick a moment, then tap the side it comes from.": "选一个组件，选一个时间点，再点它出现的方向。", "{n} pieces won't count (red ✕): pillars apart and off the start, at most {b} arrivals a second": "{n} 个不会计入（红色 ✕）：柱子要彼此分开且不在起点，每秒最多出现 {b} 个", "{n} pieces · {s} s": "{n} 个 · {s} 秒" });
Object.assign(WORDS.tr, { "Send every drone, sweep and coin when and where you want, and stand pillars — starting from this arena.": "Her dronu, lazer taramasını ve jetonu istediğin an ve yönden gönder, sütunlar dik — bu arenadan başlayarak.", "Drone ring": "Dron halkası", "Wave rush": "Dalga hücumu", "Sweep cross": "Çapraz tarama", "Big boss": "Büyük patron", "Coin circle": "Jeton çemberi", "Pillar fort": "Sütun kalesi", "Big drone": "Büyük dron", "Laser sweep": "Lazer taraması", "Pillar": "Sütun", "Drone": "Dron", "Pick a piece, pick a moment, then tap the side it comes from.": "Bir parça seç, bir an seç, sonra geleceği yana dokun.", "{n} pieces won't count (red ✕): pillars apart and off the start, at most {b} arrivals a second": "{n} parça sayılmayacak (kırmızı ✕): sütunlar ayrı ve başlangıçtan uzak, saniyede en fazla {b} geliş", "{n} pieces · {s} s": "{n} parça · {s} sn" });
Object.assign(WORDS.ko, { "Pick your board": "보드 고르기", "6 new boards": "새 보드 6개", "Another board": "다른 보드" });
Object.assign(WORDS.zh, { "Pick your board": "选择你的棋盘", "6 new boards": "换 6 个新棋盘", "Another board": "换一个棋盘" });
Object.assign(WORDS.tr, { "Pick your board": "Tahtanı seç", "6 new boards": "6 yeni tahta", "Another board": "Başka tahta" });
Object.assign(WORDS.ko, { "Sky Climb": "스카이 클라임", "Bounce": "점프 높이", "Moving platforms": "움직이는 발판", "Breaking platforms": "부서지는 발판", "Spikes": "가시", "Height": "높이", "Place every platform, spring, spike and coin up the tower by hand — starting from this one.": "발판·스프링·가시·코인을 탑 위로 하나하나 직접 놓아요 — 지금 탑에서 시작해요.", "Moving platform": "움직이는 발판", "Breaking platform": "부서지는 발판", "Spring": "스프링", "Staircase": "계단", "Zigzag": "지그재그", "Spring jump": "스프링 점프", "Crumble bridge": "무너지는 다리", "Spike gauntlet": "가시 관문", "Coin column": "코인 기둥", "GROUND": "바닥", "TOP": "정상", "moving walls": "움직이는 벽", "blinking lasers": "깜빡이는 레이저", "platforms": "발판", "moving platforms": "움직이는 발판", "breaking platforms": "부서지는 발판", "springs": "스프링", "My Sky Climb": "나의 스카이 클라임", "{m} m up · {c} coins": "{m} m 높이 · 코인 {c}개", "too high to jump": "너무 높아 못 올라가요", "{n} pieces won't count (red ✕): one thing a spot": "{n}개는 반영되지 않아요 (빨간 ✕): 한 자리에 하나만", "Boing!": "뿅!", "You reached the top!": "정상에 도착했어요!", "Hold the left or right side to steer · the sides wrap round": "화면 왼쪽/오른쪽을 누르고 있으면 이동 · 양 끝은 이어져 있어요", "← → / A D to steer · the sides wrap round": "← → / A D로 이동 · 양 끝은 이어져 있어요" });
Object.assign(WORDS.zh, { "Sky Climb": "天空攀登", "Bounce": "弹跳高度", "Moving platforms": "移动平台", "Breaking platforms": "易碎平台", "Spikes": "尖刺", "Height": "高度", "Place every platform, spring, spike and coin up the tower by hand — starting from this one.": "亲手把每个平台、弹簧、尖刺和金币放到塔上——从这座塔开始。", "Moving platform": "移动平台", "Breaking platform": "易碎平台", "Spring": "弹簧", "Staircase": "阶梯", "Zigzag": "之字形", "Spring jump": "弹簧跳", "Crumble bridge": "易碎桥", "Spike gauntlet": "尖刺关卡", "Coin column": "金币柱", "GROUND": "地面", "TOP": "塔顶", "moving walls": "移动墙", "blinking lasers": "闪烁激光", "platforms": "平台", "moving platforms": "移动平台", "breaking platforms": "易碎平台", "springs": "弹簧", "My Sky Climb": "我的天空攀登", "{m} m up · {c} coins": "高 {m} 米 · {c} 枚金币", "too high to jump": "太高跳不上去", "{n} pieces won't count (red ✕): one thing a spot": "{n} 个不会计入（红色 ✕）：一个位置只放一个", "Boing!": "弹！", "You reached the top!": "你登顶了！", "Hold the left or right side to steer · the sides wrap round": "按住屏幕左侧或右侧移动 · 两边相连", "← → / A D to steer · the sides wrap round": "← → / A D 移动 · 两边相连" });
Object.assign(WORDS.tr, { "Sky Climb": "Gökyüzü Tırmanışı", "Bounce": "Zıplama", "Moving platforms": "Hareketli platformlar", "Breaking platforms": "Kırılan platformlar", "Spikes": "Dikenler", "Height": "Yükseklik", "Place every platform, spring, spike and coin up the tower by hand — starting from this one.": "Her platformu, yayı, dikeni ve jetonu kuleye elle yerleştir — bu kuleden başlayarak.", "Moving platform": "Hareketli platform", "Breaking platform": "Kırılan platform", "Spring": "Yay", "Staircase": "Merdiven", "Zigzag": "Zikzak", "Spring jump": "Yay zıplaması", "Crumble bridge": "Çöken köprü", "Spike gauntlet": "Diken geçidi", "Coin column": "Jeton sütunu", "GROUND": "ZEMİN", "TOP": "ZİRVE", "moving walls": "hareketli duvarlar", "blinking lasers": "yanıp sönen lazerler", "platforms": "platformlar", "moving platforms": "hareketli platformlar", "breaking platforms": "kırılan platformlar", "springs": "yaylar", "My Sky Climb": "Gökyüzü Tırmanışım", "{m} m up · {c} coins": "{m} m yukarı · {c} jeton", "too high to jump": "zıplamak için çok yüksek", "{n} pieces won't count (red ✕): one thing a spot": "{n} parça sayılmayacak (kırmızı ✕): bir yere tek şey", "Boing!": "Boing!", "You reached the top!": "Zirveye ulaştın!", "Hold the left or right side to steer · the sides wrap round": "Yönlendirmek için sol ya da sağ tarafa basılı tut · kenarlar birbirine bağlı", "← → / A D to steer · the sides wrap round": "← → / A D ile yönlendir · kenarlar birbirine bağlı" });
Object.assign(WORDS.ko, { "Ledge": "발판" });
Object.assign(WORDS.zh, { "Ledge": "平台" });
Object.assign(WORDS.tr, { "Ledge": "Basamak" });
Object.assign(WORDS.ko, { "Enemy speed": "적 속도", "Starting gold": "시작 골드", "Enemies a wave": "웨이브당 적", "Tanks": "탱커", "Runners": "러너", "Waves": "웨이브", "My Tower Defense": "나의 타워 디펜스", "Bolt": "볼트", "Frost": "서리", "Cannon": "캐논", "Path": "길", "Tower pad": "타워 자리", "Draw the path, place the tower pads and set every wave by hand — starting from this map.": "길을 그리고, 타워 자리를 놓고, 웨이브를 하나하나 직접 정해요 — 지금 맵에서 시작해요.", "grunts": "졸병", "runners": "러너", "tanks": "탱커", "5 waves": "5웨이브", "8 waves": "8웨이브", "10 waves": "10웨이브", "15 waves": "15웨이브", "The next cell must be beside the path's end": "다음 칸은 길 끝 바로 옆이어야 해요", "Start the path in the top row (by the portal)": "길은 맨 윗줄(포탈 쪽)에서 시작해요", "{p} path cells · {d} pads · {w} waves": "길 {p}칸 · 타워 자리 {d}개 · {w}웨이브", "{w} waves · {n} foes · {p} pads": "{w}웨이브 · 적 {n} · 타워 자리 {p}", "This map has no path yet": "이 맵에는 아직 길이 없어요", "Tap a pad to build a tower · tap a tower to upgrade it": "자리를 탭해 타워 짓기 · 타워를 탭해 업그레이드", "Next wave": "다음 웨이브", "Wave {i}/{n}": "웨이브 {i}/{n}", "Wave {i}": "웨이브 {i}", "Waves held {i}/{n}": "막아낸 웨이브 {i}/{n}", "The crystal is safe!": "크리스탈을 지켜냈어요!", "The crystal fell": "크리스탈이 무너졌어요", "Suggest pads": "타워 자리 추천", "Clear the path": "길 지우기", "PORTAL": "포탈", "CRYSTAL": "크리스탈", "The path already reaches the crystal — tap one of its cells to shorten it": "길이 이미 크리스탈까지 닿았어요 — 길의 칸을 탭하면 거기까지 줄어요", "Draw the path from the top row (portal) down to the bottom row (crystal)": "맨 윗줄(포탈)부터 맨 아랫줄(크리스탈)까지 길을 그려 주세요", "{n} pads won't count (red ✕): a pad must touch the path": "{n}개는 반영되지 않아요 (빨간 ✕): 타워 자리는 길에 닿아야 해요", "Grunt": "졸병", "Runner": "러너", "Tank": "탱커", "up to {n} a wave": "웨이브당 최대 {n}", "Add a wave": "웨이브 추가", "Draw the path first": "먼저 길을 그려 주세요" });
Object.assign(WORDS.zh, { "Enemy speed": "敌人速度", "Starting gold": "初始金币", "Enemies a wave": "每波敌人", "Tanks": "坦克", "Runners": "疾行者", "Waves": "波次", "My Tower Defense": "我的塔防", "Bolt": "闪电", "Frost": "冰霜", "Cannon": "加农炮", "Path": "路径", "Tower pad": "塔位", "Draw the path, place the tower pads and set every wave by hand — starting from this map.": "亲手画出路径、放置塔位、设定每一波——从这张地图开始。", "grunts": "小兵", "runners": "疾行者", "tanks": "坦克", "5 waves": "5 波", "8 waves": "8 波", "10 waves": "10 波", "15 waves": "15 波", "The next cell must be beside the path's end": "下一格必须紧挨路径的末端", "Start the path in the top row (by the portal)": "路径从最上面一行（传送门旁）开始", "{p} path cells · {d} pads · {w} waves": "路径 {p} 格 · 塔位 {d} 个 · {w} 波", "{w} waves · {n} foes · {p} pads": "{w} 波 · {n} 个敌人 · {p} 个塔位", "This map has no path yet": "这张地图还没有路径", "Tap a pad to build a tower · tap a tower to upgrade it": "点塔位建塔 · 点塔升级", "Next wave": "下一波", "Wave {i}/{n}": "第 {i}/{n} 波", "Wave {i}": "第 {i} 波", "Waves held {i}/{n}": "守住 {i}/{n} 波", "The crystal is safe!": "水晶守住了！", "The crystal fell": "水晶被攻破了", "Suggest pads": "推荐塔位", "Clear the path": "清除路径", "PORTAL": "传送门", "CRYSTAL": "水晶", "The path already reaches the crystal — tap one of its cells to shorten it": "路径已经通到水晶——点路径上的一格可以缩短到那里", "Draw the path from the top row (portal) down to the bottom row (crystal)": "从最上面一行（传送门）画到最下面一行（水晶）", "{n} pads won't count (red ✕): a pad must touch the path": "{n} 个塔位不会计入（红色 ✕）：塔位必须挨着路径", "Grunt": "小兵", "Runner": "疾行者", "Tank": "坦克", "up to {n} a wave": "每波最多 {n}", "Add a wave": "添加一波", "Draw the path first": "请先画出路径" });
Object.assign(WORDS.tr, { "Enemy speed": "Düşman hızı", "Starting gold": "Başlangıç altını", "Enemies a wave": "Dalga başına düşman", "Tanks": "Tanklar", "Runners": "Koşucular", "Waves": "Dalgalar", "My Tower Defense": "Kule Savunmam", "Bolt": "Şimşek", "Frost": "Ayaz", "Cannon": "Top", "Path": "Yol", "Tower pad": "Kule yeri", "Draw the path, place the tower pads and set every wave by hand — starting from this map.": "Yolu çiz, kule yerlerini koy ve her dalgayı elle ayarla — bu haritadan başlayarak.", "grunts": "erler", "runners": "koşucular", "tanks": "tanklar", "5 waves": "5 dalga", "8 waves": "8 dalga", "10 waves": "10 dalga", "15 waves": "15 dalga", "The next cell must be beside the path's end": "Sonraki kare yolun ucunun yanında olmalı", "Start the path in the top row (by the portal)": "Yola en üst sıradan (geçidin yanından) başla", "{p} path cells · {d} pads · {w} waves": "{p} yol karesi · {d} kule yeri · {w} dalga", "{w} waves · {n} foes · {p} pads": "{w} dalga · {n} düşman · {p} kule yeri", "This map has no path yet": "Bu haritada henüz yol yok", "Tap a pad to build a tower · tap a tower to upgrade it": "Kule kurmak için bir yere dokun · yükseltmek için kuleye dokun", "Next wave": "Sonraki dalga", "Wave {i}/{n}": "Dalga {i}/{n}", "Wave {i}": "Dalga {i}", "Waves held {i}/{n}": "Tutulan dalga {i}/{n}", "The crystal is safe!": "Kristal güvende!", "The crystal fell": "Kristal düştü", "Suggest pads": "Kule yeri öner", "Clear the path": "Yolu temizle", "PORTAL": "GEÇİT", "CRYSTAL": "KRİSTAL", "The path already reaches the crystal — tap one of its cells to shorten it": "Yol zaten kristale ulaşıyor — kısaltmak için karelerinden birine dokun", "Draw the path from the top row (portal) down to the bottom row (crystal)": "Yolu en üst sıradan (geçit) en alt sıraya (kristal) çiz", "{n} pads won't count (red ✕): a pad must touch the path": "{n} kule yeri sayılmayacak (kırmızı ✕): kule yeri yola değmeli", "Grunt": "Er", "Runner": "Koşucu", "Tank": "Tank", "up to {n} a wave": "dalga başına en fazla {n}", "Add a wave": "Dalga ekle", "Draw the path first": "Önce yolu çiz" });
Object.assign(WORDS.ko, { "Editor's pick": "에디터 추천", "Taken off the picks": "추천에서 뺐어요" });
Object.assign(WORDS.zh, { "Editor's pick": "编辑精选", "Taken off the picks": "已取消精选" });
Object.assign(WORDS.tr, { "Editor's pick": "Editörün seçimi", "Taken off the picks": "Seçimlerden çıkarıldı" });
Object.assign(WORDS.ko, { "Legend Hunter": "전설 사냥꾼", "Potions ×10": "포션 ×10", "Scrap crate ×5": "고철 상자 ×5", "Forge crate ×3": "강화 재료 상자 ×3", "Title: Collector": "칭호: 수집가", "Title: Legend Hunter": "칭호: 전설 사냥꾼", "Attack +1%": "공격력 +1%", "Defense +1%": "방어력 +1%", "Max HP +1%": "최대 HP +1%", "Critical +0.5": "치명타 +0.5", "Speed +1": "이동 속도 +1", "Crafting codex": "제작 도감", "Materials codex": "재료 도감", "Pet codex": "펫 도감", "Card codex": "카드 도감", "Cosmetics codex": "꾸미기 도감", "The Pumpkin King's blade. Its fire never goes out.": "호박 왕의 검. 그 불꽃은 절대 꺼지지 않는다.", "Inferno Jack, Lv 95 (Halloween nights): the top hitter": "인페르노 잭 Lv 95 (핼러윈 밤): 최다 타격자", "Tap a piece to see it.": "장비를 눌러 자세히 보세요.", "Bosses of {x}": "{x}의 보스", "the Magic Forge": "마법 대장간", "held now — saved on your next save": "지금 보유 중 — 다음 저장 때 기록돼요", "Unique": "유니크", "{set} set · {slot}": "{set} 세트 · {slot}", "Needs level": "요구 레벨", "Where it drops": "획득 방법", "First found": "최초 획득", "Collection rewards": "수집 보상", "The more you collect, the more you get.": "더 많이 모을수록 더 큰 보상!", "{n} kinds": "{n}종", "Set collection bonus": "세트 수집 보너스", "Collect all five grades of one slot's tier for a bonus that lasts.": "한 부위·한 티어의 다섯 등급을 모두 모으면 영구 보너스!", "{set} {slot} (5/5)": "{set} {slot} (5/5)", "{set} {slot} ({n}/5)": "{set} {slot} ({n}/5)", "Item codex": "아이템 도감", "Jurassic codex": "쥬라기 도감", "Scammer codex": "스캐머 도감", "Collect every piece of gear in the world and earn special rewards!": "세계의 모든 장비를 수집하고 특별한 보상을 받으세요!", "Collected": "수집 현황", "Sign in with a wallet to keep your codex and claim its rewards.": "지갑으로 로그인하면 도감이 저장되고 보상을 받을 수 있어요.", "One of a kind": "유일한 장비", "New title": "새 칭호", "Open it in Jurassic World: Pack → Codex": "쥬라기 월드에서 열어요: 가방 → 도감" });
Object.assign(WORDS.zh, { "Legend Hunter": "传奇猎人", "Potions ×10": "药水 ×10", "Scrap crate ×5": "废料箱 ×5", "Forge crate ×3": "强化材料箱 ×3", "Title: Collector": "称号：收藏家", "Title: Legend Hunter": "称号：传奇猎人", "Attack +1%": "攻击力 +1%", "Defense +1%": "防御力 +1%", "Max HP +1%": "最大 HP +1%", "Critical +0.5": "暴击 +0.5", "Speed +1": "速度 +1", "Crafting codex": "制作图鉴", "Materials codex": "材料图鉴", "Pet codex": "宠物图鉴", "Card codex": "卡牌图鉴", "Cosmetics codex": "装扮图鉴", "The Pumpkin King's blade. Its fire never goes out.": "南瓜王之剑，其火焰永不熄灭。", "Inferno Jack, Lv 95 (Halloween nights): the top hitter": "地狱杰克 Lv 95（万圣夜）：输出第一", "Tap a piece to see it.": "点击装备查看详情。", "Bosses of {x}": "{x} 的首领", "the Magic Forge": "魔法锻造台", "held now — saved on your next save": "当前持有 — 下次保存时记录", "Unique": "唯一", "{set} set · {slot}": "{set} 套装 · {slot}", "Needs level": "需要等级", "Where it drops": "获取途径", "First found": "首次获得", "Collection rewards": "收集奖励", "The more you collect, the more you get.": "收集越多，奖励越多。", "{n} kinds": "{n} 种", "Set collection bonus": "套装收集加成", "Collect all five grades of one slot's tier for a bonus that lasts.": "集齐同一部位同一阶的五个品质，获得永久加成。", "{set} {slot} (5/5)": "{set} {slot}（5/5）", "{set} {slot} ({n}/5)": "{set} {slot}（{n}/5）", "Item codex": "物品图鉴", "Jurassic codex": "侏罗纪图鉴", "Scammer codex": "骗子图鉴", "Collect every piece of gear in the world and earn special rewards!": "收集世界上所有装备，赢取特别奖励！", "Collected": "收集进度", "Sign in with a wallet to keep your codex and claim its rewards.": "用钱包登录即可保存图鉴并领取奖励。", "One of a kind": "独一无二", "New title": "新称号", "Open it in Jurassic World: Pack → Codex": "请在侏罗纪世界打开：背包 → 图鉴" });
Object.assign(WORDS.tr, { "Legend Hunter": "Efsane Avcı", "Potions ×10": "İksir ×10", "Scrap crate ×5": "Hurda sandığı ×5", "Forge crate ×3": "Demirci sandığı ×3", "Title: Collector": "Unvan: Koleksiyoncu", "Title: Legend Hunter": "Unvan: Efsane Avcı", "Attack +1%": "Saldırı +%1", "Defense +1%": "Savunma +%1", "Max HP +1%": "Maks. HP +%1", "Critical +0.5": "Kritik +0,5", "Speed +1": "Hız +1", "Crafting codex": "Üretim kodeksi", "Materials codex": "Malzeme kodeksi", "Pet codex": "Evcil hayvan kodeksi", "Card codex": "Kart kodeksi", "Cosmetics codex": "Kozmetik kodeksi", "The Pumpkin King's blade. Its fire never goes out.": "Balkabağı Kralı'nın kılıcı. Ateşi hiç sönmez.", "Inferno Jack, Lv 95 (Halloween nights): the top hitter": "Inferno Jack, Lv 95 (Cadılar Bayramı geceleri): en çok vuran", "Tap a piece to see it.": "Görmek için bir parçaya dokun.", "Bosses of {x}": "{x} bossları", "the Magic Forge": "Büyülü Demirhane", "held now — saved on your next save": "şu an sende — bir sonraki kayıtta işlenir", "Unique": "Eşsiz", "{set} set · {slot}": "{set} seti · {slot}", "Needs level": "Gereken seviye", "Where it drops": "Nereden düşer", "First found": "İlk bulunuş", "Collection rewards": "Koleksiyon ödülleri", "The more you collect, the more you get.": "Ne kadar toplarsan o kadar kazanırsın.", "{n} kinds": "{n} tür", "Set collection bonus": "Set koleksiyon bonusu", "Collect all five grades of one slot's tier for a bonus that lasts.": "Bir yuvanın bir kademesindeki beş derecenin hepsini topla, kalıcı bonus kazan.", "{set} {slot} (5/5)": "{set} {slot} (5/5)", "{set} {slot} ({n}/5)": "{set} {slot} ({n}/5)", "Item codex": "Eşya kodeksi", "Jurassic codex": "Jura kodeksi", "Scammer codex": "Dolandırıcı kodeksi", "Collect every piece of gear in the world and earn special rewards!": "Dünyadaki her teçhizatı topla, özel ödüller kazan!", "Collected": "Toplanan", "Sign in with a wallet to keep your codex and claim its rewards.": "Kodeksini saklamak ve ödüllerini almak için cüzdanla giriş yap.", "One of a kind": "Tek ve eşsiz", "New title": "Yeni unvan", "Open it in Jurassic World: Pack → Codex": "Jura Dünyası'nda aç: Çanta → Kodeks" });
Object.assign(WORDS.ko, { "Base stats": "기본 능력치", "Gear and accessories for ARCL.": "ARCL로 장비와 장신구를 만들어요.", "Supplies": "보급품", "Potions, scrolls and scrap for your adventure.": "모험에 필요한 포션, 주문서, 고철.", "Make your gear stronger with scrap.": "고철로 장비를 더 강하게.", "Success": "성공 확률", "Required materials": "필요 재료", "Fusion rules": "합성 규칙", "Pick three pieces of the same rarity.": "같은 등급 장비 3개를 고르세요.", "They become one piece of the next rarity (Common → Uncommon → Rare).": "다음 등급 장비 1개가 돼요 (일반 → 고급 → 희귀).", "The three are used up.": "재료 3개는 사라져요.", "Three of one rarity make one of the next.": "같은 등급 3개로 다음 등급 1개를 만들어요.", "Repair": "수리", "Restore the durability of Epic and Legendary gear.": "영웅·전설 장비의 내구도를 회복해요.", "After repair": "수리 후", "Sell price": "판매 가격", "Turn gear you don't need into ARCL.": "필요 없는 장비를 ARCL로 바꿔요.", "Character stats": "캐릭터 능력치", "Equipped weapon": "장착 무기", "Gear set": "장비 세트", "{x} set ({n}/7)": "{x} 세트 ({n}/7)", "{n} pieces": "{n}부위", "Storage": "창고", "Opens at level {n}": "레벨 {n}에 열려요", "Opens at": "개방 레벨", "Next skill level": "다음 스킬 레벨", "Branch": "분기", "Pick one": "하나 고르기", "At skill level 2 (level {n})": "스킬 레벨 2 (레벨 {n})", "Branches": "분기", "Use this skill": "이 스킬 사용", "In use": "사용 중", "Skill level {n}": "스킬 레벨 {n}", "No title": "칭호 없음", "Title effect": "칭호 효과", "Wear a title with a bonus to see it here.": "보너스가 있는 칭호를 달면 여기 보여요.", "Title list": "칭호 목록", "Progress": "성장", "Combat": "전투", "Collection": "도감", "Event": "이벤트", "How to get it": "획득 방법", "Bonus": "보너스", "Your look": "내 외형", "Pick your hero and their colours in the character maker. ARC Bots also have a wardrobe of outfits.": "캐릭터 만들기에서 영웅과 색을 골라요. ARC 봇은 옷장에서 의상도 바꿀 수 있어요.", "Costume sets": "코스튬 세트", "On now": "진행 중", "Live": "진행 중", "Every tier of a season": "시즌의 모든 단계", "Collect all 175 kinds": "175종 모두 수집", "Collect 100 kinds": "100종 수집", "Overview": "개요", "Equipment": "장비", "Titles": "칭호", "Costumes": "코스튬", "World Map": "월드맵", "Events": "이벤트", "Community": "커뮤니티", "Forge": "대장간", "Weapons & armour": "무기·방어구", "Masterwork": "명품 공방", "You have": "보유", "Cost": "비용", "Durability": "내구도", "Excellent": "최상", "Good": "좋음", "Worn": "착용 중", "Damaged": "손상", "Your hero, your gear and your stats.": "내 영웅, 장비, 능력치.", "What you wear, your bag and your storage.": "착용 장비, 가방, 창고.", "Your skills and the branch each one takes.": "스킬과 각 스킬의 분기.", "Your hero and your look.": "내 영웅과 외형.", "Gear and accessories for ARCL": "ARCL로 장비와 장신구", "Today's hunts, the quiz and the chest.": "오늘의 사냥, 퀴즈, 상자.", "Goals that give titles and bonuses.": "칭호와 보너스를 주는 목표.", "Season points and the rewards at each tier.": "시즌 포인트와 단계별 보상.", "What's on in the world, and when.": "세계에서 열리는 일과 시간.", "Everything you've found, in one place.": "찾은 모든 것을 한곳에.", "Every scammer here is a real scam.": "여기 스캐머는 모두 실제 사기 수법이에요.", "Your companions and their eggs.": "내 동료와 알.", "The world's best, this week and for good.": "이번 주와 역대 최고의 플레이어.", "Every piece of gear, tier by grade": "모든 장비, 티어×등급", "Pages: every page is a real scam": "페이지마다 실제 사기 수법", "Companions and their eggs": "동료와 알", "Dinosaurs, fish and finds in Jurassic World": "쥬라기 월드의 공룡, 물고기, 발견물", "Goals that give titles": "칭호를 주는 목표", "Change": "변경", "Attack +{n}%": "공격력 +{n}%", "Defense +{n}%": "방어력 +{n}%", "Max HP +{n}%": "최대 HP +{n}%", "All stats +{n}%": "모든 능력치 +{n}%" });
Object.assign(WORDS.zh, { "Base stats": "基础属性", "Gear and accessories for ARCL.": "用 ARCL 打造装备和饰品。", "Supplies": "补给", "Potions, scrolls and scrap for your adventure.": "冒险所需的药水、卷轴和废料。", "Make your gear stronger with scrap.": "用废料强化你的装备。", "Success": "成功率", "Required materials": "所需材料", "Fusion rules": "合成规则", "Pick three pieces of the same rarity.": "选择三件相同品质的装备。", "They become one piece of the next rarity (Common → Uncommon → Rare).": "合成一件更高品质的装备（普通 → 优秀 → 稀有）。", "The three are used up.": "三件材料会被消耗。", "Three of one rarity make one of the next.": "三件同品质合成一件更高品质。", "Repair": "修理", "Restore the durability of Epic and Legendary gear.": "恢复史诗和传说装备的耐久。", "After repair": "修理后", "Sell price": "出售价格", "Turn gear you don't need into ARCL.": "把不需要的装备换成 ARCL。", "Character stats": "角色属性", "Equipped weapon": "已装备武器", "Gear set": "装备套装", "{x} set ({n}/7)": "{x} 套装（{n}/7）", "{n} pieces": "{n} 件", "Storage": "仓库", "Opens at level {n}": "{n} 级开放", "Opens at": "开放等级", "Next skill level": "下一技能等级", "Branch": "分支", "Pick one": "选一个", "At skill level 2 (level {n})": "技能等级 2（{n} 级）", "Branches": "分支", "Use this skill": "使用此技能", "In use": "使用中", "Skill level {n}": "技能等级 {n}", "No title": "无称号", "Title effect": "称号效果", "Wear a title with a bonus to see it here.": "佩戴带加成的称号后显示在这里。", "Title list": "称号列表", "Progress": "成长", "Combat": "战斗", "Collection": "收藏", "Event": "活动", "How to get it": "获取方法", "Bonus": "加成", "Your look": "我的外观", "Pick your hero and their colours in the character maker. ARC Bots also have a wardrobe of outfits.": "在角色创建中选择英雄和颜色。ARC 机器人还有衣橱可换装。", "Costume sets": "服装套装", "On now": "进行中", "Live": "进行中", "Every tier of a season": "赛季的全部阶段", "Collect all 175 kinds": "收集全部 175 种", "Collect 100 kinds": "收集 100 种", "Overview": "概览", "Equipment": "装备", "Titles": "称号", "Costumes": "服装", "World Map": "世界地图", "Events": "活动", "Community": "社区", "Forge": "锻造", "Weapons & armour": "武器和防具", "Masterwork": "大师工坊", "You have": "你拥有", "Cost": "费用", "Durability": "耐久", "Excellent": "极佳", "Good": "良好", "Worn": "已穿戴", "Damaged": "损坏", "Your hero, your gear and your stats.": "你的英雄、装备和属性。", "What you wear, your bag and your storage.": "穿戴、背包和仓库。", "Your skills and the branch each one takes.": "你的技能和各自的分支。", "Your hero and your look.": "你的英雄和外观。", "Gear and accessories for ARCL": "用 ARCL 买装备和饰品", "Today's hunts, the quiz and the chest.": "今日狩猎、问答和宝箱。", "Goals that give titles and bonuses.": "获得称号和加成的目标。", "Season points and the rewards at each tier.": "赛季积分和各阶段奖励。", "What's on in the world, and when.": "世界中正在发生的事和时间。", "Everything you've found, in one place.": "你找到的一切，集中在一处。", "Every scammer here is a real scam.": "这里的每个骗子都是真实的骗局。", "Your companions and their eggs.": "你的伙伴和它们的蛋。", "The world's best, this week and for good.": "本周与历史最强玩家。", "Every piece of gear, tier by grade": "全部装备，按阶与品质", "Pages: every page is a real scam": "每一页都是真实骗局", "Companions and their eggs": "伙伴和蛋", "Dinosaurs, fish and finds in Jurassic World": "侏罗纪世界的恐龙、鱼和发现", "Goals that give titles": "获得称号的目标", "Change": "更换", "Attack +{n}%": "攻击力 +{n}%", "Defense +{n}%": "防御力 +{n}%", "Max HP +{n}%": "最大 HP +{n}%", "All stats +{n}%": "全属性 +{n}%" });
Object.assign(WORDS.tr, { "Base stats": "Temel istatistikler", "Gear and accessories for ARCL.": "ARCL ile teçhizat ve aksesuar.", "Supplies": "Malzemeler", "Potions, scrolls and scrap for your adventure.": "Maceran için iksir, parşömen ve hurda.", "Make your gear stronger with scrap.": "Hurdayla teçhizatını güçlendir.", "Success": "Başarı", "Required materials": "Gereken malzemeler", "Fusion rules": "Birleştirme kuralları", "Pick three pieces of the same rarity.": "Aynı nadirlikte üç parça seç.", "They become one piece of the next rarity (Common → Uncommon → Rare).": "Bir üst nadirlikte tek parça olurlar (Sıradan → Nadir olmayan → Nadir).", "The three are used up.": "Üçü de harcanır.", "Three of one rarity make one of the next.": "Bir nadirlikten üçü, bir üstünden bir yapar.", "Repair": "Onar", "Restore the durability of Epic and Legendary gear.": "Epik ve Efsanevi teçhizatın dayanıklılığını yenile.", "After repair": "Onarımdan sonra", "Sell price": "Satış fiyatı", "Turn gear you don't need into ARCL.": "İhtiyacın olmayan teçhizatı ARCL'ye çevir.", "Character stats": "Karakter istatistikleri", "Equipped weapon": "Kuşanılan silah", "Gear set": "Teçhizat seti", "{x} set ({n}/7)": "{x} seti ({n}/7)", "{n} pieces": "{n} parça", "Storage": "Depo", "Opens at level {n}": "{n}. seviyede açılır", "Opens at": "Açılış", "Next skill level": "Sonraki beceri seviyesi", "Branch": "Dal", "Pick one": "Birini seç", "At skill level 2 (level {n})": "Beceri seviyesi 2'de ({n}. seviye)", "Branches": "Dallar", "Use this skill": "Bu beceriyi kullan", "In use": "Kullanımda", "Skill level {n}": "Beceri seviyesi {n}", "No title": "Unvan yok", "Title effect": "Unvan etkisi", "Wear a title with a bonus to see it here.": "Bonuslu bir unvan tak, burada görünsün.", "Title list": "Unvan listesi", "Progress": "İlerleme", "Combat": "Savaş", "Collection": "Koleksiyon", "Event": "Etkinlik", "How to get it": "Nasıl alınır", "Bonus": "Bonus", "Your look": "Görünümün", "Pick your hero and their colours in the character maker. ARC Bots also have a wardrobe of outfits.": "Kahramanını ve renklerini karakter yapıcıda seç. ARC Botların bir kıyafet dolabı da var.", "Costume sets": "Kostüm setleri", "On now": "Şimdi", "Live": "Canlı", "Every tier of a season": "Bir sezonun her kademesi", "Collect all 175 kinds": "175 türün hepsini topla", "Collect 100 kinds": "100 tür topla", "Overview": "Genel bakış", "Equipment": "Teçhizat", "Titles": "Unvanlar", "Costumes": "Kostümler", "World Map": "Dünya haritası", "Events": "Etkinlikler", "Community": "Topluluk", "Forge": "Demirhane", "Weapons & armour": "Silah ve zırh", "Masterwork": "Usta işi", "You have": "Sende", "Cost": "Maliyet", "Durability": "Dayanıklılık", "Excellent": "Mükemmel", "Good": "İyi", "Worn": "Kuşanıldı", "Damaged": "Hasarlı", "Your hero, your gear and your stats.": "Kahramanın, teçhizatın ve istatistiklerin.", "What you wear, your bag and your storage.": "Giydiklerin, çantan ve deponun.", "Your skills and the branch each one takes.": "Becerilerin ve her birinin dalı.", "Your hero and your look.": "Kahramanın ve görünümün.", "Gear and accessories for ARCL": "ARCL ile teçhizat ve aksesuar", "Today's hunts, the quiz and the chest.": "Bugünün avları, bilgi yarışması ve sandık.", "Goals that give titles and bonuses.": "Unvan ve bonus veren hedefler.", "Season points and the rewards at each tier.": "Sezon puanları ve her kademenin ödülleri.", "What's on in the world, and when.": "Dünyada neler oluyor, ne zaman.", "Everything you've found, in one place.": "Bulduğun her şey tek yerde.", "Every scammer here is a real scam.": "Buradaki her dolandırıcı gerçek bir dolandırıcılık.", "Your companions and their eggs.": "Yoldaşların ve yumurtaları.", "The world's best, this week and for good.": "Bu haftanın ve tüm zamanların en iyileri.", "Every piece of gear, tier by grade": "Her teçhizat, kademe ve derece", "Pages: every page is a real scam": "Her sayfa gerçek bir dolandırıcılık", "Companions and their eggs": "Yoldaşlar ve yumurtaları", "Dinosaurs, fish and finds in Jurassic World": "Jura Dünyası'nda dinozorlar, balıklar ve buluntular", "Goals that give titles": "Unvan veren hedefler", "Change": "Değiştir", "Attack +{n}%": "Saldırı +%{n}", "Defense +{n}%": "Savunma +%{n}", "Max HP +{n}%": "Maks. HP +%{n}", "All stats +{n}%": "Tüm istatistikler +%{n}" });
Object.assign(WORDS.ko, { "Shock": "쇼크", "Meteor": "메테오", "Power": "전투력", "Rewards to claim": "받을 보상", "None right now": "지금은 없음", "Opened": "받음", "Crafted!": "제작 완료!", "Show all ({n} more)": "전체 보기 ({n}개 더)", "Show less": "접기" });
Object.assign(WORDS.zh, { "Shock": "电击", "Meteor": "流星", "Power": "战力", "Rewards to claim": "可领取奖励", "None right now": "暂无", "Opened": "已领取", "Crafted!": "制作完成！", "Show all ({n} more)": "显示全部（还有 {n} 个）", "Show less": "收起" });
Object.assign(WORDS.tr, { "Shock": "Şok", "Meteor": "Meteor", "Power": "Güç", "Rewards to claim": "Alınacak ödüller", "None right now": "Şu an yok", "Opened": "Açıldı", "Crafted!": "Üretildi!", "Show all ({n} more)": "Hepsini göster ({n} daha)", "Show less": "Daha az" });
Object.assign(WORDS.ko, { "Hunt scammers": "스캐머 사냥", "Knock out 300 scammers": "스캐머 300마리 처치", "Elite hunter": "엘리트 사냥꾼", "Knock out 30 elites": "엘리트 30마리 처치", "Defeat bosses": "보스 처치", "Beat 5 bosses": "보스 5마리 처치", "Use your skills": "스킬 사용", "Use a skill 120 times": "스킬 120번 사용", "Daily routine": "일일 루틴", "Finish 12 daily hunts": "일일 사냥 12개 완료", "Play mini games": "미니게임 하기", "Start 10 games from the Games list": "게임 목록에서 게임 10번 시작", "Treasure hunter": "보물 사냥꾼", "Find 10 pieces of Rare gear or better": "희귀 이상 장비 10개 획득", "Hunt in a ground on 10 different days": "서로 다른 10일 동안 사냥터에서 사냥", "Weekly mission done: {x}": "주간 미션 완료: {x}", "Weekly gear: {x}": "주간 장비: {x}", "Weekly chest": "주간 상자", "Weekly missions": "주간 미션", "Resets in {d} d {h} h": "{d}일 {h}시간 후 초기화", "{a} of {b} missions done this week": "이번 주 미션 {b}개 중 {a}개 완료", "Weekly": "주간", "Bigger goals that reset each Monday, and chests for finishing them.": "매주 월요일 초기화되는 큰 목표와 완료 상자.", "World bosses": "월드 보스", "Every boss in the world, when it's up, and the way there.": "세계의 모든 보스, 등장 시간, 가는 길.", "When": "시간", "You beat it": "처치 횟수", "Join now": "지금 참가", "No bosses to show right now.": "지금 표시할 보스가 없어요.", "Everyone": "누구나", "The Alpha Raptor and the Thornback Titan, shared HP: hit it 10 times for a hunter's share.": "알파 랩터와 쏜백 타이탄, 모두가 함께 깎는 HP: 10번 이상 때리면 사냥꾼 몫.", "XP, materials, ARCL for a boss share": "경험치, 재료, 보스 몫 ARCL", "Five Pumpkin Kings turn into Inferno Jack at night. The top 3 hitters share the reward.": "다섯 호박 왕이 밤마다 인페르노 잭으로 변해요. 상위 3명이 보상을 나눠요.", "ARCL and a + piece; Lv 95: Jack's Inferno Blade": "ARCL과 강화 장비; Lv 95: 잭의 인페르노 블레이드", "The weekly raid boss: everyone in town brings it down together.": "주간 레이드 보스: 마을 모두가 함께 쓰러뜨려요.", "Resets in {t}": "{t} 후 초기화", "Raid gear, XP, the Raid Breaker title": "레이드 장비, 경험치, 레이드 브레이커 칭호", "Any time": "언제나", "Gear, XP": "장비, 경험치", "A hunting ground's boss.": "사냥터의 보스." });
Object.assign(WORDS.zh, { "Hunt scammers": "猎杀骗子", "Knock out 300 scammers": "击倒 300 个骗子", "Elite hunter": "精英猎人", "Knock out 30 elites": "击倒 30 个精英", "Defeat bosses": "击败首领", "Beat 5 bosses": "击败 5 个首领", "Use your skills": "使用技能", "Use a skill 120 times": "使用技能 120 次", "Daily routine": "每日任务", "Finish 12 daily hunts": "完成 12 个每日狩猎", "Play mini games": "玩小游戏", "Start 10 games from the Games list": "从游戏列表开始 10 次游戏", "Treasure hunter": "寻宝者", "Find 10 pieces of Rare gear or better": "获得 10 件稀有及以上装备", "Hunt in a ground on 10 different days": "在 10 个不同的日子去猎场狩猎", "Weekly mission done: {x}": "每周任务完成：{x}", "Weekly gear: {x}": "每周装备：{x}", "Weekly chest": "每周宝箱", "Weekly missions": "每周任务", "Resets in {d} d {h} h": "{d} 天 {h} 小时后重置", "{a} of {b} missions done this week": "本周已完成 {a}/{b} 个任务", "Weekly": "每周", "Bigger goals that reset each Monday, and chests for finishing them.": "每周一重置的大目标，完成可开宝箱。", "World bosses": "世界首领", "Every boss in the world, when it's up, and the way there.": "世界上所有首领、出现时间与前往方式。", "When": "时间", "You beat it": "你击败了", "Join now": "立即参加", "No bosses to show right now.": "暂无可显示的首领。", "Everyone": "所有人", "The Alpha Raptor and the Thornback Titan, shared HP: hit it 10 times for a hunter's share.": "阿尔法迅猛龙与棘背泰坦，共享血量：命中 10 次即可获得猎人份额。", "XP, materials, ARCL for a boss share": "经验、材料、首领份额 ARCL", "Five Pumpkin Kings turn into Inferno Jack at night. The top 3 hitters share the reward.": "五位南瓜王在夜晚化身地狱杰克，前三名输出者分享奖励。", "ARCL and a + piece; Lv 95: Jack's Inferno Blade": "ARCL 和强化装备；95 级：杰克的地狱之刃", "The weekly raid boss: everyone in town brings it down together.": "每周团队首领：全镇一起击倒它。", "Resets in {t}": "{t} 后重置", "Raid gear, XP, the Raid Breaker title": "团队装备、经验、团队破坏者称号", "Any time": "随时", "Gear, XP": "装备、经验", "A hunting ground's boss.": "猎场首领。" });
Object.assign(WORDS.tr, { "Hunt scammers": "Dolandırıcı avla", "Knock out 300 scammers": "300 dolandırıcıyı yere ser", "Elite hunter": "Seçkin avcı", "Knock out 30 elites": "30 seçkini yere ser", "Defeat bosses": "Bossları yen", "Beat 5 bosses": "5 boss yen", "Use your skills": "Becerilerini kullan", "Use a skill 120 times": "Bir beceriyi 120 kez kullan", "Daily routine": "Günlük rutin", "Finish 12 daily hunts": "12 günlük av bitir", "Play mini games": "Mini oyun oyna", "Start 10 games from the Games list": "Oyunlar listesinden 10 oyun başlat", "Treasure hunter": "Hazine avcısı", "Find 10 pieces of Rare gear or better": "10 Nadir veya üstü teçhizat bul", "Hunt in a ground on 10 different days": "10 farklı günde bir av alanında avlan", "Weekly mission done: {x}": "Haftalık görev tamam: {x}", "Weekly gear: {x}": "Haftalık teçhizat: {x}", "Weekly chest": "Haftalık sandık", "Weekly missions": "Haftalık görevler", "Resets in {d} d {h} h": "{d} g {h} sa sonra sıfırlanır", "{a} of {b} missions done this week": "Bu hafta {b} görevden {a} tanesi tamam", "Weekly": "Haftalık", "Bigger goals that reset each Monday, and chests for finishing them.": "Her pazartesi sıfırlanan büyük hedefler ve bitirince sandıklar.", "World bosses": "Dünya bossları", "Every boss in the world, when it's up, and the way there.": "Dünyadaki her boss, ne zaman çıktığı ve yolu.", "When": "Ne zaman", "You beat it": "Yendin", "Join now": "Hemen katıl", "No bosses to show right now.": "Şu an gösterilecek boss yok.", "Everyone": "Herkes", "The Alpha Raptor and the Thornback Titan, shared HP: hit it 10 times for a hunter's share.": "Alfa Raptor ve Dikensırt Titan, ortak HP: 10 vuruş bir avcı payı.", "XP, materials, ARCL for a boss share": "XP, malzeme, boss payı ARCL", "Five Pumpkin Kings turn into Inferno Jack at night. The top 3 hitters share the reward.": "Beş Balkabağı Kralı geceleri Inferno Jack olur. En çok vuran 3 kişi ödülü paylaşır.", "ARCL and a + piece; Lv 95: Jack's Inferno Blade": "ARCL ve artılı parça; Lv 95: Jack'in Cehennem Kılıcı", "The weekly raid boss: everyone in town brings it down together.": "Haftalık baskın bossu: kasabadaki herkes birlikte devirir.", "Resets in {t}": "{t} sonra sıfırlanır", "Raid gear, XP, the Raid Breaker title": "Baskın teçhizatı, XP, Baskın Kırıcı unvanı", "Any time": "Her zaman", "Gear, XP": "Teçhizat, XP", "A hunting ground's boss.": "Bir av alanının bossu." });
Object.assign(WORDS.ko, { "Daily": "일일" });
Object.assign(WORDS.zh, { "Daily": "每日" });
Object.assign(WORDS.tr, { "Daily": "Günlük" });
Object.assign(WORDS.ko, { "Login streak": "연속 출석", "{n}-day streak": "{n}일 연속", "Open today's chest": "오늘의 상자 열기" });
Object.assign(WORDS.zh, { "Login streak": "连续登录", "{n}-day streak": "连续 {n} 天", "Open today's chest": "打开今日宝箱" });
Object.assign(WORDS.tr, { "Login streak": "Giriş serisi", "{n}-day streak": "{n} günlük seri", "Open today's chest": "Bugünün sandığını aç" });
Object.assign(WORDS.ko, { "Meet friends, join crews, chat and play together.": "친구를 만나고, 크루에 들고, 함께 채팅하고 플레이해요.", "Find friends": "친구 찾기", "Party finder": "파티 찾기", "Chat": "채팅", "online": "접속", "Online": "접속 중", "Offline": "오프라인", "Sign in with a wallet to see your friends.": "지갑으로 로그인하면 친구가 보여요.", "No friends yet: tap a name in chat to add one.": "아직 친구가 없어요: 채팅에서 이름을 눌러 추가하세요.", "Players here now": "지금 여기 있는 플레이어", "Invite to party": "파티 초대", "Invited": "초대함", "Nobody else is in town right now. Invite a friend!": "지금 마을에 다른 사람이 없어요. 친구를 초대해 보세요!", "Chat here": "이곳 채팅", "Open chat": "채팅 열기", "Quiet here. Say hello!": "조용하네요. 인사해 보세요!", "Top players": "상위 플레이어", "Collection progress": "수집 진행도", "Set bonuses": "세트 보너스", "Complete a column in the item codex for a bonus that lasts.": "아이템 도감의 한 줄을 완성하면 영구 보너스를 받아요.", "Critical +{n}": "치명타 +{n}", "Speed +{n}": "이동속도 +{n}", "Search the bag": "가방 검색", "Rarity": "등급", "{n} picked": "{n}개 선택", "Sell picked": "선택 판매", "Salvage picked": "선택 분해", "Sign in with a wallet to make a party.": "지갑으로 로그인하면 파티를 만들 수 있어요." });
Object.assign(WORDS.zh, { "Meet friends, join crews, chat and play together.": "结识朋友、加入团队、一起聊天和游戏。", "Find friends": "找朋友", "Party finder": "组队", "Chat": "聊天", "online": "在线", "Online": "在线", "Offline": "离线", "Sign in with a wallet to see your friends.": "用钱包登录查看好友。", "No friends yet: tap a name in chat to add one.": "还没有好友：在聊天中点名字即可添加。", "Players here now": "此处在线玩家", "Invite to party": "邀请组队", "Invited": "已邀请", "Nobody else is in town right now. Invite a friend!": "现在镇上没有其他人。邀请一位朋友吧！", "Chat here": "此处聊天", "Open chat": "打开聊天", "Quiet here. Say hello!": "这里很安静。打个招呼吧！", "Top players": "顶尖玩家", "Collection progress": "收集进度", "Set bonuses": "套装加成", "Complete a column in the item codex for a bonus that lasts.": "完成物品图鉴的一列即可获得永久加成。", "Critical +{n}": "暴击 +{n}", "Speed +{n}": "速度 +{n}", "Search the bag": "搜索背包", "Rarity": "品质", "{n} picked": "已选 {n} 个", "Sell picked": "出售所选", "Salvage picked": "分解所选", "Sign in with a wallet to make a party.": "用钱包登录即可组队。" });
Object.assign(WORDS.tr, { "Meet friends, join crews, chat and play together.": "Arkadaş edin, ekiplere katıl, birlikte sohbet et ve oyna.", "Find friends": "Arkadaş bul", "Party finder": "Parti bul", "Chat": "Sohbet", "online": "çevrimiçi", "Online": "Çevrimiçi", "Offline": "Çevrimdışı", "Sign in with a wallet to see your friends.": "Arkadaşlarını görmek için cüzdanla giriş yap.", "No friends yet: tap a name in chat to add one.": "Henüz arkadaş yok: eklemek için sohbette bir isme dokun.", "Players here now": "Şu an burada olanlar", "Invite to party": "Partiye davet et", "Invited": "Davet edildi", "Nobody else is in town right now. Invite a friend!": "Şu an kasabada kimse yok. Bir arkadaşını davet et!", "Chat here": "Buradaki sohbet", "Open chat": "Sohbeti aç", "Quiet here. Say hello!": "Burası sessiz. Merhaba de!", "Top players": "En iyi oyuncular", "Collection progress": "Koleksiyon ilerlemesi", "Set bonuses": "Set bonusları", "Complete a column in the item codex for a bonus that lasts.": "Kalıcı bonus için eşya kodeksinde bir sütunu tamamla.", "Critical +{n}": "Kritik +{n}", "Speed +{n}": "Hız +{n}", "Search the bag": "Çantada ara", "Rarity": "Nadirlik", "{n} picked": "{n} seçildi", "Sell picked": "Seçilenleri sat", "Salvage picked": "Seçilenleri parçala", "Sign in with a wallet to make a party.": "Parti kurmak için cüzdanla giriş yap." });
Object.assign(WORDS.ko, { "Lv 100+ · A new hunting ground": "Lv 100+ · 새로운 사냥터", "Throne of Three": "세 여왕의 왕좌", "THRONE OF THREE": "세 여왕의 왕좌", "Lv 400+ · Sealed": "Lv 400+ · 봉인됨", "A Raid Queen: everyone's HP, three phases. All who deal 3% of her HP share her reward.": "레이드 퀸: 모두가 함께 깎는 HP, 3단계 페이즈. HP의 3% 이상을 깎은 모두가 보상을 나눠요.", "A new hunting ground for Lv 100+. Three queens — and the Throne of Three.": "Lv 100+를 위한 새로운 사냥터. 세 명의 여왕, 그리고 세 여왕의 왕좌.", "Cleared ×{n}": "클리어 ×{n}", "DEFEATED": "격파", "Defeated": "격파됨", "Go to RAID QUEENS": "RAID QUEENS로 가기", "Go": "가기", "PHASE {n}": "페이즈 {n}", "Phase {n}": "페이즈 {n}", "Lv {a}–{b}": "Lv {a}–{b}", "Prologue": "프롤로그", "RAID QUEENS CHRONICLE": "레이드 퀸즈 연대기", "Returns in {t}": "{t} 후 부활", "Sealed — opens later": "봉인됨 — 추후 개방", "Sign in with a wallet so your hits on the Raid Queens count": "지갑으로 로그인해야 레이드 퀸에게 준 피해가 기록돼요", "Story": "스토리", "The Broken Crown": "부서진 왕관", "The three together": "세 여왕이 함께", "Today's reward from her is already yours — this fall counts for your chronicle.": "오늘 이 여왕의 보상은 이미 받았어요 — 이번 격파는 연대기에 기록돼요.", "Victory": "승리", "{x} has fallen! Everyone who fought shares her reward.": "{x} 격파! 함께 싸운 모두가 보상을 나눠요.", "{x} is for Lv {n}+ (you're Lv {m})": "{x}은(는) Lv {n} 이상만 들어갈 수 있어요 (현재 Lv {m})", "{x} is for level {n}+ — your hits won't count": "{x}은(는) Lv {n} 이상 전용 — 피해가 기록되지 않아요", "Fight!": "싸운다!", "Enter": "들어가기", "Silver Sanctum": "실버 생츄어리", "Golden Dominion": "골든 도미니언", "Crimson Abyss": "크림슨 어비스", "The Arbiter of Stars and Divinity": "별과 신성의 심판자", "The Sovereign of Light and Sun": "빛과 태양의 군주", "The Queen of Blood and Destruction": "피와 파멸의 여왕", "Crown Imp": "크라운 임프", "Puglin Brute": "퍼글린 브루트", "You've come… just as I expected.": "왔구나… 예상했던 대로.", "Is it power? Freedom? Or… my attention?": "원하는 건 힘? 자유? 아니면… 나의 관심?", "Now, the real battle begins.": "이제, 진짜 전투가 시작돼.", "How precious… you've earned a glimpse of the stars.": "사랑스럽구나… 별을 엿볼 자격을 얻었어.", "You've come this far… How adorable.": "여기까지 오다니… 귀엽네.", "Kneel before the sun.": "태양 앞에 무릎 꿇어라.", "Burn in my radiance!": "나의 광휘 속에 타올라라!", "The sun… sets… for now.": "태양이… 저무는구나… 지금은.", "Kneel, if you wish to survive.": "살고 싶다면, 무릎 꿇어라.", "Beauty that devours. Power that rules.": "삼키는 아름다움. 지배하는 힘.", "This is not the end. This is only the beginning.": "이건 끝이 아니야. 시작일 뿐이지.", "…only the beginning.": "…시작일 뿐이야.", "Long ago, the Eternal Crown kept the three realms in balance.": "아주 먼 옛날, 영원의 왕관이 세 왕국의 균형을 지켰다.", "It broke — and from its shards rose three queens.": "왕관은 부서졌고 — 그 파편에서 세 명의 여왕이 태어났다.", "Win back the crown's fragments, queen by queen. Then face the Throne of Three.": "여왕을 하나씩 쓰러뜨려 왕관의 파편을 되찾아라. 그리고 세 여왕의 왕좌에 맞서라.", "Three crowns. One throne.": "세 개의 왕관. 하나의 왕좌.", "The Throne of Three opens at Lv 400.": "세 여왕의 왕좌는 Lv 400에 열립니다.", "Raid Queens": "레이드 퀸즈" });
Object.assign(WORDS.zh, { "Lv 100+ · A new hunting ground": "Lv 100+ · 全新狩猎场", "Throne of Three": "三王之座", "THRONE OF THREE": "三王之座", "Lv 400+ · Sealed": "Lv 400+ · 封印中", "A Raid Queen: everyone's HP, three phases. All who deal 3% of her HP share her reward.": "突袭女王：全服共享血量，三个阶段。造成其3%血量以上伤害的玩家共享奖励。", "A new hunting ground for Lv 100+. Three queens — and the Throne of Three.": "Lv 100+ 的全新狩猎场。三位女王——以及三王之座。", "Cleared ×{n}": "已通关 ×{n}", "DEFEATED": "已击败", "Defeated": "已击败", "Go to RAID QUEENS": "前往 RAID QUEENS", "Go": "前往", "PHASE {n}": "第 {n} 阶段", "Phase {n}": "第 {n} 阶段", "Lv {a}–{b}": "Lv {a}–{b}", "Prologue": "序章", "RAID QUEENS CHRONICLE": "RAID QUEENS 编年史", "Returns in {t}": "{t} 后重生", "Sealed — opens later": "封印中——稍后开放", "Sign in with a wallet so your hits on the Raid Queens count": "用钱包登录后，你对突袭女王的伤害才会计入", "Story": "剧情", "The Broken Crown": "破碎的王冠", "The three together": "三位女王齐聚", "Today's reward from her is already yours — this fall counts for your chronicle.": "今天她的奖励你已领取——这次击败计入你的编年史。", "Victory": "胜利", "{x} has fallen! Everyone who fought shares her reward.": "{x} 倒下了！所有参战者共享她的奖励。", "{x} is for Lv {n}+ (you're Lv {m})": "{x} 需要 Lv {n}+（你是 Lv {m}）", "{x} is for level {n}+ — your hits won't count": "{x} 需要 Lv {n}+——你的伤害不会计入", "Fight!": "开战！", "Enter": "进入", "Silver Sanctum": "白银圣所", "Golden Dominion": "黄金领域", "Crimson Abyss": "深红深渊", "The Arbiter of Stars and Divinity": "星辰与神性的裁决者", "The Sovereign of Light and Sun": "光与太阳的君主", "The Queen of Blood and Destruction": "鲜血与毁灭的女王", "Crown Imp": "王冠小鬼", "Puglin Brute": "帕格林蛮兵", "You've come… just as I expected.": "你来了……正如我所料。", "Is it power? Freedom? Or… my attention?": "你想要的是力量？自由？还是……我的注意？", "Now, the real battle begins.": "现在，真正的战斗开始了。", "How precious… you've earned a glimpse of the stars.": "多么珍贵……你赢得了一瞥星辰。", "You've come this far… How adorable.": "你竟走到这里……真可爱。", "Kneel before the sun.": "在太阳面前跪下。", "Burn in my radiance!": "在我的光辉中燃烧吧！", "The sun… sets… for now.": "太阳……落下了……暂时。", "Kneel, if you wish to survive.": "想活下去，就跪下。", "Beauty that devours. Power that rules.": "吞噬的美。支配的力。", "This is not the end. This is only the beginning.": "这不是结束。这只是开始。", "…only the beginning.": "……这只是开始。", "Long ago, the Eternal Crown kept the three realms in balance.": "很久以前，永恒王冠维系着三界的平衡。", "It broke — and from its shards rose three queens.": "王冠碎裂——三位女王自碎片中崛起。", "Win back the crown's fragments, queen by queen. Then face the Throne of Three.": "逐一击败女王，夺回王冠碎片。然后直面三王之座。", "Three crowns. One throne.": "三顶王冠。一个王座。", "The Throne of Three opens at Lv 400.": "三王之座在 Lv 400 开放。", "Raid Queens": "突袭女王" });
Object.assign(WORDS.tr, { "Lv 100+ · A new hunting ground": "Lv 100+ · Yeni bir av alanı", "Throne of Three": "Üçlerin Tahtı", "THRONE OF THREE": "ÜÇLERİN TAHTI", "Lv 400+ · Sealed": "Lv 400+ · Mühürlü", "A Raid Queen: everyone's HP, three phases. All who deal 3% of her HP share her reward.": "Bir Baskın Kraliçesi: herkesin ortak HP'si, üç evre. HP'sinin %3'ünü vuran herkes ödülü paylaşır.", "A new hunting ground for Lv 100+. Three queens — and the Throne of Three.": "Lv 100+ için yeni bir av alanı. Üç kraliçe — ve Üçlerin Tahtı.", "Cleared ×{n}": "Temizlendi ×{n}", "DEFEATED": "YENİLDİ", "Defeated": "Yenildi", "Go to RAID QUEENS": "RAID QUEENS'e git", "Go": "Git", "PHASE {n}": "EVRE {n}", "Phase {n}": "Evre {n}", "Lv {a}–{b}": "Lv {a}–{b}", "Prologue": "Önsöz", "RAID QUEENS CHRONICLE": "RAID QUEENS GÜNCESİ", "Returns in {t}": "{t} sonra döner", "Sealed — opens later": "Mühürlü — sonra açılacak", "Sign in with a wallet so your hits on the Raid Queens count": "Baskın Kraliçelerine vuruşlarının sayılması için cüzdanla giriş yap", "Story": "Hikâye", "The Broken Crown": "Kırık Taç", "The three together": "Üçü bir arada", "Today's reward from her is already yours — this fall counts for your chronicle.": "Bugünkü ödülünü zaten aldın — bu zafer güncene sayılır.", "Victory": "Zafer", "{x} has fallen! Everyone who fought shares her reward.": "{x} düştü! Savaşan herkes ödülünü paylaşır.", "{x} is for Lv {n}+ (you're Lv {m})": "{x} Lv {n}+ içindir (sen Lv {m})", "{x} is for level {n}+ — your hits won't count": "{x} seviye {n}+ içindir — vuruşların sayılmaz", "Fight!": "Savaş!", "Enter": "Gir", "Silver Sanctum": "Gümüş Mabet", "Golden Dominion": "Altın Hâkimiyet", "Crimson Abyss": "Kızıl Uçurum", "The Arbiter of Stars and Divinity": "Yıldızların ve İlahiliğin Hakemi", "The Sovereign of Light and Sun": "Işığın ve Güneşin Hükümdarı", "The Queen of Blood and Destruction": "Kanın ve Yıkımın Kraliçesi", "Crown Imp": "Taç İmpi", "Puglin Brute": "Puglin Zorbası", "You've come… just as I expected.": "Geldin… tam beklediğim gibi.", "Is it power? Freedom? Or… my attention?": "Güç mü? Özgürlük mü? Yoksa… benim ilgim mi?", "Now, the real battle begins.": "Şimdi asıl savaş başlıyor.", "How precious… you've earned a glimpse of the stars.": "Ne kıymetli… yıldızlara bir bakış hak ettin.", "You've come this far… How adorable.": "Buraya kadar geldin… Ne sevimli.", "Kneel before the sun.": "Güneşin önünde diz çök.", "Burn in my radiance!": "Işıltımda yan!", "The sun… sets… for now.": "Güneş… batıyor… şimdilik.", "Kneel, if you wish to survive.": "Hayatta kalmak istiyorsan diz çök.", "Beauty that devours. Power that rules.": "Yutan güzellik. Hükmeden güç.", "This is not the end. This is only the beginning.": "Bu son değil. Bu sadece başlangıç.", "…only the beginning.": "…sadece başlangıç.", "Long ago, the Eternal Crown kept the three realms in balance.": "Çok uzun zaman önce, Ebedî Taç üç diyarı dengede tutardı.", "It broke — and from its shards rose three queens.": "Taç kırıldı — ve parçalarından üç kraliçe doğdu.", "Win back the crown's fragments, queen by queen. Then face the Throne of Three.": "Kraliçeleri birer birer yen, tacın parçalarını geri al. Sonra Üçlerin Tahtı'yla yüzleş.", "Three crowns. One throne.": "Üç taç. Tek taht.", "The Throne of Three opens at Lv 400.": "Üçlerin Tahtı Lv 400'de açılır.", "Raid Queens": "Baskın Kraliçeleri" });
const W = (w) => (WORDS[LANG] && WORDS[LANG][w]) || w;
// for the newer modules: a single word from WORDS, anything longer from the site dictionary
const TW = (s, v) => (WORDS[LANG] && WORDS[LANG][s] != null ? (v ? WORDS[LANG][s].replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : WORDS[LANG][s]) : T(s, v));
/// the opening week's launch card (24 – 31 Oct, Seoul): on every visit, for everyone (guests and agent owners too), on top of
/// everything, the moment the loading screen is done and you're in the town (not over the loading screen: the owner, 2026-10-24).
/// "Go to the AD Tower" pressed before the town is ready waits for it (adpGo).
const AD_PROMO_END = Date.parse("2026-10-31T15:00:00Z");
let adpDone = false, adpGo = false;
const adpReady = () => { try { const l = document.getElementById("wp-loading"); return (!l || l.classList.contains("done")) /* (it is removed once it fades) */ && mode === "hub" && !introOn; } catch { return false; /* (still loading) */ } };
function adPromo(force) {
  if ((adpDone && !force) || Date.now() > AD_PROMO_END || document.querySelector(".wp-adp")) return;
  adpDone = true;
  const el = document.createElement("div"); el.className = "wp-adp"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", TW("AGENT DIMENSION is open!"));
  el.innerHTML = `<div class="wp-adp-in"><button type="button" class="wp-adp-x" data-later aria-label="${esc(T("Close"))}">×</button>
    <button type="button" class="wp-adp-art" data-go><img src="/images/ad/agent-launch.webp?v=1" srcset="/images/ad/agent-launch-640.webp?v=1 640w, /images/ad/agent-launch.webp?v=1 1100w" sizes="(max-width: 600px) 92vw, 540px" width="1100" height="733" alt="${esc(TW("Choose your AI agent — 100,000 $ARCIRCLE, 50% off"))}"></button>
    <p>${esc(TW("AGENT DIMENSION is open! Pick AURORA, ORION or VEX — 50% of the price is burned, 50% goes to the treasury."))}</p>
    <span><button type="button" class="wp-adp-go" data-go>🚀 ${esc(TW("Go to the AD Tower"))}</button><button type="button" class="wp-adp-later" data-later>${esc(TW("Later"))}</button></span></div>`;
  let was = null; try { was = frozen; frozen = true; keys.clear(); near = null; paintPrompt(); } catch { /* the town isn't up yet */ }
  document.body.appendChild(el); try { if (Snd.click) Snd.click(); } catch { /* no sound */ }
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); if (was !== null) try { frozen = was && !!document.querySelector("#wp-make:not([hidden]),.wp-qs"); } catch { /* fine */ } };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-later]")) return close(); if (e.target.closest("[data-go]")) { close(); if (adpReady()) goAgentTower(); else { adpGo = true; try { toast(TW("Taking you to the AD Tower as soon as the town is ready…")); } catch { /* the toast comes later */ } } } });
}
document.querySelectorAll("[data-w]").forEach((el) => { el.textContent = W(el.dataset.w); });
if (LANG !== "en") { const k = $("wp-keys"); if (k) k.innerHTML = `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ${W("move")} <span>·</span> <kbd>Space</kbd> ${W("jump")} <span>·</span> <kbd>Shift</kbd> ${W("run")} <span>·</span> <kbd>E</kbd> ${W("enter")} <span>·</span> <kbd>F</kbd> ${W("board")} <span>·</span> <kbd>1</kbd><kbd>2</kbd> ${W("emote")} <span>·</span> <kbd>P</kbd> ${W("photo")} <span>·</span> <kbd>M</kbd> ${W("map")} <span>·</span> <kbd>H</kbd> ${W("help")} <span>·</span> ${W("drag to look")}`; }
K.SHOPS.forEach((s) => { s.name = T(s.name); s.line = T(s.line); });
K.DISTRICTS.forEach((d) => { d.name = T(d.name); });
K.SCAMMERS.forEach((s) => { s.name = T(s.name); s.sign = T(s.sign); });

// ---------------- progress and settings ----------------
const SAVE = "arc.world", SETS = "arc.world.set", SESS = "arc.world.sess", VID = "arc.world.vid";
const blank = () => ({ xp: 0, visited: [], beaten: [], cards: [], quests: [], badges: [], char: "", name: "", daily: null, tut: 0, authSeen: false });
const P = (() => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(SAVE) || "{}") }; } catch { return blank(); } })();
if (P.tutBits == null) P.tutBits = (1 << Math.min(3, P.tut | 0)) - 1;
// a fresh start (world-lock.js EPOCH, api/_world-phase.mjs): progress from an earlier test stays behind — level, XP,
// gear, quests, the island's numbers, the ARCL queue. The name, the character, the outfit, settings and friends stay.
const EPOCH = (window.arcWorldLock && window.arcWorldLock.epoch) || 1;
if ((P.ep || 1) !== EPOCH) {
  const friends = P.rpg && P.rpg.x && Array.isArray(P.rpg.x.friends) ? P.rpg.x.friends : null;
  for (const k of ["xp", "xpv", "visited", "beaten", "cards", "quests", "badges", "daily", "rpg", "isle", "vill"]) delete P[k];
  Object.assign(P, { xp: 0, visited: [], beaten: [], cards: [], quests: [], badges: [], daily: null, ...(friends ? { rpg: { x: { friends } } } : {}) });
  for (const k of ["isle", "sold", "ko", "boss", "arclq", "fishwk"]) { try { localStorage.removeItem("arc.world." + k); } catch { /* private */ } }
  P.ep = EPOCH; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ }
}
P.ep = EPOCH;
const S = (() => { const d = { quality: "auto", sound: true, sens: 1 }; try { return { ...d, ...JSON.parse(localStorage.getItem(SETS) || "{}") }; } catch { return d; } })();
let cloudT = 0;
// the save goes to this browser at most every 1.5 s (a whole save on every knock-out and pickup was a hitch), and
// right away when the page is hidden or closed
let lsT = 0;
const writeLocal = () => { clearTimeout(lsT); lsT = 0; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private window */ } };
const save = () => { if (!lsT) lsT = setTimeout(writeLocal, 1500); clearTimeout(cloudT); cloudT = setTimeout(cloudSave, 6000); };
addEventListener("pagehide", () => { if (lsT) writeLocal(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && lsT) writeLocal(); });
// a network poller that skips its ticks while the tab is hidden and runs once (staggered) when it comes back
const pollers = [];
const every = (ms, fn) => { const p = { fn, due: false }; pollers.push(p); const run = () => { if (document.hidden) { p.due = true; return; } fn(); }; if (ms >= 10000) setTimeout(() => { run(); setInterval(run, ms); }, Math.round(Math.random() * ms)); else setInterval(run, ms); }; /* (the long ones start at a random point of their period: they used to fire in the same frame every minute) */
document.addEventListener("visibilitychange", () => { if (document.hidden) return; let k = 0; for (const p of pollers) if (p.due) { p.due = false; setTimeout(p.fn, 300 * k++); } });
const saveSet = () => { try { localStorage.setItem(SETS, JSON.stringify(S)); } catch { /* private window */ } };
// the level from XP on a rising curve (world-rpg-data.js); a save from the old 100-a-level curve is converted once,
// keeping its level
if (P.xpv !== RPG.XP_VERSION) { P.xp = RPG.xpFromOld(P.xp); P.xpv = RPG.XP_VERSION; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ } }
let lvMemo = [-1, 1];
const level = () => { if (lvMemo[0] !== P.xp) lvMemo = [P.xp, RPG.levelOfXp(P.xp)]; return lvMemo[1]; };
let xpBoostUntil = 0; // the Starter Package's 2× EXP (worldOwn.xpBoostUntil, b414)
let xp3Until = 0; // a launch potion's 3× EXP (worldOwn.xp3Until, b453: api/_world-launch.mjs)
let petXpPct = 0, petLuck = 0; // the pet's Scholar (+% XP) and Lucky (gear drop) numbers, set by world-pet.js through onMods
let xpHeld = false; // window.arcWorld.holdXp(true): screenshots and tests keep the level where it is
// the village blessing (world-village.js): +2% XP and +1% max HP for each village level after the first
const bless = () => { const v = P.vill, s = sess(); return (v && s && v.w === lc(s.wallet) && v.blessing) || { xp: 0, hp: 0 }; };
// weekend 2×: XP here, ARCL from play on the server (api/_world-shop.mjs weekendK), both on Seoul's Saturday and Sunday
const weekend2x = () => { const d = new Date(Date.now() + 9 * 3600e3).getUTCDay(); return d === 0 || d === 6; };
function gain(n, why) {
  if (xpHeld) return;
  if (n > 0 && bless().xp) n = Math.round(n * (1 + bless().xp / 100));
  if (n > 0 && xpBoostUntil > Date.now()) n *= 2; // the Starter Package's 2× EXP
  if (n > 0 && xp3Until > Date.now()) n *= 3; // a launch potion's 3× (the server raises the allowance with it)
  if (n > 0 && weekend2x()) n *= 2; // the weekend's 2× (Saturday and Sunday, Seoul time; the server doubles the allowance too)
  if (n > 0 && petXpPct) n = Math.round(n * (1 + petXpPct / 100)); // a Scholar pet (the server's XP allowance still caps what is saved)
  const before = level(); P.xp += n; save(); paintHud();
  if (n > 0) xpFloat(n); // a number beside the XP bar; the why (feed lines, quest toasts) is told elsewhere
  if (level() > before) { Snd.level(); burst(0x39ff88); levelUp(level(), before); } else Snd.pick();
  badges();
}
// a Rare or better find turns over like a card at the top of the screen: the back first, then the piece and its name
function lootCard(it) {
  if (!rpg) return; const R = RPG.RARITY[it.r] || RPG.RARITY[0];
  document.querySelectorAll(".wp-loot").forEach((e) => e.remove());
  const el = document.createElement("div"); el.className = "wp-loot r" + it.r + (it.r >= 4 ? " legend" : ""); el.style.setProperty("--rc", R.color); el.setAttribute("role", "status");
  // a Legendary gets the middle of the screen, turning rays behind it, a chime and a little longer to be admired
  if (it.r >= 4) { try { Snd.level(); } catch { /* sound off */ } if (avatar && avatar.face) avatar.face("star", 2); }
  el.innerHTML = `${it.r >= 4 ? '<i class="wp-loot-rays" aria-hidden="true"></i>' : ""}<div class="wp-loot-in"><div class="wp-loot-back"></div><div class="wp-loot-face">${rpg.thumb ? rpg.thumb(it) : ""}<b>${esc(rpg.itemName(it))}</b><small>${esc(T(R.name))}</small></div></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
  const stay = it.r >= 4 ? 3800 : 2600; setTimeout(() => el.classList.add("out"), stay); setTimeout(() => el.remove(), stay + 600);
}
// a critical hit: the edges of the screen flash gold (at most four times a second)
let critEl = null, critT = 0;
function critFlash() {
  if (reduce || performance.now() - critT < 250) return; critT = performance.now();
  if (!critEl) { critEl = document.createElement("div"); critEl.className = "wp-critflash"; critEl.setAttribute("aria-hidden", "true"); document.body.appendChild(critEl); }
  critEl.classList.remove("on"); requestAnimationFrame(() => critEl.classList.add("on"));
}
// the dodge's afterimages: three frozen, see-through copies of you along the dash (computers; a phone keeps the
// lighter streaks)
let ghostMat = null;
function afterimage() {
  if (reduce || liteFx || st.quality.coarse || !avatar || !avatar.obj || !K.poseGhost) return false;
  if (!ghostMat) ghostMat = new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 3; i++) setTimeout(() => {
    if (!avatar || !avatar.obj) return;
    avatar.obj.updateMatrixWorld(true);
    const g = K.poseGhost(avatar.obj, ghostMat);
    avatar.obj.matrixWorld.decompose(g.position, g.quaternion, g.scale); st.scene.add(g); planet.attach(g); // stays where you were as the world slides on
    setTimeout(() => K.freeGhost(g), 400 - i * 55);
  }, i * 55);
  // the shared material fades as a whole: each copy lives under 0.4 s, so one fade per dash reads as three
  const t1 = performance.now(), off2 = st.on(() => { const k = (performance.now() - t1) / 520; ghostMat.opacity = 0.34 * Math.max(0, 1 - k); if (k >= 1) off2(); });
  return true;
}
// toasts: a small stack under the top edge, newest on top, three at most; the same line again counts up (×2) instead of
// stacking. Three pooled nodes inside #wp-toast, placed and faded with transform and opacity only
const TOAST_MAX = 3, toastPool = [], toastLive = [], toastHist = []; // toastHist: the last 30 lines for Menu → Recent messages
function toastPlace() { let y = 0; toastLive.forEach((t) => { t.el.style.setProperty("--y", y + "px"); y += t.el.offsetHeight + 6; }); }
function toastOut(t) {
  const i = toastLive.indexOf(t); if (i < 0) return;
  toastLive.splice(i, 1); clearTimeout(t.t); t.el.classList.remove("on"); toastPlace();
  t.t = setTimeout(() => { t.el.hidden = true; toastPool.push(t); }, 260);
}
function toast(msg) {
  const box = $("wp-toast"); if (!box) return; msg = String(msg ?? "");
  // the games hand in a line with a bold part (<b>…</b>, escaped text): shown as plain text (it's set as textContent),
  // without the tags or the escapes showing (they did, in Jurassic World's lines)
  if (/<\/?[a-z][^>]*>|&(?:amp|lt|gt|quot|#39);/i.test(msg)) msg = msg.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  { const am = /\+\s?(\d[\d,.]*)\s?ARCL\b/.exec(msg); if (am) try { coinFly(Number(am[1].replace(/[,.]/g, ""))); } catch { /* still loading */ } } // ARCL earned: coins fly to the Exchange button (b-fx1)
  { const h = toastHist[0]; if (h && h.m === msg) { h.n++; h.t = Date.now(); } else { toastHist.unshift({ m: msg, n: 1, t: Date.now() }); if (toastHist.length > 30) toastHist.pop(); } }
  let t = toastLive.find((x) => x.msg === msg);
  if (t) { t.n++; t.c.textContent = "×" + t.n; t.c.hidden = false; t.el.classList.remove("bump"); void t.el.offsetWidth; t.el.classList.add("bump"); }
  else {
    if (toastLive.length >= TOAST_MAX) toastOut(toastLive[toastLive.length - 1]);
    t = toastPool.pop();
    if (!t) { const el = document.createElement("div"); el.className = "wp-tst"; el.innerHTML = "<span></span><b hidden></b>"; box.appendChild(el); t = { el, s: el.firstChild, c: el.lastChild }; }
    clearTimeout(t.t); t.msg = msg; t.n = 1; t.s.textContent = msg; t.c.hidden = true; t.el.classList.remove("on", "bump"); t.el.hidden = false;
    toastLive.unshift(t); toastPlace(); void t.el.offsetWidth; t.el.classList.add("on");
  }
  clearTimeout(t.t); t.t = setTimeout(() => toastOut(t), 2600 + Math.min(2000, msg.length * 25));
}
// b-fx1: ARCL earned — a handful of coins arc from the middle of the screen into the Exchange button (ARCL ⇄
// $ARCIRCLE), which bumps, and the amount counts up beside it. Once every 0.7 s at most (the mine pays rock by rock);
// nothing to fly to (a game's own screen) or less motion: just the count
let coinAt = 0;
function coinFly(n) {
  if (!(n > 0) || Date.now() - coinAt < 700) return; coinAt = Date.now();
  const tgt = [$("wp-dk-swap"), $("wp-rew-btn"), $("wp-purse")].find((e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden"); if (!tgt) return;
  const r = tgt.getBoundingClientRect(), tx = r.left + r.width / 2, ty = r.top + r.height / 2, sx = innerWidth / 2, sy = innerHeight * 0.55;
  const lab = document.createElement("div"); lab.className = "wp-coin-n"; lab.style.left = tx + "px"; lab.style.top = r.top + "px"; lab.textContent = "+0 ARCL"; document.body.appendChild(lab);
  const fmtC = (v) => "+" + Math.round(v).toLocaleString("en-US") + " ARCL", t0 = performance.now(), dur = 900;
  const up = (t) => { const k = Math.min(1, (t - t0) / dur); lab.textContent = fmtC(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(up); }; requestAnimationFrame(up);
  setTimeout(() => lab.remove(), 1900);
  if (reduce || lowGfx) { tgt.classList.remove("wp-coin-bump"); void tgt.offsetWidth; tgt.classList.add("wp-coin-bump"); return; }
  const k = Math.min(9, 3 + Math.floor(Math.log10(n + 1) * 2));
  for (let i = 0; i < k; i++) {
    const c = document.createElement("img"); c.src = "/images/arcl2-64.png"; c.alt = ""; c.className = "wp-coin"; document.body.appendChild(c);
    const ox = (Math.random() - 0.5) * 140, oy = (Math.random() - 0.5) * 70, mx = (sx + ox + tx) / 2 + (Math.random() - 0.5) * 120, my = Math.min(sy, ty) - 120 - Math.random() * 80;
    const a = c.animate([{ transform: `translate(${sx + ox}px,${sy + oy}px) scale(.3)`, opacity: 0 }, { transform: `translate(${sx + ox}px,${sy + oy - 30}px) scale(1.1)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.55 }, { transform: `translate(${tx}px,${ty}px) scale(.55)`, opacity: 0.9 }], { duration: 760 + i * 55, delay: i * 45, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "both" });
    for (const [lag, op] of [[38, 0.45], [76, 0.22]]) { const t2 = document.createElement("img"); t2.src = c.src; t2.alt = ""; t2.className = "wp-coin wp-coin-trail"; t2.style.opacity = op; document.body.appendChild(t2);
      t2.animate(a.effect.getKeyframes().map((f) => ({ ...f, opacity: (f.opacity ?? 1) * op })), { duration: 760 + i * 55, delay: i * 45 + lag, easing: "cubic-bezier(.45,.05,.55,.95)", fill: "both" }).onfinish = () => t2.remove(); }
    a.onfinish = () => { c.remove(); tgt.classList.remove("wp-coin-bump"); void tgt.offsetWidth; tgt.classList.add("wp-coin-bump"); if (i < 5 && Snd.coin) try { Snd.coin(); } catch { /* quiet */ } };
  }
}
// "+XP" floats up beside the XP bar instead of taking a toast; gains within half a second add up in the one rising
const xpFl = []; let xpFlI = 0, xpFlLast = null;
function xpFloat(n) {
  const host = $("wp-lv"); if (!host || !n) return;
  const now = performance.now();
  if (xpFlLast && now - xpFlLast.at < 500) { xpFlLast.n += n; xpFlLast.el.textContent = "+" + xpFlLast.n.toLocaleString("en-US") + " XP"; return; }
  let f = xpFl[xpFlI]; if (!f) { const el = document.createElement("b"); el.className = "wp-xpf"; el.setAttribute("aria-hidden", "true"); el.setAttribute("data-no-i18n", ""); host.appendChild(el); f = xpFl[xpFlI] = { el }; }
  xpFlI = (xpFlI + 1) % 3; f.n = n; f.at = now; xpFlLast = f;
  f.el.textContent = "+" + n.toLocaleString("en-US") + " XP"; f.el.classList.remove("go"); void f.el.offsetWidth; f.el.classList.add("go");
}

// ---------------- accounts, saving, who's online (api/_world.mjs) ----------------
const AC = window.arcConnect, CFG = (typeof CONFIG !== "undefined" ? CONFIG : window.CONFIG) || {}; // config-arc.js declares CONFIG with const: a global, but not a window property
const addr = () => (AC && AC.address && AC.address()) || "";
const vid = (() => { try { let v = localStorage.getItem(VID); if (!/^[a-z0-9]{20}$/.test(v || "")) { v = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); localStorage.setItem(VID, v); } return v; } catch { return "guest0000000000000000"; } })();
const sess = () => { try { const s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch { return null; } };
// the first minutes, one window at a time (b-ob): whatever opens by itself (the launch card, Getting started, the day's
// tips, a tour, what's new) asks autoShow(name, priority, open) and waits for a calm moment — nothing else up, and a few
// seconds since the last one closed — then the most important one waiting goes first (a lower number first)
const autoQ = new Map(); let calmAt = 0, waveT = 0, idleWaveAt = 0; // (waveT, idleWaveAt: the hero's wave now and then, standing about)
function autoShow(name, prio, open) { autoQ.set(name, { prio, open }); }
const loginMessage = (wallet, issued) => `ARCIRCLE World — sign in\n\nWallet: ${lc(wallet)}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;
// a call to the World API: given up after 20 s (a phone's network that stalls once used to leave a request hanging for
// good, and the game waiting on it ignored every tap after — Jurassic crafting and building went dead that way)
const post = (body) => { const ac = typeof AbortController !== "undefined" ? new AbortController() : null, to = ac ? setTimeout(() => ac.abort(), 20000) : 0;
  return fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ep: EPOCH, ...body }), ...(ac ? { signal: ac.signal } : {}) }).then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) })).finally(() => clearTimeout(to)); };
const PROGRESS = ["xp", "xpv", "visited", "beaten", "cards", "quests", "badges", "char", "name", "daily", "rpg", "outfit", "ep"];
async function signIn() {
  if (!AC) throw new Error(T("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  const a = lc(addr()); if (!a) throw new Error(T("Connect a wallet first."));
  const prov = await AC.provider();
  const issued = new Date().toISOString(), msg = loginMessage(a, issued);
  const hexMsg = "0x" + Array.from(new TextEncoder().encode(msg), (b) => b.toString(16).padStart(2, "0")).join("");
  const signature = await prov.request({ method: "personal_sign", params: [hexMsg, a] });
  const r = await post({ action: "world-login", wallet: a, issued, signature });
  if (r.status === 503) { toast(T("Signed in. Cloud saving isn't switched on yet, so progress stays in this browser.")); return; }
  if (!r.ok) throw new Error(r.j.error || T("Sign-in failed."));
  try { localStorage.setItem(SESS, JSON.stringify({ wallet: a, issued, signature })); localStorage.setItem(LOGGED, issued); } catch { /* private */ }
  loggedIn(r);
}
// the beta pass signs the same message but only checks the balance: the first visit with that signature also signs in
// here (the player is counted, and a save from another device is loaded)
const LOGGED = "arc.world.logged";
async function resumeSession() {
  const s = sess(); if (!s) return;
  // already signed in with this signature: no new sign-in, but the closed beta's reward is still asked for (b411: it
  // only came with a fresh sign-in, so a player who stayed signed in across the open beta's start never got it)
  // b417: the server's save is read on every visit, not only on a new sign-in: progress made on another device since
  // (a phone, then this computer) is loaded instead of this browser's older copy being shown, and saved over it
  const r = await post({ action: "world-login", ...s }).catch(() => null);
  if (!r || !r.ok) return;
  try { localStorage.setItem(LOGGED, s.issued); } catch { /* private */ }
  loggedIn(r, true);
}
// starting over (Settings → Reset): the next save says so, and the server's progress isn't loaded back in
const resetting = (() => { try { return localStorage.getItem("arc.world.reset") === "1"; } catch { return false; } })();
// the server's progress, newer than this browser's: taken over (PROGRESS fields), kept here, then the game reloads so
// every part of it (level, gear, quests) starts from it
function takeServer(sv, why) {
  if (sv.xpv !== RPG.XP_VERSION) { sv.xp = RPG.xpFromOld(sv.xp); sv.xpv = RPG.XP_VERSION; }
  PROGRESS.forEach((k) => { if (sv[k] != null && sv[k] !== "") P[k] = sv[k]; }); P.ep = EPOCH;
  try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ }
  toast(why); setTimeout(() => location.reload(), 1600);
}
function loggedIn(r, quiet) {
  const sv = !resetting && r.j.save && (r.j.save.ep || 1) === EPOCH ? r.j.save : null; // never an earlier test's progress
  if (sv && sv.xpv !== RPG.XP_VERSION) { sv.xp = RPG.xpFromOld(sv.xp); sv.xpv = RPG.XP_VERSION; } // a save from the old level curve
  if (sv && (sv.xp || 0) > P.xp) { PROGRESS.forEach((k) => { if (sv[k] != null && sv[k] !== "") P[k] = sv[k]; }); try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ } toast(T("Welcome back, {name}. Your progress is loaded.", { name: P.name || "" })); }
  else { if (!quiet || r.j.firstTime) toast(r.j.firstTime ? T("Signed in. Welcome to ARCIRCLE World!") : T("Signed in.")); cloudSave(); }
  arclShop.refresh().then(() => { arclShop.flushQueue(); arclChecks(); setTimeout(() => arclShop.maybeDaily(), 1500); });
  setTimeout(() => { village.load(); setNameTag(); }, 600);
  if (r.j.cbt) setTimeout(() => cbtReward(r.j.cbt), 2500);
}
// ---- the closed beta's rewards (api/_world-phase.mjs): asked for once signed in to the open beta. The server keeps
// the pieces with the claim, so asking again returns the same ones; each is added to the bag once (by its id).
async function cbtReward(c) {
  if (!c || !c.eligible || EPOCH < 2) return;
  let ready = false; try { ready = !!rpg; } catch { /* still loading (rpg is declared further down) */ }
  if (!ready) { setTimeout(() => cbtReward(c), 2000); return; }
  const r0 = rpg.data(); r0.x = r0.x || {};
  if (r0.x.cbt === EPOCH) return;
  const s = sess(); if (!s) return;
  const r = await post({ action: "world-cbt-claim", ...s }).catch(() => null);
  if (r && r.status === 404) { r0.x.cbt = EPOCH; save(); return; } // no closed-beta progress on this wallet: don't ask again
  if (!r || !r.ok || !Array.isArray(r.j.items)) return;
  const have = new Set([...Object.values(r0.eq || {}), ...(r0.bag || []), ...(r0.store || [])].filter(Boolean).map((x) => x.id));
  const got = r.j.items.filter((it) => it && it.id && !have.has(it.id));
  for (const it of got) rpg.addItem({ ...it }, true);
  r0.x.cbt = EPOCH; save();
  if (got.length) cbtCard(got, r.j.rank || 0);
}
function cbtCard(items, rank) {
  const el = document.createElement("div"); el.className = "wp-cbt"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-cbt-h"); el.setAttribute("data-no-i18n", "");
  const leg = RPG.RARITY[4], wearLv = (RPG.TIERS[(RPG.parseBase(items[0].b) || {}).tier || 0] || {}).lv || 1;
  el.innerHTML = `<div class="wp-cbt-card"><div class="wp-cbt-top" aria-hidden="true"><i></i></div><small>${esc(T("Closed beta reward"))}</small>
    <h2 id="wp-cbt-h">${esc(rank ? T("Rank {n} in the closed beta. Thank you!", { n: rank }) : T("Thank you for playing the closed beta!"))}</h2>
    <p>${esc(items.length > 1 ? T("{n} Legendary pieces for your new start. Worn from level {lv}.", { n: items.length, lv: wearLv }) : T("A Legendary weapon for your new start. Worn from level {lv}.", { lv: wearLv }))}</p>
    <ul>${items.map((it, i) => { const pb = RPG.parseBase(it.b) || { slot: "weapon" }; return `<li style="--i:${i}">${RPG.iconSvg(pb.slot, leg.color)}<b>${esc(RPG.itemName(it))}</b><small>${esc(T("Legendary"))} · ${esc(T(RPG.SLOT_NAME[pb.slot] || pb.slot))} · ${esc(T("Lv {n}", { n: it.lv }))}</small></li>`; }).join("")}</ul>
    <div class="wp-cbt-act"><button type="button" class="wp-cbt-bag">${esc(T("Open the bag"))}</button><button type="button" class="wp-cbt-x">${esc(T("Close"))}</button></div></div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-cbt-x").addEventListener("click", close);
  el.querySelector(".wp-cbt-bag").addEventListener("click", () => { close(); rpg.show(); });
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  setTimeout(() => el.querySelector(".wp-cbt-bag").focus(), 40);
}
// a save that doesn't reach the server (offline, a server hiccup, too soon after the last) is tried again on its own,
// sooner at first and then less often, and right away when the connection comes back; a small note shows meanwhile
let saveFails = 0, saveRetryT = 0;
function paintSaveNote() { const el = $("wp-savenote"); if (!el) return; el.hidden = saveFails < 2; el.textContent = T("Not saved to your wallet yet: trying again"); }
addEventListener("online", () => { if (saveFails) { clearTimeout(saveRetryT); cloudSave(); } });
async function cloudSave() {
  const s = sess(); if (!s) return;
  const data = {}; PROGRESS.forEach((k) => (data[k] = P[k]));
  let retry = 0;
  try { const r = await post({ action: "world-save", ...s, data, ...(resetting ? { reset: true } : {}) });
    if (r.ok && resetting) { try { localStorage.removeItem("arc.world.reset"); } catch { /* private */ } }
    if (r.status === 409 && r.j.behind && r.j.save) { takeServer(r.j.save, T("Your newer progress from another device is loaded.")); return; }
    if (r.status === 400 && /expired/.test(r.j.error || "")) { try { localStorage.setItem(SESS, JSON.stringify({ ...s, issued: new Date(0).toISOString() })); } catch { /* private */ } paintAcct(); }
    else if (r.status === 429) retry = 9000; else if (!r.ok && r.status >= 500 && r.status !== 503) retry = Math.min(120e3, 10e3 * 2 ** saveFails); else if (r.ok) { saveFails = 0; paintSaveNote(); if (r.j && r.j.refer) try { referUI.paid(r.j.refer); } catch { /* shown next visit */ } } }
  catch { retry = Math.min(120e3, 10e3 * 2 ** saveFails); }
  if (retry) { saveFails++; paintSaveNote(); clearTimeout(saveRetryT); saveRetryT = setTimeout(cloudSave, retry); }
}
let stats = null, visitSent = false, dinoOutNow = false; // dinoOutNow: your dinosaur companion walks with you in town (dinoTown)
async function ping() {
  if (document.hidden) return;
  let g; try { if (mode === "hub" && !introOn) { const v = here(new THREE.Vector3()); g = { x: Math.round(v.x * 10) / 10, z: Math.round(v.z * 10) / 10, c: P.char || "bot", lv: level(), ...(P.tint ? { tn: P.tint } : {}), ...(tierOf() ? { tr: tierOf() } : {}) }; /* b447: the hero's colour and halo tier, for the others */ if (combat) { const vt = combat.vitals(), zz = combat.zone(); g.h = Math.max(0, Math.min(100, Math.round((100 * vt.hp) / (vt.max || 1)))); if (zz) g.zn = zz.id; } if (said && !said.sent && Date.now() - said.at < 60e3) { g.s = said.s; said.sent = true; } if (P.pal) g.p = P.pal; if (dinoOutNow) g.dn = 1; try { const s0 = landNow === "ad" && agentDim && agentDim.state(); if (s0 && s0.agent) g.ag = 1; } catch { /* still loading */ } const cm = chatUI && chatUI.pending(); if (cm) g.m = cm; } } catch { /* not ready yet */ }
  // signed in and not hidden (Settings): the sign-in goes along, so others see your name and level over your figure
  const se = g && S.showName !== false ? sess() : null;
  try { const r = await post({ action: "world-ping", id: vid, visit: !visitSent, ...(g ? { g } : {}), ...(se ? { s: se } : {}), ...(se && chatUI && chatUI.presenceDue() ? { pr: 1 } : {}) }); if (r.ok) { visitSent = true; stats = r.j; paintOnline(); } } catch { /* offline */ }
}
function paintAuthCount() {
  const c = $("wp-auth-count"); if (!stats || !stats.players) { c.hidden = true; return; }
  c.hidden = false; c.textContent = T("{n} players have signed in so far", { n: stats.players.toLocaleString("en-US") });
}
function paintOnline() {
  if (!$("wp-auth").hidden) paintAuthCount();
  const el = $("wp-online"); if (!stats || stats.online == null) { el.hidden = true; return; }
  el.hidden = false; $("wp-online-n").textContent = stats.online.toLocaleString("en-US");
  $("wp-online-l").textContent = " " + W("online") + (coarse ? "" : " · " + T("{n} visited", { n: (stats.visitors || 0).toLocaleString("en-US") }));
  el.title = T("{n} visited", { n: (stats.visitors || 0).toLocaleString("en-US") }) + " · " + T("{n} signed in with a wallet", { n: (stats.players || 0).toLocaleString("en-US") });
}
setInterval(ping, 50000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(); });

// ---------------- sound: small synthesized effects (world-sfx.js, WebAudio), started by the first touch or key ----------------
const Snd = SFX.createSfx({ S, saveSet, music: () => music, coarse });
// the music (world-music.js): six K-pop tracks in a shuffled order; the note button in the top bar turns it on and off
// (S.bgm), Settings → Music sets the volume, and Sound off silences it too
const musicVol = () => (S.music ?? 55) / 100;
const music = MUS.createMusic({ ver: VER, volume: musicVol(), on: () => !!S.sound && S.bgm !== false && musicVol() > 0 });
// sound may only start from a gesture the browser counts: on a phone that's the end of a tap, not its start. Every tap,
// click and key tries until both the effects and the music are actually running (caught before anything else can
// stop the event)
const wake = () => { if (Snd.ready() && music.unlocked()) return; Snd.unlock(); music.unlock(); };
["pointerup", "touchend", "click", "keydown", "pointerdown"].forEach((ev) => addEventListener(ev, wake, { capture: true, passive: true }));
function paintMusicBtn() {
  const b = $("wp-music-btn"); if (!b) return; const on = S.bgm !== false;
  b.setAttribute("aria-pressed", on ? "true" : "false"); b.classList.toggle("off", !on);
  b.title = on ? T("Music on (tap to turn off)") : T("Music off (tap to turn on)");
}
if ($("wp-music-btn")) {
  $("wp-music-btn").addEventListener("click", (e) => {
    e.stopPropagation(); S.bgm = S.bgm === false; saveSet(); paintMusicBtn();
    if (S.bgm && !S.sound) { S.sound = true; saveSet(); try { Snd.set(true); } catch { /* not ready */ } } // music on with the sound off: sound comes on too
    Snd.init(); music.start(); music.refresh();
  });
  paintMusicBtn();
}

// ---------------- the scene ----------------
const cv = $("wp-cv");
if (!K.webglOk()) {
  $("wp-loading").innerHTML = `<span>${esc(T("This browser can't draw the 3D world."))}</span><a class="wp-cta" href="/?skip">${esc(T("Go to the Platform World"))}</a>`;
  throw new Error("no webgl");
}
try { await document.fonts.load("700 92px Sora"); } catch { /* system font */ }
loadbar(0.15);
// bloom only on what glows: the white halls lit by the sun stay under the threshold (a wider, stronger bloom washed the
// whole screen white on phones when a hall or an arch was close to the camera)
const st = K.makeStage(cv, { fog: 0.0058, bloom: 0.28, bloomRadius: 0.25, bloomThreshold: 1.15, fov: 55, shadows: true, quality: S.quality, groundY: 0, post: true, look: { toon: 0.4 }, // look: the stylized finish (world-kit.js stylize)
  // the graphics context gone for good (rare: a phone short on memory): a way back in
  onLost: () => { if (document.querySelector(".wp-lost")) return; const el = document.createElement("div"); el.className = "wp-leave wp-lost"; el.setAttribute("role", "alertdialog"); el.innerHTML = `<div class="wp-card wp-leave-card"><h2>${esc(T("The graphics paused"))}</h2><p>${esc(T("Your phone needed the memory back. Your progress is saved."))}</p><div class="wp-leave-btns"><button type="button" class="wp-cta" data-reload>${esc(T("Reload the game"))}</button></div></div>`; el.addEventListener("click", (e) => { if (e.target.closest("[data-reload]")) location.reload(); }); document.body.appendChild(el); },
  onRestored: () => { document.querySelectorAll(".wp-lost").forEach((e) => e.remove()); },
});
st.fps(S.fpsCap || 60); // the frame limit (Settings)
let autoCap = 0, grassThin = false, tmpV3 = null; // grassThin: a slow phone's grass halved (dynRes, b447) // 30 once a slow phone was moved to an even 30 fps (dynRes, b447); declared here because diag reads it
// b447: on a phone (unless Ultra was picked), no clear-coat layer: glass, crystals and glossy gear keep their colour and
// shine but skip the second specular layer, which cost each of them about twice the shading. three.js reads clearcoat
// when it builds a shader, so this one switch covers every module and every material, made before or after it
if (st.quality.coarse && !st.quality.ultra) { try { const P = THREE.MeshPhysicalMaterial.prototype, d = Object.getOwnPropertyDescriptor(P, "clearcoat");
  if (d && d.set) Object.defineProperty(P, "clearcoat", { configurable: true, get() { return 0; }, set(v) { d.set.call(this, v); } }); } catch { /* keep the full look */ } }
st.scene.background = null;
const kitP = K.loadKit(VER).catch((e) => { console.warn("world models:", e); return null; });
// the intro: the round planet seen from space, built before the kit switches to flat ground
const intro = new THREE.Group(); intro.visible = false; st.scene.add(intro);
{
  const pl = K.makePlanet({ map: "/models/world/planet-surface.jpg" + VER });
  pl.add(K.makePaths(), K.makeDistrictTints(), K.makeLamps());
  K.SHOPS.forEach((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); pl.add(g); });
  intro.add(pl, K.makeHalo()); intro.userData.pl = pl;
}
K.setFlat(1.35);
K.spreadTown(1.7, 3); // the halls and houses further apart (b403)
// the world: everything on the ground lives in this group, which slides under the player
const planet = new THREE.Group(); planet.name = "world"; st.scene.add(planet);
// where you stand on the plaza: in front of the fountain, facing it (the world slides, so this is its offset)
const HOME = new THREE.Vector3(-1.2, 0, -7.6); planet.position.copy(HOME); // a little off centre, so walking straight on slides past the fountain
// the finishing look (world-look.js): a colour grade per time of day, varied grass, contact shadows under the halls
let grade = LOOK.addGrade(st); st.on((dt) => { LOOK.time.value += dt; });
// the picture after the scene (world-post.js): real antialiasing with bloom, ink edges, AO on Ultra, low fog and sun
// shafts, a 3D colour grade per time of day and ground
// Auto is Medium on computers too (b411): Auto on a computer used to be Ultra (AO, SMAA, sun shafts, a mirror pool, the
// shadow map every frame, 60,000 grass blades), which held a GTX 980 at 30–40 fps. Ultra is still one tap away.
const postLevel = S.quality === "ultra" || S.quality === "high" ? "ultra" : S.quality === "low" || S.quality === "saver" ? "low" : S.quality === "medium" ? "medium" : st.quality.low ? "low" : "medium";
let fxPost = null; const lgrade = LOOK.lutGrade(), sunDir = st.sun.position.clone().sub(st.sun.target.position).normalize();
Promise.resolve(POST.buildPost(st, { level: postLevel, bloom: [0.28, 0.25, 1.15], lite: st.quality.coarse })).then((p) => {
  fxPost = p; if (!p) return;
  p.edge.uniforms.thick.value = Math.max(1, st.renderer.getPixelRatio() * 0.7);
  if (!p.grade) grade = LOOK.addGrade(st); else grade = null; // WebGL 1: the old grade on the new chain
  nightK = -1; dayNight();
}).catch(() => {});
st.on((dt) => { if (fxPost) fxPost.tick(dt, sunDir); });
// worn paths from the plaza out to each hunting ground's gate (the ground shows packed earth, the grass leaves them bare)
const WORN_PATHS = RPG.ZONES.filter((z) => Math.hypot(z.x, z.z) < 260).map((z) => { const d = Math.hypot(z.x, z.z), ux = z.x / d, uz = z.z / d, a = K.flatR ? K.flatR(11) + 1 : 16; return [ux * a, uz * a, ux * (d - z.r + 0.5), uz * (d - z.r + 0.5)]; });
{ const v = MV.MINE_VILLAGE, d = Math.hypot(v.x, v.z), a = K.flatR ? K.flatR(11) + 1 : 16; WORN_PATHS.push([v.x / d * a, v.z / d * a, v.x / d * (d - v.r + 0.5), v.z / d * (d - v.r + 0.5)]); } // the walk out to the Mining Village
// AGENT DIMENSION's Citadel: where it stands on the flat ground, and the walk out to its door
const AGW = (() => { const g = K.AGENT_GATE, d = K.flatR ? K.flatR(g.theta) : 78, a = THREE.MathUtils.degToRad(g.phi); return { x: d * Math.sin(a), z: -d * Math.cos(a), d, r: g.r }; })();
{ const a = K.flatR ? K.flatR(11) + 1 : 16, ux = AGW.x / AGW.d, uz = AGW.z / AGW.d; WORN_PATHS.push([ux * a, uz * a, ux * (AGW.d - AGW.r + 1), uz * (AGW.d - AGW.r + 1)]); }
{ const v = PV.PARTNER_VILLAGE, d = Math.hypot(v.x, v.z), a = K.flatR ? K.flatR(11) + 1 : 16; WORN_PATHS.push([v.x / d * a, v.z / d * a, v.x / d * (d - v.r + 0.5), v.z / d * (d - v.r + 0.5)]); } // the walk out to the Partner Village
const groundG = K.makeGround(); planet.add(groundG);
{ const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map); if (gm) LOOK.groundLook(gm.material, { low: S.quality === "low" || S.quality === "saver", paths: WORN_PATHS }); }
// far shadows (world-look.js): halls, trees and the grounds' props shade the ground past the real shadow's reach
// far culling: whole groups (a hall, a hunting ground's props, a decor cell) more than ~150 m away (110 m on a phone)
// are skipped — the fog has them mostly hidden anyway, and they were hundreds of draw calls. Anything that needs the
// whole world (the far-shadow bake, the grass mask, the minimap picture) runs inside farCull.all().
const farCull = (() => {
  const SKIP = new Set(["grass", "ambient", "particles", "smoke", "combat", "ghosts", "island", "decor", "life", "zones", "ground", "puddles", "pet", "pumpkings"]); // "pet", "pumpkings" (world-pumpking.js): they move, so a scan-time box would hide them
  const CONT = ["decor", "life", "zones"], R = S.quality === "saver" ? 75 : st.quality.coarse && lowGfx ? 90 : st.quality.coarse ? 110 : postLevel === "ultra" ? 150 : 130, /* b5: battery saver and Low phones draw less far (the fog hides it) */ box = new THREE.Box3(), sph = new THREE.Sphere();
  // b420: on a computer at Medium / Ultra what's culled dissolves over its last 10 m instead of popping (K.fadeLook)
  const FADE = !st.quality.coarse && (postLevel === "medium" || postLevel === "ultra") && K.fadeLook;
  let list = [], at = 0, scanAt = -1e9, hidden = new Set(), sig = "";
  // what's in the world, cheaply: a new scan only when this changes (b413: a full scan every 15 s walked every object in
  // the world, a regular stutter while moving), or at most once a minute
  const sigNow = () => planet.children.length + ":" + CONT.map((n) => { const c = planet.children.find((x) => x.name === n); return c ? c.children.length : 0; }).join(",");
  function scan() {
    list = []; planet.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(planet.matrixWorld).invert();
    const add = (o) => { if (!o.visible && !hidden.has(o)) return; box.setFromObject(o); if (box.isEmpty()) return; box.applyMatrix4(inv); box.getBoundingSphere(sph); if (sph.radius > 60) return; list.push({ o, c: sph.center.clone(), r: sph.radius }); if (FADE) o.traverse((m) => { if (m.isMesh && m.material) [].concat(m.material).forEach(K.fadeLook); }); };
    for (const c of planet.children) { if (SKIP.has(c.name)) { if (CONT.includes(c.name)) c.children.forEach(add); continue; } add(c); }
  }
  function tick() {
    const now = performance.now(); if (now - at < 400) return; at = now;
    if (now - scanAt > 60000 || (now - scanAt > 2000 && sigNow() !== sig)) { sig = sigNow(); const was = [...hidden]; was.forEach((o) => { o.visible = true; }); hidden.clear(); scan(); scanAt = now; }
    const px = -planet.position.x, pz = -planet.position.z, on = mode === "hub"; if (FADE) K.FADE.value = on ? R : 1e6;
    for (const it of list) { const far = on && Math.hypot(it.c.x - px, it.c.z - pz) - it.r > R;
      if (far && it.o.visible) { it.o.visible = false; hidden.add(it.o); } else if (!far && hidden.has(it.o)) { it.o.visible = true; hidden.delete(it.o); } }
  }
  function all(fn) { const was = [...hidden]; was.forEach((o) => { o.visible = true; }); try { return fn(); } finally { was.forEach((o) => { if (hidden.has(o)) o.visible = false; }); } }
  return { tick, all, rescan: () => { scanAt = -1e9; }, prep: () => { if (FADE) { scan(); scanAt = performance.now(); sig = sigNow(); } } };
})();
st.on(() => { try { farCull.tick(); } catch { /* still loading */ } });
// the frame count, and the sun's shadow map redrawn every other frame below Ultra (the sun stands still; only the
// things that move need it, and they barely move in a 30th of a second)
let frameNo = 0; const shadowEvery = postLevel === "ultra" && !st.quality.coarse ? 1 : st.quality.coarse ? 3 : 2; /* b448: phones every 3rd frame (the sun stands still; the real shadow only covers the area round you) */
if (st.renderer.shadowMap.enabled && shadowEvery > 1) st.renderer.shadowMap.autoUpdate = false;
// b447: a phone still slow at the fewest pixels stops drawing the live shadow (one less pass over the town each
// time it updated): the baked town shade (gshadow) then reaches right up to you, and a soft spot sits under your feet.
// The light keeps its shadow on (switching it off rebuilds every shader); its map is just drawn empty once.
let liveShOff = 0, footSpot = null;
function bakedShadows() {
  if (liveShOff || !gshadow || !st.sun || !st.sun.castShadow || !st.renderer.shadowMap.enabled) return false;
  liveShOff = 1; planet.traverse((o) => { if (o.isMesh) o.castShadow = false; }); if (player) player.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  gshadow.uniforms.gsNear.value = 0; ensureFootSpot(); if (footSpot) footSpot.material.opacity = 1;
  return true;
}
// b447: a soft spot under your feet all the time (the live shadow on a phone redraws every third frame, and on Low there
// is none): faint while the live shadow is there, full once it's gone (bakedShadows)
function ensureFootSpot() {
  if (footSpot) return;
  try { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(0,0,0,0.5)"); g.addColorStop(0.6, "rgba(0,0,0,0.25)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const geo = new THREE.PlaneGeometry(1.3, 1.3); geo.rotateX(-Math.PI / 2);
    footSpot = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })); footSpot.renderOrder = 1; st.scene.add(footSpot);
    if (compileHidden) compileHidden([footSpot]); } catch { /* no spot */ }
  if (footSpot) footSpot.material.opacity = liveShOff ? 1 : 0.5;
}
st.on(() => { if (!footSpot) return; footSpot.visible = mode === "hub" && player.visible; if (footSpot.visible) { footSpot.position.set(player.position.x, 0.04, player.position.z); footSpot.scale.setScalar(1 / (1 + Math.max(0, hop) * 0.35)); } });
st.on(() => { frameNo++; if (liveShOff) { if (st.renderer.shadowMap.enabled) st.renderer.shadowMap.needsUpdate = liveShOff === 1 || !st.sun.shadow.map; liveShOff = 2; return; } const ev = st.shadowEvery || shadowEvery; if (ev > 1 && st.renderer.shadowMap.enabled) st.renderer.shadowMap.needsUpdate = frameNo % ev === 0; });
const gshadow = st.renderer.shadowMap.enabled ? LOOK.groundShadow({ renderer: st.renderer, planet, sunDir, around: (f) => farCull.all(f) }) : null;
if (gshadow) { const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map); if (gm) gshadow.receive(gm.material); st.on(() => gshadow.tick()); [3000, 20000].forEach((ms) => setTimeout(() => gshadow.bake(), ms)); }
// the sky (world-env.js): the gradient dome with two layers of drifting cloud and the sun's glow (the plain dome on Low)
const lowGfx = S.quality === "low" || S.quality === "saver" || (S.quality === "auto" && st.quality.low);
// b447: contact shade on everything that stands on the ground, in every place (world-look.js); not on Low
if (!lowGfx) try { LOOK.installContactShade(); } catch { /* the plain look */ }
if (!lowGfx) { const pf = planet.getObjectByName("plaza-floor"); if (pf) LOOK.stoneGrain(pf.material); }
// b447: on an Ultra computer the fountain's water mirrors the plaza round it: a small cube view (128 px) from the fountain,
// redrawn every 30 s one face a frame (six small renders spread out, so no frame stalls); the water hidden while it's
// drawn. Phones and the lower settings keep the sky's reflection only.
let mirror = postLevel === "ultra" && !st.quality.coarse ? { find: 0 } : null;
st.on((dt) => { const M = mirror; if (!M) return; try { if (mode !== "hub") return; } catch { return; /* mode is declared further down (a TDZ before it) */ } const now = performance.now();
  if (!M.cc) { if (now < M.find) return; M.find = now + 2000; try { const f = planet.getObjectByName("fountain"); if (!f) return; const waters = []; f.traverse((o) => { if (o.isMesh && o.material && o.material.transparent && o.material.roughness <= 0.06) waters.push(o); }); if (!waters.length) { mirror = null; return; }
    const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), cc = new THREE.CubeCamera(0.4, 300, rt);
    cc.position.set(0, 1.4, 0); f.add(cc); const m = waters[0].material; m.envMap = rt.texture; m.envMapIntensity = 1.1; m.needsUpdate = true; Object.assign(M, { rt, cc, waters, face: 0, at: now }); } catch { mirror = null; } return; }
  if (M.face < 0) { if (now - M.at < 30000) return; M.at = now; M.face = 0; }
  try { const r = st.renderer, cc = M.cc, i = M.face, prev = r.getRenderTarget(), sh = r.shadowMap.needsUpdate; if (cc.coordinateSystem !== r.coordinateSystem) { cc.coordinateSystem = r.coordinateSystem; cc.updateCoordinateSystem(); }
    M.waters.forEach((w) => { w.visible = false; }); cc.updateMatrixWorld(true); M.rt.texture.generateMipmaps = i === 5; r.setRenderTarget(M.rt, i); r.render(st.scene, cc.children[i]); r.setRenderTarget(prev); r.shadowMap.needsUpdate = sh;
    M.waters.forEach((w) => { w.visible = true; }); M.face = i === 5 ? -1 : i + 1; } catch { mirror = null; } }); // b447: the plaza's stone gets the village floor's grain
// every character made from here on: the asset packs' palette (not the ARC Bots, drawn in it already) and a dark rim
// and a cool rim of light (all presets but Saver)
if (K.setCharHook) K.setCharHook((obj, arc, o) => { if (!lowGfx) { if (!arc && !(o && o.pbr)) ENV.unifyPalette(obj); /* a hero keeps its own PBR colours */ if (!st.quality.coarse) K.outlineAll(obj, { t: arc ? 0.02 : 0.016 }); } if (S.quality !== "saver" && ENV.rimLight) ENV.rimLight(obj); });
// (b420: every preset but Saver has the cumulus now; the dome reads them from a table baked once, cheaper than before)
const sky = S.quality === "saver" ? K.makeSky() : ENV.makeSkyDome({ lite: st.quality.coarse || lowGfx }); st.scene.add(sky);
if (sky.material.uniforms.uTime) { sky.material.uniforms.uSun.value.copy(sunDir); if (sky.material.uniforms.uMoon) { const mv = sky.material.uniforms.uMoon.value.copy(sunDir); mv.y = Math.min(mv.y, 0.6); mv.normalize(); } /* the moon stands where the night shadows come from */ try { sky.userData.bake(st.renderer); } catch (e) { console.warn("sky:", e); } st.on((dt) => { sky.material.uniforms.uTime.value += dt; }); }
// Low has no picture chain (world-post.js), so its vignette is a still layer over the canvas: no pass of its own
if (postLevel === "low" && S.quality !== "saver") { const v = document.createElement("div"); v.className = "wp-vig"; v.setAttribute("aria-hidden", "true"); v.style.cssText = "position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 50%,transparent 55%,rgba(12,30,56,.24) 100%)"; cv.after(v); }
// rolling hills round the edge of the world (world-env.js) in place of the old round blobs
st.on((dt, t) => { if (K.arcTick) K.arcTick(dt, planet.position); LOOK.lookOrigin.value.copy(planet.position); ENV.CLOUD.t.value = t; try { if (sky.material.uniforms.uT) sky.material.uniforms.uT.value = t; } catch { /* sky not made yet */ } });
// the town's lights pulse with the music's beat (the light lines, the plaza rings); stronger on a concert night
st.on(() => { try { if (mode !== "hub" || reduce) return; const b = music.level ? music.level() : 0, k = b * (concertOn() ? 0.9 : 0.4); if (K.arcPulse) K.arcPulse(k * 0.6); if (fountain.userData.pulse) fountain.userData.pulse(k); } catch { /* still loading */ } });
// concert night: Saturdays 20:00–23:00 Seoul time (?concert=1 to try it): the stage lights up and the town pulses harder
function concertOn() { try { const q = new URLSearchParams(location.search).get("concert"); if (q) return q === "1"; } catch { /* fine */ } const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCDay() === 6 && d.getUTCHours() >= 20 && d.getUTCHours() < 23; }
{ const blobs = groundG.getObjectByName("blobs"); if (blobs) groundG.remove(blobs); groundG.add(ENV.makeHills({ inner: 312, outer: 480 })); if (ENV.makeRange && !/[?&]norange\b/.test(location.search)) groundG.add(ENV.makeRange({ r0: 540, r1: 640 })); /* b-land: pushed back for the LAND ring */ }
const skyPlanets = K.makeSkyPlanets(VER); st.scene.add(skyPlanets);
const stars = K.makeStars(); st.scene.add(stars);
const halo = K.makeHalo(0.5); halo.position.set(0, 135, -360); halo.rotation.set(0.32, 0.2, 0); halo.traverse((o) => { if (o.material) o.material.fog = false; }); st.scene.add(halo);
const clouds = K.makeClouds(); planet.add(clouds);
// mountains on the horizon, birds, butterflies and fish (world-ambient.js; nothing but the mountains on Low)
const amb = AMB.createAmbient({ THREE, planet, low: lowGfx, bats: HW.halloweenOn() }); let ambNight = 0; // ambNight: set by dayNight
// anonymous health counters (world-diag.js): script errors, the frame rate band, a GPU memory climb
// b-st3: the first minutes, counted (world-diag.js funnel): each step once a visit; nw = this browser's first visit
const FUN_NEW = (() => { try { const k = "arc.world.fun0"; const was = localStorage.getItem(k); if (!was) localStorage.setItem(k, String(Date.now())); return !was; } catch { return false; } })();
const funSent = new Set(); const fun = (ev) => { if (funSent.has(ev)) return; funSent.add(ev); try { if (diag && diag.funnel) diag.funnel(ev, FUN_NEW); } catch { /* fine */ } };
const diag = DIAG.createDiag({ post, renderer: st.renderer, quality: S.quality || "auto", coarse: !!st.quality.coarse, tier: K.gpuTier ? K.gpuTier() : "", cap: () => S.fpsCap || autoCap || 60, work: () => (st.work ? st.work.last : -1), where: () => (survOn ? "surv" : ringsOn ? "rings" : pokerOn ? "poker" : mineOn ? "mine" : defenseOn ? "def" : jumpOn ? "jump" : beatOn ? "beat" : mode === "island" ? "isle" : combat && combat.zone() ? "zone" : (() => { try { return landNow === "ad" ? "city" : "hub"; } catch { return "hub"; } })()), busy: () => !!(combat && combat.dangerNear && combat.dangerNear(14)), active: () => { try { return mode === "hub" && !frozen && !photo; } catch { return false; } } });
// a load that hasn't finished after 45 s says where it stopped (?world=diag errors: the step, the quality, the pixel ratio,
// whether the graphics context was lost) — a Mac stayed at 85 % for hours (2026-10-24) and nothing had been reported
let glLost = false; try { st.renderer.domElement.addEventListener("webglcontextlost", () => { glLost = true; glLostLoading(); }); } catch { /* no canvas */ }
// players still stuck on the loading screen (the owner, 2026-10-25; diag: iPhones and an Adreno 730 losing the graphics
// context while the town's shaders compile, three.js then throws "shaderSource … not a WebGLShader" and the load stops):
// lost while loading → Low graphics (fewer shaders, a smaller canvas) and one reload by itself; a second loss shows the
// watchdog's message as before
function glLostLoading() {
  const b = $("wp-loadbar"); if (!b || !b.isConnected || b.style.width === "100%") return;
  let tried = false; try { tried = !!sessionStorage.getItem("arc.gl.retry"); } catch { /* private: try once anyway */ }
  try { diag.err(`gl lost while loading at ${loadAt} · ${S.quality || "auto"}${tried ? " · again" : " · retry light"}`, "load"); } catch { /* not sent */ }
  if (tried) return;
  try { sessionStorage.setItem("arc.gl.retry", "1"); const o = JSON.parse(localStorage.getItem(SETS) || "{}"); o.quality = "low"; localStorage.setItem(SETS, JSON.stringify(o)); } catch { /* reload anyway */ }
  setTimeout(() => location.reload(), 1200);
}
// where the load waits, sent at 15 s too (the 45 s report below came from almost nobody: most leave before that)
setTimeout(() => { const b = $("wp-loadbar"); if (b && b.isConnected && b.style.width !== "100%") try { diag.err(`load slow 15s at ${loadAt} · ${S.quality || "auto"} · ${glLost ? "GL LOST" : "gl ok"} · ${document.hidden ? "hidden" : "shown"}`, "load"); } catch { /* not sent */ } }, 15000);
setTimeout(() => { const b = $("wp-loadbar"); if (b && b.isConnected && b.style.width !== "100%") try { diag.err(`load stall at ${loadAt} · ${S.quality || "auto"} · dpr ${devicePixelRatio} · ${glLost ? "GL LOST" : "gl ok"} · ${document.hidden ? "hidden" : "shown"}`, "load"); } catch { /* not sent */ } }, 45000);
fun("open"); st.on(() => { if (!funSent.has("move") && mode === "hub" && speedNow > 1.5) fun("move"); });
st.on((dt) => { try { diag.tick(dt); } catch { /* health counters must never stop the game */ } });
st.on((dt, t) => { let hub = true; try { hub = mode === "hub"; } catch { /* still loading */ } amb.root.visible = hub; if (hub) amb.tick(dt, t, -planet.position.x, -planet.position.z, ambNight, st.scene.fog && st.scene.fog.color, !!ZN.zoneAt(-planet.position.x, -planet.position.z)); });
// b-lpv (the owner's call, 2026-10-23): the Launchpad Village and the Utility Village are lands of their own past the
// town (world-lands.js), reached by the portals that stand where the shops' ring was; the plaza is open now. The town
// keeps the Dark Market's sign; the roads run from the plaza to the portals
const lands = LD.makeLands({ THREE, K, planet, T: TW, low: lowGfx, ver: VER, groundMat: (groundG.children.find((m) => m.isMesh && m.material && m.material.map) || {}).material || null, onModel: () => { if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon(); } });
planet.add(K.makePaths(lands.spokes)); planet.add(K.makeDistrictSigns(["dark"])); planet.add(K.makeDistrictTints(["dark"]));
st.on((dt, t) => { try { lands.tick(dt, t); } catch { /* a land's sign is drawing */ } });
const lamps = K.makeLamps(); planet.add(lamps);
// at night the three lamps nearest you really light what's round them (you, scammers, the walls): three point lights
// that move to whichever lamps are closest (a computer; a phone keeps the painted pools)
// the lamps' three point lights cost every lit surface on screen a little more: Ultra only (b411; Auto on a computer had them)
const lampLights = lowGfx || st.quality.coarse || postLevel !== "ultra" ? [] : [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffc27a, 0, 11, 1.7); l.castShadow = false; planet.add(l); return l; });
{ const spots = lamps.userData.spots || [], v = new THREE.Vector3(); let t = 0;
  st.on((dt) => { if (!lampLights.length || !spots.length) return; const k = typeof ambNight === "number" ? ambNight : 0;
    if (k < 0.05) { lampLights.forEach((l) => { l.intensity = 0; }); return; }
    if ((t -= dt) <= 0) { t = 0.5; v.set(-planet.position.x, 0, -planet.position.z); const near = spots.map(([x, z]) => [x, z, (x - v.x) ** 2 + (z - v.z) ** 2]).sort((a, b) => a[2] - b[2]); lampLights.forEach((l, i) => { const p = near[i]; if (p) l.position.set(p[0], 2.75, p[1]); }); }
    lampLights.forEach((l) => { l.intensity = 28 * k; }); }); }
// Halloween (world-halloween.js, 17 Oct – 2 Nov): pumpkins by the lamps and round the fountain, glowing after dark
const halloween = HW.halloweenOn(), pumpkins = halloween && !lowGfx ? HW.createPumpkins({ THREE, planet, spots: lamps.userData.spots || [], extra: Array.from({ length: 8 }, (_, i) => [Math.sin((i / 8) * Math.PI * 2 + 0.2) * 6.4, -Math.cos((i / 8) * Math.PI * 2 + 0.2) * 6.4, 1.1]) }) : null;
// rain wets the world: the ground darkens and turns glossy, puddles gather on the lawns, the halls' shells shine
const puddles = (() => { const g = new THREE.Group(); g.name = "puddles"; g.visible = false; g.userData.noBake = true; let s = 11; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.04, metalness: 0.65, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  for (let i = 0; i < 46; i++) { const a = r() * Math.PI * 2, d = K.flatR(12) + r() * 70, m = new THREE.Mesh(new THREE.CircleGeometry(0.6 + r() * 1.6, 20), mat); m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.55 + r() * 0.6, 1); m.rotation.z = r() * 6; m.position.set(Math.cos(a) * d, 0.045, Math.sin(a) * d); g.add(m); }
  return g; })();
planet.add(puddles);
let wet = false;
function setWet(on) {
  if (on === wet) return; wet = on; puddles.visible = on;
  const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map);
  if (gm) { gm.material.roughness = on ? 0.5 : 0.95; gm.material.color.setScalar(on ? 0.8 : 1); }
  setTimeout(() => { try { nightK = -1; dayNight(); } catch { /* not set up yet: dayNight runs at the start anyway */ } }, 0); // the grass darkens a touch
}
const spins = [];
let mixLod = 0; const mixV = new THREE.Vector3(), camFr = new THREE.Frustum(), camFrM = new THREE.Matrix4(), camSph = new THREE.Sphere(new THREE.Vector3(), 2.5); // the animation LOD below (the loop)
const shops = K.SHOPS.map((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); g.position.x += LD.LANDS.ut.x; g.position.z += LD.LANDS.ut.z; planet.add(g); /* b-lpv: in the Utility Village, as they stood round the plaza */ K.shadowy(g); spins.push(...g.userData.spin); return g; });
shops.forEach((g) => { const cs = LOOK.contactShadow((g.userData.radius || 3) + 2.2, 0.38); cs.position.x = g.position.x; cs.position.z = g.position.z; planet.add(cs); });
const shopG = (id) => shops.find((g) => g.userData.spec.id === id);
const portal = K.makePortal(T("Platform World")); K.placeOn(portal, K.dirOf(K.PORTAL.theta, K.PORTAL.phi)); planet.add(portal); spins.push(...portal.userData.spin);
// the way to the islands
// the Jurassic Portal (world-jurassic.js): an old stone gate with a swirl of ARCIRCLE blue and mint; GM wallets go in,
// (open to everyone since launch)
const jurGate = JG.makeJurassicGate(THREE, K, TW("Jurassic World"), { low: lowGfx });
K.placeOn(jurGate, K.dirOf(K.spreadTheta(14), 205)); planet.add(jurGate); spins.push(...jurGate.userData.spin);
// the gate's light hangs on the planet itself: inside the gate it went out whenever far culling hid the gate, and a light
// coming and going makes every lit shader in town again (on a phone a blank, half-drawn screen near the portal)
if (jurGate.userData.glow) { planet.updateMatrixWorld(true); planet.attach(jurGate.userData.glow); }
// AGENT DIMENSION's gate: the Nexus Infinity Citadel (the owner's model, models/world/agents/citadel.glb), 20 m tall, due
// east beyond the Exchange (K.AGENT_GATE: open ground, off every road out), facing the plaza. Seen from afar: a sign
// board over it that always faces you and isn't fogged (the town's name labels fade out past 42 m), a 70 m beam, a worn
// path to its door and a mark on the minimap. Walk up to it: the agent window (world-agent.js) opens.
const agentGate = new THREE.Group(); agentGate.name = "agent-gate"; agentGate.userData.radius = K.AGENT_GATE.r;
K.placeOn(agentGate, K.dirOf(K.spreadTheta(K.AGENT_GATE.theta), K.AGENT_GATE.phi)); planet.add(agentGate);
{ const R0 = K.AGENT_GATE.r + 1.5, H = K.AGENT_GATE.h;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 + 0.5, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x14203a, metalness: 0.6, roughness: 0.35, emissive: 0x0a2a55, emissiveIntensity: 0.6 })); pad.position.y = 0.15; agentGate.add(pad);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.15, 0.12, 8, 128), new THREE.MeshBasicMaterial({ color: 0x5fd3ff, toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.32; agentGate.add(rim);
  // the sign: a board drawn once (its words in the player's language), turned to the camera as it's drawn
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 288; const g = cv.getContext("2d");
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const bg = g.createLinearGradient(0, 0, 0, 288); bg.addColorStop(0, "rgba(10,24,56,.92)"); bg.addColorStop(1, "rgba(4,10,28,.92)"); rr(8, 8, 1008, 272, 44); g.fillStyle = bg; g.fill();
  g.lineWidth = 8; const bd = g.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#ffc94a"); bd.addColorStop(0.5, "#5fd3ff"); bd.addColorStop(1, "#b15cff"); g.strokeStyle = bd; g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#5fd3ff"; g.shadowBlur = 24; g.fillStyle = "#ffffff"; g.font = "900 118px Sora, 'Segoe UI', sans-serif"; g.fillText("AGENT DIMENSION", 512, 118, 960);
  g.shadowBlur = 0; g.fillStyle = "#ffe066"; g.font = "800 54px Sora, 'Segoe UI', sans-serif"; g.fillText("🚧 " + TW("Under construction"), 512, 222, 940); // not open yet (the owner's call, 2026-10-22): GM wallets only
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 5.06), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); board.position.set(0, H * 0.7, 8); board.renderOrder = 11; agentGate.add(board); agentGate.userData.sign = board;
  const qp = new THREE.Quaternion(); board.onBeforeRender = (r, sc, cam) => { agentGate.getWorldQuaternion(qp); board.quaternion.copy(qp.invert().multiply(cam.quaternion)); board.updateMatrixWorld(); };
  const beam = K.makeBeacon ? K.makeBeacon(0x5fd3ff, 70) : null; if (beam) { agentGate.add(beam); spins.push(beam.userData.spin); }
  spins.push((dt, t) => { rim.material.color.setHSL(0.55 + Math.sin(t * 0.8) * 0.04, 1, 0.6); board.position.y = H * 0.7 + Math.sin(t * 1.3) * 0.25; }); }
setTimeout(() => { try { K.gltfLoader().load(`/models/world/agents/citadel.glb${VER}`, (g) => {
  const o = g.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = K.AGENT_GATE.h / (sz.y || 1);
  o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.3 - box.min.y * k, -(box.min.z + sz.z / 2) * k);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = !lowGfx; m.receiveShadow = false; } }); agentGate.add(o); agentGate.userData.model = o; if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon();
}, undefined, (e) => console.warn("citadel", e)); } catch (e) { console.warn("citadel", e); } }, 9000); // after the town's own models: it's 1.2 MB and far off the plaza
// RAID QUEENS (world-raidq.js, the owner's design 2026-10-24): the Crimson Eternity Citadel (the owner's GLB) north-west,
// past The Last Rug (open ground ~150 m out), facing the plaza; a sign, a red beam. Walk up → a warp → the land (LD.LANDS.rq)
const RQ_TRY = /[?&]rq=1/.test(location.search); // RAID QUEENS: open to GM wallets only for now (the owner, 2026-10-25); ?rq=1 to look as a guest
const rqOn = () => { if (RQ_TRY) return true; try { const s0 = sess(); return !!(s0 && VILL.isGM(String(s0.wallet).toLowerCase())); } catch { return false; } };
const RQ_GATE = { x: -46, z: 143, h: 16, r: 8 }; let rqL = null, rqWait = null; // (rqL: the land, world-raidq.js, built the first time you go in)
const rqGate = new THREE.Group(); rqGate.name = "rq-gate"; rqGate.userData.radius = RQ_GATE.r; rqGate.position.set(RQ_GATE.x, 0, RQ_GATE.z); rqGate.rotation.y = Math.atan2(-RQ_GATE.x, -RQ_GATE.z); rqGate.visible = false; planet.add(rqGate); // (shown, and its model fetched, once rqOn(): rqGateTick)
{ const R0 = RQ_GATE.r + 2.5;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 + 0.5, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x1e1220, metalness: 0.6, roughness: 0.35, emissive: 0x4a0a22, emissiveIntensity: 0.6 })); pad.position.y = 0.15; rqGate.add(pad);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.15, 0.12, 8, 128), new THREE.MeshBasicMaterial({ color: 0xff4d8d, toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.32; rqGate.add(rim);
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 288; const g = cv.getContext("2d");
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const bg = g.createLinearGradient(0, 0, 0, 288); bg.addColorStop(0, "rgba(40,8,24,.92)"); bg.addColorStop(1, "rgba(14,4,12,.92)"); rr(8, 8, 1008, 272, 44); g.fillStyle = bg; g.fill();
  g.lineWidth = 8; const bd = g.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#ffd36a"); bd.addColorStop(0.5, "#ff4d6d"); bd.addColorStop(1, "#9fd4ff"); g.strokeStyle = bd; g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#ff4d6d"; g.shadowBlur = 24; g.fillStyle = "#ffffff"; g.font = "900 124px Sora, 'Segoe UI', sans-serif"; g.fillText("RAID QUEENS", 512, 118, 960);
  g.shadowBlur = 0; g.fillStyle = "#ffd36a"; g.font = "800 50px Sora, 'Segoe UI', sans-serif"; g.fillText(TW("Lv 100+ · A new hunting ground"), 512, 222, 940);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); board.position.set(0, RQ_GATE.h + 3.2, 0); board.renderOrder = 11; rqGate.add(board);
  const qp = new THREE.Quaternion(); board.onBeforeRender = (r, sc, cam) => { rqGate.getWorldQuaternion(qp); board.quaternion.copy(qp.invert().multiply(cam.quaternion)); board.updateMatrixWorld(); };
  const beam = K.makeBeacon ? K.makeBeacon(0xff4d8d, 60) : null; if (beam) { rqGate.add(beam); spins.push(beam.userData.spin); }
  spins.push((dt, t) => { rim.material.color.setHSL(0.94 + Math.sin(t * 0.8) * 0.03, 1, 0.62); board.position.y = RQ_GATE.h + 3.2 + Math.sin(t * 1.3) * 0.25; }); }
function rqGateModel() { if (rqGate.userData.loading) return; rqGate.userData.loading = 1; try { K.gltfLoader().load(`/models/world/raid/gate.glb${VER}`, (g) => {
  const o = g.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = RQ_GATE.h / (sz.y || 1);
  o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.3 - box.min.y * k, -(box.min.z + sz.z / 2) * k);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = !lowGfx; m.receiveShadow = false; } }); rqGate.add(o); rqGate.userData.model = o; if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon();
}, undefined, (e) => { console.warn("raid gate", e); rqGate.userData.loading = 0; }); } catch (e) { console.warn("raid gate", e); rqGate.userData.loading = 0; } }
// (1 MB, far off the plaza: after the town's own models; a GM signing in later sees it appear)
setInterval(() => { const on = rqOn(); rqGate.visible = on; if (on && performance.now() > 11000) rqGateModel(); }, 1500);
// hologram signs along the worn path to it: the three agents' faces turning in light, every ~14 m
{ const holoTex = {}, ld = new THREE.TextureLoader();
  ["aurora", "orion", "vex", "aurora", "orion"].forEach((k, i) => {
    const f = 0.28 + i * 0.13, x = AGW.x * f, z = AGW.z * f, side = i % 2 ? 1 : -1, d = Math.hypot(AGW.x, AGW.z) || 1, nx = -AGW.z / d * side * 3.2, nz = AGW.x / d * side * 3.2;
    const g = new THREE.Group(); g.name = "agent-holo"; K.placeOn(g, K.dirOf(Math.hypot(x + nx, z + nz) / (K.FLAT * K.R) * 180 / Math.PI, (Math.atan2(x + nx, -(z + nz)) * 180 / Math.PI + 360) % 360)); planet.add(g);
    const tx = holoTex[k] || (holoTex[k] = ld.load(`/images/agents/${k}-400.webp${VER}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; }));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); pl.position.y = 2.2; g.add(pl);
    const col = K.AGENTS[k].color, base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.25, 20), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); base.position.y = 0.12; g.add(base);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.4, 2.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); cone.position.y = 1.3; g.add(cone);
    spins.push((dt, t) => { pl.rotation.y = t * 0.9 + i; pl.position.y = 2.2 + Math.sin(t * 1.6 + i) * 0.12; pl.material.opacity = 0.7 + Math.sin(t * 7 + i * 2) * 0.08 + (Math.sin(t * 23 + i) > 0.97 ? -0.4 : 0); });
  }); }
const isleGate = K.makePortal(T("My Island")); K.placeOn(isleGate, K.dirOf(K.spreadTheta(14), 140)); planet.add(isleGate); spins.push(...isleGate.userData.spin);
isleGate.traverse((o) => { if (o.isMesh && o.material && o.material.emissive && !o.material.transparent) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(0x7ee0a0), 0.5); o.material.emissive.lerp(new THREE.Color(0x7ee0a0), 0.5); } });
// the plaza: the ARCIRCLE rings fountain in the middle, an arch over each district's way out, the plaza screen
const fountain = K.makeFountain(); planet.add(fountain); spins.push(...fountain.userData.spin);
// the fountain's middle tier is solid; its pool you can still wade through
const fountainCore = new THREE.Group(); fountainCore.userData.radius = 2.1; planet.add(fountainCore);
const arches = [[0, 0x39ff88], [78, 0xffc861], [227, 0x35d8d0], [296, 0xff7ad9]] /* the Research arch on its district's bearing (227°): at 212° it stood right in front of the Jurassic World portal (205°) */.map(([ph, c]) => { const a = K.makeArch(c); K.placeOn(a, K.dirOf(13.2, ph)); planet.add(a); return a; });
const screen = K.makeScreen(); K.placeOn(screen, K.dirOf(9.5, 48)); planet.add(screen);
// the fast-travel pad at the edge of the plaza
const pad = new THREE.Group(); { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffc861, emissive: 0xffc861, emissiveIntensity: 2 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.18, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07; const tag = K.label(T("Fast travel"), { accent: "#ffc861", size: 0.55 }); tag.position.y = 2.2; pad.add(ring, disc, tag); pad.userData = { radius: 1.2, spin: [(dt, t) => { ring.rotation.z = t; disc.material.opacity = 0.14 + Math.sin(t * 3) * 0.06; }] }; spins.push(...pad.userData.spin); }
K.placeOn(pad, K.dirOf(7, 90)); planet.add(pad);
// AC Defense moved to the Game Village (world-gamevillage.js): a clearing west of the plaza where the mini-games live,
// each in its own building; walk up to the AC Defense tower's door to play. The square in the middle is the arena
// the wind in the tree crowns (world-kit.js sway): still on low quality and with reduced motion
if (!lowGfx && !reduce && K.wind) st.on((dt) => { K.wind.value += dt; });
// b447 (village remaster): the looks the village takes; Low keeps the plain ones (flat tiles, still water, no contact shade)
const gvLook = { hexFloor: (m, r) => LOOK.hexFloorLook(m, { r, low: lowGfx }), pond: (m) => LOOK.pondLook(m, { low: lowGfx }) }; // (contact shade is everywhere now: installContactShade)
const gv = GV.makeGameVillage({ THREE, K, planet, T: TW, low: lowGfx, look: gvLook, compile: (o) => { try { return compileHidden([o]); } catch { return null; } } }); gv.clear(groundG);
// b447: the clearing was one flat pale green: now the town ground's patches, fine grain and drifting cloud shade, and the baked town shade
{ const gg = gv.root.getObjectByName("gv-ground"); if (gg) { LOOK.groundLook(gg.material, { low: lowGfx }); if (gshadow) gshadow.receive(gg.material); } }
st.on((dt, t) => { gv.tick(dt, t, -planet.position.x, -planet.position.z); });
// the Partner Village (world-partnervillage.js, 2026-10-22): our official partners' clearing like the Game Village, 140 m
// south-east; its first building the KAIRO Tower — walk up to it and the KAIRO Finance Hub opens (world-partner.js)
const pvil = PV.makePartnerVillage({ THREE, K, planet, T: TW, ver: VER, low: lowGfx, onModel: () => { if (labels) labels.dirty = true; farCull.rescan(); if (gshadow) gshadow.rebakeSoon(); } });
pvil.clear(groundG);
st.on((dt, t) => { pvil.tick(dt, t, -planet.position.x, -planet.position.z); });

// the Mining Village (world-minevillage.js): the ARCL Mine's tunnel in a clearing south-east of the plaza
const mv = MV.makeMineVillage({ THREE, K, planet, T: TW, low: lowGfx, look: gvLook, ver: VER, compile: (o) => { try { return compileHidden([o]); } catch { return null; } } }); mv.clear(groundG);
{ const mg = mv.root.getObjectByName("mv-ground"); if (mg) { LOOK.groundLook(mg.material, { low: lowGfx }); mg.material.color.set(0xd8b98a); if (gshadow) gshadow.receive(mg.material); } }
st.on((dt, t) => { mv.tick(dt, t, -planet.position.x, -planet.position.z); });
planet.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
const glowLight = new THREE.PointLight(0x35d8d0, 5, 7, 2); glowLight.position.set(0, 0.5, 0); st.scene.add(glowLight);
const aurora = K.makeAurora(); aurora.visible = false; st.scene.add(aurora);
const rain = K.makeRain(); rain.visible = false; st.scene.add(rain);
loadbar(0.35);

// the player: a group at the origin; the character inside it turns to face where it walks
const player = new THREE.Group(); st.scene.add(player);
// a soft dark spot right under you, so you never look as if you float (there even where sun shadows are off)
const meShadow = LOOK.contactShadow(0.85, 0.5); meShadow.position.y = 0.05; meShadow.name = "me-contact"; player.add(meShadow);
// light effects (world-vfx.js): portals, teleports, level ups, impacts, the shield
const vfx = VFX.createVfx({ THREE, st, planet, player, low: lowGfx, reduce, lite: () => { try { return liteFx; } catch { return false; } } }); // (liteFx is declared further down)
// each hunting ground's air: snow, sand, bubbles, spores, dust, embers, stars (world-weather.js)
const air = WX.createWeather({ THREE, planet, zones: RPG.ZONES, low: lowGfx, reduce });
spins.push((dt, t) => air.tick(dt, t, -planet.position.x, -planet.position.z, innerHeight));
st.on((dt) => vfx.tick(dt));
spins.push(vfx.portal(portal), vfx.portal(isleGate, { colors: [[0x2ee07a, 0x9fffd0], [0x2f86ff, 0x38e8ff]] }));
// each gate gets its frame (world-gear3d.js): two white pillars and an arch, its name lifted above it
for (const [g, c] of [[portal, 0x38e8ff], [isleGate, 0x2ee07a]]) { g.add(GEAR.gateFrame(c)); g.children.forEach((o) => { if (o.isSprite && o.position.y > 4) o.position.y = 7.6; }); }
const board = GEAR.hoverboard(); board.visible = false; player.add(board); // world-gear3d.js
// the second ride: the explorer rover (level 10); V switches between the two while riding
const rover = GEAR.rover(); rover.visible = false; player.add(rover);
// the third (level 30): a jetpack — you cruise a few metres up, Space climbs higher or comes back down; in a fight it
// keeps you low (the bosses' ground strikes must still reach you)
const jet = GEAR.jetpack(); jet.visible = false; player.add(jet);
// an airship that cruises round the far ring, high up: lights blinking, its name on the side (scenery)
const ship = GEAR.airship(); planet.add(ship); spins.push((dt, t) => { const a = t * 0.018; ship.position.set(Math.cos(a) * 140, 46 + Math.sin(t * 0.3) * 1.5, Math.sin(a) * 140); ship.rotation.y = -a; ship.userData.update(t); });
let ride = (() => { try { const v = localStorage.getItem("arc.world.ride"); return v === "rover" || v === "jet" ? v : "board"; } catch { return "board"; } })();
const rideObj = () => (ride === "rover" ? rover : ride === "jet" ? jet : board);
let jetHigh = false;
const jetOn = () => boarding && ride === "jet" && mode === "hub";
const jetAlt = () => (document.body.classList.contains("wc-fight") || (combat && combat.dangerNear && combat.dangerNear(24)) ? 0.5 : jetHigh ? 8 : 3.2); // near a boss you come down: its strikes must reach you
function switchRide() {
  if (ride === "board" && level() < 10) { toast(T("The rover opens at level {n}", { n: 10 })); return; }
  ride = ride === "board" ? "rover" : ride === "rover" && level() >= 30 ? "jet" : "board"; try { localStorage.setItem("arc.world.ride", ride); } catch { /* fine */ }
  if (boarding) { showRide(); Snd.board(); }
  toast(ride === "rover" ? T("Ride: explorer rover") : ride === "jet" ? T("Ride: jetpack · Space climbs or comes down") : T("Ride: hoverboard"));
  if (ride === "board" && level() >= 10 && level() < 30) setTimeout(() => toast(T("The jetpack opens at level {n}", { n: 30 })), 1400);
}
function showRide() { board.visible = boarding && ride === "board"; rover.visible = boarding && ride === "rover"; jet.visible = boarding && ride === "jet"; if (avatar) avatar.obj.position.y = !boarding || ride === "jet" ? 0 : ride === "rover" ? 0.84 : 0.45; }
addEventListener("keydown", (e) => { if (!worldReady) return; /* still loading */ if ((e.key === "v" || e.key === "V") && !e.repeat && !e.target.closest("input,textarea,[contenteditable]") && mode === "hub") switchRide(); });
let avatar = null, nameTag = null;
// b447: every player is drawn as a hero (world-kit.js HEROES: ARON for now); the save keeps the character it chose
const heroOf = (id) => (K.heroOf ? K.heroOf(id) : id);
// the portrait in the HP card (ART-SPEC interface: the main HUD shows your character's face)
function paintFace() { const imgs = [$("wc-face-img"), $("wp-lv-face")].filter(Boolean), id = P.char || "arc-arc"; if (!imgs.length) return; const put = () => imgs.forEach((img) => { img.src = thumbCache[id]; }); if (thumbCache[id]) { put(); return; } renderThumbsFor([id]).then(() => { if (thumbCache[id]) put(); }); }
async function setAvatar(id) {
  // an old phone's hero load that never settles (a texture that never decodes, a lost GPU context) held the loading
  // screen at 80 % "Opening the plaza…" (a Mali-T830 in diag, 2026-10-24): after 20 s you go in as the plain robot,
  // and the hero takes its place if it arrives later
  const want = K.makeCharacter(heroOf(id), VER, P.outfit || null), sw = ++avatarSwap; let late = false;
  let a = await Promise.race([want, new Promise((r) => setTimeout(() => { late = true; r(null); }, 20000))]).catch(() => null);
  if (!a) {
    a = await K.makeCharacter("bot");
    if (late) { try { diag.err(`hero load slow: ${heroOf(id)} · dpr ${devicePixelRatio} · ${glLost ? "GL LOST" : "gl ok"}`, "load"); } catch { /* no report */ } want.then((b) => { if (b && sw === avatarSwap) putAvatar(b); }).catch(() => {}); }
  }
  putAvatar(a);
}
let avatarSwap = 0;
function putAvatar(a) {
  setTimeout(paintFace, 300);
  if (avatar) player.remove(avatar.obj);
  if (a.setTint) a.setTint(P.tint || 0); // b447: the hero in your colour
  headYaw = 0; avatar = a; player.add(a.obj); a.obj.rotation.y = facing; a.obj.position.y = !boarding || ride === "jet" ? 0 : ride === "rover" ? 0.84 : 0.45;
  if (rpg) rpg.dress();
  setNameTag(); paintCrown();
}
const PLATES = { "plate-gold": ["#ffc861", "#ffe7a8"], "plate-pink": ["#ff7ad9", "#ffd1f1"], "plate-green": ["#39ff88", "#c9ffe0"], "plate-purple": ["#b48cff", "#e6d9ff"], "plate-flame": ["#ff7a2a", "#ffe0b8"] };
function setNameTag() {
  if (nameTag) { player.remove(nameTag); nameTag.material.map.dispose(); nameTag = null; }
  if (!P.name && !P.guideSeen) return; // (b-st1: a new player has no "Player" over their head before they pick a name)
  const title = BADGES.find((b) => b.id === P.badges[P.badges.length - 1]);
  const pl = PLATES[(P.style || {}).plate] || ["#35d8d0", "#eef3f7"];
  const s = sess(), gm = !!(s && VILL.isGM(s.wallet)); // the GM wallet wears [GM] in gold
  nameTag = K.label((P.crewTag ? `[${P.crewTag}] ` : "") + (P.name || W("Player")), { accent: pl[0], color: pl[1], size: 0.42, sub: (quests && quests.title()) || (title ? T(title.title) : ""), pre: gm ? "[GM]" : "" }); nameTag.position.y = 3.15; player.add(nameTag);
}
// the hoverboard's light trail (a bought colour, or a faint default)
const TRAILS = { "trail-cyan": 0x35d8d0, "trail-gold": 0xffc861, "trail-pink": 0xff7ad9, "trail-rainbow": 0xff4d6d }; // the rainbow one cycles (see the loop)
const trail = (() => {
  const n = 40, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 2 * 3), alpha = new Float32Array(n * 2);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("a", new THREE.BufferAttribute(alpha, 1));
  const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color(0x9fd8ff) }, k: { value: 0.35 } },
    vertexShader: "attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 c; uniform float k; varying float vA; void main(){ gl_FragColor = vec4(c, vA * k); }" });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false;
  const pts = []; // world-group positions, newest first
  return { mesh, mat, update(on, pp, spd) {
    if (on && spd > 2) pts.unshift(pp.clone()); else if (pts.length) pts.pop();
    if (pts.length > n) pts.length = n;
    mesh.visible = pts.length > 1;
    for (let i = 0; i < n; i++) {
      const p = pts[Math.min(i, pts.length - 1)] || pp, q = pts[Math.min(i + 1, pts.length - 1)] || p;
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, wdt = 0.28 * (1 - i / n);
      pos.set([p.x - dz / l * wdt, p.y + 0.3, p.z + dx / l * wdt, p.x + dz / l * wdt, p.y + 0.3, p.z - dx / l * wdt], i * 6);
      alpha[i * 2] = alpha[i * 2 + 1] = i < pts.length ? 1 - i / n : 0;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.a.needsUpdate = true;
  } };
})();
planet.add(trail.mesh);
function paintTrail() { const c = TRAILS[(P.style || {}).trail]; trail.mat.uniforms.c.value.set(c || 0x9fd8ff); trail.mat.uniforms.k.value = c ? 0.85 : 0.35; }

// ---- state that the rest of the file shares (declared before anything can call into it) ----
const cards = [], mixers = [], town = [], lockedStages = [], coinBuildings = [], smokes = [], qOrbs = [];
let headYaw = 0; const tmpLook = new THREE.Vector3(), tmp3t = new THREE.Vector3(); // your head turning toward who is close (the loop)
let coinData = null, lastSeen = 0, myCoins = [], labels = null, npc = null, board3 = null, arcStats = null;
let zoneRoot = null; // the hunting grounds' group (the camera looks through their tall props)
const folk = []; // the town's walking ARC Bots
let stage = null; // ARCIA's stage (makeStage)
// ARCIA's stage in front of her studio: a low platform, a truss with two speakers and four moving spotlights, and a
// screen with the track that's playing. While the music plays she dances; on a concert night the lights go all out.
function makeStage(g, ac) {
  const sg = new THREE.Group(); sg.name = "stage"; g.add(sg);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...o });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 2.2), M(0x2a3446)); deck.position.set(0, 0.18, -0.35); deck.receiveShadow = true; deck.castShadow = true;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.05, 0.05), M(0xff7ad9, { emissive: 0xff7ad9, emissiveIntensity: 1.8 })); edge.position.set(0, 0.34, 0.76);
  const posts = [-1.6, 1.6].map((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.12), M(0x8a96a8, { metalness: 0.7 })); p.position.set(x, 1.6, -1.35); return p; });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.14), M(0x8a96a8, { metalness: 0.7 })); beam.position.set(0, 3.2, -1.35);
  const spk = [-1.95, 1.95].map((x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.5), M(0x1a1f2a)); b.position.set(x, 0.55, -0.6); const cone = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), M(0x0b0f16, { emissive: 0x35d8d0, emissiveIntensity: 0.4 })); cone.position.set(0, 0.15, 0.26); b.add(cone); return b; });
  // the screen: the track that's playing
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 160; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.81), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); screen.position.set(0, 2.55, -1.3);
  let shown = "";
  const paintScreen = (id) => { if (id === shown) return; shown = id; const c = cv.getContext("2d"), t = (MUS.TITLES || {})[id];
    const gr = c.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, "#1a0f2e"); gr.addColorStop(1, "#0b1a2e"); c.fillStyle = gr; c.fillRect(0, 0, 512, 160);
    c.fillStyle = "#ff7ad9"; c.font = "800 22px Sora, system-ui, sans-serif"; c.fillText(t ? "NOW PLAYING" : "ARCIA STAGE", 24, 40);
    c.fillStyle = "#ffffff"; c.font = "800 44px Sora, system-ui, sans-serif"; c.fillText(t ? t[0] : "♪", 24, 96);
    c.fillStyle = "#9fb1c6"; c.font = "600 24px Sora, system-ui, sans-serif"; c.fillText(t ? t[1] : "", 24, 134); tex.needsUpdate = true; };
  paintScreen("");
  // four spotlights hanging from the truss: soft cones that sweep (additive, a shader that fades along the cone)
  const coneMat = (c) => new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(c) }, uK: { value: 0.3 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: "varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uC; uniform float uK; varying float vY; void main(){ gl_FragColor = vec4(uC, pow(vY, 1.6) * uK); }" });
  const coneG = new THREE.ConeGeometry(0.9, 3.6, 20, 1, true); coneG.translate(0, -1.8, 0);
  const spots = [0xff7ad9, 0x35d8d0, 0xffc861, 0xb48cff].map((c, i) => { const s = new THREE.Group(); s.position.set(-1.2 + i * 0.8, 3.1, -1.25); const m = new THREE.Mesh(coneG, coneMat(c)); s.add(m); sg.add(s); return { s, m, ph: i * 1.7 }; });
  sg.add(deck, edge, ...posts, beam, ...spk, screen);
  ac.obj.position.y = 0.36; // ARCIA stands on it
  let dance = 0, danceT = 0;
  return { tick(dt, t) {
    const st0 = music.state ? music.state() : null, playing = !!(st0 && st0.playing && !st0.paused), concert = concertOn(), b = music.level ? music.level() : 0;
    paintScreen(playing ? st0.playing : "");
    const night = (() => { try { return ambNight; } catch { return 0; } })(), k = (concert ? 1 : 0.35 + night * 0.4) * (0.6 + b * 0.8);
    spots.forEach((p, i) => { p.s.rotation.z = Math.sin(t * (concert ? 1.6 : 0.6) + p.ph) * 0.55; p.s.rotation.x = 0.35 + Math.sin(t * (concert ? 1.1 : 0.4) + p.ph * 1.3) * 0.25; p.m.material.uniforms.uK.value = k * 0.35; });
    edge.material.emissiveIntensity = 1.2 + b * 2.4;
    // she dances while the music plays: a move, a breath, the next move
    if (playing) { danceT -= dt; if (danceT <= 0 && !ac.busy?.()) { danceT = 2.2 + Math.random() * 1.6; ac.play(["emote-yes", "celebrate", "interact-right"][dance++ % 3], { once: true }); } }
  } };
}
let facing = Math.PI, boarding = false, worldReady = false;
const fighters = [];
const floorU = []; st.on((dt) => { for (const u of floorU) u.uFt.value += dt; }); // the grounds' floors (their seams pulse)

// ---- the kit models (Kenney + Quaternius, CC0) ----
let kit = await Promise.race([kitP, new Promise((r) => setTimeout(() => r(null), 12000))]);
// b443: the far grounds' creatures load once you walk 60 m out of the plaza, or 90 s in
{ const t0 = performance.now(), mt = setInterval(() => { const k = kit; if (!k || !k.loadMonsters) return; if (Math.hypot(planet.position.x, planet.position.z) > 60 || performance.now() - t0 > 90000) { clearInterval(mt); k.loadMonsters(); } }, 2000); }
loadbar(0.75);
async function dressWorld(kit) {
  if (!kit) return;
  if (!lowGfx) ENV.unifyPalette(kit.props); // one palette across the asset packs (world-env.js)
  shops.forEach((g) => K.decorate(g, kit));
  shops.forEach(boxOf);
  K.makeTown(kit).forEach((g) => { planet.add(g); town.push(g); spins.push(...g.userData.spin); });
  // the hunting grounds (world-zones.js)
  const zs = (zoneRoot = null, ZN.makeZones({ THREE, K, planet, kit, T, low: lowGfx, onBuilt: () => { if (gshadow) gshadow.rebakeSoon(); farCull.rescan(); } }));
  zoneRoot = zs.root;
  // b-st3: on a computer the far grounds are built now, behind the loading screen, so their shaders are compiled with the
  // rest (st.warm) instead of on the way in; a phone keeps building each as you come near (memory)
  // (2026-10-24: off again — since this went in, computers stopped finishing the load (diag: 50 opened, 18 got in) and a
  // Mac stayed at 85 % for hours: every ground and its shaders at once was too much for the GPU. They build on approach.)
  if (FAR_PREBUILD && !st.quality.coarse && !lowGfx) try { zs.buildAll(); } catch (e) { console.warn("far grounds", e); }
  // each ground's own floor (world-env.js): cracked rock, ripples, moss, paving, ice, glowing seams
  if (!lowGfx) zs.root.children.forEach((g) => { const zn = g.userData && g.userData.zone, gm = g.children.find((c) => c.name === "zone-ground"); if (zn && gm) floorU.push(ENV.zoneFloor(gm.material, zn, { lite: st.quality.coarse })); });
  zs.root.traverse((o) => { if (o.name !== "zone-ground") return; if (!lowGfx) LOOK.stoneGrain(o.material); if (gshadow) gshadow.receive(o.material); }); // b447: the grounds' floors get the plaza's grain too
  spins.push((dt, t) => zs.update(dt, t)); arches.push(...(zs.gates || [])); // (these two had slipped into the comment above)
  // chimneys smoke: the Launchpad's factory and the town's tall chimneys
  [shopG("launch"), ...town.filter((g) => /^town:chimney/.test(g.name))].forEach((g) => {
    if (!g) return; const tw = /^town:/.test(g.name); smokes.push(K.smoke(g, tw ? new THREE.Vector3(0, 5.6 * (g.children[0] ? g.children[0].scale.x : 1), 0) : new THREE.Vector3(-1.5, 6.6, -0.9)));
  });
  // scammers: the first one not yet beaten roams; the rest wait in cages
  K.SCAMMERS.forEach((spec) => {
    if (P.beaten.includes(spec.id)) return;
    const g = new THREE.Group(); g.name = "scam:" + spec.id;
    // the robots load after the town (world-kit.js), so a scammer may get its body a moment later
    const body = () => { const e = K.enemy(kit, spec.model); if (!e) return null; e.obj.scale.setScalar(spec.scale); e.obj.position.y = spec.y; if (spec.tint) e.obj.traverse((m) => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(spec.tint), 0.55); } }); g.add(e.obj); mixers.push(e.mixer); e.play(P.beaten.includes(spec.id) ? "TurnOff" : "Idle"); g.userData.enemy = e; return e; };
    const e = body(); if (!e && kit.enemiesReady) kit.enemiesReady.then(body);
    const sign = K.label(spec.sign, { accent: "#ff4d6d", color: "#ffc861", size: 0.6 }); sign.position.y = spec.y + 1.9 * spec.scale + 0.6; g.add(sign);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 40), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.userData = { spec, enemy: e || g.userData.enemy || null, radius: 1.3 + spec.scale * 0.5, ring };
    K.placeOn(g, K.dirOf(spec.theta, spec.phi)); planet.add(g); fighters.push(g);
  });
  arrangeFighters();
  K.CARDS.forEach(([th, ph], i) => {
    const id = "c" + i; if (P.cards.includes(id)) return;
    const g = K.makeCard(kit); K.placeOn(g, K.dirOf(th, ph)); planet.add(g); spins.push(...g.userData.spin); g.userData.id = id; cards.push(g);
  });
  // ARCIA herself, in front of her studio
  const ac = await K.makeCharacter("female-e", VER).catch(() => null);
  if (ac) {
    const g = new THREE.Group(); g.add(ac.obj); const bub = K.bubble(T("Hi! I'm ARCIA. Ask me anything.")); g.add(bub);
    K.placeOn(g, K.dirOf(K.spreadTheta(16), 296)); planet.add(g); g.userData = { radius: 0.9, ac, bub, line: 0 }; npc = g; mixers.push(ac.mixer);
    try { stage = makeStage(g, ac); } catch { stage = null; }
  }
  // town folk: a few ARC Bots walking the ring between the fountain and the halls, stopping now and then to look
  // round or wave (none on Low; three on a phone, six elsewhere). They're scenery: they don't block you or talk.
  if (!lowGfx) {
    const ids = ["arc-neo", "arc-luna", "arc-kai", "arc-pixi", "arc-orbit", "arc-mint"], N = st.quality.coarse ? 3 : 6;
    for (let i = 0; i < N; i++) K.makeCharacter(ids[i], VER).then((c) => {
      if (!c) return; const g = new THREE.Group(); g.name = "folk"; g.add(c.obj); planet.add(g); if (c.mixer) mixers.push(c.mixer);
      folk.push({ g, c, r: 9.2 + (i % 3) * 1.1, a: (i / N) * Math.PI * 2 + Math.random() * 0.4, dir: i % 2 ? 1 : -1, sp: 1.0 + Math.random() * 0.5, wait: 1 + Math.random() * 4, walkT: 0, anim: "" });
    }).catch(() => {});
  }
  // the Exchange's live price board
  const ex = shopG("swap");
  if (ex) { board3 = K.makeBoard(3.4, 1.5); board3.position.set(0, 1.4, 3.35); board3.rotation.x = -0.15; ex.add(board3); paintBoard(); }
  if (coinData) buildCoinCity(coinData);
  if (worldReady) { paintHud(); paintQuests(); }
  if (labels) labels.dirty = true;
}
// a building's footprint (x/z half sizes in its own frame), so walls stop you where they are, not on a circle
function boxOf(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), box = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4();
  g.traverse((o) => { if (!o.isMesh || o.isSprite || !o.visible || o.material.transparent || !o.geometry) return; let p = o, vis = true; while (p && p !== g) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); if (b.max.y > 0.45) box.union(b); });
  if (box.isEmpty()) return;
  g.userData.box = { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };
}
function arrangeFighters() {
  // stage n stays caged until stage n-1 is beaten
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  fighters.forEach((g) => {
    const live = next && g.userData.spec.id === next.id;
    g.userData.live = live;
    if (!live && !g.userData.cage) {
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.6, 6, 1, true), new THREE.MeshBasicMaterial({ color: K.C.scam, wireframe: true, transparent: true, opacity: 0.35 }));
      cage.position.y = 1.8; g.add(cage); g.userData.cage = cage;
      const tag = K.label(T("Stage {n} · locked", { n: g.userData.spec.stage }), { accent: "#ff4d6d", color: "#ffd7de", size: 0.7 }); tag.position.y = 4.9; g.add(tag); g.userData.lockTag = tag;
      g.userData.radius = 2.5;
      if (g.userData.enemy) { const a = g.userData.enemy.play("TurnOff", { once: true }); if (a) a.time = a.getClip().duration; }
    }
    if (live && g.userData.cage) {
      g.remove(g.userData.cage); g.remove(g.userData.lockTag); g.userData.cage = null; g.userData.radius = 1.3 + g.userData.spec.scale * 0.5;
      if (g.userData.enemy) g.userData.enemy.play("Idle");
    }
  });
  lockedStages.splice(0, lockedStages.length, ...fighters.filter((g) => !g.userData.live));
  if (labels) labels.dirty = true;
}
if (kit) await dressWorld(kit); else kitP.then((k) => { if (k) { kit = k; dressWorld(k); } }); // a slow connection: the town arrives when it arrives

// ---------------- input ----------------
const keys = new Set();
let hubEl = null; // the menu (built further down)
let inboxDot = 0; // mail waiting (world-inbox.js): a dot on the Menu tile
let chatDot = 0, chatUI = null; // unread messages and friend requests (world-chat.js), and the chat panel
let joy = null, look = null, camYaw = 0, camPitch = 0.05, frozen = false, flying = null, lastLook = 0, runToggle = false, photo = false;
let inK = 0; // 0 outside … 1 indoors (the overhead indoor camera)
let camDist = coarse ? 1.7 : 1, /* b447: phones start further out (the owner's pick: more of the town round you); pinch still zooms 0.6–1.9 */ camGoal = camDist, camZoom = 1, shakeT = 0, lastSpeed = 0, lookInit = false; const camLookS = new THREE.Vector3(), lockV = new THREE.Vector3(); // the camera's smoothed aim, its rattle clock; the locked target
const typing = (e) => /input|textarea|select/i.test(e.target.tagName);
/* a window is on screen (the Forge, the wardrobe, a shop…): Esc closes it rather than swapping it for the menu */
const dialogUp = () => [...document.querySelectorAll('[role="dialog"]')].some((d) => d !== hubEl && !d.hidden && d.getClientRects().length > 0 && getComputedStyle(d).visibility !== "hidden");
const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"];
addEventListener("keydown", (e) => {
  if (typing(e)) return;
  if (mode === "island" && !photo && island.keyDown(e)) return;
  const k = String(e.key || "").toLowerCase();
  if (k === "escape") { if (photo) setPhoto(false); else if (hubEl && !hubEl.hidden) closeHub(true); else if (hubEl && !frozen && worldReady && !dialogUp()) openHub(); else closeAll(); return; }
  if (k === "p" && (!frozen || photo)) { setPhoto(!photo); return; }
  if (frozen) return;
  if (k === "e" || k === "enter") { if (near) { e.preventDefault(); enter(near); } return; }
  if (k === "m") { openMap(); return; }
  if (k === "i" && rpg) { closeAll(); rpg.show("inv"); return; }
  if (k === "l" && rpg && quests) { closeAll(); rpg.show("log"); return; }
  if (k === "h") { openHelp(); return; }
  // the dock's keys: B bag, C forge, N pets, U build, in town only (B stays the island's build key there; U on a visited island would leave it)
  if (mode === "hub" && !e.repeat && (k === "b" || k === "c" || k === "n")) { if (k === "n") $("wp-dk-pet").click(); else { const d = $(k === "b" ? "wp-dk-bag" : "wp-dk-craft"); if (d) d.click(); } return; }
  if (k === "u" && !e.repeat && mode === "hub") { const d = $("wp-dk-build"); if (d) d.click(); return; }
  if (combat && mode === "hub" && combat.keyDown(k, e.repeat)) { e.preventDefault(); return; }
  if (k === "f") { setBoard(!boarding); return; }
  if (k === "1") { emote("emote-yes"); return; }
  if (k === "2") { emote("emote-no"); return; }
  if (k === "t") { openWheel(); return; }
  if (k === " ") { e.preventDefault(); jumpDown = true; jump(); return; }
  if (MOVE_KEYS.includes(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => { keys.delete(String(e.key || "").toLowerCase()); if (e.key === " ") jumpDown = false; if (combat) combat.keyUp(String(e.key || "").toLowerCase()); });
addEventListener("blur", () => { if (combat) combat.keyUp("j", true); });
// a game controller (the standard layout): left stick moves (pushed all the way runs), right stick looks, A jumps, X attacks,
// B dodges, Y casts the skill, LB / RB change it, LT / RT drink health / mana, Start opens the map, View the log, D-pad up the emotes
const gpad = { on: false, x: 0, y: 0, run: false, prev: [] };
addEventListener("gamepadconnected", () => toast(T("Controller connected")));
function padTick(dt) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected && g.mapping === "standard") : null;
  if (!gp) { gpad.on = false; gpad.x = gpad.y = 0; return; }
  gpad.on = true;
  const dz = (v) => (Math.abs(v || 0) < 0.18 ? 0 : v), btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = (i) => btn(i) && !gpad.prev[i];
  gpad.x = frozen && !jurOn ? 0 : dz(gp.axes[0]); gpad.y = frozen && !jurOn ? 0 : -dz(gp.axes[1]); if (gpad.x || gpad.y || gp.buttons.some((b) => b && b.pressed)) lastInput = performance.now(); gpad.run = Math.hypot(gpad.x, gpad.y) > 0.92 || btn(10);
  const rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
  if ((!frozen || jurOn) && (rx || ry)) { camYaw -= rx * dt * 2.6 * S.sens; camPitch = THREE.MathUtils.clamp(camPitch + ry * dt * 1.4 * S.sens, -0.3, 0.75); lastLook = performance.now(); }
  if (edge(9)) { if (!mapEl.hidden) closeMap(); else if (!frozen) openMap(); }
  if (edge(1) && frozen) closeAll();
  if (!btn(0) && gpad.prev[0]) jumpDown = false; // A let go: a jump still going up is cut short
  if (!frozen || jurOn) {
    if (edge(0)) { jumpDown = true; jump(); }
    if (combat && mode === "hub") { if (edge(2)) combat.keyDown("j"); if (!btn(2) && gpad.prev[2]) combat.keyUp("j"); if (edge(1)) combat.keyDown("k"); if (edge(3)) combat.keyDown("z"); if (edge(4) || edge(5)) combat.keyDown("q"); if (edge(6)) combat.keyDown("4"); if (edge(7)) combat.keyDown("5"); }
    if (edge(8) && rpg && quests) { closeAll(); rpg.show("log"); }
    if (edge(12)) openWheel();
    if (edge(13) && near) enter(near);
  }
  gpad.prev = gp.buttons.map((b) => b.pressed);
}
addEventListener("blur", () => { keys.clear(); jumpDown = false; });
const joyEl = $("wp-joy"), knob = joyEl.querySelector("i");
let downAt = null, hoverXY = null, pinch = null;
const JOYMAX = document.documentElement.classList.contains("wp-pcphone") ? 118 : 56;
let joyMax = JOYMAX, joyK = 1; const TOUCHK = JOYMAX / 56; // the phone layout is scaled down ~0.4, so tap slop and the pinch dead zone grow with it
// the phone frame on a computer (b416): the mouse works the stick like a thumb (press on the left half and drag)
const mouseStick = window.__arcFrame === "mobile";
const touches = new Map(); // non-stick touches: two of them pinch to zoom
// the stick is fixed (players asked): it starts only near its resting ring at the bottom left, the base stays put, and
// the rest of the screen is free to look around and pinch-zoom with two fingers. The mouse-stick frame keeps the old
// float-anywhere-on-the-left behaviour
const joyRest = document.querySelector(".wp-joyrest");
const restAt = () => { const r = joyRest && joyRest.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width * 0.75, JOYMAX * 1.3) } : null; };
const onStick = (e) => { if (e.pointerType === "mouse") return mouseStick && e.clientX < innerWidth * 0.5; const c = restAt(); return c ? Math.hypot(e.clientX - c.x, e.clientY - c.y) < c.r : e.clientX < innerWidth * 0.5; };
// let go of everything (a finger lifted where the browser didn't tell us, the app went to the background): the stick
// used to stay held and the character kept running until another touch
function dropInput() { joy = null; joyEl.classList.remove("on"); knob.style.transform = ""; look = null; pinch = null; touches.clear(); downAt = null; }
cv.addEventListener("contextmenu", (e) => { if (mode === "island") e.preventDefault(); });
cv.addEventListener("pointerdown", (e) => {
  if (frozen && !photo && !jurOn) return; // (Jurassic World keeps the town frozen but plays on the town's stick, look and pinch)
  downAt = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }; // event time: a slow frame in between does not turn a tap into a hold
  cv.setPointerCapture(e.pointerId);
  // a second finger close to a stick that hasn't moved yet means a pinch; one far away (the right thumb going for the
  // attack button while the left one rests on the stick) is not — that used to zoom the camera in mid-fight
  if (e.pointerType === "touch" && joy && !joy.fixed && e.pointerId !== joy.id && Math.hypot(joy.dx, joy.dy) < 0.2 && Math.hypot(e.clientX - joy.cx, e.clientY - joy.cy) < innerWidth * 0.42) {
    touches.set(joy.id, { x: joy.cx, y: joy.cy }); joy = null; joyEl.classList.remove("on"); knob.style.transform = "";
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...touches.values()];
    pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cd: camGoal, live: false }; look = null; return;
  }
  const willJoy = !photo && (e.pointerType !== "mouse" || mouseStick) && onStick(e) && !joy;
  if (e.pointerType === "touch" && !willJoy) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // two fingers off the stick are a pinch however far apart they start (b447: zoomed all the way in, the fingers are
    // spread wide, and a pinch starting wider than 60 % of the screen was taken for a look, so you couldn't zoom back out)
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cd: camGoal, live: false }; look = null; return; }
    if (touches.size > 2) touches.delete(e.pointerId);
  }
  if (willJoy) {
    const c = e.pointerType === "touch" ? restAt() : null, bx = c ? c.x : e.clientX, by = c ? c.y : e.clientY; // touch: the base sits on its ring
    joy = { id: e.pointerId, x: bx, y: by, cx: e.clientX, cy: e.clientY, t: e.timeStamp, dx: 0, dy: 0, fixed: !!c };
    joyEl.style.left = bx + "px"; joyEl.style.top = by + "px"; joyEl.classList.add("on"); knob.style.transform = "";
    if (c) { let dx = e.clientX - bx, dy = e.clientY - by; const m = Math.hypot(dx, dy); if (m > joyMax) { dx *= joyMax / m; dy *= joyMax / m; } joy.dx = dx / joyMax; joy.dy = dy / joyMax; knob.style.transform = `translate(${dx / joyK}px,${dy / joyK}px)`; }
  } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
cv.addEventListener("pointermove", (e) => {
  if (touches.has(e.pointerId)) { touches.get(e.pointerId).x = e.clientX; touches.get(e.pointerId).y = e.clientY; }
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (!pinch.live && Math.abs(d - pinch.d) < 18 * TOUCHK) return; // a dead zone: fingers resting still don't zoom
    if (!pinch.live) { pinch.live = true; pinch.d = d; pinch.cd = camGoal; }
    camGoal = THREE.MathUtils.clamp(pinch.cd * pinch.d / Math.max(20, d), 0.6, mode === "island" ? 3 : 1.9); return;
  }
  if (e.pointerType === "mouse" && mode === "island") { hoverXY = { x: e.clientX, y: e.clientY }; if (!look) island.hover(e.clientX, e.clientY); }
  if (joy && e.pointerId === joy.id) {
    joy.cx = e.clientX; joy.cy = e.clientY;
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const m = Math.hypot(dx, dy), max = joyMax;
    if (m > max && joy.fixed) { dx *= max / m; dy *= max / m; } // the fixed base doesn't move: the knob stops at the rim
    else if (m > max) { const k = (m - max) / m; joy.x = Math.min(joy.x + dx * k, innerWidth * 0.5); joy.y += dy * k; joyEl.style.left = joy.x + "px"; joyEl.style.top = joy.y + "px"; dx *= max / m; dy *= max / m; } // past the rim the base follows the thumb (no dead centre to cross on a turn)
    joy.dx = dx / max; joy.dy = dy / max; knob.style.transform = `translate(${dx / joyK}px,${dy / joyK}px)`;
  } else if (look && e.pointerId === look.id) {
    camYaw -= (e.clientX - look.x) * 0.006 * S.sens;
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - look.y) * 0.004 * S.sens, -0.3, mode === "island" && island.building() ? 1.4 : 0.75);
    look.x = e.clientX; look.y = e.clientY; lastLook = performance.now();
  }
});
const lift = (e) => {
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
  // a short tap without a drag is a build action on your island
  if (e.type === "pointerup" && downAt && downAt.id === e.pointerId && mode === "island" && island.building() && !frozen && e.timeStamp - downAt.t < 450 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 9 * TOUCHK) island.tap(e);
  downAt = null;
  if (joy && e.pointerId === joy.id) { joy = null; joyEl.classList.remove("on"); }
  if (look && e.pointerId === look.id) look = null;
};
cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift); cv.addEventListener("lostpointercapture", lift);
// no finger left on the screen at all, or the page hidden / unfocused: nothing can still be held
addEventListener("touchend", (e) => { if (!e.touches.length) dropInput(); }, { passive: true }); addEventListener("touchcancel", (e) => { if (!e.touches.length) dropInput(); }, { passive: true });
addEventListener("blur", dropInput); document.addEventListener("visibilitychange", () => { if (document.hidden) dropInput(); });
cv.addEventListener("wheel", (e) => { camGoal = THREE.MathUtils.clamp(camGoal + e.deltaY * 0.0012, 0.6, mode === "island" ? 3 : 1.9); }, { passive: true });
// the jump button: pressed jumps, let go early cuts the jump short (a keyboard click on it is a full jump)
{ const jb = $("wp-act-jump"), up = () => { jumpDown = false; };
  jb.addEventListener("pointerdown", (e) => { try { jb.setPointerCapture(e.pointerId); } catch { /* fine */ } jumpDown = true; jump(); });
  jb.addEventListener("pointerup", up); jb.addEventListener("pointercancel", up); jb.addEventListener("click", (e) => { if (!e.detail) { jump(); jumpHeld = false; } }); }
$("wp-act-run").addEventListener("click", (e) => { runToggle = !runToggle; e.currentTarget.setAttribute("aria-pressed", String(runToggle)); });
// the emote wheel: T, or the wave button on a phone
const EMOTES = [["emote-yes", "Wave", "✋"], ["emote-no", "No", "✕"], ["sit", "Sit", "◡"], ["interact-right", "Point", "➚"], ["pick-up", "Pick up", "⇩"], ["die", "Faint", "✶"], ["cheer", "Cheer", "★"], ["dance", "Dance", "♪"]];
const wheel = document.createElement("div"); wheel.className = "wp-wheel"; wheel.hidden = true; wheel.setAttribute("data-no-i18n", "");
// eight fixed lines to say (others see them over your figure for a minute; no free text, so nothing to moderate)
const SAY = ["Hi!", "Nice hit!", "Help!", "Raid now?", "Follow me", "Thanks!", "GG", "Scan before you buy"];
wheel.innerHTML = EMOTES.map(([a, n, g], i) => `<button type="button" data-e="${a}" style="--i:${i}"><b>${ICONS.GLYPH[g] ? ICONS.icon(ICONS.GLYPH[g], 22) : g}</b><span>${esc(n.includes(" ") ? T(n) : W(n))}</span></button>`).join("") +
  `<div class="wp-say" role="group" aria-label="${esc(W("Say"))}">${SAY.map((s, i) => `<button type="button" data-say="${i}">${esc(s.includes(" ") || s.length > 4 ? T(s) : W(s))}</button>`).join("")}<button type="button" class="wp-say-inv" data-invite>${esc(T("Invite a friend"))}</button></div>`;
document.body.appendChild(wheel);
function openWheel() { if (frozen || !grounded) return; wheel.hidden = !wheel.hidden; }
wheel.addEventListener("click", (e) => {
  const sb = e.target.closest("button[data-say]"); if (sb) { wheel.hidden = true; say(+sb.dataset.say); return; }
  if (e.target.closest("[data-invite]")) { wheel.hidden = true; invite(); return; }
  const b = e.target.closest("button[data-e]"); wheel.hidden = true; if (b) emote(b.dataset.e);
});
let said = null, sayBub = null, sayPingAt = 0;
function sayBubble(txt, ms = 4500) {
  if (sayBub) { player.remove(sayBub); sayBub.material.map && sayBub.material.map.dispose(); }
  sayBub = K.label(txt, { accent: "#9fffd0", size: 0.5 }); sayBub.position.y = 2.75; player.add(sayBub); const mine = sayBub;
  setTimeout(() => { if (sayBub === mine) { player.remove(mine); sayBub = null; } }, ms);
}
function say(i) {
  if (!SAY[i]) return;
  sayBubble(SAY[i].includes(" ") || SAY[i].length > 4 ? T(SAY[i]) : W(SAY[i]));
  if (avatar && grounded) avatar.play("emote-yes", { once: true });
  said = { s: i, at: Date.now(), sent: false };
  if (Date.now() - sayPingAt > 15000) { sayPingAt = Date.now(); ping(); } // others see it with the next ping at the latest
}
// play together: a link with your wanderer tag; whoever opens it sees you as a friend (and you them), and near each other you both get +10% XP
const myTag = SOC.tagOf(vid);
const together = () => !!(ghosts && ghosts.palNear && ghosts.palNear(20));
// a hunting party: you and up to three friends, kept by the server (world-party.js, api/_world-rank.mjs: the leader invites
// friends from the chat's Friends tab or their profile card). Their figures show their HP and where they are; with one
// of them within 30 m, knock-outs give +15% XP (instead of the +10% for a friend nearby)
const PARTY = "arc.world.party";
const partyUI = () => chatUI && chatUI.party;
const partyWs = () => { const p = partyUI(); return p ? p.others() : []; };
const inParty = (w) => { const p = partyUI(); return !!p && p.inParty(w); };
const partyNear = (r = 30) => { const party = partyWs(); if (!party.length || !ghosts || mode !== "hub") return false; const me0 = here(new THREE.Vector3()); return ghosts.named().some((g) => inParty(g.wallet) && Math.hypot(g.x - me0.x, g.z - me0.z) < r); };
const partyEl = document.createElement("div"); partyEl.className = "wp-party"; partyEl.id = "wp-party"; partyEl.hidden = true; partyEl.setAttribute("data-no-i18n", ""); partyEl.setAttribute("aria-label", T("Party")); (document.querySelector(".wp-hud-l") || document.body).appendChild(partyEl); // under the quest list
let partyNames = null, partyHtml = ""; // the names read once; the strip rewritten only when its HTML changes
function paintParty() {
  if (document.hidden) return;
  const party = partyWs();
  if (!party.length || mode !== "hub") { partyEl.hidden = true; partyHtml = ""; return; }
  const me0 = here(new THREE.Vector3()), seen = ghosts ? ghosts.named() : [], names = partyNames || (partyNames = (() => { try { return JSON.parse(localStorage.getItem(PARTY + ".n") || "{}"); } catch { return {}; } })());
  partyEl.hidden = false; let named = false;
  const html = `<b>${esc(T("Party"))}${partyNear() ? ` <em>${esc(T("+15% XP"))}</em>` : ""}</b>` + party.map((w) => { const g = seen.find((x) => String(x.wallet).toLowerCase() === w), nm = (g && g.name) || names[w] || partyUI().nameOf(w) || w.slice(0, 6) + "…";
    if (g && names[w] !== g.name) { names[w] = g.name; named = true; }
    const d = g ? Math.round(Math.hypot(g.x - me0.x, g.z - me0.z)) : null, zn = g && g.zn ? (RPG.ZONES.find((z) => z.id === g.zn) || {}).name : "";
    return `<div class="${g ? "" : "away"}"><span>${esc(nm)}${g ? ` <small>Lv ${g.lv}</small>` : ""}</span>${g && g.h != null ? `<i><u style="width:${g.h}%"></u></i>` : ""}<small>${g ? (d < 30 ? esc(T("{n} m away", { n: d })) : zn ? esc(zn) : esc(T("{n} m away", { n: d }))) : esc(T("Not in the world"))}</small></div>`; }).join("");
  if (html !== partyHtml) { partyHtml = html; partyEl.innerHTML = html; }
  if (named) try { localStorage.setItem(PARTY + ".n", JSON.stringify(names)); } catch { /* private */ }
}
{ const c = document.createElement("div"); c.className = "wp-together"; c.id = "wp-together"; c.hidden = true; c.setAttribute("role", "status"); c.textContent = T("With a friend · +10% XP"); document.body.appendChild(c); }
{ const w = (new URLSearchParams(location.search).get("with") || "").toLowerCase(); if (/^[0-9a-z]{7}$/.test(w) && w !== myTag && P.pal !== w) { P.pal = w; save(); setTimeout(() => toast(T("You joined a friend's invite. Find them in town: near each other you both get +10% XP.")), 4000); } }
async function invite() {
  try { if (referUI) { referUI.open(); return; } } catch { /* the page is still loading: the plain link */ }
  const u = location.origin + "/play?with=" + myTag;
  try { if (navigator.share && coarse) { await navigator.share({ title: "ARCIRCLE World", text: T("Play ARCIRCLE World with me"), url: u }); return; } await navigator.clipboard.writeText(u); toast(T("Invite link copied. Near each other in town, you both get +10% XP.")); } catch { toast(u); }
}
$("wp-act-emote").addEventListener("click", openWheel);
const speedLines = document.createElement("div"); speedLines.className = "wp-speed"; speedLines.setAttribute("aria-hidden", "true"); document.body.appendChild(speedLines);
// a long press on the ride button switches ride (the rover from level 10): phones have no V key
{ const bb = $("wp-act-board"); let lpT = 0, lp = false;
  bb.addEventListener("pointerdown", () => { lp = false; clearTimeout(lpT); lpT = setTimeout(() => { lp = true; switchRide(); }, 520); });
  const stop = () => clearTimeout(lpT); bb.addEventListener("pointerup", stop); bb.addEventListener("pointerleave", stop); bb.addEventListener("pointercancel", stop);
  bb.addEventListener("contextmenu", (e) => e.preventDefault());
  bb.addEventListener("click", () => { if (lp) { lp = false; return; } setBoard(!boarding); }); }
$("wp-act-photo").addEventListener("click", () => setPhoto(true));
$("wp-photo-btn").addEventListener("click", () => { if (!frozen) setPhoto(true); });

// ---------------- movement: the world slides under the player ----------------
const Y = new THREE.Vector3(0, 1, 0), prevP = new THREE.Vector3(), EDGE = 300; /* b-land: past the hunting grounds (~206 m) and the LAND ring (20 villages ~270 m out, world-land.js); the hills start at 312 */
let mode = "hub"; // "hub" | "island" (world-island.js takes over the ground)
const at = new THREE.Vector3(0, 0, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dir = new THREE.Vector3(), axis = new THREE.Vector3(), nrm = new THREE.Vector3();
let speedNow = 0, hop = 0, vy = 0, grounded = true, near = null, stepT = 0, walked = 0, shake = 0;
let combat = null, rpg = null, quests = null, pet = null, raid = null, ghosts = null, race = null, decor = null; const knockV = new THREE.Vector3(); // world-combat.js and world-rpg.js, set up further down
function inputs() {
  let x = 0, y = 0;
  if (keys.has("w") || keys.has("arrowup")) y += 1;
  if (keys.has("s") || keys.has("arrowdown")) y -= 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (joy) { x += joy.dx; y += -joy.dy; }
  if (gpad.on) { x += gpad.x; y += gpad.y; }
  const m = Math.min(1, Math.hypot(x, y));
  const run = keys.has("shift") || runToggle || (joy && Math.hypot(joy.dx, joy.dy) > 0.95) || (gpad.on && gpad.run);
  return { x, y, m, run };
}
const SOLIDS = () => [gv.solids, mv.solids, shops, [portal, isleGate, fountainCore, agentGate, ...(rqGate.visible ? [rqGate] : [])], pvil.solids, lockedStages, town, coinBuildings, fighters.filter((g) => g.userData.live), decor ? decor.solids() : [], holiday.solids, adc ? adc.solids : [], rqL ? rqL.solids : []];
const lp = new THREE.Vector3();
// a point on the ground (the world group's coordinates) inside a building? — the street scammers ask
const wp0 = new THREE.Vector3();
// the season's dressing and the market stalls (world-holiday.js): placed once the town stands, on free ground round
// the fountain (each spot checked against what's already there)
const holiday = { solids: [], ticks: [] }; let bounty = null; // the bounty board: the day's hunts (Adventure log → Daily)
function freeSpots(n, radii, gap, step = 12) {
  const out = [], v = new THREE.Vector3();
  for (const r of radii) for (let a = 7; a < 360 && out.length < n; a += step) {
    if (Math.abs(((a + 180) % 360) - 180) < 42) continue; // (b-st1: not between the spawn and its camera — a stall's awning filled the first view)
    const x = Math.sin((a * Math.PI) / 180) * r, z = Math.cos((a * Math.PI) / 180) * r; v.set(x, 0, z);
    if (blockedAt(v) || [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => blockedAt(v.set(x + dx, 0, z + dz)))) continue;
    if (out.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) continue;
    out.push([x, z, Math.atan2(-x, -z)]);
  }
  return out;
}
let holTries = 0;
const placeHoliday = () => { if (!(kit && town.length) && holTries++ < 30) { setTimeout(placeHoliday, 1000); return; } try {
  const spots = freeSpots(4, [15.5, 17.5], 9);
  const st3 = HOL.createStalls({ THREE, planet, spots: spots.slice(0, 3) }); holiday.solids.push(...st3.stalls); holiday.ticks.push((t, night) => st3.tick(1 / 60, night));
  if (spots[3]) { bounty = HOL.createBountyBoard({ THREE, planet, at: spots[3] }); holiday.solids.push(bounty); }
  if (HOL.christmasOn()) { const t = freeSpots(1, [13, 14.5], 0, 17)[0] || [0, 13]; const x = HOL.createChristmas({ THREE, planet, spots: lamps.userData.spots || [], tree: [t[0], t[1]] }); holiday.ticks.push(x.tick); const tg = new THREE.Group(); tg.position.set(t[0], 0, t[1]); tg.userData.radius = 2.4; planet.add(tg); holiday.solids.push(tg); }
  if (HOL.lunarOn()) { const l = HOL.createLanterns({ THREE, planet, spots: lamps.userData.spots || [] }); holiday.ticks.push(l.tick); }
} catch (err) { console.warn("holiday", err); } };
setTimeout(placeHoliday, 1500);
st.on((dt, t) => { if (holiday.ticks.length && mode === "hub") holiday.ticks.forEach((f) => f(t, ambNight)); });
function blockedAt(v) {
  wp0.set(v.x + planet.position.x, 0, v.z + planet.position.z);
  for (const list of SOLIDS()) for (const g of list) {
    g.getWorldPosition(tmp); if (Math.abs(tmp.x - wp0.x) > 12 || Math.abs(tmp.z - wp0.z) > 12) continue;
    const bx = g.userData.box;
    if (bx) { lp.copy(wp0); lp.y = tmp.y; g.worldToLocal(lp); if (lp.x > bx.x0 - 0.5 && lp.x < bx.x1 + 0.5 && lp.z > bx.z0 - 0.5 && lp.z < bx.z1 + 0.5) return true; continue; }
    if (Math.hypot(tmp.x - wp0.x, tmp.z - wp0.z) < (g.userData.radius || 1) + 0.6) return true;
  }
  return false;
}
let hitDepth = 0;
function blockedBy() {
  let hit = null, best = Infinity;
  for (const list of SOLIDS()) for (const g of list) {
    g.getWorldPosition(tmp);
    const bx = g.userData.box;
    if (bx) {
      if (tmp.distanceTo(at) > 9) continue;
      lp.copy(at); g.worldToLocal(lp);
      const m = 0.42, inX = lp.x > bx.x0 - m && lp.x < bx.x1 + m, inZ = lp.z > bx.z0 - m && lp.z < bx.z1 + m;
      if (inX && inZ) { const d = -Math.min(lp.x - bx.x0 + m, bx.x1 + m - lp.x, lp.z - bx.z0 + m, bx.z1 + m - lp.z); if (d < best) { best = d; hit = g; } }
      continue;
    }
    const d = tmp.distanceTo(at) - (g.userData.radius + 0.55); if (d < 0 && d < best) { best = d; hit = g; }
  }
  hitDepth = best;
  return hit;
}
// the way out of what you walked into: away from the nearest box side, or away from the centre
function hitNormal(hit, out) {
  const bx = hit.userData.box;
  if (!bx) { hit.getWorldPosition(tmp); return out.set(tmp.x, 0, tmp.z).normalize(); }
  lp.copy(at); hit.worldToLocal(lp);
  const d = [lp.x - bx.x0, bx.x1 - lp.x, lp.z - bx.z0, bx.z1 - lp.z], i = d.indexOf(Math.min(...d));
  const n = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)][i];
  return out.copy(n).transformDirection(hit.matrixWorld).setY(0).normalize();
}
// where the player stands, in the world group's coordinates
const here = (v = new THREE.Vector3()) => v.set(-planet.position.x, hop, -planet.position.z);
// b-lpv: past the town's edge, or past the edge of the land you're in (world-lands.js)
function outOfBounds() { const x = -planet.position.x, z = -planet.position.z, L = LD.landAt(x, z); return L ? lands.outside(L.id, x, z) : x * x + z * z > EDGE * EDGE; }
function tryMove(d, dist) {
  prevP.copy(planet.position);
  // already standing inside something (a respawn, a landing): any step that takes you further out is allowed
  let was = null, d0 = 0;
  if (mode !== "island") { planet.updateMatrixWorld(true); was = blockedBy(); d0 = hitDepth; }
  planet.position.addScaledVector(d, -dist);
  let hit = null;
  if (mode === "island") hit = island.blocked(here(tmp2)) ? { axis: true } : null;
  else if (arenaR ? (planet.position.x + gv.center.x) ** 2 + (planet.position.z + gv.center.z) ** 2 > arenaR * arenaR : outOfBounds()) hit = { edge: true };
  else { planet.updateMatrixWorld(true); hit = blockedBy(); if (hit && hit === was && hitDepth > d0 + 1e-4) hit = null; }
  if (hit) planet.position.copy(prevP);
  return hit;
}
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
let jumpBuf = 0; const hitFrom = new THREE.Vector3(); let hitAt = 0, hitPow = 0; // the last blow's push, for the flinch
// variable height: let go of jump early (while still going up fast) and the jump is cut short; coyote time: a jump
// pressed just after walking off an edge (110 ms) still counts
let jumpDown = false, jumpHeld = false, coyoteAt = 0, trickT = 0;
// a running jump carries you forward: the speed you had when you left the ground stays with you in the air
const airV = new THREE.Vector3(), lastDir = new THREE.Vector3(0, 0, 1), skidV = new THREE.Vector3(); let skidT = 0;
function jump() { if (jurOn && jurGame) { jurGame.jump(); return; } if (jetOn() && !frozen) { jetHigh = !jetHigh; Snd.board(); return; } const coy = !grounded && performance.now() - coyoteAt < 110; if (!grounded && !coy && !frozen) { jumpBuf = performance.now(); return; } if ((!grounded && !coy) || frozen) return; coyoteAt = 0; jumpHeld = true; if (boarding && ride === "board" && !reduce) trickT = 0.55; /* a little spin off the board */ vy = (boarding ? 11 : 9) * (combat ? combat.jumpMul() : 1); grounded = false; airV.copy(lastDir).multiplyScalar(speedNow > 1 ? speedNow * 1.08 : 0); Snd.jump(); if (avatar && !boarding) avatar.play("jump", { once: true, fade: 0.08 }); daily("jumps"); tutorialStep(1); }
// an emote; ARC Bots change their face with it. Cheer throws the arms up (a Kenney character waves), Dance twirls
// twice with a bounce
let danceT = 0;
function emote(name) {
  if (!avatar || frozen || !grounded) return;
  const clip = name === "cheer" ? (avatar.arc || avatar.kk ? "celebrate" : "emote-yes") : name === "dance" ? (avatar.arc ? "celebrate" : avatar.kk ? "cheer" : "emote-yes") : name;
  avatar.play(clip, { once: true }); if (pet) pet.emote();
  if (avatar.face) avatar.face(name === "cheer" ? "star" : name === "dance" || name === "emote-yes" ? "happy" : name === "die" ? "ouch" : "", 2);
  if (name === "dance" && !reduce) { danceT = 2.4; vy = 4.5; grounded = false; }
}
// landing from a jump: a ring of light where you touch down (the ARC Bots also squash a little)
function landRing(y) {
  if (reduce) return;
  const r = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 36), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  r.rotation.x = -Math.PI / 2; here(r.position).setY((y || 0) + 0.05); planet.add(r);
  const t0 = performance.now(), off = st.on(() => { const k = (performance.now() - t0) / 380; r.scale.setScalar(1 + k * 2.4); r.material.opacity = 0.75 * (1 - k); if (k >= 1) { off(); planet.remove(r); r.geometry.dispose(); r.material.dispose(); } });
}
// the head turns toward someone close by: another player, ARCIA, a scammer
let lookT = 0;
function lookAround(dt) {
  if (!avatar || !avatar.look) return;
  lookT -= dt; if (lookT > 0) return; lookT = 0.2;
  if (mode !== "hub" || frozen) { avatar.look(0); return; }
  here(tmp2); let best = null, bd = 7;
  const consider = (x, z) => { const d = Math.hypot(x - tmp2.x, z - tmp2.z); if (d < bd && d > 0.8) { bd = d; best = [x, z]; } };
  if (ghosts) ghosts.named().forEach((w) => consider(w.x, w.z));
  if (npc) { npc.getWorldPosition(tmp); consider(tmp.x - planet.position.x, tmp.z - planet.position.z); }
  if (combat) for (const m of combat.state().mobs || []) if (!m.dead) consider(m.x, m.z);
  if (!best) { avatar.look(0); return; }
  let a = Math.atan2(best[0] - tmp2.x, best[1] - tmp2.z) - facing; a = Math.atan2(Math.sin(a), Math.cos(a));
  avatar.look(Math.abs(a) < 1.7 ? a : 0);
}
// first-time hints: a bubble with a pulsing tap mark, once per thing (gathering, fishing, the rover, charging,
// stepping out of red), remembered in this browser
const HINTS = "arc.world.hints";
let hintEl = null, hintT = 0;
function hint(id, text) {
  let seen = []; try { seen = JSON.parse(localStorage.getItem(HINTS) || "[]"); } catch { /* private */ }
  if (seen.includes(id) || introOn || (hintEl && !hintEl.hidden)) return false;
  seen.push(id); try { localStorage.setItem(HINTS, JSON.stringify(seen)); } catch { /* private */ }
  if (!hintEl) { hintEl = document.createElement("div"); hintEl.className = "wp-fh"; hintEl.setAttribute("role", "status"); hintEl.setAttribute("data-no-i18n", ""); document.body.appendChild(hintEl); hintEl.addEventListener("click", () => { hintEl.hidden = true; }); }
  hintEl.innerHTML = `<i aria-hidden="true"></i><span>${esc(text)}</span>`; hintEl.hidden = false; hintEl.classList.remove("on"); void hintEl.offsetWidth; hintEl.classList.add("on");
  clearTimeout(hintT); hintT = setTimeout(() => { hintEl.hidden = true; }, 6500);
  return true;
}
const tapOr = (key, tap) => (coarse ? tap : key);
function setBoard(on) {
  if (frozen) return;
  if (on && level() >= 10) setTimeout(() => hint("rover", tapOr(T("Press V to switch between the hoverboard and the explorer rover"), T("Hold the ride button to switch to the explorer rover"))), 1200);
  if (on && ride === "jet" && level() < 30) ride = "board"; // a save from a higher level on a fresh one
  boarding = on; showRide(); jetHigh = false;
  $("wp-act-board").setAttribute("aria-pressed", String(on)); Snd.board();
  toast(on ? (ride === "rover" ? T("Rover on: hold Shift (or Run) to speed up · V switches ride") : ride === "jet" ? T("Jetpack on: Space climbs or comes down · V switches ride") : T("Hoverboard on: hold Shift (or Run) to fly")) : T("Hoverboard off"));
}
function step(dt) {
  // the floor: flat ground in the hub, the bricks under your feet on an island
  const floor = mode === "island" ? island.floorAt(here(tmp2)) : jumpOn && jumpRace ? jumpRace.floorAt(-planet.position.x, -planet.position.z, hop) : 0;
  if (jetOn()) { const want = floor + jetAlt(); hop += (want - hop) * Math.min(1, dt * 2.4); vy = 0; grounded = true; player.position.y = hop; }
  else if (!grounded) {
    if (jumpHeld && !jumpDown) { jumpHeld = false; if (vy > 3) vy *= 0.5; } // let go early: a short hop
    vy -= 24 * dt; hop += vy * dt;
    // a big fall (impact over 12) lands heavy: more dust, a harder shake, the world slows for a beat; the rest as before
    if (hop <= floor) { const impact = -vy, heavy = impact > 12; hop = floor; vy = 0; jumpHeld = false; if (avatar && avatar.land && impact > 4) { avatar.land(impact / 14); landRing(floor); } grounded = true; airV.set(0, 0, 0); Snd.land(impact); dust(heavy ? 16 : 6, heavy ? 1 : 0); shake = Math.max(shake, heavy ? 0.22 : 0.12); if (heavy && !reduce) slowUntil = Math.max(slowUntil, performance.now() + 150); if (performance.now() - jumpBuf < 160) { jumpBuf = 0; setTimeout(jump, 0); } }
  }
  else if (jumpOn && hop > floor + 0.05 && hop - floor < 0.25) hop = floor; // b444: a Coin Jump pad going down carries you (no fall-and-land every frame)
  else if (hop > floor + 0.05) { grounded = false; vy = 0; coyoteAt = performance.now(); } // walked off an edge
  else if (floor > hop) hop = floor;
  player.position.y = hop;
  { const cs = meShadow; if (cs) { const up = Math.max(0, hop - floor); cs.position.y = floor - hop + 0.05; cs.material.opacity = 0.5 * Math.max(0.3, 1 - up / 6); cs.scale.setScalar(1 + Math.min(up, 6) * 0.12); cs.visible = (mode === "hub" || mode === "island") && !jumpOn; } /* b443: it stays on the ground (faint) up to any height, so you see where you'll land; Coin Jump has its own marker */ } // the spot stays on the floor as you jump, fainter higher up
  at.y = THREE.MathUtils.lerp(at.y, jetOn() ? hop * 0.75 : floor, grounded ? 0.2 : 0.04);
  if (frozen) { speedNow = THREE.MathUtils.lerp(speedNow, 0, 0.2); return; }
  if (flying) { stepTeleport(); speedNow = 0; return; }
  const { x, y, m, run } = inputs();
  let sp = 0;
  if (skidT > 0) { skidT = Math.max(0, skidT - dt); const v = skidV.length(); if (v > 0.3) { tmp2.copy(skidV).divideScalar(v); tryMove(tmp2, v * dt); } skidV.multiplyScalar(Math.max(0, 1 - dt * 9)); } // the skid slides on
  // in the air with no input: keep gliding the way you jumped, slowing a little
  if (!grounded && m <= 0.05 && airV.lengthSq() > 0.25) { const v = airV.length(); tmp2.copy(airV).divideScalar(v); if (!tryMove(tmp2, v * dt)) sp = v; airV.multiplyScalar(1 - Math.min(1, dt * 0.6)); }
  if (m > 0.05) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    dir.set(rx * x + fx * y, 0, rz * x + fz * y).normalize();
    sp = (boarding ? (run ? 22 : 13) : run ? 12.5 : 6.5) * m * (combat ? combat.speedMul() : 1);
    if (!grounded && airV.lengthSq() > 0.25) sp = Math.max(sp, airV.length() * 0.92); // no slowing down mid-jump
    // turning sharply (over 120 degrees) at a sprint: the feet skid on the old way for a beat, dust, a lean back
    if (grounded && !boarding && speedNow > 9 && skidT <= 0 && dir.dot(lastDir) < -0.5) { skidT = 0.26; skidV.copy(lastDir).multiplyScalar(speedNow * 0.8); dust(5); if (Snd.step) Snd.step(); }
    if (skidT > 0) sp *= 0.3;
    lastDir.copy(dir);
    const hit = tryMove(dir, sp * dt);
    if (hit && hit.axis) {
      // a brick grid: slide along whichever axis is still free
      const ax = new THREE.Vector3(Math.sign(dir.x), 0, 0), az = new THREE.Vector3(0, 0, Math.sign(dir.z));
      const okX = Math.abs(dir.x) > 0.15 && !tryMove(ax, sp * dt * Math.abs(dir.x));
      if (!okX && !(Math.abs(dir.z) > 0.15 && !tryMove(az, sp * dt * Math.abs(dir.z)))) sp *= 0.2;
    } else if (hit) {
      // slide along it: drop the part of the step that goes into the obstacle
      if (hit.edge) nrm.set(-planet.position.x, 0, -planet.position.z).normalize();
      else hitNormal(hit, nrm);
      const into = dir.dot(nrm);
      if (into > 0) { tmp2.copy(dir).addScaledVector(nrm, -into); if (tmp2.lengthSq() > 0.02) { tmp2.normalize(); if (tryMove(tmp2, sp * dt * Math.sqrt(1 - into * into))) sp *= 0.2; } else sp *= 0.2; }
    }
    facing = angLerp(facing, Math.atan2(dir.x, dir.z), 1 - Math.exp(-12 * dt));
    // the camera drifts back behind you only running straight on, 3 s after you last looked round: run diagonally (or look
    // round while running, as in a shooter) and it stays where you put it — the drift used to chase a sideways run round in
    // circles, and swing the view to your back the moment your look thumb let go
    if (!look && performance.now() - lastLook > 3000 && y > 0.5 && Math.abs(x) < 0.2 && !(combat && combat.locked())) camYaw = angLerp(camYaw, facing - Math.PI, dt * 0.9);
    stepT -= dt * sp; if (grounded && stepT < 0 && !boarding) { Snd.step(sp); stepT = 2.6; if (sp > 10) dust(2); const zz = combat && combat.zone(), soft = zz && { peaks: 0xa9bcd4, dunes: 0xa8824e, canyon: 0x8a4a32 }[zz.id]; if (soft && tracks) { here(tmp2); tracks.step(tmp2.x, tmp2.z, facing, soft); } } // prints in snow and sand
    walked += sp * dt; if (walked > 4) tutorialStep(0);
    dailyDist(sp * dt);
  }
  speedNow = THREE.MathUtils.lerp(speedNow, sp, 0.2);
}
// fly to a place (the map): a teleport (b407). The character is drawn up into a beam of light and vanishes, the
// screen flashes, and it forms again in front of the place out of a second beam — instead of the town sliding past
// under it. The player lands in front of the place (things face the plaza) and turns to it.
const TP = (() => { const k = /[?&]tpslow=1\b/.test(location.search) ? 10 : 1; return { OUT: 560 * k, GAP: 160 * k, IN: 760 * k }; })(); // ?tpslow=1: ten times slower, to look at it
const tpGlow = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(150,235,255,.75)"); gr.addColorStop(1, "rgba(60,160,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false, toneMapped: false }));
  sp.position.y = 1.1; sp.visible = false; sp.renderOrder = 12; player.add(sp); return sp;
})();
const tpFlash = document.createElement("div"); tpFlash.className = "wp-tpflash"; tpFlash.setAttribute("aria-hidden", "true"); document.body.appendChild(tpFlash);
function flyTo(g) {
  if (mode !== "hub") leaveIsland();
  const p = g.position, L0 = LD.landAt(p.x, p.z), front = new THREE.Vector3((L0 ? L0.x : 0) - p.x, 0, (L0 ? L0.z : 0) - p.z); // (b-lpv: in a land, facing its middle)
  if (front.lengthSq() < 1e-4) front.set(0, 0, 1);
  front.normalize();
  const stand = new THREE.Vector3(p.x, 0, p.z).addScaledVector(front, (g.userData.radius || 1) + 1.7);
  if (reduce) { planet.position.copy(stand).negate(); facing = Math.atan2(p.x - stand.x, p.z - stand.z); camYaw = facing - Math.PI; vfx.teleport(here()); return; }
  vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff });
  if (Snd.dash) Snd.dash();
  flying = { to: stand.clone().negate(), face: Math.atan2(p.x - stand.x, p.z - stand.z), t0: performance.now(), jumped: false };
}
// where to look from on arrival: straight behind you if nothing (a tree, a stall) stands between the camera and you,
// otherwise a little to one side or the other
const tpRay = new THREE.Raycaster(), tpSkip = /^(grass|ground|hills|clouds|puddles|world-ground|sky)/;
function clearYaw(face) {
  planet.updateMatrixWorld(true);
  const near = [], aims = [new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 0.35, 0)]; // the head and the feet: both in view
  for (const c of planet.children) { if (c.visible && !tpSkip.test(c.name || "")) near.push(c); } // big groups too (their origin can be far from what they hold)
  for (const off of [0, 0.5, -0.5, 1.0, -1.0]) {
    const yaw = face - Math.PI + off, cp = new THREE.Vector3(0, 5.2 + camPitch * 6, 9.6).multiplyScalar(camDist * camZoom).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const blocked = aims.some((aim) => { const d = cp.clone().sub(aim), len = d.length(); tpRay.set(aim, d.normalize()); tpRay.far = len; tpRay.camera = st.camera; // sprites need the camera to be tested
      return tpRay.intersectObjects(near, true).some((h) => h.distance > 1.2 && h.object.isMesh && h.object.name !== "grass" && !(h.object.material && h.object.material.transparent)); });
    if (!blocked) return yaw;
  }
  return face - Math.PI;
}
function stepTeleport() {
  const f = flying, t = performance.now() - f.t0, { OUT, GAP, IN } = TP;
  if (t < OUT) {
    // drawn up into the beam: thinner and taller, a white glow swelling round it, a little lift off the ground
    const k = t / OUT, e = k * k * (3 - 2 * k);
    player.scale.set(1 - 0.94 * e, 1 + 1.1 * e, 1 - 0.94 * e); player.position.y += e * 0.6;
    tpGlow.visible = true; tpGlow.material.opacity = 0.25 + 0.75 * e; tpGlow.scale.setScalar(1.2 + 2.6 * e);
    camYaw = angLerp(camYaw, f.face - Math.PI, 0.03);
    if (k > 0.72 && !f.flashed) { f.flashed = true; tpFlash.classList.remove("on"); void tpFlash.offsetWidth; tpFlash.classList.add("on"); }
    return;
  }
  if (!f.jumped) {
    // gone: the jump itself, under the flash; the arrival beam is already falling where you'll stand
    f.jumped = true; player.visible = false;
    planet.position.copy(f.to); facing = f.face; camPitch = 0.32; camYaw = clearYaw(f.face); // a higher look at the arrival, from a side nothing stands in the way of
    vfx.teleport(here(), { color: 0xffe08a, color2: 0x39ff88 });
  }
  if (t < OUT + GAP) return;
  if (t < OUT + GAP + IN) {
    // formed again: out of a thin bright column into the character, with a little overshoot; the glow fades out
    if (!player.visible) { player.visible = true; if (Snd.land) Snd.land(); else if (Snd.enter) Snd.enter(); }
    const k = (t - OUT - GAP) / IN, c1 = 1.70158, c3 = c1 + 1, back = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    const w = 0.06 + 0.94 * back, h = 2.1 - 1.1 * Math.min(1, k * 1.25);
    player.scale.set(w, Math.max(1, h), w);
    tpGlow.material.opacity = Math.max(0, 1 - k * 1.3); tpGlow.scale.setScalar(3.8 - 2.4 * k);
    return;
  }
  player.scale.set(1, 1, 1); tpGlow.visible = false; tpGlow.material.opacity = 0; flying = null;
  dust(6);
}

// ---------------- My Island (world-island.js): a floating island you build, and other players' islands ----------------
const island = IS.createIsland({
  THREE, K, STYLE, st, planet, T, lang: LANG, esc, toast, post, sess, Snd, P, VER, reduce, coarse, level,
  showcase: { fish: LIFE.FISH, zones: RPG.ZONES, fish3d: GEAR.fish, data: () => { const d = rpg && rpg.data(), x = (d && d.x) || {}; return { fish: x.fish || {}, bk: x.bk || {} }; } },
  lines: () => islandLines(), onStats: (x) => { if (!x) return; P.isle = x; save(); checkQuests(); },
  labelsDirty: () => { if (labels) labels.dirty = true; },
  avatarPlay: (n) => { if (avatar && grounded && !boarding) avatar.play(n, { once: true }); },
  goTo: (pos, face) => { planet.position.set(-pos.x, 0, -pos.z); hop = pos.y; at.y = pos.y; vy = 0; grounded = true; facing = face; camYaw = face - Math.PI; flying = null; mode = "island"; },
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  feet: () => hop, goIsland: (o) => goIsland(o), saveP: () => save(),
  owns: (id) => arclShop.owns(id),
  skyTheme: (th) => { skyOverride = th || ""; nightK = -1; dayNight(); },
  // a saved island and its likes earn ARCL (the server checks the saved island)
  makeCentre: (L) => VILL.makeCentre(THREE, K, L), onVillage: (v) => setVillage(v),
  onSaved: (x) => { [[20, "isle20"], [100, "isle100"], [300, "isle300"]].forEach(([n, k]) => { if (x.bricks >= n) arclClaim(k); }); [[1, "res1"], [5, "res5"]].forEach(([n, k]) => { if (x.residents >= n) arclClaim(k); }); },
  onLiked: () => { if (!P.vq || !P.vq.like) { P.vq = { ...P.vq, like: 1 }; save(); checkQuests(); } }, // a like given to another island (quest "visit-like")
  onShared: () => { if (!P.vq || !P.vq.share) { P.vq = { ...P.vq, share: 1 }; save(); checkQuests(); } }, // the island link was copied (quest "share-isle")
  onLikes: (n) => { [[1, "liked1"], [10, "liked10"], [50, "liked50"]].forEach(([m, k]) => { if (n >= m) arclClaim(k); }); },
  onArcl: (n) => { if (n > 0) { arclShop.refresh().then(() => toast(T("+{n} ARCL · {why}", { n, why: T("Leave a stamp on someone's island") }))); Snd.coin(); } },
});
// ---------------- ARCIRCLE LAND (world-land.js): the 20 villages on the ring past the hunting grounds ----------------
land = LANDM.createLand({ THREE, K, planet, esc, T: TW, toast, post, sess, Snd, CFG, lang: LANG, island, AC, addr, closeAll,
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); }, standAt: (x, z, c) => standAt(x, z, c), visit: (w) => goIsland({ visit: w }), myIsland: () => goIsland({}),
  signIn: () => openAuth(), labelsDirty: () => { if (labels) labels.dirty = true; }, onOwn: () => { if (ownNow) applyOwn(ownNow); } });
st.on((dt, t) => { if (land && mode === "hub") land.tick(dt, t, { x: -planet.position.x, z: -planet.position.z }); });
// ---------------- ARCL (world-shop.js): the counter, the shop, the exchange, the daily check-in ----------------
P.style = P.style || { plate: "", trail: "" };
const arclShop = SHOP.createShop({
  T, lang: LANG, esc, toast, post, sess, Snd, P, coarse, reduce, AC, addr,
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  openAuth: () => openAuth(), openForge: () => rpg && rpg.show("forge"),
  // the daily chest's bonus (the ARCL part comes from the server): potions, scrap, XP or a gear chest
  dailyBonus: (k) => {
    const r = rpg.data(), out = [], add = (f, n) => { r[f] = (r[f] || 0) + n; };
    if (k === "hp2") { add("hp", 2); out.push({ k: "pot", text: T("+2 health potions") }); }
    else if (k === "scrap60" || k === "scrap120") { const n = k === "scrap60" ? 60 : 120; add("scrap", n); out.push({ k: "scrap", text: T("+{n} scrap", { n }) }); }
    else if (k === "mix") { add("sp", 2); add("recall", 1); out.push({ k: "pot", text: T("+2 mana potions") }, { k: "scroll", text: T("+1 recall scroll") }); }
    else if (k === "pots6") { add("hp", 3); add("sp", 3); out.push({ k: "pot", text: T("+3 health potions") }, { k: "pot", text: T("+3 mana potions") }); }
    else if (k === "xp150") { setTimeout(() => gain(150, T("Daily reward")), 900); out.push({ k: "xp", text: T("+150 XP") }); }
    else if (k === "gear") { const it = rpg.giftPiece(level()); out.push(it ? { k: "gear", text: rpg.itemName(it), color: RPG.RARITY[it.r].color } : { k: "scrap", text: T("Your bag was full, so the piece became scrap") }); }
    if (quests) quests.on.chest();
    save(); rpg.refresh(); if (combat) combat.paintPots();
    return out;
  },
  myCoins: () => myCoins, coins: () => (coinData || []).slice(0, 30),
  onOwn: (o) => applyOwn(o),
  using: (id) => P.style.plate === id || P.style.trail === id || P.isleTheme === id,
  use: (id) => {
    if (id.startsWith("plate-")) P.style.plate = P.style.plate === id ? "" : id;
    else if (id.startsWith("trail-")) P.style.trail = P.style.trail === id ? "" : id;
    else if (id.startsWith("style-")) { P.isleTheme = P.isleTheme === id ? "" : id; island.setTheme(P.isleTheme); }
    save(); setNameTag(); paintTrail();
  },
  buildWith: (id) => buildWith(id),
  onBought: (id) => { if (/^(brick|pack|style)-|^isle(48|64)$/.test(id)) { setTimeout(() => afterBuy(id), 700); if (!P.vq || P.vq.buy == null) { P.vq = { ...P.vq, buy: isleN("bricks") }; save(); } checkQuests(); } if (id === "feature-isle" || id === "billboard") refreshPlaza(); if (id.startsWith("plate-") || id.startsWith("trail-")) arclShop.close(); if (avatar) avatar.play("emote-yes", { once: true }); burst(0x4fd6ff); },
  furnace: () => { const f = shopG("reward"); if (f) f.userData.boost = 1; },
});
// ---------------- your village (world-village.js, api/_world-village.mjs): level, score, blessing, weekly contest ----------------
const village = VILL.createVillage({
  T: TW, esc, toast, post, sess, Snd,
  pay: (id, target, onStatus) => arclShop.pay(id, target, onStatus),
  goVillage: () => goIsland({}), visit: (w) => goIsland({ visit: w }),
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  onVillage: (v) => setVillage(v),
});
// a bought brick, pack, island style or expansion: use it now on your island, or later (both a tap, neither pushed)
const onMyIsland = () => mode === "island" && island.kind() === "home" && !island.readOnly();
async function buildWith(id) {
  closeAll();
  if (/^style-/.test(id)) { P.isleTheme = id; save(); island.setTheme(id); }
  if (!onMyIsland()) await goIsland({});
  if (!onMyIsland()) return;
  if (/^style-/.test(id)) { island.setTheme(id); toast(T("Your island's style is on")); }
  else if (/^isle(48|64)$/.test(id)) toast(T("Your island is {n}×{n} now: more room to build", { n: id === "isle64" ? 64 : 48 }));
  else island.useItem(id);
}
function afterBuy(id) {
  document.querySelectorAll(".wv-after").forEach((e) => e.remove());
  const style = /^style-/.test(id), grow = /^isle(48|64)$/.test(id);
  const el = document.createElement("div"); el.className = "wp-leave wv-after"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-card wp-leave-card"><h2>${esc(style ? T("Your new island style is ready") : grow ? T("Your island has more room") : T("Your new pieces are in your builder"))}</h2>
    <p>${esc(style ? T("Put it on your island now, or any time from the shop's Use button.") : grow ? T("Go and build on it now, or come back to it any time.") : T("Build with them now (they'll be in your hotbar), or find them later in the builder's palette. Every new kind of piece raises your village score."))}</p>
    <div class="wp-leave-btns"><button type="button" class="wp-btn" data-later>${esc(TW("Later"))}</button><button type="button" class="wp-btn" data-now>${esc(style ? T("Use it now") : T("Build with it now"))}</button></div></div>`;
  document.body.appendChild(el); frozen = true; keys.clear();
  const done = () => { el.remove(); const sh = $("wa-sheet"); frozen = !!(sh && !sh.hidden); }; // back to the shop if it's still open
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-later]")) done(); else if (e.target.closest("[data-now]")) { done(); buildWith(id); } });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } });
  setTimeout(() => { const b = el.querySelector("[data-later]"); if (b && !coarse) b.focus(); }, 40);
}
function setVillage(v) {
  const s = sess(); if (!v || !s || v.wallet !== lc(s.wallet)) return;
  const prev = P.vill && P.vill.w === v.wallet ? P.vill.level : 0;
  P.vill = { w: v.wallet, level: v.level, xp: v.xp, need: v.need, next: v.next, score: v.score, blessing: v.blessing || { xp: 0, hp: 0 }, payable: !!v.payable };
  save(); paintHud(); if (rpg) rpg.refresh();
  island.setVillage && island.setVillage(v.level, { score: v.score, payable: !!v.payable, next: v.next });
  if (prev && v.level > prev) { toast(T("Your village is now level {n}", { n: v.level })); Snd.level(); burst(0x39ff88); }
}
const done1 = new Set(); // claims already sent this session
function arclClaim(kind, extra = {}, from = null) { if (done1.has(kind)) return; done1.add(kind); arclShop.claim(kind, extra, from).then((n) => { if (!n && !sess()) done1.delete(kind); }); }
let ownNow = null; // the last worldOwn the shop gave (the pets in it are mirrored once the game is up)
function applyOwn(o) {
  ownNow = o; if (pet) pet.mirror(o);
  const items = (o && o.items) || [];
  island.setOwned(land && land.mine() ? [...items, "isle64", "land"] : items, (o && o.lots) || []); // b-land: an owner builds 64×64 and more bricks
  if (P.style.plate && !items.includes(P.style.plate)) P.style.plate = "";
  if (P.style.trail && !items.includes(P.style.trail)) P.style.trail = "";
  if (P.isleTheme && !items.includes(P.isleTheme)) { P.isleTheme = ""; island.setTheme(""); }
  setNameTag(); paintTrail(); if (rpg && rpg.setBagPlus) rpg.setBagPlus(o && o.bag);
  starterOwn(o);
}
// ---------------- the season's Starter Package (api/_world-shop.mjs STARTER, b414) ----------------
// Bought with $ARCIRCLE through the shop's payment (the wallet confirms the transfer; half burned, half to the treasury).
// What it gives waits on the server (worldOwn.starter.gifts) and is taken here once per gift: the Legendary piece goes
// in the bag, the 100 potions on the pile. The 2× EXP runs on the server's clock (xpBoostUntil).
function starterOwn(o) {
  xpBoostUntil = Number(o && o.xpBoostUntil) || 0; paintBoost();
  const gifts = o && o.starter && Array.isArray(o.starter.gifts) ? o.starter.gifts : [];
  let ready = false; try { ready = !!rpg; } catch { /* still loading */ }
  if (!gifts.length || !ready) return;
  const r = rpg.data(); r.x = r.x || {}; const got = new Set(Array.isArray(r.x.sg) ? r.x.sg : []);
  const fresh = gifts.filter((g) => g && g.gid && !got.has(g.gid)); if (!fresh.length) return;
  const have = new Set([...Object.values(r.eq || {}), ...(r.bag || []), ...(r.store || [])].filter(Boolean).map((x) => x.id)), items = [];
  let pots = 0;
  for (const g of fresh) { if (g.item && g.item.id && !have.has(g.item.id)) { rpg.addItem({ ...g.item }, true); items.push(g.item); } pots += Math.max(0, Math.floor(g.hp || 0)); got.add(g.gid); }
  r.hp = (r.hp || 0) + pots; r.x.sg = [...got].slice(-12); save(); rpg.refresh();
  if (items.length || pots) starterCard(items, pots);
}
function paintBoost() { const b = document.querySelector("#wp-starter-btn .wp-st-boost"); if (b) b.hidden = !(xpBoostUntil > Date.now()); }
setInterval(paintBoost, 60e3);
const leftOf = (t) => { const m = Math.max(0, Math.round((t - Date.now()) / 60e3)); return m >= 60 ? T("{h} h {m} min left", { h: Math.floor(m / 60), m: m % 60 }) : T("{m} min left", { m }); };
function starterCard(items, pots) {
  const el = document.createElement("div"); el.className = "wp-cbt"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-stc-h"); el.setAttribute("data-no-i18n", "");
  const leg = RPG.RARITY[4];
  el.innerHTML = `<div class="wp-cbt-card"><div class="wp-cbt-top wp-st-top" aria-hidden="true"><img src="/images/world-starter-box.webp" alt=""></div><small>${esc(T("Starter Package"))}</small>
    <h2 id="wp-stc-h">${esc(T("Your Starter Package is in"))}</h2>
    <p>${esc(xpBoostUntil > Date.now() ? T("2× EXP is on: {t}.", { t: leftOf(xpBoostUntil) }) : T("Good hunting!"))}</p>
    <ul>${items.map((it, i) => { const pb = RPG.parseBase(it.b) || { slot: "weapon" }; return `<li style="--i:${i}">${RPG.iconSvg(pb.slot, leg.color)}<b>${esc(RPG.itemName(it))}</b><small>${esc(T("Legendary"))} · ${esc(T(RPG.SLOT_NAME[pb.slot] || pb.slot))} · ${esc(T("Lv {n}", { n: it.lv }))}</small></li>`; }).join("")}
    ${pots ? `<li style="--i:${items.length}"><svg viewBox="0 0 24 24" aria-hidden="true" style="--ic:#ff8fa3"><path d="M12 20s-7-4.3-8.6-8.5C2.2 8.3 4.2 5.2 7.3 5.2c1.9 0 3.2 1 4.7 2.8 1.5-1.8 2.8-2.8 4.7-2.8 3.1 0 5.1 3.1 3.9 6.3C19 15.7 12 20 12 20z"/></svg><b>${esc(T("{n} healing potions", { n: pots }))}</b><small>${esc(T("Added to your potions"))}</small></li>` : ""}</ul>
    <div class="wp-cbt-act"><button type="button" class="wp-cbt-bag">${esc(T("Open the bag"))}</button><button type="button" class="wp-cbt-x">${esc(T("Close"))}</button></div></div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-cbt-x").addEventListener("click", close);
  el.querySelector(".wp-cbt-bag").addEventListener("click", () => { close(); rpg.show(); });
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  setTimeout(() => el.querySelector(".wp-cbt-bag").focus(), 40);
}
// the package's window: what's in it, this season's three prices (the next one marked), and the buy button
async function openStarter() {
  const s = sess(), fmtN = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  let v = null; try { const r = await fetch("/api/social?world=starter" + (s ? "&wallet=" + s.wallet : "")); v = r.ok ? await r.json() : null; } catch { v = null; }
  if (!v || !Array.isArray(v.prices)) { toast(T("The Starter Package isn't available right now")); return; }
  if (v.boostUntil) { xpBoostUntil = v.boostUntil; paintBoost(); }
  const el = document.createElement("div"); el.className = "wp-st"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-st-h"); el.setAttribute("data-no-i18n", "");
  const ord = [T("1st"), T("2nd"), T("3rd")], left = v.max - v.bought, on = v.open && left > 0;
  const row = (ic, t, d) => `<li><i class="wp-st-ic wp-st-${ic}" aria-hidden="true"></i><div><b>${t}</b><small>${esc(d)}</small></div></li>`;
  el.innerHTML = `<div class="wp-st-card">
    <button type="button" class="wp-st-x" aria-label="${esc(T("Close"))}">×</button>
    <div class="wp-st-head"><div><small>${esc(T("ARCIRCLE World · {s}", { s: T(v.name || "Season 1") }))}</small><h2 id="wp-st-h">${esc(T("Starter Package"))}</h2>
      <p>${esc(T("Up to {n} per account this season.", { n: v.max }))}</p></div><img src="/images/world-starter-box.webp" alt="" width="132" height="108"></div>
    <ul class="wp-st-list">
      ${row("leg", `${esc(T("1 random"))} <em>${esc(T("Legendary item"))}</em>`, T("A Legendary piece in a random slot, the tier you can wear at your level (Lv 15 or more)."))}
      ${row("exp", `<em>${esc(T("2× EXP"))}</em> ${esc(T("for 24 hours"))}`, xpBoostUntil > Date.now() ? T("On now: {t}. Another buy adds 24 hours.", { t: leftOf(xpBoostUntil) }) : T("Starts the moment the payment confirms."))}
      ${row("pot", `<em>100</em> ${esc(T("healing potions"))}`, T("For hunting and boss fights."))}
    </ul>
    <table class="wp-st-price"><thead><tr><th>${esc(T("Purchase"))}</th><th>${esc(T("Price"))}</th></tr></thead><tbody>
      ${v.prices.map((p, i) => `<tr class="${i < v.bought ? "done" : i === v.bought && on ? "next" : ""}"><td>${esc(ord[i] || String(i + 1))}${i < v.bought ? ` <span>${esc(T("Bought"))}</span>` : ""}</td><td><b>${fmtN(p)}</b> $ARCIRCLE</td></tr>`).join("")}
    </tbody></table>
    <p class="wp-st-note">${esc(T("Paid in $ARCIRCLE from your wallet on Arc: 50% is burned and 50% goes to the treasury."))}</p>
    <p class="wp-st-status" role="status" hidden></p>
    <button type="button" class="wp-st-buy"${on ? "" : " disabled"}>${esc(!v.open ? T("Not on sale this season") : left <= 0 ? T("Bought {n} of {n} this season", { n: v.max }) : !s ? T("Sign in to buy") : T("Buy for {n} $ARCIRCLE", { n: fmtN(v.next) }))}</button></div>`;
  document.body.appendChild(el); frozen = true; keys.clear();
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-st-x").addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  const buy = el.querySelector(".wp-st-buy"), st = el.querySelector(".wp-st-status");
  const say = (t) => { st.textContent = t || ""; st.hidden = !t; };
  buy.addEventListener("click", async () => {
    if (!on || buy.disabled) return;
    if (!sess()) { close(); signIn().then(() => { paintAcct(); openStarter(); }).catch((e) => toast((e && e.message) || T("Sign-in failed."))); return; }
    buy.disabled = true;
    const done = await arclShop.pay("starter", "", say).catch(() => false);
    if (done) { close(); return; } // the gifts arrive through the shop's answer (applyOwn)
    buy.disabled = false;
  });
  setTimeout(() => (on ? buy : el.querySelector(".wp-st-x")).focus(), 40);
}
// ---------------- the welcome week (api/_world-welcome.mjs, b5): seven gifts for a new player, one a day ----------------
// A button up top (a dot when today's gift is waiting; never a popup). Guests below Lv 20 see it too, with a sign-in.
let welcomeV = null;
const WK_ICON = { hp: "pot", arcl: "arcl", egg: "egg", scrap: "scrap", trial: "pick" };
const wkLabel = (g) => g.kind === "supply" ? (g.s === "scrap" ? T("+{n} scrap", { n: g.n }) : T("{n} healing potions", { n: g.n })) : g.kind === "arcl" ? TW("{n} ARCL", { n: Number(g.n).toLocaleString("en-US") }) : g.kind === "egg" ? TW("A pet egg") : TW("Advanced Pickaxe · 7 days");
async function refreshWelcome() {
  const btn = $("wp-gift-btn"); if (!btn) return;
  const s = sess();
  if (!s) { welcomeV = null; btn.hidden = !(level() < 20); btn.classList.remove("ready"); return; }
  try { const r = await fetch("/api/social?world=welcome&wallet=" + s.wallet); welcomeV = r.ok ? await r.json() : null; } catch { welcomeV = null; }
  btn.hidden = !(welcomeV && welcomeV.eligible); btn.classList.toggle("ready", !!(welcomeV && welcomeV.ready));
}
async function openWelcome() {
  const s = sess();
  if (s) await refreshWelcome();
  const v = welcomeV || { eligible: !s, n: 0, ready: false, gifts: [{ kind: "supply", s: "hp", n: 20 }, { kind: "arcl", n: 500 }, { kind: "egg" }, { kind: "arcl", n: 1000 }, { kind: "supply", s: "scrap", n: 50 }, { kind: "arcl", n: 1500 }, { kind: "trial" }] };
  if (s && !v.eligible) { toast(TW("The welcome week is over. Thanks for playing!")); $("wp-gift-btn").hidden = true; return; }
  const el = document.createElement("div"); el.className = "wp-st wp-wk"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wp-wk-h"); el.setAttribute("data-no-i18n", "");
  const days = v.gifts.map((g, i) => `<li class="${i < v.n ? "got" : i === v.n ? (v.ready ? "now" : "next") : ""}" style="--i:${i}"><small>${esc(TW("Day {n}", { n: i + 1 }))}</small><i class="wp-wk-ic wp-wk-${WK_ICON[g.kind === "supply" ? g.s : g.kind]}" aria-hidden="true"></i><b>${esc(wkLabel(g))}</b>${i < v.n ? `<em>✓</em>` : ""}</li>`).join("");
  const left = v.until ? Math.max(0, Math.ceil((v.until - Date.now()) / 864e5)) : 14;
  el.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(T("Close"))}">×</button>
    <div class="wp-st-head"><div><small>${esc(TW("New player gifts"))}</small><h2 id="wp-wk-h">${esc(TW("Welcome Week"))}</h2>
      <p>${esc(TW("One gift a day, seven in all. Days off are fine: finish within {n} days.", { n: v.until ? left : 14 }))}</p></div></div>
    <ol class="wp-wk-days">${days}</ol>
    <p class="wp-st-status" role="status" hidden></p>
    <button type="button" class="wp-st-buy">${esc(!s ? TW("Sign in to claim") : v.ready ? TW("Claim day {n}", { n: v.n + 1 }) : TW("Come back tomorrow for day {n}", { n: v.n + 1 }))}</button></div>`;
  document.body.appendChild(el); frozen = true; keys.clear();
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".wp-st-x").addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  const go = el.querySelector(".wp-st-buy"), st = el.querySelector(".wp-st-status");
  if (s && !v.ready) go.disabled = true;
  go.addEventListener("click", async () => {
    if (!sess()) { close(); signIn().then(() => { paintAcct(); refreshWelcome().then(openWelcome); }).catch((e) => toast((e && e.message) || T("Sign-in failed."))); return; }
    go.disabled = true;
    const r = await post({ action: "world-welcome-claim", ...sess() }).catch(() => null);
    if (!r || !r.ok) { st.textContent = (r && r.j && r.j.error) || TW("Couldn't claim the gift. Try again."); st.hidden = false; go.disabled = false; return; }
    const j = r.j, g = v.gifts[j.day - 1] || {};
    if (j.supply && rpg && rpg.addSupply) { rpg.addSupply(j.supply.kind, j.supply.n); if (combat) combat.paintPots(); }
    if (j.own) applyOwn(j.own);
    if (j.arcl) refreshPurse(true);
    close(); // b-r2: the day's gift opens from a blue box
    const wkImg = g.kind === "arcl" ? "/images/launch/arcl.webp" : g.kind === "supply" && g.s === "hp" ? "/images/hud/pot-hp.webp" : "/images/brand/arcircle-world-logo-256.webp";
    await giftOpen(TW("Day {n}", { n: j.day }), [{ img: wkImg, t: wkLabel(g) }], "daily");
    toast(TW("Day {n} gift: {g}", { n: j.day, g: wkLabel(g) }) + (j.trialUntil ? " · " + TW("ready in the ARCL Mine") : ""));
    refreshWelcome();
  });
  setTimeout(() => go.focus(), 40);
}
// the plaza screen: the island of the day or a coin, from the shop (GET ?world=plaza)
let plazaNow = null;
async function refreshPlaza() {
  try { const r = await fetch("/api/social?world=plaza"); plazaNow = r.ok ? await r.json() : null; } catch { plazaNow = null; }
  const b = screen.userData.board, isle = plazaNow && plazaNow.isle, coin = plazaNow && plazaNow.coin;
  b.userData.draw((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#0b2340"); gr.addColorStop(1, "#0d3a2c"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8fe9df"; g.font = "700 26px Sora, sans-serif"; g.fillText(isle ? (isle.contest ? T("Last week's top island") : T("Island of the day")) : coin ? T("On ArcPad") : T("This week's island contest"), 24, 44);
    g.fillStyle = "#ffffff"; g.font = "700 58px Sora, sans-serif";
    g.fillText(isle ? isle.name.slice(0, 16) : coin ? "$" + String(coin.symbol || "").slice(0, 10) : T("Build yours"), 24, 130);
    g.fillStyle = "#c9d6e2"; g.font = "600 24px Sora, sans-serif";
    g.fillText(isle || coin ? T("Walk up and press E to visit") : T("The most-liked island this week goes up here next week"), 24, h - 28);
  });
}
every(60000, refreshPlaza);
function islandLines() {
  const out = [];
  if (arcStats && arcStats.change24h != null) out.push(T("$ARCIRCLE is {p} today", { p: (arcStats.change24h >= 0 ? "+" : "") + arcStats.change24h.toFixed(1) + "%" }));
  if (coinData && coinData.length) { const c = coinData.slice().sort((a, b) => b.launchedAt - a.launchedAt)[0]; out.push(T("Did you see {x} launch on ArcPad?", { x: "$" + c.symbol })); }
  if (arcStats && arcStats.burned && arcStats.burned.tokens) out.push(T("{n} $ARCIRCLE burned so far", { n: Math.round(arcStats.burned.tokens).toLocaleString("en-US") }));
  out.push(T("Scan a token before you buy it."), T("I love this island."));
  return out;
}
let isleArea = ""; // whose island you are on (world-chat.js: an island is a chat area)
async function goIsland(opt) {
  if (!opt || (!opt.visit && !opt.lot)) tutorialStep(6);
  closeAll();
  const veil = $("wp-veil"); veil.style.opacity = "1"; await sleep(reduce ? 0 : 260);
  if (mode === "island") island.leave();
  const ok = await island.enter(opt);
  if (ok) isleArea = opt.visit ? lc(opt.visit) : opt.lot ? lc(opt.lot.token) : (sess() ? lc(sess().wallet) : "");
  if (!ok) { if (mode === "island") leaveIsland(); }
  else if (opt.visit && !P.visited.includes("isle-visit")) { P.visited.push("isle-visit"); save(); checkQuests(); }
  near = null; paintPrompt(); veil.style.opacity = "0";
}
function leaveIsland() {
  const wasLot = island.kind && island.kind() === "lot" ? coinBuildings.find((g) => lc(g.userData.coin.token) === isleArea) : null; // b-lpv: back beside the lot you were building
  island.leave(); mode = "hub";
  if (wasLot) { const p = wasLot.position, L = LD.landAt(p.x, p.z), cx = L ? L.x : 0, cz = L ? L.z : 0, d = Math.hypot(cx - p.x, cz - p.z) || 1, r = (wasLot.userData.radius || 3) + 2; standAt(p.x + ((cx - p.x) / d) * r, p.z + ((cz - p.z) / d) * r, { x: p.x, z: p.z }); vfx.teleport(here(), { color: 0x39ff88, color2: 0x2ee07a }); landTick(true); near = null; paintPrompt(); dressLots(); return; }
  const p = isleGate.position, front = new THREE.Vector3(-p.x, 0, -p.z).normalize(), stand = new THREE.Vector3(p.x, 0, p.z).addScaledVector(front, 3.6);
  planet.position.copy(stand).negate(); hop = 0; at.y = 0; vy = 0; grounded = true; facing = Math.atan2(-front.x, -front.z) + Math.PI; camYaw = facing - Math.PI;
  vfx.teleport(here(), { color: 0x39ff88, color2: 0x2ee07a });
  if (labels) labels.dirty = true; near = null; paintPrompt();
}

// ---------------- what's in reach ----------------
function nearest() {
  let best = null, bd = Infinity;
  const consider = (g, kind, extra, reach) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at) - (g.userData.radius || 1); if (d < reach && d < bd) { bd = d; best = { kind, g, ...extra }; } };
  if (defenseOn || jumpOn || beatOn || mineOn || jurOn || survOn || ringsOn || pokerOn) return null; // in a Game Village game (or the mine) the town is gone
  if (mode === "island") { island.near(consider); return best; }
  if (land) land.near(consider);
  mv.doors.forEach((d) => consider(d, d.userData.game === "miner" ? "miner" : "mine", {}, 2.4));
  gv.doors.forEach((d) => { if (d.userData.game === "defense") consider(d, "defense", {}, 2.4); else if (d.userData.game === "jump") consider(d, "jump", {}, 2.4); else if (d.userData.game === "beat") consider(d, "beat", {}, 2.4); else if (d.userData.game === "surv") consider(d, "surv", {}, 2.6); else if (d.userData.game === "rings") consider(d, "rings", {}, 2.6); else if (d.userData.game === "poker") consider(d, "poker", {}, 2.6); });
  consider(isleGate, "isle", {}, 2.4);
  consider(jurGate, "jurassic", {}, 2.6);
  consider(agentGate, "agentdim", {}, 3.2); if (rqOn()) consider(rqGate, "rqgate", {}, 3.4);
  if (rqL && landNow === "rq") { consider(rqL.back, "lport", { to: "town" }, 2.6); consider(rqL.throne, "rqthrone", {}, 3); } // RAID QUEENS
  if (adc && landNow === "ad") { adc.doors.forEach((d) => consider(d, "adb", { b: d.userData.b }, 2.4)); consider(adc.back, "lport", { to: "town" }, 2.6); } // AD-City 1
  pvil.doors.forEach((d) => consider(d, d.userData.partner, {}, 3));
  if (plazaNow && (plazaNow.isle || plazaNow.coin)) consider(screen, "screen", {}, 2.6);
  shops.forEach((g) => consider(g, "shop", { spec: g.userData.spec }, 2.8));
  coinBuildings.forEach((g) => consider(g, "coin", { coin: g.userData.coin }, 2.4));
  consider(portal, "portal", {}, 2.4);
  if (fountDay() !== tipDay() && !landNow) consider(fountain, "fountain", {}, 5.2); // b-st3: today's coin, while it's still to toss
  lands.portals.forEach((g) => consider(g, "lport", { to: g.userData.to }, 2.6)); lands.back.forEach((g) => { if (g.parent && g.parent.visible) consider(g, "lport", { to: "town" }, 2.6); }); // b-lpv
  consider(pad, "pad", {}, 1.6);
  if (race && !race.racing()) consider(race.pad, "race", {}, 1.8);
  if (npc) consider(npc, "npc", {}, 2.4);
  if (bounty) consider(bounty, "bounty", {}, 2.0);
  return best;
}
function paintPrompt() {
  const p = $("wp-prompt");
  // the prompt fades in at the middle of the screen while you're close, and fades out as you walk on
  if (!near || frozen) { if (p.classList.contains("on")) { p.classList.remove("on"); clearTimeout(p._t); p._t = setTimeout(() => { if (!p.classList.contains("on")) p.hidden = true; }, 320); } else p.hidden = true; return; }
  clearTimeout(p._t);
  if (p.hidden) { p.hidden = false; void p.offsetWidth; }
  p.classList.add("on");
  const b = (s) => `<b>${esc(s)}</b>`;
  $("wp-enter-t").innerHTML = near.kind === "fountain" ? esc(TW("Toss a coin in the fountain")) : near.kind === "lport" ? (near.to === "town" ? b(TW("Back to town")) : TW("Go to {x}", { x: b(landName(near.to)) })) : near.kind === "land" ? land.promptHTML(near.n) : near.kind === "bounty" ? T("Read {x}", { x: b(T("the bounty board")) }) : near.kind === "screen" ? (plazaNow && plazaNow.isle ? T("Visit {x}", { x: b(T("{name}'s island", { name: plazaNow.isle.name })) }) : T("Visit {x}", { x: b("$" + ((plazaNow && plazaNow.coin && plazaNow.coin.symbol) || "")) })) : near.kind === "isle" ? T("Go to {x}", { x: b(T("My Island")) }) : near.kind === "isle-exit" ? esc(T("Back to the world")) : near.kind === "village" ? (near.mine ? T("Open {x}", { x: b(T("My village")) }) : T("Village centre · Lv {n}", { n: near.level })) : near.kind === "resident" ? T("Talk to {x}", { x: b(near.res.name) }) : near.kind === "portal" ? T("Go to {x}", { x: b(T("Platform World")) }) : near.kind === "defense" ? esc(TW("Start AC Defense")) : near.kind === "jump" ? esc(TW("Start Coin Jump")) : near.kind === "miner" ? T("Talk to {x}", { x: b(TW("the miner")) }) : near.kind === "mine" ? (mineRest > Date.now() ? esc(TW("ARCL Mine · opens in {t}", { t: restLeft(mineRest) })) : esc(TW("Enter the ARCL Mine"))) : near.kind === "rqgate" ? T("Enter {x}", { x: b("RAID QUEENS") }) : near.kind === "rqthrone" ? b(TW("Throne of Three")) + " · " + esc(TW("Lv 400+ · Sealed")) : near.kind === "agentdim" ? T("Enter {x}", { x: b(TW("AGENT DIMENSION")) }) : near.kind === "adb" ? cityPrompt(near.b, b) : near.kind === "kairo" ? T("Enter {x}", { x: b(TW("KAIRO Finance Hub")) }) : near.kind === "jurassic" ? (jurAllowed() ? T("Enter {x}", { x: b(TW("Jurassic World")) }) : esc(TW("Jurassic World · Coming soon"))) : near.kind === "beat" ? esc(TW("Start Beat Stomp")) : near.kind === "surv" ? esc(TW("Enter Survivors Arena")) : near.kind === "rings" ? esc(TW("Play INFINITY RINGS")) : near.kind === "poker" ? esc(TW("Enter ARCIA Poker Lounge")) : near.kind === "pad" ? esc(T("Fast travel")) : near.kind === "race" ? T("Start the {x}", { x: b(T("hoverboard race")) }) : near.kind === "npc" ? T("Talk to {x}", { x: b("ARCIA") }) : near.kind === "coin" ? T("Visit {x}", { x: b("$" + near.coin.symbol) }) : T("Enter {x}", { x: b(near.spec.name) });
  { const e2 = $("wp-enter2"), on = near.kind === "isle"; e2.hidden = !on; if (on) e2.innerHTML = `<span>${esc(T("Visit a friend's island"))}</span><small>${esc(island.friendCount() ? T("{n} friends, one at random", { n: island.friendCount() }) : T("No friends yet: a random island"))}</small>`; }
}
$("wp-enter").addEventListener("click", () => near && enter(near));
// at the My Island gate, a second button (b406): a friend's island, at random
$("wp-enter2").addEventListener("click", () => { if (near && near.kind === "isle") island.visitFriend(); });

// ---------------- ARCIA's favour of the day ----------------
// Talk to ARCIA on the plaza: once a day she asks a small favour (from a fixed list, the same for everyone that day);
// done, she thanks you with some XP. Kept in this browser.
const ARCIA_TASKS = [
  { id: "kill5", t: "Knock out 5 scammers for me?", n: 5, on: "kill" },
  { id: "elite1", t: "There's an elite out there. Could you knock one out?", n: 1, on: "kill", f: (k) => k && k.rank === "elite" },
  { id: "loot3", t: "Bring back 3 pieces of gear from the hunting grounds?", n: 3, on: "loot" },
  { id: "fish1", t: "I'd love a fish from one of the ponds. Catch one?", n: 1, on: "fish" },
  { id: "zone2", t: "Go and look round 2 hunting grounds for me?", n: 2, on: "zone" },
  { id: "kill12", t: "The streets are busy today. Knock out 12 scammers?", n: 12, on: "kill" },
];
const AQ_KEY = "arc.world.arciaQ";
const aqDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const aqTask = () => ARCIA_TASKS[Math.floor(Date.parse(aqDay()) / 864e5) % ARCIA_TASKS.length];
const aqGet = () => { try { const v = JSON.parse(localStorage.getItem(AQ_KEY) || "null"); return v && v.day === aqDay() ? v : { day: aqDay(), id: aqTask().id, got: 0, on: false, done: false, seen: [] }; } catch { return { day: aqDay(), id: aqTask().id, got: 0, on: false, done: false, seen: [] }; } };
const aqSet = (v) => { try { localStorage.setItem(AQ_KEY, JSON.stringify(v)); } catch { /* private */ } };
function arciaOn(kind, x) {
  const q = aqGet(), t = ARCIA_TASKS.find((y) => y.id === q.id); if (!q.on || q.done || !t || t.on !== kind || (t.f && !t.f(x))) return;
  if (kind === "zone") { const id = x && x.id; if (!id || (q.seen || []).includes(id)) return; q.seen = [...(q.seen || []), id]; }
  q.got = Math.min(t.n, q.got + 1);
  if (q.got >= t.n) { q.done = true; aqSet(q); const xp = 60 + level() * 3; setTimeout(() => { feed(T("ARCIA: thank you! That helps a lot."), "#ff7ad9"); gain(xp, T("A favour for ARCIA")); }, 400); }
  else { aqSet(q); if (q.got === Math.ceil(t.n / 2)) feed(T("ARCIA's favour: {a}/{b}", { a: q.got, b: t.n }), "#ff7ad9"); }
}
/// near ARCIA: her favour first (once a day); false when there's nothing to ask, so the chat opens as before
function arciaAsk() {
  const q = aqGet(), t = ARCIA_TASKS.find((y) => y.id === q.id); if (!t || q.done || (q.on && q.asked)) return false;
  const el = document.createElement("div"); el.className = "wp-arciaq"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-arciaq-card"><small>ARCIA</small><p>${esc(q.on ? T("How's it going? {a}/{b} so far.", { a: q.got, b: t.n }) : T(t.t))}</p><div>${q.on ? "" : `<button type="button" class="wp-btn go" data-aq="yes">${esc(T("Sure"))}</button>`}<button type="button" class="wp-btn" data-aq="chat">${esc(T("Just chat"))}</button></div></div>`;
  document.body.appendChild(el); frozen = true; keys.clear(); paintPrompt();
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-aq]"); if (!b && e.target !== el) return; el.remove(); frozen = false;
    if (b && b.dataset.aq === "yes") { q.on = true; q.asked = true; aqSet(q); toast(T("ARCIA's favour: {x}", { x: T(t.t) })); if (avatar && avatar.face) avatar.face("happy", 1.5); }
    else if (b && b.dataset.aq === "chat") { q.asked = q.on; aqSet(q); if (npc) openSheet("ARCIA", T("Arc's AI idol. Ask her anything about a coin, a wallet or this world."), "/arc#arcia"); } });
  return true;
}
// ---------------- shops, coins, ARCIA ----------------
const sheet = $("wp-sheet"), frame = $("wp-frame");
let openShop = null;
let lotCoin = null, frameT = 0;
$("wp-sheet-lot").addEventListener("click", () => { const c = lotCoin; closeSheet(); if (!c) return; const tr = LD.LOT_TIERS[lotTierOf(c)]; goIsland({ lot: { ...c, N: tr.N, max: tr.max } }); }); // b-lpv: the lot's tier: its size and brick limit
function openSheet(title, line, url) {
  $("wp-sheet-lot").hidden = true;
  $("wp-sheet-h").textContent = title; $("wp-sheet-p").textContent = line;
  $("wp-sheet-full").href = url;
  // Most shops are sections of the same page (/arc#launch, /arc#swap, …): switching between them only changes the
  // hash, which doesn't reload the frame, so its load event never comes. Then the page is already there: just move
  // to the section. A slow first load still clears its cover after a while (the page shows its own loading).
  const load = $("wp-frame-load"), cur = frame.getAttribute("src") || "", path = (u) => u.split("#")[0];
  clearTimeout(frameT);
  if (cur === url) load.hidden = true;
  else if (cur && path(cur) === path(url)) {
    load.hidden = true;
    try { frame.contentWindow.location.hash = url.split("#")[1] || ""; } catch { /* another origin: set src below */ }
    frame.setAttribute("src", url);
  } else {
    load.hidden = false;
    frame.onload = () => { load.hidden = true; clearTimeout(frameT); };
    frame.src = url;
    frameT = setTimeout(() => { load.hidden = true; }, 9000);
  }
  sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add("on"));
  frozen = true; keys.clear(); paintPrompt(); Snd.enter();
  if (avatar) avatar.play("interact-right", { once: true });
  $("wp-sheet-x").focus({ preventScroll: true });
}
// the camera leans in toward the door before the shop opens
function doorThen(g, fn) {
  if (reduce || !g) { fn(); return; }
  g.getWorldPosition(tmp); const yaw = Math.atan2(-tmp.x, -tmp.z) + Math.PI;
  const y0 = camYaw, t0 = performance.now(); frozen = true;
  entryGlow(g);
  const off = st.on(() => { const k = Math.min(1, (performance.now() - t0) / 420); camYaw = angLerp(y0, yaw, k); camZoom = 1 - 0.35 * k; if (k >= 1) { off(); fn(); } });
}
// going in: a soft column of light at the hall's door
function entryGlow(g) {
  if (reduce || !g || !g.parent) return;
  const p = g.position.clone(), d = p.clone().setY(0).normalize().multiplyScalar(-((g.userData.radius || 2) + 0.4));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3.4, 28, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe6ff).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  col.position.copy(p).add(d).setY(1.7); planet.add(col);
  const t0 = performance.now(), off = st.on(() => { const k = (performance.now() - t0) / 650; col.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.55; col.scale.set(1 - k * 0.3, 1 + k * 0.4, 1 - k * 0.3); if (k >= 1) { off(); planet.remove(col); col.geometry.dispose(); col.material.dispose(); } });
}
// wading through the fountain's pool: ripples behind you
let rippleT = 0;
function ripples(dt) {
  if (reduce || mode !== "hub" || !grounded) return;
  rippleT -= dt; if (rippleT > 0 || speedNow < 1) return;
  here(tmp2); const r = Math.hypot(tmp2.x, tmp2.z); if (r > 4.05 || r < 2.6) return;
  rippleT = speedNow > 9 ? 0.16 : 0.3;
  const m = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(tmp2.x, 0.36, tmp2.z); planet.add(m);
  const t0 = performance.now(), off = st.on(() => { const k = (performance.now() - t0) / 900; m.scale.setScalar(1 + k * 3.2); m.material.opacity = 0.8 * (1 - k); if (k >= 1) { off(); planet.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}
// stand at (x, z) facing the point c (a short teleport: arenas, the Game Village)
function standAt(x, z, c = { x: 0, z: 0 }) { planet.position.set(-x, 0, -z); hop = 0; at.y = 0; vy = 0; grounded = true; facing = Math.atan2(c.x - x, c.z - z); camYaw = facing - Math.PI; near = null; if (labels) labels.dirty = true; }
// the menu's Game Village tile: hop to the village gate, facing the square
function goPartnerVillage() { // Menu → Partner Village: to its gate, facing in
  if (frozen || flying || introOn || mode !== "hub") return; closeAll();
  const c = pvil.center, d = Math.hypot(c.x, c.z) || 1, r = pvil.r + 4; pvil.build(); standAt(c.x - (c.x / d) * r, c.z - (c.z / d) * r, c);
  vfx.teleport(here(), { color: 0x38e1d6, color2: 0x7cf5c8 }); paintPrompt();
}
function goPartnerTower(id = "kairo", k = 10) { // the map's Partner Village list: straight to a partner's building, facing its door
  if (frozen || flying || introOn || mode !== "hub") return; const d0 = pvil.door(id); if (!d0) { goPartnerVillage(); return; } closeAll(); pvil.build();
  const g = d0.getWorldPosition(new THREE.Vector3()).sub(planet.position), c = pvil.center, a = Math.atan2(g.x - c.x, g.z - c.z) + 0.55; // (a little to one side, so the camera behind you clears the square's light pillar)
  standAt(g.x - Math.sin(a) * k, g.z - Math.cos(a) * k, { x: g.x, z: g.z }); vfx.teleport(here(), { color: 0x38e1d6, color2: 0x7cf5c8 }); paintPrompt();
}
// b-lpv: a portal's trip (the town's to a land or a village; a land's back to the town, by that land's portal)
const landName = (id) => (id === "rq" ? "RAID QUEENS" : id === "ad" ? TW("Nexus City") : id === "lp" ? TW("Launchpad Village") : id === "ut" ? TW("Utility Village") : id === "pv" ? TW("Partner Village") : id === "gv" ? TW("Game Village") : TW("Town"));
const cityPrompt = (id, b) => { if (id === "pick") { const pk = adc && adc.pick(); return pk ? TW("Play {x}", { x: b(pk.title) }) + `<small class="adc-sub">${esc(TW("Studio pick"))} · ${esc(TW("by {name}", { name: pk.byName || "—" }))}</small>` : T("Open {x}", { x: b(TW("ARCIRCLE Studio")) }); } const B = adc && adc.M.BUILDINGS.find((x) => x.id === id); if (!B) return ""; return (B.open ? T("Enter {x}", { x: b(TW(B.name)) }) : b(TW(B.name)) + " · " + esc(TW("Coming soon"))) + `<small class="adc-sub">${esc(TW(B.sub))}</small>`; };
let landNow = "";
function landGo(to) {
  if (frozen || flying || introOn || mode !== "hub") return;
  if (to === "gv") { goGameVillage(); return; } if (to === "pv") { goPartnerVillage(); return; } if (to === "ad") { cityGo(); return; } if (to === "rq") { rqGo(); return; }
  closeAll();
  if (to === "town" && landNow === "ad") { const v = agentGate.position, d = Math.hypot(v.x, v.z) || 1, k = K.AGENT_GATE.r + 7; standAt(v.x - (v.x / d) * k, v.z - (v.z / d) * k, { x: 0, z: 0 }); } // (AD-City: out by the Citadel)
  else if (to === "town" && landNow === "rq") { const v = rqGate.position, d = Math.hypot(v.x, v.z) || 1, k = RQ_GATE.r + 6; standAt(v.x - (v.x / d) * k, v.z - (v.z / d) * k, { x: 0, z: 0 }); } // (RAID QUEENS: out by the Citadel)
  else if (to === "town") { const p = lands.portals.find((q) => q.userData.to === landNow) || lands.portals[0], v = p.position, d = Math.hypot(v.x, v.z) || 1; standAt(v.x - (v.x / d) * 3.4, v.z - (v.z / d) * 3.4, { x: 0, z: 0 }); }
  else { const a = lands.arrival(to); if (!a) return; standAt(a.x, a.z, a.c); }
  const col = to === "lp" ? 0x39ff88 : to === "ut" ? 0x4f9dff : 0x7fe9ff; vfx.teleport(here(), { color: col, color2: 0x2f86ff }); if (Snd.dash) Snd.dash();
  pullFlash("#" + col.toString(16).padStart(6, "0")); startSweep(1200); // b-st2: a flash of the portal's colour as it pulls you through, and the camera swings in
  landTick(true); paintPrompt();
}
/// which land you're in: its group shown, the quest's arrow through the portals, a title on arrival
function landTick(force) {
  const L = mode === "hub" ? LD.landAt(-planet.position.x, -planet.position.z) : null, id = L ? L.id : "";
  lands.show(id); if (adc) adc.show(id === "ad"); if (rqL) rqL.show(id === "rq"); if (id === landNow && !force) return;
  const was = landNow; landNow = id; if (labels) labels.dirty = true; try { paintQuests(); } catch { /* the quests aren't up yet */ }
  if (id && id !== was) { toast(`<b>${esc(landName(id))}</b>`); if (id === "lp" && !P.visited.includes("lpv")) { P.visited.push("lpv"); save(); } if (id === "ut" && !P.visited.includes("utv")) { P.visited.push("utv"); save(); } if (id === "ad" && !P.visited.includes("adc")) { P.visited.push("adc"); save(); } if (id === "rq" && !P.visited.includes("rqx")) { P.visited.push("rqx"); save(); } }
}
st.on(() => { try { landTick(false); } catch { /* still loading */ } });
/// the quest's target, by the portals when it's in another land: the portal to its land, or the way back to town
function routeTo(g) {
  if (!g) return g; const p = g.position, L = g.parent === planet ? LD.landAt(p.x, p.z) : null, id = L ? L.id : "";
  if (id === landNow) return g;
  if (landNow === "rq") return rqL ? rqL.back : g;
  if (landNow) return landNow === "ad" ? (adc ? adc.back : g) : lands.back[landNow === "lp" ? 0 : 1] || g;
  if (id === "ad") return agentGate; if (id === "rq") return rqGate;
  return lands.portals.find((q) => q.userData.to === id) || g;
}
// how many are in each land now (other players' figures), under the portals' names
// AD-City 4: other players' agents beside them in Nexus City (their presence's ag "kind:name")
every(1000, () => { try { if (!adc || !adc.shown() || !ghosts) return; const L = []; ghosts.each((g, w) => { if (!w.ag || w.gone) return; const [kind, name] = String(w.ag).split(":"); L.push({ key: w.wallet || String(w.at), kind, name, x: g.position.x, z: g.position.z }); }); if (/[?&]adwork=demo/.test(location.search)) { const v = here(new THREE.Vector3()), t = performance.now() / 1000; L.push({ key: "demo-a", kind: "aurora", name: "NOVA", x: v.x + 6 + Math.sin(t / 3) * 5, z: v.z - 4 }, { key: "demo-o", kind: "orion", name: "ATLAS", x: v.x - 6, z: v.z - 5 + Math.cos(t / 3) * 5 }); } /* (?adwork=demo: two other players' agents walking near you) */ adc.others(L); } catch { /* the next second */ } });
every(5000, () => { try { if (!ghosts || mode !== "hub") return; const n = { lp: 0, ut: 0, ad: 0 }; ghosts.each((g, w) => { if (w.gone) return; const L = LD.landAt(g.position.x, g.position.z); if (L) n[L.id]++; }); lands.count("lp", n.lp); lands.count("ut", n.ut); } catch { /* next time */ } });
function goGameVillage() {
  if (defenseOn || frozen || flying || introOn || mode !== "hub") return; closeAll();
  const c = gv.center, d = Math.hypot(c.x, c.z) || 1, r = 36; standAt(c.x - (c.x / d) * r, c.z - (c.z / d) * r, c);
  vfx.teleport(here(), { color: 0xb48cff, color2: 0x38d8ff }); paintPrompt();
}
// AC Defense (world-defense.js): the arena is the Game Village's square (the town hides, the player stays inside arenaR), run by the module
let defense = null, defenseOn = false, defenseBusy = false, arenaR = 0;
async function openDefense() {
  if (defenseOn || defenseBusy || jumpOn || beatOn || frozen || flying || introOn || mode !== "hub" || !combat || (raid && raid.inside && raid.inside()) || combat.vitals().down) return;
  defenseBusy = true; closeAll();
  try {
    if (!defense) {
      toast(TW("Getting ready"));
      let M; try { M = await import("./world-defense.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      defense = M.createDefense({ THREE, planet, st, T: TW, lang: LANG, esc, toast, Snd, vfx, parts, combat, coarse, low: lowGfx, reduce, keep: [gv.root] /* the Game Village stays (its square is the arena); the town hides */, origin: gv.center, sess, post,
        cinema: (ms) => defenseCinema(gv.center, ms), shake: (n) => { if (!reduce) shake = Math.max(shake, n); },
        place: (x, z) => standAt(x, z, gv.center),
        setArena: (r) => { arenaR = r; }, exit: () => { const e = gv.exitOf("defense"); standAt(e.x, e.z, gv.center); }, refresh: () => refreshPurse(true), onWave: () => { if (quests) quests.bump("defwave"); }, level: () => level(), enter: () => { defenseOn = true; near = null; paintPrompt(); }, leave: () => { defenseOn = false; near = null; paintPrompt(); } });
    }
    defenseOn = true; near = null; paintPrompt(); await defense.start();
    if (!defense.active()) throw new Error("start: the arena didn't open");
  } catch (e) { // never fail silently: say why (short), put everything back, and let the next tap try again
    console.warn("defense", e); if (diag && diag.err) diag.err("acd: " + String((e && e.message) || e), "openDefense"); defenseOn = false; arenaR = 0; near = null; paintPrompt();
    try { if (defense && defense.active()) defense.reset(); } catch { /* already reset */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return; // the page predates a deploy and its chunk is gone: the new page takes over
    toast(TW(why.startsWith("load:") ? "AC Defense couldn't load. Refresh the page and try again." : "AC Defense couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { defenseBusy = false; }
}
// Coin Jump (world-jumprace.js): the Game Village's second game — platforms over the square, loaded on first use
let jumpRace = null, jumpOn = false, jumpBusy = false;
async function openJump() {
  if (jumpOn || jumpBusy || defenseOn || beatOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  jumpBusy = true; closeAll();
  try {
    if (!jumpRace) {
      let M; try { M = await import("./world-jumprace.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      jumpRace = M.createJumpRace({ THREE, planet, T: TW, lang: LANG, esc, toast, Snd, vfx, reduce, low: lowGfx, coarse, origin: gv.center, keep: [gv.root],
        pos: () => ({ x: -planet.position.x, y: hop, z: -planet.position.z }), place: (x, z) => standAt(x, z, gv.center), lift: (y) => { hop = y; at.y = y; vy = 0; grounded = true; },
        warm: () => st.warm(2500), onCrown: () => { if (quests) quests.bump("jumpcrown"); if (!P.visited.includes("gvcrown")) { P.visited.push("gvcrown"); save(); checkQuests(); } /* kept in visited: the server keeps that list */ }, sess, post, refresh: () => refreshPurse(true), boost: (v) => { vy = v; grounded = false; jumpHeld = false; }, setArena: (r) => { arenaR = r; }, leave: () => { jumpOn = false; near = null; paintPrompt(); const e = gv.exitOf("jump"); standAt(e.x, e.z, gv.center); } });
      st.on((dt, t) => { if (jumpRace) jumpRace.tick(dt, t); });
    }
    { const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); } } // b446: a short fade in, and the camera comes down over the course
    jumpOn = true; near = null; paintPrompt(); jumpRace.start(); if (!reduce) defenseCinema(gv.center, 1700);
  } catch (e) {
    console.warn("jump", e); if (diag && diag.err) diag.err("jump: " + String((e && e.message) || e), "openJump"); jumpOn = false; arenaR = 0; near = null; paintPrompt();
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW("Coin Jump couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { jumpBusy = false; }
}
// the ARCL Mine (world-mine.js): a side-on cave behind the Mining Village's tunnel, loaded the first time you walk in.
// Its scene is drawn instead of the town (st.view) while you're inside; the town waits, frozen, and you come back out
// in front of the tunnel. What pays is the server's (api/_world-mine.mjs); a guest mines a demo.
const restLeft = (t) => { const m = Math.max(1, Math.ceil((t - Date.now()) / 60e3)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; };
// the mine's module, made once (openMine, and the preload when you come near the village)
let mineMaking = null;
function ensureMine() { if (mineGame) return Promise.resolve(mineGame); if (mineMaking) return mineMaking; mineMaking = (async () => {
  let M; try { M = await import("./world-mine.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
  mineGame = M.createMine({ THREE, K, st, ver: VER, T: TW, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, shop: arclShop, level, gain: (n, why) => gain(n, why),
        makeHero: () => K.makeCharacter(heroOf(P.char || "arc-arc"), VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }),
        refresh: () => refreshPurse(true), addSupply: (k, n) => !!(rpg && rpg.addSupply && rpg.addSupply(k, n)), onShopClose: () => { frozen = false; keys.clear(); near = null; paintPrompt(); }, goMine: () => setTimeout(() => openMine(), 60),
        onLeave: () => { const veil = $("wp-veil"); mineOn = false; frozen = false; keys.clear(); const e = mv.exit(); standAt(e.x, e.z, { x: e.x + Math.sin(e.face) * 5, z: e.z + Math.cos(e.face) * 5 }); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); mineStatus(); } });
  return mineGame; })().finally(() => { mineMaking = null; }); return mineMaking; }
// ---------------- Jurassic World (world-jurassic.js), loaded the first time a GM walks through the portal ----------------
// the gate is shut to everyone else: a short note, nothing loaded. (The land has no rewards yet; when it does, the server
// checks the GM wallet too.)
const jurAllowed = () => true; // open to everyone (guests walk and look; gathering, crafting and a camp need a signed-in wallet)
setInterval(() => { if ((jurOn || survOn || ringsOn || pokerOn) && !frozen) { frozen = true; keys.clear(); } }, 250); // in Jurassic World the town stays frozen (a window closing there unfroze it)
// b-jy3: the boss hour's call in town — five minutes before 12:00 and 20:00 (Seoul) and as it starts, a card with the way
// there (into Jurassic World and on to the boss). The hours mirror api/_world-jur.mjs JUR.BOSS.at.
const JUR_BOSS_AT = [[12, "alpha"], [20, "titan"]], jurCalled = new Set();
every(20e3, () => {
  if (jurOn || mode !== "hub" || introOn || !jurAllowed()) return;
  const t = Date.now(), k = t + 9 * 3600e3, d0 = Math.floor(k / 864e5) * 864e5;
  for (const off of [0, 1]) for (const [h, kind] of JUR_BOSS_AT) { const st0 = d0 + off * 864e5 + h * 3600e3 - 9 * 3600e3, id = st0 + kind, left = st0 - t, on = t >= st0 && t < st0 + 25 * 60e3;
    if (jurCalled.has(id) || !(on || (left > 0 && left <= 5 * 60e3))) continue; jurCalled.add(id);
    const name = TW(kind === "titan" ? "Thornback Titan" : "Alpha Raptor"), c = document.createElement("div"); c.className = "wp-bosscall"; c.setAttribute("role", "status");
    c.innerHTML = `<b>🦖 ${esc(on ? TW("{b} is enraged — boss hour!", { b: name }) : TW("{b} wakes in 5 minutes", { b: name }))}</b><span>${esc(TW("Jurassic World"))}</span><button type="button" class="wp-btn">${esc(TW("Take me there"))}</button><button type="button" class="x" aria-label="${esc(TW("Close"))}">✕</button>`;
    c.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; c.remove(); if (!b.classList.contains("x")) openJurassic().then(() => { if (jurOn && jurGame && jurGame.goBoss) setTimeout(() => jurGame.goBoss(kind), 2500); }); });
    document.body.appendChild(c); if (Snd.horn) Snd.horn(); setTimeout(() => c.remove(), 30000); return; }
});
async function openJurassic() {
  if (jurOn || jurBusy || mineOn || defenseOn || jumpOn || beatOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  if (!jurAllowed()) { toast(TW("Jurassic World is coming soon. The portal opens to everyone at launch.")); if (avatar && grounded) avatar.play("emote-no", { once: true }); return; }
  jurBusy = true; closeAll(); document.querySelectorAll(".wp-tips").forEach((e) => e.remove()); tipsUp = false; // (town tips still up: Jurassic World's own card comes)
  const veil = $("wp-veil");
  try {
    if (!jurGame) {
      let M; try { M = await import("./world-jurassic.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      jurGame = M.createJurassic({ input: () => ({ joy: joy ? { dx: joy.dx, dy: joy.dy } : null, run: runToggle || gpad.run, gx: gpad.x, gy: gpad.y, yaw: camYaw, pitch: camPitch, zoom: camGoal }), setView: (v) => { if (v.yaw != null) camYaw = v.yaw; if (v.pitch != null) camPitch = v.pitch; if (v.zoom != null) camGoal = camDist = v.zoom; }, hurt: (n) => (combat ? combat.hurtMe(n) : null), vitals: () => (combat ? combat.vitals() : null), heal: (k) => (combat && combat.heal ? combat.heal(k) : null), coach: (k, steps) => coach(k, steps), tips: (rows, o) => showTips(rows, o), Snd, sess, post, share: (c) => bragCard(c), level, lang: LANG, char: () => P.char || "arc-arc", music: () => music, stats: () => { try { return rpg && rpg.stats ? rpg.stats() : null; } catch { return null; } }, refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why), THREE, K, st, ver: VER, makeGate: (n) => JG.makeJurassicGate(THREE, K, n, { low: lowGfx }), T: TW, esc, toast, reduce, low: lowGfx, coarse,
        makeHero: () => K.makeCharacter(heroOf(P.char || "arc-arc"), VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }),
        onLeave: () => { jurOn = false; frozen = false; setTimeout(() => dinoTown.look(), 300); try { music.setList(MUS.PLAYLIST); } catch { /* fine */ } keys.clear(); const g = jurGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * 4, g.z - g.z / d * 4, { x: 0, z: 0 }); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
    }
    if (veil && !reduce) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await jurGame.enter();
    if (ok) { jurOn = true; try { music.setList(MUS.JURASSIC); } catch { /* the town's music plays on */ } } else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) {
    console.warn("jurassic", e); if (diag && diag.err) diag.err("jurassic: " + String((e && e.message) || e), "openJurassic"); jurOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-jurassic"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW("Jurassic World couldn't open") + " — " + esc(why.slice(0, 80)));
  } finally { jurBusy = false; }
}
async function openMine() {
  if (mineOn || mineBusy || defenseOn || jumpOn || beatOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  mineBusy = true; closeAll();
  const veil = $("wp-veil");
  try {
    await ensureMine();
    if (veil && !reduce) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await mineGame.enter();
    if (ok) mineOn = true; else { frozen = false; mineStatus(); }
    if (veil) veil.style.opacity = "0";
  } catch (e) {
    console.warn("mine", e); if (diag && diag.err) diag.err("mine: " + String((e && e.message) || e), "openMine"); mineOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); document.body.classList.remove("wp-mining"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "The ARCL Mine couldn't load. Refresh the page and try again." : "The ARCL Mine couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { mineBusy = false; }
}
// SURVIVORS ARENA (world-survivors.js): the Game Village's 12-minute survival game, loaded the first time its door is used.
// Like the mine, its scene is drawn instead of the town (st.view) while you're in; the town waits, frozen, and you come
// back out in front of the arena's door. What pays is the server's (api/_world-survivors.mjs).
let survGame = null, survOn = false, survBusy = false;
async function openSurvivors() {
  if (survOn || survBusy || mineOn || defenseOn || jumpOn || beatOn || jurOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  survBusy = true; closeAll(); document.querySelectorAll(".wp-tips,.wp-coach,.wp-coach-ring").forEach((e) => e.remove()); tipsUp = false; // (town tips or a tour bubble still up: they'd sit over the arena)
  const veil = $("wp-veil");
  try {
    if (!survGame) {
      let M; try { M = await import("./world-survivors.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      survGame = M.createSurvivors({ THREE, K, st, ver: VER, T: TW, lang: LANG, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, share: (c) => bragCard(c), quality: S.quality || "auto", fam: diag.fam || "", fps: (n) => st.fps(n || S.fpsCap || autoCap || 60), fpsSet: () => !!S.fpsCap, refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why),
        makeHero: (id) => K.makeCharacter(id, VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }), addSupply: (k, n) => { const ok = !!(rpg && rpg.addSupply && rpg.addSupply(k, n)); try { if (ok && combat && combat.paintPots) combat.paintPots(); } catch { /* shown on the next repaint */ } return ok; },
        onLeave: () => { survOn = false; frozen = false; svAch = null; keys.clear(); const e = gv.exitOf("surv"); standAt(e.x, e.z, gv.center); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
    }
    if (veil && !reduce) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await survGame.enter();
    if (ok) survOn = true; else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) { // never fail silently: say why (short), put the town back, and let the next tap try again
    console.warn("survivors", e); if (diag && diag.err) diag.err("surv: " + String((e && e.message) || e), "openSurvivors"); survOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-surv"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "Survivors Arena couldn't load. Refresh the page and try again." : "Survivors Arena couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { survBusy = false; }
}
// INFINITY RINGS (world-rings.js): the Game Village's ring puzzle in the palace, loaded the first time its door is used.
// Its own scene is drawn instead of the town (st.view) while you're in, like SURVIVORS ARENA; you come back out in front
// of the palace. What pays is the server's (api/_world-rings.mjs). Level 100 cleared: the INFINITY MASTER title.
let ringsGame = null, ringsOn = false, ringsBusy = false, ringsMaster = false, ringsLegend = false;
try { const j = JSON.parse(localStorage.getItem("arc.world.rings") || "{}"); ringsMaster = !!j.master; ringsLegend = !!j.legend; } catch { /* earned again on the next clear */ }
async function ensureRings(veil = $("wp-veil")) { // (the puzzle hall's game, made the first time it's needed: its door, or a Studio puzzle)
  if (!ringsGame) {
      let M; try { M = await import("./world-rings.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      ringsGame = M.createRings({ THREE, K, st, ver: VER, hero: () => ({ ch: heroOf(P.char || "custom-aron"), tn: P.tint || 0 }), share: (c) => bragCard(c), T: TW, lang: LANG, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, quality: S.quality || "auto", fam: diag.fam || "", name: () => P.name || "", refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why),
        onMaster: () => { ringsMaster = true; badges(); paintAura(); },
        onLegend: () => { ringsLegend = true; badges(); },
        onLeave: () => { ringsOn = false; frozen = false; keys.clear(); const e = gv.exitOf("rings"); standAt(e.x, e.z, gv.center); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
    }  return ringsGame;
}
async function openRings() {
  if (ringsOn || ringsBusy || pokerOn || pokerBusy || survOn || mineOn || defenseOn || jumpOn || beatOn || jurOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  ringsBusy = true; closeAll(); document.querySelectorAll(".wp-tips,.wp-coach,.wp-coach-ring").forEach((e) => e.remove()); tipsUp = false;
  const veil = $("wp-veil");
  try {
    await ensureRings(veil);

    if (veil && !reduce) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await ringsGame.enter();
    if (ok) ringsOn = true; else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) { // never fail silently: say why (short), put the town back, and let the next tap try again
    console.warn("rings", e); if (diag && diag.err) diag.err("rings: " + String((e && e.message) || e), "openRings"); ringsOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-rings"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "INFINITY RINGS couldn't load. Refresh the page and try again." : "INFINITY RINGS couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { ringsBusy = false; }
}
// ARCIA POKER LOUNGE (world-poker.js): Texas Hold'em in the Game Village's lounge, loaded the first time its door is
// used. Its own scene is drawn instead of the town while you're in, like INFINITY RINGS; you come back out in front of
// the lounge. Chips are play money; the lounge's ARCL is its daily missions, paid by the server (api/_world-poker.mjs).
let pokerGame = null, pokerOn = false, pokerBusy = false;
async function openPoker() {
  if (pokerOn || pokerBusy || ringsOn || ringsBusy || survOn || mineOn || defenseOn || jumpOn || beatOn || jurOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  pokerBusy = true; closeAll(); document.querySelectorAll(".wp-tips,.wp-coach,.wp-coach-ring").forEach((e) => e.remove()); tipsUp = false;
  const veil = $("wp-veil");
  try {
    if (!pokerGame) {
      let M; try { M = await import("./world-poker.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      pokerGame = M.createPoker({ THREE, K, st, ver: VER, hero: () => ({ ch: heroOf(P.char || "custom-aron"), tn: P.tint || 0 }), T: TW, lang: LANG, esc, toast, Snd, reduce, low: lowGfx, coarse, sess, post, share: (c) => bragCard(c), quality: S.quality || "auto", name: () => P.name || "", refresh: () => refreshPurse(true), gain: (n, why) => gain(n, why),
        onLeave: () => { pokerOn = false; frozen = false; keys.clear(); const e = gv.exitOf("poker"); standAt(e.x, e.z, gv.center); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 320); } near = null; paintPrompt(); } });
    }
    if (veil && !reduce) { veil.style.opacity = "1"; await sleep(320); }
    frozen = true; keys.clear(); near = null; paintPrompt();
    const ok = await pokerGame.enter();
    if (ok) pokerOn = true; else frozen = false;
    if (veil) veil.style.opacity = "0";
  } catch (e) { // never fail silently: say why (short), put the town back, and let the next tap try again
    console.warn("poker", e); if (diag && diag.err) diag.err("poker: " + String((e && e.message) || e), "openPoker"); pokerOn = false; frozen = false; near = null; paintPrompt(); if (veil) veil.style.opacity = "0";
    try { st.view(null); st.solo(null); document.body.classList.remove("wp-poker"); } catch { /* the town draws again */ }
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW(why.startsWith("load:") ? "The poker lounge couldn't load. Refresh the page and try again." : "The poker lounge couldn't open") + " — " + esc(why.slice(0, 80)));
  } finally { pokerBusy = false; }
}
// near the Game Village: the arena's game and its monsters' file fetched ahead, so the first visit doesn't wait on them
let survPre = false;
st.on(() => { if (survPre || mode !== "hub") return; const d = Math.hypot(-planet.position.x - gv.center.x, -planet.position.z - gv.center.z); if (d > 70) return; survPre = true;
  import("./world-survivors.js").catch(() => {}); fetch("models/world/survivors/monsters.glb?v=" + VER).catch(() => {}); import("./world-rings.js").catch(() => {}); import("./world-poker.js").catch(() => {}); });
// when the mine opens again (the tunnel's prompt says so); read when you come near and after a visit
let mineAsked = 0;
function mineStatus() { if (!mineGame) { const s = sess(); if (!s) return; fetch("/api/social?world=mine&wallet=" + s.wallet, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { mineRest = (j && j.coolUntil) || 0; paintPrompt(); }).catch(() => {}); return; }
  mineGame.status().then((j) => { mineRest = (j && j.coolUntil) || 0; paintPrompt(); }).catch(() => {}); }
let minePre = false;
st.on(() => { if (mineOn || mode !== "hub") return; const n = performance.now(); if (n - mineAsked < 30000) return; const v = MV.MINE_VILLAGE, d = Math.hypot(-planet.position.x - v.x, -planet.position.z - v.z);
  // coming near (45 m): the mine's module, models and shaders get ready in the background, so the tunnel opens at once
  if (!minePre && d < v.r + 45 && !frozen) { minePre = true; ensureMine().then((g) => g && g.preload && g.preload()).catch((e) => { minePre = false; console.warn("mine preload", e); }); }
  if (d > v.r + 6) return; mineAsked = n; mineStatus(); });
// b446: Beat Stomp, the rhythm game (world-beatstomp.js), loaded the first time its door is used
let beatGame = null, beatOn = false, beatBusy = false;
async function openBeat() {
  if (beatOn || beatBusy || jumpOn || defenseOn || frozen || flying || introOn || mode !== "hub" || (combat && combat.vitals().down)) return;
  beatBusy = true; closeAll();
  try {
    if (!beatGame) {
      let M; try { M = await import("./world-beatstomp.js"); } catch (e) { throw Object.assign(new Error("load: " + ((e && e.message) || e)), { stage: "load" }); }
      const face = { x: gv.center.x, z: gv.center.z - 10 };
      beatGame = M.createBeatStomp({ THREE, planet, T: TW, lang: LANG, esc, toast, Snd, vfx, reduce, low: lowGfx, coarse, origin: gv.center, keep: [gv.root],
        soundOn: () => !!S.sound, music, place: (x, z) => standAt(x, z, face), boost: (v) => { vy = v; grounded = false; jumpHeld = false; },
        warm: () => st.warm(2500), onDone: () => { if (quests) quests.bump("beatsong"); },
        setArena: (r) => { arenaR = r; }, leave: () => { beatOn = false; near = null; paintPrompt(); const e = gv.exitOf("beat"); standAt(e.x, e.z, gv.center); } });
      st.on((dt, t) => { if (beatGame) beatGame.tick(dt, t); });
    }
    { const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); } }
    beatOn = true; near = null; paintPrompt(); beatGame.start();
  } catch (e) {
    console.warn("beat", e); if (diag && diag.err) diag.err("beat: " + String((e && e.message) || e), "openBeat"); beatOn = false; arenaR = 0; near = null; paintPrompt();
    const why = String((e && e.message) || e);
    if (why.startsWith("load:") && staleReload()) return;
    toast(TW("Beat Stomp couldn't start") + " — " + esc(why.slice(0, 80)));
  } finally { beatBusy = false; }
}
// A chunk this page was built with is gone from the server (a deploy landed after the page loaded; /w/ keeps a few
// builds, but not forever): the only cure is the new page. At most once per two minutes, so a real outage shows its
// error instead of a reload loop; the game saves first and comes back to the Game Village, where the tap was.
const RESUME = "arc.world.resume", RELOADED = "arc.world.reloadAt";
function staleReload() {
  let last = 0; try { last = Number(sessionStorage.getItem(RELOADED)) || 0; } catch { /* private window */ }
  if (Date.now() - last < 120e3) {
    // it reloaded a moment ago and still asks for an old chunk: the browser gave back a cached copy of the page. Once
    // more, with a fresh address no cache has seen (the ?fresh= comes off the address again when the page loads)
    let fr = 0; try { fr = Number(sessionStorage.getItem("arc.world.freshAt")) || 0; sessionStorage.setItem("arc.world.freshAt", String(Date.now())); } catch { return false; }
    if (Date.now() - fr < 300e3) return false; // (once in five minutes: after that the toast says to refresh)
    try { writeLocal(); } catch { /* best effort */ }
    toast(TW("New version — updating…")); setTimeout(() => { const u = new URL(location.href); u.searchParams.set("fresh", Date.now().toString(36)); location.replace(u.toString()); }, 900);
    return true;
  }
  try { sessionStorage.setItem(RELOADED, String(Date.now())); sessionStorage.setItem(RESUME, "gv"); } catch { return false; }
  try { writeLocal(); } catch { /* best effort */ }
  toast(TW("New version — updating…")); setTimeout(() => location.reload(), 900);
  return true;
}
// the address after a fresh reload (staleReload): the ?fresh= mark comes off
try { const u = new URL(location.href); if (u.searchParams.has("fresh")) { u.searchParams.delete("fresh"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } } catch { /* the mark stays, harmless */ }
// AC Defense's entry: the camera starts high over the arena and eases down to its place behind the player (the landing's
// slow follow, landUntil); any key or tap skips to the quick follow. Nothing with reduced motion
function defenseCinema(c, ms = 2000) {
  if (reduce || introOn) return;
  const x = c.x + planet.position.x, z = c.z + planet.position.z, t = performance.now();
  cam.position.set(x, 24, z + 7); camLookS.set(x, 0, z); lookInit = true; cam.lookAt(camLookS); landUntil = t + ms;
  const skip = () => { if (performance.now() - t > 120) { landUntil = 0; off(); } }, off = () => { removeEventListener("keydown", skip, true); removeEventListener("pointerdown", skip, true); };
  addEventListener("keydown", skip, true); addEventListener("pointerdown", skip, true); setTimeout(off, ms + 50);
}
function enter(n) {
  if (n.kind === "isle") { goIsland({}); return; }
  if (n.kind === "screen") { if (plazaNow && plazaNow.isle) goIsland({ visit: plazaNow.isle.wallet }); else if (plazaNow && plazaNow.coin) openSheet("$" + plazaNow.coin.symbol, T("On the plaza billboard"), "/arc#coin/" + plazaNow.coin.token); return; }
  if (n.kind === "isle-exit") { leaveIsland(); return; }
  if (n.kind === "village") { if (n.mine) openVillage(); else village.show("contest"); return; }
  if (n.kind === "resident") { island.talk(n.res); return; }
  if (n.kind === "portal") { portalGo(n.g); return; }
  if (n.kind === "lport") { landGo(n.to); return; }
  if (n.kind === "fountain") { tossCoin(); return; }
  if (n.kind === "pad") { openMap(); return; }
  if (n.kind === "defense") { openDefense(); return; }
  if (n.kind === "jump") { openJump(); return; }
  if (n.kind === "mine") { openMine(); return; }
  if (n.kind === "jurassic") { openJurassic(); return; }
  if (n.kind === "agentdim") { agentWarp(); return; }
  if (n.kind === "adb") { cityBuilding(n.b); return; }
  if (n.kind === "rqgate") { rqWarp(); return; }
  if (n.kind === "rqthrone") { if (rqL) rqL.page("trinity", { cta: "Close" }); return; }
  if (n.kind === "kairo") { openPartner("kairo"); return; }
  if (n.kind === "land") { land.refresh().then(() => land.detail(n.n)); return; }
  if (n.kind === "miner") { if (frozen) return; frozen = true; keys.clear(); ensureMine().then((g) => g.openShop("picks")).catch((e) => { frozen = false; toast(TW("The ARCL Mine couldn't load. Refresh the page and try again.") + " — " + esc(String((e && e.message) || e).slice(0, 60))); }); return; }
  if (n.kind === "beat") { openBeat(); return; }
  if (n.kind === "surv") { openSurvivors(); return; }
  if (n.kind === "rings") { openRings(); return; }
  if (n.kind === "poker") { openPoker(); return; }
  if (n.kind === "bounty") { if (quests && rpg) { quests.setTab("daily"); rpg.show("log"); } return; }
  if (n.kind === "race") { race.start(); return; }
  if (n.kind === "npc") { if (arciaAsk()) return; doorThen(n.g, () => openSheet("ARCIA", T("Arc's AI idol. Ask her anything about a coin, a wallet or this world."), "/arc#arcia")); return; }
  if (n.kind === "coin") {
    const c = n.coin;
    doorThen(n.g, () => { openSheet("$" + c.symbol, `${c.name || c.symbol} · ${T("market cap {v}", { v: usd(Number(c.marketCapUsd) || 0) })}${n.g.userData.mine ? " · " + T("your coin") : ""}`, "/arc#coin/" + c.token); $("wp-sheet-lot").hidden = !n.g.userData.mine; lotCoin = { token: lc(c.token), symbol: c.symbol }; });
    openShop = n.g;
    if (!P.visited.includes("coin")) { P.visited.push("coin"); save(); }
    checkQuests(); return;
  }
  const s = n.spec;
  if (s.id === "forge") { doorThen(n.g, () => { camZoom = 1; frozen = false; rpg.show("forge"); }); return; }
  if (s.id === "arcl-shop" || s.id === "arcl-ex") {
    doorThen(n.g, () => { camZoom = 1; frozen = false; if (s.id === "arcl-shop") arclShop.openShop(); else arclShop.openExchange(); });
    if (!P.visited.includes(s.id)) { P.visited.push(s.id); gain(10, T("found the {name}", { name: s.name })); }
    daily("shop", s.id); checkQuests(); return;
  }
  doorThen(n.g, () => openSheet(s.name, s.line, s.url));
  if (n.g.userData.chestOpen) { n.g.userData.chestOpen(); const ch = n.g.userData.chest; if (ch) vfx.chest(ch.getWorldPosition(new THREE.Vector3()).sub(planet.position)); }
  openShop = n.g;
  if (!P.visited.includes(s.id)) { P.visited.push(s.id); gain(10, T("found the {name}", { name: s.name })); }
  daily("shop", s.id); tutorialStep(2);
  checkQuests();
}
function closeSheet() {
  if (sheet.hidden) return;
  if (openShop && openShop.userData.chestClose) openShop.userData.chestClose();
  openShop = null; camZoom = 1;
  sheet.classList.remove("on"); setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 260);
  frozen = false; refreshPurse(true); refreshCoins();
}
$("wp-sheet-x").addEventListener("click", closeSheet);
addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.arcWorld === "close") closeSheet(); });

// ---------------- Coin City, the live feed and rockets: real ArcPad data (/api/c?view=launches) ----------------
const feedEl = $("wp-feed");
// before the landing, news waits (so the first items aren't gone by the time the dive ends)
let landed = false; const feedQ = [];
function feed(html, color = "#39ff88") {
  if (!landed) { feedQ.push([html, color]); return; }
  const li = document.createElement("li"); li.setAttribute("data-no-i18n", ""); li.innerHTML = `<i style="--c:${color}"></i><span>${html}</span>`;
  feedEl.prepend(li); requestAnimationFrame(() => li.classList.add("on"));
  while (feedEl.children.length > 4) feedEl.lastChild.remove();
  setTimeout(() => { li.classList.remove("on"); setTimeout(() => li.remove(), 400); }, coarse ? 7000 : 16000);
}
// b-lpv: every ArcPad coin's lot in the Launchpad Village (world-lands.js layoutLots), its size by its market cap's tier
// (or the biggest it reached: the server's, lotTiers); the coin's building stands on it, bigger with the tier
const lotTiers = {}; let coinSig = "";
const lotTierOf = (c) => Math.max(LD.tierOfCap(c.marketCapUsd), lotTiers[lc(c.token)] || 0);
// whose coins are yours: the connected wallet, or the signed-in one when the wallet isn't connected on this page
const myW = () => lc(addr() || (sess() && sess().wallet) || "");
function buildCoinCity(list) {
  if (!kit) return;
  coinBuildings.splice(0).forEach((g) => planet.remove(g));
  const me = myW();
  const { lots, r, rings } = LD.layoutLots(list, lotTierOf); lands.sizeTo(r, rings);
  coinSig = list.map((c) => c.token + ":" + lotTierOf(c)).join(",");
  lots.forEach((L) => {
    const c = L.coin, mine = !!me && lc(c.creator) === me, g = lands.makeLot(L);
    const b = K.makeCoinBuilding(kit, c, mine), k = [1.25, 1.6, 2.1, 2.7][L.tier]; b.scale.setScalar(k); g.add(b);
    g.userData = { ...g.userData, coin: c, mine, radius: Math.max(2.5 * k, L.size * 0.42), building: b, tag: b.userData.tag, body: b.userData.body, spin: b.userData.spin, tier: L.tier };
    planet.add(g); spins.push(...b.userData.spin); coinBuildings.push(g);
  });
  lands.setNewest(list.slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0))[0] || null);
  try { launchFireworks(list.slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0))[0]); } catch { /* fine */ }
  if (labels) labels.dirty = true; farCull.rescan();
  dressLots();
}
// a coin's creator can build its lot brick by brick (world-island.js, lot mode); those builds replace the stock building
async function dressLots() {
  if (!coinBuildings.length) return;
  try {
    const ids = coinBuildings.map((g) => lc(g.userData.coin.token)), j = { lots: {}, tiers: {} };
    for (let i = 0; i < ids.length; i += 50) { const r = await fetch("/api/social?world=lots&coins=" + ids.slice(i, i + 50).join(",")); if (!r.ok) return; const q = await r.json(); Object.assign(j.lots, q.lots || {}); Object.assign(j.tiers, q.tiers || {}); }
    // a lot that grew bigger before (the server keeps its biggest tier): built again at that size, once
    let grew = false; for (const [c, t] of Object.entries(j.tiers)) if ((t | 0) > (lotTiers[c] || 0)) { lotTiers[c] = t | 0; grew = true; }
    if (grew && coinData) { buildCoinCity(coinData); return; }
    coinBuildings.forEach((g) => {
      const d = j.lots && j.lots[lc(g.userData.coin.token)]; if (!d || !d.data) return;
      const sg = island.makeStatic(d.data); if (!sg) return;
      if (g.userData.lotG) g.remove(g.userData.lotG);
      const b = g.userData.building, kb = b ? b.scale.x : 1, k = (g.userData.size || 4.6) / (sg.userData.N || 9); sg.scale.setScalar(k); sg.position.y = 0.2; g.add(sg); g.userData.lotG = sg; // (the build fills its lot: half a metre a brick at the tier's own size)
      if (g.userData.body) g.userData.body.visible = false;
      g.userData.tag.position.y = (sg.userData.h * k + 1.9) / kb;
      if (sg.userData.N === 13 && !g.userData.spot) { const bc = K.makeBeacon(0xffc861, 16); g.add(bc); g.userData.spin.push(bc.userData.spin); spins.push(bc.userData.spin); g.userData.spot = bc; } // (the premium lot keeps its spotlight in the village)
    });
    if (labels) labels.dirty = true;
  } catch { /* the stock buildings stay */ }
}
const ago = (t) => { const s = Math.max(1, Date.now() / 1000 - t); return s < 90 ? T("just now") : s < 3600 ? T("{n} min ago", { n: Math.round(s / 60) }) : s < 86400 ? T("{n} h ago", { n: Math.round(s / 3600) }) : T("{n} d ago", { n: Math.round(s / 86400) }); };
async function refreshCoins(first) {
  let j = null;
  try { const r = await fetch("/api/c?view=launches", { cache: "no-store" }); if (r.ok) j = await r.json(); } catch { /* offline: keep what we have */ }
  const list = (j && Array.isArray(j.launches) ? j.launches : []).filter((c) => c && c.token && c.symbol);
  if (!list.length) return;
  const newest = Math.max(...list.map((c) => c.launchedAt || 0));
  const me = myW();
  myCoins = me ? list.filter((c) => lc(c.creator) === me) : [];
  if (first || !coinData) {
    list.slice().sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 3).reverse().forEach((c) => feed(T("{x} launched on ArcPad {when}", { x: `<b>$${esc(c.symbol)}</b>`, when: ago(c.launchedAt) }), "#4f9dff"));
  } else {
    if (newest > lastSeen) { list.filter((c) => c.launchedAt > lastSeen).slice(0, 3).forEach((c) => { feed(T("New on ArcPad: {x} just launched", { x: `<b>$${esc(c.symbol)}</b>` })); launchRocket(); }); const lp = shopG("launch"); if (lp && typeof live !== "undefined") { live.fireworks(lp.position.x, lp.position.z, 7); live.refresh(); } }
    // a building pulses when its coin's market cap climbs
    const old = new Map(coinData.map((c) => [c.token, Number(c.marketCapUsd) || 0]));
    coinBuildings.forEach((g) => { const c = list.find((x) => x.token === g.userData.coin.token); if (!c) return; const was = old.get(c.token) || 0, now = Number(c.marketCapUsd) || 0; if (was > 0 && now > was * 1.03) { (g.userData.building || g).userData.pulse = 1; feed(T("{x} market cap up {p}%", { x: `<b>$${esc(c.symbol)}</b>`, p: Math.round((now / was - 1) * 100) }), "#39ff88"); } });
  }
  lastSeen = newest;
  const changed = !coinData || coinData.length !== list.length || myCoins.length !== (coinData.mine || 0) || list.map((c) => c.token + ":" + lotTierOf(c)).join(",") !== coinSig; // (b-lpv: a coin moving up a tier gets its bigger lot)
  coinData = list; coinData.mine = myCoins.length;
  if (changed) buildCoinCity(list);
  checkQuests(); if (myCoins.length) arclChecks();
}
const rockets = [];
function launchRocket() {
  const lp = shopG("launch"); if (!lp) return;
  rockets.push(K.rocketLaunch(planet, lp.position.clone()));
  lp.getWorldPosition(tmp); if (tmp.distanceTo(at) < 45) { Snd.rocket(); shake = 0.6; }
}
every(45000, () => refreshCoins(false));

// ---------------- $ARCIRCLE: the Exchange board, the Burn Furnace, the whale, the weather (/api/social?token=arcircle) ----------------
let lastBurnTs = 0, lastBig = "", whale = null, mood = "";
function paintBoard() {
  if (!board3) return;
  const s = arcStats;
  board3.userData.draw((g, w, h) => {
    g.fillStyle = "#06101a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8fe9df"; g.font = "700 30px Sora, sans-serif"; g.fillText("$ARCIRCLE", 22, 46);
    const up = s && s.change24h != null && s.change24h >= 0;
    g.fillStyle = "#ffffff"; g.font = "700 64px Sora, sans-serif"; g.fillText(s && s.price ? "$" + (s.price < 0.01 ? s.price.toPrecision(3) : s.price.toFixed(4)) : "—", 22, 128);
    g.fillStyle = s && s.change24h != null ? (up ? "#39ff88" : "#ff6b81") : "#9fb2c4"; g.font = "700 34px Sora, sans-serif";
    g.fillText(s && s.change24h != null ? (up ? "▲ " : "▼ ") + Math.abs(s.change24h).toFixed(2) + "% 24h" : "", 22, 182);
    g.fillStyle = "#9fb2c4"; g.font = "600 24px Sora, sans-serif"; g.fillText(s && s.vol24h != null ? "Vol " + usd(s.vol24h) + (s.burned ? "  ·  Burned " + Math.round(s.burned.tokens).toLocaleString("en-US") : "") : "", 22, h - 18);
  });
}
async function refreshArc() {
  let s = null;
  try { const r = await fetch("/api/social?token=arcircle"); if (r.ok) s = await r.json(); } catch { /* keep the last */ }
  if (!s || s.error) return;
  const first = !arcStats; arcStats = s; paintBoard();
  const list = (s.burned && s.burned.list) || [];
  const newest = list.length ? Math.max(...list.map((b) => b.ts || 0)) : 0;
  if (!first && newest > lastBurnTs) { const b = list.find((x) => x.ts === newest); burnFire(b ? b.tokens : 0); }
  lastBurnTs = Math.max(lastBurnTs, newest);
  const big = (s.recent || []).find((t) => t.usdc >= 250);
  const sig = big ? big.side + big.usdc + big.tokens : "";
  if (!first && big && sig !== lastBig) { swimWhale(); feed(T("A whale {side} {v} of $ARCIRCLE", { side: big.side === "buy" ? W("bought") : W("sold"), v: usd(big.usdc) }), "#4f9dff"); }
  lastBig = sig || lastBig;
  const m = s.change24h == null ? "" : s.change24h >= 5 ? "aurora" : s.change24h <= -5 ? "rain" : "clear";
  if (m !== mood) { if (mood === "rain" && m !== "rain") rainbowT = 240; mood = m; aurora.visible = m === "aurora"; rain.visible = m === "rain"; setWet(m === "rain"); if (!first && m) feed(m === "aurora" ? T("$ARCIRCLE is up today: an aurora over the planet") : m === "rain" ? T("$ARCIRCLE is down today: rain over the planet") : T("Clear skies over the planet"), "#35d8d0"); }
}
// the weather's moments: lightning now and then while it rains (a flash, then the thunder a second or two later), and
// a rainbow across the sky for a few minutes once the rain stops (?rainbow=1 to see it)
let rainbow = null, rainbowT = 0, flashT = 0, boltIn = 8;
function makeRainbow() {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { uA: { value: 0 } },
    vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uA; varying vec2 vU;
      vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){ float t = vU.y; vec3 c = hue(0.78 * (1.0 - t)); float edge = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t); float foot = smoothstep(0.0, 0.25, vU.x) * smoothstep(1.0, 0.75, vU.x);
        gl_FragColor = vec4(c, uA * 0.42 * edge * (0.35 + 0.65 * foot)); }` });
  const g = new THREE.Mesh(new THREE.RingGeometry(260, 292, 96, 1, 0, Math.PI), m);
  // the ring's uv runs across it; remap so x runs along the arc and y across the band
  const uv = g.geometry.attributes.uv, pos = g.geometry.attributes.position; for (let i = 0; i < uv.count; i++) { const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y); uv.setXY(i, Math.atan2(y, x) / Math.PI, (r - 260) / 32); }
  g.renderOrder = -1; g.frustumCulled = false; st.scene.add(g); return g;
}
st.on((dt) => {
  if (mode !== "hub") return;
  // lightning
  if (mood === "rain" && !reduce && ambNight >= 0) { if ((boltIn -= dt) <= 0) { boltIn = 9 + Math.random() * 14; flashT = 0.35; setTimeout(() => { try { Snd.thunder(); } catch { /* sound off */ } if (!reduce) shake = Math.max(shake, 0.12); }, 900 + Math.random() * 1400); } }
  if (flashT > 0) { flashT = Math.max(0, flashT - dt); const f = flashT > 0.25 ? 1 : flashT > 0.18 ? 0.2 : flashT > 0.1 ? 0.8 : flashT / 0.1 * 0.3; st.hemi.intensity = 0.95 * (1 - Math.max(0, nightK) * 0.4) + f * 2.4; if (flashT === 0) { nightK = -1; dayNight(); } }
  // the rainbow: it rises opposite the sun and fades
  const q = new URLSearchParams(location.search).get("rainbow");
  if (rainbowT > 0 || q === "1") { if (!rainbow) rainbow = makeRainbow(); rainbowT = Math.max(0, rainbowT - dt); const a = q === "1" ? 1 : Math.min(1, (240 - rainbowT) / 12, rainbowT / 20); rainbow.material.uniforms.uA.value = a * (1 - Math.max(0, nightK)); const sd = sunDir || new THREE.Vector3(0, 1, 0); rainbow.position.set(-sd.x * 540, -70, -sd.z * 540 || -540); rainbow.lookAt(0, -70, 0); rainbow.visible = true; }
  else if (rainbow && rainbow.visible) rainbow.visible = false;
});
function burnFire(tokens) {
  const f = shopG("reward"); if (!f) return;
  f.userData.boost = 1;
  feed(T("{n} $ARCIRCLE just burned", { n: Math.round(tokens || 0).toLocaleString("en-US") }), "#ff7a3c");
  f.getWorldPosition(tmp); if (tmp.distanceTo(at) < 45) { Snd.fire(); shake = Math.max(shake, 0.3); }
}
function swimWhale() {
  if (whale) return;
  whale = K.makeWhale(); whale.scale.setScalar(1.6); st.scene.add(whale); Snd.whale();
  const t0 = performance.now(), side = Math.random() < 0.5 ? -1 : 1;
  const off = st.on((dt, t) => {
    const k = (performance.now() - t0) / 12000;
    whale.position.set(side * (-70 + k * 140), 26 + Math.sin(k * 6) * 2, -30 + Math.sin(k * 3) * 10); whale.rotation.y = side > 0 ? 0 : Math.PI; whale.rotation.z = Math.sin(t * 1.5) * 0.06;
    whale.userData.tail.rotation.y = Math.sin(t * 3) * 0.4;
    if (k >= 1) { off(); st.scene.remove(whale); whale = null; }
  });
}
every(60000, refreshArc);

// ---------------- the Quantum Lab: launches in superposition, read from QuantumPad on Arc ----------------
const rpc = (calls) => Promise.all(calls.map((c) => rpcRead("eth_call", [c, "latest"]).catch(() => null))); // one read each, with the fallbacks
const word = (h, i) => "0x" + ((h || "0x").slice(2 + i * 64, 2 + (i + 1) * 64) || "0");
const decStr = (h) => { try { const off = Number(BigInt(word(h, 0))) * 2, len = Number(BigInt("0x" + h.slice(2 + off, 2 + off + 64))); const bytes = h.slice(2 + off + 64, 2 + off + 64 + len * 2); return new TextDecoder().decode(new Uint8Array(bytes.match(/../g).map((x) => parseInt(x, 16)))); } catch { return ""; } };
async function refreshQuantum() {
  const padA = CFG.QUANTUM_PAD_ADDRESS, lab = shopG("quantum"); if (!/^0x[0-9a-fA-F]{40}$/.test(padA || "") || !lab) return;
  try {
    const [lat] = await rpc([{ to: padA, data: "0x0007f4a0" + (6).toString(16).padStart(64, "0") }]);
    const n = Number(BigInt(word(lat, 1)));
    const batches = []; for (let i = 0; i < Math.min(n, 6); i++) batches.push("0x" + word(lat, 2 + i).slice(-40));
    qOrbs.splice(0).forEach((o) => lab.remove(o));
    if (!batches.length) return;
    const res = await rpc(batches.flatMap((b) => [{ to: b, data: "0x0aae7a6b" + "0".repeat(64) }, { to: b, data: "0x95d89b41" }]));
    const live = [];
    batches.forEach((b, i) => { const info = res[i * 2]; if (!info || info.length < 66 * 4) return; const state = Number(BigInt(word(info, 0))); if (state !== 0) return; live.push({ b, sym: decStr(res[i * 2 + 1]), ends: Number(BigInt(word(info, 2))), total: Number(BigInt(word(info, 3))) / 1e6 }); });
    live.slice(0, 4).forEach((q, i) => {
      const o = new THREE.Group();
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: 0x2a1250, emissive: 0xb48cff, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }));
      o.add(orb); o.userData = { q, tag: null, orb };
      lab.add(o); qOrbs.push(o); o.position.set(Math.cos(i * 1.57) * 2.4, 6.3 + i * 0.2, Math.sin(i * 1.57) * 2.4);
    });
    if (labels) labels.dirty = true;
  } catch { /* the RPC will answer next time */ }
}
function tickQuantum(t) {
  const now = Date.now() / 1000;
  qOrbs.forEach((o, i) => {
    const q = o.userData.q, left = Math.max(0, q.ends - now), txt = `$${q.sym} · ${left > 0 ? Math.floor(left / 60) + ":" + String(Math.floor(left % 60)).padStart(2, "0") : W("ready")} · ${usd(q.total)}`;
    if (o.userData.txt !== txt) { if (o.userData.tag) { o.remove(o.userData.tag); o.userData.tag.material.map.dispose(); } o.userData.tag = K.label(txt, { accent: "#b48cff", size: 0.5 }); o.userData.tag.position.y = 0.9; o.add(o.userData.tag); o.userData.txt = txt; if (labels) labels.dirty = true; }
    o.userData.orb.material.emissiveIntensity = 1.1 + Math.sin(t * 3 + i) * 0.4;
    o.position.x = Math.cos(t * 0.4 + i * 1.57) * 2.4; o.position.z = Math.sin(t * 0.4 + i * 1.57) * 2.4;
  });
}
every(30000, refreshQuantum);

// ---------------- quests, daily goals and badges ----------------
const isleN = (k) => (P.isle && P.isle[k]) || 0;
function tutDone() { try { return P.tut >= TUT.length; } catch { return false; } } // TUT is declared further down
const QUESTS = [
  { id: "launchpad", t: "Step through a portal to the Utility Village", xp: 15, done: () => P.visited.includes("launch"), target: () => shopG("launch") },
  { id: "wallet", t: "Connect your wallet", xp: 20, done: () => !!addr(), target: () => null },
  { id: "cards3", t: "Pick up 3 key cards", xp: 20, done: () => P.cards.length >= 3, target: () => nearestOf(cards) },
  { id: "scanner", t: "Open the Scanner Tower", xp: 15, done: () => P.visited.includes("scanner"), target: () => shopG("scanner") },
  { id: "phisher", t: "Beat The Phisher in the Dark Market", xp: 0, done: () => P.beaten.includes("phisher"), target: () => fighters.find((g) => g.userData.spec.id === "phisher") || null },
  { id: "coincity", t: "Visit a coin in the Launchpad Village", xp: 15, done: () => P.visited.includes("coin"), target: () => coinBuildings[0] || null },
  { id: "arcia", t: "Talk to ARCIA", xp: 15, done: () => P.visited.includes("npc"), target: () => npc },
  { id: "gvjump", t: "Reach the Coin Jump crown in the Game Village: 3,000 ARCL a day", xp: 30, done: () => P.visited.includes("gvcrown"), target: () => gv.root }, // b446: new players find the Game Village
  { id: "build20", t: "Place 20 bricks on your island", xp: 20, done: () => ((P.isle && P.isle.bricks) || 0) >= 20, target: () => isleGate },
  // the island tutorial chain: opens once "Getting started" is done, one step after another (the counts per kind come from the island's stats)
  { id: "roof4", t: "Place 4 roof pieces", xp: 20, gate: tutDone, done: () => isleN("roof") >= 4, target: () => isleGate },
  { id: "doorwin", t: "Add a door and 2 windows: a resident moves in", xp: 25, gate: tutDone, done: () => isleN("door") >= 1 && isleN("window") >= 2, target: () => isleGate },
  { id: "light2", t: "Place 2 lights", xp: 20, gate: tutDone, done: () => isleN("light") >= 2, target: () => isleGate },
  { id: "furn3", t: "Place 3 pieces of furniture", xp: 25, gate: tutDone, done: () => isleN("furniture") >= 3, target: () => isleGate },
  { id: "shop1", t: "Buy an island item in the ARCL Shop and place it", xp: 30, gate: tutDone, done: () => !!P.vq && P.vq.buy != null && isleN("bricks") > P.vq.buy, target: () => isleGate },
  { id: "vill2", t: "Grow your village centre to level 2", xp: 40, gate: tutDone, done: () => !!P.vill && P.vill.level >= 2, target: () => isleGate },
  { id: "visit-like", t: "Visit another island and like it", xp: 30, gate: tutDone, done: () => P.visited.includes("isle-visit") && !!P.vq && !!P.vq.like, target: () => isleGate },
  { id: "share-isle", t: "Share your island link: a free pet egg", xp: 50, gate: tutDone, done: () => !!P.vq && !!P.vq.share, target: () => isleGate },
  { id: "resident", t: "Build a door: welcome your first resident", xp: 25, done: () => ((P.isle && P.isle.residents) || 0) >= 1, target: () => isleGate },
  { id: "isle-visit", t: "Visit another player's island", xp: 15, done: () => P.visited.includes("isle-visit"), target: () => isleGate },
  { id: "furnace", t: "Visit the Burn Furnace", xp: 15, done: () => P.visited.includes("reward"), target: () => shopG("reward") },
  { id: "hold", t: "Hold some $ARCIRCLE", xp: 25, done: () => (bal.arc || 0) > 0, target: () => shopG("swap") },
  { id: "stages", t: "Clear all six scammer stages", xp: 150, done: () => K.SCAMMERS.every((s) => P.beaten.includes(s.id)), target: () => fighters.find((g) => g.userData.live) || null },
  { id: "launch", t: "Launch your own coin on ArcPad", xp: 100, done: () => myCoins.length > 0, target: () => shopG("launch") },
];
const BADGES = [
  { id: "first-steps", t: "First steps", title: "Newcomer", done: () => P.quests.includes("launchpad") },
  { id: "collector", t: "All 12 key cards", title: "Collector", done: () => P.cards.length >= K.CARDS.length },
  { id: "hunter", t: "Beat 3 scammers", title: "Scam Hunter", done: () => P.beaten.length >= 3 },
  { id: "slayer", t: "Beat all 6 scammers", title: "Rug Slayer", done: () => K.SCAMMERS.every((s) => P.beaten.includes(s.id)) },
  { id: "explorer", t: "Visit every shop", title: "Explorer", done: () => K.SHOPS.every((s) => P.visited.includes(s.id)) },
  { id: "holder", t: "Hold $ARCIRCLE", title: "Holder", done: () => (bal.arc || 0) > 0 },
  { id: "launcher", t: "Launch a coin", title: "Launcher", done: () => myCoins.length > 0 },
  { id: "streak7", t: "7-day streak", title: "Regular", done: () => ((P.daily && P.daily.streak) || 0) >= 7 },
  { id: "builder", t: "Place 200 bricks", title: "Builder", done: () => ((P.isle && P.isle.bricks) || 0) >= 200 },
  { id: "landlord", t: "Welcome 5 residents", title: "Island host", done: () => ((P.isle && P.isle.residents) || 0) >= 5 },
  { id: "infinity-master", t: "Clear INFINITY RINGS level 100", title: "INFINITY MASTER", done: () => ringsMaster },
  { id: "infinity-legend", t: "Clear INFINITY RINGS level 200", title: "INFINITY LEGEND", done: () => ringsLegend },
];
function badges() {
  let got = false;
  BADGES.forEach((b) => { if (!P.badges.includes(b.id) && b.done()) { P.badges.push(b.id); got = true; feed(T("Badge earned: {b}", { b: `<b>${esc(T(b.t))}</b>` }), "#ffc861"); } });
  if (got) { save(); setNameTag(); try { paintAura(); } catch { /* drawn on the next visit */ } }
}
function nearestOf(list) { let b = null, bd = Infinity; list.forEach((g) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at); if (d < bd) { bd = d; b = g; } }); return b; }
const beacon = K.makeBeacon(K.C.gold, 22); spins.push(beacon.userData.spin);
let questTarget = null, justDone = null;
function checkQuests() {
  QUESTS.forEach((q) => { if (!P.quests.includes(q.id) && (!q.gate || q.gate()) && q.done()) { P.quests.push(q.id); save(); justDone = { t: T(q.t), at: performance.now() }; Snd.quest(); feed(T("Quest done: {q}", { q: `<b>${esc(T(q.t))}</b>` }), "#ffc861"); if (q.xp) gain(q.xp, T(q.t)); else Snd.win(); } });
  if (P.quests.includes("vill2")) arclClaim("vill2");
  if (P.quests.includes("share-isle")) arclClaim("vquest9");
  badges(); paintQuests();
}
function paintQuests() {
  const shown = QUESTS.filter((q) => !q.gate || q.gate() || P.quests.includes(q.id)); // a gated step stays hidden until its gate opens
  const open = shown.filter((q) => !P.quests.includes(q.id));
  $("wp-quests-n").textContent = `${shown.length - open.length}/${shown.length}`; $("wp-qmini-n").textContent = `${shown.length - open.length}/${shown.length}`;
  const doneRow = justDone && performance.now() - justDone.at < 3000 ? `<li class="done-now"><i></i><span>${esc(justDone.t)}</span></li>` : "";
  $("wp-quests-l").innerHTML = doneRow + (open.slice(0, 3).map((q, i) => `<li${i === 0 ? ` class="cur${questFull === q.id ? " full" : ""}" role="button" tabindex="0" aria-expanded="${questFull === q.id}" data-q="${q.id}"` : ""}><i></i><span>${esc(T(q.t))}</span>${i === 0 ? '<em class="wp-qdist" data-no-i18n></em>' : ""}${q.xp ? `<small>+${q.xp} XP</small>` : ""}</li>`).join("") || `<li class="done"><span>${esc(T("All quests done. More soon."))}</span></li>`);
  if (doneRow) setTimeout(paintQuests, 3100);
  markLongQuest();
  const cur = open[0], tg = routeTo(cur && cur.target());
  if (tg !== questTarget) { if (beacon.parent) beacon.parent.remove(beacon); questTarget = tg; if (tg) tg.add(beacon); }
}
// b-qt: the current quest's title shows two lines; a longer one gets a chevron and a tap shows all of it (kept until the quest changes)
let questFull = "";
function markLongQuest() {
  const li = $("wp-quests-l").querySelector("li.cur"), sp = li && li.querySelector("span");
  if (sp) li.classList.toggle("long", sp.scrollHeight > sp.clientHeight + 1 || li.classList.contains("long"));
  let pop = $("wp-qfull"); const on = !!(li && questFull && li.dataset.q === questFull);
  if (!on) { if (pop) pop.hidden = true; return; }
  if (!pop) { pop = document.createElement("div"); pop.id = "wp-qfull"; pop.className = "wp-qfull"; pop.setAttribute("role", "note"); pop.addEventListener("click", () => { questFull = ""; markLongQuest(); const c = $("wp-quests-l").querySelector("li.cur"); if (c) { c.classList.remove("full"); c.setAttribute("aria-expanded", "false"); } }); $("wp-quests").appendChild(pop); }
  const xp = li.querySelector("small"); pop.innerHTML = `${esc(sp.textContent)}${xp ? `<small>${esc(xp.textContent)}</small>` : ""}`; pop.hidden = false;
}
// the quest card's title folds the card; the book button beside it opens the Adventure log (one tap used to do both)
$("wp-quests-log").addEventListener("click", () => { closeAll(); if (rpg && quests) rpg.show("log"); });
// the current quest row: tap to ping its marker, or (for "Connect your wallet", which has no place) to open sign-in
const questAct = (e) => {
  const li = e.target.closest("li.cur"); if (!li || (e.type === "keydown" && e.key !== "Enter" && e.key !== " ")) return; if (e.type === "keydown") e.preventDefault();
  if (li.dataset.q === "wallet" && !addr()) { if (auth.hidden && !frozen) openAuth(); return; }
  if (li.classList.contains("long") || li.classList.contains("full")) { const on = !li.classList.contains("full"); li.classList.toggle("full", on); li.setAttribute("aria-expanded", String(on)); questFull = on ? li.dataset.q : ""; markLongQuest(); }
  if (questTarget && !qm.hidden) { qm.classList.remove("ping"); void qm.offsetWidth; qm.classList.add("ping"); setTimeout(() => qm.classList.remove("ping"), 900); }
};
$("wp-quests-l").addEventListener("click", questAct); $("wp-quests-l").addEventListener("keydown", questAct);
$("wp-quests-h").addEventListener("click", (e) => { const q = $("wp-quests"); const o = q.classList.toggle("closed"); e.currentTarget.setAttribute("aria-expanded", String(!o)); try { localStorage.setItem("arc.world.qopen", o ? "0" : "1"); } catch { /* private */ } requestAnimationFrame(markLongQuest); });
// on a phone the quest list starts folded to its title once "Getting started" is done (tap to open); the choice is remembered
(() => { let open = null; try { open = localStorage.getItem("arc.world.qopen"); } catch { /* private */ } if (open === "0" || (open === null && coarse && (P.tut | 0) >= 7)) { /* 7 = TUT.length (declared further down): a newcomer keeps the list open */ $("wp-quests").classList.add("closed"); $("wp-quests-h").setAttribute("aria-expanded", "false"); } })();
// b447: the quest card folds away to a round icon (its fold button) and comes back from the icon; remembered. On a
// phone it starts as the icon once "Getting started" is done (a newcomer keeps the card)
const qMini = (on, save = true) => { $("wp-quests").classList.toggle("mini", on); $("wp-qmini").hidden = !on; $("wp-qmini").setAttribute("aria-label", TW("Show quests")); $("wp-quests-fold").setAttribute("aria-label", TW("Hide quests")); if (save) try { localStorage.setItem("arc.world.qmini", on ? "1" : "0"); } catch { /* private */ } };
$("wp-quests-fold").addEventListener("click", (e) => { e.stopPropagation(); qMini(true); });
$("wp-qmini").addEventListener("click", () => { qMini(false); requestAnimationFrame(markLongQuest); });
addEventListener("resize", () => requestAnimationFrame(markLongQuest)); // (a folded card or a turned phone measures the title again)
(() => { let m = null; try { m = localStorage.getItem("arc.world.qmini"); } catch { /* private */ } qMini(m === "1" || (m === null && coarse && (P.tut | 0) >= 7), false); })();
// daily goals (Seoul day): open two shops, jump ten times, walk 300 m — all three keep the streak going
const seoulDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const DAILY = [{ id: "shops", t: "Open 2 shops", n: 2 }, { id: "jumps", t: "Jump 10 times", n: 10 }, { id: "walk", t: "Walk 300 m", n: 300 }];
function dailyState() {
  const today = seoulDay();
  if (!P.daily || P.daily.day !== today) {
    const y = seoulDay(new Date(Date.now() - 86400e3)), was = P.daily;
    // the daily goals' streak takes the same shield as the chest: one missed day a week is forgiven
    const y2 = seoulDay(new Date(Date.now() - 2 * 86400e3)), wk = Math.floor((Date.now() / 86400e3 + 3) / 7), full = was && (was.done || []).length === DAILY.length;
    const shield = full && was.day === y2 && (was.streak || 0) > 0 && was.sw !== wk;
    P.daily = { day: today, done: [], streak: full && (was.day === y || shield) ? was.streak || 0 : 0, c: { shops: [], jumps: 0, walk: 0 }, sw: shield ? wk : (was && was.sw) || 0 };
  }
  P.daily.c = P.daily.c || { shops: [], jumps: 0, walk: 0 };
  P.daily.done = P.daily.done || [];
  return P.daily;
}
let walkAcc = 0;
function dailyDist(m) { walkAcc += m; if (walkAcc > 5) { daily("walk", null, walkAcc); walkAcc = 0; } }
function daily(kind, id, amount = 1) {
  const d = dailyState(), c = d.c;
  if (kind === "shop") { if (!c.shops.includes(id)) c.shops.push(id); } else if (kind === "jumps") c.jumps += 1; else if (kind === "walk") c.walk += amount;
  const val = { shops: c.shops.length, jumps: c.jumps, walk: c.walk };
  DAILY.forEach((g) => { if (!d.done.includes(g.id) && val[g.id] >= g.n) { d.done.push(g.id); feed(T("Daily goal done: {g}", { g: `<b>${esc(T(g.t))}</b>` }), "#35d8d0"); gain(10, T(g.t)); if (d.done.length === DAILY.length) { d.streak = (d.streak || 0) + 1; feed(T("Daily goals complete · {n}-day streak", { n: d.streak }), "#ffc861"); gain(30, T("daily streak")); } } });
  save();
}

// ---------------- map ----------------
const mapEl = $("wp-mapsheet");
function openMap() {
  if (defenseOn) { toast(TW("Quit AC Defense first")); return; }
  const groups = K.DISTRICTS.filter((d) => d.id !== "coins" && d.id !== "dark").map((d) => {
    const list = shops.filter((g) => ({ Launch: "launch", Finance: "finance", Research: "research", ARCIA: "arcia" })[g.userData.spec.district] === d.id);
    return list.length ? `<h3 style="--c:${hex(d.color)}">${esc(d.name)}</h3><ul class="wp-maplist">` + list.map((g) => { const s = g.userData.spec; return `<li><button type="button" data-i="${shops.indexOf(g)}"><i style="--c:${hex(s.color)}"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span>${P.visited.includes(s.id) ? `<em>${esc(W("visited"))}</em>` : ""}</button></li>`; }).join("") + "</ul>" : "";
  }).join("");
  const arclList = shops.filter((g) => g.userData.spec.district === "ARCL");
  const arclHtml = `<h3 style="--c:#4fd6ff">ARCL</h3><ul class="wp-maplist">` + arclList.map((g) => { const s = g.userData.spec; return `<li><button type="button" data-i="${shops.indexOf(g)}"><i style="--c:#4fd6ff"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span></button></li>`; }).join("") + "</ul>";
  const coinsHtml = coinBuildings.length ? `<h3 style="--c:#39ff88">${esc(TW("Launchpad Village"))}</h3><ul class="wp-maplist">` + coinBuildings.slice(0, 6).map((g, i) => `<li><button type="button" data-c="${i}"><i style="--c:${g.userData.mine ? "#39ff88" : "#4f9dff"}"></i><span><b>$${esc(g.userData.coin.symbol)}</b><small>${esc(g.userData.coin.name || "")}${g.userData.mine ? " · " + esc(W("yours")) : ""}</small></span></button></li>`).join("") + "</ul>" : "";
  const live = fighters.find((g) => g.userData.live);
  const darkHtml = live ? `<h3 style="--c:#ff4d6d">${esc(T("Dark Market"))}</h3><ul class="wp-maplist"><li><button type="button" data-f="1"><i style="--c:#ff4d6d"></i><span><b>${esc(live.userData.spec.name)}</b><small>${esc(T("Stage {n} · scammer", { n: live.userData.spec.stage }))}</small></span></button></li></ul>` : "";
  // the grounds as a ring map: town in the middle, the near five and the far seven where they really are, the ones
  // right for your level ringed, you as a dot; tap one to fly to its gate
  const lvNow = level(), fits = (z) => z.id !== "raid" && lvNow >= z.lv[0] && lvNow <= z.lv[1] + 2;
  const me0 = here(new THREE.Vector3()), S2 = 0.85;
  const ringSvg = `<svg class="wp-ringmap" viewBox="-200 -200 400 400" role="img" aria-label="${esc(T("Hunting grounds"))}"><circle r="178" class="orbit"/><circle r="100" class="orbit"/><circle r="16" class="town"/><text y="4" class="tn">${esc(T("Town"))}</text>`
    + ZN.ZONES.map((z, i) => { const x = z.x * S2, y = z.z * S2, c = "#" + new THREE.Color(z.color).getHexString(); return `<g class="zn${fits(z) ? " fit" : ""}" data-z="${i}" tabindex="0" role="button" aria-label="${esc(z.name)} · ${esc(T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] }))}" style="--c:${c}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(z.r * S2).toFixed(1)}"/>${fits(z) ? `<circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(z.r * S2 + 6).toFixed(1)}"/>` : ""}<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${z.lv[0]}–${z.lv[1]}</text></g>`; }).join("")
    + `<g class="zn mine" data-mine="1" tabindex="0" role="button" aria-label="${esc(TW("ARCL Mine"))}" style="--c:#ffc23a"><circle cx="${(MV.MINE_VILLAGE.x * S2).toFixed(1)}" cy="${(MV.MINE_VILLAGE.z * S2).toFixed(1)}" r="${(MV.MINE_VILLAGE.r * S2).toFixed(1)}"/><text x="${(MV.MINE_VILLAGE.x * S2).toFixed(1)}" y="${(MV.MINE_VILLAGE.z * S2 + 4).toFixed(1)}">⛏</text></g>`
    + `<g class="zn mine" data-pv="1" tabindex="0" role="button" aria-label="${esc(TW("Partner Village"))}" style="--c:#38e1d6"><circle cx="${(PV.PARTNER_VILLAGE.x * S2).toFixed(1)}" cy="${(PV.PARTNER_VILLAGE.z * S2).toFixed(1)}" r="${(PV.PARTNER_VILLAGE.r * S2).toFixed(1)}"/><text x="${(PV.PARTNER_VILLAGE.x * S2).toFixed(1)}" y="${(PV.PARTNER_VILLAGE.z * S2 + 4).toFixed(1)}">🤝</text></g>`
    + `<circle class="me" cx="${(me0.x * S2).toFixed(1)}" cy="${(me0.z * S2).toFixed(1)}" r="5"/></svg>`;
  const zoneHtml = `<h3 style="--c:#ff9a4a">${esc(T("Hunting grounds"))}</h3>${ringSvg}<ul class="wp-maplist">` + [...ZN.ZONES, SOC.RAID].map((z, i) => `<li><button type="button" data-z="${i}"><i style="--c:#${new THREE.Color(z.color).getHexString()}"></i><span><b>${esc(z.name)}${fits(z) ? ` <em class="wp-fit">${esc(T("Right for you"))}</em>` : ""}</b><small>${esc(z.id === "raid" ? T("Level {n}+", { n: z.lv[0] }) + (raid && raid.nextText() ? " · " + raid.nextText() : "") : T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] }))}${level() < z.lv[0] ? " · " + esc(T("Recommended from level {n}", { n: z.lv[0] })) : ""}</small></span></button></li>`).join("") + "</ul>";
  const key = [["#ffc861", "Friends"], ["rgba(159,230,255,.75)", "Other players"], ["#ff4d6d", "Scammers"], ["#2f86ff", "Race pad"], ["#ffc861", "Fast travel"], ["#7ee0a0", "My Island gate"], ["#35d8d0", "Platform World"], ["#ff7ad9", "ARCIA"]];
  const keyHtml = `<details class="wp-mapkey"><summary>${esc(TW("Minimap"))} · ${esc(TW("what the dots mean"))}</summary>${key.map(([c, n]) => `<span><i style="--c:${c}"></i>${esc(T(n))}</span>`).join("")}<span><i class="ring"></i>${esc(T("Where to go next"))}</span><span><i class="sq">L</i>${esc(T("Halls, by their first letter"))}</span></details>`;
  const raceHtml = race ? `<h3 style="--c:#2f86ff">${esc(T("Hoverboard race"))}</h3><ul class="wp-maplist"><li><button type="button" data-race="1"><i style="--c:#2f86ff"></i><span><b>${esc(T("Race pad"))}</b><small>${esc(T("Eight rings around the plaza, against the clock"))}</small></span></button></li></ul>` : "";
  const mineHtml = `<h3 style="--c:#ffc23a">${esc(TW("Mining Village"))}</h3><ul class="wp-maplist"><li><button type="button" data-mine="1"><i style="--c:#ffc23a"></i><span><b>${esc(TW("ARCL Mine"))}</b><small>${esc(TW("Copper, silver and gold rocks · 60 minutes, then a 6-hour rest"))}${mineRest > Date.now() ? " · " + esc(TW("ARCL Mine · opens in {t}", { t: restLeft(mineRest) })) : ""}</small></span></button></li></ul>`;
  const pvHtml = `<h3 style="--c:#38e1d6">🤝 ${esc(TW("Partner Village"))}</h3><ul class="wp-maplist"><li><button type="button" data-pv="1"><i style="--c:#38e1d6"></i><span><b>${esc(TW("Partner Village"))}</b><small>${esc(TW("Official partners of ARCIRCLE WORLD"))} · ${esc(TW("Go to the gate"))}</small></span></button></li><li><button type="button" data-pvk="kairo"><i style="--c:#38e1d6"></i><span><b>KAIRO ${esc(TW("Tower"))}</b><small>${esc(TW("KAIRO Finance Hub"))} · Swap · KLIK · Disperse</small></span></button></li><li><button type="button" data-pvh="kairo"><i style="--c:#7cf5c8"></i><span><b>${esc(TW("KAIRO Finance Hub"))}</b><small>${esc(TW("Open it now"))}</small></span></button></li></ul>`;
  const landsHtml = `<h3 style="--c:#39ff88">🚀 ${esc(TW("Villages"))}</h3><ul class="wp-maplist"><li><button type="button" data-land="lp"><i style="--c:#39ff88"></i><span><b>${esc(TW("Launchpad Village"))}</b><small>${esc(TW("Every coin launched on ArcPad has a lot here"))} · ${coinBuildings.length}</small></span></button></li><li><button type="button" data-land="ut"><i style="--c:#4f9dff"></i><span><b>${esc(TW("Utility Village"))}</b><small>${esc(TW("ARCIRCLE's utilities: launch, swap, stake, scan"))}</small></span></button></li>${rqOn() ? `<li><button type="button" data-land="rq"><i style="--c:#ff4d8d"></i><span><b>RAID QUEENS</b><small>${esc(TW("Lv 100+ · A new hunting ground"))}</small></span></button></li>` : ""}${landNow ? `<li><button type="button" data-land="town"><i style="--c:#eef3f7"></i><span><b>${esc(TW("Back to town"))}</b></span></button></li>` : ""}</ul>`; // b-lpv
  const adHtml = cityOk && adc ? `<h3 style="--c:#5fd3ff">🌆 ${esc(TW("Nexus City"))}</h3><ul class="wp-maplist"><li><button type="button" data-adc="guide"><i style="--c:#5fd3ff"></i><span><b>${esc(TW("Nexus City"))}</b><small>${esc(TW("AGENT DIMENSION's city: six buildings and agents at work"))}</small></span></button></li>${adc.M.BUILDINGS.map((B) => `<li><button type="button" data-adc="${B.id}"><i style="--c:${B.css}"></i><span><b>${esc(TW(B.name))}</b><small>${esc(TW(B.sub))}${B.open ? "" : " · " + esc(TW("Coming soon"))}</small></span></button></li>`).join("")}</ul>` : cityOk ? `<h3 style="--c:#5fd3ff">🌆 ${esc(TW("Nexus City"))}</h3><ul class="wp-maplist"><li><button type="button" data-adc="guide"><i style="--c:#5fd3ff"></i><span><b>${esc(TW("Nexus City"))}</b><small>${esc(TW("AGENT DIMENSION's city: six buildings and agents at work"))}</small></span></button></li></ul>` : "";
  $("wp-maplist").innerHTML = keyHtml + adHtml + landsHtml + pvHtml + groups + arclHtml + mineHtml + zoneHtml + raceHtml + coinsHtml + darkHtml + `<h3 style="--c:#35d8d0">${esc(T("Ways out"))}</h3><ul class="wp-maplist"><li><button type="button" data-isle="1"><i style="--c:#7ee0a0"></i><span><b>${esc(T("My Island"))}</b><small>${esc(T("Build your own island, brick by brick."))}</small></span></button></li><li><button type="button" data-isles="1"><i style="--c:#7ee0a0"></i><span><b>${esc(TW("Islands"))}</b><small>${esc(T("Visit the islands other players built."))}</small></span></button></li><li><button type="button" data-i="portal"><i style="--c:#35d8d0"></i><span><b>${esc(T("Platform World"))}</b><small>${esc(T("Back to the site as it is."))}</small></span></button></li>${npc ? `<li><button type="button" data-n="1"><i style="--c:#ff7ad9"></i><span><b>ARCIA</b><small>${esc(T("Talk to ARCIA"))}</small></span></button></li>` : ""}</ul>`;
  decorateMap();
  mapEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
  const first = mapEl.querySelector("button[data-i]"); if (first) first.focus({ preventScroll: true });
}
// the owner's look for the map (2026-10-23): the places' own art on their cards (images/ui/map, from the owner's mock-up;
// the games' key art where it has one), the minimap key folded away, and a row of chips that jumps to each section
const MAP_ART = { lp: "map/lp", ut: "map/ut", pv: "map/pv", "kairo-tower": "map/kairo-tower", "kairo-hub": "map/kairo-hub", launch: "map/launch", quantum: "map/quantum", swap: "map/swap", orders: "map/orders", staking: "map/staking" };
function decorateMap() {
  const box = $("wp-maplist"); if (!box) return;
  box.querySelectorAll("ul.wp-maplist button").forEach((b) => {
    const d = b.dataset, spec = d.i != null && d.i !== "portal" ? (shops[Number(d.i)] || { userData: {} }).userData.spec : null;
    const k = d.land || (d.pv ? "pv" : d.pvk ? "kairo-tower" : d.pvh ? "kairo-hub" : spec ? spec.id : "");
    const src = MAP_ART[k] ? `/images/ui/${MAP_ART[k]}.webp${VER}` : d.mine ? `/images/games/mine-art-300.webp${VER}` : d.race ? `/images/games/jump-art-300.webp${VER}` : "";
    if (src) { b.style.setProperty("--art", `url("${src}")`); b.classList.add("art"); }
  });
  // the section chips: a tap scrolls to it (the list stays one list, so a search or the keyboard still walks all of it)
  const heads = [...box.querySelectorAll(":scope > h3")]; if (heads.length < 3) return;
  const bar = document.createElement("div"); bar.className = "wp-mapchips";
  bar.innerHTML = heads.map((h, i) => `<button type="button" data-sec="${i}" style="${h.getAttribute("style") || ""}">${esc(h.textContent.replace(/^[^\p{L}\p{N}$]+/u, "").trim())}</button>`).join("");
  bar.addEventListener("click", (e) => { const c = e.target.closest("[data-sec]"); if (!c) return; e.stopPropagation(); const h = heads[Number(c.dataset.sec)]; if (h) h.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });
  const key = box.querySelector(".wp-mapkey"); (key || box.firstChild) ? box.insertBefore(bar, key ? key.nextSibling : box.firstChild) : box.appendChild(bar);
}
function closeMap() { if (mapEl.hidden) return; mapEl.hidden = true; frozen = false; }
$("wp-map-btn").addEventListener("click", openMap);
$("wp-map-x").addEventListener("click", closeMap);
mapEl.addEventListener("keydown", (e) => { const g = e.target.closest && e.target.closest(".wp-ringmap g[data-z],.wp-ringmap g[data-mine],.wp-ringmap g[data-pv]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); g.dispatchEvent(new MouseEvent("click", { bubbles: true })); } });
mapEl.addEventListener("click", (e) => {
  if (e.target === mapEl) { closeMap(); return; }
  const b = e.target.closest("button[data-i],button[data-c],button[data-f],button[data-n],button[data-isle],button[data-isles],button[data-z],button[data-race],button[data-mine],button[data-pv],button[data-pvk],button[data-pvh],button[data-land],button[data-adc],.wp-ringmap g[data-z],.wp-ringmap g[data-mine],.wp-ringmap g[data-pv]"); if (!b) return;
  if (b.dataset.pv) { closeMap(); goPartnerVillage(); return; }
  if (b.dataset.land) { closeMap(); landGo(b.dataset.land); return; }
  if (b.dataset.adc) { closeMap(); if (b.dataset.adc === "guide") { if (landNow === "ad") cityGuide(false); else cityGo(); } else cityTo(b.dataset.adc); return; }
  if (b.dataset.pvk) { closeMap(); goPartnerTower(b.dataset.pvk); return; }
  if (b.dataset.pvh) { closeMap(); openPartner(b.dataset.pvh); return; }
  if (b.dataset.mine) { closeMap(); const e2 = mv.exit(); flyTo({ position: new THREE.Vector3(e2.x, 0, e2.z), userData: { radius: 0.5 } }); return; }
  if (b.dataset.race && race) { closeMap(); flyTo(race.pad); return; }
  closeMap();
  if (b.dataset.isle) { goIsland({}); return; }
  if (b.dataset.z != null) { const z = [...ZN.ZONES, SOC.RAID][+b.dataset.z], a = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(a) * (z.r + 3), 0, z.z + Math.cos(a) * (z.r + 3)), userData: { radius: 0.5 } }); return; }
  if (b.dataset.isles) { island.openIsles(); return; }
  if (b.dataset.c != null) flyTo(coinBuildings[+b.dataset.c]);
  else if (b.dataset.f) { const g = fighters.find((x) => x.userData.live); if (g) flyTo(g); }
  else if (b.dataset.n) { if (npc) flyTo(npc); }
  else flyTo(b.dataset.i === "portal" ? portal : shops[+b.dataset.i]);
});

// ---------------- minimap and the quest marker ----------------
const mini = $("wp-mini"), mg = mini.getContext("2d");
mini.parentNode.addEventListener("click", () => { if (!frozen) openMap(); });
let miniT = 0;
// the minimap's ground: the world rendered once from straight above into a small picture (rows run +z downward)
let miniMap = null; const MINI_E = 480;
// on a phone, small things (pebbles, herbs, lamps' caps, little props) don't draw into the shadow map: dozens of
// draw calls fewer each shadow update, and their shadows were a few pixels anyway
function trimCasters() { const s = new THREE.Vector3(); planet.traverse((o) => { if (!o.isMesh || !o.castShadow || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.getWorldScale(s); if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.7) o.castShadow = false; }); }
function bakeMiniMap() {
  try {
    const N = st.quality.coarse || lowGfx ? 256 : 512, r = st.renderer, rt = new THREE.WebGLRenderTarget(N, N), /* a phone gets a smaller picture (a shorter pause to read it back) */ cam2 = new THREE.OrthographicCamera(-MINI_E / 2, MINI_E / 2, MINI_E / 2, -MINI_E / 2, 1, 600);
    cam2.position.set(0, 300, 0); cam2.up.set(0, 0, -1); cam2.lookAt(0, 0, 0);
    const pos = planet.position.clone(), off = [];
    planet.traverse((o) => { if (o.visible && (o.isSprite || o.isPoints || o.name === "grass" || o.name === "ambient" || o.name === "particles" || o.name === "smoke" || o.name === "combat" || o.name === "ghosts" || o.name === "clouds" || o.name === "airship")) { o.visible = false; off.push(o); } });
    const skyWas = sky.visible, cloudsWas = clouds.visible; sky.visible = false; clouds.visible = false; const fog = st.scene.fog, fogD = fog && fog.density; if (fog) fog.density = 0; /* b442: density 0, not fog = null: taking the fog away rebuilt every material's shader (seconds of stalls 6 s into the game) */ const bg = st.scene.background; st.scene.background = new THREE.Color(0x0b1a14);
    planet.position.set(0, 0, 0); planet.updateMatrixWorld(true);
    const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.clear(); r.render(st.scene, cam2); r.setRenderTarget(prev);
    planet.position.copy(pos); planet.updateMatrixWorld(true); off.forEach((o) => { o.visible = true; }); sky.visible = skyWas; clouds.visible = cloudsWas; if (fog) fog.density = fogD; st.scene.background = bg;
    const px = new Uint8Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, px); rt.dispose();
    const cv = document.createElement("canvas"); cv.width = cv.height = N; const g = cv.getContext("2d"), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) img.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4); // the picture comes bottom row first
    // the render target holds linear light: brighten it to screen colours, a little richer, so the minimap reads as land
    // (green, paths, roofs) even at night
    const LUT = new Uint8Array(256); for (let i = 0; i < 256; i++) LUT[i] = Math.min(255, Math.round(255 * Math.pow(i / 255, 1 / 2.2) * 1.08));
    const d = img.data; for (let i = 0; i < d.length; i += 4) { const r0 = LUT[d[i]], g0 = LUT[d[i + 1]], b0 = LUT[d[i + 2]], l = (r0 + g0 + b0) / 3; d[i] = Math.max(0, Math.min(255, l + (r0 - l) * 1.25)); d[i + 1] = Math.max(0, Math.min(255, l + (g0 - l) * 1.25)); d[i + 2] = Math.max(0, Math.min(255, l + (b0 - l) * 1.25)); }
    g.putImageData(img, 0, 0); miniMap = cv;
  } catch (e) { console.warn("minimap:", e); }
}
let miniZoom = 1; // the minimap's zoom button: 1 or 2
$("wp-mini-zoom").addEventListener("click", (e) => { miniZoom = miniZoom === 1 ? 2 : 1; e.currentTarget.setAttribute("aria-pressed", String(miniZoom === 2)); });
$("wp-mini-full").addEventListener("click", () => { closeAll(); openMap(); });
function drawMini() {
  const W = mini.width, c = W / 2, range = (mode === "island" ? 26 : 40) / miniZoom, sc = (c - 10) / range;
  mg.clearRect(0, 0, W, W);
  mg.save(); mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.clip();
  mg.fillStyle = "#1b4630"; mg.fillRect(0, 0, W, W); // a green ground under everything, like the land
  mg.strokeStyle = "rgba(53,216,208,.14)"; mg.lineWidth = 2; [0.33, 0.66].forEach((k) => { mg.beginPath(); mg.arc(c, c, (c - 2) * k, 0, 6.283); mg.stroke(); });
  const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
  // the ground itself under the marks: a picture of the world from above, turned with the camera (taken once it's built)
  if (mode !== "island" && miniMap) { const E = MINI_E, k = E / miniMap.width, plx = -planet.position.x, plz = -planet.position.z, a = sc * cs * k, b = sc * sn * k;
    mg.save(); mg.globalAlpha = 0.9; mg.setTransform(a, b, -b, a, c + sc * (cs * (-E / 2 - plx) - sn * (-E / 2 - plz)), c + sc * (sn * (-E / 2 - plx) + cs * (-E / 2 - plz))); mg.drawImage(miniMap, 0, 0); mg.restore();
    mg.fillStyle = "rgba(8,20,14,.1)"; mg.fillRect(0, 0, W, W); }
  const put = (g, color, r, glyph) => {
    g.getWorldPosition(tmp);
    const rx = tmp.x * cs - tmp.z * sn, rz = tmp.x * sn + tmp.z * cs;
    let px = c + rx * sc, py = c + rz * sc; const dd = Math.hypot(px - c, py - c), edge = c - 12;
    const out = dd > edge; if (out) { px = c + (px - c) / dd * edge; py = c + (py - c) / dd * edge; }
    if (r) { mg.fillStyle = color; mg.beginPath(); mg.arc(px, py, out ? r * 0.7 : r, 0, 6.283); mg.fill(); }
    if (glyph && !out) { mg.fillStyle = "#04121a"; mg.font = "700 13px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText(glyph, px, py + 0.5); }
    return { px, py };
  };
  if (mode === "island") island.mini(put);
  else {
    // the hunting grounds: a ring each in their colour, and a pulsing mark where a boss is up
    const bossUp = combat && combat.bosses ? combat.bosses() : [];
    for (const zn of landNow ? [] : [...RPG.ZONES, SOC.RAID]) { // (b-lpv: in a land the town's marks stay off the map)
      const wx = zn.x + planet.position.x, wz = zn.z + planet.position.z, rx = wx * cs - wz * sn, rz = wx * sn + wz * cs;
      const px = c + rx * sc, py = c + rz * sc, col = zn._hex || (zn._hex = "#" + new THREE.Color(zn.color).getHexString());
      mg.strokeStyle = col; mg.globalAlpha = 0.55; mg.lineWidth = 2; mg.setLineDash([5, 4]); mg.beginPath(); mg.arc(px, py, zn.r * sc, 0, 6.283); mg.stroke(); mg.setLineDash([]);
      mg.globalAlpha = 0.12; mg.fillStyle = col; mg.fill(); mg.globalAlpha = 1;
      // its levels, written in the middle while it's on the map
      if (zn.lv && Math.hypot(px - c, py - c) < c - 18) { mg.font = "800 10px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.lineWidth = 3; mg.strokeStyle = "rgba(4,10,18,.85)"; const tx = `Lv ${zn.lv[0]}–${zn.lv[1]}`; mg.strokeText(tx, px, py + (bossUp.includes(zn.id) ? 14 : 0)); mg.fillStyle = col; mg.fillText(tx, px, py + (bossUp.includes(zn.id) ? 14 : 0)); }
      if (bossUp.includes(zn.id)) { const pr = 8 + Math.sin(performance.now() / 180) * 2; mg.fillStyle = "#ff4d6d"; mg.beginPath(); mg.arc(px, py, pr, 0, 6.283); mg.fill(); mg.fillStyle = "#fff"; mg.font = "900 12px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText("!", px, py + 0.5); }
    }
    // other players: friends in gold and a little bigger
    if (ghosts) ghosts.each((g, w) => { const L = LD.landAt(g.position.x, g.position.z); if ((L ? L.id : "") !== landNow) return; const fr = !!(w && w.wallet && island.isFriend(w.wallet)); put(g, fr ? "#ffc861" : "rgba(159,230,255,.55)", fr ? 5 : 3); });
    if (landNow === "lp") coinBuildings.forEach((g) => put(g, g.userData.mine ? "#39ff88" : "rgba(238,243,247,.55)", 4));
    if (!landNow) lands.portals.forEach((g) => put(g, "#" + (g.userData.to === "lp" ? "39ff88" : g.userData.to === "ut" ? "4f9dff" : g.userData.to === "pv" ? "38e1d6" : "ffc861"), 7)); else lands.back.forEach((g) => { if (g.parent && g.parent.visible) put(g, "#eef3f7", 7); });
    if (landNow === "rq" && rqL) { put(rqL.back, "#eef3f7", 7); rqL.marks().forEach((m0) => put(m0.g, m0.down ? "rgba(238,243,247,.4)" : m0.css, m0.s, m0.ch)); } // RAID QUEENS
    if (landNow === "ad" && adc) { put(adc.back, "#eef3f7", 7); adc.doors.forEach((d) => { const B = adc.M.BUILDINGS.find((x) => x.id === d.userData.b); put(d, B ? B.css : "#5fd3ff", B && B.open ? 6 : 4.5); }); } // AD-City 1
    if (!landNow) { // the town's marks
    // scammers round you: small red dots (an elite a little bigger, gold-edged)
    if (combat) for (const m of combat.mobsRaw()) if (!m.dead && !m.raid && m.rank !== "boss") put(m.g, m.rank === "elite" ? "#ffb35a" : "rgba(255,90,110,.9)", m.rank === "elite" ? 3.4 : 2.4);
    cards.forEach((g) => put(g, "#ffc861", 3.5));
    put(portal, "#35d8d0", 6); put(pad, "#ffc861", 5); put(isleGate, "#7ee0a0", 6); if (npc) put(npc, "#ff7ad9", 5);
    if (race) { put(race.pad, "#2f86ff", 5); const rt = race.target(); if (rt) { const q = put(rt, "", 0); mg.strokeStyle = "#ffc861"; mg.lineWidth = 3; mg.beginPath(); mg.arc(q.px, q.py, 9, 0, 6.283); mg.stroke(); } }
    }
    if (landNow === "ut") shops.forEach((g) => put(g, hex(g.userData.spec.color), 9, g.userData.spec.name[0]));
    if (!landNow) {
    put(mv.door, "#ffc23a", 9, "⛏"); // the ARCL Mine's tunnel
    put(agentGate, "#5fd3ff", 10, "∞"); // AGENT DIMENSION's Citadel
    if (rqOn()) put(rqGate, "#ff4d8d", 10, "♛"); // RAID QUEENS' Citadel
    put(pvil.root, "#38e1d6", 10, "🤝"); // the Partner Village
    if (pumpKings) for (const k of pumpKings.marks()) if (k.g) put(k.g, k.rage ? "#ff4d1a" : "#ff9a2a", k.rage ? 8 : 6, "🎃"); // the Halloween Pumpkin Kings (Inferno Jack in red)
    fighters.forEach((g) => put(g, g.userData.live ? "#ff4d6d" : "rgba(255,77,109,.45)", g.userData.live ? 6 : 4));
    }
  }
  if (questTarget && mode === "hub") { const p = put(questTarget, "", 0); if (p) { mg.strokeStyle = "#ffc861"; mg.lineWidth = 3; mg.beginPath(); mg.arc(p.px, p.py, 12, 0, 6.283); mg.stroke(); } }
  mg.restore();
  const fa = facing - Math.PI - camYaw;
  mg.save(); mg.translate(c, c); mg.rotate(-fa); mg.beginPath(); mg.moveTo(0, -22); mg.lineTo(15, 16); mg.lineTo(0, 8); mg.lineTo(-15, 16); mg.closePath(); mg.shadowColor = "rgba(0,0,0,.6)"; mg.shadowBlur = 8; mg.fillStyle = "#ffffff"; mg.fill(); mg.shadowBlur = 0; mg.lineWidth = 2.5; mg.strokeStyle = "#0c1534"; mg.stroke(); mg.restore();
  mg.strokeStyle = "rgba(255,255,255,.18)"; mg.lineWidth = 2; mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.stroke();
  // north, on the rim: it turns with the camera
  { const r = c - 24, nx = c + r * sn, ny = c - r * cs; mg.font = "900 30px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.lineWidth = 6; mg.strokeStyle = "rgba(6,12,30,.85)"; mg.strokeText("N", nx, ny + 1); mg.fillStyle = "#ffffff"; mg.fillText("N", nx, ny + 1); }
  let dn = "", bd = Infinity;
  if (mode === "island") { dn = island.title(); bd = 0; }
  else if (landNow) { dn = landName(landNow); bd = 0; }
  else K.DISTRICTS.forEach((d) => { if (d.id !== "dark") return; const v = K.spot(d.theta, d.phi).add(planet.position); const dd = v.length(); if (dd < bd) { bd = dd; dn = d.name; } }); // (b-lpv: the other districts are in the Utility Village)
  $("wp-mini-n").textContent = bd < 22 ? dn : "";
}
const qm = $("wp-qmark"), proj = new THREE.Vector3(); let qmZ = 0; addEventListener("resize", () => { qmZ = 0; });
// the way to the goal on the ground at your feet (b405, a player's idea): three gold chevrons pointing toward the
// quest's target, pulsing outward; gone within 8 m of it, in menus and in photo mode
const footGuide = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0.42); sh.lineTo(0.5, -0.16); sh.lineTo(0.28, -0.16); sh.lineTo(0, 0.14); sh.lineTo(-0.28, -0.16); sh.lineTo(-0.5, -0.16); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2); // flat on the ground, the tip toward -z
  const g = new THREE.Group(); g.name = "foot-guide"; g.visible = false;
  const mats = [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.7, depthWrite: false, fog: false, toneMapped: false }));
  mats.forEach((m, i) => { const c = new THREE.Mesh(geo, m); c.position.z = -(2.4 + i * 1.25); c.scale.setScalar(1.35 + i * 0.15); c.renderOrder = 3; g.add(c); });
  st.scene.add(g); return { g, mats, p: new THREE.Vector3() };
})();
function paintFootGuide() {
  const g = footGuide.g;
  if (!questTarget || frozen || photo || mode !== "hub" || S.footGuide === false) { g.visible = false; return; }
  questTarget.getWorldPosition(footGuide.p); const dx = footGuide.p.x - at.x, dz = footGuide.p.z - at.z;
  if (Math.hypot(dx, dz) < 8) { g.visible = false; return; }
  g.position.set(at.x, 0.09, at.z); g.rotation.y = Math.atan2(-dx, -dz); g.visible = true;
  const t = performance.now() / 1000; footGuide.mats.forEach((m, i) => { m.opacity = reduce ? 0.7 : 0.4 + 0.5 * Math.max(0, Math.sin(t * 4 - i * 0.9)); });
}
let qmBot = 0, qmBotAt = -1e9;
function qmFloor() { // the top of the bottom controls, read once a second (a layout read every frame costs)
  const now = performance.now(); if (now - qmBotAt < 1000) return qmBot; qmBotAt = now;
  let t = innerHeight; for (const e of [$("wp-dock"), $("wp-joy"), ...document.querySelectorAll("#wp-acts .wp-act")]) { if (!e) continue; const r = e.getBoundingClientRect(); if (r.height > 0 && r.top < t) t = r.top; }
  return (qmBot = Math.max(innerHeight * 0.45, t - 34));
}
function paintMarker() {
  if (!questTarget || frozen || photo || mode !== "hub") { qm.hidden = true; return; }
  questTarget.getWorldPosition(proj); const dist = proj.distanceTo(at);
  if (dist < 5) { qm.hidden = true; return; }
  proj.y += 3; proj.project(cam);
  const behind = proj.z > 1, W = innerWidth, H = innerHeight;
  let x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
  if (behind) { x = W - x; y = H - y; }
  const m = 46, inside = !behind && x > m && x < W - m && y > m + 60 && y < H - m - 60;
  if (!inside) { const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m - 60) / Math.abs(dy || 1e-3)); x = cx + dx * k; y = cy + dy * k; }
  // nor under the bottom controls (the dock, the joystick, the action buttons): it stays above them
  if (y > qmFloor()) y = qmFloor();
  // the marker never sits on a panel (the raid card, the minimap, the quests, the boss bar): it steps out beside it
  for (const id of ["wr-raid", "wp-quests", "wc-boss", "wp-mini"]) {
    const e = $(id); if (!e || e.hidden || !e.offsetParent) continue; const r = (id === "wp-mini" ? e.parentElement : e).getBoundingClientRect(), p = 28;
    if (x > r.left - p && x < r.right + p && y > r.top - p && y < r.bottom + p) { const toL = x - (r.left - p), toR = r.right + p - x, toT = y - (r.top - p), toB = r.bottom + p - y, mn = Math.min(r.left > p * 2 ? toL : 1e9, r.right < W - p * 2 ? toR : 1e9, r.top > p * 2 ? toT : 1e9, toB); if (mn === toL) x = r.left - p; else if (mn === toR) x = r.right + p; else if (mn === toT) y = r.top - p; else y = r.bottom + p; }
  }
  qm.hidden = false; qm.classList.toggle("edge", !inside);
  if (!qmZ) qmZ = parseFloat(getComputedStyle(qm).zoom) || 1; const qz = qmZ; qm.style.transform = `translate(${x / qz}px,${y / qz}px)`; // a zoomed marker (phones) moves in its own units
  qm.querySelector("svg").style.transform = inside ? "rotate(180deg)" : `rotate(${Math.atan2(y - H / 2, x - W / 2) * 180 / Math.PI + 90}deg)`;
  $("wp-qmark-d").textContent = Math.round(dist) + " m";
}

// ---------------- scammers: six stages, each a real trick and how to beat it ----------------
const FIGHTS = {
  phisher: { q: "Congratulations! Your wallet won 500 USDC. Approve my contract and I'll send it right over.", opts: [
    { t: "Approve to claim the 500 USDC", win: false, out: "That approval would let him spend every token you hold, now or later. A real airdrop never needs you to approve a stranger's contract." },
    { t: "Check his contract in the Scanner first", win: true, out: "The Scanner flags it: an unverified contract asking for unlimited spending. The Phisher's trick is exposed and he runs off the planet." },
    { t: "Ignore him and walk away", win: false, out: "Safe, but he'll keep fishing for the next player. Expose the trick to beat him." }] },
  airdrop: { q: "Your $ARCIRCLE airdrop is ready! Just send 50 USDC for gas and it's yours.", opts: [
    { t: "Send the 50 USDC", win: false, out: "Gone. A real airdrop arrives in your wallet or is claimed in your own wallet; nobody needs you to send money first." },
    { t: "Check the official ARCIRCLE channels", win: true, out: "No such airdrop on the official X, Telegram or the Airdrops page. The fake falls apart." },
    { t: "Ask him for proof", win: false, out: "He sends a screenshot. Screenshots prove nothing. Check the official channels." }] },
  honeypot: { q: "This coin only goes up! Nobody has sold yet. Buy before it's too late.", opts: [
    { t: "Buy a big bag right now", win: false, out: "You can buy, but the contract blocks selling. That's why nobody has sold." },
    { t: "Dry-run a sell in the Scanner", win: true, out: "The Scanner's dry run shows the sell is refused: a honeypot. You walk away with your USDC." },
    { t: "Buy a small amount to test", win: false, out: "Even a small test is money you can't get back. Dry-run it first, for free." }] },
  doppel: { q: "$ARCIRCLE v2 is here! Same ticker, new contract. Swap your old tokens before they're worthless.", opts: [
    { t: "Swap everything to v2", win: false, out: "Same ticker, different contract: you swapped into a copy. Tickers aren't unique; addresses are." },
    { t: "Compare the contract address with the official one", win: true, out: "The address doesn't match the one on arcircle.app. The Doppelganger is exposed." },
    { t: "Check the price chart", win: false, out: "Fake coins can have charts too. The contract address is what counts." }] },
  golem: { q: "The dev holds 40% of the supply, but don't worry: he promised not to sell.", opts: [
    { t: "Trust the promise", win: false, out: "A promise isn't a lock. One wallet with 40% can sell into the pool at any time." },
    { t: "Check holders and locks in the Scanner and Locker", win: true, out: "40% in one wallet, nothing locked. You know the risk before buying. The Golem crumbles." },
    { t: "Buy because the dev is famous", win: false, out: "Fame doesn't lock tokens. Check the holder list and the Locker." }] },
  dragon: { q: "Liquidity isn't locked, but the team is doxxed. Trust us and ape in.", opts: [
    { t: "Ape in", win: false, out: "Unlocked liquidity can be pulled in one transaction. The pool empties and the price goes to zero." },
    { t: "Check the LP lock in the Locker", win: true, out: "No LP lock. You don't buy, and the Rug Dragon has nothing to pull. Every stage cleared!" },
    { t: "Wait for more holders", win: false, out: "More holders just means more people lose when the liquidity is pulled. Check the LP lock." }] },
};
const fight = $("wp-fight");
let fighting = null, scamCool = 0;
function startFight(g) {
  const s = g.userData.spec, f = FIGHTS[s.id]; if (!f) return;
  fighting = g; frozen = true; keys.clear(); paintPrompt(); Snd.siren();
  if (g.userData.enemy) g.userData.enemy.play("Attack");
  // a short intro: red alert, the camera turns to the scammer and closes in, then the choice
  document.body.classList.add("wp-alert"); setTimeout(() => document.body.classList.remove("wp-alert"), 1500);
  if (!reduce) { fight.hidden = true; doorThen(g, () => { frozen = true; showFight(g); }); return; }
  showFight(g);
}
function showFight(g) {
  const s = g.userData.spec, f = FIGHTS[s.id];
  $("wp-fight-stage").textContent = T("Stage {n} · scammer", { n: s.stage });
  $("wp-fight-h").textContent = s.name;
  $("wp-fight-q").textContent = T(f.q);
  $("wp-fight-opts").innerHTML = f.opts.map((o, i) => `<button type="button" data-i="${i}">${esc(T(o.t))}</button>`).join("");
  $("wp-fight-out").hidden = true;
  fight.hidden = false;
  fight.querySelector("button[data-i]").focus({ preventScroll: true });
}
fight.addEventListener("click", (e) => {
  if (e.target.closest("[data-done]")) { endFight(); return; }
  const b = e.target.closest("button[data-i]"); if (!b || !fighting) return;
  const s = fighting.userData.spec, o = FIGHTS[s.id].opts[+b.dataset.i], out = $("wp-fight-out");
  out.hidden = false; out.className = "wp-fight-out " + (o.win ? "win" : "lose"); out.textContent = T(o.out);
  if (o.win) {
    $("wp-fight-opts").innerHTML = `<button type="button" class="wp-cta" data-done="1">${esc(T("Back to the planet"))}</button>`;
    P.beaten.push(s.id); save();
    { const r = b.getBoundingClientRect(); arclClaim("stage:" + s.id, { answer: +b.dataset.i }, { x: r.left + r.width / 2, y: r.top }); }
    const g = fighting; beam(g); if (g.userData.enemy) g.userData.enemy.play("Hit", { once: true });
    setTimeout(() => poof(g), 600); gain(50, T("beat {name}", { name: s.name })); Snd.win();
    if (avatar) avatar.play("emote-yes", { once: true });
    paintHud(); checkQuests();
  } else { b.disabled = true; Snd.bad(); const e2 = fighting.userData.enemy; if (e2) { if (!e2.play("BackFlip", { once: true })) e2.play("Attack", { once: true }); } }
});
function endFight() { if (fight.hidden) return; fight.hidden = true; frozen = false; scamCool = 4; fighting = null; camZoom = 1; }
function poof(g) {
  const t0 = performance.now();
  const off = st.on(() => { const k = (performance.now() - t0) / 700; g.scale.setScalar(Math.max(0.001, 1 - k)); g.rotation.y += 0.3; if (k >= 1) { off(); planet.remove(g); fighters.splice(fighters.indexOf(g), 1); arrangeFighters(); paintQuests(); } });
}
// the Scanner's beam from the player to the scammer
function beam(g) {
  g.getWorldPosition(tmp); const from = new THREE.Vector3(0, hop + 1.5, 0), to = tmp.clone().add(new THREE.Vector3(0, 1.2, 0));
  const len = from.distanceTo(to), m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 8), new THREE.MeshBasicMaterial({ color: 0x35d8d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(from).add(to).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Y, to.clone().sub(from).normalize()); st.scene.add(m);
  const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 700; m.material.opacity = 0.9 * (1 - k); m.scale.x = m.scale.z = 1 + k * 2; if (k >= 1) { off(); st.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}
function moveScammers(t) {
  fighters.forEach((g, i) => { if (!g.userData.live) return; const s = g.userData.spec; K.placeOn(g, K.dirOf(s.theta + Math.sin(t * 0.21 + i) * 4, s.phi + Math.sin(t * 0.13 + i * 2) * 10)); g.userData.ring.material.opacity = 0.35 + Math.sin(t * 4) * 0.2; });
}
function scamCheck(dt) {
  if (scamCool > 0) { scamCool -= dt; return; }
  if (frozen || flying) return;
  for (const g of fighters) { if (!g.userData.live) continue; g.getWorldPosition(tmp); if (tmp.distanceTo(at) < g.userData.radius + 1.3) { startFight(g); return; } }
}

// labels fade out as the camera comes close, and the small ones (coins, orbs) only show nearby.
// Big signs (halls, districts) read as a name up to 55 m; past that a small pin in the sign's colour marks the spot.
// Signs never stack on screen: every few frames the nearest wins its place and any that would overlap it fade out.
let labelT = 0;
const PIN_TEX = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d");
  g.fillStyle = "rgba(6,10,16,.82)"; g.beginPath(); g.arc(32, 32, 25, 0, 7); g.fill(); g.lineWidth = 7; g.strokeStyle = "#fff"; g.stroke(); g.fillStyle = "#fff"; g.beginPath(); g.arc(32, 32, 8, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const NAME_FAR = 42, PIN_FAR = 170, NAME_MAX = 6; // names: the six nearest big signs within 42 m
function pinOf(l) {
  if (l.userData.pin) return l.userData.pin;
  const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: PIN_TEX, color: new THREE.Color(l.userData.accent || "#39ff88"), transparent: true, opacity: 0, depthWrite: false, fog: false }));
  p.renderOrder = 9; p.userData.isPin = true; p.position.copy(l.position); p.visible = false; l.parent.add(p); l.userData.pin = p; return p;
}
const lbV = new THREE.Vector3();
function fadeLabels(dt) {
  if (!labels || labels.dirty) { labels = []; planet.traverse((o) => { if (o.isSprite && o.material.map && !o.userData.isPin) labels.push(o); }); }
  const big = [];
  for (const l of labels) {
    l.getWorldPosition(tmp); const d = tmp.distanceTo(cam.position); l.userData.d = d;
    if (!l.userData.s0) l.userData.s0 = l.scale.clone();
    if (l.userData.s0.x >= 3.6) big.push(l);
    // far signs grow a little and near ones shrink, so a name stays a readable size on screen without crowding you
    if (l.renderOrder === 10) { const sk = l.userData.s0.x >= 3.6 ? THREE.MathUtils.clamp(d / 30, 0.8, 1.5) : THREE.MathUtils.clamp(d / 14, 0.85, 1.35); l.scale.set(l.userData.s0.x * sk, l.userData.s0.y * sk, 1); } // K.label signs only
  }
  if ((labelT -= dt) <= 0) { labelT = 0.2; big.sort((a, b) => a.userData.d - b.userData.d); big.forEach((l, i) => { l.userData.rank = i; }); declutter(); }
  for (const l of labels) {
    const d = l.userData.d, isBig = l.userData.s0.x >= 3.6, far = isBig ? (l.userData.rank < NAME_MAX ? NAME_FAR : 0) : 30;
    const room = l.renderOrder === 10 ? (l.userData.clear === false ? 0 : 1) : 1;
    const want = THREE.MathUtils.clamp((d - (isBig ? 10 : 7.5)) / 5, 0, 1) * THREE.MathUtils.clamp((far - d) / 8, 0, 1) * room;
    // a sign that has to give way goes at once; one that may show comes in gently (two never sit on each other)
    l.material.opacity = THREE.MathUtils.lerp(l.material.opacity, want, want < l.material.opacity ? (room ? 0.3 : 0.6) : 0.12); l.visible = l.material.opacity > 0.02;
    if (isBig && l.parent) {
      const pw = (l.userData.rank < NAME_MAX ? THREE.MathUtils.clamp((d - NAME_FAR + 6) / 8, 0, 1) : 1) * THREE.MathUtils.clamp((PIN_FAR - d) / 20, 0, 1) * (l.userData.pinClear === false ? 0 : 1) * (l.userData.rank < 14 ? 1 : 0);
      if (pw > 0.01 || l.userData.pin) { const p = pinOf(l); p.material.opacity = THREE.MathUtils.lerp(p.material.opacity, pw, pw < p.material.opacity ? 0.5 : 0.1 * (l.material.opacity < 0.2 ? 1 : 0.2)); p.visible = p.material.opacity > 0.02; const s = d * 0.024; p.scale.set(s, s, 1); }
    }
  }
}
// screen space: each sign (and pin) takes its rectangle, nearest first; one that would overlap a taken one waits
function declutter() {
  const H = innerHeight, W = innerWidth, k = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)), taken = [], items = [];
  for (const l of labels) {
    if (l.renderOrder !== 10 || !l.parent) continue;
    const d = l.userData.d, isBig = l.userData.s0.x >= 3.6;
    if (d > (isBig ? PIN_FAR : 32)) { l.userData.clear = true; continue; }
    l.getWorldPosition(lbV); const pin = isBig && (d > NAME_FAR - 2 || l.userData.rank >= NAME_MAX);
    lbV.project(cam); if (lbV.z > 1 || Math.abs(lbV.x) > 1.2 || Math.abs(lbV.y) > 1.2) { l.userData.clear = true; l.userData.pinClear = true; continue; }
    const px = k / Math.max(1, d), x = (lbV.x * 0.5 + 0.5) * W, y = (-lbV.y * 0.5 + 0.5) * H;
    let w, h, cy = y;
    if (pin) { w = h = d * 0.024 * px * 0.8; } else { const pl = l.userData.plate || [0.7, 0.6, 0.5]; w = l.scale.x * pl[0] * px; h = l.scale.y * pl[1] * px; cy = y + (pl[2] - 0.5) * l.scale.y * px; }
    // your own things and fights come first: mobs' names, names over players (smaller scores win)
    const score = d * (l.userData.keep ? 0.3 : 1);
    items.push({ l, pin, score, r: [x - w / 2, cy - h / 2, x + w / 2, cy + h / 2] });
  }
  items.sort((a, b) => a.score - b.score);
  for (const it of items) {
    const r = it.r, hit = taken.some((t) => r[0] < t[2] && t[0] < r[2] && r[1] < t[3] && t[1] < r[3]);
    if (!hit) taken.push(r);
    if (it.pin) it.l.userData.pinClear = !hit; else it.l.userData.clear = !hit;
  }
}

// ---------------- key cards, the stages still locked, little effects ----------------
function pickCards() {
  for (let i = cards.length - 1; i >= 0; i--) {
    const g = cards[i]; g.getWorldPosition(tmp);
    if (tmp.distanceTo(at) < 2.0 + hop) {
      cards.splice(i, 1); P.cards.push(g.userData.id); save();
      flyCard(tmp);
      const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 450; g.scale.setScalar(Math.max(0.001, 1 + k * 0.6 - k * k * 1.6)); if (k >= 1) { off(); planet.remove(g); } });
      if (avatar && grounded && !boarding) avatar.play("pick-up", { once: true });
      gain(5, T("key card {n}/{m}", { n: P.cards.length, m: K.CARDS.length })); checkQuests();
    }
  }
}
function flyCard(world) {
  const p = world.clone(); p.y += 1; p.project(cam);
  const x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight, r = $("wp-cards").getBoundingClientRect();
  const el = document.createElement("i"); el.className = "wp-flycard"; el.style.transform = `translate(${x}px,${y}px) scale(1.4)`; document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `translate(${r.left + 14}px,${r.top + 14}px) scale(.5)`; el.style.opacity = "0.2"; }));
  setTimeout(() => { el.remove(); $("wp-cards").classList.remove("bump"); void $("wp-cards").offsetWidth; $("wp-cards").classList.add("bump"); }, 650);
}
let lockCool = 0;
function lockedCheck(dt) {
  if (lockCool > 0) { lockCool -= dt; return; }
  for (const g of lockedStages) {
    g.getWorldPosition(tmp);
    if (tmp.distanceTo(at) < g.userData.radius + 2.2) {
      const s = g.userData.spec, prev = K.SCAMMERS.find((x) => x.stage === s.stage - 1);
      toast(T("Stage {n}, {name}: beat {prev} first", { n: s.stage, name: s.name, prev: prev ? prev.name : "" }));
      lockCool = 5; return;
    }
  }
}
function burst(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, hop + 0.1, 0); st.scene.add(m);
  const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 900; m.scale.setScalar(1 + k * 7); m.material.opacity = 0.9 * (1 - k); if (k >= 1) { off(); st.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}
function levelUp(n, from) {
  try { const dg = jurOn && jurGame && jurGame.dino ? jurGame.dino() : null; if (dg && dg.cheer) dg.cheer(); else if (dinoTown3d && dinoTown3d.react) dinoTown3d.react(); } catch { /* the companion cheers next time */ } // b-fx2: your companion roars for you
  const grew = (() => { try { const a = RPG.statsOf(from || n - 1, rpg.data().eq), b = RPG.statsOf(n, rpg.data().eq); return [["atk", "Attack"], ["def", "Defense"], ["hp", "Max HP"], ["sp", "Max SP"]].map(([k, l]) => [T(l), b[k] - a[k]]).filter(([, d]) => d > 0); } catch { return []; } })();
  if (avatar && avatar.face) avatar.face("star", 2.4); // star eyes
  // a level-up card across the middle of the screen: the new level, rays behind it, what it opened
  { const el = document.createElement("div"); el.className = "wp-lvup"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("data-no-i18n", "");
    const opens = []; if (n === 10) opens.push(T("The rover")); if (n === 30) opens.push(T("The jetpack")); const z = RPG.ZONES.find((x) => x.lv[0] === n); if (z) opens.push(z.name);
    el.innerHTML = `<i class="wp-lvup-rays" aria-hidden="true"></i><small>${esc(T("Level up"))}</small><b>${n}</b>${opens.length ? `<span>${esc(opens.join(" · "))}</span>` : ""}${grew.length ? `<ul class="wp-lvup-st">${grew.map(([l, d], i) => `<li style="--i:${i}">${esc(l)} <em>+${d}</em></li>`).join("")}</ul>` : ""}`;
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), reduce ? 1600 : 2200); setTimeout(() => el.remove(), reduce ? 1900 : 2700); }
  const pas = RPG.PASSIVES.find((x) => x.lv === n); if (pas) setTimeout(() => toast(T("New passive: {x} — {y}", { x: T(pas.name), y: T(pas.line) })), 1600);
  if (grounded && !boarding && mode === "hub") { vy = 7.5; grounded = false; } // a little jump for joy
  if (avatar && (avatar.arc || avatar.custom) && !boarding) avatar.play("celebrate", { once: true }); // an ARC Bot throws its arms up; a hero cheers (the borrowed KayKit cheer, world-kit.js kkBorrow)
  vfx.levelUp();
  // the new level rises from your head and fades
  if (!reduce) { const lb = K.label(T("Lv {n}", { n }), { accent: "#ffc861", color: "#ffd27a", size: 0.8 }); lb.position.y = 3.4; player.add(lb); const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 1700; lb.position.y = 3.4 + k * 1.6; lb.material.opacity = Math.min(1, (1 - k) * 2.5); if (k >= 1) { off(); player.remove(lb); lb.material.map && lb.material.map.dispose(); lb.material.dispose(); } }); }
  if (rpg) { const was = RPG.statsOf(from || n - 1, rpg.data().eq); rpg.onLevel(); if (combat) combat.onLevel(n, was); } else if (combat) combat.onLevel(n);
  if (quests) quests.on.level();
  // a new hunting ground opens at this level: a beam of light rises over its gate and the camera turns to it
  const opened = RPG.ZONES.find((z) => z.lv[0] > (from || n - 1) && z.lv[0] <= n && z.lv[0] > 1);
  if (opened && mode === "hub") setTimeout(() => gateReveal(opened), 2200);
}
function gateReveal(z) {
  const a = Math.atan2(-z.x, -z.z), gx = z.x + Math.sin(a) * z.r, gz = z.z + Math.cos(a) * z.r, c = new THREE.Color(z.color);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 90, 24, 1, true), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.set(gx, 45, gz); planet.add(beam);
  const t0 = performance.now(), dx = gx - (-planet.position.x), dz = gz - (-planet.position.z), want = Math.atan2(-dx, -dz), y0 = camYaw;
  const off = st.on(() => { const k = (performance.now() - t0) / 7000; beam.material.opacity = Math.min(1, k * 6) * Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3) * 0.55; beam.scale.x = beam.scale.z = 1 + Math.sin(k * 30) * 0.03;
    if (!reduce && !frozen && !look && !joy && k < 0.25) camYaw = angLerp(y0, want, Math.min(1, k * 6)); // (not while you're steering)
    if (k >= 1) { off(); planet.remove(beam); beam.geometry.dispose(); beam.material.dispose(); } });
  toast(T("A hunting ground fits your level now: {x} (level {a}–{b})", { x: z.name, a: z.lv[0], b: z.lv[1] }));
  Snd.level && Snd.level();
}
// footstep, skid and landing dust: puffs on the GPU particle ring (world-particles.js), no mesh or material each;
// big: a heavy landing's wider, slower cloud
const dustAt = new THREE.Vector3();
function dust(n, big = 0) {
  if (reduce) return;
  here(dustAt).y = hop + 0.12; parts.emit({ at: dustAt, kind: "smoke", n, speed: 1.7 + big * 2.2, up: 0.45, size: 0.5 + big * 0.45, life: 0.6 + big * 0.35, grav: -0.4, drag: 2.4, color: 0xcfe0e6, color2: 0xa9b8be, jitter: 0.5 });
}

// ---------------- wallet purse; the crown shows what you hold ----------------
const bal = { usdc: null, arc: null };
// a read on Arc: the config's RPC first, then its listed fallbacks; the last one that answered goes first next time
const RPCS = [CFG.RPC_URL || "https://rpc.mainnet.arc.io", ...(Array.isArray(CFG.RPC_FALLBACKS) ? CFG.RPC_FALLBACKS : [])];
let rpcI = 0;
async function rpcRead(method, params) {
  for (let k = 0; k < RPCS.length; k++) {
    const i = (rpcI + k) % RPCS.length, ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
    try {
      const j = await (await fetch(RPCS[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal })).json();
      if (j && typeof j.result === "string" && /^0x[0-9a-fA-F]*$/.test(j.result)) { rpcI = i; return j.result === "0x" ? "0x0" : j.result; }
    } catch { /* the next endpoint */ } finally { clearTimeout(tm); }
  }
  throw new Error("no Arc endpoint answered");
}
let purseAt = 0;
// b447: a purse number that changes gives a little hop (not the first time it's filled in)
function hopNum(el, v) { if (!el) return; const was = el.textContent; el.textContent = v; if (was && was !== v && !/[—-]/.test(was)) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); } }
async function refreshPurse(force) {
  const c = addr(), sv = sess(), a = c || (sv && /^0x[0-9a-fA-F]{40}$/.test(sv.wallet || "") ? sv.wallet : "");
  $("wp-wallet-t").textContent = c ? c.slice(0, 6) + "…" + c.slice(-4) : T("Connect wallet");
  $("wp-wallet").classList.toggle("on", !!c);
  // the purse reads the connected wallet, or the one signed in (the beta pass) while the wallet reconnects
  $("wp-purse").hidden = !a;
  if (!a || (!force && Date.now() - purseAt < 30000)) { checkQuests(); return; }
  purseAt = Date.now();
  // two plain reads (no batch: some endpoints refuse or rate-limit items inside one), each falling back through
  // the config's other Arc endpoints; a read that fails keeps the last number instead of showing 0
  // five characters at most, so a balance fits its half of the purse card: 0.86, 99.99, 999, 12.5K, 999K, 1.16M, 25.4M
  const f = (v) => v >= 1e8 ? (v / 1e6).toFixed(0) + "M" : v >= 1e7 ? (v / 1e6).toFixed(1) + "M" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e5 ? (v / 1e3).toFixed(0) + "K" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v >= 100 ? v.toFixed(0) : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const n = (h) => Number(BigInt(h) / 10n ** 14n) / 1e4;
  const tok = /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "";
  $("wp-purse").classList.toggle("loading", bal.arc == null);
  const [u, t] = await Promise.allSettled([
    rpcRead("eth_getBalance", [a, "latest"]),
    tok ? rpcRead("eth_call", [{ to: tok, data: "0x70a08231" + a.slice(2).toLowerCase().padStart(64, "0") }, "latest"])
      // the browser couldn't reach Arc: the server reads the same public balance
      .catch(() => fetch("/api/social?world=holding&wallet=" + a).then((r) => r.json()).then((j) => { if (!/^\d+$/.test(String(j && j.arc))) throw new Error("no balance"); return "0x" + BigInt(j.arc).toString(16); }))
      : Promise.reject(new Error("no token")),
  ]);
  if (u.status === "fulfilled") { bal.usdc = n(u.value); hopNum($("wp-usdc"), f(bal.usdc)); }
  if (t.status === "fulfilled") { bal.arc = n(t.value); hopNum($("wp-arc"), f(bal.arc)); }
  $("wp-purse").classList.toggle("stale", u.status !== "fulfilled" || t.status !== "fulfilled"); $("wp-purse").classList.remove("loading");
  if (u.status !== "fulfilled" || t.status !== "fulfilled") purseAt = Date.now() - 22000; // try again in a few seconds
  if (u.status === "fulfilled" || t.status === "fulfilled") { paintCrown(); arclChecks(); }
  checkQuests();
}
function arclChecks() {
  if ((bal.arc || 0) > 0) arclClaim("hold");
  if (myCoins.length) arclClaim("launch", { coin: lc(myCoins[0].token) });
}
// the holder tier: 0 none, 1 holds $ARCIRCLE, 2 from 100k, 3 from 1M (a hero shows it on its halo, others on the crown)
function tierOf() { let a = 0; try { a = bal.arc || 0; } catch { /* the purse is declared further down (a TDZ before it) */ } return a >= 1e6 ? 3 : a >= 1e5 ? 2 : a > 0 ? 1 : 0; }
function paintCrown() {
  if (!avatar || !avatar.setCrown) return;
  if (avatar.hero) { avatar.setCrown(K.TIER_HALO ? K.TIER_HALO[tierOf()] : null); return; }
  const a = bal.arc || 0;
  if (a >= 1e6) avatar.setCrown(0xffc861, 0xffe7a8); else if (a >= 1e5) avatar.setCrown(0x39ff88, 0x35d8d0); else if (a > 0) avatar.setCrown(0x35d8d0, 0x4f9dff); else avatar.setCrown(0x3f9bff, 0x39ff88);
}
$("wp-wallet").addEventListener("click", () => { if (AC && !addr()) AC.connect().then(() => { refreshPurse(true); refreshCoins(); paintAcct(); }).catch(() => {}); else if (AC) refreshPurse(true); });
if (AC && AC.on) AC.on(() => { refreshPurse(true); refreshCoins(); paintAcct(); });
setTimeout(() => setInterval(() => { if (!document.hidden) refreshPurse(false); }, 30000), 7000 + Math.random() * 15000); // (the return below catches it up)
// back from a swap or a launch in another tab: read the purse again (at most every 5 seconds)
let purseBack = 0; document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - purseBack > 5000) { purseBack = Date.now(); refreshPurse(true); } });

// ---------------- HUD ----------------
let hudLv = 0, xpLvT = 0; // the level the XP bar last showed, and its level-up refill timer
function paintHud() {
  $("wp-lv").querySelector("b").textContent = "Lv " + level();
  const fl = $("wc-face-lv"); if (fl) fl.textContent = String(level());
  const xq = RPG.xpProgress(P.xp), xf = $("wp-xpfill"), L = level();
  if (hudLv && L > hudLv && !reduce) { // a level-up: fill to the top and flash, then start again from empty
    clearTimeout(xpLvT); xf.style.width = "100%"; xf.classList.add("lvflash");
    xpLvT = setTimeout(() => { xpLvT = 0; xf.style.transition = "none"; xf.style.width = "0"; void xf.offsetWidth; xf.style.transition = ""; xf.classList.remove("lvflash"); const q = RPG.xpProgress(P.xp); xf.style.width = Math.min(100, (100 * q.into) / q.need).toFixed(1) + "%"; }, 650);
  } else if (!xpLvT) xf.style.width = Math.min(100, (100 * xq.into) / xq.need).toFixed(1) + "%";
  hudLv = L;
  $("wp-lv").title = `${xq.into.toLocaleString("en-US")} / ${xq.need.toLocaleString("en-US")} XP`; $("wp-lv-xp").textContent = `${xq.into.toLocaleString("en-US")} / ${xq.need.toLocaleString("en-US")}`;
  $("wp-cards").querySelector("b").textContent = `${P.cards.length}/${K.CARDS.length}`;
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  $("wp-stage").textContent = next ? T("Stage {n} · {name}", { n: next.stage, name: next.name }) : T("Every stage cleared");
  // the village level, next to yours (a dot when an upgrade is ready to buy)
  const vc = $("wp-vlv"), s = sess(), v = P.vill && s && P.vill.w === lc(s.wallet) ? P.vill : null;
  if (vc) { vc.hidden = false; vc.querySelector("b").textContent = "Lv " + (v ? v.level : 1); vc.dataset.up = v && v.payable ? "1" : ""; vc.title = v ? T("Village level {n} · score {s} · XP +{x}% · max HP +{h}%", { n: v.level, s: (v.score || 0).toLocaleString("en-US"), x: v.blessing.xp, h: v.blessing.hp }) : T("My village"); }
}
// tutorial: move, jump, then follow the light
// the first three minutes: move, jump, a shop, then a training fight, your gear, the Adventure log and your island
const TUT = ["Move with W A S D, or the stick on the left", "Jump with Space, or the arrow button", "Follow the gold light to the Launchpad",
  "Knock out the training scammer: J, or the red button", "Open your character: I, or the bag button", "Open the Adventure log: L — today's chest is there", "Visit your own island through the green gate"];
const TUT_XP = [0, 0, 0, 25, 15, 15, 30];
let tutT = 0;
function tutorialStep(done) {
  // steps can be done in any order (jumping before walking counts); the hint shows the first one not done yet
  if (done >= 0) {
    const bit = 1 << done; if ((P.tutBits | 0) & bit || P.tut >= TUT.length) return;
    P.tutBits = (P.tutBits | 0) | bit; if (TUT_XP[done] && !P.tutAgain) setTimeout(() => gain(TUT_XP[done], T("Getting started")), 300);
    if (done === 3 && !P.tutAgain) askSave(8); // a guest's first knock-out and its XP: the moment to offer saving it to a wallet (b-fm1: no sign-in before playing)
    let n = 0; while (n < TUT.length && P.tutBits & (1 << n)) n++;
    if (n === P.tut) { save(); return; }
    P.tut = n; save();
    if (n >= TUT.length) { checkQuests(); setTimeout(() => { toast(T("You know your way around. Have fun out there!")); burst(0x39ff88); }, 600); if (!P.tutAgain) askSave(8); if (!P.tutAgain) setTimeout(() => { if (!frozen && mode === "hub") maybeNew(); }, 9000); } // a new player sees what's new once, after the tutorial
  }
  const h = $("wp-hint");
  if (P.tut >= TUT.length) { h.hidden = true; return; }
  // b419 hid the top banner (it covered the HUD); now a small chip near the bottom that fades after 8 s
  h.innerHTML = `<small>${P.tut + 1}/${TUT.length}</small>${esc(T(TUT[P.tut]))}`; h.hidden = false; h.classList.remove("on"); void h.offsetWidth; h.classList.add("on");
  clearTimeout(tutT); tutT = setTimeout(() => { h.hidden = true; }, 8000);
  // the training fight: a weak scammer shows up a few steps away
  // (tried again until the scammer robots have loaded: on a slow connection they come a little after the town)
  const train = () => { if (P.tut !== 3 || mode !== "hub" || !combat || combat.state().mobs.length) return; if (!combat.spawnNear(6, { lv: 1, free: true })) setTimeout(train, 1500); };
  if (P.tut === 3 && combat && mode === "hub") setTimeout(train, 900);
}
// ---------------- sign in, character maker, settings, photo mode ----------------
const auth = $("wp-auth");
function openAuth(why) {
  auth.hidden = false; frozen = true; $("wp-auth-err").hidden = true;
  // b-fm1: offered after playing (askSave), the card says what signing in keeps; opened from a button, its usual words
  for (const [id, sel, t] of [["h", "#wp-auth-h", "Save your progress"], ["k", ".wp-auth-keep", "Your wins and XP so far come with you, and the launch rewards open up."], ["g", "#wp-auth-guest", "Keep playing as a guest"]]) {
    const e = auth.querySelector(sel); if (!e) continue; if (e.dataset.base == null) e.dataset.base = e.textContent; e.textContent = why === "save" ? TW(t) : e.dataset.base; }
  paintAuthCount();
  setTimeout(() => $("wp-auth-go").focus({ preventScroll: true }), 60);
}
// a guest who finished "Getting started" is asked once to save to their wallet (their progress comes with them);
// waits for a quiet moment in town, gives up after a few tries
function askSave(tries) {
  if (sess() || P.saveAsk || tries <= 0) return;
  if (!auth.hidden || frozen || mode !== "hub") { setTimeout(() => askSave(tries - 1), 5000); return; }
  setTimeout(() => { if (sess() || P.saveAsk || !auth.hidden || frozen || mode !== "hub") return askSave(tries - 1); P.saveAsk = 1; save(); openAuth("save"); }, 2600);
}
function closeAuth() { auth.hidden = true; frozen = false; P.authSeen = true; save(); paintAcct(); if (!P.char) openMake(); else { setAvatar(P.char); tutorialStep(-1); maybeGuide(); } }
$("wp-auth-go").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = T("Check your wallet…");
  try { await signIn(); closeAuth(); refreshPurse(true); refreshCoins(); paintHud(); refreshWelcome(); }
  catch (err) { $("wp-auth-err").hidden = false; $("wp-auth-err").textContent = (err && (err.code === 4001 || /reject|denied|cancel/i.test(err.message || ""))) ? T("You cancelled the signature. You can sign in later from Settings.") : (err && err.message) || T("Sign-in failed."); }
  finally { b.disabled = false; b.textContent = T("Sign in with wallet"); }
});
$("wp-auth-guest").addEventListener("click", closeAuth);
let resignOff = false;
// a sign-in older than a day no longer saves: say so, with a button to sign again (signing is free and moves nothing)
function paintResign() {
  let raw = null; try { raw = JSON.parse(localStorage.getItem(SESS) || "null"); } catch { /* private */ }
  const stale = !!(raw && raw.wallet && !sess()), el = $("wp-resign");
  if (!el) return; el.hidden = !stale || resignOff;
}
setInterval(paintResign, 60000);
$("wp-resign").addEventListener("click", async (e) => {
  if (e.target.closest("[data-rx]")) { resignOff = true; paintResign(); return; }
  if (!e.target.closest("[data-rgo]")) return;
  try { await signIn(); paintAcct(); paintHud(); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); }
});
function paintAcct() {
  paintResign();
  const s = sess(), box = $("wp-set-acct");
  box.innerHTML = s ? `<span data-no-i18n>${esc(s.wallet.slice(0, 6) + "…" + s.wallet.slice(-4))}</span> <button type="button" class="wp-link" id="wp-acct-out">${esc(T("Sign out"))}</button>` : `<button type="button" class="wp-btn" id="wp-acct-in">${esc(T("Sign in with wallet"))}</button>`;
  $("wp-set-note").textContent = s ? T("Progress is saved to your wallet and this browser.") : T("Progress is saved in this browser.");
}
$("wp-set-acct").addEventListener("click", async (e) => {
  if (e.target.id === "wp-acct-out") { try { localStorage.removeItem(SESS); } catch { /* private */ } paintAcct(); toast(T("Signed out. Progress stays in this browser.")); }
  if (e.target.id === "wp-acct-in") { try { await signIn(); paintAcct(); paintHud(); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); } }
});
const make = $("wp-make");
const KK_NAME = { "kk-knight": "Knight", "kk-mage": "Mage", "kk-rogue": "Rogue", "kk-rogue-hooded": "Hooded Rogue", "kk-ranger": "Ranger", "kk-barbarian": "Barbarian" };
let pickChar = heroOf(P.char || "arc-arc"), pickTint = P.tint || 0; // pickTint: the hero's colour (K.HERO_TINTS; b447)
function openMake() {
  if (!P.char) { fun("maker"); try { const pp = localStorage.getItem("arc.world.prepick"); if (pp && (K.HERO_IDS || []).includes(pp) && pp !== pickChar) { pickChar = pp; if (avatar) setAvatar(pickChar); } } catch { /* private */ } } // b-st3: the hero picked on the loading screen
  // the ARC Bots first (each with its name and role), then the classic characters
  const cell = (id) => { const ab = ARCBOT.arcbotOf(id), nm = ab ? `${ab.name} · ${T(ab.role)}` : id === "bot" ? "ARC Hover Bot" : id.startsWith("kk-") ? T(KK_NAME[id] || id) : K.HEROES && K.HEROES[id] ? K.HEROES[id].name : id.startsWith("custom-") ? id.slice(7).replace(/-/g, " ") : id.replace("-", " "); return `<button type="button" role="radio" aria-checked="${id === pickChar}" data-c="${id}" title="${esc(nm)}">${ab || id === "bot" ? `<img src="/images/brand/mark-sm-v2.png" alt="${esc(nm)}">` : `<img src="/models/world/chars/${id}.webp${VER}" alt="${esc(nm)}">`}${ab ? `<small>${esc(ab.name)}</small>` : K.HEROES && K.HEROES[id] ? `<small>${esc(K.HEROES[id].name)}</small>` : ""}</button>`; };
  const sec = (h, ids) => (ids.length ? `<p class="wp-make-sec">${esc(T(h))}</p>` + ids.map(cell).join("") : "");
  $("wp-make-grid").classList.toggle("heroes", !!K.HERO_ONLY); // b447: big hero cards, and the heroes still to come
  $("wp-make-grid").innerHTML = K.HERO_ONLY ? sec("Heroes", K.HERO_IDS) + (K.HEROES_SOON || []).map((n) => `<button type="button" class="soon" disabled aria-disabled="true" title="${esc(n)}"><i aria-hidden="true">?</i><small>${esc(n)}</small><em>${esc(TW("Soon"))}</em></button>`).join("") : sec("ARC Bots", K.CHARACTERS.filter((id) => id.startsWith("arc-"))) + sec("Adventurers", K.CHARACTERS.filter((id) => id.startsWith("kk-"))) + sec("Classic characters", K.CHARACTERS.filter((id) => !id.startsWith("arc-") && !id.startsWith("kk-") && !K.CUSTOM_CHARS.includes(id))) + sec("Custom characters", K.CUSTOM_CHARS);
  { const tw = $("wp-make-tints"), L = K.HERO_TINTS || []; tw.hidden = !K.HERO_ONLY || !L.length;
    if (!tw.hidden) { pickTint = P.tint || 0; tw.innerHTML = `<p class="wp-make-sec">${esc(TW("Colour"))}</p>` + L.map((c, i) => `<button type="button" role="radio" data-t="${i}" aria-checked="${i === pickTint}" aria-label="${esc(TW("Colour"))} ${i + 1}" style="--c:${c == null ? "#3f8fff" : "#" + c.toString(16).padStart(6, "0")}"></button>`).join(""); } }
  $("wp-make-name").value = P.name || "";
  { const pp = make.querySelector(".wp-make-card > p"); if (pp) pp.textContent = TW("One world, eight games. Pick your hero, a colour and a name — you can change them later."); }
  if (!P.guideSeen) firstRun(true); // b-st1: a first visit sees the world and the maker, not every button at once
  make.hidden = false; frozen = true; keys.clear(); paintPrompt();
  camYaw = facing;
  if (!avatar) setAvatar(pickChar);
  renderThumbs();
  setTimeout(() => $("wp-make-name").focus({ preventScroll: true }), 60);
}
// sharper portraits: each character rendered once in 3D (kept for the maker, the Players list and profile cards)
const thumbCache = {};
let thumbsDone = false, thumbBusy = Promise.resolve();
function renderThumbsFor(ids) {
  const todo = [...new Set(ids)].filter((id) => id && !thumbCache[id] && K.CHARACTERS.includes(id) && id !== "bot");
  if (!todo.length) return thumbBusy;
  thumbBusy = thumbBusy.then(async () => {
    let r = null;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(128, 128); r.outputColorSpace = THREE.SRGBColorSpace;
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 3, 4); sc.add(dl);
      const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      for (const id of todo) {
        if (thumbCache[id]) continue;
        const c = await K.makeCharacter(heroOf(id), VER).catch(() => null); if (!c) continue; // (a player's portrait shows the hero they're drawn as)
        // an ARC Bot's portrait is closer (its face is the point) and without the crown
        const crown = c.arc ? c.obj.getObjectByName("crown") : null; if (crown) crown.visible = false;
        if (c.arc) { cm.position.set(0.5, 1.5, 3.7); cm.lookAt(0, 1.2, 0); c.obj.rotation.y = 0.25; } else { cm.position.set(0, 1.5, 5.2); cm.lookAt(0, 1.15, 0); }
        sc.add(c.obj); if (c.restPose) c.restPose(c.obj); else c.mixer.update(0.5); r.render(sc, cm); // a hero stands straight (b447)
        thumbCache[id] = r.domElement.toDataURL("image/png"); sc.remove(c.obj);
        const img = make.querySelector(`button[data-c="${id}"] img`); if (img) img.src = thumbCache[id];
        await sleep(0);
      }
    } catch { /* the small previews stay */ }
    if (r) { r.dispose(); r.forceContextLoss(); }
  });
  return thumbBusy;
}
async function renderThumbs() {
  if (thumbsDone) return; thumbsDone = true;
  K.CHARACTERS.forEach((id) => { const img = make.querySelector(`button[data-c="${id}"] img`); if (img && thumbCache[id]) img.src = thumbCache[id]; });
  await renderThumbsFor(K.CHARACTERS);
}
$("wp-make-grid").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-c]"); if (!b) return;
  pickChar = b.dataset.c; $("wp-make-grid").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  // b-st2: each hero greets in its own way (ARON nods, LUMI casts, NEX swings: CU_AS clips), in a puff of light
  const pose = ["emote-yes", "cast", "attack"][[...$("wp-make-grid").querySelectorAll("button[data-c]")].indexOf(b)] || "emote-yes";
  setAvatar(pickChar).then(() => { if (avatar) avatar.play(pose, { once: true }); try { vfx.collect(here(), 0x7fe9ff); } catch { /* fine */ } });
});
// the character maker: the first pick (and first name) is free; changing either later is a Character change,
// 10,000 $ARCIRCLE from your wallet (half burned, half to the treasury), which the server checks on the next save
const CHAR_COST = 10000;
function finishMake(ch, nm) {
  fun("named");
  P.char = ch; P.name = nm; if (K.HERO_ONLY) P.tint = pickTint; save();
  setNameTag(); make.hidden = true; frozen = false; camYaw = facing - Math.PI; paintQuests(); tutorialStep(-1); maybeGuide();
  const ask = $("wp-make-ask"); if (ask) ask.remove();
}
$("wp-make-tints").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (!b) return; pickTint = Number(b.dataset.t) || 0; $("wp-make-tints").querySelectorAll("button[data-t]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); if (avatar && avatar.setTint) avatar.setTint(pickTint);
  try { const c = (K.HERO_TINTS || [])[pickTint]; vfx.collect(here(), typeof c === "number" ? c : 0x7fe9ff); if (avatar && !(avatar.busy && avatar.busy())) avatar.play("emote-yes", { once: true }); } catch { /* fine */ } }); // b-st2: a shimmer of the new colour
$("wp-make-go").addEventListener("click", () => {
  const nm = ($("wp-make-name").value || "").replace(/[<>"'`\\]/g, "").trim().slice(0, 16) || W("Player");
  if (P.char && heroOf(P.char) === pickChar) pickChar = P.char; // b447: the hero you're already drawn as: your saved character stays (no Character change)
  const charCh = !!(P.char && P.guideSeen && (pickChar !== P.char || (K.HERO_ONLY && P.tint != null && pickTint !== P.tint))), nameCh /* a new colour counts as a new character (the first one is free; b447) */ = !!(P.name && P.guideSeen && nm !== P.name);
  if (!charCh && !nameCh) { finishMake(pickChar, nm); return; }
  const o = arclShop.own() || {};
  // a change already paid for (or an old ARCL Name change, for a name alone) goes straight through
  if ((o.rechars || 0) > (o.recharsUsed || 0) || (!charCh && (o.renames || 0) > (o.renamesUsed || 0))) { finishMake(pickChar, nm); toast(T("Character changed")); return; }
  let ask = $("wp-make-ask"); if (ask) ask.remove();
  ask = document.createElement("div"); ask.id = "wp-make-ask"; ask.className = "wp-make-ask"; ask.setAttribute("role", "group");
  const signed = !!sess();
  ask.innerHTML = `<p>${esc(signed ? T("Changing your character or name costs {n} $ARCIRCLE from your wallet (half is burned, half goes to the treasury).", { n: CHAR_COST.toLocaleString("en-US") }) : T("Changing your character or name costs {n} $ARCIRCLE. Sign in with your wallet to pay for it.", { n: CHAR_COST.toLocaleString("en-US") }))}</p><p class="wp-make-st" aria-live="polite"></p>
    <div>${signed ? `<button type="button" class="wp-btn go" data-mpay>${esc(T("Pay {n} $ARCIRCLE", { n: CHAR_COST.toLocaleString("en-US") }))}</button>` : ""}<button type="button" class="wp-btn" data-mkeep>${esc(T("Keep my character"))}</button></div>`;
  $("wp-make-go").after(ask);
  ask.addEventListener("click", (e) => {
    if (e.target.closest("[data-mkeep]")) {
      // back to the one you have
      pickChar = P.char; pickTint = P.tint || 0; $("wp-make-name").value = P.name || ""; setAvatar(P.char); ask.remove();
      $("wp-make-grid").querySelectorAll("button[data-c]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.c === P.char)));
      make.hidden = true; frozen = false; return;
    }
    const pb = e.target.closest("[data-mpay]"); if (!pb) return;
    pb.disabled = true; const st = ask.querySelector(".wp-make-st");
    arclShop.pay("rechar", "", (t) => { if (st) st.textContent = t; }).then((ok) => { if (ok) { finishMake(pickChar, nm); toast(T("Character changed")); } else pb.disabled = false; }).catch(() => { pb.disabled = false; });
  });
});
const setEl = $("wp-setsheet");
function openSet() {
  setEl.querySelectorAll("#wp-set-q button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === (S.quality === "high" ? "ultra" : S.quality))));
  $("wp-set-fps").setAttribute("aria-pressed", String(!!S.fps)); $("wp-set-fps").textContent = S.fps ? TW("On") : T("Show");
  setEl.querySelectorAll("#wp-set-cap button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.cap) === (S.fpsCap || 60))));
  setEl.querySelectorAll("#wp-set-lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === LANG)));
  $("wp-set-q-note").textContent = qNote(S.quality === "high" ? "ultra" : S.quality);
  $("wp-set-snd").checked = !!S.sound; $("wp-set-sens").value = S.sens; $("wp-set-joyk").value = String([0.85, 1, 1.2].includes(+S.joyK) ? +S.joyK : 1); $("wp-set-joyup").value = +S.joyUp || 0; $("wp-set-motion").checked = S.motion === "less"; $("wp-set-showname").checked = S.showName !== false; $("wp-set-big").checked = !!S.big; $("wp-set-cb").checked = !!S.cb;
  const d = dailyState(), c = d.c, val = { shops: c.shops.length, jumps: c.jumps, walk: Math.round(c.walk) };
  $("wp-daily").innerHTML = DAILY.map((g) => `<li class="${d.done.includes(g.id) ? "ok" : ""}"><i></i><span>${esc(T(g.t))}</span><small data-no-i18n>${Math.min(val[g.id], g.n)}/${g.n}</small></li>`).join("") + `<li class="streak"><span>${esc(T("Streak: {n} days", { n: d.streak || 0 }))}</span></li>`;
  $("wp-badges").innerHTML = BADGES.map((b) => `<li class="${P.badges.includes(b.id) ? "ok" : ""}" title="${esc(T(b.t))}"><b>${esc(T(b.title))}</b><small>${esc(T(b.t))}</small></li>`).join("");
  paintAcct();
  setEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
}
function closeSet() { if (setEl.hidden) return; setEl.hidden = true; frozen = false; }
$("wp-set-btn").addEventListener("click", openSet);
$("wp-set-x").addEventListener("click", closeSet);
setEl.addEventListener("click", (e) => { if (e.target === setEl) closeSet(); if (e.target.id === "wp-set-reload") location.reload(); });
$("wp-set-q").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]"); if (!b) return;
  S.quality = b.dataset.q; saveSet();
  setEl.querySelectorAll("#wp-set-q button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("wp-set-q-note").innerHTML = `${esc(qNote(b.dataset.q))} ${esc(T("Applies after a reload."))} <button type="button" class="wp-link" id="wp-set-reload">${esc(T("Reload now"))}</button>`;
});
// what each quality level turns on (shown under the choice)
function qNote(q) {
  return T({ auto: "Picked for your device: the Medium picture at 1.5× pixels on phones and computers, easing off if frames drop. A strong PC can choose Ultra.",
    low: "The lightest: no grass, no picture effects, fewer particles.", medium: "Smooth edges, ink outlines, fog and colour grading, grass (less on phones).",
    ultra: "Everything: soft shade in corners, sun shafts, the fountain's reflection, outlines on characters, the most grass.",
    saver: "Half the frames and 1× pixels, no bloom or shadows: for a long session on battery." }[q] || "");
}
// the frame rate in a corner (Settings → Frame rate): for checking a preset on your own phone
// the frame limit: 30 or 45 saves battery and heat on a phone; 60 is the default
$("wp-set-cap").addEventListener("click", (e) => { const b = e.target.closest("[data-cap]"); if (!b) return; S.fpsCap = Number(b.dataset.cap); saveSet(); st.fps(S.fpsCap); setEl.querySelectorAll("#wp-set-cap button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
$("wp-set-fps").addEventListener("click", () => { S.fps = !S.fps; saveSet(); $("wp-set-fps").setAttribute("aria-pressed", String(S.fps)); $("wp-set-fps").textContent = S.fps ? TW("On") : T("Show"); $("wp-fps").hidden = !S.fps; });
{ let n = 0, t0 = performance.now(); $("wp-fps").hidden = !S.fps;
  st.on(() => { if (!S.fps) return; n++; const now = performance.now(); if (now - t0 >= 500) { const info = st.renderer.info.render; $("wp-fps").textContent = `${Math.round((n * 1000) / (now - t0))} fps · ${info.calls} draws`; n = 0; t0 = now; } }); }
$("wp-set-lang").addEventListener("click", (e) => { const b = e.target.closest("button[data-l]"); if (!b || b.dataset.l === LANG) return; try { localStorage.setItem("arcircle.lang", b.dataset.l); } catch { /* private */ } if (window.arcI18n) window.arcI18n.set(b.dataset.l); location.reload(); });

// ---------------- the controls guide: keyboard, mouse and touch, shown once and from Settings ----------------
const guide = document.createElement("div");
guide.className = "wp-guide"; guide.id = "wp-guide"; guide.hidden = true; guide.setAttribute("role", "dialog"); guide.setAttribute("aria-modal", "true"); guide.setAttribute("aria-labelledby", "wp-guide-h"); guide.setAttribute("data-no-i18n", "");
{
  const K2 = (k, c = "") => `<span class="${c}">${k}</span>`;
  const kb = [
    [K2("Esc", "u"), K2("1", "a"), K2("2", "a"), K2("3"), K2("4"), K2("5"), K2("6"), K2("7"), K2("8"), K2("9"), K2("0")],
    [K2("Tab", "b w15"), K2("Q"), K2("W", "m"), K2("E", "a"), K2("R", "b"), K2("T", "a"), K2("Y"), K2("U"), K2("I"), K2("O"), K2("P", "a")],
    [K2("Caps", "w15"), K2("A", "m"), K2("S", "m"), K2("D", "m"), K2("F", "a"), K2("G", "b"), K2("H", "u"), K2("J", "m"), K2("K", "m"), K2("L", "b"), K2("Enter", "a w15")],
    [K2("Shift", "m w2"), K2("Z", "m"), K2("X", "b"), K2("C", "b"), K2("V", "b"), K2("B", "b"), K2("N"), K2("M", "u"), K2(","), K2("Shift", "w2")],
    [K2("Ctrl", "b w15"), K2("Alt"), K2(W("Space"), "m w6"), K2("Alt"), K2("Ctrl", "w15")],
  ].map((r) => `<div class="wp-kb-row">${r.join("")}</div>`).join("");
  const li = (keys, what, c) => `<li><span>${keys.map((k) => `<kbd style="--k:${c[0]};--kc:${c[1]}">${ICONS.GLYPH[k] ? ICONS.icon(ICONS.GLYPH[k], 16) : esc(k)}</kbd>`).join(" ")}</span>${esc(what.includes(" ") ? T(what) : W(what))}</li>`;
  const M = ["#ff5f73", "#fff"], A = ["#ffd34d", "#3b2416"], U = ["#6fdc8c", "#0a2414"], B = ["#7ea3ff", "#0b1838"];
  const legend = `<ul class="wp-guide-legend">
    <h4>${esc(W("Moving"))}</h4>${li(["W", "A", "S", "D"], "Move (or the arrow keys)", M)}${li(["Shift"], "Run (hold)", M)}${li([W("Space")], "Jump", M)}
    <h4>${esc(T("Doing things"))}</h4>${li(["E"], "Enter a shop, talk", A)}${li(["F"], "Hoverboard on and off", A)}${li(["1", "2"], "Wave, shake your head", A)}${li(["T"], "Emote wheel: sit, point, faint…", A)}${li(["P"], "Photo mode", A)}
    <h4>${esc(W("Fighting"))}</h4>${li(["J"], "Attack", M)}${li(["J"], "Hold to charge, let go when the ring is full: each weapon has its own charged attack", M)}${li(["K"], "Dodge: a quick dash nothing can hit", M)}${li(["Z"], "Cast the skill in your slot (skills come at levels 10, 20, 40, 80)", M)}${li(["Q"], "Change the skill in the slot", M)}${li(["4", "5"], "Health and mana potions", M)}${li(["I"], "Character, gear and bag", M)}${li(["L"], "Adventure log", M)}
    <h4>${esc(W("Menus"))}</h4>${li(["M"], "Map and fast travel", U)}${li(["H"], "Help Center", U)}${li(["Esc"], "Close what's open", U)}
    <h4>${esc(T("Game controller"))}</h4>${li(["A"], "Jump", M)}${li(["X", "B", "Y"], "Attack, dodge, the skill", M)}${li(["LB", "RB"], "Change the skill", M)}${li(["LT", "RT"], "Health and mana potions", M)}${li(["▲", "▼"], "Emotes and lines to say, enter a shop", A)}${li(["Start", "View"], "Map, Adventure log", U)}
    <h4>${esc(T("Building on your island"))}</h4>${li(["B"], "Build mode on and off", B)}${li(["Tab"], "All bricks", B)}${li(["R"], "Rotate the brick", B)}${li(["X"], "Remove tool", B)}${li(["C"], "Paint tool", B)}${li(["V"], "Pick a brick and its colour", B)}${li(["G"], "Mirror", B)}${li(["L"], "Layer lock", B)}${li(["Ctrl", "Z"], "Undo", B)}
  </ul>`;
  const mouse = `<div class="wp-guide-mouse"><svg viewBox="0 0 100 150" aria-hidden="true"><rect x="8" y="6" width="84" height="138" rx="42" fill="#3b3f47" stroke="#22252b" stroke-width="3"/><path d="M50 6v52M8 58h84" stroke="#22252b" stroke-width="3"/><path d="M50 9a41 41 0 0 0-39 46h39z" fill="#ffd34d"/><path d="M50 9a41 41 0 0 1 39 46H50z" fill="#7ea3ff"/><rect x="44" y="20" width="12" height="26" rx="6" fill="#6fdc8c" stroke="#22252b" stroke-width="2.5"/></svg>
    <ul class="wp-guide-legend">${li([W("Drag")], "Look around", U)}${li([W("Wheel")], "Zoom in and out", U)}${li([W("Click")], "Building: place a brick", A)}${li([TW("Right-click")], "Building: remove a brick", B)}</ul></div>`;
  const touch = `<div class="wp-guide-touch"><svg viewBox="0 0 200 380" aria-hidden="true"><rect x="6" y="6" width="188" height="368" rx="30" fill="#141a24" stroke="#3b3f47" stroke-width="5"/><rect x="18" y="40" width="82" height="300" rx="12" fill="rgba(255,95,115,.18)" stroke="#ff5f73" stroke-dasharray="6 5"/><rect x="100" y="40" width="82" height="200" rx="12" fill="rgba(111,220,140,.15)" stroke="#6fdc8c" stroke-dasharray="6 5"/><circle cx="58" cy="270" r="30" fill="none" stroke="#ff5f73" stroke-width="4"/><circle cx="58" cy="270" r="12" fill="#ff5f73"/><circle cx="160" cy="320" r="17" fill="#52d4e3" stroke="#3b2416" stroke-width="3"/><circle cx="124" cy="296" r="11" fill="#ff5f73" stroke="#3b2416" stroke-width="3"/><circle cx="124" cy="266" r="11" fill="#ffd34d" stroke="#3b2416" stroke-width="3"/><circle cx="150" cy="266" r="11" fill="#7ea3ff" stroke="#3b2416" stroke-width="3"/><circle cx="176" cy="266" r="11" fill="#ffa86a" stroke="#3b2416" stroke-width="3"/><text x="58" y="225" fill="#ffb3bd" font-size="15" font-weight="700" text-anchor="middle">${esc(W("Move"))}</text><text x="141" y="140" fill="#b4f0c4" font-size="15" font-weight="700" text-anchor="middle">${esc(W("Look"))}</text></svg>
    <ul class="wp-guide-legend">${li(["◐"], "Left thumb: drag to walk (push far to run)", M)}${li(["◑"], "Right side: drag to look around", U)}${li(["⇲⇱"], "Two fingers: pinch to zoom", U)}
      <h4>${esc(W("Buttons"))}</h4>${li(["↑"], "Jump", ["#52d4e3", "#06222a"])}${li(["▶"], "Run on and off", M)}${li(["✋"], "Emotes: wave, sit, point…", A)}${li(["⏏"], "Hoverboard", B)}${li(["◉"], "Photo mode", ["#ffa86a", "#3b2416"])}${li(["⚔"], "Attack, and the skill slot (hold it to change the skill)", ["#ff6b6b", "#3b0a12"])}
      <h4>${esc(T("Building on your island"))}</h4>${li([W("Tap")], "Place a brick with the tool you picked", B)}</ul></div>`;
  guide.innerHTML = `<div class="wp-guide-card"><h2 id="wp-guide-h">${esc(T("How to play"))}</h2><p>${esc(T("You can open this again any time from Settings."))}</p>
    <nav class="wp-guide-tabs"><button type="button" data-g="kb">${esc(T("Keyboard and mouse"))}</button><button type="button" data-g="touch">${esc(T("Touch screen"))}</button></nav>
    <section data-p="kb"><div class="wp-kb">${kb}</div>${legend}${mouse}</section><section data-p="touch" hidden>${touch}</section>
    <button type="button" class="wp-cta wp-guide-go" id="wp-guide-go">${esc(T("Got it, let's play"))}</button></div>`;
  document.body.appendChild(guide);
}
function guideTab(t) { guide.querySelectorAll("[data-g]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === t))); guide.querySelectorAll("[data-p]").forEach((p) => { p.hidden = p.dataset.p !== t; }); }
function openGuide() { guideTab(coarse ? "touch" : "kb"); guide.hidden = false; frozen = true; keys.clear(); paintPrompt(); setTimeout(() => $("wp-guide-go").focus({ preventScroll: true }), 60); }
function closeGuide() { if (guide.hidden) return; guide.hidden = true; frozen = false; if (!P.guideSeen) { P.guideSeen = true; save(); setNameTag(); } firstRun(false); setTimeout(() => arclShop.maybeDaily(), 600); }
guide.addEventListener("click", (e) => { const b = e.target.closest("[data-g]"); if (b) guideTab(b.dataset.g); if (e.target.id === "wp-guide-go" || e.target === guide) closeGuide(); });
// first time in: after the sign-in and the character maker
function maybeGuide() { if (!P.guideSeen && auth.hidden && make.hidden && guide.hidden) setTimeout(() => { if (!P.guideSeen && auth.hidden && make.hidden) quickStart(); }, 500); }
// b-st1: the screen's buttons hidden on a first visit (the maker and the first cards over the world alone), then they
// come in one after another
function firstRun(on) {
  if (on) { document.body.classList.add("wp-first"); return; }
  if (!document.body.classList.contains("wp-first")) return;
  document.body.classList.remove("wp-first"); document.body.classList.add("wp-hudin"); setTimeout(() => document.body.classList.remove("wp-hudin"), 2200);
  startSweep();
}
/// b-st2: as you start, the camera swings round from in front of your hero to its place behind (the landing's slow follow)
function startSweep(ms = 1800) {
  if (reduce || introOn || mode !== "hub") return;
  const a = camYaw + Math.PI * 0.62; cam.position.set(at.x - Math.sin(a) * 5.5, at.y + 2.6, at.z - Math.cos(a) * 5.5); landUntil = performance.now() + ms;
}
let qsAt = 0; // b-st3: when the how-to closed
/// b-st3: back on another day: a card that slides in at the top (your name, how long you were away, what's on next), 6 s
function welcomeBack(days) {
  if (!P.char || document.querySelector(".wp-wb")) return; const ev = plazaEvents()[0], lp = lastPos();
  const el = document.createElement("div"); el.className = "wp-wb"; el.setAttribute("role", "status");
  el.innerHTML = `<b>${esc(TW("Welcome back, {x}!", { x: P.name || TW("hero") }))}</b><small>${esc(days > 1 ? TW("{n} days since your last visit", { n: days }) : TW("Good to see you again today"))}${fountDay() !== tipDay() ? " · " + esc(TW("today's fountain coin is waiting")) : ""}</small>${ev ? `<em>${ev.ic} ${esc(ev.t)} · ${esc(ev.live ? TW("now") : evLeft(ev.at))}</em>` : ""}${lp ? `<button type="button" data-wb="last">📍 ${esc(TW("Back to where I left"))}</button>` : ""}`;
  // b-st3: the spawn choice: the plaza (where you are), or back to where you left off last time (a spot in town)
  el.addEventListener("click", (e) => { if (!e.target.closest('[data-wb="last"]') || !lp || mode !== "hub" || flying || introOn) return; standAt(lp.x, lp.z, { x: lp.x + Math.sin(lp.f || 0), z: lp.z + Math.cos(lp.f || 0) }); vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff }); startSweep(1200); el.classList.remove("on"); });
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on")); setTimeout(() => el.classList.remove("on"), lp ? 9000 : 6000); setTimeout(() => el.remove(), lp ? 9600 : 6600);
  if (Snd.quest) Snd.quest();
}
/// b-st3: where you were in town (not the plaza, not a land), kept every 20 s and as the page goes, for "back to where I left"
const LASTPOS = "arc.world.lastpos";
function keepPos() { try { if (!landed || mode !== "hub" || landNow || flying || introOn) return; const x = -planet.position.x, z = -planet.position.z; if (Math.hypot(x, z) < 24) return; localStorage.setItem(LASTPOS, JSON.stringify({ x: +x.toFixed(1), z: +z.toFixed(1), f: +facing.toFixed(2), at: Date.now() })); } catch { /* private */ } }
every(20000, keepPos); addEventListener("pagehide", keepPos);
const lastPos = () => { try { const p = JSON.parse(localStorage.getItem(LASTPOS) || "null"); return p && Date.now() - p.at < 7 * 864e5 && Math.hypot(p.x, p.z) >= 24 && !LD.landAt(p.x, p.z) ? p : null; } catch { return null; } };
/// b-st3: what's on next round town (all on the clock, so every player sees the same): the fountain's show on the hour,
/// Jurassic's boss hour (12:00 and 20:00 Seoul), poker's Sit & Go (even UTC hours), the Pumpkin Kings' night (20:00 US Eastern)
function plazaEvents(now = Date.now()) {
  const ev = [], d = new Date(now), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  ev.push({ ic: "⛲", t: TW("The fountain's show"), at: now + 3600e3 - (now % 3600e3) });
  for (const h of [3, 11]) { let t = day0 + h * 3600e3; if (t + 30 * 60e3 < now) t += 864e5; ev.push({ ic: "🦖", t: TW("Jurassic boss hour"), at: t, live: t <= now }); }
  { const h = d.getUTCHours(); ev.push({ ic: "🃏", t: TW("Poker Sit & Go"), at: day0 + (h + (h % 2 ? 1 : 2)) * 3600e3 }); }
  let co = false; try { co = cityOk; } catch { /* not declared yet: still loading */ }
  if (co) for (const h of [3, 12]) { let t = day0 + h * 3600e3; if (t + 60 * 60e3 < now) t += 864e5; ev.push({ ic: "🏟️", t: TW("Agent Arena hour"), at: t, live: t <= now }); } /* (12:00 and 21:00 Seoul: api/_world-agarena.mjs ARENA.HOURS) */
  let pk = null; try { pk = pumpKings; } catch { /* not declared yet: still loading */ }
  if (pk) { const eh = etHour(now), live = eh >= 20 || eh < 5; ev.push({ ic: "🎃", t: TW("The Pumpkin Kings wake"), at: live ? now : now + (20 - eh) * 3600e3, live }); }
  return ev.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || a.at - b.at);
}
const evLeft = (at) => { const m = Math.max(0, Math.round((at - Date.now()) / 60e3)); return m >= 60 ? TW("in {h} h {m} min", { h: Math.floor(m / 60), m: m % 60 }) : TW("in {m} min", { m }); };
// on a phone the top row is full (brand, level, buttons): the pill goes just under the quest card (or the HP card),
// centred, where it clears the minimap; a computer has room at the top centre
function placePill(pill) {
  if (!document.documentElement.classList.contains("wp-pcphone")) { pill.style.top = ""; return; }
  let y = 0; for (const e of [...document.querySelectorAll(".wp-hud-l > *"), document.getElementById("wp-qmini"), document.getElementById("wc-vit"), document.querySelector(".wp-chips")]) { /* (everything in the left column, the folded quest button too: the boss bar sat on it, the owner's phone 2026-10-24) */ if (!e || !e.getClientRects().length) continue; const r = e.getBoundingClientRect(); if (r.height > 0) y = Math.max(y, r.bottom); }
  pill.style.top = y ? Math.round(y + 14) + "px" : "";
}
addEventListener("resize", () => { const p = document.getElementById("wp-evt"); if (p && !p.hidden) placePill(p); });
// phone HUD (the owner's call 2026-10-24): one notice at a time, in one place under the top cards (the boss call, the egg,
// the agent, the events pill take turns, 6 s each); while a boss's bar is up it has that place to itself
const NQ = [".wp-bosscall", ".wp-dinochip", ".wag-chip", "#wp-evt"]; let nqI = 0, nqAt = 0, nqTop = 0;
function noticeSlot() { let y = 0; for (const e of [...document.querySelectorAll(".wp-hud-l > *"), document.getElementById("wp-qmini"), document.getElementById("wc-vit"), document.querySelector(".wp-chips")]) { /* (everything in the left column, the folded quest button too: the boss bar sat on it, the owner's phone 2026-10-24) */ if (!e || !e.getClientRects().length) continue; const r = e.getBoundingClientRect(); if (r.height > 0) y = Math.max(y, r.bottom); } return y ? Math.round(y + 20) : 0; }
const nqSeen = new WeakSet(), nqObs = typeof MutationObserver === "function" ? new MutationObserver(() => nqRun()) : null; /* (a notice or the boss bar shown or hidden: the slot is sorted at once, not on the next second) */
every(1000, () => nqRun());
function nqRun() { try {
  const ph = document.documentElement.classList.contains("wp-pcphone"), els = NQ.map((q) => document.querySelector(q)).filter(Boolean);
  if (nqObs) for (const e of [...els, document.getElementById("wc-boss")]) if (e && !nqSeen.has(e)) { nqSeen.add(e); nqObs.observe(e, { attributes: true, attributeFilter: ["hidden", "class"] }); }
  if (!ph) { for (const e of els) e.classList.remove("wp-nq-off"); return; }
  const y = noticeSlot(); if (y && y !== nqTop) { nqTop = y; document.documentElement.style.setProperty("--nq-top", y + "px"); }
  { const mm = document.querySelector(".wp-mini"), r = mm && mm.getClientRects().length ? mm.getBoundingClientRect() : null, right = r && r.bottom > y && r.top < y + 90 ? Math.round(r.left - 14) : innerWidth - 18; /* (the room left of the minimap) */
    const R = document.documentElement.style; if (R.getPropertyValue("--nq-r") !== right + "px") { R.setProperty("--nq-r", right + "px"); R.setProperty("--nq-cx", Math.round((18 + right) / 2) + "px"); R.setProperty("--nq-w", (right - 18) + "px"); } }
  const boss = document.getElementById("wc-boss"), bossOn = !!(boss && !boss.hidden), live = els.filter((e) => !e.hidden);
  const call = live.find((e) => e.matches(".wp-bosscall")); let show = null;
  if (call) show = call; else if (!bossOn && live.length) { if (Date.now() - nqAt > 6000) { nqI++; nqAt = Date.now(); } show = live[nqI % live.length]; }
  for (const e of els) { const off = e !== show; if (e.classList.contains("wp-nq-off") !== off) e.classList.toggle("wp-nq-off", off); }
  if (show && y) { const z = Number(getComputedStyle(show).zoom) || 1, t = Math.round(y / z) + "px"; if (show.style.top !== t) show.style.top = t; }
} catch { /* the next second */ } }
// the pill at the top of the screen: the next three, one at a time (in town only). Off since 2026-10-24 (the owner: it
// stood over the middle of the screen); the schedule is still in the events list and the start's welcome card
const EVT_PILL = false;
{ const pill = document.createElement("div"); pill.className = "wp-evt"; pill.id = "wp-evt"; pill.setAttribute("aria-live", "off"); pill.hidden = true; document.body.appendChild(pill); let i = 0;
  every(6000, () => { try { const on = EVT_PILL && landed && mode === "hub" && !frozen && !introOn && !document.body.classList.contains("wp-first"); pill.hidden = !on; if (!on) return;
    const L = plazaEvents().slice(0, 3), e = L[i++ % L.length]; if (!e) return; pill.innerHTML = `<span>${e.ic}</span><b>${esc(e.t)}</b><small class="${e.live ? "live" : ""}">${esc(e.live ? TW("now") : evLeft(e.at))}</small>`; placePill(pill); pill.classList.remove("in"); void pill.offsetWidth; pill.classList.add("in"); } catch { /* next time */ } }); }
/// b-st3: a coin launched on ArcPad in the last 15 minutes: fireworks over the plaza, once per coin on this device
function launchFireworks(c) {
  if (!c || !c.launchedAt || Date.now() - c.launchedAt > 15 * 60e3 || mode !== "hub" || reduce) return; const k = "arc.world.fw." + String(c.token || c.symbol || "").slice(0, 46);
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, "1"); } catch { return; }
  const C = [0x38d8ff, 0x2ee0a0, 0xffc861, 0xff7ab6, 0x9b8cff];
  for (let n = 0; n < 7; n++) setTimeout(() => { try { vfx.burst(new THREE.Vector3((Math.random() - 0.5) * 14, 14 + Math.random() * 6, (Math.random() - 0.5) * 14), C[n % C.length], true); if (Snd.pop) Snd.pop(); } catch { /* fine */ } }, n * 420);
  feed(`🚀 ${esc(TW("New launch on ArcPad"))}: <b>$${esc(c.symbol || "")}</b>`, "#ffc861");
}
/// b-st3: a coin in the fountain, once a Seoul day: a wish, the jets leap, 10 ARCL (the server checks the day: arcl-claim "fountain")
const WISHES = ["May your next chest be golden.", "May the scammers never find your wallet.", "May your hero level up twice today.", "May your island be the week's best.", "May your dino hatch strong.", "May the river card be yours."];
const fountDay = () => { try { return localStorage.getItem("arc.world.fount") || ""; } catch { return ""; } };
function tossCoin() {
  if (fountDay() === tipDay()) return; try { localStorage.setItem("arc.world.fount", tipDay()); } catch { /* private: once this visit */ } near = null; paintPrompt();
  try { fountain.userData.burst(5); vfx.burst(new THREE.Vector3(0, 2.4, 0), 0xffc861, true); if (Snd.coin) Snd.coin(); if (avatar && !(avatar.busy && avatar.busy())) avatar.play("cast", { once: true }); } catch { /* fine */ }
  toast(`⛲ <b>${esc(TW(WISHES[Math.floor(Math.random() * WISHES.length)]))}</b>`);
  arclShop.claim("fountain", {}, null);
}
/// b-st2: a portal's pull: the screen flashes its colour from the middle out (CSS, gone in 0.7 s)
function pullFlash(c) { if (reduce) return; const f = document.createElement("div"); f.className = "wp-pull"; f.style.setProperty("--c", c); f.setAttribute("aria-hidden", "true"); document.body.appendChild(f); setTimeout(() => f.remove(), 800); }
/// b-st2: the first arrival: a big welcome over the plaza and confetti (DOM, gone in 3 s)
function welcomeBurst() {
  if (reduce) return; const w = document.createElement("div"); w.className = "wp-welcome"; w.setAttribute("aria-hidden", "true");
  const C = ["#38d8ff", "#2ee0a0", "#ffc861", "#ff7ab6", "#9b8cff", "#ffffff"];
  w.innerHTML = `<b>${esc(TW("Welcome!"))}</b><small>ARCIRCLE WORLD</small>` + Array.from({ length: 46 }, (_, i) => `<i style="--x:${(Math.random() * 2 - 1).toFixed(2)};--y:${(0.4 + Math.random()).toFixed(2)};--r:${Math.round(Math.random() * 720 - 360)}deg;--d:${(Math.random() * 0.3).toFixed(2)}s;background:${C[i % C.length]}"></i>`).join("");
  document.body.appendChild(w); setTimeout(() => w.classList.add("out"), 2300); setTimeout(() => w.remove(), 3000);
}
// b-st1: the first-time guide: three cards (move, jump, attack) for this screen; "All controls" opens the full one
function quickStart() {
  if (document.querySelector(".wp-qs")) return;
  const tc = coarse, cards = tc
    ? [["🕹️", TW("Move"), TW("Drag the stick on the left. Push it far to run.")], ["⤴️", TW("Jump"), TW("Tap the big blue arrow.")], ["🗡️", TW("Attack"), TW("Tap the red sword near a scammer.")]]
    : [["⌨️", TW("Move"), TW("W A S D or the arrow keys. Hold Shift to run.")], ["⤴️", TW("Jump"), TW("Space.")], ["🗡️", TW("Attack"), TW("J, or click the red sword near a scammer.")]];
  const el = document.createElement("div"); el.className = "wp-qs"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", TW("How to play"));
  el.innerHTML = `<div class="wp-qs-in"><small>${esc(TW("Welcome to ARCIRCLE WORLD"))}</small><b>${esc(TW("Three things to start"))}</b>
    <ol>${cards.map(([ic, t, p0], i) => `<li style="--i:${i}"><span aria-hidden="true">${ic}</span><div><b>${esc(t)}</b><p>${esc(p0)}</p></div></li>`).join("")}</ol>
    <div class="wp-qs-row"><button type="button" class="wp-btn" data-qs="all">${esc(TW("All controls"))}</button><button type="button" class="wp-cta" data-qs="go">${esc(TW("Let's go!"))}</button></div></div>`;
  frozen = true; keys.clear(); paintPrompt();
  const done = (all) => { fun("start"); qsAt = Date.now(); el.classList.add("out"); setTimeout(() => el.remove(), 260); frozen = false; if (all) { openGuide(); return; } if (!P.guideSeen) { P.guideSeen = true; save(); } firstRun(false); setNameTag(); setTimeout(() => arclShop.maybeDaily(), 600); };
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-qs]"); if (b) done(b.dataset.qs === "all"); });
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on")); setTimeout(() => { const g = el.querySelector('[data-qs="go"]'); if (g) g.focus({ preventScroll: true }); }, 80);
}

// phones: the compact (PC-style) layout or the large one; applied on reload (play.html sets the viewport)
const VP = (() => { try { return localStorage.getItem("arc.world.vp") || "pc"; } catch { return "pc"; } })();
// the screen on a computer (play.html, world-shell.js): the whole window, a smaller window, or a phone; the page around
// the game is reloaded with the choice
{ const cur = window.__arcFrame || "full";
  if (window.__arcFrame || !coarse) {
    $("wp-set-view-row").hidden = false; $("wp-set-view-l").textContent = T("Screen");
    $("wp-set-view").querySelectorAll("button").forEach((b) => { b.textContent = T({ full: "Full", window: "Window", mobile: "Mobile" }[b.dataset.view]); b.setAttribute("aria-pressed", String(b.dataset.view === cur)); });
    $("wp-set-view").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (!b || b.dataset.view === cur) return; try { localStorage.setItem("arc.world.view", b.dataset.view); } catch { /* private */ } window.top.location.reload(); });
  } }
if (coarse && window.__arcFrame !== "mobile") { $("wp-set-vp-row").hidden = false; $("wp-set-vp").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vp === VP))); }
$("wp-set-guide").addEventListener("click", () => { closeSet(); openGuide(); });
$("wp-set-vp").addEventListener("click", (e) => { const b = e.target.closest("button[data-vp]"); if (!b || b.dataset.vp === VP) return; try { localStorage.setItem("arc.world.vp", b.dataset.vp); } catch { /* private */ } location.reload(); });
$("wp-set-snd").addEventListener("change", (e) => Snd.set(e.target.checked));
$("wp-set-music").value = String(S.music ?? 55);
$("wp-set-music").addEventListener("input", (e) => { S.music = Math.round(Number(e.target.value)); music.setVolume(musicVol()); });
Snd.settings(T); // Sound effects and Footsteps, under Music (world-sfx.js)
$("wp-set-music").addEventListener("change", () => { saveSet(); music.start(); });
// vibration on a phone: a hit taken, a boss's strike, a charged attack, a bite on the line, a crit, a level up (off in Settings;
// its own switch: Less motion leaves it on)
// only while you're playing: nothing buzzes when the phone just sits there (a scammer wandering up, a boss's miss)
let lastInput = 0; for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
const buzz = (ms) => { if (S.vib === false || !navigator.vibrate || performance.now() - lastInput > 4000 || document.hidden) return; try { navigator.vibrate(ms); } catch { /* not allowed */ } };
if (navigator.vibrate && matchMedia("(pointer: coarse)").matches) { $("wp-set-vibrow").hidden = false; $("wp-set-vib").checked = S.vib !== false; $("wp-set-vib").addEventListener("change", (e) => { S.vib = e.target.checked; saveSet(); if (S.vib) buzz(30); }); }
$("wp-set-showname").addEventListener("change", (e) => { S.showName = !!e.target.checked; saveSet(); });
// easier to read: larger text across the HUD and the windows; colours that don't lean on red against green
const paintA11y = () => { document.documentElement.classList.toggle("wp-big", !!S.big); document.documentElement.classList.toggle("wp-cb", !!S.cb); };
paintA11y();
$("wp-set-big").addEventListener("change", (e) => { S.big = !!e.target.checked; saveSet(); paintA11y(); });
$("wp-set-cb").addEventListener("change", (e) => { S.cb = !!e.target.checked; saveSet(); paintA11y(); });
// the tutorial again from the first step (its XP was given the first time, so not again)
$("wp-set-tut").addEventListener("click", () => { P.tut = 0; P.tutBits = 0; P.tutAgain = true; save(); closeSet(); tutorialStep(-1); setTimeout(openGuide, 300); });
$("wp-set-motion").addEventListener("change", (e) => { S.motion = e.target.checked ? "less" : ""; saveSet(); $("wp-set-q-note").innerHTML = `${esc(T("Applies after a reload."))} <button type="button" class="wp-link" id="wp-set-reload">${esc(T("Reload now"))}</button>`; });
$("wp-set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSet(); });
// b448: phones fold the photo, hoverboard and wave buttons behind "⋯" (eight buttons sat in the bottom-right corner)
{ const acts = $("wp-acts"), more = $("wp-act-more");
  if (acts && more) {
    // "⋯" takes the wave button's own place (read from the layout, which the phone CSS sets), and the wave button
    // rises just above it when the fold opens
    const emo = $("wp-act-emote"); let slot = null;
    const place = () => { if (!document.documentElement.classList.contains("wp-pcphone") || !emo) return; const was = acts.classList.contains("open"); acts.classList.add("open"); emo.style.bottom = ""; const cs = getComputedStyle(emo); slot = { r: cs.right, b: cs.bottom, h: emo.offsetHeight }; more.style.right = slot.r; more.style.bottom = slot.b; fold(was); }; /* (read while open: a hidden button has no size) */
    const fold = (open) => { acts.classList.toggle("open", open); more.setAttribute("aria-expanded", String(open)); if (emo && slot) emo.style.bottom = open ? `calc(${slot.b} + ${Math.round(slot.h * 1.15)}px)` : ""; };
    setTimeout(place, 0); addEventListener("orientationchange", () => setTimeout(place, 300)); // (not on resize: reading the layout there fed back into itself)
    more.addEventListener("click", (e) => { e.stopPropagation(); fold(!acts.classList.contains("open")); });
    acts.addEventListener("click", (e) => { if (e.target.closest(".wp-act-board,.wp-act-emote,.wp-act-photo")) setTimeout(() => fold(false), 150); });
    addEventListener("pointerdown", (e) => { if (acts.classList.contains("open") && !e.target.closest("#wp-acts")) fold(false); }, true);
  } }
// b443: the fixed joystick's size and height (phones): CSS variables on <html>; restAt() reads the ring's real box, and
// the knob's reach grows with the ring
const joyApply = () => { const k = [0.85, 1, 1.2].includes(+S.joyK) ? +S.joyK : 1, up = Math.max(0, Math.min(240, +S.joyUp || 0)); document.documentElement.style.setProperty("--joy-k", k); document.documentElement.style.setProperty("--joy-up", up + "px"); joyMax = JOYMAX * k; joyK = k; };
$("wp-set-joyk").addEventListener("change", (e) => { S.joyK = +e.target.value; saveSet(); joyApply(); });
$("wp-set-joyup").addEventListener("input", (e) => { S.joyUp = +e.target.value; saveSet(); joyApply(); });
joyApply();
$("wp-set-char").addEventListener("click", () => { closeSet(); openMake(); });
let resetArm = 0;
$("wp-set-reset").addEventListener("click", (e) => {
  if (Date.now() - resetArm > 3000) { resetArm = Date.now(); e.currentTarget.textContent = T("Tap again to reset"); return; }
  try { localStorage.removeItem(SAVE); localStorage.setItem("arc.world.reset", "1"); } catch { /* private */ } location.reload();
});
// photo mode: the HUD steps aside, drag to frame the shot, then save or share it
let photoFilter = "none", photoSticker = 0, photoHour = null, photoDof = 0;
// photo mode's focus (world-post.js): you stay sharp, the background (and anything right in front) softens
{ const pw = new THREE.Vector3(); st.on(() => { if (!fxPost || !fxPost.setDof) return; if (!photo || !photoDof) { if (fxPost.dof && fxPost.dof.enabled) fxPost.setDof(null); return; } player.getWorldPosition(pw); pw.y += 1; const d = st.camera.position.distanceTo(pw); fxPost.setDof({ focus: d, range: photoDof === 2 ? Math.max(1.2, d * 0.18) : Math.max(2, d * 0.35), blur: photoDof === 2 ? 12 : 7 }); }); }
const photoStickers = () => ["", quests && quests.title(), (P.rpg && P.rpg.x && P.rpg.x.ach || []).includes("raid1") ? T("Raid Breaker") : "", P.rpg && P.rpg.x && P.rpg.x.stitle ? T("Season Star") : "", "ARCIRCLE World"].filter((x, i) => i === 0 || x);
{ // filters, a sticker and a pose (built here so the words come from the game's own maps)
  const o = document.createElement("div"); o.className = "wp-photo-opts"; o.setAttribute("data-no-i18n", "");
  o.innerHTML = `<div><span>${esc(W("Filter"))}</span>${["none", "warm", "cool", "noir", "neon", "film", "vivid"].map((f) => `<button type="button" data-pf="${f}" aria-pressed="${f === "none"}">${esc(W(f[0].toUpperCase() + f.slice(1)))}</button>`).join("")}</div>
    <div><span>${esc(W("Time"))}</span>${[["", "Now"], [7, "Morning"], [13, "Noon"], [18.3, "Dusk"], [22, "Night"]].map(([h, n]) => `<button type="button" data-ph="${h}" aria-pressed="${h === ""}">${esc(W(n))}</button>`).join("")}</div>
    <div><span>${esc(W("Sticker"))}</span><button type="button" id="wp-photo-sticker">${esc(W("None"))}</button><span>${esc(W("Pose"))}</span>${[["emote-yes", "Wave"], ["sit", "Sit"], ["interact-right", "Point"]].map(([a, n]) => `<button type="button" data-pp="${a}">${esc(W(n))}</button>`).join("")}</div><div class="wp-photo-dof"><span>${esc(W("Focus"))}</span>${[["0", "Off"], ["1", "Soft"], ["2", "Strong"]].map(([v, n]) => `<button type="button" data-pd="${v}" aria-pressed="${v === "0"}">${esc(W(n))}</button>`).join("")}</div>`;
  $("wp-photo-bar").prepend(o);
  o.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pf) { photoFilter = b.dataset.pf; o.querySelectorAll("[data-pf]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cv.style.filter = SOC.PHOTO_FILTERS[photoFilter] || ""; }
    else if (b.dataset.ph != null) { photoHour = b.dataset.ph === "" ? null : Number(b.dataset.ph); o.querySelectorAll("[data-ph]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); nightK = -1; dayNight(); } // the light of another hour, for this photo
    else if (b.id === "wp-photo-sticker") { const l = photoStickers(); photoSticker = (photoSticker + 1) % l.length; b.textContent = l[photoSticker] || W("None"); }
    else if (b.dataset.pp && avatar) avatar.play(b.dataset.pp, { once: b.dataset.pp !== "sit" });
    else if (b.dataset.pd != null) { photoDof = Number(b.dataset.pd); o.querySelectorAll("[data-pd]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); if (!fxPost && photoDof) toast(T("Focus blur needs Medium quality or higher (Settings)")); }
  });
}
function setPhoto(on) {
  photo = on; document.body.classList.toggle("wp-photo", on); $("wp-photo-bar").hidden = !on;
  if (!on) { cv.style.filter = ""; if (photoHour != null) { photoHour = null; nightK = -1; dayNight(); document.querySelectorAll("[data-ph]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.ph === ""))); } }
  frozen = on; keys.clear(); paintPrompt();
  if (on) toast(T("Photo mode: drag to frame, scroll to zoom"));
}
$("wp-photo-exit").addEventListener("click", () => setPhoto(false));
$("wp-photo-take").addEventListener("click", async () => {
  const bar = $("wp-photo-bar"); bar.hidden = true; Snd.shutter();
  const raw = await st.snap(); bar.hidden = false; if (!raw) return;
  const opt = { name: P.name || "", lv: level(), where: mode === "island" ? island.title() : $("wp-mini-n").textContent || "", filter: photoFilter, sticker: photoStickers()[photoSticker] || "" };
  // the version on screen is made first; the other one only when the frame is switched
  shotSrc = raw; shotOpt = opt; shotRaw = shotFramed = null;
  if (shotFrame) shotFramed = await SOC.frameShot(raw, opt).catch(() => raw); else shotRaw = await SOC.frameShot(raw, { ...opt, frame: false }).catch(() => raw);
  $("wp-shot-frame").hidden = false; $("wp-shot-frame").setAttribute("aria-pressed", String(shotFrame));
  showShot(shotFrame ? shotFramed : shotRaw);
});
// the photo (or card) sheet: save, share, post on X; a photo can wear the game's frame or not
let shotRaw = null, shotFramed = null, shotFrame = true, shotUrl = "", shotSrc = null, shotOpt = {};
function showShot(blob, text) {
  if (shotUrl) URL.revokeObjectURL(shotUrl);
  const msg = text || T("Walking ARCIRCLE World on Circle's Arc ♾");
  shotUrl = URL.createObjectURL(blob); $("wp-shot-img").src = shotUrl; $("wp-shot-dl").href = shotUrl;
  $("wp-shot-x-post").href = "https://x.com/intent/tweet?text=" + encodeURIComponent(msg) + "&url=" + encodeURIComponent("https://www.arcircle.app/play");
  const file = new File([blob], "arcircle-world.png", { type: "image/png" });
  $("wp-shot-share").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $("wp-shot-share").onclick = () => navigator.share({ files: [file], text: msg, url: "https://www.arcircle.app/play" }).catch(() => {});
  $("wp-shot-frame").hidden = !!text || !shotSrc;
  $("wp-shot-h").textContent = text ? T("Your card") : T("Your photo");
  $("wp-shot").hidden = false;
}
$("wp-shot-frame").addEventListener("click", async () => {
  if (!shotSrc) return; shotFrame = !shotFrame; $("wp-shot-frame").setAttribute("aria-pressed", String(shotFrame));
  if (shotFrame && !shotFramed) shotFramed = await SOC.frameShot(shotSrc, shotOpt).catch(() => shotSrc);
  if (!shotFrame && !shotRaw) shotRaw = await SOC.frameShot(shotSrc, { ...shotOpt, frame: false }).catch(() => shotSrc);
  showShot(shotFrame ? shotFramed : shotRaw);
});
$("wp-shot-x").addEventListener("click", () => { $("wp-shot").hidden = true; shotRaw = shotFramed = shotSrc = null; });

// ---------------- what's new: once after an update, a card with a way to try each new thing ----------------
const NEWV = "b398";
function maybeNew() {
  try { if (localStorage.getItem("arc.world.newv") === NEWV) return; } catch { return; }
  if (!P.char || !P.guideSeen || new URLSearchParams(location.search).has("nointro")) return;
  autoShow("new", 20, () => openNew());
}
function openNew() {
  // the newest three first; everything older folds under "Earlier updates" (a long list was a wall of text on phones)
  const top = [
    ["gv", TW("The Game Village"), TW("A new village west of the plaza for mini-games. AC Defense is the first tower: walk in and defend the Core.")],
    ["pets", TW("Pets"), TW("Hatch companions from eggs, 27 to collect. Each one follows you and helps in its own way.")],
    ["chat", TW("Friends and chat"), TW("Talk with players near you, send 1:1 messages and add friends.")],
  ];
  const items = [
    ["hud", T("A new look on screen"), T("Your portrait and level up top, Shop, Map and Menu tiles, a minimap with north and zoom, and a dock for Character, Bag, Craft and Build.")],
    ["village", T("Your island is a village"), T("Decorate it to raise its score and level. Its village centre grows with it, and each level blesses you with more XP and max HP.")],
    ["contest", T("The weekly village contest"), T("Enter your village each week; the best ones win ARCL (50,000 the first week).")],
    ["buttons", T("Character, Log and Village buttons"), T("One tap from the top bar. Bought bricks and styles now ask if you'd like to build with them right away.")],
    ["card", T("Player cards"), T("A player's card shows the gear they wear and every title they've earned. Yours: Character → My card.")],
    ["inspect", T("Every piece in 3D"), T("Armour, rings and necklaces turn in 3D on their card in the bag, like weapons.")],
    ["crew", T("Crews"), T("Found a crew or join one with its code: a tag before your name and a weekly table. The menu → Crew.")],
    ["master", T("The Forge grows"), T("The Legendary Arc set from level 20, and a Masterwork bench that makes gear at your level, up to +10.")],
    ["lock", T("Lock-on and sharper fights"), T("Tab or the target button locks on; crescent slashes, afterimages when you dodge, elites with an element.")],
    ["bag", T("Storage and gear sets"), T("48 places of storage, two gear sets to swap in one tap, and a bigger bag for $ARCIRCLE.")],
    ["live", T("The town, live"), T("$ARCIRCLE's price, burns and new launches turn round the fountain; fireworks for every launch.")],
    ["sky", T("Weather and seasons"), T("Lightning, rainbows, morning mist, auroras, autumn leaves, and Halloween from 17 October.")],
    ["ko", T("Knockouts"), T("The first each day is free; after that a revive for $ARCIRCLE or a 24-hour rest.")],
  ];
  const el = document.createElement("div"); el.className = "wp-new"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-new-card"><small>${esc(W("Update"))}</small><h2>${esc(T("What's new in ARCIRCLE World"))}</h2>${(() => { const li = ([k, t, l]) => `<li><button type="button" data-new="${k}"><b>${esc(t)}</b><span>${esc(l)}</span><i aria-hidden="true">›</i></button></li>`; return `<ul>${top.map(li).join("")}</ul><details class="wp-new-more"><summary>${esc(TW("Earlier updates"))}</summary><ul>${items.map(li).join("")}</ul></details>`; })()}<button type="button" class="wp-cta" data-new="close">${esc(T("Let's play"))}</button></div>`;
  document.body.appendChild(el); frozen = true; keys.clear(); paintPrompt();
  const done = () => { el.remove(); frozen = false; try { localStorage.setItem("arc.world.newv", NEWV); } catch { /* private */ } };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-new]"); if (!b && e.target !== el) return; done(); const k = b ? b.dataset.new : "close";
    if (k === "gv") { goGameVillage(); return; } if (k === "chat") { if (chatUI) chatUI.show(); return; }
    if (k === "raid") { const z = SOC.RAID, a = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(a) * (z.r + 3), 0, z.z + Math.cos(a) * (z.r + 3)), userData: { radius: 0.5 } }); }
    else if (k === "season" || k === "pets" || k === "quiz" || k === "codex") { quests.setTab(k === "quiz" ? "codex" : k); rpg.show("log"); }
    else if (k === "grounds") openMap();
    else if (k === "bench") { if (life) life.showSheet("temper"); }
    else if (k === "records") { quests.setTab("rank"); quests.setRank("fish"); rpg.show("log"); }
    else if (k === "charge" || k === "jet" || k === "party") openGuide();
    else if (k === "together") openWheel();
    else if (k === "bots") openMake();
    else if (k === "pad") openGuide();
    else if (k === "fuse") { rpg.forgeTab("fuse"); rpg.show("forge"); }
    else if (k === "crew") crewUI.show();
    else if (k === "card") { const s0 = sess(); if (s0) openProfile(String(s0.wallet).toLowerCase()); else rpg.show("inv"); }
    else if (k === "inspect") rpg.show("inv");
    else if (k === "master") { rpg.forgeTab("master"); rpg.show("forge"); }
    else if (k === "lock") openGuide();
    else if (k === "bag") rpg.show("inv");
    else if (k === "isles") island.openIsles();
    else if (k === "hud") { if (rpg) rpg.show("inv"); }
    else if (k === "village") village.show();
    else if (k === "contest") village.show("contest");
    else if (k === "buttons") rpg.show("log");
  });
}
// ---------------- closing things ----------------
// the ARCIRCLE logo (b405, a player's idea): a small menu — your island, a player's island (a random one, or the
// list), or the Platform World (where the logo used to go straight away)
const brandA = document.querySelector(".wp-brand"), brandM = document.createElement("div");
brandM.className = "wp-brand-menu"; brandM.id = "wp-brand-menu"; brandM.hidden = true; brandM.setAttribute("role", "menu"); brandM.setAttribute("data-no-i18n", "");
function paintBrandMenu() {
  const ICON = {
    home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
    dice: '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.4" fill="currentColor" stroke="none"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none"/>',
    globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.6 2.4 2.6 13.6 0 16M12 4c-2.6 2.4-2.6 13.6 0 16"/>',
  };
  const it = (k, icon, t, sub) => `<button type="button" role="menuitem" data-bm="${k}"><span class="wp-bm-i ${icon}" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON[icon]}</svg></span><span class="wp-bm-t"><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`;
  brandM.innerHTML = it("mine", "home", T("My island"), T("Build and decorate your own")) + it("random", "dice", T("Visit a random island"), T("A player's island you haven't seen")) + it("list", "list", T("Browse islands"), T("Popular, this week, friends")) + it("platform", "globe", T("Platform World"), T("Leave the game for the platform"));
}
if (brandA) {
  document.body.appendChild(brandM);
  // under the logo, in the screen's own coordinates (the HUD may be zoomed on a phone; the menu carries the same zoom)
  const placeBrandMenu = () => { const r = brandA.getBoundingClientRect(), z = parseFloat(getComputedStyle(brandM).zoom) || 1; brandM.style.left = Math.max(8, r.left) / z + "px"; brandM.style.top = (r.bottom + 8) / z + "px"; };
  addEventListener("resize", () => { if (!brandM.hidden) placeBrandMenu(); });
  brandA.setAttribute("aria-haspopup", "menu"); brandA.setAttribute("aria-expanded", "false");
  brandA.addEventListener("click", (e) => { e.preventDefault(); const open = brandM.hidden; if (open) paintBrandMenu(); brandM.hidden = !open; if (open) placeBrandMenu(); brandA.setAttribute("aria-expanded", String(open)); if (open) { const f = brandM.querySelector("button"); if (f) f.focus({ preventScroll: true }); } });
  brandM.addEventListener("click", (e) => {
    const b = e.target.closest("[data-bm]"); if (!b) return; brandM.hidden = true; brandA.setAttribute("aria-expanded", "false");
    const k = b.dataset.bm;
    if (k === "mine") goIsland({}); else if (k === "random") island.tour(); else if (k === "list") island.openIsles(); else if (k === "platform") (window.__arcFrame ? window.top : window).location.href = brandA.getAttribute("href") || "/?skip";
  });
  document.addEventListener("pointerdown", (e) => { if (!brandM.hidden && !brandM.contains(e.target) && !brandA.contains(e.target)) { brandM.hidden = true; brandA.setAttribute("aria-expanded", "false"); } });
  // role=menu: arrows (and Home/End) move between its items, wrapping round
  brandM.addEventListener("keydown", (e) => { const d = { ArrowDown: 1, ArrowUp: -1, Home: -2, End: 2 }[e.key]; if (!d) return; const bs = [...brandM.querySelectorAll("[data-bm]")]; if (!bs.length) return; e.preventDefault(); e.stopPropagation(); const i = bs.indexOf(document.activeElement); bs[d === -2 ? 0 : d === 2 ? bs.length - 1 : i < 0 ? 0 : (i + d + bs.length) % bs.length].focus({ preventScroll: true }); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !brandM.hidden) { brandM.hidden = true; brandA.setAttribute("aria-expanded", "false"); brandA.focus(); } });
}
function closeAll() { try { if (agentDim && agentDim.shown()) agentDim.close(); } catch { /* fine */ } try { if (partnerUi) partnerUi.close(); } catch { /* fine */ } try { if (!brandM.hidden) { brandM.hidden = true; brandA.setAttribute("aria-expanded", "false"); } } catch { /* fine */ } try { village.hide(); crewUI.hide(); chatUI && chatUI.hide(); } catch { /* not built yet */ } closeHub(); closeSheet(); closeMap(); endFight(); closeSet(); closeGuide(); island.closeSheets(); arclShop.close(); try { if (land) land.close(); } catch { /* not built yet */ } try { help.close(); closeLeave(); rpg && rpg.hide(); } catch { /* not built yet */ } $("wp-shot").hidden = true; }
// ---------------- the Help Center (world-support.js): ARCIA first, then a report on the public board ----------------
const help = HELP.createSupport({
  T, lang: LANG, esc, toast, where: mode === "island" ? "island" : "game",
  provider: async () => { if (AC && (!AC.live || !AC.live())) await AC.connect(); return AC ? AC.provider() : window.ethereum; }, address: () => addr(),
  capture: () => st.snap(), freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  // ARCIA's "What should I do next?" (api/arcia.mjs pageContext): where the player is, in a few short facts
  gameState: () => {
    const shown = QUESTS.filter((q) => !q.gate || q.gate() || P.quests.includes(q.id)), open = shown.filter((q) => !P.quests.includes(q.id));
    const r = rpg ? rpg.data() : {};
    return { lv: level(), signedIn: !!sess(), quests: open.slice(0, 3).map((q) => q.t), questsDone: shown.length - open.length, questsAll: shown.length,
      potions: r.hp || 0, welcome: welcomeV ? { n: welcomeV.n, ready: !!welcomeV.ready } : null, mineRestMin: mineRest > Date.now() ? Math.ceil((mineRest - Date.now()) / 60e3) : 0, starterBoost: xpBoostUntil > Date.now() };
  },
});
function openHelp(t) { closeAll(); help.open(t); }
// ---------------- fighting (world-combat.js): street scammers, the attack, skills learned by level, street items ----------------
// floating numbers: a hit's damage rises from where it landed; quick hits in the same spot add up into one number
// that bumps as it grows (a flurry reads as one total, not a pile of digits)
const floats = [];
// an animation started again without forcing the page to lay itself out (b413: the old remove / offsetWidth / add did,
// on every merged hit, every tap and every crit): the class comes back on the next frame
const replay = (el, cls) => { if (!el) return; el.classList.remove(cls); requestAnimationFrame(() => el.classList.add(cls)); };
// (the number nodes are kept for reuse, b420: a fast fight made and dropped a dozen a second; put back in the page, one
// plays its animation again from the start)
const fltPool = [], fltDone = (el) => { el.remove(); if (fltPool.length < 24) fltPool.push(el); };
const flt = (text, pos, color, big, weight = 0) => {
  const v = pos.clone(); planet.localToWorld(v); v.project(st.camera); if (v.z > 1) return;
  const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, now = performance.now(), num = /^!?\d+$/.test(String(text)) ? Number(String(text).replace("!", "")) : null;
  for (let i = floats.length - 1; i >= 0; i--) if (!floats[i].el.isConnected || now - floats[i].t > 900) floats.splice(i, 1);
  if (num != null) { const f = floats.find((o) => now - o.t < 420 && Math.hypot(o.x - x, o.y - y) < 70 && o.color === color);
    if (f) { f.n += num; f.t = now; f.el.textContent = (big || f.big ? "!" : "") + f.n; if (big && !f.big) { f.big = true; f.el.classList.add("crit"); } replay(f.el, "bump"); clearTimeout(f.k); f.k = setTimeout(() => fltDone(f.el), 950); return; } }
  const el = fltPool.pop() || document.createElement("div"); el.className = "wp-float-n" + (big ? " crit" : ""); el.textContent = text; el.style.color = color || "#fff"; el.style.removeProperty("--fs");
  if (num != null) { const f = { el, n: num, t: now, x, y, color, big: !!big }; floats.push(f); f.k = setTimeout(() => fltDone(el), 950); }
  el.style.translate = x.toFixed(1) + "px " + y.toFixed(1) + "px"; // the translate property: no layout, and it adds to the keyframed transform
  if (weight > 0) el.style.setProperty("--fs", (1 + Math.min(1, weight * 3) * 0.75).toFixed(2)); // a bigger share of the scammer's HP, a bigger number
  document.body.appendChild(el); if (num == null) setTimeout(() => fltDone(el), 950);
};
rpg = RPG.createRpg({
  hub: (k) => hubAct(k), ver: VER, reduce: () => reduce,
  THREE, T: TW, lang: LANG, esc, toast, P, save: () => save(), level, post, sess, Snd, reduce, scene: () => st.scene,
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); }, avatar: () => avatar, openProfile: (w) => openProfile(w),
  extraStats: () => { const t = quests ? quests.titleBonus() : null, h = bless().hp, pm = pet ? pet.mods() : null, cx = cxBonus; if (!h && !(pm && (pm.hp || pm.spd)) && !cx) return t; const o = { ...(t || {}) }; if (h || (pm && pm.hp)) o.hpPct = h + (pm ? pm.hp : 0); if (pm && pm.spd) o.spd = (o.spd || 0) + pm.spd;
    if (cx) { for (const k of ["crit", "spd"]) if (cx[k]) o[k] = (o[k] || 0) + cx[k]; for (const k of ["atkPct", "defPct", "hpPct"]) if (cx[k]) o[k] = (o[k] || 0) + cx[k]; } return o; }, // + a Swift pet's speed, a Sturdy pet's HP and the item codex's full columns (cxBonus)
  dropLuck: () => petLuck,
  titleLine: () => { const b = quests && quests.titleBonus(), t = quests && quests.title(); return t ? `<p class="wr-title-b">${esc(W("Title"))}: <b>${esc(t)}</b>${b ? ` <small>${esc(RPG.bonusLine(b))}</small>` : ""}</p>` : ""; },
  // "Go hunting" (an empty bag): to the gate of the nearest hunting ground that fits your level, as the map's list does
  goHunt: () => { const lv = level(), me0 = here(), ok = ZN.ZONES.filter((z) => lv >= z.lv[0] && lv <= z.lv[1] + 2), zs = ok.length ? ok : ZN.ZONES.filter((z) => lv >= z.lv[0]).slice(-1), z = zs.sort((a, b) => Math.hypot(a.x - me0.x, a.z - me0.z) - Math.hypot(b.x - me0.x, b.z - me0.z))[0] || ZN.ZONES[0], an = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(an) * (z.r + 3), 0, z.z + Math.cos(an) * (z.r + 3)), userData: { radius: 0.5 } }); },
  buyBag: (onStatus) => arclShop.pay("bagplus", "", onStatus),
  buyRekind: (onStatus) => arclShop.pay("rekind", "", onStatus), own: () => arclShop.own(),
  repairPay: (id, onStatus) => arclShop.pay("repair", id, onStatus), repairFree: (id) => arclShop.repairFree(id), repairLeft: () => arclShop.repairLeft(), atBase: () => mode === "island" && !!island && !island.readOnly(),
  openCraft: (t, id) => { if (life) life.showSheet(t, id); }, onStats: () => { if (combat) combat.onGear(); }, onPots: () => { if (combat) combat.potsCheck(); }, onView: (v) => tutorialStep(v === "log" ? 5 : v === "inv" ? 4 : -1), onEnhance: (n) => quests && quests.on.enhance(n), recall: () => recallHome(), gearModel: (slot, tier, color, glow) => (decor ? decor.gear(slot, tier, color, glow) : null), openWardrobe: () => { rpg.hide(); wardrobe.show(); }, isArc: () => /^arc-/.test(P.char || "arc-arc"), arclFly: (n, from) => arclShop.fly && arclShop.fly(n, from), arclRefresh: () => arclShop.refresh(), arclApply: (j) => arclShop.apply(j), arclDelta: (n, d) => arclShop.delta(n, d), arclDay: () => { const a = arclShop.arcl(); return a ? { today: a.today || 0, cap: a.cap || 30000, sold: a.sold || 0, sellCap: a.sellCap || 1500 } : null; }, arclBal: () => (arclShop.arcl() || {}).bal || 0,
});
rpg.dress();
// the GPU particles (world-particles.js): sparks, streaks, glow and smoke for the fights, in one or two draw calls
const parts = PART.createParticles({ THREE, parent: planet, low: lowGfx || st.quality.coarse });
// the platform, live in the town (world-live.js): the LED band round the fountain, and fireworks for a new launch
const live = LIVE.createLive({ THREE, planet, parts, reduce });
// crews (world-crew.js): the window from the menu, and your crew's tag before your name
const crewUI = CREW.createCrew({ isGM: (w) => VILL.isGM(w), T, esc, toast, post, sess, openProfile: (w) => openProfile(w), onTag: (t) => { if ((P.crewTag || "") !== (t || "")) { P.crewTag = t || ""; setNameTag(); } }, freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); } });
setTimeout(() => { if (sess()) crewUI.load(); }, 4000);
// footprints in snow and sand, and autumn leaves round you in town (world-tracks.js)
const tracks = TRK.createTracks({ THREE, planet, reduce });
st.on((dt) => { if (mode !== "hub") return; here(tmp3t); tracks.tick(dt, tmp3t.x, tmp3t.z, !(combat && combat.zone())); });
st.on((dt) => { if (mode === "hub") live.tick(dt); });
st.on((dt) => parts.tick(dt));
combat = FIGHT.createCombat({ alt: (a) => (jurOn && jurGame ? jurGame.act(a) : false), koWhy: () => (jurOn ? "dino" : ""), koBy: () => { try { return jurOn && jurGame && jurGame.koBy ? jurGame.koBy() : ""; } catch { return ""; } }, vfx, parts, wave: (p, power = 1) => { if (!fxPost || !fxPost.shock || reduce) return; const at = p.clone(); fxPost.shock((out) => out.copy(at).add(planet.position).setY(0.6), { power }); },
  THREE, K, planet, st, T, lang: LANG, esc, toast, Snd, reduce, coarse,
  kit: () => kit, here: (v) => here(v), facing: () => facing, faceTo: (a) => { facing = angLerp(facing, a, 0.5); }, afterimage: () => afterimage(), critFlash: () => critFlash(), avatar: () => avatar, level, hopY: () => hop, rpg, xp: () => P.xp, xpProg: () => RPG.xpProgress(P.xp),
  blocked: (v) => blockedAt(v),
  moveDir: (out) => { const { x, y, m } = inputs(); if (m < 0.1) return false; const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw); out.set(rx * x + fx * y, 0, rz * x + fz * y).normalize(); return true; },
  dash: (d, dist) => { knockV.copy(d).multiplyScalar(dist * 6); facing = Math.atan2(d.x, d.z); if (avatar && avatar.kk && grounded) avatar.play("dodge", { once: true, speed: 1.4, fade: 0.05 }); },
  onZone: (z) => { nightK = -1; dayNight(); if (quests) quests.on.zone(z); if (z) arciaOn("zone", z); },
  onKill: (k) => { fun("fight"); if (quests) quests.on.kill(k); arciaOn("kill", k); tutorialStep(3); if (k.rank === "boss" && k.zone && rpg) { const d = rpg.data(); d.x = d.x || {}; d.x.bk = d.x.bk || {}; d.x.bk[k.zone] = Math.min(9999, (d.x.bk[k.zone] || 0) + 1); } }, /* the boss trophies on My Island */ onCast: () => quests && quests.on.skill(), onFetch: () => { if (pet && pet.id() === "cat") pet.emote(); }, petPull: () => (pet && pet.visible() ? pet.pull() : 0),
  xpBoost: (zid) => RPG.xpBoost(zid) * (partyNear() ? 1.15 : together() ? 1.1 : 1), inRaid: () => !!(raid && raid.inside()), noStreet: () => landNow === "rq", raidHit: (n) => raid && raid.hit(n),
  onRaidDown: () => { if (raid) raid.load(); },
  onLoot: (it) => { if (quests) quests.on.loot(it); arciaOn("loot", it); if (it.r >= 3) shareDrop(it); if (it.r >= 2) lootCard(it); },
  legend: () => { replay(document.body, "wc-legend"); setTimeout(() => document.body.classList.remove("wc-legend"), 1600); },
  inHub: () => mode === "hub" && !introOn, active: () => mode === "hub" && (!frozen || jurOn) && !flying && !introOn && !photo,
  gain: (n, why) => gain(n, why), claim: (kind, extra, from) => arclClaimRepeat(kind, extra, from),
  knock: (d, p) => { knockV.copy(d).multiplyScalar(p); vy = Math.max(vy, 4); grounded = false; hitFrom.copy(d); hitAt = performance.now(); hitPow = p; },
  hurt: () => { Snd.hurt(); shake = Math.max(shake, 0.25); const h = document.createElement("div"); h.className = "wp-hurt"; document.body.appendChild(h); setTimeout(() => h.remove(), 520); const fresh = performance.now() - hitAt < 200; if (fresh) { kickCam(hitFrom, 0.14); if (hitPow >= 11) hitstop(50); } /* the camera jolts along the blow; a heavy one (a boss, a charge) stops the world a beat */ if (avatar && avatar.hurt) { /* rock away from the blow: forward if it came from behind, sideways from the side */ const f = facing; avatar.hurt(fresh ? hitFrom.x * Math.sin(f) + hitFrom.z * Math.cos(f) : -1, fresh ? hitFrom.x * Math.cos(f) - hitFrom.z * Math.sin(f) : 0); } if (avatar && !avatar.arc && !avatar.bot && !boarding) avatar.play(avatar.kk ? "hit" : "emote-no", { once: true }); },
  screenOf: (p) => { const v = p.clone(); planet.localToWorld(v); v.project(st.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; },
  // a boss arrives: the camera turns to it for a moment and its name card comes up
  bossIntro: (pos, name, zone, lv, line) => {
    const dx = pos.x - (-planet.position.x), dz = pos.z - (-planet.position.z), want = Math.atan2(-dx, -dz), y0 = camYaw, t0 = performance.now();
    if (!reduce && !frozen) { const off = st.on(() => { const k = Math.min(1, (performance.now() - t0) / 700); camYaw = angLerp(y0, want, 1 - Math.pow(1 - k, 3)); if (k >= 1) off(); }); }
    const c = document.createElement("div"); c.className = "wc-bosscard"; c.setAttribute("role", "status"); c.setAttribute("data-no-i18n", "");
    c.innerHTML = `<small>${esc(T("Boss · Lv {n}", { n: lv }))}</small><b>${esc(name)}</b>${line ? `<i>${esc(T(line))}</i>` : ""}<span>${esc(T("appeared in {z}!", { z: zone }))}</span>`;
    // a cut-in: black bars close in from the top and bottom while a band crosses the screen with the name
    const bars = document.createElement("div"); bars.className = "wc-cutin"; bars.setAttribute("aria-hidden", "true"); bars.innerHTML = `<i></i><i></i><div class="wc-cutband"><b>${esc(name)}</b></div>`;
    if (!reduce) document.body.appendChild(bars);
    document.body.appendChild(c); setTimeout(() => c.remove(), 3000); setTimeout(() => bars.remove(), 2600);
  },
  onBossRun: (zone, ms) => { const s = sess(); if (s && ms >= 8000) post({ action: "world-bossrun", ...s, zone, ms }).catch(() => {}); },
  onBoss: () => music.victory(),
  buzz: (ms) => buzz(ms), hint: (id) => hint(id, { charge: tapOr(T("Hold J to charge a stronger blow, let go when the ring is full"), T("Hold the attack button to charge a stronger blow")), dodge: tapOr(T("Red on the ground means a strike is coming: step out, or dodge with K"), T("Red on the ground means a strike is coming: step out, or tap dodge")), pond: T("This ground has a pond with a fish of its own") }[id] || id),
  onSwing: (p, f, heavy, hammer) => (life ? life.swingAt(p, f, heavy, hammer) : false), float: flt, hitstop: (ms) => hitstop(ms), kickCam: (d, k) => kickCam(d, k), shake: (n) => { if (!reduce) shake = Math.max(shake, n * (liteFx || coarse ? 0.7 : 1)); }, lite: () => liteFx, // a phone's small screen shakes less halloween: HW.halloweenOn(), slowmo: (ms) => slowmo(ms), punch: () => { if (!reduce) punch = 1; },
  pay: (id, onStatus) => arclShop.pay(id, "", onStatus), ko: (what) => arclShop.ko(what), signedIn: () => !!sess(),
  // knocked out: lie down and wait; back up on the spot (a revive) or on the plaza
  down: (on, where) => {
    if (jurOn && jurGame) { keys.clear(); jurGame.down(on, where); try { if (on) Snd.ko && Snd.ko(); else Snd.up && Snd.up(); } catch { /* no sound */ } return; } // knocked out in Jurassic World: it lies down there, and gets up there
    if (on && boarding) setBoard(false);
    frozen = on; keys.clear(); paintPrompt();
    if (on) { if (avatar) avatar.play("die", { once: true }); try { Snd.ko && Snd.ko(); } catch { /* no sound */ } return; }
    setTimeout(() => vfx.rise(here()), 60); try { Snd.up && Snd.up(); } catch { /* no sound */ }
    if (where === "plaza") { const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); } planet.position.copy(HOME); hop = 0; vy = 0; grounded = true; facing = Math.PI; camYaw = 0; }
    if (avatar) avatar.play("idle");
  },
});
// b413: scammers and effects readied ahead of the first fight (world-combat.js warm), two models at a time as their
// packs arrive, out of sight, and never while something is fighting you
setTimeout(function warmLoop() { try { if (combat && mode === "hub" && !frozen && !combat.dangerNear(40)) combat.warm(st, 2).catch(() => {}); } catch { /* still loading */ } setTimeout(warmLoop, 900); }, 4000);
// the Adventure log (daily hunts, achievements and titles, the codex, top hunters) and the companion drone
// b-sv7: SURVIVORS ARENA's achievements, worn as titles in town (the server's meta for a wallet, this phone's for a guest; read again after a run)
let svAch = null, svAchP = null;
const svAchLoad = () => { if (svAchP) return svAchP; const s = sess();
  svAchP = (s ? fetch("/api/social?world=surv&wallet=" + s.wallet, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.meta && j.meta.ach) || []) : Promise.resolve().then(() => { try { return Object.keys((JSON.parse(localStorage.getItem("arc.surv.meta") || "null") || {}).ach || {}); } catch { return []; } }))
    .catch(() => []).then((a) => { svAch = Array.isArray(a) ? a : []; svAchP = null; if (rpg.isOpen()) rpg.repaint(); }); return svAchP; };
quests = QST.createQuests({ isGM: (w) => VILL.isGM(w), cxTitles: () => cxTitles, openItems: () => { closeAll(); openCodex(); }, svAch: () => svAch, svAchLoad, starterDone: () => { try { const st0 = startSteps(), d = st0.filter((x) => x.done).length; return d >= st0.length ? 5 : Math.min(4, d); } catch { return 0; } },
  T: TW, lang: LANG, esc, toast, P, Snd, rpg, save: () => save(), level, gain: (n, why) => gain(n, why), fishList: LIFE.FISH,
  // Rankings → Players: portraits, who's around now, a player's card
  charThumb: (id) => thumbCache[id] || "", needThumbs: (ids) => renderThumbsFor(ids).then(() => rpg.isOpen() && rpg.repaint()),
  online: () => (ghosts && ghosts.named ? ghosts.named() : []), openProfile: (w) => openProfile(w),
  gmTools: () => { const s0 = sess(); return !!(s0 && VILL.isGM(String(s0.wallet).toLowerCase())); }, gmSend: (w, n) => gmReward.send(w, n), gmList: (w, n) => gmReward.list(w, n),
  dailyDone: () => arclShop.dailyDone(), openDaily: () => { rpg.hide(); arclShop.openDaily(); }, signedIn: () => !!sess(),
  repaint: () => rpg.repaint(), onTitle: () => setNameTag(),
  onAch: () => { setNameTag(); if (pet) pet.sync(); paintBagDot(); },
  onPet: () => { if (pet) pet.sync(); },
  petActive: () => (pet ? pet.active() : ""), petTitle: (id) => (pet ? pet.title(id) : id), petLv: (id) => (pet ? pet.level(id) : 1),
  petHTML: () => (pet ? pet.html() : ""), petClick: (b) => (pet ? pet.click(b) : false),
  shareCard: (o) => shareCard(o),
  bountyReady: () => { const p = partyUI(), f = p && p.full && p.full(); if (!f || (f.next && f.next <= Date.now())) return 0; return (f.bounties || []).filter((b) => b.done && !b.claimed).length + (f.party && f.party.done && !f.party.claimed && f.party.mine >= f.party.min ? 1 : 0); }, // the Log dot counts ready bounties too
  bountyHTML: () => (partyUI() ? partyUI().bountyHTML() : ""), bountyLoad: () => partyUI() && partyUI().loadFull(), bountyClick: (b) => !!partyUI() && partyUI().click(b),
});
rpg.setLog(quests);
// the pets (world-pet.js): eggs from the server, one animal walking with you; the three older companions are drawn by QST.createPet
pet = PET.createPets({ THREE, K, planet, shadow: (r, k) => LOOK.contactShadow(r, k), here: (v) => here(v), facing: () => facing, combat: () => combat, reduce, coarse: st.quality.coarse, low: lowGfx, ver: VER, legacy: QST.createPet({ THREE, K, planet, here: (v) => here(v), facing: () => facing, combat, reduce }), T, esc, rpg: () => rpg, ach: () => { const x = rpg.data().x; return (x && x.ach) || []; }, save: () => save(), toast, Snd,
  buy: (onStatus) => arclShop.pay("petegg", "", onStatus), repaint: () => rpg.repaint(),
  onMods: (m, stats) => { petXpPct = m.xp; petLuck = m.luck; if (stats && rpg) rpg.refresh(); } });
pet.sync(); if (ownNow) pet.mirror(ownNow); setNameTag();
// the weekly raid boss and the wanderers (world-social.js)
raid = SOC.createRaid({
  THREE, K, planet, T, esc, toast, Snd, here: (v) => here(v), level, sess, post, combat, rpg, quests: () => quests, gain: (n, why) => gain(n, why),
  inHub: () => mode === "hub" && !introOn, wallet: () => { const s = sess(); return s ? s.wallet : ""; },
  onArcl: (n) => { arclShop.refresh().then(() => toast(T("+{n} ARCL · {why}", { n, why: T("Weekly raid") }))); Snd.coin(); },
  feed: (h, c) => feed(h, c), shareCard: (o) => shareCard(o), name: () => P.name || "", shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, reduce, clip: (ms) => recordClip(ms),
});
// a short clip of the game's picture (the raid's fall): recorded from the canvas, then offered to save or share
let clipOn = false;
function recordClip(ms = 6000) {
  try {
    if (clipOn || !window.MediaRecorder || !cv.captureStream) return false;
    const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t)); if (!type) return false;
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: type, videoBitsPerSecond: 5e6 }), parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = () => { clipOn = false; if (parts.length) offerClip(new Blob(parts, { type: type.split(";")[0] })); };
    clipOn = true; rec.start(500); setTimeout(() => { try { rec.stop(); } catch { clipOn = false; } }, ms);
    return true;
  } catch { clipOn = false; return false; }
}
function offerClip(blob) {
  const ext = /mp4/.test(blob.type) ? "mp4" : "webm", url = URL.createObjectURL(blob), name = `arcircle-raid-${Date.now()}.${ext}`;
  document.querySelectorAll(".wp-clip").forEach((x) => x.remove());
  const c = document.createElement("div"); c.className = "wp-clip"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", T("Raid clip"));
  c.innerHTML = `<video src="${url}" muted autoplay loop playsinline></video><div><b>${esc(T("Your raid clip"))}</b><small>${esc(T("The last seconds of the fall"))}</small></div><a class="wp-btn" href="${url}" download="${name}">${esc(T("Save"))}</a>${navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] }) ? `<button type="button" class="wp-btn" data-cshare>${esc(T("Share"))}</button>` : ""}<button type="button" class="wp-btn wp-x" data-cx aria-label="${esc(T("Close"))}">×</button>`;
  c.addEventListener("click", async (e) => {
    if (e.target.closest("[data-cx]")) { c.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); return; }
    if (e.target.closest("[data-cshare]")) { try { await navigator.share({ files: [new File([blob], name, { type: blob.type })], text: T("{x} in ARCIRCLE World ♾", { x: T("The raid boss fell") }) }); } catch { /* cancelled */ } }
  });
  document.body.appendChild(c); setTimeout(() => { if (c.isConnected) c.remove(); }, 60000);
}
if (raid.gate) arches.push(raid.gate); // the arena's gate steps aside for the camera like the town's arches
ghosts = SOC.createGhosts({ THREE, K, planet, okAt: (x, z) => Math.hypot(x, z) <= 150 || !!LD.landAt(x, z), compile: (o) => (st.renderer.compileAsync ? st.renderer.compileAsync(o, st.camera, st.scene) : Promise.resolve()), T: (s, v) => (s === "Hi!" || s === "Friend" ? W(s) : T(s, v)), here: (v) => here(v), inHub: () => mode === "hub" && !introOn, myTag,
  shadow: (r, k) => LOOK.contactShadow(r, k), isPal: (x) => (P.pal && x.t === P.pal) || x.p === myTag, sayText: (i) => (SAY[i] ? (SAY[i].includes(" ") || SAY[i].length > 4 ? T(SAY[i]) : W(SAY[i])) : ""),
  onPal: (on) => { const c = $("wp-together"); if (c) c.hidden = !on; }, hides: (w) => !!(chatUI && chatUI.hides && chatUI.hides(lc(w))), // muted or blocked: no bubble over them
  // other players stand as their own characters (not the see-through capsules) once the model is in
  makeChar: (id) => (lowGfx ? Promise.resolve(null) : K.makeCharacter(heroOf(id), VER).catch(() => null)), farShadow: !coarse, lite: S.quality === "saver" || (coarse && lowGfx), tierHalo: (i) => (K.TIER_HALO ? K.TIER_HALO[i] : null) });
// ---------------- the inbox: gifts, new stamps, friends playing now ----------------
// stand next to someone in town (a friend from the inbox, a player's card): a short hop, facing them
function goNear(x, z) {
  if (mode !== "hub" || frozen) { toast(T("You can go there from the town")); return; }
  const a = Math.atan2(-x, -z) || 0, sx = x + Math.sin(a) * 1.8, sz = z + Math.cos(a) * 1.8;
  const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); }
  planet.position.set(-sx, 0, -sz); hop = 0; vy = 0; grounded = true; facing = Math.atan2(x - sx, z - sz); camYaw = facing - Math.PI;
  Snd.dash && Snd.dash();
}
const inbox = INBOX.createInbox({ refresh: () => refreshPurse(true), onDot: (n) => { inboxDot = n; paintMenuDot(); }, T: TW, esc, post, sess, toast, Snd, rpg: () => rpg, island, ghosts: () => ghosts, goIsland: (o) => goIsland(o), goNear,
  openProfile: (w) => openProfile(w), inHub: () => mode === "hub", bookNew: () => island.bookNew(), save: () => save(), onPots: () => combat && combat.potsCheck() });
// chat (world-chat.js): local lines in the area you stand in, friends and private messages
// the area: an island, a hunting ground, or the nearest district of the town
function chatArea() {
  if (mode === "island") return /^0x[0-9a-f]{40}$/.test(isleArea) ? { id: "i-" + isleArea, name: island.title() } : null;
  const zz = combat && combat.zone(); if (zz && /^[a-z0-9]{2,12}$/.test(zz.id)) return { id: "z-" + zz.id, name: T(zz.name || zz.id) };
  if (landNow) return { id: "h-" + landNow, name: landName(landNow) }; // b-lpv
  let bd = Infinity, best = null; K.DISTRICTS.forEach((d) => { if (d.id !== "dark") return; const v = K.spot(d.theta, d.phi).add(planet.position), dd = v.length(); if (dd < bd && dd < 30) { bd = dd; best = d; } });
  return best && /^[a-z0-9]{2,12}$/.test(best.id) ? { id: "h-" + best.id, name: best.name } : { id: "h-town", name: T("Town") };
}
chatUI = CHAT.createChat({ T, esc, toast, post, sess, Snd, area: chatArea, bubble: (txt) => sayBubble(txt.length > 34 ? txt.slice(0, 33) + "…" : txt, 7000),
  following: () => ((P.rpg && P.rpg.x && P.rpg.x.friends) || []).map((f) => ({ w: lc(f.w), n: f.n })), openProfile: (w) => openProfile(w),
  // a friend standing in town with you, and the hop next to them (the profile's Go there)
  near: (w) => !!(ghosts && mode === "hub" && ghosts.named().some((g) => g.wallet === w)), goTo: (w) => { const g = ghosts && ghosts.named().find((x) => x.wallet === w); if (g) goNear(g.x, g.z); },
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); }, onUnread: (n) => { chatDot = n; paintMenuDot(); },
  onSay: () => { if (Date.now() - sayPingAt > 15000) { sayPingAt = Date.now(); ping(); } }, onParty: () => { paintParty(); if (rpg && rpg.isOpen()) rpg.repaint(); if (quests) paintBagDot(); } });
// ---------------- set dressing from the free model packs (world-decor.js) ----------------
// b448: compile a list of objects while they're hidden (they're made visible only for the call: compileAsync collects them
// right away), so each can be shown once its shaders are ready
const compileHidden = (list) => { if (!st.renderer.compileAsync) return Promise.resolve(); const was = list.map((o) => o.visible); list.forEach((o) => { o.visible = true; }); let ps; try { ps = list.map((o) => st.renderer.compileAsync(o, st.camera, st.scene).catch(() => {})); } finally { list.forEach((o, i) => { o.visible = was[i]; }); } return Promise.race([Promise.all(ps), new Promise((r) => setTimeout(r, 4000))]); };
decor = DECOR.createDecor({ compile: compileHidden, THREE, K, planet, blocked: (v) => blockedAt(v), shops, zones: RPG.ZONES, ver: VER, low: lowGfx, lite: S.quality === "medium" || matchMedia("(pointer: coarse)").matches, reduce, here: (v) => here(v), onWeapons: () => rpg && rpg.dress(), avoid: () => [[MV.MINE_VILLAGE.x, MV.MINE_VILLAGE.z, MV.MINE_VILLAGE.r + 3], [PV.PARTNER_VILLAGE.x, PV.PARTNER_VILLAGE.z, PV.PARTNER_VILLAGE.r + 3], ...(race ? [[race.pad.position.x, race.pad.position.z, 3.2], ...race.points().map(([x, z]) => [x, z, 2.6])] : [])] });
st.on((dt) => decor.tick(dt));
st.on((dt) => { if (rpg && rpg.tickSwing) rpg.tickSwing(dt); });
// gathering, the workbench and fishing (world-life.js)
const life = LIFE.createLife({ THREE, planet, T: TW, esc, toast, Snd, onCatch: (f, cm) => { if (avatar && avatar.face) avatar.face("wow", 1.6); if (quests) quests.on.fish(); arciaOn("fish", f); const s = sess(); if (!s || !f) return; const wk = Math.floor((Date.now() - Date.UTC(1970, 0, 5)) / 6048e5); let b = {}; try { b = JSON.parse(localStorage.getItem("arc.world.fishwk") || "{}"); } catch { /* private */ } if (b.wk === wk && b.cm >= cm) return; try { localStorage.setItem("arc.world.fishwk", JSON.stringify({ wk, cm })); } catch { /* private */ } post({ action: "world-fish", ...s, fish: f.id, cm }).catch(() => {}); }, /* this week's biggest catch goes to the board */ buzz: (ms) => buzz(ms), hint: (id) => hint(id, id === "gather" ? tapOr(T("Press G to gather it: any attack works too"), T("Tap Gather to collect it: any attack works too")) : tapOr(T("Press G to cast, then again when the mark is in the green"), T("Tap Fish to cast, then Reel in when the mark is in the green"))), onStats: () => { if (combat) combat.onGear(); }, rpg: () => rpg, here: (v) => here(v), blocked: (v) => blockedAt(v), zones: RPG.ZONES, inHub: () => mode === "hub", save: () => save(), vfx, low: lowGfx, float: flt, hitstop: (ms) => hitstop(ms), kickCam: (d, k) => kickCam(d, k), shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, onPots: () => { if (combat) combat.potsCheck(); } });
// water (world-env.js): foam round the edge, caustics on the floor, the sky at a glance (the fountain and the far ponds)
const waterMats = [], reflHide = [parts.glowMesh, parts.smokeMesh], reflU = [];
if (!lowGfx) {
  const pools = []; fountain.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === "CircleGeometry" && o.material && o.material.transparent) { const m = ENV.waterMat({ r: o.geometry.parameters.radius, color: 0x38c8ff, deep: 0x0a5a8a, glow: 0.22, opacity: 0.86 }); o.material = m; waterMats.push(m); pools.push(o); } });
  for (const m of waterMats) { m.uniforms.uSunDir.value.copy(sunDir); m.uniforms.uSpark.value = reduce ? 0 : 1; }
  // on Ultra the big pool reflects the plaza (redrawn every other frame, without the grass and the particles)
  if (postLevel === "ultra" && !st.quality.coarse && pools.length) { const big = pools.reduce((a, b) => (a.geometry.parameters.radius > b.geometry.parameters.radius ? a : b));
    import("./vendor/three/addons/Reflector.js").then(({ Reflector }) => { const rm = ENV.reflectPool(Reflector, big, st.renderer, reflHide, () => frameNo); reflU.push(rm.material.uniforms); }).catch(() => {}); }
  planet.getObjectByName("life").children.forEach((g) => { if (!/^pond:/.test(g.name)) return; const w = g.children[0]; if (!w || !w.isMesh || !w.material.color) return;
    const hot = g.name === "pond:abyss", c = w.material.color.getHex();
    const m = ENV.waterMat({ r: w.geometry.parameters.radius, color: c, deep: new THREE.Color(c).multiplyScalar(0.4).getHex(), foam: hot ? 0xffd080 : 0xeaffff, glow: hot ? 0.9 : 0.12, opacity: 0.92 });
    m.polygonOffset = true; m.polygonOffsetFactor = -4; m.uniforms.uSunDir.value.copy(sunDir); m.uniforms.uSpark.value = reduce ? 0 : 1; w.material = m; waterMats.push(m); });
  st.on((dt) => { for (const m of waterMats) m.uniforms.uTime.value += dt; for (const u of reflU) u.uTime.value += dt; });
}
// the meadow (world-env.js): blades round you that sway and lie down where you walk (none on Low / Saver). Built once
// the town is up (the mask is painted from what stands on the ground) and repainted once more when the coin city is in
let grass = null, gmask = null;
function makeMeadow() {
  if (lowGfx || grass) return;
  gmask = farCull.all(() => ENV.grassMask({ planet, zones: RPG.ZONES, clear: [{ x: 0, z: 0, r: K.flatR(11) + 0.8 }, { x: GV.VILLAGE.x, z: GV.VILLAGE.z, r: GV.VILLAGE.arenaR + 2.2 } /* b447: the Game Village square (the blades grew through its tiles) */, { x: MV.MINE_VILLAGE.x, z: MV.MINE_VILLAGE.z, r: MV.MINE_VILLAGE.r + 1 } /* the Mining Village clearing */, { x: AGW.x, z: AGW.z, r: AGW.r + 2.5 } /* AGENT DIMENSION's Citadel */, { x: PV.PARTNER_VILLAGE.x, z: PV.PARTNER_VILLAGE.z, r: PV.PARTNER_VILLAGE.r + 1 } /* the Partner Village */], paths: WORN_PATHS }));
  const big = S.quality === "ultra" || S.quality === "high"; // 60,000 blades only when asked for (b411)
  grass = ENV.makeGrass({ count: big ? 60000 : st.quality.coarse ? 8000 : 32000, /* b447: phones 8,000 (Adreno 7xx fell to 30–40 fps once the blades were back) (the blades hadn't drawn on phones since 13 October, a shader that didn't link; the frame rates since were measured without them) */ size: big ? 50 : st.quality.coarse ? 36 : 44, mask: gmask, gshadow, mediump: !!st.quality.coarse }); // phones: the blade colour in half precision (b404)
  planet.add(grass.mesh); reflHide.push(grass.mesh);
  st.on((dt) => { const on = mode === "hub"; grass.mesh.visible = on; if (on) grass.tick(dt, -planet.position.x, -planet.position.z); });
  setTimeout(() => farCull.all(() => gmask.paint()), 20000);
  nightK = -1; dayNight();
}
st.on((dt) => life.tick(dt));
// ?decor=0 leaves it out (to compare frame rates, or on a device that struggles); automated browsers (software
// rendering, a frame a second) get it only with ?decor=1
const decorOn = /[?&]decor=1\b/.test(location.search) || (!navigator.webdriver && !/[?&]decor=0\b/.test(location.search));
if (decorOn) setTimeout(() => decor.start(), 1500);
// ---------------- the ARC Bot wardrobe (world-wardrobe.js) ----------------
const wardrobe = WARD.createWardrobe({ THREE, T: TW, esc, level, charId: () => P.char || "arc-arc", outfit: () => P.outfit || null, toast, Snd,
  save: (o) => { P.outfit = o; save(); setAvatar(P.char || "arc-arc"); delete thumbCache[P.char || "arc-arc"]; } });
// ---------------- the hoverboard race around the plaza (world-race.js) ----------------
race = RACE.createRace({ THREE, K, planet, T: TW, esc, here: (v) => here(v), blocked: (v) => blockedAt(v), boarding: () => boarding, setBoard: (on) => setBoard(on),
  inHub: () => mode === "hub" && !introOn && !flying, post, sess, toast, Snd, reduce, onTop: () => {} });
st.on((dt) => { race.update(); race.spin(dt); });
// ---------------- a player's card (Rankings → Players, or someone around you) ----------------
// the showcase on a player's card: the gear they have on (rarity colour, +level) and the titles they've earned, the
// one they wear lit gold; tap a piece or a title for its name
function showcase(fr, wornT) {
  if (!fr || !Array.isArray(fr.ach)) return "";
  const titled = QST.ACH.filter((a) => a.title), got = titled.filter((a) => fr.ach.includes(a.id)), list = [...got.map((a) => ({ id: a.id, t: T(a.title), line: T(a.line) })), ...(fr.st ? [{ id: "season", t: T("Season Star"), line: T("Season pass, last tier") }] : [])];
  const gear = (fr.gear || []).filter((it) => RPG.parseBase(it.b));
  const tile = (it) => { const R = RPG.RARITY[it.r] || RPG.RARITY[0]; return `<li style="--rc:${R.color}" title="${esc(rpg.itemName(it))} · ${esc(T(R.name))}">${rpg.thumb ? rpg.thumb(it) : ""}${it.p ? `<b>+${it.p}</b>` : ""}</li>`; };
  return `<div class="wp-prof-show">
    ${gear.length ? `<h3>${esc(T("Gear"))}</h3><ul class="wp-prof-gear">${gear.map(tile).join("")}</ul>` : ""}
    <h3>${esc(T("Titles"))} <small>${list.length} / ${titled.length + 1}</small></h3>
    ${list.length ? `<ul class="wp-prof-titles">${list.map((x) => `<li${x.id === wornT ? ' class="worn"' : ""} title="${esc(x.line)}">${esc(x.t)}</li>`).join("")}</ul>` : `<p class="wp-prof-none">${esc(T("No titles yet"))}</p>`}</div>`;
}
async function openProfile(w) {
  if (!/^0x[0-9a-f]{40}$/.test(String(w || ""))) return;
  document.querySelectorAll(".wp-prof").forEach((x) => x.remove());
  const dir = (quests.dir() || {}).list || [], row = dir.find((r) => r.w === w) || {}, el = document.createElement("div");
  el.className = "wp-prof"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  const paint = (fr) => {
    const name = row.name || (fr && fr.name) || w.slice(0, 6) + "…" + w.slice(-4), lv = row.lv || (fr && fr.lv) || 1, char = row.char || (fr && fr.char) || "", me = sess() && sess().wallet === w;
    const isFr = island.isFriend(w), ago = row.at ? Math.floor((Date.now() - row.at) / 60000) : null, wornT = (fr && fr.t) || row.t || "";
    el.innerHTML = `<div class="wp-prof-card"><button type="button" class="wp-btn wp-x" data-px aria-label="${esc(T("Close"))}">×</button>
      <div class="wp-prof-face">${thumbCache[char] ? `<img src="${thumbCache[char]}" alt="">` : ""}<b>${lv}</b></div>
      <h2>${VILL.isGM(w) ? '<b class="wv-gmtag">[GM]</b> ' : ""}${fr && fr.cr ? `<span class="wp-crew-tag sm">${esc(fr.cr)}</span>` : ""}${esc(name)}</h2>${quests.titleOf(wornT) ? `<p class="wp-prof-title">${esc(quests.titleOf(wornT))}</p>` : ""}
      <dl><div><dt>${esc(W("Level"))}</dt><dd>${lv}</dd></div><div><dt>${esc(T("Codex pages"))}</dt><dd>${row.cx || 0} / ${QST.CODEX.length + QST.CODEX_STORY.length}</dd></div><div><dt>${esc(T("Island"))}</dt><dd>${fr && fr.isle ? esc(T("{n} bricks", { n: fr.isle })) + " · ♥ " + (fr.likes || 0) : "—"}</dd></div>${fr && fr.village && fr.village.score ? `<div><dt>${esc(T("Village score"))}</dt><dd>${fr.village.score.toLocaleString("en-US")}</dd></div>` : ""}<div><dt>${esc(T("Last seen"))}</dt><dd>${ago == null ? "—" : ago < 15 ? esc(T("just now")) : ago < 60 ? esc(T("{n} min ago", { n: ago })) : ago < 1440 ? esc(T("{n} h ago", { n: Math.floor(ago / 60) })) : ago < 2880 ? esc(T("yesterday")) : esc(T("{n} days ago", { n: Math.floor(ago / 1440) }))}</dd></div></dl>
      ${showcase(fr, wornT)}
      <div class="wp-prof-acts">${fr && fr.isle ? `<button type="button" class="wp-cta" data-pvisit>${esc(T("Visit their island"))}</button>` : ""}${me ? "" : `<button type="button" class="wp-btn" data-pfriend aria-pressed="${isFr}">${esc(isFr ? W("Friend") : T("Add friend"))}</button>`}${me || !sess() ? "" : `<button type="button" class="wp-btn" data-pparty aria-pressed="${inParty(w)}" ${inParty(w) ? "disabled" : ""}>${esc(inParty(w) ? T("In your party") : T("Add to party"))}</button>`}${!me && mode === "hub" && ghosts && ghosts.named().some((g) => g.wallet === w) ? `<button type="button" class="wp-btn" data-pgo>${esc(T("Go there"))}</button>` : ""}</div>
      ${me || !sess() ? "" : `<div class="wp-prof-gift"><span>${esc(T("Send a gift"))}</span>${inbox.sendOptions().map((g) => `<button type="button" class="wp-btn" data-pgift="${g.kind}:${g.n}" ${g.can ? "" : "disabled"}>${esc(g.label)}</button>`).join("")}</div>`}</div>`;
    if (char && !thumbCache[char]) renderThumbsFor([char]).then(() => { if (el.isConnected) paint(fr); });
  };
  paint(null); document.body.appendChild(el); frozen = true; keys.clear();
  // Escape closes the card first (the Adventure log under it stays open)
  const onKey = (e) => { if (e.key === "Escape" && el.isConnected) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  const close = () => { el.remove(); removeEventListener("keydown", onKey, true); frozen = !!((rpg && rpg.isOpen()) || crewUI.isOpen() || village.isOpen()); };
  addEventListener("keydown", onKey, true);
  let fr = null; try { const r = await fetch("/api/social?world=friends&wallets=" + w); fr = r.ok ? ((await r.json()).friends || {})[w] || null : null; } catch { /* the card stays as it is */ } if (el.isConnected) paint(fr);
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-px]")) { close(); return; }
    if (e.target.closest("[data-pvisit]")) { close(); rpg.hide(); goIsland({ visit: w }); return; }
    if (e.target.closest("[data-pgo]")) { const g = ghosts && ghosts.named().find((x) => x.wallet === w); if (g) { close(); rpg.hide(); goNear(g.x, g.z); } return; }
    const gb = e.target.closest("[data-pgift]"); if (gb) { const [k, n] = gb.dataset.pgift.split(":"); gb.disabled = true; inbox.send(w, k, Number(n)).then(() => { if (el.isConnected) paint(fr); }); return; }
    if (e.target.closest("[data-pfriend]")) { island.toggleFriend(w, row.name || (fr && fr.name) || ""); paint(fr); }
    if (e.target.closest("[data-pparty]")) { const pu = partyUI(); if (pu) pu.invite(w).then(() => { if (el.isConnected) paint(fr); }); }
  });
}
// a card to share (an achievement): the photo sheet shows it with save / share / post
async function shareCard(o) {
  const blob = await SOC.drawCard({ ...o, name: P.name || W("Player"), lv: level() }); if (!blob) return;
  rpg.hide(); showShot(blob, o.title ? T("{x} in ARCIRCLE World ♾", { x: o.title }) : "");
}
function paintBagDot() { const b = $("wp-log-btn"); if (b) b.dataset.dot = quests.pending() ? String(quests.pending()) : ""; paintMenuDot(); } // rewards waiting: on the Log button, where they are
// the Menu tile's red dot: mail or rewards waiting (on a phone the bell and the Log button live in the menu)
function paintMenuDot() { const m = $("wp-more-btn"); if (m) m.dataset.dot = inboxDot || chatDot || (quests && quests.pending && quests.pending()) ? "1" : ""; }
setInterval(paintBagDot, 4000);
// a recall scroll: straight back to the plaza
function recallHome() {
  if (mode !== "hub" || flying || introOn) { toast(T("Recall scrolls work in the town")); return false; }
  if (!rpg.useRecall()) { toast(T("No recall scrolls — the Forge sells them")); return false; }
  if (boarding) setBoard(false);
  planet.position.copy(HOME); hop = 0; vy = 0; grounded = true; facing = Math.PI; camYaw = 0; knockV.set(0, 0, 0);
  Snd.dash && Snd.dash(); shake = Math.max(shake, 0.2); toast(T("Back on the plaza")); return true;
}
// Epic and Legendary finds go in everyone's feed (a line of text; the server rate-limits it)
function shareDrop(it) { const s = sess(); if (s) post({ action: "world-feed-drop", ...s, b: it.b, r: it.r }).catch(() => {}); }
let dropsSeen = Date.now() - 10 * 60e3;
async function refreshDrops() {
  if (mode !== "hub") return;
  try {
    const r = await fetch("/api/social?world=drops"); if (!r.ok) return;
    const list = ((await r.json()).drops || []).filter((d) => d.at > dropsSeen).sort((a, b) => a.at - b.at);
    for (const d of list.slice(-3)) { if (d.k === "royal") { feed(TW("{who} hit a ROYAL FLUSH at ARCIA POKER LOUNGE!", { who: `<b>${esc(d.name || d.w)}</b>` }), "#ffd23a"); continue; } const rr = RPG.RARITY[d.r] || RPG.RARITY[3]; feed(T("{who} found {x}", { who: `<b>${esc(d.name || d.w)}</b>`, x: `<b style="color:${rr.color}">${esc(RPG.itemName({ b: d.b, p: 0 }))}</b>` }), rr.color); }
    if (list.length) dropsSeen = list[list.length - 1].at;
  } catch { /* the feed waits */ }
}
every(60000, refreshDrops); setTimeout(refreshDrops, 8000);
// repeatable ARCL (street fights, coins): the server keeps the daily limit and the gap between claims
function arclClaimRepeat(kind, extra, from) { arclShop.claim(kind, extra, from); }
$("wp-help-btn").addEventListener("click", () => openHelp());
// the menu: everything in one place, a tap away (the ≡ button on every screen, or Esc with nothing open).
// Grouped by what you're doing; each tile names its key; a dot marks something waiting (rewards, mail).
const HUB = [
  // kept short: what has its own button elsewhere (Shop and Starter up top; Bag, Craft and Pets on the dock; photo and
  // emotes by the attack button; the Workbench in the bag; the Wardrobe in the Character window) isn't repeated here,
  // and the Adventure log's tabs (daily hunts, achievements, season, codex, pets, rankings) are one tile
  // b-ui2: the nine you use most, as big tiles (the owner's mock-up), then everything else
  ["", [["games", "trophy", "Games", ""], ["log", "check", "Quests", "L"], ["rewards", "season", "Rewards", ""], ["shop", "shop", "Shop", ""], ["inv", "bag", "Inventory", "I"], ["petdk", "paw", "Pets", "N"], ["chat", "crew", "Friends", ""], ["set", "gear", "Settings", ""], ["map", "map", "Map", "M"]]],
  ["More", [["agent", "person", "AI Agent", ""], ["partners", "village", "Partner Village", ""], ["raidq", "sword", "Raid Queens", ""], ["forge", "anvil", "Craft", "C"], ["defense", "sword", "Game Village", ""], ["invite", "mail", "Invite friends", ""], ["start", "keys", "New player guide", ""], ["crew", "crew", "Crew", ""], ["island", "island", "Island", ""], ["market", "shop", "Creator Market", ""], ["codex", "book", "Item codex", ""], ["ledger", "book", "ARCL ledger", ""], ["land", "village", "ARCIRCLE LAND", ""], ["village", "village", "Village and contest", ""], ["inbox", "mail", "Inbox", ""],
    ["arcia", "help", "What should I do next?", ""], ["make", "person", "Change character", ""], ["guide", "keys", "Controls", ""], ["help", "help", "Help Center", "H"], ["music", "music", "Music on / off", ""], ["recent", "book", "Recent messages", ""]]],
];
hubEl = document.createElement("div"); hubEl.className = "wp-hub"; hubEl.hidden = true; hubEl.setAttribute("role", "dialog"); hubEl.setAttribute("aria-modal", "true"); hubEl.setAttribute("data-no-i18n", "");
document.body.appendChild(hubEl);
// the Menu remembers the last 4 tiles you opened (a Recent row on top); on a keyboard, typing filters the tiles and Enter opens the first
let hubRecent = [], hubQ = ""; try { hubRecent = JSON.parse(localStorage.getItem("arc.world.hubRecent") || "[]").filter((x) => typeof x === "string").slice(0, 4); } catch { /* none kept */ }
const JUR_OFF = new Set(["map", "island", "village", "defense", "make"]);
function paintHub() {
  const isArc = String(heroOf(P.char || "arc-arc")).startsWith("arc-"), /* b447: the wardrobe dresses ARC Bots only */ dot = { log: quests && quests.pending ? quests.pending() > 0 : false, inbox: !!document.querySelector('#wp-inbox-btn[data-dot]:not([data-dot=""])'), chat: chatDot > 0 };
  const ok = ([id]) => (id !== "raidq" || rqOn()) /* (RAID QUEENS: GM wallets only for now) */ && (id !== "petdk" || !!$("wp-dk-pet")) && (id !== "wardrobe" || isArc) && (id !== "island" || mode === "hub") && !(jurOn && JUR_OFF.has(id)) /* (in Jurassic World the tiles that move you round town wait) */, all = HUB.flatMap(([, items]) => items), rec = hubRecent.map((id) => all.find((x) => x[0] === id)).filter((x) => x && ok(x));
  // the owner's look (2026-10-23, from the owner's mock-up): the nine as 3D icons, Recent as cards with the place's art
  // (only what isn't one of the nine, at most three), More as rows with an icon (what's in Recent isn't repeated), and
  // the small things (help, controls, music …) as pills at the end — images/ui/menu
  const G = new Set(["games", "log", "rewards", "shop", "inv", "petdk", "chat", "set", "map"]), IC = new Set(["agent", "partners", "forge", "defense", "invite", "start", "crew", "island", "market", "ledger", "land", "village"]), ART = new Set(["partners", "log", "defense"]);
  const img = (k) => `<img class="wp-hub-img" src="/images/ui/menu/${k}.webp${VER}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
  const extra = (id, key) => `${key && !coarse ? `<kbd>${key}</kbd>` : ""}${dot[id] ? '<i class="wp-hub-dot" aria-label="new"></i>' : ""}`;
  const tile = ([id, ic, label, key], kind) => kind === "g" ? `<button type="button" data-hub="${id}" class="wp-hub-g">${img("g-" + id)}<span>${esc(TW(label))}</span>${extra(id, key)}</button>`
    : kind === "r" ? `<button type="button" data-hub="${id}" class="wp-hub-r${id === "defense" ? " pri" : ""}"${ART.has(id) ? ` style="--art:url('/images/ui/menu/r-${id}.webp${VER}')"` : ""}>${IC.has(id) ? img("i-" + id) : ICONS.icon(ic, 26)}<span>${esc(TW(label))}</span>${extra(id, key)}</button>`
    : kind === "p" ? `<button type="button" data-hub="${id}" class="wp-hub-p">${ICONS.icon(ic, 18)}<span>${esc(TW(label))}</span>${extra(id, "")}</button>`
    : `<button type="button" data-hub="${id}" class="wp-hub-m${id === "defense" ? " pri" : ""}">${IC.has(id) ? img("i-" + id) : ICONS.icon(ic, 26)}<span>${esc(TW(label))}</span>${extra(id, key)}</button>`;
  const rec3 = rec.filter((x) => !G.has(x[0])).slice(0, 3), inRec = new Set(rec3.map((x) => x[0]));
  const more = HUB[1][1].filter(ok).filter((x) => !inRec.has(x[0]));
  hubEl.innerHTML = `<div class="wp-hub-card"><div class="wp-hub-h"><h2>${esc(T("Menu"))}<small class="wp-hub-q" aria-live="polite"></small></h2><button type="button" class="wp-hub-x" data-hub-x aria-label="${esc(T("Close"))}">${ICONS.icon("no", 20)}</button></div>` +
    (rec3.length ? `<section class="wp-hub-recent"><h3>${esc(TW("Recent"))}</h3><div class="wp-hub-grid">${rec3.map((x) => tile(x, "r")).join("")}</div></section>` : "") +
    `<section class="wp-hub-main"><div class="wp-hub-grid">${HUB[0][1].filter(ok).map((x) => tile(x, "g")).join("")}</div></section>` +
    `<section class="wp-hub-more"><h3>${esc(TW("More"))}</h3><div class="wp-hub-grid">${more.filter((x) => IC.has(x[0])).map((x) => tile(x, "m")).join("")}</div><div class="wp-hub-pills">${more.filter((x) => !IC.has(x[0])).map((x) => tile(x, "p")).join("")}</div></section></div>`;
}
// type-to-filter: tiles whose (translated) name holds what was typed; sections left empty hide
function hubFilter() {
  const q = hubQ.toLowerCase(); let first = null;
  hubEl.querySelectorAll("section").forEach((sec) => { let any = false; sec.querySelectorAll("[data-hub]").forEach((b) => { const on = !q || b.querySelector("span").textContent.toLowerCase().includes(q); b.hidden = !on; if (on) { any = true; first = first || b; } }); sec.hidden = !any || (!!q && sec.classList.contains("wp-hub-recent")); });
  const qs = hubEl.querySelector(".wp-hub-q"); if (qs) qs.textContent = q ? " · " + hubQ : "";
  if (first && !coarse) first.focus({ preventScroll: true }); else hubEl.focus({ preventScroll: true });
}
const moreBtn = $("wp-more-btn");
function hubShown() { hubEl.hidden = false; frozen = true; keys.clear(); paintPrompt(); moreBtn.setAttribute("aria-expanded", "true"); const f = hubEl.querySelector("[data-hub]"); if (f && !coarse) f.focus(); }
function openHub() { if (frozen && hubEl.hidden && !jurOn) return; /* (Jurassic World keeps the town frozen; its Menu still opens) */ closeAll(); hubQ = ""; paintHub(); hubShown(); }
// ret: Esc or the X put focus back on the Menu button (a tile that opens a window leaves it to that window)
function closeHub(ret) { if (!hubEl || hubEl.hidden) return; const had = hubEl.contains(document.activeElement); if (had) document.activeElement.blur(); /* a hidden tile keeps no focus (it would swallow the next Esc) */ hubEl.hidden = true; frozen = false; moreBtn.setAttribute("aria-expanded", "false"); if (ret && had && !coarse) moreBtn.focus({ preventScroll: true }); }
// Menu → Recent messages: the last 30 toasts, newest first; bag lines open the bag
function openRecent() {
  closeAll(); hubQ = ""; const now = Date.now(), ago = (t) => { const m = Math.floor((now - t) / 60000); return m < 1 ? TW("now") : m < 60 ? m + "m" : Math.floor(m / 60) + "h"; };
  hubEl.innerHTML = `<div class="wp-hub-card"><div class="wp-hub-h"><h2>${esc(TW("Recent messages"))}</h2><button type="button" class="wp-hub-x" data-hub-x aria-label="${esc(T("Close"))}">${ICONS.icon("no", 20)}</button></div>` +
    (toastHist.length ? `<ol class="wp-recent">${toastHist.map((h) => { const t = `<span>${esc(h.m)}${h.n > 1 ? ` <b>×${h.n}</b>` : ""}</span><small>${ago(h.t)}</small>`; return /bag|scrap|sold|repair|equipped|가방|고철|背包|废料|çanta|hurda/i.test(h.m) ? `<li><button type="button" class="wp-rc" data-hub="inv">${t}</button></li>` : `<li class="wp-rc">${t}</li>`; }).join("")}</ol>` : `<p class="wp-recent-none">${esc(TW("Nothing yet"))}</p>`) + `</div>`;
  hubShown();
}
hubEl.addEventListener("click", (e) => {
  if (e.target === hubEl || e.target.closest("[data-hub-x]")) { closeHub(!!e.target.closest("[data-hub-x]")); return; }
  const b = e.target.closest("[data-hub]"); if (!b) return; const id = b.dataset.hub; closeHub();
  if (b.closest(".wp-hub-grid") && id !== "recent") { hubRecent = [id, ...hubRecent.filter((x) => x !== id)].slice(0, 4); try { localStorage.setItem("arc.world.hubRecent", JSON.stringify(hubRecent)); } catch { /* not kept */ } }
  if (id === "recent") openRecent(); else
  if (id === "petdk") $("wp-dk-pet").click(); else
  if (id === "agent") openAgent(); else
  if (id === "partners") goPartnerVillage(); else
  if (id === "raidq") openRaidQueens(); else
  if (id === "games") openGames(); else if (id === "invite") referUI.open(); else if (id === "start") openStart(true); else if (id === "rewards") { const rb = $("wp-rew-btn"); if (rb && rb.getClientRects().length) rb.click(); else (document.querySelector(".wp-launch-btn:not([hidden])") || document.querySelector("#wp-gift-btn:not([hidden])") || $("wp-starter-btn")).click(); } else
  if (id === "inv") rpg && rpg.show("inv", "equip"); /* (Inventory lives in Character → Equipment: the owner, 2026-10-24) */
  else if (id === "wardrobe") wardrobe.show();
  else if (id === "make") openMake();
  else if (id === "crew") crewUI.show();
  else if (id === "log") { if (quests && rpg) rpg.show("log"); }
  else if (id === "codex") openCodex();
  else if (["daily", "ach", "season", "codex", "pets", "rank"].includes(id)) { if (quests && rpg) { quests.setTab(id); rpg.show("log"); } }
  else if (id === "shop") arclShop.openShop();
  else if (id === "forge") rpg && rpg.show("forge");
  else if (id === "bench") { if (life) life.showSheet("make"); }
  else if (id === "map") openMap();
  else if (id === "land") { if (land) land.open(); }
  else if (id === "island") island.openIsles(island.friendCount() ? "friends" : "top"); // b406: your island, your friends' and everyone's, to pick from
  else if (id === "village") village.show();
  else if (id === "market") openMarket("market");
  else if (id === "ledger") openMarket("wallet");
  else if (id === "inbox") inbox.show();
  else if (id === "chat") chatUI.show();
  else if (id === "defense") goGameVillage();
  else if (id === "photo") setPhoto(true);
  else if (id === "emote") openWheel();
  else if (id === "guide") openGuide();
  else if (id === "help") openHelp();
  else if (id === "arcia") { closeAll(); help.guide(); }
  else if (id === "set") $("wp-set-btn").click();
  else if (id === "music") $("wp-music-btn").click();
});
hubEl.tabIndex = -1;
hubEl.addEventListener("keydown", (e) => {
  if (hubEl.hidden) return;
  if (e.key === "Escape") { e.stopPropagation(); if (hubQ) { hubQ = ""; hubFilter(); } else closeHub(true); return; }
  // arrows walk the tiles in order (left/up back, right/down on), Home/End the ends
  const nav = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Home: -2, End: 2 }[e.key];
  if (nav) { const bs = [...hubEl.querySelectorAll("[data-hub]")].filter((b) => !b.hidden && !b.closest("section[hidden]")); if (!bs.length) return; e.preventDefault(); e.stopPropagation(); const i = bs.indexOf(document.activeElement); bs[nav === -2 ? 0 : nav === 2 ? bs.length - 1 : i < 0 ? 0 : (i + nav + bs.length) % bs.length].focus(); return; }
  if (coarse || e.ctrlKey || e.metaKey || e.altKey || !hubEl.querySelector("section")) return;
  if (e.key === "Enter" && hubQ) { e.preventDefault(); e.stopPropagation(); const f = [...hubEl.querySelectorAll("[data-hub]")].find((b) => !b.hidden && !b.closest("section[hidden]")); if (f) f.click(); return; }
  if (e.key === "Backspace" && hubQ) { e.preventDefault(); e.stopPropagation(); hubQ = hubQ.slice(0, -1); hubFilter(); return; }
  if (e.key.length === 1 && e.key !== " " && hubQ.length < 24) { e.preventDefault(); e.stopPropagation(); hubQ += e.key; hubFilter(); }
});
moreBtn.addEventListener("click", (e) => { e.stopPropagation(); if (hubEl.hidden) openHub(); else closeHub(); });
$("wp-shop-btn").addEventListener("click", () => { closeAll(); arclShop.openShop(); });
$("wp-starter-btn").addEventListener("click", () => { closeAll(); openStarter(); });
$("wp-gift-btn").addEventListener("click", () => { closeAll(); openWelcome(); });
{ const l = document.querySelector("#wp-gift-btn .wp-bl"); if (l) l.textContent = TW("Gifts"); }
{ const l = document.querySelector("#wp-starter-btn .wp-st-l"); if (l) l.textContent = T("Starter"); }
$("wp-bag-btn").addEventListener("click", () => { closeAll(); if (rpg) rpg.show("inv"); });
$("wp-log-btn").addEventListener("click", () => { closeAll(); if (rpg) rpg.show("log"); });
// the dock (bottom left): Character, Bag, Craft (the Forge), Build (your island's builder)
// red dots on the dock: new pieces in the bag, new stamps on your island
// and on Character when a bag piece beats what you wear (only written when it changes)
const dkDot = (el, on) => { const v = on ? "1" : ""; if (el && el.dataset.dot !== v) el.dataset.dot = v; };
setInterval(() => { dkDot($("wp-dk-bag"), rpg && rpg.freshN && rpg.freshN()); dkDot($("wp-dk-build"), island.bookNew && island.bookNew()); dkDot($("wp-dk-char"), rpg && rpg.upN && rpg.upN()); }, 2000);
$("wp-dk-char").addEventListener("click", () => { closeAll(); if (rpg) { rpg.pane("gear"); rpg.show("inv"); } });
$("wp-dk-bag").addEventListener("click", () => { closeAll(); if (rpg) { rpg.pane("bag"); rpg.show("inv"); setTimeout(() => { const b = document.querySelector("#wr-inv .wr-bag, #wr-inv .wr-cells"); if (b) b.scrollIntoView({ block: "nearest" }); }, 60); } });
// the Pets button wears a NEW badge until it's opened once
try { if (localStorage.getItem("arc.world.petSeen")) $("wp-dk-pet-new").hidden = true; } catch { /* private mode */ }
// the Exchange ($ARCL ⇄ $ARCIRCLE by request, world-swap.js): loaded the first time it's opened
let swapUi = null;
try { if (localStorage.getItem("arc.world.swapSeen")) $("wp-dk-swap-new").hidden = true; } catch { /* private mode */ }
$("wp-dk-swap").addEventListener("click", async () => {
  $("wp-dk-swap-new").hidden = true; try { localStorage.setItem("arc.world.swapSeen", "1"); } catch { /* private mode */ } closeAll();
  try { if (!swapUi) { let M; try { M = await import("./world-swap.js"); } catch (e) { if (staleReload()) return; throw e; } swapUi = M.createSwap({ T: TW, esc, toast, sess, post, Snd, refresh: () => refreshPurse(true), onClose: () => { if (!jurOn) frozen = false; } }); }
    frozen = true; keys.clear(); await swapUi.open();
  } catch (e) { frozen = false; console.warn("exchange", e); toast(TW("The exchange couldn't open. Try again.")); if (diag && diag.err) diag.err("exchange: " + String((e && e.message) || e), "swap"); }
});
// the Creator Market (world-market.js, b-ec5): blueprints for ARCL, your creator earnings and settlements, your ARCL ledger,
// the team's tab; loaded the first time it's opened
let marketUi = null;
async function sendArc(to, arc) { // a GM's own transfer of $ARCIRCLE on Arc (a settlement): the wallet signs, the server only reads it back
  const tok = /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "", s = sess(); if (!tok || !AC || !s) throw new Error(TW("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  if (String(addr()).toLowerCase() !== String(s.wallet).toLowerCase()) throw new Error(TW("Switch your wallet to the one you signed in with ({w})", { w: String(s.wallet).slice(0, 6) + "…" + String(s.wallet).slice(-4) }));
  const prov = await AC.provider(); try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
  const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0"), wei = BigInt(Math.floor(arc)) * 10n ** 18n;
  return prov.request({ method: "eth_sendTransaction", params: [{ from: addr(), to: tok, data: "0xa9059cbb" + pad(to) + pad(wei.toString(16)) }] });
}
/// one transaction from the player's own wallet on Arc (the agent's vault: open, fund, allow a token, pause, withdraw)
async function walletTx(to, data) {
  const s = sess(); if (!AC || !s) throw new Error(TW("Wallet connect isn't available here."));
  if (!AC.live || !AC.live()) await AC.connect();
  if (String(addr()).toLowerCase() !== String(s.wallet).toLowerCase()) throw new Error(TW("Switch your wallet to the one you signed in with ({w})", { w: String(s.wallet).slice(0, 6) + "…" + String(s.wallet).slice(-4) }));
  const prov = await AC.provider(); try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
  return prov.request({ method: "eth_sendTransaction", params: [{ from: addr(), to, data }] });
}
async function openMarket(tab) {
  closeAll();
  try { if (!marketUi) { let M; try { M = await import("./world-market.js"); } catch (e) { if (staleReload()) return; throw e; }
      marketUi = M.createMarket({ T: TW, esc, toast, sess, post, Snd, refresh: () => refreshPurse(true), isGM: () => { const s0 = sess(); return !!(s0 && VILL.isGM(String(s0.wallet).toLowerCase())); },
        myCode: async () => (onMyIsland() ? island.myCode() : null), build: async (code, title) => { if (!onMyIsland()) await goIsland({}); setTimeout(() => { try { island.buildCode(code, title); } catch (e) { toast(TW("The blueprint couldn't open. Try again.")); } }, 700); },
        sendArc, onClose: () => { if (!jurOn) frozen = false; } }); }
    frozen = true; keys.clear(); await marketUi.open(tab);
  } catch (e) { frozen = false; console.warn("market", e); toast(TW("The market couldn't open. Try again.")); if (diag && diag.err) diag.err("market: " + String((e && e.message) || e), "market"); }
}
$("wp-dk-pet").addEventListener("click", () => { $("wp-dk-pet-new").hidden = true; try { localStorage.setItem("arc.world.petSeen", "1"); } catch { /* private mode */ } closeAll(); if (quests && rpg) { quests.setTab("pets"); rpg.show("log"); } });
$("wp-dk-craft").addEventListener("click", () => { closeAll(); if (rpg) rpg.show("forge"); });
$("wp-dk-build").addEventListener("click", async () => {
  closeAll();
  if (!onMyIsland()) await goIsland({});
  if (onMyIsland() && !island.building()) island.keyDown({ key: "b", preventDefault() {} });
});
const openVillage = (tab) => { closeAll(); village.show(tab); };
$("wp-vil-btn").addEventListener("click", () => openVillage());
$("wp-vlv").addEventListener("click", () => openVillage());

// ---------------- the Back button (a phone's, or the browser's) ----------------
// With a window open, Back closes it; on the plain game screen it asks before leaving the game.
const leaveEl = document.createElement("div");
leaveEl.className = "wp-leave"; leaveEl.id = "wp-leave"; leaveEl.hidden = true; leaveEl.setAttribute("role", "alertdialog"); leaveEl.setAttribute("aria-modal", "true"); leaveEl.setAttribute("data-no-i18n", "");
leaveEl.innerHTML = `<div class="wp-card wp-leave-card"><h2>${esc(T("Leave ARCIRCLE World?"))}</h2><p>${esc(sess() ? T("Your progress is saved to your wallet.") : T("Your progress stays in this browser."))}</p><div class="wp-leave-btns"><button type="button" class="wp-btn" id="wp-leave-stay">${esc(T("Keep playing"))}</button><button type="button" class="wp-cta" id="wp-leave-go">${esc(T("Leave the game"))}</button></div></div>`;
document.body.appendChild(leaveEl);
let leaving = false;
const guard = () => { try { history.pushState({ wpGuard: 1 }, "", location.href); } catch { /* old browser */ } };
function closeLeave() { if (leaveEl.hidden) return false; leaveEl.hidden = true; frozen = false; keys.clear(); paintPrompt(); return true; }
function backAction() {
  if (closeLeave()) return true;
  if (combat && combat.vitals().down) return true; // knocked out: the choice on screen stays
  if (photo) { setPhoto(false); return true; }
  if (!wheel.hidden) { wheel.hidden = true; return true; }
  if (mode === "island" && island.keyDown({ key: "Escape", preventDefault() {} })) return true;
  if (frozen) { closeAll(); return true; }
  if (mode === "island" && island.building()) { island.keyDown({ key: "b", preventDefault() {} }); return true; }
  return false;
}
addEventListener("popstate", () => {
  if (leaving) return;
  if (!backAction()) { leaveEl.querySelector("p").textContent = sess() ? T("Your progress is saved to your wallet.") : T("Your progress stays in this browser."); leaveEl.hidden = false; frozen = true; keys.clear(); setTimeout(() => $("wp-leave-stay").focus(), 30); }
  guard();
});
leaveEl.addEventListener("click", (e) => {
  if (e.target.id === "wp-leave-stay" || e.target === leaveEl) closeLeave();
  if (e.target.id === "wp-leave-go") { leaving = true; cloudSave(); history.go(-2); setTimeout(() => { (window.__arcFrame ? window.top : window).location.href = "/"; }, 500); }
});
guard();
$("wp-set-help").addEventListener("click", () => openHelp());
if (coarse) $("wp-keys").hidden = true; else $("wp-acts").hidden = true;

// ---------------- HUD context: combat focus, the key legend, the quest distance, controller glyphs ----------------
// combat focus: while you fight (body.wc-fight, world-combat.js) the dock, the shop and starter tiles and the feed step
// back (world-skin.css body.wp-focus), leaving HP/SP, the skills, the boss bar and the minimap; the legend shows the
// fight keys for a few seconds, then goes too (wp-focus-k). It all comes back 2 s after the fight ends
let focusT = 0, focusK = 0;
new MutationObserver(() => {
  const b = document.body.classList, f = b.contains("wc-fight");
  if (f) { clearTimeout(focusT); focusT = 0; if (!b.contains("wp-focus")) { b.add("wp-focus"); clearTimeout(focusK); focusK = setTimeout(() => b.add("wp-focus-k"), 5000); } }
  else if (b.contains("wp-focus") && !focusT) focusT = setTimeout(() => { focusT = 0; clearTimeout(focusK); b.remove("wp-focus", "wp-focus-k"); }, 2000);
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });
// the key legend shows only what works right now: at a door E and what it does, in a fight the fight keys, on a ride
// its keys, otherwise walking. With a controller its buttons instead (drawn glyphs: A B X Y, LB RB, the sticks)
const padG = (g) => `<i class="wp-pad wp-pad-${g === "↑" ? "up" : g === "↓" ? "dn" : g === "☰" ? "st" : g.toLowerCase()}">${esc(g)}</i>`;
const keyRows = (ctx) => {
  const near1 = ctx.startsWith("near:") ? ctx.slice(5) : "", ride1 = ctx.startsWith("ride:") ? ctx.slice(5) : "";
  const move = { k: ["W", "A", "S", "D"], p: ["L"], w: W("move") }, jumpR = { k: ["Space"], p: ["A"], w: W("jump") };
  if (ctx === "fight") return [{ k: ["J"], p: ["X"], w: W("attack") }, { k: ["K"], p: ["B"], w: W("dodge") }, { k: ["Z"], p: ["Y"], w: W("skill") }, { k: ["Q"], p: ["LB", "RB"], w: T("switch skill") }, { k: ["4", "5"], p: ["LT", "RT"], w: W("potions") }, { k: ["Tab"], p: null, w: T("lock on") }, move];
  if (near1) return [{ k: ["E"], p: ["↓"], w: W(near1 === "bounty" ? "read" : near1 === "npc" || near1 === "resident" ? "talk" : near1 === "pad" || near1 === "portal" || near1 === "isle" || near1 === "isle-exit" ? "go" : "enter") }, move, jumpR];
  if (ride1) return [move, ride1 === "jet" ? { k: ["Space"], p: ["A"], w: T("climb / descend") } : jumpR, { k: ["Shift"], p: null, w: W("speed") }, level() >= 10 ? { k: ["V"], p: null, w: T("switch ride") } : null, { k: ["F"], p: null, w: T("get off") }];
  return [move, jumpR, { k: ["Shift"], p: null, w: W("run") }, { k: ["F"], p: null, w: W("board") }, { k: ["1", "2"], p: ["↑"], w: W("emote") }, { k: ["M"], p: ["☰"], w: W("map") }, { k: ["H"], p: null, w: W("help") }, { k: null, p: ["R"], w: W("look") }, { k: [], p: null, w: W("drag to look") }];
};
let keysCtx = "", qdEl = null, qdN = -1; const qdV = new THREE.Vector3();
function paintKeys(ctx) {
  const el = $("wp-keys"); if (!el) return;
  const pad = gpad.on, sig = ctx + (pad ? "|pad" : "") + "|" + (level() >= 10);
  el.hidden = coarse && !pad; document.body.classList.toggle("wp-gpad", pad);
  if (sig === keysCtx) return; keysCtx = sig;
  const rows = keyRows(ctx).filter((r) => r && (pad ? r.p : r.k));
  el.innerHTML = rows.map((r) => (pad ? r.p.map(padG) : r.k.map((k) => `<kbd>${esc(k)}</kbd>`)).join("") + " " + esc(r.w)).join(" <span>·</span> ");
  el.dataset.ctx = ctx.split(":")[0]; el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap");
  const pk = document.querySelector("#wp-enter kbd"); if (pk) pk.innerHTML = pad ? padG("↓") : "E";
}
setInterval(() => {
  if (!worldReady) return;
  const ctx = document.body.classList.contains("wc-fight") ? "fight" : near && near.kind && !frozen ? "near:" + near.kind : boarding && mode === "hub" ? "ride:" + ride : "walk";
  paintKeys(ctx);
  // the distance to the quest's target on the quest line ("· 42 m"), written only when the number changes
  const li = document.querySelector("#wp-quests-l li.cur .wp-qdist"); if (li !== qdEl) { qdEl = li; qdN = -1; }
  if (!qdEl) return;
  let n = -2; if (questTarget && mode === "hub") { questTarget.getWorldPosition(qdV); n = Math.round(qdV.distanceTo(at)); }
  if (n !== qdN) { qdN = n; qdEl.textContent = n >= 0 ? ` · ${n.toLocaleString("en-US")} m` : ""; }
}, 250);
addEventListener("gamepaddisconnected", () => { if (!(navigator.getGamepads ? [...navigator.getGamepads()] : []).some((g) => g && g.connected)) toast(T("Controller disconnected")); });

// ---------------- day and night (US Eastern time, etHour) ----------------
// a blue day sky over the ground, stars and the far planets at night (?hour=21 tries another hour)
const skyU = sky.material.uniforms, DAY = { top: new THREE.Color(0x0e4ed2), mid: new THREE.Color(0x2c9af2), glow: new THREE.Color(0x92d8fc) } /* b420: a clear, saturated anime blue, light cyan at the horizon (deeper than it reads: tone mapping pales it) */, NIGHT = { top: new THREE.Color(0x02030a), mid: new THREE.Color(0x07102a), glow: new THREE.Color(0x173452) }, DUSK = new THREE.Color(0xf0a070);
const HALLOW_FOG = new THREE.Color(0x2a1840); // Halloween nights: a violet fog
const FOG = { day: new THREE.Color(0x9ccff5), /* b440: bluer still: where far grass met the haze it read grey-green */ /* a bluer day haze: distance reads as air, not milk (b420: the horizon's light cyan) */ night: new THREE.Color(0x0b1830), dusk: new THREE.Color(0xd99a80) };
const hourParam = Number(new URLSearchParams(location.search).get("hour"));
let nightK = -1, skyOverride = "";
// island skies from the ARCL Shop
// island skies (world-style.js has the rest of each style); a style without an entry keeps the real day and night
const THEMES = {
  "style-tropical": { top: 0x1f7fd8, mid: 0x7ed6f0, glow: 0xdff6fb, fog: 0xbfe6f0 },
  "style-snow": { top: 0x5f88b8, mid: 0xbcd4ea, glow: 0xf2f7fb, fog: 0xdde8f2 },
  "style-sakura": { top: 0x6a8fd8, mid: 0xf2b8d8, glow: 0xffe6f2, fog: 0xf6d6e6, cloud: 0xffe2f0 },
  "style-desert": { top: 0x3b2c78, mid: 0xf0905e, glow: 0xffd09a, fog: 0xeaa98c, cloud: 0xffd8b8 },
  "style-ocean": { top: 0x1f7fd8, mid: 0x7ed6f0, glow: 0xdff6fb, fog: 0xbfe6f0 },
  "style-aurora": { top: 0x020814, mid: 0x0a2240, glow: 0x1a5a62, fog: 0x0c1d33, aurora: true, dark: true, cloud: 0x2a3a5a },
  "style-celestial": { top: 0x7fb4ff, mid: 0xe6f0ff, glow: 0xfff6dc, fog: 0xf0f4ff },
  "style-volcano": { top: 0x1a0606, mid: 0x5a1a10, glow: 0xff7a3a, fog: 0x3a1a14, dark: true, cloud: 0x4a2a26 },
};
// fireflies over the town at night: soft green-gold specks that drift and blink
const fireflies = (() => {
  const N = reduce ? 30 : 90, pos = new Float32Array(N * 3), base = [];
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 70; base.push([Math.cos(a) * r, 0.6 + Math.random() * 2.4, Math.sin(a) * r, Math.random() * 10]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement("canvas"); dot.width = dot.height = 32; { const g = dot.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
  const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: 0xd8ff8a, size: 0.55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.visible = false; planet.add(pts);
  pts.userData.update = (t) => { for (let i = 0; i < N; i++) { const b = base[i], s = b[3]; pos[i * 3] = b[0] + Math.sin(t * 0.3 + s) * 1.6; pos[i * 3 + 1] = b[1] + Math.sin(t * 0.7 + s * 2) * 0.4; pos[i * 3 + 2] = b[2] + Math.cos(t * 0.25 + s) * 1.6; } geo.attributes.position.needsUpdate = true; mat.size = 0.45 + Math.sin(t * 3) * 0.12; };
  return pts;
})();
// outdoor light on the shiny surfaces: the sky's own colours over a green ground as the environment map (it was a
// studio room before), redone when the day has turned a little
const skyEnv = (() => {
  const pm = new THREE.PMREMGenerator(st.renderer), sc = new THREE.Scene(), geo = new THREE.SphereGeometry(10, 32, 16);
  const col = new Float32Array(geo.attributes.position.count * 3); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  let rt = null, lastK = -1; const c = new THREE.Color(), ground = new THREE.Color();
  return (k) => {
    if (rt && Math.abs(k - lastK) < 0.08) return; lastK = k;
    const top = skyU.top.value, mid = skyU.mid.value, glow = skyU.glow.value, p = geo.attributes.position;
    ground.set(0x4c8a52).lerp(new THREE.Color(0x0a1410), k);
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10; if (y > 0.25) c.copy(mid).lerp(top, (y - 0.25) / 0.75); else if (y > -0.05) c.copy(glow).lerp(mid, Math.max(0, y) / 0.25); else c.copy(ground); col[i * 3] = c.r * 1.6; col[i * 3 + 1] = c.g * 1.6; col[i * 3 + 2] = c.b * 1.6; }
    geo.attributes.color.needsUpdate = true;
    const old = rt; rt = pm.fromScene(sc, 0.03); st.scene.environment = rt.texture; if (old) old.dispose();
  };
})();
// the air for the post chain: low fog thicker at dawn, dusk and night and in some grounds, sun shafts by day, heat over lava
const AIR_FOG = { swamp: 0.018, peaks: 0.01, void: 0.008, wastes: 0.012, reef: 0.01, depths: 0.008, abyss: 0.006 };
function airFor(k, dusk, zz) {
  const id = zz ? zz.id : "", col = new THREE.Color(0xbfe6fb).lerp(new THREE.Color(0x1a2440), k).lerp(new THREE.Color(0xf0c8a0), dusk);
  if (zz) col.lerp(new THREE.Color(zz.fog), 0.6);
  return { fog: 0.0008 + dusk * 0.012 + k * 0.0047 + (AIR_FOG[id] || 0), color: col, rays: (1 - k) * (0.25 + dusk * 0.6) * (/^(abyss|void|depths)$/.test(id) ? 0.3 : 1), heat: id === "abyss" ? 1 : 0, sunColor: st.sun.color };
}
const MOONC = new THREE.Color(0x9fb8ff); // moonlight
const CLOUD = { night: new THREE.Color(0x3a4660), dusk: new THREE.Color(0xffc8a0), shade: new THREE.Color(0xb2cdf2), /* a soft blue underside */ nshade: new THREE.Color(0x141a2a), dshade: new THREE.Color(0xc87a7a) };
// the town's clock is US Eastern (the owner's call, 2026-10-23: night 20:00–05:00 there, the same as the Pumpkin Kings')
const ET_FMT = (() => { try { return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); } catch { return null; } })();
function etHour(t = Date.now()) {
  if (ET_FMT) try { const p = {}; for (const x of ET_FMT.formatToParts(new Date(t))) p[x.type] = x.value; return (+p.hour % 24) + (+p.minute) / 60; } catch { /* below */ }
  const d = new Date(t - 5 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; // no time-zone data: Eastern standard time
}
function dayNight() {
  const h = photoHour != null ? photoHour : Number.isFinite(hourParam) && new URLSearchParams(location.search).has("hour") ? hourParam : etHour();
  const k = h >= 20 || h < 5 ? 1 : h >= 17 ? (h - 17) / 3 : h < 7 ? 1 - (h - 5) / 2 : 0;
  if (Math.abs(k - nightK) < 0.01) return; nightK = k;
  // skyEnv is made further down the module, past awaits: a first call that comes too early tries again next time
  setTimeout(() => { try { skyEnv(k); } catch { nightK = -1; } }, 0);
  const dusk = Math.max(0, 1 - Math.abs(k - 0.5) * 2.4);
  if (grade) grade.set(k, dusk);
  if (fxPost) { const zz = mode === "hub" && combat ? combat.zone() : null;
    // b447: the Game Village has its own grade too, easing in over the last 12 m before its edge
    let gz = zz && zz.id, gk = 1; if (!gz && mode === "hub") { const v = here(tmpV3 || (tmpV3 = new THREE.Vector3())), dv = Math.hypot(v.x - GV.VILLAGE.x, v.z - GV.VILLAGE.z); if (dv < GV.VILLAGE.r + 12) { gz = "village"; gk = Math.min(1, (GV.VILLAGE.r + 12 - dv) / 12); } }
    if (lgrade.set(k, dusk, gz, gk)) fxPost.setLut(lgrade.tex()); fxPost.setAir(airFor(k, dusk, zz)); }
  ["top", "mid"].forEach((n) => skyU[n].value.copy(DAY[n]).lerp(NIGHT[n], k));
  skyU.glow.value.copy(DAY.glow).lerp(NIGHT.glow, k).lerp(DUSK, dusk * 0.7);
  // an aurora on one night in three (by the US Eastern date), or with ?aurora=1; strongest in the deep of the night
  if (skyU.uAur) { const q = new URLSearchParams(location.search).get("aurora"), d = Math.floor((Date.now() - 5 * 3600e3 - 12 * 3600e3) / 864e5), on = q === "1" || (q !== "0" && d % 3 === 0); skyU.uAur.value = on ? Math.max(0, (k - 0.55) / 0.45) : 0; }
  st.sun.intensity = 2.15 * (1 - k * 0.62); st.sun.color.setHSL(0.09, 0.35 * (1 - k) + dusk * 0.6, 0.97 - dusk * 0.12); // a warm afternoon sun; a cool moonlight at night
  st.sun.color.lerp(MOONC, k * 0.6);
  st.hemi.intensity = 0.95 * (1 - k * 0.4); st.scene.environmentIntensity = 0.42 + k * 0.25; if (ENV.rimStrength) ENV.rimStrength.value = 0.16 + k * 0.18; st.renderer.toneMappingExposure = 0.8 + k * 0.22; /* a calmer day: the white plaza was glaring */
  const mist = h >= 5 && h < 8.5 ? Math.sin(((h - 5) / 3.5) * Math.PI) : 0; // early morning: a mist that lifts by half past eight
  if (st.scene.fog) st.scene.fog.density = (st.quality.coarse ? 0.0024 : 0.0016) + k * (st.quality.coarse ? 0.0032 : 0.004) + mist * 0.006; /* b420: a clearer day, far hills keep their colour (phones a little less: their culling at 110 m has no fade); nights as before */ ENV.CLOUD.k.value = Math.max(0, 1 - k * 1.4) * ((() => { try { return mood === "rain"; } catch { return false; } })() ? 1.4 : 1); /* cloud shadows by day, more on a rainy one */ st.hemi.color.set(k > 0.5 ? 0x9fd0ff : 0xcfe8ff); lamps.userData.night(k); if (K.arcNight) K.arcNight(k);
  if (st.scene.fog) st.scene.fog.color.copy(FOG.day).lerp(FOG.night, k).lerp(FOG.dusk, dusk * 0.5); if (halloween && st.scene.fog) st.scene.fog.color.lerp(HALLOW_FOG, k * 0.55); if (pumpkins) pumpkins.glow(k);
  stars.material.opacity = 0.85 * k; stars.visible = k > 0.02;
  skyPlanets.children.forEach((p) => { p.material.opacity = 0.95 * k; }); skyPlanets.visible = k > 0.02;
  clouds.userData.mat.color.setHSL(0.6, 0.15, 1 - k * 0.72); clouds.userData.mat.emissiveIntensity = 0.25 * (1 - k);
  const th = THEMES[skyOverride];
  if (th) {
    skyU.top.value.set(th.top); skyU.mid.value.set(th.mid); skyU.glow.value.set(th.glow); if (st.scene.fog) st.scene.fog.color.set(th.fog);
    st.sun.intensity = th.dark ? 0.9 : 2.1; st.hemi.intensity = th.dark ? 0.45 : 0.75; lamps.userData.night(th.dark ? 1 : 0);
    stars.visible = !!th.dark; stars.material.opacity = th.dark ? 0.85 : 0;
    if (th.cloud != null) { clouds.userData.mat.color.set(th.cloud); clouds.userData.mat.emissiveIntensity = th.dark ? 0.05 : 0.25; }
  }
  { const u = sky.material.uniforms; if (u.uCloudLit) { // the drifting cloud layer: white by day, peach at dusk, slate at night
    u.uCloudLit.value.setRGB(1.3, 1.3, 1.3).lerp(CLOUD.night, k).lerp(CLOUD.dusk, dusk * 0.8); u.uCloudShade.value.copy(CLOUD.shade).lerp(CLOUD.nshade, k).lerp(CLOUD.dshade, dusk * 0.6);
    u.uSunCol.value.copy(st.sun.color); u.uCloudK.value = 1 - k * 0.7; u.uNight.value = th && th.dark ? 1 : k; u.uCover.value = mood === "rain" ? 0.3 : 0.48;
    if (th && th.cloud != null) { u.uCloudLit.value.set(th.cloud); u.uCloudShade.value.set(th.cloud).multiplyScalar(0.6); } } }
  ambNight = th && th.dark ? 1 : k;
  if (K.TOON) { K.TOON.rimK.value = 0.5 - k * 0.15 + dusk * 0.2; K.TOON.rim.value.set(0x9fd8ff).lerp(new THREE.Color(0x7a8cff), k).lerp(new THREE.Color(0xffb37a), dusk * 0.7); } // the characters' rim light
  if (grass && lamps.userData.spots) grass.setLamps(lamps.userData.spots, th && th.dark ? 1 : k);
  if (grass) grass.setLight((th && th.dark ? 0.3 : 1 - k * 0.7) * (wet ? 0.82 : 1), k > 0.5 ? 0x5a9a8a : 0x7cc65a);
  for (const u of reflU) u.uLight.value = 1 - k * 0.55;
  for (const m of waterMats) { m.uniforms.uLight.value = 1 - k * 0.6; m.uniforms.uSky.value.copy(skyU.mid.value).lerp(skyU.glow.value, 0.3); m.uniforms.uSunCol.value.copy(st.sun.color); }
  aurora.visible = (th && th.aurora) || mood === "aurora";
  fireflies.visible = k > 0.4 && !th; fireflies.material.opacity = Math.min(1, (k - 0.4) * 2) * 0.9;
  // inside a hunting ground the air takes its colour
  const zz = combat && combat.zone(); if (zz && st.scene.fog && mode === "hub") { st.scene.fog.color.lerp(new THREE.Color(zz.fog), 0.65); if (zz.id === "depths") { skyU.top.value.lerp(new THREE.Color(0x0a0618), 0.6); skyU.mid.value.lerp(new THREE.Color(0x1a1030), 0.6); } }
}
setInterval(dayNight, 60000);

// ---------------- camera: a building between the camera and the player turns see-through ----------------
const ray = new THREE.Raycaster(); ray.camera = st.camera; let camFit = 1, colT = 0;
const ghosted = new Map(), ghostMats = new Map();
const ghostOf = (m) => { let g = ghostMats.get(m); if (!g) { g = m.clone(); g.transparent = true; g.opacity = 0.14; g.depthWrite = false; ghostMats.set(m, g); } return g; };
function ghost(group, on) {
  if (on === !!ghosted.get(group)) return;
  group.traverse((o) => {
    if (!o.isMesh || o.isSprite) return;
    if (on) { if (!o.userData.mat0 && !o.material.transparent) { o.userData.mat0 = o.material; o.material = Array.isArray(o.material) ? o.material.map(ghostOf) : ghostOf(o.material); o.castShadow = false; } }
    else if (o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; o.castShadow = true; }
  });
  if (on) ghosted.set(group, true); else ghosted.delete(group);
}
function camCollide(target) {
  const head = new THREE.Vector3(0, hop + 1.6, 0), dirC = target.clone().sub(head), len = dirC.length(); dirC.normalize();
  ray.set(head, dirC); ray.far = len;
  const close = [];
  const lists = mode === "island" ? [] : [shops, town, coinBuildings, arches, adc && landNow === "ad" ? adc.occluders() : []]; // (AD-City 1.5: Nexus City's buildings, its spire and the raised ring too)
  for (const list of lists) for (const g of list) { g.getWorldPosition(tmp); if (tmp.distanceTo(head) < len + 7) close.push(g); }
  // inside a hunting ground: its tall props too (the Dark Market's obelisks filled the screen with black)
  if (zoneRoot && mode !== "island") { const px = -planet.position.x, pz = -planet.position.z, now = performance.now();
    for (const g of zoneRoot.children) { const zn = g.userData && g.userData.zone; if (!zn || Math.hypot(px - zn.x, pz - zn.z) > zn.r + 6) continue;
      if (!g.userData.tallAt || now - g.userData.tallAt > 5000) { g.userData.tallAt = now; const tall = []; g.traverse((o) => { if (!o.isMesh || o.isSprite || o.name === "zone-ground" || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; if (bb.max.y - bb.min.y > 1.6 || o.position.y > 1.2) tall.push(o); }); g.userData.tall = tall; }
      close.push(...g.userData.tall); } }
  const hits = new Set();
  if (close.length) for (const h of ray.intersectObjects(close, true)) { if (!h.object.isMesh || h.object.isSprite || h.distance < 0.4) continue; let o = h.object; while (o.parent && !close.includes(o)) o = o.parent; if (close.includes(o)) hits.add(o); }
  for (const g of [...ghosted.keys()]) if (!hits.has(g)) ghost(g, false);
  hits.forEach((g) => ghost(g, true));
  // a little pull-in only when something is right behind the head
  let fit = 1;
  if (mode === "island" && !island.building()) { // player-built walls: march the grid (no mesh raycasts) and pull in before the first solid cell
    const px = -planet.position.x, pz = -planet.position.z, n = Math.ceil(len / 0.5);
    for (let i = 1; i <= n; i++) { const k = i / n; if (island.solidAt(px + target.x * k, head.y + (target.y - head.y) * k, pz + target.z * k)) { fit = Math.max(0.2, (i - 1.6) / n); break; } }
  }
  camFit = fit < camFit ? fit : THREE.MathUtils.lerp(camFit, fit, 0.08);
}

// ---------------- frame rate watch: drop quality once if the device can't keep up ----------------
let fpsAcc = 0, fpsN = 0, fpsT0 = performance.now(), degraded = false, liteFx = false;
// dynamic resolution (Auto). A change resizes every render target, which is itself a hitch, so it changes rarely:
// down a step after two slow 4-second spells in a row (under 38 fps), back up only after 20 s of 58+, and never
// within 20 s of the last change (at most twice up a session, so it can't see-saw)
const dynStart = performance.now(); let dynK = 1, dynAcc = 0, dynN = 0, dynT0 = performance.now(), dynGood = 0, dynBad = 0, dynLast = 0, dynUps = 0, capBad = 0;
// b441: AC Defense and Coin Jump on a phone: half the grass (its blades are in random order, so it thins evenly) and
// a quicker dynamic resolution while the game is on; all back on leaving
let gameOn = false;
st.on(() => { let on = false; try { on = !!(defenseOn || jumpOn || beatOn); } catch { return; } if (on === gameOn) return; gameOn = on; dynBad = 0;
  try { if (coarse && grass && grass.mesh) { const g = grass.mesh.geometry; if (g.userData.full == null) g.userData.full = g.instanceCount; g.instanceCount = on || grassThin ? Math.round(g.userData.full * 0.5) : g.userData.full; } } catch { /* no grass */ } });
function dynRes(dt) {
  if (S.quality !== "auto" || degraded || photo || navigator.webdriver || !st.scale) return;
  dynAcc += dt; dynN++; if (performance.now() - dynT0 < 4000 || dynAcc < 1.5) return;
  const fps = dynN / dynAcc, now = performance.now(); dynAcc = 0; dynN = 0; dynT0 = now;
  // b411: slow means under 80% of the limit on a phone (48 of 60: phones sat at 40–50 and never eased off) and 70% on
  // a computer; it was 63% for both
  // b447: a phone already at the fewest pixels and still under 40 fps judders between 30 and 45: an even 30 looks smoother
  if (st.quality.coarse && dynK <= 0.6 && fps < (S.fpsCap || 60) * 0.8 && !liveShOff && now - dynLast > 20000 && bakedShadows()) { dynLast = now; dynBad = 0; return; } // b447: then the live shadow goes
  if (st.quality.coarse && !S.fpsCap && !autoCap && liveShOff && dynK <= 0.6 && fps < 40) { if (++capBad >= 2) { autoCap = 30; st.fps(30); } } else capBad = 0;
  const capF = S.fpsCap || autoCap || 60; dynBad = fps < capF * (st.quality.coarse ? (now - dynStart > 600000 ? 0.9 : 0.8) : 0.7) ? dynBad + 1 : 0; /* b448: after 10 minutes a phone is warm: ease off a step earlier */ dynGood = fps > capF * 0.96 ? dynGood + 1 : 0; // relative to the frame limit
  if (now - dynLast < (gameOn ? 8000 : 20000)) return;
  // b447: on a phone the grass goes to half before the first pixel goes (the blades are back on phones and cost)
  if (dynBad >= (gameOn ? 1 : 2) && st.quality.coarse && !grassThin && grass && grass.mesh) { grassThin = true; try { const g = grass.mesh.geometry; if (g.userData.full == null) g.userData.full = g.instanceCount; g.instanceCount = Math.round(g.userData.full * 0.5); } catch { /* no grass */ } dynBad = 0; dynLast = now; return; }
  if (dynBad >= (gameOn ? 1 : 2) && dynK > 0.6) { /* b441: in a Game Village game one slow spell is enough */ dynK = Math.max(0.6, dynK - 0.15); dynBad = 0; dynLast = now; st.scale(dynK); }
  else if (dynGood >= 5 && dynK < 1 && dynUps < 2) { dynK = Math.min(1, dynK + 0.15); dynGood = 0; dynUps++; dynLast = now; st.scale(dynK); }
}
function watchFps(dt) {
  if (st.idle) st.idle(!!(frozen && !photo && !introOn && !flying)); // a menu is open: the world behind it rests
  if (frozen) { fpsAcc = 0; fpsN = 0; fpsT0 = performance.now(); dynAcc = 0; dynN = 0; dynT0 = performance.now(); return; }
  dynRes(dt);
  if (liteFx || S.quality !== "auto" || photo || navigator.webdriver) return;
  fpsAcc += dt; fpsN++;
  if (performance.now() - fpsT0 > 9000 && fpsAcc > 4) {
    // still slow after that: fewer sparks and puffs in fights
    if (degraded) { if (fpsN / fpsAcc < 22) { liteFx = true; toast(T("Fewer effects to keep things smooth")); } fpsAcc = 0; fpsN = 0; fpsT0 = performance.now(); return; }
    // slow: first fewer pixels (twice at most), and only then no bloom and no shadows
    if (fpsN / fpsAcc < (S.fpsCap || autoCap || 60) * 0.43 && !(st.lighter && st.lighter()) && !(st.softer && st.softer())) { degraded = true; st.degrade(); toast(T("Graphics lowered to keep things smooth")); }
    fpsAcc = 0; fpsN = 0; fpsT0 = performance.now();
  }
}

// ---------------- the loop ----------------
const cam = st.camera;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), base = new THREE.Vector3();
let animState = "", npcT = 0, introOn = false, landUntil = 0, hoverT = 0, idleT = 0, idleNext = 7, turnNow = 0, afk = false, afkYaw = 0;
// any input at all (a mouse move too) wakes you from sitting idle; the pad's sticks count through lastInput
let actAt = performance.now(); for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) addEventListener(ev, () => { actAt = performance.now(); }, { passive: true, capture: true });
// phones: keep the screen awake while playing (long fishing waits, Defense waves); let it sleep after 5 idle minutes
let wl = null, wlAsk = false;
const wlGet = async () => { if (wl || wlAsk || document.hidden) return; wlAsk = true; try { wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); } catch { wl = null; } wlAsk = false; };
if (coarse && navigator.wakeLock) {
  addEventListener("pointerdown", wlGet, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && performance.now() - actAt < 300000) wlGet(); });
  setInterval(() => { if (wl && performance.now() - actAt > 300000) { wl.release().catch(() => {}); wl = null; } }, 30000);
}
// stepping into the portal: drawn in (smaller, spinning, toward its middle), the screen fills with light and the view
// widens, then off to the platform (0.6 s); a tap or a key goes straight there. Back from it (bfcache), all is undone
const PULL_MS = 620; let pull = null;
const pullGo = () => { (window.__arcFrame ? window.top : window).location.href = "/?skip"; };
function portalGo(g) {
  if (pull) return;
  if (reduce) { pullGo(); return; }
  const p = g.getWorldPosition(new THREE.Vector3()).sub(planet.position); // its spot in the world group
  pull = { t0: performance.now(), k: 0, from: planet.position.clone(), to: new THREE.Vector3(-p.x, 0, -p.z), done: false };
  frozen = true; if (Snd.dash) Snd.dash(); vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff });
  const skip = () => { if (pull && !pull.done) { pull.done = true; pullGo(); } };
  setTimeout(() => { addEventListener("pointerdown", skip, { once: true }); addEventListener("keydown", skip, { once: true }); }, 0); // not the tap or key that opened it
}
function stepPull() {
  const k = Math.min(1, (performance.now() - pull.t0) / PULL_MS), e = k * k * (3 - 2 * k); pull.k = e;
  planet.position.lerpVectors(pull.from, pull.to, e * 0.85);
  player.scale.setScalar(Math.max(0.05, 1 - 0.95 * e * e)); player.position.y = hop + e * 0.9; if (avatar) avatar.obj.rotation.y = facing + e * e * Math.PI * 6;
  tpGlow.visible = true; tpGlow.material.opacity = e; tpGlow.scale.setScalar(1.2 + 3 * e);
  tpFlash.style.opacity = String(THREE.MathUtils.smoothstep(k, 0.35, 0.95));
  if (k >= 1 && !pull.done) { pull.done = true; pullGo(); }
}
addEventListener("pageshow", (e) => { if (!e.persisted || !pull) return; planet.position.copy(pull.from); pull = null; player.scale.set(1, 1, 1); tpGlow.visible = false; tpFlash.style.opacity = ""; frozen = false; });
const tmpTr = new THREE.Vector3();
// walking up to a building: it gives a small springy nod, as if the door just opened for you
function greet(g) {
  if (g.userData.greeting) return; g.userData.greeting = true; const y0 = g.scale.y, x0 = g.scale.x, t0 = performance.now();
  const off = st.on(() => { const k = Math.min(1, (performance.now() - t0) / 520), e = Math.sin(k * Math.PI) * (1 - k * 0.5); g.scale.y = y0 * (1 + e * 0.06); g.scale.x = g.scale.z = x0 * (1 - e * 0.025); if (k >= 1) { g.scale.y = y0; g.scale.x = g.scale.z = x0; g.userData.greeting = false; off(); } });
}
// a critical hit slows the world for a beat; the third hit of a combo punches the camera in
let slowUntil = 0, punch = 0, stopUntil = 0, prevSpeed = 0;
// a hit stops the world for a few frames (heavier blows longer) and nudges the camera along the blow
const hitstop = (ms = 45) => { if (reduce) return; stopUntil = Math.max(stopUntil, performance.now() + Math.min(120, ms)); };
const camKick = new THREE.Vector3(); const kickCam = (dir, k = 0.08) => { if (reduce || !dir) return; camKick.x += dir.x * k; camKick.z += dir.z * k; if (camKick.length() > 0.35) camKick.setLength(0.35); };
const slowmo = (ms = 170) => { if (reduce) return; slowUntil = Math.max(slowUntil, performance.now() + ms); replay(document.body, "wc-crit"); };
st.on((dt0, t) => {
  const now0 = performance.now(), dt = now0 < stopUntil ? dt0 * 0.04 : now0 < slowUntil ? dt0 * 0.3 : dt0;
  punch = Math.max(0, punch - dt0 * 3.2);
  padTick(dt0);
  step(dt); lookAround(dt); ripples(dt);
  spins.forEach((f) => f(dt, t));
  smokes.forEach((f) => f(dt));
  moveScammers(t);
  planet.updateMatrixWorld(true);
  if (avatar) {
    // pushing off from a standstill: a little squash and a puff of dust at the feet
    if (grounded && !boarding && speedNow > 9 && prevSpeed < 3 && !reduce) { if (avatar.land) avatar.land(0.45); parts.emit({ at: new THREE.Vector3(-planet.position.x, 0.15, -planet.position.z), kind: "smoke", n: 6, speed: 1.6, up: 0.6, size: 0.7, life: 0.7, grav: -0.5, drag: 2, color: 0xb8b0a0, jitter: 0.4 }); }
    prevSpeed = speedNow;
    // lean into a run and into turns
    const turn = angLerp(0, facing - (avatar.lastFacing ?? facing), 1) / Math.max(dt, 1e-3); avatar.lastFacing = facing; turnNow = turn;
    const inner = avatar.obj.children[0], fwdLean = skidT > 0 ? -0.26 : grounded && !boarding ? Math.min(1, speedNow / 12.5) * 0.16 : 0; // a skid leans back
    if (avatar.lean) avatar.lean(fwdLean, THREE.MathUtils.clamp(-turn * 0.04, -0.22, 0.22) * Math.min(1, speedNow / 6)); // the ARC Bot leans in its own pose
    else if (inner && !avatar.bot) { inner.rotation.x = THREE.MathUtils.lerp(inner.rotation.x, fwdLean, 0.15); inner.rotation.z = THREE.MathUtils.lerp(inner.rotation.z, THREE.MathUtils.clamp(-turn * 0.04, -0.22, 0.22) * Math.min(1, speedNow / 6), 0.12); }
    if (speedNow > 1 && !wheel.hidden) wheel.hidden = true;
    speedLines.style.opacity = String(THREE.MathUtils.clamp((speedNow - 13) / 8, 0, 0.9));
    // standing still for a while: a look round, now and then
    const still = grounded && !boarding && speedNow < 0.3 && !frozen && !document.body.classList.contains("wc-fight");
    idleT = still ? idleT + dt : 0; let lookOff = 0;
    // away from the keys (25 s with no input at all): sit down, the camera slowly circles; any input and it's back
    const afkNow = still && mode === "hub" && !photo && now0 - Math.max(lastInput, actAt) > 25000;
    if (afkNow !== afk) { afk = afkNow; if (afk) afkYaw = camYaw; else if (!reduce) camYaw = afkYaw; }
    if (afk) { idleT = 0; if (!reduce) camYaw += dt0 * 0.1; }
    if (idleT > idleNext) { const k = (idleT - idleNext) / 3.4; if (k >= 1) { idleT = 0; idleNext = 8 + Math.random() * 7; } else if (!reduce) lookOff = Math.sin(k * Math.PI * 2) * Math.sin(k * Math.PI) * 0.55; }
    if (danceT > 0) { danceT = Math.max(0, danceT - dt); lookOff += (1 - danceT / 2.4) * Math.PI * 4; if (grounded && danceT > 0.4 && Math.floor(danceT * 2.5) !== Math.floor((danceT + dt) * 2.5)) { vy = 3.2; grounded = false; } }
    if (trickT > 0) { trickT = Math.max(0, trickT - dt); const k = 1 - trickT / 0.55; lookOff += Math.PI * 2 * k * k * (3 - 2 * k); } // the board trick: one eased turn
    avatar.obj.rotation.y = facing + lookOff;
    const headJ = avatar.headJ === undefined ? (avatar.headJ = avatar.obj.getObjectByName("head") || null) : avatar.headJ;
    if (headJ) headJ.rotation.y -= headYaw; // take off last frame's turn before the animation runs (it may or may not set the head)
    if (avatar.bot) avatar.update(dt, t, Math.min(1, speedNow / 8), 0);
    else {
      avatar.update(dt, t);
      const want = boarding ? "idle" : !grounded ? (vy > 0 ? "jump" : "fall") : speedNow > 9 ? "sprint" : speedNow > 0.6 ? "walk" : afk ? "sit" : "idle"; // a rig with no sit keeps its idle
      if (combat && combat.vitals().down) { /* lying down until a revive or a respawn */ }
      else if (!avatar.busy() || (grounded && want !== "idle" && !boarding)) { if (want !== "jump") avatar.play(want, { speed: want === "walk" ? Math.max(0.8, speedNow / 6.5) : 1 }); animState = want; }
      // b-r2: standing about, now and then a wave (every 18–28 s after the first 10 s still); a friend coming within 7 m:
      // a wave for them (once every two minutes each)
      waveT = want === "idle" && !frozen && mode === "hub" ? waveT + dt : 0;
      if (waveT > 10 && !avatar.busy() && t > idleWaveAt) { idleWaveAt = t + 18 + Math.random() * 10; avatar.play("emote-yes", { once: true }); }
    }
  }
  const friendWaved = new Map();
setInterval(() => { try {
  if (!avatar || avatar.bot || !ghosts || mode !== "hub" || frozen || !grounded || avatar.busy()) return;
  const fw = new Set([...(chatUI && chatUI.friendWs ? chatUI.friendWs() : []), ...partyWs()]); if (!fw.size) return; const me = here(new THREE.Vector3()), now = Date.now();
  const g = ghosts.named().find((x) => fw.has(String(x.wallet).toLowerCase()) && Math.hypot(x.x - me.x, x.z - me.z) < 7 && now - (friendWaved.get(x.wallet) || 0) > 120e3);
  if (g) { friendWaved.set(g.wallet, now); avatar.play("emote-yes", { once: true }); waveT = 0; }
} catch { /* the next look */ } }, 2000);
// your head turns toward who's close (ARCIA, the walking bots, a scammer coming at you): within 7 m and in front,
  // never past a shoulder
  if (avatar && avatar.headJ) {
    let want = 0;
    if (!reduce && mode === "hub" && !photo) {
      const me = here(tmpLook), body = avatar.obj.rotation.y; let best = 49;
      const consider = (x, z) => { const dx = x - me.x, dz = z - me.z, d2 = dx * dx + dz * dz; if (d2 < 0.5 || d2 > best) return; let a = Math.atan2(dx, dz) - body; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > 1.7) return; best = d2; want = THREE.MathUtils.clamp(a, -0.85, 0.85); };
      if (npc) consider(npc.position.x, npc.position.z);
      for (const f of folk) consider(f.g.position.x, f.g.position.z);
      if (combat) for (const m of combat.mobsRaw()) if (!m.dead) consider(m.g.position.x, m.g.position.z);
    }
    headYaw += (want - headYaw) * Math.min(1, dt * 5); avatar.headJ.rotation.y += headYaw;
  }
  // the board banks into a turn (as much as you turn, eased) and spins with a trick; the rover's body rolls out of it
  if (boarding) { const ro = rideObj(); ro.userData.update(t, speedNow, ride === "jet" ? (jetHigh ? 1 : 0.5) : 0); ro.rotation.order = "YXZ"; ro.rotation.y = avatar ? avatar.obj.rotation.y : facing;
    const sp = Math.min(1, speedNow / 8), want = ride === "board" ? THREE.MathUtils.clamp(-turnNow * 0.06, -0.38, 0.38) * sp : ride === "rover" ? THREE.MathUtils.clamp(turnNow * 0.03, -0.12, 0.12) * sp : 0;
    ro.rotation.z += (want - ro.rotation.z) * (1 - Math.exp(-dt * 7)); }
  if (npc && (npcT += dt) > 6) { npcT = 0; const lines = ["Hi! I'm ARCIA. Ask me anything.", "Scan a token before you buy it.", "A real airdrop never asks you to pay.", "Check the LP lock before you ape."]; npc.userData.line = (npc.userData.line + 1) % lines.length; npc.remove(npc.userData.bub); npc.userData.bub = K.bubble(T(lines[npc.userData.line])); npc.add(npc.userData.bub); if (labels) labels.dirty = true; if (Math.random() < 0.5) npc.userData.ac.play("emote-yes", { once: true }); }
  if (npc) npc.userData.ac.update(dt, t);
  if (stage && mode === "hub") stage.tick(dt, t);
  if (mode === "hub" && folk.length) for (const f of folk) {
    // b-st3: walk past one and it stops to wave at you (once in a while each)
    if (f.wait <= 0 && t > (f.greet || 0)) { const px = -planet.position.x, pz = -planet.position.z, fx = f.g.position.x, fz = f.g.position.z; if ((fx - px) ** 2 + (fz - pz) ** 2 < 12) { f.greet = t + 25; f.wave = true; f.sit = false; f.wait = 2.4; f.face = Math.atan2(px - fx, pz - fz); } }
    const want = f.wait > 0 ? (f.sit ? "sit" : f.wave ? "emote-yes" : "idle") : "walk";
    if (f.wait > 0) { f.wait -= dt; if (f.wait <= 0) { f.walkT = 8 + Math.random() * 12; f.wave = false; f.sit = false; } }
    else { f.a += (f.dir * f.sp * dt) / f.r; f.walkT -= dt; if (f.walkT <= 0) { const r = Math.random(); f.sit = r < 0.25; f.wave = !f.sit && r < 0.5; f.wait = f.sit ? 6 + Math.random() * 6 : 2.5 + Math.random() * 4; } } // now and then one sits down for a while
    if (want !== f.anim) { f.anim = want; try { f.c.play(want, want === "emote-yes" ? { once: true } : {}); } catch { /* no such clip */ } }
    const x = Math.sin(f.a) * f.r, z = -Math.cos(f.a) * f.r; f.g.position.set(x, 0, z);
    f.g.rotation.y = f.wave && f.wait > 0 && f.face != null ? f.face : Math.atan2(Math.cos(f.a) * f.dir, Math.sin(f.a) * f.dir); // facing along the ring (or you, while it waves)
    if (f.c.update && !f.c.mixer) f.c.update(dt, t); /* an ARC Bot's mixer already steps it */
  }
  if (pull) stepPull();
  tickQuantum(t);
  for (let i = rockets.length - 1; i >= 0; i--) if (!rockets[i](dt)) rockets.splice(i, 1);
  if (aurora.visible) aurora.userData.update(dt, t);
  if (fireflies.visible && mode === "hub") fireflies.userData.update(t);
  if (rain.visible) rain.userData.update(dt, at);
  clouds.userData.update(dt);
  island.tick(dt, t);
  if (combat) combat.tick(dt, t);
  if (pet) pet.tick(dt, t, mode === "hub" && !introOn && !flying);
  if (raid) raid.tick(dt, t);
  Snd.scene(mode !== "hub" || introOn ? "" : raid && raid.inside() ? "raid" : (combat && combat.zone() && combat.zone().id) || "");
  music.set(mode !== "hub" || introOn || !combat ? "calm" : (raid && raid.inside()) || combat.bossNear(40) ? "boss" : combat.zone() ? "hunt" : "calm");
  if (ghosts) ghosts.tick(dt, t);
  if (dinoTown3d) dinoTown3d.tick(dt);
  if (agentDim) agentDim.tick(dt, t);
  if (pumpKings) { try { pumpKings.tick(dt, t); } catch (e) { console.warn("pumpkin kings", e); pumpKings = null; } }
  if (knockV.lengthSq() > 0.01) { const v = knockV.length(); tmp2.copy(knockV).divideScalar(v); tryMove(tmp2, v * dt); knockV.multiplyScalar(Math.max(0, 1 - dt * 6)); }
  trail.update(boarding && !frozen, here(tmpTr), speedNow);
  if (P.style.trail === "trail-rainbow" && trail.mesh.visible) trail.mat.uniforms.c.value.setHSL((t * 0.25) % 1, 0.9, 0.6);
  // an arch right in front of the camera would fill the screen: it steps aside
  arches.forEach((a) => { a.getWorldPosition(tmpTr); a.visible = tmpTr.distanceTo(cam.position) > 7; }); // the AC Defense arena keeps the plaza arches
  if (mode === "island" && island.building() && hoverXY && !look && (hoverT += dt) > 0.12) { hoverT = 0; island.hover(hoverXY.x, hoverXY.y); }
  const n = nearest();
  if ((n && n.g) !== (near && near.g)) { near = n; paintPrompt(); if (n && n.g && n.spec && !reduce) greet(n.g); if (n && n.kind === "npc" && !P.visited.includes("npc")) { P.visited.push("npc"); save(); checkQuests(); } }
  scamCheck(dt);
  // animation LOD (b404): what's beyond 26 m of the camera steps its animation every third frame (the time adds up,
  // so it keeps its pace), what's near steps every frame
  // b441: off screen (or hidden) every 6th frame, past 60 m every 8th
  { const cp = st.camera.position; mixLod = (mixLod + 1) % 24; camFr.setFromProjectionMatrix(camFrM.multiplyMatrices(st.camera.projectionMatrix, st.camera.matrixWorldInverse));
    for (const m of mixers) { const o = m.getRoot && m.getRoot(); if (o && o.getWorldPosition) { o.getWorldPosition(mixV); const d2 = mixV.distanceToSquared(cp); camSph.center.copy(mixV); const every = d2 > 3600 ? 8 : !camFr.intersectsSphere(camSph) ? 6 : d2 > 676 ? 3 : 1; if (every > 1) { m._acc = (m._acc || 0) + dt; if (mixLod % every) continue; m.update(Math.min(m._acc, 0.5)); m._acc = 0; continue; } } m.update(dt + (m._acc || 0)); m._acc = 0; } }
  fadeLabels(dt);
  pickCards();
  lockedCheck(dt);
  if ((miniT += dt) > (coarse ? 0.14 : 0.1)) { miniT = 0; drawMini(); } // b413: 7–10 times a second (it was 12)
  paintMarker(); paintFootGuide();
  watchFps(dt);
  if (introOn) return; // the dive drives the camera
  // camera: behind and above the player, orbiting with camYaw / camPitch, wider when running; build mode sits higher
  camDist += (camGoal - camDist) * (1 - Math.exp(-dt0 * 10)); // zoom eases toward where the wheel/pinch put it
  const bz = mode === "island" && island.building() ? 1.55 : 1;
  // indoors on an island (the roof overhead already hides): the camera rises over the walls and looks down into the room,
  // instead of being pushed right behind the character by the walls (players: "my character fills the screen inside")
  inK += ((mode === "island" && !island.building() && island.indoor && island.indoor() ? 1 : 0) - inK) * (1 - Math.exp(-dt0 * 4));
  // locked on: the camera eases round so the target (and its wind-up ring) stays in view, unless you're steering it
  if (mode === "hub" && combat && combat.lockAt && !look && !photo && !frozen && performance.now() - lastLook > 2500 && combat.lockAt(lockV)) { const dx = lockV.x + planet.position.x - at.x, dz = lockV.z + planet.position.z - at.z; if (dx * dx + dz * dz > 2.25) camYaw = angLerp(camYaw, Math.atan2(dx, dz) + Math.PI, Math.min(1, dt * (reduce ? 1.2 : 3))); }
  base.set(0, 5.2 + camPitch * 6 + inK * 7, 9.6 * (1 - inK * 0.5)).multiplyScalar(camDist * camZoom * bz * (landNow === "ad" ? 0.78 : 1) /* (Nexus City: a little closer, among its towers) */ * (1 - Math.sin(Math.min(1, punch) * Math.PI) * 0.07)).applyAxisAngle(Y, camYaw);
  camPos.copy(base).add(at); camPos.y += (hop - at.y) * 0.6;
  if (!photo && inK < 0.5 && (colT += dt) > 0.08) { colT = 0; camCollide(camPos); }
  else if (inK >= 0.5) camFit += (1 - camFit) * 0.1; // over the walls nothing is in the way: the pulled-in distance lets go
  camPos.sub(at).multiplyScalar(photo ? 1 : camFit).add(at);
  if (camKick.lengthSq() > 1e-6) { camPos.add(camKick); camKick.multiplyScalar(Math.exp(-dt0 * 14)); }
  if (shake > 0 && reduce) shake = 0;
  // shake: a smooth rattle that dies away (not a new random jump every frame)
  if (shake > 0) { shake = Math.max(0, shake - dt0); shakeT += dt0; // real time: hit-stop doesn't stretch it
    const a = shake * 0.6; camPos.x += (Math.sin(shakeT * 47) + Math.sin(shakeT * 83) * 0.5) * a; camPos.y += (Math.sin(shakeT * 61 + 1.3) + Math.sin(shakeT * 97) * 0.5) * a; }
  if (mode === "hub") camPos.y = Math.max(camPos.y, 0.6); // never under the ground
  camLook.set(-Math.sin(camYaw) * 2.6, 1.4 + (hop - at.y) * 0.5, -Math.cos(camYaw) * 2.6).add(at);
  const landing = performance.now() < landUntil;
  cam.position.lerp(camPos, 1 - Math.exp(-dt * (landing ? 2.4 : 10)));
  // the point it looks at follows a touch behind, so steps, hops and landings don't jolt the picture
  if (!lookInit) { camLookS.copy(camLook); lookInit = true; } camLookS.lerp(camLook, 1 - Math.exp(-dt * (landing ? 3 : 14))); cam.lookAt(camLookS);
  // speed widens the view: a little at a run, more on the board and the jetpack (and a kick as a sprint starts)
  const sk = THREE.MathUtils.smoothstep(speedNow, 2, 22), kick = Math.max(0, speedNow - lastSpeed) * 0.35; lastSpeed = THREE.MathUtils.lerp(lastSpeed, speedNow, 1 - Math.exp(-dt * 3));
  const fov = 55 + sk * 11 + Math.min(3, kick) + (jetOn() && jetHigh ? 2 : 0) + (pull ? pull.k * 22 : 0); // the portal pulls the view wide
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.lerp(cam.fov, fov, 1 - Math.exp(-dt * (fov > cam.fov ? 6 : 3))); cam.updateProjectionMatrix(); }
});

// ---------------- the dive: space, the round planet, down through the clouds onto the ground ----------------
async function dive() {
  if (reduce || new URLSearchParams(location.search).has("nointro")) return;
  // from the home gate (arc-gate.js marks it): it already flew down to the robot, so no second trip out to space
  let fromGate = false; try { const g = Number(sessionStorage.getItem("arc.gate.dove")) || 0; sessionStorage.removeItem("arc.gate.dove"); fromGate = Date.now() - g < 90e3; } catch { /* private mode */ }
  if (fromGate) {
    introOn = true; frozen = true; document.body.classList.add("wp-intro");
    cam.position.set(0, 46, 20); cam.lookAt(0, 0, -4); landUntil = performance.now() + 2200;
    await sleep(60); introOn = false; document.body.classList.remove("wp-intro");
    await sleep(1200); frozen = false; return;
  }
  const veil = $("wp-veil"), fog = st.scene.fog, P0 = new THREE.Vector3(0, 52, 112), P1 = new THREE.Vector3(0, 32 + 2.5, 2.5), L0 = new THREE.Vector3(0, 4, 0), L1 = new THREE.Vector3(0, 32, -7);
  introOn = true; frozen = true; document.body.classList.add("wp-intro");
  planet.visible = false; sky.visible = false; halo.visible = false; player.visible = false;
  st.scene.fog = null; st.scene.background = new THREE.Color(0x02040a); stars.visible = true; stars.material.opacity = 0.9;
  intro.visible = true; cam.position.copy(P0); cam.lookAt(L0);
  let skip = false; const stop = () => { skip = true; };
  addEventListener("keydown", stop, { once: true }); cv.addEventListener("pointerdown", stop, { once: true }); $("wp-intro-skip").addEventListener("click", stop, { once: true });
  const t0 = performance.now(), MS = 2600, look = new THREE.Vector3();
  await new Promise((res) => {
    const off = st.on((dt) => {
      const k = Math.min(1, (performance.now() - t0) / MS), e = k * k * k; // speeding up as it falls
      intro.userData.pl.rotation.y += dt * 0.12 * (1 - k);
      cam.position.lerpVectors(P0, P1, e); look.lerpVectors(L0, L1, Math.min(1, k * 1.4)); cam.lookAt(look);
      veil.style.opacity = String(THREE.MathUtils.smoothstep(k, 0.68, 0.98));
      if (k >= 1 || skip) { off(); res(); }
    });
  });
  veil.style.opacity = "1";
  intro.visible = false; st.scene.remove(intro);
  planet.visible = true; sky.visible = true; halo.visible = true; player.visible = true; st.scene.fog = fog; st.scene.background = null; nightK = -1; dayNight();
  // land: the camera comes down from above the clouds to its place behind the player
  cam.position.set(0, 64, 26); cam.lookAt(0, 0, -4); landUntil = performance.now() + (skip ? 700 : 1700);
  introOn = false; document.body.classList.remove("wp-intro");
  requestAnimationFrame(() => { veil.style.opacity = "0"; });
  await sleep(skip ? 300 : 900);
  frozen = false;
}

// ---------------- start ----------------
dailyState(); makeMeadow(); dayNight(); worldReady = true; if (st.quality.coarse) trimCasters(); // phones: little things stop casting sun shadows
// b442: the minimap's ground drawn behind the loading screen (it was 6 s after it lifted, on the plaza: the world drawn
// once more from above and read back, a stall). If the town wasn't in yet, once more when it is.
const bakeNow = () => { if (mode === "hub") farCull.all(bakeMiniMap); };
if (town.length) bakeNow(); else setTimeout(() => { if (window.requestIdleCallback) requestIdleCallback(bakeNow, { timeout: 4000 }); else bakeNow(); }, 6000);
loadbar(0.8, TW("Opening the plaza…"));
paintHud(); paintQuests(); paintAcct(); refreshPurse(true); refreshCoins(true); refreshArc(); refreshQuantum(); ping(); setTimeout(resumeSession, 2500);
setTimeout(refreshWelcome, 3500); every(10 * 60e3, refreshWelcome);
// the right edge's tab (world-skin.css .wp-clean-tab): one tap hides the screen's buttons in both worlds, leaving what you
// play with; remembered in this browser
{ const b = document.createElement("button"); b.type = "button"; b.id = "wp-clean"; b.className = "wp-clean-tab"; b.setAttribute("aria-label", T("Show or hide the screen buttons")); b.setAttribute("aria-pressed", "false"); b.setAttribute("data-no-i18n", "");
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const set = (on) => { document.body.classList.toggle("wp-clean", on); b.setAttribute("aria-pressed", String(on)); try { localStorage.setItem("arc.world.clean", on ? "1" : ""); } catch { /* private */ } };
  b.addEventListener("click", () => set(!document.body.classList.contains("wp-clean")));
  document.body.appendChild(b); try { if (localStorage.getItem("arc.world.clean") === "1") set(true); } catch { /* private */ } }
// a first-time tour: a ring round one button at a time and a bubble saying what it does (Next / Got it / Skip);
// each tour shows once in this browser (key). Steps whose button isn't on screen are passed over.
let coachOff = null;
// b-r2: a window you open yourself (a card, the Games list, a gift) comes first: an automatic tour steps aside (shown
// again later) and the day's tips close, so two never stand over each other
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches(".wp-st,.wp-gift-open,.wp-share")) {
  try { if (coachOff && coachOff() === "arc.guide.clean") setTimeout(function again() { autoShow("clean", 40, () => coach("arc.guide.clean", [{ at: "#wp-clean", t: TW("Hide the buttons"), p: TW("Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.") }])); }, 30000);
  document.querySelectorAll(".wp-tips").forEach((e) => e.remove()); tipsUp = false; } catch { /* still loading */ } return; } }).observe(document.body, { childList: true });
function coach(key, steps) {
  if (survOn || survBusy || ringsOn || ringsBusy || pokerOn || pokerBusy || mineOn) return false; // (a game with its own scene: the town's bubbles wait)
  try { if (localStorage.getItem(key)) return false; } catch { return false; }
  const live = steps.filter((st0) => { const e = document.querySelector(st0.at); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!live.length || document.querySelector(".wp-coach")) return false;
  const ring = document.createElement("div"), tip = document.createElement("div"); ring.className = "wp-coach-ring"; tip.className = "wp-coach"; tip.setAttribute("role", "dialog");
  document.body.append(ring, tip); let i = 0;
  const onEsc = (e) => { if (e.key === "Escape" && !(hubEl && !hubEl.hidden)) { /* (the Menu over it closes first) */ e.preventDefault(); e.stopImmediatePropagation(); done(); } };
  addEventListener("keydown", onEsc, true);
  const done = (seen = true) => { coachOff = null; ring.remove(); tip.remove(); removeEventListener("resize", place); removeEventListener("keydown", onEsc, true); if (seen) try { localStorage.setItem(key, "1"); if (live.some((x) => x.at === "#wp-clean")) localStorage.setItem("arc.guide.clean", "1"); } catch { /* private */ } };
  coachOff = () => { done(false); return key; }; // (a window you open yourself puts the tour away, unseen: it comes back later)
  function place() {
    const S0 = live[i], e = document.querySelector(S0.at); if (!e) { done(); return; } const r = e.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    const z = parseFloat(getComputedStyle(tip).zoom) || 1, W0 = innerWidth, H0 = innerHeight, tw = tip.offsetWidth * z, th = tip.offsetHeight * z;
    let x = r.left + r.width / 2 - tw / 2, y = r.bottom + 14; if (y + th > H0 - 8) y = r.top - th - 14; // under it, or above when there's no room
    if (r.left > W0 * 0.6 && r.height > H0 * 0.04 && r.width < W0 * 0.2) { x = r.left - tw - 14; y = r.top + r.height / 2 - th / 2; } // a button on the right edge: beside it
    x = Math.max(8, Math.min(W0 - tw - 8, x)); y = Math.max(8, Math.min(H0 - th - 8, y));
    tip.style.left = x / z + "px"; tip.style.top = y / z + "px";
  }
  function show() {
    const S0 = live[i];
    tip.innerHTML = `<small>${esc(TW("Quick tour"))} · ${i + 1}/${live.length}</small><b>${esc(S0.t)}</b><p>${esc(S0.p)}</p><div><button type="button" class="wp-coach-skip">${esc(TW("Skip"))}</button><button type="button" class="wp-coach-next">${esc(i < live.length - 1 ? TW("Next") : TW("Got it"))}</button></div>`;
    tip.querySelector(".wp-coach-next").onclick = () => { if (++i >= live.length) done(); else show(); };
    tip.querySelector(".wp-coach-skip").onclick = done;
    requestAnimationFrame(place);
  }
  addEventListener("resize", place); show(); return true;
}
// tips on the way in: three short ones, picked at random each visit (a different three next time), how a feature works
const TIPS = [
  ["🎯", "Lock on", "Tap the crosshair button (or Tab) to lock onto the nearest scammer. Your attacks follow it."],
  ["🙈", "Hide the buttons", "The tab on the right edge hides the screen's buttons so you can see more of the world."],
  ["⛏️", "ARCL Mine", "Every rock you break in the mine pays ARCL and XP. A better pickaxe needs fewer hits."],
  ["🎁", "Daily gifts", "Open Gifts every day: new players get seven days of rewards."],
  ["🧪", "Potions", "Tap the bottle buttons (or keys 4 and 5) to drink HP and SP potions in the middle of a fight."],
  ["💨", "Dodge", "Dodge (K) through an attack to take no damage, then hit back."],
  ["🐾", "Pets", "Hatch a pet egg from Pets: a pet adds XP, luck and help in fights."],
  ["🎮", "Game Village", "Coin Jump, AC Defense and more mini-games wait in the Game Village."],
  ["🏝️", "Your island", "Build your own island: place bricks and decorate it your way."],
  ["🌙", "Weekend 2×", "Saturdays and Sundays (Seoul time) give double XP and double ARCL from play."],
  ["🗺️", "The map", "Open the map (M) to find hunting grounds, bosses and portals."],
  ["⚡", "Skills", "A skill opens at level 10. Swap it with the ⇄ on the skill button."],
  ["🛠️", "Craft", "Upgrade and salvage your gear in Craft: stronger gear makes bosses easier."],
];
let tipsUp = false;
// rows: [icon, title, line] (all of them, in order); without rows, three of TIPS at random. o: { kicker, title, icon, cls }
// once a day each (o.day: its own key; Seoul's date)
const tipDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function showTips(rows, o = {}) {
  if (survOn || survBusy || ringsOn || ringsBusy || pokerOn || pokerBusy || tipsUp || document.querySelector(".wp-tips")) return;
  const dk = "arc.tips." + (o.day || "town"); try { if (localStorage.getItem(dk) === tipDay()) return; localStorage.setItem(dk, tipDay()); } catch { /* private: every visit */ }
  tipsUp = true;
  let pick = rows; if (!pick) { const pool = TIPS.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } pick = pool.slice(0, 3); }
  const el = document.createElement("div"); el.className = "wp-tips" + (o.cls ? " " + o.cls : ""); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", TW("Tips"));
  el.innerHTML = `<div class="wp-tips-in"><header><span class="wp-tips-ic" aria-hidden="true">${o.icon || "💡"}</span><div><small>${esc(o.kicker || "ARCIRCLE WORLD")}</small><b>${esc(o.title || TW("Tips for today"))}</b></div></header>
    <ol>${pick.map(([ic, t, p0]) => `<li><span aria-hidden="true">${ic}</span><div><b>${esc(TW(t))}</b><p>${esc(TW(p0))}</p></div></li>`).join("")}</ol>
    <button type="button" class="wp-tips-go">${esc(o.go || TW("Let's play"))}</button></div>`;
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 260); tipsUp = false; };
  el.querySelector(".wp-tips-go").addEventListener("click", close); el.addEventListener("click", (e) => { if (e.target === el) close(); });
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
}
setTimeout(function tryTips() { if (worldReady && P.guideSeen) autoShow("tips", 30, () => showTips()); else setTimeout(tryTips, 4000); }, 12000);
// the hide tab, shown once in town (a while after you arrive, when nothing else is up)
setTimeout(function tryClean() { if (worldReady && P.guideSeen) autoShow("clean", 40, () => coach("arc.guide.clean", [{ at: "#wp-clean", t: TW("Hide the buttons"), p: TW("Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.") }])); else setTimeout(tryClean, 15000); }, 25000);
if (sess()) setTimeout(() => village.load(), 3500); // your village level and blessing
// the way in is one move: the robot is dressed while the loading screen is still up, the first frame you see is the
// start of the dive (never the town first and then a jump back out to space), and from the home gate, which has
// already dived down to the robot, the camera only comes down the last stretch to land behind you
await setAvatar(P.char || "arc-arc"); ensureFootSpot(); // b447: the spot under your feet
loadbar(0.85, TW("Dressing the town…"));
// b443: the town's set dressing (trees, lamps, the districts' props) is placed before the screen lifts, up to 8 s
if (decorOn && decor && decor.townReady) await Promise.race([Promise.resolve(decor.townReady).catch(() => {}), new Promise((r) => setTimeout(r, 8000))]);
try { farCull.prep(); } catch (e) { console.warn("far cull", e); } // (again for what came in since: the fade's shaders made before warm compiles everything)
loadbar(0.9, TW("Waking the scammers…"));
// b442: the scammers and every effect readied behind the loading screen too (combat.warm: copy, prepare and draw each
// model once out of sight). It used to start 4 s after the screen lifted and go on every 0.9 s: the first minute on
// the plaza stuttered. At most 6 s here; anything left (packs that load later) the warm loop below still does.
if (combat && combat.warm) { const w0 = performance.now(); try { while (performance.now() - w0 < 6000 && await combat.warm(st, 6)); } catch { /* the loop below tries again */ } }
loadbar(0.95, TW("Polishing the light…"));
try { await st.warm(4000); } catch (e) { console.warn("warm", e); } // every shader compiled behind the loading screen: no hitch the first time a fight, a skill or a zone shows
loadbar(1);
const landing = dive();
// b440: what arrives after loading (a zone's props, the Game Village, an island, a pet) is compiled in the background as
// soon as it's in the scene, hidden parts too, so its first appearance on screen doesn't stall on shader building
// new things in the scene get their shaders compiled before they're seen — only the objects whose materials are new (it
// used to recompile the whole scene, every hidden land and ground switched on for the call, whenever the count of meshes
// changed: every 2.5 s in a fight or a crowd, a 100–200 ms stall each time)
{ const warmSeen = new WeakSet(); let first = true, busy = false; setInterval(() => {
  if (busy || document.hidden || frozen) return; const fresh = [];
  st.scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isSprite) || !o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; let nw = false; for (const m of ms) if (!warmSeen.has(m)) { warmSeen.add(m); nw = true; } if (nw && fresh.length < 40) fresh.push(o); });
  if (first) { first = false; return; } /* (the loading screen's warm-up compiled these) */ if (!fresh.length) return;
  busy = true; compileHidden(fresh).then(() => { busy = false; }, () => { busy = false; });
}, 2500); }
$("wp-loading").classList.add("done"); fun("ready"); setTimeout(() => { if (sess()) loadCodex().then((c) => c.load()).catch(() => {}); }, 8000); /* the item codex's set bonus and titles, once signed in */
// the most played games' code fetched while the town is quiet, one at a time (entering one then doesn't wait for the
// download); not on data saver or a slow connection, never in a fight; a failure here is only a later download
{ const nc = navigator.connection || {}, slow = nc.saveData || /(^|-)2g|3g/.test(String(nc.effectiveType || ""));
  const pre = [() => import("./world-survivors.js"), () => import("./world-jurassic.js"), () => import("./world-poker.js"), () => import("./world-rings.js")];
  const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 200));
  const next = () => { if (!pre.length) return; if (document.hidden || mode !== "hub" || frozen || document.body.classList.contains("wc-fight")) { setTimeout(next, 8000); return; } idle(() => { const f = pre.shift(); f().catch(() => {}).finally(() => setTimeout(next, 6000)); }); };
  if (!slow && S.quality !== "saver") setTimeout(next, 25000); }
// b-st3: back on another day (this browser was here before, on an earlier Seoul day)
try { const k = "arc.world.funday", d0 = localStorage.getItem(k), d1 = tipDay(); if (d0 && d0 !== d1) { fun("back"); if (P.char) landing.then(() => setTimeout(() => welcomeBack(Math.round((Date.parse(d1) - Date.parse(d0)) / 864e5)), 2200)); } localStorage.setItem(k, d1); } catch { /* private */ }
// weekend 2×: say so once a session, a few seconds in
if (weekend2x()) setTimeout(() => { if (!introOn) toast(TW("Weekend 2×: double XP and double ARCL from play")); else setTimeout(() => toast(TW("Weekend 2×: double XP and double ARCL from play")), 4000); }, 6000);
// a friend's INFINITY RINGS challenge (?rings=<board>&vs=<moves>&by=<name>, world-rings.js share()): to the palace, and
// that very board with their moves to beat; a board that can't be made says so
try { const q = new URLSearchParams(location.search), id = q.get("rings");
  // (a first visit makes a name and sees the intro first: it waits, up to two minutes, until the town is free)
  if (id && /^(\d{1,3}|d:\d{4}-\d\d-\d\d:[0-2]|w:\d{4}-\d\d:[0-6]|e:\d{1,5})$/.test(id)) landing.then(() => { let tries = 0; const go = async () => {
    if (mode !== "hub" || introOn || frozen || flying || ringsBusy || document.querySelector("#wp-make:not([hidden]), #wp-guide:not([hidden]), #wp-auth:not([hidden])")) { if (++tries < 120) setTimeout(go, 1000); return; }
    const e = gv.exitOf("rings"); standAt(e.x, e.z, gv.center); await openRings();
    if (ringsOn && ringsGame && !ringsGame.challenge(id, q.get("vs"), q.get("by"), q.get("w"))) toast(TW("That challenge's board couldn't be found"));
  }; setTimeout(go, 1500); }); } catch { /* a plain visit */ }
// INFINITY MASTER (INFINITY RINGS level 100): a little ∞ of light circling over the hero
let aura = null;
function paintAura() {
  if (!P.badges.includes("infinity-master")) { if (aura) { player.remove(aura); aura = null; } return; }
  if (aura) return;
  aura = new THREE.Group(); const m1 = new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), m2 = m1.clone(); m2.color.setHex(0x2ee0b0);
  [[-0.19, m1], [0.19, m2]].forEach(([x, m]) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 28), m); t.position.x = x; aura.add(t); });
  aura.position.y = 3.75; player.add(aura);
}
spins.push((dt, t) => { if (aura) { aura.rotation.y = t * 1.6; aura.position.y = 3.75 + Math.sin(t * 2) * 0.06; } });
paintAura();
// back from a stale-page reload (staleReload): straight to the Game Village, where the tap was
try { if (sessionStorage.getItem(RESUME) === "gv") { sessionStorage.removeItem(RESUME); landing.then(() => setTimeout(() => { if (mode === "hub" && !introOn && !frozen) goGameVillage(); }, 300)); } } catch { /* private window */ }
// AC Defense's code comes down now, while nothing is happening, so a deploy later can't leave this page without it
setTimeout(() => { const go = () => import("./world-defense.js").catch(() => {}); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 30000 }); else go(); }, 12000);
setTimeout(() => { if (load3d) load3d.dispose(); $("wp-loading").remove(); }, 600);
await landing;
landed = true; actAt = performance.now(); feedQ.splice(0).slice(-4).forEach(([h, c], i) => setTimeout(() => feed(h, c), i * 250));
{ const we = RPG.WEEK_EVENTS && RPG.weekEvent ? RPG.WEEK_EVENTS[RPG.weekEvent()] : null; if (we) setTimeout(() => feed(T("This week: {x} — {y}", { x: `<b>${esc(T(we.name))}</b>`, y: esc(T(we.line)) }), "#ffc861"), 2600); } // this week's event
// b-fm1: a first visit plays first (the character, the controls, the training scammer); the wallet is offered after
// the first knock-out (askSave) and on the "Your first 5 minutes" card, not before anything has happened
// b-st2: you land in a beam of light, and the fountain throws its jets up; a first visit gets a welcome first
try { vfx.teleport(here(), { color: 0x7fe9ff, color2: 0x2f86ff }); if (fountain.userData.burst) fountain.userData.burst(6); } catch { /* fine without */ }
if (!P.char) { welcomeBurst(); setTimeout(() => { if (!P.char && make.hidden) openMake(); }, reduce ? 0 : 1500); }
else { tutorialStep(-1); maybeGuide(); }
refreshPlaza();
// b-st2: on the hour the fountain puts on a show (20 s)
{ let lastHr = -1; every(15000, () => { const d = new Date(); if (d.getMinutes() !== 0 || d.getHours() === lastHr || mode !== "hub") return; lastHr = d.getHours(); try { fountain.userData.burst(20); feed(`⛲ <b>${esc(TW("The fountain's show"))}</b> · ${esc(TW("on the hour, at the plaza"))}`, "#38d8ff"); } catch { /* fine */ } }); }
// a shared island link (/play?isle=0x…): straight to that island once you're in
// news while you play (friends online, stamps on your island) and, once after an update, what's new
setTimeout(() => island.news((h, c) => feed(h, c)), 5000); every(300000, () => { if (mode === "hub") island.news((h, c) => feed(h, c)); });
maybeNew();
setTimeout(() => quests.seasonNotice((h, c) => feed(esc(h), c)), 8000);
setTimeout(async () => { const p = partyUI(), f = p && await p.loadFull(); if (f) quests.bountyNotice((h, c) => feed(esc(h), c), f); }, 12000); // one bounty read: the Log dot, and Sunday's reminder
// a Studio game's share link (/play?sg=<id>): open the Studio and play that game once the town is up
{ const g = String(new URLSearchParams(location.search).get("sg") || ""); if (/^[\w-]{4,40}$/.test(g) && P.char) setTimeout(async () => { if (mode !== "hub" || frozen) return; await openStudio(); const q = new URLSearchParams(location.search); if (studio) studio.playId(g, { vs: Math.max(0, Math.floor(Number(q.get("vs")) || 0)), vsBy: String(q.get("by") || "").slice(0, 16) }); }, 1400); } /* (?vs=&by=: a friend's challenge — their score to beat) */
{ const w = (new URLSearchParams(location.search).get("isle") || "").toLowerCase(); if (/^0x[0-9a-f]{40}$/.test(w) && P.char) setTimeout(() => { if (mode === "hub" && !frozen) goIsland({ visit: w }); }, 900); }
arclShop.refresh().then(() => { arclShop.flushQueue(); if (P.guideSeen && auth.hidden && make.hidden) setTimeout(() => arclShop.maybeDaily(), 900); });
// DINO SOULMATE in town (world-dino.js is Jurassic World's): a chip under the purse row while there's something to do —
// your egg's care open (and how long is left), it's ready to hatch, your first egg waiting, or an egg out on the plains —
// and a browser notification when the site is open in another tab. Tap it: you stand at the Jurassic portal.
// THE OFFICIAL LAUNCH (api/_world-launch.mjs): the launch gift — an Advanced dinosaur egg, five 3× EXP potions (an
// hour each) and 5,000 ARCL, once an account in the launch week (playing before the launch, or level 5) — and the
// potions: a button by the Starter one (🎁 until the gift is taken, then the potions left or the 3× running)
const launchUI = (() => {
  let v = null, el = null, shown = false, busyL = false;
  const fmtN = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  async function look() {
    const s = sess(); try { const r = await fetch("/api/social?world=launch" + (s ? "&wallet=" + encodeURIComponent(String(s.wallet).toLowerCase()) : ""), { cache: "no-store" }); if (r.ok) v = await r.json(); } catch { /* the next look */ }
    if (v && v.xp3) xp3Until = Number(v.xp3.until) || 0; paint();
    tryShow();
  }
  /// the card by itself once a visit, when you're free (another window up: it waits and tries again)
  function tryShow() {
    const s = sess(); if (!(v && v.open && s && v.eligible && !v.claimed) || shown) return;
    autoShow("launch", 10, () => { if (shown || !(v && v.open && sess() && v.eligible && !v.claimed)) return false; shown = true; openCard(); });
  }
  function paint() {
    if (!el) { const st = $("wp-starter-btn"); if (!st) return; el = document.createElement("button"); el.type = "button"; el.className = "wp-btn wp-starter-btn wp-launch-btn"; el.setAttribute("aria-haspopup", "dialog"); el.title = TW("Official launch"); st.parentNode.insertBefore(el, st); el.addEventListener("click", () => { closeAll(); openCard(); }); }
    const s = sess(), on = xp3Until > Date.now(), n = (v && v.xp3 && v.xp3.n) || 0, gift = v && v.open && !v.claimed;
    el.hidden = !(v && (gift || n > 0 || on)); if (el.hidden) return;
    el.innerHTML = gift ? `<span class="wp-st-l">🎁 ${esc(TW("Launch"))}</span>` : on ? `<img class="wp-launch-bi" src="/images/launch/xp3.webp" alt=""><span class="wp-st-l">3×</span><b class="wp-st-boost">${Math.ceil((xp3Until - Date.now()) / 60e3)}m</b>` : `<img class="wp-launch-bi" src="/images/launch/xp3.webp" alt=""><span class="wp-st-l">×${n}</span>`;
    el.classList.toggle("dot", !!(gift && s && v.eligible));
  }
  function openCard() {
    const s = sess(), g = (v && v.gift) || { arcl: 5000, potions: 5, potionMin: 60, xpK: 3 }, n = (v && v.xp3 && v.xp3.n) || 0, on = xp3Until > Date.now();
    const box = document.createElement("div"); box.className = "wp-st wp-launch"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    const status = !v ? TW("Couldn't load the launch gift — try again") : !v.open ? (Date.now() < v.start ? TW("The launch gift opens soon") : TW("The launch week is over")) : !s ? TW("Sign in with your wallet to take it") : v.claimed ? TW("Taken — thank you for playing!") : v.eligible ? "" : TW("Reach level {n} to take it (you're level {l})", { n: v.minLv || 5, l: v.lv || 1 });
    const canTake = v && v.open && s && v.eligible && !v.claimed;
    // b-lc: the owner's launch-card design — the art up top (the logo, ARC, ARCIA and the headline), the three gifts as
    // cards (numbered, each in its colour), the potion row, one gold button; the numbers and words are the game's own
    box.classList.add("wp-launch2");
    setTimeout(() => { const m = box.querySelector(".wl2-art em.mid"); if (!m || reduce) return; const t0 = performance.now(), to = g.arcl; const up = (t) => { const k = Math.min(1, (t - t0) / 1200); m.textContent = fmtN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1 && m.isConnected) requestAnimationFrame(up); }; m.textContent = "0"; requestAnimationFrame(up); }, 650); // (after the gift cards have flipped in)
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
      <div class="wl2-hero"><img src="/images/launch/hero.webp" srcset="/images/launch/hero-640.webp 640w, /images/launch/hero.webp 1024w" sizes="540px" alt="ARCIRCLE WORLD — We're officially live!" width="1024" height="642"><h2 class="wp-sr">${esc(TW("We're officially live!"))}</h2></div>
      <p class="wl2-sub">${esc(TW("Thank you for building this world with us. A launch gift for every player, this week only."))}</p>
      <ol class="wl2-gifts">
        <li class="g1"><header><i>1</i><b>${esc(TW("An Advanced dinosaur egg"))}</b></header><div class="wl2-art"><img src="/images/launch/card-egg.webp" alt="" width="299" height="228"><em>×1</em></div><small>${esc(TW("Care for it 3 days in Jurassic World's Hatchery, then raise it."))}</small></li>
        <li class="g2"><header><i>2</i><b>${esc(TW("3× EXP potions"))}</b></header><div class="wl2-art"><img src="/images/launch/card-xp3.webp" alt="" width="299" height="228"><em>×${g.potions}</em></div><small>${esc(TW("Each one: 3× EXP for {m} minutes. Use them when you like.", { m: g.potionMin }))}</small></li>
        <li class="g3"><header><i>3</i><b>ARCL</b></header><div class="wl2-art"><img src="/images/launch/card-arcl.webp" alt="" width="298" height="228"><em class="mid">${fmtN(g.arcl)}</em></div><small>${esc(TW("Straight into your ARCL balance."))}</small></li>
      </ol>
      ${n > 0 || on ? `<div class="wl2-pot"><span class="wl2-pot-ic"><img src="/images/launch/xp3.webp" alt="" width="52" height="52"><em>×${n}</em></span><div><small>${esc(TW("Launch bonus"))}</small><b>${esc(on ? TW("3× EXP on: {t}", { t: leftOf(xp3Until) }) : TW("No potion running"))}</b></div><button type="button" data-pot ${n > 0 ? "" : "disabled"}>${esc(on ? TW("Add an hour") : TW("Drink one"))}</button></div>` : ""}
      ${status ? `<p class="wl2-status">${esc(status)}</p>` : ""}
      ${canTake ? `<button type="button" class="wl2-claim" data-take><span aria-hidden="true">🎁</span>${esc(TW("Claim all gifts"))}</button>` : ""}
      <p class="wl2-note"><i aria-hidden="true">!</i>${esc(TW("One gift per account during the launch week. New accounts: from level {n}.", { n: (v && v.minLv) || 5 }))}</p></div>`;
    document.body.appendChild(box); frozen = true; keys.clear();
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true); box.querySelector(".wp-st-x").addEventListener("click", close); box.addEventListener("click", (e) => { if (e.target === box) close(); });
    const take = box.querySelector("[data-take]");
    if (take) take.addEventListener("click", async () => { if (busyL) return; busyL = true; take.disabled = true; const s2 = sess(); let r = null; try { r = s2 ? await post({ action: "world-launch-claim", ...s2 }) : null; } catch { r = null; } busyL = false;
      if (!r || !r.ok) { take.disabled = false; toast(TW("Couldn't take the gift: {e}", { e: String((r && r.j && r.j.error) || TW("network")).slice(0, 80) })); return; }
      close(); await giftOpen(TW("Launch gift taken!"), [{ img: "/images/launch/egg.webp", t: TW("An Advanced dinosaur egg") }, { img: "/images/launch/xp3.webp", t: TW("{n} × 3× EXP potions", { n: r.j.potions || g.potions }) }, { img: "/images/launch/arcl.webp", t: fmtN(r.j.arcl || g.arcl) + " ARCL" }]);
      toast(`🎁 <b>${esc(TW("Launch gift taken!"))}</b> ${esc(TW("+{a} ARCL · {n} potions · an Advanced egg in the Hatchery", { a: fmtN(r.j.arcl || g.arcl), n: r.j.potions || g.potions }))}`);
      refreshPurse(true); await look(); dinoTown.look(); setTimeout(() => { if (!document.querySelector(".wp-st")) openCard(); }, 1700); }); // (after the coins have landed)
    const pot = box.querySelector("[data-pot]");
    if (pot) pot.addEventListener("click", async () => { if (busyL) return; busyL = true; pot.disabled = true; const s2 = sess(); let r = null; try { r = s2 ? await post({ action: "world-xp-potion", ...s2 }) : null; } catch { r = null; } busyL = false;
      if (!r || !r.ok) { pot.disabled = false; toast(TW("Couldn't use it: {e}", { e: String((r && r.j && r.j.error) || TW("network")).slice(0, 80) })); return; }
      xp3Until = r.j.until; if (v && v.xp3) { v.xp3.n = r.j.n; v.xp3.until = r.j.until; } if (Snd.level) Snd.level(); toast(`🧪 <b>${esc(TW("3× EXP for an hour!"))}</b> ${esc(leftOf(xp3Until))}`); close(); paint(); });
  }
  setTimeout(look, 7000); setInterval(look, 300e3); setInterval(() => { paint(); tryShow(); }, 15e3);
  return { look, open: openCard, state: () => ({ v, xp3Until }) };
})();
// invite a friend (api/_world-refer.mjs): your link carries your code; a friend who opens it and signs in while new is
// tied to you, and when they reach level 5 you both get 1,000 ARCL and a dinosaur egg (the save that gets them there pays)
// b-gm: a GM rewards a player in $ARCIRCLE, from the GM's own wallet (Rankings → Players → 🎁 Send reward). The wallet
// signs an ordinary transfer; the server notes it once the chain shows it (api/_world-gmreward.mjs), and every player's
// list (Rewards) shows what they were sent, each with its transaction on the explorer and a copy of its link
const gmReward = (() => {
  const EXP = String(CFG.BLOCK_EXPLORER || "https://arc.etherscan.io").replace(/\/$/, ""), TOK = /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "";
  const txUrl = (h) => EXP + "/tx/" + h, short = (w) => w.slice(0, 8) + "…" + w.slice(-6);
  const fmtT = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 4 });
  const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
  /// "12,345.5" → wei (18 decimals), null when it isn't a positive amount
  const toWei = (str) => { const m = /^(\d+)(?:\.(\d{0,18}))?$/.exec(String(str).replace(/[,\s]/g, "")); if (!m) return null; const w = BigInt(m[1]) * 10n ** 18n + BigInt((m[2] || "").padEnd(18, "0") || "0"); return w > 0n ? w : null; };
  const copy = async (t, done) => { try { await navigator.clipboard.writeText(t); toast(done); } catch { toast(t); } };
  function sheet(cls, html) {
    closeAll(); const box = document.createElement("div"); box.className = "wp-st wp-gmr " + cls; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>${html}</div>`;
    document.body.appendChild(box); frozen = true; keys.clear();
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true); box.querySelector(".wp-st-x").addEventListener("click", close); box.addEventListener("click", (e) => { if (e.target === box) close(); });
    return { box, close };
  }
  const txRow = (r) => `<li><div><b>${fmtT(r.tokens)} $ARCIRCLE</b><small>${esc(new Date(r.at).toLocaleString())}${r.note ? " · " + esc(r.note) : ""}</small><code>${esc(r.tx.slice(0, 10) + "…" + r.tx.slice(-8))}</code></div><span><a class="wp-gmr-b" href="${esc(txUrl(r.tx))}" target="_blank" rel="noopener">${esc(TW("Explorer"))} ↗</a><button type="button" class="wp-gmr-b" data-copytx="${esc(r.tx)}">${esc(TW("Copy tx link"))}</button></span></li>`;
  const wire = (box) => box.addEventListener("click", (e) => { const c = e.target.closest("[data-copytx]"); if (c) copy(txUrl(c.dataset.copytx), TW("Transaction link copied")); const w = e.target.closest("[data-copyw]"); if (w) copy(w.dataset.copyw, TW("Wallet address copied")); });
  async function list(w, name) {
    w = String(w).toLowerCase(); const { box } = sheet("list", `<h2>${esc(TW("Rewards"))}</h2><p class="wp-gmr-who"><b>${esc(name || short(w))}</b><code>${esc(w)}</code><button type="button" class="wp-gmr-b" data-copyw="${esc(w)}">${esc(TW("Copy"))}</button></p><div class="wp-gmr-body"><i class="wp-skel" style="width:70%"></i></div>`); wire(box);
    let v = null; try { const r = await fetch("/api/social?world=gm-rewards&wallet=" + w, { cache: "no-store" }); v = r.ok ? await r.json() : null; } catch { v = null; }
    const body = box.querySelector(".wp-gmr-body"); if (!body) return;
    body.innerHTML = !v ? `<p class="wp-st-note">${esc(TW("Couldn't load the rewards — try again"))}</p>` : v.list.length ? `<p class="wp-gmr-total">${esc(TW("Total sent"))} <b>${fmtT(v.tokens)} $ARCIRCLE</b> · ${v.list.length}</p><ul class="wp-gmr-list">${v.list.map(txRow).join("")}</ul>` : `<p class="wp-st-note">${esc(TW("No rewards sent to this player yet."))}</p>`;
  }
  async function send(w, name) {
    w = String(w).toLowerCase(); const s = sess();
    if (!s || !VILL.isGM(String(s.wallet).toLowerCase())) { toast(TW("Only a GM wallet can send rewards")); return; }
    const { box, close } = sheet("send", `<span class="wp-gmr-ic" aria-hidden="true">🎁</span><h2>${esc(TW("Send a reward"))}</h2>
      <p class="wp-gmr-who"><b>${esc(name || short(w))}</b><code>${esc(w)}</code><button type="button" class="wp-gmr-b" data-copyw="${esc(w)}">${esc(TW("Copy"))}</button></p>
      <p class="wp-gmr-bal">${esc(TW("Your $ARCIRCLE"))} <b data-bal><i class="wp-skel" style="width:90px"></i></b></p>
      <label class="wp-gmr-in"><span>${esc(TW("Amount"))}</span><input type="text" inputmode="decimal" data-amt placeholder="0" autocomplete="off"><em>$ARCIRCLE</em></label>
      <div class="wp-gmr-quick">${[1000, 10000, 100000, 1000000].map((n) => `<button type="button" data-q="${n}">${fmtT(n)}</button>`).join("")}</div>
      <label class="wp-gmr-in"><span>${esc(TW("Note (optional)"))}</span><input type="text" data-note maxlength="80" placeholder="${esc(TW("e.g. Weekly event winner"))}"></label>
      <p class="wp-st-status" data-st hidden></p>
      <button type="button" class="wp-st-buy" data-go>${esc(TW("Send from my wallet"))}</button>
      <div class="wp-gmr-done" data-done hidden></div>
      <p class="wp-st-note">${esc(TW("Your wallet sends the tokens directly to this player. The game only notes it, once the transaction is confirmed."))}</p>`); wire(box);
    const $b = (q) => box.querySelector(q), st = (t) => { const e = $b("[data-st]"); if (!e) return; e.hidden = !t; e.textContent = t || ""; };
    // the GM's balance: through the wallet's own node when connected, else the server's public read
    let have = null;
    (async () => { try { const a = addr() || s.wallet; let hex = null;
      try { hex = await rpcRead("eth_call", [{ to: TOK, data: "0x70a08231" + pad(a) }, "latest"]); } catch { const j = await (await fetch("/api/social?world=holding&wallet=" + a)).json(); hex = "0x" + BigInt(j.arc).toString(16); }
      have = BigInt(hex); const e = $b("[data-bal]"); if (e) e.textContent = fmtT(Number(have / 10n ** 14n) / 1e4) + " $ARCIRCLE"; } catch { const e = $b("[data-bal]"); if (e) e.textContent = "—"; } })();
    box.addEventListener("click", (e) => { const q = e.target.closest("[data-q]"); if (q) $b("[data-amt]").value = q.dataset.q; });
    let busyG = false;
    $b("[data-go]").addEventListener("click", async () => {
      if (busyG) return; const wei = toWei($b("[data-amt]").value); if (!wei) { st(TW("Enter an amount")); return; }
      if (have !== null && wei > have) { st(TW("That's more than your $ARCIRCLE")); return; }
      if (!TOK || !AC) { st(TW("Wallet connect isn't available here.")); return; }
      busyG = true; const go = $b("[data-go]"); go.disabled = true; let tx = null;
      try {
        if (!AC.live || !AC.live()) await AC.connect();
        if (String(addr()).toLowerCase() !== String(s.wallet).toLowerCase()) { st(TW("Switch your wallet to the one you signed in with ({w})", { w: short(s.wallet) })); return; }
        const prov = await AC.provider();
        try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
        st(TW("Confirm the transfer in your wallet…"));
        tx = await prov.request({ method: "eth_sendTransaction", params: [{ from: addr(), to: TOK, data: "0xa9059cbb" + pad(w) + pad(wei.toString(16)) }] });
        st(TW("Sent. Waiting for the transaction to confirm…"));
        let r = null; for (let i = 0; i < 40; i++) { await new Promise((ok) => setTimeout(ok, i ? 3000 : 2000)); r = await post({ action: "world-gm-reward-log", ...sess(), to: w, tx, note: $b("[data-note]").value }); if (r.status !== 202 && r.status < 500) break; }
        const ok = r && r.ok, d = $b("[data-done]");
        st(ok ? "" : TW("Sent, but the game couldn't note it yet: {e}", { e: String((r && r.j && r.j.error) || TW("network")).slice(0, 90) }));
        if (d) { d.hidden = false; d.innerHTML = `${ok ? `<b>✅ ${esc(TW("Reward sent: {n} $ARCIRCLE", { n: fmtT(r.j.reward.tokens) }))}</b>` : ""}<code>${esc(tx)}</code><span><a class="wp-gmr-b" href="${esc(txUrl(tx))}" target="_blank" rel="noopener">${esc(TW("Explorer"))} ↗</a><button type="button" class="wp-gmr-b" data-copytx="${esc(tx)}">${esc(TW("Copy tx link"))}</button><button type="button" class="wp-gmr-b" data-seelist>${esc(TW("Rewards"))}</button></span>`;
          const sl = d.querySelector("[data-seelist]"); if (sl) sl.addEventListener("click", () => { close(); list(w, name); }); }
        if (ok) { if (Snd.coin) Snd.coin(); go.hidden = true; }
      } catch (err) { st(tx ? TW("Sent, but the game couldn't note it yet: {e}", { e: "network" }) : err && err.code === 4001 ? TW("Cancelled in the wallet") : TW("The transfer didn't go through: {e}", { e: String((err && err.message) || err).slice(0, 90) })); }
      finally { busyG = false; go.disabled = false; }
    });
  }
  return { send, list };
})();
// b-fx1: a gift opening — the box drops in, shakes, bursts open in a flash of light, and what was inside pops out one
// by one; a tap (or the button) closes it. Resolves when closed. Less motion: the contents straight away
function giftOpen(title, items, kind = "launch") {
  return new Promise((done) => {
    const el = document.createElement("div"); el.className = "wp-gift-open k-" + kind + (reduce ? " now" : ""); el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
    el.innerHTML = `<div class="wp-go-rays"></div>${kind === "invite" ? '<div class="wp-go-hearts">' + "<b>💗</b>".repeat(10) + "</div>" : ""}<img class="wp-go-box" src="/images/world-starter-box.webp" alt=""><div class="wp-go-in"><h2>${esc(title)}</h2><ul>${items.map((x, i) => `<li style="--i:${i}"><img src="${esc(x.img)}" alt=""><b>${esc(x.t)}</b></li>`).join("")}</ul><button type="button" class="wp-st-buy">${esc(TW("Claim"))}</button></div>`;
    document.body.appendChild(el); frozen = true; keys.clear();
    if (!reduce) { setTimeout(() => { el.classList.add("burst"); const f = kind === "invite" ? Snd.win || Snd.level : kind === "daily" ? Snd.coin || Snd.level : Snd.level; if (f) try { f(); } catch { /* quiet */ } }, 1250); setTimeout(() => el.classList.add("show"), 1500); } else el.classList.add("burst", "show");
    let shut = false; const close = () => { if (shut) return; shut = true; el.classList.add("bye"); setTimeout(() => { el.remove(); frozen = false; done(); }, 240); };
    el.addEventListener("click", (e) => { if (el.classList.contains("show") && (e.target.closest("button") || e.target === el)) close(); });
    setTimeout(() => { if (!shut) close(); }, 12000);
  });
}
const referUI = (() => {
  const KEY = "arc.ref"; let v = null, code = "", busyR = false;
  const pend = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
  const drop = () => { try { localStorage.removeItem(KEY); } catch { /* private */ } };
  try { const q = String(new URLSearchParams(location.search).get("ref") || "").toLowerCase(); if (/^[0-9a-z]{8}$/.test(q)) localStorage.setItem(KEY, q); } catch { /* private */ }
  const fmtN = (n) => Number(n).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  async function look() {
    const s = sess(); if (!s) { v = null; return v; }
    try { const r = await fetch("/api/social?world=refer&wallet=" + encodeURIComponent(String(s.wallet).toLowerCase()), { cache: "no-store" }); if (r.ok) { v = await r.json(); if (v.code) code = v.code; } } catch { /* the next look */ }
    return v;
  }
  async function ensureCode() {
    if (code) return code; const s = sess(); if (!s) return "";
    try { const r = await post({ action: "world-refer-code", ...s }); if (r.ok && r.j.code) code = r.j.code; } catch { /* the plain link */ }
    return code;
  }
  /// a friend's invite waiting: tied once you're signed in (a refusal — your own, an old account, already tied — drops it)
  async function bind() {
    const c = pend(), s = sess(); if (!c || !s || busyR) return; if (code && c === code) { drop(); return; }
    busyR = true; let r = null; try { r = await post({ action: "world-refer-bind", ...s, code: c }); } catch { r = null; } busyR = false;
    if (!r) return;
    if (r.ok) { drop(); toast(`💌 <b>${esc(TW("You joined {name}'s invite!", { name: r.j.name || TW("a friend") }))}</b> ${esc(TW("Reach level {n} and you both get {a} ARCL and a dinosaur egg.", { n: (v && v.minLv) || 5, a: fmtN((v && v.reward && v.reward.arcl) || 1000) }))}`); look(); return; }
    if (r.status >= 400 && r.status < 500 && r.status !== 429) drop();
  }
  function paid(j) {
    giftOpen(TW("Invite reward!"), [{ img: "/images/launch/arcl.webp", t: fmtN(j.arcl || 1000) + " ARCL" }, ...(j.egg ? [{ img: "/images/dino-egg.webp", t: TW("A dinosaur egg") }] : [])], "invite");
    toast(`🎉 <b>${esc(TW("Invite reward!"))}</b> ${esc(TW("+{a} ARCL and a dinosaur egg in the Hatchery — your friend got theirs too.", { a: fmtN(j.arcl || 1000) }))}`);
    refreshPurse(true); try { dinoTown.look(); } catch { /* the next look */ }
  }
  const link = () => location.origin + "/play?with=" + myTag + (code ? "&ref=" + code : "");
  async function open() {
    closeAll(); const s = sess();
    const box = document.createElement("div"); box.className = "wp-st wp-refer"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    document.body.appendChild(box); frozen = true; keys.clear();
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    const paint = () => {
      const R = (v && v.reward) || { arcl: 1000 }, minLv = (v && v.minLv) || 5, kids = (v && v.kids) || [], lvMe = (v && v.lv) || level();
      const note = !s ? TW("Sign in with your wallet so your invites count (the link works either way).") : lvMe < ((v && v.inviterLv) || 5) ? TW("Your invites count from level {n} — you're level {l}.", { n: (v && v.inviterLv) || 5, l: lvMe }) : "";
      box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
        <div class="wp-refer-head"><span class="wp-refer-ic">💌</span><h2>${esc(TW("Invite friends"))}</h2><p>${esc(TW("When a friend you invite reaches level {n}, you both get:", { n: minLv }))}</p></div>
        <ul class="wp-st-list"><li><img class="wp-launch-ic" src="/images/launch/arcl.webp" alt="" width="56" height="56"><div><b>${fmtN(R.arcl)} ARCL</b><small>${esc(TW("Each of you, straight into your ARCL balance."))}</small></div></li>
          <li><img class="wp-launch-ic" src="/images/dino-egg.webp" alt="" width="56" height="56"><div><b>${esc(TW("A dinosaur egg"))}</b><small>${esc(TW("Each of you: its grade is rolled like a wild egg's — even Legendary."))}</small></div></li></ul>
        <div class="wp-refer-link"><input readonly value="${esc(link())}" aria-label="${esc(TW("Your invite link"))}"><button type="button" data-copy>${esc(TW("Copy"))}</button></div>
        <div class="wp-share-btns"><button type="button" class="wp-st-buy" data-x>𝕏 ${esc(TW("Share on X"))}</button>${navigator.share ? `<button type="button" data-sh>📤 ${esc(TW("Share"))}</button>` : ""}</div>
        ${note ? `<p class="wp-st-note">${esc(note)}</p>` : ""}
        ${v && v.by ? `<p class="wp-refer-by">${esc(TW("You joined {name}'s invite", { name: v.by.name }))}${v.paidMe ? " · ✅" : " · " + esc(TW("level {n} for the reward", { n: minLv }))}</p>` : ""}
        <h3 class="wp-refer-h">${esc(TW("Friends you invited"))} <small>${v ? `${v.paid || 0} ✅ / ${v.n || 0}` : s ? '<i class="wp-skel" style="width:46px"></i>' : ""}</small></h3>
        ${kids.length ? `<ul class="wp-refer-kids">${kids.map((k) => `<li class="${k.paid ? "paid" : ""}"><b>${esc(k.name)}</b><small>Lv ${k.lv}</small><span>${k.paid ? "✅ " + esc(TW("Rewarded")) : esc(TW("{l} / {n}", { l: Math.min(k.lv, minLv), n: minLv }))}</span><i style="--w:${Math.min(100, (Math.min(k.lv, minLv) / minLv) * 100).toFixed(0)}%"></i></li>`).join("")}</ul>` : `<p class="wp-st-note">${esc(TW("No one yet. Send your link to a friend!"))}</p>`}
        <p class="wp-st-note">${esc(TW("A friend counts when they're new (level 3 or lower) when they join. Rewards for up to {d} friends a day and {c} in all; your friend always gets theirs.", { d: (v && v.day) || 5, c: (v && v.cap) || 30 }))}</p></div>`;
      box.querySelector(".wp-st-x").addEventListener("click", close);
      box.querySelector("[data-copy]").addEventListener("click", async () => { try { await navigator.clipboard.writeText(link()); toast(TW("Invite link copied")); } catch { toast(link()); } });
      const words = TW("Come play ARCIRCLE World with me! 🌍 Raise dinosaurs, play the Game Village, build your island.") + "\n\n♾️ ARCIRCLE WORLD — Play. Build. Battle. Earn.\n$ARCIRCLE #ARCIRCLE #Arc #GameFi";
      box.querySelector("[data-x]").addEventListener("click", () => { const u = "https://x.com/intent/post?text=" + encodeURIComponent(words) + "&url=" + encodeURIComponent(link()); if (!window.open(u, "_blank", "noopener")) location.href = u; });
      const sh = box.querySelector("[data-sh]"); if (sh) sh.addEventListener("click", async () => { try { await navigator.share({ title: "ARCIRCLE World", text: words, url: link() }); } catch { /* closed */ } });
    };
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    paint();
    if (s) { await ensureCode(); await look(); if (box.isConnected) paint(); post({ action: "world-refer-claim", ...s }).then((r) => { if (r && r.ok && r.j.paid && r.j.paid.length) { refreshPurse(true); look().then(() => { if (box.isConnected) paint(); }); } }).catch(() => {}); }
  }
  setTimeout(() => { look().then(bind); }, 9000); setInterval(() => { if (pend() && sess()) look().then(bind); }, 30e3);
  return { open, link, look, paid, ensureCode, bind, state: () => ({ v, code, pend: pend() }) };
})();
// the calm-moment check (autoShow above): every 1.5 s, the most important waiting window opens when nothing else is up
{ const POPS = '.wp-tips,.wp-coach,.wp-st,.wp-cbt,.wp-games,.wp-rew-pop,[role="dialog"],#wp-guide:not([hidden]),#wp-make:not([hidden]),#wp-auth:not([hidden])';
  setInterval(() => {
    if (!autoQ.size) return;
    if (mode !== "hub" || frozen || introOn || jurOn || survOn || pokerOn || ringsOn || mineOn || defenseOn || jumpOn || beatOn || !worldReady || document.hidden) { calmAt = Date.now(); return; }
    if ([...document.querySelectorAll(POPS)].some((d) => !d.hidden && d.getClientRects().length)) { calmAt = Date.now(); return; }
    if (Date.now() - calmAt < 4000) return;
    const [name, e] = [...autoQ].sort((a, b) => a[1].prio - b[1].prio)[0]; autoQ.delete(name);
    try { if (e.open() !== false) calmAt = Date.now(); } catch (err) { console.warn("auto window", name, err); }
  }, 1500); }
// the games, in one list (Menu → Games, the 🎮 button): each with a picture from the game, what it is, what it pays, and
// a button that takes you there (to its door in the Game Village, then in). What each pays is the server's own rules
// (api/_world-shop.mjs EARN); the day's ARCL so far comes from the server.
const GAME_LIST = [
  { id: "jurassic", warp: ["#3dff9a", "#1fae5c", "#c8ff6a"], genre: "Adventure", name: "JURASSIC WORLD", tag: "Raise · Ride · Survive", pay: "Dinosaur eggs, a companion and XP", open: () => openJurassic() },
  { id: "surv", warp: ["#ff8a3a", "#ff4d6d", "#ffd75e"], genre: "Action", name: "SURVIVORS ARENA", tag: "Survive 12 minutes", pay: "Up to 3,000 ARCL a run · 3 paid runs a day", door: "surv", open: () => openSurvivors() },
  { id: "poker", warp: ["#b46cff", "#ffd23a", "#7a4dff"], genre: "Cards", name: "ARCIA POKER LOUNGE", tag: "Hold'em · Blackjack · free chips", pay: "300 ARCL a daily mission (never for winning)", door: "poker", open: () => openPoker() },
  { id: "rings", warp: ["#2ee0b0", "#38d8ff", "#9fe6ff"], genre: "Puzzle", name: "INFINITY RINGS", tag: "Ring puzzles · daily boards", pay: "100 ARCL a new star", door: "rings", open: () => openRings() },
  { id: "mine", warp: ["#ffc23c", "#ff8a3a", "#fff3c2"], genre: "Mining", name: "ARCL MINE", tag: "Mine · Collect", pay: "10–10,000 ARCL a rock", open: () => openMine() },
  { id: "defense", warp: ["#ff6a4d", "#38d8ff", "#ffd75e"], genre: "Strategy", name: "AC DEFENSE", tag: "Tower defence", pay: "5 ARCL a wave · up to 150 a day", door: "defense", open: () => openDefense() },
  { id: "jump", warp: ["#ffc861", "#2f86ff", "#fff3b8"], genre: "Platform", name: "COIN JUMP", tag: "Jump to the crown", pay: "3,000 ARCL at the crown, once a day", door: "jump", open: () => openJump() },
  { id: "beat", warp: ["#ff5ad8", "#7a3cff", "#38d8ff"], genre: "Rhythm", name: "BEAT STOMP", tag: "Rhythm game", pay: "World XP", door: "beat", open: () => openBeat() },
];
const PLAYED = "arc.world.played";
const playedAny = () => { try { return !!localStorage.getItem(PLAYED); } catch { return false; } };
setInterval(() => { if ((jurOn || survOn || pokerOn || ringsOn || mineOn || defenseOn || jumpOn || beatOn) && !playedAny()) try { localStorage.setItem(PLAYED, String(Date.now())); } catch { /* private */ } }, 5000);
function goGame(g) {
  if (mode !== "hub" || introOn || flying) { toast(TW("Go back to the town first")); return; }
  if (jurOn || survOn || pokerOn || ringsOn || mineOn || defenseOn || jumpOn || beatOn) { toast(TW("Leave this game first")); return; }
  closeAll(); frozen = false;
  // b-fx1: a portal swirl round the game's picture, which zooms in, then the game (less motion: none)
  fun("game"); try { if (quests && quests.bump) quests.bump("game"); } catch { /* counted next time */ } if (!reduce) { const w = document.createElement("div"); w.className = "wp-warp"; if (g.warp) g.warp.forEach((c, k) => w.style.setProperty("--w" + (k + 1), c)); w.innerHTML = `<i></i><img src="/images/games/${g.id}-art.webp" alt="">`; document.body.appendChild(w); setTimeout(() => w.classList.add("out"), 900); setTimeout(() => w.remove(), 1400); }
  if (g.door) { const e = gv.exitOf(g.door); standAt(e.x, e.z, gv.center); vfx.teleport(here(), { color: 0xb48cff, color2: 0x38d8ff }); }
  setTimeout(() => { try { const r = g.open(); if (r && r.catch) r.catch((e) => toast(TW("Couldn't start it: {e}", { e: String((e && e.message) || e).slice(0, 60) }))); } catch (e) { toast(TW("Couldn't start it: {e}", { e: String((e && e.message) || e).slice(0, 60) })); } }, reduce ? (g.door ? 350 : 0) : 650);
}
async function openGames() {
  closeAll(); const s = sess(), fmtN = (n) => Number(n || 0).toLocaleString(LANG === "zh" ? "zh-CN" : LANG === "ko" ? "ko-KR" : "en-US");
  const box = document.createElement("div"); box.className = "wp-st wp-games"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
  document.body.appendChild(box); frozen = true; keys.clear();
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  let day = null, friends = null;
  const paint = () => {
    const seen = ghosts ? ghosts.named() : [], on = (friends || []).filter((x) => x.st === "friend" && x.on).slice(0, 6);
    // b-gm: the owner's Games design — a header with ARC pointing at the list, then the eight as picture cards (number,
    // genre, name, what it is, what it pays, Play). No "playing now" counts: the server doesn't count players per game
    // yet, and the list shows nothing it can't back up
    const payHtml = (t) => esc(t).replace(/(\d[\d,.–]*(?:\s?ARCL)?)/, "<b>$1</b>");
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
      <header class="wg-head"><div class="wg-title"><span class="wg-pad" aria-hidden="true"></span><div><h2>${esc(TW("GAMES"))}</h2><p>PLAY. BUILD. BATTLE. <b>EARN.</b></p></div></div>
        <div class="wg-bubble">${esc(TW("Play games, earn rewards, and build your village in ARCIRCLE WORLD!"))}</div><img class="wg-arc" src="/images/games/arc-guide.webp" alt="" width="259" height="246">
        <small class="wg-count">${esc(TW("{n} games in ARCIRCLE World — pick one and go.", { n: GAME_LIST.length }))}</small></header>
      <div class="wp-games-body"><ul class="wp-games-grid wg-grid">${GAME_LIST.map((g, i) => `<li style="--i:${i}"><button type="button" data-game="${g.id}"><span class="wg-art"><img src="/images/games/${g.id}-art.webp" srcset="/images/games/${g.id}-art-300.webp 300w, /images/games/${g.id}-art.webp 468w" sizes="300px" alt="" loading="lazy" width="468" height="139"><i>${i + 1}</i><em>${esc(TW(g.genre))}</em></span><span class="wg-txt"><b>${esc(g.name)}</b><small>${esc(TW(g.tag))}</small></span><span class="wg-foot"><span class="wg-pay"><i aria-hidden="true"></i><span>${payHtml(TW(g.pay))}</span></span><span class="wp-games-go">${esc(TW("Play"))} →</span></span></button></li>`).join("")}</ul>
      <aside class="wp-games-side">
        <section><h3>🎁 ${esc(TW("Today"))}</h3>${s ? (day ? `<p class="wp-games-day"><b>${fmtN(day.today)}</b> / ${fmtN(day.cap)} ARCL</p><i class="wp-games-bar"><u style="width:${Math.min(100, (day.today / Math.max(1, day.cap)) * 100).toFixed(1)}%"></u></i><small>${esc(TW("ARCL you've earned from play today, and the day's limit"))}</small>` : `<p class="wp-games-day"><i class="wp-skel" style="width:60%"></i></p><i class="wp-skel" style="width:100%;height:8px"></i>`) : `<small>${esc(TW("Sign in with your wallet to earn ARCL from the games."))}</small>`}${weekend2x() ? `<p class="wp-games-wk">🌙 ${esc(TW("Weekend 2×: double XP and double ARCL from play"))}</p>` : ""}</section>
        <section><h3>🟢 ${esc(TW("Friends online"))} <small>${friends ? `${on.length} / ${friends.filter((x) => x.st === "friend").length}` : ""}</small></h3>${!s ? `<small>${esc(TW("Sign in to see your friends."))}</small>` : !friends ? `<ul class="wp-games-fr">${'<li><i class="wp-skel" style="width:70%"></i></li>'.repeat(3)}</ul>` : on.length ? `<ul class="wp-games-fr">${on.map((x) => { const g = seen.find((y) => String(y.wallet).toLowerCase() === x.w); return `<li><b>${esc(x.n || x.w.slice(0, 6) + "…")}</b><small>${x.lv ? "Lv " + x.lv : ""}${g ? " · " + esc(TW("in town")) : ""}</small>${g ? `<button type="button" data-near="${esc(x.w)}">${esc(TW("Go there"))}</button>` : ""}</li>`; }).join("")}</ul>` : `<small>${esc(TW("No friends online right now."))}</small>`}
          ${stats && stats.online != null ? `<p class="wp-games-on">${esc(stats.online === 1 ? TW("1 player online now") : TW("{n} players online now", { n: fmtN(stats.online) }))}</p>` : ""}<button type="button" class="wp-games-side-b" data-friends>${esc(TW("Chat and friends"))} →</button></section>
      </aside></div>
      <div class="wp-games-foot"><button type="button" data-start><span>🧭</span><div><b>${esc(TW("New player guide"))}</b><small>${esc(TW("Your first five minutes, step by step"))}</small></div></button><button type="button" data-invite><span>💌</span><div><b>${esc(TW("Invite friends"))}</b><small>${esc(TW("You both get 1,000 ARCL and a dinosaur egg"))}</small></div></button></div></div>`;
  };
  // b-r2: a card leans a little toward the pointer (a mouse; a touch doesn't hover)
  if (matchMedia("(hover:hover)").matches && !reduce) box.addEventListener("pointermove", (e) => { const b = e.target.closest && e.target.closest(".wg-grid button"); box.querySelectorAll(".wg-grid button.tilt").forEach((x) => { if (x !== b) { x.classList.remove("tilt"); x.style.transform = ""; } }); if (!b) return;
    const r = b.getBoundingClientRect(), kx = (e.clientX - r.left) / r.width - 0.5, ky = (e.clientY - r.top) / r.height - 0.5; b.classList.add("tilt"); b.style.transform = `perspective(800px) rotateX(${(-ky * 6).toFixed(2)}deg) rotateY(${(kx * 8).toFixed(2)}deg) translateY(-4px)`; });
  box.addEventListener("click", (e) => {
    if (e.target === box || e.target.closest(".wp-st-x")) { close(); return; }
    const gb = e.target.closest("[data-game]"); if (gb) { const g = GAME_LIST.find((x) => x.id === gb.dataset.game); close(); if (g) goGame(g); return; }
    const nb = e.target.closest("[data-near]"); if (nb) { const g = (ghosts ? ghosts.named() : []).find((y) => String(y.wallet).toLowerCase() === nb.dataset.near); close(); if (g) goNear(g.x, g.z); return; }
    if (e.target.closest("[data-friends]")) { close(); chatUI.show(); return; }
    if (e.target.closest("[data-start]")) { close(); openStart(true); return; }
    if (e.target.closest("[data-invite]")) { close(); referUI.open(); }
  });
  paint();
  if (s) {
    const w = encodeURIComponent(String(s.wallet).toLowerCase());
    await Promise.all([fetch("/api/social?world=arcl&wallet=" + w, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) day = { today: j.today || 0, cap: j.cap || 30000 }; }).catch(() => {}),
      post({ action: "world-friends", ...s }).then((r) => { friends = r && r.ok ? r.j.friends || [] : []; }).catch(() => { friends = []; })]);
    if (box.isConnected) paint();
  }
}
// Getting started (the first five minutes, in one card): your character → the controls → the launch gift → your first
// egg → your first game. Shown once by itself after the controls (instead of that day's tips), and from Games → New
// player guide; each step shows whether it's done and has its button.
const START = "arc.world.start";
function startSteps() {
  const L = launchUI.state().v, D = dinoTown.state(), s = sess(), played = playedAny();
  const gift = L && L.open ? (L.claimed ? "done" : s ? (L.eligible ? "go" : "lv") : "sign") : "none";
  const egg = D ? (D.first ? "go" : "done") : s ? "go" : "sign";
  const steps = [
    { n: 1, ic: "🙂", t: TW("Create your character"), p: TW("Your look and your name — done!"), done: !!P.char },
    { n: 2, ic: "🎮", t: TW("Quick guide"), p: TW("Move, jump, attack and talk. The controls are in Menu → Controls."), done: !!P.guideSeen, b: TW("Controls"), go: () => openGuide() },
    ...(gift === "none" ? [] : [{ n: 3, ic: "🎁", t: TW("Launch rewards"), p: gift === "lv" ? TW("Reach level {n} to take it (you're level {l})", { n: L.minLv || 5, l: L.lv || level() }) : gift === "sign" ? TW("Sign in with your wallet to take it") : TW("An Advanced egg, five 3× EXP potions and 5,000 ARCL"), done: gift === "done", b: gift === "sign" ? TW("Sign in") : TW("Claim"), go: gift === "lv" ? null : () => (gift === "sign" ? openAuth() : launchUI.open()) }]),
    { n: 0, ic: "🥚", t: TW("Your first egg"), p: egg === "sign" ? TW("Sign in with your wallet to raise a dinosaur") : TW("Pick it up in Jurassic World and care for it for 3 days."), done: egg === "done", b: TW("Jurassic World"), go: () => goGame(GAME_LIST[0]) },
    { n: 0, ic: "🕹️", t: TW("Play your first game"), p: TW("Survivors, poker, puzzles, the mine… Try one!"), done: played, b: TW("Games"), go: () => openGames() },
  ].map((x, i) => ({ ...x, n: i + 1 }));
  return steps;
}
function openStart(asked) {
  const steps = startSteps(), left = steps.filter((x) => !x.done).length;
  if (!asked && !left) return false;
  try { localStorage.setItem(START, "1"); localStorage.setItem("arc.tips.town", tipDay()); } catch { /* private */ }
  const box = document.createElement("div"); box.className = "wp-st wp-start"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
  const next = steps.find((x) => !x.done && x.go);
  box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(TW("Close"))}">×</button>
    <h2>${esc(TW("Your first 5 minutes"))}</h2><p class="wp-start-sub">${esc(left ? TW("{n} of {m} done — one smooth path to your first game.", { n: steps.length - left, m: steps.length }) : TW("All done — have fun out there!"))}</p>
    <ol class="wp-start-steps">${steps.map((x) => `<li class="${x.done ? "done" : x === next ? "now" : ""}"><i>${x.done ? "✓" : x.n}</i><span class="wp-start-ic">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.p)}</small></div>${!x.done && x.go ? `<button type="button" data-step="${x.n}">${esc(x.b)}</button>` : ""}</li>`).join("")}</ol>
    ${next ? `<button type="button" class="wp-st-buy" data-step="${next.n}">${esc(next.b)} →</button>` : ""}</div>`;
  document.body.appendChild(box); frozen = true; keys.clear();
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); frozen = false; };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  box.addEventListener("click", (e) => { if (e.target === box || e.target.closest(".wp-st-x")) { close(); return; } const b = e.target.closest("[data-step]"); if (!b) return; const st0 = steps.find((x) => x.n === Number(b.dataset.step)); close(); if (st0 && st0.go) st0.go(); });
}
// once by itself: a new player (under level 10) who hasn't seen it, after the controls; it goes after the launch card
setTimeout(function tryStart() { let seen = true; try { seen = !!localStorage.getItem(START); } catch { /* private */ }
  if (seen || level() >= 10) return; if (worldReady && P.guideSeen && Date.now() - qsAt > 60e3) autoShow("start", 15, () => openStart(false)); else setTimeout(tryStart, 4000); }, 10000); // (b-st3: a minute after the how-to, so the plaza comes first)
// phones: the top bar's reward buttons (Gifts, Launch, Starter) and the Shop fold into one 🎁 button with a list; a 🎮 Games button next to it
const rewUI = (() => {
  const bar = document.querySelector(".wp-hud-btns"), ref = $("wp-gift-btn"); if (!bar || !ref) return { paint() {} };
  const gb = document.createElement("button"); gb.type = "button"; gb.className = "wp-btn wp-lbtn wp-games-btn"; gb.id = "wp-games-btn"; gb.title = TW("Games"); gb.setAttribute("aria-haspopup", "dialog"); gb.innerHTML = `<span class="wp-gb-ic" aria-hidden="true">🎮</span><span class="wp-bl">${esc(TW("Games"))}</span>`;
  const rb = document.createElement("button"); rb.type = "button"; rb.className = "wp-btn wp-lbtn wp-rew-btn"; rb.id = "wp-rew-btn"; rb.title = TW("Rewards"); rb.setAttribute("aria-haspopup", "menu"); rb.innerHTML = `<span class="wp-gb-ic" aria-hidden="true">🎁</span><span class="wp-bl">${esc(TW("Rewards"))}</span>`;
  bar.insertBefore(rb, ref);
  // the dock's first button (b-ui2): Games; Character moves into the Menu on phones (Menu → Inventory)
  { const dock = $("wp-dock"); if (dock) { gb.className = "wp-dk"; gb.id = "wp-dk-games"; gb.innerHTML = `<span data-no-i18n>${esc(TW("Games"))}</span>`; dock.insertBefore(gb, dock.firstChild); } }
  gb.addEventListener("click", () => { closeAll(); openGames(); });
  const items = () => [
    [".wp-launch-btn", "🚀", TW("Official launch")], ["#wp-gift-btn", "🎁", TW("Welcome Week")], ["#wp-starter-btn", "📦", TW("Starter Package")],
    ["#wp-shop-btn", "🛒", TW("ARCL Shop")], ["invite", "💌", TW("Invite friends")],
  ].filter(([sel]) => sel === "invite" || (document.querySelector(sel) && !document.querySelector(sel).hidden));
  const hot = (sel) => { const e = sel !== "invite" && document.querySelector(sel); return !!(e && (e.classList.contains("dot") || e.classList.contains("ready"))); };
  let pop = null;
  const shut = () => { if (pop) { pop.remove(); pop = null; rb.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside, true); } };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !rb.contains(e.target)) shut(); };
  rb.addEventListener("click", () => {
    if (pop) { shut(); return; } closeAll();
    pop = document.createElement("div"); pop.className = "wp-rew-pop"; pop.setAttribute("role", "menu"); pop.setAttribute("data-no-i18n", "");
    pop.innerHTML = items().map(([sel, ic, label]) => `<button type="button" role="menuitem" data-sel="${esc(sel)}"><span>${ic}</span><b>${esc(label)}</b>${hot(sel) ? '<i class="wp-rew-dot"></i>' : ""}</button>`).join("");
    // under the Rewards button, its right edge with the button's: placed in the pop-up's own zoom (1.9 on phones), then
    // measured and nudged once — browsers differ on how zoom maps to CSS pixels (on Samsung Internet it opened mid-screen)
    const r = rb.getBoundingClientRect(); document.body.appendChild(pop); const zp = parseFloat(getComputedStyle(pop).zoom) || 1;
    let top = (r.bottom + 6) / zp, right = Math.max(8, innerWidth - r.right) / zp; pop.style.top = top + "px"; pop.style.right = right + "px";
    { const q = pop.getBoundingClientRect(), k = q.width && pop.offsetWidth ? q.width / pop.offsetWidth : zp; if (k > 0) { top += (r.bottom + 6 - q.top) / k; right += (q.right - r.right) / k; pop.style.top = top + "px"; pop.style.right = Math.max(0, right) + "px"; }
      const q2 = pop.getBoundingClientRect(); if (q2.left < 8) pop.style.right = Math.max(0, right - (8 - q2.left) / k) + "px"; }
    rb.setAttribute("aria-expanded", "true"); document.addEventListener("pointerdown", outside, true);
    pop.addEventListener("click", (e) => { const b = e.target.closest("[data-sel]"); if (!b) return; const sel = b.dataset.sel; shut(); if (sel === "invite") referUI.open(); else { const t = document.querySelector(sel); if (t) t.click(); } });
  });
  const paint = () => { rb.dataset.dot = items().some(([sel]) => hot(sel)) ? "1" : ""; };
  setInterval(paint, 4000); setTimeout(paint, 2500);
  return { paint, shut };
})();
// phones: a pop-up sheet (.wp-st) follows a drag down from its top and closes past 90 px (its own × does the closing,
// so each window's own close runs); a short drag springs back
if (document.documentElement.classList.contains("wp-pcphone")) { let d = null;
  document.addEventListener("pointerdown", (e) => { const card = e.target.closest && e.target.closest(".wp-st .wp-st-card"); if (!card || e.target.closest("button,input,a,select,textarea")) return;
    const z = parseFloat(getComputedStyle(card).zoom) || 1, r = card.getBoundingClientRect(); if (card.scrollTop > 0 || e.clientY - r.top * z > 120 * z) return; d = { card, y: e.clientY, z, dy: 0, id: e.pointerId }; card.closest(".wp-st").classList.add("drag"); }, true);
  addEventListener("pointermove", (e) => { if (!d || e.pointerId !== d.id) return; d.dy = Math.max(0, e.clientY - d.y); d.card.style.transform = `translateY(${d.dy / d.z}px)`; }, true);
  const end = () => { if (!d) return; const { card, dy, z } = d; d = null; const st0 = card.closest(".wp-st"); if (!st0) return; st0.classList.remove("drag");
    if (dy > 90 * Math.min(1, z / 1.6)) { st0.classList.add("out"); card.style.transform = ""; setTimeout(() => { const x = card.querySelector(".wp-st-x"); if (x && card.isConnected) x.click(); else st0.remove(); }, 200); }
    else { card.style.transition = "transform .2s cubic-bezier(.2,.9,.3,1.2)"; card.style.transform = ""; setTimeout(() => { card.style.transition = ""; }, 220); } };
  addEventListener("pointerup", end, true); addEventListener("pointercancel", end, true); }
/// a share card (world-share.js, loaded when first asked): your link with your invite on it
async function bragCard(card) {
  let M; try { M = await import("./world-share.js"); } catch (e) { if (staleReload()) return; toast(TW("Couldn't open the share card")); return; }
  try { await referUI.ensureCode(); } catch { /* the plain link */ }
  try { await M.openShare(card, { T: TW, esc, toast, coarse, link: () => referUI.link() }); } catch (e) { console.warn("share", e); toast(TW("Couldn't open the share card")); }
}
// AGENT DIMENSION (world-agent.js): your AI agent at your side, its talk window and errands; loaded a few seconds in
let agentDim = null, agentFails = 0;
const agentCalm = () => mode === "hub" && !jurOn && !survOn && !ringsOn && !pokerOn && !mineOn && !defenseOn && !jumpOn && !beatOn && !introOn && !document.body.classList.contains("wp-intro");
async function loadAgent() {
  if (agentDim || agentFails > 2) return agentDim;
  try { const M = await import("./world-agent.js"); agentDim = M.createAgentDim({ guide: (k) => openAdGuide(k), THREE, K, planet, here: (v) => here(v), facing: () => facing, ver: VER, inHub: () => mode === "hub" && !introOn && !jurOn, calm: agentCalm,
    T: TW, esc, toast, sess, post, signIn: () => signIn(), purse: (f) => refreshPurse(f), coarse, reduce, low: lowGfx, burst: (c) => burst(c), share: (c) => bragCard(c),
    tx: (to, data) => walletTx(to, data), arcircle: /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "" }); }
  catch (e) { agentFails++; console.warn("agent", e); if (staleReload()) return null; }
  return agentDim;
}
// the Partner Village's windows (world-partner.js): the KAIRO Finance Hub first; loaded the first time one is opened
let partnerUi = null;
async function openPartner(id) {
  let M; try { M = await import("./world-partner.js"); } catch (e) { if (staleReload()) return; toast(TW("Couldn't open it — try again")); return; }
  try { if (!partnerUi) partnerUi = M.createPartners({ T: TW, esc, toast, coarse, reduce, Snd, arcircle: /^0x[0-9a-fA-F]{40}$/.test(CFG.ARCIRCLE_TOKEN || "") ? CFG.ARCIRCLE_TOKEN : "" }); closeAll(); partnerUi.open(id); }
  catch (e) { console.warn("partner", e); toast(TW("Couldn't open it — try again")); }
}
/// stepping through the Citadel's door: a flash of its light, the beam pulses, then the window
function agentWarp() {
  const u = agentGate.userData; if (u.warp) return; u.warp = 1;
  if (!reduce) { const f = document.createElement("div"); f.className = "wag-warp"; document.body.appendChild(f); setTimeout(() => f.remove(), 900); }
  try { if (Snd.perfect) Snd.perfect(); } catch { /* no sound */ }
  setTimeout(async () => { // AD-City 1: those it's open to (GM wallets for now, or ?adcity=1 to try) go into Nexus City; the rest see it being built
    let ok = CITY_TRY; try { if (!ok) { const a = await loadAgent(); ok = !!(a && a.canEnter && await a.canEnter()); } } catch { ok = false; }
    u.warp = 0; if (ok) { cityOk = true; cityGo(); } else openAgent();
  }, reduce ? 0 : 380);
}
// RAID QUEENS (world-raidq.js): the land (LD.LANDS.rq), built the first time you go in through the Citadel
function ensureRq() {
  if (rqL) return Promise.resolve(rqL);
  return rqWait || (rqWait = import("./world-raidq.js").then((M) => {
    rqL = M.makeRaidQueens({ THREE, K, planet, T: TW, esc, toast, Snd, ver: VER, low: lowGfx, reduce, coarse, land: LD.LANDS.rq, combat: () => combat, here: (v) => here(v), level, sess, post,
      addItem: (it) => { rpg.addItem(it); save(); }, refresh: () => refreshPurse(true), itemName: (it) => rpg.itemName(it), parts, shake: (n) => { if (!reduce) shake = Math.max(shake, n); },
      stand: (x, z, c) => standAt(x, z, c), freeze: (on) => { frozen = !!on; keys.clear(); if (!on) { near = null; paintPrompt(); } }, compile: (l) => compileHidden(l), active: () => mode === "hub" && !frozen && !introOn && !flying });
    rqL.M = M; st.on((dt, t) => { try { rqL.tick(dt, t); } catch (e) { console.warn("raid queens", e); } }); if (labels) labels.dirty = true; return rqL; })
    .catch((e) => { rqWait = null; console.warn("raid queens", e); if (!staleReload()) toast(TW("Couldn't open it — try again")); return null; }));
}
function rqWarp() {
  const u = rqGate.userData; if (u.warp) return; u.warp = 1;
  if (!reduce) { const f = document.createElement("div"); f.className = "wag-warp rq-warp"; document.body.appendChild(f); setTimeout(() => f.remove(), 900); }
  try { if (Snd.perfect) Snd.perfect(); } catch { /* no sound */ }
  setTimeout(() => { u.warp = 0; rqGo(); }, reduce ? 0 : 380);
}
async function rqGo(region) {
  if (!rqOn() || frozen || flying || introOn || mode !== "hub") return;
  const r = await ensureRq(); if (!r || frozen || mode !== "hub") return;
  closeAll(); const a = (region && r.gateOf(region)) || r.arrival(); standAt(a.x, a.z, a.c);
  vfx.teleport(here(), { color: 0xff4d8d, color2: 0xffd36a }); if (Snd.dash) Snd.dash(); pullFlash("#ff4d8d"); startSweep(1600);
  landTick(true); paintPrompt();
}
/// Menu → RAID QUEENS: the chronicle (the story pages, the queens now, your clears, a way in)
async function openRaidQueens() { const r = await ensureRq(); if (!r) return; closeAll(); r.chronicle((id) => rqGo(id === "land" ? "" : id)); }
// AD-City 1 (world-adcity.js): NEXUS CITY, AGENT DIMENSION's land (LD.LANDS.ad), built the first time you go in
const CITY_TRY = /[?&]adcity=1/.test(location.search);
let adc = null, adcWait = null, cityOk = CITY_TRY; const camW = new THREE.Vector3();
function ensureCity() {
  if (adc) return Promise.resolve(adc);
  return adcWait || (adcWait = import("./world-adcity.js").then((M) => { adc = M.makeAdCity({ THREE, K, planet, T: TW, low: lowGfx, ver: VER, land: LD.LANDS.ad, demo: /[?&]adwork=demo/.test(location.search), me: () => { try { const s0 = agentDim && agentDim.state(); return s0 && s0.agent ? s0.agent.id : ""; } catch { return ""; } }, onModel: () => { if (labels) labels.dirty = true; try { farCull.rescan(); } catch { /* fine */ } } }); adc.M = M; st.on((dt, t) => { try { adc.tick(dt, t); if (landNow === "ad") adc.seeThrough(st.camera.getWorldPosition(camW), dt); } catch { /* a sign is drawing */ } }); if (labels) labels.dirty = true; try { farCull.rescan(); } catch { /* fine */ } return adc; })
    .catch((e) => { adcWait = null; console.warn("nexus city", e); if (!staleReload()) toast(TW("Couldn't open it — try again")); return null; }));
}
async function cityGo() {
  if (frozen || flying || introOn || mode !== "hub") return;
  const c = await ensureCity(); if (!c || frozen || mode !== "hub") return;
  closeAll(); const a = c.arrival(); standAt(a.x, a.z, a.c);
  let first = false; try { first = !localStorage.getItem("arc.adc.seen"); localStorage.setItem("arc.adc.seen", "1"); } catch { /* not kept */ }
  vfx.teleport(here(), { color: 0x5fd3ff, color2: 0xb48cff }); if (Snd.dash) Snd.dash(); pullFlash("#5fd3ff"); startSweep(first ? 3400 : 1400); // (the first time: a long look round the city)
  if (first && !reduce) setTimeout(() => { try { vfx.teleport(here(), { color: 0xb48cff, color2: 0x7cf5c8 }); } catch { /* fine */ } }, 600);
  landTick(true); paintPrompt();
  if (first) setTimeout(() => cityGuide(true), 3600);
}
/// AD-City 1.5: the city guide — every building and work station, a tap takes you to its door (first visit, the map, the core)
function cityGuide(first) {
  if (!adc || document.querySelector(".adc-card")) return; const M = adc.M;
  const el = document.createElement("div"); el.className = "adc-card adc-guide"; el.setAttribute("role", "dialog");
  const row = (id, name, sub, css, open) => `<button type="button" data-go="${id}" style="--ac:${css}"><i></i><b>${esc(TW(name))}</b><small>${esc(TW(sub))}${open === false ? " · " + esc(TW("Coming soon")) : ""}</small></button>`;
  el.innerHTML = `<div class="adc-in" style="--ac:#5fd3ff"><small>AGENT DIMENSION</small><h3>🌆 ${esc(TW(first ? "Welcome to Nexus City" : "Nexus City"))}</h3>${first ? `<p>${esc(TW("Six buildings for your agent, and the stations where agents work. Tap one to go to its door."))}</p>` : ""}
    <div class="adc-list">${M.BUILDINGS.map((b) => row(b.id, b.name, b.sub, b.css, !!b.open)).join("")}${Object.entries(M.STATIONS).map(([id, st0]) => row(id, st0.name, st0.job, st0.css)).join("")}</div>
    <button type="button" class="adc-ok">${esc(T("OK"))}</button></div>`;
  frozen = true; keys.clear();
  const close = () => { el.remove(); frozen = false; };
  el.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { close(); cityTo(g.dataset.go); return; } if (e.target === el || e.target.closest(".adc-ok")) close(); });
  document.body.appendChild(el);
}
/// straight to a building's (or a station's) door in the city
async function cityTo(id) {
  if (landNow !== "ad") { await cityGo(); if (landNow !== "ad") return; }
  const p = adc && adc.spotOf(id); if (!p) return; standAt(p.x, p.z, p.c); vfx.teleport(here(), { color: 0x5fd3ff, color2: 0x7cf5c8 }); near = null; paintPrompt();
}
// AD-City 3: ARCIRCLE Studio Lite (world-studio.js), loaded the first time the Studio's door is used; the window keeps
// the town still behind it, and a run is its own scene (st.view / st.solo) like the Game Village's games
let studio = null, studioBusy = false;
async function openStudio() {
  if (studioBusy || frozen || mode !== "hub") return; studioBusy = true;
  try {
    if (!studio) { let M; try { M = await import("./world-studio.js"); } catch (e) { if (staleReload()) return; throw e; }
      studio = M.createStudio({ THREE, K, st, T: TW, esc, toast, Snd, reduce, isGM: () => !!(agentDim && agentDim.state() && agentDim.state().gm), guide: (k) => openAdGuide(k), low: lowGfx, saver: S.quality === "saver", coarse, myName: () => P.name || "", rings: () => ensureRings(), sess, post, signIn: () => signIn(),
        makeHero: () => K.makeCharacter(heroOf(P.char || "custom-aron"), VER).then((c) => { if (c && c.setTint) c.setTint(P.tint || 0); return c; }),
        agentName: () => { try { const s0 = agentDim && agentDim.state(); return s0 && s0.agent ? s0.agent.name : ""; } catch { return ""; } },
        onOpen: () => { frozen = true; keys.clear(); near = null; paintPrompt(); }, onClose: () => { frozen = false; near = null; paintPrompt(); } }); }
    closeAll(); studio.open();
  } catch (e) { console.warn("studio", e); frozen = false; toast(TW("Couldn't open it — try again")); }
  finally { studioBusy = false; }
}
/// a Nexus City building: the three that are open lead into the agent window's tabs; the rest show what they'll be
async function cityBuilding(id) {
  // (the owner's call 2026-10-24: AGENT DIMENSION is open to all, ARCIRCLE Studio stays the GMs' for now — others see what it'll be)
  if ((id === "studio" || id === "pick") && !STUDIO_OPEN && !(agentDim && agentDim.state() && agentDim.state().gm) && !CITY_TRY) { if (!adc || document.querySelector(".adc-card")) return; frozen = true; keys.clear(); if (!adc.M.soonCard({ T: TW, esc }, "studio", () => { frozen = false; })) frozen = false; return; }
  if (id === "studio") { openStudio(); return; }
  if (id === "arena") { openArena(); return; }
  if (id === "pick") { const pk = adc && adc.pick(); await openStudio(); if (pk && studio) studio.playId(pk.id); return; }
  if (id === "genesis" || id === "port" || id === "vault") { const a = await loadAgent(); if (!a) { toast(TW("Couldn't open your agent — try again")); return; } closeAll(); a.open(id === "port" ? "jobs" : id === "vault" ? "vault" : undefined); return; }
  if (!adc || document.querySelector(".adc-card")) return; frozen = true; keys.clear();
  try { if (Snd.click) Snd.click(); } catch { /* no sound */ }
  if (!adc.M.soonCard({ T: TW, esc }, id, () => { frozen = false; })) frozen = false;
}
// AD-City 4: the Agent Arena's quiz duels (world-agarena.js), loaded the first time its door is used
let agArena = null, agArenaBusy = false;
async function openArena() {
  if (agArenaBusy || frozen || mode !== "hub") return; agArenaBusy = true;
  try {
    if (!agArena) { let M; try { M = await import("./world-agarena.js"); } catch (e) { if (staleReload()) return; throw e; }
      agArena = M.createAgArena({ T: TW, esc, toast, sess, post, signIn: () => signIn(), Snd, reduce,
        agent: () => { try { const s0 = agentDim && agentDim.state(); return s0 && s0.agent ? { name: s0.agent.name, kind: s0.agent.kind } : null; } catch { return null; } },
        onOpen: () => { frozen = true; keys.clear(); near = null; paintPrompt(); }, onClose: () => { frozen = false; near = null; paintPrompt(); } }); }
    if (!agentDim) await loadAgent().catch(() => null);
    closeAll(); agArena.open();
  } catch (e) { console.warn("agent arena", e); frozen = false; toast(TW("Couldn't open it — try again")); }
  finally { agArenaBusy = false; }
}
// AGENT DIMENSION's opening (the owner's call 2026-10-24): for a week, a signed-in player without an agent sees the owner's
// launch art once a day, when they sign in or come back signed in; its button takes them to the Citadel (the AD Tower)
// and opens the Genesis Lab to buy one
const STUDIO_OPEN = true; /* ARCIRCLE Studio for everyone (the owner, 2026-10-24); the server's STUDIO.OPEN says the same */
/// to the Citadel's door (the AD Tower) with a flash of light, then the agent window (the Genesis Lab when there's none yet)
function goAgentTower() {
  const g = agentGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - (g.x / d) * 16, g.z - (g.z / d) * 16, { x: g.x, z: g.z });
  try { vfx.teleport(here(), { color: 0x5fd3ff, color2: 0xb48cff }); } catch { /* no flash */ } near = null; paintPrompt(); setTimeout(() => openAgent(), 900);
}
every(300, () => { if (!adpDone && adpReady()) adPromo(); if (adpGo && adpReady()) { adpGo = false; goAgentTower(); } }); /* (the card when you step into the town, not over the loading screen: the owner, 2026-10-24) */
/// every boss in the world for the window's Boss pane: live or when next, the way there (2026-10-24, the owner's mock-ups)
function bossList() {
  const now = Date.now(), d = new Date(now), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), at = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fly = (z) => { const a = Math.atan2(-z.x, -z.z); flyTo({ position: new THREE.Vector3(z.x + Math.sin(a) * (z.r + 3), 0, z.z + Math.cos(a) * (z.r + 3)), userData: { radius: 0.5 } }); };
  const out = [];
  { let t = 0, live = false; for (const h of [3, 11]) { let s0 = day0 + h * 3600e3; if (s0 + 30 * 60e3 < now) s0 += 864e5; if (!t || s0 < t) { t = s0; live = s0 <= now; } }
    out.push({ ic: "🦖", color: "#ff7a4a", name: TW("Jurassic boss hour"), where: TW("Jurassic World"), lv: TW("Everyone"), line: TW("The Alpha Raptor and the Thornback Titan, shared HP: hit it 10 times for a hunter's share."), when: live ? TW("On now") : `${at(t)} · ${evLeft(t)}`, rew: TW("XP, materials, ARCL for a boss share"), live, go: () => openJurassic() }); }
  let pk = false; try { pk = !!pumpKings; } catch { /* not built */ }
  if (pk) { const eh = etHour(now), live = eh >= 20 || eh < 5; out.push({ ic: "🎃", color: "#ff9a2e", name: TW("Inferno Jack"), where: TW("Town"), lv: "Lv 15 · 35 · 55 · 75 · 95", line: TW("Five Pumpkin Kings turn into Inferno Jack at night. The top 3 hitters share the reward."), when: live ? TW("On now") : evLeft(now + (20 - eh) * 3600e3), rew: TW("ARCL and a + piece; Lv 95: Jack's Inferno Blade"), live,
    go: () => import("./world-pumpking-data.js").then((m) => { const lv = level(), ks = m.PK.KINGS.filter((x) => x.lv <= lv + 10), kg = ks[ks.length - 1] || m.PK.KINGS[0], h = m.HOMES[kg.id]; standAt(h[0] + 4, h[1] + 4, { x: h[0], z: h[1] }); }).catch(() => openMap()) }); }
  { const nx = (() => { const t = new Date(now + 9 * 3600e3), dd = (8 - t.getUTCDay()) % 7 || 7; return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + dd) - 9 * 3600e3; })();
    out.push({ ic: "🐙", color: "#39ff88", name: TW(SOC.RAID.boss.name), where: TW(SOC.RAID.name), lv: `Lv ${SOC.RAID.lv[0]}+`, line: TW("The weekly raid boss: everyone in town brings it down together."), when: TW("Resets in {t}", { t: evLeft(nx).replace(/^in /, "") }), rew: TW("Raid gear, XP, the Raid Breaker title"), live: false, go: () => fly(SOC.RAID) }); }
  if (rqOn()) { const v = rqL && rqL.view && rqL.view(); // RAID QUEENS: the three queens (world-raidq-data.js), everyone's HP
    for (const [q, reg, ic, col] of [["lysitha", "silver", "🤍", "#9fd4ff"], ["solvira", "golden", "☀️", "#ffd36a"], ["nyxara", "crimson", "🩸", "#ff4d6d"]]) { const st0 = v && v.queens.find((x) => x.id === q), Q = { lysitha: ["CELESTIAL LYSITHA", 100, "Silver Sanctum"], solvira: ["RADIANT SOLVIRA", 200, "Golden Dominion"], nyxara: ["CRIMSON NYXARA", 300, "Crimson Abyss"] }[q];
      out.push({ ic, color: col, name: TW(Q[0]), where: "RAID QUEENS · " + TW(Q[2]), lv: `Lv ${Q[1]}+`, line: TW("A Raid Queen: everyone's HP, three phases. All who deal 3% of her HP share her reward."), when: st0 && st0.down ? evLeft(st0.back || now) : TW("On now"), live: !st0 || !st0.down, go: () => rqGo(reg) }); } }
  const bk = ((rpg && rpg.data().x) || {}).bk || {};
  for (const z of ZN.ZONES) if (z.boss) out.push({ ic: "👑", color: "#" + (z.color || 0x5fd3ff).toString(16).padStart(6, "0"), name: TW(z.boss.name), where: TW(z.name), lv: `Lv ${z.lv[0]}–${z.lv[1]}`, line: TW(z.boss.line || "A hunting ground's boss."), when: TW("Any time"), rew: TW("Gear, XP"), mine: bk[z.id] || 0, live: false, go: () => fly(z) });
  return out;
}
/// what the Character / Forge / Adventure window asks the town for (world-rpg.js hub): places to go, numbers to show
function hubAct(k) {
  if (k.startsWith("skill:")) { if (combat && combat.setSlot) { combat.setSlot(k.slice(6)); return true; } return false; } // (the slot button and the save follow)
  if (k === "arc") return bal.arc;
  if (k === "bosses") return bossList();
  if (k.startsWith("bossgo:")) { const b = bossList()[+k.slice(7)]; if (b && b.go) b.go(); return true; }
  if (k === "today") { const c = itemCodex && itemCodex.state ? itemCodex.state() : null; let chest = false; try { chest = !!arclShop.dailyDone(); } catch { /* not built yet */ } return { pend: quests && quests.pending ? quests.pending() : 0, chest, codex: c && c.data ? `${c.data.n} / ${c.data.all}` : "" }; }
  if (k === "daily") { rpg.hide(); return arclShop.openDaily(); }
  if (k === "friendsList") { try { if (!sess()) return null; const f = chatUI && chatUI.friendsList ? chatUI.friendsList() : null; if (f == null && chatUI && chatUI.loadFriends) chatUI.loadFriends().then(() => rpg.repaint()); return f || []; } catch { return null; } }
  if (k === "here") { try { return ghosts ? ghosts.named().filter((g) => g.name).sort((a, b) => (b.lv || 0) - (a.lv || 0)) : []; } catch { return []; } }
  if (k === "lines") { try { return chatUI && chatUI.lines ? chatUI.lines() : []; } catch { return []; } }
  if (k === "top") { const d = quests && quests.dir ? quests.dir() : null; if (!d && quests && quests.loadDir && !topAsk) { topAsk = true; quests.loadDir().then(() => rpg.repaint()).catch(() => {}); } return ((d && d.list) || []).slice().sort((a, b) => (b.lv || 0) - (a.lv || 0)).slice(0, 5).map((r) => ({ n: r.n || r.name, lv: r.lv })); }
  if (k.startsWith("invite:")) { try { const p = partyUI(); if (p && p.invite) p.invite(k.slice(7)); else toast(TW("Sign in with a wallet to make a party.")); } catch { toast(TW("Couldn't open it — try again")); } return true; }
  if (k === "streak") { try { return sess() ? arclShop.streak() : null; } catch { return null; } }
  if (k === "name") return P.name || "";
  if (k === "hero") { const h = String(heroOf(P.char || "")).replace("custom-", ""); return /^(aron|lumi|nex)$/.test(h) ? h : "aron"; }
  if (k === "xp") { const x = RPG.xpProgress(P.xp || 0); return x.need ? { a: x.into, b: x.need, k: Math.max(0, Math.min(1, x.into / x.need)) } : null; }
  if (k === "events") return plazaEvents().map((e) => ({ ...e, left: evLeft(e.at) }));
  if (k === "counts") { const c = itemCodex && itemCodex.state ? itemCodex.state() : null, q = quests && quests.codexCount ? quests.codexCount() : null; return { items: c && c.data ? `${c.data.n} / ${c.data.all}` : "", scam: q ? `${q.got} / ${q.all}` : "", ach: q ? `${q.ach} / ${q.achAll}` : "", bonus: c && c.data ? c.data.bonus : cxBonus }; }
  if (k === "map") return openMap();
  if (k === "crew") return crewUI.show();
  if (k === "friends") return chatUI && chatUI.show();
  if (k === "invite") return referUI && referUI.open();
  if (k === "items") return openCodex();
  if (k === "make") return openMake();
  if (k === "jur") return toast(TW("Open it in Jurassic World: Pack → Codex"));
  return null;
}
/// the item codex (world-codex.js; the marks and the milestones are the server's: api/_world-codex.mjs)
let itemCodex = null, cxWas = false, topAsk = false;
async function loadCodex() {
  if (itemCodex) return itemCodex;
  const M = await import("./world-codex.js");
  itemCodex = M.createCodex({ T: TW, esc, toast, sess, post, signIn, level, ver: VER,
    items: () => { const d = rpg ? rpg.data() : null; return d ? [...Object.values(d.eq || {}), ...(d.bag || []), ...(d.store || [])].filter(Boolean) : []; },
    addSupply: (k, n) => { const ok = !!(rpg && rpg.addSupply && rpg.addSupply(k, n)); try { if (ok) { save(); if (combat && combat.paintPots) combat.paintPots(); } } catch { /* shown on the next repaint */ } return ok; },
    onBonus: (b, t) => { cxBonus = b && Object.keys(b).length ? b : null; cxTitles = t || []; try { if (rpg) rpg.refresh(); } catch { /* not built yet */ } },
    wearTitle: (t) => { try { if (quests && quests.wear) quests.wear(t); } catch { /* worn later from the Adventure log */ } },
    openMonsters: (k) => { if (quests && rpg) { quests.setTab(k === "scam" ? "codex" : "ach"); rpg.show("log"); } },
    openMap: () => openMap(), onClaim: () => refreshPurse(true),
    onOpen: () => { cxWas = frozen; frozen = true; keys.clear(); near = null; paintPrompt(); }, onClose: () => { frozen = cxWas; keys.clear(); } });
  return itemCodex;
}
async function openCodex() {
  try { const c = await loadCodex(); closeAll(); await c.open(); }
  catch (e) { console.warn("item codex", e); toast(TW("Couldn't open it — try again")); staleReload(); }
}
/// the guide to AGENT DIMENSION and ARCIRCLE Studio Lite (world-adguide.js; the words in /ad-guide-data.js, shared with /game)
let adGuide = null;
async function openAdGuide(which) {
  try { if (!adGuide) { const M = await import("./world-adguide.js"); adGuide = M.createAdGuide({ lang: LANG, ver: VER, esc }); } await adGuide.open(which || "ad"); }
  catch (e) { console.warn("ad guide", e); toast(TW("Couldn't open it — try again")); staleReload(); }
}
async function openAgent() { const a = await loadAgent(); if (!a) { toast(TW("Couldn't open your agent — try again")); return; } closeAll(); a.open(); }
setTimeout(() => { loadAgent().catch(() => {}); }, 7000);
// the Halloween Pumpkin Kings (world-pumpking.js, 22 Oct – 5 Nov US Eastern; ?pk=day / ?pk=night to try): five dancing
// kings by day, Inferno Jack rampaging at night (20:00–05:00 US Eastern), everyone's HP, the top 3 hitters rewarded
let pumpKings = null;
const pkCalm = () => mode === "hub" && !introOn && !jurOn && !survOn && !ringsOn && !pokerOn && !mineOn && !defenseOn && !jumpOn && !beatOn;
if (Date.now() < Date.parse("2026-11-06T06:00:00Z") || /[?&]pk=/.test(location.search)) setTimeout(async () => {
  try { const M = await import("./world-pumpking.js");
    pumpKings = M.createPumpKings({ THREE, K, planet, T: TW, esc, toast, Snd, ver: VER, low: lowGfx, coarse, reduce, compile: (l) => compileHidden(l), combat: () => combat, here: (v) => here(v), level, sess, post, blocked: (v) => blockedAt(v),
      addItem: (it) => { rpg.addItem(it); save(); }, refresh: () => refreshPurse(true), parts, shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, inHub: pkCalm, name: (it) => (it.u === "jack" ? TW("Jack's Inferno Blade") + (it.p ? " +" + it.p : "") : rpg.itemName(it)) });
    try { pumpKings.clear(groundG); } catch { /* the trees stay */ }
  } catch (e) { console.warn("pumpkin kings", e); staleReload(); }
}, 5000);
setInterval(() => { if (agentDim) agentDim.paintChip(); }, 1500);
let dinoTown3d = null; // world-dinotown.js, loaded when there's a companion to draw
const dinoTown = (() => {
  let DE = null, st = null, nests = [], seen = {}, el = null, last = 0, fails3d = 0;
  const left = (ms) => { ms = Math.max(0, ms); const h = Math.floor(ms / 36e5), m = Math.max(1, Math.floor((ms % 36e5) / 6e4)); return h ? TW("{h}h {m}m", { h, m }) : TW("{m}m", { m }); };
  const note = (title, body) => { try { if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return; new Notification(title, { body, icon: "/images/brand/apple-touch-icon-v2.png", tag: "arc-dino" }); } catch { /* not this browser */ } };
  async function look() {
    const s = sess(); if (!s) { st = null; return paint(); }
    try { if (!DE) DE = await import("./world-dino-engine.js"); } catch { return; }
    try { const [a, b] = await Promise.all([fetch("/api/social?world=dino&wallet=" + encodeURIComponent(String(s.wallet).toLowerCase()), { cache: "no-store" }), fetch("/api/social?world=dino-nests", { cache: "no-store" })]);
      if (a.ok) st = await a.json(); if (b.ok) nests = (await b.json()).eggs || []; } catch { /* the next look */ }
    last = Date.now(); paint();
  }
  function what() {
    if (!st || !DE) return null; const t = Date.now();
    const eggs = st.eggs || (st.egg ? [st.egg] : []);
    for (const eg of eggs) { const e = DE.eggState(eg, t); if (e.stage === "READY") return { k: "ready", t: "🐣 " + TW("Your egg is ready to hatch!") }; }
    let soon = null; for (const eg of eggs) { const e = DE.eggState(eg, t); if (e.open && /^D/.test(e.stage) && (!soon || e.closesAt < soon.e.closesAt)) soon = { eg, e }; }
    if (soon) { const l = soon.e.closesAt - t; return { k: l < 4 * 3600e3 ? "warn" : "care", t: "🥚 " + TW("Egg care open · {t} left", { t: left(l) }), key: "c" + soon.eg.id + (soon.eg.done || []).length + (l < 3600e3 ? "1h" : l < 4 * 3600e3 ? "4h" : "") }; }
    if (st.canClaim === false || (st.canClaim == null && st.buddy)) return null;
    if (st.first) return { k: "first", t: "🥚 " + TW("Your first egg is waiting in Jurassic World") };
    const e = nests.find((x) => x.to > t); if (e) return { k: "out", t: "🥚 " + TW("A rare egg is out in Jurassic World · {t} left", { t: left(e.to - t) }), key: "o" + e.nest + e.to };
    return null;
  }
  function paint() {
    if (!el) { el = document.createElement("button"); el.type = "button"; el.className = "wp-dinochip"; el.hidden = true; document.body.appendChild(el);
      el.addEventListener("click", () => { if (mode !== "hub" || jurOn || frozen) return; window.arcWorld.jurassic().gate(); toast(TW("Step into the Jurassic World portal")); }); }
    const w = what(), show = !!w && mode === "hub" && !jurOn && !survOn && !ringsOn && !pokerOn && !mineOn && !defenseOn && !jumpOn && !beatOn && !introOn;
    el.hidden = !show; if (!w) return; if (el.textContent !== w.t) el.textContent = w.t; { const c = "wp-dinochip " + w.k + (el.classList.contains("wp-nq-off") ? " wp-nq-off" : ""); if (el.className !== c) el.className = c; } /* (the phone notice queue's wp-nq-off kept) */
    if (w.key && !seen[w.key]) { seen[w.key] = 1; if (w.k === "warn" || w.k === "out") { if (!jurOn) toast(w.t); note("DINO SOULMATE", w.t.replace(/^\S+\s/, "")); } }
  }
  // the companions walking in town: yours (unless it's resting: world-dino.js's "arc.dino" out) and the others' near you
  async function walkers() {
    let out = true; try { out = JSON.parse(localStorage.getItem("arc.dino") || "{}").out !== false; } catch { /* out */ }
    const b = st && st.buddy, mine = b && b.genes && out ? `${b.genes.species === "trike" ? "trike" : "raptor"}.${b.genes.pal}.${b.genes.rarity}.${Math.max(0, Math.min(4, b.stage | 0))}` : "";
    dinoOutNow = !!mine; const theirs = []; if (ghosts) ghosts.each((g, w) => { if (w.dn && !w.gone) theirs.push({ key: w.wallet || String(w.at), x: g.position.x, z: g.position.z, code: w.dn }); });
    if (!mine && !theirs.length && !dinoTown3d) return;
    if (!dinoTown3d && fails3d > 2) return; // (it's only the companions' walk: after three failed loads, a page from before a deploy stops trying)
    if (!dinoTown3d) { try { const M = await import("./world-dinotown.js"); dinoTown3d = M.createTownDinos({ THREE, K, planet, here: (v) => here(v), facing: () => facing, ver: VER, inHub: () => mode === "hub" && !introOn && !jurOn, shadow: (r, k) => LOOK.contactShadow(r, k), low: lowGfx, reduce }); } catch (e) { fails3d++; console.warn("town dino", e); return; } }
    dinoTown3d.set(mine); dinoTown3d.others(theirs);
  }
  setTimeout(look, 6000); setInterval(() => { if (Date.now() - last > (document.hidden ? 120e3 : 75e3)) look(); else paint(); }, 5000);
  setInterval(() => { walkers().catch(() => {}); }, 2000);
  return { look, paint, state: () => st };
})();
window.arcWorld = { rq: () => rqL, rqGo: (id) => rqGo(id), raidQueens: () => openRaidQueens(), rqGate: (k = 18) => { const g = rqGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * k, g.z - g.z / d * k, { x: g.x, z: g.z }); return { model: !!rqGate.userData.model }; }, codex: () => itemCodex, openCodex: () => openCodex(), snd: Snd, adGuide: (k) => openAdGuide(k), adPromo: () => adPromo(true), goAgentTower: () => goAgentTower(), studio: () => studio, ringsNow: () => ringsGame, arena: () => agArena, openArena: () => openArena(), openStudio: () => openStudio(), near: () => (near ? near.kind + ":" + (near.b || near.to || "") : ""), frozen: () => frozen, city: () => adc, cityGo: () => cityGo(), cityBuilding: (id) => cityBuilding(id), welcome: () => welcomeBurst(), fountainBurst: (k = 8) => fountain.userData.burst(k), pk: () => pumpKings, standAt: (x, z, c) => standAt(x, z, c || { x: 0, z: 0 }), combatMobs: () => (combat ? combat.mobsRaw().filter((m) => !m.dead).map((m) => ({ n: m.bossName || m.spec.id, lv: m.lv, hp: Math.round(m.hp), max: m.max, ext: !!m.ext, x: +m.g.position.x.toFixed(1), z: +m.g.position.z.toFixed(1) })) : []), fight: (on) => { if (combat && combat.attack) combat.attack(); }, quests: () => quests, svAch: () => svAch, openLog: (t) => { quests.setTab(t); rpg.show("log"); }, agent: () => agentDim, openAgent: () => openAgent(), partner: (k = 14) => { const d0 = pvil.door("kairo"), g = d0.getWorldPosition(new THREE.Vector3()).sub(planet.position), c = pvil.center, dx = g.x - c.x, dz = g.z - c.z, d = Math.hypot(dx, dz) || 1; standAt(g.x - dx / d * k, g.z - dz / d * k, { x: g.x, z: g.z }); return { model: pvil.ready("kairo") }; }, openMap: () => openMap(), myXZ: () => { const v = here(new THREE.Vector3()); return { x: v.x, z: v.z }; }, pvil: () => pvil, goPartnerVillage: () => goPartnerVillage(), openPartner: (id) => openPartner(id || "kairo"), agentGate: (k = 20) => { const g = agentGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * k, g.z - g.z / d * k, { x: g.x, z: g.z }); return { model: !!agentGate.userData.model }; },
  launch: () => launchUI,
  refer: () => referUI, share: (c) => bragCard(c), games: () => openGames(), start: () => openStart(true), autoQ: () => [...autoQ.keys()], toast: (m) => toast(m),
  dinoTown: () => ({ look: dinoTown.look, d3: dinoTown3d ? dinoTown3d.debug() : null, chip: (document.querySelector(".wp-dinochip") || {}).textContent || "" }),
  applyOwn: (o) => applyOwn(o), // the pets, and a worldOwn to mirror (tests)
  stage: () => st, post: () => fxPost, gshadow: () => gshadow, grass: () => grass, gmask: () => gmask, parts: () => parts, music: () => music, vfx: () => vfx, life: () => life, air: () => air, showcase: () => island.showcase(), ride: () => ride, kit: () => kit, race: () => race, inbox: () => inbox, wardrobe: () => wardrobe, decor: () => decor, openProfile: (w) => openProfile(w),
  level: () => level(), purse: (f) => refreshPurse(f), bakedShadows: () => bakedShadows(), // b447: the slow-phone shadow step, for tests
  poker: () => ({ game: pokerGame, on: pokerOn, open: openPoker, door: () => { const e = gv.exitOf("poker"); standAt(e.x, e.z, gv.center); }, view: () => { const e = gv.exitOf("poker"), c = gv.center; standAt(c.x + (e.x - c.x) * 0.3, c.z + (e.z - c.z) * 0.3, { x: e.x * 2 - c.x, z: e.z * 2 - c.z }); } }),
  rings: () => ({ game: ringsGame, on: ringsOn, open: openRings, door: () => { const e = gv.exitOf("rings"); standAt(e.x, e.z, gv.center); }, view: () => { const e = gv.exitOf("rings"), c = gv.center; standAt(c.x + (e.x - c.x) * 0.3, c.z + (e.z - c.z) * 0.3, { x: e.x * 2 - c.x, z: e.z * 2 - c.z }); } }),
  surv: () => ({ game: survGame, on: survOn, open: openSurvivors, door: () => { const e = gv.exitOf("surv"); standAt(e.x, e.z, gv.center); } }),
  land: () => land,
  jurassic: () => ({ game: jurGame, on: jurOn, open: openJurassic, allowed: jurAllowed(), gate: () => { const g = jurGate.position, d = Math.hypot(g.x, g.z) || 1; standAt(g.x - g.x / d * 3, g.z - g.z / d * 3, { x: g.x, z: g.z }); } }),
  mine: () => ({ game: mineGame, on: mineOn, rest: mineRest, open: openMine, door: () => { const e = mv.exit(); standAt(e.x, e.z, { x: e.x + Math.sin(e.face) * 5, z: e.z + Math.cos(e.face) * 5 }); } }),
  jump: () => jumpRace, beat: () => beatGame, mode: () => mode, input: () => ({ joy: joy ? { dx: +joy.dx.toFixed(2), dy: +joy.dy.toFixed(2), fixed: joy.fixed } : null, look: !!look, pinch: !!pinch, touches: touches.size, cam: +camGoal.toFixed(2) }), gv: () => gv, liftTo: (y) => { hop = y; at.y = y; vy = 0; grounded = true; } /* tests: stand at a height (a Coin Jump platform) */, goGameVillage: () => goGameVillage(), island: () => island.debug(), isle: () => island, village: () => village, setVillage: (v) => setVillage(v), goIsland: (o = {}) => goIsland(o), leaveIsland, place: (...a) => island._place(...a), blueprint: (...a) => island._blueprint(...a), introDone: () => !introOn,
  lands: { go: (id) => landGo(id), now: () => landNow, lots: () => coinBuildings.map((g) => ({ sym: g.userData.coin.symbol, tier: g.userData.tier, x: g.position.x, z: g.position.z, size: g.userData.size })), portals: () => lands.portals.map((p) => ({ to: p.userData.to, model: !!p.userData.model, x: p.position.x, z: p.position.z })), shops: () => shops.map((g) => ({ id: g.userData.spec.id, x: g.position.x, z: g.position.z })), stand: (x, z, cx, cz) => standAt(x, z, cx != null ? { x: cx, z: cz } : undefined), out: () => outOfBounds(), coins: (list) => { coinData = list; coinData.mine = 0; buildCoinCity(list); return coinBuildings.length; },
    mine: () => coinBuildings.filter((g) => g.userData.mine).map((g) => ({ sym: g.userData.coin.symbol, token: g.userData.coin.token, tier: g.userData.tier, built: !!g.userData.lotG, x: g.position.x, z: g.position.z })),
    lotOpen: (token) => { const c = (coinData || []).find((x) => lc(x.token) === lc(token)); if (!c) return false; const tr = LD.LOT_TIERS[lotTierOf(c)]; goIsland({ lot: { ...c, N: tr.N, max: tr.max } }); return true; },
    isle: () => island.debug(), fill: (n) => island.testFill(n), save: () => island.save(), leave: () => leaveIsland() }, // b-lpv: tests
  P, planet, flyTo: (id) => { const g = id === "npc" ? npc : shops.find((s) => s.userData.spec.id === id); if (g) flyTo(g); },
  near: () => near && (near.spec ? near.spec.id : near.coin ? "coin:" + near.coin.symbol : near.kind),
  coins: () => coinBuildings.length, rocket: launchRocket, burn: burnFire, whale: swimWhale, previewStyle: (id) => island.setTheme(id), combat: () => combat, robots: () => !!(kit && kit.enemies && kit.enemies.EyeDrone), quests: () => quests, pet: () => pet, rpg: () => rpg, state: () => ({ facing, camYaw, hop, grounded, anim: animState, boarding, camFit, camDist, frozen, mode, arcl: (arclShop.arcl() || {}).bal, owned: ((arclShop.own() || {}).items || []).slice() }),
  // for screenshots and tests: point the camera, ride the board
  cam: (o = {}) => { if (o.yaw != null) camYaw = o.yaw; if (o.pitch != null) camPitch = o.pitch; if (o.dist != null) camDist = camGoal = o.dist; if (o.facing != null) facing = o.facing; }, board: (on) => setBoard(!!on), gain: (n) => gain(n, ""), holdXp: (on) => { xpHeld = !!on; },
  fighters: () => fighters.map((g) => ({ id: g.userData.spec.id, live: !!g.userData.live })),
  // for tests and the art audit: what the last frame drew (draw calls, triangles) and what's in GPU memory
  perf: () => ({ calls: st.renderer.info.render.calls, triangles: st.renderer.info.render.triangles, geometries: st.renderer.info.memory.geometries, textures: st.renderer.info.memory.textures, pixelRatio: st.renderer.getPixelRatio(), avatar: P.char || "" }),
  avatar: () => avatar, live: () => live,
  raid: () => raid, ghosts: () => ghosts, tp: (x, z) => { planet.position.set(-x, 0, -z); hop = 0; vy = 0; grounded = true; },
};
