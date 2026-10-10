// world-kit.js — the 3D pieces of ARCIRCLE World, shared by the home gate (arc-gate.js → world-gate.js) and the
// game (/play → world-play.js). ES module; three.js r169 is vendored under /vendor/three (MIT).
//
//   the planet      a small faceted world, radius R, with crystals and trees
//   the halo        the ARCIRCLE mark at world scale: a blue and a green ring, linked, the planet at their heart
//   the robot       the player: a hover robot whose head wears the two rings
//   the shops       one building per real utility (Launchpad = ArcPad launch, Exchange = Swap, …)
//   the scammers    stage enemies; v0 has the first one, the Phisher
//   the kit         Quaternius "Sci-Fi Essentials Kit" models (CC0, /models/world): props around the shops, the
//                   enemy robots the scammers wear, key cards to collect
import * as THREE from "./vendor/three/three-0.169.0.module.min.js";
import { RoomEnvironment } from "./vendor/three/addons/RoomEnvironment.js";
import { EffectComposer } from "./vendor/three/addons/EffectComposer.js";
import { RenderPass } from "./vendor/three/addons/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/addons/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/addons/OutputPass.js";
import { RoundedBoxGeometry } from "./vendor/three/addons/RoundedBoxGeometry.js";
import { GLTFLoader } from "./vendor/three/addons/GLTFLoader.js";
import { MeshoptDecoder } from "./vendor/three/addons/meshopt_decoder.module.js";
import * as SkeletonUtils from "./vendor/three/addons/SkeletonUtils.js";

export { THREE };
export const R = 22;
export const C = {
  space: 0x04060a, ground: 0x10303a, ground2: 0x163f48, ground3: 0x0c252e,
  blue: 0x3f9bff, cyan: 0x35d8d0, green: 0x39ff88, gold: 0xffc861, ink: 0xeef3f7,
  panel: 0x172131, panel2: 0x0e1520, purple: 0xb48cff, pink: 0xff7ad9, scam: 0xff4d6d,
};
const UP = new THREE.Vector3(0, 1, 0);

// One shop per real utility. theta: degrees from the spawn point (north pole); phi: degrees around it.
export const SHOPS = [
  { id: "launch", name: "Launchpad", url: "/arc#launch", color: C.green, shape: "rocket", theta: 28, phi: 0,
    line: "Launch a real coin on ArcPad for 1 USDC. A real pool from the first block." },
  { id: "quantum", name: "Quantum Lab", url: "/arc#quantum", color: C.purple, shape: "orb", theta: 34, phi: 40,
    line: "Announce a launch, collect commits, collapse it: everyone gets the same price." },
  { id: "swap", name: "Exchange", url: "/arc#swap", color: C.cyan, shape: "coin", theta: 28, phi: 80,
    line: "Swap any Arc token with $ARCIRCLE or USDC. 0.1% fee, half of it burned." },
  { id: "orders", name: "Order House", url: "/arc#orders", color: C.blue, shape: "clock", theta: 34, phi: 120,
    line: "Limit, stop-loss, take-profit and DCA orders. Sign once, no gas until a fill." },
  { id: "staking", name: "Bank", url: "/arc#staking", color: C.gold, shape: "dome", theta: 28, phi: 160,
    line: "Lock $ARCIRCLE for veARCIRCLE and share the platform's fees." },
  { id: "locker", name: "Vault", url: "/arc#locker", color: C.gold, shape: "vault", theta: 34, phi: 200,
    line: "Lock tokens or LP until a date. Locks can only be pushed later, never earlier." },
  { id: "scanner", name: "Scanner Tower", url: "/arc#scanner", color: C.cyan, shape: "dish", theta: 28, phi: 240,
    line: "Safety-scan any token before you buy. Your best weapon against scammers." },
  { id: "predict", name: "Oracle", url: "/arc#predict", color: C.purple, shape: "obelisk", theta: 34, phi: 280,
    line: "Call UP or DOWN on a coin, up to $5 a round." },
  { id: "arcia", name: "ARCIA Studio", url: "/arcia", color: C.pink, shape: "stage", theta: 28, phi: 320,
    line: "Arc's AI idol. Ask her anything about a coin, a wallet or this world." },
];
export const PORTAL = { id: "platform", name: "Platform World", theta: 15, phi: 140 };

