// world-look.js — the finishing touches that make the whole picture read as one: a colour grade after the bloom (a
// different mood for morning, day, dusk and night, a soft vignette), grass that isn't one flat green, water that
// ripples and catches the light at its edge, plants that move in the wind, and soft contact shadows under the halls.
//
// Every change is a small addition to a material's own shader (onBeforeCompile), so the lights, shadows and fog keep
// working as before; on the Low preset only the cheap ones are used.
import * as THREE from "./vendor/three/three-0.169.0.module.min.js";
import { ShaderPass } from "./vendor/three/addons/ShaderPass.js";

const NOISE = `
float lk_h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lk_n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lk_h(i), lk_h(i + vec2(1.0, 0.0)), u.x), mix(lk_h(i + vec2(0.0, 1.0)), lk_h(i + vec2(1.0, 1.0)), u.x), u.y); }
float lk_fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * lk_n(p); p *= 2.07; a *= 0.5; } return v; }`;
export const time = { value: 0 };

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

// ---------------- the ground: two greens and worn earth in soft patches, darker in the hollows ----------------
export function groundLook(mat, { low } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 lkW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nlkW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 lkW;" + NOISE).replace("#include <map_fragment>", `#include <map_fragment>
      { vec2 p = lkW.xz; float big = lk_fbm(p * 0.035), mid = lk_fbm(p * 0.14 + 7.3)${low ? "" : ", fine = lk_n(p * 1.7)"};
        vec3 lush = vec3(0.86, 1.06, 0.84), dry = vec3(1.12, 1.07, 0.82), earth = vec3(1.05, 0.9, 0.72);
        vec3 t = mix(lush, dry, smoothstep(0.42, 0.7, big));
        t = mix(t, earth, smoothstep(0.64, 0.8, mid) * 0.35);
        diffuseColor.rgb *= t${low ? "" : " * (0.94 + 0.12 * fine)"}; }`);
  };
  mat.needsUpdate = true;
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
export function windLook(mat, { amp = 0.12, h = 1 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.lkT = time;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float lkT;").replace("#include <begin_vertex>", `#include <begin_vertex>
      { vec4 wp0 = modelMatrix * ${"#ifdef USE_INSTANCING\n instanceMatrix * \n#endif\n"}vec4(0.0, 0.0, 0.0, 1.0);
        float up = clamp(position.y / ${h.toFixed(2)}, 0.0, 1.5); up *= up;
        float ph = wp0.x * 0.37 + wp0.z * 0.29;
        float s = sin(lkT * 1.7 + ph) * 0.7 + sin(lkT * 3.1 + ph * 1.7) * 0.3;
        transformed.x += s * ${amp.toFixed(3)} * up; transformed.z += cos(lkT * 1.3 + ph) * ${(amp * 0.6).toFixed(3)} * up; }`);
  };
  mat.customProgramCacheKey = () => "wind" + amp + h;
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
