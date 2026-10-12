// world-weather.js — the air of each hunting ground: snow over Ponzi Peaks, blowing sand in the desert, bubbles on
// the reef, spores over the bot farm, dust in the ruins, embers over the abyss, stars drifting in the void, and
// softer touches nearer town (sparkles in Spam Alley, pollen in the fields, fireflies in the swamp, red dust in the
// canyon, motes in the depths).
//
// One cloud of points follows you; the shader moves each point and wraps it round a box centred on you, so it never
// runs out. It shows only inside the nearest ground (fading at the border) and costs one draw call.
const MODES = {
  // m: the motion (0 fall, 1 blow, 2 rise, 3 float, 4 twinkle, 5 embers, 6 swirl); sp: speed; sz: point size;
  // h: height of the box; c: colour (above 1 glows in the bloom); add: additive blending; a: opacity
  snow: { m: 0, sp: 1.3, sz: 0.16, h: 16, c: [1, 1, 1.05], a: 0.85 },
  sand: { m: 1, sp: 9, sz: 0.09, h: 4, c: [1.1, 0.88, 0.6], a: 0.6 },
  bubbles: { m: 2, sp: 1.1, sz: 0.14, h: 10, c: [0.75, 1.25, 1.3], a: 0.55 },
  spores: { m: 3, sp: 0.5, sz: 0.12, h: 7, c: [0.9, 2.0, 0.5], a: 0.8, add: true },
  dust: { m: 4, sp: 0.3, sz: 0.09, h: 8, c: [1.3, 1.1, 1.6], a: 0.7, add: true },
  embers: { m: 5, sp: 2.2, sz: 0.11, h: 12, c: [3.2, 1.1, 0.3], a: 0.95, add: true },
  stars: { m: 6, sp: 0.4, sz: 0.12, h: 14, c: [2.4, 1.1, 2.4], a: 0.9, add: true },
  sparkle: { m: 4, sp: 0.4, sz: 0.08, h: 6, c: [1.0, 1.9, 2.4], a: 0.6, add: true },
  pollen: { m: 3, sp: 0.4, sz: 0.08, h: 5, c: [2.0, 1.7, 0.6], a: 0.7, add: true },
  fireflies: { m: 4, sp: 0.6, sz: 0.13, h: 4, c: [1.8, 2.4, 0.6], a: 0.95, add: true },
  reddust: { m: 1, sp: 4, sz: 0.08, h: 3, c: [1.2, 0.7, 0.5], a: 0.5 },
  motes: { m: 4, sp: 0.3, sz: 0.1, h: 7, c: [1.4, 0.9, 2.4], a: 0.8, add: true },
};
export const AIR = { spam: "sparkle", fields: "pollen", swamp: "fireflies", canyon: "reddust", depths: "motes", peaks: "snow", dunes: "sand", reef: "bubbles", wastes: "spores", ruins: "dust", abyss: "embers", void: "stars" };

