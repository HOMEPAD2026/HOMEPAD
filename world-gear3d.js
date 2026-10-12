// world-gear3d.js — the ARCIRCLE look for things you hold and ride, built in code: a white glossy shell, dark grips and
// lines of light in the piece's colour (its rarity, for gear). The five weapon kinds (dual swords, plasma hammer, energy
// blaster, energy bow, magic staff), the hoverboard, the companion drone, the ∞ landmark and the frame around a gate.
//
// Each weapon is built in its own hand frame: the hand grips at the origin, +Y is up and +Z points forward. hold says
// how world-rpg.js should turn it at rest: "down" (a blade hanging), "up" (a staff, a hammer), "fwd" (a blaster or a bow).
import * as THREE from "./vendor/three/three-0.169.0.module.min.js";
import { RoundedBoxGeometry } from "./vendor/three/addons/RoundedBoxGeometry.js";

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

const shellMat = () => new THREE.MeshPhysicalMaterial({ color: 0xf2f6fa, roughness: 0.28, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12 });
const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.45, metalness: 0.5 });
const trimMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.7 });
const glowMat = (c, k = 2.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.25, metalness: 0.1 });
const crystalMat = (c) => new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.05, transparent: true, opacity: 0.9, flatShading: true });
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
  g.add(mesh(bg, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xe6f6ff).lerp(new THREE.Color(c), 0.35), roughness: 0.12, metalness: 0.55, clearcoat: 1, emissive: c, emissiveIntensity: 0.25 + glow }), 0, 0.17, 0));
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
  top.add(mesh(new THREE.SphereGeometry(0.15, 20, 16), new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 1.4 + glow, roughness: 0.05, transparent: true, opacity: 0.92 }), 0, 0.03, 0));
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
  const visor = mesh(new THREE.SphereGeometry(0.25, 28, 16, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.3, Math.PI * 0.36), new THREE.MeshPhysicalMaterial({ color: 0x0a0f18, roughness: 0.1, clearcoat: 1 }));
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
  loop.add(mesh(new THREE.TubeGeometry(curve, 240, 0.28, 16, true), new THREE.MeshPhysicalMaterial({ color: 0x2f86ff, roughness: 0.15, metalness: 0.3, clearcoat: 1, emissive: 0x0d3c8a, emissiveIntensity: 0.6 })));
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
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 });
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
