// world-survivors.js — SURVIVORS ARENA, the Game Village's 12-minute survival game (loaded the first time its door is
// used, like the ARCL Mine). It draws its own scene through the stage's view() while the town waits, frozen, behind it.
// Pick ARON, LUMI or NEX and a difficulty; move with the stick (WASD), dash with the button (Space). Every weapon fires
// by itself; monsters drop XP gems, every level offers three cards (the game stops while you choose). Bosses come at 3,
// 6, 9 and 12 minutes; the run ends when the Infinity Titan falls, when you fall, or at 15:00.
//
// The monsters: models/world/survivors/monsters.glb (Quaternius Ultimate Monsters, CC0; tools note in the commit). Each
// kind is baked once on load into a vertex-animation texture (every vertex's place and normal, frame by frame, for its
// walk, attack and death), then drawn as one InstancedMesh with a rim light, a hit squash and a burning dissolve: a
// crowd of 200 costs about 16 draw calls.
//
// The loop runs on fixed 1/60 s steps (a slow phone takes more steps a frame, so 12 minutes stay 12 minutes); nothing
// is made while playing (monsters, shots, gems and every effect come from pools); damage numbers are digit sprites
// drawn with the effects; quality steps down by itself when frames run slow (resolution, particles, crowd size).
// What pays is the server's (api/_world-survivors.mjs): it checks the run on its own clock and computes the reward
// itself (world-survivors-data.js reward()). A guest plays the same game; nothing is paid.
//
// ctx: { THREE, K, st, ver, T, lang, esc, toast, Snd, reduce, low, coarse, sess, post, refresh, gain(n, why),
//        makeHero(id) → character, addSupply(kind, n), onLeave() }
import { RULES, reward, worldXp, HEROES, MON, BOSSES, poolAt, eliteAt, crowdAt, hpK, needXp, WEAPONS, PASSIVES, EVOS, SLOTS, MAX_LV, maxLv, THEMES, themeToday } from "./world-survivors-data.js";

const ARENA_R = 46, CAM_PC = [0, 15.5, 10.5], CAM_PHONE = [0, 22, 14.5], HERO_R = 0.45, DASH_CD = 2.4, DASH_T = 0.2;
const ROLES = [["move", 10, true], ["atk", 8, false], ["die", 8, false]]; // baked frames a clip
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const mmss = (s) => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };


const LW = {
  ko: { "SURVIVORS ARENA": "서바이버즈 아레나", "Survive 12 minutes. Beat 4 bosses.": "12분을 버티고 보스 4마리를 쓰러뜨리세요.", "Choose your hero": "영웅 선택", Difficulty: "난이도", Easy: "쉬움", Normal: "보통", Hard: "어려움", Start: "시작", Leave: "나가기", "Attack +10%": "공격력 +10%", "Area +15%": "범위 +15%", "Move speed +12%": "이동 속도 +12%",
    "Up to {n} ARCL a run · first 3 runs a day": "한 판 최대 {n} ARCL · 하루 첫 3판", "Sign in with a wallet to earn ARCL here": "지갑으로 로그인하면 여기서 ARCL을 받아요", "Today: {n} / {m} ARCL": "오늘: {n} / {m} ARCL", "Paid runs left today: {n}": "오늘 남은 보상 판: {n}",
    "Loading the arena…": "아레나 준비 중…", "LEVEL UP!": "레벨 업!", "Choose one": "하나를 고르세요", NEW: "NEW", EVOLVE: "진화", "Lv {n}": "Lv {n}", Paused: "일시 정지", Resume: "계속하기", "Quit the run": "그만두기", "Quit now? Boss bonuses are paid only if you reach 12:00.": "지금 그만둘까요? 보스 보너스는 12:00까지 살아남아야 받아요.",
    "Boss incoming!": "보스 등장!", "A chest!": "상자!", "Survived 12 minutes!": "12분 생존!", "The Infinity Titan is here!": "인피니티 타이탄이 나타났어요!", "VICTORY": "승리", "YOU FELL": "쓰러졌어요", "TIME UP": "시간 종료", "Run ended": "런 종료",
    Time: "시간", "Knock-outs": "처치", Bosses: "보스", Level: "레벨", Weapons: "무기", "World XP": "월드 경험치", "Play again": "다시 하기", "Sending your run…": "기록 보내는 중…", "+{n} ARCL": "+{n} ARCL", "No ARCL this run": "이번 판 ARCL 없음",
    "Today's 3 paid runs are used — XP only now": "오늘 보상 3판을 다 썼어요 — 이제 경험치만", "Today's ARCL limit is reached": "오늘 ARCL 한도에 도달했어요", "The reward couldn't be sent — try again later": "보상을 보내지 못했어요 — 잠시 후 다시 해 보세요", "Guest run: sign in to earn ARCL": "게스트 플레이: 로그인하면 ARCL을 받아요",
    Dash: "대시", "Heal 30% HP": "HP 30% 회복", "+10% damage for this run": "이번 판 피해 +10%", "WASD move · Space dash · Esc pause": "WASD 이동 · Space 대시 · Esc 일시정지", "The arena couldn't load: {e}": "아레나를 불러오지 못했어요: {e}", "3 · 2 · 1 · GO!": "3 · 2 · 1 · 시작!",
    "Energy Blaster": "에너지 블래스터", "Lightning Chain": "라이트닝 체인", "Fire Orb": "파이어 오브", "Laser Beam": "레이저 빔", "Thunder Nova": "썬더 노바", Meteor: "메테오", "Power Boost": "파워 부스트", "Rapid Fire": "래피드 파이어", "Heavy Impact": "헤비 임팩트", "Long Range": "롱 레인지", "Critical Eye": "크리티컬 아이", "Speed Boots": "스피드 부츠", "Armor Plate": "아머 플레이트", "Vital Core": "바이탈 코어", Recovery: "리커버리", "XP Magnet": "XP 마그넷", "Cooldown Core": "쿨다운 코어", Vampire: "뱀파이어", "Infinity Thunder": "인피니티 썬더", "Star Blaster": "스타 블래스터", "Inferno Ring": "인페르노 링",
    "Shoots the nearest monster": "가장 가까운 몬스터를 쏴요", "+30% damage, pierces 1": "피해 +30%, 1마리 관통", "+1 shot": "발사 +1", "+25% damage, pierces 2": "피해 +25%, 2마리 관통", "+1 shot, +30% damage": "발사 +1, 피해 +30%", "Strikes 3 monsters": "몬스터 3마리 연쇄", "Jumps to 4": "4마리 연쇄", "Jumps to 5, faster": "5마리 연쇄, 더 빠르게", "Jumps to 6": "6마리 연쇄", "Jumps to 8, +30% damage": "8마리 연쇄, 피해 +30%",
    "1 fireball circles you": "화염구 1개가 주위를 돌아요", "+1 fireball": "화염구 +1", "Wider, +25% damage": "더 넓게, 피해 +25%", "+1 fireball, +30% damage": "화염구 +1, 피해 +30%", "A beam through the crowd": "몬스터 무리를 관통하는 빔", "+25% damage": "피해 +25%", "+1 beam": "빔 +1", "+25% damage, faster": "피해 +25%, 더 빠르게", "+1 beam, +30% damage": "빔 +1, 피해 +30%",
    "A blast that pushes back": "밀쳐내는 폭발", "+30% damage": "피해 +30%", "Bigger, faster": "더 크게, 더 빠르게", "+25% damage, bigger": "피해 +25%, 더 크게", "Biggest, +25% damage": "최대 크기, 피해 +25%", "A meteor on a monster": "몬스터 위로 메테오", "+1 meteor": "메테오 +1", "+1 meteor, +25% damage": "메테오 +1, 피해 +25%",
    "+10% damage a level": "레벨마다 피해 +10%", "+10% shooting speed a level": "레벨마다 공격 속도 +10%", "+10% area a level": "레벨마다 범위 +10%", "+12% reach a level": "레벨마다 사거리 +12%", "+6% critical hits a level": "레벨마다 치명타 +6%", "+7% move speed a level": "레벨마다 이동 속도 +7%", "-7% damage taken a level": "레벨마다 받는 피해 -7%", "+20 max HP a level": "레벨마다 최대 HP +20", "+0.4 HP a second a level": "레벨마다 초당 HP +0.4", "+40% pickup range a level": "레벨마다 획득 범위 +40%", "-6% cooldowns a level": "레벨마다 쿨타임 -6%", "Heal on knock-outs": "처치할 때 회복",
    "Endless lightning: 14 jumps, twice as often": "끝없는 번개: 14마리 연쇄, 2배 빠르게", "A fan of piercing stars": "부채꼴로 관통하는 별", "Six great fireballs": "거대한 화염구 6개", "Mushroom King": "머쉬룸 킹", "Goleling Prime": "골렐링 프라임", "Sky Dragon": "스카이 드래곤", "Infinity Titan": "인피니티 타이탄" },
  zh: { "SURVIVORS ARENA": "幸存者竞技场", "Survive 12 minutes. Beat 4 bosses.": "坚持 12 分钟，击败 4 个首领。", "Choose your hero": "选择英雄", Difficulty: "难度", Easy: "简单", Normal: "普通", Hard: "困难", Start: "开始", Leave: "离开", "Attack +10%": "攻击 +10%", "Area +15%": "范围 +15%", "Move speed +12%": "移速 +12%",
    "Up to {n} ARCL a run · first 3 runs a day": "每局最多 {n} ARCL · 每天前 3 局", "Sign in with a wallet to earn ARCL here": "用钱包登录即可在这里赚取 ARCL", "Today: {n} / {m} ARCL": "今天：{n} / {m} ARCL", "Paid runs left today: {n}": "今天剩余奖励局：{n}",
    "Loading the arena…": "正在准备竞技场…", "LEVEL UP!": "升级！", "Choose one": "选择一个", NEW: "新", EVOLVE: "进化", "Lv {n}": "Lv {n}", Paused: "已暂停", Resume: "继续", "Quit the run": "放弃本局", "Quit now? Boss bonuses are paid only if you reach 12:00.": "现在放弃？只有坚持到 12:00 才能获得首领奖励。",
    "Boss incoming!": "首领来袭！", "A chest!": "宝箱！", "Survived 12 minutes!": "坚持了 12 分钟！", "The Infinity Titan is here!": "无限泰坦出现了！", "VICTORY": "胜利", "YOU FELL": "你倒下了", "TIME UP": "时间到", "Run ended": "本局结束",
    Time: "时间", "Knock-outs": "击倒", Bosses: "首领", Level: "等级", Weapons: "武器", "World XP": "世界经验", "Play again": "再玩一次", "Sending your run…": "正在提交记录…", "+{n} ARCL": "+{n} ARCL", "No ARCL this run": "本局没有 ARCL",
    "Today's 3 paid runs are used — XP only now": "今天的 3 局奖励已用完——现在只有经验", "Today's ARCL limit is reached": "已达到今天的 ARCL 上限", "The reward couldn't be sent — try again later": "奖励发送失败——请稍后再试", "Guest run: sign in to earn ARCL": "游客模式：登录即可赚取 ARCL",
    Dash: "冲刺", "Heal 30% HP": "恢复 30% HP", "+10% damage for this run": "本局伤害 +10%", "WASD move · Space dash · Esc pause": "WASD 移动 · 空格 冲刺 · Esc 暂停", "The arena couldn't load: {e}": "竞技场加载失败：{e}", "3 · 2 · 1 · GO!": "3 · 2 · 1 · 开始！",
    "Energy Blaster": "能量冲击枪", "Lightning Chain": "闪电链", "Fire Orb": "火焰球", "Laser Beam": "激光束", "Thunder Nova": "雷霆新星", Meteor: "陨石", "Power Boost": "力量提升", "Rapid Fire": "快速射击", "Heavy Impact": "重击", "Long Range": "远程", "Critical Eye": "暴击之眼", "Speed Boots": "疾速靴", "Armor Plate": "护甲板", "Vital Core": "生命核心", Recovery: "恢复", "XP Magnet": "经验磁铁", "Cooldown Core": "冷却核心", Vampire: "吸血", "Infinity Thunder": "无限雷霆", "Star Blaster": "星辰冲击枪", "Inferno Ring": "炼狱之环",
    "Shoots the nearest monster": "射击最近的怪物", "+30% damage, pierces 1": "伤害 +30%，穿透 1", "+1 shot": "射击 +1", "+25% damage, pierces 2": "伤害 +25%，穿透 2", "+1 shot, +30% damage": "射击 +1，伤害 +30%", "Strikes 3 monsters": "连锁 3 个怪物", "Jumps to 4": "连锁 4 个", "Jumps to 5, faster": "连锁 5 个，更快", "Jumps to 6": "连锁 6 个", "Jumps to 8, +30% damage": "连锁 8 个，伤害 +30%",
    "1 fireball circles you": "1 个火球环绕你", "+1 fireball": "火球 +1", "Wider, +25% damage": "更宽，伤害 +25%", "+1 fireball, +30% damage": "火球 +1，伤害 +30%", "A beam through the crowd": "贯穿怪群的光束", "+25% damage": "伤害 +25%", "+1 beam": "光束 +1", "+25% damage, faster": "伤害 +25%，更快", "+1 beam, +30% damage": "光束 +1，伤害 +30%",
    "A blast that pushes back": "击退的爆炸", "+30% damage": "伤害 +30%", "Bigger, faster": "更大，更快", "+25% damage, bigger": "伤害 +25%，更大", "Biggest, +25% damage": "最大，伤害 +25%", "A meteor on a monster": "陨石砸向怪物", "+1 meteor": "陨石 +1", "+1 meteor, +25% damage": "陨石 +1，伤害 +25%",
    "+10% damage a level": "每级伤害 +10%", "+10% shooting speed a level": "每级射速 +10%", "+10% area a level": "每级范围 +10%", "+12% reach a level": "每级射程 +12%", "+6% critical hits a level": "每级暴击 +6%", "+7% move speed a level": "每级移速 +7%", "-7% damage taken a level": "每级受到伤害 -7%", "+20 max HP a level": "每级最大 HP +20", "+0.4 HP a second a level": "每级每秒 HP +0.4", "+40% pickup range a level": "每级拾取范围 +40%", "-6% cooldowns a level": "每级冷却 -6%", "Heal on knock-outs": "击倒时恢复",
    "Endless lightning: 14 jumps, twice as often": "无尽闪电：连锁 14 个，频率翻倍", "A fan of piercing stars": "扇形穿透星星", "Six great fireballs": "六个巨大火球", "Mushroom King": "蘑菇王", "Goleling Prime": "魔像首领", "Sky Dragon": "天空之龙", "Infinity Titan": "无限泰坦" },
  tr: { "SURVIVORS ARENA": "SURVIVORS ARENA", "Survive 12 minutes. Beat 4 bosses.": "12 dakika hayatta kal. 4 boss'u yen.", "Choose your hero": "Kahramanını seç", Difficulty: "Zorluk", Easy: "Kolay", Normal: "Normal", Hard: "Zor", Start: "Başla", Leave: "Ayrıl", "Attack +10%": "Saldırı +%10", "Area +15%": "Alan +%15", "Move speed +12%": "Hız +%12",
    "Up to {n} ARCL a run · first 3 runs a day": "Oyun başına {n} ARCL'ye kadar · günün ilk 3 oyunu", "Sign in with a wallet to earn ARCL here": "Burada ARCL kazanmak için cüzdanla giriş yap", "Today: {n} / {m} ARCL": "Bugün: {n} / {m} ARCL", "Paid runs left today: {n}": "Bugün kalan ödüllü oyun: {n}",
    "Loading the arena…": "Arena hazırlanıyor…", "LEVEL UP!": "SEVİYE ATLADIN!", "Choose one": "Birini seç", NEW: "YENİ", EVOLVE: "EVRİM", "Lv {n}": "Sv {n}", Paused: "Duraklatıldı", Resume: "Devam", "Quit the run": "Oyunu bırak", "Quit now? Boss bonuses are paid only if you reach 12:00.": "Şimdi bırakılsın mı? Boss bonusları yalnızca 12:00'a ulaşırsan ödenir.",
    "Boss incoming!": "Boss geliyor!", "A chest!": "Bir sandık!", "Survived 12 minutes!": "12 dakika hayatta kaldın!", "The Infinity Titan is here!": "Sonsuzluk Titanı geldi!", "VICTORY": "ZAFER", "YOU FELL": "DÜŞTÜN", "TIME UP": "SÜRE DOLDU", "Run ended": "Oyun bitti",
    Time: "Süre", "Knock-outs": "Nakavt", Bosses: "Bosslar", Level: "Seviye", Weapons: "Silahlar", "World XP": "Dünya XP", "Play again": "Tekrar oyna", "Sending your run…": "Oyunun gönderiliyor…", "+{n} ARCL": "+{n} ARCL", "No ARCL this run": "Bu oyunda ARCL yok",
    "Today's 3 paid runs are used — XP only now": "Bugünün 3 ödüllü oyunu kullanıldı — artık yalnızca XP", "Today's ARCL limit is reached": "Bugünün ARCL sınırına ulaşıldı", "The reward couldn't be sent — try again later": "Ödül gönderilemedi — sonra tekrar dene", "Guest run: sign in to earn ARCL": "Misafir oyunu: ARCL kazanmak için giriş yap",
    Dash: "Atıl", "Heal 30% HP": "%30 HP iyileş", "+10% damage for this run": "Bu oyun için +%10 hasar", "WASD move · Space dash · Esc pause": "WASD hareket · Space atıl · Esc duraklat", "The arena couldn't load: {e}": "Arena yüklenemedi: {e}", "3 · 2 · 1 · GO!": "3 · 2 · 1 · BAŞLA!",
    "Energy Blaster": "Enerji Blaster", "Lightning Chain": "Şimşek Zinciri", "Fire Orb": "Ateş Küresi", "Laser Beam": "Lazer Işını", "Thunder Nova": "Gök Gürültüsü Novası", Meteor: "Meteor", "Power Boost": "Güç Artışı", "Rapid Fire": "Hızlı Atış", "Heavy Impact": "Ağır Darbe", "Long Range": "Uzun Menzil", "Critical Eye": "Kritik Göz", "Speed Boots": "Hız Botları", "Armor Plate": "Zırh Plakası", "Vital Core": "Yaşam Çekirdeği", Recovery: "İyileşme", "XP Magnet": "XP Mıknatısı", "Cooldown Core": "Bekleme Çekirdeği", Vampire: "Vampir", "Infinity Thunder": "Sonsuz Şimşek", "Star Blaster": "Yıldız Blaster", "Inferno Ring": "Cehennem Halkası",
    "Shoots the nearest monster": "En yakın canavara ateş eder", "+30% damage, pierces 1": "+%30 hasar, 1 deler", "+1 shot": "+1 atış", "+25% damage, pierces 2": "+%25 hasar, 2 deler", "+1 shot, +30% damage": "+1 atış, +%30 hasar", "Strikes 3 monsters": "3 canavara çarpar", "Jumps to 4": "4'e sıçrar", "Jumps to 5, faster": "5'e sıçrar, daha hızlı", "Jumps to 6": "6'ya sıçrar", "Jumps to 8, +30% damage": "8'e sıçrar, +%30 hasar",
    "1 fireball circles you": "Etrafında 1 ateş topu döner", "+1 fireball": "+1 ateş topu", "Wider, +25% damage": "Daha geniş, +%25 hasar", "+1 fireball, +30% damage": "+1 ateş topu, +%30 hasar", "A beam through the crowd": "Kalabalığı delen ışın", "+25% damage": "+%25 hasar", "+1 beam": "+1 ışın", "+25% damage, faster": "+%25 hasar, daha hızlı", "+1 beam, +30% damage": "+1 ışın, +%30 hasar",
    "A blast that pushes back": "Geri iten patlama", "+30% damage": "+%30 hasar", "Bigger, faster": "Daha büyük, daha hızlı", "+25% damage, bigger": "+%25 hasar, daha büyük", "Biggest, +25% damage": "En büyük, +%25 hasar", "A meteor on a monster": "Canavarın üstüne meteor", "+1 meteor": "+1 meteor", "+1 meteor, +25% damage": "+1 meteor, +%25 hasar",
    "+10% damage a level": "Seviye başına +%10 hasar", "+10% shooting speed a level": "Seviye başına +%10 atış hızı", "+10% area a level": "Seviye başına +%10 alan", "+12% reach a level": "Seviye başına +%12 menzil", "+6% critical hits a level": "Seviye başına +%6 kritik", "+7% move speed a level": "Seviye başına +%7 hız", "-7% damage taken a level": "Seviye başına -%7 alınan hasar", "+20 max HP a level": "Seviye başına +20 maks HP", "+0.4 HP a second a level": "Seviye başına saniyede +0,4 HP", "+40% pickup range a level": "Seviye başına +%40 toplama menzili", "-6% cooldowns a level": "Seviye başına -%6 bekleme", "Heal on knock-outs": "Nakavtta iyileş",
    "Endless lightning: 14 jumps, twice as often": "Sonsuz şimşek: 14 sıçrama, iki kat sık", "A fan of piercing stars": "Delen yıldızlardan bir yelpaze", "Six great fireballs": "Altı büyük ateş topu", "Mushroom King": "Mantar Kral", "Goleling Prime": "Goleling Prime", "Sky Dragon": "Gök Ejderhası", "Infinity Titan": "Sonsuzluk Titanı" },
};

