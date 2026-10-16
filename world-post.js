// world-post.js — the game's picture after the scene is drawn, one pass at a time:
//
//   scene      drawn into a multisampled target (real antialiasing with bloom on), or by N8AO, which draws it and
//              adds ambient occlusion (soft shade in corners, under things, between props)
//   edges      ink lines where depth jumps or creases (the mixed model packs read as one drawn style); a darker shade
//              of the colour under them, never pure black, fading out with distance
//   bloom      the glow of bright things (as before)
//   air        height fog that lies low in the morning and at dusk, sun shafts toward the sun, heat shimmer over lava
//   output     tone mapping and sRGB
//   grade      a 3D colour table built from the time of day and the ground you're in (world-look.js makes it), and the
//              vignette
//   fxaa       smooths what's left after AO (multisampling and AO don't mix)
//
// Levels: "medium" (multisampling, edges, bloom, air, grade) and "ultra" (AO, edges, bloom, air with shafts, grade, FXAA).
// Low and Saver keep the plain renderer with its own antialiasing. WebGL 1: FXAA and no 3D table.
import * as THREE from "./vendor/three/three-0.186.1.module.min.js";
import { EffectComposer } from "./vendor/three/addons/EffectComposer.js";
import { RenderPass } from "./vendor/three/addons/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/addons/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/addons/OutputPass.js";
import { ShaderPass } from "./vendor/three/addons/ShaderPass.js";
import { Pass, FullScreenQuad } from "./vendor/three/addons/Pass.js";
import { FXAAShader } from "./vendor/three/addons/FXAAShader.js";

const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const LIN = "float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }";

// a pass that draws the scene and remembers which depth texture it wrote (the composer swaps its two targets)
class ScenePass extends RenderPass {
  render(renderer, writeBuffer, readBuffer, dt, mask) { super.render(renderer, writeBuffer, readBuffer, dt, mask); this.depth = readBuffer.depthTexture; }
}

// a full-screen pass with its own material that also reads the scene's depth
class DepthPass extends Pass {
  constructor(shader, depth) {
    super(); this.uniforms = THREE.UniformsUtils.clone(shader.uniforms); this.depth = depth;
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: shader.fragmentShader, defines: shader.defines || {} });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture; this.uniforms.tDepth.value = this.depth();
    if (this.before) this.before(this.uniforms);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsQuad.render(renderer);
  }
  setSize(w, h) { if (this.uniforms.res) this.uniforms.res.value.set(1 / w, 1 / h); }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

const EdgeShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, near: { value: 0.1 }, far: { value: 1200 },
    strength: { value: 0.85 }, ink: { value: 0.32 }, depthT: { value: 0.06 }, fadeNear: { value: 40 }, fadeFar: { value: 130 }, thick: { value: 1.0 } },
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform vec2 res; uniform float near, far, strength, ink, depthT, fadeNear, fadeFar, thick; varying vec2 vUv;
    ${LIN}
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv); float d0 = texture2D(tDepth, vUv).r;
      if (d0 >= 0.99999) { gl_FragColor = c; return; }
      vec2 px = res * thick; float z0 = lin(d0);
      float zl = lin(texture2D(tDepth, vUv - vec2(px.x, 0.0)).r), zr = lin(texture2D(tDepth, vUv + vec2(px.x, 0.0)).r);
      float zd = lin(texture2D(tDepth, vUv - vec2(0.0, px.y)).r), zu = lin(texture2D(tDepth, vUv + vec2(0.0, px.y)).r);
      // a silhouette or a crease: the depth around bends away from the centre (relative to how far it is)
      float lap = abs(zl + zr + zu + zd - 4.0 * z0) / max(z0, 0.5);
      float e = smoothstep(depthT, depthT * 2.6, lap);
      float l0 = luma(c.rgb), lx = abs(luma(texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb) - l0) + abs(luma(texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb) - l0);
      e = max(e, smoothstep(0.22, 0.5, lx) * 0.35);
      e *= 1.0 - smoothstep(fadeNear, fadeFar, z0);
      gl_FragColor = vec4(mix(c.rgb, c.rgb * ink, clamp(e * strength, 0.0, 1.0)), c.a);
    }`,
};

const AirShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 1200 },
    invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
    fogCol: { value: new THREE.Color(0xdfe8f0) }, fogH: { value: 2.2 }, fogK: { value: 0.0 }, sun: { value: new THREE.Vector2(0.5, 0.8) }, sunCol: { value: new THREE.Color(0xffd9a0) },
    rays: { value: 0 }, heat: { value: 0 }, time: { value: 0 } },
  defines: { RAYS: 1 },
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform vec2 res, sun; uniform float near, far, fogH, fogK, rays, heat, time; uniform vec3 fogCol, sunCol; uniform mat4 invProj, camWorld; varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      // heat over lava: the picture shimmers, more toward the bottom (the ground)
      if (heat > 0.001) uv += vec2(sin(uv.y * 90.0 + time * 4.0), cos(uv.x * 70.0 + time * 3.1)) * 0.0016 * heat * (1.0 - uv.y);
      vec4 c = texture2D(tDiffuse, uv); float d = texture2D(tDepth, uv).r;
      if (fogK > 0.0001 && d < 0.99999) {
        vec4 vp = invProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w; vec3 wp = (camWorld * vec4(vp.xyz, 1.0)).xyz;
        float hf = exp(-max(wp.y, 0.0) / fogH) * (1.0 - exp(-length(vp.xyz) * fogK));
        c.rgb = mix(c.rgb, fogCol, clamp(hf, 0.0, 0.8));
      }
      #if RAYS == 1
      if (rays > 0.001) { // shafts: march toward the sun over the open sky, light adds up where it gets through
        vec2 dlt = (sun - uv) / 20.0; vec2 p = uv; float acc = 0.0, w = 1.0;
        for (int i = 0; i < 20; i++) { p += dlt; acc += step(0.99999, texture2D(tDepth, clamp(p, 0.0, 1.0)).r) * w; w *= 0.93; }
        float fall = 1.0 - smoothstep(0.0, 0.9, distance(uv, sun));
        c.rgb += sunCol * acc / 12.0 * rays * fall;
      }
      #endif
      gl_FragColor = c;
    }`,
};

// shockwaves: a ring that runs out from a slam or a meteor and bends the picture as it passes (up to four at once)
const WarpShader = {
  uniforms: { tDiffuse: { value: null }, waves: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, aspect: { value: 1.6 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec4 waves[4]; uniform float aspect; varying vec2 vUv;
    void main(){ vec2 uv = vUv; float glow = 0.0;
      for (int i = 0; i < 4; i++) { vec4 w = waves[i]; if (w.w <= 0.0) continue;
        vec2 d = (vUv - w.xy) * vec2(aspect, 1.0); float l = length(d); float x = (l - w.z) / 0.045; float band = exp(-x * x);
        uv -= (l > 1e-4 ? d / l : vec2(0.0)) / vec2(aspect, 1.0) * band * w.w * 0.035 * sign(x + 0.0001); glow += band * w.w; }
      vec4 c = texture2D(tDiffuse, uv); c.rgb += glow * 0.05; gl_FragColor = c; }`,
};

// photo mode's depth of field: what's at the focus stays sharp, nearer and farther soften (a 24-tap disc, on demand)
const DofShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 1200 }, focus: { value: 8 }, range: { value: 6 }, maxR: { value: 9 } },
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform vec2 res; uniform float near, far, focus, range, maxR; varying vec2 vUv;
    ${LIN}
    float coc(vec2 uv){ float z = lin(texture2D(tDepth, uv).r); return clamp((abs(z - focus) - range * 0.25) / range, 0.0, 1.0); }
    void main(){ float c0 = coc(vUv); vec4 acc = texture2D(tDiffuse, vUv); float wsum = 1.0;
      if (c0 > 0.01) for (int i = 1; i < 24; i++) { float fi = float(i), a = fi * 2.39996, r = sqrt(fi / 24.0) * maxR * c0;
        vec2 o = vec2(cos(a), sin(a)) * r * res; float cs = coc(vUv + o); float w = cs >= c0 * 0.5 ? 1.0 : cs * 2.0;
        acc += texture2D(tDiffuse, vUv + o) * w; wsum += w; }
      gl_FragColor = acc / wsum; }`,
};

// the grade: a 3D colour table (WebGL 2), mixed in, and the vignette
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, lut: { value: null }, amount: { value: 1 }, vig: { value: 0.22 }, aspect: { value: 1.6 } },
  vertexShader: VS,
  fragmentShader: `precision highp sampler3D; uniform sampler2D tDiffuse; uniform sampler3D lut; uniform float amount, vig, aspect; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 s = clamp(c.rgb, 0.0, 1.0);
      vec3 g = texture(lut, s * (15.0 / 16.0) + 0.5 / 16.0).rgb; c.rgb = mix(c.rgb, g, amount);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0); c.rgb *= 1.0 - vig * smoothstep(0.35, 1.05, length(d));
      gl_FragColor = c; }`,
};

