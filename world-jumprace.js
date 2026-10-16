// world-jumprace.js — Coin Jump, the Game Village's second game (loaded the first time its door is used, like AC Defense).
// A spiral of floating platforms climbs over the village square, a coin on each; 90 seconds to collect what you can
// and reach the crown at the top. Every 6th platform is a checkpoint: fall to the ground and you're put back on the
// last one you reached. The player's own jump does the climbing — world-play.js asks floorAt() for the ground under
// the feet while a run is on (the same hook the island's bricks use). A run only keeps a personal best (this device);
// b445: reaching the crown pays 3,000 ARCL once a day to a signed-in wallet (api/_world-jump.mjs checks the run on the
// server's clock); a guest's run keeps only its best.
//
// ctx: { THREE, planet, T, esc, toast, Snd, vfx, reduce, low, coarse, origin {x,z}, keep: [objects that stay],
//        pos() → {x, y, z} planet-local feet, place(x, z), lift(y), setArena(r), leave() }
const N = 24, RISE = 0.8, TIME = 90, CHECK = 6, BEST = "arc.world.jumpBest";
const LW = {
  ko: { "+{n} ARCL for the crown": "왕관 보상 +{n} ARCL", "Today's crown reward is already yours": "오늘 왕관 보상은 이미 받았어요", "Sign in with a wallet to earn 3,000 ARCL a day for the crown": "지갑으로 로그인하면 왕관에 도달할 때 하루 3,000 ARCL을 받아요", "Sending your crown…": "왕관 기록 보내는 중…", "The reward couldn't be sent — try again later": "보상을 보내지 못했어요 — 잠시 후 다시 해 보세요", "Reach the crown: 3,000 ARCL once a day": "왕관 도달: 하루 1회 3,000 ARCL", "Coin Jump": "코인 점프", Coins: "코인", Time: "시간", Quit: "그만두기", "Climb to the crown!": "왕관까지 올라가세요!", "Checkpoint": "체크포인트", "Back to the checkpoint": "체크포인트로 돌아가요", "You reached the crown!": "왕관에 도착했어요!", "Time's up": "시간 종료", "New best!": "최고 기록!", Best: "최고", "Play again": "다시 하기", Leave: "나가기", "Crown bonus": "왕관 보너스", Score: "점수" },
  zh: { "+{n} ARCL for the crown": "王冠奖励 +{n} ARCL", "Today's crown reward is already yours": "今天的王冠奖励已领取", "Sign in with a wallet to earn 3,000 ARCL a day for the crown": "用钱包登录，每天到达王冠可得 3,000 ARCL", "Sending your crown…": "正在提交王冠记录…", "The reward couldn't be sent — try again later": "奖励发送失败——请稍后再试", "Reach the crown: 3,000 ARCL once a day": "到达王冠：每天一次 3,000 ARCL", "Coin Jump": "金币跳跃", Coins: "金币", Time: "时间", Quit: "退出", "Climb to the crown!": "爬到王冠处！", "Checkpoint": "检查点", "Back to the checkpoint": "回到检查点", "You reached the crown!": "你到达了王冠！", "Time's up": "时间到", "New best!": "新纪录！", Best: "最佳", "Play again": "再玩一次", Leave: "离开", "Crown bonus": "王冠奖励", Score: "分数" },
  tr: { "+{n} ARCL for the crown": "Taç ödülü +{n} ARCL", "Today's crown reward is already yours": "Bugünün taç ödülünü zaten aldın", "Sign in with a wallet to earn 3,000 ARCL a day for the crown": "Cüzdanla giriş yap, taca ulaşınca günde 3.000 ARCL kazan", "Sending your crown…": "Taç kaydın gönderiliyor…", "The reward couldn't be sent — try again later": "Ödül gönderilemedi — sonra tekrar dene", "Reach the crown: 3,000 ARCL once a day": "Taca ulaş: günde bir kez 3.000 ARCL", "Coin Jump": "Para Zıplama", Coins: "Paralar", Time: "Süre", Quit: "Çık", "Climb to the crown!": "Taca kadar tırman!", "Checkpoint": "Kontrol noktası", "Back to the checkpoint": "Kontrol noktasına dönüyorsun", "You reached the crown!": "Taca ulaştın!", "Time's up": "Süre doldu", "New best!": "Yeni rekor!", Best: "En iyi", "Play again": "Tekrar oyna", Leave: "Ayrıl", "Crown bonus": "Taç bonusu", Score: "Puan" },
};

