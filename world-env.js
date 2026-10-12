// world-env.js — the living ground: grass blades that sway and lie down where you walk, rolling hills round the edge
// of the world, a sky with drifting layered cloud, and water with foam at its edges and a floor you can see through.
// All of it is shader work on a handful of meshes, sized by the quality setting (no grass on Low / Saver).
//
// Grass: one instanced mesh of blades in a square that follows you. Each blade's place is wrapped round the square in
// the vertex shader (so the square never moves on the CPU), its height comes from a mask of where grass may grow
// (not on the plaza, the paths, under the halls or inside a hunting ground) and it fades out at the square's edge.
// It writes no depth, so the ink edges and the AO in world-post.js don't outline every blade.
import * as THREE from "./vendor/three/three-0.169.0.module.min.js";

/* ---------------- the grass mask: where blades may grow, painted from what stands on the ground ---------------- */
/// planet: the world group; extent: the side of the square it covers (metres); size: texture pixels
export function grassMask({ planet, extent = 680, size = 512, zones = [], clear = [], skip = new Set(["ground", "zones", "combat", "life", "ghosts", "zone-air", "airship", "race", "island", "raid", "grass", "hills"]) }) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const g = cv.getContext("2d"), px = size / extent, toPx = (v) => (v + extent / 2) * px;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const box = new THREE.Box3(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), inv = new THREE.Matrix4();
  function paint() {
    g.fillStyle = "#000"; g.fillRect(0, 0, size, size);
    // the meadow: a soft disc a little inside the ground's edge
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, 300 * px);
    grd.addColorStop(0, "#fff"); grd.addColorStop(0.9, "#fff"); grd.addColorStop(1, "#000");
    g.fillStyle = grd; g.beginPath(); g.arc(size / 2, size / 2, 300 * px, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#000";
    const hole = (x, z, r) => { g.beginPath(); g.arc(toPx(x), toPx(z), Math.max(1, r * px), 0, Math.PI * 2); g.fill(); };
    // the hunting grounds have floors of their own (a ring of short grass is left round the posts)
    for (const zn of zones) hole(zn.x, zn.z, zn.r - 0.5);
    for (const c of clear) hole(c.x, c.z, c.r); // the plaza (it is part of the ground mesh, so the walk below skips it)
    planet.updateMatrixWorld(true); inv.copy(planet.matrixWorld).invert();
    const walk = (o) => {
      if (!o.visible || skip.has(o.name) || o.isSprite || o.isPoints || o.isLine || o.userData.noBake) return;
      if (o.isInstancedMesh && o.count > 0) {
        // stepping stones and other flat things laid out in rows: a hole under each one
        o.geometry.computeBoundingBox(); const gb = o.geometry.boundingBox; if (gb.max.y - gb.min.y > 0.5) return;
        const r = Math.max(gb.max.x - gb.min.x, gb.max.z - gb.min.z) * 0.62 + 0.25;
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld).premultiply(inv); v.setFromMatrixPosition(m4); hole(v.x, v.z, r); }
        return;
      }
      if (o.isMesh && o.geometry) {
        box.setFromObject(o); box.applyMatrix4(inv);
        const w = box.max.x - box.min.x, d = box.max.z - box.min.z;
        // something standing on the ground and not huge: clear a patch the size of its footprint
        if (box.min.y < 0.6 && w < 30 && d < 30 && w > 0.2) { g.beginPath(); g.ellipse(toPx((box.min.x + box.max.x) / 2), toPx((box.min.z + box.max.z) / 2), Math.max(1, (w / 2 + 0.3) * px), Math.max(1, (d / 2 + 0.3) * px), 0, 0, Math.PI * 2); g.fill(); }
        return;
      }
      for (const c of o.children) walk(c);
    };
    for (const c of planet.children) walk(c);
    tex.needsUpdate = true;
  }
  paint();
  return { tex, extent, paint, canvas: cv };
}

