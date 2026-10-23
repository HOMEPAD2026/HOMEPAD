// world-loading3d.js — the loading screen's little planet: it turns while the world loads, and the town rises on it
// as each real loading step finishes (the plaza and halls, the models, the hunting grounds); the ARCIRCLE rings
// orbit it. Its own small canvas, dropped as soon as the world is ready.
export function loadingScene(THREE, host, { reduce = false } = {}) {
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return null; }
  const S = 200, coarse = matchMedia("(pointer: coarse)").matches; r.setPixelRatio(Math.min(coarse ? 1.5 : 2, devicePixelRatio || 1)); r.setSize(S, S); r.outputColorSpace = THREE.SRGBColorSpace;
  r.domElement.className = "wp-load3d"; r.domElement.setAttribute("aria-hidden", "true"); host.prepend(r.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50); cam.position.set(0, 1.4, 7.8); cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0a1430, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(3, 3, 4); scene.add(sun);
  const world = new THREE.Group(); world.rotation.x = 0.35; scene.add(world);
  const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 3), new THREE.MeshStandardMaterial({ color: 0x3fae63, roughness: 0.9, flatShading: true })); world.add(planet);
  const sea = new THREE.Mesh(new THREE.IcosahedronGeometry(1.23, 3), new THREE.MeshStandardMaterial({ color: 0x2f86ff, roughness: 0.4 })); sea.scale.setScalar(1.005); world.add(sea);
  // patches of land: the green sphere pokes through the sea where the noise is high
  { const p = planet.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = Math.sin(v.x * 3.1) * Math.cos(v.y * 2.7) + Math.sin(v.z * 3.7 + 1); v.multiplyScalar(n > 0.2 ? 1.03 : 0.97); p.setXYZ(i, v.x, v.y, v.z); } planet.geometry.computeVertexNormals(); }
  // the town: little white halls with coloured roofs, each waiting for its step of the loading
  const cols = [0x2f86ff, 0x2ee07a, 0xffc861, 0xff7ad9, 0x35d8d0, 0xb48cff], blds = [], up = new THREE.Vector3(0, 1, 0);
  const body = new THREE.BoxGeometry(0.16, 0.2, 0.16), roof = new THREE.ConeGeometry(0.13, 0.12, 4), white = new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.5 });
  for (let i = 1; i < 27; i++) { // (from 1: the top is the plaza's, below)
    const a = i * 2.39996, y = 1 - (i / 25) * 1.6, rr = Math.sqrt(1 - y * y), d = new THREE.Vector3(Math.cos(a) * rr, y * 0.8, Math.sin(a) * rr).normalize();
    const g = new THREE.Group(); const b = new THREE.Mesh(body, white); b.position.y = 0.1; const t = new THREE.Mesh(roof, new THREE.MeshStandardMaterial({ color: cols[i % 6], roughness: 0.4 })); t.position.y = 0.26; t.rotation.y = Math.PI / 4; g.add(b, t);
    g.position.copy(d).multiplyScalar(1.27); g.quaternion.setFromUnitVectors(up, d); g.scale.setScalar(0.001); world.add(g); blds.push({ g, at: i / 27, k: 0 });
  }
  // b-st2: on top, the plaza: the fountain rises as the plaza opens (0.8), then its four portals, one by one
  { const top = new THREE.Vector3(0, 1, 0), fg = new THREE.Group(), ft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 20), white);
    const fw = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x38c8ff, emissive: 0x1a8ad8, emissiveIntensity: 0.9 })); fw.position.y = 0.04;
    const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.2, 10), white); fp.position.y = 0.13; fg.add(ft, fw, fp);
    fg.position.copy(top).multiplyScalar(1.27); fg.scale.setScalar(0.001); world.add(fg); blds.push({ g: fg, at: 0.8, k: 0 });
    [[0x39ff88, 0.84], [0x4f9dff, 0.88], [0x38e1d6, 0.92], [0xffc861, 0.96]].forEach(([c, at], i) => {
      const a = i * (Math.PI / 2) + 0.4, d = new THREE.Vector3(Math.cos(a) * 0.28, 1, Math.sin(a) * 0.28).normalize(), g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 24), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 })); ring.position.y = 0.09; g.add(ring);
      g.position.copy(d).multiplyScalar(1.27); g.quaternion.setFromUnitVectors(up, d); g.rotateY(-a); g.scale.setScalar(0.001); world.add(g); blds.push({ g, at, k: 0 });
    }); }
  // the ARCIRCLE rings
  const glow = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.3 });
  const ra = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.035, 8, 96), glow(0x2f86ff)), rb = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.035, 8, 96), glow(0x2ee07a));
  ra.rotation.x = Math.PI / 2 + 0.3; rb.rotation.x = Math.PI / 2 - 0.25; rb.rotation.y = 0.4; scene.add(ra, rb);
  let want = 0, have = 0, raf = 0, last = performance.now(), live = true;
  /* the world is loading on the same thread, so the little planet draws at 30 frames a second (20 on a phone) */
  const gap = coarse ? 48 : 31;
  const tick = (t) => {
    if (!live) return; raf = requestAnimationFrame(tick);
    if (t - last < gap) return;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    have += (want - have) * Math.min(1, dt * 4);
    world.rotation.y += dt * (reduce ? 0.1 : 0.35); ra.rotation.z += dt * 0.5; rb.rotation.z -= dt * 0.4;
    for (const b of blds) { const goal = have >= b.at ? 1 : 0; b.k += (goal - b.k) * Math.min(1, dt * 7); b.g.scale.setScalar(Math.max(0.001, reduce ? goal : b.k * (1 + Math.sin(Math.min(1, b.k) * Math.PI) * 0.25))); }
    r.render(scene, cam);
  };
  raf = requestAnimationFrame(tick);
  return {
    set(k) { want = Math.max(want, Math.min(1, k)); },
    dispose() { live = false; cancelAnimationFrame(raf); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); r.dispose(); r.forceContextLoss && r.forceContextLoss(); r.domElement.remove(); },
  };
}