export function createJumpRace(ctx) {
  const { THREE, planet, esc } = ctx, L = LW[ctx.lang] || {}, T = (s, v) => (L[s] != null ? L[s] : ctx.T(s, v));
  const O = ctx.origin || { x: 0, z: 0 };
  let run = null, runP = null, t0 = 0; let on = false, root = null, ui = null, plats = [], coinMesh = null, crown = null, got = null, reached = 0, timer = 0, phase = "idle", hidden = [], spinT = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  // the course: platform i sits on a widening spiral, RISE higher than the last; the top one is the crown
  // b444: a new course every day (the Seoul date): the spiral's step and lean change, and some pads bob up and down,
  // crumble a moment after you land (back 3 s later) or throw you up (a jump pad). Heights stay, so the climb is as long.
  const dayNo = () => Math.floor((Date.now() + 9 * 3600e3) / 864e5);
  const rng = (s0) => { let s = s0 | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  let lay = { step: 0.62, lean: 0, kinds: [] };
  function plan() {
    const r = rng(dayNo() * 7919 + 13), kinds = new Array(N).fill("n"), free = [];
    for (let i = 2; i < N - 2; i++) if ((i + 1) % CHECK !== 0 && (i + 2) % CHECK !== 0) free.push(i); // never a checkpoint or the pad before one
    for (const [k, n] of [["bob", 4], ["fall", 3], ["jump", 2]]) for (let c = 0; c < n && free.length; c++) { const j = Math.floor(r() * free.length); kinds[free[j]] = k; free.splice(j, 1); }
    lay = { step: 0.58 + r() * 0.08, lean: (r() - 0.5) * 0.6, kinds };
  }
  const platAt = (i) => { const a = i * lay.step, r = 5.2 + lay.lean + (i % 2) * 0.6 + i * 0.12, y = 0.6 + i * RISE; return { x: O.x + Math.cos(a) * r, z: O.z + Math.sin(a) * r, y, y0: y, r: i === N - 1 ? 1.9 : 1.35, kind: lay.kinds[i] || "n", fallT: 0, goneT: 0, gone: false, bounceT: 0 }; };
  const KC = { n: [0xd4ecff, 0x5ab8ff, 0x38d8ff], bob: [0xcfe6ff, 0x8fd0ff, 0x8ff0ff], fall: [0xffe0c8, 0xff9a4a, 0xff8a3c], jump: [0xffd0f2, 0xff5ad8, 0xff4dd2] };
  // b441: the course's meshes and materials are made once and kept between runs (each run used to make and then
  // dispose them, so every start compiled their shaders again: a stall right as the run began). ctx.warm compiles them
  // the first time, before the run is shown.
  let made = false, top, rim, inset, flags, beam, mark, markRing;
  function build() {
    if (!made) {
      made = true; root = new THREE.Group(); root.name = "jumprace";
      const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.15, flatShading: true, ...o });
      const glow = (c, k, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, ...o });
      // a hex pad: a pale body, a glowing plate set into its top, a light ring round its edge
      top = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.82, 0.42, 6), std(0xffffff), N);
      inset = new THREE.InstancedMesh(new THREE.CircleGeometry(0.8, 6), glow(0xffffff, 0.55, { transparent: true, opacity: 0.9 }), N);
      rim = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.06, 6, 6), glow(0x38d8ff, 1.5), N);
      top.receiveShadow = true; top.castShadow = !ctx.low; root.add(top, inset, rim);
      // a flag on every checkpoint pad (placed with the course, see placeCourse)
      flags = new THREE.Group();
      const poleG = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), flagG = new THREE.PlaneGeometry(0.7, 0.42), poleM = std(0xe8eef4), flagM = glow(0x39ff88, 0.9, { side: THREE.DoubleSide, flatShading: false });
      for (let k = CHECK - 1; k < N - 1; k += CHECK) { const f = new THREE.Group(); const pole = new THREE.Mesh(poleG, poleM); pole.position.y = 0.8; const fl = new THREE.Mesh(flagG, flagM); fl.position.set(0.36, 1.38, 0); f.add(pole, fl); f.userData.i = k; flags.add(f); }
      root.add(flags);
      // the coins: gold, a little metal, spinning over each pad
      coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 18), glow(0xffc23a, 0.45, { metalness: 0.55, roughness: 0.3 }), N - 1); root.add(coinMesh);
      crown = new THREE.Group(); crown.scale.setScalar(1.35);
      const cm = glow(0xffd23a, 1.2, { metalness: 0.5, roughness: 0.3 });
      crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.35, 10, 1, true), cm));
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 5), cm); sp.position.set(Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5); crown.add(sp);
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), glow(0xff4d8d, 1.5)); gem.position.set(Math.cos(a) * 0.53, 0.02, Math.sin(a) * 0.53); crown.add(gem); }
      root.add(crown);
      // the goal: a soft beam of light over the crown, seen from the foot of the climb
      beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 14, 20, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: "varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "varying float vY; void main(){ gl_FragColor = vec4(1.0, 0.82, 0.3, (1.0 - vY) * 0.35); }" }));
      root.add(beam);
      // where you'll land: a soft shadow on whatever is under your feet, and a ring that tightens as you come down
      const mc = document.createElement("canvas"); mc.width = mc.height = 64; const mg = mc.getContext("2d"), gr = mg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(0.6, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)"); mg.fillStyle = gr; mg.fillRect(0, 0, 64, 64);
      mark = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false })); mark.rotation.x = -Math.PI / 2; mark.renderOrder = 3;
      markRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false })); markRing.rotation.x = -Math.PI / 2; markRing.renderOrder = 3;
      root.add(mark, markRing);
    }
    plan(); plats = Array.from({ length: N }, (_, i) => platAt(i)); placeCourse();
    planet.add(root);
    got = new Array(N - 1).fill(false);
    paintCoins(0);
    if (ctx.warm) try { ctx.warm(); } catch { /* compiled on first sight instead */ }
  }
  const cols = new THREE.Color(), ex = new THREE.Euler(), sc3 = new THREE.Vector3();
  function padAt(i) { // one pad's three instances, at its current height (or gone)
    const p = plats[i], rot = i * 0.4, k = p.gone ? 0.0001 : 1;
    q.setFromEuler(ex.set(0, rot, 0)); top.setMatrixAt(i, m4.compose(v.set(p.x, p.y - 0.21, p.z), q, sc3.set(p.r * k, k, p.r * k)));
    q.setFromEuler(ex.set(-Math.PI / 2, 0, rot + Math.PI / 6)); inset.setMatrixAt(i, m4.compose(v.set(p.x, p.y + 0.005, p.z), q, sc3.set(p.r * k, p.r * k, 1)));
    q.setFromEuler(ex.set(Math.PI / 2, 0, rot + Math.PI / 6)); rim.setMatrixAt(i, m4.compose(v.set(p.x, p.y + 0.01, p.z), q, sc3.set(p.r * k, p.r * k, 1)));
  }
  function placeCourse() {
    plats.forEach((p, i) => {
      const ck = (i + 1) % CHECK === 0, last = i === N - 1, c = last ? [0xffe27a, 0xffc23a, 0xffd23a] : ck ? [0xb8ffd0, 0x4dff88, 0x39ff88] : KC[p.kind];
      top.setColorAt(i, cols.set(c[0])); inset.setColorAt(i, cols.set(c[1])); rim.setColorAt(i, cols.set(c[2])); padAt(i);
    });
    [top, inset, rim].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    for (const f of flags.children) { const p = plats[f.userData.i], a = Math.atan2(p.z - O.z, p.x - O.x); f.position.set(p.x + Math.cos(a) * p.r * 0.7, p.y, p.z + Math.sin(a) * p.r * 0.7); }
    const cp = plats[N - 1]; crown.position.set(cp.x, cp.y + 1.3, cp.z); beam.position.set(cp.x, cp.y + 7.2, cp.z);
  }
  // the moving parts, each frame: bobbing pads, crumbling ones (a shake, then gone for 3 s), jump pads
  function tickPads(dt, t, me) {
    let moved = false;
    for (let i = 0; i < plats.length; i++) {
      const p = plats[i]; if (p.kind === "n") continue;
      const on = !p.gone && Math.abs(me.y - p.y) < 0.15 && (me.x - p.x) ** 2 + (me.z - p.z) ** 2 <= p.r * p.r;
      if (p.kind === "bob") { p.y = p.y0 + Math.sin(t * 1.3 + i) * 0.45; moved = true; }
      else if (p.kind === "fall") {
        if (p.gone) { if ((p.goneT -= dt) <= 0) { p.gone = false; p.fallT = 0; moved = true; } }
        else if (on || p.fallT > 0) { p.fallT += dt; p.y = p.y0 + Math.sin(p.fallT * 60) * 0.03; moved = true; if (p.fallT > 0.8) { p.gone = true; p.goneT = 3; p.y = p.y0; if (ctx.Snd && ctx.Snd.land) ctx.Snd.land(4); } }
      } else if (p.kind === "jump") { p.bounceT = Math.max(0, p.bounceT - dt); if (on && p.bounceT <= 0 && ctx.boost) { p.bounceT = 0.5; ctx.boost(13); if (ctx.Snd && ctx.Snd.jump) ctx.Snd.jump(); } }
      if (moved) padAt(i);
    }
    if (moved) [top, inset, rim].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  }
  function paintCoins(t) {
    if (!coinMesh) return;
    for (let i = 0; i < N - 1; i++) {
      const p = plats[i]; e.set(Math.PI / 2, t * 2 + i, 0); q.setFromEuler(e);
      coinMesh.setMatrixAt(i, m4.compose(v.set(p.x, p.y + 0.85 + Math.sin(t * 3 + i) * 0.1, p.z), q, got[i] ? zero : one));
    }
    coinMesh.instanceMatrix.needsUpdate = true;
  }
  function teardown() { if (root) planet.remove(root); } // kept for the next run (see build)
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
  async function sendEnd(crowned) {
    const ss = ctx.sess ? ctx.sess() : null; if (!ss || !ctx.post) return;
    const paint = (txt, good) => { const el = ui && ui.querySelector(".wj-pay"); if (el) { el.textContent = txt; el.classList.toggle("good", !!good); } };
    try {
      const rr = await runP; if (!rr) { if (crowned) paint(T("The reward couldn't be sent — try again later")); return; }
      const res = await ctx.post({ action: "world-jump-end", ...ss, runId: rr.runId, crowned: !!crowned, ms: Math.round((TIME - Math.max(0, timer)) * 1000) });
      if (!crowned) return;
      if (res && res.ok && res.j) { if (res.j.credited > 0) { paint(T("+{n} ARCL for the crown").replace("{n}", res.j.credited.toLocaleString()), true); if (ctx.refresh) ctx.refresh(); } else paint(T("Today's crown reward is already yours")); }
      else paint(T("The reward couldn't be sent — try again later"));
    } catch { if (crowned) paint(T("The reward couldn't be sent — try again later")); }
  }
  function finish(crowned) {
    if (phase !== "run") return; phase = "over";
    const coins = got.filter(Boolean).length, score = coins * 10 + (crowned ? 100 + Math.max(0, Math.floor(timer)) * 2 : 0);
    let best = 0; try { best = Number(localStorage.getItem(BEST)) || 0; } catch { /* private */ }
    const nb = score > best; if (nb) try { localStorage.setItem(BEST, String(score)); } catch { /* private */ }
    if (crowned && ctx.vfx && ctx.vfx.levelUp && !ctx.reduce) ctx.vfx.levelUp();
    const snd = ctx.Snd && (crowned ? ctx.Snd.win : ctx.Snd.coin); if (snd) snd();
    const r = ui.querySelector(".wj-res"); r.hidden = false;
    r.innerHTML = `<div class="wj-card"><small>${esc(T("Coin Jump"))}</small><h3>${esc(crowned ? T("You reached the crown!") : T("Time's up"))}</h3><div class="wj-big">${score}</div><p>${esc(T("Coins"))} ${coins}/${N - 1}${crowned ? ` · ${esc(T("Crown bonus"))}` : ""}</p><p>${esc(nb ? T("New best!") : `${T("Best")}: ${Math.max(best, score)}`)}</p>${crowned ? `<p class="wj-pay">${esc(ctx.sess && ctx.sess() ? T("Sending your crown…") : T("Sign in with a wallet to earn 3,000 ARCL a day for the crown"))}</p>` : ""}<div class="wj-btns"><button type="button" class="go" data-wj="again">${esc(T("Play again"))}</button><button type="button" data-wj="leave">${esc(T("Leave"))}</button></div></div>`;
    sendEnd(crowned);
  }
  function exit() {
    on = false; phase = "idle"; showWorld(); teardown(); if (ui) { ui.remove(); ui = null; } ctx.setArena(0); if (ctx.leave) ctx.leave();
  }
  function start() {
    if (on) return; on = true; phase = "run"; timer = TIME; reached = 0; last.c = last.t = -1;
    run = null; t0 = Date.now(); const ss = ctx.sess ? ctx.sess() : null; runP = ss && ctx.post ? ctx.post({ action: "world-jump-start", ...ss }).then((r) => { if (r && r.ok && r.j && r.j.runId) run = r.j; return run; }).catch(() => null) : Promise.resolve(null);
    try { hideWorld(); build(); mountUi(); ctx.setArena(15); const p = plats[0]; ctx.place(p.x + 2.2, p.z); paintHud(); ctx.toast(T("Climb to the crown!")); if (ctx.sess && ctx.sess()) setTimeout(() => { if (on && phase === "run") ctx.toast(T("Reach the crown: 3,000 ARCL once a day")); }, 2200); }
    catch (err) { exit(); throw err; }
  }
  // the ground under the feet: the platform below (its top within a small step of the feet), else the square
  function floorAt(x, z, y) {
    let best = 0;
    for (let i = 0; i < plats.length; i++) { const p = plats[i], dx = x - p.x, dz = z - p.z; if (!p.gone && dx * dx + dz * dz <= p.r * p.r && p.y <= y + 0.56 && p.y > best) best = p.y; }
    return best;
  }
  const ckOf = (i) => Math.floor((i + 1) / CHECK) * CHECK - 1; // the last checkpoint at or below platform i (the green ones), -1 for none
  function tick(dt, t) {
    if (!on || !root) return;
    spinT += dt; paintCoins(spinT); if (crown) crown.rotation.y += dt * 1.2;
    if (phase !== "run") { if (mark) mark.visible = markRing.visible = false; return; }
    timer -= dt; paintHud();
    const me = ctx.pos(); tickPads(dt, t, me);
    { const fy = floorAt(me.x, me.z, me.y), h = Math.max(0, me.y - fy), k = Math.max(0.35, 1 - h / 6); // the landing marker
      mark.visible = markRing.visible = true; mark.position.set(me.x, fy + 0.03, me.z); markRing.position.set(me.x, fy + 0.035, me.z);
      mark.scale.setScalar(0.6 + k * 0.5); mark.material.opacity = k; markRing.scale.setScalar(0.6 + Math.min(1.6, h * 0.35)); markRing.material.opacity = h > 0.2 ? 0.85 : 0; }
    for (let i = 0; i < N - 1; i++) { if (got[i]) continue; const p = plats[i], dx = me.x - p.x, dz = me.z - p.z, dy = me.y + 0.9 - (p.y + 0.85); if (dx * dx + dz * dz < 1.1 && Math.abs(dy) < 1.2) { got[i] = true; if (ctx.Snd && ctx.Snd.coin) ctx.Snd.coin(); if (ctx.vfx && ctx.vfx.collect && !ctx.reduce) ctx.vfx.collect(new THREE.Vector3(p.x, p.y + 0.85, p.z)); } }
    // the highest platform stood on; every CHECK-th is a checkpoint
    for (let i = plats.length - 1; i > reached; i--) { const p = plats[i], dx = me.x - p.x, dz = me.z - p.z; if (Math.abs(me.y - p.y) < 0.15 && dx * dx + dz * dz <= p.r * p.r) { if (ckOf(i) > ckOf(reached) && i < N - 1) ctx.toast(T("Checkpoint")); reached = i; break; } }
    if (reached === N - 1) { finish(true); return; }
    if (me.y < 0.05 && ckOf(reached) >= 0) { const ck = plats[ckOf(reached)]; ctx.place(ck.x, ck.z); ctx.lift(ck.y0); ctx.toast(T("Back to the checkpoint")); }
    if (timer <= 0) finish(false);
  }
  return { start, quit: () => { if (phase === "run") finish(false); else if (on) exit(); }, reset: () => { if (on) exit(); }, active: () => on, floorAt, tick, pads: () => plats.map((p) => ({ x: p.x, y: p.y, z: p.z, kind: p.kind, gone: p.gone, fallT: +p.fallT.toFixed(2) })) };
}
