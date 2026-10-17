// world-jurtrees.js — Jurassic World's drawn trees (no models needed): araucaria conifers with drooping tiers of needle
// sprays, broadleaf giants with branching limbs and leaf clusters, tree ferns with arching fronds, stout cycads. Each kind is
// one merged geometry in two groups (bark, foliage) so a whole stand is one InstancedMesh. The foliage is alpha-tested
// cards cut from one drawn atlas, lit as a rounded crown, swaying in the wind on the GPU; the bark is a drawn texture.
import { mergeGeometries } from "./vendor/three/addons/BufferGeometryUtils.js";

export function makeJurTrees(THREE, { low = false } = {}) {
  let sd = 4711; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  // ---- the bark: deep vertical furrows, lighter ridges, a few knots
  const bc = canvas(128, 256), bg = bc.getContext("2d");
  bg.fillStyle = "#5b4632"; bg.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) { const x = r() * 128, w = 1 + r() * 3; bg.fillStyle = r() < 0.5 ? "rgba(40,28,18,0.75)" : "rgba(130,108,84,0.45)"; bg.beginPath(); bg.moveTo(x, 0); for (let y = 0; y <= 256; y += 16) bg.lineTo(x + Math.sin(y * 0.05 + i) * 3, y); bg.lineTo(x + w, 256); bg.lineTo(x + w, 0); bg.fill(); }
  for (let i = 0; i < 6; i++) { const x = r() * 128, y = r() * 256, g2 = bg.createRadialGradient(x, y, 0, x, y, 7); g2.addColorStop(0, "rgba(30,20,12,0.9)"); g2.addColorStop(1, "rgba(30,20,12,0)"); bg.fillStyle = g2; bg.fillRect(x - 8, y - 8, 16, 16); }
  const bark = new THREE.CanvasTexture(bc); bark.colorSpace = THREE.SRGBColorSpace; bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.anisotropy = 4;
  // ---- the foliage atlas (2×2, each 256²): needle spray, broad leaf cluster, fern frond, cycad frond
  const A = canvas(512, 512), g = A.getContext("2d");
  const leafCol = (k) => ["#2f5a24", "#3d6e2c", "#4f8434", "#5f9a3c", "#7aae4a"][Math.min(4, Math.floor(k * 5))];
  // needle spray (top left): a twig with fans of needles, denser and darker toward the base
  g.save(); g.translate(0, 0); g.lineCap = "round";
  for (let s = 0; s < 3; s++) { const y0 = 128 + (s - 1) * 52, len = 230;
    g.strokeStyle = "#4a3a26"; g.lineWidth = 3; g.beginPath(); g.moveTo(8, y0); g.quadraticCurveTo(128, y0 + 10, 8 + len, y0 + 24); g.stroke();
    for (let t = 0; t < 1; t += 0.018) { const x = 8 + len * t, y = y0 + 10 * t + 14 * t * t; for (const side of [-1, 1]) { g.strokeStyle = leafCol(0.2 + r() * 0.6); g.lineWidth = 1.6; const L = 26 * (1 - t * 0.5); g.beginPath(); g.moveTo(x, y); g.lineTo(x + L * 0.45, y + side * L); g.stroke(); } } }
  g.restore();
  // broad leaves (top right): many overlapping ovate leaves with a midrib and a bright edge
  g.save(); g.translate(256, 0);
  for (let i = 0; i < 70; i++) { const x = 30 + r() * 196, y = 30 + r() * 196, a = r() * 6.28, L = 20 + r() * 22, k = r();
    g.save(); g.translate(x, y); g.rotate(a); const gr = g.createLinearGradient(-L, 0, L, 0); gr.addColorStop(0, leafCol(k * 0.6)); gr.addColorStop(1, leafCol(0.4 + k * 0.6)); g.fillStyle = gr;
    g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -L * 0.45, L, 0); g.quadraticCurveTo(0, L * 0.45, -L, 0); g.fill(); g.strokeStyle = "rgba(220,240,170,0.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke(); g.restore(); }
  g.restore();
  // fern frond (bottom left): a curved rachis with paired leaflets, tapering to the tip
  g.save(); g.translate(0, 256);
  for (let f = 0; f < 2; f++) { const yb = 70 + f * 110; g.strokeStyle = "#5a6a2a"; g.lineWidth = 3; g.beginPath(); g.moveTo(6, yb); g.quadraticCurveTo(128, yb - 20, 250, yb + 8); g.stroke();
    for (let t = 0.03; t < 0.98; t += 0.028) { const x = 6 + 244 * t, y = yb - 20 * Math.sin(t * Math.PI) * 1.0 + 8 * t, L = 34 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 4;
      for (const side of [-1, 1]) { g.fillStyle = leafCol(0.35 + r() * 0.5); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4, y + side * L * 0.6, x + 9, y + side * L); g.quadraticCurveTo(x + 2, y + side * L * 0.5, x, y); g.fill(); } } }
  g.restore();
  // cycad frond (bottom right): stiff and dark, narrow leaflets in a herringbone
  g.save(); g.translate(256, 256);
  for (let f = 0; f < 2; f++) { const yb = 70 + f * 110; g.strokeStyle = "#4a4a22"; g.lineWidth = 4; g.beginPath(); g.moveTo(6, yb); g.lineTo(250, yb - 6); g.stroke();
    for (let t = 0.04; t < 0.97; t += 0.024) { const x = 6 + 244 * t, y = yb - 6 * t, L = 40 * (1 - t * 0.6);
      for (const side of [-1, 1]) { g.strokeStyle = leafCol(0.1 + r() * 0.35); g.lineWidth = 3.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + L * 0.55, y + side * L); g.stroke(); } } }
  g.restore();
  const atlas = new THREE.CanvasTexture(A); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  const RECT = { needle: [0, 0.5, 0.5, 1], broad: [0.5, 0.5, 1, 1], fern: [0, 0, 0.5, 0.5], cycad: [0.5, 0, 1, 0.5] }; // u0 v0 u1 v1 (v up)

  // ---- geometry pieces
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const place = (geo, x, y, z, rx, ry, rz) => { E.set(rx, ry, rz, "YXZ"); Q.setFromEuler(E); V.set(x, y, z); geo.applyMatrix4(M.compose(V, Q, S)); return geo; };
  function trunk(h, r0, r1, bend = 0, seg = 7) {
    const geo = new THREE.CylinderGeometry(r1, r0, h, seg, 6, true); geo.translate(0, h / 2, 0);
    const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin((y / h) * Math.PI * 0.8) * bend); uv.setXY(i, uv.getX(i) * 2, (y / h) * h / 3); }
    geo.computeVertexNormals(); return geo;
  }
  // a leaf card along +x from the origin, length L, width W, bent down by `droop` toward its tip, cut from the atlas rect
  function card(L, W, rect, droop = 0, seg = 4) {
    const geo = new THREE.PlaneGeometry(L, W, seg, 1); geo.translate(L / 2, 0, 0); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv, [u0, v0, u1, v1] = rect;
    for (let i = 0; i < p.count; i++) { const t = p.getX(i) / L; p.setY(i, p.getY(i) - droop * t * t * L); uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i)); }
    return geo;
  }
  const crossed = (L, W, rect, droop) => { const a = card(L, W, rect, droop), b = card(L, W * 0.8, rect, droop); b.rotateX(Math.PI / 2); return mergeGeometries([a, b]); };
  // the foliage's normals: out from the crown's middle (a rounded crown lights evenly, not card by card)
  function crownNormals(geo, cy, up = 1.2) { const p = geo.attributes.position, n = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { V.set(p.getX(i), (p.getY(i) - cy) * 0.7 + up, p.getZ(i)).normalize(); n.set([V.x, V.y, V.z], i * 3); } geo.setAttribute("normal", new THREE.BufferAttribute(n, 3)); return geo; }
  const strip = (geo) => { for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k); return geo.index ? geo.toNonIndexed() : geo; };
  function kind(barkParts, leafParts, cy) {
    const b = mergeGeometries(barkParts.map(strip)), l = crownNormals(mergeGeometries(leafParts.map(strip)), cy);
    const geo = mergeGeometries([b, l], true); geo.computeBoundingSphere(); return geo;
  }

  // araucaria: a straight trunk, tiers of drooping branches (crossed needle sprays) all the way up, a tuft on top
  function araucaria() {
    const H = 15 + r() * 4, bark0 = [trunk(H, 0.5, 0.14, 0.15)], leaves = [];
    for (let y = H * 0.38; y < H - 0.6; y += 1.25) { const k = 1 - (y - H * 0.38) / (H * 0.62), n = 5 + Math.floor(r() * 2), L = 1.4 + k * 3.2, off = r() * 6.28;
      for (let i = 0; i < n; i++) { const a = off + (i / n) * 6.283; leaves.push(place(crossed(L, 1.1 + k * 0.6, RECT.needle, 0.22), 0, y, 0, 0.12, a, 0)); } }
    leaves.push(place(crossed(1.6, 1.2, RECT.needle, -0.2), 0, H - 0.4, 0, 0, 0, Math.PI / 2.4), place(crossed(1.4, 1, RECT.needle, -0.2), 0, H - 0.4, 0, 0, 2, Math.PI / 2.4));
    return kind(bark0, leaves, H * 0.7);
  }
  // broadleaf giant: a stout trunk forking into limbs, each ending in a ball of leaf cards, a wide crown on top
  function broadleaf() {
    const H = 8 + r() * 3, bark0 = [trunk(H, 0.75, 0.35, 0.3)], leaves = [], balls = [[0, H + 1.6, 0, 3.4]];
    const limbs = 3 + Math.floor(r() * 2);
    for (let i = 0; i < limbs; i++) { const a = (i / limbs) * 6.283 + r(), y = H * (0.55 + r() * 0.3), L = 3.2 + r() * 1.6, tilt = 0.7 + r() * 0.3;
      const limb = trunk(L, 0.3, 0.1, 0.1, 5); place(limb, 0, y, 0, 0, a, -tilt); bark0.push(limb);
      const tip = new THREE.Vector3(0, L, 0).applyMatrix4(M); balls.push([tip.x, tip.y + 0.4, tip.z, 2.2 + r() * 0.8]); } // (M still holds the limb's placement)
    for (const [x, y, z, R] of balls) { const n = low ? 9 : 14; for (let i = 0; i < n; i++) { const c = card(R * 1.25, R * 1.05, RECT.broad, 0.08, 1); c.translate(-R * 0.6, 0, 0); place(c, x, y + (r() - 0.5) * R * 0.6, z, (r() - 0.5) * 1.6, r() * 6.28, (r() - 0.5) * 1.4); leaves.push(c); } }
    return kind(bark0, leaves, H + 0.5);
  }
  // tree fern: a slim curving trunk, a crown of arching fronds
  function treeFern() {
    const H = 3.5 + r() * 2.5, bark0 = [trunk(H, 0.24, 0.16, 0.35, 6)], leaves = [], n = 9 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + r() * 0.3; leaves.push(place(card(3.2 + r() * 0.8, 1.2, RECT.fern, 0.38), Math.sin(H * 0.3) * 0.35, H, 0, 0, a, 0.45)); }
    return kind(bark0, leaves, H);
  }
  // cycad: a short stout trunk, a stiff rosette of fronds reaching up and out
  function cycad() {
    const H = 0.9 + r() * 0.8, bark0 = [trunk(H, 0.42, 0.34, 0.05, 8)], leaves = [], n = 12 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + r() * 0.2; leaves.push(place(card(1.9 + r() * 0.5, 0.9, RECT.cycad, 0.12), 0, H, 0, 0, a, 0.55 + r() * 0.35)); }
    return kind(bark0, leaves, H + 0.6);
  }

  // ---- the materials: bark, and the foliage (wind on the GPU)
  const U = { uT: { value: 0 } };
  const barkM = new THREE.MeshStandardMaterial({ map: bark, roughness: 1, metalness: 0 });
  const leafM = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  leafM.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U); sh.vertexShader = "uniform float uT;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
    { vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]); float k = max(0.0, position.y - 1.0) * 0.012 + length(position.xz) * 0.02;
      transformed.x += sin(uT * 1.3 + ip.x * 0.21 + position.y * 0.4) * k; transformed.z += cos(uT * 1.1 + ip.y * 0.19 + position.x * 0.5) * k * 0.7; }`); };
  leafM.customProgramCacheKey = () => "jur-leaf";
  const mats = [barkM, leafM];
  const KINDS = { araucaria: [araucaria(), araucaria()], broadleaf: [broadleaf(), broadleaf()], fern: [treeFern(), treeFern()], cycad: [cycad(), cycad()] };
  return { KINDS, mats, tick: (t) => { U.uT.value = t; }, atlas };
}
