// world-kart-dress.js — ARCIRCLE KART K6 (2026-10-30, the owner's list): the circuit's dressing and the race's stage pieces,
// drawn geometry, with Meshy's start-lights board, ramp and podium taking over once loaded (KX1: world-kart.js K6_GLB; low graphics keeps the drawn ones).
// Grandstands with a crowd and flags along the two straights, the big standings screen, a tunnel, a second set of neon
// arches, the two jump ramps, the start-light gantry, the podium, and two small effects (boost-pad rings, a checkered-flag
// burst). Repeats are one InstancedMesh each; `few` (low graphics or a phone) builds about half.
// Every place is a sample index of the track's table (900 samples round the loop) and a lateral offset, so a
// mirrored race (world.scale.x = −1) carries them with the rest of the track. K5 (2026-10-30): the constants below are the
// Nexus Circuit's; every track passes its own places (world-kart.js TRACKS: stands, tunnel or none, ramps, screen, centre).
export const STANDS = [[12, 72], [470, 550]];    // the two straights (the start straight, the back straight)
export const TUNNEL = [196, 246];                // the long right-hand straight
export const RAMPS = [{ i: 520, lat: 0 }, { i: 96, lat: 0 }];
export const RAMP = { len: 6, w: 8, h: 1.1 };    // metres: along the road, across it, the lip's height
export const SCREEN_I = 22, PODIUM_I = 44;
export const OUTSIDE = [20, 110];                       // (about the circuit's middle: "outside" = away from it)

/// the side of the track away from the circuit's middle at sample i (+1 = the right-hand vector r)
export function outSide(S, i, cx = OUTSIDE[0], cz = OUTSIDE[1]) { const s = S[i]; return Math.sign((s.p.x - cx) * s.r.x + (s.p.z - cz) * s.r.z) || 1; }

