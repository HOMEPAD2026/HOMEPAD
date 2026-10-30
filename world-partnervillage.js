// world-partnervillage.js — the Partner Village (2026-10-22): our official partners' own clearing, built like the Game
// Village — a gate facing the plaza with the village's name, a square in the middle, and a plot for each partner round it.
// PARTNERS is the list: a partner is one more entry (model: its building, a GLB, made the first time you come near; the
// rest stand as "Partner plot · Coming soon"). The first is KAIRO: the KAIRO Tower, whose door opens the KAIRO Finance
// Hub (world-partner.js). South-east, 140 m out at 142.5° (85, 111): open ground, 35 m clear of Airdrop Fields.
export const PARTNER_VILLAGE = { x: 85, z: 111, r: 25, plotR: 15, squareR: 6 };
export const PARTNERS = [
  { id: "soon1" }, { id: "soon2" },
  { id: "kairo", name: "KAIRO", sub: "Finance Hub · Swap · Klik · Disperse", color: 0x38e1d6, model: "/models/world/partners/kairo-tower.glb", h: 16 }, // the middle plot: straight ahead through the gate
  { id: "soon3" }, { id: "soon4" },
];
const BUILD_AT = 120;

export function makePartnerVillage({ THREE, K, planet, T, ver = "", low = false, onModel = null }) {
  const V = PARTNER_VILLAGE, root = new THREE.Group(); root.name = "partnervillage"; root.position.set(V.x, 0, V.z); planet.add(root);
  const TEAL = 0x38e1d6, std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }), glow = (c, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const basic = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: op >= 1, toneMapped: false });
  // the clearing (dark stone with a teal seam), its glowing edge and the square in the middle
  const ground = new THREE.Mesh(new THREE.CircleGeometry(V.r, 72), std(0x16232c, { roughness: 0.85, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; root.add(ground);
  const square = new THREE.Mesh(new THREE.CircleGeometry(V.squareR + 1, 64), std(0x22343f, { roughness: 0.5, metalness: 0.35, emissive: 0x062a2e, emissiveIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  square.rotation.x = -Math.PI / 2; square.position.y = 0.04; root.add(square);
  const ringM = (r, w, op) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 144), basic(TEAL, op)); m.rotation.x = Math.PI / 2; m.position.y = 0.08; root.add(m); return m; };
  ringM(V.r, 0.12, 0.9); const inner = ringM(V.squareR + 1, 0.08, 0.8); ringM(V.squareR - 1.2, 0.05, 0.5);
  // in the square: a slim pillar with a ring of light turning round it (the village's centre)
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.2, 12), std(0x2a3c48, { metalness: 0.6, roughness: 0.3 })); pillar.position.y = 1.6; root.add(pillar);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 48), basic(TEAL)); halo.position.y = 3.5; root.add(halo);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), glow(TEAL, 2.2)); orb.position.y = 3.5; root.add(orb);
  // the gate faces the plaza, with the village's name over it, and a big board above that faces you (seen from the plaza)
  const toPlaza = Math.atan2(-V.x, -V.z), gx = Math.sin(toPlaza) * V.r, gz = Math.cos(toPlaza) * V.r;
  const gate = K.makeArch(TEAL); gate.scale.setScalar(1.35); gate.position.set(gx, 0, gz); gate.rotation.y = toPlaza; root.add(gate);
  const sign = K.label(T("Partner Village"), { accent: "#38e1d6", size: 1.1, sub: T("Official partners of ARCIRCLE WORLD") }); sign.position.set(gx, 8, gz); root.add(sign);
  // perf batch 5: the high board and the beam on a planet child of their own at the same spot (never far-culled: they're what the
  // plaza sees), so the clearing's own cull sphere is small and farCull can hide it from the plaza (~26 m, not ~45)
  const sky = new THREE.Group(); sky.name = "partnervillage-sky"; sky.position.copy(root.position); planet.add(sky);
  const board = (() => { if (typeof document === "undefined") return null; const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 300; const g = cv.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 0, 300); bg.addColorStop(0, "rgba(6,22,30,.93)"); bg.addColorStop(1, "rgba(2,8,14,.93)"); g.beginPath(); g.roundRect(8, 8, 1008, 284, 44); g.fillStyle = bg; g.fill();
    g.lineWidth = 8; const bd = g.createLinearGradient(0, 0, 1024, 0); bd.addColorStop(0, "#2f8cff"); bd.addColorStop(0.5, "#38e1d6"); bd.addColorStop(1, "#7cf5c8"); g.strokeStyle = bd; g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#38e1d6"; g.shadowBlur = 22; g.fillStyle = "#ffffff"; g.font = "900 104px Sora, 'Segoe UI', sans-serif"; g.fillText(T("PARTNER VILLAGE"), 512, 112, 960);
    g.shadowBlur = 0; g.fillStyle = "#9ff6ee"; g.font = "800 52px Sora, 'Segoe UI', sans-serif"; g.fillText("KAIRO " + T("Finance Hub") + " · " + T("Official partner"), 512, 226, 940);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); m.position.set(0, 21, -4); m.renderOrder = 11; sky.add(m);
    const qp = new THREE.Quaternion(); m.onBeforeRender = (r, sc, cam) => { root.getWorldQuaternion(qp); m.quaternion.copy(qp.invert().multiply(cam.quaternion)); m.updateMatrixWorld(); }; return m; })();
  const beam = K.makeBeacon ? K.makeBeacon(TEAL, 55) : null; if (beam) sky.add(beam);
  // the plots round the square, leaving the gate's side open
  const slots = PARTNERS.length, a0 = toPlaza + Math.PI - 1.5, span = 3.0;
  const plotAt = (i) => { const a = a0 + (span * i) / (slots - 1); return { x: Math.sin(a) * V.plotR, z: Math.cos(a) * V.plotR, a }; };
  const doors = [], solids = [], spins = [], plotSign = (txt, sub) => { const s = K.label(txt, { accent: "#38e1d6", size: 0.75, sub }); return s; };
  PARTNERS.forEach((p, i) => {
    const at = plotAt(i), g = new THREE.Group(); g.position.set(at.x, 0, at.z); g.rotation.y = at.a + Math.PI; g.name = "partner-" + p.id; root.add(g); // (+Z faces the square)
    if (!p.model) { // a plot still free: a glowing outline, two striped rails and its sign
      const pad = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.15, 4, 1), basic(TEAL, 0.75)); pad.rotation.set(-Math.PI / 2, 0, Math.PI / 4); pad.position.y = 0.1; pad.material.side = THREE.DoubleSide; g.add(pad);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(2.9, 4), basic(0x0e2a30, 0.55)); fill.rotation.set(-Math.PI / 2, 0, Math.PI / 4); fill.position.y = 0.09; g.add(fill);
      const s = plotSign(T("Partner plot"), T("Coming soon")); s.position.y = 2.4; g.add(s);
      return;
    }
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.6, 0.24, 48), std(0x0b1620, { metalness: 0.55, roughness: 0.4, emissive: 0x062a2e, emissiveIntensity: 0.55 })); pad.position.y = 0.12; g.add(pad);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.08, 6, 96), basic(p.color)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.26; g.add(rim);
    const door = new THREE.Group(); door.name = "partner-door-" + p.id; door.userData.partner = p.id; door.userData.radius = 6.5; g.add(door); doors.push(door); solids.push(door);
    const tag = K.label(p.name, { accent: "#" + new THREE.Color(p.color).getHexString(), size: 0.9, sub: T(p.sub || "Official partner") }); tag.position.y = (p.h || 12) + 2.2; g.add(tag);
    if (beam && p.id === "kairo") { beam.position.set(at.x, 0, at.z); } // the beam rises from the first partner's building
    p._g = g; p._door = door;
  });
  let loading = false;
  function build() {
    if (loading) return; loading = true;
    for (const p of PARTNERS) { if (!p.model) continue;
      try { K.gltfLoader().load(p.model + ver, (gl) => { const o = gl.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), k = (p.h || 12) / (sz.y || 1);
        o.scale.setScalar(k); o.position.set(-(box.min.x + sz.x / 2) * k, 0.24 - box.min.y * k, -(box.min.z + sz.z / 2) * k);
        o.traverse((m) => { if (m.isMesh) { m.castShadow = !low; m.receiveShadow = false; } }); p._g.add(o); p._door.userData.radius = Math.max(sz.x, sz.z) * k / 2 + 0.4; p._door.userData.model = o; if (onModel) onModel(p.id, o);
      }, undefined, (e) => { console.warn("partner building", p.id, e); loading = false; }); } catch (e) { console.warn("partner building", e); loading = false; } }
  }
  return {
    root, doors, solids, center: { x: V.x, z: V.z }, r: V.r,
    ready: (id) => { const p = PARTNERS.find((x) => x.id === id); return !!(p && p._door && p._door.userData.model); },
    door: (id) => { const p = PARTNERS.find((x) => x.id === id); return p ? p._door : null; },
    /// keep the clearing clear: hide the scattered trees, crystals and hills (instanced) that fall inside it
    clear(group) {
      const m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0); planet.updateMatrixWorld(true);
      group.traverse((o) => { if (!o.isInstancedMesh) return; let n = 0;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).sub(planet.position); if (Math.hypot(v.x - V.x, v.z - V.z) < V.r + 2) { o.setMatrixAt(i, zero); n++; } }
        if (n) o.instanceMatrix.needsUpdate = true; });
    },
    /// each frame (x, z: where you stand): the light turns; the buildings load the first time you come near
    tick(dt, t, x, z) {
      halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.8) * 0.25; halo.rotation.z = t * 0.9; orb.position.y = 3.5 + Math.sin(t * 1.6) * 0.15; inner.material.opacity = 0.55 + Math.sin(t * 2) * 0.25;
      if (board) board.position.y = 21 + Math.sin(t * 1.2) * 0.2; if (beam && beam.userData.spin) beam.userData.spin(dt, t);
      if (!loading && Math.hypot(x - V.x, z - V.z) < BUILD_AT) build();
    },
    build,
  };
}
