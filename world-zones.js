// world-zones.js — the five hunting grounds around the town (positions and levels in world-rpg-data.js ZONES):
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
  const spins = [];
  ZONES.forEach((zn, zi) => {
    const g = new THREE.Group(); g.position.set(zn.x, 0, zn.z); root.add(g);
    const r = rnd(97 + zi * 13);
    // the ground and its border
    const ground = new THREE.Mesh(new THREE.CircleGeometry(zn.r, 64), new THREE.MeshStandardMaterial({ color: zn.ground, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; g.add(ground);
    const border = new THREE.Mesh(new THREE.TorusGeometry(zn.r, 0.12, 8, 128), glowM(zn.color, 1.6)); border.rotation.x = Math.PI / 2; border.position.y = 0.08; g.add(border);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), std(0x2a3442, { metalness: 0.5 })); post.position.set(Math.cos(a) * zn.r, 0.55, Math.sin(a) * zn.r); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowM(zn.color, 2.4)); cap.position.y = 0.62; post.add(cap); g.add(post); }
    // the gate on the side facing the plaza
    const toPlaza = Math.atan2(-zn.x, -zn.z);
    const gate = K.makeArch(zn.color); gate.scale.setScalar(1.25); gate.position.set(Math.sin(toPlaza) * zn.r, 0, Math.cos(toPlaza) * zn.r); gate.rotation.y = toPlaza; g.add(gate);
    const sign = K.label(zn.name, { accent: "#" + new THREE.Color(zn.color).getHexString(), size: 1.0, sub: T("Level {a}–{b}", { a: zn.lv[0], b: zn.lv[1] }) }); sign.position.set(gate.position.x, 7.6, gate.position.z); g.add(sign);
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
    g.userData = { zone: zn, border };
    spins.push((dt, t) => { border.material.emissiveIntensity = 1.3 + Math.sin(t * 2 + zi) * 0.4; });
  });
  return { root, update: (dt, t) => spins.forEach((f) => f(dt, t)), zoneAt };
}
