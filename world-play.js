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
// Game World is password-locked while it's being tested (world-lock.js); the Platform World stays open.
if (!window.arcWorldLock || !window.arcWorldLock.ok()) {
  document.getElementById("wp-loading").hidden = true;
  if (window.arcWorldLock) await window.arcWorldLock.ask({ cancelHref: "/?skip" });
  else { location.replace("/?skip"); await new Promise(() => {}); }
  document.getElementById("wp-loading").hidden = false;
}
const VER = new URL(import.meta.url).search;
const K = await import("./world-kit.js" + VER);
const IS = await import("./world-island.js" + VER);
const { THREE } = K;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lc = (a) => String(a || "").toLowerCase();
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const loadbar = (k) => { const b = $("wp-loadbar"); if (b) b.style.width = Math.round(k * 100) + "%"; };
const usd = (v) => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v).toLocaleString("en-US");

// ---------------- language: the site's dictionaries (i18n.js); templates are translated, then filled ----------------
const LANG = (() => { try { const l = (window.arcI18n && window.arcI18n.get()) || localStorage.getItem("arcircle.lang") || "en"; return l === "ko" || l === "zh" ? l : "en"; } catch { return "en"; } })();
if (LANG !== "en") for (let i = 0; i < 30 && !(window.__arcDict && window.__arcDict[LANG]); i++) await sleep(100);
const T = (s, v) => { let t = (LANG !== "en" && window.arcI18n && window.arcI18n.translate(s, LANG)) || s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
// single words stay out of the site-wide dictionary (they'd change other pages): a small map just for the game
const WORDS = {
  ko: { Layout: "화면 배치", Compact: "PC형", Large: "크게", Skip: "건너뛰기", Quests: "퀘스트", Map: "지도", Settings: "설정", Graphics: "그래픽", Auto: "자동", High: "높음", Low: "낮음", Language: "언어", Account: "계정", Sound: "사운드", Today: "오늘", Badges: "배지", Name: "이름", "Level up": "레벨 업", online: "접속 중", Player: "플레이어", visited: "방문함", yours: "내 코인", ready: "준비됨", bought: "매수", sold: "매도",
    move: "이동", jump: "점프", run: "달리기", enter: "입장", board: "보드", emote: "감정표현", photo: "사진", map: "지도", "drag to look": "드래그로 둘러보기" },
  zh: { Layout: "界面布局", Compact: "电脑版", Large: "大字", Skip: "跳过", Quests: "任务", Map: "地图", Settings: "设置", Graphics: "画质", Auto: "自动", High: "高", Low: "低", Language: "语言", Account: "账户", Sound: "声音", Today: "今日", Badges: "徽章", Name: "名字", "Level up": "升级", online: "在线", Player: "玩家", visited: "已访问", yours: "我的币", ready: "就绪", bought: "买入", sold: "卖出",
    move: "移动", jump: "跳跃", run: "奔跑", enter: "进入", board: "滑板", emote: "表情", photo: "拍照", map: "地图", "drag to look": "拖动查看" },
};
const W = (w) => (WORDS[LANG] && WORDS[LANG][w]) || w;
document.querySelectorAll("[data-w]").forEach((el) => { el.textContent = W(el.dataset.w); });
if (LANG !== "en") { const k = $("wp-keys"); if (k) k.innerHTML = `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ${W("move")} <span>·</span> <kbd>Space</kbd> ${W("jump")} <span>·</span> <kbd>Shift</kbd> ${W("run")} <span>·</span> <kbd>E</kbd> ${W("enter")} <span>·</span> <kbd>F</kbd> ${W("board")} <span>·</span> <kbd>1</kbd><kbd>2</kbd> ${W("emote")} <span>·</span> <kbd>P</kbd> ${W("photo")} <span>·</span> <kbd>M</kbd> ${W("map")} <span>·</span> ${W("drag to look")}`; }
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
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private window */ } clearTimeout(cloudT); cloudT = setTimeout(cloudSave, 6000); };
const saveSet = () => { try { localStorage.setItem(SETS, JSON.stringify(S)); } catch { /* private window */ } };
const level = () => 1 + Math.floor(P.xp / 100);
function gain(n, why) {
  const before = level(); P.xp += n; save(); paintHud();
  toast(T("+{n} XP · {why}", { n, why }));
  if (level() > before) { Snd.level(); burst(0x39ff88); levelUp(level()); } else Snd.pick();
  badges();
}
let toastT = 0;
function toast(msg) { const t = $("wp-toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }

// ---------------- accounts, saving, who's online (api/_world.mjs) ----------------
const AC = window.arcConnect, CFG = window.CONFIG || {};
const addr = () => (AC && AC.address && AC.address()) || "";
const vid = (() => { try { let v = localStorage.getItem(VID); if (!/^[a-z0-9]{20}$/.test(v || "")) { v = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); localStorage.setItem(VID, v); } return v; } catch { return "guest0000000000000000"; } })();
const sess = () => { try { const s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch { return null; } };
const loginMessage = (wallet, issued) => `ARCIRCLE World — sign in\n\nWallet: ${lc(wallet)}\nIssued: ${issued}\n\nThis only proves the wallet is yours. It costs nothing and moves nothing.`;
const post = (body) => fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }));
const PROGRESS = ["xp", "visited", "beaten", "cards", "quests", "badges", "char", "name", "daily"];
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
  try { localStorage.setItem(SESS, JSON.stringify({ wallet: a, issued, signature })); } catch { /* private */ }
  const sv = r.j.save;
  if (sv && (sv.xp || 0) > P.xp) { PROGRESS.forEach((k) => { if (sv[k] != null && sv[k] !== "") P[k] = sv[k]; }); try { localStorage.setItem(SAVE, JSON.stringify(P)); } catch { /* private */ } toast(T("Welcome back, {name}. Your progress is loaded.", { name: P.name || "" })); }
  else { toast(r.j.firstTime ? T("Signed in. Welcome to ARCIRCLE World!") : T("Signed in.")); cloudSave(); }
}
async function cloudSave() {
  const s = sess(); if (!s) return;
  const data = {}; PROGRESS.forEach((k) => (data[k] = P[k]));
  try { const r = await post({ action: "world-save", ...s, data }); if (r.status === 400 && /expired/.test(r.j.error || "")) { localStorage.removeItem(SESS); paintAcct(); } } catch { /* next time */ }
}
let stats = null;
async function ping() {
  if (document.hidden) return;
  try { const r = await post({ action: "world-ping", id: vid }); if (r.ok) { stats = r.j; paintOnline(); } } catch { /* offline */ }
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
  return {
    init, set(on) { S.sound = on; saveSet(); if (on) init(); if (out) out.gain.value = on ? 0.42 : 0; },
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
  };
})();
addEventListener("pointerdown", () => Snd.init(), { once: true });
addEventListener("keydown", () => Snd.init(), { once: true });

