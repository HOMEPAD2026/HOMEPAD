// world-ambient.js — the things that make the world feel lived in without asking anything of you: mountain ranges on
// the horizon (two layers fading into the haze), a flock of birds circling over the town, butterflies over the
// meadow by day, and fish turning under the fountain's water. Cheap meshes and per-frame maths; nothing on Low.
const TAU = Math.PI * 2;
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };

export function createAmbient({ THREE, planet, low = false, fountainY = 0.3, bats = false }) {
  const root = new THREE.Group(); root.name = "ambient"; root.userData.noBake = true; planet.add(root);

  /* the horizon: two rings of mountains, the far one paler, both melting into the fog colour */
  const hazeU = { value: new THREE.Color(0xbcd0e0) }, mts = [];
  for (const [rad, h0, h1, col, seed, haze] of [[540, 30, 95, 0x4a9468, 3, 0.28], [640, 55, 150, 0x6a9ccc, 9, 0.48]]) { // b420: green near, blue far, less haze (clear key-art distance)
    const segs = 220, pos = [], idx = [], ys = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU, n = vnoise(i * 0.09 + seed * 10) * 0.65 + vnoise(i * 0.31 + seed) * 0.35, h = h0 + (h1 - h0) * Math.pow(n, 1.6);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad; pos.push(x, -12, z, x, h, z); ys.push(0, 1);
    }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("t", new THREE.Float32BufferAttribute(ys, 1)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(col) }, uHaze: hazeU, uK: { value: haze }, uLight: { value: 1 } }, side: THREE.DoubleSide, fog: false,
      vertexShader: "attribute float t; varying float vT; void main(){ vT = t; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 uCol, uHaze; uniform float uK, uLight; varying float vT;
        void main(){ vec3 c = uCol * uLight * mix(0.8, 1.12, vT); c = mix(c, uHaze, mix(uK + 0.25, uK, vT)); gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -0.5; root.add(m); mts.push(mat);
  }

  /* birds: two little wings each, circling high over the town in a loose flock (two instanced meshes: left and right wings) */
  const birds = [], NB = low ? 0 : 11;
  const wingG = new THREE.BufferGeometry(); wingG.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.18, 0.75, 0, 0.05], 3)); wingG.computeVertexNormals();
  const bm = new THREE.MeshBasicMaterial({ color: 0x2a3446, side: THREE.DoubleSide, fog: true });
  const bL = new THREE.InstancedMesh(wingG, bm, Math.max(1, NB)), bR = new THREE.InstancedMesh(wingG, bm, Math.max(1, NB)); bL.count = bR.count = NB; bL.frustumCulled = bR.frustumCulled = false; root.add(bL, bR);
  for (let i = 0; i < NB; i++) birds.push({ s: 1.1 + hash(i) * 0.5, ph: hash(i + 3) * TAU, off: new THREE.Vector3((hash(i + 7) - 0.5) * 14, (hash(i + 9) - 0.5) * 5, (hash(i + 11) - 0.5) * 14) });

  /* butterflies: by day, over the meadow round you (two instanced meshes, a colour each) */
  const flies = [], NF = low ? 0 : 14;
  const wg = new THREE.CircleGeometry(0.11, 10); wg.translate(0.1, 0, 0); wg.rotateX(-Math.PI / 2);
  const fm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true });
  const fL = new THREE.InstancedMesh(wg, fm, Math.max(1, NF)), fR = new THREE.InstancedMesh(wg, fm, Math.max(1, NF)); fL.count = fR.count = NF; fL.frustumCulled = fR.frustumCulled = false; root.add(fL, fR);
  { const cols = [0xffc861, 0xff7ad9, 0x8fe6ff, 0xffffff, 0xb48cff], c = new THREE.Color(); for (let i = 0; i < NF; i++) { c.set(cols[i % cols.length]); fL.setColorAt(i, c); fR.setColorAt(i, c); } }
  for (let i = 0; i < NF; i++) flies.push({ ph: hash(i * 3.1) * TAU, rad: 4 + hash(i * 5.3) * 9, sp: 0.3 + hash(i * 2.7) * 0.4, home: new THREE.Vector3(), set: false });

  /* fish: dark shapes turning slowly under the fountain's water */
  const fish = [];
  if (!low) {
    const fg = new THREE.CircleGeometry(0.28, 14); fg.scale(1, 0.38, 1); fg.rotateX(-Math.PI / 2);
    const fm = new THREE.MeshBasicMaterial({ color: 0x0a2a3a, transparent: true, opacity: 0.45, depthWrite: false });
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(fg, fm); m.position.y = fountainY - 0.05; m.userData = { r: 2.4 + hash(i) * 1.2, ph: i * 1.3, sp: 0.25 + hash(i + 2) * 0.2 }; m.renderOrder = 0; root.add(m); fish.push(m); }
  }

  const v = new THREE.Vector3(), mB = new THREE.Matrix4(), mW = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  // one wing: the body's place and heading, then the wing's own flap (and a mirror for the right one)
  function place(im, i, p, yaw, s, flap, side) { e.set(0, yaw, 0); q.setFromEuler(e); mB.compose(p, q, sc.set(s * side, s, s)); mW.makeRotationZ(flap * side); im.setMatrixAt(i, mB.multiply(mW)); }
  return {
    root,
    /// px, pz: you (the world group's coordinates); night 0…1; haze: the fog colour
    tick(dt, t, px, pz, night, haze, inGround = false) {
      if (haze) hazeU.value.copy(haze);
      for (const m of mts) m.uniforms.uLight.value = 1 - night * 0.7;
      const day = night < 0.6;
      // the flock circles a point over the town, each bird a little off the line, wings beating then gliding
      // Halloween nights: the flock comes back as bats, lower, quicker and less orderly
      const bat = bats && !day; bL.visible = bR.visible = day || bat; bm.color.set(bat ? 0x150c1e : 0x2a3446);
      if (day || bat) { birds.forEach((u, i) => { const a = t * (bat ? 0.16 : 0.07) + u.ph * 0.05, R = bat ? 34 + Math.sin(t * 0.9 + u.ph) * 6 : 70; v.set(Math.cos(a) * R, (bat ? 18 : 44) + Math.sin(t * (bat ? 1.7 : 0.3) + u.ph) * (bat ? 3 : 2), Math.sin(a) * R).add(u.off);
        const flap = bat ? Math.sin(t * 22 + u.ph) * 0.9 : Math.sin(t * 9 + u.ph) * (Math.sin(t * 0.7 + u.ph) > 0 ? 0.7 : 0.12); place(bL, i, v, -a, u.s * (bat ? 0.8 : 1), flap, 1); place(bR, i, v, -a, u.s * (bat ? 0.8 : 1), -flap, -1); });
        if (NB) { bL.instanceMatrix.needsUpdate = true; bR.instanceMatrix.needsUpdate = true; } }
      // butterflies wander in loops round a spot near you (not in the hunting grounds); a spot left far behind moves to you
      const fly = day && !inGround; fL.visible = fR.visible = fly;
      if (fly) { flies.forEach((u, i) => {
        if (!u.set || Math.hypot(u.home.x - px, u.home.z - pz) > 22) { u.home.set(px + (hash(u.ph * 9 + t) - 0.5) * 16, 0, pz + (hash(u.ph * 7 + t) - 0.5) * 16); u.set = true; }
        const a = t * u.sp + u.ph; v.set(u.home.x + Math.cos(a) * u.rad * 0.4 + Math.sin(a * 2.3) * 0.8, 0.7 + Math.sin(t * 1.7 + u.ph) * 0.35, u.home.z + Math.sin(a * 1.3) * u.rad * 0.4);
        const w = Math.sin(t * 22 + u.ph) * 1.1; place(fL, i, v, -a, 1, w, 1); place(fR, i, v, -a, 1, -w, -1); });
        if (NF) { fL.instanceMatrix.needsUpdate = true; fR.instanceMatrix.needsUpdate = true; } }
      for (const m of fish) { const u = m.userData, a = t * u.sp + u.ph; m.position.x = Math.cos(a) * u.r; m.position.z = Math.sin(a) * u.r; m.rotation.y = -a - Math.PI / 2 + Math.sin(t * 3 + u.ph) * 0.15; }
    },
  };
}
