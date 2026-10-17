// world-jurgate.js — the Jurassic Portal Gate, drawn (the owner's concept card 01_jurassic_portal_gate: a round arch of
// old carved stone under moss, a swirl of ARCIRCLE blue energy inside, the ∞ on the keystone, cyan lamps in the side
// pillars). Stands in town (world-play.js) and as the gate home in Jurassic World (world-jurassic.js) until the
// jurassic_portal_gate.glb arrives.
export function makeJurassicGate(THREE, K, name, { low = false } = {}) {
  const g = new THREE.Group(); g.name = "jurassic-gate";
  const CY = 2.75, RR = 2.55; // the arch's centre and radius (its foot on the ground)
  let sd = 19; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: 1, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6e6a60, roughness: 1, flatShading: true });
  const moss = new THREE.MeshStandardMaterial({ color: 0x4f7a2c, roughness: 1, flatShading: true });
  const lamp = new THREE.MeshStandardMaterial({ color: 0x0b2a3a, emissive: 0x35d8ff, emissiveIntensity: 2.2, roughness: 0.4 });
  // the arch: carved blocks round the circle, each a little off true, a few under moss
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.95, 1.1), i % 3 ? stone : dark);
    b.position.set(Math.cos(a) * RR, CY + Math.sin(a) * RR, 0); b.rotation.z = a + Math.PI / 2 + (rnd() - 0.5) * 0.08; b.rotation.y = (rnd() - 0.5) * 0.06; g.add(b);
    // a cyan rune on the inner face of every other block
    if (i % 2 === 0 && Math.sin(a) > -0.6) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.04), lamp); r.position.set(Math.cos(a) * (RR - 0.2), CY + Math.sin(a) * (RR - 0.2), 0.57); r.rotation.z = a + Math.PI / 2; g.add(r); }
    if (Math.sin(a) > 0.2 && rnd() < 0.55) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), moss); m.position.set(Math.cos(a) * (RR + 0.25), CY + Math.sin(a) * (RR + 0.3), 0.1 + rnd() * 0.3); m.scale.set(1.4, 0.55, 1.2); m.rotation.z = a; g.add(m); }
  }
  // the keystone with the ∞
  const key = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 1.25), stone); key.position.set(0, CY + RR + 0.1, 0); g.add(key);
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128; const c2 = cv.getContext("2d");
  c2.strokeStyle = "#7ff3ff"; c2.lineWidth = 14; c2.shadowColor = "#35d8ff"; c2.shadowBlur = 18; c2.beginPath();
  for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.05) { const d = 1 + Math.sin(t) ** 2, x = 128 + (90 * Math.cos(t)) / d, y = 64 + (90 * Math.sin(t) * Math.cos(t)) / d; if (t === 0) c2.moveTo(x, y); else c2.lineTo(x, y); }
  c2.stroke(); const infT = new THREE.CanvasTexture(cv); infT.colorSpace = THREE.SRGBColorSpace;
  const inf = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.62), new THREE.MeshBasicMaterial({ map: infT, transparent: true, depthWrite: false, toneMapped: false }));
  inf.position.set(0, CY + RR + 0.1, 0.64); g.add(inf);
  // side pillars with a lamp each, and a step of flat stones in front
  [-1, 1].forEach((s) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.4, 1.0), dark); p.position.set(s * (RR + 1.15), 1.7, 0); g.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.35, 1.25), stone); cap.position.set(s * (RR + 1.15), 3.55, 0); g.add(cap);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.06), lamp); l.position.set(s * (RR + 1.15), 1.9, 0.52); g.add(l);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 5, 1, true), moss); f.position.set(s * (RR + 0.4), 0.45, 0.7); g.add(f);
  });
  const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 1.6), stone); step.position.set(0, 0.09, 0.9); g.add(step);
  // the energy: a swirl in ARCIRCLE blue, brighter at the rim, turning slowly
  const uni = { t: { value: 0 } };
  const veil = new THREE.Mesh(new THREE.CircleGeometry(RR - 0.42, low ? 32 : 64), new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: "varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float t; varying vec2 vU;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){ float r = length(vU), a = atan(vU.y, vU.x);
        float sw = n(vec2(a * 2.0 + r * 6.0 - t * 1.4, r * 5.0 - t * 0.6)) * 0.6 + n(vec2(a * 5.0 - r * 9.0 + t, r * 11.0)) * 0.4;
        float vein = smoothstep(0.62, 0.7, sw) * 0.9;
        vec3 c = mix(vec3(0.05, 0.25, 0.75), vec3(0.2, 0.75, 1.0), sw) + vec3(0.6, 0.95, 1.0) * vein + vec3(0.4, 0.9, 1.0) * smoothstep(0.7, 1.0, r) * 0.9;
        gl_FragColor = vec4(c, (0.78 + vein * 0.2) * smoothstep(1.0, 0.94, r)); }` }));
  veil.position.set(0, CY, 0.02); g.add(veil);
  const glow = new THREE.PointLight(0x35b8ff, 6, 9, 2); glow.position.set(0, CY, 1.4); if (!low) g.add(glow);
  const tag = K.label(name, { accent: "#2ee07a", size: 0.9 }); tag.position.y = CY + RR + 1.6; g.add(tag);
  g.userData = { spin: [(dt, t) => { uni.t.value = t; }], radius: 2.2, tag };
  return g;
}
