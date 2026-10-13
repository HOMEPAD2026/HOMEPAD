// world-arcbots.js — the ARC Bots: ARCIRCLE World's own player characters (art direction: the "AI Robot Characters"
// sheet, world-art/ART-SPEC.md). They are built in code, not loaded: one chibi robot body (a big rounded helmet, a dark
// glass face with glowing eyes, headphone ear pods, a small rounded body, stubby arms and legs) and twenty-five looks,
// each a palette and a few accessories on top of the same joints.
//
// The joints carry the same names as the Kenney characters' bones (root, torso, head, arm-left, arm-right, leg-left,
// leg-right), so the gear the game draws on a character (world-rpg.js dress) finds them; `mount` gives the offsets that
// fit this body. The animations are poses blended in code — idle, walk, sprint, jump, fall, sit, drive, die, pick-up,
// emote-yes (wave), emote-no, interact-right (a swing) and celebrate — with the same play / busy / update API as a
// loaded character, so world-play.js treats both alike.
const TAU = Math.PI * 2;
// palette: shell (the white body), trim (darker parts: joints, feet), accent (ear rings, chest, details), eye (the glow)
// acc: the accessories (see ACC below)
export const ARCBOTS = [
  { id: "arc", name: "ARC", role: "Default Hero", shell: 0xf3f7fb, trim: 0x2a3446, accent: 0x2f86ff, eye: 0x38e8ff, acc: ["antenna"] },
  { id: "neo", name: "NEO", role: "Explorer", shell: 0xf3f2ee, trim: 0x5a3a22, accent: 0xff8a2a, eye: 0x38e8ff, acc: ["scarf", "backpack", "explorer"] },
  { id: "luna", name: "LUNA", role: "Assistant", shell: 0xffd6e8, trim: 0x8a3a64, accent: 0xff6fb5, eye: 0xff9ad8, acc: ["cat"] },
  { id: "kai", name: "KAI", role: "Engineer", shell: 0xf3f2ee, trim: 0x3a3226, accent: 0xffb21e, eye: 0x38e8ff, acc: ["hardhat", "wrench"] },
  { id: "zen", name: "ZEN", role: "Medic", shell: 0xf4faf6, trim: 0x2c4a3a, accent: 0x39ff88, eye: 0x7dffb4, acc: ["cat", "cross"] },
  { id: "rex", name: "REX", role: "Guardian", shell: 0xe8eef5, trim: 0x23324a, accent: 0x2f86ff, eye: 0x38e8ff, acc: ["pauldrons", "chin"] },
  { id: "pixi", name: "PIXI", role: "Drone Buddy", shell: 0xf2efff, trim: 0x4a3a7a, accent: 0xa67bff, eye: 0x9fd8ff, acc: ["cat", "wings"] },
  { id: "orbit", name: "ORBIT", role: "Astronaut", shell: 0xf3f5f8, trim: 0x3a4250, accent: 0xff9a3a, eye: 0x38e8ff, acc: ["bubble", "backpack"] },
  { id: "shadow", name: "SHADOW", role: "Stealth", shell: 0x2a2236, trim: 0x15111c, accent: 0x9b5cff, eye: 0xb18cff, acc: ["hood", "cape"] },
  { id: "spark", name: "SPARK", role: "Energy", shell: 0xf6f2f2, trim: 0x6a1e24, accent: 0xff4d5a, eye: 0x38e8ff, acc: ["antenna", "bolt"] },
  { id: "mint", name: "MINT", role: "Nature", shell: 0xf2f7f0, trim: 0x2f4a2a, accent: 0x6fd65a, eye: 0x7dffb4, acc: ["leaves"] },
  { id: "cici", name: "CICI", role: "Chef", shell: 0xf7f7f7, trim: 0x5a2a2a, accent: 0xff5a4d, eye: 0x38e8ff, acc: ["chef", "scarf"] },
  { id: "byte", name: "BYTE", role: "Hacker", shell: 0x1d2630, trim: 0x0f151c, accent: 0x2ee0d0, eye: 0x4ffff0, acc: ["hood", "visorband"] },
  { id: "skye", name: "SKYE", role: "Pilot", shell: 0xf2f4f7, trim: 0x5a3a22, accent: 0x2f86ff, eye: 0x38e8ff, acc: ["aviator", "goggles", "scarf"] },
  { id: "ruby", name: "RUBY", role: "Artist", shell: 0xf7dce2, trim: 0x7a2a3a, accent: 0xff4d7a, eye: 0x38e8ff, acc: ["beret", "brush"] },
  { id: "titan", name: "TITAN", role: "Builder", shell: 0xffc531, trim: 0x2a2a2a, accent: 0x2a2a2a, eye: 0x38e8ff, acc: ["hardhat", "pauldrons", "bulky"] },
  { id: "echo", name: "ECHO", role: "AI Sage", shell: 0xf7f4ea, trim: 0x6a5420, accent: 0xffc861, eye: 0x38e8ff, acc: ["halo", "rings"] },
  { id: "nix", name: "NIX", role: "Scientist", shell: 0xf1edf7, trim: 0x4a3a6a, accent: 0xa67bff, eye: 0x38e8ff, acc: ["goggles", "coat"] },
  { id: "blaze", name: "BLAZE", role: "Fire", shell: 0xd8343a, trim: 0x2a1012, accent: 0xff8a2a, eye: 0xffd27a, acc: ["flame"] },
  { id: "aqua", name: "AQUA", role: "Water", shell: 0xf2f8fc, trim: 0x23506a, accent: 0x35c8ff, eye: 0x38e8ff, acc: ["fins", "drops"] },
  { id: "terra", name: "TERRA", role: "Earth", shell: 0x8a6a48, trim: 0x3a2a1a, accent: 0x6fd65a, eye: 0x7dffb4, acc: ["leaves", "bulky"] },
  { id: "volt", name: "VOLT", role: "Electric", shell: 0xffd23a, trim: 0x1f1f24, accent: 0x1f1f24, eye: 0x38e8ff, acc: ["bolt", "antenna"] },
  { id: "nova", name: "NOVA", role: "Star", shell: 0x5a3aa8, trim: 0x2a1a5a, accent: 0xffd27a, eye: 0xd8c4ff, acc: ["stars", "halo"] },
  { id: "frost", name: "FROST", role: "Ice", shell: 0xf4fbff, trim: 0x5a8ab0, accent: 0x8fe6ff, eye: 0x8fe6ff, acc: ["crystals"] },
  { id: "circa", name: "CIRCA", role: "Special", shell: 0xf3f7fb, trim: 0x16304a, accent: 0x35d8d0, eye: 0x38e8ff, acc: ["rings", "chin"] },
];
export const ARCBOT_IDS = ARCBOTS.map((b) => "arc-" + b.id);
export const arcbotOf = (id) => ARCBOTS.find((b) => "arc-" + b.id === id) || null;

