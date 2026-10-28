// world-hwrealm.js — the HALLOWEEN REALM (2026-10-28, the owner's spec v1.0 and answers: a permanent land of its own, the
// town's Pumpkin Kings stay, the Inferno Jack set as items of their own, the high grounds up to Lv 400, no trading yet).
// LANDS.hw far off like the other lands, reached through the Haunted Pumpkin Gate on the plaza's ring (world-lands.js);
// Pumpkin Village in the middle (the merchant, the set's forge, Trick or Treat, the way home), six hunting grounds round it
// (world-hwrealm-data.js GROUNDS) that the town's fights treat as their own (world-rpg-data.js XZONES: the realm's
// monsters, levels fitted to you, the Cursed Night's ×1.5 and the server's drops). The clock is the server's: 20 minutes of
// day, 10 of night. Each model is Meshy's (raw/hr → models/world/hwrealm, packed: props 1–5 k tris, buildings ≤ 12 k,
// KTX2 ≤ 1024 px), repeats instanced, loaded the first time you're in; the drawn stand-ins until then.
//   makeHwRealm({ THREE, K, planet, T, low, ver, esc }) → { group, doors, back, solids, show(on), tick(dt, t, me), arrival(),
//     marks(), clock(), onNight(fn), grounds }
import { HW, GROUNDS, groundXZ, clockOf, RARE, SET, pieceOf, pieceStats, setBonus } from "./world-hwrealm-data.js";
import { XZONES } from "./world-rpg-data.js";
export { HW, GROUNDS, SET, clockOf, pieceOf, pieceStats, setBonus };

const rad = (a) => (a * Math.PI) / 180;
const polar = (a, r) => [Math.sin(rad(a)) * r, Math.cos(rad(a)) * r]; // a = 0 is south (+z, the way in), 90 east
// each ground's floor (images/hwrealm ground-*) and its tint
const FLOOR = { "hw-patch": ["ground", 0xffffff], "hw-forest": ["ground", 0x7fae8a], "hw-grave": ["ground-grave", 0xffffff], "hw-candy": ["ground-candy", 0xffffff], "hw-clock": ["ground-grave", 0x9fb8e8], "hw-throne": ["ground-grave", 0xe07a5a] };