export function dirOf(thetaDeg, phiDeg) {
  const t = THREE.MathUtils.degToRad(thetaDeg), p = THREE.MathUtils.degToRad(phiDeg);
  return new THREE.Vector3(Math.sin(t) * Math.sin(p), Math.cos(t), -Math.sin(t) * Math.cos(p)).normalize();
}
// stand an object on the planet at dir, its +Z (front) facing the spawn point
export function placeOn(obj, dir, r = R) {
  obj.position.copy(dir).multiplyScalar(r);
  const toPole = UP.clone().sub(dir.clone().multiplyScalar(UP.dot(dir)));
  if (toPole.lengthSq() < 1e-6) toPole.set(0, 0, 1);
  obj.up.copy(dir);
  obj.lookAt(obj.position.clone().add(toPole.normalize()));
}

// ---------------- renderer + post ----------------
export function quality() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const low = (coarse && cores <= 6) || cores <= 2 || /Android [4-8]\b/.test(navigator.userAgent);
  return { coarse, low, dpr: Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75), bloom: !low };
}
export function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
export function makeStage(canvas, opts = {}) {
  const q = quality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.low, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(q.dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.space);
  scene.fog = new THREE.FogExp2(C.space, opts.fog ?? 0.006);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 50, 1, 0.1, 1200);
  scene.add(new THREE.HemisphereLight(0x9fd0ff, 0x0b1a14, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(30, 60, 40); scene.add(sun); scene.add(sun.target);
  // soft shadows around the robot (it always stands at the top of the world, so one fixed shadow box covers it)
  if (opts.shadows && !q.low) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    sun.position.set(14, R + 34, 18); sun.target.position.set(0, R, -4);
    const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 5; sc.far = 90; sc.updateProjectionMatrix();
  }
  const rim = new THREE.DirectionalLight(0x39ff88, 0.7); rim.position.set(-40, -10, -30); scene.add(rim);
  let composer = null;
  if (q.bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), opts.bloom ?? 0.75, 0.55, 0.78));
    composer.addPass(new OutputPass());
  }
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const updates = new Set();
  const clock = new THREE.Clock();
  let raf = 0, running = true;
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    updates.forEach((fn) => fn(dt, t));
    if (composer) composer.render(); else renderer.render(scene, camera);
  }
  frame();
  document.addEventListener("visibilitychange", () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; clock.getDelta(); frame(); } });
  return {
    THREE, scene, camera, renderer, sun, quality: q, on: (fn) => (updates.add(fn), () => updates.delete(fn)),
    dispose() { running = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }); },
  };
}

// ---------------- materials ----------------
const glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.1 });
const solid = (color, { flat, ...o } = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, flatShading: !!flat, ...o });
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.15, ...o });

// a crisp text label that always faces the camera
export function label(text, { color = "#eef3f7", accent = "#39ff88", size = 1, sub = "" } = {}) {
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = sub ? 300 : 220;
  const g = cv.getContext("2d");
  g.font = "700 92px Sora, system-ui, sans-serif";
  const w = Math.min(980, g.measureText(text).width + 120);
  const x0 = (1024 - w) / 2, h = 150, y0 = 20, r = 75;
  g.fillStyle = "rgba(6,10,16,.78)"; g.beginPath(); g.roundRect(x0, y0, w, h, r); g.fill();
  g.lineWidth = 6; g.strokeStyle = accent; g.stroke();
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 512, y0 + h / 2 + 4);
  if (sub) { g.font = "600 58px Sora, system-ui, sans-serif"; g.fillStyle = accent; g.fillText(sub, 512, y0 + h + 66); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(5.2 * size, 5.2 * size * cv.height / 1024, 1);
  sp.renderOrder = 10;
  return sp;
}

