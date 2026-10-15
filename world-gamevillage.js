// world-gamevillage.js — the Game Village: a wide clearing west of the plaza where the mini-games live, one building
// each, around an open square (the square is the arena games like AC Defense play in). GAMES is the list: a new game
// is one more entry (ready: true gives it a door you can walk up to; the rest stand as "Coming soon" plots).
// Cheap until you come near: the ground, the gate and the sign load with the town; the buildings are made the first
// time you're within BUILD_AT and hidden again past HIDE_AT.
export const VILLAGE = { x: -90, z: -15, r: 32, plotR: 21, arenaR: 10.5 };
export const GAMES = [
  { id: "defense", name: "AC DEFENSE", color: 0xff6a4d, ready: true },
  { id: "soon1" }, { id: "soon2" }, { id: "soon3" }, { id: "soon4" }, { id: "soon5" },
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
  const doors = [], spins = [];
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
      built.add(g);
      if (gm.ready) { const d = new THREE.Group(); d.position.set(p.x - Math.sin(p.a) * 4.6, 0, p.z - Math.cos(p.a) * 4.6); d.userData = { radius: 1.2, game: gm.id }; built.add(d); doors.push(d); }
      else { // one "Coming soon" sign texture, shared by every empty plot
        soonTag = soonTag || K.label(T("Coming soon"), { accent: "#ffc861", size: 0.6 });
        const s = soonTag.clone(); s.position.set(p.x, 3.4, p.z); built.add(s);
      }
    });
  }
  return {
    root, doors, center: { x: V.x, z: V.z }, arenaR: V.arenaR,
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
