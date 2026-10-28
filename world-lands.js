// world-lands.js — b-lpv (the owner's call, 2026-10-23): the lands past the town, reached only by portal.
//   the LAUNCHPAD VILLAGE   every ArcPad coin's lot, its size by the coin's market cap (LOT_TIERS: Starter under $1k
//                           16×16 bricks · S $1k+ 24×24 · M $10k+ 36×36 · L $100k+ 48×48; a lot never shrinks — the
//                           server keeps the biggest tier reached, api/_world-lots.mjs). Rings of lots round a plaza with
//                           the launch tower; the biggest tier nearest it, and in a tier the first launched first (so a
//                           lot keeps its place). The coin's creator builds it brick by brick (world-island.js, lot mode).
//   the UTILITY VILLAGE     ARCIRCLE's utilities (K.SHOPS: Launchpad, Exchange, Bank, Scanner …) as they stood round the
//                           plaza, the same layout, roads and district signs, moved to their own land.
//   the PORTALS             in the town, where the shops' ring was: Launchpad Village, Utility Village, Partner Village,
//                           Game Village; in each land a portal back to the town.
// The lands are on the same ground as the town, far off (2.4 km, past the camera's reach), so your hero, chat, friends
// and presence work there as in town; world-play.js keeps you inside a land's edge (landAt, edgeOf) and shows its group
// only while you're in it. api/_world-lots.mjs LANDS carries the same places (presence there is accepted).
export const LANDS = {
  lp: { id: "lp", name: "Launchpad Village", x: 2400, z: 0, r: 70, color: 0x39ff88, css: "#39ff88" },
  ut: { id: "ut", name: "Utility Village", x: -2400, z: 0, r: 56, color: 0x4f9dff, css: "#4f9dff" },
  ad: { id: "ad", name: "Nexus City", x: 0, z: 2400, r: 92, color: 0x5fd3ff, css: "#5fd3ff" }, // AD-City 1: AGENT DIMENSION's city (world-adcity.js), by the Citadel
  rq: { id: "rq", name: "RAID QUEENS", x: 0, z: -2400, r: 63, color: 0xff4d8d, css: "#ff4d8d" },
  cc: { id: "cc", name: "Creator City", x: -2400, z: 2400, r: 78, color: 0x7cf5c8, css: "#7cf5c8" },
  hw: { id: "hw", name: "Halloween Realm", x: 2400, z: 2400, r: 165, color: 0xff8a1f, css: "#ff8a1f" }, // the HALLOWEEN REALM (world-hwrealm.js): through the Haunted Pumpkin Gate on the plaza's ring // ARCIRCLE STUDIO BETA (world-creatorcity.js): through the Studio by the fountain // RAID QUEENS (world-raidq.js): the high levels' land, through the Crimson Citadel
};
export const LOT_TIERS = [
  { id: "starter", name: "Starter", min: 0, N: 16, max: 2000, color: 0x9fb4c8, css: "#9fb4c8" },
  { id: "s", name: "S", min: 1e3, N: 24, max: 5000, color: 0x4f9dff, css: "#4f9dff" },
  { id: "m", name: "M", min: 1e4, N: 36, max: 10000, color: 0xb48cff, css: "#b48cff" },
  { id: "l", name: "L", min: 1e5, N: 48, max: 20000, color: 0xffc861, css: "#ffc861" },
];
export const BRICK_M = 0.5; // a lot's brick in the village: half a metre (an S lot is 12 m across)
export const tierOfCap = (mc) => { let t = 0; LOT_TIERS.forEach((x, i) => { if ((Number(mc) || 0) >= x.min) t = i; }); return t; };
export const lotSize = (t) => LOT_TIERS[t].N * BRICK_M;
const PLAZA_R = 22, STREET = 5, AVENUE = 9; // the Launchpad Village's plaza, the street between rings, the avenue in from the portal (south)
/// which land (x, z) is in (with a margin past its edge), or null: the town
export function landAt(x, z) { for (const L of Object.values(LANDS)) if (Math.hypot(x - L.x, z - L.z) < L.r + 30) return L; return null; }
/// where each coin's lot goes (relative to the village's centre): rings round the plaza, a ring per tier (more rings
/// when one is full), the biggest tier first; a gap left to the south for the avenue from the portal.
/// coins: [{ token, launchedAt, … }], tierOf(coin) → 0–3. Returns { lots: [{ coin, tier, x, z, ry, size }], r }
export function layoutLots(coins, tierOf) {
  const list = coins.map((c) => ({ c, t: tierOf(c) })).sort((a, b) => b.t - a.t || (a.c.launchedAt || 0) - (b.c.launchedAt || 0) || String(a.c.token).localeCompare(String(b.c.token)));
  const lots = [], rings = []; let r = PLAZA_R, i = 0;
  while (i < list.length) {
    const t = list[i].t, size = lotSize(t), cell = size + STREET, rc = r + cell / 2;
    const gap = (AVENUE + cell) / rc, arc = Math.PI * 2 - gap, cap = Math.max(1, Math.floor((arc * rc) / cell));
    const ring = []; while (i < list.length && list[i].t === t && ring.length < cap) ring.push(list[i++]);
    // x = sin(a)·r, z = cos(a)·r: the angle 0 is south (+z, the avenue's gap), π north. A ring fills from the north,
    // one side then the other (π, π+step, π−step, …), so a lot keeps its place when newer coins join its ring
    const step = arc / cap, odd = cap % 2 === 1;
    ring.forEach((q, k) => { const j = odd ? Math.ceil(k / 2) : Math.floor(k / 2) + 0.5, a = Math.PI + (k % 2 ? 1 : -1) * j * step, x = Math.sin(a) * rc, z = Math.cos(a) * rc; lots.push({ coin: q.c, tier: q.t, x, z, ry: Math.atan2(-x, -z), size }); });
    rings.push({ r0: r + STREET / 2, r1: r + cell - STREET / 2, tier: t });
    r += cell;
  }
  return { lots, rings, r: Math.max(48, r + 10) };
}

