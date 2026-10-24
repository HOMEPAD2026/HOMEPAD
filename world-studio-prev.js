// world-studio-prev.js — ARCIRCLE Studio 3 (the owner's "스튜디오만 다 진행" 2026-10-24): the editor's live 3D preview. A small
// renderer of its own (its canvas moves into each paint of the editor, so it isn't remade), the level built from the
// spec as you change it — the track with its walls, gaps, lasers and coins flown along, or the arena with its drones —
// and a still of each theme for the theme cards. Nothing here is the game: no hero, no rules, just how it will look.
// makePreview({ THREE }) → { canvas, set(spec), snap(spec) → dataURL, stop(), dispose() } (null where WebGL can't start)
import { THEMES, LANES, genLevel, speedOf } from "./world-studio-gen.js";
import { level as ringLevel } from "./world-rings-engine.js";

export function makePreview({ THREE, w = 640, h = 300 }) {
  const canvas = document.createElement("canvas"); canvas.className = "wst-3d"; canvas.width = w; canvas.height = h;
  let R; try { R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "low-power" }); } catch { return null; }
  R.setPixelRatio(1); R.setSize(w, h, false); if ("outputColorSpace" in R) R.outputColorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(58, w / h, 0.1, 400);
  let scene = null, built = null, raf = 0, t0 = performance.now(), live = false;
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...o }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false });
  function free(sc) { if (sc) sc.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); }); }
  function build(spec) {
    const th = THEMES[spec.theme] || THEMES.neon, L = genLevel(spec), sc = new THREE.Scene();
    sc.background = new THREE.Color(th.sky); sc.fog = new THREE.Fog(th.fog, 30, 120);
    sc.add(new THREE.HemisphereLight(0xffffff, th.track, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(6, 14, -6); sc.add(sun);
    if (spec.tpl === "puzzle") { // (the Ring Puzzle: its board, rings with their gaps, slowly turning to show it off)
      const R = ringLevel(L.id), grp = new THREE.Group(); sc.add(grp); const COLS = [0x5fd3ff, 0x7cf5c8, 0xffd23a, 0xff6fae, 0xb48cff, 0xff9f2e];
      if (R) { const xs = R.rings.map((r) => r.x), ys = R.rings.map((r) => r.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        for (const r of R.rings) { const m = new THREE.Mesh(new THREE.TorusGeometry(r.r, 0.13, 10, 48, Math.PI * 2 - 0.9), std(COLS[r.c % 6], { emissive: COLS[r.c % 6], emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.3 })); m.position.set(r.x - cx, r.y - cy, 0); m.rotation.z = (r.g * Math.PI) / 4 + 0.45; grp.add(m);
          if (r.peg >= 0) { const pg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10), std(0xcfd8e3, { metalness: 0.9 })); const a = (r.peg * Math.PI) / 4; pg.rotation.x = Math.PI / 2; pg.position.set(r.x - cx + Math.cos(a) * r.r, r.y - cy + Math.sin(a) * r.r, 0); grp.add(pg); } }
        const back = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(...xs) - Math.min(...xs) + 6, Math.max(...ys) - Math.min(...ys) + 6), std(th.track, { roughness: 0.8 })); back.position.z = -0.4; grp.add(back); }
      const span = R ? Math.max(Math.max(...R.rings.map((r) => r.x)) - Math.min(...R.rings.map((r) => r.x)), Math.max(...R.rings.map((r) => r.y)) - Math.min(...R.rings.map((r) => r.y))) + 4 : 8;
      return { sc, tick(t) { grp.rotation.y = Math.sin(t * 0.5) * 0.35; cam.position.set(0, 0, span * 1.05 + 2); cam.lookAt(0, 0, 0); } };
    }
    if (spec.tpl === "arena") {
      const Rr = L.R, floor = new THREE.Mesh(new THREE.CylinderGeometry(Rr, Rr + 0.6, 0.6, 48), std(th.track, { roughness: 0.6 })); floor.position.y = -0.3; sc.add(floor);
      for (const [r, op] of [[Rr, 1], [Rr * 0.66, 0.5], [Rr * 0.33, 0.5]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 6, 72), glow(th.edge, op)); m.rotation.x = Math.PI / 2; m.position.y = 0.03; sc.add(m); }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, hh = 1.5 + (i % 3), p = new THREE.Mesh(new THREE.BoxGeometry(1, hh, 1), std(th.prop, { emissive: th.prop, emissiveIntensity: 0.35 })); p.position.set(Math.cos(a) * (Rr + 2.2), hh / 2 - 0.6, Math.sin(a) * (Rr + 2.2)); sc.add(p); }
      // the drones of the first waves, coming in from the edge on a loop; a laser sweep now and then
      const dG = new THREE.SphereGeometry(0.55, 14, 10), bG = new THREE.SphereGeometry(1.1, 16, 12), dM = std(th.wall, { emissive: th.wall, emissiveIntensity: 0.6 }), bM = std(0xffb02e, { emissive: 0xff7a1a, emissiveIntensity: 0.6 });
      const ws = L.waves.filter((x) => x.k !== "L").slice(0, 14).map((x) => { const m = new THREE.Mesh(x.k === "D" ? bG : dG, x.k === "D" ? bM : dM); sc.add(m); return { m, a: x.a, ph: x.t % 6 }; });
      const sweep = L.waves.some((x) => x.k === "L") ? new THREE.Mesh(new THREE.PlaneGeometry(Rr * 2, 0.5), glow(0xff3355, 0.5)) : null; if (sweep) { sweep.rotation.x = -Math.PI / 2; sweep.position.y = 0.06; sc.add(sweep); }
      const coins = L.coinsAt.slice(0, 10).map((c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8 })); m.rotation.x = Math.PI / 2; m.position.set(c.x, 0.9, c.z); sc.add(m); return m; });
      return { sc, tick(t) { const k = (t * (0.4 + spec.speed * 0.12)) % 6; for (const d of ws) { const f = ((t * (0.25 + spec.speed * 0.06) + d.ph / 6) % 1), r = (Rr + 1) * (1 - f); d.m.position.set(Math.cos(d.a) * r, 0.9, Math.sin(d.a) * r); } if (sweep) { sweep.rotation.z = t * 0.6; sweep.material.opacity = k < 1 ? 0.95 : 0.2; } coins.forEach((m, i) => { m.rotation.z = t * 3 + i; });
        cam.position.set(Math.sin(t * 0.15) * 4, 21, 15); cam.lookAt(0, 0, 0); } };
    }
    // the lanes: the track between the gaps, walls, lasers, coins, the finish; the camera flies along the first stretch
    const GAP = 4.6, W = 7.4, len = L.len, view = Math.min(len, 420), gaps = L.rows.filter((r) => r.k === "gap" && r.z < view + 60).map((r) => r.z);
    const trackM = std(th.track, { roughness: 0.6 }), edgeM = glow(th.edge); let z0 = -20;
    for (const [a, b] of [...gaps.map((g) => [g - GAP / 2, g + GAP / 2]), [view + 60, view + 60]]) { const l = a - z0; if (l > 0.5) { const m = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, l), trackM); m.position.set(0, -0.3, z0 + l / 2); sc.add(m); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, l), edgeM); e.position.set((s * W) / 2, 0.04, z0 + l / 2); sc.add(e); } } z0 = b; }
    const rows = L.rows.filter((r) => r.z < view + 60), walls = rows.filter((r) => r.k === "wall"), coinR = rows.filter((r) => r.k === "coin"), mt = new THREE.Matrix4();
    const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.7, 0.8), std(th.wall, { emissive: th.wall, emissiveIntensity: 0.45 }), Math.max(1, walls.length)); walls.forEach((x, i) => { mt.makeTranslation(LANES[x.lane], 0.85, x.z); wm.setMatrixAt(i, mt); }); wm.count = walls.length; sc.add(wm);
    for (const l of rows.filter((r) => r.k === "laser")) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, W, 8), glow(0xff3355)); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.25, l.z); sc.add(bar); }
    const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8 }), Math.max(1, coinR.length)); const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    coinR.forEach((c, i) => { mt.compose(pv.set(LANES[c.lane], 1.1, c.z), q, one); cm.setMatrixAt(i, mt); }); cm.count = coinR.length; sc.add(cm);
    const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(th.prop, { emissive: th.prop, emissiveIntensity: 0.35 }), 80); { let s0 = spec.seed, i = 0; const r = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647); for (let z = -20; i < 80; z += 12) for (const sd of [-1, 1]) { if (i >= 80) break; const hh = 2 + r() * 9; mt.compose(pv.set(sd * (W / 2 + 2.5 + r() * 4), hh / 2 - 0.6, z), new THREE.Quaternion(), new THREE.Vector3(1.2 + r(), hh, 1.2 + r())); pil.setMatrixAt(i++, mt); } } sc.add(pil);
    if (spec.tpl !== "dash" && len <= view + 40) { const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 10, 40, Math.PI), glow(th.edge)); arch.position.set(0, 0, len); sc.add(arch); }
    const v = Math.min(22, speedOf(spec)) * 0.8;
    return { sc, tick(t) { const z = (t * v) % Math.max(40, view - 20); cam.position.set(Math.sin(t * 0.7) * 1.4, 4.6, z - 8); cam.lookAt(0, 1, z + 12); } };
  }
  function frame() { raf = 0; if (!live || !built) return; if (!canvas.isConnected) { live = false; return; } built.tick((performance.now() - t0) / 1000); R.render(built.sc, cam); raf = requestAnimationFrame(frame); }
  function set(spec) { const old = built; built = build(spec); scene = built.sc; if (old) free(old.sc); live = true; if (!raf) raf = requestAnimationFrame(frame); }
  /// a still of a spec (the theme cards): built, drawn once, let go; the live view carries on after
  function snap(spec) { const b = build(spec); b.tick(1.6); R.render(b.sc, cam); const url = canvas.toDataURL("image/jpeg", 0.8); free(b.sc); if (built) R.render(built.sc, cam); return url; }
  function stop() { live = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function dispose() { stop(); if (built) free(built.sc); built = null; scene = null; try { R.dispose(); R.forceContextLoss && R.forceContextLoss(); } catch { /* gone */ } }
  return { canvas, set, snap, stop, dispose, scene: () => scene };
}
