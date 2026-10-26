// world-studio-climb.js — Studio 4d: SKY CLIMB, a player-made tower of platforms seen from the side (world-studio-gen.js
// genClimb: the same level for everyone). Your hero bounces on its own (jump going up, fall coming down), you steer left and
// right — the sides wrap round —, moving platforms slide, breaking ones give one bounce, springs throw you high, spikes hurt;
// fall below the screen and you lose a heart and come back on the last platform you stood on. Reach the top.
// env: { ctx, THREE, T, esc, makeFx, makeGhost, result, back(again) }
import { look as themeLook } from "./world-studio-look.js";
import { THEMES, CLIMB, genLevel } from "./world-studio-gen.js";

export async function makeClimb(o, env) {
  const { ctx, THREE, T, esc, makeFx, makeGhost, result } = env, { st } = ctx, th = THEMES[o.spec.theme], L = genLevel(o.spec), H = L.H, G = CLIMB.G, V0 = Math.sqrt(2 * G * H), HW = CLIMB.W / 2 + 0.6;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.fog, 24, 70);
  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, th.track, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(4, 10, 8); scene.add(sun);
  const std = (c, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...x }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
  // the tower behind: a back wall with glowing bands every 10 m, the edges where you wrap round, the ground and the top
  const wall = new THREE.Mesh(new THREE.BoxGeometry(CLIMB.W + 3, L.len + 30, 0.6), std(th.track, { roughness: 0.8 })); wall.position.set(0, L.len / 2 + 5, -1.6); scene.add(wall);
  for (let y = 10; y < L.len; y += 10) { const b = new THREE.Mesh(new THREE.BoxGeometry(CLIMB.W + 3, 0.08, 0.1), glow(th.edge, 0.45)); b.position.set(0, y, -1.25); scene.add(b); }
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, L.len + 30, 0.12), glow(th.edge, 0.8)); e.position.set(sx * HW, L.len / 2 + 5, -1.2); scene.add(e); }
  { const wm0 = wall.material; scene.userData.live = true; themeLook(THREE, o.spec.theme, { ver: ctx.ver || "", low: !!(ctx.low || ctx.coarse) }).then((lk) => { if (!scene.userData.live) return; if (lk.sky) scene.background = lk.sky; if (lk.wall) { lk.wall.repeat.set(2, 8); wm0.map = lk.wall; wm0.color.lerp(new THREE.Color(0xffffff), 0.5); wm0.needsUpdate = true; } }).catch(() => { /* the drawn look stays */ }); } // (STU-B: the theme's sky and tower face)
  const ground = new THREE.Mesh(new THREE.BoxGeometry(CLIMB.W + 3, 1, 3), std(th.prop)); ground.position.set(0, -0.5, 0); scene.add(ground);
  const top = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 10, 40), glow(0xffd23a)); top.position.set(0, L.len + 2.2, 0); scene.add(top);
  // the pieces: platforms (one mesh each — a level holds a few hundred at most), coins and hearts
  const pG = new THREE.BoxGeometry(1.8, 0.32, 1.6), M = { plat: std(th.wall, { emissive: th.wall, emissiveIntensity: 0.3 }), mplat: std(0xff9a3d, { emissive: 0xff7a1a, emissiveIntensity: 0.4 }), break: std(0xc8a27a, { roughness: 0.9 }), spring: std(0x7cf5c8, { emissive: 0x2fd39a, emissiveIntensity: 0.5 }) };
  const spikeM = std(0xff3355, { emissive: 0xff2244, emissiveIntensity: 0.5 }), spikeG = new THREE.ConeGeometry(0.3, 0.6, 8), coinG = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 18), coinM = std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 }), heartG = new THREE.OctahedronGeometry(0.4), heartM = std(0xff4d6d, { emissive: 0xff2d55, emissiveIntensity: 0.7 });
  const X = (c) => CLIMB.COLS[c] || 0, items = [];
  for (const r of L.rows) { let m;
    if (M[r.k]) { m = new THREE.Mesh(pG, M[r.k]); if (r.k === "spring") { const c = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.08, 6, 16), glow(0x7cf5c8)); c.rotation.x = Math.PI / 2; c.position.y = 0.28; m.add(c); } }
    else if (r.k === "spike") { m = new THREE.Group(); for (const dx of [-0.5, 0, 0.5]) { const s = new THREE.Mesh(spikeG, spikeM); s.position.set(dx, 0.3, 0); m.add(s); } const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1), std(0x2a2f3a)); m.add(base); }
    else if (r.k === "coin") { m = new THREE.Mesh(coinG, coinM); m.rotation.x = Math.PI / 2; }
    else if (r.k === "heart") m = new THREE.Mesh(heartG, heartM);
    else continue;
    m.position.set(X(r.lane), r.z, 0); scene.add(m); items.push({ ...r, x: X(r.lane), m, gone: false }); }
  const lands = items.filter((i) => M[i.k]);
  // the hero
  let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("studio hero", e); }
  const me = new THREE.Group(); scene.add(me); if (hero) { me.add(hero.obj); try { hero.play("fall"); } catch { /* no clip */ } } else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 10), std(0xeef4fb)); cap.position.y = 0.9; me.add(cap); }
  const gh = makeGhost(scene, o.ghost, false);
  document.body.classList.add("wp-studio");
  const hud = document.createElement("div"); hud.className = "wst-hud"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-help">${esc(T(ctx.coarse ? "Hold the left or right side to steer · the sides wrap round" : "← → / A D to steer · the sides wrap round"))}</p><div class="wst-speed" aria-hidden="true"></div>`;
  document.body.appendChild(hud);
  const start = Math.max(0, Math.min(L.len - 10, o.startZ || 0)), from = start > 0 ? lands.filter((p) => p.z <= start).pop() : null;
  const S = { x: from ? from.x : 0, y: from ? from.z + 0.16 : 0, vy: 0, hearts: 3, inv: 0, coins: 0, t: -3, over: false, clip: "", best: from ? from.z : 0, last: from, face: 0, combo: 0, lastCoin: -9, tr: [] }, fx = makeFx(hud);
  const keyOn = new Set(), kd = (e) => { const k = e.key.toLowerCase(); if (["arrowleft", "arrowright", "a", "d"].includes(k)) { keyOn.add(k); e.preventDefault(); } }, ku = (e) => keyOn.delete(e.key.toLowerCase());
  let hold = 0; const pd = (e) => { if (e.target.closest && e.target.closest("button")) return; hold = e.clientX < innerWidth / 2 ? -1 : 1; }, pm = (e) => { if (hold && e.buttons !== 0) hold = e.clientX < innerWidth / 2 ? -1 : 1; }, pu = () => { hold = 0; };
  addEventListener("keydown", kd, true); addEventListener("keyup", ku, true); addEventListener("pointerdown", pd); addEventListener("pointermove", pm); addEventListener("pointerup", pu); addEventListener("pointercancel", pu);
  const play = (c, once) => { if (!hero) return; try { hero.play(c, once ? { once: true } : {}); } catch { /* no clip */ } S.clip = once ? "" : c; };
  const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(Math.max(0, 3 - Math.max(0, S.hearts))); hud.querySelector(".wst-hc").textContent = `🪙 ${S.coins} · ${Math.round(S.best)} m`; hud.querySelector(".wst-bar em").style.width = Math.min(100, (S.best / L.len) * 100).toFixed(1) + "%"; };
  function hurt(fell) { if (S.over) return; if (!fell && S.inv > 0) return; S.hearts--; S.inv = 1.4; play(S.hearts > 0 ? "hit" : "die", true); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } paintHud(); if (S.hearts <= 0) return end(false);
    if (fell) { const p = S.last && !S.last.gone ? S.last : lands.filter((q) => !q.gone && q.z <= S.best).pop(); S.x = p ? p.x : 0; S.y = p ? p.z + 0.16 : 0; S.vy = V0; } else S.vy = Math.max(S.vy, V0 * 0.6); }
  const mx = (p, t) => p.k === "mplat" ? p.x + Math.sin(t * 1.3 + p.z * 0.7) * 2.2 : p.x;
  let camY = S.y + 3, halfH = 9;
  function tick(dt, t) {
    dt = Math.min(dt, 0.05);
    if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-Math.min(0, S.t)); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) { setTimeout(() => cd.remove(), 700); S.vy = V0; play("jump"); } } }
    else if (!S.over) {
      S.t += dt; S.inv = Math.max(0, S.inv - dt);
      const ix = (keyOn.has("arrowright") || keyOn.has("d") ? 1 : 0) - (keyOn.has("arrowleft") || keyOn.has("a") ? 1 : 0) || hold;
      S.x += ix * 7.5 * dt; if (ix) S.face = ix * 0.9; if (S.x > HW) S.x -= HW * 2; if (S.x < -HW) S.x += HW * 2; // (the sides wrap round)
      for (const p of lands) if (p.k === "mplat") p.m.position.x = mx(p, t);
      const y0 = S.y; S.vy -= G * dt; S.y += S.vy * dt;
      if (S.vy < 0) { // landing: crossing a platform's top from above, close enough across
        if (y0 >= 0 && S.y <= 0 && Math.abs(S.x) < HW) { S.y = 0; S.vy = V0; S.last = null; }
        for (const p of lands) { if (p.gone || p.z + 0.16 > y0 || p.z + 0.16 < S.y || Math.abs(mx(p, t) - S.x) > 1.15) continue;
          S.y = p.z + 0.16; S.vy = p.k === "spring" ? V0 * 1.58 : V0; S.last = p.k === "break" ? null : p;
          if (p.k === "break") { p.gone = true; p.fall = 0; } if (p.k === "spring" && ctx.Snd && ctx.Snd.jump) try { ctx.Snd.jump(); } catch { /* no sound */ }
          if (p.k === "spring") fx.say(T("Boing!")); break; } }
      if (hero && !hero.busy()) { const want = S.vy > 0 ? "jump" : "fall"; if (S.clip !== want) play(want); }
      S.best = Math.max(S.best, S.y);
      for (const it of items) { if (it.gone || (it.k !== "coin" && it.k !== "heart" && it.k !== "spike")) continue; const dx = Math.abs(it.x - S.x), dy = S.y + 0.9 - it.z;
        if (it.k === "spike") { if (dx < 0.9 && dy > 0.2 && dy < 1.4) hurt(false); continue; }
        if (dx < 0.9 && Math.abs(dy) < 1) { it.gone = true; it.m.visible = false;
          if (it.k === "heart") { S.hearts = Math.min(3, S.hearts + 1); fx.say("❤️ +1"); paintHud(); continue; }
          S.coins++; S.combo = S.t - S.lastCoin < 2.5 ? S.combo + 1 : 1; S.lastCoin = S.t; fx.combo(S.combo); if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* no sound */ } } }
      for (const p of lands) if (p.gone && p.fall != null && p.fall < 2) { p.fall += dt; p.m.position.y -= dt * 6 * p.fall; p.m.rotation.z += dt * 2; if (p.fall >= 2) p.m.visible = false; }
      if (S.y < camY - halfH - 0.5) hurt(true); // (fell below the screen)
      if (S.y >= L.len) end(true);
      paintHud();
      while (S.tr.length * 0.2 <= S.t && S.tr.length < 900) S.tr.push([Math.round(S.x * 10), Math.round(S.y * 10), 0]);
    }
    for (const it of items) if (!it.gone && (it.k === "coin" || it.k === "heart")) it.m.rotation.y += dt * 3;
    if (gh) gh.at(Math.max(0, S.t), t);
    me.position.set(S.x, S.y, 0); me.rotation.y = S.face * (S.over ? 0 : 1); me.visible = !(S.inv > 0 && ((t * 12) | 0) % 2);
    if (hero) hero.update(dt, t);
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    const tn = Math.tan((cam.fov * Math.PI) / 360), dist = Math.max(15, (HW + 0.9) / (tn * cam.aspect)); halfH = dist * tn; // (far enough back that both sides of the tower show on a portrait phone)
    camY += (Math.max(camY, S.y + halfH * 0.25) - camY) * Math.min(1, dt * 4); // (the camera only goes up)
    cam.position.set(0, camY + 1.5, dist); cam.lookAt(0, camY, 0);
  }
  hud.querySelector(".wst-hx").addEventListener("click", () => leave());
  async function end(done) { if (S.over) return; S.over = true; play(done ? "emote-yes" : "die", true);
    await result(o, hud, { trace: S.tr, coins: S.coins, dist: done ? L.len : S.best, done, line: `🪙 ${S.coins} / ${L.coins} · ${Math.round(done ? L.len : S.best)} / ${L.len} m`, head: done ? "🏔️ " + T("You reached the top!") : "💥 " + T("Out of hearts"), confetti: done }, leave); }
  function leave(again) {
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); removeEventListener("pointerdown", pd); removeEventListener("pointermove", pm); removeEventListener("pointerup", pu); removeEventListener("pointercancel", pu);
    st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio");
    if (hero) me.remove(hero.obj);
    scene.userData.live = false; scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
    env.back(again, o);
  }
  st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud();
  return { S, L, leave, climb: true, clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []), steer: (d) => { keyOn.clear(); if (d > 0) keyOn.add("d"); if (d < 0) keyOn.add("a"); } };
}
