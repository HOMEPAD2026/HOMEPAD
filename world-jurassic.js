// world-jurassic.js — Jurassic World: a separate prehistoric land behind the Jurassic Portal in town (world-play.js),
// open to everyone (guests look round; gathering, crafting and a camp need a signed-in wallet).
// The plan (ARCIRCLE WORLD JURASSIC design doc v1.0): six biomes, realistic dinosaurs, hunting, crafting, eggs, raids.
// This first step is the Primeval Plains on their own: rolling ground, a lake, forest and ferns, far ridges in the haze,
// the hero walking it, and the gate home. Dinosaurs arrive with their GLB files (models/world/jurassic, the doc's list).
// It draws its own scene through the stage's view() while the town waits behind it, like the ARCL Mine.
import { makeJurTrees } from "./world-jurtrees.js";
import { createSurvival, CAMPS, CAMP_R } from "./world-jursurv.js";
import { createDino } from "./world-dino.js";
import { createJurX } from "./world-jurx.js";
// BASIN (b-jx3): the Ember Basin, the second land — a volcanic bowl in the south-east with lava at its floor
export const JURASSIC = { SIZE: 520, EDGE: 230, SPAWN: { x: 0, z: 42 }, GATE: { x: 0, z: 66 }, LAKE: { x: 55, z: -35, r: 34 }, BASIN: { x: 120, z: -82, r: 30 } };