export function makeDress(THREE, track, { WALL, ROAD, few = false, low = false, stands: STANDS_ = STANDS, tunnel: TUNNEL_ = TUNNEL, ramps: RAMPS_ = RAMPS, screen: SCREEN_ = SCREEN_I, c: mid = OUTSIDE }) {
  const { S, N } = track, o = new THREE.Object3D(), g = new THREE.Group(), col = new THREE.Color(), up = (i) => S[(i + N) % N];
  const yawOf = (s) => Math.atan2(s.t.x, s.t.z), outS = (S0, i) => outSide(S0, i, mid[0], mid[1]);
  const out = { g, flags: null, screen: null, tunnelAt: (i) => !!TUNNEL_ && i >= TUNNEL_[0] && i <= TUNNEL_[1] };

  // ---- grandstands: a stepped block per 8 samples (one InstancedMesh), a roof, the crowd as small boxes with colours ----
  const step = 8, prof = new THREE.Shape(); prof.moveTo(0, 0); for (let k = 0; k < 4; k++) { prof.lineTo(k * 2.2, 1 + k * 1.3); prof.lineTo((k + 1) * 2.2, 1 + k * 1.3); } prof.lineTo(8.8, 0); prof.lineTo(0, 0);
  const segs = []; for (const [a, b] of STANDS_) for (let i = a; i < b; i += step) segs.push(i);
  const standG = new THREE.ExtrudeGeometry(prof, { depth: 1, bevelEnabled: false }); standG.translate(0, 0, -0.5);
  const stands = new THREE.InstancedMesh(standG, new THREE.MeshLambertMaterial({ color: 0x2a3560, side: THREE.DoubleSide }), segs.length);
  const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1a2140, emissive: 0x0c1a3a }), segs.length);
  const perSeg = few ? 18 : 40, crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.75, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffff }), segs.length * perSeg);
  const CROWD = [0xff6fc8, 0x38d8ff, 0xffc23c, 0x5fe05a, 0xffffff, 0x9b6bff, 0xff7a2e, 0x2ee0b0];
  const flagPts = [], X = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(), tmpV = new THREE.Vector3();
  let c = 0;
  segs.forEach((i, n) => {
    const s = up(i), side = outS(S, i), len = 1.2 * step + 0.2, yaw = yawOf(s);
    // the profile's x runs outward (side × r), its depth along the track (t): a basis of its own, so the block is drawn double-sided
    const m = new THREE.Matrix4().makeBasis(X.copy(s.r).multiplyScalar(side), Y, Z.copy(s.t)); m.scale(new THREE.Vector3(1, 1, len)); m.setPosition(tmpV.copy(s.p).addScaledVector(s.r, side * (WALL + 1.6))); stands.setMatrixAt(n, m);
    o.position.copy(s.p).addScaledVector(s.r, side * (WALL + 1.6 + 4.4)).setY(8.2); o.rotation.set(0, yaw, 0); o.scale.set(9.4, 0.3, len); o.updateMatrix(); roof.setMatrixAt(n, o.matrix);
    for (let k = 0; k < perSeg; k++) { const row = k % 4, along = ((k >> 2) / Math.ceil(perSeg / 4) - 0.5) * len * 0.92 + (Math.sin(k * 12.9) * 0.2);
      o.position.copy(s.p).addScaledVector(s.r, side * (WALL + 1.6 + row * 2.2 + 1.1 + Math.sin(k * 7.3) * 0.35)).addScaledVector(s.t, along).setY(1 + row * 1.3 + 0.38);
      o.rotation.set(0, yaw + side * Math.PI / 2, 0); o.scale.set(1, 0.85 + ((k * 37) % 10) / 30, 1); o.updateMatrix(); crowd.setMatrixAt(c, o.matrix); crowd.setColorAt(c, col.setHex(CROWD[(k * 5 + n) % CROWD.length])); c++; }
    if (n % (few ? 2 : 1) === 0) flagPts.push([s.p.x + s.r.x * side * (WALL + 11), s.p.z + s.r.z * side * (WALL + 11), yaw, n]);
  });
  crowd.count = c; stands.frustumCulled = roof.frustumCulled = crowd.frustumCulled = false; g.add(stands, roof, crowd);

  // ---- flags on poles behind the stands: they wave (world-kart.js calls out.wave(t) ≤ 15 times a second) ----
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 5), new THREE.MeshLambertMaterial({ color: 0xcfd8ea }), flagPts.length);
  const fg = new THREE.PlaneGeometry(2.2, 1.3); fg.translate(1.1, 0, 0);
  const flags = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0x222222 }), flagPts.length);
  flagPts.forEach(([x, z, yaw, n], k) => { o.position.set(x, 4.5, z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); poles.setMatrixAt(k, o.matrix); flags.setColorAt(k, col.setHex([0x38d8ff, 0xff6fc8, 0xffc23c, 0x2ee0b0][n % 4])); });
  out.wave = (t) => { flagPts.forEach(([x, z, yaw], k) => { o.position.set(x, 8.3, z); o.rotation.set(0, yaw + Math.PI / 2 + Math.sin(t * 2.2 + k * 1.7) * 0.35, Math.sin(t * 5 + k) * 0.06); o.scale.set(1, 1, 1); o.updateMatrix(); flags.setMatrixAt(k, o.matrix); }); flags.instanceMatrix.needsUpdate = true; };
  out.wave(0); poles.frustumCulled = flags.frustumCulled = false; g.add(poles, flags);

  // ---- the big standings screen on the infield by the line, facing the karts coming out of the last corner ----
  { const s = up(SCREEN_), side = -outS(S, SCREEN_), cv = document.createElement("canvas"); cv.width = 512; cv.height = 256;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 0.6), new THREE.MeshLambertMaterial({ color: 0x141a33, emissive: 0x0a1030 }));
    const pg = new THREE.Group(); frame.position.set(0, 0, -0.35); pg.add(frame, scr);
    for (const x of [-5, 5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), frame.material); p.position.set(x, -7.5, -0.4); pg.add(p); }
    pg.position.copy(s.p).addScaledVector(s.r, side * (WALL + 7)).setY(11.5); pg.rotation.y = yawOf(s) + Math.PI + side * 0.45; g.add(pg);
    const x = cv.getContext("2d");
    out.screen = { mesh: scr, draw(title, rows) {
      x.fillStyle = "#06102a"; x.fillRect(0, 0, 512, 256); x.fillStyle = "#38d8ff"; x.fillRect(0, 0, 512, 40); x.fillStyle = "#04201a"; x.font = "900 26px Sora, sans-serif"; x.textBaseline = "middle"; x.fillText(title, 16, 21);
      x.fillStyle = "#ff3d6e"; x.beginPath(); x.arc(486, 20, 8, 0, 7); x.fill();
      rows.slice(0, 5).forEach((r, n) => { const y = 64 + n * 40; if (r.me) { x.fillStyle = "rgba(46,224,176,.25)"; x.fillRect(0, y - 19, 512, 38); }
        x.fillStyle = n === 0 ? "#ffc23c" : "#e8f6ff"; x.font = "900 28px Sora, sans-serif"; x.fillText(String(n + 1), 18, y);
        x.fillStyle = "#" + r.color.toString(16).padStart(6, "0"); x.fillRect(56, y - 13, 10, 26);
        x.fillStyle = "#fff"; x.font = "800 26px Sora, sans-serif"; x.fillText(r.name, 80, y); x.textAlign = "right"; x.fillStyle = "rgba(232,246,255,.8)"; x.font = "700 22px Sora, sans-serif"; x.fillText(r.tail, 496, y); x.textAlign = "left"; });
      tex.needsUpdate = true; } };
  }

  // ---- the tunnel: walls + roof per 3 samples (one InstancedMesh), cyan strips along the walls, light panels in the roof ----
  if (TUNNEL_) { const segT = []; for (let i = TUNNEL_[0]; i <= TUNNEL_[1]; i += 3) segT.push(i);
    const box = new THREE.BoxGeometry(1, 1, 1), body = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x18203f, emissive: 0x070b1c }), segT.length * 3);
    const strip = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0x38d8ff }), segT.length * 2), lamp = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xff6fc8 }), Math.ceil(segT.length / 2));
    let b = 0, st = 0, lp = 0; const W = WALL + 0.5;
    segT.forEach((i, n) => { const s = up(i), yaw = yawOf(s);
      for (const sd of [-1, 1]) { o.position.copy(s.p).addScaledVector(s.r, sd * (W + 0.4)).setY(3.3); o.rotation.set(0, yaw, 0); o.scale.set(0.8, 6.6, 3.9); o.updateMatrix(); body.setMatrixAt(b++, o.matrix);
        o.position.copy(s.p).addScaledVector(s.r, sd * W).setY(1.3); o.scale.set(0.12, 0.18, 3.7); o.updateMatrix(); strip.setMatrixAt(st++, o.matrix); }
      o.position.copy(s.p).setY(6.8); o.rotation.set(0, yaw, 0); o.scale.set(2 * W + 1.6, 0.6, 3.9); o.updateMatrix(); body.setMatrixAt(b++, o.matrix);
      if (n % 2 === 0) { o.position.copy(s.p).setY(6.45); o.scale.set(ROAD * 0.6, 0.1, 0.5); o.updateMatrix(); lamp.setMatrixAt(lp++, o.matrix); } });
    lamp.count = lp; body.frustumCulled = strip.frustumCulled = lamp.frustumCulled = false; g.add(body, strip, lamp);
  }

  // ---- more neon arches: thin rings halfway between the first set's, not in the tunnel (not on low graphics) ----
  if (!low) { const n0 = Math.floor(track.len / 60), at = []; for (let k = 0; k < n0; k++) { const i = Math.floor(((k + 0.5) / n0) * N); if (!out.tunnelAt(i) && Math.abs(i - SCREEN_) > 10) at.push(i); }
    const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(ROAD / 2 + 3.4, 0.2, 5, 28, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }), at.length);
    at.forEach((i, k) => { const s = up(i); o.position.copy(s.p); o.rotation.set(0, yawOf(s), 0); o.scale.set(1, 1, 1); o.updateMatrix(); ring.setMatrixAt(k, o.matrix); ring.setColorAt(k, col.setHex(k % 2 ? 0x9b6bff : 0x38d8ff)); });
    ring.frustumCulled = false; g.add(ring); }

  // ---- the jump ramps: a wedge with chevrons, glowing lip ----
  { const L = RAMP.len, W2 = RAMP.w / 2, H = RAMP.h, pos = [-W2, 0, 0, W2, 0, 0, W2, H, L, -W2, H, L, -W2, 0, L, W2, 0, L], idx = [0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2];
    const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1], wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64; const x = cv.getContext("2d"); x.fillStyle = "#1b2440"; x.fillRect(0, 0, 64, 64); x.strokeStyle = "#ffc23c"; x.lineWidth = 7; for (let k = -1; k < 4; k++) { x.beginPath(); x.moveTo(4, k * 20 + 22); x.lineTo(32, k * 20 + 4); x.lineTo(60, k * 20 + 22); x.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2);
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x0b1530 }), lipM = new THREE.MeshBasicMaterial({ color: 0x2ee0b0 });
    out.ramps = RAMPS_.map((r) => { const s = up(r.i), rg = new THREE.Group(), w = new THREE.Mesh(wg, mat), lip = new THREE.Mesh(new THREE.BoxGeometry(RAMP.w, 0.12, 0.2), lipM); lip.position.set(0, H, L);
      w.userData.drawn = lip.userData.drawn = true; rg.add(w, lip); rg.position.copy(s.p).addScaledVector(s.r, r.lat).setY(0.01); rg.rotation.y = yawOf(s); g.add(rg); return rg; });
  }

  // ---- the start lights: a gantry of their own 8 m past the line, five pairs of lamps facing the grid ----
  { const s = up(0), lg = new THREE.Group(), dark = new THREE.MeshLambertMaterial({ color: 0x10162c, emissive: 0x05070f }), W = WALL + 0.6;
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.5), dark); p.position.set(sd * W, 3.2, 0); p.userData.drawn = true; lg.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 0.6, 0.5, 0.5), dark); beam.position.y = 6.3; beam.userData.drawn = true; lg.add(beam);
    const box = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.9, 0.6), dark); box.position.set(0, 5.1, 0); box.userData.drawn = true; lg.add(box);
    const lampG = new THREE.CircleGeometry(0.36, 16), lamps = [];
    for (let k = 0; k < 5; k++) for (const row of [0, 1]) { const m = new THREE.Mesh(lampG, new THREE.MeshBasicMaterial({ color: 0x2a1014, fog: false })); m.position.set(-2.5 + k * 1.25, 4.65 + row * 0.85, -0.32); m.rotation.y = Math.PI; lg.add(m); lamps.push({ m, k }); }
    lg.position.copy(s.p).addScaledVector(s.t, 8); lg.rotation.y = yawOf(s); g.add(lg);
    // n: lamps lit red (1–3 of the five columns grow to all five on 3), 'go' all green, 0 all dark
    let cur = 0, three = null; // (KX1: Meshy's board — its three lamps: one more red a second, all green on GO)
    out.lights = { g: lg, set(n) { cur = n; for (const { m, k } of lamps) m.material.color.setHex(n === "go" ? 0x2eff7a : k < Math.round((n * 5) / 3) ? 0xff2436 : 0x2a1014);
        if (three) three.forEach(([m, h], k) => { const lit = n === "go" || k < n; m.material.color.setHex(n === "go" ? 0x2eff7a : lit ? 0xff2436 : 0x3a1418); h.visible = lit; h.material.color.setHex(n === "go" ? 0x2eff7a : 0xff3446); }); },
      /// KX1: Meshy's start-lights board (models/world/kart/lights.glb, raw/kart-k2) in place of the drawn gantry: its posts on the
      /// curbs (model x ±0.815), the board over the road facing the grid; our own lamp discs on its three lamps (model x −0.59 / 0 / 0.59,
      /// y 0.235, its face at z 0.27), so red → green still shows; a soft halo behind a lit one
      colors: () => (three ? three.map(([m]) => m.material.color.getHexString()) : null), /* (the browser test reads the lamps) */
      useModel(obj) { const k = (ROAD / 2 + 1.2) / 0.815; obj.scale.setScalar(k); obj.rotation.y = Math.PI; obj.position.set(0, 0.57 * k, 0);
        const dg = new THREE.CircleGeometry(0.165, 20), hg = new THREE.CircleGeometry(0.24, 20); three = [-0.59, 0, 0.59].map((x) => { const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0x3a1418, fog: false })), h = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0xff3446, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
          m.position.set(x, 0.235, 0.285); h.position.set(x, 0.235, 0.29); h.visible = false; obj.add(m, h); return [m, h]; });
        for (const c of lg.children) c.visible = false; lg.add(obj); this.set(cur); } };
  }
  return out;
}

