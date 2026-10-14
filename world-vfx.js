// world-vfx.js — the game's light effects, drawn with shaders rather than models: portals with a turning swirl,
// teleport beams, the level-up pillar, a chest bursting open, skill impacts, a summoning circle, pick-up sparkles, buff
// arrows and a hex shield. Every effect is layers of the same few pieces — a bright core, an outer glow, flowing noise,
// sparks (GPU particles) and a rune circle on the ground — in colours above 1.0 so the bloom catches them.
//
// createVfx({ THREE, st, planet, player, low, reduce }) → { tick(dt), portal(g, o), teleport(p, o), rise(p),
//   levelUp(), chest(p), impact(p, kind, o), summon(p, boss), collect(p, color), buff(color), shield(on), count(),
//   star(p, color, o), boom(p, kind, o), quake(p, color, r), burst(p, color, big), zap(a, b, o), warm(p) }
// Positions are in the planet's frame (where the halls and the scammers live); levelUp, buff and shield follow you.
// The fight's effects (impact, star, boom, quake, burst, zap) are pooled: built once, played again, a hard cap each.

const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }`;

export function createVfx(ctx) {
  const { THREE, st, planet, player } = ctx;
  const low = !!ctx.low, reduce = !!ctx.reduce, lite = () => low || !!(ctx.lite && ctx.lite()); // lite: low, or the frame rate fell (world-play.js liteFx)
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
  // a hit's star: four long spikes, four short ones and a hot middle (the "tick" of a blow landing)
  const STAR = canvasTex(128, 128, (g, w) => { const c = w / 2; g.translate(c, c); g.globalCompositeOperation = "lighter";
    const spike = (a, l, wd) => { g.save(); g.rotate(a); const r = g.createLinearGradient(0, 0, l, 0); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.beginPath(); g.moveTo(0, -wd); g.lineTo(l, 0); g.lineTo(0, wd); g.closePath(); g.fill(); g.restore(); };
    for (let i = 0; i < 4; i++) { spike((i * Math.PI) / 2, 62, 7); spike((i * Math.PI) / 2 + Math.PI / 4, 34, 5); }
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.4, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(-30, -30, 60, 60); });
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
  // a pooled effect (b420): a fight plays the same few effects many times a second, so each is built once (its
  // materials, its buffers) and played again; a finished one waits hidden in its parent. At most cap play at once (half
  // when lite); one more restarts the oldest. build(g, e) → { tick(k, t), start() }; e.at and e.o hold this play's where/what
  const pools = {};
  function pooled(key, cap, parent, at, life, o, build) {
    if (reduce) return null;
    const P = pools[key] || (pools[key] = { free: [], busy: 0 }); cap = lite() ? Math.max(1, cap >> 1) : cap;
    let e = P.free.pop();
    if (!e && P.busy >= cap) { const i = live.findIndex((x) => x.key === key); if (i >= 0) { e = live[i]; live.splice(i, 1); P.busy--; } }
    if (!e) { const g = new THREE.Group(); parent.add(g); e = { g, key, parent, at: new THREE.Vector3(), o: {} }; const parts = build(g, e) || {}; e.tick = parts.tick; e.start = parts.start; }
    e.life = life; e.t = 0; e.o = o; if (at) e.at.copy(at); else e.at.set(0, 0, 0); e.g.position.copy(e.at); e.g.visible = true;
    if (e.start) e.start(); if (e.tick) e.tick(0, 0);
    P.busy++; live.push(e); return e;
  }
  const park = (e) => { e.g.visible = false; const P = pools[e.key]; P.busy--; P.free.push(e); };

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
    if (!IMPACT[kind]) kind = "hit";
    const [c, c2, grav] = IMPACT[kind], meteor = kind === "meteor";
    return pooled("imp-" + kind, 6, planet, at, meteor ? 1.1 : 0.75, o, (g, e) => {
      const gl = sprite(GLOW, c, 2.4, 1.5), hot = sprite(GLOW, c2, 1.1, 2.2); g.add(gl, hot); // a coloured flash with a white-hot middle
      const sh = shock(c, meteor ? 5.5 : 2.4); g.add(sh);
      const sp = sparks(c, meteor ? 80 : 46, { out: 5, up: kind === "fire" ? 3.5 : 2, spread: 0.6, life: 0.65, grav, delay: 0.05, size: kind === "ice" ? 0.2 : 0.28 });
      g.add(sp);
      const rn = meteor ? rune(c, 4.5) : null; if (rn) g.add(rn);
      return { start: () => { const big = e.o.big || 1, r = (meteor ? 11 : 4.8) * big; sh.position.y = 0.1 - e.at.y; sh.scale.set(r, r, 1); sp.scale.setScalar(big); g.rotation.y = Math.random() * 6.28; if (rn) { rn.position.y = 0.07 - e.at.y; rn.scale.set(9 * big, 9 * big, 1); } },
        tick: (k) => { const big = e.o.big || 1; gl.material.opacity = Math.max(0, 1 - k * 1.6); gl.scale.setScalar(2.4 * big * (1 + k * 1.5)); hot.material.opacity = Math.max(0, 1 - k * 3); hot.scale.setScalar(1.1 * big * (1 + k)); sh.material.uniforms.uR.value = 0.1 + Math.sqrt(k) * 0.9; fade(sh, 1 - k);
          sp.material.uniforms.uAge.value = k * 0.75; if (rn) { rn.rotation.z = k * 2; fade(rn, 1 - k); } } };
    });
  }
  // a blow landing: a star of light that pops big and is gone in a blink, a white-hot dot in its middle, drawn over the
  // scammer (o: { color, big (a crit or a heavy blow), size, rot (the swing's angle: the long spikes lie along it) })
  function star(at, color = 0xffffff, o = {}) {
    o.color = o.color ?? color;
    return pooled("star", 12, planet, at, o.big ? 0.24 : 0.17, o, (g, e) => {
      const s1 = sprite(STAR, 0xffffff, 1, 1.8), s2 = sprite(GLOW, 0xffffff, 1, 2.4); s1.renderOrder = s2.renderOrder = 12; s1.material.depthTest = s2.material.depthTest = false; g.add(s1, s2);
      return { start: () => { s1.material.color.set(e.o.color).multiplyScalar(e.o.big ? 2.4 : 1.8); s1.material.rotation = e.o.rot ?? Math.random() * 6.28; },
        tick: (k) => { const S = (e.o.big ? 3.4 : 2.1) * (e.o.size || 1), pop = k < 0.22 ? 0.35 + (k / 0.22) * 0.85 : 1.2 - (k - 0.22) * 0.9; // in fast, out slower
          s1.scale.set(S * pop * 1.15, S * pop * 0.85, 1); s1.material.opacity = 1 - k * k;
          s2.scale.setScalar(S * 0.55 * (1 - k * 0.5)); s2.material.opacity = Math.max(0, 1 - k * 2.2); } };
    });
  }
  // a fireball's bloom: a billboard of flowing noise that swells, burns from white through orange to a dark edge and
  // eats itself away (a flipbook without the image: each frame is the noise at that moment)
  const boomMat = () => base({ uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uK: { value: 0 }, uSeed: { value: 0 }, uFade: { value: 1 }, uS: { value: 1 } },
    `uniform float uS; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * uS; gl_Position = projectionMatrix * mv; }`, `${NOISE}
    uniform vec3 uA, uB; uniform float uK, uSeed, uFade; varying vec2 vUv;
    void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
      float n = fbm(c * 3.2 + vec2(uSeed, uSeed * 0.7) - c / max(r, 0.05) * uK * 1.6);
      float body = 1.0 - smoothstep(0.3 + 0.55 * uK, 0.95, r + (n - 0.5) * 0.7);
      float a = body * smoothstep(uK * 1.05 - 0.2, uK * 1.05 + 0.05, n * (1.15 - r * 0.45));
      float heat = clamp(n * 1.5 - r * 0.85 + (1.0 - uK) * 0.65, 0.0, 1.0);
      vec3 col = mix(uB * 0.22, uB, smoothstep(0.05, 0.45, heat)); col = mix(col, uA, smoothstep(0.45, 0.8, heat)); col = mix(col, vec3(1.6), smoothstep(0.82, 1.0, heat) * (1.0 - uK));
      gl_FragColor = vec4(col, a * uFade); }`, { side: THREE.FrontSide });
  const BOOM = { fire: [0xffd27a, 0xff4d1a], meteor: [0xffc04d, 0xff3a12], ice: [0xe6fbff, 0x2f9be8], shock: [0xf0e6ff, 0x7a4dff], hit: [0xfff2c8, 0xffa733] };
  function boom(at, kind = "fire", o = {}) {
    o.kind = o.kind || kind;
    return pooled("boom", 6, planet, at, o.life || 0.6, o, (g, e) => {
      const m = new THREE.Mesh(plane, boomMat()); m.frustumCulled = false; m.renderOrder = 5; g.add(m); const u = m.material.uniforms;
      return { start: () => { const [a, b] = BOOM[e.o.kind] || BOOM.fire; u.uA.value.set(a).multiplyScalar(1.5); u.uB.value.set(b).multiplyScalar(1.3); u.uSeed.value = Math.random() * 40; },
        tick: (k) => { u.uK.value = k; u.uS.value = (e.o.size || 2.6) * (0.55 + Math.sqrt(k) * 0.6); m.position.y = k * 0.6; } };
    });
  }
  // a shockwave across the ground where a heavy blow or a crit landed: two bands, the inner one a beat behind (at: on the ground)
  function quake(at, color = 0xffc861, r = 2.6) {
    return pooled("quake", 6, planet, at, 0.45, { color, r }, (g, e) => {
      const sh = shock(color, 1), sh2 = shock(color, 1); g.add(sh, sh2); const u = sh.material.uniforms, u2 = sh2.material.uniforms; u.uW.value = 0.16; u2.uW.value = 0.1; sh2.position.y = 0.085;
      return { start: () => { u.uColor.value.set(e.o.color).multiplyScalar(1.7); u2.uColor.value.set(e.o.color).lerp(WHITE, 0.5).multiplyScalar(1.9); sh.scale.set(e.o.r * 2, e.o.r * 2, 1); sh2.scale.set(e.o.r * 1.4, e.o.r * 1.4, 1); },
        tick: (k) => { const k2 = Math.max(0, (k - 0.15) / 0.85); u.uR.value = 0.12 + (1 - (1 - k) * (1 - k)) * 0.88; u.uFade.value = 1 - k; u2.uR.value = 0.1 + (1 - (1 - k2) * (1 - k2)) * 0.9; u2.uFade.value = k2 > 0 ? 1 - k2 : 0; } };
    });
  }
  const WHITE = new THREE.Color(0xffffff);
  // a knock-out: a column of light shoots up, a ring runs out across the ground over a turning rune circle, two halos climb
  // the column and rays fan from its foot (at: on the ground)
  function burst(at, color = 0xffc861, big = 1) {
    return pooled("burst", 4, planet, at, 0.9, { color, big }, (g, e) => {
      const b = beam(color, 0.5, 6, { speed: 4, k: 1.8 }), b2 = beam(0xffffff, 0.2, 7, { k: 1.4, speed: 6 }), sh = shock(color, 2), gl = sprite(GLOW, color, 2.4, 2); gl.position.y = 0.8;
      const rays = []; for (let i = 0; i < 6; i++) { const piv = new THREE.Group(), r = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: RAY, color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); piv.rotation.y = (i / 6) * Math.PI * 2; piv.rotation.z = 0.5; piv.position.y = 0.2; r.position.y = 1; piv.add(r); g.add(piv); rays.push(r); }
      const rn = rune(color, 1.6), halos = [0, 1].map(() => { const h = shock(color, 0.9); h.material.uniforms.uR.value = 0.9; h.material.uniforms.uW.value = 0.2; g.add(h); return h; });
      g.add(b, b2, sh, gl, rn);
      return { start: () => { const c = e.o.color; b.material.uniforms.uColor.value.set(c).multiplyScalar(1.8); rn.material.color.set(c).multiplyScalar(1.7); halos.forEach((h) => h.material.uniforms.uColor.value.set(c).multiplyScalar(1.7)); sh.material.uniforms.uColor.value.set(c).multiplyScalar(1.7); gl.material.color.set(c).multiplyScalar(2); rays.forEach((r) => r.material.color.set(c).multiplyScalar(1.6)); g.scale.setScalar(e.o.big); },
        tick: (k) => { const inn = Math.min(1, k * 7), out = 1 - Math.max(0, (k - 0.35) / 0.65), w = 0.4 + out * 0.6; b.scale.set(0.5 * w, 6 * inn, 0.5 * w); fade(b, out); b2.scale.set(0.2 * out, 7 * inn, 0.2 * out); fade(b2, out);
          sh.material.uniforms.uR.value = 0.1 + Math.sqrt(k) * 0.9; fade(sh, 1 - k); gl.material.opacity = Math.max(0, 1 - k * 2.5); gl.scale.setScalar(2.4 + k * 2);
          rays.forEach((r, i) => { const h = 2 * inn * (0.8 + 0.2 * Math.sin(i * 2.3)); r.scale.set(0.35, h, 1); r.position.y = h / 2; r.material.opacity = out * 0.8; });
          rn.rotation.z = k * 2.4; rn.scale.set(3.2 * (0.7 + inn * 0.3), 3.2 * (0.7 + inn * 0.3), 1); fade(rn, out);
          halos.forEach((h, i) => { const kk = Math.min(1, Math.max(0, (k - i * 0.12) / 0.7)); h.position.y = 0.2 + kk * 4.5; h.scale.setScalar(1.8 * (1 - kk * 0.5)); fade(h, Math.sin(kk * Math.PI) * out); }); } };
    });
  }
  // lightning between two points: a strip of quads whose middle is shaken sideways on the GPU (a new jag 24 times a
  // second), no new line or tube for each bolt. o: { color, w (width), amp (how far it jags), life }
  const zapGeo = new THREE.PlaneGeometry(1, 1, 1, 24); zapGeo.translate(0, 0.5, 0);
  const zapMat = () => base({ uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uSeed: { value: 0 }, uW: { value: 0.7 }, uAmp: { value: 0.5 }, uColor: { value: new THREE.Color() }, uFade: { value: 1 } }, `
    uniform vec3 uA, uB; uniform float uSeed, uW, uAmp, uTime; varying float vX, vY;
    float h1(float x){ return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453); }
    float jag(float y, float f){ float s = y * 9.0, i = floor(s); return mix(h1(i + f), h1(i + 1.0 + f), fract(s)) - 0.5; }
    void main(){ float y = position.y; vX = position.x * 2.0; vY = y;
      vec4 a = modelViewMatrix * vec4(uA, 1.0), b = modelViewMatrix * vec4(uB, 1.0), mv = mix(a, b, y);
      vec2 d = b.xy - a.xy; float L = length(d); d = L > 1e-4 ? d / L : vec2(0.0, 1.0);
      float f = floor(uTime * 24.0) * 7.13, off = (jag(y, f) + jag(y * 2.7, f + 3.1) * 0.5) * uAmp * sin(y * 3.14159);
      mv.xy += vec2(-d.y, d.x) * (off + position.x * uW); gl_Position = projectionMatrix * mv; }`, `
    uniform vec3 uColor; uniform float uFade, uTime, uSeed; varying float vX, vY;
    void main(){ float x = abs(vX), core = 1.0 - smoothstep(0.06, 0.2, x), glow = exp(-x * x * 7.0);
      float fl = 0.75 + 0.25 * sin(uTime * 90.0 + uSeed * 9.0 + vY * 6.0);
      gl_FragColor = vec4(mix(uColor, vec3(1.6), core), (core + glow * 0.55) * fl * uFade); }`, { add: true });
  function zap(a, b, o = {}) {
    o.a = a; o.b = b;
    return !!pooled("zap", 16, planet, null, o.life || 0.26, o, (g, e) => {
      const m = new THREE.Mesh(zapGeo, zapMat()); m.frustumCulled = false; m.renderOrder = 6; g.add(m); const u = m.material.uniforms;
      return { start: () => { u.uA.value.copy(e.o.a); u.uB.value.copy(e.o.b); u.uSeed.value = Math.random() * 50; u.uW.value = e.o.w || 0.7; u.uAmp.value = e.o.amp ?? 0.55; u.uColor.value.set(e.o.color ?? 0xb48cff).multiplyScalar(1.8); },
        tick: (k) => { u.uFade.value = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; } };
    });
  }
  // warm(p): the pooled effects played once out of sight (p: under the ground), so their shaders are ready before the first blow
  function warm(at) { if (reduce) return; star(at); boom(at); quake(at); burst(at); zap(at, at.clone().setY(at.y + 2)); }
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
  // 24 destruction: a scammer breaks into glowing data cubes that tumble out; coins arc up and fly to you (where())
  const cubeGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  function shatter(at, color = 0xff4d6d, { big = 1, coins = 3, where = null } = {}) {
    const n = Math.round((big > 1 ? 34 : 16) * (low ? 0.5 : 1));
    return once(planet, at, 1.1, (g) => {
      const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 1.6), transparent: true, depthWrite: false });
      const cubes = new THREE.InstancedMesh(cubeGeo, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const P = []; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = (1.8 + Math.random() * 3) * big; P.push({ v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 4 * big, Math.sin(a) * sp), s: (0.6 + Math.random() * 1.2) * big, r: Math.random() * 6 }); }
      cubes.frustumCulled = false; g.add(cubes);
      const gl = sprite(GLOW, color, 2.6 * big, 1.6); g.add(gl);
      const coin = [], cs = []; for (let i = 0; i < coins; i++) { const c = sprite(GLOW, GOLD, 0.5, 2.0); g.add(c); coin.push(c); const a = Math.random() * Math.PI * 2; cs.push(new THREE.Vector3(Math.cos(a) * 1.2, 2.2 + Math.random(), Math.sin(a) * 1.2)); }
      const tgt = new THREE.Vector3(), pos = new THREE.Vector3(), scv = new THREE.Vector3(), local = new THREE.Vector3(); // scratch: nothing new each frame
      return { tick: (k, t) => {
        P.forEach((p, i) => { pos.copy(p.v).multiplyScalar(t); pos.y -= 4.9 * t * t; if (pos.y + at.y < 0.08) pos.y = 0.08 - at.y; e.set(p.r + t * 6, p.r * 2 + t * 4, 0); q.setFromEuler(e); const sc = p.s * (1 - k * 0.8); m4.compose(pos, q, scv.set(sc, sc, sc)); cubes.setMatrixAt(i, m4); });
        cubes.instanceMatrix.needsUpdate = true; mat.opacity = 1 - k * k;
        gl.material.opacity = Math.max(0, 1 - k * 3);
        if (where) where(tgt); else tgt.copy(at);
        coin.forEach((c, i) => { const kk = Math.min(1, k * 1.25), arc = Math.sin(kk * Math.PI); local.copy(tgt).sub(at).setY(1.2 - at.y);
          c.position.copy(cs[i]).multiplyScalar(1 - kk).add(local.multiplyScalar(kk)); c.position.y += arc * 1.4; c.material.opacity = kk < 1 ? 1 : 0; c.scale.setScalar(0.5 + arc * 0.25); });
      } };
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
      if (k >= 1) { if (e.key) park(e); else drop(e); live.splice(i, 1); }
    }
    tickDome(dt);
  }
  return { tick, freeze: (on) => { held = !!on; }, shatter, portal, teleport, rise, levelUp, chest, impact, summon, collect, buff, shield, star, boom, quake, burst, zap, warm, count: () => live.length };
}
