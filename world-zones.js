// world-zones.js — the hunting grounds around the town (five near, seven in the far ring) (positions and levels in world-rpg-data.js ZONES):
// a tinted ground with a glowing border, a gate facing the plaza with the name and levels, and props that set the
// mood — crates and spam signs, gift boxes in a field, a swamp, red rock spires, dark crystals. Inside a ground the
// fog turns to its colour (world-play.js asks zoneAt()).
import { ZONES, zoneAt } from "./world-rpg-data.js";
export { ZONES, zoneAt };

export function makeZones({ THREE, K, planet, kit, T }) {
  const root = new THREE.Group(); root.name = "zones"; planet.add(root);
  const rnd = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o });
  const glowM = (c, k = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const spins = [], signs = [], gates = [];
  ZONES.forEach((zn, zi) => {
    const g = new THREE.Group(); g.position.set(zn.x, 0, zn.z); root.add(g);
    const r = rnd(97 + zi * 13);
    // the ground and its border
    const ground = new THREE.Mesh(new THREE.CircleGeometry(zn.r, 64), new THREE.MeshStandardMaterial({ color: zn.ground, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; ground.userData.keep = true; g.add(ground);
    const border = new THREE.Mesh(new THREE.TorusGeometry(zn.r, 0.12, 8, 128), glowM(zn.color, 1.6)); border.rotation.x = Math.PI / 2; border.position.y = 0.08; border.userData.keep = true; g.add(border);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), std(0x2a3442, { metalness: 0.5 })); post.position.set(Math.cos(a) * zn.r, 0.55, Math.sin(a) * zn.r); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowM(zn.color, 2.4)); cap.position.y = 0.62; post.add(cap); g.add(post); }
    // the gate on the side facing the plaza
    const toPlaza = Math.atan2(-zn.x, -zn.z);
    const gate = K.makeArch(zn.color); gate.scale.setScalar(1.25); gate.position.set(Math.sin(toPlaza) * zn.r, 0, Math.cos(toPlaza) * zn.r); gate.rotation.y = toPlaza; gate.userData.keep = true; g.add(gate); gates.push(gate);
    const sign = K.label(zn.name, { accent: "#" + new THREE.Color(zn.color).getHexString(), size: 1.0, sub: T("Level {a}–{b}", { a: zn.lv[0], b: zn.lv[1] }) }); sign.position.set(gate.position.x, 7.6, gate.position.z); g.add(sign); signs.push({ sign, x: zn.x + gate.position.x, z: zn.z + gate.position.z });
    // props
    const prop = (mesh, x, z, ry = r() * 6) => { mesh.position.set(x, mesh.position.y, z); mesh.rotation.y = ry; mesh.castShadow = true; g.add(mesh); return mesh; };
    const spot = (minR = 4) => { for (let k = 0; k < 20; k++) { const a = r() * Math.PI * 2, d = minR + r() * (zn.r - minR - 2); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.hypot(x - gate.position.x, z - gate.position.z) > 6) return [x, z]; } return [0, 0]; };
    if (zn.id === "spam") {
      for (let i = 0; i < 9; i++) { const [x, z] = spot(); const c = kit && K.prop(kit, ["Crate", "CrateLarge", "CrateTarp", "Barrel"][i % 4], { s: 1.6 + r() }); if (c) prop(c, x, z); }
      for (let i = 0; i < 4; i++) { const [x, z] = spot(6); const s = K.label(["FREE $$$", "CLICK HERE", "YOU WON", "DM ME"][i], { accent: "#ff4d6d", color: "#ffc861", size: 0.7 }); s.position.set(x, 3.2, z); g.add(s); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), std(0x2a3442)); pole.position.set(x, 1.5, z); g.add(pole); }
    } else if (zn.id === "fields") {
      const cols = [0xff5f73, 0x4fa8ff, 0x7fe05a, 0xffc861, 0xb48cff];
      for (let i = 0; i < 16; i++) { const [x, z] = spot(3); const s = 0.6 + r() * 0.9; const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), std(cols[i % 5], { flatShading: false, roughness: 0.5 })); box.position.y = s / 2; const rib = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 1.02, s * 0.18), std(0xffffff, { flatShading: false })); const rib2 = rib.clone(); rib2.rotation.y = Math.PI / 2; box.add(rib, rib2); prop(box, x, z); }
      for (let i = 0; i < 26; i++) { const [x, z] = spot(2); const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 4), std(0xc8b060)); tuft.position.y = 0.35; prop(tuft, x, z); }
    } else if (zn.id === "swamp") {
      for (let i = 0; i < 9; i++) { const [x, z] = spot(3); const pud = new THREE.Mesh(new THREE.CircleGeometry(1.5 + r() * 2.2, 24), new THREE.MeshStandardMaterial({ color: 0x3a6a3a, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3 })); pud.rotation.x = -Math.PI / 2; pud.position.y = 0.05; prop(pud, x, z, 0); const bub = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9fe08a, transparent: true, opacity: 0.6 })); bub.position.set(x, 0.1, z); g.add(bub); spins.push((dt, t) => { const k = (t * 0.6 + i * 0.37) % 1; bub.position.y = 0.1 + k * 0.6; bub.scale.setScalar(0.5 + k); bub.material.opacity = 0.6 * (1 - k); }); }
      for (let i = 0; i < 8; i++) { const [x, z] = spot(4); const t = new THREE.Group(); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 3.4, 6), std(0x3a2e24)); tr.position.y = 1.7; t.add(tr); for (let k = 0; k < 3; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.4, 5), std(0x3a2e24)); br.position.set(0, 2.2 + k * 0.4, 0); br.rotation.z = (k % 2 ? 1 : -1) * 0.9; br.rotation.y = k * 2; t.add(br); } prop(t, x, z); }
      const honey = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 2.2, 10), std(0xffa63a, { emissive: 0xff8a1a, emissiveIntensity: 0.3 })); honey.position.y = 1.1; prop(honey, 0, 0);
    } else if (zn.id === "canyon") {
      for (let i = 0; i < 12; i++) { const [x, z] = spot(3); const h = 3 + r() * 6; const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.4 + r() * 0.5, 1.3 + r(), h, 6), std([0xb85a3a, 0x9a4a30, 0xc86a40][i % 3])); sp.position.y = h / 2; prop(sp, x, z); }
      for (let i = 0; i < 10; i++) { const [x, z] = spot(2); const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + r() * 0.7, 0), std(0x8a4a32)); rk.position.y = 0.4; prop(rk, x, z); }
    } else if (zn.id === "depths") {
      for (let i = 0; i < 9; i++) { const [x, z] = spot(3); const h = 3 + r() * 3; const ob = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), std(0x1a1428, { metalness: 0.6, roughness: 0.3 })); ob.position.y = h / 2; const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glowM(0xb48cff, 2.4)); cr.position.y = h / 2 + 0.7; ob.add(cr); spins.push((dt, t) => { cr.rotation.y = t * 1.4 + i; cr.position.y = h / 2 + 0.7 + Math.sin(t * 2 + i) * 0.15; }); prop(ob, x, z); }
      for (let i = 0; i < 14; i++) { const [x, z] = spot(2); const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 5), glowM(0x8a5cff, 1.2)); c.position.y = 0.5; prop(c, x, z); }
    }
    // the far ring (Lv 30–100): each ground's own look
    else if (zn.deco === "ice") {
      for (let i = 0; i < 14; i++) { const [x, z] = spot(3); const h = 1.5 + r() * 4; const c = new THREE.Mesh(new THREE.ConeGeometry(0.5 + r() * 0.6, h, 5), std(0xdff4ff, { emissive: 0x8fe6ff, emissiveIntensity: 0.25, roughness: 0.2 })); c.position.y = h / 2; prop(c, x, z); }
      for (let i = 0; i < 8; i++) { const [x, z] = spot(4); const m = new THREE.Mesh(new THREE.ConeGeometry(2 + r() * 2, 4 + r() * 4, 6), std(0x9fb8cc)); m.position.y = 2; prop(m, x, z); const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 6), std(0xf4fbff)); cap.position.set(m.position.x, 4.6, m.position.z); g.add(cap); }
    } else if (zn.deco === "dunes") {
      for (let i = 0; i < 9; i++) { const [x, z] = spot(3); const d = new THREE.Mesh(new THREE.SphereGeometry(1.4 + r() * 1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xd8b070)); d.scale.y = 0.22; prop(d, x, z); }
      for (let i = 0; i < 10; i++) { const [x, z] = spot(2); const c = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.6, 8), std(0x4c8a4a)); t.position.y = 1.3; c.add(t); for (const sgn of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.1, 8), std(0x4c8a4a)); arm.position.set(sgn * 0.5, 1.5 + r() * 0.5, 0); c.add(arm); } prop(c, x, z); }
    } else if (zn.deco === "reef") {
      for (let i = 0; i < 16; i++) { const [x, z] = spot(2); const h = 1 + r() * 3; const c = new THREE.Mesh(new THREE.ConeGeometry(0.3 + r() * 0.4, h, 6), glowM([0xff7ab0, 0x35d8d0, 0xffc861][i % 3], 0.6)); c.position.y = h / 2; prop(c, x, z); }
      for (let i = 0; i < 10; i++) { const [x, z] = spot(3); const sh = new THREE.Mesh(new THREE.SphereGeometry(0.7 + r() * 0.8, 10, 8), std(0xf0e4d8, { roughness: 0.5 })); sh.scale.set(1, 0.6, 1.3); sh.position.y = 0.3; prop(sh, x, z); }
    } else if (zn.deco === "toxic") {
      for (let i = 0; i < 12; i++) { const [x, z] = spot(3); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), std(0x3a4a2a, { metalness: 0.5 })); b.position.y = 0.6; prop(b, x, z); const top = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), glowM(0x9aff3c, 1.4)); top.rotation.x = -Math.PI / 2; top.position.set(b.position.x, 1.21, b.position.z); g.add(top); }
      for (let i = 0; i < 6; i++) { const [x, z] = spot(4); const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4 + r() * 1.6, 20), glowM(0x7fe02a, 0.8)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; prop(pool, x, z, 0); }
    } else if (zn.deco === "ruins") {
      for (let i = 0; i < 14; i++) { const [x, z] = spot(3); const h = 1 + r() * 4; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, h, 10), std(0xd8d0e4, { roughness: 0.6 })); c.position.y = h / 2; c.rotation.z = (r() - 0.5) * 0.2; prop(c, x, z); }
      for (let i = 0; i < 6; i++) { const [x, z] = spot(4); const t = K.label(["WITHDRAWALS PAUSED", "100% SAFE", "PROOF OF RESERVES?", "MAINTENANCE"][i % 4], { accent: "#b48cff", color: "#ffc861", size: 0.6 }); t.position.set(x, 3, z); g.add(t); }
    } else if (zn.deco === "lava") {
      for (let i = 0; i < 12; i++) { const [x, z] = spot(3); const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + r() * 1.4, 0), std(0x2a1410)); rk.position.y = 0.6; prop(rk, x, z); }
      for (let i = 0; i < 8; i++) { const [x, z] = spot(3); const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3 + r() * 4), glowM(0xff5a1a, 2.2)); crack.rotation.x = -Math.PI / 2; crack.position.y = 0.06; prop(crack, x, z); }
      for (let i = 0; i < 3; i++) { const [x, z] = spot(6); const br = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 1.4), std(0x3a2a2a, { metalness: 0.4 })); br.position.y = 2.6; br.rotation.z = 0.25; prop(br, x, z); }
    } else if (zn.deco === "void") {
      for (let i = 0; i < 18; i++) { const [x, z] = spot(2); const s = 0.4 + r() * 1.2; const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), std(0x1a0a28, { metalness: 0.7, roughness: 0.2, emissive: 0xff4dd2, emissiveIntensity: 0.15 })); c.position.y = 1 + r() * 5; c.rotation.set(r() * 3, r() * 3, 0); prop(c, x, z); }
      for (let i = 0; i < 6; i++) { const [x, z] = spot(4); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 8, 32), glowM(0xff4dd2, 1.8)); ring.position.y = 2.5; prop(ring, x, z); }
    }
    // the props never move: merge the ones that look alike into one mesh each (hundreds of draw calls fewer)
    if (K.mergeStatic) K.mergeStatic(g);
    g.userData = { zone: zn, border };
    spins.push((dt, t) => { border.material.emissiveIntensity = 1.3 + Math.sin(t * 2 + zi) * 0.4; });
  });
  // a gate's sign right over your head would sit on top of the HUD: it fades out while you stand under it
  const fadeSigns = () => { const px = -planet.position.x, pz = -planet.position.z; for (const s of signs) { const d = Math.hypot(s.x - px, s.z - pz), k = Math.max(0, Math.min(1, (d - 6) / 6)); s.sign.material.opacity = k; s.sign.visible = k > 0.02; } };
  return { root, gates, update: (dt, t) => { spins.forEach((f) => f(dt, t)); fadeSigns(); }, zoneAt };
}
