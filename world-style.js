// world-style.js — the island styles and material bricks from the ARCL Shop.
//
//   styles   ten looks for My Island (style-grass … style-volcano): ground and cliff colours, a rim around the build
//            area, trees and props along the edge, waterfalls (lava on the volcano), a small floating islet with a
//            landmark, weather (snow, petals, embers, sparkles), and the sea below. The sky lives in world-play.js
//            (THEMES), keyed by the same ids.
//   bricks   materials for the ten material bricks (grass, stone, wood, metal, glass, neon, crystal, gold, cyber,
//            arcadia), painted on canvases here so there are no image files to load.
// Everything is generated: no models, no textures to download.
import { mergeGeometries } from "./vendor/three/addons/BufferGeometryUtils.js";

// a small seeded random, so every island of a style looks the same for everyone
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// top: ground, lip: the grassy overhang, side: the slab's sides, rock / dirt: the cliff layers, rim: the edge ring
export const STYLES = {
  "style-grass": { top: 0x67c25a, lip: 0x58b04c, side: 0x6a4a32, rock: 0x8a8378, dirt: 0x5f4430, sea: 0xffffff, seaOp: 0.55, clouds: true, falls: { color: 0x7fd4ff, n: 3 }, fx: null, decor: "grass", land: "bigtree", seed: 11 },
  "style-tropical": { top: 0x7fcf5c, lip: 0x6fbf4c, side: 0x7a5a3a, rock: 0x9a8a72, dirt: 0x7a5a3a, rim: 0xf2dca0, sea: 0x2fc6d6, seaOp: 0.95, clouds: false, falls: { color: 0x8fe8ff, n: 2 }, fx: null, decor: "tropical", land: "hut", seed: 23 },
  "style-stone": { top: 0x8fae6a, lip: 0x7a9a58, side: 0x8a877e, rock: 0xa4a196, dirt: 0x7e7a70, rim: 0xb0aca0, sea: 0xffffff, seaOp: 0.55, clouds: true, falls: { color: 0x8fd8ff, n: 2 }, fx: null, decor: "stone", land: "ruin", seed: 37 },
  "style-snow": { top: 0xf2f6fa, lip: 0xffffff, side: 0x8fa3b8, rock: 0x9fb2c6, dirt: 0x7c90a8, sea: 0xffffff, seaOp: 0.7, clouds: true, falls: { color: 0xc8f0ff, n: 2 }, fx: { kind: "snow", color: 0xffffff, n: 500, size: 0.22 }, decor: "snow", land: "cabin", icicles: true, seed: 41 },
  "style-sakura": { top: 0x8fd06a, lip: 0x7ec05c, side: 0x7a5a48, rock: 0x9a8e88, dirt: 0x6e5040, rim: 0xf6c6dc, sea: 0xffe6f2, seaOp: 0.6, clouds: true, cloud: 0xffe2f0, falls: { color: 0x9fe0ff, n: 2 }, fx: { kind: "petals", color: 0xff9fcf, n: 320, size: 0.26 }, decor: "sakura", land: "pagoda", seed: 53 },
  "style-desert": { top: 0xe2b877, lip: 0xd6a862, side: 0xc0824a, rock: 0xd09a5e, dirt: 0xa86a3a, rim: 0xd9a35e, sea: 0xffe2c0, seaOp: 0.55, clouds: true, falls: { color: 0x8fd8ff, n: 2 }, fx: null, decor: "desert", land: "pyramid", seed: 67 },
  "style-ocean": { top: 0x74c95a, lip: 0x64b94c, side: 0x6a5a48, rock: 0x7f8a8c, dirt: 0x5f5448, rim: 0xf0d8a0, sea: 0x1fa8d0, seaOp: 0.96, clouds: false, falls: { color: 0x8fe8ff, n: 4 }, fx: null, decor: "ocean", land: "lighthouse", boats: true, seed: 71 },
  "style-aurora": { top: 0x2c4a52, lip: 0x223c44, side: 0x262a40, rock: 0x343a58, dirt: 0x1e2236, rim: 0x1a2236, sea: 0x0a1630, seaOp: 0.8, clouds: true, cloud: 0x2a3a5a, falls: { color: 0x5ff0ff, n: 2, glow: true }, fx: { kind: "sparkle", color: 0x9ff6ff, n: 260, size: 0.18 }, decor: "aurora", land: "spire", seed: 83 },
  "style-celestial": { top: 0xf3efe4, lip: 0xffffff, side: 0xe6e0d2, rock: 0xf1ece0, dirt: 0xdcd4c2, rim: 0xffd98a, sea: 0xffffff, seaOp: 0.85, clouds: true, falls: { color: 0xd8f4ff, n: 3 }, fx: { kind: "sparkle", color: 0xfff1b8, n: 220, size: 0.2 }, decor: "celestial", land: "temple", seed: 97 },
  "style-volcano": { top: 0x3e3430, lip: 0x2e2622, side: 0x2a2220, rock: 0x3a3230, dirt: 0x221c1a, rim: 0x1e1816, sea: 0x3a140c, seaOp: 0.9, clouds: true, cloud: 0x4a2a26, falls: { color: 0xff6a1a, n: 3, lava: true }, fx: { kind: "embers", color: 0xff8a2a, n: 300, size: 0.2 }, decor: "volcano", land: "volcano", lavaBands: true, seed: 101 },
};