// ---------------- the scene ----------------
const cv = $("wp-cv");
if (!K.webglOk()) {
  $("wp-loading").innerHTML = `<span>${esc(T("This browser can't draw the 3D world."))}</span><a class="wp-cta" href="/?skip">${esc(T("Go to the Platform World"))}</a>`;
  throw new Error("no webgl");
}
try { await document.fonts.load("700 92px Sora"); } catch { /* system font */ }
loadbar(0.15);
const st = K.makeStage(cv, { fog: 0.0058, bloom: 0.55, fov: 55, shadows: true, quality: S.quality, groundY: 0 });
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
planet.add(K.makeGround());
const sky = K.makeSky(); st.scene.add(sky);
const skyPlanets = K.makeSkyPlanets(VER); st.scene.add(skyPlanets);
const stars = K.makeStars(); st.scene.add(stars);
const halo = K.makeHalo(0.5); halo.position.set(0, 135, -360); halo.rotation.set(0.32, 0.2, 0); halo.traverse((o) => { if (o.material) o.material.fog = false; }); st.scene.add(halo);
const clouds = K.makeClouds(); planet.add(clouds);
planet.add(K.makePaths()); planet.add(K.makeDistrictSigns()); planet.add(K.makeDistrictTints());
const lamps = K.makeLamps(); planet.add(lamps);
const spins = [];
const shops = K.SHOPS.map((spec) => { const g = K.makeShop(spec); K.placeOn(g, K.dirOf(spec.theta, spec.phi)); planet.add(g); K.shadowy(g); spins.push(...g.userData.spin); return g; });
const shopG = (id) => shops.find((g) => g.userData.spec.id === id);
const portal = K.makePortal(T("Platform World")); K.placeOn(portal, K.dirOf(K.PORTAL.theta, K.PORTAL.phi)); planet.add(portal); spins.push(...portal.userData.spin);
// the way to the islands
const isleGate = K.makePortal(T("My Island")); K.placeOn(isleGate, K.dirOf(14, 140)); planet.add(isleGate); spins.push(...isleGate.userData.spin);
isleGate.traverse((o) => { if (o.isMesh && o.material && o.material.emissive && !o.material.transparent) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(0x7ee0a0), 0.5); o.material.emissive.lerp(new THREE.Color(0x7ee0a0), 0.5); } });
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
const board = K.makeHoverboard(); board.visible = false; player.add(board);
let avatar = null, nameTag = null;
async function setAvatar(id) {
  const a = await K.makeCharacter(id, VER).catch(() => K.makeCharacter("bot"));
  if (avatar) player.remove(avatar.obj);
  avatar = a; player.add(a.obj); a.obj.rotation.y = facing; a.obj.position.y = boarding ? 0.45 : 0;
  setNameTag(); paintCrown();
}
function setNameTag() {
  if (nameTag) { player.remove(nameTag); nameTag.material.map.dispose(); }
  const title = BADGES.find((b) => b.id === P.badges[P.badges.length - 1]);
  nameTag = K.label(P.name || W("Player"), { accent: "#35d8d0", size: 0.42, sub: title ? T(title.title) : "" }); nameTag.position.y = 3.15; player.add(nameTag);
}

// ---- state that the rest of the file shares (declared before anything can call into it) ----
const cards = [], mixers = [], town = [], lockedStages = [], coinBuildings = [], smokes = [], qOrbs = [];
let coinData = null, lastSeen = 0, myCoins = [], labels = null, npc = null, board3 = null, arcStats = null;
let facing = Math.PI, boarding = false, worldReady = false;
const fighters = [];

// ---- the kit models (Kenney + Quaternius, CC0) ----
const kit = await Promise.race([kitP, new Promise((r) => setTimeout(() => r(null), 12000))]);
loadbar(0.75);
async function dressWorld(kit) {
  if (!kit) return;
  shops.forEach((g) => K.decorate(g, kit));
  K.makeTown(kit).forEach((g) => { planet.add(g); town.push(g); spins.push(...g.userData.spin); });
  // chimneys smoke: the Launchpad's factory and the town's tall chimneys
  [shopG("launch"), ...town.filter((g) => /^town:chimney/.test(g.name))].forEach((g) => {
    if (!g) return; smokes.push(K.smoke(g, new THREE.Vector3(0.4, g.name ? 4.0 : 5.0, -0.3)));
  });
  // scammers: the first one not yet beaten roams; the rest wait in cages
  K.SCAMMERS.forEach((spec) => {
    if (P.beaten.includes(spec.id)) return;
    const e = K.enemy(kit, spec.model);
    const g = new THREE.Group(); g.name = "scam:" + spec.id;
    if (e) { e.obj.scale.setScalar(spec.scale); e.obj.position.y = spec.y; if (spec.tint) e.obj.traverse((m) => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(spec.tint), 0.55); } }); g.add(e.obj); mixers.push(e.mixer); e.play("Idle"); }
    const sign = K.label(spec.sign, { accent: "#ff4d6d", color: "#ffc861", size: 0.6 }); sign.position.y = spec.y + 1.9 * spec.scale + 0.6; g.add(sign);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 40), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.userData = { spec, enemy: e, radius: 1.3 + spec.scale * 0.5, ring };
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
  }
  // the Exchange's live price board
  const ex = shopG("swap");
  if (ex) { board3 = K.makeBoard(3.4, 1.5); board3.position.set(0, 1.4, 3.35); board3.rotation.x = -0.15; ex.add(board3); paintBoard(); }
  if (coinData) buildCoinCity(coinData);
  if (worldReady) { paintHud(); paintQuests(); }
  if (labels) labels.dirty = true;
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
if (kit) await dressWorld(kit); else kitP.then((k) => k && dressWorld(k));

