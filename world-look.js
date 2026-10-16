// world-look.js — the finishing touches that make the whole picture read as one: a colour grade after the bloom (a
// different mood for morning, day, dusk and night, a soft vignette), grass that isn't one flat green, water that
// ripples and catches the light at its edge, plants that move in the wind, and soft contact shadows under the halls.
//
// Every change is a small addition to a material's own shader (onBeforeCompile), so the lights, shadows and fog keep
// working as before; on the Low preset only the cheap ones are used.
import * as THREE from "./vendor/three/three-0.186.1.module.min.js";
import { ShaderPass } from "./vendor/three/addons/ShaderPass.js";

const NOISE = `
float lk_h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lk_n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lk_h(i), lk_h(i + vec2(1.0, 0.0)), u.x), mix(lk_h(i + vec2(0.0, 1.0)), lk_h(i + vec2(1.0, 1.0)), u.x), u.y); }
float lk_fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * lk_n(p); p *= 2.07; a *= 0.5; } return v; }`;
// one clock for every copy of this module: world-play.js loads it with ?v=…, world-decor.js and world-zones-far.js
// without, and a second copy's own clock would never move
export const time = (globalThis.__arcLookTime ??= { value: 0 });

// ---------------- the grade: split toning (cool shadows / warm highlights or the reverse), saturation, contrast, vignette ----------------
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uShadow: { value: new THREE.Color(0.0, 0.01, 0.03) }, uHigh: { value: new THREE.Color(0.03, 0.02, 0.0) }, uSat: { value: 1.08 }, uCon: { value: 1.05 }, uVig: { value: 0.22 }, uAspect: { value: 1.6 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uShadow, uHigh; uniform float uSat, uCon, uVig, uAspect; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb += uShadow * (1.0 - smoothstep(0.0, 0.55, l)) + uHigh * smoothstep(0.45, 1.0, l);
      c.rgb = mix(vec3(l), c.rgb, uSat); c.rgb = (c.rgb - 0.5) * uCon + 0.5;
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0); c.rgb *= 1.0 - uVig * smoothstep(0.35, 1.05, length(d));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a); }`,
};
// the moods: k is the night amount (0 day … 1 night), dusk peaks at sunrise and sunset
const MOOD = {
  day: { sh: [0.0, 0.012, 0.03], hi: [0.025, 0.018, 0.0], sat: 1.1, con: 1.06, vig: 0.2 },
  dusk: { sh: [0.03, 0.0, 0.05], hi: [0.06, 0.025, 0.0], sat: 1.14, con: 1.08, vig: 0.28 },
  night: { sh: [0.0, 0.0, 0.035], hi: [0.01, 0.01, 0.03], sat: 0.98, con: 1.08, vig: 0.32 },
};
export function addGrade(st) {
  const comp = st.composer; if (!comp) return null;
  const pass = new ShaderPass(GradeShader); comp.addPass(pass);
  const u = pass.uniforms, lerp = (a, b, t) => a + (b - a) * t;
  const set = (k, dusk) => {
    const pick = (key) => { const d = MOOD.day[key], n = MOOD.night[key], s = MOOD.dusk[key];
      if (Array.isArray(d)) return d.map((v, i) => lerp(lerp(v, n[i], k), s[i], dusk));
      return lerp(lerp(d, n, k), s, dusk); };
    u.uShadow.value.setRGB(...pick("sh")); u.uHigh.value.setRGB(...pick("hi"));
    u.uSat.value = pick("sat"); u.uCon.value = pick("con"); u.uVig.value = pick("vig");
  };
  const fit = () => { const c = st.renderer.domElement; u.uAspect.value = (c.clientWidth || 16) / (c.clientHeight || 9); };
  fit(); addEventListener("resize", fit);
  set(0, 0);
  return { pass, set };
}

// ---------------- the grade as a 3D colour table (world-post.js applies it): time of day, then the ground's mood ----------------
// each mood: saturation, contrast, lift/gain per channel, shadow and highlight tints, warmth
const GD = {
  day: { sat: 1.1, con: 1.03, lift: [0.01, 0.014, 0.024], gain: [1.02, 1.02, 1], sh: [0, 0.014, 0.032], hi: [0.03, 0.022, 0], warm: 0.16 }, // b420: brighter and softer (key-art day: lifted, airy shade)
  dusk: { sat: 1.16, con: 1.08, lift: [0.01, 0, 0.02], gain: [1.04, 0.98, 0.94], sh: [0.03, 0, 0.05], hi: [0.07, 0.03, 0], warm: 0.6 },
  night: { sat: 0.92, con: 1.07, lift: [0, 0.005, 0.02], gain: [0.92, 0.95, 1.06], sh: [0, 0, 0.04], hi: [0.01, 0.01, 0.03], warm: -0.3 },
};
// a ground's mood is added on top (in it fully, fading at its edge)
export const ZONE_GRADE = {
  spam: { sh: [0, 0.01, 0.02] }, fields: { warm: 0.35, sat: 0.05 }, swamp: { gain: [0.95, 1.03, 0.92], sat: -0.04 }, canyon: { warm: 0.5, con: 0.03 }, depths: { sh: [0.03, 0, 0.05], gain: [1, 0.96, 1.04] },
  peaks: { sat: -0.06, hi: [-0.01, 0.01, 0.04], gain: [0.97, 1, 1.05] }, dunes: { warm: 0.7, sat: 0.06 }, reef: { gain: [0.92, 1.03, 1.05], sh: [0, 0.02, 0.03] },
  wastes: { gain: [1, 1.05, 0.88], sat: -0.06 }, ruins: { sh: [0.03, 0, 0.05], gain: [1, 0.96, 1.04] }, abyss: { gain: [1.08, 0.95, 0.88], con: 0.06 }, void: { sh: [0.04, 0, 0.06], gain: [1.04, 0.94, 1.06], sat: 0.05 },
};
const mixA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function blend(a, b, t) { return { sat: a.sat + (b.sat - a.sat) * t, con: a.con + (b.con - a.con) * t, lift: mixA(a.lift, b.lift, t), gain: mixA(a.gain, b.gain, t), sh: mixA(a.sh, b.sh, t), hi: mixA(a.hi, b.hi, t), warm: a.warm + (b.warm - a.warm) * t }; }
function addZone(p, z, k) { if (!z || k <= 0) return p; const q = { ...p, lift: [...p.lift], gain: [...p.gain], sh: [...p.sh], hi: [...p.hi] };
  if (z.sat) q.sat += z.sat * k; if (z.con) q.con += z.con * k; if (z.warm) q.warm += z.warm * k;
  for (const key of ["sh", "hi"]) if (z[key]) q[key] = q[key].map((v, i) => v + z[key][i] * k);
  if (z.gain) q.gain = q.gain.map((v, i) => v * (1 + (z.gain[i] - 1) * k)); return q; }
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/// the table: N³ colours, each input colour mapped through the mood
export function gradeLut(p, N = 16, out = null) {
  const data = out ? out.image.data : new Uint8Array(N * N * N * 4);
  let i = 0;
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    let c = [r / (N - 1), g / (N - 1), b / (N - 1)];
    c = c.map((v, j) => v * p.gain[j] + p.lift[j] * (1 - v));
    c = c.map((v) => (v - 0.5) * p.con + 0.5);
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    c = c.map((v) => l + (v - l) * p.sat);
    const sh = 1 - sm(0, 0.55, l), hi = sm(0.45, 1, l);
    c = c.map((v, j) => v + p.sh[j] * sh + p.hi[j] * hi);
    c[0] += p.warm * 0.03; c[2] -= p.warm * 0.03;
    data[i++] = Math.round(Math.max(0, Math.min(1, c[0])) * 255); data[i++] = Math.round(Math.max(0, Math.min(1, c[1])) * 255); data[i++] = Math.round(Math.max(0, Math.min(1, c[2])) * 255); data[i++] = 255;
  }
  if (out) { out.needsUpdate = true; return out; }
  const t = new THREE.Data3DTexture(data, N, N, N); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1; t.needsUpdate = true; return t;
}
/// the grade for the game: set(night amount, dusk amount, the ground you're in or null, how far in 0–1)
export function lutGrade() {
  let tex = null, key = "";
  return {
    tex: () => tex,
    set(k, dusk, zoneId, zk = 1) {
      const kk = `${k.toFixed(2)}|${dusk.toFixed(2)}|${zoneId || ""}|${zk.toFixed(1)}`; if (kk === key) return false; key = kk;
      let p = blend(blend(GD.day, GD.night, k), GD.dusk, dusk); p = addZone(p, ZONE_GRADE[zoneId], zk);
      tex = gradeLut(p, 16, tex); return true;
    },
  };
}

// ---------------- the ground: two greens and worn earth in soft patches, darker in the hollows ----------------
/// the world group's offset (the world slides under you): ground patterns are read in the world's own coordinates
export const lookOrigin = { value: new THREE.Vector3() };
export function groundLook(mat, { low, paths = [] } = {}) {
  // worn paths: packed earth from the plaza out to each hunting ground's gate (segments x1, z1, x2, z2), wavering a little
  const P = paths.slice(0, 16), NP = Math.max(1, P.length), seg = Array.from({ length: NP }, (_, i) => new THREE.Vector4(...(P[i] || [0, 0, 0, 0])));
  mat.onBeforeCompile = (sh) => {
    const CL = (globalThis.__arcCloud ??= { k: { value: 1 }, t: { value: 0 } }); sh.uniforms.uCloud = CL.k; sh.uniforms.uCloudT = CL.t;
    sh.uniforms.uPath = { value: seg }; sh.uniforms.uLkOrg = lookOrigin;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 lkW; uniform vec3 uLkOrg;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nlkW = (modelMatrix * vec4(transformed, 1.0)).xyz - uLkOrg;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 lkW; uniform float uCloud, uCloudT;" + (P.length ? `uniform vec4 uPath[${NP}];` : "") + NOISE).replace("#include <map_fragment>", `#include <map_fragment>
      { vec2 p = lkW.xz; float big = lk_fbm(p * 0.035), mid = lk_fbm(p * 0.14 + 7.3)${low ? "" : ", fine = lk_n(p * 1.7)"};
        vec3 lush = vec3(0.8, 1.08, 0.8), dry = vec3(1.16, 1.09, 0.78), earth = vec3(1.06, 0.9, 0.7); /* b440: a touch more contrast between lush and sunlit patches */
        vec3 t = mix(lush, dry, smoothstep(0.42, 0.7, big));
        t = mix(t, earth, smoothstep(0.64, 0.8, mid) * 0.35);
        diffuseColor.rgb *= t${low ? "" : " * (0.94 + 0.12 * fine)"};
        { float cc = sin(p.x * 0.021 + uCloudT * 0.05) * sin(p.y * 0.017 - uCloudT * 0.032) + sin((p.x + p.y) * 0.013 + uCloudT * 0.041) * 0.6; diffuseColor.rgb *= 1.0 - smoothstep(0.3, 0.95, cc) * 0.26 * uCloud; }
        ${P.length ? `float pd = 1e9; for (int i = 0; i < ${NP}; i++) { vec4 sg = uPath[i]; vec2 a = sg.xy, ab = sg.zw - sg.xy; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0); pd = min(pd, length(p - a - ab * h)); }
        float w = 1.0 + 0.35 * lk_n(p * 0.21); float onPath = 1.0 - smoothstep(w * 0.55, w, pd);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.2, 0.11) * (0.85 + 0.3 * lk_n(p * 2.3)), onPath * 0.85); /* linear: a warm packed-earth brown */` : ""} }`);
  };
  mat.customProgramCacheKey = () => "groundLook|" + NP + (P.length ? "p" : "") + (low ? "l" : ""); // its own program (later patches add to this key)
  mat.needsUpdate = true;
}

// ---------------- b447 (village remaster): a stone floor of hexagons drawn in the shader ----------------
// Each tile its own pale stone tone and a touch of grain, a bevel that catches the light on one side and falls into
// shade on the other, a dark grout line with a faint blue-glass seam, and a little wear. Drawn from the mesh's uv
// (a CircleGeometry: uv 0…1 over its diameter), so it stays sharp at any distance where a canvas texture blurred.
// r: the disc's radius, cell: a tile's width in metres; low: flat tiles and seams only.
export function hexFloorLook(mat, { r = 12, cell = 2.3, low = false } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, rr) => {
    if (prev) prev(sh, rr);
    sh.uniforms.hxR = { value: r }; sh.uniforms.hxCell = { value: cell };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 hxUv;").replace("#include <uv_vertex>", "#include <uv_vertex>\nhxUv = uv;"); // its own uv (works with or without a map)
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 hxUv; uniform float hxR, hxCell;" + NOISE + `
      float hx_d(vec2 p){ p = abs(p); return max(dot(p, vec2(0.8660254, 0.5)), p.y); } // 0.5 at a tile's edge (cell = 1)
      vec4 hx_cell(vec2 p){ const vec2 s = vec2(1.7320508, 1.0); vec4 c = floor(vec4(p, p - vec2(0.8660254, 0.5)) / s.xyxy) + 0.5;
        vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s); return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, c.xy) : vec4(h.zw, c.zw + 0.5); }
      float hx_h(vec2 i){ return fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
      { vec2 p = (hxUv - 0.5) * 2.0 * hxR / hxCell; vec4 c = hx_cell(p); float e = hx_d(c.xy), id = hx_h(c.zw);
        vec3 stone = mix(vec3(0.80, 0.84, 0.89), vec3(0.88, 0.90, 0.93), id); stone = mix(stone, vec3(0.76, 0.81, 0.88), step(0.82, id));
        float grout = smoothstep(0.455, 0.49, e);
        ${low ? "" : `float grain = lk_n(p * 9.0 + id * 31.0) * 0.06 + lk_fbm(p * 1.3) * 0.08;
        stone *= 0.95 + grain;
        float bev = smoothstep(0.36, 0.455, e) * (1.0 - grout); vec2 nd = normalize(c.xy + 1e-4);
        stone *= 1.0 + bev * dot(nd, vec2(-0.55, 0.83)) * 0.16 - bev * 0.05; // lit toward the sun's side, shaded away
        stone *= 1.0 - 0.06 * smoothstep(0.55, 0.8, lk_fbm(p * 0.45 + 3.1)); // worn, slightly darker patches`}
        vec3 seam = mix(vec3(0.42, 0.50, 0.60), vec3(0.45, 0.78, 1.0), 0.35);
        diffuseColor.rgb = mix(stone, seam, grout * 0.85);
        diffuseColor.rgb *= 1.0 - 0.07 * smoothstep(0.82, 1.0, length(hxUv - 0.5) * 2.0); } // a soft rim where it meets the grass`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      { vec2 p = (hxUv - 0.5) * 2.0 * hxR / hxCell; vec4 c = hx_cell(p); roughnessFactor = mix(0.62, 0.8, hx_h(c.zw)); roughnessFactor = mix(roughnessFactor, 0.95, smoothstep(0.455, 0.49, hx_d(c.xy))); }`);
  };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
  mat.customProgramCacheKey = () => pk() + "|hex" + (low ? "l" : ""); mat.needsUpdate = true;
  return mat;
}

