// world-zones-far.js — the props of the far ring (Lv 30–100), one scene a ground, each telling its scam:
//   ice    Ponzi Peaks          an ice pyramid with a gold founder on top, crystal clusters, snowy pines
//   dunes  Exit-Scam Desert      sandstone arches, exit doors to nowhere, empty chests half in the sand
//   reef   Phishing Reef         giant hooks with "log in" bait, coral, kelp that sways
//   toxic  Bot Farm Wastes       server racks with blinking lights and fans, smoking chimneys, cables
//   ruins  Fake Exchange Ruins   broken columns, a ticker board stuck on red, an open and empty vault
//   lava   Bridge Hack Abyss     a broken bridge over a lava river, obsidian spires, lava pools
//   void   The Last Rug          floating islands, flying rugs, a black hole over the middle
// Everything that never moves is merged afterwards (world-zones.js); what moves is marked keep.
import { windLook } from "./world-look.js";

let texCache = null;
function textures(THREE) {
  if (texCache) return texCache;
  const can = (w, h, f) => { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // a soft round puff (smoke) and a soft disc (the black hole's glow)
  const soft = can(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const disk = can(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.3, "rgba(255,210,250,1)"); gr.addColorStop(0.55, "rgba(255,77,210,.65)"); gr.addColorStop(1, "rgba(120,40,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); });
  // the ticker: red numbers that only go down
  const ticker = can(1024, 128, (g, w, h) => { g.fillStyle = "#08060c"; g.fillRect(0, 0, w, h); g.font = "800 54px monospace"; g.textBaseline = "middle"; const items = ["ARCX -99.8%", "RUGC -97.1%", "PONZ -88.4%", "SAFU -100%", "WDRL PAUSED", "MOON -93.0%"]; let x = 12; for (const s of items) { g.fillStyle = /PAUSED/.test(s) ? "#ffc861" : "#ff3b55"; g.fillText(s, x, h / 2); x += g.measureText(s).width + 48; } });
  ticker.wrapS = THREE.RepeatWrapping;
  // a rug: a red field, a gold border and a pattern
  const rug = can(128, 192, (g, w, h) => { g.fillStyle = "#8a1f3a"; g.fillRect(0, 0, w, h); g.strokeStyle = "#ffc861"; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.lineWidth = 4; g.strokeStyle = "#ff8fb0"; for (let i = 0; i < 4; i++) { const y = 40 + i * 36; g.beginPath(); g.moveTo(w / 2, y - 14); g.lineTo(w / 2 + 26, y); g.lineTo(w / 2, y + 14); g.lineTo(w / 2 - 26, y); g.closePath(); g.stroke(); } g.fillStyle = "#ffc861"; for (let x = 6; x < w; x += 12) { g.fillRect(x, 0, 4, 6); g.fillRect(x, h - 6, 4, 6); } });
  return (texCache = { soft, disk, ticker, rug });
}

/// add one far-ring ground's props to g (its group, at the ground's centre)
/// h: { THREE, K, zn, r (random), prop(mesh, x, z, ry), spot(minR), std(color, o), glowM(color, k), spins, low }
export function farProps(h) {
  const { THREE, K, zn, r, prop, spot, std, glowM, spins, low } = h;
  const tx = textures(THREE), g = h.g;
  const keep = (o) => { o.userData.keep = true; return o; };
  const box = (w, hh, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
  const cyl = (a, b, hh, m, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(a, b, hh, s), m);
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

  if (zn.deco === "ice") {
    const ice = std(0xcfeeff, { emissive: 0x5fc8ff, emissiveIntensity: 0.16, roughness: 0.12, metalness: 0.1, flatShading: true });
    // the pyramid: every tier pays the one above it, the founder shines on top
    { const [x, z] = spot(10); const py = new THREE.Group();
      for (let k = 0; k < 5; k++) { const s = 7.4 - k * 1.4; py.add(at(box(s, 1.1, s, ice), 0, 0.55 + k * 1.1, 0)); }
      const top = keep(new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), glowM(0xffc861, 2.4))); top.position.y = 6.5; py.add(top);
      spins.push((dt, t) => { top.rotation.y = t * 1.2; top.position.y = 6.5 + Math.sin(t * 1.6) * 0.18; });
      prop(py, x, z); }
    const crys = std(0xbff0ff, { emissive: 0x6fe0ff, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.2, flatShading: true });
    for (let i = 0; i < 9; i++) { const [x, z] = spot(4); const c = new THREE.Group(); const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), crys); const s = 1.4 + r() * 1.8; m.scale.set(0.55, s, 0.55); m.position.set((r() - 0.5) * 1.2, s * 0.42, (r() - 0.5) * 1.2); m.rotation.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7); c.add(m); }
      prop(c, x, z); }
    const trunk = std(0x4a3a2a), pine = std(0x2a5a5a), snow = std(0xf4fbff, { roughness: 0.6 });
    for (let i = 0; i < 12; i++) { const [x, z] = spot(3); const t = new THREE.Group(); const s = 0.8 + r() * 0.6; t.add(at(cyl(0.12, 0.18, 1.2, trunk, 6), 0, 0.6, 0));
      for (let k = 0; k < 3; k++) { const rr = (1.3 - k * 0.35) * s, hh = 1.4 * s; t.add(at(new THREE.Mesh(new THREE.ConeGeometry(rr, hh, 7), pine), 0, 1.2 + k * 0.85 * s + hh / 2 - 0.3, 0)); t.add(at(new THREE.Mesh(new THREE.ConeGeometry(rr * 0.55, hh * 0.38, 7), snow), 0, 1.2 + k * 0.85 * s + hh - 0.42, 0)); }
      prop(t, x, z); }
    const rock = std(0x9fb8cc);
    for (let i = 0; i < 5; i++) { const [x, z] = spot(16); const m = new THREE.Mesh(new THREE.ConeGeometry(2 + r() * 2, 5 + r() * 4, 6), rock); m.position.y = 2.4; const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 6), snow); cap.position.y = m.geometry.parameters.height / 2 - 0.6; m.add(cap); prop(m, x, z); }
    for (let i = 0; i < 8; i++) { const [x, z] = spot(3); const d = new THREE.Mesh(new THREE.SphereGeometry(1.2 + r() * 1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), snow); d.scale.y = 0.25; prop(d, x, z); }
  } else if (zn.deco === "dunes") {
    const sand = std(0xe8c080), stone = std(0xe8a060, { emissive: 0x6a3010, emissiveIntensity: 0.35 }), dark = std(0xb06a3a, { emissive: 0x4a2008, emissiveIntensity: 0.3 });
    for (let i = 0; i < 3; i++) { const [x, z] = spot(8); const a = new THREE.Group(); const hh = 4.6 + r() * 1.6;
      a.add(at(box(1.3, hh, 1.3, stone), -2.5, hh / 2, 0), at(box(1.3, hh, 1.3, stone), 2.5, hh / 2, 0), at(box(6.6, 1.1, 1.5, stone), 0, hh + 0.5, 0), at(box(1.6, 0.4, 1.6, dark), -2.5, 0.2, 0), at(box(1.6, 0.4, 1.6, dark), 2.5, 0.2, 0));
      prop(a, x, z); }
    for (let i = 0; i < 8; i++) { const [x, z] = spot(3); const d = new THREE.Mesh(new THREE.SphereGeometry(1.4 + r() * 1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), sand); d.scale.y = 0.22; prop(d, x, z); }
    const cact = std(0x4c8a4a);
    for (let i = 0; i < 9; i++) { const [x, z] = spot(2); const c = new THREE.Group(); c.add(at(cyl(0.3, 0.35, 2.6, cact, 8), 0, 1.3, 0), at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), cact), 0, 2.6, 0));
      for (const sg of [-1, 1]) { const y = 1.3 + r() * 0.6; c.add(at(box(0.5, 0.3, 0.3, cact), sg * 0.4, y, 0), at(cyl(0.18, 0.2, 0.9, cact, 8), sg * 0.62, y + 0.45, 0)); }
      prop(c, x, z); }
    // doors that say EXIT and lead nowhere
    const frame = std(0x5a4a3a), door = glowM(0x5fe08a, 0.9);
    for (let i = 0; i < 4; i++) { const [x, z] = spot(5); const d = new THREE.Group();
      d.add(at(box(0.25, 3, 0.25, frame), -0.85, 1.5, 0), at(box(0.25, 3, 0.25, frame), 0.85, 1.5, 0), at(box(1.95, 0.25, 0.25, frame), 0, 3.0, 0), at(box(1.45, 2.8, 0.06, door), 0, 1.4, 0));
      d.position.y = -0.3 - r() * 0.5; d.rotation.z = (r() - 0.5) * 0.3; prop(d, x, z);
      const s = K.label("EXIT", { accent: "#5fe08a", color: "#d8ffe6", size: 0.6 }); s.position.set(x, 3.8, z); g.add(s); }
    const wood = std(0x6a4428), lidM = std(0xb08a3a, { metalness: 0.5, roughness: 0.4 }), hole = std(0x140c06);
    for (let i = 0; i < 3; i++) { const [x, z] = spot(4); const c = new THREE.Group(); c.add(at(box(1.4, 0.8, 0.9, wood), 0, 0.2, 0), at(box(1.25, 0.05, 0.75, hole), 0, 0.61, 0));
      const lid = at(box(1.45, 0.16, 0.95, lidM), 0, 0.95, -0.55); lid.rotation.x = -1.2; c.add(lid); c.rotation.z = 0.1; prop(c, x, z); }
    const sstone = std(0xb07a48);
    for (let i = 0; i < 10; i++) { const [x, z] = spot(2); const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + r() * 0.8, 0), sstone); rk.position.y = 0.3; rk.scale.y = 0.7; prop(rk, x, z); }
  } else if (zn.deco === "reef") {
    // hooks on lines from the sky, each with a glowing "log in" card for bait
    const metal = std(0xc8d2dc, { metalness: 0.85, roughness: 0.25, flatShading: false }), line = std(0xe8eef4, { flatShading: false }), bait = glowM(0x35d8d0, 1.6);
    for (let i = 0; i < 4; i++) { const [x, z] = spot(6); const hk = new THREE.Group(); const top = 13;
      hk.add(at(cyl(0.03, 0.03, top - 6.6, line, 4), 0, 6.6 + (top - 6.6) / 2, 0), at(cyl(0.16, 0.16, 3.2, metal, 10), 0, 5, 0));
      const bend = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.16, 8, 20, Math.PI * 1.15), metal); bend.rotation.z = Math.PI * 0.98; bend.position.set(0.9, 3.4, 0); hk.add(bend);
      const barb = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), metal); barb.position.set(1.8, 3.7, 0); hk.add(barb);
      hk.add(at(box(1.4, 0.9, 0.08, bait), 0.9, 2.15, 0));
      prop(hk, x, z);
      const s = K.label(["LOG IN", "VERIFY WALLET", "CLAIM NOW", "SUPPORT DM"][i], { accent: "#35d8d0", color: "#e6fffd", size: 0.55 }); s.position.set(x, 1.4, z); g.add(s); }
    const cols = [0xff7ab0, 0x35d8d0, 0xffc861, 0xb48cff], cmats = cols.map((c) => glowM(c, 0.55));
    for (let i = 0; i < 12; i++) { const [x, z] = spot(2); const c = new THREE.Group(), m = cmats[i % 4], hh = 1 + r() * 1.4;
      c.add(at(cyl(0.12, 0.2, hh, m, 7), 0, hh / 2, 0), at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), m), 0, hh, 0));
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + r(), l = 0.6 + r() * 0.7, b = cyl(0.07, 0.11, l, m, 6); b.position.set(Math.cos(a) * 0.3, hh * 0.55 + l * 0.3, Math.sin(a) * 0.3); b.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); c.add(b); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), m); tip.position.set(Math.cos(a) * (0.3 + l * 0.45), hh * 0.55 + l * 0.75, Math.sin(a) * (0.3 + l * 0.45)); c.add(tip); }
      prop(c, x, z); }
    // kelp: merged into one mesh, still swaying blade by blade
    { const kg = new THREE.Group(), km = windLook(std(0x2e9a6a, { flatShading: false, roughness: 0.7 }), { amp: 0.4, h: 4, local: true });
      for (let i = 0; i < (low ? 10 : 18); i++) { const [x, z] = spot(3); const hh = 2.4 + r() * 2.6, b = new THREE.Mesh(new THREE.BoxGeometry(0.28, hh, 0.06, 1, 6, 1), km); b.position.set(x, hh / 2, z); b.rotation.y = r() * 3; kg.add(b); }
      g.add(kg); if (K.mergeStatic) K.mergeStatic(kg); kg.children.forEach(keep); }
    const shell = std(0xf0e4d8, { roughness: 0.5 });
    for (let i = 0; i < 8; i++) { const [x, z] = spot(3); const sh = new THREE.Mesh(new THREE.SphereGeometry(0.7 + r() * 0.8, 10, 8), shell); sh.scale.set(1, 0.6, 1.3); sh.position.y = 0.3; prop(sh, x, z); }
  } else if (zn.deco === "toxic") {
    // the bot farm: racks of servers with blinking lights, fans on top
    const rackM = std(0x1e2630, { metalness: 0.6, roughness: 0.35 }), vent = std(0x0c1016), fanH = std(0x3a4450, { metalness: 0.6 });
    const n = 8, perRack = 24, racks = [];
    for (let i = 0; i < n; i++) { const [x, z] = spot(4); const rk = new THREE.Group(); rk.add(at(box(1.4, 3.2, 1.0, rackM), 0, 1.6, 0));
      for (let k = 0; k < 4; k++) rk.add(at(box(1.1, 0.08, 0.04, vent), 0, 0.6 + k * 0.7, 0.51));
      rk.add(at(cyl(0.5, 0.5, 0.18, fanH, 14), 0, 3.29, 0));
      const ry = r() * 6; prop(rk, x, z, ry); racks.push({ x, z, ry }); }
    const led = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n * perRack);
    const blades = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.04, 0.16), std(0x9aa8b4, { metalness: 0.7 }), n * 2);
    const o = new THREE.Object3D(), on = new THREE.Color(0.35, 2.4, 0.5), red = new THREE.Color(2.6, 0.3, 0.3), off = new THREE.Color(0.05, 0.12, 0.06);
    racks.forEach((rk, i) => { for (let k = 0; k < perRack; k++) { const col = k % 6, row = Math.floor(k / 6); o.position.set(-0.45 + col * 0.18, 0.95 + row * 0.7, 0.52); o.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rk.ry); o.position.x += rk.x; o.position.z += rk.z; o.rotation.set(0, rk.ry, 0); o.updateMatrix(); led.setMatrixAt(i * perRack + k, o.matrix); led.setColorAt(i * perRack + k, r() < 0.06 ? red : r() < 0.7 ? on : off); } });
    led.instanceMatrix.needsUpdate = true; led.instanceColor.needsUpdate = true; g.add(keep(led));
    g.add(keep(blades));
    let blinkT = 0;
    spins.push((dt, t) => {
      racks.forEach((rk, i) => { for (let b = 0; b < 2; b++) { o.position.set(rk.x, 3.42, rk.z); o.rotation.set(0, t * 9 + i + b * Math.PI / 2, 0); o.updateMatrix(); blades.setMatrixAt(i * 2 + b, o.matrix); } });
      blades.instanceMatrix.needsUpdate = true;
      if ((blinkT -= dt) <= 0) { blinkT = 0.18; for (let k = 0; k < 14; k++) { const j = Math.floor(Math.random() * n * perRack); led.setColorAt(j, Math.random() < 0.05 ? red : Math.random() < 0.65 ? on : off); } led.instanceColor.needsUpdate = true; }
    });
    // cables between the racks
    const cable = std(0x111418, { flatShading: false });
    for (let i = 0; i + 1 < racks.length; i++) { const a = racks[i], b = racks[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L > 18) continue; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, L, 5), cable); c.rotation.z = Math.PI / 2; const w = new THREE.Group(); w.add(c); w.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2); w.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); g.add(w); }
    // chimneys with smoke
    const brick = std(0x4a3a34), band = std(0xd8d0c8);
    for (let i = 0; i < 3; i++) { const [x, z] = spot(10); const ch = new THREE.Group(); ch.add(at(cyl(0.7, 0.95, 8, brick, 12), 0, 4, 0), at(cyl(0.74, 0.74, 0.4, band, 12), 0, 6.6, 0), at(cyl(0.8, 0.8, 0.3, brick, 12), 0, 8.0, 0)); prop(ch, x, z);
      for (let k = 0; k < (low ? 2 : 4); k++) { const s = keep(new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.soft, color: 0x8a9a6a, transparent: true, opacity: 0.5, depthWrite: false }))); g.add(s); const ph = k / 4; spins.push((dt, t) => { const q = (t * 0.22 + ph + i * 0.3) % 1; s.position.set(x + q * 2.2, 8.4 + q * 6, z + q * 0.8); s.scale.setScalar(1.2 + q * 3.2); s.material.opacity = 0.45 * (1 - q) * Math.min(1, q * 6); }); } }
    const barrel = std(0x3a4a2a, { metalness: 0.5 }), goo = glowM(0x9aff3c, 1.4);
    for (let i = 0; i < 9; i++) { const [x, z] = spot(3); const b = new THREE.Group(); b.add(at(cyl(0.5, 0.5, 1.2, barrel, 12), 0, 0.6, 0)); const top = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), goo); top.rotation.x = -Math.PI / 2; top.position.y = 1.21; b.add(top); if (i % 3 === 0) { b.rotation.z = Math.PI / 2; b.position.y = 0.5; } prop(b, x, z); }
    const pool = glowM(0x7fe02a, 0.8);
    for (let i = 0; i < 5; i++) { const [x, z] = spot(4); const p = new THREE.Mesh(new THREE.CircleGeometry(1.4 + r() * 1.6, 20), pool); p.rotation.x = -Math.PI / 2; p.position.y = 0.05; prop(p, x, z, 0); }
  } else if (zn.deco === "ruins") {
    const marble = std(0xd8d0e4, { roughness: 0.55 }), base = std(0xb8b0c8);
    for (let i = 0; i < 12; i++) { const [x, z] = spot(3); const c = new THREE.Group(); const kind = i % 4;
      if (kind === 3) { const L = 3 + r() * 2.5; const sh = cyl(0.45, 0.5, L, marble, 12); sh.rotation.z = Math.PI / 2; sh.position.y = 0.48; c.add(sh); }
      else { const hh = kind === 0 ? 4.6 : 1.4 + r() * 2.2; c.add(at(box(1.3, 0.4, 1.3, base), 0, 0.2, 0), at(cyl(0.45, 0.5, hh, marble, 12), 0, 0.4 + hh / 2, 0)); if (kind === 0) c.add(at(box(1.35, 0.35, 1.35, base), 0, 0.4 + hh + 0.17, 0)); }
      prop(c, x, z); }
    // the ticker board: every coin red, withdrawals paused
    { const [x, z] = spot(10); const b = new THREE.Group(), frame = std(0x1a1622, { metalness: 0.6 });
      b.add(at(box(7.4, 2.2, 0.4, frame), 0, 4.2, 0), at(box(0.4, 3.2, 0.4, frame), -3, 1.6, 0), at(box(0.4, 3.2, 0.4, frame), 3, 1.6, 0));
      const tex = tx.ticker.clone(); tex.needsUpdate = true; tex.repeat.set(0.55, 1);
      const scr = keep(new THREE.Mesh(new THREE.PlaneGeometry(7, 1.8), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false })));
      scr.position.set(0, 4.2, 0.21); b.add(scr); const back = keep(scr.clone()); back.rotation.y = Math.PI; back.position.z = -0.21; b.add(back);
      spins.push((dt) => { tex.offset.x = (tex.offset.x + dt * 0.05) % 1; });
      prop(b, x, z); }
    // the vault: the door hangs open, nothing inside
    { const [x, z] = spot(10); const v = new THREE.Group(), steel = std(0x8a90a0, { metalness: 0.8, roughness: 0.3 }), inside = std(0x0a0810);
      v.add(at(box(4, 0.6, 1.2, steel), 0, 0.3, 0), at(box(4, 0.6, 1.2, steel), 0, 4.1, 0), at(box(0.6, 3.2, 1.2, steel), -1.7, 2.2, 0), at(box(0.6, 3.2, 1.2, steel), 1.7, 2.2, 0), at(box(2.8, 3.2, 0.2, inside), 0, 2.2, -0.5));
      const door = new THREE.Group(); const dsk = cyl(1.55, 1.55, 0.35, steel, 24); dsk.rotation.x = Math.PI / 2; door.add(dsk);
      for (let k = 0; k < 3; k++) { const sp = box(0.12, 1.6, 0.12, base); sp.rotation.z = (k / 3) * Math.PI; sp.position.z = 0.3; door.add(sp); }
      door.position.set(2.2 + 1.2, 2.2, 1.3); door.rotation.y = -1.25; v.add(door);
      prop(v, x, z); }
    const rub = std(0xc8c0d4);
    for (let i = 0; i < 12; i++) { const [x, z] = spot(2); const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + r() * 0.5, 0), rub); rk.position.y = 0.2; prop(rk, x, z); }
    for (let i = 0; i < 4; i++) { const [x, z] = spot(4); const t = K.label(["WITHDRAWALS PAUSED", "100% SAFE", "PROOF OF RESERVES?", "MAINTENANCE"][i], { accent: "#b48cff", color: "#ffc861", size: 0.6 }); t.position.set(x, 3, z); g.add(t); }
  } else if (zn.deco === "lava") {
    const lava = keep(glowM(0xff4a10, 1.8)); spins.push((dt, t) => { lava.emissiveIntensity = 1.6 + Math.sin(t * 1.8) * 0.35; });
    // the crossing: a lava river and a bridge broken in the middle
    { const [x, z] = spot(7); const c = new THREE.Group();
      const riv = keep(new THREE.Mesh(new THREE.PlaneGeometry(4, 20), lava)); riv.rotation.x = -Math.PI / 2; riv.position.y = 0.05; c.add(riv);
      for (const e of [-10, 10]) { const end = keep(new THREE.Mesh(new THREE.CircleGeometry(2, 20), lava)); end.rotation.x = -Math.PI / 2; end.position.set(0, 0.05, e); c.add(end); }
      const deck = std(0x3a2a2a, { metalness: 0.4 }), steel = std(0x5a5060, { metalness: 0.7, roughness: 0.35 });
      for (const s of [-1, 1]) { const half = new THREE.Group(); half.add(at(box(5, 0.35, 2.4, deck), 0, 0, 0));
        for (let k = 0; k < 5; k++) for (const sz of [-1, 1]) half.add(at(cyl(0.06, 0.06, 0.8, steel, 6), -2.2 + k * 1.1, 0.55, sz * 1.1));
        for (const sz of [-1, 1]) half.add(at(box(5, 0.08, 0.08, steel), 0, 0.95, sz * 1.1));
        half.position.set(s * 3.7, 1.6, 0); half.rotation.z = s * -0.12; c.add(half);
        for (const sz of [-1, 1]) c.add(at(box(0.6, 6.5, 0.6, steel), s * 6.4, 3.25, sz * 1.3)); }
      prop(c, x, z); }
    for (let i = 0; i < 4; i++) { const [x, z] = spot(5); const p = keep(new THREE.Mesh(new THREE.CircleGeometry(1.2 + r() * 1.4, 20), lava)); p.rotation.x = -Math.PI / 2; p.position.y = 0.06; prop(p, x, z, 0); }
    const obs = std(0x1a0e10, { metalness: 0.3, roughness: 0.25 });
    for (let i = 0; i < 9; i++) { const [x, z] = spot(3); const hh = 2.5 + r() * 4; const s = new THREE.Mesh(new THREE.ConeGeometry(0.5 + r() * 0.6, hh, 5), obs); s.position.y = hh / 2; s.rotation.z = (r() - 0.5) * 0.2; prop(s, x, z); }
    const rock = std(0x2a1410);
    for (let i = 0; i < 10; i++) { const [x, z] = spot(3); const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + r() * 1.2, 0), rock); rk.position.y = 0.5; prop(rk, x, z); }
    const crack = glowM(0xff5a1a, 2.2);
    for (let i = 0; i < 7; i++) { const [x, z] = spot(3); const c = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3 + r() * 4), crack); c.rotation.x = -Math.PI / 2; c.position.y = 0.06; prop(c, x, z); }
  } else if (zn.deco === "void") {
    // floating islands that bob, each with a crystal
    const top = std(0x3a2a5a), under = std(0x24183a), gem = glowM(0xff4dd2, 1.8);
    for (let i = 0; i < 7; i++) { const [x, z] = spot(6); const isl = new THREE.Group(), rr = 1.4 + r() * 1.4;
      isl.add(at(cyl(rr, rr * 0.92, 0.5, top, 9), 0, 0, 0)); const c = new THREE.Mesh(new THREE.ConeGeometry(rr * 0.92, rr * 1.9, 9), under); c.rotation.x = Math.PI; c.position.y = -0.25 - rr * 0.95; isl.add(c);
      const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), gem); gm.scale.y = 1.8; gm.position.y = 0.9; isl.add(gm);
      const y0 = 3 + r() * 5; isl.position.set(x, y0, z); g.add(isl); if (K.mergeStatic) K.mergeStatic(isl); isl.children.forEach(keep); keep(isl);
      spins.push((dt, t) => { isl.position.y = y0 + Math.sin(t * 0.6 + i * 1.3) * 0.45; isl.rotation.y = t * 0.05 + i; }); }
    // flying rugs
    const rugM = new THREE.MeshStandardMaterial({ map: tx.rug, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) { const [x, z] = spot(4); const rg = keep(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6, 6, 1), rugM)); rg.rotation.x = -Math.PI / 2; const y0 = 2 + r() * 4; rg.position.set(x, y0, z); g.add(rg); const ry = r() * 6;
      spins.push((dt, t) => { rg.position.y = y0 + Math.sin(t * 0.9 + i) * 0.5; rg.rotation.set(-Math.PI / 2 + Math.sin(t * 1.3 + i) * 0.12, 0, ry + t * 0.15); }); }
    // the black hole over the middle
    { const bh = keep(new THREE.Group()); bh.position.set(0, 17, 0);
      bh.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })));
      const disk = new THREE.Mesh(new THREE.RingGeometry(2.4, 7.5, 64), new THREE.MeshBasicMaterial({ map: tx.disk, color: new THREE.Color(1.6, 1.2, 1.6), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      disk.rotation.x = -Math.PI / 2 + 0.35; bh.add(disk); g.add(bh);
      spins.push((dt, t) => { disk.rotation.z = t * 0.4; }); }
    const cube = std(0x1a0a28, { metalness: 0.7, roughness: 0.2, emissive: 0xff4dd2, emissiveIntensity: 0.15 });
    for (let i = 0; i < 10; i++) { const [x, z] = spot(2); const s = 0.4 + r() * 1.0; const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), cube); c.position.y = 1 + r() * 5; c.rotation.set(r() * 3, r() * 3, 0); prop(c, x, z); }
    const ring = glowM(0xff4dd2, 1.8);
    for (let i = 0; i < 4; i++) { const [x, z] = spot(4); const rg = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 8, 32), ring); rg.position.y = 2.5; prop(rg, x, z); }
  }
}
