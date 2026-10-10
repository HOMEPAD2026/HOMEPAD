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
export const R = 32; // big enough for districts; everything else is placed in degrees
export const C = {
  space: 0x04060a, ground: 0x10303a, ground2: 0x163f48, ground3: 0x0c252e,
  blue: 0x3f9bff, cyan: 0x35d8d0, green: 0x39ff88, gold: 0xffc861, ink: 0xeef3f7,
  panel: 0x172131, panel2: 0x0e1520, purple: 0xb48cff, pink: 0xff7ad9, scam: 0xff4d6d,
};
const UP = new THREE.Vector3(0, 1, 0);

// One shop per real utility. theta: degrees from the spawn point (north pole); phi: degrees around it.
export const SHOPS = [
  { id: "launch", name: "Launchpad", url: "/arc#launch", color: C.green, shape: "rocket", theta: 21, phi: 0, district: "Launch",
    line: "Launch a real coin on ArcPad for 1 USDC. A real pool from the first block." },
  { id: "quantum", name: "Quantum Lab", url: "/arc#quantum", color: C.purple, shape: "orb", theta: 25, phi: 34, district: "Launch",
    line: "Announce a launch, collect commits, collapse it: everyone gets the same price." },
  { id: "swap", name: "Exchange", url: "/arc#swap", color: C.cyan, shape: "coin", theta: 21, phi: 78, district: "Finance",
    line: "Swap any Arc token with $ARCIRCLE or USDC. 0.1% fee, half of it burned." },
  { id: "orders", name: "Order House", url: "/arc#orders", color: C.blue, shape: "clock", theta: 25, phi: 108, district: "Finance",
    line: "Limit, stop-loss, take-profit and DCA orders. Sign once, no gas until a fill." },
  { id: "staking", name: "Bank", url: "/arc#staking", color: C.gold, shape: "dome", theta: 21, phi: 138, district: "Finance",
    line: "Lock $ARCIRCLE for veARCIRCLE and share the platform's fees." },
  { id: "locker", name: "Vault", url: "/arc#locker", color: C.gold, shape: "vault", theta: 25, phi: 168, district: "Finance",
    line: "Lock tokens or LP until a date. Locks can only be pushed later, never earlier." },
  { id: "scanner", name: "Scanner Tower", url: "/arc#scanner", color: C.cyan, shape: "dish", theta: 21, phi: 212, district: "Research",
    line: "Safety-scan any token before you buy. Your best weapon against scammers." },
  { id: "predict", name: "Oracle", url: "/arc#predict", color: C.purple, shape: "obelisk", theta: 25, phi: 242, district: "Research",
    line: "Call UP or DOWN on a coin, up to $5 a round." },
  { id: "reward", name: "Burn Furnace", url: "/reward", color: 0xff7a3c, shape: "furnace", theta: 31, phi: 268, district: "Finance",
    line: "The $ARCIRCLE burn engine: fees buy $ARCIRCLE and burn it for good. Every real burn lights this fire." },
  { id: "arcia", name: "ARCIA Studio", url: "/arcia", color: C.pink, shape: "stage", theta: 22, phi: 296, district: "ARCIA",
    line: "Arc's AI idol. Ask her anything about a coin, a wallet or this world." },
];
export const PORTAL = { id: "platform", name: "Platform World", theta: 14, phi: 265 };
// districts: a sign over each, a colour on the minimap
export const DISTRICTS = [
  { id: "launch", name: "Launch District", theta: 33, phi: 17, color: 0x39ff88 },
  { id: "finance", name: "Finance District", theta: 33, phi: 123, color: 0xffc861 },
  { id: "research", name: "Research District", theta: 33, phi: 227, color: 0x35d8d0 },
  { id: "arcia", name: "ARCIA Studio", theta: 33, phi: 296, color: 0xff7ad9 },
  { id: "coins", name: "Coin City", theta: 61, phi: 0, color: 0xeef3f7 },
  { id: "dark", name: "Dark Market", theta: 62, phi: 205, color: 0xff4d6d },
];
// Coin City: one lot per ArcPad coin, biggest market caps nearest the plaza
export const COIN_LOTS = (() => { const out = []; [41, 48, 55].forEach((th) => { for (let ph = -48; ph <= 48; ph += 16) out.push([th, ph]); }); return out.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]) || a[0] - b[0]).map(([t, p]) => [t, (p + 360) % 360]); })(); // centre first

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
export function quality(force = "auto") {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const low = force === "low" ? true : force === "high" ? false : (coarse && cores <= 6) || cores <= 2 || /Android [4-8]\b/.test(navigator.userAgent);
  return { coarse, low, dpr: Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75), bloom: !low };
}
export function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
export function makeStage(canvas, opts = {}) {
  const q = quality(opts.quality);
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
  const hemi = new THREE.HemisphereLight(0x9fd0ff, 0x0b1a14, 0.9); scene.add(hemi);
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
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), opts.bloom ?? 0.75, 0.55, 0.9));
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
    // slower devices: no bloom, no shadows, fewer pixels
    degrade() { renderer.setPixelRatio(1); if (composer) { composer.dispose?.(); composer = null; } renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); }); resize(); },
    snap() { if (composer) composer.render(); else renderer.render(scene, camera); return new Promise((res) => canvas.toBlob(res, "image/png")); },
    THREE, scene, camera, renderer, sun, hemi, composer, quality: q, on: (fn) => (updates.add(fn), () => updates.delete(fn)),
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
export function makePlanet({ map = "" } = {}) {
  const g = new THREE.Group(); g.name = "planet";
  const mat = new THREE.MeshStandardMaterial({ color: 0xa8b4bc, roughness: 0.92, metalness: 0.02 }); // the map is bright; keep the buildings the brightest thing
  if (map) new THREE.TextureLoader().load(map, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; mat.map = t; mat.needsUpdate = true; });
  else mat.color.set(C.ground2);
  const ground = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), mat); ground.receiveShadow = true; g.add(ground);
  // atmosphere: a soft cyan rim, brightest at the edge of the disc
  g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { c: { value: new THREE.Color(0x35d8d0) } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.2); gl_FragColor = vec4(c, f * 0.85); }",
  })));
  // the plaza: a spherical cap that follows the ground
  const cap = THREE.MathUtils.degToRad(11);
  const plaza = new THREE.Mesh(new THREE.SphereGeometry(R + 0.05, 64, 6, 0, Math.PI * 2, 0, cap), solid(0x112a33, { roughness: 0.85, metalness: 0.1 }));
  plaza.receiveShadow = true; g.add(plaza);
  const plazaRing = new THREE.Mesh(new THREE.TorusGeometry((R + 0.08) * Math.sin(cap), 0.05, 8, 128), glow(C.cyan, 1.1));
  plazaRing.rotation.x = Math.PI / 2; plazaRing.position.y = (R + 0.08) * Math.cos(cap); g.add(plazaRing);
  // crystals and a few trees where nothing else stands — instanced (one draw per kind) so phones keep up
  const crystal = new THREE.ConeGeometry(0.45, 1.8, 5), trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), crown = new THREE.IcosahedronGeometry(0.75, 0);
  crystal.translate(0, 0.7, 0); trunk.translate(0, 0.4, 0); crown.translate(0, 1.15, 0);
  const crysMats = [glow(C.cyan, 1.2), glow(C.green, 1.1), glow(C.blue, 1.2)], trunkMat = solid(0x3a2c22), crownMats = [solid(0x1f6b55, { flat: true }), solid(0x23806a, { flat: true }), solid(0x2a5e7a, { flat: true })];
  const rr = rand(7), spots = { crys: [[], [], []], tree: [[], [], []] }, o = new THREE.Object3D();
  for (let i = 0; i < 160; i++) {
    const th = 14 + rr() * 166, ph = rr() * 360;
    if (SHOPS.some((s) => angDist(th, ph, s.theta, s.phi) < 9) || TOWN.some((t) => angDist(th, ph, t[1], t[2]) < 5)) continue;
    if (angDist(th, ph, PORTAL.theta, PORTAL.phi) < 6 || COIN_LOTS.some(([a, b]) => angDist(th, ph, a, b) < 5) || DISTRICTS.some((d) => angDist(th, ph, d.theta, d.phi) < 3)) continue;
    placeOn(o, dirOf(th, ph), R - 0.05); o.rotateY(rr() * 6.28); o.scale.setScalar(0.8 + rr() * 0.7);
    if (rr() < 0.45) o.rotateZ((rr() - 0.5) * 0.4);
    o.updateMatrix(); (rr() < 0.45 ? spots.crys : spots.tree)[i % 3].push(o.matrix.clone());
  }
  const inst = (geo, mat, list) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mx, k) => m.setMatrixAt(k, mx)); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  spots.crys.forEach((l, k) => inst(crystal, crysMats[k], l));
  spots.tree.forEach((l, k) => { inst(trunk, trunkMat, l); inst(crown, crownMats[k], l); });
  return g;
}
// distant Kenney planets in the sky
export function makeSkyPlanets(ver = "") {
  const g = new THREE.Group(), L = new THREE.TextureLoader();
  [["02", -300, 90, -380, 92], ["09", 380, 210, -300, 58], ["03", 160, 300, 380, 84], ["05", -420, -160, 200, 44]].forEach(([n, x, y, z, size]) => {
    const m = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, opacity: 0.95 });
    L.load(`/models/world/sky-planet${n}.webp${ver}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.needsUpdate = true; });
    const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.setScalar(size); sp.renderOrder = -1; g.add(sp);
  });
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
// A shop: a plinth, a body (a stand-in box until the Kenney building arrives), and the ARCIRCLE accent that marks
// what it is — rocket, orb, coin, clock, dome, vault wheel, dish, crystal, screen — set on the roof.
export function makeShop(spec) {
  const g = new THREE.Group(); g.name = "shop:" + spec.id;
  const col = spec.color, trim = glow(col, 1.8), dark = solid(C.panel2, { metalness: 0.4 });
  const spin = [];
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.35, 40), dark); plinth.position.y = 0.17;
  const edge = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.06, 8, 80), trim); edge.rotation.x = Math.PI / 2; edge.position.y = 0.36;
  const body = new THREE.Group();
  const stand = new THREE.Mesh(new RoundedBoxGeometry(3, 2.4, 3, 3, 0.18), solid(C.panel, { roughness: 0.6, metalness: 0.3 })); stand.position.y = 1.55; body.add(stand);
  const accent = new THREE.Group(); accent.position.y = 2.75;
  switch (spec.shape) {
    case "rocket": {
      const r = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.4, 20), glossy(0xe9f1f7)); hull.position.y = 1.2;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 20), glow(col, 1.6)); nose.position.y = 2.85;
      const fins = [0, 1, 2].map((i) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.5), glow(col, 1.4)); f.position.set(Math.sin(i * 2.09) * 0.5, 0.25, Math.cos(i * 2.09) * 0.5); f.rotation.y = i * 2.09; return f; });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 12), glow(C.gold, 3)); flame.position.y = -0.2; flame.rotation.x = Math.PI;
      r.add(hull, nose, flame, ...fins); accent.add(r);
      spin.push((dt, t) => { r.position.y = 0.25 + Math.sin(t * 1.4) * 0.12; flame.scale.y = 0.8 + Math.sin(t * 18) * 0.25; });
      break;
    }
    case "orb": {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), glossy(0x1b1033, { emissive: col, emissiveIntensity: 0.7 })); orb.position.y = 1.3;
      const o1 = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 64), glow(C.blue, 2.2)), o2 = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 64), glow(C.green, 2.2));
      o1.position.y = o2.position.y = 1.3; accent.add(orb, o1, o2);
      spin.push((dt, t) => { o1.rotation.set(1.1, t * 0.9, 0); o2.rotation.set(-1.1, -t * 0.7, 0.4); orb.material.emissiveIntensity = 0.5 + Math.sin(t * 2.4) * 0.25; });
      break;
    }
    case "coin": {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 40), glossy(C.gold, { emissive: 0x7a5000, emissiveIntensity: 0.4 })); coin.position.y = 1.2; coin.rotation.x = Math.PI / 2;
      const mark = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 40), glow(col, 2)); mark.position.y = 1.2; accent.add(coin, mark);
      spin.push((dt, t) => { coin.rotation.z = t * 1.6; mark.rotation.y = t * 1.6; coin.position.y = mark.position.y = 1.2 + Math.sin(t * 2) * 0.1; });
      break;
    }
    case "clock": {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 10), dark); post.position.y = 0.3;
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 40), solid(0xe9f1f7)); face.rotation.x = Math.PI / 2; face.position.y = 1.4;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.06, 8, 48), trim); ring.position.y = 1.4;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.04), dark); hand.geometry.translate(0, 0.28, 0); hand.position.set(0, 1.4, 0.07);
      accent.add(post, face, ring, hand);
      spin.push((dt, t) => { hand.rotation.z = -t * 0.8; });
      break;
    }
    case "dome": {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glossy(C.gold, { emissive: 0x5a3c00, emissiveIntensity: 0.35 }));
      const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), glow(col, 2.6)); top.position.y = 1.55;
      accent.add(dome, top);
      spin.push((dt, t) => { top.rotation.y = t * 1.2; top.position.y = 1.55 + Math.sin(t * 2) * 0.1; });
      break;
    }
    case "vault": {
      const vd = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 40), glossy(0x8a96a8)); vd.rotation.x = Math.PI / 2; vd.position.y = 1.0;
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 32), trim); wheel.position.set(0, 1.0, 0.14);
      const sp1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.06), trim); sp1.position.set(0, 1.0, 0.14);
      const sp2 = sp1.clone(); sp2.rotation.z = Math.PI / 2;
      accent.add(vd, wheel, sp1, sp2);
      spin.push((dt, t) => { const a = Math.sin(t * 0.6) * 0.8; wheel.rotation.z = sp1.rotation.z = a; sp2.rotation.z = a + Math.PI / 2; });
      break;
    }
    case "dish": {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 8), dark); mast.position.y = 0.7;
      const head = new THREE.Group(); head.position.y = 1.5;
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, 0.9), glossy(0xe9f1f7, { side: THREE.DoubleSide })); dish.rotation.x = -1.1;
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4.5, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      beam.rotation.x = -1.1 - Math.PI / 2; beam.position.set(0, 0.9, 1.8);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), glow(col, 3)); tip.position.set(0, 0.45, 0.32);
      head.add(dish, beam, tip); accent.add(mast, head);
      spin.push((dt, t) => { head.rotation.y = t * 0.7; });
      break;
    }
    case "obelisk": {
      const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), glossy(0x2a1250, { emissive: col, emissiveIntensity: 1.2, transparent: true, opacity: 0.92 })); crys.position.y = 1.4;
      const up = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), glow(C.green, 2.4)), dn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), glow(C.scam, 2.4));
      dn.rotation.x = Math.PI; accent.add(crys, up, dn);
      spin.push((dt, t) => { crys.rotation.y = t; crys.position.y = 1.4 + Math.sin(t * 1.5) * 0.18; up.position.set(Math.cos(t) * 1.3, 1.4, Math.sin(t) * 1.3); dn.position.set(-Math.cos(t) * 1.3, 1.4, -Math.sin(t) * 1.3); });
      break;
    }
    case "furnace": {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 0.7, 20), dark); bowl.position.y = 0.35;
      const fire = new THREE.Group(); fire.position.y = 0.6;
      const flames = [0, 1, 2, 3, 4].map((i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 + (i % 2) * 0.12, 1.4, 8), glow(i % 2 ? 0xff7a3c : C.gold, 3)); f.position.set(Math.sin(i * 1.26) * 0.45, 0.6, Math.cos(i * 1.26) * 0.45); fire.add(f); return f; });
      accent.add(bowl, fire); g.userData.fire = fire;
      spin.push((dt, t) => { const boost = g.userData.boost || 0; flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 9 + i) * 0.25 + boost * 2.2; f.scale.x = f.scale.z = 1 + boost * 0.6; }); if (boost > 0) g.userData.boost = Math.max(0, boost - dt * 0.4); });
      break;
    }
    case "stage": {
      const frame = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.5, 0.16, 3, 0.06), dark); frame.position.y = 1.0;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.28), glow(col, 0.9)); screen.position.set(0, 1.0, 0.09);
      const lights = [-1.0, 0, 1.0].map((x, i) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), glow([C.pink, C.cyan, C.purple][i], 3)); l.position.set(x, 2.0, 0); return l; });
      accent.add(frame, screen, ...lights);
      spin.push((dt, t) => { screen.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.3; lights.forEach((l, i) => (l.position.y = 2.0 + Math.sin(t * 4 + i) * 0.1)); });
      break;
    }
  }
  g.add(plinth, edge, body, accent);
  const tag = label(spec.name, { accent: "#" + col.toString(16).padStart(6, "0") }); tag.position.y = 6.2; g.add(tag);
  g.userData = { spec, spin, tag, body, accent, radius: 3.2 };
  return g;
}

// the way back to the platform: an arch in the shape of the mark
export function makePortal(name = "Platform World") {
  const g = new THREE.Group(); g.name = "portal";
  const a = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 16, 64), glow(C.blue, 2.2)), b = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 16, 64), glow(C.green, 2.2));
  a.position.set(-0.85, 1.9, 0); b.position.set(0.85, 1.9, 0);
  const veil = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  veil.position.set(0, 1.9, 0);
  const tag = label(name, { accent: "#35d8d0", size: 0.9 }); tag.position.y = 4.4;
  g.add(a, b, veil, tag);
  g.userData = { spin: [(dt, t) => { veil.material.opacity = 0.14 + Math.sin(t * 2) * 0.06; a.rotation.z = t * 0.4; b.rotation.z = -t * 0.4; }], radius: 1.6 };
  return g;
}

// ---------------- scammers ----------------
export const SCAMMERS = [
  { id: "phisher", stage: 1, name: "The Phisher", color: C.scam, sign: "FREE AIRDROP", theta: 46, phi: 205, model: "EyeDrone", scale: 0.62, y: 1.5 },
  { id: "airdrop", stage: 2, name: "The Fake Airdrop", color: C.scam, sign: "CLAIM NOW", theta: 64, phi: 175, model: "QuadShell", scale: 1.0, y: 0.8 },
  { id: "honeypot", stage: 3, name: "The Honeypot", color: C.gold, sign: "ONLY GOES UP", theta: 70, phi: 215, model: "Trilobite", scale: 1.15, y: 1.0 },
  { id: "doppel", stage: 4, name: "The Doppelganger", color: C.purple, sign: "$ARCIRCLE V2", theta: 66, phi: 250, model: "EyeDrone", scale: 0.9, y: 1.8, tint: 0xb48cff },
  { id: "golem", stage: 5, name: "The Dump Golem", color: C.gold, sign: "DEV WON'T SELL", theta: 78, phi: 190, model: "QuadShell", scale: 1.6, y: 1.2, tint: 0xffc861 },
  { id: "dragon", stage: 6, name: "The Rug Dragon", color: C.scam, sign: "TRUST US", theta: 82, phi: 235, model: "Trilobite", scale: 2.0, y: 1.7, tint: 0xff4d6d },
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
// kenney-city.glb (Kenney City Kit Industrial 2.0, CC0), one scene per model in this order
const CITY_NAMES = ["building-e", "building-n", "building-a", "building-d", "building-o", "building-g", "building-f", "building-m", "building-t", "building-h", "building-k", "building-s", "windmill", "water-tower", "solar-panel-landscape-group", "solar-panel-portrait-group", "shipping-container-a", "shipping-container-b", "shipping-container-c", "detail-tank-large", "detail-tank", "chimney-large"];
let kitP = null;
export function loadKit(ver = "") {
  if (kitP) return kitP;
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const one = (u) => new Promise((res, rej) => L.load(u + ver, res, undefined, rej));
  kitP = Promise.all([one("/models/world/scifi-props.glb"), one("/models/world/scifi-enemies.glb"), one("/models/world/kenney-city.glb")]).then(([p, e, c]) => {
    const split = (g, names) => {
      const J = g.parser.json, owner = new Map(), out = {};
      (J.scenes || []).forEach((sc, si) => { const walk = (n) => { owner.set(n, si); (J.nodes[n].children || []).forEach(walk); }; (sc.nodes || []).forEach(walk); });
      g.scenes.forEach((sc, si) => {
        out[names[si]] = { scene: sc, clips: g.animations.filter((a, ai) => J.animations[ai] && owner.get(J.animations[ai].channels[0].target.node) === si) };
      });
      return out;
    };
    return { props: { ...split(p, PROP_NAMES), ...split(c, CITY_NAMES) }, enemies: split(e, ENEMY_NAMES) };
  });
  return kitP;
}
const shadowy = (o, cast = true, recv = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; };
export { shadowy };
export function prop(kit, name, { s = 1, x = 0, z = 0, y = 0, ry = 0 } = {}) {
  const src = kit.props[name]; if (!src) return null;
  const inner = SkeletonUtils.clone(src.scene);
  const box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const o = new THREE.Group(); o.add(inner);
  o.scale.setScalar(s); o.position.set(x, y, z); o.rotation.y = ry;
  o.userData.clips = src.clips; o.userData.h = (box.max.y - box.min.y) * s; o.userData.w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s;
  if (src.clips.length) o.userData.animRoot = inner;
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
const BUILDING = { reward: "chimney-large", launch: "building-e", quantum: "building-n", swap: "building-a", orders: "building-d", staking: "building-o", locker: "building-g", scanner: "building-f", predict: "building-m", arcia: "building-t" };
const ACCENT_H = { furnace: 2.4, rocket: 3.4, orb: 2.8, coin: 2.2, clock: 2.4, dome: 1.9, vault: 2.0, dish: 2.6, obelisk: 2.3, stage: 2.3 };
const DECOR = {
  launch: [["shipping-container-a", { s: 2.2, x: 3.9, z: 0.4, ry: 0.15 }], ["detail-tank", { s: 1.8, x: -3.9, z: 0.2, ry: 1.2 }]],
  quantum: [["chimney-large", { s: 1.5, x: -3.7, z: -0.4 }], ["detail-tank-large", { s: 1.3, x: 3.8, z: 0.2, ry: 0.6 }]],
  swap: [["shipping-container-c", { s: 2.1, x: -3.9, z: 0.5, ry: 0 }], ["shipping-container-b", { s: 2.1, x: -3.9, z: 0.5, y: 0.74, ry: 0.12 }], ["shipping-container-a", { s: 2.1, x: 3.9, z: 0.2, ry: -0.1 }]],
  orders: [["solar-panel-portrait-group", { s: 1.9, x: 3.9, z: 0.2, ry: -0.3 }], ["Shelves", { s: 1.1, x: -3.8, z: 0, ry: 1.57 }]],
  staking: [["Chest", { s: 1.45, x: -3.7, z: 1.0, ry: 0.6, key: "chest" }], ["detail-tank", { s: 1.8, x: 3.9, z: 0.4, ry: -0.5 }]],
  locker: [["Locker", { s: 1.0, x: 3.6, z: -0.6, ry: -1.57 }], ["Locker", { s: 1.0, x: 3.6, z: 0.5, ry: -1.57 }], ["Chest", { s: 1.4, x: -3.7, z: 0.8, ry: 0.5, key: "chest" }]],
  scanner: [["Dish", { s: 0.75, x: 3.9, z: -0.3, ry: -1.1 }], ["solar-panel-landscape-group", { s: 1.9, x: -3.9, z: 0.3, ry: 0.4 }]],
  predict: [["detail-tank-large", { s: 1.2, x: 3.8, z: 0.4 }], ["shipping-container-b", { s: 2.1, x: -3.9, z: 0, ry: 0.3 }]],
  reward: [["detail-tank", { s: 1.8, x: 3.8, z: 0.3, ry: 0.4 }], ["Barrel2", { s: 1.3, x: -3.6, z: 0.6 }]],
  arcia: [["Chair", { s: 0.6, x: 1.2, z: 3.4, ry: Math.PI }], ["Chair", { s: 0.6, x: -1.2, z: 3.4, ry: Math.PI }], ["solar-panel-landscape-group", { s: 1.8, x: -3.9, z: -0.2, ry: 1.2 }]],
};
export function decorate(shop, kit) {
  const u = shop.userData, id = u.spec.id;
  const b = prop(kit, BUILDING[id], { s: 2.5, y: 0.34, ry: Math.PI });
  if (b) {
    u.body.visible = false; shop.add(b);
    u.accent.position.y = 0.34 + b.userData.h * 0.8; // chimneys and towers count in h, so sit a little lower
    u.tag.position.y = u.accent.position.y + (ACCENT_H[u.spec.shape] || 2) + 1.3;
  }
  (DECOR[id] || []).forEach(([n, o]) => { const p = prop(kit, n, o); if (!p) return; shop.add(p); if (o.key) u[o.key] = p; });
  const chest = u.chest;
  if (chest && chest.userData.clips.length) {
    const mixer = new THREE.AnimationMixer(chest.userData.animRoot || chest); u.chestMixer = mixer;
    const act = (n, once) => { const c = chest.userData.clips.find((x) => x.name === n); if (!c) return; mixer.stopAllAction(); const a = mixer.clipAction(c); a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = true; a.play(); };
    act("Idle_Closed"); u.chestOpen = () => act("Open", true); u.chestClose = () => act("Close", true);
    u.spin.push((dt) => mixer.update(dt));
  }
}
// the industrial town between the shops and the far side: [model, theta, phi, scale, turn]
export const TOWN = [
  ["windmill", 42, 72, 2.6, 0.4], ["windmill", 46, 88, 2.4, 1.2], ["windmill", 41, 104, 2.7, 2.0],
  ["water-tower", 44, 128, 2.4, 0.2], ["building-h", 47, 145, 2.4, 1.2], ["building-k", 43, 160, 2.4, 2.6],
  ["solar-panel-landscape-group", 42, 250, 2.4, 0.3], ["solar-panel-portrait-group", 46, 268, 2.4, 1.1], ["building-s", 43, 285, 2.4, 0.8],
  ["water-tower", 47, 305, 2.4, 0.4], ["shipping-container-a", 41, 320, 2.4, 0.5], ["shipping-container-c", 44, 332, 2.4, 1.9],
  ["windmill", 80, 40, 2.8, 0.2], ["building-h", 85, 110, 2.6, 2.2], ["windmill", 100, 300, 2.8, 1.6], ["building-s", 110, 20, 2.6, 1.0],
  ["detail-tank-large", 95, 130, 1.8, 0.3], ["windmill", 120, 200, 2.8, 0.7], ["chimney-large", 105, 250, 2.0, 0], ["building-k", 130, 80, 2.6, 1.5],
  ["water-tower", 140, 300, 2.6, 0.4], ["windmill", 150, 160, 2.8, 2.9], ["building-h", 160, 20, 2.6, 0.5],
];
export function makeTown(kit) {
  const out = [];
  TOWN.forEach(([n, th, ph, sc, ry]) => {
    const p = prop(kit, n, { s: sc }); if (!p) return;
    const g = new THREE.Group(); g.name = "town:" + n; p.rotation.y = ry; g.add(p);
    placeOn(g, dirOf(th, ph), R - 0.02);
    g.userData = { radius: Math.max(0.8, p.userData.w * 0.45), spin: [] };
    if (n === "windmill") { const blades = p.getObjectByName("blades") || null; if (blades) g.userData.spin.push((dt) => (blades.rotation.z += dt * 1.5)); }
    out.push(g);
  });
  return out;
}

// key cards to collect: a few XP each
export const CARDS = [[12, 40], [13, 200], [30, 60], [30, 190], [31, 330], [38, 120], [40, 230], [50, 70], [56, 300], [64, 140], [75, 20], [90, 250]];
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
  for (let ph = 0; ph < 360; ph += 2.4) pts.push([23, ph]);
  SHOPS.forEach((s) => { for (let th = 12.5; th < s.theta - 4.5; th += 2.6) pts.push([th, s.phi]); });
  const geo = new THREE.CylinderGeometry(0.62, 0.7, 0.12, 6);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x24404c, roughness: 0.75, metalness: 0.2 }), pts.length);
  const m = new THREE.Matrix4(), o = new THREE.Object3D();
  pts.forEach(([th, ph], i) => { placeOn(o, dirOf(th, ph), R + 0.02); o.rotateY((i * 0.7) % 1); o.updateMatrix(); m.copy(o.matrix); mesh.setMatrixAt(i, m); });
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------- players: Kenney Mini Characters (CC0) or the ARC Bot ----------------
export const CHARACTERS = ["bot", ..."abcdef".split("").map((c) => "male-" + c), ..."abcdef".split("").map((c) => "female-" + c)];
const charCache = new Map();
export async function makeCharacter(id, ver = "") {
  if (id === "bot" || !CHARACTERS.includes(id)) {
    const r = makeRobot(); r.scale.setScalar(0.8);
    const rings = r.userData.crown.children;
    return { obj: r, bot: true, play() {}, busy: () => false, update(dt, t, speed, turn) { animateRobot(r, dt, t, speed, turn); }, height: 2.3,
      setCrown(a, b) { [a, b].forEach((c, i) => { rings[i].material.color.set(c); rings[i].material.emissive.set(c); }); } };
  }
  let src = charCache.get(id);
  if (!src) {
    const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
    src = await new Promise((res, rej) => L.load(`/models/world/chars/character-${id}.glb${ver}`, res, undefined, rej));
    charCache.set(id, src);
  }
  const inner = SkeletonUtils.clone(src.scene);
  const box = new THREE.Box3().setFromObject(inner), h = box.max.y - box.min.y || 1;
  const k = 2.1 / h; inner.scale.setScalar(k); inner.position.y = -box.min.y * k;
  const obj = new THREE.Group(); obj.add(inner); shadowy(obj, true, false);
  // the ARCIRCLE crown: the two rings of the mark over the head
  const crown = new THREE.Group(); crown.position.y = 2.45;
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 10, 32), glow(C.blue, 2.6)), r2 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 10, 32), glow(C.green, 2.4));
  r1.position.x = -0.1; r2.position.x = 0.1; r2.rotation.x = Math.PI / 2; crown.add(r1, r2); obj.add(crown);
  const mixer = new THREE.AnimationMixer(inner), acts = {};
  src.animations.forEach((c) => { acts[c.name] = mixer.clipAction(c); });
  let cur = null, oneShot = null;
  const play = (name, { once = false, fade = 0.18, speed = 1 } = {}) => {
    const a = acts[name]; if (!a) return;
    if (!once && cur === a && !oneShot) return;
    a.reset(); a.timeScale = speed; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (cur && cur !== a) cur.crossFadeTo(a, fade, false);
    a.play(); cur = a;
    if (once) { oneShot = a; const done = (e) => { if (e.action === a) { mixer.removeEventListener("finished", done); oneShot = null; } }; mixer.addEventListener("finished", done); }
  };
  play("idle");
  return {
    obj, mixer, play, height: 2.1, busy: () => !!oneShot,
    setCrown(a, b) { [[r1, a], [r2, b]].forEach(([m, c]) => { m.material.color.set(c); m.material.emissive.set(c); }); },
    update(dt, t) { mixer.update(dt); crown.rotation.y += dt * 1.4; crown.position.y = 2.45 + Math.sin(t * 2) * 0.04; },
  };
}

// ---------------- Coin City: real ArcPad coins as buildings ----------------
const COIN_MODELS = ["building-k", "building-h", "building-s", "building-g", "building-a", "building-d", "building-n"];
export function makeCoinBuilding(kit, coin, mine) {
  const g = new THREE.Group(); g.name = "coin:" + coin.token;
  const mc = Number(coin.marketCapUsd) || 0;
  const tier = Math.max(0, Math.min(COIN_MODELS.length - 1, Math.floor(Math.log10(Math.max(1, mc)) - 2)));
  const b = prop(kit, COIN_MODELS[tier], { s: 1.8 + tier * 0.12, ry: Math.PI });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.2, 32), solid(mine ? 0x123d2a : 0x161f2c, { metalness: 0.3 })); pad.position.y = 0.1;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.05, 8, 64), glow(mine ? C.green : C.blue, mine ? 2.2 : 1.1)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.21;
  g.add(pad, rim); if (b) { b.position.y = 0.2; g.add(b); }
  const h = (b ? b.userData.h : 2) + 0.2;
  const fmt = mc >= 1e6 ? "$" + (mc / 1e6).toFixed(2) + "M" : mc >= 1e3 ? "$" + (mc / 1e3).toFixed(1) + "K" : "$" + Math.round(mc);
  const tag = label("$" + String(coin.symbol || "?").slice(0, 10), { accent: mine ? "#39ff88" : "#4f9dff", size: 0.62, sub: mine ? "yours · " + fmt : fmt });
  tag.position.y = h + 1.6; g.add(tag);
  g.userData = { coin, mine, radius: 2.5, spin: [], tag, pulse: 0 };
  if (mine) { const bc = makeBeacon(C.green, 14); g.add(bc); g.userData.spin.push(bc.userData.spin); }
  // the coin's own logo on a billboard over the roof (data: logos always; https ones when the host allows it)
  if (coin.imageUrl) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false });
    const L = new THREE.TextureLoader(); L.setCrossOrigin("anonymous");
    L.load(coin.imageUrl, (t) => { t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.opacity = 1; m.needsUpdate = true; }, undefined, () => {});
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), m); logo.position.set(0, h + 0.55, 0); g.add(logo);
    g.userData.spin.push((dt, t) => { logo.rotation.y = t * 0.8; });
  }
  // a pulse when its market cap climbs (refreshCoins sets userData.pulse)
  g.userData.spin.push((dt) => { const u = g.userData; if (u.pulse > 0) { u.pulse = Math.max(0, u.pulse - dt * 0.5); rim.material.emissiveIntensity = (mine ? 2.2 : 1.1) + u.pulse * 6; rim.scale.setScalar(1 + u.pulse * 0.25); } });
  return g;
}

// a pillar of light: quest targets and your own coins
export function makeBeacon(color = C.cyan, h = 18) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, h, 20, 1, true), m); beam.position.y = h / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  const g = new THREE.Group(); g.add(beam, ring);
  g.userData.spin = (dt, t) => { m.opacity = 0.16 + Math.sin(t * 2.4) * 0.07; ring.scale.setScalar(1 + (t % 1.6) / 1.6 * 0.6); ring.material.opacity = 0.6 * (1 - (t % 1.6) / 1.6); };
  return g;
}

// district names, floating over each district
export function makeDistrictSigns() {
  const g = new THREE.Group();
  DISTRICTS.forEach((d) => {
    const col = "#" + d.color.toString(16).padStart(6, "0");
    const sp = label(d.name, { accent: col, color: col, size: 1.15 }); sp.material.opacity = 0.9;
    const o = new THREE.Group(); placeOn(o, dirOf(d.theta, d.phi), R); sp.position.y = d.id === "dark" ? 9 : 10.5; o.add(sp); g.add(o);
  });
  return g;
}

// a launch: a rocket leaves the Launchpad on a column of fire (a real ArcPad launch triggers it)
export function rocketLaunch(parent, at, color = C.green) {
  const g = new THREE.Group(); g.position.copy(at); g.quaternion.copy(parent.quaternion.clone().invert()); parent.add(g);
  const up = at.clone().normalize();
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const r = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.8, 20), glossy(0xe9f1f7)); hull.position.y = 1.4;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 20), glow(color, 2)); nose.position.y = 3.35;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.6, 14), glow(C.gold, 4)); flame.rotation.x = Math.PI; flame.position.y = -0.7;
  r.add(hull, nose, flame); g.add(r);
  const puffs = [], puffGeo = new THREE.SphereGeometry(0.5, 10, 8);
  const t0 = performance.now();
  return (dt) => {
    const k = (performance.now() - t0) / 1000;
    r.position.y = 6 + k * k * 14; flame.scale.set(1, 0.8 + Math.random() * 0.6, 1);
    if (k < 2.6 && Math.random() < 0.7) { const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.7, depthWrite: false })); p.position.set((Math.random() - 0.5) * 0.6, r.position.y - 1.2, (Math.random() - 0.5) * 0.6); g.add(p); puffs.push(p); }
    puffs.forEach((p) => { p.scale.multiplyScalar(1 + dt * 1.6); p.material.opacity *= 1 - dt * 1.2; });
    if (k > 4) { parent.remove(g); return false; }
    return true;
  };
}

// ---------------- world details: boards, district ground, lamps, smoke, weather, the whale, the hoverboard ----------------
// a sign whose face is a canvas the game redraws (the Exchange's price board)
export function makeBoard(w = 3.2, h = 1.6) {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = Math.round(512 * h / w);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const back = new THREE.Mesh(new RoundedBoxGeometry(w + 0.2, h + 0.2, 0.14, 3, 0.05), solid(C.panel2, { metalness: 0.5 })); back.position.z = -0.08;
  const g = new THREE.Group(); g.add(back, face);
  g.userData.draw = (fn) => { const c = cv.getContext("2d"); fn(c, cv.width, cv.height); tex.needsUpdate = true; };
  return g;
}
// each district's ground takes its colour (a thin cap on the sphere)
export function makeDistrictTints() {
  const g = new THREE.Group();
  DISTRICTS.forEach((d) => {
    const cap = d.id === "dark" ? 16 : d.id === "coins" ? 13 : 11;
    const m = new THREE.Mesh(new THREE.SphereGeometry(R + 0.03, 48, 6, 0, Math.PI * 2, 0, THREE.MathUtils.degToRad(cap)), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: d.id === "dark" ? 0.2 : 0.09, depthWrite: false }));
    m.quaternion.setFromUnitVectors(UP, dirOf(d.id === "coins" ? 48 : d.id === "dark" ? 72 : d.theta - 9, d.phi)); m.renderOrder = 1; g.add(m);
  });
  return g;
}
// street lamps around the shop ring; they light up at night
export function makeLamps() {
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6); pole.translate(0, 1.3, 0);
  const head = new THREE.SphereGeometry(0.22, 12, 8); head.translate(0, 2.7, 0);
  const pts = []; for (let ph = 9; ph < 360; ph += 18) pts.push([31.5, ph]);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 0.2 });
  const poles = new THREE.InstancedMesh(pole, solid(0x2a3442, { metalness: 0.5 }), pts.length), heads = new THREE.InstancedMesh(head, lampMat, pts.length);
  const o = new THREE.Object3D();
  pts.forEach(([th, ph], i) => { placeOn(o, dirOf(th, ph), R - 0.02); o.updateMatrix(); poles.setMatrixAt(i, o.matrix); heads.setMatrixAt(i, o.matrix); });
  const g = new THREE.Group(); g.add(poles, heads);
  g.userData.night = (k) => { lampMat.emissiveIntensity = 0.2 + k * 3.2; };
  return g;
}
// a column of smoke puffs (chimneys)
export function smoke(parent, at, { rate = 0.35, color = 0xd5dde6 } = {}) {
  const geo = new THREE.SphereGeometry(0.35, 8, 6), puffs = []; let acc = 0;
  return (dt) => {
    acc += dt; if (acc > rate) { acc = 0; const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })); m.position.copy(at); parent.add(m); puffs.push({ m, t: 0, dx: (Math.random() - 0.5) * 0.3 }); }
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; p.m.position.y += dt * 1.1; p.m.position.x += p.dx * dt; p.m.scale.setScalar(1 + p.t * 1.2); p.m.material.opacity = 0.45 * (1 - p.t / 3); if (p.t > 3) { parent.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); } }
  };
}
// rain around the camera (a falling market) and an aurora (a rising one)
export function makeRain(n = 900) {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) p.set([(Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60], i * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9cc8ff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false }));
  pts.userData.update = (dt, center) => { pts.position.set(center.x, center.y - 4, center.z); const a = geo.attributes.position.array; for (let i = 1; i < a.length; i += 3) { a[i] -= dt * 22; if (a[i] < 0) a[i] += 30; } geo.attributes.position.needsUpdate = true; };
  return pts;
}
export function makeAurora() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, uniforms: { t: { value: 0 } },
    vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float t; varying vec2 vU; void main(){ float w = sin(vU.x * 18.0 + t * 0.7) * 0.5 + 0.5; float band = smoothstep(0.0, 0.35, vU.y) * smoothstep(1.0, 0.45, vU.y); vec3 c = mix(vec3(0.21,0.85,0.82), vec3(0.22,1.0,0.53), w); gl_FragColor = vec4(c, band * (0.25 + 0.25 * w)); }",
  });
  const g = new THREE.Mesh(new THREE.CylinderGeometry(R * 2.2, R * 2.2, R * 0.9, 96, 1, true), m);
  g.position.y = R * 1.4; g.userData.update = (dt, t) => { m.uniforms.t.value = t; };
  return g;
}
// a whale across the sky (a big $ARCIRCLE trade)
export function makeWhale() {
  const g = new THREE.Group(), mat = glossy(0x2b6fd6, { emissive: 0x153a7a, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat); body.scale.set(4.2, 1.5, 1.7);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), glossy(0xbfe1ff)); belly.scale.set(3.6, 0.9, 1.3); belly.position.set(0.3, -0.55, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 4), mat); tail.rotation.z = Math.PI / 2; tail.scale.set(1, 1, 0.25); tail.position.x = -4.6;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 3), mat); fin.position.set(0.8, -0.9, 1.3); fin.rotation.x = 1.2;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(C.cyan, 3)); eye.position.set(3.2, 0.2, 0.95);
  g.add(body, belly, tail, fin, eye);
  g.userData.tail = tail;
  return g;
}
// the hoverboard under the player's feet
export function makeHoverboard() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.1, 2.0, 3, 0.04), glossy(0x0f1726, { metalness: 0.6 }));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 1.7), glow(C.green, 2.4));
  const jetA = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 24), glow(C.cyan, 3)), jetB = jetA.clone();
  jetA.rotation.x = jetB.rotation.x = Math.PI / 2; jetA.position.set(0, -0.08, 0.6); jetB.position.set(0, -0.08, -0.6);
  g.add(deck, stripe, jetA, jetB); g.position.y = 0.35;
  g.userData.update = (t) => { g.position.y = 0.35 + Math.sin(t * 6) * 0.05; jetA.material.emissiveIntensity = 2.5 + Math.sin(t * 30) * 0.6; };
  return g;
}
// a speech bubble over an NPC
export function bubble(text, accent = "#ff7ad9") { const sp = label(text, { accent, size: 0.55 }); sp.position.y = 3.3; return sp; }