// ---------------- the planet ----------------
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function makePlanet() {
  const g = new THREE.Group(); g.name = "planet";
  const geo = new THREE.IcosahedronGeometry(R, 5); // already non-indexed: one colour per face
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), rnd = rand(42);
  const cA = new THREE.Color(C.ground), cB = new THREE.Color(C.ground2), cC = new THREE.Color(C.ground3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const k = rnd(); c.copy(k < 0.55 ? cA : k < 0.85 ? cB : cC);
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.05 })));
  // a faint atmosphere
  g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.05, side: THREE.BackSide, depthWrite: false })));
  // the plaza ring around the spawn point and the path ring the shops sit on
  // the plaza: a spherical cap that follows the ground (a flat disc would float off the curve)
  const cap = THREE.MathUtils.degToRad(11);
  const plaza = new THREE.Mesh(new THREE.SphereGeometry(R + 0.05, 64, 6, 0, Math.PI * 2, 0, cap), solid(0x112a33, { roughness: 0.85, metalness: 0.1 }));
  plaza.receiveShadow = true; g.add(plaza);
  const plazaRing = new THREE.Mesh(new THREE.TorusGeometry((R + 0.08) * Math.sin(cap), 0.05, 8, 128), glow(C.cyan, 1.1));
  plazaRing.rotation.x = Math.PI / 2; plazaRing.position.y = (R + 0.08) * Math.cos(cap); g.add(plazaRing);
  // crystals and trees scattered where the shops aren't
  const crystal = new THREE.ConeGeometry(0.45, 1.8, 5), trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), crown = new THREE.IcosahedronGeometry(0.75, 0);
  const crysMats = [glow(C.cyan, 1.2), glow(C.green, 1.1), glow(C.blue, 1.2)], trunkMat = solid(0x3a2c22), crownMats = [solid(0x1f6b55, { flat: true }), solid(0x23806a, { flat: true }), solid(0x2a5e7a, { flat: true })];
  const rr = rand(7);
  for (let i = 0; i < 150; i++) {
    const th = 14 + rr() * 166, ph = rr() * 360;
    if (SHOPS.some((s) => angDist(th, ph, s.theta, s.phi) < 9)) continue;
    if (angDist(th, ph, PORTAL.theta, PORTAL.phi) < 6) continue;
    const d = dirOf(th, ph), o = new THREE.Group();
    if (rr() < 0.35) { const m = new THREE.Mesh(crystal, crysMats[i % 3]); m.position.y = 0.7; m.rotation.z = (rr() - 0.5) * 0.4; o.add(m); }
    else { const t = new THREE.Mesh(trunk, trunkMat); t.position.y = 0.4; const cr = new THREE.Mesh(crown, crownMats[i % 3]); cr.position.y = 1.15; cr.scale.setScalar(0.8 + rr() * 0.6); o.add(t, cr); }
    placeOn(o, d, R - 0.05); o.rotateY(rr() * 6.28); o.scale.setScalar(0.8 + rr() * 0.7); g.add(o);
  }
  return g;
}
function angDist(t1, p1, t2, p2) { return THREE.MathUtils.radToDeg(dirOf(t1, p1).angleTo(dirOf(t2, p2))); }

// ---------------- the halo: the ARCIRCLE mark at world scale ----------------
export function makeHalo(scale = 1) {
  const g = new THREE.Group(); g.name = "halo";
  // linked like the logo, but kept clear of the ground: the closest point of either ring is rr - d from the centre
  const rr = R * 2.8 * scale, tube = R * 0.1 * scale, d = rr * 0.5;
  const ring = (color, emissive) => new THREE.Mesh(new THREE.TorusGeometry(rr, tube, 28, 160), glossy(color, { emissive, emissiveIntensity: 0.9 }));
  const a = ring(0x2f86ff, 0x1d63d6), b = ring(0x2ee07a, 0x17a85a);
  a.position.x = -d; b.position.x = d; b.rotation.x = Math.PI / 2;
  g.add(a, b);
  g.userData.rings = [a, b];
  return g;
}

export function makeStars(n = 1400) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), rnd = rand(3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * 6.283, r = 420 + rnd() * 200, s = Math.sqrt(1 - u * u);
    p.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false }));
}

