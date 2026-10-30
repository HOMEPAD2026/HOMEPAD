// world-studiohub.js — ARCIRCLE Studio in the town (2026-10-26, the owner: "스튜디오는 분수대 쪽으로 옮기자"): the Neon Gaming Citadel
// (models/world/adcity/studio.glb) just past the plaza's ring, its front to the fountain, its door, a sign, and the four arcade
// cabinets at its sides (most played · newest · editor's pick · ARCIRCLE's game of the day; walk up → that game). It came from
// Nexus City, which no longer has a Studio of its own. The model loads a few seconds after the town stands (a stand-in until then).
//   makeStudioHub({ THREE, K, planet, T, low, ver, at: { phi, r } }) → { group, doors, solids, tick, pick(id), cabs(), poll(), center }
export const HUB = { phi: 110, r: 28, fp: 12 }; // (φ as the plaza counts it: atan2(x, −z); between the Utility (70°) and Partner (150°) portals)
export const CABS = [{ id: "pick", col: 0xffd23a, css: "#ffd23a", name: "Most played" }, { id: "cab1", col: 0x5fd3ff, css: "#5fd3ff", name: "Newest" },
  { id: "cab2", col: 0xff6fae, css: "#ff6fae", name: "Editor's pick" }, { id: "cab3", col: 0x7cf5c8, css: "#7cf5c8", name: "Made by ARCIRCLE" }];
const ICO = { runner: "🏃", dash: "⚡", arena: "🛸", climb: "🧗", defense: "🏰", puzzle: "🧩", rush: "💰" };
export function hubXZ(phi = HUB.phi, r = HUB.r) { const a = (phi * Math.PI) / 180; return { x: Math.sin(a) * r, z: -Math.cos(a) * r }; }

