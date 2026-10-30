// world-kart.js — ARCIRCLE KART, stage 1 (2026-10-29, the owner's KART plan: "1단계부터"): an arcade kart race in a scene of
// its own (like SURVIVORS ARENA: st.view + st.solo, the town waits). One track — the ARCIRCLE Nexus Circuit, a closed
// spline with a wide road, neon arches, boost pads and a start gantry — 3 laps, you + 3 computer racers driven by the
// three heroes (each sits in its kart: the 'sit' clip of world-kit.js CU_AS). Arcade handling: grip that eases off in a
// drift (Shift / the drift button + a direction), the drift charges a mini-turbo (blue → orange) and the nitro bar
// (2 stocks, Space / the boost button), a start boost for pressing the throttle right on GO, off-road slows you, the road's
// walls push you back, a slipstream behind a kart. The computer racers follow the racing line with their own lane,
// skill and small mistakes. No ARCL yet (stage 1): a personal best per device (arc.kart.best).
// 1.5 (2026-10-29, the owner's key art + "the five racers matter most — make them with Meshy, carefully"): the CRYPTO
// LEGENDS — PEPE, DOGE, PENGU, WIF, BONK — Meshy bodies rigged by Meshy (models/world/kart/char-<id>-rig.glb: Idle,
// Chair_Sit_Idle_M = drive, Seated_Fist_Pump, Victory_Cheer, Big_Wave_Hello, Head_Hold_in_Pain, PEPE's thumbs up), each
// in its own Meshy kart (kart-<id>.glb, the ∞ on the nose); you pick one, the other four race you. The track's arches,
// gantry, towers and pads are Meshy models too (low graphics keeps the drawn ones). A model that doesn't load falls back
// to the drawn kart, never a stop.
//
// 1.7 (2026-10-30, the owner: "Kart 손맛 패치"): the feel — an engine you hear (world-sfx.js kartEngine: revs, load, the tyres
// in a drift), a drift that charges in three steps you see and hear (blue → orange → purple sparks at the rear wheels, a
// chime and a buzz each step; the purple one is the Ultra turbo), skid marks, wall hits that bounce, spark and thud,
// the kart that leans, squats and dives with the throttle, speed lines and a pulled-back camera in a boost, a lap chime,
// a position pop when you pass someone (a fist pump when you take the lead), a stall that coughs smoke, confetti at the
// finish. Vibration through ctx.buzz (Settings' switch). Low graphics: half the particles, no speed lines.
//
// K2 (2026-10-30, the owner's list): three ways to race — RACE (you + the four, paid by place), TIME ATTACK (you alone,
// your best ghost and the week's #1 beside you as see-through karts) and the DAILY challenge (a race under the day's rule:
// mirror · nitro · nodrift · night · turbo, the same for everyone on a Seoul day). Signed in, a race is opened and closed on
// the server (api/_world-kart.mjs: world-kart-start / -end, checked on its clock, ARCL kind "kart"); guests race without
// rewards. Your kart is sampled every 0.2 s into a ghost (ghostEnc: base-36 x·10, z·10, yaw·100), sent with the end and
// kept on the device (arc.kart.ghost.<track>). The result card: place, time, best, lap splits, ARCL, today's races / ARCL,
// titles unlocked (town titles "kt-<id>", world-quests.js KTT), the week's top 5, Share (world-share.js THEME.kart).
// K6 (2026-10-30, the owner's list): the race's show and a few new moves. HUD: a minimap of the track (racers as dots in
// their colours, you bigger), the time gap to the racer just ahead and just behind (marks every GAP_M metres of progress:
// gapTo), a FINAL LAP banner (the engine a little higher on it; KART has no race music to speed up), the start lights on a
// gantry of their own (red, red, red, all green) while a drone camera sweeps over the grid, giant 3 · 2 · 1 · GO!, a keys card
// on a computer's first race and a 'sideways plays better' hint on an upright phone (once each). The circuit dressed
// (world-kart-dress.js): grandstands with a crowd and flags on the two straights, the big standings screen (a canvas, twice a
// second), a tunnel, a second set of neon arches, two jump ramps — in the air Drift (or the Trick button on a phone) flips
// the kart, the racer waves, and landing it gives a mini turbo; the computer racers trick sometimes. The racers react (only
// the rig's own clips, never over a one-shot, back to driving after): a pass → Seated_Fist_Pump, a wall or a kart hit →
// Head_Hold_in_Pain, the win → Victory_Cheer. Taking 1st: a 0.3 s slow motion and a 1ST! cut-in (10 s apart); a finish
// within 0.15 s of another racer: a freeze-frame PHOTO FINISH; within 1 s of someone on the last corner of the last lap a
// side camera for 1.5 s; after the line the top three on a podium (1st cheers, 2nd and 3rd wave, the last holds their head)
// with confetti for ~3 s (a tap skips), then the result card. Settings (⚙ on the pick screen, arc.kart.opts): steering
// assist (a gentle nudge off the walls, on by default on phones), auto-gas (Gas becomes a switch), tilt steering, button
// size. Low graphics / phones: fewer props, no side camera on low; reduce-motion: no slow motion, no drone sweep.
// ctx: { THREE, K, st, T, lang, esc, toast, Snd, buzz, reduce, low, coarse, heroId, makeHero(id) → Promise<hero>, onLeave(),
//        sess() → the signed session or null, post(body) → { ok, status, j }, share(card), refresh() (the purse), gain(n, why), name() }
import { makeDress, makePodium, makeRings, makeChecker, outSide, RAMPS, RAMP, PODIUM_I, OUTSIDE } from "./world-kart-dress.js";
export const LAPS = 3;
export const TRACK_PTS = [[0, 0], [120, -10], [190, 40], [200, 130], [140, 190], [60, 170], [20, 230], [-70, 240], [-150, 180], [-160, 90], [-100, 40], [-60, -40]];
export const RULES = ["mirror", "nitro", "nodrift", "night", "turbo"], GHOST_DT = 0.2, GHOST_MAX = 3000;
const dayHash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
/// the day's challenge (the server's dailyOf in api/_world-kart.mjs is the same; tests/world/kart.test.mjs checks)
export const dailyOf = (t) => { const day = new Date(t + 9 * 3600e3).toISOString().slice(0, 10), seed = dayHash("kart:" + day); return { day, seed, rule: RULES[seed % RULES.length] }; };
/// a ghost as text: each sample "x·10,z·10,yaw·100" in base 36, samples joined by ";" (the server takes /^[0-9a-z,;.-]*$/)
export const ghostEnc = (a) => a.map(([x, z, y]) => [Math.round(x * 10), Math.round(z * 10), Math.round(Math.atan2(Math.sin(y), Math.cos(y)) * 100)].map((n) => n.toString(36)).join(",")).join(";");
export const ghostDec = (s) => String(s || "").split(";").filter(Boolean).map((r) => { const [x, z, y] = r.split(",").map((v) => parseInt(v, 36)); return [x / 10, z / 10, y / 100]; }).filter((p) => p.every(Number.isFinite));
// ---- K6's pure helpers (tests/world/kart.test.mjs) ----
export const GAP_M = 5;
/// a kart's progress marks: marks[b] = the race clock when it first reached b × GAP_M metres; fills from `from`, returns the next bin to fill
export const markAt = (marks, from, prog, now) => { const b = Math.min(marks.length - 1, Math.floor(prog / GAP_M)); for (let i = Math.max(0, from); i <= b; i++) if (marks[i] < 0) marks[i] = now; return Math.max(from, b + 1); };
/// the time gap: how long ago the leader passed the progress `prog` the trailer is at now (null if it never did)
export const gapTo = (marks, prog, now) => { const b = Math.floor(prog / GAP_M); return b >= 0 && b < marks.length && marks[b] >= 0 ? Math.max(0, now - marks[b]) : null; };
/// a photo finish: another racer over the line within `win` s of you, or about to be at its speed (rem metres to go)
export const photoFinish = (meT, others, win = 0.15) => others.some((o) => (o.finish > 0 ? Math.abs(meT - o.finish) <= win : o.rem >= 0 && o.rem / Math.max(1, o.speed) <= win));
/// the player's KART settings (arc.kart.opts): steering assist on by default on phones, the rest off, buttons M
export const OPTS = "arc.kart.opts";
export const optsOf = (raw, coarse) => { let j = null; try { j = JSON.parse(raw || "null"); } catch { j = null; } j = j && typeof j === "object" ? j : {}; return { assist: typeof j.assist === "boolean" ? j.assist : !!coarse, autogas: j.autogas === true, tilt: j.tilt === true, size: ["s", "m", "l"].includes(j.size) ? j.size : "m" }; };
/// tilt steering: degrees of tilt → −1…1, a dead zone, full lock at 24°
export const tiltSteer = (deg, dead = 4, full = 24) => { const a = Math.abs(+deg || 0); return a < dead ? 0 : Math.sign(deg) * Math.min(1, (a - dead) / (full - dead)); };
/// Meshy models that may replace K6's drawn pieces (models/world/kart/<name>.glb, from raw/kart-k2/models once packed): add a name when its file is in
export const K6_GLB = [];
const RACE_DAY = 5, ARCL_DAY = 2500; // (shown on the result card; the server's KART.DAY_RACES / DAY_ARCL decide)
const ROAD = 16, WALL = ROAD / 2 + 3.2, STEP = 1 / 60, BEST = "arc.kart.best", MODE = "arc.kart.mode", GHOST = "arc.kart.ghost.", KEYS = "arc.kart.keys", SIDE = "arc.kart.side";
const TOP = 34, ACC = 19, BRAKE = 34, DRAG = 0.35;
export const BOOST_TOP = 47;
export const LW = {
  ko: { "Ultra turbo!": "울트라 터보!", "Stalled!": "시동 꺼짐!", "Hold Gas to drive · hold Drift in a corner, let go for a turbo.": "가속을 누르고 달려요 · 코너에서 드리프트를 누르고 있다가 놓으면 터보", "Gas": "가속", "Left": "왼쪽", "Right": "오른쪽", "Pick your racer": "레이서를 고르세요", "Race!": "출발하기", "5th": "5위", "Standings": "순위표", "Frog of the fast lane": "추월 차선의 개구리", "Much speed. Very drift.": "엄청 빠름. 아주 드리프트.", "Cool on every corner": "어느 코너에서도 침착하게", "The hat stays on": "모자는 절대 안 벗어요", "Bonks the line": "결승선을 쾅!", "Loading racers…": "레이서 준비 중…", "Lap": "랩", "Best": "최고 기록", "GO!": "출발!", "Start boost!": "스타트 부스터!", "Mini turbo": "미니 터보", "Super turbo!": "슈퍼 터보!", "Nitro!": "니트로!", "Final lap!": "마지막 랩!", "Finish!": "골인!", "Race again": "다시 달리기", "Leave": "나가기", "New best!": "최고 기록 경신!", "Place": "순위", "Time": "기록", "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro": "조향 ◀ ▶ · W 가속 · S 브레이크 · Shift 드리프트 · Space 니트로", "Drift": "드리프트", "Nitro": "니트로", "Brake": "브레이크", "ARCIRCLE Nexus Circuit": "ARCIRCLE 넥서스 서킷", "Hold drift in a corner, let go for a turbo.": "코너에서 드리프트를 누르고 있다가 놓으면 터보가 나가요.", "1st": "1위", "2nd": "2위", "3rd": "3위", "4th": "4위", "Off road": "도로 밖" },
  zh: { "Ultra turbo!": "极限涡轮！", "Stalled!": "熄火了！", "Hold Gas to drive · hold Drift in a corner, let go for a turbo.": "按住加速前进 · 在弯道按住漂移，松开就能涡轮加速", "Gas": "加速", "Left": "左", "Right": "右", "Pick your racer": "选择你的赛车手", "Race!": "开赛", "5th": "第5名", "Standings": "名次表", "Frog of the fast lane": "超车道上的青蛙", "Much speed. Very drift.": "超快。超会漂移。", "Cool on every corner": "每个弯道都很冷静", "The hat stays on": "帽子永远不摘", "Bonks the line": "一击冲线", "Loading racers…": "赛车手准备中…", "Lap": "圈", "Best": "最佳", "GO!": "出发！", "Start boost!": "起步加速！", "Mini turbo": "小涡轮", "Super turbo!": "超级涡轮！", "Nitro!": "氮气！", "Final lap!": "最后一圈！", "Finish!": "冲线！", "Race again": "再来一局", "Leave": "离开", "New best!": "新纪录！", "Place": "名次", "Time": "用时", "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro": "转向 ◀ ▶ · W 加速 · S 刹车 · Shift 漂移 · Space 氮气", "Drift": "漂移", "Nitro": "氮气", "Brake": "刹车", "ARCIRCLE Nexus Circuit": "ARCIRCLE 枢纽赛道", "Hold drift in a corner, let go for a turbo.": "在弯道按住漂移，松开就能涡轮加速。", "1st": "第1名", "2nd": "第2名", "3rd": "第3名", "4th": "第4名", "Off road": "出赛道" },
  tr: { "Ultra turbo!": "Ultra turbo!", "Stalled!": "Motor stop!", "Hold Gas to drive · hold Drift in a corner, let go for a turbo.": "Sürmek için Gaz'a bas · virajda Drift'i basılı tut, bırakınca turbo", "Gas": "Gaz", "Left": "Sol", "Right": "Sağ", "Pick your racer": "Yarışçını seç", "Race!": "Yarış!", "5th": "5.", "Standings": "Sıralama", "Frog of the fast lane": "Hızlı şeridin kurbağası", "Much speed. Very drift.": "Çok hız. Çok drift.", "Cool on every corner": "Her virajda sakin", "The hat stays on": "Şapka hep yerinde", "Bonks the line": "Çizgiye bonk!", "Loading racers…": "Yarışçılar hazırlanıyor…", "Lap": "Tur", "Best": "En iyi", "GO!": "BAŞLA!", "Start boost!": "Kalkış turbosu!", "Mini turbo": "Mini turbo", "Super turbo!": "Süper turbo!", "Nitro!": "Nitro!", "Final lap!": "Son tur!", "Finish!": "Bitiş!", "Race again": "Tekrar yarış", "Leave": "Çık", "New best!": "Yeni rekor!", "Place": "Sıra", "Time": "Süre", "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro": "Dön ◀ ▶ · W gaz · S fren · Shift drift · Space nitro", "Drift": "Drift", "Nitro": "Nitro", "Brake": "Fren", "ARCIRCLE Nexus Circuit": "ARCIRCLE Nexus Pisti", "Hold drift in a corner, let go for a turbo.": "Virajda drifti basılı tut, bırakınca turbo çıkar.", "1st": "1.", "2nd": "2.", "3rd": "3.", "4th": "4.", "Off road": "Yol dışı" },
};
// K2's words (the modes, the day's rules, the result card)
Object.assign(LW.ko, { "Mirror": "미러", "Nitro rush": "니트로 러시", "No-turbo drift": "노터보 드리프트", "Night race": "나이트 레이스", "Turbo": "터보", "The track mirrored": "좌우가 뒤집힌 트랙", "Start with 2 nitro · it fills faster": "니트로 2개로 출발 · 더 빨리 차요", "Drifts give no turbo · rivals slower": "드리프트 터보 없음 · 라이벌도 느려요", "A dark track · lit karts": "어두운 트랙 · 불 켠 카트", "Everyone faster": "모두 더 빨라요", "Race": "레이스", "Time Attack": "타임 어택", "Daily": "데일리", "Mode": "모드", "You vs the four · ARCL by place": "4명과 대결 · 순위별 ARCL", "You alone · race your ghosts": "혼자 달려요 · 고스트와 경쟁", "Kart Rookie": "카트 루키", "Kart Winner": "카트 위너", "Kart Champion": "카트 챔피언", "Time Trialist": "타임 트라이얼리스트", "Daily Racer": "데일리 레이서", "Your best": "내 최고 기록", "Week #1": "이번 주 1위", "Couldn't reach the server — this race won't count": "서버에 연결하지 못했어요 — 이번 레이스는 기록되지 않아요", "Daily challenge": "데일리 챌린지", "Saving…": "저장 중…", "Sign in to earn ARCL": "로그인하면 ARCL을 받을 수 있어요", "Guests race for fun: no ARCL, no board": "게스트는 재미로 달려요: ARCL과 순위표 없음", "Share": "공유", "Best lap": "베스트 랩", "I raced the ARCIRCLE Nexus Circuit in {t} with {r} in ARCIRCLE KART! 🏎️ Can you beat it?": "ARCIRCLE KART에서 {r}(으)로 ARCIRCLE 넥서스 서킷을 {t}에 달렸어요! 🏎️ 이길 수 있나요?", "Couldn't save the race — no ARCL this time": "레이스를 저장하지 못했어요 — 이번에는 ARCL이 없어요", "No ARCL — today's 5 paid races are done": "ARCL 없음 — 오늘의 보상 레이스 5회를 다 했어요", "No ARCL — today's ARCL limit is reached": "ARCL 없음 — 오늘의 ARCL 한도에 도달했어요", "Time Attack pays no ARCL": "타임 어택은 ARCL을 주지 않아요", "Today's daily is already paid": "오늘의 데일리 보상은 이미 받았어요", "No ARCL this time": "이번에는 ARCL이 없어요", "+{n} ARCL": "+{n} ARCL", "Races paid today {n}/{m}": "오늘 보상 레이스 {n}/{m}", "ARCL today {n}/{m}": "오늘 ARCL {n}/{m}", "Title unlocked: {x}": "칭호 획득: {x}", "Today's daily board": "오늘의 데일리 순위", "This week's board": "이번 주 순위", "Be the first on the board!": "첫 번째로 이름을 올려 보세요!", "Your place: {n}": "내 순위: {n}", "Change racer or mode": "레이서·모드 바꾸기" });
Object.assign(LW.zh, { "Mirror": "镜像", "Nitro rush": "氮气冲刺", "No-turbo drift": "无涡轮漂移", "Night race": "夜间赛", "Turbo": "极速", "The track mirrored": "赛道左右翻转", "Start with 2 nitro · it fills faster": "开局 2 格氮气 · 充得更快", "Drifts give no turbo · rivals slower": "漂移不给涡轮 · 对手也更慢", "A dark track · lit karts": "漆黑赛道 · 亮灯赛车", "Everyone faster": "所有人更快", "Race": "竞速", "Time Attack": "计时赛", "Daily": "每日", "Mode": "模式", "You vs the four · ARCL by place": "你对战四人 · 按名次得 ARCL", "You alone · race your ghosts": "独自驾驶 · 与幽灵比赛", "Kart Rookie": "卡丁车新人", "Kart Winner": "卡丁车赢家", "Kart Champion": "卡丁车冠军", "Time Trialist": "计时达人", "Daily Racer": "每日车手", "Your best": "你的最佳", "Week #1": "本周第一", "Couldn't reach the server — this race won't count": "无法连接服务器——本场比赛不计入", "Daily challenge": "每日挑战", "Saving…": "保存中…", "Sign in to earn ARCL": "登录即可赚取 ARCL", "Guests race for fun: no ARCL, no board": "游客只为娱乐：没有 ARCL，不上榜", "Share": "分享", "Best lap": "最快单圈", "I raced the ARCIRCLE Nexus Circuit in {t} with {r} in ARCIRCLE KART! 🏎️ Can you beat it?": "我在 ARCIRCLE KART 用 {r} 跑完 ARCIRCLE 枢纽赛道，用时 {t}！🏎️ 你能超过我吗？", "Couldn't save the race — no ARCL this time": "无法保存比赛——这次没有 ARCL", "No ARCL — today's 5 paid races are done": "没有 ARCL——今天 5 场有奖比赛已用完", "No ARCL — today's ARCL limit is reached": "没有 ARCL——已达今日 ARCL 上限", "Time Attack pays no ARCL": "计时赛不发 ARCL", "Today's daily is already paid": "今日每日奖励已领取", "No ARCL this time": "这次没有 ARCL", "+{n} ARCL": "+{n} ARCL", "Races paid today {n}/{m}": "今日有奖比赛 {n}/{m}", "ARCL today {n}/{m}": "今日 ARCL {n}/{m}", "Title unlocked: {x}": "获得称号：{x}", "Today's daily board": "今日每日榜", "This week's board": "本周排行榜", "Be the first on the board!": "成为第一个上榜的人！", "Your place: {n}": "你的名次：{n}", "Change racer or mode": "更换赛车手或模式" });
Object.assign(LW.tr, { "Mirror": "Ayna", "Nitro rush": "Nitro hücumu", "No-turbo drift": "Turbosuz drift", "Night race": "Gece yarışı", "Turbo": "Turbo", "The track mirrored": "Pist ayna gibi ters", "Start with 2 nitro · it fills faster": "2 nitroyla başla · daha hızlı dolar", "Drifts give no turbo · rivals slower": "Drift turbo vermez · rakipler daha yavaş", "A dark track · lit karts": "Karanlık pist · ışıklı kartlar", "Everyone faster": "Herkes daha hızlı", "Race": "Yarış", "Time Attack": "Zamana karşı", "Daily": "Günlük", "Mode": "Mod", "You vs the four · ARCL by place": "Sen ve dört rakip · sıraya göre ARCL", "You alone · race your ghosts": "Tek başına · hayaletlerinle yarış", "Kart Rookie": "Kart Çaylağı", "Kart Winner": "Kart Galibi", "Kart Champion": "Kart Şampiyonu", "Time Trialist": "Zaman Ustası", "Daily Racer": "Günlük Yarışçı", "Your best": "En iyin", "Week #1": "Haftanın 1.'si", "Couldn't reach the server — this race won't count": "Sunucuya ulaşılamadı — bu yarış sayılmayacak", "Daily challenge": "Günlük meydan okuma", "Saving…": "Kaydediliyor…", "Sign in to earn ARCL": "ARCL kazanmak için giriş yap", "Guests race for fun: no ARCL, no board": "Misafirler eğlencesine yarışır: ARCL ve sıralama yok", "Share": "Paylaş", "Best lap": "En iyi tur", "I raced the ARCIRCLE Nexus Circuit in {t} with {r} in ARCIRCLE KART! 🏎️ Can you beat it?": "ARCIRCLE KART'ta {r} ile ARCIRCLE Nexus Pisti'ni {t} sürede bitirdim! 🏎️ Geçebilir misin?", "Couldn't save the race — no ARCL this time": "Yarış kaydedilemedi — bu sefer ARCL yok", "No ARCL — today's 5 paid races are done": "ARCL yok — bugünün 5 ödüllü yarışı bitti", "No ARCL — today's ARCL limit is reached": "ARCL yok — bugünün ARCL sınırına ulaşıldı", "Time Attack pays no ARCL": "Zamana karşı ARCL vermez", "Today's daily is already paid": "Bugünün günlük ödülü zaten alındı", "No ARCL this time": "Bu sefer ARCL yok", "+{n} ARCL": "+{n} ARCL", "Races paid today {n}/{m}": "Bugün ödüllü yarış {n}/{m}", "ARCL today {n}/{m}": "Bugün ARCL {n}/{m}", "Title unlocked: {x}": "Unvan açıldı: {x}", "Today's daily board": "Bugünün günlük sıralaması", "This week's board": "Bu haftanın sıralaması", "Be the first on the board!": "Sıralamaya ilk sen gir!", "Your place: {n}": "Sıran: {n}", "Change racer or mode": "Yarışçı veya mod değiştir" });
// K6's words
Object.assign(LW.ko, { "FINAL LAP": "마지막 랩", "1ST!": "1위!", "PHOTO FINISH": "사진 판독", "Tap to skip": "탭해서 건너뛰기", "Trick": "트릭", "Trick!": "트릭!", "Live": "라이브", "Controls": "조작법", "Steer & drive": "조향·가속", "Turn your phone sideways — it plays better": "휴대폰을 가로로 돌리면 더 잘 즐길 수 있어요", "OK": "확인", "Settings": "설정", "Steering assist": "조향 보조", "Keeps you off the walls": "벽에 부딪히지 않게 살짝 도와줘요", "Auto-gas": "자동 가속", "Tap Gas to stop and go": "가속 버튼을 탭해서 멈추고 출발해요", "Tilt steering": "기울기 조향", "Tilt your phone to steer": "휴대폰을 기울여서 조향해요", "Button size": "버튼 크기", "Small": "작게", "Medium": "보통", "Large": "크게", "Done": "완료", "Tilt isn't available on this device": "이 기기에서는 기울기 조향을 쓸 수 없어요" });
Object.assign(LW.zh, { "FINAL LAP": "最后一圈", "1ST!": "第一！", "PHOTO FINISH": "冲线判定", "Tap to skip": "轻触跳过", "Trick": "特技", "Trick!": "特技！", "Live": "直播", "Controls": "操作", "Steer & drive": "转向与驾驶", "Turn your phone sideways — it plays better": "横屏握持手机，玩起来更顺手", "OK": "好的", "Settings": "设置", "Steering assist": "转向辅助", "Keeps you off the walls": "轻轻帮你避开护墙", "Auto-gas": "自动加速", "Tap Gas to stop and go": "轻触加速键来停车或出发", "Tilt steering": "重力转向", "Tilt your phone to steer": "倾斜手机来转向", "Button size": "按键大小", "Small": "小", "Medium": "中", "Large": "大", "Done": "完成", "Tilt isn't available on this device": "此设备无法使用重力转向" });
Object.assign(LW.tr, { "FINAL LAP": "SON TUR", "1ST!": "1.!", "PHOTO FINISH": "FOTO FİNİŞ", "Tap to skip": "Geçmek için dokun", "Trick": "Numara", "Trick!": "Numara!", "Live": "Canlı", "Controls": "Kontroller", "Steer & drive": "Dön ve sür", "Turn your phone sideways — it plays better": "Telefonu yan çevir — daha iyi oynanır", "OK": "Tamam", "Settings": "Ayarlar", "Steering assist": "Direksiyon yardımı", "Keeps you off the walls": "Seni duvarlardan hafifçe uzak tutar", "Auto-gas": "Otomatik gaz", "Tap Gas to stop and go": "Durup kalkmak için Gaz'a dokun", "Tilt steering": "Eğerek sürüş", "Tilt your phone to steer": "Dönmek için telefonu eğ", "Button size": "Düğme boyutu", "Small": "Küçük", "Medium": "Orta", "Large": "Büyük", "Done": "Tamam", "Tilt isn't available on this device": "Bu cihazda eğerek sürüş yok" });
const COLORS = [0x38d8ff, 0xff6fc8, 0x9b6bff, 0xffc23c, 0x5fe05a];
// the five racers (the owner's CRYPTO LEGENDS key art); clip names as the Meshy rigs have them
export const RACERS = [
  { id: "pepe", name: "PEPE", color: 0x5fe05a, line: "Frog of the fast lane", yes: "Half_Squat_with_Thumb_Up" },
  { id: "doge", name: "DOGE", color: 0xffc23c, line: "Much speed. Very drift." },
  { id: "pengu", name: "PENGU", color: 0x38a8ff, line: "Cool on every corner" },
  { id: "wif", name: "WIF", color: 0xff6fc8, line: "The hat stays on" },
  { id: "bonk", name: "BONK", color: 0xff7a2e, line: "Bonks the line" },
];
const CLIP = { idle: "Idle", drive: "Chair_Sit_Idle_M", win: "Seated_Fist_Pump", cheer: "Victory_Cheer", wave: "Big_Wave_Hello", lose: "Head_Hold_in_Pain" }, PICK = "arc.kart.racer";
const SEAT = { h: 1.25, y: 0.18, z: -0.15 }, KART_LEN = 3.1; // (a racer stands 1.25 m; the seated clip's hips land on the seat)

