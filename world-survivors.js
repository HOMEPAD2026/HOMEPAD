// world-survivors.js — SURVIVORS ARENA, the Game Village's 12-minute survival game (loaded the first time its door is
// used, like the ARCL Mine). It draws its own scene through the stage's view() while the town waits, frozen, behind it.
// Pick ARON, LUMI or NEX and a difficulty; move with the stick (WASD), dash with the button (Space). Every weapon fires
// by itself; monsters drop XP gems, every level offers three cards (the game stops while you choose). Bosses come at 3,
// 6, 9 and 12 minutes; the run ends when the Infinity Titan falls, when you fall, or at 15:00.
//
// The monsters: models/world/survivors/monsters.glb (Quaternius Ultimate Monsters, CC0; tools note in the commit). Each
// kind is baked once on load into a vertex-animation texture (every vertex's place and normal, frame by frame, for its
// walk, attack and death), then drawn as one InstancedMesh: a crowd of 200 costs about 16 draw calls.
// What pays is the server's (api/_world-survivors.mjs): it checks the run on its own clock and computes the reward
// itself (world-survivors-data.js reward()). A guest plays the same game; nothing is paid.
//
// ctx: { THREE, K, st, ver, T, lang, esc, toast, Snd, reduce, low, coarse, sess, post, refresh, gain(n, why),
//        makeHero(id) → character, onLeave() }
import { RULES, reward, worldXp, HEROES, MON, BOSSES, poolAt, eliteAt, crowdAt, hpK, needXp, WEAPONS, PASSIVES, EVOS, SLOTS, MAX_LV } from "./world-survivors-data.js";

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
const icon = (k, n = 26) => `<svg viewBox="0 0 26 26" width="${n}" height="${n}" aria-hidden="true">${ICON[k] || ""}</svg>`;

