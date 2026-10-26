// world-adcity.js — AD-City 1 (the owner's call, 2026-10-23): NEXUS CITY, AGENT DIMENSION's own land. The Citadel in
// town warps you here (world-play.js agentWarp); a portal on the south avenue takes you back. Like the Launchpad and
// Utility Villages (world-lands.js) it lies on the same ground far off (LANDS.ad, 2.4 km south), so your hero, your
// agent, chat and other players work here as in town; its group is shown only while you're in it.
//   the plaza        the NEXUS CORE: a white spire, three orbiting rings, the ∞ of light over it, a ticker band
//   the ring road    lanes of light, an elevated maglev ring with two trains, flying pods on loops overhead
//   six buildings    Genesis Lab (your agent's window) · Errand Port (errands) · Vault Tower (the vault) on the inner ring;
//                    Agent Academy · Agent Arena · ARCIRCLE Studio, being built (a card says what each will do)
//   the skyline      glass towers with lit windows (box / round / twisted), lamps along the avenues, holo billboards
// Everything is drawn here (only the agents' portraits are fetched); with low graphics the pods, drones and motes are fewer or gone.
export const BUILDINGS = [
  { id: "genesis", name: "Genesis Lab", sub: "Create and meet your agent", a: 45, r: 46, fp: 20, glb: "nexus", col: 0x5fd3ff, css: "#5fd3ff", open: true },
  { id: "port", name: "Errand Port", sub: "Send your agent on errands", a: 315, r: 46, fp: 20, glb: "launch", col: 0x39ff88, css: "#39ff88", open: true },
  { id: "vault", name: "Vault Tower", sub: "Your agent's trading vault", a: 225, r: 46, fp: 21, glb: "vault", col: 0xffc861, css: "#ffc861", open: true },
  { id: "academy", name: "Agent Academy", sub: "Skills, traits and lessons", a: 135, r: 46, fp: 22, glb: "library", col: 0xb48cff, css: "#b48cff" },
  { id: "arena", name: "Agent Arena", sub: "Quiz duels with your agent", a: 180, r: 70, fp: 26, glb: "arena", col: 0xff6fae, css: "#ff6fae", open: true }, // (AD-City 4: world-agarena.js)
];
// the owner's Meshy models (models/world/adcity, packed by tools/pack-prop.mjs; +z is each one's front): the buildings
// above, the plaza's Infinity Spire City, and road pieces (a straight highway, a crossroads, a raised quarter curve).
// They load once you're in (about 8 MB together); until one arrives its drawn stand-in shows.
export const MODELS = { spire: "spire-city", highway: "highway", cross: "crossroads", curve: "curve", sky: "skyblade" };
// what the buildings still being built will do (the card when you walk up)
export const SOON = {
  academy: { icon: "🎓", lines: ["Your agent learns new skills here: lessons, traits (gatherer · scout · trader) and level-ups.", "Classes with other players' agents, and a diploma for each course."] },
  arena: { icon: "🏟️", lines: ["Agents face off in quiz and strategy duels while you watch and cheer.", "A weekly ladder of the sharpest agents."] },
  studio: { icon: "🎮", lines: ["ARCIRCLE Studio Lite: make your own mini-game from a template (runner, arena, puzzle, defense), with your agent's help.", "Publish it to the Creator Arcade for everyone to play."] },
};
// AD-City 2 (the owner's call, 2026-10-23): agents out on an errand are seen at work here. Each errand has a station
// between the buildings (a = angle, r = distance from the core); everyone's working agents (?world=agent-city) stand
// round its pad playing the job's clip (CU_AS names: cast / attack / shoot), a tag over each with who and how long.
// With nobody out, a city crew (one agent a station, marked as the city's) keeps the stations busy.
export const STATIONS = {
  gather: { name: "Bio Garden", job: "Gather in Jurassic", a: 67.5, r: 40, col: 0x39ff88, css: "#39ff88", clip: "cast" },
  mine: { name: "Ore Refinery", job: "Mine ore", a: 247.5, r: 40, col: 0xffc861, css: "#ffc861", clip: "attack" },
  scout: { name: "Scout Deck", job: "Scout & hunt", a: 292.5, r: 40, col: 0xb48cff, css: "#b48cff", clip: "shoot" },
};
export const CREW = [["aurora", "gather"], ["orion", "mine"], ["vex", "scout"]];
const rad = (d) => (d * Math.PI) / 180;
const polar = (a, r) => [Math.sin(rad(a)) * r, Math.cos(rad(a)) * r]; // a = 0 is south (+z, the way in), 180 north

