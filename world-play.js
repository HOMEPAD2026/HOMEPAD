// world-play.js — ARCIRCLE World (/play): an open little planet you walk as your own character. Every shop opens
// the real tool, Coin City is built from the real ArcPad coins, a rocket leaves the Launchpad when one launches, the
// Burn Furnace flares on a real $ARCIRCLE burn, the Exchange board shows the live price, the Quantum Lab shows the
// launches in superposition, and the sky follows Seoul's clock and the market's mood.
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
// Game World's first beta is for wallets holding at least 1,000,000 $ARCIRCLE (world-lock.js); the Platform World stays open.
if (!window.arcWorldLock || !window.arcWorldLock.ok()) {
  document.getElementById("wp-loading").hidden = true;
  if (window.arcWorldLock) await window.arcWorldLock.ask({ cancelHref: "/?skip" });
  else { location.replace("/?skip"); await new Promise(() => {}); }
  document.getElementById("wp-loading").hidden = false;
}
const VER = new URL(import.meta.url).search;
// the game's modules load side by side (one after another cost a round trip each on a phone)
const [K, IS, SHOP, STYLE, HELP, FIGHT, RPG, ZN, QST, SOC, ARCBOT, INBOX, RACE, WARD, DECOR, VFX, GEAR, LOOK, LIFE, WX, MUS, POST, ENV, PART, ICONS, L3D, AMB, HW, DIAG] = await Promise.all(["world-kit", "world-island", "world-shop", "world-style", "world-support", "world-combat", "world-rpg", "world-zones", "world-quests", "world-social", "world-arcbots", "world-inbox", "world-race", "world-wardrobe", "world-decor", "world-vfx", "world-gear3d", "world-look", "world-life", "world-weather", "world-music", "world-post", "world-env", "world-particles", "world-icons", "world-loading3d", "world-ambient", "world-halloween", "world-diag"].map((m) => import(m === "world-arcbots" ? "./world-arcbots.js" : `./${m}.js${VER}`))); // world-arcbots.js unversioned: world-kit.js imports it the same way, so it loads once
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
const loadbar = (k) => { const b = $("wp-loadbar"); if (b) b.style.width = Math.round(k * 100) + "%"; const n = $("wp-loadpct"); if (n) n.textContent = Math.round(k * 100) + "%";
  if (load3d) load3d.set(k); const sp = document.querySelector("#wp-loading > span"); if (sp) sp.textContent = k >= 1 ? T("Ready") : k >= 0.75 ? T("Calling in the scammers…") : k >= 0.35 ? T("Raising the town…") : T("Building the planet…"); };
const usd = (v) => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v).toLocaleString("en-US");

// ---------------- language: the site's dictionaries (i18n.js); templates are translated, then filled ----------------
const LANG = (() => { try { const l = (window.arcI18n && window.arcI18n.get()) || localStorage.getItem("arcircle.lang") || "en"; return l === "ko" || l === "zh" ? l : "en"; } catch { return "en"; } })();
if (LANG !== "en") for (let i = 0; i < 30 && !(window.__arcDict && window.__arcDict[LANG]); i++) await sleep(100);
const T = (s, v) => { let t = (LANG !== "en" && window.arcI18n && window.arcI18n.translate(s, LANG)) || s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
// single words stay out of the site-wide dictionary (they'd change other pages): a small map just for the game
const WORDS = {
  ko: { Music: "음악", Film: "필름", Vivid: "선명", Time: "시간", Now: "지금", Morning: "아침", Noon: "한낮", Dusk: "노을", Night: "밤", Vibration: "진동", Inbox: "알림함", Gifts: "선물", Guestbook: "방명록", Race: "레이스", Finish: "완주", Wardrobe: "옷장", Head: "머리", Face: "얼굴", Neck: "목", Back: "등", Aura: "오라", Lock: "잠금", Unlock: "잠금 해제", Locked: "잠김", power: "전투력", Equip: "장착", Minimap: "미니맵", Show: "표시", On: "켜짐", Reply: "답장", Medium: "중간", Ultra: "최고", "Frame rate": "프레임", Level: "레벨", Friend: "친구", Say: "말하기", GG: "GG", Companions: "동료", "Hi!": "안녕!", Filter: "필터", Sticker: "스티커", Pose: "포즈", None: "없음", Focus: "초점", Off: "끔", Soft: "약하게", Strong: "강하게", Warm: "따뜻하게", Cool: "시원하게", Noir: "흑백", Neon: "네온", Wave: "손 흔들기", Sit: "앉기", Point: "가리키기", Update: "업데이트", Title: "칭호", Hoverboard: "호버보드", Jump: "점프", Mirror: "대칭", Moving: "이동", Menus: "메뉴", Buttons: "버튼", Space: "스페이스", Click: "클릭", Drag: "드래그", Wheel: "휠", Tap: "탭", Move: "이동", Look: "시점", Wave: "인사", No: "아니요", Sit: "앉기", Point: "가리키기", Faint: "기절", Controls: "조작 방법", Shop: "상점", Fighting: "전투", Attack: "공격", Layout: "화면 배치", Compact: "PC형", Large: "크게", Skip: "건너뛰기", Quests: "퀘스트", Map: "지도", Menu: "메뉴", Settings: "설정", Graphics: "그래픽", Auto: "자동", High: "높음", Low: "낮음", Language: "언어", Account: "계정", Sound: "사운드", Today: "오늘", Badges: "배지", Name: "이름", "Level up": "레벨 업", online: "접속 중", Player: "플레이어", visited: "방문함", yours: "내 코인", ready: "준비됨", bought: "매수", sold: "매도",
    move: "이동", jump: "점프", run: "달리기", enter: "입장", board: "보드", emote: "감정표현", photo: "사진", map: "지도", help: "도움말", "drag to look": "드래그로 둘러보기" },
  zh: { Music: "音乐", Film: "胶片", Vivid: "鲜艳", Time: "时间", Now: "现在", Morning: "清晨", Noon: "正午", Dusk: "黄昏", Night: "夜晚", Vibration: "振动", Inbox: "收件箱", Gifts: "礼物", Guestbook: "留言簿", Race: "竞速", Finish: "完成", Wardrobe: "衣橱", Head: "头部", Face: "面部", Neck: "颈部", Back: "背部", Aura: "光环", Lock: "锁定", Unlock: "解锁", Locked: "已锁定", power: "战力", Equip: "装备", Minimap: "小地图", Show: "显示", On: "开", Reply: "回复", Medium: "中", Ultra: "极致", "Frame rate": "帧率", Level: "等级", Friend: "好友", Say: "说话", GG: "GG", Companions: "伙伴", "Hi!": "你好！", Filter: "滤镜", Sticker: "贴纸", Pose: "姿势", None: "无", Focus: "焦点", Off: "关", Soft: "柔和", Strong: "强烈", Warm: "暖色", Cool: "冷色", Noir: "黑白", Neon: "霓虹", Wave: "挥手", Sit: "坐下", Point: "指向", Update: "更新", Title: "称号", Hoverboard: "滑板", Jump: "跳跃", Mirror: "镜像", Moving: "移动", Menus: "菜单", Buttons: "按钮", Space: "空格", Click: "点击", Drag: "拖动", Wheel: "滚轮", Tap: "点按", Move: "移动", Look: "视角", Wave: "挥手", No: "不", Sit: "坐下", Point: "指向", Faint: "晕倒", Controls: "操作说明", Shop: "商店", Fighting: "战斗", Attack: "攻击", Layout: "界面布局", Compact: "电脑版", Large: "大字", Skip: "跳过", Quests: "任务", Map: "地图", Menu: "菜单", Settings: "设置", Graphics: "画质", Auto: "自动", High: "高", Low: "低", Language: "语言", Account: "账户", Sound: "声音", Today: "今日", Badges: "徽章", Name: "名字", "Level up": "升级", online: "在线", Player: "玩家", visited: "已访问", yours: "我的币", ready: "就绪", bought: "买入", sold: "卖出",
    move: "移动", jump: "跳跃", run: "奔跑", enter: "进入", board: "滑板", emote: "表情", photo: "拍照", map: "地图", help: "帮助", "drag to look": "拖动查看" },
};
const W = (w) => (WORDS[LANG] && WORDS[LANG][w]) || w;
// for the newer modules: a single word from WORDS, anything longer from the site dictionary
const TW = (s, v) => (WORDS[LANG] && WORDS[LANG][s] != null ? WORDS[LANG][s] : T(s, v));
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
const S = (() => { const d = { quality: "auto", sound: true, sens: 1 }; try { return { ...d, ...JSON.parse(localStorage.getItem(SETS) || "{}") }; } catch { return d; } })();
let cloudT = 0;
// the save goes to this browser at most every 1.5 s (a whole save on every knock-out and pickup was a hitch), and
// right away when the page is hidden or closed
let lsT = 0;
const writeLocal = () => { clearTimeout(lsT); lsT = 0; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private window */ } };
const save = () => { if (!lsT) lsT = setTimeout(writeLocal, 1500); clearTimeout(cloudT); cloudT = setTimeout(cloudSave, 6000); };
addEventListener("pagehide", () => { if (lsT) writeLocal(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && lsT) writeLocal(); });
const saveSet = () => { try { localStorage.setItem(SETS, JSON.stringify(S)); } catch { /* private window */ } };
// the level from XP on a rising curve (world-rpg-data.js); a save from the old 100-a-level curve is converted once,
// keeping its level
if (P.xpv !== RPG.XP_VERSION) { P.xp = RPG.xpFromOld(P.xp); P.xpv = RPG.XP_VERSION; try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ } }
let lvMemo = [-1, 1];
const level = () => { if (lvMemo[0] !== P.xp) lvMemo = [P.xp, RPG.levelOfXp(P.xp)]; return lvMemo[1]; };
let xpHeld = false; // window.arcWorld.holdXp(true): screenshots and tests keep the level where it is
function gain(n, why) {
  if (xpHeld) return;
  const before = level(); P.xp += n; save(); paintHud();
  toast(T("+{n} XP · {why}", { n, why }));
  if (level() > before) { Snd.level(); burst(0x39ff88); levelUp(level(), before); } else Snd.pick();
  badges();
}
// a Rare or better find turns over like a card at the top of the screen: the back first, then the piece and its name
function lootCard(it) {
  if (!rpg) return; const R = RPG.RARITY[it.r] || RPG.RARITY[0];
  document.querySelectorAll(".wp-loot").forEach((e) => e.remove());
  const el = document.createElement("div"); el.className = "wp-loot r" + it.r; el.style.setProperty("--rc", R.color); el.setAttribute("role", "status");
  el.innerHTML = `<div class="wp-loot-in"><div class="wp-loot-back"></div><div class="wp-loot-face">${rpg.thumb ? rpg.thumb(it) : ""}<b>${esc(rpg.itemName(it))}</b><small>${esc(T(R.name))}</small></div></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("on"));
  setTimeout(() => el.classList.add("out"), 2600); setTimeout(() => el.remove(), 3200);
}
let toastT = 0;
function toast(msg) { const t = $("wp-toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }

// ---------------- accounts, saving, who's online (api/_world.mjs) ----------------
const AC = window.arcConnect, CFG = (typeof CONFIG !== "undefined" ? CONFIG : window.CONFIG) || {}; // config-arc.js declares CONFIG with const: a global, but not a window property
const addr = () => (AC && AC.address && AC.address()) || "";
const vid = (() => { try { let v = localStorage.getItem(VID); if (!/^[a-z0-9]{20}$/.test(v || "")) { v = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); localStorage.setItem(VID, v); } return v; } catch { return "guest0000000000000000"; } })();
const sess = () => { try { const s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch { return null; } };
const loginMessage = (wallet, issued) => `ARCIRCLE World — sign in\n\nWallet: ${lc(wallet)}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;
const post = (body) => fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }));
const PROGRESS = ["xp", "xpv", "visited", "beaten", "cards", "quests", "badges", "char", "name", "daily", "rpg", "outfit"];
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
  try { if (localStorage.getItem(LOGGED) === s.issued) return; } catch { return; }
  const r = await post({ action: "world-login", ...s }).catch(() => null);
  if (!r || !r.ok) return;
  try { localStorage.setItem(LOGGED, s.issued); } catch { /* private */ }
  loggedIn(r, true);
}
function loggedIn(r, quiet) {
  const sv = r.j.save;
  if (sv && sv.xpv !== RPG.XP_VERSION) { sv.xp = RPG.xpFromOld(sv.xp); sv.xpv = RPG.XP_VERSION; } // a save from the old level curve
  if (sv && (sv.xp || 0) > P.xp) { PROGRESS.forEach((k) => { if (sv[k] != null && sv[k] !== "") P[k] = sv[k]; }); try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ } toast(T("Welcome back, {name}. Your progress is loaded.", { name: P.name || "" })); }
  else { if (!quiet || r.j.firstTime) toast(r.j.firstTime ? T("Signed in. Welcome to ARCIRCLE World!") : T("Signed in.")); cloudSave(); }
  arclShop.refresh().then(() => { arclShop.flushQueue(); arclChecks(); setTimeout(() => arclShop.maybeDaily(), 1500); });
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
  try { const r = await post({ action: "world-save", ...s, data }); if (r.status === 400 && /expired/.test(r.j.error || "")) { try { localStorage.setItem(SESS, JSON.stringify({ ...s, issued: new Date(0).toISOString() })); } catch { /* private */ } paintAcct(); }
    else if (r.status === 429) retry = 9000; else if (!r.ok && r.status >= 500 && r.status !== 503) retry = Math.min(120e3, 10e3 * 2 ** saveFails); else if (r.ok) { saveFails = 0; paintSaveNote(); } }
  catch { retry = Math.min(120e3, 10e3 * 2 ** saveFails); }
  if (retry) { saveFails++; paintSaveNote(); clearTimeout(saveRetryT); saveRetryT = setTimeout(cloudSave, retry); }
}
let stats = null, visitSent = false;
async function ping() {
  if (document.hidden) return;
  let g; try { if (mode === "hub" && !introOn) { const v = here(new THREE.Vector3()); g = { x: Math.round(v.x * 10) / 10, z: Math.round(v.z * 10) / 10, c: P.char || "bot", lv: level() }; if (combat) { const vt = combat.vitals(), zz = combat.zone(); g.h = Math.max(0, Math.min(100, Math.round((100 * vt.hp) / (vt.max || 1)))); if (zz) g.zn = zz.id; } if (said && !said.sent && Date.now() - said.at < 60e3) { g.s = said.s; said.sent = true; } if (P.pal) g.p = P.pal; } } catch { /* not ready yet */ }
  // signed in and not hidden (Settings): the sign-in goes along, so others see your name and level over your figure
  const se = g && S.showName !== false ? sess() : null;
  try { const r = await post({ action: "world-ping", id: vid, visit: !visitSent, ...(g ? { g } : {}), ...(se ? { s: se } : {}) }); if (r.ok) { visitSent = true; stats = r.j; paintOnline(); } } catch { /* offline */ }
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

// ---------------- sound: small synthesized effects (WebAudio), started by the first touch or key ----------------
const Snd = (() => {
  let ctx = null, out = null;
  function init() {
    if (ctx || !S.sound) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    out = ctx.createGain(); out.gain.value = 0.42; out.connect(ctx.destination);
    const amb = ctx.createGain(); amb.gain.value = 0.035; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; amb.connect(lp); lp.connect(out);
    [110, 164.8, 220.4].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = i * 4; o.connect(amb); o.start(); });
  }
  function tone(f, dur, { type = "sine", v = 0.18, to = 0, at = 0 } = {}) {
    if (!ctx || !S.sound) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, v = 0.12, f = 900) {
    if (!ctx || !S.sound) return;
    const n = ctx.createBufferSource(), b = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const fl = ctx.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = f; const g = ctx.createGain(); g.gain.value = v;
    n.buffer = b; n.connect(fl); fl.connect(g); g.connect(out); n.start();
  }
  // a scene: the raid's beat, or a hunting ground's ambience, quietly under everything else
  let sceneK = "", sceneIv = 0, beat = 0;
  const RAID_SEQ = [110, 0, 131, 0, 147, 0, 131, 0, 98, 0, 117, 0, 131, 0, 117, 0];
  function scene(k) {
    if (k === sceneK) return; sceneK = k; clearInterval(sceneIv); sceneIv = 0; beat = 0;
    if (!k) return;
    sceneIv = setInterval(() => {
      if (!ctx || !S.sound || document.hidden) return; const b = beat++;
      if (k === "raid") { const s = b % 16; if (s % 4 === 0) { tone(58, 0.24, { to: 40, v: 0.13 }); noise(0.04, 0.05, 140); } if (s % 8 === 4) noise(0.11, 0.06, 1900); if (RAID_SEQ[s]) tone(RAID_SEQ[s], 0.2, { type: "sawtooth", v: 0.022 }); }
      else if (k === "spam") { if (Math.random() < 0.2) tone(1100 + Math.random() * 1300, 0.05, { type: "square", v: 0.012 }); }
      else if (k === "fields") { if (b % 12 === 0) noise(2.6, 0.018, 420); if (Math.random() < 0.06) tone(1900 + Math.random() * 600, 0.12, { v: 0.012, to: 2500 }); }
      else if (k === "swamp") { if (Math.random() < 0.18) tone(170 + Math.random() * 120, 0.14, { to: 430, v: 0.025 }); }
      else if (k === "canyon") { if (b % 10 === 0) noise(2.4, 0.026, 230); }
      else if (k === "depths") { if (b % 8 === 0) tone(46, 1.9, { v: 0.045 }); if (Math.random() < 0.08) tone(660, 0.6, { type: "triangle", v: 0.01, to: 330 }); }
      // the far ring: wind on the peaks, a sand gust, the reef's bubbles, the farm's hum and clicks, a hollow echo in
      // the ruins, the abyss's rumble and crackle, a shimmer in the void
      else if (k === "peaks") { if (b % 6 === 0) noise(3.2, 0.03, 700 + Math.random() * 500); if (Math.random() < 0.05) tone(2400 + Math.random() * 800, 0.3, { v: 0.008, to: 3000 }); }
      else if (k === "dunes") { if (b % 7 === 0) noise(2.8, 0.035, 1500 + Math.random() * 900); }
      else if (k === "reef") { if (Math.random() < 0.3) tone(300 + Math.random() * 500, 0.09, { to: 700 + Math.random() * 600, v: 0.02 }); if (b % 9 === 0) noise(3, 0.02, 260); }
      else if (k === "wastes") { if (b % 2 === 0) tone(60, 0.5, { type: "sawtooth", v: 0.012 }); if (Math.random() < 0.25) tone(1800 + Math.random() * 1600, 0.03, { type: "square", v: 0.01 }); }
      else if (k === "ruins") { if (b % 10 === 0) { tone(196, 1.6, { type: "triangle", v: 0.014, to: 185 }); tone(233, 1.6, { type: "triangle", v: 0.01, to: 220, at: 0.4 }); } }
      else if (k === "abyss") { if (b % 4 === 0) tone(38, 1.6, { v: 0.05, to: 32 }); if (Math.random() < 0.35) noise(0.05, 0.03, 2600 + Math.random() * 2000); }
      else if (k === "void") { if (b % 6 === 0) [523, 784, 1175].forEach((f, i) => tone(f * (Math.random() < 0.5 ? 1 : 1.5), 1.2, { v: 0.008, at: i * 0.3 })); if (b % 12 === 0) tone(55, 3, { v: 0.03 }); }
    }, k === "raid" ? 250 : 500);
  }
  return {
    init, unlock: () => { init(); if (ctx && ctx.state !== "running") ctx.resume().catch(() => {}); }, ready: () => !S.sound || (!!ctx && ctx.state === "running"),
    scene, set(on) { S.sound = on; saveSet(); if (on) init(); if (out) out.gain.value = on ? 0.42 : 0; try { music.refresh(); } catch { /* not set up yet */ } },
    step: () => noise(0.05, 0.05, 1400), jump: () => tone(300, 0.22, { type: "triangle", to: 620, v: 0.12 }), land: () => noise(0.09, 0.09, 500),
    pick: () => { tone(880, 0.12, { v: 0.12 }); tone(1320, 0.18, { v: 0.1, at: 0.08 }); },
    enter: () => { tone(520, 0.1, { type: "triangle", v: 0.12 }); tone(780, 0.14, { type: "triangle", v: 0.1, at: 0.07 }); },
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: "triangle", v: 0.12, at: i * 0.09 })),
    rocket: () => { noise(1.6, 0.16, 180); tone(90, 1.4, { type: "sawtooth", to: 40, v: 0.05 }); },
    fire: () => noise(1.2, 0.14, 300), whale: () => tone(140, 2.2, { type: "sine", to: 90, v: 0.08 }), shutter: () => noise(0.06, 0.2, 2500),
    bad: () => tone(220, 0.3, { type: "square", to: 140, v: 0.06 }), win: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.2, { v: 0.12, at: i * 0.1 })),
    board: () => tone(200, 0.3, { type: "sawtooth", to: 420, v: 0.05 }),
    place: () => { tone(540 + Math.random() * 180, 0.07, { type: "triangle", v: 0.12 }); noise(0.04, 0.1, 2400); },
    pop: () => { tone(420, 0.1, { to: 190, v: 0.1 }); noise(0.08, 0.12, 1200); },
    paint: () => tone(900, 0.09, { to: 1300, v: 0.07 }),
    coin: () => [1046, 1318, 1568].forEach((f, i) => tone(f, 0.12, { type: "triangle", v: 0.09, at: i * 0.06 })),
    chest: () => { noise(0.25, 0.1, 700); [523, 784, 1046].forEach((f, i) => tone(f, 0.2, { v: 0.1, at: 0.2 + i * 0.08 })); },
    siren: () => [0, 0.32, 0.64].forEach((at) => tone(660, 0.28, { type: "sawtooth", to: 440, v: 0.05, at })),
    swing: (heavy) => { noise(heavy ? 0.14 : 0.09, heavy ? 0.14 : 0.1, heavy ? 1800 : 2600); tone(heavy ? 180 : 260, heavy ? 0.14 : 0.08, { type: "triangle", to: heavy ? 70 : 120, v: 0.07 }); },
    dash: () => noise(0.16, 0.08, 3200),
    heart: () => { tone(70, 0.09, { v: 0.12 }); tone(62, 0.09, { v: 0.1, at: 0.16 }); },
    cast: (k) => k === "ice" ? (tone(1400, 0.18, { to: 700, v: 0.07 }), noise(0.12, 0.06, 5000)) : k === "fire" ? (noise(0.3, 0.14, 500), tone(180, 0.25, { type: "sawtooth", to: 90, v: 0.05 })) : (noise(0.18, 0.12, 3500), tone(90, 0.2, { type: "square", to: 60, v: 0.05 })),
    hurt: () => { tone(200, 0.16, { type: "square", to: 110, v: 0.07 }); noise(0.1, 0.1, 900); },
    // a hit lands, the weapon's own way: blades ring, the hammer thuds, the blaster zaps, an arrow thunks, the staff chimes
    impact: (kind) => kind === 1 ? (tone(90, 0.16, { to: 45, v: 0.13 }), noise(0.12, 0.12, 300)) : kind === 2 ? tone(1700, 0.08, { type: "square", to: 500, v: 0.04 }) : kind === 3 ? (noise(0.05, 0.1, 1100), tone(220, 0.06, { type: "triangle", to: 140, v: 0.05 })) : kind === 4 ? [1320, 1760].forEach((f, i) => tone(f, 0.14, { type: "triangle", v: 0.035, at: i * 0.04 })) : (tone(2100 + Math.random() * 400, 0.09, { type: "triangle", v: 0.04, to: 1600 }), noise(0.04, 0.08, 3800)),
    charge: (k) => tone(260 + k * 520, 0.08, { type: "triangle", v: 0.03 + k * 0.03 }),
    charged: () => { noise(0.35, 0.16, 900); tone(140, 0.4, { type: "sawtooth", to: 50, v: 0.07 }); tone(880, 0.25, { type: "triangle", to: 1320, v: 0.05 }); },
    roar: () => { tone(110, 0.9, { type: "sawtooth", to: 55, v: 0.08 }); noise(0.7, 0.12, 400); },
    warn: () => tone(520, 0.16, { type: "square", v: 0.03, to: 480 }),
  };
})();
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
const st = K.makeStage(cv, { fog: 0.0058, bloom: 0.28, bloomRadius: 0.25, bloomThreshold: 1.15, fov: 55, shadows: true, quality: S.quality, groundY: 0 });
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
// the world: everything on the ground lives in this group, which slides under the player
const planet = new THREE.Group(); planet.name = "world"; st.scene.add(planet);
// where you stand on the plaza: in front of the fountain, facing it (the world slides, so this is its offset)
const HOME = new THREE.Vector3(-1.2, 0, -7.6); planet.position.copy(HOME); // a little off centre, so walking straight on slides past the fountain
// the finishing look (world-look.js): a colour grade per time of day, varied grass, contact shadows under the halls
let grade = LOOK.addGrade(st); st.on((dt) => { LOOK.time.value += dt; });
// the picture after the scene (world-post.js): real antialiasing with bloom, ink edges, AO on Ultra, low fog and sun
// shafts, a 3D colour grade per time of day and ground
const postLevel = S.quality === "ultra" || S.quality === "high" ? "ultra" : S.quality === "low" || S.quality === "saver" ? "low" : S.quality === "medium" ? "medium" : st.quality.low ? "low" : st.quality.coarse ? "medium" : "ultra";
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
const groundG = K.makeGround(); planet.add(groundG);
{ const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map); if (gm) LOOK.groundLook(gm.material, { low: S.quality === "low" || S.quality === "saver", paths: WORN_PATHS }); }
// far shadows (world-look.js): halls, trees and the grounds' props shade the ground past the real shadow's reach
// far culling: whole groups (a hall, a hunting ground's props, a decor cell) more than ~150 m away (110 m on a phone)
// are skipped — the fog has them mostly hidden anyway, and they were hundreds of draw calls. Anything that needs the
// whole world (the far-shadow bake, the grass mask, the minimap picture) runs inside farCull.all().
const farCull = (() => {
  const SKIP = new Set(["grass", "ambient", "particles", "smoke", "combat", "ghosts", "island", "decor", "life", "zones", "ground", "puddles"]);
  const CONT = ["decor", "life", "zones"], R = st.quality.coarse ? 110 : 150, box = new THREE.Box3(), sph = new THREE.Sphere();
  let list = [], at = 0, scanAt = -1e9, hidden = new Set();
  function scan() {
    list = []; planet.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(planet.matrixWorld).invert();
    const add = (o) => { if (!o.visible && !hidden.has(o)) return; box.setFromObject(o); if (box.isEmpty()) return; box.applyMatrix4(inv); box.getBoundingSphere(sph); if (sph.radius > 60) return; list.push({ o, c: sph.center.clone(), r: sph.radius }); };
    for (const c of planet.children) { if (SKIP.has(c.name)) { if (CONT.includes(c.name)) c.children.forEach(add); continue; } add(c); }
  }
  function tick() {
    const now = performance.now(); if (now - at < 400) return; at = now;
    if (now - scanAt > 15000) { const was = [...hidden]; was.forEach((o) => { o.visible = true; }); hidden.clear(); scan(); scanAt = now; }
    const px = -planet.position.x, pz = -planet.position.z, on = mode === "hub";
    for (const it of list) { const far = on && Math.hypot(it.c.x - px, it.c.z - pz) - it.r > R;
      if (far && it.o.visible) { it.o.visible = false; hidden.add(it.o); } else if (!far && hidden.has(it.o)) { it.o.visible = true; hidden.delete(it.o); } }
  }
  function all(fn) { const was = [...hidden]; was.forEach((o) => { o.visible = true; }); try { return fn(); } finally { was.forEach((o) => { if (hidden.has(o)) o.visible = false; }); } }
  return { tick, all, rescan: () => { scanAt = -1e9; } };
})();
st.on(() => { try { farCull.tick(); } catch { /* still loading */ } });
// the frame count, and the sun's shadow map redrawn every other frame below Ultra (the sun stands still; only the
// things that move need it, and they barely move in a 30th of a second)
let frameNo = 0; const shadowEvery = postLevel === "ultra" && !st.quality.coarse ? 1 : 2;
if (st.renderer.shadowMap.enabled && shadowEvery > 1) st.renderer.shadowMap.autoUpdate = false;
st.on(() => { frameNo++; if (shadowEvery > 1 && st.renderer.shadowMap.enabled) st.renderer.shadowMap.needsUpdate = frameNo % shadowEvery === 0; });
const gshadow = st.renderer.shadowMap.enabled ? LOOK.groundShadow({ renderer: st.renderer, planet, sunDir, around: (f) => farCull.all(f) }) : null;
if (gshadow) { const gm = groundG.children.find((m) => m.isMesh && m.material && m.material.map); if (gm) gshadow.receive(gm.material); st.on(() => gshadow.tick()); [3000, 20000].forEach((ms) => setTimeout(() => gshadow.bake(), ms)); }
// the sky (world-env.js): the gradient dome with two layers of drifting cloud and the sun's glow (the plain dome on Low)
const lowGfx = S.quality === "low" || S.quality === "saver" || (S.quality === "auto" && st.quality.low);
// every character made from here on: the asset packs' palette (not the ARC Bots, drawn in it already) and a dark rim
if (!lowGfx && K.setCharHook) K.setCharHook((obj, arc) => { if (!arc) ENV.unifyPalette(obj); if (!st.quality.coarse) K.outlineAll(obj, { t: arc ? 0.02 : 0.016 }); });
const sky = lowGfx ? K.makeSky() : ENV.makeSkyDome({ lite: st.quality.coarse }); st.scene.add(sky);
if (sky.material.uniforms.uTime) { sky.material.uniforms.uSun.value.copy(sunDir); st.on((dt) => { sky.material.uniforms.uTime.value += dt; }); }
// rolling hills round the edge of the world (world-env.js) in place of the old round blobs
st.on((dt, t) => { if (K.arcTick) K.arcTick(dt, planet.position); LOOK.lookOrigin.value.copy(planet.position); ENV.CLOUD.t.value = t; });
// the town's lights pulse with the music's beat (the light lines, the plaza rings); stronger on a concert night
st.on(() => { try { if (mode !== "hub" || reduce) return; const b = music.level ? music.level() : 0, k = b * (concertOn() ? 0.9 : 0.4); if (K.arcPulse) K.arcPulse(k * 0.6); if (fountain.userData.pulse) fountain.userData.pulse(k); } catch { /* still loading */ } });
// concert night: Saturdays 20:00–23:00 Seoul time (?concert=1 to try it): the stage lights up and the town pulses harder
function concertOn() { try { const q = new URLSearchParams(location.search).get("concert"); if (q) return q === "1"; } catch { /* fine */ } const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCDay() === 6 && d.getUTCHours() >= 20 && d.getUTCHours() < 23; }
{ const blobs = groundG.getObjectByName("blobs"); if (blobs) groundG.remove(blobs); groundG.add(ENV.makeHills()); }
const skyPlanets = K.makeSkyPlanets(VER); st.scene.add(skyPlanets);
const stars = K.makeStars(); st.scene.add(stars);
const halo = K.makeHalo(0.5); halo.position.set(0, 135, -360); halo.rotation.set(0.32, 0.2, 0); halo.traverse((o) => { if (o.material) o.material.fog = false; }); st.scene.add(halo);
const clouds = K.makeClouds(); planet.add(clouds);
// mountains on the horizon, birds, butterflies and fish (world-ambient.js; nothing but the mountains on Low)
const amb = AMB.createAmbient({ THREE, planet, low: lowGfx, bats: HW.halloweenOn() }); let ambNight = 0; // ambNight: set by dayNight
// anonymous health counters (world-diag.js): script errors, the frame rate band, a GPU memory climb
const diag = DIAG.createDiag({ post, renderer: st.renderer, quality: S.quality || "auto", coarse: !!st.quality.coarse, active: () => { try { return mode === "hub" && !frozen && !photo; } catch { return false; } } });
st.on((dt) => diag.tick(dt));
st.on((dt, t) => { let hub = true; try { hub = mode === "hub"; } catch { /* still loading */ } amb.root.visible = hub; if (hub) amb.tick(dt, t, -planet.position.x, -planet.position.z, ambNight, st.scene.fog && st.scene.fog.color, !!ZN.zoneAt(-planet.position.x, -planet.position.z)); });
planet.add(K.makePaths()); planet.add(K.makeDistrictSigns()); planet.add(K.makeDistrictTints());
const lamps = K.makeLamps(); planet.add(lamps);
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
const shops = K.SHOPS.map((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); planet.add(g); K.shadowy(g); spins.push(...g.userData.spin); return g; });
shops.forEach((g) => { const cs = LOOK.contactShadow((g.userData.radius || 3) + 2.2, 0.38); cs.position.x = g.position.x; cs.position.z = g.position.z; planet.add(cs); });
const shopG = (id) => shops.find((g) => g.userData.spec.id === id);
const portal = K.makePortal(T("Platform World")); K.placeOn(portal, K.dirOf(K.PORTAL.theta, K.PORTAL.phi)); planet.add(portal); spins.push(...portal.userData.spin);
// the way to the islands
const isleGate = K.makePortal(T("My Island")); K.placeOn(isleGate, K.dirOf(14, 140)); planet.add(isleGate); spins.push(...isleGate.userData.spin);
isleGate.traverse((o) => { if (o.isMesh && o.material && o.material.emissive && !o.material.transparent) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(0x7ee0a0), 0.5); o.material.emissive.lerp(new THREE.Color(0x7ee0a0), 0.5); } });
// the plaza: the ARCIRCLE rings fountain in the middle, an arch over each district's way out, the plaza screen
const fountain = K.makeFountain(); planet.add(fountain); spins.push(...fountain.userData.spin);
// the fountain's middle tier is solid; its pool you can still wade through
const fountainCore = new THREE.Group(); fountainCore.userData.radius = 2.1; planet.add(fountainCore);
const arches = [[0, 0x39ff88], [78, 0xffc861], [212, 0x35d8d0], [296, 0xff7ad9]].map(([ph, c]) => { const a = K.makeArch(c); K.placeOn(a, K.dirOf(13.2, ph)); planet.add(a); return a; });
const screen = K.makeScreen(); K.placeOn(screen, K.dirOf(9.5, 48)); planet.add(screen);
// the fast-travel pad at the edge of the plaza
const pad = new THREE.Group(); { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffc861, emissive: 0xffc861, emissiveIntensity: 2 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.18, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07; const tag = K.label(T("Fast travel"), { accent: "#ffc861", size: 0.55 }); tag.position.y = 2.2; pad.add(ring, disc, tag); pad.userData = { radius: 1.2, spin: [(dt, t) => { ring.rotation.z = t; disc.material.opacity = 0.14 + Math.sin(t * 3) * 0.06; }] }; spins.push(...pad.userData.spin); }
K.placeOn(pad, K.dirOf(7, 90)); planet.add(pad);
planet.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
const glowLight = new THREE.PointLight(0x35d8d0, 5, 7, 2); glowLight.position.set(0, 0.5, 0); st.scene.add(glowLight);
const aurora = K.makeAurora(); aurora.visible = false; st.scene.add(aurora);
const rain = K.makeRain(); rain.visible = false; st.scene.add(rain);
loadbar(0.35);

