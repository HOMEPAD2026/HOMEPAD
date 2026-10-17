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

  // ---------------- the models (Meshy, packed by tools/pack-prop.mjs; models/world/jurassic): a mossy boulder and the
  // ruins gate. Loaded before the first visit; when they fail or are slow, the drawn stand-ins are used.
  let MODELS = null;
  async function loadModels() {
    if (MODELS) return;
    const L = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null, ver = ctx.ver || "";
    const one = (f) => (L ? L.loadAsync("models/world/jurassic/" + f + ".glb" + ver).then((g) => g.scene) : Promise.reject(new Error("no loader")));
    const res = await Promise.race([Promise.allSettled([one("rock-boulder"), one("ruins-gate"), one("tree-palm"), one("tree-ancient"), one("dino-raptor"), L ? L.loadAsync("models/world/jurassic/dino-brachio.glb" + ver) : Promise.reject(new Error("no loader")), L ? L.loadAsync("models/world/jurassic/boss-alpha-raptor.glb" + ver) : Promise.reject(new Error("no loader")), L ? L.loadAsync("models/world/jurassic/dino-triceratops.glb" + ver) : Promise.reject(new Error("no loader"))]), new Promise((ok) => setTimeout(() => ok(null), 15000))]);
    MODELS = {};
    if (!res) { console.warn("jurassic: models slow, drawn stand-ins this time"); return; }
    ["rock", "ruins", "palm", "ancient", "raptor", "brachio", "alpha", "trike"].forEach((k, i) => { if (res[i].status === "fulfilled") MODELS[k] = res[i].value; else console.warn("jurassic model", k, res[i].reason); });
  }
  // one mesh of a model, ready to instance: its geometry and material, and the matrix that stands it on the ground with
  // its widest side 1 m (the instances then scale it in metres)
  function unit(o) {
    if (!o) return null; let mesh = null; o.updateMatrixWorld(true); o.traverse((m) => { if (!mesh && m.isMesh) mesh = m; }); if (!mesh) return null;
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = 1 / Math.max(sz.x, sz.z, 1e-6);
    const base = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + sz.x / 2), -b.min.y, -(b.min.z + sz.z / 2))).multiply(mesh.matrixWorld);
    return { geo: mesh.geometry, mat: mesh.material, base, h: sz.y * k };
  }
  function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

  // ---------------- the raptors (the owner's Meshy Jungle Velociraptor: a still model, no skeleton yet) ----------------
  // Until a rigged one arrives they move by the vertex shader: the tail sways, the head looks round, the chest breathes and
  // the legs step in turn while walking. What they do: wander their part of the plain, stop and stare at you inside
  // 14 m, and run off when you come within 7 m. (No fighting yet: that comes with the rigged model and the server.)
  const raptors = [];
  function raptorMat(src, bb) {
    const m = src.clone(), U = { uT: { value: 0 }, uPh: { value: 0 }, uStride: { value: 0 }, uLook: { value: 0 } };
    const L = bb.max.z - bb.min.z;
    m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
      sh.vertexShader = "uniform float uT, uPh, uStride, uLook;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        float ru = (transformed.z - (${bb.min.z.toFixed(4)})) / ${L.toFixed(4)}, rv = (transformed.y - (${bb.min.y.toFixed(4)})) / ${(bb.max.y - bb.min.y).toFixed(4)}, rl = ${L.toFixed(4)};
        float tw = smoothstep(0.45, 0.0, ru); transformed.x += sin(uT * 2.4 - ru * 7.0) * tw * tw * (0.07 + uStride * 0.05) * rl;
        float hw = smoothstep(0.7, 1.0, ru); transformed.x += (uLook + sin(uT * 0.7) * 0.25) * hw * 0.07 * rl; transformed.y += sin(uT * 1.4) * hw * 0.012 * rl;
        float bw = smoothstep(0.3, 0.5, ru) * smoothstep(0.78, 0.58, ru) * smoothstep(0.3, 0.7, rv); transformed.y += sin(uT * 2.0) * bw * 0.006 * rl;
        float lw = smoothstep(0.42, 0.04, rv) * smoothstep(0.32, 0.44, ru) * smoothstep(0.74, 0.62, ru);
        float ph = uPh + (transformed.x > ${((bb.min.x + bb.max.x) / 2).toFixed(4)} ? 0.0 : 3.14159);
        transformed.z += sin(ph) * lw * uStride * 0.1 * rl; transformed.y += max(0.0, cos(ph)) * lw * uStride * 0.035 * rl;`); };
    m.customProgramCacheKey = () => "raptor"; m.userData.U = U; return m;
  }
  function makeRaptors(scene, rnd) {
    const o = MODELS && MODELS.raptor; if (!o) return; let mesh = null; o.updateMatrixWorld(true); o.traverse((x) => { if (!mesh && x.isMesh) mesh = x; }); if (!mesh) return;
    mesh.geometry.computeBoundingBox(); const bb = mesh.geometry.boundingBox;
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3());
    const homes = [[-40, -10], [-55, -70], [20, -95], [95, -10], [-95, -40], [60, 40]].slice(0, low || coarse ? 4 : 6);
    homes.forEach(([hx, hz], i) => {
      const LEN = 3.6 + rnd() * 0.8, k = LEN / sz.z, g = new THREE.Group(), inner = mesh.clone(); inner.material = raptorMat(mesh.material, bb);
      inner.matrixAutoUpdate = false; inner.matrix.copy(new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + sz.x / 2), -b.min.y, -(b.min.z + sz.z / 2))).multiply(mesh.matrixWorld));
      g.add(inner); scene.add(g);
      const r = { g, U: inner.material.userData.U, hx, hz, x: hx + (rnd() - 0.5) * 10, z: hz + (rnd() - 0.5) * 10, face: rnd() * 6.28, tx: hx, tz: hz, sp: 0, wait: rnd() * 3, ph: rnd() * 6, t0: rnd() * 10, state: "idle" };
      raptors.push(r);
    });
  }
  function tickRaptors(dt, t) {
    for (const r of raptors) {
      const dx = px - r.x, dz = pz - r.z, d = Math.hypot(dx, dz);
      let want = 0, look = 0;
      if (d < 7) { r.state = "flee"; r.tx = r.x - dx / d * 18; r.tz = r.z - dz / d * 18; }
      else if (d < 14 && r.state !== "flee") { r.state = "stare"; }
      else if (r.state === "stare" || (r.state === "flee" && d > 22)) { r.state = "idle"; r.wait = 1 + Math.random() * 2; }
      if (r.state === "stare") { const a = Math.atan2(dx, dz); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.face += da * Math.min(1, dt * 3); look = Math.max(-1, Math.min(1, da * 2)); }
      else if (r.state === "idle") { r.wait -= dt; if (r.wait <= 0) { const a = Math.random() * 6.283, rr = 6 + Math.random() * 18; r.tx = r.hx + Math.cos(a) * rr; r.tz = r.hz + Math.sin(a) * rr; r.state = "walk"; } }
      if (r.state === "walk" || r.state === "flee") {
        const ex = r.tx - r.x, ez = r.tz - r.z, ed = Math.hypot(ex, ez);
        if (ed < 1.2) { r.state = "idle"; r.wait = 2 + Math.random() * 4; }
        else { want = r.state === "flee" ? 9 : 2.6; const a = Math.atan2(ex, ez); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.face += da * Math.min(1, dt * 4); }
      }
      r.sp += (want - r.sp) * Math.min(1, dt * 4);
      if (r.sp > 0.05) { const nx = r.x + Math.sin(r.face) * r.sp * dt, nz = r.z + Math.cos(r.face) * r.sp * dt;
        if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 5) { r.x = nx; r.z = nz; } else { r.state = "idle"; r.wait = 1; r.sp = 0; } }
      r.ph += dt * r.sp * 2.6; const stride = Math.min(1, r.sp / 3);
      const y = height(r.x, r.z); r.g.position.set(r.x, y + Math.abs(Math.sin(r.ph)) * 0.06 * stride, r.z); r.g.rotation.y = r.face;
      r.g.rotation.x = -Math.sin(r.ph * 2) * 0.015 * stride; // a little pitch with each step
      r.U.uT.value = t + r.t0; r.U.uPh.value = r.ph; r.U.uStride.value = stride; r.U.uLook.value += (look - r.U.uLook.value) * Math.min(1, dt * 3);
    }
  }
  // a rigged copy turned so its head looks down +z (Meshy's rigs face their own way): the hips-to-head line in the bind pose
  function faceZ(o) {
    o.updateMatrixWorld(true); let hip = null, head = null; o.traverse((b) => { if (!b.isBone) return; const n = b.name.toLowerCase(); if (!hip && /hips|pelvis|root/.test(n)) hip = b; if (/^head$|head(?!end)/.test(n) && !head) head = b; });
    if (!hip || !head) return o;
    const a = new THREE.Vector3(), c = new THREE.Vector3(); hip.getWorldPosition(a); head.getWorldPosition(c);
    const yaw = Math.atan2(c.x - a.x, c.z - a.z), w = new THREE.Group(); w.add(o); w.rotation.y = -yaw; w.updateMatrixWorld(true); return w;
  }
  // ---------------- the brachiosaurs (the owner's Meshy Brachiosaurus, rigged, with its walk): a small herd walking a
  // slow loop beyond the lake, 13 m tall, so the plain feels as big as it is. Not for fighting: they're the view.
  const herd = [];
  function makeHerd(scene) {
    const gl = MODELS && MODELS.brachio; if (!gl || !ctx.K.skelClone || !gl.animations || !gl.animations.length) return;
    const n = low || coarse ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const o0 = ctx.K.skelClone(gl.scene), o = faceZ(o0); o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = (13 + i * 1.2) / (sz.y || 1);
      const inner = new THREE.Group(); o.scale.multiplyScalar(k); o.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k); inner.add(o);
      o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; }); // (a skinned mesh's bounds are its bind pose)
      const g = new THREE.Group(); g.add(inner); scene.add(g);
      const mixer = new THREE.AnimationMixer(o), act = mixer.clipAction(gl.animations[0]); act.play(); act.time = i * 0.37;
      herd.push({ g, mixer, a: i * 0.5, r: 58 + i * 7, sp: 1.5 });
    }
  }
  const HERD = { x: 40, z: -120 };
  function tickHerd(dt) {
    for (const h of herd) {
      h.a += (h.sp / h.r) * dt; const x = HERD.x + Math.cos(h.a) * h.r, z = HERD.z + Math.sin(h.a) * h.r * 0.6;
      const tx = -Math.sin(h.a) * h.r, tz = Math.cos(h.a) * h.r * 0.6; // the way it walks (the loop's tangent)
      h.g.position.set(x, height(x, z) - 0.2, z); h.g.rotation.y = Math.atan2(tx, tz); h.mixer.update(dt);
    }
  }
  // ---------------- the Alpha Raptor (the owner's Meshy boss, rigged, with its walk): the plain's first boss, keeping the
  // ruins in the south as its ground. It walks its round; come within 18 m and it stalks you, circling at 9 m; go 30 m
  // away and it goes back. (Its fight, three phases and drops, comes with its attack clips and the server's say on damage.)
  let alpha = null; const ALPHA_HOME = { x: -20, z: -100 };
  function makeAlpha(scene) {
    const gl = MODELS && MODELS.alpha; if (!gl || !ctx.K.skelClone || !gl.animations || !gl.animations.length) return;
    const o0 = ctx.K.skelClone(gl.scene), o = faceZ(o0); o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = 6.5 / (Math.max(sz.x, sz.z) || 1);
    o.scale.multiplyScalar(k); o.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k);
    o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    const g = new THREE.Group(); g.add(o); scene.add(g);
    const tag = ctx.K.label(T("Alpha Raptor"), { accent: "#ff4d6d", color: "#ffd2d9", size: 0.9, sub: T("Boss · Lv 10") }); tag.position.y = sz.y * k + 1.4; g.add(tag);
    const mixer = new THREE.AnimationMixer(o), act = mixer.clipAction(gl.animations[0]); act.play();
    alpha = { g, mixer, act, x: ALPHA_HOME.x, z: ALPHA_HOME.z, face: 0, a: 0, state: "patrol", sp: 2.2, orbit: 1 };
  }
  function tickAlpha(dt) {
    const A = alpha; if (!A) return;
    const dx = px - A.x, dz = pz - A.z, d = Math.hypot(dx, dz), home = Math.hypot(A.x - ALPHA_HOME.x, A.z - ALPHA_HOME.z);
    if (A.state === "patrol" && d < 18) A.state = "stalk"; else if (A.state === "stalk" && (d > 30 || home > 45)) A.state = "patrol";
    let tx, tz, want;
    if (A.state === "stalk") {
      // toward you until 9 m, then round you, always facing a little in
      const ang = Math.atan2(A.x - px, A.z - pz) + A.orbit * 0.5;
      tx = px + Math.sin(ang) * 9; tz = pz + Math.cos(ang) * 9; want = d > 12 ? 5.5 : 3;
    } else { A.a += dt * 0.07; tx = ALPHA_HOME.x + Math.cos(A.a) * 22; tz = ALPHA_HOME.z + Math.sin(A.a) * 14; want = 2.2; }
    const ex = tx - A.x, ez = tz - A.z, ed = Math.hypot(ex, ez) || 1, a = Math.atan2(ex, ez); let da = a - A.face; da = Math.atan2(Math.sin(da), Math.cos(da)); A.face += da * Math.min(1, dt * 3);
    A.sp += (want - A.sp) * Math.min(1, dt * 2);
    const nx = A.x + Math.sin(A.face) * A.sp * dt, nz = A.z + Math.cos(A.face) * A.sp * dt;
    if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 8) { A.x = nx; A.z = nz; } else A.orbit = -A.orbit;
    A.g.position.set(A.x, height(A.x, A.z), A.z); A.g.rotation.y = A.face;
    A.act.timeScale = 0.6 + A.sp / 4; A.mixer.update(dt);
  }
  // ---------------- the triceratops (the owner's Meshy Blazing Triceratops, rigged, with its walk): a small herd grazing
  // east of the lake. They amble from patch to patch; come within 9 m and the nearest turns its horns to you and stands.
  const trikes = []; const TRIKE_HOME = { x: 105, z: 5 };
  function makeTrikes(scene) {
    const gl = MODELS && MODELS.trike; if (!gl || !ctx.K.skelClone || !gl.animations || !gl.animations.length) return;
    const n = low || coarse ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const o0 = ctx.K.skelClone(gl.scene), o = faceZ(o0); o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = (6.4 + i * 0.6) / (Math.max(sz.x, sz.z) || 1);
      o.scale.multiplyScalar(k); o.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k); o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
      const g = new THREE.Group(); g.add(o); scene.add(g);
      const mixer = new THREE.AnimationMixer(o), act = mixer.clipAction(gl.animations[0]); act.play(); act.time = i * 0.3;
      trikes.push({ g, mixer, act, x: TRIKE_HOME.x + i * 7 - 7, z: TRIKE_HOME.z + (i % 2) * 6, face: Math.PI * 0.6, tx: 0, tz: 0, sp: 0, wait: 2 + i * 2, state: "graze" });
    }
  }
  function tickTrikes(dt) {
    for (const r of trikes) {
      const dx = px - r.x, dz = pz - r.z, d = Math.hypot(dx, dz); let want = 0;
      if (d < 9) r.state = "guard"; else if (r.state === "guard" && d > 14) { r.state = "graze"; r.wait = 2; }
      if (r.state === "guard") { const a = Math.atan2(dx, dz); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.face += da * Math.min(1, dt * 2); }
      else if (r.state === "graze") { r.wait -= dt; if (r.wait <= 0) { const a = Math.random() * 6.283, rr = 4 + Math.random() * 16; r.tx = TRIKE_HOME.x + Math.cos(a) * rr; r.tz = TRIKE_HOME.z + Math.sin(a) * rr; r.state = "amble"; } }
      if (r.state === "amble") { const ex = r.tx - r.x, ez = r.tz - r.z, ed = Math.hypot(ex, ez);
        if (ed < 1.5) { r.state = "graze"; r.wait = 4 + Math.random() * 6; } else { want = 1.4; const a = Math.atan2(ex, ez); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.face += da * Math.min(1, dt * 1.5); } }
      r.sp += (want - r.sp) * Math.min(1, dt * 2);
      if (r.sp > 0.05) { const nx = r.x + Math.sin(r.face) * r.sp * dt, nz = r.z + Math.cos(r.face) * r.sp * dt; if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 8) { r.x = nx; r.z = nz; } else { r.state = "graze"; r.wait = 2; } }
      r.g.position.set(r.x, height(r.x, r.z), r.z); r.g.rotation.y = r.face;
      r.act.timeScale = r.sp > 0.1 ? 0.5 + r.sp / 2.5 : 0.12; // standing: the walk barely moves (a shuffle while it grazes)
      r.mixer.update(dt);
    }
  }
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
    const scatter = (geom, mat, n, minGate, maxR, size, sink = 0, base = null) => { const im = new THREE.InstancedMesh(geom, mat, n); let k = 0;
      for (let i = 0; i < n; i++) { const s = spotFor(minGate, maxR); if (!s) continue; const z = size[0] + rnd() * (size[1] - size[0]); q.setFromAxisAngle(up, rnd() * 6.283); sc.set(z, z * (0.85 + rnd() * 0.3), z); p3.set(s.x, s.y - sink * z, s.z); m4.compose(p3, q, sc); if (base) m4.multiply(base); im.setMatrixAt(k++, m4); }
      im.count = k; im.instanceMatrix.needsUpdate = true; scene.add(im); return im; };
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }), leafM = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.9, flatShading: true }), leaf2 = new THREE.MeshStandardMaterial({ color: 0x2f5a26, roughness: 0.9, flatShading: true });
    const TREES = low ? 140 : 260;
    // ancient giants: a tall trunk and a flat, wide crown
    const tg = new THREE.CylinderGeometry(0.35, 0.6, 9, 7); tg.translate(0, 4.5, 0);
    const cg = new THREE.IcosahedronGeometry(3.4, 1); cg.scale(1.3, 0.55, 1.3); cg.translate(0, 9.6, 0);
    seed = 11; scatter(tg, trunkM, TREES, 24, 170, [0.8, 1.6]); seed = 11; scatter(cg, leafM, TREES, 24, 170, [0.8, 1.6]);
    // conifers in the back, nearer the ridges
    const kg = new THREE.ConeGeometry(2.2, 8, 7); kg.translate(0, 5, 0);
    seed = 23; scatter(kg, leaf2, low ? 90 : 170, 30, 205, [0.9, 1.8]);
    // ferns: low clumps of three tilted leaves
    const fern = new THREE.IcosahedronGeometry(0.62, 0); fern.scale(1, 0.42, 1); fern.translate(0, 0.16, 0);
    seed = 31; scatter(fern, new THREE.MeshStandardMaterial({ color: 0x5f9636, roughness: 0.9, flatShading: true }), low ? 500 : coarse ? 900 : 1600, 6, 160, [0.7, 1.5]);
    // grass tufts: thin blades in small clumps, thickest around the gate where the camera looks down
    const tuft = new THREE.ConeGeometry(0.035, 0.42, 3, 1, true); tuft.translate(0, 0.19, 0);
    seed = 37; scatter(tuft, new THREE.MeshStandardMaterial({ color: 0x5f8f35, roughness: 1, side: THREE.DoubleSide }), low ? 1500 : coarse ? 3000 : 5000, 2.5, 70, [0.8, 1.6]);
    // boulders
    const rock = unit(MODELS && MODELS.rock);
    if (rock) { seed = 41; scatter(rock.geo, rock.mat, low ? 40 : 70, 10, 190, [1.4, 4.2], 0.12, rock.base); }
    else { const rg = new THREE.DodecahedronGeometry(1, 0); rg.scale(1.2, 0.8, 1); seed = 41; scatter(rg, new THREE.MeshStandardMaterial({ color: 0x86827a, roughness: 1, flatShading: true }), low ? 50 : 90, 10, 190, [0.6, 2.4], 0.25); }
    // palms round the lake's shore (the model is ~8.6K triangles, so a ring of them, not a forest)
    const palm = unit(MODELS && MODELS.palm);
    if (palm) { const n = low || coarse ? 12 : 22, im = new THREE.InstancedMesh(palm.geo, palm.mat, n); let k = 0; seed = 53;
      for (let i = 0; i < n * 3 && k < n; i++) { const a = rnd() * Math.PI * 2, r = J.LAKE.r + 6 + rnd() * 10, x = J.LAKE.x + Math.cos(a) * r, z = J.LAKE.z + Math.sin(a) * r, y = height(x, z);
        if (y < WATER_Y + 0.3) continue; const w = 4 + rnd() * 2.5; q.setFromAxisAngle(up, rnd() * 6.283); sc.set(w, w * (0.9 + rnd() * 0.25), w); p3.set(x, y - 0.1, z); m4.compose(p3, q, sc).multiply(palm.base); im.setMatrixAt(k++, m4); }
      im.count = k; im.instanceMatrix.needsUpdate = true; scene.add(im); }
    // the ancient giants (the model is ~17K triangles): a few landmarks along the view from the gate; the forest behind
    // them stays the light drawn trees
    const anc = unit(MODELS && MODELS.ancient);
    if (anc) { const spots = [[-24, 14, 13], [24, 18, 11], [-58, -40, 16], [12, -72, 18], [-92, 8, 15], [92, 34, 14], [-34, -128, 17], [44, -138, 16]].slice(0, low || coarse ? 5 : 8);
      const im = new THREE.InstancedMesh(anc.geo, anc.mat, spots.length); seed = 61;
      spots.forEach(([x, z, w], i) => { q.setFromAxisAngle(up, rnd() * 6.283); sc.set(w, w * (0.95 + rnd() * 0.2), w); p3.set(x, height(x, z) - 0.3, z); m4.compose(p3, q, sc).multiply(anc.base); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true; scene.add(im); }
    // the old ruins: a great gate on the far shore of the lake, and two smaller ones along the plain
    const ruin = unit(MODELS && MODELS.ruins);
    if (ruin) [[J.LAKE.x + 8, J.LAKE.z - J.LAKE.r - 16, 14, 0.4], [-48, -20, 8, -0.9], [-20, -110, 10, 0.2]].forEach(([x, z, w, ry]) => {
      const m = new THREE.Mesh(ruin.geo, ruin.mat); m.matrixAutoUpdate = false;
      m.matrix.compose(new THREE.Vector3(x, height(x, z) - 0.25, z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(w, w, w)).multiply(ruin.base); scene.add(m); });

    // the gate home: the same stone gate as in town (world-jurgate.js)
    const gate = ctx.makeGate ? ctx.makeGate(T("Back to the village")) : ctx.K.makePortal(T("Back to the village")); gate.position.set(J.GATE.x, height(J.GATE.x, J.GATE.z), J.GATE.z); gate.rotation.y = 0; scene.add(gate);
    seed = 71; makeRaptors(scene, rnd); makeHerd(scene); makeAlpha(scene); makeTrikes(scene);
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
        <div class="wz-note">${esc(T("A first look at the land. More dinosaurs, hunting and rewards come next."))}</div></div>
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
    tickRaptors(dt, t); tickHerd(dt); tickAlpha(dt); tickTrikes(dt);
    const g = Math.hypot(px - J.GATE.x, pz - J.GATE.z) < 4.2; if (g !== nearGate) { nearGate = g; ui.home.hidden = !g; }
  }

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; busy = true;
    try {
      if (!S) { await loadModels(); build(); } if (!ui) buildUi();
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
  return { enter, leave, active: () => on, debug: () => ({ px, pz, speed, nearGate, h: height(px, pz), frames, keys: [...keys], raptors: raptors.map((r) => ({ x: Math.round(r.x), z: Math.round(r.z), s: r.state })), alpha: alpha && { x: Math.round(alpha.x), z: Math.round(alpha.z), s: alpha.state }, herd: herd.length, trikes: trikes.map((r) => r.state) }), walk: (x, z) => { px = x; pz = z; } };
}