export function createJurassic(ctx) {
  const { THREE, st, T, esc, toast } = ctx;
  const low = !!ctx.low, reduce = !!ctx.reduce, coarse = !!ctx.coarse;
  // b-jur2 (the community: "more trees and rocks, longer grass, more real"): how much more of the land's growth a device
  // draws — a computer 1.6×, a phone 1.25×, the low setting as before
  const MORE = low ? 1 : coarse ? 1.25 : 1.6;
  const J = JURASSIC;
  const Snd = ctx.Snd || {}; let shakeT = 0, stopUntil = 0; // stopUntil: a hit-stop (b-fx2), the world nearly still for a few ms
  let S = null, ui = null, hero = null, on = false, busy = false, surv = null, dino = null, jx = null, raidNow = false;
  let downNow = false, hop = 0, vy = 0, grounded = true, jumpQ = false, px = J.SPAWN.x, pz = J.SPAWN.z, face = Math.PI, camYaw = Math.PI, camPitch = 0.05, camDist = 1, camGoal = 1, camInit = false, speed = 0, nearGate = false, introT = 0;
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
    const dl = Math.hypot(x - J.LAKE.x, z - J.LAKE.z); if (dl < J.LAKE.r + 9) h -= Math.max(0, 1 - dl / (J.LAKE.r + 9)) ** 0.9 * 7; // the lake's bowl
    const r = Math.hypot(x, z); if (r > 150) h += ((r - 150) / 80) ** 2 * 26 * (0.6 + fbm(x * 0.02, z * 0.02)); // the ridges that close the plain
    // the Ember Basin: a rim of rock round a bowl that sinks to its lava (b-jx3)
    const u = Math.hypot(x - J.BASIN.x, z - J.BASIN.z) / J.BASIN.r;
    if (u < 1.7) { const keep = Math.min(1, Math.max(0, (u - 1.05) / 0.6)); h = h * keep + (1 - keep) * 2 + 3.4 * Math.max(0, 1 - Math.abs(u - 1.08) / 0.32) - (u < 1 ? 6 * (1 - u * u) : 0) + (u < 1 ? (fbm(x * 0.15, z * 0.15) - 0.5) * 1.6 : 0); }
    return h;
  }
  const WATER_Y = -2.4;
  // the lake's water (the low hollows elsewhere are dry sand: you run on them as on grass)
  const inLake = (x, z) => Math.hypot(x - J.LAKE.x, z - J.LAKE.z) < J.LAKE.r + 11;
  const nearBasin = (x, z, k = 1.25) => Math.hypot(x - J.BASIN.x, z - J.BASIN.z) < J.BASIN.r * k;

  // ---------------- the models (Meshy, packed by tools/pack-prop.mjs; models/world/jurassic): a mossy boulder and the
  // ruins gate. Loaded before the first visit; when they fail or are slow, the drawn stand-ins are used.
  let MODELS = null;
  const NATURE = ["fern-01", "fern-02", "fern-03", "bush-01", "bush-02", "bush-03", "flowers-01", "flowers-02", "flowers-03", "log-01", "log-02", "log-03"];
  async function loadModels() {
    if (MODELS) return;
    const L = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null, ver = ctx.ver || "";
    const get = (f) => (L ? L.loadAsync("models/world/jurassic/" + f + ".glb" + ver) : Promise.reject(new Error("no loader")));
    // [key, file, whole gltf (rigged, with its clips) or just the scene]
    const LIST = [["rock", "rock-boulder"], ["ruins", "ruins-gate"], ["palm", "tree-palm"], ["ancient", "tree-ancient"], ["raptor8", "dino-raptor-8", 1], ["trike8", "dino-triceratops-8", 1], ["brachio8", "dino-brachio-8", 1], ["alpha8", "boss-alpha-raptor-8", 1], ["spino", "dino-spino", 1], ["titan", "dino-titan", 1], ["bird", "dino-bird", 1], ["claw", "dino-claw", 1],
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
  const CELL = 80, cells = [], nodes = [], fallers = [];
  // opts.node: what the server calls it (tree, rock …): each instance becomes a node you can chop or mine (world-jursurv.js),
  // id = name:index (the land is the same every visit), cr × its size = the trunk you bump into, hr × its size = its reach
  function cellsOf(scene, kind, near, far, mats, opts = {}) {
    const by = new Map();
    mats.forEach((m, gi) => { const e = m.elements, cx = Math.floor(e[12] / CELL), cz = Math.floor(e[14] / CELL), k = cx + "," + cz; if (!by.has(k)) by.set(k, { cx, cz, list: [] }); by.get(k).list.push({ m, gi }); });
    const Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { cx, cz, list } of by.values()) {
      const mk = (u, mat) => { const im = new THREE.InstancedMesh(u.geo, mat, list.length); list.forEach(({ m }, i) => im.setMatrixAt(i, m.clone().multiply(u.base))); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox && im.computeBoundingBox(); scene.add(im); return im; };
      const n = mk(near, near.mat); n.castShadow = !!opts.shadow; n.receiveShadow = !!opts.shadow;
      const f = far ? mk(far, near.mat) : null; if (f) f.visible = false;
      cells.push({ kind, x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, near: n, far: f, nearD: opts.nearD || 70, maxD: opts.maxD || 330 });
      if (opts.node) list.forEach(({ m, gi }, i) => { const e = m.elements, sz = Math.hypot(e[0], e[1], e[2]), keep = [[n, m.clone().multiply(near.base)], ...(f ? [[f, m.clone().multiply(far.base)]] : [])];
        const set = (on) => { for (const [im, mm] of keep) { im.setMatrixAt(i, on ? mm : Z); im.instanceMatrix.needsUpdate = true; } };
        // b-jx4: a tree comes down: it tips over from its foot for a second, then it's gone
        const fall = () => { if (reduce) { set(false); return; } const a0 = Math.random() * 6.283, ax = new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0)), P = new THREE.Vector3(e[12], e[13], e[14]), R4 = new THREE.Matrix4(), T1 = new THREE.Matrix4().makeTranslation(P.x, P.y, P.z), T2 = new THREE.Matrix4().makeTranslation(-P.x, -P.y, -P.z);
          fallers.push({ t: 0, step: (k) => { const ang = Math.min(1.45, k * k * 1.6); R4.makeRotationAxis(ax, ang); const W4 = T1.clone().multiply(R4).multiply(T2); for (const [im, mm] of keep) { im.setMatrixAt(i, W4.clone().multiply(mm)); im.instanceMatrix.needsUpdate = true; } }, done: () => { set(false); if (jx) jx.felled({ x: P.x + ax.z * 3, z: P.z - ax.x * 3 }); } }); };
        nodes.push({ id: kind + ":" + gi, kind: opts.node, x: e[12], z: e[14], cr: (opts.cr || 0) * sz, hr: Math.max(0.5, (opts.hr || 0.4) * sz), popY: opts.popY ? opts.popY * sz : 2.2, hide: () => set(false), show: () => set(true), fall: opts.node === "tree" || opts.node === "ancient" || opts.node === "palm" ? fall : null }); });
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

  // ---------------- the dinosaurs you can hunt (world-jursurv.js swings at them; the server says how many hits) ----------
  // Each is a target: id, kind (the server's), hr (its reach), alive, hurt(), die(), revive(). They bite back: a bite is
  // a share of your max HP (the town's knock-out rules then, world-combat.js). Round the gate and your camp you're safe.
  let clock = 0, sel = null;
  const selectFoe = (o) => { sel = o; if (surv) surv.select(o); };
  // safe: by the gate always; in a camp by day, or at night when that camp has a campfire
  const safeHere = () => downNow || Math.hypot(px - J.SPAWN.x, pz - J.SPAWN.z) < 26 || (!raidNow && CAMPS.some(([cx, cz], i) => Math.hypot(px - cx, pz - cz) < CAMP_R + 2 && (!night || (surv && surv.campFire(i)))));
  // a fishing spot (b-jx3): at the lake's edge, facing the water, a point a few metres out (12 spots round the shore)
  function fishSpot(x, z, f) {
    const L = J.LAKE, d = Math.hypot(x - L.x, z - L.z); if (d < L.r - 6 || d > L.r + 10) return null;
    const fx = x + Math.sin(f) * 2.4, fz = z + Math.cos(f) * 2.4; /* (within reach: a swing reaches hr + 1.7 = 3.1 m) */ if (height(fx, fz) > WATER_Y - 0.2) return null;
    const k = Math.round(((Math.atan2(z - L.z, x - L.x) + Math.PI) / (2 * Math.PI)) * 12) % 12; return { id: "fish:" + k, kind: "fish", x: fx, z: fz, hr: 1.4, popY: 1.2 };
  }
  // night raiders (b-jx2): raptors from the pool, sent at your camp; gone again when the raid ends
  function spawnRaider(x, z, id, home) {
    if (!(MODELS && MODELS.raptor8 && ctx.K.skelClone)) return null; const R = rig(MODELS.raptor8, 3.8 + Math.random() * 0.6); S.scene.add(R.g); R.loop("run");
    const o = dinoize({ g: R.g, R, mixer: R.mixer, hx: home.x, hz: home.z, x, z, face: Math.atan2(home.x - x, home.z - z), tx: home.x, tz: home.z, sp: 6, wait: 0, state: "chase", roarAt: 0, run: 8.4, bite: 0.07, aggro: 99, raid: true }, "raptor", id, 1.3, 2, { x: home.x, z: home.z });
    o.lod = lodMeshes(o.g); if (S.shadows) R.g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); raptors.push(o); return o;
  }
  function removeRaider(o) { const i = raptors.indexOf(o); if (i >= 0) raptors.splice(i, 1); if (S && o.g) S.scene.remove(o.g); if (sel === o) selectFoe(null); }
  function dinoize(o, kind, id, hr, popY, home) {
    Object.assign(o, { id, kind, hr, popY, alive: true, angry: 0, biteAt: 0, cool: 0, home });
    o.hurt = () => { o.angry = clock + 12; o.R.once("hit", 1.2); };
    o.die = (silent) => { if (!o.alive) return; o.alive = false; o.diedAt = Date.now(); o.deadT = clock - (silent ? 99 : 0); o.sp = 0; o.R.die(); if (!silent && Snd.growl) Snd.growl(kind === "raptor" ? 0 : 1); };
    o.revive = () => { o.alive = true; o.angry = 0; o.x = home.x; o.z = home.z; o.sp = 0; o.state = "idle"; o.wait = 2; o.R.revive(); o.g.visible = true; };
    return o;
  }
  // a bite (or a claw, a tail, a horn) lands a moment into its attack clip, if you're still in reach
  // an attack: it lunges at you as the clip starts (no more standing still to bite), the hit lands a moment in
  function attack(o, clipName, share, reach, cool) {
    if (clock < o.cool || o.R.one) return; if (!o.R.once(clipName, 1.15)) o.R.once("attack", 1.15);
    o.cool = clock + cool; o.biteAt = clock + 0.36; o.biteK = share; o.biteR = reach; o.lungeT = 0.34; o.lungeV = Math.max(7, (o.run || 6) * 1.35); if (jx) jx.tele(o);
    if (!sel || !sel.alive) selectFoe(o);
  }
  // during the lunge it's thrown forward at you (and steered on), stopping at your feet
  function lunge(o, dt) {
    if (!(o.lungeT > 0)) return; o.lungeT -= dt; const d = Math.hypot(px - o.x, pz - o.z); if (d < (o.hr || 1.5) + 0.9) { o.lungeT = 0; return; }
    steer(o, px, pz, dt, 8); o.sp = Math.max(o.sp, o.lungeV);
  }
  // the hit: your HP (a share of your max), you're knocked back and the screen shakes; a raptor then backs off and
  // circles before it comes in again
  function bites(o) {
    if (!o.biteAt || clock < o.biteAt) return; o.biteAt = 0; if (downNow || !o.alive) return;
    if (o.vsBuddyUntil > clock && dino && dino.near(o)) { dino.hurt(o.biteK); o.retreatUntil = clock + 0.7 + Math.random() * 0.7; o.side = Math.random() < 0.5 ? -1 : 1; return; }
    const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz); if (d > o.biteR + 0.9) return;
    const v = ctx.vitals ? ctx.vitals() : null, arm = surv && surv.tools && surv.tools().armor ? 0.75 : 1, n = Math.max(1, Math.round(((v && v.max) || 120) * o.biteK * arm)); // (hide armour: a quarter less, b-jx3)
    if (ctx.hurt) ctx.hurt(n); if (Snd.bite) Snd.bite(); shakeT = 0.3 + o.biteK;
    const k = (o.kind === "titan" || o.kind === "trike" ? 9 : o.kind === "spino" || o.kind === "alpha" ? 7 : 5) / Math.max(0.5, d); kbX = dx * k; kbZ = dz * k; kbT = 0.18;
    if (hero && hero.hurt) try { hero.hurt(); } catch { /* no flash */ }
    o.retreatUntil = clock + 0.7 + Math.random() * 0.7; o.side = Math.random() < 0.5 ? -1 : 1;
  }
  // after death: lying there a few seconds, then gone until it's back
  function deadTick(o, dt) { if (o.alive) return false; mixUp(o, o.mixer, dt, o.x, o.z); if (clock - o.deadT > 6) o.g.visible = false; return true; }
  const steer = (o, tx, tz, dt, turn) => { const a = Math.atan2(tx - o.x, tz - o.z); let da = a - o.face; da = Math.atan2(Math.sin(da), Math.cos(da)); o.face += da * Math.min(1, dt * turn); return da; };

  // ---------------- the raptors (the owner's 8-clip prototype: Idle, Walk, Run, Roar, two attacks, Hit, Death) ----------
  // They wander their part of the plain; come within 15 m (outside the safe ground by the gate) and they come for you,
  // faster than you walk, slower than you run; within 2.4 m they bite. They give up past 30 m or far from home.
  const raptors = [];
  function makeRaptors(scene, rnd) {
    if (!(MODELS && MODELS.raptor8 && MODELS.raptor8.animations && ctx.K.skelClone)) return;
    {
      const homes = [[-40, -10], [-55, -70], [20, -95], [95, -10], [-95, -40], [60, 40]].slice(0, low || coarse ? 4 : 6);
      homes.forEach(([hx, hz], i) => { const R = rig(MODELS.raptor8, 3.8 + rnd() * 0.8); scene.add(R.g); R.loop("idle");
        raptors.push(dinoize({ g: R.g, R, mixer: R.mixer, hx, hz, x: hx + (rnd() - 0.5) * 10, z: hz + (rnd() - 0.5) * 10, face: rnd() * 6.28, tx: hx, tz: hz, sp: 0, wait: rnd() * 3, state: "idle", roarAt: 0, run: 8.2, bite: 0.07, aggro: 15 }, "raptor", "raptor:" + i, 1.3, 2, { x: hx, z: hz })); });
    }
    // the Clawstriders (the owner's Meshy Clawstrider: bite, claw, leap and tail attacks): a pack of three in the east
    // woods, bigger and quicker than the raptors (you outrun them only flat out), hitting harder
    if (MODELS.claw && MODELS.claw.animations) [[128, -52], [134, -44], [122, -40]].slice(0, low ? 2 : 3).forEach(([hx, hz], i) => { const R = rig(MODELS.claw, 5 + rnd() * 0.6); scene.add(R.g); R.loop("idle");
      raptors.push(dinoize({ g: R.g, R, mixer: R.mixer, hx, hz, x: hx, z: hz, face: rnd() * 6.28, tx: hx, tz: hz, sp: 0, wait: 1 + rnd() * 3, state: "idle", roarAt: 0, run: 10.5, bite: 0.09, aggro: 18, noLook: true }, "claw", "claw:" + i, 1.6, 2.4, { x: hx, z: hz })); });
  }
  function tickRaptors(dt, t) {
    for (const r of raptors) {
      if (deadTick(r, dt)) continue;
      const dx = px - r.x, dz = pz - r.z, d = Math.hypot(dx, dz), home = Math.hypot(r.x - r.hx, r.z - r.hz), safe = safeHere();
      let want = 0;
      if (r.raid && r.state !== "chase" && !downNow) r.state = "chase"; // (a night raider comes straight for you)
      if (r.state !== "chase" && !safe && (d < r.aggro * (night ? 1.7 : 1) || (r.angry > clock && d < 30))) { r.state = "chase"; if (Snd.growl && d < 40) Snd.growl(r.kind === "claw" ? 1 : 0); }
      else if (r.state === "chase" && !r.raid && (safe || d > (night ? 42 : 30) || home > (night ? 90 : 60))) { r.state = "back"; r.tx = r.hx; r.tz = r.hz; }
      r.lookAt = null;
      if (r.state === "chase" && clock < (r.retreatUntil || 0)) { const a = Math.atan2(r.x - px, r.z - pz) + r.side * 0.9; steer(r, px + Math.sin(a) * 6, pz + Math.cos(a) * 6, dt, 6); want = r.run * 0.6; }
      else if (r.state === "chase") { const da = steer(r, px, pz, dt, 6); r.lookAt = da; want = d > r.hr + 1.1 ? r.run : 0; if (d < r.hr + 1.6) attack(r, r.kind === "claw" ? ["attack_bite", "attack_claw", "attack_leap", "attack_tail"][Math.floor(Math.random() * 4)] : "attack", r.bite, 3, 1.5); }
      else if (r.state === "stare" || (r.state === "walk" && d < 22)) { const a = Math.atan2(dx, dz); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.lookAt = da; }
      if (r.state === "idle") { r.wait -= dt; if (r.wait <= 0) { const a = Math.random() * 6.283, rr = 6 + Math.random() * 18; r.tx = r.hx + Math.cos(a) * rr; r.tz = r.hz + Math.sin(a) * rr; r.state = "walk"; } }
      if (r.state === "walk" || r.state === "back") {
        const ed = Math.hypot(r.tx - r.x, r.tz - r.z);
        if (ed < 1.2) { r.state = "idle"; r.wait = 2 + Math.random() * 4; } else { want = r.state === "back" ? 5 : 2.6; steer(r, r.tx, r.tz, dt, 4); }
      }
      r.sp += (want - r.sp) * Math.min(1, dt * 4); lunge(r, dt);
      if (r.sp > 0.05) { const nx = r.x + Math.sin(r.face) * r.sp * dt, nz = r.z + Math.cos(r.face) * r.sp * dt;
        if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 5 && Math.hypot(nx - J.SPAWN.x, nz - J.SPAWN.z) > 20) { r.x = nx; r.z = nz; } else if (r.state !== "chase") { r.state = "idle"; r.wait = 1; r.sp = 0; } }
      bites(r);
      if (r.state === "chase" && t > r.roarAt && d > 6) { if (r.R.once("roar", 1)) r.roarAt = t + 7 + Math.random() * 5; }
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
    R.loop = (n, speed = 1) => { if (R.dead) return; if (R.one) { R.loopName = n; R.loopSpeed = speed; return; } const c = clip(n); if (!c) return; const a = mixer.clipAction(c); a.timeScale = speed; if (R.cur === a) return;
      a.reset().setLoop(THREE.LoopRepeat, Infinity).play(); if (R.cur) R.cur.crossFadeTo(a, 0.25, false); R.cur = a; R.loopName = n; R.loopSpeed = speed; };
    R.once = (n, speed = 1) => { const c = clip(n); if (!c || R.one || R.dead) return false; if (/^roar/.test(n) && R.onRoar) try { R.onRoar(); } catch { /* the roar's effect is extra */ } const a = mixer.clipAction(c); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.timeScale = speed; a.play(); if (R.cur) R.cur.crossFadeTo(a, 0.15, false); R.one = a; R.cur = a; R.oneLeft = c.duration / Math.max(0.05, speed) - 0.2; return true; };
    // the one-shot ends by its own clock (not the mixer's "finished" event, which a far creature's stepped mixer can miss)
    R.step = (dt) => { if (!R.one || (R.oneLeft -= dt) > 0) return; const done = R.one; R.one = null; const c = clip(R.loopName || "idle"); if (!c) return;
      const a = mixer.clipAction(c); a.reset().setLoop(THREE.LoopRepeat, Infinity); a.timeScale = R.loopSpeed || 1; a.play(); done.crossFadeTo(a, 0.25, false); R.cur = a; };
    // hunted down: its death clip, held on the last frame; up again (where it lives) when it's back
    R.die = () => { R.dead = true; R.one = null; const c = clip("death"); if (!c) return; const a = mixer.clipAction(c); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1; a.play(); if (R.cur && R.cur !== a) R.cur.crossFadeTo(a, 0.15, false); R.cur = a; };
    R.revive = () => { R.dead = false; R.one = null; mixer.stopAllAction(); R.cur = null; R.loop("idle"); };
    return R;
  }
  // after the clip: the head (and a little of the chest) turned toward what it's looking at, the tail swinging out behind a
  // turn like a spring, the body tilted to the slope it stands on. Only near (past 60 m nobody sees it)
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  function yawBone(b, ang) { if (!b || !b.parent || Math.abs(ang) < 1e-4) return; b.parent.getWorldQuaternion(qB); b.getWorldQuaternion(qA); qA.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, ang)); b.quaternion.copy(qB.invert().multiply(qA)); }
  function poseUp(o, dt) {
    const B = o.R && o.R.bones; if (!B || o.noLook) return; // (a rig whose bones turn on other axes twisted its head: no look for it)
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
    alpha = dinoize({ g: R.g, R, mixer: R.mixer, x: ALPHA_HOME.x, z: ALPHA_HOME.z, face: 0, a: 0, state: "patrol", sp: 2.2, orbit: 1, feintAt: 0 }, "alpha", "alpha:0", 2.4, 3.2, ALPHA_HOME);
  }
  function tickAlpha(dt, t = 0) {
    const A = alpha; if (!A || deadTick(A, dt)) return;
    const dx = px - A.x, dz = pz - A.z, d = Math.hypot(dx, dz), home = Math.hypot(A.x - ALPHA_HOME.x, A.z - ALPHA_HOME.z);
    if (A.state === "patrol" && (d < 18 || A.angry > clock) && !safeHere()) { A.state = "stalk"; if (Snd.growl) Snd.growl(1); } else if (A.state === "stalk" && (d > 30 || home > 45 || safeHere())) A.state = "patrol";
    let tx, tz, want;
    if (A.state === "stalk") {
      // toward you until 9 m, then round you, always facing a little in
      // it circles at 9 m, and every few seconds (at once, when you've hit it) it closes in to strike
      const lunge = A.angry > clock || clock % 9 > 5.2, ang = Math.atan2(A.x - px, A.z - pz) + A.orbit * (lunge ? 0.1 : 0.5), rr = lunge ? 2.6 : 9;
      tx = px + Math.sin(ang) * rr; tz = pz + Math.cos(ang) * rr; want = d > 12 ? 5.5 : lunge ? 6 : 3;
    } else { A.a += dt * 0.07; tx = ALPHA_HOME.x + Math.cos(A.a) * 22; tz = ALPHA_HOME.z + Math.sin(A.a) * 14; want = 2.2; }
    { const la = Math.atan2(dx, dz) - A.face; A.lookAt = A.state === "stalk" ? Math.atan2(Math.sin(la), Math.cos(la)) : null; }
    const ex = tx - A.x, ez = tz - A.z, ed = Math.hypot(ex, ez) || 1, a = Math.atan2(ex, ez); let da = a - A.face; da = Math.atan2(Math.sin(da), Math.cos(da)); A.face += da * Math.min(1, dt * 3);
    A.sp += (want - A.sp) * Math.min(1, dt * 2); lunge(A, dt);
    const nx = A.x + Math.sin(A.face) * A.sp * dt, nz = A.z + Math.cos(A.face) * A.sp * dt;
    if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 8) { A.x = nx; A.z = nz; } else A.orbit = -A.orbit;
    A.g.position.set(A.x, height(A.x, A.z), A.z); A.g.rotation.y = A.face;
    if (A.state === "stalk" && d < 4.6) attack(A, ["attack_claw", "attack_tail", "attack_bite", "attack_leap"][Math.floor(Math.random() * 4)], 0.13, 4.4, 2.4);
    bites(A);
    A.R.loop(A.sp > 4.5 ? "run" : A.sp > 0.4 ? "walk" : "idle", A.sp > 4.5 ? Math.max(0.7, A.sp / 7) : Math.max(0.6, A.sp / 2.4)); mixUp(A, A.mixer, dt, A.x, A.z);
  }
  // ---------------- the Spinosaurus (the owner's Meshy Crimson Sail Spinosaurus: Idle, Walk, Run, three attacks, Swim, Eat,
  // Roar, Hit, Death): the lake's hunter. It swims slow rounds with its sail above the water; walk the shore within 14 m of
  // it and it comes out after you (no further than the beach), bites hard, and goes back to the water.
  let spino = null; const SPINO_LEN = 12;
  function makeSpino(scene) {
    const gl = MODELS && MODELS.spino; if (!gl || !ctx.K.skelClone || !gl.animations) return;
    const R = rig(gl, SPINO_LEN); scene.add(R.g); R.loop("swim");
    const home = { x: J.LAKE.x, z: J.LAKE.z };
    spino = dinoize({ g: R.g, R, mixer: R.mixer, x: J.LAKE.x + J.LAKE.r * 0.5, z: J.LAKE.z, face: 0, a: 0, sp: 1.6, state: "swim", noTilt: true, noLook: true }, "spino", "spino:0", 3.4, 4, home);
    spino.revive = ((rv) => () => { rv(); spino.state = "swim"; spino.a = 0; spino.x = J.LAKE.x + J.LAKE.r * 0.5; spino.z = J.LAKE.z; })(spino.revive);
  }
  function tickSpino(dt, t) {
    const P = spino; if (!P || deadTick(P, dt)) return;
    const d = Math.hypot(px - P.x, pz - P.z), heroShore = Math.hypot(px - J.LAKE.x, pz - J.LAKE.z) < J.LAKE.r + 16, inWater = height(P.x, P.z) < WATER_Y - 0.4;
    if (P.state === "swim" && !safeHere() && ((d < 14 && heroShore) || P.angry > clock)) { P.state = "hunt"; if (Snd.growl) Snd.growl(1); if (d < 40) P.R.once("roar", 1); }
    else if (P.state === "hunt" && (safeHere() || d > 26 || Math.hypot(P.x - J.LAKE.x, P.z - J.LAKE.z) > J.LAKE.r + 22)) P.state = "back";
    let want = 0;
    if (P.state === "swim") { P.a += dt * 0.05; const r = J.LAKE.r * 0.5, tx = J.LAKE.x + Math.cos(P.a) * r, tz = J.LAKE.z + Math.sin(P.a) * r * 0.8; steer(P, tx, tz, dt, 1.5); want = 1.6; }
    else if (P.state === "hunt") { const da = steer(P, px, pz, dt, 3); P.lookAt = da; want = d > 3 ? 7 : 0; if (d < 4.4) attack(P, ["attack_bite", "attack_claw", "attack_tail"][Math.floor(Math.random() * 3)], 0.15, 4.4, 2.2); }
    else { steer(P, J.LAKE.x, J.LAKE.z, dt, 2); want = 4; if (inWater && Math.hypot(P.x - J.LAKE.x, P.z - J.LAKE.z) < J.LAKE.r * 0.7) { P.state = "swim"; P.a = Math.atan2(P.z - J.LAKE.z, P.x - J.LAKE.x); } }
    if (P.state !== "hunt") P.lookAt = null;
    P.sp += (want - P.sp) * Math.min(1, dt * 2); lunge(P, dt);
    const nx = P.x + Math.sin(P.face) * P.sp * dt, nz = P.z + Math.cos(P.face) * P.sp * dt;
    if (Math.hypot(nx - J.LAKE.x, nz - J.LAKE.z) < J.LAKE.r + 24 && Math.hypot(nx - J.SPAWN.x, nz - J.SPAWN.z) > 22) { P.x = nx; P.z = nz; }
    bites(P);
    // in the water it swims low (the sail and the head above it); on land it walks the ground
    const gy = height(P.x, P.z), y = gy < WATER_Y - 0.4 ? WATER_Y - 1.6 : gy; P.y = P.y == null ? y : P.y + (y - P.y) * Math.min(1, dt * 3);
    P.g.position.set(P.x, P.y, P.z); P.g.rotation.y = P.face;
    P.R.loop(inWater ? "swim" : P.sp > 4.5 ? "run" : P.sp > 0.4 ? "walk" : "idle", inWater ? 0.9 : P.sp > 4.5 ? Math.max(0.7, P.sp / 7) : Math.max(0.6, P.sp / 2.4));
    mixUp(P, P.mixer, dt, P.x, P.z);
  }
  // ---------------- the Thornback Titan (the owner's Meshy Thornback Titan: Idle, Walk, Run, Tail, Charge and Stomp attacks,
  // Roar, Eat, Hit, Death): a huge armoured grazer keeping the north-west meadow. It leaves you be until you come within
  // 7 m or hit it; then it swings its spiked tail, stomps and charges, and calms down once you're 22 m away.
  let titan = null; const TITAN_HOME = { x: -105, z: 55 };
  function makeTitan(scene) {
    const gl = MODELS && MODELS.titan; if (!gl || !ctx.K.skelClone || !gl.animations) return;
    const R = rig(gl, 10); scene.add(R.g); R.loop("idle");
    const tag = ctx.K.label(T("Thornback Titan"), { accent: "#ffb648", color: "#ffe9c2", size: 0.9, sub: T("Boss · Lv 20") }); tag.position.y = R.h + 1.6; R.g.add(tag);
    titan = dinoize({ g: R.g, R, mixer: R.mixer, x: TITAN_HOME.x, z: TITAN_HOME.z, face: 0.6, sp: 0, wait: 3, state: "graze", tx: 0, tz: 0, noLook: true }, "titan", "titan:0", 4, 4.6, TITAN_HOME);
  }
  function tickTitan(dt, t) {
    const A = titan; if (!A || deadTick(A, dt)) return;
    const d = Math.hypot(px - A.x, pz - A.z);
    if (A.state !== "rage" && !safeHere() && (d < 7 || A.angry > clock)) { A.state = "rage"; A.angry = Math.max(A.angry, clock + 10); if (Snd.growl) Snd.growl(1); A.R.once("roar", 1); }
    else if (A.state === "rage" && (d > 22 || safeHere() || (A.angry < clock && d > 9))) { A.state = "graze"; A.wait = 3; }
    let want = 0; A.lookAt = null;
    if (A.state === "rage") { const da = steer(A, px, pz, dt, 1.8); A.lookAt = da; want = d > 5 ? (d > 10 ? 6 : 3) : 0;
      if (d < 6.5) attack(A, Math.abs(da) > 1.6 ? "attack_tail" : d < 4.5 ? "attack_stomp" : "attack_charge", 0.12, 6, 2.8); }
    else if (A.state === "graze") { A.wait -= dt; if (A.wait <= 0) { const a = Math.random() * 6.283, rr = 5 + Math.random() * 18; A.tx = TITAN_HOME.x + Math.cos(a) * rr; A.tz = TITAN_HOME.z + Math.sin(a) * rr; A.state = "amble"; } }
    if (A.state === "amble") { if (Math.hypot(A.tx - A.x, A.tz - A.z) < 1.5) { A.state = "graze"; A.wait = 5 + Math.random() * 6; } else { steer(A, A.tx, A.tz, dt, 1.2); want = 1.3; } }
    A.sp += (want - A.sp) * Math.min(1, dt * 2); lunge(A, dt);
    if (A.sp > 0.05) { const nx = A.x + Math.sin(A.face) * A.sp * dt, nz = A.z + Math.cos(A.face) * A.sp * dt; if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 10 && Math.hypot(nx - J.SPAWN.x, nz - J.SPAWN.z) > 22) { A.x = nx; A.z = nz; } }
    bites(A);
    A.g.position.set(A.x, height(A.x, A.z), A.z); A.g.rotation.y = A.face;
    A.R.loop(A.sp > 4 ? "run" : A.sp > 0.3 ? "walk" : A.state === "graze" ? "eat" : "idle", A.sp > 4 ? Math.max(0.7, A.sp / 6) : A.sp > 0.3 ? Math.max(0.6, A.sp / 1.3) : 1);
    mixUp(A, A.mixer, dt, A.x, A.z);
  }
  // ---------------- the triceratops (the owner's Meshy Blazing Triceratops, rigged, with its walk): a small herd grazing
  // east of the lake. They amble from patch to patch; come within 9 m and the nearest turns its horns to you and stands.
  const trikes = []; const TRIKE_HOME = { x: 105, z: 5 };
  function makeTrikes(scene) {
    if (!(MODELS && MODELS.trike8 && MODELS.trike8.animations && ctx.K.skelClone)) return;
    { const n = low || coarse ? 2 : 3;
      for (let i = 0; i < n; i++) { const R = rig(MODELS.trike8, 6.4 + i * 0.6); scene.add(R.g); R.loop("idle");
        trikes.push(dinoize({ g: R.g, R, mixer: R.mixer, x: TRIKE_HOME.x + i * 7 - 7, z: TRIKE_HOME.z + (i % 2) * 6, face: Math.PI * 0.6, tx: 0, tz: 0, sp: 0, wait: 2 + i * 2, state: "graze", hornAt: 0 }, "trike", "trike:" + i, 2.6, 2.8, { x: TRIKE_HOME.x + i * 7 - 7, z: TRIKE_HOME.z })); }
    }
  }
  function tickTrikes(dt, t = 0) {
    for (const r of trikes) {
      if (deadTick(r, dt)) continue;
      const dx = px - r.x, dz = pz - r.z, d = Math.hypot(dx, dz); let want = 0;
      // hit one and it charges you (horns first); otherwise it stands its ground when you come close
      if (r.angry > clock && !safeHere()) { if (r.state !== "charge" && Snd.growl) Snd.growl(1); r.state = "charge"; } else if (r.state === "charge") { r.state = "graze"; r.wait = 2; }
      if (r.state === "charge") { steer(r, px, pz, dt, 2.5); want = d > 2.8 ? 6.5 : 0; if (d < 3.6) attack(r, "attack_horn", 0.1, 3.6, 2.6); }
      else if (d < 9) r.state = "guard"; else if (r.state === "guard" && d > 14) { r.state = "graze"; r.wait = 2; }
      r.lookAt = null; if (r.state === "guard" || d < 18) { const a = Math.atan2(dx, dz); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); if (r.state === "guard") r.face += da * Math.min(1, dt * 2); r.lookAt = da; }
      else if (r.state === "graze") { r.wait -= dt; if (r.wait <= 0) { const a = Math.random() * 6.283, rr = 4 + Math.random() * 16; r.tx = TRIKE_HOME.x + Math.cos(a) * rr; r.tz = TRIKE_HOME.z + Math.sin(a) * rr; r.state = "amble"; } }
      if (r.state === "amble") { const ex = r.tx - r.x, ez = r.tz - r.z, ed = Math.hypot(ex, ez);
        if (ed < 1.5) { r.state = "graze"; r.wait = 4 + Math.random() * 6; } else { want = 1.4; const a = Math.atan2(ex, ez); let da = a - r.face; da = Math.atan2(Math.sin(da), Math.cos(da)); r.face += da * Math.min(1, dt * 1.5); } }
      r.sp += (want - r.sp) * Math.min(1, dt * 2); lunge(r, dt);
      if (r.sp > 0.05) { const nx = r.x + Math.sin(r.face) * r.sp * dt, nz = r.z + Math.cos(r.face) * r.sp * dt; if (height(nx, nz) > WATER_Y + 0.2 && Math.hypot(nx, nz) < J.EDGE - 8) { r.x = nx; r.z = nz; } else { r.state = "graze"; r.wait = 2; } }
      r.g.position.set(r.x, height(r.x, r.z), r.z); r.g.rotation.y = r.face;
      // guarding: a horn toss at you now and then; otherwise its walk at the pace it ambles, its idle while it grazes
      if (r.state === "guard" && t > r.hornAt) { if (d < 3.4) attack(r, "attack_horn", 0.1, 3.4, 2.6); else if (r.R.once("attack_horn", 1)) r.hornAt = t + 3.5 + Math.random() * 2; }
      bites(r);
      r.R.loop(r.sp > 0.3 ? "walk" : "idle", r.sp > 0.3 ? Math.max(0.6, r.sp / 1.4) : 1); mixUp(r, r.mixer, dt, r.x, r.z);
    }
  }
  // ---------------- the grass: crossed cards of drawn blades in a window that follows the hero (thick near, thinning to
  // its edge), swaying in the wind on the GPU; nothing on sand, water, steep ground or the gate's step
  function makeGrass(scene) {
    const draw = (mono) => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128; const g = cv.getContext("2d"); let sd = 13; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    g.fillStyle = mono ? "#000" : "#5d8c34"; g.fillRect(0, 0, 128, 128);
    // b-jur2: more blades, thinner, in more greens; some dry and straw-tipped (a wild meadow, not a lawn)
    for (let i = 0; i < 52; i++) { const x = 4 + r() * 120, h = 50 + r() * 78, lean = (r() - 0.5) * 34, wd = 1.2 + r() * 1.9, dry = r() < 0.18, gr = g.createLinearGradient(0, 128, 0, 128 - h);
      gr.addColorStop(0, "#3f6526"); gr.addColorStop(0.45, dry ? "#8fa04c" : r() < 0.5 ? "#6f9e3e" : "#5f9036"); gr.addColorStop(1, dry ? "#d8c98a" : r() < 0.35 ? "#bccb70" : "#93bb55");
      g.fillStyle = mono ? "#fff" : gr; g.beginPath(); g.moveTo(x - wd, 128); g.quadraticCurveTo(x + lean * 0.4, 128 - h * 0.55, x + lean, 128 - h); g.quadraticCurveTo(x + lean * 0.4 + wd * 0.3, 128 - h * 0.5, x + wd, 128); g.fill(); }
    return cv; };
    // colour on an opaque grass-green ground and a separate white-on-black alpha (no black bleeding into the blades)
    const tex = new THREE.CanvasTexture(draw(false)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; const atex = new THREE.CanvasTexture(draw(true));
    const geo = new THREE.BufferGeometry(), P = [], UV = [], I = [];
    [0, Math.PI / 2].forEach((a, k) => { const c = Math.cos(a) * 0.42, s2 = Math.sin(a) * 0.42, o = k * 4; P.push(-c, 0, -s2, c, 0, s2, c, 0.95, s2, -c, 0.95, -s2); /* b-jur2: half as tall again */ UV.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); geo.setIndex(I);
    const U = { uT: { value: 0 } }, mat = new THREE.MeshStandardMaterial({ map: tex, alphaMap: atex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); sh.vertexShader = "uniform float uT;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      { float h = uv.y * uv.y; vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float w = sin(uT * 1.6 + ip.x * 0.31 + ip.y * 0.23) * 0.16 + sin(uT * 3.3 + ip.x * 1.7 - ip.y * 0.9) * 0.05;
        transformed.x += w * h; transformed.z += w * 0.55 * h; }`);
      sh.vertexShader = "varying float vGh;\n" + sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n vGh = uv.y;");
      // the roots in the blades' own shade (b-jur2): darker low down, as real grass is
      sh.fragmentShader = "varying float vGh;\n" + sh.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n normal = normalize(vNormal);").replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.6, vGh));"); }; // (both faces lit as the front)
    mat.customProgramCacheKey = () => "jur-grass2";
    const STEP = low ? 1.6 : coarse ? 1.2 : 0.9, W = low ? 32 : coarse ? 50 : 80, /* b-jur2: denser (a computer 6,400 tufts, a phone 2,500) */ im = new THREE.InstancedMesh(geo, mat, W * W);
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
        q.setFromAxisAngle(up, h01(gx, gz, 4) * 6.283); sc.set(s0, s0 * (0.8 + h01(gx, gz, 5) * 0.75), s0); p3.set(x, y - 0.05, z); im.setMatrixAt(k++, m4.compose(p3, q, sc));
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
    out.tint = [mtn.material, ...clouds.map((c) => c.material)]; // (unlit: day and night tint them, see tickSky)
    // pollen and dust in the light round the camera
    if (!low) { const NP = coarse ? 160 : 320, pg = new THREE.BufferGeometry(), pp = new Float32Array(NP * 3); for (let i = 0; i < NP; i++) pp.set([(r() - 0.5) * 40, r() * 10, (r() - 0.5) * 40], i * 3); pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
      const dcv = document.createElement("canvas"); dcv.width = dcv.height = 32; const dg = dcv.getContext("2d"), dgr = dg.createRadialGradient(16, 16, 0, 16, 16, 16); dgr.addColorStop(0, "rgba(255,248,210,1)"); dgr.addColorStop(1, "rgba(255,248,210,0)"); dg.fillStyle = dgr; dg.fillRect(0, 0, 32, 32);
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dcv), size: 0.18, transparent: true, depthWrite: false, opacity: 0.75, blending: THREE.AdditiveBlending })); pts.frustumCulled = false; scene.add(pts);
      out.tick.push((dt, t) => { pts.position.set(px, height(px, pz), pz); const a = pg.attributes.position; for (let i = 0; i < NP; i++) { let y = a.getY(i) + dt * 0.25; if (y > 10) y = 0; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.2); } a.needsUpdate = true; }); }
    // pterosaurs: dark silhouettes with beating wings, wheeling high over the plain
    const wing = new THREE.BufferGeometry(); wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.6, 0, 0, -0.6, 2.4, 0.1, -0.2], 3)); wing.computeVertexNormals();
    const wm = new THREE.MeshBasicMaterial({ color: 0x2a2620, side: THREE.DoubleSide }), birds = [];
    // the owner's Jurassic bird (rigged: Fly, Glide, Takeoff, Land …): a flock wheeling over the plain, flapping as it
    // climbs, gliding as it comes down, banking into its turns; now and then one swoops low over the lake
    const flock = []; const BG = MODELS && MODELS.bird;
    if (BG && BG.animations && ctx.K.skelClone) for (let i = 0; i < (low ? 3 : coarse ? 5 : 8); i++) {
      const R = rig(BG, 3.2 + r() * 1.6); R.g.rotation.order = "YXZ"; scene.add(R.g); R.loop("fly", 1);
      flock.push({ g: R.g, R, mixer: R.mixer, c: [(r() - 0.5) * 180, (r() - 0.5) * 180], rad: 30 + r() * 55, h: 38 + r() * 34, a: r() * 6.28, sp: (0.16 + r() * 0.1) * (r() < 0.5 ? 1 : -1), ph: r() * 6, roll: 0, y: 60, noTilt: true, swoop: 0 });
    }
    if (flock.length) out.tick.push((dt, t) => { for (const B of flock) {
      B.a += dt * B.sp; if (B.swoop <= 0 && Math.random() < dt * 0.01) B.swoop = 1;
      const x = B.c[0] + Math.cos(B.a) * B.rad, z = B.c[1] + Math.sin(B.a) * B.rad;
      let y = B.h + Math.sin(t * 0.23 + B.ph) * 10; if (B.swoop > 0) { B.swoop -= dt * 0.08; y = Math.max(height(x, z) + 9, y - Math.sin(Math.PI * Math.max(0, B.swoop)) * (B.h - 10)); }
      const vy = (y - B.y) / Math.max(dt, 1e-3); B.y = y;
      const tx = -Math.sin(B.a) * Math.sign(B.sp), tz = Math.cos(B.a) * Math.sign(B.sp); // along the circle
      B.g.position.set(x, y, z); B.g.rotation.y = Math.atan2(tx, tz);
      B.roll += ((Math.sign(B.sp) * 0.45) - B.roll) * Math.min(1, dt * 2); B.g.rotation.z = B.roll; B.g.rotation.x = Math.max(-0.3, Math.min(0.3, -vy * 0.05));
      B.R.loop(vy > -0.4 ? "fly" : "glide", 1); mixUp(B, B.mixer, dt, x, z);
    } });
    for (let i = 0; i < (flock.length ? 0 : low ? 3 : 6); i++) { const b = new THREE.Group(), L = new THREE.Mesh(wing, wm), Rw = new THREE.Mesh(wing, wm); Rw.scale.x = -1; const body = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.2, 5), wm); body.rotation.x = Math.PI / 2; b.add(L, Rw, body); b.scale.setScalar(2 + r() * 1.5); scene.add(b);
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
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x4a5a32, 0.75); scene.add(hemi);
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
    const G1 = new THREE.Color(0x6f9a3e), G2 = new THREE.Color(0x4f7a2c), DIRT = new THREE.Color(0x8a7650), SAND = new THREE.Color(0xc8b68a), ROCK = new THREE.Color(0x7d786e), BASALT = new THREE.Color(0x2e2a2c), EMBER = new THREE.Color(0x6a2a14);
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = height(x, z); pos.setY(i, y); }
    geo.computeVertexNormals(); const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), slope = 1 - nrm.getY(i), n = fbm(x * 0.08, z * 0.08);
      c.copy(G1).lerp(G2, n); if (slope > 0.12) c.lerp(DIRT, Math.min(1, (slope - 0.12) * 4)); if (y > 14) c.lerp(ROCK, Math.min(1, (y - 14) / 10)); if (y < WATER_Y + 0.5) c.lerp(SAND, Math.min(1, (WATER_Y + 0.5 - y) / 0.5));
      { const ub = Math.hypot(x - J.BASIN.x, z - J.BASIN.z) / J.BASIN.r; if (ub < 1.35) c.lerp(BASALT, Math.min(1, (1.35 - ub) / 0.35)).lerp(EMBER, ub < 0.5 ? (0.5 - ub) * 0.6 : 0); }
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
        const sand = 1 - THREE.MathUtils.smoothstep(y, WATER_Y + 0.05, WATER_Y + 0.5), dirt = Math.min(1, Math.max(0, (slope - 0.08) * 6) + Math.max(0, n2 - 0.66) * 3), forest = Math.max(0, n1 - 0.48) * 3.2;
        spl.set([Math.max(0.05, 1 - forest - dirt - sand), forest * (1 - sand), dirt * (1 - sand), sand * 3], i * 4);
        const t = 0.92 + fbm(x * 0.03, z * 0.03) * 0.16; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = t;
        // the basin: bare dark rock and ash, a red glow toward the lava
        const ub = Math.hypot(x - J.BASIN.x, z - J.BASIN.z) / J.BASIN.r; if (ub < 1.35) { const k = Math.min(1, (1.35 - ub) / 0.35); spl.set([0.05 * (1 - k) + spl[i * 4] * (1 - k), spl[i * 4 + 1] * (1 - k), Math.max(spl[i * 4 + 2], k), spl[i * 4 + 3] * (1 - k)], i * 4); col[i * 3] = t * (1 - k * 0.62) + (ub < 0.55 ? (0.55 - ub) * 0.5 : 0); col[i * 3 + 1] = t * (1 - k * 0.7); col[i * 3 + 2] = t * (1 - k * 0.7); }
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
        { float r = length(vWP.xz - cL) / rL; diffuseColor.rgb = mix(vec3(0.07, 0.24, 0.27), vec3(0.16, 0.5, 0.52), smoothstep(0.35, 0.95, r)); diffuseColor.a *= mix(0.97, 0.86, smoothstep(0.6, 1.0, r)); }`); };
      wMat.customProgramCacheKey = () => "jur-water"; }
    const water = new THREE.Mesh(new THREE.CircleGeometry(J.LAKE.r + 12, 64), wMat);
    water.rotation.x = -Math.PI / 2; water.position.set(J.LAKE.x, WATER_Y, J.LAKE.z); water.receiveShadow = true; scene.add(water);

    // where things grow: on the plain, out of the water, off the gate's clearing and the steep ridges
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spotFor = (minGate, maxR) => { for (let k = 0; k < 30; k++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * maxR, x = Math.cos(a) * r, z = Math.sin(a) * r, y = height(x, z);
      if (y < WATER_Y + 0.6 || Math.hypot(x - J.GATE.x, z - J.GATE.z) < minGate || nearBasin(x, z)) continue; return { x, y, z }; } return null; };
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
    if (trees) { const I4 = new THREE.Matrix4(), M2 = (n) => Math.round(n * MORE), PLAN = { araucaria: [M2(low ? 40 : coarse ? 60 : 100), 30, 205, [0.85, 1.3]], broadleaf: [M2(low ? 40 : coarse ? 60 : 95), 24, 175, [0.8, 1.25]], fern: [M2(low ? 50 : coarse ? 80 : 140), 8, 165, [0.8, 1.35]], cycad: [M2(low ? 50 : coarse ? 80 : 130), 6, 170, [0.8, 1.45]] };
      seed = 11; for (const [k, [n, gate0, maxR, size]] of Object.entries(PLAN)) { const TK = { araucaria: ["tree", 0.5], broadleaf: ["tree", 0.75], fern: ["palm", 0.24], cycad: ["palm", 0.42] }[k];
      trees.KINDS[k].forEach((geo, vi) => cellsOf(scene, "tree-" + k + vi, { geo, mat: trees.mats, base: I4 }, null, mats(Math.round(n / 2), gate0, maxR, size), { shadow: true, nearD: 999, maxD: 330, node: TK[0], cr: TK[1], hr: TK[1] + 0.2, popY: 3 })); } }
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
    if (rock) { seed = 41; cellsOf(scene, "rock", rock, farOf(rock, MODELS.rock1), mats(low ? 40 : coarse ? 95 : 140, 10, 190, [1.4, 4.4], 0.12), { shadow: true, nearD: NEAR_D, node: "rock", cr: 0.4, hr: 0.45, popY: 0.9 });
      // b-jur2: stones and pebbles in the grass (half sunk), drawn only near: the ground's grain
      if (!low) { seed = 43; const lite = MODELS.rock1 && farOf(rock, MODELS.rock1); cellsOf(scene, "stone", lite ? { ...lite, mat: rock.mat } : rock, null, mats(coarse ? 110 : 260, 5, 185, [0.25, 0.8], 0.3), { shadow: false, nearD: 999, maxD: coarse ? 45 : 70 }); } }
    else { const rg = new THREE.DodecahedronGeometry(1, 0); rg.scale(1.2, 0.8, 1); seed = 41; scatter(rg, new THREE.MeshStandardMaterial({ color: 0x86827a, roughness: 1, flatShading: true }), low ? 50 : 90, 10, 190, [0.6, 2.4], 0.25); }
    // the Ember Basin's own (b-jx3): obsidian boulders (the owner's rock, glassy black) and sulfur vents, round its floor
    { const BS = J.BASIN, list = [], vl = []; seed = 97;
      for (let i = 0; i < 60 && list.length < 14; i++) { const a = rnd() * 6.283, r = BS.r * (0.35 + rnd() * 0.55), x = BS.x + Math.cos(a) * r, z = BS.z + Math.sin(a) * r; if (list.some((m) => Math.hypot(m.elements[12] - x, m.elements[14] - z) < 4)) continue; const w = 1.6 + rnd() * 1.6; q.setFromAxisAngle(up, rnd() * 6.283); sc.set(w, w * 0.8, w); p3.set(x, height(x, z) - 0.1 * w, z); list.push(new THREE.Matrix4().compose(p3, q, sc)); }
      for (let i = 0; i < 40 && vl.length < 7; i++) { const a = rnd() * 6.283, r = BS.r * (0.3 + rnd() * 0.5), x = BS.x + Math.cos(a) * r, z = BS.z + Math.sin(a) * r; if ([...list, ...vl].some((m) => Math.hypot(m.elements[12] - x, m.elements[14] - z) < 4)) continue; q.identity(); sc.setScalar(1); p3.set(x, height(x, z), z); vl.push(new THREE.Matrix4().compose(p3, q, sc)); }
      const rk0 = unit(MODELS && MODELS.rock), obsM = new THREE.MeshStandardMaterial({ color: 0x1c1822, roughness: 0.18, metalness: 0.25, emissive: 0x2a0a04, emissiveIntensity: 0.4 });
      const og = rk0 ? { ...rk0, mat: obsM } : { geo: new THREE.DodecahedronGeometry(0.5, 0).translate(0, 0.4, 0), mat: obsM, base: new THREE.Matrix4() };
      cellsOf(scene, "obsidian", og, null, list, { shadow: true, nearD: 999, maxD: 260, node: "obsidian", cr: 0.4, hr: 0.45, popY: 1 });
      const vg = new THREE.ConeGeometry(0.9, 1.1, 8, 1, true); vg.translate(0, 0.45, 0);
      cellsOf(scene, "vent", { geo: vg, mat: new THREE.MeshStandardMaterial({ color: 0xc8b23a, roughness: 0.8, emissive: 0x5a4400, emissiveIntensity: 0.5, side: THREE.DoubleSide }), base: new THREE.Matrix4() }, null, vl, { shadow: false, nearD: 999, maxD: 200, node: "vent", cr: 0, hr: 1.1, popY: 1.6 }); }
    // palms round the lake's shore (the model is ~8.6K triangles, so a ring of them, not a forest)
    const palm = unit(MODELS && MODELS.palm);
    if (palm) { const n = low || coarse ? 14 : 26, list = []; seed = 53;
      for (let i = 0; i < n * 3 && list.length < n; i++) { const a = rnd() * Math.PI * 2, r = J.LAKE.r + 6 + rnd() * 10, x = J.LAKE.x + Math.cos(a) * r, z = J.LAKE.z + Math.sin(a) * r, y = height(x, z);
        if (y < WATER_Y + 0.3) continue; const w = 4 + rnd() * 2.5; q.setFromAxisAngle(up, rnd() * 6.283); sc.set(w, w * (0.9 + rnd() * 0.25), w); p3.set(x, y - 0.1, z); list.push(new THREE.Matrix4().compose(p3, q, sc)); }
      cellsOf(scene, "palm", palm, farOf(palm, MODELS.palm1), list, { shadow: true, nearD: NEAR_D, node: "palm", cr: 0.06, hr: 0.1, popY: 0.6 }); }
    // the ancient giants (the model is ~17K triangles): a few landmarks along the view from the gate; the forest behind
    // them stays the light drawn trees
    const anc = unit(MODELS && MODELS.ancient);
    if (anc) { const spots = [[-24, 14, 13], [24, 18, 11], [-58, -40, 16], [12, -72, 18], [-92, 8, 15], [92, 34, 14], [-34, -128, 17], [44, -138, 16]], want = low ? 12 : coarse ? 20 : 34;
      // more of them all over the plain and the forest's edge: kept off the lake, the path from the gate and each other
      seed = 67; for (let i = 0; i < want * 12 && spots.length < want; i++) { const a = rnd() * Math.PI * 2, r = 30 + rnd() * (J.EDGE - 50), x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.hypot(x - J.LAKE.x, z - J.LAKE.z) < J.LAKE.r + 14 || (Math.abs(x) < 16 && z > 20) || height(x, z) < WATER_Y + 0.5) continue;
        if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 26)) continue; spots.push([x, z, 12 + rnd() * 7]); }
      seed = 61; const list = spots.map(([x, z, w]) => { q.setFromAxisAngle(up, rnd() * 6.283); sc.set(w, w * (0.95 + rnd() * 0.2), w); p3.set(x, height(x, z) - 0.3, z); return new THREE.Matrix4().compose(p3, q, sc); });
      cellsOf(scene, "ancient", anc, farOf(anc, MODELS.ancient1), list, { shadow: true, nearD: NEAR_D + 20, node: "ancient", cr: 0.12, hr: 0.15, popY: 0.3 }); }
    // the old ruins: a great gate on the far shore of the lake, and two smaller ones along the plain
    const ruin = unit(MODELS && MODELS.ruins);
    if (ruin) cellsOf(scene, "ruins", ruin, farOf(ruin, MODELS.ruins1), [[J.LAKE.x + 8, J.LAKE.z - J.LAKE.r - 16, 14, 0.4], [-48, -20, 8, -0.9], [-20, -110, 10, 0.2]].map(([x, z, w, ry]) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, height(x, z) - 0.25, z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(w, w, w))), { shadow: true, nearD: NEAR_D + 20 });
    // the owner's nature props (ferns, bushes, flowers, logs: vertex-coloured, joined to one mesh each): thick round the
    // gate, the paths and the lake; in 80 m cells, drawn only near (they're the ground's detail, not the view)
    const natMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    natMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n normal = normalize(vNormal);"); };
    const NAT = { fern: [Math.round((low ? 70 : coarse ? 110 : 190) * MORE), [1.2, 2.6]], bush: [Math.round((low ? 45 : coarse ? 70 : 120) * MORE), [1.4, 3.0]], flowers: [Math.round((low ? 50 : coarse ? 80 : 140) * MORE), [0.5, 1.0]], log: [low ? 10 : coarse ? 22 : 30, [2.6, 4.6]] };
    seed = 83;
    for (const [kind, [n, size]] of Object.entries(NAT)) for (let v = 1; v <= 3; v++) {
      const o = MODELS && MODELS[kind + "-0" + v]; if (!o) continue;
      const u = unit(o); if (!u) continue; if (!u.geo.attributes.normal) u.geo.computeVertexNormals();
      const NK = { fern: "fern", bush: "bush", log: "log" }[kind];
      cellsOf(scene, kind + v, { ...u, mat: natMat }, null, mats(Math.round(n / 3), 4, 175, size, kind === "log" ? 0.08 : 0), { shadow: kind === "log", nearD: 999, maxD: coarse ? 55 : 80, ...(NK ? { node: NK, hr: 0.35, popY: 0.8 } : {}) });
    }

    // the gate home: the same stone gate as in town (world-jurgate.js)
    const gate = ctx.makeGate ? ctx.makeGate(T("Back to the village")) : ctx.K.makePortal(T("Back to the village")); gate.position.set(J.GATE.x, height(J.GATE.x, J.GATE.z), J.GATE.z); gate.rotation.y = 0; scene.add(gate);
    if (gate.userData.tag) gate.userData.tag.visible = false; // (its words floated over the HUD; the way home is the button by the gate)
    seed = 71; makeRaptors(scene, rnd); makeHerd(scene); makeAlpha(scene); makeTrikes(scene); makeSentinel(scene); makeSpino(scene); if (spino) spino.lod = lodMeshes(spino.g); makeTitan(scene); if (titan) titan.lod = lodMeshes(titan.g);
    raptors.forEach((r) => { r.lod = lodMeshes(r.g); }); herd.forEach((h) => { h.lod = lodMeshes(h.g); }); trikes.forEach((r) => { r.lod = lodMeshes(r.g); }); if (alpha) alpha.lod = lodMeshes(alpha.g);
    if (shadows) { const cast = (g) => g && g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); raptors.forEach((r) => cast(r.g)); herd.forEach((h) => cast(h.g)); trikes.forEach((r) => cast(r.g)); if (alpha) cast(alpha.g); if (sentinel) cast(sentinel.g); if (spino) cast(spino.g); if (titan) cast(titan.g); cast(gate); }
    // a soft glow on the light (the town's bloom, gentler), where the device has bloom on
    let comp = null;
    // no bloom chain of its own: next to the town's post chain it drew a blank screen (a second round; the sky, fog and
    // grading carry the look)
    const grass = MODELS && MODELS.ground ? makeGrass(scene) : null, air = makeAir(scene);
    S = { scene, cam, gate, sun, hemi, sky, HAZE, shadows, comp, wU, grass, air, trees, spin: gate.userData.spin || [] };
    makeWeather(scene);
    // your camp's ground is kept clear (what grew there is gone)
    for (let i = nodes.length - 1; i >= 0; i--) if (CAMPS.some(([cx, cz]) => Math.hypot(nodes[i].x - cx, nodes[i].z - cz) < CAMP_R + 0.8)) { nodes[i].hide(); nodes.splice(i, 1); }
    // gathering, hunting, the pack and the camp (world-jursurv.js)
    try { surv = createSurvival({ THREE, T, esc, toast, ctx, scene, cam, height, shadows, nodes, dinos: () => [...raptors, ...trikes, ...(alpha ? [alpha] : []), ...(spino ? [spino] : []), ...(titan ? [titan] : [])],
      boss: { owns: (o) => !!(jx && jx.owns(o)), hit: (o) => { if (jx) jx.hit(o); } }, fishSpot, onMade: (id, R) => { if (jx) jx.made(id, R); }, onFirstHunt: (k, n) => { if (jx) jx.firstHunt(k, n); }, onBreak: (o) => { if (jx && (o.kind === "rock" || o.kind === "obsidian")) jx.shatter(o); },
      isNight: () => night, sleep: () => sleep(),
      buddyOut: () => !!(dino && dino.out()), onBuddy: (b, k, n) => { if (dino) dino.onBuddy(b, k, n); },
      faceTo: (a) => { face = a; }, hitstop: (ms) => { if (!reduce) stopUntil = performance.now() + ms; }, shake: (n) => { shakeT = Math.max(shakeT, n); }, swingAnim: () => { animNow = "attack"; try { if (hero && hero.attack) hero.attack(0, false); else if (hero && hero.play) hero.play("attack", { once: true, fade: 0.06, speed: 1.6 }); } catch { /* no clip */ } } }); surv.drawCamps(); } catch (e) { console.warn("jurassic survival", e); surv = null; }
    tickCells(0, true);
  }

  // ---------------- day and night, rain ----------------
  // One clock for everyone (the real time, Seoul's): day and night take turns every 6 hours, four changes a day:
  // day 06:00–12:00, night 12:00–18:00, day 18:00–24:00, night 00:00–06:00 (each ends in a 15-minute dusk or dawn).
  // Rain comes and goes in 5-minute spells (about one in four). At night the raptors range farther and a camp is
  // only safe with a campfire burning; the sky, the light and the fog follow.
  const DAY_S = 12 * 3600, TR = 900 / DAY_S, ORIGIN = 21 * 3600; // (a 12-hour turn: phase 0 is 06:00 / 18:00 in Seoul, 21:00 / 09:00 UTC)
  let phOver = null, rainOver = null; // (tests: a time of day and rain on demand)
  const realPhase = () => ((((Date.now() / 1000 - ORIGIN) % DAY_S) + DAY_S) % DAY_S) / DAY_S;
  // a night slept through in your camp's bed: for you it's morning until the real night is over (kept across a reload)
  let sleepK = { shift: 0, until: 0 }; try { sleepK = { ...sleepK, ...JSON.parse(localStorage.getItem("arc.jur.sleep") || "{}") }; } catch { /* awake */ }
  const dayPhase = () => phOver ?? (Date.now() < sleepK.until ? (realPhase() + sleepK.shift) % 1 : realPhase());
  function sleep() {
    const ph = phOver ?? realPhase(); if (lightOf(ph) >= 0.25) return false; phOver = null; /* (a test's time of day counts as now) */ const left = 1 - ph; // (night runs to phase 1, the next morning; at dusk it's still ahead)
    sleepK = { shift: left + 0.02, until: Date.now() + left * DAY_S * 1000 }; try { localStorage.setItem("arc.jur.sleep", JSON.stringify(sleepK)); } catch { /* this visit */ }
    const v = document.createElement("div"); v.className = "wz-sleep"; v.innerHTML = `<b>💤</b>`; ui.root.appendChild(v); if (Snd.heart) Snd.heart(); requestAnimationFrame(() => { v.style.opacity = "1"; });
    setTimeout(() => { v.style.opacity = "0"; toast(`☀️ <b>${esc(T("Good morning!"))}</b> ${esc(T("You slept through the night. HP full."))}`); }, 1600); setTimeout(() => v.remove(), 2600);
    return true;
  }
  const lightOf = (ph) => ph < 0.5 - TR ? 1 : ph < 0.5 ? (0.5 - ph) / TR : ph < 1 - TR ? 0 : (ph - (1 - TR)) / TR;
  const rainOf = (ms) => { const b = Math.floor(ms / 300000), h = Math.sin(b * 91.7 + 13.1) * 43758.5; return h - Math.floor(h) < 0.25; };
  let night = false, rainK = 0, wasNight = null, clockT = 0, stars = null, rain = null, rainOn = false;
  const cDay = new THREE.Color(), cNight = new THREE.Color(0x0e1626), cDusk = new THREE.Color(0xff9a5a), cMoon = new THREE.Color(0x9fb4ff), cSun = new THREE.Color(0xffecd0), cTmp = new THREE.Color(), cRain = new THREE.Color(0x7d8a92);
  function makeWeather(scene) {
    // stars: points on the sky, seen at night
    const N = low ? 350 : 900, g = new THREE.BufferGeometry(), p = new Float32Array(N * 3); let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) { const a = r() * 6.283, y = 0.15 + r() * 0.85, rr = Math.sqrt(1 - y * y); p.set([Math.cos(a) * rr * 700, y * 700, Math.sin(a) * rr * 700], i * 3); }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: coarse ? 2.2 : 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })); stars.renderOrder = -1; scene.add(stars);
    // rain: streaks falling in a box round the camera
    const R = low ? 350 : coarse ? 600 : 1100, rg = new THREE.BufferGeometry(), rp = new Float32Array(R * 6);
    for (let i = 0; i < R; i++) { const x = (r() - 0.5) * 50, y = r() * 26, z = (r() - 0.5) * 50; rp.set([x, y, z, x + 0.05, y - 0.9, z + 0.02], i * 6); }
    rg.setAttribute("position", new THREE.BufferAttribute(rp, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8c8dc, transparent: true, opacity: 0, depthWrite: false })); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  }
  function tickSky(dt) {
    if (!S || !stars) return;
    const ph = dayPhase(), k0 = lightOf(ph), wet = rainOver ?? rainOf(Date.now()); rainK += ((wet ? 1 : 0) - rainK) * Math.min(1, dt * 0.3);
    const k = k0 * (1 - rainK * 0.35), dusk = Math.max(0, 1 - Math.abs(ph - (0.5 - TR / 2)) / TR) + Math.max(0, 1 - Math.abs(ph - (1 - TR / 2)) / TR);
    night = k0 < 0.25;
    // the sun by day (warm, low and orange at dusk and dawn), a pale moon at night
    S.sun.intensity = 0.35 + 2.35 * k; S.sun.color.copy(cMoon).lerp(cSun, k0).lerp(cDusk, Math.min(1, dusk) * 0.55);
    S.hemi.intensity = 0.22 + 0.53 * k; S.scene.environmentIntensity = 0.18 + 0.52 * k;
    cDay.setHex(S.HAZE); cTmp.copy(cNight).lerp(cDay, k).lerp(cRain, rainK * 0.45 * k0); if (dusk > 0) cTmp.lerp(cDusk, Math.min(1, dusk) * 0.18);
    S.scene.fog.color.copy(cTmp); S.scene.background.copy(cTmp); S.scene.fog.density = (low ? 0.0075 : 0.0055) * (1 + rainK * 0.8 + (1 - k0) * 0.25);
    const skyK = 0.16 + 0.84 * k; S.sky.material.color.setRGB(skyK * (1 - rainK * 0.3), skyK * (1 - rainK * 0.25), skyK * (1 - rainK * 0.15) + (1 - k0) * 0.08);
    if (S.air.tint) for (const m of S.air.tint) m.color.setScalar(0.25 + 0.75 * k);
    stars.material.opacity = Math.max(0, 1 - k0 * 1.6) * (1 - rainK) * 0.95; stars.position.copy(S.cam.position);
    // the rain round the camera, falling
    rain.visible = rainK > 0.03; if (rain.visible) { rain.material.opacity = 0.45 * rainK; rain.position.set(S.cam.position.x, S.cam.position.y - 6, S.cam.position.z);
      const a = rain.geometry.attributes.position, A = a.array; for (let i = 0; i < A.length; i += 6) { let y = A[i + 1] - dt * 22; if (y < 0) y += 26; A[i + 1] = y; A[i + 4] = y - 0.9; } a.needsUpdate = true; }
    if (wet !== rainOn) { rainOn = wet; if (wet && on) toast(T("It's starting to rain")); }
    // nightfall: once, a word of warning
    if (night !== wasNight) { if (wasNight !== null && on) toast(night ? T("Night falls: raptors hunt farther. A campfire keeps your camp safe.") : T("The sun is up. The plains are calmer.")); wasNight = night; }
    if (performance.now() > clockT && ui && ui.clock) { clockT = performance.now() + 1000;
      const P = ph < 0.5 - TR ? 0 : ph < 0.5 ? 1 : ph < 1 - TR ? 2 : 3, end = [0.5 - TR, 0.5, 1 - TR, 1][P], left = Math.max(0, end - ph) * DAY_S, hh = Math.floor(left / 3600), mm = Math.floor(left / 60) % 60, ss = Math.floor(left) % 60;
      const tm = hh ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
      const nm = ["Day", "Dusk", "Night", "Dawn"][P], ic = P === 0 ? (wet ? "🌧️" : "☀️") : P === 1 ? "🌇" : P === 2 ? "🌙" : "🌅";
      ui.clock.innerHTML = `<span aria-hidden="true">${ic}</span><b>${esc(T(nm))}</b><small>${tm}</small>`; ui.clock.classList.toggle("night", night); }
  }

  async function makeHero() {
    if (hero) { S.scene.add(hero.obj); if (S.shadows) hero.obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return; }
    try { hero = await ctx.makeHero(); } catch { hero = null; }
    if (hero) { S.scene.add(hero.obj); if (S.shadows) hero.obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); }
  }

  // ---------------- the HUD: leave, the title, a stick and the way home ----------------
  // the HUD: the town's own (world-play.js keeps it up in Jurassic World: profile and HP, wallet, the dock, the stick, jump,
  // run, attack); this adds only what's Jurassic: a chip with the way back, the goal card, the prompt, the title. The layer
  // lets touches through to the game (the town's stick and look read them)
  function buildUi() {
    const root = document.createElement("div"); root.id = "wp-jur"; root.className = "wz"; root.hidden = true;
    root.innerHTML = `<div class="wz-top" data-game-hud><button type="button" class="wz-leave"><svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8"/></svg><span>${esc(T("Village"))}</span></button>
        <div class="wz-name"><b>${esc(T("Jurassic World"))}</b><small>${esc(T("Primeval Plains"))}</small></div>
        <div class="wz-clock" aria-live="off"></div>
        <button type="button" class="wz-packbtn"><span aria-hidden="true">🎒</span><b>${esc(T("Pack"))}</b><kbd>P</kbd></button></div>
      <button type="button" class="wz-buildbtn" hidden><span aria-hidden="true">🔨</span><b>${esc(T("Build"))}</b></button>
      <div class="wz-build wz-pack" hidden role="dialog"><div class="wz-pack-in"></div></div>
      <div class="wz-ghost" hidden><button type="button" data-g="turn">⟳ <span>${esc(T("Turn"))}</span></button><button type="button" data-g="place" class="go">✓ <span>${esc(T("Place"))}</span></button><button type="button" data-g="down" hidden>🗑 <span>${esc(T("Take down"))}</span></button><button type="button" data-g="x">✕</button></div>
      <section class="wz-goal" aria-live="polite" role="button" tabindex="0"><small>${esc(T("Jurassic goals"))}<em class="wz-goal-n"></em></small><b class="wz-goal-t"></b><i class="wz-goal-bar"><i></i></i><p class="wz-goal-mis" hidden></p></section>
      <button type="button" class="wz-act" hidden></button>
      <button type="button" class="wz-home" hidden><span class="wz-home-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/></svg></span><span class="wz-home-t"><b>${esc(T("Back to the village"))}</b><small>ARCIRCLE WORLD</small></span></button>
      <div class="wz-keys">${esc(T("WASD move · Shift run · Space jump · J chop / mine · E use · Esc leave"))}</div>
      <div class="wz-pops" aria-hidden="true"></div>
      <div class="wz-foe" hidden aria-live="polite"></div>
      <div class="wz-pack" hidden role="dialog"><div class="wz-pack-in"></div></div>
      <div class="wz-title" hidden><small>ARCIRCLE WORLD</small><b>JURASSIC WORLD</b><span>${esc(T("Primeval Plains"))}</span></div>`;
    document.body.appendChild(root);
    const q = (s2) => root.querySelector(s2);
    ui = { root, clock: q(".wz-clock"), home: q(".wz-home"), title: q(".wz-title"), act: q(".wz-act"), goal: q(".wz-goal-t"), goalBar: q(".wz-goal-bar i") };
    q(".wz-leave").addEventListener("click", () => leave());
    ui.home.addEventListener("click", () => leave());
    ui.act.addEventListener("click", () => use());
    if (surv) surv.bind(root);
  }
  const kd = (e) => { if (!on) return; if (e.target && e.target.closest && e.target.closest("input,textarea")) return; if (e.key === "Escape") { if ([...document.querySelectorAll('[role="dialog"]')].some((d) => !d.hidden && !d.closest(".wz") && d.getClientRects().length)) return; /* a window is up (the Menu …): Esc closes it, not the world */ e.preventDefault(); e.stopPropagation(); if (surv && surv.cancelGhost()) return; if (surv && surv.packOpen()) surv.togglePack(false); else leave(); return; } if (e.key.toLowerCase() === "r" && surv && surv.ghost()) { e.preventDefault(); e.stopPropagation(); surv.turnGhost(); return; } if (e.key.toLowerCase() === "p" && !e.repeat) { e.preventDefault(); e.stopPropagation(); if (surv) surv.togglePack(); return; } const k = e.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", " "].includes(k)) { keys.add(k); e.preventDefault(); e.stopPropagation(); } else if (k === "e" && !e.repeat) { e.preventDefault(); e.stopPropagation(); if (nearGate) leave(); else use(); } else if ((k === "j" || k === "f") && !e.repeat) { e.preventDefault(); e.stopPropagation(); act("attack"); } if (k === " " && !e.repeat) jumpQ = true; };
  const ku = (e) => { keys.delete(e.key.toLowerCase()); };

  // a tap on a dinosaur selects it (the ring under it, its card on the left); the nearest on screen within a thumb's reach
  let tapAt = null; const tv = new THREE.Vector3();
  const tapDown = (e) => { tapAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  function tapUp(e) {
    if (!tapAt || !on || !S) return; const moved = Math.hypot(e.clientX - tapAt.x, e.clientY - tapAt.y), quick = performance.now() - tapAt.t < 450; tapAt = null; if (moved > 14 || !quick) return;
    const r = st.renderer.domElement.getBoundingClientRect(); let best = null, bd = Math.max(48, r.width * 0.07);
    for (const o of [...raptors, ...trikes, ...(alpha ? [alpha] : []), ...(spino ? [spino] : []), ...(titan ? [titan] : [])]) {
      if (!o.alive || !o.g.visible || Math.hypot(o.x - px, o.z - pz) > 60) continue;
      tv.set(o.x, (o.y ?? height(o.x, o.z)) + (o.R.h || 2) * 0.5, o.z).project(S.cam); if (tv.z > 1) continue;
      const sx = r.left + (tv.x + 1) / 2 * r.width, sy = r.top + (1 - tv.y) / 2 * r.height, d = Math.hypot(sx - e.clientX, sy - e.clientY) - (o.hr || 1.5) * 8;
      if (d < bd) { bd = d; best = o; } }
    if (best) { selectFoe(best); if (Snd.tap) Snd.tap(); }
  }
  // ---------------- a frame ----------------
  let animNow = "";
  // the town's clip names (world-kit CU_AS / KK_AS): idle, walk, sprint, jump, fall; the walk keeps pace with the feet
  const anim = (n, sp) => { if (!hero || !hero.play) return; if (n === animNow) { if (sp && hero.mixer && hero.mixer._actions) for (const a of hero.mixer._actions) if (a.isRunning() && a.getEffectiveWeight() > 0.5) a.timeScale = sp; return; } animNow = n; hero.play(n, { speed: sp || 1, fade: 0.2 }); };
  let frames = 0, stepD = 0, birdT = 4, camReach = 1, velX = 0, velZ = 0, turnS = 0, pyS = null, kbT = 0, kbX = 0, kbZ = 0;
  function tick(dt, t) {
    if (!S) return; dt = Math.min(dt, 0.05); frames++; if (stopUntil && performance.now() < stopUntil) dt *= 0.06;
    const inp = ctx.input ? ctx.input() : null; if (inp) { camYaw = inp.yaw; camPitch = inp.pitch; camGoal = inp.zoom; }
    let ix = (inp && inp.joy ? inp.joy.dx : 0) + (inp ? inp.gx || 0 : 0), iz = (inp && inp.joy ? inp.joy.dy : 0) - (inp ? inp.gy || 0 : 0);
    if (downNow) { ix = iz = 0; }
    if (keys.has("a") || keys.has("arrowleft")) ix -= 1; if (keys.has("d") || keys.has("arrowright")) ix += 1;
    if (keys.has("w") || keys.has("arrowup")) iz -= 1; if (keys.has("s") || keys.has("arrowdown")) iz += 1;
    const il = Math.min(1.4, Math.hypot(ix, iz)), run = keys.has("shift") || (inp && inp.run) || (inp && inp.joy && Math.hypot(inp.joy.dx, inp.joy.dy) > 0.95);
    // moving: a velocity that speeds up and slows down (no stopping dead), the body turning toward where it's going,
    // slower wading in the lake (you can go anywhere but the ridges at the edge)
    const rideNow = !!(dino && dino.riding()), wet = inLake(px, pz) && height(px, pz) < WATER_Y - 0.25, target = il > 0.08 ? (run ? 12.5 : 6.5) * Math.min(1, il) * (wet ? 0.55 : 1) * (rideNow ? 1.6 : 1) : 0;
    let wx = 0, wz = 0;
    if (il > 0.08) { // the stick is read from the camera: up is away from it
      const fx = Math.sin(camYaw + Math.PI), fz = Math.cos(camYaw + Math.PI), rx = -fz, rz = fx;
      wx = (fx * -iz + rx * ix) / il * target; wz = (fz * -iz + rz * ix) / il * target; }
    const acc = 1 - Math.exp(-dt * (target > speed ? 7 : 9)); velX += (wx - velX) * acc; velZ += (wz - velZ) * acc; speed = Math.hypot(velX, velZ);
    if (speed > 0.25) { const want = Math.atan2(velX, velZ); let d = want - face; d = Math.atan2(Math.sin(d), Math.cos(d)); const turn = d * Math.min(1, dt * 9); face += turn; turnS += (turn / Math.max(dt, 1e-3) - turnS) * Math.min(1, dt * 6); } else turnS *= 0.9;
    if (kbT > 0) { kbT -= dt; velX += kbX * dt * 9; velZ += kbZ * dt * 9; }
    if (speed > 0.02 || kbT > 0) {
      const nx = px + velX * dt, nz = pz + velZ * dt;
      if (Math.hypot(nx, nz) < J.EDGE) { px = nx; pz = nz; } else { velX *= 0.3; velZ *= 0.3; }
      if (surv) [px, pz] = surv.collide(px, pz);
      // footsteps, paced to the ground covered (a splash in the water)
      stepD += speed * dt; if (grounded && stepD > (speed > 9 ? 2.2 : 1.6)) { stepD = 0; if (Snd.step) Snd.step(wet ? 3 : speed > 9 ? 12 : 6); }
    }
    const gy = inLake(px, pz) ? Math.max(height(px, pz), WATER_Y - 1.05) : height(px, pz); pyS = pyS == null || Math.abs(gy - pyS) > 3 ? gy : pyS + (gy - pyS) * Math.min(1, dt * 14); const py = pyS;
    // the jump: the town's numbers (9 m/s up, 24 m/s² down)
    if (jumpQ) { jumpQ = false; if (grounded && !rideNow) { vy = 9; grounded = false; animNow = "jump"; if (hero && hero.play) hero.play("jump", { once: true, fade: 0.08 }); } }
    if (!grounded) { vy -= 24 * dt; hop += vy * dt; if (hop <= 0) { hop = 0; vy = 0; grounded = true; animNow = ""; if (hero && hero.land) hero.land(0.5); } }
    if (hero) {
      hero.obj.position.set(px, py + hop + (rideNow ? dino.saddle() : 0), pz); hero.obj.rotation.order = "YXZ"; hero.obj.rotation.y = face;
      // a lean into the turn and a little forward when running hard
      hero.obj.rotation.z = THREE.MathUtils.clamp(-turnS * 0.035 * Math.min(1, speed / 6), -0.16, 0.16); hero.obj.rotation.x = THREE.MathUtils.clamp(speed / 12.5 * 0.07, 0, 0.08);
      if (hero.bot) hero.update(dt, t, Math.min(1, speed / 8), 0);
      else {
        if (hero.update) hero.update(dt, t);
        if (!grounded) { if (vy < 0 && !(hero.busy && hero.busy())) anim("fall"); }
        else if (rideNow) anim("drive"); // (on its back the dinosaur does the walking: the hero sits — the borrowed chair sit, world-kit.js kkBorrow; before it has loaded, the calm idle)
        else if (!(hero.busy && hero.busy()) || speed > 0.6) anim(speed > 9 ? "sprint" : speed > 0.6 ? "walk" : "idle", speed > 9 ? Math.max(0.85, speed / 12.5) : speed > 0.6 ? Math.max(0.8, speed / 6.5) : 1);
        // ARON's idle (Idle_03) leans back in a big stretch from 0.7 s to 2.2 s: standing still plays only its calm part
        if (animNow === "idle" && hero.mixer && hero.mixer._actions) for (const a of hero.mixer._actions) { const c = a.getClip(); if (a.isRunning() && /idle_03/i.test(c.name) && c.duration > 3.5 && a.time < 2.5) a.time = 2.5; }
      }
    }
    // the camera, as in town (world-play.js): 5.2 m up (more as you look down) and 9.6 m back, times the zoom; it looks
    // 2.6 m ahead of the hero and follows a touch behind; running widens the view
    camDist += (camGoal - camDist) * (1 - Math.exp(-dt * 10));
    const bh = (5.2 + camPitch * 6) * camDist, bk = 9.6 * camDist;
    // a hill between the hero and the camera pulls the camera in (it was sinking into the slope behind, all grass)
    let reach = 1; for (let i = 1; i <= 6; i++) { const k = i / 6, gx = px + Math.sin(camYaw) * bk * k, gz = pz + Math.cos(camYaw) * bk * k, ly = py + 1.4 + (bh - 1.4) * k;
      if (height(gx, gz) + 0.9 > ly) { reach = Math.max(0.3, (i - 1) / 6); break; } }
    camReach += (reach - camReach) * (1 - Math.exp(-dt * (reach < camReach ? 12 : 3)));
    camPos.set(px + Math.sin(camYaw) * bk * camReach, py + 1.4 + (bh - 1.4) * camReach + hop * 0.6, pz + Math.cos(camYaw) * bk * camReach);
    camPos.y = Math.max(camPos.y, Math.max(height(camPos.x, camPos.z), WATER_Y) + 0.6);
    camLook.set(px - Math.sin(camYaw) * 2.6, py + 1.4 + hop * 0.5, pz - Math.cos(camYaw) * 2.6);
    if (!camInit) { S.cam.position.copy(camPos); camLookS.copy(camLook); camInit = true; }
    S.cam.position.lerp(camPos, 1 - Math.exp(-dt * 10)); camLookS.lerp(camLook, 1 - Math.exp(-dt * 14)); S.cam.lookAt(camLookS);
    if (shakeT > 0 && !reduce) { shakeT -= dt; S.cam.position.x += (Math.random() - 0.5) * shakeT * 0.8; S.cam.position.y += (Math.random() - 0.5) * shakeT * 0.8; }
    const fov = 55 + THREE.MathUtils.smoothstep(speed, 2, 22) * 11; if (Math.abs(S.cam.fov - fov) > 0.05) { S.cam.fov += (fov - S.cam.fov) * (1 - Math.exp(-dt * (fov > S.cam.fov ? 6 : 3))); S.cam.updateProjectionMatrix(); }
    // the sun's shadow box follows the hero
    if (S.shadows) { S.sun.target.position.set(px, py, pz); S.sun.position.set(px - 60, py + 80, pz + 40); }
    tickCells(dt);
    for (const f of S.spin) f(dt, t);
    tickSky(dt); S.wU.uT.value = t; if (S.grass) S.grass.tick(t); S.air.tick(dt, t); if (S.trees) S.trees.tick(t);
    clock = t; tickRaptors(dt, t); tickHerd(dt, t); tickAlpha(dt, t); tickTrikes(dt, t); tickSentinel(dt, t); tickSpino(dt, t); tickTitan(dt, t);
    if (surv) surv.tick(dt, t, px, pz, face);
    for (let i = fallers.length - 1; i >= 0; i--) { const f = fallers[i]; f.t += dt; f.step(Math.min(1, f.t / 1.1)); if (f.t >= 1.25) { fallers.splice(i, 1); f.done(); } }
    if (jx) { try { jx.tick(dt, t); } catch (e) { console.warn("jurx", e); jx = null; }
      // the big ones' footsteps (b-jx4): a step every half a body length walked
      if (jx) for (const o of [titan, spino, alpha, ...trikes]) { if (!o || !o.alive || (o === spino && o.y < WATER_Y - 0.5)) continue; o.stepD = (o.stepD || 0) + (o.sp || 0) * dt; const L = (o.R && o.R.L) || 6; if (o.stepD > L * 0.5) { o.stepD = 0; jx.step(o); } } }
    if (dino) try { dino.tick(dt, t); } catch (e) { console.warn("dino", e); dino = null; }
    // wading: rings spreading on the water round you (so the shallows read as water)
    { const wetNow = inLake(px, pz) && height(px, pz) < WATER_Y - 0.1; if (!S.rip) { const m = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, depthWrite: false });
        S.rip = [0, 1, 2].map((i) => { const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), m.clone()); r.rotation.x = -Math.PI / 2; r.visible = false; S.scene.add(r); return r; }); }
      S.rip.forEach((r, i) => { r.visible = wetNow; if (!wetNow) return; const k = ((t * (speed > 1 ? 0.9 : 0.45)) + i / 3) % 1; r.position.set(px, WATER_Y + 0.03, pz); r.scale.setScalar(0.5 + k * (speed > 1 ? 2.6 : 1.6)); r.material.opacity = (1 - k) * 0.55; }); }
    // birds somewhere in the trees now and then
    if ((birdT -= dt) < 0) { birdT = 3 + Math.random() * 7; if (Snd.bird) Snd.bird(); }
    const g = Math.hypot(px - J.GATE.x, pz - J.GATE.z) < 4.2; if (g !== nearGate) { nearGate = g; ui.home.hidden = !g; }
  }

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; busy = true;
    try {
      if (!S) { await loadModels(); build(); } if (!ui) buildUi();
      if (!jx && surv) try { jx = createJurX({ THREE, T, esc, toast, ctx, scene: S.scene, height, J, root: ui.root, FOE: surv.FOE, ic: surv.ic, post: surv.post, setInv: surv.setInv, pop: surv.pop, tools: () => surv.tools(), boss: (k) => (k === "alpha" ? alpha : titan),
        me: () => ({ px, pz, face, down: downNow }), isNight: () => night, rainK: () => rainK, homeSpot: () => surv.homeSpot(), campFire: () => surv.homeFire(), camps: () => surv.campList(), CAMP_R, dinos: () => [...raptors, ...trikes, ...(alpha ? [alpha] : []), ...(spino ? [spino] : []), ...(titan ? [titan] : [])],
        fires: () => surv.fires(), spawnRaider, removeRaider, setRaid: (v) => { raidNow = !!v; }, shake: (n) => { shakeT = Math.max(shakeT, n); }, hitstop: (ms) => { if (!reduce) stopUntil = performance.now() + ms; } });
        for (const o of [titan, spino, alpha, ...trikes, ...raptors]) if (o && o.R) o.R.onRoar = () => { if (jx) jx.roar(o); };
        if (sentinel) sentinel.R.onRoar = () => { if (jx) jx.roar({ x: SENT.x, z: SENT.z, R: sentinel.R }); }; } catch (e) { console.warn("jurx", e); jx = null; }
      await makeHero(); animNow = "";
      px = J.SPAWN.x; pz = J.SPAWN.z; face = Math.PI; camYaw = 0; camPitch = 0.05; camDist = camGoal = coarse ? 1.7 : 1; camInit = false; downNow = false; velX = velZ = 0; pyS = null; kbT = 0; if (ctx.setView) ctx.setView({ yaw: 0, pitch: 0.05, zoom: camGoal }); speed = 0; hop = 0; vy = 0; grounded = true; jumpQ = false; nearGate = false; ui.home.hidden = true; keys.clear();
      try { if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), new Promise((ok) => setTimeout(ok, 2500))]); } catch { /* compiled on the first frame */ }
      st.view(S.scene, S.cam, S.comp || null); st.solo(tick); on = true;
      document.body.classList.add("wp-jurassic"); ui.root.hidden = false;
      addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
      st.renderer.domElement.addEventListener("pointerdown", tapDown); st.renderer.domElement.addEventListener("pointerup", tapUp);
      if (surv) surv.load(); if (jx) try { jx.start(); } catch (e) { console.warn("jurx", e); }
      // DINO SOULMATE (world-dino.js): the eggs, the Hatchery, your companion
      if (!dino && surv) try { dino = createDino({ THREE, K: ctx.K, T, esc, toast, ctx, scene: S.scene, cam: S.cam, height, rig, model: (sp) => MODELS && (sp === "trike" && MODELS.trike8 ? MODELS.trike8 : MODELS.raptor8), renderer: () => st.renderer, me: () => ({ x: px, z: pz, face, down: downNow, speed }), camYaw: () => camYaw,
        foes: () => [...raptors, ...trikes, ...(alpha ? [alpha] : []), ...(spino ? [spino] : []), ...(titan ? [titan] : [])], sel: () => sel, working: () => surv.working(), hurtFoe: surv.hurtFoe, pop: surv.pop, setInv: surv.setInv, root: ui.root,
        homeCamp: () => surv.homeSpot(), setView: (v) => { if (ctx.setView) ctx.setView(v); }, clock: () => clock, confetti: ctx.confetti }); } catch (e) { console.warn("dino", e); dino = null; }
      if (dino) try { dino.start(); } catch (e) { console.warn("dino", e); toast(esc(T("The Hatchery didn't open — try again later."))); dino = null; }
      // the first visit: a short tour of what's new here (after the title)
      // the first three days after your first visit: the basics, as a card each time you come in (after the title)
      let firstAt = 0; try { firstAt = Number(localStorage.getItem("arc.jur.first")) || 0; if (!firstAt) { firstAt = Date.now(); localStorage.setItem("arc.jur.first", String(firstAt)); } } catch { firstAt = Date.now(); }
      if (Date.now() - firstAt < 3 * 864e5 && ctx.tips) setTimeout(() => { if (on) ctx.tips([
        ["🗡️", "Your weapons stay in town", "Your ARCIRCLE World weapons don't work here. You start with bare hands, and everything you use, you make."],
        ["🪵", "Gather first", "Chop trees for wood, mine rocks for stone and flint, pick ferns and bushes for fiber. Walk up and tap attack."],
        ["🔨", "Build a workbench", "In your camp tap Build and make a workbench (20 wood, 10 stone). Then make an axe and a spear from your pack."],
        ["🦖", "Mind the dinosaurs", "They bite back. Your camp and the gate are safe. Tap a dinosaur to see its level and HP."]],
        { kicker: "JURASSIC WORLD", title: T("How survival works"), icon: "🦖", cls: "jur", go: T("Got it, let's survive"), day: "jur" }); }, 3100);
      const tour = (n) => { if (!on || !ctx.coach) return; if (document.querySelector(".wp-coach") || document.querySelector(".wp-tips")) { if (n < 30) setTimeout(() => tour(n + 1), 2000); return; } ctx.coach("arc.guide.jur", [
        { at: ".wz-goal", t: T("Your goal"), p: T("Your next step is here. Follow it from the first wood to the Alpha Raptor.") },
        { at: ".wz-packbtn", t: T("Your pack"), p: T("What you've gathered, your tools, food, and everything you can make.") },
        { at: ".wc-attack", t: T("Chop, mine and hunt"), p: T("Walk up to a tree, rock or fern and tap here to chop, mine and gather. Dinosaurs bite back, so keep an eye on your HP!") },
        { at: "#wp-clean", t: T("Hide the buttons"), p: T("Tap this tab to hide the screen's buttons and see more of the world. Tap it again to bring them back.") }]); }; setTimeout(() => tour(0), 3400);
      ui.title.hidden = false; ui.title.classList.remove("go"); void ui.title.offsetWidth; ui.title.classList.add("go"); setTimeout(() => { if (ui) ui.title.hidden = true; }, 3000);
      return true;
    } catch (e) {
      console.warn("jurassic", e); reset(); throw e;
    } finally { busy = false; }
  }
  function reset() {
    if (surv && surv.packOpen()) surv.togglePack(false);
    if (dino) try { dino.stop(); } catch { /* the Hatchery is closed anyway */ }
    if (jx) try { jx.stop(); } catch { /* the raid ends with the visit */ }
    on = false; document.body.classList.remove("wp-jurassic"); if (ui) ui.root.hidden = true;
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); keys.clear();
    st.renderer.domElement.removeEventListener("pointerdown", tapDown); st.renderer.domElement.removeEventListener("pointerup", tapUp); selectFoe(null);
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
  }
  function leave() { if (!on) return; reset(); if (ctx.onLeave) ctx.onLeave(); }
  // the attack button (the town's, routed here by world-play): chop the tree, mine the rock, or hit what's in reach
  // the swing (chopping and mining come next, judged by the server); E at the gate goes home
  let swingT = 0;
  function swing() { if (dino && dino.riding()) dino.ride(false); if (surv) { surv.swing(px, pz, face); return; } const t = performance.now(); if (t - swingT < 430 || !hero || !hero.play) return; swingT = t; try { if (hero.attack) hero.attack(0, false); else hero.play("attack", { once: true, fade: 0.06, speed: 1.6 }); } catch { /* no clip */ } }
  function use() { if (nearGate) leave(); else if (downNow) return; else if (dino && dino.tryPick()) return; else if (surv && surv.bedNear() && !(surv.target && surv.target())) surv.rest(); else if (surv && surv.stationNear && surv.stationNear() && !(surv.target && surv.target())) surv.togglePack(true); else swing(); }
  function act(a) { if (!on || downNow) return true; if (a === "attack") swing(); return true; }
  // knocked out (the town's rules: world-combat.js — today's free get-up, then $ARCIRCLE or a rest): the hero lies down;
  // getting up "here" stays, "plaza" means the gate
  function down(isDown, where) {
    downNow = !!isDown; speed = 0; velX = velZ = 0;
    if (isDown) { if (hero && hero.play) { animNow = "die"; hero.play("die", { once: true, hold: true }); } return; }
    if (where === "plaza") { px = J.SPAWN.x; pz = J.SPAWN.z; camInit = false; }
    animNow = ""; if (hero && hero.play) hero.play("idle");
  }
  return { probe: () => S, enter, leave, act, down, active: () => on, jump: () => { if (!downNow) jumpQ = true; }, debug: () => ({ cam: S ? [...S.cam.position.toArray().map((v) => +v.toFixed(2)), +S.cam.fov.toFixed(1), camDist, camPitch] : null, px, pz, speed, hop, grounded, anim: animNow, hero: hero ? (hero.bot ? "bot" : hero.custom ? "custom" : "kk") : null, clips: hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.3).map((a) => a.getClip().name + "@" + a.timeScale.toFixed(2)) : [], nearGate, h: height(px, pz), frames, keys: [...keys], raptors: raptors.map((r) => ({ x: Math.round(r.x), z: Math.round(r.z), s: r.state })), alpha: alpha && { x: Math.round(alpha.x), z: Math.round(alpha.z), s: alpha.state }, herd: herd.length, sentinel: sentinel ? { roaring: !!sentinel.R.one } : null, clipsR: raptors[0] ? raptors.map((r) => r.R.cur && r.R.cur.getClip().name) : null, clipsT: trikes[0] ? trikes.map((r) => r.R.cur && r.R.cur.getClip().name) : null, trikes: trikes.map((r) => r.state), spino: spino && { x: Math.round(spino.x), z: Math.round(spino.z), s: spino.state, alive: spino.alive }, titan: titan && { x: Math.round(titan.x), z: Math.round(titan.z), s: titan.state, alive: titan.alive }, surv: surv && surv.debug(), jx: jx && jx.debug(), nodes: nodes.length }), sky: (ph, wet) => { phOver = ph; rainOver = wet; }, skyNow: () => ({ night, rainK: +rainK.toFixed(2), ph: +dayPhase().toFixed(3) }), surv: () => surv, dino: () => dino, nodeList: () => nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, z: n.z, hr: n.hr, down: !!n.down })), walk: (x, z, yaw) => { px = x; pz = z; velX = velZ = 0; pyS = null; camInit = false; if (yaw != null) { camYaw = yaw; face = yaw + Math.PI; } } };
}