// ---------------- the robot ----------------
export function makeRobot() {
  const g = new THREE.Group(); g.name = "robot";
  const shell = glossy(0xe9f1f7, { metalness: 0.35, roughness: 0.28 });
  const dark = glossy(0x0b1220, { metalness: 0.5, roughness: 0.2 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.95, 0.72, 4, 0.22), shell); body.position.y = 1.0;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.02), glow(C.cyan, 2.4)); chest.position.set(0, 1.08, 0.37);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 32, 24), dark); head.position.y = 1.86;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.465, 32, 12, -0.9, 1.8, 1.25, 0.55), glossy(0x10263a, { emissive: 0x0a3550, emissiveIntensity: 0.6 }));
  visor.position.y = 1.86; visor.rotation.y = Math.PI;
  const eyeGeo = new THREE.CapsuleGeometry(0.055, 0.1, 4, 8), eyeMat = glow(C.green, 3);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat), eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.15, 1.9, 0.42); eyeR.position.set(0.15, 1.9, 0.42);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12), dark); neck.position.y = 1.52;
  // the two rings of the mark, as its crown
  const crown = new THREE.Group(); crown.position.y = 2.55;
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 12, 40), glow(C.blue, 2.6));
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 12, 40), glow(C.green, 2.4));
  r1.position.x = -0.13; r2.position.x = 0.13; r2.rotation.x = Math.PI / 2; crown.add(r1, r2);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), dark); antenna.position.y = 2.36;
  const armGeo = new THREE.CapsuleGeometry(0.11, 0.42, 4, 10);
  const armL = new THREE.Group(), armR = new THREE.Group();
  const aL = new THREE.Mesh(armGeo, shell), aR = new THREE.Mesh(armGeo, shell); aL.position.y = -0.28; aR.position.y = -0.28;
  const hL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), dark), hR = hL.clone(); hL.position.y = -0.58; hR.position.y = -0.58;
  armL.add(aL, hL); armR.add(aR, hR); armL.position.set(-0.6, 1.28, 0); armR.position.set(0.6, 1.28, 0);
  // hover jet instead of legs
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.2, 0.26, 20), dark); skirt.position.y = 0.42;
  const jet = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 10, 32), glow(C.cyan, 3)); jet.position.y = 0.28; jet.rotation.x = Math.PI / 2;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03;
  const rig = new THREE.Group();
  rig.add(body, chest, head, visor, eyeL, eyeR, neck, crown, antenna, armL, armR, skirt, jet);
  g.add(rig, shadow);
  g.userData = { rig, crown, armL, armR, eyes: [eyeL, eyeR], jet, shadow, blink: 0 };
  return g;
}
// speed 0..1, turn -1..1
export function animateRobot(rb, dt, t, speed = 0, turn = 0) {
  const u = rb.userData;
  u.rig.position.y = 0.12 + Math.sin(t * 3.2) * 0.07;
  u.shadow.scale.setScalar(1 - Math.sin(t * 3.2) * 0.06);
  u.crown.rotation.y += dt * 1.4;
  u.rig.rotation.x = THREE.MathUtils.lerp(u.rig.rotation.x, 0.22 * speed, 0.12);
  u.rig.rotation.z = THREE.MathUtils.lerp(u.rig.rotation.z, 0.18 * turn, 0.12);
  const swing = speed > 0.05 ? Math.sin(t * 9) * 0.7 * speed : Math.sin(t * 1.6) * 0.06;
  u.armL.rotation.x = swing; u.armR.rotation.x = -swing;
  u.jet.material.emissiveIntensity = 2.4 + speed * 2.5 + Math.sin(t * 20) * 0.3;
  u.blink -= dt; if (u.blink < 0) { u.blink = 2.5 + Math.random() * 3; }
  const s = u.blink < 0.12 ? 0.15 : 1; u.eyes.forEach((e) => (e.scale.y = s));
}
export function waveRobot(rb, t) { rb.userData.armR.rotation.z = 2.4 + Math.sin(t * 10) * 0.35; rb.userData.armR.rotation.x = 0; }

