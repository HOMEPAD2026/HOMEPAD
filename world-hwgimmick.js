// world-hwgimmick.js — HX3 (2026-10-28): the Halloween Realm's grounds each get a thing of their own to do between the fights
//   Pumpkin Patch          pumpkins to kick open: a sweet (HP back), a soul star (XP) or a slime that was hiding inside
//   Whispering Forest      a hidden chest (its place changes every Seoul day); soul wisps drift toward it, brighter at night
//                          → api world-hw-gimmick "chest" (3 fragments, once a day)
//   Graveyard of the Lost  four tombs round a great one that flashes an order; step on them in that order
//                          → "tomb" (5 fragments, once a day); a wrong step wakes a ghost
//   Witch's Candy Factory  candies tumble out near you now and then: speed boots or Candy fury (+20 % damage), 20 s
//   Midnight Clocktower    three clock circles slow the monsters standing in them; two great gears turn over the ground
// Built the first time the realm is (one InstancedMesh a kind, small meshes, nothing on the far side drawn: hidden past 70 m).
import { HW, GROUNDS, groundXZ } from "./world-hwrealm-data.js";
export function makeHwGimmicks(ctx) {
  // ctx: { THREE, root (the realm's group, at HW.LAND), low, here(v), combat(), level(), post, sess, toast, cut(big, small, cls),
  //        snd: { candy, pumpkin, pop, coin, bad }, parts, vfx, T, gainXp(n), onSet(set) }
  const { THREE } = ctx, L = HW.LAND, V = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1);
  const g = new THREE.Group(); g.name = "hw-gimmicks"; ctx.root.add(g);
  const G = Object.fromEntries(GROUNDS.map((q) => { const [x, z] = groundXZ(q); return [q.id, { ...q, x: x - L.x, z: z - L.z, wx: x, wz: z }]; }));
  const mat = (c, e = 0.25, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.6, metalness: 0.1, ...o });
  const day = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const rnd = (seed) => { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };
  const near = (x, z, r) => { ctx.here(V); return Math.hypot(V.x - (x + L.x), V.z - (z + L.z)) < r; };
  const busy = {}; async function claim(kind) {
    if (busy[kind]) return null; const s = ctx.sess(); if (!s) { ctx.toast(ctx.T("Sign in to keep what you find here")); return null; }
    busy[kind] = true; try { const r = await ctx.post({ action: "world-hw-gimmick", ...s, kind }); const j = (r && r.j) || {}; if (j.set) ctx.onSet(j.set); return j; } catch { return null; } finally { busy[kind] = false; }
  }
  const at = (x, z, y = 0) => new THREE.Vector3(x + L.x, y, z + L.z);

  // ---------------- Pumpkin Patch: pumpkins to kick open ----------------
  const P = G["hw-patch"], PN = ctx.low ? 6 : 10, pumpkins = [];
  const pumpGeo = new THREE.SphereGeometry(0.55, 14, 10); pumpGeo.scale(1, 0.78, 1);
  const pumpIM = new THREE.InstancedMesh(pumpGeo, mat(0xff8a1f, 0.3), PN), stemIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.28, 6), mat(0x2f7a2a, 0.1), PN);
  { const r = rnd("patch"); for (let i = 0; i < PN; i++) { const a = r() * Math.PI * 2, d = 3 + r() * (P.r - 5); pumpkins.push({ x: P.x + Math.cos(a) * d, z: P.z + Math.sin(a) * d, s: 0.8 + r() * 0.6, gone: 0 }); } }
  function paintPumps() { pumpkins.forEach((p, i) => { const k = p.gone > 0 ? 0.0001 : p.s; M4.compose(V.set(p.x, 0.42 * k, p.z), Q.identity(), S1.clone().setScalar(k)); pumpIM.setMatrixAt(i, M4); M4.compose(V.set(p.x, 0.86 * k, p.z), Q, S1.clone().setScalar(k)); stemIM.setMatrixAt(i, M4); }); pumpIM.instanceMatrix.needsUpdate = stemIM.instanceMatrix.needsUpdate = true; }
  paintPumps(); g.add(pumpIM, stemIM); pumpIM.frustumCulled = stemIM.frustumCulled = false;
  function kick(p) {
    p.gone = 60; paintPumps(); const w = at(p.x, p.z, 0.6); ctx.snd.pumpkin && ctx.snd.pumpkin();
    if (ctx.parts) ctx.parts.emit({ at: w, kind: "glow", n: 18, speed: 4, up: 4, spread: 0.6, size: 0.3, life: 0.7, grav: 9, color: 0xff8a1f, color2: 0xffd23a, jitter: 0.4 });
    const r = Math.random(), c = ctx.combat();
    if (r < 0.25 && c) { c.spawnMob({ type: "drop", lv: Math.max(P.lv[0], Math.min(P.lv[1], ctx.level())), zone: ctx.zone(P.id), at: w.clone().setY(0) }); ctx.toast(ctx.T("A Pumpkin Slime was hiding inside!")); }
    else if (r < 0.65 && c && c.heal) { const h = c.heal(Math.max(30, ctx.level() * 20)); ctx.toast(ctx.T("A sweet inside: +{n} HP", { n: h })); }
    else { ctx.gainXp && ctx.gainXp(Math.max(10, ctx.level() * 3)); ctx.toast(ctx.T("A soul star inside: +EXP")); }
  }

  // ---------------- Whispering Forest: the day's hidden chest and the wisps toward it ----------------
  const F = G["hw-forest"]; let chestP = null, chestDay = "", chestOpen = false;
  const chest = new THREE.Group(); { const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.75), mat(0x6a3a1a, 0.15)); b.position.y = 0.35; const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 10, 1, false, 0, Math.PI), mat(0x8a4a1a, 0.2)); lid.rotation.z = Math.PI / 2; lid.position.y = 0.7; const lk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), mat(0x7cf5c8, 1.2)); lk.position.set(0, 0.55, 0.39); chest.add(b, lid, lk); chest.userData.lid = lid; }
  g.add(chest);
  const trailN = ctx.low ? 0 : 24, trail = trailN ? new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(trailN * 3), 3)), new THREE.PointsMaterial({ color: 0x7cf5c8, size: 0.5, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })) : null;
  if (trail) { trail.frustumCulled = false; g.add(trail); }
  function placeChest() {
    const d0 = day(); if (d0 === chestDay) return; chestDay = d0; chestOpen = false; const r = rnd("chest" + d0), a = r() * Math.PI * 2, d = F.r * (0.45 + r() * 0.4);
    chestP = { x: F.x + Math.cos(a) * d, z: F.z + Math.sin(a) * d }; chest.position.set(chestP.x, 0, chestP.z); chest.rotation.y = r() * 6; chest.userData.lid.rotation.x = 0; chest.visible = true;
  }
  async function openChest() {
    if (chestOpen) return; chestOpen = true; chest.userData.lid.rotation.x = -1.1; const j = await claim("chest");
    if (j && j.frag) ctx.cut(ctx.T("HIDDEN CHEST!"), ctx.T("+{n} Pumpkin Soul Fragments", { n: j.frag }), "day"); else if (j && j.again) ctx.toast(ctx.T("Empty — a new chest hides somewhere tomorrow")); else chestOpen = false;
    ctx.snd.coin && ctx.snd.coin();
  }

  // ---------------- Graveyard: light the tombs in the great tomb's order ----------------
  const R = G["hw-grave"], TC = { x: R.x + R.r * 0.1, z: R.z - R.r * 0.25 }, COL = [0xff8a1f, 0x7cf5c8, 0xb48cff, 0xff4d6d];
  const tombs = COL.map((c, i) => { const a = (i / 4) * Math.PI * 2 + 0.4, o = new THREE.Group(); o.position.set(TC.x + Math.cos(a) * 5, 0, TC.z + Math.sin(a) * 5);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.25), mat(0x5a5470, 0.05)); st.position.y = 0.65; const pad = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25, depthWrite: false, fog: false })); pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.06, 0.9);
    o.add(st, pad); o.lookAt(TC.x, 0, TC.z); g.add(o); return { o, pad, c, x: o.position.x + Math.cos(a + Math.PI) * 0.9 * 0, z: o.position.z }; });
  const great = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.4), mat(0x3a3450, 0.2)); great.position.set(TC.x, 1.2, TC.z); g.add(great);
  let seq = [], step = 0, showT = 0, showI = -1, tombDone = "", wasOn = -1;
  const newSeq = () => { seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4)); step = 0; showT = 0.6; showI = -1; };
  newSeq();
  function tombTick(dt) {
    if (tombDone === day()) { tombs.forEach((t) => { t.pad.material.opacity = 0.5; }); return; }
    if (showT > 0 || showI >= 0) { showT -= dt; if (showT <= 0) { showI++; if (showI >= seq.length) { showI = -1; great.material.color.set(0x3a3450); } else { showT = 0.7; great.material.color.set(COL[seq[showI]]); great.material.emissive.set(COL[seq[showI]]); great.material.emissiveIntensity = 1; tombs[seq[showI]].pad.material.opacity = 0.9; ctx.snd.pop && ctx.snd.pop(); } }
      tombs.forEach((t, i) => { if (showI < 0 || seq[showI] !== i) t.pad.material.opacity = Math.max(0.25, t.pad.material.opacity - dt * 2); }); if (showI < 0) great.material.emissiveIntensity = 0.2; return; }
    ctx.here(V); let on = -1; tombs.forEach((t, i) => { const w = t.o.getWorldPosition(new THREE.Vector3()); if (Math.hypot(V.x - w.x, V.z - w.z) < 1.3) on = i; });
    if (on !== wasOn) { wasOn = on; if (on >= 0) { const t = tombs[on]; t.pad.material.opacity = 0.9; setTimeout(() => { t.pad.material.opacity = 0.25; }, 400);
      if (seq[step] === on) { step++; ctx.snd.pop && ctx.snd.pop(); if (step >= seq.length) { tombDone = day(); claim("tomb").then((j) => { if (j && j.ok && ctx.step) ctx.step("tomb"); if (j && j.frag) ctx.cut(ctx.T("THE LOST REST"), ctx.T("+{n} Pumpkin Soul Fragments", { n: j.frag }), "day"); else if (j && j.again) ctx.toast(ctx.T("The tombs sleep until tomorrow")); }); } }
      else { ctx.snd.bad && ctx.snd.bad(); ctx.toast(ctx.T("Wrong tomb — a ghost wakes!")); const c = ctx.combat(); if (c) c.spawnMob({ type: "spam", lv: Math.max(R.lv[0], Math.min(R.lv[1], ctx.level())), zone: ctx.zone(R.id), at: at(TC.x, TC.z) }); newSeq(); } } }
  }

  // ---------------- Witch's Candy Factory: candies tumble out ----------------
  const C = G["hw-candy"], candies = []; let candyT = 4;
  const candyGeo = new THREE.TorusGeometry(0.28, 0.12, 8, 16);
  function dropCandy() { ctx.here(V); const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 5, kind = Math.random() < 0.5 ? "boots" : "fury";
    const m = new THREE.Mesh(candyGeo, mat(kind === "fury" ? 0xff6fae : 0x35d8d0, 0.8)); m.position.set(V.x - L.x + Math.cos(a) * d, 0.6, V.z - L.z + Math.sin(a) * d); g.add(m); candies.push({ m, kind, life: 18 }); }
  function candyTick(dt, t, inC) {
    if (inC && (candyT -= dt) <= 0) { candyT = 12 + Math.random() * 8; if (candies.length < 3) dropCandy(); }
    for (let i = candies.length - 1; i >= 0; i--) { const c = candies[i]; c.life -= dt; c.m.rotation.y += dt * 2; c.m.position.y = 0.6 + Math.sin(t * 3 + i) * 0.15;
      const w = at(c.m.position.x, c.m.position.z); ctx.here(V); if (Math.hypot(V.x - w.x, V.z - w.z) < 1.2) { const cb = ctx.combat(); if (cb && cb.buff) cb.buff(c.kind, 20); ctx.snd.candy && ctx.snd.candy(); ctx.toast(c.kind === "fury" ? ctx.T("Candy fury! +20 % damage for 20 s") : ctx.T("Sugar rush! Faster for 20 s")); c.life = 0; }
      if (c.life <= 0) { g.remove(c.m); c.m.material.dispose(); candies.splice(i, 1); } }
  }

  // ---------------- Midnight Clocktower: slow circles and the great gears ----------------
  const K = G["hw-clock"], circles = [], gears = [];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.6, x = K.x + Math.cos(a) * K.r * 0.5, z = K.z + Math.sin(a) * K.r * 0.5, o = new THREE.Group(); o.position.set(x, 0.07, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 4, 48), new THREE.MeshBasicMaterial({ color: 0x5fd3ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false })); ring.rotation.x = -Math.PI / 2;
    const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3.4), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false })); hand.rotation.x = -Math.PI / 2; hand.geometry.translate(0, 1.7, 0);
    o.add(ring, hand); g.add(o); circles.push({ o, hand, x, z }); }
  if (!ctx.low) for (let i = 0; i < 2; i++) { const o = new THREE.Group(), R0 = 4 + i * 1.5, gm = mat(0xb08a3a, 0.15, { metalness: 0.7, roughness: 0.35 });
    o.add(new THREE.Mesh(new THREE.TorusGeometry(R0, 0.45, 8, 32), gm)); const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), gm, 16); for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; M4.compose(V.set(Math.cos(a) * (R0 + 0.55), Math.sin(a) * (R0 + 0.55), 0), Q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a), S1); teeth.setMatrixAt(k, M4); } o.add(teeth);
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.35, R0 * 2, 0.35), gm); sp.rotation.z = (k / 3) * Math.PI; o.add(sp); }
    o.position.set(K.x + (i ? -1 : 1) * K.r * 0.62, R0 + 2.5, K.z - K.r * 0.55); o.lookAt(K.x, R0 + 2.5, K.z); g.add(o); gears.push({ o, s: i ? -0.35 : 0.25 }); }
  function clockTick(dt, t, inK) {
    for (const c of circles) c.hand.rotation.z = -t * 0.8; for (const q of gears) q.o.rotateZ(dt * q.s);
    if (!inK) return; const cb = ctx.combat(); if (!cb) return;
    for (const m of cb.mobsRaw()) { if (m.dead || !m.zone || m.zone.id !== K.id) continue; for (const c of circles) if (Math.hypot(m.g.position.x - (c.x + L.x), m.g.position.z - (c.z + L.z)) < 4) { m.tslow = 0.4; break; } }
  }

  // ---------------- each frame ----------------
  let tickN = 0;
  return {
    tick(dt, t, on) {
      g.visible = !!on; if (!on) return; ctx.here(V); const lx = V.x - L.x, lz = V.z - L.z, inG = (q, k = 1) => Math.hypot(lx - q.x, lz - q.z) < q.r * k;
      const inP = inG(P, 1.2), inF = inG(F, 1.3), inR = inG(R, 1.2), inC = inG(C, 1.1), inK = inG(K, 1.2);
      pumpIM.visible = stemIM.visible = inG(P, 3);
      if (inP) { for (const p of pumpkins) { if (p.gone > 0) { p.gone -= dt; if (p.gone <= 0) paintPumps(); continue; } if (Math.hypot(lx - p.x, lz - p.z) < 1.1 * p.s) kick(p); } }
      placeChest(); chest.visible = inG(F, 2.5) && !chestOpen;
      if (trail) { trail.visible = inF && !chestOpen && chestP; if (trail.visible) { const A = trail.geometry.attributes.position.array, fx = chestP.x - lx, fz = chestP.z - lz; for (let i = 0; i < trailN; i++) { const k = ((i / trailN + t * 0.08) % 1), wob = Math.sin(t * 2 + i) * 0.5; A[i * 3] = lx + fx * k + wob; A[i * 3 + 1] = 1 + Math.sin(t * 3 + i) * 0.3; A[i * 3 + 2] = lz + fz * k + Math.cos(t * 2 + i) * 0.5; } trail.geometry.attributes.position.needsUpdate = true; trail.material.opacity = (ctx.night() ? 0.9 : 0.35) * (1 - Math.min(1, Math.hypot(fx, fz) / 60) * 0.5); } }
      if (inF && chestP && !chestOpen && Math.hypot(lx - chestP.x, lz - chestP.z) < 1.5) openChest();
      tombs.forEach((q) => { q.o.visible = inG(R, 2.5); }); great.visible = inG(R, 2.5); if (inR && near(TC.x, TC.z, 14)) tombTick(dt); else if (inR && (tickN++ % 30) === 0 && showI < 0 && step === 0) { /* far from the tombs: the order shows again when you come close */ showT = 0.6; }
      candyTick(dt, t, inC);
      circles.forEach((c) => { c.o.visible = inG(K, 2.5); }); gears.forEach((q) => { q.o.visible = inG(K, 3); }); clockTick(dt, t, inK);
    },
    // (tests) what's where and what's done
    debug: () => ({ pumpkins: pumpkins.filter((p) => p.gone <= 0).length, chest: chestP && { x: chestP.x + L.x, z: chestP.z + L.z, open: chestOpen }, tombs: tombs.map((q) => { const w = q.o.getWorldPosition(new THREE.Vector3()); return { x: w.x, z: w.z }; }), seq: seq.slice(), step, tombDone, candies: candies.length, circles: circles.map((c) => ({ x: c.x + L.x, z: c.z + L.z })) }),
  };
}