// ---------------- input ----------------
const keys = new Set();
let joy = null, look = null, camYaw = 0, camPitch = 0.05, frozen = false, flying = null, lastLook = 0, runToggle = false, photo = false;
let camDist = coarse ? 1.12 : 1, camZoom = 1;
const typing = (e) => /input|textarea|select/i.test(e.target.tagName);
const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"];
addEventListener("keydown", (e) => {
  if (typing(e)) return;
  if (mode === "island" && !photo && island.keyDown(e)) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { if (photo) setPhoto(false); else closeAll(); return; }
  if (k === "p" && (!frozen || photo)) { setPhoto(!photo); return; }
  if (frozen) return;
  if (k === "e" || k === "enter") { if (near) { e.preventDefault(); enter(near); } return; }
  if (k === "m") { openMap(); return; }
  if (k === "f") { setBoard(!boarding); return; }
  if (k === "1") { emote("emote-yes"); return; }
  if (k === "2") { emote("emote-no"); return; }
  if (k === " ") { e.preventDefault(); jump(); return; }
  if (MOVE_KEYS.includes(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const joyEl = $("wp-joy"), knob = joyEl.querySelector("i");
let downAt = null, hoverXY = null;
cv.addEventListener("contextmenu", (e) => { if (mode === "island") e.preventDefault(); });
cv.addEventListener("pointerdown", (e) => {
  if (frozen && !photo) return;
  downAt = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  cv.setPointerCapture(e.pointerId);
  if (!photo && e.pointerType !== "mouse" && e.clientX < innerWidth * 0.5 && !joy) {
    joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px"; joyEl.classList.add("on"); knob.style.transform = "";
  } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
cv.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse" && mode === "island") { hoverXY = { x: e.clientX, y: e.clientY }; if (!look) island.hover(e.clientX, e.clientY); }
  if (joy && e.pointerId === joy.id) {
    let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const m = Math.hypot(dx, dy), max = 56;
    if (m > max) { dx *= max / m; dy *= max / m; }
    joy.dx = dx / max; joy.dy = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
  } else if (look && e.pointerId === look.id) {
    camYaw -= (e.clientX - look.x) * 0.006 * S.sens;
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - look.y) * 0.004 * S.sens, -0.3, mode === "island" && island.building() ? 1.4 : 0.75);
    look.x = e.clientX; look.y = e.clientY; lastLook = performance.now();
  }
});
const lift = (e) => {
  // a short tap without a drag is a build action on your island
  if (e.type === "pointerup" && downAt && downAt.id === e.pointerId && mode === "island" && island.building() && !frozen && performance.now() - downAt.t < 450 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 9) island.tap(e);
  downAt = null;
  if (joy && e.pointerId === joy.id) { joy = null; joyEl.classList.remove("on"); }
  if (look && e.pointerId === look.id) look = null;
};
cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift);
cv.addEventListener("wheel", (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.0012, 0.6, mode === "island" ? 2.6 : 1.9); }, { passive: true });
$("wp-act-jump").addEventListener("click", () => jump());
$("wp-act-run").addEventListener("click", (e) => { runToggle = !runToggle; e.currentTarget.setAttribute("aria-pressed", String(runToggle)); });
$("wp-act-emote").addEventListener("click", () => emote("emote-yes"));
$("wp-act-board").addEventListener("click", () => setBoard(!boarding));
$("wp-act-photo").addEventListener("click", () => setPhoto(true));