// ---------------- shops ----------------
export function makeShop(spec) {
  const g = new THREE.Group(); g.name = "shop:" + spec.id;
  const col = spec.color, wall = solid(C.panel, { roughness: 0.6, metalness: 0.3 }), trim = glow(col, 1.8), dark = solid(C.panel2, { metalness: 0.4 });
  const spin = [];
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.35, 40), dark); plinth.position.y = 0.17;
  const edge = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.06, 8, 80), trim); edge.rotation.x = Math.PI / 2; edge.position.y = 0.36;
  const door = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.5, 0.2, 3, 0.12), glow(col, 1.1)); door.position.set(0, 1.1, 1.62);
  g.add(plinth, edge);
  const box = (w, h, d, y, m = wall) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.18), m); b.position.y = y; g.add(b); return b; };
  switch (spec.shape) {
    case "rocket": {
      box(3, 2.2, 3, 1.45);
      const r = new THREE.Group(); r.position.y = 2.55;
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.4, 20), glossy(0xe9f1f7)); hull.position.y = 1.2;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 20), glow(col, 1.6)); nose.position.y = 2.85;
      const fins = [0, 1, 2].map((i) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.5), glow(col, 1.4)); f.position.set(Math.sin(i * 2.09) * 0.5, 0.25, Math.cos(i * 2.09) * 0.5); f.rotation.y = i * 2.09; return f; });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 12), glow(C.gold, 3)); flame.position.y = -0.2; flame.rotation.x = Math.PI;
      r.add(hull, nose, flame, ...fins); g.add(r);
      spin.push((dt, t) => { r.position.y = 2.55 + Math.sin(t * 1.4) * 0.12; flame.scale.y = 0.8 + Math.sin(t * 18) * 0.25; });
      break;
    }
    case "orb": {
      box(3, 1.6, 3, 1.15);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), glossy(0x1b1033, { emissive: col, emissiveIntensity: 0.7 })); orb.position.y = 3.2;
      const o1 = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 64), glow(C.blue, 2.2)), o2 = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 64), glow(C.green, 2.2));
      o1.position.y = o2.position.y = 3.2; g.add(orb, o1, o2);
      spin.push((dt, t) => { o1.rotation.set(1.1, t * 0.9, 0); o2.rotation.set(-1.1, -t * 0.7, 0.4); orb.material.emissiveIntensity = 0.5 + Math.sin(t * 2.4) * 0.25; });
      break;
    }
    case "coin": {
      box(3.6, 1.9, 2.8, 1.3);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.18, 3.1), trim); roof.position.y = 2.32; g.add(roof);
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 40), glossy(C.gold, { emissive: 0x7a5000, emissiveIntensity: 0.4 })); coin.position.y = 3.45; coin.rotation.x = Math.PI / 2;
      const mark = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 40), glow(col, 2)); mark.position.y = 3.45; g.add(coin, mark);
      spin.push((dt, t) => { coin.rotation.z = t * 1.6; mark.rotation.y = t * 1.6; coin.position.y = mark.position.y = 3.45 + Math.sin(t * 2) * 0.1; });
      break;
    }
    case "clock": {
      box(2.4, 3.6, 2.4, 2.15);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 40), solid(0xe9f1f7)); face.rotation.x = Math.PI / 2; face.position.set(0, 3.2, 1.22);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.06, 8, 48), trim); ring.position.set(0, 3.2, 1.26);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.04), dark); hand.geometry.translate(0, 0.28, 0); hand.position.set(0, 3.2, 1.3);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 4), dark); cap.position.y = 4.5; cap.rotation.y = Math.PI / 4;
      g.add(face, ring, hand, cap);
      spin.push((dt, t) => { hand.rotation.z = -t * 0.8; });
      break;
    }
    case "dome": {
      box(3.6, 1.2, 3.2, 0.95);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glossy(C.gold, { emissive: 0x5a3c00, emissiveIntensity: 0.35 })); dome.position.y = 1.55;
      g.add(dome);
      [-1.2, -0.4, 0.4, 1.2].forEach((x) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 10), solid(0xe9f1f7)); c.position.set(x, 0.95, 1.7); g.add(c); });
      const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), glow(col, 2.6)); top.position.y = 3.35; g.add(top);
      spin.push((dt, t) => { top.rotation.y = t * 1.2; top.position.y = 3.35 + Math.sin(t * 2) * 0.1; });
      break;
    }
    case "vault": {
      box(3.2, 2.8, 3, 1.75);
      const vd = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.22, 40), glossy(0x8a96a8)); vd.rotation.x = Math.PI / 2; vd.position.set(0, 1.8, 1.55);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 32), trim); wheel.position.set(0, 1.8, 1.7);
      const spokes = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.06), trim); spokes.position.set(0, 1.8, 1.7);
      const spokes2 = spokes.clone(); spokes2.rotation.z = Math.PI / 2;
      g.add(vd, wheel, spokes, spokes2);
      spin.push((dt, t) => { const a = Math.sin(t * 0.6) * 0.8; wheel.rotation.z = spokes.rotation.z = a; spokes2.rotation.z = a + Math.PI / 2; });
      door.visible = false;
      break;
    }
    case "dish": {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.1, 4.4, 8), wall); tower.position.y = 2.55; g.add(tower);
      box(2.6, 1.4, 2.6, 1.05);
      const head = new THREE.Group(); head.position.y = 5.0;
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 12, 0, Math.PI * 2, 0, 0.9), glossy(0xe9f1f7, { side: THREE.DoubleSide })); dish.rotation.x = -1.1;
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      beam.rotation.x = -1.1 - Math.PI / 2; beam.position.set(0, 1.0, 2.0);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), glow(col, 3)); tip.position.set(0, 0.5, 0.35);
      head.add(dish, beam, tip); g.add(head);
      spin.push((dt, t) => { head.rotation.y = t * 0.7; });
      break;
    }
    case "obelisk": {
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.2, 4.2, 4), wall); ob.position.y = 2.4; ob.rotation.y = Math.PI / 4; g.add(ob);
      const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), glossy(0x2a1250, { emissive: col, emissiveIntensity: 1.2, transparent: true, opacity: 0.92 })); crys.position.y = 5.3; g.add(crys);
      const up = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), glow(C.green, 2.4)), dn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), glow(C.scam, 2.4));
      dn.rotation.x = Math.PI; g.add(up, dn);
      spin.push((dt, t) => { crys.rotation.y = t; crys.position.y = 5.3 + Math.sin(t * 1.5) * 0.18; up.position.set(Math.cos(t) * 1.3, 5.3, Math.sin(t) * 1.3); dn.position.set(-Math.cos(t) * 1.3, 5.3, -Math.sin(t) * 1.3); });
      door.position.y = 0.95;
      break;
    }
    case "stage": {
      box(3.6, 2.4, 2.4, 1.55);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      screen.position.set(0, 1.85, 1.22);
      screen.material = glow(col, 0.9);
      const lights = [-1.2, 0, 1.2].map((x, i) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), glow([C.pink, C.cyan, C.purple][i], 3)); l.position.set(x, 3.0, 1.0); return l; });
      g.add(screen, ...lights);
      spin.push((dt, t) => { screen.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.3; lights.forEach((l, i) => (l.position.y = 3.0 + Math.sin(t * 4 + i) * 0.1)); });
      door.position.set(0, 0.95, 1.26); door.scale.set(1.6, 0.7, 1);
      break;
    }
  }
  g.add(door);
  const tag = label(spec.name, { accent: "#" + col.toString(16).padStart(6, "0") }); tag.position.y = spec.shape === "dish" || spec.shape === "obelisk" ? 7.2 : 6.0; g.add(tag);
  g.userData = { spec, spin, tag, radius: 3.2 };
  return g;
}

