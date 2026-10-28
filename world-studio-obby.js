// world-studio-obby.js — OBBY WORLD (2026-10-28, the owner's "easier and more premium, a Roblox feel" list): a 3D course
// placed freely in the 3D scene editor (world-studio-scene.js), played from behind your own hero (the town's ARON / LUMI /
// NEX, with the weapon you wear and your pet when the maker leaves them on). world-studio-gen.js OB / cleanObby / genObby:
// the same course for everyone, the server's copy checks a run against it.
//   makeObby(o, env)  → the run (env: { ctx, THREE, T, esc, makeFx, result, back, ouch })
// What's in a course: blocks, ramps, round platforms (four surfaces: plain, neon, ice — slippery —, the theme's own),
// lava, spinners, moving platforms, jump pads, checkpoints, goals, coins, hearts, Meshy props, and the smart objects:
// doors on a channel opened by buttons (or the logic), elevators that ride up while you stand on them, teleporter pairs,
// a shop that sells a speed boost / a double jump / a heart / a shield for the coins you hold, a boss (a stomp ring, fire
// balls or a charge; hit it with the action key or land on its head; phase 2 below half). The logic (B.lg) runs WHEN …
// THEN … rules on two counters, a phase, the channels and the groups. The look preset sets the sky, light, fog, a grade
// and the camera; the UI kit picks the HUD's pieces; the cinematics an intro fly-over, a boss's entrance and the clear's
// slow motion.
import { OB, OBJ, THEMES, genLevel, obSpeed } from "./world-studio-gen.js";
import { makePad } from "./world-studio-pad.js";
import { look as themeLook } from "./world-studio-look.js";

/// OB4: the look presets (sky top / bottom, fog, hemisphere sky / ground, sun colour / strength / height, grade, camera)
export const LOOKS = {
  day: { name: "Bright day", top: 0x5fb8ff, bot: 0xdff3ff, fog: 0xcfe9ff, near: 70, far: 260, hs: 0xffffff, hg: 0x8fb0d0, hi: 1.15, sun: 0xfff4e0, si: 1.7, sy: 60, grade: "", fov: 60, dist: 7.5 },
  sunset: { name: "Golden sunset", top: 0x3a4a9a, bot: 0xffa860, fog: 0xffb98a, near: 60, far: 240, hs: 0xffe2c4, hg: 0x8a6a7a, hi: 1.35, sun: 0xffb070, si: 1.9, sy: 14, grade: "sepia(.12) saturate(1.15)", fov: 58, dist: 7.5 },
  night: { name: "Neon night", top: 0x050a1e, bot: 0x1c2a5a, fog: 0x101a3a, near: 40, far: 180, hs: 0x8fb8ff, hg: 0x1a1030, hi: 0.75, sun: 0x9fb8ff, si: 0.9, sy: 40, grade: "saturate(1.25) contrast(1.06)", fov: 62, dist: 7.5, glow: true },
  mist: { name: "Mystic fog", top: 0x6a7a90, bot: 0xb8c4d0, fog: 0xa8b4c4, near: 14, far: 90, hs: 0xe0e8ff, hg: 0x4a5060, hi: 1.0, sun: 0xdde4ff, si: 0.9, sy: 50, grade: "contrast(.95) saturate(.85)", fov: 60, dist: 7 },
  toon: { name: "Toon pop", top: 0x7fd8ff, bot: 0xfff0fa, fog: 0xffeaf6, near: 90, far: 300, hs: 0xffffff, hg: 0xffd0e8, hi: 1.35, sun: 0xffffff, si: 1.3, sy: 70, grade: "saturate(1.35) brightness(1.04)", fov: 64, dist: 8 },
  space: { name: "Deep space", top: 0x02030a, bot: 0x140a2a, fog: 0x0a0618, near: 80, far: 320, hs: 0xb48cff, hg: 0x0a0a1a, hi: 0.8, sun: 0xffffff, si: 1.4, sy: 30, grade: "saturate(1.2) contrast(1.1)", fov: 66, dist: 8, glow: true, stars: true },
  cine: { name: "Cinematic", top: 0x1a2a3a, bot: 0x8a9aa0, fog: 0x6a7a80, near: 30, far: 170, hs: 0xfff0dc, hg: 0x2a3036, hi: 0.95, sun: 0xffe2b0, si: 2.1, sy: 22, grade: "contrast(1.12) saturate(.92)", fov: 48, dist: 9, bars: true },
};
const SURF = ["Plain", "Neon", "Ice", "Theme"];
export const obSurfaces = SURF;

/// the unit shapes: a box and a cylinder standing on their base, a wedge rising along +z (a ramp)
export function obGeos(THREE) {
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 28); cyl.translate(0, 0.5, 0);
  const w = new THREE.BufferGeometry(), P = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0.5, 0.5, 1, 0.5]; // (the low edge at −z on the ground, the high edge at +z)
  const F = [[0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]], pos = [], uv = [];
  for (const f of F) for (const i of f) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); uv.push(P[i * 3] + 0.5, P[i * 3 + 2] + 0.5 + P[i * 3 + 1]); }
  w.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); w.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); w.computeVertexNormals();
  return { box, cyl, wedge: w };
}
/// the sky: a big sphere painted top to bottom (the preset's two colours), and stars on the space look
export function obSky(THREE, L) {
  const g = new THREE.SphereGeometry(420, 24, 12), c = [], a = new THREE.Color(L.top), b = new THREE.Color(L.bot), t = new THREE.Color(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = Math.max(0, Math.min(1, p.getY(i) / 420 * 1.4 + 0.25)); t.copy(b).lerp(a, k); c.push(t.r, t.g, t.b); }
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })); m.renderOrder = -10;
  if (L.stars) { const n = 500, sp = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random() * 6.28, v = Math.acos(Math.random() * 2 - 1); sp[i * 3] = 400 * Math.sin(v) * Math.cos(u); sp[i * 3 + 1] = Math.abs(400 * Math.cos(v)); sp[i * 3 + 2] = 400 * Math.sin(v) * Math.sin(u); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); m.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }))); }
  return m;
}
/// a material for a colour and a surface (shared within a scene)
export function obMats(THREE, th, lk) {
  const cache = new Map(); let themeTex = null;
  const get = (c, s) => { const key = c + ":" + s; if (cache.has(key)) return cache.get(key); const col = OB.COLORS[c] || 0xffffff;
    const m = s === 1 ? new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: lk && lk.glow ? 0.9 : 0.55, roughness: 0.35, metalness: 0.1 })
      : s === 2 ? new THREE.MeshStandardMaterial({ color: new THREE.Color(col).lerp(new THREE.Color(0xdff6ff), 0.55), roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.86 })
      : s === 3 ? new THREE.MeshStandardMaterial({ color: 0xffffff, map: themeTex, roughness: 0.6, metalness: 0.05 })
      : new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.08 });
    m.userData.surf = s; cache.set(key, m); return m; };
  return { get, setTheme(t) { themeTex = t; for (const m of cache.values()) if (m.userData.surf === 3) { m.map = t; m.needsUpdate = true; } }, all: () => [...cache.values()], th };
}