// the player: a group at the origin; the character inside it turns to face where it walks
const player = new THREE.Group(); st.scene.add(player);
// light effects (world-vfx.js): portals, teleports, level ups, impacts, the shield
const vfx = VFX.createVfx({ THREE, st, planet, player, low: S.quality === "low" || S.quality === "saver", reduce });
// each hunting ground's air: snow, sand, bubbles, spores, dust, embers, stars (world-weather.js)
const air = WX.createWeather({ THREE, planet, zones: RPG.ZONES, low: S.quality === "low" || S.quality === "saver", reduce });
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
// the portrait in the HP card (ART-SPEC interface: the main HUD shows your character's face)
function paintFace() { const img = $("wc-face-img"), id = P.char || "arc-arc"; if (!img) return; if (thumbCache[id]) { img.src = thumbCache[id]; return; } renderThumbsFor([id]).then(() => { if (thumbCache[id]) img.src = thumbCache[id]; }); }
async function setAvatar(id) {
  const a = await K.makeCharacter(id, VER, P.outfit || null).catch(() => K.makeCharacter("bot"));
  setTimeout(paintFace, 300);
  if (avatar) player.remove(avatar.obj);
  avatar = a; player.add(a.obj); a.obj.rotation.y = facing; a.obj.position.y = !boarding || ride === "jet" ? 0 : ride === "rover" ? 0.84 : 0.45;
  if (rpg) rpg.dress();
  setNameTag(); paintCrown();
}
const PLATES = { "plate-gold": ["#ffc861", "#ffe7a8"], "plate-pink": ["#ff7ad9", "#ffd1f1"], "plate-green": ["#39ff88", "#c9ffe0"], "plate-purple": ["#b48cff", "#e6d9ff"], "plate-flame": ["#ff7a2a", "#ffe0b8"] };
function setNameTag() {
  if (nameTag) { player.remove(nameTag); nameTag.material.map.dispose(); }
  const title = BADGES.find((b) => b.id === P.badges[P.badges.length - 1]);
  const pl = PLATES[(P.style || {}).plate] || ["#35d8d0", "#eef3f7"];
  nameTag = K.label(P.name || W("Player"), { accent: pl[0], color: pl[1], size: 0.42, sub: (quests && quests.title()) || (title ? T(title.title) : "") }); nameTag.position.y = 3.15; player.add(nameTag);
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
loadbar(0.75);
async function dressWorld(kit) {
  if (!kit) return;
  if (!lowGfx) ENV.unifyPalette(kit.props); // one palette across the asset packs (world-env.js)
  shops.forEach((g) => K.decorate(g, kit));
  shops.forEach(boxOf);
  K.makeTown(kit).forEach((g) => { planet.add(g); town.push(g); spins.push(...g.userData.spin); });
  // the hunting grounds (world-zones.js)
  const zs = (zoneRoot = null, ZN.makeZones({ THREE, K, planet, kit, T, low: S.quality === "low" || S.quality === "saver", onBuilt: () => { if (gshadow) gshadow.rebakeSoon(); farCull.rescan(); } }));
  zoneRoot = zs.root;
  // each ground's own floor (world-env.js): cracked rock, ripples, moss, paving, ice, glowing seams
  if (!lowGfx) zs.root.children.forEach((g) => { const zn = g.userData && g.userData.zone, gm = g.children.find((c) => c.name === "zone-ground"); if (zn && gm) floorU.push(ENV.zoneFloor(gm.material, zn, { lite: st.quality.coarse })); });
  if (gshadow) zs.root.traverse((o) => { if (o.name === "zone-ground") gshadow.receive(o.material); }); spins.push((dt, t) => zs.update(dt, t)); arches.push(...(zs.gates || []));
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
    K.placeOn(g, K.dirOf(16, 296)); planet.add(g); g.userData = { radius: 0.9, ac, bub, line: 0 }; npc = g; mixers.push(ac.mixer);
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
let joy = null, look = null, camYaw = 0, camPitch = 0.05, frozen = false, flying = null, lastLook = 0, runToggle = false, photo = false;
let camDist = coarse ? 1.12 : 1, camZoom = 1, shakeT = 0, lastSpeed = 0, lookInit = false; const camLookS = new THREE.Vector3(); // the camera's smoothed aim, its rattle clock
const typing = (e) => /input|textarea|select/i.test(e.target.tagName);
/* a window is on screen (the Forge, the wardrobe, a shop…): Esc closes it rather than swapping it for the menu */
const dialogUp = () => [...document.querySelectorAll('[role="dialog"]')].some((d) => d !== hubEl && !d.hidden && d.getClientRects().length > 0 && getComputedStyle(d).visibility !== "hidden");
const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"];
addEventListener("keydown", (e) => {
  if (typing(e)) return;
  if (mode === "island" && !photo && island.keyDown(e)) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { if (photo) setPhoto(false); else if (hubEl && !hubEl.hidden) closeHub(); else if (hubEl && !frozen && worldReady && !dialogUp()) openHub(); else closeAll(); return; }
  if (k === "p" && (!frozen || photo)) { setPhoto(!photo); return; }
  if (frozen) return;
  if (k === "e" || k === "enter") { if (near) { e.preventDefault(); enter(near); } return; }
  if (k === "m") { openMap(); return; }
  if (k === "i" && rpg) { closeAll(); rpg.show("inv"); return; }
  if (k === "l" && rpg && quests) { closeAll(); rpg.show("log"); return; }
  if (k === "h") { openHelp(); return; }
  if (combat && mode === "hub" && combat.keyDown(k, e.repeat)) { e.preventDefault(); return; }
  if (k === "f") { setBoard(!boarding); return; }
  if (k === "1") { emote("emote-yes"); return; }
  if (k === "2") { emote("emote-no"); return; }
  if (k === "t") { openWheel(); return; }
  if (k === " ") { e.preventDefault(); jump(); return; }
  if (MOVE_KEYS.includes(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => { keys.delete(e.key.toLowerCase()); if (combat) combat.keyUp(e.key.toLowerCase()); });
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
  gpad.x = frozen ? 0 : dz(gp.axes[0]); gpad.y = frozen ? 0 : -dz(gp.axes[1]); if (gpad.x || gpad.y || gp.buttons.some((b) => b && b.pressed)) lastInput = performance.now(); gpad.run = Math.hypot(gpad.x, gpad.y) > 0.92 || btn(10);
  const rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
  if (!frozen && (rx || ry)) { camYaw -= rx * dt * 2.6 * S.sens; camPitch = THREE.MathUtils.clamp(camPitch + ry * dt * 1.4 * S.sens, -0.3, 0.75); lastLook = performance.now(); }
  if (edge(9)) { if (!mapEl.hidden) closeMap(); else if (!frozen) openMap(); }
  if (edge(1) && frozen) closeAll();
  if (!frozen) {
    if (edge(0)) jump();
    if (combat && mode === "hub") { if (edge(2)) combat.keyDown("j"); if (!btn(2) && gpad.prev[2]) combat.keyUp("j"); if (edge(1)) combat.keyDown("k"); if (edge(3)) combat.keyDown("z"); if (edge(4) || edge(5)) combat.keyDown("q"); if (edge(6)) combat.keyDown("4"); if (edge(7)) combat.keyDown("5"); }
    if (edge(8) && rpg && quests) { closeAll(); rpg.show("log"); }
    if (edge(12)) openWheel();
    if (edge(13) && near) enter(near);
  }
  gpad.prev = gp.buttons.map((b) => b.pressed);
}
addEventListener("blur", () => keys.clear());
const joyEl = $("wp-joy"), knob = joyEl.querySelector("i");
let downAt = null, hoverXY = null, pinch = null;
const JOYMAX = document.documentElement.classList.contains("wp-pcphone") ? 118 : 56;
const touches = new Map(); // non-stick touches: two of them pinch to zoom
cv.addEventListener("contextmenu", (e) => { if (mode === "island") e.preventDefault(); });
cv.addEventListener("pointerdown", (e) => {
  if (frozen && !photo) return;
  downAt = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }; // event time: a slow frame in between does not turn a tap into a hold
  cv.setPointerCapture(e.pointerId);
  // a second finger close to a stick that hasn't moved yet means a pinch; one far away (the right thumb going for the
  // attack button while the left one rests on the stick) is not — that used to zoom the camera in mid-fight
  if (e.pointerType === "touch" && joy && e.pointerId !== joy.id && Math.hypot(joy.dx, joy.dy) < 0.2 && Math.hypot(e.clientX - joy.cx, e.clientY - joy.cy) < innerWidth * 0.42) {
    touches.set(joy.id, { x: joy.cx, y: joy.cy }); joy = null; joyEl.classList.remove("on"); knob.style.transform = "";
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...touches.values()];
    pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cd: camDist, live: false }; look = null; return;
  }
  const willJoy = !photo && e.pointerType !== "mouse" && e.clientX < innerWidth * 0.5 && !joy;
  if (e.pointerType === "touch" && !willJoy) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { const [a, b] = [...touches.values()]; if (Math.hypot(a.x - b.x, a.y - b.y) < innerWidth * 0.42) { pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cd: camDist, live: false }; look = null; return; } touches.delete(e.pointerId); }
  }
  if (!photo && e.pointerType !== "mouse" && e.clientX < innerWidth * 0.5 && !joy) {
    joy = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, t: e.timeStamp, dx: 0, dy: 0 };
    joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px"; joyEl.classList.add("on"); knob.style.transform = "";
  } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
