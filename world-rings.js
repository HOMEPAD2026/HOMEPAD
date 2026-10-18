// world-rings.js — INFINITY RINGS, the Game Village's ring puzzle (loaded the first time the palace door is used, like
// SURVIVORS ARENA). It draws its own scene through the stage's view() while the town waits, frozen, behind it.
// C-shaped rings hang hooked into each other (and on metal pegs); turn a ring until its gap faces what holds it and it
// falls — a fall can free its neighbours, a chain. Clear the board in as few moves as you can: par or better is 3 stars.
// 100 levels (lock rings from 21, clockwise-only energy rings from 41, gear pairs from 46, the INFINITY BOSS at 100),
// three daily puzzles everyone shares, and an endless run for XP. The rules, the levels and the stars are
// world-rings-engine.js; the server plays the same moves on the same level (api/_world-rings.mjs) and pays 100 ARCL a
// new star. A guest plays everything; progress is kept on this device, nothing is paid.
//
// The rings: chunky glossy C's (a torus arc and two round tips, one mesh each) that touch their neighbours; a gold
// clasp holds each pair where they touch and a silver one ties a ring to its peg. A clasp glows green while it's open.
//
// ctx: { THREE, K, st, ver, T, lang, esc, toast, Snd, reduce, low, coarse, sess, post, refresh, gain(n, why),
//        quality, onMaster(), onLeave() }
import { RINGS, DIRS, level, stateOf, cloneState, turn, turnSet, hammer as hammerOn, cleared, starsOf, hint as hintOf, isFree } from "./world-rings-engine.js";

