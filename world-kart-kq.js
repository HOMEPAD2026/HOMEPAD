// world-kart-kq.js — ARCIRCLE KART KQ (2026-10-30, the owner: "a premium kart racer's look", Meshy's remaster loop raw/kart-kq):
// each track's light (a sun matched to its sky, the sky's horizon colour as the fog, a brighter exposure and a light grade on the
// canvas), an environment map made from the track's own sky (one PMREM a track, built once a visit) for the glossy karts and the
// road, the karts' boost flames (two crossed additive quads a nozzle, one mesh a kart), exhaust puffs (one Points pool), speed
// streaks on the road (one InstancedMesh), a soft contact shadow under each kart, and the trackside dressing: Meshy's props
// (models/world/kart/<track>/, shared/) placed along the spline — every kind ONE InstancedMesh, ~60 % of them on a phone, ~25 %
// and no landmarks on low graphics, loaded only for the picked track (they live in setTrack's group and go with it).
// Places are sample indexes of the track's table (900 round the loop) + a lateral offset, like world-kart-dress.js.

/// each track's light and props. sun: [colour, intensity, azimuth°, elevation°]; hemi: [sky, ground, intensity]; fog: the sky's
/// horizon colour; exp: the tone mapping's exposure in the race; grade: a CSS filter on the canvas (not on low graphics);
/// road: [roughness, env intensity]; props: [file, kind, desktop count, height or length (m), lateral from the wall (m)]
export const KQ = {
  nexus: { sun: [0xffd6b0, 2.1, 200, 18], hemi: [0xd8dcff, 0x2c2c3c, 1.05], fog: 0x8b5063, exp: 1.12, grade: "saturate(1.14) contrast(1.05)", road: [0.38, 0.55],
    props: [["nexus/neon-tree", "side", 30, 8, 3.2], ["nexus/banner-pole", "stands", 14, 8.5, 1.4], ["nexus/tyre-stack", "apex", 10, 1.5, 0.9], ["nexus/billboard", "mark", 4, 10, 7]] },
  moon: { sun: [0xd9d0ff, 1.8, 140, 26], hemi: [0xdfe2ff, 0x2a2c48, 1.15], fog: 0x384b8b, exp: 1.12, grade: "saturate(1.16) contrast(1.04)", road: [0.3, 0.75],
    props: [["moon/crystal", "side", 30, 3.6, 2.2], ["moon/dish", "far", 10, 7, 9], ["moon/float-rock", "sky", 9, 12, 0]] },
  ice: { sun: [0xfff2dc, 2.3, 60, 22], hemi: [0xeaf6ff, 0x6a86a6, 1.1], fog: 0xa4c5d3, exp: 1.08, grade: "saturate(1.12) contrast(1.05)", road: [0.32, 0.6],
    props: [["ice/pine", "side", 70, 9, 3.2], ["ice/ice-robot", "crowd", 16, 1.7, 1.6], ["ice/ice-arch", "arches", 0, 0, 0]] },
  volcano: { sun: [0xffa868, 2.0, 230, 16], hemi: [0xffd0b0, 0x3a1206, 1.1], fog: 0xa56354, exp: 1.1, grade: "saturate(1.15) contrast(1.06)", road: [0.42, 0.4],
    props: [["volcano/lava-lantern", "side", 30, 6.5, 8.6], ["volcano/scorched-banner", "stands", 8, 7, 1.6], ["volcano/obsidian", "far", 20, 11, 4]] },
};
/// on every track: Meshy's grandstands along the straights (in place of the drawn blocks), fences on the outside of the
/// tightest corners, the arch gate over the start straight, the ∞ blimp crossing the sky
export const KQ_SHARED = { stand: "shared/grandstand", fence: "shared/fence", gate: "shared/arch-gate", blimp: "shared/blimp" };
/// how many of a kind: a phone ~60 %, low graphics ~25 % (landmarks — the billboards, the floating rocks, the gate, the blimp — none)
export const kqCount = (n, { coarse, low } = {}, landmark = false) => (low ? (landmark ? 0 : Math.round(n * 0.25)) : coarse ? Math.round(n * 0.6) : n);
/// the karts' paint: glossy candy paint picking up the sky (the gloss retexture's colour map is in the packed kart files)
export const PAINT = { rough: 0.25, metal: 0.15, env: 1.0 };
/// the boost flames: length (m) and brightness from the speed, a boost's level (1 drift / pad / trick, 2 nitro / pump, 3 ultra)
export function flameOf({ sp = 0, boost = false, lv = 1, charge = 0, racing = true }) {
  if (!racing) return { len: 0.3, op: 0.16 };
  if (boost) return { len: 2.6 + 0.8 * Math.min(3, lv), op: 1 };
  const base = Math.max(0, sp - 0.15) / 0.85; return { len: 0.35 + 1.15 * base + Math.min(0.6, charge * 0.25), op: 0.16 + 0.5 * base + Math.min(0.3, charge * 0.12) };
}
/// the screen's speed lines: nothing under 70 % of the top speed, full at the top; a boost lifts them
export const streakOf = (sp, boost, lv = 1) => Math.max(boost ? 0.5 + 0.15 * lv : 0, Math.min(1, Math.max(0, (sp - 0.7) / 0.3)));
const TINT = [0xffffff, 0xffffff, 0xffc890, 0xe0a8ff]; // (by boost level: the texture's own blue-white, an orange nitro, a purple ultra)