cv.addEventListener("pointermove", (e) => {
  if (touches.has(e.pointerId)) { touches.get(e.pointerId).x = e.clientX; touches.get(e.pointerId).y = e.clientY; }
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (!pinch.live && Math.abs(d - pinch.d) < 18) return; // a dead zone: fingers resting still don't zoom
    if (!pinch.live) { pinch.live = true; pinch.d = d; pinch.cd = camDist; }
    camDist = THREE.MathUtils.clamp(pinch.cd * pinch.d / Math.max(20, d), 0.6, mode === "island" ? 2.6 : 1.9); return;
  }
  if (e.pointerType === "mouse" && mode === "island") { hoverXY = { x: e.clientX, y: e.clientY }; if (!look) island.hover(e.clientX, e.clientY); }
  if (joy && e.pointerId === joy.id) {
    joy.cx = e.clientX; joy.cy = e.clientY;
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const m = Math.hypot(dx, dy), max = JOYMAX;
    if (m > max) { dx *= max / m; dy *= max / m; }
    joy.dx = dx / max; joy.dy = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
  } else if (look && e.pointerId === look.id) {
    camYaw -= (e.clientX - look.x) * 0.006 * S.sens;
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - look.y) * 0.004 * S.sens, -0.3, mode === "island" && island.building() ? 1.4 : 0.75);
    look.x = e.clientX; look.y = e.clientY; lastLook = performance.now();
  }
});
const lift = (e) => {
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
  // a short tap without a drag is a build action on your island
  if (e.type === "pointerup" && downAt && downAt.id === e.pointerId && mode === "island" && island.building() && !frozen && e.timeStamp - downAt.t < 450 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 9) island.tap(e);
  downAt = null;
  if (joy && e.pointerId === joy.id) { joy = null; joyEl.classList.remove("on"); }
  if (look && e.pointerId === look.id) look = null;
};
cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift);
cv.addEventListener("wheel", (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.0012, 0.6, mode === "island" ? 2.6 : 1.9); }, { passive: true });
$("wp-act-jump").addEventListener("click", () => jump());
$("wp-act-run").addEventListener("click", (e) => { runToggle = !runToggle; e.currentTarget.setAttribute("aria-pressed", String(runToggle)); });
// the emote wheel: T, or the wave button on a phone
const EMOTES = [["emote-yes", "Wave", "✋"], ["emote-no", "No", "✕"], ["sit", "Sit", "◡"], ["interact-right", "Point", "➚"], ["pick-up", "Pick up", "⇩"], ["die", "Faint", "✶"]];
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
function say(i) {
  if (!SAY[i]) return;
  if (sayBub) { player.remove(sayBub); sayBub.material.map && sayBub.material.map.dispose(); }
  const txt = SAY[i].includes(" ") || SAY[i].length > 4 ? T(SAY[i]) : W(SAY[i]);
  sayBub = K.label(txt, { accent: "#9fffd0", size: 0.5 }); sayBub.position.y = 2.75; player.add(sayBub); const mine = sayBub;
  setTimeout(() => { if (sayBub === mine) { player.remove(mine); sayBub = null; } }, 4500);
  if (avatar && grounded) avatar.play("emote-yes", { once: true });
  said = { s: i, at: Date.now(), sent: false };
  if (Date.now() - sayPingAt > 15000) { sayPingAt = Date.now(); ping(); } // others see it with the next ping at the latest
}
// play together: a link with your wanderer tag; whoever opens it sees you as a friend (and you them), and near each other you both get +10% XP
const myTag = SOC.tagOf(vid);
const together = () => !!(ghosts && ghosts.palNear && ghosts.palNear(20));
// a hunting party: up to three friends you pick (on their profile card). Their figures show their HP and where they
// are; with one of them within 30 m, knock-outs give +15% XP (instead of the +10% for a friend nearby)
const PARTY = "arc.world.party", isWallet = (a) => /^0x[0-9a-f]{40}$/.test(String(a || ""));
let party = (() => { try { return JSON.parse(localStorage.getItem(PARTY) || "[]").map((a) => String(a).toLowerCase()).filter(isWallet).slice(0, 3); } catch { return []; } })();
const inParty = (w) => party.includes(String(w || "").toLowerCase());
function partyToggle(w) {
  w = String(w || "").toLowerCase(); if (!isWallet(w)) return;
  if (inParty(w)) party = party.filter((x) => x !== w);
  else { if (!island.isFriend(w)) { toast(T("Add them as a friend first")); return; } if (party.length >= 3) { toast(T("A party is you and three friends")); return; } party = [...party, w]; }
  try { localStorage.setItem(PARTY, JSON.stringify(party)); } catch { /* private */ } paintParty();
}
const partyNear = (r = 30) => { if (!party.length || !ghosts || mode !== "hub") return false; const me0 = here(new THREE.Vector3()); return ghosts.named().some((g) => inParty(g.wallet) && Math.hypot(g.x - me0.x, g.z - me0.z) < r); };
const partyEl = document.createElement("div"); partyEl.className = "wp-party"; partyEl.id = "wp-party"; partyEl.hidden = true; partyEl.setAttribute("data-no-i18n", ""); partyEl.setAttribute("aria-label", T("Party")); (document.querySelector(".wp-hud-l") || document.body).appendChild(partyEl); // under the quest list
function paintParty() {
  if (!party.length || mode !== "hub") { partyEl.hidden = true; return; }
  const me0 = here(new THREE.Vector3()), seen = ghosts ? ghosts.named() : [], names = (() => { try { return JSON.parse(localStorage.getItem(PARTY + ".n") || "{}"); } catch { return {}; } })();
  partyEl.hidden = false;
  partyEl.innerHTML = `<b>${esc(T("Party"))}${partyNear() ? ` <em>${esc(T("+15% XP"))}</em>` : ""}</b>` + party.map((w) => { const g = seen.find((x) => String(x.wallet).toLowerCase() === w), nm = (g && g.name) || names[w] || w.slice(0, 6) + "…";
    if (g) { names[w] = g.name; }
    const d = g ? Math.round(Math.hypot(g.x - me0.x, g.z - me0.z)) : null, zn = g && g.zn ? (RPG.ZONES.find((z) => z.id === g.zn) || {}).name : "";
    return `<div class="${g ? "" : "away"}"><span>${esc(nm)}${g ? ` <small>Lv ${g.lv}</small>` : ""}</span>${g && g.h != null ? `<i><u style="width:${g.h}%"></u></i>` : ""}<small>${g ? (d < 30 ? esc(T("{n} m away", { n: d })) : zn ? esc(zn) : esc(T("{n} m away", { n: d }))) : esc(T("Not in the world"))}</small></div>`; }).join("");
  try { localStorage.setItem(PARTY + ".n", JSON.stringify(names)); } catch { /* private */ }
}
{ const c = document.createElement("div"); c.className = "wp-together"; c.id = "wp-together"; c.hidden = true; c.setAttribute("role", "status"); c.textContent = T("With a friend · +10% XP"); document.body.appendChild(c); }
{ const w = (new URLSearchParams(location.search).get("with") || "").toLowerCase(); if (/^[0-9a-z]{7}$/.test(w) && w !== myTag && P.pal !== w) { P.pal = w; save(); setTimeout(() => toast(T("You joined a friend's invite. Find them in town: near each other you both get +10% XP.")), 4000); } }
async function invite() {
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
const Y = new THREE.Vector3(0, 1, 0), prevP = new THREE.Vector3(), EDGE = 214; /* past the far ring of hunting grounds (their outer edge is ~206 m out); the hills start at 228 */
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
const SOLIDS = () => [shops, [portal, isleGate, fountainCore], lockedStages, town, coinBuildings, fighters.filter((g) => g.userData.live), decor ? decor.solids() : []];
const lp = new THREE.Vector3();
// a point on the ground (the world group's coordinates) inside a building? — the street scammers ask
const wp0 = new THREE.Vector3();
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
function tryMove(d, dist) {
  prevP.copy(planet.position);
  // already standing inside something (a respawn, a landing): any step that takes you further out is allowed
  let was = null, d0 = 0;
  if (mode !== "island") { planet.updateMatrixWorld(true); was = blockedBy(); d0 = hitDepth; }
  planet.position.addScaledVector(d, -dist);
  let hit = null;
  if (mode === "island") hit = island.blocked(here(tmp2)) ? { axis: true } : null;
  else if (planet.position.lengthSq() > EDGE * EDGE) hit = { edge: true };
  else { planet.updateMatrixWorld(true); hit = blockedBy(); if (hit && hit === was && hitDepth > d0 + 1e-4) hit = null; }
  if (hit) planet.position.copy(prevP);
  return hit;
}
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
let jumpBuf = 0; const hitFrom = new THREE.Vector3(); let hitAt = 0; // the last blow's push, for the flinch
// a running jump carries you forward: the speed you had when you left the ground stays with you in the air
const airV = new THREE.Vector3(), lastDir = new THREE.Vector3(0, 0, 1);
function jump() { if (jetOn() && !frozen) { jetHigh = !jetHigh; Snd.board(); return; } if (!grounded && !frozen) { jumpBuf = performance.now(); return; } if (!grounded || frozen) return; vy = (boarding ? 11 : 9) * (combat ? combat.jumpMul() : 1); grounded = false; airV.copy(lastDir).multiplyScalar(speedNow > 1 ? speedNow * 1.08 : 0); Snd.jump(); if (avatar && !boarding) avatar.play("jump", { once: true, fade: 0.08 }); daily("jumps"); tutorialStep(1); }
function emote(name) { if (!avatar || frozen || !grounded) return; avatar.play(name, { once: true }); if (pet) pet.emote(); }
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
  const floor = mode === "island" ? island.floorAt(here(tmp2)) : 0;
  if (jetOn()) { const want = floor + jetAlt(); hop += (want - hop) * Math.min(1, dt * 2.4); vy = 0; grounded = true; player.position.y = hop; }
  else if (!grounded) { vy -= 24 * dt; hop += vy * dt; if (hop <= floor) { const impact = -vy; hop = floor; vy = 0; if (avatar && avatar.land && impact > 4) { avatar.land(impact / 14); landRing(floor); } grounded = true; airV.set(0, 0, 0); Snd.land(); dust(6); shake = Math.max(shake, 0.12); if (performance.now() - jumpBuf < 160) { jumpBuf = 0; setTimeout(jump, 0); } } }
  else if (hop > floor + 0.05) { grounded = false; vy = 0; }
  else if (floor > hop) hop = floor;
  player.position.y = hop;
  at.y = THREE.MathUtils.lerp(at.y, jetOn() ? hop * 0.75 : floor, grounded ? 0.2 : 0.04);
  if (frozen) { speedNow = THREE.MathUtils.lerp(speedNow, 0, 0.2); return; }
  if (flying) {
    const k = Math.min(1, (performance.now() - flying.t0) / flying.ms), e = 1 - Math.pow(1 - k, 3);
    planet.position.lerpVectors(flying.from, flying.to, e);
    camYaw = angLerp(camYaw, flying.face - Math.PI, 0.08); facing = angLerp(facing, flying.face, 0.1);
    speedNow = 0.6 * (1 - k);
    if (k >= 1) { facing = flying.face; camYaw = flying.face - Math.PI; flying = null; if (mode === "hub") vfx.teleport(here()); }
    return;
  }
  const { x, y, m, run } = inputs();
  let sp = 0;
  // in the air with no input: keep gliding the way you jumped, slowing a little
  if (!grounded && m <= 0.05 && airV.lengthSq() > 0.25) { const v = airV.length(); tmp2.copy(airV).divideScalar(v); if (!tryMove(tmp2, v * dt)) sp = v; airV.multiplyScalar(1 - Math.min(1, dt * 0.6)); }
  if (m > 0.05) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    dir.set(rx * x + fx * y, 0, rz * x + fz * y).normalize();
    sp = (boarding ? (run ? 22 : 13) : run ? 12.5 : 6.5) * m * (combat ? combat.speedMul() : 1);
    if (!grounded && airV.lengthSq() > 0.25) sp = Math.max(sp, airV.length() * 0.92); // no slowing down mid-jump
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
    if (!look && performance.now() - lastLook > 1400 && y > 0.3) camYaw = angLerp(camYaw, facing - Math.PI, dt * 0.9);
    stepT -= dt * sp; if (grounded && stepT < 0 && !boarding) { Snd.step(); stepT = 2.6; if (sp > 10) dust(2); }
    walked += sp * dt; if (walked > 4) tutorialStep(0);
    dailyDist(sp * dt);
  }
  speedNow = THREE.MathUtils.lerp(speedNow, sp, 0.2);
}
// fly to a place: the player lands in front of it (things face the plaza) and turns to it
function flyTo(g) {
  if (mode !== "hub") leaveIsland();
  const p = g.position, front = new THREE.Vector3(-p.x, 0, -p.z);
  if (front.lengthSq() < 1e-4) front.set(0, 0, 1);
  front.normalize();
  const stand = new THREE.Vector3(p.x, 0, p.z).addScaledVector(front, (g.userData.radius || 1) + 1.7);
  vfx.teleport(here());
  flying = { from: planet.position.clone(), to: stand.clone().negate(), face: Math.atan2(p.x - stand.x, p.z - stand.z), t0: performance.now(), ms: reduce ? 1 : 1500 };
  camPitch = 0.05;
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
  onSaved: (x) => { [[20, "isle20"], [100, "isle100"], [300, "isle300"]].forEach(([n, k]) => { if (x.bricks >= n) arclClaim(k); }); [[1, "res1"], [5, "res5"]].forEach(([n, k]) => { if (x.residents >= n) arclClaim(k); }); },
  onLikes: (n) => { [[1, "liked1"], [10, "liked10"], [50, "liked50"]].forEach(([m, k]) => { if (n >= m) arclClaim(k); }); },
  onArcl: (n) => { if (n > 0) { arclShop.refresh().then(() => toast(T("+{n} ARCL · {why}", { n, why: T("Leave a stamp on someone's island") }))); Snd.coin(); } },
});
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
  onBought: (id) => { if (id === "feature-isle" || id === "billboard") refreshPlaza(); if (id.startsWith("plate-") || id.startsWith("trail-")) arclShop.close(); if (avatar) avatar.play("emote-yes", { once: true }); burst(0x4fd6ff); },
  furnace: () => { const f = shopG("reward"); if (f) f.userData.boost = 1; },
});
const done1 = new Set(); // claims already sent this session
function arclClaim(kind, extra = {}, from = null) { if (done1.has(kind)) return; done1.add(kind); arclShop.claim(kind, extra, from).then((n) => { if (!n && !sess()) done1.delete(kind); }); }
function applyOwn(o) {
  const items = (o && o.items) || [];
  island.setOwned(items, (o && o.lots) || []);
  if (P.style.plate && !items.includes(P.style.plate)) P.style.plate = "";
  if (P.style.trail && !items.includes(P.style.trail)) P.style.trail = "";
  if (P.isleTheme && !items.includes(P.isleTheme)) { P.isleTheme = ""; island.setTheme(""); }
  setNameTag(); paintTrail(); if (rpg && rpg.setBagPlus) rpg.setBagPlus(o && o.bag);
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
setInterval(refreshPlaza, 60000);
function islandLines() {
  const out = [];
  if (arcStats && arcStats.change24h != null) out.push(T("$ARCIRCLE is {p} today", { p: (arcStats.change24h >= 0 ? "+" : "") + arcStats.change24h.toFixed(1) + "%" }));
  if (coinData && coinData.length) { const c = coinData.slice().sort((a, b) => b.launchedAt - a.launchedAt)[0]; out.push(T("Did you see {x} launch on ArcPad?", { x: "$" + c.symbol })); }
  if (arcStats && arcStats.burned && arcStats.burned.tokens) out.push(T("{n} $ARCIRCLE burned so far", { n: Math.round(arcStats.burned.tokens).toLocaleString("en-US") }));
  out.push(T("Scan a token before you buy it."), T("I love this island."));
  return out;
}
async function goIsland(opt) {
  if (!opt || (!opt.visit && !opt.lot)) tutorialStep(6);
  closeAll();
  const veil = $("wp-veil"); veil.style.opacity = "1"; await sleep(reduce ? 0 : 260);
  if (mode === "island") island.leave();
  const ok = await island.enter(opt);
  if (!ok) { if (mode === "island") leaveIsland(); }
  else if (opt.visit && !P.visited.includes("isle-visit")) { P.visited.push("isle-visit"); save(); checkQuests(); }
  near = null; paintPrompt(); veil.style.opacity = "0";
}
function leaveIsland() {
  island.leave(); mode = "hub";
  const p = isleGate.position, front = new THREE.Vector3(-p.x, 0, -p.z).normalize(), stand = new THREE.Vector3(p.x, 0, p.z).addScaledVector(front, 3.6);
  planet.position.copy(stand).negate(); hop = 0; at.y = 0; vy = 0; grounded = true; facing = Math.atan2(-front.x, -front.z) + Math.PI; camYaw = facing - Math.PI;
  vfx.teleport(here(), { color: 0x39ff88, color2: 0x2ee07a });
  if (labels) labels.dirty = true; near = null; paintPrompt();
}

// ---------------- what's in reach ----------------
function nearest() {
  let best = null, bd = Infinity;
  const consider = (g, kind, extra, reach) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at) - (g.userData.radius || 1); if (d < reach && d < bd) { bd = d; best = { kind, g, ...extra }; } };
  if (mode === "island") { island.near(consider); return best; }
  consider(isleGate, "isle", {}, 2.4);
  if (plazaNow && (plazaNow.isle || plazaNow.coin)) consider(screen, "screen", {}, 2.6);
  shops.forEach((g) => consider(g, "shop", { spec: g.userData.spec }, 2.8));
  coinBuildings.forEach((g) => consider(g, "coin", { coin: g.userData.coin }, 2.4));
  consider(portal, "portal", {}, 2.4);
  consider(pad, "pad", {}, 1.6);
  if (race && !race.racing()) consider(race.pad, "race", {}, 1.8);
  if (npc) consider(npc, "npc", {}, 2.4);
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
  $("wp-enter-t").innerHTML = near.kind === "screen" ? (plazaNow && plazaNow.isle ? T("Visit {x}", { x: b(T("{name}'s island", { name: plazaNow.isle.name })) }) : T("Visit {x}", { x: b("$" + ((plazaNow && plazaNow.coin && plazaNow.coin.symbol) || "")) })) : near.kind === "isle" ? T("Go to {x}", { x: b(T("My Island")) }) : near.kind === "isle-exit" ? esc(T("Back to the world")) : near.kind === "resident" ? T("Talk to {x}", { x: b(near.res.name) }) : near.kind === "portal" ? T("Go to {x}", { x: b(T("Platform World")) }) : near.kind === "pad" ? esc(T("Fast travel")) : near.kind === "race" ? T("Start the {x}", { x: b(T("hoverboard race")) }) : near.kind === "npc" ? T("Talk to {x}", { x: b("ARCIA") }) : near.kind === "coin" ? T("Visit {x}", { x: b("$" + near.coin.symbol) }) : T("Enter {x}", { x: b(near.spec.name) });
}
$("wp-enter").addEventListener("click", () => near && enter(near));