const COLORS = [0x2fd14a, 0x2f7bff, 0xffa31a, 0xa04bff, 0xff3b4a, 0x19d6c4];
const BADGE = ["#ffd23a", "#ff6fb5", "#38d8ff", "#7dff9a"];
const TUBE = 0.25, GAPW = (RINGS.GAP * Math.PI) / 180, STEP = Math.PI / 4;
const SAVE = "arc.world.rings", fmt = (n) => Math.round(n).toLocaleString("en-US");
const seoulDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const LW = {
  ko: { "INFINITY RINGS": "인피니티 링", "Turn the rings. Unhook them. Clear the board.": "링을 돌려 고리를 풀고 보드를 비우세요.", Levels: "레벨", Daily: "데일리", Endless: "무한 모드", Ranking: "랭킹", Leave: "나가기", Play: "플레이", "Level {n}": "레벨 {n}", "Daily {n}": "데일리 {n}", "Endless #{n}": "무한 #{n}",
    Moves: "이동", Par: "기준", Best: "최고", Hint: "힌트", Undo: "되돌리기", "X-Ray": "X-레이", Restart: "다시", Hammer: "해머", Next: "다음", Retry: "다시 하기", "All levels": "레벨 목록", "Loading the puzzle hall…": "퍼즐 홀 준비 중…",
    "100 ARCL a new star · up to 10,000 a day": "새 별마다 100 ARCL · 하루 최대 10,000", "Today: {n} / {m} ARCL": "오늘: {n} / {m} ARCL", "Sign in with a wallet to earn ARCL here": "지갑으로 로그인하면 여기서 ARCL을 받아요", "XP only": "경험치만", "The same 3 puzzles for everyone today": "오늘 모두에게 같은 퍼즐 3개", "This week's most stars": "이번 주 별 랭킹", "No stars yet this week — be the first!": "이번 주 아직 기록이 없어요 — 첫 주인공이 되세요!",
    "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.": "링의 틈이 걸려 있는 링을 향하도록 돌리세요. 탭: 시계 방향 한 칸 · 링을 따라 드래그: 양쪽 방향.",
    "A ring on a metal peg comes off only when its own gap faces the peg.": "금속 핀에 걸린 링은 자기 틈이 핀을 향할 때만 빠져요.", "A lock ring can't turn until the ring with its key has fallen.": "잠금 링은 열쇠 링이 떨어지기 전엔 돌릴 수 없어요.", "Energy rings turn clockwise only.": "에너지 링은 시계 방향으로만 돌아요.", "Gear rings come in pairs: turn one and both turn.": "기어 링은 짝이에요: 하나를 돌리면 둘 다 돌아요.",
    "INFINITY BOSS: free every small ring, then the core unlocks.": "인피니티 보스: 작은 링을 모두 풀면 코어가 열려요.", "Locked — its key ring must fall first": "잠겨 있어요 — 열쇠 링이 먼저 떨어져야 해요", "Clockwise only": "시계 방향만 가능해요", "Can't undo a fall": "떨어진 링은 되돌릴 수 없어요", "No hints left": "남은 힌트가 없어요", "A hint caps this board at 2 stars": "힌트를 쓰면 이 판은 최대 별 2개예요",
    "Tap a ring to knock it off (this board: 1 star at most)": "떨어뜨릴 링을 탭하세요 (이 판은 최대 별 1개)", "CLEAR!": "클리어!", "Sending your clear…": "기록 보내는 중…", "+{n} ARCL": "+{n} ARCL", "Stars already paid on this board": "이 판의 별 보상은 이미 받았어요", "Today's ARCL limit is reached — these stars pay on your next clear": "오늘 ARCL 한도에 도달했어요 — 다음 클리어 때 지급돼요",
    "The reward couldn't be sent — try again later": "보상을 보내지 못했어요 — 잠시 후 다시 해 보세요", "Guest play: sign in to earn ARCL": "게스트 플레이: 로그인하면 ARCL을 받아요", "World XP": "월드 경험치", "INFINITY MASTER!": "인피니티 마스터!", "You cleared all 100 levels. The title is yours.": "100레벨을 모두 클리어했어요. 칭호를 획득했어요.",
    "Clear level {n} first": "먼저 레벨 {n}을 클리어하세요", "The puzzle hall couldn't load: {e}": "퍼즐 홀을 불러오지 못했어요: {e}", "Board": "보드", "{n} stars": "별 {n}개", "New best!": "최고 기록!", "Par {n}": "기준 {n}", "Moves {n}": "이동 {n}", Ready: "준비 완료" },
  zh: { "INFINITY RINGS": "无限之环", "Turn the rings. Unhook them. Clear the board.": "转动圆环，解开扣环，清空棋盘。", Levels: "关卡", Daily: "每日", Endless: "无尽模式", Ranking: "排行", Leave: "离开", Play: "开始", "Level {n}": "第 {n} 关", "Daily {n}": "每日 {n}", "Endless #{n}": "无尽 #{n}",
    Moves: "步数", Par: "标准", Best: "最佳", Hint: "提示", Undo: "撤销", "X-Ray": "透视", Restart: "重来", Hammer: "锤子", Next: "下一关", Retry: "再试", "All levels": "全部关卡", "Loading the puzzle hall…": "正在准备解谜大厅…",
    "100 ARCL a new star · up to 10,000 a day": "每颗新星 100 ARCL · 每天最多 10,000", "Today: {n} / {m} ARCL": "今日：{n} / {m} ARCL", "Sign in with a wallet to earn ARCL here": "用钱包登录即可在这里赚 ARCL", "XP only": "仅经验", "The same 3 puzzles for everyone today": "今天所有人同样的 3 道题", "This week's most stars": "本周星星排行", "No stars yet this week — be the first!": "本周还没有记录——来当第一名吧！",
    "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.": "转动圆环，让缺口对准扣着它的圆环。点按：顺时针一格 · 沿环拖动：任意方向。",
    "A ring on a metal peg comes off only when its own gap faces the peg.": "挂在金属钉上的圆环，只有自己的缺口对准钉子才会脱落。", "A lock ring can't turn until the ring with its key has fallen.": "锁环要等钥匙环掉落后才能转动。", "Energy rings turn clockwise only.": "能量环只能顺时针转。", "Gear rings come in pairs: turn one and both turn.": "齿轮环成对出现：转一个，两个一起转。",
    "INFINITY BOSS: free every small ring, then the core unlocks.": "无限首领：解开所有小环，核心才会解锁。", "Locked — its key ring must fall first": "已锁定——要先让钥匙环掉落", "Clockwise only": "只能顺时针", "Can't undo a fall": "掉落无法撤销", "No hints left": "没有提示了", "A hint caps this board at 2 stars": "使用提示后本局最多 2 星",
    "Tap a ring to knock it off (this board: 1 star at most)": "点一个圆环把它敲掉（本局最多 1 星）", "CLEAR!": "通关！", "Sending your clear…": "正在提交记录…", "+{n} ARCL": "+{n} ARCL", "Stars already paid on this board": "这一关的星星奖励已领取", "Today's ARCL limit is reached — these stars pay on your next clear": "今日 ARCL 已达上限——下次通关时发放",
    "The reward couldn't be sent — try again later": "奖励发送失败——请稍后再试", "Guest play: sign in to earn ARCL": "游客模式：登录后可赚 ARCL", "World XP": "世界经验", "INFINITY MASTER!": "无限大师！", "You cleared all 100 levels. The title is yours.": "你通关了全部 100 关，称号归你了。",
    "Clear level {n} first": "请先通关第 {n} 关", "The puzzle hall couldn't load: {e}": "解谜大厅加载失败：{e}", "Board": "棋盘", "{n} stars": "{n} 星", "New best!": "新纪录！", "Par {n}": "标准 {n}", "Moves {n}": "步数 {n}", Ready: "准备好了" },
  tr: { "INFINITY RINGS": "INFINITY RINGS", "Turn the rings. Unhook them. Clear the board.": "Halkaları çevir, çözülsünler, tahtayı boşalt.", Levels: "Seviyeler", Daily: "Günlük", Endless: "Sonsuz", Ranking: "Sıralama", Leave: "Ayrıl", Play: "Oyna", "Level {n}": "Seviye {n}", "Daily {n}": "Günlük {n}", "Endless #{n}": "Sonsuz #{n}",
    Moves: "Hamle", Par: "Hedef", Best: "En iyi", Hint: "İpucu", Undo: "Geri al", "X-Ray": "Röntgen", Restart: "Baştan", Hammer: "Çekiç", Next: "Sonraki", Retry: "Tekrar", "All levels": "Tüm seviyeler", "Loading the puzzle hall…": "Bulmaca salonu hazırlanıyor…",
    "100 ARCL a new star · up to 10,000 a day": "Her yeni yıldız 100 ARCL · günde en fazla 10.000", "Today: {n} / {m} ARCL": "Bugün: {n} / {m} ARCL", "Sign in with a wallet to earn ARCL here": "Cüzdanla giriş yap, burada ARCL kazan", "XP only": "Sadece XP", "The same 3 puzzles for everyone today": "Bugün herkese aynı 3 bulmaca", "This week's most stars": "Bu haftanın en çok yıldızı", "No stars yet this week — be the first!": "Bu hafta henüz yıldız yok — ilk sen ol!",
    "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.": "Halkayı, açıklığı takılı olduğu halkaya bakana kadar çevir. Dokun: saat yönünde bir adım · etrafında sürükle: iki yön.",
    "A ring on a metal peg comes off only when its own gap faces the peg.": "Metal çiviye takılı halka, ancak kendi açıklığı çiviye bakınca çıkar.", "A lock ring can't turn until the ring with its key has fallen.": "Kilitli halka, anahtar halkası düşmeden dönmez.", "Energy rings turn clockwise only.": "Enerji halkaları sadece saat yönünde döner.", "Gear rings come in pairs: turn one and both turn.": "Dişli halkalar çifttir: birini çevir, ikisi de döner.",
    "INFINITY BOSS: free every small ring, then the core unlocks.": "INFINITY BOSS: tüm küçük halkaları çöz, sonra çekirdek açılır.", "Locked — its key ring must fall first": "Kilitli — önce anahtar halkası düşmeli", "Clockwise only": "Sadece saat yönünde", "Can't undo a fall": "Düşen halka geri alınamaz", "No hints left": "İpucu kalmadı", "A hint caps this board at 2 stars": "İpucu bu tahtayı en fazla 2 yıldızla sınırlar",
    "Tap a ring to knock it off (this board: 1 star at most)": "Düşürmek için bir halkaya dokun (bu tahta: en fazla 1 yıldız)", "CLEAR!": "TEMİZ!", "Sending your clear…": "Sonuç gönderiliyor…", "+{n} ARCL": "+{n} ARCL", "Stars already paid on this board": "Bu tahtanın yıldızları zaten ödendi", "Today's ARCL limit is reached — these stars pay on your next clear": "Bugünün ARCL sınırı doldu — bu yıldızlar bir sonraki temizlemede ödenir",
    "The reward couldn't be sent — try again later": "Ödül gönderilemedi — sonra tekrar dene", "Guest play: sign in to earn ARCL": "Misafir oyunu: ARCL için giriş yap", "World XP": "Dünya XP", "INFINITY MASTER!": "INFINITY MASTER!", "You cleared all 100 levels. The title is yours.": "100 seviyenin hepsini bitirdin. Unvan senin.",
    "Clear level {n} first": "Önce {n}. seviyeyi bitir", "The puzzle hall couldn't load: {e}": "Bulmaca salonu yüklenemedi: {e}", "Board": "Tahta", "{n} stars": "{n} yıldız", "New best!": "Yeni rekor!", "Par {n}": "Hedef {n}", "Moves {n}": "Hamle {n}", Ready: "Hazır" },
};
const TIPS = { first: "Turn a ring until its gap faces the ring it's hooked on. Tap: one step clockwise · drag round it: either way.", peg: "A ring on a metal peg comes off only when its own gap faces the peg.", lock: "A lock ring can't turn until the ring with its key has fallen.", energy: "Energy rings turn clockwise only.", gear: "Gear rings come in pairs: turn one and both turn.", boss: "INFINITY BOSS: free every small ring, then the core unlocks." };