// ---------------- b447: stone grain on a painted floor (the plaza): fine grain, worn patches, rougher seams ----------------
// Over the floor's own texture, in world space so it never stretches: a fine speckle, larger soft wear and a
// little roughness variation, the same finish as the Game Village's shader tiles.
export function stoneGrain(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, rr) => {
    if (prev) prev(sh, rr);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 sgW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nsgW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 sgW;" + NOISE)
      .replace("#include <map_fragment>", `#include <map_fragment>
      { vec2 p = sgW.xz; float l = dot(diffuseColor.rgb, vec3(0.333));
        diffuseColor.rgb *= 0.96 + lk_n(p * 7.0) * 0.05 + lk_fbm(p * 0.9) * 0.05;
        diffuseColor.rgb *= 1.0 - 0.07 * smoothstep(0.58, 0.82, lk_fbm(p * 0.35 + 5.7)) * step(0.6, l); }`) // only the pale stone wears, not the inlays
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n      roughnessFactor = clamp(roughnessFactor + (lk_n(sgW.xz * 1.3) - 0.5) * 0.16, 0.3, 1.0);");
  };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
  mat.customProgramCacheKey = () => pk() + "|sg"; mat.needsUpdate = true;
  return mat;
}

// ---------------- b447: contact shade, everywhere (a cheap ambient occlusion where things meet the ground) ----------------
// Walls, posts, trunks and furniture get darker in their last metre above the ground, so they sit on it instead of
// floating over it. Written once into three.js's own standard/physical shader (every MeshStandardMaterial and
// MeshPhysicalMaterial in the game, made before or after), so it adds no shader programs and no per-material work.
// Only faces that look sideways (the ground and floors facing up stay as they are); skinned characters are left out.
// Call before the first frame is drawn; k: how dark at the ground, h: over how many metres it fades.
export function installContactShade({ k = 0.28, h = 1.2 } = {}) {
  const L = THREE.ShaderLib; if (!L || !L.standard || /csA/.test(L.standard.vertexShader)) return false;
  const V = `#include <project_vertex>
  #ifdef USE_SKINNING
    csA = 0.0;
  #else
    { vec4 cw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cw = instanceMatrix * cw;
      #endif
      cw = modelMatrix * cw; vec3 wn = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
      csA = (1.0 - smoothstep(0.0, ${h.toFixed(2)}, cw.y)) * (1.0 - smoothstep(0.55, 0.9, wn.y)); }
  #endif`;
  const F = `#include <map_fragment>
  diffuseColor.rgb *= 1.0 - ${k.toFixed(3)} * csA;`;
  for (const id of ["standard", "physical"]) { const S = L[id]; if (!S || /csA/.test(S.vertexShader)) continue;
    S.vertexShader = S.vertexShader.replace("#include <common>", "#include <common>\nvarying float csA;").replace("#include <project_vertex>", V);
    S.fragmentShader = S.fragmentShader.replace("#include <common>", "#include <common>\nvarying float csA;").replace("#include <map_fragment>", F); }
  return true;
}