// ---------------- shops, coins, ARCIA ----------------
const sheet = $("wp-sheet"), frame = $("wp-frame");
let openShop = null;
let lotCoin = null, frameT = 0;
$("wp-sheet-lot").addEventListener("click", () => { const c = lotCoin; closeSheet(); if (c) goIsland({ lot: c }); });
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
function enter(n) {
  if (n.kind === "isle") { goIsland({}); return; }
  if (n.kind === "screen") { if (plazaNow && plazaNow.isle) goIsland({ visit: plazaNow.isle.wallet }); else if (plazaNow && plazaNow.coin) openSheet("$" + plazaNow.coin.symbol, T("On the plaza billboard"), "/arc#coin/" + plazaNow.coin.token); return; }
  if (n.kind === "isle-exit") { leaveIsland(); return; }
  if (n.kind === "resident") { island.talk(n.res); return; }
  if (n.kind === "portal") { location.href = "/?skip"; return; }
  if (n.kind === "pad") { openMap(); return; }
  if (n.kind === "race") { race.start(); return; }
  if (n.kind === "npc") { doorThen(n.g, () => openSheet("ARCIA", T("Arc's AI idol. Ask her anything about a coin, a wallet or this world."), "/arc#arcia")); return; }
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
function buildCoinCity(list) {
  if (!kit) return;
  coinBuildings.splice(0).forEach((g) => planet.remove(g));
  const me = lc(addr());
  const mine = me ? list.filter((c) => lc(c.creator) === me) : [];
  const rest = list.filter((c) => !mine.includes(c)).sort((a, b) => (Number(b.marketCapUsd) || 0) - (Number(a.marketCapUsd) || 0));
  const pick = [...mine.slice(0, 4), ...rest].slice(0, K.COIN_LOTS.length);
  pick.forEach((c, i) => {
    const g = K.makeCoinBuilding(kit, c, mine.includes(c)); const [th, ph] = K.COIN_LOTS[i];
    K.placeOn(g, K.dirOf(th, ph)); planet.add(g); spins.push(...g.userData.spin); coinBuildings.push(g);
  });
  if (labels) labels.dirty = true;
  dressLots();
}
// a coin's creator can build its lot brick by brick (world-island.js, lot mode); those builds replace the stock building
async function dressLots() {
  if (!coinBuildings.length) return;
  try {
    const r = await fetch("/api/social?world=lots&coins=" + coinBuildings.map((g) => lc(g.userData.coin.token)).join(",")); if (!r.ok) return;
    const j = await r.json();
    coinBuildings.forEach((g) => {
      const d = j.lots && j.lots[lc(g.userData.coin.token)]; if (!d || !d.data) return;
      const sg = island.makeStatic(d.data); if (!sg) return;
      if (g.userData.lotG) g.remove(g.userData.lotG);
      const k = 4.6 / (sg.userData.N || 9); sg.scale.setScalar(k); sg.position.y = 0.2; g.add(sg); g.userData.lotG = sg;
      if (g.userData.body) g.userData.body.visible = false;
      g.userData.tag.position.y = sg.userData.h * k + 1.9;
      if (sg.userData.N === 13 && !g.userData.spot) { const bc = K.makeBeacon(0xffc861, 16); g.add(bc); g.userData.spin.push(bc.userData.spin); spins.push(bc.userData.spin); g.userData.spot = bc; }
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
  const me = lc(addr());
  myCoins = me ? list.filter((c) => lc(c.creator) === me) : [];
  if (first || !coinData) {
    list.slice().sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 3).reverse().forEach((c) => feed(T("{x} launched on ArcPad {when}", { x: `<b>$${esc(c.symbol)}</b>`, when: ago(c.launchedAt) }), "#4f9dff"));
  } else {
    if (newest > lastSeen) list.filter((c) => c.launchedAt > lastSeen).slice(0, 3).forEach((c) => { feed(T("New on ArcPad: {x} just launched", { x: `<b>$${esc(c.symbol)}</b>` })); launchRocket(); });
    // a building pulses when its coin's market cap climbs
    const old = new Map(coinData.map((c) => [c.token, Number(c.marketCapUsd) || 0]));
    coinBuildings.forEach((g) => { const c = list.find((x) => x.token === g.userData.coin.token); if (!c) return; const was = old.get(c.token) || 0, now = Number(c.marketCapUsd) || 0; if (was > 0 && now > was * 1.03) { g.userData.pulse = 1; feed(T("{x} market cap up {p}%", { x: `<b>$${esc(c.symbol)}</b>`, p: Math.round((now / was - 1) * 100) }), "#39ff88"); } });
  }
  lastSeen = newest;
  const changed = !coinData || coinData.length !== list.length || myCoins.length !== (coinData.mine || 0);
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
setInterval(() => refreshCoins(false), 45000);

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
  if (m !== mood) { mood = m; aurora.visible = m === "aurora"; rain.visible = m === "rain"; setWet(m === "rain"); if (!first && m) feed(m === "aurora" ? T("$ARCIRCLE is up today: an aurora over the planet") : m === "rain" ? T("$ARCIRCLE is down today: rain over the planet") : T("Clear skies over the planet"), "#35d8d0"); }
}
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
setInterval(refreshArc, 60000);

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
setInterval(refreshQuantum, 30000);

// ---------------- quests, daily goals and badges ----------------
const QUESTS = [
  { id: "launchpad", t: "Visit the Launchpad", xp: 15, done: () => P.visited.includes("launch"), target: () => shopG("launch") },
  { id: "wallet", t: "Connect your wallet", xp: 20, done: () => !!addr(), target: () => null },
  { id: "cards3", t: "Pick up 3 key cards", xp: 20, done: () => P.cards.length >= 3, target: () => nearestOf(cards) },
  { id: "scanner", t: "Open the Scanner Tower", xp: 15, done: () => P.visited.includes("scanner"), target: () => shopG("scanner") },
  { id: "phisher", t: "Beat The Phisher in the Dark Market", xp: 0, done: () => P.beaten.includes("phisher"), target: () => fighters.find((g) => g.userData.spec.id === "phisher") || null },
  { id: "coincity", t: "Visit a coin in Coin City", xp: 15, done: () => P.visited.includes("coin"), target: () => coinBuildings[0] || null },
  { id: "arcia", t: "Talk to ARCIA", xp: 15, done: () => P.visited.includes("npc"), target: () => npc },
  { id: "build20", t: "Place 20 bricks on your island", xp: 20, done: () => ((P.isle && P.isle.bricks) || 0) >= 20, target: () => isleGate },
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
];
function badges() {
  let got = false;
  BADGES.forEach((b) => { if (!P.badges.includes(b.id) && b.done()) { P.badges.push(b.id); got = true; feed(T("Badge earned: {b}", { b: `<b>${esc(T(b.t))}</b>` }), "#ffc861"); } });
  if (got) { save(); setNameTag(); }
}
function nearestOf(list) { let b = null, bd = Infinity; list.forEach((g) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at); if (d < bd) { bd = d; b = g; } }); return b; }
const beacon = K.makeBeacon(K.C.gold, 22); spins.push(beacon.userData.spin);
let questTarget = null, justDone = null;
function checkQuests() {
  QUESTS.forEach((q) => { if (!P.quests.includes(q.id) && q.done()) { P.quests.push(q.id); save(); justDone = { t: T(q.t), at: performance.now() }; feed(T("Quest done: {q}", { q: `<b>${esc(T(q.t))}</b>` }), "#ffc861"); if (q.xp) gain(q.xp, T(q.t)); else Snd.win(); } });
  badges(); paintQuests();
}
function paintQuests() {
  const open = QUESTS.filter((q) => !P.quests.includes(q.id));
  $("wp-quests-n").textContent = `${QUESTS.length - open.length}/${QUESTS.length}`;
  const doneRow = justDone && performance.now() - justDone.at < 3000 ? `<li class="done-now"><i></i><span>${esc(justDone.t)}</span></li>` : "";
  $("wp-quests-l").innerHTML = doneRow + (open.slice(0, 3).map((q, i) => `<li${i === 0 ? ' class="cur"' : ""}><i></i><span>${esc(T(q.t))}</span>${q.xp ? `<small>+${q.xp} XP</small>` : ""}</li>`).join("") || `<li class="done"><span>${esc(T("All quests done. More soon."))}</span></li>`);
  if (doneRow) setTimeout(paintQuests, 3100);
  const cur = open[0], tg = cur && cur.target();
  if (tg !== questTarget) { if (beacon.parent) beacon.parent.remove(beacon); questTarget = tg; if (tg) tg.add(beacon); }
}
$("wp-quests-h").addEventListener("click", (e) => { const q = $("wp-quests"); const o = q.classList.toggle("closed"); e.currentTarget.setAttribute("aria-expanded", String(!o)); try { localStorage.setItem("arc.world.qopen", o ? "0" : "1"); } catch { /* private */ } });
// on a phone the quest list starts folded to its title (tap to open); the choice is remembered
(() => { let open = null; try { open = localStorage.getItem("arc.world.qopen"); } catch { /* private */ } if (open === "0" || (open === null && coarse)) { $("wp-quests").classList.add("closed"); $("wp-quests-h").setAttribute("aria-expanded", "false"); } })();
// daily goals (Seoul day): open two shops, jump ten times, walk 300 m — all three keep the streak going
const seoulDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const DAILY = [{ id: "shops", t: "Open 2 shops", n: 2 }, { id: "jumps", t: "Jump 10 times", n: 10 }, { id: "walk", t: "Walk 300 m", n: 300 }];
function dailyState() {
  const today = seoulDay();
  if (!P.daily || P.daily.day !== today) {
    const y = seoulDay(new Date(Date.now() - 86400e3)), was = P.daily;
    P.daily = { day: today, done: [], streak: was && was.day === y && (was.done || []).length === DAILY.length ? was.streak || 0 : 0, c: { shops: [], jumps: 0, walk: 0 } };
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
  const groups = K.DISTRICTS.filter((d) => d.id !== "coins" && d.id !== "dark").map((d) => {
    const list = shops.filter((g) => ({ Launch: "launch", Finance: "finance", Research: "research", ARCIA: "arcia" })[g.userData.spec.district] === d.id);
    return list.length ? `<h3 style="--c:${hex(d.color)}">${esc(d.name)}</h3><ul class="wp-maplist">` + list.map((g) => { const s = g.userData.spec; return `<li><button type="button" data-i="${shops.indexOf(g)}"><i style="--c:${hex(s.color)}"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span>${P.visited.includes(s.id) ? `<em>${esc(W("visited"))}</em>` : ""}</button></li>`; }).join("") + "</ul>" : "";
  }).join("");
  const arclList = shops.filter((g) => g.userData.spec.district === "ARCL");
  const arclHtml = `<h3 style="--c:#4fd6ff">ARCL</h3><ul class="wp-maplist">` + arclList.map((g) => { const s = g.userData.spec; return `<li><button type="button" data-i="${shops.indexOf(g)}"><i style="--c:#4fd6ff"></i><span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span></button></li>`; }).join("") + "</ul>";
  const coinsHtml = coinBuildings.length ? `<h3 style="--c:#eef3f7">${esc(T("Coin City"))}</h3><ul class="wp-maplist">` + coinBuildings.slice(0, 6).map((g, i) => `<li><button type="button" data-c="${i}"><i style="--c:${g.userData.mine ? "#39ff88" : "#4f9dff"}"></i><span><b>$${esc(g.userData.coin.symbol)}</b><small>${esc(g.userData.coin.name || "")}${g.userData.mine ? " · " + esc(W("yours")) : ""}</small></span></button></li>`).join("") + "</ul>" : "";
  const live = fighters.find((g) => g.userData.live);
  const darkHtml = live ? `<h3 style="--c:#ff4d6d">${esc(T("Dark Market"))}</h3><ul class="wp-maplist"><li><button type="button" data-f="1"><i style="--c:#ff4d6d"></i><span><b>${esc(live.userData.spec.name)}</b><small>${esc(T("Stage {n} · scammer", { n: live.userData.spec.stage }))}</small></span></button></li></ul>` : "";
  // the grounds as a ring map: town in the middle, the near five and the far seven where they really are, the ones
  // right for your level ringed, you as a dot; tap one to fly to its gate
  const lvNow = level(), fits = (z) => z.id !== "raid" && lvNow >= z.lv[0] && lvNow <= z.lv[1] + 2;
  const me0 = here(new THREE.Vector3()), S2 = 0.85;
  const ringSvg = `<svg class="wp-ringmap" viewBox="-200 -200 400 400" role="img" aria-label="${esc(T("Hunting grounds"))}"><circle r="178" class="orbit"/><circle r="100" class="orbit"/><circle r="16" class="town"/><text y="4" class="tn">${esc(T("Town"))}</text>`
    + ZN.ZONES.map((z, i) => { const x = z.x * S2, y = z.z * S2, c = "#" + new THREE.Color(z.color).getHexString(); return `<g class="zn${fits(z) ? " fit" : ""}" data-z="${i}" tabindex="0" role="button" aria-label="${esc(z.name)} · ${esc(T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] }))}" style="--c:${c}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(z.r * S2).toFixed(1)}"/>${fits(z) ? `<circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(z.r * S2 + 6).toFixed(1)}"/>` : ""}<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${z.lv[0]}–${z.lv[1]}</text></g>`; }).join("")
    + `<circle class="me" cx="${(me0.x * S2).toFixed(1)}" cy="${(me0.z * S2).toFixed(1)}" r="5"/></svg>`;
  const zoneHtml = `<h3 style="--c:#ff9a4a">${esc(T("Hunting grounds"))}</h3>${ringSvg}<ul class="wp-maplist">` + [...ZN.ZONES, SOC.RAID].map((z, i) => `<li><button type="button" data-z="${i}"><i style="--c:#${new THREE.Color(z.color).getHexString()}"></i><span><b>${esc(z.name)}${fits(z) ? ` <em class="wp-fit">${esc(T("Right for you"))}</em>` : ""}</b><small>${esc(z.id === "raid" ? T("Level {n}+", { n: z.lv[0] }) + (raid && raid.nextText() ? " · " + raid.nextText() : "") : T("Level {a}–{b}", { a: z.lv[0], b: z.lv[1] }))}${level() < z.lv[0] ? " · " + esc(T("Recommended from level {n}", { n: z.lv[0] })) : ""}</small></span></button></li>`).join("") + "</ul>";
  const key = [["#ffc861", "Friends"], ["rgba(159,230,255,.75)", "Other players"], ["#ff4d6d", "Scammers"], ["#2f86ff", "Race pad"], ["#ffc861", "Fast travel"], ["#7ee0a0", "My Island gate"], ["#35d8d0", "Platform World"], ["#ff7ad9", "ARCIA"]];
  const keyHtml = `<div class="wp-mapkey"><b>${esc(T("Minimap"))}</b>${key.map(([c, n]) => `<span><i style="--c:${c}"></i>${esc(T(n))}</span>`).join("")}<span><i class="ring"></i>${esc(T("Where to go next"))}</span><span><i class="sq">L</i>${esc(T("Halls, by their first letter"))}</span></div>`;
  const raceHtml = race ? `<h3 style="--c:#2f86ff">${esc(T("Hoverboard race"))}</h3><ul class="wp-maplist"><li><button type="button" data-race="1"><i style="--c:#2f86ff"></i><span><b>${esc(T("Race pad"))}</b><small>${esc(T("Eight rings around the plaza, against the clock"))}</small></span></button></li></ul>` : "";
  $("wp-maplist").innerHTML = keyHtml + groups + arclHtml + zoneHtml + raceHtml + coinsHtml + darkHtml + `<h3 style="--c:#35d8d0">${esc(T("Ways out"))}</h3><ul class="wp-maplist"><li><button type="button" data-isle="1"><i style="--c:#7ee0a0"></i><span><b>${esc(T("My Island"))}</b><small>${esc(T("Build your own island, brick by brick."))}</small></span></button></li><li><button type="button" data-isles="1"><i style="--c:#7ee0a0"></i><span><b>${esc(T("Islands"))}</b><small>${esc(T("Visit the islands other players built."))}</small></span></button></li><li><button type="button" data-i="portal"><i style="--c:#35d8d0"></i><span><b>${esc(T("Platform World"))}</b><small>${esc(T("Back to the site as it is."))}</small></span></button></li>${npc ? `<li><button type="button" data-n="1"><i style="--c:#ff7ad9"></i><span><b>ARCIA</b><small>${esc(T("Talk to ARCIA"))}</small></span></button></li>` : ""}</ul>`;
  mapEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
  const first = mapEl.querySelector("button[data-i]"); if (first) first.focus({ preventScroll: true });
}
function closeMap() { if (mapEl.hidden) return; mapEl.hidden = true; frozen = false; }
$("wp-map-btn").addEventListener("click", openMap);
$("wp-map-x").addEventListener("click", closeMap);
mapEl.addEventListener("keydown", (e) => { const g = e.target.closest && e.target.closest(".wp-ringmap g[data-z]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); g.dispatchEvent(new MouseEvent("click", { bubbles: true })); } });
mapEl.addEventListener("click", (e) => {
  if (e.target === mapEl) { closeMap(); return; }
  const b = e.target.closest("button[data-i],button[data-c],button[data-f],button[data-n],button[data-isle],button[data-isles],button[data-z],button[data-race],.wp-ringmap g[data-z]"); if (!b) return;
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
    const skyWas = sky.visible, cloudsWas = clouds.visible; sky.visible = false; clouds.visible = false; const fog = st.scene.fog; st.scene.fog = null; const bg = st.scene.background; st.scene.background = new THREE.Color(0x0b1a14);
    planet.position.set(0, 0, 0); planet.updateMatrixWorld(true);
    const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.clear(); r.render(st.scene, cam2); r.setRenderTarget(prev);
    planet.position.copy(pos); planet.updateMatrixWorld(true); off.forEach((o) => { o.visible = true; }); sky.visible = skyWas; clouds.visible = cloudsWas; st.scene.fog = fog; st.scene.background = bg;
    const px = new Uint8Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, px); rt.dispose();
    const cv = document.createElement("canvas"); cv.width = cv.height = N; const g = cv.getContext("2d"), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) img.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4); // the picture comes bottom row first
    g.putImageData(img, 0, 0); miniMap = cv;
  } catch (e) { console.warn("minimap:", e); }
}
function drawMini() {
  const W = mini.width, c = W / 2, range = mode === "island" ? 26 : 40, sc = (c - 10) / range;
  mg.clearRect(0, 0, W, W);
  mg.save(); mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.clip();
  mg.fillStyle = "rgba(8,14,22,.82)"; mg.fillRect(0, 0, W, W);
  mg.strokeStyle = "rgba(53,216,208,.14)"; mg.lineWidth = 2; [0.33, 0.66].forEach((k) => { mg.beginPath(); mg.arc(c, c, (c - 2) * k, 0, 6.283); mg.stroke(); });
  const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
  // the ground itself under the marks: a picture of the world from above, turned with the camera (taken once it's built)
  if (mode !== "island" && miniMap) { const E = MINI_E, k = E / miniMap.width, plx = -planet.position.x, plz = -planet.position.z, a = sc * cs * k, b = sc * sn * k;
    mg.save(); mg.globalAlpha = 0.9; mg.setTransform(a, b, -b, a, c + sc * (cs * (-E / 2 - plx) - sn * (-E / 2 - plz)), c + sc * (sn * (-E / 2 - plx) + cs * (-E / 2 - plz))); mg.drawImage(miniMap, 0, 0); mg.restore();
    mg.fillStyle = "rgba(8,14,22,.28)"; mg.fillRect(0, 0, W, W); }
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
    for (const zn of [...RPG.ZONES, SOC.RAID]) {
      const wx = zn.x + planet.position.x, wz = zn.z + planet.position.z, rx = wx * cs - wz * sn, rz = wx * sn + wz * cs;
      const px = c + rx * sc, py = c + rz * sc, col = "#" + new THREE.Color(zn.color).getHexString();
      mg.strokeStyle = col; mg.globalAlpha = 0.55; mg.lineWidth = 2; mg.setLineDash([5, 4]); mg.beginPath(); mg.arc(px, py, zn.r * sc, 0, 6.283); mg.stroke(); mg.setLineDash([]);
      mg.globalAlpha = 0.12; mg.fillStyle = col; mg.fill(); mg.globalAlpha = 1;
      if (bossUp.includes(zn.id)) { const pr = 8 + Math.sin(performance.now() / 180) * 2; mg.fillStyle = "#ff4d6d"; mg.beginPath(); mg.arc(px, py, pr, 0, 6.283); mg.fill(); mg.fillStyle = "#fff"; mg.font = "900 12px Sora, sans-serif"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText("!", px, py + 0.5); }
    }
    // other players: friends in gold and a little bigger
    if (ghosts) ghosts.each((g, w) => { const fr = !!(w && w.wallet && island.isFriend(w.wallet)); put(g, fr ? "#ffc861" : "rgba(159,230,255,.55)", fr ? 5 : 3); });
    coinBuildings.forEach((g) => put(g, g.userData.mine ? "#39ff88" : "rgba(238,243,247,.55)", 4));
    cards.forEach((g) => put(g, "#ffc861", 3.5));
    put(portal, "#35d8d0", 6); put(pad, "#ffc861", 5); put(isleGate, "#7ee0a0", 6); if (npc) put(npc, "#ff7ad9", 5);
    if (race) { put(race.pad, "#2f86ff", 5); const rt = race.target(); if (rt) { const q = put(rt, "", 0); mg.strokeStyle = "#ffc861"; mg.lineWidth = 3; mg.beginPath(); mg.arc(q.px, q.py, 9, 0, 6.283); mg.stroke(); } }
    shops.forEach((g) => put(g, hex(g.userData.spec.color), 9, g.userData.spec.name[0]));
    fighters.forEach((g) => put(g, g.userData.live ? "#ff4d6d" : "rgba(255,77,109,.45)", g.userData.live ? 6 : 4));
  }
  if (questTarget && mode === "hub") { const p = put(questTarget, "", 0); if (p) { mg.strokeStyle = "#ffc861"; mg.lineWidth = 3; mg.beginPath(); mg.arc(p.px, p.py, 12, 0, 6.283); mg.stroke(); } }
  mg.restore();
  const fa = facing - Math.PI - camYaw;
  mg.save(); mg.translate(c, c); mg.rotate(-fa); mg.fillStyle = "#eef3f7"; mg.beginPath(); mg.moveTo(0, -11); mg.lineTo(8, 9); mg.lineTo(0, 4); mg.lineTo(-8, 9); mg.closePath(); mg.fill(); mg.restore();
  mg.strokeStyle = "rgba(255,255,255,.18)"; mg.lineWidth = 2; mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.stroke();
  let dn = "", bd = Infinity;
  if (mode === "island") { dn = island.title(); bd = 0; }
  else K.DISTRICTS.forEach((d) => { const v = K.spot(d.theta, d.phi).add(planet.position); const dd = v.length(); if (dd < bd) { bd = dd; dn = d.name; } });
  $("wp-mini-n").textContent = bd < 22 ? dn : "";
}
const qm = $("wp-qmark"), proj = new THREE.Vector3();
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
  // the marker never sits on a panel (the raid card, the minimap, the quests, the boss bar): it steps out beside it
  for (const id of ["wr-raid", "wp-quests", "wc-boss", "wp-mini"]) {
    const e = $(id); if (!e || e.hidden || !e.offsetParent) continue; const r = (id === "wp-mini" ? e.parentElement : e).getBoundingClientRect(), p = 28;
    if (x > r.left - p && x < r.right + p && y > r.top - p && y < r.bottom + p) { const toL = x - (r.left - p), toR = r.right + p - x, toT = y - (r.top - p), toB = r.bottom + p - y, mn = Math.min(r.left > p * 2 ? toL : 1e9, r.right < W - p * 2 ? toR : 1e9, r.top > p * 2 ? toT : 1e9, toB); if (mn === toL) x = r.left - p; else if (mn === toR) x = r.right + p; else if (mn === toT) y = r.top - p; else y = r.bottom + p; }
  }
  qm.hidden = false; qm.classList.toggle("edge", !inside);
  qm.style.transform = `translate(${x}px,${y}px)`;
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
    l.material.opacity = THREE.MathUtils.lerp(l.material.opacity, want, 0.15); l.visible = l.material.opacity > 0.02;
    if (isBig && l.parent) {
      const pw = (l.userData.rank < NAME_MAX ? THREE.MathUtils.clamp((d - NAME_FAR + 6) / 8, 0, 1) : 1) * THREE.MathUtils.clamp((PIN_FAR - d) / 20, 0, 1) * (l.userData.pinClear === false ? 0 : 1) * (l.userData.rank < 14 ? 1 : 0);
      if (pw > 0.01 || l.userData.pin) { const p = pinOf(l); p.material.opacity = THREE.MathUtils.lerp(p.material.opacity, pw, 0.15); p.visible = p.material.opacity > 0.02; const s = d * 0.024; p.scale.set(s, s, 1); }
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
  if (avatar && avatar.face) avatar.face("star", 2.4); // star eyes
  // a level-up card across the middle of the screen: the new level, rays behind it, what it opened
  { const el = document.createElement("div"); el.className = "wp-lvup"; el.setAttribute("role", "status"); el.setAttribute("data-no-i18n", "");
    const opens = []; if (n === 10) opens.push(T("The rover")); if (n === 30) opens.push(T("The jetpack")); const z = RPG.ZONES.find((x) => x.lv[0] === n); if (z) opens.push(z.name);
    el.innerHTML = `<i class="wp-lvup-rays" aria-hidden="true"></i><small>${esc(T("Level up"))}</small><b>${n}</b>${opens.length ? `<span>${esc(opens.join(" · "))}</span>` : ""}`;
    document.body.appendChild(el); setTimeout(() => el.classList.add("out"), reduce ? 1600 : 2200); setTimeout(() => el.remove(), reduce ? 1900 : 2700); }
  const pas = RPG.PASSIVES.find((x) => x.lv === n); if (pas) setTimeout(() => toast(T("New passive: {x} — {y}", { x: T(pas.name), y: T(pas.line) })), 1600);
  if (grounded && !boarding && mode === "hub") { vy = 7.5; grounded = false; } // a little jump for joy
  if (avatar && avatar.arc && !boarding) avatar.play("celebrate", { once: true }); // an ARC Bot throws its arms up
  vfx.levelUp();
  // the new level rises from your head and fades
  if (!reduce) { const lb = K.label(T("Lv {n}", { n }), { accent: "#ffc861", color: "#ffd27a", size: 0.8 }); lb.position.y = 3.4; player.add(lb); const t0 = performance.now(); const off = st.on(() => { const k = (performance.now() - t0) / 1700; lb.position.y = 3.4 + k * 1.6; lb.material.opacity = Math.min(1, (1 - k) * 2.5); if (k >= 1) { off(); player.remove(lb); lb.material.map && lb.material.map.dispose(); lb.material.dispose(); } }); }
  if (rpg) { const was = RPG.statsOf(from || n - 1, rpg.data().eq); rpg.onLevel(); if (combat) combat.onLevel(n, was); } else if (combat) combat.onLevel(n);
  if (quests) quests.on.level();
  const el = $("wp-levelup"); $("wp-levelup-n").textContent = String(n);
  el.hidden = false; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  setTimeout(() => { el.hidden = true; }, 1900);
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
    if (!reduce && !frozen && k < 0.25) camYaw = angLerp(y0, want, Math.min(1, k * 6));
    if (k >= 1) { off(); planet.remove(beam); beam.geometry.dispose(); beam.material.dispose(); } });
  toast(T("A hunting ground fits your level now: {x} (level {a}–{b})", { x: z.name, a: z.lv[0], b: z.lv[1] }));
  Snd.level && Snd.level();
}
const dustGeo = new THREE.SphereGeometry(0.18, 6, 5);
function dust(n) {
  if (reduce) return;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xcfe0e6, transparent: true, opacity: 0.6, depthWrite: false }));
    const a = Math.random() * 6.28; m.position.set(Math.cos(a) * 0.4, hop + 0.1, Math.sin(a) * 0.4); st.scene.add(m);
    const v = new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).multiplyScalar(1.4 + Math.random()); const t0 = performance.now();
    const off = st.on((dt) => { const k = (performance.now() - t0) / 600; m.position.addScaledVector(v, dt); m.scale.setScalar(1 + k * 2); m.material.opacity = 0.6 * (1 - k); if (k >= 1) { off(); st.scene.remove(m); m.material.dispose(); } });
  }
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
  const f = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e4 ? (v / 1e3).toFixed(1) + "K" : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
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
  if (u.status === "fulfilled") { bal.usdc = n(u.value); $("wp-usdc").textContent = f(bal.usdc); }
  if (t.status === "fulfilled") { bal.arc = n(t.value); $("wp-arc").textContent = f(bal.arc); }
  $("wp-purse").classList.toggle("stale", u.status !== "fulfilled" || t.status !== "fulfilled"); $("wp-purse").classList.remove("loading");
  if (u.status !== "fulfilled" || t.status !== "fulfilled") purseAt = Date.now() - 22000; // try again in a few seconds
  if (u.status === "fulfilled" || t.status === "fulfilled") { paintCrown(); arclChecks(); }
  checkQuests();
}
function arclChecks() {
  if ((bal.arc || 0) > 0) arclClaim("hold");
  if (myCoins.length) arclClaim("launch", { coin: lc(myCoins[0].token) });
}
function paintCrown() {
  if (!avatar || !avatar.setCrown) return;
  const a = bal.arc || 0;
  if (a >= 1e6) avatar.setCrown(0xffc861, 0xffe7a8); else if (a >= 1e5) avatar.setCrown(0x39ff88, 0x35d8d0); else if (a > 0) avatar.setCrown(0x35d8d0, 0x4f9dff); else avatar.setCrown(0x3f9bff, 0x39ff88);
}
$("wp-wallet").addEventListener("click", () => { if (AC && !addr()) AC.connect().then(() => { refreshPurse(true); refreshCoins(); paintAcct(); }).catch(() => {}); else if (AC) refreshPurse(true); });
if (AC && AC.on) AC.on(() => { refreshPurse(true); refreshCoins(); paintAcct(); });
setInterval(() => refreshPurse(false), 30000);
// back from a swap or a launch in another tab: read the purse again (at most every 5 seconds)
let purseBack = 0; document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - purseBack > 5000) { purseBack = Date.now(); refreshPurse(true); } });