export function makeStudioHub({ THREE, K, planet, T = (s) => s, low = false, ver = "", ready = null }) {
  const { x, z } = hubXZ(), g = new THREE.Group(); g.name = "studio-hub"; g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); planet.add(g); // (its front, +z, faces the fountain)
  const doors = [], solids = [], spins = [], picks = {}, padMats = [];
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, ...o });
  const neon = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
  const DARK = std(0x16233a, { roughness: 0.35, metalness: 0.6 }), STEEL = std(0x9fb2c8, { roughness: 0.25, metalness: 0.75 });
  const canvas = (w, h) => { if (typeof document === "undefined") return null; const c = document.createElement("canvas"); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData = { cv: c }; return t; };
  const solid = (o, r, px = 0, pz = 0) => { const s = new THREE.Group(); s.position.set(px, 0, pz); s.userData.radius = r; o.add(s); solids.push(s); };
  function door(o, id, col, d, px = 0) {
    const dr = new THREE.Group(); dr.name = "stu-door:" + id; dr.position.set(px, 0, d); dr.userData.radius = 1; dr.userData.b = id; o.add(dr); doors.push(dr);
    const pad = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 40), neon(col, 0.85)); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.07; dr.add(pad); padMats.push(pad.material);
    const pl = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), neon(col, 0.18)); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.065; dr.add(pl);
    return dr;
  }
  // the building: a stand-in (a white cube, glass front, a turning play mark) until the Citadel's model is in
  const F = HUB.fp, P = new THREE.Group(); P.name = "stand-in"; g.add(P);
  { const cube = new THREE.Mesh(new THREE.BoxGeometry(F * 0.8, 7, F * 0.8), std(0xeef4fb, { roughness: 0.32, metalness: 0.18 })); cube.position.y = 3.5; P.add(cube);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(F * 0.5, 4), std(0x8fe9ff, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, emissive: 0x2a8cff, emissiveIntensity: 0.35 })); front.position.set(0, 3.2, F * 0.4 + 0.02); P.add(front); }
  P.userData.keep = true; /* (hidden when the model is in: never merged into the rest) */
  const tri = new THREE.Shape(); tri.moveTo(-1.1, -1.3); tri.lineTo(1.5, 0); tri.lineTo(-1.1, 1.3); tri.closePath();
  const play = new THREE.Mesh(new THREE.ShapeGeometry(tri), neon(0x7cf5c8, 0.9)); play.material.side = THREE.DoubleSide; play.position.y = 12; play.userData.keep = true; g.add(play);
  spins.push((t) => { play.rotation.y = t * 0.9; play.position.y = 12 + Math.sin(t * 1.4) * 0.25; });
  // the sign over the door (it turns to face the camera)
  const sign = canvas(1024, 300);
  if (sign) { const c = sign.userData.cv.getContext("2d"); c.beginPath(); if (c.roundRect) c.roundRect(8, 8, 1008, 284, 44); else c.rect(8, 8, 1008, 284); c.fillStyle = "rgba(4,14,30,.9)"; c.fill(); c.lineWidth = 8; const bd = c.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#2f8cff"); bd.addColorStop(0.5, "#7cf5c8"); bd.addColorStop(1, "#ff6fae"); c.strokeStyle = bd; c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle"; c.shadowColor = "#7cf5c8"; c.shadowBlur = 22; c.fillStyle = "#fff"; c.font = "900 92px Sora, 'Segoe UI', sans-serif"; c.fillText("🎮 " + T("ARCIRCLE Studio"), 512, 112, 960);
    c.shadowBlur = 0; c.fillStyle = "#cfe6ff"; c.font = "800 46px Sora, 'Segoe UI', sans-serif"; c.fillText(T("Make your own game"), 512, 222, 940); sign.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 8 * 0.293), new THREE.MeshBasicMaterial({ map: sign, transparent: true, depthWrite: false, fog: false, toneMapped: false })); m.position.y = 9.4; m.renderOrder = 11; m.userData.keep = true; g.add(m);
    const qp = new THREE.Quaternion(); m.onBeforeRender = (r, sc, cam) => { g.getWorldQuaternion(qp); m.quaternion.copy(qp.invert().multiply(cam.quaternion)); m.updateMatrixWorld(); }; }
  door(g, "studio", 0x7cf5c8, F / 2 + 1.4); solid(g, F / 2 - 0.8);
  // the four cabinets, two each side of the door, screens to the fountain
  const SPOT = [[-(F / 2 + 1.8), F / 2 - 2.2], [-(F / 2 + 1.2), F / 2 + 1.2], [F / 2 + 1.2, F / 2 + 1.2], [F / 2 + 1.8, F / 2 - 2.2]];
  CABS.forEach((cb, i) => { const o = new THREE.Group(); o.name = "stu-cab:" + cb.id; o.position.set(SPOT[i][0], 0, SPOT[i][1]); o.rotation.y = (i < 2 ? -1 : 1) * 0.35; o.scale.setScalar(1.25); g.add(o);
    const glow = neon(cb.col);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 1.0), DARK); box.position.y = 1.15; o.add(box);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, 1.06), glow); trim.position.y = 2.3; o.add(trim);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.5), STEEL); deck.position.set(0, 1.05, 0.62); deck.rotation.x = 0.25; o.add(deck);
    const stick = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow); stick.position.set(-0.3, 1.2, 0.66); o.add(stick);
    const mqb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.5), DARK); mqb.position.set(0, 2.55, 0.15); o.add(mqb);
    cb.tex = canvas(512, 400); cb.mq = canvas(512, 128);
    if (cb.tex) { const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.02), new THREE.MeshBasicMaterial({ map: cb.tex, toneMapped: false })); scr.position.set(0, 1.72, 0.52); scr.rotation.x = -0.12; o.add(scr);
      const mq = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), new THREE.MeshBasicMaterial({ map: cb.mq, toneMapped: false })); mq.position.set(0, 2.55, 0.42); o.add(mq);
      const x2 = cb.mq.userData.cv.getContext("2d"); x2.fillStyle = "#06101f"; x2.fillRect(0, 0, 512, 128); x2.fillStyle = cb.css; x2.fillRect(0, 118, 512, 10); x2.textAlign = "center"; x2.font = "900 50px Sora, 'Segoe UI', sans-serif"; x2.fillText(T(cb.name), 256, 80, 480); cb.mq.needsUpdate = true; }
    solid(o, 0.9); door(o, cb.id, cb.col, 1.7); });
  // HUB 2 (2026-10-28): the Creator Hub's kiosk past the cabinets — walk up → the Creator Hub on the web (/studio: your games,
  // the forum, notifications, analytics), the same session as the World's
  { const o = new THREE.Group(); o.name = "stu-kiosk"; o.position.set(-3.8, 0, F / 2 + 5.6); o.rotation.y = -0.3; o.scale.setScalar(1.3); g.add(o); kiosk(THREE, o, neon, DARK, STEEL, canvas, T, spins).userData.keep = true; solid(o, 0.8); door(o, "hubk", 0x39d3ff, 1.8); }
  // perf batch 5: the door pads breathe by one shared opacity (not a scale a pad), so the cabinets, the pads and the kiosk merge
  // into one mesh a material (~50 draw calls down to ~15); the stand-in, the play mark, the sign and the kiosk's ring stay apart
  spins.push((t) => { const op = 0.72 + Math.sin(t * 3) * 0.13; for (const m of padMats) m.opacity = op; });
  if (K.mergeStatic) K.mergeStatic(g);
  function paint() {
    for (const cb of CABS) { if (!cb.tex) continue; const c = cb.tex.userData.cv.getContext("2d"), w = 512, h = 400, p = picks[cb.id];
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0b2346"); gr.addColorStop(1, "#040b18"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.globalAlpha = 0.12; c.fillStyle = "#fff"; for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 2); c.globalAlpha = 1;
      c.textAlign = "center"; c.font = "900 96px Sora, 'Segoe UI', sans-serif"; c.fillText(p ? ICO[p.tpl] || "🎮" : "✨", w / 2, 130);
      c.fillStyle = "#fff"; c.font = "900 46px Sora, 'Segoe UI', sans-serif"; c.fillText(p ? p.title : T("Make the first game"), w / 2, 220, 480);
      c.fillStyle = "#cfe0f5"; c.font = "800 30px Sora, 'Segoe UI', sans-serif"; c.fillText(p ? T("by {name}", { name: p.byName || "—" }) : T("ARCIRCLE Studio"), w / 2, 272, 480);
      if (p) c.fillText("▶ " + (p.plays || 0) + "   ♥ " + (p.likes || 0), w / 2, 316, 480);
      c.fillStyle = cb.css; c.font = "900 28px Sora, 'Segoe UI', sans-serif"; c.fillText(T("Walk up to play it"), w / 2, 372, 480);
      cb.tex.needsUpdate = true; }
  }
  const score = (a) => (a.plays || 0) + (a.likes || 0) * 3;
  function choose(gs) { const day = Math.floor(Date.now() / 864e5), mine = gs.filter((a) => !a.off), offs = gs.filter((a) => a.off).sort((a, b) => (a.id < b.id ? -1 : 1)), used = new Set();
    const take = (L) => { const a = L.find((y) => !used.has(y.id)) || L[0] || null; if (a) used.add(a.id); return a; };
    picks.pick = take([...gs].sort((a, b) => score(b) - score(a)));
    picks.cab3 = offs.length ? take([...offs.slice(day % offs.length), ...offs.slice(0, day % offs.length)]) : null;
    picks.cab1 = take([...mine.sort((a, b) => (b.at || 0) - (a.at || 0)), ...offs]); // (no players' games yet: another of ours, never the same twice)
    picks.cab2 = take([...gs.filter((a) => a.pick).sort((a, b) => (b.pick || 0) - (a.pick || 0)), ...mine.sort((a, b) => (b.likes || 0) - (a.likes || 0)), ...offs]); }
  let pollAt = 0;
  async function poll() {
    if (Date.now() - pollAt < 120e3) return; pollAt = Date.now();
    try { const r = await fetch("/api/social?world=studio-arcade"); if (!r.ok) return; const j = await r.json(); choose((j.games || []).filter((y) => y && y.id)); } catch { /* the cabinets keep what they had */ }
    paint();
  }
  paint();
  // the Citadel's model, a moment after the town stands
  let model = false;
  (ready || Promise.resolve()).then(() => setTimeout(() => { try { if (!K.gltfLoader) return; K.gltfLoader().load(`/models/world/adcity/studio.glb${ver}`, (gl) => {
    const o = gl.scene; o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = !low; if (m.material && m.material.emissiveMap) m.material.emissiveIntensity = Math.max(m.material.emissiveIntensity || 1, 1.2); } });
    const bx = new THREE.Box3().setFromObject(o), sz = bx.getSize(new THREE.Vector3()), k = F / (Math.max(sz.x, sz.z) || 1);
    o.scale.setScalar(k); o.position.set(-(bx.min.x + sz.x / 2) * k, -bx.min.y * k, -(bx.min.z + sz.z / 2) * k); g.add(o); P.visible = false; model = true; }, undefined, (e) => console.warn("studio hub model", e)); } catch (e) { console.warn("studio hub model", e); } }, low ? 4000 : 1500)); // (2026-10-29: after the loading screen, not a timer inside it)
  return {
    group: g, doors, solids, center: { x, z },
    tick(t) { for (const f of spins) f(t); },
    poll, model: () => model,
    pick: (id = "pick") => picks[id] || null,
    cabs: () => CABS.map((c) => ({ id: c.id, name: c.name, g: picks[c.id] ? picks[c.id].id : null })),
    /// trees and bushes standing where the Studio is: put away (instanced meshes under group)
    clear(group) {
      const m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0); planet.updateMatrixWorld(true);
      group.traverse((o) => { if (!o.isInstancedMesh) return; let n = 0;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).sub(planet.position); if (Math.hypot(v.x - x, v.z - z) < F / 2 + 6) { o.setMatrixAt(i, zero); n++; } }
        if (n) { o.instanceMatrix.needsUpdate = true; if (o.computeBoundingSphere) o.computeBoundingSphere(); } });
    },
  };
}

