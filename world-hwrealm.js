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
import { HW, GROUNDS, groundXZ, clockOf, nightOf, RARE, SET, pieceOf, pieceStats, setBonus } from "./world-hwrealm-data.js";
import { XZONES } from "./world-rpg-data.js";
import { makeHwTerrain } from "./world-hwterrain.js";
export { HW, GROUNDS, SET, clockOf, nightOf, pieceOf, pieceStats, setBonus };

const rad = (a) => (a * Math.PI) / 180;
const polar = (a, r) => [Math.sin(rad(a)) * r, Math.cos(rad(a)) * r]; // a = 0 is south (+z, the way in), 90 east

export function makeHwRealm({ THREE, K, planet, T = (s) => s, low = false, ver = "", esc = (s) => s }) {
  const L = HW.LAND, g = new THREE.Group(); g.name = "land-hw"; g.position.set(L.x, 0, L.z); g.visible = false; planet.add(g);
  const spins = [], solids = [], doors = [], marks = [], nightFns = [];
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.05, ...o });
  const neon = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  const tl = new THREE.TextureLoader(), tex = (name, rep, on) => { try { tl.load(`/images/hwrealm/${name}-${low ? 512 : 1024}.webp${ver}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; on(t); }); } catch { /* the plain colour stays */ } };
  const off = (n) => ({ polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n });
  const canvasTex = (w, h, draw) => { if (typeof document === "undefined") return null; const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };

  // ---------------- the land (HT1): one rolling terrain with the dead forest, the swamp and the roads (world-hwterrain.js);
  // no pads — each ground is a region of it. The village's square keeps its cobbles and the pumpkin rune ----------------
  const KEEP = [[0, 0, HW.VILLAGE_R + 6]]; for (const G of GROUNDS) { const [cx, cz] = polar(G.a, G.d), [ox, oz] = polar(G.a, G.r * 0.62); const [ax, az] = polar(G.a, G.d - G.r + 4); KEEP.push([cx + ox, cz + oz, 12], [cx, cz, 10], [ax, az, 8]); } // (its landmark, its middle, where you arrive)
  const TR = makeHwTerrain(THREE, { HW, GROUNDS, low, keep: KEEP, tex: (on) => tex("ground", 1, on) }), hAt = TR.h;
  g.add(TR.mesh, TR.forest); if (TR.water) g.add(TR.water);
  { const sq = std(0x8a7a64, off(2)), plaza = new THREE.Mesh(new THREE.CircleGeometry(HW.VILLAGE_R, 64), sq); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; g.add(plaza);
    tex("ground-grave", 5, (t) => { sq.map = t; sq.color.set(0xd8b890); sq.needsUpdate = true; });
    const vr = new THREE.Mesh(new THREE.TorusGeometry(HW.VILLAGE_R, 0.14, 4, 160), neon(0xff8a1f, 0.9)); vr.rotation.x = Math.PI / 2; vr.position.y = 0.06; g.add(vr);
    // a magic circle in the square's middle: a glowing pumpkin rune that breathes
    const rune = canvasTex(512, 512, (x, w) => { x.translate(w / 2, w / 2); x.strokeStyle = "#ffb04a"; x.lineWidth = 10; x.globalAlpha = 0.9; x.beginPath(); x.arc(0, 0, 230, 0, 7); x.stroke(); x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 196, 0, 7); x.stroke();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2, b = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2; x.beginPath(); x.moveTo(Math.cos(a) * 196, Math.sin(a) * 196); x.lineTo(Math.cos(b) * 196, Math.sin(b) * 196); x.stroke(); }
      x.fillStyle = "#ff8a1f"; x.globalAlpha = 0.85; x.beginPath(); x.ellipse(0, 6, 64, 54, 0, 0, 7); x.fill(); x.fillStyle = "#2a1408"; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 34, -14); x.lineTo(s * 12, -14); x.lineTo(s * 23, -34); x.fill(); } x.fillRect(-30, 18, 60, 10); });
    if (rune) { const rm = new THREE.MeshBasicMaterial({ map: rune, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), rc = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), rm); rc.rotation.x = -Math.PI / 2; rc.position.y = 0.08; g.add(rc); spins.push((dt, t) => { rc.rotation.z = t * 0.12; rm.opacity = 0.55 + Math.sin(t * 1.6) * 0.25; }); }
    // a signpost where each road leaves the village: the ground it leads to and its levels (the land itself shows no edges)
    for (const G of GROUNDS) { const [bx, bz] = polar(G.a, HW.VILLAGE_R + 3.5), col = "#" + G.color.toString(16).padStart(6, "0"), s = board(T(G.name), T("Level {a}–{b}", { a: G.lv[0], b: G.lv[1] }), col, 6);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.4, 6), std(0x3a2a20)); post.position.set(bx, 1.2, bz); g.add(post); if (s) { s.position.set(bx, 2.9, bz); g.add(s); }
      const [x, z] = polar(G.a, G.d), mk = new THREE.Group(); mk.position.set(x, hAt(x, z), z); g.add(mk); marks.push({ g: mk, css: col, s: 5, ch: G.jack ? "🎃" : "⚔️" }); }
  }
  // ---------------- the sky past the land: Meshy's dusk and night backdrops round it, a red moon at night ----------------
  const skyM = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, depthWrite: false }), skyT = {};
  // HX2: the night's sky on a second cylinder just inside the first, faded in over a few seconds (the curse's arrival)
  const skyN = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 });
  { const R = 560, H = ((Math.PI * 2 * R) / 3) * (768 / 1344), cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), skyM); cyl.position.y = H / 2 - 80; cyl.renderOrder = -5; cyl.frustumCulled = false; cyl.name = "hw-sky"; g.add(cyl);
    const cyl2 = new THREE.Mesh(cyl.geometry, skyN); cyl2.scale.setScalar(0.995); cyl2.position.copy(cyl.position); cyl2.renderOrder = -4; cyl2.frustumCulled = false; g.add(cyl2);
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
    { id: "hwtreat", glb: "chest", a: 180, d: 12, fp: 3.2, name: "Trick or Treat", sub: "Knock once a day · the realm's clock", col: 0x7cf5c8 },
    { id: "hwhouse1", glb: "house", a: 120, d: 19, fp: 8, col: 0xff9a2e }, { id: "hwhouse2", glb: "house", a: 240, d: 19, fp: 8, turn: 0.4, col: 0xff9a2e }, // (HX2: their doors are knocked on)
  ];
  const holders = SPOTS.map((S) => {
    const o = new THREE.Group(), [x, z] = polar(S.a, S.d); o.position.set(x, 0, z); o.rotation.y = Math.atan2(-x, -z) + (S.turn || 0); g.add(o); S.o = o;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(S.fp * 0.7, S.fp * 0.55, S.fp * 0.7), std(S.col || 0x6a3a1a, { emissive: S.col || 0x2a1008, emissiveIntensity: 0.15 })); stand.position.y = S.fp * 0.275; stand.name = "hw-stand"; o.add(stand); S.stand = stand;
    solid(o, S.fp * 0.42); if (S.id) door(o, S.id, S.col, S.fp * 0.5 + 1.6); if (S.id && S.name) { const b = board(T(S.name), T(S.sub), "#" + S.col.toString(16).padStart(6, "0"), 8); if (b) { b.position.set(0, S.fp * 0.9 + 1.4, 0); o.add(b); } marks.push({ g: o, css: "#" + S.col.toString(16).padStart(6, "0"), s: 4, ch: S.id === "hwshop" ? "🛍️" : S.id === "hwforge" ? "🔥" : "🍬" }); }
    return S;
  });
  // ---------------- the way home ----------------
  const back = K.makePortal(T("Back to town")); back.name = "hw-back"; back.userData.radius = 1.6; back.userData.to = "town"; spins.push(...(back.userData.spin || []));
  { const [x, z] = polar(0, HW.VILLAGE_R - 3); back.position.set(x, 0, z); back.rotation.y = Math.atan2(-x, -z) + Math.PI; g.add(back); }
  // ---------------- each ground's landmark and its props (instanced): trees, tombs, lanterns ----------------
  const LANDMARK = { "hw-candy": ["factory", 16], "hw-clock": ["clock", 14], "hw-throne": ["throne", 16], "hw-patch": ["house", 7] };
  const PROPS = [ // [model, height, where: ground id / "village", how many (low: half)]
    // (HT1: Meshy's tree as the forest's big ones among the drawn dead forest; tombs over the Graveyard's hill; lanterns down every road)
    ["tree", 8.5, "hw-forest", 10], ["tree", 7, "hw-patch", 4], ["tree", 7.5, "hw-grave", 4], ["tree", 7, "hw-clock", 3], ["tomb", 1.8, "hw-grave", 44], ["tomb", 1.6, "hw-clock", 10], ["tomb", 1.6, "hw-throne", 6], ["lantern", 1.6, "village", 12], ["lantern", 1.7, "roads", 34], ["lantern", 1.6, "hw-candy", 8], ["lantern", 1.8, "hw-throne", 8], ["chest", 1.2, "hw-forest", 2],
  ];
  const rnd = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; };
  function spotsOf(where, n, seed) {
    const R = rnd(seed), out = [];
    if (where === "village") { for (let i = 0; i < n; i++) { const a = (i / n) * 360 + 15, [x, z] = polar(a, HW.VILLAGE_R - 1.2); out.push([x, z, R() * 6.28]); } return out; }
    if (where === "roads") { const segs = TR.roads, per = Math.ceil(n / segs.length); segs.forEach((q, si) => { for (let k = 1; k <= per; k++) { const t = k / (per + 1), x = q[0] + (q[2] - q[0]) * t, z = q[1] + (q[3] - q[1]) * t, dx = q[3] - q[1], dz = -(q[2] - q[0]), l = Math.hypot(dx, dz) || 1, sd = (k + si) % 2 ? 3.4 : -3.4; out.push([x + (dx / l) * sd, z + (dz / l) * sd, R() * 6.28]); } }); return out.slice(0, n); }
    const G = GROUNDS.find((q) => q.id === where), [cx, cz] = groundXZ(G).map((v, i) => v - (i ? L.z : L.x));
    for (let i = 0, k = 0; i < n && k < n * 8; k++) { const a = R() * 6.283, r = G.r * (0.35 + R() * 0.6), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (Math.hypot(x, z) < HW.VILLAGE_R + 4 || TR.roadD(x, z) < 3 || TR.wet(x, z)) continue; out.push([x, z, R() * 6.28]); i++; }
    return out;
  }
  const loaded = {}; let started = false;
  function fit(sc, h) { const box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), k = h / (sz.y || 1); sc.scale.setScalar(k); sc.position.set(-(box.min.x + sz.x / 2) * k, -box.min.y * k, -(box.min.z + sz.z / 2) * k); return Math.max(sz.x, sz.z) * k; }
  const load = (name) => new Promise((ok) => { if (!K.gltfLoader) return ok(null); try { K.gltfLoader().load(`/models/world/hwrealm/${name}.glb${ver}`, (x) => ok(x.scene), undefined, () => ok(null)); } catch { ok(null); } });
  // one InstancedMesh a mesh of the model, a matrix each spot (the model's own transform under it)
  function instance(scene, h, list, name) {
    const holder = new THREE.Group(); fit(scene, h); holder.add(scene); holder.updateMatrixWorld(true); const M = new THREE.Matrix4(), out = new THREE.Group(); out.name = "hw-props:" + name;
    holder.traverse((m) => { if (!m.isMesh) return; if (/lantern|tree/.test(name) && m.material && m.material.emissive && !m.material.userData.lit) { const mt = m.material; mt.userData.lit = 1; mt.userData.e0 = mt.emissiveIntensity || 0; mt.emissive.set(0xff8a1f); lanterns.push(mt); }
      const im = new THREE.InstancedMesh(m.geometry, m.material, list.length); im.castShadow = !low && h > 3; im.receiveShadow = false;
      list.forEach(([x, z, r], i) => { M.makeRotationY(r).setPosition(x, hAt(x, z) - 0.08, z).multiply(m.matrixWorld); im.setMatrixAt(i, M); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); out.add(im); });
    g.add(out); return out;
  }
  async function loadModels() {
    if (started) return; started = true;
    for (const S of holders) { const sc = await load(S.glb); if (!sc) continue; const w = fit(sc, S.fp); sc.traverse((m) => { if (m.isMesh) { m.castShadow = !low; m.receiveShadow = false; } }); S.o.add(sc); S.stand.visible = false; loaded[S.glb] = 1; void w; }
    for (const [id, [name, h]] of Object.entries(LANDMARK)) { const G = GROUNDS.find((q) => q.id === id), sc = await load(name); if (!sc) continue; const [cx, cz] = groundXZ(G).map((v, i) => v - (i ? L.z : L.x)), [ox, oz] = polar(G.a, G.r * 0.62), o = new THREE.Group();
      o.position.set(cx + ox, Math.min(hAt(cx + ox, cz + oz), hAt(cx + ox * 0.85, cz + oz * 0.85)) - 0.3, cz + oz); o.rotation.y = Math.atan2(-ox, -oz); fit(sc, h); sc.traverse((m) => { if (m.isMesh) { m.castShadow = !low; m.receiveShadow = false; } }); o.add(sc); g.add(o); solid(o, h * 0.32); loaded[name] = 1; }
    const byModel = {}; for (const [name, h, where, n] of PROPS) (byModel[name + "|" + h] = byModel[name + "|" + h] || []).push(...spotsOf(where, low ? Math.ceil(n / 2) : n, name + where));
    for (const [key, list] of Object.entries(byModel)) { const [name, h] = key.split("|"), sc = await load(name); if (!sc) continue; instance(sc, Number(h), list, name); loaded["p-" + name] = 1; }
  }
  // ---------------- the clock: 20 minutes of day, 10 of night (the server's: clockOf), for everyone the same ----------------
  let clk = clockOf(Date.now()), skew = 0, nightOn = null;
  // the day's sky stays under; the night's fades over it (nightK 0 → 1), the moon rises, the lanterns light one by one,
  // the soul wisps and the low fog come out — and go again at dawn
  let nightK = -1; // (the first frame snaps to the clock; after that it fades)
  function paintSky() { const d = skyT.day, n = skyT.night; if (d) { skyM.map = d; skyM.color.set(0xffffff); } else skyM.color.set(0xd88a4a); skyM.needsUpdate = true; if (n && skyN.map !== n) { skyN.map = n; skyN.needsUpdate = true; } else if (!n) skyN.color.set(0x2a1440); }
  function nightLook(dt) {
    const want = clk.night ? 1 : 0; if (nightK === want && dt) return; nightK = nightK < 0 ? want : dt ? (want > nightK ? Math.min(want, nightK + dt / 4) : Math.max(want, nightK - dt / 4)) : want;
    skyN.opacity = nightK; skyN.color.set(clk.blood ? 0xff9a8a : 0xffffff); moon.material.color.set(clk.blood ? 0xff1a0a : 0xff3a2a); moon.scale.setScalar(clk.blood ? 1.35 : 1); moon.visible = nightK > 0.02; moon.position.y = 120 + nightK * 90; moon.material.opacity = 0.92 * nightK;
    lanterns.forEach((m, i) => { const k = Math.max(0, Math.min(1, nightK * lanterns.length - i * 0.6)); m.emissiveIntensity = m.userData.e0 + k * 2.2; });
    if (wisps) { wisps.visible = nightK > 0.05; wisps.material.opacity = 0.9 * nightK; } fogs.forEach((f) => { f.visible = nightK > 0.05; f.material.opacity = 0.32 * nightK; });
  }
  const lanterns = []; // (the lanterns' and the houses' glowing materials, lit at night)
  // HX3: the square's great jack-o'-lantern on a stone pedestal, its carved face lit (brighter at night: lanterns[])
  { const o = new THREE.Group(); o.name = "hw-statue"; const ped = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 1.2, 8), std(0x4a4256)); ped.position.y = 0.6; o.add(ped);
    const pg = new THREE.SphereGeometry(1.7, 24, 16); pg.scale(1, 0.82, 1); const pm = std(0xff7a14, { emissive: 0x6a2a00, emissiveIntensity: 0.25 }); for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(pg, pm); r.scale.set(0.6, 1, 1); r.rotation.y = (i / 8) * Math.PI; r.position.y = 2.6; o.add(r); }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.8, 6), std(0x2f6a2a)); stem.position.y = 4.1; stem.rotation.z = 0.25; o.add(stem);
    const fm = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa21a, emissiveIntensity: 0.6, side: THREE.DoubleSide }); fm.userData.lit = 1; fm.userData.e0 = 0.6; lanterns.push(fm);
    const tri = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.32, 0), new THREE.Vector2(0.32, 0), new THREE.Vector2(0, 0.42)]));
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(tri, fm); e.position.set(sx * 0.55, 2.85, 1.42); e.rotation.x = -0.2; o.add(e); }
    const mouth = new THREE.Shape(); mouth.moveTo(-0.9, 0); for (let i = 0; i <= 6; i++) mouth.lineTo(-0.9 + i * 0.3, i % 2 ? -0.22 : 0); mouth.quadraticCurveTo(0, -0.75, -0.9, 0); const mo = new THREE.Mesh(new THREE.ShapeGeometry(mouth), fm); mo.position.set(0, 2.35, 1.48); mo.rotation.x = -0.1; o.add(mo);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.9, 5, 1, true), std(0x2a1440, { emissive: 0x6a2fd8, emissiveIntensity: 0.4 })); crown.position.y = 4.5; o.add(crown);
    o.rotation.y = 0; o.position.set(0, 0, -1); g.add(o); solid(o, 2.3); spins.push((dt, t) => { o.rotation.y = Math.sin(t * 0.25) * 0.25; }); }
  paintSky();
  // the grounds, for the fights (world-combat.js reads zoneAt → XZONES)
  const grounds = GROUNDS.map((G) => { const [x, z] = groundXZ(G); return { ...G, x, z, realm: "hw", realmName: "Halloween Realm", fit: true, claimTier: 4, rskin: RARE.skin, rname: RARE.name, nightK: () => nightOf(clk), rareP: () => RARE.chance * (nightOf(clk) ? nightOf(clk).rare : 1), ...(G.jack ? { noBoss: () => clk.night } : {}) }; }); // (HX2: by night the throne's Jack is everyone's: world-hwjack.js)
  for (const z of grounds) if (!XZONES.some((q) => q.id === z.id)) XZONES.push(z);
  // soul wisps (one Points, additive; none on low graphics) and four flat fog discs low over the grounds
  let wisps = null; const fogs = [];
  const wB = new Float32Array(160); // (each wisp's ground height)
  if (!low) { const N = 160, P = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * (HW.LAND.r - 30); P[i * 3] = Math.sin(a) * d; wB[i] = hAt(Math.sin(a) * d, Math.cos(a) * d); P[i * 3 + 1] = 0.3 + Math.random() * 6 + wB[i]; P[i * 3 + 2] = Math.cos(a) * d; /* (the land's own frame) */ }
    const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(P, 3));
    wisps = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0x9fffd0, size: 0.55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); wisps.frustumCulled = false; wisps.visible = false; wisps.name = "hw-wisps"; g.add(wisps); }
  // (HT1: the flat fog discs went with the pads — on the hills they read as pads again; the scene's fog does it)
  // HT1: the trees' trunks block you — a few stand-ins follow you round to the nearest trees (the town's solids check)
  const proxies = []; for (let i = 0; i < 18; i++) { const s0 = new THREE.Group(); s0.userData.radius = 0.4; s0.position.set(0, -999, 0); g.add(s0); solids.push(s0); proxies.push(s0); }
  let proxT = 0; const nearL = [];
  function nearTick(dt, me) { if ((proxT -= dt) > 0 || !me) return; proxT = 0.25; const x = me.x - L.x, z = me.z - L.z; TR.nearTrees(x, z, proxies.length, nearL); proxies.forEach((p, i) => { const t = nearL[i]; if (t) { p.position.set(t.x, 0, t.z); p.userData.radius = t.kind === "p" ? 0.35 * t.s : 0.3 * t.s; } else p.position.set(0, -999, 0); }); TR.cull(x, z, low ? 95 : 140); }
  let shown = false;
  return {
    heightAt: (x, z) => hAt(x - L.x, z - L.z), wet: (x, z) => TR.wet(x - L.x, z - L.z), slow: HW.SWAMP.slow, trees: () => TR.trees.length, // (HT1: world coordinates; the land's own frame inside)
    groundAt: (x, z) => grounds.find((g) => Math.hypot(x - g.x, z - g.z) < g.r) || null, // (the strip reads where you stand now, not the fight's last check)
    group: g, doors, back, solids, grounds,
    show(on) { on = !!on; if (on === shown) return; shown = on; g.visible = on; if (on) loadModels(); },
    tick(dt, t, me) {
      if (shown) nearTick(dt, me);
      clk = clockOf(Date.now() + skew); if (nightOn !== clk.night) { const was = nightOn; nightOn = clk.night; paintSky(); if (was != null) for (const f of nightFns) try { f(clk.night); } catch { /* fine */ } }
      if (shown) { for (const f of spins) f(dt, t); nightLook(dt); if (wisps && wisps.visible) { const a = wisps.geometry.attributes.position, A = a.array; for (let i = 0; i < A.length; i += 3) { A[i + 1] += dt * (0.25 + (i % 7) * 0.05); if (A[i + 1] > 7 + wB[i / 3]) A[i + 1] = 0.3 + wB[i / 3]; A[i] += Math.sin(t + i) * dt * 0.3; } a.needsUpdate = true; } }
    },
    setSkew(ms) { skew = Number(ms) || 0; },
    clock: () => clk, onNight(fn) { nightFns.push(fn); },
    arrival: () => { const [x, z] = polar(0, HW.VILLAGE_R - 8); return { x: L.x + x, z: L.z + z, c: { x: L.x, z: L.z } }; },
    marks: () => marks, door: (id) => doors.find((d) => d.userData.b === id) || null, loaded: () => ({ ...loaded }),
    groundTo(id) { const G = GROUNDS.find((q) => q.id === id); if (!G) return null; const [x, z] = groundXZ(G), [ox, oz] = polar(G.a, G.r - 4); return { x: x - ox, z: z - oz, c: { x, z } }; },
  };
}
