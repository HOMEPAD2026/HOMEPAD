// world-raidq.js — RAID QUEENS (the owner's design, 2026-10-25): runs in a space of their own, like SURVIVORS ARENA. The
// RAID QUEENS portal on the far hunting ring (world-lands.js) opens the lobby; a run takes you into the arena (LANDS.rq, 2.4 km
// north: the town is out of sight, nobody else is drawn there) and you fight it with the town's own combat (attack,
// skills, potions, HP). Three runs a Seoul day across the queens (api/_world-raidq.mjs RQ.DAY_RUNS).
//   a queen's run     waves of Imps (KayKit moves on their UE bones: K.borrowMoves), elite Puglins from the second
//                     minute, then the queen (the owner's GLB) — her page (the owner's picture) the first time each day,
//                     phases at 60 % / 25 % (a cut-in with her line, more patterns, harder hits; Nyxara grows stronger the
//                     longer the fight). Her HP is fitted to your attack so a fight lasts about a minute and a half.
//   the SECRET        ??? on the lobby until you're in: 10,000 $ARCIRCLE a run from your wallet (free for a GM), Lv 70+,
//                     a short wave, then the three queens at once (Lv 72 / 75 / 78), about two minutes alone; a win gives
//                     Lv 120 → 140 in XP and three good pieces
//   the end           the server takes the win (its time bounded), grants the XP, makes the gear, pays the ARCL; the
//                     result card; back to town. A knock-out or leaving ends the run with nothing.
import { RQ, modeOf, phaseOf } from "./world-raidq-data.js";
import { CC } from "./world-mythic-data.js";
export { RQ };

// each queen: her file, height, colours, her clips by the file's own names (listed from the GLBs), patterns by phase, lines
export // the queens stand five times a hero's height (heroes are 2.1 m: world-kit.js makeCustom; the owner, 2026-10-25)
const QV = {
  lysitha: { name: "CELESTIAL LYSITHA", title: "The Arbiter of Stars and Divinity", glb: "queen-lysitha", h: 10.5, tint: 0x9fd4ff, css: "#9fd4ff", skin: "blue", ground: 0x8f9fb8, idle: ["Idle_02", "Long_Breathe_and_Look_Around"], walk: "Walking", run: "Running", atk: ["Attack", "Right_Hand_Sword_Slash"], die: "Dead", hit: "",
    pats: [["slam", "rain"], ["slam", "rain", "cone"], ["slam", "rain", "cone", "line"]],
    lines: ["You've come… just as I expected.", "Is it power? Freedom? Or… my attention?", "Now, the real battle begins.", "How precious… you've earned a glimpse of the stars."] },
  solvira: { name: "RADIANT SOLVIRA", title: "The Sovereign of Light and Sun", glb: "queen-solvira", h: 10.5, tint: 0xffc861, css: "#ffd36a", skin: "green", ground: 0x8a7444, idle: ["Idle_02"], walk: "Walking", run: "Running", atk: ["Attack", "Weapon_Combo_1", "Flying_Fist_Kick"], die: "Fall_Dead_from_Abdominal_Injury", hit: "Head_Hold_in_Pain",
    pats: [["slam", "line"], ["slam", "line", "cone"], ["slam", "line", "cone", "rain"]],
    lines: ["You've come this far… How adorable.", "Kneel before the sun.", "Burn in my radiance!", "The sun… sets… for now."] },
  nyxara: { name: "CRIMSON NYXARA", title: "The Queen of Blood and Destruction", glb: "queen-nyxara", h: 10.8, tint: 0xff3d5a, css: "#ff4d6d", skin: "red", ground: 0x4a1a24, idle: ["Idle_03", "Idle_02"], walk: "Walking", run: "Running", atk: ["Axe_Spin_Attack", "Double_Blade_Spin", "Jump_and_Slam_Back_Down", "Right_Hand_Sword_Slash"], die: "Fall_Dead_from_Abdominal_Injury", hit: "", arise: "Arise",
    pats: [["slam", "cone", "line"], ["slam", "cone", "line", "rain"], ["slam", "cone", "line", "rain"]], ramp: true,
    lines: ["Kneel, if you wish to survive.", "Beauty that devours. Power that rules.", "This is not the end. This is only the beginning.", "…only the beginning."] },
};
export const PROLOGUE = ["Long ago, the Eternal Crown kept the three realms in balance.", "It broke — and from its shards rose three queens.", "Win back the crown's fragments, queen by queen. Then face the Throne of Three."];
const MOB = { imp: { glb: "imp", h: 1.9, name: "Crown Imp", tex: 1 }, puglin: { glb: "puglin", h: 2.5, name: "Puglin Brute", tex: 1 },
  // SURVIVORS ARENA's crowd (models/world/survivors/monsters.glb, one root a kind, clips "<id>:move|atk|die"), a size up
  blob: { sv: 1, h: 1.35, name: "Blob" }, pink: { sv: 1, h: 1.4, name: "Pinky" }, mush: { sv: 1, h: 1.55, name: "Mushroom" }, bee: { sv: 1, h: 1.45, fly: 1, name: "Bee" },
  ninja: { sv: 1, h: 1.75, name: "Ninja" }, orc: { sv: 1, h: 2.7, name: "Orc" }, ghost: { sv: 1, h: 2.1, fly: 0.6, name: "Ghost" }, glub: { sv: 1, h: 2, fly: 0.75, name: "Glub" },
  spiky: { sv: 1, h: 2.1, name: "Spiky" }, mushx: { sv: 1, h: 2.4, name: "Big Mushroom" }, skull: { sv: 1, h: 3.2, name: "Skull" }, yeti: { sv: 1, h: 3.4, name: "Yeti" } };
// who comes when: the run's share of its waves (0 → 1) picks the pool; elites after eliteAt, a quarter of the spawns
const POOL = [[0, ["imp", "blob", "pink", "mush", "bee", "imp"]], [0.3, ["imp", "ninja", "orc", "ghost", "glub", "bee", "mush"]], [0.6, ["imp", "orc", "ghost", "glub", "ninja", "pink"]]];
const ELITES = ["puglin", "spiky", "mushx", "skull", "yeti", "puglin"];
// a run's clock: waves (alive at once grows), elites after eliteAt, the queen at waveEnd; queenSec: her fight's length
const PLAN = { normal: { waveEnd: 100, eliteAt: 45, alive: [8, 18], queenSec: 85 }, secret: { waveEnd: 20, eliteAt: 6, alive: [8, 12], queenSec: 32 } };
const ARENA_R = 30, TIME_LIMIT = 10 * 60;
const dayKey = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* this visit */ } } };
const SEEN = "arc.rq.seen", MET = "arc.rq.met", GOT = "arc.rq.got";

