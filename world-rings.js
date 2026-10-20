// world-rings.js — INFINITY RINGS, the Game Village's ring puzzle (loaded the first time the palace door is used, like
// SURVIVORS ARENA). It draws its own scene through the stage's view() while the town waits, frozen, behind it.
// C-shaped rings hang hooked into each other (and on metal pegs); turn a ring until its gap faces what holds it and it
// falls — a fall can free its neighbours, a chain. Clear the board in as few moves as you can: par or better is 3 stars.
// 200 levels in ten chapters (lock rings from 21, clockwise-only energy rings from 41, gear pairs from 46, the INFINITY
// BOSS at 100; ice rings from 101, portal pairs from 121, timer rings from 141, the RIFT BOSS at 200), three daily
// puzzles everyone shares, a puzzle a day for the week (a theme a week), TIME ATTACK (60 s, boards in a row) and an
// endless run for XP. The rules, the levels and the stars are world-rings-engine.js; the server plays the same moves
// on the same level (api/_world-rings.mjs) and pays 100 ARCL a new star (50 from 101). A guest plays everything;
// progress is kept on this device, nothing is paid.
//
// b-irx (the owner's reference design): the lobby has your own hero by the title, chapter cards with a picture, three
// chests each (20/40/60★: hints, a ring style, XP) and the rest folded to one line; hints come three a board and then
// from a bag (chests, one free a day); ring styles are looks only. Effects: turns spring into place, ice shatters, a
// key's spark runs to its lock, portals flash together, the hammer comes down, a big chain slows time, the bosses'
// ∞ core flinches and blazes; the clear card has confetti, the ARCL and the XP, a share card and a friend challenge
// (your friend's real moves come back to your challenge box).
//
// The rings: chunky glossy C's (a torus arc and two round tips, one mesh each) that touch their neighbours; a gold
// clasp holds each pair where they touch and a silver one ties a ring to its peg. A clasp glows green while it's open.
//
// ctx: { THREE, K, st, ver, T, lang, esc, toast, Snd, reduce, low, coarse, sess, post, refresh, gain(n, why),
//        quality, hero() → { ch, tn }, share(card), onMaster(), onLegend(), onLeave() }
import { RINGS, DIRS, level, stateOf, cloneState, turn, turnSet, hammer as hammerOn, cleared, starsOf, hint as hintOf, isFree, lost, WEEK_THEMES } from "./world-rings-engine.js";

