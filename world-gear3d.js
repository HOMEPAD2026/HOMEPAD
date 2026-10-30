// world-gear3d.js — the ARCIRCLE look for things you hold and ride, built in code: a white glossy shell, dark grips and
// lines of light in the piece's colour (its rarity, for gear). The five weapon kinds (dual swords, plasma hammer, energy
// blaster, energy bow, magic staff), the hoverboard, the companion drone, the ∞ landmark and the frame around a gate.
//
// Each weapon is built in its own hand frame: the hand grips at the origin, +Y is up and +Z points forward. hold says
// how world-rpg.js should turn it at rest: "down" (a blade hanging), "up" (a staff, a hammer), "fwd" (a blaster or a bow).
import * as THREE from "./vendor/three/three-0.186.1.module.min.js";
import { RoundedBoxGeometry } from "./vendor/three/addons/RoundedBoxGeometry.js";
import { mergeGeometries } from "./vendor/three/addons/BufferGeometryUtils.js";

export const WEAPON_KINDS = [
  { id: "swords", name: "Dual Swords", line: "Fast three-hit combo up close" },
  { id: "hammer", name: "Plasma Hammer", line: "Slow, heavy swings; every third one slams all around you" },
  { id: "blaster", name: "Energy Blaster", line: "Quick energy shots at range; every third is a burst of three" },
  { id: "bow", name: "Energy Bow", line: "Long-range arrows that pierce; every third fans out three" },
  { id: "staff", name: "Magic Staff", line: "Seeking orbs that splash; every third is a big one" },
];
/// a weapon's kind: chosen in the Forge (it.k), or else settled by its id so every piece keeps the same one
export function weaponKind(it) {
  if (!it) return 0;
  if (Number.isInteger(it.k) && it.k >= 0 && it.k < 5) return it.k;
  let h = 7; for (const ch of String(it.id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 5;
}

// (perf batch 7) phones get a MeshStandard where a MeshPhysical is asked for, its own keys (clearcoat, sheen …) dropped:
// the glowing and see-through ones world-play.js's add-time swap leaves alone compiled the heavy shader on phones
const PHYS_KEYS = ["clearcoat", "clearcoatRoughness", "clearcoatMap", "clearcoatRoughnessMap", "clearcoatNormalMap", "clearcoatNormalScale", "sheen", "sheenColor", "sheenColorMap", "sheenRoughness", "sheenRoughnessMap",
  "transmission", "transmissionMap", "thickness", "thicknessMap", "attenuationDistance", "attenuationColor", "ior", "reflectivity", "specularIntensity", "specularIntensityMap", "specularColor", "specularColorMap",
  "iridescence", "iridescenceMap", "iridescenceIOR", "iridescenceThicknessRange", "iridescenceThicknessMap", "anisotropy", "anisotropyRotation", "anisotropyMap", "dispersion"];
let physCoarse = null;
export function physMat(o = {}) {
  if (physCoarse === null) { try { physCoarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches; } catch { physCoarse = false; } }
  if (!physCoarse) return new THREE.MeshPhysicalMaterial(o);
  const s = { ...o }; for (const k of PHYS_KEYS) delete s[k]; return new THREE.MeshStandardMaterial(s);
}
const shellMat = () => physMat({ color: 0xf2f6fa, roughness: 0.28, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12 });
const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.45, metalness: 0.5 });
const trimMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.7 });
const glowMat = (c, k = 2.2) => { const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.25, metalness: 0.1 }); m.userData.glow = true; return m; }; // glow: left alone by hit flashes and tints
const crystalMat = (c) => physMat({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.05, transparent: true, opacity: 0.9, flatShading: true });
const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const done = (g, hold) => { const b = new THREE.Box3().setFromObject(g); g.userData.size = b.getSize(new THREE.Vector3()); g.userData.hold = hold; return g; };

// ---------------- the weapons ----------------
function sword(c, tier, glow) {
  const g = new THREE.Group(), L = 0.95 + tier * 0.05;
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 10), darkMat(), 0, -0.05, 0)); // grip
  g.add(mesh(new THREE.SphereGeometry(0.065, 10, 8), shellMat(), 0, -0.22, 0)); // pommel
  const guard = mesh(rbox(0.36, 0.08, 0.12, 0.03), shellMat(), 0, 0.13, 0); g.add(guard);
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.025, 0.13), glowMat(c, 1.6 + glow), 0, 0.13, 0));
  // the blade: a long flat diamond, a line of light down its middle
  const s = new THREE.Shape(); s.moveTo(-0.07, 0); s.lineTo(0.07, 0); s.lineTo(0.075, L * 0.82); s.lineTo(0, L); s.lineTo(-0.075, L * 0.82); s.closePath();
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 }); bg.translate(0, 0, -0.015);
  g.add(mesh(bg, physMat({ color: new THREE.Color(0xe6f6ff).lerp(new THREE.Color(c), 0.35), roughness: 0.12, metalness: 0.55, clearcoat: 1, emissive: c, emissiveIntensity: 0.25 + glow }), 0, 0.17, 0));
  g.add(mesh(new THREE.BoxGeometry(0.035, L * 0.8, 0.07), glowMat(c, 3 + glow), 0, 0.17 + L * 0.42, 0));
  return done(g, "down");
}
function hammer(c, tier, glow) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.95, 10), darkMat(), 0, 0.25, 0));
  for (const y of [-0.12, 0.2, 0.55]) g.add(mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.05, 12), shellMat(), 0, y, 0));
  const head = new THREE.Group(); head.position.y = 0.84;
  head.add(mesh(rbox(0.62 + tier * 0.03, 0.34, 0.34, 0.08), shellMat()));
  for (const s of [-1, 1]) { head.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.08, 20), darkMat(), s * 0.34, 0, 0).rotateZ(Math.PI / 2)); head.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 20), glowMat(c, 2.4 + glow), s * 0.36, 0, 0).rotateZ(Math.PI / 2)); }
  head.add(mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), glowMat(c, 2 + glow), 0, 0, 0.175));
  head.add(mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), glowMat(c, 2 + glow), 0, 0, -0.175));
  g.add(head);
  return done(g, "up"); // held upright: hung head-down it would drag along the ground
}
function blaster(c, tier, glow) {
  const g = new THREE.Group(), L = 0.62 + tier * 0.03;
  g.add(mesh(rbox(0.16, 0.28, 0.14, 0.04), darkMat(), 0, -0.06, -0.02).rotateX(-0.25)); // the grip
  g.add(mesh(rbox(0.22, 0.24, L, 0.07), shellMat(), 0, 0.17, L * 0.28)); // the body
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.3, 16), darkMat(), 0, 0.17, L * 0.62 + 0.1).rotateX(Math.PI / 2)); // barrel
  g.add(mesh(new THREE.TorusGeometry(0.085, 0.022, 8, 24), glowMat(c, 2.6 + glow), 0, 0.17, L * 0.62 + 0.26)); // muzzle ring
  g.add(mesh(new THREE.CapsuleGeometry(0.05, L * 0.45, 4, 10), glowMat(c, 2 + glow), 0, 0.31, L * 0.26).rotateX(Math.PI / 2)); // energy cell
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.06, L * 0.6), glowMat(c, 1.6 + glow), s * 0.115, 0.15, L * 0.28));
  return done(g, "fwd");
}
function bow(c, tier, glow) {
  const g = new THREE.Group(), R = 0.6 + tier * 0.02, arc = 2.3;
  // the limbs: an arc in the upright plane bulging forward (+Z), the grip at its middle, the string behind
  const limb = new THREE.TorusGeometry(R, 0.035, 8, 40, arc); limb.rotateZ(-arc / 2);
  const lm = mesh(limb, shellMat()); lm.rotation.y = -Math.PI / 2; lm.position.z = -R; g.add(lm);
  const inner = new THREE.TorusGeometry(R - 0.045, 0.014, 6, 40, arc * 0.92); inner.rotateZ(-(arc * 0.92) / 2);
  const im = mesh(inner, glowMat(c, 2.4 + glow)); im.rotation.y = -Math.PI / 2; im.position.z = -R; g.add(im);
  const tipY = Math.sin(arc / 2) * R, tipZ = Math.cos(arc / 2) * R - R;
  g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, tipY * 2, 4), glowMat(0xffffff, 1.4), 0, 0, tipZ));
  g.add(mesh(rbox(0.1, 0.28, 0.1, 0.03), darkMat(), 0, 0, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.OctahedronGeometry(0.06, 0), crystalMat(c), 0, s * tipY, tipZ));
  return done(g, "fwd");
}
function staff(c, tier, glow) {
  const g = new THREE.Group(), L = 1.5 + tier * 0.06;
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, L, 10), darkMat(), 0, L / 2 - 0.45, 0));
  for (const y of [-0.38, 0.1, L - 0.75]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), trimMat(0xd9a640), 0, y, 0));
  const top = new THREE.Group(); top.position.y = L - 0.36;
  const crescent = new THREE.TorusGeometry(0.2, 0.03, 8, 28, Math.PI * 1.5); crescent.rotateZ(-Math.PI * 0.25);
  top.add(mesh(crescent, trimMat(0xd9a640)));
  top.add(mesh(new THREE.SphereGeometry(0.15, 20, 16), physMat({ color: c, emissive: c, emissiveIntensity: 1.4 + glow, roughness: 0.05, transparent: true, opacity: 0.92 }), 0, 0.03, 0));
  top.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), glowMat(0xffffff, 2.6), 0, 0.03, 0));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; top.add(mesh(new THREE.OctahedronGeometry(0.04, 0), crystalMat(c), Math.cos(a) * 0.3, 0.05 + (i - 1) * 0.06, Math.sin(a) * 0.3)); }
  g.add(top); g.userData.spinTop = top;
  return done(g, "up");
}
const BUILD = [sword, hammer, blaster, bow, staff];
/// a weapon of kind (0–4) and tier (0–4) in the rarity colour; glow 0–0.6 makes the rarer ones shine
export function weapon(kind, tier = 0, color = 0x38e8ff, glow = 0) { const g = (BUILD[kind] || sword)(color, tier, glow); g.name = "weapon:" + WEAPON_KINDS[kind || 0].id; return g; }
/// the off-hand blade of the dual swords: a little shorter
export function offBlade(tier, color, glow) { const g = sword(color, Math.max(0, tier - 1), glow); g.scale.setScalar(0.85); return done(g, "down"); }

