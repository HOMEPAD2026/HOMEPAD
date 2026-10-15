// world-gamevillage.js — the Game Village: a wide clearing west of the plaza where the mini-games live, one building
// each, around an open square (the square is the arena games like AC Defense play in). GAMES is the list: a new game
// is one more entry (ready: true gives it a door you can walk up to; the rest stand as "Coming soon" plots).
// Cheap until you come near: the ground, the gate and the sign load with the town; the buildings are made the first
// time you're within BUILD_AT and hidden again past HIDE_AT.
export const VILLAGE = { x: -105, z: -5, r: 32, plotR: 21, arenaR: 10.5 };
export const GAMES = [
  { id: "soon1" }, { id: "soon2" }, { id: "soon3" }, { id: "soon4" }, { id: "soon5" },
  { id: "defense", name: "AC DEFENSE", color: 0xff6a4d, ready: true }, // the middle plot: straight ahead as you come through the gate
  { id: "soon6" }, { id: "soon7" }, { id: "soon8" }, { id: "soon9" }, { id: "soon10" },
];
const BUILD_AT = 75, HIDE_AT = 95;

export function makeGameVillage({ THREE, K, planet, T, low = false }) {
  const V = VILLAGE, root = new THREE.Group(); root.name = "gamevillage"; root.position.set(V.x, 0, V.z); planet.add(root);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true, ...o });
  const glow = (c, k = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const hex = (c) => "#" + new THREE.Color(c).getHexString();
  // the clearing, its glowing edge and the square in the middle
  const ground = new THREE.Mesh(new THREE.CircleGeometry(V.r, 64), new THREE.MeshStandardMaterial({ color: 0x8fd18a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; root.add(ground);
  const square = new THREE.Mesh(new THREE.CircleGeometry(V.arenaR + 1.5, 48), new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  square.rotation.x = -Math.PI / 2; square.position.y = 0.04; square.receiveShadow = true; root.add(square);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(V.r, 0.12, 6, 128), glow(0xb48cff, 1.4)); edge.rotation.x = Math.PI / 2; edge.position.y = 0.08; root.add(edge);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(V.arenaR + 1.5, 0.08, 6, 96), glow(0x38d8ff, 1.2)); inner.rotation.x = Math.PI / 2; inner.position.y = 0.07; root.add(inner);
  // the gate faces the plaza, with the village's name over it
  const toPlaza = Math.atan2(-V.x, -V.z), gx = Math.sin(toPlaza) * V.r, gz = Math.cos(toPlaza) * V.r;
  const gate = K.makeArch(0xb48cff); gate.scale.setScalar(1.35); gate.position.set(gx, 0, gz); gate.rotation.y = toPlaza; root.add(gate);
  const sign = K.label(T("Game Village"), { accent: "#b48cff", size: 1.1, sub: T("Mini-games · more coming") }); sign.position.set(gx, 8, gz); root.add(sign);
  // plots go round the square, leaving the gate's side open
  const slots = GAMES.length, a0 = toPlaza + 0.5, span = Math.PI * 2 - 1.0;
  const plotAt = (i) => { const a = a0 + (span * i) / (slots - 1); return { x: Math.sin(a) * V.plotR, z: Math.cos(a) * V.plotR, a }; };
  const doors = [], spins = [], solids = []; // solids: the game buildings you can't walk through
  let built = null;
  function towerOf(gm) { // AC Defense: a round stone keep with a neon crown and a door facing the square
    const g = new THREE.Group(), stone = std(0x8d97a8), dark = std(0x4a5366), neon = glow(gm.color, 2.2);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 8, 12), stone); body.position.y = 4; g.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.1, 1, 12), dark); top.position.y = 8.5; g.add(top);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.6), stone); m.position.set(Math.sin(a) * 3.3, 9.4, Math.cos(a) * 3.3); m.rotation.y = a; g.add(m); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.12, 6, 48), neon); ring.rotation.x = Math.PI / 2; ring.position.y = 7.3; g.add(ring);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 12), std(0xc0392b)); roof.position.y = 11.4; g.add(roof);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), neon); flag.position.set(0.6, 13.5, 0); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), dark); pole.position.y = 13.3; g.add(flag, pole);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 0.3), std(0x2a1d14)); door.position.set(0, 1.4, 3.25); g.add(door);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 24, Math.PI), neon); arch.position.set(0, 2.8, 3.3); g.add(arch);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), new THREE.MeshBasicMaterial({ color: gm.color, transparent: true, opacity: 0.25, depthWrite: false })); mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.06, 4.6); g.add(mat);
    if (!low) spins.push((dt, t) => { ring.rotation.z = t * 0.6; flag.rotation.y = Math.sin(t * 2) * 0.3; mat.material.opacity = 0.2 + Math.sin(t * 3) * 0.08; });
    const tag = K.label(gm.name, { accent: hex(gm.color), size: 0.9, sub: T("Tower defence · walk in to play") }); tag.position.y = 15.6; g.add(tag);
    return g;
  }
  function soonOf() { // an empty plot: a fenced pad and a sign
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.25, 8), std(0xb9b0a0)); pad.position.y = 0.12; g.add(pad);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), std(0x6b4a2e)); post.position.set(0, 0.8, 2.4); const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.12), std(0xe8c98a)); board.position.set(0, 1.6, 2.4); g.add(post, board);
    return g;
  }
  function build() {
    built = new THREE.Group(); root.add(built);
    let soonTag = null;
    GAMES.forEach((gm, i) => {
      const p = plotAt(i), g = gm.ready ? towerOf(gm) : soonOf();
      g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(-p.x, -p.z); // the front faces the square
      g.traverse((o) => { if (o.isMesh) o.castShadow = !low; });
      built.add(g); if (gm.ready) { g.userData.radius = 3.6; solids.push(g); }
      if (gm.ready) { const d = new THREE.Group(); d.position.set(p.x - Math.sin(p.a) * 4.6, 0, p.z - Math.cos(p.a) * 4.6); d.userData = { radius: 1.2, game: gm.id }; built.add(d); doors.push(d); }
      else { // one "Coming soon" sign texture, shared by every empty plot
        soonTag = soonTag || K.label(T("Coming soon"), { accent: "#ffc861", size: 0.85 });
        const s = soonTag.clone(); s.position.set(p.x, 3.4, p.z); built.add(s);
      }
    });
    decor();
  }
  // the festival dress: a stone path from the gate to the square, lamps round the square, bunting from lamp to lamp,
  // benches between the plots and striped work fences on the empty plots. Every kind is one InstancedMesh (a draw
  // each), the bunting one merged line of flags; the lamp heads glow by their material (no real lights).
  function decor() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    const inst = (geo, mat, list) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([x, y, z, ry, sx = 1, sy = 1, sz = 1], i) => { e.set(0, ry, 0); q.setFromEuler(e); m.setMatrixAt(i, m4.compose(v.set(x, y, z), q, sc.set(sx, sy, sz))); }); m.castShadow = !low; m.receiveShadow = true; built.add(m); };
    // the path: flat stones from the gate in to the square's edge
    const stones = [], dirX = -Math.sin(toPlaza), dirZ = -Math.cos(toPlaza);
    for (let d = V.r - 1; d > V.arenaR + 2.5; d -= 1.6) for (const off of [-0.9, 0.9]) stones.push([gx + dirX * (V.r - d) + -dirZ * off, 0.06, gz + dirZ * (V.r - d) + dirX * off, toPlaza + (off > 0 ? 0.2 : -0.15), 1, 1, 1]);
    inst(new THREE.CylinderGeometry(0.7, 0.75, 0.08, 6), std(0xcfc6b4), stones);
    // lamps round the square (a post and a glowing head), with bunting strung between neighbours
    const N = low ? 8 : 12, R = V.arenaR + 4, posts = [], heads = [], flags = [];
    const lamp = (i) => { const a = toPlaza + 0.35 + (i / N) * Math.PI * 2; return [Math.sin(a) * R, Math.cos(a) * R, a]; };
    for (let i = 0; i < N; i++) { const [x, z, a] = lamp(i); posts.push([x, 1.6, z, a]); heads.push([x, 3.35, z, a]); }
    inst(new THREE.CylinderGeometry(0.09, 0.13, 3.2, 6), std(0x3a4560), posts);
    inst(new THREE.SphereGeometry(0.28, 10, 8), glow(0xffd98a, 1.6), heads);
    const cols = [0xff6a8a, 0xffd23a, 0x38d8ff, 0x7dff9a, 0xb48cff], flagGeo = new THREE.ConeGeometry(0.18, 0.4, 3); flagGeo.rotateX(Math.PI);
    const flagMats = cols.map((c) => std(c, { flatShading: true })), byCol = cols.map(() => []);
    for (let i = 0; i < N; i++) { const [x0, z0] = lamp(i), [x1, z1] = lamp((i + 1) % N); for (let k = 1; k < 6; k++) { const t = k / 6, sag = Math.sin(t * Math.PI) * 0.45; byCol[(i * 5 + k) % cols.length].push([x0 + (x1 - x0) * t, 3.05 - sag, z0 + (z1 - z0) * t, Math.atan2(x1 - x0, z1 - z0)]); } }
    byCol.forEach((l, i) => inst(flagGeo, flagMats[i], l));
    // benches between the plots, facing the square
    const benches = [];
    for (let i = 0; i < GAMES.length - 1; i++) { const p0 = plotAt(i), p1 = plotAt(i + 1), a = (p0.a + p1.a) / 2, r = V.plotR - 0.5; benches.push([Math.sin(a) * r, 0.35, Math.cos(a) * r, a]); }
    inst(new THREE.BoxGeometry(1.6, 0.14, 0.5), std(0x9a6b42), benches);
    inst(new THREE.BoxGeometry(1.6, 0.5, 0.1), std(0x9a6b42), benches.map(([x, , z, a]) => [x + Math.sin(a) * 0.22, 0.6, z + Math.cos(a) * 0.22, a]));
    // work fences on the empty plots: two striped rails in front of each pad
    const rails = [];
    GAMES.forEach((gm, i) => { if (gm.ready) return; const p = plotAt(i), fx = p.x - Math.sin(p.a) * 3.4, fz = p.z - Math.cos(p.a) * 3.4, ra = p.a + Math.PI / 2; rails.push([fx, 0.55, fz, ra], [fx, 0.95, fz, ra]); });
    const stripe = (() => { if (typeof document === "undefined") return null; const c = document.createElement("canvas"); c.width = 64; c.height = 8; const g = c.getContext("2d"); for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? "#1d2333" : "#ffc861"; g.fillRect(k * 8, 0, 8, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    inst(new THREE.BoxGeometry(2.4, 0.16, 0.08), new THREE.MeshStandardMaterial({ map: stripe, color: stripe ? 0xffffff : 0xffc861, roughness: 0.7 }), rails);
  }
  return {
    root, doors, solids, center: { x: V.x, z: V.z }, arenaR: V.arenaR,
    /// keep the clearing clear: hide the scattered trees, crystals and hills (instanced) that fall inside it
    clear(group) {
      const m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0); planet.updateMatrixWorld(true);
      group.traverse((o) => { if (!o.isInstancedMesh) return; let n = 0;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).sub(planet.position); if (Math.hypot(v.x - V.x, v.z - V.z) < V.r + 2) { o.setMatrixAt(i, zero); n++; } }
        if (n) { o.instanceMatrix.needsUpdate = true; if (o.computeBoundingSphere) o.computeBoundingSphere(); } });
    },
    /// where to stand when you come out of a game: in front of its door, facing the square
    exitOf(id) { const i = GAMES.findIndex((g) => g.id === id), p = plotAt(Math.max(0, i)); return { x: V.x + p.x - Math.sin(p.a) * 6.5, z: V.z + p.z - Math.cos(p.a) * 6.5 }; },
    /// the player's planet position: build the buildings when near, hide them when far
    tick(dt, t, px, pz) {
      const d = Math.hypot(px - V.x, pz - V.z);
      if (!built && d < BUILD_AT) build();
      if (built) built.visible = d < HIDE_AT;
      if (built && built.visible) for (const f of spins) f(dt, t);
    },
  };
}