// ---------------- movement: the world slides under the player ----------------
const Y = new THREE.Vector3(0, 1, 0), prevP = new THREE.Vector3(), EDGE = 150;
let mode = "hub"; // "hub" | "island" (world-island.js takes over the ground)
const at = new THREE.Vector3(0, 0, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dir = new THREE.Vector3(), axis = new THREE.Vector3(), nrm = new THREE.Vector3();
let speedNow = 0, hop = 0, vy = 0, grounded = true, near = null, stepT = 0, walked = 0, shake = 0;
function inputs() {
  let x = 0, y = 0;
  if (keys.has("w") || keys.has("arrowup")) y += 1;
  if (keys.has("s") || keys.has("arrowdown")) y -= 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (joy) { x += joy.dx; y += -joy.dy; }
  const m = Math.min(1, Math.hypot(x, y));
  const run = keys.has("shift") || runToggle || (joy && Math.hypot(joy.dx, joy.dy) > 0.95);
  return { x, y, m, run };
}
const SOLIDS = () => [shops, [portal, isleGate], lockedStages, town, coinBuildings, fighters.filter((g) => g.userData.live)];
function blockedBy() {
  let hit = null, best = Infinity;
  for (const list of SOLIDS()) for (const g of list) { g.getWorldPosition(tmp); const d = tmp.distanceTo(at) - (g.userData.radius + 0.55); if (d < 0 && d < best) { best = d; hit = g; } }
  return hit;
}
// where the player stands, in the world group's coordinates
const here = (v = new THREE.Vector3()) => v.set(-planet.position.x, hop, -planet.position.z);
function tryMove(d, dist) {
  prevP.copy(planet.position);
  planet.position.addScaledVector(d, -dist);
  let hit = null;
  if (mode === "island") hit = island.blocked(here(tmp2)) ? { axis: true } : null;
  else if (planet.position.lengthSq() > EDGE * EDGE) hit = { edge: true };
  else { planet.updateMatrixWorld(true); hit = blockedBy(); }
  if (hit) planet.position.copy(prevP);
  return hit;
}
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
function jump() { if (!grounded || frozen) return; vy = boarding ? 11 : 9; grounded = false; Snd.jump(); if (avatar && !boarding) avatar.play("jump", { once: true, fade: 0.08 }); daily("jumps"); tutorialStep(1); }
function emote(name) { if (!avatar || frozen || !grounded) return; avatar.play(name, { once: true }); }
function setBoard(on) {
  if (frozen) return;
  boarding = on; board.visible = on; if (avatar) avatar.obj.position.y = on ? 0.45 : 0;
  $("wp-act-board").setAttribute("aria-pressed", String(on)); Snd.board();
  toast(on ? T("Hoverboard on: hold Shift (or Run) to fly") : T("Hoverboard off"));
}
function step(dt) {
  // the floor: flat ground in the hub, the bricks under your feet on an island
  const floor = mode === "island" ? island.floorAt(here(tmp2)) : 0;
  if (!grounded) { vy -= 24 * dt; hop += vy * dt; if (hop <= floor) { hop = floor; vy = 0; grounded = true; Snd.land(); dust(6); shake = Math.max(shake, 0.12); } }
  else if (hop > floor + 0.05) { grounded = false; vy = 0; }
  else if (floor > hop) hop = floor;
  player.position.y = hop;
  at.y = THREE.MathUtils.lerp(at.y, floor, grounded ? 0.2 : 0.04);
  if (frozen) { speedNow = THREE.MathUtils.lerp(speedNow, 0, 0.2); return; }
  if (flying) {
    const k = Math.min(1, (performance.now() - flying.t0) / flying.ms), e = 1 - Math.pow(1 - k, 3);
    planet.position.lerpVectors(flying.from, flying.to, e);
    camYaw = angLerp(camYaw, flying.face - Math.PI, 0.08); facing = angLerp(facing, flying.face, 0.1);
    speedNow = 0.6 * (1 - k);
    if (k >= 1) { facing = flying.face; camYaw = flying.face - Math.PI; flying = null; }
    return;
  }
  const { x, y, m, run } = inputs();
  let sp = 0;
  if (m > 0.05) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    dir.set(rx * x + fx * y, 0, rz * x + fz * y).normalize();
    sp = (boarding ? (run ? 22 : 13) : run ? 12.5 : 6.5) * m;
    const hit = tryMove(dir, sp * dt);
    if (hit && hit.axis) {
      // a brick grid: slide along whichever axis is still free
      const ax = new THREE.Vector3(Math.sign(dir.x), 0, 0), az = new THREE.Vector3(0, 0, Math.sign(dir.z));
      const okX = Math.abs(dir.x) > 0.15 && !tryMove(ax, sp * dt * Math.abs(dir.x));
      if (!okX && !(Math.abs(dir.z) > 0.15 && !tryMove(az, sp * dt * Math.abs(dir.z)))) sp *= 0.2;
    } else if (hit) {
      // slide along it: drop the part of the step that goes into the obstacle
      if (hit.edge) nrm.set(-planet.position.x, 0, -planet.position.z).normalize();
      else { hit.getWorldPosition(tmp); nrm.set(tmp.x, 0, tmp.z).normalize(); }
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
  flying = { from: planet.position.clone(), to: stand.clone().negate(), face: Math.atan2(p.x - stand.x, p.z - stand.z), t0: performance.now(), ms: reduce ? 1 : 1500 };
  camPitch = 0.05;
}

// ---------------- My Island (world-island.js): a floating island you build, and other players' islands ----------------
const island = IS.createIsland({
  THREE, K, st, planet, T, lang: LANG, esc, toast, post, sess, Snd, P, VER, reduce, coarse, level,
  lines: () => islandLines(), onStats: (x) => { if (!x) return; P.isle = x; save(); checkQuests(); },
  labelsDirty: () => { if (labels) labels.dirty = true; },
  avatarPlay: (n) => { if (avatar && grounded && !boarding) avatar.play(n, { once: true }); },
  goTo: (pos, face) => { planet.position.set(-pos.x, 0, -pos.z); hop = pos.y; at.y = pos.y; vy = 0; grounded = true; facing = face; camYaw = face - Math.PI; flying = null; mode = "island"; },
  freeze: (on) => { frozen = on; keys.clear(); paintPrompt(); },
  feet: () => hop, goIsland: (o) => goIsland(o),
});
function islandLines() {
  const out = [];
  if (arcStats && arcStats.change24h != null) out.push(T("$ARCIRCLE is {p} today", { p: (arcStats.change24h >= 0 ? "+" : "") + arcStats.change24h.toFixed(1) + "%" }));
  if (coinData && coinData.length) { const c = coinData.slice().sort((a, b) => b.launchedAt - a.launchedAt)[0]; out.push(T("Did you see {x} launch on ArcPad?", { x: "$" + c.symbol })); }
  if (arcStats && arcStats.burned && arcStats.burned.tokens) out.push(T("{n} $ARCIRCLE burned so far", { n: Math.round(arcStats.burned.tokens).toLocaleString("en-US") }));
  out.push(T("Scan a token before you buy it."), T("I love this island."));
  return out;
}
async function goIsland(opt) {
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
  if (labels) labels.dirty = true; near = null; paintPrompt();
}

// ---------------- what's in reach ----------------
function nearest() {
  let best = null, bd = Infinity;
  const consider = (g, kind, extra, reach) => { g.getWorldPosition(tmp); const d = tmp.distanceTo(at) - (g.userData.radius || 1); if (d < reach && d < bd) { bd = d; best = { kind, g, ...extra }; } };
  if (mode === "island") { island.near(consider); return best; }
  consider(isleGate, "isle", {}, 2.4);
  shops.forEach((g) => consider(g, "shop", { spec: g.userData.spec }, 2.8));
  coinBuildings.forEach((g) => consider(g, "coin", { coin: g.userData.coin }, 2.4));
  consider(portal, "portal", {}, 2.4);
  consider(pad, "pad", {}, 1.6);
  if (npc) consider(npc, "npc", {}, 2.4);
  return best;
}
function paintPrompt() {
  const p = $("wp-prompt");
  if (!near || frozen) { p.hidden = true; return; }
  p.hidden = false;
  const b = (s) => `<b>${esc(s)}</b>`;
  $("wp-enter-t").innerHTML = near.kind === "isle" ? T("Go to {x}", { x: b(T("My Island")) }) : near.kind === "isle-exit" ? esc(T("Back to the world")) : near.kind === "resident" ? T("Talk to {x}", { x: b(near.res.name) }) : near.kind === "portal" ? T("Go to {x}", { x: b(T("Platform World")) }) : near.kind === "pad" ? esc(T("Fast travel")) : near.kind === "npc" ? T("Talk to {x}", { x: b("ARCIA") }) : near.kind === "coin" ? T("Visit {x}", { x: b("$" + near.coin.symbol) }) : T("Enter {x}", { x: b(near.spec.name) });
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
  const off = st.on(() => { const k = Math.min(1, (performance.now() - t0) / 420); camYaw = angLerp(y0, yaw, k); camZoom = 1 - 0.35 * k; if (k >= 1) { off(); fn(); } });
}
function enter(n) {
  if (n.kind === "isle") { goIsland({}); return; }
  if (n.kind === "isle-exit") { leaveIsland(); return; }
  if (n.kind === "resident") { island.talk(n.res); return; }
  if (n.kind === "portal") { location.href = "/?skip"; return; }
  if (n.kind === "pad") { openMap(); return; }
  if (n.kind === "npc") { doorThen(n.g, () => openSheet("ARCIA", T("Arc's AI idol. Ask her anything about a coin, a wallet or this world."), "/arc#arcia")); return; }
  if (n.kind === "coin") {
    const c = n.coin;
    doorThen(n.g, () => { openSheet("$" + c.symbol, `${c.name || c.symbol} · ${T("market cap {v}", { v: usd(Number(c.marketCapUsd) || 0) })}${n.g.userData.mine ? " · " + T("your coin") : ""}`, "/arc#coin/" + c.token); $("wp-sheet-lot").hidden = !n.g.userData.mine; lotCoin = { token: lc(c.token), symbol: c.symbol }; });
    openShop = n.g;
    if (!P.visited.includes("coin")) { P.visited.push("coin"); save(); }
    checkQuests(); return;
  }
  const s = n.spec;
  doorThen(n.g, () => openSheet(s.name, s.line, s.url));
  if (n.g.userData.chestOpen) n.g.userData.chestOpen();
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
  setTimeout(() => { li.classList.remove("on"); setTimeout(() => li.remove(), 400); }, 16000);
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
      sg.scale.setScalar(0.5); sg.position.y = 0.2; g.add(sg); g.userData.lotG = sg;
      if (g.userData.body) g.userData.body.visible = false;
      g.userData.tag.position.y = sg.userData.h * 0.5 + 1.9;
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
  checkQuests();
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
  if (m !== mood) { mood = m; aurora.visible = m === "aurora"; rain.visible = m === "rain"; if (!first && m) feed(m === "aurora" ? T("$ARCIRCLE is up today: an aurora over the planet") : m === "rain" ? T("$ARCIRCLE is down today: rain over the planet") : T("Clear skies over the planet"), "#35d8d0"); }
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
const rpc = (calls) => fetch(CFG.RPC_URL || "https://rpc.mainnet.arc.io", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [c, "latest"] }))) }).then((r) => r.json()).then((j) => { const m = {}; (Array.isArray(j) ? j : [j]).forEach((x) => (m[x.id] = x.result)); return calls.map((_, i) => m[i] || "0x"); });
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
$("wp-quests-h").addEventListener("click", (e) => { const q = $("wp-quests"); const o = q.classList.toggle("closed"); e.currentTarget.setAttribute("aria-expanded", String(!o)); });
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
  const coinsHtml = coinBuildings.length ? `<h3 style="--c:#eef3f7">${esc(T("Coin City"))}</h3><ul class="wp-maplist">` + coinBuildings.slice(0, 6).map((g, i) => `<li><button type="button" data-c="${i}"><i style="--c:${g.userData.mine ? "#39ff88" : "#4f9dff"}"></i><span><b>$${esc(g.userData.coin.symbol)}</b><small>${esc(g.userData.coin.name || "")}${g.userData.mine ? " · " + esc(W("yours")) : ""}</small></span></button></li>`).join("") + "</ul>" : "";
  const live = fighters.find((g) => g.userData.live);
  const darkHtml = live ? `<h3 style="--c:#ff4d6d">${esc(T("Dark Market"))}</h3><ul class="wp-maplist"><li><button type="button" data-f="1"><i style="--c:#ff4d6d"></i><span><b>${esc(live.userData.spec.name)}</b><small>${esc(T("Stage {n} · scammer", { n: live.userData.spec.stage }))}</small></span></button></li></ul>` : "";
  $("wp-maplist").innerHTML = groups + coinsHtml + darkHtml + `<h3 style="--c:#35d8d0">${esc(T("Ways out"))}</h3><ul class="wp-maplist"><li><button type="button" data-isle="1"><i style="--c:#7ee0a0"></i><span><b>${esc(T("My Island"))}</b><small>${esc(T("Build your own island, brick by brick."))}</small></span></button></li><li><button type="button" data-isles="1"><i style="--c:#7ee0a0"></i><span><b>${esc(T("Islands"))}</b><small>${esc(T("Visit the islands other players built."))}</small></span></button></li><li><button type="button" data-i="portal"><i style="--c:#35d8d0"></i><span><b>${esc(T("Platform World"))}</b><small>${esc(T("Back to the site as it is."))}</small></span></button></li>${npc ? `<li><button type="button" data-n="1"><i style="--c:#ff7ad9"></i><span><b>ARCIA</b><small>${esc(T("Talk to ARCIA"))}</small></span></button></li>` : ""}</ul>`;
  mapEl.hidden = false; frozen = true; keys.clear(); paintPrompt();
  const first = mapEl.querySelector("button[data-i]"); if (first) first.focus({ preventScroll: true });
}
function closeMap() { if (mapEl.hidden) return; mapEl.hidden = true; frozen = false; }
$("wp-map-btn").addEventListener("click", openMap);
$("wp-map-x").addEventListener("click", closeMap);
mapEl.addEventListener("click", (e) => {
  if (e.target === mapEl) { closeMap(); return; }
  const b = e.target.closest("button[data-i],button[data-c],button[data-f],button[data-n],button[data-isle],button[data-isles]"); if (!b) return;
  closeMap();
  if (b.dataset.isle) { goIsland({}); return; }
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
function drawMini() {
  const W = mini.width, c = W / 2, range = mode === "island" ? 26 : 40, sc = (c - 10) / range;
  mg.clearRect(0, 0, W, W);
  mg.save(); mg.beginPath(); mg.arc(c, c, c - 2, 0, 6.283); mg.clip();
  mg.fillStyle = "rgba(8,14,22,.82)"; mg.fillRect(0, 0, W, W);
  mg.strokeStyle = "rgba(53,216,208,.14)"; mg.lineWidth = 2; [0.33, 0.66].forEach((k) => { mg.beginPath(); mg.arc(c, c, (c - 2) * k, 0, 6.283); mg.stroke(); });
  const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
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
    coinBuildings.forEach((g) => put(g, g.userData.mine ? "#39ff88" : "rgba(238,243,247,.55)", 4));
    cards.forEach((g) => put(g, "#ffc861", 3.5));
    put(portal, "#35d8d0", 6); put(pad, "#ffc861", 5); put(isleGate, "#7ee0a0", 6); if (npc) put(npc, "#ff7ad9", 5);
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
  fighting = g; frozen = true; keys.clear(); paintPrompt(); Snd.bad();
  if (g.userData.enemy) g.userData.enemy.play("Attack");
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
    const g = fighting; beam(g); if (g.userData.enemy) g.userData.enemy.play("Hit", { once: true });
    setTimeout(() => poof(g), 600); gain(50, T("beat {name}", { name: s.name })); Snd.win();
    if (avatar) avatar.play("emote-yes", { once: true });
    paintHud(); checkQuests();
  } else { b.disabled = true; Snd.bad(); const e2 = fighting.userData.enemy; if (e2) { if (!e2.play("BackFlip", { once: true })) e2.play("Attack", { once: true }); } }
});
function endFight() { if (fight.hidden) return; fight.hidden = true; frozen = false; scamCool = 4; fighting = null; }
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

