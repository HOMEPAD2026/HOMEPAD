// world-store-view.js — the Asset Store's 3D preview (2026-10-29, the owner: "like /game's Try them in 3D"): the very file a
// creator gets, turning slowly on a lit stand; drag turns it, the wheel / a pinch zooms, a character plays its own clips
// (Idle / Walk / Run / Wave — the names Meshy's rig gave them). Loaded only when a preview is opened; one renderer, let go
// on close. openPreview(item, { T, esc, ver }) → Promise<void>
import * as THREE from "./vendor/three/three-0.186.1.module.min.js";
import * as K from "./world-kit.js";
import { storeGlb } from "./world-store-data.js";

let staged = false;
export async function openPreview(it, o = {}) {
  const T = o.T || ((s) => s), esc = o.esc || ((s) => String(s)), ver = o.ver || "";
  if (!staged) { staged = true; const tiny = document.createElement("canvas"); tiny.width = tiny.height = 8; try { K.makeStage(tiny, {}); } catch (e) { console.warn("store view stage:", e); } } // (sets up the kit's loaders: meshopt + KTX2)
  const box = document.createElement("div"); box.className = "wsv"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
  box.innerHTML = `<div class="wsv-in"><header><b>${esc(T(it.name))}</b><small>${esc(T(it.free ? "Free" : "Premium"))} · ${esc(T(it.line))}</small><button type="button" class="wsv-x" aria-label="${esc(T("Close"))}">✕</button></header>
    <div class="wsv-stage"><canvas></canvas><p class="wsv-load">${esc(T("Loading the model…"))}</p><p class="wsv-hint">${esc(T("Drag to turn · scroll or pinch to zoom"))}</p></div><div class="wsv-clips"></div></div>`;
  document.body.appendChild(box);
  const canvas = box.querySelector("canvas"), r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x203040, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(2, 4, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x38e8ff, 2.0); rim.position.set(-3, 2, -3); scene.add(rim);
  try { const { RoomEnvironment } = await import("./vendor/three/addons/RoomEnvironment.js"); const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch { /* lights only */ }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.16, depthWrite: false })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
  let model = null, mixer = null, yaw = 0.6, pitch = 0.18, zoom = 1, dist = 3, aimY = 1, drag = null, alive = true, last = performance.now(), cur = null;
  const pts = new Map();
  const size = () => { const w = canvas.clientWidth || 400, h = canvas.clientHeight || 400; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size(); const ro = new ResizeObserver(size); ro.observe(canvas);
  canvas.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return; const was = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d1 = Math.hypot(a[0] - b[0], a[1] - b[1]), o0 = [...pts.entries()].find(([k]) => k !== e.pointerId)[1], d0 = Math.hypot(was[0] - o0[0], was[1] - o0[1]); if (d0 > 0) zoom = Math.max(0.45, Math.min(2.2, zoom * (d0 / d1))); drag = null; return; }
    if (!drag) return; yaw = drag.yaw + (e.clientX - drag.x) * 0.012; pitch = Math.max(-0.2, Math.min(0.9, drag.pitch + (e.clientY - drag.y) * 0.006)); });
  const up = (e) => { pts.delete(e.pointerId); if (!pts.size) drag = null; }; canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.max(0.45, Math.min(2.2, zoom * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  function frame(now) {
    if (!alive) return; requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!drag && !pts.size) yaw += 0.35 * dt; if (mixer) mixer.update(dt);
    const d = dist * zoom; cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, aimY + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d); cam.lookAt(0, aimY, 0);
    r.render(scene, cam);
  }
  requestAnimationFrame(frame);
  const close = () => { if (!alive) return; alive = false; ro.disconnect(); removeEventListener("keydown", key, true);
    scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); const ms = m.material ? [].concat(m.material) : []; for (const x of ms) { for (const k of ["map", "normalMap", "emissiveMap", "metalnessMap", "roughnessMap"]) if (x[k]) x[k].dispose(); x.dispose(); } });
    r.dispose(); box.remove(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  addEventListener("keydown", key, true);
  box.addEventListener("click", (e) => { if (e.target === box || e.target.closest(".wsv-x")) close(); const c = e.target.closest("[data-clip]"); if (c && mixer) play(c.dataset.clip); });
  let acts = {};
  function play(n) { const a = acts[n]; if (!a || a === cur) return; a.reset().fadeIn(0.25).play(); if (cur) cur.fadeOut(0.25); cur = a; box.querySelectorAll("[data-clip]").forEach((b) => b.classList.toggle("on", b.dataset.clip === n)); }
  try {
    const gl = await K.gltfLoader().loadAsync(storeGlb(it, ver)); if (!alive) return;
    model = gl.scene; model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    const b = new THREE.Box3().setFromObject(model), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), k = 2 / Math.max(sz.x, sz.y, sz.z, 0.001);
    model.scale.setScalar(k); model.position.set(-c.x * k, -b.min.y * k, -c.z * k); scene.add(model);
    const H = sz.y * k, W = Math.max(sz.x, sz.z) * k; aimY = H * 0.48; dist = Math.max(H, W) * 1.25 / Math.tan((cam.fov * Math.PI) / 360) * 0.5 + W * 0.4; floor.scale.setScalar(W * 0.75);
    if (gl.animations && gl.animations.length) { mixer = new THREE.AnimationMixer(model); for (const cl of gl.animations) acts[cl.name] = mixer.clipAction(cl);
      const names = Object.keys(acts); box.querySelector(".wsv-clips").innerHTML = names.map((n) => `<button type="button" data-clip="${esc(n)}">${esc(T(n.replace(/_/g, " ")))}</button>`).join("");
      play(names.find((n) => /idle/i.test(n)) || names[0]); }
    box.querySelector(".wsv-load").remove();
  } catch (e) { const l = box.querySelector(".wsv-load"); if (l) l.textContent = T("Couldn't load the model — try again"); console.warn("store view:", e); }
}
