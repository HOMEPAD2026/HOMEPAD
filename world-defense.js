// world-defense.js — AC Defense, a game-in-game in a separate arena made from the plaza (loaded the first time it's
// entered: world-play.js import()s it, so it costs nothing until then). Protect the Core (the fountain): 30 s to place
// towers on the ring of pads, then waves of scammers from four gates walk to the Core (the combat's own scammers with a
// `tgt` — world-combat.js tgtAI — and you can still fight them), 15 s of break, a boss on every 5th wave, until the Core
// falls or you quit. Towers cost SCRAP (a run's own, never ARCL), sell for half, upgrade to level 3. The rules and the
// wave table are in world-defense-data.js; the run is checked and paid by api/_world-defense.mjs (ARCL, kind "defense").
//
// createDefense(ctx) → { start(), quit(), active(), tick(dt, t) }
//   ctx: { THREE, planet, st, T, lang, esc, toast, Snd, vfx, parts, combat, coarse, reduce, keep: [objects kept in the arena],
//          sess(), post(body), place(x, z) (stand the player there), setArena(r) (walk limit, 0 = none), feed(html) }
import { ARENA, BUILD_S, BREAK_S, MAX_TOWERS, CORE_HP, START_SCRAP, CAP, TOWERS, TOWER_IDS, upCost, refund, padAt, gateAt, waveOf, killScrap, clearScrap, isBoss } from "./world-defense-data.js";

const LW = {
  ko: { "AC Defense": "AC 디펜스", Core: "코어", Wave: "웨이브", Build: "건설", Break: "휴식", Fight: "전투", Scrap: "고철", "Start wave": "웨이브 시작", Quit: "그만두기", Shock: "전격", Frost: "냉기", Flame: "화염", Barrier: "방벽", "Chain zap": "연쇄 번개", "Slow aura": "감속 오라", "Burn over time": "지속 화상", "Blocks a lane": "길 막기", Upgrade: "강화", Sell: "판매", Close: "닫기", Level: "레벨", Max: "최대",
    "Place a tower": "타워 설치", "Boss wave!": "보스 웨이브!", "Wave {n} cleared": "웨이브 {n} 클리어", "The Core fell": "코어가 무너졌어요", "Waves cleared": "클리어한 웨이브", "Knock-outs": "처치", "ARCL earned": "획득 ARCL", "Weekly rank": "주간 순위", "Play again": "다시 하기", Exit: "나가기", "Sign in to earn ARCL": "로그인하면 ARCL을 받아요", "No more rewarded runs today": "오늘은 보상 한도에 도달했어요",
    "All eight pads are taken": "패드 8개가 모두 찼어요", "Not enough scrap": "고철이 부족해요", "The Barrier broke": "방벽이 부서졌어요", "Defend the Core": "코어를 지켜라", "Rewards aren't available right now": "지금은 보상을 받을 수 없어요", "Getting ready": "준비 중", "Best this week": "이번 주 최고", "waves": "웨이브", "Core under attack": "코어 공격받는 중", "Quit the run?": "그만둘까요?", "Keep going": "계속하기", "Next wave in {n} s": "다음 웨이브 {n}초", "Towers {a}/{b}": "타워 {a}/{b}", "Tap a pad to build": "패드를 눌러 건설" },
  zh: { "AC Defense": "AC 防御", Core: "核心", Wave: "波次", Build: "建造", Break: "休息", Fight: "战斗", Scrap: "废料", "Start wave": "开始波次", Quit: "退出", Shock: "电击", Frost: "冰霜", Flame: "火焰", Barrier: "屏障", "Chain zap": "连锁闪电", "Slow aura": "减速光环", "Burn over time": "持续灼烧", "Blocks a lane": "封锁通道", Upgrade: "升级", Sell: "出售", Close: "关闭", Level: "等级", Max: "满级",
    "Place a tower": "放置塔", "Boss wave!": "首领波次！", "Wave {n} cleared": "第 {n} 波已清除", "The Core fell": "核心被攻破", "Waves cleared": "清除波次", "Knock-outs": "击败", "ARCL earned": "获得 ARCL", "Weekly rank": "本周排名", "Play again": "再来一次", Exit: "离开", "Sign in to earn ARCL": "登录后可获得 ARCL", "No more rewarded runs today": "今天的奖励次数已用完",
    "All eight pads are taken": "八个平台都已占用", "Not enough scrap": "废料不足", "The Barrier broke": "屏障被摧毁", "Defend the Core": "守护核心", "Rewards aren't available right now": "暂时无法领取奖励", "Getting ready": "准备中", "Best this week": "本周最佳", "waves": "波", "Core under attack": "核心遭到攻击", "Quit the run?": "要退出吗？", "Keep going": "继续", "Next wave in {n} s": "{n} 秒后下一波", "Towers {a}/{b}": "塔 {a}/{b}", "Tap a pad to build": "点击平台来建造" },
  tr: { "AC Defense": "AC Savunma", Core: "Çekirdek", Wave: "Dalga", Build: "İnşa", Break: "Mola", Fight: "Savaş", Scrap: "Hurda", "Start wave": "Dalgayı başlat", Quit: "Çık", Shock: "Şok", Frost: "Buz", Flame: "Alev", Barrier: "Bariyer", "Chain zap": "Zincir şimşek", "Slow aura": "Yavaşlatma aurası", "Burn over time": "Süregelen yanık", "Blocks a lane": "Yolu tıkar", Upgrade: "Yükselt", Sell: "Sat", Close: "Kapat", Level: "Seviye", Max: "Maks",
    "Place a tower": "Kule yerleştir", "Boss wave!": "Patron dalgası!", "Wave {n} cleared": "{n}. dalga temizlendi", "The Core fell": "Çekirdek düştü", "Waves cleared": "Temizlenen dalga", "Knock-outs": "Yenilen", "ARCL earned": "Kazanılan ARCL", "Weekly rank": "Haftalık sıra", "Play again": "Tekrar oyna", Exit: "Çıkış", "Sign in to earn ARCL": "ARCL için giriş yap", "No more rewarded runs today": "Bugünkü ödüllü oyun hakkı doldu",
    "All eight pads are taken": "Sekiz platformun hepsi dolu", "Not enough scrap": "Yeterli hurda yok", "The Barrier broke": "Bariyer kırıldı", "Defend the Core": "Çekirdeği koru", "Rewards aren't available right now": "Ödüller şu an alınamıyor", "Getting ready": "Hazırlanıyor", "Best this week": "Bu haftanın en iyisi", "waves": "dalga", "Core under attack": "Çekirdek saldırı altında", "Quit the run?": "Bırakılsın mı?", "Keep going": "Devam et", "Next wave in {n} s": "Sonraki dalga {n} sn", "Towers {a}/{b}": "Kule {a}/{b}", "Tap a pad to build": "Kurmak için bir platforma dokun" },
};
const BOSSES = [{ name: "The Spam King", model: "EyeDrone", scale: 2.1, y: 2.4, tint: 0xff4d6d }, { name: "The Free Mint", model: "QuadShell", scale: 2.0, y: 0.9, tint: 0xffc861 }, { name: "The Honeypot Queen", model: "Trilobite", scale: 2.1, y: 1.0, tint: 0xb48cff }];
const HOTKEY = { shock: "S", frost: "F", flame: "B", barrier: "W" };