export function createWeather({ THREE, planet, zones, low = false, reduce = false }) {
  const N = low ? 360 : 900, B = 44; // points, and the box's width
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N * 4; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // not used: the shader places every point
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); // it moves in the shader: never cull it by its (empty) positions
  const u = {
    uT: { value: 0 }, uC: { value: new THREE.Vector2() }, uZ: { value: new THREE.Vector3() }, uB: { value: B }, uH: { value: 10 },
    uMode: { value: 0 }, uSp: { value: 1 }, uSz: { value: 0.1 }, uCol: { value: new THREE.Vector3(1, 1, 1) }, uA: { value: 0 }, uPx: { value: 300 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 seed; uniform float uT, uB, uH, uMode, uSp, uSz, uPx; uniform vec2 uC; uniform vec3 uZ; varying float vA; varying float vTw;
      void main(){
        vec3 p = vec3(seed.x * uB, seed.y * uH, seed.z * uB); float t = uT * uSp, ph = seed.w * 6.2831;
        if (uMode < 0.5) { p.y -= t * (0.7 + seed.w * 0.6); p.x += sin(uT * 0.8 + ph) * 0.8; p.z += t * 0.25; }
        else if (uMode < 1.5) { p.x += t * (0.8 + seed.w * 0.5); p.y += sin(uT * 3.0 + ph) * 0.25; p.z += sin(uT * 0.7 + ph) * 1.5; }
        else if (uMode < 2.5) { p.y += t * (0.6 + seed.w * 0.8); p.x += sin(uT * 2.0 + ph) * 0.25; }
        else if (uMode < 3.5) { p.y += t * 0.4 + sin(uT * 0.7 + ph) * 0.6; p.x += sin(uT * 0.5 + ph * 1.3) * 1.4; p.z += cos(uT * 0.4 + ph) * 1.4; }
        else if (uMode < 4.5) { p.x += sin(uT * 0.4 + ph) * 1.2 * uSp; p.y += sin(uT * 0.6 + ph * 2.0) * 0.5; p.z += cos(uT * 0.3 + ph) * 1.2 * uSp; }
        else if (uMode < 5.5) { p.y += t * (0.6 + seed.w); p.x += sin(uT * 1.7 + ph) * 0.6; p.z += cos(uT * 1.3 + ph) * 0.6; }
        else { float a = t * 0.15 * (0.5 + seed.w) + ph; p.x += cos(a) * 3.0; p.z += sin(a) * 3.0; p.y += sin(uT * 0.5 + ph) * 0.6; }
        // wrap round the box centred on you
        vec3 w; w.x = uC.x + mod(p.x - uC.x, uB) - uB * 0.5; w.z = uC.y + mod(p.z - uC.y, uB) - uB * 0.5; w.y = mod(p.y, uH) + 0.1;
        float edge = smoothstep(uZ.z + 2.0, uZ.z - 4.0, distance(w.xz, uZ.xy)); // only inside the ground
        float hf = smoothstep(0.0, 0.8, w.y) * (1.0 - smoothstep(uH - 1.5, uH, w.y));
        float near = smoothstep(uB * 0.5, uB * 0.3, distance(w.xz, uC));
        vTw = uMode > 3.5 && uMode < 4.5 ? 0.35 + 0.65 * (0.5 + 0.5 * sin(uT * (2.0 + seed.w * 3.0) + ph * 4.0)) : uMode > 4.5 && uMode < 5.5 ? 0.6 + 0.4 * sin(uT * 12.0 + ph * 9.0) : 1.0;
        vA = edge * hf * near;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        gl_PointSize = clamp(uSz * (0.6 + seed.w * 0.8) * uPx / max(0.5, -mv.z), 1.0, 28.0);
        gl_Position = projectionMatrix * mv;
        if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen
      }`,
    fragmentShader: `uniform vec3 uCol; uniform float uA, uMode; varying float vA; varying float vTw;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        float soft = uMode > 0.5 && uMode < 1.5 ? 1.0 - smoothstep(0.15, 0.5, r) : 1.0 - smoothstep(0.25, 0.5, r);
        if (uMode > 1.5 && uMode < 2.5) soft = smoothstep(0.32, 0.42, r) * (1.0 - smoothstep(0.42, 0.5, r)) + 0.15; // bubbles: a ring
        gl_FragColor = vec4(uCol, soft * vA * vTw * uA); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 3; pts.name = "zone-air"; pts.visible = false;
  planet.add(pts);
  let cur = null, curZone = null, fade = 0;
  const set = (key) => {
    const m = MODES[key]; if (!m) return;
    u.uMode.value = m.m; u.uSp.value = m.sp * (reduce ? 0.4 : 1); u.uSz.value = m.sz; u.uH.value = m.h; u.uCol.value.set(...m.c);
    const bl = m.add ? THREE.AdditiveBlending : THREE.NormalBlending; if (mat.blending !== bl) { mat.blending = bl; mat.needsUpdate = true; }
    cur = key; mat.userData.a = m.a;
  };
  /// each frame: where you stand (on the flat ground), the screen height (for point sizes)
  function tick(dt, t, px, pz, screenH = 800) {
    let best = null, bd = 1e9;
    for (const z of zones) { const d = Math.hypot(px - z.x, pz - z.z) - z.r; if (d < bd) { bd = d; best = z; } }
    const want = best && bd < 10 ? AIR[best.id] : null;
    if (want && want !== cur && fade <= 0.02) { set(want); curZone = best; }
    const on = want && want === cur; if (on) curZone = best;
    fade = Math.max(0, Math.min(1, fade + (on ? dt : -dt) * 1.5));
    pts.visible = fade > 0.01 && !!cur;
    if (!pts.visible) return;
    if (curZone) u.uZ.value.set(curZone.x, curZone.z, curZone.r);
    u.uT.value = t; u.uC.value.set(px, pz); u.uPx.value = screenH * 0.9; u.uA.value = (mat.userData.a || 1) * fade;
  }
  return { tick, points: pts, current: () => (pts.visible ? cur : null) };
}
