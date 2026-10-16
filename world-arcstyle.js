// world-arcstyle.js — the ARCIRCLE World look (world-art/ART-SPEC.md) for the town: shop buildings, the houses and
// towers around them, lush trees, street lamps, the plaza fountain, the district arches and the plaza floor.
// Everything is built in code from a few shapes and baked into one mesh per material (white shell, trim, dark glass,
// light), so a building costs four or five draw calls however many parts it has. The art-direction sheets
// ("Buildings & Shops", "Plants & Decorations", "Building Blocks") are the reference: white ceramic bodies, domed and
// rounded roofs, blue glass, lines of light, round green trees.
import * as THREE from "./vendor/three/three-0.186.1.module.min.js";
import { windLook, waterLook } from "./world-look.js";
import { mergeGeometries } from "./vendor/three/addons/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "./vendor/three/addons/RoundedBoxGeometry.js";
const TAU = Math.PI * 2;

// ---------------- materials (shared: one of each in the whole town) ----------------
const M = {};
const mat = (k, make, tag) => M[k] || (M[k] = Object.assign(make(), tag ? { userData: tag } : {}));
export const shell = () => mat("shell", () => new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.4, metalness: 0.06 }), { paint: 0xdfe6ee });
export const stone = () => mat("stone", () => new THREE.MeshStandardMaterial({ color: 0xbfc9d4, roughness: 0.7, metalness: 0.02 }), { paint: 0xbfc9d4 });
export const trim = () => mat("trim", () => new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.42, metalness: 0.3 }));
export const glass = () => mat("glass", () => new THREE.MeshStandardMaterial({ color: 0x3f8fe8, roughness: 0.12, metalness: 0.35, emissive: 0x1f6fd6, emissiveIntensity: 0.75 }));
export const light = (c) => mat("light" + c, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.9, roughness: 0.4, toneMapped: true }), { glow: c });
const shellBase = () => shell(), stoneBase = () => stone();
const archGlass = () => mat("archGlass", () => new THREE.MeshStandardMaterial({ color: 0x3f8fff, emissive: 0x1d63d6, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.35 }), { glow: 0x3f8fff });
const shellOf = (c) => mat("shell" + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.06 }), { paint: c });
const stoneOf = (c) => mat("stone" + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.02 }), { paint: c });
// the districts: a stone and a shape each (world-kit.js passes the shop's district)
const DISTRICT_STYLE = {
  Launch: { shell: 0xe2ede7, stone: 0xb9cbc2, h: 1.0 },
  Finance: { shell: 0xeee6d8, stone: 0xcabca4, h: 1.22, extra: "pediment" },
  Research: { shell: 0xdde8f4, stone: 0xb6c6d8, h: 1.1, extra: "glassband" },
  ARCL: { shell: 0xf0e7cc, stone: 0xcdbd92, h: 0.95, w: 1.05, extra: "coin" },
  ARCIA: { shell: 0xeee1ee, stone: 0xcbb6cc, h: 1.05, extra: "stage" },
};
export const tint = (c) => mat("tint" + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.12 }), { paint: c });
export const wood = () => mat("wood", () => new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.8 }), { paint: 0x7a5236 });