// labels fade out as the camera comes close, and the small ones (coins, orbs) only show nearby
// big labels (shops, districts): only the five nearest stay up, so the sky isn't a wall of signs
let labelT = 0;
function fadeLabels(dt) {
  if (!labels || labels.dirty) { labels = []; planet.traverse((o) => { if (o.isSprite && o.material.map) labels.push(o); }); }
  const big = [];
  for (const l of labels) {
    l.getWorldPosition(tmp); const d = tmp.distanceTo(cam.position); l.userData.d = d;
    if (l.scale.x >= 3.6) big.push(l);
  }
  if ((labelT -= dt) <= 0) { labelT = 0.4; big.sort((a, b) => a.userData.d - b.userData.d); big.forEach((l, i) => { l.userData.rank = i; }); }
  for (const l of labels) {
    const d = l.userData.d, isBig = l.scale.x >= 3.6, far = isBig ? (l.userData.rank < 5 ? 95 : 0) : 30;
    const want = THREE.MathUtils.clamp((d - 6) / 6, 0, 1) * THREE.MathUtils.clamp((far - d) / 8, 0, 1);
    l.material.opacity = THREE.MathUtils.lerp(l.material.opacity, want, 0.15); l.visible = l.material.opacity > 0.02;
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
function levelUp(n) {
  const el = $("wp-levelup"); $("wp-levelup-n").textContent = String(n);
  el.hidden = false; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  setTimeout(() => { el.hidden = true; }, 1900);
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
let purseAt = 0;
async function refreshPurse(force) {
  const a = addr();
  $("wp-wallet-t").textContent = a ? a.slice(0, 6) + "…" + a.slice(-4) : T("Connect wallet");
  $("wp-wallet").classList.toggle("on", !!a);
  $("wp-purse").hidden = !a;
  if (!a || (!force && Date.now() - purseAt < 30000)) { checkQuests(); return; }
  purseAt = Date.now();
  try {
    const body = [
      { jsonrpc: "2.0", id: 0, method: "eth_getBalance", params: [a, "latest"] },
      { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: CFG.ARCIRCLE_TOKEN, data: "0x70a08231" + a.slice(2).toLowerCase().padStart(64, "0") }, "latest"] },
    ];
    const j = await (await fetch(CFG.RPC_URL || "https://rpc.mainnet.arc.io", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
    const m = {}; (Array.isArray(j) ? j : [j]).forEach((x) => (m[x.id] = x.result));
    const n = (h) => Number(BigInt(h || "0x0") / 10n ** 14n) / 1e4;
    const f = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e4 ? (v / 1e3).toFixed(1) + "K" : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    bal.usdc = n(m[0]); bal.arc = n(m[1]);
    $("wp-usdc").textContent = f(bal.usdc); $("wp-arc").textContent = f(bal.arc);
    paintCrown();
  } catch { /* keep the last numbers */ }
  checkQuests();
}
function paintCrown() {
  if (!avatar || !avatar.setCrown) return;
  const a = bal.arc || 0;
  if (a >= 1e6) avatar.setCrown(0xffc861, 0xffe7a8); else if (a >= 1e5) avatar.setCrown(0x39ff88, 0x35d8d0); else if (a > 0) avatar.setCrown(0x35d8d0, 0x4f9dff); else avatar.setCrown(0x3f9bff, 0x39ff88);
}
$("wp-wallet").addEventListener("click", () => { if (AC && !addr()) AC.connect().then(() => { refreshPurse(true); refreshCoins(); paintAcct(); }).catch(() => {}); else if (AC) refreshPurse(true); });
if (AC && AC.on) AC.on(() => { refreshPurse(true); refreshCoins(); paintAcct(); });
setInterval(() => refreshPurse(false), 30000);

// ---------------- HUD ----------------
function paintHud() {
  $("wp-lv").querySelector("b").textContent = "Lv " + level();
  $("wp-xpfill").style.width = (P.xp % 100) + "%";
  $("wp-lv").title = `${P.xp} XP`;
  $("wp-cards").querySelector("b").textContent = `${P.cards.length}/${K.CARDS.length}`;
  const next = K.SCAMMERS.find((s) => !P.beaten.includes(s.id));
  $("wp-stage").textContent = next ? T("Stage {n} · {name}", { n: next.stage, name: next.name }) : T("Every stage cleared");
}
// tutorial: move, jump, then follow the light
const TUT = ["Move with W A S D, or the stick on the left", "Jump with Space, or the arrow button", "Follow the gold light to the Launchpad"];
function tutorialStep(done) {
  // steps can be done in any order (jumping before walking counts); the hint shows the first one not done yet
  if (done >= 0) { const bit = 1 << done; if ((P.tutBits | 0) & bit || P.tut >= TUT.length) return; P.tutBits = (P.tutBits | 0) | bit; let n = 0; while (n < TUT.length && P.tutBits & (1 << n)) n++; if (n === P.tut) { save(); return; } P.tut = n; save(); }
  const h = $("wp-hint");
  if (P.tut >= TUT.length) { h.hidden = true; return; }
  h.textContent = T(TUT[P.tut]); h.hidden = false; h.classList.remove("on"); void h.offsetWidth; h.classList.add("on");
}

// ---------------- sign in, character maker, settings, photo mode ----------------
const auth = $("wp-auth");
function openAuth() {
  auth.hidden = false; frozen = true; $("wp-auth-err").hidden = true;
  paintAuthCount();
  setTimeout(() => $("wp-auth-go").focus({ preventScroll: true }), 60);
}
function closeAuth() { auth.hidden = true; frozen = false; P.authSeen = true; save(); paintAcct(); if (!P.char) openMake(); else { setAvatar(P.char); tutorialStep(-1); } }
$("wp-auth-go").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = T("Check your wallet…");
  try { await signIn(); closeAuth(); refreshPurse(true); refreshCoins(); paintHud(); }
  catch (err) { $("wp-auth-err").hidden = false; $("wp-auth-err").textContent = (err && (err.code === 4001 || /reject|denied|cancel/i.test(err.message || ""))) ? T("You cancelled the signature. You can sign in later from Settings.") : (err && err.message) || T("Sign-in failed."); }
  finally { b.disabled = false; b.textContent = T("Sign in with wallet"); }
});
$("wp-auth-guest").addEventListener("click", closeAuth);
function paintAcct() {
  const s = sess(), box = $("wp-set-acct");
  box.innerHTML = s ? `<span data-no-i18n>${esc(s.wallet.slice(0, 6) + "…" + s.wallet.slice(-4))}</span> <button type="button" class="wp-link" id="wp-acct-out">${esc(T("Sign out"))}</button>` : `<button type="button" class="wp-btn" id="wp-acct-in">${esc(T("Sign in with wallet"))}</button>`;
  $("wp-set-note").textContent = s ? T("Progress is saved to your wallet and this browser.") : T("Progress is saved in this browser.");
}
$("wp-set-acct").addEventListener("click", async (e) => {
  if (e.target.id === "wp-acct-out") { try { localStorage.removeItem(SESS); } catch { /* private */ } paintAcct(); toast(T("Signed out. Progress stays in this browser.")); }
  if (e.target.id === "wp-acct-in") { try { await signIn(); paintAcct(); paintHud(); } catch (err) { toast((err && err.message) || T("Sign-in failed.")); } }
});
const make = $("wp-make");
let pickChar = P.char || "male-a";
function openMake() {
  $("wp-make-grid").innerHTML = K.CHARACTERS.map((id) => `<button type="button" role="radio" aria-checked="${id === pickChar}" data-c="${id}" title="${id === "bot" ? "ARC Bot" : id.replace("-", " ")}">${id === "bot" ? '<img src="/images/arcircle-mark-sm.png" alt="ARC Bot">' : `<img src="/models/world/chars/${id}.webp${VER}" alt="${id.replace("-", " ")}">`}</button>`).join("");
  $("wp-make-name").value = P.name || "";
  make.hidden = false; frozen = true; keys.clear(); paintPrompt();
  camYaw = facing;
  if (!avatar) setAvatar(pickChar);
  renderThumbs();
  setTimeout(() => $("wp-make-name").focus({ preventScroll: true }), 60);
}
// sharper portraits: each character rendered once in 3D, replacing the small preview images
let thumbsDone = false;
async function renderThumbs() {
  if (thumbsDone) return; thumbsDone = true;
  let r = null;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(128, 128); r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 3, 4); sc.add(dl);
    const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cm.position.set(0, 1.5, 5.2); cm.lookAt(0, 1.15, 0);
    for (const id of K.CHARACTERS) {
      if (id === "bot" || make.hidden) continue;
      const c = await K.makeCharacter(id, VER).catch(() => null); if (!c) continue;
      sc.add(c.obj); c.mixer.update(0.5); r.render(sc, cm);
      const img = make.querySelector(`button[data-c="${id}"] img`); if (img) img.src = r.domElement.toDataURL("image/png");
      sc.remove(c.obj);
    }
  } catch { /* the small previews stay */ }
  if (r) { r.dispose(); r.forceContextLoss(); }
}
$("wp-make-grid").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-c]"); if (!b) return;
  pickChar = b.dataset.c; $("wp-make-grid").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  setAvatar(pickChar).then(() => avatar && avatar.play("emote-yes", { once: true }));
});
$("wp-make-go").addEventListener("click", () => {
  P.char = pickChar; P.name = ($("wp-make-name").value || "").replace(/[<>"'`\\]/g, "").trim().slice(0, 16) || W("Player"); save();
  setNameTag(); make.hidden = true; frozen = false; camYaw = facing - Math.PI; paintQuests(); tutorialStep(-1);
});
const setEl = $("wp-setsheet");
function openSet() {
  setEl.querySelectorAll("#wp-set-q button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === S.quality)));
  setEl.querySelectorAll("#wp-set-lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === LANG)));
  $("wp-set-q-note").textContent = "";
  $("wp-set-snd").checked = !!S.sound; $("wp-set-sens").value = S.sens;
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
  $("wp-set-q-note").innerHTML = `${esc(T("Applies after a reload."))} <button type="button" class="wp-link" id="wp-set-reload">${esc(T("Reload now"))}</button>`;
});
$("wp-set-lang").addEventListener("click", (e) => { const b = e.target.closest("button[data-l]"); if (!b || b.dataset.l === LANG) return; try { localStorage.setItem("arcircle.lang", b.dataset.l); } catch { /* private */ } if (window.arcI18n) window.arcI18n.set(b.dataset.l); location.reload(); });
// phones: the compact (PC-style) layout or the large one; applied on reload (play.html sets the viewport)
const VP = (() => { try { return localStorage.getItem("arc.world.vp") || "pc"; } catch { return "pc"; } })();
if (coarse) { $("wp-set-vp-row").hidden = false; $("wp-set-vp").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vp === VP))); }
$("wp-set-vp").addEventListener("click", (e) => { const b = e.target.closest("button[data-vp]"); if (!b || b.dataset.vp === VP) return; try { localStorage.setItem("arc.world.vp", b.dataset.vp); } catch { /* private */ } location.reload(); });
$("wp-set-snd").addEventListener("change", (e) => Snd.set(e.target.checked));
$("wp-set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSet(); });
$("wp-set-char").addEventListener("click", () => { closeSet(); openMake(); });
let resetArm = 0;
$("wp-set-reset").addEventListener("click", (e) => {
  if (Date.now() - resetArm > 3000) { resetArm = Date.now(); e.currentTarget.textContent = T("Tap again to reset"); return; }
  try { localStorage.removeItem(SAVE); } catch { /* private */ } location.reload();
});
// photo mode: the HUD steps aside, drag to frame the shot, then save or share it
function setPhoto(on) {
  photo = on; document.body.classList.toggle("wp-photo", on); $("wp-photo-bar").hidden = !on;
  frozen = on; keys.clear(); paintPrompt();
  if (on) toast(T("Photo mode: drag to frame, scroll to zoom"));
}
$("wp-photo-exit").addEventListener("click", () => setPhoto(false));
$("wp-photo-take").addEventListener("click", async () => {
  const bar = $("wp-photo-bar"); bar.hidden = true; Snd.shutter();
  const blob = await st.snap(); bar.hidden = false; if (!blob) return;
  const url = URL.createObjectURL(blob); $("wp-shot-img").src = url; $("wp-shot-dl").href = url;
  $("wp-shot-x-post").href = "https://x.com/intent/tweet?text=" + encodeURIComponent(T("Walking ARCIRCLE World on Circle's Arc ♾")) + "&url=" + encodeURIComponent("https://www.arcircle.app/play");
  const file = new File([blob], "arcircle-world.png", { type: "image/png" });
  $("wp-shot-share").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $("wp-shot-share").onclick = () => navigator.share({ files: [file], text: T("Walking ARCIRCLE World on Circle's Arc ♾"), url: "https://www.arcircle.app/play" }).catch(() => {});
  $("wp-shot").hidden = false;
});
$("wp-shot-x").addEventListener("click", () => { $("wp-shot").hidden = true; });

// ---------------- closing things ----------------
function closeAll() { closeSheet(); closeMap(); endFight(); closeSet(); island.closeSheets(); $("wp-shot").hidden = true; }
if (coarse) $("wp-keys").hidden = true; else $("wp-acts").hidden = true;

// ---------------- day and night (Seoul time) ----------------
// a blue day sky over the ground, stars and the far planets at night (?hour=21 tries another hour)
const skyU = sky.material.uniforms, DAY = { top: new THREE.Color(0x2a66c4), mid: new THREE.Color(0x76b0e4), glow: new THREE.Color(0xd2e8f0) }, NIGHT = { top: new THREE.Color(0x02030a), mid: new THREE.Color(0x07102a), glow: new THREE.Color(0x173452) }, DUSK = new THREE.Color(0xf0a070);
const FOG = { day: new THREE.Color(0xb4d4e4), night: new THREE.Color(0x0b1830), dusk: new THREE.Color(0xd99a80) };
const hourParam = Number(new URLSearchParams(location.search).get("hour"));
let nightK = -1;
function dayNight() {
  const d = new Date(Date.now() + 9 * 3600e3);
  const h = Number.isFinite(hourParam) && new URLSearchParams(location.search).has("hour") ? hourParam : d.getUTCHours() + d.getUTCMinutes() / 60;
  const k = h >= 20 || h < 5 ? 1 : h >= 17 ? (h - 17) / 3 : h < 7 ? 1 - (h - 5) / 2 : 0;
  if (Math.abs(k - nightK) < 0.01) return; nightK = k;
  const dusk = Math.max(0, 1 - Math.abs(k - 0.5) * 2.4);
  ["top", "mid"].forEach((n) => skyU[n].value.copy(DAY[n]).lerp(NIGHT[n], k));
  skyU.glow.value.copy(DAY.glow).lerp(NIGHT.glow, k).lerp(DUSK, dusk * 0.7);
  st.sun.intensity = 2.1 * (1 - k * 0.65); st.sun.color.setHSL(0.08, dusk * 0.8, 1 - dusk * 0.15);
  st.hemi.intensity = 0.75 * (1 - k * 0.35); st.scene.environmentIntensity = 0.42 + k * 0.25; st.renderer.toneMappingExposure = 0.92 + k * 0.12;
  if (st.scene.fog) st.scene.fog.density = 0.0032 + k * 0.0026; st.hemi.color.set(k > 0.5 ? 0x9fd0ff : 0xcfe8ff); lamps.userData.night(k);
  if (st.scene.fog) st.scene.fog.color.copy(FOG.day).lerp(FOG.night, k).lerp(FOG.dusk, dusk * 0.5);
  stars.material.opacity = 0.85 * k; stars.visible = k > 0.02;
  skyPlanets.children.forEach((p) => { p.material.opacity = 0.95 * k; }); skyPlanets.visible = k > 0.02;
  clouds.userData.mat.color.setHSL(0.6, 0.15, 1 - k * 0.72); clouds.userData.mat.emissiveIntensity = 0.25 * (1 - k);
}
setInterval(dayNight, 60000);

// ---------------- camera: a building between the camera and the player turns see-through ----------------
const ray = new THREE.Raycaster(); ray.camera = st.camera; let camFit = 1, colT = 0;
const ghosted = new Map(), ghostMats = new Map();
const ghostOf = (m) => { let g = ghostMats.get(m); if (!g) { g = m.clone(); g.transparent = true; g.opacity = 0.22; g.depthWrite = false; ghostMats.set(m, g); } return g; };
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
  const lists = mode === "island" ? [] : [shops, town, coinBuildings];
  for (const list of lists) for (const g of list) { g.getWorldPosition(tmp); if (tmp.distanceTo(head) < len + 7) close.push(g); }
  const hits = new Set();
  if (close.length) for (const h of ray.intersectObjects(close, true)) { if (!h.object.isMesh || h.object.isSprite || h.distance < 0.4) continue; let o = h.object; while (o.parent && !close.includes(o)) o = o.parent; if (close.includes(o)) hits.add(o); }
  for (const g of [...ghosted.keys()]) if (!hits.has(g)) ghost(g, false);
  hits.forEach((g) => ghost(g, true));
  // a little pull-in only when something is right behind the head
  camFit = THREE.MathUtils.lerp(camFit, 1, 0.08);
}