export async function makeObby(o, env) {
  const { ctx, THREE, T, esc, makeFx, result } = env, { st } = ctx, spec = o.spec, L = genLevel(spec), B = L.B, th = THEMES[spec.theme] || THEMES.neon;
  const LK = LOOKS[B.lk] || LOOKS.day, ver = ctx.ver || "", low = !!(ctx.low || ctx.coarse);
  const scene = new THREE.Scene(); scene.userData.live = true; scene.fog = new THREE.Fog(LK.fog, LK.near, LK.far); scene.background = new THREE.Color(LK.bot);
  const sky = obSky(THREE, LK); scene.add(sky);
  const cam = new THREE.PerspectiveCamera(LK.fov, innerWidth / innerHeight, 0.1, 900);
  scene.add(new THREE.HemisphereLight(LK.hs, LK.hg, LK.hi)); const sun = new THREE.DirectionalLight(LK.sun, LK.si); sun.position.set(40, LK.sy, 25); scene.add(sun);
  const G = obGeos(THREE), MT = obMats(THREE, th, LK), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
  themeLook(THREE, spec.theme, { ver, low }).then((lk) => { if (!scene.userData.live || !lk.wall) return; const t = lk.wall.clone(); t.repeat.set(1, 1); t.needsUpdate = true; MT.setTheme(t); if (bpM && lk.track) { const t2 = lk.track.clone(); t2.repeat.set(40, 40); t2.needsUpdate = true; bpM.map = t2; bpM.color.set(0xffffff); bpM.needsUpdate = true; } }).catch(() => {});
  const hidden = new Set(B.hg), Q = new THREE.Quaternion(), E = new THREE.Euler(), M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3();
  const mat4 = (x, y, z, ry, sx, sy, sz) => { E.set(0, (ry * Math.PI) / 180, 0); Q.setFromEuler(E); return M4.compose(V3.set(x, y, z), Q, S3.set(sx, sy, sz)); };
  // ---- the baseplate ----
  let bpM = null; if (B.bp) { bpM = new THREE.MeshStandardMaterial({ color: 0x7a8a9a, roughness: 0.9 }); const bp = new THREE.Mesh(new THREE.BoxGeometry(OB.R * 2 + 20, 1, OB.R * 2 + 20), bpM); bp.position.y = -0.5; scene.add(bp); }
  // ---- the static pieces: one InstancedMesh a shape + material (blocks, round platforms, ramps); the rest one by one ----
  const solids = [], things = [], inst = new Map(), STATIC = new Set(["b", "y", "r"]);
  B.o.forEach((q, i) => { const [k, x, y, z, ry, sx, sy, sz, c, a, b, g] = q;
    if (STATIC.has(k) && !g) { const key = k + ":" + c + ":" + a; if (!inst.has(key)) inst.set(key, []); inst.get(key).push(q); solids.push({ i, k, x, y, z, ry, sx, sy, sz, on: true, surf: a }); return; }
    const t = { i, k, q, x, y, z, ry, sx, sy, sz, a, b, g, obj: new THREE.Group(), on: !hidden.has(g) }; t.obj.position.set(x, y, z); t.obj.rotation.y = (ry * Math.PI) / 180; scene.add(t.obj); things.push(t);
    const shape = (geo, m, w, h, d) => { const me = new THREE.Mesh(geo, m); me.scale.set(w, h, d); t.obj.add(me); return me; };
    if (STATIC.has(k)) { shape(k === "y" ? G.cyl : k === "r" ? G.wedge : G.box, MT.get(c, a), sx, sy, k === "y" ? sx : sz); t.solid = solids.push({ i, k, x, y, z, ry, sx, sy, sz, on: t.on, surf: a, t }) - 1; }
    else if (k === "k") { const m = shape(G.box, new THREE.MeshStandardMaterial({ color: 0xff4d1a, emissive: 0xff3a00, emissiveIntensity: 1.1, roughness: 0.4 }), sx, sy, sz); t.lava = m; }
    else if (k === "s") { const pivot = new THREE.Group(); pivot.position.y = sy / 2; t.obj.add(pivot); const bar = new THREE.Mesh(G.box, MT.get(11, 1)); bar.scale.set(sx, sy, sz); bar.position.y = -sy / 2; pivot.add(bar);
      const hub = new THREE.Mesh(G.cyl, MT.get(7, 0)); hub.scale.set(0.7, sy + 0.3, 0.7); hub.position.y = -sy / 2 - 0.15; t.obj.add(hub); t.pivot = pivot; t.ang = 0; }
    else if (k === "m" || k === "e") { shape(G.box, MT.get(c, 1), sx, sy, sz); const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 8), glow(0xffffff, 0.6)); arrow.position.y = sy + 0.02; arrow.rotation.x = k === "e" ? 0 : Math.PI / 2; t.obj.add(arrow);
      t.base = new THREE.Vector3(x, y, z); t.solid = solids.push({ i, k, x, y, z, ry, sx, sy, sz, on: t.on, t, surf: 1 }) - 1; t.lift = 0; t.wait = 0; }
    else if (k === "p") { shape(G.cyl, MT.get(1, 1), sx, sy, sx); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 8, 28), glow(0x7cf5c8)); ring.rotation.x = Math.PI / 2; ring.position.y = sy + 0.05; t.obj.add(ring); t.ring = ring; t.solid = solids.push({ i, k, x, y, z, ry, sx, sy, sz: sx, on: t.on, t, surf: 0 }) - 1; }
    else if (k === "c" || k === "S" || k === "g") { shape(G.cyl, MT.get(k === "g" ? 2 : k === "S" ? 1 : 6, 1), sx, sy, sx);
      if (k !== "S") { const beam = new THREE.Mesh(new THREE.CylinderGeometry(sx * 0.42, sx * 0.48, k === "g" ? 7 : 3.2, 20, 1, true), glow(k === "g" ? 0xffd23a : 0x7cf5c8, 0.22)); beam.position.y = (k === "g" ? 3.5 : 1.6) + sy; t.obj.add(beam); t.beam = beam; }
      if (k === "g") { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.16, 12, 40), glow(0xffd23a)); ring.position.y = 2.2; t.obj.add(ring); t.ring = ring; }
      t.solid = solids.push({ i, k, x, y, z, ry, sx, sy, sz: sx, on: t.on, t, surf: 1 }) - 1; }
    else if (k === "o") { const m = new THREE.Mesh(coinG || (coinG = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20).rotateX(Math.PI / 2)), coinM || (coinM = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 }))); m.position.y = 0.6; t.obj.add(m); t.spin = m; }
    else if (k === "h") { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0xff1a4a, emissiveIntensity: 0.7 })); m.position.y = 0.7; t.obj.add(m); t.spin = m; }
    else if (k === "d") { const door = shape(G.box, MT.get(c, 1), sx, sy, sz); t.door = door; t.open = 0; t.solid = solids.push({ i, k, x, y, z, ry, sx, sy, sz, on: t.on, t, surf: 0 }) - 1; }
    else if (k === "u") { const pad = shape(G.cyl, new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.5 }), 1.6, 0.18, 1.6), cap = new THREE.Mesh(G.cyl, MT.get(11, 1)); cap.scale.set(1.0, 0.22, 1.0); cap.position.y = 0.16; t.obj.add(cap); t.cap = cap; t.down = 0; void pad; }
    else if (k === "t") { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 10, 36), glow(0xb48cff)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; t.obj.add(ring);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.6, 20, 1, true), glow(0xb48cff, 0.25)); col.position.y = 1.3; t.obj.add(col); t.col = col; }
    else if (k === "n") { const stall = new THREE.Mesh(G.box, MT.get(7, 0)); stall.scale.set(2.4, 0.9, 1.2); stall.position.z = 0.9; t.obj.add(stall); const roof = new THREE.Mesh(G.box, MT.get(3, 1)); roof.scale.set(2.6, 0.15, 1.6); roof.position.set(0, 2.5, 0.9); t.obj.add(roof);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), glow(0xffd23a)); sign.position.set(0, 2.85, 0.9); t.obj.add(sign); t.shop = OB.SHOP[a] || OB.SHOP[0]; }
    else if (k === "B") { const body = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0x6a0010, emissiveIntensity: 0.5, roughness: 0.4 });
      const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m); torso.scale.set(sx * 0.45, sy * 0.4, sz * 0.45); torso.position.y = sy * 0.45; body.add(torso);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(0xffd23a)); for (const s of [-1, 1]) { const e = eye.clone(); e.position.set(s * sx * 0.16, sy * 0.62, sz * 0.38); body.add(e); }
      t.obj.add(body); t.body = body; t.hp = a; t.hp0 = a; t.style = b; t.home = new THREE.Vector3(x, y, z); t.cd = 2.5; t.flash = 0; t.boss = true; t.vx = 0; t.vz = 0; t.seen = false; t.phase2 = false; }
    else if (k === "x" || k === "X") { const ph = shape(G.box, new THREE.MeshStandardMaterial({ color: 0x8aa0b8, transparent: true, opacity: 0.25 }), sx, sy, sz); t.ph = ph; if (b) t.solid = solids.push({ i, k, x, y, z, ry, sx, sy, sz, on: t.on, t, surf: 0 }) - 1; }
    if (!t.on) t.obj.visible = false;
  });
  var coinG, coinM; // (shared once the first coin is made)
  for (const [key, list] of inst) { const [k, c, s] = key.split(":"), im = new THREE.InstancedMesh(k === "y" ? G.cyl : k === "r" ? G.wedge : G.box, MT.get(+c, +s), list.length);
    list.forEach((q, j) => im.setMatrixAt(j, mat4(q[1], q[2], q[3], q[4], q[5], q[6], k === "y" ? q[5] : q[7]))); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); }
  // ---- Meshy's props (and the maker's own assets) fitted into their boxes, loaded after the run starts ----
  const props = things.filter((t) => t.k === "x" || t.k === "X");
  if (props.length && ctx.K && ctx.K.gltfLoader && !ctx.saver) (async () => { const ld = ctx.K.gltfLoader(), cache = new Map();
    for (const t of props) { if (!scene.userData.live) return; const url = t.k === "x" ? `/models/world/${(OB.PROPS[t.a] || OB.PROPS[0])[1]}.glb${ver}` : env.assetUrl ? env.assetUrl(B.as[t.a]) : null; if (!url) continue;
      let src = cache.get(url); if (!src) { try { src = (await ld.loadAsync(url)).scene; cache.set(url, src); } catch { continue; } } if (!scene.userData.live) return;
      const m = src.clone(true), bx = new THREE.Box3().setFromObject(m), sz = bx.getSize(new THREE.Vector3()), k = Math.min(t.sx / (sz.x || 1), t.sy / (sz.y || 1), t.sz / (sz.z || 1));
      m.scale.setScalar(k); m.position.set(-((bx.min.x + bx.max.x) / 2) * k, -bx.min.y * k, -((bx.min.z + bx.max.z) / 2) * k); t.obj.add(m); t.ph.visible = false; } })();
  // the boss's body: Meshy's dragon (models/world/studio/jw/dragon.glb) once it's in, its own clips
  const mixers = [];
  for (const t of things.filter((q) => q.boss)) if (ctx.K && ctx.K.gltfLoader && !ctx.saver) ctx.K.gltfLoader().loadAsync(`/models/world/studio/jw/dragon.glb${ver}`).then((gl) => { if (!scene.userData.live) return;
    const src = gl.scene, bx = new THREE.Box3().setFromObject(src), sz = bx.getSize(new THREE.Vector3()), k = (t.sy * 1.2) / (sz.y || 1), m = gl.animations.length && ctx.K.skelClone ? ctx.K.skelClone(src) : src.clone(true);
    m.scale.setScalar(k); m.position.set(-((bx.min.x + bx.max.x) / 2) * k, -bx.min.y * k, -((bx.min.z + bx.max.z) / 2) * k); m.traverse((x) => { if (x.isSkinnedMesh) x.frustumCulled = false; });
    t.body.visible = false; t.obj.add(m); t.model = m; if (gl.animations.length) { const mx = new THREE.AnimationMixer(m), c = gl.animations.find((a) => a.name === "idle") || gl.animations[0]; mx.clipAction(c).play(); t.mx = mx; t.clips = gl.animations; mixers.push(mx); } }).catch(() => { /* the drawn one stays */ });
  // ---- your hero (and what you wear, your pet) ----
  let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("obby hero", e); }
  const me = new THREE.Group(); scene.add(me);
  if (hero) { me.add(hero.obj); try { hero.play("idle"); } catch { /* no clip */ }
    if (B.av & OB.AV.gear && ctx.heroGear) try { for (const w of ctx.heroGear()) { let bn = null; hero.obj.traverse((x) => { if (!bn && x.name === w.bone) bn = x; }); if (bn) bn.add(w.obj); } } catch { /* no gear */ } }
  else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 4, 10), new THREE.MeshStandardMaterial({ color: 0xeef4fb })); cap.position.y = 0.85; me.add(cap); }
  let pet = null; if (B.av & OB.AV.pet && ctx.petBody) try { const pb = ctx.petBody(); if (pb) { pet = new THREE.Group(); pet.add(pb); scene.add(pet); } } catch { pet = null; }
  const HR = 0.38, HH = 1.7, spd = obSpeed(spec);
  // ---- the HUD (the UI kit) ----
  const UI = B.ui, has = (b) => !!(UI & b), bossT = things.filter((t) => t.boss), coinsAll = things.filter((t) => t.k === "o").length;
  document.body.classList.add("wp-studio");
  const hud = document.createElement("div"); hud.className = "wst-hud wso-hud" + (LK.bars ? " wso-cine" : "");
  hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || spec.title)}</b>${has(OB.UI.hearts) && B.hp ? `<span class="wso-hp"></span>` : ""}${has(OB.UI.coins) ? `<span class="wst-hc">🪙 0</span>` : ""}${has(OB.UI.varA) ? `<span class="wso-va">${esc(T(OB.VARL[B.vl]))} 0</span>` : ""}${has(OB.UI.timer) || B.tl ? `<span class="wst-ht">⏱ 0</span>` : ""}<span class="wso-cp">🚩 0/${L.cps.length}</span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div>
    ${has(OB.UI.quest) ? `<div class="wso-quest"><i>🎯</i>${esc(T(OB.QUESTS[B.q]))}</div>` : ""}${has(OB.UI.boss) && bossT.length ? `<div class="wso-boss" hidden><b>👑 ${esc(T("Boss"))}</b><i><em></em></i></div>` : ""}${has(OB.UI.best) ? `<div class="wso-best"></div>` : ""}${has(OB.UI.map) ? `<canvas class="wso-map" width="120" height="120"></canvas>` : ""}
    <div class="wso-shop" hidden></div><div class="wso-grade"${LK.grade ? ` style="--g:${LK.grade}"` : ""}></div><div class="wso-vig"></div><div class="wso-bars" hidden><i></i><i></i></div><div class="wso-card" hidden></div><div class="wst-cd">3</div>
    ${ctx.coarse ? "" : `<p class="wst-keys">${esc(T("WASD move · Space jump · Shift sprint · F act · drag to look"))}</p>`}`;
  document.body.appendChild(hud); const fx = makeFx(hud), $ = (s) => hud.querySelector(s);
  const pad = ctx.coarse ? makePad(hud, { mode: "stick", T }) : null;
  if (ctx.coarse) { const bw = document.createElement("div"); bw.className = "wsp wso-btns"; bw.innerHTML = `<div class="wsp-btns"><button type="button" class="wsp-b wsp-act" aria-label="${esc(T("Act"))}">✊</button><button type="button" class="wsp-b wsp-jump" aria-label="${esc(T("Jump"))}">⤒</button></div>`; hud.appendChild(bw);
    bw.querySelector(".wsp-jump").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); S.jumpQ = 0.15; S.jumpHold = true; }); bw.querySelector(".wsp-jump").addEventListener("pointerup", () => { S.jumpHold = false; });
    bw.querySelector(".wsp-act").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); act(); }); }
  // the canvas (and the grade) — a CSS grade on the page's own canvas while the run is up, given back after
  const cv = document.querySelector("canvas#wp-canvas, canvas.wp-canvas, body > canvas, canvas"), cvF = cv ? cv.style.filter : "";
  if (cv && LK.grade && !ctx.saver) cv.style.filter = LK.grade;
  // ---- the input ----
  const keyOn = new Set(), KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift", "f", "e", "j"];
  const kd = (e) => { if (e.target && e.target.closest && e.target.closest("input,textarea")) return; const k = e.key.toLowerCase(); if (!KEYS.includes(k)) return; e.preventDefault(); if (k === " " && !keyOn.has(" ")) { S.jumpQ = 0.15; S.jumpHold = true; } if ((k === "f" || k === "e" || k === "j") && !keyOn.has(k)) act(); keyOn.add(k); if (S.intro > 0) S.intro = 0.01; };
  const ku = (e) => { const k = e.key.toLowerCase(); keyOn.delete(k); if (k === " ") S.jumpHold = false; };
  addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
  let drag = null; const look = { yaw: 0, pitch: 0.32 };
  const pdn = (e) => { if (e.target.closest("button,.wsp-zone,.wso-shop,.wst-res")) return; if (ctx.coarse && e.clientX < innerWidth * 0.46) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; if (S.intro > 0) S.intro = 0.01; };
  const pmv = (e) => { if (!drag || e.pointerId !== drag.id) return; look.yaw -= (e.clientX - drag.x) * 0.006; look.pitch = Math.max(-0.15, Math.min(1.1, look.pitch + (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; };
  const pup = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  hud.addEventListener("pointerdown", pdn); addEventListener("pointermove", pmv); addEventListener("pointerup", pup);
  const wheel = (e) => { look.zoom = Math.max(0.6, Math.min(1.8, (look.zoom || 1) + Math.sign(e.deltaY) * 0.08)); }; hud.addEventListener("wheel", wheel, { passive: true });
  // ---- the state ----
  const start = B.o.find((q) => q[0] === "S"), S = { p: new THREE.Vector3(start[1], start[2] + start[6], start[3]), v: new THREE.Vector3(), ground: null, coyote: 0, jumpQ: 0, jumpHold: false, jumps: 0, face: (start[4] * Math.PI) / 180,
    hearts: B.hp || 0, inv: 0, coins: 0, t: o.test ? -1 : -3, over: false, cp: null, cpN: 0, A: 0, Bv: 0, phase: 1, ch: new Set(), chT: new Map(), boost: 0, dj: false, shield: false, speedK: 1, intro: B.cn & OB.CN.intro && !o.test && !ctx.reduce ? 3.6 : 0, slow: 0, tr: [], bossLeft: bossT.length, extra: 0, clip: "" };
  look.yaw = S.face + Math.PI;
  S.cp = { p: S.p.clone(), face: S.face };
  if (o.startAt) { const q = o.startAt; S.p.set(q[0], q[1] + 0.2, q[2]); S.cp = { p: S.p.clone(), face: S.face }; }
  const best = (() => { try { return Number(localStorage.getItem("arc.studio.obbest." + (o.id || "t")) || 0); } catch { return 0; } })();
  if ($(".wso-best")) $(".wso-best").textContent = best ? "🏆 " + T("Best {s} s", { s: best.toFixed(1) }) : "";
  const snd = (k) => { try { if (ctx.Snd && ctx.Snd[k]) ctx.Snd[k](); } catch { /* no sound */ } };
  const buzz = (n) => { try { if (ctx.buzz) ctx.buzz(n); } catch { /* fine */ } };
  const paint = () => {
    const hp = $(".wso-hp"); if (hp) hp.innerHTML = "❤️".repeat(Math.max(0, S.hearts)) + `<i>${"🤍".repeat(Math.max(0, (B.hp || 0) - S.hearts))}</i>${S.shield ? "🛡️" : ""}`;
    const hc = $(".wst-hc"); if (hc) hc.textContent = "🪙 " + S.coins;
    const va = $(".wso-va"); if (va) va.textContent = T(OB.VARL[B.vl]) + " " + S.A;
    const ht = $(".wst-ht"); if (ht) ht.textContent = "⏱ " + (B.tl ? Math.max(0, Math.ceil(B.tl + S.extra - Math.max(0, S.t))) : Math.floor(Math.max(0, S.t)));
    $(".wso-cp").textContent = `🚩 ${S.cpN}/${L.cps.length}`; $(".wst-bar em").style.width = Math.min(100, (S.cpN / Math.max(1, L.cps.length + 1)) * 100).toFixed(1) + "%";
    const bb = $(".wso-boss"); if (bb) { const t = bossT.find((q) => !q.gone && q.seen); bb.hidden = !t; if (t) bb.querySelector("em").style.width = ((t.hp / t.hp0) * 100).toFixed(1) + "%"; }
  };
  // ---- the logic (B.lg): WHEN … THEN …, once unless "again"; state ones fire on the rising edge ----
  const RULES = B.lg.map((r) => ({ r, done: false, was: false, next: r[0] === "every" ? r[1] : 0 }));
  function fire(w, a) { for (const R of RULES) { if (R.done || R.r[0] !== w || (R.r[1] && R.r[1] !== a && w !== "start" && w !== "bosshalf" && w !== "boss")) continue; doThen(R.r); if (!R.r[4]) R.done = true; } }
  function state() { for (const R of RULES) { const [w, n] = R.r; if (R.done || !["coins", "varA", "varB", "phase", "after"].includes(w)) { if (w === "every" && S.t >= R.next) { R.next += n; doThen(R.r); } continue; }
    const on = w === "coins" ? S.coins >= n : w === "varA" ? S.A >= n : w === "varB" ? S.Bv >= n : w === "phase" ? S.phase === n : S.t >= n;
    if (on && !R.was) { doThen(R.r); if (!R.r[4]) R.done = true; } R.was = on; } }
  function doThen(r) { const [, , t, a] = r;
    if (t === "open") chOpen(a, true); else if (t === "close") chOpen(a, false); else if (t === "toggle") chOpen(a, !S.ch.has(a));
    else if (t === "say") fx.say(T(OB.MSGS[a] || OB.MSGS[0]));
    else if (t === "addA") S.A = Math.max(0, Math.min(999, S.A + a)); else if (t === "addB") S.Bv = Math.max(0, Math.min(999, S.Bv + a)); else if (t === "setA") S.A = a; else if (t === "setB") S.Bv = a;
    else if (t === "phase") { if (S.phase !== a) { S.phase = a; card("⚡ " + T("Phase {n}", { n: a }), 1.2); fire("phase", a); } }
    else if (t === "show" || t === "hide") groupOn(a, t === "show");
    else if (t === "heart") { if (B.hp) S.hearts = Math.min(5, S.hearts + a); fx.say("❤️ +" + a); }
    else if (t === "coins") { S.coins += a; fx.say("🪙 +" + a); snd("coin"); }
    else if (t === "time") { S.extra += a; fx.say("⏱ +" + a); }
    else if (t === "speed") { S.boost = a; fx.say("⚡ " + T("Speed!")); }
    else if (t === "win") end(true); else if (t === "hurt") hurt();
    paint(); }
  function chOpen(c, on) { if (on) S.ch.add(c); else S.ch.delete(c); }
  function groupOn(g, on) { for (const t of things) if (t.g === g) { t.on = on; t.obj.visible = on; if (t.solid != null) solids[t.solid].on = on; } }
  // ---- the solid test: each solid's box in its own turned frame (a ramp's top rises along its +z, a round one by radius) ----
  const tmp = new THREE.Vector3();
  function collide(p, v, dt, prevY) {
    let ground = null;
    for (const s of solids) { if (!s.on) continue; const t = s.t;
      const sx0 = t ? t.obj.position.x : s.x, sy0 = t ? t.obj.position.y : s.y, sz0 = t ? t.obj.position.z : s.z, top0 = sy0 + s.sy;
      if (t && t.k === "d" && t.open >= 0.98) continue;
      const r = (s.ry * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r), dx = p.x - sx0, dz = p.z - sz0, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const hw = s.sx / 2, hd = s.sz / 2;
      if (s.k === "y" || s.k === "p" || s.k === "c" || s.k === "S" || s.k === "g") { const R = s.sx / 2, d = Math.hypot(lx, lz); if (d > R + HR) continue; if (p.y + HH < sy0 || p.y > top0 + 0.05) continue;
        if (d <= R && (prevY >= top0 - 0.35 || p.y >= top0 - 0.5) && v.y <= 0.01) { p.y = top0; v.y = 0; ground = s; continue; }
        if (p.y < top0 - 0.4) { const k = (R + HR) / (d || 1); const nx = lx * k, nz = lz * k; p.x = sx0 + nx * c + nz * sn; p.z = sz0 - nx * sn + nz * c; } continue; }
      if (Math.abs(lx) > hw + HR || Math.abs(lz) > hd + HR) continue;
      let top = top0; if (s.k === "r") top = sy0 + s.sy * Math.max(0, Math.min(1, (lz + hd) / (2 * hd)));
      if (p.y + HH <= sy0 + 0.02 || p.y > top + 0.05) { if (v.y > 0 && p.y + HH > sy0 && p.y + HH < sy0 + 0.4 && Math.abs(lx) < hw && Math.abs(lz) < hd) { v.y = 0; p.y = sy0 - HH; } continue; }
      const inside = Math.abs(lx) <= hw + 0.05 && Math.abs(lz) <= hd + 0.05, step = s.k === "r" ? 0.75 : 0.35;
      if (inside && (prevY >= top - step || p.y >= top - step) && v.y <= 0.5) { p.y = top; v.y = Math.min(0, v.y); ground = s; continue; }
      // a wall: out along the shallower side
      const ox = hw + HR - Math.abs(lx), oz = hd + HR - Math.abs(lz); let nx = lx, nz = lz; if (ox < oz) nx = Math.sign(lx || 1) * (hw + HR); else nz = Math.sign(lz || 1) * (hd + HR);
      p.x = sx0 + nx * c + nz * sn; p.z = sz0 - nx * sn + nz * c; }
    if (B.bp && p.y <= 0 && Math.abs(p.x) < OB.R + 10 && Math.abs(p.z) < OB.R + 10) { p.y = 0; if (v.y < 0) v.y = 0; ground = ground || { k: "bp", surf: 0 }; }
    return ground;
  }
  const inBox = (t, p, pad = 0, h = 1.2) => { const r = (t.ry * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r), dx = p.x - t.obj.position.x, dz = p.z - t.obj.position.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    return Math.abs(lx) <= t.sx / 2 + pad && Math.abs(lz) <= (t.k === "u" || t.k === "t" ? t.sx : t.sz) / 2 + pad && p.y >= t.obj.position.y - 0.3 && p.y <= t.obj.position.y + t.sy + h; };
  // ---- the moments ----
  function card(text, secs) { const c = $(".wso-card"); c.textContent = text; c.hidden = false; c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); clearTimeout(card.t); card.t = setTimeout(() => { c.hidden = true; }, secs * 1000); }
  function bars(on) { const b = $(".wso-bars"); if (b) b.hidden = !on; }
  function respawn() { S.p.copy(S.cp.p); S.v.set(0, 0, 0); S.face = S.cp.face; S.inv = 1.2; fx.say("↩️"); }
  function hurt(fall) {
    if (S.inv > 0 || S.over) { if (fall) respawn(); return; }
    if (S.shield) { S.shield = false; S.inv = 1; fx.say("🛡️"); if (fall) respawn(); paint(); return; }
    snd("hurt"); buzz(40); env.ouch && env.ouch(hud); S.inv = 1.2;
    if (B.hp) { S.hearts--; if (S.hearts <= 0) { paint(); end(false); return; } }
    if (hero) try { hero.play("hit", { once: true }); } catch { /* no clip */ }
    if (fall) respawn(); paint(); }
  function act() { if (S.over || S.t < 0) return;
    const shop = things.find((t) => t.k === "n" && t.on && t.obj.position.distanceTo(S.p) < 3);
    if (shop) { const [id, ic, nm] = shop.shop, price = shop.b; if (S.coins < price) { fx.say("🪙 " + T("Need {n} coins", { n: price })); return; }
      S.coins -= price; snd("coin"); if (id === "speed") S.speedK = 1.25; else if (id === "djump") S.dj = true; else if (id === "heart") { if (B.hp) S.hearts = Math.min(5, S.hearts + 1); } else if (id === "shield") S.shield = true; fx.say(ic + " " + T(nm)); paint(); return; }
    if (hero) try { hero.play("attack", { once: true }); } catch { /* no clip */ }
    for (const t of bossT) if (!t.gone && t.on && t.obj.position.distanceTo(S.p) < t.sx * 0.6 + 2.2) hitBoss(t);
  }
  function hitBoss(t) { if (t.flash > 0) return; t.hp--; t.flash = 0.5; snd("hit"); buzz(25); fx.say(t.hp > 0 ? "💥 " + t.hp : "🏆");
    const away = tmp.copy(t.obj.position).sub(S.p).setY(0).normalize(); t.vx = away.x * 6; t.vz = away.z * 6;
    if (!t.phase2 && t.hp <= t.hp0 / 2) { t.phase2 = true; card("🔥 " + T("Phase 2!"), 1.2); fire("bosshalf", 0); }
    if (t.hp <= 0) { t.gone = true; S.bossLeft--; t.obj.visible = false; S.coins += t.hp0 * 5; burst(t.obj.position, 0xffd23a, 30); fire("boss", 0); card("👑 " + T("Boss defeated!"), 1.6); if (B.cn & OB.CN.clear && !ctx.reduce) S.slow = 0.6; }
    paint(); }
  const parts = []; function burst(at, col, n) { if (ctx.low && n > 12) n = 12; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(partG || (partG = new THREE.OctahedronGeometry(0.16)), glow(col)); m.position.copy(at).add(tmp.set(0, 1, 0)); scene.add(m); parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 7 + 2, (Math.random() - 0.5) * 8), t: 0.9 }); } }
  var partG;
  const balls = []; // the boss's fire balls and stomp rings
  // ---- each frame ----
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  function tick(dt0, tt) {
    let dt = Math.min(dt0, 0.04); if (S.slow > 0) { S.slow -= dt; dt *= 0.25; }
    // the intro fly-over: high over the course, sweeping from the goal back to you (a tap or a key skips it)
    if (S.intro > 0) { S.intro -= dt0; const k = 1 - Math.max(0, S.intro) / 3.6, goal = things.find((t) => t.k === "g"), gp = goal ? goal.obj.position : S.p, mid = tmp.copy(gp).lerp(S.p, k);
      bars(true); cam.position.set(mid.x + Math.sin(k * 2.4 + 0.6) * (34 - k * 22), mid.y + 22 - k * 16, mid.z + Math.cos(k * 2.4 + 0.6) * (34 - k * 22)); cam.lookAt(mid.x, mid.y, mid.z);
      if (S.intro <= 0) { bars(!!LK.bars); card(o.title || spec.title, 1.4); } animate(dt, tt); return; }
    if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-Math.min(0, S.t)); if (n1 !== n0) { const cd = $(".wst-cd"); if (cd) { cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) { setTimeout(() => cd.remove(), 700); fire("start", 0); } } } }
    else if (!S.over) { S.t += dt; if (S.bossCut > 0) { S.bossCut -= dt0; animate(dt, tt); camFollow(dt, true); return; }
      // move: the stick / WASD against the camera's turn; Shift sprints; ice keeps your slide
      const ix = (keyOn.has("d") || keyOn.has("arrowright") ? 1 : 0) - (keyOn.has("a") || keyOn.has("arrowleft") ? 1 : 0) + (pad && pad.on ? pad.x : 0), iz = (keyOn.has("w") || keyOn.has("arrowup") ? 1 : 0) - (keyOn.has("s") || keyOn.has("arrowdown") ? 1 : 0) - (pad && pad.on ? pad.y : 0);
      fwd.set(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)); right.set(-fwd.z, 0, fwd.x); const want = tmp.copy(fwd).multiplyScalar(iz).addScaledVector(right, ix); const mag = Math.min(1, want.length()); if (mag > 0.05) want.normalize();
      const sprint = keyOn.has("shift") || (pad && pad.on && Math.hypot(pad.x, pad.y) > 0.92), top = spd * S.speedK * (sprint ? 1.35 : 1) * (S.boost > 0 ? 1.4 : 1) * mag; S.boost = Math.max(0, S.boost - dt);
      const ice = S.ground && S.ground.surf === 2, accel = S.ground ? (ice ? 2.2 : 14) : 5;
      S.v.x += (want.x * top - S.v.x) * Math.min(1, dt * accel); S.v.z += (want.z * top - S.v.z) * Math.min(1, dt * accel);
      if (mag > 0.05) { const f = Math.atan2(want.x, want.z); let d = f - S.face; d = Math.atan2(Math.sin(d), Math.cos(d)); S.face += d * Math.min(1, dt * 12); }
      // jump: a moment of grace off an edge, a buffered press, a short hop when let go early; the double jump bought at a shop
      S.coyote = S.ground ? 0.12 : Math.max(0, S.coyote - dt); S.jumpQ = Math.max(0, S.jumpQ - dt);
      if (S.jumpQ > 0 && (S.coyote > 0 || (S.dj && S.jumps < 2))) { S.v.y = OBJ.VY; S.jumpQ = 0; S.jumps = S.coyote > 0 ? 1 : 2; S.coyote = 0; snd("jump"); if (hero) try { hero.play("jump", { once: true }); } catch { /* no clip */ } }
      if (!S.jumpHold && S.v.y > 3 && !S.padUp) S.v.y -= dt * OBJ.G * 1.2;
      S.v.y -= OBJ.G * dt; if (S.v.y < -32) S.v.y = -32; if (S.v.y <= 0) S.padUp = false;
      const prevY = S.p.y; S.p.addScaledVector(S.v, dt);
      // the moving things first (they carry you)
      const was = S.ground; let carry = null; if (was && was.t && (was.t.k === "m" || was.t.k === "e")) carry = was.t.obj.position.clone();
      movers(dt, tt); if (carry) { S.p.x += was.t.obj.position.x - carry.x; S.p.z += was.t.obj.position.z - carry.z; S.p.y += Math.max(0, was.t.obj.position.y - carry.y); }
      let g = collide(S.p, S.v, dt, prevY);
      if (!g && was && S.v.y <= 0 && !S.padUp) { const y0 = S.p.y; S.p.y -= 0.45; g = collide(S.p, S.v, dt, y0); if (!g) S.p.y = y0; else S.v.y = 0; } // (a small step down keeps your feet on the ground)
      S.ground = g; if (g) { S.jumps = 0; S.air = 0; } else S.air = (S.air || 0) + dt;
      if (g && g.t && g.t.k === "p") { S.v.y = Math.sqrt(2 * OBJ.G * (OBJ.UP + g.t.a * OBJ.PAD)); S.padUp = true; S.ground = null; snd("dash"); g.t.ring.scale.setScalar(1.6); }
      if (g && g.t && g.t.k === "c") checkpoint(g.t); if (g && g.t && g.t.k === "g") goal(g.t);
      // what you touch
      for (const t of things) { if (!t.on || t.gone) continue;
        if (t.k === "o" && t.obj.position.distanceTo(tmp.copy(S.p).setY(S.p.y + 0.4)) < 1.2) { t.gone = true; t.obj.visible = false; S.coins++; snd("coin"); paint(); }
        else if (t.k === "h" && t.obj.position.distanceTo(S.p) < 1.3) { t.gone = true; t.obj.visible = false; if (B.hp) S.hearts = Math.min(5, S.hearts + 1); fx.say("❤️"); paint(); }
        else if (t.k === "k" && inBox(t, S.p, 0.1, 0.2)) hurt(true);
        else if (t.k === "u" && inBox(t, S.p, 0.2, 0.6)) { if (!t.pressed) { t.pressed = true; chOpen(t.a, true); if (t.b) S.chT.set(t.a, S.t + t.b); fire("button", t.a); snd("hit"); fx.say("🔘"); } t.down = 1; }
        else if (t.k === "u") { t.pressed = t.b ? t.pressed && S.ch.has(t.a) : t.pressed; }
        else if (t.k === "t" && inBox(t, S.p, 0, 1) && S.tpCd <= 0) teleport(t);
        else if (t.k === "s" && spinHit(t)) { const tg = tmp.set(-Math.sin(t.ang + Math.PI / 2), 0, -Math.cos(t.ang + Math.PI / 2)); S.v.x = tg.x * 11 * (t.b ? -1 : 1); S.v.z = tg.z * 11 * (t.b ? -1 : 1); S.v.y = 6; S.ground = null; if (S.inv <= 0) { snd("hurt"); S.inv = 0.6; buzz(30); } } }
      S.tpCd = Math.max(0, (S.tpCd || 0) - dt);
      for (const [c, at] of S.chT) if (S.t >= at) { S.ch.delete(c); S.chT.delete(c); for (const t of things) if (t.k === "u" && t.a === c) t.pressed = false; }
      boss(dt);
      for (let i = balls.length - 1; i >= 0; i--) { const b = balls[i]; b.t -= dt;
        if (b.ring) { b.r += dt * 9; b.m.scale.setScalar(b.r); b.m.material.opacity = Math.max(0, b.t); const d = Math.hypot(S.p.x - b.m.position.x, S.p.z - b.m.position.z); if (Math.abs(d - b.r) < 0.6 && S.p.y - b.m.position.y < 0.6 && !b.hit) { b.hit = true; hurt(); } }
        else { b.m.position.addScaledVector(b.v, dt); if (b.m.position.distanceTo(tmp.copy(S.p).setY(S.p.y + 0.9)) < 0.9) { b.t = 0; hurt(); } }
        if (b.t <= 0) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); balls.splice(i, 1); } }
      if (S.p.y < minY - 12) hurt(true);
      S.inv = Math.max(0, S.inv - dt);
      if (B.tl && S.t > B.tl + S.extra) end(false);
      state();
      if (((S.t * 4) | 0) !== (((S.t - dt) * 4) | 0)) { paint(); if (S.tr.length < 120) S.tr.push([Math.round(S.p.x * 10), Math.round(S.p.z * 10), Math.round(S.p.y)]); }
      // the hero's clip: walk scaled to the speed, sprint when fast, jump / fall in the air (CU_AS names only)
      if (hero && !(hero.busy && hero.busy())) { const hs = Math.hypot(S.v.x, S.v.z), want2 = !S.ground && (S.air > 0.15 || S.v.y > 1) ? (S.v.y > 0 ? "jump" : "fall") : hs > spd * 1.15 ? "sprint" : hs > 0.6 ? "walk" : "idle";
        if (want2 !== S.clip || want2 === "walk") { S.clip = want2; try { hero.play(want2, want2 === "walk" ? { speed: Math.max(0.8, hs / 6.5) } : {}); } catch { /* no clip */ } } }
    }
    animate(dt, tt); camFollow(dt);
    me.position.copy(S.p); me.rotation.y = S.face; me.visible = !(S.inv > 0 && ((tt * 14) | 0) % 2);
    if (pet) { const want = tmp.set(S.p.x - Math.sin(S.face) * 1.4 + Math.cos(S.face) * 0.9, S.p.y, S.p.z - Math.cos(S.face) * 1.4 - Math.sin(S.face) * 0.9); pet.position.lerp(want, Math.min(1, dt * 5)); pet.position.y = S.p.y + Math.abs(Math.sin(tt * 6)) * 0.12; pet.rotation.y = S.face; }
    if (hero) hero.update(dt, tt);
    if (mapCv) map();
  }
  let minY = Math.min(0, ...B.o.map((q) => q[2])); if (B.bp) minY = Math.min(minY, -2);
  const mapCv = $(".wso-map"), mg = mapCv ? mapCv.getContext("2d") : null;
  function map() { if (((performance.now() / 120) | 0) === map.f) return; map.f = (performance.now() / 120) | 0; const k = 60 / OB.R; mg.clearRect(0, 0, 120, 120); mg.fillStyle = "rgba(6,12,30,.6)"; mg.beginPath(); mg.arc(60, 60, 58, 0, 7); mg.fill();
    for (const q of B.o) { if (q[0] === "o" || q[0] === "x") continue; mg.fillStyle = q[0] === "g" ? "#ffd23a" : q[0] === "c" ? "#7cf5c8" : q[0] === "k" ? "#ff5a2a" : q[0] === "B" ? "#ff3b5c" : "rgba(220,235,255,.55)"; const w = Math.max(2, q[5] * k), h = Math.max(2, q[7] * k); mg.fillRect(60 + q[1] * k - w / 2, 60 + q[3] * k - h / 2, w, h); }
    mg.fillStyle = "#5fd3ff"; mg.beginPath(); mg.arc(60 + S.p.x * k, 60 + S.p.z * k, 4, 0, 7); mg.fill(); }
  function movers(dt, tt) {
    for (const t of things) { if (t.k === "m") { const w = (spec.speed * 0.25 + 0.4) * (6 / Math.max(3, t.b)), s = Math.sin(tt * w) * t.b / 2; t.obj.position.copy(t.base); if (t.a === 0) t.obj.position.x += s; else if (t.a === 1) t.obj.position.y += s + t.b / 2; else t.obj.position.z += s; }
      else if (t.k === "e") { const on = S.ground && S.ground.t === t; if (on) t.wait = 1.5; else t.wait = Math.max(0, t.wait - dt); const goUp = on || t.wait > 0 && t.lift >= t.a - 0.01; t.lift = Math.max(0, Math.min(t.a, t.lift + (on || goUp ? 1 : -1) * dt * (1 + t.b))); t.obj.position.set(t.base.x, t.base.y + t.lift, t.base.z); } }
  }
  function spinHit(t) { const ang = t.ang * (t.b ? -1 : 1), dx = S.p.x - t.obj.position.x, dz = S.p.z - t.obj.position.z, r = -((t.ry * Math.PI) / 180) - ang, lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
    return Math.abs(lx) < t.sx / 2 + HR && Math.abs(lz) < t.sz / 2 + HR && S.p.y < t.obj.position.y + t.sy + 0.1 && S.p.y + HH > t.obj.position.y; }
  function teleport(t) { const pair = things.filter((q) => q.k === "t" && q.a === t.a && q.on); if (pair.length < 2) return; const idx = pair.indexOf(t), one = pair.some((q) => q.b); if (one && idx !== 0) return;
    const to = pair[(idx + 1) % pair.length]; S.p.set(to.obj.position.x, to.obj.position.y + 0.25, to.obj.position.z); S.v.set(0, 0, 0); S.tpCd = 1.2; snd("dash"); burst(to.obj.position, 0xb48cff, 14); fx.say("✨"); }
  function checkpoint(t) { if (S.cp.t === t) return; const n = L.cps.indexOf(t.i) + 1; S.cp = { p: tmp.set(t.obj.position.x, t.obj.position.y + t.sy, t.obj.position.z).clone(), face: S.face, t };
    if (n > S.cpN) { S.cpN = n; fire("checkpoint", n); } snd("coin"); fx.say("🚩 " + T("Checkpoint!")); t.beam.material.color.set(0xffd23a); burst(t.obj.position, 0x7cf5c8, 12); paint(); }
  function goal(t) { if (S.over) return; if (S.bossLeft > 0) { if (!goal.warn || S.t - goal.warn > 3) { goal.warn = S.t; fx.say("👑 " + T("Defeat the boss first!")); } return; } end(true, t); }
  function boss(dt) {
    for (const t of bossT) { if (t.gone || !t.on) continue; const pos = t.obj.position, d = Math.hypot(S.p.x - pos.x, S.p.z - pos.z);
      if (!t.seen && d < 22) { t.seen = true; if (B.cn & OB.CN.boss && !o.test && !ctx.reduce) { S.bossCut = 1.8; S.bossAt = t; bars(true); card("👑 " + T("BOSS") + " — " + T("{n} hits", { n: t.hp }), 1.8); setTimeout(() => bars(!!LK.bars), 1900); snd("hit"); } paint(); }
      if (!t.seen) continue; t.flash = Math.max(0, t.flash - dt);
      const face = Math.atan2(S.p.x - pos.x, S.p.z - pos.z); t.obj.rotation.y += (Math.atan2(Math.sin(face - t.obj.rotation.y), Math.cos(face - t.obj.rotation.y))) * Math.min(1, dt * 3);
      pos.x += t.vx * dt; pos.z += t.vz * dt; t.vx *= 0.9; t.vz *= 0.9; const hd = Math.hypot(pos.x - t.home.x, pos.z - t.home.z); if (hd > 9) { pos.x = t.home.x + ((pos.x - t.home.x) / hd) * 9; pos.z = t.home.z + ((pos.z - t.home.z) / hd) * 9; }
      t.cd -= dt * (t.phase2 ? 1.6 : 1);
      if (t.cd <= 0) { t.cd = 2.6; if (t.clips && t.mx) { const c = t.clips.find((a) => a.name === "attack"); if (c) { const a = t.mx.clipAction(c); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.play(); } }
        if (t.style === 0) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), glow(0xff7a2e, 0.9)); ring.material.side = THREE.DoubleSide; ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, pos.y + 0.1, pos.z); scene.add(ring); balls.push({ m: ring, ring: true, r: 1, t: 1.6 }); }
        else if (t.style === 1) { for (let k = -1; k <= 1; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), glow(0xff7a2e)); b.position.set(pos.x, pos.y + t.sy * 0.55, pos.z); const a = face + k * 0.25; scene.add(b); balls.push({ m: b, v: new THREE.Vector3(Math.sin(a) * 11, (S.p.y + 0.9 - b.position.y) / 1.6, Math.cos(a) * 11), t: 2.2 }); } }
        else { t.vx = Math.sin(face) * 16; t.vz = Math.cos(face) * 16; } }
      if (d < t.sx * 0.5 + HR && S.p.y < pos.y + t.sy * 0.7 && S.inv <= 0) hurt();
      if (d < t.sx * 0.5 && S.p.y >= pos.y + t.sy * 0.7 && S.p.y <= pos.y + t.sy + 0.4 && S.v.y < 0) { hitBoss(t); S.v.y = 9; } // (a stomp on its head)
      if (t.body) t.body.scale.setScalar(t.flash > 0 ? 1.12 : 1); }
  }
  function animate(dt, tt) {
    for (const t of things) { if (!t.on) continue;
      if (t.spin) { t.spin.rotation.y += dt * 2.6; t.spin.position.y = 0.6 + Math.sin(tt * 3 + t.x) * 0.15; }
      if (t.k === "s") { t.ang += dt * (0.6 + t.a * 0.45); t.pivot.rotation.y = t.ang * (t.b ? -1 : 1); }
      if (t.k === "d") { const open = S.ch.has(t.a); t.open = Math.max(0, Math.min(1, t.open + (open ? 1 : -1) * dt * 1.6)); if (t.b) { t.door.material.transparent = true; t.door.material.opacity = 1 - t.open * 0.85; } else t.door.position.y = t.open * (t.sy - 0.1); }
      if (t.k === "u") { t.down = Math.max(0, t.down - dt * 3); t.cap.position.y = 0.16 - (t.pressed ? 0.1 : 0); t.cap.material.emissive && t.cap.material.emissive.set(t.pressed ? 0x39ff88 : 0xff3b5c); }
      if (t.k === "t") t.col.material.opacity = 0.18 + Math.sin(tt * 4) * 0.08;
      if (t.ring && t.k === "p") t.ring.scale.lerp(tmp.set(1, 1, 1), Math.min(1, dt * 6));
      if (t.ring && t.k === "g") { t.ring.rotation.y += dt * 1.4; t.ring.material.color.set(S.bossLeft > 0 ? 0x888ea8 : 0xffd23a); }
      if (t.k === "k" && t.lava) t.lava.material.emissiveIntensity = 0.9 + Math.sin(tt * 5 + t.x) * 0.25; }
    for (const mx of mixers) mx.update(dt);
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t -= dt; p.v.y -= 14 * dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(Math.max(0.01, p.t)); if (p.t <= 0) { scene.remove(p.m); p.m.material.dispose(); parts.splice(i, 1); } }
  }
  const camT = new THREE.Vector3();
  function camFollow(dt, cut) {
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    if (cut && S.bossAt) { const b = S.bossAt.obj.position; cam.position.lerp(tmp.set(b.x + Math.sin(S.face) * 9, b.y + S.bossAt.sy + 2.5, b.z + Math.cos(S.face) * 9), Math.min(1, dt * 3)); cam.lookAt(b.x, b.y + S.bossAt.sy * 0.6, b.z); return; }
    if (S.over && S.won) { const a = S.t * 0.6; cam.position.lerp(tmp.set(S.p.x + Math.sin(a) * 6, S.p.y + 2.6, S.p.z + Math.cos(a) * 6), Math.min(1, dt * 2)); cam.lookAt(S.p.x, S.p.y + 1.2, S.p.z); return; }
    if (!drag && Math.hypot(S.v.x, S.v.z) > 1 && !(pad && pad.on && Math.abs(pad.x) > 0.6)) { const want = S.face + Math.PI; let d = want - look.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); look.yaw += d * Math.min(1, dt * 0.9); } // (the camera drifts behind you as you run)
    const D = LK.dist * (look.zoom || 1), cp = Math.cos(look.pitch);
    camT.set(S.p.x + Math.sin(look.yaw) * D * cp, S.p.y + 1.6 + Math.sin(look.pitch) * D, S.p.z + Math.cos(look.yaw) * D * cp);
    // the camera stays out of the blocks: pulled in when one stands between it and you
    const ray = new THREE.Ray(tmp.set(S.p.x, S.p.y + 1.5, S.p.z), camT.clone().sub(tmp).normalize()); let near = D;
    for (const s of solids) { if (!s.on || s.k === "c" || s.k === "S" || s.k === "g" || s.k === "p") continue; const t = s.t, x0 = t ? t.obj.position.x : s.x, y0 = t ? t.obj.position.y : s.y, z0 = t ? t.obj.position.z : s.z, r = Math.max(s.sx, s.sz) / 2;
      const bb = new THREE.Box3(new THREE.Vector3(x0 - r, y0, z0 - r), new THREE.Vector3(x0 + r, y0 + s.sy, z0 + r)), hit = ray.intersectBox(bb, new THREE.Vector3()); if (hit) { const dd = hit.distanceTo(ray.origin); if (dd > 0.6 && dd < near) near = dd - 0.3; } }
    if (near < D) camT.copy(ray.origin).addScaledVector(ray.direction, Math.max(1.6, near));
    cam.position.lerp(camT, Math.min(1, dt * 9)); cam.lookAt(S.p.x, S.p.y + 1.3, S.p.z);
  }
  hud.querySelector(".wst-hx").addEventListener("click", () => leave());
  async function end(done) {
    if (S.over) return; S.over = true; S.won = done; if (pad) pad.hide(); paint();
    if (hero) try { hero.play(done ? "emote-yes" : "die", { once: !done }); } catch { /* no clip */ }
    if (done && B.cn & OB.CN.clear && !ctx.reduce) { S.slow = 1.2; bars(true); burst(S.p, 0xffd23a, 26); await new Promise((r) => setTimeout(r, 1500)); }
    if (done && !o.test) try { const k = "arc.studio.obbest." + (o.id || "t"); if (!best || S.t < best) localStorage.setItem(k, S.t.toFixed(1)); } catch { /* not kept */ }
    const dist = done ? L.len : S.cpN * 100;
    await result(o, hud, { trace: S.tr, coins: S.coins, dist, done, line: `🚩 ${S.cpN}/${L.cps.length} · 🪙 ${S.coins} · ⏱ ${S.t.toFixed(1)} s${bossT.length ? ` · 👑 ${bossT.length - S.bossLeft}/${bossT.length}` : ""}`, head: done ? "🏆 " + T("Course cleared!") : "💀 " + T(B.tl && S.t > B.tl + S.extra ? "Time's up" : "Out of hearts"), confetti: done }, leave);
  }
  function leave(again) {
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); removeEventListener("pointermove", pmv); removeEventListener("pointerup", pup);
    if (cv) cv.style.filter = cvF;
    st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio"); if (hero) me.remove(hero.obj); if (pet) scene.remove(pet);
    scene.userData.live = false; for (const mx of mixers) mx.stopAllAction();
    scene.traverse((m) => { if (m.geometry && !Object.values(G).includes(m.geometry)) m.geometry.dispose(); if (m.material && !m.isSkinnedMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (!MT.all().includes(x)) x.dispose(); }); });
    Object.values(G).forEach((g) => g.dispose()); MT.all().forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); if (bpM) { if (bpM.map) bpM.map.dispose(); }
    env.back(again, o);
  }
  st.view(scene, cam); st.solo(tick); tick(0.016, 0); paint();
  return { S, L, leave, isObby: true, keys: keyOn, look, things, act, jump: () => { S.jumpQ = 0.15; S.jumpHold = true; setTimeout(() => { S.jumpHold = false; }, 300); },
    clips: () => (hero && hero.mixer ? hero.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x.getClip().name) : []) };
}