export function makeHwRealm({ THREE, K, planet, T = (s) => s, low = false, ver = "", esc = (s) => s }) {
  const L = HW.LAND, g = new THREE.Group(); g.name = "land-hw"; g.position.set(L.x, 0, L.z); g.visible = false; planet.add(g);
  const spins = [], solids = [], doors = [], marks = [], nightFns = [];
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.05, ...o });
  const neon = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  const tl = new THREE.TextureLoader(), tex = (name, rep, on) => { try { tl.load(`/images/hwrealm/${name}-${low ? 512 : 1024}.webp${ver}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; on(t); }); } catch { /* the plain colour stays */ } };
  const off = (n) => ({ polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n });
  const canvasTex = (w, h, draw) => { if (typeof document === "undefined") return null; const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };

  // ---------------- the ground: autumn grass with fallen leaves; the village's square; each ground's own floor ----------------
  { const gm = std(0x6a5a3a), ground = new THREE.Mesh(new THREE.CircleGeometry(L.r + 60, 96), gm); ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; ground.receiveShadow = !low; ground.name = "hw-ground"; g.add(ground);
    tex("ground", 26, (t) => { gm.map = t; gm.color.set(0xffffff); gm.needsUpdate = true; });
    const sq = std(0x8a7a64, off(2)), plaza = new THREE.Mesh(new THREE.CircleGeometry(HW.VILLAGE_R, 64), sq); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; g.add(plaza);
    tex("ground-grave", 5, (t) => { sq.map = t; sq.color.set(0xd8b890); sq.needsUpdate = true; });
    for (const [r, w, c, op] of [[HW.VILLAGE_R, 0.14, 0xff8a1f, 0.9], [L.r, 0.2, 0xb48cff, 0.7], [9, 0.08, 0x7cf5c8, 0.8]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 4, 160), neon(c, op)); m.rotation.x = Math.PI / 2; m.position.y = 0.06; g.add(m); }
    // a magic circle in the square's middle: a glowing pumpkin rune that breathes
    const rune = canvasTex(512, 512, (x, w) => { x.translate(w / 2, w / 2); x.strokeStyle = "#ffb04a"; x.lineWidth = 10; x.globalAlpha = 0.9; x.beginPath(); x.arc(0, 0, 230, 0, 7); x.stroke(); x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 196, 0, 7); x.stroke();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2, b = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2; x.beginPath(); x.moveTo(Math.cos(a) * 196, Math.sin(a) * 196); x.lineTo(Math.cos(b) * 196, Math.sin(b) * 196); x.stroke(); }
      x.fillStyle = "#ff8a1f"; x.globalAlpha = 0.85; x.beginPath(); x.ellipse(0, 6, 64, 54, 0, 0, 7); x.fill(); x.fillStyle = "#2a1408"; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 34, -14); x.lineTo(s * 12, -14); x.lineTo(s * 23, -34); x.fill(); } x.fillRect(-30, 18, 60, 10); });
    if (rune) { const rm = new THREE.MeshBasicMaterial({ map: rune, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), rc = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), rm); rc.rotation.x = -Math.PI / 2; rc.position.y = 0.08; g.add(rc); spins.push((dt, t) => { rc.rotation.z = t * 0.12; rm.opacity = 0.55 + Math.sin(t * 1.6) * 0.25; }); }
    for (const G of GROUNDS) {
      const [x, z] = groundXZ(G).map((v, i) => v - (i ? L.z : L.x)), [name, tint] = FLOOR[G.id], fm = std(tint, off(3)), d = new THREE.Mesh(new THREE.CircleGeometry(G.r, 64), fm);
      d.rotation.x = -Math.PI / 2; d.position.set(x, 0.035, z); g.add(d); tex(name, Math.max(3, Math.round(G.r / 5)), (t) => { fm.map = t; fm.needsUpdate = true; });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(G.r, 0.16, 4, 120), neon(G.color, 0.85)); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.07, z); g.add(ring);
      // a path from the square to the ground, glowing at its edges in the ground's colour
      const len = G.d - G.r - HW.VILLAGE_R; if (len > 2) { const [cx, cz] = polar(G.a, HW.VILLAGE_R + len / 2), pm = std(0x7a6a54, off(2)), p = new THREE.Mesh(new THREE.PlaneGeometry(5, len), pm); p.rotation.set(-Math.PI / 2, 0, rad(G.a)); p.position.set(cx, 0.04, cz); g.add(p);
        tex("ground-grave", 2, (t) => { const t2 = t.clone(); t2.repeat.set(1, Math.max(2, Math.round(len / 5))); t2.needsUpdate = true; pm.map = t2; pm.color.set(0xc8a880); pm.needsUpdate = true; });
        for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.14, len), neon(G.color, 0.75)); e.rotation.set(-Math.PI / 2, 0, rad(G.a)); const [ox, oz] = polar(G.a + 90, s * 2.5); e.position.set(cx + ox, 0.05, cz + oz); g.add(e); } }
      const s = board(T(G.name), T("Level {a}–{b}", { a: G.lv[0], b: G.lv[1] }), "#" + G.color.toString(16).padStart(6, "0")); if (s) { const [bx, bz] = polar(G.a, G.d - G.r + 1.5); s.position.set(bx, 3.6, bz); g.add(s); } // (at the ground's near edge, where its path comes in: not over the village)
      const mk = new THREE.Group(); mk.position.set(x, 0, z); g.add(mk); marks.push({ g: mk, css: "#" + G.color.toString(16).padStart(6, "0"), s: 5, ch: G.jack ? "🎃" : "⚔️" });
    }
  }
  // ---------------- the sky past the land: Meshy's dusk and night backdrops round it, a red moon at night ----------------
  const skyM = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, depthWrite: false }), skyT = {};
  { const R = 560, H = ((Math.PI * 2 * R) / 3) * (768 / 1344), cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), skyM); cyl.position.y = H / 2 - 80; cyl.renderOrder = -5; cyl.frustumCulled = false; cyl.name = "hw-sky"; g.add(cyl);
    for (const k of ["day", "night"]) try { tl.load(`/images/hwrealm/sky-${k}-${low ? 768 : 1344}.webp${ver}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); skyT[k] = t; paintSky(); }); } catch { /* the plain sky */ } }
  const moon = new THREE.Mesh(new THREE.CircleGeometry(38, 48), new THREE.MeshBasicMaterial({ color: 0xff3a2a, fog: false, toneMapped: false, transparent: true, opacity: 0.92 })); moon.position.set(-140, 210, -480); moon.lookAt(0, 20, 0); moon.visible = false; g.add(moon);
  // ---------------- a sign that turns to face you ----------------
  function board(title, sub, col, w = 10) {
    const t = canvasTex(1024, 300, (x) => { x.beginPath(); if (x.roundRect) x.roundRect(8, 8, 1008, 284, 44); else x.rect(8, 8, 1008, 284); x.fillStyle = "rgba(24,10,30,.88)"; x.fill(); x.lineWidth = 8; x.strokeStyle = col; x.stroke();
      x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round"; x.font = "900 84px Sora, 'Segoe UI', sans-serif"; x.lineWidth = 12; x.strokeStyle = "rgba(8,2,12,.92)"; x.strokeText(title, 512, 116, 860); x.fillStyle = "#fff"; x.fillText(title, 512, 116, 860);
      x.font = "800 44px Sora, 'Segoe UI', sans-serif"; x.lineWidth = 8; x.strokeText(sub, 512, 212, 820); x.fillStyle = col; x.fillText(sub, 512, 212, 820); });
    if (!t) return null; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.293), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false })); m.renderOrder = 11;
    const qp = new THREE.Quaternion(); m.onBeforeRender = (r, sc, cam) => { g.getWorldQuaternion(qp); m.quaternion.copy(qp.invert().multiply(cam.quaternion)); m.updateMatrixWorld(); };
    return m;
  }
  function door(o, id, col, d) {
    const dr = new THREE.Group(); dr.name = "hw-door:" + id; dr.position.set(0, 0, d); dr.userData.radius = 1; dr.userData.b = id; o.add(dr); doors.push(dr);
    const pad = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 40), neon(col, 0.85)); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.07; dr.add(pad);
    spins.push((dt, t) => { pad.material.opacity = 0.6 + Math.sin(t * 3) * 0.25; });
  }
  const solid = (o, r) => { const s = new THREE.Group(); s.userData.radius = r; o.add(s); solids.push(s); };
  // ---------------- the village: what stands where (a = direction from the square's middle, d = how far out) ----------------
  const SPOTS = [
    { id: "hwshop", glb: "shop", a: 300, d: 17, fp: 9, name: "Pumpkin Merchant", sub: "The Inferno Jack set · what you hold", col: 0xff8a1f },
    { id: "hwforge", glb: "forge", a: 60, d: 17, fp: 9, name: "Soul Forge", sub: "Craft · enhance · salvage", col: 0xb48cff },
    { id: "hwtreat", glb: "chest", a: 180, d: 12, fp: 3.2, name: "Trick or Treat", sub: "The realm's clock and its rules", col: 0x7cf5c8 },
    { id: "", glb: "house", a: 120, d: 19, fp: 8 }, { id: "", glb: "house", a: 240, d: 19, fp: 8, turn: 0.4 },
  ];
  const holders = SPOTS.map((S) => {
    const o = new THREE.Group(), [x, z] = polar(S.a, S.d); o.position.set(x, 0, z); o.rotation.y = Math.atan2(-x, -z) + (S.turn || 0); g.add(o); S.o = o;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(S.fp * 0.7, S.fp * 0.55, S.fp * 0.7), std(S.col || 0x6a3a1a, { emissive: S.col || 0x2a1008, emissiveIntensity: 0.15 })); stand.position.y = S.fp * 0.275; stand.name = "hw-stand"; o.add(stand); S.stand = stand;
    solid(o, S.fp * 0.42); if (S.id) { door(o, S.id, S.col, S.fp * 0.5 + 1.6); const b = board(T(S.name), T(S.sub), "#" + S.col.toString(16).padStart(6, "0"), 8); if (b) { b.position.set(0, S.fp * 0.9 + 1.4, 0); o.add(b); } marks.push({ g: o, css: "#" + S.col.toString(16).padStart(6, "0"), s: 4, ch: S.id === "hwshop" ? "🛍️" : S.id === "hwforge" ? "🔥" : "🍬" }); }
    return S;
  });
  // ---------------- the way home ----------------
  const back = K.makePortal(T("Back to town")); back.name = "hw-back"; back.userData.radius = 1.6; back.userData.to = "town"; spins.push(...(back.userData.spin || []));
  { const [x, z] = polar(0, HW.VILLAGE_R - 3); back.position.set(x, 0, z); back.rotation.y = Math.atan2(-x, -z) + Math.PI; g.add(back); }
  // ---------------- each ground's landmark and its props (instanced): trees, tombs, lanterns ----------------
  const LANDMARK = { "hw-candy": ["factory", 16], "hw-clock": ["clock", 14], "hw-throne": ["throne", 16], "hw-patch": ["house", 7] };
  const PROPS = [ // [model, height, where: ground id / "village", how many (low: half)]
    ["tree", 7, "hw-forest", 18], ["tree", 6, "hw-patch", 5], ["tree", 6.5, "hw-grave", 5], ["tomb", 1.8, "hw-grave", 16], ["tomb", 1.6, "hw-clock", 6], ["lantern", 1.6, "village", 12], ["lantern", 1.6, "hw-candy", 6], ["lantern", 1.8, "hw-throne", 8], ["chest", 1.2, "hw-forest", 2],
  ];
  const rnd = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; };
  function spotsOf(where, n, seed) {
    const R = rnd(seed), out = [];
    if (where === "village") { for (let i = 0; i < n; i++) { const a = (i / n) * 360 + 15, [x, z] = polar(a, HW.VILLAGE_R - 1.2); out.push([x, z, R() * 6.28]); } return out; }
    const G = GROUNDS.find((q) => q.id === where), [cx, cz] = groundXZ(G).map((v, i) => v - (i ? L.z : L.x));
    for (let i = 0, k = 0; i < n && k < n * 8; k++) { const a = R() * 6.283, r = G.r * (0.35 + R() * 0.6), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (Math.hypot(x, z) < HW.VILLAGE_R + 4) continue; out.push([x, z, R() * 6.28]); i++; }
    return out;
  }
  const loaded = {}; let started = false;
  function fit(sc, h) { const box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), k = h / (sz.y || 1); sc.scale.setScalar(k); sc.position.set(-(box.min.x + sz.x / 2) * k, -box.min.y * k, -(box.min.z + sz.z / 2) * k); return Math.max(sz.x, sz.z) * k; }
  const load = (name) => new Promise((ok) => { if (!K.gltfLoader) return ok(null); try { K.gltfLoader().load(`/models/world/hwrealm/${name}.glb${ver}`, (x) => ok(x.scene), undefined, () => ok(null)); } catch { ok(null); } });
  // one InstancedMesh a mesh of the model, a matrix each spot (the model's own transform under it)
  function instance(scene, h, list, name) {
    const holder = new THREE.Group(); fit(scene, h); holder.add(scene); holder.updateMatrixWorld(true); const M = new THREE.Matrix4(), out = new THREE.Group(); out.name = "hw-props:" + name;
    holder.traverse((m) => { if (!m.isMesh) return; const im = new THREE.InstancedMesh(m.geometry, m.material, list.length); im.castShadow = !low && h > 3; im.receiveShadow = false;
      list.forEach(([x, z, r], i) => { M.makeRotationY(r).setPosition(x, 0, z).multiply(m.matrixWorld); im.setMatrixAt(i, M); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); out.add(im); });
    g.add(out); return out;
  }
  async function loadModels() {
    if (started) return; started = true;
    for (const S of holders) { const sc = await load(S.glb); if (!sc) continue; const w = fit(sc, S.fp); sc.traverse((m) => { if (m.isMesh) { m.castShadow = !low; m.receiveShadow = false; } }); S.o.add(sc); S.stand.visible = false; loaded[S.glb] = 1; void w; }
    for (const [id, [name, h]] of Object.entries(LANDMARK)) { const G = GROUNDS.find((q) => q.id === id), sc = await load(name); if (!sc) continue; const [cx, cz] = groundXZ(G).map((v, i) => v - (i ? L.z : L.x)), [ox, oz] = polar(G.a, G.r * 0.62), o = new THREE.Group();
      o.position.set(cx + ox, 0, cz + oz); o.rotation.y = Math.atan2(-ox, -oz); fit(sc, h); sc.traverse((m) => { if (m.isMesh) { m.castShadow = !low; m.receiveShadow = false; } }); o.add(sc); g.add(o); solid(o, h * 0.32); loaded[name] = 1; }
    const byModel = {}; for (const [name, h, where, n] of PROPS) (byModel[name + "|" + h] = byModel[name + "|" + h] || []).push(...spotsOf(where, low ? Math.ceil(n / 2) : n, name + where));
    for (const [key, list] of Object.entries(byModel)) { const [name, h] = key.split("|"), sc = await load(name); if (!sc) continue; instance(sc, Number(h), list, name); loaded["p-" + name] = 1; }
  }
  // ---------------- the clock: 20 minutes of day, 10 of night (the server's: clockOf), for everyone the same ----------------
  let clk = clockOf(Date.now()), skew = 0, nightOn = null;
  function paintSky() { const t = skyT[clk.night ? "night" : "day"]; if (t) { skyM.map = t; skyM.color.set(0xffffff); } else skyM.color.set(clk.night ? 0x2a1440 : 0xd88a4a); skyM.needsUpdate = true; moon.visible = clk.night; }
  paintSky();
  // the grounds, for the fights (world-combat.js reads zoneAt → XZONES)
  const grounds = GROUNDS.map((G) => { const [x, z] = groundXZ(G); return { ...G, x, z, realm: "hw", realmName: "Halloween Realm", fit: true, claimTier: 4, rskin: RARE.skin, rname: RARE.name, nightK: () => (clk.night ? HW.NIGHT : null), rareP: () => RARE.chance * (clk.night ? HW.NIGHT.rare : 1) }; });
  for (const z of grounds) if (!XZONES.some((q) => q.id === z.id)) XZONES.push(z);
  let shown = false;
  return {
    group: g, doors, back, solids, grounds,
    show(on) { on = !!on; if (on === shown) return; shown = on; g.visible = on; if (on) loadModels(); },
    tick(dt, t) {
      clk = clockOf(Date.now() + skew); if (nightOn !== clk.night) { const was = nightOn; nightOn = clk.night; paintSky(); if (was != null) for (const f of nightFns) try { f(clk.night); } catch { /* fine */ } }
      if (shown) for (const f of spins) f(dt, t);
    },
    setSkew(ms) { skew = Number(ms) || 0; },
    clock: () => clk, onNight(fn) { nightFns.push(fn); },
    arrival: () => { const [x, z] = polar(0, HW.VILLAGE_R - 8); return { x: L.x + x, z: L.z + z, c: { x: L.x, z: L.z } }; },
    marks: () => marks, door: (id) => doors.find((d) => d.userData.b === id) || null, loaded: () => ({ ...loaded }),
    groundTo(id) { const G = GROUNDS.find((q) => q.id === id); if (!G) return null; const [x, z] = groundXZ(G), [ox, oz] = polar(G.a, G.r - 4); return { x: x - ox, z: z - oz, c: { x, z } }; },
  };
}
