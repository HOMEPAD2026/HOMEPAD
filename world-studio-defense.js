// world-studio-defense.js — Studio 4d: TOWER DEFENSE, a player-made path across a grid (world-studio-gen.js genDefense: the
// same level for everyone). Foes come out of the portal at the top and walk the path to your crystal at the bottom; tap a
// pad to build a Bolt (fast, one target), Frost (slows everything near it) or Cannon (slow, hits a crowd) with your gold,
// tap a tower to upgrade or sell it; every foe stopped pays gold; ten lives. Hold all the waves to win.
// env: { ctx, THREE, T, esc, makeFx, result, back(again) }
import { THEMES, DEF, genLevel } from "./world-studio-gen.js";

const TW = [["bolt", "⚡", "Bolt"], ["frost", "❄️", "Frost"], ["cannon", "💣", "Cannon"]];

export async function makeDefense(o, env) {
  const { ctx, THREE, T, esc, makeFx, result } = env, { st } = ctx, th = THEMES[o.spec.theme], L = genLevel(o.spec), CS = 2;
  if (!L.path.length) throw new Error(T("This map has no path yet"));
  const P = (c, r) => [(c - (DEF.C - 1) / 2) * CS, (r - (DEF.R - 1) / 2) * CS];
  const scene = new THREE.Scene(); scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.fog, 50, 110);
  const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, th.track, 1.15)); const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(6, 18, 8); scene.add(sun);
  const std = (c, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, ...x }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
  // the board: grass-ish tiles, the path a shade of the theme's track, the portal, the crystal
  const tileG = new THREE.BoxGeometry(CS * 0.96, 0.3, CS * 0.96), offM = std(th.prop, { roughness: 0.9 }), pathM = std(th.track, { roughness: 0.7 }), onPath = new Set(L.path.map(String));
  for (let c = 0; c < DEF.C; c++) for (let r = 0; r < DEF.R; r++) { const m = new THREE.Mesh(tileG, onPath.has(String([c, r])) ? pathM : offM); const [x, z] = P(c, r); m.position.set(x, onPath.has(String([c, r])) ? -0.2 : -0.1, z); scene.add(m); }
  const pts = L.path.map(([c, r]) => P(c, r)), [sx, sz] = pts[0], [ex, ez] = pts[pts.length - 1];
  const portal = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.16, 8, 32), glow(0xb48cff)); portal.position.set(sx, 1, sz - CS * 0.6); scene.add(portal);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), std(0x5fd3ff, { emissive: 0x2fa8ff, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.2 })); crystal.position.set(ex, 1.3, ez + CS * 0.6); scene.add(crystal);
  // pads (where towers go)
  const padG = new THREE.CylinderGeometry(0.8, 0.85, 0.22, 24), padM = std(0x3a4a66, { emissive: th.edge, emissiveIntensity: 0.12 }), pads = L.pads.map(([c, r]) => { const m = new THREE.Mesh(padG, padM); const [x, z] = P(c, r); m.position.set(x, 0.12, z); scene.add(m); return { m, x, z, t: null }; });
  // the hero by the crystal
  let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("studio hero", e); }
  const me = new THREE.Group(); scene.add(me); me.position.set(ex + (ex > 0 ? -1.6 : 1.6), 0, ez + CS * 0.7); me.rotation.y = Math.PI; if (hero) { me.add(hero.obj); try { hero.play("idle"); } catch { /* no clip */ } }
  // path length (cells → metres along the polyline)
  const segL = []; let total = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segL.push(d); total += d; }
  const at = (s) => { s = Math.max(0, Math.min(total, s)); let i = 0; while (i < segL.length - 1 && s > segL[i]) { s -= segL[i]; i++; } const f = segL[i] ? s / segL[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; };
  document.body.classList.add("wp-studio");
  const hud = document.createElement("div"); hud.className = "wst-hud wtd"; hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || o.spec.title)}</b><span class="wst-hp"></span><span class="wst-hc"></span><span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div><div class="wst-cd">3</div><p class="wst-help">${esc(T("Tap a pad to build a tower · tap a tower to upgrade it"))}</p><button type="button" class="wtd-next" hidden>▶ ${esc(T("Next wave"))}</button><div class="wtd-menu" hidden></div><div class="wst-speed" aria-hidden="true"></div>`;
  document.body.appendChild(hud);
  const S = { t: -3, lives: DEF.LIVES, gold: L.gold, wave: 0, kills: 0, held: 0, over: false, spawnQ: [], nextAt: 0, pause: 3, clip: "" }, fx = makeFx(hud), foes = [], shots = [];
  const paintHud = () => { hud.querySelector(".wst-hp").textContent = `❤️ ${Math.max(0, S.lives)}`; hud.querySelector(".wst-hc").textContent = `🪙 ${S.gold} · ${T("Wave {i}/{n}", { i: Math.min(S.wave, L.waves.length), n: L.waves.length })}`; hud.querySelector(".wst-bar em").style.width = Math.min(100, (S.held / L.waves.length) * 100).toFixed(1) + "%"; const nb = hud.querySelector(".wtd-next"); nb.hidden = S.t < 0 || S.over || S.wave >= L.waves.length || S.spawnQ.length > 0; };
  const play = (c, once) => { if (!hero) return; try { hero.play(c, once ? { once: true } : {}); } catch { /* no clip */ } S.clip = once ? "" : c; };
  // foes
  const FG = { g: new THREE.SphereGeometry(0.42, 14, 10), r: new THREE.ConeGeometry(0.32, 0.8, 10), t: new THREE.BoxGeometry(0.95, 0.95, 0.95) }, FM = { g: std(th.wall, { emissive: th.wall, emissiveIntensity: 0.4 }), r: std(0xff9a3d, { emissive: 0xff7a1a, emissiveIntensity: 0.4 }), t: std(0x8a2a3a, { metalness: 0.5 }) };
  const barG = new THREE.PlaneGeometry(1, 0.12), barM = glow(0x7cf5c8), barBg = glow(0x000000, 0.5);
  function spawn(k, hpx) { const m = new THREE.Mesh(FG[k], FM[k]), hb = new THREE.Group(), bg = new THREE.Mesh(barG, barBg), fg = new THREE.Mesh(barG, barM); hb.add(bg, fg); fg.position.z = 0.001; hb.position.y = 1.1; hb.quaternion.copy(cam.quaternion); m.add(hb); m.position.y = 0.6; scene.add(m);
    const F = DEF.FOES[k]; foes.push({ m, fg, hb, k, s: 0, hp: F.hp * hpx, max: F.hp * hpx, v: F.v * L.v * CS, slow: 0 }); }
  function startWave() { if (S.wave >= L.waves.length || S.spawnQ.length) return; const w = L.waves[S.wave++], q = []; const n = Math.max(w.g, w.r, w.t);
    for (let i = 0; i < n; i++) { if (i < w.g) q.push("g"); if (i < w.r) q.push("r"); if (i < w.t) q.push("t"); } S.spawnQ = q.map((k) => ({ k, hp: w.hp })); S.nextAt = S.t; play("cast", true); fx.say(T("Wave {i}", { i: S.wave })); paintHud(); }
  hud.querySelector(".wtd-next").addEventListener("click", () => { if (!S.spawnQ.length && foes.length === 0) S.gold += 5; startWave(); });
  // towers: build / upgrade / sell from a little menu
  const menu = hud.querySelector(".wtd-menu"); let menuPad = null;
  function openMenu(pad) { menuPad = pad; const t = pad.t;
    menu.innerHTML = t ? `<b>${TW.find((x) => x[0] === t.k)[1]} ${esc(T(TW.find((x) => x[0] === t.k)[2]))} · ${esc(T("Lv {n}", { n: t.lv }))}</b>${t.lv < 3 ? `<button type="button" data-up ${S.gold < upCost(t) ? "disabled" : ""}>⬆️ ${esc(T("Upgrade"))} · 🪙 ${upCost(t)}</button>` : ""}<button type="button" data-sell>💰 ${esc(T("Sell"))} · +${Math.floor(t.spent / 2)}</button><button type="button" data-cancel>${esc(T("Cancel"))}</button>`
      : TW.map(([k, ic, n]) => `<button type="button" data-tw="${k}" ${S.gold < DEF.TOWERS[k].cost ? "disabled" : ""}><i>${ic}</i>${esc(T(n))}<small>🪙 ${DEF.TOWERS[k].cost}</small></button>`).join("") + `<button type="button" data-cancel>${esc(T("Cancel"))}</button>`;
    menu.hidden = false; pad.m.material = selM; }
  const selM = std(0x5a7aa6, { emissive: 0x7cf5c8, emissiveIntensity: 0.5 });
  function closeMenu() { if (menuPad) menuPad.m.material = padM; menuPad = null; menu.hidden = true; }
  const upCost = (t) => Math.round(DEF.TOWERS[t.k].cost * 0.8 * t.lv);
  const TG = { bolt: new THREE.CylinderGeometry(0.18, 0.42, 1.6, 8), frost: new THREE.SphereGeometry(0.5, 16, 12), cannon: new THREE.CylinderGeometry(0.45, 0.55, 0.9, 12) }, TM = { bolt: std(0xffd23a, { emissive: 0xffb02e, emissiveIntensity: 0.5 }), frost: std(0x9fe8ff, { emissive: 0x5fd3ff, emissiveIntensity: 0.6, metalness: 0.4 }), cannon: std(0x5a5f6e, { metalness: 0.7, roughness: 0.3 }) };
  function build(pad, k) { const C = DEF.TOWERS[k]; if (S.gold < C.cost) return; S.gold -= C.cost; const m = new THREE.Mesh(TG[k], TM[k]); m.position.set(pad.x, k === "bolt" ? 1.0 : 0.7, pad.z); scene.add(m); pad.t = { k, m, lv: 1, cd: 0, spent: C.cost }; if (ctx.Snd && ctx.Snd.click) try { ctx.Snd.click(); } catch { /* no sound */ } paintHud(); }
  menu.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.disabled || !menuPad) return; const pad = menuPad;
    if (b.dataset.tw) build(pad, b.dataset.tw);
    else if (b.hasAttribute("data-up")) { const c = upCost(pad.t); if (S.gold >= c) { S.gold -= c; pad.t.spent += c; pad.t.lv++; pad.t.m.scale.setScalar(1 + (pad.t.lv - 1) * 0.18); fx.say("⬆️"); } }
    else if (b.hasAttribute("data-sell")) { S.gold += Math.floor(pad.t.spent / 2); scene.remove(pad.t.m); pad.t = null; }
    closeMenu(); paintHud(); });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pd = (e) => { if (S.over || (e.target.closest && e.target.closest("button, .wtd-menu"))) return; ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam); const hit = ray.intersectObjects(pads.map((p) => p.m).concat(pads.filter((p) => p.t).map((p) => p.t.m)))[0];
    if (!hit) { closeMenu(); return; } const pad = pads.find((p) => p.m === hit.object || (p.t && p.t.m === hit.object)); closeMenu(); if (pad) openMenu(pad); };
  addEventListener("pointerdown", pd);
  function shoot(pad, f, dmg, splash) { const t = pad.t, a = new THREE.Vector3(pad.x, 1.4, pad.z), b = f.m.position.clone();
    if (t.k === "cannon") { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow(0x2a2a2a)); ball.position.copy(a); scene.add(ball); shots.push({ m: ball, a, b, t: 0, life: 0.4, hit: () => { for (const g of foes) if (g.m.position.distanceTo(b) < splash * CS) hurt(g, dmg); ring(b, 0xffb02e); } }); return; }
    const len = a.distanceTo(b), beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 6), glow(t.k === "frost" ? 0x9fe8ff : 0xffe066)); beam.position.copy(a).add(b).multiplyScalar(0.5); beam.lookAt(b); beam.rotateX(Math.PI / 2); scene.add(beam); shots.push({ m: beam, t: 0, life: 0.09 }); hurt(f, dmg); }
  function ring(p, c) { const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 24), glow(c, 0.9)); m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.1, p.z); scene.add(m); shots.push({ m, t: 0, life: 0.35, grow: true }); }
  function hurt(f, d) { if (f.dead) return; f.hp -= d; if (f.hp <= 0) { f.dead = true; S.kills++; S.gold += DEF.FOES[f.k].gold; ring(f.m.position, 0x7cf5c8); if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* no sound */ } } }
  let camK = 0;
  function frame() { const asp = innerWidth / innerHeight, half = Math.tan((25 * Math.PI) / 180), h = Math.max((DEF.R * CS) / (2 * half) * 0.86, (DEF.C * CS) / (2 * half * asp)) * 1.08; if (camK !== h) { camK = h; cam.position.set(0, h, h * 0.32); cam.lookAt(0, 0, 0.6); for (const f of foes) f.hb.quaternion.copy(cam.quaternion); } if (cam.aspect !== asp) { cam.aspect = asp; cam.updateProjectionMatrix(); } }
  function tick(dt, t) {
    dt = Math.min(dt, 0.05); frame();
    if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-Math.min(0, S.t)); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) { setTimeout(() => cd.remove(), 700); S.pause = 4; paintHud(); } } }
    else if (!S.over) {
      S.t += dt;
      if (S.spawnQ.length && S.t >= S.nextAt) { const q = S.spawnQ.shift(); spawn(q.k, q.hp); S.nextAt = S.t + 0.9 / Math.max(0.6, L.v / 1.2); if (!S.spawnQ.length) paintHud(); }
      if (!S.spawnQ.length && !foes.length && S.wave < L.waves.length) { S.pause -= dt; if (S.pause <= 0) { S.pause = 6; startWave(); } }
      for (const pad of pads) { const tw = pad.t; if (!tw) continue; const C = DEF.TOWERS[tw.k]; tw.cd -= dt; if (tw.k === "frost") tw.m.rotation.y += dt * 1.5;
        const inR = foes.filter((f) => !f.dead && Math.hypot(f.m.position.x - pad.x, f.m.position.z - pad.z) <= C.range * CS);
        if (tw.k === "frost") for (const f of inR) f.slow = 0.3;
        if (tw.cd > 0 || !inR.length) continue; tw.cd = C.rate; const dmg = C.dmg * (1 + (tw.lv - 1) * 0.6), tgt = inR.reduce((a, b) => (b.s > a.s ? b : a));
        if (tw.k === "frost") { ring(pad.m.position, 0x9fe8ff); for (const f of inR) hurt(f, dmg); } else shoot(pad, tgt, dmg, C.splash || 0); }
      for (let i = foes.length - 1; i >= 0; i--) { const f = foes[i];
        if (f.dead) { scene.remove(f.m); foes.splice(i, 1); continue; }
        f.s += f.v * (f.slow > 0 ? 1 - DEF.TOWERS.frost.slow : 1) * dt; f.slow = Math.max(0, f.slow - dt); const [x, z] = at(f.s); f.m.position.x = x; f.m.position.z = z; f.m.rotation.y += dt * 2; f.fg.scale.x = Math.max(0.01, f.hp / f.max); f.fg.position.x = -(1 - f.fg.scale.x) / 2;
        if (f.s >= total) { S.lives -= DEF.FOES[f.k].hurt; scene.remove(f.m); foes.splice(i, 1); play("hit", true); if (ctx.Snd && ctx.Snd.hurt) try { ctx.Snd.hurt(); } catch { /* no sound */ } crystal.scale.setScalar(0.8); paintHud(); if (S.lives <= 0) { end(false); return; } } }
      if (!S.spawnQ.length && !foes.length && S.held < S.wave) { S.held = S.wave; paintHud(); if (S.held >= L.waves.length) end(true); }
      if (hero && !hero.busy() && S.clip !== "idle") play("idle");
    }
    for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.t += dt; if (s.a) s.m.position.lerpVectors(s.a, s.b, Math.min(1, s.t / s.life)).setY(1.4 - Math.sin(Math.min(1, s.t / s.life) * Math.PI) * -1.2); if (s.grow) { s.m.scale.setScalar(1 + s.t * 8); s.m.material.opacity = 0.9 * (1 - s.t / s.life); } if (s.t >= s.life) { if (s.hit) s.hit(); scene.remove(s.m); if (s.m.geometry) s.m.geometry.dispose(); shots.splice(i, 1); } }
    portal.rotation.z += dt * 2; crystal.rotation.y += dt; crystal.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 4));
    if (hero) hero.update(dt, t);
  }
  hud.querySelector(".wst-hx").addEventListener("click", () => leave());
  async function end(done) { if (S.over) return; S.over = true; closeMenu(); play(done ? "emote-yes" : "die", true); paintHud();
    await result(o, hud, { trace: [], coins: S.kills, dist: S.held * 100, done, line: `🛡️ ${T("Waves held {i}/{n}", { i: S.held, n: L.waves.length })} · 💥 ${S.kills} / ${L.coins}`, head: done ? "🏰 " + T("The crystal is safe!") : "💥 " + T("The crystal fell"), confetti: done }, leave); }
  function leave(again) {
    removeEventListener("pointerdown", pd); st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio");
    if (hero) me.remove(hero.obj);
    scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); });
    env.back(again, o);
  }
  st.view(scene, cam); st.solo(tick); frame(); tick(0.016, 0); paintHud();
  return { S, L, leave, defense: true, pads, foes: () => foes.length, build: (i, k) => { const p = pads[i]; if (p && !p.t) build(p, k); }, next: () => startWave(), clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []) };
}