// ---------------- the hoverboard: a white deck, a dark grip pad, glowing rails and two thrusters ----------------
export function hoverboard(color = 0x38e8ff) {
  const g = new THREE.Group();
  const deck = mesh(rbox(0.9, 0.12, 2.1, 0.06), shellMat()); g.add(deck);
  g.add(mesh(rbox(0.7, 0.03, 1.7, 0.02), darkMat(), 0, 0.07, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 1.9), glowMat(color, 2.6), s * 0.45, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.02, 0.05), glowMat(color, 2.4), 0, 0.09, 0.62));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.02, 0.05), glowMat(color, 2.4), 0, 0.09, -0.62));
  const jets = [0.62, -0.62].map((z) => { const j = new THREE.Group(); j.position.set(0, -0.09, z);
    j.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 24), darkMat()));
    const core = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 24), glowMat(color, 3)); j.add(core); g.add(j); return core; });
  const under = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  under.rotation.x = -Math.PI / 2; under.position.y = -0.3; g.add(under);
  g.position.y = 0.35;
  g.userData.update = (t) => { g.position.y = 0.35 + Math.sin(t * 6) * 0.05; jets.forEach((j, i) => (j.material.emissiveIntensity = 2.6 + Math.sin(t * 30 + i) * 0.6)); under.material.opacity = 0.2 + Math.sin(t * 6) * 0.06; };
  return g;
}

// ---------------- the companion drone: a round white head, a dark visor, two eyes of light, little ears ----------------
export function miniDrone() {
  const g = new THREE.Group();
  const head = mesh(new THREE.SphereGeometry(0.26, 24, 18), shellMat()); head.scale.set(1.08, 0.95, 1); g.add(head);
  const visor = mesh(new THREE.SphereGeometry(0.25, 28, 16, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.3, Math.PI * 0.36), physMat({ color: 0x0a0f18, roughness: 0.1, clearcoat: 1 }));
  visor.scale.set(1.08, 0.95, 1.06); visor.position.z = 0.02; g.add(visor);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.CapsuleGeometry(0.03, 0.05, 4, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 2.6) }), s * 0.08, 0.01, 0.285); g.add(eye);
    const ear = mesh(new THREE.ConeGeometry(0.07, 0.13, 4), shellMat(), s * 0.15, 0.24, 0); ear.rotation.z = -s * 0.35; g.add(ear);
    g.add(mesh(new THREE.ConeGeometry(0.035, 0.07, 4), glowMat(0x38e8ff, 1.8), s * 0.15, 0.25, 0.02).rotateZ(-s * 0.35));
  }
  const jet = mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.06, 12), glowMat(0x38e8ff, 2.6), 0, -0.25, 0); g.add(jet);
  return g;
}

// ---------------- the ∞ landmark: two loops of light on a round plinth ----------------
export function infinityStatue(scale = 1) {
  const g = new THREE.Group();
  const plinth = mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.6, 8), shellMat(), 0, 0.3, 0); g.add(plinth);
  g.add(mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.5, 8), shellMat(), 0, 0.85, 0));
  g.add(mesh(new THREE.TorusGeometry(2.36, 0.05, 6, 8), glowMat(0x38e8ff, 2.2), 0, 0.6, 0).rotateX(Math.PI / 2).rotateZ(Math.PI / 8));
  // a lemniscate: x = a cos t / (1 + sin² t), y = a sin t cos t / (1 + sin² t)
  const pts = []; for (let i = 0; i <= 160; i++) { const t = (i / 160) * Math.PI * 2, d = 1 + Math.sin(t) ** 2; pts.push(new THREE.Vector3((2.2 * Math.cos(t)) / d, (2.2 * Math.sin(t) * Math.cos(t)) / d, Math.sin(t * 2) * 0.12)); }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const loop = new THREE.Group(); loop.position.y = 3.2;
  loop.add(mesh(new THREE.TubeGeometry(curve, 240, 0.28, 16, true), physMat({ color: 0x2f86ff, roughness: 0.15, metalness: 0.3, clearcoat: 1, emissive: 0x0d3c8a, emissiveIntensity: 0.6 })));
  loop.add(mesh(new THREE.TubeGeometry(curve, 240, 0.1, 8, true), glowMat(0x9ff6ff, 2.6)));
  g.add(loop); g.userData.loop = loop;
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.32, 2.2, 16), shellMat(), 0, 2.15, 0));
  g.add(mesh(new THREE.TorusGeometry(0.27, 0.04, 8, 24), glowMat(0x38e8ff, 2.4), 0, 1.6, 0).rotateX(Math.PI / 2));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(mesh(new THREE.OctahedronGeometry(0.16, 0), crystalMat(i % 2 ? 0x2ee07a : 0x38e8ff), Math.cos(a) * 1.85, 1.25, Math.sin(a) * 1.85)); }
  g.scale.setScalar(scale);
  return g;
}