// the way back to the platform: an arch in the shape of the mark
export function makePortal() {
  const g = new THREE.Group(); g.name = "portal";
  const a = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 16, 64), glow(C.blue, 2.2)), b = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 16, 64), glow(C.green, 2.2));
  a.position.set(-0.85, 1.9, 0); b.position.set(0.85, 1.9, 0);
  const veil = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  veil.position.set(0, 1.9, 0);
  const tag = label("Platform World", { accent: "#35d8d0", size: 0.9 }); tag.position.y = 4.4;
  g.add(a, b, veil, tag);
  g.userData = { spin: [(dt, t) => { veil.material.opacity = 0.14 + Math.sin(t * 2) * 0.06; a.rotation.z = t * 0.4; b.rotation.z = -t * 0.4; }], radius: 1.6 };
  return g;
}

// ---------------- scammers ----------------
export const SCAMMERS = [
  { id: "phisher", stage: 1, name: "The Phisher", color: C.scam, sign: "FREE AIRDROP", theta: 50, phi: 20 },
];
export function makeScammer(spec) {
  const g = new THREE.Group(); g.name = "scam:" + spec.id;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), solid(0x3a0f22, { flat: true, emissive: spec.color, emissiveIntensity: 0.25 })); body.position.y = 1.0;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), solid(0xffffff)); eye.position.set(0, 1.15, 0.62);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), glow(spec.color, 2.5)); pupil.position.set(0, 1.15, 0.84);
  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), solid(0x1a0610)); hornL.position.set(-0.35, 1.75, 0); hornL.rotation.z = 0.4;
  const hornR = hornL.clone(); hornR.position.x = 0.35; hornR.rotation.z = -0.4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), solid(0x6b4a2a)); pole.position.set(0.85, 1.3, 0.1);
  const sign = label(spec.sign, { accent: "#ff4d6d", color: "#ffc861", size: 0.6 }); sign.position.set(0.85, 2.35, 0.1);
  const rig = new THREE.Group(); rig.add(body, eye, pupil, hornL, hornR, pole, sign);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 40), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  g.add(rig, ring);
  g.userData = { spec, rig, ring, radius: 1.3, spin: [(dt, t) => { rig.position.y = Math.abs(Math.sin(t * 3)) * 0.25; rig.rotation.y = Math.sin(t * 0.8) * 0.5; ring.material.opacity = 0.35 + Math.sin(t * 4) * 0.2; }] };
  return g;
}