/// the Creator Hub's kiosk: a slim stand with a tilted screen (the hub's name, a line, the address), a glowing rim and a
/// floating ring over it — also used in Creator City (world-creatorcity.js)
export function kiosk(THREE, o, neon, DARK, STEEL, canvas, T = (s) => s, spins = null) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.18, 24), STEEL); base.position.y = 0.09; o.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.5, 0.22), DARK); post.position.y = 0.9; o.add(post);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.12), DARK); frame.position.set(0, 1.95, 0); frame.rotation.x = -0.2; o.add(frame);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.18, 0.06), neon(0x39d3ff)); rim.position.set(0, 1.95, -0.05); rim.rotation.x = -0.2; o.add(rim);
  const tex = canvas(640, 400);
  if (tex) { const c = tex.userData.cv.getContext("2d"), gr = c.createLinearGradient(0, 0, 640, 400); gr.addColorStop(0, "#0b1d2a"); gr.addColorStop(1, "#071018"); c.fillStyle = gr; c.fillRect(0, 0, 640, 400);
    c.strokeStyle = "rgba(79,227,193,.35)"; c.lineWidth = 2; for (let x = 0; x < 640; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 400); c.stroke(); }
    c.textAlign = "center"; c.fillStyle = "#4fe3c1"; c.font = "800 34px Sora, 'Segoe UI', sans-serif"; c.fillText("ARCIRCLE", 320, 92);
    c.fillStyle = "#fff"; c.shadowColor = "#39d3ff"; c.shadowBlur = 18; c.font = "900 76px Sora, 'Segoe UI', sans-serif"; c.fillText(T("Creator Hub"), 320, 192, 600); c.shadowBlur = 0;
    c.fillStyle = "#cfe6ff"; c.font = "700 32px Sora, 'Segoe UI', sans-serif"; c.fillText(T("Your games, forum and alerts"), 320, 262, 600);
    c.fillStyle = "#39d3ff"; c.font = "800 30px Sora, 'Segoe UI', sans-serif"; c.fillText("arcircle.app/studio", 320, 338); tex.needsUpdate = true;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.97), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(0, 1.95, 0.07); scr.rotation.x = -0.2; o.add(scr); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 32), neon(0x4fe3c1)); ring.position.y = 3.0; o.add(ring);
  if (spins) spins.push((t) => { ring.rotation.y = t * 1.4; ring.position.y = 3.0 + Math.sin(t * 2) * 0.1; });
  return ring;
}
