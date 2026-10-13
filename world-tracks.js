// world-tracks.js — small touches on the ground and in the air round you:
//   footprints   in snow and sand (Ponzi Peaks, the Exit-Scam Desert, Rug Canyon): a print every step, fading
//   leaves       in autumn (October and November, Seoul time; ?leaves=1): red and gold leaves drifting down round you
// One instanced mesh each, a fixed number, so they cost the same whatever happens.
export function createTracks({ THREE, planet, reduce = false }) {
  // ---- footprints: a soft oval print, pressed in (darker) ----
  const N = 48, cv = document.createElement("canvas"); cv.width = 64; cv.height = 64; const g = cv.getContext("2d");
  const gr = g.createRadialGradient(32, 30, 4, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,.8)"); gr.addColorStop(0.6, "rgba(255,255,255,.4)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.beginPath(); g.ellipse(32, 32, 18, 28, 0, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv), pg = new THREE.PlaneGeometry(0.26, 0.38); pg.rotateX(-Math.PI / 2);
  const pm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff, opacity: 1 });
  const prints = new THREE.InstancedMesh(pg, pm, N); prints.instanceMatrix.setUsage(THREE.DynamicDrawUsage); prints.frustumCulled = false; prints.renderOrder = -1;
  prints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); planet.add(prints);
  const born = new Float32Array(N).fill(-99), PX = new Float32Array(N), PZ = new Float32Array(N), PF = new Float32Array(N); let next = 0, side = 1;
  const o = new THREE.Object3D(), col = new THREE.Color();
  o.scale.setScalar(0); o.updateMatrix(); for (let i = 0; i < N; i++) { prints.setMatrixAt(i, o.matrix); prints.setColorAt(i, col.set(0xffffff)); } o.scale.setScalar(1);
  function step(x, z, facing, tint) {
    if (reduce) return; side = -side; const ox = Math.cos(facing) * 0.13 * side, oz = -Math.sin(facing) * 0.13 * side;
    PX[next] = x + ox; PZ[next] = z + oz; PF[next] = facing;
    o.position.set(PX[next], 0.035, PZ[next]); o.rotation.set(0, facing, 0); o.scale.setScalar(1); o.updateMatrix(); prints.setMatrixAt(next, o.matrix);
    prints.setColorAt(next, col.set(tint)); born[next] = performance.now() / 1000; next = (next + 1) % N; prints.instanceMatrix.needsUpdate = true; prints.instanceColor.needsUpdate = true;
  }
  // ---- leaves: little bent quads spinning down round a point that follows you ----
  const L = 60, lg = new THREE.PlaneGeometry(0.16, 0.12, 2, 1); { const p = lg.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.4); lg.computeVertexNormals(); }
  const lm = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
  const leaves = new THREE.InstancedMesh(lg, lm, L); leaves.frustumCulled = false; leaves.visible = false; leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage); planet.add(leaves);
  const LC = [0xd8562a, 0xe8a23a, 0xc0392b, 0xf2c14e, 0x9a4a2a], lp = Array.from({ length: L }, () => ({ x: 0, y: -1, z: 0, s: Math.random() * 6, v: 0.6 + Math.random() * 0.6 }));
  lp.forEach((p, i) => leaves.setColorAt(i, col.set(LC[i % LC.length])));
  const autumn = (() => { try { const q = new URLSearchParams(location.search).get("leaves"); if (q) return q === "1"; } catch { /* fine */ } const m = new Date(Date.now() + 9 * 3600e3).getUTCMonth() + 1; return m === 10 || m === 11; })();
  return {
    step,
    /// dt, where you are (planet-local x, z), whether leaves may fall here (the town, not a ground), the time
    tick(dt, x, z, inTown) {
      const now = performance.now() / 1000;
      // prints shrink away between five and eight seconds old
      let ch = false;
      for (let i = 0; i < N; i++) { const a = now - born[i]; if (a < 5 || a > 8.2) continue; const k = Math.max(0, 1 - (a - 5) / 3); o.position.set(PX[i], 0.035, PZ[i]); o.rotation.set(0, PF[i], 0); o.scale.set(k, 1, k); o.updateMatrix(); prints.setMatrixAt(i, o.matrix); ch = true; }
      if (ch) prints.instanceMatrix.needsUpdate = true;
      leaves.visible = autumn && inTown && !reduce;
      if (!leaves.visible) return;
      for (let i = 0; i < L; i++) {
        const p = lp[i];
        if (p.y <= 0.02 || Math.hypot(p.x - x, p.z - z) > 16) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 13; p.x = x + Math.cos(a) * r; p.z = z + Math.sin(a) * r; p.y = 5 + Math.random() * 5; }
        p.s += dt; p.y -= p.v * dt; p.x += Math.sin(p.s * 1.7 + i) * dt * 0.7; p.z += Math.cos(p.s * 1.3 + i) * dt * 0.5 + dt * 0.25;
        o.position.set(p.x, p.y, p.z); o.rotation.set(p.s * 2.1, p.s * 1.3 + i, Math.sin(p.s * 3) * 0.8); o.updateMatrix(); leaves.setMatrixAt(i, o.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;
    },
  };
}