// the cards' icons: small glossy SVGs, one shape each (no emoji: Samsung Internet draws those its own way)
const ICON = {
  blaster: `<path d="M6 20 20 6M14 6h6v6" stroke="#bff6ff" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="7" cy="19" r="3.4" fill="#38d8ff"/>`,
  chain: `<path d="M14 2 6 14h6l-2 10 9-13h-6l3-9z" fill="#ffe14d" stroke="#fff6b0" stroke-width="1"/>`,
  orb: `<circle cx="13" cy="14" r="7" fill="#ff7a2e"/><path d="M13 3c4 5 7 7 7 11a7 7 0 0 1-14 0c0-3 2-5 4-7 0 3 1 4 3 4-1-3-1-5 0-8z" fill="#ffd25a"/>`,
  laser: `<rect x="2" y="11" width="22" height="4" rx="2" fill="#ff5ad8"/><rect x="2" y="12.2" width="22" height="1.6" fill="#fff"/><circle cx="4" cy="13" r="3.5" fill="#ff9af0"/>`,
  nova: `<circle cx="13" cy="13" r="9" fill="none" stroke="#8ff0ff" stroke-width="2.6"/><circle cx="13" cy="13" r="4" fill="#bff6ff"/><path d="M13 1v4M13 21v4M1 13h4M21 13h4" stroke="#8ff0ff" stroke-width="2.4" stroke-linecap="round"/>`,
  meteor: `<path d="M3 3l11 9" stroke="#ffb05a" stroke-width="4" stroke-linecap="round" opacity=".7"/><circle cx="17" cy="16" r="6" fill="#ff7a3c"/><circle cx="15.5" cy="14.5" r="2" fill="#ffd8a0"/>`,
  power: `<path d="M13 3v14M8 8l5-5 5 5" stroke="#ff6a6a" stroke-width="3.4" fill="none" stroke-linecap="round"/><rect x="7" y="19" width="12" height="4" rx="2" fill="#ff9a9a"/>`,
  rapid: `<path d="M5 6l7 7-7 7M13 6l7 7-7 7" stroke="#ffd23a" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  heavy: `<circle cx="13" cy="13" r="5" fill="#ffa64d"/><path d="M3 3l5 5M23 3l-5 5M3 23l5-5M23 23l-5-5" stroke="#ffd09a" stroke-width="3" stroke-linecap="round"/>`,
  range: `<circle cx="13" cy="13" r="9" fill="none" stroke="#7dff9a" stroke-width="2.4"/><circle cx="13" cy="13" r="3" fill="#7dff9a"/><path d="M13 1v6M13 19v6M1 13h6M19 13h6" stroke="#7dff9a" stroke-width="2"/>`,
  crit: `<path d="M2 13c5-7 17-7 22 0-5 7-17 7-22 0z" fill="#fff" stroke="#ff4d6d" stroke-width="2"/><circle cx="13" cy="13" r="4" fill="#ff4d6d"/>`,
  speed: `<path d="M3 17h9l3-9 4 9h4" stroke="#38d8ff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10h6M2 6h4" stroke="#bff6ff" stroke-width="2" stroke-linecap="round"/>`,
  armor: `<path d="M13 2l9 4v6c0 6-4 10-9 12-5-2-9-6-9-12V6z" fill="#5a8dff" stroke="#bfd6ff" stroke-width="1.6"/>`,
  vital: `<path d="M13 23S3 16 3 9a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 14-10 14z" fill="#ff4d8d"/>`,
  recov: `<path d="M13 23S3 16 3 9a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 14-10 14z" fill="#3fdc8f"/><path d="M13 9v8M9 13h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  magnet: `<path d="M5 3v9a8 8 0 0 0 16 0V3h-5v9a3 3 0 0 1-6 0V3z" fill="#ff5a5a"/><path d="M5 3h5v4H5zM16 3h5v4h-5z" fill="#e8eef4"/>`,
  cool: `<circle cx="13" cy="14" r="9" fill="#9b6bff"/><path d="M13 8v6l4 3" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M10 2h6" stroke="#cdb8ff" stroke-width="2.4" stroke-linecap="round"/>`,
  vamp: `<path d="M13 3c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z" fill="#c8102e"/><path d="M10 15l1.5 4 1.5-4M14 15l1.5 4 1.5-4" stroke="#fff" stroke-width="1.4" fill="#fff"/>`,
  thunder: `<path d="M14 1 4 15h7l-2 10 12-15h-7l3-9z" fill="#ffd23a" stroke="#fff" stroke-width="1.2"/>`,
  star: `<path d="M13 2l3 7 7 .6-5.3 4.7 1.6 7.2L13 17.8 6.7 21.5l1.6-7.2L3 9.6 10 9z" fill="#8ff0ff" stroke="#fff" stroke-width="1"/>`,
  inferno: `<circle cx="13" cy="13" r="9" fill="none" stroke="#ff7a2e" stroke-width="3.4"/><circle cx="13" cy="4" r="3" fill="#ffd25a"/><circle cx="21" cy="17" r="3" fill="#ffd25a"/><circle cx="5" cy="17" r="3" fill="#ffd25a"/>`,
  heal: `<path d="M13 23S3 16 3 9a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 14-10 14z" fill="#3fdc8f"/>`,
  dmg: `<path d="M5 21 19 7l2 2-14 14zM17 3l6 6" stroke="#ffb05a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
};

// the second batch of words: the 18 new cards, the evolutions, the board, the loot, the tips
const LW2 = {
  ko: { "Ice Storm": "아이스 스톰", "Shadow Blade": "섀도 블레이드", "Poison Field": "포이즌 필드", "Drone Squad": "드론 스쿼드", "Energy Sword": "에너지 소드", "Black Hole": "블랙홀",
    "A freezing storm that slows": "몬스터를 느리게 하는 얼음 폭풍", "Bigger, faster": "더 크게, 더 빠르게", "Biggest, slows longer": "최대 크기, 더 오래 둔화", "2 blades spin wide around you": "칼날 2개가 넓게 회전", "+1 blade": "칼날 +1", "Wider, +20% damage": "더 넓게, 피해 +20%", "+1 blade, +25% damage": "칼날 +1, 피해 +25%",
    "Leaves a poison pool": "독 웅덩이를 남겨요", "Bigger pools": "더 큰 웅덩이", "+25% damage, more often": "피해 +25%, 더 자주", "Biggest, +30% damage": "최대 크기, 피해 +30%", "A drone shoots for you": "드론이 대신 쏴요", "+1 drone": "드론 +1", "Faster, +25% damage": "더 빠르게, 피해 +25%",
    "Slashes in front of you": "앞쪽을 베어요", "Wider, faster": "더 넓게, 더 빠르게", "Slashes both ways": "앞뒤로 베어요", "Pulls monsters in, then bursts": "몬스터를 빨아들인 뒤 폭발", "Stronger pull": "더 강하게 끌어당겨요",
    "Critical Power": "크리티컬 파워", "+25% critical damage a level": "레벨마다 치명타 피해 +25%", "Chain Kill": "체인 킬", "Quick knock-outs build up damage": "빠르게 처치할수록 피해 증가", "Freeze Aura": "프리즈 오라", "Monsters near you slow down": "주변 몬스터가 느려져요", "Explosive Rounds": "폭발 탄환", "Shots burst on hit": "탄환이 맞으면 폭발해요",
    Revive: "리바이브", "Get up once at half HP": "한 번 HP 절반으로 부활", "Double Shot": "더블 샷", "+1 shot for shooting weapons": "사격 무기 발사 +1", "Gold Hunter": "골드 헌터", "+10% XP from gems a level": "레벨마다 젬 경험치 +10%", "Boss Slayer": "보스 슬레이어", "+15% damage to bosses and elites": "보스·엘리트에게 피해 +15%",
    "Shield Burst": "실드 버스트", "A shield that blocks a hit and blasts": "한 번 막고 폭발하는 보호막", "Lucky Drop": "럭키 드롭", "More chests and big gems": "상자와 큰 젬이 더 자주", Berserker: "버서커", "More damage when HP is low": "HP가 낮을 때 피해 증가", "Infinity Core": "인피니티 코어", "A huge blast every 25 seconds": "25초마다 거대한 폭발",
    "Absolute Zero": "앱솔루트 제로", "Storms that freeze the crowd still": "무리를 얼려 멈추는 폭풍", "Drone Legion": "드론 군단", "Five drones with twin guns": "쌍발 드론 5대", "Eclipse Blades": "이클립스 블레이드", "Six blades that crit hard": "강한 치명타의 칼날 6개",
    Damage: "피해량", "This week": "이번 주", "No runs yet — be the first!": "아직 기록이 없어요 — 첫 주인공이 되세요!", "Week rank #{n}": "주간 순위 {n}위", "Chest loot": "상자 보상", "HP potion": "HP 물약", Scrap: "고철", "Revived!": "부활!", "Shield up": "보호막", RARE: "희귀", EPIC: "에픽",
    "Your weapons fire by themselves": "무기는 자동으로 공격해요", "Grab the blue gems to level up": "파란 젬을 먹으면 레벨업", "Dash through danger": "대시로 위험을 피하세요", "This run couldn't be checked, so it isn't paid": "이 판은 확인할 수 없어 보상이 지급되지 않아요", "Couldn't reach the server — try again later": "서버에 연결하지 못했어요 — 잠시 후 다시 해 보세요", "Swarm!": "몬스터 대군!", "Stampede!": "돌진 무리!" },
  zh: { "Ice Storm": "冰霜风暴", "Shadow Blade": "暗影之刃", "Poison Field": "毒雾领域", "Drone Squad": "无人机小队", "Energy Sword": "能量剑", "Black Hole": "黑洞",
    "A freezing storm that slows": "减速的冰霜风暴", "Bigger, faster": "更大，更快", "Biggest, slows longer": "最大，减速更久", "2 blades spin wide around you": "2 把刀刃在你周围大范围旋转", "+1 blade": "刀刃 +1", "Wider, +20% damage": "更宽，伤害 +20%", "+1 blade, +25% damage": "刀刃 +1，伤害 +25%",
    "Leaves a poison pool": "留下毒池", "Bigger pools": "更大的毒池", "+25% damage, more often": "伤害 +25%，更频繁", "Biggest, +30% damage": "最大，伤害 +30%", "A drone shoots for you": "无人机替你射击", "+1 drone": "无人机 +1", "Faster, +25% damage": "更快，伤害 +25%",
    "Slashes in front of you": "向前方斩击", "Wider, faster": "更宽，更快", "Slashes both ways": "前后双向斩击", "Pulls monsters in, then bursts": "吸入怪物后爆炸", "Stronger pull": "吸力更强",
    "Critical Power": "暴击强化", "+25% critical damage a level": "每级暴击伤害 +25%", "Chain Kill": "连杀", "Quick knock-outs build up damage": "快速击倒叠加伤害", "Freeze Aura": "冰冻光环", "Monsters near you slow down": "附近怪物减速", "Explosive Rounds": "爆裂弹", "Shots burst on hit": "子弹命中时爆炸",
    Revive: "复活", "Get up once at half HP": "以一半 HP 复活一次", "Double Shot": "双重射击", "+1 shot for shooting weapons": "射击武器 +1 发", "Gold Hunter": "黄金猎手", "+10% XP from gems a level": "每级宝石经验 +10%", "Boss Slayer": "首领杀手", "+15% damage to bosses and elites": "对首领和精英伤害 +15%",
    "Shield Burst": "护盾爆发", "A shield that blocks a hit and blasts": "挡下一击并爆炸的护盾", "Lucky Drop": "幸运掉落", "More chests and big gems": "更多宝箱和大宝石", Berserker: "狂战士", "More damage when HP is low": "HP 低时伤害更高", "Infinity Core": "无限核心", "A huge blast every 25 seconds": "每 25 秒一次巨大爆炸",
    "Absolute Zero": "绝对零度", "Storms that freeze the crowd still": "冻住怪群的风暴", "Drone Legion": "无人机军团", "Five drones with twin guns": "五架双枪无人机", "Eclipse Blades": "日蚀之刃", "Six blades that crit hard": "六把强力暴击刀刃",
    Damage: "伤害", "This week": "本周", "No runs yet — be the first!": "还没有记录——来当第一个吧！", "Week rank #{n}": "本周第 {n} 名", "Chest loot": "宝箱奖励", "HP potion": "HP 药水", Scrap: "废料", "Revived!": "复活！", "Shield up": "护盾", RARE: "稀有", EPIC: "史诗",
    "Your weapons fire by themselves": "武器会自动攻击", "Grab the blue gems to level up": "拾取蓝色宝石升级", "Dash through danger": "用冲刺躲开危险", "This run couldn't be checked, so it isn't paid": "本局无法验证，因此没有奖励", "Couldn't reach the server — try again later": "无法连接服务器——请稍后再试", "Swarm!": "怪物大军！", "Stampede!": "冲锋群！" },
  tr: { "Ice Storm": "Buz Fırtınası", "Shadow Blade": "Gölge Bıçağı", "Poison Field": "Zehir Alanı", "Drone Squad": "Drone Ekibi", "Energy Sword": "Enerji Kılıcı", "Black Hole": "Kara Delik",
    "A freezing storm that slows": "Yavaşlatan buz fırtınası", "Bigger, faster": "Daha büyük, daha hızlı", "Biggest, slows longer": "En büyük, daha uzun yavaşlatır", "2 blades spin wide around you": "2 bıçak etrafında geniş döner", "+1 blade": "+1 bıçak", "Wider, +20% damage": "Daha geniş, +%20 hasar", "+1 blade, +25% damage": "+1 bıçak, +%25 hasar",
    "Leaves a poison pool": "Zehir havuzu bırakır", "Bigger pools": "Daha büyük havuzlar", "+25% damage, more often": "+%25 hasar, daha sık", "Biggest, +30% damage": "En büyük, +%30 hasar", "A drone shoots for you": "Bir drone senin için ateş eder", "+1 drone": "+1 drone", "Faster, +25% damage": "Daha hızlı, +%25 hasar",
    "Slashes in front of you": "Önündekileri keser", "Wider, faster": "Daha geniş, daha hızlı", "Slashes both ways": "İki yöne keser", "Pulls monsters in, then bursts": "Canavarları çeker, sonra patlar", "Stronger pull": "Daha güçlü çekim",
    "Critical Power": "Kritik Güç", "+25% critical damage a level": "Seviye başına +%25 kritik hasar", "Chain Kill": "Zincir Nakavt", "Quick knock-outs build up damage": "Hızlı nakavtlar hasarı artırır", "Freeze Aura": "Dondurucu Aura", "Monsters near you slow down": "Yakındaki canavarlar yavaşlar", "Explosive Rounds": "Patlayıcı Mermiler", "Shots burst on hit": "Mermiler çarpınca patlar",
    Revive: "Diriliş", "Get up once at half HP": "Bir kez yarım HP ile kalk", "Double Shot": "Çift Atış", "+1 shot for shooting weapons": "Ateşli silahlara +1 atış", "Gold Hunter": "Altın Avcısı", "+10% XP from gems a level": "Seviye başına mücevherlerden +%10 XP", "Boss Slayer": "Boss Avcısı", "+15% damage to bosses and elites": "Boss ve elitlere +%15 hasar",
    "Shield Burst": "Kalkan Patlaması", "A shield that blocks a hit and blasts": "Bir darbeyi engelleyip patlayan kalkan", "Lucky Drop": "Şanslı Ganimet", "More chests and big gems": "Daha çok sandık ve büyük mücevher", Berserker: "Çılgın Savaşçı", "More damage when HP is low": "HP düşükken daha çok hasar", "Infinity Core": "Sonsuzluk Çekirdeği", "A huge blast every 25 seconds": "Her 25 saniyede dev bir patlama",
    "Absolute Zero": "Mutlak Sıfır", "Storms that freeze the crowd still": "Kalabalığı donduran fırtınalar", "Drone Legion": "Drone Lejyonu", "Five drones with twin guns": "Çift silahlı beş drone", "Eclipse Blades": "Tutulma Bıçakları", "Six blades that crit hard": "Sert kritik vuran altı bıçak",
    Damage: "Hasar", "This week": "Bu hafta", "No runs yet — be the first!": "Henüz kayıt yok — ilk sen ol!", "Week rank #{n}": "Haftalık sıra #{n}", "Chest loot": "Sandık ganimeti", "HP potion": "HP iksiri", Scrap: "Hurda", "Revived!": "Dirildin!", "Shield up": "Kalkan", RARE: "NADİR", EPIC: "EPİK",
    "Your weapons fire by themselves": "Silahların kendiliğinden ateş eder", "Grab the blue gems to level up": "Seviye için mavi mücevherleri topla", "Dash through danger": "Tehlikeden atılarak kaç", "This run couldn't be checked, so it isn't paid": "Bu oyun doğrulanamadı, ödül verilmedi", "Couldn't reach the server — try again later": "Sunucuya ulaşılamadı — sonra tekrar dene", "Swarm!": "Sürü!", "Stampede!": "Hücum!" },
};
const LW3 = {"ko": {"Enraged!": "분노!", "SP potion": "SP 물약", "Skill": "스킬", "Overdrive": "오버드라이브", "Bloom": "블룸", "Blink": "블링크", "12 lasers all around, then double fire rate": "사방으로 레이저 12발, 이후 공격 속도 2배", "Heal 30% and slow the crowd": "HP 30% 회복, 주변 몬스터 둔화", "Teleport through them with a blast": "폭발과 함께 순간이동", "Today's arena: {x}": "오늘의 아레나: {x}", "Desert Colosseum": "사막 콜로세움", "Frost Temple": "얼음 신전", "Neon Grid": "네온 그리드", "WASD move · Space dash · Q skill · Esc pause": "WASD 이동 · Space 대시 · Q 스킬 · Esc 일시정지"}, "zh": {"Enraged!": "狂暴！", "SP potion": "SP 药水", "Skill": "技能", "Overdrive": "超载", "Bloom": "绽放", "Blink": "闪现", "12 lasers all around, then double fire rate": "向四周发射 12 道激光，之后射速翻倍", "Heal 30% and slow the crowd": "恢复 30% HP 并减速怪群", "Teleport through them with a blast": "伴随爆炸瞬移穿过", "Today's arena: {x}": "今日竞技场：{x}", "Desert Colosseum": "沙漠斗兽场", "Frost Temple": "冰霜神殿", "Neon Grid": "霓虹网格", "WASD move · Space dash · Q skill · Esc pause": "WASD 移动 · 空格 冲刺 · Q 技能 · Esc 暂停"}, "tr": {"Enraged!": "Öfkelendi!", "SP potion": "SP iksiri", "Skill": "Yetenek", "Overdrive": "Aşırı Yük", "Bloom": "Çiçeklenme", "Blink": "Işınlanma", "12 lasers all around, then double fire rate": "Her yöne 12 lazer, sonra iki kat atış hızı", "Heal 30% and slow the crowd": "%30 iyileş ve kalabalığı yavaşlat", "Teleport through them with a blast": "Bir patlamayla aralarından ışınlan", "Today's arena: {x}": "Bugünün arenası: {x}", "Desert Colosseum": "Çöl Kolezyumu", "Frost Temple": "Buz Tapınağı", "Neon Grid": "Neon Izgara", "WASD move · Space dash · Q skill · Esc pause": "WASD hareket · Space atıl · Q yetenek · Esc duraklat"}}; // the third batch: boss rage, hero skills, the arenas
for (const l of Object.keys(LW3)) Object.assign(LW2[l], LW3[l]);
for (const l of Object.keys(LW2)) Object.assign(LW[l], LW2[l]);
Object.assign(ICON, {
  ice: `<path d="M13 2v22M4 7l18 12M22 7 4 19" stroke="#bff6ff" stroke-width="2.6" stroke-linecap="round"/><circle cx="13" cy="13" r="3.5" fill="#7fe8ff"/>`,
  blade: `<path d="M13 2c6 4 9 9 7 15-3-4-6-6-7-7-1 1-4 3-7 7-2-6 1-11 7-15z" fill="#9b6bff"/><circle cx="13" cy="15" r="2.6" fill="#e0d0ff"/>`,
  poison: `<path d="M13 3c4 5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7 7-12z" fill="#5bdc5b"/><circle cx="10.5" cy="15" r="1.8" fill="#d8ffd0"/><circle cx="15" cy="18" r="1.2" fill="#d8ffd0"/>`,
  drone: `<rect x="8" y="10" width="10" height="7" rx="3" fill="#38d8ff"/><path d="M3 8h7M16 8h7M6 8v3M20 8v3" stroke="#bff6ff" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="13.5" r="1.8" fill="#fff"/>`,
  sword: `<path d="M20 3 9 14l3 3L23 6V3z" fill="#8ff0ff"/><path d="M6 15l5 5M4 22l4-4" stroke="#ffd23a" stroke-width="3" stroke-linecap="round"/>`,
  hole: `<circle cx="13" cy="13" r="10" fill="#2a0a4a"/><path d="M13 3a10 10 0 0 1 10 10M13 23A10 10 0 0 1 3 13" stroke="#b48cff" stroke-width="2.4" fill="none"/><circle cx="13" cy="13" r="4" fill="#000"/>`,
  critp: `<path d="M13 2l3 8h8l-6.5 5 2.5 8-7-5-7 5 2.5-8L2 10h8z" fill="#ff4d6d"/>`,
  streak: `<path d="M4 20 10 8l4 7 3-5 5 10" stroke="#ff9a3c" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  frost: `<circle cx="13" cy="13" r="10" fill="none" stroke="#7fe8ff" stroke-width="2" stroke-dasharray="3 2"/><path d="M13 7v12M7 13h12M9 9l8 8M17 9l-8 8" stroke="#bff6ff" stroke-width="1.8"/>`,
  boom: `<path d="M13 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z" fill="#ffb03a"/>`,
  revive: `<path d="M13 23S3 16 3 9a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 14-10 14z" fill="#ffd23a"/><path d="M9 12l3 3 5-6" stroke="#6a3a00" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  double: `<circle cx="8" cy="13" r="4" fill="#38d8ff"/><circle cx="18" cy="13" r="4" fill="#38d8ff"/><path d="M8 13h10" stroke="#fff" stroke-width="2"/>`,
  gold: `<circle cx="13" cy="13" r="9" fill="#ffc23a" stroke="#a86400" stroke-width="1.6"/><path d="M13 7v12M10 10h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h5" stroke="#6a3a00" stroke-width="1.8" fill="none"/>`,
  slayer: `<path d="M4 22 20 6M16 4l6 6M3 17l6 6" stroke="#ff6a6a" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="20" r="3" fill="#ffd23a"/>`,
  shield: `<path d="M13 2l9 4v6c0 6-4 10-9 12-5-2-9-6-9-12V6z" fill="#38d8ff" opacity=".85"/><path d="M8 13l3 3 7-7" stroke="#fff" stroke-width="2.4" fill="none"/>`,
  lucky: `<path d="M13 13c-6-6-6-10-2-10 2 0 2 3 2 5 0-2 0-5 2-5 4 0 4 4-2 10zM13 13c6 6 6 10 2 10-2 0-2-3-2-5 0 2 0 5-2 5-4 0-4-4 2-10z" fill="#39ff88"/>`,
  berserk: `<path d="M5 20c2-8 4-12 8-17 4 5 6 9 8 17-3-3-5-4-8-4s-5 1-8 4z" fill="#ff3d5a"/>`,
  infinity: `<path d="M7 9c-3 0-5 2-5 4s2 4 5 4c4 0 8-8 12-8 3 0 5 2 5 4s-2 4-5 4c-4 0-8-8-12-8z" fill="none" stroke="#39ff88" stroke-width="3"/>`,
  zero: `<path d="M13 1v24M2 7l22 12M24 7 2 19" stroke="#e8fbff" stroke-width="3" stroke-linecap="round"/><circle cx="13" cy="13" r="5" fill="#38d8ff"/>`,
  legion: `<rect x="2" y="5" width="9" height="6" rx="2" fill="#38d8ff"/><rect x="15" y="5" width="9" height="6" rx="2" fill="#38d8ff"/><rect x="8" y="15" width="10" height="7" rx="2" fill="#ffd23a"/>`,
  eclipse: `<circle cx="13" cy="13" r="10" fill="#ffd23a"/><circle cx="16" cy="11" r="9" fill="#2a0a4a"/>`,
});

const icon = (k, n = 26) => `<svg viewBox="0 0 26 26" width="${n}" height="${n}" aria-hidden="true">${ICON[k] || ""}</svg>`;
// which cards are rare: a weapon blue, a stat green, a special purple, an evolution gold
const RARITY = (c) => (c.k === "evo" ? "evo" : c.k === "w" ? "w" : PASSIVES[c.id] && PASSIVES[c.id].fx ? "fx" : "p");
// the sky over the run: day, then dusk at 6:00, night at 9:00, a red sky for the Titan at 12:00
const SKY = [
  { t: 0, bg: 0x2a4f8a, hs: 0xd8ecff, hg: 0x5a4a6e, hk: 0.95, sun: 0xfff0d8, sk: 2.8, fl: 0xffffff },
  { t: 300, bg: 0x3a3f7a, hs: 0xffe0c8, hg: 0x5a3a5e, hk: 0.85, sun: 0xffc48a, sk: 2.5, fl: 0xfff0e0 },
  { t: 450, bg: 0x4a2a5e, hs: 0xffb89a, hg: 0x4a2a4e, hk: 0.75, sun: 0xff9a6a, sk: 2.2, fl: 0xffe0d0 },
  { t: 570, bg: 0x141c48, hs: 0x9ab8ff, hg: 0x2a2a4e, hk: 0.7, sun: 0xbfd0ff, sk: 1.7, fl: 0xd8e0ff },
  { t: 700, bg: 0x3a0a1a, hs: 0xffa0a0, hg: 0x4a1a2a, hk: 0.75, sun: 0xff7050, sk: 2.2, fl: 0xffd8d0 },
];
const STEP = 1 / 60; // the game's own clock: fixed steps, so a slow phone runs the same 12 minutes (more steps a frame)

export function createSurvivors(ctx) {
  const { THREE, st, esc, Snd } = ctx, L = LW[ctx.lang] || {}, T = (s, v) => { let r = L[s] != null ? L[s] : ctx.T(s, v); if (v && L[s] != null) for (const k in v) r = r.split("{" + k + "}").join(v[k]); return r; };
  const reduce = !!ctx.reduce, sndAt = {}, snd = (k, gap = 0) => { const n = performance.now(); if (gap && n - (sndAt[k] || 0) < gap) return; sndAt[k] = n; try { if (Snd && Snd[k]) Snd[k](); } catch { /* no sound */ } };
  const phone = () => document.documentElement.classList.contains("wp-pcphone") || (innerWidth < 700 && innerHeight > innerWidth);
  // quality: 2 full, 1 lighter, 0 lightest; starts from the device and moves with the frame time (adapt)
  let Q = ctx.low ? 0 : phone() ? 1 : 2, Qmax = Q, prOrig = 0;
  const CAP = () => Math.round((phone() ? 150 : 240) * [0.6, 0.8, 1][Q]);
  let S = null, ui = null, on = false, busy = false, hero = null, heroId = "", heroP = null, pack = null, packP = null;
  let mode = "off"; // off · lobby · count · play · cards · pause · over
  let pick = { hero: 0, diff: "normal" };
  try { const s = JSON.parse(localStorage.getItem("arc.surv.pick") || "null"); if (s && HEROES[s.hero] && RULES.DIFF[s.diff]) pick = s; } catch { /* the defaults */ }
  const col = new THREE.Color(), col2 = new THREE.Color(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3(), ee = new THREE.Euler();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), frustum = new THREE.Frustum(), sph = new THREE.Sphere();

  // ---------------- textures, made once on canvases ----------------
  function canvasTex(w, h, draw, srgb = true) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
  const radial = (stops, n = 128) => canvasTex(n, n, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, w); });

  // ---------------- the arena (made once) ----------------
  function build() {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(SKY[0].bg); scene.fog = new THREE.Fog(SKY[0].bg, 38, 82);
    const cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 200);
    const hemi = new THREE.HemisphereLight(SKY[0].hs, SKY[0].hg, SKY[0].hk); scene.add(hemi);
    const sun = new THREE.DirectionalLight(SKY[0].sun, SKY[0].sk); sun.position.set(14, 30, 10); scene.add(sun);
    // the floor: sandstone flags with blue-glass seams
    const tile = tileTex(THEMES[themeToday()]);
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(26, 26); tile.anisotropy = 4;
    const floorM = new THREE.MeshStandardMaterial({ map: tile, roughness: 0.92, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 18, 96), floorM); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    // the light, baked once onto one big canvas laid over the floor: darker toward the wall, the pillars' shadows,
    // warm pools under the braziers, and the floor's zones (mossy patches, glowing lava cracks, scorch rings)
    const NP = 64, pr = ARENA_R + 1.6, pil = [];
    for (let i = 0; i < NP; i++) { const a = (i / NP) * Math.PI * 2; pil.push([Math.cos(a) * pr, Math.sin(a) * pr, 0.8 + ((i * 37) % 7) / 14, a]); }
    const LM = ARENA_R + 18, lmTex = canvasTex(1024, 1024, (g, w) => { const k = w / (LM * 2), X = (x) => (x + LM) * k;
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, "rgba(8,12,34,0)"); gr.addColorStop(0.6, "rgba(8,12,34,0)"); gr.addColorStop(0.73, "rgba(8,12,34,.45)"); gr.addColorStop(1, "rgba(4,6,20,.95)"); g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.fillStyle = "rgba(10,10,30,.32)"; for (const [x, z] of pil) { g.save(); g.translate(X(x), X(z)); g.rotate(Math.atan2(z, x) + 0.6); g.beginPath(); g.ellipse(-6, 0, 22, 9, 0, 0, 7); g.fill(); g.restore(); }
      let sd = 31; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 18; i++) { const a = r() * 6.283, d = 10 + r() * 28, x = Math.cos(a) * d, z = Math.sin(a) * d, s = (2 + r() * 3) * k; const mg = g.createRadialGradient(X(x), X(z), 0, X(x), X(z), s); mg.addColorStop(0, "rgba(60,110,40,.45)"); mg.addColorStop(1, "rgba(60,110,40,0)"); g.fillStyle = mg; g.fillRect(X(x) - s, X(z) - s, s * 2, s * 2); }
    });
    // (drawn into the floor's own shader, not as a second see-through layer over the whole screen)
    floorM.onBeforeCompile = (sh) => { sh.uniforms.uLm = { value: lmTex }; sh.vertexShader = "varying vec2 vLmUv;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vLmUv = uv;");
      sh.fragmentShader = "uniform sampler2D uLm; varying vec2 vLmUv;\n" + sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n vec4 lmC = texture2D(uLm, vLmUv); diffuseColor.rgb = mix(diffuseColor.rgb, lmC.rgb, lmC.a);"); };
    // lava cracks: a few glowing scars on the floor (additive, they pulse)
    const crackTex = crackTexOf(THEMES[themeToday()]);
    const cracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 9);
    const crackPos = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283 + 0.4, d = 18 + (i % 3) * 7; crackPos.push([Math.cos(a) * d, Math.sin(a) * d]); cracks.setMatrixAt(i, m4.compose(vv.set(Math.cos(a) * d, 0.035, Math.sin(a) * d), qq.setFromEuler(ee.set(0, i * 1.7, 0)), ss.set(1 + (i % 2) * 0.4, 1, 1 + (i % 2) * 0.4))); }
    scene.add(cracks);
    const rune = canvasTex(512, 512, (g, w) => { const c = w / 2; g.translate(c, c); g.strokeStyle = "rgba(90,200,255,.85)"; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 236, 0, 7); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 210, 0, 7); g.stroke();
      g.beginPath(); g.arc(0, 0, 120, 0, 7); g.stroke(); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 120, Math.sin(a) * 120); g.lineTo(Math.cos(a + 2.1) * 120, Math.sin(a + 2.1) * 120); g.stroke(); }
      g.fillStyle = "rgba(140,230,255,.9)"; for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.save(); g.rotate(a); g.fillRect(-4, -224, 8, 14); g.restore(); }
      g.strokeStyle = "rgba(57,255,136,.7)"; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.stroke(); });
    const runeM = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: rune, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    runeM.rotation.x = -Math.PI / 2; runeM.position.y = 0.04; scene.add(runeM);
    // the wall: stone pillars with capitals and a glowing band, a low parapet between them, banners, braziers
    const stone = new THREE.MeshStandardMaterial({ color: 0x9a8a7a, roughness: 0.85, flatShading: true }), dark = new THREE.MeshStandardMaterial({ color: 0x5a4e64, roughness: 0.7, flatShading: true });
    const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.9, 5, 8), stone, NP), caps = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 0.5, 2), dark, NP), bases = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 0.6, 2.1), dark, NP);
    const wallM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.3, 0.7), stone, NP), fires = [], banners = [];
    for (let i = 0; i < NP; i++) { const [x, z, h, a] = pil[i]; qq.setFromEuler(ee.set(0, -a, 0));
      pillars.setMatrixAt(i, m4.compose(vv.set(x, 2.5 * h, z), qq, ss.set(1, h, 1))); caps.setMatrixAt(i, m4.compose(vv.set(x, 5 * h + 0.25, z), qq, ss.set(1, 1, 1))); bases.setMatrixAt(i, m4.compose(vv.set(x, 0.3, z), qq, ss.set(1, 1, 1)));
      const a2 = ((i + 0.5) / NP) * Math.PI * 2, seg = (2 * Math.PI * pr) / NP - 1.6; wallM.setMatrixAt(i, m4.compose(vv.set(Math.cos(a2) * pr, 0.65, Math.sin(a2) * pr), qq.setFromEuler(ee.set(0, -a2 + Math.PI / 2, 0)), ss.set(seg, 1, 1)));
      if (i % 4 === 0) fires.push([x * 0.985, 5 * h + 1.0, z * 0.985]); if (i % 8 === 2) banners.push([x * 0.975, 3.4 * h, z * 0.975, a, i]); }
    scene.add(pillars, caps, bases, wallM);
    const band = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.4, 0.12, 6, 160), new THREE.MeshBasicMaterial({ color: 0x38d8ff, toneMapped: false })); band.rotation.x = Math.PI / 2; band.position.y = 0.12; scene.add(band);
    const band2 = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.4, 0.55, 4, 160), new THREE.MeshBasicMaterial({ color: 0x2f86ff, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false })); band2.rotation.x = Math.PI / 2; band2.position.y = 0.1; scene.add(band2);
    const banTex = canvasTex(64, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#2f86ff"); gr.addColorStop(1, "#123072"); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w / 2, h - 18); g.lineTo(0, h); g.fill();
      g.strokeStyle = "#39ff88"; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, 48, 16, 0, 7); g.stroke(); g.strokeStyle = "#ffd23a"; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, 8); });
    const ban = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 2.8), new THREE.MeshStandardMaterial({ map: banTex, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x0a2a6a, emissiveIntensity: 0.5 }), banners.length);
    banners.forEach(([x, z, y, a], i) => ban.setMatrixAt(i, m4.compose(vv.set(x, y, z), qq.setFromEuler(ee.set(0, -a - Math.PI / 2, 0)), ss.set(1, 1, 1)))); scene.add(ban);
    const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 1.1, 7), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }), fires.length);
    const bowls = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.35, 0.45, 10), dark, fires.length);
    fires.forEach((p, i) => { flames.setMatrixAt(i, m4.compose(vv.set(...p), qq.identity(), ss.set(1, 1, 1))); bowls.setMatrixAt(i, m4.compose(vv.set(p[0], p[1] - 0.6, p[2]), qq, ss.set(1, 1, 1))); }); scene.add(flames, bowls);
    const glowTex = radial([[0, "rgba(255,190,90,.9)"], [0.4, "rgba(255,140,60,.35)"], [1, "rgba(255,120,40,0)"]]);
    const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), fires.length);
    fires.forEach((p, i) => halos.setMatrixAt(i, m4.compose(vv.set(p[0], p[1], p[2]), qq.setFromEuler(ee.set(-1.0, 0, 0)), ss.set(1, 1, 1)))); scene.add(halos);
    // the stands behind the wall: rows of dark seats rising away, a crowd of tiny lights
    const stands = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 16, ARENA_R + 4, 9, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 1, side: THREE.BackSide })); stands.position.y = 4.4; scene.add(stands);
    { const sp = []; for (let i = 0; i < 700; i++) { const a = Math.random() * 6.283, t = Math.random(), d = ARENA_R + 4 + t * 12; sp.push(Math.cos(a) * d, 0.6 + t * 8.5, Math.sin(a) * d); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd8a0, size: 0.35, transparent: true, opacity: 0.8 }))); }
    // crystals and rubble on the floor (looks only)
    { let sd = 99; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); const cr = [], rb = [];
      for (let i = 0; i < 46; i++) { const a = r() * 6.283, d = 9 + r() * (ARENA_R - 11); (i % 3 ? rb : cr).push([Math.cos(a) * d, Math.sin(a) * d, r() * 6.3, 0.5 + r() * 0.9]); }
      crystalM = new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x2a9cff, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true });
      const crM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), crystalM || new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x2a9cff, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true }), cr.length);
      cr.forEach(([x, z, ry, k], i) => crM.setMatrixAt(i, m4.compose(vv.set(x, 0.45 * k, z), qq.setFromEuler(ee.set(0.2, ry, 0.15)), ss.set(k * 0.7, k * 1.5, k * 0.7))));
      const rbM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 0.95, flatShading: true }), rb.length);
      rb.forEach(([x, z, ry, k], i) => rbM.setMatrixAt(i, m4.compose(vv.set(x, 0.12 * k, z), qq.setFromEuler(ee.set(0, ry, 0)), ss.set(k, k * 0.5, k * 0.9))));
      scene.add(crM, rbM); }
    // embers drifting up through the air (cheap points, moved each frame)
    const EN = 160, ep = new Float32Array(EN * 3); for (let i = 0; i < EN; i++) { ep[i * 3] = (Math.random() - 0.5) * 70; ep[i * 3 + 1] = Math.random() * 14; ep[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.BufferAttribute(ep, 3));
    const embers = new THREE.Points(eg, new THREE.PointsMaterial({ map: radial([[0, "rgba(255,220,150,1)"], [0.4, "rgba(255,150,60,.5)"], [1, "rgba(255,120,40,0)"]], 32), size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb070 }));
    embers.frustumCulled = false; scene.add(embers);
    // the stars
    const stars = new THREE.BufferGeometry(), spp = []; for (let i = 0; i < 500; i++) { const a = Math.random() * 6.283, el = 0.15 + Math.random() * 1.2, d = 150; spp.push(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d); }
    stars.setAttribute("position", new THREE.Float32BufferAttribute(spp, 3)); const starM = new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.7, fog: false, transparent: true, opacity: 0 }); scene.add(new THREE.Points(stars, starM));
    S = { scene, cam, flames, fires, runeM, cracks, crackPos, hemi, sun, floorM, embers, ep, starM, band, band2, theme: "" };
    applyTheme(themeToday());
    makeFx();
  }
  let crystalM = null;
  function tileTex(th) { const t = canvasTex(512, 512, (g, w) => {
      g.fillStyle = "#6f6a7e"; g.fillRect(0, 0, w, w); let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const off = y % 2 ? 64 : 0, px = x * 128 + off, py = y * 128, c = th.base + Math.floor(r() * 26);
        for (const dx of [0, -512]) { g.fillStyle = `rgb(${c + th.tile[0]},${c + th.tile[1]},${c + th.tile[2]})`; g.fillRect(px + dx + 4, py + 4, 120, 120);
          g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(px + dx + 4, py + 4, 120, 6); g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(px + dx + 4, py + 118, 120, 6);
          for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(70,50,30,${0.05 + r() * 0.08})`; g.beginPath(); g.arc(px + dx + 10 + r() * 108, py + 10 + r() * 108, 2 + r() * 5, 0, 7); g.fill(); }
          if (r() < 0.3) { g.strokeStyle = "rgba(40,28,18,.35)"; g.lineWidth = 2; g.beginPath(); let cx = px + dx + 20 + r() * 80, cy = py + 20 + r() * 80; g.moveTo(cx, cy); for (let q = 0; q < 5; q++) { cx += (r() - 0.5) * 40; cy += (r() - 0.5) * 40; g.lineTo(cx, cy); } g.stroke(); } } }
      g.strokeStyle = th.seam; g.lineWidth = 3; for (let y = 0; y <= 4; y++) { g.beginPath(); g.moveTo(0, y * 128 + 2); g.lineTo(w, y * 128 + 2); g.stroke(); }
      for (let y = 0; y < 4; y++) for (let x = 0; x <= 4; x++) { const px = x * 128 + (y % 2 ? 64 : 0) + 2; g.beginPath(); g.moveTo(px, y * 128); g.lineTo(px, y * 128 + 128); g.stroke(); } });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); t.anisotropy = 4; return t; }
  function crackTexOf(th) { return canvasTex(256, 256, (g, w) => { let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); g.lineCap = "round";
      for (let b = 0; b < 7; b++) { let x = w / 2, y = w / 2; const a0 = r() * 6.283; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 8; q++) { const a = a0 + (r() - 0.5) * 1.2; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
        g.strokeStyle = th.crack[0]; g.lineWidth = 9; g.stroke(); g.strokeStyle = th.crack[1]; g.lineWidth = 3; g.stroke(); } }); }
  /// today's arena: its floor, its cracks, its crystals, its rail and its sky
  function applyTheme(id) {
    if (!S || S.theme === id) return; const th = THEMES[id] || THEMES.desert, first = !S.theme; S.theme = id;
    if (!first) { const old = S.floorM.map; S.floorM.map = tileTex(th); S.floorM.needsUpdate = true; if (old) old.dispose(); const oc = S.cracks.material.map; S.cracks.material.map = crackTexOf(th); S.cracks.material.needsUpdate = true; if (oc) oc.dispose(); }
    if (crystalM) { crystalM.color.set(th.crystal[0]); crystalM.emissive.set(th.crystal[1]); }
    S.band.material.color.set(th.band); S.band2.material.color.set(th.band);
    th.sky.forEach((k, i) => { if (SKY[i]) { SKY[i].bg = k[0]; SKY[i].hs = k[1]; SKY[i].hg = k[2]; } });
  }
  // the sky for second t (lerped between the SKY keys)
  function sky(t) {
    let i = 0; while (i < SKY.length - 2 && t > SKY[i + 1].t) i++; const a = SKY[i], b = SKY[i + 1], k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    S.scene.background.set(a.bg).lerp(col2.set(b.bg), k); S.scene.fog.color.copy(S.scene.background);
    S.hemi.color.set(a.hs).lerp(col2.set(b.hs), k); S.hemi.groundColor.set(a.hg).lerp(col2.set(b.hg), k); S.hemi.intensity = a.hk + (b.hk - a.hk) * k;
    S.sun.color.set(a.sun).lerp(col2.set(b.sun), k); S.sun.intensity = a.sk + (b.sk - a.sk) * k; S.floorM.color.set(a.fl).lerp(col2.set(b.fl), k);
    S.starM.opacity = Math.max(0, Math.min(1, (t - 480) / 90)) * (t > 690 ? 0.4 : 1);
  }

  // ---------------- effects: pooled records, one InstancedMesh a kind, no allocation while playing ----------------
  // kinds: glow (a soft camera-facing sprite), beam (a soft ribbon from a to b, facing the camera, or flat on the floor),
  // ring and disc (flat on the floor), decal (dark, normal blending: scorch marks), num (damage numbers, digit sprites)
  let FX = null;
  const FXV = "attribute float aA; varying vec2 vUv; varying vec4 vC; void main(){ vUv = uv; vC = vec4(instanceColor, aA); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }";
  const fxMat = (map, add = true) => new THREE.ShaderMaterial({ uniforms: { map: { value: map } }, vertexShader: FXV, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, toneMapped: false,
    fragmentShader: add ? "uniform sampler2D map; varying vec2 vUv; varying vec4 vC; void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vC.a; gl_FragColor = vec4(vC.rgb * t.rgb * a, a); }"
      : "uniform sampler2D map; varying vec2 vUv; varying vec4 vC; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vC.rgb * t.rgb, t.a * vC.a); }" });
  function fxPool(geo, mat, n, order = 2) {
    const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.renderOrder = order; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const aA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); aA.setUsage(THREE.DynamicDrawUsage); geo.setAttribute("aA", aA);
    S.scene.add(m); const recs = []; for (let i = 0; i < n; i++) recs.push({ x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, vx: 0, vy: 0, vz: 0, s: 1, s0: 0, c: 0, k: 1, t: 0, life: 1, f: 0, d: 0 });
    return { m, aA, recs, n: 0, cap: n };
  }
  // flags
  const GROW = 1, PULSE = 2, SHRINK = 4, HOLD = 8, EASE = 16, GRAV = 32, FALL = 64, FLAT = 128, SPIN = 256, ONE = 512; // ONE: drawn for one frame (made on the frame's last step only)
  let lastStep = true, stepped = false; // stepped: the sim moved this frame (else the one-frame effects stay up)
  function makeFx() {
    const glowT = radial([[0, "rgba(255,255,255,1)"], [0.18, "rgba(255,255,255,.85)"], [0.45, "rgba(255,255,255,.25)"], [1, "rgba(255,255,255,0)"]]);
    const beamT = canvasTex(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(0.65, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const ringT = radial([[0, "rgba(255,255,255,0)"], [0.78, "rgba(255,255,255,0)"], [0.9, "rgba(255,255,255,1)"], [0.95, "rgba(255,255,255,.4)"], [1, "rgba(255,255,255,0)"]], 256);
    const discT = radial([[0, "rgba(255,255,255,.55)"], [0.75, "rgba(255,255,255,.35)"], [0.93, "rgba(255,255,255,.9)"], [1, "rgba(255,255,255,0)"]], 256);
    const decalT = radial([[0, "rgba(20,10,8,.85)"], [0.5, "rgba(30,16,10,.6)"], [1, "rgba(30,16,10,0)"]]);
    const shT = radial([[0, "rgba(0,0,0,.6)"], [0.55, "rgba(0,0,0,.32)"], [1, "rgba(0,0,0,0)"]]);
    // the digits 0–9 on one strip (a bold outlined font)
    const digT = canvasTex(640, 96, (g) => { g.font = "900 84px Sora, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      for (let d = 0; d < 10; d++) { g.lineWidth = 14; g.strokeStyle = "rgba(10,10,30,.95)"; g.strokeText(String(d), d * 64 + 32, 50); g.fillStyle = "#fff"; g.fillText(String(d), d * 64 + 32, 50); } });
    const flat = (g) => g.rotateX(-Math.PI / 2);
    const numGeo = new THREE.PlaneGeometry(1, 1.5), numMat = fxMat(digT, false);
    numMat.vertexShader = "attribute float aA; attribute float aD; varying vec2 vUv; varying vec4 vC; void main(){ vUv = vec2((aD + uv.x) / 10.0, uv.y); vC = vec4(instanceColor, aA); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }";
    FX = {
      glow: fxPool(new THREE.PlaneGeometry(1, 1), fxMat(glowT), Q ? 900 : 500, 4),
      beam: fxPool(new THREE.PlaneGeometry(1, 1), fxMat(beamT), Q ? 700 : 400, 3),
      ring: fxPool(flat(new THREE.PlaneGeometry(2, 2)), fxMat(ringT), 200, 2),
      disc: fxPool(flat(new THREE.PlaneGeometry(2, 2)), fxMat(discT), 80, 2),
      decal: fxPool(flat(new THREE.PlaneGeometry(2, 2)), fxMat(decalT, false), 40, 1),
      num: fxPool(numGeo, numMat, 420, 6),
    };
    const aD = new THREE.InstancedBufferAttribute(new Float32Array(420), 1); aD.setUsage(THREE.DynamicDrawUsage); numGeo.setAttribute("aD", aD); FX.num.aD = aD; FX.nums = []; for (let i = 0; i < 90; i++) FX.nums.push({ x: 0, y: 0, z: 0, t: 0, v: 0, c: 0, s: 1, on: false });
    FX.gem = (() => { const m = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2266ff, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.2, flatShading: true }), 900); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, col); S.scene.add(m); return m; })();
    FX.shadow = (() => { const m = new THREE.InstancedMesh(flat(new THREE.PlaneGeometry(2, 2)), new THREE.MeshBasicMaterial({ map: shT, transparent: true, depthWrite: false }), 320); m.count = 0; m.frustumCulled = false; m.renderOrder = 1; S.scene.add(m); return m; })();
    FX.chest = (() => { const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xb07a10, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.7 }), wood = new THREE.MeshStandardMaterial({ color: 0x7a3cff, roughness: 0.5, emissive: 0x3a1a99, emissiveIntensity: 0.5 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood); b.position.y = 0.35; const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = 0.7;
      const bandM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.84), gold); bandM.position.y = 0.55; const lock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.1), gold); lock.position.set(0, 0.55, 0.42); g.add(b, lid, bandM, lock); g.visible = false; S.scene.add(g); return g; })();
    FX.crate = (() => { const t = canvasTex(64, 64, (g, w) => { g.fillStyle = "#8a5a32"; g.fillRect(0, 0, w, w); g.strokeStyle = "#5a3418"; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, w - 6); g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, w - 4); g.moveTo(w - 4, 4); g.lineTo(4, w - 4); g.stroke(); g.fillStyle = "#ffc23a"; g.fillRect(0, w / 2 - 4, w, 8); });
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, emissive: 0x3a2a10, emissiveIntensity: 0.4 }), 4); m.count = 0; m.frustumCulled = false; S.scene.add(m); return m; })();
    FX.heroShadow = new THREE.Mesh(flat(new THREE.PlaneGeometry(1.6, 1.6)), new THREE.MeshBasicMaterial({ map: shT, transparent: true, depthWrite: false })); FX.heroShadow.position.y = 0.03; S.scene.add(FX.heroShadow);
    FX.magnet = new THREE.Mesh(flat(new THREE.PlaneGeometry(2, 2)), new THREE.MeshBasicMaterial({ map: ringT, color: 0x8ff0ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); FX.magnet.position.y = 0.05; S.scene.add(FX.magnet);
    FX.shieldM = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); FX.shieldM.visible = false; S.scene.add(FX.shieldM);
  }
  /// a short-lived effect; returns its record (or null when the pool is full: the effect is skipped, never the game)
  function fx(kind, x, y, z, s, c, life, f = 0, k = 1) { if (f & ONE && !lastStep) return null; const P = FX[kind]; if (P.n >= P.cap) return null; const r = P.recs[P.n++]; r.x = x; r.y = y; r.z = z; r.s = s; r.s0 = 0; r.c = c; r.life = life; r.t = 0; r.f = f; r.k = k; r.vx = r.vy = r.vz = 0; return r; }
  const glow = (x, y, z, s, c, life, f, k) => fx("glow", x, y, z, s, c, life, f, k);
  function beam(ax, ay, az, bx, by, bz, w, c, life, f = 0, k = 1) { const r = fx("beam", ax, ay, az, w, c, life, f, k); if (r) { r.x2 = bx; r.y2 = by; r.z2 = bz; } return r; }
  function ring(x, z, r0, r1, c, life, f = 0, k = 1) { const r = fx("ring", x, 0.06, z, r1, c, life, f, k); if (r) r.s0 = r0; return r; }
  function disc(x, z, r1, c, life, f = 0, k = 1) { return fx("disc", x, 0.05, z, r1, c, life, f, k); }
  function sparks(x, y, z, c, n, sp = 5) { if (Q === 0) n = Math.ceil(n / 3); else if (Q === 1) n = Math.ceil(n / 1.6); for (let i = 0; i < n; i++) { const r = glow(x, y, z, 0.18 + Math.random() * 0.14, c, 0.3 + Math.random() * 0.25, GRAV | SHRINK); if (!r) return; const a = Math.random() * 6.283, v = sp * (0.4 + Math.random() * 0.8); r.vx = Math.cos(a) * v; r.vz = Math.sin(a) * v; r.vy = 2 + Math.random() * 4; } }
  function num(x, y, z, v, c, big) { const n = FX.nums.find((o) => !o.on); if (!n) return; n.on = true; n.x = x + (Math.random() - 0.5) * 0.4; n.y = y; n.z = z; n.t = 0; n.v = Math.max(1, Math.round(v)); n.c = c; n.s = big ? 0.62 : 0.42; }
  const camQ = new THREE.Quaternion();
  function drawFx(dt) {
    camQ.copy(S.cam.quaternion); S.cam.getWorldPosition(vD);
    for (const kind of ["glow", "beam", "ring", "disc", "decal"]) {
      const P = FX[kind], m = P.m, A = P.aA.array; let w = 0;
      for (let i = 0; i < P.n; i++) {
        const r = P.recs[i]; if (r.f & ONE) { if (stepped) { if (r.t < 0) continue; r.t = -1; } } else { r.t += dt; if (r.t >= r.life) continue; }
        if (w !== i) { const tmp = P.recs[w]; P.recs[w] = r; P.recs[i] = tmp; }
        const k = r.f & ONE ? 0 : r.t / r.life; let fade = r.f & ONE ? 1 : r.f & HOLD ? (k < 0.8 ? 1 : (1 - k) / 0.2) : 1 - k;
        if (r.f & GRAV) { r.vy -= 14 * dt; r.x += r.vx * dt; r.y = Math.max(0.05, r.y + r.vy * dt); r.z += r.vz * dt; }
        else if (r.vx || r.vz || r.vy) { r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; }
        if (r.f & FALL) { r.x = r.x2 + (r.vx - r.x2) * k; r.y = r.y2 * (1 - k * k) + 0.4; r.z = r.z2 + (r.vz - r.z2) * k; fade = 1; }
        if (kind === "glow") { let s = r.s * (r.f & PULSE ? 1 + Math.sin(r.t * 30) * 0.15 : 1) * (r.f & SHRINK ? 1 - k * 0.8 : 1) * (r.f & GROW ? 1 + k * 1.5 : 1); m.setMatrixAt(w, m4.compose(vv.set(r.x, r.y, r.z), camQ, ss.set(s, s, s))); }
        else if (kind === "beam") {
          vA.set(r.x2 - r.x, r.y2 - r.y, r.z2 - r.z); const len = vA.length() || 0.001; vA.multiplyScalar(1 / len); const wd = r.s * (r.f & GROW ? 1 + k : 1) * (r.f & PULSE ? 1 + Math.sin(r.t * 40) * 0.25 : 1);
          vC.set((r.x + r.x2) / 2, (r.y + r.y2) / 2, (r.z + r.z2) / 2);
          if (r.f & FLAT) vB.crossVectors(UP, vA); else { vB.subVectors(vD, vC).normalize(); vB.crossVectors(vB, vA); }
          vB.normalize();
          const zx = vA.y * vB.z - vA.z * vB.y, zy = vA.z * vB.x - vA.x * vB.z, zz = vA.x * vB.y - vA.y * vB.x;
          m4.set(vA.x * len, vB.x * wd, zx, vC.x, vA.y * len, vB.y * wd, zy, vC.y, vA.z * len, vB.z * wd, zz, vC.z, 0, 0, 0, 1); m.setMatrixAt(w, m4);
        } else { const rr = r.s0 ? r.s0 + (r.s - r.s0) * (r.f & EASE ? 1 - (1 - k) * (1 - k) : k) : r.s; qq.identity(); if (r.f & SPIN) qq.setFromAxisAngle(UP, r.t * 3); m.setMatrixAt(w, m4.compose(vv.set(r.x, r.y, r.z), qq, ss.set(rr, 1, rr))); }
        col.set(r.c); m.instanceColor.setXYZ(w, col.r, col.g, col.b); A[w] = Math.max(0, fade) * r.k; w++;
      }
      P.n = w; m.count = w; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; P.aA.needsUpdate = true;
    }
    // numbers: each digit its own sprite, rising and fading
    const P = FX.num, m = P.m, A = P.aA.array, D = FX.num.aD.array; let w = 0;
    for (const n of FX.nums) { if (!n.on) continue; n.t += dt; if (n.t > 0.75) { n.on = false; continue; } const str = String(n.v), L2 = str.length, pop = 1 + Math.max(0, 0.12 - n.t) * 5, sc = n.s * pop;
      vA.set(1, 0, 0).applyQuaternion(camQ); const y = n.y + n.t * 1.4;
      for (let i = 0; i < L2 && w < P.cap; i++) { const off = (i - (L2 - 1) / 2) * sc * 0.72; m.setMatrixAt(w, m4.compose(vv.set(n.x + vA.x * off, y + vA.y * off, n.z + vA.z * off), camQ, ss.set(sc, sc, sc)));
        col.set(n.c); m.instanceColor.setXYZ(w, col.r, col.g, col.b); A[w] = Math.min(1, (0.75 - n.t) * 4); D[w] = str.charCodeAt(i) - 48; w++; } }
    P.n = w; m.count = w; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; P.aA.needsUpdate = true; FX.num.aD.needsUpdate = true;
  }

  // ---------------- the monsters: baked to vertex textures ----------------
  async function loadPack() {
    if (pack) return pack; if (packP) return packP;
    packP = (async () => {
      const loader = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null; if (!loader) throw new Error("no model loader");
      const g = await loader.loadAsync("models/world/survivors/monsters.glb?v=" + (ctx.ver || "1"));
      // the baked frames are kept on this device (IndexedDB), so only the first visit after an update bakes them (1–2 s
      // on a phone); the models' file still comes for its colours
      const key = "vat-" + (ctx.ver || "1") + "-" + ROLES.map((r) => r[1]).join(""), cache = await idbGet(key).catch(() => null), fresh = {};
      const out = {}; let n = 0;
      for (const id of Object.keys(MON)) { const root = g.scene.getObjectByName(id); if (!root) continue; let src = null; root.traverse((o) => { if (!src && o.isMesh) src = o.material; });
        let d = cache && cache[id]; if (!d) { d = bakeData(root, g.animations.filter((a) => a.name.startsWith(id + ":")), MON[id]); fresh[id] = d; if (++n % 2 === 0) await new Promise((ok) => setTimeout(ok, 0)); }
        out[id] = makeKind(id, d, src, MON[id]); }
      if (Object.keys(fresh).length) idbPut(key, { ...(cache || {}), ...fresh }).catch(() => {});
      pack = out; return out;
    })().catch((e) => { packP = null; throw e; });
    return packP;
  }
  // a small key/value store on this device (one object store); fails quietly (private windows, old browsers)
  const idb = () => new Promise((ok, no) => { try { const r = indexedDB.open("arc-surv", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } });
  async function idbGet(k) { const db = await idb(); return new Promise((ok, no) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => no(q.error); }); }
  async function idbPut(k, v) { const db = await idb(); await new Promise((ok, no) => { const tx = db.transaction("kv", "readwrite"), st0 = tx.objectStore("kv"); st0.clear(); st0.put(v, k); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); }
  function bakeData(root, clips, spec) {
    const parent = root.parent; if (parent) parent.remove(root); root.position.set(0, 0, 0); root.updateMatrixWorld(true);
    const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const offs = []; let V = 0; for (const m of meshes) { offs.push(V); V += m.geometry.attributes.position.count; }
    const idx = [], uv = new Float32Array(V * 2);
    meshes.forEach((m, k) => { const gg = m.geometry, ia = gg.index, u = gg.attributes.uv;
      if (ia) for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i) + offs[k]); else for (let i = 0; i < gg.attributes.position.count; i++) idx.push(i + offs[k]);
      if (u) for (let i = 0; i < u.count; i++) { uv[(offs[k] + i) * 2] = u.getX(i); uv[(offs[k] + i) * 2 + 1] = u.getY(i); } });
    const mixer = new THREE.AnimationMixer(root), byRole = {}; for (const c of clips) byRole[c.name.split(":")[1]] = c;
    const frames = [], R = {}; let F = 0;
    const tmp = new THREE.BufferGeometry(); tmp.setIndex(idx); const P = new Float32Array(V * 3); tmp.setAttribute("position", new THREE.BufferAttribute(P, 3));
    const pv = new THREE.Vector3();
    for (const [role, n, loop] of ROLES) {
      const clip = byRole[role] || byRole.move; R[role] = { f0: F, n, dur: clip ? clip.duration : 1, loop };
      for (let i = 0; i < n; i++) {
        mixer.stopAllAction(); if (clip) { const a = mixer.clipAction(clip); a.reset(); a.play(); a.time = clip.duration * (loop ? i / n : i / (n - 1)); mixer.update(0); }
        root.updateMatrixWorld(true);
        meshes.forEach((m, k) => { const pa = m.geometry.attributes.position;
          for (let j = 0; j < pa.count; j++) { pv.fromBufferAttribute(pa, j); if (m.isSkinnedMesh) m.applyBoneTransform(j, pv); pv.applyMatrix4(m.matrixWorld); const o = (offs[k] + j) * 3; P[o] = pv.x; P[o + 1] = pv.y; P[o + 2] = pv.z; } });
        tmp.computeVertexNormals(); frames.push(P.slice(), tmp.attributes.normal.array.slice()); F++;
      }
    }
    mixer.stopAllAction();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; const f0 = frames[0];
    for (let j = 0; j < V; j++) { const x = f0[j * 3], y = f0[j * 3 + 1], z = f0[j * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const k = spec.h / Math.max(0.01, y1 - y0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const W = 1024, H = Math.ceil((V * F) / W), data = new Float32Array(W * H * 4);
    for (let f = 0; f < F; f++) { const p = frames[f * 2], nn = frames[f * 2 + 1];
      for (let j = 0; j < V; j++) { const t = (f * V + j) * 4; data[t] = (p[j * 3] - cx) * k; data[t + 1] = (p[j * 3 + 1] - y0) * k; data[t + 2] = (p[j * 3 + 2] - cz) * k;
        let nx = nn[j * 3], ny = nn[j * 3 + 1], nz = nn[j * 3 + 2]; const s = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1; nx /= s; ny /= s; nz /= s;
        if (nz < 0) { const ox = (1 - Math.abs(ny)) * (nx >= 0 ? 1 : -1), oy = (1 - Math.abs(nx)) * (ny >= 0 ? 1 : -1); nx = ox; ny = oy; }
        data[t + 3] = Math.round((nx * 0.5 + 0.5) * 4095) * 4096 + Math.round((ny * 0.5 + 0.5) * 4095); } }
    return { data, W, H, idx: new Uint32Array(idx), uv, R, V };
  }
  /// a kind from its baked frames: the texture, the geometry, the material (and on a PC the outline)
  function makeKind(id, d, src, spec) {
    const { data, W, H, idx, uv, R, V } = d;
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const geo = new THREE.BufferGeometry(); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const base = new Float32Array(V * 3); for (let j = 0; j < V; j++) { base[j * 3] = data[j * 4]; base[j * 3 + 1] = data[j * 4 + 1]; base[j * 3 + 2] = data[j * 4 + 2]; }
    geo.setAttribute("position", new THREE.BufferAttribute(base, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    const map = src && src.map ? src.map : null;
    if (map && !map.userData.swatch) { map.userData.swatch = 1; map.minFilter = map.magFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true; } // a palette of swatches: mipmaps would blend neighbours into mud
    const MatT = phone() || ctx.low ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial; // phones: Lambert (cheaper a pixel), PCs the PBR one
    const mat = new MatT({ map, color: map ? 0xffffff : (src && src.color ? src.color.getHex() : 0xcccccc), ...(MatT === THREE.MeshStandardMaterial ? { roughness: 0.62, metalness: 0.0 } : {}) });
    // the shader: the vertex's place and normal from the texture (two frames, blended), a squash when hit, a rim light
    // that keeps them readable in a crowd, a white flash when hit, and a burning dissolve when knocked out
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uVat = { value: tex }; sh.uniforms.uV = { value: V }; sh.uniforms.uH = { value: spec.h };
      sh.vertexShader = "uniform highp sampler2D uVat; uniform int uV; uniform float uH; attribute vec4 aAnim; attribute vec2 aFx; varying float vFlash; varying float vDis; varying float vRage; varying vec3 vOp;\n" +
        "vec4 vatAt(int f){ int i = f * uV + gl_VertexID; return texelFetch(uVat, ivec2(i % 1024, i / 1024), 0); }\n" +
        "vec3 octN(float w){ float a = floor(w / 4096.0); float b = w - a * 4096.0; vec2 p = vec2(a, b) / 4095.0 * 2.0 - 1.0; vec3 n = vec3(p, 1.0 - abs(p.x) - abs(p.y)); float t = max(-n.z, 0.0); n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t; return normalize(n); }\n" + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace("#include <beginnormal_vertex>", "vec4 vA = vatAt(int(aAnim.x)); vec4 vB = vatAt(int(aAnim.y)); vec3 objectNormal = normalize(mix(octN(vA.w), octN(vB.w), aAnim.z));")
        .replace("#include <begin_vertex>", "vec3 transformed = mix(vA.xyz, vB.xyz, aAnim.z); float sq = aAnim.w * 0.18; transformed.y *= 1.0 - sq; transformed.xz *= 1.0 + sq * 0.6; vFlash = aAnim.w; vDis = aFx.x; vRage = aFx.y; vOp = transformed / uH;");
      sh.fragmentShader = "varying float vFlash; varying float vDis; varying float vRage; varying vec3 vOp;\n" + sh.fragmentShader
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n float svN = fract(sin(dot(floor(vOp * 14.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453); if (vDis > 0.0 && svN < vDis) discard;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.92, 0.85) * vFlash;\n float svR = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0); totalEmissiveRadiance += vec3(0.35, 0.75, 1.0) * pow(svR, 3.0) * 0.55;\n if (vDis > 0.0 && svN < vDis + 0.12) totalEmissiveRadiance += vec3(3.0, 1.3, 0.3);\n totalEmissiveRadiance += vec3(1.0, 0.08, 0.04) * vRage * (0.35 + 0.25 * svR);");
    };
    mat.customProgramCacheKey = () => "vat4";
    // the outline (PCs at full quality): the same frames pushed out along the normal, drawn back faces only, dark
    let line = null;
    if (!phone() && !ctx.low) { line = new THREE.MeshBasicMaterial({ color: 0x140a24, side: THREE.BackSide });
      line.onBeforeCompile = (sh) => { sh.uniforms.uVat = { value: tex }; sh.uniforms.uV = { value: V }; sh.uniforms.uO = { value: 0.022 * spec.h + 0.012 };
        sh.vertexShader = "uniform highp sampler2D uVat; uniform int uV; uniform float uO; attribute vec4 aAnim; attribute vec2 aFx; varying float vDis; varying vec3 vOp;\n" +
          "vec4 vatAt(int f){ int i = f * uV + gl_VertexID; return texelFetch(uVat, ivec2(i % 1024, i / 1024), 0); }\n" +
          "vec3 octN(float w){ float a = floor(w / 4096.0); float b = w - a * 4096.0; vec2 p = vec2(a, b) / 4095.0 * 2.0 - 1.0; vec3 n = vec3(p, 1.0 - abs(p.x) - abs(p.y)); float t = max(-n.z, 0.0); n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t; return normalize(n); }\n" + sh.vertexShader.replace("#include <begin_vertex>",
          "vec4 vA = vatAt(int(aAnim.x)); vec4 vB = vatAt(int(aAnim.y)); vec3 transformed = mix(vA.xyz, vB.xyz, aAnim.z) + normalize(mix(octN(vA.w), octN(vB.w), aAnim.z)) * uO; vDis = aFx.x; vOp = transformed / " + spec.h.toFixed(2) + ";");
        sh.fragmentShader = "varying float vDis; varying vec3 vOp;\n" + sh.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n float svN = fract(sin(dot(floor(vOp * 14.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453); if (vDis > 0.0) discard;"); };
      line.customProgramCacheKey = () => "vatline"; }
    return { id, geo, mat, line, tex, R, V, spec, mesh: null, edge: null };
  }
  function meshOf(kd) {
    if (kd.mesh) return kd.mesh; const n = kd.spec.boss ? 2 : kd.spec.elite ? 16 : 200;
    const m = new THREE.InstancedMesh(kd.geo, kd.mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); a.setUsage(THREE.DynamicDrawUsage); kd.geo.setAttribute("aAnim", a); kd.anim = a;
    const b = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); b.setUsage(THREE.DynamicDrawUsage); kd.geo.setAttribute("aFx", b); kd.fx = b;
    S.scene.add(m); kd.mesh = m;
    if (kd.line) { const e = new THREE.InstancedMesh(kd.geo, kd.line, n); e.instanceMatrix = m.instanceMatrix; e.count = 0; e.frustumCulled = false; S.scene.add(e); kd.edge = e; } // shares the instances' places
    return m;
  }
  const fr = [0, 0, 0];
  function frameOf(kd, role, t) { const r = kd.R[role]; let f = (t / r.dur) * (r.loop ? r.n : r.n - 1); if (r.loop) { f %= r.n; if (f < 0) f += r.n; const a = Math.floor(f); fr[0] = r.f0 + a; fr[1] = r.f0 + ((a + 1) % r.n); fr[2] = f - a; return fr; }
    f = Math.min(r.n - 1, Math.max(0, f)); const a = Math.floor(f); fr[0] = r.f0 + a; fr[1] = r.f0 + Math.min(r.n - 1, a + 1); fr[2] = f - a; return fr; }

  // ---------------- the run's state (pooled: nothing is made while playing) ----------------
  let R = null, uid = 0;
  const mons = [], monFree = [], gems = [], gemFree = [], shots = [], shotFree = [], foes = [], foeFree = [], zones = [], zoneFree = [], events = [];
  const grid = new Map(), cells = [], CELL = 2.5;
  const key = (x, z) => ((Math.floor(x / CELL) + 64) << 8) | (Math.floor(z / CELL) + 64);
  const take2 = (free) => free.pop() || {};
  const TOOLS = { reroll: 3, banish: 2, skip: 1 }; // b-svx: card tools a run (the owner's update art: Reroll 3, Banish 2, Skip 1)
  function newRun() {
    const h = HEROES[pick.hero] || HEROES[0], d = RULES.DIFF[pick.diff] || RULES.DIFF.normal;
    clearPools();
    R = { reroll: TOOLS.reroll, banish: TOOLS.banish, skip: TOOLS.skip, ban: {}, banMode: false, t: 0, hero: h, diff: pick.diff, D: d, x: 0, z: 0, vx: 0, vz: 0, face: 0, hp: 100, hpMax: 100, lv: 1, xp: 0, need: needXp(1), kills: 0, bosses: 0, bossNext: 0, boss: null, clear: false, over: false,
      w: {}, p: {}, evo: {}, cds: {}, orbA: 0, bladeA: 0, spawnT: 0, eliteT: 45, swarmAt: [30, 120, 240, 300, 420, 480, 600, 660], dashT: 0, dashCd: 0, hurtT: 0, vampN: 0, pendingLv: 0, pendingChest: 0, bonusDmg: 1, chest: null, said: {},
      streak: 0, streakT: 0, shield: 0, shieldT: 0, revived: false, infT: 25, dmgBy: {}, loot: { hp: 0, sp: 0, scrap: 0 }, stop: 0, focus: null, drones: [], skillCd: 6, overT: 0, crates: [], crateT: 20, lavaT: 90 };
    R.w[h.w] = 1;
  }
  function clearPools() {
    while (mons.length) monFree.push(mons.pop()); while (gems.length) gemFree.push(gems.pop()); while (shots.length) shotFree.push(shots.pop()); while (foes.length) foeFree.push(foes.pop()); while (zones.length) zoneFree.push(zones.pop()); events.length = 0;
    if (FX) { for (const k of ["glow", "beam", "ring", "disc", "decal"]) FX[k].n = 0; for (const n of FX.nums) n.on = false; FX.chest.visible = false; FX.shadow.count = 0; FX.gem.count = 0; FX.shieldM.visible = false; if (FX.crate) FX.crate.count = 0; }
    if (pack) for (const id in pack) if (pack[id].mesh) pack[id].mesh.count = 0;
  }
  /// later, on the game's own clock (paused with it): a boss's slam, a meteor's landing
  function later(s, kind, a, b, c, d, e) { events.push({ at: R.t + s, kind, a, b, c, d, e }); }
  const pv = (k) => (R.p[k] || 0);
  const stat = {
    dmg: () => R.hero.dmg * (1 + 0.1 * pv("power")) * R.bonusDmg * (1 + Math.min(0.3, R.streak * 0.012 * pv("streak"))) * (pv("berserk") && R.hp < R.hpMax * 0.5 ? 1 + 0.12 * pv("berserk") : 1),
    area: () => R.hero.area * (1 + 0.1 * pv("heavy")),
    reach: () => 1 + 0.12 * pv("range"),
    cd: () => 1 - 0.06 * pv("cool"),
    rate: () => 1 + 0.1 * pv("rapid"),
    crit: () => 0.05 + 0.06 * pv("crit"),
    critK: () => 2 + 0.25 * pv("critp") + (R.evo.eclipse ? 0.5 : 0),
    speed: () => 7 * R.hero.speed * (1 + 0.07 * pv("speed")),
    armor: () => 1 - 0.07 * pv("armor"),
    magnet: () => 2.2 * (1 + 0.4 * pv("magnet")),
    regen: () => 0.4 * pv("recov"),
    extra: () => pv("double"),
  };

  // ---------------- monsters ----------------
  function spawn(id, x, z, o) {
    const kd = pack[id]; if (!kd) return null; const sp = MON[id];
    const hp = sp.hp * (sp.boss ? 1 : hpK(R.t)) * R.D.hp * (o && o.hpK ? o.hpK : 1), m = take2(monFree);
    m.id = id; m.kd = kd; m.uid = ++uid; m.x = x; m.z = z; m.vx = 0; m.vz = 0; m.hp = hp; m.hpMax = hp; m.r = sp.r; m.sp = sp.sp * (o && o.spK ? o.spK : 1) * (0.9 + Math.random() * 0.2); m.dmg = sp.dmg * R.D.dmg; m.xp = sp.xp; m.fly = sp.fly || 0;
    m.boss = !!sp.boss; m.elite = !!sp.elite; m.st = "move"; m.at = Math.random() * 2; m.face = Math.atan2(R.x - x, R.z - z); m.flash = 0; m.atkCd = 0.5 + Math.random() * 0.5; m.slow = 0; m.born = 0; m.bob = Math.random() * 6;
    m.dir = o && o.dir ? o.dir : null; m.bt = 0; m.bn = 0; m.charge = null; m.rage = false; m.oT = -9; m.bT = -9; m.zT = -9; m.dis = 0;
    mons.push(m); meshOf(kd); if (Q && !m.boss) ring(x, z, 0.2, m.r * 2, m.elite ? 0xff5ad8 : 0xb48cff, 0.5, EASE, 0.8); return m;
  }
  function spawnRing() {
    const want = Math.min(CAP(), Math.round(crowdAt(R.t) * R.D.rate * (phone() ? 0.8 : 1)));
    let alive = 0; for (const m of mons) if (m.st !== "die" && !m.boss) alive++;
    if (alive >= want) return;
    const pool = poolAt(R.t), tot = pool.reduce((s, x) => s + x[1], 0), n = Math.min(6, want - alive);
    for (let i = 0; i < n; i++) { let r = Math.random() * tot, id = pool[0][0]; for (const [k, w] of pool) { if ((r -= w) <= 0) { id = k; break; } } edgePoint(); spawn(id, ep.x, ep.z); }
  }
  const ep = { x: 0, z: 0 };
  function edgePoint(d) { const a = Math.random() * Math.PI * 2, dist = d || (phone() ? 15 : 19) + Math.random() * 4; let x = R.x + Math.cos(a) * dist, z = R.z + Math.sin(a) * dist; const rr = Math.hypot(x, z); if (rr > ARENA_R - 1.5) { x *= (ARENA_R - 1.5) / rr; z *= (ARENA_R - 1.5) / rr; } ep.x = x; ep.z = z; return ep; }
  // the crowds: a ring of mixed kinds, a wall that sweeps across, a fast stampede from one side
  function swarm(i) {
    const pool = poolAt(R.t), pk = () => pool[Math.floor(Math.random() * pool.length)][0], kind = i % 3;
    if (kind === 0) { const n = phone() ? 24 : 36; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, x = R.x + Math.cos(a) * 13, z = R.z + Math.sin(a) * 13; if (Math.hypot(x, z) < ARENA_R - 1) spawn(k % 3 ? pk() : pool[0][0], x, z, { spK: 0.9 }); } banner(T("Swarm!"), ""); }
    else { const a = Math.random() * 6.283, cx = R.x + Math.cos(a) * 17, cz = R.z + Math.sin(a) * 17, n = phone() ? 14 : 22, px = -Math.sin(a), pz = Math.cos(a), id = pk();
      for (let k = 0; k < n; k++) { const off = (k - n / 2) * (kind === 1 ? 1.3 : 0.9), x = cx + px * off, z = cz + pz * off; if (Math.hypot(x, z) < ARENA_R - 1) spawn(id, x, z, kind === 2 ? { spK: 1.9, dir: { x: -Math.cos(a), z: -Math.sin(a) } } : { spK: 1.1 }); }
      if (kind === 2) banner(T("Stampede!"), ""); }
  }
  function hitMon(m, dmg, src, o) {
    if (m.st === "die" || m.hp <= 0) return false;
    let d = dmg * stat.dmg(); const crit = Math.random() < stat.crit(); if (crit) d *= stat.critK(); if ((m.boss || m.elite) && pv("slayer")) d *= 1 + 0.15 * pv("slayer");
    m.hp -= d; m.flash = 1; R.dmgBy[src] = (R.dmgBy[src] || 0) + Math.min(d, m.hp + d);
    if (o && o.kb && !m.boss) { const dx = m.x - (o.fx != null ? o.fx : R.x), dz = m.z - (o.fz != null ? o.fz : R.z), l = Math.hypot(dx, dz) || 1; const kb = m.elite ? o.kb * 0.4 : o.kb; m.vx += (dx / l) * kb; m.vz += (dz / l) * kb; }
    if (o && o.slow) m.slow = Math.max(m.slow, o.slow);
    const big = crit || m.boss; if (Q || big || Math.random() < 0.5) num(m.x, m.fly + MON[m.id].h * 0.95, m.z, d, crit ? 0xffd23a : m.boss ? 0xffb0bf : 0xffffff, big);
    if (crit && (m.boss || d > 60)) R.stop = Math.max(R.stop, 0.045);
    if (m.hp <= 0) kill(m); return true;
  }
  function addGem(x, z, v) { const g = take2(gemFree); g.x = x; g.z = z; g.v = v; g.t = 0; g.pull = false; gems.push(g); }
  function kill(m) {
    m.st = "die"; m.at = 0; m.hp = 0; m.dis = 0; R.kills++;
    sparks(m.x, m.fly + 0.6, m.z, m.elite ? 0xff8ae4 : 0xffd08a, m.elite ? 10 : 4, 4);
    let v = m.xp; if (pv("lucky") && Math.random() < 0.04 * pv("lucky")) v *= 5; addGem(m.x, m.z, v);
    if (m.elite) { for (let k = 0; k < 3; k++) addGem(m.x + (Math.random() - 0.5) * 2, m.z + (Math.random() - 0.5) * 2, 2); if (Math.random() < 0.35 + 0.1 * pv("lucky")) dropChest(m.x, m.z); }
    if (pv("vamp") && ++R.vampN >= [14, 12, 10, 8, 6][pv("vamp") - 1]) { R.vampN = 0; heal(2 + pv("vamp")); }
    if (pv("streak")) { R.streak = Math.min(25, R.streak + 1); R.streakT = 1.2; }
    if (m.boss) { R.bosses++; R.boss = null; dropChest(m.x, m.z, true); snd("win"); shakeK = 1.2; flashUi("boss"); slowMo = 1.0; R.stop = 0.12; sparks(m.x, 2, m.z, 0xffd23a, 40, 9); ring(m.x, m.z, 1, 12, 0xffd23a, 0.9, EASE); decal(m.x, m.z, 5);
      if (m.id === "titan") { R.clear = true; later(1.6, "win"); } paintBoss(); }
    else snd("pop", 70);
  }
  function decal(x, z, r) { return fx("decal", x, 0.03, z, r, 0xffffff, 4, HOLD, 0.45); }
  function heal(n) { R.hp = Math.min(R.hpMax, R.hp + n); }
  function dropChest(x, z, boss) { if (R.chest) { R.pendingChest++; return; } R.chest = { x, z, t: 0, boss: !!boss }; FX.chest.visible = true; FX.chest.position.set(x, 0, z); FX.chest.children[1].rotation.x = 0; }

  // the bosses: a warning, then an attack
  function bossTick(m, dt) {
    m.bt -= dt;
    if (!m.rage && m.hp < m.hpMax * 0.5) { m.rage = true; m.sp *= 1.25; m.bt = Math.min(m.bt, 1.2); banner(T("Enraged!"), T(MON[m.id].boss)); ring(m.x, m.z, 1, 10, 0xff2a2a, 0.8, EASE); shakeK = Math.max(shakeK, 0.6); snd("roar"); }
    if (m.charge) { const c = m.charge; c.t += dt; if (c.t > c.wait) { const step = 22 * dt; m.x += c.dx * step; m.z += c.dz * step; c.go += step; if (Q) glow(m.x, 1, m.z, m.r * 1.6, 0xff5a3a, 0.25, SHRINK, 0.5); if (Math.hypot(R.x - m.x, R.z - m.z) < m.r + HERO_R + 0.3) hurtHero(m.dmg * 1.2, m.id + ":charge"); if (c.go >= c.len || Math.hypot(m.x, m.z) > ARENA_R - 2) { m.charge = null; shakeK = Math.max(shakeK, 0.4); } } return true; }
    if (m.bt > 0) return false;
    // each boss its own mix: the Mushroom King's spores, Goleling's thrown rocks, the dragon's fire breath, the Titan's
    // sweeping beam and a rain of meteors; enraged (under half health) it attacks a third faster
    const kinds = m.id === "king" ? ["slam", "spores", "summon", "spores"] : m.id === "golem" ? ["rocks", "charge", "slam", "rocks", "volley"] : m.id === "dragon" ? ["breath", "volley", "charge", "breath", "slam"] : ["sweep", "rain", "charge", "volley", "summon", "slam"];
    const kind = kinds[(m.bn = m.bn + 1) % kinds.length]; m.bt = (m.id === "titan" ? 2.8 : 3.6) * (m.rage ? 0.68 : 1); m.st = "atk"; m.at = 0;
    if (kind === "slam") { const r = m.id === "titan" ? 5.5 : 4, x = R.x, z = R.z; disc(x, z, r, 0xff3a3a, 1.1, HOLD, 0.6); ring(x, z, 0.3, r, 0xff6a4a, 1.1, EASE); later(1.1, "slam", x, z, r, m.dmg * 1.4); }
    else if (kind === "charge") { const dx = R.x - m.x, dz = R.z - m.z, l = Math.hypot(dx, dz) || 1, len = Math.min(18, l + 6);
      m.charge = { dx: dx / l, dz: dz / l, len, go: 0, t: 0, wait: 0.9 }; m.face = Math.atan2(dx, dz);
      beam(m.x, 0.07, m.z, m.x + (dx / l) * len, 0.07, m.z + (dz / l) * len, m.r * 2.2, 0xff3a3a, 1.0, FLAT | HOLD, 0.7); snd("warn"); }
    else if (kind === "volley") { const n = m.id === "titan" ? 18 : 12; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, f = take2(foeFree); f.x = m.x; f.z = m.z; f.vx = Math.cos(a) * 6.5; f.vz = Math.sin(a) * 6.5; f.t = 0; f.dmg = m.dmg * 0.6; foes.push(f); } snd("cast"); }
    else if (kind === "spores") { const n = m.rage ? 7 : 5; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = i ? 2 + Math.random() * 5 : 0, x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d; ring(x, z, 2.2, 2.2, 0x7aff5a, 0.9, HOLD | SPIN, 0.9); disc(x, z, 2.2, 0x2a6a1a, 0.9, HOLD, 0.5); later(0.9, "spore", x, z, 2.2, m.dmg * 0.45); } snd("cast"); }
    else if (kind === "rocks") { const n = m.rage ? 5 : 3; for (let i = 0; i < n; i++) { const x = R.x + (i ? (Math.random() - 0.5) * 7 : 0), z = R.z + (i ? (Math.random() - 0.5) * 7 : 0), w8 = 1.1 + i * 0.15;
        disc(x, z, 2.4, 0xff6a3a, w8, HOLD, 0.6); ring(x, z, 0.3, 2.4, 0xffa060, w8, EASE); const g = glow(0, 0, 0, 1.4, 0xb08a6a, w8, FALL); if (g) { g.x2 = m.x; g.y2 = 6; g.z2 = m.z; g.vx = x; g.vz = z; } later(w8, "slam", x, z, 2.4, m.dmg * 1.1); } snd("swing"); }
    else if (kind === "breath") { const a = Math.atan2(R.x - m.x, R.z - m.z), len = 12; m.face = a; for (let k = -3; k <= 3; k++) { const b = a + k * 0.17; beam(m.x, 0.07, m.z, m.x + Math.sin(b) * len, 0.07, m.z + Math.cos(b) * len, 0.6, 0xff3a3a, 0.9, FLAT | HOLD, 0.5); }
      for (let k = 0; k < 7; k++) later(0.9 + k * 0.18, "breath", m, a, len, m.dmg * 0.55); snd("warn"); }
    else if (kind === "sweep") { const a0 = Math.atan2(R.x - m.x, R.z - m.z) - 1.2, len = 20; for (let k = 0; k <= 8; k++) { const b = a0 + (k / 8) * 2.4; beam(m.x, 0.07, m.z, m.x + Math.sin(b) * len, 0.07, m.z + Math.cos(b) * len, 0.35, 0xff2a5a, 0.8, FLAT | HOLD, 0.35); }
      for (let k = 0; k <= 16; k++) later(0.8 + k * 0.1, "sweep", m, a0 + (k / 16) * 2.4, len, m.dmg * 0.8); snd("charge"); }
    else if (kind === "rain") { for (let i = 0; i < (m.rage ? 12 : 8); i++) { const x = R.x + (Math.random() - 0.5) * 12, z = R.z + (Math.random() - 0.5) * 12, w8 = 0.9 + i * 0.15; disc(x, z, 2.2, 0xff3a3a, w8, HOLD, 0.55); ring(x, z, 0.3, 2.2, 0xff8a5a, w8, EASE);
        const g = glow(0, 0, 0, 1.3, 0xff7a3a, w8, FALL | PULSE); if (g) { g.x2 = x - 4; g.y2 = 14; g.z2 = z - 3; g.vx = x; g.vz = z; } later(w8, "slam", x, z, 2.2, m.dmg * 0.9); } snd("siren"); }
    else if (kind === "summon") { const id = m.id === "king" ? "mush" : poolAt(R.t)[0][0]; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; spawn(id, m.x + Math.cos(a) * 3, m.z + Math.sin(a) * 3); } snd("growl"); }
    return false;
  }
  function spawnBoss(i) {
    const id = BOSSES[i]; edgePoint(13); const m = spawn(id, ep.x, ep.z); if (!m) return; R.boss = m; m.bt = 2.8;
    // the entrance: the camera swings to it, time slows, a striped warning banner
    R.focus = { x: m.x, z: m.z, t: 1.6 }; slowMo = 1.6; ring(m.x, m.z, 0.5, 9, 0xff3a5a, 1.2, EASE); disc(m.x, m.z, 4, 0x7a1a3a, 1.4, HOLD, 0.6);
    ui.root.classList.add("boss-in"); setTimeout(() => ui && ui.root.classList.remove("boss-in"), 2400);
    banner(i === 3 ? T("The Infinity Titan is here!") : T("Boss incoming!"), T(MON[id].boss)); snd("siren"); snd("roar"); paintBoss();
  }

  // ---------------- the hero ----------------
  function hurtHero(n, by) {
    if (R.over || R.dashT > 0 || R.hurtT > 0 || mode !== "play" || R.god) return;
    if (by) R.lastBy = { by: String(by), boss: R.boss ? R.boss.id : "", t: R.t }; // (b-svx: the result says what knocked you out)
    if (R.shield) { R.shield = 0; R.shieldT = 15; R.hurtT = 0.4; const r = 4 + pv("shield") * 0.4; ring(R.x, R.z, 0.5, r, 0x8ff0ff, 0.45, EASE); for (const m of mons) if (m.st !== "die" && (m.x - R.x) ** 2 + (m.z - R.z) ** 2 < r * r) hitMon(m, 20 * pv("shield"), "shield", { kb: 8 }); snd("impact"); return; }
    const d = n * stat.armor(); R.hp -= d; R.hurtT = 0.35; flashUi("hurt"); snd("hurt", 120); if (hero && hero.hurt) try { hero.hurt(); } catch { /* fine */ }
    num(R.x, 2.3, R.z, d, 0xff4d6d, true); shakeK = Math.max(shakeK, 0.2);
    if (R.hp <= 0) {
      if (pv("revive") && !R.revived) { R.revived = true; R.hp = R.hpMax * 0.5; R.hurtT = 2; banner(T("Revived!"), ""); snd("level"); ring(R.x, R.z, 0.5, 8, 0xffd23a, 0.7, EASE); for (const m of mons) if (m.st !== "die" && !m.boss && (m.x - R.x) ** 2 + (m.z - R.z) ** 2 < 64) hitMon(m, 999, "revive", { kb: 10 }); return; }
      R.hp = 0; endRun("dead");
    }
  }

  // ---------------- targeting: the grid, searched in widening rings ----------------
  function nearestTo(x, z, maxD, skip) {
    let best = null, bd = maxD * maxD; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), rmax = Math.ceil(maxD / CELL);
    for (let r = 0; r <= rmax; r++) { for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) { if (r && i > cx - r && i < cx + r && j > cz - r && j < cz + r) continue; const l = grid.get(((i + 64) << 8) | (j + 64)); if (!l) continue;
      for (const m of l) { if (m.st === "die" || (skip && skip.includes(m))) continue; const d = (m.x - x) ** 2 + (m.z - z) ** 2; if (d < bd) { bd = d; best = m; } } }
      if (best && (r * CELL) ** 2 > bd) break; }
    return best;
  }
  const nearest = (maxD, skip) => nearestTo(R.x, R.z, maxD, skip);
  function near(x, z, r, f) { const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const l = grid.get(((i + 64) << 8) | (j + 64)); if (!l) continue; for (const m of l) if (m.st !== "die" && (m.x - x) ** 2 + (m.z - z) ** 2 < (r + m.r) ** 2) f(m); } }

  // ---------------- weapons ----------------
  const lvOf = (id) => R.w[id] || 0, W = (id, k) => WEAPONS[id][k][lvOf(id) - 1];
  let dtNow = 0;
  function cdReady(id, base) { R.cds[id] = (R.cds[id] || 0) - dtNow; if (R.cds[id] > 0) return false; R.cds[id] = base * stat.cd(); return true; }
  const seen = []; // chain targets this strike (reused)
  function bolt(x, z, a, sp, life, dmg, pierce, src, c) { const s = take2(shotFree); s.x = x; s.z = z; s.vx = Math.sin(a) * sp; s.vz = Math.cos(a) * sp; s.t = 0; s.life = life; s.dmg = dmg; s.pierce = pierce; s.src = src; s.c = c; s.h0 = 0; s.h1 = 0; s.h2 = 0; shots.push(s); }
  function weapons(dt) {
    dtNow = dt; const ex = stat.extra();
    if (lvOf("blaster") && cdReady("blaster", W("blaster", "cd") / stat.rate() * (R.evo.star ? 0.7 : 1) * (R.overT > 0 ? 0.5 : 1))) {
      const tgt = nearest(13 * stat.reach()); if (tgt) { const n = W("blaster", "n") + ex + (R.evo.star ? 3 : 0), base = Math.atan2(tgt.x - R.x, tgt.z - R.z);
        for (let i = 0; i < n; i++) bolt(R.x, R.z, base + (i - (n - 1) / 2) * (R.evo.star ? 0.22 : 0.12), 19 * stat.rate(), 0.9 * stat.reach(), W("blaster", "dmg") * (R.evo.star ? 1.4 : 1), W("blaster", "pierce") + (R.evo.star ? 3 : 0), "blaster", R.evo.star ? 0xfff07a : 0x38d8ff);
        glow(R.x + Math.sin(base) * 0.6, 1, R.z + Math.cos(base) * 0.6, 0.9, 0x8ff0ff, 0.1); snd("zap", 90); } }
    if (lvOf("chain") && cdReady("chain", W("chain", "cd") * (R.evo.thunder ? 0.5 : 1))) {
      let fx0 = R.x, fy0 = 1.2, fz0 = R.z, n = W("chain", "n") + (R.evo.thunder ? 6 : 0); seen.length = 0; let tgt = nearest(9 * stat.reach());
      while (tgt && n-- > 0) { seen.push(tgt); const ty = tgt.fly + 0.8; zap(fx0, fy0, fz0, tgt.x, ty, tgt.z, R.evo.thunder ? 0xffd23a : 0x8ff0ff); glow(tgt.x, ty, tgt.z, 1.4, R.evo.thunder ? 0xffd23a : 0x8ff0ff, 0.25, GROW); hitMon(tgt, W("chain", "dmg") * (R.evo.thunder ? 1.6 : 1), "chain"); fx0 = tgt.x; fy0 = ty; fz0 = tgt.z; tgt = nearestTo(fx0, fz0, 6 * stat.reach(), seen); }
      if (seen.length) snd("zap", 90); }
    if (lvOf("orb")) { const n = W("orb", "n") + (R.evo.inferno ? 2 : 0), rad = W("orb", "rad") * stat.area() * (R.evo.inferno ? 1.25 : 1), sz = 0.42 * stat.area() * (R.evo.inferno ? 1.6 : 1); R.orbA += dt * (2.6 + (R.evo.inferno ? 0.6 : 0));
      for (let i = 0; i < n; i++) { const a = R.orbA + (i / n) * Math.PI * 2, x = R.x + Math.cos(a) * rad, z = R.z + Math.sin(a) * rad;
        glow(x, 1, z, sz * (Q > 1 ? 3 : 2.2), 0xff7a2a, 0, PULSE | ONE); glow(x, 1, z, sz * 1.4, 0xffe0a0, 0, ONE); if (Q && lastStep) glow(x, 1, z, sz * 1.6, 0xff6a20, 0.3, SHRINK, 0.6);
        near(x, z, sz + 0.4, (m) => { if (R.t - m.oT < 0.45) return; m.oT = R.t; hitMon(m, W("orb", "dmg") * (R.evo.inferno ? 1.8 : 1), "orb", { kb: 3, fx: R.x, fz: R.z }); sparks(m.x, 1, m.z, 0xffa040, 3, 3); }); } }
    if (lvOf("blade")) { const n = W("blade", "n") + (R.evo.eclipse ? 2 : 0), rad = W("blade", "rad") * stat.area(), len = 1.1 * stat.area() * (R.evo.eclipse ? 1.4 : 1); R.bladeA -= dt * 3.4;
      for (let i = 0; i < n; i++) { const a = R.bladeA + (i / n) * Math.PI * 2, x = R.x + Math.cos(a) * rad, z = R.z + Math.sin(a) * rad, tx = -Math.sin(a) * len, tz = Math.cos(a) * len;
        beam(x - tx, 0.9, z - tz, x + tx, 0.9, z + tz, 0.55, R.evo.eclipse ? 0xffd23a : 0x9b6bff, 0, ONE); beam(x - tx * 0.8, 0.9, z - tz * 0.8, x + tx * 0.8, 0.9, z + tz * 0.8, 0.18, 0xffffff, 0, ONE);
        near(x, z, len, (m) => { if (R.t - m.bT < 0.4) return; m.bT = R.t; hitMon(m, W("blade", "dmg") * (R.evo.eclipse ? 1.5 : 1), "blade", { kb: 2 }); }); } }
    if (lvOf("laser") && cdReady("laser", W("laser", "cd") / stat.rate() * (R.overT > 0 ? 0.5 : 1))) {
      const tgt = nearest(16 * stat.reach()), base = tgt ? Math.atan2(tgt.x - R.x, tgt.z - R.z) : R.face, n = W("laser", "n") + ex, len = 16 * stat.reach(), w = 0.55 * stat.area();
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.5; beam(R.x, 1, R.z, R.x + Math.sin(a) * len, 1, R.z + Math.cos(a) * len, 0.08, 0xff5ad8, 0.2, 0, 0.9); later(0.18, "laser", a, len, w); }
      snd("charged", 120); }
    if (lvOf("nova") && cdReady("nova", W("nova", "cd"))) {
      const r = W("nova", "rad") * stat.area(); ring(R.x, R.z, 0.6, r, 0x8ff0ff, 0.45, EASE); ring(R.x, R.z, 0.3, r * 0.8, 0xffffff, 0.3, EASE, 0.6); disc(R.x, R.z, r, 0x38d8ff, 0.3, 0, 0.35); if (Q > 1) for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; glow(R.x + Math.cos(a) * r * 0.5, 0.4, R.z + Math.sin(a) * r * 0.5, 0.8, 0xbfe8ff, 0.4, GROW, 0.4); }
      for (const m of mons) { if (m.st === "die") continue; if ((m.x - R.x) ** 2 + (m.z - R.z) ** 2 < (r + m.r) ** 2) hitMon(m, W("nova", "dmg"), "nova", { kb: 9 }); } snd("impact", 100); }
    if (lvOf("meteor") && cdReady("meteor", W("meteor", "cd"))) {
      const n = W("meteor", "n") + ex, r = 2.4 * stat.area(); seen.length = 0;
      for (let i = 0; i < n; i++) { const tgt = nearestTo(R.x + (Math.random() - 0.5) * 10, R.z + (Math.random() - 0.5) * 10, 14 * stat.reach(), seen); const x = tgt ? tgt.x : R.x + (Math.random() - 0.5) * 12, z = tgt ? tgt.z : R.z + (Math.random() - 0.5) * 12; if (tgt) seen.push(tgt);
        ring(x, z, r, r, 0xff7a3c, 0.7, SPIN, 0.8); const g = glow(0, 12, 0, 1.6 * stat.area(), 0xff8a3a, 0.7, FALL | PULSE); if (g) { g.x2 = x - 4; g.y2 = 12; g.z2 = z - 3; g.vx = x; g.vz = z; }
        const tr = glow(0, 12, 0, 0.9 * stat.area(), 0xffe0a0, 0.7, FALL); if (tr) { tr.x2 = x - 4; tr.y2 = 12; tr.z2 = z - 3; tr.vx = x; tr.vz = z; }
        later(0.7, "meteor", x, z, r); } }
    if (lvOf("ice") && cdReady("ice", W("ice", "cd"))) { const tgt = nearest(12 * stat.reach()); const x = tgt ? tgt.x : R.x, z = tgt ? tgt.z : R.z; zone("ice", x, z, W("ice", "rad") * stat.area() * (R.evo.zero ? 1.3 : 1), 1.8, W("ice", "dmg"), 0.3); snd("cast", 150); }
    if (lvOf("poison") && cdReady("poison", W("poison", "cd"))) zone("poison", R.x, R.z, W("poison", "rad") * stat.area(), 3.2, W("poison", "dmg"), 0.45);
    if (lvOf("hole") && cdReady("hole", W("hole", "cd"))) { const tgt = nearest(12 * stat.reach()); if (tgt) { zone("hole", tgt.x, tgt.z, W("hole", "rad") * stat.area(), 2.0, W("hole", "dmg"), 0); snd("charge", 200); } }
    if (lvOf("sword") && cdReady("sword", W("sword", "cd") / stat.rate())) {
      const r = W("sword", "rad") * stat.area(), dirs = lvOf("sword") >= 5 ? [R.face, R.face + Math.PI] : [R.face];
      for (const f0 of dirs) { for (let k = -3; k <= 3; k++) { const a = f0 + k * 0.32; beam(R.x + Math.sin(a) * 0.8, 0.9, R.z + Math.cos(a) * 0.8, R.x + Math.sin(a) * r, 0.9, R.z + Math.cos(a) * r, 0.5, k ? 0x8ff0ff : 0xffffff, 0.18, FLAT, 0.8); }
        for (const m of mons) { if (m.st === "die") continue; const dx = m.x - R.x, dz = m.z - R.z, d = Math.hypot(dx, dz); if (d > r + m.r) continue; const da = Math.atan2(Math.sin(Math.atan2(dx, dz) - f0), Math.cos(Math.atan2(dx, dz) - f0)); if (Math.abs(da) < 1.15) hitMon(m, W("sword", "dmg"), "sword", { kb: 5 }); } }
      snd("swing", 120); }
    if (lvOf("drone")) {
      const n = W("drone", "n") + (R.evo.legion ? 2 : 0); while (R.drones.length < n) R.drones.push({ cd: Math.random() }); R.drones.length = Math.min(R.drones.length, n);
      R.drones.forEach((d, i) => { const a = R.t * 1.6 + (i / n) * Math.PI * 2, x = R.x + Math.cos(a) * 1.6, z = R.z + Math.sin(a) * 1.6, y = 2.1 + Math.sin(R.t * 4 + i) * 0.15;
        glow(x, y, z, 1.1, 0x38d8ff, 0, ONE); glow(x, y, z, 0.45, 0xffffff, 0, ONE); ring(x, z, 0.35, 0.35, 0x38d8ff, 0, ONE, 0.5); d.cd -= dt;
        if (d.cd <= 0) { d.cd = W("drone", "cd") * stat.cd(); const tgt = nearestTo(x, z, 12 * stat.reach()); if (tgt) { const b = Math.atan2(tgt.x - x, tgt.z - z), k = 1 + (R.evo.legion ? 1 : 0) + Math.min(1, ex); for (let j = 0; j < k; j++) bolt(x, z, b + (j - (k - 1) / 2) * 0.1, 17, 0.8, W("drone", "dmg"), 0, "drone", 0x7dff9a); } } }); }
    if (pv("infinity") && (R.infT -= dt) <= 0) { R.infT = 25; const r = 9 * stat.area(); ring(R.x, R.z, 1, r, 0x39ff88, 0.7, EASE); ring(R.x, R.z, 0.5, r * 0.7, 0xffffff, 0.5, EASE, 0.7); disc(R.x, R.z, r, 0x39ff88, 0.4, 0, 0.4); shakeK = 0.8;
      for (const m of mons) if (m.st !== "die" && (m.x - R.x) ** 2 + (m.z - R.z) ** 2 < r * r) hitMon(m, 140, "infinity", { kb: 10 }); snd("jackpot"); }
    if (pv("shield") && !R.shield && (R.shieldT -= dt) <= 0) { R.shield = 1; snd("equip", 200); }
    if (pv("frost")) { const r = 2.5 + 0.4 * pv("frost"); near(R.x, R.z, r, (m) => { m.slow = Math.max(m.slow, 0.25); }); if (Q) ring(R.x, R.z, r, r, 0x7fe8ff, 0, SPIN | ONE, 0.35); }
  }
  function zone(kind, x, z, r, life, dmg, tick) { const o = take2(zoneFree); o.kind = kind; o.x = x; o.z = z; o.r = r; o.t = 0; o.life = life; o.dmg = dmg; o.tick = tick; o.next = 0; zones.push(o);
    if (kind === "ice") { disc(x, z, r, 0x7fe8ff, life, HOLD, 0.45); ring(x, z, 0.4, r, 0xe8fbff, 0.5, EASE); }
    else if (kind === "poison") { disc(x, z, r, 0x3fdc5b, life, HOLD, 0.5); ring(x, z, r, r, 0x8fff7a, life, HOLD | SPIN, 0.5); }
    else if (kind === "spore") { disc(x, z, r, 0x3a8a1a, life, HOLD, 0.55); ring(x, z, r, r, 0x9aff6a, life, HOLD | SPIN, 0.6); }
    else { disc(x, z, r, 0x2a0a4a, life, HOLD, 0.9); ring(x, z, r, r * 0.3, 0xb48cff, life, 0, 0.9); } }
  function zones1(dt) {
    for (let i = zones.length - 1; i >= 0; i--) { const o = zones[i]; o.t += dt;
      if (o.kind === "hole") { near(o.x, o.z, o.r * 1.4, (m) => { if (m.boss) return; const dx = o.x - m.x, dz = o.z - m.z, l = Math.hypot(dx, dz) || 1; m.vx += (dx / l) * 18 * dt; m.vz += (dz / l) * 18 * dt; }); if (Q) glow(o.x, 0.6, o.z, o.r * 0.6, 0x7a3cff, 0, PULSE | ONE, 0.5);
        if (o.t >= o.life) { ring(o.x, o.z, 0.4, o.r * 1.3, 0xb48cff, 0.4, EASE); sparks(o.x, 0.8, o.z, 0xb48cff, 14, 7); near(o.x, o.z, o.r * 1.3, (m) => hitMon(m, o.dmg, "hole", { kb: 7, fx: o.x, fz: o.z })); shakeK = Math.max(shakeK, 0.3); } }
      else if (o.kind === "spore") { if (o.t >= o.next) { o.next = o.t + o.tick; if (Math.hypot(R.x - o.x, R.z - o.z) < o.r) hurtHero(o.dmg, "spore"); if (Q) for (let k = 0; k < 3; k++) { const g = glow(o.x + (Math.random() - 0.5) * o.r * 1.6, 0.4, o.z + (Math.random() - 0.5) * o.r * 1.6, 0.7, 0x8aff5a, 0.8, GROW, 0.5); if (g) g.vy = 0.8; } } }
      else if (o.t >= o.next) { o.next = o.t + o.tick; near(o.x, o.z, o.r, (m) => hitMon(m, o.dmg, o.kind, o.kind === "ice" ? { slow: R.evo.zero ? 2.5 : 1.5 } : null));
        if (o.kind === "ice" && Q) for (let k = 0; k < 4; k++) { const g = glow(o.x + (Math.random() - 0.5) * o.r * 1.6, 3, o.z + (Math.random() - 0.5) * o.r * 1.6, 0.25, 0xe8fbff, 0.5); if (g) g.vy = -6; } }
      if (o.t >= o.life) { zoneFree.push(o); zones.splice(i, 1); } }
  }
  function zap(ax, ay, az, bx, by, bz, c) { let px = ax, py = ay, pz = az; for (let k = 1; k <= 4; k++) { const t = k / 4, qx = k === 4 ? bx : ax + (bx - ax) * t + (Math.random() - 0.5) * 0.9, qy = k === 4 ? by : ay + (by - ay) * t + (Math.random() - 0.5) * 0.5, qz = k === 4 ? bz : az + (bz - az) * t + (Math.random() - 0.5) * 0.9;
    beam(px, py, pz, qx, qy, qz, 0.5, c, 0.22); beam(px, py, pz, qx, qy, qz, 0.14, 0xffffff, 0.18); px = qx; py = qy; pz = qz; } }
  function runEvent(e) {
    if (e.kind === "slam") { ring(e.a, e.b, e.c * 0.6, e.c * 1.15, 0xffd08a, 0.4, EASE); sparks(e.a, 0.3, e.b, 0xffb070, 14, 7); decal(e.a, e.b, e.c * 0.7); shakeK = Math.max(shakeK, 0.7); snd("impact"); if (Math.hypot(R.x - e.a, R.z - e.b) < e.c) hurtHero(e.d, e.kind); }
    else if (e.kind === "meteor") { const r = e.c; ring(e.a, e.b, 0.5, r * 1.2, 0xffd08a, 0.4, EASE); disc(e.a, e.b, r, 0xff7a3c, 0.3, 0, 0.6); glow(e.a, 0.8, e.b, r * 2.2, 0xff9a4a, 0.3, GROW, 0.8); sparks(e.a, 0.4, e.b, 0xffb070, 10, 6); decal(e.a, e.b, r * 0.8); shakeK = Math.max(shakeK, 0.25);
      near(e.a, e.b, r, (m) => hitMon(m, W("meteor", "dmg"), "meteor", { kb: 5, fx: e.a, fz: e.b })); snd("impact", 80); }
    else if (e.kind === "laser") { const a = e.a, len = e.b, w = e.c, dx = Math.sin(a), dz = Math.cos(a), x2 = R.x + dx * len, z2 = R.z + dz * len;
      beam(R.x, 1, R.z, x2, 1, z2, w * 2.2, 0xff3ad0, 0.32, PULSE, 0.9); beam(R.x, 1, R.z, x2, 1, z2, w * 0.7, 0xffe0fa, 0.26); glow(R.x + dx * 0.7, 1, R.z + dz * 0.7, 1.4, 0xff9af0, 0.25, GROW);
      for (const m of mons) { if (m.st === "die") continue; const ox = m.x - R.x, oz = m.z - R.z, along = ox * dx + oz * dz; if (along < 0 || along > len) continue; if (Math.abs(ox * dz - oz * dx) < w + m.r) { hitMon(m, e.d != null ? e.d : W("laser", "dmg"), e.d != null ? "skill" : "laser"); if (Q) glow(m.x, 1, m.z, 0.8, 0xff9af0, 0.2, GROW); } } }
    else if (e.kind === "spore") zone("spore", e.a, e.b, e.c, 4, e.d, 0.5);
    else if (e.kind === "breath") { const m = e.a; if (!m || m.st === "die" || m.hp <= 0) return; const a = e.b, len = e.c;
      for (let k = 0; k < 6; k++) { const d = 1.5 + Math.random() * len, b = a + (Math.random() - 0.5) * 0.9; glow(m.x + Math.sin(b) * d, 1 + Math.random(), m.z + Math.cos(b) * d, 1.6 + d * 0.12, k % 2 ? 0xff7a2a : 0xffd06a, 0.35, GROW, 0.8); }
      const dx = R.x - m.x, dz = R.z - m.z, dd = Math.hypot(dx, dz), da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - a), Math.cos(Math.atan2(dx, dz) - a))); if (dd < len && da < 0.55) hurtHero(e.d, e.kind); }
    else if (e.kind === "sweep") { const m = e.a; if (!m || m.st === "die" || m.hp <= 0) return; const a = e.b, len = e.c, x2 = m.x + Math.sin(a) * len, z2 = m.z + Math.cos(a) * len;
      beam(m.x, 1.2, m.z, x2, 1.2, z2, 1.0, 0xff2a5a, 0.14, PULSE); beam(m.x, 1.2, m.z, x2, 1.2, z2, 0.3, 0xffe0e8, 0.12); glow(x2, 0.5, z2, 1.6, 0xff5a7a, 0.2, GROW);
      const ox = R.x - m.x, oz = R.z - m.z, along = ox * Math.sin(a) + oz * Math.cos(a); if (along > 0 && along < len && Math.abs(ox * Math.cos(a) - oz * Math.sin(a)) < 0.9) hurtHero(e.d, e.kind); }
    else if (e.kind === "lava") { glow(e.a, 0.8, e.b, 5, 0xff7a2a, 0.5, GROW, 0.9); sparks(e.a, 0.4, e.b, 0xffb050, 16, 7); ring(e.a, e.b, 0.5, 3, 0xffd08a, 0.4, EASE); decal(e.a, e.b, 2.2); if (Math.hypot(R.x - e.a, R.z - e.b) < 2.6) hurtHero(14 * R.D.dmg, "lava"); snd("impact", 80); }
    else if (e.kind === "chest") { if (R && FX.chest.visible) { FX.chest.visible = false; FX.chest.children[1].rotation.x = 0; } if (mode === "open") showCards(true, e.a); }
    else if (e.kind === "win") { if (on && R && !R.over) endRun("win"); }
  }

  // ---------------- cards ----------------
  function offer(chest) {
    const out = [], wN = Object.keys(R.w).length, pN = Object.keys(R.p).length;
    for (const e of EVOS) if (!R.evo[e.id] && lvOf(e.from) >= MAX_LV && pv(e.with) >= maxLv(e.with)) out.push({ k: "evo", id: e.id, w: chest ? 100 : 6 });
    for (const id of Object.keys(WEAPONS)) { const l = lvOf(id); if (l >= MAX_LV || (!l && wN >= SLOTS) || R.ban[id]) continue; out.push({ k: "w", id, w: l ? 3 : 1.6 }); }
    for (const id of Object.keys(PASSIVES)) { const l = pv(id); if (l >= maxLv(id) || (!l && pN >= SLOTS) || R.ban[id]) continue; out.push({ k: "p", id, w: l ? 2.4 : PASSIVES[id].fx ? 0.9 : 1.3 }); }
    const pickN = []; const pool = out.slice();
    while (pickN.length < 3 && pool.length) { const tot = pool.reduce((s, x) => s + x.w, 0); let r = Math.random() * tot, i = 0; for (; i < pool.length - 1; i++) if ((r -= pool[i].w) <= 0) break; pickN.push(pool.splice(i, 1)[0]); }
    if (!pickN.length) pickN.push({ k: "heal" }, { k: "dmg" });
    return pickN;
  }
  function take(c) {
    if (c.k === "w") R.w[c.id] = lvOf(c.id) + 1; else if (c.k === "p") { R.p[c.id] = pv(c.id) + 1; if (c.id === "vital") { R.hpMax += 20; R.hp += 20; } if (c.id === "shield") R.shieldT = 0; }
    else if (c.k === "evo") R.evo[c.id] = 1; else if (c.k === "heal") heal(R.hpMax * 0.3); else if (c.k === "dmg") R.bonusDmg *= 1.1;
    snd(c.k === "evo" ? "jackpot" : "equip"); paintSlots(); if (FX) { ring(R.x, R.z, 0.3, 3, c.k === "evo" ? 0xffd23a : 0x8ff0ff, 0.5, EASE); sparks(R.x, 1.2, R.z, c.k === "evo" ? 0xffd23a : 0x8ff0ff, 12, 4); }
  }
  function cardHtml(c, i) {
    let ic, name, line, tag;
    if (c.k === "w") { const w = WEAPONS[c.id], l = lvOf(c.id); ic = c.id; name = w.name; line = w.lv[l]; tag = l ? T("Lv {n}", { n: l + 1 }) : T("NEW"); }
    else if (c.k === "p") { const p = PASSIVES[c.id], l = pv(c.id); ic = c.id; name = p.name; line = p.line; tag = l ? T("Lv {n}", { n: l + 1 }) : T("NEW"); }
    else if (c.k === "evo") { const e = EVOS.find((x) => x.id === c.id); ic = e.id; name = e.name; line = e.line; tag = T("EVOLVE"); }
    else if (c.k === "heal") { ic = "heal"; name = "Heal 30% HP"; line = ""; tag = ""; } else { ic = "dmg"; name = "+10% damage for this run"; line = ""; tag = ""; }
    // b-svx: which evolution this card leads to (a weapon: its partner; a passive: the weapon it evolves)
    const evo = c.k === "w" ? EVOS.find((e) => e.from === c.id) : c.k === "p" ? EVOS.find((e) => e.with === c.id) : null;
    const evoLine = evo && !R.evo[evo.id] ? `<span class="sv-evo-h">${icon(evo.id, 14)}${esc(c.k === "w" ? T("Evolves with {x}", { x: T(PASSIVES[evo.with].name) }) : T("Evolves {x}", { x: T(WEAPONS[evo.from].name) }))}</span>` : "";
    const rar = c.k === "heal" || c.k === "dmg" ? "p" : RARITY(c), pips = c.k === "w" || c.k === "p" ? Array.from({ length: c.k === "w" ? MAX_LV : maxLv(c.id) }, (_, k) => `<i class="${k < (c.k === "w" ? lvOf(c.id) : pv(c.id)) ? "on" : k === (c.k === "w" ? lvOf(c.id) : pv(c.id)) ? "nx" : ""}"></i>`).join("") : "";
    return `<button type="button" class="sv-card r-${rar}" data-i="${i}" style="--d:${i * 0.07}s"><span class="sv-card-ic">${icon(ic, 40)}</span><span class="sv-card-t"><b>${esc(T(name))}</b>${line ? `<small>${esc(T(line))}</small>` : ""}${pips ? `<span class="sv-pips">${pips}</span>` : ""}${evoLine}</span>${tag ? `<em>${esc(tag)}</em>` : ""}<kbd>${i + 1}</kbd></button>`;
  }
  let cards = null;
  function showCards(chest, gold) {
    const list = offer(chest); cards = list; mode = "cards"; keys.clear(); joy.on = false; paintJoy(); opening = null;
    // a chest's loot goes to your bag when the run ends: a boss's holds more
    let loot = ""; if (chest) { const hp = gold ? 2 : 1, sp = gold ? 1 : 0, sc = gold ? 30 + Math.floor(Math.random() * 31) : 10 + Math.floor(Math.random() * 21); R.loot.hp += hp; R.loot.sp += sp; R.loot.scrap += sc;
      loot = `<p class="sv-loot">${icon("heal", 16)} ${esc(T("HP potion"))} +${hp}${sp ? ` · ${esc(T("SP potion"))} +${sp}` : ""} · ${esc(T("Scrap"))} +${sc}</p>`; }
    paintCards(chest, loot);
    ui.cards.hidden = false; snd(chest ? "chest" : "level");
  }
  // b-svx: the cards, and under level-up cards the tools: draw again (2 a run), take a card out of this run (2), or skip (a little HP)
  let cardsChest = false, cardsLoot = "";
  function paintCards(chest, loot) {
    cardsChest = !!chest; cardsLoot = loot || ""; const tools = chest || !cards.some((c) => c.k === "w" || c.k === "p") ? "" : `<div class="sv-ctools${R.banMode ? " ban" : ""}"><button type="button" data-t="reroll" ${R.reroll ? "" : "disabled"}><i>⟳</i><span>${esc(T("Reroll"))}<b>${R.reroll}/${TOOLS.reroll}</b></span></button><button type="button" data-t="banish" ${R.banish ? "" : "disabled"} aria-pressed="${R.banMode}"><i>✕</i><span>${esc(T("Banish"))}<b>${R.banish}/${TOOLS.banish}</b></span></button><button type="button" data-t="skip" ${R.skip ? "" : "disabled"}><i>»</i><span>${esc(T("Skip"))}<b>${R.skip}/${TOOLS.skip}</b></span></button></div>${R.banMode ? `<p class="sv-ban-h">${esc(T("Tap a card to take it out of this run"))}</p>` : ""}`;
    ui.cards.innerHTML = `<div class="sv-cards-in${chest ? " chest" : ""}${R.banMode ? " banning" : ""}"><small>${esc(chest ? T("A chest!") : T("LEVEL UP!"))}</small><h3>${esc(chest ? T("Choose one") : T("Lv {n}", { n: R.lv }))}</h3>${cardsLoot}<div class="sv-cards-l">${cards.map(cardHtml).join("")}</div>${tools}</div>`;
    ui.cards.querySelectorAll(".sv-card").forEach((b) => b.addEventListener("click", () => choose(Number(b.dataset.i))));
    ui.cards.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => cardTool(b.dataset.t)));
  }
  function cardTool(t) {
    if (mode !== "cards" || !cards || cardsChest) return;
    if (t === "reroll" && R.reroll > 0) { R.reroll--; R.banMode = false; cards = offer(false); snd("tab"); paintCards(false, ""); }
    else if (t === "banish" && R.banish > 0) { R.banMode = !R.banMode; snd("tap"); paintCards(false, ""); }
    else if (t === "skip" && R.skip > 0) { R.skip--; R.banMode = false; heal(R.hpMax * 0.1); cards = null; ui.cards.hidden = true; mode = "play"; snd("tap"); keys.clear(); joy.on = false; paintJoy(); if (R.pendingLv > 0) { R.pendingLv--; setTimeout(() => { if (mode === "play") showCards(false); }, 140); } }
  }
  function choose(i) {
    if (mode === "cards" && cards && cards[i] && R.banMode && !cardsChest) { const c = cards[i]; if (c.k === "w" || c.k === "p") { R.ban[c.id] = 1; R.banish--; R.banMode = false; snd("impact"); const rest = offer(false).filter((x) => !cards.some((y, j) => j !== i && y.k === x.k && y.id === x.id)); cards[i] = rest[0] || { k: "heal" }; paintCards(false, ""); } return; }
    if (mode !== "cards" || !cards || !cards[i]) return; take(cards[i]); cards = null; ui.cards.hidden = true; mode = "play"; keys.clear(); joy.on = false; paintJoy(); if (R.pendingLv > 0) { R.pendingLv--; setTimeout(() => { if (mode === "play") showCards(false); }, 140); } }

  // ---------------- the loop ----------------
  let maxSteps = 4, opening = null, fps30 = false, jsMs = 0, camK = 1, shakeK = 0, slowMo = 0, timeK = 1, camInit = false, acc = 0, lastNow = 0, frameMs = 16, qT = 0, qGood = 0;
  const camP = new THREE.Vector3(), camL = new THREE.Vector3(), keys = new Set(), joy = { on: false, id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
  function tick(dt0, t) {
    const now = performance.now(), real = lastNow ? Math.min(0.25, (now - lastNow) / 1000) : dt0; lastNow = now;
    adapt(real); const js0 = performance.now();
    let simDt = 0;
    if (mode === "play" && R && !R.over) {
      acc += real; let n = 0;
      // at most 4 steps a frame: a frame that took too long doesn't make the next one longer still (below 15 fps the
      // game slows a little instead of spiralling)
      const steps = Math.min(maxSteps, Math.floor(acc / STEP));
      while (acc >= STEP && n < maxSteps) { acc -= STEP; n++; lastStep = n >= steps; if (R.stop > 0) { R.stop -= STEP; continue; } if (slowMo > 0) { slowMo -= STEP; timeK = 0.3; } else timeK = 1; const d = STEP * timeK; step(d); simDt += d; if (mode !== "play" || !R || R.over) break; }
      if (n >= maxSteps) acc = 0; lastStep = true; stepped = n > 0;
    } else { acc = 0; stepped = mode !== "pause" && mode !== "cards"; }
    const vis = mode === "play" ? simDt : mode === "over" || mode === "count" || mode === "open" ? real : 0;
    if (opening && FX) { opening.t += real; const k = Math.min(1, opening.t / 0.45); FX.chest.children[1].rotation.x = -k * 1.9; FX.chest.position.y = 0.2 + k * 0.25; }
    if (mode === "over" && R) for (let i = mons.length - 1; i >= 0; i--) { const m = mons[i]; m.flash = Math.max(0, m.flash - real * 5); if (m.st === "die") { m.at += real; if (m.at > m.kd.R.die.dur + 0.45) { monFree.push(m); mons[i] = mons[mons.length - 1]; mons.pop(); } } } // the fallen finish fading behind the result
    if (R) drawMons(vis, t);
    drawFx(vis);
    if (hero) { hero.obj.position.set(R ? R.x : 0, 0, R ? R.z : 0); const mv = mode === "play" && R && Math.hypot(R.vx, R.vz) > 0.3;
      // the heroes' clips are "walk" and "sprint" (world-kit CU_AS; there is no "run": asking for it fell back to idle)
      const v = R ? Math.hypot(R.vx, R.vz) : 0, want = mode === "over" && R && R.hp <= 0 ? "die" : !mv ? "idle" : v > 9 ? "sprint" : "walk";
      if (hero.play && !(hero.busy && hero.busy())) hero.play(want, { speed: want === "walk" ? Math.max(0.8, v / 6.1) : 1 });
      const inner = hero.obj.children[0]; if (inner && !hero.bot) inner.rotation.x += ((mv ? Math.min(1, v / 12) * 0.14 : 0) - inner.rotation.x) * 0.15; // lean into the run
      if (mode !== "pause" && mode !== "cards") hero.update(real, t, mv ? 1 : 0, 0);
      if (mode === "lobby") hero.obj.rotation.y += real * 0.7; else if (R) hero.obj.rotation.y += Math.atan2(Math.sin(R.face - hero.obj.rotation.y), Math.cos(R.face - hero.obj.rotation.y)) * Math.min(1, real * 14); }
    if (FX) { FX.heroShadow.position.set(R ? R.x : 0, 0.03, R ? R.z : 0); FX.magnet.position.set(R ? R.x : 0, 0.05, R ? R.z : 0); const mg = R ? stat.magnet() : 2.2; FX.magnet.scale.set(mg, 1, mg); FX.magnet.visible = mode === "play";
      FX.shieldM.visible = !!(R && R.shield && mode === "play"); if (FX.shieldM.visible) { FX.shieldM.position.set(R.x, 1.1, R.z); FX.shieldM.scale.setScalar(1 + Math.sin(t * 4) * 0.04); } }
    S.flames.scale.set(1, 1 + Math.sin(t * 9) * 0.08, 1); S.runeM.rotation.z = t * 0.05; S.cracks.material.opacity = 0.7 + Math.sin(t * 2.2) * 0.3;
    if (Q) { const p = S.ep; for (let i = 0; i < p.length; i += 3) { p[i + 1] += real * (0.6 + (i % 7) * 0.12); p[i] += Math.sin(t + i) * real * 0.2; if (p[i + 1] > 14) p[i + 1] = 0; } S.embers.geometry.attributes.position.needsUpdate = true; } S.embers.visible = Q > 0;
    sky(R ? R.t : 0);
    camera(real); paintHud(t); paintArrows(); jsMs += (performance.now() - js0 - jsMs) * 0.1;
  }
  // quality follows the frame time: slower than ~42 fps for 2 s → one step down; faster than ~58 for 8 s → one up
  // quality follows the frame time against the frame limit (30 on phones, 60 on PCs): 40% slower than the limit for
  // 2 s → one step down; at the limit for 8 s → one up (never above the town's own quality setting)
  let capMs = 1000 / 60;
  function adapt(real) {
    frameMs += (real * 1000 - frameMs) * 0.05; if (mode !== "play") return; sample(real); qT += real; if (qT < 2) return; qT = 0;
    if (frameMs > capMs * 1.4 && Q > 0) { Q--; qGood = 0; applyQ(); } else if (frameMs < capMs * 1.08 && Q < Qmax) { if ((qGood += 2) >= 8) { Q++; qGood = 0; applyQ(); } } else qGood = 0;
  }
  function applyQ() {
    try { const pr = [Math.min(prOrig, 0.8), Math.min(prOrig, 1.0), Math.min(prOrig, 1.5)][Q]; if (st.renderer.getPixelRatio() !== pr) st.renderer.setPixelRatio(pr); } catch { /* keeps its resolution */ }
    if (on) try { st.view(S.scene, S.cam, Q === 2 && S.comp ? S.comp : null); } catch { /* drawn plain */ }
  }
  // the run's frames for the device health board (api: world-diag kind "surv"): after 60 s of play, then every 3 minutes,
  // the typical frame rate and the slowest tenth in bands, with the quality step, the chip family and the crowd's size
  const fpsBand = (f) => (f < 15 ? 0 : f < 20 ? 1 : f < 25 ? 2 : f < 30 ? 3 : f < 40 ? 4 : f < 50 ? 5 : f < 55 ? 6 : 7);
  let ft = [], ftPlay = 0, ftNext = 60, ftSent = 0;
  function sample(real) {
    if (real <= 0 || real > 1 || document.hidden) return; ft.push(real * 1000); ftPlay += real; if (ftPlay < ftNext || ftSent >= 6 || ft.length < 120 || !ctx.post) return;
    ftSent++; ftNext = ftPlay + 180; const a = ft.sort((x, y) => x - y); ft = [];
    const alive = mons.length, crowd = alive < 40 ? 0 : alive < 90 ? 1 : alive < 150 ? 2 : 3;
    try { if (!/[?&]nodiag\b/.test(location.search) && !navigator.webdriver) ctx.post({ action: "world-diag", kind: "surv", dev: ctx.coarse ? "phone" : "pc", q: String(ctx.quality || "auto"), sq: Q, fam: ctx.fam || "other", p50: fpsBand(1000 / a[Math.floor(a.length * 0.5)]), p10: fpsBand(1000 / a[Math.min(a.length - 1, Math.floor(a.length * 0.9))]), crowd }).catch(() => {}); } catch { /* the health board waits */ }
  }
  function camera(dt) {
    const o = phone() || S.cam.aspect < 0.8 ? CAM_PHONE : CAM_PC, lobby = mode === "lobby"; let x = R ? R.x : 0, z = R ? R.z : 0;
    if (R && R.focus) { R.focus.t -= dt; const k = Math.min(1, R.focus.t > 0.4 ? 1 : R.focus.t / 0.4); x += (R.focus.x - x) * k * 0.7; z += (R.focus.z - z) * k * 0.7; if (R.focus.t <= 0) R.focus = null; }
    if (R && mode === "play") { x += R.vx * 0.12; z += R.vz * 0.12; } // look a little ahead of where you run
    const crowd = R ? Math.min(1, mons.length / 160) : 0, zk = (lobby ? 1 : camK) * (1 + crowd * 0.1);
    const tx = x + o[0], ty = lobby ? 7 : o[1] * zk, tz = z + (lobby ? 11 : o[2] * zk);
    if (!camInit) { camP.set(tx, ty, tz); camL.set(x, lobby ? 1.3 : 0, z); camInit = true; }
    const k = Math.min(1, dt * (lobby ? 3 : 6)); camP.x += (tx - camP.x) * k; camP.y += (ty - camP.y) * k; camP.z += (tz - camP.z) * k; camL.x += (x - camL.x) * k; camL.y += ((lobby ? 1.3 : 0) - camL.y) * k; camL.z += (z - camL.z) * k;
    S.cam.position.copy(camP); if (shakeK > 0 && !reduce) { S.cam.position.x += (Math.random() - 0.5) * shakeK * 0.6; S.cam.position.z += (Math.random() - 0.5) * shakeK * 0.6; } shakeK = Math.max(0, shakeK - dt * 2.5);
    S.cam.lookAt(camL); const asp = innerWidth / Math.max(1, innerHeight); if (Math.abs(S.cam.aspect - asp) > 0.001) { S.cam.aspect = asp; S.cam.updateProjectionMatrix(); }
    S.cam.updateMatrixWorld(); m4.multiplyMatrices(S.cam.projectionMatrix, S.cam.matrixWorldInverse); frustum.setFromProjectionMatrix(m4);
  }
  let stepN = 0;
  function step(dtS) {
    const dt = dtS; stepN++;
    R.t += dt;
    for (let i = events.length - 1; i >= 0; i--) if (events[i].at <= R.t) { const e = events[i]; events.splice(i, 1); runEvent(e); if (!R || R.over) return; }
    // move
    let ix = 0, iz = 0; if (keys.has("a") || keys.has("arrowleft")) ix -= 1; if (keys.has("d") || keys.has("arrowright")) ix += 1; if (keys.has("w") || keys.has("arrowup")) iz -= 1; if (keys.has("s") || keys.has("arrowdown")) iz += 1;
    if (joy.on) { ix = joy.dx; iz = joy.dy; } const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    R.dashCd -= dt; R.hurtT -= dt; if (R.dashT > 0) R.dashT -= dt; if (R.streakT > 0 && (R.streakT -= dt) <= 0) R.streak = 0;
    const sp = stat.speed() * (R.dashT > 0 ? 3.4 : 1), a = Math.min(1, dt * (R.dashT > 0 ? 30 : 20));
    R.vx += (ix * sp - R.vx) * a; R.vz += (iz * sp - R.vz) * a; if (R.dashT > 0 && il < 0.1) { R.vx = Math.sin(R.face) * sp; R.vz = Math.cos(R.face) * sp; }
    R.x += R.vx * dt; R.z += R.vz * dt; const rr = Math.hypot(R.x, R.z); if (rr > ARENA_R - 1) { R.x *= (ARENA_R - 1) / rr; R.z *= (ARENA_R - 1) / rr; }
    const moving = Math.hypot(R.vx, R.vz) > 0.5;
    if (moving) { R.face = Math.atan2(R.vx, R.vz); if (Q && Math.random() < dt * 8) glow(R.x - R.vx * 0.05, 0.15, R.z - R.vz * 0.05, 0.5, 0x9a8a7a, 0.4, GROW, 0.35); }
    if (R.dashT > 0) { const c = R.hero.color === "#ff6fc8" ? 0xff6fc8 : R.hero.color === "#9b6bff" ? 0x9b6bff : 0x38d8ff; glow(R.x, 1, R.z, 1.4, c, 0.35, SHRINK, 0.7); glow(R.x, 0.3, R.z, 0.9, 0xffffff, 0.25, SHRINK, 0.5); }
    if (stat.regen() > 0) heal(stat.regen() * dt);
    // the clock
    if (R.bossNext < BOSSES.length && R.t >= RULES.BOSS_AT[R.bossNext]) { spawnBoss(R.bossNext); R.bossNext++; }
    if (R.t >= RULES.RUN_S && !R.said.s12) { R.said.s12 = 1; R.clear = true; banner(T("Survived 12 minutes!"), ""); snd("win"); }
    if (R.swarmAt.length && R.t >= R.swarmAt[0]) { R.swarmAt.shift(); swarm(R.swarmAt.length); }
    if ((R.eliteT -= dt) <= 0) { R.eliteT = 38 - Math.min(18, R.t / 40); const id = eliteAt(R.t); if (id) { edgePoint(); spawn(id, ep.x, ep.z); } }
    if ((R.spawnT -= dt) <= 0) { R.spawnT = 0.35; spawnRing(); }
    if (R.t >= RULES.END_S) { endRun("time"); return; }
    // the grid (cell lists reused frame to frame)
    for (const l of cells) l.length = 0; for (const m of mons) { if (m.st === "die") continue; const k = key(m.x, m.z); let l = grid.get(k); if (!l) { grid.set(k, (l = [])); cells.push(l); } l.push(m); }
    // monsters (the far ones, off the screen's edge, think every other step with twice the time: about half the work)
    for (const m of mons) {
      const far = !m.boss && Math.abs(R.x - m.x) + Math.abs(R.z - m.z) > 30; if (far && ((m.uid + stepN) & 1)) { m.at += dtS; continue; }
      const dt = far ? dtS * 2 : dtS;
      if (m.st === "die") { m.at += dt; continue; }
      m.flash = Math.max(0, m.flash - dt * 5); m.slow = Math.max(0, m.slow - dt); m.born = Math.min(1, m.born + dt * 2.5);
      const dx = R.x - m.x, dz = R.z - m.z, d = Math.hypot(dx, dz) || 0.001;
      if (R.still) { m.at += dt; continue; }
      if (m.boss && bossTick(m, dt)) { m.at += dt; continue; }
      const spd = m.sp * (m.slow > 0 ? (R.evo.zero && m.slow > 1 ? 0.1 : 0.5) : 1) * (m.st === "atk" ? 0.25 : 1);
      if (m.dir) { m.x += m.dir.x * spd * dt; m.z += m.dir.z * spd * dt; if (Math.hypot(m.x, m.z) > ARENA_R - 1 || d > 30) m.dir = null; }
      else if (d > m.r + HERO_R + 0.1) { m.x += (dx / d) * spd * dt; m.z += (dz / d) * spd * dt; }
      m.x += m.vx * dt; m.z += m.vz * dt; m.vx *= Math.max(0, 1 - dt * 6); m.vz *= Math.max(0, 1 - dt * 6);
      const want = m.dir ? Math.atan2(m.dir.x, m.dir.z) : Math.atan2(dx, dz); m.face += Math.atan2(Math.sin(want - m.face), Math.cos(want - m.face)) * Math.min(1, dt * 8);
      const ck = key(m.x, m.z), cx = (ck >> 8) - 64, cz = (ck & 255) - 64;
      for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) { const l = grid.get(((i + 64) << 8) | (j + 64)); if (!l) continue;
        for (const o of l) { if (o === m) continue; const ox = m.x - o.x, oz = m.z - o.z, od = ox * ox + oz * oz, rs = m.r + o.r; if (od < rs * rs && od > 1e-6) { const s = Math.sqrt(od), push = (rs - s) * 0.5 * (o.boss ? 1.6 : m.boss ? 0.1 : 1); m.x += (ox / s) * push; m.z += (oz / s) * push; } } }
      m.atkCd -= dt; m.at += dt;
      if (d < m.r + HERO_R + 0.35 && m.atkCd <= 0) { m.atkCd = 0.9; if (!m.boss) { m.st = "atk"; m.at = 0; } hurtHero(m.dmg, m.id); }
      if (m.st === "atk" && m.at > m.kd.R.atk.dur) { m.st = "move"; m.at = 0; }
      if (m.elite && Q) ring(m.x, m.z, m.r * 1.4, m.r * 1.4, 0xff5ad8, 0, SPIN | ONE, 0.6);
      const r2 = Math.hypot(m.x, m.z); if (r2 > ARENA_R - 0.5) { m.x *= (ARENA_R - 0.5) / r2; m.z *= (ARENA_R - 0.5) / r2; }
    }
    for (let i = mons.length - 1; i >= 0; i--) { const m = mons[i]; if (m.st === "die" && m.at > m.kd.R.die.dur + 0.45) { monFree.push(m); mons[i] = mons[mons.length - 1]; mons.pop(); } }
    // your shots
    for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.t += dt; s.x += s.vx * dt; s.z += s.vz * dt; let gone = s.t > s.life;
      if (!gone) near(s.x, s.z, 0.35, (m) => { if (gone || m.uid === s.h0 || m.uid === s.h1 || m.uid === s.h2) return; s.h2 = s.h1; s.h1 = s.h0; s.h0 = m.uid; hitMon(m, s.dmg, s.src, { kb: 1.5, fx: s.x - s.vx, fz: s.z - s.vz }); glow(s.x, 1, s.z, 0.9, s.c, 0.15, GROW);
        if (pv("boom")) { const r = 1.1 + 0.2 * pv("boom"); ring(s.x, s.z, 0.2, r, 0xffb03a, 0.25, EASE); near(s.x, s.z, r, (o) => { if (o !== m) hitMon(o, s.dmg * 0.4, "boom"); }); } if (s.pierce-- <= 0) gone = true; });
      if (gone) { shotFree.push(s); shots[i] = shots[shots.length - 1]; shots.pop(); continue; }
      const sp = Math.hypot(s.vx, s.vz) || 1; beam(s.x - (s.vx / sp) * 0.9, 1, s.z - (s.vz / sp) * 0.9, s.x, 1, s.z, s.c === 0xfff07a ? 0.42 : 0.3, s.c, 0, ONE); glow(s.x, 1, s.z, s.c === 0xfff07a ? 0.6 : 0.42, 0xffffff, 0, ONE); }
    for (let i = foes.length - 1; i >= 0; i--) { const s = foes[i]; s.t += dt; s.x += s.vx * dt; s.z += s.vz * dt; let gone = s.t > 4 || Math.hypot(s.x, s.z) > ARENA_R;
      if (!gone && Math.hypot(s.x - R.x, s.z - R.z) < 0.6) { hurtHero(s.dmg, "shot"); gone = true; }
      if (gone) { foeFree.push(s); foes[i] = foes[foes.length - 1]; foes.pop(); continue; }
      glow(s.x, 1, s.z, 1.1, 0xff4a1a, 0, PULSE | ONE); glow(s.x, 1, s.z, 0.45, 0xffe0a0, 0, ONE); }
    zones1(dt);
    weapons(dt);
    if (!R || R.over) return;
    R.skillCd -= dt; if (R.overT > 0) R.overT -= dt;
    // crates: one turns up near you now and then; walk into it for a heal, a magnet or a bomb
    if ((R.crateT -= dt) <= 0 && R.crates.length < 2) { R.crateT = 22; const a = Math.random() * 6.283, d = 8 + Math.random() * 5; let x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d; const rr2 = Math.hypot(x, z); if (rr2 > ARENA_R - 3) { x *= (ARENA_R - 3) / rr2; z *= (ARENA_R - 3) / rr2; }
      R.crates.push({ x, z, kind: ["heal", "magnet", "bomb"][Math.floor(Math.random() * 3)], t: 0 }); ring(x, z, 0.3, 1.6, 0xffd23a, 0.5, EASE); }
    for (let i = R.crates.length - 1; i >= 0; i--) { const c = R.crates[i]; c.t += dt; if (Math.hypot(R.x - c.x, R.z - c.z) > 1.3) continue; R.crates.splice(i, 1); sparks(c.x, 0.8, c.z, 0xd8a060, 12, 5);
      if (c.kind === "heal") { heal(25); num(R.x, 2.4, R.z, 25, 0x5aff8a, true); ring(R.x, R.z, 0.3, 2.5, 0x5aff8a, 0.5, EASE); snd("heart"); }
      else if (c.kind === "magnet") { for (const g of gems) g.pull = true; ring(R.x, R.z, 0.5, 14, 0x8ff0ff, 0.7, EASE); snd("coin"); }
      else { ring(c.x, c.z, 0.5, 8, 0xffb03a, 0.5, EASE); disc(c.x, c.z, 8, 0xff7a2a, 0.3, 0, 0.5); glow(c.x, 1, c.z, 7, 0xffa040, 0.35, GROW, 0.7); shakeK = Math.max(shakeK, 0.7); for (const m of mons) if (m.st !== "die" && (m.x - c.x) ** 2 + (m.z - c.z) ** 2 < 64) hitMon(m, 150, "crate", { kb: 9, fx: c.x, fz: c.z }); snd("impact"); } }
    // the lava cracks flare up after 1:30: the three nearest glow red, then burst
    if (R.t > 90 && (R.lavaT -= dt) <= 0) { R.lavaT = 24 - Math.min(10, R.t / 60); const near3 = S.crackPos.slice().sort((p, q) => (p[0] - R.x) ** 2 + (p[1] - R.z) ** 2 - ((q[0] - R.x) ** 2 + (q[1] - R.z) ** 2)).slice(0, 3);
      for (const [x, z] of near3) { disc(x, z, 2.6, 0xff4a1a, 1.4, HOLD, 0.6); ring(x, z, 0.4, 2.6, 0xff8a3a, 1.4, EASE); later(1.4, "lava", x, z); } }
    // gems
    const mg = stat.magnet(), gk = 1 + 0.1 * pv("gold");
    for (let i = gems.length - 1; i >= 0; i--) { const g = gems[i]; g.t += dt; const dx = R.x - g.x, dz = R.z - g.z, d = Math.hypot(dx, dz);
      if (g.pull || d < mg) { g.pull = true; const s = Math.min(d, (8 + g.t * 6) * dt); g.x += (dx / (d || 1)) * s; g.z += (dz / (d || 1)) * s; }
      if (d < 0.6) { R.xp += g.v * gk; gemFree.push(g); gems[i] = gems[gems.length - 1]; gems.pop(); snd("pick", 60); while (R.xp >= R.need) { R.xp -= R.need; R.lv++; R.need = needXp(R.lv); R.pendingLv++; } } }
    if (gems.length > 800) { gems[1].v += gems[0].v; gemFree.push(gems[0]); gems[0] = gems[gems.length - 1]; gems.pop(); }
    if (R.chest) { R.chest.t += dt; FX.chest.rotation.y = R.chest.t * 1.5; FX.chest.position.y = 0.2 + Math.sin(R.chest.t * 3) * 0.12; if (Q && Math.random() < dt * 10) glow(R.chest.x + (Math.random() - 0.5), 1 + Math.random(), R.chest.z + (Math.random() - 0.5), 0.3, 0xffd23a, 0.5, SHRINK);
      if (Math.hypot(R.x - R.chest.x, R.z - R.chest.z) < 1.4) { const c = R.chest, gold = c.boss, col0 = gold ? 0xffd23a : 0x8fd8ff; R.chest = null; mode = "open"; opening = { t: 0, x: c.x, z: c.z };
        beam(c.x, 0.2, c.z, c.x, 9, c.z, 2.4, col0, 1.0, PULSE, 0.9); beam(c.x, 0.2, c.z, c.x, 9, c.z, 0.7, 0xffffff, 0.9); ring(c.x, c.z, 0.3, 4, col0, 0.6, EASE); sparks(c.x, 1, c.z, col0, 24, 6); snd("chest");
        setTimeout(() => { if (on && mode === "open") runEvent({ kind: "chest", a: gold }); }, 750); if (R.pendingChest > 0) { R.pendingChest--; edgePoint(6); dropChest(ep.x, ep.z); } return; } }
    if (R.pendingLv > 0 && mode === "play") { R.pendingLv--; ring(R.x, R.z, 0.3, 4, 0x8ff0ff, 0.5, EASE); showCards(false); }
  }
  // the crowd onto its meshes (only what the camera sees), and the soft shadows under all of them
  function drawMons(dt, t) {
    for (const id in pack) { const kd = pack[id]; if (kd.mesh) kd.mesh.count = 0; if (kd.edge) kd.edge.count = 0; }
    let sh = 0;
    for (const m of mons) {
      const kd = m.kd, mesh = kd.mesh; if (!mesh) continue;
      sph.center.set(m.x, MON[m.id].h * 0.5 + m.fly, m.z); sph.radius = MON[m.id].h; if (!frustum.intersectsSphere(sph)) continue;
      const i = mesh.count; if (i >= mesh.instanceMatrix.count) continue;
      const role = m.st === "die" ? "die" : m.st === "atk" ? "atk" : "move", animT = role === "move" ? m.at * m.sp * 0.42 * kd.R.move.dur : m.at * (role === "die" ? 1.3 : 1.2);
      const f = frameOf(kd, role, animT); kd.anim.setXYZW(i, f[0], f[1], f[2], m.st === "die" ? 0 : m.flash * (m.boss ? 0.28 : m.elite ? 0.5 : 0.8)); // (a boss under fire every frame would stay white)
      if (m.st === "die") m.dis = Math.min(1.1, Math.max(0, (m.at - kd.R.die.dur * 0.5) / 0.55)); kd.fx.setXY(i, m.dis, m.rage ? 1 : 0);
      const s = m.born < 1 ? 0.5 + m.born * 0.5 : 1, y = (m.fly ? m.fly + Math.sin(t * 3 + m.bob) * 0.15 : 0) - (1 - Math.min(1, m.born * 1.4)) * MON[m.id].h * 0.6;
      qq.setFromEuler(ee.set(0, m.face, 0)); mesh.setMatrixAt(i, m4.compose(vv.set(m.x, y, m.z), qq, ss.set(s, s, s))); mesh.count = i + 1;
      if (sh < FX.shadow.instanceMatrix.count && m.st !== "die") { const r = m.r * 1.5 * (m.fly ? 0.8 : 1); FX.shadow.setMatrixAt(sh++, m4.compose(vv.set(m.x, 0.025, m.z), qq.identity(), ss.set(r, 1, r))); }
    }
    for (const id in pack) { const kd = pack[id]; if (kd.edge) kd.edge.count = Q === 2 ? kd.mesh.count : 0; if (kd.mesh) { kd.mesh.instanceMatrix.needsUpdate = true; kd.anim.needsUpdate = true; kd.fx.needsUpdate = true; } }
    FX.shadow.count = sh; FX.shadow.instanceMatrix.needsUpdate = true;
    const gm = FX.gem; let n = 0; for (const g of gems) { if (n >= gm.instanceMatrix.count) break; const s = g.v >= 10 ? 1.9 : g.v >= 3 ? 1.4 : 1; qq.setFromEuler(ee.set(0, t * 2 + g.x, 0)); gm.setMatrixAt(n, m4.compose(vv.set(g.x, 0.4 + Math.sin(t * 4 + g.z) * 0.08, g.z), qq, ss.set(s, s, s))); gm.setColorAt(n, col.set(g.v >= 10 ? 0xff5ad8 : g.v >= 3 ? 0x39ff88 : 0x38b8ff)); n++;
      if (g.pull && Q && (n & 3) === 0) glow(g.x, 0.4, g.z, 0.35, g.v >= 3 ? 0x39ff88 : 0x38b8ff, 0.2, SHRINK, 0.7); }
    gm.count = n; gm.instanceMatrix.needsUpdate = true; if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
    const cm = FX.crate; let c = 0; for (const k of R.crates) { if (c >= 4) break; qq.setFromEuler(ee.set(0, t * 0.8 + c, 0)); cm.setMatrixAt(c++, m4.compose(vv.set(k.x, 0.45 + Math.sin(t * 2.5 + c) * 0.08, k.z), qq, ss.set(1, 1, 1)));
      if (Q && (Math.floor(t * 20) % 6 === c)) glow(k.x, 1.2, k.z, 0.4, k.kind === "heal" ? 0x5aff8a : k.kind === "magnet" ? 0x8ff0ff : 0xffb03a, 0.4, SHRINK, 0.8); }
    cm.count = c; cm.instanceMatrix.needsUpdate = true;
  }

  // ---------------- the HUD ----------------
  const scaleK = () => (document.documentElement.classList.contains("wp-pcphone") ? innerWidth / 400 : Math.max(1, Math.min(1.25, innerHeight / 860)));
  function fit() { if (!ui) return; const k = scaleK(); Object.assign(ui.root.style, { width: innerWidth / k + "px", height: innerHeight / k + "px", transform: `scale(${k})` }); }
  function buildUi() {
    const root = document.createElement("div"); root.className = "sv"; root.hidden = true;
    root.innerHTML = `<div class="sv-vig"></div><div class="sv-hurt"></div><div class="sv-stripes" aria-hidden="true"></div>
      <div class="sv-top" data-game-hud>
        <button type="button" class="sv-pause" aria-label="${esc(T("Paused"))}"><svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg></button>
        <div class="sv-hp"><i></i><b>100</b></div>
        <div class="sv-time"><b>00:00</b><small>12:00</small></div>
        <div class="sv-kills"><svg viewBox="0 0 24 24"><path d="M12 2c5 0 8 3.6 8 8 0 3-1.6 5-3.5 6v3h-9v-3C5.6 15 4 13 4 10c0-4.4 3-8 8-8z"/><circle cx="9" cy="10.5" r="1.8" fill="#0a1a42"/><circle cx="15" cy="10.5" r="1.8" fill="#0a1a42"/></svg><b>0</b></div>
      </div>
      <div class="sv-boss" hidden><b></b><div><i></i></div></div>
      <div class="sv-slots"></div>
      <div class="sv-streak" hidden><b></b><small>${esc(T("Chain Kill"))}</small></div>
      <i class="sv-arrow boss" hidden></i><i class="sv-arrow chest" hidden></i>
      <div class="sv-xp"><i></i><b>Lv 1</b></div>
      <div class="sv-joy" aria-hidden="true"><i></i></div>
      <button type="button" class="sv-skill" aria-label="${esc(T("Skill"))}"><span class="sv-skill-ic"></span><b></b><i class="sv-dash-cd"></i></button>
      <button type="button" class="sv-dash" aria-label="${esc(T("Dash"))}"><svg viewBox="0 0 24 24"><path d="M4 12h10M10 6l6 6-6 6M18 5v14"/></svg><b>${esc(T("Dash"))}</b><i class="sv-dash-cd"></i></button>
      <div class="sv-keys">${esc(T("WASD move · Space dash · Q skill · Esc pause"))}</div>
      <div class="sv-banner" hidden><small></small><b></b></div>
      <div class="sv-hint" hidden></div>
      <div class="sv-cards" hidden></div>
      <div class="sv-sheet" hidden></div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    ui = { root, hp: q(".sv-hp i"), hpN: q(".sv-hp b"), time: q(".sv-time b"), kills: q(".sv-kills b"), boss: q(".sv-boss"), bossN: q(".sv-boss b"), bossI: q(".sv-boss i"), slots: q(".sv-slots"), xp: q(".sv-xp i"), lv: q(".sv-xp b"),
      joy: q(".sv-joy"), knob: q(".sv-joy i"), dash: q(".sv-dash"), dashCd: q(".sv-dash-cd"), banner: q(".sv-banner"), cards: q(".sv-cards"), sheet: q(".sv-sheet"), hurt: q(".sv-hurt"), top: q(".sv-top"),
      aBoss: q(".sv-arrow.boss"), aChest: q(".sv-arrow.chest"), streak: q(".sv-streak"), streakN: q(".sv-streak b"), hint: q(".sv-hint") };
    q(".sv-pause").addEventListener("click", () => pause());
    ui.dash.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); dash(); });
    ui.skill = q(".sv-skill"); ui.skillCd = q(".sv-skill .sv-dash-cd"); ui.skill.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); skill(); });
    root.addEventListener("pointerdown", (e) => { if (mode !== "play" || joy.on || e.target.closest("button,.sv-cards,.sv-sheet")) return; e.preventDefault(); const k = scaleK(); joy.on = true; joy.id = e.pointerId; joy.x0 = e.clientX / k; joy.y0 = e.clientY / k; joy.dx = joy.dy = 0; try { root.setPointerCapture(e.pointerId); } catch { /* fine */ } paintJoy(); });
    root.addEventListener("pointermove", (e) => { if (!joy.on || e.pointerId !== joy.id) return; const k = scaleK(), mx = 46; let dx = e.clientX / k - joy.x0, dy = e.clientY / k - joy.y0; const l = Math.hypot(dx, dy); if (l > mx) { dx *= mx / l; dy *= mx / l; } const k2 = l < 1 ? 0 : Math.min(1, Math.max(0, (Math.min(l, mx) / mx - 0.1) / 0.6)) / Math.min(1, Math.min(l, mx) / mx); joy.dx = (dx / mx) * k2; joy.dy = (dy / mx) * k2; paintJoy(); }); // full speed from 70% of the pad's reach, a small dead zone at its middle
    const up = (e) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.dx = joy.dy = 0; paintJoy(); };
    root.addEventListener("pointerup", up); root.addEventListener("pointercancel", up); root.addEventListener("lostpointercapture", up);
    addEventListener("resize", fit); fit();
  }
  function paintJoy() { if (!ui) return; ui.joy.classList.toggle("on", joy.on); if (joy.on) { ui.joy.style.left = joy.x0 + "px"; ui.joy.style.top = joy.y0 + "px"; ui.knob.style.transform = `translate(${joy.dx * 46}px,${joy.dy * 46}px)`; } else { ui.joy.style.left = ""; ui.joy.style.top = ""; ui.knob.style.transform = ""; } }
  function skill() {
    if (mode !== "play" || !R || R.skillCd > 0) return; const h = R.hero; R.skillCd = h.scd; snd("jackpot");
    if (h.skill === "overdrive") { for (let k = 0; k < 12; k++) later(k * 0.02, "laser", (k / 12) * Math.PI * 2, 15 * stat.reach(), 0.7 * stat.area(), 60); R.overT = 4; ring(R.x, R.z, 0.5, 5, 0x38d8ff, 0.5, EASE); }
    else if (h.skill === "bloom") { heal(R.hpMax * 0.3); num(R.x, 2.4, R.z, R.hpMax * 0.3, 0x5aff8a, true); const r = 6 * stat.area(); ring(R.x, R.z, 0.5, r, 0xff6fc8, 0.6, EASE); disc(R.x, R.z, r, 0xff8ad8, 0.6, 0, 0.45);
      for (let k = 0; k < 14; k++) { const a = Math.random() * 6.283, d = Math.random() * r; const g = glow(R.x + Math.cos(a) * d, 0.3, R.z + Math.sin(a) * d, 0.6, k % 2 ? 0xff8ad8 : 0xffffff, 1.0, SHRINK); if (g) g.vy = 1.5; }
      for (const m of mons) if (m.st !== "die" && (m.x - R.x) ** 2 + (m.z - R.z) ** 2 < r * r) hitMon(m, 40, "skill", { slow: 3, kb: 6 }); }
    else { let ix = R.vx, iz = R.vz; const l = Math.hypot(ix, iz); if (l < 0.5) { ix = Math.sin(R.face); iz = Math.cos(R.face); } else { ix /= l; iz /= l; }
      const x0 = R.x, z0 = R.z; let x1 = R.x + ix * 7, z1 = R.z + iz * 7; const rr = Math.hypot(x1, z1); if (rr > ARENA_R - 1) { x1 *= (ARENA_R - 1) / rr; z1 *= (ARENA_R - 1) / rr; }
      beam(x0, 1, z0, x1, 1, z1, 1.2, 0x9b6bff, 0.4, 0, 0.9); beam(x0, 1, z0, x1, 1, z1, 0.35, 0xffffff, 0.3); R.x = x1; R.z = z1; R.hurtT = 0.6; camInit = true;
      for (const [x, z] of [[x0, z0], [x1, z1]]) { ring(x, z, 0.3, 3.5, 0xb48cff, 0.4, EASE); for (const m of mons) if (m.st !== "die" && (m.x - x) ** 2 + (m.z - z) ** 2 < 12.25) hitMon(m, 50, "skill", { kb: 8, fx: x, fz: z }); } }
  }
  function dash() { if (mode !== "play" || !R || R.dashCd > 0) return; R.dashT = DASH_T; R.dashCd = DASH_CD; snd("dash"); ring(R.x, R.z, 0.3, 2.2, 0xbff6ff, 0.3, EASE, 0.7); }
  let lastHud = 0;
  function paintHud(t) {
    if (!ui || !R || t - lastHud < 0.1) return; lastHud = t;
    ui.hp.style.transform = `scaleX(${Math.max(0, R.hp / R.hpMax).toFixed(3)})`; ui.hpN.textContent = String(Math.ceil(R.hp)); ui.root.classList.toggle("low", R.hp / R.hpMax < 0.3);
    ui.time.textContent = mmss(R.t); ui.kills.textContent = fmt(R.kills); ui.xp.style.transform = `scaleX(${Math.min(1, R.xp / R.need).toFixed(3)})`; ui.lv.textContent = T("Lv {n}", { n: R.lv });
    ui.dashCd.style.transform = `scaleY(${Math.max(0, R.dashCd / DASH_CD).toFixed(3)})`; ui.dash.classList.toggle("cool", R.dashCd > 0);
    ui.skillCd.style.transform = `scaleY(${Math.max(0, R.skillCd / R.hero.scd).toFixed(3)})`; ui.skill.classList.toggle("cool", R.skillCd > 0); ui.skill.classList.toggle("ready", R.skillCd <= 0);
    if (R.boss) ui.bossI.style.transform = `scaleX(${Math.max(0, R.boss.hp / R.boss.hpMax).toFixed(3)})`;
    const sk = pv("streak") && R.streak >= 3; ui.streak.hidden = !sk; if (sk) ui.streakN.textContent = "×" + R.streak;
  }
  // arrows at the screen's edge toward a boss or a chest you can't see
  function paintArrows() {
    if (!ui) return; const k = scaleK(), W0 = innerWidth / k, H0 = innerHeight / k;
    const one = (el, x, z, show) => { if (!show) { el.hidden = true; return; } vA.set(x, 1, z).project(S.cam); const inside = Math.abs(vA.x) < 0.92 && Math.abs(vA.y) < 0.9 && vA.z < 1; if (inside) { el.hidden = true; return; }
      let ax = vA.x, ay = vA.y; if (vA.z > 1) { ax = -ax; ay = -ay; } const m = Math.max(Math.abs(ax) / 0.86, Math.abs(ay) / 0.78) || 1; ax /= m; ay /= m;
      el.hidden = false; el.style.transform = `translate(${((ax * 0.5 + 0.5) * W0).toFixed(0)}px,${((-ay * 0.5 + 0.5) * H0).toFixed(0)}px) rotate(${Math.atan2(-ay, ax).toFixed(2)}rad)`; };
    one(ui.aBoss, R && R.boss ? R.boss.x : 0, R && R.boss ? R.boss.z : 0, mode === "play" && R && !!R.boss);
    one(ui.aChest, R && R.chest ? R.chest.x : 0, R && R.chest ? R.chest.z : 0, mode === "play" && R && !!R.chest);
  }
  function paintBoss() { if (!ui) return; ui.boss.hidden = !(R && R.boss); if (R && R.boss) { ui.bossN.textContent = T(MON[R.boss.id].boss); ui.bossI.style.transform = "scaleX(1)"; } }
  function paintSlots() { if (!ui || !R) return; const evoOf = (id) => EVOS.find((e) => e.from === id && R.evo[e.id]);
    ui.slots.innerHTML = `<div>${Object.keys(R.w).map((id) => { const e = evoOf(id); return `<span class="w${e ? " evo" : ""}">${icon(e ? e.id : id, 18)}<b>${e ? "★" : R.w[id]}</b></span>`; }).join("")}</div><div>${Object.keys(R.p).map((id) => `<span class="p${PASSIVES[id].fx ? " fx" : ""}">${icon(id, 16)}<b>${R.p[id]}</b></span>`).join("")}</div>`; }
  function banner(big, small) { if (!ui) return; ui.banner.hidden = false; ui.banner.querySelector("b").textContent = big; ui.banner.querySelector("small").textContent = small || ""; ui.banner.classList.remove("go"); void ui.banner.offsetWidth; ui.banner.classList.add("go"); clearTimeout(banner.t); banner.t = setTimeout(() => { if (ui) ui.banner.hidden = true; }, 2600); }
  function flashUi(kind) { if (!ui) return; const el = kind === "hurt" ? ui.hurt : ui.root.querySelector(".sv-vig"); el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); }
  // the first three runs: three short lines on how it works
  function hints() { let n = 0; try { n = Number(localStorage.getItem("arc.surv.runs")) || 0; localStorage.setItem("arc.surv.runs", String(n + 1)); } catch { /* every run */ } if (n >= 3) return;
    ui.hint.innerHTML = [["blaster", "Your weapons fire by themselves"], ["gem", "Grab the blue gems to level up"], ["speed", "Dash through danger"]].map(([ic, s]) => `<p>${ic === "gem" ? '<i class="sv-gem-ic"></i>' : icon(ic, 18)}<span>${esc(T(s))}</span></p>`).join("");
    ui.hint.hidden = false; ui.hint.classList.remove("go"); void ui.hint.offsetWidth; ui.hint.classList.add("go"); setTimeout(() => { if (ui) ui.hint.hidden = true; }, 6500); }

  // ---------------- the lobby, the pause, the result ----------------
  let status = null, board = null;
  async function readStatus() { const s = ctx.sess && ctx.sess(); status = null; const jobs = [fetch("/api/social?world=surv-top").then((r) => (r.ok ? r.json() : null)).then((j) => { board = j; }).catch(() => {})];
    if (s) jobs.push(fetch("/api/social?world=surv&wallet=" + s.wallet, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { status = j; }).catch(() => {})); await Promise.all(jobs); }
  const boardHtml = () => { const top = (board && board.top) || []; return `<div class="sv-board"><h4>${esc(T("This week"))}</h4>${top.length ? `<ol>${top.slice(0, 5).map((x, i) => `<li><em>${i + 1}</em><b>${esc(String(x.name || x.w || "?").slice(0, 14))}</b><span>${mmss(x.secs)} · ${fmt(x.kills)}</span></li>`).join("")}</ol>` : `<p>${esc(T("No runs yet — be the first!"))}</p>`}</div>`; };
  function lobby() {
    mode = "lobby"; camInit = false; applyTheme(themeToday()); const signed = !!(ctx.sess && ctx.sess()), d = RULES.DIFF[pick.diff]; if (S) sky(0);
    ui.sheet.innerHTML = `<div class="sv-lobby"><small>ARCIRCLE WORLD</small><h2>${esc(T("SURVIVORS ARENA"))}</h2><p>${esc(T("Survive 12 minutes. Beat 4 bosses."))}</p><p class="sv-theme">${esc(T("Today's arena: {x}", { x: T(THEMES[themeToday()].name) }))}</p>
      <h4>${esc(T("Choose your hero"))}</h4><div class="sv-heroes">${HEROES.map((h, i) => `<button type="button" data-h="${i}" class="${i === pick.hero ? "on" : ""}" style="--c:${h.color}"><img src="models/world/chars/${h.id}.webp?v=1" alt="" loading="lazy"><b>${esc(h.name)}</b><small>${esc(T(h.perk))}</small><small class="sk">${esc(T(h.sname))}</small><span>${icon(h.w, 18)}</span></button>`).join("")}</div>
      <p class="sv-skline">${esc(T(HEROES[pick.hero].sname))}: ${esc(T(HEROES[pick.hero].sline))}</p>
      <h4>${esc(T("Difficulty"))}</h4><div class="sv-diff">${Object.keys(RULES.DIFF).map((k) => `<button type="button" data-d="${k}" class="${k === pick.diff ? "on" : ""}"><b>${esc(T(k[0].toUpperCase() + k.slice(1)))}</b><small>×${RULES.DIFF[k].k}</small></button>`).join("")}</div>
      <div class="sv-pay">${signed ? `<b>${esc(T("Up to {n} ARCL a run · first 3 runs a day", { n: fmt(d.cap) }))}</b>${status ? `<small>${esc(T("Today: {n} / {m} ARCL", { n: fmt(status.today || 0), m: fmt(status.cap || RULES.DAY_ARCL) }))} · ${esc(T("Paid runs left today: {n}", { n: status.runsLeft ?? RULES.DAY_RUNS }))}</small>` : ""}` : `<b>${esc(T("Sign in with a wallet to earn ARCL here"))}</b>`}</div>
      ${boardHtml()}
      <div class="sv-btns"><button type="button" class="go" data-a="start">${esc(T("Start"))}</button><button type="button" data-a="leave">${esc(T("Leave"))}</button></div></div>`;
    ui.sheet.hidden = false; ui.top.hidden = true; ui.root.classList.add("menu");
    ui.sheet.querySelectorAll("[data-h]").forEach((b) => b.addEventListener("click", () => { pick.hero = Number(b.dataset.h); savePick(); snd("tab"); lobby(); setHero(HEROES[pick.hero].id); }));
    ui.sheet.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => { pick.diff = b.dataset.d; savePick(); snd("tab"); lobby(); }));
    ui.sheet.querySelector('[data-a="start"]').addEventListener("click", () => startRun());
    ui.sheet.querySelector('[data-a="leave"]').addEventListener("click", () => leave());
  }
  const savePick = () => { try { localStorage.setItem("arc.surv.pick", JSON.stringify(pick)); } catch { /* this visit only */ } };
  async function setHero(id) {
    if (heroId === id && hero) return; const want = id; heroId = id;
    const p = (heroP = ctx.makeHero(id).catch(() => null)); const c = await p; if (heroP !== p || heroId !== want) return;
    if (!c) { ctx.toast(T("The arena couldn't load: {e}", { e: "hero" })); return; }
    if (phone() || ctx.low) lighten(c.obj); // a phone draws the hero with one simple light term (its PBR shader was the town's most common phone hitch)
    if (hero && hero.obj.parent) hero.obj.parent.remove(hero.obj); hero = c; hero.obj.position.set(R ? R.x : 0, 0, R ? R.z : 0); S.scene.add(hero.obj);
    try { if (st.renderer.compileAsync && on) await st.renderer.compileAsync(S.scene, S.cam); } catch { /* compiled on its first frame */ }
  }
  function lighten(obj) { obj.traverse((o) => { if (!o.isMesh || !o.material) return; const one = (m) => { if (!m || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return m;
    const l = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side });
    l.name = m.name; return l; }; o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); }); }
  let runP = null;
  async function startRun() {
    if (mode !== "lobby") return; ui.sheet.hidden = true; ui.root.classList.remove("menu"); ui.top.hidden = false;
    await setHero(HEROES[pick.hero].id); newRun(); paintSlots(); paintBoss(); camInit = false; if (hero) hero.obj.rotation.y = 0;
    if (hero && hero.mixer && hero.play) { hero.mixer.stopAllAction(); hero.play("walk", { fade: 0 }); hero.play("idle", { fade: 0 }); hero.mixer.update(0); } // the last run's fall doesn't carry over
    { const h = HEROES[pick.hero]; ui.skill.querySelector(".sv-skill-ic").innerHTML = icon(h.skill === "overdrive" ? "laser" : h.skill === "bloom" ? "recov" : "speed", 26); ui.skill.querySelector("b").textContent = T(h.sname); ui.skill.style.setProperty("--c", h.color); }
    const ss = ctx.sess && ctx.sess();
    runP = ss && ctx.post ? ctx.post({ action: "world-surv-start", ...ss, diff: pick.diff }).then((r) => (r && r.ok && r.j && r.j.runId ? r.j : null)).catch(() => null) : Promise.resolve(null);
    mode = "count"; banner(T("3 · 2 · 1 · GO!"), T(HEROES[pick.hero].name)); snd("enter"); ring(0, 0, 0.5, 6, 0x39ff88, 1.2, EASE);
    setTimeout(() => { if (on && mode === "count") { mode = "play"; lastNow = 0; for (let i = 0; i < 6; i++) { edgePoint(); spawn("blob", ep.x, ep.z); } hints(); } }, 1500);
  }
  function pause() { if (mode !== "play") return; mode = "pause"; keys.clear(); joy.on = false; paintJoy();
    ui.sheet.innerHTML = `<div class="sv-lobby small"><h3>${esc(T("Paused"))}</h3><div class="sv-ws">${slotsHtml()}</div>${evoBook()}<p>${esc(T("Quit now? Boss bonuses are paid only if you reach 12:00."))}</p><div class="sv-btns"><button type="button" class="go" data-a="go">${esc(T("Resume"))}</button><button type="button" data-a="quit">${esc(T("Quit the run"))}</button></div></div>`;
    ui.sheet.hidden = false; ui.sheet.querySelector('[data-a="go"]').addEventListener("click", resume); ui.sheet.querySelector('[data-a="quit"]').addEventListener("click", () => { ui.sheet.hidden = true; mode = "play"; endRun("quit"); }); }
  function resume() { ui.sheet.hidden = true; mode = "play"; lastNow = 0; }
  // b-svx: the six evolutions — weapon at Lv 5 + its partner at its top level — yours lit, the ones you're building toward marked
  const evoBook = () => `<div class="sv-evob"><small>${esc(T("Evolutions"))}</small>${EVOS.map((e) => { const have = R && R.evo[e.id], near = R && (lvOf(e.from) || pv(e.with)); return `<p class="${have ? "on" : near ? "near" : ""}">${icon(e.from, 16)}<i>+</i>${icon(e.with, 16)}<i>→</i>${icon(e.id, 18)}<b>${esc(T(e.name))}</b></p>`; }).join("")}</div>`;
  const slotsHtml = () => Object.keys(R.w).map((id) => { const e = EVOS.find((x) => x.from === id && R.evo[x.id]); return `<span>${icon(e ? e.id : id, 22)}<b>${e ? "★" : R.w[id]}</b></span>`; }).join("") + Object.keys(R.p).map((id) => `<span class="p">${icon(id, 20)}<b>${R.p[id]}</b></span>`).join("");
  function countUp(el, to, fmtF, ms = 900) { if (reduce || !el) { if (el) el.textContent = fmtF(to); return; } const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - (1 - k) ** 3; el.textContent = fmtF(to * e); if (k < 1 && el.isConnected) requestAnimationFrame(f); }; f(); }
  // b-svx: what knocked you out (the last hit before the fall) and a tip for it
  const KO_N = { blob: "a Blob", pink: "a Pinky", mush: "a Mushroom", bee: "a Bee", ninja: "a Ninja", orc: "an Orc", ghost: "a Ghost", glub: "a Glub", spiky: "a Spiky elite", mushx: "a Big Mushroom", skull: "a Skull elite", yeti: "a Yeti elite" };
  const KO_P = { slam: "a ground slam", breath: "a fire breath", sweep: "a sweeping strike", laser: "a laser", meteor: "a falling meteor", lava: "lava", spore: "poison spores", charge: "a charge", shot: "a shot" };
  function koHtml() {
    const L = R && R.lastBy; if (!L) return ""; const [id, pat] = L.by.split(":"), boss = MON[id] && MON[id].boss ? id : !MON[id] && L.boss ? L.boss : "";
    const what = boss && MON[boss] ? (pat || !MON[id] ? T("{b}'s {p}", { b: T(MON[boss].boss), p: T(KO_P[pat || id] || "attack") }) : T(MON[boss].boss)) : KO_N[id] ? T(KO_N[id]) : T(KO_P[id] || "the crowd");
    const tip = boss ? T("Watch the red marks on the ground: dash out before they land.") : R.t < 240 ? T("Keep moving and grab the gems: early levels come quickly.") : T("Area weapons like Thunder Nova and Ice Storm clear a crowd.");
    return `<div class="sv-ko"><b>${esc(T("Knocked out by {x} at {t}", { x: what, t: mmss(L.t) }))}</b><small>💡 ${esc(tip)}</small></div>`;
  }
  async function endRun(how) {
    if (!R || R.over) return; R.over = true; mode = "over"; keys.clear(); joy.on = false; paintJoy(); ui.cards.hidden = true; cards = null;
    if (how === "dead" && R.t < RULES.RUN_S) R.clear = false;
    const secs = Math.floor(R.t), out = { secs, kills: R.kills, bosses: R.bosses, diff: R.diff, clear: R.clear && secs >= RULES.RUN_S };
    const xp = worldXp(out); if (ctx.gain && xp > 0) try { ctx.gain(xp, "survivors"); } catch { /* the run still ends */ }
    try { if (!/[?&]nodiag\b/.test(location.search) && !navigator.webdriver && ctx.post) ctx.post({ action: "world-diag", kind: "survrun", how, min: Math.min(15, Math.floor(R.t / 60)), hero: R.hero.id.replace("custom-", ""), diff: R.diff, w: Object.keys(R.w).slice(0, 6), evo: Object.keys(R.evo || {}).slice(0, 6), by: R.lastBy ? R.lastBy.by.split(":")[0] : "", lv: R.lv }).catch(() => {}); } catch { /* health counters never stop the game */ }
    if (ctx.addSupply) { try { if (R.loot.hp) ctx.addSupply("hp", R.loot.hp); if (R.loot.scrap) ctx.addSupply("scrap", R.loot.scrap); if (R.loot.sp) ctx.addSupply("sp", R.loot.sp); } catch { /* the run still ends */ } }
    const title = how === "win" ? T("VICTORY") : how === "dead" ? T("YOU FELL") : how === "time" ? T("TIME UP") : T("Run ended");
    snd(how === "win" ? "win" : how === "dead" ? "ko" : "tap");
    const dmg = Object.entries(R.dmgBy).filter(([k]) => WEAPONS[k]).sort((a, b) => b[1] - a[1]).slice(0, 6), top = dmg.length ? dmg[0][1] : 1;
    const dmgHtml = dmg.length ? `<div class="sv-dmg"><small>${esc(T("Damage"))}</small>${dmg.map(([k, v]) => { const e = EVOS.find((x) => x.from === k && R.evo[x.id]); return `<p>${icon(e ? e.id : k, 18)}<b>${esc(T(e ? e.name : WEAPONS[k].name))}</b><i style="--w:${Math.max(4, (v / top) * 100).toFixed(0)}%"></i><span>${fmt(v)}</span></p>`; }).join("")}</div>` : "";
    const loot = R.loot.hp || R.loot.scrap ? `<p class="sv-loot">${esc(T("Chest loot"))}: ${esc(T("HP potion"))} +${R.loot.hp}${R.loot.sp ? ` · ${esc(T("SP potion"))} +${R.loot.sp}` : ""} · ${esc(T("Scrap"))} +${R.loot.scrap}</p>` : "";
    const signed = !!(ctx.sess && ctx.sess());
    await new Promise((ok) => setTimeout(ok, how === "dead" ? 1300 : 600)); if (!on) return;
    ui.sheet.innerHTML = `<div class="sv-res ${how}"><small>${esc(T("SURVIVORS ARENA"))}</small><h2>${esc(title)}</h2>
      <div class="sv-stats"><div><small>${esc(T("Time"))}</small><b data-c="t">00:00</b></div><div><small>${esc(T("Knock-outs"))}</small><b data-c="k">0</b></div><div><small>${esc(T("Bosses"))}</small><b>${R.bosses}/4</b></div><div><small>${esc(T("Level"))}</small><b>${R.lv}</b></div></div>
      ${how === "dead" ? koHtml() : ""}${dmgHtml}${loot}
      <div class="sv-gain"><div class="sv-arcl"><i class="sv-coin"></i><b>${signed ? "…" : "0"}</b><small>${esc(signed ? T("Sending your run…") : T("Guest run: sign in to earn ARCL"))}</small></div><div class="sv-wxp"><b data-c="x">+0</b><small>${esc(T("World XP"))}</small></div></div>
      <div class="sv-btns"><button type="button" class="go" data-a="again">${esc(T("Play again"))}</button>${ctx.share ? `<button type="button" data-a="share">📸 ${esc(T("Share"))}</button>` : ""}<button type="button" data-a="leave">${esc(T("Leave"))}</button></div></div>`;
    ui.sheet.hidden = false; ui.root.classList.add("menu");
    countUp(ui.sheet.querySelector('[data-c="t"]'), secs, mmss); countUp(ui.sheet.querySelector('[data-c="k"]'), R.kills, fmt); countUp(ui.sheet.querySelector('[data-c="x"]'), xp, (v) => "+" + fmt(v));
    ui.sheet.querySelector('[data-a="again"]').addEventListener("click", () => { clearRun(); readStatus().finally(() => { if (on) lobby(); }); });
    ui.sheet.querySelector('[data-a="leave"]').addEventListener("click", () => leave());
    { const sh = ui.sheet.querySelector('[data-a="share"]'), hero = R.hero, lv = R.lv, bosses = R.bosses, kills = R.kills, best = dmg.length ? T(WEAPONS[dmg[0][0]].name) : "—";
      // a picture of the arena as it stands (drawn now and read straight away: the canvas keeps no copy)
      if (sh) sh.addEventListener("click", () => { let shotUrl = ""; try { if (S && S.scene) { st.renderer.render(S.scene, S.cam); shotUrl = st.renderer.domElement.toDataURL("image/jpeg", 0.85); } } catch { shotUrl = ""; }
        ctx.share({ kind: "surv", tag: "SURVIVORS ARENA", title, sub: `${T(hero.name)} · ${T("Level")} ${lv}`, accent: how === "win" || out.clear ? "#ffc23c" : "#39ff88", emoji: "⚔️", art: shotUrl, cover: true,
          rows: [[T("Time"), mmss(secs), "⏱️"], [T("Knock-outs"), fmt(kills), "💀"], [T("Bosses"), `${bosses}/4`, "👹"], [T("Level"), String(lv), "⬆️"], [T("Damage"), best, "🔥"]],
          text: T("I survived {t} and knocked out {k} monsters in SURVIVORS ARENA! ⚔️ Can you beat it?", { t: mmss(secs), k: fmt(kills) }) }); }); }
    if (!signed) return;
    const box = ui.sheet.querySelector(".sv-arcl"), say = (b, s) => { if (!box.isConnected) return; box.querySelector("b").textContent = b; box.querySelector("small").textContent = s; };
    let res = null;
    try { const rr = await Promise.race([runP, new Promise((ok) => setTimeout(() => ok(null), 6000))]); if (!rr || !rr.runId) throw new Error("net");
      res = await ctx.post({ action: "world-surv-end", ...ctx.sess(), runId: rr.runId, secs, kills: R.kills, bosses: R.bosses, clear: out.clear, ms: Math.round(R.t * 1000), hero: R.hero.name, lv: R.lv, how }); } catch { res = null; }
    if (!res) { say("—", T("Couldn't reach the server — try again later")); return; }
    const j = res.j || {}; if (!res.ok) { say("—", res.status === 400 || res.status === 409 ? T("This run couldn't be checked, so it isn't paid") : T("The reward couldn't be sent — try again later")); return; }
    if (j.credited > 0) { box.classList.add("paid"); countUp(box.querySelector("b"), j.credited, (v) => T("+{n} ARCL", { n: fmt(v) }), 1100); snd("coin"); if (ctx.refresh) ctx.refresh(); }
    else box.querySelector("b").textContent = "0";
    const why = j.credited > 0 ? (j.runsLeft != null ? T("Paid runs left today: {n}", { n: j.runsLeft }) : "") : j.why === "runs" ? T("Today's 3 paid runs are used — XP only now") : j.why === "cap" ? T("Today's ARCL limit is reached") : T("No ARCL this run");
    box.querySelector("small").textContent = why + (j.rank ? " · " + T("Week rank #{n}", { n: j.rank }) : "");
  }
  function clearRun() { clearPools(); R = null; if (ui) { ui.boss.hidden = true; ui.slots.innerHTML = ""; ui.aBoss.hidden = ui.aChest.hidden = true; ui.streak.hidden = true; ui.hint.hidden = true; } }

  // ---------------- keys ----------------
  const kd = (e) => { if (!on) return; const k = String(e.key || "").toLowerCase(); if (e.target && e.target.closest && e.target.closest("input,textarea")) return;
    e.stopImmediatePropagation(); if (["w", "a", "s", "d", "arrowleft", "arrowright", "arrowup", "arrowdown", " ", "escape", "1", "2", "3"].includes(k)) e.preventDefault();
    if (k === "escape") { if (mode === "play") pause(); else if (mode === "pause") resume(); else if (mode === "lobby") leave(); return; }
    if (mode === "cards" && ["1", "2", "3"].includes(k)) { choose(Number(k) - 1); return; }
    if (mode === "cards" && (k === "r" || k === "b")) { cardTool(k === "r" ? "reroll" : "banish"); return; }
    if (k === " ") { dash(); return; } if (k === "q" || k === "e" || k === "shift") { skill(); return; } keys.add(k); };
  const ku = (e) => { if (!on) return; keys.delete(String(e.key || "").toLowerCase()); e.stopImmediatePropagation(); };
  const onHide = () => { if (document.hidden && mode === "play") pause(); }; // a call, the home button: the run waits

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; busy = true;
    try {
      if (!ui) buildUi(); ui.root.hidden = false; ui.root.classList.add("menu"); ui.top.hidden = true;
      ui.sheet.innerHTML = `<div class="sv-lobby small"><h3>${esc(T("Loading the arena…"))}</h3><div class="sv-spin"></div></div>`; ui.sheet.hidden = false;
      document.body.classList.add("wp-surv");
      if (!S) build();
      await Promise.all([loadPack(), setHero(HEROES[pick.hero].id), readStatus()]);
      for (const id in pack) meshOf(pack[id]);
      try { if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), new Promise((ok) => setTimeout(ok, 3000))]); } catch { /* compiled on the first frame */ }
      // the town's own setting decides the ceiling: Saver / Low → the lightest; Auto → phones 1, PCs 2
      prOrig = st.renderer.getPixelRatio(); Qmax = ctx.low || /^(saver|low)$/.test(String(ctx.quality)) ? 0 : phone() ? 1 : 2; Q = Qmax;
      fps30 = phone() && !(ctx.fpsSet && ctx.fpsSet()); capMs = fps30 ? 1000 / 30 : 1000 / 60; if (fps30 && ctx.fps) ctx.fps(30); // phones: an even 30 (steadier than 25–40, and cooler)
      if (!S.comp && !phone() && !ctx.low && ctx.K && ctx.K.POSTFX) { try { const P = ctx.K.POSTFX, comp = new P.EffectComposer(st.renderer); comp.addPass(new P.RenderPass(S.scene, S.cam)); comp.addPass(new P.UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.35, 0.9)); comp.addPass(new P.OutputPass()); S.comp = comp; } catch (e) { console.warn("surv bloom:", e); } }
      on = true; applyQ(); st.solo(tick); lastNow = 0;
      addEventListener("keydown", kd, true); addEventListener("keyup", ku, true); document.addEventListener("visibilitychange", onHide);
      R = null; lobby(); return true;
    } catch (e) {
      console.warn("survivors", e); ctx.toast(T("The arena couldn't load: {e}", { e: String((e && e.message) || e).slice(0, 70) })); try { reset(); } catch { /* already reset */ } return false;
    } finally { busy = false; }
  }
  function reset() {
    on = false; mode = "off"; document.body.classList.remove("wp-surv"); if (ui) { ui.root.hidden = true; ui.sheet.hidden = true; ui.cards.hidden = true; }
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); document.removeEventListener("visibilitychange", onHide); keys.clear(); joy.on = false;
    try { if (prOrig && st.renderer.getPixelRatio() !== prOrig) st.renderer.setPixelRatio(prOrig); } catch { /* the town sets its own */ }
    if (fps30 && ctx.fps) try { ctx.fps(); } catch { /* the town's limit comes back with its settings */ } fps30 = false;
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
    if (R || mons.length) clearRun();
  }
  function leave() { if (!on) return; if (R && !R.over && mode !== "lobby") { endRun("quit"); return; } reset(); if (ctx.onLeave) ctx.onLeave(); }
  return {
    enter, leave: () => { if (on) { reset(); if (ctx.onLeave) ctx.onLeave(); } }, active: () => on,
    /// near the Game Village: the monsters' file fetched ahead (the bake waits for the visit)
    prefetch: () => { try { fetch("models/world/survivors/monsters.glb?v=" + (ctx.ver || "1")).catch(() => {}); } catch { /* fetched on the visit */ } },
    /// tests: the run's numbers, and a few levers
    debug: () => (R ? { mode, q: Q, fms: Math.round(frameMs), js: +jsMs.toFixed(2), anim: hero && hero.mixer ? (hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name).join(",")) : "", t: R.t, hp: R.hp, lv: R.lv, xp: R.xp, kills: R.kills, bosses: R.bosses, mons: mons.length, alive: mons.filter((m) => m.st !== "die").length, gems: gems.length, fx: FX ? FX.glow.n + FX.beam.n : 0, w: { ...R.w }, p: { ...R.p }, boss: R.boss && R.boss.id, x: R.x, z: R.z } : { mode }),
    start: () => startRun(), skip: (s) => { if (!R) return; R.t += s; R.eliteT = 0; }, choose: (i) => choose(i), give: (k, id, n = 1) => { if (!R) return; for (let i = 0; i < n; i++) take({ k, id }); }, hurt: (n) => { if (R) { R.hurtT = 0; R.shield = 0; hurtHero(n); } }, xp: (n) => { if (R) addGem(R.x, R.z, n); }, boss: (i) => { if (R) spawnBoss(i); }, killAll: () => { if (R) for (const m of mons) if (m.st !== "die") kill(m); }, mode: () => mode, cam: (k) => { camK = k; }, quality: (q) => { Qmax = Q = q; applyQ(); },
    line: (ids, st0) => { if (!R) return; clearPools(); R.still = true; R.spawnT = 1e9; R.eliteT = 1e9; R.bossNext = 9; R.w = {}; R.swarmAt = []; ids.forEach((id, i) => { const m = spawn(id, (i - (ids.length - 1) / 2) * 2.2, -3); if (m) { m.face = 0; m.born = 1; if (st0) { m.st = st0; m.at = 0; } } }); },
    chest: () => { if (R) dropChest(R.x + 1, R.z, true); }, steps: (n) => { maxSteps = n; }, god: (on) => { if (R) R.god = !!on; }, // (tests: a slow test browser can let the game run at its true speed)
  };
}

// share cards (world-share.js)
Object.assign(LW.ko, {"Share": "공유", "I survived {t} and knocked out {k} monsters in SURVIVORS ARENA! ⚔️ Can you beat it?": "SURVIVORS ARENA에서 {t} 버티고 몬스터 {k}마리를 쓰러뜨렸어요! ⚔️ 이길 수 있나요?"});
Object.assign(LW.zh, {"Share": "分享", "I survived {t} and knocked out {k} monsters in SURVIVORS ARENA! ⚔️ Can you beat it?": "我在 SURVIVORS ARENA 坚持了 {t}，击倒了 {k} 只怪物！⚔️ 你能超越吗？"});
Object.assign(LW.tr, {"Share": "Paylaş", "I survived {t} and knocked out {k} monsters in SURVIVORS ARENA! ⚔️ Can you beat it?": "SURVIVORS ARENA'da {t} hayatta kaldım ve {k} canavar devirdim! ⚔️ Geçebilir misin?"});
// b-svx: what knocked you out
Object.assign(LW.ko, {"a Blob": "블롭", "a Pinky": "핑키", "a Mushroom": "버섯", "a Bee": "벌", "a Ninja": "닌자", "an Orc": "오크", "a Ghost": "유령", "a Glub": "글럽", "a Spiky elite": "정예 스파이키", "a Big Mushroom": "거대 버섯", "a Skull elite": "정예 해골", "a Yeti elite": "정예 예티", "a ground slam": "내려찍기", "a fire breath": "화염 숨결", "a sweeping strike": "휩쓸기", "a laser": "레이저", "a falling meteor": "떨어지는 메테오", "lava": "용암", "poison spores": "독 포자", "a charge": "돌진", "a shot": "탄환", "attack": "공격", "the crowd": "몬스터 무리", "{b}'s {p}": "{b}의 {p}", "Knocked out by {x} at {t}": "{t}에 {x}에게 쓰러졌어요", "Watch the red marks on the ground: dash out before they land.": "바닥의 빨간 표시를 보고, 떨어지기 전에 대시로 빠져나오세요.", "Keep moving and grab the gems: early levels come quickly.": "계속 움직이며 보석을 모으세요. 초반 레벨은 금방 올라요.", "Area weapons like Thunder Nova and Ice Storm clear a crowd.": "썬더 노바, 아이스 스톰 같은 범위 무기가 몬스터 무리를 정리해 줘요."});
Object.assign(LW.zh, {"a Blob": "史莱姆", "a Pinky": "粉粉", "a Mushroom": "蘑菇", "a Bee": "蜜蜂", "a Ninja": "忍者", "an Orc": "兽人", "a Ghost": "幽灵", "a Glub": "咕噜", "a Spiky elite": "精英刺球", "a Big Mushroom": "巨型蘑菇", "a Skull elite": "精英骷髅", "a Yeti elite": "精英雪人", "a ground slam": "重击地面", "a fire breath": "火焰吐息", "a sweeping strike": "横扫", "a laser": "激光", "a falling meteor": "坠落的陨石", "lava": "岩浆", "poison spores": "毒孢子", "a charge": "冲撞", "a shot": "子弹", "attack": "攻击", "the crowd": "怪物群", "{b}'s {p}": "{b}的{p}", "Knocked out by {x} at {t}": "在 {t} 被{x}击倒", "Watch the red marks on the ground: dash out before they land.": "注意地上的红色标记：在落下前冲刺离开。", "Keep moving and grab the gems: early levels come quickly.": "保持移动并收集宝石：前期升级很快。", "Area weapons like Thunder Nova and Ice Storm clear a crowd.": "雷霆新星、冰风暴等范围武器能清理怪物群。"});
Object.assign(LW.tr, {"a Blob": "bir Blob", "a Pinky": "bir Pinky", "a Mushroom": "bir Mantar", "a Bee": "bir Arı", "a Ninja": "bir Ninja", "an Orc": "bir Ork", "a Ghost": "bir Hayalet", "a Glub": "bir Glub", "a Spiky elite": "seçkin bir Dikenli", "a Big Mushroom": "Dev bir Mantar", "a Skull elite": "seçkin bir Kafatası", "a Yeti elite": "seçkin bir Yeti", "a ground slam": "yere vuruş", "a fire breath": "ateş nefesi", "a sweeping strike": "süpürme darbesi", "a laser": "lazer", "a falling meteor": "düşen meteor", "lava": "lav", "poison spores": "zehirli sporlar", "a charge": "hücum", "a shot": "atış", "attack": "saldırı", "the crowd": "kalabalık", "{b}'s {p}": "{b} — {p}", "Knocked out by {x} at {t}": "{t} anında {x} seni yere serdi", "Watch the red marks on the ground: dash out before they land.": "Yerdeki kırmızı işaretlere dikkat: inmeden önce atılarak çık.", "Keep moving and grab the gems: early levels come quickly.": "Hareket et ve taşları topla: ilk seviyeler hızlı gelir.", "Area weapons like Thunder Nova and Ice Storm clear a crowd.": "Thunder Nova ve Ice Storm gibi alan silahları kalabalığı temizler."});
// b-svx: card tools and the evolution book
Object.assign(LW.ko, {"Reroll": "다시 뽑기", "Banish": "제외", "Skip": "건너뛰기", "Tap a card to take it out of this run": "이번 판에서 뺄 카드를 누르세요", "Evolves with {x}": "{x}와 함께 진화", "Evolves {x}": "{x} 진화", "Evolutions": "진화"});
Object.assign(LW.zh, {"Reroll": "重抽", "Banish": "移除", "Skip": "跳过", "Tap a card to take it out of this run": "点击一张卡，本局不再出现", "Evolves with {x}": "配合{x}可进化", "Evolves {x}": "可进化{x}", "Evolutions": "进化"});
Object.assign(LW.tr, {"Reroll": "Yeniden çek", "Banish": "Çıkar", "Skip": "Geç", "Tap a card to take it out of this run": "Bu turdan çıkarmak için bir karta dokun", "Evolves with {x}": "{x} ile evrimleşir", "Evolves {x}": "{x} evrimleştirir", "Evolutions": "Evrimler"});