// ---------------- a frame around a gate: two white pillars with inlays of light and an arch over the top ----------------
export function gateFrame(color = 0x38e8ff, w = 2.8, h = 3.5) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(mesh(rbox(0.5, h, 0.6, 0.08), shellMat(), s * w, h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, h * 0.7, 0.62), glowMat(color, 2.2), s * w, h * 0.5, 0));
    g.add(mesh(rbox(0.7, 0.3, 0.8, 0.06), darkMat(), s * w, 0.15, 0));
    g.add(mesh(new THREE.OctahedronGeometry(0.22, 0), crystalMat(color), s * w, h + 0.35, 0));
  }
  const arch = mesh(new THREE.TorusGeometry(w, 0.22, 10, 40, Math.PI), shellMat(), 0, h, 0); g.add(arch);
  g.add(mesh(new THREE.TorusGeometry(w, 0.06, 6, 40, Math.PI), glowMat(color, 2.4), 0, h, 0.2));
  g.add(mesh(new THREE.OctahedronGeometry(0.34, 0), crystalMat(color), 0, h + w + 0.45, 0));
  return g;
}

// ---------------- a potion: a round glass flask, coloured liquid, a white cap and a glowing mark (heart or bolt) ----------------
export function potion(color = 0xff4d6d, mark = "heart") {
  const g = new THREE.Group();
  const glass = physMat({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 });
  g.add(mesh(new THREE.SphereGeometry(0.3, 24, 18), glass, 0, 0, 0));
  g.add(mesh(new THREE.SphereGeometry(0.26, 24, 18, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.2 }), 0, 0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 16), glass, 0, 0.33, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), shellMat(), 0, 0.46, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.025, 16), glowMat(color, 2.2), 0, 0.41, 0));
  const sh = new THREE.Shape();
  if (mark === "heart") { sh.moveTo(0, -0.09); sh.bezierCurveTo(-0.13, 0, -0.08, 0.1, 0, 0.04); sh.bezierCurveTo(0.08, 0.1, 0.13, 0, 0, -0.09); }
  else { sh.moveTo(0.02, 0.1); sh.lineTo(-0.06, -0.01); sh.lineTo(0, -0.01); sh.lineTo(-0.02, -0.1); sh.lineTo(0.06, 0.01); sh.lineTo(0, 0.01); sh.closePath(); }
  g.add(mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide }), 0, 0, 0.305));
  return g;
}

// ---------------- a token: a thick coin with a bevelled rim, a face (a texture, or a raised star) and a ring of light ----------------
export function token(color = 0xffb83d, faceTex = null, star = false) {
  const g = new THREE.Group(), rim = trimMat(color); rim.metalness = 0.85; rim.roughness = 0.22;
  const body = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 40), rim); body.rotation.x = Math.PI / 2; g.add(body);
  for (const z of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 40), rim, 0, 0, z * 0.05); g.add(ring);
    const face = mesh(new THREE.CircleGeometry(0.34, 40), faceTex ? new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, metalness: 0.4, emissive: color, emissiveIntensity: 0.15 }) : new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), roughness: 0.3, metalness: 0.7 }), 0, 0, z * 0.052);
    if (z < 0) face.rotation.y = Math.PI; g.add(face);
    if (star) { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.1 : 0.24, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const sg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }); const sm = mesh(sg, glowMat(0xffffff, 1.6), 0, 0, z * 0.055); if (z < 0) sm.rotation.y = Math.PI; g.add(sm); }
  }
  g.add(mesh(new THREE.TorusGeometry(0.47, 0.012, 6, 48), glowMat(color, 2.4)));
  return g;
}

// ---------------- the scammers, redrawn as villain bots: a dark glossy shell, red light, a little white trim ----------------
// They take the place of the three robot models (EyeDrone → the spam drone, QuadShell → the fake airdrop crate,
// Trilobite → the rug crawler), at the same size, with their own clips (Idle, Run, Attack, Hit, TurnOff, BackFlip), so
// every scammer, stage boss, gatekeeper and raid boss that used those models wears the new look.
const vShell = () => physMat({ color: 0x232b3a, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 });
const vRed = (k = 2.4) => glowMat(0xff1f3d, Math.min(1.6, k * 0.6));
const part = (name, ...kids) => { const g = new THREE.Group(); g.name = name; kids.forEach((k) => g.add(k)); return g; };
const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
const track = (name, prop, times, values) => (prop === "quaternion" ? new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values.flat()) : new THREE.VectorKeyframeTrack(`${name}.${prop}`, times, values.flat()));
const clip = (name, dur, tracks) => new THREE.AnimationClip(name, dur, tracks);