// ---------------- b447: a small pond: deeper toward the middle, ripples, a foam line at the edge ----------------
// For a CircleGeometry (uv over its diameter). The colour runs from shallow mint at the edge to deep teal in the middle;
// the ripples bend the normal (the sky catches them), and a thin, slowly moving foam line runs round the rim.
export function pondLook(mat, { low = false } = {}) {
  const FOAM = low ? "" : `float fo = smoothstep(0.86, 0.93, rr) * (1.0 - smoothstep(0.96, 1.0, rr));
        fo *= 0.55 + 0.45 * lk_n(vec2(atan(pdUv.y - 0.5, pdUv.x - 0.5) * 6.0 + lkT * 0.6, lkT * 0.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.99, 1.0), fo * 0.8);`;
  const RIPPLE = `{ vec2 p = lkW.xz * 2.2; float e = 0.05; vec2 m = vec2(lkT * 0.3, lkT * 0.2);
        float h0 = lk_fbm(p + m), hx = lk_fbm(p + vec2(e, 0.0) + m), hz = lk_fbm(p + vec2(0.0, e) + m);
        normal = normalize(normal + (viewMatrix * vec4(-(hx - h0) / e * 0.1, 0.0, -(hz - h0) / e * 0.1, 0.0)).xyz); }`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.lkT = time;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 pdUv; varying vec3 lkW;").replace("#include <uv_vertex>", "#include <uv_vertex>\npdUv = uv;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nlkW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    let f = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float lkT; varying vec2 pdUv; varying vec3 lkW;" + NOISE)
      .replace("#include <map_fragment>", `#include <map_fragment>
      { float rr = length(pdUv - 0.5) * 2.0; float depth = 1.0 - smoothstep(0.15, 0.95, rr);
        diffuseColor.rgb = mix(vec3(0.42, 0.86, 0.80), vec3(0.06, 0.34, 0.46), depth);
        ${FOAM} }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0); totalEmissiveRadiance += vec3(0.55, 0.85, 1.0) * fr * 0.35; }`);
    if (!low) f = f.replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n      " + RIPPLE);
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => "pond" + (low ? "l" : ""); mat.needsUpdate = true;
  return mat;
}

