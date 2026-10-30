// world-minevillage.js — the Mining Village: a dusty clearing south-east of the plaza, between Honeypot Swamp and Bot
// Farm Wastes, with the ARCL Mine's entrance cut into a rocky hill. Walk up to the tunnel to go in (world-mine.js).
// Cheap until you come near: the ground, the arch and the sign load with the town; the hill, the tunnel, the rails,
// the cart and the props are made the first time you're within BUILD_AT and hidden again past HIDE_AT.
export const MINE_VILLAGE = { x: 83, z: -106, r: 22 };
const BUILD_AT = 80, HIDE_AT = 100;

export function makeMineVillage({ THREE, K, planet, T, low = false, light = !low, look = null, ver = "", compile = null }) {
  const cs = (m) => (look && look.contact ? look.contact(m) : m);
  const V = MINE_VILLAGE, root = new THREE.Group(); root.name = "minevillage"; root.position.set(V.x, 0, V.z); planet.add(root);
  // the cart's light lives on the planet from the start, dark until the cart is built: a light coming and going (with the
  // cart, or hidden with a far-culled group) changes the light count, and every lit shader in town is made again
  const cartGlow = !light ? null : new THREE.PointLight(0xffc861, 0, 6, 2); if (cartGlow) { cartGlow.position.set(V.x, 1.8, V.z); planet.add(cartGlow); }
  const std = (c, o = {}) => cs(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, ...o }));
  const glow = (c, k = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  let sd = 731; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  // the clearing: packed earth with a soft grassy rim, and a mint glow line around it (the ARCIRCLE edge)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(V.r, 64), new THREE.MeshStandardMaterial({ color: 0xa88a62, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; ground.name = "mv-ground"; root.add(ground);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(V.r, 0.1, 6, 128), glow(0x4fe6c8, 0.8)); edge.rotation.x = Math.PI / 2; edge.position.y = 0.08; root.add(edge);
  // the arch faces the plaza, the village's name over it
  const toPlaza = Math.atan2(-V.x, -V.z), gx = Math.sin(toPlaza) * V.r, gz = Math.cos(toPlaza) * V.r;
  const gate = K.makeArch(0xffc861); gate.scale.setScalar(1.3); gate.position.set(gx, 0, gz); gate.rotation.y = toPlaza; root.add(gate);
  const sign = K.label(T("Mining Village"), { accent: "#ffc861", size: 1.1, sub: T("The ARCL Mine · copper, silver, gold") }); sign.position.set(gx, 8, gz); root.add(sign);
  // the hill sits across the clearing from the arch; the tunnel mouth faces the arch
  const away = toPlaza + Math.PI, hx = Math.sin(away) * (V.r - 7), hz = Math.cos(away) * (V.r - 7);
  const door = new THREE.Group(); door.position.set(hx + Math.sin(toPlaza) * 6.2, 0, hz + Math.cos(toPlaza) * 6.2); door.userData.game = "mine"; door.userData.radius = 1.6; root.add(door);
  const solids = [];
  // the miner (b5): a robot in a hard hat beside the tunnel; talk to him for pickaxes, ore and the week's board
  const minerSpot = new THREE.Group(); minerSpot.position.set(hx + Math.sin(toPlaza) * 7.2 + Math.cos(toPlaza) * 4.6, 0, hz + Math.cos(toPlaza) * 7.2 - Math.sin(toPlaza) * 4.6); minerSpot.userData.game = "miner"; minerSpot.userData.radius = 1.2; root.add(minerSpot);
  let miner = null;
  let built = null; const spins = [];
  function build() {
    built = new THREE.Group(); built.name = "mv-built"; root.add(built);
    const rockM = std(0x8a7a6a), rockD = std(0x6c5f55), wood = std(0x8a5a32), woodD = std(0x5e3b20), iron = std(0x5a6170, { metalness: 0.6, roughness: 0.45 });
    // the hill: a few lumpy boulders run together, taller in the middle
    const lump = (r, det = 1) => { const g = new THREE.IcosahedronGeometry(r, det), p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + (Math.sin(v.x * 1.7 + v.z * 0.9) * 0.08 + Math.sin(v.y * 2.3 + v.x) * 0.06); v.multiplyScalar(k); if (v.y < 0) v.y *= 0.4; p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); return g; };
    const hill = new THREE.Group(); hill.position.set(hx, 0, hz); hill.rotation.y = toPlaza; built.add(hill);
    const drawn = new THREE.Group(); hill.add(drawn); // the drawn hill and tunnel frame: stand-ins until the mine-entrance model is in
    [[0, 0, -1.2, 6.5, rockM], [-5, 0, 0, 4.6, rockD], [5.2, 0, -0.3, 4.9, rockM], [-2.6, 2.2, -2.4, 4.2, rockD], [2.8, 2.6, -2.2, 4, rockM], [0, 4.6, -3.2, 3.2, rockD]].forEach(([x, y, z, r, m]) => {
      const b = new THREE.Mesh(lump(r, low ? 1 : 2), m); b.position.set(x, y, z); b.castShadow = !low; b.receiveShadow = true; drawn.add(b); });
    // grass tufts and little gold veins on the hill
    for (let i = 0; i < (low ? 8 : 18); i++) { const a = rnd() * Math.PI - Math.PI / 2, r = 5.5 + rnd() * 1.8, y = 1 + rnd() * 4.5; const vein = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 + rnd() * 0.16, 0), glow(i % 3 ? 0xffc861 : 0xd9e4f0, i % 3 ? 1.2 : 0.6)); vein.position.set(Math.sin(a) * r, y, -1.2 + Math.cos(a) * r * 0.6); drawn.add(vein); }
    // the tunnel mouth: a dark opening in a timber frame, a lantern on each side and the mine's sign over it
    const mouth = new THREE.Group(); mouth.position.set(0, 0, 4.2); drawn.add(mouth);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.8), new THREE.MeshBasicMaterial({ color: 0x07080c })); dark.position.set(0, 1.9, -0.05); mouth.add(dark);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 4, 16, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0b0d14, side: THREE.BackSide })); inner.rotation.x = Math.PI / 2; inner.position.set(0, 1.9, -2); inner.scale.set(1, 1, 1.1); mouth.add(inner);
    [[-1.9, 2.1], [1.9, 2.1]].forEach(([x]) => { const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.4, 0.45), wood); post.position.set(x, 2.2, 0); post.castShadow = !low; mouth.add(post); });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.55, 0.6), woodD); lintel.position.set(0, 4.5, 0); lintel.castShadow = !low; mouth.add(lintel);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), wood); [-1, 1].forEach((s) => { const b = brace.clone(); b.position.set(s * 1.55, 3.85, 0.05); b.rotation.z = s * 0.75; mouth.add(b); });
    const plate = K.label(T("ARCL MINE"), { accent: "#ffc861", size: 0.75, sub: T("Walk in to mine") }); plate.position.set(0, 9.4, 4.6); hill.add(plate);
    const lamps = [];
    [-2.5, 2.5].forEach((x) => { const l = new THREE.Group(); l.position.set(x, 3.1, 0.35);
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.34), iron); const fl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), glow(0xffb347, 3)); l.add(cage, fl); mouth.add(l); lamps.push(fl); });
    spins.push((dt, t) => { lamps.forEach((f, i) => { f.material.emissiveIntensity = 2.6 + Math.sin(t * 9 + i * 2) * 0.35 + Math.sin(t * 23 + i) * 0.2; }); });
    // rails out of the tunnel, a cart heaped with glowing ore at their end
    const railLen = 9, rails = new THREE.Group(); rails.position.set(0, 0, 5.4); hill.add(rails);
    [-0.55, 0.55].forEach((x) => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, railLen), iron); r.position.set(x, 0.1, railLen / 2 - 1.5); rails.add(r); });
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.3), woodD); s.position.set(0, 0.05, -1 + i * 1); rails.add(s); }
    const cart = new THREE.Group(); cart.position.set(0, 0, railLen - 2.6); rails.add(cart);
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.9), iron); tub.position.y = 0.75; tub.castShadow = !low; cart.add(tub);
    const rimG = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 2), std(0x3c414c, { metalness: 0.6 })); rimG.position.y = 1.18; cart.add(rimG);
    [[-0.6, -0.65], [0.6, -0.65], [-0.6, 0.65], [0.6, 0.65]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), std(0x2a2e36, { metalness: 0.5 })); w.rotation.z = Math.PI / 2; w.position.set(x * 1.05, 0.24, z); cart.add(w); });
    const oreC = [0xffc861, 0xffc861, 0xd9e4f0, 0xd98a52, 0xd98a52, 0xd98a52];
    for (let i = 0; i < 16; i++) { const c = oreC[i % oreC.length], o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17 + rnd() * 0.12, 0), c === 0xffc861 ? glow(c, 1.4) : std(c, { metalness: 0.7, roughness: 0.35 })); o.position.set((rnd() - 0.5) * 1.1, 1.18 + rnd() * 0.32, (rnd() - 0.5) * 1.5); o.rotation.set(rnd() * 3, rnd() * 3, 0); cart.add(o); }
    if (cartGlow) { cartGlow.position.set(0, 1.8, 0); cart.add(cartGlow); built.updateMatrixWorld(true); planet.attach(cartGlow); cartGlow.intensity = 6; }
    // ore piles, crates and barrels along the clearing's edge, a pickaxe leaning on a crate
    const crate = new THREE.BoxGeometry(1, 1, 1), barrel = new THREE.CylinderGeometry(0.45, 0.45, 1, 12);
    const spot = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
    for (let i = 0; i < 7; i++) { const a = away + (i - 3) * 0.42 + (rnd() - 0.5) * 0.1, [x, z] = spot(a, V.r - 3.5 - rnd() * 2); if (Math.hypot(x - door.position.x, z - door.position.z) < 6) continue;
      const m = new THREE.Mesh(i % 2 ? crate : barrel, i % 2 ? wood : std(0x7a4a2a)); m.position.set(x, 0.5, z); m.rotation.y = rnd() * 3; m.castShadow = !low; built.add(m); m.userData.radius = 0.8; solids.push(m); }
    for (let i = 0; i < 4; i++) { const a = toPlaza + Math.PI / 2 * (i < 2 ? 1 : -1) + (i % 2 ? 0.3 : -0.3), [x, z] = spot(a, V.r - 5); const pile = new THREE.Group(); pile.position.set(x, 0, z); built.add(pile);
      for (let k = 0; k < 9; k++) { const c = k === 0 ? 0xffc861 : k < 3 ? 0xd9e4f0 : 0xd98a52, o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rnd() * 0.25, 0), k === 0 ? glow(c, 1.1) : std(c, { metalness: 0.55, roughness: 0.45 })); o.position.set((rnd() - 0.5) * 1.6, 0.25 + (k < 3 ? 0.35 : 0), (rnd() - 0.5) * 1.6); pile.add(o); }
      pile.userData.radius = 1.2; solids.push(pile); }
    // lantern posts in a ring, warm light pools at dusk
    const postG = new THREE.CylinderGeometry(0.08, 0.1, 3, 6), lampG = new THREE.SphereGeometry(0.2, 10, 8), lampM = glow(0xffb347, 2.4);
    for (let i = 0; i < 8; i++) { const a = toPlaza + (i + 0.5) * (Math.PI * 2 / 8); if (Math.abs(Math.atan2(Math.sin(a - toPlaza), Math.cos(a - toPlaza))) < 0.35) continue; const [x, z] = spot(a, V.r - 1.2);
      const p = new THREE.Mesh(postG, woodD); p.position.set(x, 1.5, z); built.add(p); const l = new THREE.Mesh(lampG, lampM); l.position.set(x, 3.1, z); built.add(l); }
    // the mine-entrance model (Meshy, tools/pack-prop.mjs): the rocky hill with its timbered tunnel, facing the arch
    if (K.gltfLoader) K.gltfLoader().loadAsync("models/world/mine/mine-entrance.glb" + ver).then((g) => {
      const o = g.scene, b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = 13 / (sz.x || 1);
      o.scale.multiplyScalar(k); o.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k - 0.6);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = !low; m.receiveShadow = true; if (m.material) cs(m.material); } });
      hill.add(o); drawn.visible = false; rails.visible = false; // the model has its own rails; the lanterns stay lit at its tunnel
      lamps.forEach((f) => { f.parent.position.z = sz.z * k / 2 - 0.2; f.parent.position.y = 3.2; f.parent.position.x *= 1.15; hill.add(f.parent); });
    }).catch((e) => console.warn("mine entrance:", e));
    // the miner: the ARC robot, a yellow hard hat with a lamp, a pickaxe over the shoulder, a name over him
    if (K.makeCharacter) K.makeCharacter("bot").then((c) => { if (!c) return; miner = c; c.obj.rotation.y = toPlaza - 0.5; minerSpot.add(c.obj);
      const hat = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffc23a, { flatShading: false, roughness: 0.4 })); hat.position.y = (c.height || 2.3) - 0.05; const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 20), std(0xe0a020)); brim.position.y = hat.position.y; const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow(0xfff0b0, 3)); lamp.position.set(0, hat.position.y + 0.2, 0.38);
      const pk = new THREE.Group(); const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 8), std(0x8a5a32)); hd.position.y = 0.6; const hh = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.9, 6), std(0x9aa4b4, { metalness: 0.7, roughness: 0.3 })); hh.rotation.z = Math.PI / 2; hh.position.y = 1.15; pk.add(hd, hh); pk.position.set(0.5, 0.9, -0.1); pk.rotation.z = 0.5;
      minerSpot.add(hat, brim, lamp, pk);
      const tag = K.label(T("Miner"), { accent: "#ffc23a", size: 0.55, sub: T("Pickaxes · ore · this week") }); tag.position.y = (c.height || 2.3) + 1.1; minerSpot.add(tag);
      spins.push((dt, t) => { if (miner && miner.update) miner.update(dt, t, 0, 0); }); }).catch(() => {});
    const hb = new THREE.Group(); hb.position.set(hx, 0, hz); hb.userData.radius = 5.4; root.add(hb); solids.push(hb);
  }
  return {
    root, solids, doors: [door, minerSpot], door, minerSpot, center: { x: V.x, z: V.z },
    /// keep the clearing clear: hide the scattered trees, crystals and hills (instanced) that fall inside it
    clear(group) {
      const m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0); planet.updateMatrixWorld(true);
      group.traverse((o) => { if (!o.isInstancedMesh) return; let n = 0;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).sub(planet.position); if (Math.hypot(v.x - V.x, v.z - V.z) < V.r + 2) { o.setMatrixAt(i, zero); n++; } }
        if (n) { o.instanceMatrix.needsUpdate = true; if (o.computeBoundingSphere) o.computeBoundingSphere(); } });
    },
    /// where to stand when you come out: in front of the tunnel, facing the arch
    exit() { return { x: V.x + door.position.x + Math.sin(toPlaza) * 3.2, z: V.z + door.position.z + Math.cos(toPlaza) * 3.2, face: toPlaza + Math.PI }; }, // facing the tunnel: the camera stays out of the hill
    tick(dt, t, px, pz) {
      const d = Math.hypot(px - V.x, pz - V.z);
      if (!built && d < BUILD_AT) { build(); if (compile) Promise.resolve().then(() => compile(built)).catch(() => {}); } // b5: its shaders made in the background as it appears (they were a hitch on the way in)
      if (built) { built.visible = d < HIDE_AT; if (cartGlow) cartGlow.intensity = built.visible ? 6 : 0; }
      if (built && built.visible) for (const f of spins) f(dt, t);
    },
  };
}