export function createKart(ctx) {
  const { THREE, esc } = ctx, L = LW[ctx.lang] || {}, T = (s, v) => { let r = L[s] != null ? L[s] : ctx.T(s, v); if (v) r = String(r).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)); return r; };
  let goWall = 0, realT = false, autoMe = false, topView = false, on = false, scene = null, cam = null, ui = null, track = null, karts = [], me = null, phase = "idle", clock = 0, cd = 0, acc = 0, finished = [], keys = new Set(), touch = { l: 0, r: 0, gas: 0, brake: 0, drift: 0, boost: 0 }, fxPool = [], shake = 0, eng = null, fx = null, skid = null, lastPlace = 0, camBack = 0, camRoll = 0, engTry = -1e9;
  // K2: the mode, the day's rule, the ghosts, the server's race, the mirrored copy of the track (the scene's track pieces sit in `world`, flipped for a mirror race)
  let hemi = null, sun = null, skyCyl = null, mode = "race", rule = "", daily = dailyOf(Date.now()), dailyTop = null, ghosts = [], rec = [], recT = 0, lapAt = [], raceP = null, mir = 1, tracks = null, world = null, nightLight = null, scale = 1, R = { top: 1, acc: 1 }, status = null, lastRes = null;
  // K6: the dressing, effects, the settings, the race's show (freeze / slow motion / side camera / podium), the HUD's minimap and gaps
  let dress = null, rings = null, checker = null, opts = optsOf(null, ctx.coarse), gasLatch = false, tiltV = 0, slowT = 0, cutAt = -99, freezeUntil = 0, seqTok = 0, pod = null, podCam = null, cineT = 0, cineSide = 1, cineDone = false, finalLap = false, droneOn = false, lightsOff = 0, scrAt = 0, flagAt = 0, mapFor = null, mapPath = null, mapBox = null, passes = 0, tricks = 0, forcePhoto = false, holdK6 = false, keysEl = null, lastGaps = null, k6log = [];
  try { opts = optsOf(localStorage.getItem(OPTS), ctx.coarse); } catch { /* the defaults */ }
  try { const m0 = localStorage.getItem(MODE); if (["race", "ta", "daily"].includes(m0)) mode = m0; } catch { /* the default */ }
  const signed = () => !!(ctx.sess && ctx.sess()), active = () => (mode === "ta" ? karts.filter((k) => k.me) : karts);
  const V = (x, y, z) => new THREE.Vector3(x, y, z), tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), gridC = V(0, 0, 0);
  const sit = (id) => { try { return ctx.makeHero(id); } catch { return Promise.resolve(null); } };
  const buzz = (p) => { try { if (ctx.buzz && (keys.size || Object.values(touch).some(Boolean))) ctx.buzz(p); } catch { /* no vibration */ } }, snd = (n, ...a) => { try { if (ctx.Snd && ctx.Snd[n]) ctx.Snd[n](...a); } catch { /* no sound */ } };
  const LV = [0, 0.8, 1.9, 3.0], SPARK = [0x4a4e58, 0x38c8ff, 0xffa63a, 0xc46bff], lvOf = (c) => (c >= LV[3] ? 3 : c >= LV[2] ? 2 : c >= LV[1] ? 1 : 0);
  // a point on a kart in the world (lx right, lz forward, in the kart's frame)
  const at = (k, lx, lz, out) => { const c = Math.cos(k.yaw), s = Math.sin(k.yaw); return out.set(k.pos.x + lx * c + lz * s, 0.2, k.pos.z - lx * s + lz * c); };

  // ---------- effects: one pool of additive points (sparks, smoke, confetti) and one of skid marks ----------
  function makeFx() {
    const N = ctx.low ? 90 : 200, g = new THREE.BufferGeometry(), P = new Float32Array(N * 3), C = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), vel = new Float32Array(N * 3), base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) P[i * 3 + 1] = -99;
    g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("color", new THREE.BufferAttribute(C, 3));
    const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d"), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "#fff"); gr.addColorStop(0.35, "rgba(255,255,255,.8)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.36, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
    let n = 0; const col = new THREE.Color();
    return {
      emit(p, vx, vy, vz, hex, t = 0.35) { const i = n++ % N; P.set([p.x, p.y, p.z], i * 3); vel.set([vx, vy, vz], i * 3); col.setHex(hex); base.set([col.r, col.g, col.b], i * 3); life[i] = max[i] = t; },
      burst(p, hex, k = 10, sp = 6, up = 3, t = 0.5) { for (let j = 0; j < k; j++) this.emit(p, (Math.random() - 0.5) * sp, Math.random() * up, (Math.random() - 0.5) * sp, Array.isArray(hex) ? hex[j % hex.length] : hex, t * (0.6 + Math.random() * 0.6)); },
      step(dt) { for (let i = 0; i < N; i++) { if (life[i] <= 0) continue; life[i] -= dt; const j = i * 3; if (life[i] <= 0) { P[j + 1] = -99; continue; } vel[j + 1] -= 9 * dt; P[j] += vel[j] * dt; P[j + 1] = Math.max(0.05, P[j + 1] + vel[j + 1] * dt); P[j + 2] += vel[j + 2] * dt; const f = life[i] / max[i]; C[j] = base[j] * f; C[j + 1] = base[j + 1] * f; C[j + 2] = base[j + 2] * f; }
        g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; },
    };
  }
  function makeSkid() {
    const N = ctx.low ? 160 : 360, geo = new THREE.PlaneGeometry(0.34, 0.75); geo.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x05070c, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N), o = new THREE.Object3D();
    o.scale.setScalar(0); o.updateMatrix(); for (let i = 0; i < N; i++) im.setMatrixAt(i, o.matrix); o.scale.setScalar(1); im.frustumCulled = false; scene.add(im);
    let n = 0; return { add(p, yaw) { o.position.set(p.x, 0.035, p.z); o.rotation.set(0, yaw, 0); o.updateMatrix(); im.setMatrixAt(n++ % N, o.matrix); im.instanceMatrix.needsUpdate = true; } };
  }

  // ---------- the track: a closed Catmull-Rom spline sampled into a table (position, right, distance) ----------
  function buildTrack(flip) {
    const P = TRACK_PTS.map(([x, z]) => V(flip ? -x : x, 0, z));
    const curve = new THREE.CatmullRomCurve3(P, true, "centripetal"), N = 900, pts = curve.getSpacedPoints(N);
    const S = [], len = curve.getLength(); for (let i = 0; i < N; i++) { const p = pts[i], q = pts[(i + 1) % N], t = q.clone().sub(p).normalize(); S.push({ p, t, r: V(-t.z, 0, t.x), s: (i / N) * len }); }
    return { S, N, len, curve };
  }
  // the nearest table index around a guess (karts move a few samples a step)
  function nearest(pos, guess) { let best = guess, bd = Infinity; for (let k = -24; k <= 24; k++) { const i = (guess + k + track.N) % track.N, d = track.S[i].p.distanceToSquared(pos); if (d < bd) { bd = d; best = i; } } return best; }
  function lateral(pos, i) { const s = track.S[i]; return tmp.copy(pos).sub(s.p).dot(s.r); }

  function ribbon(w0, w1, y, mat) { // a strip along the track between lateral offsets w0..w1
    const N = track.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
    for (let i = 0; i <= N; i++) { const s = track.S[i % N], a = s.p.clone().addScaledVector(s.r, w0), b = s.p.clone().addScaledVector(s.r, w1); pos.set([a.x, y, a.z, b.x, y, b.z], i * 6); const v = (i / N) * track.len / 8; uv.set([0, v, 1, v], i * 4); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return new THREE.Mesh(g, mat);
  }
  function roadTex() { const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d"); g.fillStyle = "#2a2f3d"; g.fillRect(0, 0, 64, 256); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1, 1); } g.fillStyle = "#e8f6ff"; g.fillRect(30, 0, 4, 120); g.fillStyle = "#38d8ff"; g.fillRect(0, 0, 3, 256); g.fillRect(61, 0, 3, 256); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function curbTex() { const c = document.createElement("canvas"); c.width = 8; c.height = 32; const g = c.getContext("2d"); g.fillStyle = "#ff3d6e"; g.fillRect(0, 0, 8, 16); g.fillStyle = "#f4f7ff"; g.fillRect(0, 16, 8, 16); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; }

  function buildScene() {
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1638); scene.fog = new THREE.Fog(0x0b1638, 120, ctx.low ? 320 : 520);
    cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 900);
    hemi = new THREE.HemisphereLight(0x9fd8ff, 0x1a2244, 1.25); scene.add(hemi); sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 140, 40); scene.add(sun);
    tracks = [buildTrack(false), buildTrack(true)]; track = tracks[0]; world = new THREE.Group(); scene.add(world); // (the pieces are built on the plain track; a mirror race flips `world` and drives on tracks[1])
    nightLight = new THREE.PointLight(0xbfe8ff, 0, 34, 1.6); scene.add(nightLight); // (the night rule's headlight: always there, dark by day, so no shader changes at the start)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(520, 48), new THREE.MeshLambertMaterial({ color: 0x173a3a })); ground.rotation.x = -Math.PI / 2; ground.position.set(20, -0.05, 110); world.add(ground);
    const grid = new THREE.GridHelper(1000, 100, 0x2ee0b0, 0x1f5a5a); grid.position.set(20, 0, 110); grid.material.transparent = true; grid.material.opacity = 0.18; world.add(grid);
    const rt = roadTex(); rt.repeat.set(1, 1); const road = ribbon(-ROAD / 2, ROAD / 2, 0.02, new THREE.MeshLambertMaterial({ map: rt })); world.add(road);
    const ct = curbTex(); for (const [a, b] of [[-ROAD / 2 - 1.2, -ROAD / 2], [ROAD / 2, ROAD / 2 + 1.2]]) world.add(ribbon(a, b, 0.04, new THREE.MeshLambertMaterial({ map: ct })));
    // the walls: low glowing rails
    const railM = new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    for (const w of [-WALL, WALL]) { const m = ribbon(w, w + 0.01, 0, railM); const g = m.geometry, p = g.attributes.position; for (let i = 0; i < p.count; i++) if (i % 2) p.setY(i, 1.1); p.needsUpdate = true; world.add(m); }
    // neon arches every ~60 m (one InstancedMesh), the start gantry, boost pads
    const archN = Math.floor(track.len / 60), arch = new THREE.InstancedMesh(new THREE.TorusGeometry(ROAD / 2 + 2, 0.35, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0x2ee0b0 }), archN), o = new THREE.Object3D();
    for (let k = 0; k < archN; k++) { const s = track.S[Math.floor((k / archN) * track.N)]; o.position.copy(s.p); o.lookAt(tmp.copy(s.p).add(s.t)); o.updateMatrix(); arch.setMatrixAt(k, o.matrix); arch.setColorAt(k, new THREE.Color(k % 2 ? 0x2ee0b0 : 0xff6fc8)); }
    world.add(arch);
    const s0 = track.S[0], gantry = new THREE.Group(); for (const w of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), new THREE.MeshLambertMaterial({ color: 0x1b2440 })); post.position.set(w * (ROAD / 2 + 1.5), 3.5, 0); gantry.add(post); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD + 4, 1.4, 0.6), new THREE.MeshBasicMaterial({ color: 0xffc23c })); bar.position.y = 7; gantry.add(bar);
    const chk = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 2), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement("canvas"); c.width = 128; c.height = 16; const g = c.getContext("2d"); for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? "#fff" : "#111"; g.fillRect(x * 8, y * 8, 8, 8); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })() }));
    chk.rotation.x = -Math.PI / 2; chk.position.y = 0.05; gantry.add(chk); gantry.position.copy(s0.p); gantry.lookAt(tmp.copy(s0.p).add(s0.t)); world.add(gantry);
    track.pads = [180, 420, 650].map((i) => { const s = track.S[i], m = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshBasicMaterial({ color: 0xffc23c, transparent: true, opacity: 0.85 })); m.rotation.x = -Math.PI / 2; m.position.copy(s.p).addScaledVector(s.r, (i % 2 ? 3 : -3)).setY(0.06); m.rotation.z = Math.atan2(s.t.x, s.t.z) + Math.PI; world.add(m); return { i, lat: i % 2 ? 3 : -3, m }; });
    // K6: grandstands, flags, the standings screen, the tunnel, more arches, the ramps, the start lights (world-kart-dress.js)
    try { dress = makeDress(THREE, track, { WALL, ROAD, few: !!(ctx.low || ctx.coarse), low: !!ctx.low }); world.add(dress.g); dress.lights.set(0); glbSwap(); } catch (e) { dress = null; console.warn("kart dress:", e && e.message); }
    // a skyline of glowing towers round the circuit (instanced, cheap)
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x24305a, emissive: 0x1a2a6a }), ctx.low ? 40 : 90);
    for (let k = 0; k < towers.count; k++) { const a = (k / towers.count) * Math.PI * 2, r = 320 + (k * 37) % 120, h = 20 + (k * 53) % 70; o.position.set(20 + Math.cos(a) * r, h / 2, 110 + Math.sin(a) * r); o.rotation.set(0, a, 0); o.scale.set(10 + (k % 5) * 3, h, 10 + (k % 3) * 4); o.updateMatrix(); towers.setMatrixAt(k, o.matrix); }
    world.add(towers);
    // the sky: Meshy's neon city round the circuit on a tall open cylinder
    try { const sky = new THREE.TextureLoader().load("/images/kart/sky.webp"); sky.colorSpace = THREE.SRGBColorSpace; sky.wrapS = THREE.RepeatWrapping; sky.repeat.set(3, 1);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(700, 700, 420, 40, 1, true), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false })); cyl.position.set(20, 150, 110); world.add(cyl); skyCyl = cyl; } catch { /* the plain night colour */ }
    try { const rd = new THREE.TextureLoader().load("/images/kart/road.webp", () => { road.material.map = rd; road.material.needsUpdate = true; }); rd.colorSpace = THREE.SRGBColorSpace; rd.wrapS = rd.wrapT = THREE.RepeatWrapping; rd.repeat.set(2, 1); rd.anisotropy = 4; } catch { /* the drawn road */ }
    if (!ctx.low) props(arch, gantry, towers).catch((e) => console.warn("kart props:", e && e.message));
  }
  // K6's hook: a Meshy model listed in K6_GLB replaces the drawn start lights' frame / a ramp's wedge (the drawn lamps stay)
  function glbSwap() {
    if (ctx.low || !dress) return;
    if (K6_GLB.includes("lights")) load("lights").then((gl) => { if (!dress) return; const g = fit(gl.scene, { len: 2 * WALL + 1.2 }); dress.lights.g.add(g); for (const c of dress.lights.g.children) if (c.userData.drawn) c.visible = false; }).catch(() => { /* the drawn gantry */ });
    if (K6_GLB.includes("ramp")) load("ramp").then((gl) => { if (!dress) return; for (const rg of dress.ramps) { const g = fit(gl.scene.clone(), { len: RAMP.w }); rg.add(g); for (const c of rg.children) if (c.userData.drawn) c.visible = false; } }).catch(() => { /* the drawn wedge */ });
  }
  // one model → instanced copies (its fitted transform baked into the geometry)
  function instOf(gl, n, opts) { const w = fit(gl.scene, opts); w.updateMatrixWorld(true); const out = []; w.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); out.push(new THREE.InstancedMesh(g, o.material, n)); } }); return out; }
  async function props(arch, gantry, towers) {
    const [A, Tw, B] = await Promise.all(["arch", "tower", "boostpad"].map((f) => load(f).catch(() => null))); const G = null; /* (Meshy's truss arch stands on the line as the gantry too) */ if (!on && !scene) return;
    const o = new THREE.Object3D();
    if (A) { const n = arch.count; A.scene.scale.z = 0.22; /* (Meshy's arch is as deep as it is wide: flattened along the road) */ const ms = instOf(A, n, { len: ROAD + 5 }); for (const im of ms) { for (let k = 0; k < n; k++) { arch.getMatrixAt(k, o.matrix); im.setMatrixAt(k, o.matrix); } world.add(im); } arch.visible = false; for (const c of gantry.children) if (c.geometry && c.geometry.type === "BoxGeometry") c.visible = false; }
    if (G) { const g = fit(G.scene, { len: ROAD + 6 }); g.position.copy(gantry.position); g.quaternion.copy(gantry.quaternion); world.add(g); for (const c of gantry.children) if (c.geometry && c.geometry.type === "BoxGeometry") c.visible = false; }
    if (Tw) { const n = towers.count, ms = instOf(Tw, n, { h: 1 }); for (const im of ms) { for (let k = 0; k < n; k++) { towers.getMatrixAt(k, o.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); const hh = o.scale.y; o.scale.set(hh * 0.5, hh, hh * 0.5); o.position.y = 0; o.updateMatrix(); im.setMatrixAt(k, o.matrix); } world.add(im); } towers.visible = false; }
    if (B) for (const p of tracks[0].pads) { const g = fit(B.scene.clone(), { len: 6 }); g.position.copy(p.m.position).setY(0.02); g.rotation.y = p.m.rotation.z; world.add(g); p.m.material.opacity = 0.35; }
  }

  // ---------- a kart: body, wheels, exhaust glow; the hero sits on it ----------
  function kartMesh(color) {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 2.9), new THREE.MeshLambertMaterial({ color })); body.position.y = 0.55; g.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.9), new THREE.MeshLambertMaterial({ color: 0x1b2440 })); nose.position.set(0, 0.5, 1.7); g.add(nose);
    const wingM = new THREE.MeshLambertMaterial({ color: 0x1b2440 }), wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.5), wingM); wing.position.set(0, 1.1, -1.4); g.add(wing);
    const wM = new THREE.MeshLambertMaterial({ color: 0x111622 }), wheels = [];
    for (const [x, z] of [[-1.05, 1.0], [1.05, 1.0], [-1.05, -1.0], [1.05, -1.0]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 12), wM); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w); wheels.push(w); }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); flame.rotation.x = -Math.PI / 2; flame.position.set(0, 0.6, -1.9); g.add(flame);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; g.add(glow);
    const beam = new THREE.Mesh(new THREE.CircleGeometry(5, 18, -0.42, 0.84), new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })); beam.rotation.x = -Math.PI / 2; beam.rotation.z = -Math.PI / 2; beam.position.set(0, 0.06, 1.4); beam.visible = false; g.add(beam); // (the night rule's headlights on the road)
    return { g, wheels, flame, glow, beam, drawn: [body, nose, wing, ...wheels] };
  }
  // ---------- the Meshy models: a racer's kart + rigged body, the track's props ----------
  const url = (f) => `/models/world/kart/${f}.glb${ctx.ver || ""}`; // (ctx.ver: the build's ?v= query)
  let LD = null; const load = (f) => { try { if (!LD) LD = ctx.K.gltfLoader(); return LD.loadAsync(url(f)); } catch (e) { return Promise.reject(e); } };
  // fit a model: longest horizontal side → len (or its height → h), on the ground, centred
  function fit(obj, { len = 0, h = 0, turn = 0 } = {}) {
    obj.rotation.y = turn; obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(V(0, 0, 0));
    const k = h ? h / (sz.y || 1) : len / (Math.max(sz.x, sz.z) || 1); obj.scale.multiplyScalar(k); obj.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(V(0, 0, 0)); obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
    const w = new THREE.Group(); w.add(obj); return w;
  }
  async function racerBody(r) {
    try {
      const [kg, cg] = await Promise.all([load("kart-" + r.id), load("char-" + r.id + "-rig")]);
      const kart = fit(kg.scene, { len: KART_LEN, turn: Math.PI / 2 }); // (Meshy's kart: nose at −X → +Z, our forward)
      const body = fit(cg.scene, { h: SEAT.h }), mixer = new THREE.AnimationMixer(cg.scene), acts = {};
      for (const c of cg.animations || []) acts[c.name] = mixer.clipAction(c);
      cg.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
      let cur = null, oneT = 0;
      const hero = { obj: body, mixer, has: (n) => !!acts[n],
        play(n, { once = false, fade = 0.25, dur = 0 } = {}) { const a = acts[n] || acts[CLIP.idle]; if (!a || a === cur) return; a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.fadeIn(fade).play(); if (cur) cur.fadeOut(fade); cur = a; oneT = once ? (dur > 0 ? Math.min(dur, a.getClip().duration) : a.getClip().duration) : 0; },
        busy: () => oneT > 0, /* (K6: a one-shot is playing — a reaction never cuts it) */
        update(dt) { mixer.update(dt); if (oneT > 0 && (oneT -= dt) <= 0 && hero.after) { const n = hero.after; hero.after = null; hero.play(n); } } };
      return { kart, hero };
    } catch (e) { console.warn("kart racer " + r.id + ":", e && e.message); return null; }
  }
  async function makeRacer(i, heroId, isMe, racer) {
    const m = kartMesh(racer ? racer.color : COLORS[i % COLORS.length]), s = track.S[track.N - 6 - Math.floor(i / 2) * 7], lat = (i % 2 ? 3.6 : -3.6);
    const pos = s.p.clone().addScaledVector(s.r, lat), yaw = Math.atan2(s.t.x, s.t.z);
    const k = { i, me: isMe, m, pos, yaw, vh: yaw, speed: 0, idx: track.N - 6 - Math.floor(i / 2) * 7, lap: 0, prog: 0, best: 0, drift: 0, driftDir: 0, charge: 0, boostT: 0, boostK: 0, nitro: 0, stall: 0, slip: 0, finish: 0, hero: null, lane: (i % 3 - 1) * 2.6, skill: 0.9 + ((i * 37) % 10) / 100, wob: 0, startSpeed: 0, y: 0, vy: 0, air: 0, onR: false, trickT: -1, trickAt: 0, tPrev: false, hopY: 0, st: 0, stV: 0, marks: new Float32Array(Math.ceil(((LAPS + 2) * 1100) / GAP_M)).fill(-1), mk: 0, pl: 0 };
    m.g.position.copy(pos); m.g.rotation.y = yaw; scene.add(m.g); k.racer = racer || null;
    if (racer) { const b = await racerBody(racer); if (b) { for (const d of m.drawn) d.visible = false; m.g.add(b.kart); b.hero.obj.position.set(0, SEAT.y, SEAT.z); m.g.add(b.hero.obj); b.hero.play(CLIP.drive); k.hero = b.hero; k.kartObj = b.kart; return k; } }
    const h = await sit(heroId); if (h && h.obj) { h.obj.scale.multiplyScalar(0.78); h.obj.position.set(0, 0.62, -0.25); k.seat = [0, 0.62, -0.25]; m.g.add(h.obj); try { h.play("sit"); } catch { /* standing is fine */ } k.hero = h; }
    return k;
  }

  // ---------- input ----------
  const kd = (e) => { if (!on) return; const c = e.code; keys.add(c); if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault(); if (c === "Escape") leave(); };
  const ku = (e) => keys.delete(e.code);
  function input() {
    const L0 = keys.has("KeyA") || keys.has("ArrowLeft") || touch.l, R0 = keys.has("KeyD") || keys.has("ArrowRight") || touch.r;
    const st0 = (R0 ? 1 : 0) - (L0 ? 1 : 0), auto = opts.autogas && ctx.coarse && gasLatch && phase === "race"; /* (K6: auto-gas — the Gas button is a switch; tilt steering when no arrow is held) */
    return { steer: st0 || (opts.tilt && ctx.coarse ? tiltV : 0), gas: keys.has("KeyW") || keys.has("ArrowUp") || touch.gas || auto ? 1 : 0, /* (phones: the Gas button — it used to drive by itself) */ brake: keys.has("KeyS") || keys.has("ArrowDown") || touch.brake ? 1 : 0, drift: keys.has("ShiftLeft") || keys.has("ShiftRight") || touch.drift, boost: keys.has("Space") || touch.boost, trick: !!touch.trick };
  }

  // ---------- the physics step (fixed 1/60 s) ----------
  function stepKart(k, inp, dt) {
    const offRoad = Math.abs(lateral(k.pos, k.idx)) > ROAD / 2 + 1.2; k.off = offRoad; const sp0 = k.speed;
    let top = (k.boostT > 0 ? BOOST_TOP : TOP) * R.top * (offRoad && k.boostT <= 0 ? 0.55 : 1) * (k.me ? 1 : k.skill) * (k.slip > 1 ? 1.06 : 1);
    if (k.stall > 0) { k.stall -= dt; top = 4; }
    if (inp.gas) k.speed += ACC * R.acc * dt * (k.speed > top ? -0.6 : 1); else k.speed -= DRAG * 18 * dt; // (1.7: off the gas the kart rolls down at ~6 m/s², was ~3: it felt like it kept going)
    if (inp.brake) k.speed -= BRAKE * dt;
    if (k.boostT > 0) { k.boostT -= dt; k.speed = Math.max(k.speed, top * (0.86 + 0.14 * k.boostK)); }
    k.speed = Math.max(0, Math.min(k.speed, top + 6)); if (k.speed > top) k.speed -= (k.speed - top) * 2 * dt;
    const sp = k.speed / TOP;
    // drift: starts with a direction held at speed, ends when let go → the turbo it charged
    if (inp.drift && !k.drift && !k.air && Math.abs(inp.steer) > 0 && k.speed > 14) { k.drift = 1; k.driftDir = Math.sign(inp.steer); k.charge = 0; if (k.me) hop(k); }
    if (k.drift && (!inp.drift || k.speed < 8)) releaseDrift(k);
    let turn;
    if (k.drift) { turn = k.driftDir * (1.05 + 0.55 * inp.steer * k.driftDir) * 1.45; k.charge += dt * (0.6 + 0.8 * Math.abs(inp.steer)) * (sp > 0.5 ? 1 : 0.4); k.nitro = Math.min(2, k.nitro + dt * (rule === "nitro" ? 0.3 : 0.12)); const lv = lvOf(k.charge); if (lv > (k.lv || 0)) { k.lv = lv; if (k.me) { snd("kartSpark", lv); buzz(10 + lv * 8); } } }
    else turn = inp.steer * (2.2 - 0.9 * Math.min(1, sp));
    if (k.air) turn *= 0.35; k.st = inp.steer;
    if (rule === "nitro" && phase === "race") k.nitro = Math.min(2, k.nitro + dt * 0.05); // (the nitro rule: it fills by itself too)
    k.yaw -= turn * dt * Math.min(1, sp * 1.6 + 0.15);
    // the velocity's heading follows the kart's facing: tight on grip, loose in a drift
    const grip = k.air ? 1 : k.drift ? 3.2 : offRoad ? 6 : 11; let dv = k.yaw - k.vh; dv = Math.atan2(Math.sin(dv), Math.cos(dv)); k.vh += dv * Math.min(1, grip * dt);
    if (inp.boost && k.nitro >= 1 && k.boostT <= 0.1) { k.nitro -= 1; boost(k, 1.6, 1, "Nitro!", 2); }
    k.pos.x += Math.sin(k.vh) * k.speed * dt; k.pos.z += Math.cos(k.vh) * k.speed * dt;
    k.idx = nearest(k.pos, k.idx); const s = track.S[k.idx], lat = lateral(k.pos, k.idx);
    air(k, inp, s, lat, dt);
    if (k.me && opts.assist && !autoMe && !k.air && k.speed > 5) { const edge = Math.abs(lat) - (WALL - 2.6); /* (K6: steering assist — near a wall the kart is turned gently back along the road and eased in) */
      if (edge > 0) { const road = Math.atan2(s.t.x, s.t.z), aim = road + Math.sign(lat) * 0.1; let dv = aim - k.yaw; dv = Math.atan2(Math.sin(dv), Math.cos(dv)); if (Math.abs(dv) < 1.4) { const f = Math.min(1, dt * 2.6 * Math.min(1, edge / 2.6)) * (k.drift ? 0.4 : 1); k.yaw += dv * f; k.vh += dv * f; } k.pos.addScaledVector(s.r, -Math.sign(lat) * Math.min(edge, 2.6) * 0.9 * dt); } }
    if (Math.abs(lat) > WALL) { // the wall: pushed back in, a bounce off it (harder the straighter you hit it), sparks, a thud and a buzz
      const side = Math.sign(lat), road = Math.atan2(s.t.x, s.t.z), into = Math.abs(Math.sin(k.vh - road)), hit = Math.min(1, into * 2.2 * (k.speed / TOP));
      k.pos.addScaledVector(s.r, (Math.abs(lat) - WALL) * -side); k.speed *= into > 0.35 ? 0.72 : 0.9;
      if (into > 0.15) { k.vh = road + side * Math.min(0.12, 0.03 + into * 0.15); k.yaw = k.vh; }
      if (clock - (k.bumpAt || -9) > 0.25 && k.speed > 4) { k.bumpAt = clock; if (fx && (k.me || k.pos.distanceToSquared(me.pos) < 1600)) { const c = tmp2.copy(k.pos).addScaledVector(s.r, side * 0.9).setY(0.6); fx.burst(c, [0xffd36a, 0xff8a3a, 0xffffff], 6 + Math.round(hit * 10), 7, 3.5, 0.45); }
        if (k.me) { shake = 0.12 + hit * 0.45; buzz(Math.round(15 + hit * 45)); snd("kartBump", hit); } if (hit > 0.45) react(k, CLIP.lose, 1.1); } }
    for (const p of tracks[0].pads) if (!k.air && Math.abs(k.idx - p.i) < 4 && Math.abs(lat - p.lat * mir) < 2.6 && k.boostT < 0.3) { boost(k, 0.9, 0.8, k.me ? "" : ""); if (rings && (k.me || (me && k.pos.distanceToSquared(me.pos) < 1600))) rings.at(k.pos, k.me ? 0xffc23c : 0x38d8ff); }
  }
  function boost(k, secs, kk, say, lv = 1) { k.boostT = Math.max(k.boostT, secs); k.boostK = kk; k.boostLv = lv;
    if (fx && (k.me || (me && k.pos.distanceToSquared(me.pos) < 1600))) { const b = at(k, 0, -1.8, tmp2); for (let j = 0; j < 8 + lv * 4; j++) { const a = (j / (8 + lv * 4)) * Math.PI * 2; fx.emit(b, Math.cos(a) * 4 - Math.sin(k.vh) * 6, 1 + Math.random(), Math.sin(a) * 4 - Math.cos(k.vh) * 6, SPARK[Math.max(1, lv)], 0.45); } }
    if (k.me) { shake = 0.18 + lv * 0.06; camBack = 1.2 + lv * 0.5; if (say) flash(T(say)); snd("kartTurbo", lv); buzz(20 + lv * 15); } }
  function hop(k) { k.hopY = 0.4; }
  function releaseDrift(k) { const lv = rule === "nodrift" ? 0 : lvOf(k.charge); /* (the nodrift rule: a drift gives no turbo) */ if (lv === 3) boost(k, 1.6, 1.2, "Ultra turbo!", 3); else if (lv === 2) boost(k, 1.15, 1, "Super turbo!", 2); else if (lv === 1) boost(k, 0.6, 0.6, "Mini turbo", 1); k.drift = 0; k.charge = 0; k.lv = 0; }
  // ---------- K6: the ramps, the air, tricks ----------
  const GRAV = 21, TRICK_DUR = 0.55;
  function air(k, inp, s, lat, dt) {
    let onR = false; const along = s.s + (k.pos.x - s.p.x) * s.t.x + (k.pos.z - s.p.z) * s.t.z;
    for (const r of RAMPS) { let d = along - tracks[0].S[r.i].s; if (d < -track.len / 2) d += track.len; if (d > track.len / 2) d -= track.len;
      if (d >= 0 && d < RAMP.len && Math.abs(lat - r.lat * mir) < RAMP.w / 2) { onR = true; if (!k.air) k.y = (d / RAMP.len) * RAMP.h; } }
    if (!k.air && !onR && k.y > 0.02) { // off the lip (or off its side): airborne
      k.air = 1; k.vy = k.onR && k.speed > 6 ? (k.speed * RAMP.h) / RAMP.len + 1.6 : 0; k.trickT = -1; k.tPrev = true; if (k.drift) releaseDrift(k);
      if ((!k.me || autoMe) && k.vy > 3 && (autoMe || Math.random() < 0.45)) k.trickAt = clock + 0.08; } // (the computer racers trick sometimes; the tests' autopilot always)
    k.onR = onR;
    if (k.air) { k.vy -= GRAV * dt; k.y += k.vy * dt; const want = !!(inp.drift || inp.trick);
      if (k.trickT < 0 && k.y > 0.4 && ((want && !k.tPrev) || (k.trickAt && clock >= k.trickAt))) startTrick(k);
      if (k.trickT >= 0) k.trickT += dt;
      if (k.y <= 0) land(k); }
    k.tPrev = !!(inp.drift || inp.trick);
  }
  function startTrick(k) { k.trickT = 0; k.trickAt = 0; k.trickKind = (k.trickN = (k.trickN || 0) + 1) % 3; react(k, CLIP.wave, 1.0, true); if (k.me) { snd("kartSpark", 2); buzz(15); } }
  function land(k) { const t = k.trickT; k.y = 0; k.vy = 0; k.air = 0; k.trickAt = 0; k.trickT = -1;
    if (t >= TRICK_DUR * 0.8) { boost(k, 0.75, 0.75, "Trick!", 1); if (k.me) tricks++; } else if (t >= 0) k.speed *= 0.82; // (landed mid-flip: a stumble, no turbo)
    if (k.me) { shake = Math.max(shake, 0.14); snd("kartBump", 0.35); buzz(18); }
    if (fx && (k.me || (me && k.pos.distanceToSquared(me.pos) < 900))) fx.burst(at(k, 0, 0, tmp2), [0xcfeeff, 0x38d8ff], 8, 6, 1.5, 0.35); }
  /// a racer's reaction: the rig's own clip once, never over a one-shot, back to driving after (4 s apart unless forced)
  function react(k, clip, dur, force) { const h = k.hero; if (!h || !h.has || !h.busy || !h.has(clip) || h.busy() || (!force && clock - (k.reactAt ?? -9) < 4)) return false;
    k.reactAt = clock; h.after = CLIP.drive; h.play(clip, { once: true, dur }); if (k.me) { k6log.push(clip); if (k6log.length > 16) k6log.shift(); } return true; }

  function aiInput(k) {
    const look = track.S[(k.idx + 14 + Math.floor(k.speed / 4)) % track.N], tgt = tmp2.copy(look.p).addScaledVector(look.r, k.lane + Math.sin(clock * 0.7 + k.i) * 1.2);
    let a = Math.atan2(tgt.x - k.pos.x, tgt.z - k.pos.z) - k.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
    const bend = Math.abs(Math.atan2(Math.sin(Math.atan2(look.t.x, look.t.z) - Math.atan2(track.S[k.idx].t.x, track.S[k.idx].t.z)), 1));
    k.wob = Math.max(0, k.wob - STEP); if (Math.random() < 0.0015) k.wob = 0.5; // a small mistake now and then
    const gap = me ? (me.prog - k.prog) : 0, rb = Math.max(-0.12, Math.min(0.1, gap / 400)); // a light rubber band
    k.skill = Math.max(0.82, Math.min(1.04, (0.9 + ((k.i * 37) % 10) / 100) + rb)) * (rule === "nodrift" ? 0.94 : 1); // (the nodrift rule: the computer racers a little slower)
    return { steer: Math.max(-1, Math.min(1, -a * 2.4 + (k.wob ? Math.sin(clock * 9) * 0.6 : 0))), gas: 1, brake: bend > 0.9 && k.speed > 26 ? 1 : 0, drift: bend > 0.6 && k.speed > 22 && !k.wob, boost: k.nitro >= 1 && bend < 0.2 };
  }

  // ---------- laps: progress = laps × length + the distance along; a lap counts when you cross the line going forward ----------
  function laps(k, prevIdx) {
    const N = track.N; if (prevIdx > N * 0.8 && k.idx < N * 0.2) { k.lap++; if (k.me && lapAt[k.lap] == null) lapAt[k.lap] = clock; if (k.me && k.lap >= 2 && k.lap <= LAPS) { if (k.lap === LAPS) { finalLap = true; banner(T("FINAL LAP")); } else flash(`${T("Lap")} ${k.lap}/${LAPS}`); snd("kartLap", k.lap === LAPS); buzz(25); } }
    else if (prevIdx < N * 0.2 && k.idx > N * 0.8) k.lap--;
    k.prog = k.lap * track.len + track.S[k.idx].s; if (phase === "race" && k.prog > 0) k.mk = markAt(k.marks, k.mk, k.prog, clock); // (K6: the gaps' marks)
    if (k.lap > LAPS && !k.finish) { k.finish = clock; finished.push(k); const pl = finished.length;
      react(k, pl === 1 ? CLIP.cheer : pl <= 3 ? CLIP.win : CLIP.lose, pl === 1 ? 3.5 : 2.5, true); // (K6: the win → Victory_Cheer)
      if (k.me) { buzz([50, 40, 90]); if (fx) for (let j = 0; j < 3; j++) fx.burst(tmp2.copy(k.pos).setY(1.5 + j * 0.6), [0xffd36a, 0x38d8ff, 0xff6fc8, 0x5fe05a, 0xffffff], 18, 9, 7, 1.3); if (checker) checker.burst(tmp2.copy(k.pos).setY(1.6)); done(); } }
  }

  function tick(dt, t) {
    if (!on || performance.now() < freezeUntil) return; /* (K6: the photo finish's freeze-frame — nothing moves, the scene stays drawn) */ dt = Math.min(dt, 0.1); if (realT && phase === "race") dt = Math.max(dt, Math.min(1, (performance.now() - goWall) / 1000 - clock - 0.3)); /* (realT: the browser test catches the race up to the wall clock on a slow machine, never past it) */
    const rdt = dt; if (slowT > 0) { slowT -= dt; dt *= 0.3; } // (K6: taking 1st — a short slow motion)
    if (phase === "pick") { pickCam(dt); for (const k of karts) if (k.hero && k.hero.update) k.hero.update(dt, t); return; }
    if (phase === "count") { cd -= dt; paintCount(); if (cd <= 0) { phase = "race"; clock = 0; goWall = performance.now(); lightsOff = 2.2; for (const k of karts) if (!k.me) k.speed = 6; const inp = input(); if (inp.gas && me.startSpeed > 0.9 && me.startSpeed < 1.6) boost(me, 1.0, 0.9, "Start boost!"); else if (me.startSpeed >= 1.6) { me.stall = 0.7; flash(T("Stalled!")); snd("kartStall"); buzz(60); if (fx) for (let j = 0; j < 14; j++) fx.emit(at(me, (Math.random() - 0.5) * 0.8, -1.7, tmp2), (Math.random() - 0.5) * 2, 1.5 + Math.random(), (Math.random() - 0.5) * 2, 0x777c88, 0.9); } if (opts.autogas && ctx.coarse) { gasLatch = true; paintGas(); } } else { const inp = input(); me.startSpeed = inp.gas ? me.startSpeed + dt : 0; } }
    if (phase === "race" || phase === "done") {
      acc += dt; while (acc >= STEP) { acc -= STEP; clock += STEP;
        for (const k of active()) { if (k.finish && !k.me) { k.speed *= 0.99; } const prev = k.idx, inp = k.me ? (phase === "done" ? { steer: 0, gas: 0, brake: 1, drift: 0, boost: 0 } : autoMe ? aiInput(k) : input()) : aiInput(k); /* (autoMe: the tests drive you with the computer's line) */ stepKart(k, inp, STEP); laps(k, prev); }
        // kart ↔ kart: circles push apart; a slipstream right behind another
        if (phase === "race" && !me.finish && rec.length < GHOST_MAX && clock >= rec.length * GHOST_DT) rec.push([me.pos.x, me.pos.z, me.yaw]); // (the ghost: a sample every 0.2 s)
        const ka = active(); for (let a = 0; a < ka.length; a++) for (let b = a + 1; b < ka.length; b++) { const A = ka[a], B = ka[b], dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz); if (d < 2.4 && d > 0.01 && Math.abs(A.y - B.y) < 1) { const push = (2.4 - d) / 2; A.pos.x -= (dx / d) * push; A.pos.z -= (dz / d) * push; B.pos.x += (dx / d) * push; B.pos.z += (dz / d) * push;
          if (phase === "race" && Math.abs(A.speed - B.speed) > 7) { const front = A.prog > B.prog ? A : B; react(front, CLIP.lose, 1.0); if ((A.me || B.me) && clock - (me.bumpAt || -9) > 0.4) { me.bumpAt = clock; shake = Math.max(shake, 0.2); snd("kartBump", 0.5); buzz(25); } } } } // (K6: hit from behind → Head_Hold_in_Pain)
        for (const A of ka) { let behind = false; for (const B of ka) if (A !== B) { const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz), f = (dx * Math.sin(A.vh) + dz * Math.cos(A.vh)) / (d || 1); if (d < 14 && d > 3 && f > 0.95) behind = true; } A.slip = behind ? A.slip + STEP : 0; }
      }
    }
    const racing = phase === "race" || phase === "done", inpMe = me ? input() : null;
    for (const k of karts) { // draw: the body squats under the throttle, dives under the brake, leans in the turns and harder in a drift, shakes off the road
      const g = k.m.g, sp = k.speed / TOP, a = dt > 0 ? (k.speed - (k.spPrev ?? k.speed)) / dt : 0; k.spPrev = k.speed;
      k.pitch = (k.pitch || 0) + ((Math.max(-0.07, Math.min(0.07, -a * 0.004))) - (k.pitch || 0)) * Math.min(1, dt * 7);
      k.stV += ((k.st || 0) - k.stV) * Math.min(1, dt * 10); if (k.air) k.pitch += (Math.max(-0.18, Math.min(0.12, -k.vy * 0.025)) - k.pitch) * Math.min(1, dt * 6); // (K6: every kart's own steer, the nose up off a ramp)
      const roll = k.drift ? -k.driftDir * 0.16 : -k.stV * 0.085 * Math.min(1, sp);
      k.roll = (k.roll || 0) + (roll - (k.roll || 0)) * Math.min(1, dt * 8);
      const bob = racing && k.speed > 2 ? Math.sin(clock * 31 + k.i) * (k.off ? 0.06 : 0.012) * Math.min(1, sp + 0.3) : 0;
      k.hopY = Math.max(0, k.hopY - dt * 3); g.position.x = k.pos.x; g.position.z = k.pos.z; g.position.y = k.y + k.hopY + (k.air ? 0 : bob); g.rotation.order = "YXZ"; g.rotation.y = k.yaw; g.rotation.x = k.pitch; g.rotation.z = k.roll;
      if (k.trickT >= 0) { const u = Math.min(1, k.trickT / TRICK_DUR), e = u * u * (3 - 2 * u), a2 = Math.PI * 2 * e; if (k.trickKind === 0) g.rotation.x -= a2; else if (k.trickKind === 1) g.rotation.y += a2; else g.rotation.z += a2; } // (a flip, a spin or a barrel roll)
      if (k.kartObj) k.kartObj.rotation.y = k.stV * -0.06; if (k.hero && k.hero.obj && !k.onPod) k.hero.obj.rotation.z = k.stV * 0.13; // (the kart turns in, the racer leans into the turn)
      if (k.me && k.off && racing && k.speed > 6 && clock - (k.rumbleAt || 0) > 0.35) { k.rumbleAt = clock; buzz(8); }
      // drift: sparks from both rear wheels in the step's colour, skid marks behind them (yours and the ones near you)
      if (fx && racing && (k.drift || k.boostT > 0) && (k.me || k.pos.distanceToSquared(me.pos) < 1600)) {
        const lv = k.drift ? lvOf(k.charge) : Math.max(1, k.boostLv || 1), hex = SPARK[lv], side = k.drift ? k.driftDir : 0;
        for (const lx of [-0.9, 0.9]) { if (!k.me && Math.random() < 0.5) continue; const w = at(k, lx, -1.2, tmp2); fx.emit(w, -Math.sin(k.vh) * 3 + (Math.random() - 0.5) * 2 + side * 1.5 * Math.cos(k.vh), 1.2 + Math.random() * 2.2, -Math.cos(k.vh) * 3 + (Math.random() - 0.5) * 2, k.drift ? hex : (Math.random() < 0.5 ? 0xffa63a : 0xffe08a), k.drift ? 0.32 : 0.22); }
        if (skid && k.drift && clock - (k.skidAt || 0) > 0.05) { k.skidAt = clock; for (const lx of [-0.85, 0.85]) skid.add(at(k, lx, -1.15, tmp2), k.vh); }
      }
      for (const w of k.m.wheels) w.rotation.x += k.speed * dt / 0.42; k.m.wheels[0].rotation.y = k.m.wheels[1].rotation.y = k.stV * -0.4;
      const fl = k.m.flame.material; fl.opacity = k.boostT > 0 ? 0.6 : k.drift ? Math.min(0.7, k.charge * 0.35) : 0; fl.color.setHex(k.boostT > 0 ? 0xffa63a : k.charge > 1.9 ? 0xff8a3a : 0x38d8ff); k.m.flame.scale.setScalar(k.boostT > 0 ? 1.1 : 0.8); /* (K6: smaller — with tricks a boost is often on, and the big cone hid the racer) */
      if (k.hero && k.hero.update && g.visible) k.hero.update(dt, t);
    }
    // the camera behind and above you, wider at speed, a shake on hits and boosts
    camBack = Math.max(0, camBack - dt * 1.8); camRoll += ((me && me.drift ? me.driftDir * 0.035 : 0) - camRoll) * Math.min(1, dt * 5);
    if (me) { const back = 7.2 + me.speed * 0.04 + camBack, h = 3.1; tmp.set(me.pos.x - Math.sin(me.yaw) * back, h, me.pos.z - Math.cos(me.yaw) * back); cam.position.lerp(tmp, Math.min(1, dt * 8)); if (shake > 0 && !ctx.reduce) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt); } cam.lookAt(me.pos.x + Math.sin(me.yaw) * 6, 1.2, me.pos.z + Math.cos(me.yaw) * 6); const f = 62 + Math.min(14, me.speed * 0.25) + (me.boostT > 0 ? 6 : 0); if (Math.abs(cam.fov - f) > 0.3) { cam.fov += (f - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); } if (!ctx.reduce && Math.abs(camRoll) > 0.001) cam.rotateZ(camRoll); }
    if (me) camK6(rdt);
    if (topView && me) { cam.position.set(me.pos.x - Math.sin(me.yaw) * 18, 16, me.pos.z - Math.cos(me.yaw) * 18); cam.lookAt(me.pos.x + Math.sin(me.yaw) * 10, 0, me.pos.z + Math.cos(me.yaw) * 10); } // (the tests' look from above)
    if (fx) fx.step(dt); if (rings) rings.step(dt); if (checker) checker.step(dt);
    k6Tick(rdt);
    if (racing || phase === "count") ghostTick();
    if (nightLight && me && rule === "night") { nightLight.position.set(me.pos.x + Math.sin(me.yaw) * 5, 3.2, me.pos.z + Math.cos(me.yaw) * 5); }
    // the engine: revs from the speed (a little gear wobble), load from the throttle, the tyres in a drift or off the road
    if (me && (phase === "count" || phase === "race" || phase === "done")) {
      if (!eng && ctx.Snd && ctx.Snd.kartEngine && performance.now() - engTry > 1000) { engTry = performance.now(); eng = ctx.Snd.kartEngine(); }
      if (eng) { const gas = inpMe ? inpMe.gas : 0, r = phase === "count" ? (gas ? 0.35 + Math.min(0.5, me.startSpeed * 0.3) : 0.05) : me.speed / TOP + Math.sin(me.speed * 0.35) * 0.04;
        eng.set(r * (finalLap && phase === "race" ? 1.07 : 1), phase === "done" ? 0 : gas, me.drift ? Math.min(1, 0.45 + me.charge * 0.18) : me.off && me.speed > 6 ? 0.3 : 0, me.boostT > 0); }
    }
    paintHud();
  }

  // ---------- HUD ----------
  const fmt = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? "0" : ""}${r.toFixed(2)}`; };
  const ord = (n) => T(["1st", "2nd", "3rd", "4th", "5th"][n - 1] || n + "th");
  const order = () => (mode === "ta" ? karts.filter((k) => k.me) : [...karts].sort((a, b) => (b.finish ? 1e9 - b.finish : b.prog) - (a.finish ? 1e9 - a.finish : a.prog)));
  function place() { if (mode === "ta") return 1; return order().indexOf(me) + 1; }
  function makeUi() {
    ui = document.createElement("div"); ui.className = "wk"; ui.setAttribute("data-no-i18n", "");
    ui.innerHTML = `<div class="wk-top" data-game-hud><b class="wk-pos">1/4</b><span class="wk-lap"></span><span class="wk-time">0:00.00</span><button type="button" class="wk-x" data-leave aria-label="${esc(T("Leave"))}">✕</button></div>
      <div class="wk-spd"><b>0</b><small>km/h</small><i class="wk-ni"><s></s><s></s></i></div><div class="wk-lines" aria-hidden="true"></div><div class="wk-msg" aria-live="polite"></div><div class="wk-cd"></div>
      <canvas class="wk-map" width="184" height="184" aria-hidden="true"></canvas><div class="wk-gap" aria-hidden="true"><span></span><span></span></div><div class="wk-fl" aria-hidden="true"><b></b></div><div class="wk-cut" aria-hidden="true"></div><div class="wk-photo" hidden><b>${esc(T("PHOTO FINISH"))}</b></div>
      ${ctx.coarse ? `<button type="button" class="wk-trick" data-k="trick" hidden><span>${esc(T("Trick"))}</span></button>` : ""}
      <p class="wk-help">${esc(T(ctx.coarse ? "Hold Gas to drive · hold Drift in a corner, let go for a turbo." : "Steer ◀ ▶ · W go · S brake · Shift drift · Space nitro"))}</p>
      ${ctx.coarse ? `<div class="wk-pad"><div class="wk-steer"><button type="button" data-k="l" class="wk-b wk-l" aria-label="${esc(T("Left"))}"><i></i></button><button type="button" data-k="r" class="wk-b wk-r" aria-label="${esc(T("Right"))}"><i></i></button></div><div class="wk-act"><button type="button" data-k="boost" class="wk-b wk-bo"><i></i><span>${esc(T("Nitro"))}</span></button><button type="button" data-k="drift" class="wk-b wk-dr"><i></i><span>${esc(T("Drift"))}</span></button><button type="button" data-k="brake" class="wk-b wk-br"><i></i><span>${esc(T("Brake"))}</span></button><button type="button" data-k="gas" class="wk-b wk-gas"><i></i><span>${esc(T("Gas"))}</span></button></div></div>` : ""}`; /* (2026-10-30, the owner's phone: steering on the left, gas / brake / drift (+ nitro) on the right) */
    document.body.appendChild(ui);
    ui.addEventListener("click", (e) => { if (e.target.closest("[data-leave]")) leave(); });
    const set = (e, v) => { const b = e.target.closest("[data-k]"); if (!b) return; e.preventDefault();
      if (b.dataset.k === "gas" && opts.autogas && ctx.coarse) { if (v && e.type === "pointerdown") { gasLatch = !gasLatch; touch.gas = 0; paintGas(); } return; } // (K6: auto-gas — a tap switches it)
      touch[b.dataset.k] = v; b.classList.toggle("on", !!v); };
    applySize();
    ui.addEventListener("pointerdown", (e) => set(e, 1)); ui.addEventListener("pointerup", (e) => set(e, 0)); ui.addEventListener("pointercancel", (e) => set(e, 0)); ui.addEventListener("pointerleave", (e) => set(e, 0), true);
  }
  let msgT = 0;
  function flash(s) { if (!ui || !s) return; const m = ui.querySelector(".wk-msg"); m.textContent = s; m.classList.remove("on"); void m.offsetWidth; m.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => m.classList.remove("on"), 1300); }
  let hudAt = 0;
  function paintHud() { if (!ui || !me) return; const now = performance.now(); if (now - hudAt < 100) return; hudAt = now; // (10 times a second: no DOM writes every frame)
    const ord0 = order(), pl = mode === "ta" ? 1 : ord0.indexOf(me) + 1, posEl = ui.querySelector(".wk-pos"); posEl.textContent = mode === "ta" ? "⏱" : `${pl}/${karts.length}`;
    if (phase === "race" && mode !== "ta") ord0.forEach((k, n) => { if (k.pl && n + 1 < k.pl && clock > 3 && !k.finish) { react(k, CLIP.win, 1.6); if (k.me) passes++; } k.pl = n + 1; }); // (K6: anyone's pass → a fist pump)
    paintGaps(ord0); drawMap();
    if (phase === "race" && lastPlace && pl !== lastPlace && clock > 2) { posEl.classList.remove("up", "down"); void posEl.offsetWidth; posEl.classList.add(pl < lastPlace ? "up" : "down");
      if (pl < lastPlace) { snd("kartPass"); buzz(12); if (pl === 1 && clock - cutAt > 10) { cutAt = clock; cutIn(T("1ST!")); if (!ctx.reduce) slowT = 0.3; buzz([20, 30, 40]); } } } // (K6: taking 1st — a 0.3 s slow motion and the cut-in, 10 s apart)
    lastPlace = pl;
    if (!ctx.low && !ctx.reduce) { const ln = ui.querySelector(".wk-lines"), v = phase !== "race" ? 0 : Math.max(me.boostT > 0 ? 0.55 + 0.15 * (me.boostLv || 1) : 0, Math.min(1, (me.speed / TOP - 0.82) * 3.5), me.slip > 0.5 ? 0.35 : 0); ln.style.opacity = v.toFixed(2); ln.classList.toggle("boost", me.boostT > 0); } ui.querySelector(".wk-lap").textContent = `${T("Lap")} ${Math.max(1, Math.min(LAPS, me.lap))}/${LAPS}`; ui.querySelector(".wk-time").textContent = fmt(phase === "count" ? 0 : me.finish || clock);
    ui.querySelector(".wk-spd b").textContent = Math.round(me.speed * 3.6); const s = ui.querySelectorAll(".wk-ni s"); s[0].style.setProperty("--f", Math.min(1, me.nitro)); s[1].style.setProperty("--f", Math.max(0, Math.min(1, me.nitro - 1))); }
  let lastCd = -1;
  function paintCount() { const n = Math.ceil(cd); if (n === lastCd || !ui) return; lastCd = n; const el = ui.querySelector(".wk-cd"); el.textContent = n > 3 ? "" : n > 0 ? String(n) : T("GO!"); el.classList.toggle("go", n <= 0); el.classList.remove("on"); void el.offsetWidth; if (n <= 3) el.classList.add("on"); if (n <= 0) setTimeout(() => { if (el.classList.contains("go")) { el.classList.remove("on"); el.textContent = ""; } }, 1100);
    if (dress) dress.lights.set(n <= 0 ? "go" : n <= 3 ? 4 - n : 0); /* (the gantry: red, red, red, all green on GO) */ if (n <= 3) { snd("tick", n <= 0, n <= 0); buzz(n > 0 ? 12 : 45); } }
  // ---------- K6: the HUD's new pieces ----------
  const offT = {}, onFor = (el, ms) => { el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); clearTimeout(offT[el.className]); const k = el.className; offT[k] = setTimeout(function off() { if (holdK6) { offT[k] = setTimeout(off, 300); return; } el.classList.remove("on"); }, ms); }; // (taken off by time too: low graphics ends every CSS animation at once)
  function banner(txt) { const el = ui && ui.querySelector(".wk-fl"); if (!el) return; el.firstChild.textContent = txt; onFor(el, 2300); }
  function cutIn(txt) { const el = ui && ui.querySelector(".wk-cut"); if (!el) return; el.textContent = txt; onFor(el, 1300); }
  function paintGas() { const b = ui && ui.querySelector(".wk-gas"); if (b && opts.autogas && ctx.coarse) b.classList.toggle("on", !!gasLatch); }
  function applySize() { if (!ui) return; ui.classList.toggle("sz-s", opts.size === "s"); ui.classList.toggle("sz-l", opts.size === "l"); }
  function paintGaps(ord0) { const el = ui.querySelector(".wk-gap"), [a, b] = el.children;
    if (phase === "race" && mode !== "ta" && !me.finish) { const i = ord0.indexOf(me), A = ord0[i - 1], B = ord0[i + 1], ga = A ? gapTo(A.marks, me.prog, clock) : null, gb = B ? gapTo(me.marks, B.prog, clock) : null; lastGaps = { a: ga, b: gb };
      a.innerHTML = A && ga != null ? `▲ ${esc(A.racer ? A.racer.name : "")} <i>−${ga.toFixed(1)} s</i>` : ""; b.innerHTML = B && gb != null ? `▼ ${esc(B.racer ? B.racer.name : "")} <i>+${gb.toFixed(1)} s</i>` : "";
      if (!ctx.low && !ctx.reduce && !cineDone && me.lap === LAPS && me.idx > 770 && me.idx < 880 && ((ga != null && ga < 1) || (gb != null && gb < 1))) { cineDone = true; cineT = 1.5; const s0 = track.S[me.idx]; cineSide = (Math.cos(me.yaw) * s0.r.x - Math.sin(me.yaw) * s0.r.z) * lateral(me.pos, me.idx) > 0 ? -1 : 1; } } // (the last corner of the last lap, someone within 1 s: a side camera)
    else if (a.textContent || b.textContent) a.textContent = b.textContent = ""; }
  /// the minimap: the track's outline once per track, then the racers as dots in their colours (you bigger), 10 times a second
  function drawMap() { const cv = ui.querySelector(".wk-map"); if (!cv || !track) return; const x = cv.getContext("2d"), W = cv.width;
    const mp = (px, pz) => [mapBox.ox + (px - mapBox.x0) * mapBox.sc, mapBox.oz + (pz - mapBox.z0) * mapBox.sc];
    if (mapFor !== track) { mapFor = track; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of track.S) { x0 = Math.min(x0, q.p.x); x1 = Math.max(x1, q.p.x); z0 = Math.min(z0, q.p.z); z1 = Math.max(z1, q.p.z); }
      const sc = (W - 34) / Math.max(x1 - x0, z1 - z0); mapBox = { x0, z0, sc, ox: (W - (x1 - x0) * sc) / 2, oz: (W - (z1 - z0) * sc) / 2 }; mapPath = new Path2D(); track.S.forEach((q, i) => { if (i % 6) return; const [px, py] = mp(q.p.x, q.p.z); if (i) mapPath.lineTo(px, py); else mapPath.moveTo(px, py); }); mapPath.closePath(); }
    x.clearRect(0, 0, W, W); x.lineJoin = "round"; x.strokeStyle = "rgba(255,255,255,.2)"; x.lineWidth = 13; x.stroke(mapPath); x.strokeStyle = "#38d8ff"; x.lineWidth = 4; x.stroke(mapPath);
    const [sx, sy] = mp(track.S[0].p.x, track.S[0].p.z); x.fillStyle = "#fff"; x.fillRect(sx - 4, sy - 4, 8, 8);
    const dot = (p, hex, r, al = 1, ring = false) => { const [px, py] = mp(p.x, p.z); x.globalAlpha = al; x.beginPath(); x.arc(px, py, r, 0, 7); x.fillStyle = "#" + hex.toString(16).padStart(6, "0"); x.fill(); if (ring) { x.lineWidth = 3; x.strokeStyle = "#fff"; x.stroke(); } x.globalAlpha = 1; };
    for (const gh of ghosts) dot(gh.g.position, 0xffffff, 6, 0.55);
    for (const k of active()) if (!k.me) dot(k.pos, k.racer ? k.racer.color : COLORS[k.i % COLORS.length], 7);
    if (me) dot(me.pos, me.racer ? me.racer.color : 0x38d8ff, 11, 1, true); }
  /// the camera's K6 moments: the drone over the grid in the countdown, the last corner's side camera, the podium
  function camK6(dt) {
    const fx0 = Math.sin(me.yaw), fz0 = Math.cos(me.yaw);
    if (podCam) { podCam.t += dt; const hf = Math.atan(Math.tan((25 * Math.PI) / 180) * cam.aspect), d = Math.max(10, 6.6 / Math.tan(hf)) - Math.min(1, podCam.t / 3.2) * 2.2; /* (far enough that the podium and the last beside it fit an upright phone) */ cam.position.set(podCam.c.x + podCam.f.x * d, 1.6 + d * 0.13, podCam.c.z + podCam.f.z * d); cam.lookAt(podCam.c.x, 1.7, podCam.c.z); /* (higher the farther: over the road's rails) */ if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return; }
    if (phase === "count" && droneOn && !ctx.reduce) { const u = Math.max(0, Math.min(1, (3.2 - cd) / 2.9)), e = u * u * (3 - 2 * u), th = me.yaw + Math.PI * e, R = 30 + (7.2 - 30) * e, gx = gridC.x + (me.pos.x - gridC.x) * e, gz = gridC.z + (me.pos.z - gridC.z) * e;
      cam.position.set(gx + Math.sin(th) * R, 22 + (3.1 - 22) * e, gz + Math.cos(th) * R); cam.lookAt(gx + fx0 * 6 * e, 1.2, gz + fz0 * 6 * e); return; } // (from high in front of the grid round to your place behind the kart)
    if (cineT > 0 && phase === "race") { cineT -= dt; const px = fz0 * cineSide, pz = -fx0 * cineSide; cam.position.set(me.pos.x + px * 6.5 + fx0 * 3, 1.5, me.pos.z + pz * 6.5 + fz0 * 3); cam.lookAt(me.pos.x + fx0, 0.9, me.pos.z + fz0); if (cam.fov !== 48) { cam.fov = 48; cam.updateProjectionMatrix(); } }
  }
  /// every frame: the flags, the standings screen (twice a second), the start lights going dark, the tunnel's shade, the Trick button, the keys card
  function k6Tick(dt) {
    const now = performance.now();
    if (dress) { if (now - flagAt > 66) { flagAt = now; dress.wave(now / 1000); }
      if (now - scrAt > 500) { scrAt = now; dress.screen.draw(`${T("Live")} · ${T("Standings")}`, order().map((k) => ({ name: k.racer ? k.racer.name : "—", color: k.racer ? k.racer.color : COLORS[k.i % COLORS.length], me: k.me, tail: k.finish ? fmt(k.finish) : `${T("Lap")} ${Math.max(1, Math.min(LAPS, k.lap))}/${LAPS}` }))); }
      if (lightsOff > 0 && phase === "race") { lightsOff -= dt; if (lightsOff <= 0) dress.lights.set(0); }
      if (me && hemi && sun && rule !== "night") { const inT = phase !== "count" && dress.tunnelAt(me.idx), f = Math.min(1, dt * 4); hemi.intensity += ((inT ? 0.6 : 1.25) - hemi.intensity) * f; sun.intensity += ((inT ? 0.45 : 1.6) - sun.intensity) * f; } }
    const tb = ui && ui.querySelector(".wk-trick"); if (tb && me) { const show = phase === "race" && !!me.air && me.trickT < 0 && me.vy > -6; if (tb.hidden === show) tb.hidden = !show; }
    if (keysEl && phase === "race" && clock > 7) { keysEl.remove(); keysEl = null; }
  }

  // ---------- K2: the modes, the day's rule, the ghosts, the server's race, the result card ----------
  const RULE_NAME = { mirror: "Mirror", nitro: "Nitro rush", nodrift: "No-turbo drift", night: "Night race", turbo: "Turbo" };
  const RULE_LINE = { mirror: "The track mirrored", nitro: "Start with 2 nitro · it fills faster", nodrift: "Drifts give no turbo · rivals slower", night: "A dark track · lit karts", turbo: "Everyone faster" };
  const MODE_NAME = { race: "Race", ta: "Time Attack", daily: "Daily" }, MODE_LINE = { race: "You vs the four · ARCL by place", ta: "You alone · race your ghosts" };
  const ACH_NAME = { first: "Kart Rookie", win: "Kart Winner", win10: "Kart Champion", ta: "Time Trialist", daily: "Daily Racer" };
  const say = (s) => { try { ctx.toast(esc(s)); } catch { /* the card says it too */ } };
  /// the day's rule applied to the scene and the physics (only in a daily race; the others race plain)
  function applyRule(plain) {
    rule = !plain && mode === "daily" ? daily.rule : ""; mir = rule === "mirror" ? -1 : 1; track = tracks[mir < 0 ? 1 : 0]; world.scale.x = mir;
    R = rule === "turbo" ? { top: 1.15, acc: 1.2 } : { top: 1, acc: 1 };
    const night = rule === "night", bg = night ? 0x02040c : 0x0b1638;
    scene.background.setHex(bg); scene.fog.color.setHex(bg); scene.fog.far = night ? 210 : ctx.low ? 320 : 520;
    if (hemi) hemi.intensity = night ? 0.3 : 1.25;
    if (sun) sun.intensity = night ? 0.15 : 1.6;
    if (skyCyl) skyCyl.material.color.setHex(night ? 0x283050 : 0xffffff);
    if (nightLight) nightLight.intensity = night ? 90 : 0;
    for (const k of karts) { k.m.glow.material.opacity = night ? 0.9 : 0.35; k.m.beam.visible = night; }
    if (dress && dress.screen) dress.screen.mesh.scale.x = mir; // (K6: the standings screen reads the right way round in a mirrored race)
  }
  const ghostOf = (gs) => { const a = ghostDec(gs); return a.length > 5 ? a : null; };
  function localGhost() { try { const j = JSON.parse(localStorage.getItem(GHOST + "nexus") || "null"); return j && j.g && j.t > 0 ? j : null; } catch { return null; } }
  function makeGhost(data, tint, label) {
    const pts = ghostOf(data.g); if (!pts || !scene) return null;
    const src = karts.find((k) => k.racer && k.racer.id === data.racer) || karts.find((k) => k.me), col = new THREE.Color(tint);
    let obj; if (src && src.kartObj) obj = src.kartObj.clone(true); else { const m = kartMesh(tint); m.flame.visible = m.glow.visible = m.beam.visible = false; obj = m.g; }
    obj.traverse((o) => { if (o.isMesh) { const m0 = [].concat(o.material)[0]; o.material = new THREE.MeshBasicMaterial({ color: col, map: (m0 && m0.map) || null, transparent: true, opacity: 0.45, depthWrite: false }); o.castShadow = false; } });
    const g = new THREE.Group(); g.add(obj); scene.add(g);
    return { g, pts, t: data.t, label, name: data.name || "" };
  }
  function clearGhosts() { for (const gh of ghosts) { scene && scene.remove(gh.g); gh.g.traverse((o) => { if (o.isMesh && o.material) o.material.dispose(); }); } ghosts = []; paintGhosts(); }
  function ghostTick() {
    for (const gh of ghosts) { const f = Math.max(0, phase === "count" ? 0 : clock) / GHOST_DT, n = gh.pts.length - 1, i = Math.min(n, Math.floor(f)), j = Math.min(n, i + 1), u = Math.min(1, f - i), a = gh.pts[i], b = gh.pts[j];
      let dy = b[2] - a[2]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); gh.g.position.set(a[0] + (b[0] - a[0]) * u, 0, a[1] + (b[1] - a[1]) * u); gh.g.rotation.y = a[2] + dy * u; }
  }
  let ghostTok = 0;
  async function loadGhosts() {
    clearGhosts(); if (mode !== "ta") return; const tok = ++ghostTok, s = ctx.sess && ctx.sess(), mine = localGhost();
    const get = (q) => fetch("/api/social?world=kart-ghost&track=nexus&" + q, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [srv, top] = await Promise.all([s ? get("who=me&wallet=" + s.wallet) : null, get("who=top")]);
    if (tok !== ghostTok || !on || mode !== "ta") return;
    const best = [mine, srv].filter((x) => x && x.g).sort((a, b) => a.t - b.t)[0], add = (d, tint, label) => { const g = d && makeGhost(d, tint, label); if (g) ghosts.push(g); };
    add(best, 0x38d8ff, T("Your best")); if (top && top.g && !(best && Math.abs(top.t - best.t) < 0.002)) add(top, 0xffc23c, T("Week #1"));
    paintGhosts();
  }
  function paintGhosts() { if (!ui) return; let el = ui.querySelector(".wk-gh"); if (!el) { el = document.createElement("div"); el.className = "wk-gh"; ui.appendChild(el); }
    el.innerHTML = ghosts.map((g) => `<span>👻 ${esc(g.label)}${g.name ? ` · ${esc(g.name)}` : ""} <b>${fmt(g.t)}</b></span>`).join(""); el.hidden = !ghosts.length; }
  /// signed in: the race opened on the server as the countdown starts (its clock checks the end); a failure is said, the race goes on
  function raceStart() {
    raceP = null; const s = ctx.post && ctx.sess ? ctx.sess() : null; if (!s) return;
    raceP = ctx.post({ action: "world-kart-start", ...s, track: "nexus", mode, racer: me && me.racer ? me.racer.id : "" })
      .then((r) => { if (r && r.ok && r.j && r.j.raceId) return r.j; throw new Error((r && r.j && r.j.error) || "start"); })
      .catch((e) => { console.warn("kart start:", e && e.message); say(T("Couldn't reach the server — this race won't count")); return null; });
  }
  async function raceEnd(o) {
    const rr = raceP ? await Promise.race([raceP, new Promise((ok) => setTimeout(() => ok(null), 8000))]) : null; if (!rr) return null;
    const r = await ctx.post({ action: "world-kart-end", ...ctx.sess(), raceId: rr.raceId, place: o.pl, time: +o.time.toFixed(3), laps: o.laps.map((x) => +x.toFixed(3)), ghost: mode === "daily" ? "" : o.g, racer: me.racer ? me.racer.id : "" });
    if (!r || !r.ok) throw new Error((r && r.j && r.j.error) || "HTTP " + (r && r.status));
    return r.j;
  }
  function done() {
    phase = "done"; flash(T("Finish!")); const pl = place(), time = me.finish, marks = [0]; for (let n = 2; n <= LAPS + 1; n++) marks.push(lapAt[n] != null ? lapAt[n] : time);
    const laps = marks.slice(1).map((x, i) => x - marks[i]), g = ghostEnc(rec), ranked = mode !== "daily", racer = me.racer || RACERS[0];
    let best = 0; try { best = +localStorage.getItem(BEST) || 0; } catch { best = 0; } const nb = ranked && (!best || time < best); if (nb) try { localStorage.setItem(BEST, String(time)); } catch { /* private */ }
    if (ranked) { const lg = localGhost(); if (!lg || time < lg.t) try { localStorage.setItem(GHOST + "nexus", JSON.stringify({ t: +time.toFixed(3), g, racer: racer.id })); } catch { /* private: no ghost kept */ } }
    const endP = signed() && raceP ? raceEnd({ pl, time, laps, g }) : Promise.resolve(null);
    lastRes = { pl, time, laps, mode, rule };
    const card = () => { if (!on || !ui) return; const c = document.createElement("div"); c.className = "wk-res";
      const head = mode === "daily" ? `${T("Daily challenge")} · ${T(RULE_NAME[rule] || "")}` : `${T("ARCIRCLE Nexus Circuit")} · ${T(MODE_NAME[mode])}`, fast = Math.min(...laps);
      c.innerHTML = `<div class="wk-res-in"><small>${esc(head)}</small><h2>${esc(mode === "ta" ? fmt(time) : ord(pl))}</h2><p><span>${esc(T("Time"))}</span><b>${fmt(time)}</b></p><p><span>${esc(T("Best"))}</span><b>${nb ? `<em>${esc(T("New best!"))}</em> ` : ""}<i class="wk-best">${fmt(nb ? time : best || time)}</i></b></p>
        <ol class="wk-laps">${laps.map((x, i) => `<li class="${x === fast ? "fast" : ""}"><span>${esc(T("Lap"))} ${i + 1}</span><b>${fmt(x)}</b></li>`).join("")}</ol>
        <section class="wk-arcl">${signed() ? `<b>${esc(T("Saving…"))}</b>` : `<b>${esc(T("Sign in to earn ARCL"))}</b><small>${esc(T("Guests race for fun: no ARCL, no board"))}</small>`}</section><section class="wk-ach" hidden></section>
        ${mode === "ta" ? "" : standings()}<section class="wk-week"></section>
        <div class="wk-res-btns"><button type="button" class="wk-go" data-again>${esc(T("Race again"))}</button>${ctx.share ? `<button type="button" class="wk-out" data-share>📸 ${esc(T("Share"))}</button>` : ""}<button type="button" class="wk-out" data-leave>${esc(T("Leave"))}</button></div><button type="button" class="wk-chg" data-modes>${esc(T("Change racer or mode"))}</button></div>`;
      ui.appendChild(c); c.querySelector("[data-modes]").onclick = () => { c.remove(); if (eng) { eng.stop(); eng = null; } toPick(); }; if (eng) { eng.stop(); eng = null; } c.querySelector("[data-again]").onclick = () => { c.remove(); reset(); }; if (ctx.Snd && ctx.Snd.win) ctx.Snd.win();
      const sh = c.querySelector("[data-share]"); if (sh) sh.onclick = () => { try { ctx.share({ kind: "kart", tag: "ARCIRCLE KART · " + T(mode === "daily" ? "Daily" : MODE_NAME[mode]).toUpperCase(), title: mode === "ta" ? fmt(time) : ord(pl), sub: `${racer.name} · ${T("ARCIRCLE Nexus Circuit")}`, art: "/images/games/kart-art.webp", cover: true, accent: pl === 1 ? "#ffc23c" : "#38d8ff",
        rows: [[T("Time"), fmt(time), "⏱️"], [T("Best lap"), fmt(fast), "⚡"], [T("Best"), fmt(nb ? time : best || time), "🏁"], ...(mode === "ta" ? [] : [[T("Place"), ord(pl), "🏆"]])], text: T("I raced the ARCIRCLE Nexus Circuit in {t} with {r} in ARCIRCLE KART! 🏎️ Can you beat it?", { t: fmt(time), r: racer.name }) }); } catch (e) { console.warn("kart share:", e && e.message); } };
      endP.then((j) => paintReward(c, j), (e) => { console.warn("kart end:", e && e.message); say(T("Couldn't save the race — no ARCL this time")); paintReward(c, null, true); });
    };
    finishSeq(card);
  }
  // ---------- K6: after the line — a photo finish's freeze-frame, the podium (~3 s, a tap skips), then the card ----------
  function finishSeq(card) {
    const tok = ++seqTok, photo = mode !== "ta" && (forcePhoto || photoFinish(me.finish, karts.filter((k) => !k.me).map((k) => ({ finish: k.finish, rem: (LAPS + 1) * track.len - k.prog, speed: k.speed }))));
    if (lastRes) lastRes.photo = photo;
    const next = () => { if (tok !== seqTok || !on || !ui) return; if (mode === "ta") card(); else podiumStart(tok, card); };
    if (photo) { freezeUntil = performance.now() + 1300; const el = ui.querySelector(".wk-photo"); el.hidden = false; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); snd("shutter"); buzz([20, 30, 20]);
      const after = () => { if (holdK6 && tok === seqTok) { freezeUntil = performance.now() + 400; setTimeout(after, 200); return; } if (tok === seqTok && ui) el.hidden = true; next(); }; setTimeout(after, 1500); }
    else setTimeout(next, mode === "ta" ? 1600 : 900);
  }
  function podiumStart(tok, card) {
    if (!pod) { let lt = null; try { lt = new THREE.TextureLoader().load("/images/kart/logo.webp"); lt.colorSpace = THREE.SRGBColorSpace; } catch { lt = null; } pod = makePodium(THREE, lt); scene.add(pod.g);
      if (K6_GLB.includes("podium") && !ctx.low) load("podium").then((gl) => { if (!pod) return; pod.g.add(fit(gl.scene, { len: 7.2 })); for (const c of pod.g.children) if (c.userData.drawn) c.visible = false; }).catch(() => { /* the drawn podium */ }); } // (the hook for raw/kart-k2/models/podium.glb once packed)
    const S0 = track.S[PODIUM_I], side = -outSide(track.S, PODIUM_I, OUTSIDE[0] * mir), c = S0.p.clone().addScaledVector(S0.r, side * (WALL + 9)), f = S0.r.clone().multiplyScalar(-side); // (on the infield; f: from the podium toward the road)
    pod.g.position.copy(c); pod.g.rotation.set(0, Math.atan2(f.x, f.z), 0); pod.g.visible = true;
    const ord0 = order(), last = ord0.length > 3 ? ord0[ord0.length - 1] : null;
    const put = (k, x, y, clip, alt) => { const h = k.hero; if (!h || !h.obj) return; if (!k.seatPos) k.seatPos = h.obj.position.clone(); k.onPod = true; pod.g.add(h.obj); h.obj.position.set(x, y, 0); h.obj.rotation.set(0, 0, 0); if (h.has) { h.after = null; h.play(clip); } else try { h.play(alt); } catch { /* standing is fine */ } };
    ord0.slice(0, 3).forEach((k, n) => put(k, pod.spots[n][0], pod.spots[n][1], n === 0 ? CLIP.cheer : CLIP.wave, "emote-yes")); // (1st Victory_Cheer, 2nd and 3rd Big_Wave_Hello)
    if (last) put(last, pod.last[0], pod.last[1], CLIP.lose, "emote-no"); // (the last beside it, Head_Hold_in_Pain)
    podCam = { c, f, t: 0 }; ui.classList.add("pod"); snd("win");
    const lay = document.createElement("div"); lay.className = "wk-pod"; lay.innerHTML = `<span>${esc(T("Tap to skip"))}</span>`; ui.appendChild(lay);
    const conf = setInterval(() => { if (fx && pod && tok === seqTok) fx.burst(tmp2.copy(c).setY(4.6), [0xffd36a, 0x38d8ff, 0xff6fc8, 0x5fe05a, 0xffffff], 14, 8, 6, 1.2); }, 350);
    let ended = false; const end = () => { if (ended) return; ended = true; clearInterval(conf); lay.remove(); if (tok === seqTok && on && ui) card(); };
    const tm = () => (holdK6 && !ended ? setTimeout(tm, 200) : end()); lay.addEventListener("pointerdown", (e) => { e.preventDefault(); end(); }); setTimeout(tm, 3200);
  }
  /// the podium put away: the racers back in their seats, the HUD back
  function podEnd() {
    seqTok++; podCam = null; freezeUntil = 0; slowT = 0; cineT = 0;
    if (ui) { ui.classList.remove("pod"); ui.querySelectorAll(".wk-pod").forEach((e) => e.remove()); const ph = ui.querySelector(".wk-photo"); if (ph) ph.hidden = true; }
    if (pod) pod.g.visible = false;
    for (const k of karts) if (k.onPod && k.hero && k.hero.obj) { k.onPod = false; k.m.g.add(k.hero.obj); k.hero.obj.position.copy(k.seatPos); k.hero.obj.rotation.set(0, 0, 0); if (!k.hero.has) try { k.hero.play("sit"); } catch { /* standing is fine */ } }
  }
  /// the result card's ARCL, titles and the week's board (after the server's answer, or straight away for a guest)
  function paintReward(c, j, failed) {
    if (!c.isConnected) return; const box = c.querySelector(".wk-arcl");
    if (signed()) {
      if (!j) box.innerHTML = `<b>${esc(failed ? T("Couldn't save the race — no ARCL this time") : T("Couldn't reach the server — this race won't count"))}</b>`;
      else { const why = { races: "No ARCL — today's 5 paid races are done", cap: "No ARCL — today's ARCL limit is reached", ta: "Time Attack pays no ARCL", "daily-done": "Today's daily is already paid" }[j.why];
        box.innerHTML = `<b class="${j.credited > 0 ? "paid" : ""}">${esc(j.credited > 0 ? T("+{n} ARCL", { n: j.credited.toLocaleString("en-US") }) : T(why || "No ARCL this time"))}</b><small>${esc(T("Races paid today {n}/{m}", { n: RACE_DAY - (j.racesLeft ?? RACE_DAY), m: RACE_DAY }))} · ${esc(T("ARCL today {n}/{m}", { n: (j.today || 0).toLocaleString("en-US"), m: (j.cap || ARCL_DAY).toLocaleString("en-US") }))}</small>`;
        if (j.credited > 0) { snd("coin"); try { if (ctx.refresh) ctx.refresh(); } catch { /* the purse updates later */ } }
        if (j.newBest && j.best) { const b = c.querySelector(".wk-best"); if (b) b.textContent = fmt(j.best); }
        const ach = (j.newAch || []).filter((a) => ACH_NAME[a]); if (ach.length) { const a = c.querySelector(".wk-ach"); a.hidden = false; a.innerHTML = ach.map((id) => `<p>🏆 ${esc(T("Title unlocked: {x}", { x: T(ACH_NAME[id]) }))}</p>`).join(""); buzz([30, 30, 60]); if (ctx.onAch) try { ctx.onAch(ach); } catch { /* the town reads them again */ } } } }
    const daily0 = mode === "daily", place0 = j ? (daily0 ? j.dailyRank : j.rank) : null;
    fetch(daily0 ? "/api/social?world=kart-daily" : "/api/social?world=kart-top&track=nexus", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (!b || !c.isConnected) return; const top = (b.top || []).slice(0, 5), el = c.querySelector(".wk-week");
      el.innerHTML = `<h4>${esc(T(daily0 ? "Today's daily board" : "This week's board"))}</h4>${top.length ? `<ol class="wk-st">${top.map((x, n) => `<li class="${place0 === n + 1 ? "me" : ""}"><b>${n + 1}</b>${x.racer ? `<img src="/images/kart/card-${esc(x.racer)}.webp" alt="" width="28" height="36">` : ""}<span>${esc(x.name || x.w)}</span><i>${fmt(x.t)}</i></li>`).join("")}</ol>` : `<p class="wk-empty">${esc(T("Be the first on the board!"))}</p>`}${place0 ? `<p class="wk-mine">${esc(T("Your place: {n}", { n: "#" + place0 }))}</p>` : ""}`; }).catch(() => { /* no board this time */ });
  }

  function standings() {
    const rows = [...karts].sort((a, b) => (a.finish || 1e9) - (b.finish || 1e9) || b.prog - a.prog).map((k, n) => `<li class="${k.me ? "me" : ""}"><b>${n + 1}</b>${k.racer ? `<img src="/images/kart/card-${k.racer.id}.webp" alt="" width="28" height="36">` : ""}<span>${esc(k.racer ? k.racer.name : "—")}</span><i>${k.finish ? fmt(k.finish) : ""}</i></li>`).join("");
    return `<h4>${esc(T("Standings"))}</h4><ol class="wk-st">${rows}</ol>`;
  }
  /// back to the pick screen after a race: the plain track, the karts on the grid, no ghosts
  function toPick() { podEnd(); if (keysEl) { keysEl.remove(); keysEl = null; } ghostTok++; clearGhosts(); raceP = null; mode = mode || "race"; rule = ""; mir = 1; track = tracks[0]; applyRule(true); grid(); for (const k of karts) if (k.hero && k.hero.has) { k.hero.after = null; k.hero.play(CLIP.drive); } showPick(me && me.racer ? me.racer.id : RACERS[0].id); }
  function grid() {
    for (const k of karts) { const i = track.N - 6 - Math.floor(k.i / 2) * 7, s = track.S[i]; k.idx = i; k.pos.copy(s.p).addScaledVector(s.r, k.i % 2 ? 3.6 : -3.6); k.yaw = k.vh = Math.atan2(s.t.x, s.t.z); Object.assign(k, { speed: 0, lap: 0, prog: 0, drift: 0, charge: 0, boostT: 0, nitro: rule === "nitro" ? 2 : 0, stall: 0, slip: 0, finish: 0, startSpeed: 0, y: 0, vy: 0, air: 0, onR: false, trickT: -1, trickAt: 0, hopY: 0, mk: 0, pl: 0, reactAt: -9 }); k.marks.fill(-1); k.m.g.visible = mode !== "ta" || k.me; }
  }
  async function reset() {
    podEnd(); finished = []; clock = 0; acc = 0; lapAt = []; rec = []; grid();
    finalLap = false; cineDone = false; cineT = 0; slowT = 0; cutAt = -99; passes = 0; tricks = 0; k6log = []; lastGaps = null; gasLatch = false; paintGas(); droneOn = true; lightsOff = 0; if (dress) dress.lights.set(0);
    gridC.set(0, 0, 0); for (const k of active()) gridC.add(k.pos); gridC.multiplyScalar(1 / Math.max(1, active().length));
    if (!ctx.coarse && !keysEl) { let seen = false; try { seen = !!localStorage.getItem(KEYS); } catch { seen = false; } // (K6: the keys card, a computer's first race only)
      if (!seen) { try { localStorage.setItem(KEYS, "1"); } catch { /* shown again next time */ } keysEl = document.createElement("div"); keysEl.className = "wk-keys";
        keysEl.innerHTML = `<b>${esc(T("Controls"))}</b><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> ${esc(T("Steer & drive"))}</span><span><kbd>Shift</kbd> ${esc(T("Drift"))}</span><span><kbd>Space</kbd> ${esc(T("Nitro"))}</span><span><kbd>Esc</kbd> ${esc(T("Leave"))}</span>`; ui.appendChild(keysEl); } }
    for (const k of karts) if (k.hero && k.hero.has) { k.hero.after = null; k.hero.play(CLIP.drive); }
    phase = "count"; cd = 3.2; lastCd = -1; lastPlace = 0; camBack = 0;
    raceStart(); loadGhosts();
  }

  async function enter() {
    if (on) return true;
    buildScene(); makeUi(); try { fx = makeFx(); skid = makeSkid(); rings = makeRings(THREE, scene); checker = makeChecker(THREE, scene, ctx.low ? 20 : 36); } catch (e) { fx = skid = null; console.warn("kart fx:", e && e.message); }
    const ids = ["custom-aron", "custom-lumi", "custom-nex"];
    flash(T("Loading racers…"));
    fetch("/api/social?world=kart-daily", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && RULES.includes(j.rule)) { daily = { day: j.day, seed: j.seed, rule: j.rule }; dailyTop = j.top || []; paintModes(); } }).catch(() => { /* the device's own day */ });
    karts = await Promise.all(RACERS.map((r, i) => makeRacer(i, ids[i % 3], false, r))); me = karts[0];
    addEventListener("keydown", kd); addEventListener("keyup", ku); addEventListener("resize", onResize);
    on = true; listenTilt(); document.body.classList.add("wp-kart"); onResize(); ctx.st.view(scene, cam); ctx.st.solo(tick);
    let saved = ""; try { saved = localStorage.getItem(PICK) || ""; } catch { saved = ""; }
    showPick(RACERS.some((r) => r.id === saved) ? saved : RACERS[0].id);
    return true;
  }
  // ---------- the racer pick: five cards over the grid; the chosen one waves in 3D; the mode pills over the Race button ----------
  let pickEl = null, picked = "", pickFill = null;
  function showPick(id) {
    phase = "pick"; picked = id; ui.classList.add("picking"); mode = mode || "race"; rule = ""; world.scale.x = 1; mir = 1; track = tracks[0]; clearGhosts();
    if (!pickFill) { pickFill = new THREE.DirectionalLight(0xffffff, 1.5); scene.add(pickFill, pickFill.target); } pickFill.visible = true;
    pickEl = document.createElement("div"); pickEl.className = "wk-pick";
    pickEl.innerHTML = `<img class="wk-logo" src="/images/kart/logo.webp" alt="ARCIRCLE KART" width="420" height="172"><h3>${esc(T("Pick your racer"))}</h3>
      <div class="wk-cards">${RACERS.map((r) => `<button type="button" class="wk-card" data-r="${r.id}" style="--c:#${r.color.toString(16).padStart(6, "0")}"><img src="/images/kart/card-${r.id}.webp" alt="" width="160" height="205"><b>${esc(r.name)}</b><small>${esc(T(r.line))}</small></button>`).join("")}</div>
      <div class="wk-modes" role="radiogroup" aria-label="${esc(T("Mode"))}"></div><p class="wk-mode-l"></p>
      <button type="button" class="wk-go wk-race" data-race><i class="wk-flag"></i><span>${esc(T("Race!"))}</span><em></em></button><button type="button" class="wk-optb" data-opts aria-label="${esc(T("Settings"))}" title="${esc(T("Settings"))}">⚙</button>`;
    ui.appendChild(pickEl); paintModes(); sideHint();
    pickEl.addEventListener("click", (e) => { if (e.target.closest("[data-opts]")) return openOpts(); const c = e.target.closest("[data-r]"); if (c) choose(c.dataset.r); const m = e.target.closest("[data-mode]"); if (m) setMode(m.dataset.mode); if (e.target.closest("[data-race]")) pick(picked); });
    choose(id);
  }
  function paintModes() { if (!pickEl) return; const box = pickEl.querySelector(".wk-modes"), ln = pickEl.querySelector(".wk-mode-l");
    box.innerHTML = ["race", "ta", "daily"].map((m) => `<button type="button" class="wk-mode${m === mode ? " on" : ""}" role="radio" aria-checked="${m === mode}" data-mode="${m}"><b>${esc(T(MODE_NAME[m]))}</b>${m === "daily" ? `<small>${esc(T(RULE_NAME[daily.rule]))}</small>` : ""}</button>`).join("");
    ln.textContent = mode === "daily" ? T(RULE_LINE[daily.rule]) : T(MODE_LINE[mode]); }
  function setMode(m) { if (!MODE_NAME[m]) return; mode = m; try { localStorage.setItem(MODE, m); } catch { /* the default next time */ } paintModes(); if (ctx.Snd && ctx.Snd.tick) ctx.Snd.tick(); }
  function choose(id) {
    picked = id; for (const k of karts) k.m.g.visible = !k.racer || k.racer.id === id; if (pickEl) pickEl.querySelectorAll("[data-r]").forEach((b) => b.classList.toggle("on", b.dataset.r === id));
    const k = karts.find((x) => x.racer && x.racer.id === id); if (k && k.hero && k.hero.has) { const r = k.racer; k.hero.after = CLIP.drive; k.hero.play(r.yes && k.hero.has(r.yes) ? r.yes : CLIP.wave, { once: true }); }
    if (ctx.Snd && ctx.Snd.tick) ctx.Snd.tick();
  }
  function pick(id) {
    if (phase !== "pick") return; try { localStorage.setItem(PICK, id); } catch { /* private */ }
    const mine = karts.find((x) => x.racer && x.racer.id === id) || karts[0], rest = karts.filter((x) => x !== mine);
    mine.i = 0; mine.me = true; rest.forEach((k, n) => { k.i = n + 1; k.me = false; k.lane = ((n + 1) % 3 - 1) * 2.6; }); me = mine; karts = [mine, ...rest];
    if (pickEl) { pickEl.remove(); pickEl = null; } ui.querySelectorAll(".wk-side, .wk-opts").forEach((e) => e.remove()); if (pickFill) pickFill.visible = false; ui.classList.remove("picking"); for (const k of karts) k.m.g.visible = true; applyRule(); reset();
  }
  // ---------- K6: the settings (⚙), the sideways hint, tilt ----------
  function saveOpts() { try { localStorage.setItem(OPTS, JSON.stringify(opts)); } catch { /* this visit only */ } }
  function openOpts() {
    ui.querySelectorAll(".wk-opts").forEach((e) => e.remove()); const el = document.createElement("div"); el.className = "wk-opts";
    const row = (k, name, line) => `<div class="wk-opt"><div><b>${esc(name)}</b><small>${esc(line)}</small></div><button type="button" class="wk-tg${opts[k] ? " on" : ""}" data-opt="${k}" role="switch" aria-checked="${!!opts[k]}" aria-label="${esc(name)}"><i></i></button></div>`;
    const sizes = [["s", T("Small")], ["m", T("Medium")], ["l", T("Large")]];
    el.innerHTML = `<div class="wk-opts-in" role="dialog" aria-label="${esc(T("Settings"))}"><h3>⚙ ${esc(T("Settings"))}</h3>${row("assist", T("Steering assist"), T("Keeps you off the walls"))}${ctx.coarse ? row("autogas", T("Auto-gas"), T("Tap Gas to stop and go")) + row("tilt", T("Tilt steering"), T("Tilt your phone to steer")) + `<div class="wk-opt"><div><b>${esc(T("Button size"))}</b></div><span class="wk-seg">${sizes.map(([z, n]) => `<button type="button" data-size="${z}" class="${opts.size === z ? "on" : ""}">${esc(n)}</button>`).join("")}</span></div>` : ""}<button type="button" class="wk-go" data-done>${esc(T("Done"))}</button></div>`;
    ui.appendChild(el);
    el.addEventListener("click", async (e) => { if (e.target === el || e.target.closest("[data-done]")) { el.remove(); return; }
      const z = e.target.closest("[data-size]"); if (z) { opts.size = z.dataset.size; el.querySelectorAll("[data-size]").forEach((b) => b.classList.toggle("on", b === z)); applySize(); saveOpts(); return; }
      const t = e.target.closest("[data-opt]"); if (!t) return; const k = t.dataset.opt, v = !opts[k];
      if (k === "tilt" && v && !(await askTilt())) { say(T("Tilt isn't available on this device")); return; }
      opts[k] = v; t.classList.toggle("on", v); t.setAttribute("aria-checked", String(v)); saveOpts(); if (k === "tilt") listenTilt(); if (ctx.Snd && ctx.Snd.tick) ctx.Snd.tick(); });
  }
  async function askTilt() { try { const D = window.DeviceOrientationEvent; if (!D) return false; if (typeof D.requestPermission === "function") return (await D.requestPermission()) === "granted"; return true; } catch { return false; } } // (iOS asks on the tap)
  const onTilt = (e) => { const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0, a = ang === 90 ? e.beta : ang === 270 || ang === -90 ? -e.beta : e.gamma; tiltV = tiltSteer(a); };
  function listenTilt() { removeEventListener("deviceorientation", onTilt); tiltV = 0; if (opts.tilt && ctx.coarse && on) addEventListener("deviceorientation", onTilt); }
  function sideHint() { if (!ctx.coarse || innerHeight <= innerWidth || ui.querySelector(".wk-side")) return; let seen = false; try { seen = !!localStorage.getItem(SIDE); } catch { seen = false; } if (seen) return;
    try { localStorage.setItem(SIDE, "1"); } catch { /* shown again next time */ } const el = document.createElement("div"); el.className = "wk-side"; el.innerHTML = `<i aria-hidden="true">📱↻</i><span>${esc(T("Turn your phone sideways — it plays better"))}</span><button type="button" data-side>${esc(T("OK"))}</button>`; ui.appendChild(el); el.querySelector("[data-side]").onclick = () => el.remove(); }
  // the pick's camera: in front of the chosen kart, a little above
  function pickCam(dt) { const k = karts.find((x) => x.racer && x.racer.id === picked) || karts[0]; if (!k) return; const tall = innerHeight > innerWidth, d = tall ? 6.6 : 5.9, sw = (tall ? 0 : 0.5) + Math.sin(performance.now() / 2400) * (tall ? 0.5 : 0.3); tmp.set(k.pos.x + Math.sin(k.yaw + sw) * d, tall ? 2.3 : 2.4, k.pos.z + Math.cos(k.yaw + sw) * d); cam.position.lerp(tmp, Math.min(1, dt * 4)); cam.lookAt(k.pos.x, tall ? -0.55 : -1.0, k.pos.z);
    if (pickFill) { pickFill.position.copy(cam.position).add(new THREE.Vector3(0, 2, 0)); pickFill.target.position.set(k.pos.x, 0.8, k.pos.z); } } // (2026-10-30, the owner's phone: the kart filled the screen and stood dark — farther back on an upright screen, a little above, and a light from the camera's side, so the racer shows in the band between the logo and the cards; on a wide screen too — farther, higher and turned a little so the driver shows over the nose)
  const onResize = () => { if (!cam) return; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  function leave() {
    if (!on) return; on = false; phase = "idle"; if (eng) { eng.stop(); eng = null; } fx = skid = null; seqTok++; pod = null; podCam = null; dress = null; rings = checker = null; freezeUntil = 0; slowT = 0; keysEl = null; mapFor = null; removeEventListener("deviceorientation", onTilt); ghosts = []; ghostTok++; raceP = null; rule = ""; R = { top: 1, acc: 1 };
    try { ctx.st.solo(null); ctx.st.view(null); } catch { /* the world draws again */ }
    removeEventListener("keydown", kd); removeEventListener("keyup", ku); removeEventListener("resize", onResize); keys.clear();
    pickEl = null; pickFill = null; if (ui) { ui.remove(); ui = null; } document.body.classList.remove("wp-kart");
    if (scene) scene.traverse((o) => { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose(); const m = o.material; if (m && !o.isSkinnedMesh) for (const x of [].concat(m)) { if (x.map) x.map.dispose(); x.dispose(); } });
    scene = null; karts = []; me = null; world = null; tracks = null; nightLight = hemi = sun = skyCyl = null;
    if (ctx.onLeave) ctx.onLeave();
  }
  return { enter, leave, on: () => on, debug: () => ({ phase, clock: +clock.toFixed(2), me: me ? { lap: me.lap, idx: me.idx, speed: +me.speed.toFixed(1), drift: me.drift, nitro: +me.nitro.toFixed(2), place: place(), clip: me.hero && me.hero.mixer ? me.hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name) : [], air: me.air, y: +me.y.toFixed(2), trickT: +me.trickT.toFixed(2), tricks, passes, reacts: k6log.slice(), final: finalLap, gaps: lastGaps, cine: cineDone, pod: !!podCam } : null, karts: karts.map((k) => ({ lap: k.lap, idx: k.idx, speed: +k.speed.toFixed(1), finish: +k.finish.toFixed(2) })) }), _keys: keys, _touch: touch, auto: (v) => { autoMe = !!v; if (v && phase === "pick") pick(picked); }, pick: (id) => { choose(id); pick(id); }, _view: (v) => { topView = !!v; }, phase: () => phase, skip: (laps0) => { for (const k of karts) if (!k.me) k.lap = laps0; }, /* K2 (the browser test) */ mode: (m) => { if (m) setMode(m); return mode; }, rule: () => rule, daily: () => daily, ghosts: () => ghosts.map((g) => ({ label: g.label, t: g.t, n: g.pts.length, x: +g.g.position.x.toFixed(1), z: +g.g.position.z.toFixed(1) })), rec: () => rec.length, res: () => lastRes, _real: (v) => { realT = !!v; }, _rule: (r) => { daily = { ...daily, rule: RULES.includes(r) ? r : daily.rule }; paintModes(); }, /* K6 */ _photo: (v) => { forcePhoto = !!v; }, _hold: (v) => { holdK6 = !!v; if (ui) ui.classList.toggle("k6hold", holdK6); }, /* (the browser test: the photo strip, the podium and the banners wait for the screenshot) */ opts: () => ({ ...opts }), ramps: () => RAMPS.map((r) => r.i), podClips: () => karts.filter((k) => k.onPod && k.hero && k.hero.mixer).map((k) => [k.racer && k.racer.name, k.hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name)]) };
}
