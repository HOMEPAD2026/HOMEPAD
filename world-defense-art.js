// world-defense-art.js — AC Defense's look: the "blue glass" arena, the scam portals, the Core and the towers. No game
// rules here (world-defense.js runs the game and calls in); no DOM at module top (textures are drawn on first use, a
// 1×1 white texture stands in where there's no document, so node can import it).
//
// createDefenseArt({ THREE, coarse, low, reduce }) → art:
//   art.arena(root, { ARENA, padAt, gateAt, TOWERS }) → { group, pads: Group[ARENA.pads], core: Group }
//       builds the arena into root (root-local, the Core at 0,0): hex floor, 4 lanes (gate → Core), pads (instanced),
//       the light wall, 4 scam portals at the gates and the Core. pads[i] are empty anchors on each socket's top:
//       add a tower group there. Calling it again rebuilds (the old arena is removed first).
//   art.setPad(i, state)      state "empty" (can't afford) | "can" (buildable) | "used" (has a tower) | "sel" (selected)
//   art.wallHit(angle)        the wall flashes red at angle (radians from +x toward +z, as padAt/gateAt; root-local)
//   art.setPortals(level)     0 closed … 1 wide open (eased): before and during a wave
//   art.setCore(hpFrac, hit)  colour blue → gold (≤30 %) → red (≤12 %), cracks as it falls; hit: flash + shockwave
//   art.coreBreak()           the crystals shatter (the run is lost)
//   art.tower(id, lvl) → Group  id "shock"|"frost"|"flame"|"barrier", lvl 1–3. userData: { kind, lvl, head (the part
//       that aims), muzzle (Object3D at the fire point), fire() (muzzle flash), setHp(frac) (barrier only) }
//   art.rise(group)           spawn/upgrade pop (overshoot scale + dust ring), played by tick
//   art.aim(group, x, z)      turn the head toward a planet-local point (eased in tick; assumes root is planet's child)
//   art.drop(group)           stop animating a tower (tick also forgets towers that left the scene)
//   art.tick(dt, t)           every animation, one loop, no allocations
//   art.dispose()             frees every geometry, material and texture it made, and removes the arena
// Draw calls: arena 13 (+ core crack, shockwave, shards and dust rings only while showing); a tower 3–6.
// Shared geometries/materials are cached by key and freed only in dispose(). No lights: emissive and additive only.
// Quality: coarse halves the extras (fewer segments, shards, dust rings), low quarters them (no aura, bob, decal spin,
// 2-octave noise), reduce stops pops, shake and flashes and slows ambient motion to a quarter.

