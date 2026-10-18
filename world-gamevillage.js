// world-gamevillage.js — the Game Village: a wide clearing west of the plaza where the mini-games live, one building
// each, around an open square (the square is the arena games like AC Defense play in). GAMES is the list: a new game
// is one more entry (ready: true gives it a door you can walk up to; the rest stand as "Coming soon" plots).
// Cheap until you come near: the ground, the gate and the sign load with the town; the buildings are made the first
// time you're within BUILD_AT and hidden again past HIDE_AT.
export const VILLAGE = { x: -105, z: -5, r: 32, plotR: 21, arenaR: 10.5 };
export const GAMES = [
  { id: "soon1", garden: true }, { id: "soon2", garden: true, pond: true /* b447: a pond garden */ }, { id: "beat", name: "BEAT STOMP", color: 0xff5ad8, roof: 0x7a3cff, sub: "Rhythm game · walk in to play", ready: true } /* b446 */, { id: "jump", name: "COIN JUMP", color: 0xffc861, roof: 0x2f86ff, sub: "Jump to the crown · walk in to play", ready: true }, { id: "rings", name: "INFINITY RINGS", color: 0x2ee0b0, sub: "Ring puzzle · walk in to play", ready: true } /* the INFINITY PUZZLE HALL (models/world/rings/palace.glb, Meshy) */,
  { id: "defense", name: "AC DEFENSE", color: 0xff6a4d, sub: "Tower defence · walk in to play", ready: true }, // the middle plot: straight ahead as you come through the gate
  { id: "surv", name: "SURVIVORS ARENA", color: 0x39ff88, sub: "Survive 12 minutes · walk in to play", ready: true }, // the arena building (models/world/survivors/arena.glb, Meshy)
  { id: "poker", name: "ARCIA POKER LOUNGE", color: 0xb48cff, sub: "Texas Hold'em · walk in to play", ready: true }, // the lounge (models/world/poker/lounge.glb, Meshy)
  { id: "soon8", garden: true }, { id: "soon9", garden: true }, { id: "soon10", garden: true }, // b446: five plots are small gardens, not building sites
];
const BUILD_AT = 75, HIDE_AT = 95;