// b448: medium (phones and most computers) in one pass after the bloom: the edges, the air (no shafts), tone mapping and
// sRGB, the 3D grade and the vignette. Four full-screen passes were four reads and writes of the whole picture, and a
// phone's GPU is bound by exactly that. Ultra (AO, shafts, SMAA) keeps its separate chain.
const FinalShader = {
  uniforms: { ...EdgeShader.uniforms, ...AirShader.uniforms, lut: { value: null }, amount: { value: 1 }, vig: { value: 0.22 }, aspect: { value: 1.6 }, toneMappingExposure: { value: 1 }, edgeOn: { value: 1 }, airOn: { value: 1 } },
  fragmentShader: `precision highp sampler3D; uniform sampler2D tDiffuse, tDepth; uniform sampler3D lut; uniform vec2 res, sun; uniform vec3 fogCol, sunCol; uniform mat4 invProj, camWorld;
    uniform float near, far, strength, ink, depthT, fadeNear, fadeFar, thick, fogH, fogK, rays, heat, time, amount, vig, aspect, edgeOn, airOn; varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    ${LIN}
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 uv = vUv;
      if (airOn > 0.5 && heat > 0.001) uv += vec2(sin(uv.y * 90.0 + time * 4.0), cos(uv.x * 70.0 + time * 3.1)) * 0.0016 * heat * (1.0 - uv.y);
      vec4 c = texture2D(tDiffuse, uv); float d0 = texture2D(tDepth, uv).r;
      if (d0 < 0.99999) {
        if (edgeOn > 0.5) {
          vec2 px = res * thick; float z0 = lin(d0);
          float zl = lin(texture2D(tDepth, uv - vec2(px.x, 0.0)).r), zr = lin(texture2D(tDepth, uv + vec2(px.x, 0.0)).r);
          float zd = lin(texture2D(tDepth, uv - vec2(0.0, px.y)).r), zu = lin(texture2D(tDepth, uv + vec2(0.0, px.y)).r);
          float e = smoothstep(depthT, depthT * 2.6, abs(zl + zr + zu + zd - 4.0 * z0) / max(z0, 0.5));
          float l0 = luma(c.rgb), lx = abs(luma(texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb) - l0) + abs(luma(texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb) - l0);
          e = max(e, smoothstep(0.22, 0.5, lx) * 0.35) * (1.0 - smoothstep(fadeNear, fadeFar, z0));
          c.rgb = mix(c.rgb, c.rgb * ink, clamp(e * strength, 0.0, 1.0));
        }
        if (airOn > 0.5 && fogK > 0.0001) {
          vec4 vp = invProj * vec4(uv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0); vp /= vp.w; vec3 wp = (camWorld * vec4(vp.xyz, 1.0)).xyz;
          float hf = exp(-max(wp.y, 0.0) / fogH) * (1.0 - exp(-length(vp.xyz) * fogK));
          c.rgb = mix(c.rgb, fogCol, clamp(hf, 0.0, 0.8));
        }
      }
      #if defined( ACES_FILMIC_TONE_MAPPING )
        c.rgb = ACESFilmicToneMapping(c.rgb);
      #elif defined( CUSTOM_TONE_MAPPING )
        c.rgb = CustomToneMapping(c.rgb);
      #elif defined( NEUTRAL_TONE_MAPPING )
        c.rgb = NeutralToneMapping(c.rgb);
      #endif
      c = sRGBTransferOETF(c);
      vec3 s = clamp(c.rgb, 0.0, 1.0); vec3 g = texture(lut, s * (15.0 / 16.0) + 0.5 / 16.0).rgb; c.rgb = mix(c.rgb, g, amount);
      vec2 dv = (vUv - 0.5) * vec2(aspect, 1.0); c.rgb *= 1.0 - vig * smoothstep(0.35, 1.05, length(dv));
      gl_FragColor = c;
    }`,
};

