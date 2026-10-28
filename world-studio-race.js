// world-studio-race.js — SB-3 HOVER RACE (the owner's Studio Beta plan, phase 3: "Racing Creator" from the town's hoverboard
// race): a loop of rings on open ground, seen from behind your board (world-studio-gen.js genRace: the same track for
// everyone). Steer (the stick, A / D, the arrows), slow with S / down; the board speeds up on its own. Fly through the rings
// in order (an arrow points to the next), boost pads throw you forward, orbs are coins, pillars knock you back; laps
// against the clock — the seconds left at the finish count as coins too.
//   makeRace(o, env)        → the run          (env: { ctx, THREE, T, esc, makeFx, result, back })
//   createRaceBuilder(ctx)  → the editor: the ground from above — rings in order (tap to add the next), boost pads, orbs,
//                             pillars, drag to move a thing, erase, laps; the track drawn as a line through the rings
import { ask } from "./world-ask.js";
import { makePad } from "./world-studio-pad.js";
import { THEMES, RACE, genLevel, clampSpec, cleanRace, estimate, raceSpeed } from "./world-studio-gen.js";
import { look as themeLook } from "./world-studio-look.js";

export async function makeRace(o, env) {
  const { ctx, THREE, T, esc, makeFx, result } = env, { st } = ctx, spec = o.spec, L = genLevel(spec), B = L.B, th = THEMES[spec.theme] || THEMES.neon, V = raceSpeed(spec);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.fog, 60, 190); scene.userData.live = true;
  const cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, th.track, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(30, 60, 20); scene.add(sun);
  const std = (c, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.15, ...x }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
  const groundM = std(th.track, { roughness: 0.8 }), ground = new THREE.Mesh(new THREE.PlaneGeometry(RACE.R * 2 + 120, RACE.R * 2 + 120), groundM); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  themeLook(THREE, spec.theme, { ver: ctx.ver || "", low: !!(ctx.low || ctx.coarse) }).then((lk) => { if (!scene.userData.live) return; if (lk.sky) scene.background = lk.sky; if (lk.track) { const t = lk.track.clone(); t.repeat.set(26, 26); t.needsUpdate = true; groundM.map = t; groundM.color.set(0xffffff); groundM.needsUpdate = true; } }).catch(() => {});
  // the edge of the course: a ring of glowing posts
  { const n = 64, im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), glow(th.edge, 0.8), n), mt = new THREE.Matrix4(); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; mt.makeTranslation(Math.cos(a) * (RACE.R + 8), 1.5, Math.sin(a) * (RACE.R + 8)); im.setMatrixAt(i, mt); } scene.add(im); }
  // the track: a glowing line through the rings, the rings (the next one bright), pads, orbs, pillars
  const n = B.r.length, P = (q) => new THREE.Vector3(q[0], 0, q[1]);
  { const pts = [...B.r, B.r[0]].map((q) => new THREE.Vector3(q[0], 0.06, q[1])), curve = new THREE.CatmullRomCurve3(pts, false, "centripetal"), tube = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 14, 0.18, 6, false), glow(th.edge, 0.55)); scene.add(tube); }
  const rings = B.r.map((q, i) => { const nx = B.r[(i + 1) % n], pv = B.r[(i + n - 1) % n], m = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.28, 12, 40), glow(0xffd23a)); m.position.set(q[0], 3.4, q[1]); m.rotation.y = Math.atan2(nx[0] - pv[0], nx[1] - pv[1]); scene.add(m); return m; });
  const pads = B.p.map((q) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), glow(0x39ff88, 0.75)); m.rotation.x = -Math.PI / 2; m.position.set(q[0], 0.08, q[1]); scene.add(m); return { q, m, cd: 0 }; });
  const orbG = new THREE.IcosahedronGeometry(0.5, 1), orbM = std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.25 }), orbs = B.o.map((q) => { const m = new THREE.Mesh(orbG, orbM); m.position.set(q[0], 1.4, q[1]); scene.add(m); return { q, m, gone: false }; });
  const pillars = B.w.map((q) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 7, 14), std(th.wall, { emissive: th.wall, emissiveIntensity: 0.3 })); m.position.set(q[0], 3.5, q[1]); scene.add(m); return q; });
  // the board and the hero on it (idle: standing on the board — the board does the moving)
  const rig = new THREE.Group(); scene.add(rig); const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.1), std(0x1a2a4a, { emissive: th.edge, emissiveIntensity: 0.6 })); board.position.y = 0.45; rig.add(board);
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3), glow(th.edge, 0.5)); trail.rotation.x = -Math.PI / 2; trail.position.set(0, 0.2, -2.2); rig.add(trail);
  let hero = null; try { hero = await ctx.makeHero(); } catch { /* the board alone */ } if (hero) { rig.add(hero.obj); hero.obj.position.y = 0.52; try { hero.play("idle"); } catch { /* no clip */ } }
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 10), glow(0xffd23a)); arrow.rotation.x = Math.PI / 2; scene.add(arrow);
  // ---- the HUD ----
  document.body.classList.add("wp-studio");
  const hud = document.createElement("div"); hud.className = "wst-hud wst-rc";
  hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || spec.title)}</b><span class="wst-hl">🏁 1/${B.laps}</span><span class="wst-hr0">⭕ 0/${n}</span><span class="wst-ht">⏱ ${L.limit}</span><span class="wst-hc">🪙 0</span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div>${ctx.coarse ? "" : `<p class="wst-keys">${esc(T("A / D steer · S slow down"))}</p>`}`;
  document.body.appendChild(hud); const fx = makeFx(hud);
  const pad = ctx.coarse ? makePad(hud, { mode: "steer", T }) : null;
  const keyOn = new Set(), kd = (e) => { const k = e.key.toLowerCase(); if (["a", "d", "s", "arrowleft", "arrowright", "arrowdown"].includes(k)) { keyOn.add(k); e.preventDefault(); } }, ku = (e) => keyOn.delete(e.key.toLowerCase());
  addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
  const a0 = B.r[n - 1], s0 = B.r[0], h0 = Math.atan2(s0[0] - a0[0], s0[1] - a0[1]);
  // STB7 (2026-10-27): Meshy's start gate where you line up, the finish arch round the last ring (models/world/studio/fx)
  if (ctx.K && ctx.K.gltfLoader && !ctx.saver) { const ld = ctx.K.gltfLoader(), ver = ctx.ver || "";
    const put = (name, x, z, h, ry) => ld.loadAsync(`/models/world/studio/fx/${name}.glb${ver}`).then((g) => { if (!scene.userData.live) return; const m = g.scene, bx = new THREE.Box3().setFromObject(m), sz = bx.getSize(new THREE.Vector3()), k = h / (sz.y || 1);
      m.scale.setScalar(k); const w = new THREE.Group(); w.add(m); m.position.set(-((bx.min.x + bx.max.x) / 2) * k, -bx.min.y * k, -((bx.min.z + bx.max.z) / 2) * k); w.position.set(x, 0, z); w.rotation.y = ry; scene.add(w); }).catch(() => { /* the run goes on without it */ });
    put("race-start", s0[0] - Math.sin(h0) * 7, s0[1] - Math.cos(h0) * 7, 8.5, h0); if (n > 2) { const b0 = B.r[n - 2], hf = Math.atan2(a0[0] - b0[0], a0[1] - b0[1]); put("race-finish", a0[0], a0[1], 9.5, hf); } }
  const S = { x: s0[0] - Math.sin(h0) * 12, z: s0[1] - Math.cos(h0) * 12, h: h0, v: 0, boost: 0, next: 0, lap: 0, passed: 0, orbs: 0, t: -3, over: false, bump: 0 };
  const snd = (k) => { try { if (ctx.Snd && ctx.Snd[k]) ctx.Snd[k](); } catch { /* no sound */ } };
  const paint = () => { hud.querySelector(".wst-hl").textContent = `🏁 ${Math.min(B.laps, S.lap + 1)}/${B.laps}`; hud.querySelector(".wst-hr0").textContent = `⭕ ${S.next}/${n}`; hud.querySelector(".wst-ht").textContent = "⏱ " + Math.max(0, Math.ceil(L.limit - Math.max(0, S.t))); hud.querySelector(".wst-hc").textContent = "🪙 " + S.orbs; hud.querySelector(".wst-bar em").style.width = Math.min(100, (S.passed / (n * B.laps)) * 100).toFixed(1) + "%"; };
  function tick(dt, tt) {
    dt = Math.min(dt, 0.04);
    if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-Math.min(0, S.t)); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); if (cd) { cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) setTimeout(() => cd.remove(), 700); } } }
    else if (!S.over) {
      S.t += dt; const steer = (keyOn.has("d") || keyOn.has("arrowright") ? 1 : 0) - (keyOn.has("a") || keyOn.has("arrowleft") ? 1 : 0) || (pad && pad.on ? pad.x : 0), slow = keyOn.has("s") || keyOn.has("arrowdown");
      const top = V * (S.boost > 0 ? 1.7 : 1) * (slow ? 0.55 : 1); S.v += (top - S.v) * Math.min(1, dt * (S.v < top ? 1.3 : 3)); S.boost = Math.max(0, S.boost - dt);
      S.h -= steer * dt * (1.9 - Math.min(0.8, S.v / 40)); S.x += Math.sin(S.h) * S.v * dt; S.z += Math.cos(S.h) * S.v * dt;
      const R0 = Math.hypot(S.x, S.z); if (R0 > RACE.R + 6) { S.x *= (RACE.R + 6) / R0; S.z *= (RACE.R + 6) / R0; S.v *= 0.9; }
      for (const q of pillars) { const dx = S.x - q[0], dz = S.z - q[1], d = Math.hypot(dx, dz); if (d < 1.9) { S.x = q[0] + (dx / (d || 1)) * 1.9; S.z = q[1] + (dz / (d || 1)) * 1.9; if (S.bump <= 0) { S.v *= 0.35; S.bump = 0.6; snd("hurt"); fx.say("💥"); env.ouch && env.ouch(hud); } } }
      S.bump -= dt;
      for (const p of pads) { p.cd -= dt; if (p.cd <= 0 && Math.hypot(S.x - p.q[0], S.z - p.q[1]) < 2.2) { p.cd = 1; S.boost = 1.6; S.v = Math.max(S.v, V * 1.5); snd("dash"); fx.say("🚀 " + T("Boost!")); } }
      for (const ob of orbs) if (!ob.gone && Math.hypot(S.x - ob.q[0], S.z - ob.q[1]) < 1.6) { ob.gone = true; ob.m.visible = false; S.orbs++; snd("coin"); }
      const r = B.r[S.next]; if (Math.hypot(S.x - r[0], S.z - r[1]) < 3.6) { S.passed++; rings[S.next].material.color.set(0x7cf5c8); snd("coin"); S.next++; if (S.next >= n) { S.next = 0; S.lap++; rings.forEach((m) => m.material.color.set(0xffd23a)); if (S.lap >= B.laps) { end(true); } else fx.say("🏁 " + T("Lap {n}", { n: S.lap + 1 })); } }
      if (S.t >= L.limit) end(false);
      if (((S.t * 4) | 0) !== (((S.t - dt) * 4) | 0)) paint();
      fx.speed && fx.speed(Math.max(0, (S.v - V) / V));
    }
    rings.forEach((m, i) => { m.scale.setScalar(i === S.next && !S.over ? 1 + Math.sin(tt * 6) * 0.06 : 0.92); m.material.opacity = 1; });
    for (const ob of orbs) if (!ob.gone) { ob.m.rotation.y += dt * 2.5; ob.m.position.y = 1.4 + Math.sin(tt * 3 + ob.q[0]) * 0.2; }
    for (const p of pads) p.m.material.opacity = 0.5 + Math.sin(tt * 8) * 0.25;
    rig.position.set(S.x, Math.sin(tt * 5) * 0.06, S.z); rig.rotation.y = S.h; rig.rotation.z = -((keyOn.has("d") ? 1 : 0) - (keyOn.has("a") ? 1 : 0) || (pad && pad.on ? pad.x : 0)) * 0.22;
    trail.scale.y = 0.4 + Math.min(1.6, S.v / V); trail.material.opacity = S.boost > 0 ? 0.85 : 0.45;
    if (hero) hero.update(dt, tt);
    const nr = B.r[S.next], ah = Math.atan2(nr[0] - S.x, nr[1] - S.z); arrow.position.set(S.x + Math.sin(S.h) * 4, 3.2, S.z + Math.cos(S.h) * 4); arrow.rotation.set(Math.PI / 2, 0, -ah); arrow.rotation.order = "YXZ"; arrow.rotation.y = ah; arrow.rotation.x = Math.PI / 2;
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    const back = 8.5 + Math.min(4, S.v / 8); cam.position.lerp(new THREE.Vector3(S.x - Math.sin(S.h) * back, 4.4, S.z - Math.cos(S.h) * back), Math.min(1, dt * 5)); cam.lookAt(S.x + Math.sin(S.h) * 6, 1.4, S.z + Math.cos(S.h) * 6);
  }
  hud.querySelector(".wst-hx").addEventListener("click", () => leave());
  async function end(done) { if (S.over) return; S.over = true; if (pad) pad.hide(); paint(); if (hero) try { hero.play(done ? "emote-yes" : "emote-no", { once: true }); } catch { /* no clip */ }
    const left = done ? Math.max(0, Math.floor(L.limit - S.t)) : 0, coins = S.orbs + left;
    await result(o, hud, { trace: [], coins, dist: done ? L.len : S.passed * 20, done, line: `⭕ ${S.passed}/${n * B.laps} · 🪙 ${S.orbs} · ⏱ ${done ? Math.round(S.t) + " s (+" + left + ")" : T("Time's up")}`, head: done ? "🏁 " + T("Race finished!") : "⏱ " + T("Time's up"), confetti: done }, leave); }
  function leave(again) {
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true);
    st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio"); if (hero) rig.remove(hero.obj);
    scene.userData.live = false; scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (x.map && x.map !== groundM.map) x.map.dispose(); x.dispose(); }); });
    if (groundM.map) groundM.map.dispose();
    env.back(again, o);
  }
  st.view(scene, cam); st.solo(tick); tick(0.016, 0); paint();
  return { S, L, leave, isRace: true, steer: (d) => { keyOn.clear(); if (d > 0) keyOn.add("d"); if (d < 0) keyOn.add("a"); }, clips: () => (hero && hero.mixer ? hero.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x.getClip().name) : []) };
}

// ---------------- the editor: the ground from above ----------------
export function createRaceBuilder(ctx) {
  const { T, esc } = ctx; let spec = clampSpec(ctx.spec), B = spec.build && spec.build.rc ? JSON.parse(JSON.stringify(spec.build)) : { rc: 1, laps: 2, r: [], p: [], o: [], w: [] };
  const th = THEMES[spec.theme] || THEMES.neon, hex = (c) => "#" + c.toString(16).padStart(6, "0");
  let el = null, cv = null, g = null, raf = 0, dirty = true, tool = "r", undo = [], redo = [], drag = null, est = null;
  const snap = () => JSON.stringify(B), push = () => { undo.push(snap()); if (undo.length > 100) undo.shift(); redo = []; };
  const RIC = { r: "ic2/race-ring", p: "ic2/race-pad", o: "ic2/race-orb", w: "ic/pillar", mv: "ui2/tool-move", x: "ui2/tool-erase" }; // (STB7: Meshy's glass icons)
  const TOOLS = [["r", "⭕", "Ring"], ["p", "🚀", "Boost pad"], ["o", "🪙", "Orb"], ["w", "🗿", "Pillar"], ["mv", "✋", "Move"], ["x", "🧽", "Erase"]];
  function open() {
    el = document.createElement("div"); el.className = "wsb wsrc"; el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="wsb-in"><header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>${esc(T("Build it yourself"))}</b><span class="wsb-hr"><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}"><img src="/images/studio/ic2/tool-undo.webp?v=1" alt="" class="wsb-uic" onerror="this.replaceWith(document.createTextNode('↩️'))"></button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}"><img src="/images/studio/ic2/tool-redo.webp?v=1" alt="" class="wsb-uic" onerror="this.replaceWith(document.createTextNode('↪️'))"></button><button type="button" class="wsb-b alt" data-test>▶ ${esc(T("Test"))}</button><button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div><div class="wsb-main"><canvas class="wsb-cv"></canvas></div>
      <nav class="wsj-tools">${TOOLS.map(([k, ic, nm]) => `<button type="button" data-tool="${k}"><i>${RIC[k] ? `<img src="/images/studio/${RIC[k]}.webp?v=1" alt="" onerror="this.replaceWith(document.createTextNode('${ic}'))">` : ic}</i><span>${esc(T(nm))}</span></button>`).join("")}</nav></div>`;
    document.body.appendChild(el); cv = el.querySelector("canvas"); g = cv.getContext("2d"); el.addEventListener("click", onClick);
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointermove", pm); cv.addEventListener("pointerup", pu);
    addEventListener("resize", fit); fit(); tools(); bar(); loop();
  }
  function close(done) { cancelAnimationFrame(raf); removeEventListener("resize", fit); if (el) el.remove(); el = null; if (done) ctx.onDone(cleanRace(B)); if (ctx.onClose) ctx.onClose(); }
  let W = 0, H = 0, dpr = 1, u = 1, k = 1;
  function fit() { if (!cv) return; const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); u = document.documentElement.classList.contains("wp-pcphone") ? Math.max(1, r.width / 640) : 1; W = r.width / u; H = r.height / u; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); k = Math.min(W, H) / ((RACE.R + 6) * 2); dirty = true; }
  const sx = (x) => W / 2 + x * k, sy = (z) => H / 2 + z * k, wx = (px) => (px - W / 2) / k, wz = (py) => (py - H / 2) / k;
  function loop() { raf = requestAnimationFrame(loop); if (!dirty) return; dirty = false; draw(); }
  function draw() {
    g.setTransform(dpr * u, 0, 0, dpr * u, 0, 0); g.fillStyle = "#060c1e"; g.fillRect(0, 0, W, H);
    g.fillStyle = hex(th.track); g.globalAlpha = 0.55; g.beginPath(); g.arc(W / 2, H / 2, (RACE.R + 6) * k, 0, 7); g.fill(); g.globalAlpha = 1; g.strokeStyle = hex(th.edge); g.lineWidth = 2; g.stroke();
    if (B.r.length > 1) { g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 3; g.setLineDash([8, 6]); g.beginPath(); B.r.forEach((q, i) => (i ? g.lineTo(sx(q[0]), sy(q[1])) : g.moveTo(sx(q[0]), sy(q[1])))); g.closePath(); g.stroke(); g.setLineDash([]); }
    for (const q of B.p) { g.fillStyle = "#39ff88"; g.fillRect(sx(q[0]) - 7, sy(q[1]) - 7, 14, 14); }
    for (const q of B.o) { g.fillStyle = "#ffc94a"; g.beginPath(); g.arc(sx(q[0]), sy(q[1]), 4, 0, 7); g.fill(); }
    for (const q of B.w) { g.fillStyle = hex(th.wall); g.beginPath(); g.arc(sx(q[0]), sy(q[1]), 1.2 * k + 2, 0, 7); g.fill(); }
    B.r.forEach((q, i) => { g.strokeStyle = i === 0 ? "#7cf5c8" : "#ffd23a"; g.lineWidth = 4; g.beginPath(); g.arc(sx(q[0]), sy(q[1]), 3.4 * k + 3, 0, 7); g.stroke(); g.fillStyle = "#fff"; g.font = "800 12px Sora, sans-serif"; g.textAlign = "center"; g.fillText(String(i + 1), sx(q[0]), sy(q[1]) + 4); });
  }
  const near = (list, x, z, r) => list.findIndex((q) => Math.hypot(q[0] - x, q[1] - z) < r);
  function pd(e) { const r0 = cv.getBoundingClientRect(), x = wx((e.clientX - r0.left) / u), z = wz((e.clientY - r0.top) / u); cv.setPointerCapture(e.pointerId);
    if (tool === "mv") { for (const L2 of ["r", "p", "o", "w"]) { const i = near(B[L2], x, z, 4); if (i >= 0) { push(); drag = { L2, i }; return; } } return; }
    if (Math.hypot(x, z) > RACE.R) return; push();
    if (tool === "x") { for (const L2 of ["r", "p", "o", "w"]) { const i = near(B[L2], x, z, 4); if (i >= 0) { B[L2].splice(i, 1); break; } } }
    else B[tool].push([Math.round(x * 2) / 2, Math.round(z * 2) / 2]);
    after(); }
  function pm(e) { if (!drag) return; const r0 = cv.getBoundingClientRect(), x = wx((e.clientX - r0.left) / u), z = wz((e.clientY - r0.top) / u); if (Math.hypot(x, z) > RACE.R) return; B[drag.L2][drag.i] = [Math.round(x * 2) / 2, Math.round(z * 2) / 2]; dirty = true; }
  function pu() { if (drag) { drag = null; after(); } }
  function after() { if (ctx.onChange) try { ctx.onChange(B); } catch { /* (STB7: the Studio's autosave) */ } est = null; dirty = true; bar(); }
  function tools() { if (!el) return; el.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tool)); }
  function bar() { if (!el) return; const c = cleanRace(B), E = est || (est = estimate(clampSpec({ ...spec, build: c.r.length >= RACE.MIN ? c : null })));
    el.querySelector(".wsb-bar").innerHTML = `<span class="wsb-len"><button type="button" class="wsb-i" data-laps="-1">－</button><b>${B.laps} ${esc(T("laps"))}</b><button type="button" class="wsb-i" data-laps="1">＋</button></span><span class="wsb-st">${"★".repeat(E.stars)}<i>${"★".repeat(5 - E.stars)}</i> <small>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</small></span><span class="wsb-cnt">⭕ ${c.r.length}/${RACE.RINGS} · 🚀 ${c.p.length} · 🪙 ${c.o.length} · 🗿 ${c.w.length}</span>${c.r.length < RACE.MIN ? `<span class="wsb-bad">⚠️ ${esc(T("A track needs at least {n} rings", { n: RACE.MIN }))}</span>` : c.r.length < B.r.length ? `<span class="wsb-bad">⚠️ ${esc(T("Rings closer than {m} m to the one before don't count", { m: RACE.GAP }))}</span>` : ""}`;
    el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length; }
  function onClick(e) { const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.hasAttribute("data-close")) { if (undo.length) { ask(T, T("Leave without keeping your changes?"), { ok: T("Leave"), danger: true }).then((y) => { if (y) close(false); }); return; } return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-undo")) { if (undo.length) { redo.push(snap()); B = JSON.parse(undo.pop()); after(); } return; }
    if (b.hasAttribute("data-redo")) { if (redo.length) { undo.push(snap()); B = JSON.parse(redo.pop()); after(); } return; }
    if (b.hasAttribute("data-test")) { const c = cleanRace(B); if (c.r.length < RACE.MIN) { ctx.toast(esc(T("A track needs at least {n} rings", { n: RACE.MIN }))); return; } ctx.onTest(clampSpec({ ...spec, build: c }), 0); return; }
    if (b.dataset.tool) { tool = b.dataset.tool; tools(); return; }
    if (b.dataset.laps) { push(); B.laps = Math.max(1, Math.min(3, B.laps + Number(b.dataset.laps))); after(); } }
  return { open, close, state: () => ({ B, tool }), setTool: (t) => { tool = t; tools(); }, put: (x, z) => { push(); B[tool].push([x, z]); after(); } };
}