/// the side of the track a corner bends away from at sample i (+1 = the right-hand vector r), and how sharply (radians over ±6 samples)
export function bendAt(S, N, i) { const a = S[(i - 6 + N) % N].t, b = S[(i + 6) % N].t, r = S[(i - 6 + N) % N].r; const ang = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))); return { ang, out: (b.x * r.x + b.z * r.z) > 0 ? -1 : 1 }; }

/// a soft round shadow texture (shared by the karts), made once
let blobTex = null;
export function blob(THREE) { if (blobTex) return blobTex; const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, "rgba(0,0,0,.85)"); g.addColorStop(0.55, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c); return blobTex; }
export function shadowMesh(THREE) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.7), new THREE.MeshBasicMaterial({ map: blob(THREE), transparent: true, depthWrite: false, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -3 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 1; return m; }

/// the boost flames of one kart: two nozzles, each a horizontal + a vertical quad (so it reads from behind and from the side), in one mesh
const NOZ = [[-0.36, 0.52], [0.36, 0.52]], NOZ_Z = -1.42;
export function flameMesh(THREE, tex) {
  const P = [], U = [], I = []; let v = 0;
  for (const [x, y] of NOZ) for (const vert of [false, true]) { const w = 0.26;
    const q = vert ? [[x, y - w, 0], [x, y + w, 0], [x, y + w, -1], [x, y - w, -1]] : [[x - w, y, 0], [x + w, y, 0], [x + w, y, -1], [x - w, y, -1]];
    for (const p of q) P.push(...p); U.push(0, 0, 0, 1, 1, 1, 1, 0); I.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.z = NOZ_Z; m.frustumCulled = false; m.renderOrder = 4; m.visible = false; return m;
}
/// (additive on black: no fog, or the fog colour fills the quad)
/// a frame of a kart's flames (the flicker is the caller's random)
export function flameSet(m, f, lv, boost, flick) { const show = f.op > 0.02; m.visible = show; if (!show) return; m.scale.set(boost ? 1.25 : 1, boost ? 1.25 : 1, f.len * flick); m.material.opacity = f.op; m.material.color.setHex(boost ? TINT[Math.min(3, lv)] : 0xffffff); }
export const nozzles = () => NOZ.map(([x, y]) => [x, y, NOZ_Z]);

/// exhaust puffs and road streaks: one Points pool (the puff picture, each point its own size and fade) and one InstancedMesh
export function makePuffs(THREE, scene, tex, n = 48) {
  const g = new THREE.BufferGeometry(), P = new Float32Array(n * 3), A = new Float32Array(n), Z = new Float32Array(n), V = new Float32Array(n * 3), life = new Float32Array(n), max = new Float32Array(n);
  for (let i = 0; i < n; i++) P[i * 3 + 1] = -99;
  g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("alpha", new THREE.BufferAttribute(A, 1)); g.setAttribute("size", new THREE.BufferAttribute(Z, 1));
  const mat = new THREE.ShaderMaterial({ uniforms: { uS: { value: innerHeight * 0.5 }, map: { value: tex } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "attribute float size; attribute float alpha; varying float vA; uniform float uS; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uS / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform sampler2D map; varying float vA; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb * vA, vA); }" });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 3; scene.add(pts); let k = 0;
  return { pts, emit(p, vx, vy, vz, t = 0.9, s = 0.9) { const i = k++ % n; P.set([p.x, p.y, p.z], i * 3); V.set([vx, vy, vz], i * 3); life[i] = max[i] = t; Z[i] = s; },
    step(dt) { for (let i = 0; i < n; i++) { if (life[i] <= 0) continue; life[i] -= dt; const j = i * 3; if (life[i] <= 0) { P[j + 1] = -99; A[i] = 0; continue; } P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt; V[j] *= 0.96; V[j + 2] *= 0.96; const u = 1 - life[i] / max[i]; Z[i] += dt * 1.6; A[i] = 0.55 * Math.min(1, u * 6) * (1 - u); }
      g.attributes.position.needsUpdate = g.attributes.alpha.needsUpdate = g.attributes.size.needsUpdate = true; },
    dispose() { scene.remove(pts); g.dispose(); mat.dispose(); } };
}
export function makeStreaks(THREE, scene, n = 14) {
  const geo = new THREE.PlaneGeometry(0.09, 7); geo.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), n), o = new THREE.Object3D(), Q = [];
  o.scale.setScalar(0); o.updateMatrix(); for (let i = 0; i < n; i++) { im.setMatrixAt(i, o.matrix); Q.push({ t: -Math.random() * 0.3 }); } im.frustumCulled = false; im.renderOrder = 2; scene.add(im);
  return { im, step(dt, v, at) { // at(i) → [x, z, yaw] of a fresh spot ahead of the camera; v: 0…1
      im.visible = v > 0.02; if (!im.visible) return; im.material.opacity = 0.55 * v;
      for (let i = 0; i < n; i++) { const q = Q[i]; q.t -= dt; if (q.t <= 0) { const s = at(i); q.t = 0.25 + Math.random() * 0.25; o.position.set(s[0], 0.06, s[1]); o.rotation.set(0, s[2], 0); o.scale.set(1, 1, 0.6 + Math.random() * 0.8); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } }
      im.instanceMatrix.needsUpdate = true; },
    tint(hex) { im.material.color.setHex(hex); }, dispose() { scene.remove(im); im.geometry.dispose(); im.material.dispose(); } };
}

/// the track's environment map: the sky panorama on a small equirect canvas (its top colour above, the ground's below), PMREM'd
export function skyEnv(THREE, renderer, img, ground) {
  const W = 512, H = 256, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const top = x.createLinearGradient(0, 0, 0, H * 0.3); x.drawImage(img, 0, 0, img.width, Math.max(2, img.height * 0.08), 0, 0, W, H * 0.3); // (the strip's top rows stretched over the zenith)
  x.globalAlpha = 0.35; top.addColorStop(0, "#000"); top.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = top; x.fillRect(0, 0, W, H * 0.3); x.globalAlpha = 1;
  x.drawImage(img, 0, 0, img.width, img.height, 0, H * 0.18, W, H * 0.34); // (the panorama round the horizon)
  x.fillStyle = "#" + ground.toString(16).padStart(6, "0"); x.fillRect(0, H * 0.52, W, H * 0.48);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromEquirectangular(t); pm.dispose(); t.dispose(); return rt;
}

/// where the props stand: pure (tests/world/kart.test.mjs runs it on every track's table) — [x, z, yaw, scale-ish, i] per kind.
/// busy(i): grandstands, the screen, the podium, the line; clear(x, z, m): no road within m; every spot keeps 4 m from the last ones
export function propSpots(S, N, TD, cfg, { coarse = false, low = false, WALL = 11.2, ROAD = 16, arches = [] } = {}) {
  const near = (a, b, n) => Math.min(Math.abs(a - b), N - Math.abs(a - b)) < n;
  const inStand = (i, m = 0) => TD.stands.some(([a, b]) => i > a - m && i < b + m), inTun = (i) => !!TD.tunnel && i >= TD.tunnel[0] - 4 && i <= TD.tunnel[1] + 4;
  const busy = (i) => inStand(i, 6) || near(i, TD.screen, 14) || near(i, TD.podium, 14) || near(i, 0, 14) || inTun(i) || (TD.ramps || []).some((r) => near(i, r.i, 8));
  const roadXZ = []; for (let j = 0; j < N; j += 3) roadXZ.push(S[j].p.x, S[j].p.z);
  const clear = (x, z, m) => { const m2 = m * m; for (let j = 0; j < roadXZ.length; j += 2) { const dx = roadXZ[j] - x, dz = roadXZ[j + 1] - z; if (dx * dx + dz * dz < m2) return false; } return true; };
  const taken = []; const free = (x, z, r) => { for (const [a, b, q] of taken) if ((a - x) ** 2 + (b - z) ** 2 < (r + q) ** 2) return false; return true; };
  const yawTo = (dx, dz) => Math.atan2(dx, dz), out = {}, cnt = (n, lm) => kqCount(n, { coarse, low }, lm);
  const put = (key, x, z, yaw, k, i, r) => { (out[key] = out[key] || []).push([x, z, yaw, k, i]); taken.push([x, z, r]); };
  const side = (S0, i) => { const s = S0[i]; return Math.sign((s.p.x - TD.c[0]) * s.r.x + (s.p.z - TD.c[1]) * s.r.z) || 1; }; // (+1: outside the circuit's middle)
  // shared: grandstands — every 14 m along each straight on its outside, facing the road (none on low: the drawn blocks stay)
  if (!low) for (const [a, b] of TD.stands) { const step = 11; for (let i = a + 4; i < b - 2; i += step) { const s = S[i], sd = side(S, i), d = WALL + 4.6; put("stand", s.p.x + s.r.x * sd * d, s.p.z + s.r.z * sd * d, yawTo(-s.r.x * sd, -s.r.z * sd), 14, i, 0.1); } }
  // fences on the outside of the tightest corners, end to end (4 m each), behind the rail
  { const n = cnt(44, false); let c = 0; for (let i = 0; i < N && c < n; i += 3) { if (busy(i)) continue; const { ang, out: o } = bendAt(S, N, i); if (ang < 0.16) continue; const s = S[i], d = WALL + 1.1, x = s.p.x + s.r.x * o * d, z = s.p.z + s.r.z * o * d; if (!clear(x, z, WALL + 0.4)) continue; put("fence", x, z, yawTo(-s.r.x * o, -s.r.z * o), 4, i, 1.2); c++; } }
  // the arch gate over the start straight (between two neon arches), the blimp's path round the middle
  if (!low) { const i = 32, s = S[i]; out.gate = [[s.p.x, s.p.z, yawTo(s.t.x, s.t.z), ROAD + 14, i]]; out.blimp = [[TD.c[0], TD.c[1], 0, 26, 0]]; }
  // the track's own kinds
  for (const [file, kind, n0, size, lat] of cfg.props) {
    const lm = kind === "mark" || kind === "sky", n = kind === "arches" ? (low ? 0 : arches.length) : cnt(n0, lm); if (!n) continue; const key = file;
    if (kind === "arches") { for (const i of arches) { const s = S[i]; (out[key] = out[key] || []).push([s.p.x, s.p.z, yawTo(s.t.x, s.t.z), ROAD + 7, i]); } continue; }
    if (kind === "sky") { for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + 0.4, r = 120 + ((k * 53) % 90); (out[key] = out[key] || []).push([TD.c[0] + Math.cos(a) * r, TD.c[1] + Math.sin(a) * r, k * 1.3, size * (0.7 + ((k * 7) % 5) * 0.15), 22 + ((k * 29) % 30)]); } continue; }
    let c = 0;
    for (let k = 0; k < n * 6 && c < n; k++) {
      let i, sd, d, r = size * 0.18 + 0.6, yaw, scl = size * (0.85 + ((k * 7) % 4) * 0.1);
      if (kind === "stands") { const st = TD.stands[k % TD.stands.length], span = st[1] - st[0]; i = st[0] + 2 + Math.floor(((k * 0.618) % 1) * (span - 4)); sd = -side(S, i); d = WALL + lat; } // (across the road from the grandstands)
      else if (kind === "crowd") { const st = TD.stands[k % TD.stands.length], span = st[1] - st[0]; i = st[0] + Math.floor(((k * 0.37 + 0.1) % 1) * span); sd = -side(S, i); d = WALL + lat + (k % 3) * 1.1; r = 0.7; }
      else if (kind === "apex") { i = Math.floor(((k * 0.4142 + 0.07) % 1) * N); const b = bendAt(S, N, i); if (b.ang < 0.2) continue; sd = b.out; d = WALL + lat + 1.8; }
      else if (kind === "mark") { i = Math.floor(((k + 0.5) / n) * N + k * 13) % N; sd = side(S, i); d = WALL + lat; }
      else if (kind === "far") { i = Math.floor(((k * 0.6180339 + 0.21) % 1) * N); sd = k % 2 ? 1 : -1; d = WALL + lat + ((k * 37) % 26); }
      else { i = Math.floor(((k * 0.7548777 + 0.03) % 1) * N); sd = k % 2 ? 1 : -1; d = WALL + lat + ((k * 13) % 3) * 1.4; } // "side": both sides of the road
      if (kind !== "stands" && kind !== "crowd" ? busy(i) : near(i, TD.screen, 12) || near(i, TD.podium, 12) || near(i, 0, 10)) continue;
      const s = S[i], x = s.p.x + s.r.x * sd * d, z = s.p.z + s.r.z * sd * d;
      if (!clear(x, z, WALL + Math.min(lat, 2) * 0.5 + 0.3) || !free(x, z, r)) continue;
      yaw = kind === "side" || kind === "far" ? k * 2.399 : yawTo(-s.r.x * sd, -s.r.z * sd) + (kind === "crowd" ? ((k * 5) % 7 - 3) * 0.12 : 0);
      if (kind === "crowd") scl = size * (0.85 + ((k * 3) % 5) * 0.07);
      put(key, x, z, yaw, scl, i, r); c++;
    }
  }
  return out;
}
