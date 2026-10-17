// world-jurassic.js — Jurassic World (P0, the GM preview): a separate prehistoric land behind the Jurassic Portal in
// town (world-play.js). Only GM wallets come in for now; everyone else sees "Coming soon" at the portal.
// The plan (ARCIRCLE WORLD JURASSIC design doc v1.0): six biomes, realistic dinosaurs, hunting, crafting, eggs, raids.
// This first step is the Primeval Plains on their own: rolling ground, a lake, forest and ferns, far ridges in the haze,
// the hero walking it, and the gate home. Dinosaurs arrive with their GLB files (models/world/jurassic, the doc's list).
// It draws its own scene through the stage's view() while the town waits behind it, like the ARCL Mine.
import { makeJurTrees } from "./world-jurtrees.js";
export const JURASSIC = { SIZE: 520, EDGE: 230, SPAWN: { x: 0, z: 42 }, GATE: { x: 0, z: 66 }, LAKE: { x: 55, z: -35, r: 34 } };

export function createJurassic(ctx) {
  const { THREE, st, T, esc, toast } = ctx;
  const low = !!ctx.low, reduce = !!ctx.reduce, coarse = !!ctx.coarse;
  const J = JURASSIC;
  let S = null, ui = null, hero = null, on = false, busy = false;
  let hop = 0, vy = 0, grounded = true, jumpQ = false, px = J.SPAWN.x, pz = J.SPAWN.z, face = Math.PI, camYaw = Math.PI, camPitch = 0.05, camDist = 1, camGoal = 1, camInit = false, speed = 0, nearGate = false, introT = 0;
  const keys = new Set(), stick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 }, look = { id: -1, x: 0, y: 0 }, pinch = { a: -1, b: -1, d: 0, pts: new Map() };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camLookS = new THREE.Vector3();

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
  const NATURE = ["fern-01", "fern-02", "fern-03", "bush-01", "bush-02", "bush-03", "flowers-01", "flowers-02", "flowers-03", "log-01", "log-02", "log-03"];
  async function loadModels() {
    if (MODELS) return;
    const L = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null, ver = ctx.ver || "";
    const get = (f) => (L ? L.loadAsync("models/world/jurassic/" + f + ".glb" + ver) : Promise.reject(new Error("no loader")));
    // [key, file, whole gltf (rigged, with its clips) or just the scene]
    const LIST = [["rock", "rock-boulder"], ["ruins", "ruins-gate"], ["palm", "tree-palm"], ["ancient", "tree-ancient"], ["raptor8", "dino-raptor-8", 1], ["trike8", "dino-triceratops-8", 1], ["brachio8", "dino-brachio-8", 1], ["alpha8", "boss-alpha-raptor-8", 1],
      ["rock1", "rock-boulder-lod1"], ["ruins1", "ruins-gate-lod1"], ["palm1", "tree-palm-lod1"], ["ancient1", "tree-ancient-lod1"], ...NATURE.map((n) => [n, "nature/" + n])];
    const res = await Promise.race([Promise.allSettled(LIST.map(([, f, whole]) => get(f).then((g) => (whole ? g : g.scene)))), new Promise((ok) => setTimeout(() => ok(null), 20000))]);
    MODELS = {};
    if (!res) { console.warn("jurassic: models slow, drawn stand-ins this time"); return; }
    LIST.forEach(([k], i) => { if (res[i].status === "fulfilled") MODELS[k] = res[i].value; else console.warn("jurassic model", k, res[i].reason); });
    // the ground's layers and the lake's ripples (tools/gen-terrain-tex.mjs), the sky light (Poly Haven's "park", CC0, via @pmndrs/assets)
    const TL = new THREE.TextureLoader(), tex = (f, srgb) => new Promise((ok) => TL.load("models/world/jurassic/" + f + ver, (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = coarse ? 4 : 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; ok(t); }, undefined, () => ok(null)));
    const T6 = await Promise.race([Promise.all([tex("ground/grass.webp", 1), tex("ground/forest.webp", 1), tex("ground/dirt.webp", 1), tex("ground/sand.webp", 1), tex("ground/rock.webp", 1), tex("ground/normal.webp"), tex("ground/water-normal.webp"), tex("env/sky-park.webp", 1)]), new Promise((ok) => setTimeout(() => ok(null), 15000))]);
    if (T6 && T6.slice(0, 5).every(Boolean)) MODELS.ground = { grass: T6[0], forest: T6[1], dirt: T6[2], sand: T6[3], rock: T6[4], normal: T6[5] };
    if (T6 && T6[6]) MODELS.waterN = T6[6]; if (T6 && T6[7]) { T6[7].mapping = THREE.EquirectangularReflectionMapping; T6[7].wrapS = T6[7].wrapT = THREE.ClampToEdgeWrapping; MODELS.skyEnv = T6[7]; }
  }
  // the ground's material: five layers by the weights in its "splat" attribute (grass, forest floor, dirt, sand) and rock
  // by slope (side-on, so cliffs don't stretch), each at two scales against tiling, the shared bumps as a normal; wet
  // sand at the water's edge. The vertex colour stays as a gentle tint over it.
  function groundMat(G) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tG: { value: G.grass }, tF: { value: G.forest }, tD: { value: G.dirt }, tS: { value: G.sand }, tR: { value: G.rock }, tN: { value: G.normal }, wY: { value: WATER_Y } });
      sh.vertexShader = "attribute vec4 splat; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vSplat = splat; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);");
      sh.fragmentShader = "uniform sampler2D tG, tF, tD, tS, tR, tN; uniform float wY; varying vec4 vSplat; varying vec3 vWP; varying vec3 vWN;\n" +
        "vec3 two(sampler2D t, vec2 a, vec2 b) { return mix(texture2D(t, a).rgb, texture2D(t, b).rgb, 0.38); }\n" +
        sh.fragmentShader.replace("#include <map_fragment>", `
          vec2 uA = vWP.xz * 0.21, uB = mat2(0.8, -0.6, 0.6, 0.8) * vWP.xz * 0.047;
          vec4 w = max(vSplat, 0.0); w /= max(0.001, w.x + w.y + w.z + w.w);
          vec3 col = two(tG, uA, uB) * w.x + two(tF, uA, uB) * w.y + two(tD, uA, uB) * w.z + two(tS, uA, uB) * w.w;
          vec3 an = abs(vWN); an /= (an.x + an.y + an.z);
          vec3 rock = texture2D(tR, vWP.zy * 0.12).rgb * an.x + texture2D(tR, vWP.xz * 0.12).rgb * an.y + texture2D(tR, vWP.xy * 0.12).rgb * an.z;
          float rw = smoothstep(0.26, 0.48, 1.0 - vWN.y);
          col = mix(col, rock, rw);
          col *= mix(1.0, 0.62, smoothstep(wY + 0.7, wY + 0.05, vWP.y)); // wet at the water's edge
          diffuseColor.rgb *= col * 1.55;`).replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          { vec3 nm = texture2D(tN, vWP.xz * 0.21).xyz * 2.0 - 1.0; normal = normalize(normal + (viewMatrix * vec4(nm.x, 0.0, nm.y, 0.0)).xyz * 0.55); }`).replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.35, smoothstep(wY + 0.7, wY + 0.05, vWP.y));");
    };
    m.customProgramCacheKey = () => "jur-ground"; return m;
  }
  // one mesh of a model, ready to instance: its geometry and material, and the matrix that stands it on the ground with
  // its widest side 1 m (the instances then scale it in metres)
  function unit(o) {
    if (!o) return null; let mesh = null; o.updateMatrixWorld(true); o.traverse((m) => { if (!mesh && m.isMesh) mesh = m; }); if (!mesh) return null;
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = 1 / Math.max(sz.x, sz.z, 1e-6);
    const base = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + sz.x / 2), -b.min.y, -(b.min.z + sz.z / 2))).multiply(mesh.matrixWorld);
    const foot = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(b.min.x + sz.x / 2), -b.min.y, -(b.min.z + sz.z / 2)));
    return { geo: mesh.geometry, mat: mesh.material, base, foot, h: sz.y * k };
  }
  // the far model of one (models/world/jurassic/*-lod1: a tenth of the triangles, tools/lod-cluster.mjs) on the same footing
  function farOf(u, o) {
    if (!u || !o) return null; let mesh = null; o.updateMatrixWorld(true); o.traverse((m) => { if (!mesh && m.isMesh) mesh = m; }); if (!mesh) return null;
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    return { geo: mesh.geometry, base: u.foot.clone().multiply(mesh.matrixWorld) };
  }
  // ---------------- cells: the heavy props in 80 m squares, so what's behind the camera isn't drawn and what's far
  // is the light model. Each square holds an InstancedMesh per kind (near and far); every quarter second the squares
  // pick by their distance to the hero.
  const CELL = 80, cells = [];
  function cellsOf(scene, kind, near, far, mats, opts = {}) {
    const by = new Map();
    for (const m of mats) { const e = m.elements, cx = Math.floor(e[12] / CELL), cz = Math.floor(e[14] / CELL), k = cx + "," + cz; if (!by.has(k)) by.set(k, { cx, cz, list: [] }); by.get(k).list.push(m); }
    for (const { cx, cz, list } of by.values()) {
      const mk = (u, mat) => { const im = new THREE.InstancedMesh(u.geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(u.base))); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox && im.computeBoundingBox(); scene.add(im); return im; };
      const n = mk(near, near.mat); n.castShadow = !!opts.shadow; n.receiveShadow = !!opts.shadow;
      const f = far ? mk(far, near.mat) : null; if (f) f.visible = false;
      cells.push({ kind, x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, near: n, far: f, nearD: opts.nearD || 70, maxD: opts.maxD || 330 });
    }
  }
  let cellT = 0;
  function tickCells(dt, force) {
    if (!force && (cellT += dt) < 0.25) return; cellT = 0;
    for (const c of cells) {
      const d = Math.max(0, Math.hypot(c.x - px, c.z - pz) - CELL * 0.71), shown = d < c.maxD, nearOn = !c.far || d < c.nearD;
      c.near.visible = shown && nearOn; if (c.far) c.far.visible = shown && !nearOn;
    }
  }

  function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

  // ---------------- the raptors (the owner's 8-clip prototype: Idle, Walk, Run, Roar, two attacks, Hit, Death) ----------
  // They wander their part of the plain, stop and stare at you inside 14 m (a roar now and then) and run off within 7 m.
  // (No fighting yet: that comes with the server's say on damage and drops.)
  const raptors = [];
  function makeRaptors(scene, rnd) {
    if (!(MODELS && MODELS.raptor8 && MODELS.raptor8.animations && ctx.K.skelClone)) return;
    {
      const homes = [[-40, -10], [-55, -70], [20, -95], [95, -10], [-95, -40], [60, 40]].slice(0, low || coarse ? 4 : 6);
      homes.forEach(([hx, hz]) => { const R = rig(MODELS.raptor8, 3.8 + rnd() * 0.8); scene.add(R.g); R.loop("idle");
        raptors.push({ g: R.g, R, mixer: R.mixer, hx, hz, x: hx + (rnd() - 0.5) * 10, z: hz + (rnd() - 0.5) * 10, face: rnd() * 6.28, tx: hx, tz: hz, sp: 0, wait: rnd() * 3, state: "idle", roarAt: 0 }); });
    }
  }
  function tickRaptors(dt, t) {
    for (const r of raptors) {
      const dx = px - r.x, dz = pz - r.z, d = Math.hypot(dx, dz);
      let want = 0;
      if (d < 7) { r.state = "flee"; r.tx = r.x - dx / d * 18; r.tz = r.z - dz / d * 18; }
      else if (d < 14 && r.state !== "flee") { r.state = "stare"; }
      else if (r.state === "stare" || (r.state === "flee" && d > 22)) { r.state = "idle"; r.wait = 1 + Math.random() * 2; }
      r.lookAt = null; if (r.state === "stare" || (r.state === "walk" && d < 22)) { const a = Math.atan2(dx, dz); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); if (r.state === "stare") r.face += da * Math.min(1, dt * 3); r.lookAt = da; }
      else if (r.state === "idle") { r.wait -= dt; if (r.wait <= 0) { const a = Math.random() * 6.283, rr = 6 + Math.random() * 18; r.tx = r.hx + Math.cos(a) * rr; r.tz = r.hz + Math.sin(a) * rr; r.state = "walk"; } }
      if (r.state === "walk" || r.state === "flee") {
        const ex = r.tx - r.x, ez = r.tz - r.z, ed = Math.hypot(ex, ez);
        if (ed < 1.2) { r.state = "idle"; r.wait = 2 + Math.random() * 4; }
        else { want = r.state === "flee" ? 9 : 2.6; const a = Math.atan2(ex, ez); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.face += da * Math.min(1, dt * 4); }
      }
      r.sp += (want - r.sp) * Math.min(1, dt * 4);
      if (r.sp > 0.05) { const nx = r.x + Math.sin(r.face) * r.sp * dt, nz = r.z + Math.cos(r.face) * r.sp * dt;
        if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 5) { r.x = nx; r.z = nz; } else { r.state = "idle"; r.wait = 1; r.sp = 0; } }
      // its own walk and run, paced to the ground it covers; staring, a roar now and then
      if (r.state === "stare" && t > r.roarAt) { if (r.R.once("roar", 0.8)) r.roarAt = t + 5 + Math.random() * 4; }
      r.R.loop(r.sp > 5 ? "run" : r.sp > 0.4 ? "walk" : "idle", r.sp > 5 ? Math.max(0.7, r.sp / 8) : r.sp > 0.4 ? Math.max(0.6, r.sp / 2.6) : 1);
      r.g.position.set(r.x, height(r.x, r.z), r.z); r.g.rotation.y = r.face; mixUp(r, r.mixer, dt, r.x, r.z);
    }
  }
  // a rigged copy turned so its head looks down +z (Meshy's rigs face their own way): the hips-to-head line in the bind pose
  function faceZ(o) {
    o.updateMatrixWorld(true); let hip = null, head = null; o.traverse((b) => { if (!b.isBone) return; const n = b.name.toLowerCase(); if (!hip && /hips|pelvis|root/.test(n)) hip = b; if (/^head$|head(?!end)/.test(n) && !head) head = b; });
    if (!hip || !head) return o;
    const a = new THREE.Vector3(), c = new THREE.Vector3(); hip.getWorldPosition(a); head.getWorldPosition(c);
    const yaw = Math.atan2(c.x - a.x, c.z - a.z), w = new THREE.Group(); w.add(o); w.rotation.y = -yaw; w.updateMatrixWorld(true); return w;
  }
  // a creature's far model: the same vertices (and skin) with about a tenth of the triangles, by vertex clustering
  // (as tools/lod-cluster.mjs does for the props), made once per model; the mesh swaps to it past FAR_D
  const FAR_D = coarse ? 40 : 60, farGeo = new WeakMap();
  function lowOf(geo, ratio = 0.12) {
    if (farGeo.has(geo)) return farGeo.get(geo);
    const P = geo.attributes.position, I = geo.index ? geo.index.array : null; if (!I) { farGeo.set(geo, geo); return geo; }
    const n = P.count, bb = new THREE.Box3().setFromBufferAttribute(P), lo3 = bb.min, sz = bb.getSize(new THREE.Vector3()), target = I.length * ratio;
    const cluster = (g) => { const cell = new Map(), rep = new Uint32Array(n);
      for (let v = 0; v < n; v++) { const k = (Math.min(g - 1, Math.floor((P.getX(v) - lo3.x) / (sz.x || 1) * g)) * g + Math.min(g - 1, Math.floor((P.getY(v) - lo3.y) / (sz.y || 1) * g))) * g + Math.min(g - 1, Math.floor((P.getZ(v) - lo3.z) / (sz.z || 1) * g)); let r = cell.get(k); if (r === undefined) { r = v; cell.set(k, v); } rep[v] = r; }
      const out = []; for (let t = 0; t < I.length; t += 3) { const a = rep[I[t]], b = rep[I[t + 1]], c = rep[I[t + 2]]; if (a !== b && b !== c && a !== c) out.push(a, b, c); } return out; };
    let lo = 6, hi = 80, best = null; for (let it = 0; it < 7 && lo <= hi; it++) { const g = (lo + hi) >> 1, r = cluster(g); if (r.length <= target) { best = r; lo = g + 1; } else hi = g - 1; }
    const f = new THREE.BufferGeometry(); for (const k of Object.keys(geo.attributes)) f.setAttribute(k, geo.attributes[k]); f.setIndex(best || cluster(6)); f.boundingSphere = geo.boundingSphere; f.boundingBox = geo.boundingBox;
    farGeo.set(geo, f); return f;
  }
  function lodMeshes(g) { const list = []; g.traverse((m) => { if (m.isMesh && m.geometry) list.push({ m, near: m.geometry, far: lowOf(m.geometry) }); }); return list; }
  function setLod(o, d) { const far = d > FAR_D; if (o.lodFar === far) return; o.lodFar = far; for (const x of o.lod || []) x.m.geometry = far ? x.far : x.near; }
  // a rigged copy with named clips (the owner's 8-clip prototypes: Idle, Walk, Run, attacks, Hit, Death, Roar …): turned
  // head first, LEN m long, its clips crossfaded by name; a one-shot (a roar, a horn toss) goes back to the loop it broke
  function rig(gl, LEN, H = 0) {
    const o0 = ctx.K.skelClone(gl.scene), o = faceZ(o0); o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = H ? H / (sz.y || 1) : LEN / (Math.max(sz.x, sz.z) || 1);
    o.scale.multiplyScalar(k); o.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k); o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    const g = new THREE.Group(); g.add(o);
    const mixer = new THREE.AnimationMixer(o), byName = {};
    for (const c of gl.animations) byName[c.name.replace(/^.*\|/, "").toLowerCase()] = c;
    const clip = (n) => byName[n] || Object.entries(byName).find(([k2]) => k2.startsWith(n))?.[1] || null;
    const R = { g, mixer, cur: null, loopName: "", one: null, h: sz.y * k, L: LEN };
    const bone = (n) => { let b = null; o.traverse((x) => { if (!b && x.isBone && x.name.toLowerCase() === n) b = x; }); return b; };
    R.bones = { head: bone("head"), chest: bone("chest"), tail: ["tailstart", "tail1", "tail2", "tail3"].map(bone).filter(Boolean) };
    R.has = (n) => !!clip(n);
    R.loop = (n, speed = 1) => { if (R.one) { R.loopName = n; R.loopSpeed = speed; return; } const c = clip(n); if (!c) return; const a = mixer.clipAction(c); a.timeScale = speed; if (R.cur === a) return;
      a.reset().setLoop(THREE.LoopRepeat, Infinity).play(); if (R.cur) R.cur.crossFadeTo(a, 0.25, false); R.cur = a; R.loopName = n; R.loopSpeed = speed; };
    R.once = (n, speed = 1) => { const c = clip(n); if (!c || R.one) return false; const a = mixer.clipAction(c); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.timeScale = speed; a.play(); if (R.cur) R.cur.crossFadeTo(a, 0.15, false); R.one = a; R.cur = a; R.oneLeft = c.duration / Math.max(0.05, speed) - 0.2; return true; };
    // the one-shot ends by its own clock (not the mixer's "finished" event, which a far creature's stepped mixer can miss)
    R.step = (dt) => { if (!R.one || (R.oneLeft -= dt) > 0) return; const done = R.one; R.one = null; const c = clip(R.loopName || "idle"); if (!c) return;
      const a = mixer.clipAction(c); a.reset().setLoop(THREE.LoopRepeat, Infinity); a.timeScale = R.loopSpeed || 1; a.play(); done.crossFadeTo(a, 0.25, false); R.cur = a; };
    return R;
  }
  // after the clip: the head (and a little of the chest) turned toward what it's looking at, the tail swinging out behind a
  // turn like a spring, the body tilted to the slope it stands on. Only near (past 60 m nobody sees it)
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  function yawBone(b, ang) { if (!b || !b.parent || Math.abs(ang) < 1e-4) return; b.parent.getWorldQuaternion(qB); b.getWorldQuaternion(qA); qA.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, ang)); b.quaternion.copy(qB.invert().multiply(qA)); }
  function poseUp(o, dt) {
    const B = o.R && o.R.bones; if (!B) return;
    o.lookW = (o.lookW || 0) + ((o.lookAt != null ? 1 : 0) - (o.lookW || 0)) * Math.min(1, dt * 3); const ly = Math.max(-0.9, Math.min(0.9, o.lookAt || 0)); o.lookS = (o.lookS || 0) + (ly - (o.lookS || 0)) * Math.min(1, dt * 4);
    if (o.lookW > 0.01) { yawBone(B.chest, o.lookS * 0.3 * o.lookW); yawBone(B.head, o.lookS * 0.55 * o.lookW); }
    let tr = (o.face - (o.prevFace ?? o.face)); tr = Math.atan2(Math.sin(tr), Math.cos(tr)) / Math.max(dt, 1e-3); o.prevFace = o.face;
    o.tailS = (o.tailS || 0) + (Math.max(-2.5, Math.min(2.5, tr)) * 0.22 - (o.tailS || 0)) * Math.min(1, dt * 3.5);
    B.tail.forEach((b, i) => yawBone(b, -o.tailS * (0.25 + i * 0.18)));
  }
  function slopeTilt(o, x, z) { const L = (o.R && o.R.L) || 4, f = Math.sin(o.face), c = Math.cos(o.face), hf = height(x + f * L * 0.4, z + c * L * 0.4), hb = height(x - f * L * 0.4, z - c * L * 0.4);
    o.g.rotation.order = "YXZ"; o.tilt = (o.tilt || 0) + (-Math.atan2(hf - hb, L * 0.8) - (o.tilt || 0)) * 0.15; o.g.rotation.x = Math.max(-0.35, Math.min(0.35, o.tilt)); }
  // a far creature's clip is stepped less often (every 3rd frame past 45 m, every 8th past 140 m) and it isn't drawn past 260 m
  function mixUp(o, mixer, dt, x, z) {
    const d = Math.hypot(x - px, z - pz); if (o.g) o.g.visible = d < 260; setLod(o, d); o.acc = (o.acc || 0) + dt; o.n = (o.n || 0) + 1;
    const every = d > 140 ? 8 : d > 45 ? 3 : 1; if (o.n % every) return; if (o.R) o.R.step(o.acc); if (d < 260) mixer.update(o.acc); if (d < 60) { poseUp(o, o.acc); if (!o.noTilt) slopeTilt(o, x, z); } o.acc = 0;
  }
  // ---------------- the sentinel (the owner's Meshy Raptor Roar, rigged, its roar): one raptor on a boulder by the lake,
  // in sight of the gate. It stands watching; come within 32 m and it turns to you and roars, again every few seconds.
  let sentinel = null; const SENT = { x: 26, z: -2 };
  function makeSentinel(scene) {
    const gl = MODELS && MODELS.raptor8; if (!gl || !ctx.K.skelClone || !gl.animations) return;
    const R = rig(gl, 4.6); scene.add(R.g); R.loop("idle");
    // its rock: the owner's boulder when it's there
    const rk = unit(MODELS.rock); let top = 0;
    if (rk) { const m = new THREE.Mesh(rk.geo, rk.mat); m.matrixAutoUpdate = false; const w = 6; top = rk.h * w * 0.82; m.matrix.compose(new THREE.Vector3(SENT.x, height(SENT.x, SENT.z) - 0.3, SENT.z), new THREE.Quaternion(), new THREE.Vector3(w, w, w)).multiply(rk.base); m.castShadow = m.receiveShadow = true; scene.add(m); }
    R.g.position.set(SENT.x, height(SENT.x, SENT.z) + top - 0.3, SENT.z);
    sentinel = { g: R.g, R, mixer: R.mixer, face: Math.PI * 0.7, next: 0, lod: lodMeshes(R.g), noTilt: true }; // (it stands on its rock)
  }
  function tickSentinel(dt, t) {
    const R = sentinel; if (!R) return;
    const dx = px - SENT.x, dz = pz - SENT.z, d = Math.hypot(dx, dz);
    R.lookAt = null; if (d < 32) { const a = Math.atan2(dx, dz); let da = a - R.face; da = Math.atan2(Math.sin(da), Math.cos(da)); R.face += da * Math.min(1, dt * 2.5); R.lookAt = da;
      if (t > R.next && Math.abs(da) < 0.4 && R.R.once("roar", 0.7)) R.next = t + 6 + Math.random() * 3; }
    R.g.rotation.y = R.face; mixUp(R, R.mixer, dt, SENT.x, SENT.z);
  }
  // ---------------- the brachiosaurs (the owner's Meshy Brachiosaurus, rigged, with its walk): a small herd walking a
  // slow loop beyond the lake, 13 m tall, so the plain feels as big as it is. Not for fighting: they're the view.
  const herd = [];
  function makeHerd(scene) {
    const gl = MODELS && MODELS.brachio8; if (!gl || !ctx.K.skelClone || !gl.animations) return;
    const n = low || coarse ? 2 : 3;
    for (let i = 0; i < n; i++) { const R = rig(gl, 1, 13 + i * 1.2); scene.add(R.g); R.loop("walk", 0.8); herd.push({ g: R.g, R, mixer: R.mixer, a: i * 0.5, r: 58 + i * 7, sp: 1.5, stopAt: 20 + i * 9, stopFor: 0 }); }
  }
  const HERD = { x: 40, z: -120 };
  function tickHerd(dt, t = 0) {
    for (const h of herd) {
      // walking its loop; every half a minute or so it stops to eat for a while (and roars now and then)
      if (h.stopFor > 0) { h.stopFor -= dt; h.sp += (0 - h.sp) * Math.min(1, dt * 1.5); if (h.stopFor <= 0) h.stopAt = t + 25 + Math.random() * 20; }
      else { h.sp += (1.5 - h.sp) * Math.min(1, dt); if (t > h.stopAt) { h.stopFor = 7 + Math.random() * 5; if (Math.random() < 0.35) h.R.once("roar", 0.9); } }
      h.R.loop(h.stopFor > 0 && h.sp < 0.4 ? "eat" : "walk", h.stopFor > 0 ? 1 : Math.max(0.5, h.sp / 1.8));
      h.a += (h.sp / h.r) * dt; const x = HERD.x + Math.cos(h.a) * h.r, z = HERD.z + Math.sin(h.a) * h.r * 0.6;
      const tx = -Math.sin(h.a) * h.r, tz = Math.cos(h.a) * h.r * 0.6; // the way it walks (the loop's tangent)
      h.g.position.set(x, height(x, z) - 0.2, z); h.face = Math.atan2(tx, tz); h.g.rotation.y = h.face; mixUp(h, h.mixer, dt, x, z);
    }
  }
  // ---------------- the Alpha Raptor (the owner's Meshy boss, rigged, with its walk): the plain's first boss, keeping the
  // ruins in the south as its ground. It walks its round; come within 18 m and it stalks you, circling at 9 m; go 30 m
  // away and it goes back. (Its fight, three phases and drops, comes with its attack clips and the server's say on damage.)
  let alpha = null; const ALPHA_HOME = { x: -20, z: -100 };
  function makeAlpha(scene) {
    const gl = MODELS && MODELS.alpha8; if (!gl || !ctx.K.skelClone || !gl.animations) return;
    const R = rig(gl, 6.5); scene.add(R.g); R.loop("idle");
    const tag = ctx.K.label(T("Alpha Raptor"), { accent: "#ff4d6d", color: "#ffd2d9", size: 0.9, sub: T("Boss · Lv 10") }); tag.position.y = R.h + 1.4; R.g.add(tag);
    alpha = { g: R.g, R, mixer: R.mixer, x: ALPHA_HOME.x, z: ALPHA_HOME.z, face: 0, a: 0, state: "patrol", sp: 2.2, orbit: 1, feintAt: 0 };
  }
  function tickAlpha(dt, t = 0) {
    const A = alpha; if (!A) return;
    const dx = px - A.x, dz = pz - A.z, d = Math.hypot(dx, dz), home = Math.hypot(A.x - ALPHA_HOME.x, A.z - ALPHA_HOME.z);
    if (A.state === "patrol" && d < 18) A.state = "stalk"; else if (A.state === "stalk" && (d > 30 || home > 45)) A.state = "patrol";
    let tx, tz, want;
    if (A.state === "stalk") {
      // toward you until 9 m, then round you, always facing a little in
      const ang = Math.atan2(A.x - px, A.z - pz) + A.orbit * 0.5;
      tx = px + Math.sin(ang) * 9; tz = pz + Math.cos(ang) * 9; want = d > 12 ? 5.5 : 3;
    } else { A.a += dt * 0.07; tx = ALPHA_HOME.x + Math.cos(A.a) * 22; tz = ALPHA_HOME.z + Math.sin(A.a) * 14; want = 2.2; }
    { const la = Math.atan2(dx, dz) - A.face; A.lookAt = A.state === "stalk" ? Math.atan2(Math.sin(la), Math.cos(la)) : null; }
    const ex = tx - A.x, ez = tz - A.z, ed = Math.hypot(ex, ez) || 1, a = Math.atan2(ex, ez); let da = a - A.face; da = Math.atan2(Math.sin(da), Math.cos(da)); A.face += da * Math.min(1, dt * 3);
    A.sp += (want - A.sp) * Math.min(1, dt * 2);
    const nx = A.x + Math.sin(A.face) * A.sp * dt, nz = A.z + Math.cos(A.face) * A.sp * dt;
    if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 8) { A.x = nx; A.z = nz; } else A.orbit = -A.orbit;
    A.g.position.set(A.x, height(A.x, A.z), A.z); A.g.rotation.y = A.face;
    if (A.state === "stalk" && d < 12 && t > A.feintAt) { const f = ["attack_claw", "attack_tail", "attack_bite", "attack_leap"][Math.floor(Math.random() * 4)]; if (A.R.once(f, 1)) A.feintAt = t + 4 + Math.random() * 3; }
    A.R.loop(A.sp > 4.5 ? "run" : A.sp > 0.4 ? "walk" : "idle", A.sp > 4.5 ? Math.max(0.7, A.sp / 7) : Math.max(0.6, A.sp / 2.4)); mixUp(A, A.mixer, dt, A.x, A.z);
  }
  // ---------------- the triceratops (the owner's Meshy Blazing Triceratops, rigged, with its walk): a small herd grazing
  // east of the lake. They amble from patch to patch; come within 9 m and the nearest turns its horns to you and stands.
  const trikes = []; const TRIKE_HOME = { x: 105, z: 5 };
  function makeTrikes(scene) {
    if (!(MODELS && MODELS.trike8 && MODELS.trike8.animations && ctx.K.skelClone)) return;
    { const n = low || coarse ? 2 : 3;
      for (let i = 0; i < n; i++) { const R = rig(MODELS.trike8, 6.4 + i * 0.6); scene.add(R.g); R.loop("idle");
        trikes.push({ g: R.g, R, mixer: R.mixer, x: TRIKE_HOME.x + i * 7 - 7, z: TRIKE_HOME.z + (i % 2) * 6, face: Math.PI * 0.6, tx: 0, tz: 0, sp: 0, wait: 2 + i * 2, state: "graze", hornAt: 0 }); }
    }
  }
  function tickTrikes(dt, t = 0) {
    for (const r of trikes) {
      const dx = px - r.x, dz = pz - r.z, d = Math.hypot(dx, dz); let want = 0;
      if (d < 9) r.state = "guard"; else if (r.state === "guard" && d > 14) { r.state = "graze"; r.wait = 2; }
      r.lookAt = null; if (r.state === "guard" || d < 18) { const a = Math.atan2(dx, dz); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); if (r.state === "guard") r.face += da * Math.min(1, dt * 2); r.lookAt = da; }
      else if (r.state === "graze") { r.wait -= dt; if (r.wait <= 0) { const a = Math.random() * 6.283, rr = 4 + Math.random() * 16; r.tx = TRIKE_HOME.x + Math.cos(a) * rr; r.tz = TRIKE_HOME.z + Math.sin(a) * rr; r.state = "amble"; } }
      if (r.state === "amble") { const ex = r.tx - r.x, ez = r.tz - r.z, ed = Math.hypot(ex, ez);
        if (ed < 1.5) { r.state = "graze"; r.wait = 4 + Math.random() * 6; } else { want = 1.4; const a = Math.atan2(ex, ez); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.face += da * Math.min(1, dt * 1.5); } }
      r.sp += (want - r.sp) * Math.min(1, dt * 2);
      if (r.sp > 0.05) { const nx = r.x + Math.sin(r.face) * r.sp * dt, nz = r.z + Math.cos(r.face) * r.sp * dt; if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 8) { r.x = nx; r.z = nz; } else { r.state = "graze"; r.wait = 2; } }
      r.g.position.set(r.x, height(r.x, r.z), r.z); r.g.rotation.y = r.face;
      // guarding: a horn toss at you now and then; otherwise its walk at the pace it ambles, its idle while it grazes
      if (r.state === "guard" && t > r.hornAt) { if (r.R.once("attack_horn", 1)) r.hornAt = t + 3.5 + Math.random() * 2; }
      r.R.loop(r.sp > 0.3 ? "walk" : "idle", r.sp > 0.3 ? Math.max(0.6, r.sp / 1.4) : 1); mixUp(r, r.mixer, dt, r.x, r.z);
    }
  }
  // ---------------- the grass: crossed cards of drawn blades in a window that follows the hero (thick near, thinning to
  // its edge), swaying in the wind on the GPU; nothing on sand, water, steep ground or the gate's step
  function makeGrass(scene) {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128; const g = cv.getContext("2d"); let sd = 13; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 34; i++) { const x = 6 + r() * 116, h = 56 + r() * 70, lean = (r() - 0.5) * 30, wd = 1.6 + r() * 2.2, gr = g.createLinearGradient(0, 128, 0, 128 - h);
      gr.addColorStop(0, "#5a8432"); gr.addColorStop(0.45, r() < 0.5 ? "#79a844" : "#6a9c3c"); gr.addColorStop(1, r() < 0.35 ? "#c4cf78" : "#a2c45e");
      g.fillStyle = gr; g.beginPath(); g.moveTo(x - wd, 128); g.quadraticCurveTo(x + lean * 0.4, 128 - h * 0.55, x + lean, 128 - h); g.quadraticCurveTo(x + lean * 0.4 + wd * 0.3, 128 - h * 0.5, x + wd, 128); g.fill(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.BufferGeometry(), P = [], UV = [], I = [];
    [0, Math.PI / 2].forEach((a, k) => { const c = Math.cos(a) * 0.42, s2 = Math.sin(a) * 0.42, o = k * 4; P.push(-c, 0, -s2, c, 0, s2, c, 0.62, s2, -c, 0.62, -s2); UV.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); geo.setIndex(I);
    const U = { uT: { value: 0 } }, mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); sh.vertexShader = "uniform float uT;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      { float h = uv.y * uv.y; vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float w = sin(uT * 1.6 + ip.x * 0.31 + ip.y * 0.23) * 0.16 + sin(uT * 3.3 + ip.x * 1.7 - ip.y * 0.9) * 0.05;
        transformed.x += w * h; transformed.z += w * 0.55 * h; }`); };
    mat.customProgramCacheKey = () => "jur-grass";
    const STEP = low ? 1.7 : coarse ? 1.35 : 1.1, W = low ? 30 : coarse ? 44 : 64, im = new THREE.InstancedMesh(geo, mat, W * W);
    im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), R = W * STEP * 0.5;
    const h01 = (a, b, k) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    let lx = 1e9, lz = 1e9;
    function fill() {
      const cx = Math.floor(px / STEP), cz = Math.floor(pz / STEP); if (Math.abs(cx - lx) < 3 && Math.abs(cz - lz) < 3) return; lx = cx; lz = cz; let k = 0; // re-laid every 3 cells walked (not every step: a phone's frame)
      for (let iz = 0; iz < W; iz++) for (let ix = 0; ix < W; ix++) {
        const gx = cx + ix - (W >> 1), gz = cz + iz - (W >> 1), x = (gx + h01(gx, gz, 1)) * STEP, z = (gz + h01(gx, gz, 2)) * STEP, y = height(x, z);
        const dEdge = Math.hypot(x - px, z - pz) / R, slope = Math.abs(height(x + 1, z) - y) + Math.abs(height(x, z + 1) - y);
        let s0 = (0.75 + h01(gx, gz, 3) * 0.7) * (1 - THREE.MathUtils.smoothstep(dEdge, 0.7, 1));
        if (y < WATER_Y + 0.7 || slope > 0.55 || Math.hypot(x - J.GATE.x, z - J.GATE.z) < 6 || fbm(x * 0.06, z * 0.06) > 0.72) s0 = 0;
        q.setFromAxisAngle(up, h01(gx, gz, 4) * 6.283); sc.set(s0, s0 * (0.8 + h01(gx, gz, 5) * 0.6), s0); p3.set(x, y - 0.05, z); im.setMatrixAt(k++, m4.compose(p3, q, sc));
      }
      im.instanceMatrix.needsUpdate = true;
    }
    return { tick(t) { U.uT.value = t; fill(); } };
  }
  // ---------------- the view and the air: mountains painted round the horizon, a ring of far forest (drawn cards, the
  // haze fading them), clouds drifting, pollen in the light, pterosaurs circling, and a waterfall into the lake
  function makeAir(scene) {
    const out = { tick: [] };
    // the far mountains: a painted band on a cylinder far out (three ranges, lighter as they go back)
    const mcv = document.createElement("canvas"); mcv.width = 2048; mcv.height = 256; const g = mcv.getContext("2d");
    const ranges = [["rgba(126,150,140,0.85)", 0.32, 0.55, 3], ["rgba(96,124,108,0.92)", 0.48, 0.42, 5], ["rgba(70,98,78,1)", 0.62, 0.3, 9]];
    for (const [c, base, amp, f] of ranges) { g.fillStyle = c; g.beginPath(); g.moveTo(0, 256); for (let x = 0; x <= 2048; x += 8) { const u = x / 2048 * Math.PI * 2; const y = 256 * (base - amp * 0.5 * (0.55 + 0.25 * Math.sin(u * f + c.length) + 0.15 * Math.sin(u * f * 2.7 + 1.3) + 0.05 * Math.sin(u * 23))); g.lineTo(x, y); } g.lineTo(2048, 256); g.fill(); }
    const mt = new THREE.CanvasTexture(mcv); mt.colorSpace = THREE.SRGBColorSpace; mt.wrapS = THREE.RepeatWrapping;
    const mtn = new THREE.Mesh(new THREE.CylinderGeometry(560, 560, 150, 64, 1, true), new THREE.MeshBasicMaterial({ map: mt, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    mtn.position.y = 52; mtn.renderOrder = -1; scene.add(mtn);
    // the far forest: tree-shaped cards in a ring past the ridges (they always face the camera on the y axis)
    const tcv = document.createElement("canvas"); tcv.width = 128; tcv.height = 256; const tg = tcv.getContext("2d");
    tg.fillStyle = "#4a3a28"; tg.fillRect(58, 150, 12, 106); for (let i = 0; i < 26; i++) { const x = 64 + (Math.random() - 0.5) * 90, y = 40 + Math.random() * 120, r = 18 + Math.random() * 26; tg.fillStyle = ["#2f5a26", "#3b6a2c", "#29502a"][i % 3]; tg.beginPath(); tg.arc(x, y, r, 0, 6.283); tg.fill(); }
    const tt = new THREE.CanvasTexture(tcv); tt.colorSpace = THREE.SRGBColorSpace;
    const tq = new THREE.PlaneGeometry(1, 2); tq.translate(0, 1, 0);
    const N = low ? 90 : coarse ? 140 : 220, ring = new THREE.InstancedMesh(tq, new THREE.MeshLambertMaterial({ map: tt, alphaTest: 0.5, side: THREE.DoubleSide }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0); let sd = 91; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const spots = []; for (let i = 0; i < N; i++) { const a = r() * 6.283, d = 196 + r() * 40, x = Math.cos(a) * d, z = Math.sin(a) * d, w = 9 + r() * 9; spots.push([x, height(x, z) - 1, z, w]); }
    const faceRing = () => { spots.forEach(([x, y, z, w], i) => { q.setFromAxisAngle(up, Math.atan2(px - x, pz - z)); sc.set(w, w, w); p3.set(x, y, z); ring.setMatrixAt(i, m4.compose(p3, q, sc)); }); ring.instanceMatrix.needsUpdate = true; };
    faceRing(); ring.frustumCulled = false; scene.add(ring); let rT = 0; out.tick.push((dt) => { if ((rT += dt) > 1) { rT = 0; faceRing(); } });
    // clouds: soft blobs high up, drifting
    const ccv = document.createElement("canvas"); ccv.width = 256; ccv.height = 128; const cg = ccv.getContext("2d");
    for (let i = 0; i < 14; i++) { const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, rr = 22 + Math.random() * 30, gr = cg.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, "rgba(255,255,255,0.85)"); gr.addColorStop(1, "rgba(255,255,255,0)"); cg.fillStyle = gr; cg.fillRect(0, 0, 256, 128); }
    const ct = new THREE.CanvasTexture(ccv); ct.colorSpace = THREE.SRGBColorSpace; const clouds = [];
    for (let i = 0; i < (low ? 5 : 9); i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.8 })); sp.scale.set(150 + r() * 120, 60 + r() * 40, 1); sp.position.set((r() - 0.5) * 700, 150 + r() * 60, (r() - 0.5) * 700); scene.add(sp); clouds.push(sp); }
    out.tick.push((dt) => { for (const c of clouds) { c.position.x += dt * 2.2; if (c.position.x > 380) c.position.x = -380; } });
    // pollen and dust in the light round the camera
    if (!low) { const NP = coarse ? 160 : 320, pg = new THREE.BufferGeometry(), pp = new Float32Array(NP * 3); for (let i = 0; i < NP; i++) pp.set([(r() - 0.5) * 40, r() * 10, (r() - 0.5) * 40], i * 3); pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
      const dcv = document.createElement("canvas"); dcv.width = dcv.height = 32; const dg = dcv.getContext("2d"), dgr = dg.createRadialGradient(16, 16, 0, 16, 16, 16); dgr.addColorStop(0, "rgba(255,248,210,1)"); dgr.addColorStop(1, "rgba(255,248,210,0)"); dg.fillStyle = dgr; dg.fillRect(0, 0, 32, 32);
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dcv), size: 0.18, transparent: true, depthWrite: false, opacity: 0.75, blending: THREE.AdditiveBlending })); pts.frustumCulled = false; scene.add(pts);
      out.tick.push((dt, t) => { pts.position.set(px, height(px, pz), pz); const a = pg.attributes.position; for (let i = 0; i < NP; i++) { let y = a.getY(i) + dt * 0.25; if (y > 10) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.2); } a.needsUpdate = true; }); }
    // pterosaurs: dark silhouettes with beating wings, wheeling high over the plain
    const wing = new THREE.BufferGeometry(); wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.6, 0, 0, -0.6, 2.4, 0.1, -0.2], 3)); wing.computeVertexNormals();
    const wm = new THREE.MeshBasicMaterial({ color: 0x2a2620, side: THREE.DoubleSide }), birds = [];
    for (let i = 0; i < (low ? 3 : 6); i++) { const b = new THREE.Group(), L = new THREE.Mesh(wing, wm), Rw = new THREE.Mesh(wing, wm); Rw.scale.x = -1; const body = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.2, 5), wm); body.rotation.x = Math.PI / 2; b.add(L, Rw, body); b.scale.setScalar(2 + r() * 1.5); scene.add(b);
      birds.push({ b, L, Rw, c: [(r() - 0.5) * 200, (r() - 0.5) * 200], rad: 40 + r() * 60, h: 60 + r() * 40, a: r() * 6.28, sp: 0.12 + r() * 0.08, ph: r() * 6 }); }
    out.tick.push((dt, t) => { for (const B of birds) { B.a += dt * B.sp; const x = B.c[0] + Math.cos(B.a) * B.rad, z = B.c[1] + Math.sin(B.a) * B.rad; B.b.position.set(x, B.h + Math.sin(t * 0.4 + B.ph) * 4, z); B.b.rotation.y = -B.a; const f = Math.sin(t * 5 + B.ph) * 0.55; B.L.rotation.z = f; B.Rw.rotation.z = -f; } });
    // the waterfall: a cliff of the owner's boulders at the lake's far edge, falling water (streaks scrolling down) and mist
    const WF = { x: J.LAKE.x + 6, z: J.LAKE.z - J.LAKE.r - 2 }, rk = unit(MODELS && MODELS.rock), top = 13;
    if (rk) [[0, 0, 0, 14], [-7, 2, 3, 11], [7, 1, 2, 12], [-3, 9, 4, 9], [4, 9, 5, 9], [0, 15, 6, 8]].forEach(([dx, dy, dz, w], i) => { const m = new THREE.Mesh(rk.geo, rk.mat); m.matrixAutoUpdate = false; m.matrix.compose(new THREE.Vector3(WF.x + dx, WATER_Y - 2 + dy, WF.z - 6 - dz), new THREE.Quaternion().setFromAxisAngle(up, i * 1.7), new THREE.Vector3(w, w * 1.1, w)).multiply(rk.base); m.castShadow = m.receiveShadow = true; scene.add(m); });
    const wU = { uT: { value: 0 } }, fall = new THREE.Mesh(new THREE.PlaneGeometry(5, top + 3, 1, 8), new THREE.ShaderMaterial({ uniforms: wU, transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vU; void main(){ vU = uv; vec3 p = position; p.z += (1.0 - uv.y) * (1.0 - uv.y) * 1.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
      fragmentShader: "uniform float uT; varying vec2 vU; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); } void main(){ float x = floor(vU.x * 28.0); float s = fract(vU.y * 2.5 + uT * (1.4 + h(vec2(x, 1.0)) * 0.8) + h(vec2(x, 7.0))); float streak = smoothstep(0.0, 0.5, s) * smoothstep(1.0, 0.6, s); float edge = smoothstep(0.0, 0.12, vU.x) * smoothstep(1.0, 0.88, vU.x); vec3 c = mix(vec3(0.55, 0.78, 0.82), vec3(0.95, 1.0, 1.0), streak); gl_FragColor = vec4(c, (0.55 + streak * 0.4) * edge); }" }));
    fall.position.set(WF.x, WATER_Y + (top + 3) / 2 - 1, WF.z - 2.2); scene.add(fall); out.tick.push((dt, t) => { wU.uT.value = t; });
    const mist = []; for (let i = 0; i < (low ? 4 : 8); i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, opacity: 0.5 })); sp.scale.set(6, 3.5, 1); scene.add(sp); mist.push({ sp, ph: i / 8 }); }
    out.tick.push((dt, t) => { for (const m of mist) { const k = (t * 0.25 + m.ph) % 1; m.sp.position.set(WF.x + Math.sin(m.ph * 20) * 2.5, WATER_Y + 0.4 + k * 3.5, WF.z - 1 + k * 2); m.sp.material.opacity = 0.5 * (1 - k); } });
    out.WF = WF;
    return { tick: (dt, t) => { for (const f of out.tick) f(dt, t); }, WF };
  }
  function build() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(55, 1, 0.3, 900);
    const HAZE = 0xc9d6c4; scene.fog = new THREE.FogExp2(HAZE, low ? 0.0075 : 0.0055); scene.background = new THREE.Color(HAZE);
    // the sky: a warm horizon under a blue top, on a big sphere that ignores the fog
    const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false,
      map: canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#3f86d6"); gr.addColorStop(0.38, "#8fc0e8"); gr.addColorStop(0.5, "#e9e2c8"); gr.addColorStop(0.56, "#c9d6c4"); gr.addColorStop(1, "#9fb39a"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
    scene.add(sky);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a32, 0.75));
    const sun = new THREE.DirectionalLight(0xffecd0, 2.7); sun.position.set(-120, 160, 80); scene.add(sun, sun.target);
    // the sun's shadow follows the hero (a box round them), when the device draws shadows at all
    const shadows = !!(st.renderer.shadowMap && st.renderer.shadowMap.enabled && st.renderer.shadowMap.autoUpdate !== false) && !low;
    if (shadows) { sun.castShadow = true; const R = coarse ? 30 : 42, sc0 = sun.shadow.camera; sc0.left = -R; sc0.right = R; sc0.top = R; sc0.bottom = -R; sc0.near = 1; sc0.far = 420;
      sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sc0.updateProjectionMatrix(); }
    // the sky as the light the models reflect (the Meshy materials are PBR: without it they look flat, like plastic)
    try {
      const pm = new THREE.PMREMGenerator(st.renderer);
      if (MODELS && MODELS.skyEnv) { scene.environment = pm.fromEquirectangular(MODELS.skyEnv).texture; scene.environmentIntensity = 0.7; }
      else { const es = new THREE.Scene(); es.add(sky.clone()); const sunBall = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 })); sunBall.position.copy(sun.position).normalize().multiplyScalar(700); es.add(sunBall); scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.55; }
      pm.dispose();
    } catch (e) { console.warn("jurassic env", e); }

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
    const G = MODELS && MODELS.ground;
    if (G) {
      // the layers' weights: grass on the plain, forest floor in patches (where the trees stand thickest), dirt on slopes
      // and worn paths, sand down to the water; the tint becomes a gentle light/dark variation
      const spl = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), slope = 1 - nrm.getY(i), n1 = fbm(x * 0.018 + 3, z * 0.018 - 7), n2 = fbm(x * 0.06, z * 0.06);
        const sand = 1 - THREE.MathUtils.smoothstep(y, WATER_Y + 0.15, WATER_Y + 0.85), dirt = Math.min(1, Math.max(0, (slope - 0.08) * 6) + Math.max(0, n2 - 0.66) * 3), forest = Math.max(0, n1 - 0.48) * 3.2;
        spl.set([Math.max(0.05, 1 - forest - dirt - sand), forest * (1 - sand), dirt * (1 - sand), sand * 3], i * 4);
        const t = 0.92 + fbm(x * 0.03, z * 0.03) * 0.16; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = t;
      }
      geo.setAttribute("splat", new THREE.BufferAttribute(spl, 4)); geo.attributes.color.needsUpdate = true;
    }
    const detail = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, w, h); let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 2600; i++) { const v = 150 + Math.floor(r() * 105); g.fillStyle = `rgb(${v},${v},${v})`; const x = r() * w, y = r() * h; g.fillRect(x, y, 1 + r() * 2, 2 + r() * 5); }
      for (let i = 0; i < 40; i++) { const v = 120 + Math.floor(r() * 60); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.beginPath(); g.arc(r() * w, r() * h, 6 + r() * 18, 0, 6.283); g.fill(); } });
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.repeat.set(J.SIZE / 6, J.SIZE / 6); detail.anisotropy = 4;
    const uv = geo.attributes.uv; // (the plane's uv runs 0–1 across the land; the repeat tiles it every 6 m)
    const ground = new THREE.Mesh(geo, G ? groundMat(G) : new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 })); void uv; ground.receiveShadow = true; scene.add(ground);

    // the lake
    const wMat = new THREE.MeshStandardMaterial({ color: 0x24626a, roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.9, envMapIntensity: 1.3 });
    const wU = { uT: { value: 0 }, tW: { value: MODELS && MODELS.waterN }, cL: { value: new THREE.Vector2(J.LAKE.x, J.LAKE.z) }, rL: { value: J.LAKE.r + 12 } };
    if (wU.tW.value) { wMat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, wU);
      sh.vertexShader = "varying vec3 vWP;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vWP = (modelMatrix * vec4(position, 1.0)).xyz;");
      sh.fragmentShader = "uniform float uT, rL; uniform sampler2D tW; uniform vec2 cL; varying vec3 vWP;\n" + sh.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { vec3 a = texture2D(tW, vWP.xz * 0.045 + vec2(uT * 0.012, uT * 0.008)).xyz * 2.0 - 1.0, b = texture2D(tW, vWP.xz * 0.11 - vec2(uT * 0.017, -uT * 0.011)).xyz * 2.0 - 1.0; vec2 d = (a.xy + b.xy) * 0.5;
          normal = normalize(normal + (viewMatrix * vec4(d.x, 0.0, d.y, 0.0)).xyz * 0.55); }`).replace("#include <color_fragment>", `#include <color_fragment>
        { float r = length(vWP.xz - cL) / rL; diffuseColor.rgb = mix(vec3(0.07, 0.24, 0.27), diffuseColor.rgb * 1.25, smoothstep(0.35, 0.95, r)); diffuseColor.a *= mix(0.97, 0.7, smoothstep(0.6, 1.0, r)); }`); };
      wMat.customProgramCacheKey = () => "jur-water"; }
    const water = new THREE.Mesh(new THREE.CircleGeometry(J.LAKE.r + 12, 64), wMat);
    water.rotation.x = -Math.PI / 2; water.position.set(J.LAKE.x, WATER_Y, J.LAKE.z); water.receiveShadow = true; scene.add(water);

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
    // where a kind stands, as plain matrices (the cells then add each model's footing)
    const mats = (n, minGate, maxR, size, sink = 0) => { const out = []; for (let i = 0; i < n; i++) { const s0 = spotFor(minGate, maxR); if (!s0) continue; const z = size[0] + rnd() * (size[1] - size[0]); q.setFromAxisAngle(up, rnd() * 6.283); sc.set(z, z * (0.85 + rnd() * 0.3), z); p3.set(s0.x, s0.y - sink * z, s0.z); out.push(new THREE.Matrix4().compose(p3, q, sc)); } return out; };
    // the drawn trees (world-jurtrees.js): araucarias, broadleaf giants, tree ferns and cycads, two shapes of each, in cells
    let trees = null; try { trees = makeJurTrees(THREE, { low }); } catch (e) { console.warn("jurassic trees", e); }
    if (trees) { const I4 = new THREE.Matrix4(), PLAN = { araucaria: [low ? 40 : coarse ? 60 : 100, 30, 205, [0.85, 1.25]], broadleaf: [low ? 40 : coarse ? 60 : 95, 24, 175, [0.8, 1.2]], fern: [low ? 50 : coarse ? 80 : 140, 8, 165, [0.8, 1.3]], cycad: [low ? 50 : coarse ? 80 : 130, 6, 170, [0.8, 1.4]] };
      seed = 11; for (const [k, [n, gate0, maxR, size]] of Object.entries(PLAN)) trees.KINDS[k].forEach((geo) => cellsOf(scene, "tree-" + k, { geo, mat: trees.mats, base: I4 }, null, mats(Math.round(n / 2), gate0, maxR, size), { shadow: true, nearD: 999, maxD: 330 })); }
    else { seed = 11; scatter(tg, trunkM, TREES, 24, 170, [0.8, 1.6]); seed = 11; scatter(cg, leafM, TREES, 24, 170, [0.8, 1.6]); }
    // conifers in the back, nearer the ridges
    const kg = new THREE.ConeGeometry(2.2, 8, 7); kg.translate(0, 5, 0);
    seed = 23; if (!trees) scatter(kg, leaf2, low ? 90 : 170, 30, 205, [0.9, 1.8]);
    // ferns: low clumps of three tilted leaves
    const fern = new THREE.IcosahedronGeometry(0.62, 0); fern.scale(1, 0.42, 1); fern.translate(0, 0.16, 0);
    seed = 31; if (!(MODELS && MODELS["fern-01"])) scatter(fern, new THREE.MeshStandardMaterial({ color: 0x5f9636, roughness: 0.9, flatShading: true }), low ? 500 : coarse ? 900 : 1600, 6, 160, [0.7, 1.5]);
    // grass tufts: thin blades in small clumps, thickest around the gate where the camera looks down
    const tuft = new THREE.ConeGeometry(0.035, 0.42, 3, 1, true); tuft.translate(0, 0.19, 0);
    seed = 37; if (!MODELS || !MODELS.ground) scatter(tuft, new THREE.MeshStandardMaterial({ color: 0x5f8f35, roughness: 1, side: THREE.DoubleSide }), low ? 1500 : coarse ? 3000 : 5000, 2.5, 70, [0.8, 1.6]);
    // boulders
    const NEAR_D = coarse ? 50 : 70;
    const rock = unit(MODELS && MODELS.rock);
    if (rock) { seed = 41; cellsOf(scene, "rock", rock, farOf(rock, MODELS.rock1), mats(low ? 40 : 70, 10, 190, [1.4, 4.2], 0.12), { shadow: true, nearD: NEAR_D }); }
    else { const rg = new THREE.DodecahedronGeometry(1, 0); rg.scale(1.2, 0.8, 1); seed = 41; scatter(rg, new THREE.MeshStandardMaterial({ color: 0x86827a, roughness: 1, flatShading: true }), low ? 50 : 90, 10, 190, [0.6, 2.4], 0.25); }
    // palms round the lake's shore (the model is ~8.6K triangles, so a ring of them, not a forest)
    const palm = unit(MODELS && MODELS.palm);
    if (palm) { const n = low || coarse ? 14 : 26, list = []; seed = 53;
      for (let i = 0; i < n * 3 && list.length < n; i++) { const a = rnd() * Math.PI * 2, r = J.LAKE.r + 6 + rnd() * 10, x = J.LAKE.x + Math.cos(a) * r, z = J.LAKE.z + Math.sin(a) * r, y = height(x, z);
        if (y < WATER_Y + 0.3) continue; const w = 4 + rnd() * 2.5; q.setFromAxisAngle(up, rnd() * 6.283); sc.set(w, w * (0.9 + rnd() * 0.25), w); p3.set(x, y - 0.1, z); list.push(new THREE.Matrix4().compose(p3, q, sc)); }
      cellsOf(scene, "palm", palm, farOf(palm, MODELS.palm1), list, { shadow: true, nearD: NEAR_D }); }
    // the ancient giants (the model is ~17K triangles): a few landmarks along the view from the gate; the forest behind
    // them stays the light drawn trees
    const anc = unit(MODELS && MODELS.ancient);
    if (anc) { const spots = [[-24, 14, 13], [24, 18, 11], [-58, -40, 16], [12, -72, 18], [-92, 8, 15], [92, 34, 14], [-34, -128, 17], [44, -138, 16]].slice(0, low || coarse ? 5 : 8);
      seed = 61; const list = spots.map(([x, z, w]) => { q.setFromAxisAngle(up, rnd() * 6.283); sc.set(w, w * (0.95 + rnd() * 0.2), w); p3.set(x, height(x, z) - 0.3, z); return new THREE.Matrix4().compose(p3, q, sc); });
      cellsOf(scene, "ancient", anc, farOf(anc, MODELS.ancient1), list, { shadow: true, nearD: NEAR_D + 20 }); }
    // the old ruins: a great gate on the far shore of the lake, and two smaller ones along the plain
    const ruin = unit(MODELS && MODELS.ruins);
    if (ruin) cellsOf(scene, "ruins", ruin, farOf(ruin, MODELS.ruins1), [[J.LAKE.x + 8, J.LAKE.z - J.LAKE.r - 16, 14, 0.4], [-48, -20, 8, -0.9], [-20, -110, 10, 0.2]].map(([x, z, w, ry]) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, height(x, z) - 0.25, z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(w, w, w))), { shadow: true, nearD: NEAR_D + 20 });
    // the owner's nature props (ferns, bushes, flowers, logs: vertex-coloured, joined to one mesh each): thick round the
    // gate, the paths and the lake; in 80 m cells, drawn only near (they're the ground's detail, not the view)
    const natMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const NAT = { fern: [low ? 70 : coarse ? 110 : 190, [1.2, 2.4]], bush: [low ? 45 : coarse ? 70 : 120, [1.4, 2.8]], flowers: [low ? 50 : coarse ? 80 : 140, [0.5, 1.0]], log: [low ? 10 : 18, [2.6, 4.6]] };
    seed = 83;
    for (const [kind, [n, size]] of Object.entries(NAT)) for (let v = 1; v <= 3; v++) {
      const o = MODELS && MODELS[kind + "-0" + v]; if (!o) continue;
      const u = unit(o); if (!u) continue; if (!u.geo.attributes.normal) u.geo.computeVertexNormals();
      cellsOf(scene, kind, { ...u, mat: natMat }, null, mats(Math.round(n / 3), 4, 175, size, kind === "log" ? 0.08 : 0), { shadow: kind === "log", nearD: 999, maxD: coarse ? 55 : 80 });
    }

    // the gate home: the same stone gate as in town (world-jurgate.js)
    const gate = ctx.makeGate ? ctx.makeGate(T("Back to the village")) : ctx.K.makePortal(T("Back to the village")); gate.position.set(J.GATE.x, height(J.GATE.x, J.GATE.z), J.GATE.z); gate.rotation.y = 0; scene.add(gate);
    seed = 71; makeRaptors(scene, rnd); makeHerd(scene); makeAlpha(scene); makeTrikes(scene); makeSentinel(scene);
    raptors.forEach((r) => { r.lod = lodMeshes(r.g); }); herd.forEach((h) => { h.lod = lodMeshes(h.g); }); trikes.forEach((r) => { r.lod = lodMeshes(r.g); }); if (alpha) alpha.lod = lodMeshes(alpha.g);
    if (shadows) { const cast = (g) => g && g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); raptors.forEach((r) => cast(r.g)); herd.forEach((h) => cast(h.g)); trikes.forEach((r) => cast(r.g)); if (alpha) cast(alpha.g); if (sentinel) cast(sentinel.g); cast(gate); }
    // a soft glow on the light (the town's bloom, gentler), where the device has bloom on
    let comp = null;
    if (!low && st.quality && st.quality.bloom && ctx.K.POSTFX) { try { const P = ctx.K.POSTFX; comp = new P.EffectComposer(st.renderer); comp.addPass(new P.RenderPass(scene, cam)); const bl = new P.UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.4, 0.92); bl.heavy = true; comp.addPass(bl); comp.addPass(new P.OutputPass()); } catch (e) { console.warn("jurassic bloom", e); comp = null; } }
    const grass = MODELS && MODELS.ground ? makeGrass(scene) : null, air = makeAir(scene);
    S = { scene, cam, gate, sun, shadows, comp, wU, grass, air, trees, spin: gate.userData.spin || [] };
    tickCells(0, true);
  }

  async function makeHero() {
    if (hero) { S.scene.add(hero.obj); if (S.shadows) hero.obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return; }
    try { hero = await ctx.makeHero(); } catch { hero = null; }
    if (hero) { S.scene.add(hero.obj); if (S.shadows) hero.obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); }
  }

  // ---------------- the HUD: leave, the title, a stick and the way home ----------------
  function buildUi() {
    const root = document.createElement("div"); root.id = "wp-jur"; root.className = "wz"; root.hidden = true;
    root.innerHTML = `<div class="wz-top" data-game-hud><button type="button" class="wz-leave"><svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8"/></svg><span>${esc(T("Village"))}</span></button>
        <div class="wz-name"><b>${esc(T("Jurassic World"))}</b><small>${esc(T("Primeval Plains · GM preview"))}</small></div>
        <div class="wz-note">${esc(T("A first look at the land. More dinosaurs, hunting and rewards come next."))}</div></div>
      <div class="wz-stick" aria-hidden="true"><i></i></div>
      <button type="button" class="wz-jump" aria-label="${esc(T("Jump"))}"><svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg></button>
      <button type="button" class="wz-home" hidden>${esc(T("Back to the village"))}</button>
      <div class="wz-keys">${esc(T("WASD move · Shift run · Space jump · drag to look · Esc leave"))}</div>
      <div class="wz-title" hidden><small>ARCIRCLE WORLD</small><b>JURASSIC WORLD</b><span>${esc(T("Primeval Plains"))}</span></div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    ui = { root, stick: q(".wz-stick"), knob: q(".wz-stick i"), home: q(".wz-home"), title: q(".wz-title") };
    q(".wz-leave").addEventListener("click", () => leave());
    ui.home.addEventListener("click", () => leave());
    q(".wz-jump").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); jumpQ = true; });
    // touch: the left half moves (a stick where the thumb lands), the rest of the screen looks around
    root.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      if (e.pointerType !== "mouse" && e.clientX < innerWidth * 0.45 && stick.id < 0) { stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; ui.stick.style.left = e.clientX + "px"; ui.stick.style.top = e.clientY + "px"; ui.stick.classList.add("on"); }
      else if (look.id < 0) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
      else if (e.pointerType !== "mouse" && pinch.a < 0) { pinch.a = look.id; pinch.b = e.pointerId; }
      pinch.pts.set(e.pointerId, [e.clientX, e.clientY]); if (pinch.a >= 0 && pinch.pts.has(pinch.a) && pinch.pts.has(pinch.b)) { const [a, b] = [pinch.pts.get(pinch.a), pinch.pts.get(pinch.b)]; pinch.d = Math.hypot(a[0] - b[0], a[1] - b[1]); }
      try { root.setPointerCapture(e.pointerId); } catch { /* fine */ }
    });
    root.addEventListener("pointermove", (e) => {
      if (e.pointerId === stick.id) { const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, l = Math.hypot(dx, dy), m = Math.min(1, l / 55); stick.x = l ? dx / l * m : 0; stick.y = l ? dy / l * m : 0; ui.knob.style.transform = `translate(${stick.x * 34}px,${stick.y * 34}px)`; }
      if (pinch.pts.has(e.pointerId)) pinch.pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch.a >= 0 && (e.pointerId === pinch.a || e.pointerId === pinch.b) && pinch.pts.has(pinch.a) && pinch.pts.has(pinch.b)) {
        // two fingers: pinch zooms (the town's 0.6–1.9)
        const [a, b] = [pinch.pts.get(pinch.a), pinch.pts.get(pinch.b)], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch.d > 0) camGoal = Math.max(0.6, Math.min(1.9, camGoal * pinch.d / Math.max(1, d))); pinch.d = d; return;
      }
      if (e.pointerId === look.id) { camYaw -= (e.clientX - look.x) * 0.006; camPitch = Math.max(-0.3, Math.min(0.75, camPitch + (e.clientY - look.y) * 0.004)); look.x = e.clientX; look.y = e.clientY; }
    });
    const up = (e) => { pinch.pts.delete(e.pointerId); if (e.pointerId === pinch.a || e.pointerId === pinch.b) { pinch.a = pinch.b = -1; pinch.d = 0; } if (e.pointerId === stick.id) { stick.id = -1; stick.x = stick.y = 0; ui.knob.style.transform = ""; ui.stick.classList.remove("on"); } if (e.pointerId === look.id) look.id = -1; };
    root.addEventListener("pointerup", up); root.addEventListener("pointercancel", up);
    root.addEventListener("wheel", (e) => { camGoal = Math.max(0.6, Math.min(1.9, camGoal * (e.deltaY > 0 ? 1.1 : 0.91))); }, { passive: true });
  }
  const kd = (e) => { if (!on) return; if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); leave(); return; } const k = e.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", " "].includes(k)) { keys.add(k); e.preventDefault(); e.stopPropagation(); } else if (k === "e" && nearGate) { e.preventDefault(); e.stopPropagation(); leave(); } if (k === " " && !e.repeat) jumpQ = true; };
  const ku = (e) => { keys.delete(e.key.toLowerCase()); };

  // ---------------- a frame ----------------
  let animNow = "";
  // the town's clip names (world-kit CU_AS / KK_AS): idle, walk, sprint, jump, fall; the walk keeps pace with the feet
  const anim = (n, sp) => { if (!hero || !hero.play) return; if (n === animNow) { if (sp && hero.mixer && hero.mixer._actions) for (const a of hero.mixer._actions) if (a.isRunning() && a.getEffectiveWeight() > 0.5) a.timeScale = sp; return; } animNow = n; hero.play(n, { speed: sp || 1, fade: 0.2 }); };
  let frames = 0;
  function tick(dt, t) {
    if (!S) return; dt = Math.min(dt, 0.05); frames++;
    let ix = stick.x, iz = stick.y;
    if (keys.has("a") || keys.has("arrowleft")) ix -= 1; if (keys.has("d") || keys.has("arrowright")) ix += 1;
    if (keys.has("w") || keys.has("arrowup")) iz -= 1; if (keys.has("s") || keys.has("arrowdown")) iz += 1;
    const il = Math.hypot(ix, iz), run = keys.has("shift") || il > 0.92 && stick.id >= 0;
    const target = il > 0.08 ? (run ? 12.5 : 6.5) * Math.min(1, il) : 0; speed += (target - speed) * Math.min(1, dt * 8);
    if (il > 0.08) {
      // the stick is read from the camera: up is away from it
      const fx = Math.sin(camYaw + Math.PI), fz = Math.cos(camYaw + Math.PI), rx = -fz, rz = fx;
      const mx = (fx * -iz + rx * ix) / il, mz = (fz * -iz + rz * ix) / il;
      const want = Math.atan2(mx, mz); let d = want - face; d = Math.atan2(Math.sin(d), Math.cos(d)); face += d * Math.min(1, dt * 10);
      const nx = px + mx * speed * dt, nz = pz + mz * speed * dt;
      if (Math.hypot(nx, nz) < J.EDGE && height(nx, nz) > WATER_Y - 0.6) { px = nx; pz = nz; }
    }
    const py = height(px, pz);
    // the jump: the town's numbers (9 m/s up, 24 m/s² down)
    if (jumpQ) { jumpQ = false; if (grounded) { vy = 9; grounded = false; animNow = "jump"; if (hero && hero.play) hero.play("jump", { once: true, fade: 0.08 }); } }
    if (!grounded) { vy -= 24 * dt; hop += vy * dt; if (hop <= 0) { hop = 0; vy = 0; grounded = true; animNow = ""; if (hero && hero.land) hero.land(0.5); } }
    if (hero) {
      hero.obj.position.set(px, py + hop, pz); hero.obj.rotation.y = face;
      if (hero.bot) hero.update(dt, t, Math.min(1, speed / 8), 0);
      else {
        if (hero.update) hero.update(dt, t);
        if (!grounded) { if (vy < 0 && !(hero.busy && hero.busy())) anim("fall"); }
        else if (!(hero.busy && hero.busy()) || speed > 0.6) anim(speed > 9 ? "sprint" : speed > 0.6 ? "walk" : "idle", speed > 9 ? 1 : speed > 0.6 ? Math.max(0.8, speed / 6.5) : 1);
      }
    }
    // the camera, as in town (world-play.js): 5.2 m up (more as you look down) and 9.6 m back, times the zoom; it looks
    // 2.6 m ahead of the hero and follows a touch behind; running widens the view
    camDist += (camGoal - camDist) * (1 - Math.exp(-dt * 10));
    const bh = (5.2 + camPitch * 6) * camDist, bk = 9.6 * camDist;
    camPos.set(px + Math.sin(camYaw) * bk, py + bh + hop * 0.6, pz + Math.cos(camYaw) * bk);
    camPos.y = Math.max(camPos.y, Math.max(height(camPos.x, camPos.z), WATER_Y) + 0.6);
    camLook.set(px - Math.sin(camYaw) * 2.6, py + 1.4 + hop * 0.5, pz - Math.cos(camYaw) * 2.6);
    if (!camInit) { S.cam.position.copy(camPos); camLookS.copy(camLook); camInit = true; }
    S.cam.position.lerp(camPos, 1 - Math.exp(-dt * 10)); camLookS.lerp(camLook, 1 - Math.exp(-dt * 14)); S.cam.lookAt(camLookS);
    const fov = 55 + THREE.MathUtils.smoothstep(speed, 2, 22) * 11; if (Math.abs(S.cam.fov - fov) > 0.05) { S.cam.fov += (fov - S.cam.fov) * (1 - Math.exp(-dt * (fov > S.cam.fov ? 6 : 3))); S.cam.updateProjectionMatrix(); }
    // the sun's shadow box follows the hero
    if (S.shadows) { S.sun.target.position.set(px, py, pz); S.sun.position.set(px - 60, py + 80, pz + 40); }
    tickCells(dt);
    for (const f of S.spin) f(dt, t);
    S.wU.uT.value = t; if (S.grass) S.grass.tick(t); S.air.tick(dt, t); if (S.trees) S.trees.tick(t);
    tickRaptors(dt, t); tickHerd(dt, t); tickAlpha(dt, t); tickTrikes(dt, t); tickSentinel(dt, t);
    const g = Math.hypot(px - J.GATE.x, pz - J.GATE.z) < 4.2; if (g !== nearGate) { nearGate = g; ui.home.hidden = !g; }
  }

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; busy = true;
    try {
      if (!S) { await loadModels(); build(); } if (!ui) buildUi();
      await makeHero(); animNow = "";
      px = J.SPAWN.x; pz = J.SPAWN.z; face = Math.PI; camYaw = 0; camPitch = 0.05; camDist = camGoal = coarse ? 1.7 : 1; camInit = false; speed = 0; hop = 0; vy = 0; grounded = true; jumpQ = false; nearGate = false; ui.home.hidden = true; keys.clear();
      try { if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), new Promise((ok) => setTimeout(ok, 2500))]); } catch { /* compiled on the first frame */ }
      st.view(S.scene, S.cam, S.comp || null); st.solo(tick); on = true;
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
  return { enter, leave, active: () => on, jump: () => { jumpQ = true; }, debug: () => ({ cam: S ? [...S.cam.position.toArray().map((v) => +v.toFixed(2)), +S.cam.fov.toFixed(1), camDist, camPitch] : null, px, pz, speed, hop, grounded, anim: animNow, hero: hero ? (hero.bot ? "bot" : hero.custom ? "custom" : "kk") : null, clips: hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.3).map((a) => a.getClip().name + "@" + a.timeScale.toFixed(2)) : [], nearGate, h: height(px, pz), frames, keys: [...keys], raptors: raptors.map((r) => ({ x: Math.round(r.x), z: Math.round(r.z), s: r.state })), alpha: alpha && { x: Math.round(alpha.x), z: Math.round(alpha.z), s: alpha.state }, herd: herd.length, sentinel: sentinel ? { roaring: !!sentinel.R.one } : null, clipsR: raptors[0] ? raptors.map((r) => r.R.cur && r.R.cur.getClip().name) : null, clipsT: trikes[0] ? trikes.map((r) => r.R.cur && r.R.cur.getClip().name) : null, trikes: trikes.map((r) => r.state) }), walk: (x, z, yaw) => { px = x; pz = z; if (yaw != null) { camYaw = yaw; face = yaw + Math.PI; } } };
}