// ---------------- HUD ----------------
function paintHud() {
  $("wp-lv").querySelector("b").textContent = "Lv " + level();
  const fl = $("wc-face-lv"); if (fl) fl.textContent = String(level());
  const xq = RPG.xpProgress(P.xp); $("wp-xpfill").style.width = Math.min(100, (100 * xq.into) / xq.need).toFixed(1) + "%";
  $("wp-lv").title = `${xq.into.toLocaleString("en-US")} / ${xq.need.toLocaleString("en-US")} XP`;
  $("wp-cards").querySelector("b").textContent = `${P.cards.length}/${K.CARDS.length}`;
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  $("wp-stage").textContent = next ? T("Stage {n} · {name}", { n: next.stage, name: next.name }) : T("Every stage cleared");
}
// tutorial: move, jump, then follow the light
// the first three minutes: move, jump, a shop, then a training fight, your gear, the Adventure log and your island
const TUT = ["Move with W A S D, or the stick on the left", "Jump with Space, or the arrow button", "Follow the gold light to the Launchpad",
  "Knock out the training scammer: J, or the red button", "Open your character: I, or the bag button", "Open the Adventure log: L — today's chest is there", "Visit your own island through the green gate"];
const TUT_XP = [0, 0, 0, 25, 15, 15, 30];
function tutorialStep(done) {
  // steps can be done in any order (jumping before walking counts); the hint shows the first one not done yet
  if (done >= 0) {
    const bit = 1 << done; if ((P.tutBits | 0) & bit || P.tut >= TUT.length) return;
    P.tutBits = (P.tutBits | 0) | bit; if (TUT_XP[done]) setTimeout(() => gain(TUT_XP[done], T("Getting started")), 300);
    let n = 0; while (n < TUT.length && P.tutBits & (1 << n)) n++;
    if (n === P.tut) { save(); return; }
    P.tut = n; save();
    if (n >= TUT.length) { setTimeout(() => { toast(T("You know your way around. Have fun out there!")); burst(0x39ff88); }, 600); }
  }
  const h = $("wp-hint");
  if (P.tut >= TUT.length) { h.hidden = true; return; }
  h.innerHTML = `<small>${esc(T("Getting started"))} ${P.tut + 1}/${TUT.length}</small> ${esc(T(TUT[P.tut]))}`; h.hidden = false; h.classList.remove("on"); void h.offsetWidth; h.classList.add("on");
  // the training fight: a weak scammer shows up a few steps away
  // (tried again until the scammer robots have loaded: on a slow connection they come a little after the town)
  const train = () => { if (P.tut !== 3 || mode !== "hub" || !combat || combat.state().mobs.length) return; if (!combat.spawnNear(6, { lv: 1, free: true })) setTimeout(train, 1500); };
  if (P.tut === 3 && combat && mode === "hub") setTimeout(train, 900);
}
// ---------------- sign in, character maker, settings, photo mode ----------------
const auth = $("wp-auth");
function openAuth() {
  auth.hidden = false; frozen = true; $("wp-auth-err").hidden = true;
  paintAuthCount();
  setTimeout(() => $("wp-auth-go").focus({ preventScroll: true }), 60);
}
function closeAuth() { auth.hidden = true; frozen = false; P.authSeen = true; save(); paintAcct(); if (!P.char) openMake(); else { setAvatar(P.char); tutorialStep(-1); maybeGuide(); } }
$("wp-auth-go").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = T("Check your wallet…");
  try { await signIn(); closeAuth(); refreshPurse(true); refreshCoins(); paintHud(); }
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
let pickChar = P.char || "arc-arc";
function openMake() {
  // the ARC Bots first (each with its name and role), then the classic characters
  const cell = (id) => { const ab = ARCBOT.arcbotOf(id), nm = ab ? `${ab.name} · ${T(ab.role)}` : id === "bot" ? "ARC Hover Bot" : id.replace("-", " "); return `<button type="button" role="radio" aria-checked="${id === pickChar}" data-c="${id}" title="${esc(nm)}">${ab || id === "bot" ? `<img src="/images/arcircle-mark-sm.png" alt="${esc(nm)}">` : `<img src="/models/world/chars/${id}.webp${VER}" alt="${esc(nm)}">`}${ab ? `<small>${esc(ab.name)}</small>` : ""}</button>`; };
  $("wp-make-grid").innerHTML = `<p class="wp-make-sec">${esc(T("ARC Bots"))}</p>` + K.CHARACTERS.filter((id) => id.startsWith("arc-")).map(cell).join("") + `<p class="wp-make-sec">${esc(T("Classic characters"))}</p>` + K.CHARACTERS.filter((id) => !id.startsWith("arc-")).map(cell).join("");
  $("wp-make-name").value = P.name || "";
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
        const c = await K.makeCharacter(id, VER).catch(() => null); if (!c) continue;
        // an ARC Bot's portrait is closer (its face is the point) and without the crown
        const crown = c.arc ? c.obj.getObjectByName("crown") : null; if (crown) crown.visible = false;
        if (c.arc) { cm.position.set(0.5, 1.5, 3.7); cm.lookAt(0, 1.2, 0); c.obj.rotation.y = 0.25; } else { cm.position.set(0, 1.5, 5.2); cm.lookAt(0, 1.15, 0); }
        sc.add(c.obj); c.mixer.update(0.5); r.render(sc, cm);
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
  setAvatar(pickChar).then(() => avatar && avatar.play("emote-yes", { once: true }));
});
$("wp-make-go").addEventListener("click", () => {
  P.char = pickChar;
  let nm = ($("wp-make-name").value || "").replace(/[<>"'`\\]/g, "").trim().slice(0, 16) || W("Player");
  // with a wallet: the first name change is free, later ones need a Name change from the ARCL Shop (the server checks too)
  const o = arclShop.own();
  if (P.name && nm !== P.name && sess() && o && o.freeRename && (o.renames || 0) <= (o.renamesUsed || 0)) { toast(T("Changing your name again needs a Name change from the ARCL Shop")); nm = P.name; }
  P.name = nm; save();
  setNameTag(); make.hidden = true; frozen = false; camYaw = facing - Math.PI; paintQuests(); tutorialStep(-1); maybeGuide();
});
const setEl = $("wp-setsheet");
function openSet() {
  setEl.querySelectorAll("#wp-set-q button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === (S.quality === "high" ? "ultra" : S.quality))));
  $("wp-set-fps").setAttribute("aria-pressed", String(!!S.fps)); $("wp-set-fps").textContent = S.fps ? T("On") : T("Show");
  setEl.querySelectorAll("#wp-set-lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === LANG)));
  $("wp-set-q-note").textContent = qNote(S.quality === "high" ? "ultra" : S.quality);
  $("wp-set-snd").checked = !!S.sound; $("wp-set-sens").value = S.sens; $("wp-set-motion").checked = S.motion === "less"; $("wp-set-showname").checked = S.showName !== false;
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
  return T({ auto: "Picked for your device: phones get the Medium picture at 1.5× pixels, computers Ultra, and it eases off if frames drop.",
    low: "The lightest: no grass, no picture effects, fewer particles.", medium: "Smooth edges, ink outlines, fog and colour grading, grass (less on phones).",
    ultra: "Everything: soft shade in corners, sun shafts, the fountain's reflection, outlines on characters, the most grass.",
    saver: "Half the frames and 1× pixels, no bloom or shadows: for a long session on battery." }[q] || "");
}
// the frame rate in a corner (Settings → Frame rate): for checking a preset on your own phone
$("wp-set-fps").addEventListener("click", () => { S.fps = !S.fps; saveSet(); $("wp-set-fps").setAttribute("aria-pressed", String(S.fps)); $("wp-set-fps").textContent = S.fps ? T("On") : T("Show"); $("wp-fps").hidden = !S.fps; });
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
    <ul class="wp-guide-legend">${li([W("Drag")], "Look around", U)}${li([W("Wheel")], "Zoom in and out", U)}${li([W("Click")], "Building: place a brick", A)}${li([T("Right-click")], "Building: remove a brick", B)}</ul></div>`;
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
function closeGuide() { if (guide.hidden) return; guide.hidden = true; frozen = false; if (!P.guideSeen) { P.guideSeen = true; save(); } setTimeout(() => arclShop.maybeDaily(), 600); }
guide.addEventListener("click", (e) => { const b = e.target.closest("[data-g]"); if (b) guideTab(b.dataset.g); if (e.target.id === "wp-guide-go" || e.target === guide) closeGuide(); });
// first time in: after the sign-in and the character maker
function maybeGuide() { if (!P.guideSeen && auth.hidden && make.hidden && guide.hidden) setTimeout(() => { if (!P.guideSeen && auth.hidden && make.hidden) openGuide(); }, 500); }

// phones: the compact (PC-style) layout or the large one; applied on reload (play.html sets the viewport)
const VP = (() => { try { return localStorage.getItem("arc.world.vp") || "pc"; } catch { return "pc"; } })();
if (coarse) { $("wp-set-vp-row").hidden = false; $("wp-set-vp").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vp === VP))); }
$("wp-set-guide").addEventListener("click", () => { closeSet(); openGuide(); });
$("wp-set-vp").addEventListener("click", (e) => { const b = e.target.closest("button[data-vp]"); if (!b || b.dataset.vp === VP) return; try { localStorage.setItem("arc.world.vp", b.dataset.vp); } catch { /* private */ } location.reload(); });
$("wp-set-snd").addEventListener("change", (e) => Snd.set(e.target.checked));
$("wp-set-music").value = String(S.music ?? 55);
$("wp-set-music").addEventListener("input", (e) => { S.music = Math.round(Number(e.target.value)); music.setVolume(musicVol()); });
$("wp-set-music").addEventListener("change", () => { saveSet(); music.start(); });
// vibration on a phone: a hit taken, a boss's strike, a charged attack, a bite on the line, a level up (off in Settings)
// only while you're playing: nothing buzzes when the phone just sits there (a scammer wandering up, a boss's miss)
let lastInput = 0; for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
const buzz = (ms) => { if (S.vib === false || reduce || !navigator.vibrate || performance.now() - lastInput > 4000 || document.hidden) return; try { navigator.vibrate(ms); } catch { /* not allowed */ } };
if (navigator.vibrate && matchMedia("(pointer: coarse)").matches) { $("wp-set-vibrow").hidden = false; $("wp-set-vib").checked = S.vib !== false; $("wp-set-vib").addEventListener("change", (e) => { S.vib = e.target.checked; saveSet(); if (S.vib) buzz(30); }); }
$("wp-set-showname").addEventListener("change", (e) => { S.showName = !!e.target.checked; saveSet(); });
$("wp-set-motion").addEventListener("change", (e) => { S.motion = e.target.checked ? "less" : ""; saveSet(); $("wp-set-q-note").innerHTML = `${esc(T("Applies after a reload."))} <button type="button" class="wp-link" id="wp-set-reload">${esc(T("Reload now"))}</button>`; });
$("wp-set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSet(); });
$("wp-set-char").addEventListener("click", () => { closeSet(); openMake(); });
let resetArm = 0;
$("wp-set-reset").addEventListener("click", (e) => {
  if (Date.now() - resetArm > 3000) { resetArm = Date.now(); e.currentTarget.textContent = T("Tap again to reset"); return; }
  try { localStorage.removeItem(SAVE); } catch { /* private */ } location.reload();
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
const NEWV = "b372";
function maybeNew() {
  try { if (localStorage.getItem("arc.world.newv") === NEWV) return; } catch { return; }
  if (!P.char || !P.guideSeen || new URLSearchParams(location.search).has("nointro")) return;
  setTimeout(() => { if (mode === "hub" && !frozen) openNew(); }, 1500);
}
function openNew() {
  const items = [
    ["grounds", T("Hunting grounds with their own world"), T("Snow, sand, bubbles, embers and stars; bosses that warn, then rage at half HP. Open the map's ring.")],
    ["charge", T("Charged attacks"), T("Hold attack, let go when the ring is full: a whirlwind, a quake, a beam, a piercing arrow or a field.")],
    ["bench", T("Temper, mastery, pond fish"), T("Temper your weapon with what you gather; each far ground has a pond and a fish of its own.")],
    ["jet", T("A jetpack at level 30"), T("V switches ride: hoverboard, rover, jetpack. Space climbs or comes down.")],
    ["party", T("A hunting party"), T("Add up to three friends on their card: their HP and where they are, and +15% XP together.")],
    ["records", T("Weekly records"), T("The biggest fish and the fastest boss knock-outs, in Rankings. Honour only.")],
    ["codex", T("Seven new codex pages"), T("The far ring's bosses, each a scam people still fall for, with how to beat it.")],
  ];
  const el = document.createElement("div"); el.className = "wp-new"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  el.innerHTML = `<div class="wp-new-card"><small>${esc(W("Update"))}</small><h2>${esc(T("What's new in ARCIRCLE World"))}</h2><ul>${items.map(([k, t, l]) => `<li><button type="button" data-new="${k}"><b>${esc(t)}</b><span>${esc(l)}</span><i aria-hidden="true">›</i></button></li>`).join("")}</ul><button type="button" class="wp-cta" data-new="close">${esc(T("Let's play"))}</button></div>`;
  document.body.appendChild(el); frozen = true; keys.clear(); paintPrompt();
  const done = () => { el.remove(); frozen = false; try { localStorage.setItem("arc.world.newv", NEWV); } catch { /* private */ } };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-new]"); if (!b && e.target !== el) return; done(); const k = b ? b.dataset.new : "close";
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
    else if (k === "isles") island.openIsles();
  });
}
// ---------------- closing things ----------------
function closeAll() { closeHub(); closeSheet(); closeMap(); endFight(); closeSet(); closeGuide(); island.closeSheets(); arclShop.close(); try { help.close(); closeLeave(); rpg && rpg.hide(); } catch { /* not built yet */ } $("wp-shot").hidden = true; }
// ---------------- the Help Center (world-support.js): ARCIA first, then a report on the public board ----------------
const help = HELP.createSupport({
  T, lang: LANG, esc, toast, where: mode === "island" ? "island" : "game",
  provider: async () => { if (AC && (!AC.live || !AC.live())) await AC.connect(); return AC ? AC.provider() : window.ethereum; }, address: () => addr(),
  capture: () => st.snap(), freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
});
function openHelp(t) { closeAll(); help.open(t); }
// ---------------- fighting (world-combat.js): street scammers, the attack, skills learned by level, street items ----------------
// floating numbers: a hit's damage rises from where it landed; quick hits in the same spot add up into one number
// that bumps as it grows (a flurry reads as one total, not a pile of digits)
const floats = [];
const flt = (text, pos, color, big, weight = 0) => {
  const v = pos.clone(); planet.localToWorld(v); v.project(st.camera); if (v.z > 1) return;
  const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, now = performance.now(), num = /^!?\d+$/.test(String(text)) ? Number(String(text).replace("!", "")) : null;
  for (let i = floats.length - 1; i >= 0; i--) if (!floats[i].el.isConnected || now - floats[i].t > 900) floats.splice(i, 1);
  if (num != null) { const f = floats.find((o) => now - o.t < 420 && Math.hypot(o.x - x, o.y - y) < 70 && o.color === color);
    if (f) { f.n += num; f.t = now; f.el.textContent = (big || f.big ? "!" : "") + f.n; if (big && !f.big) { f.big = true; f.el.classList.add("crit"); } f.el.classList.remove("bump"); void f.el.offsetWidth; f.el.classList.add("bump"); clearTimeout(f.k); f.k = setTimeout(() => f.el.remove(), 950); return; } }
  const el = document.createElement("div"); el.className = "wp-float-n" + (big ? " crit" : ""); el.textContent = text; el.style.color = color || "#fff";
  if (num != null) { const f = { el, n: num, t: now, x, y, color, big: !!big }; floats.push(f); f.k = setTimeout(() => el.remove(), 950); }
  el.style.left = ((v.x + 1) / 2 * innerWidth) + "px"; el.style.top = ((1 - v.y) / 2 * innerHeight) + "px";
  if (weight > 0) el.style.setProperty("--fs", (1 + Math.min(1, weight * 3) * 0.75).toFixed(2)); // a bigger share of the scammer's HP, a bigger number
  document.body.appendChild(el); if (num == null) setTimeout(() => el.remove(), 950);
};
rpg = RPG.createRpg({
  THREE, T, lang: LANG, esc, toast, P, save: () => save(), level, post, sess, Snd, reduce, scene: () => st.scene,
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); }, avatar: () => avatar,
  extraStats: () => (quests ? quests.titleBonus() : null),
  titleLine: () => { const b = quests && quests.titleBonus(), t = quests && quests.title(); return t ? `<p class="wr-title-b">${esc(W("Title"))}: <b>${esc(t)}</b>${b ? ` <small>${esc(RPG.bonusLine(b))}</small>` : ""}</p>` : ""; },
  buyBag: (onStatus) => arclShop.pay("bagplus", "", onStatus),
  openCraft: (t, id) => { if (life) life.showSheet(t, id); }, onStats: () => { if (combat) combat.onGear(); }, onPots: () => { if (combat) combat.potsCheck(); }, onView: (v) => tutorialStep(v === "log" ? 5 : v === "inv" ? 4 : -1), onEnhance: (n) => quests && quests.on.enhance(n), recall: () => recallHome(), gearModel: (slot, tier, color, glow) => (decor ? decor.gear(slot, tier, color, glow) : null), openWardrobe: () => { rpg.hide(); wardrobe.show(); }, isArc: () => /^arc-/.test(P.char || "arc-arc"), arclFly: (n, from) => arclShop.fly && arclShop.fly(n, from), arclRefresh: () => arclShop.refresh(), arclBal: () => (arclShop.arcl() || {}).bal || 0,
});
rpg.dress();
// the GPU particles (world-particles.js): sparks, streaks, glow and smoke for the fights, in one or two draw calls
const parts = PART.createParticles({ THREE, parent: planet, low: lowGfx || st.quality.coarse });
st.on((dt) => parts.tick(dt));
combat = FIGHT.createCombat({ vfx, parts, wave: (p, power = 1) => { if (!fxPost || !fxPost.shock || reduce) return; const at = p.clone(); fxPost.shock((out) => out.copy(at).add(planet.position).setY(0.6), { power }); },
  THREE, K, planet, st, T, lang: LANG, esc, toast, Snd, reduce, coarse,
  kit: () => kit, here: (v) => here(v), facing: () => facing, avatar: () => avatar, level, hopY: () => hop, rpg, xp: () => P.xp, xpProg: () => RPG.xpProgress(P.xp),
  blocked: (v) => blockedAt(v),
  moveDir: (out) => { const { x, y, m } = inputs(); if (m < 0.1) return false; const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw); out.set(rx * x + fx * y, 0, rz * x + fz * y).normalize(); return true; },
  dash: (d, dist) => { knockV.copy(d).multiplyScalar(dist * 6); facing = Math.atan2(d.x, d.z); },
  onZone: (z) => { nightK = -1; dayNight(); if (quests) quests.on.zone(z); },
  onKill: (k) => { if (quests) quests.on.kill(k); tutorialStep(3); if (k.rank === "boss" && k.zone && rpg) { const d = rpg.data(); d.x = d.x || {}; d.x.bk = d.x.bk || {}; d.x.bk[k.zone] = Math.min(9999, (d.x.bk[k.zone] || 0) + 1); } }, /* the boss trophies on My Island */ onCast: () => quests && quests.on.skill(), onFetch: () => { if (pet && pet.id() === "cat") pet.emote(); }, petPull: () => (pet && pet.visible() ? pet.pull() : 0),
  xpBoost: (zid) => RPG.xpBoost(zid) * (partyNear() ? 1.15 : together() ? 1.1 : 1), inRaid: () => !!(raid && raid.inside()), raidHit: (n) => raid && raid.hit(n),
  onRaidDown: () => { if (raid) raid.load(); },
  onLoot: (it) => { if (quests) quests.on.loot(it); if (it.r >= 3) shareDrop(it); if (it.r >= 2) lootCard(it); },
  legend: () => { document.body.classList.remove("wc-legend"); void document.body.offsetWidth; document.body.classList.add("wc-legend"); setTimeout(() => document.body.classList.remove("wc-legend"), 1600); },
  inHub: () => mode === "hub" && !introOn, active: () => mode === "hub" && !frozen && !flying && !introOn && !photo,
  gain: (n, why) => gain(n, why), claim: (kind, extra, from) => arclClaimRepeat(kind, extra, from),
  knock: (d, p) => { knockV.copy(d).multiplyScalar(p); vy = Math.max(vy, 4); grounded = false; hitFrom.copy(d); hitAt = performance.now(); },
  hurt: () => { Snd.hurt(); shake = Math.max(shake, 0.25); const h = document.createElement("div"); h.className = "wp-hurt"; document.body.appendChild(h); setTimeout(() => h.remove(), 520); if (avatar && avatar.hurt) { /* rock away from the blow: forward if it came from behind, sideways from the side */ const fresh = performance.now() - hitAt < 200, f = facing; avatar.hurt(fresh ? hitFrom.x * Math.sin(f) + hitFrom.z * Math.cos(f) : -1, fresh ? hitFrom.x * Math.cos(f) - hitFrom.z * Math.sin(f) : 0); } else if (avatar && !boarding) avatar.play("emote-no", { once: true }); },
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
  onSwing: (p, f, heavy, hammer) => (life ? life.swingAt(p, f, heavy, hammer) : false), float: flt, hitstop: (ms) => hitstop(ms), kickCam: (d, k) => kickCam(d, k), shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, lite: () => liteFx, halloween: HW.halloweenOn(), slowmo: (ms) => slowmo(ms), punch: () => { if (!reduce) punch = 1; },
  pay: (id, onStatus) => arclShop.pay(id, "", onStatus), ko: (what) => arclShop.ko(what), signedIn: () => !!sess(),
  // knocked out: lie down and wait; back up on the spot (a revive) or on the plaza
  down: (on, where) => {
    if (on && boarding) setBoard(false);
    frozen = on; keys.clear(); paintPrompt();
    if (on) { if (avatar) avatar.play("die", { once: true }); return; }
    setTimeout(() => vfx.rise(here()), 60);
    if (where === "plaza") { const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); } planet.position.copy(HOME); hop = 0; vy = 0; grounded = true; facing = Math.PI; camYaw = 0; }
    if (avatar) avatar.play("idle");
  },
});
// the Adventure log (daily hunts, achievements and titles, the codex, top hunters) and the companion drone
quests = QST.createQuests({
  T, lang: LANG, esc, toast, P, Snd, rpg, save: () => save(), level, gain: (n, why) => gain(n, why), fishList: LIFE.FISH,
  // Rankings → Players: portraits, who's around now, a player's card
  charThumb: (id) => thumbCache[id] || "", needThumbs: (ids) => renderThumbsFor(ids).then(() => rpg.isOpen() && rpg.repaint()),
  online: () => (ghosts && ghosts.named ? ghosts.named() : []), openProfile: (w) => openProfile(w),
  dailyDone: () => arclShop.dailyDone(), openDaily: () => { rpg.hide(); arclShop.openDaily(); }, signedIn: () => !!sess(),
  repaint: () => rpg.repaint(), onTitle: () => setNameTag(),
  onAch: () => { setNameTag(); if (pet) pet.set(quests.pet()); paintBagDot(); },
  onPet: () => { if (pet) pet.set(quests.pet()); },
  petThumb: (id) => (pet && pet.portraits ? pet.portraits()[id] || "" : ""),
  shareCard: (o) => shareCard(o),
});
rpg.setLog(quests);
pet = QST.createPet({ THREE, K, planet, here: (v) => here(v), facing: () => facing, combat, reduce });
pet.set(quests.pet()); setNameTag();
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
ghosts = SOC.createGhosts({ THREE, K, planet, T: (s, v) => (s === "Hi!" || s === "Friend" ? W(s) : T(s, v)), here: (v) => here(v), inHub: () => mode === "hub" && !introOn, myTag,
  isPal: (x) => (P.pal && x.t === P.pal) || x.p === myTag, sayText: (i) => (SAY[i] ? (SAY[i].includes(" ") || SAY[i].length > 4 ? T(SAY[i]) : W(SAY[i])) : ""),
  onPal: (on) => { const c = $("wp-together"); if (c) c.hidden = !on; } });
// ---------------- the inbox: gifts, new stamps, friends playing now ----------------
// stand next to someone in town (a friend from the inbox, a player's card): a short hop, facing them
function goNear(x, z) {
  if (mode !== "hub" || frozen) { toast(T("You can go there from the town")); return; }
  const a = Math.atan2(-x, -z) || 0, sx = x + Math.sin(a) * 1.8, sz = z + Math.cos(a) * 1.8;
  const veil = $("wp-veil"); if (veil && !reduce) { veil.style.opacity = "1"; setTimeout(() => { veil.style.opacity = "0"; }, 380); }
  planet.position.set(-sx, 0, -sz); hop = 0; vy = 0; grounded = true; facing = Math.atan2(x - sx, z - sz); camYaw = facing - Math.PI;
  Snd.dash && Snd.dash();
}
const inbox = INBOX.createInbox({ T: TW, esc, post, sess, toast, Snd, rpg: () => rpg, island, ghosts: () => ghosts, goIsland: (o) => goIsland(o), goNear,
  openProfile: (w) => openProfile(w), inHub: () => mode === "hub", bookNew: () => island.bookNew(), save: () => save(), onPots: () => combat && combat.potsCheck() });
// ---------------- set dressing from the free model packs (world-decor.js) ----------------
decor = DECOR.createDecor({ THREE, K, planet, blocked: (v) => blockedAt(v), shops, zones: RPG.ZONES, ver: VER, low: S.quality === "low" || S.quality === "saver", lite: S.quality === "medium" || matchMedia("(pointer: coarse)").matches, reduce, here: (v) => here(v), onWeapons: () => rpg && rpg.dress(), avoid: () => (race ? [[race.pad.position.x, race.pad.position.z, 3.2], ...race.points().map(([x, z]) => [x, z, 2.6])] : []) });
st.on((dt) => decor.tick(dt));
st.on((dt) => { if (rpg && rpg.tickSwing) rpg.tickSwing(dt); });
// gathering, the workbench and fishing (world-life.js)
const life = LIFE.createLife({ THREE, planet, T: TW, esc, toast, Snd, onCatch: (f, cm) => { if (avatar && avatar.face) avatar.face("wow", 1.6); if (quests) quests.on.fish(); const s = sess(); if (!s || !f) return; const wk = Math.floor((Date.now() - Date.UTC(1970, 0, 5)) / 6048e5); let b = {}; try { b = JSON.parse(localStorage.getItem("arc.world.fishwk") || "{}"); } catch { /* private */ } if (b.wk === wk && b.cm >= cm) return; try { localStorage.setItem("arc.world.fishwk", JSON.stringify({ wk, cm })); } catch { /* private */ } post({ action: "world-fish", ...s, fish: f.id, cm }).catch(() => {}); }, /* this week's biggest catch goes to the board */ buzz: (ms) => buzz(ms), hint: (id) => hint(id, id === "gather" ? tapOr(T("Press G to gather it: any attack works too"), T("Tap Gather to collect it: any attack works too")) : tapOr(T("Press G to cast, then again when the mark is in the green"), T("Tap Fish to cast, then Reel in when the mark is in the green"))), onStats: () => { if (combat) combat.onGear(); }, rpg: () => rpg, here: (v) => here(v), blocked: (v) => blockedAt(v), zones: RPG.ZONES, inHub: () => mode === "hub", save: () => save(), vfx, low: S.quality === "low" || S.quality === "saver", float: flt, hitstop: (ms) => hitstop(ms), kickCam: (d, k) => kickCam(d, k), shake: (n) => { if (!reduce) shake = Math.max(shake, n); }, onPots: () => { if (combat) combat.potsCheck(); } });
// water (world-env.js): foam round the edge, caustics on the floor, the sky at a glance (the fountain and the far ponds)
const waterMats = [], reflHide = [parts.glowMesh, parts.smokeMesh], reflU = [];
if (!lowGfx) {
  const pools = []; fountain.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === "CircleGeometry" && o.material && o.material.transparent) { const m = ENV.waterMat({ r: o.geometry.parameters.radius, color: 0x38c8ff, deep: 0x0a5a8a, glow: 0.22, opacity: 0.86 }); o.material = m; waterMats.push(m); pools.push(o); } });
  // on Ultra the big pool reflects the plaza (redrawn every other frame, without the grass and the particles)
  if (postLevel === "ultra" && !st.quality.coarse && pools.length) { const big = pools.reduce((a, b) => (a.geometry.parameters.radius > b.geometry.parameters.radius ? a : b));
    import("./vendor/three/addons/Reflector.js").then(({ Reflector }) => { const rm = ENV.reflectPool(Reflector, big, st.renderer, reflHide, () => frameNo); reflU.push(rm.material.uniforms); }).catch(() => {}); }
  planet.getObjectByName("life").children.forEach((g) => { if (!/^pond:/.test(g.name)) return; const w = g.children[0]; if (!w || !w.isMesh || !w.material.color) return;
    const hot = g.name === "pond:abyss", c = w.material.color.getHex();
    const m = ENV.waterMat({ r: w.geometry.parameters.radius, color: c, deep: new THREE.Color(c).multiplyScalar(0.4).getHex(), foam: hot ? 0xffd080 : 0xeaffff, glow: hot ? 0.9 : 0.12, opacity: 0.92 });
    m.polygonOffset = true; m.polygonOffsetFactor = -4; w.material = m; waterMats.push(m); });
  st.on((dt) => { for (const m of waterMats) m.uniforms.uTime.value += dt; for (const u of reflU) u.uTime.value += dt; });
}
// the meadow (world-env.js): blades round you that sway and lie down where you walk (none on Low / Saver). Built once
// the town is up (the mask is painted from what stands on the ground) and repainted once more when the coin city is in
let grass = null, gmask = null;
function makeMeadow() {
  if (lowGfx || grass) return;
  gmask = farCull.all(() => ENV.grassMask({ planet, zones: RPG.ZONES, clear: [{ x: 0, z: 0, r: K.flatR(11) + 0.8 }], paths: WORN_PATHS }));
  const big = S.quality === "ultra" || S.quality === "high" || (S.quality === "auto" && !st.quality.coarse);
  grass = ENV.makeGrass({ count: big ? 60000 : st.quality.coarse ? 16000 : 32000, size: big ? 50 : st.quality.coarse ? 36 : 44, mask: gmask, gshadow });
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
async function openProfile(w) {
  if (!/^0x[0-9a-f]{40}$/.test(String(w || ""))) return;
  document.querySelectorAll(".wp-prof").forEach((x) => x.remove());
  const dir = (quests.dir() || {}).list || [], row = dir.find((r) => r.w === w) || {}, el = document.createElement("div");
  el.className = "wp-prof"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  const paint = (fr) => {
    const name = row.name || (fr && fr.name) || w.slice(0, 6) + "…" + w.slice(-4), lv = row.lv || (fr && fr.lv) || 1, char = row.char || (fr && fr.char) || "", me = sess() && sess().wallet === w;
    const isFr = island.isFriend(w), ago = row.at ? Math.floor((Date.now() - row.at) / 60000) : null;
    el.innerHTML = `<div class="wp-prof-card"><button type="button" class="wp-btn wp-x" data-px aria-label="${esc(T("Close"))}">×</button>
      <div class="wp-prof-face">${thumbCache[char] ? `<img src="${thumbCache[char]}" alt="">` : ""}<b>${lv}</b></div>
      <h2>${esc(name)}</h2>${quests.titleOf(row.t) ? `<p class="wp-prof-title">${esc(quests.titleOf(row.t))}</p>` : ""}
      <dl><div><dt>${esc(W("Level"))}</dt><dd>${lv}</dd></div><div><dt>${esc(T("Codex pages"))}</dt><dd>${row.cx || 0} / ${QST.CODEX.length + QST.CODEX_STORY.length}</dd></div><div><dt>${esc(T("Island"))}</dt><dd>${fr && fr.isle ? esc(T("{n} bricks", { n: fr.isle })) + " · ♥ " + (fr.likes || 0) : "—"}</dd></div><div><dt>${esc(T("Last seen"))}</dt><dd>${ago == null ? "—" : ago < 15 ? esc(T("just now")) : ago < 60 ? esc(T("{n} min ago", { n: ago })) : ago < 1440 ? esc(T("{n} h ago", { n: Math.floor(ago / 60) })) : ago < 2880 ? esc(T("yesterday")) : esc(T("{n} days ago", { n: Math.floor(ago / 1440) }))}</dd></div></dl>
      <div class="wp-prof-acts">${fr && fr.isle ? `<button type="button" class="wp-cta" data-pvisit>${esc(T("Visit their island"))}</button>` : ""}${me ? "" : `<button type="button" class="wp-btn" data-pfriend aria-pressed="${isFr}">${esc(isFr ? W("Friend") : T("Add friend"))}</button>`}${me || !isFr ? "" : `<button type="button" class="wp-btn" data-pparty aria-pressed="${inParty(w)}">${esc(inParty(w) ? T("In your party") : T("Add to party"))}</button>`}${!me && mode === "hub" && ghosts && ghosts.named().some((g) => g.wallet === w) ? `<button type="button" class="wp-btn" data-pgo>${esc(T("Go there"))}</button>` : ""}</div>
      ${me || !sess() ? "" : `<div class="wp-prof-gift"><span>${esc(T("Send a gift"))}</span>${inbox.sendOptions().map((g) => `<button type="button" class="wp-btn" data-pgift="${g.kind}:${g.n}" ${g.can ? "" : "disabled"}>${esc(g.label)}</button>`).join("")}</div>`}</div>`;
    if (char && !thumbCache[char]) renderThumbsFor([char]).then(() => { if (el.isConnected) paint(fr); });
  };
  paint(null); document.body.appendChild(el); frozen = true; keys.clear();
  // Escape closes the card first (the Adventure log under it stays open)
  const onKey = (e) => { if (e.key === "Escape" && el.isConnected) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  const close = () => { el.remove(); removeEventListener("keydown", onKey, true); frozen = !!(rpg && rpg.isOpen()); };
  addEventListener("keydown", onKey, true);
  let fr = null; try { const r = await fetch("/api/social?world=friends&wallets=" + w); fr = r.ok ? ((await r.json()).friends || {})[w] || null : null; } catch { /* the card stays as it is */ } if (el.isConnected) paint(fr);
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-px]")) { close(); return; }
    if (e.target.closest("[data-pvisit]")) { close(); rpg.hide(); goIsland({ visit: w }); return; }
    if (e.target.closest("[data-pgo]")) { const g = ghosts && ghosts.named().find((x) => x.wallet === w); if (g) { close(); rpg.hide(); goNear(g.x, g.z); } return; }
    const gb = e.target.closest("[data-pgift]"); if (gb) { const [k, n] = gb.dataset.pgift.split(":"); gb.disabled = true; inbox.send(w, k, Number(n)).then(() => { if (el.isConnected) paint(fr); }); return; }
    if (e.target.closest("[data-pfriend]")) { island.toggleFriend(w, row.name || (fr && fr.name) || ""); if (!island.isFriend(w) && inParty(w)) partyToggle(w); paint(fr); }
    if (e.target.closest("[data-pparty]")) { partyToggle(w); paint(fr); }
  });
}
// a card to share (an achievement): the photo sheet shows it with save / share / post
async function shareCard(o) {
  const blob = await SOC.drawCard({ ...o, name: P.name || W("Player"), lv: level() }); if (!blob) return;
  rpg.hide(); showShot(blob, o.title ? T("{x} in ARCIRCLE World ♾", { x: o.title }) : "");
}
function paintBagDot() { const b = $("wp-bag-btn"); if (b) b.dataset.dot = quests.pending() ? String(quests.pending()) : ""; }
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
    for (const d of list.slice(-3)) { const rr = RPG.RARITY[d.r] || RPG.RARITY[3]; feed(T("{who} found {x}", { who: `<b>${esc(d.name || d.w)}</b>`, x: `<b style="color:${rr.color}">${esc(RPG.itemName({ b: d.b, p: 0 }))}</b>` }), rr.color); }
    if (list.length) dropsSeen = list[list.length - 1].at;
  } catch { /* the feed waits */ }
}
setInterval(refreshDrops, 60000); setTimeout(refreshDrops, 8000);
// repeatable ARCL (street fights, coins): the server keeps the daily limit and the gap between claims
function arclClaimRepeat(kind, extra, from) { arclShop.claim(kind, extra, from); }
$("wp-help-btn").addEventListener("click", () => openHelp());
// the menu: everything in one place, a tap away (the ≡ button on every screen, or Esc with nothing open).
// Grouped by what you're doing; each tile names its key; a dot marks something waiting (rewards, mail).
const HUB = [
  ["You", [["inv", "bag", "Character and bag", "I"], ["wardrobe", "shirt", "Wardrobe", ""], ["make", "person", "Change character", ""]]],
  ["Adventure", [["daily", "check", "Daily hunts", "L"], ["ach", "trophy", "Achievements", ""], ["season", "season", "Season", ""], ["codex", "codex", "Codex", ""], ["pets", "paw", "Pets", ""], ["rank", "chart", "Rankings", ""]]],
  ["Town", [["shop", "shop", "ARCL Shop", ""], ["forge", "anvil", "Forge", ""], ["bench", "wrench", "Workbench", ""], ["map", "map", "Map", "M"], ["island", "island", "My Island", ""], ["inbox", "mail", "Inbox", ""]]],
  ["More", [["photo", "photo", "Photo mode", "P"], ["emote", "wave", "Emotes", ""], ["guide", "keys", "Controls", ""], ["help", "help", "Help Center", "H"], ["set", "gear", "Settings", ""]]],
];
hubEl = document.createElement("div"); hubEl.className = "wp-hub"; hubEl.hidden = true; hubEl.setAttribute("role", "dialog"); hubEl.setAttribute("aria-modal", "true"); hubEl.setAttribute("data-no-i18n", "");
document.body.appendChild(hubEl);
function paintHub() {
  const isArc = String(P.char || "arc-arc").startsWith("arc-"), dot = { daily: quests && quests.pending ? quests.pending() > 0 : false, inbox: !!document.querySelector('.wp-hud [data-dot]:not([data-dot=""])') };
  hubEl.innerHTML = `<div class="wp-hub-card"><div class="wp-hub-h"><h2>${esc(T("Menu"))}</h2><button type="button" class="wp-hub-x" data-hub-x aria-label="${esc(T("Close"))}">${ICONS.icon("no", 20)}</button></div>` +
    HUB.map(([g, items]) => `<section><h3>${esc(T(g))}</h3><div class="wp-hub-grid">${items.filter(([id]) => id !== "wardrobe" || isArc).filter(([id]) => id !== "island" || mode === "hub").map(([id, ic, label, key]) =>
      `<button type="button" data-hub="${id}">${ICONS.icon(ic, 26)}<span>${esc(T(label))}</span>${key && !coarse ? `<kbd>${key}</kbd>` : ""}${dot[id] ? '<i class="wp-hub-dot" aria-label="new"></i>' : ""}</button>`).join("")}</div></section>`).join("") + `</div>`;
}
function openHub() { if (frozen && hubEl.hidden) return; closeAll(); paintHub(); hubEl.hidden = false; frozen = true; keys.clear(); paintPrompt(); const f = hubEl.querySelector("[data-hub]"); if (f && !coarse) f.focus(); }
function closeHub() { if (!hubEl || hubEl.hidden) return; if (hubEl.contains(document.activeElement)) document.activeElement.blur(); /* a hidden tile keeps no focus (it would swallow the next Esc) */ hubEl.hidden = true; frozen = false; }
hubEl.addEventListener("click", (e) => {
  if (e.target === hubEl || e.target.closest("[data-hub-x]")) { closeHub(); return; }
  const b = e.target.closest("[data-hub]"); if (!b) return; const id = b.dataset.hub; closeHub();
  if (id === "inv") rpg && rpg.show("inv");
  else if (id === "wardrobe") wardrobe.show();
  else if (id === "make") openMake();
  else if (["daily", "ach", "season", "codex", "pets", "rank"].includes(id)) { if (quests && rpg) { quests.setTab(id); rpg.show("log"); } }
  else if (id === "shop") arclShop.openShop();
  else if (id === "forge") rpg && rpg.show("forge");
  else if (id === "bench") { if (life) life.showSheet("make"); }
  else if (id === "map") openMap();
  else if (id === "island") goIsland({});
  else if (id === "inbox") inbox.show();
  else if (id === "photo") setPhoto(true);
  else if (id === "emote") openWheel();
  else if (id === "guide") openGuide();
  else if (id === "help") openHelp();
  else if (id === "set") $("wp-set-btn").click();
});
hubEl.addEventListener("keydown", (e) => { if (e.key === "Escape" && !hubEl.hidden) { e.stopPropagation(); closeHub(); } });
$("wp-more-btn").addEventListener("click", (e) => { e.stopPropagation(); if (hubEl.hidden) openHub(); else closeHub(); });
$("wp-shop-btn").addEventListener("click", () => { closeAll(); arclShop.openShop(); });
$("wp-bag-btn").addEventListener("click", () => { closeAll(); if (rpg) rpg.show("inv"); });

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
  if (e.target.id === "wp-leave-go") { leaving = true; cloudSave(); history.go(-2); setTimeout(() => { location.href = "/"; }, 500); }
});
guard();
$("wp-set-help").addEventListener("click", () => openHelp());
if (coarse) $("wp-keys").hidden = true; else $("wp-acts").hidden = true;

// ---------------- day and night (Seoul time) ----------------
// a blue day sky over the ground, stars and the far planets at night (?hour=21 tries another hour)
const skyU = sky.material.uniforms, DAY = { top: new THREE.Color(0x2a66c4), mid: new THREE.Color(0x76b0e4), glow: new THREE.Color(0xd2e8f0) }, NIGHT = { top: new THREE.Color(0x02030a), mid: new THREE.Color(0x07102a), glow: new THREE.Color(0x173452) }, DUSK = new THREE.Color(0xf0a070);
const HALLOW_FOG = new THREE.Color(0x2a1840); // Halloween nights: a violet fog
const FOG = { day: new THREE.Color(0xb4d4e4), night: new THREE.Color(0x0b1830), dusk: new THREE.Color(0xd99a80) };
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
  const id = zz ? zz.id : "", col = new THREE.Color(0xdfe8f0).lerp(new THREE.Color(0x1a2440), k).lerp(new THREE.Color(0xf0c8a0), dusk);
  if (zz) col.lerp(new THREE.Color(zz.fog), 0.6);
  return { fog: 0.0015 + dusk * 0.012 + k * 0.004 + (AIR_FOG[id] || 0), color: col, rays: (1 - k) * (0.25 + dusk * 0.6) * (/^(abyss|void|depths)$/.test(id) ? 0.3 : 1), heat: id === "abyss" ? 1 : 0, sunColor: st.sun.color };
}
const CLOUD = { night: new THREE.Color(0x3a4660), dusk: new THREE.Color(0xffc8a0), shade: new THREE.Color(0xa8b8cc), nshade: new THREE.Color(0x141a2a), dshade: new THREE.Color(0xc87a7a) };
function dayNight() {
  const d = new Date(Date.now() + 9 * 3600e3);
  const h = photoHour != null ? photoHour : Number.isFinite(hourParam) && new URLSearchParams(location.search).has("hour") ? hourParam : d.getUTCHours() + d.getUTCMinutes() / 60;
  const k = h >= 20 || h < 5 ? 1 : h >= 17 ? (h - 17) / 3 : h < 7 ? 1 - (h - 5) / 2 : 0;
  if (Math.abs(k - nightK) < 0.01) return; nightK = k;
  setTimeout(() => skyEnv(k), 0);
  const dusk = Math.max(0, 1 - Math.abs(k - 0.5) * 2.4);
  if (grade) grade.set(k, dusk);
  if (fxPost) { const zz = mode === "hub" && combat ? combat.zone() : null; if (lgrade.set(k, dusk, zz && zz.id)) fxPost.setLut(lgrade.tex()); fxPost.setAir(airFor(k, dusk, zz)); }
  ["top", "mid"].forEach((n) => skyU[n].value.copy(DAY[n]).lerp(NIGHT[n], k));
  skyU.glow.value.copy(DAY.glow).lerp(NIGHT.glow, k).lerp(DUSK, dusk * 0.7);
  st.sun.intensity = 2.15 * (1 - k * 0.62); st.sun.color.setHSL(0.09, 0.35 * (1 - k) + dusk * 0.6, 0.97 - dusk * 0.12); // a warm afternoon sun
  st.hemi.intensity = 0.95 * (1 - k * 0.4); st.scene.environmentIntensity = 0.42 + k * 0.25; st.renderer.toneMappingExposure = 0.8 + k * 0.22; /* a calmer day: the white plaza was glaring */
  if (st.scene.fog) st.scene.fog.density = 0.0028 + k * 0.0028; ENV.CLOUD.k.value = Math.max(0, 1 - k * 1.4) * ((() => { try { return mood === "rain"; } catch { return false; } })() ? 1.4 : 1); /* cloud shadows by day, more on a rainy one */ st.hemi.color.set(k > 0.5 ? 0x9fd0ff : 0xcfe8ff); lamps.userData.night(k); if (K.arcNight) K.arcNight(k);
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
    u.uCloudLit.value.setRGB(1, 1, 1).lerp(CLOUD.night, k).lerp(CLOUD.dusk, dusk * 0.8); u.uCloudShade.value.copy(CLOUD.shade).lerp(CLOUD.nshade, k).lerp(CLOUD.dshade, dusk * 0.6);
    u.uSunCol.value.copy(st.sun.color); u.uCloudK.value = 1 - k * 0.7; u.uNight.value = th && th.dark ? 1 : k; u.uCover.value = mood === "rain" ? 0.3 : 0.48;
    if (th && th.cloud != null) { u.uCloudLit.value.set(th.cloud); u.uCloudShade.value.set(th.cloud).multiplyScalar(0.6); } } }
  ambNight = th && th.dark ? 1 : k;
  if (K.TOON) { K.TOON.rimK.value = 0.5 - k * 0.15 + dusk * 0.2; K.TOON.rim.value.set(0x9fd8ff).lerp(new THREE.Color(0x7a8cff), k).lerp(new THREE.Color(0xffb37a), dusk * 0.7); } // the characters' rim light
  if (grass && lamps.userData.spots) grass.setLamps(lamps.userData.spots, th && th.dark ? 1 : k);
  if (grass) grass.setLight((th && th.dark ? 0.3 : 1 - k * 0.7) * (wet ? 0.82 : 1), k > 0.5 ? 0x5a9a8a : 0x7cc65a);
  for (const u of reflU) u.uLight.value = 1 - k * 0.55;
  for (const m of waterMats) { m.uniforms.uLight.value = 1 - k * 0.6; m.uniforms.uSky.value.copy(skyU.mid.value).lerp(skyU.glow.value, 0.3); }
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
  const lists = mode === "island" ? [] : [shops, town, coinBuildings, arches];
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
  camFit = THREE.MathUtils.lerp(camFit, 1, 0.08);
}

// ---------------- frame rate watch: drop quality once if the device can't keep up ----------------
let fpsAcc = 0, fpsN = 0, fpsT0 = performance.now(), degraded = false, liteFx = false;
// dynamic resolution (Auto). A change resizes every render target, which is itself a hitch, so it changes rarely:
// down a step after two slow 4-second spells in a row (under 38 fps), back up only after 20 s of 58+, and never
// within 20 s of the last change (at most twice up a session, so it can't see-saw)
let dynK = 1, dynAcc = 0, dynN = 0, dynT0 = performance.now(), dynGood = 0, dynBad = 0, dynLast = 0, dynUps = 0;
function dynRes(dt) {
  if (S.quality !== "auto" || degraded || photo || navigator.webdriver || !st.scale) return;
  dynAcc += dt; dynN++; if (performance.now() - dynT0 < 4000 || dynAcc < 1.5) return;
  const fps = dynN / dynAcc, now = performance.now(); dynAcc = 0; dynN = 0; dynT0 = now;
  dynBad = fps < 38 ? dynBad + 1 : 0; dynGood = fps > 58 ? dynGood + 1 : 0;
  if (now - dynLast < 20000) return;
  if (dynBad >= 2 && dynK > 0.6) { dynK = Math.max(0.6, dynK - 0.15); dynBad = 0; dynLast = now; st.scale(dynK); }
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
    if (fpsN / fpsAcc < 26 && !(st.lighter && st.lighter()) && !(st.softer && st.softer())) { degraded = true; st.degrade(); toast(T("Graphics lowered to keep things smooth")); }
    fpsAcc = 0; fpsN = 0; fpsT0 = performance.now();
  }
}

// ---------------- the loop ----------------
const cam = st.camera;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), base = new THREE.Vector3();
let animState = "", npcT = 0, introOn = false, landUntil = 0, hoverT = 0, idleT = 0, idleNext = 7;
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
const slowmo = (ms = 170) => { if (reduce) return; slowUntil = Math.max(slowUntil, performance.now() + ms); document.body.classList.remove("wc-crit"); void document.body.offsetWidth; document.body.classList.add("wc-crit"); };
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
    const turn = angLerp(0, facing - (avatar.lastFacing ?? facing), 1) / Math.max(dt, 1e-3); avatar.lastFacing = facing;
    const inner = avatar.obj.children[0];
    if (avatar.lean) avatar.lean(grounded && !boarding ? Math.min(1, speedNow / 12.5) * 0.16 : 0, THREE.MathUtils.clamp(-turn * 0.04, -0.22, 0.22) * Math.min(1, speedNow / 6)); // the ARC Bot leans in its own pose
    else if (inner && !avatar.bot) { inner.rotation.x = THREE.MathUtils.lerp(inner.rotation.x, grounded && !boarding ? Math.min(1, speedNow / 12.5) * 0.16 : 0, 0.15); inner.rotation.z = THREE.MathUtils.lerp(inner.rotation.z, THREE.MathUtils.clamp(-turn * 0.04, -0.22, 0.22) * Math.min(1, speedNow / 6), 0.12); }
    if (speedNow > 1 && !wheel.hidden) wheel.hidden = true;
    speedLines.style.opacity = String(THREE.MathUtils.clamp((speedNow - 13) / 8, 0, 0.9));
    // standing still for a while: a look round, now and then
    const still = grounded && !boarding && speedNow < 0.3 && !frozen && !document.body.classList.contains("wc-fight");
    idleT = still ? idleT + dt : 0; let lookOff = 0;
    if (idleT > idleNext) { const k = (idleT - idleNext) / 3.4; if (k >= 1) { idleT = 0; idleNext = 8 + Math.random() * 7; } else if (!reduce) lookOff = Math.sin(k * Math.PI * 2) * Math.sin(k * Math.PI) * 0.55; }
    avatar.obj.rotation.y = facing + lookOff;
    if (avatar.bot) avatar.update(dt, t, Math.min(1, speedNow / 8), 0);
    else {
      avatar.update(dt, t);
      const want = boarding ? "idle" : !grounded ? (vy > 0 ? "jump" : "fall") : speedNow > 9 ? "sprint" : speedNow > 0.6 ? "walk" : "idle";
      if (combat && combat.vitals().down) { /* lying down until a revive or a respawn */ }
      else if (!avatar.busy() || (grounded && want !== "idle" && !boarding)) { if (want !== "jump") avatar.play(want, { speed: want === "walk" ? Math.max(0.8, speedNow / 6.5) : 1 }); animState = want; }
    }
  }
  if (boarding) { const ro = rideObj(); ro.userData.update(t, speedNow, ride === "jet" ? (jetHigh ? 1 : 0.5) : 0); ro.rotation.y = facing; }
  if (npc && (npcT += dt) > 6) { npcT = 0; const lines = ["Hi! I'm ARCIA. Ask me anything.", "Scan a token before you buy it.", "A real airdrop never asks you to pay.", "Check the LP lock before you ape."]; npc.userData.line = (npc.userData.line + 1) % lines.length; npc.remove(npc.userData.bub); npc.userData.bub = K.bubble(T(lines[npc.userData.line])); npc.add(npc.userData.bub); if (labels) labels.dirty = true; if (Math.random() < 0.5) npc.userData.ac.play("emote-yes", { once: true }); }
  if (npc) npc.userData.ac.update(dt, t);
  if (stage && mode === "hub") stage.tick(dt, t);
  if (mode === "hub" && folk.length) for (const f of folk) {
    const want = f.wait > 0 ? (f.wave ? "emote-yes" : "idle") : "walk";
    if (f.wait > 0) { f.wait -= dt; if (f.wait <= 0) { f.walkT = 8 + Math.random() * 12; f.wave = false; } }
    else { f.a += (f.dir * f.sp * dt) / f.r; f.walkT -= dt; if (f.walkT <= 0) { f.wait = 2.5 + Math.random() * 4; f.wave = Math.random() < 0.3; } }
    if (want !== f.anim) { f.anim = want; try { f.c.play(want, want === "emote-yes" ? { once: true } : {}); } catch { /* no such clip */ } }
    const x = Math.sin(f.a) * f.r, z = -Math.cos(f.a) * f.r; f.g.position.set(x, 0, z);
    f.g.rotation.y = Math.atan2(Math.cos(f.a) * f.dir, Math.sin(f.a) * f.dir); // facing along the ring
    if (f.c.update && !f.c.mixer) f.c.update(dt, t); /* an ARC Bot's mixer already steps it */
  }
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
  if (knockV.lengthSq() > 0.01) { const v = knockV.length(); tmp2.copy(knockV).divideScalar(v); tryMove(tmp2, v * dt); knockV.multiplyScalar(Math.max(0, 1 - dt * 6)); }
  trail.update(boarding && !frozen, here(tmpTr), speedNow);
  if (P.style.trail === "trail-rainbow" && trail.mesh.visible) trail.mat.uniforms.c.value.setHSL((t * 0.25) % 1, 0.9, 0.6);
  // an arch right in front of the camera would fill the screen: it steps aside
  arches.forEach((a) => { a.getWorldPosition(tmpTr); a.visible = tmpTr.distanceTo(cam.position) > 7; });
  if (mode === "island" && island.building() && hoverXY && !look && (hoverT += dt) > 0.12) { hoverT = 0; island.hover(hoverXY.x, hoverXY.y); }
  const n = nearest();
  if ((n && n.g) !== (near && near.g)) { near = n; paintPrompt(); if (n && n.g && n.spec && !reduce) greet(n.g); if (n && n.kind === "npc" && !P.visited.includes("npc")) { P.visited.push("npc"); save(); checkQuests(); } }
  scamCheck(dt);
  mixers.forEach((m) => m.update(dt));
  fadeLabels(dt);
  pickCards();
  lockedCheck(dt);
  if ((miniT += dt) > 0.08) { miniT = 0; drawMini(); }
  paintMarker();
  watchFps(dt);
  if (introOn) return; // the dive drives the camera
  // camera: behind and above the player, orbiting with camYaw / camPitch, wider when running; build mode sits higher
  const bz = mode === "island" && island.building() ? 1.55 : 1;
  base.set(0, 5.2 + camPitch * 6, 9.6).multiplyScalar(camDist * camZoom * bz * (1 - Math.sin(Math.min(1, punch) * Math.PI) * 0.07)).applyAxisAngle(Y, camYaw);
  camPos.copy(base).add(at); camPos.y += (hop - at.y) * 0.6;
  if (!photo && (colT += dt) > 0.08) { colT = 0; camCollide(camPos); }
  camPos.sub(at).multiplyScalar(photo ? 1 : camFit).add(at);
  if (camKick.lengthSq() > 1e-6) { camPos.add(camKick); camKick.multiplyScalar(Math.exp(-dt0 * 14)); }
  if (shake > 0 && reduce) shake = 0;
  // shake: a smooth rattle that dies away (not a new random jump every frame)
  if (shake > 0) { shake = Math.max(0, shake - dt); shakeT += dt; const a = shake * 0.6; camPos.x += (Math.sin(shakeT * 47) + Math.sin(shakeT * 83) * 0.5) * a; camPos.y += (Math.sin(shakeT * 61 + 1.3) + Math.sin(shakeT * 97) * 0.5) * a; }
  if (mode === "hub") camPos.y = Math.max(camPos.y, 0.6); // never under the ground
  camLook.set(-Math.sin(camYaw) * 2.6, 1.4 + (hop - at.y) * 0.5, -Math.cos(camYaw) * 2.6).add(at);
  const landing = performance.now() < landUntil;
  cam.position.lerp(camPos, 1 - Math.exp(-dt * (landing ? 2.4 : 10)));
  // the point it looks at follows a touch behind, so steps, hops and landings don't jolt the picture
  if (!lookInit) { camLookS.copy(camLook); lookInit = true; } camLookS.lerp(camLook, 1 - Math.exp(-dt * (landing ? 3 : 14))); cam.lookAt(camLookS);
  // speed widens the view: a little at a run, more on the board and the jetpack (and a kick as a sprint starts)
  const sk = THREE.MathUtils.smoothstep(speedNow, 2, 22), kick = Math.max(0, speedNow - lastSpeed) * 0.35; lastSpeed = THREE.MathUtils.lerp(lastSpeed, speedNow, 1 - Math.exp(-dt * 3));
  const fov = 55 + sk * 11 + Math.min(3, kick) + (jetOn() && jetHigh ? 2 : 0);
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
dailyState(); makeMeadow(); dayNight(); worldReady = true; if (st.quality.coarse) setTimeout(trimCasters, 9000); // phones: little things stop casting sun shadows
setTimeout(() => { const go = () => { if (mode === "hub") farCull.all(bakeMiniMap); }; if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else go(); }, 6000); /* the minimap's ground, once the town is up, when the page is idle */ try { st.renderer.compileAsync && st.renderer.compileAsync(st.scene, st.camera).catch(() => {}); } catch { /* older three */ } /* shaders ready before they're first needed */ setInterval(paintParty, 1500); // the party strip (after everything it reads is set up)
loadbar(1);
paintHud(); paintQuests(); paintAcct(); refreshPurse(true); refreshCoins(true); refreshArc(); refreshQuantum(); ping(); setTimeout(resumeSession, 2500);
// the way in is one move: the robot is dressed while the loading screen is still up, the first frame you see is the
// start of the dive (never the town first and then a jump back out to space), and from the home gate, which has
// already dived down to the robot, the camera only comes down the last stretch to land behind you
await setAvatar(P.char || "arc-arc");
const landing = dive();
$("wp-loading").classList.add("done");
setTimeout(() => { if (load3d) load3d.dispose(); $("wp-loading").remove(); }, 600);
await landing;
landed = true; feedQ.splice(0).slice(-4).forEach(([h, c], i) => setTimeout(() => feed(h, c), i * 250));
if (!P.authSeen && !sess()) openAuth();
else if (!P.char) openMake();
else { tutorialStep(-1); maybeGuide(); }
refreshPlaza();
// a shared island link (/play?isle=0x…): straight to that island once you're in
// news while you play (friends online, stamps on your island) and, once after an update, what's new
setTimeout(() => island.news((h, c) => feed(h, c)), 5000); setInterval(() => { if (mode === "hub") island.news((h, c) => feed(h, c)); }, 300000);
maybeNew();
setTimeout(() => quests.seasonNotice((h, c) => feed(esc(h), c)), 8000);
{ const w = (new URLSearchParams(location.search).get("isle") || "").toLowerCase(); if (/^0x[0-9a-f]{40}$/.test(w) && P.char) setTimeout(() => { if (mode === "hub" && !frozen) goIsland({ visit: w }); }, 900); }
arclShop.refresh().then(() => { arclShop.flushQueue(); if (P.guideSeen && auth.hidden && make.hidden) setTimeout(() => arclShop.maybeDaily(), 900); });
window.arcWorld = {
  stage: () => st, post: () => fxPost, gshadow: () => gshadow, grass: () => grass, gmask: () => gmask, parts: () => parts, music: () => music, vfx: () => vfx, life: () => life, air: () => air, showcase: () => island.showcase(), ride: () => ride, kit: () => kit, race: () => race, inbox: () => inbox, wardrobe: () => wardrobe, decor: () => decor, openProfile: (w) => openProfile(w),
  level: () => level(), purse: (f) => refreshPurse(f),
  mode: () => mode, island: () => island.debug(), goIsland: (o = {}) => goIsland(o), leaveIsland, place: (...a) => island._place(...a), blueprint: (...a) => island._blueprint(...a), introDone: () => !introOn,
  P, planet, flyTo: (id) => { const g = id === "npc" ? npc : shops.find((s) => s.userData.spec.id === id); if (g) flyTo(g); },
  near: () => near && (near.spec ? near.spec.id : near.coin ? "coin:" + near.coin.symbol : near.kind),
  coins: () => coinBuildings.length, rocket: launchRocket, burn: burnFire, whale: swimWhale, previewStyle: (id) => island.setTheme(id), combat: () => combat, robots: () => !!(kit && kit.enemies && kit.enemies.EyeDrone), quests: () => quests, pet: () => pet, rpg: () => rpg, state: () => ({ facing, camYaw, hop, grounded, anim: animState, boarding, camFit, camDist, frozen, mode, arcl: (arclShop.arcl() || {}).bal, owned: ((arclShop.own() || {}).items || []).slice() }),
  // for screenshots and tests: point the camera, ride the board
  cam: (o = {}) => { if (o.yaw != null) camYaw = o.yaw; if (o.pitch != null) camPitch = o.pitch; if (o.dist != null) camDist = o.dist; if (o.facing != null) facing = o.facing; }, board: (on) => setBoard(!!on), gain: (n) => gain(n, ""), holdXp: (on) => { xpHeld = !!on; },
  fighters: () => fighters.map((g) => ({ id: g.userData.spec.id, live: !!g.userData.live })),
  // for tests and the art audit: what the last frame drew (draw calls, triangles) and what's in GPU memory
  perf: () => ({ calls: st.renderer.info.render.calls, triangles: st.renderer.info.render.triangles, geometries: st.renderer.info.memory.geometries, textures: st.renderer.info.memory.textures, pixelRatio: st.renderer.getPixelRatio(), avatar: P.char || "" }),
  avatar: () => avatar,
  raid: () => raid, ghosts: () => ghosts, tp: (x, z) => { planet.position.set(-x, 0, -z); hop = 0; vy = 0; grounded = true; },
};