function spamDrone() {
  const body = part("v-body");
  body.add(mesh(new THREE.SphereGeometry(0.5, 28, 20), vShell()));
  body.add(mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 40), shellMat()).rotateX(Math.PI / 2));
  const eye = part("v-eye", mesh(new THREE.SphereGeometry(0.22, 20, 16), physMat({ color: 0x0a0d14, roughness: 0.1, clearcoat: 1 })), mesh(new THREE.SphereGeometry(0.12, 16, 12), vRed(3), 0, 0, 0.13), mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 32), vRed(2)));
  eye.position.set(0, 0.04, 0.42); body.add(eye);
  for (const s of [-1, 1]) { const fin = part(s < 0 ? "v-finL" : "v-finR", mesh(rbox(0.5, 0.06, 0.26, 0.03), shellMat(), s * 0.25, 0, 0), mesh(new THREE.BoxGeometry(0.36, 0.07, 0.04), vRed(2), s * 0.27, 0, 0.12)); fin.position.set(s * 0.45, 0.05, 0); body.add(fin); }
  const ant = part("v-ant", mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), shellMat(), 0, 0.16, 0), mesh(new THREE.SphereGeometry(0.06, 10, 8), vRed(3), 0, 0.34, 0)); ant.position.y = 0.46; body.add(ant);
  body.add(mesh(new THREE.ConeGeometry(0.16, 0.24, 16), vRed(2.6), 0, -0.55, 0).rotateX(Math.PI));
  const root = part("v-root", body);
  const t4 = [0, 0.4, 0.8, 1.2];
  const clips = [
    clip("Idle", 1.6, [track("v-body", "position", [0, 0.8, 1.6], [[0, 0, 0], [0, 0.08, 0], [0, 0, 0]]), track("v-ant", "quaternion", [0, 0.8, 1.6], [Q(0, 0, 0.15), Q(0, 0, -0.15), Q(0, 0, 0.15)])]),
    clip("Run", 0.4, [track("v-body", "quaternion", [0, 0.2, 0.4], [Q(0.25, 0, 0.08), Q(0.25, 0, -0.08), Q(0.25, 0, 0.08)]), track("v-finL", "quaternion", [0, 0.1, 0.2, 0.3, 0.4], [Q(0, 0, 0.5), Q(0, 0, -0.3), Q(0, 0, 0.5), Q(0, 0, -0.3), Q(0, 0, 0.5)]), track("v-finR", "quaternion", [0, 0.1, 0.2, 0.3, 0.4], [Q(0, 0, -0.5), Q(0, 0, 0.3), Q(0, 0, -0.5), Q(0, 0, 0.3), Q(0, 0, -0.5)])]),
    clip("Attack", 0.6, [track("v-body", "position", [0, 0.2, 0.3, 0.6], [[0, 0, 0], [0, 0, -0.3], [0, 0, 0.5], [0, 0, 0]]), track("v-eye", "scale", [0, 0.2, 0.3, 0.6], [[1, 1, 1], [1.4, 1.4, 1.4], [0.9, 0.9, 0.9], [1, 1, 1]])]),
    clip("Hit", 0.35, [track("v-body", "quaternion", [0, 0.1, 0.35], [Q(0, 0, 0), Q(-0.5, 0.3, 0.2), Q(0, 0, 0)])]),
    clip("TurnOff", 1.2, [track("v-body", "position", [0, 1.2], [[0, 0, 0], [0, -0.6, 0]]), track("v-body", "quaternion", [0, 1.2], [Q(0, 0, 0), Q(0.9, 0, 0.6)]), track("v-eye", "scale", [0, 0.6, 1.2], [[1, 1, 1], [1, 0.2, 1], [0.6, 0.05, 0.6]])]),
    clip("BackFlip", 0.9, [track("v-body", "quaternion", t4, [Q(0, 0, 0), Q(-2.1, 0, 0), Q(-4.2, 0, 0), Q(-6.283, 0, 0)]), track("v-body", "position", t4, [[0, 0, 0], [0, 0.7, 0], [0, 0.7, 0], [0, 0, 0]])]),
  ];
  return { scene: root, clips };
}
function dropCrate() {
  const body = part("v-body");
  body.add(mesh(rbox(1.0, 0.8, 1.0, 0.1), shellMat(), 0, 0.4, 0));
  for (const r of [0, Math.PI / 2]) body.add(mesh(new THREE.BoxGeometry(1.04, 0.82, 0.14), vRed(1.8), 0, 0.4, 0).rotateY(r));
  const lid = part("v-lid", mesh(rbox(1.1, 0.2, 1.1, 0.06), vShell(), 0, 0.1, 0.5), mesh(new THREE.TorusKnotGeometry(0.14, 0.04, 40, 6, 2, 3), vRed(2.4), 0, 0.3, 0.5));
  lid.position.set(0, 0.8, -0.5); body.add(lid);
  for (const s of [-1, 1]) body.add(mesh(new THREE.CapsuleGeometry(0.06, 0.08, 4, 8), vRed(3), s * 0.18, 0.5, 0.52).rotateZ(Math.PI / 2));
  const legs = [];
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) { const l = part(`v-leg${legs.length}`, mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.4, 8), vShell(), 0, -0.2, 0), mesh(new THREE.SphereGeometry(0.09, 10, 8), shellMat(), 0, -0.4, 0)); l.position.set(x, 0.05, z); body.add(l); legs.push(l); }
  body.position.y = 0.4;
  const root = part("v-root", body);
  const step = (a) => [0, 0.15, 0.3].map((t, i) => ({ t, q: Q(i === 1 ? a : -a, 0, 0) }));
  const legTracks = legs.map((l, i) => { const a = i % 3 === 0 ? 0.6 : -0.6; return track(l.name, "quaternion", [0, 0.15, 0.3], step(a).map((x) => x.q)); });
  const clips = [
    clip("Idle", 1.4, [track("v-lid", "quaternion", [0, 0.7, 1.4], [Q(0, 0, 0), Q(-0.25, 0, 0), Q(0, 0, 0)]), track("v-body", "scale", [0, 0.7, 1.4], [[1, 1, 1], [1.03, 0.97, 1.03], [1, 1, 1]])]),
    clip("Run", 0.3, [...legTracks, track("v-body", "position", [0, 0.075, 0.15, 0.225, 0.3], [[0, 0.4, 0], [0, 0.48, 0], [0, 0.4, 0], [0, 0.48, 0], [0, 0.4, 0]])]),
    clip("Attack", 0.6, [track("v-lid", "quaternion", [0, 0.2, 0.6], [Q(0, 0, 0), Q(-1.6, 0, 0), Q(0, 0, 0)]), track("v-body", "position", [0, 0.2, 0.3, 0.6], [[0, 0.4, 0], [0, 0.8, 0], [0, 0.4, 0.4], [0, 0.4, 0]])]),
    clip("Hit", 0.35, [track("v-body", "scale", [0, 0.1, 0.35], [[1, 1, 1], [1.2, 0.8, 1.2], [1, 1, 1]])]),
    clip("TurnOff", 1.2, [track("v-lid", "quaternion", [0, 1.2], [Q(0, 0, 0), Q(-2.2, 0, 0)]), track("v-body", "scale", [0, 1.2], [[1, 1, 1], [1.15, 0.55, 1.15]])]),
    clip("BackFlip", 0.9, [track("v-body", "quaternion", [0, 0.3, 0.6, 0.9], [Q(0, 0, 0), Q(-2.1, 0, 0), Q(-4.2, 0, 0), Q(-6.283, 0, 0)]), track("v-body", "position", [0, 0.3, 0.6, 0.9], [[0, 0.4, 0], [0, 1.3, 0], [0, 1.3, 0], [0, 0.4, 0]])]),
  ];
  return { scene: root, clips };
}
function rugCrawler() {
  const body = part("v-body");
  const shellM = mesh(new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), vShell()); shellM.scale.set(1, 0.55, 1.35); body.add(shellM);
  // the rug on its back: purple with a red woven border, rippling
  const rug = part("v-rug", mesh(new THREE.BoxGeometry(0.95, 0.04, 1.35), new THREE.MeshStandardMaterial({ color: 0x5a2a8a, roughness: 0.9 }), 0, 0, 0), mesh(new THREE.BoxGeometry(1.0, 0.03, 1.4), vRed(1.4), 0, -0.01, 0));
  rug.position.y = 0.34; body.add(rug);
  for (let i = -2; i <= 2; i++) body.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), glowMat(0xffc861, 1.8), i * 0.18, 0.37, 0.72));
  for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.08, 12, 10), vRed(3), s * 0.2, 0.18, 0.74));
  body.add(mesh(rbox(0.5, 0.14, 0.12, 0.04), shellMat(), 0, 0.06, 0.8));
  const legs = [];
  for (const z of [-0.45, 0, 0.45]) for (const s of [-1, 1]) { const l = part(`v-leg${legs.length}`, mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.34, 6), vShell(), s * 0.12, -0.12, 0).rotateZ(s * 0.75)); l.position.set(s * 0.5, 0.08, z); body.add(l); legs.push(l); }
  const tail = part("v-tail", mesh(new THREE.ConeGeometry(0.1, 0.5, 8), vShell(), 0, 0, -0.25).rotateX(-Math.PI / 2), mesh(new THREE.SphereGeometry(0.06, 8, 6), vRed(3), 0, 0, -0.5)); tail.position.set(0, 0.12, -0.78); body.add(tail);
  body.position.y = 0.3;
  const root = part("v-root", body);
  const legTracks = legs.map((l, i) => track(l.name, "quaternion", [0, 0.1, 0.2], i % 2 ? [Q(0.5, 0, 0), Q(-0.5, 0, 0), Q(0.5, 0, 0)] : [Q(-0.5, 0, 0), Q(0.5, 0, 0), Q(-0.5, 0, 0)]));
  const clips = [
    clip("Idle", 1.6, [track("v-rug", "quaternion", [0, 0.8, 1.6], [Q(0.04, 0, 0), Q(-0.04, 0, 0), Q(0.04, 0, 0)]), track("v-tail", "quaternion", [0, 0.8, 1.6], [Q(0, 0.4, 0), Q(0, -0.4, 0), Q(0, 0.4, 0)])]),
    clip("Run", 0.2, [...legTracks, track("v-tail", "quaternion", [0, 0.1, 0.2], [Q(0, 0.3, 0), Q(0, -0.3, 0), Q(0, 0.3, 0)])]),
    clip("Attack", 0.55, [track("v-body", "quaternion", [0, 0.2, 0.3, 0.55], [Q(0, 0, 0), Q(-0.5, 0, 0), Q(0.3, 0, 0), Q(0, 0, 0)]), track("v-rug", "position", [0, 0.2, 0.3, 0.55], [[0, 0.34, 0], [0, 0.6, -0.2], [0, 0.34, 0.3], [0, 0.34, 0]])]),
    clip("Hit", 0.35, [track("v-body", "quaternion", [0, 0.1, 0.35], [Q(0, 0, 0), Q(0, 0, 0.35), Q(0, 0, 0)])]),
    clip("TurnOff", 1.2, [track("v-body", "quaternion", [0, 1.2], [Q(0, 0, 0), Q(0, 0, Math.PI)]), track("v-body", "position", [0, 1.2], [[0, 0.3, 0], [0, 0.55, 0]])]),
    clip("BackFlip", 0.9, [track("v-body", "quaternion", [0, 0.3, 0.6, 0.9], [Q(0, 0, 0), Q(-2.1, 0, 0), Q(-4.2, 0, 0), Q(-6.283, 0, 0)]), track("v-body", "position", [0, 0.3, 0.6, 0.9], [[0, 0.3, 0], [0, 1.2, 0], [0, 1.2, 0], [0, 0.3, 0]])]),
  ];
  return { scene: root, clips };
}
const VILLAIN = { EyeDrone: spamDrone, QuadShell: dropCrate, Trilobite: rugCrawler };
// the bottom and top of the robot models they replace (so every scale and height already tuned for those still fits)
const SIZE = { EyeDrone: [-1, 1], QuadShell: [-0.64, 0.64], Trilobite: [-0.87, 0.87], Angler: [-0.87, 0.87], Balloon: [-1, 1], BotDrone: [-1, 1] };
// fewer draw calls: inside each moving part, the meshes that share a look become one (the parts still move apart)
function mergeParts(root) {
  const key = (m) => [m.type, m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.clearcoat, !!m.userData.glow, m.transparent, m.opacity].join("|");
  root.traverse((part) => {
    const groups = new Map();
    for (const c of [...part.children]) { if (!c.isMesh || c.children.length) continue; const k = key(c.material); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((c) => { c.updateMatrix(); let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(c.matrix); for (const a of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(a)) g.deleteAttribute(a); if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; });
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      const m = new THREE.Mesh(merged, list[0].material); m.castShadow = true; part.add(m); list.forEach((c) => part.remove(c));
    }
  });
}
// b-nx3 (2026-10-26): Meshy's scammers (models/world/scammers, ~2.8 k tris, 512 px KTX2, 120–240 KB) as the villains' bodies:
// the model goes inside v-body and the same moves are keyed on it (a bob, a lean, a lunge, a squash, a fall, a flip), so
// every clip name the fights use (Idle / Run / Attack / Hit / TurnOff / BackFlip) is there. The drawn ones stay if a
// file doesn't come.
const MESHY_VILLAIN = { EyeDrone: "spam-bot", QuadShell: "fake-airdrop", Trilobite: "rug-gremlin" };
function meshyVillain(model, fly) {
  const body = part("v-body", model), root = part("v-root", body), y = fly ? 0.12 : 0.05;
  const clips = [
    clip("Idle", 1.6, [track("v-body", "position", [0, 0.8, 1.6], [[0, 0, 0], [0, fly ? 0.1 : 0.03, 0], [0, 0, 0]]), track("v-body", "scale", [0, 0.8, 1.6], [[1, 1, 1], [1.02, 0.98, 1.02], [1, 1, 1]])]),
    clip("Run", 0.36, [track("v-body", "position", [0, 0.09, 0.18, 0.27, 0.36], [[0, 0, 0], [0, y, 0], [0, 0, 0], [0, y, 0], [0, 0, 0]]), track("v-body", "quaternion", [0, 0.18, 0.36], [Q(0.18, 0, 0.1), Q(0.18, 0, -0.1), Q(0.18, 0, 0.1)])]),
    clip("Attack", 0.6, [track("v-body", "position", [0, 0.2, 0.3, 0.6], [[0, 0, 0], [0, 0.1, -0.3], [0, 0, 0.55], [0, 0, 0]]), track("v-body", "quaternion", [0, 0.2, 0.3, 0.6], [Q(0, 0, 0), Q(-0.35, 0, 0), Q(0.4, 0, 0), Q(0, 0, 0)])]),
    clip("Hit", 0.35, [track("v-body", "scale", [0, 0.1, 0.35], [[1, 1, 1], [1.18, 0.82, 1.18], [1, 1, 1]]), track("v-body", "quaternion", [0, 0.1, 0.35], [Q(0, 0, 0), Q(-0.35, 0.2, 0.15), Q(0, 0, 0)])]),
    clip("TurnOff", 1.2, [track("v-body", "quaternion", [0, 1.2], [Q(0, 0, 0), Q(0, 0, Math.PI / 2)]), track("v-body", "position", [0, 1.2], [[0, 0, 0], [0, -0.25, 0]]), track("v-body", "scale", [0, 1.2], [[1, 1, 1], [1.1, 0.7, 1.1]])]),
    clip("BackFlip", 0.9, [track("v-body", "quaternion", [0, 0.3, 0.6, 0.9], [Q(0, 0, 0), Q(-2.1, 0, 0), Q(-4.2, 0, 0), Q(-6.283, 0, 0)]), track("v-body", "position", [0, 0.3, 0.6, 0.9], [[0, 0, 0], [0, 0.9, 0], [0, 0.9, 0], [0, 0, 0]])]),
  ];
  return { scene: root, clips };
}
// the far grounds' own scammers (b-nx4): the Phishing Angler (Phishing Reef), the Pump Balloon (Ponzi Peaks), the Bot-Farm
// Drone (Bot Farm Wastes) — loaded with the creature pack, only when a ground that dresses its scammers comes near
const MESHY_EXTRA = { Angler: ["phishing-angler", false], Balloon: ["pump-balloon", true], BotDrone: ["bot-farm-drone", true] };
export function meshyExtras(kit, loader, ver = "") {
  if (!loader) return Promise.resolve(kit);
  return Promise.all(Object.entries(MESHY_EXTRA).map(([name, [file, fly]]) => new Promise((ok) => {
    try { loader().load(`/models/world/scammers/${file}.glb${ver}`, (g) => { try { place(kit, name, meshyVillain(g.scene, fly)); } catch (e) { console.warn("scammer", file, e); } ok(); }, undefined, () => ok()); } catch { ok(); }
  }))).then(() => kit);
}
// the Halloween Realm's monsters (2026-10-28, Meshy, raw/hr → models/world/hwrealm/mobs, ~4.5 k tris, 512 px KTX2): still
// bodies keyed with the same moves as the scammers'; Inferno Jack is the town's rigged one (models/world/halloween), its own
// clips renamed to the fights' (Idle / Run / Attack / Hit / TurnOff / BackFlip). Loaded when the realm is first built.
const MESHY_HW = { HwSlime: ["slime", false], HwScarecrow: ["scarecrow", false], HwGhost: ["ghost", true], HwTreant: ["treant", false], HwSkeleton: ["skeleton", false], HwWitch: ["witch", true] };
const JACK_CLIP = { Idle_02: "Idle", Running: "Run", Attack: "Attack", Fall_Dead: "TurnOff", Wall_Push_Jump_and_Flip: "BackFlip" };
// HX1 (2026-10-28): four of them are Meshy's rigs with their own clips (models/world/hwrealm/mobs/<file>-rig.glb, 0.45–0.7 MB:
// Walk / Run / Attack / Hit / TurnOff, the witch's Cast too; the treant only walks) — walking is their Run (the fights loop
// "Run"), a slow walk their Idle, and a clip a rig lacks comes from the keyed moves on its v-body; the slime and the ghost
// keep the keyed bounce / float (no bones to move). The still body stands in if a rig file doesn't come.
const HW_RIG = { HwScarecrow: "scarecrow", HwSkeleton: "skeleton", HwWitch: "witch", HwTreant: "treant" };
function rigged(g, fly) {
  const keyed = meshyVillain(g.scene, fly), have = new Map(g.animations.map((c) => [c.name, c])), out = [], add = (n, c) => { if (!c) return; const k = c.clone(); k.name = n; out.push(k); };
  const walk = have.get("Walk") || have.get("Run");
  add("Run", walk); if (walk) { const idle = walk.clone(); idle.name = "Idle"; for (const t of idle.tracks) t.scale(2.6); idle.resetDuration(); out.push(idle); }
  add("Attack", have.get("Cast") || have.get("Attack")); add("Hit", have.get("Hit")); { const h = out.find((o) => o.name === "Hit"); if (h) h.duration = Math.min(h.duration, 0.7); } add("TurnOff", have.get("TurnOff")); add("BackFlip", have.get("Attack"));
  for (const c of keyed.clips) if (!out.some((o) => o.name === c.name)) out.push(c);
  return { scene: keyed.scene, clips: out, rig: true };
}
export function meshyHw(kit, loader, ver = "") {
  if (!kit || !loader || kit.hwAsked) return Promise.resolve(kit); kit.hwAsked = true;
  const still = (name, file, fly, ok) => loader().load(`/models/world/hwrealm/mobs/${file}.glb${ver}`, (g) => { try { place(kit, name, meshyVillain(g.scene, fly)); } catch (e) { console.warn("hw mob", file, e); } ok(); }, undefined, () => ok());
  const jobs = Object.entries(MESHY_HW).map(([name, [file, fly]]) => new Promise((ok) => {
    try { if (HW_RIG[name]) loader().load(`/models/world/hwrealm/mobs/${file}-rig.glb${ver}`, (g) => { try { place(kit, name, rigged(g, fly)); ok(); } catch (e) { console.warn("hw rig", file, e); still(name, file, fly, ok); } }, undefined, () => still(name, file, fly, ok)); else still(name, file, fly, ok); } catch { ok(); }
  }));
  jobs.push(new Promise((ok) => { try { loader().load(`/models/world/halloween/inferno-jack.glb${ver}`, (g) => { try {
    const clips = []; for (const c of g.animations) { const n = JACK_CLIP[c.name]; if (n) { const k = c.clone(); k.name = n; clips.push(k); if (n === "Attack") { const h = c.clone(); h.name = "Hit"; h.duration = Math.min(h.duration, 0.35); clips.push(h); } } }
    place(kit, "HwJack", { scene: g.scene, clips }); } catch (e) { console.warn("hw jack", e); } ok(); }, undefined, () => ok()); } catch { ok(); } }));
  return Promise.all(jobs).then(() => kit);
}
// the near grounds' bosses (b-nx4, Meshy, models/world/bosses/<zone>.glb, 4.8 k tris, 0.25–0.4 MB): a body of their own,
// standing on the ground (a 2 m box from its feet), fetched as you come near the ground; the old look stays until then
const BOSS_BODIES = new Set(["spam", "fields", "swamp", "canyon", "depths"]), bossAsked = new Set();
export function meshyBoss(kit, loader, id, ver = "") {
  if (!kit || !loader || !BOSS_BODIES.has(id) || bossAsked.has(id)) return; bossAsked.add(id);
  try { loader().load(`/models/world/bosses/${id}.glb${ver}`, (g) => { try { place(kit, "Boss_" + id, meshyVillain(g.scene, false)); } catch (e) { console.warn("boss body", id, e); } }, undefined, () => { /* the old look stays */ }); } catch { /* the old look stays */ }
}
/// swap in the Meshy bodies; resolves when they're in (or after `wait` ms, whatever came by then)
export function meshyVillains(kit, loader, ver = "", wait = 5000) {
  if (!loader) return Promise.resolve(kit);
  const jobs = Object.entries(MESHY_VILLAIN).map(([name, file]) => new Promise((ok) => {
    try { loader().load(`/models/world/scammers/${file}.glb${ver}`, (g) => { try { place(kit, name, meshyVillain(g.scene, name === "EyeDrone")); } catch (e) { console.warn("scammer", file, e); } ok(); }, undefined, () => ok()); } catch { ok(); }
  }));
  const all = Promise.all(jobs); kit.meshyScamReady = all.then(() => kit); /* (perf batch 6: world-play.js swaps them in on the scammers already standing) */
  return Promise.race([all, new Promise((r) => setTimeout(r, wait))]).then(() => kit);
}
function place(kit, name, v) {
  const [y0] = SIZE[name] || [0, 2], have = new THREE.Box3().setFromObject(v.scene), ext = have.getSize(new THREE.Vector3()), k = (name === "Trilobite" ? 2.8 : 2) / Math.max(0.01, ext.x, ext.y, ext.z);
  const wrap = new THREE.Group(); wrap.name = "v-wrap"; v.scene.scale.setScalar(k); v.scene.position.y = y0 - have.min.y * k; wrap.add(v.scene); v.scene = wrap;
  v.scene.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  kit.enemies[name] = v;
}
/// put the villains in place of the robot models, each at the size of the model it replaces
export function villainize(kit) {
  for (const [name, build] of Object.entries(VILLAIN)) {
    const v = build(), [y0, y1] = SIZE[name]; mergeParts(v.scene);
    const want = { min: { y: y0 }, max: { y: y1 } }, have = new THREE.Box3().setFromObject(v.scene);
    { const ext = have.getSize(new THREE.Vector3()), k = (name === "Trilobite" ? 2.8 : 2) / Math.max(0.01, ext.x, ext.y, ext.z); /* the old models all fill a 2 m box */ const wrap = new THREE.Group(); wrap.name = "v-wrap"; v.scene.scale.setScalar(k); v.scene.position.y = want.min.y - have.min.y * k; wrap.add(v.scene); v.scene = wrap; }
    kit.enemies[name] = v;
  }
  return kit;
}

