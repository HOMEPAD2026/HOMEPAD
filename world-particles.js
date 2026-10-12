// world-particles.js — one GPU particle system for the whole fight: sparks that fall and bounce off the ground,
// streaks stretched along their flight, glowing motes, and smoke that billows, grows and thins out where it meets
// the ground. Every particle lives in a ring buffer of instanced quads; the vertex shader moves it from where and when
// it was born (no per-particle work on the CPU after it is emitted), so a big fight costs two draw calls.
//
// emit({ at, n, speed, up, spread, dir, life, size, color, color2, grav, drag, kind, jitter })
//   kind: "glow" (additive dot), "spark" (additive, bounces), "streak" (additive, stretched by speed), "smoke" (soft, alpha)
//   at is in the parent's coordinates (the world group: the world slides under you, the particles stay put)
const KIND = { glow: 0, spark: 1, smoke: 2, streak: 3 };

const VS = /* glsl */`
  attribute vec3 aP0, aV, aC0, aC1; attribute vec4 aT; attribute vec3 aG; // aT: birth, life, size, kind; aG: grav, drag, seed
  uniform float uTime, uPx; varying vec4 vC; varying vec2 vUv; varying float vKind, vK;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - aT.x, life = max(aT.y, 1e-3), k = age / life, kind = aT.w;
    vKind = kind; vK = k; vUv = position.xy + 0.5;
    #ifdef SMOKE
      bool mine = kind > 1.5 && kind < 2.5;
    #else
      bool mine = kind < 1.5 || kind > 2.5;
    #endif
    if (k < 0.0 || k > 1.0 || !mine || aT.y <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float d = max(aG.y, 1e-3), e = exp(-d * age);
    vec3 p = aP0 + aV * (1.0 - e) / d; p.y -= 0.5 * aG.x * age * age;
    vec3 vel = aV * e - vec3(0.0, aG.x * age, 0.0);
    if (kind > 0.5 && kind < 1.5 && p.y < 0.04) { p.y = 0.04 + abs(p.y - 0.04) * 0.3; vel.y = abs(vel.y) * 0.3; } // sparks bounce
    if (p.y < 0.03) p.y = 0.03;
    float size = aT.z;
    if (kind > 1.5 && kind < 2.5) size *= 0.6 + k * 1.8; // smoke grows
    else size *= 1.0 - k * 0.65;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec2 off = position.xy * size;
    if (kind > 2.5) { // a streak: long along its flight on screen, thin across
      vec3 vv = (modelViewMatrix * vec4(vel, 0.0)).xyz; vec2 dir = vv.xy; float L = length(dir);
      dir = L > 1e-4 ? dir / L : vec2(0.0, 1.0); vec2 side = vec2(-dir.y, dir.x);
      off = side * position.x * size * 0.35 + dir * position.y * (size + min(L, 30.0) * 0.045);
    } else {
      float r = aG.z * 6.2831 + age * (aG.z - 0.5) * 3.0; float c = cos(r), s = sin(r); off = mat2(c, -s, s, c) * off;
    }
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    vec3 col = mix(aC0, aC1, smoothstep(0.0, 1.0, k));
    float a = kind > 1.5 && kind < 2.5 ? (1.0 - k) * smoothstep(0.0, 0.12, k) * 0.55 * smoothstep(0.0, size * 0.45, p.y) : 1.0 - k * k;
    vC = vec4(col, a);
    vec4 mvPosition = mv;
    #include <fog_vertex>
  }`;