/* ---------------- grass ---------------- */
const BLADE_VS = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute vec4 aRnd; // x, z in [0,1): the blade's place in the square; w: height; z… unused
  uniform vec2 uCenter; uniform float uSize, uTime; uniform vec2 uWind; uniform vec3 uPush;
  uniform sampler2D uMask; uniform float uMaskExt;
  uniform sampler2D gsTex; uniform mat4 gsM; uniform float gsOn, gsK;
  varying float vY, vShade, vTone;
  void main() {
    vec2 off = fract(aRnd.xy - uCenter / uSize + 0.5) - 0.5;
    vec2 p = uCenter + off * uSize;
    float edge = 1.0 - smoothstep(0.24, 0.5, length(off)); // a round, soft edge (a square one shows as a diamond from above)
    float m = texture2D(uMask, p / uMaskExt + 0.5).r;
    float h = (0.28 + aRnd.w * 0.36) * smoothstep(0.35, 0.8, m) * edge;
    float rot = aRnd.z * 6.2831;
    vec3 pos = position; pos.y *= h;
    float y = position.y;
    // the blade turned round its root
    float c = cos(rot), s = sin(rot);
    pos.xz = mat2(c, -s, s, c) * pos.xz;
    // the wind: a slow swell across the meadow and a quick flutter
    float sw = sin(uTime * 1.4 + p.x * 0.11 + p.y * 0.07) * 0.6 + sin(uTime * 3.1 + p.x * 0.7 + p.y * 0.5) * 0.25;
    vec2 bend = uWind * (0.6 + sw);
    // walking through it: blades within a metre and a half lie down away from you
    vec2 d = p - uPush.xy; float dl = length(d);
    float push = (1.0 - smoothstep(0.2, uPush.z, dl));
    bend += (dl > 0.001 ? d / dl : vec2(0.0)) * push * 1.1;
    pos.y *= 1.0 - push * 0.55;
    pos.xz += bend * y * y * h + vec2(c, s) * (aRnd.w - 0.5) * 0.5 * y * h; // and a lean of its own
    vec3 wp = vec3(p.x, 0.0, p.y) + pos;
    vY = y; vTone = aRnd.w;
    // the far shade (world-look.js groundShadow): halls and trees darken the blades in their shadow
    vShade = 1.0;
    if (gsOn > 0.5) { vec4 sc = gsM * vec4(p.x, 0.05, p.y, 1.0); vec3 sp = sc.xyz * 0.5 + 0.5;
      if (sp.x > 0.0 && sp.x < 1.0 && sp.y > 0.0 && sp.y < 1.0) vShade = 1.0 - step(texture2D(gsTex, sp.xy).r, sp.z - 0.0015) * 0.45 * gsK / 0.4; }
    vec4 mvPosition = modelViewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const BLADE_FS = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uRoot, uTip, uDry, uSun; uniform float uLight;
  varying float vY, vShade, vTone;
  void main() {
    vec3 tip = mix(uTip, uDry, smoothstep(0.8, 1.0, vTone) * 0.35);
    vec3 col = mix(uRoot, tip, smoothstep(0.0, 1.0, vY));
    col *= mix(0.55, 1.0, vY) * uLight * vShade;
    col += uSun * pow(vY, 3.0) * 0.12 * uLight; // the tips catch the sun
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/// the meadow. count: blades; size: the square that follows you (metres)
export function makeGrass({ count = 40000, size = 64, mask, gshadow = null }) {
  // a blade: a tapered strip in three bends and a tip, rooted at y = 0, one unit tall
  const W = 0.075, ys = [0, 0.3, 0.62, 1], pos = [];
  ys.forEach((y, i) => { const w = W * (1 - y * 0.85); if (i < 3) pos.push(-w, y, 0, w, y, 0); else pos.push(0, y, 0); });
  const idx = []; for (let i = 0; i < 2; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } idx.push(4, 5, 6);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const rnd = new Float32Array(count * 4); let s = 7;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < count; i++) { rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r(); }
  geo.setAttribute("aRnd", new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); // it is placed in the shader
  const gsU = gshadow ? gshadow.uniforms : { gsTex: { value: null }, gsM: { value: new THREE.Matrix4() }, gsOn: { value: 0 }, gsK: { value: 0.4 } };
  const U = {
    uCenter: { value: new THREE.Vector2() }, uSize: { value: size }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.18, 0.08) }, uPush: { value: new THREE.Vector3(0, 0, 1.5) },
    uMask: { value: mask.tex }, uMaskExt: { value: mask.extent },
    uRoot: { value: new THREE.Color(0x2c5a2a) }, uTip: { value: new THREE.Color(0x7cc65a) }, uDry: { value: new THREE.Color(0xc8c070) }, uSun: { value: new THREE.Color(0xfff2c0) }, uLight: { value: 1 },
    gsTex: gsU.gsTex, gsM: gsU.gsM, gsOn: gsU.gsOn, gsK: gsU.gsK,
  };
  const mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), vertexShader: BLADE_VS, fragmentShader: BLADE_FS, fog: true, side: THREE.DoubleSide, depthWrite: false });
  Object.assign(mat.uniforms, U); // shared objects, so the shadow uniforms stay live
  const mesh = new THREE.Mesh(geo, mat); mesh.name = "grass"; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.userData.noBake = true;
  const day = new THREE.Color(), night = new THREE.Color(0x0e1a14);
  return {
    mesh, uniforms: U,
    /// px, pz: you, in the world group's coordinates; light: 0 night … 1 day
    tick(dt, px, pz) { U.uTime.value += dt; U.uCenter.value.set(px, pz); U.uPush.value.x = px; U.uPush.value.y = pz; },
    setLight(k, tint = null) { U.uLight.value = 0.42 + 0.58 * k; if (tint) { day.set(tint); U.uTip.value.copy(day).lerp(night, (1 - k) * 0.45); } },
    setWind(x, z) { U.uWind.value.set(x, z); },
  };
}