// ---------------- frame rate watch: drop quality once if the device can't keep up ----------------
let fpsAcc = 0, fpsN = 0, fpsT0 = performance.now(), degraded = false;
function watchFps(dt) {
  if (degraded || S.quality !== "auto" || photo || navigator.webdriver) return;
  fpsAcc += dt; fpsN++;
  if (performance.now() - fpsT0 > 9000 && fpsAcc > 4) { if (fpsN / fpsAcc < 24) { degraded = true; st.degrade(); toast(T("Graphics lowered to keep things smooth")); } fpsAcc = 0; fpsN = 0; }
}

// ---------------- the loop ----------------
const cam = st.camera;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), base = new THREE.Vector3();
let animState = "", npcT = 0, introOn = false, landUntil = 0, hoverT = 0;
st.on((dt, t) => {
  step(dt);
  spins.forEach((f) => f(dt, t));
  smokes.forEach((f) => f(dt));
  moveScammers(t);
  planet.updateMatrixWorld(true);
  if (avatar) {
    avatar.obj.rotation.y = facing;
    if (avatar.bot) avatar.update(dt, t, Math.min(1, speedNow / 8), 0);
    else {
      avatar.update(dt, t);
      const want = boarding ? "idle" : !grounded ? (vy > 0 ? "jump" : "fall") : speedNow > 9 ? "sprint" : speedNow > 0.6 ? "walk" : "idle";
      if (!avatar.busy() || (grounded && want !== "idle" && !boarding)) { if (want !== "jump") avatar.play(want, { speed: want === "walk" ? Math.max(0.8, speedNow / 6.5) : 1 }); animState = want; }
    }
  }
  if (boarding) { board.userData.update(t); board.rotation.y = facing; }
  if (npc && (npcT += dt) > 6) { npcT = 0; const lines = ["Hi! I'm ARCIA. Ask me anything.", "Scan a token before you buy it.", "A real airdrop never asks you to pay.", "Check the LP lock before you ape."]; npc.userData.line = (npc.userData.line + 1) % lines.length; npc.remove(npc.userData.bub); npc.userData.bub = K.bubble(T(lines[npc.userData.line])); npc.add(npc.userData.bub); if (labels) labels.dirty = true; if (Math.random() < 0.5) npc.userData.ac.play("emote-yes", { once: true }); }
  if (npc) npc.userData.ac.update(dt, t);
  tickQuantum(t);
  for (let i = rockets.length - 1; i >= 0; i--) if (!rockets[i](dt)) rockets.splice(i, 1);
  if (aurora.visible) aurora.userData.update(dt, t);
  if (rain.visible) rain.userData.update(dt, at);
  clouds.userData.update(dt);
  island.tick(dt, t);
  if (mode === "island" && island.building() && hoverXY && !look && (hoverT += dt) > 0.12) { hoverT = 0; island.hover(hoverXY.x, hoverXY.y); }
  const n = nearest();
  if ((n && n.g) !== (near && near.g)) { near = n; paintPrompt(); if (n && n.kind === "npc" && !P.visited.includes("npc")) { P.visited.push("npc"); save(); checkQuests(); } }
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
  base.set(0, 5.2 + camPitch * 6, 9.6).multiplyScalar(camDist * camZoom * bz).applyAxisAngle(Y, camYaw);
  camPos.copy(base).add(at); camPos.y += (hop - at.y) * 0.6;
  if (!photo && (colT += dt) > 0.08) { colT = 0; camCollide(camPos); }
  camPos.sub(at).multiplyScalar(photo ? 1 : camFit).add(at);
  if (shake > 0) { shake = Math.max(0, shake - dt); camPos.x += (Math.random() - 0.5) * shake; camPos.y += (Math.random() - 0.5) * shake; }
  camLook.set(-Math.sin(camYaw) * 2.6, 1.4 + (hop - at.y) * 0.5, -Math.cos(camYaw) * 2.6).add(at);
  const landing = performance.now() < landUntil;
  cam.position.lerp(camPos, 1 - Math.exp(-dt * (landing ? 2.4 : 10))); cam.lookAt(camLook);
  const fov = 55 + Math.min(1, speedNow / 12.5) * 7; if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.lerp(cam.fov, fov, 0.08); cam.updateProjectionMatrix(); }
});