// ---------------- baking: many parts → one mesh per material ----------------
// the painted shell: ceramic panels (fine seams every 1.2 m across and 0.75 m up) and a little shade near the ground,
// so a white wall reads as a built thing and not a flat box (a shader step on the one shared material)
const PAINT = () => mat("PAINT", () => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPanel; varying vec3 vPanelN;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvPanel = position; vPanelN = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vPanel; varying vec3 vPanelN;").replace("#include <color_fragment>", `#include <color_fragment>
      { vec3 an = abs(normalize(vPanelN)); float u = an.x > an.z ? vPanel.z : vPanel.x;
        float side = step(an.y, 0.6); // walls only
        float sx = abs(fract(u / 1.2 + 0.5) - 0.5) * 1.2, sy = abs(fract(vPanel.y / 0.75) - 0.5) * 0.75;
        float seam = (1.0 - smoothstep(0.008, 0.022, min(sx, sy))) * side;
        diffuseColor.rgb *= 1.0 - seam * 0.12;
        diffuseColor.rgb *= mix(0.84, 1.0, smoothstep(0.0, 1.1, vPanel.y)); }`);
  };
  m.customProgramCacheKey = () => "panels"; return m; });
const GLOW = () => mat("GLOW", () => new THREE.MeshBasicMaterial({ vertexColors: true }));
/// parts: [[geometry, material, { x, y, z, rx, ry, rz, sx, sy, sz }]] → a Group of merged meshes
const O = new THREE.Object3D();
export function bake(parts, { shadows = true } = {}) {
  const by = new Map(), col = new THREE.Color();
  for (const [geo, m0, t = {}] of parts) {
    // painted parts (shell, stone, tints) share one vertex-coloured material, lights another: fewer draw calls
    const kind = m0.userData && m0.userData.paint != null ? "paint" : m0.userData && m0.userData.glow != null ? "glow" : null;
    const m = kind === "paint" ? PAINT() : kind === "glow" ? GLOW() : m0;
    O.position.set(t.x || 0, t.y || 0, t.z || 0); O.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0); O.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1); O.updateMatrix();
    let g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(O.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (kind) { col.set(kind === "paint" ? m0.userData.paint : m0.userData.glow); const k = kind === "glow" ? 2.2 : 1, n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r * k; a[i * 3 + 1] = col.g * k; a[i * 3 + 2] = col.b * k; } g.setAttribute("color", new THREE.BufferAttribute(a, 3)); }
    if (!by.has(m)) by.set(m, []); by.get(m).push(g);
  }
  const out = new THREE.Group();
  for (const [m, list] of by) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = shadows && !m.transparent; mesh.receiveShadow = true; out.add(mesh); list.forEach((g) => g.dispose()); }
  return out;
}
const box = (w, h, d, r = 0.12, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
const cyl = (rt, rb, h, n = 32) => new THREE.CylinderGeometry(rt, rb, h, Math.min(n, 28));
const sph = (r, ws = 32, hs = 20, top = false) => new THREE.SphereGeometry(r, Math.min(ws, 28), Math.min(hs, top ? 10 : 16), 0, TAU, 0, top ? Math.PI / 2 : Math.PI);
const tor = (r, t, n = 64, arc = TAU) => new THREE.TorusGeometry(r, t, 6, Math.min(n, 56), arc);

// ---------------- the shop buildings ----------------
// Every shop is a white two-tier hall facing +Z (towards the plaza), with a glass entrance framed in light, a band
// of windows, a roof in its own form and its colour in the light lines. `h` is the roof height, where the shop's
// own accent (the rocket, the orb, the coin…) sits.
const KIND = {
  launch: { roof: "spire", tower: true }, quantum: { roof: "dome", rings: true }, swap: { roof: "dome", wings: true, screen: true },
  orders: { roof: "step", wings: true }, staking: { roof: "dome", columns: true, gold: true }, locker: { roof: "flat", vault: true },
  scanner: { roof: "spire", tower: true }, predict: { roof: "dome", rings: true }, reward: { roof: "flat", stacks: true },
  arcia: { roof: "dome", wings: true }, "arcl-shop": { roof: "awning" }, "arcl-ex": { roof: "dome", columns: true }, forge: { roof: "step", stacks: true },
};
export function makeArcBuilding(id, color, district = "") {
  const k = KIND[id] || { roof: "dome" }, c = light(color), P = [];
  // each district has its own stone and proportions, so the halls don't read as one building copied round the plaza
  const ds = DISTRICT_STYLE[district] || {}, shell = ds.shell ? () => shellOf(ds.shell) : shellBase, stone = ds.stone ? () => stoneOf(ds.stone) : stoneBase;
  const W = 4.4 * (ds.w || 1), D = 3.4, H1 = 2.3 * (ds.h || 1); // the hall
  // a stone base step, the hall, the upper drum
  P.push([box(W + 0.5, 0.28, D + 0.5, 0.1), stone(), { y: 0.14 }]);
  P.push([box(W, H1, D, 0.32), shell(), { y: 0.28 + H1 / 2 }]);
  P.push([box(W + 0.16, 0.2, D + 0.16, 0.08), shell(), { y: 0.28 + H1 }]); // the cornice
  P.push([box(W + 0.18, 0.05, D + 0.18, 0.02), c, { y: 0.28 + H1 - 0.1 }]); // a line of light all round under it
  P.push([box(W + 0.06, 0.05, D + 0.06, 0.02), light(0x35d8d0), { y: 0.42 }]); // and one at the foot
  // corner pilasters, each with a strip of light
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push([box(0.42, H1 + 0.1, 0.42, 0.14), shell(), { x: sx * (W / 2 - 0.05), y: 0.28 + H1 / 2, z: sz * (D / 2 - 0.05) }], [box(0.05, H1 - 0.6, 0.05, 0.02), c, { x: sx * (W / 2 + 0.17), y: 0.28 + H1 / 2, z: sz * (D / 2 - 0.05) }]);
  P.push([box(W - 0.2, 0.06, 0.04, 0.02), c, { y: 0.28 + H1 - 0.22, z: D / 2 + 0.01 }]); // the light line under it
  // the entrance: a glass door in a shell frame, lit around
  P.push([box(1.5, 1.85, 0.3, 0.12), shell(), { y: 0.28 + 0.95, z: D / 2 + 0.08 }]);
  P.push([box(1.12, 1.55, 0.1, 0.08), glass(), { y: 0.28 + 0.82, z: D / 2 + 0.2 }]);
  P.push([tor(0.62, 0.04, 40, Math.PI), c, { y: 0.28 + 1.55, z: D / 2 + 0.24 }]);
  P.push([box(0.06, 1.3, 0.06, 0.02), c, { x: -0.62, y: 0.28 + 0.9, z: D / 2 + 0.24 }], [box(0.06, 1.3, 0.06, 0.02), c, { x: 0.62, y: 0.28 + 0.9, z: D / 2 + 0.24 }]);
  // windows: a row of rounded glass panes on the front and the sides
  for (const x of [-1.5, 1.5]) P.push([box(0.86, 1.1, 0.1, 0.14), shell(), { x, y: 0.28 + 1.35, z: D / 2 + 0.03 }], [box(0.66, 0.9, 0.1, 0.1), glass(), { x, y: 0.28 + 1.35, z: D / 2 + 0.07 }], [box(0.04, 0.88, 0.04, 0.01), shell(), { x, y: 0.28 + 1.35, z: D / 2 + 0.12 }], [box(0.64, 0.04, 0.04, 0.01), shell(), { x, y: 0.28 + 1.42, z: D / 2 + 0.12 }], [box(0.92, 0.07, 0.16, 0.03), stone(), { x, y: 0.28 + 0.8, z: D / 2 + 0.1 }], [box(0.7, 0.05, 0.06, 0.02), c, { x, y: 0.28 + 0.76, z: D / 2 + 0.17 }]);
  for (const s of [-1, 1]) for (const z of [-0.8, 0.8]) P.push([box(0.08, 0.9, 0.7, 0.1), glass(), { x: s * (W / 2 + 0.02), y: 0.28 + 1.35, z }]);
  // the upper drum and the roof
  const top = 0.28 + H1 + 0.07;
  let h = top;
  if (k.roof === "dome") {
    P.push([cyl(1.55, 1.65, 0.7, 40), shell(), { y: top + 0.35 }], [tor(1.6, 0.05, 72), c, { y: top + 0.62, rx: Math.PI / 2 }]);
    P.push([sph(1.55, 40, 18, true), k.gold ? tint(0xffc861) : glass(), { y: top + 0.7, sy: 0.82 }], [cyl(0.14, 0.2, 0.3, 16), shell(), { y: top + 0.7 + 1.32 }]);
    h = top + 0.7 + 1.45;
  } else if (k.roof === "spire") {
    P.push([cyl(1.0, 1.25, 1.6, 36), shell(), { y: top + 0.8 }], [tor(1.06, 0.05, 64), c, { y: top + 1.2, rx: Math.PI / 2 }], [cyl(0.9, 0.95, 0.12, 36), glass(), { y: top + 0.6 }]);
    P.push([new THREE.ConeGeometry(1.05, 1.7, 36), shell(), { y: top + 1.6 + 0.85 }], [new THREE.ConeGeometry(0.3, 0.6, 16), c, { y: top + 1.6 + 1.9 }]);
    h = top + 1.6 + 0.9;
  } else if (k.roof === "step") {
    P.push([box(W - 0.8, 0.6, D - 0.7, 0.2), shell(), { y: top + 0.3 }], [box(W - 1.8, 0.5, D - 1.4, 0.18), tint(color), { y: top + 0.85 }], [box(W - 0.7, 0.05, 0.05, 0.02), c, { y: top + 0.58, z: (D - 0.7) / 2 + 0.01 }]);
    h = top + 1.1;
  } else if (k.roof === "awning") {
    // a market roof: a striped awning over the front and a round sign
    for (let i = 0; i < 6; i++) P.push([box(W / 6 - 0.02, 0.08, 1.1, 0.03), i % 2 ? shell() : tint(color), { x: -W / 2 + (i + 0.5) * (W / 6), y: top - 0.55, z: D / 2 + 0.45, rx: 0.35 }]);
    P.push([box(W - 0.6, 0.55, D - 0.6, 0.2), shell(), { y: top + 0.28 }]);
    h = top + 0.6;
  } else {
    P.push([box(W - 0.4, 0.4, D - 0.4, 0.15), shell(), { y: top + 0.2 }], [box(W - 0.5, 0.05, 0.05, 0.02), c, { y: top + 0.36, z: (D - 0.4) / 2 + 0.01 }]);
    h = top + 0.45;
  }
  // a little roof clutter on the back: vents and a mast (the halls read as working buildings from the street)
  P.push([box(0.5, 0.3, 0.4, 0.06), trim(), { x: 1.35, y: 0.28 + H1 + 0.32, z: -1.05 }], [box(0.36, 0.06, 0.3, 0.02), shell(), { x: 1.35, y: 0.28 + H1 + 0.5, z: -1.05 }], [cyl(0.03, 0.03, 0.8, 8), trim(), { x: -1.75, y: 0.28 + H1 + 0.55, z: -1.2 }], [sph(0.06, 10, 8), light(0xff4d6d), { x: -1.75, y: 0.28 + H1 + 0.98, z: -1.2 }]);
  // the extras that tell the shops apart
  if (k.wings) for (const s of [-1, 1]) { P.push([box(1.3, 1.6, 2.4, 0.3), shell(), { x: s * (W / 2 + 0.55), y: 0.28 + 0.8, z: -0.2 }], [sph(0.62, 24, 12, true), glass(), { x: s * (W / 2 + 0.55), y: 0.28 + 1.6, z: -0.2, sy: 0.7 }], [box(0.06, 0.06, 2.2, 0.02), c, { x: s * (W / 2 + 1.21), y: 0.28 + 1.2, z: -0.2 }]); }
  if (k.columns) for (const x of [-1.6, -0.95, 0.95, 1.6]) P.push([cyl(0.14, 0.16, 2.1, 16), shell(), { x, y: 0.28 + 1.05, z: D / 2 + 0.55 }], [cyl(0.2, 0.2, 0.12, 16), trim(), { x, y: 0.28 + 2.12, z: D / 2 + 0.55 }]);
  if (k.columns) P.push([box(W - 0.2, 0.18, 0.9, 0.08), shell(), { y: 0.28 + 2.25, z: D / 2 + 0.4 }]);
  if (k.tower) { P.push([cyl(0.42, 0.5, 3.6, 24), shell(), { x: -1.7, y: 0.28 + 1.8, z: -1.0 }], [tor(0.47, 0.035, 40), c, { x: -1.7, y: 0.28 + 2.6, z: -1.0, rx: Math.PI / 2 }], [tor(0.47, 0.035, 40), c, { x: -1.7, y: 0.28 + 3.2, z: -1.0, rx: Math.PI / 2 }], [sph(0.5, 20, 10, true), glass(), { x: -1.7, y: 0.28 + 3.6, z: -1.0 }]); }
  if (k.rings) P.push([tor(2.6, 0.04, 96), c, { y: 0.28 + 0.12, rx: Math.PI / 2 }]);
  if (k.vault) P.push([cyl(0.62, 0.62, 0.12, 40), trim(), { y: 0.28 + 1.3, z: D / 2 + 0.06, rx: Math.PI / 2 }], [tor(0.48, 0.05, 40), c, { y: 0.28 + 1.3, z: D / 2 + 0.14 }]);
  if (k.stacks) for (const x of [-1.5, 1.5]) P.push([cyl(0.28, 0.34, 1.6, 20), shell(), { x, y: top + 0.8, z: -0.9 }], [tor(0.3, 0.04, 30), c, { x, y: top + 1.45, z: -0.9, rx: Math.PI / 2 }]);
  if (k.screen) P.push([box(1.9, 0.9, 0.1, 0.06), glass(), { y: top + 0.25, z: D / 2 - 0.1 }]);
  // the district's own touch: Finance a pediment over columns' line, Research a glass band, ARCL a gold coin crest, ARCIA a pair of stage lights
  if (ds.extra === "pediment") P.push([box(W * 0.56, 0.16, 0.5, 0.05), shell(), { x: -W * 0.24, y: 0.28 + H1 + 0.42, z: D / 2 + 0.05, rz: 0.32 }], [box(W * 0.56, 0.16, 0.5, 0.05), shell(), { x: W * 0.24, y: 0.28 + H1 + 0.42, z: D / 2 + 0.05, rz: -0.32 }], [box(W * 0.8, 0.05, 0.05, 0.02), c, { y: 0.28 + H1 + 0.2, z: D / 2 + 0.3 }]);
  if (ds.extra === "glassband") P.push([box(W + 0.02, 0.36, D + 0.02, 0.06), glass(), { y: 0.28 + H1 * 0.5 + 0.95 }]);
  if (ds.extra === "coin") P.push([cyl(0.62, 0.62, 0.14, 32), tint(0xffc861), { y: 0.28 + H1 + 0.55, z: D / 2 + 0.05, rx: Math.PI / 2 }], [tor(0.62, 0.05, 40), c, { y: 0.28 + H1 + 0.55, z: D / 2 + 0.14 }]);
  if (ds.extra === "stage") for (const s of [-1, 1]) P.push([cyl(0.05, 0.05, 1.1, 8), trim(), { x: s * (W / 2 - 0.3), y: top + 0.55, z: D / 2 - 0.3 }], [cyl(0.2, 0.14, 0.3, 16), light(0xff7ad9), { x: s * (W / 2 - 0.3), y: top + 1.15, z: D / 2 - 0.2, rx: 0.6 }]);
  // planters with round shrubs by the door
  for (const s of [-1, 1]) { P.push([box(0.62, 0.42, 0.62, 0.1), shell(), { x: s * 1.2, y: 0.28 + 0.21, z: D / 2 + 0.75 }], [new THREE.IcosahedronGeometry(0.36, 2), tint(0x48b85a), { x: s * 1.2, y: 0.28 + 0.62, z: D / 2 + 0.75 }]); }
  const g = bake(P); g.name = "arc-building:" + id; g.userData.h = h; g.userData.w = W + 1.2;
  return g;
}

// ---------------- the town around the shops: houses, towers, turbines, tanks ----------------
export function makeArcTownPiece(kind, seed = 0) {
  const P = [], rr = (k) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const roofC = [0x2f86ff, 0x2ee07a, 0xff7ad9, 0xffc861, 0x35d8d0, 0xa67bff][Math.floor(rr(1) * 6)];
  let h = 3, w = 3, spin = null;
  if (kind === "house") {
    // a cosy round-cornered house: a coloured curved roof, a round window glowing at night, a door
    P.push([box(3.0, 2.2, 2.6, 0.35), shell(), { y: 1.1 }], [box(3.3, 0.9, 2.9, 0.42), tint(roofC), { y: 2.55, sy: 1 }], [sph(0.9, 24, 12, true), tint(roofC), { y: 2.9, sx: 1.6, sz: 1.4, sy: 0.6 }]);
    P.push([box(0.8, 1.3, 0.1, 0.1), tint(0x7a5236), { y: 0.65, z: 1.31 }], [cyl(0.36, 0.36, 0.08, 24), glass(), { x: 0.95, y: 1.45, z: 1.31, rx: Math.PI / 2 }], [tor(0.38, 0.04, 30), light(0x35d8d0), { x: 0.95, y: 1.45, z: 1.35 }]);
    P.push([cyl(0.2, 0.24, 0.9, 12), shell(), { x: -0.9, y: 3.2, z: -0.4 }]);
    h = 3.6; w = 3.4;
  } else if (kind === "tower") {
    // a slim white tower: blue rings of light, a glass top and a spire
    P.push([cyl(1.1, 1.4, 0.5, 32), stone(), { y: 0.25 }], [cyl(0.75, 0.95, 6.5, 32), shell(), { y: 3.5 }]);
    for (const y of [2.2, 3.6, 5.0]) P.push([tor(0.84, 0.05, 48), light(roofC), { y, rx: Math.PI / 2 }]);
    P.push([sph(0.95, 28, 14, true), glass(), { y: 6.75 }], [new THREE.ConeGeometry(0.22, 1.3, 16), shell(), { y: 8.2 }], [sph(0.14, 12, 8), light(roofC), { y: 8.9 }]);
    h = 9; w = 2.4;
  } else if (kind === "turbine") {
    // a white wind turbine whose three blades turn
    P.push([cyl(0.18, 0.4, 7.5, 20), shell(), { y: 3.75 }], [cyl(0.7, 0.8, 0.3, 24), stone(), { y: 0.15 }], [box(0.6, 0.5, 1.1, 0.2), shell(), { y: 7.6, z: 0.1 }], [tor(0.4, 0.04, 30), light(0x35d8d0), { y: 3.5, rx: Math.PI / 2 }]);
    h = 8.2; w = 1.6;
  } else if (kind === "tank") {
    // a spherical tank on four legs with a band of light
    P.push([sph(1.5, 32, 20), shell(), { y: 2.6 }], [tor(1.52, 0.06, 64), light(roofC), { y: 2.6, rx: Math.PI / 2 }]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; P.push([cyl(0.1, 0.12, 2.0, 10), trim(), { x: Math.cos(a) * 1.05, y: 1.0, z: Math.sin(a) * 1.05 }]); }
    h = 4.2; w = 3.2;
  } else if (kind === "pods") {
    // storage pods: rounded capsules stacked two high
    for (const [x, y, c] of [[-0.85, 0.7, 0], [0.85, 0.7, 1], [0, 2.05, 2]]) { P.push([box(1.6, 1.3, 2.6, 0.5), c === 2 ? tint(roofC) : shell(), { x, y }], [box(1.1, 0.05, 0.05, 0.02), light(0x35d8d0), { x, y: y + 0.3, z: 1.31 }]); }
    h = 2.8; w = 3.4;
  } else if (kind === "solar") {
    // a canopy of blue panels on white posts
    for (const x of [-1.3, 1.3]) for (const z of [-0.8, 0.8]) P.push([cyl(0.07, 0.09, 1.8, 10), shell(), { x, y: 0.9, z }]);
    P.push([box(3.4, 0.08, 2.4, 0.03), glass(), { y: 1.85, rx: -0.3 }], [box(3.5, 0.05, 0.05, 0.02), light(0x35d8d0), { y: 1.5, z: 1.17, rx: -0.3 }]);
    h = 2.3; w = 3.6;
  } else if (kind === "stack") {
    // a white stack with a ring of light (the town's chimney; it still smokes)
    P.push([cyl(1.0, 1.2, 0.6, 28), stone(), { y: 0.3 }], [cyl(0.5, 0.75, 4.6, 28), shell(), { y: 2.9 }], [tor(0.56, 0.06, 40), light(0xff8a4a), { y: 4.6, rx: Math.PI / 2 }]);
    h = 5.2; w = 2.2;
  }
  const g = bake(P); g.userData.h = h; g.userData.w = w; g.userData.spin = [];
  if (kind === "turbine") {
    const hub = new THREE.Group(); hub.position.set(0, 7.6, 0.7);
    const blades = bake([[sph(0.22, 16, 12), shell(), {}], ...[0, 1, 2].map((i) => [box(0.32, 3.2, 0.06, 0.12), shell(), { rz: (i / 3) * TAU, x: Math.sin((i / 3) * TAU) * -1.6, y: Math.cos((i / 3) * TAU) * 1.6 }])]);
    hub.add(blades); g.add(hub); g.userData.spin.push((dt) => (hub.rotation.z += dt * (1.1 + seed % 3 * 0.2)));
  }
  return g;
}

// ---------------- trees and shrubs: round, lush, instanced ----------------
// one crown shape (four soft spheres), coloured per tree (instanceColor), shaded lighter on top in the geometry
function crownGeo() {
  // a fluffy crown: seven lumpy blobs, and normals bent out from the crown's middle so the light wraps round it softly
  // like one cloud of leaves (not seven balls); darker low and inside, brighter at the top
  let sd = 7; const rn = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const B = [[0, 1.65, 0, 0.95], [0.66, 1.45, 0.25, 0.72], [-0.62, 1.4, -0.18, 0.74], [0.12, 2.25, -0.08, 0.7], [-0.25, 1.55, 0.62, 0.66], [0.3, 1.5, -0.62, 0.64], [-0.45, 2.05, 0.3, 0.58]];
  const parts = B.map(([x, y, z, r]) => { const g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(p.getX(i) * 7.1 + p.getY(i) * 5.3) * 0.5 + 0.5) * 0.12 + rn() * 0.02; p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z); }
    g.computeVertexNormals(); return g; });
  const g = mergeGeometries(parts, false), pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3), C = new THREE.Vector3(0, 1.7, 0), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i); const out = v.clone().sub(C).normalize();
    n.lerp(out, 0.72).normalize(); nor.setXYZ(i, n.x, n.y, n.z);
    const k = THREE.MathUtils.clamp((v.y - 0.7) / 1.9, 0, 1), inner = THREE.MathUtils.clamp(v.distanceTo(C) / 1.25, 0, 1);
    const c = (0.56 + k * 0.5) * (0.78 + inner * 0.22); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function pineGeo() {
  const parts = [[0, 1.2, 1.15, 1.4], [0, 2.0, 0.9, 1.2], [0, 2.7, 0.6, 1.0]].map(([x, y, r, h]) => { const g = new THREE.ConeGeometry(r, h, 10, 1); g.translate(x, y, 0); return g.toNonIndexed(); });
  const g = mergeGeometries(parts, false), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const v = 0.6 + THREE.MathUtils.clamp((pos.getY(i) - 0.6) / 2.6, 0, 1) * 0.5; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); return g;
}
export const TREE_COLORS = { green: [0x4fbf5a, 0x3fae63, 0x5ccf6a, 0x36a35a], blossom: [0xff9fcf, 0xffb8dc], maple: [0xff8a3a, 0xffb347], crystal: [0x8fe6ff] };
/// matrices: [Matrix4] → a Group of three instanced meshes (trunks, round crowns, pines); kinds picked by a seed
export function makeTrees(matrices, { blossom = 0.12, maple = 0.08, pine = 0.18, seed = 3 } = {}) {
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const round = [], pines = [], cols = [];
  matrices.forEach((m) => { const x = r(); if (x < pine) pines.push(m); else { round.push(m); const pal = x < pine + blossom ? TREE_COLORS.blossom : x < pine + blossom + maple ? TREE_COLORS.maple : TREE_COLORS.green; cols.push(pal[Math.floor(r() * pal.length)]); } });
  const g = new THREE.Group();
  const trunk = cyl(0.12, 0.2, 1.2, 8); trunk.translate(0, 0.6, 0);
  const all = [...round, ...pines];
  if (all.length) { const t = new THREE.InstancedMesh(trunk, wood(), all.length); all.forEach((m, i) => t.setMatrixAt(i, m)); t.castShadow = true; g.add(t); }
  if (round.length) {
    const cm = new THREE.InstancedMesh(crownGeo(), windLook(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }), { amp: 0.07, h: 2.6 }), round.length), c = new THREE.Color();
    round.forEach((m, i) => { cm.setMatrixAt(i, m); cm.setColorAt(i, c.set(cols[i])); }); cm.castShadow = true; cm.receiveShadow = true; g.add(cm);
  }
  if (pines.length) { const pm = new THREE.InstancedMesh(pineGeo(), windLook(new THREE.MeshStandardMaterial({ color: 0x2f8f58, vertexColors: true, roughness: 0.8 }), { amp: 0.05, h: 3 }), pines.length); pines.forEach((m, i) => pm.setMatrixAt(i, m)); pm.castShadow = true; g.add(pm); }
  return g;
}

// ---------------- street lamps: a white post, a dark crown, a warm lantern ----------------
/// matrices → { group, night(k) }
export function makeArcLamps(matrices) {
  const post = mergeGeometries([cyl(0.08, 0.12, 2.8, 10).translate(0, 1.4, 0), cyl(0.22, 0.26, 0.24, 14).translate(0, 0.12, 0), cyl(0.12, 0.12, 0.16, 12).translate(0, 2.84, 0)].map((g) => g.toNonIndexed()), false);
  const cap = mergeGeometries([new THREE.ConeGeometry(0.3, 0.28, 6).translate(0, 3.55, 0), sph(0.06, 8, 6).translate(0, 3.74, 0)].map((g) => g.toNonIndexed()), false);
  const lantern = cyl(0.17, 0.2, 0.46, 6); lantern.translate(0, 3.17, 0);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc977, emissiveIntensity: 0.35, roughness: 0.3 });
  const mk = (geo, m) => { const im = new THREE.InstancedMesh(geo, m, matrices.length); matrices.forEach((x, i) => im.setMatrixAt(i, x)); im.castShadow = true; return im; };
  const group = new THREE.Group(); group.add(mk(post, shell()), mk(cap, trim()), mk(lantern, lampMat));
  return { group, lampMat };
}

// ---------------- the district arches: white pillars with light inside, a gem at the top ----------------
export function makeArcArch(color) {
  const c = light(color), P = [];
  for (const s of [-1, 1]) {
    P.push([box(0.9, 0.5, 0.9, 0.12), stone(), { x: s * 2.4, y: 0.25 }], [box(0.62, 4.3, 0.62, 0.18), shell(), { x: s * 2.4, y: 2.6 }], [box(0.08, 3.4, 0.08, 0.03), c, { x: s * (2.4 - 0.32), y: 2.6 }]);
    P.push([new THREE.ConeGeometry(0.34, 0.6, 4), shell(), { x: s * 2.4, y: 5.5, ry: Math.PI / 4 }]);
    // b444: a strip of blue glass down each pillar (front and back) and a lit edge on the plinth (the concept's glass and light lines)
    P.push([box(0.4, 2.9, 0.66, 0.04), archGlass(), { x: s * 2.4, y: 2.75 }], [box(0.96, 0.05, 0.96, 0.02), c, { x: s * 2.4, y: 0.53 }]);
  }
  P.push([tor(2.4, 0.3, 64, Math.PI), shell(), { y: 4.4, sz: 1.2 }], [tor(2.4, 0.05, 64, Math.PI), c, { y: 4.4, z: 0.36 }], [tor(2.4, 0.05, 64, Math.PI), c, { y: 4.4, z: -0.36 }]);
  P.push([new THREE.OctahedronGeometry(0.42, 0), c, { y: 6.9, sy: 1.4 }], [cyl(0.3, 0.45, 0.4, 6), shell(), { y: 6.6 }]);
  const g = bake(P); g.name = "arc-arch"; return g;
}

// ---------------- the plaza floor: pale stone in rings, with blue and mint inlays ----------------
export function plazaTexture() {
  const S = 1024, cv = document.createElement("canvas"); cv.width = cv.height = S; const g = cv.getContext("2d"), c = S / 2;
  g.fillStyle = "#d9e1e8"; g.fillRect(0, 0, S, S);
  // the stones: rings of slabs with thin grout lines, each a slightly different shade
  let seed = 9; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rings = [0, 70, 150, 230, 300, 370, 440, 512];
  for (let i = 0; i < rings.length - 1; i++) {
    const n = Math.max(6, Math.round((rings[i + 1] * TAU) / 120));
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU + i * 0.3, a1 = ((k + 1) / n) * TAU + i * 0.3, v = 214 + Math.floor(r() * 22);
      g.fillStyle = `rgb(${v - 6},${v},${v + 8})`; g.beginPath(); g.arc(c, c, rings[i + 1] - 3, a0 + 0.006, a1 - 0.006); g.arc(c, c, rings[i] + 3, a1 - 0.006, a0 + 0.006, true); g.closePath(); g.fill();
    }
  }
  // inlays: a blue ring, a mint ring, and the gold compass points
  g.lineWidth = 10; g.strokeStyle = "#2f86ff"; g.beginPath(); g.arc(c, c, 300, 0, TAU); g.stroke();
  g.lineWidth = 6; g.strokeStyle = "#2ee07a"; g.beginPath(); g.arc(c, c, 440, 0, TAU); g.stroke();
  g.fillStyle = "#ffc861"; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, x = c + Math.cos(a) * 370, y = c + Math.sin(a) * 370; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(16, 0); g.lineTo(0, 9); g.lineTo(-16, 0); g.lineTo(0, -9); g.closePath(); g.fill(); g.restore(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------- the fountain: three white tiers, glowing water, jets (instanced) ----------------
export function makeArcFountain() {
  const g = new THREE.Group(); g.name = "fountain";
  const water = new THREE.MeshStandardMaterial({ color: 0x38c8ff, emissive: 0x1a8ad8, emissiveIntensity: 0.55, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.88 });
  // light dancing on the water: a caustic net drifting slowly (a shader step on the fountain's one water material)
  const WT = { value: 0 };
  water.onBeforeCompile = (sh) => {
    sh.uniforms.uWT = WT;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vWp;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWp = position.xy;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vWp; uniform float uWT;").replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { vec2 q = vWp * 2.2; float t = uWT * 0.7, c = 0.0;
        for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 0.9 + t), cos(q.x * 0.8 - t * 1.1)) * 0.55; c += abs(sin(q.x) + cos(q.y)); }
        c = pow(clamp(1.0 - c / 4.2, 0.0, 1.0), 3.0); totalEmissiveRadiance += vec3(0.55, 0.9, 1.0) * c * 0.9; }`);
  };
  water.customProgramCacheKey = () => "water-caustic";
  waterLook(water); // ripples and a bright edge (world-look.js)
  const P = [
    [tor(4.25, 0.32, 96), stone(), { y: 0.26, rx: Math.PI / 2, sz: 1.6 }], [cyl(4.25, 4.35, 0.18, 96), stone(), { y: 0.06 }],
    [tor(4.25, 0.05, 96), light(0x35d8d0), { y: 0.5, rx: Math.PI / 2 }],
    [cyl(0.7, 1.0, 1.6, 32), shell(), { y: 0.95 }], [cyl(2.0, 1.4, 0.4, 48), shell(), { y: 1.9 }], [tor(2.0, 0.12, 64), shell(), { y: 2.1, rx: Math.PI / 2 }], [tor(2.0, 0.04, 64), light(0x2f86ff), { y: 1.98, rx: Math.PI / 2 }],
    [cyl(0.35, 0.55, 1.1, 24), shell(), { y: 2.65 }], [cyl(1.0, 0.7, 0.3, 40), shell(), { y: 3.3 }], [tor(1.0, 0.08, 48), shell(), { y: 3.45, rx: Math.PI / 2 }],
  ];
  g.add(bake(P));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.15, 72), water); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.32; g.add(pool);
  const bowl = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48), water); bowl.rotation.x = -Math.PI / 2; bowl.position.y = 2.08; g.add(bowl);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.95, 36), water); top.rotation.x = -Math.PI / 2; top.position.y = 3.43; g.add(top);
  // the ARCIRCLE rings over it: the plaza's landmark, high and large enough to find the centre of town from anywhere
  const rings = new THREE.Group(); rings.position.y = 16; rings.scale.setScalar(2.1);
  const ra = new THREE.Mesh(tor(2.1, 0.2, 96), new THREE.MeshStandardMaterial({ color: 0x2f86ff, emissive: 0x1d63d6, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.3 }));
  const rb = new THREE.Mesh(tor(2.1, 0.2, 96), new THREE.MeshStandardMaterial({ color: 0x2ee07a, emissive: 0x17a85a, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.3 }));
  ra.position.x = -1.05; rb.position.x = 1.05; rb.rotation.x = Math.PI / 2; rings.add(ra, rb); g.add(rings);
  // water (b440): a falling sheet over each bowl's lip and a jet on top, streaks scrolling down a lathe (2 + 1 meshes, no
  // per-frame CPU), and a few splash drops where the sheets land; the old 120 white dots read as snow, not water
  const stc = document.createElement("canvas"); stc.width = 64; stc.height = 64; const sx = stc.getContext("2d");
  for (let x = 0; x < 64; x++) { const v = 0.25 + 0.75 * Math.abs(Math.sin(x * 1.7) * Math.cos(x * 0.43)); const gr = sx.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, `rgba(255,255,255,${v * 0.35})`); gr.addColorStop(0.5, `rgba(255,255,255,${v})`); gr.addColorStop(1, `rgba(255,255,255,${v * 0.35})`); sx.fillStyle = gr; sx.fillRect(x, 0, 1, 64); }
  const stx = new THREE.CanvasTexture(stc); stx.wrapS = stx.wrapT = THREE.RepeatWrapping; stx.repeat.set(10, 1.5); stx.colorSpace = THREE.SRGBColorSpace;
  const sheetM = new THREE.MeshBasicMaterial({ color: 0xbfefff, map: stx, alphaMap: stx, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
  const lathe = (r0, y0, r1, y1, out) => { const pts = []; for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(k, out), y0 + (y1 - y0) * k * k)); } return new THREE.LatheGeometry(pts, 48); };
  const sheetA = new THREE.Mesh(lathe(1.02, 3.42, 1.55, 2.1, 0.5), sheetM), sheetB = new THREE.Mesh(lathe(2.05, 2.05, 3.1, 0.34, 0.5), sheetM);
  sheetA.renderOrder = sheetB.renderOrder = 2; g.add(sheetA, sheetB);
  const jetX = stx.clone(); jetX.repeat.set(3, 1); jetX.needsUpdate = true;
  const jetM = new THREE.MeshBasicMaterial({ color: 0xe6fbff, map: jetX, alphaMap: jetX, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 1.1, 12, 1, true), jetM); jet.position.y = 3.98; jet.renderOrder = 2; g.add(jet);
  const N = 36, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.8, depthWrite: false }), N);
  drops.frustumCulled = false; g.add(drops);
  const o = new THREE.Object3D();
  g.userData = { radius: 0, pulse: (k) => { ra.material.emissiveIntensity = 1.5 * (1 + k); rb.material.emissiveIntensity = 1.5 * (1 + k); }, spin: [(dt, t) => {
    rings.rotation.y = t * 0.35; ra.rotation.y = Math.sin(t * 0.7) * 0.25; rings.position.y = 16 + Math.sin(t * 1.2) * 0.35;
    water.emissiveIntensity = 0.5 + NIGHT.value * 0.75 + Math.sin(t * 2) * 0.08; WT.value = t; /* b444: at night the pool is the plaza's lantern */
    sheetM.opacity = 0.75 + NIGHT.value * 0.2; jetM.opacity = 0.8 + NIGHT.value * 0.2;
    stx.offset.y = (t * 1.1) % 1; jetX.offset.y = (-t * 1.6) % 1;
    for (let i = 0; i < N; i++) { // small hops of spray where each sheet meets the water below
      const lower = i % 2, a = ((i >> 1) / (N / 2)) * TAU + Math.sin(i * 7.1) * 0.2, k = ((t * 1.3 + (i * 0.618) % 1) % 1), r = (lower ? 3.15 : 1.6) + k * 0.35, y0 = lower ? 0.36 : 2.12;
      o.position.set(Math.cos(a) * r, y0 + Math.sin(k * Math.PI) * 0.28, Math.sin(a) * r); o.scale.setScalar(1 - k * 0.6); o.updateMatrix(); drops.setMatrixAt(i, o.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
  }] };
  return g;
}

/// night: hall windows light up warm (k 0 = day, 1 = night); the glass is one shared material, so this is one change
/// At night each pane goes its own way: most glow warm, some stay dark, a few change now and then (a shader step on the
/// shared glass, keyed on the pane's place in the world, so it costs nothing per building)
const NIGHT = { value: 0 }, CLOCK = { value: 0 }, ORG = { value: new THREE.Vector3() }; // ORG: the world group's offset (the world slides under you)
let paned = false;
function paneGlass() {
  if (paned) return; paned = true; const g = glass();
  g.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT; sh.uniforms.uClock = CLOCK; sh.uniforms.uOrg = ORG;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPane; varying float vPaneUp; uniform vec3 uOrg;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvPane = (modelMatrix * vec4(transformed, 1.0)).xyz - uOrg; vPaneUp = abs(normalize(mat3(modelMatrix) * objectNormal).y);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vPane; varying float vPaneUp; uniform float uNight, uClock; uniform vec3 uOrg;").replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { vec3 cell = floor(vPane * vec3(1.15, 1.6, 1.15)); float hh = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float era = floor(uClock / 37.0 + hh * 9.0); float on = step(0.28, fract(sin(dot(cell + era, vec3(4.1, 7.7, 2.3))) * 9631.7));
        float k = mix(0.08, 0.75 + hh * 0.6, on); totalEmissiveRadiance *= mix(1.0, k, uNight * (1.0 - smoothstep(0.3, 0.55, vPaneUp)));
        // a room behind each window: the view ray goes on through the glass into a grid of small rooms and shows the wall,
        // floor or ceiling it meets (interior mapping); walls change colour room by room, and at night the lit rooms glow warm
        if (vPaneUp < 0.4) {
          vec3 cs = vec3(1.74, 1.25, 1.74), rd = normalize(vPane - (cameraPosition - uOrg)), p = vPane + rd * 0.02, c0 = floor(p / cs);
          vec3 tt = ((c0 + step(0.0, rd)) * cs - p) / (rd + sign(rd) * 1e-5 + vec3(1e-6)); float tm = min(tt.x, min(tt.y, tt.z));
          float rh = fract(sin(dot(c0, vec3(7.13, 3.31, 5.77))) * 4375.85);
          vec3 wall = mix(vec3(0.62, 0.68, 0.78), vec3(0.92, 0.8, 0.64), rh) * (tm == tt.x ? 0.82 : 1.0);
          vec3 room = tm == tt.y ? (rd.y > 0.0 ? vec3(0.93, 0.94, 0.97) : vec3(0.42, 0.33, 0.27)) : wall;
          room *= 1.0 - clamp(tm / 3.0, 0.0, 1.0) * 0.55;
          float see = 0.8 * (1.0 - smoothstep(0.25, 0.4, vPaneUp));
          diffuseColor.rgb = mix(diffuseColor.rgb, room * 0.75, see);
          totalEmissiveRadiance = mix(totalEmissiveRadiance, totalEmissiveRadiance * 0.3 + room * vec3(0.35, 0.5, 0.75) * 0.25 * (1.0 - uNight) + room * vec3(1.0, 0.82, 0.58) * on * uNight * 0.9, see);
        } }`);
  };
  g.customProgramCacheKey = () => "panes2"; g.needsUpdate = true;
}
/// the beat (world-music.js level): every baked light line in town brightens a little with it (one shared material)
export function setPulse(k) { GLOW().color.setScalar(1 + k); }
export function setNight(k) {
  const g = glass(); paneGlass();
  g.emissive.setHex(0x1f6fd6).lerp(new THREE.Color(0xffc27a), k * 0.85);
  g.emissiveIntensity = 0.75 + k * 1.15; NIGHT.value = k;
}
export const tickNight = (dt, org) => { CLOCK.value += dt; if (org) ORG.value.copy(org); };

/// the hall's name on a lit board over its door (the floating tag stays for far away)
let SIGN_RES = 1; export const setSignRes = (k) => { SIGN_RES = k; }; // half-size sign canvases on phones (world-kit makeStage)
export function hallSign(name, color) {
  const cv = document.createElement("canvas"); cv.width = Math.round(1024 * SIGN_RES); cv.height = Math.round(192 * SIGN_RES); const g = cv.getContext("2d"); if (SIGN_RES !== 1) g.scale(SIGN_RES, SIGN_RES);
  const hex = "#" + new THREE.Color(color).getHexString();
  g.fillStyle = "#1a2232"; g.fillRect(0, 0, 1024, 192);
  g.fillStyle = hex; g.fillRect(0, 168, 1024, 24);
  let fs = 104; g.font = `800 ${fs}px Sora, system-ui, sans-serif`; while (g.measureText(name).width > 940 && fs > 40) { fs -= 6; g.font = `800 ${fs}px Sora, system-ui, sans-serif`; }
  g.fillStyle = "#f4f8fc"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 512, 88);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.5), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5 }));
  const back = new THREE.Mesh(box(2.86, 0.62, 0.1, 0.05), trim());
  face.position.z = 0.056; const s = new THREE.Group(); s.add(back, face); s.name = "hall-sign"; return s;
}

/// fewer draw calls for a group of static props: every mesh under `group` (except sprites, those marked
/// userData.keep and anything inside a subtree marked userData.keep) is merged with the others that look the same
/// (same material type and settings) into one mesh. The props must not move afterwards.
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const keyOf = (m) => [m.type, m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.flatShading, m.transparent, m.opacity, m.side, m.map ? m.map.uuid : ""].join("|");
  const groups = new Map(), drop = [];
  const walk = (o) => {
    for (const c of [...o.children]) {
      if (c.userData && c.userData.keep) continue;
      if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !Array.isArray(c.material) && c.geometry && !c.morphTargetInfluences) {
        const k = keyOf(c.material); let e = groups.get(k); if (!e) { e = { mat: c.material, geos: [], shadow: false, recv: false }; groups.set(k, e); }
        m4.multiplyMatrices(inv, c.matrixWorld);
        let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(m4);
        for (const a of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(a)) g.deleteAttribute(a);
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        e.geos.push(g); e.shadow = e.shadow || c.castShadow; e.recv = e.recv || c.receiveShadow; drop.push(c);
      }
      if (!c.isSprite) walk(c);
    }
  };
  walk(group);
  let made = 0;
  for (const e of groups.values()) {
    if (e.geos.length < 2) { e.geos.forEach((g) => g.dispose()); continue; }
    const geo = mergeGeometries(e.geos, false); e.geos.forEach((g) => g.dispose()); if (!geo) continue;
    const mesh = new THREE.Mesh(geo, e.mat); mesh.castShadow = e.shadow; mesh.receiveShadow = e.recv; mesh.name = "merged"; group.add(mesh); made++;
    e.done = true;
  }
  // remove what was merged (only meshes whose group actually merged)
  const doneKeys = new Set([...groups.entries()].filter(([, e]) => e.done).map(([k]) => k));
  for (const c of drop) if (doneKeys.has(keyOf(c.material))) c.parent.remove(c); // geometries may be shared (model clones): left to the GC
  return made;
}
