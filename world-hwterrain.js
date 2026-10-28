// world-hwterrain.js — the HALLOWEEN REALM's land as one rolling terrain (HT1, 2026-10-28, the owner: "not ground pads —
// a wide space like Jurassic, hunting in a spooky forest"). No pads, rings or boards: a value-noise roll, the village's
// square flat, each ground a region of the land (its lift makes the Graveyard a hill, the Clocktower a plateau, the
// Throne a basin; its flat keeps the hunting floor gentle), the swamp's hollow, dirt roads out from the village, the
// ridges past HW.EDGE that wall it in. Coloured by region (vertex colours over the autumn-grass texture); the dead
// forest drawn here (two kinds of tree, merged geometry, one InstancedMesh a chunk so the far chunks drop out).
//   makeHwHeight(HW, GROUNDS) → { h(x, z), wet(x, z), region(x, z), spots: [{ x, z, ... }] }   (land coordinates: the
//     village's middle is 0, 0)           — pure, no THREE (tests/world/hwrealm.test.mjs)
//   makeHwTerrain(THREE, { HW, GROUNDS, low, tex }) → { mesh, water, trees, h, wet, nearTrees(x, z, n) }

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const rad = (a) => (a * Math.PI) / 180;
function hash(ix, iz) { let h = (ix * 374761393 + iz * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const fbm = (x, z) => vnoise(x, z) * 0.5 + vnoise(x * 2.03 + 17, z * 2.03 + 9) * 0.27 + vnoise(x * 4.1 + 41, z * 4.1 + 3) * 0.15 + vnoise(x * 8.3 + 7, z * 8.3 + 77) * 0.08;
// distance from p to the segment a–b
function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }

export function makeHwHeight(HW, GROUNDS) {
  const VR = HW.VILLAGE_R, EDGE = HW.EDGE || 232, R = HW.LAND.r, SW = HW.SWAMP;
  const regs = GROUNDS.map((G) => ({ id: G.id, x: Math.sin(rad(G.a)) * G.d, z: Math.cos(rad(G.a)) * G.d, r: G.r, lift: G.lift || 0, flat: G.flat == null ? 0.5 : G.flat }));
  const swamp = SW ? { x: Math.sin(rad(SW.a)) * SW.d, z: Math.cos(rad(SW.a)) * SW.d, r: SW.r } : null;
  // the roads: from the village's edge to each region's middle, with a bend half way (fixed by the region's id)
  const roads = regs.map((g, i) => { const a = Math.atan2(g.x, g.z), sx = Math.sin(a) * (VR + 2), sz = Math.cos(a) * (VR + 2), bend = (i % 2 ? 1 : -1) * 9, mx = (sx + g.x) / 2 + Math.cos(a) * bend, mz = (sz + g.z) / 2 - Math.sin(a) * bend; return [[sx, sz, mx, mz], [mx, mz, g.x, g.z]]; }).flat();
  const roadD = (x, z) => { let d = 1e9; for (const s of roads) d = Math.min(d, segD(x, z, s[0], s[1], s[2], s[3])); return d; };
  function h(x, z) {
    let y = (fbm(x / 64, z / 64) - 0.47) * 8;
    { const rd = roadD(x, z); if (rd < 9) y *= 1 - sm((9 - rd) / 6) * 0.35; } // (the roads smooth the land's roll a little, not the regions' lift)
    for (const g of regs) { const d = Math.hypot(x - g.x, z - g.z), w = sm((g.r * 1.5 - d) / (g.r * 0.6)); if (w > 0) y += (g.lift + y * g.flat - y) * w; }
    if (swamp) { const d = Math.hypot(x - swamp.x, z - swamp.z), w = sm((swamp.r * 1.4 - d) / (swamp.r * 0.9)); if (w > 0) y += (-1.7 - y) * w; }
    const c = Math.hypot(x, z), wv = sm((VR + 16 - c) / 12); if (wv > 0) y *= 1 - wv; // the village's square stays flat
    if (c > EDGE) { const k = (c - EDGE) / Math.max(1, R - EDGE); y += k * k * 26 + fbm(x / 22, z / 22) * 10 * Math.min(1, k * 1.5); }
    return y;
  }
  const wet = (x, z) => !!swamp && Math.hypot(x - swamp.x, z - swamp.z) < swamp.r - 1 && h(x, z) < -0.55;
  // which region a point is in (the nearest inside its r × 1.25), for the colours and the trees
  function region(x, z) { let best = null, bd = 1e9; for (const g of regs) { const d = Math.hypot(x - g.x, z - g.z) / (g.r * 1.25); if (d < 1 && d < bd) { bd = d; best = g; } } return best; }
  return { h, wet, region, regs, roads, roadD, swamp, VR, EDGE, R };
}

// ---------------- the drawn land, for the game ----------------
const COL = { base: 0x8a7a52, "hw-patch": 0xd89a58, "hw-forest": 0x5e7a5c, "hw-grave": 0x8a809c, "hw-candy": 0xd89ab6, "hw-clock": 0x8496bc, "hw-throne": 0x9a4a3a, swamp: 0x3e4a36, road: 0x7a5c40, village: 0xc4ac8a, ridge: 0x5a5262 };
// how thick the trees grow in each region (a chance each 6 m cell), and which kinds (d = dead and bare, p = a dark pine)
const DENS = { "hw-patch": [0.06, "d"], "hw-forest": [0.62, "dp"], "hw-grave": [0.12, "d"], "hw-candy": [0.05, "p"], "hw-clock": [0.1, "dp"], "hw-throne": [0.12, "d"] };

export function makeHwTerrain(THREE, { HW, GROUNDS, low = false, tex = null, keep = [] } = {}) {
  const H = makeHwHeight(HW, GROUNDS), R = HW.LAND.r + 40, N = low ? 110 : 170;
  // ---- the ground: one grid, its heights and colours; the texture (the autumn grass) is set when it loads
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, N, N); geo.rotateX(-Math.PI / 2);
  const P = geo.attributes.position, C = new Float32Array(P.count * 3), c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), y = H.h(x, z); P.setY(i, y);
    c0.set(COL.base); const g = H.region(x, z);
    if (g) { const d = Math.hypot(x - g.x, z - g.z) / (g.r * 1.25); c0.lerp(c1.set(COL[g.id]), sm((1 - d) / 0.45)); }
    const n = vnoise(x / 9, z / 9); c0.multiplyScalar(0.82 + n * 0.3); // (patches of light and dark)
    if (H.swamp) { const d = Math.hypot(x - H.swamp.x, z - H.swamp.z); if (d < H.swamp.r * 1.4) c0.lerp(c1.set(COL.swamp), sm((H.swamp.r * 1.4 - d) / (H.swamp.r * 0.6))); }
    const rd = H.roadD(x, z); if (rd < 3.2) c0.lerp(c1.set(COL.road), sm((3.2 - rd) / 1.6) * 0.85);
    const c = Math.hypot(x, z); if (c < H.VR + 3) c0.lerp(c1.set(COL.village), sm((H.VR + 3 - c) / 4));
    if (c > H.EDGE) c0.lerp(c1.set(COL.ridge), sm((c - H.EDGE) / 20));
    C[i * 3] = c0.r; C[i * 3 + 1] = c0.g; C[i * 3 + 2] = c0.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(C, 3)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (tex) tex((t) => { t.repeat.set(R / 7, R / 7); mat.map = t; mat.needsUpdate = true; });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = "hw-terrain"; mesh.receiveShadow = !low;
  // ---- the swamp's black water (still, a little shine), at -0.55
  let water = null; if (H.swamp) { water = new THREE.Mesh(new THREE.CircleGeometry(H.swamp.r * 1.15, 48), new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.86, emissive: 0x0a2a1a, emissiveIntensity: 0.4 })); water.rotation.x = -Math.PI / 2; water.position.set(H.swamp.x, -0.55, H.swamp.z); water.name = "hw-swamp"; }
  // ---- the dead forest: where each tree stands (6 m cells, the region's chance; none on roads, in the village, in the
  // water, on the ridges' steep side or on what's kept clear: keep = [[x, z, r]] — buildings, landmarks, gimmicks)
  const trees = [], cell = low ? 8 : 6;
  for (let gx = -HW.LAND.r; gx <= HW.LAND.r; gx += cell) for (let gz = -HW.LAND.r; gz <= HW.LAND.r; gz += cell) {
    const x = gx + (hash(gx, gz + 5) - 0.5) * cell * 0.9, z = gz + (hash(gx + 3, gz) - 0.5) * cell * 0.9, c = Math.hypot(x, z);
    if (c < H.VR + 8 || c > HW.LAND.r - 6) continue;
    const g = H.region(x, z), [p0, kinds] = g ? DENS[g.id] || [0.1, "d"] : c > H.EDGE - 10 ? [0.45, "dp"] : [0.22, "dp"];
    if (hash(gx + 11, gz - 7) > p0 * (low ? 0.6 : 1)) continue;
    if (H.roadD(x, z) < 4.5 || H.wet(x, z) || (H.swamp && Math.hypot(x - H.swamp.x, z - H.swamp.z) < H.swamp.r + 2)) continue;
    if (g && Math.hypot(x - g.x, z - g.z) < 9) continue; // (a clearing at each region's middle: the boss comes there)
    if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
    const kind = kinds[Math.floor(hash(gx - 2, gz + 13) * kinds.length)], s = 0.75 + hash(gx + 7, gz + 1) * 0.7;
    trees.push({ x, z, y: H.h(x, z), kind, s, r: hash(gz, gx) * 6.283, burnt: g && g.id === "hw-throne" });
  }
  // ---- the two trees, drawn: a bare dead tree (a bent trunk, four crooked limbs, twigs) and a dark pine (three cones)
  const merge = (list) => { let n = 0, ni = 0; for (const q of list) { n += q.attributes.position.count; ni += q.index ? q.index.count : q.attributes.position.count; } const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = []; let o = 0;
    for (const q of list) { const qp = q.attributes.position, qn = q.attributes.normal, cc = q.userData.c; for (let i = 0; i < qp.count; i++) { pos.set([qp.getX(i), qp.getY(i), qp.getZ(i)], (o + i) * 3); nor.set([qn.getX(i), qn.getY(i), qn.getZ(i)], (o + i) * 3); col.set([cc.r, cc.g, cc.b], (o + i) * 3); }
      if (q.index) for (let i = 0; i < q.index.count; i++) idx.push(q.index.getX(i) + o); else for (let i = 0; i < qp.count; i++) idx.push(i + o); o += qp.count; }
    const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); m.setAttribute("color", new THREE.BufferAttribute(col, 3)); m.setIndex(idx); void ni; return m; };
  const part = (q, c, x, y, z, rx, ry, rz) => { q.rotateZ(rz || 0); q.rotateX(rx || 0); q.rotateY(ry || 0); q.translate(x, y, z); q.userData.c = new THREE.Color(c); return q; };
  const dead = () => { const L = [], bark = 0x3a2e2a; const tr = new THREE.CylinderGeometry(0.16, 0.42, 6.2, 6, 3); const p = tr.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 3.1; p.setX(i, p.getX(i) + Math.sin(y * 0.55) * 0.35); } L.push(part(tr, bark, 0, 3.1, 0));
    [[2.6, 0.9, 0.2, 1.9], [3.6, -1.0, 2.2, 1.7], [4.6, 1.1, 4.1, 1.4], [5.2, -0.8, 5.6, 1.2]].forEach(([y, tilt, turn, len]) => { const b = new THREE.CylinderGeometry(0.04, 0.13, len, 4, 1); b.translate(0, len / 2, 0); L.push(part(b, bark, 0, y, 0, 0, turn, tilt));
      const tw = new THREE.CylinderGeometry(0.02, 0.05, len * 0.55, 3, 1); tw.translate(0, len * 0.27, 0); tw.rotateZ(-tilt * 0.6); tw.translate(0, len * 0.7, 0); tw.rotateZ(tilt); tw.rotateY(turn); tw.translate(0, y, 0); tw.userData.c = new THREE.Color(bark); L.push(tw); });
    return merge(L); };
  const pine = () => { const L = [part(new THREE.CylinderGeometry(0.14, 0.24, 1.6, 5, 1), 0x2e2420, 0, 0.8, 0)]; [[1.2, 2.2, 2.6, 0x1f3a34], [2.9, 1.7, 2.3, 0x24443c], [4.4, 1.1, 2.0, 0x2a4e44]].forEach(([y, r, hh, c]) => L.push(part(new THREE.ConeGeometry(r, hh, 7, 1), c, 0, y + hh / 2, 0))); return merge(L); };
  const geos = { d: dead(), p: pine() }, tmat = new THREE.MeshLambertMaterial({ vertexColors: true }), burnt = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x553a33, emissive: 0x2a0800 });
  // one InstancedMesh per kind and 60 m chunk (the camera's frustum drops the chunks out of view; the far ones are hidden)
  const forest = new THREE.Group(); forest.name = "hw-forest"; const chunks = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), CH = 60;
  const byChunk = {}; for (const t of trees) { const k = `${Math.floor(t.x / CH)},${Math.floor(t.z / CH)},${t.kind},${t.burnt ? 1 : 0}`; (byChunk[k] = byChunk[k] || []).push(t); }
  for (const [k, list] of Object.entries(byChunk)) { const [, , kind, b] = k.split(","), im = new THREE.InstancedMesh(geos[kind], b === "1" ? burnt : tmat, list.length); let cx = 0, cz = 0;
    list.forEach((t, i) => { Q.setFromAxisAngle(Y, t.r); S.setScalar(t.s); M.compose(V.set(t.x, t.y - 0.15, t.z), Q, S); im.setMatrixAt(i, M); cx += t.x; cz += t.z; });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = false; forest.add(im); /* (no shadows from the drawn forest: 1,500 trees in the shadow pass cost too much on a phone) */ chunks.push({ im, x: cx / list.length, z: cz / list.length }); }
  // the trees near a point (for their trunks to block you: a few proxies follow you round)
  const grid = {}; for (const t of trees) { const k = `${Math.floor(t.x / 10)},${Math.floor(t.z / 10)}`; (grid[k] = grid[k] || []).push(t); }
  function nearTrees(x, z, n = 16, out = []) { out.length = 0; const ix = Math.floor(x / 10), iz = Math.floor(z / 10); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const t of grid[`${ix + a},${iz + b}`] || []) out.push(t); out.sort((p, q) => (p.x - x) ** 2 + (p.z - z) ** 2 - (q.x - x) ** 2 - (q.z - z) ** 2); if (out.length > n) out.length = n; return out; }
  function cull(x, z, far) { for (const c of chunks) c.im.visible = (c.x - x) ** 2 + (c.z - z) ** 2 < far * far; }
  return { mesh, water, forest, trees, chunks, nearTrees, cull, ...H };
}