/// the land groups and the town's portals. ctx: { THREE, K, planet, T, low }
export function makeLands({ THREE, K, planet, T, low = false, ver = "", onModel = null, groundMat = null }) {
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  const glow = (c, k = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const basic = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  const canvasTex = (w, h, draw) => { if (typeof document === "undefined") return null; const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const spins = [];
  const ringOf = (g, r, w, c, op = 0.9) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 160), basic(c, op)); m.rotation.x = Math.PI / 2; m.position.y = 0.08; g.add(m); return m; };
  /// a land's ground: a big disc with a faint grid, its glowing edge
  function groundOf(g, L, r, base, line) {
    const tex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); x.strokeStyle = line; x.globalAlpha = 0.18; x.lineWidth = 2; for (let k = 0; k <= 8; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, h); x.stroke(); x.beginPath(); x.moveTo(0, k * 64); x.lineTo(w, k * 64); x.stroke(); } });
    if (tex) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(r / 16, r / 16); }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(r + 40, 96), groundMat || std(0xffffff, { map: tex, roughness: 0.9, metalness: 0.05 })); // (the town's own grass when it's handed over)
    if (groundMat) { const uv = ground.geometry.attributes.uv, pos = ground.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 660 + 0.5, pos.getY(i) / 660 + 0.5); uv.needsUpdate = true; } // (its texture laid at the town's scale) ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; ground.receiveShadow = true; g.add(ground);
    const rim = ringOf(g, r, 0.16, L.color, 0.85); g.userData.rim = rim; g.userData.ground = ground;
    return ground;
  }
  /// a big board over a land's middle that turns to face you
  function boardOf(g, title, sub, col, y = 15, w = 15) {
    const tex = canvasTex(1024, 300, (x) => {
      x.beginPath(); if (x.roundRect) x.roundRect(8, 8, 1008, 284, 44); else x.rect(8, 8, 1008, 284); const bg = x.createLinearGradient(0, 0, 0, 300); bg.addColorStop(0, "rgba(6,18,34,.93)"); bg.addColorStop(1, "rgba(2,6,14,.93)"); x.fillStyle = bg; x.fill();
      x.lineWidth = 8; const bd = x.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#2f8cff"); bd.addColorStop(0.5, col); bd.addColorStop(1, "#7cf5c8"); x.strokeStyle = bd; x.stroke();
      x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = col; x.shadowBlur = 22; x.fillStyle = "#fff"; x.font = "900 96px Sora, 'Segoe UI', sans-serif"; x.fillText(title, 512, 112, 960);
      x.shadowBlur = 0; x.fillStyle = "#cfe6ff"; x.font = "800 48px Sora, 'Segoe UI', sans-serif"; x.fillText(sub, 512, 222, 940);
    });
    if (!tex) return null;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.293), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); m.position.y = y; m.renderOrder = 11; g.add(m);
    const qp = new THREE.Quaternion(); m.onBeforeRender = (r, sc, cam) => { g.getWorldQuaternion(qp); m.quaternion.copy(qp.invert().multiply(cam.quaternion)); m.updateMatrixWorld(); };
    return m;
  }
  /// a portal: K.makePortal with a second line under its name (how many are there)
  function portalOf(name, col, sub = "") {
    const p = K.makePortal(name); p.userData.radius = 1.6; spins.push(...p.userData.spin);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.18, 40), std(0x14203a, { metalness: 0.5, roughness: 0.35, emissive: col, emissiveIntensity: 0.25 })); base.position.y = 0.09; p.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 6, 64), basic(col, 0.9)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; p.add(ring);
    p.userData.setSub = (s) => { if (p.userData.subText === s) return; p.userData.subText = s; if (p.userData.subTag) { p.remove(p.userData.subTag); p.userData.subTag.material.map && p.userData.subTag.material.map.dispose(); p.userData.subTag.material.dispose(); } if (!s) { p.userData.subTag = null; return; } const t = K.label(s, { accent: "#" + col.toString(16).padStart(6, "0"), size: 0.55 }); t.position.y = p.userData.model ? 6.75 : 3.65; p.add(t); p.userData.subTag = t; };
    if (sub) p.userData.setSub(sub);
    // b-st2: a column of light over it (fading up, added on: it glows without hiding what's behind), motes of light
    // climbing in it and the ring on the ground breathing — so a portal reads as a portal from across the plaza
    const cc = new THREE.Color(col), cg = new THREE.CylinderGeometry(1.45, 1.95, 9, 32, 6, true), cp = cg.attributes.position, cl = [];
    for (let i = 0; i < cp.count; i++) { const k = Math.pow(1 - (cp.getY(i) + 4.5) / 9, 1.6) * 0.55; cl.push(cc.r * k, cc.g * k, cc.b * k); }
    cg.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
    const colM = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const column = new THREE.Mesh(cg, colM); column.position.y = 4.7; column.renderOrder = 3; column.name = "portal-column"; p.add(column);
    const MN = low ? 0 : 22, mp = new Float32Array(MN * 3), seed = Array.from({ length: MN }, (_, i) => [((i * 2.399) % (Math.PI * 2)), 0.4 + ((i * 0.618) % 1) * 1.3, (i * 0.377) % 1]);
    const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: col, size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); motes.frustumCulled = false; if (MN) p.add(motes);
    spins.push((dt, t) => {
      colM.opacity = 0.75 + Math.sin(t * 1.7 + col) * 0.2; ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04); ring.material.opacity = 0.7 + Math.sin(t * 2.2) * 0.2;
      for (let i = 0; i < MN; i++) { const [a, r, o] = seed[i], k = (t * 0.22 + o) % 1; mp[i * 3] = Math.cos(a + t * 0.5) * r; mp[i * 3 + 1] = 0.3 + k * 8.5; mp[i * 3 + 2] = Math.sin(a + t * 0.5) * r; }
      if (MN) mg.attributes.position.needsUpdate = true;
    });
    return p;
  }

  // ---------------- the Launchpad Village ----------------
  const LP = LANDS.lp, lpG = new THREE.Group(); lpG.name = "land-lp"; lpG.position.set(LP.x, 0, LP.z); lpG.visible = false; planet.add(lpG);
  groundOf(lpG, LP, LP.r, "#2c6a3c", "#bff7c8");
  { const sq = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R - 3, 72), std(0x1c3a34, { roughness: 0.5, metalness: 0.3, emissive: 0x06281a, emissiveIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); sq.rotation.x = -Math.PI / 2; sq.position.y = 0.03; lpG.add(sq); ringOf(lpG, PLAZA_R - 3, 0.1, 0x39ff88, 0.8); }
  // the avenue in from the portal (south)
  const avenue = new THREE.Mesh(new THREE.PlaneGeometry(AVENUE - 2, 1), std(0x234a40, { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); avenue.rotation.x = -Math.PI / 2; avenue.position.y = 0.025; lpG.add(avenue);
  // the launch tower: a gantry, a rocket on the pad, a ring of light round the pad
  const tower = new THREE.Group(); lpG.add(tower);
  { const padM = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6, 0.5, 48), std(0x1a2a36, { metalness: 0.6, roughness: 0.3 })); padM.position.y = 0.25; tower.add(padM);
    const padR = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.12, 8, 80), glow(0x39ff88, 2.4)); padR.rotation.x = Math.PI / 2; padR.position.y = 0.52; tower.add(padR);
    const leg = new THREE.CylinderGeometry(0.16, 0.2, 13, 8), steel = std(0x5a6a7a, { metalness: 0.8, roughness: 0.35 });
    for (const [x, z] of [[-3.2, -2.4], [-3.2, 2.4], [-1.6, -2.4], [-1.6, 2.4]]) { const m = new THREE.Mesh(leg, steel); m.position.set(x, 6.8, z); tower.add(m); }
    for (let y = 2; y <= 12; y += 2.5) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 5), steel); m.position.set(-2.4, y, 0); tower.add(m); }
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 8, 24), std(0xe9f1f7, { metalness: 0.3, roughness: 0.25 })); hull.position.set(1.2, 4.6, 0); tower.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.4, 24), glow(0x39ff88, 1.6)); nose.position.set(1.2, 9.8, 0); tower.add(nose);
    for (let k = 0; k < 4; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 1.3), glow(0x2f86ff, 1.2)); const a = (k / 4) * Math.PI * 2; fin.position.set(1.2 + Math.cos(a) * 1.15, 1.4, Math.sin(a) * 1.15); fin.rotation.y = -a; tower.add(fin); }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 48), basic(0x7cf5c8)); halo.position.set(1.2, 12.4, 0); tower.add(halo);
    spins.push((dt, t) => { halo.rotation.z = t * 0.8; halo.position.y = 12.4 + Math.sin(t * 1.4) * 0.25; padR.material.emissiveIntensity = 2 + Math.sin(t * 2.2) * 0.6; }); }
  tower.userData.radius = 6.2; tower.userData.box = null;
  const lpBoard = boardOf(lpG, T("LAUNCHPAD VILLAGE"), T("Every coin launched on ArcPad has a lot here"), "#39ff88", 19, 16);
  const lpBack = portalOf(T("Back to town"), 0x39ff88); lpBack.name = "land-back"; lpBack.position.set(-11, 0, 12); lpBack.rotation.y = Math.atan2(11, -12); // (to the side of where you arrive: the way back, not in your face) lpBack.userData.to = "town"; lpG.add(lpBack);
  const newest = { tag: null, sym: "" }; // the newest launch's name over the tower
  function setNewest(c) { const s = c ? "$" + String(c.symbol || "?").slice(0, 10) : ""; if (s === newest.sym) return; newest.sym = s; if (newest.tag) { tower.remove(newest.tag); newest.tag.material.dispose(); } newest.tag = null; if (!c) return; const t = K.label(s, { accent: "#39ff88", size: 0.9, pre: T("Newest launch"), sub: "" }); t.position.set(1.2, 14.8, 0); tower.add(t); newest.tag = t; }
  let lpR = LP.r; const streets = new THREE.Group(); streets.name = "lp-streets"; lpG.add(streets);
  const stone = std(0x8d8676, { roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), lampPole = new THREE.CylinderGeometry(0.07, 0.1, 3, 6), lampHead = new THREE.SphereGeometry(0.26, 10, 8), poleM = std(0x2a3340, { metalness: 0.6, roughness: 0.4 }), headM = glow(0xfff1c8, 1.6);
  /// the streets: a stone ring round the plaza and one between each ring of lots, lamps along them
  function streetsTo(rings) {
    streets.children.slice().forEach((c) => { streets.remove(c); if (c.geometry && c.geometry !== lampPole && c.geometry !== lampHead) c.geometry.dispose(); });
    const radii = [PLAZA_R - 2.5, ...rings.map((q) => q.r1 + STREET / 2)];
    radii.forEach((rr) => { const m = new THREE.Mesh(new THREE.RingGeometry(rr - STREET / 2 + 0.6, rr + STREET / 2 - 0.6, 128), stone); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; streets.add(m);
      if (low) return; const n = Math.max(6, Math.round((Math.PI * 2 * rr) / 14));
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + 0.13; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < (AVENUE / 2 + 1) / rr) continue; const x = Math.sin(a) * (rr + STREET / 2 - 0.4), z = Math.cos(a) * (rr + STREET / 2 - 0.4);
        const pole = new THREE.Mesh(lampPole, poleM); pole.position.set(x, 1.5, z); const head = new THREE.Mesh(lampHead, headM); head.position.set(x, 3.05, z); streets.add(pole, head); } });
  }
  /// the lots' rings decide the village's size: the edge, the ground, the avenue's length follow
  function sizeTo(r, rings = []) { streetsTo(rings);
    lpR = LP.r = r; const old = lpG.userData.rim; if (old) { lpG.remove(old); old.geometry.dispose(); }
    lpG.userData.rim = ringOf(lpG, r, 0.16, LP.color, 0.85);
    const gr = lpG.userData.ground; if (gr) { gr.geometry.dispose(); gr.geometry = new THREE.CircleGeometry(r + 40, 96); if (groundMat) { const uv = gr.geometry.attributes.uv, pos = gr.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 660 + 0.5, pos.getY(i) / 660 + 0.5); uv.needsUpdate = true; } else { const m = gr.material.map; if (m) m.repeat.set(r / 16, r / 16); } }
    avenue.scale.set(1, r - PLAZA_R + 3, 1); avenue.position.set(0, 0.025, (r + PLAZA_R - 3) / 2);
  }
  /// a coin's lot: its pad (a square in the tier's colour), the tier on a little sign at its front; the coin's building
  /// (world-play.js) stands on it. Returns the lot's group (its position, rotation and radius set)
  function makeLot(L) {
    const tr = LOT_TIERS[L.tier], g = new THREE.Group(); g.name = "lot:" + L.coin.token; g.position.set(LP.x + L.x, 0, LP.z + L.z); g.rotation.y = L.ry;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(L.size, 0.16, L.size), std(0x16242c, { metalness: 0.3, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); pad.position.y = 0.08; g.add(pad);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(L.size + 0.3, 0.07, L.size + 0.3), basic(tr.color, 0.85)); edge.position.y = 0.05; g.add(edge);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), glow(tr.color, 1.4)); post.position.set((dx * L.size) / 2, 0.55, (dz * L.size) / 2); g.add(post); } // (its corners lit: a lot reads at night)
    const plate = K.label(tr.name === "Starter" ? T("Starter lot") : T("{t} lot", { t: tr.name }), { accent: tr.css, size: 0.42 }); plate.position.set(0, 0.9, L.size / 2 + 0.4); g.add(plate);
    g.userData.lot = L; g.userData.size = L.size;
    return g;
  }

  // ---------------- the Utility Village ----------------
  const UT = LANDS.ut, utG = new THREE.Group(); utG.name = "land-ut"; utG.position.set(UT.x, 0, UT.z); utG.visible = false; planet.add(utG);
  groundOf(utG, UT, UT.r, "#2c6a3c", "#bfe0ff");
  { const sq = new THREE.Mesh(new THREE.CircleGeometry(9, 64), std(0x22343f, { roughness: 0.5, metalness: 0.35, emissive: 0x06182e, emissiveIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); sq.rotation.x = -Math.PI / 2; sq.position.y = 0.03; utG.add(sq); ringOf(utG, 9, 0.08, 0x4f9dff, 0.8);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 3, 12), std(0x2a3c58, { metalness: 0.6, roughness: 0.3 })); core.position.y = 1.5; utG.add(core);
    const a = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 6, 48), basic(0x3f9bff)), b = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 6, 48), basic(0x39ff88)); a.position.set(-0.6, 3.6, 0); b.position.set(0.6, 3.6, 0); utG.add(a, b);
    spins.push((dt, t) => { a.rotation.y = t * 0.7; b.rotation.y = -t * 0.7; }); }
  boardOf(utG, T("UTILITY VILLAGE"), T("ARCIRCLE's utilities: launch, swap, stake, scan"), "#4f9dff", 17, 15);
  const utBack = portalOf(T("Back to town"), 0x4f9dff); utBack.name = "land-back"; utBack.position.set(-5.2, 0, 4.4); utBack.rotation.y = Math.atan2(5.2, -4.4); utBack.userData.to = "town"; utG.add(utBack);
  // the town's roads, district signs and grounds round the shops, as they were (K draws them round the origin)
  utG.add(K.makePaths()); if (K.makeDistrictSigns) utG.add(K.makeDistrictSigns(["launch", "finance", "research", "arcia"])); if (K.makeDistrictTints) utG.add(K.makeDistrictTints(["launch", "finance", "research", "arcia"]));
  if (K.makeLamps) utG.add(K.makeLamps());

  // ---------------- the town's portals (on the old shops' ring) ----------------
  const DEST = [
    { id: "lp", name: T("Launchpad Village"), col: 0x39ff88, phi: 0 },
    { id: "ut", name: T("Utility Village"), col: 0x4f9dff, phi: 70 },
    { id: "pv", name: T("Partner Village"), col: 0x38e1d6, phi: 150 },
    { id: "gv", name: T("Game Village"), col: 0xffc861, phi: 300 },
    // RAID QUEENS: out on the far hunting ring between The Last Rug (Lv 90–100) and Bridge Hack Abyss (Lv 80–90), where the
    // high levels hunt (the owner, 2026-10-25: "move it away from the fountain, out by the far hunting grounds"); its
    // own spot (at: x, z) rather than the shops' ring, no plaza line or path out to it, a citadel 12 m tall
    { id: "rq", name: "RAID QUEENS", col: 0xff4d8d, at: [-168, 62], h: 12 },
    // the Haunted Pumpkin Gate (2026-10-28, the owner's Halloween Realm spec: a giant pumpkin with a portal in its mouth) on the ring
    { id: "hw", name: T("Halloween Realm"), col: 0xff8a1f, phi: 225, h: 9 },
  ];
  const portals = DEST.map((d) => { const p = portalOf(d.name, d.col); p.name = "land-portal:" + d.id; p.userData.to = d.id;
    if (d.at) { p.position.set(d.at[0], 0, d.at[1]); p.rotation.set(0, Math.atan2(-d.at[0], -d.at[1]), 0); p.userData.far = true; } else K.placeOn(p, K.dirOf(d.th || 21, d.phi));
    planet.add(p); return p; });
  // b-st2: lines of light on the plaza floor from the fountain out to each portal, pulses running outward in its colour
  const lineU = { value: 0 };
  portals.forEach((p, i) => {
    const x = p.position.x, z = p.position.z, d = Math.hypot(x, z); if (d < 9 || p.userData.far) return; const r0 = 5.8, len = d - r0 - 2.6;
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uT: lineU, uC: { value: new THREE.Color(DEST[i].col) }, uL: { value: len }, uP: { value: i * 0.31 } },
      vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec2 vU; uniform float uT, uL, uP; uniform vec3 uC; void main(){ float along = vU.y * uL; float pulse = smoothstep(0.0, 0.25, fract(along / 3.0 - uT * 0.45 + uP)) * (1.0 - smoothstep(0.25, 0.6, fract(along / 3.0 - uT * 0.45 + uP))); float edge = 1.0 - abs(vU.x - 0.5) * 2.0; float ends = smoothstep(0.0, 0.08, vU.y) * (1.0 - smoothstep(0.88, 1.0, vU.y)); gl_FragColor = vec4(uC * (0.22 + pulse * 0.9) * edge * ends, 1.0); }" });
    const g = new THREE.PlaneGeometry(0.42, len); g.rotateX(-Math.PI / 2); g.translate(0, 0, -len / 2); // (along −z, from where it starts)
    const line = new THREE.Mesh(g, m); line.name = "plaza-line"; line.renderOrder = 1; line.frustumCulled = false;
    line.position.set((x / d) * r0, 0.075, (z / d) * r0); line.rotation.y = Math.atan2(-x, -z); planet.add(line);
  });
  spins.push((dt, t) => { lineU.value = t; });
  // the two villages' portals are the owner's models (models/world/lands, Meshy, packed by tools/pack-prop.mjs): 6.5 m
  // tall, in place of the rings, loaded a few seconds after the town (about 1 MB each)
  const MODELS = { lp: "/models/world/lands/portal-launchpad.glb", ut: "/models/world/lands/portal-utility.glb", pv: "/models/world/lands/portal-partnership.glb", gv: "/models/world/lands/portal-arcade.glb", /* (b-nx3: Partner and Game Village from Meshy too) */ rq: "/models/world/raid/gate.glb", hw: "/models/world/hwrealm/gate.glb" }, MODEL_H = 6.5;
  setTimeout(() => { for (const [id, url] of Object.entries(MODELS)) { const p = portals.find((q) => q.userData.to === id); if (!p || !K.gltfLoader) continue;
    try { K.gltfLoader().load(url + ver, (g) => {
      const o = g.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), H = (DEST.find((d) => d.id === id) || {}).h || MODEL_H, k = H / (sz.y || 1);
      o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.18 - box.min.y * k, -(box.min.z + sz.z / 2) * k); o.rotation.y = 0;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = !low; m.receiveShadow = false; } });
      p.children.forEach((c) => { if (c.isMesh && c.geometry && c.geometry.type === "TorusGeometry" && c.position.y > 1) c.visible = false; if (c.isMesh && c.geometry && c.geometry.type === "CircleGeometry") c.visible = false; }); // (the rings and their veil give way to the model)
      p.children.forEach((c) => { if (c.isSprite) c.position.y += H - 3.6; }); if (p.userData.subTag) p.userData.subTag.position.y = H + 0.25;
      p.add(o); p.userData.model = o; p.userData.radius = Math.max(1.6, Math.max(sz.x, sz.z) * k * 0.4); if (onModel) onModel(p);
    }, undefined, (e) => console.warn("land portal", e)); } catch (e) { console.warn("land portal", e); } } }, 6000);
  const town = new THREE.Group(); town.name = "land-portals"; // (the paths to them: world-play.js asks K.makePaths for these spokes)

  /// where you arrive in a land: by its portal back, facing in
  const arrival = (id) => (id === "lp" ? { x: LP.x + 3, z: LP.z + PLAZA_R - 6, c: { x: LP.x, z: LP.z - 20 } } : { x: UT.x + 2, z: UT.z + 6, c: { x: UT.x, z: UT.z - 20 } });
  const back = [lpBack, utBack];
  let shown = "";
  return {
    lpG, utG, portals, back, tower, spins, town, makeLot, setNewest, sizeTo, arrival,
    spokes: DEST.filter((d) => !d.at).map((d) => ({ theta: d.th || 21, phi: d.phi })),
    /// show only the land you're in (null: the town)
    show(id) { if (id === shown) return; shown = id || ""; lpG.visible = shown === "lp"; utG.visible = shown === "ut"; },
    /// the edge you can't walk past in a land (x, z: where you'd stand)
    outside(id, x, z) { const L = LANDS[id]; return !!L && Math.hypot(x - L.x, z - L.z) > (id === "lp" ? lpR : L.r); },
    count(id, n) { const p = portals.find((q) => q.userData.to === id); if (p) p.userData.setSub(n > 0 ? T("{n} here now", { n }) : ""); },
    radius: (id) => (id === "lp" ? lpR : LANDS[id] ? LANDS[id].r : 0),
    tick(dt, t) { for (const f of spins) f(dt, t); },
  };
}