export function createRings(ctx) {
  const { THREE, st, esc } = ctx, L0 = LW[ctx.lang] || {}, T = (s, v) => { const x = L0[s] != null ? L0[s] : null; return x != null ? x.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "")) : ctx.T(s, v); };
  const snd = (k) => { try { const f = ctx.Snd && ctx.Snd[k]; if (f) f.call(ctx.Snd); } catch { /* silent */ } };
  // the drawing's real size (the canvas, not the window: on the phone layout they differ, and a camera set to the window's
  // shape would squash every ring into an oval)
  const view = () => { const c = st.renderer.domElement, r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width || innerWidth, h: r.height || innerHeight }; };
  const phone = () => document.documentElement.classList.contains("wp-pcphone") || (innerWidth < 700 && innerHeight > innerWidth);
  const phys = !ctx.low && !phone();
  let on = false, busy = false, mode = "off", S = null, ui = null, prOrig = 0;
  let clasps = [], pegs = [];
  let L = null, s = null, lvId = "", rings = [], moves = [], hist = [], hintsUsed = 0, hintsLeft = RINGS.HINTS, hammerArmed = false, xray = false, runP = null, boardT = 0, falls = [], doneT = -1;
  let prog = load(), status = null, board = null;

  // ---------------- progress (this device; the server's best stars merged in for a wallet) ----------------
  function load() { try { const j = JSON.parse(localStorage.getItem(SAVE) || "{}"); return { best: j.best || {}, moves: j.moves || {}, endless: j.endless || 1, tips: j.tips || {}, master: !!j.master }; } catch { return { best: {}, moves: {}, endless: 1, tips: {}, master: false }; } }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(prog)); } catch { /* kept for this visit */ } }
  const keyOf = (id) => (/^d:/.test(id) ? "d" + id.slice(2).replace(":", "_") : /^e:/.test(id) ? "e" + id.slice(2) : "c" + id);
  const bestOf = (id) => Math.max(prog.best[keyOf(id)] || 0, (status && status.best && status.best[keyOf(id)]) || 0);
  const cleared1 = () => { let n = 0; for (let i = 1; i <= 100; i++) if (bestOf(String(i)) > 0) n = i; else break; return n; };
  const totalStars = () => { let n = 0; for (let i = 1; i <= 100; i++) n += bestOf(String(i)); return n; };
  const paying = (id) => !/^e:/.test(id) && !!(ctx.sess && ctx.sess());

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
      fragmentShader: "varying vec3 vP; void main(){ float h = vP.y * 0.5 + 0.5; vec3 top = vec3(0.05, 0.10, 0.30), mid = vec3(0.06, 0.08, 0.26), low = vec3(0.02, 0.03, 0.12); vec3 c = mix(low, mix(mid, top, smoothstep(0.5, 0.9, h)), smoothstep(0.2, 0.6, h)); float g = pow(max(0.0, 1.0 - length(vP.xy - vec2(0.0, 0.05)) * 1.6), 3.0); c += vec3(0.12, 0.30, 0.70) * g * 0.45; gl_FragColor = vec4(c, 1.0); }" }));
    scene.add(sky);
    // twinkles: a few hundred points far behind the board
    { const n = ctx.low ? 120 : 320, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 70; p[i * 3 + 1] = (Math.random() - 0.5) * 50; p[i * 3 + 2] = -18 - Math.random() * 20; }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfe8ff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }))); }
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
    S = { scene, cam, sky, boardG, deco, xr, pts, P, pp, pc, pa, geo: {}, props: null, inf: null, portal: null, cx: 0, cy: 0, w: 4, h: 4, comp: null };
    // the props (Meshy: the stellar portal behind the board, two crystal beacons, the ∞ above, a gold clasp)
    const loader = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null;
    S.propsP = loader ? loader.loadAsync("models/world/rings/props.glb?v=" + (ctx.ver || "1")).then((g) => {
      const by = {}; for (const c of g.scene.children.slice()) by[c.name] = c;
      const fit = (o, size) => { const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = size / Math.max(sz.x, sz.y, sz.z, 1e-3); o.scale.multiplyScalar(k); const c = b.getCenter(new THREE.Vector3()).multiplyScalar(k); o.position.sub(c); const w = new THREE.Group(); w.add(o); return w; };
      if (by.portal) { S.portal = fit(by.portal, 1); S.portal.children[0].rotation.x = Math.PI / 2; S.deco.add(S.portal); }
      if (by.inf) { S.inf = fit(by.inf, 1); S.deco.add(S.inf); }
      if (by.crystal) { S.crys = [fit(by.crystal, 1), fit(by.crystal.clone(), 1)]; S.crys.forEach((c) => S.deco.add(c)); }
      if (by.dumbbell) S.clasp = fit(by.dumbbell, 1);
      S.deco.traverse((o) => { if (o.isMesh && o.material) { o.material.envMapIntensity = 1.2; } });
      layoutDeco();
    }).catch((e) => console.warn("rings props:", e)) : Promise.resolve();
  }
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
  const icons = {};
  function icon(kind, col) { // a small canvas badge in a ring's middle: lock, key, energy arrow, gear
    const k = kind + col; if (icons[k]) return icons[k];
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); g.translate(64, 64);
    g.fillStyle = "rgba(8,14,40,.72)"; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.fill(); g.lineWidth = 5; g.strokeStyle = col; g.stroke();
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = "round"; g.lineJoin = "round";
    if (kind === "lock") { g.lineWidth = 8; g.beginPath(); g.arc(0, -8, 15, Math.PI, 0); g.stroke(); g.fillRect(-23, -8, 46, 34); g.fillStyle = "#0a1230"; g.beginPath(); g.arc(0, 6, 5, 0, Math.PI * 2); g.fill(); g.fillRect(-2.5, 6, 5, 11); }
    else if (kind === "key") { g.lineWidth = 7; g.beginPath(); g.arc(-12, 0, 12, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(28, 0); g.moveTo(20, 0); g.lineTo(20, 11); g.moveTo(28, 0); g.lineTo(28, 9); g.stroke(); }
    else if (kind === "energy") { g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 24, -Math.PI * 0.9, Math.PI * 0.55); g.stroke(); const a = Math.PI * 0.55, x = Math.cos(a) * 24, y = Math.sin(a) * 24; g.beginPath(); g.moveTo(x + 12, y - 4); g.lineTo(x - 2, y + 10); g.lineTo(x - 8, y - 9); g.closePath(); g.fill(); g.font = "900 22px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("⚡", 0, 1); }
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
      const mat = waveMat(col, u, { emissive: col, emissiveIntensity: r.core ? 0.3 : 0.1 }), mats = [mat];
      const mesh = new THREE.Mesh(ringGeo(r.r), mat); mesh.rotation.z = u.value; g.add(mesh);
      if (r.k === 1 || r.k === 3 || r.core) { const gm = new THREE.MeshStandardMaterial({ color: r.k === 1 ? 0xe8eef6 : 0xffc23a, metalness: 0.9, roughness: 0.24, emissive: r.k === 1 ? 0x1a2030 : 0x5a3800, emissiveIntensity: 0.35 }); mats.push(gm); const b = new THREE.Mesh(bandGeo(r.r, r.k === 3 ? [Math.PI / 2, Math.PI, Math.PI * 1.5] : [Math.PI * 0.72, Math.PI * 1.28]), gm); mesh.add(b); }
      let ic = null;
      if (r.k === 1 && !r.core) ic = icon("lock", lockCol[i]); else if (r.k === 2) ic = icon("energy", "#38d8ff"); else if (r.k === 3) ic = icon("gear", r.gear % 2 ? "#ff9bd8" : "#b48cff"); else if (lockCol["k" + i]) ic = icon("key", lockCol["k" + i]);
      let spr = null; if (ic) { spr = new THREE.Sprite(ic); spr.scale.setScalar(0.62); spr.position.z = 0.32; spr.renderOrder = 4; g.add(spr); }
      if (r.peg >= 0) { const pm = new THREE.Mesh(pegGeo(), (S.pegM || (S.pegM = new THREE.MeshStandardMaterial({ color: 0xeef3fa, metalness: 0.95, roughness: 0.2, emissive: 0x1a2030, emissiveIntensity: 0.4 }))).clone()); pm.position.set(r.x + DIRS[r.peg][0] * r.r, r.y + DIRS[r.peg][1] * r.r, 0.02); pm.rotation.z = Math.atan2(DIRS[r.peg][1], DIRS[r.peg][0]); S.boardG.add(pm); pegs.push({ m: pm, i }); }
      rings.push({ i, g, mesh, u, mat, mats, col, rot: u.value, target: u.value, shake: 0, hl: 0, spr, gone: false, fall: null, base: r.core ? 0.3 : 0.1 });
    });
    // the clasps: gold where two rings touch, silver on the pegs (made above); each knows its link
    if (!S.goldM) { S.goldM = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.9, roughness: 0.24, emissive: 0x5a3800, emissiveIntensity: 0.35 }); }
    clasps = L.links.map((l) => { const a = L.rings[l[0]], m = new THREE.Mesh(claspGeo(), S.goldM.clone()); const d = DIRS[l[2]]; m.position.set(a.x + d[0] * a.r, a.y + d[1] * a.r, 0.02); m.rotation.z = Math.atan2(d[1], d[0]); S.boardG.add(m); return { m, l, gone: false, t: 0 }; });
    const xs = L.rings.map((r) => [r.x - r.r, r.x + r.r]).flat(), ys = L.rings.map((r) => [r.y - r.r, r.y + r.r]).flat();
    S.cx = (Math.min(...xs) + Math.max(...xs)) / 2; S.cy = (Math.min(...ys) + Math.max(...ys)) / 2; S.w = Math.max(...xs) - Math.min(...xs) + 0.6; S.h = Math.max(...ys) - Math.min(...ys) + 0.6;
    layoutDeco(); paintXray();
  }
  function layoutDeco() {
    if (!S) return; const R = Math.max(S.w, S.h) * 0.62 + 0.8;
    if (S.portal) { S.portal.position.set(S.cx, S.cy, -1.6); S.portal.scale.setScalar(R * 2.15); }
    if (S.inf) { S.inf.position.set(S.cx, S.cy + S.h / 2 + 0.9, -0.4); S.inf.scale.setScalar(phone() ? 1.5 : 1.8); }
    if (S.crys) S.crys.forEach((c, k) => { c.position.set(S.cx + (k ? 1 : -1) * (S.w / 2 + (phone() ? 0.5 : 1.6)), S.cy - S.h / 2 + 0.4, -0.8); c.scale.setScalar(phone() ? 1.2 : 1.9); });
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
    const V = view(), cam = S.cam, H = V.h, k = scaleK() * (V.h / innerHeight), top = (phone() ? 128 : 112) * k, bot = (phone() ? 150 : 140) * k, fh = Math.max(0.35, 1 - (top + bot) / H);
    cam.aspect = V.w / V.h; cam.updateProjectionMatrix();
    const tan = Math.tan((cam.fov * Math.PI) / 360), extra = L && L.boss ? 0.9 : 0.3;
    const d = Math.max((S.h + extra) / fh / (2 * tan), (S.w + extra) / 0.97 / (2 * tan * cam.aspect), 7);
    const vis = 2 * d * tan, ndc = (bot - top) / H, shift = (ndc * vis) / 2, tilt = 0; // straight on: a ring is a true circle
    cam.position.set(S.cx, S.cy - shift - d * Math.sin(tilt), d * Math.cos(tilt)); cam.lookAt(S.cx, S.cy - shift, 0);
  }

  // ---------------- a board ----------------
  function startBoard(id) {
    const Lv = level(id); if (!Lv) { ctx.toast(T("The puzzle hall couldn't load: {e}", { e: "level" })); return; }
    L = Lv; lvId = id; s = stateOf(L); moves = []; hist = []; hintsUsed = 0; hintsLeft = RINGS.HINTS; hammerArmed = false; boardT = 0; doneT = -1;
    makeBoard(); frame(); mode = "play"; ui.sheet.hidden = true; ui.top.hidden = false; ui.bar.hidden = false; ui.root.classList.remove("menu");
    const ss = ctx.sess && ctx.sess();
    runP = paying(id) && ss && ctx.post ? ctx.post({ action: "world-rings-start", ...ss, lv: id }).then((r) => (r && r.ok && r.j && r.j.runId ? r.j : null)).catch(() => null) : Promise.resolve(null);
    paintHud(); tipFor();
  }
  function tipFor() {
    const n = /^\d+$/.test(lvId) ? Number(lvId) : 0, has = (k) => L.rings.some((r) => r.k === k);
    const want = L.boss ? "boss" : n === 1 ? "first" : L.rings.some((r) => r.peg >= 0) && !prog.tips.peg ? "peg" : has(1) && !prog.tips.lock ? "lock" : has(2) && !prog.tips.energy ? "energy" : has(3) && !prog.tips.gear ? "gear" : null;
    if (!want || (want !== "first" && want !== "boss" && prog.tips[want])) { ui.tip.hidden = true; return; }
    prog.tips[want] = 1; save(); ui.tip.innerHTML = `<b>${esc(T(TIPS[want]))}</b>`; ui.tip.hidden = false; clearTimeout(ui.tipT); ui.tipT = setTimeout(() => { if (ui) ui.tip.hidden = true; }, 9000);
  }
  function doMove(i, dir) {
    if (mode !== "play" || !s.alive[i]) return false;
    if (hammerArmed) { hammerArmed = false; ui.root.classList.remove("hammer"); const before = cloneState(s), w = hammerOn(L, s, i); if (!w) return false; moves.push([i, 0]); hist.push({ s: before, fell: true }); snd("ko"); schedule(w); paintHud(); return true; }
    const set = turnSet(L, s, i, dir);
    if (!set) { const r = L.rings[i]; rings[i].shake = 0.35; snd("bad"); flash(r.k === 2 && dir === 1 ? T("Clockwise only") : T("Locked — its key ring must fall first")); return false; }
    const before = cloneState(s), w = turn(L, s, i, dir);
    moves.push([i, dir]); hist.push({ s: before, fell: w.length > 0 });
    for (const j of set) rings[j].target += dir * STEP;
    snd("pick"); if (navigator.vibrate && ctx.coarse) try { navigator.vibrate(8); } catch { /* fine */ }
    schedule(w); paintHud(); paintXray(); return true;
  }
  function schedule(waves) { waves.forEach((w, k) => w.forEach((i) => falls.push({ i, at: boardT + 0.16 + k * 0.22 }))); }
  function drop(i) {
    const R = rings[i]; if (!R || R.gone) return; R.gone = true; const r = L.rings[i];
    R.fall = { t: 0, vx: (r.x - S.cx) * 0.6 + (Math.random() - 0.5) * 1.4, vy: 2.6 + Math.random() * 1.2, vz: 1.5 + Math.random(), sx: (Math.random() - 0.5) * 6, sy: (Math.random() - 0.5) * 6 };
    burst(r.x, r.y, R.col, r.core ? 60 : 26, r.core ? 1.6 : 1); snd(r.core ? "win" : "unlock");
    if (R.spr) R.spr.visible = false;
    paintXray();
  }
  function undo() {
    if (mode !== "play" || !hist.length) return;
    const h = hist[hist.length - 1]; if (h.fell) { flash(T("Can't undo a fall")); snd("bad"); return; }
    hist.pop(); const m = moves.pop(); s = h.s;
    const set = L.rings[m[0]].gear >= 0 ? L.gears[L.rings[m[0]].gear].filter((j) => s.alive[j]) : [m[0]];
    for (const j of set) rings[j].target -= m[1] * STEP; snd("pick"); paintHud(); paintXray();
  }
  function useHint() {
    if (mode !== "play") return; if (hintsLeft <= 0) { flash(T("No hints left")); return; }
    const h = hintOf(L, s); if (!h) return; hintsLeft--; if (!hintsUsed) flash(T("A hint caps this board at 2 stars")); hintsUsed++;
    rings[h[0]].hl = 2.4; rings[h[0]].hlDir = h[1]; ui.arrow.textContent = h[1] > 0 ? "↺" : "↻"; ui.arrowRing = h[0]; ui.arrowT = 2.4; snd("up"); paintHud();
  }
  function restart() { if (mode === "play" || mode === "done") { const id = lvId; runP = null; startBoard(id); } }
  function flash(t) { ui.flash.textContent = t; ui.flash.hidden = false; ui.flash.classList.remove("go"); void ui.flash.offsetWidth; ui.flash.classList.add("go"); clearTimeout(ui.flashT); ui.flashT = setTimeout(() => { if (ui) ui.flash.hidden = true; }, 1800); }

  // ---------------- the clear ----------------
  async function finish() {
    mode = "done"; ui.tip.hidden = true; const stars = starsOf(L, s.moves, s.hammer, hintsUsed), key = keyOf(lvId), was = bestOf(lvId);
    const newBest = stars > (prog.best[key] || 0); if (newBest) prog.best[key] = stars; if (!prog.moves[key] || s.moves < prog.moves[key]) prog.moves[key] = s.moves;
    const n = /^\d+$/.test(lvId) ? Number(lvId) : 0, endless = /^e:/.test(lvId); if (endless) prog.endless = Math.max(prog.endless, Number(lvId.slice(2)) + 1); save();
    const xp = endless ? 20 : /^d:/.test(lvId) ? (was ? 5 : 30) : was ? 5 : Math.min(50, 10 + Math.floor(n * 0.4));
    if (ctx.gain && xp > 0) try { ctx.gain(xp, "rings"); } catch { /* the clear still counts */ }
    burst(S.cx, S.cy, 0x8ff0ff, 90, 2.2); snd("win");
    const sheet = ui.sheet, signed = paying(lvId);
    sheet.innerHTML = `<div class="ir-done"><h3>${esc(T("CLEAR!"))}</h3><div class="ir-stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? "on" : ""}" style="animation-delay:${0.15 + k * 0.22}s">★</i>`).join("")}</div>
      <p class="ir-sum">${esc(T("Moves {n}", { n: s.moves }))} · ${esc(T("Par {n}", { n: L.par }))}${newBest && was ? ` · <b>${esc(T("New best!"))}</b>` : ""}</p>
      <div class="ir-pay"><b>${signed ? esc(T("Sending your clear…")) : endless ? esc(T("XP only")) : esc(T("Guest play: sign in to earn ARCL"))}</b></div>
      <p class="ir-xp">+${xp} ${esc(T("World XP"))}</p>
      <div class="ir-acts">${n && n < 100 || endless ? `<button type="button" class="ir-btn go" data-a="next">${esc(T("Next"))} ▶</button>` : ""}<button type="button" class="ir-btn" data-a="retry">${esc(T("Retry"))}</button><button type="button" class="ir-btn" data-a="menu">${esc(T("All levels"))}</button></div></div>`;
    setTimeout(() => { if (mode === "done" && ui) { sheet.hidden = false; ui.bar.hidden = true; snd("level"); } }, 650);
    if (n === 100 && stars > 0 && !prog.master) { prog.master = true; save(); try { if (ctx.onMaster) ctx.onMaster(); } catch { /* the title waits for the next visit */ } setTimeout(() => ctx.toast(`<b>${esc(T("INFINITY MASTER!"))}</b> ${esc(T("You cleared all 100 levels. The title is yours."))}`), 1400); }
    if (!signed) return;
    const box = sheet.querySelector(".ir-pay");
    let res = null; try { const rr = await runP; if (rr) res = await ctx.post({ action: "world-rings-end", ...ctx.sess(), runId: rr.runId, moves, hints: hintsUsed }); } catch { res = null; }
    if (!box.isConnected) return;
    const j = res && res.ok && res.j;
    if (!j) { box.innerHTML = `<b>${esc(T("The reward couldn't be sent — try again later"))}</b>`; return; }
    if (status) { status.today = j.today; status.best = { ...(status.best || {}), [key]: Math.max(j.stars, (status.best || {})[key] || 0) }; if (j.master) status.master = true; }
    if (j.credited > 0) { box.classList.add("paid"); box.innerHTML = `<b>${esc(T("+{n} ARCL", { n: fmt(j.credited) }))}</b>`; snd("coin"); if (ctx.refresh) ctx.refresh(); }
    else box.innerHTML = `<b>${esc(j.why === "cap" ? T("Today's ARCL limit is reached — these stars pay on your next clear") : T("Stars already paid on this board"))}</b>`;
    if (j.master && ctx.onMaster) try { ctx.onMaster(); } catch { /* fine */ }
  }

  // ---------------- the lobby ----------------
  async function readStatus() {
    const ss = ctx.sess && ctx.sess(); const jobs = [fetch("/api/social?world=rings-top").then((r) => (r.ok ? r.json() : null)).then((j) => { board = j; }).catch(() => {})];
    if (ss) jobs.push(fetch("/api/social?world=rings&wallet=" + encodeURIComponent(String(ss.wallet).toLowerCase())).then((r) => (r.ok ? r.json() : null)).then((j) => { status = j; if (j && j.master) { if (!prog.master) { prog.master = true; save(); } try { if (ctx.onMaster) ctx.onMaster(); } catch { /* the title waits */ } } }).catch(() => {}));
    await Promise.race([Promise.all(jobs), new Promise((ok) => setTimeout(ok, 4000))]);
  }
  let tab = "levels";
  function lobby() {
    mode = "lobby"; ui.top.hidden = true; ui.bar.hidden = true; ui.tip.hidden = true; ui.root.classList.add("menu"); clearBoard(); S.xr.visible = false;
    L = level(String(Math.min(100, cleared1() + 1))) || level("1"); s = stateOf(L); makeBoard(); frame(); // the next level stands behind the menu
    const signed = !!(ctx.sess && ctx.sess()), cap = (status && status.cap) || RINGS.DAY_ARCL, max = cleared1(), day = seoulDay();
    const tabs = [["levels", T("Levels")], ["daily", T("Daily")], ["endless", T("Endless")], ["rank", T("Ranking")]];
    let pane = "";
    if (tab === "levels") pane = `<div class="ir-grid">${Array.from({ length: 100 }, (_, k) => { const n = k + 1, b = bestOf(String(n)), open = n <= max + 1; return `<button type="button" class="ir-lv${open ? "" : " shut"}${n === 100 ? " boss" : ""}${b ? " done" : ""}" data-lv="${n}"><b>${n === 100 ? "∞" : n}</b><small>${open ? "★".repeat(b) + "☆".repeat(3 - b) : "🔒"}</small></button>`; }).join("")}</div>`;
    else if (tab === "daily") pane = `<p class="ir-note">${esc(T("The same 3 puzzles for everyone today"))} · ${day}</p><div class="ir-daily">${[0, 1, 2].map((k) => { const id = `d:${day}:${k}`, b = bestOf(id); return `<button type="button" class="ir-day" data-lv="${id}"><b>${esc(T("Daily {n}", { n: k + 1 }))}</b><small>${"★".repeat(b) + "☆".repeat(3 - b)}</small><i>${esc(T("Play"))}</i></button>`; }).join("")}</div>`;
    else if (tab === "endless") pane = `<div class="ir-endless"><b>${esc(T("Endless #{n}", { n: prog.endless }))}</b><small>${esc(T("XP only"))}</small><button type="button" class="ir-btn go" data-lv="e:${prog.endless}">${esc(T("Play"))}</button></div>`;
    else pane = `<p class="ir-note">${esc(T("This week's most stars"))}</p><ol class="ir-rank">${board && board.top && board.top.length ? board.top.map((x) => `<li><b>${esc(x.name || x.w)}</b><span>★ ${x.stars}</span></li>`).join("") : `<li class="none">${esc(T("No stars yet this week — be the first!"))}</li>`}</ol>`;
    ui.sheet.innerHTML = `<div class="ir-lobby"><h2><span>♾️</span> ${esc(T("INFINITY RINGS"))}</h2><p class="ir-sub">${esc(T("Turn the rings. Unhook them. Clear the board."))}</p>
      <div class="ir-prog"><i style="width:${(totalStars() / 300) * 100}%"></i><b>★ ${totalStars()} / 300</b></div>
      <div class="ir-tabs">${tabs.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${esc(t)}</button>`).join("")}</div>
      <div class="ir-pane">${pane}</div>
      <p class="ir-earn">${signed ? esc(T("100 ARCL a new star · up to 10,000 a day")) + " · " + esc(T("Today: {n} / {m} ARCL", { n: fmt((status && status.today) || 0), m: fmt(cap) })) : esc(T("Sign in with a wallet to earn ARCL here"))}</p>
      <button type="button" class="ir-btn" data-a="leave">${esc(T("Leave"))}</button></div>`;
    ui.sheet.hidden = false;
    const cur = ui.sheet.querySelector(".ir-lv:not(.done):not(.shut)"); if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ block: "center" }); } catch { /* fine */ }
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
  }
  function pm(e) {
    if (!drag.on || e.pointerId !== drag.id) return; const p = boardAt(e); if (!p) return; const r = L.rings[drag.ring];
    if (Math.hypot(p.x - r.x, p.y - r.y) < 0.35 * r.r) return;
    const a = Math.atan2(p.y - r.y, p.x - r.x); let da = a - drag.a; da = Math.atan2(Math.sin(da), Math.cos(da)); drag.a = a; drag.acc += da;
    while (drag.acc >= STEP * 0.8) { drag.acc -= STEP; drag.stepped = true; if (!doMove(drag.ring, 1)) { drag.acc = 0; break; } }
    while (drag.acc <= -STEP * 0.8) { drag.acc += STEP; drag.stepped = true; if (!doMove(drag.ring, -1)) { drag.acc = 0; break; } }
  }
  function pu(e) {
    if (!drag.on || e.pointerId !== drag.id) return; drag.on = false; if (rings[drag.ring]) rings[drag.ring].press = 0;
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
      if (b.dataset.lv) { const id = b.dataset.lv; if (/^\d+$/.test(id) && Number(id) > cleared1() + 1) { flash(T("Clear level {n} first", { n: cleared1() + 1 })); snd("bad"); return; } snd("enter"); startBoard(id); return; }
      const a = b.dataset.a;
      if (a === "leave") leave(); else if (a === "menu") lobby(); else if (a === "hint") useHint(); else if (a === "undo") undo(); else if (a === "restart") restart();
      else if (a === "xray") { xray = !xray; b.classList.toggle("on", xray); paintXray(); flash(T("X-Ray")); }
      else if (a === "hammer") { if (s.hammer >= RINGS.HAMMERS) return; hammerArmed = !hammerArmed; root.classList.toggle("hammer", hammerArmed); if (hammerArmed) flash(T("Tap a ring to knock it off (this board: 1 star at most)")); }
      else if (a === "retry") restart();
      else if (a === "next") { const n = /^\d+$/.test(lvId) ? Number(lvId) : 0; startBoard(/^e:/.test(lvId) ? "e:" + prog.endless : String(Math.min(100, n + 1))); }
    });
    addEventListener("resize", fit); fit();
  }
  function paintHud() {
    if (!ui || !L) return;
    ui.title.textContent = /^d:/.test(lvId) ? T("Daily {n}", { n: Number(lvId.slice(-1)) + 1 }) : /^e:/.test(lvId) ? T("Endless #{n}", { n: lvId.slice(2) }) : L.boss ? "INFINITY BOSS" : T("Level {n}", { n: lvId });
    ui.mv.textContent = s.moves; ui.par.textContent = L.par;
    const b = bestOf(lvId); ui.best.textContent = "★".repeat(b) + "☆".repeat(3 - b);
    // the IQ line (a playful number that climbs with the level) and the star gauge: full at the start, it drains as
    // moves pass par (3★) and par + a margin (2★); a hint caps it at 2★, the hammer at 1★
    const n = /^\d+$/.test(lvId) ? Number(lvId) : /^d:/.test(lvId) ? [32, 56, 86][Number(lvId.slice(-1))] : 90, extra = Math.max(2, Math.ceil(L.par * 0.5)), max = L.par + extra * 2;
    ui.iq.textContent = "IQ = " + (40 + Math.round(n * 0.6));
    const pj = starsOf(L, s.moves, s.hammer, hintsUsed), fill = Math.max(0.03, 1 - s.moves / max);
    ui.gauge.style.setProperty("--f", fill.toFixed(3)); ui.gauge.style.setProperty("--p3", (1 - L.par / max).toFixed(3)); ui.gauge.style.setProperty("--p2", (1 - (L.par + extra) / max).toFixed(3));
    ui.gauge.querySelector(".s3").classList.toggle("on", pj >= 3); ui.gauge.querySelector(".s2").classList.toggle("on", pj >= 2); ui.gauge.querySelector(".s1").classList.toggle("on", pj >= 1);
    ui.hn.textContent = hintsLeft; ui.hm.textContent = RINGS.HAMMERS - s.hammer; ui.bar.querySelector('[data-a="hammer"]').disabled = s.hammer >= RINGS.HAMMERS; ui.bar.querySelector('[data-a="undo"]').disabled = !hist.length;
  }

  // ---------------- each frame ----------------
  let lastNow = 0, frameMs = 16;
  const tv = new THREE.Vector3();
  function tick(dt0, t) {
    const now = performance.now(), dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : dt0; lastNow = now; frameMs += (dt * 1000 - frameMs) * 0.05;
    if (mode === "play" || mode === "done") boardT += dt;
    while (falls.length && falls[0].at <= boardT) drop(falls.shift().i);
    if (mode === "play" && !falls.length && L && cleared(s) && rings.every((r) => !r.fall || r.fall.t > 0.5)) { if (doneT < 0) doneT = boardT; if (boardT - doneT > 0.35) finish(); }
    for (const R of rings) {
      R.rot += (R.target - R.rot) * Math.min(1, dt * 20); R.mesh.rotation.z = R.rot;
      let ox = 0; if (R.shake > 0) { R.shake = Math.max(0, R.shake - dt); ox = Math.sin(t * 70) * 0.06 * (R.shake / 0.35); }
      const r = L.rings[R.i];
      if (R.fall) { const f = R.fall; f.t += dt; f.vy -= 14 * dt; R.g.position.x += f.vx * dt; R.g.position.y += f.vy * dt; R.g.position.z += f.vz * dt; R.g.rotation.x += f.sx * dt; R.g.rotation.y += f.sy * dt; const k = Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.6); R.g.scale.setScalar(Math.max(0.001, k)); if (f.t > 1.3 && R.g.visible) R.g.visible = false; }
      else R.g.position.x = r.x + ox;
      if (R.hl > 0) R.hl = Math.max(0, R.hl - dt);
      const glow = R.base + (R.press ? 0.35 : 0) + (R.hl > 0 ? 0.45 + Math.sin(t * 9) * 0.35 : 0) + (r.k === 2 ? Math.sin(t * 3 + R.i) * 0.08 : 0);
      for (const m of R.mats) if (m === R.mat) m.emissiveIntensity = glow;
      if (R.spr && !R.fall) R.spr.visible = !(r.k === 1 && !r.core && r.key >= 0 && !s.alive[r.key]); // a lock's badge goes once its key has fallen
    }
    // clasps: green while open; gone (a pop) once either ring has fallen; pegs go with their ring
    for (const c of clasps) {
      if (c.gone) { if (c.m.visible) { c.t += dt; c.m.scale.setScalar(Math.max(0.001, 1 - c.t * 4)); if (c.t > 0.25) c.m.visible = false; } continue; }
      const A = rings[c.l[0]], B = rings[c.l[1]]; if (A.gone || B.gone) { c.gone = true; burst(c.m.position.x, c.m.position.y, 0xffd23a, 10, 0.6); continue; }
      const open = s.g[c.l[0]] === c.l[2] || s.g[c.l[1]] === c.l[3]; c.m.material.emissive.setHex(open ? 0x1bff7a : 0x5a3800); c.m.material.emissiveIntensity = open ? 0.55 + Math.sin(t * 6) * 0.2 : 0.35;
    }
    for (const p of pegs) { const R = rings[p.i]; if (R.gone && p.m.visible) p.m.visible = false; else if (!R.gone) { const open = s.g[p.i] === L.rings[p.i].peg; p.m.material.emissive.setHex(open ? 0x1bff7a : 0x1a2030); p.m.material.emissiveIntensity = open ? 0.6 : 0.4; } }
    if (S.deco) S.deco.visible = mode === "lobby";
    // the hint's arrow over its ring
    if (ui && ui.arrowT > 0 && L && ui.arrowRing >= 0 && s.alive[ui.arrowRing]) { ui.arrowT -= dt; const r = L.rings[ui.arrowRing]; tv.set(r.x, r.y + r.r + 0.35, 0.4).project(S.cam); const k = scaleK(); ui.arrow.style.transform = `translate(${((tv.x + 1) / 2) * innerWidth / k}px, ${((1 - tv.y) / 2) * innerHeight / k}px) translate(-50%, -100%)`; ui.arrow.hidden = false; }
    else if (ui) ui.arrow.hidden = true;
    // sparkles
    let anyP = false;
    for (let q = 0; q < S.P.length; q++) { const p = S.P[q]; if (p.life <= 0) { S.pa[q] = 0; continue; } anyP = true; p.t += dt; if (p.t >= p.life) { p.life = 0; S.pa[q] = 0; continue; } p.vy -= 4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.985; S.pp[q * 3] = p.x; S.pp[q * 3 + 1] = p.y; S.pp[q * 3 + 2] = p.z; S.pa[q] = 1 - p.t / p.life; }
    if (anyP || S.pAny) { S.pts.geometry.attributes.position.needsUpdate = true; S.pts.geometry.attributes.aA.needsUpdate = true; } S.pAny = anyP;
    if (S.inf) { S.inf.rotation.y = Math.sin(t * 0.6) * 0.5; S.inf.position.y = S.cy + S.h / 2 + 0.9 + Math.sin(t * 1.4) * 0.08; }
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
      await Promise.all([S.propsP, readStatus()]);
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
    debug: () => ({ mode, lv: lvId, moves: s ? s.moves : 0, par: L ? L.par : 0, alive: s ? s.alive.filter(Boolean).length : 0, n: L ? L.rings.length : 0, fms: Math.round(frameMs), stars: L && s ? starsOf(L, s.moves, s.hammer, hintsUsed) : 0, hints: hintsUsed, falling: rings.filter((r) => r.fall).length, queued: falls.length, bt: +boardT.toFixed(2), round: L && S ? (() => { const V = view(), r = L.rings[0], P = (x, y) => { const v = new THREE.Vector3(x, y, 0).project(S.cam); return [((v.x + 1) / 2) * V.w, ((1 - v.y) / 2) * V.h]; }; const a = P(r.x - r.r, r.y), b = P(r.x + r.r, r.y), c = P(r.x, r.y - r.r), d = P(r.x, r.y + r.r); return +((b[0] - a[0]) / (c[1] - d[1])).toFixed(3); })() : 0, cv: (() => { const V = view(); return [Math.round(V.w), Math.round(V.h), innerWidth, innerHeight].join("x"); })(), free: L && s ? L.rings.map((r, i) => isFree(L, s, i)).filter(Boolean).length : 0 }),
    start: (id) => startBoard(String(id)), move: (i, d) => doMove(i, d), menu: () => lobby(), tab: (k) => { tab = k; lobby(); },
    solve: async (gap = 120) => { const { plan } = await import("./world-rings-engine.js"); const p = plan(L, s, 10, 2) || []; for (const m of p) { if (mode !== "play") break; doMove(m[0], m[1]); await new Promise((ok) => setTimeout(ok, gap)); } return p.length; },
    unlockAll: () => { for (let i = 1; i <= 99; i++) prog.best["c" + i] = prog.best["c" + i] || 1; save(); },
  };
}
