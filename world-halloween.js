// world-halloween.js — the Halloween dressing for ARCIRCLE World (from 17 October to 2 November, Seoul time; ?halloween=1
// turns it on to try out): carved pumpkins by the street lamps and round the plaza that glow after dark, a violet
// tint in the night fog, bats instead of birds at night (world-ambient.js), ghostly scammers (world-combat.js) and a
// pumpkin to wear (the wardrobe, while it lasts). Nothing here changes the game's rules or rewards.
const START = [10, 17], END = [11, 2]; // month, day (inclusive), Seoul time

export function halloweenOn(now = Date.now()) {
  try { const q = new URLSearchParams(location.search).get("halloween"); if (q === "1") return true; if (q === "0") return false; } catch { /* not a page */ }
  const d = new Date(now + 9 * 3600e3), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const v = m * 100 + day; return v >= START[0] * 100 + START[1] && v <= END[0] * 100 + END[1];
}

/// a carved jack-o'-lantern (one geometry and material set shared by all of them); glow(k) lights the faces (0 by day)
export function createPumpkins({ THREE, planet, spots = [], extra = [] }) {
  const root = new THREE.Group(); root.name = "halloween"; planet.add(root);
  const face = (() => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128; const g = cv.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#fff";
    const tri = (x, y, s) => { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y + s * 0.7); g.lineTo(x - s, y + s * 0.7); g.closePath(); g.fill(); };
    tri(40, 50, 14); tri(88, 50, 14); tri(64, 70, 8);
    g.beginPath(); g.moveTo(24, 82); for (let i = 0; i <= 8; i++) g.lineTo(24 + i * 10, 82 + (i % 2 ? 14 : 0) + Math.sin(i) * 2); g.lineTo(104, 92); g.quadraticCurveTo(64, 120, 24, 92); g.closePath(); g.fill();
    // the face fills only the front quarter of the pumpkin (u 0.125–0.375 faces +Z); the rest clamps to black
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.repeat.set(4, 1); t.offset.set(-0.5, 0); return t; })();
  const body = new THREE.SphereGeometry(0.42, 18, 12); { const p = body.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), rib = 1 + Math.cos(a * 8) * 0.06; p.setXYZ(i, x * rib * 1.12, p.getY(i) * 0.82, z * rib * 1.12); } body.computeVertexNormals(); }
  const skin = new THREE.MeshStandardMaterial({ color: 0xff8a1e, roughness: 0.6, emissiveMap: face, emissive: 0xffa040, emissiveIntensity: 0 });
  const stemG = new THREE.CylinderGeometry(0.05, 0.08, 0.22, 6), stemM = new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.8 });
  // PF4 (2026-10-27): every pumpkin was two meshes (~20 draw calls in the plaza); now one instanced mesh for the bodies
  // and one for the stems, two draws for them all
  const pk = [], o3 = new THREE.Object3D(), bOff = new THREE.Matrix4().makeTranslation(0, 0.34, 0), sOff = new THREE.Matrix4().makeTranslation(0, 0.72, 0).multiply(new THREE.Matrix4().makeRotationZ(0.25));
  const put = (x, z, s = 1, ry = 0) => { o3.position.set(x, 0, z); o3.rotation.set(0, ry, 0); o3.scale.setScalar(s); o3.updateMatrix(); pk.push(o3.matrix.clone()); };
  // one by every street lamp (a step to its side, facing the plaza), and a few in a ring round the fountain
  spots.forEach(([x, z], i) => { const a = Math.atan2(x, z); put(x + Math.cos(a) * 0.9, z - Math.sin(a) * 0.9, 0.9 + (i % 3) * 0.12, Math.atan2(-x, -z)); });
  extra.forEach(([x, z, s]) => put(x, z, s, Math.atan2(-x, -z)));
  if (pk.length) { const bi = new THREE.InstancedMesh(body, skin, pk.length), si = new THREE.InstancedMesh(stemG, stemM, pk.length), m = new THREE.Matrix4();
    pk.forEach((M, i) => { bi.setMatrixAt(i, m.multiplyMatrices(M, bOff)); si.setMatrixAt(i, m.multiplyMatrices(M, sOff)); }); bi.castShadow = true; bi.computeBoundingSphere(); si.computeBoundingSphere(); root.add(bi, si); }
  return { root, glow(k) { skin.emissiveIntensity = 0.15 + k * 2.2; } };
}
