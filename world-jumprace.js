// world-jumprace.js — Coin Jump, the Game Village's second game (loaded the first time its door is used, like AC Defense).
// A spiral of floating platforms climbs over the village square, a coin on each; 90 seconds to collect what you can
// and reach the crown at the top. Every 6th platform is a checkpoint: fall to the ground and you're put back on the
// last one you reached. The player's own jump does the climbing — world-play.js asks floorAt() for the ground under
// the feet while a run is on (the same hook the island's bricks use). A run only keeps a personal best (this device);
// it pays nothing.
//
// ctx: { THREE, planet, T, esc, toast, Snd, vfx, reduce, low, coarse, origin {x,z}, keep: [objects that stay],
//        pos() → {x, y, z} planet-local feet, place(x, z), lift(y), setArena(r), leave() }
const N = 24, RISE = 0.8, TIME = 90, CHECK = 6, BEST = "arc.world.jumpBest";
const LW = {
  ko: { "Coin Jump": "코인 점프", Coins: "코인", Time: "시간", Quit: "그만두기", "Climb to the crown!": "왕관까지 올라가세요!", "Checkpoint": "체크포인트", "Back to the checkpoint": "체크포인트로 돌아가요", "You reached the crown!": "왕관에 도착했어요!", "Time's up": "시간 종료", "New best!": "최고 기록!", Best: "최고", "Play again": "다시 하기", Leave: "나가기", "Crown bonus": "왕관 보너스", Score: "점수" },
  zh: { "Coin Jump": "金币跳跃", Coins: "金币", Time: "时间", Quit: "退出", "Climb to the crown!": "爬到王冠处！", "Checkpoint": "检查点", "Back to the checkpoint": "回到检查点", "You reached the crown!": "你到达了王冠！", "Time's up": "时间到", "New best!": "新纪录！", Best: "最佳", "Play again": "再玩一次", Leave: "离开", "Crown bonus": "王冠奖励", Score: "分数" },
  tr: { "Coin Jump": "Para Zıplama", Coins: "Paralar", Time: "Süre", Quit: "Çık", "Climb to the crown!": "Taca kadar tırman!", "Checkpoint": "Kontrol noktası", "Back to the checkpoint": "Kontrol noktasına dönüyorsun", "You reached the crown!": "Taca ulaştın!", "Time's up": "Süre doldu", "New best!": "Yeni rekor!", Best: "En iyi", "Play again": "Tekrar oyna", Leave: "Ayrıl", "Crown bonus": "Taç bonusu", Score: "Puan" },
};

