// world-race.js — the hoverboard race around the plaza: start at the race pad, fly through eight rings in order and back
// to the pad. The week's best times rank in Rankings → Race (api/_world-social.mjs). A time is reported by the browser,
// so it only ranks: there is no reward for it.
//
// ctx: { THREE, K, planet, T, esc, here(v), blocked(v), boarding(), setBoard(on), inHub(), post, sess, toast, Snd,
//        reduce, onTop(top) }
export const RACE_RINGS = 8;

export function createRace(ctx) {
  const { THREE, planet, T } = ctx;
  const root = new THREE.Group(); root.name = "race"; planet.add(root);
  const $ = (id) => document.getElementById(id);

  // the course: a loop around the plaza, each ring moved in or out until it's clear of the halls and the arches
  const pts = [];
  for (let i = 0; i < RACE_RINGS; i++) {
    const a = (i / RACE_RINGS) * Math.PI * 2 + 0.35;
    let p = null;
    for (const r of [21, 24, 18, 27, 16, 30]) { const v = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r); if (!ctx.blocked(v)) { p = v; break; } }
    pts.push(p || new THREE.Vector3(Math.sin(a) * 21, 0, Math.cos(a) * 21));
  }
  // the pad: between the last ring and the first, on the loop
  const padAt = pts[RACE_RINGS - 1].clone().lerp(pts[0], 0.5);
  const glowMat = (c, o = 0.9) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.8), transparent: true, opacity: o, depthWrite: false });
  const pad = new THREE.Group(); pad.name = "race-pad"; pad.position.copy(padAt); pad.userData.radius = 1.4;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.75, 0.16, 40), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.35 })); disc.position.y = 0.08;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.06, 6, 48), glowMat(0x2f86ff)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.18;
  const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0xc9d3de })); flag.position.set(1.3, 1.3, 0);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: checker(), side: THREE.DoubleSide })); banner.position.set(1.75, 2.25, 0);
  pad.add(disc, rim, flag, banner);
  const sign = ctx.K.label(T("Hoverboard race"), { accent: "#2f86ff", size: 0.5 }); sign.position.y = 3.2; pad.add(sign);
  root.add(pad);
  function checker() {
    const c = document.createElement("canvas"); c.width = 64; c.height = 40; const g = c.getContext("2d");
    for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? "#0a1220" : "#f3f7fb"; g.fillRect(x * 8, y * 8, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // the rings: upright, facing along the loop; the next one gold, the rest faint blue
  const ringGeo = new THREE.TorusGeometry(2.1, 0.13, 8, 40);
  const rings = pts.map((p, i) => {
    const m = new THREE.Mesh(ringGeo, glowMat(0x38e8ff, 0.35));
    const nx = pts[(i + 1) % RACE_RINGS], pv = pts[(i + RACE_RINGS - 1) % RACE_RINGS];
    m.position.set(p.x, 2.3, p.z); m.rotation.y = Math.atan2(nx.x - pv.x, nx.z - pv.z); // the ring faces along the loop
    m.visible = false; root.add(m); return m;
  });

  // the HUD line while racing
  const hud = document.createElement("div"); hud.className = "wp-race"; hud.hidden = true; hud.setAttribute("role", "status"); hud.setAttribute("data-no-i18n", "");
  document.body.appendChild(hud);
  let state = "idle", t0 = 0, next = 0, count = 0, best = null, tick = 0;
  const fmt = (ms) => { const s = ms / 1000; return Math.floor(s / 60) + ":" + (s % 60).toFixed(1).padStart(4, "0"); };
  const tmp = new THREE.Vector3();
  function paintRings() {
    rings.forEach((m, i) => {
      const on = state === "go" && (i === next || i === next + 1);
      m.visible = state === "go" && i >= next - 0;
      m.material.color.set(i === next ? 0xffc861 : 0x38e8ff).multiplyScalar(1.8);
      m.material.opacity = i === next ? 0.95 : on ? 0.5 : 0.25;
    });
  }
  function start() {
    if (!ctx.inHub() || state !== "idle") return;
    if (!ctx.boarding()) ctx.setBoard(true);
    state = "count"; count = 3; next = 0; hud.hidden = false; tick = performance.now();
    hud.innerHTML = `<b>3</b>`; (ctx.Snd.tick || ctx.Snd.pick || (() => {}))();
    rings.forEach((m) => (m.visible = true)); paintRings();
  }
  function stop(why) {
    if (state === "idle") return;
    state = "idle"; hud.hidden = true; rings.forEach((m) => (m.visible = false));
    if (why) ctx.toast(why);
  }
  async function finish() {
    const ms = Math.round(performance.now() - t0);
    state = "idle"; rings.forEach((m) => (m.visible = false));
    const pb = best == null || ms < best; if (pb) best = ms;
    hud.innerHTML = `<span>${ctx.esc(T("Finish"))}</span><b>${fmt(ms)}</b>${pb ? `<em>${ctx.esc(T("Your best"))}</em>` : ""}`;
    hud.classList.add("done"); setTimeout(() => { hud.classList.remove("done"); if (state === "idle") hud.hidden = true; }, 3800);
    ctx.Snd.win && ctx.Snd.win();
    const s = ctx.sess();
    if (!s) { ctx.toast(T("Sign in with your wallet to put your time in the week's race ranking")); return; }
    const r = await ctx.post({ action: "world-race", ...s, ms }).catch(() => ({ ok: false, j: {} }));
    if (r.ok) { if (r.j.best) best = r.j.best; ctx.onTop && ctx.onTop(r.j.top || []); }
  }
  function update() {
    if (state === "idle") return;
    if (!ctx.inHub()) { stop(T("Race stopped")); return; }
    const now = performance.now();
    if (state === "count") {
      if (now - tick >= 1000) { tick = now; count--; if (count > 0) { hud.innerHTML = `<b>${count}</b>`; (ctx.Snd.tick || ctx.Snd.pick || (() => {}))(); } else { state = "go"; t0 = now; ctx.Snd.dash && ctx.Snd.dash(); paintRings(); } }
      return;
    }
    if (!ctx.boarding()) { stop(T("Race stopped: the hoverboard is off")); return; }
    ctx.here(tmp);
    const goal = next < RACE_RINGS ? pts[next] : padAt;
    if (Math.hypot(tmp.x - goal.x, tmp.z - goal.z) < (next < RACE_RINGS ? 3.2 : 2.2)) {
      next++; ctx.Snd.pick && ctx.Snd.pick();
      if (next > RACE_RINGS) { finish(); return; }
      paintRings();
    }
    hud.innerHTML = `<span>${ctx.esc(T("Race"))}</span><b>${fmt(now - t0)}</b><i>${next < RACE_RINGS ? `${next} / ${RACE_RINGS}` : ctx.esc(T("Back to the pad"))}</i>`;
    if (now - t0 > 600e3) stop(T("Race stopped"));
  }
  // where to point next (the minimap marks it)
  const target = () => (state === "go" ? (next < RACE_RINGS ? rings[next] : pad) : null);
  const spin = (dt) => { rim.rotation.z += dt * 0.6; rings.forEach((m, i) => { if (m.visible && i === next) m.rotation.z += dt * 1.5; }); };
  return { pad, start, stop, update, spin, target, racing: () => state !== "idle", best: () => best, points: () => pts.map((p) => [p.x, p.z]) };
}
