// world-zones.js — the hunting grounds around the town (five near, seven in the far ring) (positions and levels in world-rpg-data.js ZONES):
// a tinted ground with a glowing border, a gate facing the plaza with the name and levels, and props that set the
// mood — crates and spam signs, gift boxes in a field, a swamp, red rock spires, dark crystals. Inside a ground the
// fog turns to its colour (world-play.js asks zoneAt()).
import { ZONES, zoneAt, pondOf } from "./world-rpg-data.js";
import { farProps } from "./world-zones-far.js";
export { ZONES, zoneAt };

export function makeZones({ THREE, K, planet, kit, T, low = false, onBuilt = null }) {
  const root = new THREE.Group(); root.name = "zones"; planet.add(root);
  const rnd = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o });
  const glowM = (c, k = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const spins = [], signs = [], gates = [], lazy = [];
  ZONES.forEach((zn, zi) => {
    const g = new THREE.Group(); g.position.set(zn.x, 0, zn.z); root.add(g);
    const r = rnd(97 + zi * 13);
    // the ground and its border
    const ground = new THREE.Mesh(new THREE.CircleGeometry(zn.r, 64), new THREE.MeshStandardMaterial({ color: zn.ground, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; ground.userData.keep = true; ground.name = "zone-ground"; g.add(ground);
    const border = new THREE.Mesh(new THREE.TorusGeometry(zn.r, 0.12, 8, 128), glowM(zn.color, 1.6)); border.rotation.x = Math.PI / 2; border.position.y = 0.08; border.userData.keep = true; g.add(border);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), std(0x2a3442, { metalness: 0.5 })); post.position.set(Math.cos(a) * zn.r, 0.55, Math.sin(a) * zn.r); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowM(zn.color, 2.4)); cap.position.y = 0.62; post.add(cap); g.add(post); }
    // the gate on the side facing the plaza
    const toPlaza = Math.atan2(-zn.x, -zn.z);
    const gate = K.makeArch(zn.color); gate.scale.setScalar(1.25); gate.position.set(Math.sin(toPlaza) * zn.r, 0, Math.cos(toPlaza) * zn.r); gate.rotation.y = toPlaza; gate.userData.keep = true; g.add(gate); gates.push(gate);
    const sign = K.label(zn.name, { accent: "#" + new THREE.Color(zn.color).getHexString(), size: 1.0, sub: T("Level {a}–{b}", { a: zn.lv[0], b: zn.lv[1] }) }); sign.position.set(gate.position.x, 7.6, gate.position.z); g.add(sign); signs.push({ sign, x: zn.x + gate.position.x, z: zn.z + gate.position.z });
    // props
    // a far ground's props go in a group of their own, built only when you come near (faster start, fewer draw calls)
    const pg = zn.deco ? new THREE.Group() : g; if (pg !== g) { pg.name = "props"; g.add(pg); }
    const prop = (mesh, x, z, ry = r() * 6) => { mesh.position.set(x, mesh.position.y, z); mesh.rotation.y = ry; mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; }); pg.add(mesh); return mesh; };
    const pd = pondOf(zn), pdx = pd ? pd.x - zn.x : 0, pdz = pd ? pd.z - zn.z : 0; // the fishing pond stays clear
    const spot = (minR = 4) => { for (let k = 0; k < 20; k++) { const a = r() * Math.PI * 2, d = minR + r() * (zn.r - minR - 2); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.hypot(x - gate.position.x, z - gate.position.z) > 6 && (!pd || Math.hypot(x - pdx, z - pdz) > pd.r + 2.5)) return [x, z]; } return [0, 0]; };
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
      for (let i = 0; i < 9; i++) { const [x, z] = spot(3); const h = 2.4 + r() * 1.8; const ob = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.9), std(0x3a2c5c, { metalness: 0.35, roughness: 0.4, emissive: 0x1c1236, emissiveIntensity: 1 })); const ry = r() * 6; ob.position.y = h / 2; prop(ob, x, z, ry); /* a lit market obelisk (it was near-black and read as a hole in the screen), with a glowing band */ const band = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.96), glowM(0xb48cff, 1.8)); band.position.y = h * 0.78; prop(band, x, z, ry); const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glowM(0xb48cff, 2.4)); cr.position.set(x, h + 0.7, z); cr.userData.keep = true; g.add(cr); spins.push((dt, t) => { cr.rotation.y = t * 1.4 + i; cr.position.y = h + 0.7 + Math.sin(t * 2 + i) * 0.15; }); } // the crystal is the ground's child, not the column's: the column gets merged away
      for (let i = 0; i < 14; i++) { const [x, z] = spot(2); const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 5), glowM(0x8a5cff, 1.2)); c.position.y = 0.5; prop(c, x, z); }
    }
    // the far ring (Lv 30–100): each ground's own scene (world-zones-far.js)
    else if (zn.deco) lazy.push({ zn, g, built: false, build: () => { farProps({ THREE, K, zn, g: pg, r, prop, spot, std, glowM, spins, low }); if (K.mergeStatic) K.mergeStatic(pg); if (onBuilt) onBuilt(zn); } });
    // a frame round the near grounds, just outside the posts: each ground's own silhouette on the skyline (billboards,
    // fences and hay, reeds and dead trunks, red rock walls, dark crystal shards); the gate's side is left open
    { const RIM = { spam: "boards", fields: "fence", swamp: "reeds", canyon: "walls", depths: "shards" }, kind = RIM[zn.id];
      if (kind) { const n = 18, ga = Math.atan2(gate.position.x, gate.position.z);
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r() * 0.15; let da = Math.abs(((a - ga + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < 0.42) continue;
          const rr = zn.r + 2.2 + r() * 1.6, x = Math.sin(a) * rr, z = Math.cos(a) * rr, m = new THREE.Group();
          if (kind === "boards") { const h = 3 + r() * 2; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 6), std(0x2a3442)); pole.position.y = h / 2; const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.1), glowM([0xff4d6d, 0xffc861, 0x35d8d0][i % 3], 0.9)); b.position.y = h; m.add(pole, b); }
          else if (kind === "fence") { for (let k = -1; k <= 1; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), std(0x8a6a44)); p.position.set(k * 1.1, 0.5, 0); m.add(p); } for (const y of [0.35, 0.75]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.08), std(0x9a7a50)); rail.position.y = y; m.add(rail); } if (i % 3 === 0) { const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 12), std(0xd8b860)); hay.rotation.z = Math.PI / 2; hay.position.set(0, 0.55, 1.2); m.add(hay); } }
          else if (kind === "reeds") { for (let k = 0; k < 5; k++) { const h = 1.2 + r() * 1.2; const rd = new THREE.Mesh(new THREE.ConeGeometry(0.06, h, 4), std(0x6a8a4a)); rd.position.set((r() - 0.5) * 1.2, h / 2, (r() - 0.5) * 1.2); rd.rotation.z = (r() - 0.5) * 0.3; m.add(rd); } if (i % 4 === 0) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 3.2, 6), std(0x3a2e24)); t.position.y = 1.5; t.rotation.z = 0.25; m.add(t); } }
          else if (kind === "walls") { const h = 4 + r() * 5; const w = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), std([0xb85a3a, 0x9a4a30, 0xc86a40][i % 3])); w.scale.set(1, h / 3.2, 0.8); w.position.y = h / 2 - 0.4; m.add(w); }
          else { const h = 1.6 + r() * 2.4; const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), std(0x2c2244, { emissive: 0x3a1c6a, emissiveIntensity: 0.6 })); sh.scale.set(0.7, h, 0.7); sh.position.y = h * 0.45; sh.rotation.z = (r() - 0.5) * 0.4; m.add(sh); }
          m.position.set(x, 0, z); m.rotation.y = a + Math.PI / 2; m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); pg.add(m);
        } } }
    // the props never move: merge the ones that look alike into one mesh each (hundreds of draw calls fewer)
    if (K.mergeStatic) K.mergeStatic(g);
    g.userData = { zone: zn, border };
    spins.push((dt, t) => { border.material.emissiveIntensity = 1.3 + Math.sin(t * 2 + zi) * 0.4; });
  });
  // a gate's sign right over your head would sit on top of the HUD: it fades out while you stand under it
  const fadeSigns = () => { const px = -planet.position.x, pz = -planet.position.z; for (const s of signs) { const d = Math.hypot(s.x - px, s.z - pz), k = Math.max(0, Math.min(1, (d - 6) / 6)); s.sign.material.opacity = k; s.sign.visible = k > 0.02; } };
  // the far grounds come together when you're within 70 m of one (one a frame, so a fly-by never stalls)
  // a hunting ground's props are built as you come near (b413: well ahead, in a quiet moment, instead of in the middle
  // of a frame as you run in; at 40 m from its edge it's built right away if the quiet moment hasn't come)
  let queued = null;
  const buildNear = (all) => { const px = -planet.position.x, pz = -planet.position.z;
    for (const l of lazy) { if (l.built) continue; const d = Math.hypot(l.zn.x - px, l.zn.z - pz) - l.zn.r;
      if (all || d < 40) { l.built = true; l.build(); if (!all) return; continue; }
      if (d < 160 && !queued) { queued = l; const go = () => { const q = queued; queued = null; if (q && !q.built) { q.built = true; q.build(); } };
        if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 300); return; } } };
  return { root, gates, update: (dt, t) => { buildNear(false); spins.forEach((f) => f(dt, t)); fadeSigns(); }, zoneAt, buildAll: () => buildNear(true), built: () => lazy.filter((l) => l.built).map((l) => l.zn.id) };
}