/* ---------------- hills: a heightfield ring round the edge of the world ---------------- */
// The town and the grounds stay flat (fights, halls and paths are placed on y = 0); past them the land rolls up into
// hills, grass on the gentle slopes, earth on the steep ones and rock on the tops, fading into the fog.
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1); return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz; };
const fbm = (x, z) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { v += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return v; };
/// how high the land is at (x, z) in the world group's coordinates (0 everywhere you walk and fight)
export function heightAt(x, z, inner = 228, outer = 420) {
  const d = Math.hypot(x, z); if (d <= inner) return 0;
  const k = Math.min(1, (d - inner) / (outer - inner)), rise = k * k * (3 - 2 * k);
  return rise * (10 + fbm(x * 0.012, z * 0.012) * 46) + Math.max(0, fbm(x * 0.03 + 9, z * 0.03) - 0.45) * 14 * rise;
}
export function makeHills({ inner = 228, outer = 430, rings = 44, segs = 220 } = {}) {
  const pos = [], col = [], idx = [];
  const grass = new THREE.Color(0x4f8a4a), earth = new THREE.Color(0x8a7050), rock = new THREE.Color(0x9a9a92), far = new THREE.Color(0x5f8a8a), c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, rr = inner - 6 + (outer - inner + 6) * Math.pow(t, 1.35);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = heightAt(x, z, inner, outer) - (i === 0 ? 0.2 : 0);
      pos.push(x, y, z);
      // slope from the neighbours: steep is earth, high is rock, the far rim goes blue-green into the haze
      const e = 1.5, gx = heightAt(x + e, z, inner, outer) - heightAt(x - e, z, inner, outer), gz = heightAt(x, z + e, inner, outer) - heightAt(x, z - e, inner, outer);
      const slope = Math.min(1, Math.hypot(gx, gz) / (2 * e) * 1.4);
      c.copy(grass).lerp(earth, Math.max(0, Math.min(1, (slope - 0.35) * 2.2))).lerp(rock, Math.max(0, Math.min(1, (y - 34) / 14)));
      c.lerp(far, t * 0.35).multiplyScalar(0.92 + hash(x, z) * 0.12);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + ((j + 1) % segs), c2 = a + segs, d = b + segs; idx.push(a, c2, b, b, c2, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: false }));
  mesh.name = "hills"; mesh.receiveShadow = true; mesh.userData.noBake = true;
  return mesh;
}

