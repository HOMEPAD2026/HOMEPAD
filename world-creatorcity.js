// world-creatorcity.js — CREATOR CITY, ARCIRCLE STUDIO BETA's own land (2026-10-26, the owner: "스튜디오 라이트가 아니라 베타를 오픈하자 —
// 레이드퀸즈처럼 지금의 스튜디오 건물을 포탈로 만들고 게임 제작소의 세계를"): reached through the Studio by the town's fountain
// (world-studiohub.js), LANDS.cc far off like the other lands. Its plaza holds the Hall of Fame; round it the Creator
// Academy (the 10-minute first game), the Studio Tower (make and edit), the Game Arcade (a portal for each top game in
// front of it — walk in and you're playing), the Contest Arena, the Creator Market, the Asset Factory and the Launch
// Portal; a portal home on the way in. Each building is a stand-in until its Meshy model is in (models/world/cc/<glb>).
//   makeCreatorCity({ THREE, K, planet, T, low, ver, land }) → { group, doors, back, solids, show(on), tick(dt, t), arrival(),
//     setGames(list), portalOf(id), marks(), FAC }
export const FAC = [
  { id: "hall", name: "Hall of Fame", sub: "The top creators and games", a: 0, r: 0, fp: 13, glb: "hall", col: 0xffd23a, css: "#ffd23a", icon: "🏆" },
  { id: "academy", name: "Creator Academy", sub: "Your first game in 10 minutes", a: 40, r: 44, fp: 16, glb: "academy", col: 0x7cf5c8, css: "#7cf5c8", icon: "🎓" },
  { id: "market", name: "Creator Market", sub: "Layouts and kits from creators", a: 90, r: 46, fp: 17, glb: "market", col: 0xff9f2e, css: "#ff9f2e", icon: "🛍️" },
  { id: "tower", name: "Studio Tower", sub: "Make and edit your games", a: 135, r: 46, fp: 16, glb: "tower", col: 0x5fd3ff, css: "#5fd3ff", icon: "🛠️", h: 30 },
  { id: "arcade", name: "Game Arcade", sub: "Play what everyone made", a: 180, r: 50, fp: 22, glb: "arcade", col: 0xff6fae, css: "#ff6fae", icon: "🕹️" },
  { id: "contest", name: "Contest Arena", sub: "This week's creator contest", a: 225, r: 46, fp: 17, glb: "contest", col: 0xb48cff, css: "#b48cff", icon: "🥇" },
  { id: "factory", name: "Asset Factory", sub: "Parts you unlock as you create", a: 270, r: 46, fp: 16, glb: "factory", col: 0x39ff88, css: "#39ff88", icon: "🏭" },
  { id: "launch", name: "Launch Portal", sub: "Your game's launch — coming soon", a: 320, r: 44, fp: 15, glb: "launch", col: 0x4f9dff, css: "#4f9dff", icon: "🚀" },
];
const rad = (a) => (a * Math.PI) / 180;
const polar = (a, r) => [Math.sin(rad(a)) * r, Math.cos(rad(a)) * r]; // a = 0 is south (+z, the way in), 180 north
const PORTALS = 6; // game portals before the arcade

