// world-defense.js — AC Defense, a game-in-game in a separate arena made from the plaza (loaded the first time it's
// entered: world-play.js import()s it, so it costs nothing until then). Protect the Core: 30 s to place
// towers on the ring of pads, then waves of scammers from four gates walk to the Core (the combat's own scammers with a
// `tgt` — world-combat.js tgtAI — and you can still fight them), 15 s of break, a boss on every 5th wave, until the Core
// falls or you quit. Towers cost SCRAP (a run's own, never ARCL), sell for half, upgrade to level 3. The rules and the
// wave table are in world-defense-data.js; the look (arena, portals, Core, towers) is world-defense-art.js; the run is
// checked and paid by api/_world-defense.mjs (ARCL, kind "defense").
//
// createDefense(ctx) → { start(), quit(), active(), tick(dt, t) }
//   ctx: { THREE, planet, st, T, lang, esc, toast, Snd, vfx, parts, combat, coarse, low, reduce, keep: [objects kept in the arena],
//          sess(), post(body), place(x, z) (stand the player there), setArena(r) (walk limit, 0 = none), feed(html),
//          cinema(ms) (the entry fly-down, optional), shake(n) (camera rattle, optional) }
import { ARENA, BUILD_S, BREAK_S, MAX_TOWERS, CORE_HP, START_SCRAP, CAP, TOWERS, TOWER_IDS, upCost, refund, padAt, gateAt, waveOf, killScrap, clearScrap, isBoss } from "./world-defense-data.js";
import { createDefenseArt } from "./world-defense-art.js";
import { mobStats } from "./world-rpg-data.js";

const LW = {
  ko: { "AC Defense": "AC 디펜스", Core: "코어", Wave: "웨이브", Build: "건설", Break: "휴식", Fight: "전투", Scrap: "고철", "Start wave": "웨이브 시작", Quit: "그만두기", Shock: "전격", Frost: "냉기", Flame: "화염", Barrier: "방벽", "Chain zap": "연쇄 번개", "Slow aura": "감속 오라", "Burn over time": "지속 화상", "Blocks a lane": "길 막기", Upgrade: "강화", Sell: "판매", Close: "닫기", Level: "레벨", Max: "최대",
    "Place a tower": "타워 설치", "Boss wave!": "보스 웨이브!", "Wave {n} cleared": "웨이브 {n} 클리어", "The Core fell": "코어가 무너졌어요", "Waves cleared": "클리어한 웨이브", "Knock-outs": "처치", "ARCL earned": "획득 ARCL", "Weekly rank": "주간 순위", "Play again": "다시 하기", Exit: "나가기", "Sign in to earn ARCL": "로그인하면 ARCL을 받아요", "No more rewarded runs today": "오늘은 보상 한도에 도달했어요",
    "All eight pads are taken": "패드 8개가 모두 찼어요", "Not enough scrap": "고철이 부족해요", "The Barrier broke": "방벽이 부서졌어요", "Defend the Core": "코어를 지켜라", "Rewards aren't available right now": "지금은 보상을 받을 수 없어요", "Getting ready": "준비 중", "Best this week": "이번 주 최고", "waves": "웨이브", "Core under attack": "코어 공격받는 중", "Quit the run?": "그만둘까요?", "Keep going": "계속하기", "Next wave in {n} s": "다음 웨이브 {n}초", "Towers {a}/{b}": "타워 {a}/{b}", "Tap a pad to build": "패드를 눌러 건설",
    "Wave {n}": "웨이브 {n}", Boss: "보스", "Enemies left {n}": "남은 적 {n}", "New weekly best!": "이번 주 신기록!", "{n} of 3 stars": "별 3개 중 {n}개", "Range {n} m": "범위 {n}m", "Tap again to build": "한 번 더 누르면 건설", "Tap a tower to see its range": "타워를 눌러 범위 보기", "Wave cleared!": "웨이브 클리어!", "The Spam King": "스팸 킹", "The Free Mint": "프리 민트", "The Honeypot Queen": "허니팟 퀸" },
  zh: { "AC Defense": "AC 防御", Core: "核心", Wave: "波次", Build: "建造", Break: "休息", Fight: "战斗", Scrap: "废料", "Start wave": "开始波次", Quit: "退出", Shock: "电击", Frost: "冰霜", Flame: "火焰", Barrier: "屏障", "Chain zap": "连锁闪电", "Slow aura": "减速光环", "Burn over time": "持续灼烧", "Blocks a lane": "封锁通道", Upgrade: "升级", Sell: "出售", Close: "关闭", Level: "等级", Max: "满级",
    "Place a tower": "放置塔", "Boss wave!": "首领波次！", "Wave {n} cleared": "第 {n} 波已清除", "The Core fell": "核心被攻破", "Waves cleared": "清除波次", "Knock-outs": "击败", "ARCL earned": "获得 ARCL", "Weekly rank": "本周排名", "Play again": "再来一次", Exit: "离开", "Sign in to earn ARCL": "登录后可获得 ARCL", "No more rewarded runs today": "今天的奖励次数已用完",
    "All eight pads are taken": "八个平台都已占用", "Not enough scrap": "废料不足", "The Barrier broke": "屏障被摧毁", "Defend the Core": "守护核心", "Rewards aren't available right now": "暂时无法领取奖励", "Getting ready": "准备中", "Best this week": "本周最佳", "waves": "波", "Core under attack": "核心遭到攻击", "Quit the run?": "要退出吗？", "Keep going": "继续", "Next wave in {n} s": "{n} 秒后下一波", "Towers {a}/{b}": "塔 {a}/{b}", "Tap a pad to build": "点击平台来建造",
    "Wave {n}": "第 {n} 波", Boss: "首领", "Enemies left {n}": "剩余敌人 {n}", "New weekly best!": "本周新纪录！", "{n} of 3 stars": "3 星中的 {n} 星", "Range {n} m": "范围 {n} 米", "Tap again to build": "再点一下即可建造", "Tap a tower to see its range": "点击塔查看范围", "Wave cleared!": "波次已清除！", "The Spam King": "垃圾邮件之王", "The Free Mint": "免费铸造", "The Honeypot Queen": "蜜罐女王" },
  tr: { "AC Defense": "AC Savunma", Core: "Çekirdek", Wave: "Dalga", Build: "İnşa", Break: "Mola", Fight: "Savaş", Scrap: "Hurda", "Start wave": "Dalgayı başlat", Quit: "Çık", Shock: "Şok", Frost: "Buz", Flame: "Alev", Barrier: "Bariyer", "Chain zap": "Zincir şimşek", "Slow aura": "Yavaşlatma aurası", "Burn over time": "Süregelen yanık", "Blocks a lane": "Yolu tıkar", Upgrade: "Yükselt", Sell: "Sat", Close: "Kapat", Level: "Seviye", Max: "Maks",
    "Place a tower": "Kule yerleştir", "Boss wave!": "Patron dalgası!", "Wave {n} cleared": "{n}. dalga temizlendi", "The Core fell": "Çekirdek düştü", "Waves cleared": "Temizlenen dalga", "Knock-outs": "Yenilen", "ARCL earned": "Kazanılan ARCL", "Weekly rank": "Haftalık sıra", "Play again": "Tekrar oyna", Exit: "Çıkış", "Sign in to earn ARCL": "ARCL için giriş yap", "No more rewarded runs today": "Bugünkü ödüllü oyun hakkı doldu",
    "All eight pads are taken": "Sekiz platformun hepsi dolu", "Not enough scrap": "Yeterli hurda yok", "The Barrier broke": "Bariyer kırıldı", "Defend the Core": "Çekirdeği koru", "Rewards aren't available right now": "Ödüller şu an alınamıyor", "Getting ready": "Hazırlanıyor", "Best this week": "Bu haftanın en iyisi", "waves": "dalga", "Core under attack": "Çekirdek saldırı altında", "Quit the run?": "Bırakılsın mı?", "Keep going": "Devam et", "Next wave in {n} s": "Sonraki dalga {n} sn", "Towers {a}/{b}": "Kule {a}/{b}", "Tap a pad to build": "Kurmak için bir platforma dokun",
    "Wave {n}": "{n}. Dalga", Boss: "Patron", "Enemies left {n}": "Kalan düşman {n}", "New weekly best!": "Haftanın yeni rekoru!", "{n} of 3 stars": "3 yıldızdan {n}", "Range {n} m": "Menzil {n} m", "Tap again to build": "Kurmak için tekrar dokun", "Tap a tower to see its range": "Menzili görmek için bir kuleye dokun", "Wave cleared!": "Dalga temizlendi!", "The Spam King": "Spam Kralı", "The Free Mint": "Bedava Mint", "The Honeypot Queen": "Bal Tuzağı Kraliçesi" },
};
const BOSSES = [{ name: "The Spam King", model: "EyeDrone", scale: 2.1, y: 2.4, tint: 0xff4d6d }, { name: "The Free Mint", model: "QuadShell", scale: 2.0, y: 0.9, tint: 0xffc861 }, { name: "The Honeypot Queen", model: "Trilobite", scale: 2.1, y: 1.0, tint: 0xb48cff }];
const HOTKEY = { shock: "S", frost: "F", flame: "B", barrier: "W" };

