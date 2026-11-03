// arcl-coin3d.js — /arcl's spinning ARCL coin: Meshy's model (models/arcl/coin.glb, packed meshopt + WebP) in a small
// three.js canvas of its own, made when the page is idle (arcl.js) and drawn only while it's on screen. Drag to spin it.
// Any failure leaves the picture that was there (arcl.html .al-coin3d img).
import * as THREE from "/vendor/three/three-0.186.1.module.min.js";
import { GLTFLoader } from "/vendor/three/addons/GLTFLoader.js";
import { MeshoptDecoder } from "/vendor/three/addons/meshopt_decoder.module.js";
import { RoomEnvironment } from "/vendor/three/addons/RoomEnvironment.js";

export async function mount(box) {
  const W = () => box.clientWidth || 160;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(W(), W()); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0, 4.2);
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35; pm.dispose();
  const key = new THREE.DirectionalLight(0xe6ff80, 2.2); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x3ccbff, 2.5); rim.position.set(-3, -1, -2); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const g = await loader.loadAsync("/models/arcl/coin.glb?v=1793606310");
  // the coin glows in its own blue (its colour map as an emissive map), less mirror-like than Meshy's PBR set
  g.scene.traverse((o) => { if (!o.isMesh || !o.material) return; const m = o.material; if (m.map) { m.emissiveMap = m.map; m.emissive = new THREE.Color(0x1f7bff); m.emissiveIntensity = 0.8; } m.color = new THREE.Color(0x5aa8ff); m.metalness = Math.min(m.metalness ?? 1, 0.55); m.roughness = Math.max(m.roughness ?? 0.4, 0.28); m.needsUpdate = true; });
  const coin = g.scene, b = new THREE.Box3().setFromObject(coin), s = new THREE.Vector3(); b.getSize(s); const c = new THREE.Vector3(); b.getCenter(c);
  coin.position.sub(c); const k = 2 / Math.max(s.x, s.y, s.z); const pivot = new THREE.Group(); pivot.add(coin); pivot.scale.setScalar(k);
  // the coin's face toward the camera: its thinnest axis is the one it spins around
  if (s.z > s.x && s.z > s.y) coin.rotation.x = Math.PI / 2; else if (s.x < s.y && s.x < s.z) coin.rotation.y = Math.PI / 2;
  scene.add(pivot);
  box.appendChild(r.domElement); box.classList.add("gl");
  let seen = true, spin = 1.1, drag = null, ang = 0;
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => { seen = es[0].isIntersecting; }).observe(box);
  box.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, a: ang }; box.setPointerCapture(e.pointerId); });
  box.addEventListener("pointermove", (e) => { if (!drag) return; ang = drag.a + (e.clientX - drag.x) * 0.02; });
  box.addEventListener("pointerup", () => { drag = null; spin = 6; });
  addEventListener("resize", () => r.setSize(W(), W()));
  const clock = new THREE.Clock();
  r.setAnimationLoop(() => {
    if (!seen || document.hidden) return;
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    if (!drag) { spin += (1.1 - spin) * dt * 1.5; ang += spin * dt; }
    pivot.rotation.y = ang; pivot.position.y = Math.sin(t * 1.6) * 0.06; pivot.rotation.z = Math.sin(t * 0.9) * 0.08;
    r.render(scene, cam);
  });
}