const COLORS = [0x2fd14a, 0x2f7bff, 0xffa31a, 0xa04bff, 0xff3b4a, 0x19d6c4];
const BADGE = ["#ffd23a", "#ff6fb5", "#38d8ff", "#7dff9a"];
const TUBE = 0.25, GAPW = (RINGS.GAP * Math.PI) / 180, STEP = Math.PI / 4;
const SAVE = "arc.world.rings", fmt = (n) => Math.round(n).toLocaleString("en-US");
const seoulDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// the ISO week of Seoul's today ("2026-43") and today's place in it (Monday 0 … Sunday 6)
const seoulWeek = () => { const d = new Date(Date.parse(seoulDay() + "T00:00:00Z")), wd = (d.getUTCDay() + 6) % 7; const th = new Date(d.getTime() + (3 - wd) * 864e5), y = th.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4)); const wk = 1 + Math.round(((th - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7); return { id: y + "-" + String(wk).padStart(2, "0"), day: wd }; };

const LW = {
  ko: { "Free every small ring, then the core unlocks.": "작은 링을 모두 풀면 코어가 열려요.", "Time's up!": "시간 초과!", "The timer ring didn't fall in time.": "타이머 링이 제때 떨어지지 않았어요.", "{t} cleared!": "{t} 클리어!", "Stars": "별", "Rings": "링", "I cleared {t} in {n} moves on INFINITY RINGS! ♾️ Can you do it in fewer?": "인피니티 링 {t}을(를) {n}수 만에 클리어했어요! ♾️ 더 적은 수로 깰 수 있나요?", "{n} fewer moves!": "{n}수 줄였어요!", "The whole week: +5 hints": "일주일 완주: 힌트 +5", "Share card": "공유 카드", "INFINITY LEGEND!": "인피니티 레전드!", "You cleared all 200 levels. The title is yours.": "200레벨을 모두 클리어했어요. 칭호를 드려요.", "A free hint for today: {n} in your bag": "오늘의 무료 힌트: 가방에 {n}개", "{n} stars needed": "별 {n}개가 필요해요", "+2 hints": "힌트 +2", "New ring style: {s}": "새 링 스타일: {s}", "+3 hints": "힌트 +3", "Nice!": "좋아요!", "Sign in with a wallet to see who took your challenges": "지갑으로 로그인하면 내 도전을 받은 친구를 볼 수 있어요", "No one has taken your challenges yet — send one from a clear": "아직 도전을 받은 친구가 없어요 — 클리어 후 보내 보세요", "{a} moves (yours {b})": "{a}수 (내 기록 {b})", "Weekly": "주간", "Modes": "모드", "Week {w}": "{w}주차", "A new puzzle every day · all 7: +5 hints": "매일 새 퍼즐 · 7개 모두: 힌트 +5", "Day {n}": "{n}일차", "in {n} d": "{n}일 후", "Time Attack": "타임 어택", "Clear as many boards as you can in {n} seconds · XP only": "{n}초 안에 최대한 많은 보드를 클리어 · 경험치만", "Your best: {n}": "내 최고: {n}", "Board after board, bigger each time · XP only": "보드를 깰수록 더 커져요 · 경험치만", "Ring style": "링 스타일", "Ch.{n} ★40": "{n}챕터 ★40", "Challenge box": "도전함", "Time Attack · this week": "타임 어택 · 이번 주", "{n} boards": "{n}개 보드", "No runs yet this week — be the first!": "이번 주 기록이 아직 없어요 — 첫 번째가 되어 보세요!", "Play level {n}": "레벨 {n} 플레이", "Hints in your bag": "가방 속 힌트", "100 ARCL a new star (101–200: 50) · up to 10,000 a day": "새 별마다 100 ARCL (101–200: 50) · 하루 최대 10,000", "TIME ATTACK · {n} seconds": "타임 어택 · {n}초", "Board {n}!": "보드 {n}!", "TIME'S UP!": "시간 종료!", "boards cleared in {n} seconds": "{n}초 동안 클리어한 보드", "Sending your run…": "기록 보내는 중…", "Play again": "다시 하기", "#{r} on this week's board · best {n}": "이번 주 순위 {r}위 · 최고 {n}", "This week's best: {n}": "이번 주 최고: {n}", "The run couldn't be sent — try again later": "기록을 보내지 못했어요 — 잠시 후 다시 해 보세요", "Open chapter {n}'s 40-star chest first": "먼저 {n}챕터의 별 40개 상자를 여세요", "TIME ATTACK": "타임 어택", "Frozen Falls": "얼어붙은 폭포", "Portal Gardens": "포털 정원", "Clockwork Tower": "시계태엽 탑", "Star Vault": "별의 금고", "Infinity Rift": "인피니티 균열", "Candy": "캔디", "Neon": "네온", "Crystal": "크리스탈", "Gold": "골드", "Galaxy": "갤럭시", "Frost": "서리", "Lava": "용암", "Rainbow": "무지개", "Ice rings: the first turn only cracks them": "얼음 링: 첫 회전은 얼음만 깨요", "Portal pairs fall together": "포털 링은 쌍으로 함께 떨어져요", "Timer rings: drop them in time": "타이머 링: 제때 떨어뜨리세요", "Ice, portals and timers at once": "얼음, 포털, 타이머가 한꺼번에", "The hardest boards — and the RIFT BOSS": "가장 어려운 보드 — 그리고 균열 보스", "An ice ring's first turn only cracks the ice. Then it turns like any ring.": "얼음 링은 첫 회전에 얼음만 깨져요. 그다음부터는 보통 링처럼 돌아가요.", "Portal rings come in pairs: when one falls, its twin goes too.": "포털 링은 쌍으로 있어요: 하나가 떨어지면 짝도 함께 떨어져요.", "A timer ring must fall before its count runs out — or the board is lost.": "타이머 링은 숫자가 다 되기 전에 떨어져야 해요 — 아니면 보드 실패!", "A ring that has fallen can't be undone.": "떨어진 링은 되돌릴 수 없어요.", "Ice Week": "얼음 주간", "Portal Week": "포털 주간", "Lock Week": "잠금 주간", "Timer Week": "타이머 주간", "Energy Week": "에너지 주간", "Gear Week": "기어 주간", "Beat {name}: {n} moves": "{name}을(를) 이겨라: {n}수", "your friend": "친구", "You beat {name}! {a} moves to {b}": "{name}을(를) 이겼어요! {a}수 대 {b}수", "A tie with {name}: {a} moves each": "{name}와(과) 비겼어요: 둘 다 {a}수", "{name} wins this time: {b} moves to your {a}": "이번엔 {name} 승리: {b}수 대 내 {a}수", "Challenge a friend": "친구에게 도전장", "Can you beat my {n} moves on INFINITY RINGS?": "인피니티 링에서 내 {n}수를 이길 수 있어?", "Link copied — send it to a friend": "링크를 복사했어요 — 친구에게 보내세요", "All three daily puzzles at 3 stars: +{n} bonus": "데일리 3문제 모두 별 3개: 보너스 +{n}", "{n}-day streak!": "{n}일 연속!", "All three at 3 stars: +{n} ARCL bonus": "3문제 모두 별 3개: +{n} ARCL 보너스", "fewest moves, then fastest": "최소 이동, 그다음 최단 시간", "Chapter {n}": "챕터 {n}", "First Turns": "첫 회전", "Turn, unhook, and your first peg": "돌리고, 풀고, 첫 핀까지", "Chain Garden": "연쇄 정원", "Chains, pegs and loops": "연쇄, 핀, 고리 순환", "Lock Works": "잠금 공방", "Lock rings and their keys": "잠금 링과 열쇠", "Energy Forge": "에너지 대장간", "Clockwise-only rings and gear pairs": "시계 방향 전용 링과 기어 짝", "Infinity Core": "인피니티 코어", "Everything at once — and the INFINITY BOSS": "모든 기믹 총출동 — 그리고 인피니티 보스", "STAGE 2 · The guard rings unlock": "2단계 · 수호 링이 풀려요", "FINAL · The INFINITY core unlocks": "마지막 · 인피니티 코어가 열려요", "INFINITY RINGS": "인피니티 링", "Turn the rings. Unhook them. Clear the board.": "링을 돌려 고리를 풀고 보드를 비우세요.", Levels: "레벨", Daily: "데일리", Endless: "무한 모드", Ranking: "랭킹", Leave: "나가기", Play: "플레이", "Level {n}": "레벨 {n}", "Daily {n}": "데일리 {n}", "Endless #{n}": "무한 #{n}",
    Moves: "이동", Par: "기준", Best: "최고", Hint: "힌트", Undo: "되돌리기", "X-Ray": "X-레이", Restart: "다시", Hammer: "해머", Next: "다음", Retry: "다시 하기", "All levels": "레벨 목록", "Loading the puzzle hall…": "퍼즐 홀 준비 중…",
    "100 ARCL a new star · up to 10,000 a day": "새 별마다 100 ARCL · 하루 최대 10,000", "Today: {n} / {m} ARCL": "오늘: {n} / {m} ARCL", "Sign in with a wallet to earn ARCL here": "지갑으로 로그인하면 여기서 ARCL을 받아요", "XP only": "경험치만", "The same 3 puzzles for everyone today": "오늘 모두에게 같은 퍼즐 3개", "This week's most stars": "이번 주 별 랭킹", "No stars yet this week — be the first!": "이번 주 아직 기록이 없어요 — 첫 주인공이 되세요!",
    "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.": "링의 틈이 걸려 있는 링을 향하도록 돌리세요. 탭: 시계 방향 한 칸 · 링을 따라 드래그: 양쪽 방향.",
    "A ring on a metal peg comes off only when its own gap faces the peg.": "금속 핀에 걸린 링은 자기 틈이 핀을 향할 때만 빠져요.", "A lock ring can't turn until the ring with its key has fallen.": "잠금 링은 열쇠 링이 떨어지기 전엔 돌릴 수 없어요.", "Energy rings turn clockwise only.": "에너지 링은 시계 방향으로만 돌아요.", "Gear rings come in pairs: turn one and both turn.": "기어 링은 짝이에요: 하나를 돌리면 둘 다 돌아요.",
    "INFINITY BOSS: free every small ring, then the core unlocks.": "인피니티 보스: 작은 링을 모두 풀면 코어가 열려요.", "Locked — its key ring must fall first": "잠겨 있어요 — 열쇠 링이 먼저 떨어져야 해요", "Clockwise only": "시계 방향만 가능해요", "Can't undo a fall": "떨어진 링은 되돌릴 수 없어요", "No hints left": "남은 힌트가 없어요", "A hint caps this board at 2 stars": "힌트를 쓰면 이 판은 최대 별 2개예요",
    "Tap a ring to knock it off (this board: 1 star at most)": "떨어뜨릴 링을 탭하세요 (이 판은 최대 별 1개)", "CLEAR!": "클리어!", "Sending your clear…": "기록 보내는 중…", "+{n} ARCL": "+{n} ARCL", "Stars already paid on this board": "이 판의 별 보상은 이미 받았어요", "Today's ARCL limit is reached — these stars pay on your next clear": "오늘 ARCL 한도에 도달했어요 — 다음 클리어 때 지급돼요",
    "The reward couldn't be sent — try again later": "보상을 보내지 못했어요 — 잠시 후 다시 해 보세요", "Guest play: sign in to earn ARCL": "게스트 플레이: 로그인하면 ARCL을 받아요", "World XP": "월드 경험치", "INFINITY MASTER!": "인피니티 마스터!", "You cleared all 100 levels. The title is yours.": "100레벨을 모두 클리어했어요. 칭호를 획득했어요.",
    "Clear level {n} first": "먼저 레벨 {n}을 클리어하세요", "The puzzle hall couldn't load: {e}": "퍼즐 홀을 불러오지 못했어요: {e}", "Board": "보드", "{n} stars": "별 {n}개", "New best!": "최고 기록!", "Par {n}": "기준 {n}", "Moves {n}": "이동 {n}", Ready: "준비 완료" },
  zh: { "Free every small ring, then the core unlocks.": "解开所有小环，核心就会解锁。", "Time's up!": "时间到！", "The timer ring didn't fall in time.": "计时环没能及时掉落。", "{t} cleared!": "{t} 通关！", "Stars": "星", "Rings": "圆环", "I cleared {t} in {n} moves on INFINITY RINGS! ♾️ Can you do it in fewer?": "我在无限之环用 {n} 步通关了 {t}！♾️ 你能用更少的步数吗？", "{n} fewer moves!": "少用了 {n} 步！", "The whole week: +5 hints": "整周完成：提示 +5", "Share card": "分享卡片", "INFINITY LEGEND!": "无限传奇！", "You cleared all 200 levels. The title is yours.": "你通关了全部 200 关。这个称号属于你。", "A free hint for today: {n} in your bag": "今日免费提示：背包里有 {n} 个", "{n} stars needed": "需要 {n} 颗星", "+2 hints": "提示 +2", "New ring style: {s}": "新圆环外观：{s}", "+3 hints": "提示 +3", "Nice!": "太好了！", "Sign in with a wallet to see who took your challenges": "用钱包登录，查看谁接受了你的挑战", "No one has taken your challenges yet — send one from a clear": "还没有人接受你的挑战——通关后发一个吧", "{a} moves (yours {b})": "{a} 步（你的 {b}）", "Weekly": "每周", "Modes": "模式", "Week {w}": "第 {w} 周", "A new puzzle every day · all 7: +5 hints": "每天一道新谜题 · 全部 7 道：提示 +5", "Day {n}": "第 {n} 天", "in {n} d": "{n} 天后", "Time Attack": "限时挑战", "Clear as many boards as you can in {n} seconds · XP only": "在 {n} 秒内尽量多地通关 · 仅经验", "Your best: {n}": "你的最佳：{n}", "Board after board, bigger each time · XP only": "一关接一关，越来越大 · 仅经验", "Ring style": "圆环外观", "Ch.{n} ★40": "第 {n} 章 ★40", "Challenge box": "挑战箱", "Time Attack · this week": "限时挑战 · 本周", "{n} boards": "{n} 局", "No runs yet this week — be the first!": "本周还没有记录——来做第一个吧！", "Play level {n}": "开始第 {n} 关", "Hints in your bag": "背包里的提示", "100 ARCL a new star (101–200: 50) · up to 10,000 a day": "每颗新星 100 ARCL（101–200：50）· 每天最多 10,000", "TIME ATTACK · {n} seconds": "限时挑战 · {n} 秒", "Board {n}!": "第 {n} 局！", "TIME'S UP!": "时间到！", "boards cleared in {n} seconds": "{n} 秒内通关的局数", "Sending your run…": "正在提交记录…", "Play again": "再玩一次", "#{r} on this week's board · best {n}": "本周排行第 {r} 名 · 最佳 {n}", "This week's best: {n}": "本周最佳：{n}", "The run couldn't be sent — try again later": "记录提交失败——请稍后再试", "Open chapter {n}'s 40-star chest first": "请先打开第 {n} 章的 40 星宝箱", "TIME ATTACK": "限时挑战", "Frozen Falls": "冰封瀑布", "Portal Gardens": "传送门花园", "Clockwork Tower": "发条塔", "Star Vault": "星之宝库", "Infinity Rift": "无限裂隙", "Candy": "糖果", "Neon": "霓虹", "Crystal": "水晶", "Gold": "黄金", "Galaxy": "银河", "Frost": "冰霜", "Lava": "熔岩", "Rainbow": "彩虹", "Ice rings: the first turn only cracks them": "冰环：第一次转动只会敲碎冰", "Portal pairs fall together": "传送门环成对一起掉落", "Timer rings: drop them in time": "计时环：及时让它掉落", "Ice, portals and timers at once": "冰、传送门和计时环一起出现", "The hardest boards — and the RIFT BOSS": "最难的棋盘——还有裂隙首领", "An ice ring's first turn only cracks the ice. Then it turns like any ring.": "冰环第一次转动只会敲碎冰，之后就像普通圆环一样转动。", "Portal rings come in pairs: when one falls, its twin goes too.": "传送门环成对出现：一个掉落，另一个也会一起掉落。", "A timer ring must fall before its count runs out — or the board is lost.": "计时环必须在计数用完前掉落——否则本局失败。", "A ring that has fallen can't be undone.": "已经掉落的圆环无法撤销。", "Ice Week": "冰之周", "Portal Week": "传送门周", "Lock Week": "锁之周", "Timer Week": "计时周", "Energy Week": "能量周", "Gear Week": "齿轮周", "Beat {name}: {n} moves": "打败 {name}：{n} 步", "your friend": "好友", "You beat {name}! {a} moves to {b}": "你赢了 {name}！{a} 步对 {b} 步", "A tie with {name}: {a} moves each": "和 {name} 打平：各 {a} 步", "{name} wins this time: {b} moves to your {a}": "这次 {name} 赢了：{b} 步对你的 {a} 步", "Challenge a friend": "挑战好友", "Can you beat my {n} moves on INFINITY RINGS?": "你能在无限之环里赢过我的 {n} 步吗？", "Link copied — send it to a friend": "链接已复制——发给好友吧", "All three daily puzzles at 3 stars: +{n} bonus": "每日 3 题全部 3 星：奖励 +{n}", "{n}-day streak!": "连续 {n} 天！", "All three at 3 stars: +{n} ARCL bonus": "三题全部 3 星：+{n} ARCL 奖励", "fewest moves, then fastest": "步数最少，其次最快", "Chapter {n}": "第 {n} 章", "First Turns": "初次转动", "Turn, unhook, and your first peg": "转动、解扣，还有第一根钉", "Chain Garden": "连锁花园", "Chains, pegs and loops": "连锁、钉子和环路", "Lock Works": "锁之工坊", "Lock rings and their keys": "锁环和它们的钥匙", "Energy Forge": "能量熔炉", "Clockwise-only rings and gear pairs": "只能顺时针的环和齿轮对", "Infinity Core": "无限核心", "Everything at once — and the INFINITY BOSS": "全部机制齐上阵——还有无限首领", "STAGE 2 · The guard rings unlock": "第 2 阶段 · 守卫环解锁", "FINAL · The INFINITY core unlocks": "最终 · 无限核心解锁", "INFINITY RINGS": "无限之环", "Turn the rings. Unhook them. Clear the board.": "转动圆环，解开扣环，清空棋盘。", Levels: "关卡", Daily: "每日", Endless: "无尽模式", Ranking: "排行", Leave: "离开", Play: "开始", "Level {n}": "第 {n} 关", "Daily {n}": "每日 {n}", "Endless #{n}": "无尽 #{n}",
    Moves: "步数", Par: "标准", Best: "最佳", Hint: "提示", Undo: "撤销", "X-Ray": "透视", Restart: "重来", Hammer: "锤子", Next: "下一关", Retry: "再试", "All levels": "全部关卡", "Loading the puzzle hall…": "正在准备解谜大厅…",
    "100 ARCL a new star · up to 10,000 a day": "每颗新星 100 ARCL · 每天最多 10,000", "Today: {n} / {m} ARCL": "今日：{n} / {m} ARCL", "Sign in with a wallet to earn ARCL here": "用钱包登录即可在这里赚 ARCL", "XP only": "仅经验", "The same 3 puzzles for everyone today": "今天所有人同样的 3 道题", "This week's most stars": "本周星星排行", "No stars yet this week — be the first!": "本周还没有记录——来当第一名吧！",
    "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.": "转动圆环，让缺口对准扣着它的圆环。点按：顺时针一格 · 沿环拖动：任意方向。",
    "A ring on a metal peg comes off only when its own gap faces the peg.": "挂在金属钉上的圆环，只有自己的缺口对准钉子才会脱落。", "A lock ring can't turn until the ring with its key has fallen.": "锁环要等钥匙环掉落后才能转动。", "Energy rings turn clockwise only.": "能量环只能顺时针转。", "Gear rings come in pairs: turn one and both turn.": "齿轮环成对出现：转一个，两个一起转。",
    "INFINITY BOSS: free every small ring, then the core unlocks.": "无限首领：解开所有小环，核心才会解锁。", "Locked — its key ring must fall first": "已锁定——要先让钥匙环掉落", "Clockwise only": "只能顺时针", "Can't undo a fall": "掉落无法撤销", "No hints left": "没有提示了", "A hint caps this board at 2 stars": "使用提示后本局最多 2 星",
    "Tap a ring to knock it off (this board: 1 star at most)": "点一个圆环把它敲掉（本局最多 1 星）", "CLEAR!": "通关！", "Sending your clear…": "正在提交记录…", "+{n} ARCL": "+{n} ARCL", "Stars already paid on this board": "这一关的星星奖励已领取", "Today's ARCL limit is reached — these stars pay on your next clear": "今日 ARCL 已达上限——下次通关时发放",
    "The reward couldn't be sent — try again later": "奖励发送失败——请稍后再试", "Guest play: sign in to earn ARCL": "游客模式：登录后可赚 ARCL", "World XP": "世界经验", "INFINITY MASTER!": "无限大师！", "You cleared all 100 levels. The title is yours.": "你通关了全部 100 关，称号归你了。",
    "Clear level {n} first": "请先通关第 {n} 关", "The puzzle hall couldn't load: {e}": "解谜大厅加载失败：{e}", "Board": "棋盘", "{n} stars": "{n} 星", "New best!": "新纪录！", "Par {n}": "标准 {n}", "Moves {n}": "步数 {n}", Ready: "准备好了" },
  tr: { "Free every small ring, then the core unlocks.": "Tüm küçük halkaları çöz, sonra çekirdek açılır.", "Time's up!": "Süre doldu!", "The timer ring didn't fall in time.": "Zamanlayıcı halka zamanında düşmedi.", "{t} cleared!": "{t} temizlendi!", "Stars": "Yıldız", "Rings": "Halka", "I cleared {t} in {n} moves on INFINITY RINGS! ♾️ Can you do it in fewer?": "INFINITY RINGS'te {t} seviyesini {n} hamlede bitirdim! ♾️ Daha azıyla yapabilir misin?", "{n} fewer moves!": "{n} hamle daha az!", "The whole week: +5 hints": "Bütün hafta: +5 ipucu", "Share card": "Paylaşım kartı", "INFINITY LEGEND!": "INFINITY LEGEND!", "You cleared all 200 levels. The title is yours.": "200 seviyenin hepsini bitirdin. Unvan senin.", "A free hint for today: {n} in your bag": "Bugünün bedava ipucu: çantanda {n}", "{n} stars needed": "{n} yıldız gerekli", "+2 hints": "+2 ipucu", "New ring style: {s}": "Yeni halka stili: {s}", "+3 hints": "+3 ipucu", "Nice!": "Harika!", "Sign in with a wallet to see who took your challenges": "Meydan okumalarını kimin aldığını görmek için cüzdanla giriş yap", "No one has taken your challenges yet — send one from a clear": "Henüz kimse meydan okumanı almadı — bir bitirişten sonra gönder", "{a} moves (yours {b})": "{a} hamle (seninki {b})", "Weekly": "Haftalık", "Modes": "Modlar", "Week {w}": "{w}. hafta", "A new puzzle every day · all 7: +5 hints": "Her gün yeni bulmaca · 7'si de: +5 ipucu", "Day {n}": "{n}. gün", "in {n} d": "{n} gün sonra", "Time Attack": "Zamana Karşı", "Clear as many boards as you can in {n} seconds · XP only": "{n} saniyede olabildiğince çok tahta bitir · sadece XP", "Your best: {n}": "En iyin: {n}", "Board after board, bigger each time · XP only": "Tahta tahta, her seferinde daha büyük · sadece XP", "Ring style": "Halka stili", "Ch.{n} ★40": "Böl.{n} ★40", "Challenge box": "Meydan okuma kutusu", "Time Attack · this week": "Zamana Karşı · bu hafta", "{n} boards": "{n} tahta", "No runs yet this week — be the first!": "Bu hafta henüz koşu yok — ilk sen ol!", "Play level {n}": "{n}. seviyeyi oyna", "Hints in your bag": "Çantadaki ipuçları", "100 ARCL a new star (101–200: 50) · up to 10,000 a day": "Her yeni yıldız 100 ARCL (101–200: 50) · günde en fazla 10.000", "TIME ATTACK · {n} seconds": "ZAMANA KARŞI · {n} saniye", "Board {n}!": "Tahta {n}!", "TIME'S UP!": "SÜRE DOLDU!", "boards cleared in {n} seconds": "{n} saniyede bitirilen tahta", "Sending your run…": "Koşun gönderiliyor…", "Play again": "Tekrar oyna", "#{r} on this week's board · best {n}": "Bu haftanın tablosunda {r}. · en iyi {n}", "This week's best: {n}": "Bu haftanın en iyisi: {n}", "The run couldn't be sent — try again later": "Koşu gönderilemedi — sonra tekrar dene", "Open chapter {n}'s 40-star chest first": "Önce {n}. bölümün 40 yıldızlık sandığını aç", "TIME ATTACK": "ZAMANA KARŞI", "Frozen Falls": "Donmuş Şelaleler", "Portal Gardens": "Portal Bahçeleri", "Clockwork Tower": "Saat Kulesi", "Star Vault": "Yıldız Kasası", "Infinity Rift": "Sonsuzluk Yarığı", "Candy": "Şeker", "Neon": "Neon", "Crystal": "Kristal", "Gold": "Altın", "Galaxy": "Galaksi", "Frost": "Kırağı", "Lava": "Lav", "Rainbow": "Gökkuşağı", "Ice rings: the first turn only cracks them": "Buz halkaları: ilk çevirme sadece buzu kırar", "Portal pairs fall together": "Portal çiftleri birlikte düşer", "Timer rings: drop them in time": "Zamanlayıcı halkalar: zamanında düşür", "Ice, portals and timers at once": "Buz, portal ve zamanlayıcı bir arada", "The hardest boards — and the RIFT BOSS": "En zor tahtalar — ve YARIK BOSS", "An ice ring's first turn only cracks the ice. Then it turns like any ring.": "Buz halkasının ilk çevrilişi sadece buzu kırar. Sonra her halka gibi döner.", "Portal rings come in pairs: when one falls, its twin goes too.": "Portal halkaları çifttir: biri düşünce eşi de gider.", "A timer ring must fall before its count runs out — or the board is lost.": "Zamanlayıcı halka sayacı bitmeden düşmeli — yoksa tahta kaybedilir.", "A ring that has fallen can't be undone.": "Düşen bir halka geri alınamaz.", "Ice Week": "Buz Haftası", "Portal Week": "Portal Haftası", "Lock Week": "Kilit Haftası", "Timer Week": "Zamanlayıcı Haftası", "Energy Week": "Enerji Haftası", "Gear Week": "Dişli Haftası", "Beat {name}: {n} moves": "{name} adlı oyuncuyu geç: {n} hamle", "your friend": "arkadaşın", "You beat {name}! {a} moves to {b}": "{name} adlı oyuncuyu geçtin! {a} hamleye {b}", "A tie with {name}: {a} moves each": "{name} ile berabere: ikiniz de {a} hamle", "{name} wins this time: {b} moves to your {a}": "Bu sefer {name} kazandı: {b} hamleye senin {a}", "Challenge a friend": "Arkadaşına meydan oku", "Can you beat my {n} moves on INFINITY RINGS?": "INFINITY RINGS'te benim {n} hamlemi geçebilir misin?", "Link copied — send it to a friend": "Bağlantı kopyalandı — arkadaşına gönder", "All three daily puzzles at 3 stars: +{n} bonus": "Günlük üç bulmaca da 3 yıldız: +{n} bonus", "{n}-day streak!": "{n} gün üst üste!", "All three at 3 stars: +{n} ARCL bonus": "Üçü de 3 yıldız: +{n} ARCL bonus", "fewest moves, then fastest": "en az hamle, sonra en hızlı", "Chapter {n}": "Bölüm {n}", "First Turns": "İlk Dönüşler", "Turn, unhook, and your first peg": "Çevir, çöz ve ilk çivin", "Chain Garden": "Zincir Bahçesi", "Chains, pegs and loops": "Zincirler, çiviler ve döngüler", "Lock Works": "Kilit Atölyesi", "Lock rings and their keys": "Kilitli halkalar ve anahtarları", "Energy Forge": "Enerji Ocağı", "Clockwise-only rings and gear pairs": "Sadece saat yönünde dönen halkalar ve dişli çiftleri", "Infinity Core": "Sonsuzluk Çekirdeği", "Everything at once — and the INFINITY BOSS": "Hepsi bir arada — ve INFINITY BOSS", "STAGE 2 · The guard rings unlock": "2. AŞAMA · Muhafız halkaları açılıyor", "FINAL · The INFINITY core unlocks": "FİNAL · INFINITY çekirdeği açılıyor", "INFINITY RINGS": "INFINITY RINGS", "Turn the rings. Unhook them. Clear the board.": "Halkaları çevir, çözülsünler, tahtayı boşalt.", Levels: "Seviyeler", Daily: "Günlük", Endless: "Sonsuz", Ranking: "Sıralama", Leave: "Ayrıl", Play: "Oyna", "Level {n}": "Seviye {n}", "Daily {n}": "Günlük {n}", "Endless #{n}": "Sonsuz #{n}",
    Moves: "Hamle", Par: "Hedef", Best: "En iyi", Hint: "İpucu", Undo: "Geri al", "X-Ray": "Röntgen", Restart: "Baştan", Hammer: "Çekiç", Next: "Sonraki", Retry: "Tekrar", "All levels": "Tüm seviyeler", "Loading the puzzle hall…": "Bulmaca salonu hazırlanıyor…",
    "100 ARCL a new star · up to 10,000 a day": "Her yeni yıldız 100 ARCL · günde en fazla 10.000", "Today: {n} / {m} ARCL": "Bugün: {n} / {m} ARCL", "Sign in with a wallet to earn ARCL here": "Cüzdanla giriş yap, burada ARCL kazan", "XP only": "Sadece XP", "The same 3 puzzles for everyone today": "Bugün herkese aynı 3 bulmaca", "This week's most stars": "Bu haftanın en çok yıldızı", "No stars yet this week — be the first!": "Bu hafta henüz yıldız yok — ilk sen ol!",
    "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.": "Halkayı, açıklığı takılı olduğu halkaya bakana kadar çevir. Dokun: saat yönünde bir adım · etrafında sürükle: iki yön.",
    "A ring on a metal peg comes off only when its own gap faces the peg.": "Metal çiviye takılı halka, ancak kendi açıklığı çiviye bakınca çıkar.", "A lock ring can't turn until the ring with its key has fallen.": "Kilitli halka, anahtar halkası düşmeden dönmez.", "Energy rings turn clockwise only.": "Enerji halkaları sadece saat yönünde döner.", "Gear rings come in pairs: turn one and both turn.": "Dişli halkalar çifttir: birini çevir, ikisi de döner.",
    "INFINITY BOSS: free every small ring, then the core unlocks.": "INFINITY BOSS: tüm küçük halkaları çöz, sonra çekirdek açılır.", "Locked — its key ring must fall first": "Kilitli — önce anahtar halkası düşmeli", "Clockwise only": "Sadece saat yönünde", "Can't undo a fall": "Düşen halka geri alınamaz", "No hints left": "İpucu kalmadı", "A hint caps this board at 2 stars": "İpucu bu tahtayı en fazla 2 yıldızla sınırlar",
    "Tap a ring to knock it off (this board: 1 star at most)": "Düşürmek için bir halkaya dokun (bu tahta: en fazla 1 yıldız)", "CLEAR!": "TEMİZ!", "Sending your clear…": "Sonuç gönderiliyor…", "+{n} ARCL": "+{n} ARCL", "Stars already paid on this board": "Bu tahtanın yıldızları zaten ödendi", "Today's ARCL limit is reached — these stars pay on your next clear": "Bugünün ARCL sınırı doldu — bu yıldızlar bir sonraki temizlemede ödenir",
    "The reward couldn't be sent — try again later": "Ödül gönderilemedi — sonra tekrar dene", "Guest play: sign in to earn ARCL": "Misafir oyunu: ARCL için giriş yap", "World XP": "Dünya XP", "INFINITY MASTER!": "INFINITY MASTER!", "You cleared all 100 levels. The title is yours.": "100 seviyenin hepsini bitirdin. Unvan senin.",
    "Clear level {n} first": "Önce {n}. seviyeyi bitir", "The puzzle hall couldn't load: {e}": "Bulmaca salonu yüklenemedi: {e}", "Board": "Tahta", "{n} stars": "{n} yıldız", "New best!": "Yeni rekor!", "Par {n}": "Hedef {n}", "Moves {n}": "Hamle {n}", Ready: "Hazır" },
};
const CHAPTERS = [
  { name: "First Turns", line: "Turn, unhook, and your first peg", c: "#2fd14a" },
  { name: "Chain Garden", line: "Chains, pegs and loops", c: "#2f7bff" },
  { name: "Lock Works", line: "Lock rings and their keys", c: "#ffa31a" },
  { name: "Energy Forge", line: "Clockwise-only rings and gear pairs", c: "#a04bff" },
  { name: "Infinity Core", line: "Everything at once — and the INFINITY BOSS", c: "#19d6c4" },
  { name: "Frozen Falls", line: "Ice rings: the first turn only cracks them", c: "#7fdcff" },
  { name: "Portal Gardens", line: "Portal pairs fall together", c: "#c86bff" },
  { name: "Clockwork Tower", line: "Timer rings: drop them in time", c: "#ffb347" },
  { name: "Star Vault", line: "Ice, portals and timers at once", c: "#ff6fb5" },
  { name: "Infinity Rift", line: "The hardest boards — and the RIFT BOSS", c: "#5ff0d0" },
];
// each chapter's hall: the nebula's two colours behind the board
const CH_SKY = [[0x1c6b3a, 0x2a3fa8], [0x1d4fc0, 0x6a2cc0], [0xb0601a, 0x5a2a9a], [0x7a2cd0, 0x2a50c0], [0x139a8a, 0x3a2ab0], [0x3aa8e0, 0x2a40a0], [0x9a3ae0, 0x3a1a8a], [0xd08a2a, 0x5a2a7a], [0xe04a9a, 0x3a2ab0], [0x2ad0b0, 0x6a2ad0]];
// ring looks (cosmetic only): candy from the start, the others from the chapters' 40-star chests
const SKINS = [
  { id: "candy", name: "Candy" }, { id: "neon", name: "Neon", ch: 0 }, { id: "crystal", name: "Crystal", ch: 1 }, { id: "gold", name: "Gold", ch: 2 },
  { id: "galaxy", name: "Galaxy", ch: 3 }, { id: "frost", name: "Frost", ch: 4 }, { id: "lava", name: "Lava", ch: 5 }, { id: "rainbow", name: "Rainbow", ch: 6 },
];
const CHEST = [20, 40, 60];
const LEVELS = 200, chOf = (n) => Math.min(9, Math.floor((n - 1) / 20));
const TIPS = { ice: "An ice ring's first turn only cracks the ice. Then it turns like any ring.", portal: "Portal rings come in pairs: when one falls, its twin goes too.", timer: "A timer ring must fall before its count runs out — or the board is lost.", fall: "A ring that has fallen can't be undone.", first: "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.", peg: "A ring on a metal peg comes off only when its own gap faces the peg.", lock: "A lock ring can't turn until the ring with its key has fallen.", energy: "Energy rings turn clockwise only.", gear: "Gear rings come in pairs: turn one and both turn.", boss: "INFINITY BOSS: free every small ring, then the core unlocks." };

export function createRings(ctx) {
  const { THREE, st, esc } = ctx, L0 = LW[ctx.lang] || {}, T = (s, v) => { const x = L0[s] != null ? L0[s] : null; return x != null ? x.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "")) : ctx.T(s, v); };
  const snd = (k, ...a) => { try { const f = ctx.Snd && ctx.Snd[k]; if (f) f.call(ctx.Snd, ...a); } catch { /* silent */ } };
  // the drawing's real size (the canvas, not the window: on the phone layout they differ, and a camera set to the window's
  // shape would squash every ring into an oval)
  const view = () => { const c = st.renderer.domElement, r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width || innerWidth, h: r.height || innerHeight }; };
  const phone = () => document.documentElement.classList.contains("wp-pcphone") || (innerWidth < 700 && innerHeight > innerWidth);
  const phys = !ctx.low && !phone();
  let on = false, busy = false, mode = "off", S = null, ui = null, prOrig = 0;
  let clasps = [], pegs = [], keyLines = null, ghost = null, chal = null, stage = 0, playT = 0;
  let L = null, s = null, lvId = "", rings = [], moves = [], hist = [], hintsUsed = 0, hintsLeft = RINGS.HINTS, hammerArmed = false, xray = false, runP = null, boardT = 0, falls = [], doneT = -1;
  let prog = load(), status = null, board = null, ta = null, taTop = null, chalBox = null;

  // ---------------- progress (this device; the server's best stars merged in for a wallet) ----------------
  function load() { let j = {}; try { j = JSON.parse(localStorage.getItem(SAVE) || "{}") || {}; } catch { /* a fresh start */ } return { best: j.best || {}, moves: j.moves || {}, endless: j.endless || 1, tips: j.tips || {}, master: !!j.master, legend: !!j.legend, bag: j.bag | 0, chest: j.chest || {}, skin: j.skin || "candy", refill: j.refill || "", taBest: j.taBest | 0, wk: j.wk || {} }; }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(prog)); } catch { /* kept for this visit */ } }
  const keyOf = (id) => (/^d:/.test(id) ? "d" + id.slice(2).replace(":", "_") : /^w:/.test(id) ? "w" + id.slice(2).replace(":", "_") : /^e:/.test(id) ? "e" + id.slice(2) : "c" + id);
  const bestOf = (id) => Math.max(prog.best[keyOf(id)] || 0, (status && status.best && status.best[keyOf(id)]) || 0);
  const cleared1 = () => { let n = 0; for (let i = 1; i <= LEVELS; i++) if (bestOf(String(i)) > 0) n = i; else break; return n; };
  const totalStars = () => { let n = 0; for (let i = 1; i <= LEVELS; i++) n += bestOf(String(i)); return n; };
  const chStars = (c) => { let n = 0; for (let k = 1; k <= 20; k++) n += bestOf(String(c * 20 + k)); return n; };
  const skinOk = (k) => { const x = SKINS.find((o) => o.id === k); return !!x && (x.ch == null || ((prog.chest[x.ch] | 0) & 2) > 0); };
  const skin = () => (skinOk(prog.skin) ? prog.skin : "candy");
  const paying = (id) => !/^[ewt]:/.test(id) && (!/^d:/.test(id) || id.slice(2, 12) === seoulDay()) && !!(ctx.sess && ctx.sess()); // (another day's daily puzzle, from a friend's link: played, not paid)

  // ---------------- the scene ----------------
  function build() {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, innerWidth / innerHeight, 0.1, 200);
    // its own reflections: a dark room with a few soft boxes (white above, blue and warm at the sides, mint below), so
    // the candy rings shine and the gold clasps look like gold
    try {
      const env = new THREE.Scene(); env.background = new THREE.Color(0x060c22);
      const box = (c, k, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
      box(0xffffff, 4, 0, 7, 5, 8, 3); box(0x8fc0ff, 2.2, -7, 1, 3, 3, 7); box(0xffd9a0, 2.4, 7, 2, 3, 3, 6); box(0x5ff0d0, 1.4, 0, -6, -4, 9, 2); box(0xffffff, 1.2, 0, 0, 9, 4, 4);
      const pm = new THREE.PMREMGenerator(st.renderer); scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
    } catch { try { if (st.scene && st.scene.environment) scene.environment = st.scene.environment; } catch { /* lit by the lights alone */ } }
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      uniforms: { uA: { value: new THREE.Color(CH_SKY[0][0]) }, uB: { value: new THREE.Color(CH_SKY[0][1]) }, uT: { value: 0 } },
      // the hall: deep blue, and a slow nebula in the chapter's two colours (three octaves of a cheap value noise)
      fragmentShader: "uniform vec3 uA, uB; uniform float uT; varying vec3 vP; float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float nz(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0)), f.x), f.y); } float fb(vec2 p){ return nz(p) * 0.55 + nz(p * 2.1 + 3.1) * 0.3 + nz(p * 4.3 + 7.7) * 0.15; } void main(){ float h = vP.y * 0.5 + 0.5; vec3 top = vec3(0.04, 0.07, 0.24), low = vec3(0.02, 0.02, 0.10); vec3 c = mix(low, top, smoothstep(0.2, 0.8, h)); vec2 q = vP.xy * 3.2 + vec2(uT * 0.012, -uT * 0.008); float n = fb(q + fb(q * 0.7 + uT * 0.01) * 1.4); float m = smoothstep(0.42, 0.9, n); c += mix(uB, uA, smoothstep(0.3, 0.75, fb(q * 0.6 + 11.0))) * m * 0.42; float g = pow(max(0.0, 1.0 - length(vP.xy - vec2(0.0, 0.05)) * 1.5), 3.0); c += vec3(0.12, 0.28, 0.70) * g * 0.38; gl_FragColor = vec4(c, 1.0); }" }));
    scene.add(sky);
    // twinkles: a few hundred points far behind the board
    { const n = ctx.low ? 120 : 320, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 70; p[i * 3 + 1] = (Math.random() - 0.5) * 50; p[i * 3 + 2] = -18 - Math.random() * 20; }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfe8ff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }))); }
    // the hall behind the board: soft out-of-focus lights (blue, mint, violet) and a faint glow where the board sits
    { const n = ctx.low ? 18 : 40, p = new Float32Array(n * 3), c = new Float32Array(n * 3), cols = [0x3b8dff, 0x2ee0b0, 0xa77bff, 0x7fd8ff].map((h) => new THREE.Color(h));
      for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 34; p[i * 3 + 1] = (Math.random() - 0.5) * 26; p[i * 3 + 2] = -9 - Math.random() * 8; const k = cols[i % 4]; c.set([k.r, k.g, k.b], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      const dot = document.createElement("canvas"); dot.width = dot.height = 64; const dg = dot.getContext("2d"), gr = dg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.5, "rgba(255,255,255,.28)"); gr.addColorStop(1, "rgba(255,255,255,0)"); dg.fillStyle = gr; dg.fillRect(0, 0, 64, 64);
      const bokeh = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.4, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(bokeh);
      const glowM = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(dot), color: 0x2f6bff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
      var glowDisc = new THREE.Sprite(glowM); glowDisc.renderOrder = -1; scene.add(glowDisc); }
    scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x241a52, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-4, 7, 9); scene.add(key);
    const rim = new THREE.DirectionalLight(0x5ff0d0, 1.1); rim.position.set(5, -3, -6); scene.add(rim);
    const boardG = new THREE.Group(); scene.add(boardG);
    const deco = new THREE.Group(); scene.add(deco);
    // the x-ray: hooks drawn between ring centres (green open, red shut), locks to their keys
    const xr = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false })); xr.renderOrder = 5; xr.visible = false; scene.add(xr);
    // sparkles (one pool)
    const NP = 320, pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 3), pa = new Float32Array(NP), pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pp, 3)); pg.setAttribute("color", new THREE.BufferAttribute(pc, 3)); pg.setAttribute("aA", new THREE.BufferAttribute(pa, 1));
    const pts = new THREE.Points(pg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: "attribute float aA; varying vec3 vC; varying float vA; void main(){ vC = color; vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (aA > 0.0 ? 34.0 : 0.0) * (0.5 + aA * 0.5) / -mv.z * 10.0; gl_Position = projectionMatrix * mv; }",
      fragmentShader: "varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r) * vA; float star = max(0.0, 1.0 - abs(d.x * d.y) * 60.0) * smoothstep(0.5, 0.1, r); gl_FragColor = vec4(vC * (a + star * vA * 0.6), 1.0); }" }));
    pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
    const P = Array.from({ length: NP }, () => ({ t: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
    S = { scene, cam, sky, boardG, deco, xr, pts, P, pp, pc, pa, glowDisc, geo: {}, props: null, inf: null, portal: null, cx: 0, cy: 0, w: 4, h: 4, comp: null };
    // the props (Meshy: the stellar portal behind the board, two crystal beacons, the ∞ above, a gold clasp)
    const loader = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null;
    S.propsP = loader ? loader.loadAsync("models/world/rings/props.glb?v=" + (ctx.ver || "1")).then((g) => {
      const by = {}; for (const c of g.scene.children.slice()) by[c.name] = c;
      const fit = (o, size) => { const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = size / Math.max(sz.x, sz.y, sz.z, 1e-3); o.scale.multiplyScalar(k); const c = b.getCenter(new THREE.Vector3()).multiplyScalar(k); o.position.sub(c); const w = new THREE.Group(); w.add(o); return w; };
      if (by.portal) { S.portal = fit(by.portal, 1); S.portal.children[0].rotation.x = Math.PI / 2; S.deco.add(S.portal); }
      if (by.inf) { S.inf = fit(by.inf, 1); S.deco.add(S.inf); }
      if (by.crystal) { S.crys = [fit(by.crystal, 1), fit(by.crystal.clone(), 1)]; S.crys.forEach((c) => S.deco.add(c));
        // the hall's crystal clusters, low at both sides behind the board (in play too), lit in the chapter's colour
        S.side = new THREE.Group(); S.scene.add(S.side);
        [[-1, 1.5, 0], [-1, 1.0, 0.9], [1, 1.6, 0.2], [1, 1.1, -0.8]].forEach(([sd, k, o]) => { const c = fit(by.crystal.clone(), 1); c.userData.sd = sd; c.userData.k = k; c.userData.o = o; c.traverse((m) => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.emissive = new THREE.Color(0x3060ff); m.material.emissiveIntensity = 0.5; } }); S.side.add(c); });
        placeSide(); }
      if (by.dumbbell) S.clasp = fit(by.dumbbell, 1);
      S.deco.traverse((o) => { if (o.isMesh && o.material) { o.material.envMapIntensity = 1.2; } });
      layoutDeco();
    }).catch((e) => console.warn("rings props:", e)) : Promise.resolve();
  }
  // the crystals at the sides of the view, a little below the middle, behind the board (where the view's edge is at that depth)
  function placeSide() {
    if (!S || !S.side || !S.camGoal) return; const cam = S.cam, z = -6, dist = S.camGoal.z - z, vh = 2 * dist * Math.tan((cam.fov * Math.PI) / 360), vw = vh * cam.aspect;
    const off = Math.min(vw / 2 - 0.9, Math.max(S.w / 2 + 3, vw * 0.3)); // (by the board on a wide screen, at the edges on a phone)
    for (const c of S.side.children) { const u = c.userData; c.position.set(S.camGoal.x + u.sd * (off - u.o * 0.4), S.camGoal.y - vh * 0.18 + u.o * 0.8, z); c.scale.setScalar(u.k * Math.max(1.6, vh * 0.09)); c.rotation.z = -u.sd * 0.12; }
  }
  function tintHall(c) { if (!S) return; const k = CH_SKY[c] || CH_SKY[0]; S.sky.material.uniforms.uA.value.setHex(k[0]); S.sky.material.uniforms.uB.value.setHex(k[1]); if (S.side) S.side.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) m.material.emissive.setHex(k[0]); }); }
  // you, in the lobby: your own hero standing by the title, waving (the same hero as in town)
  let heroWait = 0;
  async function heroIn() {
    if (!S || !ctx.K || !ctx.K.makeCharacter || !ctx.hero || ctx.low) return; const look = ctx.hero() || {}, ids = ctx.K.HERO_IDS || ["custom-aron"], ch = ids.includes(look.ch) ? look.ch : ctx.K.HERO_DEFAULT || ids[0], key = ch + ":" + (look.tn | 0), my = ++heroWait;
    if (!S.hero || S.heroKey !== key) {
      const h = await ctx.K.makeCharacter(ch, ctx.ver).catch(() => null); if (!h || my !== heroWait || !S) return;
      if (S.hero) S.scene.remove(S.hero.obj); S.hero = h; S.heroKey = key; if (h.setTint) h.setTint(look.tn | 0);
      h.obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); const b = new THREE.Box3().setFromObject(h.obj); S.heroH = Math.max(0.5, b.max.y - b.min.y); S.scene.add(h.obj);
    }
    S.hero.obj.visible = mode === "lobby"; try { S.hero.play("emote-yes", { once: true }); } catch { /* idle is fine */ }
  }
  function heroPlace() {
    const h = S && S.hero, el = ui && ui.sheet.querySelector(".ir-mascot"); if (!h) return; h.obj.visible = mode === "lobby" && !!el && !ui.sheet.hidden; if (!h.obj.visible) return;
    const r = el.getBoundingClientRect(); if (r.width < 4) { h.obj.visible = false; return; }
    const V = view(), cam = S.cam, z = 4, dist = cam.position.z - z, vh = 2 * dist * Math.tan((cam.fov * Math.PI) / 360), ppu = V.h / vh;
    const x = cam.position.x + ((r.left + r.width / 2 - V.x) / V.w - 0.5) * vh * cam.aspect, y = cam.position.y - ((r.bottom - V.y) / V.h - 0.5) * vh;
    h.obj.position.set(x, y, z); h.obj.scale.setScalar((r.height / ppu) / S.heroH); h.obj.rotation.set(0, 0.35, 0);
  }
  // the bosses' INFINITY core: a glowing ∞ between the two core rings, brighter as the stages fall, gone with the core
  function infMat() { if (S.infM) return S.infM; const c = document.createElement("canvas"); c.width = 256; c.height = 128; const g = c.getContext("2d"); g.translate(128, 64);
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, 64); gr.addColorStop(0, "rgba(160,240,255,.9)"); gr.addColorStop(1, "rgba(60,120,255,0)"); g.fillStyle = gr; g.fillRect(-128, -64, 256, 128);
    g.lineWidth = 13; g.lineCap = "round"; const lg = g.createLinearGradient(-80, 0, 80, 0); lg.addColorStop(0, "#5ab0ff"); lg.addColorStop(0.5, "#ffffff"); lg.addColorStop(1, "#4ff0c8"); g.strokeStyle = lg; g.shadowColor = "#9ff6ff"; g.shadowBlur = 18;
    g.beginPath(); for (let k = 0; k <= 64; k++) { const a = (k / 64) * Math.PI * 2, d = 1 + Math.sin(a) ** 2, x = (78 * Math.cos(a)) / d, y = (78 * Math.sin(a) * Math.cos(a)) / d; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (S.infM = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); }

  // ---------------- ring meshes ----------------
  function mergeGeo(list) {
    let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    for (const g of list) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3); uv.set(g.attributes.uv.array, ov * 2); const I = g.index.array; for (let k = 0; k < I.length; k++) idx[oi + k] = I[k] + ov; ov += c; oi += I.length; g.dispose(); }
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
  }
  function ringGeo(r) { // a C: the arc with its gap centred on the local +x, and round tips
    const k = "r" + r; if (S.geo[k]) return S.geo[k];
    const tb = TUBE * (r > 1 ? 1.3 : 1), seg = Math.round((phone() ? 64 : 96) * Math.min(1.6, r)), t = new THREE.TorusGeometry(r, tb, phone() ? 12 : 18, seg, Math.PI * 2 - GAPW); t.rotateZ(GAPW / 2);
    const tips = [1, -1].map((sg) => { const sp = new THREE.SphereGeometry(tb, phone() ? 12 : 18, 12); sp.translate(r * Math.cos((sg * GAPW) / 2), r * Math.sin((sg * GAPW) / 2), 0); return sp; });
    return (S.geo[k] = mergeGeo([t, ...tips]));
  }
  function bandGeo(r, angles) { // gold clasps round the tube (lock and gear rings)
    const k = "b" + r + angles.join(","); if (S.geo[k]) return S.geo[k];
    const list = angles.map((a) => { const c = new THREE.CylinderGeometry(TUBE * 1.28 * (r > 1 ? 1.3 : 1), TUBE * 1.28 * (r > 1 ? 1.3 : 1), 0.22, 18); c.rotateZ(a); c.translate(r * Math.cos(a), r * Math.sin(a), 0); return c; });
    return (S.geo[k] = mergeGeo(list));
  }
  function pegGeo() { // a silver sleeve round the tube (its axis along the ring), a pin from it into a round base behind
    if (S.geo.peg) return S.geo.peg;
    const sleeve = new THREE.CylinderGeometry(TUBE * 1.32, TUBE * 1.32, 0.34, 20);
    const pin = new THREE.CylinderGeometry(0.075, 0.075, 0.7, 12); pin.rotateX(Math.PI / 2); pin.translate(0, 0, -0.35);
    const base = new THREE.CylinderGeometry(0.3, 0.34, 0.12, 22); base.rotateX(Math.PI / 2); base.translate(0, 0, -0.68);
    return (S.geo.peg = mergeGeo([sleeve, pin, base]));
  }
  function claspGeo() { // a gold sleeve over both tubes where two rings touch: long across the join, its axis along the tubes
    if (S.geo.clasp) return S.geo.clasp;
    const c = new THREE.CylinderGeometry(1, 1, 0.4, 24); c.scale(TUBE * 2.35, 1, TUBE * 1.3);
    const lip = [0.2, -0.2].map((y) => { const t = new THREE.TorusGeometry(1, 0.06, 6, 24); t.rotateX(Math.PI / 2); t.scale(TUBE * 2.4, 1, TUBE * 1.38); t.translate(0, y, 0); return t; });
    return (S.geo.clasp = mergeGeo([c, ...lip]));
  }
  // candy: glossy, saturated, a clear coat on a PC
  function waveMat(color, u, o = {}) {
    return phys ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.12, ...o }) : new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0.06, ...o });
  }
  // a ring's material in the chosen look; base: its resting glow
  function skinMat(col, core) {
    const k = skin(), c = new THREE.Color(col), mix = (h, a) => c.clone().lerp(new THREE.Color(h), a);
    if (k === "neon") return { m: waveMat(c, null, { emissive: c, emissiveIntensity: 0.6, roughness: 0.35, clearcoat: 0 }), base: 0.6 };
    if (k === "crystal") return { m: waveMat(mix(0xffffff, 0.25), null, { emissive: c, emissiveIntensity: 0.25, roughness: 0.04, transparent: true, opacity: 0.82, ...(phys ? { iridescence: 1, iridescenceIOR: 1.6 } : {}) }), base: 0.25 };
    if (k === "gold") return { m: waveMat(mix(0xffc23a, 0.55), null, { emissive: c, emissiveIntensity: 0.12, metalness: 0.85, roughness: 0.24 }), base: 0.12 };
    if (k === "galaxy") return { m: waveMat(mix(0x140a3a, 0.55), null, { emissive: c, emissiveIntensity: 0.5, roughness: 0.3 }), base: 0.5 };
    if (k === "frost") return { m: waveMat(mix(0xeaf8ff, 0.45), null, { emissive: 0x5fc8ff, emissiveIntensity: 0.18, roughness: 0.12 }), base: 0.18 };
    if (k === "lava") return { m: waveMat(mix(0x3a0a00, 0.4), null, { emissive: mix(0xff5a1a, 0.6), emissiveIntensity: 0.55, roughness: 0.5 }), base: 0.55, lava: true };
    if (k === "rainbow") return { m: waveMat(c, null, { emissive: c, emissiveIntensity: 0.3 }), base: 0.3, rainbow: true };
    return { m: waveMat(c, null, { emissive: c, emissiveIntensity: core ? 0.3 : 0.16 }), base: core ? 0.3 : 0.16 };
  }
  function iceGeo(r) { // the frost shell over an ice ring: the same C, a fatter tube
    const k = "i" + r; if (S.geo[k]) return S.geo[k];
    const tb = TUBE * (r > 1 ? 1.3 : 1) * 1.45, t = new THREE.TorusGeometry(r, tb, 10, phone() ? 48 : 72, Math.PI * 2 - GAPW * 1.15); t.rotateZ((GAPW * 1.15) / 2); return (S.geo[k] = t);
  }
  const icons = {};
  function icon(kind, col) { // a small canvas badge in a ring's middle: lock, key, energy arrow, gear
    const k = kind + col; if (icons[k]) return icons[k];
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); g.translate(64, 64);
    g.fillStyle = "rgba(8,14,40,.72)"; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.fill(); g.lineWidth = 5; g.strokeStyle = col; g.stroke();
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = "round"; g.lineJoin = "round";
    if (kind === "lock") { g.lineWidth = 8; g.beginPath(); g.arc(0, -8, 15, Math.PI, 0); g.stroke(); g.fillRect(-23, -8, 46, 34); g.fillStyle = "#0a1230"; g.beginPath(); g.arc(0, 6, 5, 0, Math.PI * 2); g.fill(); g.fillRect(-2.5, 6, 5, 11); }
    else if (kind === "key") { g.lineWidth = 7; g.beginPath(); g.arc(-12, 0, 12, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(28, 0); g.moveTo(20, 0); g.lineTo(20, 11); g.moveTo(28, 0); g.lineTo(28, 9); g.stroke(); }
    else if (kind === "energy") { g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 24, -Math.PI * 0.9, Math.PI * 0.55); g.stroke(); const a = Math.PI * 0.55, x = Math.cos(a) * 24, y = Math.sin(a) * 24; g.beginPath(); g.moveTo(x + 12, y - 4); g.lineTo(x - 2, y + 10); g.lineTo(x - 8, y - 9); g.closePath(); g.fill(); g.font = "900 22px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("⚡", 0, 1); }
    else if (kind === "portal") { g.lineWidth = 6; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, 10 + k * 9, k * 2.1, k * 2.1 + Math.PI * 1.3); g.stroke(); } }
    else if (kind === "ice") { g.lineWidth = 6; for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; g.beginPath(); g.moveTo(Math.cos(a) * 28, Math.sin(a) * 28); g.lineTo(-Math.cos(a) * 28, -Math.sin(a) * 28); g.stroke(); } g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill(); }
    else if (kind === "gear") { g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 22 : 30; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.fillStyle = "#0a1230"; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (icons[k] = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  }
  function clearBoard() {
    for (const r of rings) { S.boardG.remove(r.g); for (const m of r.mats) m.dispose(); }
    for (const c of clasps) c.m.material.dispose(); for (const p of pegs) p.m.material.dispose(); clasps = []; pegs = [];
    rings = []; falls = []; for (const c of S.boardG.children.slice()) S.boardG.remove(c);
  }
  function makeBoard() {
    clearBoard();
    let lockN = 0; const lockCol = {};
    L.rings.forEach((r, i) => { if (r.k === 1 && r.key >= 0) { lockCol[i] = BADGE[lockN % BADGE.length]; lockCol["k" + r.key] = lockCol[i]; lockN++; } });
    L.rings.forEach((r, i) => {
      const g = new THREE.Group(); g.position.set(r.x, r.y, 0); S.boardG.add(g);
      const u = { value: s.g[i] * STEP }, col = r.core ? (r.c === 1 ? 0x3b8dff : 0x2ee0b0) : COLORS[r.c % COLORS.length];
      const sk = skinMat(col, r.core), mat = sk.m, mats = [mat];
      const mesh = new THREE.Mesh(ringGeo(r.r), mat); mesh.rotation.z = u.value; g.add(mesh);
      if (r.k === 1 || r.k === 3 || r.core) { const gm = new THREE.MeshStandardMaterial({ color: r.k === 1 ? 0xe8eef6 : 0xffc23a, metalness: 0.9, roughness: 0.24, emissive: r.k === 1 ? 0x1a2030 : 0x5a3800, emissiveIntensity: 0.35 }); mats.push(gm); const b = new THREE.Mesh(bandGeo(r.r, r.k === 3 ? [Math.PI / 2, Math.PI, Math.PI * 1.5] : [Math.PI * 0.72, Math.PI * 1.28]), gm); mesh.add(b); }
      let ic = null;
      if (r.k === 1 && !r.core) ic = icon("lock", lockCol[i] || "#9ff6ff"); else if (r.k === 2) ic = icon("energy", "#38d8ff"); else if (r.k === 5) ic = icon("portal", "#d08bff"); else if (r.k === 4) ic = icon("ice", "#bff0ff"); else if (r.k === 3) ic = icon("gear", ["#b48cff", "#ffd23a", "#7dff9a"][r.gear % 3]); else if (lockCol["k" + i]) ic = icon("key", lockCol["k" + i]);
      let spr = null; if (ic) { spr = new THREE.Sprite(ic); spr.scale.setScalar(0.62); spr.position.z = 0.32; spr.renderOrder = 4; g.add(spr); }
      if (r.peg >= 0) { const pm = new THREE.Mesh(pegGeo(), (S.pegM || (S.pegM = new THREE.MeshStandardMaterial({ color: 0xeef3fa, metalness: 0.95, roughness: 0.2, emissive: 0x1a2030, emissiveIntensity: 0.4 }))).clone()); pm.position.set(r.x + DIRS[r.peg][0] * r.r, r.y + DIRS[r.peg][1] * r.r, 0.02); pm.rotation.z = Math.atan2(DIRS[r.peg][1], DIRS[r.peg][0]); S.boardG.add(pm); pegs.push({ m: pm, i, warn: 0 }); }
      // an ice ring's frost shell (it shatters on the first turn); a timer ring's count over it; an energy ring's spark
      let ice = null; if (r.k === 4 && s.ice[i]) { ice = new THREE.Mesh(iceGeo(r.r), new THREE.MeshStandardMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.1, emissive: 0x6fd0ff, emissiveIntensity: 0.25, depthWrite: false })); ice.rotation.z = u.value; ice.renderOrder = 2; g.add(ice); }
      let tm = null; if (r.k === 6) { tm = new THREE.Sprite(numMat(Math.max(0, (r.t | 0) - s.moves), "#ffb347")); tm.scale.setScalar(0.7); tm.position.z = 0.4; tm.renderOrder = 7; g.add(tm); }
      let spark = null; if (r.k === 2) { spark = new THREE.Sprite(sparkMat()); spark.scale.setScalar(0.55); spark.renderOrder = 5; g.add(spark); }
      rings.push({ i, g, mesh, u, mat, mats, col, rot: u.value, target: u.value, vel: 0, shake: 0, hl: 0, spr, gone: false, fall: null, base: sk.base, lava: sk.lava, rainbow: sk.rainbow, badge: null, ice, tm, tmN: -1, spark });
    });
    // the clasps: gold where two rings touch, silver on the pegs (made above); each knows its link
    if (!S.goldM) { S.goldM = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.9, roughness: 0.24, emissive: 0x5a3800, emissiveIntensity: 0.35 }); }
    clasps = L.links.map((l) => { const a = L.rings[l[0]], m = new THREE.Mesh(claspGeo(), S.goldM.clone()); const d = DIRS[l[2]]; m.position.set(a.x + d[0] * a.r, a.y + d[1] * a.r, 0.02); m.rotation.z = Math.atan2(d[1], d[0]); S.boardG.add(m); return { m, l, gone: false, t: 0, open: false, pop: 0, warn: 0 }; });
    const xs = L.rings.map((r) => [r.x - r.r, r.x + r.r]).flat(), ys = L.rings.map((r) => [r.y - r.r, r.y + r.r]).flat();
    S.cx = (Math.min(...xs) + Math.max(...xs)) / 2; S.cy = (Math.min(...ys) + Math.max(...ys)) / 2; S.w = Math.max(...xs) - Math.min(...xs) + 0.6; S.h = Math.max(...ys) - Math.min(...ys) + 0.6;
    // a faint dashed thread from each lock to its key ring, and between the two rings of a gear pair (always on)
    if (keyLines) { S.boardG.remove(keyLines); keyLines.geometry.dispose(); keyLines = null; }
    { const v = [], c = []; const add = (a, b, h) => { const k = new THREE.Color(h); v.push(a.x, a.y, 0.4, b.x, b.y, 0.4); c.push(k.r, k.g, k.b, k.r, k.g, k.b); };
      L.rings.forEach((r, i) => { if (r.k === 1 && r.key >= 0) add(r, L.rings[r.key], lockCol[i] || "#ffd23a"); });
      (L.gears || []).forEach((gp) => { if (gp.length === 2) add(L.rings[gp[0]], L.rings[gp[1]], 0xb48cff); });
      L.rings.forEach((r, i) => { if (r.k === 5 && r.twin > i) add(r, L.rings[r.twin], 0xd08bff); });
      if (v.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
        keyLines = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.55, depthTest: false })); keyLines.computeLineDistances(); keyLines.renderOrder = 4; S.boardG.add(keyLines); } }
    // a boss: the INFINITY core's ∞ between its two big rings
    if (S.infCore) { S.boardG.remove(S.infCore); S.infCore = null; }
    if (L.boss) { const cs = L.rings.filter((r) => r.core); if (cs.length === 2) { const sp = new THREE.Sprite(infMat()); sp.position.set((cs[0].x + cs[1].x) / 2, (cs[0].y + cs[1].y) / 2, 0.9); sp.scale.set(4.2, 2.1, 1); sp.renderOrder = 8; sp.material.depthTest = false; sp.material.opacity = 0.7; S.boardG.add(sp); S.infCore = sp; } }
    tintHall(/^\d+$/.test(lvId) ? chOf(Number(lvId)) : /^w:/.test(lvId) ? 5 : /^t:/.test(lvId) ? 7 : /^d:/.test(lvId) ? 1 : 4);
    layoutDeco(); paintXray();
  }
  function layoutDeco() {
    if (!S) return; const R = Math.max(S.w, S.h) * 0.62 + 0.8;
    if (S.portal) { S.portal.position.set(S.cx, S.cy, -1.6); S.portal.scale.setScalar(R * 2.15); }
    if (S.inf) { S.inf.position.set(S.cx, S.cy + S.h / 2 + 0.9, -0.4); S.inf.scale.setScalar(phone() ? 1.5 : 1.8); }
    if (S.crys) S.crys.forEach((c, k) => { c.position.set(S.cx + (k ? 1 : -1) * (S.w / 2 + (phone() ? 1.2 : 2.6)), S.cy - S.h / 2 + 0.6, -3.5); c.scale.setScalar(phone() ? 2 : 2.8); });
    if (S.glowDisc) { S.glowDisc.position.set(S.cx, S.cy, -2.5); S.glowDisc.scale.setScalar(Math.max(S.w, S.h) * 1.6 + 2); }
  }
  function paintXray() {
    if (!S) return; S.xr.visible = xray && mode === "play"; if (!S.xr.visible) return;
    const v = [], c = [], col = (h) => { const x = new THREE.Color(h); return [x.r, x.g, x.b]; }, G = col(0x39ff88), Rd = col(0xff4d6d), Y = col(0xffd23a), Pu = col(0xb48cff);
    const seg = (a, b, k) => { v.push(a[0], a[1], 0.45, b[0], b[1], 0.45); c.push(...k, ...k); };
    for (const l of L.links) { if (!s.alive[l[0]] || !s.alive[l[1]]) continue; const a = L.rings[l[0]], b = L.rings[l[1]]; seg([a.x, a.y], [b.x, b.y], s.g[l[0]] === l[2] || s.g[l[1]] === l[3] ? G : Rd); }
    L.rings.forEach((r, i) => { if (!s.alive[i]) return; if (r.peg >= 0) seg([r.x, r.y], [r.x + DIRS[r.peg][0] * r.r, r.y + DIRS[r.peg][1] * r.r], s.g[i] === r.peg ? G : Rd); if (r.k === 1 && r.key >= 0 && s.alive[r.key]) { const k = L.rings[r.key]; seg([r.x, r.y], [k.x, k.y], Y); } });
    (L.gears || []).forEach((gp) => { const al = gp.filter((j) => s.alive[j]); if (al.length === 2) seg([L.rings[al[0]].x, L.rings[al[0]].y], [L.rings[al[1]].x, L.rings[al[1]].y], Pu); });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); S.xr.geometry.dispose(); S.xr.geometry = g;
  }
  function burst(x, y, color, n = 26, k = 1) {
    const c = new THREE.Color(color);
    for (let q = 0, j = 0; q < S.P.length && j < n; q++) { const p = S.P[q]; if (p.life > 0) continue; j++; const a = Math.random() * Math.PI * 2, sp = (1.2 + Math.random() * 3.2) * k; Object.assign(p, { t: 0, life: 0.6 + Math.random() * 0.6, x, y, z: 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1.2, vz: (Math.random() - 0.3) * 2 }); S.pc[q * 3] = c.r; S.pc[q * 3 + 1] = c.g; S.pc[q * 3 + 2] = c.b; }
    S.pts.geometry.attributes.color.needsUpdate = true;
  }
  // ---------------- the camera: the board fills the room between the top bar and the bottom bar ----------------
  function frame() {
    const V = view(), cam = S.cam, H = V.h, k = scaleK() * (V.h / innerHeight), tipH = ui && !ui.tip.hidden && mode === "play" ? ui.tip.offsetHeight + 10 : 0, top = ((phone() ? 128 : 112) + tipH) * k, bot = (phone() ? 150 : 140) * k, fh = Math.max(0.35, 1 - (top + bot) / H);
    cam.aspect = V.w / V.h; cam.updateProjectionMatrix();
    const tan = Math.tan((cam.fov * Math.PI) / 360), extra = L && L.boss ? 0.9 : 0.3;
    const d = Math.max((S.h + extra) / fh / (2 * tan), (S.w + extra + 0.5) / (phone() ? 0.9 : 0.95) / (2 * tan * cam.aspect), 7); // (a margin at the sides: a ring's tube and its pegs stay inside)
    const vis = 2 * d * tan, ndc = (bot - top) / H, shift = (ndc * vis) / 2, tilt = 0; // straight on: a ring is a true circle
    // the camera eases to its place (a tip coming or going moves the board a little, not with a jump); a new board jumps
    S.camGoal = new THREE.Vector3(S.cx, S.cy - shift - d * Math.sin(tilt), d * Math.cos(tilt));
    if (!S.camBase || frame.jump) { S.camBase = S.camGoal.clone(); cam.position.copy(S.camBase); } frame.jump = false; cam.rotation.set(0, 0, 0);
    placeSide();
  }

  // ---------------- a board ----------------
  function startBoard(id) {
    const Lv = level(id); if (!Lv) { ctx.toast(T("The puzzle hall couldn't load: {e}", { e: "level" })); return; }
    L = Lv; lvId = id; s = stateOf(L); moves = []; hist = []; hintsUsed = 0; hintsLeft = ta ? 0 : RINGS.HINTS; hammerArmed = false; boardT = 0; doneT = -1; stage = 0; frame.jump = true;
    if (chal && chal.id !== id) chal = null;
    if (ghost) { S.boardG.remove(ghost.m); ghost = null; }
    makeBoard(); frame(); mode = "play"; ui.sheet.hidden = true; ui.top.hidden = false; ui.bar.hidden = false; ui.root.classList.remove("menu");
    const ss = ctx.sess && ctx.sess();
    runP = paying(id) && ss && ctx.post ? ctx.post({ action: "world-rings-start", ...ss, lv: id }).then((r) => (r && r.ok && r.j && r.j.runId ? r.j : null)).catch(() => null) : Promise.resolve(null);
    paintHud(); if (!ta) tipFor(); else tipHide();
    if (ui.hand) { ui.hand.remove(); ui.hand = null; }
    // the first level: a hand that taps, and two curved arrows round the ring showing which way it turns
    if (id === "1" && !bestOf("1")) { ui.hand = document.createElement("i"); ui.hand.className = "ir-hand"; ui.hand.innerHTML = `<svg class="ir-curl" viewBox="-60 -60 120 120" aria-hidden="true"><path d="M-38 -26 A46 46 0 0 1 26 -38"/><path d="M38 26 A46 46 0 0 1 -26 38"/></svg><span>👆</span>`; ui.root.appendChild(ui.hand); }
    if (L.boss && !ta) cutIn(id === "200" ? "RIFT BOSS" : "INFINITY BOSS", T("Free every small ring, then the core unlocks."));
    if (chal) banner(T("Beat {name}: {n} moves", { name: chal.by || T("your friend"), n: chal.vs }));
  }
  // a boss's entrance: a wide band across the middle with its name
  function cutIn(name, line) { if (!ui) return; const el = document.createElement("div"); el.className = "ir-cut"; el.innerHTML = `<i></i><b>${esc(name)}</b><small>${esc(line)}</small>`; ui.root.appendChild(el); snd("level"); setTimeout(() => el.remove(), 2400); }
  function banner(t) { if (!ui) return; const el = document.createElement("div"); el.className = "ir-banner"; el.textContent = t; ui.root.appendChild(el); setTimeout(() => el.remove(), 2600); }
  // the frames for the device health board (world-diag kind "rings"): after 40 s of play, then every 3 minutes
  let ft = [], ftNext = 40, ftSent = 0;
  const fpsBand = (f) => (f < 15 ? 0 : f < 20 ? 1 : f < 25 ? 2 : f < 30 ? 3 : f < 40 ? 4 : f < 50 ? 5 : f < 55 ? 6 : 7);
  function sample(dt) {
    if (dt <= 0 || dt > 1 || document.hidden) return; ft.push(dt * 1000); if (playT < ftNext || ftSent >= 4 || ft.length < 120 || !ctx.post) return;
    ftSent++; ftNext = playT + 180; const a = ft.sort((x, y) => x - y); ft = [];
    try { if (!/[?&]nodiag\b/.test(location.search) && !navigator.webdriver) ctx.post({ action: "world-diag", kind: "rings", dev: ctx.coarse ? "phone" : "pc", q: String(ctx.quality || "auto"), fam: ctx.fam || "other", p50: fpsBand(1000 / a[Math.floor(a.length * 0.5)]), p10: fpsBand(1000 / a[Math.min(a.length - 1, Math.floor(a.length * 0.9))]) }).catch(() => {}); } catch { /* the health board waits */ }
  }
  function tipFor() {
    const n = /^\d+$/.test(lvId) ? Number(lvId) : 0, has = (k) => L.rings.some((r) => r.k === k);
    const want = L.boss ? "boss" : n === 1 ? "first" : has(4) && !prog.tips.ice ? "ice" : has(5) && !prog.tips.portal ? "portal" : has(6) && !prog.tips.timer ? "timer" : L.rings.some((r) => r.peg >= 0) && !prog.tips.peg ? "peg" : has(1) && !prog.tips.lock ? "lock" : has(2) && !prog.tips.energy ? "energy" : has(3) && !prog.tips.gear ? "gear" : null;
    if (!want || (want !== "first" && want !== "boss" && prog.tips[want])) { tipHide(); return; }
    showTip(want);
  }
  // a tip sits under the top bar; the board makes room for it (the camera eases down) and takes the room back after
  function showTip(k) { prog.tips[k] = 1; save(); ui.tip.innerHTML = `<b>${esc(T(TIPS[k]))}</b>`; ui.tip.hidden = false; clearTimeout(ui.tipT); ui.tipT = setTimeout(tipHide, 9000); if (S && L) frame(); }
  function tipHide() { if (!ui || ui.tip.hidden) return; ui.tip.hidden = true; clearTimeout(ui.tipT); if (S && L && mode === "play") frame(); }
  function doMove(i, dir) {
    if (mode !== "play" || !s.alive[i]) return false;
    if (hammerArmed) { hammerArmed = false; ui.root.classList.remove("hammer"); const before = cloneState(s), w = hammerOn(L, s, i); if (!w) return false; moves.push([i, 0]); hist.push({ s: before, fell: true }); hammerFx(i); schedule(w, 0.3); paintHud(); return true; }
    const set = turnSet(L, s, i, dir);
    if (!set) { const r = L.rings[i]; rings[i].shake = 0.35; snd("bad"); flash(r.k === 2 && dir === 1 ? T("Clockwise only") : T("Locked — its key ring must fall first")); return false; }
    const before = cloneState(s), w = turn(L, s, i, dir), cracked = !!(before.ice && before.ice[i]);
    moves.push([i, dir]); hist.push({ s: before, fell: w.length > 0 });
    if (cracked) crack(i); else for (const j of set) { rings[j].target += dir * STEP; rings[j].vel += dir * 3; }
    snd("pick"); if (navigator.vibrate && ctx.coarse) try { navigator.vibrate(8); } catch { /* fine */ }
    schedule(w); paintHud(); paintXray();
    if (w.length && !prog.tips.fall && hist.length > 1) showTip("fall");
    const lo = lost(L, s); if (lo >= 0 && !cleared(s)) lose(lo);
    return true;
  }
  // an ice ring's first turn: the shell shatters (white shards, a crack), the ring itself stays put
  function crack(i) {
    const R = rings[i], r = L.rings[i]; if (!R) return; if (R.ice) R.ice.visible = false; R.shake = 0.25; snd("unlock");
    burst(r.x, r.y, 0xdff6ff, 34, 1.3); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; burst(r.x + Math.cos(a) * r.r, r.y + Math.sin(a) * r.r, 0x9fe8ff, 3, 0.6); }
    if (R.spr) R.spr.visible = false;
  }
  // the hammer: it comes down on the ring from above (a thump, a shake), then the ring flies
  function hammerFx(i) {
    snd("ko"); const r = L.rings[i]; if (!ui) return; tv.set(r.x, r.y + r.r * 0.3, 0.4).project(S.cam); const V = view(), k = scaleK();
    const el = document.createElement("i"); el.className = "ir-hammerfx"; el.textContent = "🔨"; el.style.left = (V.x + ((tv.x + 1) / 2) * V.w) / k + "px"; el.style.top = (V.y + ((1 - tv.y) / 2) * V.h) / k + "px"; ui.root.appendChild(el); setTimeout(() => el.remove(), 700);
    setTimeout(() => { if (!S) return; shake = 0.4; burst(r.x, r.y, 0xffd23a, 40, 1.6); burst(r.x, r.y, 0xffffff, 16, 2.2); }, 230);
  }
  // a timer ring ran out: the board is lost (try again)
  function lose(i) {
    mode = "lost"; tipHide(); const R = rings[i]; if (R) { R.shake = 0.8; R.hl = 1.6; } snd("bad"); shake = 0.3;
    if (ta) { taEnd(); return; }
    setTimeout(() => { if (!ui || mode !== "lost") return; ui.sheet.innerHTML = `<div class="ir-done lost"><h3>${esc(T("Time's up!"))}</h3><p class="ir-sum">${esc(T("The timer ring didn't fall in time."))}</p><div class="ir-acts"><button type="button" class="ir-btn go" data-a="retry">${esc(T("Retry"))}</button><button type="button" class="ir-btn" data-a="menu">${esc(T("All levels"))}</button></div></div>`; ui.sheet.hidden = false; ui.bar.hidden = true; }, 700);
  }
  // the falls, wave by wave; a second wave and on is a chain (a rising note, CHAIN ×n)
  function schedule(waves, delay = 0) { waves.forEach((w, k) => w.forEach((i, j) => falls.push({ i, at: boardT + delay + 0.14 + k * 0.24 + j * 0.03, k, n: waves.length }))); }
  function chainPop(k) {
    if (!ui) return; const el = document.createElement("div"); el.className = "ir-chain"; el.innerHTML = `CHAIN <b>×${k + 1}</b>`; ui.root.appendChild(el); setTimeout(() => el.remove(), 1100);
    if (k >= 2) { shake = Math.min(0.35, 0.1 + k * 0.06); slowT = 0.5; const v = document.createElement("i"); v.className = "ir-vig"; ui.root.appendChild(v); setTimeout(() => v.remove(), 700); }
    el.style.setProperty("--k", Math.min(4, k)); // (the text grows with the chain)
  }
  function drop(i, k = 0) {
    const R = rings[i]; if (!R || R.gone) return; R.gone = true; const r = L.rings[i];
    // off the hook: it slides away from its gap first (the clasp slips out through it), then pops up and drops spinning
    const gd = DIRS[s.g[i]] || [0, 1];
    R.fall = { t: 0, sx0: r.x, sy0: r.y, ox: -gd[0] * 0.55, oy: -gd[1] * 0.55, vx: (r.x - S.cx) * 0.35 - gd[0] * 1.2 + (Math.random() - 0.5) * 0.8, vy: 3.2 + Math.random(), vz: 1.6 + Math.random(), sx: (Math.random() - 0.5) * 7, sy: (Math.random() - 0.5) * 7, slid: false };
    burst(r.x, r.y, R.col, r.core ? 60 : 26, r.core ? 1.6 : 1); snd(r.core ? "win" : "unlock"); if (k) { snd("chain", k); }
    if (R.spr) R.spr.visible = false; if (R.tm) R.tm.visible = false; if (R.spark) R.spark.visible = false;
    const Lnow = L;
    // a key fell: a spark runs along the dashed thread to its lock, and the lock bursts open
    L.rings.forEach((o, j) => { if (o.k === 1 && o.key === i && s.alive[j]) { for (let q = 1; q <= 6; q++) setTimeout(() => { if (S && L === Lnow) burst(r.x + ((o.x - r.x) * q) / 6, r.y + ((o.y - r.y) * q) / 6, 0xffd23a, 4, 0.4); }, q * 55); setTimeout(() => { if (S && L === Lnow && rings[j]) { burst(o.x, o.y, 0xffd23a, 30, 1.2); rings[j].hl = 0.9; snd("clasp"); } }, 380); } });
    // a portal: both rings flash violet and go together
    if (r.k === 5) { burst(r.x, r.y, 0xd08bff, 30, 1.4); const tw = L.rings[r.twin]; if (tw) burst(tw.x, tw.y, 0xd08bff, 30, 1.4); }
    // the boss's core cracks a little with every ring that falls, and blazes when its last core ring goes
    if (S.infCore) { if (r.core) { if (L.rings.every((o, j) => !o.core || !s.alive[j])) { burst(S.infCore.position.x, S.infCore.position.y, 0x9ff6ff, 90, 2.4); shake = 0.5; S.infCore.visible = false; } } else { S.infHit = 0.35; } }
    paintXray();
  }
  // what still holds a ring: its shut clasps (and its peg, if it isn't on it) blink red, and a badge says how many
  function stuck(i) {
    let n = 0;
    for (const c of clasps) { if (c.gone || (c.l[0] !== i && c.l[1] !== i)) continue; if (!(s.g[c.l[0]] === c.l[2] || s.g[c.l[1]] === c.l[3])) { c.warn = 0.9; n++; } }
    for (const p of pegs) if (p.i === i && s.alive[i] && s.g[i] !== L.rings[i].peg) { p.warn = 0.9; n++; }
    const R = rings[i]; if (!R) return; if (R.badge) { R.g.remove(R.badge); R.badge = null; }
    if (n > 0) { R.badge = new THREE.Sprite(numMat(n)); R.badge.scale.setScalar(0.5); R.badge.position.set(0, L.rings[i].r * 0.55, 0.6); R.badge.renderOrder = 7; R.g.add(R.badge); R.badgeT = 1.4; }
  }
  const nums = {};
  function sparkMat() { if (nums.spark) return nums.spark; const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(120,230,255,.8)"); gr.addColorStop(1, "rgba(40,140,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return (nums.spark = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); }
  function numMat(n, bg = "#ff3b4a") { const nk = n + bg; if (nums[nk]) return nums[nk]; const c = document.createElement("canvas"); c.width = c.height = 96; const g = c.getContext("2d"); g.fillStyle = bg; g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = "#fff"; g.stroke(); g.fillStyle = "#fff"; g.font = "900 50px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 48, 52); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (nums[nk] = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); }
  function undo() {
    if (mode !== "play" || !hist.length) return;
    const h = hist[hist.length - 1]; if (h.fell) { flash(T("Can't undo a fall")); snd("bad"); return; }
    hist.pop(); const m = moves.pop(), was = s; s = h.s;
    if (s.ice && s.ice[m[0]] && !(was.ice && was.ice[m[0]])) { const R = rings[m[0]]; if (R.ice) R.ice.visible = true; if (R.spr) R.spr.visible = true; snd("pick"); paintHud(); paintXray(); return; } // (an ice crack undone: the shell comes back)
    const set = L.rings[m[0]].gear >= 0 ? L.gears[L.rings[m[0]].gear].filter((j) => s.alive[j]) : [m[0]];
    for (const j of set) rings[j].target -= m[1] * STEP; snd("pick"); paintHud(); paintXray();
  }
  function useHint() {
    if (mode !== "play" || ta) return; if (hintsLeft <= 0 && prog.bag <= 0) { flash(T("No hints left")); return; }
    const h = hintOf(L, s); if (!h) return; if (hintsLeft > 0) hintsLeft--; else { prog.bag--; save(); } if (!hintsUsed) flash(T("A hint caps this board at 2 stars")); hintsUsed++;
    rings[h[0]].hl = 2.4; rings[h[0]].hlDir = h[1]; ui.arrow.innerHTML = `<svg class="${h[1] > 0 ? "ccw" : "cw"}" viewBox="-30 -30 60 60" aria-hidden="true"><path d="${h[1] > 0 ? "M18 -14 A22 22 0 1 0 22 6 M18 -14 l-9 1 M18 -14 l2 9" : "M-18 -14 A22 22 0 1 1 -22 6 M-18 -14 l9 1 M-18 -14 l-2 9"}"/></svg>`; ui.arrowRing = h[0]; ui.arrowT = 2.4; snd("up"); paintHud();
    if (ghost) { S.boardG.remove(ghost.m); ghost.m.material.dispose(); }
    const R = rings[h[0]], gm = new THREE.Mesh(R.mesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })); gm.position.copy(R.g.position); gm.position.z = 0.25; gm.renderOrder = 3; S.boardG.add(gm); ghost = { m: gm, i: h[0], d: h[1], t: 2.4 };
  }
  // a friend challenge: a link to this very board and your moves; it opens the same puzzle for them (no server needed —
  // the same id makes the same board everywhere)
  function share() {
    const name = (ctx.name && ctx.name()) || "", ss = ctx.sess && ctx.sess(), me = ss && ss.wallet ? String(ss.wallet).toLowerCase() : "";
    const url = `${location.origin}/play?rings=${encodeURIComponent(lvId)}&vs=${s.moves}${name ? "&by=" + encodeURIComponent(name.slice(0, 16)) : ""}${me ? "&w=" + me : ""}`; // (w: your friend's clear lands in your challenge box)
    const text = T("Can you beat my {n} moves on INFINITY RINGS?", { n: s.moves });
    try { if (navigator.share) { navigator.share({ title: "INFINITY RINGS", text, url }).catch(() => {}); return; } } catch { /* copied instead */ }
    try { navigator.clipboard.writeText(text + " " + url).then(() => flash(T("Link copied — send it to a friend")), () => flash(url)); } catch { flash(url); }
  }
  // a 1200×630 share card: the board as it stood at the start (drawn again for a moment), the stars and the moves
  function shareCard() {
    if (!ctx.share || !L) return; let art = "";
    try { const keep = s; s = stateOf(L); makeBoard(); frame.jump = true; frame(); S.cam.position.copy(S.camBase); st.renderer.render(S.scene, S.cam); art = st.renderer.domElement.toDataURL("image/jpeg", 0.85); s = keep; clearBoard(); } catch { art = ""; }
    const stars = Number(ui.sheet.dataset.stars) || 0, n = /^\d+$/.test(lvId) ? Number(lvId) : 0, title = L.boss ? (lvId === "200" ? "RIFT BOSS" : "INFINITY BOSS") : ui.title.textContent;
    ctx.share({ kind: "rings", tag: "INFINITY RINGS", title: T("{t} cleared!", { t: title }), sub: n ? T(CHAPTERS[chOf(n)].name) : "", accent: stars >= 3 ? "#ffd23a" : "#38d8ff", emoji: "♾️", art, cover: true,
      rows: [[T("Stars"), "★".repeat(stars) + "☆".repeat(3 - stars), "⭐"], [T("Moves"), `${s.moves} / ${T("Par {n}", { n: L.par })}`, "🔄"], [T("Rings"), String(L.rings.length), "⭕"]],
      text: T("I cleared {t} in {n} moves on INFINITY RINGS! ♾️ Can you do it in fewer?", { t: title, n: s.moves }) });
  }
  function restart() { if (mode === "play" || mode === "done" || mode === "lost") { const id = lvId; runP = null; startBoard(id); } }
  function flash(t) { ui.flash.textContent = t; ui.flash.hidden = false; ui.flash.classList.remove("go"); void ui.flash.offsetWidth; ui.flash.classList.add("go"); clearTimeout(ui.flashT); ui.flashT = setTimeout(() => { if (ui) ui.flash.hidden = true; }, 1800); }

  // ---------------- the clear ----------------
  async function finish() {
    mode = "done"; tipHide(); const stars = starsOf(L, s.moves, s.hammer, hintsUsed), key = keyOf(lvId), was = bestOf(lvId), prevMoves = prog.moves[key] || 0;
    const newBest = stars > (prog.best[key] || 0); if (newBest) prog.best[key] = stars; if (!prog.moves[key] || s.moves < prog.moves[key]) prog.moves[key] = s.moves;
    const n = /^\d+$/.test(lvId) ? Number(lvId) : 0, endless = /^e:/.test(lvId), weekly = /^w:/.test(lvId); if (endless) prog.endless = Math.max(prog.endless, Number(lvId.slice(2)) + 1);
    // the week: all seven days cleared → five hints into the bag, once
    let wkBonus = false; if (weekly) { const wk = lvId.slice(2, 9); if (!prog.wk[wk] && [0, 1, 2, 3, 4, 5, 6].every((d) => bestOf(`w:${wk}:${d}`) > 0)) { prog.wk[wk] = 1; prog.bag += 5; wkBonus = true; } }
    save();
    const xp = endless ? 20 : weekly ? (was ? 5 : 40) : /^d:/.test(lvId) ? (was ? 5 : 30) : was ? 5 : Math.min(60, 10 + Math.floor(n * 0.4));
    if (ctx.gain && xp > 0) try { ctx.gain(xp, "rings"); } catch { /* the clear still counts */ }
    celebrate(stars); snd("win");
    const sheet = ui.sheet, signed = paying(lvId), better = prevMoves && s.moves < prevMoves ? prevMoves - s.moves : 0;
    const coin = `<img src="/images/arcl-64.png" alt="" width="34" height="34">`, conf = Array.from({ length: 26 }, (_, k) => `<i style="--x:${(k * 37) % 100}%;--d:${(k % 7) * 0.12}s;--h:${(k * 47) % 360}"></i>`).join("");
    sheet.innerHTML = `<div class="ir-done"><div class="ir-confetti">${conf}</div><h3>${esc(T("CLEAR!"))}</h3><div class="ir-stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? "on" : ""}" style="animation-delay:${0.15 + k * 0.22}s">★</i>`).join("")}</div>
      <p class="ir-sum">${esc(T("Moves {n}", { n: s.moves }))} · ${esc(T("Par {n}", { n: L.par }))}${newBest && was ? ` · <b>${esc(T("New best!"))}</b>` : ""}${better ? ` · <b>${esc(T("{n} fewer moves!", { n: better }))}</b>` : ""}</p>
      <div class="ir-pay${signed ? "" : " plain"}">${signed ? `<div class="ir-payl">${coin}<b>${esc(T("Sending your clear…"))}</b></div>` : `<div class="ir-payl"><b>${endless || weekly ? esc(T("XP only")) : esc(T("Guest play: sign in to earn ARCL"))}</b></div>`}<div class="ir-xpl"><i>XP</i><b>+${xp} ${esc(T("World XP"))}</b></div>${wkBonus ? `<div class="ir-xpl"><i>💡</i><b>${esc(T("The whole week: +5 hints"))}</b></div>` : ""}</div>
      ${chal ? `<p class="ir-vs ${s.moves < chal.vs ? "win" : s.moves === chal.vs ? "tie" : ""}">${esc(s.moves < chal.vs ? T("You beat {name}! {a} moves to {b}", { name: chal.by || T("your friend"), a: s.moves, b: chal.vs }) : s.moves === chal.vs ? T("A tie with {name}: {a} moves each", { name: chal.by || T("your friend"), a: s.moves }) : T("{name} wins this time: {b} moves to your {a}", { name: chal.by || T("your friend"), a: s.moves, b: chal.vs }))}</p>` : ""}
      <div class="ir-acts two"><button type="button" class="ir-btn share" data-a="share">${svg("M18 8a3 3 0 1 0-2.8-4M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4")}${esc(T("Challenge a friend"))}</button><button type="button" class="ir-btn card" data-a="card">${esc(T("Share card"))}</button></div>
      <div class="ir-acts">${(n && n < LEVELS) || endless || (weekly && Number(lvId.slice(-1)) < seoulWeek().day && lvId.slice(2, 9) === seoulWeek().id) ? `<button type="button" class="ir-btn go" data-a="next">${esc(T("Next"))} ▶</button>` : ""}<button type="button" class="ir-btn" data-a="retry">${esc(T("Retry"))}</button><button type="button" class="ir-btn" data-a="menu">${esc(T("All levels"))}</button></div></div>`;
    sheet.dataset.stars = stars;
    setTimeout(() => { if (mode === "done" && ui) { sheet.hidden = false; ui.bar.hidden = true; snd("level"); } }, 650);
    if (n === 100 && stars > 0 && !prog.master) { prog.master = true; save(); try { if (ctx.onMaster) ctx.onMaster(); } catch { /* the title waits for the next visit */ } setTimeout(() => ctx.toast(`<b>${esc(T("INFINITY MASTER!"))}</b> ${esc(T("You cleared all 100 levels. The title is yours."))}`), 1800); }
    if (n === 200 && stars > 0 && !prog.legend) { prog.legend = true; save(); try { if (ctx.onLegend) ctx.onLegend(); } catch { /* the title waits for the next visit */ } setTimeout(() => ctx.toast(`<b>${esc(T("INFINITY LEGEND!"))}</b> ${esc(T("You cleared all 200 levels. The title is yours."))}`), 1800); }
    if (!signed) return;
    const box = sheet.querySelector(".ir-pay");
    let res = null; try { const rr = await runP; if (rr) res = await ctx.post({ action: "world-rings-end", ...ctx.sess(), runId: rr.runId, moves, hints: hintsUsed, ...(chal && chal.w ? { vs: { w: chal.w, moves: chal.vs } } : {}) }); } catch { res = null; }
    if (!box.isConnected) return;
    const j = res && res.ok && res.j, pl0 = box.querySelector(".ir-payl") || box;
    if (!j) { pl0.innerHTML = `<b>${esc(T("The reward couldn't be sent — try again later"))}</b>`; return; }
    if (status) { status.today = j.today; status.best = { ...(status.best || {}), [key]: Math.max(j.stars, (status.best || {})[key] || 0) }; if (j.master) status.master = true; }
    const pl = box.querySelector(".ir-payl") || box;
    if (j.credited > 0) { box.classList.add("paid"); pl.innerHTML = `<img src="/images/arcl-64.png" alt="" width="34" height="34"><b>${esc(T("+{n} ARCL", { n: fmt(j.credited) }))}</b>${j.bonus ? `<small>${esc(T("All three daily puzzles at 3 stars: +{n} bonus", { n: fmt(j.bonus) }))}${j.streak > 1 ? " · " + esc(T("{n}-day streak!", { n: j.streak })) : ""}</small>` : ""}`; snd("coin"); if (ctx.refresh) ctx.refresh(); }
    else pl.innerHTML = `<b>${esc(j.why === "cap" ? T("Today's ARCL limit is reached — these stars pay on your next clear") : T("Stars already paid on this board"))}</b>`;
    if (j.master && ctx.onMaster) try { ctx.onMaster(); } catch { /* fine */ }
    if (j.legend && ctx.onLegend) try { ctx.onLegend(); } catch { /* fine */ }
  }

  // the clear: stars fly up into the gauge, an ∞ of light is drawn round the board, gold coins rain; the boss's
  // clear brings the ∞ itself into the middle, turning
  function celebrate(stars) {
    burst(S.cx, S.cy, 0x8ff0ff, 50, 2);
    const R0 = Math.max(S.w, S.h) * 0.32;
    for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2, d = 1 + Math.sin(a) ** 2, x = S.cx + (R0 * 1.4 * Math.cos(a)) / d, y = S.cy + (R0 * Math.sin(a) * Math.cos(a)) / d; setTimeout(() => { if (S) burst(x, y, k % 2 ? 0x5aa8ff : 0x2ee0b0, 2, 0.25); }, k * 12); }
    for (let k = 0; k < 6; k++) setTimeout(() => { if (S) burst(S.cx + (Math.random() - 0.5) * S.w, S.cy + S.h / 2 + 1, 0xffc23a, 10, 0.8); }, 200 + k * 120);
    if (ui) { const g = ui.gauge.getBoundingClientRect(); for (let k = 0; k < stars; k++) { const el = document.createElement("i"); el.className = "ir-fly"; el.textContent = "★"; el.style.setProperty("--tx", ((g.left + g.width * [0.9, 0.55, 0.25][k]) / scaleK() - innerWidth / scaleK() / 2) + "px"); el.style.setProperty("--ty", (g.top / scaleK() - innerHeight / scaleK() / 2) + "px"); el.style.animationDelay = k * 0.15 + "s"; ui.root.appendChild(el); setTimeout(() => el.remove(), 1400); } }
    if (L.boss && S.inf) { S.inf.visible = true; S.finale = 0; S.scene.add(S.inf); }
  }

  // ---------------- the lobby ----------------
  async function readStatus() {
    const ss = ctx.sess && ctx.sess(), get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const jobs = [get("/api/social?world=rings-top").then((j) => { board = j; }), get("/api/social?world=rings-ta").then((j) => { taTop = j; })];
    if (ss) { const w = encodeURIComponent(String(ss.wallet).toLowerCase());
      jobs.push(get("/api/social?world=rings&wallet=" + w).then((j) => { status = j; if (j && j.master) { if (!prog.master) { prog.master = true; save(); } try { if (ctx.onMaster) ctx.onMaster(); } catch { /* the title waits */ } } if (j && j.legend) { if (!prog.legend) { prog.legend = true; save(); } try { if (ctx.onLegend) ctx.onLegend(); } catch { /* the title waits */ } } }));
      jobs.push(get("/api/social?world=rings-chal&wallet=" + w).then((j) => { chalBox = j && j.list ? j.list : []; })); }
    await Promise.race([Promise.all(jobs), new Promise((ok) => setTimeout(ok, 4000))]);
  }
  // a hint a day into the bag (up to 9), the first time the hall opens that day
  function refill() { const d = seoulDay(); if (prog.refill === d) return; prog.refill = d; if (prog.bag < 9) { prog.bag++; setTimeout(() => flash(T("A free hint for today: {n} in your bag", { n: prog.bag })), 600); } save(); }
  // a chapter's picture: its first board drawn small (the rings as coloured C's)
  function thumb(cv, n) {
    const Lt = level(String(n)); if (!Lt || !cv.getContext) return; const g = cv.getContext("2d"), xs = Lt.rings.flatMap((r) => [r.x - r.r, r.x + r.r]), ys = Lt.rings.flatMap((r) => [r.y - r.r, r.y + r.r]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = Math.min((cv.width - 12) / (x1 - x0), (cv.height - 12) / (y1 - y0)), ox = (cv.width - (x1 - x0) * k) / 2, oy = (cv.height - (y1 - y0) * k) / 2;
    g.clearRect(0, 0, cv.width, cv.height); g.lineCap = "round";
    for (const r of Lt.rings) { const col = "#" + new THREE.Color(r.core ? (r.c === 1 ? 0x3b8dff : 0x2ee0b0) : COLORS[r.c % COLORS.length]).getHexString(), a = -(r.g * Math.PI) / 4, gw = GAPW / 2;
      g.strokeStyle = col; g.lineWidth = Math.max(3, TUBE * 2 * k); g.shadowColor = col; g.shadowBlur = 6; g.beginPath(); g.arc(ox + (r.x - x0) * k, oy + (y1 - r.y) * k, r.r * k, a + gw, a + Math.PI * 2 - gw); g.stroke(); }
  }
  function openChest(c, k) {
    const need = CHEST[k], got = chStars(c); if (((prog.chest[c] | 0) >> k) & 1) return;
    if (got < need) { flash(T("{n} stars needed", { n: need })); snd("bad"); return; }
    prog.chest[c] = (prog.chest[c] | 0) | (1 << k); const what = []; let xp = 0;
    if (k === 0) { prog.bag += 2; xp = 60; what.push(T("+2 hints")); }
    else if (k === 1) { const sk = SKINS.find((o) => o.ch === c); if (sk) what.push(T("New ring style: {s}", { s: T(sk.name) })); else { prog.bag += 3; what.push(T("+3 hints")); } xp = 120; }
    else { prog.bag += 3; xp = 200; what.push(T("+3 hints")); }
    save(); if (ctx.gain) try { ctx.gain(xp, "rings"); } catch { /* the chest still opened */ } what.push(`+${xp} ${T("World XP")}`);
    const pop = document.createElement("div"); pop.className = "ir-chestpop"; pop.innerHTML = `<div><i class="box">🎁</i><b>${esc(T("Chapter {n}", { n: c + 1 }))} · ★${need}</b>${what.map((w) => `<p>${esc(w)}</p>`).join("")}<button type="button" class="ir-btn go">${esc(T("Nice!"))}</button></div>`;
    ui.root.appendChild(pop); snd("level"); setTimeout(() => { snd("coin"); pop.classList.add("open"); }, 650);
    pop.addEventListener("click", (e) => { if (e.target.closest("button")) { pop.remove(); lobby(); } });
  }
  function chalHtml() {
    if (!(ctx.sess && ctx.sess())) return `<p class="ir-note">${esc(T("Sign in with a wallet to see who took your challenges"))}</p>`;
    if (!chalBox || !chalBox.length) return `<p class="ir-note">${esc(T("No one has taken your challenges yet — send one from a clear"))}</p>`;
    return `<ol class="ir-rank chal">${chalBox.slice(0, 8).map((x) => { const lvName = /^d:/.test(x.lv) ? T("Daily {n}", { n: Number(x.lv.slice(-1)) + 1 }) : T("Level {n}", { n: x.lv }), won = x.vs && x.moves < x.vs; return `<li class="${won ? "lose" : "win"}"><b>${esc(x.name)}</b><span>${esc(lvName)} · ${esc(T("{a} moves (yours {b})", { a: x.moves, b: x.vs || "—" }))}</span></li>`; }).join("")}</ol>`;
  }
  let tab = "levels", openCh = -1;
  function lobby() {
    ta = null; mode = "lobby"; ui.top.hidden = true; ui.bar.hidden = true; tipHide(); ui.tip.hidden = true; ui.root.classList.add("menu"); clearBoard(); S.xr.visible = false;
    const max = cleared1(), nextN = Math.min(LEVELS, max + 1);
    L = level(String(nextN)) || level("1"); lvId = String(nextN); s = stateOf(L); makeBoard(); frame.jump = true; frame(); // the next level stands behind the menu
    refill(); heroIn();
    const signed = !!(ctx.sess && ctx.sess()), cap = (status && status.cap) || RINGS.DAY_ARCL, day = seoulDay(), wk = seoulWeek();
    const tabs = [["levels", T("Levels")], ["daily", T("Daily")], ["weekly", T("Weekly")], ["modes", T("Modes")], ["rank", T("Ranking")]];
    let pane = "";
    // the map: ten chapters of 20; the one you're in open (its picture, its three chests, its levels), the others one line each
    if (tab === "levels") { const cur = openCh >= 0 ? openCh : chOf(nextN);
      pane = CHAPTERS.map((ch, c) => { const from = c * 20 + 1, got = chStars(c), shut = from > max + 1, isOpen = c === cur && !shut;
        if (!isOpen) return `<button type="button" class="ir-chrow${shut ? " shut" : ""}" data-ch="${c}" style="--c:${ch.c}"><b>${esc(T("Chapter {n}", { n: c + 1 }))} · ${esc(T(ch.name))}</b><span>${shut ? "🔒 " : ""}★ ${got} / 60</span></button>`;
        const chest = CHEST.map((need, k) => { const has = ((prog.chest[c] | 0) >> k) & 1, can = !has && got >= need; return `<button type="button" class="ir-chest${has ? " got" : can ? " can" : ""}" data-chest="${c}:${k}"><i>${has ? "📭" : "🎁"}</i><small>★${need}</small></button>`; }).join("");
        const tiles = Array.from({ length: 20 }, (_, k) => { const n = from + k, b = bestOf(String(n)), open = n <= max + 1, per = n > 100 ? RINGS.PAY2 : RINGS.PAY[1], left = signed && open ? (3 - b) * per : 0, boss = n === 100 || n === 200;
          return `<button type="button" class="ir-lv${open ? "" : " shut"}${boss ? " boss" : ""}${b ? " done" : ""}${n === max + 1 ? " next" : ""}" data-lv="${n}" style="--i:${k}"><b>${boss ? "∞" : n}</b><small>${open ? "★".repeat(b) + "☆".repeat(3 - b) : "🔒"}</small>${left ? `<em>+${left}</em>` : ""}</button>`; }).join("");
        return `<section class="ir-ch" style="--c:${ch.c}"><header data-ch="${c}"><b>${esc(T("Chapter {n}", { n: c + 1 }))} · ${esc(T(ch.name))}</b><span>★ ${got} / 60</span></header>
          <div class="ir-chinfo"><canvas class="ir-thumb" data-th="${from}" width="150" height="76"></canvas><small>${esc(T(ch.line))}</small><div class="ir-chests">${chest}</div></div><div class="ir-path">${tiles}</div></section>`; }).join(""); }
    else if (tab === "daily") pane = `<p class="ir-note">${esc(T("The same 3 puzzles for everyone today"))} · ${day}</p><p class="ir-note gold">${esc(T("All three at 3 stars: +{n} ARCL bonus", { n: RINGS.BONUS }))}${status && status.streak && status.streak.n ? " · " + esc(T("{n}-day streak!", { n: status.streak.n })) : ""}</p><div class="ir-daily">${[0, 1, 2].map((k) => { const id = `d:${day}:${k}`, b = bestOf(id); return `<button type="button" class="ir-day" data-lv="${id}"><b>${esc(T("Daily {n}", { n: k + 1 }))}</b><small>${"★".repeat(b) + "☆".repeat(3 - b)}</small><i>${esc(T("Play"))}</i></button>`; }).join("")}</div>`;
    // the week: one theme, a puzzle a day (Monday to Sunday), the week's earlier days still open; all seven → 5 hints
    else if (tab === "weekly") { const th = WEEK_THEMES[(Number(wk.id.slice(0, 4)) * 53 + Number(wk.id.slice(5))) % WEEK_THEMES.length];
      pane = `<p class="ir-note"><b>${esc(T(th.name))}</b> · ${esc(T("Week {w}", { w: wk.id.slice(5) }))}</p><p class="ir-note gold">${esc(T("A new puzzle every day · all 7: +5 hints"))}${prog.wk[wk.id] ? " ✓" : ""}</p><div class="ir-week">${[0, 1, 2, 3, 4, 5, 6].map((d) => { const id = `w:${wk.id}:${d}`, b = bestOf(id), open = d <= wk.day;
        return `<button type="button" class="ir-wd${open ? "" : " shut"}${b ? " done" : ""}${d === wk.day ? " today" : ""}" ${open ? `data-lv="${id}"` : "disabled"}><b>${esc(T("Day {n}", { n: d + 1 }))}</b><small>${open ? "★".repeat(b) + "☆".repeat(3 - b) : "🔒 " + esc(T("in {n} d", { n: d - wk.day }))}</small></button>`; }).join("")}</div>`; }
    else if (tab === "modes") pane = `<div class="ir-modes">
        <div class="ir-mode"><i>⏱️</i><div><b>${esc(T("Time Attack"))}</b><small>${esc(T("Clear as many boards as you can in {n} seconds · XP only", { n: RINGS.TA_SEC }))}</small><small class="gold">${esc(T("Your best: {n}", { n: prog.taBest }))}</small></div><button type="button" class="ir-btn go" data-a="ta">${esc(T("Play"))}</button></div>
        <div class="ir-mode"><i>♾️</i><div><b>${esc(T("Endless #{n}", { n: prog.endless }))}</b><small>${esc(T("Board after board, bigger each time · XP only"))}</small></div><button type="button" class="ir-btn go" data-lv="e:${prog.endless}">${esc(T("Play"))}</button></div>
        <div class="ir-mode col"><b>🎨 ${esc(T("Ring style"))}</b><div class="ir-skins">${SKINS.map((k) => { const okk = skinOk(k.id); return `<button type="button" class="ir-skin sk-${k.id}${skin() === k.id ? " on" : ""}${okk ? "" : " shut"}" data-skin="${k.id}"><i></i><small>${okk ? esc(T(k.name)) : "🔒 " + esc(T("Ch.{n} ★40", { n: k.ch + 1 }))}</small></button>`; }).join("")}</div></div>
        <div class="ir-mode col"><b>⚔️ ${esc(T("Challenge box"))}</b>${chalHtml()}</div></div>`;
    else { const list = (rows, f, none) => (rows && rows.length ? rows.map((x) => `<li><b>${esc(x.name || x.w)}</b><span>${f(x)}</span></li>`).join("") : `<li class="none">${esc(none || T("No stars yet this week — be the first!"))}</li>`);
      pane = `<p class="ir-note">${esc(T("This week's most stars"))}</p><ol class="ir-rank">${list(board && board.top, (x) => "★ " + x.stars)}</ol>` +
        `<p class="ir-note">${esc(T("Time Attack · this week"))}</p><ol class="ir-rank">${list(taTop && taTop.top, (x) => esc(T("{n} boards", { n: x.n })), T("No runs yet this week — be the first!"))}</ol>` +
        [0, 1, 2].map((k) => `<p class="ir-note">${esc(T("Daily {n}", { n: k + 1 }))} · ${esc(T("fewest moves, then fastest"))}</p><ol class="ir-rank">${list(board && board.daily && board.daily[k], (x) => esc(T("Moves {n}", { n: x.moves })) + " · " + (x.ms / 1000).toFixed(1) + "s")}</ol>`).join(""); }
    const play = tab === "levels" ? `<button type="button" class="ir-btn go ir-play" data-lv="${nextN}">▶ ${esc(nextN === 100 || nextN === 200 ? (nextN === 200 ? "RIFT BOSS" : "INFINITY BOSS") : T("Play level {n}", { n: nextN }))}</button>` : "";
    ui.sheet.innerHTML = `<div class="ir-wrap"><div class="ir-hero"><div class="ir-mascot"></div><div class="ir-brand"><span class="ir-logo"><img src="/images/brand/arcircle-world-logo-256.webp" alt="" width="34" height="34"><i>ARCIRCLE<br>WORLD</i></span><h2>${esc(T("INFINITY RINGS"))}</h2><p class="ir-sub">${esc(T("Turn the rings. Unhook them. Clear the board."))}</p></div></div>
      <div class="ir-lobby">
      <div class="ir-prog"><i style="width:${(totalStars() / (LEVELS * 3)) * 100}%"></i><b>★ ${totalStars()} / ${LEVELS * 3}</b><em title="${esc(T("Hints in your bag"))}">💡 ${prog.bag}</em></div>
      <div class="ir-tabs">${tabs.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${esc(t)}</button>`).join("")}</div>
      <div class="ir-pane">${pane}</div>
      <p class="ir-earn">${signed ? esc(T("100 ARCL a new star (101–200: 50) · up to 10,000 a day")) + "<br>" + esc(T("Today: {n} / {m} ARCL", { n: fmt((status && status.today) || 0), m: fmt(cap) })) : esc(T("Sign in with a wallet to earn ARCL here"))}</p>
      <div class="ir-foot${play ? " two" : ""}"><button type="button" class="ir-btn" data-a="leave">${esc(T("Leave"))}</button>${play}</div></div></div>`;
    ui.sheet.hidden = false;
    ui.sheet.querySelectorAll("canvas[data-th]").forEach((cv) => { try { thumb(cv, Number(cv.dataset.th)); } catch { /* no picture */ } });
    const cur = ui.sheet.querySelector(".ir-lv.next") || ui.sheet.querySelector(".ir-lv:not(.done):not(.shut)"); if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ block: "nearest" }); } catch { /* fine */ }
  }
  // ---------------- TIME ATTACK: small boards one after another against the clock (XP; the week's board for a wallet) ----------------
  async function taStart() {
    if (busy) return; const ss = ctx.sess && ctx.sess(); let seed = 1 + Math.floor(Math.random() * 9e8), runId = null;
    if (ss && ctx.post) { busy = true; try { const r = await ctx.post({ action: "world-rings-ta-start", ...ss }); if (r && r.ok && r.j && r.j.seed) { seed = r.j.seed; runId = r.j.runId; } } catch { /* played here, not on the board */ } finally { busy = false; } }
    if (!on) return; ta = { seed, runId, k: 0, n: 0, boards: [], left: RINGS.TA_SEC, end: performance.now() + RINGS.TA_SEC * 1000, done: false }; // (the wall clock: a slow phone's frames don't stretch the minute)
    startBoard(`t:${seed}:0`); banner(T("TIME ATTACK · {n} seconds", { n: RINGS.TA_SEC })); snd("level");
  }
  function taNext() { ta.boards.push(moves.slice()); ta.n++; ta.k++; flash(T("Board {n}!", { n: ta.n })); snd("level"); burst(S.cx, S.cy, 0x9ff6ff, 40, 1.8); startBoard(`t:${ta.seed}:${ta.k}`); }
  async function taEnd() {
    if (!ta || ta.done) return; ta.done = true; mode = "done"; const run = ta, n = run.n, boards = [...run.boards, moves.slice()], best0 = prog.taBest;
    if (n > prog.taBest) prog.taBest = n; save(); const xp = n * 5; if (ctx.gain && xp > 0) try { ctx.gain(xp, "rings"); } catch { /* counted anyway */ }
    snd(n > best0 ? "win" : "level"); celebrate(Math.min(3, n));
    ui.sheet.innerHTML = `<div class="ir-done ta"><h3>${esc(T("TIME'S UP!"))}</h3><p class="ir-big">${n}</p><p class="ir-sum">${esc(T("boards cleared in {n} seconds", { n: RINGS.TA_SEC }))}${n > best0 && best0 ? ` · <b>${esc(T("New best!"))}</b>` : ""}</p>
      <div class="ir-pay plain"><div class="ir-payl"><b class="ir-tarank">${run.runId ? esc(T("Sending your run…")) : esc(T("Your best: {n}", { n: prog.taBest }))}</b></div><div class="ir-xpl"><i>XP</i><b>+${xp} ${esc(T("World XP"))}</b></div></div>
      <div class="ir-acts"><button type="button" class="ir-btn go" data-a="ta">${esc(T("Play again"))}</button><button type="button" class="ir-btn" data-a="menu">${esc(T("All levels"))}</button></div></div>`;
    setTimeout(() => { if (ui && mode === "done") { ui.sheet.hidden = false; ui.bar.hidden = true; } }, 500);
    if (!run.runId) return; let r = null; try { r = await ctx.post({ action: "world-rings-ta-end", ...ctx.sess(), runId: run.runId, boards }); } catch { r = null; }
    const el = ui && ui.sheet.querySelector(".ir-tarank"); if (!el) return; const j = r && r.ok && r.j;
    el.textContent = j ? (j.rank ? T("#{r} on this week's board · best {n}", { r: j.rank, n: j.best }) : T("This week's best: {n}", { n: j.best })) : T("The run couldn't be sent — try again later");
  }

  // ---------------- input ----------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hitP = new THREE.Vector3();
  function boardAt(e) { const V = view(); ndc.set(((e.clientX - V.x) / V.w) * 2 - 1, -((e.clientY - V.y) / V.h) * 2 + 1); ray.setFromCamera(ndc, S.cam); return ray.ray.intersectPlane(plane, hitP) ? { x: hitP.x, y: hitP.y } : null; }
  function ringAt(p) {
    let best = -1, bs = Infinity;
    L.rings.forEach((r, i) => { if (!s.alive[i]) return; const d = Math.hypot(p.x - r.x, p.y - r.y); if (d > r.r + 0.5) return; const sc = d < r.r * 0.55 ? 0.3 + d * 0.1 : Math.abs(d - r.r); if (sc < bs) { bs = sc; best = i; } });
    return best;
  }
  const drag = { on: false, id: -1, ring: -1, a: 0, acc: 0, x0: 0, y0: 0, stepped: false };
  function pd(e) {
    if (mode !== "play" || e.target.closest("button,.ir-sheet,.ir-bar,.ir-top")) return;
    const p = boardAt(e); if (!p) return; const i = ringAt(p); if (i < 0) return; e.preventDefault();
    if (hammerArmed) { doMove(i, 0); return; }
    const r = L.rings[i]; Object.assign(drag, { on: true, id: e.pointerId, ring: i, a: Math.atan2(p.y - r.y, p.x - r.x), acc: 0, x0: e.clientX, y0: e.clientY, stepped: false });
    rings[i].press = 1; try { ui.touch.setPointerCapture(e.pointerId); } catch { /* fine */ }
    tipHide(); if (ui.hand) { ui.hand.remove(); ui.hand = null; }
    stuck(i);
  }
  function pm(e) {
    if (!drag.on || e.pointerId !== drag.id) return; const p = boardAt(e); if (!p) return; const r = L.rings[drag.ring];
    if (Math.hypot(p.x - r.x, p.y - r.y) < 0.35 * r.r) return;
    const a = Math.atan2(p.y - r.y, p.x - r.x); let da = a - drag.a; da = Math.atan2(Math.sin(da), Math.cos(da)); drag.a = a; drag.acc += da;
    // the ring turns with the finger; past 60% of a step it takes that step (and keeps the rest of the turn in hand)
    const rr = L.rings[drag.ring]; if ((rr.k === 2 || rr.cw) && drag.acc > 0) drag.acc = Math.min(drag.acc, 0.12); // (clockwise only: it resists the other way)
    while (drag.acc >= STEP * 0.6) { drag.stepped = true; if (!doMove(drag.ring, 1)) { drag.acc = 0; break; } drag.acc -= STEP; rings[drag.ring].rot += STEP; }
    while (drag.acc <= -STEP * 0.6) { drag.stepped = true; if (!doMove(drag.ring, -1)) { drag.acc = 0; break; } drag.acc += STEP; rings[drag.ring].rot -= STEP; }
  }
  function pu(e) {
    if (!drag.on || e.pointerId !== drag.id) return; drag.on = false; if (rings[drag.ring]) { rings[drag.ring].press = 0; rings[drag.ring].rot += drag.acc; } drag.acc = 0;
    if (!drag.stepped && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 14) doMove(drag.ring, -1);
  }
  const kd = (e) => { if (!on) return; if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (mode === "play" || mode === "done") lobby(); else leave(); } else if (mode === "play" && (e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); } };

  // ---------------- the layer ----------------
  const scaleK = () => (document.documentElement.classList.contains("wp-pcphone") ? innerWidth / 400 : Math.max(1, Math.min(1.25, innerHeight / 860)));
  function fit() { if (!ui) return; const k = scaleK(); Object.assign(ui.root.style, { width: innerWidth / k + "px", height: innerHeight / k + "px", transform: `scale(${k})` }); if (S && L) frame(); }
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  function buildUi() {
    const root = document.createElement("div"); root.className = "ir"; root.hidden = true;
    root.innerHTML = `<div class="ir-touch"></div>
      <div class="ir-top" data-game-hud><button type="button" class="ir-back" data-a="menu" aria-label="${esc(T("All levels"))}">${svg("M15 5l-7 7 7 7")}</button>
        <div class="ir-title"><b></b><small class="ir-iq"></small></div>
        <button type="button" class="ir-back ir-eye" data-a="xray" aria-label="${esc(T("X-Ray"))}">${svg("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z")}</button>
        <div class="ir-gauge"><i></i><span class="s3">★</span><span class="s2">★</span><span class="s1">★</span></div></div>
      <div class="ir-tip" hidden></div><div class="ir-flash" hidden></div><i class="ir-arrow" hidden></i>
      <div class="ir-bar" hidden>
        <div class="ir-count"><span>${esc(T("Moves"))} <b class="ir-mv">0</b></span><span>${esc(T("Par"))} <b class="ir-par">0</b></span><span>${esc(T("Best"))} <b class="ir-best">☆☆☆</b></span></div>
        <div class="ir-tools">
          <button type="button" class="t-hint" data-a="hint"><span class="ic">💡</span><b>${esc(T("Hint"))}</b><i class="ir-hn">3</i></button>
          <button type="button" class="t-undo" data-a="undo">${svg("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3")}<b>${esc(T("Undo"))}</b></button>
          <button type="button" class="t-reset" data-a="restart">${svg("M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7")}<b>${esc(T("Restart"))}</b></button>
          <button type="button" class="t-hammer" data-a="hammer"><span class="ic">🔨</span><b>${esc(T("Hammer"))}</b><i class="ir-hm">1</i></button>
        </div>
      </div>
      <div class="ir-sheet" hidden></div>`;
    document.body.appendChild(root);
    const q = (x) => root.querySelector(x);
    ui = { root, touch: q(".ir-touch"), top: q(".ir-top"), title: q(".ir-title b"), iq: q(".ir-iq"), gauge: q(".ir-gauge"), bar: q(".ir-bar"), mv: q(".ir-mv"), par: q(".ir-par"), best: q(".ir-best"), hn: q(".ir-hn"), hm: q(".ir-hm"), tip: q(".ir-tip"), flash: q(".ir-flash"), sheet: q(".ir-sheet"), arrow: q(".ir-arrow"), arrowRing: -1, arrowT: 0 };
    ui.touch.addEventListener("pointerdown", pd); ui.touch.addEventListener("pointermove", pm); ui.touch.addEventListener("pointerup", pu); ui.touch.addEventListener("pointercancel", pu);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || !on) return;
      if (b.dataset.tab) { tab = b.dataset.tab; lobby(); snd("pick"); return; }
      if (b.dataset.ch != null) { const c = Number(b.dataset.ch); if (c * 20 + 1 > cleared1() + 1) { flash(T("Clear level {n} first", { n: c * 20 })); snd("bad"); return; } openCh = openCh === c ? -1 : c; lobby(); snd("pick"); return; }
      if (b.dataset.chest) { const [c, k] = b.dataset.chest.split(":").map(Number); openChest(c, k); return; }
      if (b.dataset.skin) { if (!skinOk(b.dataset.skin)) { const x = SKINS.find((o) => o.id === b.dataset.skin); flash(T("Open chapter {n}'s 40-star chest first", { n: (x ? x.ch : 0) + 1 })); snd("bad"); return; } prog.skin = b.dataset.skin; save(); snd("level"); lobby(); return; }
      if (b.dataset.lv) { const id = b.dataset.lv; if (/^\d+$/.test(id) && Number(id) > cleared1() + 1) { flash(T("Clear level {n} first", { n: cleared1() + 1 })); snd("bad"); return; } snd("enter"); startBoard(id); return; }
      const a = b.dataset.a;
      if (a === "leave") leave(); else if (a === "menu") lobby(); else if (a === "hint") useHint(); else if (a === "undo") undo(); else if (a === "restart") restart();
      else if (a === "xray") { xray = !xray; b.classList.toggle("on", xray); paintXray(); flash(T("X-Ray")); }
      else if (a === "hammer") { if (s.hammer >= RINGS.HAMMERS) return; hammerArmed = !hammerArmed; root.classList.toggle("hammer", hammerArmed); if (hammerArmed) flash(T("Tap a ring to knock it off (this board: 1 star at most)")); }
      else if (a === "retry") { if (ta) taStart(); else restart(); }
      else if (a === "share") share();
      else if (a === "card") shareCard();
      else if (a === "ta") taStart();
      else if (a === "next") { const n = /^\d+$/.test(lvId) ? Number(lvId) : 0; startBoard(/^e:/.test(lvId) ? "e:" + prog.endless : /^w:/.test(lvId) ? lvId.slice(0, -1) + (Number(lvId.slice(-1)) + 1) : String(Math.min(LEVELS, n + 1))); }
    });
    addEventListener("resize", fit); fit();
  }
  function paintHud() {
    if (!ui || !L) return;
    ui.title.textContent = ta ? T("TIME ATTACK") : /^d:/.test(lvId) ? T("Daily {n}", { n: Number(lvId.slice(-1)) + 1 }) : /^w:/.test(lvId) ? T("Day {n}", { n: Number(lvId.slice(-1)) + 1 }) : /^e:/.test(lvId) ? T("Endless #{n}", { n: lvId.slice(2) }) : L.boss ? (lvId === "200" ? "RIFT BOSS" : "INFINITY BOSS") : T("Level {n}", { n: lvId });
    ui.mv.textContent = s.moves; ui.par.textContent = L.par;
    const b = bestOf(lvId); ui.best.textContent = "★".repeat(b) + "☆".repeat(3 - b);
    // the IQ line (a playful number that climbs with the level) and the star gauge: full at the start, it drains as
    // moves pass par (3★) and par + a margin (2★); a hint caps it at 2★, the hammer at 1★
    const n = /^\d+$/.test(lvId) ? Number(lvId) : /^d:/.test(lvId) ? [32, 56, 86][Number(lvId.slice(-1))] : 90, extra = Math.max(2, Math.ceil(L.par * 0.5)), max = L.par + extra * 2;
    ui.iq.textContent = ta ? "⏱ " + Math.max(0, Math.ceil(ta.left)) + "s · ✔ " + ta.n : "IQ = " + (40 + Math.round(Math.min(n, 100) * 0.6) + (n > 100 ? Math.round((n - 100) * 0.4) : 0));
    const pj = starsOf(L, s.moves, s.hammer, hintsUsed), fill = Math.max(0.03, 1 - s.moves / max);
    ui.gauge.style.setProperty("--f", fill.toFixed(3)); ui.gauge.style.setProperty("--p3", (1 - L.par / max).toFixed(3)); ui.gauge.style.setProperty("--p2", (1 - (L.par + extra) / max).toFixed(3));
    ui.gauge.querySelector(".s3").classList.toggle("on", pj >= 3); ui.gauge.querySelector(".s2").classList.toggle("on", pj >= 2); ui.gauge.querySelector(".s1").classList.toggle("on", pj >= 1);
    // hints: the board's own three first, then the bag (chests and the daily refill fill it)
    const hb = ui.bar.querySelector('[data-a="hint"]'); ui.hn.textContent = hintsLeft > 0 ? hintsLeft : prog.bag > 0 ? "+" + prog.bag : 0; hb.classList.toggle("bag", hintsLeft <= 0 && prog.bag > 0); hb.disabled = !!ta;
    ui.hm.textContent = RINGS.HAMMERS - s.hammer; ui.bar.querySelector('[data-a="hammer"]').disabled = s.hammer >= RINGS.HAMMERS || !!ta;
    const ub = ui.bar.querySelector('[data-a="undo"]'), top = hist[hist.length - 1]; ub.disabled = !hist.length || (top && top.fell); ub.classList.toggle("locked", !!(top && top.fell));
    // timer rings: the moves they have left over them (red at 3 and under)
    for (const R of rings) if (R.tm && !R.gone) { const left = Math.max(0, (L.rings[R.i].t | 0) - s.moves); if (left !== R.tmN) { R.tmN = left; R.tm.material = numMat(left, left <= 3 ? "#ff3b4a" : "#ff9a1a"); if (left <= 3) R.tm.scale.setScalar(0.85); } }
  }

  // ---------------- each frame ----------------
  let lastNow = 0, frameMs = 16, shake = 0, slowT = 0;
  const tv = new THREE.Vector3();
  function tick(dt0, t) {
    const now = performance.now(), dtR = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : dt0; lastNow = now; frameMs += (dtR * 1000 - frameMs) * 0.05;
    if (slowT > 0) slowT = Math.max(0, slowT - dtR); const dt = dtR * (slowT > 0 ? 0.4 : 1); // (a big chain: a moment of slow motion)
    if (mode === "play" || mode === "done" || mode === "lost") boardT += dt;
    while (falls.length && falls[0].at <= boardT) { const f = falls.shift(); if (f.k && !f.shown) { falls.forEach((g) => { if (g.k === f.k) g.shown = true; }); chainPop(f.k); } drop(f.i, f.k); }
    if (mode === "play" && !falls.length && L && cleared(s) && rings.every((r) => !r.fall || r.fall.t > 0.5)) { if (doneT < 0) doneT = boardT; if (boardT - doneT > 0.35) { if (ta) taNext(); else finish(); } }
    if (ta && mode === "play") { ta.left = Math.max(0, (ta.end - now) / 1000); if (ta.left <= 0) { ta.left = 0; taEnd(); } else if ((ta.pt = (ta.pt || 0) + dtR) > 0.25) { ta.pt = 0; paintHud(); } }
    for (const R of rings) {
      // a turn springs into its step (a touch past it, then back), a few small steps a frame so it stays steady
      for (let q = 0, n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n; q < n; q++) { R.vel += ((R.target - R.rot) * 260 - R.vel * 24) * h; R.rot += R.vel * h; }
      if (Math.abs(R.target - R.rot) < 1e-4 && Math.abs(R.vel) < 1e-3) { R.rot = R.target; R.vel = 0; }
      R.mesh.rotation.z = R.rot + (drag.on && drag.ring === R.i ? drag.acc : 0); if (R.ice) R.ice.rotation.z = R.mesh.rotation.z;
      if (R.spark && !R.fall) { const a = -t * 2.2 + R.i, rr = L.rings[R.i].r; R.spark.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0.3); }
      if (R.rainbow) { const hh = (t * 0.08 + R.i * 0.13) % 1; R.mat.color.setHSL(hh, 0.85, 0.55); R.mat.emissive.setHSL(hh, 0.9, 0.45); }
      let ox = 0; if (R.shake > 0) { R.shake = Math.max(0, R.shake - dt); ox = Math.sin(t * 70) * 0.06 * (R.shake / 0.35); }
      const r = L.rings[R.i];
      if (R.fall) { const f = R.fall; f.t += dt;
        if (f.t < 0.16) { const e = 1 - Math.pow(1 - f.t / 0.16, 3); R.g.position.set(f.sx0 + f.ox * e, f.sy0 + f.oy * e, 0.15 * e); }
        else { f.vy -= 14 * dt; R.g.position.x += f.vx * dt; R.g.position.y += f.vy * dt; R.g.position.z += f.vz * dt; R.g.rotation.x += f.sx * dt; R.g.rotation.y += f.sy * dt; }
        const k = Math.max(0, 1 - Math.max(0, f.t - 0.7) / 0.6); R.g.scale.setScalar(Math.max(0.001, k)); if (f.t > 1.25 && !f.pop) { f.pop = true; burst(R.g.position.x, R.g.position.y, R.col, 14, 0.8); } if (f.t > 1.4 && R.g.visible) R.g.visible = false; }
      else R.g.position.x = r.x + ox;
      if (R.hl > 0) R.hl = Math.max(0, R.hl - dt);
      const glow = R.base + (R.press ? 0.35 : 0) + (R.hl > 0 ? 0.45 + Math.sin(t * 9) * 0.35 : 0) + (r.k === 2 ? Math.sin(t * 3 + R.i) * 0.08 : 0) + (R.lava ? Math.sin(t * 2 + R.i) * 0.15 : 0) + (r.k === 5 ? 0.25 + Math.sin(t * 4 + (r.twin > R.i ? 0 : 0)) * 0.2 : 0);
      for (const m of R.mats) if (m === R.mat) m.emissiveIntensity = glow;
      if (R.spr && !R.fall) R.spr.visible = !(r.k === 1 && !r.core && (r.key >= 0 ? !s.alive[r.key] : L.rings.every((o, j) => (o.tier || 0) >= (r.tier || 0) || !s.alive[j]))); // a lock's badge goes once it can turn
    }
    // clasps: green while open; gone (a pop) once either ring has fallen; pegs go with their ring
    for (const c of clasps) {
      if (c.gone) { if (c.m.visible) { c.t += dt; c.m.scale.setScalar(Math.max(0.001, 1 - c.t * 4)); if (c.t > 0.25) c.m.visible = false; } continue; }
      const A = rings[c.l[0]], B = rings[c.l[1]]; if (A.gone || B.gone) { c.gone = true; burst(c.m.position.x, c.m.position.y, 0xffd23a, 10, 0.6); continue; }
      const open = s.g[c.l[0]] === c.l[2] || s.g[c.l[1]] === c.l[3];
      if (open && !c.open) { c.pop = 0.22; snd("clasp"); } c.open = open; // a click and a little spring as it opens
      if (c.pop > 0) c.pop = Math.max(0, c.pop - dt); const sp = 1 + Math.sin((c.pop / 0.22) * Math.PI) * 0.35; c.m.scale.set(sp, 1, sp);
      if (c.warn > 0) c.warn = Math.max(0, c.warn - dt);
      const red = c.warn > 0 && Math.sin(c.warn * 22) > 0;
      c.m.material.emissive.setHex(red ? 0xff1030 : open ? 0x1bff7a : 0x5a3800); c.m.material.emissiveIntensity = red ? 1.2 : open ? 0.55 + Math.sin(t * 6) * 0.2 : 0.35;
    }
    for (const p of pegs) { const R = rings[p.i]; if (R.gone && p.m.visible) p.m.visible = false; else if (!R.gone) { const open = s.g[p.i] === L.rings[p.i].peg; if (p.warn > 0) p.warn = Math.max(0, p.warn - dt); const red = p.warn > 0 && Math.sin(p.warn * 22) > 0; p.m.material.emissive.setHex(red ? 0xff1030 : open ? 0x1bff7a : 0x1a2030); p.m.material.emissiveIntensity = red ? 1.2 : open ? 0.6 : 0.4; } }
    for (const R of rings) if (R.badge && (R.badgeT -= dt) <= 0) { R.g.remove(R.badge); R.badge = null; }
    // the hint's ghost: the ring as it will stand after the move, see-through, breathing
    if (ghost) { ghost.t -= dt; const R = rings[ghost.i]; if (ghost.t <= 0 || !R || R.gone) { S.boardG.remove(ghost.m); ghost.m.material.dispose(); ghost = null; } else { ghost.m.material.opacity = 0.25 + Math.sin(t * 6) * 0.15; ghost.m.rotation.z = R.rot + ghost.d * STEP * Math.min(1, (2.4 - ghost.t) * 2); } }
    // the boss's stages: a banner as each tier unlocks
    if (L && L.boss && mode === "play") { const tierUp = L.rings.every((r, j) => !s.alive[j] || (r.tier || 0) >= 1) ? (L.rings.every((r, j) => !s.alive[j] || (r.tier || 0) >= 2) ? 2 : 1) : 0;
      if (tierUp > stage) { stage = tierUp; banner(stage === 1 ? T("STAGE 2 · The guard rings unlock") : T("FINAL · The INFINITY core unlocks")); burst(S.cx, S.cy, stage === 1 ? 0x5aa8ff : 0x2ee0b0, 70, 2); snd("level"); shake = 0.3; } }
    // a shake of the camera after a big chain
    if (S.camGoal && S.camBase) S.camBase.lerp(S.camGoal, Math.min(1, dtR * 6));
    if (shake > 0 && S.camBase) { shake = Math.max(0, shake - dtR); S.cam.position.set(S.camBase.x + (Math.random() - 0.5) * shake * 0.5, S.camBase.y + (Math.random() - 0.5) * shake * 0.5, S.camBase.z); } else if (S.camBase && !S.cam.position.equals(S.camBase)) S.cam.position.copy(S.camBase);
    // the first level's hand: it taps the first ring until you do
    if (ui && ui.hand && L && rings[0]) { const r = L.rings[0]; tv.set(r.x + r.r * 0.7, r.y - r.r * 0.7, 0.4).project(S.cam); const V = view(), k = scaleK(); ui.hand.style.transform = `translate(${(V.x + ((tv.x + 1) / 2) * V.w) / k}px, ${(V.y + ((1 - tv.y) / 2) * V.h) / k}px)`; }
    if (mode === "play") { playT += dt; sample(dt); }
    if (S.deco) S.deco.visible = mode === "lobby" || mode === "done"; if (S.portal) S.portal.visible = mode === "lobby"; if (S.inf && S.finale == null) S.inf.visible = mode === "done"; // (the lobby has the title; a clear: the ∞ alone over the card)
    S.sky.material.uniforms.uT.value = t; if (S.side) S.side.children.forEach((c, k) => { c.rotation.y = t * 0.25 + k; });
    if (S.hero) { if (mode === "lobby") { S.hero.update(dtR, t); heroPlace(); } else if (S.hero.obj.visible) S.hero.obj.visible = false; }
    // the boss's ∞ core: brighter with each stage, a flinch with every ring that falls
    if (S.infCore && S.infCore.visible) { if (S.infHit > 0) S.infHit = Math.max(0, S.infHit - dt); const k = 1 + Math.sin(t * 3) * 0.05 + (S.infHit || 0) * 0.6; S.infCore.material.opacity = Math.min(1, 0.65 + stage * 0.15 + (S.infHit || 0)); S.infCore.scale.set(4.2 * k, 2.1 * k, 1); S.infCore.position.x = (S.infCore.userData.x0 != null ? S.infCore.userData.x0 : (S.infCore.userData.x0 = S.infCore.position.x)) + (S.infHit ? (Math.random() - 0.5) * 0.12 : 0); }
    // the hint's arrow over its ring
    if (ui && ui.arrowT > 0 && L && ui.arrowRing >= 0 && s.alive[ui.arrowRing]) { ui.arrowT -= dt; const r = L.rings[ui.arrowRing]; tv.set(r.x, r.y + r.r + 0.35, 0.4).project(S.cam); const k = scaleK(); ui.arrow.style.transform = `translate(${((tv.x + 1) / 2) * innerWidth / k}px, ${((1 - tv.y) / 2) * innerHeight / k}px) translate(-50%, -100%)`; ui.arrow.hidden = false; }
    else if (ui) ui.arrow.hidden = true;
    // sparkles
    let anyP = false;
    for (let q = 0; q < S.P.length; q++) { const p = S.P[q]; if (p.life <= 0) { S.pa[q] = 0; continue; } anyP = true; p.t += dt; if (p.t >= p.life) { p.life = 0; S.pa[q] = 0; continue; } p.vy -= 4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.985; S.pp[q * 3] = p.x; S.pp[q * 3 + 1] = p.y; S.pp[q * 3 + 2] = p.z; S.pa[q] = 1 - p.t / p.life; }
    if (anyP || S.pAny) { S.pts.geometry.attributes.position.needsUpdate = true; S.pts.geometry.attributes.aA.needsUpdate = true; } S.pAny = anyP;
    if (S.inf && S.finale != null) { S.finale += dt; const k = Math.min(1, S.finale / 1.2), e = 1 - Math.pow(1 - k, 3); S.inf.position.set(S.cx, S.cy, 1 + e); S.inf.scale.setScalar(0.5 + e * Math.max(S.w, S.h) * 0.5); S.inf.rotation.set(0, (1 - e) * 6 + Math.sin(t) * 0.2, 0); if (mode === "lobby") { S.finale = null; S.deco.add(S.inf); layoutDeco(); } }
    else if (S.inf) { S.inf.rotation.y = Math.sin(t * 0.6) * 0.5; S.inf.position.y = S.cy + S.h / 2 + 0.9 + Math.sin(t * 1.4) * 0.08; }
    if (S.portal) S.portal.rotation.z = t * 0.05;
    if (S.crys) S.crys.forEach((c, k) => { c.rotation.y = t * 0.5 + k; });
  }

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; busy = true;
    try {
      if (!ui) buildUi(); ui.root.hidden = false; ui.root.classList.add("menu"); ui.top.hidden = true; ui.bar.hidden = true;
      ui.sheet.innerHTML = `<div class="ir-lobby small"><h3>${esc(T("Loading the puzzle hall…"))}</h3><div class="ir-spin"></div></div>`; ui.sheet.hidden = false;
      document.body.classList.add("wp-rings");
      if (!S) build();
      await readStatus(); // (the props come when they come: they only dress the lobby)
      prOrig = st.renderer.getPixelRatio();
      const pr = Math.min(prOrig, ctx.low || /^(saver|low)$/.test(String(ctx.quality)) ? 1 : phone() ? 1.5 : 1.75); if (pr !== prOrig) st.renderer.setPixelRatio(pr);
      if (!S.comp && phys && ctx.K && ctx.K.POSTFX) { try { const P = ctx.K.POSTFX, comp = new P.EffectComposer(st.renderer); comp.addPass(new P.RenderPass(S.scene, S.cam)); comp.addPass(new P.UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.4, 0.86)); comp.addPass(new P.OutputPass()); S.comp = comp; } catch (e) { console.warn("rings bloom:", e); } }
      lobby();
      try { if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), new Promise((ok) => setTimeout(ok, 2500))]); } catch { /* compiled on the first frame */ }
      on = true; st.view(S.scene, S.cam, S.comp); st.solo(tick); lastNow = 0; fit();
      addEventListener("keydown", kd, true);
      return true;
    } catch (e) {
      console.warn("rings", e); ctx.toast(T("The puzzle hall couldn't load: {e}", { e: String((e && e.message) || e).slice(0, 70) })); try { reset(); } catch { /* already reset */ } return false;
    } finally { busy = false; }
  }
  function reset() {
    on = false; mode = "off"; document.body.classList.remove("wp-rings"); if (ui) { ui.root.hidden = true; ui.sheet.hidden = true; ui.root.classList.remove("hammer"); }
    removeEventListener("keydown", kd, true); drag.on = false; hammerArmed = false;
    try { if (prOrig && st.renderer.getPixelRatio() !== prOrig) st.renderer.setPixelRatio(prOrig); } catch { /* the town sets its own */ }
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
  }
  function leave() { if (!on) return; reset(); if (ctx.onLeave) ctx.onLeave(); }
  return {
    enter, leave, active: () => on,
    /// tests: the board's numbers, and a few levers
    debug: () => ({ mode, lv: lvId, stage, chal: chal ? chal.vs : 0, moves: s ? s.moves : 0, par: L ? L.par : 0, alive: s ? s.alive.filter(Boolean).length : 0, n: L ? L.rings.length : 0, fms: Math.round(frameMs), stars: L && s ? starsOf(L, s.moves, s.hammer, hintsUsed) : 0, hints: hintsUsed, falling: rings.filter((r) => r.fall).length, queued: falls.length, bt: +boardT.toFixed(2), round: L && S ? (() => { const V = view(), r = L.rings[0], P = (x, y) => { const v = new THREE.Vector3(x, y, 0).project(S.cam); return [((v.x + 1) / 2) * V.w, ((1 - v.y) / 2) * V.h]; }; const a = P(r.x - r.r, r.y), b = P(r.x + r.r, r.y), c = P(r.x, r.y - r.r), d = P(r.x, r.y + r.r); return +((b[0] - a[0]) / (c[1] - d[1])).toFixed(3); })() : 0, cv: (() => { const V = view(); return [Math.round(V.w), Math.round(V.h), innerWidth, innerHeight].join("x"); })(), free: L && s ? L.rings.map((r, i) => isFree(L, s, i)).filter(Boolean).length : 0,
      hero: !!(S && S.hero && S.hero.obj.visible), ice: s && s.ice ? s.ice.filter(Boolean).length : 0, bag: prog.bag, skin: skin(), ta: ta ? { n: ta.n, left: +ta.left.toFixed(1) } : null,
      // the board's rings on the screen (px, the drawing's own box): min x, max x, min y, max y — and the view's size
      ext: L && S ? (() => { const V = view(), xs = [], ys = []; L.rings.forEach((r, i) => { if (!s.alive[i]) return; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const v = new THREE.Vector3(r.x + dx * (r.r + TUBE * 1.3), r.y + dy * (r.r + TUBE * 1.3), 0).project(S.cam); xs.push(((v.x + 1) / 2) * V.w); ys.push(((1 - v.y) / 2) * V.h); } }); return xs.length ? [Math.round(Math.min(...xs)), Math.round(Math.max(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...ys)), Math.round(V.w), Math.round(V.h)] : null; })() : null }),
    /// a friend's challenge link (world-play.js reads ?rings=&vs=&by=): that board, their moves to beat
    challenge: (id, vs, by, w) => { if (!level(String(id))) return false; chal = { id: String(id), vs: Math.max(1, Math.floor(Number(vs) || 0)) || 99, by: String(by || "").slice(0, 16), w: /^0x[0-9a-f]{40}$/.test(String(w || "").toLowerCase()) ? String(w).toLowerCase() : "" }; startBoard(String(id)); return true; },
    ta: () => taStart(), taDebug: () => (ta ? { n: ta.n, left: +ta.left.toFixed(1), k: ta.k } : null), chest: (c, k) => openChest(c, k), skin: (k) => { prog.skin = k; save(); }, bag: () => prog.bag,
    giveStars: (upTo, st = 3) => { for (let i = 1; i <= upTo; i++) prog.best["c" + i] = Math.max(prog.best["c" + i] || 0, st); save(); },
    start: (id) => startBoard(String(id)), move: (i, d) => doMove(i, d), menu: () => lobby(), tab: (k) => { tab = k; lobby(); },
    solve: async (gap = 120) => { const { plan } = await import("./world-rings-engine.js"); const p = plan(L, s, 10, 2) || []; for (const m of p) { if (mode !== "play") break; doMove(m[0], m[1]); await new Promise((ok) => setTimeout(ok, gap)); } return p.length; },
    press: (i) => stuck(i),
    solveTo: async (tier, gap = 120) => { const { plan } = await import("./world-rings-engine.js"); for (let k = 0; k < 400 && mode === "play"; k++) { if (L.rings.every((r, j) => !s.alive[j] || (r.tier || 0) >= tier)) break; const q = plan(L, s, 4, 2 + k); if (!q || !q.length) break; doMove(q[0][0], q[0][1]); await new Promise((ok) => setTimeout(ok, gap)); } return stage; },
    unlockAll: () => { for (let i = 1; i <= 99; i++) prog.best["c" + i] = prog.best["c" + i] || 1; save(); },
  };
}