/// KX1: Meshy's ramp (models/world/kart/ramp.glb) laid on the physics' wedge: its up-slope (model z 0.7 → −0.3, y −0.53 → 0.24)
/// stretched to RAMP.len × RAMP.h, its width to RAMP.w, turned to rise along +z; the cross bar and the rails' tops over the lip
/// (model y > 0.3) cut away once (the karts fly through there). `src` is the loaded scene; returns a copy to add to a ramp's group.
export function rampModel(THREE, src) {
  if (!src.userData.cut) { src.userData.cut = true; src.updateMatrixWorld(true); const v = new THREE.Vector3();
    src.traverse((o) => { if (!o.isMesh || !o.geometry.index) return; const g = o.geometry, P = g.attributes.position, I = g.index.array, keep = [];
      for (let i = 0; i < I.length; i += 3) { let lo = Infinity; for (let j = 0; j < 3; j++) { v.fromBufferAttribute(P, I[i + j]).applyMatrix4(o.matrixWorld); lo = Math.min(lo, v.y); } if (lo <= 0.3) keep.push(I[i], I[i + 1], I[i + 2]); }
      g.setIndex(keep); }); }
  const obj = src.clone(true), kx = RAMP.w / 1.9, ky = RAMP.h / 0.77, kz = RAMP.len / 1.0;
  obj.scale.set(kx, ky, kz); obj.rotation.y = Math.PI; obj.position.set(0, 0.53 * ky, 0.7 * kz); return obj;
}