export function makeCreatorCity({ THREE, K, planet, T = (s) => s, low = false, ver = "", land, esc = (s) => s }) {
  const g = new THREE.Group(); g.name = "land-cc"; g.position.set(land.x, 0, land.z); g.visible = false; planet.add(g);
  const spins = [], solids = [], doors = [], bld = {};
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.25, ...o });
  const neon = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  const canvasTex = (w, h, draw) => { if (typeof document === "undefined") return null; const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData = { cv }; return t; };
  const WHITE = std(0xf2f7fd, { roughness: 0.3, metalness: 0.15 }), GLASS = std(0x7fd4ff, { roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.6, emissive: 0x2a8cff, emissiveIntensity: 0.3 });
  // ---------------- the ground: pale creator paving with a light grid, the plaza, walkways to each building ----------------
  { const tex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = "#e7eef8"; x.fillRect(0, 0, w, h); x.strokeStyle = "#5fd3ff"; x.globalAlpha = 0.35; x.lineWidth = 2; for (let k = 0; k <= 8; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, h); x.stroke(); x.beginPath(); x.moveTo(0, k * 64); x.lineTo(w, k * 64); x.stroke(); } });
    if (tex) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(16, 16); }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(land.r + 50, 96), std(0xffffff, { map: tex, roughness: 0.5, metalness: 0.05 })); ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; ground.receiveShadow = !low; ground.name = "cc-ground"; g.add(ground); bld.ground = ground;
    const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(17, 72), std(0xffffff, { roughness: 0.3, metalness: 0.2, ...off })); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; g.add(plaza);
    for (const [r, w, c, op] of [[17, 0.12, 0x5fd3ff, 0.95], [land.r, 0.16, 0x7cf5c8, 0.8], [26, 0.06, 0xffd23a, 0.7]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 4, 160), neon(c, op)); m.rotation.x = Math.PI / 2; m.position.y = 0.06; g.add(m); }
    // walkways from the plaza to each door and the way in, glowing at their edges
    for (const f of [...FAC.filter((f0) => f0.r), { a: 0, r: land.r - 8, fp: 0, col: 0x7cf5c8 }]) {
      const len = f.r - f.fp / 2 - 2 - 17; if (len < 2) continue; const [cx, cz] = polar(f.a, 17 + len / 2);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(5, len), std(0xd5e3f3, { roughness: 0.35, metalness: 0.2, ...off })); w.rotation.set(-Math.PI / 2, 0, rad(f.a)); w.position.set(cx, 0.035, cz); g.add(w);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.16, len), neon(f.col, 0.85)); e.rotation.set(-Math.PI / 2, 0, rad(f.a)); const [ox, oz] = polar(f.a + 90, s * 2.5); e.position.set(cx + ox, 0.05, cz + oz); g.add(e); }
    }
  }
  // ---------------- a sign that turns to face you ----------------
  function board(parent, title, sub, col, y, w = 11) {
    const tex = canvasTex(1024, 300, (x) => { x.beginPath(); if (x.roundRect) x.roundRect(8, 8, 1008, 284, 44); else x.rect(8, 8, 1008, 284); x.fillStyle = "rgba(6,18,40,.9)"; x.fill(); x.lineWidth = 8; x.strokeStyle = col; x.stroke();
      x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = col; x.shadowBlur = 22; x.fillStyle = "#fff"; x.font = "900 88px Sora, 'Segoe UI', sans-serif"; x.fillText(title, 512, 112, 960); x.shadowBlur = 0; x.fillStyle = "#cfe6ff"; x.font = "800 44px Sora, 'Segoe UI', sans-serif"; x.fillText(sub, 512, 222, 940); });
    if (!tex) return null;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.293), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); m.position.y = y; m.renderOrder = 11; parent.add(m);
    const qp = new THREE.Quaternion(); m.onBeforeRender = (r, sc, cam) => { parent.getWorldQuaternion(qp); m.quaternion.copy(qp.invert().multiply(cam.quaternion)); m.updateMatrixWorld(); };
    const y0 = y, ph = Math.random() * 6; spins.push((dt, t) => { m.position.y = y0 + Math.sin(t * 1.2 + ph) * 0.2; });
    return m;
  }
  function door(o, id, col, d) {
    const dr = new THREE.Group(); dr.name = "cc-door:" + id; dr.position.set(0, 0, d); dr.userData.radius = 1; dr.userData.b = id; o.add(dr); doors.push(dr);
    const pad = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 40), neon(col, 0.85)); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.07; dr.add(pad);
    const pl = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), neon(col, 0.18)); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.065; dr.add(pl);
    spins.push((dt, t) => { pad.scale.setScalar(1 + Math.sin(t * 3) * 0.06); }); return dr;
  }
  const solid = (o, r) => { const s = new THREE.Group(); s.userData.radius = r; o.add(s); solids.push(s); };
  // ---------------- the buildings: a stand-in each (a white body, a glass band, a glowing crown in its colour) ----------------
  for (const f of FAC) {
    const [x, z] = polar(f.a, f.r), o = new THREE.Group(); o.name = "cc-" + f.id; o.position.set(x, 0, z); if (f.r) o.rotation.y = Math.atan2(-x, -z); g.add(o); bld[f.id] = o;
    const P = new THREE.Group(); P.name = "stand-in"; o.add(P); o.userData.p = P;
    const H = f.h || (f.id === "hall" ? 7 : 10), W = f.fp * 0.72, glow = neon(f.col, 0.9);
    if (f.id === "hall") { // (a rotunda: a ring of pillars round an empty pedestal, a gold roof ring)
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, H, 12), WHITE); p.position.set(Math.cos(a) * W / 2, H / 2, Math.sin(a) * W / 2); P.add(p); }
      const roof = new THREE.Mesh(new THREE.TorusGeometry(W / 2, 0.45, 8, 48), std(0xffc861, { metalness: 0.9, roughness: 0.25, emissive: 0x6a4200, emissiveIntensity: 0.4 })); roof.rotation.x = Math.PI / 2; roof.position.y = H; P.add(roof);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 1.2, 24), WHITE); ped.position.y = 0.6; P.add(ped);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), glow); star.position.y = 2.6; P.add(star); spins.push((dt, t) => { star.rotation.y = t; star.position.y = 2.6 + Math.sin(t * 1.5) * 0.2; });
      o.userData.board = board(o, "🏆 " + T(f.name), T(f.sub), f.css, H + 3, 10); door(o, f.id, f.col, W / 2 + 2.2); solid(o, 1.9); continue;
    }
    const body = new THREE.Mesh(f.id === "contest" || f.id === "launch" ? new THREE.CylinderGeometry(W / 2, W / 2 + 0.6, H, 28) : new THREE.BoxGeometry(W, H, W * 0.8), WHITE); body.position.y = H / 2; P.add(body);
    const band = new THREE.Mesh(f.id === "contest" || f.id === "launch" ? new THREE.CylinderGeometry(W / 2 + 0.05, W / 2 + 0.05, H * 0.28, 28, 1, true) : new THREE.BoxGeometry(W + 0.1, H * 0.28, W * 0.8 + 0.1), GLASS); band.position.y = H * 0.62; P.add(band);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(Math.min(3.2, W / 3), 0.25, 8, 40), glow); crown.position.y = H + 2.2; P.add(crown); spins.push((dt, t) => { crown.rotation.y = t * 0.8; crown.rotation.x = Math.sin(t * 0.6) * 0.3; });
    o.userData.board = board(o, f.icon + " " + T(f.name), T(f.sub), f.css, H + 4.8);
    door(o, f.id, f.col, (f.id === "contest" || f.id === "launch" ? W / 2 + 0.6 : W * 0.4) + 1.8); solid(o, Math.min(10, W / 2 - 0.4));
  }
  // ---------------- the Meshy models, one at a time once you're in (each fitted to its footprint) ----------------
  let started = false; const loaded = {};
  function fit(sc, fp) { const box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), k = fp / (Math.max(sz.x, sz.z) || 1); sc.scale.setScalar(k); sc.position.set(-(box.min.x + sz.x / 2) * k, -box.min.y * k, -(box.min.z + sz.z / 2) * k); const w = new THREE.Group(); w.add(sc); return { w, h: sz.y * k }; }
  function loadModels() {
    if (started || !K.gltfLoader) return; started = true;
    const q = FAC.slice().sort((a, b) => (a.id === "arcade" ? -1 : b.id === "arcade" ? 1 : 0)); let i = 0;
    const next = () => { const f = q[i++]; if (!f) return; try { K.gltfLoader().load(`/models/world/cc/${f.glb}.glb${ver}`, (gl) => { const o = bld[f.id], m = fit(gl.scene, f.fp); gl.scene.traverse((x) => { if (x.isMesh) { x.castShadow = false; x.receiveShadow = !low; } }); o.add(m.w); o.userData.p.visible = false; loaded[f.id] = true; if (o.userData.board) o.userData.board.position.y = m.h + 3.2; next(); }, undefined, () => next()); } catch { next(); } };
    next();
  }
  // ---------------- the Game Arcade's portals: the top games, each a door you walk into ----------------
  const portals = [], arc = FAC.find((f) => f.id === "arcade");
  for (let i = 0; i < PORTALS; i++) {
    const a = arc.a - 25 + (50 * i) / (PORTALS - 1), [x, z] = polar(a, 33), o = new THREE.Group(); o.name = "cc-gp" + i; o.position.set(x, 0, z); o.rotation.y = Math.atan2(-x, -z); g.add(o);
    const M = neon(0x7cf5c8, 0.95), ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.16, 10, 48), M); ring.position.y = 2.3; o.add(ring);
    const film = new THREE.Mesh(new THREE.CircleGeometry(1.8, 40), new THREE.MeshBasicMaterial({ color: 0x7cf5c8, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); film.position.y = 2.3; o.add(film);
    const tex = canvasTex(512, 160, () => {}), sign = tex ? new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.12), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })) : null; if (sign) { sign.position.y = 4.9; o.add(sign); }
    spins.push((dt, t) => { ring.rotation.z = t * 0.6 + i; film.material.opacity = 0.18 + Math.sin(t * 2 + i) * 0.06; });
    const dr = door(o, "gp" + i, 0x7cf5c8, 0.2); o.visible = false; portals.push({ o, ring, film, tex, sign, dr, game: null });
  }
  function setGames(list) {
    const L = (list || []).slice(0, PORTALS);
    portals.forEach((p, i) => { const gm = L[i] || null; p.game = gm; p.o.visible = !!gm; if (!gm || !p.tex) return;
      const col = new THREE.Color(gm.css || "#7cf5c8"); p.ring.material.color.copy(col); p.film.material.color.copy(col);
      const s = 1 + Math.min(0.5, (gm.plays || 0) / 400 + (gm.likes || 0) / 80); p.o.scale.setScalar(s); // (a more played game's portal stands taller)
      const c = p.tex.userData.cv.getContext("2d"); c.clearRect(0, 0, 512, 160); c.beginPath(); if (c.roundRect) c.roundRect(4, 4, 504, 152, 30); else c.rect(4, 4, 504, 152); c.fillStyle = "rgba(4,14,30,.88)"; c.fill(); c.lineWidth = 5; c.strokeStyle = gm.css || "#7cf5c8"; c.stroke();
      c.textAlign = "center"; c.fillStyle = "#fff"; c.font = "900 48px Sora, 'Segoe UI', sans-serif"; c.fillText(gm.title || "", 256, 70, 480); c.fillStyle = "#cfe0f5"; c.font = "800 28px Sora, 'Segoe UI', sans-serif"; c.fillText(`▶ ${gm.plays || 0}  ♥ ${gm.likes || 0} · ${gm.byName || ""}`, 256, 122, 480); p.tex.needsUpdate = true; });
  }
  // ---------------- the way home ----------------
  const back = K.makePortal(T("Back to town")); back.name = "cc-back"; back.userData.radius = 1.6; back.userData.to = "town"; spins.push(...(back.userData.spin || []));
  { const [x, z] = polar(0, land.r - 6); back.position.set(x, 0, z); back.rotation.y = Math.atan2(-x, -z) + Math.PI; g.add(back); }
  let shown = false;
  return {
    group: g, doors, back, solids, FAC,
    show(on) { on = !!on; if (on === shown) return; shown = on; g.visible = on; if (on) loadModels(); },
    tick(dt, t) { if (shown) for (const f of spins) f(dt, t); },
    arrival: () => ({ x: land.x, z: land.z + land.r - 16, c: { x: land.x, z: land.z } }),
    setGames, portalGame: (i) => (portals[i] ? portals[i].game : null),
    marks: () => FAC.map((f) => ({ g: bld[f.id], css: f.css, s: f.id === "hall" ? 6 : 5.5, ch: f.icon })),
    door: (id) => doors.find((d) => d.userData.b === id) || null,
    loaded: () => ({ ...loaded }),
  };
}
