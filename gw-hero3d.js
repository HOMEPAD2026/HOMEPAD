// gw-hero3d.js — the game site's 3D hero (game.html, loaded by gw.js only when asked for): the very models the game
// draws (world-kit.js makeCharacter), turning slowly; drag turns it, a colour tints it (world-kit.js HERO_TINTS), Wave
// plays the game's own "emote-yes" (a CU_AS clip, like everywhere else; it stands in "idle" otherwise).
import * as THREE from "./vendor/three/three-0.186.1.module.min.js";
import * as K from "./world-kit.js";

export const TINTS = K.HERO_TINTS;
/// mount(canvas, { ver }) → { show(id, tint), tint(i), wave(), dispose() }
export async function mount(canvas, o = {}) {
  // the kit's stage sets up its model loaders (meshopt, KTX2 textures) — on a tiny canvas of its own
  const tiny = document.createElement("canvas"); tiny.width = tiny.height = 8;
  try { K.makeStage(tiny, {}); } catch (e) { console.warn("hero3d stage:", e); }
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x203040, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(2, 4, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x38e8ff, 2.2); rim.position.set(-3, 2, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xff6fc8, 1.1); rim2.position.set(3, 1, -3); scene.add(rim2);
  try { const { RoomEnvironment } = await import("./vendor/three/addons/RoomEnvironment.js"); const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch { /* lit by the lights */ }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.18, depthWrite: false })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
  const cache = {}; let hero = null, yaw = 0.5, spinV = 0, drag = null, alive = true, last = performance.now(), tintI = 0;
  const size = () => { const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size(); const ro = new ResizeObserver(size); ro.observe(canvas);
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: yaw }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x; yaw = drag.y + dx * 0.012; spinV = 0; });
  const up = () => { drag = null; }; canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  let visible = true; const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(canvas);
  function frame(now) {
    if (!alive) return; requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!visible || document.hidden) return;
    if (hero) { if (!drag) yaw += 0.25 * dt; hero.obj.rotation.y = yaw; hero.update(dt, now / 1000); }
    r.render(scene, cam);
  }
  requestAnimationFrame(frame);
  async function show(id, tint) {
    if (!cache[id]) {
      const h = await K.makeCharacter(id, o.ver || ""); h.obj.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
      const b = new THREE.Box3().setFromObject(h.obj), sz = b.getSize(new THREE.Vector3()); h.size = sz; h.base = b.min.y; cache[id] = h;
    }
    if (hero) scene.remove(hero.obj);
    hero = cache[id]; scene.add(hero.obj); hero.obj.position.y = -hero.base; hero.play("idle");
    if (tint != null) setTint(tint);
    const H = hero.size.y, d = (H * 1.25) / 2 / Math.tan((cam.fov * Math.PI) / 360);
    cam.position.set(0, H * 0.55, d); cam.lookAt(0, H * 0.48, 0); floor.scale.setScalar(Math.max(hero.size.x, hero.size.z) * 0.9);
  }
  function setTint(i) { tintI = i | 0; if (hero && hero.setTint) hero.setTint(tintI); }
  function wave() { if (!hero || (hero.busy && hero.busy())) return; hero.play("emote-yes", { once: true }); }
  return { show, tint: setTint, wave, clip: () => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name) : []), dispose: () => { alive = false; ro.disconnect(); io.disconnect(); r.dispose(); } };
}