export function createJumpRace(ctx) {
  const { THREE, planet, esc } = ctx, L = LW[ctx.lang] || {}, T = (s, v) => (L[s] != null ? L[s] : ctx.T(s, v));
  const O = ctx.origin || { x: 0, z: 0 };
  let on = false, root = null, ui = null, plats = [], coinMesh = null, crown = null, got = null, reached = 0, timer = 0, phase = "idle", hidden = [], spinT = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  // the course: platform i sits on a widening spiral, RISE higher than the last; the top one is the crown
  const platAt = (i) => { const a = i * 0.62, r = 5.2 + (i % 2) * 0.6 + i * 0.12; return { x: O.x + Math.cos(a) * r, z: O.z + Math.sin(a) * r, y: 0.6 + i * RISE, r: i === N - 1 ? 1.9 : 1.35 }; };
  function build() {
    root = new THREE.Group(); root.name = "jumprace"; planet.add(root);
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.1, flatShading: true, ...o });
    const glow = (c, k) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
    plats = Array.from({ length: N }, (_, i) => platAt(i));
    const top = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.35, 10), std(0x9ad4ff), N), rim = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.07, 6, 28), glow(0x38d8ff, 1.4), N);
    const cols = new THREE.Color();
    plats.forEach((p, i) => {
      top.setMatrixAt(i, m4.compose(v.set(p.x, p.y - 0.18, p.z), q.identity(), new THREE.Vector3(p.r, 1, p.r)));
      top.setColorAt(i, cols.set(i === N - 1 ? 0xffd23a : (i + 1) % CHECK === 0 ? 0x7dff9a : 0x9ad4ff));
      e.set(Math.PI / 2, 0, 0); q.setFromEuler(e); rim.setMatrixAt(i, m4.compose(v.set(p.x, p.y + 0.01, p.z), q, new THREE.Vector3(p.r, p.r, 1)));
    });
    top.receiveShadow = true; top.castShadow = !ctx.low; root.add(top, rim);
    coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), glow(0xffc861, 1.1), N - 1); root.add(coinMesh);
    got = new Array(N - 1).fill(false);
    crown = new THREE.Group(); const cp = plats[N - 1]; crown.position.set(cp.x, cp.y + 1.2, cp.z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.35, 10, 1, true), glow(0xffd23a, 1.3)); crown.add(band);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2, s = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), glow(0xffd23a, 1.3)); s.position.set(Math.cos(a) * 0.5, 0.33, Math.sin(a) * 0.5); crown.add(s); }
    root.add(crown);
    paintCoins(0);
  }
  function paintCoins(t) {
    if (!coinMesh) return;
    for (let i = 0; i < N - 1; i++) {
      const p = plats[i]; e.set(Math.PI / 2, t * 2 + i, 0); q.setFromEuler(e);
      coinMesh.setMatrixAt(i, m4.compose(v.set(p.x, p.y + 0.85 + Math.sin(t * 3 + i) * 0.1, p.z), q, got[i] ? zero : one));
    }
    coinMesh.instanceMatrix.needsUpdate = true;
  }
  function teardown() {
    if (!root) return; planet.remove(root);
    root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); } });
    root = null; coinMesh = null; crown = null; plats = [];
  }
  // the world steps aside like in AC Defense: everything but the Game Village (ctx.keep) and the always-on layers
  const KEEP = /^(ground|particles|smoke|pet|grass|clouds|ambient|vfx|decor)$/;
  function hideWorld() { hidden = []; for (const c of planet.children) if (c.visible && c !== root && !KEEP.test(c.name || "") && !(ctx.keep || []).includes(c) && !c.isLight) { c.visible = false; hidden.push(c); } }
  function showWorld() { for (const c of hidden) c.visible = true; hidden = []; }

  // ---------------- the HUD and the result card ----------------
  function mountUi() {
    ui = document.createElement("div"); ui.className = "wj-ui"; ui.setAttribute("data-no-i18n", "");
    ui.innerHTML = `<div class="wj-hud" data-game-hud><b>${esc(T("Coin Jump"))}</b><span class="wj-c"></span><span class="wj-t"></span><button type="button" data-wj="quit">${esc(T("Quit"))}</button></div><div class="wj-res" hidden></div>`;
    ui.addEventListener("click", (ev) => { const b = ev.target.closest("[data-wj]"); if (!b) return; const k = b.dataset.wj; if (k === "quit") finish(false); else if (k === "again") { exit(); start(); } else if (k === "leave") exit(); });
    document.body.appendChild(ui);
  }
  const last = { c: -1, t: -1 };
  function paintHud() {
    if (!ui) return; const c = got ? got.filter(Boolean).length : 0, t = Math.max(0, Math.ceil(timer));
    if (c !== last.c) { last.c = c; ui.querySelector(".wj-c").textContent = `${T("Coins")} ${c}/${N - 1}`; }
    if (t !== last.t) { last.t = t; const el = ui.querySelector(".wj-t"); el.textContent = `${T("Time")} ${t}s`; el.classList.toggle("low", t <= 10); }
  }
  function finish(crowned) {
    if (phase !== "run") return; phase = "over";
    const coins = got.filter(Boolean).length, score = coins * 10 + (crowned ? 100 + Math.max(0, Math.floor(timer)) * 2 : 0);
    let best = 0; try { best = Number(localStorage.getItem(BEST)) || 0; } catch { /* private */ }
    const nb = score > best; if (nb) try { localStorage.setItem(BEST, String(score)); } catch { /* private */ }
    if (crowned && ctx.vfx && ctx.vfx.levelUp && !ctx.reduce) ctx.vfx.levelUp();
    const snd = ctx.Snd && (crowned ? ctx.Snd.win : ctx.Snd.coin); if (snd) snd();
    const r = ui.querySelector(".wj-res"); r.hidden = false;
    r.innerHTML = `<div class="wj-card"><small>${esc(T("Coin Jump"))}</small><h3>${esc(crowned ? T("You reached the crown!") : T("Time's up"))}</h3><div class="wj-big">${score}</div><p>${esc(T("Coins"))} ${coins}/${N - 1}${crowned ? ` · ${esc(T("Crown bonus"))}` : ""}</p><p>${esc(nb ? T("New best!") : `${T("Best")}: ${Math.max(best, score)}`)}</p><div class="wj-btns"><button type="button" class="go" data-wj="again">${esc(T("Play again"))}</button><button type="button" data-wj="leave">${esc(T("Leave"))}</button></div></div>`;
  }
  function exit() {
    on = false; phase = "idle"; showWorld(); teardown(); if (ui) { ui.remove(); ui = null; } ctx.setArena(0); if (ctx.leave) ctx.leave();
  }
  function start() {
    if (on) return; on = true; phase = "run"; timer = TIME; reached = 0; last.c = last.t = -1;
    try { hideWorld(); build(); mountUi(); ctx.setArena(15); const p = plats[0]; ctx.place(p.x + 2.2, p.z); paintHud(); ctx.toast(T("Climb to the crown!")); }
    catch (err) { exit(); throw err; }
  }
  // the ground under the feet: the platform below (its top within a small step of the feet), else the square
  function floorAt(x, z, y) {
    let best = 0;
    for (let i = 0; i < plats.length; i++) { const p = plats[i], dx = x - p.x, dz = z - p.z; if (dx * dx + dz * dz <= p.r * p.r && p.y <= y + 0.56 && p.y > best) best = p.y; }
    return best;
  }
  const ckOf = (i) => Math.floor((i + 1) / CHECK) * CHECK - 1; // the last checkpoint at or below platform i (the green ones), -1 for none
  function tick(dt, t) {
    if (!on || !root) return;
    spinT += dt; paintCoins(spinT); if (crown) crown.rotation.y += dt * 1.2;
    if (phase !== "run") return;
    timer -= dt; paintHud();
    const me = ctx.pos();
    for (let i = 0; i < N - 1; i++) { if (got[i]) continue; const p = plats[i], dx = me.x - p.x, dz = me.z - p.z, dy = me.y + 0.9 - (p.y + 0.85); if (dx * dx + dz * dz < 1.1 && Math.abs(dy) < 1.2) { got[i] = true; if (ctx.Snd && ctx.Snd.coin) ctx.Snd.coin(); } }
    // the highest platform stood on; every CHECK-th is a checkpoint
    for (let i = plats.length - 1; i > reached; i--) { const p = plats[i], dx = me.x - p.x, dz = me.z - p.z; if (Math.abs(me.y - p.y) < 0.15 && dx * dx + dz * dz <= p.r * p.r) { if (ckOf(i) > ckOf(reached) && i < N - 1) ctx.toast(T("Checkpoint")); reached = i; break; } }
    if (reached === N - 1) { finish(true); return; }
    if (me.y < 0.05 && ckOf(reached) >= 0) { const ck = plats[ckOf(reached)]; ctx.place(ck.x, ck.z); ctx.lift(ck.y); ctx.toast(T("Back to the checkpoint")); }
    if (timer <= 0) finish(false);
  }
  return { start, quit: () => { if (phase === "run") finish(false); else if (on) exit(); }, reset: () => { if (on) exit(); }, active: () => on, floorAt, tick };
}