// ---------------- the dive: space, the round planet, down through the clouds onto the ground ----------------
async function dive() {
  if (reduce || new URLSearchParams(location.search).has("nointro")) return;
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
dailyState(); dayNight(); worldReady = true;
loadbar(1);
paintHud(); paintQuests(); paintAcct(); refreshPurse(true); refreshCoins(true); refreshArc(); refreshQuantum(); ping();
$("wp-loading").classList.add("done");
setTimeout(() => $("wp-loading").remove(), 600);
await setAvatar(P.char || "male-a");
await dive();
landed = true; feedQ.splice(0).slice(-4).forEach(([h, c], i) => setTimeout(() => feed(h, c), i * 250));
if (!P.authSeen && !sess()) openAuth();
else if (!P.char) openMake();
else tutorialStep(-1);
window.arcWorld = {
  mode: () => mode, island: () => island.debug(), goIsland: (o = {}) => goIsland(o), leaveIsland, place: (...a) => island._place(...a), blueprint: (...a) => island._blueprint(...a), introDone: () => !introOn,
  P, planet, flyTo: (id) => { const g = id === "npc" ? npc : shops.find((s) => s.userData.spec.id === id); if (g) flyTo(g); },
  near: () => near && (near.spec ? near.spec.id : near.coin ? "coin:" + near.coin.symbol : near.kind),
  coins: () => coinBuildings.length, rocket: launchRocket, burn: burnFire, whale: swimWhale, state: () => ({ facing, camYaw, hop, grounded, anim: animState, boarding, camFit }),
  fighters: () => fighters.map((g) => ({ id: g.userData.spec.id, live: !!g.userData.live })),
};