/// the podium: three blocks (1st in the middle), the KART logo behind, a spot for the last place beside it
export function makePodium(THREE, logoTex) {
  const g = new THREE.Group(), H = [1.5, 1.05, 0.75], X = [0, -2.4, 2.4], COL = [0xffc23c, 0xcfd8ea, 0xd9894a];
  H.forEach((h, n) => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const x = cv.getContext("2d"); x.fillStyle = "#" + COL[n].toString(16).padStart(6, "0"); x.fillRect(0, 0, 64, 64); x.fillStyle = "#0b1638"; x.font = "900 44px Sora, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(n + 1), 32, 35);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const side = new THREE.MeshLambertMaterial({ color: COL[n], emissive: COL[n], emissiveIntensity: 0.25 }), front = new THREE.MeshLambertMaterial({ map: t, emissive: 0x222222 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.3, h, 2.2), [side, side, side, side, front, side]); b.position.set(X[n], h / 2, 0); b.userData.drawn = true; g.add(b); });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.6, 0.12, 32), new THREE.MeshBasicMaterial({ color: 0x2ee0b0, transparent: true, opacity: 0.35 })); base.position.y = 0.06; g.add(base);
  if (logoTex) { const lg = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.95), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false })); lg.position.set(0, 5.9, -3.2); /* (high and back: over the racers' heads, not on them) */ g.add(lg); }
  const P = { g, spots: [[X[0], H[0], 0], [X[1], H[1], 0], [X[2], H[2], 0]], last: [5.2, 0, 0],
    /// KX1: Meshy's podium (models/world/kart/podium.glb) fitted to 7.2 m in place of the blocks: the three steps' tops found by
    /// casting down on it at each place (a few depths, the highest), so the racers stand on its steps
    useModel(obj) { g.add(obj); g.updateMatrixWorld(true); const rc = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
      P.spots = X.map((x, n) => { let best = null; for (const z of [-0.9, -0.4, 0, 0.4]) { rc.set(g.localToWorld(o.set(x, 12, z)), dn); const h = rc.intersectObject(obj, true)[0]; if (h) { const y = g.worldToLocal(h.point.clone()).y; if (!best || y > best[1] + 0.02) best = [x, y, z]; } } return best || [x, H[n], 0]; });
      for (const c of g.children) if (c.userData.drawn) c.visible = false; } };
  return P;
}