/// ctx: { THREE, K, planet, T, esc, toast, Snd, ver, low, reduce, coarse, land: { x, z, r }, combat(), here(v), level(), sess(), post(b),
///        addItem(it), grantXp(n), refresh(), itemName(it), parts?, shake?(n), stand(x, z, c), freeze(on), compile?(list), active(),
///        isGM(), tx(to, data), signIn(), home() — back to town, stats() — your attack and defence }
export function makeRaidQueens(ctx) {
  const { THREE, K, planet, T, esc, land } = ctx, V3 = THREE.Vector3;
  const g = new THREE.Group(); g.name = "land-rq"; g.position.set(land.x, 0, land.z); g.visible = false; planet.add(g);
  const spins = [], solids = [], me = new V3(), tmp = new V3();
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3, ...o });
  const neon = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  const flat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; g.add(m); return m; };
  const load = (u) => new Promise((res, rej) => K.gltfLoader().load(u + (ctx.ver || ""), res, undefined, rej));
  const W = (lx, lz) => new V3(land.x + lx, 0, land.z + lz);

  // ---------------- the arena: a disc of stone in the queen's colours, a glowing edge, crystals round it, her dais ----------------
  const crys = []; /* the crystals round the edge: one right in front of the camera filled the screen with light, so it steps aside (tick) */
  let marbleMap = null; // (the plaza's marble, drawn once below: the arena's floor too, tinted by the queen)
  { const side = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R, ARENA_R - 4, 7, 80, 1, true), std(0x3a2e48, { roughness: 0.8, side: THREE.DoubleSide })); side.position.y = -3.5; g.add(side); }
  const floorM = std(0x8f9fb8, { roughness: 0.5, metalness: 0.35, emissive: 0x000000, emissiveIntensity: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  flat(new THREE.CircleGeometry(ARENA_R, 80), floorM, 0.03);
  const edgeM = neon(0x9fd4ff, 0.9); flat(new THREE.RingGeometry(ARENA_R - 0.35, ARENA_R, 140), edgeM, 0.07);
  const innerM = neon(0x9fd4ff, 0.35); flat(new THREE.RingGeometry(9.6, 10, 100), innerM, 0.06);
  const crysM = std(0x9fd4ff, { emissive: 0x9fd4ff, emissiveIntensity: 1.1 });
  { const n = ctx.low ? 8 : 16; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, d = ARENA_R + 2.4 + (k % 2) * 1.8, h = 2.4 + ((k * 7) % 5) * 0.7;
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crysM); sp.scale.set(0.55, h, 0.55); sp.position.set(Math.cos(a) * d, h * 0.9, Math.sin(a) * d); sp.rotation.y = a; g.add(sp); crys.push(sp);
      if (!ctx.low && k % 4 === 0) { const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), crysM), y0 = h * 2 + 1.4; fl.position.set(sp.position.x, y0, sp.position.z); g.add(fl); spins.push((dt, t) => { fl.position.y = y0 + Math.sin(t * 1.2 + k) * 0.5; fl.rotation.y = t + k; }); } } }
  const dais = new THREE.Group(); dais.position.set(0, 0, -ARENA_R + 7); g.add(dais);
  const daisTop = std(0x9fd4ff, { metalness: 0.6, roughness: 0.3, emissive: 0x9fd4ff, emissiveIntensity: 0.4 });
  for (let k = 0; k < 3; k++) { const st0 = new THREE.Mesh(new THREE.CylinderGeometry(4.6 - k * 1.1, 4.9 - k * 1.1, 0.35, 40), k === 2 ? daisTop : std(0x2a2433, { metalness: 0.6, roughness: 0.3 })); st0.position.y = 0.17 + k * 0.35; dais.add(st0); }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 64), edgeM); halo.position.y = 6.5; dais.add(halo);
  spins.push((dt, t) => { halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.25; halo.rotation.z = t * 0.6; halo.position.y = 6.5 + Math.sin(t * 1.3) * 0.25; edgeM.opacity = 0.75 + Math.sin(t * 2) * 0.15; });
  // the queen's realm round the arena (the owner's pictures: silver, golden, crimson), four mirrored times round
  const bgTx = {}, bgM = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false });
  { const R = 95, H = ((Math.PI * 2 * R) / 4) * (941 / 1672), cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), bgM);
    cyl.position.y = H / 2 - 6; cyl.renderOrder = -5; cyl.name = "rq-sky"; cyl.frustumCulled = false; cyl.visible = false; g.add(cyl); bgM.userData.cyl = cyl; }
  function backdrop(id) {
    const cyl = bgM.userData.cyl; if (!id) { cyl.visible = false; return; }
    if (!bgTx[id]) { const t = new THREE.TextureLoader().load(`/images/raid/bg-${id}.webp${ctx.ver || ""}`, () => { cyl.visible = bgM.map === t; }); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.MirroredRepeatWrapping; t.repeat.set(4, 1); bgTx[id] = t; }
    bgM.map = bgTx[id]; bgM.needsUpdate = true; cyl.visible = !!(bgTx[id].image && bgTx[id].image.width);
  }
  // the arena's floor: the sky realm's black marble with its gold rings (the owner's mock-up: a dark glossy floor that
  // takes the queen's light), loaded once; the old pale marble until it's in
  let darkMap = null, darkE = null, floorBase = 0.06;
  { const tl = new THREE.TextureLoader(); tl.load(`/images/raid/plaza-floor.webp${ctx.ver || ""}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; darkMap = t; if (g.visible) { floorM.map = t; floorM.needsUpdate = true; } });
    tl.load(`/images/raid/plaza-floor-e.webp${ctx.ver || ""}`, (t) => { t.anisotropy = 8; darkE = t; }); }
  function theme(css, ground, tint) { const c = new THREE.Color(css); const fm = darkMap || marbleMap; if (fm && floorM.map !== fm) { floorM.map = fm; floorM.needsUpdate = true; }
    if (darkMap) { floorM.roughness = 0.22; floorM.metalness = 0.35; if (darkE && floorM.emissiveMap !== darkE) { floorM.emissiveMap = darkE; floorM.needsUpdate = true; } } floorM.emissiveIntensity = floorBase = darkE ? 0.55 : 0.06; if (tint != null) { floorM.color.setHex(tint); floorM.emissive.copy(c); edgeM.color.copy(c); innerM.color.copy(c); crysM.color.copy(c); crysM.emissive.copy(c); daisTop.color.copy(c); daisTop.emissive.copy(c); return; } edgeM.color.copy(c); innerM.color.copy(c); crysM.color.copy(c); crysM.emissive.copy(c); daisTop.color.copy(c); daisTop.emissive.copy(c); floorM.color.setHex(ground); floorM.emissive.copy(c); }

  // ---------------- the hall: the sky realm you walk into (the owner's concept art, 2026-10-25) ----------------
  // the sky all round (images/raid/sky.webp), a sea of cloud underfoot, the Crimson Spireway (the owner's GLB) up to the
  // Crimson Citadel (gate.glb) — the one building for every run (100 / 200 / 300 / 400 / SECRET) — and the Crimson
  // Singularity spires (spire-isle.glb) floating round it at several sizes, slowly bobbing; red beams falling from some.
  // Shown while you're in the land and not in a run (a run shows the arena instead: vis()).
  const H = new THREE.Group(); H.name = "rq-hall"; H.position.set(land.x, 0, land.z); H.visible = false; planet.add(H);
  const SKY = new THREE.Group(); SKY.name = "rq-sky-realm"; SKY.position.set(land.x, 0, land.z); SKY.visible = false; planet.add(SKY); // (the sky, the sea of cloud, the floating spires: around the hall and the arena alike)
  const HALL = { door: -36, start: 48, road: [-24, 44], back: 56 }; // local z: the Citadel, where you arrive, the road's two ends, the way home
  { const R = 260, tx = new THREE.TextureLoader().load(`/images/raid/sky.webp${ctx.ver || ""}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; }); tx.wrapS = THREE.MirroredRepeatWrapping; tx.repeat.set(3, 1);
    const Hh = ((Math.PI * 2 * R) / 3) * (941 / 1672), cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Hh, 64, 1, true), new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    cyl.position.y = Hh / 2 - 70; cyl.renderOrder = -6; cyl.frustumCulled = false; SKY.add(cyl);
    const top = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ color: 0x3a5fe0, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })); top.rotation.x = -Math.PI / 2; top.position.y = Hh - 70; SKY.add(top); }
  { // the clouds underfoot: soft pink-white blobs on lavender, drawn once
    const cv = typeof document !== "undefined" ? document.createElement("canvas") : null;
    let map = null; if (cv) { cv.width = cv.height = 512; const c = cv.getContext("2d"); c.fillStyle = "#9fb4f4"; c.fillRect(0, 0, 512, 512); /* sky blue showing between the clouds */ let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 230; i++) { const x = rnd() * 512, y = rnd() * 512, r = 14 + rnd() * 52, gr = c.createRadialGradient(x, y, 0, x, y, r); const col = rnd() < 0.3 ? "255,214,236" : "255,250,255"; gr.addColorStop(0, `rgba(${col},.85)`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
      map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(9, 9); }
    const sea = new THREE.Mesh(new THREE.CircleGeometry(270, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, map, fog: false, toneMapped: false })); sea.rotation.x = -Math.PI / 2; sea.position.y = -26; SKY.add(sea); // (far below: the plaza floats over it)
    if (map) map.repeat.set(14, 14); spins.push((dt) => { if (SKY.visible && map) { map.offset.x += dt * 0.004; map.offset.y += dt * 0.002; } }); }
  // the plaza you walk on: pale marble tiles with gold rings, its edge a pink glow and a drop of stone below (the concept art's floor)
  const PLAZA_R = 64;
  { const cv = typeof document !== "undefined" ? document.createElement("canvas") : null; let map = null;
    if (cv) { cv.width = cv.height = 1024; const c = cv.getContext("2d"), m = 512; c.fillStyle = "#e9e6f2"; c.fillRect(0, 0, 1024, 1024);
      let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(150,140,180,${0.05 + rnd() * 0.08})`; c.lineWidth = 1 + rnd() * 2; c.beginPath(); let x = rnd() * 1024, y = rnd() * 1024; c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 160; y += (rnd() - 0.5) * 160; c.lineTo(x, y); } c.stroke(); } // (the marble's veins)
      c.strokeStyle = "rgba(120,110,150,.35)"; c.lineWidth = 2; for (let r = 60; r < m; r += 64) { c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.stroke(); } for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; c.beginPath(); c.moveTo(m + Math.cos(t) * 60, m + Math.sin(t) * 60); c.lineTo(m + Math.cos(t) * 512, m + Math.sin(t) * 512); c.stroke(); }
      c.strokeStyle = "#d9b25e"; for (const [r, w] of [[120, 7], [250, 5], [380, 6], [500, 8]]) { c.lineWidth = w; c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.stroke(); }
      map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; marbleMap = map; }
    // the plaza itself: black marble with gold rings and blue-crystal stars (the owner's floor picture, 2026-10-25, drawn top-down:
    // images/raid/plaza-floor.webp, the gold and crystals lit by plaza-floor-e.webp); the canvas marble until it's in
    const plazaM = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.3, metalness: 0.2, envMapIntensity: 0.6, fog: false, emissive: 0xffc878, emissiveIntensity: 0 });
    { const tl = new THREE.TextureLoader(), tex = (f, srgb, ok) => tl.load(`/images/raid/${f}.webp${ctx.ver || ""}`, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; ok(t); }, undefined, () => {});
      tex("plaza-floor", true, (t) => { plazaM.map = t; plazaM.needsUpdate = true; }); tex("plaza-floor-e", false, (t) => { plazaM.emissiveMap = t; plazaM.emissiveIntensity = 0.55; plazaM.needsUpdate = true; }); }
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 96), plazaM); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true; H.add(plaza);
    const edge = new THREE.Mesh(new THREE.RingGeometry(PLAZA_R - 0.5, PLAZA_R, 128), neon(0xffc46a, 0.85)); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.05; H.add(edge);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R - 6, 9, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x1e1a22, roughness: 0.8, side: THREE.DoubleSide })); side.position.y = -4.5; H.add(side); // (the stone under its edge)
    spins.push((dt, t) => { if (H.visible) edge.material.opacity = 0.7 + Math.sin(t * 1.8) * 0.15; }); }
  // the way home: a ring of light behind where you arrive
  const back = new THREE.Group(); back.name = "rq-back"; back.position.set(land.x + 9, 0, land.z + HALL.back - 4); back.userData.radius = 0; planet.add(back); back.visible = false;
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 10, 64), neon(0xff7ab8)); ring.position.y = 2.6; back.add(ring); const veil = new THREE.Mesh(new THREE.CircleGeometry(2.1, 40), neon(0xffd6ec, 0.35)); veil.position.y = 2.6; back.add(veil); spins.push((dt, t) => { ring.rotation.z = t * 0.8; veil.material.opacity = 0.28 + Math.sin(t * 2) * 0.08; }); }
  // the Citadel's door: what you walk up to (world-play's "rqgate" prompt) and a body you can't walk through
  const door = new THREE.Object3D(); door.name = "rq-door"; door.position.set(land.x, 0, land.z + HALL.door + 9); planet.add(door);
  const wall = new THREE.Object3D(); wall.position.set(land.x, 0, land.z + HALL.door); wall.userData.radius = 8; planet.add(wall);
  let hallP = null;
  function loadHall() {
    if (hallP) return hallP;
    return (hallP = Promise.all([load("/models/world/raid/spireway.glb"), load("/models/world/raid/gate.glb"), load("/models/world/raid/spire-isle.glb")]).then(([rd, gt, isle]) => {
      const fit = (o, k, x, y0, z, box) => { o.scale.setScalar(k); o.position.set(x - (box.min.x + (box.max.x - box.min.x) / 2) * k, y0 - box.min.y * k, z - (box.min.z + (box.max.z - box.min.z) / 2) * k); };
      // the Citadel first, then the road from its front out to where you arrive; the door and its body follow the model
      { const o = gt.scene, box = new THREE.Box3().setFromObject(o), k = 26 / (box.max.y - box.min.y || 1); fit(o, k, 0, 0, HALL.door, box); o.traverse((m) => { if (m.isMesh) m.castShadow = !ctx.low; }); H.add(o);
        const half = ((box.max.z - box.min.z) / 2) * k, w = (box.max.x - box.min.x) * k, fz = HALL.door + half; // (its front, in the hall's own coordinates)
        HALL.road[0] = Math.min(HALL.road[1] - 20, fz - 1); door.position.z = land.z + fz + 2.5; wall.userData.radius = Math.min(14, Math.max(4, Math.min(w, half * 2) * 0.42)); }
      { const box = new THREE.Box3().setFromObject(rd.scene), len = (HALL.road[1] - HALL.road[0]) / 2, k = len / (box.max.z - box.min.z || 1); HALL.roadW = (box.max.x - box.min.x) * k; // (two lengths end to end; its width for the deck)
        for (let i = 0; i < 2; i++) { const o = i ? rd.scene.clone() : rd.scene; fit(o, k, 0, -0.17, HALL.road[0] + len * (i + 0.5), box); o.traverse((m) => { if (m.isMesh) m.receiveShadow = true; }); H.add(o); } }
        // its floor: the model's deck is a sliver at grass height, so the road gets a deck of its own — the plaza's black marble
        // (the owner's floor, 2026-10-25), gold lines along both edges and down the middle, a blue-crystal star every few metres
      { const dw = HALL.roadW * 0.8, dl = HALL.road[1] - HALL.road[0], cv = typeof document !== "undefined" ? document.createElement("canvas") : null; let dmap = null;
        if (cv) { cv.width = 256; cv.height = 2048; const c = cv.getContext("2d"); c.fillStyle = "#0d0c12"; c.fillRect(0, 0, 256, 2048);
          let sd = 5; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
          for (let i = 0; i < 46; i++) { c.strokeStyle = `rgba(190,190,210,${0.05 + rnd() * 0.12})`; c.lineWidth = 0.6 + rnd() * 1.4; c.beginPath(); let x = rnd() * 256, y = rnd() * 2048; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 140; c.lineTo(x, y); } c.stroke(); } /* the marble's veins */
          c.strokeStyle = "rgba(201,154,78,.35)"; c.lineWidth = 1.5; for (let y = 0; y < 2048; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
          for (const [x, w] of [[128, 3], [14, 6], [242, 6]]) { const gr = c.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, "#5a3d14"); gr.addColorStop(0.35, "#c99a4e"); gr.addColorStop(0.5, "#ffe9b0"); gr.addColorStop(0.65, "#c99a4e"); gr.addColorStop(1, "#5a3d14"); c.fillStyle = gr; c.fillRect(x - w, 0, w * 2, 2048); }
          for (let y = 64; y < 2048; y += 256) { const st = (r1, r2, col) => { c.fillStyle = col; c.beginPath(); for (let a = 0; a < 8; a++) { const r = a % 2 ? r2 : r1, t = (a / 8) * Math.PI * 2; c.lineTo(128 + Math.sin(t) * r * 1.3, y + Math.cos(t) * r); } c.fill(); };
            st(40, 9, "#b8863a"); st(30, 7, "#e9c47a"); const q = 13; [["#dceeff", 0], ["#7fb0e8", 1], ["#2f5a96", 2], ["#5d8fd0", 3]].forEach(([col, i]) => { const t0 = (i / 4) * Math.PI * 2, t1 = ((i + 1) / 4) * Math.PI * 2; c.fillStyle = col; c.beginPath(); c.moveTo(128, y); c.lineTo(128 + Math.sin(t0) * q, y + Math.cos(t0) * q); c.lineTo(128 + Math.sin(t1) * q, y + Math.cos(t1) * q); c.fill(); }); }
          dmap = new THREE.CanvasTexture(cv); dmap.colorSpace = THREE.SRGBColorSpace; dmap.anisotropy = 4; dmap.wrapT = THREE.RepeatWrapping; dmap.repeat.set(1, Math.max(1, Math.round(dl / 24))); }
        const deck = new THREE.Mesh(new THREE.PlaneGeometry(dw, dl), new THREE.MeshStandardMaterial({ color: 0xffffff, map: dmap, emissive: 0xffc878, emissiveMap: dmap, emissiveIntensity: 0.22, roughness: 0.3, metalness: 0.1, fog: false }));
        deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.07, (HALL.road[0] + HALL.road[1]) / 2); deck.receiveShadow = true; H.add(deck); }
      // the three queens along the Spireway as standing holograms (their cut-out art on a pedestal, in their colours; a
      // picture each, not their 2 MB models): Lysitha nearest the Citadel, Nyxara nearest where you arrive
      { const tl = new THREE.TextureLoader(), side = (HALL.roadW || 10) * 0.5 + 4.5;
        ["lysitha", "solvira", "nyxara"].forEach((id, i) => { const V = QV[id], z = HALL.road[0] + 10 + i * ((HALL.road[1] - HALL.road[0] - 16) / 2), x = i % 2 ? side : -side, st = new THREE.Group(); st.position.set(x, 0, z); st.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
          const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 1.1, 24), std(0x1c1820, { roughness: 0.35, metalness: 0.5 })); ped.position.y = 0.55; st.add(ped);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.07, 6, 40), neon(V.tint, 0.95)); rim.rotation.x = Math.PI / 2; rim.position.y = 1.1; st.add(rim);
          const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, fog: false, toneMapped: false });
          tl.load(`/images/raid/${id}-full.webp${ctx.ver || ""}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; });
          const card = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 6.9), mat); card.position.y = 1.1 + 3.45; st.add(card);
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 9, 24, 1, true), neon(V.tint, 0.12)); beam.position.y = 1.1 + 4.5; st.add(beam);
          spins.push((dt, t) => { if (!H.visible) return; card.position.y = 4.55 + Math.sin(t * 1.1 + i) * 0.12; rim.material.opacity = 0.7 + Math.sin(t * 2 + i) * 0.25; });
          H.add(st); }); }
      { const box = new THREE.Box3().setFromObject(isle.scene), hh = box.max.y - box.min.y || 1;
        // [x, z, height of the spire (m), how high it floats]: big ones far off, small ones near the road; none on the road
        const ISLES = [[-19, 22, 9, 5], [21, 8, 11, 7], [-22, -8, 13, 9], [-44, -60, 40, 4], [48, -66, 36, 8], [24, -20, 9, 12], [-62, 30, 22, 14], [66, 34, 20, 16], [-86, -14, 34, 12], [88, 2, 34, 10], [-30, -110, 30, 24], [34, -114, 28, 28]].slice(0, ctx.low ? 7 : 12); // (near ones first: low graphics keeps the first seven)
        ISLES.forEach(([x, z, h, y], i) => { const o = i ? isle.scene.clone() : isle.scene; fit(o, h / hh, x, y, z, box); o.rotation.y = i * 1.7; SKY.add(o);
          const y0 = o.position.y; spins.push((dt, t) => { if (SKY.visible) { o.position.y = y0 + Math.sin(t * 0.5 + i) * 0.8; o.rotation.y += dt * 0.03 * (i % 2 ? 1 : -1); } });
          if (i % 3 === 0 && !ctx.low) { const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 60, 6, 1, true), neon(0xff4d6d, 0.5)); beam.position.set(x, y - 30, z); SKY.add(beam); } }); }
      return true;
    }).catch((e) => { hallP = null; console.warn("raid hall", e); return false; }));
  }
  function vis() { const inRun = !!run && !run.done; g.visible = shown && inRun; H.visible = back.visible = shown && !inRun; SKY.visible = shown; if (shown) loadHall(); if (H.visible) paintTopSign(); solids.length = 0; if (H.visible) solids.push(wall); if (H.visible) loadHall(); }
  /// the hall's front: on the road, facing the Citadel (after a run, and where the portal on the far hunting ring puts you)
  // over the Citadel's door: this week's fastest (Lysitha's board), a sign drawn on a canvas, refreshed when the hall shows
  let topSign = null, topAt = 0;
  async function paintTopSign() {
    if (typeof document === "undefined" || Date.now() - topAt < 60e3) return; topAt = Date.now();
    let j = null; try { const r = await fetch("/api/social?world=rq-top&mode=lysitha", { cache: "no-store" }); if (r.ok) j = await r.json(); } catch { return; }
    const x0 = j && j.top && j.top[0]; const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 256; const c2 = cv.getContext("2d");
    const gr = c2.createLinearGradient(0, 0, 1024, 0); gr.addColorStop(0, "rgba(40,8,24,0)"); gr.addColorStop(0.15, "rgba(40,8,24,.85)"); gr.addColorStop(0.85, "rgba(40,8,24,.85)"); gr.addColorStop(1, "rgba(40,8,24,0)"); c2.fillStyle = gr; c2.fillRect(0, 30, 1024, 196);
    c2.textAlign = "center"; c2.fillStyle = "#ffd36a"; c2.font = "800 44px Sora, system-ui, sans-serif"; c2.fillText("🏆 " + T("This week's fastest"), 512, 96);
    c2.fillStyle = "#fff"; c2.font = "900 70px Sora, system-ui, sans-serif"; c2.fillText(x0 ? `${(x0.name || x0.w).slice(0, 16)} · ${fmt(x0.t)}` : T("Be the first!"), 512, 186);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    if (!topSign) { topSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, fog: false, toneMapped: false })); topSign.scale.set(16, 4, 1); topSign.position.set(0, 29, HALL.door + 8); H.add(topSign); }
    else { topSign.material.map.dispose(); topSign.material.map = tx; topSign.material.needsUpdate = true; }
  }
  function toHall(atDoor) { ctx.stand(land.x, atDoor ? door.position.z + 4 : land.z + HALL.start, { x: land.x, z: land.z + HALL.door }); vis(); }

  // ---------------- the monsters: Imp and Puglin, the KayKit moves on their bones, the queen's colours ----------------
  const msrc = {}, mclips = {}, mtex = {};
  let mobsP = null, run = null;
  function loadMobs() {
    if (mobsP) return mobsP;
    const sv = load("/models/world/survivors/monsters.glb").then((gl) => { for (const [k, M] of Object.entries(MOB)) { if (!M.sv) continue; const root = gl.scene.getObjectByName(k); if (!root) continue;
        if (root.parent) root.parent.remove(root); root.position.set(0, 0, 0); const by = {}; for (const c of gl.animations) if (c.name.startsWith(k + ":")) by[c.name.split(":")[1]] = c;
        msrc[k] = { scene: root }; mclips[k] = { run: by.move, walk: by.move, attack: by.atk, die: by.die }; for (const n of Object.keys(mclips[k])) if (!mclips[k][n]) delete mclips[k][n]; } })
      .catch((e) => console.warn("raid monsters (survivors)", e)); /* the run still has its Imps without them */
    mobsP = Promise.all([...Object.entries(MOB).filter(([, M]) => M.glb).map(async ([k, M]) => { const gl = await load(`/models/world/raid/${M.glb}.glb`); msrc[k] = gl; mclips[k] = await K.borrowMoves(gl, K.KK_MONSTER, ctx.ver || ""); }), sv])
      .then(() => true).catch((e) => { console.warn("raid monsters", e); mobsP = null; return false; });
    return mobsP;
  }
  const texOf = (kind, skin) => { const key = kind + "-" + skin; if (mtex[key] !== undefined) return mtex[key]; mtex[key] = null;
    new THREE.TextureLoader().load(`/models/world/raid/tex/${key}.webp${ctx.ver || ""}`, (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mtex[key] = t; for (const m of run ? run.mobs : []) if (m.e && m.e.kind === kind && m.e.skin === skin) m.e.paint(t); }, undefined, () => {});
    return null; };
  // bodies kept for reuse (keep: the combat hands them back whole instead of freeing their materials): a fresh copy of
  // a skinned model every half second was a hitch on phones with eighteen about
  const mpool = {};
  function mobBack(e) { if (!e || e.obj.parent) return; const a = mpool[e.kind] || (mpool[e.kind] = []); if (a.length >= 10) return; e.obj.position.set(0, 0, 0); e.obj.rotation.set(0, 0, 0); e.obj.visible = true; e.mixer.stopAllAction(); e.reset(); a.push(e); }
  function mobEnt(kind, skin) {
    const pa = mpool[kind]; if (pa && pa.length) { const e = pa.pop(); if (e.skin !== skin) { e.skin = skin; const t = MOB[kind].tex ? texOf(kind, skin) : null; if (t) e.paint(t); } return e; }
    const src = msrc[kind], clips = mclips[kind] || {}; if (!src) return null;
    const o = K.skelClone(src.scene), box = new THREE.Box3().setFromObject(o), sz = box.max.y - box.min.y || 1, inner = new THREE.Group(); inner.add(o);
    o.scale.setScalar(1 / sz); o.position.y = -box.min.y / sz; // a body 1 tall: the combat scales it to its height
    const mats = []; o.traverse((x) => { if (!x.isMesh) return; x.castShadow = false; x.frustumCulled = false; x.material = x.material.clone(); mats.push(x.material); });
    const mix = new THREE.AnimationMixer(o), acts = {}; for (const [n, c] of Object.entries(clips)) acts[n] = mix.clipAction(c);
    let cur = null, once = null;
    const loop = (n) => { const a = acts[n] || acts.run || acts.walk; if (!a || (cur === a && !once)) return; a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); if (cur && cur !== a) cur.crossFadeTo(a, 0.2, false); cur = a; };
    mix.addEventListener("finished", (ev) => { if (ev.action === once) { once = null; const a = acts.run; if (a) { a.reset().play(); ev.action.crossFadeTo(a, 0.15, false); cur = a; } } });
    const e = { obj: inner, mixer: mix, own: true, keep: true, kind, skin,
      reset() { cur = null; once = null; loop("run"); },
      paint(t) { for (const mt of mats) { mt.map = t; mt.needsUpdate = true; } },
      play(name, o2 = {}) { const n = name === "Attack" ? (Math.random() < 0.35 && acts.attack2 ? "attack2" : "attack") : name === "Hit" ? "hit" : name === "Run" ? "run" : String(name).toLowerCase();
        const a = acts[n]; if (!a) return; if (!o2.once) { if (!once) loop(n); return; }
        if (once && n === "hit") return; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.timeScale = n === "hit" ? 1.4 : 1.15; a.play(); if (cur && cur !== a) cur.crossFadeTo(a, o2.fade ?? 0.08, false); cur = a; once = a; } };
    const t0 = MOB[kind].tex ? texOf(kind, skin) : null; if (t0) e.paint(t0);
    loop("run"); return e;
  }

  // ---------------- the queens ----------------
  const qsrc = {}, qP = {};
  const loadQueen = (id) => qP[id] || (qP[id] = load(`/models/world/raid/${QV[id].glb}.glb`).then((gl) => { qsrc[id] = gl; return gl; }).catch((e) => { console.warn("raid queen", e); qP[id] = null; return null; }));
  function rig(src, glowC) {
    const o = K.skelClone(src.scene), box = new THREE.Box3().setFromObject(o), sz = box.max.y - box.min.y || 1, inner = new THREE.Group(); inner.add(o);
    o.scale.setScalar(1 / sz); o.position.y = -box.min.y / sz;
    o.traverse((x) => { if (!x.isMesh) return; x.castShadow = !ctx.low && !ctx.coarse; x.receiveShadow = false; x.frustumCulled = false; x.material = x.material.clone(); if (x.material.emissive) { x.material.emissive.setHex(glowC); x.material.emissiveIntensity = 0.06; } });
    const mix = new THREE.AnimationMixer(o), acts = {}; for (const c of src.animations) acts[c.name] = mix.clipAction(c);
    return { obj: inner, mixer: mix, acts, cur: "", onceT: 0 };
  }
  function playOn(b, name, { once = false, fade = 0.25, speed = 1 } = {}) {
    const a = b.acts[name]; if (!a) return;
    if (b.cur === name && !once) { a.timeScale = speed; return; }
    const prev = b.acts[b.cur]; a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false); b.cur = name; b.onceT = once ? a.getClip().duration / Math.max(0.1, speed) : 0;
  }
  function queenEnt(id) {
    const V = QV[id], b = rig(qsrc[id], V.tint);
    const e = { ...b, keep: true, own: true,
      play(name) { if (e.onceT > 0) return; if (name === "Attack") playOn(e, V.atk[Math.floor(Math.random() * V.atk.length)], { once: true, fade: 0.1, speed: 1.1 }); else if (name === "Hit" && V.hit && Math.random() < 0.12) playOn(e, V.hit, { once: true, fade: 0.08, speed: 1.3 }); } };
    playOn(e, V.idle[0], { fade: 0 }); return e;
  }
  /// your attack against a boss of level lv, a second (her fight's length comes from it)
  function dpsAt(lv) { const s = ctx.stats ? ctx.stats() : { atk: 20 }, def = Math.round(lv * 1.5 * 1.5); return Math.max(5, ((s.atk || 20) - def * 0.5) * 2.1); }
  function spawnQueen(id, lv, at, secs) {
    const c = ctx.combat(); if (!c || !c.spawnExt || !qsrc[id]) return null;
    const V = QV[id], max = Math.max(5000, Math.round(dpsAt(lv) * secs)), e = queenEnt(id);
    const q = { id, V, lv, max, phase: 1, fightT: 0, e, m: null, dead: false, lastP: at.clone(), spS: 0 };
    q.m = c.spawnExt({ ent: e, at, lv, max, hp: max, home: { x: land.x, z: land.z, r: ARENA_R - 2 }, pats: V.pats[0], atkK: 1.05, extLabel: "RAID QUEENS",
      reach: 4.6, boss: { name: T(V.name), scale: V.h, y: 0, tint: V.tint }, ext: { hit: (mm) => onQueenHit(q, mm), down: (mm) => queenFell(q, mm) } });
    if (!q.m) return null; q.base = q.m.atk;
    if (V.arise) playOn(e, V.arise, { once: true, fade: 0 });
    q.drop = 1.8; q.baseY = e.obj.position.y; e.obj.position.y = q.baseY + 30; pillarFx(at, V.tint, 40, 3, 2); q.m.stun = 2; // (she comes down from the sky in a column of light)
    if (typeof document !== "undefined") { document.body.classList.add("rq-cine"); setTimeout(() => document.body.classList.remove("rq-cine"), 2600); }
    return q;
  }
  // her HP is ours (the run is yours alone): the combat takes the hit, she falls when it reaches the end
  function onQueenHit(q, m) {
    const c = ctx.combat(); if (!c) return;
    const dmg = (q.lastHp ?? m.max) - m.hp; q.lastHp = m.hp; breakTick(q, m, dmg);
    const ph = phaseOf(m.hp, m.max); if (ph > q.phase) { q.phase = ph; m.pats = q.V.pats[ph - 1]; cutIn(q, ph - 1, false); shock(q); }
    if (m.hp <= 1 && !q.dead) { q.dead = true; setTimeout(() => { try { c.extDown(m); } catch { /* gone */ } }, 0); }
  }
  function queenTick(q, dt) {
    const m = q.m, e = q.e; if (!m || q.dead) return;
    if (q.drop > 0) { q.drop -= dt; const k = Math.max(0, q.drop / 1.8); e.obj.position.y = q.baseY + k * k * 30; if (q.drop <= 0) { e.obj.position.y = q.baseY; ringFx(m.g.position, q.V.tint, 16, 0.9); ringFx(m.g.position, 0xffffff, 9, 0.5); knockFrom(m.g.position, 10); if (ctx.shake) ctx.shake(0.8); try { if (ctx.Snd && ctx.Snd.svDrum) ctx.Snd.svDrum(1); } catch { /* no sound */ } } }
    if (q.brkT > 0) { q.brkT -= dt; if (q.brkT <= 0) { m.def = q.def0; q.brk = 0; q.brkCd = 8; } } else if (q.brkCd > 0) q.brkCd -= dt;
    trickTick(q, dt);
    if ((q.subT = (q.subT ?? 14) - dt) <= 0 && q.drop <= 0) { q.subT = 20 + Math.random() * 8; subtitle(q); }
    const p = m.g.position, sp = Math.hypot(p.x - q.lastP.x, p.z - q.lastP.z) / Math.max(1e-3, dt); q.lastP.copy(p);
    q.spS += (sp - q.spS) * Math.min(1, dt * 8);
    if (e.onceT > 0) e.onceT -= dt;
    else if (q.spS > 3.2) playOn(e, q.V.run, { speed: Math.max(0.8, q.spS / 4.4) });
    else if (q.spS > 0.35) playOn(e, q.V.walk, { speed: Math.max(0.8, q.spS / 1.5) });
    else playOn(e, q.V.idle[Math.floor(performance.now() / 9000) % q.V.idle.length], { fade: 0.35 });
    e.mixer.update(dt);
    q.fightT += dt; // Nyxara: +4 % every 30 s, up to +60 %; every queen +15 % a phase
    m.atk = Math.round(q.base * (1 + 0.15 * (q.phase - 1)) * (q.V.ramp ? 1 + Math.min(0.6, Math.floor(q.fightT / 30) * 0.04) : 1));
    if (ctx.parts && !ctx.low && !ctx.reduce && (q.emT = (q.emT || 0) - dt) <= 0) { q.emT = 0.2; ctx.parts.emit({ at: tmp.copy(p).setY(q.V.h * 0.75), kind: "glow", n: 2, speed: 0.7, up: 2, spread: 0.5, size: 0.38, life: 0.9, grav: -3, color: q.V.tint, color2: 0xffffff, jitter: 0.3 }); }
  }
  function queenFell(q, m) {
    const e = q.e; q.dead = true; if (!e) return;
    const wp = m.g.position.clone(); m.g.remove(e.obj); e.obj.position.copy(wp).sub(g.position).setY(0); e.obj.rotation.y = m.g.rotation.y; e.obj.scale.setScalar(q.V.h); g.add(e.obj);
    playOn(e, q.V.die, { once: true, fade: 0.1 }); q.corpse = { t0: performance.now() };
    cutIn(q, 3, true); if (ctx.shake) ctx.shake(0.6); pillarFx(wp, q.V.tint, 60, 2.6, 2.4); ringFx(wp, 0xffffff, 18, 1);
    if (run && run.queens.every((x) => x.dead)) { if (ctx.slowmo) ctx.slowmo(1100); zonesClear(); setTimeout(() => { if (ctx.heroClip) ctx.heroClip("emote-yes"); }, 1300); setTimeout(() => win(), 2600); }
  }
  function burst(at, col, big) {
    if (ctx.parts) ctx.parts.emit({ at: tmp.copy(at).setY(2), kind: "glow", n: big ? 50 : 20, speed: big ? 7 : 3, up: 3, spread: 1.2, size: 0.6, life: 1.1, grav: -2, color: col, color2: 0xffffff, jitter: 0.5 });
    if (big) { if (ctx.shake) ctx.shake(0.45); if (ctx.Snd && ctx.Snd.roar) try { ctx.Snd.roar(); } catch { /* no sound */ } }
  }

  // ---------------- effects (b3): rings, pillars, rifts, the queens' tricks ----------------
  const fx = [], loc = (v) => tmp.copy(v).sub(g.position);
  const ringGeo = new THREE.RingGeometry(0.86, 1, 72), discGeo = new THREE.CircleGeometry(1, 48), pillGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  function addFx(o, life, upd) { g.add(o); fx.push({ o, t: 0, life, upd }); return o; }
  /// a ring on the floor opening from r0 to r1 and fading (col: its colour)
  function ringFx(at, col, r1, life = 0.6, r0 = 0.4, y = 0.14) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; const p = loc(at); m.position.set(p.x, y, p.z);
    return addFx(m, life, (k) => { const r = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 3)); m.scale.set(r, r, r); m.material.opacity = 0.95 * (1 - k); });
  }
  /// a column of light (a queen's landing, her fall, a summons)
  function pillarFx(at, col, h = 26, r = 2.2, life = 1.4) {
    const m = new THREE.Mesh(pillGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    const p = loc(at); m.position.set(p.x, h / 2, p.z); m.scale.set(r, h, r);
    return addFx(m, life, (k) => { m.material.opacity = 0.6 * (1 - k); const w = r * (1 - k * 0.6); m.scale.set(w, h, w); });
  }
  function fxTick(dt) { for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const k = Math.min(1, f.t / f.life); f.upd(k, dt); if (k >= 1) { g.remove(f.o); f.o.material.dispose(); fx.splice(i, 1); } } }
  function fxClear() { for (const f of fx) { g.remove(f.o); f.o.material.dispose(); } fx.length = 0; }
  const knockFrom = (at, power) => { if (!ctx.knock) return; ctx.here(me); const dx = me.x - at.x, dz = me.z - at.z, d = Math.hypot(dx, dz) || 1; ctx.knock(dx / d, dz / d, power); };
  const hurt = (frac) => { const c = ctx.combat(); if (!c || !c.hurtMe || !c.vitals) return; const v = c.vitals(); if (v.down) return; c.hurtMe(Math.max(1, Math.round(v.max * frac))); };
  // the queens' tricks (each her own, from her second minute on): Lysitha's frost circles, Solvira's sweeping sunbeam,
  // Nyxara's blood pools (that heal her while she stands in one); a red outline first, then the danger
  const zones = [];
  function zoneAt(q, at, r, kind) {
    const col = { frost: 0x9fd4ff, blood: 0xff2d4d }[kind];
    const edge = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    for (const m of [edge, fill]) { m.rotation.x = -Math.PI / 2; const p = loc(at); m.position.set(p.x, 0.11, p.z); m.scale.setScalar(r); g.add(m); }
    zones.push({ q, at: at.clone(), r, kind, edge, fill, t: 0, warn: 1.3, life: 6.5, hitT: 0 });
  }
  function zonesTick(dt) {
    ctx.here(me);
    for (let i = zones.length - 1; i >= 0; i--) { const z = zones[i]; z.t += dt;
      const live = z.t > z.warn, k = Math.min(1, z.t / z.warn);
      z.edge.material.opacity = live ? 0.55 : 0.4 + 0.5 * Math.abs(Math.sin(z.t * 9)); z.fill.material.opacity = live ? 0.42 * Math.min(1, (z.life - z.t) * 2) : 0.12 * k;
      if (live && Math.hypot(me.x - z.at.x, me.z - z.at.z) < z.r && (z.hitT -= dt) <= 0) { z.hitT = 0.5; hurt(z.kind === "blood" ? 0.05 : 0.04); if (ctx.parts) ctx.parts.emit({ at: tmp.copy(me).setY(0.5), kind: "glow", n: 6, speed: 2, up: 1, spread: 0.4, size: 0.3, life: 0.5, grav: -1, color: z.kind === "blood" ? 0xff2d4d : 0xbfe6ff, color2: 0xffffff, jitter: 0.3 }); }
      if (live && z.kind === "blood" && z.q.m && !z.q.dead) { const p = z.q.m.g.position; if (Math.hypot(p.x - z.at.x, p.z - z.at.z) < z.r + 1 && (z.healT = (z.healT || 0) - dt) <= 0) { z.healT = 1; z.q.m.hp = Math.min(z.q.m.max, z.q.m.hp + z.q.m.max * 0.01); } }
      if (z.t > z.life) { g.remove(z.edge); g.remove(z.fill); z.edge.material.dispose(); z.fill.material.dispose(); zones.splice(i, 1); } }
  }
  function zonesClear() { for (const z of zones) { g.remove(z.edge); g.remove(z.fill); z.edge.material.dispose(); z.fill.material.dispose(); } zones.length = 0; if (beam) { g.remove(beam.o); beam.o.material.dispose(); beam = null; } }
  // Solvira's sunbeam: a line from her across the floor, turning; a hit once a pass
  let beam = null;
  function beamStart(q) {
    if (beam) return; const L = ARENA_R * 2, o = new THREE.Mesh(new THREE.PlaneGeometry(2.4, L), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    o.rotation.x = -Math.PI / 2; o.geometry.translate(0, L / 2, 0); g.add(o); beam = { q, o, t: 0, a: Math.random() * 6.28, hit: 0 };
  }
  function beamTick(dt) {
    if (!beam) return; const b = beam, q = b.q; b.t += dt;
    if (!q.m || q.dead || b.t > 9) { g.remove(b.o); b.o.material.dispose(); beam = null; return; }
    const p = loc(q.m.g.position); b.o.position.set(p.x, 0.16, p.z); const live = b.t > 1.4; b.a += dt * (live ? 0.55 : 0); b.o.rotation.z = b.a;
    b.o.material.opacity = live ? 0.55 + Math.sin(b.t * 20) * 0.1 : 0.15 + 0.2 * Math.abs(Math.sin(b.t * 9)); b.o.material.color.setHex(live ? 0xffd36a : 0xff4d6d);
    if (!live) return; ctx.here(me); const dx = me.x - q.m.g.position.x, dz = me.z - q.m.g.position.z, dir = b.a + Math.PI / 2, along = dx * Math.cos(dir) + dz * Math.sin(dir), off = Math.abs(-dx * Math.sin(dir) + dz * Math.cos(dir));
    if (along > 0 && off < 1.4 && (b.hit -= dt) <= 0) { b.hit = 1.2; hurt(0.16); if (ctx.shake) ctx.shake(0.3); }
    else if (b.hit > 0) b.hit -= dt;
  }
  function trickTick(q, dt) {
    if (!q.m || q.dead || q.drop > 0 || q.fightT < 8) return;
    if ((q.trickT = (q.trickT ?? 6) - dt) > 0) return; q.trickT = 9 + Math.random() * 3 - q.phase;
    ctx.here(me); const near = (r) => { const a = Math.random() * 6.28, d = Math.random() * r; return new V3(me.x + Math.cos(a) * d, 0, me.z + Math.sin(a) * d); };
    if (q.id === "lysitha") { for (let i = 0; i < 1 + q.phase; i++) zoneAt(q, near(6), 3.2, "frost"); }
    else if (q.id === "nyxara") { zoneAt(q, near(4), 3.6, "blood"); zoneAt(q, q.m.g.position.clone(), 4, "blood"); }
    else if (q.id === "solvira") beamStart(q);
  }
  // her guard: hits fill it, full → BREAK (she kneels 4 s and takes far more), then it's shut for a while
  function breakTick(q, m, dmg) {
    if (q.brkT > 0 || (q.brkCd || 0) > 0 || dmg <= 0) return;
    q.brk = Math.min(1, (q.brk || 0) + dmg / (q.max * 0.09));
    if (q.brk < 1) return;
    q.brkT = 4; q.def0 = m.def; m.def = Math.round(m.def * 0.3); m.stun = Math.max(m.stun || 0, 4);
    ringFx(m.g.position, 0xffd36a, 7, 0.7); if (ctx.parts) ctx.parts.emit({ at: tmp.copy(m.g.position).setY(q.V.h * 0.5), kind: "glow", n: 40, speed: 6, up: 2, spread: 1.2, size: 0.5, life: 0.9, grav: -2, color: 0xffd36a, color2: 0xffffff, jitter: 0.4 });
    banner("BREAK!", q.V.css); try { if (ctx.Snd && ctx.Snd.perfect) ctx.Snd.perfect(); } catch { /* no sound */ } if (ctx.slowmo) ctx.slowmo(260);
  }
  function banner(text, css, sub) {
    if (typeof document === "undefined") return; document.querySelectorAll(".rq-ban").forEach((x) => x.remove());
    const el = document.createElement("div"); el.className = "rq-ban"; el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", css || "#ff7ab8"); el.innerHTML = `<b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
  }
  // her words now and then, as a line at the bottom
  function subtitle(q) {
    if (typeof document === "undefined") return; document.querySelectorAll(".rq-sub").forEach((x) => x.remove());
    const el = document.createElement("div"); el.className = "rq-sub"; el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", q.V.css);
    el.innerHTML = `<b>${esc(T(q.V.name))}</b> “${esc(T(q.V.lines[1 + Math.floor(Math.random() * 2)]))}”`; document.body.appendChild(el); setTimeout(() => el.remove(), 3800);
  }
  // a phase: a shockwave from her (it throws you back), the floor flares, the crystals round the edge burst and grow back; and she calls two elites
  let crysT = 0, flare = 0;
  function shock(q) {
    const m = q.m; if (!m) return; ringFx(m.g.position, q.V.tint, 22, 0.9); ringFx(m.g.position, 0xffffff, 14, 0.6); knockFrom(m.g.position, 16); flare = 1;
    if (ctx.parts) for (const c of crys) { c.getWorldPosition(cw); ctx.parts.emit({ at: tmp.copy(cw), kind: "glow", n: ctx.low ? 4 : 10, speed: 5, up: 3, spread: 0.6, size: 0.4, life: 0.9, grav: -6, color: q.V.tint, color2: 0xffffff, jitter: 0.4 }); }
    crysT = 6; for (const c of crys) c.visible = false;
    if (run && !run.isS) for (let i = 0; i < 2; i++) spawnOne({ elite: true, near: m.g.position });
  }
  // ---------------- a run ----------------
  let hud = null, info = null, busy = false;
  async function refreshInfo() { try { const s = ctx.sess(); const r = await fetch("/api/social?world=rq" + (s ? "&wallet=" + s.wallet : ""), { cache: "no-store" }); if (r.ok) info = await r.json(); } catch { /* the lobby says so */ } return info; }
  async function start(mode) {
    if (busy || run) return; busy = true;
    try {
      if (!ctx.sess()) { try { await ctx.signIn(); } catch { return; } if (!ctx.sess()) return; }
      const M = modeOf(mode); if (!M) return;
      if (ctx.level() < M.lv) { ctx.toast(esc(T("This run is for Lv {n}+", { n: M.lv }))); return; }
      const trio = mode === "secret" || !!(modeOf(mode) || {}).trio, qs = trio ? ["lysitha", "solvira", "nyxara"] : [mode];
      const [ok, ...gls] = await Promise.all([loadMobs(), ...qs.map(loadQueen)]); if (!ok || gls.some((x) => !x)) { ctx.toast(esc(T("Couldn't open it — try again"))); return; }
      const r = await ctx.post({ action: "world-rq-start", ...ctx.sess(), mode });
      if (!r || !r.ok) { const j = (r && r.j) || {}; if (r && r.status === 402) { closeLobby(); if (!info) await refreshInfo(); payCard(); return; } ctx.toast(esc(j.error ? T(j.error) : T("Couldn't open it — try again"))); return; }
      closeLobby();
      const V = QV[qs[0]], isS = mode === "secret", pink = trio; // (the Throne and the SECRET: the three queens, the trinity's colours)
      theme(pink ? "#ff7ab8" : V.css, pink ? 0x2a1830 : V.ground, pink ? 0xffbcd4 : ({ lysitha: 0xd6e0ff, solvira: 0xffe9b8, nyxara: 0xffa0a0 })[qs[0]]); backdrop(pink ? "nyxara" : qs[0]); // (the marble floor tinted like the queen's realm: silver-blue, gold, crimson)
      run = { id: r.j.run, mode, isS, trio, plan: isS ? PLAN.secret : PLAN.normal, t: 0, kills: 0, mobs: [], dying: [], lost: 0, queens: [], stage: "waves", qs, spawnT: 0, done: false, skin: pink ? "red" : V.skin };
      shown = true; vis(); ctx.stand(land.x, land.z + ARENA_R - 8, { x: land.x, z: land.z }); paintHud(); if (ctx.music) ctx.music("waves"); if (ctx.Snd && ctx.Snd.siren) try { ctx.Snd.siren(); } catch { /* no sound */ }
      ctx.toast(`<b>${esc(isS ? "SECRET" : trio ? T("THRONE OF THREE") : T(V.name))}</b> · ${esc(T(trio ? "Clear the waves — then they come." : "Clear the waves — then she comes."))}`);
    } finally { busy = false; }
  }
  function mobTick(dt) {
    const c = ctx.combat(); if (!c || !c.spawnOwn || !msrc.imp) return;
    const raw = c.mobsRaw(), before = run.mobs.length; run.mobs = run.mobs.filter((m) => { if (!m.dead && raw.includes(m)) return true; if (ctx.parts && !ctx.low) ctx.parts.emit({ at: tmp.copy(m.g.position).setY(1), kind: "glow", n: 12, speed: 4, up: 2.5, spread: 0.5, size: 0.35, life: 0.7, grav: -4, color: run.trio ? 0xff7ab8 : QV[run.qs[0]].tint, color2: 0xffffff, jitter: 0.4 }); if (!raw.includes(m)) mobBack(m.e); else run.dying.push(m); return false; }); run.kills += Math.max(0, before - run.mobs.length);
    run.dying = run.dying.filter((m) => { if (raw.includes(m)) return true; mobBack(m.e); return false; }); /* (down but still falling: back to the pool once the combat lets it go) */ // (gone = knocked out: the arena's leash keeps them in)
    if (run.t >= run.plan.waveEnd) return;
    const [a0, a1] = run.plan.alive, want = Math.round(a0 + (a1 - a0) * Math.min(1, run.t / run.plan.waveEnd));
    const cap = Math.round(want * (ctx.low ? 0.65 : 1)); /* low graphics: fewer at once */
    if ((run.spawnT -= dt) > 0 || run.mobs.length >= cap) return; run.spawnT = 0.45 + Math.random() * 0.45;
    for (let n = run.mobs.length < cap - 3 ? 2 : 1; n > 0; n--) spawnOne();
  }
  function spawnOne(o = {}) {
    const c = ctx.combat(), M = modeOf(run.mode), my = ctx.level(), lv = run.isS ? 70 + Math.floor(Math.random() * 6) : Math.max(M.lv, Math.min(M.lv + 99, my - 3 + Math.floor(Math.random() * 6)));
    const f = Math.min(1, run.t / run.plan.waveEnd), pool = POOL.filter(([at]) => f >= at).pop()[1], elite = o.elite || (run.t >= run.plan.eliteAt && Math.random() < 0.25);
    let kind = (elite ? ELITES : pool)[Math.floor(Math.random() * (elite ? ELITES : pool).length)]; if (!msrc[kind]) kind = elite ? "puglin" : "imp";
    const e = mobEnt(kind, run.skin); if (!e) return;
    let at = null; for (let k = 0; k < 10 && !at; k++) { const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * (ARENA_R - 13), p = o.near ? new V3(o.near.x + Math.cos(a) * 4, 0, o.near.z + Math.sin(a) * 4) : W(Math.cos(a) * d, Math.sin(a) * d); if (Math.hypot(p.x - me.x, p.z - me.z) > (o.near ? 3 : 8) && Math.hypot(p.x - land.x, p.z - land.z) < ARENA_R - 2) at = p; }
    if (!at) return;
    const zone = { id: "rq-" + run.mode, name: "RAID QUEENS", x: land.x, z: land.z, r: ARENA_R - 1, lv: [M.lv, M.lv + 100], pow: run.isS ? 2.2 : 2 + (M.lv / 300) * 0.8, claimTier: 4, mobs: [] };
    const m = c.spawnOwn({ ent: e, at, lv, rank: elite ? "elite" : "", zone, scale: MOB[kind].h, y: MOB[kind].fly || 0, name: T(MOB[kind].name), color: (QV[run.qs[0]] || {}).css });
    if (m) { run.mobs.push(m); ringFx(at, elite ? 0xffc861 : (QV[run.qs[0]] || {}).tint || 0xff4d8d, elite ? 3 : 2, 0.55); const y1 = e.obj.position.y; e.obj.position.y = y1 - 1.6; rises.push({ e, y1, t: 0 }); } /* (it climbs out of a rift) */
  }
  const rises = [];
  function risesTick(dt) { for (let i = rises.length - 1; i >= 0; i--) { const r = rises[i]; r.t += dt; const k = Math.min(1, r.t / 0.45); r.e.obj.position.y = r.y1 - 1.6 * (1 - k) * (1 - k); if (k >= 1) rises.splice(i, 1); } }
  function queensIn() {
    run.stage = "queen"; const c = ctx.combat();
    for (const m of run.mobs) if (!m.dead && c) { try { c.extGone(m); } catch { /* gone */ } } run.mobs = [];
    const go = () => { if (!run || run.queens.length) return; const n = run.qs.length; run.qs.forEach((id, i) => { const a = n === 1 ? 0 : (i - 1) * 0.9, at = W(Math.sin(a) * (ARENA_R - 9), -Math.cos(a) * (ARENA_R - 9));
        const q = spawnQueen(id, run.isS ? RQ.SECRET.bosses[i] : modeOf(run.trio ? run.mode : id).boss, at, run.plan.queenSec); if (q) run.queens.push(q); }); paintHud(); };
    const met = ls.get(MET, {}), key = run.trio ? "trinity" : run.qs[0]; if (ctx.music) ctx.music(run.trio ? "secret" : run.qs[0]);
    if (met[key] !== dayKey()) { met[key] = dayKey(); ls.set(MET, met); page(key, { onDone: go }); } else go();
  }
  let ending = false;
  async function win() {
    if (!run || run.done || ending) return; ending = true; const r0 = run, M = modeOf(r0.mode);
    // (the server takes a win no sooner than its minimum: wait out the rest, it's only ever a few seconds)
    const wait = Math.max(0, (M.min + 1 - r0.t) * 1000); if (wait > 0) { paintHud(T("Victory! Sealing the crown…")); await new Promise((ok) => setTimeout(ok, Math.min(wait, 60000))); }
    let j = null; try { const r = await ctx.post({ action: "world-rq-end", ...ctx.sess(), run: r0.id, won: true, kills: r0.kills }); j = r && r.j; if (!r || !r.ok) ctx.toast(esc((j && j.error) ? T(j.error) : T("Couldn't save the result — try again"))); } catch { /* the card says so */ }
    r0.done = true;
    if (j && j.ok) { if (j.xp && ctx.grantXp) ctx.grantXp(j.xp); const ids = ls.get(GOT, []); for (const it of j.items || []) if (!ids.includes(it.id)) { try { ctx.addItem(it); } catch { /* the card still shows */ } ids.push(it.id); } ls.set(GOT, ids.slice(-60)); if (j.credited > 0 && ctx.refresh) ctx.refresh(); }
    endRun(); resultCard(r0, j, true); ending = false; if (j && j.ok && ctx.onWin) try { ctx.onWin(r0.mode, j); } catch { /* the card still shows */ }
  }
  async function lose(why) {
    if (!run || run.done) return; const r0 = run; r0.done = true;
    try { await ctx.post({ action: "world-rq-end", ...ctx.sess(), run: r0.id, won: false, kills: r0.kills }); } catch { /* it times out by itself */ }
    endRun(); resultCard(r0, null, false, why);
  }
  function endRun() {
    const c = ctx.combat(), r0 = run; if (!r0) return;
    if (c) { for (const m of r0.mobs) if (!m.dead) try { c.extGone(m); } catch { /* gone */ } for (const q of r0.queens) { if (q.m && !q.dead) try { c.extGone(q.m); } catch { /* gone */ } if (q.e && q.e.obj.parent === g) g.remove(q.e.obj); } }
    zonesClear(); fxClear(); rises.length = 0; crysT = 0; for (const c0 of crys) c0.visible = true; if (typeof document !== "undefined") document.body.classList.remove("rq-low", "rq-cine");
    run = null; paintHud(); vis(); if (ctx.music) ctx.music("");
  }
  function leave() { if (run && !run.done) { if (typeof confirm === "function" && !confirm(T("Leave the run? It counts as lost."))) return; lose("left"); } else toHall(true); }

  // ---------------- the run's HUD (top left), the lobby, the SECRET's card, the result ----------------
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function paintHud(note) {
    if (typeof document === "undefined") return;
    if (!run) { if (hud) { hud.remove(); hud = null; } return; }
    if (!hud) { hud = document.createElement("div"); hud.className = "rq-hud"; hud.setAttribute("data-game-hud", ""); hud.setAttribute("data-no-i18n", ""); document.body.appendChild(hud);
      hud.addEventListener("click", (e) => { if (e.target.closest("[data-leave]")) leave(); }); }
    const V = QV[run.qs[0]], css = run.trio ? "#ff7ab8" : V.css;
    const qline = run.queens.map((q) => `<i style="--rq:${q.V.css}"><b style="width:${Math.max(0, (100 * (q.m && !q.dead ? q.m.hp : 0)) / q.max)}%"></b><u style="left:60%"></u><u style="left:25%"></u><s class="${q.brkT > 0 ? "on" : ""}" style="width:${q.brkT > 0 ? 100 : Math.round((q.brk || 0) * 100)}%"></s><span>${esc(T(q.V.name))}${q.dead ? " ✓" : ` · ${esc(T("Phase {n}", { n: q.phase }))}`}</span></i>`).join("");
    hud.style.setProperty("--rq", css);
    hud.innerHTML = `<div class="rq-hud-in"><small>RAID QUEENS · ${esc(run.isS ? "SECRET" : T(modeOf(run.mode).region))}</small><b>${fmt(run.t)}</b>
      <span>${run.stage === "waves" ? esc(T("Waves · {n} knocked out", { n: run.kills })) + ` <em>${esc(T("She comes in {t}", { t: fmt(Math.max(0, run.plan.waveEnd - run.t)) }))}</em>` + `<p class="rq-wbar"><b style="width:${Math.min(100, (100 * run.t) / run.plan.waveEnd)}%"></b></p>` : esc(note || T("The queen is here!"))}</span>${qline}
      <button type="button" data-leave>${esc(T("Leave"))}</button></div>`;
  }
  let lobby = null;
  function closeLobby() { if (lobby) { lobby.remove(); lobby = null; ctx.freeze(false); } }
  async function openLobby() {
    if (typeof document === "undefined" || lobby || run) return;
    lobby = document.createElement("div"); lobby.className = "rq-lobby"; lobby.setAttribute("role", "dialog"); lobby.setAttribute("data-no-i18n", ""); document.body.appendChild(lobby); ctx.freeze(true);
    lobby.innerHTML = `<div class="rq-lb"><p class="rq-load">…</p></div>`;
    lobby.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"), cr = e.target.closest("[data-chron]"); if (e.target.closest("[data-myth]")) { closeLobby(); ctx.openMythic(); return; }
      if (b && !b.disabled) { start(b.dataset.go); return; } if (cr) { closeLobby(); chronicle(); return; } if (e.target.closest("[data-board]")) { closeLobby(); board("lysitha"); return; } if (e.target.closest(".rq-x") || e.target === lobby) closeLobby(); });
    loadMobs(); for (const M of RQ.MODES) if (!M.trio && ctx.level() >= M.lv) loadQueen(M.id); /* (fetched while you choose, so Enter starts at once) */
    await refreshInfo(); if (lobby) paintLobby();
  }
  /// how hard a run looks from your level against its queen's: Safe (60+ above), Fair (at or above), Hard (below)
  const danger = (M) => { const d = ctx.level() - M.boss; return d >= 60 ? ["Safe", "ok"] : d >= 0 ? ["Fair", "mid"] : ["Hard", "hard"]; };
  /// a run's stars from its best time: ★ cleared, ★★ within two minutes of the fastest it can be, ★★★ within 45 s
  const stars = (M, b) => { const n = !b ? 0 : b <= M.min + 45 ? 3 : b <= M.min + 120 ? 2 : 1; return "★".repeat(n) + "☆".repeat(3 - n); };
  const TRI = { css: "#ff7ab8", name: "THRONE OF THREE", title: "Three crowns. One throne." }; // (the Lv 400 run's card: the three queens)
  function paintLobby() {
    if (!lobby) return; const lv = ctx.level(), d = (info && info.day) || { used: 0, max: RQ.DAY_RUNS }, best = (info && info.best) || {}, clears = (info && info.clears) || {}, gm = ctx.isGM(), left = Math.max(0, d.max - d.used);
    const card = (M) => { const V = QV[M.id] || TRI, lock = lv < M.lv, none = !gm && left <= 0;
      return `<div class="rq-mode${lock ? " lock" : ""}" style="--rq:${V.css}"><img src="${M.trio ? `/images/raid/trinity-page.webp${ctx.ver || ""}` : `/images/raid/${M.id}-full.webp${ctx.ver || ""}`}" alt=""><div><small>${esc(T(M.region))} · Lv ${M.lv}+</small><b>${esc(T(V.name))}</b><em>${esc(T(V.title))}</em>
        <p class="rq-chips"><span class="rq-dg ${danger(M)[1]}">${esc(T(danger(M)[0]))}</span><span class="rq-st">${stars(M, best[M.id])}</span>${CC.DROP[M.id] ? `<span class="rq-my">💠 ${esc(T("Mythic {p}%", { p: +(CC.DROP[M.id].rate * 100).toFixed(1) }))}</span>` : ""}${info && info.firstDone && !info.firstDone.includes(M.id) ? `<span class="rq-1st">🎁 ${esc(T("First win today: ARCL ×1.5 + 1 gear"))}</span>` : ""}</p>
        <ul><li>⚔️ ${esc(T(M.trio ? "Waves, then all three queens at once" : "Waves of Imps, elite Puglins, then the queen"))}</li><li>🎁 XP · ${esc(T(M.item.n > 1 ? "{n} pieces of gear" : "1 piece of gear", { n: M.item.n }))} · ${M.arcl.toLocaleString("en-US")} ARCL</li>${best[M.id] ? `<li>⏱ ${esc(T("Best {t}", { t: fmt(best[M.id]) }))} · ${esc(T("Cleared ×{n}", { n: clears[M.id] || 0 }))}</li>` : ""}</ul>
        <button type="button" data-go="${M.id}" ${lock || none ? "disabled" : ""}>${lock ? "🔒 Lv " + M.lv : none ? esc(T("Back tomorrow")) : esc(T("Enter"))}</button></div></div>`; };
    const S = RQ.SECRET, tk = (info && info.tickets) || 0, slock = lv < S.lv;
    lobby.innerHTML = `<div class="rq-lb"><header><img src="/images/raid/key-sm.webp${ctx.ver || ""}" alt=""><div><small>RAID QUEENS</small><h3>${esc(T("Choose your queen"))}</h3><p>${esc(T("Runs today: {a} / {b}", { a: left, b: d.max }))}${gm ? " · GM" : ""}</p></div><button type="button" class="rq-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="rq-modes">${RQ.MODES.map(card).join("")}
      <div class="rq-mode rq-secret${slock ? " lock" : ""}"><div class="rq-q">?</div><div><small>🔒 SECRET · Lv ${S.lv}+</small><b>??? ${esc(T("SECRET DUNGEON"))}</b><em>${esc(T("Nobody knows what waits inside."))}</em>
        <ul><li>❓ ${esc(T("Only the brave find out"))}</li><li>💎 ${gm ? esc(T("GM · free")) : `${S.PRICE.toLocaleString("en-US")} $ARCIRCLE · ${esc(T("one run"))}`}${tk ? ` · ${esc(T("Tickets: {n}", { n: tk }))}` : ""}</li></ul>
        <button type="button" data-go="secret" ${slock ? "disabled" : ""}>${slock ? "🔒 Lv " + S.lv : esc(T("Enter"))}</button></div></div></div>
      <div class="rq-foot">${ctx.openMythic ? `<button type="button" class="rq-myb" data-myth>👑 ${esc(T("Crimson Celestial"))}</button>` : ""}<button type="button" data-board>🏆 ${esc(T("This week's fastest"))}</button><button type="button" data-chron>📖 ${esc(T("RAID QUEENS CHRONICLE"))}</button></div></div>`;
  }
  // the SECRET's price: a transfer from your wallet to FeeBurn, then the run; a transfer still confirming isn't paid twice
  function payCard() {
    if (typeof document === "undefined" || !info || !info.pay) { ctx.toast(esc(T("Couldn't open it — try again"))); return; }
    const P = info.pay, el = document.createElement("div"); el.className = "rq-lobby rq-paycard"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", "");
    el.innerHTML = `<div class="rq-lb rq-pay"><div class="rq-q big">?</div><small>🔒 SECRET</small><h3>${esc(T("SECRET DUNGEON"))}</h3><p>${esc(T("Nobody knows what waits inside."))}</p>
      <b class="rq-price">${Number(P.price).toLocaleString("en-US")} $ARCIRCLE</b><p class="rq-fine">${esc(T("Sent from your wallet: half is burned, half goes to the treasury. One run."))}</p>
      <div class="rq-acts"><button type="button" data-no>${esc(T("Cancel"))}</button><button type="button" class="rq-go" data-pay>${esc(T("Pay and enter"))}</button></div></div>`;
    document.body.appendChild(el); ctx.freeze(true);
    const close = () => { el.remove(); ctx.freeze(false); };
    el.addEventListener("click", async (e) => {
      if (e.target.closest("[data-no]") || e.target === el) { close(); return; }
      if (!e.target.closest("[data-pay]") || el.dataset.busy) return; el.dataset.busy = "1"; const bt = el.querySelector("[data-pay]");
      const wk = "arc.rq.paid." + ((ctx.sess() || {}).wallet || ""); let tx = ""; try { tx = localStorage.getItem(wk) || ""; } catch { tx = ""; }
      try {
        if (!tx) { bt.textContent = T("Confirm in your wallet…"); const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
          tx = await ctx.tx(P.token, "0xa9059cbb" + pad(P.to) + pad(BigInt(P.amount).toString(16))); try { localStorage.setItem(wk, tx); } catch { /* the server keeps it */ } }
        bt.textContent = T("Waiting for Arc to confirm…");
        let r = null; for (let i = 0; i < 40; i++) { r = await ctx.post({ action: "world-rq-buy", ...ctx.sess(), tx }); if (!r || r.status !== 202) break; await new Promise((ok) => setTimeout(ok, 3000)); }
        if (r && (r.ok || (r.j && /already used/.test(r.j.error || "")))) try { localStorage.removeItem(wk); } catch { /* fine */ }
        if (r && r.status === 202) { ctx.toast(esc(T("Your payment is still confirming on Arc — try again in a minute; it won't charge you twice."))); delete el.dataset.busy; bt.textContent = T("Pay and enter"); return; }
        if (!r || !r.ok) { ctx.toast(esc((r && r.j && r.j.error) ? T(r.j.error) : T("Couldn't open it — try again"))); delete el.dataset.busy; bt.textContent = T("Pay and enter"); return; }
        close(); await refreshInfo(); start("secret");
      } catch (err) { delete el.dataset.busy; bt.textContent = T("Pay and enter"); ctx.toast(esc(err && err.code === 4001 ? T("Cancelled in the wallet") : T("The transfer didn't go through: {e}", { e: String((err && err.message) || err).slice(0, 80) }))); }
    });
  }
  /// a won run's grade: S fast and hardly touched, A fast or careful, B the rest
  function gradeOf(r0, j) { const M = modeOf(r0.mode), lost = (r0.lost || 0) / Math.max(1, r0.maxHp || 1), t = (j && j.t) || 0;
    return t <= M.min + 45 && lost < 1.5 ? "S" : t <= M.min + 120 || lost < 1 ? "A" : "B"; }
  const RC = ["#b8c2cc", "#5fe08a", "#4fa8ff", "#b48cff", "#ffc861"], RN = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  function resultCard(r0, j, won, why) {
    if (typeof document === "undefined") return;
    const V = QV[r0.qs[0]], css = r0.trio ? "#ff7ab8" : V.css, el = document.createElement("div"); el.className = "rq-win"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", css);
    const items = (j && j.items) || [];
    el.innerHTML = `<div class="rq-wcard"><img src="${r0.trio ? `/images/raid/trinity-page.webp${ctx.ver || ""}` : `/images/raid/${r0.qs[0]}-full.webp${ctx.ver || ""}`}" alt=""><div class="rq-wtx"><small>RAID QUEENS · ${esc(r0.isS ? "SECRET" : T(modeOf(r0.mode).region))}</small>
      ${won && j && j.ok ? `<div class="rq-grade g-${gradeOf(r0, j)}">${gradeOf(r0, j)}</div>` : ""}
      <h3>${won ? "👑 " + esc(T("Victory")) : "💀 " + esc(why === "left" ? T("You left the run") : why === "time" ? T("Time's up") : T("Knocked out"))}</h3>
      ${won && j && j.ok ? `<p class="rq-stat">⏱ ${fmt(j.t)}${j.best ? ` · ${esc(T("New best!"))}` : ""} · ${esc(T("{n} knocked out", { n: r0.kills }))}${j.rank ? ` · 🏆 ${esc(T("#{n} this week", { n: j.rank }))}` : ""}</p>${j.first ? `<p class="rq-1st">🎁 ${esc(T("The day's first win: ARCL ×1.5 and one more piece"))}</p>` : ""}
        <div class="rq-gain"><b>+${Number(j.xp || 0).toLocaleString("en-US")}</b><span>XP</span></div>${j.arcl ? `<div class="rq-gain sm"><b>+${Number(j.arcl).toLocaleString("en-US")}</b><span>ARCL</span></div>` : ""}
        ${items.map((it) => `<div class="rq-item" style="--rc:${RC[it.r] || "#ffc861"}"><i></i><span><b>${esc(ctx.itemName(it))}</b><small>${esc(T(RN[it.r] || ""))} · +${it.p} · Lv ${it.lv}</small></span></div>`).join("")}${items.length ? `<p>${esc(T("It's in your bag."))}</p>` : ""}`
        : `<p>${esc(won ? T("Couldn't save the result — try again") : T("Nothing is won this time. Runs left today are on the lobby."))}</p>`}
      <div class="rq-acts">${won && j && j.ok && ctx.brag ? `<button type="button" data-share>📸 ${esc(T("Share"))}</button>` : ""}<button type="button" data-again>${esc(T("Lobby"))}</button><button type="button" class="rq-go" data-home>${esc(T("Back to town"))}</button></div></div></div>`;
    document.body.appendChild(el); ctx.freeze(true);
    el.addEventListener("click", (e) => { if (!e.target.closest("[data-share]")) return; const M = modeOf(r0.mode), name = r0.trio ? T("THRONE OF THREE") : T(V.name);
      ctx.brag({ kind: "raid", tag: "RAID QUEENS · " + (r0.isS ? "SECRET" : T(M.region)), title: name, sub: T("Cleared in {t}", { t: fmt(j.t) }), badge: gradeOf(r0, j), accent: css,
        art: r0.trio ? `/images/raid/trinity-page.webp${ctx.ver || ""}` : `/images/raid/${r0.qs[0]}-full.webp${ctx.ver || ""}`,
        rows: [[T("Time"), fmt(j.t), "⏱"], [T("Knocked out"), String(r0.kills), "⚔️"], [T("XP"), "+" + Number(j.xp || 0).toLocaleString("en-US"), "✨"]],
        text: T("I beat {q} in RAID QUEENS — grade {g}, {t}. ♾️", { q: name, g: gradeOf(r0, j), t: fmt(j.t) }) }); });
    el.addEventListener("click", (e) => { const a = e.target.closest("[data-again]"), h = e.target.closest("[data-home]"); if (!a && !h) return; el.remove(); ctx.freeze(false); const c = ctx.combat(); if (c && c.softUp) c.softUp(); toHall(true); if (a) setTimeout(() => openLobby(), 400); });
    try { if (won && ctx.Snd && ctx.Snd.coin) ctx.Snd.coin(); } catch { /* no sound */ }
    if (won && j && j.mythic && ctx.mythicGot) setTimeout(() => ctx.mythicGot(j.mythic), 900); // (a MYTHIC piece: its own reveal over the card)
  }

  // ---------------- the story: pages, cut-ins, the chronicle (the owner's pictures) ----------------
  const art = (q, k) => `/images/raid/${q}-${k}.webp${ctx.ver || ""}`;
  const seen = () => ls.get(SEEN, []), see = (k) => { const s = seen(); if (!s.includes(k)) { s.push(k); ls.set(SEEN, s); } };
  let pageEl = null;
  function page(k, { onDone, cta } = {}) {
    if (pageEl || typeof document === "undefined") { if (onDone) onDone(); return; } see(k);
    const isQ = !!QV[k], V = QV[k], src = k === "prologue" ? `/images/raid/key.webp${ctx.ver || ""}` : k === "trinity" ? `/images/raid/trinity-page.webp${ctx.ver || ""}` : art(k, "page");
    const lines = k === "prologue" ? PROLOGUE : k === "trinity" ? ["Three crowns. One throne.", "Kneel, if you wish to survive."] : [V.lines[0]];
    const el = document.createElement("div"); el.className = "rq-page" + (k === "prologue" ? " rq-wide" : ""); el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", isQ ? V.css : "#ff7ab8");
    el.innerHTML = `<div class="rq-pin"><div class="rq-scroll"><img src="${src}" alt=""></div>
      <div class="rq-cap"><small>RAID QUEENS${isQ ? " · Lv " + modeOf(k).boss : ""}</small><b>${esc(isQ ? T(V.name) : k === "trinity" ? T("THRONE OF THREE") : T("The Broken Crown"))}</b>${isQ ? `<em>${esc(T(V.title))}</em>` : ""}${lines.map((l) => `<p>${esc(T(l))}</p>`).join("")}
      <div class="rq-acts"><button type="button" class="rq-skip">${esc(T("Skip"))}</button><button type="button" class="rq-go">${esc(T(cta || (onDone ? "Fight!" : "Continue")))}</button></div></div></div>`;
    document.body.appendChild(el); pageEl = el; ctx.freeze(true);
    const sc = el.querySelector(".rq-scroll"), img = el.querySelector("img"); let raf = 0, t0 = 0;
    const roll = (t) => { if (!t0) t0 = t; const max = sc.scrollHeight - sc.clientHeight; if (max > 4 && !el.dataset.user) sc.scrollTop = Math.min(max, ((t - t0) / (ctx.reduce ? 1 : 11000)) * max); if (t - t0 < 11500) raf = requestAnimationFrame(roll); };
    img.addEventListener("load", () => { raf = requestAnimationFrame(roll); });
    sc.addEventListener("pointerdown", () => { el.dataset.user = "1"; }, { passive: true });
    let shut = false; const close = () => { if (shut) return; shut = true; cancelAnimationFrame(raf); el.remove(); pageEl = null; ctx.freeze(false); if (onDone) onDone(); }; /* once: Skip and Fight! tapped together brought the queens twice */
    el.addEventListener("click", (e) => { if (e.target.closest(".rq-skip, .rq-go")) close(); });
  }
  function cutIn(q, i, fall) {
    if (typeof document === "undefined") return;
    document.querySelectorAll(".rq-cin").forEach((x) => x.remove());
    const el = document.createElement("div"); el.className = "rq-cin" + (fall ? " rq-fall" : ""); el.setAttribute("aria-live", "polite"); el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", q.V.css);
    el.innerHTML = `<img src="${art(q.id, "full")}" alt=""><div><small>${esc(fall ? T("DEFEATED") : T("PHASE {n}", { n: i + 1 }))}</small><b>${esc(T(q.V.name))}</b><p>“${esc(T(q.V.lines[Math.min(3, i)]))}”</p></div>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 3200);
    if (!fall && ctx.Snd && ctx.Snd.siren) try { ctx.Snd.siren(); } catch { /* no sound */ }
    if (!fall && ctx.shake) ctx.shake(0.35);
  }
  /// the week's boards: each run's fastest wins (one line a player), and the crews' clears
  async function board(mode) {
    if (typeof document === "undefined") return; document.querySelectorAll(".rq-chron.rq-bd").forEach((x) => x.remove());
    const el = document.createElement("div"); el.className = "rq-chron rq-bd"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); document.body.appendChild(el); ctx.freeze(true);
    const ids = [...RQ.MODES.map((m) => m.id), "secret"], me0 = ((ctx.sess() || {}).wallet || "").toLowerCase();
    const paint = (j) => { const V = QV[mode], css = V ? V.css : "#ff7ab8";
      el.innerHTML = `<div class="rq-cin2" style="--rq:${css}"><header><img src="/images/raid/key-sm.webp${ctx.ver || ""}" alt=""><div><small>RAID QUEENS · ${esc(T("This week"))}</small><h3>${esc(T("This week's fastest"))}</h3><p>${esc(T("The fastest win of each player this week. Monday starts a new week (Seoul)."))}</p></div><button type="button" class="rq-x" aria-label="${esc(T("Close"))}">✕</button></header>
        <div class="rq-tabs">${ids.map((id) => `<button type="button" data-m="${id}" class="${id === mode ? "on" : ""}">${esc(id === "secret" ? "SECRET" : id === "throne" ? T("Throne") : T((QV[id] || {}).name || id).split(" ").pop())}</button>`).join("")}</div>
        <ol class="rq-top">${!j ? `<li class="rq-load">…</li>` : j.top.length ? j.top.map((x, i) => `<li class="${me0 && me0.startsWith(x.w.slice(0, 6).toLowerCase()) && me0.endsWith(x.w.slice(-4).toLowerCase()) ? "me" : ""}"><i>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</i><b>${esc(x.name || x.w)}</b><em>${fmt(x.t)}</em></li>`).join("") : `<li class="rq-empty">${esc(T("Be the first!"))}</li>`}</ol>
        ${j && j.crews && j.crews.length ? `<h4>${esc(T("Crews this week"))}</h4><ol class="rq-top sm">${j.crews.map((c, i) => `<li><i>${i + 1}</i><b>[${esc(c.tag || "")}] ${esc(c.name || "")}</b><em>${esc(T("{n} clears", { n: c.n }))}</em></li>`).join("")}</ol>` : ""}
        <div class="rq-foot"><button type="button" class="go" data-lobby>${esc(T("Lobby"))}</button></div></div>`; };
    paint(null); const load0 = async () => { try { const r = await fetch("/api/social?world=rq-top&mode=" + mode, { cache: "no-store" }); paint(r.ok ? await r.json() : { top: [] }); } catch { paint({ top: [] }); } }; load0();
    el.addEventListener("click", (e) => { const m = e.target.closest("[data-m]"); if (m) { mode = m.dataset.m; paint(null); load0(); return; }
      if (e.target.closest("[data-lobby]")) { el.remove(); ctx.freeze(false); openLobby(); return; }
      if (e.target === el || e.target.closest(".rq-x")) { el.remove(); ctx.freeze(false); } });
  }
  function chronicle() {
    if (typeof document === "undefined" || document.querySelector(".rq-chron")) return;
    const s = seen(), clears = (info && info.clears) || {};
    const el = document.createElement("div"); el.className = "rq-chron"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", "");
    const qrow = (M) => { const V = QV[M.id]; return `<div class="rq-qrow" style="--rq:${V.css}"><img src="${art(M.id, "full")}" alt=""><span><small>${esc(T(M.region))} · Lv ${M.lv}+</small><b>${esc(T(V.name))}</b><em>${esc(T(V.title))}</em><i>${esc(T("Cleared ×{n}", { n: clears[M.id] || 0 }))}</i></span>
      <span class="rq-qb">${s.includes(M.id) ? `<button type="button" data-page="${M.id}">${esc(T("Story"))}</button>` : `<button type="button" disabled>🔒</button>`}</span></div>`; };
    el.innerHTML = `<div class="rq-cin2"><header><img src="/images/raid/key-sm.webp${ctx.ver || ""}" alt=""><div><small>${esc(T("RAID QUEENS CHRONICLE"))}</small><h3>${esc(T("The Broken Crown"))}</h3><p>${esc(T("A new hunting ground for Lv 100+. Three queens — and the Throne of Three."))}</p></div><button type="button" class="rq-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="rq-list">${RQ.MODES.filter((M) => !M.trio).map(qrow).join("")}<div class="rq-qrow rq-tri" style="--rq:#ff7ab8"><img src="/images/raid/trinity-page.webp${ctx.ver || ""}" alt=""><span><small>SECRET</small><b>???</b><i>${s.includes("trinity") ? esc(T("Cleared ×{n}", { n: clears.secret || 0 })) : esc(T("Nobody knows what waits inside."))}</i></span><span class="rq-qb">${s.includes("trinity") ? `<button type="button" data-page="trinity">${esc(T("Story"))}</button>` : `<button type="button" disabled>🔒</button>`}</span></div></div>
      <div class="rq-foot"><button type="button" data-page="prologue">${esc(T("Prologue"))}</button><button type="button" class="go" data-lobby>${esc(T("Lobby"))}</button></div></div>`;
    document.body.appendChild(el); ctx.freeze(true);
    const close = () => { el.remove(); ctx.freeze(false); };
    el.addEventListener("click", (e) => { const p = e.target.closest("[data-page]");
      if (p) { close(); page(p.dataset.page, { cta: "Close" }); return; }
      if (e.target.closest("[data-lobby]")) { close(); openLobby(); return; }
      if (e.target === el || e.target.closest(".rq-x")) close(); });
    refreshInfo();
  }

  // ---------------- each frame ----------------
  let shown = false;
  function show(on) { on = !!on; if (on === shown) return; shown = on; vis(); }
  const cw = new V3();
  function tick(dt, t) {
    if (g.visible && ctx.cam && !(crysT > 0)) { const cp = ctx.cam(); if (cp) for (const c of crys) { c.getWorldPosition(cw); c.visible = Math.hypot(cw.x - cp.x, cw.z - cp.z) > 7; } }
    if (shown) for (const f of spins) f(dt, t);
    if (!run || run.done) return;
    ctx.here(me); const c = ctx.combat();
    if (c && c.vitals && c.vitals().down) { lose("ko"); return; }
    if (pageEl || !ctx.active()) return; // (a window open: the clock waits)
    run.t += dt;
    if (c && c.vitals) { const v = c.vitals(); if (run.hp0 != null && v.hp < run.hp0) run.lost += run.hp0 - v.hp; run.hp0 = v.hp; run.maxHp = v.max; } /* (for the grade) */
    if (run.t > TIME_LIMIT) { lose("time"); return; }
    fxTick(dt); risesTick(dt); zonesTick(dt); beamTick(dt);
    if (crysT > 0 && (crysT -= dt) <= 0) for (const c0 of crys) c0.visible = true;
    if (flare > 0) { flare = Math.max(0, flare - dt * 1.4); floorM.emissiveIntensity = floorBase + flare * 0.9; }
    if (c && c.vitals) { const v = c.vitals(), low = v.hp / Math.max(1, v.max) < 0.3 && !v.down; if (typeof document !== "undefined") document.body.classList.toggle("rq-low", low); if (low && ctx.Snd && ctx.Snd.svHeart) try { ctx.Snd.svHeart(); } catch { /* no sound */ } }
    if (run.stage === "waves") { mobTick(dt); if (run.t >= run.plan.waveEnd) queensIn(); }
    else for (const q of run.queens) { if (q.corpse) { q.e.mixer.update(dt); if (performance.now() - q.corpse.t0 > 4200 && q.e.obj.parent === g) { g.remove(q.e.obj); q.corpse = null; } } else queenTick(q, dt); }
    if ((run.hudT = (run.hudT || 0) - dt) <= 0) { run.hudT = 0.25; paintHud(); }
    // the arena's edge: back inside
    const dx = me.x - land.x, dz = me.z - land.z, d = Math.hypot(dx, dz); if (d > ARENA_R - 0.6) ctx.stand(land.x + (dx / d) * (ARENA_R - 1.2), land.z + (dz / d) * (ARENA_R - 1.2), { x: land.x, z: land.z });
  }
  return {
    group: g, hall: H, door, back, solids, toHall, arrival: () => ({ x: land.x, z: land.z + HALL.start, c: { x: land.x, z: land.z + HALL.door } }), loadHall, tick, show, openLobby, chronicle, board, page, start, leave, loadMobs,
    shown: () => shown, running: () => !!run && !run.done, info: () => info, refreshInfo,
    /// for the minimap: the queens in the arena
    marks: () => (run ? run.queens.filter((q) => q.m && !q.dead).map((q) => ({ g: q.m.g, css: q.V.css, s: 8, ch: "♛" })) : []),
    /// tests: the run's state, the queens' and mobs' running clips
    debug: () => (run ? { mode: run.mode, stage: run.stage, t: Math.round(run.t), kills: run.kills, mobs: run.mobs.length, kinds: run.mobs.map((m) => m.e.kind),
      mobClips: run.mobs.map((m) => (m.e.mixer._actions || []).filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name).join("+")),
      queens: run.queens.map((q) => ({ id: q.id, hp: q.m ? Math.round(q.m.hp) : 0, max: q.max, phase: q.phase, clip: q.e.cur, dead: q.dead })) } : null),
    testSkip: (sec) => { if (run) run.t = sec; },
    testHit: (frac) => { if (!run) return; for (const q of run.queens) if (q.m && !q.dead) { q.m.hp = Math.max(1, q.m.max * frac); onQueenHit(q, q.m); } },
    testCut: (id, i = 1) => cutIn({ id, V: QV[id] }, i, false),
    testResult: (won = true) => resultCard({ qs: ["lysitha"], mode: "lysitha", isS: false, kills: 23 }, won ? { ok: true, t: 214, best: true, xp: 90720, arcl: 2000, items: [{ id: "rqtest", b: "weapon-4", r: 3, lv: 160, p: 3 }] } : null, won, "ko"),
  };
}