/* ---------------- the sky: a gradient dome with two layers of drifting cloud and the sun's glow ---------------- */
export function makeSkyDome() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x050a18) }, mid: { value: new THREE.Color(0x0a1a2e) }, glow: { value: new THREE.Color(0x0f3f4a) },
      uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.4, 0.6, -0.5) }, uSunCol: { value: new THREE.Color(0xfff0d0) },
      uCloudLit: { value: new THREE.Color(0xffffff) }, uCloudShade: { value: new THREE.Color(0x9fb0c8) }, uCover: { value: 0.48 }, uCloudK: { value: 1 },
    },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: /* glsl */`
      uniform vec3 top, mid, glow, uSunCol, uCloudLit, uCloudShade; uniform vec3 uSun; uniform float uTime, uCover, uCloudK; varying vec3 vP;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = mix(mid, top, smoothstep(0.0, 0.7, h)); c = mix(c, glow, smoothstep(0.25, -0.25, h) * 0.85);
        // the sun's glow round where it stands
        vec3 sd = normalize(uSun); float sa = max(dot(d, sd), 0.0);
        c += uSunCol * (pow(sa, 8.0) * 0.18 + pow(sa, 200.0) * 0.9) * uCloudK;
        // clouds: projected onto a high flat layer, two drifts at different speeds; thin near the horizon
        if (h > 0.02) {
          vec2 uv = d.xz / (h + 0.12) * 1.6;
          float a = fbm(uv * 1.1 + vec2(uTime * 0.006, uTime * 0.002));
          float b = fbm(uv * 2.6 - vec2(uTime * 0.011, -uTime * 0.004));
          float dens = smoothstep(uCover, uCover + 0.28, a * 0.72 + b * 0.38) * smoothstep(0.02, 0.22, h);
          float lit = smoothstep(0.2, 0.9, fbm(uv * 2.6 + sd.xz * 0.5 - vec2(uTime * 0.011, 0.0)));
          vec3 cc = mix(uCloudShade, uCloudLit, lit) + uSunCol * pow(sa, 6.0) * 0.35;
          c = mix(c, cc, dens * 0.85 * uCloudK);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), m); sky.renderOrder = -1; return sky;
}

/* ---------------- water: foam at the edge, the floor seen through it, sky in it at a glance ---------------- */
/// a material for a round pool (radius r, in the mesh's own units, the mesh being a CircleGeometry lying flat)
export function waterMat({ r = 4, color = 0x2aa6c8, deep = 0x0c4a66, foam = 0xeaffff, opacity = 0.88, glow = 0 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uR: { value: r }, uCol: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) }, uFoam: { value: new THREE.Color(foam) },
      uSky: { value: new THREE.Color(0xbfe0ff) }, uOp: { value: opacity }, uGlow: { value: glow }, uLight: { value: 1 },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vL; varying vec3 vW, vN;
      void main(){ vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uR, uOp, uGlow, uLight; uniform vec3 uCol, uDeep, uFoam, uSky; varying vec2 vL; varying vec3 vW, vN;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
      void main(){
        float d = length(vL) / uR;
        // ripples bend the view of the floor: caustic light dancing on it, darker towards the middle
        vec2 q = vL * 1.6; float t = uTime;
        float w1 = n2(q + vec2(t * 0.6, t * 0.4)), w2 = n2(q * 1.7 - vec2(t * 0.5, -t * 0.3));
        float caus = pow(1.0 - abs(w1 - w2), 7.0);
        vec3 c = mix(uCol, uDeep, smoothstep(0.1, 0.95, 1.0 - d) * 0.55) + vec3(0.55, 0.8, 0.85) * caus * 0.35;
        // the sky at a glance
        vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - max(dot(V, vN), 0.0), 3.0);
        c = mix(c, uSky, fr * 0.6);
        // foam: a broken band hugging the rim that breathes in and out
        float band = smoothstep(0.80 + 0.05 * sin(t * 1.3 + w1 * 6.0), 0.97, d) * (0.55 + 0.45 * n2(vL * 5.0 + t * 0.8));
        c = mix(c, uFoam, clamp(band, 0.0, 1.0) * 0.9);
        c *= uLight; c += uCol * uGlow;
        gl_FragColor = vec4(c, mix(uOp, 1.0, band * 0.6));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  m.userData.water = true;
  return m;
}

/* ---------------- one palette: the asset packs' colours pulled towards the town's ---------------- */
// Kenney, KayKit and Quaternius each paint in their own tones. Every material from the packs gets a small shader step:
// its colour (texture × tint) is pulled part of the way to the nearest colour of ARCIRCLE World's palette, keeping its
// brightness, and the finish is evened out (no mirror-shiny plastic next to matte ceramic).
const PALETTE = [0xdfe6ee, 0xbfc9d4, 0x2a3446, 0x3f8fe8, 0x35d8d0, 0x48b85a, 0x4f8a4a, 0xffc861, 0xff7a3c, 0xff5f73, 0xff7ad9, 0xb48cff, 0x7a5236, 0xd8c08a, 0x8a9aa8, 0x1a2230];
const PAL = PALETTE.map((h) => new THREE.Color(h)); // linear
const PULL = { value: 0.38 };
const done = new WeakSet();
export function unifyMaterial(m, pull = PULL) {
  if (!m || done.has(m) || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)) return;
  done.add(m);
  if (m.isMeshStandardMaterial) { m.roughness = Math.max(0.42, Math.min(0.9, m.roughness)); if (!(m.emissiveIntensity > 0.5 && m.emissive && m.emissive.getHex())) m.metalness = Math.min(m.metalness, 0.35); }
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => "";
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uPal = { value: PAL }; sh.uniforms.uPull = pull;
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform vec3 uPal[${PAL.length}]; uniform float uPull;`).replace("#include <color_fragment>", `#include <color_fragment>
      { vec3 pc = diffuseColor.rgb; float best = 1e9; vec3 bc = pc;
        for (int i = 0; i < ${PAL.length}; i++) { vec3 d = pc - uPal[i]; float e = dot(d, d); if (e < best) { best = e; bc = uPal[i]; } }
        float lp = dot(pc, vec3(0.2126, 0.7152, 0.0722)), lb = max(dot(bc, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
        diffuseColor.rgb = mix(pc, clamp(bc * (lp / lb), 0.0, 1.0), uPull); }`);
  };
  m.customProgramCacheKey = () => prevKey() + "|pal"; m.needsUpdate = true;
}
export function unifyPalette(root, pull = PULL) {
  const each = (o) => o.traverse((x) => { if (x.isMesh && x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach((m) => unifyMaterial(m, pull)); });
  if (root && root.isObject3D) each(root); else if (root) for (const k of Object.keys(root)) { const v = root[k]; if (v && v.scene) each(v.scene); else if (v && v.isObject3D) each(v); }
}
export const paletteStrength = PULL;