// ---------------- canvas painting ----------------
function canvasTex(THREE, size, paint, { repeat = 1, srgb = true } = {}) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size; const g = cv.getContext("2d"); paint(g, size);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const noise = (g, s, n, a, r) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${a * r()})`; const w = 1 + r() * 3; g.fillRect(r() * s, r() * s, w, w); } };

/// The ten material bricks' materials. fixed(m) keeps a material's own colour (the brick colour doesn't tint it).
export function brickMats(THREE, fixed) {
  const r = rng(7);
  const std = (o) => fixed(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05, ...o }));
  const grassTop = canvasTex(THREE, 128, (g, s) => { g.fillStyle = "#5cb84a"; g.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { g.fillStyle = ["#7ed35e", "#4aa23c", "#93e06a", "#3f8f34"][i % 4]; g.fillRect(r() * s, r() * s, 2, 4 + r() * 5); } for (let i = 0; i < 14; i++) { g.fillStyle = ["#fff6c8", "#ffffff", "#ffd34d"][i % 3]; g.beginPath(); g.arc(r() * s, r() * s, 2.2, 0, 7); g.fill(); } });
  const dirt = canvasTex(THREE, 128, (g, s) => { g.fillStyle = "#8a5a36"; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < s; x += 48) { g.fillStyle = ["#9a6a42", "#7e5030", "#a8774a"][Math.floor(r() * 3)]; g.fillRect(x + 2, y + 2, 44, 28); } noise(g, s, 500, 0.18, r); });
  const stone = canvasTex(THREE, 128, (g, s) => { g.fillStyle = "#6f6c66"; g.fillRect(0, 0, s, s); const rows = [0, 30, 62, 96, 128]; for (let k = 0; k < 4; k++) { let x = -r() * 30; while (x < s) { const w = 30 + r() * 30; const v = 150 + Math.floor(r() * 40); g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.beginPath(); g.roundRect(x + 2, rows[k] + 2, w - 4, rows[k + 1] - rows[k] - 4, 5); g.fill(); g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(x + 4, rows[k] + 3, w - 8, 3); x += w; } } noise(g, s, 600, 0.16, r); });
  const wood = canvasTex(THREE, 128, (g, s) => { for (let k = 0; k < 4; k++) { const v = [0xb8743a, 0xa8682f, 0xc4823f, 0x9e5f2a][k]; g.fillStyle = "#" + v.toString(16); g.fillRect(0, k * 32, s, 32); g.strokeStyle = "rgba(60,30,10,.35)"; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); const y = k * 32 + 4 + i * 5 + r() * 2; g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + r() * 4 - 2, s * 0.7, y + r() * 4 - 2, s, y); g.stroke(); } g.fillStyle = "rgba(40,20,5,.55)"; g.fillRect(0, k * 32, s, 2); g.fillStyle = "#3a2410"; [20, 108].forEach((x) => { g.beginPath(); g.arc(x, k * 32 + 16, 2.4, 0, 7); g.fill(); }); } });
  const metal = canvasTex(THREE, 128, (g, s) => { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, "#c9d2dc"); gr.addColorStop(1, "#8e98a4"); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; g.fillRect(0, r() * s, s, 1); } g.strokeStyle = "rgba(30,40,55,.55)"; g.lineWidth = 3; g.strokeRect(10, 10, s - 20, s - 20); g.beginPath(); g.moveTo(s / 2, 10); g.lineTo(s / 2, s - 10); g.stroke(); g.fillStyle = "#59636f"; [[18, 18], [s - 18, 18], [18, s - 18], [s - 18, s - 18]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }); });
  const gold = canvasTex(THREE, 128, (g, s) => { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, "#ffe08a"); gr.addColorStop(0.5, "#f2b232"); gr.addColorStop(1, "#ffd25a"); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.strokeStyle = "rgba(140,80,0,.55)"; g.lineWidth = 3; g.strokeRect(12, 12, s - 24, s - 24); g.beginPath(); g.moveTo(12, 12); g.lineTo(40, 40); g.moveTo(s - 12, 12); g.lineTo(s - 40, 40); g.moveTo(12, s - 12); g.lineTo(40, s - 40); g.moveTo(s - 12, s - 12); g.lineTo(s - 40, s - 40); g.stroke(); g.strokeRect(40, 40, s - 80, s - 80); });
  const cyberMap = canvasTex(THREE, 128, (g, s) => { g.fillStyle = "#1b2433"; g.fillRect(0, 0, s, s); g.strokeStyle = "#2b3a50"; g.lineWidth = 2; g.strokeRect(6, 6, s - 12, s - 12); noise(g, s, 300, 0.12, r); });
  const cyberGlow = canvasTex(THREE, 128, (g, s) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, s, s); g.strokeStyle = "#35d8ff"; g.lineWidth = 3; g.lineCap = "round";
    [[10, 30, 40, 30, 40, 10], [s - 10, 98, s - 40, 98, s - 40, s - 10], [10, 100, 26, 100], [s - 10, 28, s - 26, 28]].forEach((p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); });
    g.lineWidth = 6; g.beginPath(); g.ellipse(s / 2 - 13, s / 2, 13, 11, 0, 0, 7); g.stroke(); g.beginPath(); g.ellipse(s / 2 + 13, s / 2, 13, 11, 0, 0, 7); g.stroke();
  }, { srgb: true });
  const marble = canvasTex(THREE, 128, (g, s) => { g.fillStyle = "#f1eee6"; g.fillRect(0, 0, s, s); g.strokeStyle = "rgba(150,140,125,.35)"; g.lineWidth = 1.2; for (let i = 0; i < 7; i++) { g.beginPath(); let x = r() * s, y = 0; g.moveTo(x, y); while (y < s) { x += (r() - 0.5) * 22; y += 10 + r() * 10; g.lineTo(x, y); } g.stroke(); } g.fillStyle = "rgba(60,150,70,.85)"; for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(6 + r() * 30, s - 8 - r() * 60, 4, 2.4, r() * 3, 0, 7); g.fill(); } });
  return {
    mGrass: std({ map: grassTop, roughness: 0.9 }),
    mDirt: std({ map: dirt, roughness: 0.95 }),
    mStone: std({ map: stone, roughness: 0.85 }),
    mWood: std({ map: wood, roughness: 0.75 }),
    mMetal: std({ map: metal, metalness: 0.4, roughness: 0.35 }),
    mGlowB: fixed(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 3.2) })),
    mGlass: fixed(new THREE.MeshPhysicalMaterial({ color: 0xcfeeff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 })),
    mFrame: std({ color: 0xe8f4ff, metalness: 0.4, roughness: 0.25 }),
    mNeonBody: std({ color: 0x1a1030, metalness: 0.4, roughness: 0.35 }),
    mNeonEdge: fixed(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 3.0) })),
    mCrystal: fixed(new THREE.MeshPhysicalMaterial({ color: 0xb48cff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.62, flatShading: true, clearcoat: 1, emissive: 0x3a1a8a, emissiveIntensity: 0.6, depthWrite: false })),
    mCrystalCore: fixed(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 3.0) })),
    mGoldB: std({ map: gold, metalness: 0.5, roughness: 0.28, emissive: 0x4a3000, emissiveIntensity: 0.35 }),
    mCyber: std({ map: cyberMap, metalness: 0.7, roughness: 0.35, emissive: 0xffffff, emissiveMap: cyberGlow, emissiveIntensity: 1.8 }),
    mMarble: std({ map: marble, roughness: 0.4 }),
    mGoldTrim: std({ color: 0xffc861, metalness: 0.55, roughness: 0.25, emissive: 0x4a3000, emissiveIntensity: 0.3 }),
  };
}

/// The styler: apply(land, N, id) dresses the island; tick(dt, t) animates falls, weather and glows.
export function createStyler({ THREE, K, reduce = false }) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const flat = (list) => list.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(x.attributes)) if (!["position", "normal", "uv"].includes(a)) x.deleteAttribute(a); return x; });
  // geometry batches: one merged mesh per material
  function Batch() {
    const by = new Map();
    return {
      add(mat, g) { let a = by.get(mat); if (!a) by.set(mat, (a = [])); a.push(g); },
      build(parent, { shadow = true } = {}) { by.forEach((list, mat) => { const m = new THREE.Mesh(mergeGeometries(flat(list), false), mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); }); },
    };
  }
  const T = (g, x, y, z, ry = 0, rx = 0, rz = 0, s = 1) => { g.scale(s, s, s); if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
  const cyl = (r1, r2, h, seg = 8) => new THREE.CylinderGeometry(r1, r2, h, seg).translate(0, h / 2, 0);
  const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0);
  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const mats = new Map();
  const mat = (c, o = {}) => { const k = c + JSON.stringify(o); let m = mats.get(k); if (!m) mats.set(k, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o }))); return m; };
  const glow = (r, g, b) => { const k = `glow${r},${g},${b}`; let m = mats.get(k); if (!m) mats.set(k, (m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }))); return m; };

  // ---------- props (x, z on the island; s = scale; B = batch) ----------
  const P = {
    tree(B, x, z, s, r, leaf = 0x4caf50, leaf2 = 0x6fcf5a) { B.add(mat(0x7a5232), T(cyl(0.16, 0.24, 1.5), x, 0, z, 0, 0, 0, s)); B.add(mat(leaf), T(ico(0.95, 1), x, 2.1 * s, z, r() * 3, 0, 0, s)); B.add(mat(leaf2), T(ico(0.62, 1), x + 0.45 * s, 2.55 * s, z + 0.2 * s, 0, 0, 0, s)); B.add(mat(leaf), T(ico(0.55, 1), x - 0.5 * s, 1.7 * s, z - 0.15 * s, 0, 0, 0, s)); },
    pine(B, x, z, s, r, leaf = 0x2f7a46, snow = 0) { B.add(mat(0x6a4428), T(cyl(0.12, 0.16, 0.7), x, 0, z, 0, 0, 0, s)); [[0.95, 1.2, 0.5], [0.75, 1.05, 1.15], [0.52, 0.95, 1.75]].forEach(([cr, h, y]) => { B.add(mat(leaf), T(cone(cr, h, 7), x, y * s, z, r(), 0, 0, s)); if (snow) B.add(mat(snow), T(cone(cr * 0.62, h * 0.42, 7), x, (y + h * 0.6) * s, z, r(), 0, 0, s)); }); },
    palm(B, x, z, s, r) { const lean = (r() - 0.5) * 0.5; for (let i = 0; i < 4; i++) B.add(mat(0x9a7448), T(cyl(0.14 - i * 0.015, 0.16 - i * 0.015, 0.8, 7), x + Math.sin(lean) * i * 0.8 * s, i * 0.78 * s, z, 0, 0, -lean * (i + 1) * 0.35, s)); const tx = x + Math.sin(lean) * 3.2 * s, ty = 3.15 * s; for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + r(); const g = new THREE.ConeGeometry(0.22, 1.7, 3); g.rotateZ(Math.PI / 2 + 0.55); g.rotateY(a); g.translate(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7); B.add(mat(k % 2 ? 0x3fae4a : 0x52c45a), T(g, tx, ty, z, 0, 0, 0, s)); } B.add(mat(0x6a4a2a), T(ico(0.16, 0), tx + 0.1, ty - 0.15, z, 0, 0, 0, s)); },
    sakura(B, x, z, s, r) { B.add(mat(0x5a3a30), T(cyl(0.14, 0.22, 1.6), x, 0, z, 0, 0, 0.12, s)); [[0, 2.1, 0, 1.0], [0.7, 1.9, 0.3, 0.75], [-0.7, 1.85, -0.2, 0.72], [0.15, 2.6, -0.35, 0.68], [-0.25, 2.4, 0.55, 0.6]].forEach(([dx, y, dz, rr], i) => B.add(mat(i % 2 ? 0xff9fcf : 0xffbfe0), T(ico(rr, 1), x + dx * s, y * s, z + dz * s, r() * 3, 0, 0, s))); },
    cactus(B, x, z, s, r) { const g = mat(0x4f9a4a); B.add(g, T(cyl(0.24, 0.26, 1.9, 8), x, 0, z, 0, 0, 0, s)); B.add(g, T(ico(0.24, 1), x, 1.9 * s, z, 0, 0, 0, s)); const side = r() < 0.5 ? 1 : -1; B.add(g, T(cyl(0.13, 0.13, 0.5, 7), x + side * 0.24 * s, 0.85 * s, z, 0, 0, side * Math.PI / 2, s)); B.add(g, T(cyl(0.13, 0.13, 0.7, 7), x + side * 0.6 * s, 0.85 * s, z, 0, 0, 0, s)); B.add(g, T(cyl(0.11, 0.11, 0.35, 7), x - side * 0.22 * s, 1.15 * s, z, 0, 0, -side * Math.PI / 2, s)); B.add(g, T(cyl(0.11, 0.11, 0.5, 7), x - side * 0.5 * s, 1.15 * s, z, 0, 0, 0, s)); },
    column(B, x, z, s, r, c = 0xd8d2c4, broken = false) { const m = mat(c); const h = broken ? 1.2 + r() * 1.4 : 3.2; B.add(m, T(box(0.9, 0.3, 0.9), x, 0, z, 0, 0, 0, s)); B.add(m, T(cyl(0.3, 0.34, h, 10), x, 0.3 * s, z, 0, 0, broken ? (r() - 0.5) * 0.15 : 0, s)); if (!broken) B.add(m, T(box(0.95, 0.28, 0.95), x, (0.3 + h) * s, z, 0, 0, 0, s)); },
    rock(B, x, z, s, r, c = 0x8a8378) { const g = new THREE.DodecahedronGeometry(0.6, 0); g.scale(1, 0.7, 1); B.add(mat(c), T(g, x, 0.3 * s, z, r() * 3, 0, 0, s)); },
    crystal(B, x, z, s, r, m) { for (let i = 0; i < 3; i++) { const g = new THREE.OctahedronGeometry(0.32, 0); g.scale(0.7, 2.4, 0.7); B.add(m, T(g, x + (i - 1) * 0.28 * s, 0.6 * s, z + (r() - 0.5) * 0.3 * s, r() * 3, 0, (i - 1) * 0.35, s * (i === 1 ? 1.25 : 0.85))); } },
    flowers(B, x, z, s, r, cols = [0xff7ad9, 0xffd34d, 0xffffff, 0xff9a5a]) { for (let i = 0; i < 6; i++) { const dx = (r() - 0.5) * 1.4, dz = (r() - 0.5) * 1.4; B.add(mat(0x4caf50), T(cyl(0.025, 0.025, 0.32, 4), x + dx, 0, z + dz)); B.add(mat(cols[i % cols.length]), T(ico(0.1, 0), x + dx, 0.36, z + dz)); } },
    bush(B, x, z, s, r, c = 0x4f9f44) { B.add(mat(c), T(ico(0.55, 1), x, 0.35 * s, z, r() * 3, 0, 0, s)); B.add(mat(c), T(ico(0.4, 1), x + 0.4 * s, 0.28 * s, z + 0.2 * s, 0, 0, 0, s)); },
    lamp(B, x, z, s, m) { B.add(mat(0x2a2f38), T(cyl(0.05, 0.07, 1.8, 6), x, 0, z, 0, 0, 0, s)); B.add(m, T(ico(0.17, 1), x, 1.9 * s, z, 0, 0, 0, s)); },
  };

  // ---------- landmarks on the floating islet ----------
  const LAND = {
    bigtree(B, r) { P.tree(B, 0, 0, 2.1, r); P.flowers(B, 1.6, 1.2, 1, r); P.bush(B, -1.6, 1.4, 1, r); },
    hut(B, r) { B.add(mat(0xa8743e), T(box(2.6, 1.6, 2.2), 0, 0, 0)); B.add(mat(0x6a4a2a), T(box(0.7, 1.1, 0.06), 0, 0, 1.12)); B.add(mat(0xe0c070), T(new THREE.ConeGeometry(2.3, 1.5, 4).translate(0, 0.75, 0), 0, 1.6, 0, Math.PI / 4)); P.palm(B, 2.2, -1.4, 0.9, r); P.palm(B, -2.3, 1.2, 0.8, r); },
    ruin(B, r) { const c = 0xc8c2b4; P.column(B, -1.4, 0, 1, r, c); P.column(B, 1.4, 0, 1, r, c); B.add(mat(c), T(box(3.8, 0.55, 1.1), 0, 3.7, 0)); P.column(B, -2.4, 1.8, 1, r, c, true); P.rock(B, 2.2, 1.6, 1, r, 0xb0aa9c); P.bush(B, 0.2, 1.8, 0.9, r, 0x6f9a4a); },
    cabin(B, r) { B.add(mat(0x8a5a36), T(box(2.6, 1.7, 2.2), 0, 0, 0)); const roof = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-1.6, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(0, 1.3)]), { depth: 2.6, bevelEnabled: false }).translate(0, 0, -1.3); B.add(mat(0xffffff), T(roof, 0, 1.7, 0)); B.add(glow(2.4, 1.8, 0.9), T(box(0.6, 0.5, 0.05), 0.6, 0.7, 1.11)); B.add(mat(0x5a3a20), T(box(0.6, 1.1, 0.05), -0.6, 0, 1.11)); B.add(mat(0x8a8a8a), T(box(0.35, 1.0, 0.35), 0.8, 2.3, -0.4)); P.pine(B, 2.4, -1, 1, r, 0x2f6a46, 0xffffff); P.pine(B, -2.4, 0.8, 0.8, r, 0x2f6a46, 0xffffff); },
    pagoda(B, r) { const red = mat(0xc8323a), dark = mat(0x3a2a2a); for (let i = 0; i < 3; i++) { const w = 2.4 - i * 0.55; B.add(red, T(box(w, 0.95, w), 0, i * 1.25, 0)); B.add(dark, T(new THREE.ConeGeometry(w * 0.95, 0.5, 4).translate(0, 0.25, 0), 0, i * 1.25 + 0.95, 0, Math.PI / 4)); } B.add(mat(0xffc861, { metalness: 0.8, roughness: 0.3 }), T(cyl(0.05, 0.05, 0.9, 6), 0, 3.95, 0)); B.add(red, T(box(0.18, 2.2, 0.18), -2.6, 0, 1.6)); B.add(red, T(box(0.18, 2.2, 0.18), -1.2, 0, 1.6)); B.add(dark, T(box(1.9, 0.18, 0.3), -1.9, 2.2, 1.6)); B.add(red, T(box(1.6, 0.14, 0.24), -1.9, 1.85, 1.6)); P.sakura(B, 2.2, 1.4, 0.9, r); },
    pyramid(B, r) { B.add(mat(0xd8a860), T(new THREE.ConeGeometry(2.6, 3.2, 4).translate(0, 1.6, 0), 0, 0, -0.3, Math.PI / 4)); B.add(mat(0xc89850), T(new THREE.ConeGeometry(1.2, 1.5, 4).translate(0, 0.75, 0), 2.1, 0, 1.6, Math.PI / 4)); P.palm(B, -2.3, 1.6, 0.85, r); P.cactus(B, 1.6, -2.2, 0.8, r); },
    lighthouse(B, r) { for (let i = 0; i < 5; i++) B.add(mat(i % 2 ? 0xd8323a : 0xf4f4f4), T(cyl(0.85 - i * 0.08, 0.9 - i * 0.08, 0.9, 14), 0, i * 0.9, 0)); B.add(mat(0x2a3442), T(cyl(0.6, 0.6, 0.12, 14), 0, 4.5, 0)); B.add(glow(3.0, 2.6, 1.3), T(cyl(0.42, 0.42, 0.55, 12), 0, 4.62, 0)); B.add(mat(0x2a3442), T(cone(0.62, 0.6, 14), 0, 5.17, 0)); B.add(mat(0x8a5a36), T(box(1.0, 0.2, 3.2), 0, 0, 2.4)); },
    spire(B, r) { const m = new THREE.MeshPhysicalMaterial({ color: 0x9a6cff, emissive: 0x5a2aff, emissiveIntensity: 1.1, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.85 }); spin.push(m); for (let i = 0; i < 5; i++) { const g = new THREE.OctahedronGeometry(0.5, 0); g.scale(0.8, 4 - i * 0.55, 0.8); B.add(m, T(g, (i % 2 ? 1 : -1) * i * 0.35, 1.5 + (4 - i) * 0.2, (i - 2) * 0.3, i, 0, (i - 2) * 0.25, 1)); } P.pine(B, 2.3, 1.3, 0.9, r, 0x183a3a); P.pine(B, -2.3, -1.2, 0.8, r, 0x183a3a); },
    temple(B, r) { const w = mat(0xf6f2e8), gold = mat(0xffc861, { metalness: 0.9, roughness: 0.25 }); B.add(w, T(cyl(2.4, 2.6, 0.4, 24), 0, 0, 0)); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; B.add(w, T(cyl(0.22, 0.24, 2.6, 10), Math.cos(a) * 1.8, 0.4, Math.sin(a) * 1.8)); } B.add(w, T(cyl(2.1, 2.1, 0.3, 24), 0, 3.0, 0)); const dome = new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); B.add(gold, T(dome, 0, 3.3, 0)); B.add(gold, T(cyl(0.06, 0.06, 0.9, 6), 0, 4.75, 0)); },
    volcano(B, r) { B.add(mat(0x2a2220), T(new THREE.CylinderGeometry(0.9, 3.0, 3.6, 9, 1, true).translate(0, 1.8, 0), 0, 0, 0)); B.add(lavaMat, T(new THREE.CircleGeometry(0.85, 12).rotateX(-Math.PI / 2), 0, 3.35, 0)); for (let i = 0; i < 4; i++) { const a = i * 1.7; const g = box(0.25, 3.0, 0.06); g.rotateX(-0.6); B.add(lavaMat, T(g, Math.cos(a) * 1.6, 0.2, Math.sin(a) * 1.6, -a + Math.PI / 2)); } P.rock(B, 2.4, 1.2, 1.2, r, 0x2a2220); },
  };

  // ---------- shared animated materials ----------
  const fallTex = canvasTex(THREE, 64, (g, s) => { g.clearRect(0, 0, s, s); for (let i = 0; i < 22; i++) { const x = Math.random() * s; const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(x, Math.random() * s * 0.5, 1.5 + Math.random() * 2.5, s * (0.4 + Math.random() * 0.6)); } g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, 0, s, s); });
  const lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 0.18) });
  const dot = canvasTex(THREE, 32, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, { srgb: false });
  const spin = [];
  let falls = [], fx = null, floaters = [], cur = "", groupRef = null;

  function waterfall(parent, x, z, ry, W, col, lava, glowy) {
    const len = 15.5, m = new THREE.MeshBasicMaterial({ color: lava ? new THREE.Color(2.4, 0.8, 0.15) : glowy ? new THREE.Color(col).multiplyScalar(1.6) : col, map: fallTex.clone(), transparent: true, opacity: lava ? 0.95 : 0.85, depthWrite: false, side: THREE.DoubleSide, fog: true });
    m.map.repeat.set(1.2, 3); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W, len), m); p.position.set(x, -len / 2 - 0.05, z); p.rotation.y = ry; parent.add(p);
    // the stream on top, the lip, the mist at the bottom
    const ch = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.06, 2.2), new THREE.MeshStandardMaterial({ color: lava ? 0xff6a1a : col, emissive: lava ? 0xff4a00 : glowy ? col : 0x000000, emissiveIntensity: lava ? 1.4 : 0.5, roughness: 0.1, transparent: !lava, opacity: 0.85 }));
    ch.position.set(x - Math.sin(ry) * 1.1, 0.03, z - Math.cos(ry) * 1.1); ch.rotation.y = ry; parent.add(ch);
    const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: lava ? 0xff8a3a : 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    mist.scale.set(W * 2.2, 2.4, 1); mist.position.set(x + Math.sin(ry) * 0.6, -len + 0.4, z + Math.cos(ry) * 0.6); parent.add(mist);
    falls.push(m);
  }

  function weather(parent, f, W) {
    const n = reduce ? Math.floor(f.n / 3) : f.n, pos = new Float32Array(n * 3), seed = new Float32Array(n), h = 16;
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * (W + 14); pos[i * 3 + 1] = Math.random() * h - 2; pos[i * 3 + 2] = (Math.random() - 0.5) * (W + 14); seed[i] = Math.random() * 10; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: f.color, size: f.size, map: dot, transparent: true, depthWrite: false, blending: f.kind === "snow" || f.kind === "petals" ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: f.kind === "sparkle" ? 0.9 : 1 });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; parent.add(pts);
    fx = { pts, pos, seed, kind: f.kind, W: W + 14, h };
  }

  function islet(parent, cx, cy, cz, size, st, r, landmark) {
    const g = new THREE.Group(); g.position.set(cx, cy, cz); parent.add(g);
    const top = new THREE.Mesh(new THREE.BoxGeometry(size, 0.8, size), [mat(st.side), mat(st.side), new THREE.MeshStandardMaterial({ color: st.top, roughness: 0.95 }), mat(st.side), mat(st.side), mat(st.side)]); top.position.y = -0.4; top.receiveShadow = true; g.add(top);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(size + 0.2, 0.25, size + 0.2), mat(st.lip)); lip.position.y = -0.12; g.add(lip);
    for (let i = 1; i <= 3; i++) { const w = size * (1 - i * 0.24); const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, w), mat(i % 2 ? st.dirt : st.rock)); m.position.y = -0.8 - i * 0.85; m.rotation.y = i * 0.2; g.add(m); }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(size * 0.18, 2.4, 5), mat(st.rock)); tip.rotation.x = Math.PI; tip.position.y = -4.8; g.add(tip);
    const B = Batch(); if (landmark) LAND[landmark](B, r); else (st.decor === "desert" ? P.cactus : st.decor === "tropical" || st.decor === "ocean" ? P.palm : st.decor === "sakura" ? P.sakura : st.decor === "snow" || st.decor === "aurora" ? (b, x, z, s, rr) => P.pine(b, x, z, s, rr, st.decor === "snow" ? 0x2f6a46 : 0x183a3a, st.decor === "snow" ? 0xffffff : 0) : st.decor === "celestial" ? (b, x, z, s, rr) => P.column(b, x, z, s * 0.6, rr, 0xf6f2e8) : st.decor === "volcano" ? (b, x, z, s, rr) => P.rock(b, x, z, s * 1.4, rr, 0x2a2220) : P.tree)(B, 0, 0, 0.8, r);
    B.build(g);
    floaters.push({ g, y0: cy, k: r() * 6 });
    return g;
  }

  // The look for a style id ("" = the plain island). land.userData has topMat, sideMat, rock, dirt, sea, clouds.
  function apply(land, N, id) {
    const u = land.userData, st = STYLES[id];
    if (u.styled) { land.remove(u.styled); u.styled.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); u.styled = null; }
    falls = []; fx = null; floaters = []; spin.length = 0; cur = id || "";
    const D = { top: 0x5fae62, side: 0x6a4a32, rock: 0x7d7368, dirt: 0x5f4430, sea: 0xffffff, seaOp: 0.55, clouds: true };
    const s = st || D;
    if (u.topMat) u.topMat.color.set(s.top); if (u.sideMat) u.sideMat.color.set(s.side); if (u.rock) u.rock.color.set(s.rock); if (u.dirt) u.dirt.color.set(s.dirt);
    if (u.sea) { u.sea.material.color.set(s.sea); u.sea.material.opacity = s.seaOp; }
    if (u.clouds) { u.clouds.visible = s.clouds; const m = u.clouds.userData.mat; if (m) { if (m.userData.c0 == null) m.userData.c0 = m.color.getHex(); m.color.set(s.cloud ?? m.userData.c0); } }
    if (!st) return;
    const g = new THREE.Group(); g.name = "style"; land.add(g); u.styled = g; groupRef = g;
    const W = N + 6, h = N / 2, r = rng(st.seed + N);
    // the grassy (snowy, sandy…) overhang and the rim around the build area
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.3, W + 0.3), new THREE.MeshStandardMaterial({ color: st.lip, roughness: 0.95 })); lip.position.y = -0.17; lip.receiveShadow = true; g.add(lip);
    if (st.rim) { const rm = new THREE.MeshStandardMaterial({ color: st.rim, roughness: 0.9 }); [[0, -(h + 1.5), W, 3], [0, h + 1.5, W, 3], [-(h + 1.5), 0, 3, N], [h + 1.5, 0, 3, N]].forEach(([x, z, w, d]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), rm); m.position.set(x, 0.02, z); m.receiveShadow = true; g.add(m); }); }
    if (st.icicles) { const B = Batch(); const ice = new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.1, transparent: true, opacity: 0.85 }); for (let i = 0; i < W * 3; i++) { const t = (i / (W * 3)) * 4, side = Math.floor(t), f = (t % 1) * W - W / 2, L = 0.4 + r() * 1.1; const [x, z] = [[f, -W / 2 - 0.1], [W / 2 + 0.1, f], [-f, W / 2 + 0.1], [-W / 2 - 0.1, -f]][side]; const c = new THREE.ConeGeometry(0.1 + r() * 0.08, L, 5); c.rotateX(Math.PI); c.translate(x, -0.35 - L / 2, z); B.add(ice, c); } B.build(g, { shadow: false }); }
    if (st.lavaBands) { for (let i = 1; i <= 4; i++) { const w = W * (1 - i * 0.15) + 0.08; const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, w), lavaMat); m.position.y = -0.3 - i * 1.3; m.rotation.y = i * 0.12; g.add(m); } }
    // props along the edge (out of the build area; the portal corner stays clear)
    const B = Batch(), n = Math.round(W * 0.85), lampM = glow(2.4, 1.9, 1.0);
    const crystalM = new THREE.MeshPhysicalMaterial({ color: st.decor === "celestial" ? 0xbfe8ff : 0x8a5cff, emissive: st.decor === "celestial" ? 0x6ab8ff : 0x6a2aff, emissiveIntensity: 0.9, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.88 });
    for (let i = 0; i < n; i++) {
      const t = (i + r() * 0.6) / n * 4, side = Math.floor(t) % 4, f = (t % 1) * (W - 2) - (W - 2) / 2, d = h + 0.9 + r() * 1.5;
      const [x, z] = [[f, -d], [d, f], [-f, d], [-d, -f]][side];
      if (x < -h + 1 && z > h - 6) continue; // the portal
      const sc = 0.75 + r() * 0.5, k = r();
      switch (st.decor) {
        case "grass": (k < 0.4 ? P.tree : k < 0.7 ? P.pine : k < 0.85 ? P.bush : P.flowers)(B, x, z, sc, r); break;
        case "tropical": (k < 0.55 ? P.palm : k < 0.75 ? P.bush : k < 0.9 ? P.flowers : P.rock)(B, x, z, sc, r, ...(k >= 0.9 ? [0xb0a080] : [])); break;
        case "stone": if (k < 0.45) P.column(B, x, z, sc * 0.8, r, 0xc8c2b4, k < 0.3); else if (k < 0.7) P.rock(B, x, z, sc, r, 0xa8a496); else (k < 0.85 ? P.bush : P.tree)(B, x, z, sc, r, 0x6f9a4a, 0x8fbf5a); break;
        case "snow": if (k < 0.7) P.pine(B, x, z, sc * 1.1, r, 0x2f6a46, 0xffffff); else P.rock(B, x, z, sc, r, 0xdfe8f0); break;
        case "sakura": (k < 0.55 ? P.sakura : k < 0.75 ? P.bush : P.flowers)(B, x, z, sc, r, ...(k >= 0.75 ? [[0xff9fcf, 0xffffff, 0xffd1ea]] : k >= 0.55 ? [0x6fb85a] : [])); break;
        case "desert": if (k < 0.45) P.cactus(B, x, z, sc, r); else if (k < 0.65) P.palm(B, x, z, sc * 0.85, r); else if (k < 0.85) P.rock(B, x, z, sc * 1.1, r, 0xc8904e); else P.column(B, x, z, sc * 0.7, r, 0xd8b078, true); break;
        case "ocean": (k < 0.45 ? P.palm : k < 0.65 ? P.tree : k < 0.85 ? P.bush : P.rock)(B, x, z, sc, r, ...(k >= 0.85 ? [0x9aa4a6] : [])); break;
        case "aurora": if (k < 0.45) P.pine(B, x, z, sc * 1.1, r, 0x183a3a); else if (k < 0.75) P.crystal(B, x, z, sc, r, crystalM); else if (k < 0.85) P.lamp(B, x, z, sc, glow(0.6, 2.2, 2.6)); else P.rock(B, x, z, sc, r, 0x2a3048); break;
        case "celestial": if (k < 0.4) P.column(B, x, z, sc * 0.75, r, 0xf6f2e8); else if (k < 0.6) P.crystal(B, x, z, sc * 0.8, r, crystalM); else if (k < 0.8) P.bush(B, x, z, sc, r, 0xd8f0d0); else P.flowers(B, x, z, sc, r, [0xffffff, 0xffe9a8, 0xbfe8ff]); break;
        case "volcano": if (k < 0.55) P.rock(B, x, z, sc * 1.3, r, k < 0.3 ? 0x2a2220 : 0x3a3230); else if (k < 0.75) { P.rock(B, x, z, sc, r, 0x1e1816); B.add(lavaMat, T(new THREE.CircleGeometry(0.5 * sc, 8).rotateX(-Math.PI / 2), x + 0.6, 0.05, z)); } else P.lamp(B, x, z, sc, glow(2.6, 0.9, 0.2)); break;
      }
    }
    B.build(g);
    // waterfalls (lava on the volcano)
    const fl = st.falls, spots = [[Math.PI, 0], [Math.PI / 2, 1], [0, 2], [-Math.PI / 2, 3]]; // [facing, side]: the far sides first
    for (let i = 0; i < fl.n; i++) {
      const [ry, side] = spots[i % 4], along = (r() - 0.5) * (W - 10);
      const pos = [[along, -W / 2 - 0.2], [W / 2 + 0.2, along], [along, W / 2 + 0.2], [-W / 2 - 0.2, -Math.abs(along) - 3]][side];
      waterfall(g, pos[0], pos[1], ry, 1.6 + r() * 1.2, fl.color, fl.lava, fl.glow);
    }
    // the islet with the landmark (ahead of where you arrive), and two small ones
    islet(g, h + 10, 0.8, -(h + 10), 8, st, r, st.land);
    islet(g, -(h + 9), 3.5, -(h + 3), 3.4, st, r, "");
    islet(g, h + 6, -3, h + 10, 3, st, r, "");
    if (st.boats) { const BB = Batch(); for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2, d = W * 0.9 + r() * 14, x = Math.cos(a) * d, z = Math.sin(a) * d; BB.add(mat(0xf4f4f4), T(box(1.4, 0.4, 3.2), x, -15.95, z, a)); BB.add(mat(0x2f86ff), T(box(1.0, 0.5, 1.2), x, -15.55, z, a)); } BB.build(g); }
    if (st.fx) weather(g, st.fx, W);
  }

  function tick(dt, t) {
    if (!cur) return;
    for (const m of falls) m.map.offset.y += dt * (cur === "style-snow" ? 0.35 : cur === "style-volcano" ? 0.25 : 0.7);
    if (cur === "style-volcano") { const k = 0.85 + Math.sin(t * 2.2) * 0.15; lavaMat.color.setRGB(2.6 * k, 0.9 * k, 0.18); }
    for (const m of spin) m.emissiveIntensity = 0.9 + Math.sin(t * 1.6) * 0.35;
    if (reduce) return;
    for (const f of floaters) f.g.position.y = f.y0 + Math.sin(t * 0.6 + f.k) * 0.35;
    if (fx) {
      const { pos, seed, kind, W, h } = fx, n = seed.length;
      for (let i = 0; i < n; i++) {
        const j = i * 3, s = seed[i];
        if (kind === "snow") { pos[j + 1] -= dt * (0.9 + (s % 1) * 0.6); pos[j] += Math.sin(t + s) * dt * 0.4; }
        else if (kind === "petals") { pos[j + 1] -= dt * (0.55 + (s % 1) * 0.4); pos[j] += dt * 0.7; pos[j + 2] += Math.sin(t * 1.3 + s) * dt * 0.5; }
        else if (kind === "embers") { pos[j + 1] += dt * (1.1 + (s % 1) * 1.2); pos[j] += Math.sin(t * 2 + s) * dt * 0.3; }
        else { pos[j + 1] += dt * 0.25; }
        if (pos[j + 1] < -2) pos[j + 1] = h - 2; if (pos[j + 1] > h - 2) pos[j + 1] = -2;
        if (pos[j] > W / 2) pos[j] = -W / 2;
      }
      fx.pts.geometry.attributes.position.needsUpdate = true;
      if (kind === "sparkle") fx.pts.material.opacity = 0.65 + Math.sin(t * 3) * 0.25;
    }
  }
  return { apply, tick, current: () => cur };
}
