// world-jurassic.js — Jurassic World (P0, the GM preview): a separate prehistoric land behind the Jurassic Portal in
// town (world-play.js). Only GM wallets come in for now; everyone else sees "Coming soon" at the portal.
// The plan (ARCIRCLE WORLD JURASSIC design doc v1.0): six biomes, realistic dinosaurs, hunting, crafting, eggs, raids.
// This first step is the Primeval Plains on their own: rolling ground, a lake, forest and ferns, far ridges in the haze,
// the hero walking it, and the gate home. Dinosaurs arrive with their GLB files (models/world/jurassic, the doc's list).
// It draws its own scene through the stage's view() while the town waits behind it, like the ARCL Mine.
export const JURASSIC = { SIZE: 520, EDGE: 230, SPAWN: { x: 0, z: 40 }, GATE: { x: 0, z: 52 }, LAKE: { x: 55, z: -35, r: 34 } };

export function createJurassic(ctx) {
  const { THREE, st, T, esc, toast } = ctx;
  const low = !!ctx.low, reduce = !!ctx.reduce, coarse = !!ctx.coarse;
  const J = JURASSIC;
  let S = null, ui = null, hero = null, on = false, busy = false;
  let px = J.SPAWN.x, pz = J.SPAWN.z, face = Math.PI, camYaw = Math.PI, camPitch = 0.2, camDist = 9, speed = 0, nearGate = false, introT = 0;
  const keys = new Set(), stick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 }, look = { id: -1, x: 0, y: 0 };

  // ---------------- the ground: smooth value noise, a basin around the gate, the lake, ridges toward the edge ----------------
  const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, z) => { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; };
  function height(x, z) {
    let h = (fbm(x * 0.012, z * 0.012) - 0.5) * 14 + (fbm(x * 0.05 + 9, z * 0.05 - 3) - 0.5) * 2.2;
    const dg = Math.hypot(x - J.GATE.x, z - J.GATE.z); h *= Math.min(1, Math.max(0.15, (dg - 8) / 30)); // a gentle clearing around the gate
    const dl = Math.hypot(x - J.LAKE.x, z - J.LAKE.z); if (dl < J.LAKE.r + 14) h -= Math.max(0, 1 - dl / (J.LAKE.r + 14)) ** 1.6 * 9; // the lake's bowl
    const r = Math.hypot(x, z); if (r > 150) h += ((r - 150) / 80) ** 2 * 26 * (0.6 + fbm(x * 0.02, z * 0.02)); // the ridges that close the plain
    return h;
  }
  const WATER_Y = -2.4;

  function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

  function build() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(55, 1, 0.3, 900);
    const HAZE = 0xc9d6c4; scene.fog = new THREE.FogExp2(HAZE, low ? 0.0075 : 0.0055); scene.background = new THREE.Color(HAZE);
    // the sky: a warm horizon under a blue top, on a big sphere that ignores the fog
    const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false,
      map: canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#3f86d6"); gr.addColorStop(0.38, "#8fc0e8"); gr.addColorStop(0.5, "#e9e2c8"); gr.addColorStop(0.56, "#c9d6c4"); gr.addColorStop(1, "#9fb39a"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
    scene.add(sky);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a32, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.4); sun.position.set(-120, 160, 80); scene.add(sun, sun.target);

    // terrain, coloured by height and slope (grass, darker forest floor, dirt, sand at the water, rock on the ridges)
    const N = low ? 110 : 170, geo = new THREE.PlaneGeometry(J.SIZE, J.SIZE, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const G1 = new THREE.Color(0x6f9a3e), G2 = new THREE.Color(0x4f7a2c), DIRT = new THREE.Color(0x8a7650), SAND = new THREE.Color(0xc8b68a), ROCK = new THREE.Color(0x7d786e);
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = height(x, z); pos.setY(i, y); }
    geo.computeVertexNormals(); const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), slope = 1 - nrm.getY(i), n = fbm(x * 0.08, z * 0.08);
      c.copy(G1).lerp(G2, n); if (slope > 0.12) c.lerp(DIRT, Math.min(1, (slope - 0.12) * 4)); if (y > 14) c.lerp(ROCK, Math.min(1, (y - 14) / 10)); if (y < WATER_Y + 0.5) c.lerp(SAND, Math.min(1, (WATER_Y + 0.5 - y) / 0.5));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const detail = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, w, h); let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 2600; i++) { const v = 150 + Math.floor(r() * 105); g.fillStyle = `rgb(${v},${v},${v})`; const x = r() * w, y = r() * h; g.fillRect(x, y, 1 + r() * 2, 2 + r() * 5); }
      for (let i = 0; i < 40; i++) { const v = 120 + Math.floor(r() * 60); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.beginPath(); g.arc(r() * w, r() * h, 6 + r() * 18, 0, 6.283); g.fill(); } });
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.repeat.set(J.SIZE / 6, J.SIZE / 6); detail.anisotropy = 4;
    const uv = geo.attributes.uv; // (the plane's uv runs 0–1 across the land; the repeat tiles it every 6 m)
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 })); void uv; scene.add(ground);

    // the lake
    const water = new THREE.Mesh(new THREE.CircleGeometry(J.LAKE.r + 12, 64), new THREE.MeshStandardMaterial({ color: 0x2f6f78, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.86 }));
    water.rotation.x = -Math.PI / 2; water.position.set(J.LAKE.x, WATER_Y, J.LAKE.z); scene.add(water);

    // where things grow: on the plain, out of the water, off the gate's clearing and the steep ridges
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spotFor = (minGate, maxR) => { for (let k = 0; k < 30; k++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * maxR, x = Math.cos(a) * r, z = Math.sin(a) * r, y = height(x, z);
      if (y < WATER_Y + 0.6 || Math.hypot(x - J.GATE.x, z - J.GATE.z) < minGate) continue; return { x, y, z }; } return null; };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const scatter = (geom, mat, n, minGate, maxR, size, sink = 0) => { const im = new THREE.InstancedMesh(geom, mat, n); let k = 0;
      for (let i = 0; i < n; i++) { const s = spotFor(minGate, maxR); if (!s) continue; const z = size[0] + rnd() * (size[1] - size[0]); q.setFromAxisAngle(up, rnd() * 6.283); sc.set(z, z * (0.85 + rnd() * 0.3), z); p3.set(s.x, s.y - sink * z, s.z); m4.compose(p3, q, sc); im.setMatrixAt(k++, m4); }
      im.count = k; im.instanceMatrix.needsUpdate = true; scene.add(im); return im; };
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }), leafM = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.9, flatShading: true }), leaf2 = new THREE.MeshStandardMaterial({ color: 0x2f5a26, roughness: 0.9, flatShading: true });
    const TREES = low ? 140 : 260;
    // ancient giants: a tall trunk and a flat, wide crown
    const tg = new THREE.CylinderGeometry(0.35, 0.6, 9, 7); tg.translate(0, 4.5, 0);
    const cg = new THREE.IcosahedronGeometry(3.4, 1); cg.scale(1.3, 0.55, 1.3); cg.translate(0, 9.6, 0);
    seed = 11; scatter(tg, trunkM, TREES, 14, 170, [0.8, 1.6]); seed = 11; scatter(cg, leafM, TREES, 14, 170, [0.8, 1.6]);
    // conifers in the back, nearer the ridges
    const kg = new THREE.ConeGeometry(2.2, 8, 7); kg.translate(0, 5, 0);
    seed = 23; scatter(kg, leaf2, low ? 90 : 170, 30, 205, [0.9, 1.8]);
    // ferns: low clumps of three tilted leaves
    const fern = new THREE.ConeGeometry(0.5, 1.6, 4, 1, true); fern.translate(0, 0.6, 0);
    seed = 31; scatter(fern, new THREE.MeshStandardMaterial({ color: 0x5d8c33, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), low ? 500 : coarse ? 900 : 1600, 6, 160, [0.7, 1.5]);
    // grass tufts: thin blades in small clumps, thickest around the gate where the camera looks down
    const tuft = new THREE.ConeGeometry(0.035, 0.42, 3, 1, true); tuft.translate(0, 0.19, 0);
    seed = 37; scatter(tuft, new THREE.MeshStandardMaterial({ color: 0x5f8f35, roughness: 1, side: THREE.DoubleSide }), low ? 1500 : coarse ? 3000 : 5000, 2.5, 70, [0.8, 1.6]);
    // boulders
    const rg = new THREE.DodecahedronGeometry(1, 0); rg.scale(1.2, 0.8, 1);
    seed = 41; scatter(rg, new THREE.MeshStandardMaterial({ color: 0x86827a, roughness: 1, flatShading: true }), low ? 50 : 90, 10, 190, [0.6, 2.4], 0.25);

    // the gate home: the same stone gate as in town (world-jurgate.js)
    const gate = ctx.makeGate ? ctx.makeGate(T("Back to the village")) : ctx.K.makePortal(T("Back to the village")); gate.position.set(J.GATE.x, height(J.GATE.x, J.GATE.z), J.GATE.z); gate.rotation.y = 0; scene.add(gate);
    S = { scene, cam, gate, spin: gate.userData.spin || [] };
  }

  async function makeHero() {
    if (hero) { S.scene.add(hero.obj); return; }
    try { hero = await ctx.makeHero(); } catch { hero = null; }
    if (hero) S.scene.add(hero.obj);
  }

  // ---------------- the HUD: leave, the title, a stick and the way home ----------------
  function buildUi() {
    const root = document.createElement("div"); root.id = "wp-jur"; root.className = "wz"; root.hidden = true;
    root.innerHTML = `<div class="wz-top" data-game-hud><button type="button" class="wz-leave"><svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8"/></svg><span>${esc(T("Village"))}</span></button>
        <div class="wz-name"><b>${esc(T("Jurassic World"))}</b><small>${esc(T("Primeval Plains · GM preview"))}</small></div>
        <div class="wz-note">${esc(T("A first look at the land: the dinosaurs move in with their models."))}</div></div>
      <div class="wz-stick" aria-hidden="true"><i></i></div>
      <button type="button" class="wz-home" hidden>${esc(T("Back to the village"))}</button>
      <div class="wz-keys">${esc(T("WASD move · Shift run · drag to look · Esc leave"))}</div>
      <div class="wz-title" hidden><small>ARCIRCLE WORLD</small><b>JURASSIC WORLD</b><span>${esc(T("Primeval Plains"))}</span></div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    ui = { root, stick: q(".wz-stick"), knob: q(".wz-stick i"), home: q(".wz-home"), title: q(".wz-title") };
    q(".wz-leave").addEventListener("click", () => leave());
    ui.home.addEventListener("click", () => leave());
    // touch: the left half moves (a stick where the thumb lands), the rest of the screen looks around
    root.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      if (e.pointerType !== "mouse" && e.clientX < innerWidth * 0.45 && stick.id < 0) { stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; ui.stick.style.left = e.clientX + "px"; ui.stick.style.top = e.clientY + "px"; ui.stick.classList.add("on"); }
      else if (look.id < 0) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
      try { root.setPointerCapture(e.pointerId); } catch { /* fine */ }
    });
    root.addEventListener("pointermove", (e) => {
      if (e.pointerId === stick.id) { const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, l = Math.hypot(dx, dy), m = Math.min(1, l / 55); stick.x = l ? dx / l * m : 0; stick.y = l ? dy / l * m : 0; ui.knob.style.transform = `translate(${stick.x * 34}px,${stick.y * 34}px)`; }
      else if (e.pointerId === look.id) { camYaw -= (e.clientX - look.x) * 0.006; camPitch = Math.max(-0.05, Math.min(0.9, camPitch + (e.clientY - look.y) * 0.004)); look.x = e.clientX; look.y = e.clientY; }
    });
    const up = (e) => { if (e.pointerId === stick.id) { stick.id = -1; stick.x = stick.y = 0; ui.knob.style.transform = ""; ui.stick.classList.remove("on"); } if (e.pointerId === look.id) look.id = -1; };
    root.addEventListener("pointerup", up); root.addEventListener("pointercancel", up);
    root.addEventListener("wheel", (e) => { camDist = Math.max(5, Math.min(18, camDist + Math.sign(e.deltaY) * 0.8)); }, { passive: true });
  }
  const kd = (e) => { if (!on) return; if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); leave(); return; } const k = e.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", " "].includes(k)) { keys.add(k); e.preventDefault(); e.stopPropagation(); } else if (k === "e" && nearGate) { e.preventDefault(); e.stopPropagation(); leave(); } };
  const ku = (e) => { keys.delete(e.key.toLowerCase()); };

  // ---------------- a frame ----------------
  let animNow = "";
  const anim = (n, sp) => { if (!hero || !hero.play || n === animNow) return; animNow = n; hero.play(n, { speed: sp || 1, fade: 0.2 }); };
  let frames = 0;
  function tick(dt, t) {
    if (!S) return; dt = Math.min(dt, 0.05); frames++;
    let ix = stick.x, iz = stick.y;
    if (keys.has("a") || keys.has("arrowleft")) ix -= 1; if (keys.has("d") || keys.has("arrowright")) ix += 1;
    if (keys.has("w") || keys.has("arrowup")) iz -= 1; if (keys.has("s") || keys.has("arrowdown")) iz += 1;
    const il = Math.hypot(ix, iz), run = keys.has("shift") || il > 0.92 && stick.id >= 0;
    const target = il > 0.08 ? (run ? 9 : 4.6) * Math.min(1, il) : 0; speed += (target - speed) * Math.min(1, dt * 8);
    if (il > 0.08) {
      // the stick is read from the camera: up is away from it
      const fx = Math.sin(camYaw + Math.PI), fz = Math.cos(camYaw + Math.PI), rx = -fz, rz = fx;
      const mx = (fx * -iz + rx * ix) / il, mz = (fz * -iz + rz * ix) / il;
      const want = Math.atan2(mx, mz); let d = want - face; d = Math.atan2(Math.sin(d), Math.cos(d)); face += d * Math.min(1, dt * 10);
      const nx = px + mx * speed * dt, nz = pz + mz * speed * dt;
      if (Math.hypot(nx, nz) < J.EDGE && height(nx, nz) > WATER_Y - 0.6) { px = nx; pz = nz; }
    }
    const py = height(px, pz);
    if (hero) { hero.obj.position.set(px, py, pz); hero.obj.rotation.y = face; anim(speed > 6 ? "run" : speed > 0.6 ? "walk" : "idle", speed > 6 ? 1.1 : 1); if (hero.update) hero.update(dt, t, Math.min(1, speed / 8), 0); }
    // the camera: low behind the hero, so the trees (and later the dinosaurs) stand tall
    const cy = py + 1.6 + Math.sin(camPitch) * camDist, ch = Math.cos(camPitch) * camDist;
    let cx = px + Math.sin(camYaw) * ch, cz = pz + Math.cos(camYaw) * ch; const gy = Math.max(height(cx, cz), WATER_Y) + 0.8;
    S.cam.position.set(cx, Math.max(cy, gy), cz); S.cam.lookAt(px, py + 1.7, pz);
    for (const f of S.spin) f(dt, t);
    const g = Math.hypot(px - J.GATE.x, pz - J.GATE.z) < 4.2; if (g !== nearGate) { nearGate = g; ui.home.hidden = !g; }
  }

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; busy = true;
    try {
      if (!S) build(); if (!ui) buildUi();
      await makeHero(); animNow = "";
      px = J.SPAWN.x; pz = J.SPAWN.z; face = Math.PI; camYaw = 0; camPitch = 0.3; camDist = coarse ? 10 : 9; speed = 0; nearGate = false; ui.home.hidden = true; keys.clear();
      try { if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), new Promise((ok) => setTimeout(ok, 2500))]); } catch { /* compiled on the first frame */ }
      st.view(S.scene, S.cam, null); st.solo(tick); on = true;
      document.body.classList.add("wp-jurassic"); ui.root.hidden = false;
      addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
      ui.title.hidden = false; ui.title.classList.remove("go"); void ui.title.offsetWidth; ui.title.classList.add("go"); setTimeout(() => { if (ui) ui.title.hidden = true; }, 3000);
      return true;
    } catch (e) {
      console.warn("jurassic", e); reset(); throw e;
    } finally { busy = false; }
  }
  function reset() {
    on = false; document.body.classList.remove("wp-jurassic"); if (ui) ui.root.hidden = true;
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); keys.clear(); stick.id = look.id = -1; stick.x = stick.y = 0;
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
  }
  function leave() { if (!on) return; reset(); if (ctx.onLeave) ctx.onLeave(); }
  return { enter, leave, active: () => on, debug: () => ({ px, pz, speed, nearGate, h: height(px, pz), frames, keys: [...keys] }), walk: (x, z) => { px = x; pz = z; } };
}
