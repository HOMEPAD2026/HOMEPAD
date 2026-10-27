// world-studio-rhythm.js — SB-3 BEAT MAKER (the owner's Studio Beta plan, phase 3: "Rhythm Maker" from Beat Stomp's idea):
// four lanes on a glowing highway, notes on half-beats at the maker's tempo (world-studio-gen.js genBeat). The beat — a
// kick, a snare, hats, a bass line — is made here with Web Audio and scheduled on the audio clock, so the notes and the
// sound agree to the millisecond (no sound: the same clock, silent). Tap a lane (D F J K, the arrows, the four pads on a
// phone) as a note reaches the line: Perfect or Good, the combo grows, the groove meter fills; a miss drains it — empty
// and the song stops. Your hero dances on the stage (emote-yes / attack / cast / shoot one-shots on the hits, CU_AS names).
//   makeBeat(o, env)          → the run           (env: { ctx, THREE, T, esc, makeFx, result, back })
//   createBeatBuilder(ctx)    → the editor: the song as a timeline, beats down the screen, four lanes across; tap to put
//                                or take a note, drag to scroll, test from where you're looking; two notes at once at most
import { ask } from "./world-ask.js";
import { THEMES, BEAT, genLevel, clampSpec, cleanBeat, estimate, stepsOf, bpmOf } from "./world-studio-gen.js";

const LC = [0xff6fae, 0xffd23a, 0x7cf5c8, 0x5fd3ff], LCS = ["#ff6fae", "#ffd23a", "#7cf5c8", "#5fd3ff"], KEYS = [["d", "arrowleft"], ["f", "arrowdown"], ["j", "arrowup"], ["k", "arrowright"]];
const LEAD = 2.2, SPEED = 20; // seconds a note is seen before the line, metres a second