// ---------------- small pictures of a weapon for the bag (one shared offscreen renderer, each picture made once) ----------------
let thumbR = null, thumbScene = null, thumbCam = null;
const thumbs = new Map();
// the rest of the gear in the bag: small 3D pictures built here (a helm, a chest plate, a shield, boots, a ring, a
// necklace), in the piece's rarity colour, a little more ornate with each tier
/// a piece of armour or jewellery as a small model (the bag's thumbnails and the piece's turning 3D view)
export function gearModel3d(slot, tier, color) {
  const g = new THREE.Group(), c = new THREE.Color(color);
  const metal = new THREE.MeshStandardMaterial({ color: c, metalness: 0.75, roughness: 0.3, emissive: c, emissiveIntensity: 0.12 + tier * 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.5, roughness: 0.45 }), gem = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: c, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.1 });
  const M = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  if (slot === "helm") { const d = M(new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), metal); d.scale.set(1, 0.9, 1.05); M(new THREE.TorusGeometry(0.5, 0.05, 8, 32), dark).rotation.x = Math.PI / 2; M(new THREE.BoxGeometry(0.07, 0.22, 0.62), dark, 0, 0.45, 0); M(new THREE.BoxGeometry(0.36, 0.06, 0.06), dark, 0, 0.12, 0.5);
    if (tier >= 2) for (const s of [-1, 1]) { const h = M(new THREE.ConeGeometry(0.07, 0.36, 10), metal, s * 0.42, 0.42, 0); h.rotation.z = s * -0.7; } }
  else if (slot === "armor") { const b = M(new THREE.CylinderGeometry(0.42, 0.34, 0.75, 20, 1), metal); b.scale.z = 0.62; for (const s of [-1, 1]) M(new THREE.SphereGeometry(0.2, 16, 10), metal, s * 0.46, 0.3, 0); M(new THREE.BoxGeometry(0.5, 0.06, 0.28), dark, 0, -0.18, 0.04); if (tier >= 2) M(new THREE.OctahedronGeometry(0.09, 0), gem, 0, 0.12, 0.27); }
  else if (slot === "shield") { const s = M(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 6), metal); s.rotation.x = Math.PI / 2; M(new THREE.TorusGeometry(0.5, 0.04, 6, 6), dark).rotation.z = Math.PI / 6; M(new THREE.SphereGeometry(0.12, 14, 10), tier >= 2 ? gem : dark, 0, 0, 0.06); }
  else if (slot === "boots") { for (const s of [-1, 1]) { M(new THREE.BoxGeometry(0.22, 0.42, 0.24), metal, s * 0.16, 0.12, 0); M(new THREE.BoxGeometry(0.24, 0.13, 0.42), dark, s * 0.16, -0.12, 0.1); } }
  else if (slot === "ring") { M(new THREE.TorusGeometry(0.3, 0.07, 12, 36), metal).rotation.x = 0.4; M(new THREE.OctahedronGeometry(0.14 + tier * 0.02, 0), gem, 0, 0.36, 0.08); }
  else { const ch = M(new THREE.TorusGeometry(0.38, 0.025, 6, 40), dark); ch.scale.y = 1.25; M(new THREE.OctahedronGeometry(0.13 + tier * 0.02, 0), gem, 0, -0.52, 0); M(new THREE.TorusGeometry(0.06, 0.02, 6, 14), metal, 0, -0.4, 0); }
  return g;
}
export function gearThumb(slot, tier, color) {
  const key = `g-${slot}-${tier}-${color}`; if (thumbs.has(key)) return thumbs.get(key);
  try {
    if (!thumbR) weaponThumb(0, 0, "#ffffff"); // sets up the little renderer
    const w = gearModel3d(slot, tier, color); w.rotation.set(0.35, -0.5, 0);
    const b = new THREE.Box3().setFromObject(w), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    w.position.sub(c); thumbScene.add(w);
    thumbCam.position.set(0, 0, r / Math.tan((14 * Math.PI) / 180) * 1.0); thumbCam.lookAt(0, 0, 0);
    thumbR.render(thumbScene, thumbCam);
    const url = thumbR.domElement.toDataURL("image/png"); thumbScene.remove(w); w.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    thumbs.set(key, url); return url;
  } catch { thumbs.set(key, null); return null; }
}
export function weaponThumb(kind, tier, color) {
  const key = `${kind}-${tier}-${color}`; if (thumbs.has(key)) return thumbs.get(key);
  try {
    if (!thumbR) {
      thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); thumbR.setSize(112, 112); thumbR.outputColorSpace = THREE.SRGBColorSpace; thumbR.toneMapping = THREE.ACESFilmicToneMapping;
      thumbScene = new THREE.Scene(); thumbScene.add(new THREE.HemisphereLight(0xeaf4ff, 0x30405a, 1.8)); const l = new THREE.DirectionalLight(0xffffff, 2.4); l.position.set(2, 3, 4); thumbScene.add(l);
      thumbCam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    }
    const w = weapon(kind, tier, color, 0.3); w.rotation.set(0, 0, 0);
    if (w.userData.hold === "fwd") w.rotation.y = -Math.PI / 2; else w.rotation.z = -Math.PI / 4; // laid across the tile
    const b = new THREE.Box3().setFromObject(w), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    w.position.sub(c); thumbScene.add(w);
    thumbCam.position.set(0, 0, r / Math.tan((14 * Math.PI) / 180) * 1.05); thumbCam.lookAt(0, 0, 0);
    thumbR.render(thumbScene, thumbCam);
    const url = thumbR.domElement.toDataURL("image/png"); thumbScene.remove(w);
    thumbs.set(key, url); return url;
  } catch { thumbs.set(key, null); return null; }
}