const FS = /* glsl */`
  varying vec4 vC; varying vec2 vUv; varying float vKind, vK;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec2 q = vUv * 2.0 - 1.0; float d = dot(q, q);
    if (d > 1.0) discard;
    float a;
    if (vKind > 1.5 && vKind < 2.5) { a = (1.0 - d) * (1.0 - d); }       // smoke: a soft round puff
    else if (vKind > 0.5 && vKind < 1.5) { a = pow(1.0 - d, 3.0) * 1.6; } // spark: a hot core
    else { a = pow(1.0 - d, 2.0); }
    vec3 c = vC.rgb;
    #ifndef SMOKE
      c *= 1.0 + pow(1.0 - d, 6.0) * 1.5; // the white-hot middle
    #endif
    gl_FragColor = vec4(c, vC.a * a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function createParticles({ THREE, parent, max = 4096, low = false }) {
  const N = low ? Math.min(max, 1024) : max;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const A = {};
  for (const [k, n] of [["aP0", 3], ["aV", 3], ["aC0", 3], ["aC1", 3], ["aT", 4], ["aG", 3]]) { A[k] = new THREE.InstancedBufferAttribute(new Float32Array(N * n), n); A[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, A[k]); }
  geo.instanceCount = N; geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const U = { uTime: { value: 0 }, uPx: { value: 1 } };
  const mk = (smoke) => {
    const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: !!smoke,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending, defines: smoke ? { SMOKE: 1 } : {} });
    m.uniforms.uTime = U.uTime; m.uniforms.uPx = U.uPx; return m;
  };
  const glowMesh = new THREE.Mesh(geo, mk(false)), smokeMesh = new THREE.Mesh(geo, mk(true));
  for (const m of [glowMesh, smokeMesh]) { m.frustumCulled = false; m.userData.noBake = true; m.renderOrder = 5; }
  glowMesh.name = "particles"; smokeMesh.name = "smoke"; smokeMesh.renderOrder = 4;
  parent.add(smokeMesh, glowMesh);
  let next = 0, lo = Infinity, hi = -1, wrapped = false, live = 0;
  const c0 = new THREE.Color(), c1 = new THREE.Color();
  const rnd = Math.random;
  function emit({ at, n = 10, speed = 4, up = 1, spread = 1, dir = null, life = 0.6, size = 0.35, color = 0xffffff, color2 = null, grav = 4, drag = 1.2, kind = "glow", jitter = 0.15 } = {}) {
    if (!at) return; if (low) n = Math.ceil(n / 2);
    const kd = KIND[kind] ?? 0; c0.set(color); c1.set(color2 == null ? color : color2);
    if (kd === 2 && color2 == null) c1.lerp(new THREE.Color(0x2a2a2a), 0.5);
    for (let i = 0; i < n; i++) {
      const j = next; next = (next + 1) % N; if (next === 0) wrapped = true;
      lo = Math.min(lo, j); hi = Math.max(hi, j);
      let vx, vy, vz;
      if (dir) { const s = speed * (0.55 + rnd() * 0.45); vx = dir.x * s + (rnd() - 0.5) * speed * spread; vy = dir.y * s + (rnd() - 0.5) * speed * spread + up * rnd() * speed * 0.3; vz = dir.z * s + (rnd() - 0.5) * speed * spread; }
      else { const a = rnd() * Math.PI * 2, r = speed * Math.sqrt(rnd()) * spread; vx = Math.cos(a) * r; vz = Math.sin(a) * r; vy = (0.4 + rnd() * 0.8) * speed * 0.6 * up; }
      A.aP0.setXYZ(j, at.x + (rnd() - 0.5) * jitter, at.y + (rnd() - 0.5) * jitter, at.z + (rnd() - 0.5) * jitter);
      A.aV.setXYZ(j, vx, vy, vz);
      A.aC0.setXYZ(j, c0.r, c0.g, c0.b); A.aC1.setXYZ(j, c1.r, c1.g, c1.b);
      A.aT.setXYZ(j, U.uTime.value, life * (0.7 + rnd() * 0.6), size * (0.6 + rnd() * 0.8)); A.aT.setW(j, kd);
      A.aG.setXYZ(j, grav, drag, rnd());
    }
    live = Math.min(N, live + n);
  }
  function flush() {
    if (hi < 0) return;
    for (const a of Object.values(A)) {
      a.clearUpdateRanges();
      if (wrapped && lo === 0 && hi >= N - 1) a.addUpdateRange(0, N * a.itemSize);
      else a.addUpdateRange(lo * a.itemSize, (hi - lo + 1) * a.itemSize);
      a.needsUpdate = true;
    }
    lo = Infinity; hi = -1; wrapped = false;
  }
  return {
    emit, glowMesh, smokeMesh,
    // ready-made looks
    burst(at, color, o = {}) { emit({ at, kind: "glow", n: 14, speed: 4.5, size: 0.38, life: 0.55, grav: 5, ...o, color }); emit({ at, kind: "spark", n: Math.ceil((o.n || 14) * 0.6), speed: 7, size: 0.16, life: 0.6, grav: 16, drag: 0.6, color: 0xfff2c8, color2: color }); },
    sparks(at, color = 0xffd27a, n = 16, dir = null) { emit({ at, kind: "streak", n, speed: 9, size: 0.12, life: 0.45, grav: 18, drag: 0.8, dir, spread: dir ? 0.6 : 1, color: 0xfff6d8, color2: color }); },
    smoke(at, color = 0x8a8f99, n = 8, size = 1.2) { emit({ at, kind: "smoke", n, speed: 1.4, up: 1.4, size, life: 1.6, grav: -1.2, drag: 1.6, color, jitter: 0.6 }); },
    tick(dt) { U.uTime.value += dt; flush(); },
    setVisible(v) { glowMesh.visible = smokeMesh.visible = v; },
  };
}