/// a character: { obj, play(name, { once, speed, fade }), busy(), update(dt, t), height, setCrown(a, b), mount, face(expr), spec }
export function makeArcBot(THREE, spec) {
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.06, ...o });
  const glow = (c, k = 2.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const M = { shell: std(spec.shell), trim: std(spec.trim, { roughness: 0.45, metalness: 0.2 }), accent: std(spec.accent, { roughness: 0.35, metalness: 0.15 }), glass: std(0x070b12, { roughness: 0.12, metalness: 0.4, emissive: 0x06121c, emissiveIntensity: 0.6 }), eye: glow(spec.eye, 1.5), ring: glow(spec.accent, 1.8) };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const joint = (name, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; };
  const has = (k) => spec.acc.includes(k);
  const bulky = has("bulky") ? 1.14 : 1;

  const obj = new THREE.Group(); obj.name = "arcbot:" + spec.id;
  const root = joint("root"); obj.add(root);
  // legs: short and round, with a foot each (the hips sit at 0.42)
  const legs = [-1, 1].map((s) => {
    const L = joint(s < 0 ? "leg-left" : "leg-right", s * 0.15 * bulky, 0.42, 0);
    L.add(mesh(new THREE.CapsuleGeometry(0.085 * bulky, 0.16, 4, 10), M.trim, 0, -0.16, 0));
    const foot = mesh(new THREE.SphereGeometry(0.13 * bulky, 14, 10), M.shell, 0, -0.33, 0.04); foot.scale.set(1, 0.62, 1.32); L.add(foot);
    const sole = mesh(new THREE.CylinderGeometry(0.12 * bulky, 0.13 * bulky, 0.04, 16), M.accent, 0, -0.395, 0.04); sole.scale.z = 1.3; L.add(sole);
    root.add(L); return L;
  });
  // the body: a soft rounded torso with the mark on the chest
  const torso = joint("torso", 0, 0.44, 0); root.add(torso);
  const belly = mesh(new THREE.SphereGeometry(0.33 * bulky, 24, 18), M.shell, 0, 0.25, 0); belly.scale.set(1.02, 0.95, 0.86); torso.add(belly);
  const waist = mesh(new THREE.CylinderGeometry(0.24 * bulky, 0.22 * bulky, 0.08, 20), M.trim, 0, 0.02, 0); torso.add(waist);
  const chest = new THREE.Group(); chest.position.set(0, 0.3, 0.275 * bulky);
  { const a = mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 24), M.ring, -0.04, 0, 0), b = mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 24), M.ring, 0.04, 0, 0); chest.add(a, b); }
  torso.add(chest);
  // arms: from the shoulders, a short arm and a round hand
  const arms = [-1, 1].map((s) => {
    const A = joint(s < 0 ? "arm-left" : "arm-right", s * 0.36 * bulky, 0.42, 0);
    A.add(mesh(new THREE.SphereGeometry(0.1 * bulky, 14, 10), M.shell, 0, 0, 0));
    A.add(mesh(new THREE.CapsuleGeometry(0.075 * bulky, 0.16, 4, 10), M.trim, 0, -0.16, 0));
    A.add(mesh(new THREE.SphereGeometry(0.1 * bulky, 14, 10), M.shell, 0, -0.32, 0));
    A.rotation.z = s * 0.18; torso.add(A); return A;
  });
  // the head: a big rounded helmet, a dark glass face, two glowing eyes, headphone ear pods
  const head = joint("head", 0, 0.56, 0); torso.add(head);
  const helmet = mesh(new THREE.SphereGeometry(0.56, 40, 30), M.shell, 0, 0.47, 0); helmet.scale.set(1.06, 0.93, 0.96); head.add(helmet);
  const face = mesh(new THREE.SphereGeometry(0.565, 40, 20, Math.PI / 2 - 0.86, 1.72, 1.08, 1.0), M.glass, 0, 0.47, 0); face.scale.set(1.07, 0.94, 0.985); head.add(face);
  const eyes = new THREE.Group(); eyes.position.set(0, 0.5, 0.535); head.add(eyes);
  const eyeOpen = [-1, 1].map((s) => { const e = mesh(new THREE.CapsuleGeometry(0.085, 0.11, 4, 12), M.eye, s * 0.18, 0, 0); e.scale.set(1, 1, 0.35); e.castShadow = false; eyes.add(e); return e; });
  // happy eyes: two little arcs (wave, celebrate)
  const eyeHappy = [-1, 1].map((s) => { const e = mesh(new THREE.TorusGeometry(0.085, 0.026, 6, 16, Math.PI), M.eye, s * 0.18, -0.02, 0); e.castShadow = false; e.visible = false; eyes.add(e); return e; });
  // knocked out: an X for each eye
  const eyeX = [-1, 1].map((s) => { const g = new THREE.Group(); g.position.set(s * 0.18, 0, 0); [0.75, -0.75].forEach((r) => { const bar = mesh(new THREE.BoxGeometry(0.2, 0.045, 0.03), M.eye); bar.rotation.z = r; bar.castShadow = false; g.add(bar); }); g.visible = false; eyes.add(g); return g; });
  // star eyes (a level up), > < eyes (a hard hit): shown for a moment by face(expr, seconds)
  const starGeo = (() => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 0.045 : 0.11; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ShapeGeometry(sh); })();
  const eyeStar = [-1, 1].map((s) => { const e = mesh(starGeo, M.eye, s * 0.18, 0, 0.012); e.castShadow = false; e.visible = false; eyes.add(e); return e; });
  const eyeSquint = [-1, 1].map((s) => { const g = new THREE.Group(); g.position.set(s * 0.18, 0, 0); [0.5, -0.5].forEach((r, i) => { const bar = mesh(new THREE.BoxGeometry(0.13, 0.04, 0.03), M.eye, -s * 0.02, (i ? -1 : 1) * 0.035, 0); bar.rotation.z = r * s; bar.castShadow = false; g.add(bar); }); g.visible = false; eyes.add(g); return g; });
  [-1, 1].forEach((s) => {
    const pod = mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.14, 24), M.shell, s * 0.6, 0.45, 0); pod.rotation.z = Math.PI / 2; head.add(pod);
    const rim = mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 28), M.ring, s * 0.675, 0.45, 0); rim.rotation.y = Math.PI / 2; head.add(rim);
  });
  const band = mesh(new THREE.TorusGeometry(0.6, 0.035, 8, 40, Math.PI), M.trim, 0, 0.45, 0); band.scale.set(1.04, 1.02, 1); head.add(band);
  // the ARCIRCLE crown every character wears: the mark's two rings over the head
  const crown = new THREE.Group(); crown.name = "crown"; crown.position.y = 2.42;
  const cr1 = mesh(new THREE.TorusGeometry(0.17, 0.035, 10, 32), glow(0x2f86ff, 2.6), -0.1, 0, 0), cr2 = mesh(new THREE.TorusGeometry(0.17, 0.035, 10, 32), glow(0x2ee07a, 2.4), 0.1, 0, 0); cr2.rotation.x = Math.PI / 2; crown.add(cr1, cr2); obj.add(crown);

  // ---------------- the twenty-five looks: accessories on the same body ----------------
  const spin = []; // little things that keep moving (stars, rings, flames)
  // springs (antenna, ears, cape, scarf): they lag behind the head's movement and bob back, so a jump, a stop or a
  // hit sets them swinging. add: on top of a swing set each frame (the cape, the scarf) instead of a fixed rest pose
  const springs = [];
  function spring(o, amp = 1, add = false) { springs.push({ o, amp, add, rx: o.rotation.x, rz: o.rotation.z, x: 0, z: 0, vx: 0, vz: 0 }); }
  const hp0 = new THREE.Vector3(), hp1 = new THREE.Vector3(), hv = new THREE.Vector3(), hv0 = new THREE.Vector3(), acc = new THREE.Vector3(), qi = new THREE.Quaternion();
  let springOn = false;
  function tickSprings(dt) {
    if (!springs.length || dt <= 0) return; dt = Math.min(dt, 1 / 20);
    head.getWorldPosition(hp1);
    if (!springOn) { springOn = true; hp0.copy(hp1); return; }
    hv.copy(hp1).sub(hp0).divideScalar(dt); hp0.copy(hp1);
    acc.copy(hv).sub(hv0).divideScalar(dt); hv0.copy(hv);
    if (acc.lengthSq() > 2500) acc.setLength(50); // a teleport or a respawn: not a shove
    obj.getWorldQuaternion(qi).invert(); acc.applyQuaternion(qi);
    for (const S of springs) {
      const tx = THREE.MathUtils.clamp(-acc.z * 0.012 * S.amp - acc.y * 0.006 * S.amp, -0.7, 0.7), tz = THREE.MathUtils.clamp(acc.x * 0.012 * S.amp, -0.7, 0.7);
      S.vx += ((tx - S.x) * 120 - S.vx * 9) * dt; S.vz += ((tz - S.z) * 120 - S.vz * 9) * dt; S.x += S.vx * dt; S.z += S.vz * dt;
      if (S.add) { S.o.rotation.x += S.x; S.o.rotation.z = S.rz + S.z * 0.6; } else { S.o.rotation.x = S.rx + S.x; S.o.rotation.z = S.rz + S.z; }
    }
  }
  const ACC = {
    antenna: () => { const pv = joint("antenna", 0.205, 0.893, 0); pv.rotation.z = -0.25; pv.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), M.trim, 0, 0.11, 0), mesh(new THREE.SphereGeometry(0.05, 10, 8), M.ring, 0, 0.235, 0)); head.add(pv); spring(pv, 1.4); },
    cat: () => [-1, 1].forEach((s) => { const pv = joint("ear", s * 0.3, 0.86, 0); const e = mesh(new THREE.ConeGeometry(0.16, 0.26, 4), M.shell, s * 0.03, 0.12, 0); e.rotation.set(0, Math.PI / 4, s * -0.32); const inner = mesh(new THREE.ConeGeometry(0.09, 0.15, 4), M.accent, s * 0.025, 0.1, 0.05); inner.rotation.copy(e.rotation); pv.add(e, inner); head.add(pv); spring(pv, 0.6); }),
    hardhat: () => { const h = mesh(new THREE.SphereGeometry(0.6, 28, 14, 0, TAU, 0, Math.PI / 2), M.accent, 0, 0.68, 0); h.scale.set(1.05, 0.62, 1.02); const brim = mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.04, 28), M.accent, 0, 0.68, 0.06); const ridge = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.9), M.trim, 0, 1.03, 0); head.add(h, brim, ridge); },
    wrench: () => { const w = new THREE.Group(); w.add(mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), M.trim, 0, -0.18, 0), mesh(new THREE.TorusGeometry(0.06, 0.025, 6, 12, Math.PI * 1.5), M.trim, 0, -0.38, 0)); w.position.set(0, -0.34, 0.08); w.rotation.x = 1.2; arms[0].add(w); },
    cross: () => { const c = new THREE.Group(); c.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), glow(0xff4d5a, 1.6)), mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), glow(0xff4d5a, 1.6))); c.position.set(0, 0.86, 0.48); c.rotation.x = -0.6; head.add(c); },
    pauldrons: () => [-1, 1].forEach((s) => { const p = mesh(new THREE.SphereGeometry(0.15 * bulky, 16, 10, 0, TAU, 0, Math.PI / 2), M.accent, 0, 0.04, 0); p.scale.set(1.15, 0.8, 1.1); arms[s < 0 ? 0 : 1].add(p); }),
    chin: () => { const c = mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 30, Math.PI), M.accent, 0, 0.2, 0.18); c.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI); head.add(c); },
    wings: () => [-1, 1].forEach((s) => { const w = mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshStandardMaterial({ color: 0xd8c4ff, emissive: 0xa67bff, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), s * 0.28, 0.38, -0.3); w.scale.set(0.7, 1.15, 1); w.rotation.set(0, s * 0.7, s * 0.35); w.castShadow = false; torso.add(w); spin.push((dt, t) => { w.rotation.y = s * (0.7 + Math.sin(t * 14) * 0.35); }); }),
    bubble: () => { const b = mesh(new THREE.SphereGeometry(0.74, 32, 24), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.46, 0); b.castShadow = false; head.add(b); },
    backpack: () => { const b = mesh(new THREE.SphereGeometry(0.22, 16, 12), M.accent, 0, 0.3, -0.3); b.scale.set(1.1, 1.2, 0.7); torso.add(b); torso.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10), M.trim, 0.12, 0.26, -0.44), mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10), M.trim, -0.12, 0.26, -0.44)); },
    explorer: () => { const h = mesh(new THREE.SphereGeometry(0.58, 24, 12, 0, TAU, 0, Math.PI / 2.2), std(0xc89a5a), 0, 0.62, 0); h.scale.set(1.08, 0.55, 1.04); const brim = mesh(new THREE.CylinderGeometry(0.78, 0.8, 0.03, 28), std(0xb8864a), 0, 0.66, 0); head.add(h, brim); },
    hood: () => { const h = mesh(new THREE.SphereGeometry(0.66, 30, 20, Math.PI / 2 + 0.95, TAU - 1.9, 0, 2.2), std(spec.trim === 0x0f151c ? 0x1a222c : 0x3a2a5a, { roughness: 0.8, side: THREE.DoubleSide }), 0, 0.5, -0.02); h.scale.set(1.05, 1.0, 1.0); head.add(h); },
    cape: () => { const c = mesh(new THREE.PlaneGeometry(0.66, 0.7, 1, 4), std(0x2a1a44, { roughness: 0.8, side: THREE.DoubleSide }), 0, 0.12, -0.3); c.castShadow = false; torso.add(c); spin.push((dt, t, sp) => { c.rotation.x = 0.15 + sp * 0.6 + Math.sin(t * 3) * 0.04; }); spring(c, 0.9, true); },
    bolt: () => { const shape = new THREE.Shape(); [[0, 0.2], [0.08, 0.02], [0.02, 0.02], [0.07, -0.2], [-0.08, 0.04], [-0.01, 0.04], [-0.05, 0.2]].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y))); const b = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), glow(0xffd23a, 2), 0, 0.3, 0.28); b.scale.setScalar(0.9); torso.add(b); chest.visible = false; },
    leaves: () => [[-0.22, 1.0, 0.2], [0.05, 1.04, 0.15], [0.28, 0.94, 0.0]].forEach(([x, y, r], i) => { const l = mesh(new THREE.SphereGeometry(0.11, 10, 8), std(i % 2 ? 0x6fd65a : 0x3ea84a, { roughness: 0.7 }), x, y, 0); l.scale.set(0.5, 1.2, 0.18); l.rotation.z = -x * 2 + r; head.add(l); }),
    chef: () => { const c = mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.32, 24), std(0xffffff, { roughness: 0.8 }), 0, 0.98, -0.02); const puff = mesh(new THREE.SphereGeometry(0.38, 20, 14), std(0xffffff, { roughness: 0.8 }), 0, 1.2, -0.02); puff.scale.y = 0.6; head.add(c, puff); },
    visorband: () => { const v = mesh(new THREE.TorusGeometry(0.58, 0.03, 6, 40, Math.PI * 0.9), glow(spec.accent, 2), 0, 0.62, 0); v.rotation.set(0, 0, Math.PI * 0.05); v.scale.set(1.07, 1, 1); head.add(v); },
    aviator: () => { const h = mesh(new THREE.SphereGeometry(0.6, 28, 16, 0, TAU, 0, Math.PI / 2), std(0x7a4a26, { roughness: 0.7 }), 0, 0.5, -0.04); h.scale.set(1.06, 0.9, 1.0); head.add(h); },
    goggles: () => { const g = new THREE.Group(); g.position.set(0, 0.86, 0.36); g.rotation.x = -0.75; [-1, 1].forEach((s) => { g.add(mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 20), M.trim, s * 0.13, 0, 0), mesh(new THREE.CircleGeometry(0.09, 16), std(0xffc861, { emissive: 0xffa040, emissiveIntensity: 0.6, roughness: 0.1 }), s * 0.13, 0, 0.01)); }); head.add(g); },
    scarf: () => { const s = mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 24), M.accent, 0, 0.55, 0); s.rotation.x = Math.PI / 2; torso.add(s); const tail = mesh(new THREE.BoxGeometry(0.12, 0.26, 0.05), M.accent, 0.12, 0.42, -0.2); tail.rotation.z = 0.3; torso.add(tail); spin.push((dt, t, sp) => { tail.rotation.x = 0.3 + sp * 0.9 + Math.sin(t * 6) * 0.08 * (0.3 + sp); }); spring(tail, 1.1, true); },
    beret: () => { const b = mesh(new THREE.SphereGeometry(0.42, 22, 10, 0, TAU, 0, Math.PI / 2), M.accent, 0.08, 0.86, -0.02); b.scale.set(1.15, 0.38, 1.1); b.rotation.z = -0.25; const nub = mesh(new THREE.SphereGeometry(0.05, 8, 6), M.accent, 0.03, 1.02, 0); head.add(b, nub); },
    brush: () => { const b = new THREE.Group(); b.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 8), std(0x8a5a2a), 0, -0.2, 0), mesh(new THREE.ConeGeometry(0.04, 0.1, 8), glow(spec.accent, 1.2), 0, -0.44, 0)); b.position.set(0, -0.32, 0.08); b.rotation.x = 1.3; arms[1].add(b); },
    pumpkin: () => { const p = mesh(new THREE.SphereGeometry(0.3, 18, 12), std(0xff8a1e, { roughness: 0.6 }), 0, 1.12, -0.02); p.scale.set(1.15, 0.8, 1.1); const st = mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 6), std(0x4a6a2a), 0, 1.4, -0.02); st.rotation.z = 0.3; head.add(p, st); }, // Halloween
    halo: () => { const h = mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 40), glow(0xffd27a, 2.4), 0, 1.22, -0.05); h.rotation.x = Math.PI / 2 - 0.2; h.castShadow = false; head.add(h); spin.push((dt, t) => { h.position.y = 1.22 + Math.sin(t * 2) * 0.03; }); },
    rings: () => { const r = new THREE.Group(); r.position.y = 0.25; [0, 1].forEach((i) => { const t = mesh(new THREE.TorusGeometry(0.5 + i * 0.06, 0.018, 6, 48), glow(i ? 0x2ee07a : spec.accent, 1.8)); t.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.4); t.castShadow = false; r.add(t); }); torso.add(r); spin.push((dt) => { r.rotation.y += dt * 1.2; }); },
    coat: () => { const c = mesh(new THREE.CylinderGeometry(0.3 * bulky, 0.38 * bulky, 0.42, 20, 1, true), std(0xffffff, { roughness: 0.8, side: THREE.DoubleSide }), 0, 0.12, 0); torso.add(c); },
    flame: () => [[-0.16, 0.18], [0.02, 0.26], [0.2, 0.16]].forEach(([x, h], i) => { const f = mesh(new THREE.ConeGeometry(0.1, h + 0.14, 8), glow(i === 1 ? 0xffd27a : 0xff8a2a, 2.6), x, 0.98 + h / 2, -0.04); f.castShadow = false; head.add(f); spin.push((dt, t) => { f.scale.y = 1 + Math.sin(t * 12 + i * 2) * 0.18; }); }),
    fins: () => [-1, 1].forEach((s) => { const f = mesh(new THREE.ConeGeometry(0.1, 0.3, 3), M.accent, s * 0.62, 0.62, -0.05); f.rotation.set(0, 0, s * -0.9); head.add(f); }),
    drops: () => { const d = mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(0x35c8ff, 1.6), 0.0, 1.05, 0.05); d.scale.y = 1.4; head.add(d); },
    stars: () => { const g = new THREE.Group(); g.position.y = 0.6; for (let i = 0; i < 4; i++) { const s = mesh(new THREE.OctahedronGeometry(0.045, 0), glow(0xffd27a, 2.4)); s.castShadow = false; s.userData.a = (i / 4) * TAU; g.add(s); } head.add(g); spin.push((dt, t) => g.children.forEach((s, i) => { const a = s.userData.a + t * 1.4; s.position.set(Math.cos(a) * 0.82, Math.sin(t * 2 + i) * 0.12, Math.sin(a) * 0.82); })); },
    crystals: () => [[-0.22, 0.2, -0.3], [0, 0.3, 0], [0.22, 0.2, 0.3]].forEach(([x, h, r]) => { const c = mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ color: 0xcff6ff, emissive: 0x6fd8ff, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.2 }), x, 1.0 + h / 2, -0.04); c.scale.y = 1 + h * 4; c.rotation.z = r; head.add(c); }),
    bulky: () => {},
  };
  spec.acc.forEach((k) => ACC[k] && ACC[k]());

  // ---------------- poses and animations ----------------
  // a pose: { y, rx, rz (the whole body), tx, ty (torso), hx, hy, hz (head), al, ar ([x, z] arms), ll, lr (legs x) }
  const P0 = () => ({ y: 0, rx: 0, rz: 0, tx: 0, ty: 0, hx: 0, hy: 0, hz: 0, alx: 0, alz: -0.18, arx: 0, arz: 0.18, llx: 0, lrx: 0 });
  const sm = (k) => k * k * (3 - 2 * k);
  const ANIM = {
    idle: { loop: true, f: (t, p) => { p.y = Math.sin(t * 2.2) * 0.012; p.hy = Math.sin(t * 0.7) * 0.12; p.hx = Math.sin(t * 1.1) * 0.03; p.alz = -0.2 - Math.sin(t * 2.2) * 0.04; p.arz = 0.2 + Math.sin(t * 2.2) * 0.04; } },
    walk: { loop: true, f: (t, p, sp) => { const w = Math.sin(t * 9 * sp); p.llx = w * 0.6; p.lrx = -w * 0.6; p.alx = -w * 0.55; p.arx = w * 0.55; p.y = Math.abs(Math.cos(t * 9 * sp)) * 0.05; p.rz = w * 0.04; p.hy = -w * 0.06; } },
    sprint: { loop: true, f: (t, p, sp) => { const w = Math.sin(t * 13 * sp); p.llx = w * 0.95; p.lrx = -w * 0.95; p.alx = -w * 1.0; p.arx = w * 1.0; p.alz = -0.35; p.arz = 0.35; p.y = Math.abs(Math.cos(t * 13 * sp)) * 0.09; p.tx = 0.22; p.hx = -0.12; } },
    jump: { f: (t, p) => { p.alz = -2.3; p.arz = 2.3; p.llx = -0.5; p.lrx = 0.3; p.hx = -0.15; }, len: 0.5 },
    fall: { loop: true, f: (t, p) => { p.alz = -1.2 + Math.sin(t * 8) * 0.15; p.arz = 1.2 - Math.sin(t * 8) * 0.15; p.llx = 0.3; p.lrx = -0.2; } },
    sit: { loop: true, f: (t, p) => { p.y = -0.3; p.llx = -1.45; p.lrx = -1.45; p.alx = -0.35; p.arx = -0.35; p.hy = Math.sin(t * 0.6) * 0.18; } },
    drive: { loop: true, f: (t, p) => { p.y = -0.3; p.llx = -1.4; p.lrx = -1.4; p.alx = -1.2; p.arx = -1.2; } },
    die: { len: 0.9, f: (t, p, sp, k) => { const e = sm(Math.min(1, k)); p.rx = -1.5 * e; p.y = 0.2 * e; p.alz = -0.2 - 1.2 * e; p.arz = 0.2 + 1.2 * e; p.hx = 0.2 * e; }, hold: true },
    "pick-up": { len: 1.0, f: (t, p, sp, k) => { const e = Math.sin(Math.min(1, k) * Math.PI); p.tx = 0.7 * e; p.y = -0.12 * e; p.alx = -1.2 * e; p.arx = -1.2 * e; p.llx = -0.4 * e; p.lrx = -0.4 * e; p.hx = 0.3 * e; } },
    "emote-yes": { len: 1.6, happy: true, f: (t, p, sp, k) => { const e = Math.sin(Math.min(1, k) * Math.PI); p.arz = 0.2 + 2.4 * Math.min(1, e * 2) + Math.sin(t * 14) * 0.3 * e; p.arx = -0.55 * e; p.hz = -0.15 * e; p.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.04; } },
    "emote-no": { len: 1.2, f: (t, p, sp, k) => { const e = Math.sin(Math.min(1, k) * Math.PI); p.hy = Math.sin(t * 16) * 0.45 * e; p.alz = -0.5 * e; p.arz = 0.5 * e; } },
    "interact-right": { len: 0.45, f: (t, p, sp, k) => { const a = k < 0.35 ? sm(k / 0.35) : 1 - sm((k - 0.35) / 0.65) * 0.6; const swing = k < 0.35 ? -2.4 * a : -2.4 + (k - 0.35) / 0.65 * 3.0; p.arx = swing; p.arz = 0.25; p.ty = -0.35 * Math.sin(k * Math.PI); p.tx = 0.08 * Math.sin(k * Math.PI); } },
    // standing a while: stretch, then look around
    fidget: { len: 2.2, f: (t, p, sp, k) => { const a = Math.sin(Math.min(1, k / 0.45) * Math.PI), b = k > 0.45 ? Math.sin(((k - 0.45) / 0.55) * Math.PI) : 0; p.alz = -0.2 - 2.6 * a; p.arz = 0.2 + 2.6 * a; p.alx = -0.3 * a; p.arx = -0.3 * a; p.y = 0.04 * a; p.hx = -0.2 * a; p.hy = Math.sin(k * Math.PI * 4) * 0.6 * b; } },
    celebrate: { len: 1.8, happy: true, f: (t, p, sp, k) => { const e = Math.sin(Math.min(1, k) * Math.PI); p.y = Math.abs(Math.sin(k * Math.PI * 3)) * 0.35 * e; p.alz = -2.5 * e + Math.sin(t * 14) * 0.25 * e; p.arz = 2.5 * e - Math.sin(t * 14) * 0.25 * e; p.ty = Math.sin(k * Math.PI * 2) * 0.4; } },
  };
  let cur = "idle", curT = 0, curSp = 1, from = null, fadeT = 0, fadeLen = 0.18, oneShot = false, held = false, blinkT = 2, exprHappy = false, expr = "", exprT = 0;
  // reactions on top of the animation: a flinch with squinting eyes, the head turned toward someone, a squash on landing
  let leanX = 0, leanZ = 0, hurtT = 0, hurtF = -1, hurtS = 0, lookY = 0, lookWant = 0, landT = 0, landK = 0, idleFor = 0, fidgetAt = 7 + Math.random() * 6, exprKo = false;
  const ring0 = M.ring.emissiveIntensity;
  const pose = P0(), last = P0();
  function apply(p) {
    root.position.y = p.y; root.rotation.x = p.rx; root.rotation.z = p.rz;
    torso.rotation.x = p.tx; torso.rotation.y = p.ty; head.rotation.set(p.hx, p.hy, p.hz);
    arms[0].rotation.x = p.alx; arms[0].rotation.z = p.alz; arms[1].rotation.x = p.arx; arms[1].rotation.z = p.arz;
    legs[0].rotation.x = p.llx; legs[1].rotation.x = p.lrx;
  }
  const play = (name, { once = false, speed = 1, fade = 0.18 } = {}) => {
    if (!ANIM[name]) return;
    if (!once && name === cur && !oneShot) { curSp = speed; return; }
    from = { ...last }; fadeT = 0; fadeLen = fade; cur = name; curT = 0; curSp = speed; oneShot = !!once || !ANIM[name].loop; held = false;
  };
  function setHappy(on) { if (on === exprHappy) return; exprHappy = on; eyeOpen.forEach((e) => (e.visible = !on && !exprKo)); eyeHappy.forEach((e) => (e.visible = on && !exprKo)); }
  function setKo(on) { if (on === exprKo) return; exprKo = on; eyeX.forEach((e) => (e.visible = on)); eyeOpen.forEach((e) => (e.visible = !on && !exprHappy)); eyeHappy.forEach((e) => (e.visible = !on && exprHappy)); }
  apply(pose);
  let tt = 0;
  return {
    obj, spec, height: 2.1, play, busy: () => oneShot && !held,
    face: (x, secs = 1.4) => { if (x === "happy" || x === "wow" || x === "star" || x === "ouch") { expr = x; exprT = secs; } else { expr = ""; exprT = 0; } },
    // fwd: +1 pushed forward (hit from behind) … -1 pushed back; side: +1 pushed to its right
    // leaning into a run and into turns (added on top of the pose)
    lean(x, z) { leanX += (x - leanX) * 0.15; leanZ += (z - leanZ) * 0.12; },
    hurt(fwd = -1, side = 0) { hurtT = 0.42; expr = "ouch"; exprT = 0.5; hurtF = Math.max(-1, Math.min(1, fwd)); hurtS = Math.max(-1, Math.min(1, side)); },
    look(yaw) { lookWant = Math.max(-0.85, Math.min(0.85, yaw || 0)); },
    land(k = 1) { landT = 0.28; landK = Math.max(0.3, Math.min(1, k)); },
    // where the gear sits on this body (world-rpg.js dress): [x, y, z] in the joint's own space
    mount: { weapon: [0, -0.34, 0.08], shield: [-0.12, -0.24, 0.06], helm: [0, 0.52, 0], armor: [0, 0.3, 0], armorR: 0.36 * bulky, necklace: [0, 0.48, 0.24] },
    setCrown(a, b) { [[cr1, a], [cr2, b]].forEach(([m, c]) => { m.material.color.set(c); m.material.emissive.set(c); }); },
    update(dt, t) {
      tt += dt; curT += dt;
      const A = ANIM[cur], len = A.len || 1, k = A.loop ? 0 : curT / len;
      const p = P0(); A.f(tt, p, curSp, k);
      if (!A.loop && k >= 1) { if (A.hold) held = true; else { oneShot = false; play("idle", { fade: 0.2 }); } }
      // fade from where the last animation left off
      if (from && fadeT < fadeLen) { fadeT += dt; const w = sm(Math.min(1, fadeT / fadeLen)); for (const key in p) p[key] = from[key] + (p[key] - from[key]) * w; if (fadeT >= fadeLen) from = null; }
      // reactions (added after the fade, so they sit on top of whatever plays)
      if (hurtT > 0) { hurtT = Math.max(0, hurtT - dt); const e = Math.sin((hurtT / 0.42) * Math.PI); p.tx += 0.34 * e * hurtF; p.hx += 0.3 * e * hurtF; p.rz -= 0.3 * e * hurtS; p.hz -= 0.22 * e * hurtS; p.alz -= 0.5 * e; p.arz += 0.5 * e; p.rz += Math.sin(tt * 40) * 0.04 * e; }
      p.rx += leanX; p.rz += leanZ;
      lookY += (lookWant - lookY) * Math.min(1, dt * 5); if (cur === "idle" || cur === "walk") p.hy += lookY;
      Object.assign(last, p); apply(p);
      if (landT > 0) { landT = Math.max(0, landT - dt); const e = Math.sin((landT / 0.28) * Math.PI) * landK; root.scale.set(1 + 0.12 * e, 1 - 0.2 * e, 1 + 0.12 * e); } else if (root.scale.y !== 1) root.scale.set(1, 1, 1);
      // a while standing: a stretch now and then
      if (cur === "idle" && !oneShot) { idleFor += dt; if (idleFor > fidgetAt) { idleFor = 0; fidgetAt = 9 + Math.random() * 8; play("fidget", { once: true, fade: 0.3 }); } } else if (cur !== "fidget") idleFor = 0;
      // the ear rings breathe while idle
      M.ring.emissiveIntensity = ring0 * (cur === "idle" || cur === "fidget" ? 0.85 + Math.sin(tt * 2.2) * 0.25 : 1);
      setKo(cur === "die" && curT > 0.35);
      // a moment's expression on top: happy, wow (wide round eyes), stars, > <
      if (exprT > 0) exprT = Math.max(0, exprT - dt); const ex = exprT > 0 && !exprKo ? expr : "";
      setHappy((!!A.happy && k < 1) || ex === "happy");
      const sq = ex === "ouch", sx = ex === "star", plain = !exprKo && !exprHappy && !sq && !sx;
      eyeOpen.forEach((e) => { e.visible = plain; e.scale.x = ex === "wow" ? 1.3 : 1; }); eyeStar.forEach((e) => { e.visible = sx; e.rotation.z = tt * 2; e.scale.setScalar(1 + Math.sin(tt * 10) * 0.12); }); eyeSquint.forEach((e) => (e.visible = sq && !exprKo && !exprHappy));
      // blink now and then
      blinkT -= dt; const bl = blinkT < 0.1 ? Math.max(0.12, Math.abs(blinkT - 0.05) / 0.05) : 1; if (blinkT < 0) blinkT = 2.2 + Math.random() * 3.5; eyeOpen.forEach((e) => (e.scale.y = ex === "wow" ? 1.25 : hurtT > 0 ? Math.min(bl, 0.3) : bl));
      const sp = cur === "sprint" ? 1 : cur === "walk" ? 0.5 : 0; spin.forEach((f) => f(dt, tt, sp));
      tickSprings(dt);
      crown.rotation.y += dt * 1.4; crown.position.y = 2.42 + Math.sin(tt * 2) * 0.04;
    },
  };
}