// ---------------- the explorer rover: a white body on four chunky wheels, a dark canopy, lights in front ----------------
export function rover(color = 0x38e8ff) {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.3, 0.42, 2.0, 0.16), shellMat(), 0, 0.62, 0));
  g.add(mesh(rbox(1.0, 0.34, 0.6, 0.14), physMat({ color: 0x0a0f18, roughness: 0.1, clearcoat: 1 }), 0, 0.98, 0.62)); // the windscreen in front; you stand on the deck behind it
  for (const s of [-1, 1]) { g.add(mesh(new THREE.BoxGeometry(0.04, 0.08, 1.9), glowMat(color, 2.4), s * 0.66, 0.6, 0)); g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.12, 4, 8), glowMat(0xffffff, 2.6), s * 0.42, 0.66, 1.0).rotateZ(Math.PI / 2)); }
  const wheels = [];
  for (const [x, z] of [[-0.72, 0.68], [0.72, 0.68], [-0.72, -0.68], [0.72, -0.68]]) {
    const w = new THREE.Group(); w.position.set(x, 0.36, z);
    w.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 20), darkMat()).rotateZ(Math.PI / 2));
    w.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), shellMat()).rotateZ(Math.PI / 2));
    w.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), glowMat(color, 2.2), x > 0 ? 0.17 : -0.17, 0, 0).rotateY(Math.PI / 2));
    g.add(w); wheels.push(w);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), darkMat(), 0.45, 1.3, -0.7)); g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat(color, 3), 0.45, 1.56, -0.7));
  g.userData.update = (t, speed = 0) => { wheels.forEach((w) => (w.rotation.x += speed * 0.016 * 2.8)); g.position.y = Math.abs(Math.sin(t * 14)) * 0.02 * Math.min(1, speed / 6); };
  return g;
}