export function makeGameVillage({ THREE, K, planet, T, low = false, look = null, compile = null }) {
  // look (b447, world-look.js via world-play.js): contact shade on what stands on the ground, the shader stone floor, the pond
  const cs = (m) => (look && look.contact ? look.contact(m) : m);
  const V = VILLAGE, root = new THREE.Group(); root.name = "gamevillage"; root.position.set(V.x, 0, V.z); planet.add(root);
  const std = (c, o = {}) => cs(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true, ...o }));
  const glow = (c, k = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const hex = (c) => "#" + new THREE.Color(c).getHexString();
  // the clearing, its glowing edge and the square in the middle
  const ground = new THREE.Mesh(new THREE.CircleGeometry(V.r, 64), new THREE.MeshStandardMaterial({ color: 0x86cc79, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; ground.name = "gv-ground"; root.add(ground); // world-play.js gives it the town ground's look (b447)
  // the square: pale stone in hexagons with a soft blue-glass seam (one canvas texture, repeated; the AC Defense floor's look)
  const hexTex = () => { if (typeof document === "undefined") return null; const w = 128, h = Math.round(w * Math.sqrt(3)), c = document.createElement("canvas"); c.width = w * 3; c.height = h; const g = c.getContext("2d");
    g.fillStyle = "#cfd6df"; g.fillRect(0, 0, c.width, c.height);
    const hex = (cx, cy, r) => { g.beginPath(); for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); };
    for (let col = -1; col <= 4; col++) for (let row = -1; row <= 2; row++) { const x = col * (w * 0.75), y = row * h + (col % 2 ? h / 2 : 0);
      hex(x, y, w / 2 - 3); g.fillStyle = (col + row) % 3 ? "#d9dee6" : "#c8d2de"; g.fill(); g.lineWidth = 5; g.strokeStyle = "rgba(90,190,255,0.55)"; g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3 * (c.width / c.height)) /* square tiles: the canvas is wider than tall */; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }; // only without the shader floor
  const sqMat = look && look.hexFloor ? look.hexFloor(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), V.arenaR + 1.5) // b447: drawn in the shader
    : new THREE.MeshStandardMaterial({ color: 0xffffff, map: hexTex(), roughness: 0.7, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const square = new THREE.Mesh(new THREE.CircleGeometry(V.arenaR + 1.5, 64), sqMat);
  square.rotation.x = -Math.PI / 2; square.position.y = 0.04; square.receiveShadow = true; root.add(square);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(V.r, 0.12, 6, 128), glow(0xb48cff, 0.9)); // b447: softer (less bloom) edge.rotation.x = Math.PI / 2; edge.position.y = 0.08; root.add(edge);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(V.arenaR + 1.5, 0.08, 6, 96), glow(0x38d8ff, 0.8)); inner.rotation.x = Math.PI / 2; inner.position.y = 0.07; root.add(inner);
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
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 12), std(gm.roof || 0xc0392b)); roof.position.y = 11.4; g.add(roof);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), neon); flag.position.set(0.6, 13.5, 0); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), dark); pole.position.y = 13.3; g.add(flag, pole);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 0.3), std(0x2a1d14)); door.position.set(0, 1.4, 3.25); g.add(door);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 24, Math.PI), neon); arch.position.set(0, 2.8, 3.3); g.add(arch);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), new THREE.MeshBasicMaterial({ color: gm.color, transparent: true, opacity: 0.25, depthWrite: false })); mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.06, 4.6); g.add(mat);
    if (!low) spins.push((dt, t) => { ring.rotation.z = t * 0.6; flag.rotation.y = Math.sin(t * 2) * 0.3; mat.material.opacity = 0.2 + Math.sin(t * 3) * 0.08; });
    const tag = K.label(gm.name, { accent: hex(gm.color), size: 0.9, sub: T(gm.sub || "Walk in to play") }); tag.position.y = 15.6; g.add(tag);
    return g;
  }
  // b448: each game its own building, so they read from across the square; the door, its arch and the mat are the same
  function doorOf(g, gm, neon, z = 3.25) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 0.3), std(0x1d1630)); door.position.set(0, 1.4, z); g.add(door);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 24, Math.PI), neon); arch.position.set(0, 2.8, z + 0.05); g.add(arch);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), new THREE.MeshBasicMaterial({ color: gm.color, transparent: true, opacity: 0.25, depthWrite: false })); mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.06, z + 1.35); g.add(mat);
    return mat;
  }
  function hallOf(gm) { // Beat Stomp: a round hall under a glowing dome, a speaker each side that thumps on the beat
    const g = new THREE.Group(), wall = std(0x3a2a66), trim = std(0x1d1630), neon = glow(gm.color, 2.2), neon2 = glow(0x38d8ff, 1.8);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 3.6, 16), wall); base.position.y = 1.8; g.add(base);
    const band = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.1, 6, 48), neon); band.rotation.x = Math.PI / 2; band.position.y = 3.5; g.add(band);
    const band2 = new THREE.Mesh(new THREE.TorusGeometry(3.38, 0.08, 6, 48), neon2); band2.rotation.x = Math.PI / 2; band2.position.y = 0.5; g.add(band2);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc89bff, emissive: 0x7a3cff, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 })); dome.position.y = 3.6; g.add(dome);
    const ribs = []; for (let k = 0; k < 8; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(3.16, 0.05, 4, 24, Math.PI / 2), neon); r.position.y = 3.6; r.rotation.set(0, (k / 8) * Math.PI * 2, Math.PI / 2); r.rotateY(Math.PI / 2); g.add(r); ribs.push(r); }
    const note = new THREE.Group(); { const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), neon); head.scale.set(1.25, 0.9, 0.6); const stem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), neon); stem.position.set(0.42, 0.75, 0); const flagN = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.12), neon); flagN.position.set(0.66, 1.42, 0); flagN.rotation.z = -0.5; note.add(head, stem, flagN); }
    note.position.y = 7.6; g.add(note);
    const cones = [];
    for (const sx of [-1, 1]) { const sp = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 1.1), trim); box.position.y = 1.2; sp.add(box);
      for (const y of [0.75, 1.75]) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 20), neon2); c.position.set(0, y, 0.57); sp.add(c); cones.push(c); }
      sp.position.set(sx * 3.9, 0, 1.6); sp.rotation.y = -sx * 0.35; g.add(sp); }
    const mat = doorOf(g, gm, neon, 3.25);
    if (!low) spins.push((dt, t) => { const ph = (t * 2) % 1, k = Math.max(0, 1 - ph * 3); for (const c of cones) c.scale.setScalar(1 + k * 0.18); note.rotation.y = t * 0.8; note.position.y = 7.6 + Math.sin(t * 2) * 0.15; band.material.emissiveIntensity = 1.6 + k * 1.2; mat.material.opacity = 0.2 + k * 0.15; });
    const tag = K.label(gm.name, { accent: hex(gm.color), size: 0.9, sub: T(gm.sub || "Walk in to play") }); tag.position.y = 10.4; g.add(tag);
    return g;
  }
  function coinTowerOf(gm) { // Coin Jump: four giant coins stacked in a spiral, the crown on top
    const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xb07a10, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.7 }), rimM = glow(0xffe27a, 1.6), neon = glow(gm.color, 2.0);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 1, 8), std(0x2a3a66)); plinth.position.y = 0.5; g.add(plinth);
    const coinG = new THREE.CylinderGeometry(2.3, 2.3, 0.55, 28), edgeG = new THREE.TorusGeometry(2.3, 0.09, 6, 40), coins = [];
    for (let k = 0; k < 4; k++) { const c = new THREE.Group(); const body = new THREE.Mesh(coinG, gold), rim = new THREE.Mesh(edgeG, rimM); rim.rotation.x = Math.PI / 2; c.add(body, rim);
      c.position.set(Math.sin(k * 1.9) * 0.5, 1.4 + k * 1.75, Math.cos(k * 1.9) * 0.5 - 0.3); c.rotation.set(0.12 * (k % 2 ? 1 : -1), 0, 0.08 * (k - 1.5)); g.add(c); coins.push(c); }
    const crown = new THREE.Group(); crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 12, 1, true), gold));
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 5), gold); sp.position.set(Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8); crown.add(sp); }
    crown.position.y = 8.6; g.add(crown);
    const mat = doorOf(g, gm, neon, 3.4);
    if (!low) spins.push((dt, t) => { crown.rotation.y = t * 0.9; coins.forEach((c, i) => { c.position.y = 1.4 + i * 1.75 + Math.sin(t * 1.6 + i) * 0.06; }); mat.material.opacity = 0.2 + Math.sin(t * 3) * 0.08; });
    const tag = K.label(gm.name, { accent: hex(gm.color), size: 0.9, sub: T(gm.sub || "Walk in to play") }); tag.position.y = 11.2; g.add(tag);
    return g;
  }
  // SURVIVORS ARENA: the Meshy coliseum (models/world/survivors/arena.glb, loaded when the village is built), stood on a
  // round plinth with a glowing ring; until it arrives (or if it can't), a stone keep in its place
  function arenaOf(gm) {
    const g = new THREE.Group(), neon = glow(gm.color, 2.0);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.7, 0.5, 28), std(0x5a5468)); plinth.position.y = 0.25; g.add(plinth);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.55, 0.1, 6, 72), neon); ring.rotation.x = Math.PI / 2; ring.position.y = 0.52; g.add(ring);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 4.5, 20, 1, true), std(0x9a8a78, { side: THREE.DoubleSide })); stand.position.y = 2.75; g.add(stand); // (a round wall until the model is in)
    const mat = doorOf(g, gm, neon, 5.5);
    const loader = K.gltfLoader ? K.gltfLoader() : null;
    if (loader) loader.loadAsync("models/world/survivors/arena.glb?v=1").then((gl) => {
      const m = gl.scene, box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), k = 10.6 / Math.max(size.x, size.z, 0.01);
      m.scale.setScalar(k); m.position.set(-(box.min.x + size.x / 2) * k, -box.min.y * k + 0.5, -(box.min.z + size.z / 2) * k);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = true; if (o.material) cs(o.material); } });
      g.remove(stand); g.add(m); if (compile) Promise.resolve().then(() => compile(m)).catch(() => {});
    }).catch((e) => console.warn("arena model:", e));
    if (!low) spins.push((dt, t) => { mat.material.opacity = 0.2 + Math.sin(t * 3) * 0.08; ring.material.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.4; });
    const tag = K.label(gm.name, { accent: hex(gm.color), size: 0.9, sub: T(gm.sub || "Walk in to play") }); tag.position.y = 11; g.add(tag);
    return g;
  }
  // INFINITY RINGS: the Meshy palace (models/world/rings/palace.glb, loaded when the village is built) on a round
  // plinth, a big ∞ turning over its roof; until it arrives (or if it can't), a pale hall in its place
  function palaceOf(gm) {
    const g = new THREE.Group(), neon = glow(gm.color, 2.0);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.4, 0.45, 28), std(0xe6eef8)); plinth.position.y = 0.22; g.add(plinth);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.25, 0.1, 6, 72), neon); ring.rotation.x = Math.PI / 2; ring.position.y = 0.47; g.add(ring);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4.4, 5.5), std(0xdfe8f6)); hall.position.y = 2.65; g.add(hall);
    const n0 = g.children.length, mat = doorOf(g, gm, neon, 5.1), slab = g.children[n0];
    // the ∞: two glowing rings side by side, turning slowly (until the palace arrives: it wears its own ∞ on the roof)
    const inf = new THREE.Group(), im = glow(0x5aa8ff, 1.8), im2 = glow(0x2ee0b0, 1.8);
    [[-0.78, im], [0.78, im2]].forEach(([x, m]) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.17, 10, 40), m); t.position.x = x; inf.add(t); });
    inf.position.y = 8.4; g.add(inf);
    const loader = K.gltfLoader ? K.gltfLoader() : null;
    if (loader) loader.loadAsync("models/world/rings/palace.glb?v=1").then((gl) => {
      const m = gl.scene, box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), k = 9.6 / Math.max(size.x, size.z, 0.01);
      m.scale.setScalar(k); m.position.set(-(box.min.x + size.x / 2) * k, -box.min.y * k + 0.45, -(box.min.z + size.z / 2) * k);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = true; if (o.material) cs(o.material); } });
      g.remove(hall); g.add(m); inf.visible = false; if (slab) slab.visible = false; tag.position.y = size.y * k + 1.6; if (compile) Promise.resolve().then(() => compile(m)).catch(() => {});
    }).catch((e) => console.warn("palace model:", e));
    if (!low) spins.push((dt, t) => { inf.rotation.y = t * 0.6; mat.material.opacity = 0.2 + Math.sin(t * 3) * 0.08; ring.material.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.4; });
    const tag = K.label(gm.name, { accent: hex(gm.color), size: 0.9, sub: T(gm.sub || "Walk in to play") }); tag.position.y = 10.2; g.add(tag);
    return g;
  }
  // ARCIA POKER LOUNGE: the Meshy lounge (models/world/poker/lounge.glb) on a dark round plinth with a violet neon
  // ring; a plain hall with a big ♠ stands in until it arrives (or if it can't)
  function loungeOf(gm) {
    const g = new THREE.Group(), neon = glow(gm.color, 2.0);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.3, 0.45, 28), std(0x2a1d48)); plinth.position.y = 0.22; g.add(plinth);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.15, 0.1, 6, 72), neon); ring.rotation.x = Math.PI / 2; ring.position.y = 0.47; g.add(ring);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(6.2, 4.2, 5.4), std(0x3a2a66)); hall.position.y = 2.55; g.add(hall);
    const n0 = g.children.length, mat = doorOf(g, gm, neon, 5.0), slab = g.children[n0];
    const spade = new THREE.Group(), sm = glow(0xffc861, 1.6); // ♠ in two spheres and a cone, until the lounge arrives
    [[-0.42, 0], [0.42, 0]].forEach(([x]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), sm); b.position.set(x, 0, 0); spade.add(b); });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.1, 18), sm); tip.position.y = 0.55; spade.add(tip); spade.position.y = 6.2; g.add(spade);
    const loader = K.gltfLoader ? K.gltfLoader() : null;
    if (loader) loader.loadAsync("models/world/poker/lounge.glb?v=1").then((gl) => {
      const m = gl.scene, box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), k = 9.4 / Math.max(size.x, size.z, 0.01);
      m.scale.setScalar(k); m.position.set(-(box.min.x + size.x / 2) * k, -box.min.y * k + 0.45, -(box.min.z + size.z / 2) * k);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = true; if (o.material) cs(o.material); } });
      g.remove(hall); g.add(m); spade.visible = false; if (slab) slab.visible = false; tag.position.y = size.y * k + 1.6; if (compile) Promise.resolve().then(() => compile(m)).catch(() => {});
    }).catch((e) => console.warn("lounge model:", e));
    if (!low) spins.push((dt, t) => { spade.rotation.y = t * 0.8; mat.material.opacity = 0.2 + Math.sin(t * 3) * 0.08; ring.material.emissiveIntensity = 1.6 + Math.sin(t * 2.2) * 0.4; });
    const tag = K.label(gm.name, { accent: hex(gm.color), size: 0.85, sub: T(gm.sub || "Walk in to play") }); tag.position.y = 9.6; g.add(tag);
    return g;
  }
  // b446: a small garden on a plot no game is coming to soon: grass, a low hedge, a tree and flowers (shared parts)
  let GP = null, gardenN = 0;
  function gardenOf(gm = {}) {
    if (!GP) GP = { disc: new THREE.CircleGeometry(3, 24), grass: std(0x7fcf6a, { flatShading: false }), hedge: new THREE.TorusGeometry(2.8, 0.32, 6, 20), hedgeM: std(0x3f9a4e), trunk: new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), trunkM: std(0x7a5236), crown: new THREE.IcosahedronGeometry(1.1, 0), crownM: std(0x4fbf63), flower: new THREE.IcosahedronGeometry(0.2, 0), fl: [0xff7ab8, 0xffd23a, 0xffffff, 0x8fb8ff].map((c) => std(c)) };
    const g = new THREE.Group(), d = new THREE.Mesh(GP.disc, GP.grass); d.rotation.x = -Math.PI / 2; d.position.y = 0.07; g.add(d);
    if (gm.pond) { // b447: a little pond in the hedge ring: deep teal in the middle, foam at the edge, lily pads and stones
      const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.94, depthWrite: false });
      const w = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40), look && look.pond ? look.pond(wm) : wm); w.rotation.x = -Math.PI / 2; w.position.y = 0.1; w.renderOrder = 2; g.add(w);
      const padG = new THREE.CircleGeometry(0.26, 10, 0.4, Math.PI * 2 - 0.4); padG.rotateX(-Math.PI / 2); const padM = std(0x4fbf63, { flatShading: false });
      [[0.9, 0.5, 0], [-0.7, 0.9, 1.4], [0.3, -1.1, 2.7], [-1.2, -0.4, 4]].forEach(([x, z, r]) => { const pd = new THREE.Mesh(padG, padM); pd.position.set(x, 0.12, z); pd.rotation.y = r; g.add(pd); });
      const stG = new THREE.DodecahedronGeometry(0.28, 0), stM = std(0xc9ccd4);
      for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + 0.2, st = new THREE.Mesh(stG, stM); st.position.set(Math.sin(a) * 2.35, 0.08, Math.cos(a) * 2.35); st.scale.set(1, 0.45, 0.8 + (k % 3) * 0.2); st.rotation.y = a; g.add(st); }
    }
    const h = new THREE.Mesh(GP.hedge, GP.hedgeM); h.rotation.x = Math.PI / 2; h.position.y = 0.25; h.scale.z = 1.6; g.add(h);
    // b447: the town's own round tree (a soft cloud of leaves that sways), not one faceted ball; a blossom or a maple now and then
    gardenN++; const tr = gm.pond ? null : K.makeTrees ? K.makeTrees([new THREE.Matrix4().makeScale(1.15, 1.15, 1.15)], { pine: 0, blossom: gardenN % 3 === 1 ? 1 : 0, maple: gardenN % 3 === 2 ? 1 : 0, seed: gardenN }) : null;
    if (tr) g.add(tr); else if (!gm.pond) { const t = new THREE.Mesh(GP.trunk, GP.trunkM); t.position.y = 0.6; const c = new THREE.Mesh(GP.crown, GP.crownM); c.position.y = 1.8; g.add(t, c); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.3, f = new THREE.Mesh(GP.flower, GP.fl[k % 4]); f.position.set(Math.sin(a) * 1.9, 0.22, Math.cos(a) * 1.9); g.add(f); }
    return g;
  }
  function soonOf() { // an empty plot: a fenced pad and a sign
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.25, 8), std(0xb9b0a0)); pad.position.y = 0.12; g.add(pad);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), std(0x6b4a2e)); post.position.set(0, 0.8, 2.4); const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.12), std(0xe8c98a)); board.position.set(0, 1.6, 2.4); g.add(post, board);
    return g;
  }
  // b444: the leaderboard by the gate: AC Defense's best waves this week (the server's list) and your Coin Jump best
  // (kept on this device: a jump score can't be checked, so it isn't ranked against others). Drawn when you come near,
  // refreshed every 2 minutes while you're here.
  let board = null, boardAt = -1e9;
  function makeBoard() {
    if (typeof document === "undefined") return;
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 360; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const g = new THREE.Group(), a = toPlaza + 0.32, r = V.r - 5; g.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); g.rotation.y = a;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); face.position.y = 3.4; g.add(face);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.7, 4.1, 0.18), std(0x1b2440)); back.position.set(0, 3.4, -0.11); g.add(back);
    const rimM = glow(0xb48cff, 1.6); for (const y of [1.35, 5.45]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(5.75, 0.08, 0.22), rimM); bar.position.set(0, y, -0.05); g.add(bar); }
    for (const x of [-2.5, 2.5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 8), std(0x4a5366)); post.position.set(x, 0.75, -0.11); g.add(post); }
    built.add(g); board = { cv, tex, top: null };
    paintBoard();
  }
  function paintBoard() { // b448: bigger type (phones), the top three, the prizes, your Coin Jump and Beat Stomp bests
    if (!board) return; const g = board.cv.getContext("2d"), W = 512, H = 360;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0f1d44"); bg.addColorStop(1, "#08112a"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = "#ff8a6a"; g.font = "800 26px Sora, system-ui, sans-serif"; g.fillText(T("AC Defense · this week"), 22, 38);
    const top = board.top || []; g.font = "700 26px Sora, system-ui, sans-serif";
    if (!top.length) { g.fillStyle = "#8fa6cc"; g.font = "600 22px Sora, system-ui, sans-serif"; g.fillText(board.top ? T("No runs yet — be the first!") : T("Loading…"), 22, 84); }
    top.slice(0, 3).forEach((x, i) => { const y = 80 + i * 38; g.fillStyle = ["#ffd23a", "#dfe8f4", "#e8a06a"][i]; g.fillText(`${i + 1}`, 24, y);
      g.fillStyle = "#e8f0ff"; g.fillText(String(x.name || x.w || "?").slice(0, 14), 58, y);
      g.fillStyle = "#38d8ff"; g.textAlign = "right"; g.fillText(T("Wave {n}").replace("{n}", x.n), W - 22, y); g.textAlign = "left"; });
    g.fillStyle = "#ffd23a"; g.font = "700 18px Sora, system-ui, sans-serif"; g.fillText(T("Weekly prizes: 10,000 · 5,000 · 2,500 ARCL"), 22, 208);
    g.fillStyle = "rgba(180,140,255,.35)"; g.fillRect(22, 224, W - 44, 2);
    const best = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
    [["arc.world.jumpBest", T("Coin Jump · your best"), "#ffc861"], ["arc.world.beatBest", T("Beat Stomp · your best"), "#ff8ae4"]].forEach(([k, label, c], i) => {
      const y = 268 + i * 52; g.fillStyle = c; g.font = "800 22px Sora, system-ui, sans-serif"; g.fillText(label, 22, y);
      const v = best(k); g.fillStyle = "#ffffff"; g.font = "900 30px Sora, system-ui, sans-serif"; g.textAlign = "right"; g.fillText(v ? v.toLocaleString() : "—", W - 22, y + 4); g.textAlign = "left"; });
    board.tex.needsUpdate = true;
  }
  function refreshBoard(t) {
    if (!board || t - boardAt < 120 || typeof fetch === "undefined") return; boardAt = t;
    fetch("/api/social?world=defense-top").then((r) => (r.ok ? r.json() : null)).then((j) => { if (!board) return; board.top = (j && j.top) || []; paintBoard(); }).catch(() => { if (board) { board.top = board.top || []; paintBoard(); } });
  }
  function build() {
    built = new THREE.Group(); root.add(built);
    makeBoard();
    let soonTag = null;
    GAMES.forEach((gm, i) => {
      const p = plotAt(i), g = gm.ready ? (gm.id === "beat" ? hallOf(gm) : gm.id === "jump" ? coinTowerOf(gm) : gm.id === "surv" ? arenaOf(gm) : gm.id === "rings" ? palaceOf(gm) : gm.id === "poker" ? loungeOf(gm) : towerOf(gm)) : gm.garden ? gardenOf(gm) : soonOf();
      g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(-p.x, -p.z); // the front faces the square
      g.traverse((o) => { if (o.isMesh) o.castShadow = !low; });
      built.add(g); if (gm.ready) { g.userData.radius = gm.id === "surv" ? 5.3 : gm.id === "rings" || gm.id === "poker" ? 5.0 : 3.6; solids.push(g); }
      if (gm.ready) { const dd = gm.id === "surv" ? 6.9 : gm.id === "rings" || gm.id === "poker" ? 6.5 : 4.6, d = new THREE.Group(); d.position.set(p.x - Math.sin(p.a) * dd, 0, p.z - Math.cos(p.a) * dd); d.userData = { radius: 1.2, game: gm.id }; built.add(d); doors.push(d); }
      else if (!gm.garden) { // one "Coming soon" sign texture, shared by every empty plot
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
    const inst = (geo, mat, list) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([x, y, z, ry, sx = 1, sy = 1, sz = 1], i) => { e.set(0, ry, 0); q.setFromEuler(e); m.setMatrixAt(i, m4.compose(v.set(x, y, z), q, sc.set(sx, sy, sz))); }); m.castShadow = !low; m.receiveShadow = true; built.add(m); return m; };
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
    GAMES.forEach((gm, i) => { if (gm.ready || gm.garden) return; const p = plotAt(i), fx = p.x - Math.sin(p.a) * 3.4, fz = p.z - Math.cos(p.a) * 3.4, ra = p.a + Math.PI / 2; rails.push([fx, 0.55, fz, ra], [fx, 0.95, fz, ra]); });
    const stripe = (() => { if (typeof document === "undefined") return null; const c = document.createElement("canvas"); c.width = 64; c.height = 8; const g = c.getContext("2d"); for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? "#1d2333" : "#ffc861"; g.fillRect(k * 8, 0, 8, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    inst(new THREE.BoxGeometry(2.4, 0.16, 0.08), new THREE.MeshStandardMaterial({ map: stripe, color: stripe ? 0xffffff : 0xffc861, roughness: 0.7 }), rails);
    // b447: life in the clearing: grass tufts, little flower clumps and flat stones, in a ring inside the plots and a
    // ring outside them, kept off the gate's path and the walks to each door (the same every visit: a seeded scatter)
    { let sd = 447; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const plotA = GAMES.map((_, i) => plotAt(i).a), dA = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      const spot = (inner) => { for (let k = 0; k < 12; k++) { const a = rnd() * Math.PI * 2, r = inner ? 12.6 + rnd() * 2.6 : 26 + rnd() * 5; if (dA(a, toPlaza) < 0.3) continue; if (plotA.some((pa) => dA(a, pa) < (inner ? 0.14 : 0.2))) continue; return [Math.sin(a) * r, Math.cos(a) * r]; } return null; };
      const tufts = [], stones = [], fl = [[], [], [], []], flC = [0xff8ab0, 0xffe066, 0xffffff, 0xb48cff];
      for (let i = 0; i < (low ? 50 : 110); i++) { const p = spot(i % 3 === 0); if (!p) continue; const h = 0.7 + rnd() * 0.6; for (let b = 0; b < 3; b++) tufts.push([p[0] + (rnd() - 0.5) * 0.3, 0.2 * h, p[1] + (rnd() - 0.5) * 0.3, rnd() * 6.3, 1, h, 1]); }
      for (let i = 0; i < (low ? 16 : 36); i++) { const p = spot(i % 2 === 0); if (!p) continue; const c = fl[i % 4]; for (let b = 0; b < 4; b++) c.push([p[0] + (rnd() - 0.5) * 0.6, 0.22 + rnd() * 0.08, p[1] + (rnd() - 0.5) * 0.6, 0]); }
      for (let i = 0; i < (low ? 10 : 22); i++) { const p = spot(i % 2 === 1); if (!p) continue; const k = 0.6 + rnd() * 0.8; stones.push([p[0], 0.05, p[1], rnd() * 6.3, k, 0.35 * k, k * (0.7 + rnd() * 0.5)]); }
      const tg = new THREE.ConeGeometry(0.07, 0.42, 3); tg.translate(0, 0.0, 0);
      const t = inst(tg, std(0x5fb84f), tufts); if (t) t.castShadow = false;
      const fg = new THREE.IcosahedronGeometry(0.09, 0); fl.forEach((l, i) => { const m = inst(fg, std(flC[i], { emissive: flC[i], emissiveIntensity: 0.15 }), l); if (m) m.castShadow = false; });
      const sm = inst(new THREE.DodecahedronGeometry(0.32, 0), std(0xc9ccd4), stones); if (sm) sm.castShadow = false; }
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
    exitOf(id) { const i = GAMES.findIndex((g) => g.id === id), p = plotAt(Math.max(0, i)), d = id === "surv" ? 9 : id === "rings" || id === "poker" ? 8.6 : 6.5; return { x: V.x + p.x - Math.sin(p.a) * d, z: V.z + p.z - Math.cos(p.a) * d }; },
    /// the player's planet position: build the buildings when near, hide them when far
    tick(dt, t, px, pz) {
      const d = Math.hypot(px - V.x, pz - V.z);
      if (!built && d < BUILD_AT) { build(); if (compile) Promise.resolve().then(() => compile(built)).catch(() => {}); } // b5: its shaders made in the background as it appears (they were a hitch on the way in)
      if (built) built.visible = d < HIDE_AT;
      if (built && built.visible) for (const f of spins) f(dt, t);
      if (built && built.visible && d < 60) refreshBoard(t);
    },
  };
}