/// the city. ctx: { THREE, K, planet, T, low, land: { x, z, r } }
export function makeAdCity({ THREE, K, planet, T = (s) => s, low = false, ver = "", land, onModel = null, me = () => "", demo = false }) {
  const g = new THREE.Group(); g.name = "land-ad"; g.position.set(land.x, 0, land.z); g.visible = false; planet.add(g);
  const spins = [], solids = [], doors = [];
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, ...o });
  const neon = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  const add = (THREEobj, parent = g) => { parent.add(THREEobj); return THREEobj; };
  const canvasTex = (w, h, draw) => { if (typeof document === "undefined") return null; const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const WHITE = std(0xeef4fb, { roughness: 0.32, metalness: 0.18 }), STEEL = std(0x9fb2c8, { roughness: 0.25, metalness: 0.75 }), DARK = std(0x16233a, { roughness: 0.35, metalness: 0.6 });
  const GOLD = std(0xffc861, { roughness: 0.25, metalness: 0.9, emissive: 0x6a4200, emissiveIntensity: 0.35 });
  const GLASS = std(0x3d86d6, { roughness: 0.08, metalness: 0.9, emissive: 0x0d3a77, emissiveIntensity: 0.55 });

  // ---------------- the ground: dark glass with a grid of light, the plaza, the ring road, four avenues ----------------
  { const tex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = "#c9d8ea"; x.fillRect(0, 0, w, h); x.strokeStyle = "#3f8cff"; x.globalAlpha = 0.32; /* (AD-City 1.5: pale paving, the owner's bright look — it was dark glass) */ x.lineWidth = 2; for (let k = 0; k <= 8; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, h); x.stroke(); x.beginPath(); x.moveTo(0, k * 64); x.lineTo(w, k * 64); x.stroke(); } x.globalAlpha = 0.7; x.fillStyle = "#2fb8ff"; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) x.fillRect(i * 64 - 2, j * 64 - 2, 4, 4); });
    if (tex) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18, 18); }
    const ground = add(new THREE.Mesh(new THREE.CircleGeometry(land.r + 60, 96), std(0xffffff, { map: tex, roughness: 0.42, metalness: 0.12 }))); ground.rotation.x = -Math.PI / 2; ground.position.y = 0.01; ground.receiveShadow = true;
    const flat = (geo, mat, y) => { const m = add(new THREE.Mesh(geo, mat)); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; return m; };
    const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    flat(new THREE.CircleGeometry(16, 64), std(0xdfe8f3, { roughness: 0.3, metalness: 0.25, ...off }), 0.03); // the plaza
    // (no ring road on the ground: the raised ring highway is the ring road — its lane lines and a flat crossroads under it
    // looked like a tangle of four-lane roads, the owner's call 2026-10-24)
    const ln = (r, w, c, op = 0.95) => { const m = add(new THREE.Mesh(new THREE.TorusGeometry(r, w, 4, 160), neon(c, op))); m.rotation.x = Math.PI / 2; m.position.y = 0.06; return m; };
    ln(16, 0.09, 0x5fd3ff); ln(land.r, 0.16, 0x5fd3ff, 0.85);
    // the avenues (N/E/S/W), 8 m wide, with light edges and pulses running out from the plaza
    const lineU = { value: 0 }, pulseM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uT: lineU },
      vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec2 vU; uniform float uT; void main(){ float k = fract(vU.y * 9.0 - uT * 0.6); float p = smoothstep(0.0, 0.2, k) * (1.0 - smoothstep(0.2, 0.5, k)); float e = 1.0 - abs(vU.x - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.37, 0.83, 1.0) * (0.25 + p) * e, 1.0); }" });
    for (const a of [0, 90, 180, 270]) {
      const len = land.r - 16, [cx, cz] = polar(a, 16 + len / 2), road = add(new THREE.Mesh(new THREE.PlaneGeometry(8, len), std(0x0b1220, { roughness: 0.55, metalness: 0.4, ...off })));
      road.rotation.set(-Math.PI / 2, 0, rad(a)); road.position.set(cx, 0.03, cz); road.receiveShadow = true;
      for (const s of [-1, 1]) { const e = add(new THREE.Mesh(new THREE.PlaneGeometry(0.22, len), neon(0xeef4fb, 0.9))); e.rotation.set(-Math.PI / 2, 0, rad(a)); const [ox, oz] = polar(a + 90, s * 3.9); e.position.set(cx + ox, 0.05, cz + oz); }
      const pg = new THREE.PlaneGeometry(0.5, len); pg.rotateX(-Math.PI / 2); pg.translate(0, 0, -len / 2);
      const p = add(new THREE.Mesh(pg, pulseM)); const [sx, sz] = polar(a, 16); p.position.set(sx, 0.2, sz); p.rotation.y = rad(a) + Math.PI; p.renderOrder = 1; /* (over the highway pieces once they're down) */
    }
    spins.push((dt, t) => { lineU.value = t; });
  }

  // ---------------- signs: a board that turns to face you ----------------
  function board(parent, title, sub, col, y, w = 12) {
    const tex = canvasTex(1024, 300, (x) => {
      x.beginPath(); if (x.roundRect) x.roundRect(8, 8, 1008, 284, 44); else x.rect(8, 8, 1008, 284); const bg = x.createLinearGradient(0, 0, 0, 300); bg.addColorStop(0, "rgba(6,18,40,.92)"); bg.addColorStop(1, "rgba(2,6,16,.92)"); x.fillStyle = bg; x.fill();
      x.lineWidth = 8; const bd = x.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#2f8cff"); bd.addColorStop(0.5, col); bd.addColorStop(1, "#7cf5c8"); x.strokeStyle = bd; x.stroke();
      x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = col; x.shadowBlur = 22; x.fillStyle = "#fff"; x.font = "900 92px Sora, 'Segoe UI', sans-serif"; x.fillText(title, 512, 112, 960);
      x.shadowBlur = 0; x.fillStyle = "#cfe6ff"; x.font = "800 46px Sora, 'Segoe UI', sans-serif"; x.fillText(sub, 512, 222, 940);
    });
    if (!tex) return null;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.293), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); m.position.y = y; m.renderOrder = 11; parent.add(m);
    const qp = new THREE.Quaternion(); m.onBeforeRender = (r, sc, cam) => { parent.getWorldQuaternion(qp); m.quaternion.copy(qp.invert().multiply(cam.quaternion)); m.updateMatrixWorld(); };
    const y0 = y, ph = rnd() * 6; spins.push((dt, t) => { m.position.y = y0 + Math.sin(t * 1.2 + ph) * 0.2; });
    return m;
  }

  // ---------------- glass towers: windows that light up (one texture, repeated by each tower's size) ----------------
  const winTex = canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = "#0a1730"; x.fillRect(0, 0, w, h); const cw = w / 8, ch = h / 16;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) { const v = rnd(); if (v < 0.35) continue; x.fillStyle = v < 0.55 ? "#9fe6ff" : v < 0.8 ? "#3f9bff" : v < 0.93 ? "#eef4fb" : "#ffd27a"; x.globalAlpha = 0.45 + rnd() * 0.55; x.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 9); }
    x.globalAlpha = 1; x.fillStyle = "#cfe0f5"; for (let j = 0; j < 16; j += 4) x.fillRect(0, j * ch, w, 3);
  });
  if (winTex) { winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; }
  const towerM = std(0xffffff, { map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.12, metalness: 0.6 });
  const uvScale = (geo, su, sv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return geo; };
  spins.push((dt, t) => { towerM.emissiveIntensity = 0.82 + Math.sin(t * 0.6) * 0.08 + (Math.sin(t * 7.3) > 0.995 ? 0.25 : 0); }); // (the windows breathe, now and then a flicker)
  const edgeNeon = [neon(0x5fd3ff), neon(0x7cf5c8), neon(0xb48cff), neon(0x3f9bff)];
  function tower(x, z, kind, w, h, ci = 0) {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = Math.atan2(-x, -z); g.add(t); t.userData.radius = Math.min(10, w * 0.62);
    let body;
    if (kind === "round") body = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(w / 2, w / 2 * 1.08, h, 20, 1, true), (Math.PI * w) / 12, h / 51), towerM);
    else { const geo = uvScale(new THREE.BoxGeometry(w, h, w, 1, kind === "twist" ? 14 : 1, 1), w / 12, h / 51);
      if (kind === "twist") { const p = geo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = ((v.y + h / 2) / h) * rad(75), c = Math.cos(k), s = Math.sin(k); p.setXYZ(i, v.x * c - v.z * s, v.y, v.x * s + v.z * c); } geo.computeVertexNormals(); }
      body = new THREE.Mesh(geo, towerM); }
    body.position.y = h / 2 + 1.2; t.add(body);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.82, w * 0.9, 1.2, kind === "round" ? 24 : 4), WHITE); base.position.y = 0.6; if (kind !== "round") base.rotation.y = Math.PI / 4; t.add(base);
    const cap = new THREE.Mesh(kind === "round" ? new THREE.CylinderGeometry(w / 2 * 0.86, w / 2, 1.4, 20) : new THREE.BoxGeometry(w * 1.04, 1.4, w * 1.04), WHITE); cap.position.y = h + 1.9; if (kind === "twist") cap.rotation.y = rad(75); t.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(kind === "round" ? w / 2 + 0.05 : w * 0.72, 0.09, 4, kind === "round" ? 40 : 4), edgeNeon[ci % 4]); ring.rotation.x = Math.PI / 2; if (kind !== "round") ring.rotation.z = Math.PI / 4; ring.position.y = h + 1.15; if (kind === "twist") ring.rotation.z += rad(75); t.add(ring);
    if (kind === "box") for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), edgeNeon[ci % 4]); e.position.set((sx * w) / 2, h / 2 + 1.2, (sz * w) / 2); t.add(e); }
    if (h > 30) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 7, 6), STEEL); ant.position.y = h + 6; t.add(ant); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), neon(0xff4d6d)); tip.position.y = h + 9.6; t.add(tip); const ph = rnd() * 3; spins.push((dt, tt) => { tip.visible = (tt + ph) % 1.6 < 0.25; }); }
    solids.push(t); return t;
  }
  // the skyline round the edge and a ring of towers between the buildings (kept off the avenues and the buildings)
  const kinds = ["box", "round", "twist"], clear = (a, half) => [0, 90, 180, 270].some((v) => Math.abs(((a - v + 540) % 360) - 180) < half);
  const nearB = (a, r, gap) => BUILDINGS.some((b) => { const [bx, bz] = polar(b.a, b.r), [x, z] = polar(a, r); return Math.hypot(bx - x, bz - z) < gap; });
  let ti = 0;
  for (let a = 6; a < 360; a += low ? 16 : 11) { const r = 80 + (ti % 3) * 4; if (clear(a, 9) || nearB(a, r, 22)) continue; tower(...polar(a, r), kinds[ti % 3], 7 + rnd() * 4, 22 + rnd() * 36, ti); ti++; }
  for (const a of [20, 70, 110, 160, 200, 250, 290, 340]) { if (nearB(a, 63, 16)) continue; tower(...polar(a, 63), kinds[ti % 3], 5 + rnd() * 2, 14 + rnd() * 14, ti); ti++; }

  // ---------------- the six buildings ----------------
  const bld = {};
  function spot(b) {
    const [x, z] = polar(b.a, b.r), o = new THREE.Group(); o.name = "adc-" + b.id; o.position.set(x, 0, z); o.rotation.y = Math.atan2(-x, -z); g.add(o); // (its front, +z, faces the plaza)
    const P = new THREE.Group(); P.name = "stand-in"; o.add(P); o.userData.p = P; bld[b.id] = o; return o;
  }
  function door(o, b, d) { // the spot in front you walk up to
    const dr = new THREE.Group(); dr.name = "adc-door:" + b.id; dr.position.set(0, 0, d); dr.userData.radius = 1; dr.userData.b = b.id; o.add(dr); doors.push(dr);
    const pad = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 40), neon(b.col, 0.85)); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.07; dr.add(pad);
    const pl = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), neon(b.col, 0.18)); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.065; dr.add(pl);
    spins.push((dt, t) => { pad.scale.setScalar(1 + Math.sin(t * 3) * 0.06); });
    if (!b.open) { const s = K.label("🚧 " + T("Coming soon"), { accent: "#ffe066", size: 0.6 }); s.position.y = 2.6; dr.add(s); }
    return dr;
  }
  const body = (o, r) => { const s = new THREE.Group(); s.userData.radius = r; o.add(s); solids.push(s); };
  // Genesis Lab: a white podium, a glass dome with a helix of light turning inside, a halo floating over it
  { const b = BUILDINGS[0], o = spot(b), P = o.userData.p;
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.6, 1.6, 48), WHITE); pod.position.y = 0.8; P.add(pod);
    const band = new THREE.Mesh(new THREE.TorusGeometry(9.05, 0.1, 4, 96), neon(b.col)); band.rotation.x = Math.PI / 2; band.position.y = 1.2; P.add(band);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7.4, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), std(0x6fc8ff, { roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.42, emissive: 0x0a3a6a, emissiveIntensity: 0.6, depthWrite: false })); dome.position.y = 1.6; dome.renderOrder = 2; P.add(dome);
    for (let i = 0; i < 6; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(7.45, 0.12, 4, 48, Math.PI), WHITE); rib.position.y = 1.6; rib.rotation.y = (i / 6) * Math.PI; P.add(rib); }
    const hx = new THREE.Group(); hx.position.y = 1.6; P.add(hx); const sg = new THREE.SphereGeometry(0.26, 10, 8), m1 = neon(0x5fd3ff), m2 = neon(0x7cf5c8);
    for (let i = 0; i < 26; i++) { const k = i / 26, a = k * Math.PI * 4, y = 0.6 + k * 5; for (const [s, m] of [[0, m1], [Math.PI, m2]]) { const p = new THREE.Mesh(sg, m); p.position.set(Math.cos(a + s) * 1.3, y, Math.sin(a + s) * 1.3); hx.add(p); } }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.22, 8, 80), neon(b.col)); halo.rotation.x = Math.PI / 2; halo.position.y = 11; P.add(halo);
    spins.push((dt, t) => { hx.rotation.y = t * 0.8; halo.position.y = 11 + Math.sin(t * 1.4) * 0.4; halo.rotation.z = t * 0.3; });
    o.userData.board = board(o, T(b.name), T(b.sub), b.css, 14.5); door(o, b, b.fp / 2 + 1.6); body(o, Math.min(11, b.fp / 2 - 0.6)); }
  // Errand Port: a hexagonal landing deck on pillars, a control tower with a saucer, drones flying round it
  { const b = BUILDINGS[1], o = spot(b), P = o.userData.p;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 4.6, 10), STEEL); p.position.set(Math.cos(a) * 6.4, 2.3, Math.sin(a) * 6.4); P.add(p); }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.2, 0.7, 6), WHITE); deck.position.y = 4.9; P.add(deck);
    const mark = new THREE.Mesh(new THREE.RingGeometry(4, 4.5, 6), neon(b.col)); mark.rotation.x = -Math.PI / 2; mark.position.y = 5.27; P.add(mark);
    const H = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32), neon(0xeef4fb)); H.rotation.x = -Math.PI / 2; H.position.y = 5.28; P.add(H);
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 13, 16), WHITE); tw.position.set(0, 11.5, -5.5); P.add(tw);
    const sau = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 1.6, 1.6, 24), GLASS); sau.position.set(0, 18.6, -5.5); P.add(sau);
    const sr = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.1, 4, 48), neon(b.col)); sr.rotation.x = Math.PI / 2; sr.position.set(0, 19.4, -5.5); P.add(sr);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 9), WHITE); ramp.position.set(0, 2.45, 9.6); ramp.rotation.x = rad(29); P.add(ramp);
    const DN = low ? 3 : 7, drones = [];
    for (let i = 0; i < DN; i++) { const d = new THREE.Group(); const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.7), DARK); d.add(c); for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 12), neon(b.col, 0.7)); r.position.set(sx * 0.45, 0.12, sz * 0.45); d.add(r); } const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), neon(0xff4d6d)); l.position.y = -0.14; d.add(l); P.add(d); drones.push([d, i / DN, 6 + (i % 3) * 2.5, 8 + (i % 4) * 1.6, i % 2 ? 1 : -1]); }
    spins.push((dt, t) => { for (const [d, ph, r, y, s] of drones) { const a = (t * 0.35 * s + ph * Math.PI * 2); d.position.set(Math.cos(a) * r, y + Math.sin(t * 2 + ph * 9) * 0.4, Math.sin(a) * r); d.rotation.y = -a; } });
    o.userData.board = board(o, T(b.name), T(b.sub), b.css, 23.5); door(o, b, b.fp / 2 + 1.6); body(o, Math.min(11, b.fp / 2 - 0.6)); }
  // Vault Tower: a hexagonal glass prism with gold bands, a gold crown with turning rings, a beam
  { const b = BUILDINGS[2], o = spot(b), P = o.userData.p, H = 36;
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.8, 2, 6), WHITE); pod.position.y = 1; P.add(pod);
    const sh = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(4.6, 5.6, H, 6, 1, true), 2.4, H / 51), towerM); sh.position.y = 2 + H / 2; P.add(sh);
    for (let y = 6; y < H; y += 6) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(5.7 - (y / H) * 1.05, 5.75 - (y / H) * 1.05, 0.5, 6), GOLD); ring.position.y = 2 + y; P.add(ring); }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 4.7, 4, 6), GOLD); crown.position.y = H + 4; P.add(crown);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.8), std(0xffe08a, { emissive: 0xffb02e, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.15 })); gem.position.y = H + 8.2; P.add(gem);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 6, 64), neon(b.col)), r2 = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.1, 6, 64), neon(0xeef4fb)); r1.position.y = r2.position.y = H + 8.2; P.add(r1, r2);
    spins.push((dt, t) => { gem.rotation.y = t * 1.1; r1.rotation.set(t * 0.7, t * 0.4, 0); r2.rotation.set(-t * 0.5, 0, t * 0.8); });
    const beam = K.makeBeacon ? K.makeBeacon(b.col, 60) : null; if (beam) { beam.position.y = H + 8; P.add(beam); spins.push(beam.userData.spin); }
    o.userData.board = board(o, T(b.name), T(b.sub), b.css, 14); door(o, b, b.fp / 2 + 1.6); body(o, Math.min(11, b.fp / 2 - 0.6)); }
  // Agent Academy: terraces stacked and turned, white with glass bands and lit edges, a lantern of light on top
  { const b = BUILDINGS[3], o = spot(b), P = o.userData.p;
    const em = neon(b.col);
    [[16, 4], [13, 4], [10, 4], [7, 4]].forEach(([w, h], i) => { const y = i * 4.4, tier = new THREE.Group(); tier.position.y = y; tier.rotation.y = rad(i * 14); P.add(tier);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, w), WHITE); slab.position.y = 0.35; tier.add(slab);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(w - 1.4, h - 0.7, w - 1.4), GLASS); gl.position.y = 0.7 + (h - 0.7) / 2; tier.add(gl);
      const ed = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.7, w)), new THREE.LineBasicMaterial({ color: b.col, toneMapped: false })); ed.position.y = 0.35; tier.add(ed); });
    const top = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 5), WHITE); top.position.y = 18; top.rotation.y = rad(56); P.add(top);
    const lan = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), em); lan.position.y = 21; P.add(lan);
    const lr = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 4, 48), neon(0xeef4fb)); lr.position.y = 21; P.add(lr);
    spins.push((dt, t) => { lan.rotation.set(t * 0.6, t * 0.9, 0); lr.rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, t * 0.5, 0); });
    o.userData.board = board(o, T(b.name), T(b.sub), b.css, 26); door(o, b, b.fp / 2 + 1.6); body(o, Math.min(11, b.fp / 2 - 0.6)); }
  // Agent Arena: a white bowl with lit rims and a ring of screens turning over it
  { const b = BUILDINGS[4], o = spot(b), P = o.userData.p;
    const prof = [[7, 0], [10.6, 0], [11, 1.2], [11.2, 6.5], [10.2, 7.2], [8.6, 3.6], [7.4, 2.6]].map(([x, y]) => new THREE.Vector2(x, y));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), std(0xeef4fb, { roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })); P.add(bowl);
    for (const [r, y] of [[11.25, 6.6], [10.65, 0.9]]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 4, 96), neon(b.col)); rim.rotation.x = Math.PI / 2; rim.position.y = y; P.add(rim); }
    const field = new THREE.Mesh(new THREE.CircleGeometry(7.2, 48), neon(0x3a1030, 0.9)); field.rotation.x = -Math.PI / 2; field.position.y = 0.08; P.add(field);
    const fr = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.6, 48), neon(b.col, 0.8)); fr.rotation.x = -Math.PI / 2; fr.position.y = 0.1; P.add(fr);
    const sc = new THREE.Group(); sc.position.y = 12; P.add(sc);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2, p = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), neon(i % 2 ? 0xff6fae : 0x5fd3ff, 0.55)); p.material.side = THREE.DoubleSide; p.material.blending = THREE.AdditiveBlending; p.position.set(Math.sin(a) * 3, 0, Math.cos(a) * 3); p.rotation.y = a; sc.add(p); }
    spins.push((dt, t) => { sc.rotation.y = t * 0.4; fr.scale.setScalar(1 + Math.sin(t * 2) * 0.08); });
    o.userData.board = board(o, T(b.name), T(b.sub), b.css, 18.5, 13); door(o, b, b.fp / 2 + 1.6); body(o, Math.min(11, b.fp / 2 - 0.6)); }
  // (ARCIRCLE Studio stood here at 90°; it moved to the town's plaza on 2026-10-26 — world-studiohub.js)

  // ---------------- the NEXUS CORE in the plaza ----------------
  const core = new THREE.Group(); core.name = "adc-core"; g.add(core); core.userData.radius = 4.2; solids.push(core);
  { const c = new THREE.Group(); c.name = "stand-in"; core.add(c); core.userData.p = c;
    [[5.6, 6, 0.6], [4.4, 4.8, 1.4], [3.2, 3.6, 2.1]].forEach(([r0, r1, y]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 0.7, 48), WHITE); m.position.y = y - 0.35; c.add(m); });
    const lr = new THREE.Mesh(new THREE.TorusGeometry(5.65, 0.08, 4, 96), neon(0x5fd3ff)); lr.rotation.x = Math.PI / 2; lr.position.y = 0.62; c.add(lr);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.1, 24, 6), WHITE); sp.position.y = 14; c.add(sp);
    const seam = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 2.16, 24, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fd3ff, wireframe: true, toneMapped: false, transparent: true, opacity: 0.6 })); seam.position.y = 14; c.add(seam);
    const rings = [[4.2, 0x5fd3ff, 10], [5.6, 0x7cf5c8, 15], [7, 0xb48cff, 20]].map(([r, col, y]) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.14, 6, 96), neon(col)); m.position.y = y; c.add(m); return m; });
    // the ∞ over it: a tube along a figure of eight, its colour running round
    class Lem extends THREE.Curve { getPoint(u, v = new THREE.Vector3()) { const a = u * Math.PI * 2, d = 1 + Math.sin(a) ** 2; return v.set((3.4 * Math.cos(a)) / d, (3.4 * Math.sin(a) * Math.cos(a)) / d, 0); } }
    const inf = new THREE.Mesh(new THREE.TubeGeometry(new Lem(), 160, 0.36, 10, true), std(0x7fe9ff, { emissive: 0x2fb8ff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.3 })); inf.position.y = 29.5; c.add(inf);
    // the ticker band round the spire's foot
    const tick = canvasTex(2048, 96, (x, w, h) => { x.fillStyle = "rgba(4,12,28,.85)"; x.fillRect(0, 0, w, h); x.fillStyle = "#9fe6ff"; x.font = "800 56px Sora, 'Segoe UI', sans-serif"; x.textBaseline = "middle"; const s = "AGENT DIMENSION  ·  NEXUS CITY  ·  AURORA  ·  ORION  ·  VEX  ·  ∞  ·  "; let px = 10; while (px < w) { x.fillText(s, px, h / 2); px += x.measureText(s).width; } });
    let band = null; if (tick) { tick.wrapS = THREE.RepeatWrapping; band = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1.1, 48, 1, true), new THREE.MeshBasicMaterial({ map: tick, toneMapped: false, side: THREE.DoubleSide })); band.position.y = 4.4; c.add(band); }
    const MN = low ? 0 : 60, mp = new Float32Array(MN * 3), mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0x9fe6ff, size: 0.3, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); motes.frustumCulled = false; if (MN) c.add(motes);
    spins.push((dt, t) => {
      rings[0].rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.35, t * 0.6, 0); rings[1].rotation.set(Math.PI / 2 + Math.cos(t * 0.4) * 0.45, -t * 0.4, 0); rings[2].rotation.set(Math.PI / 2 + Math.sin(t * 0.3 + 1) * 0.25, t * 0.25, 0);
      inf.rotation.y = t * 0.5; inf.position.y = 29.5 + Math.sin(t * 1.2) * 0.5; inf.material.emissive.setHSL(0.53 + Math.sin(t * 0.6) * 0.06, 1, 0.5);
      if (band) tick.offset.x = (t * 0.03) % 1;
      for (let i = 0; i < MN; i++) { const k = (t * 0.12 + i / MN) % 1, a = i * 2.399 + t * 0.4, r = 2.6 + (i % 5) * 0.5; mp[i * 3] = Math.cos(a) * r; mp[i * 3 + 1] = 1 + k * 26; mp[i * 3 + 2] = Math.sin(a) * r; }
      if (MN) mg.attributes.position.needsUpdate = true;
    });
    core.userData.board = board(core, "NEXUS CITY", T("AGENT DIMENSION"), "#5fd3ff", 35, 16); }

  // ---------------- the maglev ring: a raised track on pillars, two trains of three cars ----------------
  const mag = new THREE.Group(); mag.name = "stand-in-track"; g.add(mag); let trainY = 9.5 + 1.35, trainR = 24;
  { const R = 24, Y = 9.5;
    const track = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 160), WHITE); track.rotation.x = Math.PI / 2; track.position.y = Y; mag.add(track);
    const under = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 4, 160), neon(0x5fd3ff)); under.rotation.x = Math.PI / 2; under.position.y = Y - 0.5; mag.add(under);
    for (let a = 22.5; a < 360; a += 45) { /* (between the avenues and the buildings' doors) */ const [x, z] = polar(a, R), p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, Y, 10), WHITE); p.position.set(x, Y / 2, z); mag.add(p); }
    const carG = new THREE.CapsuleGeometry(0.95, 3.4, 6, 14); carG.rotateZ(Math.PI / 2);
    const winG = new THREE.BoxGeometry(4.2, 0.36, 2.02), winM = neon(0x9fe6ff);
    const trains = [0, 1].map((k) => { const cars = [0, 1, 2].map(() => { const c = new THREE.Group(); const b = new THREE.Mesh(carG, WHITE); c.add(b); const w = new THREE.Mesh(winG, winM); w.position.y = 0.25; c.add(w); g.add(c); return c; }); return { cars, ph: k * Math.PI, s: k ? -0.16 : 0.13 }; });
    spins.push((dt, t) => { for (const tr of trains) tr.cars.forEach((c, i) => { const a = tr.ph + t * tr.s - i * 0.17 * Math.sign(tr.s); c.position.set(Math.sin(a) * trainR, trainY, Math.cos(a) * trainR); c.rotation.y = a + (tr.s > 0 ? 0 : Math.PI); }); }); }

  // ---------------- flying pods on loops over the city ----------------
  const pods = [];
  { const PN = low ? 5 : 14, podG = new THREE.CapsuleGeometry(0.45, 1.3, 4, 10); podG.rotateX(Math.PI / 2);
    const cols = [0x5fd3ff, 0x7cf5c8, 0xb48cff, 0xffc861, 0xff6fae];
    for (let i = 0; i < PN; i++) { const p = new THREE.Group(); p.add(new THREE.Mesh(podG, WHITE)); const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), neon(cols[i % 5])); glow.position.z = -0.95; p.add(glow);
      if (!low) { const tg = new THREE.PlaneGeometry(0.3, 4.5); tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -3.2); const tr = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: cols[i % 5], transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); p.add(tr); }
      g.add(p); pods.push([p, 36 + rnd() * 44, 15 + rnd() * 22, (0.05 + rnd() * 0.06) * (i % 2 ? 1 : -1), rnd() * 6, 0.7 + rnd() * 0.5]); }
    const v = new THREE.Vector3();
    spins.push((dt, t) => { for (const [p, r, y, s, ph, e] of pods) { const a = ph + t * s; p.position.set(Math.sin(a) * r, y + Math.sin(t * 0.7 + ph) * 1.5, Math.cos(a) * r * e); v.set(Math.sin(a + 0.02 * Math.sign(s)) * r, p.position.y, Math.cos(a + 0.02 * Math.sign(s)) * r * e); p.lookAt(v.add(g.position).add(planet.position)); } }); }

  // ---------------- lamps along the avenues and holo billboards ----------------
  { const poles = [];
    for (const a of [0, 90, 180, 270]) for (let r = 32; r < land.r - 4; r += 11) for (const s of [-1, 1]) { const [x, z] = polar(a, r), [ox, oz] = polar(a + 90, s * 5.1); poles.push([x + ox, z + oz]); }
    const PG = new THREE.CylinderGeometry(0.07, 0.12, 4.6, 6), HG = new THREE.BoxGeometry(0.22, 0.16, 1.5);
    const pm = new THREE.InstancedMesh(PG, STEEL, poles.length), hm = new THREE.InstancedMesh(HG, neon(0xbff2ff), poles.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    poles.forEach(([x, z], i) => { mt.makeTranslation(x, 2.3, z); pm.setMatrixAt(i, mt); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(x, z)); mt.compose(new THREE.Vector3(x, 4.65, z), q, one); hm.setMatrixAt(i, mt); });
    g.add(pm, hm); }
  { const ld = new THREE.TextureLoader();
    [["aurora", 30, 25], ["orion", 150, 25], ["vex", 330, 25], ["orion", 210, 25]].forEach(([k, a, r], i) => {
      const [x, z] = polar(a, r + 9), h = new THREE.Group(); h.position.set(x, 0, z); h.rotation.y = Math.atan2(-x, -z); g.add(h);
      const pyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 5, 8), STEEL); pyl.position.y = 2.5; h.add(pyl);
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), neon(K.AGENTS && K.AGENTS[k] ? K.AGENTS[k].color : 0x5fd3ff, 0.15)); fr.material.side = THREE.DoubleSide; fr.position.y = 7.4; h.add(fr);
      const tx = ld.load(`/images/agents/${k}-400.webp${ver}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); pl.position.set(0, 7.4, 0.02); h.add(pl);
      spins.push((dt, t) => { pl.material.opacity = 0.8 + Math.sin(t * 6 + i) * 0.06 + (Math.sin(t * 19 + i * 3) > 0.985 ? -0.5 : 0); });
    }); }

  // ---------------- the sky past the skyline: the owner's panorama (floating isles, two moons) round the city ----------------
  { const tx = new THREE.TextureLoader().load(`/images/adcity/sky.webp${ver}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; }); tx.wrapS = THREE.RepeatWrapping; tx.repeat.set(3, 1); // (three times round)
    const R = 520, H = ((Math.PI * 2 * R) / 3) * (778 / 2048), cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide, fog: false, depthWrite: false }));
    cyl.position.y = H / 2 - 70; cyl.renderOrder = -5; cyl.name = "adc-sky"; cyl.frustumCulled = false; g.add(cyl); }

  // ---------------- AD-City 2: the work stations and the agents at work ----------------
  const stG = {};
  for (const [job, S] of Object.entries(STATIONS)) {
    const [x, z] = polar(S.a, S.r), o = new THREE.Group(); o.name = "adc-station:" + job; o.position.set(x, 0, z); o.rotation.y = Math.atan2(-x, -z); g.add(o); stG[job] = o;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.8, 0.22, 48), std(0x182a44, { metalness: 0.6, roughness: 0.3, emissive: S.col, emissiveIntensity: 0.12 })); pad.position.y = 0.11; o.add(pad);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.08, 4, 96), neon(S.col)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.24; o.add(rim);
    const ringIn = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 48), neon(S.col, 0.7)); ringIn.rotation.x = -Math.PI / 2; ringIn.position.y = 0.25; o.add(ringIn);
    // what's worked on in the middle: plant pods (gather), ore crystals over a crucible (mine), a holo map with a drone (scout)
    const mid = new THREE.Group(); mid.position.y = 0.25; o.add(mid);
    if (job === "gather") for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, pod = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.2, 12), std(0xdff7ee, { roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.6 })), leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), neon(0x39ff88)); pod.position.set(Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9); leaf.position.set(Math.cos(a) * 0.9, 0.75, Math.sin(a) * 0.9); mid.add(pod, leaf); spins.push((dt, t) => { leaf.scale.setScalar(0.8 + Math.sin(t * 2 + i) * 0.25); }); }
    if (job === "mine") { const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 0.8, 16), STEEL); cr.position.y = 0.4; mid.add(cr); for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + (i % 2) * 0.15), std(0xffd27a, { emissive: 0xffa21a, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.4 })), a = (i / 4) * Math.PI * 2; mid.add(c); spins.push((dt, t) => { c.position.set(Math.cos(a + t * 0.8) * 0.7, 1.6 + Math.sin(t * 1.6 + i) * 0.25, Math.sin(a + t * 0.8) * 0.7); c.rotation.y = t * 2; }); } }
    if (job === "scout") { const tb = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.5, 0.9, 20), WHITE); tb.position.y = 0.45; mid.add(tb); const map = new THREE.Mesh(new THREE.CircleGeometry(1.05, 32), new THREE.MeshBasicMaterial({ color: S.col, wireframe: true, transparent: true, opacity: 0.6, toneMapped: false })); map.rotation.x = -Math.PI / 2; map.position.y = 1.15; mid.add(map); const dr = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), DARK); mid.add(dr); spins.push((dt, t) => { map.rotation.z = t * 0.5; dr.position.set(Math.cos(t) * 0.8, 2.1 + Math.sin(t * 3) * 0.1, Math.sin(t) * 0.8); }); }
    board(o, T(S.name), T(S.job), S.css, 6.4, 7.5);
    // the work, seen: motes rising into the pods (gather), sparks off the crucible (mine), a scan ring sweeping out (scout)
    if (!low) { const N = 40, pos = new Float32Array(N * 3), seed = Array.from({ length: N }, (_, i) => [(i * 2.399) % 6.283, ((i * 0.618) % 1), 0.6 + ((i * 0.37) % 1) * 2.4]);
      const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: S.col, size: job === "mine" ? 0.16 : 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); pts.frustumCulled = false; o.add(pts);
      spins.push((dt, t) => { for (let i = 0; i < N; i++) { const [a, o0, r] = seed[i], k = (t * (job === "mine" ? 0.9 : 0.35) + o0) % 1;
        if (job === "gather") { const rr = r * (1 - k); pos.set([Math.cos(a + t * 0.6) * rr, 0.3 + k * 1.6, Math.sin(a + t * 0.6) * rr], i * 3); }
        else if (job === "mine") { const sp = 1.2 + r; pos.set([Math.cos(a) * sp * k, 1.4 + k * 1.2 - k * k * 2.6, Math.sin(a) * sp * k], i * 3); }
        else { const rr = 0.8 + k * 4.6; pos.set([Math.cos(a) * rr, 0.35, Math.sin(a) * rr], i * 3); } }
        pg.attributes.position.needsUpdate = true; }); }
    if (job === "scout") { const sweep = new THREE.Mesh(new THREE.RingGeometry(0.2, 5.3, 48, 1, 0, 0.6), new THREE.MeshBasicMaterial({ color: S.col, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); sweep.rotation.x = -Math.PI / 2; sweep.position.y = 0.27; o.add(sweep); spins.push((dt, t) => { sweep.rotation.z = -t * 1.6; }); }
    const sol = new THREE.Group(); sol.userData.radius = 1.6; o.add(sol); solids.push(sol);
  }
  // the job board by the way in: how many are working now and how many errands came back today
  let jbTex = null, jbBoard = null;
  { const [x, z] = polar(340, 38), o = new THREE.Group(); o.name = "adc-jobboard"; o.position.set(x, 0, z); o.rotation.y = Math.atan2(-x, -z); g.add(o);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), STEEL); post.position.y = 1.7; o.add(post);
    if (typeof document !== "undefined") { const cv = document.createElement("canvas"); cv.width = 768; cv.height = 384; jbTex = new THREE.CanvasTexture(cv); jbTex.colorSpace = THREE.SRGBColorSpace; jbTex.userData = { cv };
      jbBoard = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshBasicMaterial({ map: jbTex, transparent: true, side: THREE.DoubleSide, toneMapped: false })); jbBoard.position.y = 4.4; o.add(jbBoard); }
  }
  function paintBoard(n, today) {
    if (!jbTex) return; const x = jbTex.userData.cv.getContext("2d"), w = 768, h = 384;
    x.clearRect(0, 0, w, h); x.beginPath(); if (x.roundRect) x.roundRect(6, 6, w - 12, h - 12, 36); else x.rect(6, 6, w - 12, h - 12); x.fillStyle = "rgba(4,14,30,.9)"; x.fill(); x.lineWidth = 6; x.strokeStyle = "#7cf5c8"; x.stroke();
    x.textAlign = "center"; x.fillStyle = "#7cf5c8"; x.font = "900 44px Sora, 'Segoe UI', sans-serif"; x.fillText("📋 " + T("Job board"), w / 2, 76);
    x.fillStyle = "#fff"; x.font = "900 96px Sora, 'Segoe UI', sans-serif"; x.fillText(String(n), w * 0.28, 210); x.fillText(String(today), w * 0.72, 210);
    x.fillStyle = "#cfe0f5"; x.font = "800 34px Sora, 'Segoe UI', sans-serif"; x.fillText(T("working now"), w * 0.28, 268, 330); x.fillText(T("errands back today"), w * 0.72, 268, 330);
    x.fillStyle = "#9fb4c8"; x.font = "700 26px Sora, 'Segoe UI', sans-serif"; x.fillText(T("Line up errands in your agent's window"), w / 2, 336, 700);
    jbTex.needsUpdate = true;
  }
  paintBoard(0, 0);
  // the workers: a body for each agent at work (at most WMAX; the crew when nobody is), kept by a key so a poll moves nobody
  const WMAX = low ? 6 : 12, workers = new Map(); let workAt = 0, workBusy = false, list = [], polls = 0;
  const left = (ms) => { const m = Math.max(1, Math.ceil(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  async function bodyFor(kind) { try { return await K.makeAgent(kind, ver); } catch (e) { console.warn("nexus city worker", kind, e); return null; } }
  function spotOf(job, i) { const o = stG[job], a = (i / 6) * Math.PI * 2 + 0.5, v = new THREE.Vector3(Math.sin(a) * 3.3, 0.24, Math.cos(a) * 3.3); return { o, v, face: Math.atan2(-v.x, -v.z) }; }
  async function placeWorkers() {
    const now = Date.now(), mine = me(), want = list.length ? list.slice(0, WMAX) : CREW.map(([kind, job]) => ({ key: "crew-" + kind, kind, job, crew: true }));
    const keys = new Set(want.map((w) => w.key || w.id || w.name));
    for (const [k, w] of workers) if (!keys.has(k)) { w.o.parent && w.o.parent.remove(w.o); workers.delete(k); }
    const per = { gather: 0, mine: 0, scout: 0 };
    for (const w of want) {
      const job = STATIONS[w.job] ? w.job : "gather", k = w.key || w.id || w.name, i = per[job]++; if (i >= 6) continue;
      let cur = workers.get(k);
      if (!cur) { const b = await bodyFor(w.kind); if (!b || !shown) continue; const o = new THREE.Group(); o.add(b.obj); cur = { o, b, job: "", tag: null, text: "" }; workers.set(k, cur); }
      if (cur.job !== job) { const sp = spotOf(job, i); sp.o.add(cur.o); cur.o.position.copy(sp.v); cur.o.rotation.y = sp.face + Math.PI; cur.job = job; try { cur.b.play(STATIONS[job].clip); } catch { /* no clip */ } }
      const you = mine && w.id && w.id === mine, text = w.crew ? `${T("City crew")} · ${T(STATIONS[job].job)}` : `${you ? "⭐ " : ""}@${w.id || w.name} · ${T(STATIONS[job].job)} · ${w.end > now ? left(w.end - now) : T("Back!")}`;
      if (text !== cur.text) { if (cur.tag) { cur.o.remove(cur.tag); cur.tag.material.map && cur.tag.material.map.dispose(); cur.tag.material.dispose(); } cur.tag = K.label(text, { accent: you ? "#ffc861" : STATIONS[job].css, size: 0.42 }); cur.tag.position.y = 2.75; cur.o.add(cur.tag); cur.text = text; }
    }
  }
  async function pollWork(force) {
    if (workBusy || (!force && Date.now() - workAt < 30e3)) return; workBusy = true; workAt = Date.now(); polls++;
    try {
      if (demo) list = [["aurora", "gather", "nova_a"], ["orion", "mine", "atlas_o"], ["vex", "scout", "shade_v"], ["aurora", "scout", "lumi_a"], ["orion", "gather", "orbit"], ["vex", "mine", "nyx_01"]].map(([kind, job, id], i) => ({ id, name: id, kind, job, start: Date.now() - 6e5 * (i + 1), end: Date.now() + 6e5 * (6 - i) }));
      else { const r = await fetch("/api/social?world=agent-city", { cache: "no-store" }); if (r.ok) { const j = await r.json(); list = (j.work || []).filter((w) => w.end > Date.now() - 6e5); paintBoard(list.filter((w) => w.end > Date.now()).length, j.today || 0); } }
      if (demo) paintBoard(list.length, 14);
      await placeWorkers();
    } catch (e) { console.warn("nexus city work", e); }
    workBusy = false;
  }
  const wv = new THREE.Vector3();
  let wf = 0; // (past 70 m a worker's clip steps every 6th frame, the time added up)
  let replay = 0; // (an agent's work clips are borrowed after it's made: its job's clip is asked for again every 2 s, a no-op once it plays)
  spins.push((dt, t) => { pollWork(false); wf = (wf + 1) % 6; const again = (replay -= dt) <= 0; if (again) replay = 2; for (const w of workers.values()) { if (!w.o.parent) continue; if (again && w.job && !w.b.busy()) try { w.b.play(STATIONS[w.job].clip); } catch { /* no clip */ } w.acc = (w.acc || 0) + dt; w.o.getWorldPosition(wv); if (wv.lengthSq() < 70 * 70 || wf === 0) { w.b.update(w.acc, t); w.acc = 0; } } });

  // AD-City 4: other players' agents at their side in the city (their presence carries ag "kind:name"); each follows its
  // player, walking or sprinting to keep up (CU_AS clips), a name tag over it
  const OMAX = low ? 4 : 8, others = new Map(), AGC = { aurora: "#5fd3ff", orion: "#ffc861", vex: "#b48cff" };
  async function setOthers(arr) {
    const want = shown ? arr.filter((x) => x && x.key && AGC[x.kind]).slice(0, OMAX) : [], keep = new Set(want.map((x) => x.key));
    for (const [k, o] of others) if (!keep.has(k)) { if (o && o.o.parent) o.o.parent.remove(o.o); others.delete(k); }
    for (const x of want) {
      const lx = x.x - land.x, lz = x.z - land.z; let o = others.get(x.key);
      if (o === null) continue; // (its body is loading)
      if (!o) { others.set(x.key, null); const b = await bodyFor(x.kind); if (!b || !shown || !others.has(x.key)) { others.delete(x.key); continue; }
        const w = new THREE.Group(); w.name = "adc-other"; w.add(b.obj); const tag = K.label("🤖 " + (x.name || x.kind.toUpperCase()), { accent: AGC[x.kind], size: 0.4 }); tag.position.y = 2.5; w.add(tag);
        w.position.set(lx + 1.4, 0, lz + 1.4); g.add(w); o = { o: w, b, clip: "", tx: lx, tz: lz }; others.set(x.key, o); }
      o.tx = lx; o.tz = lz;
    }
  }
  spins.push((dt, t) => { for (const o of others.values()) { if (!o) continue; const p = o.o.position, dx = o.tx - p.x, dz = o.tz - p.z, d = Math.hypot(dx, dz);
    let sp = 0; if (d > 30) { p.set(o.tx + 1.4, 0, o.tz + 1.4); } else if (d > 1.8) { sp = Math.min(9, 2 + (d - 1.8) * 2.2); const k = Math.min(1, (sp * dt) / d); p.x += dx * k; p.z += dz * k; o.o.rotation.y = Math.atan2(dx, dz); }
    const want = sp > 6 ? "sprint" : sp > 0.4 ? "walk" : "idle"; if (want !== o.clip && !o.b.busy()) { try { o.b.play(want, want === "idle" ? {} : { speed: Math.max(0.8, sp / 6.5) }); } catch { /* no clip */ } o.clip = want; }
    o.b.update(dt, t); } });

  // ---------------- the way back: a portal on the south avenue ----------------
  const back = K.makePortal(T("Back to town")); back.name = "adc-back"; back.userData.radius = 1.6; back.userData.to = "town"; spins.push(...(back.userData.spin || []));
  back.position.set(10, 0, land.r - 14); back.rotation.y = -0.5; /* (beside the way in, not behind your camera) */ g.add(back);
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.18, 40), std(0x14203a, { metalness: 0.5, roughness: 0.35, emissive: 0x5fd3ff, emissiveIntensity: 0.25 })); base.position.y = 0.09; back.add(base); }

  // ---------------- the owner's models, in place of the stand-ins ----------------
  const occ = [core, ...Object.values(bld)]; // (what the town's camera fades when it stands between the camera and you: world-play.js camCollide)
  const base = "/models/world/adcity/", loaded = {}, ringMats = new Set(), spireMats = new Set(); let ringTop = 0, ringK = 1, spireK = 1;
  /// AD-City 1.5: the raised ring goes see-through while the camera is under it or inside its deck (it filled the screen)
  const cv = new THREE.Vector3();
  function seeThrough(camWorld, dt) {
    if (!ringMats.size && !spireMats.size) return; cv.copy(camWorld).sub(g.position).sub(planet.position);
    const px = -(g.position.x + planet.position.x), pz = -(g.position.z + planet.position.z), pr = Math.hypot(px, pz); // (you stand at the world's origin: the planet moves)
    const r = Math.hypot(cv.x, cv.z), want = pr < 34 || (r > 15 && r < 32 && cv.y < ringTop + 2) ? 0.22 : 1, wantS = 1; // (near or inside the ring, or the camera in it: see-through) // (the core's spire too: the camera behind you went inside it)
    const ease = (k, w, set) => { if (Math.abs(k - w) < 0.01) return k; k += (w - k) * Math.min(1, dt * 6); if (Math.abs(k - w) < 0.02) k = w; for (const m of set) { m.opacity = k; m.depthWrite = k > 0.95; } return k; };
    ringK = ease(ringK, want, ringMats); spireK = ease(spireK, wantS, spireMats);
  }
  function fit(o, fp, opt = {}) { // scale a model to fp metres across (its larger side), on the ground, centred; opt.flat: its height squashed to that
    const box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = fp / (Math.max(sz.x, sz.z) || 1), ky = opt.flat ? opt.flat / (sz.y || 1) : k;
    o.scale.set(k, ky, k); o.position.set(-(box.min.x + sz.x / 2) * k, -box.min.y * ky + (opt.y || 0), -(box.min.z + sz.z / 2) * k);
    const w = new THREE.Group(); w.add(o); return { w, h: sz.y * ky, k, box, sz };
  }
  const prep = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = !low; if (m.material && m.material.emissiveMap) m.material.emissiveIntensity = Math.max(m.material.emissiveIntensity || 1, 1.2); } }); return o; };
  function load(name) { if (loaded[name]) return loaded[name]; return (loaded[name] = new Promise((ok, no) => { try { K.gltfLoader().load(base + name + ".glb" + ver, (gl) => ok(prep(gl.scene)), undefined, no); } catch (e) { no(e); } })); }
  const done = () => { if (onModel) try { onModel(); } catch { /* fine */ } };
  let started = false;
  function loadModels() {
    if (started || !K.gltfLoader) return; started = true;
    // the buildings, nearest the way in first
    BUILDINGS.slice().sort((p, q) => Math.abs(((p.a + 180) % 360) - 180) - Math.abs(((q.a + 180) % 360) - 180)).forEach((b) => load(b.glb).then((sc) => {
      const o = bld[b.id], f = fit(sc, b.fp); o.add(f.w); o.userData.p.visible = false; o.userData.model = f.w;
      if (o.userData.board) o.userData.board.position.y = f.h + 3.2; done();
    }).catch((e) => console.warn("nexus city model", b.glb, e)));
    // the flying pods become the owner's Neon Skyblade (its nose is −x: turned to +z, the way lookAt points it)
    load(MODELS.sky).then((sc) => { const box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), k = 4.2 / (Math.max(sz.x, sz.z) || 1);
      pods.forEach(([p], i) => { const o = i ? sc.clone() : sc, w = new THREE.Group(); o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, -(box.min.y + sz.y / 2) * k, -(box.min.z + sz.z / 2) * k); w.add(o); w.rotation.y = Math.PI / 2; p.children[0].visible = false; p.children.slice(1).forEach((c) => { c.position.z -= 1.3; }); p.add(w); });
      done(); }).catch((e) => console.warn("nexus city skyblade", e));
    load(MODELS.spire).then((sc) => { const f = fit(sc, 26); /* (the town camera's ghosting fades it when it's in the way) */ core.add(f.w); core.userData.p.visible = false; core.userData.radius = 11; if (core.userData.board) core.userData.board.position.y = f.h + 4; done(); }).catch((e) => console.warn("nexus city spire", e));
    // the raised ring: four quarter curves (each one's arc centred on its corner at +x, −z), over the ring road
    load(MODELS.curve).then((sc) => {
      const box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), k = 28 / (sz.x || 1); /* (its outer edge at 28 m: right over the ring road, 20–28 m) */
      sc.traverse((m) => { if (m.isMesh && m.material) [].concat(m.material).forEach((mm) => { mm.transparent = true; ringMats.add(mm); }); });
      ringTop = sz.y * k * 2.1;
      for (let q = 0; q < 4; q++) { const o = q ? sc.clone() : sc, w = new THREE.Group(); o.scale.set(k, k * 2.1, k); o.position.set(-box.max.x * k, -box.min.y * k * 2.1, -box.min.z * k); /* (twice as tall: its deck over the camera, not in front of it) */ w.add(o); w.rotation.y = (q * Math.PI) / 2; g.add(w); occ.push(w); }
      mag.visible = false; trainY = sz.y * k * 2.1 * 0.78 + 0.9; trainR = 28 * 0.84; done();
    }).catch((e) => console.warn("nexus city curve", e));
    // the avenues paved with the highway (three pieces each, laid flat) and a crossroads where each meets the ring road
    if (!low) load(MODELS.highway).then((sc) => {
      const box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), len = (land.r - 17) / 3, kx = len / (sz.x || 1), kz = 8.6 / (sz.z || 1), ky = 0.14 / (sz.y || 1);
      let n = 0; for (const a of [0, 90, 180, 270]) for (let i = 0; i < 3; i++) { const o = n++ ? sc.clone() : sc, w = new THREE.Group(); o.scale.set(kx, ky, kz); o.position.set(-(box.min.x + sz.x / 2) * kx, 0.035 - box.min.y * ky, -(box.min.z + sz.z / 2) * kz); w.add(o); const [x, z] = polar(a, 17 + len * (i + 0.5)); w.position.set(x, 0, z); w.rotation.y = rad(a) + Math.PI / 2; g.add(w); }
      done();
    }).catch((e) => console.warn("nexus city highway", e));
    if (false) load(MODELS.cross).then((sc) => { // (the crossroads is kept in models/world/adcity for a road at ground level; not laid now)
      const box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new THREE.Vector3()), k = 11 / (Math.max(sz.x, sz.z) || 1), ky = 0.16 / (sz.y || 1);
      [0, 90, 180, 270].forEach((a, i) => { const o = i ? sc.clone() : sc, w = new THREE.Group(); o.scale.set(k, ky, k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.04 - box.min.y * ky, -(box.min.z + sz.z / 2) * k); w.add(o); const [x, z] = polar(a, 24); w.position.set(x, 0, z); w.rotation.y = rad(a); g.add(w); });
      done();
    }).catch((e) => console.warn("nexus city crossroads", e));
  }

  let shown = false;
  return {
    group: g, doors, back, solids, spins, buildings: bld, loadModels, seeThrough,
    occluders: () => occ,
    seeK: () => ({ ring: ringK, spire: spireK, mats: ringMats.size + "/" + spireMats.size, cam: [+cv.x.toFixed(1), +cv.y.toFixed(1), +cv.z.toFixed(1)] }),
    /// where to stand in front of a building or a station (world coords) and what to face
    spotOf(id) { const b = BUILDINGS.find((x) => x.id === id), st0 = STATIONS[id]; const [a, r, d] = b ? [b.a, b.r, b.fp / 2 + 4] : st0 ? [st0.a, st0.r, 8] : [0, 0, 0]; if (!b && !st0) return null; const [x, z] = polar(a, r - d), [cx, cz] = polar(a, r); return { x: land.x + x, z: land.z + z, c: { x: land.x + cx, z: land.z + cz } }; },
    /// where you arrive (by the portal back, facing the core)
    arrival: () => ({ x: land.x, z: land.z + land.r - 24, c: { x: land.x, z: land.z } }),
    show(on) { on = !!on; if (on === shown) return; shown = on; g.visible = on; if (on) { loadModels(); pollWork(true); } else setOthers([]); },
    others: (arr) => setOthers(arr || []), othersNow: () => [...others.entries()].filter(([, o]) => o).map(([k, o]) => ({ k, clip: o.clip, clips: o.b.mixer && o.b.mixer._actions ? o.b.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x.getClip().name) : [] })),
    workers: () => [...workers.entries()].map(([k, w]) => ({ k, job: w.job, text: w.text, clips: w.b.mixer && w.b.mixer._actions ? w.b.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x.getClip().name) : [] })),
    stations: stG,
    models: () => Object.fromEntries(BUILDINGS.map((b) => [b.id, !!bld[b.id].userData.model]).concat([["spire", !core.userData.p || !core.userData.p.visible], ["ring", !mag.visible]])),
    shown: () => shown,
    tick(dt, t) { if (!shown) return; for (const f of spins) f(dt, t); },
  };
}

/// the card for a building still being built. ctx: { T, esc }
export function soonCard({ T, esc }, id, onClose) {
  const b = BUILDINGS.find((x) => x.id === id), s = SOON[id]; if (!b || !s || typeof document === "undefined") return null;
  const el = document.createElement("div"); el.className = "adc-card"; el.setAttribute("role", "dialog");
  el.innerHTML = `<div class="adc-in" style="--ac:${b.css}"><small>${esc(T("Nexus City"))}</small><h3><span aria-hidden="true">${s.icon}</span> ${esc(T(b.name))}</h3>
    <b class="adc-soon">🚧 ${esc(T("Being built"))}</b>${s.lines.map((l) => `<p>${esc(T(l))}</p>`).join("")}
    <button type="button" class="adc-ok">${esc(T("OK"))}</button></div>`;
  const close = () => { el.remove(); if (onClose) onClose(); };
  el.addEventListener("click", (e) => { if (e.target === el || e.target.closest(".adc-ok")) close(); });
  document.body.appendChild(el); setTimeout(() => { const b2 = el.querySelector(".adc-ok"); if (b2) b2.focus(); }, 30);
  return el;
}