// ---------------- the third ride (level 30): a jetpack on your back, two thrusters with flames ----------------
// it sits behind the character (+Z is behind: the rides turn with facing); update(t, speed, lift) flickers the flames
export function jetpack(color = 0xffc861) {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.62, 0.72, 0.32, 0.1), shellMat(), 0, 1.25, -0.34));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.04), glowMat(color, 2.4), 0, 1.4, -0.51));
  const flames = [];
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.62, 14), darkMat(), s * 0.26, 1.15, -0.42));
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 18), glowMat(color, 2.6), s * 0.26, 1.42, -0.42).rotateX(Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.12, 14), darkMat(), s * 0.26, 0.8, -0.42));
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.5), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    f.rotation.x = Math.PI; f.position.set(s * 0.26, 0.45, -0.42); g.add(f);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    core.rotation.x = Math.PI; core.position.set(s * 0.26, 0.58, -0.42); g.add(core); flames.push(f, core);
  }
  g.userData.update = (t, speed = 0, lift = 1) => { const k = 0.7 + Math.sin(t * 40) * 0.12 + Math.sin(t * 23) * 0.08; flames.forEach((f, i) => { const big = (i % 2 ? 0.8 : 1) * (0.6 + lift * 0.6 + Math.min(1, speed / 18) * 0.5); f.scale.set(1, k * big, 1); f.position.y = (i % 2 ? 0.58 : 0.45) - (k * big - 1) * 0.25; }); };
  return g;
}