export async function makeBeat(o, env) {
  const { ctx, THREE, T, esc, makeFx, result } = env, { st } = ctx, spec = o.spec, L = genLevel(spec), th = THEMES[spec.theme] || THEMES.neon, spb = 60 / L.bpm / 2; // (seconds a half-beat)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b1c); scene.fog = new THREE.Fog(0x070b1c, 30, 80); scene.userData.live = true;
  const cam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 200); cam.position.set(0, 6.2, 8.5); cam.lookAt(0, 0, -12);
  scene.add(new THREE.HemisphereLight(0xb9d8ff, 0x201030, 1)); const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 8, 6); scene.add(key);
  const glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
  // the highway: four lanes into the distance, the hit line, lane pads that flash, side lights that pulse on the beat
  const W = 1.5, X = (l) => (l - 1.5) * W, road = new THREE.Mesh(new THREE.PlaneGeometry(W * 4 + 0.6, 70), new THREE.MeshStandardMaterial({ color: 0x10183a, roughness: 0.4, metalness: 0.4 })); road.rotation.x = -Math.PI / 2; road.position.z = -32; scene.add(road);
  for (let l = 0; l <= 4; l++) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 70), glow(l % 4 ? 0x3a4a7a : th.edge, l % 4 ? 0.6 : 1)); ln.rotation.x = -Math.PI / 2; ln.position.set((l - 2) * W, 0.01, -32); scene.add(ln); }
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(W * 4, 0.12), glow(0xffffff, 0.9)); hit.rotation.x = -Math.PI / 2; hit.position.set(0, 0.02, 0); scene.add(hit);
  const pads = LC.map((c, l) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.6, 28), glow(c, 0.35)); m.rotation.x = -Math.PI / 2; m.position.set(X(l), 0.03, 0); scene.add(m); return m; });
  const side = []; for (let i = 0; i < 12; i++) for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), glow(th.edge, 0.7)); m.position.set(s * (W * 2 + 0.8), 0.7, -i * 5.5); scene.add(m); side.push(m); }
  // the stage behind the road, the hero dancing on it
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.5, 40), new THREE.MeshStandardMaterial({ color: 0x1a2350, emissive: th.edge, emissiveIntensity: 0.15 })); stage.position.set(0, 0.25, -40); scene.add(stage);
  let hero = null; try { hero = await ctx.makeHero(); } catch { /* the stage stays empty */ } const me = new THREE.Group(); me.position.set(0, 0.5, -40); scene.add(me); if (hero) { me.add(hero.obj); hero.obj.scale.multiplyScalar(2.2); try { hero.play("idle"); } catch { /* no clip */ } }
  const spot = new THREE.SpotLight(0xffffff, 40, 30, 0.5, 0.6); spot.position.set(0, 12, -34); spot.target = me; scene.add(spot, spot.target);
  // the notes: one mesh each (a song holds a few hundred), shown only near the line
  const noteG = new THREE.SphereGeometry(0.42, 16, 12), mats = LC.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, roughness: 0.3 }));
  const notes = L.B.n.map(([s0, l]) => { const m = new THREE.Mesh(noteG, mats[l]); m.visible = false; m.scale.set(1, 0.6, 1); scene.add(m); return { s: s0, l, t: 3 + s0 * spb, m, done: false }; });
  const startT = o.startZ ? Math.max(0, (o.startZ * spb) - 1) : 0; for (const n of notes) if (n.t - 3 < startT) { n.done = true; n.skip = true; }
  // ---- the beat on the audio clock ----
  let ac = null; const sound = !ctx.soundOn || ctx.soundOn(); try { if (sound) ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; }
  const t0 = (ac ? ac.currentTime : performance.now() / 1000) + 0.15 - startT, now = () => (ac ? ac.currentTime : performance.now() / 1000) - t0; // (song seconds: 0 = the count-in, 3 = the first step)
  const out = ac ? ac.createGain() : null; if (out) { out.gain.value = 0.55; out.connect(ac.destination); }
  const env0 = (g, at, a, d, v) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + d); };
  function drum(kind, at) { if (!ac) return; const g = ac.createGain(); g.connect(out);
    if (kind === "kick") { const os = ac.createOscillator(); os.frequency.setValueAtTime(150, at); os.frequency.exponentialRampToValueAtTime(42, at + 0.14); os.connect(g); env0(g, at, 0.003, 0.22, 0.9); os.start(at); os.stop(at + 0.3); }
    else { const n = ac.createBufferSource(), b = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; n.buffer = b; const f = ac.createBiquadFilter(); f.type = kind === "hat" ? "highpass" : "bandpass"; f.frequency.value = kind === "hat" ? 7000 : 1800; n.connect(f); f.connect(g); env0(g, at, 0.002, kind === "hat" ? 0.04 : 0.14, kind === "hat" ? 0.22 : 0.5); n.start(at); n.stop(at + 0.2); } }
  function bass(at, f0) { if (!ac) return; const os = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); os.type = "sawtooth"; os.frequency.value = f0; f.type = "lowpass"; f.frequency.value = 520; os.connect(f); f.connect(g); g.connect(out); env0(g, at, 0.01, spb * 1.6, 0.28); os.start(at); os.stop(at + spb * 2); }
  const ROOTS = [55, 55, 65.4, 49], blip = (l) => { if (!ac) return; const at = ac.currentTime, os = ac.createOscillator(), g = ac.createGain(); os.type = "triangle"; os.frequency.value = [523, 659, 784, 988][l]; os.connect(g); g.connect(out); env0(g, at, 0.004, 0.12, 0.25); os.start(at); os.stop(at + 0.2); };
  let sched = Math.max(0, Math.floor((startT - 3) / spb)); const lastStep = L.steps + 8;
  function schedule() { if (!ac) return; const until = now() + 0.25; while (sched < lastStep && 3 + sched * spb < until) { const at = t0 + 3 + sched * spb; if (at >= ac.currentTime - 0.01) { if (sched % 4 === 0) drum("kick", at); if (sched % 8 === 4) drum("snare", at); drum("hat", at); if (sched % 4 === 0) bass(at, ROOTS[Math.floor(sched / 16) % 4]); } sched++; } }
  // ---- the HUD ----
  document.body.classList.add("wp-studio");
  const hud = document.createElement("div"); hud.className = "wst-hud wst-bt";
  hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || spec.title)}</b><span class="wst-hg"><i><em></em></i></span><span class="wst-hc">0</span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><b class="wst-judge"></b>
    <div class="wbt-pads">${LCS.map((c, l) => `<button type="button" data-lane="${l}" style="--c:${c}"><i>${["D", "F", "J", "K"][l]}</i></button>`).join("")}</div>`;
  document.body.appendChild(hud); const fx = makeFx(hud), judge = hud.querySelector(".wst-judge");
  const S = { score: 0, perfect: 0, good: 0, miss: 0, combo: 0, best: 0, groove: L.groove, over: false, passed: 0 };
  const say = (w, c) => { judge.textContent = w; judge.style.color = c; judge.classList.remove("pop"); void judge.offsetWidth; judge.classList.add("pop"); };
  const paint = () => { hud.querySelector(".wst-hc").textContent = String(S.perfect * 2 + S.good); hud.querySelector(".wst-hg em").style.width = Math.max(0, (S.groove / L.groove) * 100).toFixed(0) + "%"; hud.querySelector(".wst-bar em").style.width = Math.min(100, (S.passed / Math.max(1, notes.length)) * 100).toFixed(1) + "%"; };
  const DANCE = ["emote-yes", "attack", "cast", "shoot"]; let di = 0, danceCd = 0;
  function press(l) {
    if (S.over) return; const t = now(); pads[l].material.opacity = 0.95; pads[l].scale.setScalar(1.25);
    let best = null; for (const n of notes) { if (n.done || n.l !== l) continue; const d = Math.abs(n.t - t); if (d <= BEAT.GOOD && (!best || d < Math.abs(best.t - t))) best = n; if (n.t - t > BEAT.GOOD) break; }
    if (!best) return; best.done = true; best.m.visible = false; S.passed++; const perf = Math.abs(best.t - t) <= BEAT.PERFECT;
    if (perf) S.perfect++; else S.good++; S.combo++; S.best = Math.max(S.best, S.combo); S.groove = Math.min(L.groove, S.groove + 0.25); fx.combo(S.combo);
    say(perf ? T("Perfect!") : T("Good"), perf ? "#ffd23a" : "#7cf5c8"); blip(l); burst(X(l), LC[l]); paint();
    if (hero && danceCd <= 0 && !hero.busy()) { try { hero.play(DANCE[di++ % DANCE.length], { once: true, speed: 1.4 }); } catch { /* no clip */ } danceCd = 0.6; }
  }
  const sparks = []; function burst(x, c) { for (let i = 0; i < (ctx.low ? 4 : 9); i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), glow(c)); p.position.set(x, 0.3, 0); p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 2); p.userData.life = 0.5; scene.add(p); sparks.push(p); } }
  const kd = (e) => { const k = e.key.toLowerCase(), l = KEYS.findIndex((q) => q.includes(k)); if (l >= 0) { e.preventDefault(); if (!e.repeat) press(l); } };
  addEventListener("keydown", kd, true);
  hud.querySelectorAll("[data-lane]").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); press(Number(b.dataset.lane)); }));
  hud.querySelector(".wst-hx").addEventListener("click", () => leave());
  let shown = 3;
  function tick(dt, tt) {
    dt = Math.min(dt, 0.05); const t = now(); schedule(); danceCd -= dt;
    if (t < 3) { const n = Math.ceil(3 - t); if (n !== shown) { shown = n; const cd = hud.querySelector(".wst-cd"); if (cd) { cd.textContent = String(n); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); } } }
    else if (shown > 0) { shown = 0; const cd = hud.querySelector(".wst-cd"); if (cd) { cd.textContent = T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); setTimeout(() => cd.remove(), 700); } }
    for (const n of notes) { if (n.done) continue; const ahead = n.t - t; if (ahead > LEAD + 0.2) break;
      if (ahead < -BEAT.GOOD) { n.done = true; n.m.visible = false; S.passed++; S.miss++; S.combo = 0; fx.combo(0); S.groove -= 1; say(T("Miss"), "#ff6b85"); paint(); if (S.groove <= 0 && !S.over) { end(false); return; } continue; }
      n.m.visible = true; n.m.position.set(X(n.l), 0.35, -ahead * SPEED); }
    const beatK = 1 - (((t - 3) / (spb * 2)) % 1 + 1) % 1; for (const m of side) m.scale.y = 0.6 + beatK * 0.8;
    pads.forEach((p) => { p.material.opacity += (0.35 - p.material.opacity) * Math.min(1, dt * 8); p.scale.setScalar(1 + (p.scale.x - 1) * Math.max(0, 1 - dt * 10)); });
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.userData.life -= dt; p.userData.v.y -= 12 * dt; p.position.addScaledVector(p.userData.v, dt); if (p.userData.life <= 0) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); sparks.splice(i, 1); } }
    if (hero) { hero.update(dt, tt); me.rotation.y = Math.sin(tt * 1.2) * 0.25; }
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    if (!S.over && t > 3 + (L.steps + 4) * spb) end(true);
  }
  async function end(done) { if (S.over) return; S.over = true; if (hero) try { hero.play(done ? "emote-yes" : "emote-no", { once: true }); } catch { /* no clip */ }
    const coins = S.perfect * 2 + S.good, dist = S.passed * 10;
    await result(o, hud, { trace: [], coins, dist: done ? L.len : dist, done, line: `✨ ${S.perfect} · ✓ ${S.good} · ✕ ${S.miss} · ${T("best combo")} ${S.best}`, head: done ? "🎵 " + T("Song clear!") : "💔 " + T("The groove ran out"), confetti: done && S.miss === 0 }, leave); }
  function leave(again) {
    removeEventListener("keydown", kd, true); try { if (ac) ac.close(); } catch { /* closed */ }
    st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio"); if (hero) me.remove(hero.obj);
    scene.userData.live = false; scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
    env.back(again, o);
  }
  st.view(scene, cam); st.solo(tick); paint();
  return { S, L, leave, isBeat: true, press, now, notes, clips: () => (hero && hero.mixer ? hero.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x.getClip().name) : []) };
}

// ---------------- the editor ----------------
export function createBeatBuilder(ctx) {
  const { T, esc } = ctx; let spec = clampSpec(ctx.spec), B = spec.build && spec.build.bt ? JSON.parse(JSON.stringify(spec.build)) : { bt: 1, n: [] };
  const N = stepsOf(spec), bpm = bpmOf(spec); let el = null, cv = null, g = null, raf = 0, dirty = true, view = 0, undo = [], redo = [], drag = null, est = null;
  const snap = () => JSON.stringify(B), push = () => { undo.push(snap()); if (undo.length > 100) undo.shift(); redo = []; };
  function open() {
    el = document.createElement("div"); el.className = "wsb wsbt"; el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="wsb-in"><header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>🎵 ${esc(T("Build it yourself"))}</b><span class="wsb-hr"><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}">↩️</button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}">↪️</button><button type="button" class="wsb-b alt" data-test>▶ ${esc(T("Test from here"))}</button><button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div><div class="wsb-main"><canvas class="wsb-cv"></canvas></div>
      <nav class="wsj-tools wbt-tools"><button type="button" data-fill="beat"><i>🥁</i><span>${esc(T("Fill the beats"))}</span></button><button type="button" data-fill="clear"><i>🧽</i><span>${esc(T("Clear this bar"))}</span></button><button type="button" data-fill="mirror"><i>🪞</i><span>${esc(T("Mirror"))}</span></button><button type="button" data-test class="alt"><i>▶</i><span>${esc(T("Test"))}</span></button><button type="button" data-done class="go"><i>✓</i><span>${esc(T("Done"))}</span></button></nav></div>`;
    document.body.appendChild(el); cv = el.querySelector("canvas"); g = cv.getContext("2d"); el.addEventListener("click", onClick);
    cv.addEventListener("pointerdown", (e) => { drag = { y: e.clientY, v0: view, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; if (Math.abs(e.clientY - drag.y) > 6) drag.moved = true; if (drag.moved) { view = clampV(drag.v0 + (e.clientY - drag.y) / u / SP()); dirty = true; } });
    cv.addEventListener("pointerup", (e) => { const d = drag; drag = null; if (!d || d.moved) return; const r = cv.getBoundingClientRect(); tap((e.clientX - r.left) / u, (e.clientY - r.top) / u); });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); view = clampV(view - e.deltaY / SP()); dirty = true; }, { passive: false });
    addEventListener("resize", fit); fit(); bar(); loop();
  }
  function close(done) { cancelAnimationFrame(raf); removeEventListener("resize", fit); if (el) el.remove(); el = null; if (done) ctx.onDone(cleanBeat(B, spec)); if (ctx.onClose) ctx.onClose(); }
  let W = 0, H = 0, dpr = 1, u = 1; const SP = () => 26, LW = () => Math.min(110, (W - 80) / 4), X0 = () => (W - LW() * 4) / 2 + 20;
  function fit() { if (!cv) return; const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); u = document.documentElement.classList.contains("wp-pcphone") ? Math.max(1, r.width / 640) : 1; W = r.width / u; H = r.height / u; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); dirty = true; }
  const clampV = (v) => Math.max(0, Math.min(N - H / SP() + 4, v)), yOf = (s0) => H - (s0 - view) * SP() - 14, sAt = (py) => Math.round(view + (H - 14 - py) / SP());
  function loop() { raf = requestAnimationFrame(loop); if (!dirty) return; dirty = false; draw(); }
  function draw() {
    g.setTransform(dpr * u, 0, 0, dpr * u, 0, 0); g.fillStyle = "#070b1c"; g.fillRect(0, 0, W, H); const X = X0(), lw = LW();
    for (let s0 = Math.max(0, Math.floor(view)); s0 < Math.min(N, view + H / SP() + 2); s0++) { const y = yOf(s0); g.fillStyle = s0 % 8 === 0 ? "rgba(255,255,255,.22)" : s0 % 2 === 0 ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.035)"; g.fillRect(X, y, lw * 4, 1);
      if (s0 % 8 === 0) { g.fillStyle = "rgba(255,255,255,.55)"; g.font = "700 10px Sora, sans-serif"; g.textAlign = "right"; g.fillText(`${Math.floor(s0 / 8) + 1}`, X - 8, y + 4); }
      if (s0 < 8) { g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(X, y - SP(), lw * 4, SP()); } }
    for (let l = 0; l <= 4; l++) { g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(X + l * lw, 0, 1, H); }
    for (const [s0, l] of B.n) { const y = yOf(s0); if (y < -20 || y > H + 20) continue; g.fillStyle = LCS[l]; g.beginPath(); g.ellipse(X + (l + 0.5) * lw, y, lw * 0.32, 8, 0, 0, 7); g.fill(); g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 1.5; g.stroke(); }
    g.fillStyle = "rgba(255,255,255,.6)"; g.font = "800 11px Sora, sans-serif"; g.textAlign = "center"; ["D", "F", "J", "K"].forEach((k, l) => g.fillText(k, X + (l + 0.5) * lw, H - 2));
  }
  function tap(px, py) { const X = X0(), lw = LW(), l = Math.floor((px - X) / lw), s0 = sAt(py); if (l < 0 || l > 3 || s0 < 8 || s0 >= N) return; push(); const i = B.n.findIndex((q) => q[0] === s0 && q[1] === l); if (i >= 0) B.n.splice(i, 1); else { if (B.n.filter((q) => q[0] === s0).length >= 2) { ctx.toast(esc(T("Two notes at once at most"))); undo.pop(); return; } B.n.push([s0, l]); } after(); }
  function after() { if (ctx.onChange) try { ctx.onChange(B); } catch { /* (STB7: the Studio's autosave) */ } B = cleanBeat(B, spec); est = null; dirty = true; bar(); }
  function bar() { if (!el) return; const E = est || (est = estimate(clampSpec({ ...spec, build: B }))); el.querySelector(".wsb-bar").innerHTML = `<span><b>♩ ${bpm}</b> BPM · ${spec.len} s</span><span class="wsb-st">${"★".repeat(E.stars)}<i>${"★".repeat(5 - E.stars)}</i> <small>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</small></span><span class="wsb-cnt">🎵 ${B.n.length} / ${BEAT.MAX}</span>`; el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length; }
  function onClick(e) { const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.hasAttribute("data-close")) { if (undo.length) { ask(T, T("Leave without keeping your changes?"), { ok: T("Leave"), danger: true }).then((y) => { if (y) close(false); }); return; } return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-undo")) { if (undo.length) { redo.push(snap()); B = JSON.parse(undo.pop()); after(); } return; }
    if (b.hasAttribute("data-redo")) { if (redo.length) { undo.push(snap()); B = JSON.parse(redo.pop()); after(); } return; }
    if (b.hasAttribute("data-test")) { ctx.onTest(clampSpec({ ...spec, build: cleanBeat(B, spec) }), Math.max(0, Math.floor(view))); return; }
    if (b.dataset.fill) { const a = Math.max(8, Math.floor(view / 8) * 8), z = a + 8; push();
      if (b.dataset.fill === "clear") B.n = B.n.filter((q) => q[0] < a || q[0] >= z);
      if (b.dataset.fill === "beat") for (let s0 = a; s0 < z; s0 += 2) if (!B.n.some((q) => q[0] === s0)) B.n.push([s0, (s0 / 2) % 4]);
      if (b.dataset.fill === "mirror") B.n = B.n.map(([s0, l]) => (s0 >= a && s0 < z ? [s0, 3 - l] : [s0, l]));
      after(); } }
  return { open, close, state: () => ({ B, view }), tap: (s0, l) => { const X = X0(), lw = LW(); tap(X + (l + 0.5) * lw, yOf(s0)); }, scrollTo: (s0) => { view = clampV(s0); dirty = true; } };
}