// ---------------- water: moving ripples bend the normal, the edge and the crests catch the sky ----------------
export function waterLook(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.lkT = time;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 lkW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nlkW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float lkT; varying vec3 lkW;" + NOISE)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { vec2 p = lkW.xz * 1.6; float e = 0.05;
          float h0 = lk_fbm(p + vec2(lkT * 0.35, lkT * 0.22)) + 0.5 * lk_n(p * 2.3 - vec2(lkT * 0.6, 0.0));
          float hx = lk_fbm(p + vec2(e, 0.0) + vec2(lkT * 0.35, lkT * 0.22)) + 0.5 * lk_n((p + vec2(e, 0.0)) * 2.3 - vec2(lkT * 0.6, 0.0));
          float hz = lk_fbm(p + vec2(0.0, e) + vec2(lkT * 0.35, lkT * 0.22)) + 0.5 * lk_n((p + vec2(0.0, e)) * 2.3 - vec2(lkT * 0.6, 0.0));
          vec3 bump = vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.12;
          normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz); }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        { float c = lk_n(lkW.xz * 3.2 + vec2(lkT * 0.5, -lkT * 0.3)); c = pow(smoothstep(0.55, 0.95, c), 2.0);
          float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += vec3(0.75, 0.95, 1.0) * (c * 0.55 + fr * 0.35); }`);
  };
  mat.needsUpdate = true;
}

// ---------------- wind: the top of a plant sways more than its foot; neighbours move a little out of step ----------------
// local: the phase also follows each vertex's own x/z, so many plants merged into one mesh still sway out of step
export function windLook(mat, { amp = 0.12, h = 1, local = false } = {}) {
  const prev = mat.onBeforeCompile, own = { amp: { value: amp }, h: { value: Math.max(0.01, h) } };
  const prevKey = Object.prototype.hasOwnProperty.call(mat, "customProgramCacheKey") ? mat.customProgramCacheKey.bind(mat) : () => (prev ? String(prev).length : ""); // an earlier patch keeps its own key
  // b441: the strength and height are uniforms, not numbers written into the shader: every plant shares one program
  // per variant (was one per plant model height, dozens of programs each compiled on first sight)
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.lkT = time; sh.uniforms.lkWA = own.amp; sh.uniforms.lkWH = own.h;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float lkT, lkWA, lkWH;").replace("#include <begin_vertex>", `#include <begin_vertex>
      { vec4 wp0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
        wp0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#endif
        float up = clamp(position.y / lkWH, 0.0, 1.5); up *= up;
        float ph = wp0.x * 0.37 + wp0.z * 0.29${local ? " + position.x * 0.9 + position.z * 0.7" : ""};
        float s = sin(lkT * 1.7 + ph) * 0.7 + sin(lkT * 3.1 + ph * 1.7) * 0.3;
        transformed.x += s * lkWA * up; transformed.z += cos(lkT * 1.3 + ph) * lkWA * 0.6 * up; }`);
  };
  mat.customProgramCacheKey = () => prevKey() + "|wind2" + (local ? "l" : "");
  mat.needsUpdate = true;
  return mat;
}
/// sway every mesh under obj by a fraction of its own height (its materials are cloned so other uses stay still)
export function sway(obj, { frac = 0.06 } = {}) {
  obj.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox, h = Math.max(0.01, b.max.y), o = { amp: +(frac * h).toFixed(3), h: +h.toFixed(2) };
    const cl = (x) => windLook(x.clone(), o); m.material = Array.isArray(m.material) ? m.material.map(cl) : cl(m.material);
  });
}

// ---------------- a soft round shadow on the ground under something that stands there ----------------
let shadowTex = null;
export function contactShadow(r = 3, strength = 0.42) {
  if (!shadowTex) { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.55, "rgba(0,0,0,.6)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); shadowTex = new THREE.CanvasTexture(c); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x0a1a14, transparent: true, opacity: strength, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.045; m.renderOrder = -1; m.name = "contact-shadow";
  return m;
}

// ---------------- far shadows: one big shadow map of everything that stands still, baked from the sun ----------------
// The real shadow map covers ~26 m round you; past that the ground (and each hunting ground's floor) takes its shade
// from this bake — halls, trees, the far grounds' props. Rebaked when new things are built (lazy grounds, decor).
// Things under a metre (water, puddles, paths) don't cast; moving things (scammers, players, effects) are left out.
export function groundShadow({ renderer, planet, sunDir, size = 2048, extent = 440, skip = new Set(["combat", "life", "ghosts", "zone-air", "airship", "race", "island", "raid"]), around = null }) {
  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.depthTexture = new THREE.DepthTexture(size, size); rt.depthTexture.type = THREE.UnsignedIntType;
  const cam = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 1, 900);
  const U = { gsTex: { value: rt.depthTexture }, gsM: { value: new THREE.Matrix4() }, gsPl: { value: new THREE.Vector3() }, gsOn: { value: 0 }, gsPx: { value: 1 / size }, gsK: { value: 0.4 }, gsNear: { value: 18 } };
  const depthMat = new THREE.MeshDepthMaterial(), holder = new THREE.Scene(); holder.overrideMaterial = depthMat;
  const patched = new Set();
  function bake() { if (around) around(bake0); else bake0(); }
  function bake0() {
    const parent = planet.parent, pos = planet.position.clone(), off = [];
    planet.traverse((o) => { if (o.visible && (skip.has(o.name) || o.isSprite || o.isPoints || o.isLine || o.userData.noBake || patched.has(o.material))) { o.visible = false; off.push(o); } });
    planet.position.set(0, 0, 0); holder.add(planet); planet.updateMatrixWorld(true);
    cam.position.copy(sunDir).multiplyScalar(450); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    const prevRT = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(holder, cam); renderer.setRenderTarget(prevRT);
    if (parent) parent.add(planet); planet.position.copy(pos); planet.updateMatrixWorld(true); off.forEach((o) => { o.visible = true; });
    U.gsM.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); U.gsOn.value = 1;
  }
  let soon = 0;
  /// a material that receives the far shade (the ground, the grounds' floors)
  function receive(mat) {
    if (patched.has(mat)) return; patched.add(mat);
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r); Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 gsW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\ngsW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 gsW; uniform sampler2D gsTex; uniform mat4 gsM; uniform vec3 gsPl; uniform float gsOn, gsPx, gsK, gsNear;").replace("#include <map_fragment>", `#include <map_fragment>
        if (gsOn > 0.5) { vec3 lp = gsW - gsPl; vec4 sc = gsM * vec4(lp, 1.0); vec3 s = sc.xyz * 0.5 + 0.5;
          if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0) {
            float sh = 0.0; for (int i = -1; i <= 1; i += 2) for (int j = -1; j <= 1; j += 2) sh += step(texture2D(gsTex, s.xy + vec2(float(i), float(j)) * gsPx * 1.5).r, s.z - 0.0012);
            diffuseColor.rgb *= 1.0 - sh * 0.25 * gsK * smoothstep(gsNear, gsNear + 10.0, length(gsW.xz)); } }`);
    };
    mat.customProgramCacheKey = () => prevKey() + "|gsh"; mat.needsUpdate = true;
  }
  return { bake, receive, rebakeSoon: (ms = 1200) => { clearTimeout(soon); soon = setTimeout(bake, ms); }, tick: () => { U.gsPl.value.copy(planet.position); }, uniforms: U };
}
