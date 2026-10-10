// world-gate.js — the scene behind the home gate: the planet turning inside the ring halo, the robot waving
// from the plaza, every shop in place. Drag to look; "Game World" dives the camera down to the robot.
export async function start(canvas, { reduce = false } = {}) {
  const K = await import("./world-kit.js" + new URL(import.meta.url).search);
  const { THREE, R } = K;
  try { await document.fonts.load("700 92px Sora"); } catch { /* system font */ }
  const st = K.makeStage(canvas, { fog: 0.0016, bloom: 0.85, fov: 42 });
  const world = new THREE.Group(); st.scene.add(world);
  const planet = K.makePlanet(); world.add(planet);
  const halo = K.makeHalo(); world.add(halo);
  st.scene.add(K.makeStars());
  const spins = [];
  const shops = K.SHOPS.map((s) => { const b = K.makeShop(s); K.placeOn(b, K.dirOf(s.theta, s.phi)); planet.add(b); spins.push(...b.userData.spin); return b; });
  planet.add(K.makePaths());
  const portal = K.makePortal(); K.placeOn(portal, K.dirOf(K.PORTAL.theta, K.PORTAL.phi)); planet.add(portal); spins.push(...portal.userData.spin);
  K.SCAMMERS.forEach((s) => { const m = K.makeScammer(s); K.placeOn(m, K.dirOf(s.theta, s.phi)); planet.add(m); spins.push(...m.userData.spin); });
  const robot = K.makeRobot(); K.placeOn(robot, new THREE.Vector3(0, 1, 0)); robot.scale.setScalar(1.6); planet.add(robot);
  world.rotation.set(0.18, 0, -0.1);
  st.scene.background = null; st.scene.add(K.makeSky());
  // the Quaternius models arrive a moment later: props around the shops and an Eye Drone circling the world
  const mixers = [];
  let drone = null;
  K.loadKit(new URL(import.meta.url).search).then((kit) => {
    shops.forEach((b) => K.decorate(b, kit));
    const e = K.enemy(kit, "EyeDrone"); if (!e) return;
    drone = new THREE.Group(); e.obj.scale.setScalar(2.2); drone.add(e.obj); world.add(drone); e.play("Idle"); mixers.push(e.mixer);
  }).catch(() => { /* the planet is enough */ });

  // camera orbits slowly; dragging adds to it
  const cam = st.camera;
  let yaw = 0.6, pitch = 0.62, dist = 108, vyaw = 0, drag = null, auto = reduce ? 0 : 0.05;
  const narrow = () => innerWidth < 700;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    vyaw = (e.clientX - drag.x) * -0.004; pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * 0.003, -0.2, 1.1);
    yaw += vyaw; drag = { x: e.clientX, y: e.clientY };
  });
  const up = () => { drag = null; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  let diving = null;
  const lookY = () => (narrow() ? -22 : -9);
  const look = new THREE.Vector3(0, lookY(), 0);
  st.on((dt, t) => {
    spins.forEach((f) => f(dt, t));
    K.animateRobot(robot, dt, t, 0, 0); K.waveRobot(robot, t);
    halo.rotation.y = t * 0.035; halo.rotation.z = Math.sin(t * 0.2) * 0.05;
    mixers.forEach((m) => m.update(dt));
    if (drone) { const a = t * 0.32; drone.position.set(Math.cos(a) * (R + 9), 9 + Math.sin(t * 0.9) * 2, Math.sin(a) * (R + 9)); drone.lookAt(Math.cos(a + 0.3) * (R + 9), 9, Math.sin(a + 0.3) * (R + 9)); }
    if (!diving) {
      if (!drag) { yaw += auto * dt + vyaw; vyaw *= 0.92; }
      const d = narrow() ? dist * 1.45 : dist;
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d + (narrow() ? 18 : 6), Math.cos(yaw) * Math.cos(pitch) * d);
      look.y = THREE.MathUtils.lerp(look.y, lookY(), 0.1);
      cam.lookAt(look);
    } else {
      const k = Math.min(1, (performance.now() - diving.t0) / diving.ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const target = robot.getWorldPosition(new THREE.Vector3());
      const end = target.clone().add(target.clone().normalize().multiplyScalar(6)).add(new THREE.Vector3(0, 1.5, 0));
      cam.position.lerpVectors(diving.from, end, e);
      look.lerpVectors(diving.look, target, e);
      cam.lookAt(look);
      if (k >= 1 && diving.done) { const d = diving.done; diving.done = null; d(); }
    }
  });
  return {
    dive() { return new Promise((res) => { diving = { t0: performance.now(), ms: 1100, from: cam.position.clone(), look: look.clone(), done: res }; }); },
    dispose: st.dispose,
  };
}