// icons (24×24, currentColor): the towers, upgrade, sell; the result card's star and crown
const ICON = {
  shock: '<path d="M13.5 2 4 14h6.5L9 22l10-13h-6.5z"/>',
  frost: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  flame: '<path d="M12 2c.8 4 6 6.2 6 12a6 6 0 0 1-12 0c0-3 1.8-5 3-7 .2 2.6 1 3.8 2.2 4C11.6 8 12.6 5.6 12 2z"/>',
  barrier: '<path d="M3 5h8v6H3zm10 0h8v6h-8zM3 13h4v6H3zm6 0h6v6H9zm8 0h4v6h-4z"/>',
  up: '<path d="M12 3 4 12h5v8h6v-8h5z"/>',
  sell: '<path fill-rule="evenodd" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/>',
  star: '<path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8l-6.3 3.6 1.5-7.1-5.4-4.9L9 8.6z"/>',
  crown: '<path d="M3 7.5l4.6 4.2L12 5l4.4 6.7L21 7.5 19 19H5z"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const MINC = Math.min(...TOWER_IDS.map((id) => TOWERS[id].cost)); // the cheapest tower: a pad lights "can" from here
// the range preview and the wave-clear sweep: one flat disc, two little shaders (uv radial: 0 at the centre, 1 at the rim)
const DISC_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const RANGE_FS = `uniform vec3 uColor; uniform float uFade; varying vec2 vUv;
  void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0, e = smoothstep(0.92, 0.975, r) * (1.0 - smoothstep(0.985, 1.0, r));
    float dash = 0.55 + 0.45 * step(0.5, fract(atan(c.y, c.x) * 9.549)); gl_FragColor = vec4(uColor, (e * dash + 0.08 * smoothstep(0.15, 1.0, r) * step(r, 1.0)) * uFade); }`;
const SWEEP_FS = `uniform vec3 uColor; uniform float uR, uFade; varying vec2 vUv;
  void main(){ float r = length(vUv - 0.5) * 2.0, a = smoothstep(uR - 0.24, uR, r) * (1.0 - smoothstep(uR, uR + 0.025, r));
    gl_FragColor = vec4(uColor, a * uFade * (1.0 - smoothstep(0.96, 1.0, r))); }`;

export function createDefense(ctx) {
  const { THREE, planet, st, vfx: VX, parts, Snd, combat } = ctx;
  const LWL = LW[ctx.lang] || {};
  const T = (s, v) => { let t = LWL[s] != null ? LWL[s] : s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
  const BOSS_L = BOSSES.map((b) => ({ ...b, name: T(b.name) })); // the boss bar and the banner show the name in the player's language
  const esc = ctx.esc, V3 = THREE.Vector3, TAU = Math.PI * 2, CO = !!ctx.coarse, LOW = !!ctx.low, RM = !!ctx.reduce;
  const cap = CO ? CAP.coarse : CAP.desk;
  let on = false, phase = "idle", wave = 1, cleared = 0, kills = 0, scrap = 0, coreHp = CORE_HP, timer = 0, queue = [], cur = null, wt = 0, acc = 0;
  let lost = false, run = null, t0 = 0, lastStart = 0, seed = (Math.random() * 4294967296) >>> 0, offline = false, result = null, sel = -1, pick = "", hurtSnd = 0, runs = 0;
  let mobs = [], aliveN = 0, shownScrap = 0, sweepT = -1, resReady = true, gen = 0; // gen: which start() is current (Play again mid-warm-up)
  const towers = new Array(ARENA.pads).fill(null), hidden = [], padSt = new Array(ARENA.pads).fill(""), padKey = new Array(ARENA.pads).fill("");
  // where the arena stands (ctx.origin: the Game Village clearing; the plaza when absent). Meshes sit in root at O;
  // the game logic (pads, towers, the Core, spawns) works in planet coordinates, so it adds O
  const O = ctx.origin || { x: 0, z: 0 };
  let root = null, art = null, own = [], rangeM = null, sweepM = null, ui = null, els = {}, padEls = [], padBtns = [];
  const timers = new Set(); const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

  // ---------------- the arena: what stays, what goes ----------------
  const KEEP = /^(ground|combat|particles|smoke|pet|grass|puddles|clouds|ambient|vfx|live-band|decor)$/;
  const keeps = (c) => KEEP.test(c.name || "") || (ctx.keep || []).includes(c) || c.isLight || c === root;
  function hideWorld() { hidden.length = 0; for (const c of planet.children) if (c.visible && !keeps(c)) { c.visible = false; hidden.push(c); } }
  function showWorld() { for (const c of hidden) c.visible = true; hidden.length = 0; }

  // ---------------- meshes (world-defense-art.js: shared, cached materials; freed with art.dispose) ----------------
  function build() {
    root = new THREE.Group(); root.name = "defense"; root.position.set(O.x, 0, O.z); planet.add(root);
    art = createDefenseArt({ THREE, coarse: CO, low: LOW, reduce: RM });
    const A = art.arena(root, { ARENA, padAt, gateAt, TOWERS });
    padEls = []; for (let i = 0; i < ARENA.pads; i++) { const p = padAt(i); padEls[i] = { g: A.pads[i], x: p.x + O.x, z: p.z + O.z, lx: p.x, lz: p.z }; }
    padSt.fill(""); padKey.fill("");
    // one reusable range ring (the radial menu's preview) and the wave-clear sweep: one disc geometry, two materials
    const disc = new THREE.CircleGeometry(1, CO || LOW ? 48 : 72); disc.rotateX(-Math.PI / 2);
    const dm = (fs) => new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color() }, uR: { value: 0 }, uFade: { value: 1 } }, vertexShader: DISC_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    rangeM = new THREE.Mesh(disc, dm(RANGE_FS)); rangeM.position.y = 0.12; rangeM.visible = false; rangeM.renderOrder = 2;
    sweepM = new THREE.Mesh(disc, dm(SWEEP_FS)); sweepM.position.y = 0.1; sweepM.scale.setScalar(ARENA.r); sweepM.visible = false; sweepM.renderOrder = 1; sweepM.material.uniforms.uColor.value.setHex(0x4dffb0).multiplyScalar(1.6);
    root.add(rangeM, sweepM); own = [disc, rangeM.material, sweepM.material];
  }
  // every shader the arena and the towers use compiled before the first frame shows them (root hidden meanwhile)
  async function warmUp() {
    const r = st.renderer; if (!root || !r || !r.compileAsync) return;
    const g = new THREE.Group(); g.position.y = -40; for (const id of TOWER_IDS) g.add(art.tower(id, 3)); root.add(g);
    const hid = []; root.traverse((o) => { if (!o.visible) { hid.push(o); o.visible = true; } });
    let p = null; try { p = r.compileAsync(root, st.camera, st.scene); } catch { /* older three: compiled on first draw */ }
    for (const o of hid) o.visible = false; root.visible = false;
    await Promise.race([p ? p.catch(() => {}) : Promise.resolve(), new Promise((res) => later(res, 1800))]);
    if (art) for (const c of g.children) art.drop(c); g.removeFromParent();
  }
  function teardown() {
    if (!root) return;
    planet.remove(root); if (art) art.dispose(); for (const x of own) x.dispose();
    root = null; art = null; own = []; rangeM = null; sweepM = null; sweepT = -1; padEls = []; towers.fill(null);
  }
  function setTower(i, id, lvl, paid) {
    const old = towers[i], p = padEls[i];
    if (old) { p.g.remove(old.mesh); art.drop(old.mesh); }
    const mesh = art.tower(id, lvl), tw = { i, id, lvl, paid, mesh, x: p.x, z: p.z, cd: 0.3, acc: 0, hp: id === "barrier" ? TOWERS.barrier.hp[lvl - 1] : 0 };
    if (id === "barrier") { mesh.rotation.y = -padAt(i).a + Math.PI / 2; tw.goal = { x: p.x, z: p.z, r: 1.15, hit: (m) => barrierHit(tw, m) }; }
    p.g.add(mesh); art.rise(mesh); towers[i] = tw; paintPad(i); return tw;
  }
  const clearTower = (i) => { const tw = towers[i]; if (!tw) return; padEls[i].g.remove(tw.mesh); art.drop(tw.mesh); towers[i] = null; paintPad(i); };
  const nTowers = () => { let n = 0; for (const tw of towers) if (tw) n++; return n; };

  // ---------------- towers (10 Hz) ----------------
  const tmpA = new V3(), tmpB = new V3(), hop = [new V3(), new V3()], seen = [], zo = { color: 0 }; // (the chain's two ends swap hop by hop: no allocations)
  const flameO = { at: tmpA, kind: "glow", n: CO ? 3 : 6, speed: 2, up: 3, size: 0.4, life: 0.5, grav: -2, color: 0xffd27a, color2: 0xff7a2a };
  const near = (x, z, r, list, skip) => { let b = null, bd = r * r; for (const m of list) { if (m.dead || (skip && skip.includes(m))) continue; const dx = m.g.position.x - x, dz = m.g.position.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; b = m; } } return b; };
  const bolt = (a, b) => { if (!(VX && VX.zap && VX.zap(a, b, zo))) if (parts) parts.sparks(b, zo.color, CO ? 4 : 8); };
  const muzzleAt = (tw, v, y) => { const mz = tw.mesh.userData.muzzle; if (mz && tw.mesh.parent) { mz.getWorldPosition(v); planet.worldToLocal(v); } else v.set(tw.x, y, tw.z); return v; };
  function towersTick(dt, list) {
    if (!list.length) return;
    for (const tw of towers) {
      if (!tw || tw.id === "barrier") continue; const d = TOWERS[tw.id], l = tw.lvl - 1, u = tw.mesh.userData;
      if (tw.id === "shock") {
        tw.cd = Math.max(0, tw.cd - dt); const a = near(tw.x, tw.z, d.range, list); if (!a) continue;
        art.aim(tw.mesh, a.g.position.x, a.g.position.z); if (tw.cd > 0) continue;
        tw.cd = d.cd[l]; u.fire(); seen.length = 0; seen.push(a); zo.color = d.color;
        let from = muzzleAt(tw, hop[0], 1.7), to = hop[1], m = a, k = d.dmg[l] * tK;
        for (let h = 0; h <= d.hops[l] && m; h++) {
          to.set(m.g.position.x, (m.y || 0.6) + 0.5, m.g.position.z); bolt(from, to); combat.defense.hit(m, k + m.def * 0.5, from); m.stun = Math.max(m.stun, 0.25);
          const sw = from; from = to; to = sw; k *= 0.8; m = near(m.g.position.x, m.g.position.z, 3.4, list, seen); if (m) seen.push(m);
        }
        Snd.zap && Snd.zap();
      } else if (tw.id === "frost") {
        const r = d.r[l], hit = tw.acc + dt >= 1; tw.acc = hit ? 0 : tw.acc + dt; let any = false;
        for (const m of list) { const dx = m.g.position.x - tw.x, dz = m.g.position.z - tw.z; if (dx * dx + dz * dz > r * r) continue; any = true; m.slow = Math.max(m.slow, 0.35); if (hit) combat.defense.hit(m, d.dmg[l] * tK + m.def * 0.5, tmpA.set(tw.x, 0, tw.z)); }
        if (hit && any) u.fire();
      } else if (tw.id === "flame") {
        tw.cd = Math.max(0, tw.cd - dt); const a = near(tw.x, tw.z, d.range, list); if (!a) continue;
        art.aim(tw.mesh, a.g.position.x, a.g.position.z); if (tw.cd > 0) continue;
        seen.length = 0; seen.push(a); for (let n = 1; n < d.n[l]; n++) { const m = near(tw.x, tw.z, d.range, list, seen); if (!m) break; seen.push(m); }
        tw.cd = d.cd[l]; u.fire();
        for (const m of seen) { m.burn = 2.6; m.burnD = d.dmg[l] * tK; if (VX && VX.impact) VX.impact(tmpB.set(m.g.position.x, (m.y || 0.6) + 0.4, m.g.position.z), "fire"); }
        if (parts && !RM && !LOW) { muzzleAt(tw, tmpA, 1.6); parts.emit(flameO); }
      }
    }
  }
  function barrierHit(tw, m) {
    tw.hp -= (6 + wave * 1.5) * (m.rank === "boss" ? 4 : 1); const u = tw.mesh.userData; if (u.setHp) u.setHp(Math.max(0, tw.hp) / TOWERS.barrier.hp[tw.lvl - 1]); paintPad(tw.i);
    if (tw.hp <= 0) { clearTower(tw.i); ctx.toast(T("The Barrier broke")); if (parts) parts.burst(tmpA.set(tw.x, 1, tw.z), 0x35d8d0, { n: CO ? 9 : 18 }); Snd.pop && Snd.pop(); }
  }
  const wall = (p) => { const pr = Math.hypot(p.x - O.x, p.z - O.z); for (const tw of towers) { if (!tw || tw.id !== "barrier") continue; if (Math.hypot(p.x - tw.x, p.z - tw.z) < 1.9 && pr > Math.hypot(tw.x - O.x, tw.z - O.z) - 0.2) return tw.goal; } return null; };
  function coreHit(n, m) {
    coreHp = Math.max(0, coreHp - n);
    if (art) { art.setCore(coreHp / CORE_HP, true); if (m && m.g) art.wallHit(Math.atan2(m.g.position.z - O.z, m.g.position.x - O.x)); }
    const now = performance.now();
    if (now - hurtSnd > 400) { hurtSnd = now; Snd.hurt && Snd.hurt(); if (!RM && els.core) { els.core.classList.remove("hit"); void els.core.offsetWidth; els.core.classList.add("hit"); } }
    paintHud();
    if (coreHp <= 0 && phase !== "over") lost = true; // ended from the loop (this runs inside the scammers' own update)
  }
  const TGT = { x: O.x, z: O.z, r: ARENA.coreR, hit: (m) => coreHit(m.rank === "boss" ? cur.bossDmg : cur.coreDmg, m), wall, dead: () => { kills++; scrap += killScrap(cur ? cur.w : 1); paintHud(); } };

  // ---------------- the run ----------------
  const foeLv = () => { const pl = Math.max(1, (ctx.level && ctx.level()) || 1); return Math.max(1, Math.min(pl, pl - 5 + Math.floor((cur ? cur.w : 1) / 3))); };
  let tK = 1; // tower damage against the current crowd's level
  function spawn(e) {
    const g = gateAt(e.g), lat = (Math.random() - 0.5) * 1.6, p = new V3(O.x + g.x - Math.sin(g.a) * lat, 0, O.z + g.z + Math.cos(g.a) * lat), bi = Math.max(0, cur.w / 5 - 1) % BOSSES.length;
    // scammers come at your level, a few below it (they climb a level every 3 waves, up to yours): easy to knock out, many of them;
    // the waves still harden (count, speed, the wave's own HP floor) and the towers hit harder against higher-level crowds (tK)
    const L = foeLv(), ms = mobStats(L), grow = 1 + cur.w * 0.03, hp = Math.round(Math.max(cur.hp * 0.6, ms.hp * 0.35 * grow));
    const o = { type: e.t, lv: L, at: p, hp: e.boss ? hp * 10 : hp, def: Math.max(cur.def, Math.round(ms.def * 0.5)), spd: cur.spd * (e.boss ? 0.8 : 1), tgt: TGT };
    if (e.boss) { o.rank = "boss"; o.boss = BOSS_L[bi | 0]; }
    return combat.defense.spawn(o);
  }
  function startWave() {
    cur = waveOf(seed, wave); tK = 1 + (foeLv() - 1) * 0.04; queue = cur.list.slice(); wt = 0; acc = 0.1; phase = "wave"; lastStart = Date.now(); sel = -1; paintMenu();
    if (combat.defense.setTint) combat.defense.setTint(cur.w); // the walkers' glow climbs with the wave (mint → cyan → violet → red)
    banner(T("Wave {n}", { n: cur.w }), cur.boss ? T("Boss wave!") : T("Defend the Core"), cur.boss ? "boss" : "");
    if (cur.boss) { if (!RM && ctx.shake) ctx.shake(0.3); } // (the siren plays when the boss walker spawns)
    paintHud(); paintPads();
  }
  function endWave() {
    const gain = clearScrap(cur.w); cleared = cur.w; scrap += gain; wave = cur.w + 1; phase = "break"; timer = BREAK_S;
    for (const tw of towers) if (tw && tw.id === "barrier") { tw.hp = TOWERS.barrier.hp[tw.lvl - 1]; if (tw.mesh.userData.setHp) tw.mesh.userData.setHp(1); paintPad(tw.i); }
    banner(T("Wave cleared!"), T("Wave {n} cleared", { n: cleared }), "clear"); Snd.coin && Snd.coin();
    if (!RM && sweepM) sweepT = 0; // a ring of light runs out over the floor
    if (els.gain) { els.gain.textContent = "+" + gain; els.gain.classList.remove("in"); void els.gain.offsetWidth; els.gain.classList.add("in"); later(() => els.gain && els.gain.classList.remove("in"), 1500); }
    paintHud(); paintPads();
  }
  // a wave can't start earlier than the server would believe (20 s a wave cleared): the earliest moment for wave w
  const earliest = (w) => t0 + (w - 1) * 21000 + 15000;
  const canGo = () => Date.now() >= earliest(wave) && (wave === 1 || Date.now() - lastStart >= 21000);
  async function begin() {
    if (on) return;
    on = true; phase = "build"; wave = 1; cleared = 0; kills = 0; scrap = START_SCRAP; shownScrap = scrap; coreHp = CORE_HP; timer = BUILD_S; result = null; run = null; offline = false; sel = -1; pick = ""; towers.fill(null);
    t0 = Date.now(); lastStart = 0; lost = false; seed = (Math.random() * 4294967296) >>> 0; mobs = []; aliveN = 0; resReady = true;
    hideWorld(); build(); combat.defense.on(true); if (combat.defense.onBoss) combat.defense.onBoss((m) => banner(m.bossName || T("Boss"), T("Boss"), "boss"));
    ctx.setArena(ARENA.r - 0.4); ctx.place(O.x, O.z + 8.6); mountUi(); art.setCore(1); paintHud(); paintPads();
    const my = ++gen; if (runs++) ctx.toast(T("Getting ready")); // (world-play.js says it the first time, while this module loads)
    const s = ctx.sess(), starting = s ? ctx.post({ action: "world-defense-start", ...s }).catch(() => null) : Promise.resolve(null);
    await warmUp(); if (!on || !root || my !== gen) return;
    root.visible = true; if (ctx.cinema && !RM) ctx.cinema(2000); // the camera comes down from over the arena to behind you
    banner(T("Defend the Core"), T("Tap a pad to build"), "intro");
    const r = await starting;
    if (!on || my !== gen) return;
    if (s) { if (r && r.ok && r.j && r.j.runId) { run = r.j; seed = r.j.seed >>> 0; t0 = Date.now(); } else offline = true; } else offline = true;
    if (phase === "build") paintHud();
  }
  async function finish(quit) {
    if (phase === "over") return; phase = "over"; queue = []; combat.defense.on(false); combat.defense.on(true); sel = -1; paintMenu();
    const broke = !quit && coreHp <= 0; if (broke && art) { art.coreBreak(); if (!RM && ctx.shake) ctx.shake(0.45); }
    if (art) art.setPortals(0);
    const ms = Date.now() - t0; result = { wave: cleared, kills, ms, credited: 0, rank: null, best: 0, state: run ? "wait" : "offline", quit: !!quit };
    resReady = !broke || RM; if (!resReady) later(() => { resReady = true; paintResult(); }, 1500); // the crystals shatter first
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
    on = false; phase = "idle"; combat.defense.on(false); if (combat.defense.onBoss) combat.defense.onBoss(null);
    for (const id of timers) clearTimeout(id); timers.clear();
    showWorld(); teardown(); unmountUi(); ctx.setArena(0); if (ctx.exit) ctx.exit(); else ctx.place(1.2, 7.6); if (ctx.leave) ctx.leave();
  }
  async function quit() { if (!on) return; if (phase === "over") { exit(); return; } finish(true); }

  // ---------------- screen ----------------
  const tx = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  function mountUi() {
    ui = document.createElement("div"); ui.className = "wd" + (RM ? " wd-rm" : "") + (CO ? " wd-co" : ""); ui.setAttribute("data-no-i18n", "");
    ui.innerHTML = `<div class="wd-hud"><div class="wd-top"><b class="wd-wave"></b><span class="wd-ph"></span><span class="wd-scrap"></span><span class="wd-gain" aria-hidden="true"></span></div>
      <div class="wd-core" title="${esc(T("Core"))}"><i><q></q></i><em></em></div>
      <div class="wd-prog" hidden role="progressbar" aria-valuemin="0" aria-valuemax="100"><q></q></div>
      <div class="wd-row"><span class="wd-towers"></span><button type="button" class="wp-btn wd-go">${esc(T("Start wave"))}</button><button type="button" class="wp-btn wd-quit"></button></div></div>
      <div class="wd-pads"></div><div class="wd-ban" hidden aria-live="polite"><small></small><b></b></div><div class="wd-menu" hidden role="dialog"></div><div class="wd-res" hidden role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(ui);
    const q = (s) => ui.querySelector(s);
    els = { wave: q(".wd-wave"), ph: q(".wd-ph"), scrap: q(".wd-scrap"), gain: q(".wd-gain"), core: q(".wd-core"), coreQ: q(".wd-core q"), coreEm: q(".wd-core em"), prog: q(".wd-prog"), progQ: q(".wd-prog q"), towers: q(".wd-towers"), go: q(".wd-go"), quit: q(".wd-quit"), ban: q(".wd-ban"), banS: q(".wd-ban small"), banB: q(".wd-ban b"), menu: q(".wd-menu"), res: q(".wd-res"), last: {} };
    const pads = q(".wd-pads"); padBtns = []; for (let i = 0; i < ARENA.pads; i++) { const b = document.createElement("button"); b.type = "button"; b.className = "wd-pad"; b.dataset.i = i; b.setAttribute("aria-label", T("Place a tower") + " " + (i + 1)); pads.appendChild(b); padBtns.push(b); }
    lastX.fill(-1); lastY.fill(-1); lastV.fill(-1); mPos[0] = mPos[1] = NaN;
    ui.addEventListener("click", onClick); ui.addEventListener("pointerover", onOver); ui.addEventListener("focusin", onOver); ui.addEventListener("pointerout", onOut);
    addEventListener("keydown", onKey, true);
  }
  function unmountUi() { removeEventListener("keydown", onKey, true); if (ui) ui.remove(); ui = null; els = {}; padBtns = []; }
  function onKey(e) { if (!on || !ui) return; if (e.key === "Escape" && sel >= 0) { e.stopPropagation(); sel = -1; paintMenu(); paintPads(); } }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b) { if (sel >= 0 && !e.target.closest(".wd-menu")) { sel = -1; paintMenu(); paintPads(); } return; }
    if (b.classList.contains("wd-pad")) { sel = sel === +b.dataset.i ? -1 : +b.dataset.i; pick = ""; paintMenu(); paintPads(); return; }
    if (b.classList.contains("wd-go")) { if ((phase === "build" || phase === "break") && canGo()) startWave(); return; }
    if (b.classList.contains("wd-quit")) { if (confirmQuit()) quit(); return; }
    if (b.dataset.buy) { const id = b.dataset.buy; if (CO && pick !== id) { pick = id; hover(id); markPick(); return; } buy(sel, id); return; } // a phone: the first tap shows the range, the second builds
    if (b.dataset.act === "up") { upgrade(sel); return; }
    if (b.dataset.act === "sell") { sell(sel); return; }
    if (b.dataset.act === "close") { sel = -1; paintMenu(); paintPads(); return; }
    if (b.dataset.res === "again") { const was = on; exit(); if (was) { if (ctx.enter) ctx.enter(); begin(); } return; }
    if (b.dataset.res === "exit") { exit(); }
  }
  const menuBtn = (e) => e.target && e.target.closest && e.target.closest(".wd-menu button[data-buy],.wd-menu button[data-act]");
  function onOver(e) { const b = menuBtn(e); if (b) hover(b.dataset.buy || b.dataset.act); }
  function onOut(e) { const b = menuBtn(e); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) hover(pick); }
  const confirmQuit = () => (cleared > 0 || kills > 0 ? confirm(T("Quit the run?")) : true);
  function buy(i, id) {
    if (i < 0 || towers[i] || !TOWERS[id]) return;
    if (nTowers() >= MAX_TOWERS) { ctx.toast(T("All eight pads are taken")); return; }
    if (scrap < TOWERS[id].cost) { ctx.toast(T("Not enough scrap")); return; }
    scrap -= TOWERS[id].cost; setTower(i, id, 1, TOWERS[id].cost); Snd.pop && Snd.pop(); if (parts && !LOW) parts.burst(tmpA.set(padEls[i].x, 0.6, padEls[i].z), TOWERS[id].color, { n: CO ? 6 : 12 }); sel = -1; pick = ""; paintMenu(); paintHud(); paintPads();
  }
  function upgrade(i) {
    const tw = towers[i]; if (!tw || tw.lvl >= 3) return; const c = upCost(tw.id, tw.lvl);
    if (scrap < c) { ctx.toast(T("Not enough scrap")); return; }
    scrap -= c; setTower(i, tw.id, tw.lvl + 1, tw.paid + c); Snd.pop && Snd.pop(); paintMenu(); paintHud();
  }
  function sell(i) { const tw = towers[i]; if (!tw) return; scrap += refund(tw.id, tw.lvl); clearTower(i); Snd.coin && Snd.coin(); sel = -1; paintMenu(); paintHud(); paintPads(); }
  const phLabel = () => (phase === "build" ? T("Build") : phase === "break" ? T("Break") : phase === "wave" ? T("Fight") : "");
  // the HUD: every write only when its value changed
  function paintHud() {
    if (!ui) return; const L = els.last, W = phase === "wave" ? cur.w : wave, left = phase === "wave" ? aliveN + queue.length : 0;
    tx(els.wave, T("Wave") + " " + W + (isBoss(W) ? " ★" : ""));
    tx(els.ph, phase === "over" ? "" : phLabel() + (phase === "wave" ? ` · ${left}` : ` · ${Math.max(0, Math.ceil(Math.max(timer, (earliest(wave) - Date.now()) / 1000)))} s`));
    if (shownScrap > scrap || RM) shownScrap = scrap; // (up: counted in tick; down: at once)
    tx(els.scrap, T("Scrap") + " " + shownScrap);
    const k = coreHp / CORE_HP; if (L.k !== k) { L.k = k; els.coreQ.style.width = 100 * k + "%"; tx(els.coreEm, `${T("Core")} ${coreHp}/${CORE_HP}`); els.core.classList.toggle("low", k <= 0.3); }
    const pg = phase === "wave" && cur ? Math.round((100 * (cur.n - left)) / Math.max(1, cur.n)) : -1;
    if (L.pg !== pg) { L.pg = pg; els.prog.hidden = pg < 0; if (pg >= 0) { els.progQ.style.transform = `scaleX(${pg / 100})`; els.prog.setAttribute("aria-valuenow", pg); els.prog.title = T("Enemies left {n}", { n: left }); } }
    tx(els.towers, T("Towers {a}/{b}", { a: nTowers(), b: MAX_TOWERS }));
    const goH = !(phase === "build" || phase === "break"), goD = !canGo(); if (L.goH !== goH) els.go.hidden = L.goH = goH; if (L.goD !== goD) els.go.disabled = L.goD = goD;
    tx(els.quit, phase === "over" ? T("Exit") : T("Quit"));
    const ov = phase === "over", bs = phase === "wave" && !!cur && cur.boss; if (L.ov !== ov) ui.classList.toggle("wd-over", (L.ov = ov)); if (L.bs !== bs) ui.classList.toggle("wd-boss", (L.bs = bs)); // (the boss bar takes the HUD's place at the top)
    if (L.scrap !== scrap) { L.scrap = scrap; paintPads(); if (sel >= 0) afford(); }
  }
  // a pad: its 3D state (art.setPad) and its button, each only when it changed
  function paintPad(i) {
    const tw = towers[i], s = tw ? "used" : sel === i ? "sel" : scrap >= MINC && nTowers() < MAX_TOWERS ? "can" : "empty";
    if (art && padSt[i] !== s) { padSt[i] = s; art.setPad(i, s); }
    const el = padBtns[i]; if (!el) return; const hurt = !!tw && tw.id === "barrier" && tw.hp < TOWERS.barrier.hp[tw.lvl - 1] * 0.4, key = tw ? tw.id + tw.lvl + hurt : s;
    if (padKey[i] === key) return; padKey[i] = key;
    el.innerHTML = tw ? `<b>${esc(HOTKEY[tw.id])}</b><small>${tw.lvl}</small>` : "<span>+</span>"; el.className = "wd-pad" + (tw ? " on" : " " + s) + (hurt ? " hurt" : "");
    el.style.setProperty("--c", hex(tw ? TOWERS[tw.id].color : 0x4dffb0)); el.setAttribute("aria-label", tw ? `${T(TOWERS[tw.id].name)} · ${T("Level")} ${tw.lvl}` : T("Place a tower") + " " + (i + 1));
  }
  function paintPads() { for (let i = 0; i < ARENA.pads; i++) paintPad(i); }
  // ---- the radial menu: the four towers (or Upgrade / Sell) in a ring round the pad, the range ring on the ground ----
  const RR = CO ? 82 : 70; // ring radius, px
  const rangeOf = (id, lvl) => (!TOWERS[id] || id === "barrier" ? 0 : id === "frost" ? TOWERS.frost.r[Math.min(3, lvl) - 1] : TOWERS[id].range);
  function showRange(id, lvl) {
    if (!rangeM) return; const r = sel >= 0 ? rangeOf(id, lvl) : 0; if (!r) { rangeM.visible = false; return; }
    const p = padEls[sel]; rangeM.position.set(p.lx, 0.12, p.lz); rangeM.scale.setScalar(r); rangeM.material.uniforms.uColor.value.setHex(TOWERS[id].color).multiplyScalar(1.5); rangeM.visible = true;
  }
  function caption(h) { const c = els.menu && els.menu.querySelector(".wd-rcap"); if (c && c.innerHTML !== h) c.innerHTML = h; }
  const towerCap = (id, lvl) => { const d = TOWERS[id], r = rangeOf(id, lvl); return `<b>${esc(T(d.name))}</b><span>${esc(T(d.note))}${r ? " · " + esc(T("Range {n} m", { n: r })) : ""}</span>`; };
  // what the pointer (or a phone's first tap) is on: k a tower id, "up", "sell", "close" or ""
  function hover(k) {
    if (sel < 0) return; const tw = towers[sel];
    if (tw) { const nx = k === "up" && tw.lvl < 3; showRange(tw.id, nx ? tw.lvl + 1 : tw.lvl); caption(towerCap(tw.id, nx ? tw.lvl + 1 : tw.lvl) + `<small>${esc(T("Level"))} ${nx ? tw.lvl + " → " + (tw.lvl + 1) : tw.lvl + (tw.lvl >= 3 ? " · " + esc(T("Max")) : "")}${tw.id === "barrier" ? ` · ${Math.max(0, Math.round(tw.hp))}/${TOWERS.barrier.hp[tw.lvl - 1]}` : ""}</small>`); return; }
    if (TOWERS[k]) { showRange(k, 1); caption(towerCap(k, 1) + (CO && pick === k ? `<small>${esc(T("Tap again to build"))}</small>` : "")); return; }
    showRange("", 0); caption(`<b>${esc(T("Place a tower"))}</b><span>${esc(T("Scrap"))} ${scrap}</span>${CO ? `<small>${esc(T("Tap a tower to see its range"))}</small>` : ""}`);
  }
  function markPick() { if (!els.menu) return; for (const b of els.menu.querySelectorAll("[data-buy]")) b.classList.toggle("pick", b.dataset.buy === pick); }
  function afford() {
    if (!els.menu || sel < 0) return; const tw = towers[sel], full = nTowers() >= MAX_TOWERS;
    for (const b of els.menu.querySelectorAll("[data-buy],[data-act=up]")) { const no = b.dataset.buy ? scrap < TOWERS[b.dataset.buy].cost || full : !tw || scrap < upCost(tw.id, tw.lvl); if (b.classList.contains("no") !== no) { b.classList.toggle("no", no); b.setAttribute("aria-disabled", no); } }
  }
  function paintMenu() {
    const m = els.menu; if (!m) return; if (sel < 0) { m.hidden = true; m.innerHTML = ""; pick = ""; showRange("", 0); return; }
    const tw = towers[sel], at = (k, n, a0 = -Math.PI / 2) => { const a = a0 + (k / n) * TAU; return `--x:${Math.round(Math.cos(a) * RR)}px;--y:${Math.round(Math.sin(a) * RR)}px`; };
    const rb = (attrs, style, inner, label) => `<button type="button" class="wd-rb" ${attrs} style="${style}" aria-label="${esc(label)}">${inner}</button>`;
    let h = `<div class="wd-rcap" style="--r:${RR}px"></div>`;
    if (tw) {
      const up = upCost(tw.id, tw.lvl), c = hex(TOWERS[tw.id].color);
      h += tw.lvl < 3 ? rb('data-act="up"', at(0, 2) + ";--c:#ffc861", svg("up") + `<i>${up}</i>`, `${T("Upgrade")} ${up}`) : `<span class="wd-rb max" style="${at(0, 2)};--c:#ffc861">${esc(T("Max"))}</span>`;
      h += rb('data-act="sell"', at(1, 2) + ";--c:" + c, svg("sell") + `<i>+${refund(tw.id, tw.lvl)}</i>`, `${T("Sell")} +${refund(tw.id, tw.lvl)}`);
    } else h += TOWER_IDS.map((id, k) => rb(`data-buy="${id}"`, at(k, TOWER_IDS.length, -Math.PI * 0.75) + ";--c:" + hex(TOWERS[id].color), svg(id) + `<i>${TOWERS[id].cost}</i>`, `${T(TOWERS[id].name)} · ${T(TOWERS[id].note)} · ${TOWERS[id].cost}`)).join("");
    h += `<button type="button" class="wd-rb x" data-act="close" aria-label="${esc(T("Close"))}">×</button>`;
    m.innerHTML = h; m.hidden = false; mPos[0] = mPos[1] = NaN; afford(); markPick(); hover(pick); project();
  }
  function paintResult() {
    const el = els.res; if (!el || !result) return; const r = result;
    const note = r.state === "wait" ? T("Getting ready") + "…" : r.state === "offline" ? T("Sign in to earn ARCL") : r.state === "error" ? T("Rewards aren't available right now") : r.credited > 0 ? "" : r.wave > 0 && r.runsLeft === 0 ? T("No more rewarded runs today") : "";
    const stars = r.wave >= 15 ? 3 : r.wave >= 10 ? 2 : r.wave >= 5 ? 1 : 0, crown = r.state === "done" && r.wave > 0 && r.best === r.wave; // (the server's best is this week's, this run counted)
    el.hidden = !resReady;
    const h = `<div class="wd-card"><small>${esc(T("AC Defense"))}</small><h3>${esc(r.quit ? T("Waves cleared") : T("The Core fell"))}</h3>
      <div class="wd-stars" role="img" aria-label="${esc(T("{n} of 3 stars", { n: stars }))}">${[0, 1, 2].map((i) => `<span class="${i < stars ? "on" : ""}">${svg("star")}</span>`).join("")}</div><div class="wd-big">${r.wave}</div>
      ${crown ? `<div class="wd-crown">${svg("crown")}${esc(T("New weekly best!"))}</div>` : ""}
      <dl><div><dt>${esc(T("Waves cleared"))}</dt><dd>${r.wave}</dd></div><div><dt>${esc(T("Knock-outs"))}</dt><dd>${r.kills}</dd></div><div><dt>${esc(T("ARCL earned"))}</dt><dd>${r.state === "done" ? "+" + r.credited : "—"}</dd></div><div><dt>${esc(T("Weekly rank"))}</dt><dd>${r.rank ? "#" + r.rank : "—"}</dd></div></dl>
      ${r.best ? `<p>${esc(T("Best this week"))}: ${r.best} ${esc(T("waves"))}</p>` : ""}${(r.top || []).length ? `<ol class="wd-top3">${r.top.map((x) => `<li><b>${esc(x.name || x.w)}</b><span>${x.n}</span></li>`).join("")}</ol>` : ""}${note ? `<p class="wd-note">${esc(note)}</p>` : ""}<div class="wd-btns"><button type="button" class="wp-btn wd-cta" data-res="again">${esc(T("Play again"))}</button><button type="button" class="wp-btn" data-res="exit">${esc(T("Exit"))}</button></div></div>`;
    if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
  }
  // the big centred line: a wave starts, a boss comes, a wave is cleared (text only with reduced motion)
  let banId = 0;
  function banner(big, small, kind) {
    const b = els.ban; if (!b) return; tx(els.banB, big); tx(els.banS, small || "");
    b.className = "wd-ban " + (kind || ""); b.hidden = false; if (!RM) void b.offsetWidth; b.classList.add("in");
    clearTimeout(banId); timers.delete(banId); banId = later(() => { if (els.ban) els.ban.hidden = true; }, kind === "boss" ? 2400 : 1700);
  }

  // pad buttons (and the open menu) follow their pad on screen; a style is written only when its pixel or visibility changed
  const pv = new V3(), lastX = new Int32Array(ARENA.pads), lastY = new Int32Array(ARENA.pads), lastV = new Int8Array(ARENA.pads), mPos = [NaN, NaN];
  function project() {
    if (!ui || !padEls.length) return; const w = innerWidth, h = innerHeight; planet.updateMatrixWorld();
    for (let i = 0; i < padBtns.length; i++) {
      const p = padEls[i]; pv.set(p.x, towers[i] ? (towers[i].id === "barrier" ? 2.4 : 3.1) : 0.6, p.z); planet.localToWorld(pv); pv.project(st.camera);
      const el = padBtns[i], vis = pv.z < 1 && Math.abs(pv.x) < 1.1 && Math.abs(pv.y) < 1.1 ? 1 : 0;
      if (vis !== lastV[i]) { lastV[i] = vis; el.style.visibility = vis ? "visible" : "hidden"; }
      if (!vis) continue; const x = Math.round(((pv.x + 1) / 2) * w), y = Math.round(((1 - pv.y) / 2) * h);
      if (x !== lastX[i] || y !== lastY[i]) { lastX[i] = x; lastY[i] = y; el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; }
    }
    if (sel < 0 || !els.menu) return;
    // the ring sits on the pad, kept on screen and clear of the HUD, the joystick and the attack buttons
    const p = padEls[sel]; pv.set(p.x, 0.5, p.z); planet.localToWorld(pv); pv.project(st.camera); const m = RR + 34;
    const x = Math.round(Math.min(w - m, Math.max(m, ((pv.x + 1) / 2) * w))), y = Math.round(Math.min(h - m - (CO ? 210 : 40), Math.max(m + 90, ((1 - pv.y) / 2) * h)));
    if (x !== mPos[0] || y !== mPos[1]) { mPos[0] = x; mPos[1] = y; els.menu.style.transform = `translate(${x}px,${y}px)`; }
  }

  // ---------------- the loop ----------------
  let hudT = 0;
  function tick(dt, t) {
    if (!on) return;
    project();
    if (art) {
      // the portals: opening through the last 3 s before a wave, wide during it
      art.setPortals(phase === "wave" ? 1 : phase === "build" || phase === "break" ? Math.max(0, Math.min(0.85, 1 - timer / 3)) : 0);
      art.tick(dt, t);
    }
    if (sweepT >= 0 && sweepM) { sweepT += dt; const k = sweepT / 1.1, u = sweepM.material.uniforms; sweepM.visible = k < 1; u.uR.value = 0.08 + k * 0.95; u.uFade.value = (1 - k) * 1.2; if (k >= 1) sweepT = -1; }
    if (shownScrap < scrap) { shownScrap = Math.min(scrap, shownScrap + Math.max(1, Math.ceil((scrap - shownScrap) * Math.min(1, dt * 7)))); tx(els.scrap, T("Scrap") + " " + shownScrap); } // the counter ticks up
    if (lost && phase !== "over") { lost = false; finish(); }
    if (phase === "over") return;
    if (phase === "build" || phase === "break") { timer -= dt; if (timer <= 0 && canGo()) startWave(); }
    else if (phase === "wave") wt += dt;
    // 10 Hz: who's alive (one list a tick), spawns, the towers, the wave's end
    acc += dt; if (acc >= 0.1) {
      if (phase === "wave") {
        mobs = combat.defense.list(); aliveN = mobs.length;
        let room = cap - aliveN; while (queue.length && queue[0].at <= wt && room > 0) { if (!spawn(queue[0])) break; queue.shift(); room--; aliveN++; }
        towersTick(acc, mobs);
        if (!queue.length && !aliveN && wt > 1) endWave();
      }
      acc = 0;
    }
    if ((hudT -= dt) <= 0) { hudT = 0.25; paintHud(); }
  }
  st.on((dt, t) => { try { tick(dt, t); } catch (e) { console.warn("defense", e); } });

  return { start: begin, quit, active: () => on, tick };
}