export const ART_VERSION = 1;
const CY = 0x38d8ff, VI = 0xb48cff, MI = 0x4dffb0, RED = 0xff4d6d, GOLD = 0xffc861, STONE = 0x2a3858;
const KC0 = { shock: VI, frost: 0x8fe6ff, flame: 0xff7a2a, barrier: 0x35d8d0 };
const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
float hx(vec2 p, out vec2 id){ const vec2 s = vec2(1.0, 1.7320508); vec2 a = mod(p, s) - s * 0.5, b = mod(p - s * 0.5, s) - s * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b; id = p - g; vec2 q = abs(g); return max(dot(q, vec2(0.5, 0.8660254)), q.x); }`;
const UV_VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){ vUv = uv; vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const H = `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;`;
const easeBack = (k) => { const c = 1.70158, m = k - 1; return 1 + (c + 1) * m * m * m + c * m * m; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createDefenseArt({ THREE, coarse = false, low = false, reduce = false } = {}) {
  const TAU = Math.PI * 2, PI2 = Math.PI / 2, mo = reduce ? 0.25 : 1; // ambient motion speed
  const U = { uTime: { value: 0 } }, KC = { ...KC0 }; let FR = [5.4, 6.2, 7]; // frost reach per level (TOWERS.frost.r)
  const gC = new Map(), mC = new Map(), tC = new Map();
  const G = (k, f) => { let g = gC.get(k); if (!g) gC.set(k, (g = f())); return g; };
  const M = (k, f) => { let m = mC.get(k); if (!m) mC.set(k, (m = f())); return m; };
  const hdr = (c, k = 1.6) => new THREE.Color(c).multiplyScalar(k);
  const D = new THREE.Object3D(), C0 = new THREE.Color(), C1 = new THREE.Color();
  const seg = (n) => Math.max(6, Math.round(n * (low ? 0.5 : coarse ? 0.75 : 1)));
  // geometry helpers: transform in place (scale, then Z, X, Y rotations, then move), merge into one non-indexed geometry
  const tf = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { g.scale(sx, sy, sz); if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
  const merge = (list) => {
    let n = 0; const xs = list.filter(Boolean).map((g) => { const x = g.index ? g.toNonIndexed() : g; if (x !== g) g.dispose(); n += x.attributes.position.count; return x; });
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2); let o = 0;
    for (const x of xs) { const a = x.attributes; P.set(a.position.array, o * 3); N.set(a.normal.array, o * 3); if (a.uv) UV.set(a.uv.array, o * 2); o += a.position.count; x.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setAttribute("uv", new THREE.BufferAttribute(UV, 2)); g.computeBoundingSphere(); return g;
  };
  const Cyl = (...a) => new THREE.CylinderGeometry(...a), Tor = (r, t, rs, ts) => new THREE.TorusGeometry(r, t, rs, seg(ts)), Box = (...a) => new THREE.BoxGeometry(...a);
  const flatTor = (r, t, y, ts = 32) => tf(Tor(r, t, 6, ts), 0, y, 0, PI2);

  // ---------------- textures (drawn on first use) ----------------
  const DRAW = {
    glow: [128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.3, "rgba(255,255,255,.7)"); r.addColorStop(0.65, "rgba(255,255,255,.18)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); }],
    crack: [256, (g, w) => { let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647); g.strokeStyle = "#fff"; g.lineCap = "round"; g.shadowColor = "#fff"; g.shadowBlur = 6;
      for (let i = 0; i < 9; i++) { let x = R() * w, y = R() * w, a = R() * TAU; g.lineWidth = 2 + R() * 2.5; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * 18; y += Math.sin(a) * 18; g.lineTo(x, y); } g.stroke(); } }],
    snow: [256, (g, w) => { const c = w / 2; g.translate(c, c); g.strokeStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 8; const ring = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
      ring(122, 5); ring(112, 1.5); g.globalAlpha = 0.5; ring(70, 2);
      for (let i = 0; i < 6; i++) { g.save(); g.rotate((i / 6) * TAU); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 20); g.lineTo(0, 108); for (const d of [48, 76]) { g.moveTo(0, d); g.lineTo(-14, d + 14); g.moveTo(0, d); g.lineTo(14, d + 14); } g.stroke(); g.restore(); }
      g.globalAlpha = 0.18; g.fillStyle = "#fff"; g.beginPath(); g.arc(0, 0, 112, 0, TAU); g.fill(); }],
  };
  const tex = (k) => { let t = tC.get(k); if (t) return t;
    if (typeof document === "undefined") t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    else { const [w, draw] = DRAW[k], c = document.createElement("canvas"); c.width = c.height = w; draw(c.getContext("2d"), w); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; }
    t.needsUpdate = true; tC.set(k, t); return t; };

  // ---------------- materials (cached by key) ----------------
  const stoneM = () => M("stone", () => new THREE.MeshStandardMaterial({ color: STONE, emissive: 0x0c1a33, roughness: 0.5, metalness: 0.35, flatShading: true }));
  const metalM = () => M("metal", () => new THREE.MeshStandardMaterial({ color: 0x41557f, emissive: 0x0a1428, roughness: 0.32, metalness: 0.65, flatShading: true }));
  const neonM = (c, k = 1.8) => M("neon" + c + "_" + k, () => new THREE.MeshBasicMaterial({ color: hdr(c, k) }));
  const glassM = (c, e = 0.9) => M("glass" + c + "_" + e, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.15, metalness: 0.1, flatShading: true }));
  const goldM = () => M("gold", () => new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.75, roughness: 0.3, metalness: 0.6, flatShading: true }));
  const glowM = (c, o = 0.45) => M("glow" + c, () => new THREE.MeshBasicMaterial({ color: c, map: tex("glow"), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
  const sm = (k, uni, vs, fs, o = {}) => M(k, () => new THREE.ShaderMaterial({ uniforms: { ...uni, uTime: U.uTime }, vertexShader: vs, fragmentShader: fs, defines: { OCT: low ? 2 : 4 },
    transparent: true, depthWrite: false, side: o.side ?? THREE.DoubleSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  // a ring growing across the ground (dust, shockwave): uR 0→1, uFade
  const ringFS = `${H} uniform vec3 uColor; uniform float uR, uFade;
    void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(uR - 0.16, uR, r) * (1.0 - smoothstep(uR, uR + 0.05, r)); a += 0.12 * step(r, uR) * r;
      gl_FragColor = vec4(uColor, a * uFade); }`;
  const ringMat = (k, c) => sm(k, { uColor: { value: hdr(c, 1.5) }, uR: { value: 0 }, uFade: { value: 0 } }, UV_VERT, ringFS);
  const flatPlane = () => G("flat", () => tf(new THREE.PlaneGeometry(1, 1), 0, 0, 0, -PI2));

  // ================= the arena =================
  let A = null, artRoot = null;
  const padS = [], hitA = new THREE.Vector4(), hitK = new THREE.Vector4(); let hitI = 0;
  const coreCol = new THREE.Color(CY), coreTgt = new THREE.Color(CY);
  const PAD_RIM = { empty: [CY, 0.55], can: [MI, 1.7], used: [VI, 0.9], sel: [GOLD, 2.2] }, PAD_PLUS = { empty: [CY, 0.22], can: [MI, 1.0], used: [0, 0], sel: [GOLD, 1.2] };
  function arena(root, d = {}) {
    if (A) clearArena();
    const AR = d.ARENA || { r: 10.5, padR: 6.9, pads: 8, gateR: 10.2, coreR: 4.6 }, padAt = d.padAt, gateAt = d.gateAt;
    if (d.TOWERS) { for (const k in d.TOWERS) if (d.TOWERS[k].color != null) KC[k] = d.TOWERS[k].color; if (d.TOWERS.frost && d.TOWERS.frost.r) FR = d.TOWERS.frost.r; }
    artRoot = root; const grp = new THREE.Group(); grp.name = "defense-art"; root.add(grp);
    const a = A = { grp, AR, pads: [], padP: [], inst: [], po: 0, pt: 0, flash: 0, crackK: 0, crackT: 0, shockT: -1, shockBig: false, broken: false, breakT: -1, rot: 0 };
    const addI = (m) => { m.frustumCulled = false; a.inst.push(m); grp.add(m); return m; };
    // (1) the floor: blue glass hexes, a slow wave out from the Core, a ring at the Core's reach and a bright rim
    const floor = new THREE.Mesh(G("floor" + AR.r, () => tf(new THREE.CircleGeometry(AR.r, seg(72)), 0, 0, 0, -PI2)), sm("floor", { uR: { value: AR.r }, uCore: { value: AR.coreR } }, UV_VERT, `${NOISE} ${H} uniform float uR, uCore;
      void main(){ vec2 p = vP.xz; float r = length(p); vec2 id; float d = hx(p / 1.15, id); float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        float edge = smoothstep(0.40, 0.48, d), wave = 0.5 + 0.5 * sin(r * 0.9 - uTime * 1.4);
        vec3 col = mix(vec3(0.09, 0.15, 0.29), vec3(0.14, 0.24, 0.42), h) + vec3(0.12, 0.5, 0.8) * edge * (0.35 + 0.35 * wave);
        col += vec3(0.2, 0.8, 1.2) * (1.0 - smoothstep(0.0, 0.07, abs(r - uCore))) * 0.6 + vec3(0.25, 0.85, 1.3) * smoothstep(uR - 0.9, uR - 0.25, r) * 0.5;
        gl_FragColor = vec4(col, (0.84 + edge * 0.1) * (1.0 - smoothstep(uR - 0.25, uR, r))); }`, { side: THREE.FrontSide }));
    floor.position.y = 0.06; /* over the Game Village square (0.04, polygon offset) */ Object.assign(floor.material, { polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }); floor.renderOrder = -2; grp.add(floor);
    // lanes: one merged mesh, chevrons flowing gate → Core (uv.x 0 at the gate); uHot reddens them as the portals open
    const r0 = AR.gateR - 0.3, r1 = AR.coreR + 0.2, len = r0 - r1, gates = [];
    for (let i = 0; i < 4; i++) gates.push(gateAt ? gateAt(i) : { a: Math.PI / 4 + i * PI2, x: Math.cos(Math.PI / 4 + i * PI2) * AR.gateR, z: Math.sin(Math.PI / 4 + i * PI2) * AR.gateR });
    const lanes = new THREE.Mesh(G("lanes" + AR.r, () => merge(gates.map((g) => tf(new THREE.PlaneGeometry(len, 1.15), Math.cos(g.a) * (r0 + r1) / 2, 0, Math.sin(g.a) * (r0 + r1) / 2, -PI2, Math.PI - g.a)))),
      sm("lanes", { uLen: { value: len }, uHot: { value: 0 } }, UV_VERT, `${H} uniform float uLen, uHot;
      void main(){ float x = vUv.x * uLen, y = abs(vUv.y - 0.5) * 2.0; float f = fract((x + y * 0.45) / 1.1 - uTime * 0.9);
        float chev = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.28, 0.4, f)) * (1.0 - smoothstep(0.75, 0.95, y));
        float side = smoothstep(0.82, 0.92, y) * (1.0 - smoothstep(0.95, 1.0, y)), ends = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        vec3 col = mix(vec3(0.3, 1.1, 1.6), vec3(1.6, 0.35, 0.5), uHot); gl_FragColor = vec4(col * (1.0 + chev * 0.5), (chev * (0.55 + 0.4 * uHot) + side * 0.35 + 0.06) * ends); }`));
    lanes.position.y = 0.08; Object.assign(lanes.material, { polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 }); lanes.renderOrder = -1; grp.add(lanes); a.lanes = lanes;
    // (2) pads: stone socket, neon rim (colour per state), a hovering hologram plus; anchors for the towers
    const n = AR.pads;
    a.sock = addI(new THREE.InstancedMesh(G("sock", () => tf(Cyl(1.0, 1.12, 0.2, 8), 0, 0.1, 0, 0, Math.PI / 8)), stoneM(), n));
    a.rim = addI(new THREE.InstancedMesh(G("rim", () => flatTor(0.93, 0.055, 0.21)), M("padRim", () => new THREE.MeshBasicMaterial({ color: 0xffffff })), n));
    a.plus = addI(new THREE.InstancedMesh(G("plus", () => { const p = 0.34, q = 0.11, s = new THREE.Shape(); [[-q, -p], [q, -p], [q, -q], [p, -q], [p, q], [q, q], [q, p], [-q, p], [-q, q], [-p, q], [-p, -q], [-q, -q]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      return tf(new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: false }), 0, 0, -0.045); }), M("padPlus", () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), n));
    for (let i = 0; i < n; i++) { const p = padAt ? padAt(i) : { x: Math.cos((i / n) * TAU) * AR.padR, z: Math.sin((i / n) * TAU) * AR.padR }; a.padP.push(p);
      D.position.set(p.x, 0, p.z); D.rotation.set(0, 0, 0); D.scale.set(1, 1, 1); D.updateMatrix(); a.sock.setMatrixAt(i, D.matrix); a.rim.setMatrixAt(i, D.matrix);
      const an = new THREE.Group(); an.name = "pad" + i; an.position.set(p.x, 0.2, p.z); grp.add(an); a.pads.push(an); padS[i] = "empty"; setPad(i, "empty"); }
    // (3) the wall: a curtain of light fading upward, streaks climbing it, red where it's hit
    const WH = 2.6; hitK.set(0, 0, 0, 0);
    const wall = new THREE.Mesh(G("wall" + AR.r, () => Cyl(AR.r + 0.5, AR.r + 0.5, WH, seg(72), 1, true)), sm("wall", { uHitA: { value: hitA }, uHitK: { value: hitK } }, UV_VERT, `${H} uniform vec4 uHitA, uHitK;
      float hk(float a, float k, float b){ float d = abs(mod(b - a + 3.14159265, 6.2831853) - 3.14159265); return k * exp(-d * d * 10.0); }
      void main(){ float v = vUv.y, b = atan(vP.z, vP.x), c = floor(vUv.x * 120.0), h = fract(sin(c * 91.7) * 4375.85);
        float s = fract(v * 1.4 - uTime * (0.25 + 0.35 * h) + h), st = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.3, 0.55, s)) * step(0.45, h) * (1.0 - smoothstep(0.15, 0.45, abs(fract(vUv.x * 120.0) - 0.5)));
        float hit = clamp(hk(uHitA.x, uHitK.x, b) + hk(uHitA.y, uHitK.y, b) + hk(uHitA.z, uHitK.z, b) + hk(uHitA.w, uHitK.w, b), 0.0, 1.0);
        vec3 col = mix(vec3(0.35, 1.2, 1.7), vec3(1.9, 0.35, 0.5), hit); float a = (0.1 + st * 0.5 + (1.0 - smoothstep(0.0, 0.06, v)) * 0.5 + hit * 0.45) * pow(1.0 - v, 1.7);
        gl_FragColor = vec4(col * (1.0 + st * 0.6), a); }`));
    wall.position.y = WH / 2; grp.add(wall);
    // (4) the scam portals: stone ring on a plinth, neon inner ring, a swirl opening with uOpen
    a.pfr = addI(new THREE.InstancedMesh(G("pfr", () => merge([Tor(1.5, 0.17, 8, 32), tf(Box(1.5, 0.26, 0.62), 0, -1.62, 0), tf(Box(0.3, 0.5, 0.4), -0.95, -1.3, 0, 0, 0, 0.5), tf(Box(0.3, 0.5, 0.4), 0.95, -1.3, 0, 0, 0, -0.5)])),
      M("pfrM", () => new THREE.MeshStandardMaterial({ color: 0x2a2346, emissive: VI, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.5, flatShading: true })), 4));
    a.pne = addI(new THREE.InstancedMesh(G("pne", () => Tor(1.32, 0.05, 6, 48)), M("pneM", () => new THREE.MeshBasicMaterial({ color: hdr(VI, 1.2) })), 4));
    a.psw = addI(new THREE.InstancedMesh(G("psw", () => new THREE.CircleGeometry(1.3, seg(36))), sm("swirl", { uOpen: { value: 0 } }, `varying vec2 vUv; varying float vS;
      void main(){ vUv = uv; vec4 p = vec4(position, 1.0); vS = 0.0;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; vS = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71;
      #endif
        gl_Position = projectionMatrix * modelViewMatrix * p; }`, `${NOISE} uniform float uTime, uOpen; varying vec2 vUv; varying float vS;
      void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0, an = atan(c.y, c.x), tw = an + r * 4.5 - uTime * (0.8 + uOpen * 1.6) + vS;
        vec2 q = vec2(cos(tw), sin(tw)) * (1.2 + r * 1.6); float s = fbm(q * 1.4 + vec2(uTime * 0.2, vS)), arms = 0.5 + 0.5 * sin(tw * 2.0 + s * 5.0);
        float m = clamp(s * 1.2 + arms * 0.35, 0.0, 1.0), core = exp(-r * r * 8.0), lim = 0.35 + 0.65 * uOpen;
        vec3 col = mix(vec3(0.45, 0.25, 0.9), mix(vec3(1.0, 0.55, 1.6), vec3(1.8, 0.3, 0.45), uOpen), m * m) + vec3(1.0, 0.8, 1.0) * core * uOpen;
        gl_FragColor = vec4(col, (0.15 + m * 0.7 + core * 0.5 * uOpen) * (1.0 - smoothstep(lim - 0.12, lim, r)) * (0.35 + 0.65 * uOpen)); }`), 4));
    gates.forEach((g, i) => { D.position.set(g.x, 1.75, g.z); D.rotation.set(0, Math.atan2(-g.x, -g.z), 0); D.scale.set(1, 1, 1); D.updateMatrix(); a.pfr.setMatrixAt(i, D.matrix); a.pne.setMatrixAt(i, D.matrix); a.psw.setMatrixAt(i, D.matrix); });
    // (5) the Core: stepped pedestal, light rings, three counter-rotating crystals, a soft beam; crack, shockwave, shards
    const core = a.core = new THREE.Group(); core.name = "core"; grp.add(core);
    core.add(new THREE.Mesh(G("coreS", () => merge([tf(Cyl(1.6, 1.95, 0.5, 8), 0, 0.25), tf(Cyl(1.05, 1.3, 0.45, 8), 0, 0.72), tf(Cyl(0.55, 0.75, 0.3, 8), 0, 1.1)])), stoneM()));
    a.coreN = M("coreN", () => new THREE.MeshBasicMaterial({ color: hdr(CY, 1.6) })); a.coreG = M("coreG", () => new THREE.MeshStandardMaterial({ color: CY, emissive: CY, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.1, flatShading: true }));
    core.add(new THREE.Mesh(G("coreNG", () => merge([flatTor(1.62, 0.05, 0.5), flatTor(1.08, 0.045, 0.95), flatTor(2.3, 0.05, 0.07, 64)])), a.coreN));
    const octa = G("octa", () => new THREE.OctahedronGeometry(1, 0));
    a.cry = new THREE.InstancedMesh(octa, a.coreG, 3); a.cry.frustumCulled = false; a.inst.push(a.cry); core.add(a.cry);
    a.crack = new THREE.Mesh(octa, M("crackM", () => new THREE.MeshBasicMaterial({ color: hdr(0xffffff, 1.4), map: tex("crack"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))); a.crack.visible = false; core.add(a.crack);
    a.beam = new THREE.Mesh(G("beam", () => Cyl(0.75, 1.1, 8, seg(20), 1, true)), sm("beam", { uColor: { value: hdr(CY, 1.3) }, uK: { value: 1 } }, UV_VERT, `${H} uniform vec3 uColor; uniform float uK;
      void main(){ float v = vUv.y, e = 1.0 - abs(dot(vN, vV)); float a = smoothstep(0.0, 0.12, v) * pow(1.0 - v, 1.5) * (0.12 + 0.55 * e * e) * (0.85 + 0.15 * sin(v * 18.0 - uTime * 3.0));
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.3 * (1.0 - v)), a * uK); }`, { add: true }));
    a.beam.position.y = 4.6; core.add(a.beam);
    a.shock = new THREE.Mesh(flatPlane(), ringMat("coreShock", CY)); a.shock.position.y = 0.12; a.shock.visible = false; core.add(a.shock);
    const NS = low ? 8 : coarse ? 14 : 28; a.ns = NS; a.sv = new Float32Array(NS * 4);
    for (let i = 0; i < NS; i++) { const an = Math.random() * TAU, sp = 2 + Math.random() * 3.5; a.sv.set([Math.cos(an) * sp, 2.5 + Math.random() * 4, Math.sin(an) * sp, 0.6 + Math.random() * 0.8], i * 4); }
    a.shards = new THREE.InstancedMesh(G("shard", () => new THREE.TetrahedronGeometry(0.22, 0)), a.coreG, NS); a.shards.visible = false; a.shards.frustumCulled = false; a.inst.push(a.shards); core.add(a.shards);
    // dust rings for rise(): a small pool, each its own material (uR/uFade differ)
    a.dust = []; for (let i = 0, k = low ? 1 : coarse ? 2 : 3; i < k; i++) { const m = new THREE.Mesh(flatPlane(), ringMat("dust" + i, 0xcfe8ff)); m.visible = false; m.userData.t = -1; grp.add(m); a.dust.push(m); }
    coreCol.setHex(CY); coreTgt.setHex(CY); placeCrystals(0);
    return { group: grp, pads: a.pads, core };
  }
  function placeCrystals(t) { const c = A.cry, r = A.rot;
    D.position.set(0, 2.55, 0); D.rotation.set(0, r, 0); D.scale.set(0.8, 1.45, 0.8); D.updateMatrix(); c.setMatrixAt(0, D.matrix);
    if (A.crack.visible) { A.crack.position.copy(D.position); A.crack.rotation.copy(D.rotation); A.crack.scale.set(0.82, 1.48, 0.82); }
    const b1 = -r * 0.85, b2 = r * 1.1 + Math.PI, bob = reduce ? 0 : Math.sin(t * 1.3) * 0.12;
    D.position.set(Math.cos(b1) * 1.35, 2.2 + bob, Math.sin(b1) * 1.35); D.rotation.set(0, -r * 1.8, 0); D.scale.set(0.3, 0.55, 0.3); D.updateMatrix(); c.setMatrixAt(1, D.matrix);
    D.position.set(Math.cos(b2) * 1.15, 3.15 - bob, Math.sin(b2) * 1.15); D.rotation.set(0, r * 2.2, 0); D.scale.set(0.25, 0.45, 0.25); D.updateMatrix(); c.setMatrixAt(2, D.matrix);
    c.instanceMatrix.needsUpdate = true; }
  function setPad(i, s) { if (!A || i < 0 || i >= A.pads.length) return; padS[i] = PAD_RIM[s] ? s : "empty"; const r = PAD_RIM[padS[i]], p = PAD_PLUS[padS[i]];
    A.rim.setColorAt(i, C0.setHex(r[0]).multiplyScalar(r[1])); A.rim.instanceColor.needsUpdate = true;
    A.plus.setColorAt(i, C0.setHex(p[0]).multiplyScalar(p[1])); A.plus.instanceColor.needsUpdate = true; placePlus(i, 0); A.plus.instanceMatrix.needsUpdate = true; }
  function placePlus(i, t) { const p = A.padP[i], s = padS[i], k = s === "used" ? 0 : s === "sel" ? 1.2 : s === "can" ? 1 : 0.8, still = low || reduce;
    D.position.set(p.x, 1.05 + (still ? 0 : Math.sin(t * 2 + i) * 0.08), p.z); D.rotation.set(0, (still ? 0 : t * 1.2) + i, 0); D.scale.setScalar(k || 1e-4); D.updateMatrix(); A.plus.setMatrixAt(i, D.matrix); }
  function wallHit(angle) { const i = hitI++ & 3; hitA.setComponent(i, angle); hitK.setComponent(i, reduce ? 0.6 : 1.2); }
  function setPortals(level) { if (A) A.pt = Math.max(0, Math.min(1, +level || 0)); }
  function setCore(f, hit) { if (!A || A.broken) return; f = Math.max(0, Math.min(1, +f || 0)); coreTgt.setHex(f > 0.3 ? CY : f > 0.12 ? GOLD : RED); A.crackT = Math.max(0, Math.min(1, (0.75 - f) / 0.75));
    if (hit && !reduce) { A.flash = 1; A.shockT = 0; A.shockBig = false; } }
  function coreBreak() { if (!A || A.broken) return; A.broken = true; A.breakT = 0; A.cry.visible = false; A.crack.visible = false; A.shards.visible = true; if (!reduce) { A.shockT = 0; A.shockBig = true; } }
  function arenaTick(dt, t) {
    const a = A, tt = U.uTime.value;
    // pads: the plus bobs and turns; the selected rim pulses
    if (!low) { for (let i = 0; i < a.pads.length; i++) if (padS[i] !== "used") placePlus(i, tt); a.plus.instanceMatrix.needsUpdate = true; }
    if (!reduce) for (let i = 0; i < a.pads.length; i++) if (padS[i] === "sel") { a.rim.setColorAt(i, C0.setHex(GOLD).multiplyScalar(1.7 + Math.sin(t * 5) * 0.6)); a.rim.instanceColor.needsUpdate = true; }
    // wall hits fade
    for (let i = 0; i < 4; i++) { const k = hitK.getComponent(i); if (k > 0) hitK.setComponent(i, Math.max(0, k - dt * (reduce ? 1.2 : 2.2))); }
    // portals ease open; neon violet → red
    a.po += (a.pt - a.po) * Math.min(1, dt * 2.5); const po = a.po, pul = reduce ? 1 : 1 + Math.sin(t * 6) * 0.15 * po;
    a.psw.material.uniforms.uOpen.value = po; a.lanes.material.uniforms.uHot.value = po;
    a.pne.material.color.setHex(VI).lerp(C1.setHex(RED), po).multiplyScalar((1.2 + po * 1.1) * pul); a.pfr.material.emissiveIntensity = 0.25 + po * 0.8;
    // the Core
    if (!a.broken) { a.rot += dt * 0.6 * mo; placeCrystals(tt);
      coreCol.lerp(coreTgt, Math.min(1, dt * 4)); a.flash = Math.max(0, a.flash - dt * 3);
      C0.copy(coreCol).lerp(C1.setHex(RED), a.flash); a.coreG.color.copy(C0).multiplyScalar(0.6); a.coreG.emissive.copy(C0); a.coreG.emissiveIntensity = 0.9 + a.flash * 2.2;
      a.coreN.color.copy(C0).multiplyScalar(1.6 + a.flash * 1.5); a.beam.material.uniforms.uColor.value.copy(C0).multiplyScalar(1.3); a.beam.material.uniforms.uK.value = 1 + a.flash;
      a.crackK += (a.crackT - a.crackK) * Math.min(1, dt * 3); a.crack.visible = a.crackK > 0.03; if (a.crack.visible) a.crack.material.opacity = a.crackK * 0.8 + a.flash * 0.6; }
    else if (a.breakT >= 0) { a.breakT += dt; const bt = a.breakT, sl = reduce ? 0.3 : 1, sv = a.sv, ub = a.beam.material.uniforms.uK;
      ub.value = Math.max(0, 1 - bt * 1.5); a.beam.visible = ub.value > 0;
      for (let i = 0; i < a.ns; i++) { const s = bt * sl, y = Math.max(0.15, 2.5 + sv[i * 4 + 1] * s - 4.9 * s * s), k = Math.max(0, 1 - Math.max(0, bt - 1.2) / 0.6);
        D.position.set(sv[i * 4] * s, y, sv[i * 4 + 2] * s); D.rotation.set(bt * 6 * sv[i * 4 + 3], bt * 4, 0); D.scale.setScalar(sv[i * 4 + 3] * k + 1e-4); D.updateMatrix(); a.shards.setMatrixAt(i, D.matrix); }
      a.shards.instanceMatrix.needsUpdate = true; if (bt > 1.8) { a.shards.visible = false; a.breakT = -1; } }
    if (a.shockT >= 0) { a.shockT += dt; const dur = a.shockBig ? 1.1 : 0.6, k = a.shockT / dur, u = a.shock.material.uniforms; a.shock.visible = k < 1;
      a.shock.scale.setScalar(a.shockBig ? 22 : 2 * a.AR.coreR); u.uR.value = 0.15 + 0.85 * k; u.uFade.value = 1 - k; u.uColor.value.copy(coreCol).lerp(C1.setHex(RED), 0.5).multiplyScalar(1.6); if (k >= 1) a.shockT = -1; }
    for (const m of a.dust) { const u = m.userData; if (u.t < 0) continue; u.t += dt; const k = u.t / 0.55; m.visible = k < 1; m.material.uniforms.uR.value = 0.2 + 0.8 * k; m.material.uniforms.uFade.value = (1 - k) * 0.9; if (k >= 1) u.t = -1; }
  }
  function clearArena() { if (!A) return; if (A.grp.parent) A.grp.parent.remove(A.grp); for (const m of A.inst) m.dispose(); A = null; }

  // ================= towers =================
  const live = [];
  const YB = [0.32, 0.38, 0.58]; // a base's top per level
  const baseGeos = (l) => [tf(Cyl(0.5 + l * 0.15, 0.62 + l * 0.17, YB[l] - (l > 1 ? 0.16 : 0), 6), 0, (YB[l] - (l > 1 ? 0.16 : 0)) / 2), l > 1 && tf(Cyl(0.62, 0.74, 0.16, 6), 0, YB[l] - 0.08)];
  const band = (l) => l > 0 && flatTor(0.74 + (l > 1 ? 0.12 : 0), 0.05, l > 1 ? 0.3 : YB[l] - 0.04, 28);
  const crown = (y, r) => { const L = [flatTor(r, 0.035, y, 28)]; for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; L.push(tf(new THREE.ConeGeometry(0.07, 0.32, 5), Math.cos(an) * r, y + 0.14, Math.sin(an) * r, 0, -an, -0.35)); } return merge(L); };
  const mesh = (geo, mat, parent, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; parent.add(m); return m; };
  function tower(id, lvl) {
    if (!KC[id]) id = "shock"; const l = Math.max(1, Math.min(3, lvl | 0 || 1)) - 1, c = KC[id], yb = YB[l];
    const g = new THREE.Group(); g.name = "tower-" + id; const muzzle = new THREE.Object3D();
    const u = g.userData = { kind: id, lvl: l + 1, head: null, muzzle, spin: null, spinV: 0, hy: 0, ph: Math.random() * TAU, aimY: 0, aimOn: false, riseT: -1, fT: 0, boost: 0, flash: null, decal: null, seen: false };
    u.fire = () => { u.boost = 1; if (!reduce && u.flash) u.fT = 0.12; };
    let cy = 0, cr = 0.5; // the crown's height and reach (Lv3)
    if (id === "shock") { // tesla coil: column with neon coils, an orb that aims a prong, spinning rings
      const ch = 1.0 + l * 0.15, hy = yb + ch + 0.28;
      mesh(G("shS" + l, () => merge([...baseGeos(l), tf(Cyl(0.13, 0.2, ch, 8), 0, yb + ch / 2)])), stoneM(), g);
      mesh(G("shN" + l, () => { const L = [band(l)]; for (let k = 0, n = l + 2; k < n; k++) L.push(flatTor(0.27 - k * 0.03, 0.04, yb + ((k + 1) * ch) / (n + 1), 20)); return merge(L); }), neonM(c), g);
      const head = u.head = new THREE.Group(); head.position.y = hy; g.add(head);
      mesh(G("shH" + l, () => merge([new THREE.SphereGeometry(0.3 + l * 0.05, seg(14), seg(10)), tf(new THREE.ConeGeometry(0.08, 0.42, 6), 0, 0, 0.42 + l * 0.05, PI2)])), glassM(c, 1.3), head);
      const rings = mesh(G("shR" + l, () => merge([0, 1, 2].slice(0, Math.min(3, l + 1)).map((k) => tf(Tor(0.55 + l * 0.06 + k * 0.08, 0.028, 4, 32), 0, 0, 0, PI2 + (k - 1) * 0.6, k * 1.1)))), neonM(c, 2.2), g, hy);
      u.spin = rings; u.spinV = 1.6; muzzle.position.set(0, 0, 0.62 + l * 0.05); head.add(muzzle); cy = hy - 0.5; cr = 0.42;
    } else if (id === "frost") { // three stone claws hold a floating, spinning ice crystal; a frost decal on the floor
      const hy = yb + 1.15 + l * 0.1;
      mesh(G("frS" + l, () => { const L = baseGeos(l); for (let k = 0; k < 3; k++) { const an = (k / 3) * TAU; L.push(tf(Box(0.12, 0.75, 0.12), Math.cos(an) * 0.33, yb + 0.33, Math.sin(an) * 0.33, 0, -an, -0.3)); } return merge(L); }), stoneM(), g);
      mesh(G("frN" + l, () => merge([band(l), flatTor(0.4, 0.035, yb + 0.66, 24)])), neonM(c), g);
      const head = u.head = new THREE.Group(); head.position.y = u.hy = hy; g.add(head);
      u.spin = mesh(G("frC" + l, () => { const s = 0.36 + l * 0.06, L = [tf(new THREE.OctahedronGeometry(1, 0), 0, 0, 0, 0, 0, 0, s, s * 1.7, s)]; if (l) for (const x of [-1, 1]) L.push(tf(new THREE.OctahedronGeometry(1, 0), x * (s + 0.25), -0.1, 0, 0, 0, 0, 0.12, 0.24, 0.12)); return merge(L); }), glassM(c, 1.1), head);
      u.spinV = 1.2; head.add(muzzle);
      const r = FR[l] || 5.4; u.decal = mesh(flatPlane(), M("frostDecal", () => new THREE.MeshBasicMaterial({ color: hdr(c, 1.0), map: tex("snow"), transparent: true, opacity: 0.32, depthWrite: false })), g, 0.06);
      u.decal.scale.set(r * 2, 1, r * 2); u.decal.renderOrder = -1; cy = yb + 0.02; cr = 0.62 + l * 0.12;
    } else if (id === "flame") { // a brazier on a short post: bowl and spout aim, the flame flickers in its shader
      const hy = yb + 0.5;
      mesh(G("flS" + l, () => merge([...baseGeos(l), tf(Cyl(0.22, 0.3, 0.5, 6), 0, yb + 0.25)])), stoneM(), g);
      if (l) mesh(G("flN" + l, () => merge([band(l)])), neonM(c), g);
      const head = u.head = new THREE.Group(); head.position.y = hy; g.add(head); const br = 0.5 + l * 0.07;
      mesh(G("flH" + l, () => merge([tf(Cyl(br, 0.3, 0.38, 10), 0, 0.19), tf(Cyl(0.07, 0.11, 0.45, 8), 0, 0.22, br + 0.12, PI2), flatTor(br, 0.04, 0.38, 24)])), metalM(), head);
      mesh(G("flF" + l, () => new THREE.ConeGeometry(br * 0.72, 0.95 + l * 0.25, 10, 4, true)), flameMat(), head, 0.36 + (0.95 + l * 0.25) / 2);
      muzzle.position.set(0, 0.22, br + 0.38); head.add(muzzle); cy = yb + 0.02; cr = 0.7 + l * 0.08;
    } else { // barrier: plinth, pylons (Lv2+), a hex energy wall that cracks with setHp
      const w = [2.1, 2.4, 2.7][l], h = [1.3, 1.6, 1.9][l], px = w / 2 + 0.05, ph = h + 0.35;
      mesh(G("baS" + l, () => merge([tf(Box(w + 0.2, 0.3, 0.7), 0, 0.15), l && tf(Box(0.32, ph, 0.32), -px, 0.3 + ph / 2), l && tf(Box(0.32, ph, 0.32), px, 0.3 + ph / 2)])), stoneM(), g);
      mesh(G("baN" + l, () => merge([tf(Box(w, 0.05, 0.05), 0, 0.31, 0.3), tf(Box(w, 0.05, 0.05), 0, 0.31, -0.3), l && tf(Box(0.36, 0.08, 0.36), -px, 0.3 + ph), l && tf(Box(0.36, 0.08, 0.36), px, 0.3 + ph)])), neonM(c), g);
      const sh = u.head = mesh(G("baW" + l, () => new THREE.PlaneGeometry(w, h)), shieldMat(0), g, 0.32 + h / 2); u.stage = 0;
      u.setHp = (f) => { const s = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3; if (s !== u.stage) { u.stage = s; sh.material = shieldMat(s); } };
      muzzle.position.set(0, 0.32 + h, 0); g.add(muzzle);
      if (l === 2) mesh(G("baC", () => merge([-1, 1].map((x) => tf(new THREE.OctahedronGeometry(0.2, 0), x * px, 0.3 + ph + 0.3, 0, 0, 0, 0, 1, 1.6, 1)))), goldM(), g);
    }
    if (l === 2 && id !== "barrier") { mesh(G("cr" + id, () => crown(cy, cr)), goldM(), g); if (!low) { const au = mesh(flatPlane(), glowM(c, 0.42), g, 0.05); au.scale.set(3, 1, 3); au.renderOrder = -1; u.aura = au; } }
    if (!reduce && !low) { const f = u.flash = new THREE.Sprite(M("flash" + c, () => new THREE.SpriteMaterial({ map: tex("glow"), color: hdr(c, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))); f.visible = false; muzzle.add(f); }
    live.push(g); return g;
  }
  function flameMat() { return sm("flame", {}, `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec3 p = position; float k = uv.y, s = modelMatrix[3].x * 3.1 + modelMatrix[3].z * 1.7;
      p.x += sin(uTime * 9.0 + k * 5.0 + s) * 0.07 * k; p.z += cos(uTime * 7.3 + k * 4.0 + s) * 0.06 * k; p.xz *= 1.0 + sin(uTime * 13.0 + s) * 0.06 * (1.0 - k);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`, `${NOISE} uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ float k = vUv.y, n = vnoise(vec2(vUv.x * 8.0, k * 4.0 - uTime * 3.0)), fr = abs(dot(vN, vV));
      vec3 col = mix(vec3(2.2, 1.9, 0.9), vec3(2.0, 0.6, 0.15), smoothstep(0.0, 0.55, k)); col = mix(col, vec3(1.4, 0.2, 0.15), smoothstep(0.55, 1.0, k));
      gl_FragColor = vec4(col, (0.55 + 0.45 * n) * (1.0 - smoothstep(0.5, 1.0, k + n * 0.25)) * (0.4 + 0.6 * fr)); }`, { side: THREE.FrontSide }); }
  function shieldMat(s) { return sm("shield" + s, { uCrack: { value: [0, 0.35, 0.65, 1][s] }, uColor: { value: hdr(KC.barrier, 1.3) } }, UV_VERT, `${NOISE} ${H} uniform float uCrack; uniform vec3 uColor;
    void main(){ vec2 id; float d = hx(vP.xy / 0.34, id), h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
      float edge = smoothstep(0.38, 0.48, d), scan = smoothstep(0.88, 1.0, fract(vUv.y - uTime * 0.4)), broken = step(h, uCrack * 0.5);
      float bord = 1.0 - smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
      float cl = (1.0 - smoothstep(0.0, 0.035, abs(fbm(vP.xy * 1.8 + 3.0) - 0.5))) * step(0.01, uCrack);
      vec3 col = mix(uColor, vec3(1.8, 0.4, 0.5), uCrack * 0.6) + cl * uCrack * vec3(1.5, 0.6, 0.4);
      gl_FragColor = vec4(col, ((0.16 + edge * 0.45 + scan * 0.2 + bord * 0.6) * (1.0 - broken * 0.85) + cl * uCrack * 0.9) * (0.65 + 0.35 * (1.0 - vUv.y))); }`); }

  // root-local position and summed yaw of a tower (its ancestors up to the arena root)
  let _x = 0, _z = 0, _ry = 0;
  function lp(g) { _x = 0; _z = 0; _ry = 0; for (let o = g; o && o !== artRoot; o = o.parent) { _x += o.position.x; _z += o.position.z; _ry += o.rotation.y; } }
  function rise(g) { const u = g.userData; if (reduce) { g.scale.setScalar(1); return; } u.riseT = 0; g.scale.setScalar(1e-3);
    if (!A || !g.parent) return; let m = null; for (const d of A.dust) if (d.userData.t < 0) { m = d; break; } if (!m) return;
    lp(g); m.position.set(_x, 0.08, _z); m.scale.setScalar(u.kind === "barrier" ? 4.2 : 3.2); m.userData.t = 0; m.visible = true; }
  function aim(g, x, z) { const u = g.userData; if (!u.head || u.kind === "barrier") return; lp(g); if (artRoot && artRoot.parent) { _x += artRoot.position.x; _z += artRoot.position.z; }
    u.aimY = wrap(Math.atan2(x - _x, z - _z) - _ry); u.aimOn = true; }
  function drop(g) { const i = live.indexOf(g); if (i >= 0) { live[i] = live[live.length - 1]; live.pop(); } }
  function towerTick(g, u, dt, t) {
    if (u.riseT >= 0) { u.riseT += dt; const k = u.riseT / 0.5; g.scale.setScalar(k < 1 ? Math.max(1e-3, easeBack(k)) : 1); if (k >= 1) u.riseT = -1; }
    const h = u.head;
    if (u.aimOn && h) h.rotation.y += wrap(u.aimY - h.rotation.y) * Math.min(1, dt * 7);
    if (u.boost > 0) u.boost = Math.max(0, u.boost - dt * 2.5);
    if (u.spin) u.spin.rotation.y += dt * u.spinV * mo * (1 + u.boost * 4);
    if (u.kind === "frost" && !low && !reduce) h.position.y = u.hy + Math.sin(t * 2 + u.ph) * 0.08;
    if (u.decal && !low) u.decal.rotation.y += dt * 0.15 * mo;
    if (u.flash) { if (u.fT > 0) { u.fT -= dt; u.flash.visible = u.fT > 0; u.flash.scale.setScalar(0.5 + 1.3 * Math.max(0, u.fT) / 0.12); } else if (u.flash.visible) u.flash.visible = false; }
  }

  // ================= the loop =================
  let auraT = 0; const KK = Object.keys(KC0);
  function tick(dt, t) {
    if (!(dt > 0)) return; if (dt > 0.1) dt = 0.1; U.uTime.value += dt * mo;
    if (A) arenaTick(dt, t);
    for (let i = live.length - 1; i >= 0; i--) { const g = live[i], u = g.userData; if (!g.parent) { if (u.seen) { live[i] = live[live.length - 1]; live.pop(); } continue; } u.seen = true; towerTick(g, u, dt, t); }
    if (!low && !reduce && (auraT += dt) > 0.05) { auraT = 0; for (let i = 0; i < KK.length; i++) { const m = mC.get("glow" + KC[KK[i]]); if (m) m.opacity = 0.34 + Math.sin(t * 2.2) * 0.1; } }
  }
  function dispose() {
    clearArena(); live.length = 0; artRoot = null;
    for (const g of gC.values()) g.dispose(); for (const m of mC.values()) m.dispose(); for (const x of tC.values()) x.dispose(); gC.clear(); mC.clear(); tC.clear();
  }
  return { arena, setPad, wallHit, setPortals, setCore, coreBreak, tower, rise, aim, drop, tick, dispose, get pads() { return A ? A.pads : []; } };
}
