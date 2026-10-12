// world-showcase.js — a small floating terrace beside My Island with what you've done out in the world: an aquarium
// with one of each fish you've caught swimming in it, and a trophy for each hunting ground's boss you've beaten
// (dim pedestals for the ones still to come). Built when you enter your own island, from the save (rpg.x.fish,
// rpg.x.bk); nothing here is bought or sold.
export function createShowcase({ THREE, K, T, fishList, zones, fish3d }) {
  const g = new THREE.Group(); g.name = "showcase";
  let swimmers = [], spinners = [];
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  // what was built before goes: geometries, materials and the labels' canvas textures
  function wipe() { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }); g.clear(); swimmers = []; spinners = []; }
  function build(data, W) {
    wipe();
    g.position.set(-W / 2 + 12, 0.2, W / 2 + 7.5); // off the front edge, near where you arrive
    // the terrace and its rocky underside
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 6.4, 0.8, 28), std(0xd8d4cc, { roughness: 0.8 })); base.position.y = -0.4; base.receiveShadow = true; g.add(base);
    const under = new THREE.Mesh(new THREE.ConeGeometry(6.2, 6, 9), std(0x7d7368, { flatShading: true, roughness: 1 })); under.rotation.x = Math.PI; under.position.y = -3.8; g.add(under);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(7, 0.1, 6, 56), std(0x35d8d0, { emissive: 0x35d8d0, emissiveIntensity: 1.2 })); trim.rotation.x = Math.PI / 2; trim.position.y = 0.02; g.add(trim);
    // the aquarium at the back (away from the island)
    const tank = new THREE.Group(); tank.position.set(0, 0, 3.6); g.add(tank); // at the back, seen from the island
    tank.add(at(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.4, 2.6), std(0x2e3440, { metalness: 0.5 })), 0, 0.2, 0));
    tank.add(at(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 2.2), std(0xe9d3a8)), 0, 0.52, 0));
    const water = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.3, 2.2), new THREE.MeshStandardMaterial({ color: 0x4fa8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false })); water.position.y = 1.75; tank.add(water);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.6, 2.4), new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.14, roughness: 0.02, depthWrite: false })); glass.position.y = 1.85; tank.add(glass);
    tank.add(at(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 2.6), std(0x2e3440, { metalness: 0.5 })), 0, 3.2, 0));
    for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6 + (i % 3) * 0.35, 0.05, 1, 4, 1), std(0x2e9a6a)); w.position.set(-2.1 + i * 1.05, 0.9 + (i % 3) * 0.17, -0.6 + (i % 2) * 0.9); tank.add(w); }
    const caught = fishList.filter((f) => data.fish && data.fish[f.id]);
    caught.forEach((f, i) => { const m = fish3d(f.color); m.scale.multiplyScalar(0.55); tank.add(m); swimmers.push({ m, ph: i * 1.7, y: 1.1 + (i % 4) * 0.42, r: 1.6 + (i % 3) * 0.3, sp: 0.35 + (i % 5) * 0.08 }); });
    const lab = K.label(T("Aquarium · {n} of {m}", { n: caught.length, m: fishList.length }), { accent: "#4fa8ff", size: 0.5 }); lab.position.set(0, 4.1, 3.6); g.add(lab);
    // the trophies: a pedestal per ground in an arc at the front (the island side), lit when its boss has fallen
    const won = zones.filter((z) => data.bk && data.bk[z.id]).length;
    zones.forEach((z, i) => {
      const a = Math.PI * (0.12 + (0.76 * i) / Math.max(1, zones.length - 1)), x = Math.cos(a) * 5.2, zz = -Math.sin(a) * 4.2 + 0.2, n = (data.bk && data.bk[z.id]) || 0;
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), std(n ? 0x2e3440 : 0x4a4f58, { metalness: n ? 0.5 : 0 })); ped.position.set(x, 0.45, zz); g.add(ped);
      if (n) { const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), std(z.color, { emissive: z.color, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.3 })); t.position.set(x, 1.35, zz); t.scale.y = 1.4; g.add(t); spinners.push({ m: t, ph: i });
        const cr = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 20), std(0xffc861, { emissive: 0xffc861, emissiveIntensity: 0.8, metalness: 0.8 })); cr.rotation.x = Math.PI / 2; cr.position.set(x, 0.95, zz); g.add(cr); }
    });
    const lab2 = K.label(T("Boss trophies · {n} of {m}", { n: won, m: zones.length }), { accent: "#ffc861", size: 0.5 }); lab2.position.set(0, 2.4, -4.6); g.add(lab2);
    return { fish: caught.length, trophies: won };
  }
  function tick(dt, t) {
    for (const s of swimmers) { const a = t * s.sp + s.ph; s.m.position.set(Math.cos(a) * s.r * 1.1, s.y + Math.sin(t * 1.3 + s.ph) * 0.12, Math.sin(a) * 0.55); s.m.rotation.y = -a + Math.PI; }
    for (const s of spinners) { s.m.rotation.y = t * 1.2 + s.ph; s.m.position.y = 1.35 + Math.sin(t * 2 + s.ph) * 0.06; }
  }
  return { group: g, build, tick, clear: wipe };
}