/// the boost-pad ring: a few expanding rings in a pool
export function makeRings(THREE, scene, n = 4) {
  const pool = []; for (let k = 0; k < n; k++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffc23c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); pool.push({ m, t: 0 }); }
  let k = 0;
  return { at(p, hex = 0xffc23c) { const r = pool[k++ % n]; r.t = 0.5; r.m.visible = true; r.m.position.set(p.x, 0.12, p.z); r.m.material.color.setHex(hex); },
    step(dt) { for (const r of pool) { if (r.t <= 0) continue; r.t -= dt; const u = 1 - Math.max(0, r.t) / 0.5; r.m.scale.setScalar(1 + u * 5); r.m.material.opacity = 0.9 * (1 - u); if (r.t <= 0) r.m.visible = false; } } };
}

/// the checkered-flag burst at the line: small black-and-white squares that fly up and spin
export function makeChecker(THREE, scene, n = 36) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 16; const x = cv.getContext("2d"); for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { x.fillStyle = (a + b) % 2 ? "#fff" : "#111"; x.fillRect(a * 4, b * 4, 4, 4); }
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter;
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }), n), o = new THREE.Object3D(), P = [];
  im.frustumCulled = false; im.visible = false; scene.add(im);
  return { burst(p) { P.length = 0; for (let k = 0; k < n; k++) P.push({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 10, vy: 5 + Math.random() * 7, vz: (Math.random() - 0.5) * 10, r: Math.random() * 6, w: (Math.random() - 0.5) * 14, life: 1.4 + Math.random() * 0.6 }); im.visible = true; },
    step(dt) { if (!im.visible) return; let any = false; P.forEach((q, k) => { q.life -= dt; q.vy -= 9 * dt; q.x += q.vx * dt; q.y = Math.max(0.05, q.y + q.vy * dt); q.z += q.vz * dt; q.r += q.w * dt; const s = q.life > 0 ? Math.min(1, q.life * 2) : 0; if (s > 0) any = true;
      o.position.set(q.x, q.y, q.z); o.rotation.set(q.r, q.r * 0.7, 0); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(k, o.matrix); }); im.instanceMatrix.needsUpdate = true; if (!any) im.visible = false; } };
}
