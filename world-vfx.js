// world-vfx.js — the game's light effects, drawn with shaders rather than models: portals with a turning swirl,
// teleport beams, the level-up pillar, a chest bursting open, skill impacts, a summoning circle, pick-up sparkles, buff
// arrows and a hex shield. Every effect is layers of the same few pieces — a bright core, an outer glow, flowing noise,
// sparks (GPU particles) and a rune circle on the ground — in colours above 1.0 so the bloom catches them.
//
// createVfx({ THREE, st, planet, player, low, reduce }) → { tick(dt), portal(g, o), teleport(p, o), rise(p),
//   levelUp(), chest(p), impact(p, kind, o), summon(p, boss), collect(p, color), buff(color), shield(on), count() }
// Positions are in the planet's frame (where the halls and the scammers live); levelUp, buff and shield follow you.

const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }`;

export function createVfx(ctx) {
  const { THREE, st, planet, player } = ctx;
  const low = !!ctx.low, reduce = !!ctx.reduce;
  const U = { uTime: { value: 0 }, uScale: { value: 600 } }; // shared by every effect
  const live = [], keep = [];
  const hdr = (c, k = 2.2) => new THREE.Color(c).multiplyScalar(k);
  const GOLD = 0xffa733, GOLD2 = 0xffc04d;

  // ---------------- materials ----------------
  const base = (uniforms, vertexShader, fragmentShader, o = {}) => new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uTime: U.uTime, uScale: U.uScale }, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: o.side ?? THREE.DoubleSide,
  });
  const UV_VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
  // a column of light: brightest at the foot, streaks of noise climbing it, glowing at its edges
  const beamMat = (color, o = {}) => base({ uColor: { value: hdr(color, o.k || 1.5) }, uFade: { value: 1 }, uSpeed: { value: o.speed || 2.2 } }, UV_VERT, `${NOISE}
    uniform vec3 uColor; uniform float uFade, uTime, uSpeed; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ float v = vUv.y; float s = fbm(vec2(vUv.x * 10.0, v * 3.0 - uTime * uSpeed));
      float edge = 1.0 - abs(dot(vN, vV)); float a = smoothstep(0.0, 0.08, v) * pow(1.0 - v, 1.6) * (0.25 + 0.75 * s) * (0.35 + 0.9 * edge);
      gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 * (1.0 - v)) , a * uFade); }`);
  // (normal blending with colours a little above 1.0: on a sunny, white town, added light only washes out to white, while
// laid-over colour keeps its hue and the brightest parts still bloom)
// a ring that grows across the ground (a shockwave)
  const ringMat = (color) => base({ uColor: { value: hdr(color, 1.7) }, uR: { value: 0.2 }, uW: { value: 0.12 }, uFade: { value: 1 } }, UV_VERT, `
    uniform vec3 uColor; uniform float uR, uW, uFade; varying vec2 vUv;
    void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(uR - uW, uR, r) * (1.0 - smoothstep(uR, uR + uW * 0.35, r));
      a += 0.18 * (1.0 - smoothstep(0.0, uR, r)) * step(r, uR); gl_FragColor = vec4(uColor, a * uFade); }`);
  // the portal's disc: noise wound into a spiral, a white-hot middle, soft at the rim
  const swirlMat = (a, b) => base({ uA: { value: hdr(a, 1.15) }, uB: { value: hdr(b, 1.3) }, uFade: { value: 1 }, uSeed: { value: Math.random() * 10 } }, UV_VERT, `${NOISE}
    uniform vec3 uA, uB; uniform float uFade, uTime, uSeed; varying vec2 vUv;
    void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float an = atan(c.y, c.x);
      float tw = an + r * 4.5 - uTime * 1.6 + uSeed; vec2 q = vec2(cos(tw), sin(tw)) * (1.2 + r * 1.6);
      float s = fbm(q * 1.4 + vec2(uTime * 0.25, uSeed)); float arms = 0.5 + 0.5 * sin(tw * 2.0 + s * 5.0);
      float core = exp(-r * r * 9.0); float m = clamp(s * 1.2 + arms * 0.35, 0.0, 1.0);
      vec3 col = mix(uA * 0.6, uB, m * m) + vec3(1.0) * core * 0.9; float a = (0.12 + m * 0.75 + core * 0.7) * (1.0 - smoothstep(0.8, 1.0, r));
      gl_FragColor = vec4(col, a * uFade); }`);
  // a geodesic dome: bright edges, a glowing rim (fresnel) and a scan line sweeping up
  const hexMat = (color) => base({ uColor: { value: hdr(color, 2.0) }, uFade: { value: 1 } }, `attribute vec3 aBary; varying vec3 vB; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vB = aBary; vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`, `
    uniform vec3 uColor; uniform float uFade, uTime; varying vec3 vB; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ float e = min(vB.x, min(vB.y, vB.z)); float line = 1.0 - smoothstep(0.0, 0.05, e);
      float fr = pow(1.0 - abs(dot(vN, vV)), 2.5); float scan = (1.0 - smoothstep(0.0, 0.12, abs(vY - (fract(uTime * 0.45) * 2.2 - 0.6))));
      float a = line * 0.65 + fr * 0.55 + scan * 0.35 + 0.04; gl_FragColor = vec4(uColor * (0.7 + line * 0.6 + scan), a * uFade); }`, { add: true });
  // sparks: each one launched with its own speed and delay, worked out on the GPU from the effect's age
  const sparkMat = (color, o = {}) => base({ uColor: { value: hdr(color, o.k || 1.8) }, uAge: { value: 0 }, uG: { value: o.grav ?? -1.5 }, uSize: { value: o.size || 0.18 }, uLoop: { value: o.loop ? 1 : 0 }, uFade: { value: 1 } }, `
    attribute vec3 aV; attribute vec2 aT; uniform float uAge, uG, uSize, uScale, uLoop, uTime; varying float vA;
    void main(){ float t = uLoop > 0.5 ? mod(uTime + aT.x, aT.y) : uAge - aT.x; float k = t / aT.y;
      if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
      vec3 p = position + aV * t + vec3(0.0, 0.5 * uG * t * t, 0.0); vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv; gl_PointSize = uSize * (1.0 - k * 0.6) * uScale / max(0.5, -mv.z); vA = sin(k * 3.14159); }`, `
    uniform vec3 uColor; uniform float uFade; varying float vA;
    void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = (1.0 - smoothstep(0.0, 0.5, d)); a *= a;
      gl_FragColor = vec4(mix(uColor, vec3(1.0), (1.0 - smoothstep(0.0, 0.18, d))), a * vA * uFade); }`, { side: THREE.FrontSide });

  // ---------------- textures drawn once ----------------
  const canvasTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // the rune circle: rings, ticks and small marks round the edge (white; each effect tints it)
  const RUNE = canvasTex(512, 512, (g, w) => {
    const c = w / 2; g.translate(c, c); g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 10;
    const circle = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    circle(240, 6); circle(222, 2); circle(150, 3); circle(70, 2);
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, l = i % 6 === 0 ? 18 : 8; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a) * 222, Math.sin(a) * 222); g.lineTo(Math.cos(a) * (222 - l), Math.sin(a) * (222 - l)); g.stroke(); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.save(); g.rotate(a); g.translate(0, -186); // a mark between the rings
      g.beginPath(); if (i % 3 === 0) { g.moveTo(0, -12); g.lineTo(9, 0); g.lineTo(0, 12); g.lineTo(-9, 0); g.closePath(); g.fill(); } else { g.lineWidth = 3; g.moveTo(-8, -8); g.lineTo(0, 8); g.lineTo(8, -8); g.stroke(); } g.restore(); }
    g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * 150, y = Math.sin(a) * 150; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); // a hexagon
    g.beginPath(); for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * 150, y = Math.sin(a) * 150; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); // and a triangle in it
  });
  const GLOW = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.85)"); r.addColorStop(0.7, "rgba(255,255,255,.25)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const ARROW = canvasTex(128, 192, (g) => { g.shadowColor = "#fff"; g.shadowBlur = 14; g.fillStyle = "#fff"; g.beginPath(); g.moveTo(64, 14); g.lineTo(112, 74); g.lineTo(80, 74); g.lineTo(80, 176); g.lineTo(48, 176); g.lineTo(48, 74); g.lineTo(16, 74); g.closePath(); g.fill(); });
  const RAY = canvasTex(64, 256, (g, w, h) => { const r = g.createLinearGradient(0, h, 0, 0); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.beginPath(); g.moveTo(w / 2 - 6, h); g.lineTo(0, 0); g.lineTo(w, 0); g.lineTo(w / 2 + 6, h); g.closePath(); g.fill(); });

  // ---------------- pieces ----------------
  const plane = new THREE.PlaneGeometry(1, 1), beamGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const rune = (color, r) => { const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: RUNE, color: hdr(color, 1.7), transparent: true, depthWrite: false, opacity: 1 })); m.rotation.x = -Math.PI / 2; m.scale.set(r * 2, r * 2, 1); m.position.y = 0.06; return m; };
  const sprite = (tex, color, s, k = 1.6) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: hdr(color, k), transparent: true, depthWrite: false })); m.scale.set(s, s, 1); return m; };
  const beam = (color, r, h, o) => { const m = new THREE.Mesh(beamGeo, beamMat(color, o)); m.scale.set(r, h, r); return m; };
  const shock = (color, r) => { const m = new THREE.Mesh(plane, ringMat(color)); m.rotation.x = -Math.PI / 2; m.scale.set(r * 2, r * 2, 1); m.position.y = 0.08; return m; };
  // n sparks from a ring of radius r0, flying out/up; o: { up, out, spread, life, delay, grav, size, loop }
  function sparks(color, n, o = {}) {
    n = Math.max(4, Math.round(n * (low ? 0.45 : 1)));
    const pos = new Float32Array(n * 3), v = new Float32Array(n * 3), t = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = (o.r0 || 0) * (0.4 + Math.random() * 0.6);
      pos.set([Math.cos(a) * r, (o.y0 || 0) + Math.random() * (o.yJit || 0), Math.sin(a) * r], i * 3);
      const out = (o.out ?? 2) * (0.3 + Math.random()), up = (o.up ?? 3) * (0.5 + Math.random() * 0.8), sp = o.spread ? (Math.random() - 0.5) * o.spread : 0;
      v.set([Math.cos(a + sp) * out, up, Math.sin(a + sp) * out], i * 3);
      t.set([Math.random() * (o.delay ?? 0.25), (o.life || 1) * (0.6 + Math.random() * 0.5)], i * 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aV", new THREE.BufferAttribute(v, 3)); g.setAttribute("aT", new THREE.BufferAttribute(t, 2));
    const p = new THREE.Points(g, sparkMat(color, o)); p.frustumCulled = false; p.userData.own = true; return p;
  }
  // an effect that plays once: tick(k, t) with k going 0 → 1 over life seconds, then it's removed
  function once(parent, at, life, build) {
    if (reduce) return null;
    const g = new THREE.Group(); if (at) g.position.copy(at); parent.add(g);
    const parts = build(g) || {};
    const e = { g, life, t: 0, tick: parts.tick, parent }; live.push(e); return e;
  }
  const fade = (o, a) => o.traverse((m) => { if (!m.material) return; const u = m.material.uniforms; if (u && u.uFade) u.uFade.value = a; else m.material.opacity = a; });
  function drop(e) { e.parent.remove(e.g); e.g.traverse((m) => { if (m.userData.own && m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); }

  // ---------------- the effects ----------------
  // 06 teleport: a beam drops in, the circle turns, sparks climb; colour by where you're going
  function teleport(at, o = {}) {
    const c = o.color || 0x38e8ff, c2 = o.color2 || 0x2f86ff;
    return once(planet, at, 1.5, (g) => {
      const b1 = beam(c, 1.0, 7, { speed: 3.5 }), b2 = beam(0xffffff, 0.45, 9, { k: 1.25, speed: 5 }), rn = rune(c2, 2.4), sh = shock(c, 3.2), sp = sparks(c, 70, { r0: 1.2, up: 5, out: 0.4, life: 1.1, grav: -1 }), gl = sprite(GLOW, c, 4);
      gl.position.y = 1.2; g.add(b1, b2, rn, sh, sp, gl); rn.position.y = 0.2;
      const halos = [0, 1, 2].map(() => { const h = shock(c, 1.5); h.material.uniforms.uR.value = 0.9; h.material.uniforms.uW.value = 0.18; g.add(h); return h; });
      return { tick: (k) => { const inn = Math.min(1, k * 6), out = 1 - Math.max(0, (k - 0.55) / 0.45); b1.scale.set(1.0 * (1 - k * 0.5), 7 * inn, 1.0 * (1 - k * 0.5)); b2.scale.set(0.45 * out, 9 * inn, 0.45 * out); fade(b1, out); fade(b2, out);
        rn.rotation.z = k * 2.5; fade(rn, out); sh.material.uniforms.uR.value = 0.15 + k * 0.85; fade(sh, 1 - k); sp.material.uniforms.uAge.value = k * 1.5; gl.material.opacity = Math.sin(Math.min(1, k * 3) * Math.PI) * 0.9;
        halos.forEach((h, i) => { const kk = (k * 1.6 + i / 3) % 1; h.position.y = 0.3 + kk * 5.5; h.scale.setScalar(3 * (1 - kk * 0.45)); fade(h, Math.sin(kk * Math.PI) * out); }); } };
    });
  }
  // 22 rise: back on your feet — a green pillar and wings of light
  const rise = (at) => teleport(at, { color: 0x39ff88, color2: 0x2ee07a });
  // 09 level up: a gold pillar on you, arrows climbing, the circle under your feet
  function levelUp() {
    return once(player, null, 2.0, (g) => {
      const b = beam(GOLD, 1.1, 6, { speed: 3 }), rn = rune(GOLD, 2.2), sh = shock(GOLD2, 3.4), sp = sparks(GOLD2, 80, { r0: 1.4, up: 4.5, out: 0.5, life: 1.4, grav: -0.6, delay: 0.6 });
      const arrows = [0, 1, 2].map((i) => { const a = sprite(ARROW, GOLD2, 0.8, 2.2); a.scale.set(0.6, 0.9, 1); a.position.set(Math.cos(i * 2.1) * 1.1, 0.4, Math.sin(i * 2.1) * 1.1); g.add(a); return a; });
      g.add(b, rn, sh, sp);
      return { tick: (k) => { const out = 1 - Math.max(0, (k - 0.6) / 0.4); b.scale.set(1.1, 6 * Math.min(1, k * 5), 1.1); fade(b, out * 0.9); rn.rotation.z = -k * 3; rn.scale.setScalar(4.4 * (0.6 + Math.min(1, k * 4) * 0.4)); fade(rn, out);
        sh.material.uniforms.uR.value = 0.1 + Math.min(1, k * 2) * 0.9; fade(sh, 1 - Math.min(1, k * 2)); sp.material.uniforms.uAge.value = k * 2;
        arrows.forEach((a, i) => { const kk = Math.max(0, Math.min(1, (k - i * 0.12) / 0.6)); a.position.y = 0.4 + kk * 4; a.material.opacity = Math.sin(kk * Math.PI); }); } };
    });
  }
  // 08 reward chest: a flash, rays fanning up out of the lid, gold sparks raining down around it
  function chest(at) {
    return once(planet, at, 1.6, (g) => {
      const gl = sprite(GLOW, GOLD2, 3.5, 3); gl.position.y = 1.1; g.add(gl);
      const rays = []; for (let i = 0; i < 9; i++) { const r = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: RAY, color: hdr(GOLD, 1.6), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        r.geometry = plane; const piv = new THREE.Group(); piv.position.y = 0.9; piv.rotation.y = (i / 9) * Math.PI * 2; r.position.y = 1.4; r.scale.set(0.5, 2.8, 1); piv.rotation.z = 0.35 + Math.random() * 0.25; piv.add(r); g.add(piv); rays.push(r); }
      const sp = sparks(GOLD, 60, { y0: 1, out: 2.6, up: 5, life: 1.2, grav: -9, size: 0.16 }), sh = shock(GOLD2, 2.4);
      g.add(sp, sh);
      return { tick: (k) => { gl.material.opacity = Math.max(0, 1 - k * 1.6); gl.scale.setScalar(3.5 + k * 3); rays.forEach((r, i) => { r.material.opacity = Math.sin(Math.min(1, k * 1.3) * Math.PI) * (0.6 + 0.4 * Math.sin(i * 1.7 + k * 12)); r.scale.y = 2.8 * (0.5 + Math.min(1, k * 3) * 0.5); });
        sp.material.uniforms.uAge.value = k * 1.6; sh.material.uniforms.uR.value = 0.2 + k * 0.8; fade(sh, 1 - k); } };
    });
  }
  // 10 skill impact: a hot flash, a shockwave on the ground, sparks thrown out (ice glitters, fire climbs, shock crackles)
  const IMPACT = { ice: [0x8fe6ff, 0xcff6ff, -6], fire: [0xff7a2a, GOLD2, 2], shock: [0xb48cff, 0xe6d8ff, -3], meteor: [0xff7a2a, GOLD, -4], hit: [0xffffff, 0xffe8b0, -6] };
  function impact(at, kind = "hit", o = {}) {
    const [c, c2, grav] = IMPACT[kind] || IMPACT.hit, big = o.big || 1;
    return once(planet, at, kind === "meteor" ? 1.1 : 0.75, (g) => {
      const gl = sprite(GLOW, c, 2.4 * big, 1.5), hot = sprite(GLOW, c2, 1.1 * big, 2.2); g.add(gl, hot); // a coloured flash with a white-hot middle
      const sh = shock(c, (kind === "meteor" ? 5.5 : 2.4) * big); sh.position.y = 0.1 - at.y; g.add(sh);
      const sp = sparks(c, kind === "meteor" ? 80 : 46, { out: 5 * big, up: kind === "fire" ? 3.5 : 2, spread: 0.6, life: 0.65, grav, delay: 0.05, size: kind === "ice" ? 0.2 : 0.28 });
      g.add(sp);
      const rn = kind === "meteor" ? rune(c, 4.5 * big) : null; if (rn) { rn.position.y = 0.07 - at.y; g.add(rn); }
      return { tick: (k) => { gl.material.opacity = Math.max(0, 1 - k * 1.6); gl.scale.setScalar(2.4 * big * (1 + k * 1.5)); hot.material.opacity = Math.max(0, 1 - k * 3); hot.scale.setScalar(1.1 * big * (1 + k)); sh.material.uniforms.uR.value = 0.1 + Math.sqrt(k) * 0.9; fade(sh, 1 - k);
        sp.material.uniforms.uAge.value = k * 0.75; if (rn) { rn.rotation.z = k * 2; fade(rn, 1 - k); } } };
    });
  }
  // 07 summon: the circle opens wide and turns, a thin beam and dark-red sparks — a boss (or an elite) arrives
  function summon(at, boss) {
    const c = boss ? 0xff4d6d : GOLD, r = boss ? 4.2 : 2.2;
    return once(planet, at, boss ? 2.4 : 1.6, (g) => {
      const rn = rune(c, r), rn2 = rune(c, r * 0.62), sh = shock(c, r * 1.4), b = beam(c, r * 0.35, boss ? 9 : 5, { speed: 4 }), sp = sparks(c, boss ? 90 : 40, { r0: r, up: 3, out: -0.6, life: 1.2, grav: 0.5, delay: 0.8 });
      g.add(rn, rn2, sh, b, sp);
      return { tick: (k) => { const inn = Math.min(1, k * 3), out = 1 - Math.max(0, (k - 0.6) / 0.4); rn.scale.setScalar(r * 2 * inn); rn.rotation.z = k * 2; rn2.rotation.z = -k * 3.2; rn2.scale.setScalar(r * 1.24 * inn); fade(rn, out); fade(rn2, out);
        sh.material.uniforms.uR.value = 0.2 + k * 0.8; fade(sh, 1 - k); b.scale.set(r * 0.35 * out, (boss ? 9 : 5) * inn, r * 0.35 * out); fade(b, out * 0.8); sp.material.uniforms.uAge.value = k * (boss ? 2.4 : 1.6); } };
    });
  }
  // 20 collect: a ring and a twist of sparkles where you picked something up
  function collect(at, color = GOLD) {
    return once(planet, at, 0.8, (g) => {
      const sh = shock(color, 1.4); sh.position.y = 0.1 - at.y; const sp = sparks(color, 24, { r0: 0.5, up: 3.5, out: 0.6, spread: 2, life: 0.7, grav: -2, size: 0.14 }), gl = sprite(GLOW, color, 1.6, 2.6);
      g.add(sh, sp, gl);
      return { tick: (k) => { sh.material.uniforms.uR.value = 0.1 + k * 0.9; fade(sh, 1 - k); sp.material.uniforms.uAge.value = k * 0.8; gl.material.opacity = Math.max(0, 1 - k * 2); } };
    });
  }
  // 16 buff: two arrows and a small circle in the buff's colour, on you
  function buff(color = 0x39ff88) {
    return once(player, null, 1.3, (g) => {
      const rn = rune(color, 1.4), sp = sparks(color, 30, { r0: 0.9, up: 3, out: 0.2, life: 1, grav: -0.5, size: 0.14 });
      const arrows = [-1, 1].map((s) => { const a = sprite(ARROW, color, 0.6, 2.2); a.scale.set(0.45, 0.68, 1); a.position.set(s * 0.75, 0.5, 0.3); g.add(a); return a; });
      g.add(rn, sp);
      return { tick: (k) => { rn.rotation.z = k * 3; fade(rn, 1 - k); sp.material.uniforms.uAge.value = k * 1.3; arrows.forEach((a, i) => { const kk = Math.max(0, Math.min(1, (k - i * 0.15) / 0.7)); a.position.y = 0.5 + kk * 2.6; a.material.opacity = Math.sin(kk * Math.PI); }); } };
    });
  }
  // 15 shield: a hex dome around you while it lasts (on/off); it pops in and fades out
  let dome = null, domeK = 0, domeOn = false;
  function shield(on) {
    domeOn = !!on;
    if (on && !dome) {
      const geo = new THREE.IcosahedronGeometry(1.45, 2).toNonIndexed(), n = geo.attributes.position.count, bary = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) bary[i * 3 + (i % 3)] = 1;
      geo.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));
      dome = new THREE.Mesh(geo, hexMat(0x4fa8ff)); dome.position.y = 1.05; dome.scale.set(1, 1.15, 1); dome.userData.own = true; player.add(dome); domeK = 0;
    }
  }
  function tickDome(dt) {
    if (!dome) return;
    domeK = Math.max(0, Math.min(1, domeK + (domeOn ? dt * 4 : -dt * 2.5)));
    const pop = domeOn ? 1 + Math.sin(Math.min(1, domeK) * Math.PI) * 0.12 : domeK;
    dome.scale.set(pop, 1.15 * pop, pop); dome.material.uniforms.uFade.value = domeK; dome.rotation.y += dt * 0.3;
    if (!domeOn && domeK <= 0) { player.remove(dome); dome.geometry.dispose(); dome.material.dispose(); dome = null; }
  }
  // 01 / 02 / 04 portals: a turning swirl in each ring of the gate, a rune circle at its foot, sparks rising slowly
  function portal(g, o = {}) {
    const rings = g.children.filter((m) => m.isMesh && m.geometry && m.geometry.type === "TorusGeometry");
    const cols = o.colors || [[0x2f86ff, 0x38e8ff], [0x2ee07a, 0x9fffd0]];
    rings.forEach((r, i) => { const [a, b] = cols[i % cols.length]; const d = new THREE.Mesh(plane, swirlMat(a, b)); d.scale.set(2.75, 2.75, 1); d.position.copy(r.position); d.position.z += (i ? -0.01 : 0.01); g.add(d); keep.push(d); });
    const veil = g.children.find((m) => m.isMesh && m.geometry && m.geometry.type === "CircleGeometry"); if (veil) veil.visible = false; // the old flat veil
    const rn = rune(cols[0][1], 3.2); g.add(rn); keep.push(rn);
    const sp = sparks(cols[0][1], 40, { r0: 3, up: 1.2, out: -0.25, life: 3, grav: 0.2, loop: true, size: 0.12, delay: 3 }); g.add(sp); keep.push(sp);
    const spin = (dt, t) => { rn.rotation.z = t * 0.15; };
    (g.userData.spin = g.userData.spin || []).push(spin);
    return spin;
  }

  // tick(dt): the frame loop; tick(dt, true) still moves effects while freeze(true) holds them (for screenshots)
  let held = false;
  function tick(dt, force) {
    if (held && !force) dt = 0;
    U.uTime.value += dt;
    const cam = st.camera, h = st.renderer.domElement.height || 800;
    U.uScale.value = h / (2 * Math.tan(((cam.fov || 50) * Math.PI) / 360));
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i]; e.t += dt; const k = Math.min(1, e.t / e.life);
      if (e.tick) e.tick(k, e.t);
      if (k >= 1) { drop(e); live.splice(i, 1); }
    }
    tickDome(dt);
  }
  return { tick, freeze: (on) => { held = !!on; }, portal, teleport, rise, levelUp, chest, impact, summon, collect, buff, shield, count: () => live.length };
}