// ---------------- the kit: Quaternius Sci-Fi Essentials (CC0), repacked in /models/world ----------------
// scifi-props.glb holds one scene per prop in this order; scifi-enemies.glb holds the three enemy robots.
const PROP_NAMES = ["Crate", "CrateLarge", "CrateTarp", "CrateTarpLarge", "Barrel", "Barrel2", "Chest", "Locker", "Dish", "KeyCard", "Desk", "Chair", "Shelves"];
const ENEMY_NAMES = ["EyeDrone", "QuadShell", "Trilobite"];
let kitP = null;
export function loadKit(ver = "") {
  if (kitP) return kitP;
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const one = (u) => new Promise((res, rej) => L.load(u + ver, res, undefined, rej));
  kitP = Promise.all([one("/models/world/scifi-props.glb"), one("/models/world/scifi-enemies.glb")]).then(([p, e]) => {
    const split = (g, names) => {
      const J = g.parser.json, owner = new Map(), out = {};
      (J.scenes || []).forEach((sc, si) => { const walk = (n) => { owner.set(n, si); (J.nodes[n].children || []).forEach(walk); }; (sc.nodes || []).forEach(walk); });
      g.scenes.forEach((sc, si) => {
        out[names[si]] = { scene: sc, clips: g.animations.filter((a, ai) => J.animations[ai] && owner.get(J.animations[ai].channels[0].target.node) === si) };
      });
      return out;
    };
    return { props: split(p, PROP_NAMES), enemies: split(e, ENEMY_NAMES) };
  });
  return kitP;
}
const shadowy = (o, cast = true, recv = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; };
export { shadowy };
export function prop(kit, name, { s = 1, x = 0, z = 0, y = 0, ry = 0 } = {}) {
  const src = kit.props[name]; if (!src) return null;
  const o = SkeletonUtils.clone(src.scene);
  o.scale.setScalar(s); o.position.set(x, y, z); o.rotation.y = ry;
  o.userData.clips = src.clips;
  return shadowy(o);
}
export function enemy(kit, name) {
  const src = kit.enemies[name]; if (!src) return null;
  const o = shadowy(SkeletonUtils.clone(src.scene), true, false);
  const mixer = new THREE.AnimationMixer(o);
  let cur = null;
  const play = (clip, { once = false, fade = 0.25 } = {}) => {
    const c = src.clips.find((x) => x.name === clip); if (!c) return null;
    const a = mixer.clipAction(c);
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (cur && cur !== a) cur.crossFadeTo(a, fade, false);
    a.play(); cur = a; return a;
  };
  return { obj: o, mixer, play };
}
// what stands around each shop, in the shop's own frame (+Z faces the spawn point, the plinth is r = 3)
const DECOR = {
  launch: [["Crate", { s: 0.75, x: 3.5, z: 0.7, ry: 0.3 }], ["CrateTarp", { s: 0.75, x: -3.6, z: -0.4, ry: -0.4 }], ["Barrel", { s: 0.9, x: 3.2, z: -1.3 }], ["Barrel2", { s: 1, x: -3.1, z: 1.3 }]],
  quantum: [["Crate", { s: 0.7, x: 3.5, z: -0.2, ry: 0.6 }], ["Barrel2", { s: 1, x: -3.3, z: 0.9 }], ["Barrel2", { s: 1, x: -3.6, z: -0.2 }]],
  swap: [["CrateTarpLarge", { s: 0.65, x: -3.7, z: 0, ry: 1.57 }], ["Crate", { s: 0.7, x: 3.6, z: 0.9, ry: 0.2 }], ["Crate", { s: 0.55, x: 3.6, z: -0.5, ry: -0.3 }]],
  orders: [["Desk", { s: 0.8, x: 3.7, z: 0.4, ry: -1.4 }], ["Chair", { s: 0.8, x: 3.0, z: 1.7, ry: -2.4 }], ["Shelves", { s: 0.9, x: -3.6, z: 0, ry: 1.57 }]],
  staking: [["Chest", { s: 1.2, x: -3.5, z: 1.0, ry: 0.6, key: "chest" }], ["Barrel2", { s: 1, x: 3.3, z: 1.0 }], ["Barrel2", { s: 1, x: 3.6, z: 0 }]],
  locker: [["Locker", { s: 0.8, x: 3.4, z: -0.6, ry: -1.57 }], ["Locker", { s: 0.8, x: 3.4, z: 0.4, ry: -1.57 }], ["Chest", { s: 1.1, x: -3.5, z: 0.8, ry: 0.5, key: "chest" }]],
  scanner: [["Dish", { s: 0.6, x: 3.7, z: -0.3, ry: -1.1 }], ["Shelves", { s: 0.8, x: -3.5, z: 0.5, ry: 1.3 }]],
  predict: [["Barrel", { s: 0.9, x: 3.2, z: 1.0 }], ["CrateTarp", { s: 0.7, x: -3.5, z: 0, ry: 0.8 }]],
  arcia: [["Chair", { s: 0.7, x: 1.3, z: 3.3, ry: Math.PI }], ["Chair", { s: 0.7, x: -1.3, z: 3.3, ry: Math.PI }], ["Desk", { s: 0.75, x: -3.7, z: 0, ry: 1.57 }]],
};
export function decorate(shop, kit) {
  const list = DECOR[shop.userData.spec.id] || [];
  list.forEach(([n, o]) => { const p = prop(kit, n, { ...o, s: (o.s || 1) * 1.3 }); if (!p) return; shop.add(p); if (o.key) shop.userData[o.key] = p; });
  const chest = shop.userData.chest;
  if (chest && chest.userData.clips.length) {
    const mixer = new THREE.AnimationMixer(chest); shop.userData.chestMixer = mixer;
    const act = (n, once) => { const c = chest.userData.clips.find((x) => x.name === n); if (!c) return; const a = mixer.clipAction(c); a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = true; a.play(); mixer.stopAllAction(); a.play(); };
    act("Idle_Closed"); shop.userData.chestOpen = () => act("Open", true); shop.userData.chestClose = () => act("Close", true);
    shop.userData.spin.push((dt) => mixer.update(dt));
  }
}