export function createSurvivors(ctx) {
  const { THREE, st, esc, Snd } = ctx, L = LW[ctx.lang] || {}, T = (s, v) => { let r = L[s] != null ? L[s] : ctx.T(s, v); if (v && L[s] != null) for (const k in v) r = r.split("{" + k + "}").join(v[k]); return r; };
  const low = !!ctx.low, reduce = !!ctx.reduce, snd = (k, ...a) => { try { if (Snd && Snd[k]) Snd[k](...a); } catch { /* no sound */ } };
  const phone = () => document.documentElement.classList.contains("wp-pcphone") || (innerWidth < 700 && innerHeight > innerWidth);
  const CAP = () => (low ? 110 : phone() ? 150 : 240); // how many monsters at once, by device
  let S = null, ui = null, on = false, busy = false, hero = null, heroId = "", heroP = null, pack = null, packP = null;
  let mode = "off"; // off · lobby · count · play · cards · pause · over
  let pick = { hero: 0, diff: "normal" };
  try { const s = JSON.parse(localStorage.getItem("arc.surv.pick") || "null"); if (s && HEROES[s.hero] && RULES.DIFF[s.diff]) pick = s; } catch { /* the defaults */ }

  // ---------------- the arena (made once) ----------------
  function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
  const radial = (stops) => canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  function build() {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a1230); scene.fog = new THREE.Fog(0x0a1230, 34, 70);
    const cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 160);
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x46385e, 0.85));
    const sun = new THREE.DirectionalLight(0xffe8c8, 2.8); sun.position.set(14, 30, 10); scene.add(sun);
    if (st.renderer && st.renderer.capabilities) scene.environment = null;
    // the floor: warm sandstone flags with blue-glass seams, a rune circle in the middle, darker toward the wall
    const tile = canvasTex(512, 512, (g, w) => {
      g.fillStyle = "#6f6a7e"; g.fillRect(0, 0, w, w); let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const off = y % 2 ? 64 : 0, px = x * 128 + off, py = y * 128, c = 120 + Math.floor(r() * 26);
        for (const dx of [0, -512]) { g.fillStyle = `rgb(${c + 18},${c + 2},${c - 18})`; g.fillRect(px + dx + 4, py + 4, 120, 120);
          g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(px + dx + 4, py + 4, 120, 6); g.fillStyle = "rgba(0,0,0,.10)"; g.fillRect(px + dx + 4, py + 118, 120, 6);
          for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(80,60,40,${0.05 + r() * 0.08})`; g.beginPath(); g.arc(px + dx + 10 + r() * 108, py + 10 + r() * 108, 2 + r() * 5, 0, 7); g.fill(); } } }
      g.strokeStyle = "rgba(80,190,255,.55)"; g.lineWidth = 3; for (let y = 0; y <= 4; y++) { g.beginPath(); g.moveTo(0, y * 128 + 2); g.lineTo(w, y * 128 + 2); g.stroke(); }
      for (let y = 0; y < 4; y++) for (let x = 0; x <= 4; x++) { const px = x * 128 + (y % 2 ? 64 : 0) + 2; g.beginPath(); g.moveTo(px, y * 128); g.lineTo(px, y * 128 + 128); g.stroke(); } });
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(26, 26); tile.anisotropy = 4;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 16, 96), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.92, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    // shade toward the wall (a big soft vignette on the floor) and the rune circle in the middle
    const shade = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 16, 64), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(10,18,48,0)"], [0.62, "rgba(10,18,48,0)"], [0.8, "rgba(10,18,48,.55)"], [1, "rgba(10,18,48,.95)"]]), transparent: true, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = 0.02; scene.add(shade);
    const rune = canvasTex(512, 512, (g, w) => { const c = w / 2; g.translate(c, c); g.strokeStyle = "rgba(90,200,255,.85)"; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 236, 0, 7); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 210, 0, 7); g.stroke();
      g.beginPath(); g.arc(0, 0, 120, 0, 7); g.stroke(); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 120, Math.sin(a) * 120); g.lineTo(Math.cos(a + 2.1) * 120, Math.sin(a + 2.1) * 120); g.stroke(); }
      g.fillStyle = "rgba(140,230,255,.9)"; for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.save(); g.rotate(a); g.fillRect(-4, -224, 8, 14); g.restore(); }
      g.strokeStyle = "rgba(57,255,136,.7)"; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.stroke(); });
    const runeM = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: rune, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    runeM.rotation.x = -Math.PI / 2; runeM.position.y = 0.03; scene.add(runeM);
    // the wall: stone pillars round the edge, a glowing rail between them, braziers on every fifth
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
    const NP = 64, pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 5, 1.5), new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.85, flatShading: true }), NP);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.5, 1.9), new THREE.MeshStandardMaterial({ color: 0x5a4e64, roughness: 0.7, flatShading: true }), NP);
    const fires = [];
    for (let i = 0; i < NP; i++) { const a = (i / NP) * Math.PI * 2, x = Math.cos(a) * (ARENA_R + 1.6), z = Math.sin(a) * (ARENA_R + 1.6); q.setFromEuler(e.set(0, -a, 0));
      pillars.setMatrixAt(i, m4.compose(v.set(x, 2.5, z), q, sc.set(1, 0.8 + ((i * 37) % 7) / 14, 1))); caps.setMatrixAt(i, m4.compose(v.set(x, 2.5 + 2.5 * (0.8 + ((i * 37) % 7) / 14) + 0.2, z), q, sc.set(1, 1, 1)));
      if (i % 4 === 0) fires.push([x, 2.5 + 2.5 * (0.8 + ((i * 37) % 7) / 14) + 0.9, z]); }
    scene.add(pillars, caps);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.4, 0.12, 6, 160), new THREE.MeshBasicMaterial({ color: 0x38d8ff, toneMapped: false })); rail.rotation.x = Math.PI / 2; rail.position.y = 0.12; scene.add(rail);
    const rail2 = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.4, 0.5, 4, 160), new THREE.MeshBasicMaterial({ color: 0x2f86ff, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false })); rail2.rotation.x = Math.PI / 2; rail2.position.y = 0.1; scene.add(rail2);
    const fireG = new THREE.ConeGeometry(0.42, 1.1, 7), fireM = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }), flames = new THREE.InstancedMesh(fireG, fireM, fires.length);
    fires.forEach((p, i) => flames.setMatrixAt(i, m4.compose(v.set(...p), q.identity(), sc.set(1, 1, 1)))); scene.add(flames);
    const glowTex = radial([[0, "rgba(255,190,90,.9)"], [0.4, "rgba(255,140,60,.35)"], [1, "rgba(255,120,40,0)"]]);
    const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), fires.length);
    fires.forEach((p, i) => halos.setMatrixAt(i, m4.compose(v.set(p[0], p[1], p[2]), q.setFromEuler(e.set(-1.0, 0, 0)), sc.set(1, 1, 1)))); scene.add(halos);
    // crystals and rubble scattered on the floor (looks only: monsters and you walk through them)
    { let sd = 99; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); const cr = [], rb = [];
      for (let i = 0; i < 40; i++) { const a = r() * 6.283, d = 9 + r() * (ARENA_R - 11); (i % 3 ? rb : cr).push([Math.cos(a) * d, Math.sin(a) * d, r() * 6.3, 0.5 + r() * 0.9]); }
      const crM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x2a9cff, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true }), cr.length);
      cr.forEach(([x, z, ry, k], i) => crM.setMatrixAt(i, m4.compose(v.set(x, 0.45 * k, z), q.setFromEuler(e.set(0.2, ry, 0.15)), sc.set(k * 0.7, k * 1.5, k * 0.7))));
      const rbM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 0.95, flatShading: true }), rb.length);
      rb.forEach(([x, z, ry, k], i) => rbM.setMatrixAt(i, m4.compose(v.set(x, 0.12 * k, z), q.setFromEuler(e.set(0, ry, 0)), sc.set(k, k * 0.5, k * 0.9))));
      scene.add(crM, rbM); }
    // the sky: a ring of far mountains and stars, cheap
    const stars = new THREE.BufferGeometry(), sp = []; for (let i = 0; i < 500; i++) { const a = Math.random() * 6.283, el = 0.15 + Math.random() * 1.2, d = 120; sp.push(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d); }
    stars.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.6, fog: false })));
    S = { scene, cam, flames, fires, runeM };
    makeFx();
  }

  // ---------------- effects: every kind one InstancedMesh, additive, faded by its instance colour ----------------
  let FX = null;
  function pool(geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); m.instanceColor.setUsage(THREE.DynamicDrawUsage); S.scene.add(m); return m; }
  function makeFx() {
    const add = (o = {}) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...o });
    const beamG = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true); beamG.translate(0, 0.5, 0);
    const ringG = new THREE.RingGeometry(0.86, 1, 48); ringG.rotateX(-Math.PI / 2);
    const discG = new THREE.CircleGeometry(1, 40); discG.rotateX(-Math.PI / 2);
    const shTex = radial([[0, "rgba(0,0,0,.6)"], [0.55, "rgba(0,0,0,.32)"], [1, "rgba(0,0,0,0)"]]);
    FX = {
      beam: pool(beamG, add({ side: THREE.DoubleSide }), 700), ball: pool(new THREE.IcosahedronGeometry(1, 1), add(), 500), ring: pool(ringG, add({ side: THREE.DoubleSide }), 160), disc: pool(discG, add({ opacity: 0.55, side: THREE.DoubleSide }), 40),
      gem: pool(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2266ff, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.2, flatShading: true }), 900),
      shadow: (() => { const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }), 320); m.count = 0; m.frustumCulled = false; m.renderOrder = 1; S.scene.add(m); return m; })(),
      chest: (() => { const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xb07a10, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 }), wood = new THREE.MeshStandardMaterial({ color: 0x7a3cff, roughness: 0.5, emissive: 0x3a1a99, emissiveIntensity: 0.4 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood); b.position.y = 0.35; const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = 0.7;
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.84), gold); band.position.y = 0.55; const lock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.1), gold); lock.position.set(0, 0.55, 0.42); g.add(b, lid, band, lock); g.visible = false; S.scene.add(g); return g; })(),
    };
    FX.list = { beam: [], ball: [], ring: [], disc: [] };
    FX.heroShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })); FX.heroShadow.position.y = 0.03; S.scene.add(FX.heroShadow);
    FX.magnet = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false })); FX.magnet.position.y = 0.05; S.scene.add(FX.magnet);
  }
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), dirV = new THREE.Vector3(), ee = new THREE.Euler();
  /// a short-lived effect: kind beam (from a to b, width w), ball (at p, size s), ring/disc (at p, radius r); life in s
  function fx(kind, o) { const l = FX.list[kind]; if (l.length >= FX[kind].instanceMatrix.count) l.shift(); o.t = 0; o.life = o.life || 0.3; l.push(o); return o; }
  function drawFx(dt) {
    for (const kind of ["beam", "ball", "ring", "disc"]) {
      const l = FX.list[kind], m = FX[kind]; let n = 0;
      for (let i = 0; i < l.length; i++) { const o = l[i]; o.t += dt; if (o.t >= o.life) continue; l[n] = o; const k = o.t / o.life, fade = o.hold ? (k < 0.85 ? 1 : (1 - k) / 0.15) : 1 - k;
        if (o.tick) o.tick(o, dt, k);
        if (kind === "beam") { dirV.set(o.b.x - o.a.x, (o.b.y || 0) - (o.a.y || 0), o.b.z - o.a.z); const len = dirV.length() || 0.001; qq.setFromUnitVectors(UP, dirV.multiplyScalar(1 / len)); m.setMatrixAt(n, m4.compose(vv.set(o.a.x, o.a.y || 0.8, o.a.z), qq, ss.set(o.w * (o.grow ? 1 + k : 1), len, o.w * (o.flat ? 0.05 : 1) * (o.grow ? 1 + k : 1)))); }
        else if (kind === "ball") { const s = o.s * (o.pulse ? 1 + Math.sin(o.t * 30) * 0.15 : 1) * (o.shrink ? 1 - k * 0.7 : 1); m.setMatrixAt(n, m4.compose(vv.set(o.p.x, o.p.y, o.p.z), qq.identity(), ss.set(s, s, s))); }
        else { const r = o.r0 != null ? o.r0 + (o.r - o.r0) * (o.ease ? 1 - (1 - k) * (1 - k) : k) : o.r; m.setMatrixAt(n, m4.compose(vv.set(o.p.x, o.p.y || 0.06, o.p.z), qq.identity(), ss.set(r, 1, r))); }
        m.setColorAt(n, col.set(o.c).multiplyScalar(Math.max(0, fade) * (o.k || 1))); n++; }
      l.length = n; m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // ---------------- the monsters: baked to vertex textures ----------------
  // each kind: one geometry (its meshes merged), one RGBA32F texture of every vertex's place (xyz) and its normal
  // (octahedral, two 12-bit numbers packed into w) for each baked frame
  async function loadPack() {
    if (pack) return pack; if (packP) return packP;
    packP = (async () => {
      const loader = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null; if (!loader) throw new Error("no model loader");
      const g = await loader.loadAsync("models/world/survivors/monsters.glb?v=" + (ctx.ver || "1"));
      const out = {}; let n = 0;
      for (const id of Object.keys(MON)) { const root = g.scene.getObjectByName(id); if (!root) continue; out[id] = bake(id, root, g.animations.filter((a) => a.name.startsWith(id + ":")), MON[id]); if (++n % 3 === 0) await new Promise((ok) => setTimeout(ok, 0)); }
      pack = out; return out;
    })().catch((e) => { packP = null; throw e; });
    return packP;
  }
  function bake(id, root, clips, spec) {
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
          for (let j = 0; j < pa.count; j++) { pv.fromBufferAttribute(pa, j); if (m.isSkinnedMesh) { m.applyBoneTransform(j, pv); pv.applyMatrix4(m.matrixWorld); } else pv.applyMatrix4(m.matrixWorld); const o = (offs[k] + j) * 3; P[o] = pv.x; P[o + 1] = pv.y; P[o + 2] = pv.z; } });
        tmp.computeVertexNormals(); frames.push(P.slice(), tmp.attributes.normal.array.slice()); F++;
      }
    }
    mixer.stopAllAction();
    // stand it on the floor at its height, centred: from the walk's first frame
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; const f0 = frames[0];
    for (let j = 0; j < V; j++) { const x = f0[j * 3], y = f0[j * 3 + 1], z = f0[j * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const k = spec.h / Math.max(0.01, y1 - y0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const W = 1024, H = Math.ceil((V * F) / W), data = new Float32Array(W * H * 4);
    for (let f = 0; f < F; f++) { const p = frames[f * 2], nn = frames[f * 2 + 1];
      for (let j = 0; j < V; j++) { const t = (f * V + j) * 4; data[t] = (p[j * 3] - cx) * k; data[t + 1] = (p[j * 3 + 1] - y0) * k; data[t + 2] = (p[j * 3 + 2] - cz) * k;
        let nx = nn[j * 3], ny = nn[j * 3 + 1], nz = nn[j * 3 + 2]; const s = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1; nx /= s; ny /= s; nz /= s;
        if (nz < 0) { const ox = (1 - Math.abs(ny)) * (nx >= 0 ? 1 : -1), oy = (1 - Math.abs(nx)) * (ny >= 0 ? 1 : -1); nx = ox; ny = oy; }
        data[t + 3] = Math.round((nx * 0.5 + 0.5) * 4095) * 4096 + Math.round((ny * 0.5 + 0.5) * 4095); } }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const geo = new THREE.BufferGeometry(); geo.setIndex(idx); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const base = new Float32Array(V * 3); for (let j = 0; j < V; j++) { base[j * 3] = data[j * 4]; base[j * 3 + 1] = data[j * 4 + 1]; base[j * 3 + 2] = data[j * 4 + 2]; }
    geo.setAttribute("position", new THREE.BufferAttribute(base, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    const src = meshes[0] && meshes[0].material, map = src && src.map ? src.map : null;
    if (map && !map.userData.swatch) { map.userData.swatch = 1; map.minFilter = map.magFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true; } // a palette of swatches: mipmaps would blend neighbours into mud
    const mat = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : (src && src.color ? src.color.getHex() : 0xcccccc), roughness: 0.62, metalness: 0.0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uVat = { value: tex }; sh.uniforms.uV = { value: V };
      sh.vertexShader = "uniform highp sampler2D uVat; uniform int uV; attribute vec4 aAnim; varying float vFlash;\n" +
        "vec4 vatAt(int f){ int i = f * uV + gl_VertexID; return texelFetch(uVat, ivec2(i % 1024, i / 1024), 0); }\n" +
        "vec3 octN(float w){ float a = floor(w / 4096.0); float b = w - a * 4096.0; vec2 p = vec2(a, b) / 4095.0 * 2.0 - 1.0; vec3 n = vec3(p, 1.0 - abs(p.x) - abs(p.y)); float t = max(-n.z, 0.0); n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t; return normalize(n); }\n" + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace("#include <beginnormal_vertex>", "vec4 vA = vatAt(int(aAnim.x)); vec4 vB = vatAt(int(aAnim.y)); vec3 objectNormal = normalize(mix(octN(vA.w), octN(vB.w), aAnim.z));")
        .replace("#include <begin_vertex>", "vec3 transformed = mix(vA.xyz, vB.xyz, aAnim.z); vFlash = aAnim.w;");
      sh.fragmentShader = "varying float vFlash;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.92, 0.85) * vFlash;");
    };
    mat.customProgramCacheKey = () => "vat";
    return { id, geo, mat, tex, R, V, spec, mesh: null };
  }
  /// the kind's InstancedMesh (made the first time it's needed this visit)
  function meshOf(kd) {
    if (kd.mesh) return kd.mesh; const n = kd.spec.boss ? 2 : kd.spec.elite ? 16 : 200;
    const m = new THREE.InstancedMesh(kd.geo, kd.mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); a.setUsage(THREE.DynamicDrawUsage); m.geometry = kd.geo; kd.geo.setAttribute("aAnim", a); kd.anim = a;
    S.scene.add(m); kd.mesh = m; return m;
  }
  function frameOf(kd, role, t) { const r = kd.R[role]; let f = (t / r.dur) * (r.loop ? r.n : r.n - 1); if (r.loop) { f %= r.n; if (f < 0) f += r.n; const a = Math.floor(f); return [r.f0 + a, r.f0 + ((a + 1) % r.n), f - a]; }
    f = Math.min(r.n - 1, Math.max(0, f)); const a = Math.floor(f); return [r.f0 + a, r.f0 + Math.min(r.n - 1, a + 1), f - a]; }

  // ---------------- the run's state ----------------
  let R = null; // the run: time, hero stats, weapons, monsters, gems
  const mons = [], gems = [], shots = [], foes = []; // monsters, XP gems, your bolts, the bosses' shots
  const grid = new Map(), CELL = 2.5;
  const key = (x, z) => ((Math.floor(x / CELL) + 64) << 8) | (Math.floor(z / CELL) + 64);
  function newRun() {
    const h = HEROES[pick.hero] || HEROES[0], d = RULES.DIFF[pick.diff] || RULES.DIFF.normal;
    mons.length = 0; gems.length = 0; shots.length = 0; foes.length = 0; if (FX) for (const k in FX.list) FX.list[k].length = 0;
    R = { t: 0, hero: h, diff: pick.diff, D: d, x: 0, z: 0, vx: 0, vz: 0, face: 0, hp: 100, hpMax: 100, lv: 1, xp: 0, need: needXp(1), kills: 0, bosses: 0, bossNext: 0, boss: null, clear: false, over: false,
      w: {}, p: {}, evo: {}, cds: {}, orbA: 0, spawnT: 0, eliteT: 60, swarmAt: [120, 300, 480, 660], dashT: 0, dashCd: 0, hurtT: 0, regenT: 0, vampN: 0, pendingLv: 0, pendingChest: 0, bonusDmg: 1, seed: (Math.random() * 1e9) >>> 0, chest: null, said: {} };
    R.w[h.w] = 1;
  }
  // the hero's numbers, from its perk and the passives
  const pv = (k) => (R.p[k] || 0);
  const stat = {
    dmg: () => R.hero.dmg * (1 + 0.1 * pv("power")) * R.bonusDmg,
    area: () => R.hero.area * (1 + 0.1 * pv("heavy")),
    reach: () => 1 + 0.12 * pv("range"),
    cd: () => 1 - 0.06 * pv("cool"),
    rate: () => 1 + 0.1 * pv("rapid"),
    crit: () => 0.05 + 0.06 * pv("crit"),
    speed: () => 6.4 * R.hero.speed * (1 + 0.07 * pv("speed")),
    armor: () => 1 - 0.07 * pv("armor"),
    magnet: () => 2.2 * (1 + 0.4 * pv("magnet")),
    regen: () => 0.4 * pv("recov"),
  };

  // ---------------- monsters ----------------
  function spawn(id, x, z, o = {}) {
    const kd = pack[id]; if (!kd) return null; const sp = MON[id];
    const hp = sp.hp * (sp.boss ? 1 : hpK(R.t)) * R.D.hp * (o.hpK || 1);
    const m = { id, kd, x, z, vx: 0, vz: 0, hp, hpMax: hp, r: sp.r, sp: sp.sp * (o.spK || 1) * (0.9 + Math.random() * 0.2), dmg: sp.dmg * R.D.dmg, xp: sp.xp, fly: sp.fly || 0, boss: !!sp.boss, elite: !!sp.elite,
      st: "move", at: Math.random() * 2, face: Math.atan2(R.x - x, R.z - z), flash: 0, atkCd: 0.5 + Math.random() * 0.5, dieT: 0, slow: 0, kb: 0, hitBy: new Map(), born: 0, bob: Math.random() * 6 };
    mons.push(m); meshOf(kd); return m;
  }
  function spawnRing() {
    const cap = CAP(), want = Math.min(cap, Math.round(crowdAt(R.t) * R.D.rate * (phone() ? 0.8 : 1)));
    let alive = 0; for (const m of mons) if (m.st !== "die" && !m.boss) alive++;
    if (alive >= want) return;
    const pool = poolAt(R.t), tot = pool.reduce((s, [, w]) => s + w, 0), n = Math.min(6, want - alive);
    for (let i = 0; i < n; i++) { let r = Math.random() * tot, id = pool[0][0]; for (const [k, w] of pool) { if ((r -= w) <= 0) { id = k; break; } }
      const p = edgePoint(); spawn(id, p.x, p.z); }
  }
  // just off the screen, inside the wall
  function edgePoint(d) { const a = Math.random() * Math.PI * 2, dist = d || (phone() ? 15 : 19) + Math.random() * 4; let x = R.x + Math.cos(a) * dist, z = R.z + Math.sin(a) * dist; const rr = Math.hypot(x, z); if (rr > ARENA_R - 1.5) { x *= (ARENA_R - 1.5) / rr; z *= (ARENA_R - 1.5) / rr; } return { x, z }; }
  function swarm() { const id = poolAt(R.t)[0][0], n = phone() ? 22 : 34; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = R.x + Math.cos(a) * 13, z = R.z + Math.sin(a) * 13; if (Math.hypot(x, z) < ARENA_R - 1) spawn(id, x, z, { spK: 0.9 }); } }
  function hitMon(m, dmg, o = {}) {
    if (m.st === "die" || m.hp <= 0) return false;
    let d = dmg * stat.dmg(); const crit = Math.random() < stat.crit(); if (crit) d *= 2;
    m.hp -= d; m.flash = 1; if (o.kb && !m.boss) { const dx = m.x - (o.fx != null ? o.fx : R.x), dz = m.z - (o.fz != null ? o.fz : R.z), l = Math.hypot(dx, dz) || 1; m.vx += (dx / l) * o.kb; m.vz += (dz / l) * o.kb; }
    if (o.slow) m.slow = Math.max(m.slow, o.slow);
    pop(m.x, m.fly + MON[m.id].h * 0.9, m.z, Math.round(d), crit ? "crit" : m.boss ? "boss" : "");
    if (m.hp <= 0) kill(m); return true;
  }
  function kill(m) {
    m.st = "die"; m.at = 0; m.hp = 0; R.kills++;
    const v = m.xp; gems.push({ x: m.x, z: m.z, v, t: 0, pull: false });
    if (m.elite) { for (let k = 0; k < 3; k++) gems.push({ x: m.x + (Math.random() - 0.5) * 2, z: m.z + (Math.random() - 0.5) * 2, v: 2, t: 0, pull: false }); if (Math.random() < 0.35) dropChest(m.x, m.z); }
    if (pv("vamp") && ++R.vampN >= [14, 12, 10, 8, 6][pv("vamp") - 1]) { R.vampN = 0; heal(2 + pv("vamp")); }
    if (m.boss) { R.bosses++; R.boss = null; dropChest(m.x, m.z); snd("win"); shakeK = 1; flashUi("boss"); slowMo = 0.9; if (m.id === "titan") { R.clear = true; setTimeout(() => { if (on && R && !R.over) endRun("win"); }, 1600); } paintBoss(); }
    else if (R.kills % 6 === 0) snd("pop");
  }
  function heal(n) { R.hp = Math.min(R.hpMax, R.hp + n); }
  function dropChest(x, z) { if (R.chest) { R.pendingChest++; return; } R.chest = { x, z, t: 0 }; FX.chest.visible = true; FX.chest.position.set(x, 0, z); }

  // the bosses: a warning, then an attack; each its own mix
  function bossTick(m, dt) {
    m.bt = (m.bt || 0) - dt;
    if (m.charge) { const c = m.charge; c.t += dt; if (c.t > c.wait) { const step = 22 * dt; m.x += c.dx * step; m.z += c.dz * step; c.go += step; if (Math.hypot(R.x - m.x, R.z - m.z) < m.r + HERO_R + 0.3) hurtHero(m.dmg * 1.2, m); if (c.go >= c.len || Math.hypot(m.x, m.z) > ARENA_R - 2) m.charge = null; } return true; }
    if (m.bt > 0) return false;
    const kinds = m.id === "king" ? ["slam", "summon", "slam"] : m.id === "golem" ? ["charge", "slam", "volley"] : m.id === "dragon" ? ["volley", "charge", "volley", "slam"] : ["slam", "charge", "volley", "summon", "slam"];
    const kind = kinds[(m.bn = (m.bn || 0) + 1) % kinds.length]; m.bt = m.id === "titan" ? 2.6 : 3.6; m.st = "atk"; m.at = 0;
    if (kind === "slam") { const r = m.id === "titan" ? 5.5 : 4, x = R.x, z = R.z;
      fx("disc", { p: { x, z, y: 0.05 }, r, c: 0xff3a3a, life: 1.1, k: 0.6, hold: true }); fx("ring", { p: { x, z }, r0: 0.3, r, c: 0xff6a4a, life: 1.1, ease: true });
      setTimeout(() => { if (!on || !R || R.over) return; fx("ring", { p: { x, z }, r0: r * 0.6, r: r * 1.15, c: 0xffd08a, life: 0.4 }); shakeK = Math.max(shakeK, 0.6); snd("impact"); if (Math.hypot(R.x - x, R.z - z) < r) hurtHero(m.dmg * 1.4, m); }, 1100 / Math.max(0.1, timeK)); }
    else if (kind === "charge") { const dx = R.x - m.x, dz = R.z - m.z, l = Math.hypot(dx, dz) || 1, len = Math.min(18, l + 6);
      m.charge = { dx: dx / l, dz: dz / l, len, go: 0, t: 0, wait: 0.9 }; m.face = Math.atan2(dx, dz);
      fx("beam", { a: { x: m.x, y: 0.06, z: m.z }, b: { x: m.x + (dx / l) * len, y: 0.06, z: m.z + (dz / l) * len }, w: m.r * 2, flat: true, c: 0xff3a3a, life: 1.0, k: 0.55, hold: true }); snd("warn"); }
    else if (kind === "volley") { const n = m.id === "titan" ? 18 : 12; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.2; foes.push({ x: m.x, z: m.z, vx: Math.cos(a) * 6.5, vz: Math.sin(a) * 6.5, t: 0, dmg: m.dmg * 0.6 }); } snd("cast"); }
    else if (kind === "summon") { const id = m.id === "king" ? "mush" : poolAt(R.t)[0][0]; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; spawn(id, m.x + Math.cos(a) * 3, m.z + Math.sin(a) * 3); } snd("growl"); }
    return false;
  }
  function spawnBoss(i) {
    const id = BOSSES[i], p = edgePoint(14), m = spawn(id, p.x, p.z); if (!m) return; R.boss = m; m.bt = 2.5;
    banner(i === 3 ? T("The Infinity Titan is here!") : T("Boss incoming!"), T(MON[id].boss)); snd("siren"); snd("roar"); paintBoss();
  }

  // ---------------- the hero ----------------
  function hurtHero(n, from) {
    if (R.over || R.dashT > 0 || R.hurtT > 0 || mode !== "play") return;
    const d = n * stat.armor(); R.hp -= d; R.hurtT = 0.35; flashUi("hurt"); snd("hurt"); if (hero && hero.hurt) try { hero.hurt(); } catch { /* fine */ }
    pop(R.x, 2.2, R.z, Math.round(d), "me");
    if (R.hp <= 0) { R.hp = 0; endRun("dead"); }
  }

  // ---------------- weapons ----------------
  function nearest(maxD, skip) { let best = null, bd = maxD * maxD; for (const m of mons) { if (m.st === "die" || (skip && skip.has(m))) continue; const d = (m.x - R.x) ** 2 + (m.z - R.z) ** 2; if (d < bd) { bd = d; best = m; } } return best; }
  function nearestTo(x, z, maxD, skip) { let best = null, bd = maxD * maxD; for (const m of mons) { if (m.st === "die" || (skip && skip.has(m))) continue; const d = (m.x - x) ** 2 + (m.z - z) ** 2; if (d < bd) { bd = d; best = m; } } return best; }
  const lvOf = (id) => R.w[id] || 0, W = (id, k) => WEAPONS[id][k][lvOf(id) - 1];
  function cdReady(id, base) { R.cds[id] = (R.cds[id] || 0) - dtNow; if (R.cds[id] > 0) return false; R.cds[id] = base * stat.cd(); return true; }
  let dtNow = 0;
  function weapons(dt) {
    dtNow = dt;
    if (lvOf("blaster") && cdReady("blaster", W("blaster", "cd") / stat.rate() * (R.evo.star ? 0.7 : 1))) {
      const tgt = nearest(13 * stat.reach()); if (tgt) { const n = W("blaster", "n") + (R.evo.star ? 3 : 0), base = Math.atan2(tgt.x - R.x, tgt.z - R.z);
        for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * (R.evo.star ? 0.22 : 0.12), sp = 19 * stat.rate(); shots.push({ x: R.x, z: R.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, t: 0, life: 0.9 * stat.reach(), dmg: W("blaster", "dmg") * (R.evo.star ? 1.4 : 1), pierce: W("blaster", "pierce") + (R.evo.star ? 3 : 0), hit: new Set(), star: !!R.evo.star }); }
        snd("zap"); } }
    if (lvOf("chain") && cdReady("chain", W("chain", "cd") * (R.evo.thunder ? 0.5 : 1))) {
      let from = { x: R.x, y: 1.2, z: R.z }, n = W("chain", "n") + (R.evo.thunder ? 6 : 0); const seen = new Set(); let tgt = nearest(9 * stat.reach());
      while (tgt && n-- > 0) { seen.add(tgt); const to = { x: tgt.x, y: tgt.fly + 0.8, z: tgt.z }; zap(from, to, R.evo.thunder ? 0xffd23a : 0x8ff0ff); hitMon(tgt, W("chain", "dmg") * (R.evo.thunder ? 1.6 : 1)); from = to; tgt = nearestTo(to.x, to.z, 6 * stat.reach(), seen); }
      if (seen.size) snd("zap"); }
    if (lvOf("orb")) { const n = W("orb", "n") + (R.evo.inferno ? 2 : 0), rad = W("orb", "rad") * stat.area() * (R.evo.inferno ? 1.25 : 1), sz = 0.42 * stat.area() * (R.evo.inferno ? 1.6 : 1); R.orbA += dt * (2.6 + (R.evo.inferno ? 0.6 : 0));
      for (let i = 0; i < n; i++) { const a = R.orbA + (i / n) * Math.PI * 2, x = R.x + Math.cos(a) * rad, z = R.z + Math.sin(a) * rad;
        fx("ball", { p: { x, y: 1.0, z }, s: sz, c: 0xff8a3a, life: dt * 1.5, pulse: true }); fx("ball", { p: { x, y: 1.0, z }, s: sz * 0.55, c: 0xffe0a0, life: dt * 1.5 });
        near(x, z, sz + 0.4, (m) => { const last = m.hitBy.get("orb") || 0; if (R.t - last < 0.45) return; m.hitBy.set("orb", R.t); hitMon(m, W("orb", "dmg") * (R.evo.inferno ? 1.8 : 1), { kb: 3, fx: R.x, fz: R.z }); }); } }
    if (lvOf("laser") && cdReady("laser", W("laser", "cd") / stat.rate())) {
      const tgt = nearest(16 * stat.reach()); const base = tgt ? Math.atan2(tgt.x - R.x, tgt.z - R.z) : R.face, n = W("laser", "n"), len = 16 * stat.reach(), w = 0.55 * stat.area();
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.5, dx = Math.sin(a), dz = Math.cos(a);
        fx("beam", { a: { x: R.x, y: 1.0, z: R.z }, b: { x: R.x + dx * len, y: 1.0, z: R.z + dz * len }, w: w * 0.9, c: 0xff3ad0, life: 0.3, k: 0.8 }); fx("beam", { a: { x: R.x, y: 1.0, z: R.z }, b: { x: R.x + dx * len, y: 1.0, z: R.z + dz * len }, w: w * 0.28, c: 0xffd0f6, life: 0.24 });
        for (const m of mons) { if (m.st === "die") continue; const ox = m.x - R.x, oz = m.z - R.z, along = ox * dx + oz * dz; if (along < 0 || along > len) continue; if (Math.abs(ox * dz - oz * dx) < w + m.r) hitMon(m, W("laser", "dmg")); } }
      snd("charged"); }
    if (lvOf("nova") && cdReady("nova", W("nova", "cd"))) {
      const r = W("nova", "rad") * stat.area(); fx("ring", { p: { x: R.x, z: R.z }, r0: 0.6, r, c: 0x8ff0ff, life: 0.45, ease: true }); fx("disc", { p: { x: R.x, z: R.z, y: 0.07 }, r, c: 0x38d8ff, life: 0.3, k: 0.45 });
      for (const m of mons) { if (m.st === "die") continue; if ((m.x - R.x) ** 2 + (m.z - R.z) ** 2 < (r + m.r) ** 2) hitMon(m, W("nova", "dmg"), { kb: 9 }); } snd("impact"); }
    if (lvOf("meteor") && cdReady("meteor", W("meteor", "cd"))) {
      const n = W("meteor", "n"), r = 2.4 * stat.area(), seen = new Set();
      for (let i = 0; i < n; i++) { const tgt = nearestTo(R.x + (Math.random() - 0.5) * 10, R.z + (Math.random() - 0.5) * 10, 14 * stat.reach(), seen); const x = tgt ? tgt.x : R.x + (Math.random() - 0.5) * 12, z = tgt ? tgt.z : R.z + (Math.random() - 0.5) * 12; if (tgt) seen.add(tgt);
        fx("ring", { p: { x, z }, r, c: 0xff7a3c, life: 0.7, k: 0.8 });
        fx("ball", { p: { x: x - 3, y: 12, z: z - 2 }, s: 0.7 * stat.area(), c: 0xff8a3a, life: 0.7, tick: (o, d, k) => { o.p.x = x - 3 * (1 - k); o.p.y = 12 * (1 - k * k); o.p.z = z - 2 * (1 - k); } });
        setTimeout(() => { if (!on || !R || R.over) return; fx("ring", { p: { x, z }, r0: 0.5, r: r * 1.2, c: 0xffd08a, life: 0.4, ease: true }); fx("disc", { p: { x, z, y: 0.07 }, r, c: 0xff7a3c, life: 0.3, k: 0.6 }); shakeK = Math.max(shakeK, 0.25);
          for (const m of mons) { if (m.st === "die") continue; if ((m.x - x) ** 2 + (m.z - z) ** 2 < (r + m.r) ** 2) hitMon(m, W("meteor", "dmg"), { kb: 5, fx: x, fz: z }); } snd("impact"); }, 700 / Math.max(0.1, timeK)); } }
  }
  function zap(a, b, c) { // a jagged bolt: four bent pieces
    let p = a; for (let k = 1; k <= 4; k++) { const t = k / 4, q = k === 4 ? b : { x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 0.9, y: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 0.5, z: a.z + (b.z - a.z) * t + (Math.random() - 0.5) * 0.9 };
      fx("beam", { a: p, b: q, w: 0.16, c, life: 0.22 }); fx("beam", { a: p, b: q, w: 0.05, c: 0xffffff, life: 0.18 }); p = q; }
  }
  function near(x, z, r, f) { const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const l = grid.get(((i + 64) << 8) | (j + 64)); if (!l) continue; for (const m of l) if (m.st !== "die" && (m.x - x) ** 2 + (m.z - z) ** 2 < (r + m.r) ** 2) f(m); } }

  // ---------------- cards ----------------
  function offer(chest) {
    const out = [], wN = Object.keys(R.w).length, pN = Object.keys(R.p).length;
    for (const e of EVOS) if (!R.evo[e.id] && lvOf(e.from) >= MAX_LV && pv(e.with) >= MAX_LV) out.push({ k: "evo", id: e.id, w: chest ? 100 : 6 });
    for (const id of Object.keys(WEAPONS)) { const l = lvOf(id); if (l >= MAX_LV || (!l && wN >= SLOTS)) continue; out.push({ k: "w", id, w: l ? 3 : 2 }); }
    for (const id of Object.keys(PASSIVES)) { const l = pv(id); if (l >= MAX_LV || (!l && pN >= SLOTS)) continue; out.push({ k: "p", id, w: l ? 2.4 : 1.6 }); }
    const pickN = []; const pool = out.slice();
    while (pickN.length < 3 && pool.length) { const tot = pool.reduce((s, x) => s + x.w, 0); let r = Math.random() * tot, i = 0; for (; i < pool.length - 1; i++) if ((r -= pool[i].w) <= 0) break; pickN.push(pool.splice(i, 1)[0]); }
    if (!pickN.length) pickN.push({ k: "heal" }, { k: "dmg" });
    return pickN;
  }
  function take(c) {
    if (c.k === "w") R.w[c.id] = lvOf(c.id) + 1; else if (c.k === "p") { R.p[c.id] = pv(c.id) + 1; if (c.id === "vital") { R.hpMax += 20; R.hp += 20; } }
    else if (c.k === "evo") R.evo[c.id] = 1; else if (c.k === "heal") heal(R.hpMax * 0.3); else if (c.k === "dmg") R.bonusDmg *= 1.1;
    snd(c.k === "evo" ? "jackpot" : "equip"); paintSlots();
  }
  function cardHtml(c, i) {
    let ic, name, line, tag, cls = "";
    if (c.k === "w") { const w = WEAPONS[c.id], l = lvOf(c.id); ic = c.id; name = w.name; line = w.lv[l]; tag = l ? T("Lv {n}", { n: l + 1 }) : T("NEW"); cls = "w"; }
    else if (c.k === "p") { const p = PASSIVES[c.id], l = pv(c.id); ic = c.id; name = p.name; line = p.line; tag = l ? T("Lv {n}", { n: l + 1 }) : T("NEW"); cls = "p"; }
    else if (c.k === "evo") { const e = EVOS.find((x) => x.id === c.id); ic = e.id; name = e.name; line = e.line; tag = T("EVOLVE"); cls = "evo"; }
    else if (c.k === "heal") { ic = "heal"; name = "Heal 30% HP"; line = ""; tag = ""; cls = "p"; } else { ic = "dmg"; name = "+10% damage for this run"; line = ""; tag = ""; cls = "w"; }
    return `<button type="button" class="sv-card ${cls}" data-i="${i}"><span class="sv-card-ic">${icon(ic, 40)}</span><span class="sv-card-t"><b>${esc(T(name))}</b>${line ? `<small>${esc(T(line))}</small>` : ""}</span>${tag ? `<em>${esc(tag)}</em>` : ""}<kbd>${i + 1}</kbd></button>`;
  }
  let cards = null;
  function showCards(chest) {
    const list = offer(chest); cards = list; mode = "cards";
    ui.cards.innerHTML = `<div class="sv-cards-in"><small>${esc(chest ? T("A chest!") : T("LEVEL UP!"))}</small><h3>${esc(chest ? T("Choose one") : T("Lv {n}", { n: R.lv }))}</h3><div class="sv-cards-l">${list.map(cardHtml).join("")}</div></div>`;
    ui.cards.hidden = false; snd(chest ? "chest" : "level");
    ui.cards.querySelectorAll(".sv-card").forEach((b) => b.addEventListener("click", () => choose(Number(b.dataset.i))));
  }
  function choose(i) { if (mode !== "cards" || !cards || !cards[i]) return; take(cards[i]); cards = null; ui.cards.hidden = true; mode = "play"; keys.clear(); joy.on = false; paintJoy(); if (R.pendingLv > 0) { R.pendingLv--; setTimeout(() => { if (mode === "play") showCards(false); }, 120); } }

  // ---------------- the loop ----------------
  let camK = 1, shakeK = 0, slowMo = 0, timeK = 1, camP = new THREE.Vector3(), camL = new THREE.Vector3(), camInit = false;
  const keys = new Set(), joy = { on: false, id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
  function tick(dt, t) {
    dt = Math.min(dt, 0.05);
    if (mode === "play" && R && !R.over) step(dt);
    if (R) drawMons(mode === "play" ? dt * timeK : 0, t);
    drawFx(mode === "play" || mode === "over" || mode === "count" ? dt * timeK : 0);
    if (hero) { hero.obj.position.set(R ? R.x : 0, 0, R ? R.z : 0); const mv = mode === "play" && R && Math.hypot(R.vx, R.vz) > 0.3; if (hero.play && !(hero.busy && hero.busy())) hero.play(mode === "over" && R && R.hp <= 0 ? "die" : mv ? "run" : "idle", { speed: mv ? 1.1 : 1 });
      if (mode !== "pause" && mode !== "cards") hero.update(dt, t, mv ? 1 : 0, 0); if (R) hero.obj.rotation.y += Math.atan2(Math.sin(R.face - hero.obj.rotation.y), Math.cos(R.face - hero.obj.rotation.y)) * Math.min(1, dt * 14); }
    if (FX) { FX.heroShadow.position.set(R ? R.x : 0, 0.03, R ? R.z : 0); FX.magnet.position.set(R ? R.x : 0, 0.05, R ? R.z : 0); const mg = R ? stat.magnet() : 2.2; FX.magnet.scale.set(mg, 1, mg); FX.magnet.visible = mode === "play"; }
    if (S.flames) { const k = 1 + Math.sin(t * 9) * 0.08; S.flames.scale.set(1, k, 1); }
    if (S.runeM) S.runeM.rotation.z = t * 0.05;
    camera(dt, t); paintHud(t);
  }
  function camera(dt) {
    const o = phone() || S.cam.aspect < 0.8 ? CAM_PHONE : CAM_PC, x = R ? R.x : 0, z = R ? R.z : 0, lobby = mode === "lobby";
    const tx = x + o[0], ty = lobby ? 7 : o[1] * camK, tz = z + (lobby ? 11 : o[2] * camK);
    if (!camInit) { camP.set(tx, ty, tz); camL.set(x, lobby ? 1.3 : 0, z); camInit = true; }
    const k = Math.min(1, dt * (lobby ? 3 : 6)); camP.x += (tx - camP.x) * k; camP.y += (ty - camP.y) * k; camP.z += (tz - camP.z) * k; camL.x += (x - camL.x) * k; camL.y += ((lobby ? 1.3 : 0) - camL.y) * k; camL.z += (z - camL.z) * k;
    S.cam.position.copy(camP); if (shakeK > 0 && !reduce) { S.cam.position.x += (Math.random() - 0.5) * shakeK * 0.6; S.cam.position.z += (Math.random() - 0.5) * shakeK * 0.6; } shakeK = Math.max(0, shakeK - dt * 2.5);
    S.cam.lookAt(camL); const asp = innerWidth / Math.max(1, innerHeight); if (Math.abs(S.cam.aspect - asp) > 0.001) { S.cam.aspect = asp; S.cam.updateProjectionMatrix(); }
  }
  function step(dt0) {
    if (slowMo > 0) { slowMo -= dt0; timeK = 0.35; } else timeK = 1;
    const dt = dt0 * timeK; R.t += dt;
    // move
    let ix = 0, iz = 0; if (keys.has("a") || keys.has("arrowleft")) ix -= 1; if (keys.has("d") || keys.has("arrowright")) ix += 1; if (keys.has("w") || keys.has("arrowup")) iz -= 1; if (keys.has("s") || keys.has("arrowdown")) iz += 1;
    if (joy.on) { ix = joy.dx; iz = joy.dy; } const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    R.dashCd -= dt; R.hurtT -= dt; if (R.dashT > 0) R.dashT -= dt;
    const sp = stat.speed() * (R.dashT > 0 ? 3.4 : 1), tvx = ix * sp, tvz = iz * sp, a = Math.min(1, dt * (R.dashT > 0 ? 30 : 14));
    R.vx += (tvx - R.vx) * a; R.vz += (tvz - R.vz) * a; if (R.dashT > 0 && il < 0.1) { R.vx = Math.sin(R.face) * sp; R.vz = Math.cos(R.face) * sp; }
    R.x += R.vx * dt; R.z += R.vz * dt; const rr = Math.hypot(R.x, R.z); if (rr > ARENA_R - 1) { R.x *= (ARENA_R - 1) / rr; R.z *= (ARENA_R - 1) / rr; }
    if (Math.hypot(R.vx, R.vz) > 0.5) R.face = Math.atan2(R.vx, R.vz); else { const n = nearest(8); if (n) R.face = Math.atan2(n.x - R.x, n.z - R.z); }
    if (R.dashT > 0 && Math.random() < 0.7) fx("ball", { p: { x: R.x, y: 0.9, z: R.z }, s: 0.35, c: R.hero.color === "#ff6fc8" ? 0xff6fc8 : R.hero.color === "#9b6bff" ? 0x9b6bff : 0x38d8ff, life: 0.3, shrink: true });
    // regen
    if (stat.regen() > 0) heal(stat.regen() * dt);
    // the clock: bosses, swarms, elites, the end
    if (R.bossNext < BOSSES.length && R.t >= RULES.BOSS_AT[R.bossNext]) { spawnBoss(R.bossNext); R.bossNext++; }
    if (R.t >= RULES.RUN_S && !R.said.s12) { R.said.s12 = 1; R.clear = true; banner(T("Survived 12 minutes!"), ""); snd("win"); }
    if (R.swarmAt.length && R.t >= R.swarmAt[0]) { R.swarmAt.shift(); swarm(); }
    if ((R.eliteT -= dt) <= 0) { R.eliteT = 38 - Math.min(18, R.t / 40); const id = eliteAt(R.t); if (id) { const p = edgePoint(); spawn(id, p.x, p.z); } }
    if ((R.spawnT -= dt) <= 0) { R.spawnT = 0.35; spawnRing(); }
    if (R.t >= RULES.END_S) { endRun("time"); return; }
    // the grid
    grid.clear(); for (const m of mons) { if (m.st === "die") continue; const k = key(m.x, m.z); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(m); }
    // monsters
    for (const m of mons) {
      if (m.st === "die") { m.at += dt; continue; }
      m.flash = Math.max(0, m.flash - dt * 5); m.slow = Math.max(0, m.slow - dt); m.born = Math.min(1, m.born + dt * 3);
      const dx = R.x - m.x, dz = R.z - m.z, d = Math.hypot(dx, dz) || 0.001;
      if (R.still) { m.at += dt; continue; }
      if (m.boss && bossTick(m, dt)) { m.at += dt; continue; }
      const spd = m.sp * (m.slow > 0 ? 0.5 : 1) * (m.st === "atk" ? 0.25 : 1);
      if (d > m.r + HERO_R + 0.1) { m.x += (dx / d) * spd * dt; m.z += (dz / d) * spd * dt; }
      m.x += m.vx * dt; m.z += m.vz * dt; m.vx *= Math.max(0, 1 - dt * 6); m.vz *= Math.max(0, 1 - dt * 6);
      m.face += Math.atan2(Math.sin(Math.atan2(dx, dz) - m.face), Math.cos(Math.atan2(dx, dz) - m.face)) * Math.min(1, dt * 8);
      // shove the neighbours apart
      const ck = key(m.x, m.z), cx = (ck >> 8) - 64, cz = (ck & 255) - 64;
      for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) { const l = grid.get(((i + 64) << 8) | (j + 64)); if (!l) continue;
        for (const o of l) { if (o === m) continue; const ox = m.x - o.x, oz = m.z - o.z, od = ox * ox + oz * oz, rs = m.r + o.r; if (od < rs * rs && od > 1e-6) { const s = Math.sqrt(od), push = (rs - s) * 0.5 * (o.boss ? 1.6 : m.boss ? 0.1 : 1); m.x += (ox / s) * push; m.z += (oz / s) * push; } } }
      // a touch
      m.atkCd -= dt; m.at += dt;
      if (d < m.r + HERO_R + 0.35) { if (m.atkCd <= 0) { m.atkCd = 0.9; if (!m.boss) { m.st = "atk"; m.at = 0; } hurtHero(m.dmg, m); } }
      if (m.st === "atk" && m.at > m.kd.R.atk.dur) { m.st = "move"; m.at = 0; }
      const r2 = Math.hypot(m.x, m.z); if (r2 > ARENA_R - 0.5) { m.x *= (ARENA_R - 0.5) / r2; m.z *= (ARENA_R - 0.5) / r2; }
    }
    // the dead fade, then go
    for (let i = mons.length - 1; i >= 0; i--) if (mons[i].st === "die" && mons[i].at > mons[i].kd.R.die.dur + 0.35) mons.splice(i, 1);
    // your bolts
    for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.t += dt; s.x += s.vx * dt; s.z += s.vz * dt; let gone = s.t > s.life;
      if (!gone) near(s.x, s.z, 0.35, (m) => { if (gone || s.hit.has(m)) return; s.hit.add(m); hitMon(m, s.dmg, { kb: 1.5, fx: s.x - s.vx, fz: s.z - s.vz }); if (s.pierce-- <= 0) gone = true; });
      if (gone) { shots.splice(i, 1); continue; }
      const l = 0.9; fx("beam", { a: { x: s.x - s.vx / 19 * l, y: 1.0, z: s.z - s.vz / 19 * l }, b: { x: s.x, y: 1.0, z: s.z }, w: s.star ? 0.34 : 0.22, c: s.star ? 0xfff07a : 0x38d8ff, life: dt * 1.2 }); fx("ball", { p: { x: s.x, y: 1.0, z: s.z }, s: s.star ? 0.22 : 0.15, c: 0xffffff, life: dt * 1.2 }); }
    // the bosses' shots
    for (let i = foes.length - 1; i >= 0; i--) { const s = foes[i]; s.t += dt; s.x += s.vx * dt; s.z += s.vz * dt; if (s.t > 4 || Math.hypot(s.x, s.z) > ARENA_R) { foes.splice(i, 1); continue; }
      if (Math.hypot(s.x - R.x, s.z - R.z) < 0.6) { hurtHero(s.dmg); foes.splice(i, 1); continue; }
      fx("ball", { p: { x: s.x, y: 1.0, z: s.z }, s: 0.38, c: 0xff5a2a, life: dt * 1.2, pulse: true }); fx("ball", { p: { x: s.x, y: 1.0, z: s.z }, s: 0.2, c: 0xffe0a0, life: dt * 1.2 }); }
    weapons(dt);
    // gems: pulled in inside the magnet, then picked up
    const mg = stat.magnet();
    for (let i = gems.length - 1; i >= 0; i--) { const g = gems[i]; g.t += dt; const dx = R.x - g.x, dz = R.z - g.z, d = Math.hypot(dx, dz);
      if (g.pull || d < mg) { g.pull = true; const s = Math.min(d, (8 + g.t * 6) * dt); g.x += (dx / (d || 1)) * s; g.z += (dz / (d || 1)) * s; }
      if (d < 0.6) { gems.splice(i, 1); R.xp += g.v; if (R.kills % 3 === 0) snd("pick"); while (R.xp >= R.need) { R.xp -= R.need; R.lv++; R.need = needXp(R.lv); R.pendingLv++; } } }
    if (gems.length > 800) { const g = gems.shift(); gems[0].v += g.v; } // a crowd of gems: the oldest join the next
    // the chest
    if (R.chest) { R.chest.t += dt; FX.chest.rotation.y = R.chest.t * 1.5; FX.chest.position.y = 0.2 + Math.sin(R.chest.t * 3) * 0.12; if (Math.hypot(R.x - R.chest.x, R.z - R.chest.z) < 1.4) { R.chest = null; FX.chest.visible = false; showCards(true); if (R.pendingChest > 0) { R.pendingChest--; const p = edgePoint(6); dropChest(p.x, p.z); } return; } }
    if (R.pendingLv > 0 && mode === "play") { R.pendingLv--; showCards(false); }
  }
  // the crowd onto its meshes: each kind's instances, its frames, its flash; and the soft shadows under all of them
  function drawMons(dt, t) {
    for (const id in pack) { const kd = pack[id]; if (kd.mesh) kd.mesh.count = 0; }
    let sh = 0;
    for (const m of mons) {
      const kd = m.kd, mesh = kd.mesh; if (!mesh) continue; const i = mesh.count; if (i >= mesh.instanceMatrix.count) continue;
      const role = m.st === "die" ? "die" : m.st === "atk" ? "atk" : "move", animT = role === "move" ? (m.at * m.sp * 0.42) : m.at;
      const [fa, fb, mix] = frameOf(kd, role, role === "move" ? animT * kd.R.move.dur : animT * (role === "die" ? 1.3 : 1.2));
      kd.anim.setXYZW(i, fa, fb, mix, m.flash * 0.8);
      const sink = m.st === "die" ? Math.max(0, m.at - kd.R.die.dur) / 0.35 : 0, s = (m.born < 1 ? 0.3 + m.born * 0.7 : 1) * (1 - sink * 0.9), y = m.fly ? m.fly + Math.sin(t * 3 + m.bob) * 0.15 : 0;
      qq.setFromEuler(ee.set(0, m.face, 0)); mesh.setMatrixAt(i, m4.compose(vv.set(m.x, y - sink * 0.3, m.z), qq, ss.set(s, s, s))); mesh.count = i + 1;
      if (sh < FX.shadow.instanceMatrix.count) { const r = m.r * 1.5 * (m.fly ? 0.8 : 1); FX.shadow.setMatrixAt(sh++, m4.compose(vv.set(m.x, 0.025, m.z), qq.identity(), ss.set(r, 1, r))); }
    }
    for (const id in pack) { const kd = pack[id]; if (kd.mesh) { kd.mesh.instanceMatrix.needsUpdate = true; kd.anim.needsUpdate = true; } }
    FX.shadow.count = sh; FX.shadow.instanceMatrix.needsUpdate = true;
    // gems
    const gm = FX.gem; let n = 0; for (const g of gems) { if (n >= gm.instanceMatrix.count) break; const s = g.v >= 10 ? 1.9 : g.v >= 3 ? 1.4 : 1; qq.setFromEuler(ee.set(0, t * 2 + g.x, 0)); gm.setMatrixAt(n, m4.compose(vv.set(g.x, 0.4 + Math.sin(t * 4 + g.z) * 0.08, g.z), qq, ss.set(s, s, s))); gm.setColorAt(n, col.set(g.v >= 10 ? 0xff5ad8 : g.v >= 3 ? 0x39ff88 : 0x38b8ff)); n++; }
    gm.count = n; gm.instanceMatrix.needsUpdate = true; if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
  }

  // ---------------- the HUD ----------------
  const pops = []; let popEls = [];
  function pop(x, y, z, n, cls) { if (!ui || n <= 0) return; if (pops.length > (phone() ? 14 : 22)) { if (cls !== "crit" && cls !== "me" && cls !== "boss") return; pops.shift().el.remove(); }
    const el = document.createElement("i"); el.className = "sv-pop " + cls; el.textContent = fmt(n); ui.pops.appendChild(el); pops.push({ el, x, y, z, t: 0 }); }
  const pv3 = new THREE.Vector3();
  function paintPops(dt) { for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t > 0.7) { p.el.remove(); pops.splice(i, 1); continue; } pv3.set(p.x, p.y + p.t * 1.2, p.z).project(S.cam); const k = scaleK(); p.el.style.transform = `translate3d(${((pv3.x * 0.5 + 0.5) * innerWidth / k).toFixed(1)}px,${((-pv3.y * 0.5 + 0.5) * innerHeight / k).toFixed(1)}px,0) translate(-50%,-50%) scale(${(1 + (p.t < 0.1 ? (0.1 - p.t) * 4 : 0)).toFixed(2)})`; p.el.style.opacity = String(Math.min(1, (0.7 - p.t) * 4)); } }
  const scaleK = () => (document.documentElement.classList.contains("wp-pcphone") ? innerWidth / 400 : Math.max(1, Math.min(1.25, innerHeight / 860)));
  function fit() { if (!ui) return; const k = scaleK(); Object.assign(ui.root.style, { width: innerWidth / k + "px", height: innerHeight / k + "px", transform: `scale(${k})` }); }
  function buildUi() {
    const root = document.createElement("div"); root.className = "sv"; root.hidden = true;
    root.innerHTML = `<div class="sv-vig"></div><div class="sv-hurt"></div><div class="sv-pops"></div>
      <div class="sv-top" data-game-hud>
        <button type="button" class="sv-pause" aria-label="${esc(T("Paused"))}"><svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg></button>
        <div class="sv-hp"><i></i><b>100</b></div>
        <div class="sv-time"><b>00:00</b><small>12:00</small></div>
        <div class="sv-kills"><svg viewBox="0 0 24 24"><path d="M12 2c5 0 8 3.6 8 8 0 3-1.6 5-3.5 6v3h-9v-3C5.6 15 4 13 4 10c0-4.4 3-8 8-8z"/><circle cx="9" cy="10.5" r="1.8" fill="#0a1a42"/><circle cx="15" cy="10.5" r="1.8" fill="#0a1a42"/></svg><b>0</b></div>
      </div>
      <div class="sv-boss" hidden><b></b><div><i></i></div></div>
      <div class="sv-slots"></div>
      <div class="sv-xp"><i></i><b>Lv 1</b></div>
      <div class="sv-joy" aria-hidden="true"><i></i></div>
      <button type="button" class="sv-dash" aria-label="${esc(T("Dash"))}"><svg viewBox="0 0 24 24"><path d="M4 12h10M10 6l6 6-6 6M18 5v14"/></svg><b>${esc(T("Dash"))}</b><i class="sv-dash-cd"></i></button>
      <div class="sv-keys">${esc(T("WASD move · Space dash · Esc pause"))}</div>
      <div class="sv-banner" hidden><small></small><b></b></div>
      <div class="sv-cards" hidden></div>
      <div class="sv-sheet" hidden></div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    ui = { root, pops: q(".sv-pops"), hp: q(".sv-hp i"), hpN: q(".sv-hp b"), time: q(".sv-time b"), kills: q(".sv-kills b"), boss: q(".sv-boss"), bossN: q(".sv-boss b"), bossI: q(".sv-boss i"), slots: q(".sv-slots"), xp: q(".sv-xp i"), lv: q(".sv-xp b"),
      joy: q(".sv-joy"), knob: q(".sv-joy i"), dash: q(".sv-dash"), dashCd: q(".sv-dash-cd"), banner: q(".sv-banner"), cards: q(".sv-cards"), sheet: q(".sv-sheet"), hurt: q(".sv-hurt"), top: q(".sv-top") };
    q(".sv-pause").addEventListener("click", () => pause());
    ui.dash.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); dash(); });
    // the stick: put a thumb down anywhere that isn't a button, drag to move
    root.addEventListener("pointerdown", (e) => { if (mode !== "play" || joy.on || e.target.closest("button,.sv-cards,.sv-sheet")) return; e.preventDefault(); const k = scaleK(); joy.on = true; joy.id = e.pointerId; joy.x0 = e.clientX / k; joy.y0 = e.clientY / k; joy.dx = joy.dy = 0; try { root.setPointerCapture(e.pointerId); } catch { /* fine */ } paintJoy(); });
    root.addEventListener("pointermove", (e) => { if (!joy.on || e.pointerId !== joy.id) return; const k = scaleK(), mx = 46; let dx = e.clientX / k - joy.x0, dy = e.clientY / k - joy.y0; const l = Math.hypot(dx, dy); if (l > mx) { dx *= mx / l; dy *= mx / l; } joy.dx = dx / mx; joy.dy = dy / mx; paintJoy(); });
    const up = (e) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.dx = joy.dy = 0; paintJoy(); };
    root.addEventListener("pointerup", up); root.addEventListener("pointercancel", up); root.addEventListener("lostpointercapture", up);
    addEventListener("resize", fit); fit();
  }
  function paintJoy() { if (!ui) return; ui.joy.classList.toggle("on", joy.on); if (joy.on) { ui.joy.style.left = joy.x0 + "px"; ui.joy.style.top = joy.y0 + "px"; ui.knob.style.transform = `translate(${joy.dx * 46}px,${joy.dy * 46}px)`; } else { ui.joy.style.left = ""; ui.joy.style.top = ""; ui.knob.style.transform = ""; } }
  function dash() { if (mode !== "play" || !R || R.dashCd > 0) return; R.dashT = DASH_T; R.dashCd = DASH_CD; snd("dash"); }
  let lastHud = 0;
  function paintHud(t) {
    if (!ui || !R) return; paintPops(Math.min(0.05, t - (paintHud.t || t))); paintHud.t = t;
    if (t - lastHud < 0.1) return; lastHud = t;
    ui.hp.style.transform = `scaleX(${Math.max(0, R.hp / R.hpMax).toFixed(3)})`; ui.hpN.textContent = String(Math.ceil(R.hp)); ui.root.classList.toggle("low", R.hp / R.hpMax < 0.3);
    ui.time.textContent = mmss(R.t); ui.kills.textContent = fmt(R.kills); ui.xp.style.transform = `scaleX(${Math.min(1, R.xp / R.need).toFixed(3)})`; ui.lv.textContent = T("Lv {n}", { n: R.lv });
    ui.dashCd.style.transform = `scaleY(${Math.max(0, R.dashCd / DASH_CD).toFixed(3)})`; ui.dash.classList.toggle("cool", R.dashCd > 0);
    if (R.boss) ui.bossI.style.transform = `scaleX(${Math.max(0, R.boss.hp / R.boss.hpMax).toFixed(3)})`;
  }
  function paintBoss() { if (!ui) return; ui.boss.hidden = !(R && R.boss); if (R && R.boss) { ui.bossN.textContent = T(MON[R.boss.id].boss); ui.bossI.style.transform = "scaleX(1)"; } }
  function paintSlots() { if (!ui || !R) return; const w = Object.keys(R.w).map((id) => [id, R.w[id], "w"]), p = Object.keys(R.p).map((id) => [id, R.p[id], "p"]);
    const evoOf = (id) => EVOS.find((e) => e.from === id && R.evo[e.id]);
    ui.slots.innerHTML = `<div>${w.map(([id, l]) => { const e = evoOf(id); return `<span class="w${e ? " evo" : ""}">${icon(e ? e.id : id, 18)}<b>${e ? "★" : l}</b></span>`; }).join("")}</div><div>${p.map(([id, l]) => `<span class="p">${icon(id, 16)}<b>${l}</b></span>`).join("")}</div>`; }
  function banner(big, small) { if (!ui) return; ui.banner.hidden = false; ui.banner.querySelector("b").textContent = big; ui.banner.querySelector("small").textContent = small || ""; ui.banner.classList.remove("go"); void ui.banner.offsetWidth; ui.banner.classList.add("go"); clearTimeout(banner.t); banner.t = setTimeout(() => { if (ui) ui.banner.hidden = true; }, 2600); }
  function flashUi(kind) { if (!ui) return; const el = kind === "hurt" ? ui.hurt : ui.root.querySelector(".sv-vig"); el.classList.remove("go"); void el.offsetWidth; el.classList.add("go"); }

  // ---------------- the lobby, the pause, the result ----------------
  let status = null; // the server's word for today: { today, cap, runsLeft }
  async function readStatus() { const s = ctx.sess && ctx.sess(); if (!s) { status = null; return; } try { const r = await fetch("/api/social?world=surv&wallet=" + s.wallet, { cache: "no-store" }); status = r.ok ? await r.json() : null; } catch { status = null; } }
  function lobby() {
    mode = "lobby"; camInit = false; const signed = !!(ctx.sess && ctx.sess());
    const d = RULES.DIFF[pick.diff];
    ui.sheet.innerHTML = `<div class="sv-lobby"><small>ARCIRCLE WORLD</small><h2>${esc(T("SURVIVORS ARENA"))}</h2><p>${esc(T("Survive 12 minutes. Beat 4 bosses."))}</p>
      <h4>${esc(T("Choose your hero"))}</h4><div class="sv-heroes">${HEROES.map((h, i) => `<button type="button" data-h="${i}" class="${i === pick.hero ? "on" : ""}" style="--c:${h.color}"><img src="models/world/chars/${h.id}.webp?v=1" alt="" loading="lazy"><b>${esc(h.name)}</b><small>${esc(T(h.perk))}</small><span>${icon(h.w, 18)}</span></button>`).join("")}</div>
      <h4>${esc(T("Difficulty"))}</h4><div class="sv-diff">${Object.keys(RULES.DIFF).map((k) => `<button type="button" data-d="${k}" class="${k === pick.diff ? "on" : ""}"><b>${esc(T(k[0].toUpperCase() + k.slice(1)))}</b><small>×${RULES.DIFF[k].k}</small></button>`).join("")}</div>
      <div class="sv-pay">${signed ? `<b>${esc(T("Up to {n} ARCL a run · first 3 runs a day", { n: fmt(d.cap) }))}</b>${status ? `<small>${esc(T("Today: {n} / {m} ARCL", { n: fmt(status.today || 0), m: fmt(status.cap || RULES.DAY_ARCL) }))} · ${esc(T("Paid runs left today: {n}", { n: status.runsLeft ?? RULES.DAY_RUNS }))}</small>` : ""}` : `<b>${esc(T("Sign in with a wallet to earn ARCL here"))}</b>`}</div>
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
    const p = (heroP = ctx.makeHero(id).catch(() => null)); const c = await p; if (heroP !== p || heroId !== want) { return; }
    if (!c) { ctx.toast(T("The arena couldn't load: {e}", { e: "hero" })); return; }
    if (hero && hero.obj.parent) hero.obj.parent.remove(hero.obj); hero = c; hero.obj.position.set(R ? R.x : 0, 0, R ? R.z : 0); S.scene.add(hero.obj);
  }
  let run = null, runP = null;
  async function startRun() {
    if (mode !== "lobby") return; ui.sheet.hidden = true; ui.root.classList.remove("menu"); ui.top.hidden = false;
    await setHero(HEROES[pick.hero].id); newRun(); paintSlots(); paintBoss(); camInit = false;
    for (const id in pack) if (pack[id].mesh) pack[id].mesh.count = 0;
    const ss = ctx.sess && ctx.sess(); run = null;
    runP = ss && ctx.post ? ctx.post({ action: "world-surv-start", ...ss, diff: pick.diff }).then((r) => { if (r && r.ok && r.j && r.j.runId) run = r.j; return run; }).catch(() => null) : Promise.resolve(null);
    mode = "count"; banner(T("3 · 2 · 1 · GO!"), T(HEROES[pick.hero].name)); snd("enter");
    setTimeout(() => { if (on && mode === "count") { mode = "play"; for (let i = 0; i < 6; i++) { const p = edgePoint(); spawn("blob", p.x, p.z); } } }, 1500);
  }
  function pause() { if (mode !== "play") return; mode = "pause"; keys.clear(); joy.on = false; paintJoy();
    ui.sheet.innerHTML = `<div class="sv-lobby small"><h3>${esc(T("Paused"))}</h3><p>${esc(T("Quit now? Boss bonuses are paid only if you reach 12:00."))}</p><div class="sv-btns"><button type="button" class="go" data-a="go">${esc(T("Resume"))}</button><button type="button" data-a="quit">${esc(T("Quit the run"))}</button></div></div>`;
    ui.sheet.hidden = false; ui.sheet.querySelector('[data-a="go"]').addEventListener("click", () => { ui.sheet.hidden = true; mode = "play"; }); ui.sheet.querySelector('[data-a="quit"]').addEventListener("click", () => { ui.sheet.hidden = true; mode = "play"; endRun("quit"); }); }
  async function endRun(how) {
    if (!R || R.over) return; R.over = true; mode = "over"; keys.clear(); joy.on = false; paintJoy(); ui.cards.hidden = true; cards = null;
    if (how === "dead" && R.t < RULES.RUN_S) R.clear = false;
    const secs = Math.floor(R.t), out = { secs, kills: R.kills, bosses: R.bosses, diff: R.diff, clear: R.clear && secs >= RULES.RUN_S };
    const xp = worldXp(out); if (ctx.gain && xp > 0) try { ctx.gain(xp, "survivors"); } catch { /* the run still ends */ }
    const est = reward(out), title = how === "win" ? T("VICTORY") : how === "dead" ? T("YOU FELL") : how === "time" ? T("TIME UP") : T("Run ended");
    snd(how === "win" ? "win" : how === "dead" ? "ko" : "tap");
    const ws = Object.keys(R.w).map((id) => { const e = EVOS.find((x) => x.from === id && R.evo[x.id]); return `<span>${icon(e ? e.id : id, 22)}<b>${e ? "★" : R.w[id]}</b></span>`; }).join("");
    const signed = !!(ctx.sess && ctx.sess());
    await new Promise((ok) => setTimeout(ok, how === "dead" ? 1300 : 600)); if (!on) return;
    ui.sheet.innerHTML = `<div class="sv-res ${how}"><small>${esc(T("SURVIVORS ARENA"))}</small><h2>${esc(title)}</h2>
      <div class="sv-stats"><div><small>${esc(T("Time"))}</small><b>${mmss(secs)}</b></div><div><small>${esc(T("Knock-outs"))}</small><b>${fmt(R.kills)}</b></div><div><small>${esc(T("Bosses"))}</small><b>${R.bosses}/4</b></div><div><small>${esc(T("Level"))}</small><b>${R.lv}</b></div></div>
      <div class="sv-ws"><small>${esc(T("Weapons"))}</small>${ws}</div>
      <div class="sv-gain"><div class="sv-arcl"><i class="sv-coin"></i><b>${signed ? "…" : "0"}</b><small>${esc(signed ? T("Sending your run…") : T("Guest run: sign in to earn ARCL"))}</small></div><div class="sv-wxp"><b>+${fmt(xp)}</b><small>${esc(T("World XP"))}</small></div></div>
      <div class="sv-btns"><button type="button" class="go" data-a="again">${esc(T("Play again"))}</button><button type="button" data-a="leave">${esc(T("Leave"))}</button></div></div>`;
    ui.sheet.hidden = false; ui.root.classList.add("menu");
    ui.sheet.querySelector('[data-a="again"]').addEventListener("click", () => { clearRun(); readStatus().finally(() => { if (on) lobby(); }); });
    ui.sheet.querySelector('[data-a="leave"]').addEventListener("click", () => leave());
    if (!signed) return;
    const box = ui.sheet.querySelector(".sv-arcl");
    try {
      const rr = await Promise.race([runP, new Promise((ok) => setTimeout(() => ok(null), 6000))]);
      if (!rr || !rr.runId) throw new Error("no run");
      const res = await ctx.post({ action: "world-surv-end", ...ctx.sess(), runId: rr.runId, secs, kills: R.kills, bosses: R.bosses, clear: out.clear, ms: Math.round(R.t * 1000) });
      if (!box.isConnected) return; const j = (res && res.j) || {};
      if (!res || !res.ok) throw new Error(j.error || "failed");
      box.querySelector("b").textContent = j.credited > 0 ? T("+{n} ARCL", { n: fmt(j.credited) }) : "0";
      box.querySelector("small").textContent = j.credited > 0 ? (j.runsLeft != null ? T("Paid runs left today: {n}", { n: j.runsLeft }) : "") : j.why === "runs" ? T("Today's 3 paid runs are used — XP only now") : j.why === "cap" ? T("Today's ARCL limit is reached") : T("No ARCL this run");
      if (j.credited > 0) { box.classList.add("paid"); snd("coin"); if (ctx.refresh) ctx.refresh(); }
    } catch (e) { if (box.isConnected) { box.querySelector("b").textContent = "—"; box.querySelector("small").textContent = T("The reward couldn't be sent — try again later") + (e && e.message && e.message !== "no run" ? " (" + String(e.message).slice(0, 40) + ")" : ""); } void est; }
  }
  function clearRun() { mons.length = 0; gems.length = 0; shots.length = 0; foes.length = 0; if (FX) { for (const k in FX.list) FX.list[k].length = 0; FX.chest.visible = false; FX.shadow.count = 0; FX.gem.count = 0; } if (pack) for (const id in pack) if (pack[id].mesh) pack[id].mesh.count = 0; for (const p of pops) p.el.remove(); pops.length = 0; R = null; ui.boss.hidden = true; ui.slots.innerHTML = ""; }

  // ---------------- keys ----------------
  const kd = (e) => { if (!on) return; const k = String(e.key || "").toLowerCase(); if (e.target && e.target.closest && e.target.closest("input,textarea")) return;
    e.stopImmediatePropagation(); if (["w", "a", "s", "d", "arrowleft", "arrowright", "arrowup", "arrowdown", " ", "escape", "1", "2", "3"].includes(k)) e.preventDefault();
    if (k === "escape") { if (mode === "play") pause(); else if (mode === "pause") { ui.sheet.hidden = true; mode = "play"; } else if (mode === "lobby") leave(); return; }
    if (mode === "cards" && ["1", "2", "3"].includes(k)) { choose(Number(k) - 1); return; }
    if (k === " ") { dash(); return; } keys.add(k); };
  const ku = (e) => { if (!on) return; keys.delete(String(e.key || "").toLowerCase()); e.stopImmediatePropagation(); };

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
      st.view(S.scene, S.cam, null); st.solo(tick); on = true;
      addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
      R = null; lobby(); return true;
    } catch (e) {
      console.warn("survivors", e); ctx.toast(T("The arena couldn't load: {e}", { e: String((e && e.message) || e).slice(0, 70) })); try { reset(); } catch { /* already reset */ } return false;
    } finally { busy = false; }
  }
  function reset() {
    on = false; mode = "off"; document.body.classList.remove("wp-surv"); if (ui) { ui.root.hidden = true; ui.sheet.hidden = true; ui.cards.hidden = true; }
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); keys.clear(); joy.on = false;
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
    if (R || mons.length) clearRun();
  }
  function leave() { if (!on) return; if (R && !R.over && mode !== "lobby") { endRun("quit"); return; } reset(); if (ctx.onLeave) ctx.onLeave(); }
  return {
    enter, leave: () => { if (on) { reset(); if (ctx.onLeave) ctx.onLeave(); } }, active: () => on,
    /// tests: the run's numbers, and a few levers (skip time, pick a card, take damage)
    debug: () => (R ? { mode, t: R.t, hp: R.hp, lv: R.lv, xp: R.xp, kills: R.kills, bosses: R.bosses, mons: mons.length, alive: mons.filter((m) => m.st !== "die").length, gems: gems.length, w: { ...R.w }, p: { ...R.p }, boss: R.boss && R.boss.id, x: R.x, z: R.z } : { mode }),
    start: () => startRun(), skip: (s) => { if (!R) return; R.t += s; R.eliteT = 0; }, choose: (i) => choose(i), give: (k, id, n = 1) => { if (!R) return; for (let i = 0; i < n; i++) take({ k, id }); }, hurt: (n) => { if (R) { R.hurtT = 0; hurtHero(n); } }, xp: (n) => { if (R) gems.push({ x: R.x, z: R.z, v: n, t: 0, pull: true }); }, boss: (i) => { if (R) spawnBoss(i); }, killAll: () => { if (R) for (const m of mons) if (m.st !== "die") kill(m); }, mode: () => mode, cam: (k) => { camK = k; },
    line: (ids, st) => { if (!R) return; mons.length = 0; R.still = true; R.spawnT = 1e9; R.eliteT = 1e9; R.bossNext = 9; R.w = {}; ids.forEach((id, i) => { const m = spawn(id, (i - (ids.length - 1) / 2) * 2.2, -3); if (m) { m.face = 0; if (st) { m.st = st; m.at = 0; } } }); },
  };
}