/// replace the stage's composer with the game's chain; returns controls, or null (low / saver: the plain renderer)
export function buildPost(st, { level = "medium", bloom = [0.28, 0.25, 1.15], lite = false } = {}) {
  if (level !== "medium" && level !== "ultra") return null;
  const r = st.renderer, gl2 = r.capabilities.isWebGL2, cam = st.camera, scene = st.scene;
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  const ao = level === "ultra" && gl2;
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: ao || !gl2 ? 0 : lite ? 2 : 4 }); // phones (lite): 2 samples
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y); rt.depthTexture.type = THREE.UnsignedIntType;
  const comp = new EffectComposer(r, rt);
  let depth, aoPass = null;
  if (ao) { // N8AO draws the scene itself and keeps its own depth
    return import("./vendor/three/addons/N8AO.js").then(({ N8AOPass }) => finish(N8AOPass)).catch(() => finish(null));
  }
  return Promise.resolve(finish(null));

  // b448: medium in one final pass (FinalShader); edge / air / grade are the same pass, so the controls below work as before
  function finishMerged(depth) {
    const bl = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom[0], bloom[1], bloom[2]); bl.heavy = true; comp.addPass(bl);
    bl.materialHighPassFilter.fragmentShader = bl.materialHighPassFilter.fragmentShader.replace("vec4 texel = texture2D( tDiffuse, vUv );",
      "vec4 texel = texture2D( tDiffuse, vUv ); if (!(texel.r == texel.r) || !(texel.g == texel.g) || !(texel.b == texel.b)) texel = vec4(0.0, 0.0, 0.0, 1.0); texel.rgb = min(texel.rgb, vec3(6.0));");
    bl.materialHighPassFilter.needsUpdate = true;
    const dof = new DepthPass(DofShader, depth); dof.enabled = false; dof.before = (u) => { u.near.value = cam.near; u.far.value = cam.far; }; comp.addPass(dof);
    const fin = new DepthPass(FinalShader, depth), U = fin.uniforms;
    const tm = r.toneMapping, D = fin.material.defines;
    if (tm === THREE.ACESFilmicToneMapping) D.ACES_FILMIC_TONE_MAPPING = ""; else if (tm === THREE.CustomToneMapping) D.CUSTOM_TONE_MAPPING = ""; else if (tm === THREE.NeutralToneMapping) D.NEUTRAL_TONE_MAPPING = "";
    fin.material.toneMapped = false; fin.material.needsUpdate = true; // tone mapping is done here, once (to the screen three would add its own)
    fin.before = (u) => { u.near.value = cam.near; u.far.value = cam.far; u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld); u.toneMappingExposure.value = r.toneMappingExposure; };
    comp.addPass(fin);
    const warp = new ShaderPass(WarpShader); warp.enabled = false; comp.addPass(warp);
    const flag = (k) => ({ uniforms: U, get enabled() { return U[k].value > 0.5; }, set enabled(v) { U[k].value = v ? 1 : 0; } });
    return controls({ edge: flag("edgeOn"), air: flag("airOn"), grade: { uniforms: U }, dof, warp, fx: () => null });
  }
  function finish(N8AOPass) {
    if (N8AOPass) {
      aoPass = new N8AOPass(scene, cam, size.x, size.y);
      Object.assign(aoPass.configuration, { aoRadius: 1.4, distanceFalloff: 1.2, intensity: 2.2, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, color: new THREE.Color(0x0a1420) });
      aoPass.setQualityMode && aoPass.setQualityMode("Low");
      comp.addPass(aoPass); depth = () => aoPass.beautyRenderTarget.depthTexture;
    } else { const sp = new ScenePass(scene, cam); comp.addPass(sp); depth = () => sp.depth || rt.depthTexture; }
    if (gl2 && !N8AOPass && !/[?&]post=split\b/.test(location.search)) return finishMerged(depth); // ?post=split: the old chain, to compare
    const edge = new DepthPass(EdgeShader, depth); edge.before = (u) => { u.near.value = cam.near; u.far.value = cam.far; }; comp.addPass(edge);
    const bl = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom[0], bloom[1], bloom[2]); bl.heavy = true; comp.addPass(bl);
    // what the bloom takes in is cleaned first: a pixel that isn't a number (one bad shader result on some phone GPUs)
    // and a pinpoint far brighter than anything should be (a specular glint on a glossy part) spread through the
    // bloom's small mips into big black or white squares. Not-a-number becomes black, and nothing goes above 6.
    bl.materialHighPassFilter.fragmentShader = bl.materialHighPassFilter.fragmentShader.replace("vec4 texel = texture2D( tDiffuse, vUv );",
      "vec4 texel = texture2D( tDiffuse, vUv ); if (!(texel.r == texel.r) || !(texel.g == texel.g) || !(texel.b == texel.b)) texel = vec4(0.0, 0.0, 0.0, 1.0); texel.rgb = min(texel.rgb, vec3(6.0));");
    bl.materialHighPassFilter.needsUpdate = true;
    const air = new DepthPass({ ...AirShader, defines: { RAYS: level === "ultra" ? 1 : 0 } }, depth);
    air.before = (u) => { u.near.value = cam.near; u.far.value = cam.far; u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld); };
    comp.addPass(air);
    const dof = new DepthPass(DofShader, depth); dof.enabled = false; dof.before = (u) => { u.near.value = cam.near; u.far.value = cam.far; }; comp.addPass(dof);
    comp.addPass(new OutputPass());
    const warp = new ShaderPass(WarpShader); warp.enabled = false; comp.addPass(warp);
    let grade = null;
    if (gl2) { grade = new ShaderPass(GradeShader); comp.addPass(grade); }
    let fxaa = null;
    if (ao || !gl2) { fxaa = new ShaderPass(FXAAShader); comp.addPass(fxaa); }
    // a computer at Ultra: SMAA in FXAA's place (crisper edges on fences, wires and grass; loaded only here)
    if (ao && gl2 && !lite) import("./vendor/three/addons/SMAAPass.js").then(({ SMAAPass }) => {
      const sz = r.getDrawingBufferSize(new THREE.Vector2()), sm = new SMAAPass(sz.x, sz.y), i = comp.passes.indexOf(fxaa);
      if (i >= 0) { comp.passes.splice(i, 1, sm); fxaa = null; }
    }).catch(() => { /* FXAA stays */ });
    return controls({ edge, air, grade, dof, warp, fx: () => fxaa });
  }
  // the controls the game holds (both chains): sizes, shockwaves, the air, the grade, depth of field
  function controls({ edge, air, grade, dof, warp, fx }) {
    const fit = () => { const s = r.getDrawingBufferSize(new THREE.Vector2()); { const fxaa = fx(); if (fxaa) fxaa.uniforms.resolution.value.set(1 / s.x, 1 / s.y); } if (grade) grade.uniforms.aspect.value = s.x / Math.max(1, s.y); warp.uniforms.aspect.value = s.x / Math.max(1, s.y); };
    st.useComposer(comp); fit(); addEventListener("resize", () => setTimeout(fit, 50));
    const sunV = new THREE.Vector3(); let raysWant = 0;
    const waves = [], wv = new THREE.Vector3();
    function tickWaves(dt) {
      for (let i = waves.length - 1; i >= 0; i--) { const w = waves[i]; w.t += dt; if (w.t >= w.life) waves.splice(i, 1); }
      const U = warp.uniforms.waves.value; U.forEach((v) => v.set(0, 0, 0, 0));
      waves.slice(-4).forEach((w, i) => { w.at(wv); wv.project(cam); if (wv.z > 1) return; const k = w.t / w.life; U[i].set(wv.x * 0.5 + 0.5, wv.y * 0.5 + 0.5, w.speed * w.t, w.power * (1 - k) * (1 - k)); });
      warp.enabled = waves.length > 0;
    }
    return {
      level, ao: !!aoPass, composer: comp, edge, air, grade,
      setLut(tex, amount = 1) { if (grade) { grade.uniforms.lut.value = tex; grade.uniforms.amount.value = tex ? amount : 0; } },
      setVignette(v) { if (grade) grade.uniforms.vig.value = v; },
      /// each frame: the sun's place on screen (for the shafts) and the clock
      tick(dt, sunDir) {
        air.uniforms.time.value += dt; tickWaves(dt);
        if (level === "ultra" && sunDir) { sunV.copy(cam.position).addScaledVector(sunDir, 500).project(cam); const ok = sunV.z < 1 && Math.abs(sunV.x) < 1.6 && Math.abs(sunV.y) < 1.6; air.uniforms.sun.value.set(sunV.x * 0.5 + 0.5, sunV.y * 0.5 + 0.5); air.uniforms.rays.value = ok ? raysWant : 0; }
      },
      /// the air: fog density and colour, shafts' strength (0–1), heat (0–1)
      setAir({ fog = 0, color, rays = 0, heat = 0, sunColor } = {}) { const u = air.uniforms; if (lite) { fog = fog > 0.006 ? fog : 0; rays = 0; } air.enabled = fog > 0.0001 || heat > 0.001 || rays > 0.001; /* phones: only a ground's own fog and heat */ u.fogK.value = fog; if (color) u.fogCol.value.copy(color); raysWant = rays; u.heat.value = heat; if (sunColor) u.sunCol.value.copy(sunColor); },
      setEdges(on) { edge.enabled = !!on; },
      /// a shockwave: at() writes its world position (it may move), power 0–1.5, speed in screen heights a second
      shock(at, { power = 1, speed = 1.1, life = 0.6 } = {}) { waves.push({ at, power, speed, life, t: 0 }); if (waves.length > 6) waves.shift(); },
      /// photo mode's depth of field: focus (metres from the camera), range (how deep the sharp part is); null turns it off
      setDof(o) { if (!o) { dof.enabled = false; return; } dof.enabled = true; const u = dof.uniforms; u.focus.value = o.focus ?? 8; u.range.value = o.range ?? 6; u.maxR.value = o.blur ?? 9; },
      dof,
      setAO(on) { if (aoPass) aoPass.configuration.intensity = on ? 2.2 : 0; },
    };
  }
}