// key cards to collect: a few XP each
export const CARDS = [[15, 70], [19, 200], [38, 15], [40, 100], [41, 185], [39, 265], [43, 330], [52, 60], [56, 150], [58, 230], [60, 300], [66, 20]];
export function makeCard(kit) {
  const g = new THREE.Group();
  const c = prop(kit, "KeyCard", { s: 3.2, y: 0.9 }); if (c) g.add(c);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  g.userData = { radius: 0.6, spin: [(dt, t) => { if (c) { c.rotation.y = t * 2; c.position.y = 0.9 + Math.sin(t * 2.5) * 0.15; } ring.material.opacity = 0.4 + Math.sin(t * 3) * 0.2; }] };
  return g;
}

// the sky: deep navy overhead, a teal haze at the horizon
export function makeSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x050a18) }, mid: { value: new THREE.Color(0x0a1a2e) }, glow: { value: new THREE.Color(0x0f3f4a) } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 glow; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.0, 0.7, h)); c = mix(c, glow, smoothstep(0.25, -0.25, h) * 0.85); gl_FragColor = vec4(c, 1.0); }",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), m); sky.renderOrder = -1; return sky;
}

// stepping stones: a ring path through the shops and a spoke from the plaza to each door
export function makePaths() {
  const pts = [];
  for (let ph = 0; ph < 360; ph += 3.2) pts.push([31, ph]);
  SHOPS.forEach((s) => { for (let th = 8; th < s.theta - 4.5; th += 2.6) pts.push([th, s.phi]); });
  const geo = new THREE.CylinderGeometry(0.62, 0.7, 0.12, 6);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x24404c, roughness: 0.75, metalness: 0.2 }), pts.length);
  const m = new THREE.Matrix4(), o = new THREE.Object3D();
  pts.forEach(([th, ph], i) => { placeOn(o, dirOf(th, ph), R + 0.02); o.rotateY((i * 0.7) % 1); o.updateMatrix(); m.copy(o.matrix); mesh.setMatrixAt(i, m); });
  mesh.receiveShadow = true;
  return mesh;
}
