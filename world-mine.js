// world-mine.js — the ARCL Mine: a cave seen side-on (left and right only, like a 2D game) where you break copper,
// silver and gold rocks with a pickaxe. Loaded the first time you walk into the Mining Village's tunnel
// (world-minevillage.js, world-play.js openMine). It draws its own scene through the stage's view() while the town
// waits behind it.
//
// What pays is decided by the server (api/_world-mine.mjs): the rocks there are, the hits each takes, whether one is
// empty and what it holds, the hour inside and the 6-hour rest. A guest gets the same cave as a demo, with nothing paid.
//
// The look: a cross-section of the ground. Soil strata with ore flecks below the floor, a timbered cave with lanterns
// and glowing crystals, a rock ceiling with stalactites above, dust in the lamplight. Gold rocks shine (a glow, a light
// shaft, sparkles); every hit cracks, shakes and chips the rock; a break bursts it and the haul flies to the counter.
import { art as itemArt } from "./world-itemart.js";
export const MINE_RULES = {
  SESSION_MS: 60 * 60e3, COOL_MS: 6 * 3600e3, SWING_MS: 520, MAX_ROCKS: 8, START_ROCKS: 5, SLOTS: 14,
  ODDS: [0.9, 0.085, 0.015], EMPTY: 0.2, RANGE: [[10, 100], [100, 1000], [1000, 10000]], SKEW: [2, 2.5, 4], HITS: [[10, 20], [22, 34], [40, 56]],
  TIERS: [{ id: "", name: "Common", k: 1, every: 20500, tokens: 0 }, { id: "pick1", name: "Advanced", k: 0.75, every: 16400, tokens: 3000 }, { id: "pick2", name: "Rare", k: 0.55, every: 13400, tokens: 8000 }, { id: "pick3", name: "Legendary", k: 0.4, every: 11000, tokens: 20000 }],
  DAY_CAP: 40000,
};
// a little mine cart heaped with gold and silver (the rocks-broken counter)
const CART = `<svg viewBox="0 0 48 40" width="44" height="37"><path d="M10 14 L24 6 L31 11 L38 9 L41 15 Z" fill="#ffd34d" stroke="#a86400" stroke-width="1.2"/><path d="M16 11l5-4 4 4z" fill="#fff4c2"/><path d="M30 12l5-2 3 4z" fill="#dbe6f5" stroke="#7a8aa8" stroke-width=".8"/>
  <path d="M5 14h38l-4 16H9z" fill="#7a4a24" stroke="#3a200c" stroke-width="1.6"/><path d="M8 19h32M9 24h30" stroke="#5a3418" stroke-width="1.4"/><rect x="4" y="12.5" width="40" height="3" rx="1" fill="#9aa6b8"/>
  <circle cx="14" cy="33" r="4" fill="#2a2e36" stroke="#9aa6b8" stroke-width="1.6"/><circle cx="34" cy="33" r="4" fill="#2a2e36" stroke="#9aa6b8" stroke-width="1.6"/></svg>`;