// ---------------- the wardrobe (Phase 03): parts any ARC Bot can wear on the same joints ----------------
// Each part sits in one place on the body; wearing one replaces whatever the look had there. Parts open with your
// level (nothing to buy). The accent colours are the brand's.
export const WARDROBE_SLOTS = ["head", "face", "neck", "back", "aura"];
export const WARDROBE = [
  { id: "antenna", slot: "head", name: "Antenna", lv: 1 }, { id: "cat", slot: "head", name: "Cat ears", lv: 5 }, { id: "beret", slot: "head", name: "Beret", lv: 5 },
  { id: "hardhat", slot: "head", name: "Hard hat", lv: 10 }, { id: "halo", slot: "head", name: "Halo", lv: 20 }, { id: "flame", slot: "head", name: "Flame crest", lv: 50 }, { id: "pumpkin", slot: "head", name: "Pumpkin", lv: 1, event: "halloween" },
  { id: "goggles", slot: "face", name: "Goggles", lv: 1 }, { id: "visorband", slot: "face", name: "Visor band", lv: 10 },
  { id: "scarf", slot: "neck", name: "Scarf", lv: 1 },
  { id: "backpack", slot: "back", name: "Backpack", lv: 5 }, { id: "cape", slot: "back", name: "Cape", lv: 10 }, { id: "wings", slot: "back", name: "Wings", lv: 15 },
  { id: "rings", slot: "aura", name: "Orbit rings", lv: 30 }, { id: "stars", slot: "aura", name: "Star orbit", lv: 40 },
];
export const WARDROBE_COLORS = [["", "The look's own"], ["2f86ff", "Arc Blue"], ["2ee07a", "Circle Mint"], ["38e8ff", "Cyan"], ["ffc861", "Gold"], ["a67bff", "Violet"], ["ff4d6d", "Coral"]];
const SLOT_OF = Object.fromEntries(WARDROBE.map((w) => [w.id, w.slot]));
// the parts of the 25 looks that sit in a wardrobe place (so a worn part replaces them)
const BASE_SLOT = { pumpkin: "head", antenna: "head", cat: "head", beret: "head", hardhat: "head", halo: "head", flame: "head", chef: "head", aviator: "head", hood: "head", bubble: "head", fins: "head", leaves: "head", crystals: "head",
  goggles: "face", visorband: "face", scarf: "neck", backpack: "back", cape: "back", wings: "back", rings: "aura", stars: "aura" };
/// a look with an outfit on: outfit = { wear: { head: "halo", back: "cape", … }, accent: "ffc861" }
export function withOutfit(spec, outfit) {
  if (!outfit || (!outfit.wear && !outfit.accent)) return spec;
  const wear = Object.entries(outfit.wear || {}).filter(([sl, id]) => id && SLOT_OF[id] === sl);
  const taken = new Set(wear.map(([sl]) => sl));
  const acc = [...spec.acc.filter((k) => !taken.has(BASE_SLOT[k])), ...wear.map(([, id]) => id)];
  const accent = /^[0-9a-f]{6}$/i.test(outfit.accent || "") ? parseInt(outfit.accent, 16) : spec.accent;
  return { ...spec, acc, accent };
}
