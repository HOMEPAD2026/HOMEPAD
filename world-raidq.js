// world-raidq.js — RAID QUEENS (the owner's design, 2026-10-24): the high levels' land (Lv 100–500), reached through the
// Crimson Eternity Citadel in town (world-play.js rqGate). Like Nexus City it lies on the same ground far off (LANDS.rq,
// 2.4 km north), so your hero, chat and other players work here as in town; its group is shown only while you're in it.
//   the Throne of Three   the middle: the Citadel again, sealed (Lv 400+, the three queens together — not open yet)
//   three regions         Silver Sanctum (west, Lv 100–200, CELESTIAL LYSITHA) · Golden Dominion (north, Lv 200–300,
//                         RADIANT SOLVIRA) · Crimson Abyss (east, Lv 300–400, CRIMSON NYXARA). Each: a gate facing the
//                         Throne (below its level you can't pass), Imps (Puglins as elites) in the region's colours, the
//                         queen on her dais at the far side
//   the queens            the owner's Meshy GLBs (models/world/raid), bosses of the town's combat (world-combat.js spawnExt).
//                         Their HP is everyone's (api/_world-raidq.mjs, like the Pumpkin Kings); phases at 60 % and 25 %
//                         (more patterns, harder hits, a cut-in with her line); Nyxara grows stronger the longer you fight.
//                         She falls when the server says so and is back 20 minutes later
//   the monsters          Imp and Puglin (UE mannequin rigs with no clips): KayKit moves laid on their bones (K.borrowMoves)
//   the story             still pictures, the owner's: a prologue on the first visit, each queen's page when you first meet
//                         her (once a Seoul day after), a cut-in at each phase, the reward card; the RAID QUEENS CHRONICLE
//                         (Menu) shows them again, with your clears
import { RQ, phaseOf, queenOf, regionOf } from "./world-raidq-data.js";
export { RQ };

const rad = (d) => (d * Math.PI) / 180;
const polar = (a, r) => [Math.sin(rad(a)) * r, Math.cos(rad(a)) * r]; // a = 0 is south (+z, the way in), 180 north
export const PLACES = { silver: { a: 270, r: 56, R: 26 }, golden: { a: 180, r: 56, R: 26 }, crimson: { a: 90, r: 56, R: 26 } };
export const THRONE_R = 12;
const MOB = { imp: { glb: "imp", h: 1.9, name: "Crown Imp" }, puglin: { glb: "puglin", h: 2.5, name: "Puglin Brute" } };
const POW = { silver: 2.0, golden: 2.4, crimson: 2.8 }, MOBS_N = 5;
// each queen: her file, height, colours, the clips by her file's names (listed from the GLBs: see the header of each
// below), her patterns by phase, her lines
export const QV = {
  lysitha: { glb: "queen-lysitha", h: 3.4, tint: 0x9fd4ff, css: "#9fd4ff", idle: ["Idle_02", "Long_Breathe_and_Look_Around"], walk: "Walking", run: "Running", atk: ["Attack", "Right_Hand_Sword_Slash"], die: "Dead", hit: "", taunt: "Long_Breathe_and_Look_Around",
    pats: [["slam", "rain"], ["slam", "rain", "cone"], ["slam", "rain", "cone", "line"]],
    lines: ["You've come… just as I expected.", "Is it power? Freedom? Or… my attention?", "Now, the real battle begins.", "How precious… you've earned a glimpse of the stars."] },
  solvira: { glb: "queen-solvira", h: 3.5, tint: 0xffc861, css: "#ffd36a", idle: ["Idle_02"], walk: "Walking", run: "Running", atk: ["Attack", "Weapon_Combo_1", "Flying_Fist_Kick", "Simple_Kick"], die: "Fall_Dead_from_Abdominal_Injury", hit: "Head_Hold_in_Pain", taunt: "Neck_Slashing_Gesture",
    pats: [["slam", "line"], ["slam", "line", "cone"], ["slam", "line", "cone", "rain"]],
    lines: ["You've come this far… How adorable.", "Kneel before the sun.", "Burn in my radiance!", "The sun… sets… for now."] },
  nyxara: { glb: "queen-nyxara", h: 3.6, tint: 0xff3d5a, css: "#ff4d6d", idle: ["Idle_03", "Idle_02"], walk: "Walking", run: "Running", atk: ["Axe_Spin_Attack", "Double_Blade_Spin", "Jump_and_Slam_Back_Down", "Right_Hand_Sword_Slash"], die: "Fall_Dead_from_Abdominal_Injury", hit: "", taunt: "Stand_Talking_Angry", arise: "Arise",
    pats: [["slam", "cone", "line"], ["slam", "cone", "line", "rain"], ["slam", "cone", "line", "rain"]], ramp: true,
    lines: ["Kneel, if you wish to survive.", "Beauty that devours. Power that rules.", "This is not the end. This is only the beginning.", "…only the beginning."] },
};
export const PROLOGUE = ["Long ago, the Eternal Crown kept the three realms in balance.", "It broke — and from its shards rose three queens.", "Win back the crown's fragments, queen by queen. Then face the Throne of Three."];
const dayKey = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* this visit */ } } };
const SEEN = "arc.rq.seen", MET = "arc.rq.met", GOT = "arc.rq.got";