const R = MINE_RULES, KIND = ["Copper", "Silver", "Gold"], KCOL = ["#ff9a5a", "#dbe6f5", "#ffd34d"];
const SLOT_X = (i) => -26 + i * 4, CAVE = 30, SWING = 0.56, IMPACT = 0.2, REACH = 2.0, SPEED = 5.2;
// XP for a broken rock: what a scammer of your level gives (6 + 3·level), more for the rarer, longer rocks; an empty one
// still pays a little for the work. Per second of swinging it's about what hunting pays, a little under.
export const rockXp = (lv, t, empty) => Math.round((6 + 3 * Math.max(1, lv | 0)) * (empty ? 1 : [1.5, 3, 6][t] || 1.5));
const fmtN = (n) => Math.round(n).toLocaleString("en-US");
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const hm = (ms) => { const m = Math.max(1, Math.ceil(ms / 60e3)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; };

export function createMine(ctx) {
  const { THREE, st, T, esc, toast, Snd } = ctx;
  const low = !!ctx.low, reduce = !!ctx.reduce;
  if (!ctx.art) ctx.art = itemArt;
  let S = null; // the scene, built the first time
  let kick = 0, zoomT = 0, broke = 0, on = false, busy = false, guest = false, run = null, tier = 0, k = 1, left = 0, leftAt = 0, today = 0, cap = R.DAY_CAP, haul = 0, golds = 0, ending = false;
  let beatT = 0, hero = null, pick = null, px = -24, dir = 1, moveIn = 0, mineHeld = false, swingT = 0, hitDue = -1, freeze = 0, shake = 0, target = null, walkTo = null;
  const rocks = new Map(); let ui = null, keys = new Set(), preP = null;

  // ---------------- textures, made once on canvases ----------------
  function canvasTex(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
  const radial = (inner, outer = "rgba(0,0,0,0)") => canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.45)")); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const starTex = () => canvasTex(128, 128, (g, w) => { const c = w / 2; g.translate(c, c); const gr = g.createRadialGradient(0, 0, 0, 0, 0, c); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,240,190,0.7)"); gr.addColorStop(1, "rgba(255,220,120,0)"); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, c * 0.32, 0, 7); g.fill();
    g.fillStyle = "rgba(255,248,220,0.95)"; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -c); g.lineTo(5, 0); g.closePath(); g.fill(); } });
  const shaftTex = () => canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, "rgba(255,214,90,0.75)"); gr.addColorStop(0.5, "rgba(255,214,90,0.18)"); gr.addColorStop(1, "rgba(255,214,90,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sg = g.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, "rgba(0,0,0,1)"); sg.addColorStop(0.5, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(0,0,0,1)"); g.globalCompositeOperation = "destination-out"; g.fillStyle = sg; g.fillRect(0, 0, w, h); });
  // three crack stages on one strip (each a quarter of the width; the last quarter empty)
  const crackTex = () => canvasTex(512, 128, (g) => { let sd = 77; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let s = 0; s < 3; s++) { const ox = s * 128 + 64, oy = 64; g.strokeStyle = "rgba(10,6,4,0.95)"; g.lineCap = "round";
      for (let b = 0; b < 3 + s * 3; b++) { let x = ox + (r() - 0.5) * 20, y = oy + (r() - 0.5) * 20; const a0 = r() * 6.28; g.lineWidth = 4 - s * 0.6; g.beginPath(); g.moveTo(x, y);
        for (let q = 0; q < 4 + s * 2; q++) { const a = a0 + (r() - 0.5) * 1.4; x += Math.cos(a) * (8 + s * 3); y += Math.sin(a) * (8 + s * 3); g.lineTo(x, y); } g.stroke(); } } });

  // ---------------- the models (Meshy, packed by tools/pack-prop.mjs): copper, silver and gold rocks, and the
  // painted cave behind (models/world/mine). Loaded before the first visit; if they fail, the drawn ones stand in.
  let MODELS = null, BACK = null;
  async function loadModels() {
    if (MODELS !== null) return;
    if (loading) { await Promise.race([loading, new Promise((ok) => setTimeout(ok, 4000))]); return; } // still on its way from the last visit
    const ver = ctx.ver || "", L = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null;
    const one = (f) => (L ? L.loadAsync("models/world/mine/" + f + ".glb" + ver).then((g) => g.scene) : Promise.reject(new Error("no loader")));
    const webp = () => new Promise((ok, no) => new THREE.TextureLoader().load("models/world/mine/cave-back.webp" + ver, ok, undefined, no));
    const kx = ctx.K && ctx.K.ktx2Loader ? ctx.K.ktx2Loader() : null; // the painted cave as KTX2: a third of the memory of the webp on the GPU
    const tex = kx ? kx.loadAsync("models/world/mine/cave-back.ktx2" + ver).catch(() => webp()) : webp();
    // a slow phone: after 25 s the drawn rocks stand in, and the models (still loading) take over from the next visit
    loading = Promise.allSettled([one("rock-copper"), one("rock-silver"), one("rock-gold"), tex]).then(take);
    await Promise.race([loading, new Promise((ok) => setTimeout(ok, 25000))]);
    if (MODELS === null) console.warn("mine: models slow, drawn rocks this time");
  }
  let loading = null;
  function take(res) {
    MODELS = [];
    res.slice(0, 3).forEach((r, t) => {
      if (r.status !== "fulfilled") { console.warn("mine model", t, r.reason); return; }
      const o = r.value, b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = [2.0, 2.2, 2.4][t] / (sz.x || 1);
      const inner = new THREE.Group(); o.scale.multiplyScalar(k); o.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k); inner.add(o);
      o.traverse((m) => { if (!m.isMesh) return; m.castShadow = false; const mt = m.material; if (!mt) return;
        if (t === 2) { mt.emissive = new THREE.Color(0xffb020); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.45; }
        else if (t === 1) { mt.emissive = new THREE.Color(0x9fb4d8); mt.emissiveMap = mt.map; mt.emissiveIntensity = 0.12; }
        mt.needsUpdate = true; inner.userData.mat = mt; });
      inner.userData.w = sz.x * k; inner.userData.h = sz.y * k; inner.userData.d = sz.z * k; MODELS[t] = inner;
    });
    if (res[3].status === "fulfilled") { BACK = res[3].value; BACK.colorSpace = THREE.SRGBColorSpace; BACK.wrapS = THREE.MirroredRepeatWrapping; BACK.anisotropy = 4; }
    if (S && !S.withModels && !on) S = null; // the cave was built with the stand-ins: the next visit builds it again with these
  }

  // ---------------- the cave ----------------
  function build() {
    const extra = {}, coarse = !!ctx.coarse, rich = !low && !coarse; // rich: a computer (bloom, more of everything)
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060b);
    const cam = new THREE.PerspectiveCamera(30, 1, 1, 200); scene.fog = new THREE.Fog(0x070910, 40, 90);
    const hemi = new THREE.HemisphereLight(0x7d86e0, 0x3a2416, low ? 1.1 : 0.8); scene.add(hemi);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.55); fill.position.set(0, 3, 30); scene.add(fill); // a soft front light: the rocks and the hero read against the dark
    const key = new THREE.DirectionalLight(0xffd8a8, 1.15); key.position.set(-8, 14, 16); scene.add(key);
    const rim = new THREE.DirectionalLight(0x4fe6c8, 0.45); rim.position.set(10, 6, -8); scene.add(rim);
    // a fixed set of point lights (the same count always: no shader rebuilds), moved to the lanterns nearest the camera
    const head = new THREE.PointLight(0xe2ecff, low ? 0 : 9, 9, 2); scene.add(head);
    const lampL = low ? [] : (coarse ? [0] : [0, 1, 2]).map(() => { /* a phone: one lamp light (the floor's light pools do the rest) */ const l = new THREE.PointLight(0xffa04a, 22, 13, 2); scene.add(l); return l; });
    const goldL = new THREE.PointLight(0xffc640, 0, 8, 2); if (!low) scene.add(goldL);
    let sd = 911; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const noise = (x, y) => Math.sin(x * 0.9 + Math.sin(y * 1.3) * 1.7) * 0.5 + Math.sin(x * 2.3 - y * 1.9) * 0.25 + Math.sin(x * 5.1 + y * 4.7) * 0.12;
    const vc = (geo, f) => { const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color(); for (let i = 0; i < p.count; i++) { f(p.getX(i), p.getY(i), p.getZ(i), col, i); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } geo.setAttribute("color", new THREE.BufferAttribute(c, 3)); };
    const vcm = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, ...o });
    const W = CAVE * 2 + 40;
    // the back wall of the cave: lumpy rock with strata
    { const g = new THREE.PlaneGeometry(W, 11, low ? 90 : 160, low ? 14 : 24), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, noise(x * 0.5, y * 0.6) * 1.1 + Math.sin(x * 0.17) * 0.6); } g.computeVertexNormals();
      const a = new THREE.Color(0x2a2230), b = new THREE.Color(0x4d3d34), band = new THREE.Color(0x6a5240);
      vc(g, (x, y, z, c) => { const n = noise(x * 0.4 + 9, y * 0.8), s = Math.sin(y * 1.6 + n * 2.4) > 0.72 ? 1 : 0; c.copy(a).lerp(b, 0.5 + n * 0.5); if (s) c.lerp(band, 0.55); c.multiplyScalar(0.8 + z * 0.12); });
      const m = new THREE.Mesh(g, vcm()); m.position.set(0, 4.5, -3.6); if (!BACK) scene.add(m); }
    // the painted cave (the mine's key art) far behind: lanterns, scaffolds and a blue cavern, mirrored to run the whole
    // length; far enough back that it slides past slower than the floor (parallax)
    if (BACK) { const H = 40, Wd = 220, tileW = H * 16 / 9, /* b5: bigger, one whole picture across the cave, its mirrored seams behind the end walls */ m = new THREE.Mesh(new THREE.PlaneGeometry(Wd, H), new THREE.MeshBasicMaterial({ map: BACK, color: 0xd6d8e6, fog: false, toneMapped: false }));
      extra.backM = m.material; BACK.repeat.set(Wd / tileW, BACK.isCompressedTexture ? -1 : 1); BACK.offset.x = -(((Wd / 2 - tileW / 2) / tileW) % 1); if (BACK.isCompressedTexture) BACK.offset.y = 1; /* a KTX2 picture isn't flipped on upload: turned the right way up here */ m.position.set(0, -3.4 + 0.16 * H, -16); scene.add(m); }
    // the deep dark behind everything, so the fog has something to fade into
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, 80), new THREE.MeshBasicMaterial({ color: 0x05060b, fog: false })); m.position.set(0, 0, -30); scene.add(m); }
    // the cross-sections facing you: the soil under the floor and the rock over the ceiling
    const section = (y0, y1, top, colA, colB, band, edge) => { const g = new THREE.PlaneGeometry(W, Math.abs(y1 - y0), low ? 90 : 170, low ? 10 : 20), p = g.attributes.position, h = Math.abs(y1 - y0);
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), atEdge = top ? y > h / 2 - 0.01 : y < -h / 2 + 0.01; if (atEdge) p.setY(i, y + edge(x)); p.setZ(i, noise(x * 0.8, y) * 0.12); }
      g.computeVertexNormals(); const A = new THREE.Color(colA), B = new THREE.Color(colB), N = new THREE.Color(band);
      vc(g, (x, y, z, c) => { const n = noise(x * 0.3 + 3, y * 0.5); c.copy(A).lerp(B, Math.min(1, Math.max(0, 0.5 + n * 0.6 + (top ? -y : y) * 0.02))); if (Math.sin(y * 2.1 + n * 3) > 0.8) c.lerp(N, 0.5); });
      const m = new THREE.Mesh(g, vcm()); m.position.set(0, (y0 + y1) / 2, 2.6); scene.add(m); return m; };
    section(-16, 0, true, 0x3b2a20, 0x221812, 0x5a3f2a, (x) => Math.sin(x * 0.7) * 0.08 + noise(x, 0) * 0.06);
    section(9, 26, false, 0x2b2228, 0x1a1418, 0x463640, (x) => -Math.abs(noise(x * 0.6, 2)) * 0.9 - (Math.sin(x * 0.31) > 0.6 ? 0.8 : 0));
    // the floor (a thin top seen at a slant) and the ceiling's underside
    { const g = new THREE.PlaneGeometry(W, 6.4, 120, 6), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, noise(p.getX(i), p.getY(i)) * 0.06); g.computeVertexNormals();
      vc(g, (x, y, z, c) => c.set(0x4a3626).lerp(new THREE.Color(0x6b4d33), 0.5 + noise(x * 0.6, y) * 0.5)); const m = new THREE.Mesh(g, vcm()); m.rotation.x = -Math.PI / 2; m.position.set(0, 0, -0.5); scene.add(m); }
    // ore flecks in the soil: a few glints of what's down there
    { const geo = new THREE.OctahedronGeometry(0.16, 0), cols = [[0xd98a52, 60], [0xdbe6f5, 18], [0xffc94a, 8]];
      cols.forEach(([c, n], ci) => { const m = new THREE.InstancedMesh(geo, ci === 2 ? new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 }) : new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.35 }), n), o = new THREE.Object3D();
        for (let i = 0; i < n; i++) { o.position.set((rnd() - 0.5) * W, -1 - rnd() * 13, 2.75); o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); o.scale.setScalar(0.6 + rnd() * 1.2); o.updateMatrix(); m.setMatrixAt(i, o.matrix); } scene.add(m); }); }
    // stalactites under the ceiling, a few stalagmites at the back
    { const g = new THREE.ConeGeometry(0.35, 1, 5); g.translate(0, -0.5, 0); const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2026, flatShading: true, roughness: 0.9 }), BACK ? 26 : low ? 40 : 80), o = new THREE.Object3D();
      for (let i = 0; i < m.count; i++) { o.position.set((rnd() - 0.5) * W, 9.3 + rnd() * 0.3, 1.2 + rnd() * 1.2); o.scale.set(0.7 + rnd() * 0.9, 0.5 + rnd() * 1.3, 0.7 + rnd() * 0.9); o.rotation.y = rnd() * 3; o.updateMatrix(); m.setMatrixAt(i, o.matrix); } scene.add(m);
      const g2 = new THREE.ConeGeometry(0.45, 1, 5); g2.translate(0, 0.5, 0); const m2 = new THREE.InstancedMesh(g2, m.material, BACK ? 0 : 24);
      for (let i = 0; i < m2.count; i++) { o.position.set((rnd() - 0.5) * W, 0, -3.1 + rnd() * 0.6); o.scale.set(0.7 + rnd(), 0.6 + rnd() * 1.6, 0.7 + rnd()); o.updateMatrix(); m2.setMatrixAt(i, o.matrix); } scene.add(m2); }
    // glowing crystals in the wall (the ARCIRCLE mint and cyan), pulsing slowly
    const crysM = [new THREE.MeshStandardMaterial({ color: 0x4fe6c8, emissive: 0x4fe6c8, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.1, flatShading: true }), new THREE.MeshStandardMaterial({ color: 0x38d8ff, emissive: 0x38d8ff, emissiveIntensity: 1.2, roughness: 0.25, flatShading: true })];
    if (!BACK) { const g = new THREE.OctahedronGeometry(0.3, 0); g.scale(0.6, 1.6, 0.6); const o = new THREE.Object3D();
      crysM.forEach((mt, mi) => { const n = low ? 6 : 11, m = new THREE.InstancedMesh(g, mt, n * 3);
        for (let i = 0, j = 0; i < n; i++) { const cx = (rnd() - 0.5) * (W - 10), cy = rnd() < 0.6 ? 0.4 + rnd() * 1.6 : 7 + rnd() * 1.6, cz = -3.2; for (let q = 0; q < 3; q++, j++) { o.position.set(cx + (rnd() - 0.5) * 0.6, cy + (rnd() - 0.5) * 0.4, cz + 0.3); o.rotation.set((rnd() - 0.5) * 0.9, rnd() * 3, (rnd() - 0.5) * 1.2); o.scale.setScalar(0.45 + rnd() * 0.7); o.updateMatrix(); m.setMatrixAt(j, o.matrix); } }
        scene.add(m); void mi; }); }
    // timber supports every 8 m, a lantern hanging from each beam, rails along the back of the floor
    const wood = new THREE.MeshStandardMaterial({ color: 0x8c5a30, roughness: 0.85, flatShading: true }), woodD = new THREE.MeshStandardMaterial({ color: 0x55341c, roughness: 0.9, flatShading: true });
    const iron = new THREE.MeshStandardMaterial({ color: 0x59606c, metalness: 0.7, roughness: 0.4 }), flame = new THREE.MeshStandardMaterial({ color: 0xffb04a, emissive: 0xffa040, emissiveIntensity: 3 });
    const lampGlow = new THREE.SpriteMaterial({ map: radial("rgba(255,170,80,0.9)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const lanterns = [];
    { const postG = new THREE.BoxGeometry(0.42, 8.6, 0.42), beamG = new THREE.BoxGeometry(4.4, 0.5, 0.5), braceG = new THREE.BoxGeometry(0.26, 1.5, 0.26), chainG = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), cageG = new THREE.BoxGeometry(0.34, 0.48, 0.34), flameG = new THREE.SphereGeometry(0.13, 8, 6);
      for (let x = -CAVE + 2; x <= CAVE - 2; x += BACK ? 12 : 8) { const f = new THREE.Group(); f.position.set(x, 0, -2.4);
        [-2, 2].forEach((s) => { const p = new THREE.Mesh(postG, wood); p.position.set(s, 4.3, 0); f.add(p); const b = new THREE.Mesh(braceG, woodD); b.position.set(s * 0.72, 7.85, 0.05); b.rotation.z = s * 0.68; f.add(b); });
        const beam = new THREE.Mesh(beamG, woodD); beam.position.set(0, 8.6, 0); f.add(beam);
        const ch = new THREE.Mesh(chainG, iron); ch.position.set(0, 7.95, 0.3); f.add(ch); const cage = new THREE.Mesh(cageG, iron); cage.position.set(0, 7.35, 0.3); f.add(cage); const fl = new THREE.Mesh(flameG, flame); fl.position.copy(cage.position); f.add(fl);
        const gs = new THREE.Sprite(lampGlow); gs.scale.setScalar(3.4); gs.position.set(0, 7.35, 0.5); f.add(gs); lanterns.push({ x, y: 7.2, fl, gs, ph: rnd() * 6 }); scene.add(f); }
      [-1.55, -1.0].forEach((z) => { const r = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, 0.08), iron); r.position.set(0, 0.06, z); scene.add(r); });
      const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.06, 1), woodD, Math.floor(W / 1.2)), o = new THREE.Object3D();
      for (let i = 0; i < sl.count; i++) { o.position.set(-W / 2 + i * 1.2, 0.03, -1.28); o.updateMatrix(); sl.setMatrixAt(i, o.matrix); } scene.add(sl); }
    // the way out on the left: daylight from the tunnel, and a cart of ore by the exit
    { const day = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5), new THREE.MeshBasicMaterial({ map: radial("rgba(255,236,190,1)", "rgba(255,200,120,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); day.position.set(-CAVE - 0.4, 2.4, -2.9); day.scale.set(1.4, 1, 1); scene.add(day);
      const cart = new THREE.Group(); cart.position.set(-CAVE + 3.2, 0, -1.3); const tub = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.1), iron); tub.position.y = 0.75; cart.add(tub);
      [-0.6, 0.6].forEach((x) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.5 })); w.rotation.x = Math.PI / 2; w.position.set(x, 0.25, 0); cart.add(w); });
      for (let i = 0; i < 9; i++) { const c = i < 1 ? 0xffc94a : i < 3 ? 0xdbe6f5 : 0xd98a52, o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + rnd() * 0.12, 0), new THREE.MeshStandardMaterial({ color: c, metalness: 0.75, roughness: 0.3, emissive: i < 1 ? 0xffa800 : 0x000000, emissiveIntensity: 0.7 })); o.position.set((rnd() - 0.5) * 1.4, 1.25 + rnd() * 0.2, (rnd() - 0.5) * 0.6); cart.add(o); }
      scene.add(cart); extra.cart = cart; extra.cartWheels = cart.children.filter((c) => c.geometry && c.geometry.type === "CylinderGeometry"); }
    // the end walls (the cave stops here)
    [-1, 1].forEach((s) => { const g = new THREE.BoxGeometry(4, 11, 7), m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x241c22, roughness: 1, flatShading: true })); m.position.set(s * (CAVE + 3.4), 4.5, -0.8); scene.add(m); });
    // dust in the air: drifting motes, brighter in the lamplight
    const dustN = low ? 120 : 280, dpos = new Float32Array(dustN * 3), dsp = new Float32Array(dustN);
    for (let i = 0; i < dustN; i++) { dpos[i * 3] = (rnd() - 0.5) * W; dpos[i * 3 + 1] = rnd() * 9; dpos[i * 3 + 2] = -3 + rnd() * 5.5; dsp[i] = 0.2 + rnd() * 0.5; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.07, map: radial("rgba(255,220,170,1)"), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9a8 })); dust.frustumCulled = false; scene.add(dust);
    // flying bits: rock chips (a pool of little tetrahedra) and sparks (a pool of points)
    const chipN = 160, chips = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), chipN);
    chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage); chips.frustumCulled = false; const chipC = new THREE.Color(); for (let i = 0; i < chipN; i++) chips.setColorAt(i, chipC.set(0x6a5a50)); chips.count = chipN; scene.add(chips);
    const chipS = Array.from({ length: chipN }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 })); let chipI = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < chipN; i++) chips.setMatrixAt(i, zero);
    const sparkN = 140, spos = new Float32Array(sparkN * 3), scol = new Float32Array(sparkN * 3), sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(spos, 3)); sg.setAttribute("color", new THREE.BufferAttribute(scol, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.18, map: radial("rgba(255,255,255,1)"), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sparks.frustumCulled = false; scene.add(sparks);
    const sparkS = Array.from({ length: sparkN }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() })); let sparkI = 0;
    for (let i = 0; i < sparkN; i++) spos[i * 3 + 1] = -99;
    // rocks: four lumpy shapes, coloured per kind with ore spots, nuggets set into the surface
    const body = [0, 1, 2].map((t) => [0, 1, 2, 3].map((v) => { const g = new THREE.IcosahedronGeometry(1, low ? 1 : 2), p = g.attributes.position, q = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { q.fromBufferAttribute(p, i); const n = 1 + Math.sin(q.x * (2.1 + v) + v) * 0.12 + Math.sin(q.y * 3.3 - v * 2) * 0.09 + Math.sin(q.z * 4.1 + v) * 0.06; q.multiplyScalar(n); if (q.y < -0.35) q.y = -0.35 - (q.y + 0.35) * 0.2; q.x *= 1.25; p.setXYZ(i, q.x, q.y, q.z); }
      g.translate(0, 0.38, 0); g.computeVertexNormals(); const base = new THREE.Color([0x86705e, 0x737a92, 0x6a5440][t]), ore = new THREE.Color([0xe8894a, 0xf2f6ff, 0xffd34d][t]), dk = new THREE.Color(0x2a201a);
      vc(g, (x, y, z, c) => { const n = Math.sin(x * 5.3 + v) * Math.sin(y * 6.1 + z * 4.7 + v); c.copy(base).lerp(dk, Math.max(0, 0.3 - y) * 0.5); if (n > (t === 2 ? 0.45 : 0.55)) c.lerp(ore, 0.9); });
      return g; }));
    const bodyM = [new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.08 }), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.35 }), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0.3 })];
    const nugG = [new THREE.DodecahedronGeometry(0.19, 0), new THREE.OctahedronGeometry(0.21, 0), new THREE.IcosahedronGeometry(0.23, 0)];
    const nugM = [new THREE.MeshStandardMaterial({ color: 0xe08a4a, metalness: 0.8, roughness: 0.32, emissive: 0x5a2a10, emissiveIntensity: 0.3 }), new THREE.MeshStandardMaterial({ color: 0xeef3fb, metalness: 0.95, roughness: 0.15, emissive: 0x8fa6c8, emissiveIntensity: 0.25 }),
      new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 1, roughness: 0.22, emissive: 0xffa800, emissiveIntensity: 1 })];
    const glowM = [null, new THREE.SpriteMaterial({ map: radial("rgba(200,220,255,0.6)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }), new THREE.SpriteMaterial({ map: radial("rgba(255,200,60,0.95)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })];
    const starM = new THREE.SpriteMaterial({ map: starTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const shaftM = new THREE.MeshBasicMaterial({ map: shaftTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, fog: false });
    const crackT = crackTex(); crackT.repeat.set(0.25, 1);
    const barBg = new THREE.MeshBasicMaterial({ color: 0x0b0f1c, transparent: true, opacity: 0.75, depthTest: false }), barM = [0, 1, 2].map((t) => new THREE.MeshBasicMaterial({ color: [0xff9a5a, 0xdbe6f5, 0xffd34d][t], depthTest: false }));
    const barG = new THREE.PlaneGeometry(1, 0.16);
    // ---- b2: light, depth and life ----
    // warm light pools on the floor under each lantern (cheaper and softer than real lights)
    const poolM = new THREE.MeshBasicMaterial({ map: radial("rgba(255,168,80,0.9)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.5 });
    extra.pools = lanterns.map((l) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 3.4), poolM.clone()); m.rotation.x = -Math.PI / 2; m.position.set(l.x, 0.035, -1.1); m.renderOrder = 1; scene.add(m); return m; });
    // light rays from the way out on the left, slanting down into the cave
    { const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(255,236,200,0.9)"); gr.addColorStop(1, "rgba(255,220,170,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
      const sg = g.createLinearGradient(0, 0, 64, 0); sg.addColorStop(0, "rgba(0,0,0,1)"); sg.addColorStop(0.5, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(0,0,0,1)"); g.globalCompositeOperation = "destination-out"; g.fillStyle = sg; g.fillRect(0, 0, 64, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      extra.rays = [0, 1, 2, 3].map((i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + i * 0.5, 10), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.14 }));
        m.geometry.translate(0, -5, 0); m.position.set(-CAVE + 0.4 + i * 0.7, 5.6 - i * 0.3, -2.2 + i * 0.25); m.rotation.z = 0.62 + i * 0.12; m.userData.ph = i * 1.7; scene.add(m); return m; }); }
    // the floor's front edge: a row of cut stone blocks, like the painting's
    { const n = Math.floor(W / 1.35), m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), n * 2), o = new THREE.Object3D(), c = new THREE.Color();
      let x = -W / 2, j = 0; while (x < W / 2 && j < n) { const w = 1.0 + rnd() * 0.8; o.position.set(x + w / 2, -0.46, 2.62); o.scale.set(w - 0.08, 0.9 + rnd() * 0.12, 0.55); o.rotation.set((rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.04); o.updateMatrix(); m.setMatrixAt(j, o.matrix); m.setColorAt(j, c.setRGB(0.2 + rnd() * 0.07, 0.16 + rnd() * 0.05, 0.18 + rnd() * 0.05, THREE.SRGBColorSpace)); x += w; j++; }
      x = -W / 2 - 0.6; while (x < W / 2 && j < n * 2) { const w = 1.2 + rnd() * 0.9; o.position.set(x + w / 2, -1.42, 2.6); o.scale.set(w - 0.1, 0.95, 0.5); o.rotation.set(0, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.04); o.updateMatrix(); m.setMatrixAt(j, o.matrix); m.setColorAt(j, c.setRGB(0.12 + rnd() * 0.04, 0.1 + rnd() * 0.03, 0.11 + rnd() * 0.03, THREE.SRGBColorSpace)); x += w; j++; }
      m.count = j; scene.add(m); }
    // dark shapes right in front (depth): rocks at the bottom corners and stalactites at the top, between the play spots
    { const sil = new THREE.MeshBasicMaterial({ color: 0x06050a, fog: false }), g1 = new THREE.DodecahedronGeometry(1, 0), g2 = new THREE.ConeGeometry(0.6, 1, 5); g2.translate(0, -0.5, 0);
      for (let x = -CAVE - 2; x <= CAVE + 2; x += 9 + rnd() * 6) { const r = new THREE.Mesh(g1, sil); r.position.set(x, -2.3, 4.6); r.scale.set(1.2 + rnd() * 0.8, 1 + rnd() * 0.5, 0.8); r.rotation.z = rnd() * 3; scene.add(r);
        if (rich) { const st2 = new THREE.Mesh(g2, sil); st2.position.set(x + 4, 10.4, 4.4); st2.scale.set(1 + rnd(), 1.6 + rnd() * 1.6, 1); scene.add(st2); } } }
    // soft contact shadows: under the hero (and each rock, in makeRock)
    extra.blobM = new THREE.MeshBasicMaterial({ map: radial("rgba(0,0,0,0.7)"), transparent: true, depthWrite: false, opacity: 0.75 });
    extra.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.9), extra.blobM); extra.blob.rotation.x = -Math.PI / 2; extra.blob.position.set(0, 0.04, 0.35); scene.add(extra.blob);
    // life: bats far back, water drips with a splash, the ore cart rolling down the rails now and then
    { const c = document.createElement("canvas"); c.width = 64; c.height = 32; const g = c.getContext("2d"); g.fillStyle = "#07060c"; g.beginPath(); g.moveTo(32, 14); g.quadraticCurveTo(20, 2, 2, 8); g.quadraticCurveTo(12, 12, 10, 20); g.quadraticCurveTo(20, 14, 26, 22); g.lineTo(32, 18); g.lineTo(38, 22); g.quadraticCurveTo(44, 14, 54, 20); g.quadraticCurveTo(52, 12, 62, 8); g.quadraticCurveTo(44, 2, 32, 14); g.fill(); g.beginPath(); g.arc(32, 16, 4, 0, 7); g.fill();
      const bm = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, fog: false, color: 0x8890b8 });
      extra.bats = rich || !low ? [0, 1, 2].map(() => { const sp = new THREE.Sprite(bm); sp.scale.set(0.9, 0.45, 1); sp.position.set(0, -99, -9); sp.userData = { next: 4 + rnd() * 18, live: 0 }; scene.add(sp); return sp; }) : []; }
    extra.drips = [0, 1, 2, 3].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial("rgba(190,230,255,1)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(0.16); sp.position.set(0, -99, 0); sp.userData = { next: 1 + rnd() * 6, vy: 0, x: 0, z: 0 }; scene.add(sp); return sp; });
    // breaking up: rock chunks (one instanced set per kind, in the rock's own material), dust clouds, ore that flies to you, a shockwave
    extra.chunkG = new THREE.DodecahedronGeometry(0.42, 0);
    extra.chunks = [0, 1, 2].map((t) => { const mat = (MODELS && MODELS[t] && MODELS[t].userData.mat) || bodyM[t]; const m = new THREE.InstancedMesh(extra.chunkG, mat, 18); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; for (let i = 0; i < 18; i++) m.setMatrixAt(i, zero); scene.add(m); return { m, s: Array.from({ length: 18 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), k: 1 })), i: 0, dirty: false }; });
    { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); for (let i = 0; i < 14; i++) { const x = 34 + Math.random() * 60, y = 34 + Math.random() * 60, r = 18 + Math.random() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(150,130,112,0.5)"); gr.addColorStop(1, "rgba(150,130,112,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      extra.puffs = Array.from({ length: low ? 4 : 8 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 })); sp.position.set(0, -99, 0); sp.userData = { life: 0 }; scene.add(sp); return sp; }); extra.puffI = 0; }
    extra.nugs = [0, 1, 2].map((t) => { const m = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11, 0), nugM[t], 16); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; for (let i = 0; i < 16; i++) m.setMatrixAt(i, zero); scene.add(m); return { m, s: Array.from({ length: 16 }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0 })), i: 0, dirty: false }; });
    { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 40, 64, 64, 62); gr.addColorStop(0, "rgba(255,220,120,0)"); gr.addColorStop(0.6, "rgba(255,230,150,0.95)"); gr.addColorStop(1, "rgba(255,200,80,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; extra.wave = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false })); extra.wave.position.set(0, -99, 0); extra.wave.userData = { life: 0 }; scene.add(extra.wave); }
    // the pickaxe's trail through the swing (a short ribbon of glowing points)
    { const n = 14, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); for (let i = 0; i < n; i++) pos[i * 3 + 1] = -99;
      extra.trail = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, map: radial("rgba(255,255,255,1)"), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); extra.trail.frustumCulled = false; extra.trailN = n; extra.trailH = []; scene.add(extra.trail); }
    // bloom on a computer: the lanterns, the gold and the crystals glow into the air (phones skip it)
    if (rich && st.quality && st.quality.bloom && ctx.K && ctx.K.POSTFX) { try { const P = ctx.K.POSTFX, comp = new P.EffectComposer(st.renderer); comp.addPass(new P.RenderPass(scene, cam)); comp.addPass(new P.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.8)); comp.addPass(new P.OutputPass()); extra.comp = comp; } catch (e) { console.warn("mine bloom:", e); } }
    S = { scene, cam, head, lampL, goldL, lanterns, dust, dpos, dsp, dustN, chips, chipS, chipN, get chipI() { return chipI; }, set chipI(v) { chipI = v; }, sparks, spos, scol, sparkS, sparkN, get sparkI() { return sparkI; }, set sparkI(v) { sparkI = v; },
      body, bodyM, nugG, nugM, glowM, starM, shaftM, crackT, barBg, barM, barG, crysM, zero, rnd, dist: 30, withModels: !!(MODELS && MODELS.length), hemiL: hemi, ...extra };
  }

  // ---------------- rocks ----------------
  function makeRock(d, born = true) {
    const g = new THREE.Group(), t = d.t, rnd = S.rnd, sc = [0.92, 1.05, 1.18][t] * (0.92 + rnd() * 0.16);
    const shape = new THREE.Group(); g.add(shape);
    const M = MODELS && MODELS[t]; let w = 2.2 * sc, hgt = 1.7 * sc, dep = 2 * sc;
    if (M) { const b = M.clone(); b.scale.setScalar(sc); b.rotation.y = (rnd() - 0.5) * 0.9; shape.add(b); w = M.userData.w * sc; hgt = M.userData.h * sc; dep = M.userData.d * sc; }
    else { const b = new THREE.Mesh(S.body[t][Math.floor(rnd() * 4)], S.bodyM[t]); b.scale.setScalar(sc); b.rotation.y = rnd() * 6.3; shape.add(b); }
    const nugs = []; const n = M ? 0 : [5, 6, 8][t];
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, y = 0.25 + rnd() * 0.85; const m = new THREE.Mesh(S.nugG[t], S.nugM[t]); m.position.set(Math.cos(a) * 1.15 * sc * (1 - (y - 0.4) * 0.3), y * sc, Math.abs(Math.sin(a)) * 0.9 * sc + 0.05); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); m.scale.setScalar(0.9 + rnd() * 0.8); shape.add(m); nugs.push(m); }
    let glow = null, stars = [], shaft = null;
    if (t >= 1) { glow = new THREE.Sprite(S.glowM[t]); glow.scale.setScalar(t === 2 ? 4.2 : 2.6); glow.position.set(0, 0.7, 0.4); g.add(glow); }
    if (t >= 1 && !low) for (let i = 0; i < (t === 2 ? 6 : 2); i++) { const s = new THREE.Sprite(S.starM); const nu = nugs[i % Math.max(1, nugs.length)]; if (nu) s.position.copy(nu.position).add(new THREE.Vector3(0, 0, 0.2)); else s.position.set((rnd() - 0.5) * w * 0.7, hgt * (0.3 + rnd() * 0.6), dep * 0.45); s.scale.setScalar(0); s.userData.ph = rnd() * 6; s.userData.k = t === 2 ? 0.9 : 0.5; shape.add(s); stars.push(s); }
    if (t === 2) { shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7), S.shaftM); shaft.position.set(0, 3.6, -0.2); g.add(shaft); }
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * sc, 1.6 * sc), new THREE.MeshBasicMaterial({ map: S.crackT.clone(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); crack.material.map.repeat.set(0.25, 1); crack.position.set(0, hgt * 0.45, M ? dep * 0.5 + 0.04 : 1.02 * sc); shape.add(crack);
    const bar = new THREE.Group(), bb = new THREE.Mesh(S.barG, S.barBg), bf = new THREE.Mesh(S.barG, S.barM[t]); bb.scale.set(1.5, 1, 1); bf.scale.set(1.44, 0.62, 1); bf.position.z = 0.01; bar.add(bb, bf); bar.position.set(0, (M ? hgt : 2.05 * sc) + 0.3, 0.6); bar.renderOrder = 5; bb.renderOrder = 5; bf.renderOrder = 6; bar.visible = false; g.add(bar);
    g.position.set(SLOT_X(d.x), 0, -0.55);
    if (S.blobM) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.35, dep * 0.9), S.blobM); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; g.add(sh); }
    S.scene.add(g);
    const r = { id: d.id, t, h: d.h, hits: 0, g, shape, nugs, glow, stars, shaft, crack, bar, bf, sc, w, hgt, x: SLOT_X(d.x), born: born ? 0 : 1, shake: 0, breaking: false, gone: false, squash: 0 };
    if (born) { shape.scale.setScalar(0.01); dustPuff(r.x, 0.2, 10, 0x8a7a6a); }
    rocks.set(d.id, r); return r;
  }
  function dropRock(r) { if (!r || r.gone) return; r.gone = true; S.scene.remove(r.g); r.crack.material.map.dispose(); r.crack.material.dispose(); r.crack.geometry.dispose(); if (r.shaft) r.shaft.geometry.dispose(); rocks.delete(r.id); if (target === r) target = null; }
  function syncRocks(list) {
    if (!Array.isArray(list)) return; const ids = new Set(list.map((x) => x.id));
    for (const r of [...rocks.values()]) if (!ids.has(r.id) && !r.breaking) dropRock(r);
    for (const d of list) if (!rocks.has(d.id)) makeRock(d, true); else { const r = rocks.get(d.id); r.h = d.h; }
  }

  // ---------------- effects ----------------
  function chip(x, y, z, color, n, power = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { const s = S.chipS[S.chipI]; S.chips.setColorAt(S.chipI, c); S.chipI = (S.chipI + 1) % S.chipN;
      s.life = 0.9 + Math.random() * 0.6; s.p.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.4, z + Math.random() * 0.5); s.v.set((Math.random() - 0.5) * 6 * power, (2.5 + Math.random() * 5) * power, (Math.random() * 2.5) * power);
      s.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12); s.s = 0.6 + Math.random() * 1.1; }
    if (S.chips.instanceColor) S.chips.instanceColor.needsUpdate = true;
  }
  function spark(x, y, z, color, n, power = 1, life = 0.5, bias = 0) {
    for (let i = 0; i < n; i++) { const s = S.sparkS[S.sparkI]; S.sparkI = (S.sparkI + 1) % S.sparkN; s.life = s.max = life * (0.6 + Math.random() * 0.8); s.c.set(color);
      s.p.set(x, y, z + 0.3); const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 6) * power; s.v.set(Math.cos(a) * sp + bias * sp * 0.8, Math.abs(Math.sin(a)) * sp * 0.9 + 1.5, (Math.random() - 0.2) * 2); } sparkLive = 1.5;
  }
  // the rock breaks up: chunks of it tumble out, a dust cloud rolls, the ore inside flies to you; gold sends out a ring
  function fracture(r) {
    const C = S.chunks && S.chunks[r.t]; if (!C) return; const n = [5, 6, 7][r.t];
    for (let i = 0; i < n; i++) { const s = C.s[C.i]; C.i = (C.i + 1) % C.s.length; const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      s.life = 1.5 + Math.random() * 0.5; s.p.set(r.x + Math.cos(a) * r.w * 0.25, r.hgt * (0.3 + Math.random() * 0.5), -0.4 + Math.random() * 0.6); s.v.set(Math.cos(a) * (2.5 + Math.random() * 3), 4 + Math.random() * 5, Math.random() * 2.2); s.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14); s.k = (0.55 + Math.random() * 0.7) * r.sc; }
    C.dirty = true;
  }
  function puff(x, y, k = 1) { const P = S.puffs; if (!P) return; for (let i = 0; i < 2 + Math.round(k); i++) { const sp = P[S.puffI]; S.puffI = (S.puffI + 1) % P.length; sp.position.set(x + (Math.random() - 0.5) * 1.2, y + Math.random() * 0.4, 0.4); sp.userData.life = 1; sp.userData.k = k * (1.4 + Math.random() * 0.8); sp.userData.vx = (Math.random() - 0.5) * 0.8; sp.material.rotation = Math.random() * 6; } }
  function oreOut(r, n) { const N = S.nugs && S.nugs[r.t]; if (!N) return; for (let i = 0; i < n; i++) { const s = N.s[N.i]; N.i = (N.i + 1) % N.s.length; s.life = 1; s.age = 0; s.p.set(r.x + (Math.random() - 0.5) * r.w * 0.5, r.hgt * 0.6, 0.2); s.v.set((Math.random() - 0.5) * 5, 4 + Math.random() * 4, Math.random() * 1.5); } N.dirty = true; }
  function ring(x, y, big) { const w = S.wave; if (!w || reduce) return; w.position.set(x, y, 0.6); w.userData.life = 1; w.userData.big = big ? 1 : 0.5; w.material.color.set(big ? 0xffe08a : 0xdbe6f5); }
  function tickBreak(dt) {
    for (const C of S.chunks || []) { if (!C.dirty) continue; let any = false;
      for (let i = 0; i < C.s.length; i++) { const s = C.s[i]; if (s.life <= 0) { C.m.setMatrixAt(i, S.zero); continue; } any = true; s.life -= dt; s.v.y -= 20 * dt; s.p.addScaledVector(s.v, dt);
        if (s.p.y < 0.2 * s.k) { s.p.y = 0.2 * s.k; s.v.y *= -0.32; s.v.x *= 0.7; s.v.z *= 0.6; s.w.multiplyScalar(0.7); }
        s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt; tmpO.position.copy(s.p); tmpO.rotation.copy(s.r); tmpO.scale.setScalar(s.k * Math.min(1, s.life / 0.4)); tmpO.updateMatrix(); C.m.setMatrixAt(i, tmpO.matrix); }
      C.m.instanceMatrix.needsUpdate = true; C.dirty = any; }
    const hx = px, hy = 1.1;
    for (const N of S.nugs || []) { if (!N.dirty) continue; let any = false;
      for (let i = 0; i < N.s.length; i++) { const s = N.s[i]; if (s.life <= 0) { N.m.setMatrixAt(i, S.zero); continue; } any = true; s.age += dt;
        if (s.age < 0.5) { s.v.y -= 16 * dt; s.p.addScaledVector(s.v, dt); if (s.p.y < 0.12) { s.p.y = 0.12; s.v.y *= -0.4; } }
        else { const k = Math.min(1, (s.age - 0.5) * 3.2); s.p.x += (hx - s.p.x) * Math.min(1, dt * (4 + k * 14)); s.p.y += (hy - s.p.y) * Math.min(1, dt * (4 + k * 14)); s.p.z += (0.4 - s.p.z) * Math.min(1, dt * 8);
          if (Math.abs(s.p.x - hx) < 0.35 && Math.abs(s.p.y - hy) < 0.35) { s.life = 0; spark(hx, hy, 0.5, 0xfff2b0, 2, 0.3, 0.25); if (Snd.pick) Snd.pick(); } }
        tmpO.position.copy(s.p); tmpO.rotation.set(s.age * 9, s.age * 7, 0); tmpO.scale.setScalar(s.life > 0 ? 1.4 : 0); tmpO.updateMatrix(); N.m.setMatrixAt(i, tmpO.matrix); }
      N.m.instanceMatrix.needsUpdate = true; N.dirty = any; }
    for (const sp of S.puffs || []) { const u = sp.userData; if (u.life <= 0) continue; u.life -= dt / 1.3; sp.position.y += dt * 0.5; sp.position.x += u.vx * dt; sp.scale.setScalar(u.k * (1 + (1 - u.life) * 1.8)); sp.material.opacity = Math.max(0, u.life) * 0.75; if (u.life <= 0) sp.position.y = -99; }
    const w = S.wave; if (w && w.userData.life > 0) { const u = w.userData; u.life -= dt / 0.65; const e = 1 - u.life; w.scale.setScalar((1 + e * 9) * u.big * 1.4); w.material.opacity = Math.max(0, u.life); if (u.life <= 0) w.position.y = -99; }
  }
  // the cave alive: lantern pools flicker with their flames, rays drift, bats cross the dark, water drips, the cart rolls by
  function tickLife(dt, t) {
    if (S.pools) S.pools.forEach((m, i) => { const l = S.lanterns[i]; m.material.opacity = 0.42 + Math.sin(t * 9 + l.ph) * 0.05 + Math.sin(t * 23 + l.ph * 2) * 0.03; });
    if (S.rays) S.rays.forEach((m) => { m.material.opacity = 0.1 + Math.sin(t * 0.5 + m.userData.ph) * 0.05; });
    for (const b of S.bats || []) { const u = b.userData; if (u.live > 0) { u.live -= dt; b.position.x += u.vx * dt; b.position.y = u.y + Math.sin(t * 3 + u.ph) * 0.6; b.scale.y = 0.45 * (0.45 + Math.abs(Math.sin(t * 16 + u.ph)) * 0.7); if (u.live <= 0) b.position.y = -99; }
      else if ((u.next -= dt) <= 0) { u.next = 12 + Math.random() * 25; u.live = 9; const L = Math.random() < 0.5; u.vx = (L ? 1 : -1) * (5 + Math.random() * 3); b.position.set(px + (L ? -26 : 26), 0, -9 - Math.random() * 3); u.y = 5 + Math.random() * 3; u.ph = Math.random() * 6; } }
    for (const d of S.drips || []) { const u = d.userData; if (u.vy) { u.vy -= 14 * dt; d.position.y += u.vy * dt; if (d.position.y <= 0.05) { spark(d.position.x, 0.06, d.position.z, 0x9fdcff, 5, 0.25, 0.45); d.position.y = -99; u.vy = 0; } }
      else if ((u.next -= dt) <= 0) { u.next = 2.5 + Math.random() * 5; d.position.set(px + (Math.random() - 0.5) * 18, 8.8, -1.5 + Math.random() * 2.5); u.vy = -0.01; } }
    if (S.cart) { const ph = (t % 70) / 70, a = -CAVE + 3.2, b = CAVE - 3.2; let x = a, v = 0; if (ph < 0.2) { const e = ph / 0.2; x = a + (b - a) * (e * e * (3 - 2 * e)); v = 1; } else if (ph < 0.5) x = b; else if (ph < 0.7) { const e = (ph - 0.5) / 0.2; x = b + (a - b) * (e * e * (3 - 2 * e)); v = -1; }
      const dx = x - S.cart.position.x; S.cart.position.x = x; if (S.cartWheels) S.cartWheels.forEach((w) => { w.rotation.y -= dx / 0.24; }); void v; }
    if (S.blob && hero) { S.blob.position.x = px; S.blob.material.opacity = swingT > 0 ? 0.85 : 0.75; }
  }
  function dustPuff(x, y, n, color) { chip(x, y, -0.2, color, Math.min(n, 10), 0.35); spark(x, y + 0.3, 0, 0xc8b8a0, n, 0.35, 0.8); }
  let sparkLive = 0;
  function tickFx(dt) {
    const o = tmpO, m = tmpM; let any = false;
    for (let i = 0; i < S.chipN; i++) { const s = S.chipS[i]; if (s.life <= 0) continue; any = true; s.life -= dt; s.v.y -= 22 * dt; s.p.addScaledVector(s.v, dt); if (s.p.y < 0.05) { s.p.y = 0.05; s.v.y *= -0.35; s.v.x *= 0.6; s.v.z *= 0.6; }
      s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt; o.position.copy(s.p); o.rotation.copy(s.r); o.scale.setScalar(s.life <= 0 ? 0 : s.s * Math.min(1, s.life * 2.5)); o.updateMatrix(); S.chips.setMatrixAt(i, s.life <= 0 ? S.zero : o.matrix); }
    if (any || S.chipsDirty) { S.chips.instanceMatrix.needsUpdate = true; S.chipsDirty = any; }
    if (sparkLive <= 0) return; sparkLive -= dt; // nothing flying: no buffer uploads
    const P = S.spos, C = S.scol;
    for (let i = 0; i < S.sparkN; i++) { const s = S.sparkS[i]; if (s.life <= 0) { P[i * 3 + 1] = -99; continue; } s.life -= dt; s.v.y -= 9 * dt; s.v.multiplyScalar(1 - dt * 1.5); s.p.addScaledVector(s.v, dt); const k = Math.max(0, s.life / s.max);
      P[i * 3] = s.p.x; P[i * 3 + 1] = s.p.y; P[i * 3 + 2] = s.p.z; C[i * 3] = s.c.r * k; C[i * 3 + 1] = s.c.g * k; C[i * 3 + 2] = s.c.b * k; }
    S.sparks.geometry.attributes.position.needsUpdate = true; S.sparks.geometry.attributes.color.needsUpdate = true;
    void m;
  }
  const tmpO = new THREE.Object3D(), tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
  // a number or a word floating up from the rock (DOM text: crisp at any size)
  function pop(x, y, html, cls) {
    if (!ui) return; tmpV.set(x, y, 0).project(S.cam); const el = document.createElement("div"); el.className = "wm-pop " + (cls || ""); el.innerHTML = html;
    el.style.left = ((tmpV.x * 0.5 + 0.5) * 100).toFixed(2) + "%"; el.style.top = ((-tmpV.y * 0.5 + 0.5) * 100).toFixed(2) + "%"; ui.pops.appendChild(el);
    setTimeout(() => el.remove(), cls && cls.includes("big") ? 2600 : 1500);
  }
  // the haul flies from the rock to the counter
  function flyCoins(x, y, n, gold) {
    if (!ui || reduce) return; tmpV.set(x, y, 0).project(S.cam); const box = ui.root.getBoundingClientRect(), to = ui.haul.getBoundingClientRect();
    const sx = box.left + (tmpV.x * 0.5 + 0.5) * box.width, sy = box.top + (-tmpV.y * 0.5 + 0.5) * box.height;
    for (let i = 0; i < n; i++) { const c = document.createElement("i"); c.className = "wm-coin" + (gold ? " gold" : ""); c.style.left = sx + "px"; c.style.top = sy + "px"; document.body.appendChild(c);
      const dx = to.left + to.width * 0.2 - sx, dy = to.top + to.height / 2 - sy, mx = (Math.random() - 0.5) * 120, my = -60 - Math.random() * 90;
      const a = c.animate([{ transform: "translate(-50%,-50%) scale(.6)", opacity: 0 }, { transform: `translate(calc(-50% + ${mx}px),calc(-50% + ${my}px)) scale(1.1)`, opacity: 1, offset: 0.35 }, { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.55)`, opacity: 0.9 }], { duration: 750 + i * 45, easing: "cubic-bezier(.3,.6,.4,1)", delay: i * 35 });
      a.onfinish = () => { c.remove(); if (i === n - 1) { ui.haul.classList.remove("bump"); void ui.haul.offsetWidth; ui.haul.classList.add("bump"); Snd.coin && Snd.coin(); } }; }
  }
  function flash(color, k = 1) { if (!ui || reduce) return; ui.flash.style.background = color; ui.flash.style.opacity = String(0.55 * k); requestAnimationFrame(() => { ui.flash.style.transition = "opacity .7s ease-out"; ui.flash.style.opacity = "0"; setTimeout(() => { ui.flash.style.transition = ""; }, 700); }); }

  // ---------------- the hero and the pickaxe ----------------
  const PICK_LOOK = [{ head: 0x8d96a3, handle: 0x8a5a32, em: 0, emK: 0 }, { head: 0xbcd6f4, handle: 0x3e2a1c, em: 0x5aa8ff, emK: 0.35 }, { head: 0xb48cff, handle: 0x2a2246, em: 0xa070ff, emK: 0.9 }, { head: 0xffd34d, handle: 0x5a2a10, em: 0xffa800, emK: 0.85 }];
  function makePick(tr) {
    const L = PICK_LOOK[tr] || PICK_LOOK[0], g = new THREE.Group(); g.name = "pickaxe";
    const hm = new THREE.MeshStandardMaterial({ color: L.handle, roughness: 0.7 }), mm = new THREE.MeshStandardMaterial({ color: L.head, metalness: tr === 2 ? 0.2 : 0.9, roughness: tr === 2 ? 0.15 : 0.28, emissive: L.em, emissiveIntensity: L.emK, flatShading: tr === 2 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.0, 8), hm); handle.position.y = 0.38; g.add(handle);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.9 })); grip.position.y = -0.02; g.add(grip);
    const sock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.13), mm); sock.position.y = 0.86; g.add(sock); g.userData.head = sock;
    [-1, 1].forEach((s) => { const arm = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.5, 6), mm); arm.rotation.z = s * (Math.PI / 2 + 0.28); arm.position.set(s * 0.27, 0.8, 0); g.add(arm); });
    if (tr >= 2) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(tr === 3 ? "rgba(255,200,80,0.9)" : "rgba(180,140,255,0.9)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(0.9); sp.position.y = 0.84; g.add(sp); }
    if (tr >= 1) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), mm); band.rotation.x = Math.PI / 2; band.position.y = 0.62; g.add(band); }
    g.scale.setScalar(1.25); return g;
  }
  function holdPick() {
    if (!hero) return; if (pick && pick.parent) pick.parent.remove(pick); pick = makePick(tier);
    const bn = hero.bones && hero.bones["arm-right"]; let bone = null; if (bn) hero.obj.traverse((o) => { if (!bone && o.name === bn) bone = o; });
    if (bone) { hero.obj.updateMatrixWorld(true); const ws = new THREE.Vector3(); bone.getWorldScale(ws); const w = new THREE.Group(); w.scale.setScalar(1 / (ws.x || 1)); w.add(pick); bone.add(w); pick.userData.wrap = w; }
    else { pick.position.set(0.45, 0.95, 0.25); pick.rotation.z = -0.4; hero.obj.add(pick); pick.userData.bot = true; }
  }
  async function makeHero() {
    if (hero) return;
    try { hero = await ctx.makeHero(); } catch { hero = null; }
    if (!hero) return;
    hero.obj.position.set(px, 0, 0.35); S.scene.add(hero.obj); holdPick();
  }

  // ---------------- the HUD ----------------
  function buildUi() {
    const root = document.createElement("div"); root.id = "wp-mine"; root.className = "wm"; root.hidden = true;
    root.innerHTML = `<div class="wm-vig"></div><div class="wm-flash"></div><div class="wm-pops"></div>
      <div class="wm-top" data-game-hud><i class="wm-frame" aria-hidden="true"></i>
        <button type="button" class="wm-leave" aria-label="${esc(T("Leave the mine"))}"><svg viewBox="0 0 24 24"><path d="M15 4 7 12l8 8"/></svg><span>${esc(T("Leave"))}</span></button>
        <div class="wm-time"><i class="wm-gem"></i><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.4" class="tk"/><circle cx="20" cy="20" r="15" class="bg"/><circle cx="20" cy="20" r="15" class="fg" pathLength="100"/><circle cx="20" cy="5" r="1.9" class="tip"/></svg><b>60:00</b><small>${esc(T("left"))}</small></div>
        <div class="wm-haul"><i class="wm-coin-ic"></i><span><b>0</b><small>${esc(T("ARCL this visit"))}</small></span></div>
        <div class="wm-rocks"><i class="wm-cart-ic"></i><span><small>${esc(T("Rocks"))}</small><b>×0</b></span></div>
        <button type="button" class="wm-pickbtn"><span class="wm-pick-ic"></span><b>${esc(T("Common"))}</b></button>
      </div>
      <div class="wm-today"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg><span></span></div>
      <div class="wm-ctl"><button type="button" class="wm-l" aria-label="${esc(T("Left"))}"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg></button><button type="button" class="wm-r" aria-label="${esc(T("Right"))}"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></div>
      <button type="button" class="wm-go" aria-label="${esc(T("Mine"))}"><i class="wm-go-ring" aria-hidden="true"></i><span class="wm-go-ic"></span><b>${esc(T("MINE"))}</b></button>
      <div class="wm-keys">${esc(T("A / D move · Space or J mine · Esc leave"))}</div>
      <div class="wm-sheet" hidden></div>
      <div class="wm-title" hidden><small>${esc(T("ARCIRCLE WORLD"))}</small><b>${esc(T("ARCL MINE"))}</b><span></span></div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    ui = { root, pops: q(".wm-pops"), flash: q(".wm-flash"), time: q(".wm-time b"), ring: q(".wm-time .fg"), tip: q(".wm-time .tip"), haul: q(".wm-haul"), haulN: q(".wm-haul b"), pickB: q(".wm-pickbtn"), pickN: q(".wm-pickbtn b"), today: q(".wm-today span"), todayBox: q(".wm-today"), rocksN: q(".wm-rocks b"), sheet: q(".wm-sheet"), title: q(".wm-title"), go: q(".wm-go") };
    q(".wm-leave").addEventListener("click", () => leave(false));
    ui.pickB.addEventListener("click", () => openPicks());
    const hold = (el, on, off) => { el.addEventListener("pointerdown", (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } on(); }); ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => el.addEventListener(ev, off)); };
    hold(q(".wm-l"), () => { moveIn = -1; walkTo = null; }, () => { if (moveIn < 0) moveIn = 0; });
    hold(q(".wm-r"), () => { moveIn = 1; walkTo = null; }, () => { if (moveIn > 0) moveIn = 0; });
    hold(ui.go, () => { mineHeld = true; ui.go.classList.add("on"); }, () => { mineHeld = false; ui.go.classList.remove("on"); });
    root.querySelector(".wm-pick-ic").innerHTML = ctx.art ? ctx.art("pickaxe", 26) : "⛏"; root.querySelector(".wm-go-ic").innerHTML = ctx.art ? ctx.art("pickaxe", 44) : "⛏";
    root.querySelector(".wm-coin-ic").innerHTML = ctx.art ? ctx.art("coin", 40) : ""; root.querySelector(".wm-cart-ic").innerHTML = CART;
  }
  function paintHud() {
    if (!ui) return; const l = Math.max(0, left - (performance.now() - leftAt));
    ui.time.textContent = mmss(l); const f = Math.max(0, Math.min(1, l / R.SESSION_MS)), a = f * Math.PI * 2; // the arc runs clockwise from the top to what's left; the bright tip rides its end
    ui.ring.style.strokeDashoffset = String(100 * (1 - f)); ui.tip.setAttribute("cx", (20 + Math.sin(a) * 15).toFixed(2)); ui.tip.setAttribute("cy", (20 - Math.cos(a) * 15).toFixed(2));
    ui.root.classList.toggle("late", l < 5 * 60e3);
    ui.haulN.textContent = fmtN(haul); ui.pickN.textContent = T(R.TIERS[tier].name); ui.pickB.dataset.tier = String(tier);
    ui.today.innerHTML = (guest ? esc(T("Demo: connect your wallet to earn ARCL here")) : esc(T("Today {n} / {m} ARCL", { n: fmtN(today), m: fmtN(cap) }))) + (rush ? ` <b class="wm-rush">${esc(T("Gold Rush"))}</b>` : "") + (deep ? ` <b class="wm-deepb">${esc(T("Deep mine"))}</b>` : "");
    ui.todayBox.classList.toggle("demo", guest); ui.rocksN.textContent = "×" + broke;
  }
  function hideSheet() { if (ui) { ui.sheet.hidden = true; ui.sheet.innerHTML = ""; } }
  // the pickaxes: what each does, what it costs, the one you hold
  // the mine's sheet, three tabs (b5): the pickaxes (buy, upgrade, the deep mine), your ore (the smelter, the gem codex),
  // and the week's board. Opened from the HUD's pickaxe button, or by the miner in the village (openShop)
  let sheetTab = "picks", inv = null, deepOk = false, rush = false, deep = false, hold = 0;
  const ORE_N = ["Copper", "Silver", "Gold"], ORE_K = ["cu", "ag", "au"], GEM_N = { sap: "Sapphire", ruby: "Ruby", dia: "Diamond" }, GEM_C = { sap: "#4f8dff", ruby: "#ff4d6d", dia: "#bff4ff" };
  const oreIc = (k, n = 18) => `<i class="wm-ore ${k}" style="width:${n}px;height:${n}px"></i>`;
  async function refreshView() { const s = ctx.sess(); if (!s) return null; try { const r = await fetch("/api/social?world=mine&board=1&wallet=" + s.wallet, { cache: "no-store" }); if (!r.ok) return null; const j = await r.json(); inv = j.inv || inv; deepOk = !!j.deepOk; rush = !!j.rush; hold = j.hold || 0; return j; } catch { return null; } }
  function openPicks(tab) { openSheet(tab || "picks"); }
  async function openSheet(tab) {
    if (!ui) return; sheetTab = tab || sheetTab; const owns = (id) => !id || (ctx.shop && ctx.shop.owns && ctx.shop.owns(id));
    const tabs = `<div class="wm-tabs">${[["picks", "Pickaxes"], ["ores", "Ores"], ["board", "This week"]].map(([k, n]) => `<button type="button" data-tab="${k}"${k === sheetTab ? ' class="on"' : ""}>${esc(T(n))}</button>`).join("")}</div>`;
    let body = "";
    if (sheetTab === "picks") {
      const card = (t, i) => { const have = owns(t.id), held = i === tier, cut = Math.round((1 - t.k) * 100), faster = Math.round((R.TIERS[0].every / t.every - 1) * 100);
        return `<div class="wm-pc t${i}${held ? " held" : ""}"><div class="wm-pc-art">${ctx.art ? ctx.art("pickaxe", 40) : "⛏"}</div><div class="wm-pc-txt"><b>${esc(T(t.name + " Pickaxe"))}</b>
          <small>${i ? esc(T("{n}% fewer hits a rock", { n: cut })) + " · " + esc(T("rocks {n}% faster", { n: faster })) : esc(T("Copper in 10–20 hits"))}</small></div>
          <div class="wm-pc-act">${held ? `<em>${esc(T("In hand"))}</em>` : have ? `<em>${esc(T("Owned"))}</em>` : `<button type="button" class="wm-buy" data-id="${t.id}">${fmtN(t.tokens)} $ARCIRCLE</button>`}</div></div>`; };
      const lv = inv ? inv.lv || 0 : 0, nx = inv && inv.next, cost = nx ? [nx.cu ? `${oreIc("cu")}${nx.cu}` : "", nx.ag ? `${oreIc("ag")}${nx.ag}` : "", nx.au ? `${oreIc("au")}${nx.au}` : "", `${fmtN(nx.arcl)} ARCL`].filter(Boolean).join(" ") : "";
      const can = nx && inv && ["cu", "ag", "au"].every((k) => (nx[k] || 0) <= (inv[k] || 0));
      body = `<p>${esc(T("A better pickaxe breaks rocks in fewer hits, and more rocks turn up in your hour. You always mine with the best one you own."))}</p>${R.TIERS.map(card).join("")}
        <div class="wm-upg"><div><b>${esc(T("Upgrade"))} <span class="wm-lv">+${lv}</span></b><small>${esc(T("Each level: 4% fewer hits a rock, up to +10"))}</small></div>
          ${guest ? `<em>${esc(T("Sign in with your wallet first"))}</em>` : !inv ? `<em>${esc(T("Loading…"))}</em>` : nx ? `<button type="button" class="wm-up"${can ? "" : " disabled"}>${esc(T("+1 for"))} ${cost}</button>` : `<em>${esc(T("+10, the most"))}</em>`}</div>
        ${inv && inv.trialUntil > Date.now() ? `<p class="wm-trial">${esc(T("Advanced Pickaxe trial: {t} left", { t: hm(inv.trialUntil - Date.now()) }))}</p>` : ""}
        ${deepOk ? `<button type="button" class="wm-deep">${esc(deep ? T("Back to the mine") : T("Go down to the deep mine (Lv 90+): tougher rocks, more gold"))}</button>` : ""}
        <p class="wm-odds">${esc(T("Copper 10–100 · Silver 100–1,000 · Gold 1,000–10,000 ARCL. About 1 rock in 5 is empty. Gold is rare, and a full 10,000 far rarer."))}</p>`;
    } else if (sheetTab === "ores") {
      if (guest || !inv) body = `<p>${esc(T("Ore pieces and gems are kept for signed-in miners. Connect your wallet to collect them."))}</p>`;
      else body = `<p>${esc(T("Every rock that isn't empty gives ore pieces. Use them to upgrade your pickaxe, or smelt them into scrap for your gear."))}</p>
        <div class="wm-ores">${ORE_K.map((k, i) => { const m = { cu: [10, 15], ag: [5, 40], au: [1, 60] }[k]; return `<div class="wm-oreb ${k}">${oreIc(k, 30)}<b>${fmtN(inv[k] || 0)}</b><span>${esc(T(ORE_N[i]))}</span><button type="button" class="wm-smelt" data-ore="${k}"${(inv[k] || 0) < m[0] ? " disabled" : ""}>${esc(T("Smelt {a} → {b} scrap", { a: m[0], b: m[1] }))}</button></div>`; }).join("")}</div>
        <h4>${esc(T("Gem codex"))}</h4><div class="wm-gems">${Object.keys(GEM_N).map((g) => { const n = (inv.gems && inv.gems[g]) || 0; return `<div class="wm-gem-c${n ? " got" : ""}" style="--g:${GEM_C[g]}"><i></i><b>${n ? esc(T(GEM_N[g])) : "???"}</b><span>×${n}</span></div>`; }).join("")}</div>
        <p class="wm-odds">${esc(T("Rocks broken: copper {a} · silver {b} · gold {c}", { a: fmtN(inv.found.cu || 0), b: fmtN(inv.found.ag || 0), c: fmtN(inv.found.au || 0) }))}</p>`;
    } else {
      body = `<p>${esc(T("ARCL mined this week (Monday to Sunday). The board resets each week."))}</p><ol class="wm-board"><li class="wm-loading">${esc(T("Loading…"))}</li></ol>`;
    }
    ui.sheet.innerHTML = `<div class="wm-sheet-in"><h3>${esc(T("The ARCL Mine"))}${rush ? ` <span class="wm-rush">${esc(T("Gold Rush"))}</span>` : ""}</h3>${tabs}${body}<button type="button" class="wm-close">${esc(T("Close"))}</button></div>`;
    ui.sheet.hidden = false; Snd.open && Snd.open();
    const q = (sel) => ui.sheet.querySelectorAll(sel);
    ui.sheet.querySelector(".wm-close").addEventListener("click", () => { hideSheet(); if (shopOnly) closeShop(); });
    q("[data-tab]").forEach((b) => b.addEventListener("click", () => openSheet(b.dataset.tab)));
    q(".wm-buy").forEach((b) => b.addEventListener("click", async () => {
      if (guest || !ctx.sess()) { toast(T("Sign in with your wallet first")); return; }
      if (!ctx.shop || !ctx.shop.pay) { toast(T("Couldn't price that")); return; }
      b.disabled = true; b.textContent = T("Check your wallet…");
      let okBuy = false; try { okBuy = await ctx.shop.pay(b.dataset.id, "", (m) => toast(m)); } catch (e) { toast(String((e && e.message) || e).slice(0, 90)); }
      if (okBuy) { Snd.buy && Snd.buy(); toast(T("Your new pickaxe is in your hands.")); if (on) await rejoin(); }
      openSheet("picks");
    }));
    q(".wm-up").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; const r = await api("world-mine-upgrade");
      if (r.ok && r.j.inv) { inv = r.j.inv; Snd.level && Snd.level(); toast(T("Pickaxe +{n}: 4% fewer hits a rock", { n: inv.lv })); if (on) await rejoin(); if (ctx.refresh) ctx.refresh(); }
      else toast((r.j && r.j.error) || T("try again"));
      openSheet("picks");
    }));
    q(".wm-smelt").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; const r = await api("world-mine-smelt", { ore: b.dataset.ore, times: 50 });
      if (r.ok && r.j.supply) { inv = r.j.inv || inv; const okS = ctx.addSupply ? ctx.addSupply(r.j.supply.kind, r.j.supply.n) : false; Snd.salvage && Snd.salvage(); toast(T("+{n} scrap for your gear", { n: fmtN(r.j.supply.n) }) + (okS ? "" : "")); }
      else toast((r.j && r.j.error) || T("try again"));
      openSheet("ores");
    }));
    q(".wm-deep").forEach((b) => b.addEventListener("click", async () => { hideSheet();
      // from the miner in town (the shop alone): close it (the town moves again) and go in, straight down to the deep mine
      if (!on) { closeShop(); deepNext = true; if (ctx.goMine) ctx.goMine(); else deepNext = false; return; }
      deep = !deep; const ok2 = await rejoin({ deep }); if (!ok2) { deep = !deep; toast(T("The deep mine opens at level 90")); } else { for (const rk of [...rocks.values()]) dropRock(rk); syncRocks(run.rocks); tintCave(); toast(deep ? T("The deep mine: tougher rocks, more gold") : T("Back in the mine")); } }));
    if (sheetTab === "board") {
      const j = await refreshView(), ol = ui.sheet.querySelector(".wm-board"); if (!ol) return; const me = ctx.sess() && ctx.sess().wallet;
      const top = (j && j.board) || []; ol.innerHTML = top.length ? top.map((x, i) => `<li class="${x.id === me ? "me" : ""}"><em>${i + 1}</em><b>${esc(x.name || x.w)}</b><span>${fmtN(x.n)} ARCL</span></li>`).join("") : `<li class="wm-loading">${esc(T("No one has mined this week yet"))}</li>`;
    }
  }
  // the miner in the village opens the same sheet without going in (the HUD around it stays hidden)
  let shopOnly = false, deepNext = false; // deepNext: the deep mine asked for from the miner, taken on the way in
  async function openShop(tab) {
    if (on) { openSheet(tab); return; } if (!ui) buildUi(); guest = !ctx.sess(); await refreshView();
    shopOnly = true; ui.root.hidden = false; ui.root.classList.add("shop-only"); openSheet(tab || "picks");
  }
  function closeShop() { shopOnly = false; if (ui && !on) { ui.root.hidden = true; ui.root.classList.remove("shop-only"); } if (ctx.onShopClose) ctx.onShopClose(); }
  // the deep mine's cave: a colder, darker light
  function tintCave() { if (!S) return; const d = deep; S.scene.fog.color.set(d ? 0x05040e : 0x070910); S.scene.background.set(d ? 0x030209 : 0x05060b); if (S.hemiL) S.hemiL.color.set(d ? 0x6a58d8 : 0x7d86e0); if (S.backM) S.backM.color.set(d ? 0x9a8ad8 : 0xd6d8e6); }
  function summary(why) {
    if (!ui) return; ui.sheet.innerHTML = `<div class="wm-sheet-in wm-sum"><h3>${esc(why)}</h3><div class="wm-sum-n"><i class="wm-coin-ic">${ctx.art ? ctx.art("coin", 30) : ""}</i><b>${fmtN(haul)}</b><small>${esc(guest ? T("ARCL (demo, not paid)") : T("ARCL this visit"))}</small></div>
      ${golds ? `<p class="wm-gold-n">${esc(T("Gold rocks broken: {n}", { n: golds }))}</p>` : ""}<button type="button" class="wm-close">${esc(T("Back to the village"))}</button></div>`;
    ui.sheet.hidden = false; ui.sheet.querySelector(".wm-close").addEventListener("click", () => { hideSheet(); finish(); });
  }

  // ---------------- the server (or the guest's demo) ----------------
  const guestKey = "arc.mine.guest";
  const gload = () => { try { return JSON.parse(localStorage.getItem(guestKey) || "{}") || {}; } catch { return {}; } };
  const gsave = (o) => { try { localStorage.setItem(guestKey, JSON.stringify(o)); } catch { /* the demo forgets */ } };
  let gRun = null;
  function gEnter() {
    const o = gload(), t = Date.now(); if (o.coolUntil && t >= o.coolUntil) { o.coolUntil = 0; o.used = 0; }
    if (o.coolUntil) return { ok: false, j: { error: "the mine is resting", coolUntil: o.coolUntil } };
    gRun = { used: o.used || 0, inAt: t, rocks: [], n: 0, nextAt: t + R.TIERS[0].every }; for (let i = 0; i < R.START_ROCKS; i++) gRock();
    return { ok: true, j: { runId: "guest", left: R.SESSION_MS - gRun.used, rocks: gRun.rocks.slice(), tier: 0, k: 1, today: 0, cap: R.DAY_CAP } };
  }
  function gRock() { const taken = new Set(gRun.rocks.map((x) => x.x)), free = [...Array(R.SLOTS).keys()].filter((i) => !taken.has(i)); if (!free.length) return; const u = Math.random(), t = u < R.ODDS[0] ? 0 : u < R.ODDS[0] + R.ODDS[1] ? 1 : 2, [a, b] = R.HITS[t];
    gRun.rocks.push({ id: ++gRun.n, t, h: Math.max(3, Math.round(a + (b - a) * Math.random())), x: free[Math.floor(Math.random() * free.length)] }); }
  function gTick() { if (!gRun) return; const t = Date.now(); while (gRun.nextAt <= t) { if (gRun.rocks.length < R.MAX_ROCKS) gRock(); gRun.nextAt += R.TIERS[0].every; } }
  function gUsed() { const o = gload(), used = (gRun ? gRun.used + (Date.now() - gRun.inAt) : o.used || 0); return Math.min(R.SESSION_MS, used); }
  function gLeave() { if (!gRun) return; const used = gUsed(), o = gload(); o.used = used; if (used >= R.SESSION_MS) o.coolUntil = Date.now() + R.COOL_MS; gsave(o); gRun = null; }
  async function api(action, extra = {}) {
    if (guest) {
      if (action === "world-mine-enter") return gEnter();
      gTick(); const l = R.SESSION_MS - gUsed();
      if (action === "world-mine-beat") return { ok: true, j: { left: l, rocks: gRun ? gRun.rocks.slice() : [] } };
      if (action === "world-mine-break") { const i = gRun ? gRun.rocks.findIndex((x) => x.id === extra.rock) : -1; if (i < 0) return { ok: false, status: 409, j: { error: "that rock isn't there" } };
        const rk = gRun.rocks.splice(i, 1)[0], e = Math.random(), u = Math.random(), [lo, hi] = R.RANGE[rk.t], v = e < R.EMPTY ? 0 : Math.round(lo + (hi - lo) * Math.pow(u, R.SKEW[rk.t]));
        return { ok: true, j: { got: 0, found: v, empty: v === 0, t: rk.t, rocks: gRun.rocks.slice(), left: l, today: 0, cap: R.DAY_CAP } }; }
      if (action === "world-mine-leave") { gLeave(); return { ok: true, j: {} }; }
    }
    const s = ctx.sess(); if (!s) return { ok: false, status: 401, j: { error: "signed out" } };
    try { return await ctx.post({ action, ...s, ...extra }); } catch (e) { return { ok: false, status: 0, j: { error: String((e && e.message) || e) } }; }
  }
  function takeLeft(j) { if (j && Number.isFinite(j.left)) { left = j.left; leftAt = performance.now(); } }
  async function rejoin(o = {}) { // a fresh visit id (a pickaxe bought, the deep mine, or the server ended the last one): the time so far still counts
    const r = await api("world-mine-enter", deep || o.deep ? { deep: o.deep != null ? o.deep : deep } : {}); if (!r.ok) return false; const j = r.j; run = j; tier = j.tier || 0; k = j.k || 1; today = j.today || 0; cap = j.cap || cap; if (j.inv) inv = j.inv; rush = !!j.rush; hold = j.hold || 0; takeLeft(j); syncRocks(j.rocks); holdPick(); paintHud(); return true;
  }
  async function beat() {
    const r = await api("world-mine-beat", { runId: run && run.runId });
    if (r.ok) { takeLeft(r.j); syncRocks(r.j.rocks); return; }
    if (r.status === 409) { if (r.j && r.j.coolUntil) { timeUp(); return; } if (!(await rejoin())) { toast(T("Lost the mine's connection. Back to the village.")); finish(); } }
  }
  async function breakRock(r) {
    r.breaking = true; r.bar.visible = false;
    let res = await api("world-mine-break", { runId: run && run.runId, rock: r.id });
    if (!res.ok && res.status === 429 && res.j && res.j.wait) { await new Promise((ok) => setTimeout(ok, Math.min(4000, res.j.wait + 80))); res = await api("world-mine-break", { runId: run && run.runId, rock: r.id }); }
    if (!res.ok && res.status === 409 && !(res.j && res.j.coolUntil) && (await rejoin())) { r.breaking = false; return; } // the visit was renewed: the rock is still there to break
    if (!res.ok) { r.breaking = false; r.hits = Math.max(0, r.h - 2); if (res.j && res.j.coolUntil) { timeUp(); return; } toast(T("That rock didn't break: {e}", { e: String((res.j && res.j.error) || T("try again")).slice(0, 60) })); return; }
    const j = res.j; takeLeft(j); if (Number.isFinite(j.today)) today = j.today;
    shatter(r, j); syncRocks(j.rocks); paintHud();
  }
  function shatter(r, j) {
    const x = r.x, y = r.hgt * 0.5, col = ["#c8743a", "#dbe6f5", "#ffc94a"][r.t];
    chip(x, y, -0.3, 0x5a4a40, 12, 1.1); chip(x, y, -0.3, col, 8 + r.t * 6, 1.2); spark(x, y, 0, col, 14 + r.t * 16, 1 + r.t * 0.3, 0.7);
    fracture(r); puff(x, 0.4, 1 + r.t * 0.6);
    shake = Math.max(shake, 0.18 + r.t * 0.12); Snd.crumble && Snd.crumble(r.t);
    const v = j.found || 0, got = j.got || 0; broke++;
    if (!v) { pop(x, 2.2, esc(T("Empty!")), "dud"); Snd.dud && Snd.dud(); dustPuff(x, 0.6, 18, 0x8a7a6a); }
    else {
      haul += guest ? v : got; if (r.t === 2) golds++;
      const capped = j.capped && got < v;
      pop(x, 2.4, `+${fmtN(guest ? v : got)} <small>ARCL</small>${capped ? `<em>${esc(T("daily mine limit"))}</em>` : ""}`, ["cu", "ag", "au big"][r.t]);
      flyCoins(x, 1.2, [4, 7, 14][r.t], r.t === 2); oreOut(r, [4, 6, 10][r.t]);
      if (j.ore) { const parts = ORE_K.filter((q) => j.ore[q] > 0).map((q) => `${oreIc(q, 16)}+${j.ore[q]}`); if (parts.length) setTimeout(() => pop(x, 1.5, parts.join(" "), "ore"), 280); if (inv) { ORE_K.forEach((q) => { inv[q] = (inv[q] || 0) + (j.ore[q] || 0); }); } }
      if (j.gem) { const g = j.gem; if (inv && inv.gems) inv.gems[g] = (inv.gems[g] || 0) + 1; setTimeout(() => { pop(x, 3.1, `${esc(T(GEM_N[g] + "!"))}<em>${esc(T("A gem for your codex"))}</em>`, "gem " + g); Snd.jackpot && Snd.jackpot(); flash(`radial-gradient(circle at 50% 50%,${GEM_C[g]}aa,transparent 60%)`, 0.8); }, 650); } if (r.t >= 1) ring(x, r.hgt * 0.55, r.t === 2);
      if (r.t === 2) { Snd.jackpot && Snd.jackpot(); flash("radial-gradient(circle at 50% 55%,rgba(255,214,90,.9),rgba(255,170,40,.25) 60%,transparent)", 1); freeze = reduce ? 0 : 0.35; zoomT = reduce ? 0 : 1.1; spark(x, y + 0.6, 0, 0xffe08a, 50, 1.6, 1.2); if (S.goldL) S.goldL.intensity = 40; }
      else if (r.t === 1) { flash("radial-gradient(circle at 50% 55%,rgba(220,235,255,.5),transparent 60%)", 0.6); Snd.win && Snd.win(); }
    }
    // XP for every rock (an empty one too): the time in the mine counts towards your level, like a fight does
    const xp = rockXp(ctx.level ? ctx.level() : 1, r.t, !v);
    if (xp && ctx.gain) { try { ctx.gain(xp, T("Mining")); setTimeout(() => pop(x, v ? 3.4 : 3, `+${fmtN(xp)} <small>XP</small>`, "xp"), v ? 420 : 200); } catch { /* the level waits */ } }
    dropRock(r); paintHud();
  }
  function timeUp() { if (ending) return; ending = true; mineHeld = false; moveIn = 0; summary(T("Your hour in the mine is up")); }

  // ---------------- input ----------------
  const kd = (e) => { if (!on) return; const key = String(e.key || "").toLowerCase(); if (e.target && e.target.closest && e.target.closest("input,textarea")) return;
    if (["a", "d", "arrowleft", "arrowright", " ", "j", "enter", "escape"].includes(key)) { e.preventDefault(); e.stopImmediatePropagation(); }
    if (key === "escape") { if (ui && !ui.sheet.hidden && !ending) hideSheet(); else if (!ending) leave(false); return; }
    keys.add(key); };
  const ku = (e) => { if (!on) return; keys.delete(String(e.key || "").toLowerCase()); };

  // ---------------- the loop ----------------
  function nearestRock(maxD = Infinity, side = 0) { let best = null, bd = maxD; for (const r of rocks.values()) { if (r.breaking || r.born < 1) continue; const d = Math.abs(r.x - px); if (side && Math.sign(r.x - px) !== side && d > 0.6) continue; if (d < bd) { bd = d; best = r; } } return best; }
  function tick(dt, t) {
    if (!on || !S) return;
    if (freeze > 0) { freeze -= dt; dt *= 0.15; }
    const kL = keys.has("a") || keys.has("arrowleft"), kR = keys.has("d") || keys.has("arrowright"), kM = keys.has(" ") || keys.has("j") || keys.has("enter");
    const want = ending ? 0 : (kL ? -1 : kR ? 1 : moveIn), mining = !ending && (mineHeld || kM);
    // pick the rock to work on: the closest in reach ahead, else the closest in reach
    target = nearestRock(REACH, dir) || nearestRock(REACH);
    if (mining && !target && !want) { const n = nearestRock(); if (n) walkTo = n; }
    if (want) walkTo = null;
    let mv = want;
    if (!mv && walkTo && !walkTo.gone) { const dx = walkTo.x - px; if (Math.abs(dx) > REACH - 0.6) mv = Math.sign(dx); else walkTo = null; }
    if (swingT > 0) mv = 0; // planted while swinging
    if (mv) { dir = mv; px = Math.max(-CAVE + 1.2, Math.min(CAVE - 1.2, px + mv * SPEED * dt)); }
    // you walk past rocks (they sit behind you); mining one you stand on, you step to its side first
    if (mining && target && !mv && swingT <= 0) { const dx = px - target.x, lim = target.w / 2 + 0.25; if (Math.abs(dx) < lim) px += Math.sign(dx || -dir) * Math.min(lim - Math.abs(dx), SPEED * dt); }
    if (target && !mv) dir = Math.sign(target.x - px) || dir;
    // the swing: a hit lands partway through
    if (swingT > 0) { swingT -= dt; if (hitDue > 0 && SWING - swingT >= IMPACT) { hitDue = -1; landHit(); } }
    else if (mining && target && !target.breaking) { swingT = SWING; hitDue = 1; if (hero && hero.attack) hero.attack(0, false); else if (hero && hero.play) hero.play("attack", { once: true, fade: 0.06, speed: 1.6 }); Snd.swing && Snd.swing(false, 1); }
    // the hero
    if (hero) { hero.obj.position.x = px; const face = dir > 0 ? Math.PI / 2 - 0.42 : -Math.PI / 2 + 0.42; hero.obj.rotation.y += (face - hero.obj.rotation.y) * Math.min(1, dt * 14);
      if (swingT <= 0) { const a = mv ? "walk" : "idle"; if (hero.play && !(hero.busy && hero.busy())) hero.play(a, { speed: mv ? 1.15 : 1 }); }
      if (pick && pick.userData.bot) pick.rotation.z = swingT > 0 ? -0.4 - Math.sin((1 - swingT / SWING) * Math.PI) * 1.8 : -0.4;
      if (freeze <= 0 || freeze > 0.3) hero.update(dt, t, mv ? 0.3 : 0, 0); }
    // rocks: grow in, shake, squash back, twinkle
    for (const r of rocks.values()) {
      if (r.born < 1) { r.born = Math.min(1, r.born + dt * 2.2); const e = 1 - Math.pow(1 - r.born, 3); r.shape.scale.setScalar(Math.max(0.01, e * (1 + Math.sin(r.born * Math.PI) * 0.12))); }
      if (r.shake > 0) { r.shake = Math.max(0, r.shake - dt * 4); r.shape.position.x = Math.sin(t * 90) * r.shake * 0.12; } else r.shape.position.x = 0;
      if (r.squash > 0) { r.squash = Math.max(0, r.squash - dt * 6); if (r.born >= 1) r.shape.scale.set(1 + r.squash * 0.08, 1 - r.squash * 0.1, 1 + r.squash * 0.08); }
      for (const s of r.stars) { const k = Math.max(0, Math.sin(t * 2.6 + s.userData.ph)); s.scale.setScalar(Math.pow(k, 6) * s.userData.k * (r.t === 2 ? 1.1 : 0.7)); s.material.rotation = t * 0.6; }
      if (r.glow) { const tz = r.tension || 0; r.glow.material.opacity = Math.min(1, (r.t === 2 ? 0.75 + Math.sin(t * (3 + tz * 6) + r.id) * 0.25 : 0.4 + Math.sin(t * 2 + r.id) * 0.15) + tz * 0.3); r.glow.scale.setScalar((r.t === 2 ? 4.2 : 2.6) * (1 + tz * 0.55)); }
      if (r.shaft) { r.shaft.material.opacity = 0.55 + Math.sin(t * 1.7 + r.id) * 0.2; }
      r.bar.visible = r === target && r.hits > 0 && !r.breaking; if (r.bar.visible) { const f = Math.max(0, 1 - r.hits / r.h); r.bf.scale.x = 1.44 * Math.max(0.001, f); r.bf.position.x = -0.72 * (1 - f); }
    }
    S.nugM[2].emissiveIntensity = 0.85 + Math.sin(t * 3.2) * 0.3; if (MODELS && MODELS[2] && MODELS[2].userData.mat) MODELS[2].userData.mat.emissiveIntensity = 0.38 + Math.sin(t * 3.2) * 0.16;
    // the gold light sits on the nearest gold rock and fades after a gold break
    if (S.goldL) { let g = null, gd = 14; for (const r of rocks.values()) if (r.t === 2 && Math.abs(r.x - px) < gd) { gd = Math.abs(r.x - px); g = r; }
      const want2 = g ? 7 + Math.sin(t * 3) * 2 : 0; if (S.goldL.intensity > want2 + 0.5) S.goldL.intensity -= dt * 30; else S.goldL.intensity += (want2 - S.goldL.intensity) * Math.min(1, dt * 3); if (g) S.goldL.position.set(g.x, 1.6, 1.2); }
    // lanterns flicker; the three lamp lights follow the camera's nearest lanterns
    for (const l of S.lanterns) { const f = 2.6 + Math.sin(t * 9 + l.ph) * 0.35 + Math.sin(t * 23 + l.ph * 2) * 0.2; l.fl.material.emissiveIntensity = f; l.gs.scale.setScalar(3.2 + Math.sin(t * 7 + l.ph) * 0.2); }
    if (S.lampL.length) { const near = S.lanterns.slice().sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px)).slice(0, S.lampL.length); near.forEach((l, i) => { S.lampL[i].position.set(l.x, l.y - 0.2, 0.8); S.lampL[i].intensity = 20 + Math.sin(t * 9 + l.ph) * 2.5; }); }
    S.crysM.forEach((m, i) => { m.emissiveIntensity = 1.1 + Math.sin(t * 1.3 + i * 2) * 0.35; });
    S.head.position.set(px + dir * 0.6, 2.6, 2.2);
    // dust drifts up and sideways, wrapping around
    if (!low || (Math.floor(t * 30) % 2 === 0)) { const P = S.dpos; for (let i = 0; i < S.dustN; i++) { P[i * 3 + 1] += S.dsp[i] * dt * 0.25; P[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.08; if (P[i * 3 + 1] > 9) P[i * 3 + 1] = 0; } S.dust.geometry.attributes.position.needsUpdate = true; }
    tickFx(dt); tickBreak(dt); tickLife(dt, t);
    // the pickaxe's trail: the head's path through the swing, fading
    if (S.trail && pick && pick.userData.head) { const H = S.trailH, n = S.trailN; if (swingT > 0) { pick.userData.head.getWorldPosition(tmpV); H.unshift([tmpV.x, tmpV.y, tmpV.z + 0.1]); } else if (H.length) H.pop(); if (H.length > n) H.length = n;
      const P = S.trail.geometry.attributes.position.array, C = S.trail.geometry.attributes.color.array, tc = new THREE.Color([0xbfe6ff, 0x8fc8ff, 0xc8a8ff, 0xffd34d][tier] || 0xbfe6ff);
      if (H.length || S.trailDirty) { for (let i = 0; i < n; i++) { const h = H[i], f = h ? 1 - i / n : 0; P[i * 3] = h ? h[0] : 0; P[i * 3 + 1] = h ? h[1] : -99; P[i * 3 + 2] = h ? h[2] : 0; C[i * 3] = tc.r * f; C[i * 3 + 1] = tc.g * f; C[i * 3 + 2] = tc.b * f; }
        S.trail.geometry.attributes.position.needsUpdate = true; S.trail.geometry.attributes.color.needsUpdate = true; S.trailDirty = H.length > 0; } }
    // the camera: far and narrow (nearly flat, like a 2D game); wide enough to show 12 m across on a phone held upright
    const asp = S.cam.aspect || 1, vh = Math.tan((S.cam.fov * Math.PI) / 360), wantW = asp < 1 ? 9.5 : asp < 1.4 ? 15 : 21, dist = Math.min(64, Math.max(16, (wantW / 2) / (vh * asp)));
    if (zoomT > 0) zoomT = Math.max(0, zoomT - dt); const zk = zoomT > 0 ? 1 - 0.16 * Math.sin(Math.min(1, zoomT / 1.1) * Math.PI) : 1; // a gold break: the camera leans in, then back
    S.dist += (dist * zk - S.dist) * Math.min(1, dt * (zoomT > 0 ? 7 : 4)); const cy = asp < 1 ? 3.4 : 3.9;
    const cx = Math.max(-CAVE + wantW / 2 - 1, Math.min(CAVE - wantW / 2 + 1, px + dir * 1.4)); S.cam.position.x += (cx - S.cam.position.x) * Math.min(1, dt * 3.2) + kick; kick *= Math.exp(-dt * 16);
    if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
    const sh = reduce ? 0 : shake * shake * 0.9; S.cam.position.y = cy + 0.9 + (Math.random() - 0.5) * sh; S.cam.position.z = S.dist; S.cam.lookAt(S.cam.position.x + (Math.random() - 0.5) * sh * 0.5, cy, 0);
    S.scene.fog.near = S.dist + 1.5; S.scene.fog.far = S.dist + 28;
    // the clock: a beat to the server now and then; time up ends the visit
    if (!ending) { const now = performance.now(); if (now - beatT >= 12000) { beatT = now; beat(); } if (left - (now - leftAt) <= 0) timeUp(); } // the beat on the real clock (a slow frame rate stretches game time)
    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) paintHud();
  }
  function landHit() {
    const r = target; if (!r || r.breaking) return;
    r.hits++; r.shake = 1; r.squash = 1; shake = Math.max(shake, 0.08);
    const x = r.x - Math.sign(r.x - px) * r.w * 0.38, y = 0.4 + Math.random() * r.hgt * 0.5;
    const away = -Math.sign(r.x - px) || -dir; // sparks fly back toward you, off the face you hit
    chip(x, y, 0, [0x6a5a50, 0x5a6070, 0x55463a][r.t], 3 + r.t, 0.6); spark(x, y, 0.2, [0xffd9a0, 0xe8f1ff, 0xffe08a][r.t], 6 + r.t * 3, 0.8, 0.35, away * 0.6);
    kick = reduce ? 0 : -away * 0.09; if (r.hits % 4 === 0) puff(x, 0.3, 0.4);
    if (r.t >= 1) { const f = r.hits / r.h; r.tension = f; r.shake = 1 + f * (r.t === 2 ? 1.6 : 0.8); if (r.t === 2 && f > 0.6 && Math.random() < 0.5) spark(r.x, r.hgt * 0.7, 0.3, 0xffe08a, 3, 0.5, 0.6); } // gold builds up: it shakes harder and glows brighter
    Snd.chink && Snd.chink(r.t); freeze = reduce ? 0 : 0.045;
    const f = r.hits / r.h; r.crack.material.opacity = f < 0.25 ? 0 : 0.85; r.crack.material.map.offset.x = f < 0.5 ? 0 : f < 0.8 ? 0.25 : 0.5;
    if (r.nugs.length > 2 && Math.random() < 0.18 + r.t * 0.08) { const nu = r.nugs.pop(); nu.visible = false; chip(r.x, 0.9, 0.2, [0xe08a4a, 0xeef3fb, 0xffd34d][r.t], 2, 0.7); }
    if (r.hits >= r.h) breakRock(r);
  }

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; if (shopOnly) { hideSheet(); closeShop(); } busy = true; ending = false; haul = 0; golds = 0; broke = 0;
    try {
      if (preP) await Promise.race([preP, new Promise((ok) => setTimeout(ok, 6000))]); // a preload still running: let it finish first
      guest = !ctx.sess();
      const r = await api("world-mine-enter");
      if (!r.ok) { const j = r.j || {}; if (j.coolUntil) toast(T("The mine is resting. It opens again in {t}.", { t: hm(j.coolUntil - Date.now()) })); else toast(T("The mine couldn't open: {e}", { e: String(j.error || r.status).slice(0, 70) })); return false; }
      if (S && !S.withModels && MODELS && MODELS.length) { for (const rk of [...rocks.values()]) dropRock(rk); if (hero && hero.obj.parent) hero.obj.parent.remove(hero.obj); S = null; }
      if (!S) { await loadModels(); build(); if (hero) S.scene.add(hero.obj); } if (!ui) buildUi();
      const j = r.j; run = j; tier = j.tier || 0; k = j.k || 1; today = j.today || 0; cap = j.cap || R.DAY_CAP; takeLeft(j); if (j.inv) inv = j.inv; rush = !!j.rush; hold = j.hold || 0; deep = false; tintCave(); if (!guest) refreshView().then(() => paintHud());
      for (const rk of [...rocks.values()]) dropRock(rk); for (const d of j.rocks || []) makeRock(d, false);
      px = -CAVE + 5; dir = 1; swingT = 0; walkTo = null; moveIn = 0; mineHeld = false; keys.clear(); S.cam.position.set(px, 4.3, 30); S.dist = 30;
      await makeHero(); if (hero) { hero.obj.position.x = px; holdPick(); }
      try { if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), new Promise((ok) => setTimeout(ok, 2500))]); } catch { /* compiled on the first frame */ }
      st.view(S.scene, S.cam, S.comp || null); st.solo(tick); on = true; beatT = performance.now(); // the town waits (its updates stop) while you're in
      document.body.classList.add("wp-mining"); ui.root.hidden = false; hideSheet(); paintHud();
      if (deepNext) { deepNext = false; setTimeout(async () => { if (!on) return; deep = true; const ok2 = await rejoin({ deep }).catch(() => false); if (!ok2) { deep = false; toast(T("The deep mine opens at level 90")); return; } for (const rk of [...rocks.values()]) dropRock(rk); syncRocks(run.rocks); tintCave(); toast(T("The deep mine: tougher rocks, more gold")); }, 400); }
      addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
      ui.title.hidden = false; ui.title.querySelector("span").textContent = guest ? T("Demo: nothing you mine is paid. Connect your wallet to earn.") : T("{t} left in the mine · rocks hold 10–10,000 ARCL", { t: mmss(left) });
      ui.title.classList.remove("go"); void ui.title.offsetWidth; ui.title.classList.add("go"); setTimeout(() => { if (ui) ui.title.hidden = true; }, 2600);
      Snd.enter && Snd.enter();
      return true;
    } catch (e) {
      console.warn("mine", e); toast(T("The mine couldn't open: {e}", { e: String((e && e.message) || e).slice(0, 70) })); try { reset(); } catch { /* already reset */ } return false;
    } finally { busy = false; }
  }
  async function leave(force) {
    if (!on) return;
    if (!ending) api("world-mine-leave", { runId: run && run.runId }).catch(() => {}); // (an hour that ran out has ended on the server already)
    if (!force && !ending && haul > 0) { ending = true; mineHeld = false; moveIn = 0; summary(T("Leaving the mine")); return; }
    finish();
  }
  function reset() {
    on = false; ending = false; document.body.classList.remove("wp-mining"); if (ui) { ui.root.hidden = true; hideSheet(); }
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); keys.clear(); mineHeld = false; moveIn = 0;
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
    if (guest) gLeave();
  }
  function finish() { if (!on) return; reset(); if (ctx.onLeave) ctx.onLeave({ haul, guest }); if (!guest && ctx.refresh) ctx.refresh(); }
  return {
    enter, leave: () => leave(true), active: () => on, openShop,
    /// near the Mining Village (world-play.js): the models, the cave, the hero and its shaders made ahead, a texture a frame,
    /// so walking in doesn't stall on them
    preload() { if (!preP && !S && !on) preP = (async () => {
      try { await loadModels(); if (S || on) return; build(); await makeHero(); if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), new Promise((ok) => setTimeout(ok, 4000))]);
        const texs = new Set(); S.scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"]) if (m[k]) texs.add(m[k]); });
        for (const tx of texs) { try { st.renderer.initTexture(tx); } catch { /* uploaded on first draw */ } await new Promise((ok) => setTimeout(ok, 30)); }
      } catch (e) { console.warn("mine preload:", e); } })(); return preP; },
    /// tests: what's in the cave, and n hits landed on the rock in reach (as if swung)
    debug: () => ({ px, haul, golds, left, tier, guest, target: target && target.id, rocks: [...rocks.values()].map((r) => ({ id: r.id, t: r.t, h: r.h, hits: r.hits, x: r.x })) }),
    spawn: (t = 2, near = true) => { if (!guest || !gRun) return false; gRock(); const x = gRun.rocks[gRun.rocks.length - 1]; if (!x) return false; x.t = t; x.h = R.HITS[t][0]; if (near) { const slot = Math.max(0, Math.min(R.SLOTS - 1, Math.round((px + 26) / 4) + 1)); px = SLOT_X(slot) - 1.5; dir = 1; const other = gRun.rocks.find((y) => y !== x && y.x === slot); if (other) other.x = x.x; x.x = slot; for (const r of [...rocks.values()]) dropRock(r); } syncRocks(gRun.rocks.slice()); for (const r of rocks.values()) { r.born = 1; r.shape.scale.setScalar(1); } return true; }, // a guest's demo rock of kind t (tests and screenshots; nothing is paid)
    hit: (n = 1) => { for (let i = 0; i < n; i++) { target = target || nearestRock(REACH); if (target) landHit(); } },
    /// what the tunnel's prompt says: the time left today or when it opens (null: unknown, signed out)
    async status() {
      if (!ctx.sess()) { const o = gload(); if (o.coolUntil && Date.now() < o.coolUntil) return { coolUntil: o.coolUntil, left: 0 }; return { left: R.SESSION_MS - (o.used || 0), guest: true }; }
      try { const r = await fetch("/api/social?world=mine&wallet=" + ctx.sess().wallet, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; }
    },
  };
}
