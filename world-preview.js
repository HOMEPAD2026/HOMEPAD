// world-preview.js — a small turning 3D view inside a panel: your character as it stands, with its gear on (the
// character sheet), or the selected weapon (its card). One extra canvas, created the first time it is needed and
// moved into whichever panel shows a preview; it stops drawing when the panel closes or repaints. Drag turns it.
import * as THREE from "./vendor/three/three-0.169.0.module.min.js";
import * as SkeletonUtils from "./vendor/three/addons/SkeletonUtils.js";

let r = null, scene = null, cam = null, holder = null, raf = 0, spin = 0.5, last = 0, drag = null, auto = true, failed = false;
const view = { y: 1, dist: 4 }, GAP = matchMedia("(pointer: coarse)").matches ? 40 : 31;
function init() {
  if (r || failed) return !!r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { failed = true; return false; }
  r.setPixelRatio(Math.min(GAP > 31 ? 1.5 : 2, devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.domElement.className = "wpv-canvas"; r.domElement.setAttribute("aria-hidden", "true");
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x1a2a3a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3); sun.position.set(2, 4, 3); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x38e8ff, 1.1); rim.position.set(-3, 1.5, -2.5); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x2f86ff, transparent: true, opacity: 0.16, depthWrite: false })); floor.rotation.x = -Math.PI / 2; floor.name = "floor"; scene.add(floor);
  holder = new THREE.Group(); scene.add(holder);
  cam = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
  const cv = r.domElement;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, s: spin }; auto = false; cv.setPointerCapture(e.pointerId); e.stopPropagation(); });
  cv.addEventListener("pointermove", (e) => { if (drag) spin = drag.s + (e.clientX - drag.x) * 0.012; });
  const end = () => { drag = null; setTimeout(() => { if (!drag) auto = true; }, 2500); };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  return true;
}
function loop(t) {
  const cv = r.domElement;
  if (!cv.isConnected || !holder.children.length) { raf = 0; return; } // the panel closed or repainted
  raf = requestAnimationFrame(loop);
  if (t - last < GAP) return; /* a turning preview needs no more than 30 frames a second */
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  if (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  if (auto && !matchMedia("(prefers-reduced-motion: reduce)").matches) spin += dt * 0.6;
  holder.rotation.y = spin;
  cam.position.set(0, view.y + view.dist * 0.12, view.dist); cam.lookAt(0, view.y, 0);
  r.render(scene, cam);
}
/// show obj in container (an element sized by CSS). kind: "figure" stands on the floor, "item" floats and tilts
// a model made just for the preview (own) is freed when it is replaced; a figure shares its geometry with your character
const drop = (c) => { holder.remove(c); if (c.userData.own) c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); }); };
export function mount(container, obj, { kind = "figure", own = false } = {}) {
  if (!container || !obj || !init()) return false;
  holder.children.slice().forEach(drop);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const tall = Math.max(size.y, size.x * 0.8, size.z * 0.8, 0.1);
  const pivot = new THREE.Group(); obj.position.sub(c); pivot.add(obj);
  if (kind === "figure") { pivot.position.y = size.y / 2; view.y = size.y * 0.47; view.dist = tall * 2.15; }
  else { pivot.rotation.z = 0.5; pivot.position.y = tall * 0.6; view.y = tall * 0.6; view.dist = tall * 2.6; }
  scene.getObjectByName("floor").scale.setScalar(Math.max(size.x, size.z, 0.6) * 0.9);
  pivot.userData.own = own; holder.add(pivot); spin = 0.5; auto = true;
  container.appendChild(r.domElement);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  return true;
}
/// a still copy of a character as it stands right now (its gear included); sprites and the floating crown left out
export function figureOf(obj) {
  const c = SkeletonUtils.clone(obj); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
  c.traverse((o) => { if (o.isSprite || o.name === "crown") o.visible = false; });
  c.updateMatrixWorld(true); return c;
}
export function stop() { if (holder) holder.children.slice().forEach(drop); if (r && r.domElement.parentNode) r.domElement.remove(); }