/// ctx: { THREE, K, planet, T, esc, toast, Snd, ver, low, reduce, coarse, land: { x, z, r }, combat(), here(v), level(),
///        sess(), post(b), addItem(it), refresh(), itemName(it), parts?, shake?(n), stand(x, z, c), freeze(on), compile?(list), active() }
export function makeRaidQueens(ctx) {
  const { THREE, K, planet, T, esc, land } = ctx, V3 = THREE.Vector3;
  const g = new THREE.Group(); g.name = "land-rq"; g.position.set(land.x, 0, land.z); g.visible = false; planet.add(g);
  const spins = [], solids = [], me = new V3(), tmp = new V3();
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.35, ...o });
  const glow = (c, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.3, metalness: 0.2 });
  const neon = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  const flat = (geo, mat, y, parent = g) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; parent.add(m); return m; };
  const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const W = (lx, lz) => ({ x: land.x + lx, z: land.z + lz }); // land → planet coordinates
  const load = (u) => new Promise((res, rej) => K.gltfLoader().load(u + (ctx.ver || ""), res, undefined, rej));

  // ---------------- the ground: dark stone, a pale road from the way in to the Throne and from it to each gate ----------------
  flat(new THREE.CircleGeometry(land.r + 60, 96), std(0x2a2433, { roughness: 0.85, metalness: 0.1 }), 0.01);
  flat(new THREE.RingGeometry(land.r - 0.25, land.r + 0.25, 160), neon(0xff7ab8, 0.8), 0.06);
  const road = std(0xcfc6d8, { roughness: 0.6, metalness: 0.2, ...off });
  { const r0 = THRONE_R + 2, m = flat(new THREE.PlaneGeometry(7, land.r - r0 - 6), road, 0.03); m.position.z = (land.r + r0 - 6) / 2; }
  for (const [id, P] of Object.entries(PLACES)) { const len = P.r - P.R - THRONE_R - 2, [x, z] = polar(P.a, THRONE_R + 2 + len / 2), m = flat(new THREE.PlaneGeometry(5, len), road, 0.03); m.position.set(x, 0.03, z); m.rotation.z = -rad(P.a); m.userData.r = id; }
  flat(new THREE.CircleGeometry(THRONE_R + 4, 64), std(0x3a2c44, { roughness: 0.5, metalness: 0.4, emissive: 0x2a0a1a, emissiveIntensity: 0.5, ...off }), 0.035);
  flat(new THREE.RingGeometry(THRONE_R + 3.7, THRONE_R + 4, 96), neon(0xff4d8d, 0.9), 0.07);

  // ---------------- the Throne of Three: the Citadel (sealed), a barrier ring, its sign ----------------
  const throne = new THREE.Group(); throne.name = "rq-throne"; g.add(throne); throne.userData.radius = THRONE_R; solids.push(throne);
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(THRONE_R, THRONE_R + 0.6, 0.6, 64), std(0x1a1222, { metalness: 0.6, roughness: 0.35, emissive: 0x3a0a1e, emissiveIntensity: 0.5 })); base.position.y = 0.3; throne.add(base);
    const stand = new THREE.Mesh(new THREE.ConeGeometry(4, 18, 6), std(0x2a1830, { emissive: 0x7a1030, emissiveIntensity: 0.4 })); stand.position.y = 9.4; stand.name = "rq-standin"; throne.add(stand); throne.userData.stand = stand;
    const veil = new THREE.Mesh(new THREE.CylinderGeometry(THRONE_R + 0.3, THRONE_R + 0.3, 7, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4d8d, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); veil.position.y = 3.6; throne.add(veil);
    const tag = K.label(T("THRONE OF THREE"), { accent: "#ff7ab8", size: 0.95, sub: T("Lv 400+ · Sealed") }); tag.position.y = 24; throne.add(tag);
    spins.push((dt, t) => { veil.material.opacity = 0.1 + Math.sin(t * 1.6) * 0.05; }); }
  // the back portal, to the side of the way in
  const back = K.makePortal(T("Back to town")); back.name = "land-back"; back.userData.radius = 1.6; back.userData.to = "town"; spins.push(...back.userData.spin);
  { const [x, z] = polar(0, land.r - 14); back.position.set(x - 8, 0, z); back.rotation.y = Math.PI; g.add(back); }

  // ---------------- the regions ----------------
  const regions = {};
  for (const R0 of RQ.REGIONS) {
    const P = PLACES[R0.id]; if (!P) continue;
    const col = new THREE.Color(R0.css).getHex(), rg = new THREE.Group(); rg.name = "rq-" + R0.id; const [cx, cz] = polar(P.a, P.r); rg.position.set(cx, 0, cz); g.add(rg);
    const ground = { silver: 0x8f9fb8, golden: 0x8a7444, crimson: 0x4a1a24 }[R0.id];
    flat(new THREE.CircleGeometry(P.R, 72), std(ground, { roughness: 0.55, metalness: 0.3, emissive: col, emissiveIntensity: 0.06, ...off }), 0.04, rg);
    flat(new THREE.RingGeometry(P.R - 0.35, P.R, 120), neon(col, 0.9), 0.08, rg);
    // the dais at the far side, a halo over it
    const [dx, dz] = polar(P.a, P.R * 0.55), dais = new THREE.Group(); dais.position.set(dx, 0, dz); rg.add(dais);
    for (let k = 0; k < 3; k++) { const st0 = new THREE.Mesh(new THREE.CylinderGeometry(4.6 - k * 1.1, 4.9 - k * 1.1, 0.35, 40), std(k === 2 ? col : 0x2a2433, { metalness: 0.6, roughness: 0.3, emissive: col, emissiveIntensity: k === 2 ? 0.5 : 0.08 })); st0.position.y = 0.17 + k * 0.35; dais.add(st0); }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 64), neon(col)); halo.position.y = 6.5; dais.add(halo);
    spins.push((dt, t) => { halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.25; halo.rotation.z = t * 0.6; halo.position.y = 6.5 + Math.sin(t * 1.3) * 0.25; });
    // crystal spires round the edge (fewer with low graphics)
    const n = ctx.low ? 6 : 12, crys = glow(col, 1.1);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + 0.2, d = P.R - 1.6 - (k % 2) * 1.4, h = 3 + ((k * 7) % 5) * 0.8;
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crys); sp.scale.set(0.7, h, 0.7); sp.position.set(Math.cos(a) * d, h * 0.9, Math.sin(a) * d); sp.rotation.y = a; rg.add(sp);
      if (!ctx.low && k % 3 === 0) { const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crys); const y0 = h * 2 + 1.5; fl.position.set(sp.position.x, y0, sp.position.z); rg.add(fl); spins.push((dt, t) => { fl.position.y = y0 + Math.sin(t * 1.2 + k) * 0.5; fl.rotation.y = t + k; }); } }
    // the gate facing the Throne: two pillars, an arch, the name and the levels
    const [gx, gz] = polar(P.a, -(P.R - 0.5)), gate = new THREE.Group(); gate.position.set(gx, 0, gz); gate.rotation.y = rad(P.a); rg.add(gate);
    const pil = std(0xe8e2f0, { metalness: 0.5, roughness: 0.3 }), goldM = std(0xffc861, { metalness: 0.9, roughness: 0.25, emissive: 0x6a4200, emissiveIntensity: 0.3 });
    for (const s of [-1, 1]) { const p0 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 1.2), pil); p0.position.set(s * 4, 4, 0); gate.add(p0); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 4), goldM); cap.position.set(s * 4, 8.9, 0); gate.add(cap); solids.push(Object.assign(p0, { userData: { radius: 0.9 } })); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 8, 40, Math.PI), goldM); arch.position.y = 8; gate.add(arch);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), glow(col, 2)); gem.position.y = 12.3; gate.add(gem); spins.push((dt, t) => { gem.rotation.y = t * 1.5; });
    const tag = K.label(T(R0.name), { accent: R0.css, size: 0.8, sub: R0.soon ? T("Coming soon") : T("Lv {a}–{b}", { a: R0.lv[0], b: R0.lv[1] }) }); tag.position.y = 14; gate.add(tag);
    const Q = queenOf(R0.queen), V = QV[R0.queen];
    const qtag = K.label(T(Q.name), { accent: V.css, size: 0.7, sub: T(Q.title) }); qtag.position.y = 8.6; dais.add(qtag);
    const wc = W(cx, cz), wd = W(cx + dx, cz + dz);
    regions[R0.id] = { id: R0.id, R0, P, Q, V, g: rg, dais, qtag, c: { x: wc.x, z: wc.z }, d: { x: wd.x, z: wd.z }, gate,
      zone: { id: "rq-" + R0.id, name: T(R0.name), x: wc.x, z: wc.z, r: P.R - 0.5, lv: R0.lv, pow: POW[R0.id], claimTier: 4, mobs: [] },
      mobs: [], m: null, ent: null, src: null, srcP: null, tagKey: "", corpse: null, phase: 1, cyc: -1, base: 0, fightT: 0 };
  }
  // the region the point (planet coords) is in, or null
  const regionAt = (x, z) => { for (const r of Object.values(regions)) if (Math.hypot(x - r.c.x, z - r.c.z) < r.P.R) return r; return null; };

  // ---------------- the Citadel models (the Throne's and, from world-play.js, the town's gate): the owner's GLB ----------------
  let citP = null;
  function loadModels() {
    if (citP) return citP;
    citP = load("/models/world/raid/gate.glb").then((gl) => {
      const o = gl.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new V3()), k = 20 / (sz.y || 1);
      o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.6 - box.min.y * k, -(box.min.z + sz.z / 2) * k);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = !ctx.low; m.receiveShadow = false; } });
      throne.add(o); throne.userData.stand.visible = false; throne.userData.model = o; return o;
    }).catch((e) => { console.warn("raid throne", e); citP = null; return null; });
    return citP;
  }

  // ---------------- the monsters: Imp and Puglin, the KayKit moves on their bones, the region's colours ----------------
  const msrc = {}, mclips = {}, mtex = {};
  let mobsP = null;
  function loadMobs() {
    if (mobsP) return mobsP;
    mobsP = Promise.all(Object.entries(MOB).map(async ([k, M]) => { const gl = await load(`/models/world/raid/${M.glb}.glb`); msrc[k] = gl; mclips[k] = await K.borrowMoves(gl, K.KK_MONSTER, ctx.ver || ""); }))
      .then(() => true).catch((e) => { console.warn("raid monsters", e); mobsP = null; return false; });
    return mobsP;
  }
  const texOf = (kind, skin) => { const key = kind + "-" + skin; if (mtex[key] !== undefined) return mtex[key]; mtex[key] = null;
    new THREE.TextureLoader().load(`/models/world/raid/tex/${key}.webp${ctx.ver || ""}`, (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mtex[key] = t; for (const r of Object.values(regions)) for (const m of r.mobs) if (m.e && m.e.kind === kind && m.e.skin === skin) m.e.paint(t); }, undefined, () => {});
    return null; };
  function mobEnt(kind, skin) {
    const src = msrc[kind], clips = mclips[kind] || {}; if (!src) return null;
    const o = K.skelClone(src.scene), box = new THREE.Box3().setFromObject(o), sz = box.max.y - box.min.y || 1, inner = new THREE.Group(); inner.add(o);
    o.scale.setScalar(1 / sz); o.position.y = -box.min.y / sz; // a body 1 tall: the combat scales it to its height
    const mats = []; o.traverse((x) => { if (!x.isMesh) return; x.castShadow = false; x.frustumCulled = false; x.material = x.material.clone(); mats.push(x.material); });
    const mix = new THREE.AnimationMixer(o), acts = {}; for (const [n, c] of Object.entries(clips)) acts[n] = mix.clipAction(c);
    let cur = null, once = null;
    const loop = (n) => { const a = acts[n] || acts.run || acts.walk; if (!a || (cur === a && !once)) return; a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); if (cur && cur !== a) cur.crossFadeTo(a, 0.2, false); cur = a; };
    mix.addEventListener("finished", (ev) => { if (ev.action === once) { once = null; const a = acts.run; if (a) { a.reset().play(); ev.action.crossFadeTo(a, 0.15, false); cur = a; } } });
    const e = { obj: inner, mixer: mix, own: true, kind, skin,
      paint(t) { for (const mt of mats) { mt.map = t; mt.needsUpdate = true; } },
      play(name, o2 = {}) { const n = name === "Attack" ? (Math.random() < 0.35 && acts.attack2 ? "attack2" : "attack") : name === "Hit" ? "hit" : name === "Run" ? "run" : String(name).toLowerCase();
        const a = acts[n]; if (!a) return; if (!o2.once) { if (!once) loop(n); return; }
        if (once && n === "hit") return; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.timeScale = n === "hit" ? 1.4 : 1.15; a.play(); if (cur && cur !== a) cur.crossFadeTo(a, o2.fade ?? 0.08, false); cur = a; once = a; } };
    const t0 = texOf(kind, skin); if (t0) e.paint(t0);
    loop("run"); return e;
  }
  function mobTick(r, dt) {
    const c = ctx.combat(); if (!c || !c.spawnOwn || !msrc.imp) return;
    const raw = c.mobsRaw(); r.mobs = r.mobs.filter((m) => !m.dead && raw.includes(m));
    if ((r.spawnT = (r.spawnT || 0) - dt) > 0 || r.mobs.length >= MOBS_N) return; r.spawnT = 2.2 + Math.random() * 1.6;
    const lv0 = r.R0.lv[0], lv1 = r.R0.lv[1] - 1, my = ctx.level(), base = Math.max(lv0, Math.min(lv1, my)), lv = Math.max(lv0, Math.min(lv1, base - 3 + Math.floor(Math.random() * 6)));
    const elite = Math.random() < 0.2, kind = elite ? "puglin" : "imp", e = mobEnt(kind, r.R0.skin); if (!e) return;
    // somewhere in the region, not on top of you or her dais
    let at = null; for (let k = 0; k < 10 && !at; k++) { const a = Math.random() * Math.PI * 2, d = Math.random() * (r.P.R - 4), p = new V3(r.c.x + Math.cos(a) * d, 0, r.c.z + Math.sin(a) * d); if (Math.hypot(p.x - me.x, p.z - me.z) > 9 && Math.hypot(p.x - r.d.x, p.z - r.d.z) > 7) at = p; }
    if (!at) return;
    const m = c.spawnOwn({ ent: e, at, lv, rank: elite ? "elite" : "", zone: r.zone, scale: MOB[kind].h, y: 0, name: T(MOB[kind].name), color: r.R0.css });
    if (m) r.mobs.push(m);
  }

  // ---------------- the queens ----------------
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
  function queenEnt(r) {
    const b = rig(r.src, r.V.tint), V = r.V;
    const e = { ...b, keep: true, own: true,
      play(name) { if (e.onceT > 0) return; if (name === "Attack") playOn(e, V.atk[Math.floor(Math.random() * V.atk.length)], { once: true, fade: 0.1, speed: 1.1 }); else if (name === "Hit" && V.hit && Math.random() < 0.12) playOn(e, V.hit, { once: true, fade: 0.08, speed: 1.3 }); } };
    playOn(e, V.idle[0], { fade: 0 }); return e;
  }
  let view = null, viewAt = 0, polling = false, sentAt = 0, said = {};
  const pend = {};
  function wake(r) {
    const c = ctx.combat(); if (!c || !c.spawnExt || r.m || !r.src) return;
    const s = view && view.queens.find((x) => x.id === r.Q.id); if (!s || s.down) return;
    const e = queenEnt(r), at = new V3(r.d.x, 0, r.d.z);
    const m = c.spawnExt({ ent: e, at, lv: r.Q.lv, max: s.max, hp: Math.max(1, s.hp - (pend[r.Q.id] || 0)), home: { x: r.c.x, z: r.c.z, r: r.P.R - 2 }, pats: r.V.pats[s.phase - 1], atkK: 1.1,
      boss: { name: T(r.Q.name), scale: r.V.h, y: 0, tint: r.V.tint }, ext: { hit: (mm, dmg) => onHit(r, dmg), down: (mm) => fell(r, mm) } });
    if (!m) return; r.m = m; r.ent = e; r.base = m.atk; r.phase = s.phase; r.cyc = s.cyc; r.fightT = 0; r.lastP = at.clone();
    if (r.V.arise) playOn(e, r.V.arise, { once: true, fade: 0 });
    r.dais.visible = true; burst(at, r.V.tint, true);
  }
  function sleepQ(r) { const c = ctx.combat(); if (r.m && c && c.extGone) c.extGone(r.m); r.m = null; r.ent = null; }
  function queenTick(r, dt) {
    const m = r.m, e = r.ent; if (!m || !e) return;
    const p = m.g.position, sp = r.lastP ? Math.hypot(p.x - r.lastP.x, p.z - r.lastP.z) / Math.max(1e-3, dt) : 0; (r.lastP || (r.lastP = new V3())).copy(p);
    r.spS = (r.spS || 0) + (sp - (r.spS || 0)) * Math.min(1, dt * 8);
    if (e.onceT > 0) e.onceT -= dt;
    else if (r.spS > 3.2) playOn(e, r.V.run, { speed: Math.max(0.8, r.spS / 4.4) });
    else if (r.spS > 0.35) playOn(e, r.V.walk, { speed: Math.max(0.8, r.spS / 1.5) });
    else playOn(e, r.V.idle[Math.floor(performance.now() / 9000) % r.V.idle.length], { fade: 0.35 });
    e.mixer.update(dt);
    // Nyxara: the longer the fight, the harder she hits (+4 % every 30 s, up to +60 %)
    const d = Math.hypot(me.x - p.x, me.z - p.z); if (d < 20) r.fightT += dt;
    const k = (1 + 0.15 * (r.phase - 1)) * (r.V.ramp ? 1 + Math.min(0.6, Math.floor(r.fightT / 30) * 0.04) : 1); m.atk = Math.round(r.base * k);
    if (ctx.parts && !ctx.low && !ctx.reduce && (r.emT = (r.emT || 0) - dt) <= 0 && d < 40) { r.emT = 0.2; ctx.parts.emit({ at: tmp.copy(p).setY(r.V.h * 0.75), kind: "glow", n: 2, speed: 0.7, up: 2, spread: 0.5, size: 0.38, life: 0.9, grav: -3, color: r.V.tint, color2: 0xffffff, jitter: 0.3 }); }
  }
  function fell(r, m) {
    const e = r.ent; r.m = null; r.ent = null; if (!e) return;
    const wp = m.g.position.clone(); m.g.remove(e.obj); e.obj.position.copy(wp).sub(g.position).setY(0); e.obj.rotation.y = m.g.rotation.y; e.obj.scale.setScalar(r.V.h); g.add(e.obj);
    playOn(e, r.V.die, { once: true, fade: 0.1 }); r.corpse = { e, t0: performance.now() };
    cutIn(r, 3, true); ctx.toast(esc(T("{x} has fallen! Everyone who fought shares her reward.", { x: T(r.Q.name) })));
    setTimeout(() => poll(true), 1500);
  }
  function corpseTick(r, dt) { const c = r.corpse; if (!c) return; c.e.mixer.update(dt); if (performance.now() - c.t0 > 4200) { g.remove(c.e.obj); c.e.obj.traverse((x) => { if (x.isMesh && x.material) x.material.dispose(); }); r.corpse = null; burst(new V3(r.d.x, 0, r.d.z), r.V.tint, false); } }
  function burst(at, col, big) {
    if (Math.hypot(me.x - at.x, me.z - at.z) > 70) return;
    if (ctx.parts) { ctx.parts.emit({ at: tmp.copy(at).setY(2), kind: "glow", n: big ? 50 : 20, speed: big ? 7 : 3, up: 3, spread: 1.2, size: 0.6, life: 1.1, grav: -2, color: col, color2: 0xffffff, jitter: 0.5 }); }
    if (big) { if (ctx.shake) ctx.shake(0.45); if (ctx.Snd && ctx.Snd.roar) ctx.Snd.roar(); }
  }
  // her tag on the dais: her HP and phase, or when she's back
  function paintTag(r) {
    const s = view && view.queens.find((x) => x.id === r.Q.id); if (!s) return;
    const sub = s.down ? (s.back ? T("Returns in {t}", { t: left(s.back - Date.now()) }) : T("Defeated")) : `Lv ${r.Q.lv} · ${Math.ceil((100 * s.hp) / s.max)}% · ${T("Phase {n}", { n: s.phase })}`;
    const key = sub; if (r.tagKey === key) return; r.tagKey = key;
    r.dais.remove(r.qtag); if (r.qtag.material) { if (r.qtag.material.map) r.qtag.material.map.dispose(); r.qtag.material.dispose(); }
    r.qtag = K.label(T(r.Q.name), { accent: r.V.css, size: 0.7, sub }); r.qtag.position.y = r.m ? r.V.h + 5.5 : 8.6; r.dais.add(r.qtag);
  }
  const left = (ms) => { ms = Math.max(0, ms); const m = Math.floor(ms / 6e4), s = Math.floor((ms % 6e4) / 1000); return `${m}:${String(s).padStart(2, "0")}`; };

  // ---------------- the server: everyone's HP, your damage every 5 s, the shares ----------------
  function onHit(r, dmg) {
    if (!ctx.sess()) { if (!said.guest) { said.guest = 1; ctx.toast(esc(T("Sign in with a wallet so your hits on the Raid Queens count"))); } return; }
    if (ctx.level() < r.Q.lv) { if (!said["lv" + r.Q.id]) { said["lv" + r.Q.id] = 1; ctx.toast(esc(T("{x} is for level {n}+ — your hits won't count", { x: T(r.Q.name), n: r.Q.lv }))); } return; }
    pend[r.Q.id] = Math.min(RQ.CAP_K * ctx.level() * 3, (pend[r.Q.id] || 0) + dmg);
  }
  async function flush() {
    const s = ctx.sess(); if (!s || Date.now() - sentAt < RQ.GAP * 1000 + 150) return;
    const id = Object.keys(pend).filter((x) => pend[x] > 0).sort((a, b) => pend[b] - pend[a])[0]; if (!id) return;
    const n = Math.round(pend[id]); pend[id] = 0; sentAt = Date.now();
    try { const r = await ctx.post({ action: "world-rq-hit", ...s, queen: id, dmg: n }); if (r && r.ok && r.j && r.j.queens) apply(r.j); else if (r && r.status === 429) pend[id] = (pend[id] || 0) + n; else if (r && r.status === 403) said["lv" + id] = 1; }
    catch { pend[id] = (pend[id] || 0) + n; }
  }
  async function poll(force) {
    if (polling) return; const r = regionAt(me.x, me.z), gap = r && r.m ? 5000 : 20000;
    if (!force && Date.now() - viewAt < gap) return; polling = true; viewAt = Date.now();
    try { const s = ctx.sess(); const res = await fetch("/api/social?world=rq" + (s ? "&wallet=" + s.wallet : ""), { cache: "no-store" }); if (res.ok) apply(await res.json()); } catch { /* the next time */ } finally { polling = false; }
  }
  function apply(j) {
    if (!j || !j.queens) return; view = j;
    for (const s of j.queens) { const r = Object.values(regions).find((x) => x.Q.id === s.id); if (!r) continue;
      const c = ctx.combat();
      if (r.m && c) { if (s.down || s.cyc !== r.cyc) c.extDown(r.m); else { c.extSet(r.m, Math.max(1, s.hp - (pend[s.id] || 0))); if (s.phase > r.phase) { r.phase = s.phase; r.m.pats = r.V.pats[s.phase - 1]; cutIn(r, s.phase - 1); } } }
      paintTag(r); }
    for (const w of j.wins || []) if (!w.claimed && !said["win" + w.queen + w.cyc]) { said["win" + w.queen + w.cyc] = 1; claim(w); }
  }
  async function claim(w) {
    const s = ctx.sess(); if (!s) return;
    try { const r = await ctx.post({ action: "world-rq-claim", ...s, queen: w.queen, cyc: w.cyc }); const j = r && r.j;
      if (!r || !r.ok || !j) { if (j && j.error) ctx.toast(esc(j.error)); said["win" + w.queen + w.cyc] = 0; return; }
      if (j.item) { const ids = ls.get(GOT, []); if (!ids.includes(j.item.id)) { try { ctx.addItem(j.item); } catch { /* the card still shows */ } ids.push(j.item.id); ls.set(GOT, ids.slice(-40)); } }
      if (j.credited > 0 && ctx.refresh) ctx.refresh(); winCard(w.queen, j);
    } catch { said["win" + w.queen + w.cyc] = 0; }
  }

  // ---------------- the story: pages, cut-ins, the reward card, the chronicle ----------------
  const art = (q, k) => `/images/raid/${q}-${k}.webp${ctx.ver || ""}`;
  const seen = () => ls.get(SEEN, []), see = (k) => { const s = seen(); if (!s.includes(k)) { s.push(k); ls.set(SEEN, s); } };
  let pageEl = null;
  /// a full page of the story: the picture scrolls slowly from top to bottom; the lines under it in your language
  function page(k, { onDone, cta } = {}) {
    if (pageEl || typeof document === "undefined") return; see(k);
    const isQ = !!QV[k], V = QV[k], Q = queenOf(k), src = k === "prologue" ? `/images/raid/key.webp${ctx.ver || ""}` : k === "trinity" ? `/images/raid/trinity-page.webp${ctx.ver || ""}` : art(k, "page");
    const lines = k === "prologue" ? PROLOGUE : k === "trinity" ? ["Three crowns. One throne.", "The Throne of Three opens at Lv 400."] : [V.lines[0]];
    const el = document.createElement("div"); el.className = "rq-page" + (k === "prologue" ? " rq-wide" : ""); el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", isQ ? V.css : "#ff7ab8");
    el.innerHTML = `<div class="rq-pin"><div class="rq-scroll"><img src="${src}" alt=""></div>
      <div class="rq-cap"><small>RAID QUEENS${isQ ? " · Lv " + Q.lv : ""}</small><b>${esc(isQ ? T(Q.name) : k === "trinity" ? T("THRONE OF THREE") : T("The Broken Crown"))}</b>${isQ ? `<em>${esc(T(Q.title))}</em>` : ""}${lines.map((l) => `<p>${esc(T(l))}</p>`).join("")}
      <div class="rq-acts"><button type="button" class="rq-skip">${esc(T("Skip"))}</button><button type="button" class="rq-go">${esc(T(cta || (isQ ? "Fight!" : "Continue")))}</button></div></div></div>`;
    document.body.appendChild(el); pageEl = el; ctx.freeze(true);
    const sc = el.querySelector(".rq-scroll"), img = el.querySelector("img"); let raf = 0, t0 = 0;
    const roll = (t) => { if (!t0) t0 = t; const max = sc.scrollHeight - sc.clientHeight; if (max > 4 && !el.dataset.user) sc.scrollTop = Math.min(max, ((t - t0) / (ctx.reduce ? 1 : 11000)) * max); if (t - t0 < 11500) raf = requestAnimationFrame(roll); };
    img.addEventListener("load", () => { raf = requestAnimationFrame(roll); });
    sc.addEventListener("pointerdown", () => { el.dataset.user = "1"; }, { passive: true });
    const close = () => { cancelAnimationFrame(raf); el.remove(); pageEl = null; ctx.freeze(false); if (onDone) onDone(); };
    el.addEventListener("click", (e) => { if (e.target.closest(".rq-skip, .rq-go")) close(); });
    if (ctx.Snd && ctx.Snd.perfect) try { ctx.Snd.perfect(); } catch { /* no sound */ }
  }
  /// her cut-in at a phase change (and her last line when she falls): the full figure slides in with her words
  function cutIn(r, i, fall) {
    if (typeof document === "undefined" || Math.hypot(me.x - r.c.x, me.z - r.c.z) > r.P.R + 12) return;
    document.querySelectorAll(".rq-cin").forEach((x) => x.remove());
    const el = document.createElement("div"); el.className = "rq-cin" + (fall ? " rq-fall" : ""); el.setAttribute("aria-live", "polite"); el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", r.V.css);
    el.innerHTML = `<img src="${art(r.Q.id, "full")}" alt=""><div><small>${esc(fall ? T("DEFEATED") : T("PHASE {n}", { n: i + 1 }))}</small><b>${esc(T(r.Q.name))}</b><p>“${esc(T(r.V.lines[Math.min(3, i)]))}”</p></div>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 3200);
    if (!fall && ctx.Snd && ctx.Snd.siren) try { ctx.Snd.siren(); } catch { /* no sound */ }
    if (!fall && ctx.shake) ctx.shake(0.35);
  }
  const RC = ["#b8c2cc", "#5fe08a", "#4fa8ff", "#b48cff", "#ffc861"], RN = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  function winCard(qid, j) {
    const V = QV[qid], Q = queenOf(qid); if (!V || typeof document === "undefined") return;
    const el = document.createElement("div"); el.className = "rq-win"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); el.style.setProperty("--rq", V.css);
    const place = ["🥇", "🥈", "🥉"][j.rank - 1] || "⚔️", it = j.item;
    el.innerHTML = `<div class="rq-wcard"><img src="${art(qid, "full")}" alt=""><div class="rq-wtx"><small>RAID QUEENS · ${esc(T("Victory"))}</small><h3>${place} ${esc(T("Place {n} against {x}", { n: j.rank, x: T(Q.name) }))}</h3>
      ${j.today ? `<div class="rq-gain"><b>+${Number(j.arcl || 0).toLocaleString("en-US")}</b><span>ARCL</span></div>` : `<p class="rq-note">${esc(T("Today's reward from her is already yours — this fall counts for your chronicle."))}</p>`}
      ${it ? `<div class="rq-item" style="--rc:${RC[it.r] || "#ffc861"}"><i></i><span><b>${esc(ctx.itemName(it))}</b><small>${esc(T(RN[it.r] || ""))} · +${it.p} · Lv ${it.lv}</small></span></div><p>${esc(T("It's in your bag."))}</p>` : ""}
      <button type="button" data-x>${esc(T("Great!"))}</button></div></div>`;
    document.body.appendChild(el); el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-x]")) el.remove(); });
    if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* no sound */ }
  }
  /// RAID QUEENS CHRONICLE: the story pages you've seen (again), each queen now, your clears, a way to her gate
  function chronicle(go) {
    if (typeof document === "undefined" || document.querySelector(".rq-chron")) return;
    const s = seen(), clears = (view && view.clears) || {};
    const el = document.createElement("div"); el.className = "rq-chron"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", "");
    const qrow = (q) => { const V = QV[q.id], st = view && view.queens.find((x) => x.id === q.id), R0 = RQ.REGIONS.find((x) => x.queen === q.id);
      const stx = !st ? "" : st.down ? (st.back ? T("Returns in {t}", { t: left(st.back - Date.now()) }) : T("Defeated")) : `${Math.ceil((100 * st.hp) / st.max)}% · ${T("Phase {n}", { n: st.phase })}`;
      return `<div class="rq-qrow" style="--rq:${V.css}"><img src="${art(q.id, "full")}" alt=""><span><small>${esc(T(R0.name))} · Lv ${q.lv}+</small><b>${esc(T(q.name))}</b><em>${esc(T(q.title))}</em><i>${esc(stx)}${clears[q.id] ? ` · ${esc(T("Cleared ×{n}", { n: clears[q.id] }))}` : ""}</i></span>
        <span class="rq-qb">${s.includes(q.id) ? `<button type="button" data-page="${q.id}">${esc(T("Story"))}</button>` : `<button type="button" disabled>🔒</button>`}<button type="button" class="go" data-go="${R0.id}">${esc(T("Go"))}</button></span></div>`; };
    el.innerHTML = `<div class="rq-cin2"><header><img src="/images/raid/key-sm.webp${ctx.ver || ""}" alt=""><div><small>${esc(T("RAID QUEENS CHRONICLE"))}</small><h3>${esc(T("The Broken Crown"))}</h3><p>${esc(T("A new hunting ground for Lv 100+. Three queens — and the Throne of Three."))}</p></div><button type="button" class="rq-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="rq-list">${RQ.QUEENS.map(qrow).join("")}
      <div class="rq-qrow rq-tri" style="--rq:#ff7ab8"><img src="/images/raid/trinity-page.webp${ctx.ver || ""}" alt=""><span><small>${esc(T("Throne of Three"))} · Lv 400+</small><b>${esc(T("The three together"))}</b><i>${esc(T("Sealed — opens later"))}</i></span><span class="rq-qb">${s.includes("trinity") ? `<button type="button" data-page="trinity">${esc(T("Story"))}</button>` : `<button type="button" disabled>🔒</button>`}</span></div></div>
      <div class="rq-foot"><button type="button" data-page="prologue">${esc(T("Prologue"))}</button>${go ? `<button type="button" class="go" data-go="land">${esc(T("Go to RAID QUEENS"))}</button>` : ""}</div></div>`;
    document.body.appendChild(el); ctx.freeze(true);
    const close = () => { el.remove(); ctx.freeze(false); };
    el.addEventListener("click", (e) => { const p = e.target.closest("[data-page]"), gg = e.target.closest("[data-go]");
      if (p) { close(); page(p.dataset.page, { cta: "Close" }); return; }
      if (gg) { close(); if (go) go(gg.dataset.go); return; }
      if (e.target === el || e.target.closest(".rq-x")) close(); });
    poll(true);
  }

  // ---------------- each frame ----------------
  let shown = false, gated = 0, fx = 0;
  function show(on) { on = !!on; if (on === shown) return; shown = on; g.visible = on;
    if (on) { loadModels(); loadMobs(); poll(true); if (!seen().includes("prologue")) setTimeout(() => { if (shown) page("prologue", { cta: "Enter" }); }, 900); }
    else for (const r of Object.values(regions)) { if (r.m) sleepQ(r); } }
  function tick(dt, t) {
    if (!shown) return; for (const f of spins) f(dt, t);
    ctx.here(me); const r = regionAt(me.x, me.z), lv = ctx.level(), act = ctx.active();
    // below a region's level you're turned back at its edge
    if (r && lv < r.R0.lv[0] && act) { const a = Math.atan2(me.z - r.c.z, me.x - r.c.x), k = r.P.R + 2.5; ctx.stand(r.c.x + Math.cos(a) * k, r.c.z + Math.sin(a) * k, { x: land.x, z: land.z });
      if (Date.now() - gated > 4000) { gated = Date.now(); ctx.toast(esc(T("{x} is for Lv {n}+ (you're Lv {m})", { x: T(r.R0.name), n: r.R0.lv[0], m: lv }))); } }
    for (const q of Object.values(regions)) {
      const d = Math.hypot(me.x - q.c.x, me.z - q.c.z);
      if (q.corpse) corpseTick(q, dt);
      // her model, once you come near her region
      if (d < q.P.R + 40 && !q.src && !q.srcP) q.srcP = load(`/models/world/raid/${q.V.glb}.glb`).then((gl) => { q.src = gl; try { if (ctx.compile) ctx.compile([rig(gl, q.V.tint).obj]); } catch { /* the first draw */ } }).catch((e) => { console.warn("raid queen", e); q.srcP = null; });
      const inR = d < q.P.R + 4 && lv >= q.R0.lv[0];
      if (inR && act) { if (msrc.imp) mobTick(q, dt); if (!q.m && !q.corpse && view) wake(q);
        // the first time you meet her (once a Seoul day after), her page
        const met = ls.get(MET, {}); if (q.m && met[q.Q.id] !== dayKey() && !pageEl) { met[q.Q.id] = dayKey(); ls.set(MET, met); page(q.Q.id); } }
      if (q.m && d > q.P.R + 22) sleepQ(q);
      if (q.m) { const c = ctx.combat(); if (c && !c.mobsRaw().includes(q.m)) { q.m = null; q.ent = null; } else queenTick(q, dt); }
    }
    if ((fx -= dt) <= 0) { fx = 1; for (const q of Object.values(regions)) paintTag(q); }
    flush(); poll(false);
  }
  return {
    group: g, back, throne, solids, regions, tick, show, chronicle, page, loadModels, apply,
    shown: () => shown, regionAt, view: () => view,
    /// where you arrive (by the portal back, facing the Throne)
    arrival: () => ({ x: land.x, z: land.z + land.r - 18, c: { x: land.x, z: land.z } }),
    /// in front of a region's gate (outside it), facing in
    gateOf(id) { const q = regions[id]; if (!q) return null; const [x, z] = polar(q.P.a, q.P.r - q.P.R - 5); return { x: land.x + x, z: land.z + z, c: { x: q.c.x, z: q.c.z } }; },
    /// for the minimap and the map: the regions, the queens, the Throne, the way back
    marks: () => [...Object.values(regions).map((q) => ({ g: q.m ? q.m.g : q.dais, css: q.V.css, s: 8, ch: "♛", down: !!(view && (view.queens.find((x) => x.id === q.Q.id) || {}).down) })), { g: throne, css: "#ff7ab8", s: 10, ch: "✦" }],
    /// tests: each queen's state and running clip; the mobs' running clips
    debug: () => Object.values(regions).map((q) => ({ id: q.Q.id, up: !!q.m, clip: q.ent ? q.ent.cur : "", phase: q.phase, mobs: q.mobs.length, mobClips: q.mobs.map((m) => (m.e.mixer._actions || []).filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name).join("+")), loaded: !!q.src, mobsReady: !!msrc.imp, moves: Object.keys(mclips.imp || {}).length, view: !!view, lv: ctx.level() })),
    testCut: (id, i = 1) => cutIn(regions[Object.keys(regions).find((k) => regions[k].Q.id === id)], i, false),
    testWin: (id = "lysitha") => winCard(id, { rank: 1, arcl: 8000, today: 1, item: { id: "rqtest", b: "weapon-4", r: 3, lv: 100, p: 5 } }),
  };
}