export function createDefense(ctx) {
  const { THREE, planet, st, vfx: VX, parts, Snd, combat } = ctx;
  const LWL = LW[ctx.lang] || {};
  const T = (s, v) => { let t = LWL[s] != null ? LWL[s] : s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
  const esc = ctx.esc, V3 = THREE.Vector3, TAU = Math.PI * 2;
  const cap = ctx.coarse ? CAP.coarse : CAP.desk;
  let on = false, phase = "idle", wave = 1, cleared = 0, kills = 0, scrap = 0, coreHp = CORE_HP, timer = 0, queue = [], cur = null, wt = 0, acc = 0, flash = 0;
  let lost = false, run = null, t0 = 0, lastStart = 0, seed = (Math.random() * 4294967296) >>> 0, offline = false, result = null, sel = -1, hurtSnd = 0;
  const towers = new Array(ARENA.pads).fill(null), hidden = [];
  let root = null, dome = null, geo = null, ui = null, padEls = [], padBtns = [], gates = [];

  // ---------------- the arena: what stays, what goes ----------------
  const KEEP = /^(ground|combat|particles|smoke|pet|grass|puddles|clouds|ambient|vfx|live-band)$/;
  const keeps = (c) => KEEP.test(c.name || "") || (ctx.keep || []).includes(c) || c.isLight || c === root;
  function hideWorld() { hidden.length = 0; for (const c of planet.children) if (c.visible && !keeps(c)) { c.visible = false; hidden.push(c); } }
  function showWorld() { for (const c of hidden) c.visible = true; hidden.length = 0; }

  // ---------------- meshes ----------------
  const mat = (c, e = 1, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.45, metalness: 0.2, ...o });
  const add = (m) => { geo.push(m.geometry); return m; };
  function build() {
    geo = []; root = new THREE.Group(); root.name = "defense"; planet.add(root);
    const baseM = new THREE.MeshStandardMaterial({ color: 0x25324a, roughness: 0.6, metalness: 0.4 });
    // the pads
    for (let i = 0; i < ARENA.pads; i++) {
      const p = padAt(i), g = new THREE.Group(); g.position.set(p.x, 0.05, p.z);
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 32), mat(0x35d8d0, 1.6))); ring.rotation.x = Math.PI / 2;
      const disc = add(new THREE.Mesh(new THREE.CircleGeometry(0.9, 28), new THREE.MeshBasicMaterial({ color: 0x35d8d0, transparent: true, opacity: 0.16, depthWrite: false }))); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02;
      g.add(ring, disc); g.userData = { ring, disc }; root.add(g); padEls[i] = { g, x: p.x, z: p.z };
    }
    // the four gates at the plaza's edge, facing the Core
    for (let i = 0; i < 4; i++) {
      const p = gateAt(i), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(-p.x, -p.z);
      const pm = mat(0xff4d6d, 0.9), l = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), pm)), r = l.clone(), top = add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.4), pm));
      l.position.set(-1.5, 1.6, 0); r.position.set(1.5, 1.6, 0); top.position.y = 3.3;
      const gl = add(new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }))); gl.position.y = 1.7;
      g.add(l, r, top, gl); root.add(g); gates.push(g);
    }
    // the wall of light at the plaza's edge, and the Core's dome (it flashes when hit)
    const wall = add(new THREE.Mesh(new THREE.CylinderGeometry(ARENA.r + 0.5, ARENA.r + 0.5, 1.1, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))); wall.position.y = 0.55; root.add(wall);
    dome = add(new THREE.Mesh(new THREE.SphereGeometry(ARENA.coreR, 28, 14, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))); root.add(dome);
    root.userData.baseM = baseM;
  }
  function teardown() {
    if (!root) return;
    planet.remove(root);
    root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); } });
    root = null; dome = null; geo = null; padEls = []; gates = [];
  }
  const towerMesh = (id, lvl) => {
    const d = TOWERS[id], g = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.5, 12), root.userData.baseM); base.position.y = 0.25; g.add(base);
    const m = mat(d.color, 1.2); let top;
    if (id === "shock") { top = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), m); top.position.y = 1.6; const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 8), root.userData.baseM); rod.position.y = 0.95; g.add(rod); for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 5), m); const a = (i / 3) * TAU; p.position.set(Math.cos(a) * 0.4, 1.35, Math.sin(a) * 0.4); p.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(p); } }
    else if (id === "frost") { top = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat(d.color, 1.1, { transparent: true, opacity: 0.88 })); top.scale.y = 1.6; top.position.y = 1.5; }
    else if (id === "flame") { const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 0.4, 10), root.userData.baseM); bowl.position.y = 0.7; g.add(bowl); top = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), mat(d.color, 1.8)); top.position.y = 1.5; }
    else { top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.3, 0.35), mat(d.color, 0.7)); top.position.y = 0.95; g.remove(base); }
    g.add(top); g.userData.top = top;
    for (let i = 0; i < lvl; i++) { const pip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23a })); pip.position.set((i - (lvl - 1) / 2) * 0.28, id === "barrier" ? 1.8 : 2.3, 0); g.add(pip); }
    if (id === "frost") { const ar = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); ar.rotation.x = -Math.PI / 2; ar.position.y = 0.08; ar.scale.setScalar(d.r[lvl - 1]); g.add(ar); g.userData.aura = ar; }
    return g;
  };
  function setTower(i, id, lvl, paid) {
    const old = towers[i], p = padEls[i];
    if (old) { p.g.remove(old.mesh); disposeTree(old.mesh); }
    const mesh = towerMesh(id, lvl), tw = { i, id, lvl, paid, mesh, x: p.x, z: p.z, cd: 0.3, acc: 0, hp: id === "barrier" ? TOWERS.barrier.hp[lvl - 1] : 0 };
    if (id === "barrier") { mesh.rotation.y = -padAt(i).a + Math.PI / 2; tw.goal = { x: p.x, z: p.z, r: 1.15, hit: (m) => barrierHit(tw, m) }; }
    p.g.add(mesh); towers[i] = tw; paintPad(i); return tw;
  }
  function disposeTree(o) { o.traverse((x) => { if (x.isMesh && x.material !== root.userData.baseM) { x.geometry.dispose(); x.material.dispose(); } }); }
  const clearTower = (i) => { const tw = towers[i]; if (!tw) return; padEls[i].g.remove(tw.mesh); disposeTree(tw.mesh); towers[i] = null; paintPad(i); };

  // ---------------- towers (10 Hz) ----------------
  const tmpA = new V3(), tmpB = new V3();
  const near = (x, z, r, list, skip) => { let b = null, bd = r * r; for (const m of list) { if (m.dead || (skip && skip.includes(m))) continue; const dx = m.g.position.x - x, dz = m.g.position.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; b = m; } } return b; };
  const bolt = (a, b, color) => { if (!(VX && VX.zap && VX.zap(a, b, { color }))) if (parts) parts.sparks(b, color, 8); };
  function towersTick(dt) {
    const list = combat.defense.list();
    for (const tw of towers) {
      if (!tw) continue; const d = TOWERS[tw.id], l = tw.lvl - 1;
      if (tw.id === "barrier" || !list.length) continue;
      if (tw.id === "shock") {
        if ((tw.cd -= dt) > 0) continue; const a = near(tw.x, tw.z, d.range, list); if (!a) { tw.cd = 0.1; continue; }
        tw.cd = d.cd[l]; tmpA.set(tw.x, 1.7, tw.z); const seen = [a]; let from = tmpA.clone(), m = a, k = d.dmg[l];
        for (let h = 0; h <= d.hops[l] && m; h++) {
          tmpB.set(m.g.position.x, (m.y || 0.6) + 0.5, m.g.position.z); bolt(from, tmpB.clone(), d.color); combat.defense.hit(m, k + m.def * 0.5, from); m.stun = Math.max(m.stun, 0.25);
          from = tmpB.clone(); k *= 0.8; m = near(m.g.position.x, m.g.position.z, 3.4, list, seen); if (m) seen.push(m);
        }
        tw.mesh.userData.zapT = 0.2; Snd.zap && Snd.zap();
      } else if (tw.id === "frost") {
        const r = d.r[l], hit = tw.acc + dt >= 1; tw.acc = hit ? 0 : tw.acc + dt;
        for (const m of list) { const dx = m.g.position.x - tw.x, dz = m.g.position.z - tw.z; if (dx * dx + dz * dz > r * r) continue; m.slow = Math.max(m.slow, 0.35); if (hit) combat.defense.hit(m, d.dmg[l] + m.def * 0.5, tmpA.set(tw.x, 0, tw.z)); }
      } else if (tw.id === "flame") {
        if ((tw.cd -= dt) > 0) continue; const picked = []; for (let n = 0; n < d.n[l]; n++) { const m = near(tw.x, tw.z, d.range, list, picked); if (m) picked.push(m); }
        if (!picked.length) { tw.cd = 0.1; continue; } tw.cd = d.cd[l];
        for (const m of picked) { m.burn = 2.6; m.burnD = d.dmg[l]; if (VX && VX.impact) VX.impact(tmpB.set(m.g.position.x, (m.y || 0.6) + 0.4, m.g.position.z), "fire"); }
        if (parts && !ctx.reduce) parts.emit({ at: tmpA.set(tw.x, 1.6, tw.z), kind: "glow", n: 6, speed: 2, up: 3, size: 0.4, life: 0.5, grav: -2, color: 0xffd27a, color2: 0xff7a2a });
      }
    }
  }
  function barrierHit(tw, m) {
    tw.hp -= (6 + wave * 1.5) * (m.rank === "boss" ? 4 : 1); paintPad(tw.i);
    if (tw.hp <= 0) { clearTower(tw.i); ctx.toast(T("The Barrier broke")); if (parts) parts.burst(tmpA.set(tw.x, 1, tw.z), 0x35d8d0, { n: 18 }); Snd.pop && Snd.pop(); }
  }
  const wall = (p) => { const pr = Math.hypot(p.x, p.z); for (const tw of towers) { if (!tw || tw.id !== "barrier") continue; if (Math.hypot(p.x - tw.x, p.z - tw.z) < 1.9 && pr > Math.hypot(tw.x, tw.z) - 0.2) return tw.goal; } return null; };
  function coreHit(n) {
    coreHp = Math.max(0, coreHp - n); flash = 1; paintHud();
    if (Snd.hurt && performance.now() - hurtSnd > 400) { hurtSnd = performance.now(); Snd.hurt(); }
    if (coreHp <= 0 && phase !== "over") lost = true; // ended from the loop (this runs inside the scammers' own update)
  }
  const TGT = { x: 0, z: 0, r: ARENA.coreR, hit: (m) => coreHit(m.rank === "boss" ? cur.bossDmg : cur.coreDmg), wall, dead: () => { kills++; scrap += killScrap(cur ? cur.w : 1); paintHud(); } };

  // ---------------- the run ----------------
  function spawn(e) {
    const g = gateAt(e.g), lat = (Math.random() - 0.5) * 1.6, p = new V3(g.x - Math.sin(g.a) * lat, 0, g.z + Math.cos(g.a) * lat), bi = Math.max(0, cur.w / 5 - 1) % BOSSES.length;
    const o = { type: e.t, lv: cur.w, at: p, hp: e.boss ? cur.bossHp : cur.hp, def: cur.def, spd: cur.spd * (e.boss ? 0.8 : 1), tgt: TGT };
    if (e.boss) { o.rank = "boss"; o.boss = BOSSES[bi | 0]; }
    return combat.defense.spawn(o);
  }
  function startWave() {
    cur = waveOf(seed, wave); queue = cur.list.slice(); wt = 0; phase = "wave"; lastStart = Date.now(); sel = -1; paintMenu();
    if (cur.boss) { ctx.toast(T("Boss wave!")); Snd.siren && Snd.siren(); }
    paintHud();
  }
  function endWave() {
    cleared = cur.w; scrap += clearScrap(cur.w); wave = cur.w + 1; phase = "break"; timer = BREAK_S;
    for (const tw of towers) if (tw && tw.id === "barrier") { tw.hp = TOWERS.barrier.hp[tw.lvl - 1]; paintPad(tw.i); }
    ctx.toast(T("Wave {n} cleared", { n: cleared })); Snd.coin && Snd.coin(); paintHud();
  }
  // a wave can't start earlier than the server would believe (20 s a wave cleared): the earliest moment for wave w
  const earliest = (w) => t0 + (w - 1) * 21000 + 15000;
  const canGo = () => Date.now() >= earliest(wave) && (wave === 1 || Date.now() - lastStart >= 21000);
  async function begin() {
    if (on) return;
    on = true; phase = "build"; wave = 1; cleared = 0; kills = 0; scrap = START_SCRAP; coreHp = CORE_HP; timer = BUILD_S; result = null; run = null; offline = false; sel = -1; towers.fill(null);
    t0 = Date.now(); lastStart = 0; lost = false; seed = (Math.random() * 4294967296) >>> 0;
    hideWorld(); build(); combat.defense.on(true); ctx.setArena(ARENA.r - 0.4); ctx.place(0, 8.6); mountUi(); paintHud(); paintPads();
    const s = ctx.sess();
    if (s) { try { const r = await ctx.post({ action: "world-defense-start", ...s }); if (r.ok && r.j && r.j.runId) { run = r.j; seed = r.j.seed >>> 0; t0 = Date.now(); } else offline = true; } catch { offline = true; } } else offline = true;
    if (!on) return; if (phase === "build") paintHud();
  }
  async function finish(quit) {
    if (phase === "over") return; phase = "over"; queue = []; combat.defense.on(false); combat.defense.on(true); sel = -1; paintMenu();
    const ms = Date.now() - t0; result = { wave: cleared, kills, ms, credited: 0, rank: null, best: 0, state: run ? "wait" : "offline", quit: !!quit };
    paintResult();
    if (!run) return;
    try {
      const r = await ctx.post({ action: "world-defense-end", ...ctx.sess(), runId: run.runId, wave: cleared, kills, ms });
      if (r.ok && r.j) { Object.assign(result, { credited: r.j.credited | 0, rank: r.j.rank, best: r.j.best | 0, runsLeft: r.j.runsLeft, state: "done" }); if (result.credited > 0 && ctx.refresh) ctx.refresh(); }
      else result.state = "error";
    } catch { result.state = "error"; }
    if (on) paintResult();
    try { const t = await fetch("/api/social?world=defense-top"); if (t.ok && on) { result.top = ((await t.json()).top || []).slice(0, 3); paintResult(); } } catch { /* the card stands without the board */ }
  }
  function exit() {
    if (!on) return;
    on = false; phase = "idle"; combat.defense.on(false); showWorld(); teardown(); unmountUi(); ctx.setArena(0); ctx.place(1.2, 7.6); if (ctx.leave) ctx.leave();
  }
  async function quit() { if (!on) return; if (phase === "over") { exit(); return; } finish(true); }

  // ---------------- screen ----------------
  const $ = (s) => ui && ui.querySelector(s);
  function mountUi() {
    ui = document.createElement("div"); ui.className = "wd"; ui.setAttribute("data-no-i18n", "");
    ui.innerHTML = `<div class="wd-hud"><div class="wd-top"><b class="wd-wave"></b><span class="wd-ph"></span><span class="wd-scrap"></span></div>
      <div class="wd-core" title="${esc(T("Core"))}"><i><q></q></i><em></em></div>
      <div class="wd-row"><span class="wd-towers"></span><button type="button" class="wp-btn wd-go"></button><button type="button" class="wp-btn wd-quit"></button></div></div>
      <div class="wd-pads"></div><div class="wd-menu" hidden role="dialog"></div><div class="wd-res" hidden role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(ui);
    const pads = $(".wd-pads"); padBtns = []; for (let i = 0; i < ARENA.pads; i++) { const b = document.createElement("button"); b.type = "button"; b.className = "wd-pad"; b.dataset.i = i; b.setAttribute("aria-label", T("Place a tower") + " " + (i + 1)); pads.appendChild(b); padBtns.push(b); }
    ui.addEventListener("click", onClick);
    addEventListener("keydown", onKey, true);
  }
  function unmountUi() { removeEventListener("keydown", onKey, true); if (ui) ui.remove(); ui = null; }
  function onKey(e) { if (!on || !ui) return; if (e.key === "Escape" && sel >= 0) { e.stopPropagation(); sel = -1; paintMenu(); } }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b) { if (sel >= 0 && !e.target.closest(".wd-menu")) { sel = -1; paintMenu(); } return; }
    if (b.classList.contains("wd-pad")) { sel = sel === +b.dataset.i ? -1 : +b.dataset.i; paintMenu(); return; }
    if (b.classList.contains("wd-go")) { if ((phase === "build" || phase === "break") && canGo()) startWave(); return; }
    if (b.classList.contains("wd-quit")) { if (confirmQuit()) quit(); return; }
    if (b.dataset.buy) { buy(sel, b.dataset.buy); return; }
    if (b.dataset.act === "up") { upgrade(sel); return; }
    if (b.dataset.act === "sell") { sell(sel); return; }
    if (b.dataset.act === "close") { sel = -1; paintMenu(); return; }
    if (b.dataset.res === "again") { const was = on; exit(); if (was) begin(); return; }
    if (b.dataset.res === "exit") { exit(); }
  }
  const confirmQuit = () => (cleared > 0 || kills > 0 ? confirm(T("Quit the run?")) : true);
  function buy(i, id) {
    if (i < 0 || towers[i] || !TOWERS[id]) return;
    if (towers.filter(Boolean).length >= MAX_TOWERS) { ctx.toast(T("All eight pads are taken")); return; }
    if (scrap < TOWERS[id].cost) { ctx.toast(T("Not enough scrap")); return; }
    scrap -= TOWERS[id].cost; setTower(i, id, 1, TOWERS[id].cost); Snd.pop && Snd.pop(); if (parts) parts.burst(tmpA.set(padEls[i].x, 0.6, padEls[i].z), TOWERS[id].color, { n: 12 }); sel = -1; paintMenu(); paintHud();
  }
  function upgrade(i) {
    const tw = towers[i]; if (!tw || tw.lvl >= 3) return; const c = upCost(tw.id, tw.lvl);
    if (scrap < c) { ctx.toast(T("Not enough scrap")); return; }
    scrap -= c; const hpFull = tw.id === "barrier"; setTower(i, tw.id, tw.lvl + 1, tw.paid + c); if (hpFull) towers[i].hp = TOWERS.barrier.hp[tw.lvl]; Snd.pop && Snd.pop(); paintMenu(); paintHud();
  }
  function sell(i) { const tw = towers[i]; if (!tw) return; scrap += refund(tw.id, tw.lvl); clearTower(i); Snd.coin && Snd.coin(); sel = -1; paintMenu(); paintHud(); }
  const phLabel = () => (phase === "build" ? T("Build") : phase === "break" ? T("Break") : phase === "wave" ? T("Fight") : "");
  function paintHud() {
    if (!ui) return;
    $(".wd-wave").textContent = T("Wave") + " " + (phase === "wave" ? cur.w : wave) + (isBoss(phase === "wave" ? cur.w : wave) ? " ★" : "");
    $(".wd-ph").textContent = phase === "over" ? "" : phLabel() + (phase === "wave" ? ` · ${Math.max(0, combat.defense.list().length + queue.length)}` : ` · ${Math.max(0, Math.ceil(Math.max(timer, (earliest(wave) - Date.now()) / 1000)))} s`);
    $(".wd-scrap").textContent = T("Scrap") + " " + scrap;
    $(".wd-core q").style.width = (100 * coreHp) / CORE_HP + "%"; $(".wd-core em").textContent = `${T("Core")} ${coreHp}/${CORE_HP}`; $(".wd-core").classList.toggle("low", coreHp <= CORE_HP * 0.3);
    $(".wd-towers").textContent = T("Towers {a}/{b}", { a: towers.filter(Boolean).length, b: MAX_TOWERS });
    const go = $(".wd-go"); go.textContent = T("Start wave"); go.hidden = !(phase === "build" || phase === "break"); go.disabled = !canGo();
    $(".wd-quit").textContent = phase === "over" ? T("Exit") : T("Quit");
    ui.classList.toggle("wd-over", phase === "over"); ui.classList.toggle("wd-boss", phase === "wave" && !!cur && cur.boss); // (the boss bar takes the HUD's place at the top)
  }
  function paintPad(i) {
    const el = padBtns[i]; if (!el) return; const tw = towers[i], p = padEls[i];
    if (p) { const c = tw ? TOWERS[tw.id].color : 0x35d8d0; p.g.userData.ring.material.color.setHex(c); p.g.userData.ring.material.emissive.setHex(c); p.g.userData.disc.material.color.setHex(c); }
    el.innerHTML = tw ? `<b>${esc(HOTKEY[tw.id])}</b><small>${tw.lvl}</small>` : "+"; el.classList.toggle("on", !!tw); el.style.setProperty("--c", "#" + (tw ? TOWERS[tw.id].color : 0x35d8d0).toString(16).padStart(6, "0"));
    el.classList.toggle("hurt", !!tw && tw.id === "barrier" && tw.hp < TOWERS.barrier.hp[tw.lvl - 1] * 0.4);
  }
  function paintPads() { for (let i = 0; i < ARENA.pads; i++) paintPad(i); }
  function paintMenu() {
    const m = $(".wd-menu"); if (!m) return; if (sel < 0) { m.hidden = true; return; }
    const tw = towers[sel], full = towers.filter(Boolean).length >= MAX_TOWERS, btn = (a, c) => `<button type="button" ${a}${c ? "" : " disabled"}>`;
    m.hidden = false;
    m.innerHTML = tw
      ? `<h4>${esc(T(TOWERS[tw.id].name))} <small>${esc(T("Level"))} ${tw.lvl}${tw.lvl >= 3 ? " · " + esc(T("Max")) : ""}</small></h4><p>${esc(T(TOWERS[tw.id].note))}${tw.id === "barrier" ? ` · ${Math.max(0, Math.round(tw.hp))}/${TOWERS.barrier.hp[tw.lvl - 1]}` : ""}</p>
        <div>${tw.lvl < 3 ? btn('data-act="up"', scrap >= upCost(tw.id, tw.lvl)) + `${esc(T("Upgrade"))} <i>${upCost(tw.id, tw.lvl)}</i></button>` : ""}<button type="button" data-act="sell">${esc(T("Sell"))} <i>+${refund(tw.id, tw.lvl)}</i></button><button type="button" data-act="close">${esc(T("Close"))}</button></div>`
      : `<h4>${esc(T("Place a tower"))} <small>${esc(T("Scrap"))} ${scrap}</small></h4><div class="wd-buy">${TOWER_IDS.map((id) => btn(`data-buy="${id}" style="--c:#${TOWERS[id].color.toString(16).padStart(6, "0")}"`, scrap >= TOWERS[id].cost && !full) + `<b>${esc(T(TOWERS[id].name))}</b><span>${esc(T(TOWERS[id].note))}</span><i>${TOWERS[id].cost}</i></button>`).join("")}</div><div><button type="button" data-act="close">${esc(T("Close"))}</button></div>`;
  }
  function paintResult() {
    const el = $(".wd-res"); if (!el || !result) return; const r = result;
    const note = r.state === "wait" ? T("Getting ready") + "…" : r.state === "offline" ? T("Sign in to earn ARCL") : r.state === "error" ? T("Rewards aren't available right now") : r.credited > 0 ? "" : r.wave > 0 && r.runsLeft === 0 ? T("No more rewarded runs today") : "";
    el.hidden = false;
    el.innerHTML = `<div class="wd-card"><small>${esc(T("AC Defense"))}</small><h3>${esc(r.quit ? T("Waves cleared") : T("The Core fell"))}</h3><div class="wd-big">${r.wave}</div>
      <dl><div><dt>${esc(T("Waves cleared"))}</dt><dd>${r.wave}</dd></div><div><dt>${esc(T("Knock-outs"))}</dt><dd>${r.kills}</dd></div><div><dt>${esc(T("ARCL earned"))}</dt><dd>${r.state === "done" ? "+" + r.credited : "—"}</dd></div><div><dt>${esc(T("Weekly rank"))}</dt><dd>${r.rank ? "#" + r.rank : "—"}</dd></div></dl>
      ${r.best ? `<p>${esc(T("Best this week"))}: ${r.best} ${esc(T("waves"))}</p>` : ""}${(r.top || []).length ? `<ol class="wd-top3">${r.top.map((x) => `<li><b>${esc(x.name || x.w)}</b><span>${x.n}</span></li>`).join("")}</ol>` : ""}${note ? `<p class="wd-note">${esc(note)}</p>` : ""}<div class="wd-btns"><button type="button" class="wp-btn wd-cta" data-res="again">${esc(T("Play again"))}</button><button type="button" class="wp-btn" data-res="exit">${esc(T("Exit"))}</button></div></div>`;
  }

  // pad buttons follow their pad on screen
  const pv = new V3();
  // (a tower's button floats above it, not over it)
  function project() {
    if (!ui || !padEls.length) return; const els = padBtns, w = innerWidth, h = innerHeight; planet.updateMatrixWorld();
    for (let i = 0; i < els.length; i++) { const p = padEls[i]; pv.set(p.x, towers[i] ? (towers[i].id === "barrier" ? 2.4 : 3.1) : 0.6, p.z); planet.localToWorld(pv); pv.project(st.camera); const el = els[i], vis = pv.z < 1 && Math.abs(pv.x) < 1.1 && Math.abs(pv.y) < 1.1; el.style.visibility = vis ? "visible" : "hidden"; if (vis) el.style.transform = `translate(${((pv.x + 1) / 2) * w}px,${((1 - pv.y) / 2) * h}px) translate(-50%,-50%)`; }
  }

  // ---------------- the loop ----------------
  let hudT = 0;
  function tick(dt, t) {
    if (!on) return;
    project();
    for (const tw of towers) { if (!tw) continue; const top = tw.mesh.userData.top, au = tw.mesh.userData.aura;
      if (tw.id === "frost") { top.rotation.y += dt * 1.2; if (au) au.material.opacity = 0.25 + Math.sin(t * 3) * 0.1; }
      else if (tw.id === "flame") top.scale.set(1 + Math.sin(t * 17) * 0.08, 1 + Math.sin(t * 23) * 0.12, 1 + Math.sin(t * 17) * 0.08);
      else if (tw.id === "shock") { const z = tw.mesh.userData.zapT || 0; if (z > 0) tw.mesh.userData.zapT = z - dt; top.material.emissiveIntensity = z > 0 ? 3 : 1.2 + Math.sin(t * 4) * 0.3; }
      else if (tw.id === "barrier") top.material.emissiveIntensity = 0.3 + 0.7 * Math.max(0, tw.hp) / TOWERS.barrier.hp[tw.lvl - 1]; }
    if (dome) { flash = Math.max(0, flash - dt * 2.5); dome.material.opacity = 0.06 + flash * 0.3 + Math.sin(t * 1.5) * 0.015; dome.material.color.setHex(flash > 0.05 ? 0xff4d6d : coreHp <= CORE_HP * 0.3 ? 0xffc861 : 0x38d8ff); }
    for (const g of gates) g.children[3].material.opacity = 0.14 + Math.sin(t * 2) * 0.06 + (phase === "wave" ? 0.08 : 0);
    if (lost && phase !== "over") { lost = false; finish(); }
    if (phase === "over") return;
    if (phase === "build" || phase === "break") { timer -= dt; if (timer <= 0 && canGo()) startWave(); }
    else if (phase === "wave") {
      wt += dt; const alive = combat.defense.list().length;
      let room = cap - alive; while (queue.length && queue[0].at <= wt && room > 0) { if (!spawn(queue[0])) break; queue.shift(); room--; }
      if (!queue.length && !alive && wt > 1) endWave();
    }
    acc += dt; if (acc >= 0.1) { if (phase === "wave") towersTick(acc); acc = 0; }
    if ((hudT -= dt) <= 0) { hudT = 0.25; paintHud(); }
  }
  st.on((dt, t) => { try { tick(dt, t); } catch (e) { console.warn("defense", e); } });

  return { start: begin, quit, active: () => on, tick };
}