// ---------------- the airship over the far ring (scenery): an envelope, a gondola, fins, a turning prop, lights ----------------
export function airship() {
  const g = new THREE.Group(); g.name = "airship";
  const env = mesh(new THREE.SphereGeometry(5, 28, 18), new THREE.MeshStandardMaterial({ color: 0xeef3f7, roughness: 0.45, metalness: 0.05 })); env.scale.set(1, 0.85, 2.6); g.add(env);
  const band = mesh(new THREE.TorusGeometry(4.3, 0.18, 8, 48), glowMat(0x38e8ff, 2)); band.scale.set(1, 1, 2.6); band.rotation.x = Math.PI / 2; g.add(band);
  // its name down each side (a canvas texture: the brand, not a model)
  const c = document.createElement("canvas"); c.width = 512; c.height = 96; const x = c.getContext("2d"); x.fillStyle = "rgba(0,0,0,0)"; x.fillRect(0, 0, 512, 96); x.font = "900 66px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#1b2a3c"; x.fillText("ARCIRCLE", 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) { const p = mesh(new THREE.PlaneGeometry(12, 2.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }), s * 5.02, 0.4, 0); p.rotation.y = s * Math.PI / 2; g.add(p); }
  g.add(mesh(rbox(2.2, 1.1, 4.2, 0.4), shellMat(), 0, -4.6, 0.5));
  g.add(mesh(new THREE.BoxGeometry(2.0, 0.3, 3.6), glowMat(0xffc861, 1.4), 0, -4.4, 0.5));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), darkMat(), s * 0.9, -3.3, 0.5));
  for (const [rx, ry] of [[0, 1], [Math.PI / 2, 1]]) { const f = mesh(new THREE.BoxGeometry(0.2, 4.2, 2.6), shellMat(), 0, 0, -12); f.rotation.z = rx; g.add(f); }
  const prop = new THREE.Group(); prop.position.set(0, -4.6, -2.0); for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.18, 1.6, 0.08), darkMat(), 0, 0, 0); b.rotation.z = (i / 3) * Math.PI * 2; prop.add(b); } g.add(prop);
  const lights = []; for (const [lx, ly, lz, col] of [[0, 4.2, 6, 0xff4d6d], [0, 4.2, -6, 0x39ff88], [5, 0, 0, 0xffc861], [-5, 0, 0, 0xffc861]]) { const l = mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat(col, 3), lx, ly, lz); g.add(l); lights.push(l); }
  g.userData.update = (t) => { prop.rotation.z = t * 8; lights.forEach((l, i) => { l.visible = Math.sin(t * 3 + i * 1.6) > -0.2; }); };
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// ---------------- things to gather: ore (stone with glowing veins), data crystals, and fallen logs ----------------
export function gatherNode(kind) {
  const g = new THREE.Group();
  if (kind === "ore") {
    const rock = mesh(new THREE.DodecahedronGeometry(0.75, 0), new THREE.MeshStandardMaterial({ color: 0x6d7887, roughness: 0.85, flatShading: true }), 0, 0.5, 0); rock.scale.set(1.2, 0.8, 1); g.add(rock);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; g.add(mesh(new THREE.OctahedronGeometry(0.16, 0), glowMat(0xffb83d, 1.6), Math.cos(a) * 0.6, 0.55 + (i % 2) * 0.2, Math.sin(a) * 0.5)); }
  } else if (kind === "crystal") {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, h = 0.7 + (i % 3) * 0.35; const c = mesh(new THREE.OctahedronGeometry(0.22, 0), crystalMat(0x38e8ff), Math.cos(a) * 0.25, h / 2, Math.sin(a) * 0.25); c.scale.set(1, h * 2.2, 1); c.rotation.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); g.add(c); }
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0x46505e, roughness: 0.9, flatShading: true }), 0, 0.09, 0));
  } else {
    for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9 }), 0, 0.22 + (i === 2 ? 0.36 : 0), (i === 2 ? 0 : i ? 0.24 : -0.24)); l.rotation.z = Math.PI / 2; g.add(l);
      for (const s of [-1, 1]) g.add(mesh(new THREE.CircleGeometry(0.21, 12), new THREE.MeshStandardMaterial({ color: 0xe0b878, roughness: 0.8 }), s * 0.81, l.position.y, l.position.z).rotateY(s * Math.PI / 2)); }
    g.add(mesh(new THREE.ConeGeometry(0.12, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0x4caf6a, roughness: 0.8 }), 0.2, 0.86, 0));
  }
  return g;
}
// a fish, jumping out of the water when caught
export function fish(color = 0x38c8ff) {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4 })); body.scale.set(0.6, 0.8, 1.5); g.add(body);
  g.add(mesh(new THREE.ConeGeometry(0.16, 0.24, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), 0, 0, -0.38).rotateX(-Math.PI / 2));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x0a0f18 }), s * 0.1, 0.06, 0.2));
  return g;
}
